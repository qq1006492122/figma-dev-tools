/**
 * 层级结构修复服务 - Hierarchy Fixer
 *
 * 核心职责：修复 Figma 设计稿中不标准的层级结构问题
 *
 * **解决的问题：**
 * 1. **父子层级错位**：设计师可能将应该是子节点的元素放在父节点平级（绝对定位元素常见）
 * 2. **极端嵌套**：自动检测并警告过深层级（>30层），防止栈溢出
 * 3. **循环引用**：检测并打破节点树中的循环引用
 * 4. **重复包裹**：检测连续多层无意义包裹容器
 * 5. **兄弟节点重叠**：根据绝对坐标检测应该嵌套的节点
 *
 * **修复策略：**
 * - 坐标包含检测：如果节点 B 的 boundingBox 完全在节点 A 内部，且 B 与 A 平级，则 B 应该是 A 的子节点
 * - 命名语义辅助：节点名包含 "icon"、"label" 等子元素关键词，优先嵌套到最近的父容器
 * - Auto Layout 识别：正确识别 Auto Layout 容器，保持其直接子节点关系
 * - 保守修复：只做高置信度的自动修复，低置信度只给出警告
 *
 * @module
 */

import type { FigmaNode } from '../types.js';
import type { ProcessedNode } from '../types/nodes.js';

// ============ 类型定义 ============

export interface HierarchyIssue {
  /** 问题类型 */
  type:
    | 'nested_too_deep'
    | 'misplaced_child'
    | 'redundant_wrapper'
    | 'circular_reference'
    | 'overlapping_siblings'
    | 'empty_container';
  /** 问题节点 ID */
  nodeId?: string;
  /** 问题节点名称 */
  nodeName?: string;
  /** 建议父节点 ID */
  suggestedParentId?: string;
  /** 严重程度 */
  severity: 'error' | 'warning' | 'info';
  /** 问题描述 */
  message: string;
  /** 修复建议 */
  suggestion?: string;
  /** 是否可以自动修复 */
  autoFixable: boolean;
}

export interface HierarchyFixResult {
  /** 是否进行了修复 */
  fixed: boolean;
  /** 发现的问题列表 */
  issues: HierarchyIssue[];
  /** 原节点数 */
  originalNodeCount: number;
  /** 修复后节点数 */
  fixedNodeCount: number;
  /** 最大深度（修复前） */
  originalMaxDepth: number;
  /** 最大深度（修复后） */
  fixedMaxDepth: number;
  /** 自动修复的问题数 */
  autoFixedCount: number;
}

export interface HierarchyFixOptions {
  /** 最大允许深度（超过则警告，默认 30） */
  maxDepth?: number;
  /** 是否自动修复高置信度问题（默认 true） */
  autoFix?: boolean;
  /** 检测重叠兄弟节点（根据坐标包含关系，默认 true） */
  detectOverlapping?: boolean;
  /** 坐标包含重叠阈值（0-1，默认 0.9，即节点 90% 面积在容器内才视为子节点） */
  containmentThreshold?: number;
  /** 是否检测冗余包裹（默认 true） */
  detectRedundantWrappers?: boolean;
  /** 冗余包裹的最大连续层数（默认 5） */
  maxWrapperDepth?: number;
}

const DEFAULT_OPTIONS: Required<HierarchyFixOptions> = {
  maxDepth: 30,
  autoFix: true,
  detectOverlapping: true,
  containmentThreshold: 0.9,
  detectRedundantWrappers: true,
  maxWrapperDepth: 5,
};

/** 子元素关键词：节点名包含这些词时，优先视为子元素 */
const CHILD_KEYWORD_PATTERNS = [
  /icon/i,
  /label/i,
  /text/i,
  /title/i,
  /subtitle/i,
  /description/i,
  /badge/i,
  /tag/i,
  /avatar/i,
  /image/i,
  /img/i,
  /logo/i,
  /button/i,
  /arrow/i,
  /chevron/i,
  /icon-/,
  /ic-/,
  /图标/,
  /文字/,
  /标题/,
  /按钮/,
  /标签/,
  /图片/,
  /头像/,
];

// ============ 内部递归节点类型 ============

/**
 * 层级遍历用的通用填充/描边/效果类型
 */
interface HierarchyFill {
  visible?: boolean;
  type?: string;
  color?: { a?: number };
}

interface HierarchyEffect {
  visible?: boolean;
  type?: string;
}

