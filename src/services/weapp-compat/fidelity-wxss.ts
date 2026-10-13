/**
 * 方案 B WXSS 还原度覆盖率（WBS-P0-81）
 *
 * 口径（v1.4.20 R1 QA 加固为**按节点 + 属性值**比对）：
 *  - 分母（total）：节点树中"本方案承诺可还原"的视觉属性声明条数（节点→属性→期望值），
 *    来自 weapp-visual-style 同一份映射清单；
 *  - 分子（matched）：生成端**同一节点同一属性**上声明值规范化后相等的条数——
 *    颜色错误、尺寸错误或把其他节点的同名声明挪来都不计命中；
 *  - 排除项（excluded）：图片填充/多阴影等不承诺由本方案还原的特征，
 *    不进分母但在报告中可见。
 *
 * 早期仅按属性名计数的 {@link computeFidelity} 保留供离线文本审计，
 * 发布闸门使用 {@link computeNodeFidelity}。
 *
 * @module
 */

import type { ProcessedNode } from '../../types/nodes.js';
import { collectVisualDeclarations } from './weapp-visual-style.js';

export interface ExcludedItem {
  nodeId: string;
  /** 排除特征标识，如 fill:image / box-shadow:multi */
  property: string;
  reason: string;
}

export interface ExpectedProperties {
  /** 属性 → 期望出现条数（跨节点累计） */
  counts: Record<string, number>;
  excluded: ExcludedItem[];
}

export interface GeneratedProperties {
  /** 属性 → WXSS 中声明条数 */
  counts: Record<string, number>;
}

export interface FidelityReport {
  /** 覆盖率 0~1（分母为 0 时记 1） */
  rate: number;
  matched: number;
  total: number;
  /** 存在缺口的属性名 */
  missing: string[];
  excluded: ExcludedItem[];
}

/** 分母提取选项：与生成器实际渲染决策保持同一口径 */
export interface ExpectedOptions {
  /**
   * 渲染期被 wx:for 折叠的非原型成员 id（整棵子树跳过）。
   * 它们的视觉样式由原型节点生成的同一个 class 在运行时承载，
   * 计为缺失会系统性低估列表页覆盖率。
   */
  skipNodeIds?: Set<string>;
  /**
   * 不可见但承载结构指令（wx:if/hidden）仍会渲染的节点 id——不做剪枝。
   */
  forceRenderIds?: Set<string>;
}

/**
 * 遍历节点树，按节点收集承诺可还原属性声明（分母），并收集排除项。
 * 剪枝口径见 {@link ExpectedOptions}（必须与 WeappGenerator 渲染决策一致）。
 */
export function extractExpectedNodeProperties(
  root: ProcessedNode,
  frameDesignWidth: number,
  targetDesignWidth: number,
  options: ExpectedOptions = {},
): { byNode: Map<string, Record<string, string>>; excluded: ExcludedItem[] } {
  const byNode = new Map<string, Record<string, string>>();
  const excluded: ExcludedItem[] = [];
  const skipNodeIds = options.skipNodeIds ?? new Set<string>();
  const forceRenderIds = options.forceRenderIds ?? new Set<string>();
  const all: ProcessedNode[] = [];

  const walk = (node: ProcessedNode): void => {
    if (skipNodeIds.has(node.id)) {
      excluded.push({
        nodeId: node.id,
        property: 'list-folded-member',
        reason: 'wx:for 非原型成员，视觉样式由原型 class 在运行时承载',
      });
      return;
    }
    if (node.visible === false && !forceRenderIds.has(node.id)) {
      excluded.push({
        nodeId: node.id,
        property: 'invisible-node',
        reason: '节点不可见且未绑定结构指令，生成器不输出该子树',
      });
      return;
    }
    all.push(node);
    // 可复用组件实例：内部不由静态 WXSS 还原，子树不进分母
    if (node.role === 'reusable-component') {
      excluded.push({ nodeId: node.id, property: 'component-instance', reason: '自定义组件实例，静态 WXSS 不还原其内部' });
      return;
    }
    for (const c of node.children ?? []) walk(c);
  };
  walk(root);

  for (const node of all) {
    // 图片填充：由 <image> 资源管线承担
    if ((node.fills ?? []).some((f) => f.type === 'image')) {
      excluded.push({ nodeId: node.id, property: 'fill:image', reason: '图片填充由资源管线渲染为 <image>' });
    }
    // 多阴影叠加：仅承诺单阴影
    if ((node.effects ?? []).filter((e) => e.type === 'drop').length > 1) {
      excluded.push({ nodeId: node.id, property: 'box-shadow:multi', reason: '多阴影叠加不在静态 WXSS 承诺范围（交降级/人工）' });
    }

    const decls = collectVisualDeclarations(node, frameDesignWidth, targetDesignWidth);
    if (Object.keys(decls).length > 0) byNode.set(node.id, { ...decls });
  }

  return { byNode, excluded };
}

