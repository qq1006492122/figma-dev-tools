/**
 * 资源落位与引用规划 - Asset Path / Reference Planner（v1.4.18 新增，T4）
 *
 * 构建器感知的资源策略纯函数层（零 I/O、零副作用），被资产下载器与
 * React/Vue 生成器共同使用，保证「下载落位」与「代码引用」使用同一套契约：
 *
 * | 构建器  | 落位目录                | 引用形态                                            |
 * | ------- | ----------------------- | --------------------------------------------------- |
 * | none    | `public/<prefix>/`      | `publicCdnUrl('/<prefix>/x.png')`（1.4.17 原样）    |
 * | nextjs  | `public/<prefix>/`      | 字符串字面量 `'/<prefix>/x.png'`                    |
 * | remix   | `public/<prefix>/`      | 字符串字面量 `'/<prefix>/x.png'`                    |
 * | vite    | `src/assets/<prefix>/`  | ESM `import xPng from '@/assets/<prefix>/x.png'`    |
 * | webpack | `src/assets/<prefix>/`  | `require('@/assets/<prefix>/x.png')`                |
 *
 * `@/` → `src` 的路径别名为本工具既有约定（既有产物已使用 `@/lib/*`）；
 * import/require 统一使用单引号（React 产物经 prettier 后亦为单引号）。
 *
 * @module
 */

// ============ 依赖导入 ============

import type { BundlerKind } from './bundler-detector.js';

// ============ 类型重导出 ============

export type { BundlerKind };

/**
 * 资源引用形态标识
 */
export type AssetReferenceKind = 'public-cdn' | 'public-absolute' | 'esm-import' | 'require';

/**
 * 引用规划输入
 */
export interface PlanAssetReferenceInput {
  /** 目标构建器 */
  bundler: BundlerKind;
  /** 资源根相对 URL 路径（/ 开头，如 `/portal/edu/icon.png`，即下载器 localPath） */
  urlPath: string;
  /** ESM/require 场景使用的合法 JS 标识符变量名 */
  varName: string;
}

/**
 * 引用规划结果
 */
export interface PlannedAssetReference {
  /** 引用形态 */
  kind: AssetReferenceKind;
  /**
   * 写入 src 绑定位置的表达式：
   * - React：`src={expression}`
   * - Vue：`:src="expression"`
   */
  expression: string;
  /** 需要追加到脚本区的完整 import 语句（无则空数组） */
  imports: string[];
  /** 资源落位目录（相对项目根的 POSIX 路径） */
  assetDir: string;
}

// ============ 文件名/前缀工具 ============

/**
 * 清理文件名（规则与 1.4.17 资产下载器逐字节一致）
 *
 * 处理步骤：首尾去空白 → 路径分隔符/引号/尖括号/空白→下划线 →
 * 移除非字母数字、非中文、非 `.`/`-` 字符 → 合并下划线 → 去首尾下划线 → 小写。
 *
 * @param name - 原始名称
 * @returns 安全的文件名（小写 kebab/snake 风格）
 */
