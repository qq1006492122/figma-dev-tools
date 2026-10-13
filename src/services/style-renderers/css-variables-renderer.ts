/**
 * CSS Variables 样式方案 - 命名规范 + tokens 映射 + 渲染器骨架（WBS-P2-41）
 *
 * ROADMAP v1.4.20 → v1.5.0 前置（Committed，注册表保持 planned、不进入生成枚举）：
 * - 冻结组件级 CSS 变量命名规范（--color-xxx / --spacing-xxx 等 7 个分类前缀）；
 * - tokens → :root 声明块、CSS 值 → var(--token) 映射为纯函数，v1.5.0 渲染器直接复用；
 * - {@link CssVariablesRenderer} 仅为骨架：renderNode 显式抛 planned 错误，
 *   工厂（factory.ts）与 STYLE_FORMATS_NEW_PIPELINE 均不接线，注册表状态保持
 *   'planned' / plannedVersion 1.5.0——禁止在 v1.4.20 产出半成品 var() 组件代码。
 *
 * 命名规范（本期冻结，变更需走版本说明）：
 *   --<category>-<kebab-name>，category ∈
 *   color | spacing | radius | font-size | font-weight | line-height | shadow
 *   name 段：小写、空白/下划线→连字符、仅保留 [a-z0-9-]、折叠并去除首尾连字符。
 *
 * @module services/style-renderers/css-variables-renderer
 */

import type { ProcessedNode } from '../../types/nodes.js';
import type { NodeStyleResult, StyleHint } from './types.js';

/** CSS 变量分类（与 :root token 分组一一对应） */
export type CssTokenCategory =
  | 'color'
  | 'spacing'
  | 'radius'
  | 'font-size'
  | 'font-weight'
  | 'line-height'
  | 'shadow';

/** 分类 → 变量前缀（含结尾连字符），顺序即 :root 块内的固定分组顺序 */
export const CSS_VARIABLE_PREFIX: Readonly<Record<CssTokenCategory, string>> = {
  color: '--color-',
  spacing: '--spacing-',
  radius: '--radius-',
  'font-size': '--font-size-',
  'font-weight': '--font-weight-',
  'line-height': '--line-height-',
  shadow: '--shadow-',
};

/** :root 块内分类的输出顺序（颜色→间距→圆角→排版→阴影） */
const CATEGORY_ORDER: readonly CssTokenCategory[] = [
  'color',
  'spacing',
  'radius',
  'font-size',
  'font-weight',
  'line-height',
  'shadow',
];

/** 计划启用版本（与注册表 descriptor.plannedVersion 单一口径） */
export const CSS_VARIABLES_PLANNED_VERSION = '1.5.0';

/** 骨架被误调用时的错误文案（中英混合技术提示，渲染层未走 i18n 管线） */
const PLANNED_ERROR_MESSAGE =
  `css-variables component rendering is planned for v${CSS_VARIABLES_PLANNED_VERSION} ` +
  'and is not enabled in v1.4.20 (registry status=planned; use --style tailwind|unocss|css-modules for now)';

/**
 * 将任意来源名称规范化为 CSS 自定义属性名段（kebab-case）。
 *
 * 规则：trim → 小写 → 任意非字母数字字符段统一转连字符（空白/下划线/斜杠等）
 * → 连字符折叠 → 去首尾连字符。
 *
 * @param raw - 原始名称（Figma token 名/样式名等）
 * @returns 非空 kebab 段
 * @throws 规范化结果为空时抛错（禁止生成 `--color-` 这类空变量名）
 */
export function toKebabSegment(raw: string): string {
  const normalized = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!normalized) {
    throw new Error(`CSS variable name segment is empty after normalization: ${JSON.stringify(raw)}`);
  }
  return normalized;
}

/**
 * 按分类构建完整 CSS 自定义属性名。
 *
 * @param category - 变量分类
 * @param rawName - 原始名称
 * @returns 如 `--color-primary-500`
 */
export function buildCssVariableName(category: CssTokenCategory, rawName: string): string {
  return `${CSS_VARIABLE_PREFIX[category]}${toKebabSegment(rawName)}`;
}

/**
 * 解析 CSS 自定义属性名为分类与名称段（buildCssVariableName 的逆运算）。
 *
 * @param variable - 完整变量名（如 `--spacing-page-padding`）
 * @returns `{ category, name }`；前缀缺失/分类未知/名称段为空时返回 null
 */
