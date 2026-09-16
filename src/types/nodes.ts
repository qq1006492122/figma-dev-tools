/**
 * 精简后的 Figma 节点类型定义
 *
 * 本模块定义由 node-processor 处理后输出的节点类型。
 * 相比原始 Figma API 类型，这些类型去除了冗余层级，
 * 仅保留视觉渲染和布局计算所需的关键信息，更适合 AI 代码生成使用。
 *
 * 主要特点：
 * - 语义化角色标注（role）：决定代码生成时选择何种 HTML 标签/组件
 * - 扁平化布局属性：自动布局属性直接可用于 Flexbox 映射
 * - 标准化颜色/阴影/间距值：便于匹配 Design Token
 *
 * @module
 */

import type {
  ColorToken,
  TypographyToken,
  FigmaColor,
  FigmaNodeType,
  FigmaExportFormat,
  FigmaScaleMode,
  FigmaStrokeAlign,
  FigmaLayoutMode,
  FigmaSizingMode,
  FigmaPrimaryAxisAlign,
  FigmaCounterAxisAlign,
  FigmaLayoutWrap,
  FigmaTextAlignHorizontal,
  FigmaTextAlignVertical,
  FigmaTextDecoration,
  FigmaTextCase,
  CssColorValue,
} from '../types.js';

// ============================================================
// 语义节点类型
// ============================================================

/**
 * 节点语义角色枚举
 *
 * 用于在代码生成阶段选择合适的 HTML 标签或组件。
 * node-processor 会根据节点的名称、属性、层级结构自动推断语义角色。
 */
export type NodeSemanticRole =
  /** 普通容器（对应 div） */
  | 'container'
  /** 文本节点（对应 p/span/h1-h6） */
  | 'text'
  /** 按钮（对应 button 或 Button 组件） */
  | 'button'
  /** 图片（对应 img） */
  | 'image'
  /** 图标（SVG 或项目图标库组件） */
  | 'icon'
  /** 卡片容器（对应 Card 组件） */
  | 'card'
  /** 输入框（对应 input 或 Input 组件） */
  | 'input'
  /** 链接（对应 a 或 Link 组件） */
  | 'link'
  /** 头像（对应 Avatar 组件） */
  | 'avatar'
  /** 徽章/标签（对应 Badge 组件） */
  | 'badge'
  /** 分割线（对应 hr 或 Divider 组件） */
  | 'divider'
  /** 步骤条/流程节点 */
  | 'steps'
  /** Mac 窗口交通灯按钮组 */
  | 'traffic-light'
  /** 列表（对应 ul/ol） */
  | 'list'
  /** 列表项（对应 li） */
  | 'list-item'
  /** 页面区块（对应 section） */
  | 'section'
  /** Figma Component/Instance 可复用组件 */
  | 'reusable-component'
  /** 纯布局层（无视觉属性，仅传递 flex 布局，将被扁平化） */
  | 'layout-only';

// ============================================================
// 样式属性类型（精简）
// ============================================================

/**
 * 尺寸信息（宽高）
 */
export interface ProcessedSize {
  /** 宽度（像素） */
  width: number;
  /** 高度（像素） */
  height: number;
}

/**
 * 二维位置坐标
 */
export interface ProcessedPosition {
  /** X 坐标 */
  x: number;
  /** Y 坐标 */
  y: number;
}

/**
 * 内边距（四边）
 */
export interface ProcessedPadding {
  /** 上内边距 */
  top: number;
  /** 右内边距 */
  right: number;
  /** 下内边距 */
  bottom: number;
  /** 左内边距 */
  left: number;
}

/**
 * 四角圆角半径
 */
export interface ProcessedCornerRadius {
  /** 左上角圆角半径 */
  topLeft: number;
  /** 右上角圆角半径 */
  topRight: number;
  /** 右下角圆角半径 */
  bottomRight: number;
  /** 左下角圆角半径 */
  bottomLeft: number;
  /** 是否四角圆角相同（可使用统一 rounded-* 类名） */
  uniform?: boolean;
}

/**
 * 阴影效果（投影/内阴影）
 */
export interface ProcessedShadow {
  /** 阴影类型 */
  type: 'drop' | 'inner';
  /** X 轴偏移 */
  x: number;
  /** Y 轴偏移 */
  y: number;
  /** 模糊半径 */
  blur: number;
  /** 扩展距离 */
  spread: number;
  /** 阴影颜色 */
  color: FigmaColor;
}