export function sanitizeAssetFileName(name: string): string {
  return name
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .replace(/[^\w\u4e00-\u9fa5.-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

/**
 * 解析资源子目录前缀：显式前缀优先；否则回退 `portal/<sanitized 场景名>`
 *
 * @param assetPrefix - 显式前缀（可空）
 * @param sceneName - 场景名
 * @returns 目录前缀（POSIX，无前导/尾随斜杠）
 */
export function resolveAssetPrefix(assetPrefix: string | undefined, sceneName: string): string {
  const explicit = (assetPrefix ?? '').trim();
  if (explicit.length > 0) {
    return explicit.replace(/^\/+|\/+$/g, '');
  }
  return `portal/${sanitizeAssetFileName(sceneName || 'default')}`;
}

/**
 * 资源落位根目录（相对项目根，POSIX）
 *
 * @param bundler - 构建器
 * @returns `public` 或 `src/assets`
 */
export function getAssetRootDir(bundler: BundlerKind): 'public' | 'src/assets' {
  return bundler === 'vite' || bundler === 'webpack' ? 'src/assets' : 'public';
}

// ============ 标识符工具 ============

/**
 * 由资源 URL 路径生成合法 JS 标识符（camelCase + 扩展后缀）
 *
 * 例：`/portal/edu/hero-banner.png` → `heroBannerPng`；
 * 数字开头时补 `asset` 前缀。
 *
 * @param urlPath - / 开头的资源路径
 * @returns 合法 JS 标识符
 */
export function toAssetVarName(urlPath: string): string {
  const segments = urlPath.split('/');
  const fileName = segments[segments.length - 1] ?? 'asset';
  const dotIndex = fileName.lastIndexOf('.');
  const base = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const ext = dotIndex > 0 ? fileName.slice(dotIndex + 1) : '';

  /** 非字母数字片段一律视为分词边界 */
  const words = base.split(/[^a-zA-Z0-9]+/).filter((word) => word.length > 0);
  const camel =
    words
      .map((word, index) => {
        const lower = word.toLowerCase();
        if (index === 0) {
          return lower;
        }
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join('') || 'asset';

  const extSuffix = ext ? ext.toLowerCase().charAt(0).toUpperCase() + ext.toLowerCase().slice(1) : '';
  const identifier = `${camel}${extSuffix}`;
  return /^[A-Za-z_$]/.test(identifier) ? identifier : `asset${identifier.charAt(0).toUpperCase()}${identifier.slice(1)}`;
}

// ============ urlPath 归一化 ============

const PUBLIC_CDN_CALL_PATTERN = /^publicCdnUrl\(\s*['"]([^'"]+)['"]\s*\)$/;

/**
 * 将可能已被 `publicCdnUrl('...')` 包裹的资源路径归一化为裸 `/...` URL
 *
 * 兼容 1.4.17 下载后 `asset.cdnUrl` 可能为完整调用串的情况，防止双重包裹。
 *
 * @param raw - 裸路径或 publicCdnUrl() 调用串
 * @returns / 开头的裸路径
 */
export function normalizeAssetUrlPath(raw: string): string {
  const match = raw.trim().match(PUBLIC_CDN_CALL_PATTERN);
  return match ? match[1]! : raw;
}

// ============ 引用规划主逻辑 ============

/**
 * 校验 /^[A-Za-z_$][\w$]*$/ 标识符
 */
function isValidIdentifier(varName: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(varName);
}

/**
 * 规划单个资源在目标构建器/框架下的落位目录与代码引用
 *
 * @param input - 规划输入
 * @returns 引用规划（表达式、import、落位目录）
 */
export function planAssetReference(input: PlanAssetReferenceInput): PlannedAssetReference {
  const { bundler, varName } = input;
  const urlPath = normalizeAssetUrlPath(input.urlPath);

  if (!urlPath.startsWith('/')) {
    throw new Error(`planAssetReference: urlPath 必须以 / 开头，实际收到 "${urlPath}"`);
  }

  /** 去掉前导斜杠的资源根内相对路径，如 portal/edu/icon.png */
  const relative = urlPath.replace(/^\/+/, '');
  const rootDir = getAssetRootDir(bundler);
  const prefix = relative.split('/').slice(0, -1).join('/');
  const assetDir = prefix ? `${rootDir}/${prefix}` : rootDir;

  switch (bundler) {
    case 'none':
      return {
        kind: 'public-cdn',
        expression: `publicCdnUrl('${urlPath}')`,
        imports: [],
        assetDir,
      };
    case 'nextjs':
    case 'remix':
      return {
        kind: 'public-absolute',
        expression: `'${urlPath}'`,
        imports: [],
        assetDir,
      };
    case 'vite': {
      if (!isValidIdentifier(varName)) {
        throw new Error(`planAssetReference: varName 必须是合法 JS 标识符，实际收到 "${varName}"`);
      }
      return {
        kind: 'esm-import',
        expression: varName,
        imports: [`import ${varName} from '@/assets/${relative}';`],
        assetDir,
      };
    }
    case 'webpack':
      return {
        kind: 'require',
        expression: `require('@/assets/${relative}')`,
        imports: [],
        assetDir,
      };
  }
}