/**
 * 遍历节点树，累计承诺可还原属性（分母），并收集排除项。
 *
 * 剪枝口径必须与 WeappGenerator 的渲染决策一致：
 *  - skipNodeIds（wx:for 折叠成员）：整棵子树不渲染，登记排除项；
 *  - visible:false 且无结构指令：整棵子树不渲染，登记排除项；
 *  - reusable-component：节点本身不由静态 WXSS 还原（子树仍可能是普通节点，
 *    当前生成器直接输出自定义组件占位，故同样整棵剪枝）。
 */
export function extractExpectedProperties(
  root: ProcessedNode,
  frameDesignWidth: number,
  targetDesignWidth: number,
  options: ExpectedOptions = {},
): ExpectedProperties {
  const { byNode, excluded } = extractExpectedNodeProperties(root, frameDesignWidth, targetDesignWidth, options);
  const counts: Record<string, number> = {};
  for (const decls of byNode.values()) {
    for (const prop of Object.keys(decls)) counts[prop] = (counts[prop] ?? 0) + 1;
  }
  return { counts, excluded };
}

// ============ 值规范化与按节点比对（R1 QA 加固） ============

/** #abc/#ABCD → #aabbcc/#aabbccdd；其他字符串小写并压缩空白 */
export function canonicalDeclarationValue(raw: string): string {
  let v = raw.trim().replace(/\s+/g, ' ').toLowerCase();
  // 0 长度单位等价（0rpx/0px/0em）
  if (/^-?0(?:px|rpx|em|rem|pt|%)?$/.test(v)) return '0';
  // 十六进制颜色展开短写
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{4})$/i.exec(v.trim());
  if (hex) {
    const expanded = hex[1]!.split('').map((c) => c + c).join('');
    return `#${expanded}`;
  }
  return v;
}

/** 值不匹配的明细节点（发布闸门排障用） */
export interface MismatchedDeclaration {
  nodeId: string;
  property: string;
  expected: string;
  /** 该节点该属性实际生成的值；缺失时为 null */
  actual: string | null;
}

export interface NodeFidelityReport extends FidelityReport {
  /** 属性存在但值不等的明细（错色/错尺寸等） */
  mismatched: MismatchedDeclaration[];
}

/**
 * 按节点 + 属性 + 值计算还原度（发布闸门口径）。
 *
 * @param expected - {@link extractExpectedNodeProperties} 产出
 * @param generatedByNode - nodeId → 该节点生成 class 上的声明（生成器从 styleRules 直接提供，
 *                          避免 WXSS 文本解析与 class 归属二义性）
 */
export function computeNodeFidelity(
  expected: { byNode: Map<string, Record<string, string>>; excluded: ExcludedItem[] },
  generatedByNode: Map<string, Record<string, string>>,
): NodeFidelityReport {
  let total = 0;
  let matched = 0;
  const missingSet = new Set<string>();
  const mismatched: MismatchedDeclaration[] = [];

  for (const [nodeId, decls] of expected.byNode) {
    const actual = generatedByNode.get(nodeId) ?? {};
    for (const [prop, expectedValue] of Object.entries(decls)) {
      total += 1;
      const actualRaw = actual[prop];
      if (actualRaw === undefined) {
        missingSet.add(prop);
        mismatched.push({ nodeId, property: prop, expected: expectedValue, actual: null });
      } else if (canonicalDeclarationValue(expectedValue) === canonicalDeclarationValue(actualRaw)) {
        matched += 1;
      } else {
        missingSet.add(prop);
        mismatched.push({ nodeId, property: prop, expected: expectedValue, actual: actualRaw });
      }
    }
  }

  return {
    rate: total === 0 ? 1 : Math.round((matched / total) * 1000) / 1000,
    matched,
    total,
    missing: [...missingSet].sort(),
    mismatched,
    excluded: expected.excluded,
  };
}

/** 从生成 WXSS 文本统计每个属性的声明条数（分子） */
export function extractGeneratedProperties(wxss: string): GeneratedProperties {
  const counts: Record<string, number> = {};
  const ruleRe = /\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = ruleRe.exec(wxss)) !== null) {
    const body = m[1]!;
    for (const line of body.split(';')) {
      const decl = line.trim();
      if (!decl || decl.startsWith('/*')) continue;
      const colon = decl.indexOf(':');
      if (colon <= 0) continue;
      const prop = decl.slice(0, colon).trim();
      if (/^[a-z-]+$/.test(prop)) counts[prop] = (counts[prop] ?? 0) + 1;
    }
  }
  return { counts };
}

/**
 * 计算覆盖率：按属性把期望条数与生成条数 min 配对，避免单条生成声明重复抵扣多个节点。
 */
export function computeFidelity(expected: ExpectedProperties, wxss: string): FidelityReport {
  const generated = extractGeneratedProperties(wxss).counts;
  const excluded = expected.excluded;

  let total = 0;
  let matched = 0;
  const missing: string[] = [];

  for (const [prop, expCount] of Object.entries(expected.counts)) {
    total += expCount;
    const genCount = generated[prop] ?? 0;
    const hit = Math.min(expCount, genCount);
    matched += hit;
    if (hit < expCount) missing.push(prop);
  }

  return {
    rate: total === 0 ? 1 : Math.round((matched / total) * 1000) / 1000,
    matched,
    total,
    missing,
    excluded,
  };
}
