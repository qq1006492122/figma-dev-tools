/**
 * 页面区块拆分器 - Page Block Splitter（v1.4.19 T20）
 *
 * 批量生成的第一阶段：把一个页面/大 Frame 的顶层子节点识别为语义区块，
 * 每个区块独立生成一个组件文件，再由 BatchGenerator 汇总 barrel 与依赖图。
 *
 * 区块类型（固定六类，便于产物命名与快照稳定）：
 * - header   页眉 / 导航栏
 * - hero     首屏主视觉
 * - features 功能特性 / 卖点区
 * - section  普通内容区块（兜底）
 * - sticky   吸顶 / 悬浮工具条
 * - footer   页脚
 *
 * 识别策略：
 * 1. 节点名关键词（中英双语）优先；
 * 2. 未命中时按几何位置兜底（贴近顶部 → header，贴近底部 → footer，
 *    首个大区块 → hero），其余归 section；
 * 3. 页面下游离的 TEXT/图标叶子不视为区块；页面没有可拆分的子区块时，
 *    根节点整体作为单个 section 区块返回（单文件等价于 figma_generate_jsx）。
 *
 * @module
 */

import type { ProcessedNode } from '../types/nodes.js';

/** 页面区块语义类型（批量产物按此稳定命名） */
export type PageBlockKind = 'header' | 'hero' | 'features' | 'section' | 'sticky' | 'footer';

/**
 * 拆分出的页面区块
 */
export interface PageBlock {
  /** 区块语义类型 */
  readonly kind: PageBlockKind;
  /** 区块源节点（区块根，子树整体生成一个组件） */
  readonly node: ProcessedNode;
  /** 建议组件名（PascalCase，批次内唯一） */
  readonly componentName: string;
  /** Figma 原始节点名（溯源/报告用） */
  readonly sourceName: string;
}

/** 区块关键词规则（按匹配优先级排序；中英双语） */
const BLOCK_KEYWORD_RULES: ReadonlyArray<{ readonly kind: PageBlockKind; readonly pattern: RegExp }> = [
  // 吸顶必须先于 header（「sticky header」应归 sticky）
  { kind: 'sticky', pattern: /sticky|吸顶|悬浮(栏|条)?|固定(头|栏|条)/i },
  {
    kind: 'header',
    pattern: /(^|[^a-z])(header|navbar|nav-bar|top-?bar|app-?bar|navigation)([^a-z]|$)|导航栏?|页眉|页头|顶部栏/i,
  },
  { kind: 'footer', pattern: /footer|bottom-?bar|copyright|页脚|版权|底部栏/i },
  { kind: 'hero', pattern: /hero|banner|首屏|主视觉|焦点图|大?轮播首屏/i },
  { kind: 'features', pattern: /features?|feature-?list|capabilit(y|ies)|功能(区|列表|特性|卖点)?|卖点|特性|优势(区|列表)?/i },
];

/** 区块类型的默认组件名（重名时追加序号） */
const KIND_BASE_NAMES: Readonly<Record<PageBlockKind, string>> = {
  header: 'Header',
  hero: 'HeroSection',
  features: 'FeaturesSection',
  section: 'Section',
  sticky: 'StickyBar',
  footer: 'Footer',
};

/** 可作为区块容器的原始节点类型（游离文本/矢量叶子不拆） */
const CONTAINER_TYPES: ReadonlySet<string> = new Set([
  'FRAME',
  'SECTION',
  'COMPONENT',
  'COMPONENT_SET',
  'INSTANCE',
  'GROUP',
]);

/**
 * 判断节点是否可作为页面级区块
 *
 * @param node - 待判定节点
 * @returns 容器类型或含子节点时为 true
 */
function isBlockContainer(node: ProcessedNode): boolean {
  if (node.visible === false) return false;
  if (CONTAINER_TYPES.has(node.originalType)) return true;
  return Array.isArray(node.children) && node.children.length > 0;
}

/**
 * 从节点名提取 ASCII PascalCase（用于 section 兜底命名；CJK/符号被剥离）
 *
 * @param raw - 原始节点名
 * @returns PascalCase 标识符；无可用 ASCII 片段时返回空串
 */