/**
 * 层级遍历用的通用节点类型
 * 兼容 FigmaNode 和 ProcessedNode 两种格式
 */
interface HierarchyNode {
  id?: string;
  figmaId?: string;
  name?: string;
  type?: string;
  visible?: boolean;
  layoutMode?: string;
  children?: HierarchyNode[];
  fills?: HierarchyFill[];
  strokes?: HierarchyFill[];
  effects?: HierarchyEffect[];
  strokeWeight?: number;
  backgroundColor?: { a?: number };
  absoluteBoundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  position?: {
    x: number;
    y: number;
  };
  size?: {
    width: number;
    height: number;
  };
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

// ============ Bounding Box 工具 ============

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 获取节点的 bounding box（兼容 absoluteBoundingBox 和相对坐标）
 */
function getNodeBounds(node: FigmaNode | ProcessedNode): BoundingBox | null {
  // ProcessedNode 使用 size + position
  const hNode = node as unknown as HierarchyNode;

  // absoluteBoundingBox（Figma API 格式）
  if (hNode.absoluteBoundingBox) {
    const box = hNode.absoluteBoundingBox;
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  }

  // ProcessedNode 格式：position + size
  if (hNode.position && hNode.size) {
    return {
      x: hNode.position.x,
      y: hNode.position.y,
      width: hNode.size.width,
      height: hNode.size.height,
    };
  }

  // FigmaNode 原始格式
  if (hNode.x !== undefined && hNode.y !== undefined) {
    return {
      x: hNode.x,
      y: hNode.y,
      width: hNode.width || 0,
      height: hNode.height || 0,
    };
  }

  return null;
}

/**
 * 计算 inner 被 outer 包含的比例
 */
function containmentRatio(inner: BoundingBox, outer: BoundingBox): number {
  const innerRight = inner.x + inner.width;
  const innerBottom = inner.y + inner.height;
  const outerRight = outer.x + outer.width;
  const outerBottom = outer.y + outer.height;

  // 完全不重叠
  if (inner.x >= outerRight || innerRight <= outer.x || inner.y >= outerBottom || innerBottom <= outer.y) {
    return 0;
  }

  // 计算重叠区域
  const overlapX = Math.max(0, Math.min(innerRight, outerRight) - Math.max(inner.x, outer.x));
  const overlapY = Math.max(0, Math.min(innerBottom, outerBottom) - Math.max(inner.y, outer.y));
  const overlapArea = overlapX * overlapY;
  const innerArea = inner.width * inner.height;

  if (innerArea <= 0) return 0;
  return overlapArea / innerArea;
}

/**
 * 判断节点名是否包含子元素关键词
 */
function hasChildKeyword(name: string): boolean {
  return CHILD_KEYWORD_PATTERNS.some((pattern) => pattern.test(name));
}

// ============ 主类 ============

export class HierarchyFixer {
  private _options: Required<HierarchyFixOptions>;
  private _visitedNodes = new Set<string>();
  private _issues: HierarchyIssue[] = [];
  private _originalNodeCount = 0;
  private _fixedNodeCount = 0;
  private _maxOriginalDepth = 0;
  private _maxFixedDepth = 0;
  private _autoFixedCount = 0;

  /** 硬递归上限：超过 maxDepth+10 后停止继续下钻，防止脏数据导致栈溢出 */
  private get _hardMaxDepth(): number {
    return this._options.maxDepth + 10;
  }

