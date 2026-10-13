/**
 * 组件库 auto 检测的项目侧 I/O（WBS-P2-12/13）
 *
 * {@link resolveLibrary} 本身零 I/O、依赖调用方注入证据；本模块封装 CLI/MCP
 * （Node 侧）读取证据的默认实现：
 *
 * - 从起始目录向上查找最近的 package.json，解析三类依赖（deps/devDeps/peerDeps）；
 * - 探测 shadcn/ui 约定组件目录（components/ui 或 src/components/ui，
 *   存在 components.json 时优先按其 aliases 解析），产出 uiComponentExists 谓词。
 *
 * 纯磁盘只读；与 bundler-detector 一致提供 seams 供单测注入内存文件系统，
 * package.json/components.json 损坏或不存在时静默降级为 null/false，绝不抛错。
 *
 * @module services/component-library/project-discovery
 */

import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { DetectHooks, PackageJsonLike } from './detect-library.js';
import type { ComponentLibraryChoice } from './types.js';

/**
 * 从最近的 `figma-dev.config.json`（GUI 配置向导写入）读取组件库偏好。
 * 作为 CLI/MCP 未显式传参时的默认值；文件缺失/损坏/值非法均静默返回 null
 * （调用方回退 none；显式参数的严格校验仍在 resolveLibrary 执行）。
 */
const COMPONENT_LIBRARY_VALUES: readonly string[] = [
  'auto',
  'none',
  'shadcn-ui',
  'ant-design',
  'element-plus',
  'ant-design-vue',
];

/**
 * 从起始目录向上查找指定文件名（上限 10 层），返回首个命中的绝对路径。
 * 任何 I/O 异常（含权限错误）均保守视为未命中，绝不阻断生成链路。
 */
async function findFileUpwards(startDir: string, fileName: string): Promise<string | null> {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, fileName);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // 未命中或不可读：继续向上
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export async function loadProjectComponentLibrary(startDir: string): Promise<ComponentLibraryChoice | null> {
  const configPath = await findFileUpwards(startDir, 'figma-dev.config.json');
  if (!configPath) return null;
  try {
    const parsed = JSON.parse(await fs.readFile(configPath, 'utf-8')) as { componentLibrary?: unknown };
    const value = parsed.componentLibrary;
    if (typeof value === 'string' && COMPONENT_LIBRARY_VALUES.includes(value)) {
      return value as ComponentLibraryChoice;
    }
    return null;
  } catch {
    return null;
  }
}

/** 文件系统接缝（仅供单元测试注入） */
export interface ProjectDiscoverySeams {
  /** 读取 UTF-8 文本文件；文件不存在时返回 undefined */
  readTextFile?: (absPath: string) => Promise<string | undefined>;
  /** 同步判断文件是否存在（shadcn 组件探测谓词使用） */
  existsSync?: (absPath: string) => boolean;
}

/** auto 检测需要的全部项目证据 */
export interface ProjectLibraryHints {
  /** 最近的 package.json 依赖视图；未找到/损坏为 null */
  readonly pkg: PackageJsonLike | null;
  /** shadcn/ui 组件存在性谓词（始终提供，未接入时恒 false） */
  readonly uiComponentExists: NonNullable<DetectHooks['uiComponentExists']>;
}

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

/** 从起始目录向上查找最近的 package.json（上限 10 层），返回其目录与解析结果 */
async function findNearestPackageJson(
  startDir: string,
  readTextFile: (p: string) => Promise<string | undefined>,
): Promise<{ root: string; pkg: PackageJsonLike | null } | null> {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 10; i++) {
    const text = await readTextFile(path.join(dir, 'package.json'));
    if (text !== undefined) {
      try {
        const parsed = JSON.parse(text) as PackageJsonLike;
        return { root: dir, pkg: parsed && typeof parsed === 'object' ? parsed : null };
      } catch {
        return { root: dir, pkg: null };
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * 解析 shadcn components.json 的 ui 组件目录候选（相对项目根）。
 * 兼容新版 aliases.ui/components（@/components/ui）与旧版 resolvedPaths。
 */
function shadcnUiDirsFromConfig(configText: string): string[] {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(configText) as Record<string, unknown>;
  } catch {
    return [];
  }
  const rawDirs: string[] = [];
  const aliases = parsed.aliases as Record<string, string> | undefined;
  if (aliases?.ui) rawDirs.push(aliases.ui);
  else if (aliases?.components) rawDirs.push(`${aliases.components}/ui`);
  const resolved = parsed.resolvedPaths as Record<string, string> | undefined;
  if (resolved?.ui) rawDirs.push(resolved.ui);

  const dirs: string[] = [];
  for (const raw of rawDirs) {
    // @/ 别名在默认脚手架里映射 src/，同时兜底根目录布局
    const rel = raw.replace(/^@\//, '');
    dirs.push(path.join('src', rel), rel);
  }
  return dirs;
}

/**
 * 收集 shadcn ui 组件文件的全部候选绝对路径（tsx/jsx 两种扩展名）。
 */
function uiComponentCandidates(root: string, uiDirs: readonly string[], component: string): string[] {
  const baseDirs = uiDirs.length > 0 ? uiDirs : [path.join('src', 'components', 'ui'), path.join('components', 'ui')];
  const out: string[] = [];
  for (const dir of baseDirs) {
    for (const ext of ['.tsx', '.jsx']) {
      out.push(path.resolve(root, dir, `${component}${ext}`));
    }
  }
  return out;
}

/**
 * 加载组件库 auto 检测所需的项目证据。
 *
 * @param startDir - 查找起点（通常为输出文件所在目录或 cwd）
 * @param seams - 可选文件系统接缝
 */
export async function loadProjectLibraryHints(
  startDir: string = process.cwd(),
  seams: ProjectDiscoverySeams = {},
): Promise<ProjectLibraryHints> {
  const readTextFile = seams.readTextFile ?? defaultReadTextFile;
  const fileExists = seams.existsSync ?? existsSync;
  const found = await findNearestPackageJson(startDir, readTextFile);
  if (!found) {
    return { pkg: null, uiComponentExists: () => false };
  }

  // components.json 存在时按其 aliases 定位 ui 目录；不存在走两个约定目录
  let uiDirs: string[] = [];
  const configText = await readTextFile(path.join(found.root, 'components.json'));
  if (configText !== undefined) uiDirs = shadcnUiDirsFromConfig(configText);

  const uiComponentExists = (component: string): boolean => {
    // 谓词由 detectReactLibrary 在单次生成内同步调用，候选数为个位数，sync fs 成本可忽略
    return uiComponentCandidates(found.root, uiDirs, component).some((candidate) => {
      try {
        return fileExists(candidate);
      } catch {
        return false;
      }
    });
  };

  return { pkg: found.pkg, uiComponentExists };
}