function toPascalCaseAscii(raw: string): string {
  return raw
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/**
 * 按关键词 + 几何位置判定单个区块类型
 *
 * @param node - 区块候选节点
 * @param order - 在兄弟中的序号（0 起）
 * @param total - 兄弟总数
 * @param containerHeight - 父容器高度（几何兜底用，缺省时跳过位置判定）
 * @returns 区块类型
 */
function classifyBlock(node: ProcessedNode, order: number, total: number, containerHeight?: number): PageBlockKind {
  const name = node.name || '';
  for (const rule of BLOCK_KEYWORD_RULES) {
    if (rule.pattern.test(name)) return rule.kind;
  }

  // 几何兜底：相对父级的 y 坐标 + 自身高度
  const y = node.position?.y;
  const height = node.size?.height ?? 0;
  if (typeof y === 'number' && typeof containerHeight === 'number' && containerHeight > 0) {
    // 顶部 12% 或 120px 以内 → header
    if (order === 0 && y <= Math.max(120, containerHeight * 0.12)) return 'header';
    // 底部 12% 区域内 → footer
    if (order === total - 1 && y + height >= containerHeight * 0.88) return 'footer';
    // 第一个大区块（占高 ≥ 40%）→ hero
    if (order === 0 && height >= containerHeight * 0.4) return 'hero';
  }
  return 'section';
}

/**
 * 为区块分配批次内唯一的 PascalCase 组件名
 *
 * @param kind - 区块类型
 * @param node - 区块节点（section 兜底时尝试取节点名）
 * @param used - 已占用名称集合（会被原地补入新名称）
 * @param sectionCount - section 序号计数（会被原地递增）
 * @returns 唯一组件名
 */
function allocateComponentName(
  kind: PageBlockKind,
  node: ProcessedNode,
  used: Set<string>,
  sectionCount: { value: number },
): string {
  let base = KIND_BASE_NAMES[kind];
  if (kind === 'section') {
    // section 优先采用节点名语义；纯 CJK/符号名统一编号 Section{n}
    const fromName = toPascalCaseAscii(node.name || '');
    if (fromName) {
      base = fromName;
    } else {
      sectionCount.value += 1;
      base = `${KIND_BASE_NAMES.section}${sectionCount.value}`;
    }
  }
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    if (kind === 'section') {
      sectionCount.value += 1;
      candidate = `${KIND_BASE_NAMES.section}${sectionCount.value}`;
    } else {
      candidate = `${base}${suffix}`;
      suffix += 1;
    }
  }
  used.add(candidate);
  return candidate;
}

/**
 * 将页面根节点拆分为区块（保持树中自上而下的顺序）
 *
 * @param root - 页面/大 Frame 精简节点
 * @returns 区块列表；根节点无可拆分子区块时返回单区块（整体作为 section）
 */
export function splitPageIntoBlocks(root: ProcessedNode): PageBlock[] {
  const candidates = (root.children ?? []).filter((child): child is ProcessedNode => isBlockContainer(child));
  const containerHeight = root.size?.height;

  if (candidates.length === 0) {
    const used = new Set<string>();
    const sectionCount = { value: 0 };
    return [
      {
        kind: 'section',
        node: root,
        sourceName: root.name || '',
        componentName: allocateComponentName('section', root, used, sectionCount),
      },
    ];
  }

  const used = new Set<string>();
  const sectionCount = { value: 0 };
  return candidates.map((node, index) => {
    const kind = classifyBlock(node, index, candidates.length, containerHeight);
    return {
      kind,
      node,
      sourceName: node.name || '',
      componentName: allocateComponentName(kind, node, used, sectionCount),
    };
  });
}

/**
 * 在树中按 Figma 节点 ID 收集区块（显式多选入口）
 *
 * 返回顺序按树中先序位置排列（与 splitPageIntoBlocks 的视觉顺序一致），
 * 因此「整页拆分」与「显式列出同批 nodeId」产物可逐文件对齐（TR-20.2）。
 *
 * @param root - 页面根节点
 * @param nodeIds - 目标 Figma 节点 ID 集合
 * @returns 命中的区块列表；一个 ID 都未命中时返回空数组（调用方给 i18n 空选择错误）
 */
export function selectBlocksByIds(root: ProcessedNode, nodeIds: readonly string[]): PageBlock[] {
  const wanted = new Set(nodeIds.map((id) => id.trim()).filter(Boolean));
  if (wanted.size === 0) return [];

  const found: ProcessedNode[] = [];
  const visit = (node: ProcessedNode): void => {
    if (wanted.has(node.figmaId)) {
      found.push(node);
      return; // 命中即作为区块根，不再下钻
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);

  if (found.length === 0) return [];

  const containerHeight = root.size?.height;
  const used = new Set<string>();
  const sectionCount = { value: 0 };
  return found.map((node, index) => {
    const kind = classifyBlock(node, index, found.length, containerHeight);
    return {
      kind,
      node,
      sourceName: node.name || '',
      componentName: allocateComponentName(kind, node, used, sectionCount),
    };
  });
}
