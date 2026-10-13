/**
 * 微信小程序主包体积核算（WBS-P0-23）
 *
 * 纯函数 + 只读磁盘扫描。阈值作用于整个主包（ROADMAP P0-1.2）：
 *  - ≤1.5MB ok；>1.5MB 预警（FDT-WEAPP-BUNDLE-WARN，不阻断）
 *  - >2MB 阻断（FDT-WEAPP-BUNDLE-EXCEEDED，CLI 退出码 2，CI 可识别）
 *  - 仅在"全主包口径"（projectRoot 含可解析 app.json）下阈值生效；
 *    裸输出目录只报告自身字节并标注"非全主包"，绝不假装核算了整包。
 *  - subpackages 建议只推荐外移资源文件（图片等），不建议外移代码
 *    （.js/.wxml/.wxss/.json/.wxs 属于主包页面，移走会破坏引用）。
 *
 * @module
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const MB = 1024 * 1024;
export const WARN_BYTES = Math.round(1.5 * MB);
export const BLOCK_BYTES = 2 * MB;

export const BUNDLE_WARN_CODE = 'FDT-WEAPP-BUNDLE-WARN';
export const BUNDLE_EXCEEDED_CODE = 'FDT-WEAPP-BUNDLE-EXCEEDED';
export const APPJSON_INVALID_CODE = 'FDT-WEAPP-APPJSON-INVALID';

export type BundleStatus = 'ok' | 'warn' | 'blocked' | 'error';

export interface BundleFileInput {
  /** 相对项目/输出根的 POSIX 风格路径 */
  path: string;
  bytes: number;
  /** 是否计入主包（分包文件为 false） */
  inMainPackage: boolean;
  /** 所属分包 root（分包文件） */
  subPackage?: string;
}

export interface BundleWarning {
  code: string;
  message: string;
}

export interface SubpackageSuggestion {
  /** 建议外移的主包资源路径 */
  path: string;
  bytes: number;
  /** 建议落点分包 root（首个建议分包名） */
  suggestedRoot: string;
}

export interface MeasureInput {
  /** 工程根（含 app.json 才是全主包口径）；与 files 二选一或并存 */
  projectRoot?: string;
  /** 直接给定文件清单（测试/无盘场景）；提供 projectRoot 时忽略此项 */
  files?: BundleFileInput[];
  /** 内联 files 场景显式声明按全主包口径核算（阈值生效）；默认 false（非全主包） */
  assumeFullProject?: boolean;
}

export interface BundleReport {
  status: BundleStatus;
  blocked: boolean;
  exitCode: 0 | 2;
  errorCode?: string;
  /** 是否全主包口径（存在可解析 app.json） */
  isFullProject: boolean;
  /** 口径提示（非全主包时非空） */
  scopeWarning: string;
  totalBytes: number;
  /** 各分包字节合计 */
  subPackageBytes: Record<string, number>;
  /** 计入主包的文件明细 */
  files: Array<{ path: string; bytes: number }>;
  warnings: BundleWarning[];
  /** 外移分包建议（超预警线时生成） */
  subpackageSuggestions: SubpackageSuggestion[];
}

/** 不参与小程序包体的目录/文件 */
const EXCLUDE_DIRS = new Set(['node_modules', '.git', 'miniprogram_npm']);
/** 不外移的代码类扩展名（属主包页面，移走破坏引用） */
const CODE_EXT_RE = /\.(js|wxml|wxss|json|wxs)$/i;

function toPosix(p: string): string {
  return p.split(sep).join('/');
}

interface AppJsonModel {
  pages: string[];
  subPackages: Array<{ root: string; pages: string[] }>;
}

function parseAppJson(projectRoot: string): AppJsonModel | { invalid: true } {
  const appJsonPath = join(projectRoot, 'app.json');
  try {
    const raw = readFileSync(appJsonPath, 'utf8');
    const json = JSON.parse(raw) as {
      pages?: string[];
      subpackages?: Array<{ root: string; pages: string[] }>;
      subPackages?: Array<{ root: string; pages: string[] }>;
    };
    return {
      pages: Array.isArray(json.pages) ? json.pages : [],
      subPackages: json.subPackages ?? json.subpackages ?? [],
    };
  } catch {
    return { invalid: true };
  }
}

/** 递归列出目录内所有文件（相对路径 + 字节），排除依赖目录 */
function walk(dir: string, base: string): Array<{ rel: string; bytes: number }> {
  const out: Array<{ rel: string; bytes: number }> = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      out.push(...walk(join(dir, entry.name), base));
    } else if (entry.isFile()) {
      const abs = join(dir, entry.name);
      out.push({ rel: toPosix(relative(base, abs)), bytes: statSync(abs).size });
    }
  }
  return out;
}

function classifyFiles(
  walked: Array<{ rel: string; bytes: number }>,
  subRoots: string[],
): BundleFileInput[] {
  return walked.map(({ rel, bytes }) => {
    const hit = subRoots.find((root) => rel === root || rel.startsWith(`${root}/`));
    if (hit) {
      return { path: rel, bytes, inMainPackage: false, subPackage: hit };
    }
    return { path: rel, bytes, inMainPackage: true };
  });
}

