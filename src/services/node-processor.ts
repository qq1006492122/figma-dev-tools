/**
 * 节点树处理器 - Node Tree Processor
 *
 * 核心职责：
 * 1. **结构精简**：去除冗余 GROUP 包裹层，过滤不可见/零尺寸节点，消除 "div soup"
 * 2. **语义识别**：根据节点名称、类型、属性判断语义角色（Button/Card/Icon 等）
 * 3. **结构化输出**：将原始 FigmaNode 转换为精简的 ProcessedNode
 *
 * 扁平化规则（按执行顺序）：
 * - 规则1：visible=false、opacity≤0.01、尺寸≤0.1px → 直接跳过（不输出）
 * - 规则2：GROUP 无视觉属性且仅有1个子节点 → 子节点提升（消除单层包裹）
 * - 规则3：GROUP 无视觉属性且有多个子节点 → 子节点直接提升到父级（消除无意义 GROUP）
 * - 规则4：非根 FRAME 无视觉属性、命名为 wrapper/container 且只有1个子节点 → 标记 layout-only 并传递布局属性
 * - 规则5：BOOLEAN_OPERATION/VECTOR/ELLIPSE 等矢量图形 → 标记为 SVG/Icon 资源
 * - 规则6：COMPONENT/INSTANCE/COMPONENT_SET → 标记为 reusable-component
 */

// ============ 类型导入 ============

import type { FigmaNode, FigmaPaint, FigmaColor } from '../types.js';
import type {
  ProcessedNode,
  ProcessedSize,
  ProcessedCornerRadius,
  ProcessedShadow,
  ProcessedFill,
  ProcessedStroke,
  ProcessedAutoLayout,
  ProcessedTextStyle,
  ProcessedAbsolutePosition,
  ProcessedAsset,
  NodeSemanticRole,
  ProcessingStats,
  ProcessingResult,
} from '../types/nodes.js';

// ============ 配置类型 ============

/**
 * 节点处理器配置选项
 */
export interface NodeProcessorOptions {
  /** 最大处理深度 (-1 表示无限制) */
  maxDepth?: number;
  /** 是否跳过不可见节点（visible=false 或 opacity≈0） */
  skipInvisible?: boolean;
  /** 是否扁平化纯容器 GROUP/FRAME */
  flattenGroups?: boolean;
  /** 是否标记资源节点（图片/SVG/图标） */
  detectAssets?: boolean;
}

/** 默认处理选项 */
const DEFAULT_OPTIONS: Required<NodeProcessorOptions> = {
  maxDepth: -1,
  skipInvisible: true,
  flattenGroups: true,
  detectAssets: true,
};

// ============ 视觉属性判断工具 ============

/**
 * 判断节点是否有可见的视觉样式属性
 *
 * 检查以下属性是否存在且可见：
 * - fills：非 EMOJI 类型、非全透明 SOLID 填充
 * - strokes：有描边粗细且可见
 * - effects：DROP_SHADOW / INNER_SHADOW / BACKGROUND_BLUR 且可见
 * - backgroundColor：不透明度 > 0
 *
 * 注意：仅 cornerRadius 不算视觉属性，但可作为辅助判断标志
 *
 * @param node - Figma 节点
 * @returns 有视觉属性返回 true，否则返回 false
 */
function hasVisualProps(node: FigmaNode): boolean {
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

  if (node.backgroundColor && node.backgroundColor.a > 0) {
    return true;
  }

  return false;
}

/**
 * 判断节点是否仅用于布局（无视觉属性的 Auto Layout 容器）
 *
 * 这类节点在代码生成时可被扁平化，直接将 flex 布局属性传递给子节点，
 * 减少不必要的 div 嵌套层级。
 *
 * @param node - Figma 节点
 * @returns 纯布局节点返回 true
 */
function isLayoutOnly(node: FigmaNode): boolean {
  return !hasVisualProps(node) && node.type === 'FRAME' && node.layoutMode !== 'NONE';
}