/**
 * 渐变颜色停点
 */
export interface GradientStop {
  /** 停点位置，0-1 */
  position: number;
  /** 停点颜色 */
  color: FigmaColor;
}

/**
 * 渐变控制点位置
 */
export interface GradientHandlePosition {
  x: number;
  y: number;
}

/**
 * 纯色填充
 */
export interface ProcessedSolidFill {
  type: 'solid';
  color: FigmaColor;
  opacity?: number;
}

/**
 * 渐变填充（支持线性/径向/角度/菱形）
 *
 * v1.4.4 扩展：新增 gradient-radial / gradient-angular / gradient-diamond 类型，
 * 此前仅支持 gradient-linear，导致径向渐变等设计稿失真。
 */
export interface ProcessedGradientFill {
  /** 渐变类型 */
  type: 'gradient-linear' | 'gradient-radial' | 'gradient-angular' | 'gradient-diamond';
  /** 渐变控制点位置（Figma gradientHandlePositions） */
  gradientHandlePositions: GradientHandlePosition[];
  /** 渐变色标 */
  gradientStops: GradientStop[];
  /** 透明度 */
  opacity?: number;
}

/**
 * 图片填充
 */
export interface ProcessedImageFill {
  type: 'image';
  /** Figma 图片引用 hash（用于调用 /v1/images 端点导出） */
  imageRef?: string;
  /** 图片缩放模式 */
  scaleMode?: FigmaScaleMode;
  /** 透明度 */
  opacity?: number;
  /** 已解析的图片 URL（由 asset-downloader 或 figma-client 填充） */
  imageUrl?: string;
}

/**
 * 填充属性联合类型
 *
 * 支持纯色、线性渐变、图片三种填充类型。
 * 具体字段取决于 type 字段值。
 */
export type ProcessedFill = ProcessedSolidFill | ProcessedGradientFill | ProcessedImageFill;

/**
 * 描边属性
 */
export interface ProcessedStroke {
  /** 描边颜色 */
  color: FigmaColor;
  /** 描边粗细 */
  weight: number;
  /** 描边对齐方式 */
  align: FigmaStrokeAlign;
  /** 虚线模式 [线长, 间隙, ...] */
  dashPattern?: number[];
}

/**
 * 自动布局（Auto Layout）属性
 *
 * 这些属性可直接映射到 CSS Flexbox 属性：
 * - mode → flex-direction
 * - primaryAxisAlign → justify-content
 * - counterAxisAlign → align-items
 * - primaryAxisSizing → width (FIXED=固定, AUTO=自适应)
 * - padding → padding
 * - itemSpacing → gap
 */
export interface ProcessedAutoLayout {
  /** 布局方向（HORIZONTAL=row, VERTICAL=column, NONE=非自动布局） */
  mode: FigmaLayoutMode;
  /** 主轴对齐方式（justify-content） */
  primaryAxisAlign: FigmaPrimaryAxisAlign;
  /** 交叉轴对齐方式（align-items） */
  counterAxisAlign: FigmaCounterAxisAlign;
  /** 主轴尺寸模式 */
  primaryAxisSizing: FigmaSizingMode;
  /** 交叉轴尺寸模式 */
  counterAxisSizing: FigmaSizingMode;
  /** 是否换行（flex-wrap） */
  layoutWrap: FigmaLayoutWrap;
  /** 子项间距（gap） */
  itemSpacing: number;
  /** 交叉轴间距（多行/列时的行距/列距） */
  counterAxisSpacing?: number;
  /** 内边距 */
  padding: ProcessedPadding;
}

/**
 * 文本样式属性（精简版）
 */
export interface ProcessedTextStyle {
  /** 字体族 */
  fontFamily: string;
  /** 字重 */
  fontWeight: number;
  /** 字号（像素） */
  fontSize: number;
  /** 行高（像素） */
  lineHeightPx?: number;
  /** 字间距 */
  letterSpacing?: number;
  /** 水平对齐 */
  textAlignHorizontal?: FigmaTextAlignHorizontal;
  /** 垂直对齐 */
  textAlignVertical?: FigmaTextAlignVertical;
  /** 文本装饰 */
  textDecoration?: FigmaTextDecoration;
  /** 文本大小写 */
  textCase?: FigmaTextCase;
  /**
   * 富文本分段（v1.4.4 新增）。
   *
   * 当 TEXT 节点包含 characterStyleOverrides + styleOverrideTable 时，
   * 将文本按样式差异切分为多段，每段附带独立的样式信息。
   * 代码生成时用 <span> 包裹不同样式段，实现富文本还原。
   * 当前版本（v1.4.4）仅解析并透传，分段渲染计划在 v1.4.5 实现。
   */
  richTextSegments?: RichTextSegment[];
}

