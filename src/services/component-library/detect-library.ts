/**
 * 组件库自动检测（WBS-P2-11/12/13）
 *
 * `componentLibrary: 'auto'` 时从最近 package.json 的真实依赖判定可用库：
 * - 必须看到真实依赖才命中，禁止按项目名/目录名猜测（ROADMAP 硬约束）；
 * - shadcn-ui 不在 package.json 中发版，按其组件目录约定 `@/components/ui/*`
 *   存在性检测（需要文件系统访问，由调用方传入 uiDirExists 谓词，保持本模块零 I/O）。
 *
 * @module services/component-library/detect-library
 */

import type { ComponentLibraryId, ReactComponentLibrary, VueComponentLibrary } from './types.js';
import { COMPONENT_LIBRARIES } from './registry.js';

/** package.json 中与组件库判定相关的最小字段集 */
export interface PackageJsonLike {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
}

/** auto 检测的注入依赖（零 I/O，便于单测） */
export interface DetectHooks {
  /**
   * shadcn/ui 组件目录是否存在约定文件（如 components/ui/button.tsx）。
   * 接收相对/绝对项目根的组件名，返回该组件文件是否存在。
   */
  uiComponentExists?: (component: string) => boolean;
}

/** React auto 优先级（antd 与 shadcn 同时存在时先 shadcn——新项目默认推荐） */
const REACT_PRIORITY: readonly ReactComponentLibrary[] = ['shadcn-ui', 'ant-design'];
/** Vue auto 优先级 */
const VUE_PRIORITY: readonly VueComponentLibrary[] = ['element-plus', 'ant-design-vue'];

function hasDep(pkg: PackageJsonLike, name: string): boolean {
  return !!(
    pkg.dependencies?.[name] ||
    pkg.devDependencies?.[name] ||
    pkg.peerDependencies?.[name]
  );
}

/**
 * 从 package.json 依赖 + shadcn 目录谓词解析实际可用的 React 组件库。
 *
 * @returns 命中的库；无真实依赖证据返回 null（auto 必须降级为原生标签）
 */
export function detectReactLibrary(pkg: PackageJsonLike | null, hooks: DetectHooks = {}): ReactComponentLibrary | null {
  for (const library of REACT_PRIORITY) {
    if (library === 'ant-design' && pkg && hasDep(pkg, 'antd')) return 'ant-design';
    if (library === 'shadcn-ui') {
      // shadcn 不发 npm 包：依赖文件系统约定，至少 button 组件存在才算接入
      if (hooks.uiComponentExists?.('button')) return 'shadcn-ui';
    }
  }
  return null;
}

/**
 * 从 package.json 依赖解析实际可用的 Vue 组件库。
 */
export function detectVueLibrary(pkg: PackageJsonLike | null): VueComponentLibrary | null {
  if (!pkg) return null;
  for (const library of VUE_PRIORITY) {
    const dep = library === 'element-plus' ? 'element-plus' : 'ant-design-vue';
    if (hasDep(pkg, dep)) return library;
  }
  return null;
}

/**
 * 统一解析入口：按框架 + 用户选择（auto/具体库/none）解析出实际库。
 *
 * - 'none' → null（完全关闭，保持原生标签）；
 * - 具体库 → 校验确为已登记库且与目标框架匹配（跨框架显式报错，不静默降级）；
 * - 'auto' → 真实依赖检测，无证据返回 null。
 */
export function resolveLibrary(
  framework: 'react' | 'vue',
  choice: string | undefined,
  pkg: PackageJsonLike | null,
  hooks: DetectHooks = {},
): ComponentLibraryId | null {
  if (!choice || choice === 'none') return null;
  if (choice !== 'auto') {
    const id = choice as ComponentLibraryId;
    const definition = COMPONENT_LIBRARIES[id];
    if (!definition) {
      throw new Error(
        `[FDT-UI-LIB-UNKNOWN] 未知组件库 "${choice}"，可选值：auto/none/${Object.keys(COMPONENT_LIBRARIES).join('/')}`,
      );
    }
    if (definition.framework !== framework) {
      throw new Error(
        `[FDT-UI-LIB-FRAMEWORK-MISMATCH] 组件库 "${choice}" 仅适用于 ${definition.framework}，不能在 ${framework} 生成器中使用`,
      );
    }
    return id;
  }
  return framework === 'react' ? detectReactLibrary(pkg, hooks) : detectVueLibrary(pkg);
}