  constructor(options: Partial<HierarchyFixOptions> = {}) {
    this._options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * 分析并修复节点树层级问题
   *
   * @param root - 根节点
   * @returns 修复结果（包含问题列表和统计信息）
   */
  fix(root: FigmaNode | ProcessedNode): HierarchyFixResult {
    this._visitedNodes.clear();
    this._issues = [];
    this._originalNodeCount = 0;
    this._fixedNodeCount = 0;
    this._maxOriginalDepth = 0;
    this._maxFixedDepth = 0;
    this._autoFixedCount = 0;

    // 1. 第一遍：统计节点数、检测深度和循环引用
    this._originalNodeCount = this._countNodes(root as unknown as HierarchyNode, 0, new Set<string>());

    // 2. 第二遍：检测层级问题
    this._walkAndDetect(root as unknown as HierarchyNode, 0, null, []);

    // 3. 如果启用自动修复，执行修复
    if (this._options.autoFix) {
      this._applyFixes(root as unknown as HierarchyNode);
      // 修复后重新统计
      this._fixedNodeCount = this._countNodes(root as unknown as HierarchyNode, 0, new Set<string>());
      this._maxFixedDepth = this._measureDepth(root as unknown as HierarchyNode, 0, new Set<string>());
    } else {
      this._fixedNodeCount = this._originalNodeCount;
      this._maxFixedDepth = this._maxOriginalDepth;
    }

    return {
      fixed: this._autoFixedCount > 0,
      issues: this._issues,
      originalNodeCount: this._originalNodeCount,
      fixedNodeCount: this._fixedNodeCount,
      originalMaxDepth: this._maxOriginalDepth,
      fixedMaxDepth: this._maxFixedDepth,
      autoFixedCount: this._autoFixedCount,
    };
  }

  /**
   * 仅检测问题不修复（用于 lint 命令）
   */
  detectIssues(root: FigmaNode | ProcessedNode): HierarchyIssue[] {
    this._visitedNodes.clear();
    this._issues = [];
    this._maxOriginalDepth = 0;

    this._walkAndDetect(root as unknown as HierarchyNode, 0, null, []);
    return this._issues;
  }

  /**
   * 检测 ProcessedNode 树的层级问题（用于 lint 场景，基于已处理的节点树）
   *
   * 与 detectIssues 的区别：
   * - 不做坐标包含检测（ProcessedNode 缺少绝对坐标信息）
   * - 只检测深度、冗余包裹、空容器、循环引用
   * - 安全轻量，不需要原始 Figma 节点数据
   */
  detectProcessedNodeIssues(root: ProcessedNode): HierarchyIssue[] {
    this._visitedNodes.clear();
    this._issues = [];
    this._maxOriginalDepth = 0;

    this._walkProcessedNode(root, 0, new Set<string>());
    return this._issues;
  }

  /**
   * 递归遍历 ProcessedNode 检测问题
   */
  private _walkProcessedNode(node: ProcessedNode, depth: number, visited: Set<string>): void {
    const nodeId = node.figmaId || node.id;
    const nodeName = node.name || 'Unknown';

    // P3-12：路径式 visited（add/finally-delete），消除每子节点 Set 复制（O(n²)→O(n)）
    if (nodeId) {
      if (visited.has(nodeId)) {
        this._issues.push({
          type: 'circular_reference',
          nodeId,
          nodeName,
          severity: 'error',
          message: `检测到循环引用: 节点 "${nodeName}"`,
          autoFixable: false,
        });
        return;
      }
      visited.add(nodeId);
    }

    try {
      this._walkProcessedNodeInner(node, depth, visited);
    } finally {
      if (nodeId) visited.delete(nodeId);
    }
  }

  private _walkProcessedNodeInner(node: ProcessedNode, depth: number, visited: Set<string>): void {
    const nodeId = node.figmaId || node.id;
    const nodeName = node.name || 'Unknown';

    // 过深层级检测；硬上限处立即停止递归，避免深层/自环脏数据造成栈溢出
    if (depth > this._hardMaxDepth) {
      this._issues.push({
        type: 'nested_too_deep',
        nodeId,
        nodeName,
        severity: 'error',
        message: `嵌套层级超过安全上限: "${nodeName}" 位于第 ${depth} 层，已停止继续遍历`,
        suggestion: '检查节点树是否异常深或存在循环引用',
        autoFixable: false,
      });
      return;
    }
    if (depth > this._options.maxDepth) {
      this._issues.push({
        type: 'nested_too_deep',
        nodeId,
        nodeName,
        severity: 'warning',
        message: `嵌套层级过深: "${nodeName}" 位于第 ${depth} 层（建议不超过 ${this._options.maxDepth} 层）`,
        suggestion: '合并无意义的包裹层，使用组件复用减少嵌套',
        autoFixable: false,
      });
    }

    // 空容器检测
    if (
      (!node.children || node.children.length === 0) &&
      !node.fills &&
      !node.strokes &&
      !node.effects &&
      !node.textContent &&
      !node.asset &&
      depth > 0
    ) {
      this._issues.push({
        type: 'empty_container',
        nodeId,
        nodeName,
        severity: 'info',
        message: `空容器: "${nodeName}" 没有子节点也没有视觉样式`,
        suggestion: '删除空的容器节点以简化结构',
        autoFixable: true,
      });
    }

    // 冗余包裹链检测（连续多个只有一个子节点的容器）
    let wrapperChain = 0;
    let current: ProcessedNode | undefined = node;
    const wrapperSeen = new Set<ProcessedNode>();
    while (
      wrapperChain <= this._options.maxWrapperDepth &&
      current &&
      !wrapperSeen.has(current) &&
      current.children &&
      current.children.length === 1 &&
      !current.fills &&
      !current.strokes &&
      !current.effects
    ) {
      wrapperSeen.add(current);
      wrapperChain++;
      current = current.children[0];
    }
    if (wrapperChain >= this._options.maxWrapperDepth) {
      this._issues.push({
        type: 'redundant_wrapper',
        nodeId,
        nodeName,
        severity: 'warning',
        message: `冗余包裹链: "${nodeName}" 有连续 ${wrapperChain} 层无意义包裹`,
        suggestion: '取消不必要的分组',
        autoFixable: true,
      });
    }

    // 递归处理子节点
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        this._walkProcessedNode(child, depth + 1, visited);
      }
    }
  }