/**
 * 富文本段（v1.4.4 新增）
 *
 * 表示 TEXT 节点中一段连续的、样式一致的文本。
 */
export interface RichTextSegment {
  /** 该段文本内容 */
  text: string;
  /** 该段文本的样式覆盖（与节点基础 style 的差异） */
  styleOverrides: {
    /** 字重覆盖（如局部加粗） */
    fontWeight?: number;
    /** 字号覆盖 */
    fontSize?: number;
    /** 字体族覆盖 */
    fontFamily?: string;
    /** 颜色覆盖（fillStyle） */
    color?: FigmaColor;
  };
}

/**
 * align-self 属性值
 */
export type AlignSelf = 'STRETCH' | 'MIN' | 'CENTER' | 'MAX';

/**
 * 绝对定位信息
 *
 * 当节点不使用自动布局（layoutMode=NONE）时，
 * 使用绝对定位确定节点在父容器中的位置。
 */
export interface ProcessedAbsolutePosition {
  /** 距父容器左边距离 */
  left: number;
  /** 距父容器顶部距离 */
  top: number;
  /** 距父容器右边距离（可选） */
  right?: number;
  /** 距父容器底部距离（可选） */
  bottom?: number;
}

// ============================================================
// 资源引用类型
// ============================================================

/**
 * 资源类型
 */
export type AssetType = 'image' | 'icon' | 'svg';

/**
 * 资源引用信息
 *
 * 记录设计稿中图片/图标资源的元数据和引用路径。
 * 资源下载后会填充 localPath 和 cdnUrl 字段。
 */
export interface ProcessedAsset {
  /** Figma 节点 ID */
  nodeId: string;
  /** 资源名称（来自 Figma 节点名） */
  name: string;
  /** 资源类型 */
  type: AssetType;
  /** 导出格式 */
  format: FigmaExportFormat;
  /** Figma 图片填充引用 ID（从 fill.imageRef 获取，用于调用 images API） */
  imageRef?: string;
  /** 图片缩放模式 */
  scaleMode?: FigmaScaleMode;
  /** Figma 导出临时 URL（下载后失效） */
  exportUrl?: string;
  /** 下载后本地路径（相对于 public 目录） */
  localPath?: string;
  /** 通过 publicCdnUrl() 生成的 CDN 引用路径 */
  cdnUrl?: string;
  /** 资源宽度 */
  width?: number;
  /** 资源高度 */
  height?: number;
}

// ============================================================
// 精简节点类型
// ============================================================

/**
 * 框架无关的结构化节点（用于 figma_get_structured_data 输出）
 * 包含 type 字段（originalType 的别名），适用于任意框架
 */