/**
 * 判断节点是否是冗余的单层包裹 GROUP
 *
 * **扁平化原因**：Figma 设计师经常无意识创建单层 GROUP 包裹（如选中多个元素后按 Ctrl+G），
 * 这些 GROUP 没有任何视觉样式，仅起到逻辑分组作用，在代码中完全多余。
 *
 * 判断条件：
 * 1. 节点类型为 GROUP
 * 2. 无任何视觉属性（填充、描边、阴影、背景色）
 * 3. 有且仅有 1 个子节点
 *
 * @param node - Figma 节点
 * @returns 冗余单层 GROUP 返回 true
 */
function isRedundantGroup(node: FigmaNode): boolean {
  if (node.type !== 'GROUP') return false;
  if (hasVisualProps(node)) return false;
  if (!node.children || node.children.length !== 1) return false;
  return true;
}

/**
 * 判断节点是否应该被跳过（不输出到处理结果）
 *
 * 跳过条件：
 * 1. skipInvisible=true 且 visible=false
 * 2. 透明度 ≤ 0.01（几乎不可见）
 * 3. 边界框宽度或高度 ≤ 0.1px（零尺寸节点通常是辅助线或误操作）
 *
 * 注意：遮罩节点（isMask=true）不跳过，在代码生成时特殊处理
 *
 * @param node - Figma 节点
 * @param options - 处理选项（已合并默认值）
 * @returns 应该跳过返回 true
 */
function shouldSkipNode(node: FigmaNode, options: Required<NodeProcessorOptions>): boolean {
  if (options.skipInvisible && node.visible === false) return true;
  if (node.opacity !== undefined && node.opacity <= 0.01) return true;
  if (node.isMask) return false;
  const box = node.absoluteBoundingBox || node.absoluteRenderBounds;
  if (box && (box.width <= 0.1 || box.height <= 0.1)) return true;
  return false;
}

// ============ 颜色工具 ============

/**
 * 将 FigmaColor（0-1 浮点数）转换为 hex 字符串（用于概览统计和去重）
 *
 * @param color - Figma 颜色对象
 * @returns Hex 颜色字符串（如 "#FF5500" 或 "#FF550080" 含 alpha）
 */