export function parseCssVariableName(variable: string): { category: CssTokenCategory; name: string } | null {
  for (const category of CATEGORY_ORDER) {
    const prefix = CSS_VARIABLE_PREFIX[category];
    if (variable.startsWith(prefix)) {
      const name = variable.slice(prefix.length);
      if (name && /^[a-z0-9-]+$/.test(name)) {
        return { category, name };
      }
      return null;
    }
  }
  return null;
}

/** 单条 token 定义（tokens → :root 声明的输入项） */
export interface CssTokenDefinition {
  /** 变量分类 */
  readonly category: CssTokenCategory;
  /** 原始变量名（构建时规范化） */
  readonly name: string;
  /** 字面值（如 #07c160 / 32rpx / 0 1px 3px rgba(0,0,0,.1)） */
  readonly value: string;
  /** 可选注释（输出为行尾 CSS 注释） */
  readonly comment?: string;
}

/**
 * 生成 :root 自定义属性声明块。
 *
 * 顺序：分类固定（{@link CATEGORY_ORDER}），同分类内按变量名排序；
 * 同名重复 last-wins（与 token 表去重语义一致）；不做值转义以外的加工，
 * 调用方负责值的合法性。
 *
 * @param tokens - token 定义列表
 * @returns 完整 `:root { ... }` 文本（含尾部换行）
 */
export function buildRootVariableBlock(tokens: readonly CssTokenDefinition[]): string {
  const lines: string[] = [':root {'];
  const byCategory = new Map<CssTokenCategory, Map<string, string>>();

  for (const token of tokens) {
    const variable = buildCssVariableName(token.category, token.name);
    let group = byCategory.get(token.category);
    if (!group) {
      group = new Map<string, string>();
      byCategory.set(token.category, group);
    }
    const comment = token.comment ? ` /* ${String(token.comment).replace(/\*\//g, '*\\/')} */` : '';
    group.set(variable, `  ${variable}: ${token.value};${comment}`);
  }

  for (const category of CATEGORY_ORDER) {
    const group = byCategory.get(category);
    if (!group || group.size === 0) continue;
    for (const variable of [...group.keys()].sort()) {
      lines.push(group.get(variable) as string);
    }
  }

  lines.push('}');
  return `${lines.join('\n')}\n`;
}

/** 值→变量映射结果 */
export interface CssVariableMatch {
  /** 写入声明位置的表达式：命中为 var(--x)，未命中为原字面值 */
  readonly expression: string;
  /** 是否命中 token */
  readonly matched: boolean;
  /** 命中时的完整变量名 */
  readonly variable?: string;
}

/**
 * 按 token 映射表把单个 CSS 值翻译为 var() 表达式。
 *
 * 颜色类值忽略大小写匹配；命中时返回 `var(<变量名>)`，未命中原样返回字面值
 * （由调用方决定是否追加 warning；本函数不做猜测性近似匹配）。
 *
 * @param _property - CSS 属性名（预留：后续可按属性做分组匹配，当前不参与判定）
 * @param value - 待映射的字面值
 * @param table - 字面值（小写归一）→ 完整变量名
 */
export function mapValueToCssVariable(
  _property: string,
  value: string,
  table: ReadonlyMap<string, string>,
): CssVariableMatch {
  const key = String(value).trim().toLowerCase();
  const variable = table.get(key);
  if (variable) {
    return { expression: `var(${variable})`, matched: true, variable };
  }
  return { expression: String(value), matched: false };
}

/**
 * CSS Variables 渲染器骨架（WBS-P2-41）。
 *
 * v1.4.20 不接线到工厂/管线；任何实例化后调用 renderNode 的路径都会立即得到
 * 明确的 planned 错误，避免静默产出不完整样式。hints 提供命名示例，
 * 供 v1.5.0 接入与用户提前准备 tokens.css。
 */
export class CssVariablesRenderer {
  readonly id = 'css-variables' as const;

  readonly hints: readonly StyleHint[] = [
    {
      title: 'tokens.css (planned v1.5.0 naming example)',
      code: [
        ':root {',
        '  --color-primary: #07c160;',
        '  --spacing-page-padding: 32rpx;',
        '  --radius-card-lg: 20rpx;',
        '  --font-size-heading-xl: 40rpx;',
        '}',
      ].join('\n'),
    },
  ];

  /**
   * @throws 始终抛出——组件级 var(--token) 渲染规划于 1.5.0，本期不产出任何节点样式
   */
  renderNode(_node: ProcessedNode): NodeStyleResult {
    throw new Error(PLANNED_ERROR_MESSAGE);
  }
}