export interface StructuredNode {
  /** 节点唯一 ID */
  id: string;
  /** 节点名称 */
  name: string;
  /** 节点类型（originalType 的别名，框架无关） */
  type: FigmaNodeType;
  /** 语义角色（决定代码生成策略） */
  role: NodeSemanticRole;
  /** 是否可见 */
  visible: boolean;
  /** 透明度，范围 0-1 */
  opacity?: number;
  /** 旋转角度（度） */
  rotation?: number;
  /** 是否裁剪子节点溢出内容 */
  clipsContent: boolean;
  /**
   * 是否为遮罩节点（Figma isMask）。
   *
   * v1.4.4 新增：此前 isMask 信息在 node-processor 中被消费但未透传到 ProcessedNode，
   * 导致矢量遮罩场景（如异形裁切、复杂 clip-path）在代码生成时静默丢失。
   * 当前版本检测到 isMask=true 时会输出 warning 引导手动处理，
   * 完整的 CSS clip-path / SVG mask 自动映射计划在 v1.5.0 实现。
   */
  isMask?: boolean;
  /** 尺寸信息 */
  size?: ProcessedSize;
  /** 相对父节点的位置 */
  position?: ProcessedPosition;
  /** 绝对定位信息（layoutMode=NONE 时存在） */
  absolutePosition?: ProcessedAbsolutePosition;
  /** 自动布局属性 */
  layout?: ProcessedAutoLayout;
  /** align-self 属性（layoutAlign） */
  alignSelf?: AlignSelf;
  /** flex-grow 拉伸因子（layoutGrow，Figma 中为 0 或 1） */
  flexGrow?: number;
  /** 填充（背景）列表 */
  fills?: ProcessedFill[];
  /** 描边列表 */
  strokes?: ProcessedStroke[];
  /** 圆角信息 */
  cornerRadius?: ProcessedCornerRadius;
  /** 阴影/模糊效果列表 */
  effects?: ProcessedShadow[];
  /** 文本内容（TEXT 节点存在） */
  textContent?: string;
  /** 文本样式（TEXT 节点存在） */
  textStyle?: ProcessedTextStyle;
  /** 关联的 Figma Component ID（COMPONENT/INSTANCE 节点） */
  componentId?: string;
  /** Component Key（用于组件映射查找） */
  componentKey?: string;
  /** Component 名称 */
  componentName?: string;
  /** Component Properties（v1.4.18 T10，COMPONENT 定义或 INSTANCE 当前值归一化） */
  componentProperties?: ProcessedComponentProperty[];
  /** 资源引用（图片/图标节点） */
  asset?: ProcessedAsset;
  /** 子节点列表 */
  children?: StructuredNode[];
  /** 节点原始 Figma ID（用于溯源和 API 调用） */
  figmaId: string;
  /** 扩展字段 */
  [key: string]: unknown;
}

/**
 * 规范化的 Component Property（v1.4.18 T10）。
 *
 * 由 node-processor 从 COMPONENT 的 componentPropertyDefinitions
 * 或 INSTANCE 的 componentProperties 归一化而来，供 props-type-generator
 * 推导 React/Vue 组件 Props 类型。
 */
export interface ProcessedComponentProperty {
  /** Figma 属性原始名（INSTANCE 的 #nodeId 后缀已剥离） */
  readonly name: string;
  /** 清洗后的合法 TS 标识符（camelCase，组件内唯一） */
  readonly propName: string;
  /** Figma 属性四分类 */
  readonly type: 'BOOLEAN' | 'INSTANCE_SWAP' | 'TEXT' | 'VARIANT';
  /** 是否必填（无默认值的 VARIANT 为 true；其余 Figma 属性均有默认值） */
  readonly required: boolean;
  /** 默认值（TEXT=字符串、BOOLEAN=布尔、VARIANT=默认变体名；无默认值或缺省） */
  readonly defaultValue?: string | boolean;
  /** VARIANT 全部可选值（来自定义；INSTANCE 场景可能缺省） */
  readonly variantOptions?: readonly string[];
  /** INSTANCE_SWAP 可交换目标 key 列表 */
  readonly preferredComponentKeys?: readonly string[];
}

/**
 * 精简后的 Figma 节点
 *
 * 这是 node-processor 输出的核心数据结构。
 * 相比原始 FigmaNode，去除了大量 API 原始字段，
 * 保留了代码生成所需的语义、布局、视觉信息。
 *
 * 处理流程：
 * 1. GROUP 节点扁平化（消除 div soup）
 * 2. 语义角色标注（role）
 * 3. 自动布局属性标准化
 * 4. 不可见/零尺寸节点过滤
 * 5. 资源提取和引用建立
 */
export interface ProcessedNode {
  /** 节点唯一 ID（处理后可能变化，用于构建树） */
  id: string;
  /** 节点名称 */
  name: string;
  /** 原始 Figma 节点类型 */
  originalType: FigmaNodeType;
  /** 语义角色（决定代码生成策略） */
  role: NodeSemanticRole;
  /** 是否可见 */
  visible: boolean;
  /** 透明度，范围 0-1 */
  opacity?: number;
  /** 旋转角度（度） */
  rotation?: number;
  /** 是否裁剪子节点溢出内容 */
  clipsContent: boolean;

  /** 尺寸信息 */
  size?: ProcessedSize;
  /** 相对父节点的位置 */
  position?: ProcessedPosition;
  /** 绝对定位信息（layoutMode=NONE 时存在） */
  absolutePosition?: ProcessedAbsolutePosition;

  /** 自动布局属性 */
  layout?: ProcessedAutoLayout;
  /** align-self 属性（layoutAlign） */
  alignSelf?: AlignSelf;
  /** flex-grow 拉伸因子（layoutGrow，Figma 中为 0 或 1） */
  flexGrow?: number;

