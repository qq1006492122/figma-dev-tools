/**
 * 构建器检测器 - Bundler Detector（v1.4.18 新增，T4）
 *
 * 依据目标项目的 package.json 依赖与根目录配置文件，识别前端构建器/框架类型，
 * 供资产下载落位与代码生成的资源引用渲染使用：
 *
 * - `nextjs` ：Next.js（资源落 `public/`，引用绝对路径）
 * - `remix`  ：Remix（资源落 `public/`，引用绝对路径）
 * - `vite`   ：Vite（资源落 `src/assets/`，ESM import 引用）
 * - `webpack`：Webpack / vue-cli / CRA（资源落 `src/assets/`，require 引用）
 * - `none`   ：无法识别（维持 1.4.17 的 publicCdnUrl 行为）
 *
 * 检测优先级（确定性，多者共存时取前者）：
 * `nextjs > remix > vite > webpack > none`
 *
 * 设计约束：
 * - 纯 I/O 经接缝注入，默认实现仅读不写，单元测试零磁盘访问；
 * - package.json 损坏时不抛异常，降级为配置文件探测。
 *
 * @module
 */

// ============ 依赖导入 ============

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// ============ 类型定义 ============

/**
 * 构建器/框架识别结果联合类型
 */
export type BundlerKind = 'vite' | 'webpack' | 'nextjs' | 'remix' | 'none';

/**
 * 检测结果
 */
export interface DetectedBundler {
  /** 识别到的构建器 */
  kind: BundlerKind;
  /** 判定依据（人类可读，用于报告与调试） */
  reason: string;
}

/**
 * 文件系统接缝（仅供单元测试注入内存文件系统，生产路径使用默认实现）
 */
export interface BundlerDetectorSeams {
  /** 读取 UTF-8 文本文件；文件不存在时返回 undefined */
  readTextFile?: (absPath: string) => Promise<string | undefined>;
  /** 判断路径是否存在（文件或目录均可） */
  pathExists?: (absPath: string) => Promise<boolean>;
}

// ============ 常量 ============

/**
 * package.json 中按优先级排列的依赖键 → 构建器映射
 */
const DEPENDENCY_MARKERS: ReadonlyArray<{ readonly dep: string; readonly kind: Exclude<BundlerKind, 'none'> }> = [
  { dep: 'next', kind: 'nextjs' },
  { dep: '@remix-run/react', kind: 'remix' },
  { dep: 'vite', kind: 'vite' },
  { dep: 'webpack', kind: 'webpack' },
];

/**
 * 配置文件名标记（按优先级排列；元框架配置先于普通构建器）
 */
const CONFIG_FILE_MARKERS: ReadonlyArray<{ readonly file: string; readonly kind: Exclude<BundlerKind, 'none'>; readonly reason: string }> = [
  { file: 'remix.config.js', kind: 'remix', reason: 'remix.config.js exists' },
  { file: 'remix.config.mjs', kind: 'remix', reason: 'remix.config.mjs exists' },
  { file: 'remix.config.ts', kind: 'remix', reason: 'remix.config.ts exists' },
  { file: 'vite.config.ts', kind: 'vite', reason: 'vite.config.ts exists' },
  { file: 'vite.config.js', kind: 'vite', reason: 'vite.config.js exists' },
  { file: 'vite.config.mjs', kind: 'vite', reason: 'vite.config.mjs exists' },
  { file: 'vite.config.mts', kind: 'vite', reason: 'vite.config.mts exists' },
  { file: 'vite.config.cjs', kind: 'vite', reason: 'vite.config.cjs exists' },
  { file: 'webpack.config.js', kind: 'webpack', reason: 'webpack.config.js exists' },
  { file: 'webpack.config.cjs', kind: 'webpack', reason: 'webpack.config.cjs exists' },
  { file: 'webpack.config.mjs', kind: 'webpack', reason: 'webpack.config.mjs exists' },
  { file: 'webpack.config.ts', kind: 'webpack', reason: 'webpack.config.ts exists' },
];

/**
 * 检测优先级权重：数值越小优先级越高
 */
const KIND_PRIORITY: Record<Exclude<BundlerKind, 'none'>, number> = {
  nextjs: 0,
  remix: 1,
  vite: 2,
  webpack: 3,
};

// ============ 默认文件系统实现 ============

/**
 * 默认文本读取实现：文件不存在返回 undefined，其余读取错误向上抛出
 */
async function defaultReadTextFile(absPath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(absPath, 'utf-8');
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw err;
  }
}

/**
 * 默认存在性检查实现
 */
async function defaultPathExists(absPath: string): Promise<boolean> {
  try {
    await fs.access(absPath);
    return true;
  } catch {
    return false;
  }
}

// ============ 检测主逻辑 ============

/**
 * 从 package.json 文本提取三类依赖的并集键集合；损坏 JSON 返回 null
 */
function extractDependencyKeys(packageJsonText: string): Set<string> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(packageJsonText);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  const keys = new Set<string>();
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
    const section = record[field];
    if (typeof section === 'object' && section !== null) {
      for (const depName of Object.keys(section as Record<string, unknown>)) {
        keys.add(depName);
      }
    }
  }
  return keys;
}

/**
 * 检测目标项目使用的前端构建器/框架
 *
 * @param projectRoot - 项目根目录绝对路径
 * @param seams - 可选文件系统接缝（测试注入）
 * @returns 检测结果（含 kind 与人类可读 reason）；任何异常情况下尽力降级，绝不返回 reject
 */
export async function detectBundler(
  projectRoot: string,
  seams: BundlerDetectorSeams = {},
): Promise<DetectedBundler> {
  const readTextFile = seams.readTextFile ?? defaultReadTextFile;
  const pathExists = seams.pathExists ?? defaultPathExists;

  /** 所有候选命中结果（依赖 + 配置文件），最终取优先级最高者 */
  const candidates: Array<{ kind: Exclude<BundlerKind, 'none'>; reason: string }> = [];

  // ============ 1. package.json 依赖检测 ============
  const pkgPath = path.join(projectRoot, 'package.json');
  const pkgText = await readTextFile(pkgPath);
  if (pkgText !== undefined) {
    const depKeys = extractDependencyKeys(pkgText);
    if (depKeys !== null) {
      for (const marker of DEPENDENCY_MARKERS) {
        if (depKeys.has(marker.dep)) {
          candidates.push({ kind: marker.kind, reason: `package.json dependency "${marker.dep}"` });
        }
      }
    }
    // 损坏 JSON：静默降级到配置文件检测（不记录候选，也不抛错）
  }

  // ============ 2. 根目录配置文件检测 ============
  for (const marker of CONFIG_FILE_MARKERS) {
    const configPath = path.join(projectRoot, marker.file);
    if (await pathExists(configPath)) {
      candidates.push({ kind: marker.kind, reason: marker.reason });
    }
  }

  // ============ 3. 按确定性优先级裁决 ============
  if (candidates.length === 0) {
    return { kind: 'none', reason: 'no known bundler signal (package.json/config files) detected' };
  }

  // candidates 非空（length === 0 已在上方返回），reduce 无初始值在非空数组上安全
  return candidates.reduce((winner, candidate) =>
    KIND_PRIORITY[candidate.kind] < KIND_PRIORITY[winner.kind] ? candidate : winner,
  );
}
