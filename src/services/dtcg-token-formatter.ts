/**
 * W3C DTCG（Design Tokens Community Group）Design Tokens Format Module 格式化器
 *
 * v1.4.18（T11）：将内部 {@link DesignTokens} 转换为 W3C DTCG 草案合规的
 * 嵌套 JSON 令牌树（每个叶子为 `{ $type, $value, $description? }`），
 * 并提供零依赖的轻量内置 schema 校验（TR-11.1，避免引入 ajv 等重依赖）。
 *
 * 类型映射：
 * - ColorToken       → `$type: 'color'`（CSS 颜色字符串，建议提取时用 hex）
 * - SpacingToken     → `$type: 'dimension'`，值 `{ value, unit: 'px'|'rem' }`
 * - RadiusToken      → `$type: 'dimension'`
 * - ShadowToken      → `$type: 'shadow'`，值 `{ color, offsetX/Y, blur, spread, inset }`
 * - TypographyToken  → 嵌套 group：fontFamily / fontSize(dimension) /
 *                      fontWeight(number) / lineHeight(dimension) / letterSpacing(dimension)
 *
 * @module
 */

import type {
  ColorToken,
  DesignTokens,
  RadiusToken,
  ShadowToken,
  SpacingToken,
  TypographyToken,
} from '../types.js';

// ============ 类型定义 ============

/** 本工具输出的 DTCG 基础类型（Format Module 草案子集） */
export type DtcgBasicType = 'color' | 'dimension' | 'fontFamily' | 'fontWeight' | 'number' | 'shadow';

/** DTCG dimension 值 */
export interface DtcgDimensionValue {
  /** 数值 */
  value: number;
  /** 单位（本工具仅产出 px/rem） */
  unit: 'px' | 'rem';
}

/** DTCG shadow 值（单阴影；多阴影由多个令牌表达） */
export interface DtcgShadowValue {
  /** 阴影颜色（CSS 颜色字符串） */
  color: string;
  /** X 轴偏移（带 px 单位字符串） */
  offsetX: string;
  /** Y 轴偏移（带 px 单位字符串） */
  offsetY: string;
  /** 模糊半径（带 px 单位字符串） */
  blur: string;
  /** 扩展距离（带 px 单位字符串） */
  spread: string;
  /** 是否内阴影（inner shadow） */
  inset: boolean;
}

/** DTCG 叶子令牌 */
export interface DtcgToken {
  /** 令牌类型 */
  $type: DtcgBasicType;
  /** 令牌值（类型随 $type 变化） */
  $value: string | number | DtcgDimensionValue | DtcgShadowValue;
  /** 可选描述 */
  $description?: string;
}

/**
 * DTCG 令牌/分组树。
 *
 * 分组节点不含 `$value`，可继续嵌套；仅允许 `$description` 一个保留键。
 */
export type DtcgNode = DtcgToken | DtcgGroup;

/** DTCG 分组节点 */
export interface DtcgGroup {
  /** 分组描述（可选保留键） */
  $description?: string;
  /** 子节点（令牌或继续嵌套的分组） */
  [key: string]: DtcgNode | string | undefined;
}

/** 校验结果 */
export interface DtcgValidationResult {
  /** 是否全部合法 */
  valid: boolean;
  /** 逐条错误（JSON Pointer 风格路径，如 color.primary-500） */
  errors: readonly string[];
}

// ============ 内部工具 ============

/** 允许的 $type 集合 */
const ALLOWED_TYPES: readonly DtcgBasicType[] = [
  'color',
  'dimension',
  'fontFamily',
  'fontWeight',
  'number',
  'shadow',
];

/** 非 null 对象判断（unknown 收窄） */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 构造叶子令牌（无描述时不产出 $description 键） */
function createLeaf(
  $type: DtcgBasicType,
  $value: DtcgToken['$value'],
  description?: string,
): DtcgToken {
  const leaf: DtcgToken = { $type, $value };
  if (description) leaf.$description = description;
  return leaf;
}

/** 构造 dimension 值（单位缺省回退 px） */
function toDimension(value: number, unit: SpacingToken['unit'] | RadiusToken['unit']): DtcgDimensionValue {
  return { value, unit: unit === 'rem' ? 'rem' : 'px' };
}

/** 像素维度字符串（shadow 字段格式） */
function px(value: number): string {
  return `${value}px`;
}