  /** 填充（背景）列表 */
  fills?: ProcessedFill[];
  /** 描边列表 */
  strokes?: ProcessedStroke[];
  /** 圆角信息 */
  cornerRadius?: ProcessedCornerRadius;
  /** 阴影/模糊效果列表 */
  effects?: ProcessedShadow[];

  /** 文本内容（TEXT 节点存在） */
  textContent?: string;
  /** 文本样式（TEXT 节点存在） */
  textStyle?: ProcessedTextStyle;

  /** 关联的 Figma Component ID（COMPONENT/INSTANCE 节点） */
  componentId?: string;
  /** Component Key（用于组件映射查找） */
  componentKey?: string;
  /** Component 名称 */
  componentName?: string;
  /** Component Properties（v1.4.18 T10，COMPONENT 定义或 INSTANCE 当前值归一化） */
  componentProperties?: ProcessedComponentProperty[];

  /** 资源引用（图片/图标节点） */
  asset?: ProcessedAsset;

  /** 子节点列表（已精简处理） */
  children?: ProcessedNode[];

  /** 节点原始 Figma ID（用于溯源和 API 调用） */
  figmaId: string;
  /** 扁平化原因标记（调试用，记录该节点为何被保留/扁平化） */
  flattenReason?: string;
  /** 扩展字段（满足 MCP structuredContent 索引签名） */
  [key: string]: unknown;
}

// ============================================================
// 设计上下文类型
// ============================================================

/**
 * 节点概览信息
 *
 * 用于 get_metadata 轻量输出，仅包含节点的高层摘要信息，
 * 避免返回完整节点树导致上下文爆炸。
 */
export interface NodeOverview {
  /** 节点 ID */
  id: string;
  /** 节点名称 */
  name: string;
  /** 节点类型 */
  type: string;
  /** 节点尺寸 */
  size: ProcessedSize;
  /** 直接子节点数量 */
  childCount: number;
  /** 是否为 Component 或 Instance */
  isComponent: boolean;
  /** 是否包含图片填充 */
  hasImageFill: boolean;
  /** 是否包含文本 */
  hasText: boolean;
  /** 推断的语义角色 */
  semanticRole: NodeSemanticRole;
}

/**
 * 支持的元数据节点类型
 */
export type MetadataNodeType = 'CANVAS' | 'FRAME' | 'COMPONENT' | 'COMPONENT_SET' | 'SECTION';

/**
 * 文件/节点元数据
 *
 * 高层概览信息，输出大小控制在 4KB 以内，
 * 用于在开始实现前快速了解页面/Frame 的结构分区。
 *
 * 标准调用顺序：get_metadata → get_design_context → get_screenshot → download_assets
 */
export interface DesignMetadata {
  /** 节点名称 */
  name: string;
  /** 节点类型 */
  type: MetadataNodeType;
  /** 节点尺寸 */
  size: ProcessedSize;
  /** 直接子节点概览（仅一层） */
  children: NodeOverview[];
  /** 子节点总数（递归） */
  childCount: number;
  /** 使用的颜色（去重 hex 列表） */
  colorsUsed: CssColorValue[];
  /** 使用到的 Figma Component 名称列表 */
  componentsUsed: string[];
  /** 使用到的字体样式名称列表 */
  typographyStyles: string[];
  /** 图片填充数量 */
  imageCount: number;
  /** 文本节点数量 */
  textNodeCount: number;
  /** 数据来源：live=实时请求，stale-cache=陈旧缓存降级 */
  dataSource?: 'live' | 'stale-cache';
  /** 警告信息（如陈旧缓存降级、节点缺少尺寸等） */
  warnings?: string[];
  /** 扩展字段（满足 MCP structuredContent 索引签名） */
  [key: string]: unknown;
}

/**
 * 文本节点摘要
 */
export interface TextNodeSummary {
  /** 文本节点 ID */
  id: string;
  /** 文本内容 */
  content: string;
  /** 文本样式 Token */
  style: TypographyToken;
  /** 文本颜色（hex 格式） */
  color: CssColorValue;
  /** 字号 */
  fontSize: number;
  /** 字重 */
  fontWeight: number;
}

/**
 * 组件使用统计
 */
export interface ComponentUsage {
  /** 组件 ID */
  id: string;
  /** 组件名称 */
  name: string;
  /** 组件 Key */
  key?: string;
  /** 实例使用次数 */
  instanceCount: number;
}

