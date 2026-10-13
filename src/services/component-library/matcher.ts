/**
 * 组件匹配器（WBS-P2-11）
 *
 * 评分模型（满分 100）：
 * - 语义角色命中 +40；
 * - 节点名称关键词命中（中英双语，小写子串）+35；
 * - 结构信号（尺寸/形状/填充/子项）0-25（各组件规则自定义）。
 *
 * 保守门控 {@link CONSERVATIVE_MATCH_THRESHOLD}=70：必须有两类以上独立证据
 * （role+名称=75、role+强结构=65 不达标、名称+强结构=60 不达标），
 * 从模型上保证「仅凭单一信号不替换」，fixture 误替换必须为 0。
 *
 * @module services/component-library/matcher
 */

import type { ProcessedNode } from '../../types/nodes.js';
import {
  ALL_COMPONENT_RULES,
  COMPONENT_LIBRARIES,
  COMPONENT_RULES,
  CONSERVATIVE_MATCH_THRESHOLD,
  needsDangerFlag,
  normalizePropValue,
} from './registry.js';
import type {
  ComponentLibraryId,
  ComponentMatch,
  MappedProp,
  NodeMatchView,
} from './types.js';

// ============ ProcessedNode → 匹配视图 ============

function solidFillOf(node: ProcessedNode): { hex?: string; exists: boolean } {
  const solid = (node.fills ?? []).find((f) => f.type === 'solid' && (f.opacity ?? 1) > 0);
  if (!solid || solid.type !== 'solid') return { exists: false };
  const c = solid.color;
  const hex =
    '#' +
    [c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  return { exists: true, hex };
}

/** 收集节点的直接文本子节点（tabs 等宽文本项信号用） */
function equalTextChildren(node: ProcessedNode): { count: number; activeIndex?: number } {
  const children = node.children ?? [];
  if (children.length < 2 || node.layout?.mode !== 'HORIZONTAL') return { count: 0 };
  const widths = children.map((c) => c.size?.width ?? 0).filter((w) => w > 0);
  if (widths.length < 2) return { count: 0 };
  const max = Math.max(...widths);
  const min = Math.min(...widths);
  // 等宽容差 25%
  const equalEnough = min >= max * 0.75;
  const textLike = children.filter((c) => (c.textContent ?? '').trim().length > 0);
  if (!equalEnough || textLike.length < 2) return { count: 0 };
  // 激活态：有实色填充或粗体的文本项下标
  let activeIndex: number | undefined;
  children.forEach((c, i) => {
    if (activeIndex !== undefined) return;
    const fill = (c.fills ?? []).some((f) => f.type === 'solid' && (f.opacity ?? 1) > 0);
    const bold = (c.textStyle?.fontWeight ?? 400) >= 600;
    if (fill || bold) activeIndex = i;
  });
  return { count: textLike.length, activeIndex: activeIndex ?? 0 };
}

/** 从 ProcessedNode 提取规则只读视图（本模块对 ProcessedNode 的唯一接触点） */
export function toNodeMatchView(node: ProcessedNode): NodeMatchView {
  const fill = solidFillOf(node);
  const radii = [
    node.cornerRadius?.topLeft,
    node.cornerRadius?.topRight,
    node.cornerRadius?.bottomRight,
    node.cornerRadius?.bottomLeft,
  ].filter((v): v is number => typeof v === 'number');
  const strokeOnly =
    !fill.exists && (node.strokes?.length ?? 0) > 0 && (node.strokes?.[0]?.weight ?? 0) > 0;
  const tabs = equalTextChildren(node);
  return {
    id: node.id,
    name: node.name ?? '',
    role: node.role,
    width: node.size?.width,
    height: node.size?.height,
    text: node.textContent,
    hasSolidFill: fill.exists,
    solidFillHex: fill.hex,
    strokeOnly,
    minCornerRadius: radii.length ? Math.min(...radii) : undefined,
    hasShadow: (node.effects ?? []).some((e) => e.type === 'drop'),
    childCount: node.children?.length ?? 0,
    isImageFill: (node.fills ?? []).some((f) => f.type === 'image'),
    equalTextChildCount: tabs.count,
    activeTextChildIndex: tabs.activeIndex,
    raw: node,
  };
}

// ============ 评分 ============

interface Scored {
  component: ComponentMatch['component'];
  score: number;
  reasons: string[];
}

/** 名称关键词命中（小写包含） */
function nameMatches(keywords: readonly string[], name: string): boolean {
  const lower = name.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

function scoreNode(view: NodeMatchView): Scored | null {
  let best: Scored | null = null;
  for (const rule of ALL_COMPONENT_RULES) {
    let score = 0;
    const reasons: string[] = [];
    // 常规语义角色
    const directRoleHit = !!view.role && rule.roles.includes(view.role);
    // Figma 组件库 COMPONENT/INSTANCE：组件类型元数据（独立结构证据）+ 名称关键词 + 规则形态护栏
    const reusableRoleHit =
      view.role === 'reusable-component' &&
      rule.reusableComponentRole === true &&
      nameMatches(rule.nameKeywords, view.name) &&
      (rule.reusableGuard?.(view) ?? false);
    if (directRoleHit) {
      score += 40;
      reasons.push(`role=${view.role}`);
    } else if (reusableRoleHit) {
      score += 40;
      reasons.push('reusable-component + name keyword + shape guard');
    }
    if (nameMatches(rule.nameKeywords, view.name)) {
      score += 35;
      reasons.push(`name keyword in "${view.name}"`);
    }
    const structural = rule.structuralScore(view);
    score += structural.score;
    reasons.push(...structural.reasons);
    if (!best || score > best.score) best = { component: rule.component, score: Math.min(score, 100), reasons };
  }
  return best;
}

// ============ 匹配输出 ============

function buildProps(library: ComponentLibraryId, component: ComponentMatch['component'], view: NodeMatchView): MappedProp[] {
  const rule = COMPONENT_RULES[component];
  const canonical = rule.deriveProps(view);
  const out: MappedProp[] = canonical.map((p) => ({
    ...p,
    name: component === 'button' && p.name === 'variant' && library !== 'shadcn-ui' ? 'type' : p.name,
    value: normalizePropValue(library, component, p.name, p.value),
  }));
  // antd/antdv 危险主按钮追加 danger 布尔
  const dangerCanonical = canonical.find((p) => p.name === 'variant' && p.value === 'danger');
  if (dangerCanonical && needsDangerFlag(library, component, 'danger')) {
    out.push({ name: 'danger', value: 'true', reason: 'danger primary button' });
  }
  return out;
}

/**
 * 对单节点执行组件库匹配。
 *
 * @param node - 精简节点
 * @param library - 已由 detect/显式选择确定的目标库（null 时直接返回 null）
 * @param threshold - 门控分（默认保守 70）
 * @returns 达到门控的匹配；否则 null（调用方保持原生标签并给组件建议注释）
 */
export function matchComponent(
  node: ProcessedNode,
  library: ComponentLibraryId | null,
  threshold: number = CONSERVATIVE_MATCH_THRESHOLD,
): ComponentMatch | null {
  if (!library) return null;
  const view = toNodeMatchView(node);
  const scored = scoreNode(view);
  if (!scored || scored.score < threshold) return null;

  const definition = COMPONENT_LIBRARIES[library];
  const form = definition.components[scored.component];
  return {
    library,
    component: scored.component,
    importName: form.importName,
    tagName: form.tagName,
    templateName: form.templateName,
    confidence: scored.score,
    reasons: scored.reasons,
    props: buildProps(library, scored.component, view),
    subImports: form.subImports ?? [],
    compositionAdvice: form.compositionAdvice,
  };
}

/**
 * 递归收集整棵树的全部匹配（生成器在标签产出处调用单节点版本；
 * 本函数供批量分析/报告与 fixture 评测使用）。
 */
export function matchTree(
  root: ProcessedNode,
  library: ComponentLibraryId | null,
  threshold: number = CONSERVATIVE_MATCH_THRESHOLD,
): Array<ComponentMatch & { nodeId: string }> {
  const out: Array<ComponentMatch & { nodeId: string }> = [];
  const walk = (node: ProcessedNode): void => {
    const match = matchComponent(node, library, threshold);
    if (match) out.push({ ...match, nodeId: node.id });
    for (const child of node.children ?? []) walk(child);
  };
  walk(root);
  return out;
}