/** 颜色叶子（直接透传提取阶段的 CSS 颜色字符串） */
function colorLeaf(token: ColorToken): DtcgToken {
  return createLeaf('color', token.value, token.description);
}

/** 数值维度叶子（spacing/radius） */
function dimensionLeaf(value: number, unit: 'px' | 'rem' | undefined, description?: string): DtcgToken {
  return createLeaf('dimension', toDimension(value, unit), description);
}

/** shadow 叶子 */
function shadowLeaf(token: ShadowToken): DtcgToken {
  const shadowValue: DtcgShadowValue = {
    color: token.color,
    offsetX: px(token.x),
    offsetY: px(token.y),
    blur: px(token.blur),
    spread: px(token.spread),
    inset: token.type === 'inner',
  };
  return createLeaf('shadow', shadowValue, token.description);
}

/** typography 嵌套 group（子令牌名固定 kebab-case） */
function typographyGroup(token: TypographyToken): DtcgGroup {
  const unit = token.unit === 'rem' ? 'rem' : 'px';
  const group: DtcgGroup = {};
  if (token.description) group.$description = token.description;

  group['font-family'] = createLeaf('fontFamily', token.fontFamily);
  group['font-size'] = createLeaf('dimension', { value: token.fontSize, unit });
  // 字重 DTCG 支持 1-1000 数值
  group['font-weight'] = createLeaf('fontWeight', token.fontWeight);
  if (token.lineHeight !== undefined) {
    group['line-height'] = createLeaf('dimension', { value: token.lineHeight, unit });
  }
  if (token.letterSpacing !== undefined) {
    group['letter-spacing'] = createLeaf('dimension', { value: token.letterSpacing, unit: 'px' });
  }
  return group;
}

/** 分类 map → DTCG group；空 map 返回 undefined（不产出空分组） */
function mapToGroup<T>(
  entries: Readonly<Record<string, T>>,
  toNode: (entry: T) => DtcgNode,
): DtcgGroup | undefined {
  const keys = Object.keys(entries);
  if (keys.length === 0) return undefined;
  const group: DtcgGroup = {};
  for (const key of keys) {
    const entry = entries[key];
    if (entry !== undefined) group[key] = toNode(entry);
  }
  return group;
}

// ============ 公共 API ============

/**
 * 将内部 DesignTokens 转换为 DTCG 嵌套令牌树。
 *
 * 分类分组：color / spacing / radius / shadow / typography；
 * 空分类整体省略；根节点带 $description 溯源信息。
 *
 * @param tokens - 内部结构化设计 tokens
 * @returns DTCG 令牌树（可直接 JSON 序列化）
 */
export function buildDtcgTokens(tokens: DesignTokens): DtcgGroup {
  const root: DtcgGroup = {
    $description: `Design tokens generated from Figma file "${
      tokens.metadata.figmaFileName || tokens.metadata.fileKey
    }" at ${tokens.metadata.generatedAt}`,
  };

  const colorGroup = mapToGroup(tokens.colors, colorLeaf);
  if (colorGroup) root.color = colorGroup;

  const spacingGroup = mapToGroup(tokens.spacing, (t) =>
    dimensionLeaf(t.value, t.unit === 'rem' ? 'rem' : 'px', t.description),
  );
  if (spacingGroup) root.spacing = spacingGroup;

  const radiusGroup = mapToGroup(tokens.radius, (t) =>
    dimensionLeaf(t.value, t.unit === 'rem' ? 'rem' : 'px', t.description),
  );
  if (radiusGroup) root.radius = radiusGroup;

  const shadowGroup = mapToGroup(tokens.shadows, shadowLeaf);
  if (shadowGroup) root.shadow = shadowGroup;

  const typographyGroupMap = mapToGroup(tokens.typography, typographyGroup);
  if (typographyGroupMap) root.typography = typographyGroupMap;

  return root;
}

/**
 * 序列化为两空格缩进、末尾换行的 DTCG JSON 文本。
 *
 * @param tokens - 内部结构化设计 tokens
 * @returns JSON 文本（建议落盘为 `*.tokens.json`）
 */
export function serializeDtcgTokens(tokens: DesignTokens): string {
  return `${JSON.stringify(buildDtcgTokens(tokens), null, 2)}\n`;
}