/**
 * 完整设计上下文
 *
 * get_design_context 工具的输出结构，包含：
 * - 精简后的节点树
 * - 提取的颜色/间距/圆角/阴影 Token 值
 * - 资源列表
 * - 文本节点摘要
 * - 组件使用统计
 *
 * 此结构经过层级精简和语义标注，直接可用作 AI 代码生成的输入。
 */
export interface DesignContext {
  /** Figma 文件 Key（用于资源导出和 SVG 内联渲染） */
  fileKey: string;
  /** 精简后的节点树 */
  node: ProcessedNode;
  /** 该节点下使用的颜色 Token 列表 */
  colors: ColorToken[];
  /** 使用的间距值（去重升序排列） */
  spacing: number[];
  /** 使用的圆角值（去重升序排列） */
  radii: number[];
  /** 使用的阴影效果列表 */
  shadows: ProcessedShadow[];
  /** 使用的渐变填充列表（含渐变类型、控制点、停点、透明度，v1.4.2 新增） */
  gradients?: ProcessedGradientFill[];
  /** 资源列表 */
  assets: ProcessedAsset[];
  /** 文本节点摘要列表 */
  textNodes: TextNodeSummary[];
  /** 使用到的 Figma Component 统计 */
  componentsUsed: ComponentUsage[];
  /** 数据来源：live=实时请求，stale-cache=陈旧缓存降级（v1.4.2 新增） */
  dataSource?: 'live' | 'stale-cache';
  /** 节点处理统计（v1.4.2 新增） */
  processingStats?: ProcessingStats;
  /** 警告信息（如陈旧缓存降级、部分样式无法提取等，v1.4.2 新增） */
  warnings?: string[];
  /** 扩展字段（满足 MCP structuredContent 索引签名） */
  [key: string]: unknown;
}

// ============================================================
// 组件映射类型
// ============================================================

/**
 * 组件映射条目
 *
 * 将 Figma Component 名称映射到项目中实际使用的组件。
 * 支持默认导入、命名导入、内联代码等多种映射方式。
 */
export interface ComponentMapEntry {
  /** 导入来源路径 */
  import: string;
  /** 组件名称 */
  component: string;
  /** variant 属性值（如 Button 的 variant="primary"） */
  variant?: string;
  /** size 属性值 */
  size?: string;
  /** 是否使用内联代码（而非 import，适用于小型工具函数） */
  inline?: boolean;
  /** 内联代码字符串 */
  code?: string;
  /** 是否为默认导入（default import） */
  defaultImport?: boolean;
}

/**
 * 组件路径配置
 */
export interface ComponentPathConfig {
  /** UI 基础组件路径 */
  ui: string;
  /** Web 官方组件路径 */
  webOfficial: string;
  /** 体验共享组件路径 */
  experienceShared: string;
  /** 图标组件路径 */
  icons: string;
}

/**
 * 组件映射配置
 *
 * 定义 Figma 组件到项目代码组件的映射规则，
 * 以及场景目录组织方式。
 */
export interface ComponentMap {
  /** Figma Component 名称 → 项目组件映射 */
  components: Record<string, ComponentMapEntry>;
  /** 场景目录映射（场景名 → 路径） */
  scenes: Record<string, string>;
  /** 项目公共组件路径前缀 */
  componentPaths?: ComponentPathConfig;
}

// ============================================================
// 处理统计类型
// ============================================================

/**
 * 节点树处理统计
 *
 * 记录 node-processor 处理过程中的各项计数，
 * 用于调试和性能监控。
 */
export interface ProcessingStats {
  /** 原始节点数（处理前） */
  originalNodeCount: number;
  /** 精简后节点数（处理后） */
  processedNodeCount: number;
  /** 移除的冗余 GROUP 节点数 */
  flattenedGroupCount: number;
  /** 跳过的不可见节点数 */
  skippedInvisibleCount: number;
  /** 跳过的零尺寸节点数 */
  skippedZeroSizeCount: number;
  /** 识别出的资源数 */
  assetCount: number;
  /** 识别出的组件实例数 */
  componentInstanceCount: number;
  /** 处理耗时（毫秒） */
  durationMs: number;
}

/**
 * 节点处理结果
 */
export interface ProcessingResult {
  /** 处理后的精简节点树 */
  node: ProcessedNode;
  /** 处理统计信息 */
  stats: ProcessingStats;
}