  /**
   * 统计节点总数。
   * P3-12：路径式 visited（add/finally-delete），消除每子节点 Set 复制。
   */
  private _countNodes(node: HierarchyNode, depth: number, visited: Set<string>): number {
    const nodeId = node.id || node.figmaId;
    if (nodeId) {
      if (visited.has(nodeId)) {
        return 0; // 循环引用，跳过
      }
      visited.add(nodeId);
    }

    try {
      this._maxOriginalDepth = Math.max(this._maxOriginalDepth, depth);

      let count = 1;
      if (depth >= this._hardMaxDepth) return count;
      if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
          count += this._countNodes(child, depth + 1, visited);
        }
      }
      return count;
    } finally {
      if (nodeId) visited.delete(nodeId);
    }
  }

  /**
   * 测量树深度。
   * P3-12：路径式 visited（add/finally-delete），消除每子节点 Set 复制。
   */
  private _measureDepth(node: HierarchyNode, depth: number, visited: Set<string>): number {
    const nodeId = node.id || node.figmaId;
    if (nodeId) {
      if (visited.has(nodeId)) return depth;
      visited.add(nodeId);
    }

    try {
      let maxChildDepth = depth;
      if (depth >= this._hardMaxDepth) return maxChildDepth;
      if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
          const childDepth = this._measureDepth(child, depth + 1, visited);
          maxChildDepth = Math.max(maxChildDepth, childDepth);
        }
      }
      return maxChildDepth;
    } finally {
      if (nodeId) visited.delete(nodeId);
    }
  }

  /**
   * 递归遍历并检测层级问题
   */
  private _walkAndDetect(
    node: HierarchyNode,
    depth: number,
    parent: HierarchyNode | null,
    siblingPath: HierarchyNode[],
  ): void {
    const nodeId = node.id || node.figmaId;
    const nodeName = node.name || 'Unknown';

    // 检测循环引用
    if (nodeId) {
      if (this._visitedNodes.has(nodeId)) {
        this._issues.push({
          type: 'circular_reference',
          nodeId,
          nodeName,
          severity: 'error',
          message: `检测到循环引用: 节点 "${nodeName}" 被重复引用`,
          suggestion: '检查 Figma 文件中是否存在组件实例循环嵌套',
          autoFixable: false,
        });
        return;
      }
      this._visitedNodes.add(nodeId);
    }

    // 检测过深层级；硬上限处停止继续下钻
    if (depth > this._hardMaxDepth) {
      this._issues.push({
        type: 'nested_too_deep',
        nodeId,
        nodeName,
        severity: 'error',
        message: `嵌套层级超过安全上限: "${nodeName}" 位于第 ${depth} 层，已停止继续遍历`,
        suggestion: '检查节点树是否异常深或存在循环引用',
        autoFixable: false,
      });
      return;
    }
    if (depth > this._options.maxDepth) {
      this._issues.push({
        type: 'nested_too_deep',
        nodeId,
        nodeName,
        severity: 'warning',
        message: `嵌套层级过深: "${nodeName}" 位于第 ${depth} 层（建议不超过 ${this._options.maxDepth} 层）`,
        suggestion: '合并无意义的 GROUP/FRAME 包裹层，使用组件复用减少嵌套',
        autoFixable: false,
      });
    }

    // 检测空容器
    if (
      (!node.children || node.children.length === 0) &&
      (node.type === 'FRAME' || node.type === 'GROUP' || node.type === 'COMPONENT') &&
      !hasVisualProps(node) &&
      depth > 0
    ) {
      this._issues.push({
        type: 'empty_container',
        nodeId,
        nodeName,
        severity: 'info',
        message: `空容器: "${nodeName}" 没有子节点也没有视觉样式`,
        suggestion: '删除空的容器节点以简化结构',
        autoFixable: true,
      });
    }

    // 检测重叠兄弟节点（坐标包含关系）
    if (this._options.detectOverlapping && siblingPath.length > 0) {
      const nodeBounds = getNodeBounds(node as unknown as FigmaNode | ProcessedNode);
      if (nodeBounds) {
        // 只检测有子元素关键词的节点，或完全在其他兄弟节点内的节点
        const looksLikeChild = hasChildKeyword(nodeName);

        // 从后向前查找最近的可能父节点
        for (let i = siblingPath.length - 1; i >= 0; i--) {
          const sibling = siblingPath[i];
          if (!sibling || sibling === node) continue;

          const siblingBounds = getNodeBounds(sibling as unknown as FigmaNode | ProcessedNode);
          if (!siblingBounds) continue;

          // 跳过没有尺寸的节点
          if (siblingBounds.width <= 0 || siblingBounds.height <= 0) continue;
          if (nodeBounds.width <= 0 || nodeBounds.height <= 0) continue;

          // Auto Layout 容器的直接子节点不需要重定位（它们本身就是正确的子节点）
          if (sibling.layoutMode && sibling.layoutMode !== 'NONE' && sibling.children?.includes(node)) {
            continue;
          }

          const ratio = containmentRatio(nodeBounds, siblingBounds);

          // 高置信度：>90% 包含 且 有子元素关键词
          if (ratio >= this._options.containmentThreshold && looksLikeChild) {
            this._issues.push({
              type: 'misplaced_child',
              nodeId,
              nodeName,
              suggestedParentId: sibling.id || sibling.figmaId,
              severity: 'warning',
              message: `可能错位的子节点: "${nodeName}" 有 ${(ratio * 100).toFixed(0)}% 面积在 "${sibling.name}" 内部，但它们是平级关系`,
              suggestion: `将 "${nodeName}" 移入 "${sibling.name}" 内部`,
              autoFixable: true,
            });
            break; // 只建议最近的容器
          }

          // 中等置信度：完全包含但无子元素关键词
          if (ratio >= 0.98 && !looksLikeChild) {
            this._issues.push({
              type: 'overlapping_siblings',
              nodeId,
              nodeName,
              suggestedParentId: sibling.id || sibling.figmaId,
              severity: 'info',
              message: `节点重叠: "${nodeName}" 完全在 "${sibling.name}" 内部`,
              suggestion: '如果是子元素，请移入对应容器；如果是绝对定位浮层，请确认层级关系',
              autoFixable: false,
            });
            break;
          }
        }
      }
    }

    // 检测冗余包裹链（连续多个无视觉属性的单层容器）
    if (this._options.detectRedundantWrappers) {
      let wrapperChain = 0;
      let current: HierarchyNode | undefined = node;
      const wrapperSeen = new Set<HierarchyNode>();
      while (
        wrapperChain <= this._options.maxWrapperDepth &&
        current &&
        !wrapperSeen.has(current) &&
        (current.type === 'FRAME' || current.type === 'GROUP') &&
        !hasVisualProps(current) &&
        current.children?.length === 1
      ) {
        wrapperSeen.add(current);
        wrapperChain++;
        current = current.children[0];
      }
      if (wrapperChain >= this._options.maxWrapperDepth) {
        this._issues.push({
          type: 'redundant_wrapper',
          nodeId,
          nodeName,
          severity: 'warning',
          message: `冗余包裹链: "${nodeName}" 有连续 ${wrapperChain} 层无意义包裹`,
          suggestion: '使用 Cmd+Option+G (macOS) 或 Ctrl+G 取消不必要的分组',
          autoFixable: true,
        });
      }
    }

    // 递归处理子节点
    if (node.children && Array.isArray(node.children)) {
      const newSiblings = [...siblingPath, node];
      for (const child of node.children) {
        this._walkAndDetect(child, depth + 1, node, newSiblings);
      }
    }
  }

  /**
   * 应用自动修复
   *
   * 当前自动修复：
   * - 标记空容器为 invisible（让 node-processor 跳过）
   * - 高置信度错位子节点移动到建议父节点
   */
  private _applyFixes(root: HierarchyNode): void {
    // 首先收集需要移动的节点（高置信度 misplaced_child）
    const moves: Array<{ node: HierarchyNode; fromParent: HierarchyNode | null; toParentId: string }> = [];
    const nodesToHide: HierarchyNode[] = [];

    // 建立 ID -> 节点和父节点映射
    const nodeMap = new Map<string, { node: HierarchyNode; parent: HierarchyNode | null }>();
    this._buildNodeMap(root, null, nodeMap);

    for (const issue of this._issues) {
      if (issue.type === 'misplaced_child' && issue.autoFixable && issue.nodeId && issue.suggestedParentId) {
        const nodeInfo = nodeMap.get(issue.nodeId);
        const parentInfo = nodeMap.get(issue.suggestedParentId);
        if (nodeInfo && parentInfo) {
          // 再次验证包含关系（修复前确认）
          const nodeBounds = getNodeBounds(nodeInfo.node as unknown as FigmaNode | ProcessedNode);
          const parentBounds = getNodeBounds(parentInfo.node as unknown as FigmaNode | ProcessedNode);
          if (nodeBounds && parentBounds) {
            const ratio = containmentRatio(nodeBounds, parentBounds);
            if (ratio >= this._options.containmentThreshold && hasChildKeyword(issue.nodeName || '')) {
              moves.push({
                node: nodeInfo.node,
                fromParent: nodeInfo.parent,
                toParentId: issue.suggestedParentId,
              });
              continue;
            }
          }
        }
      }

      if (issue.type === 'empty_container' && issue.autoFixable && issue.nodeId) {
        const nodeInfo = nodeMap.get(issue.nodeId);
        if (nodeInfo) {
          nodesToHide.push(nodeInfo.node);
        }
      }
    }

    // 执行移动
    for (const move of moves) {
      // 从原父节点移除
      if (move.fromParent && Array.isArray(move.fromParent.children)) {
        const idx = move.fromParent.children.indexOf(move.node);
        if (idx >= 0) {
          move.fromParent.children.splice(idx, 1);
        }
      }

      // 添加到新父节点
      const newParentInfo = nodeMap.get(move.toParentId);
      if (newParentInfo && Array.isArray(newParentInfo.node.children)) {
        newParentInfo.node.children.push(move.node);
        this._autoFixedCount++;
      }
    }

    // 标记空容器为 invisible
    for (const node of nodesToHide) {
      node.visible = false;
      this._autoFixedCount++;
    }
  }

  /**
   * 构建节点 ID -> 节点 + 父节点映射
   */
  private _buildNodeMap(
    node: HierarchyNode,
    parent: HierarchyNode | null,
    map: Map<string, { node: HierarchyNode; parent: HierarchyNode | null }>,
    seen: Set<HierarchyNode> = new Set(),
    depth = 0,
  ): void {
    if (depth > this._hardMaxDepth || seen.has(node)) return;
    seen.add(node);
    try {
      const nodeId = node.id || node.figmaId;
      if (nodeId) {
        map.set(nodeId, { node, parent });
      }

      if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
          this._buildNodeMap(child, node, map, seen, depth + 1);
        }
      }
    } finally {
      seen.delete(node);
    }
  }
}

/**
 * 简化版 hasVisualProps（不依赖其他模块）
 */
function hasVisualProps(node: HierarchyNode): boolean {
  if (node.fills && node.fills.length > 0) {
    for (const fill of node.fills) {
      if (fill.visible !== false && fill.type !== 'EMOJI') {
        if (fill.type === 'SOLID' && fill.color && fill.color.a === 0) {
          continue;
        }
        return true;
      }
    }
  }

  if (node.strokes && node.strokes.length > 0 && node.strokeWeight && node.strokeWeight > 0) {
    for (const stroke of node.strokes) {
      if (stroke.visible !== false) return true;
    }
  }

  if (node.effects && node.effects.length > 0) {
    for (const effect of node.effects) {
      if (
        effect.visible &&
        (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW' || effect.type === 'BACKGROUND_BLUR')
      ) {
        return true;
      }
    }
  }

  if (node.backgroundColor && (node.backgroundColor.a ?? 0) > 0) {
    return true;
  }

  return false;
}

/**
 * 创建层级修复器实例
 */
export function createHierarchyFixer(options?: Partial<HierarchyFixOptions>): HierarchyFixer {
  return new HierarchyFixer(options);
}