/** 贪心：把最大的可外移资源逐个建议外移，直到主包压回预警线以下 */
function buildSubpackageSuggestions(
  mainFiles: Array<{ path: string; bytes: number }>,
  excessBytes: number,
  existingSubRoots: string[],
): SubpackageSuggestion[] {
  if (excessBytes <= 0) return [];
  const suggestedRoot = existingSubRoots[0] ?? 'pkgAssets';
  const movable = mainFiles
    .filter((f) => !CODE_EXT_RE.test(f.path))
    .sort((a, b) => b.bytes - a.bytes);
  const suggestions: SubpackageSuggestion[] = [];
  let moved = 0;
  for (const f of movable) {
    if (moved >= excessBytes) break;
    suggestions.push({ path: f.path, bytes: f.bytes, suggestedRoot });
    moved += f.bytes;
  }
  return suggestions;
}

function buildReport(
  files: BundleFileInput[],
  isFullProject: boolean,
  parseWarning?: BundleWarning,
): BundleReport {
  const warnings: BundleWarning[] = [];
  if (parseWarning) warnings.push(parseWarning);

  const mainFiles = files.filter((f) => f.inMainPackage);
  const totalBytes = mainFiles.reduce((s, f) => s + f.bytes, 0);

  const subPackageBytes: Record<string, number> = {};
  for (const f of files) {
    if (!f.inMainPackage && f.subPackage) {
      subPackageBytes[f.subPackage] = (subPackageBytes[f.subPackage] ?? 0) + f.bytes;
    }
  }

  const scopeWarning = isFullProject
    ? ''
    : '非全主包口径：未提供含 app.json 的工程根，仅统计本次产物自身字节，包体积阈值不生效';

  let status: BundleStatus = 'ok';
  let blocked = false;
  let exitCode: 0 | 2 = 0;
  let errorCode: string | undefined;

  // 阈值仅在全主包口径生效
  if (isFullProject) {
    if (totalBytes > BLOCK_BYTES) {
      status = 'blocked';
      blocked = true;
      exitCode = 2;
      errorCode = BUNDLE_EXCEEDED_CODE;
      warnings.push({
        code: BUNDLE_EXCEEDED_CODE,
        message: `主包体积 ${totalBytes} 字节（${(totalBytes / MB).toFixed(2)}MB）超过 2MB 上限，请按建议拆分分包`,
      });
    } else if (totalBytes > WARN_BYTES) {
      status = 'warn';
      warnings.push({
        code: BUNDLE_WARN_CODE,
        message: `主包体积 ${totalBytes} 字节（${(totalBytes / MB).toFixed(2)}MB）超过 1.5MB 预警线`,
      });
    }
  }

  if (parseWarning) status = 'error';

  const excessBytes = totalBytes - WARN_BYTES;
  const subRoots = Object.keys(subPackageBytes);
  const subpackageSuggestions =
    isFullProject && excessBytes > 0
      ? buildSubpackageSuggestions(mainFiles, excessBytes, subRoots)
      : [];

  return {
    status,
    blocked,
    exitCode,
    errorCode,
    isFullProject,
    scopeWarning,
    totalBytes,
    subPackageBytes,
    files: mainFiles.map((f) => ({ path: f.path, bytes: f.bytes })),
    warnings,
    subpackageSuggestions,
  };
}

/**
 * 核算主包体积。
 * - 提供 projectRoot：读 app.json（决定全主包/分包归属）后递归扫描；
 *   app.json 损坏返回 error 报告；无 app.json 退化为非全主包口径。
 * - 否则用 files 内联输入（非全主包口径，阈值不生效）。
 */
export function measureMainPackage(input: MeasureInput): BundleReport {
  if (input.projectRoot && existsSync(join(input.projectRoot, 'app.json'))) {
    const model = parseAppJson(input.projectRoot);
    if ('invalid' in model) {
      return buildReport([], false, {
        code: APPJSON_INVALID_CODE,
        message: `app.json 无法解析：${join(input.projectRoot, 'app.json')}`,
      });
    }
    const subRoots = model.subPackages.map((s) => toPosix(s.root.replace(/\/+$/, '')));
    const walked = walk(input.projectRoot, input.projectRoot).filter(
      // app.json 是工程配置清单（非页面/资源产物），约定不计入主包阈值口径
      (f) => f.rel !== 'app.json',
    );
    return buildReport(classifyFiles(walked, subRoots), true);
  }

  if (input.projectRoot) {
    // 提供了工程根但无 app.json：扫描目录全部文件（视为主包），但按非全主包口径处理
    const walked = walk(input.projectRoot, input.projectRoot);
    return buildReport(
      walked.map((f) => ({ path: f.rel, bytes: f.bytes, inMainPackage: true })),
      false,
    );
  }

  const files = input.files ?? [];
  return buildReport(files, input.assumeFullProject === true);
}
