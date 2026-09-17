/**
 * 样式渲染器共享工具（v1.4.19 T14–T17）
 *
 * styled-components / Emotion / Less / Sass / vanilla-extract / Panda
 * 六个新渲染器共用的：HTML 基标签推断、PascalCase 标识符派生、
 * CSS 声明 → JS 对象样式转换、字符串字面量安全转义、填充警告收集。
 *
 * @module services/style-renderers/shared
 */

import type { ProcessedNode } from '../../types/nodes.js';
import type { CssDeclaration } from './css-modules-renderer.js';

/** 渲染器允许生成的 HTML 标签白名单（与 styled.x / css prop 可附着标签对齐） */
const ALLOWED_TAGS = [
  'div',
  'span',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'button',
  'a',
  'img',
  'nav',
  'header',
  'footer',
  'main',
  'aside',
  'section',
  'article',
  'form',
  'label',
  'input',
  'textarea',
  'ul',
  'li',
] as const;

/** a11y-enhancer 写入节点的扩展字段（结构化访问，避免 any） */
type NodeWithA11y = ProcessedNode & {
  _a11y?: {
    semanticTag?: string;
  };
};

/**
   * 推断节点的原生 HTML 基标签（与两个生成器的语义标签启发式同源、取其稳定子集）。
   *
   * 优先使用 a11y-enhancer 已写入的 semanticTag；否则按 role/名称/原始类型启发；
   * 非白名单结果回退 div，保证 styled.<tag> 语法合法。
   *
   * @param node - 精简节点
   * @returns 白名单内的 HTML 标签名
   */
export function resolveHtmlTag(node: ProcessedNode): string {
  const semantic = (node as NodeWithA11y)._a11y?.semanticTag;
  if (semantic && (ALLOWED_TAGS as readonly string[]).includes(semantic)) {
    return semantic;
  }

  const name = (node.name || '').toLowerCase();

  if (node.originalType === 'TEXT' || node.role === 'text') return 'p';
  if (node.role === 'button') return 'button';
  if (node.role === 'icon') return 'span';

  if (/\bbutton\b/.test(name)) return 'button';
  if (/\bimg\b|\bimage\b/.test(name)) return 'img';
  if (/\bh1\b/.test(name)) return 'h1';
  if (/\bh2\b/.test(name)) return 'h2';
  if (/\bh3\b/.test(name)) return 'h3';
  if (/heading|title/.test(name)) return 'h2';
  if (/paragraph|text|label/.test(name)) return 'p';
  if (/\blink\b|href/.test(name)) return 'a';
  if (/\binput\b|textfield|text-field/.test(name)) return 'input';
  if (/textarea/.test(name)) return 'textarea';
  if (/navbar|navigation|^nav|^menu/.test(name)) return 'nav';
  if (/^header|top-?bar/.test(name)) return 'header';
  if (/^footer/.test(name)) return 'footer';
  if (/^main/.test(name)) return 'main';
  if (/sidebar|aside/.test(name)) return 'aside';
  if (/^section|card/.test(name)) return 'section';
  if (/article|post/.test(name)) return 'article';
  if (/^form/.test(name)) return 'form';
  if (/\blist\b/.test(name) && !/listitem/.test(name)) return 'ul';
  if (/listitem|menu-?item/.test(name)) return 'li';
  if (/nav/.test(name)) return 'nav';

  return 'div';
}

/**
 * 由任意名称派生合法 PascalCase 标识符（styled 组件名 / 常量名用）。
 *
 * 剥离非 ASCII 与非法标识符字符；数字开头补 El 前缀；结果为空时用 fallback。
 *
 * @param name - 原始名称（通常为 Figma 节点名）
 * @param fallback - 无法派生时的回退基名（如 'StyledDiv'）
 * @returns PascalCase 标识符
 */
export function toPascalIdentifier(name: string, fallback: string): string {
  const words = (name || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  let identifier = words.join('');
  if (!identifier) identifier = fallback;
  if (/^[0-9]/.test(identifier)) identifier = `El${identifier}`;
  return identifier;
}

/** kebab-case 属性名 → camelCase（JS 对象样式键） */
export function cssPropertyToCamel(property: string): string {
  return property.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
}

/**
 * 由任意名称派生合法 camelCase 标识符（vanilla-extract 导出名 / Panda 常量名用）。
 *
 * @param name - 原始名称
 * @param fallback - 回退基名
 * @returns camelCase 标识符
 */
export function toCamelIdentifier(name: string, fallback: string): string {
  const pascal = toPascalIdentifier(name, fallback);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * 以单引号安全渲染 TS 字符串字面量（生成代码统一单引号）。
 *
 * @param value - 原始字符串
 * @returns 含首尾引号的字面量
 */
export function quoteTsString(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
  return `'${escaped}'`;
}

/** 一条对象样式条目（camelCase 键 + 已序列化的值文本） */
export interface ObjectStyleEntry {
  /** camelCase CSS 属性名 */
  readonly key: string;
  /** 属性值的 JS 字面量文本（数字裸写，其余单引号字符串） */
  readonly valueLiteral: string;
}

/**
 * CSS 声明数组 → JS 对象样式条目（Emotion/vanilla-extract/Panda 用）。
 *
 * 纯数字（含小数）裸写为 number；px 等带单位值保留为字符串；
 * 值仅可能来自 Figma 数值/hex（extractCssDeclarations 白名单），仍统一经转义。
 *
 * @param declarations - 规范序 CSS 声明
 * @returns 对象样式条目数组（保持输入顺序）
 */
export function declarationsToObjectEntries(declarations: readonly CssDeclaration[]): ObjectStyleEntry[] {
  return declarations.map(([property, value]) => {
    const numeric = /^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : undefined;
    return {
      key: cssPropertyToCamel(property),
      valueLiteral: numeric !== undefined ? String(numeric) : quoteTsString(value),
    };
  });
}

/**
 * 收集渐变/图片填充的人工复核警告（与 CSS Modules 渲染器口径一致）。
 *
 * @param node - 精简节点
 * @param schemeLabel - 方案中文名（拼入警告，便于用户定位）
 * @returns 警告数组（可能为空）
 */
export function collectUnsupportedFillWarnings(node: ProcessedNode, schemeLabel: string): string[] {
  const warnings: string[] = [];
  if (!node.fills) return warnings;
  for (const fill of node.fills) {
    if (fill.type === 'image') {
      warnings.push(`图片填充无法映射为 ${schemeLabel} 声明，请改用 <img> 或手工补充 background-image`);
    } else if (fill.type !== 'solid') {
      warnings.push(`渐变填充无法精确映射为 ${schemeLabel} 声明，请人工补充 background: linear/radial-gradient(...)`);
    }
  }
  return warnings;
}

/**
 * 节点名/标签 → styled 组件基名（PascalCase，无 Root 后缀）。
 *
 * @param node - 精简节点
 * @param tag - 已推断的 HTML 标签（用于回退命名）
 * @returns PascalCase 基名
 */
export function nodeComponentBaseName(node: ProcessedNode, tag: string): string {
  return toPascalIdentifier(node.name || '', `${tag.charAt(0).toUpperCase()}${tag.slice(1)}`);
}