// ============ 内置轻量 schema 校验（TR-11.1） ============

/** 判断对象是否为叶子令牌（含 $type 或 $value；分组二者皆无） */
function isLeafNode(node: Record<string, unknown>): boolean {
  return '$value' in node || '$type' in node;
}

/** 校验 dimension 值 */
function validateDimensionValue(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  if (typeof value.value !== 'number' || Number.isNaN(value.value)) return false;
  return value.unit === 'px' || value.unit === 'rem';
}

/** 校验 shadow 值 */
function validateShadowValue(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  const requiredStringFields = ['color', 'offsetX', 'offsetY', 'blur', 'spread'] as const;
  for (const field of requiredStringFields) {
    if (typeof value[field] !== 'string') return false;
  }
  // inset 可选但必须为 boolean
  if ('inset' in value && typeof value.inset !== 'boolean') return false;
  return true;
}

/** 校验叶子令牌的 $type/$value 配对 */
function validateLeaf(node: Record<string, unknown>, path: string, errors: string[]): void {
  // 叶子仅允许三个键
  for (const key of Object.keys(node)) {
    if (key !== '$type' && key !== '$value' && key !== '$description') {
      errors.push(`${path}: 叶子令牌存在未知键 "${key}"`);
    }
  }

  const type = node.$type;
  if (typeof type !== 'string' || !ALLOWED_TYPES.includes(type as DtcgBasicType)) {
    errors.push(`${path}: $type 必须为 ${ALLOWED_TYPES.join('/')} 之一（实际：${String(type)}）`);
    return;
  }
  if (!('$value' in node)) {
    errors.push(`${path}: 叶子令牌缺少 $value`);
    return;
  }
  if ('$description' in node && typeof node.$description !== 'string') {
    errors.push(`${path}: $description 必须为字符串`);
  }

  const value = node.$value;
  switch (type) {
    case 'color':
    case 'fontFamily':
      if (typeof value !== 'string' || value.length === 0) {
        errors.push(`${path}: $type=${type} 的 $value 必须为非空字符串`);
      }
      break;
    case 'fontWeight':
      if (typeof value !== 'number') {
        errors.push(`${path}: $type=fontWeight 的 $value 必须为数值字重`);
      }
      break;
    case 'number':
      if (typeof value !== 'number' || Number.isNaN(value)) {
        errors.push(`${path}: $type=number 的 $value 必须为数字`);
      }
      break;
    case 'dimension':
      if (!validateDimensionValue(value)) {
        errors.push(`${path}: $type=dimension 的 $value 必须为 { value: number, unit: 'px'|'rem' }`);
      }
      break;
    case 'shadow':
      if (!validateShadowValue(value)) {
        errors.push(
          `${path}: $type=shadow 的 $value 必须包含 string 字段 color/offsetX/offsetY/blur/spread 与可选 boolean inset`,
        );
      }
      break;
  }
}

/** 递归校验分组 */
function validateGroup(node: Record<string, unknown>, path: string, errors: string[]): void {
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith('$')) {
      // 分组仅允许 $description 保留键
      if (key !== '$description') {
        errors.push(`${path}: 分组存在非法保留键 "${key}"（仅允许 $description）`);
      } else if (typeof child !== 'string') {
        errors.push(`${path}.$description 必须为字符串`);
      }
      continue;
    }

    const childPath = path ? `${path}.${key}` : key;
    if (!isPlainObject(child)) {
      errors.push(`${childPath}: 子节点必须为对象（令牌或分组）`);
      continue;
    }
    if (isLeafNode(child)) {
      validateLeaf(child, childPath, errors);
    } else {
      validateGroup(child, childPath, errors);
    }
  }
}

/**
 * 校验任意值是否为合法 DTCG 令牌树（内置轻量 schema，TR-11.1）。
 *
 * @param tree - 待校验数据（通常为 `JSON.parse(serializeDtcgTokens(...))` 的结果）
 * @returns 校验结果（valid + 带路径的错误列表）
 */
export function validateDtcgTokens(tree: unknown): DtcgValidationResult {
  const errors: string[] = [];
  if (!isPlainObject(tree)) {
    return { valid: false, errors: ['根节点必须为 DTCG 分组对象'] };
  }
  validateGroup(tree, '', errors);
  return { valid: errors.length === 0, errors };
}