function _figmaColorToHex(color: FigmaColor): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  if (color.a !== undefined && color.a < 1) {
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}${Math.round(
      color.a * 255,
    )
      .toString(16)
      .padStart(2, '0')}`;
  }
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ============ 样式属性提取函数 ============

/**
 * 提取节点的填充属性列表
 *
 * 处理顺序：
 * 1. 遍历 node.fills 数组，转换每个可见填充
 * 2. 处理 node.backgroundColor（CANVAS/FRAME 等节点的背景色）
 *
 * @param node - Figma 节点
 * @returns 处理后的填充列表，无填充返回 undefined
 */
function extractFills(node: FigmaNode): ProcessedFill[] | undefined {
  const fills: ProcessedFill[] = [];

  if (node.fills) {
    for (const fill of node.fills) {
      if (fill.visible === false) continue;
      const result = convertFill(fill);
      if (result) fills.push(result);
    }
  }

  if (node.backgroundColor && node.backgroundColor.a > 0) {
    fills.push({
      type: 'solid',
      color: node.backgroundColor,
      opacity: node.backgroundColor.a,
    });
  }

  return fills.length > 0 ? fills : undefined;
}

/**
 * 转换单个 Figma Paint 为 ProcessedFill
 *
 * @param fill - Figma 填充对象
 * @returns 标准化填充对象，无法转换返回 null
 */
function convertFill(fill: FigmaPaint): ProcessedFill | null {
  switch (fill.type) {
    case 'SOLID': {
      if (!fill.color) return null;
      return {
        type: 'solid',
        color: fill.color,
        opacity: fill.opacity ?? fill.color.a,
      };
    }
    case 'GRADIENT_LINEAR': {
      if (!fill.gradientStops || !fill.gradientHandlePositions) return null;
      return {
        type: 'gradient-linear',
        gradientHandlePositions: fill.gradientHandlePositions.map((p) => ({ x: p.x, y: p.y })),
        gradientStops: fill.gradientStops.map((s) => ({ position: s.position, color: s.color })),
        opacity: fill.opacity,
      };
    }
    case 'IMAGE': {
      return {
        type: 'image',
        imageRef: fill.imageRef,
        scaleMode: fill.scaleMode,
        opacity: fill.opacity,
      };
    }
    default:
      return null;
  }
}

/**
 * 提取节点的描边属性列表
 *
 * 仅处理 SOLID 类型的可见描边，忽略渐变/图片描边（罕见场景）。
 *
 * @param node - Figma 节点
 * @returns 处理后的描边列表，无有效描边返回 undefined
 */
function extractStrokes(node: FigmaNode): ProcessedStroke[] | undefined {
  if (!node.strokes || node.strokes.length === 0 || !node.strokeWeight || node.strokeWeight <= 0) {
    return undefined;
  }

  const strokes: ProcessedStroke[] = [];
  for (const stroke of node.strokes) {
    if (stroke.visible === false || stroke.type !== 'SOLID' || !stroke.color) continue;
    strokes.push({
      color: stroke.color,
      weight: node.strokeWeight,
      align: node.strokeAlign || 'INSIDE',
      dashPattern: node.strokeDashes ? [...node.strokeDashes] : undefined,
    });
  }

  return strokes.length > 0 ? strokes : undefined;
}

/**
 * 提取节点的圆角信息
 *
 * 支持两种圆角表示方式：
 * - cornerRadius：统一圆角（四角相同）
 * - rectangleCornerRadii：四角独立圆角 [tl, tr, br, bl]
 *
 * @param node - Figma 节点
 * @returns 标准化圆角对象，无圆角返回 undefined
 */
function extractCornerRadius(node: FigmaNode): ProcessedCornerRadius | undefined {
  if (node.cornerRadius === undefined && !node.rectangleCornerRadii) return undefined;

  if (node.rectangleCornerRadii) {
    const [tl, tr, br, bl] = node.rectangleCornerRadii;
    const uniform = tl === tr && tr === br && br === bl;
    return {
      topLeft: tl,
      topRight: tr,
      bottomRight: br,
      bottomLeft: bl,
      uniform,
    };
  }

  if (node.cornerRadius !== undefined) {
    return {
      topLeft: node.cornerRadius,
      topRight: node.cornerRadius,
      bottomRight: node.cornerRadius,
      bottomLeft: node.cornerRadius,
      uniform: true,
    };
  }

  return undefined;
}

/**
 * 提取节点的阴影/模糊效果
 *
 * 仅处理 DROP_SHADOW 和 INNER_SHADOW，忽略 LAYER_BLUR（代码中极少使用）。
 *
 * @param node - Figma 节点
 * @returns 阴影列表，无有效阴影返回 undefined
 */
function extractEffects(node: FigmaNode): ProcessedShadow[] | undefined {
  if (!node.effects || node.effects.length === 0) return undefined;

  const shadows: ProcessedShadow[] = [];
  for (const effect of node.effects) {
    if (!effect.visible) continue;
    if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
      shadows.push({
        type: effect.type === 'DROP_SHADOW' ? 'drop' : 'inner',
        x: effect.offset?.x || 0,
        y: effect.offset?.y || 0,
        blur: effect.radius,
        spread: effect.spread || 0,
        color: effect.color || { r: 0, g: 0, b: 0, a: 0 },
      });
    }
  }

  return shadows.length > 0 ? shadows : undefined;
}

/**
 * 提取节点的自动布局（Auto Layout）属性
 *
 * 将 Figma Auto Layout 属性映射为 CSS Flexbox 等价属性：
 * - mode → flex-direction
 * - primaryAxisAlign → justify-content
 * - counterAxisAlign → align-items
 * - padding → padding
 * - itemSpacing → gap
 *
 * @param node - Figma 节点
 * @returns 自动布局对象，非 Auto Layout 节点返回 undefined
 */
function extractAutoLayout(node: FigmaNode): ProcessedAutoLayout | undefined {
  if (!node.layoutMode || node.layoutMode === 'NONE') return undefined;

  return {
    mode: node.layoutMode,
    primaryAxisAlign: node.primaryAxisAlignItems || 'MIN',
    counterAxisAlign: node.counterAxisAlignItems || 'MIN',
    primaryAxisSizing: node.primaryAxisSizingMode || 'AUTO',
    counterAxisSizing: node.counterAxisSizingMode || 'AUTO',
    layoutWrap: node.layoutWrap || 'NO_WRAP',
    itemSpacing: node.itemSpacing || 0,
    counterAxisSpacing: node.counterAxisSpacing,
    padding: {
      top: node.paddingTop || 0,
      right: node.paddingRight || node.paddingLeft || 0,
      bottom: node.paddingBottom || node.paddingTop || 0,
      left: node.paddingLeft || 0,
    },
  };
}

/**
 * 提取 TEXT 节点的文本样式属性
 *
 * @param node - Figma 节点
 * @returns 文本样式对象，非 TEXT 节点返回 undefined
 */
function extractTextStyle(node: FigmaNode): ProcessedTextStyle | undefined {
  if (node.type !== 'TEXT' || !node.style) return undefined;

  return {
    fontFamily: node.style.fontFamily,
    fontWeight: node.style.fontWeight,
    fontSize: node.style.fontSize,
    lineHeightPx: node.style.lineHeightPx,
    letterSpacing: node.style.letterSpacing,
    textAlignHorizontal: node.style.textAlignHorizontal,
    textAlignVertical: node.style.textAlignVertical,
    textDecoration: node.style.textDecoration,
    textCase: node.style.textCase,
  };
}

/**
 * 提取节点尺寸（宽高）
 *
 * 优先使用 absoluteBoundingBox，不存在时回退到 absoluteRenderBounds。
 *
 * @param node - Figma 节点
 * @returns 尺寸对象，无边界框返回 undefined
 */
function extractSize(node: FigmaNode): ProcessedSize | undefined {
  const box = node.absoluteBoundingBox || node.absoluteRenderBounds;
  if (!box) return undefined;
  return { width: box.width, height: box.height };
}

// ============ 语义角色检测 ============

/**
 * 检测节点的语义角色
 *
 * 检测启发式规则（按优先级从高到低）：
 *
 * 1. **TEXT 节点** → `text`（文本段落/标题）
 *    - 所有 TEXT 类型节点直接判定为文本角色
 *
 * 2. **COMPONENT/COMPONENT_SET/INSTANCE** → `reusable-component`（可复用组件）
 *    - Figma 组件实例应映射到项目中已有的组件
 *
 * 3. **图片节点** → `image`（图片）
 *    - RECTANGLE + IMAGE 填充
 *    - 名称包含 image/img/图片/插图/插画
 *
 * 4. **Mac 窗口交通灯** → `traffic-light`
 *    - 名称含 traffic、window+dot、交通灯
 *
 * 5. **步骤条/流程节点** → `steps`
 *    - 名称含 step/timeline/流程/步骤/节点
 *
 * 6. **按钮** → `button`
 *    - 名称含 button/btn/按钮/下载/download
 *    - primary + action/cta 组合
 *
 * 7. **图标** → `icon`
 *    - 矢量类型：VECTOR/BOOLEAN_OPERATION/STAR/LINE/REGULAR_POLYGON
 *    - 名称含 icon/图标/ic-/ico
 *    - **例外**：ELLIPSE 类型且尺寸 ≤12px 的小圆点保守判定为 container（可能是状态指示器）
 *
 * 8. **头像** → `avatar`
 *    - 名称含 avatar/头像/profile
 *
 * 9. **徽章/标签** → `badge`
 *    - 名称含 badge/tag/标签/chip
 *
 * 10. **输入框** → `input`
 *     - 名称含 input/textfield/输入/search
 *
 * 11. **链接** → `link`
 *     - 名称含 link/href/链接
 *
 * 12. **分割线** → `divider`
 *     - 名称含 divider/separator/分割线/分隔线
 *
 * 13. **卡片** → `card`
 *     - 名称含 card/卡片
 *     - 名称含"容器"且有视觉属性
 *
 * 14. **纯布局层** → `layout-only`
 *     - FRAME + Auto Layout + 无视觉属性
 *     - 代码生成时可跳过此层，直接渲染子节点
 *
 * 15. **列表** → `list`
 *     - 名称含 list/列表
 *
 * 16. **列表项** → `list-item`
 *     - 名称含 list-item/item/列表项
 *     - 注意：此规则在 list 之后，避免 "list-item" 被 "list" 抢先匹配
 *
 * 17. **页面区块** → `section`
 *     - SECTION 类型节点
 *     - 名称含 section/区块/Section
 *
 * 18. **兜底** → `container`（普通 div 容器）
 *
 * @param node - Figma 节点
 * @param _hasChildren - 是否有子节点（预留参数，当前未使用）
 * @returns 语义角色枚举值
 */
function detectSemanticRole(node: FigmaNode, _hasChildren: boolean): NodeSemanticRole {
  const name = node.name.toLowerCase();

  if (node.type === 'TEXT') return 'text';

  if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET' || node.type === 'INSTANCE') {
    return 'reusable-component';
  }

  if (node.type === 'RECTANGLE' && node.fills) {
    for (const fill of node.fills) {
      if (fill.type === 'IMAGE') return 'image';
    }
  }
  if (
    name.includes('image') ||
    name.includes('img') ||
    name.includes('图片') ||
    name.includes('插图') ||
    name.includes('插画')
  ) {
    return 'image';
  }

  if (name.includes('traffic') || (name.includes('window') && name.includes('dot')) || name.includes('交通灯')) {
    return 'traffic-light';
  }

  if (
    name.includes('step') ||
    name.includes('timeline') ||
    name.includes('流程') ||
    name.includes('步骤') ||
    name.includes('节点')
  ) {
    return 'steps';
  }

  if (
    name.includes('button') ||
    name.includes('btn') ||
    name.includes('按钮') ||
    (name.includes('primary') && (name.includes('action') || name.includes('cta'))) ||
    name.includes('下载') ||
    name.includes('download')
  ) {
    return 'button';
  }

  if (
    node.type === 'VECTOR' ||
    node.type === 'BOOLEAN_OPERATION' ||
    node.type === 'STAR' ||
    node.type === 'LINE' ||
    node.type === 'ELLIPSE' ||
    node.type === 'REGULAR_POLYGON' ||
    name.includes('icon') ||
    name.includes('图标') ||
    name.includes('ic-') ||
    name.includes('ico')
  ) {
    if (node.type === 'ELLIPSE' && hasVisualProps(node) && node.absoluteBoundingBox) {
      const size = Math.min(node.absoluteBoundingBox.width, node.absoluteBoundingBox.height);
      if (size <= 12) return 'container';
    }
    return 'icon';
  }

  if (name.includes('avatar') || name.includes('头像') || name.includes('profile')) {
    return 'avatar';
  }

  if (name.includes('badge') || name.includes('tag') || name.includes('标签') || name.includes('chip')) {
    return 'badge';
  }

  if (name.includes('input') || name.includes('textfield') || name.includes('输入') || name.includes('search')) {
    return 'input';
  }

  if (name.includes('link') || name.includes('href') || name.includes('链接')) {
    return 'link';
  }

  if (name.includes('divider') || name.includes('separator') || name.includes('分割线') || name.includes('分隔线')) {
    return 'divider';
  }

  if (name.includes('card') || name.includes('卡片') || (name.includes('容器') && hasVisualProps(node))) {
    return 'card';
  }

  if (isLayoutOnly(node)) {
    return 'layout-only';
  }

  if (name.includes('list') || name.includes('列表')) {
    return 'list';
  }
  if (name.includes('list-item') || name.includes('item') || name.includes('列表项')) {
    return 'list-item';
  }

  if (node.type === 'SECTION' || name.includes('section') || name.includes('区块') || name.includes('Section')) {
    return 'section';
  }

  return 'container';
}

/**
 * 判断子节点是否为有效可见节点（用于子节点计数）
 *
 * @param child - Figma 子节点
 * @returns 可见返回 true
 */
function _isValidChild(child: FigmaNode): boolean {
  return child.visible !== false && !(child.opacity !== undefined && child.opacity <= 0.01);
}

// ============ NodeProcessor 类 ============

/**
 * 节点树处理器类
 *
 * 将 Figma API 返回的原始节点树转换为精简、语义化的 ProcessedNode 树。
 * 通过工厂函数 {@link createNodeProcessor} 创建实例。
 *
 * @example
 * ```typescript
 * const processor = createNodeProcessor({ maxDepth: 5, flattenGroups: true });
 * const result = processor.process(rawFigmaNode);
 * console.log(`Flattened ${result.stats.flattenedGroupCount} groups`);
 * ```
 */
export class NodeProcessor {
  /** 处理选项（已合并默认值） */
  private options: Required<NodeProcessorOptions>;
  /** 处理统计信息 */
  private stats: ProcessingStats;

  /**
   * 构造函数 - 初始化节点处理器
   *
   * @param options - 处理器配置选项
   */
  constructor(options: NodeProcessorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.stats = this._createEmptyStats();
  }

  /**
   * 创建空的统计信息对象
   *
   * @returns 初始化的 ProcessingStats
   */
  private _createEmptyStats(): ProcessingStats {
    return {
      originalNodeCount: 0,
      processedNodeCount: 0,
      flattenedGroupCount: 0,
      skippedInvisibleCount: 0,
      skippedZeroSizeCount: 0,
      assetCount: 0,
      componentInstanceCount: 0,
      durationMs: 0,
    };
  }

  /**
   * 处理节点树（入口方法）
   *
   * 处理流程：
   * 1. 重置统计信息
   * 2. 统计原始节点数
   * 3. 递归处理节点（应用扁平化规则）
   * 4. 记录处理耗时
   *
   * @param rootNode - Figma 根节点（DOCUMENT/CANVAS/FRAME 等）
   * @returns 处理结果，包含精简后的节点树和统计信息
   */
  process(rootNode: FigmaNode): ProcessingResult {
    this.stats = this._createEmptyStats();
    const startTime = Date.now();

    this._countNodes(rootNode);

    const processed = this._processNode(rootNode, 0, null);

    this.stats.durationMs = Date.now() - startTime;

    return {
      node: processed!,
      stats: this.stats,
    };
  }

  /**
   * 递归统计原始节点总数
   *
   * @param node - 当前节点
   */
  private _countNodes(node: FigmaNode): void {
    this.stats.originalNodeCount++;
    if (node.children) {
      for (const child of node.children) {
        this._countNodes(child);
      }
    }
  }

  /**
   * 递归处理单个节点（核心方法）
   *
   * **扁平化规则执行顺序**：
   * 1. 深度检查 → 超过 maxDepth 返回 null
   * 2. 跳过检查 → 不可见/零尺寸节点返回 null
   * 3. 单包 GROUP 提升（规则2）→ 直接返回子节点处理结果
   * 4. 处理子节点 → 多子无视觉 GROUP 子节点提升（规则3）
   * 5. Wrapper FRAME 标记（规则4）→ 保留但标记已扁平化
   * 6. 提取样式属性 → 构建 ProcessedNode
   * 7. 语义角色检测
   * 8. 资源检测
   *
   * @param node - 当前 Figma 节点
   * @param depth - 当前递归深度
   * @param parent - 父 ProcessedNode（用于绝对定位计算）
   * @returns 处理后的节点，被跳过返回 null
   */
  private _processNode(node: FigmaNode, depth: number, parent: ProcessedNode | null): ProcessedNode | null {
    if (this.options.maxDepth >= 0 && depth > this.options.maxDepth) {
      return null;
    }

    if (shouldSkipNode(node, this.options)) {
      if (node.visible === false || (node.opacity !== undefined && node.opacity <= 0.01)) {
        this.stats.skippedInvisibleCount++;
      } else {
        this.stats.skippedZeroSizeCount++;
      }
      return null;
    }

    // ============ 扁平化规则2：单包 GROUP 提升 ============
    // 原因：设计师无意识创建的单层 GROUP 包裹在代码中完全多余
    if (this.options.flattenGroups && isRedundantGroup(node) && node.children && node.children.length === 1) {
      this.stats.flattenedGroupCount++;
      const child = node.children[0]!;
      return this._processNode(child, depth, parent);
    }

    // ============ 处理子节点 ============
    let processedChildren: ProcessedNode[] = [];
    if (node.children && node.children.length > 0) {
      // ============ 扁平化规则3：多子无视觉 GROUP 子节点提升 ============
      // 原因：无填充/描边/阴影的 GROUP 只是逻辑分组，HTML 中不需要嵌套 div
      const shouldFlattenGroupChildren = node.type === 'GROUP' && !hasVisualProps(node) && node.children.length > 1;

      for (const child of node.children) {
        const processedChild = this._processNode(child, depth + 1, null);
        if (processedChild) {
          if (shouldFlattenGroupChildren && this.options.flattenGroups) {
            this.stats.flattenedGroupCount++;
            if (processedChild.children) {
              processedChildren.push(...processedChild.children);
            } else {
              processedChildren.push(processedChild);
            }
          } else {
            processedChildren.push(processedChild);
          }
        }
      }
    }

    // ============ 扁平化规则4：Wrapper/Container FRAME 处理 ============
    // 原因：命名为 wrapper/container 的纯布局 FRAME 通常是为了 Auto Layout 而加的包裹层，
    // 代码中可将其布局属性传递给唯一子节点，减少嵌套
    if (
      processedChildren.length === 1 &&
      node.type === 'FRAME' &&
      isLayoutOnly(node) &&
      depth > 0 &&
      node.name.toLowerCase().match(/wrapper|container|group|frame|组|包裹/)
    ) {
      this.stats.flattenedGroupCount++;
      processedChildren = [processedChildren[0]!];
    }

    // ============ 提取样式属性 ============
    const size = extractSize(node);
    const fills = extractFills(node);
    const strokes = extractStrokes(node);
    const cornerRadius = extractCornerRadius(node);
    const effects = extractEffects(node);
    const layout = extractAutoLayout(node);
    const textStyle = extractTextStyle(node);

    const role = detectSemanticRole(node, processedChildren.length > 0);

    let asset: ProcessedAsset | undefined;
    if (this.options.detectAssets) {
      asset = this._detectAsset(node);
      if (asset) this.stats.assetCount++;
    }

    let _absolutePosition: ProcessedAbsolutePosition | undefined;
    if (node.layoutMode === 'NONE' && node.absoluteBoundingBox && parent?.size) {
      _absolutePosition = {
        left: node.absoluteBoundingBox.x,
        top: node.absoluteBoundingBox.y,
      };
    }

    if (role === 'reusable-component') {
      this.stats.componentInstanceCount++;
    }

    const processedNode: ProcessedNode = {
      id: `${node.id}-${depth}`,
      name: node.name,
      originalType: node.type,
      role,
      visible: node.visible !== false,
      opacity: node.opacity,
      rotation: node.rotation,
      clipsContent: node.clipsContent === true,
      size,
      layout,
      alignSelf:
        node.layoutAlign && node.layoutAlign !== 'INHERIT'
          ? (node.layoutAlign as 'STRETCH' | 'MIN' | 'CENTER' | 'MAX')
          : undefined,
      flexGrow: node.layoutGrow,
      fills,
      strokes,
      cornerRadius,
      effects,
      textContent: node.type === 'TEXT' ? node.characters : undefined,
      textStyle,
      componentId: node.componentId,
      componentKey: node.key,
      componentName: node.componentId ? node.name : undefined,
      asset,
      children: processedChildren.length > 0 ? processedChildren : undefined,
      figmaId: node.id,
    };

    // layout-only 节点的布局属性传递给唯一子节点
    if (role === 'layout-only' && processedChildren.length === 1 && depth > 0) {
      const child = processedChildren[0]!;
      if (!child.layout && layout) {
        child.layout = layout;
      }
    }

    this.stats.processedNodeCount++;
    return processedNode;
  }

  /**
   * 检测节点是否为可导出资源（图片/SVG/图标）
   *
   * 检测顺序：
   * 1. IMAGE 填充的 RECTANGLE → PNG 图片
   * 2. 矢量图形节点（VECTOR/BOOLEAN_OPERATION/STAR/LINE 等）→ SVG 或图标
   *    - 名称含 icon/ic- 或尺寸 ≤64px → icon 类型
   *    - 其他 → svg 类型
   *    - ELLIPSE 且尺寸 ≤16px 视为状态点而非图标/资源（由 _isDot 判断）
   * 3. 明确设置了 exportSettings 的节点 → 按指定格式导出
   *
   * @param node - Figma 节点
   * @returns 资源元数据，非资源节点返回 undefined
   */
  private _detectAsset(node: FigmaNode): ProcessedAsset | undefined {
    if (node.fills) {
      for (const fill of node.fills) {
        if (fill.type === 'IMAGE' && fill.imageRef) {
          return {
            nodeId: node.id,
            name: this._sanitizeFileName(node.name),
            type: 'image',
            format: 'PNG',
            imageRef: fill.imageRef,
            scaleMode: fill.scaleMode,
            width: node.absoluteBoundingBox?.width,
            height: node.absoluteBoundingBox?.height,
          };
        }
      }
    }

    if (
      node.type === 'VECTOR' ||
      node.type === 'BOOLEAN_OPERATION' ||
      node.type === 'STAR' ||
      node.type === 'LINE' ||
      (node.type === 'ELLIPSE' && !this._isDot(node)) ||
      node.type === 'REGULAR_POLYGON'
    ) {
      const isIcon =
        node.name.toLowerCase().includes('icon') ||
        node.name.toLowerCase().includes('ic-') ||
        (node.absoluteBoundingBox && node.absoluteBoundingBox.width <= 64 && node.absoluteBoundingBox.height <= 64);

      return {
        nodeId: node.id,
        name: this._sanitizeFileName(node.name),
        type: isIcon ? 'icon' : 'svg',
        format: 'SVG',
        width: node.absoluteBoundingBox?.width,
        height: node.absoluteBoundingBox?.height,
      };
    }

    if (node.exportSettings && node.exportSettings.length > 0) {
      const setting = node.exportSettings[0]!;
      return {
        nodeId: node.id,
        name: this._sanitizeFileName(node.name),
        type: setting.format === 'SVG' ? 'svg' : 'image',
        format: setting.format,
        width: node.absoluteBoundingBox?.width,
        height: node.absoluteBoundingBox?.height,
      };
    }

    return undefined;
  }

  /**
   * 判断 ELLIPSE 是否只是一个小圆点（状态指示器）
   *
   * 小圆点（≤16px）通常表示在线状态、通知红点等，
   * 不需要作为 SVG 资源导出，直接用 CSS 绘制即可。
   *
   * @param node - Figma 节点（应为 ELLIPSE 类型）
   * @returns 是状态点返回 true
   */
  private _isDot(node: FigmaNode): boolean {
    if (!node.absoluteBoundingBox) return false;
    const size = Math.min(node.absoluteBoundingBox.width, node.absoluteBoundingBox.height);
    return size <= 16;
  }

  /**
   * 清理文件名，移除文件系统不允许的特殊字符
   *
   * 处理规则：
   * 1. 移除非字母数字/中文/连字符/下划线/空格的字符
   * 2. 空白字符替换为连字符
   * 3. 合并连续连字符
   * 4. 去除首尾连字符
   * 5. 转为小写
   * 6. 空名称兜底为 'asset'
   *
   * @param name - 原始文件名
   * @returns 安全的文件名
   */
  private _sanitizeFileName(name: string): string {
    return (
      name
        .replace(/[^a-zA-Z0-9\u4e00-\u9fa5\-_\s]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase() || 'asset'
    );
  }

  /**
   * 获取处理统计信息（副本）
   *
   * @returns 处理统计信息的浅拷贝
   */
  getStats(): ProcessingStats {
    return { ...this.stats };
  }
}

// ============ 工厂函数 ============

/**
 * 创建节点处理器实例的工厂函数
 *
 * @param options - 处理器配置选项
 * @returns NodeProcessor 实例
 */
export function createNodeProcessor(options?: NodeProcessorOptions): NodeProcessor {
  return new NodeProcessor(options);
}
