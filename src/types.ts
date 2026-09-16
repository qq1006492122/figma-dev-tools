/**
 * Figma 开发工具类型定义
 *
 * 本模块定义了 Figma API 数据结构、设计 Tokens、代码生成配置等核心类型。
 * 类型分为以下几个部分：
 * - Figma API 基础类型：对应 Figma REST API 返回的原始数据结构
 * - Figma 组件/样式/变量类型：Figma 高级特性相关类型
 * - 设计 Tokens 类型：从 Figma 提取的标准化设计令牌
 * - 代码生成类型：组件代码生成相关的配置和结果类型
 * - CLI 配置类型：工具运行配置和同步结果类型
 * - URL 解析类型：Figma 链接解析结果类型
 *
 * @packageDocumentation
 */

// ============================================================
// 品牌类型（Branded Types）- 用于类型安全的字符串标识
// ============================================================

/** Figma 文件 Key 品牌类型，防止与普通字符串混淆 */
export type FigmaFileKey = string;

/** Figma 节点 ID 品牌类型，格式如 "123:456" */
export type FigmaNodeId = string;

/** Figma 组件 Key 品牌类型 */
export type FigmaComponentKey = string;

/** CSS 颜色值字符串（hex/rgb/hsl/oklch） */
export type CssColorValue = string;

// ============================================================
// Figma API 枚举类型
// ============================================================

/**
 * Figma 节点类型枚举
 * 对应 Figma REST API 中节点的 type 字段所有可能值
 * @see https://www.figma.com/developers/api#node-types
 */
export type FigmaNodeType =
  | 'DOCUMENT'
  | 'CANVAS'
  | 'FRAME'
  | 'GROUP'
  | 'VECTOR'
  | 'BOOLEAN_OPERATION'
  | 'STAR'
  | 'LINE'
  | 'ELLIPSE'
  | 'REGULAR_POLYGON'
  | 'RECTANGLE'
  | 'TEXT'
  | 'SLICE'
  | 'COMPONENT'
  | 'COMPONENT_SET'
  | 'INSTANCE'
  | 'STICKY'
  | 'SHAPE_WITH_TEXT'
  | 'CONNECTOR'
  | 'SECTION';

/**
 * Figma 混合模式枚举
 * 定义图层与下方图层的像素混合方式
 */
export type FigmaBlendMode =
  | 'PASS_THROUGH'
  | 'NORMAL'
  | 'DARKEN'
  | 'MULTIPLY'
  | 'LINEAR_BURN'
  | 'COLOR_BURN'
  | 'LIGHTEN'
  | 'SCREEN'
  | 'LINEAR_DODGE'
  | 'COLOR_DODGE'
  | 'OVERLAY'
  | 'SOFT_LIGHT'
  | 'HARD_LIGHT'
  | 'DIFFERENCE'
  | 'EXCLUSION'
  | 'HUE'
  | 'SATURATION'
  | 'COLOR'
  | 'LUMINOSITY';

/**
 * Figma 线条端点样式
 */
export type FigmaStrokeCap = 'NONE' | 'ROUND' | 'SQUARE' | 'LINE_ARROW' | 'TRIANGLE_ARROW';

/**
 * Figma 线条连接样式
 */
export type FigmaStrokeJoin = 'MITER' | 'BEVEL' | 'ROUND';

/**
 * Figma 填充类型枚举
 */
export type FigmaPaintType =
  | 'SOLID'
  | 'GRADIENT_LINEAR'
  | 'GRADIENT_RADIAL'
  | 'GRADIENT_ANGULAR'
  | 'GRADIENT_DIAMOND'
  | 'IMAGE'
  | 'EMOJI';

/**
 * Figma 效果类型枚举
 */
export type FigmaEffectType = 'INNER_SHADOW' | 'DROP_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR';

/**
 * Figma 图片缩放模式
 */
export type FigmaScaleMode = 'FILL' | 'FIT' | 'TILE' | 'STRETCH';

/**
 * Figma 描边对齐方式
 */
export type FigmaStrokeAlign = 'INSIDE' | 'OUTSIDE' | 'CENTER';

/**
 * Figma 布局方向
 */
export type FigmaLayoutMode = 'NONE' | 'HORIZONTAL' | 'VERTICAL';

/**
 * Figma 自动布局主轴尺寸模式
 */
export type FigmaSizingMode = 'FIXED' | 'AUTO';

/**
 * Figma 自动布局主轴对齐方式
 */
export type FigmaPrimaryAxisAlign = 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';

/**
 * Figma 自动布局交叉轴对齐方式
 */
export type FigmaCounterAxisAlign = 'MIN' | 'CENTER' | 'MAX' | 'BASELINE';

/**
 * Figma 自动布局换行模式
 */
export type FigmaLayoutWrap = 'NO_WRAP' | 'WRAP';

/**
 * Figma 约束垂直方向
 */
export type FigmaConstraintVertical = 'TOP' | 'BOTTOM' | 'CENTER' | 'TOP_BOTTOM' | 'SCALE';

/**
 * Figma 约束水平方向
 */
export type FigmaConstraintHorizontal = 'LEFT' | 'RIGHT' | 'CENTER' | 'LEFT_RIGHT' | 'SCALE';

/**
 * Figma 文本水平对齐方式
 */
export type FigmaTextAlignHorizontal = 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';

/**
 * Figma 文本垂直对齐方式
 */
export type FigmaTextAlignVertical = 'TOP' | 'CENTER' | 'BOTTOM';

/**
 * Figma 行高单位
 */
export type FigmaLineHeightUnit = 'PIXELS' | 'FONT_SIZE_%' | 'INTRINSIC_%';

/**
 * Figma 文本装饰线
 */
export type FigmaTextDecoration = 'NONE' | 'UNDERLINE' | 'STRIKETHROUGH';

/**
 * Figma 文本大小写转换
 */
export type FigmaTextCase = 'ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE' | 'SMALL_CAPS' | 'SMALL_CAPS_FORCED';

/**
 * Figma 导出图片格式
 */
export type FigmaExportFormat = 'JPG' | 'PNG' | 'SVG' | 'PDF';

/**
 * Figma 导出约束类型
 */
export type FigmaExportConstraintType = 'SCALE' | 'WIDTH' | 'HEIGHT';

/**
 * Figma 文件中用户的角色
 */
export type FigmaUserRole = 'owner' | 'editor' | 'viewer' | 'admin';

/**
 * Figma 编辑器类型
 */
export type FigmaEditorType = 'figma' | 'figjam';

// ============================================================
// Figma API 基础数据结构
// ============================================================

/**
 * Figma 颜色对象（RGBA，各通道值范围 0-1）
 *
 * Figma API 中颜色使用归一化浮点数表示：
 * - r, g, b: 红/绿/蓝通道，范围 [0, 1]
 * - a: alpha 透明度，范围 [0, 1]，1 为完全不透明
 *
 * @example
 * ```typescript
 * const red: FigmaColor = { r: 1, g: 0, b: 0, a: 1 };
 * ```
 */
export interface FigmaColor {
  /** 红色通道，范围 0-1 */
  readonly r: number;
  /** 绿色通道，范围 0-1 */
  readonly g: number;
  /** 蓝色通道，范围 0-1 */
  readonly b: number;
  /** Alpha 透明度，范围 0-1 */
  readonly a: number;
}

/**
 * 二维坐标点
 */
export interface FigmaVector {
  readonly x: number;
  readonly y: number;
}

/**
 * Figma 渐变停点
 */
export interface FigmaColorStop {
  /** 停点位置，范围 0-1 */
  readonly position: number;
  /** 停点颜色 */
  readonly color: FigmaColor;
}

/**
 * Figma 填充/描边属性（Paint）
 *
 * 支持纯色、渐变、图片等多种填充类型。
 * 具体可用字段取决于 type 字段的值。
 */
export interface FigmaPaint {
  /** 填充类型 */
  readonly type: FigmaPaintType;
  /** 填充是否可见，默认 true */
  readonly visible?: boolean;
  /** 填充透明度，范围 0-1 */
  readonly opacity?: number;
  /** 纯色填充的颜色（type=SOLID 时存在） */
  readonly color?: FigmaColor;
  /** 混合模式 */
  readonly blendMode?: FigmaBlendMode;
  /** 渐变控制点位置（渐变类型时存在） */
  readonly gradientHandlePositions?: readonly FigmaVector[];
  /** 渐变颜色停点（渐变类型时存在） */
  readonly gradientStops?: readonly FigmaColorStop[];
  /** 图片缩放模式（type=IMAGE 时存在） */
  readonly scaleMode?: FigmaScaleMode;
  /** 图片引用 ID（type=IMAGE 时存在，用于获取图片 URL） */
  readonly imageRef?: string;
}

/**
 * Figma 视觉效果（阴影/模糊）
 */
export interface FigmaEffect {
  /** 效果类型 */
  readonly type: FigmaEffectType;
  /** 效果是否可见 */
  readonly visible: boolean;
  /** 模糊半径或阴影模糊半径 */
  readonly radius: number;
  /** 阴影颜色（阴影类型时存在） */
  readonly color?: FigmaColor;
  /** 混合模式 */
  readonly blendMode?: FigmaBlendMode;
  /** 阴影偏移量（阴影类型时存在） */
  readonly offset?: FigmaVector;
  /** 阴影扩展距离 */
  readonly spread?: number;
}

/**
 * Figma 矩形边界框
 *
 * 表示节点在画布上的位置和尺寸，坐标相对于画布原点。
 */
export interface FigmaRectangle {
  /** X 坐标 */
  readonly x: number;
  /** Y 坐标 */
  readonly y: number;
  /** 宽度 */
  readonly width: number;
  /** 高度 */
  readonly height: number;
}

/**
 * Figma 文本样式属性
 *
 * 包含字体族、字重、字号、行高、字间距等排版相关属性。
 */
export interface FigmaTypeStyle {
  /** 字体族名称，如 "Inter" */
  readonly fontFamily: string;
  /** PostScript 字体名，用于精确字体匹配 */
  readonly fontPostScriptName?: string;
  /** 字重（400=Regular, 500=Medium, 600=SemiBold, 700=Bold） */
  readonly fontWeight: number;
  /** 字号（像素） */
  readonly fontSize: number;
  /** 水平文本对齐方式 */
  readonly textAlignHorizontal?: FigmaTextAlignHorizontal;
  /** 垂直文本对齐方式 */
  readonly textAlignVertical?: FigmaTextAlignVertical;
  /** 字间距（像素或百分比，由 lineHeightUnit 决定） */
  readonly letterSpacing?: number;
  /** 行高（像素单位时存在） */
  readonly lineHeightPx?: number;
  /** 行高（字体大小百分比时存在） */
  readonly lineHeightPercent?: number;
  /** 行高（固有高度百分比时存在） */
  readonly lineHeightPercentFontSize?: number;
  /** 行高单位类型 */
  readonly lineHeightUnit?: FigmaLineHeightUnit;
  /** 文本填充颜色 */
  readonly fills?: readonly FigmaPaint[];
  /** 文本装饰线 */
  readonly textDecoration?: FigmaTextDecoration;
  /** 文本大小写转换 */
  readonly textCase?: FigmaTextCase;
}

/**
 * Figma 约束设置（用于响应式布局）
 *
 * 定义当父容器尺寸变化时，子节点如何调整位置和大小。
 */
export interface FigmaConstraints {
  /** 垂直方向约束 */
  readonly vertical: FigmaConstraintVertical;
  /** 水平方向约束 */
  readonly horizontal: FigmaConstraintHorizontal;
}

/**
 * Figma 导出设置
 */
export interface FigmaExportSetting {
  /** 导出文件后缀名 */
  readonly suffix: string;
  /** 导出格式 */
  readonly format: FigmaExportFormat;
  /** 导出尺寸约束 */
  readonly constraint?: {
    readonly type: FigmaExportConstraintType;
    readonly value: number;
  };
}

/**
 * Figma 节点样式绑定
 *
 * 记录节点绑定的本地样式 ID，用于关联到 Figma Styles 面板中定义的样式。
 */
export interface FigmaNodeStyles {
  /** 填充样式 ID */
  readonly fill?: string;
  /** 描边样式 ID */
  readonly stroke?: string;
  /** 文本样式 ID */
  readonly text?: string;
  /** 效果样式 ID */
  readonly effect?: string;
  /** 网格样式 ID */
  readonly grid?: string;
}

/**
 * Component Property 类型（Figma REST API 四分类，v1.4.18 T10）。
 *
 * - TEXT：文本属性，值为字符串；
 * - BOOLEAN：布尔开关（通常用于显隐/状态切换）；
 * - VARIANT：枚举变体，定义中含全部 variantOptions；
 * - INSTANCE_SWAP：可替换组件实例。
 */
export type FigmaComponentPropertyType = 'BOOLEAN' | 'INSTANCE_SWAP' | 'TEXT' | 'VARIANT';

/** INSTANCE_SWAP 可交换目标偏好 */
export interface FigmaComponentPreferredValue {
  /** 目标类型：单个组件或整组组件集 */
  readonly type: 'COMPONENT' | 'COMPONENT_SET';
  /** 目标 Component/ComponentSet key */
  readonly key: string;
}

/** Component Property 定义（COMPONENT / COMPONENT_SET 节点） */
export interface FigmaComponentPropertyDefinition {
  /** 属性类型 */
  readonly type: FigmaComponentPropertyType;
  /** 默认值（TEXT 为字符串、BOOLEAN 为布尔、VARIANT 为默认变体名；INSTANCE_SWAP 可能为空串） */
  readonly defaultValue: string | boolean;
  /** VARIANT 全部可选值（仅 VARIANT 存在） */
  readonly variantOptions?: readonly string[];
  /** INSTANCE_SWAP 可交换目标列表（仅 INSTANCE_SWAP 存在） */
  readonly preferredValues?: readonly FigmaComponentPreferredValue[];
}

/** Component Property 实例值（INSTANCE 节点） */
export interface FigmaComponentProperty {
  /** 属性类型 */
  readonly type: FigmaComponentPropertyType;
  /** 当前值（INSTANCE_SWAP 时为被交换组件 id 或空串） */
  readonly value: string | boolean;
  /** INSTANCE_SWAP 被交换到的目标节点 id（仅交换后存在） */
  readonly target?: string;
  /** 是否相对主组件被覆盖 */
  readonly overridden?: boolean;
}

/**
 * Figma 节点基础属性
 *
 * 这是 Figma REST API 中所有节点类型共有的基础属性。
 * 不同类型的节点会在此基础上扩展额外字段。
 *
 * @see https://www.figma.com/developers/api#node-types
 */
export interface FigmaNode {
  /** 节点唯一 ID */
  readonly id: string;
  /** 节点名称 */
  readonly name: string;
  /** 节点类型 */
  readonly type: FigmaNodeType;
  /** 节点是否可见，默认 true */
  readonly visible?: boolean;
  /** 节点是否锁定，默认 false */
  readonly locked?: boolean;
  /** 子节点列表（容器类型节点存在） */
  readonly children?: readonly FigmaNode[];
  /** 节点在画布上的绝对边界框 */
  readonly absoluteBoundingBox?: FigmaRectangle;
  /** 节点实际渲染边界框（考虑旋转、阴影等），可能为 null */
  readonly absoluteRenderBounds?: FigmaRectangle | null;
  /** 填充属性列表 */
  readonly fills?: readonly FigmaPaint[];
  /** 描边属性列表 */
  readonly strokes?: readonly FigmaPaint[];
  /** 描边粗细 */
  readonly strokeWeight?: number;
  /** 描边对齐方式 */
  readonly strokeAlign?: FigmaStrokeAlign;
  /** 线条端点样式 */
  readonly strokeCap?: FigmaStrokeCap;
  /** 线条连接样式 */
  readonly strokeJoin?: FigmaStrokeJoin;
  /** 虚线描边模式 [线长, 间隙长, ...] */
  readonly strokeDashes?: readonly number[];
  /** 统一圆角半径（当四角相同时存在） */
  readonly cornerRadius?: number;
  /** 四角独立圆角半径 [左上, 右上, 右下, 左下] */
  readonly rectangleCornerRadii?: readonly [number, number, number, number];
  /** 视觉效果列表（阴影、模糊等） */
  readonly effects?: readonly FigmaEffect[];
  /** 节点透明度，范围 0-1 */
  readonly opacity?: number;
  /** 是否裁剪子节点内容溢出 */
  readonly clipsContent?: boolean;
  /** 背景填充（CANVAS 等节点） */
  readonly background?: readonly FigmaPaint[];
  /** 背景颜色 */
  readonly backgroundColor?: FigmaColor;
  /** 文本内容（TEXT 节点） */
  readonly characters?: string;
  /** 文本样式（TEXT 节点） */
  readonly style?: FigmaTypeStyle;
  /**
   * 富文本字符样式覆盖索引数组（TEXT 节点）。
   *
   * v1.4.4 新增类型字段：Figma TEXT 节点用此数组表示每个字符的样式索引，
   * 配合 styleOverrideTable 实现富文本（一段文字中部分加粗、变色等）。
   * 索引 0 表示使用节点基础 style；其他数字对应 styleOverrideTable 中的 key。
   */
  readonly characterStyleOverrides?: readonly number[];
  /**
   * 富文本样式覆盖表（TEXT 节点）。
   *
   * v1.4.4 新增类型字段：与 characterStyleOverrides 配合，
   * key 是样式索引（字符串），value 是该段的 FigmaTypeStyle。
   */
  readonly styleOverrideTable?: Readonly<Record<string, FigmaTypeStyle>>;
  /** 绑定的样式 ID 映射 */
  readonly styles?: FigmaNodeStyles;
  /** 关联的 Component ID（INSTANCE 节点） */
  readonly componentId?: string;
  /** 关联的 Component Set ID（COMPONENT 节点） */
  readonly componentSetId?: string;
  /**
   * Component Properties 定义（COMPONENT / COMPONENT_SET 节点，v1.4.18 T10）。
   *
   * 键为属性在 Figma 中的原始名；VARIANT 含 variantOptions；
   * INSTANCE_SWAP 含 preferredValues 可交换组件/组件集 key 列表。
   */
  readonly componentPropertyDefinitions?: Readonly<Record<string, FigmaComponentPropertyDefinition>>;
  /**
   * Component Properties 当前值（INSTANCE 节点，v1.4.18 T10）。
   *
   * 键通常带 `#nodeId` 后缀（如 `Label#12:3`），归一化时剥离。
   */
  readonly componentProperties?: Readonly<Record<string, FigmaComponentProperty>>;
  /** 节点描述 */
  readonly description?: string;
  /** Component Key（COMPONENT/COMPONENT_SET 节点） */
  readonly key?: string;
  /** 自动布局方向 */
  readonly layoutMode?: FigmaLayoutMode;
  /** 交叉轴对齐方式（align-self） */
  readonly layoutAlign?: 'INHERIT' | 'STRETCH' | 'MIN' | 'CENTER' | 'MAX';
  /** 主轴拉伸因子（flex-grow，0 或 1） */
  readonly layoutGrow?: number;
  /** 主轴尺寸模式 */
  readonly primaryAxisSizingMode?: FigmaSizingMode;
  /** 交叉轴尺寸模式 */
  readonly counterAxisSizingMode?: FigmaSizingMode;
  /** 主轴子项对齐方式 */
  readonly primaryAxisAlignItems?: FigmaPrimaryAxisAlign;
  /** 交叉轴子项对齐方式 */
  readonly counterAxisAlignItems?: FigmaCounterAxisAlign;
  /** 左内边距 */
  readonly paddingLeft?: number;
  /** 右内边距 */
  readonly paddingRight?: number;
  /** 上内边距 */
  readonly paddingTop?: number;
  /** 下内边距 */
  readonly paddingBottom?: number;
  /** 主轴子项间距 */
  readonly itemSpacing?: number;
  /** 交叉轴子项间距（换行布局时） */
  readonly counterAxisSpacing?: number;
  /** 自动布局换行模式 */
  readonly layoutWrap?: FigmaLayoutWrap;
  /** 布局版本号（内部使用） */
  readonly layoutVersion?: number;
  /** 相对变换矩阵（2x3 仿射变换） */
  readonly relativeTransform?: readonly (readonly number[])[];
  /** 旋转角度 */
  readonly rotation?: number;
  /** 约束设置 */
  readonly constraints?: FigmaConstraints;
  /** 导出设置列表 */
  readonly exportSettings?: readonly FigmaExportSetting[];
  /** 是否为蒙板 */
  readonly isMask?: boolean;
  /** 是否显示蒙板轮廓（编辑态） */
  readonly isMaskOutline?: boolean;
}

// ============================================================
// Figma 文件/组件/样式/变量 类型
// ============================================================

/**
 * Figma 组件定义
 *
 * 对应 Figma 中可复用的 Component，具有唯一 key 可跨文件引用。
 */
export interface FigmaComponent {
  /** 组件唯一 Key */
  readonly key: FigmaComponentKey;
  /** 组件名称 */
  readonly name: string;
  /** 组件描述 */
  readonly description: string;
  /** 所属 Component Set ID（Variant 组件存在） */
  readonly componentSetId?: string;
  /** 文档链接 */
  readonly documentationLinks?: readonly { readonly uri: string }[];
}

/**
 * Figma 组件集（Component Set / Variants）
 *
 * 一组相关 Component 的集合，用于实现组件变体（如 Button 的 size/variant）。
 */
export interface FigmaComponentSet {
  /** 组件集唯一 Key */
  readonly key: FigmaComponentKey;
  /** 组件集名称 */
  readonly name: string;
  /** 组件集描述 */
  readonly description: string;
}

/**
 * Figma 样式类型
 */
export type FigmaStyleType = 'FILL' | 'TEXT' | 'EFFECT' | 'GRID';

/**
 * Figma 共享样式
 *
 * 对应 Figma Styles 面板中定义的可复用样式。
 */
export interface FigmaStyle {
  /** 样式唯一 Key */
  readonly key: string;
  /** 样式名称 */
  readonly name: string;
  /** 样式描述 */
  readonly description: string;
  /** 样式类型 */
  readonly styleType: FigmaStyleType;
}

/**
 * Figma 变量类型
 */
export type FigmaVariableType = 'BOOLEAN' | 'FLOAT' | 'STRING' | 'COLOR';

/**
 * Figma 变量作用域
 *
 * 定义变量可应用于哪些属性。
 */
export type FigmaVariableScope =
  | 'ALL_SCOPES'
  | 'TEXT_CONTENT'
  | 'CORNER_RADIUS'
  | 'WIDTH_HEIGHT'
  | 'GAP'
  | 'ALL_FILLS'
  | 'FRAME_FILL'
  | 'SHAPE_FILL'
  | 'TEXT_FILL'
  | 'STROKE_COLOR'
  | 'STROKE_FLOAT'
  | 'EFFECT_FLOAT'
  | 'EFFECT_COLOR'
  | 'OPACITY'
  | 'FONT_FAMILY'
  | 'FONT_STYLE'
  | 'FONT_WEIGHT'
  | 'FONT_SIZE'
  | 'LINE_HEIGHT'
  | 'LETTER_SPACING'
  | 'PARAGRAPH_SPACING'
  | 'PARAGRAPH_INDENT';

/**
 * Figma 变量值类型
 *
 * 根据 resolvedType 的不同，值的类型也不同：
 * - COLOR: FigmaColor
 * - FLOAT: number
 * - STRING: string
 * - BOOLEAN: boolean
 */
export type FigmaVariableValue = FigmaColor | string | number | boolean;

/**
 * Figma 变量代码语法提示
 *
 * 为不同平台提供代码中引用该变量的语法建议。
 */
export interface FigmaVariableCodeSyntax {
  /** Web 平台代码语法 */
  readonly WEB?: string;
  /** Android 平台代码语法 */
  readonly ANDROID?: string;
  /** iOS 平台代码语法 */
  readonly IOS?: string;
}

/**
 * Figma 变量（Variable）
 *
 * Figma Variables 是 Figma 新版设计令牌系统，支持多模式（主题）切换。
 *
 * @see https://www.figma.com/developers/api#variables
 */
export interface FigmaVariable {
  /** 变量 ID */
  readonly id: string;
  /** 变量名称 */
  readonly name: string;
  /** 变量 Key */
  readonly key: string;
  /** 所属变量集合 ID */
  readonly variableCollectionId: string;
  /** 变量值类型 */
  readonly resolvedType: FigmaVariableType;
  /** 各模式下的值映射（modeId -> value） */
  readonly valuesByMode: Readonly<Record<string, FigmaVariableValue>>;
  /** 变量描述 */
  readonly description?: string;
  /** 是否在发布时隐藏 */
  readonly hiddenFromPublishing?: boolean;
  /** 变量作用域 */
  readonly scopes?: readonly FigmaVariableScope[];
  /** 代码语法提示 */
  readonly codeSyntax?: FigmaVariableCodeSyntax;
}

/**
 * Figma 变量模式
 */
export interface FigmaVariableMode {
  /** 模式 ID */
  readonly modeId: string;
  /** 模式名称（如 "Light", "Dark"） */
  readonly name: string;
}

/**
 * Figma 变量集合（Variable Collection）
 *
 * 一组相关变量的容器，可定义多个模式（如浅色/深色主题）。
 */
export interface FigmaVariableCollection {
  /** 集合 ID */
  readonly id: string;
  /** 集合名称 */
  readonly name: string;
  /** 集合 Key */
  readonly key: string;
  /** 模式列表 */
  readonly modes: readonly FigmaVariableMode[];
  /** 默认模式 ID */
  readonly defaultModeId: string;
  /** 是否为远程（库）变量集合 */
  readonly remote: boolean;
  /** 集合内的变量 ID 列表 */
  readonly variableIds: string[];
}

/**
 * Figma 变量 API 响应
 */
export interface FigmaVariablesResponse {
  readonly meta: {
    readonly variableCollections: Readonly<Record<string, FigmaVariableCollection>>;
    readonly variables: Readonly<Record<string, FigmaVariable>>;
  };
}

/**
 * Figma 文件 API 响应
 *
 * GET /v1/files/{fileKey} 接口返回的数据结构。
 *
 * @see https://www.figma.com/developers/api#get-files-endpoint
 */
export interface FigmaFileResponse {
  /** 文件名称 */
  readonly name: string;
  /** 最后修改时间（ISO 8601） */
  readonly lastModified: string;
  /** 文件缩略图 URL */
  readonly thumbnailUrl: string;
  /** 文件版本号 */
  readonly version: string;
  /** 当前用户在文件中的角色 */
  readonly role: FigmaUserRole;
  /** 编辑器类型（figma/figjam） */
  readonly editorType: FigmaEditorType;
  /** 文档根节点 */
  readonly document: FigmaNode;
  /** 文件中定义的所有 Component */
  readonly components: Readonly<Record<string, FigmaComponent>>;
  /** 文件中定义的所有 Component Set */
  readonly componentSets: Readonly<Record<string, FigmaComponentSet>>;
  /** 文件中定义的所有 Style */
  readonly styles: Readonly<Record<string, FigmaStyle>>;
  /** Schema 版本 */
  readonly schemaVersion: number;
  /** 主文件 Key（如果是分支文件） */
  readonly mainFileKey?: string;
}

// ============================================================
// 设计 Tokens 类型
// ============================================================

/**
 * RGB 颜色值（0-255）
 */
export interface RgbColor {
  /** 红色通道，0-255 */
  r: number;
  /** 绿色通道，0-255 */
  g: number;
  /** 蓝色通道，0-255 */
  b: number;
}

/**
 * OKLCH 颜色值
 *
 * OKLCH 是一种感知均匀的颜色空间，适合用于设计系统。
 * L: 亮度 (0-1)
 * C: 色度 (0-0.4+)
 * H: 色相角 (0-360)
 */
export interface OklchColor {
  /** 亮度 Lightness，范围 0-1 */
  l: number;
  /** 色度 Chroma，范围约 0-0.4 */
  c: number;
  /** 色相 Hue，角度 0-360 */
  h: number;
}

/**
 * 颜色 Token
 *
 * 从 Figma 中提取并标准化的颜色值，支持多种格式输出。
 */
export interface ColorToken {
  /** Token 名称（CSS 变量友好格式，如 primary-500） */
  name: string;
  /** 颜色值（hex/rgb/oklch/hsl 格式字符串） */
  value: CssColorValue;
  /** RGB 值（0-255） */
  valueRgb?: RgbColor;
  /** OKLCH 值 */
  valueOklch?: OklchColor;
  /** 透明度 0-1，仅当非不透明时存在 */
  opacity?: number;
  /** Token 描述 */
  description?: string;
  /** Figma 原始名称 */
  figmaName?: string;
  /** 平台代码语法 */
  codeSyntax?: string;
}

/**
 * 支持的长度单位
 */
export type LengthUnit = 'px' | 'rem';

/**
 * 间距 Token
 */
export interface SpacingToken {
  /** Token 名称 */
  name: string;
  /** 间距数值 */
  value: number;
  /** 单位，默认 px */
  unit?: LengthUnit;
  /** Token 描述 */
  description?: string;
}

/**
 * 圆角 Token
 */
export interface RadiusToken {
  /** Token 名称 */
  name: string;
  /** 圆角数值 */
  value: number;
  /** 单位，默认 px */
  unit?: LengthUnit;
  /** Token 描述 */
  description?: string;
}

/**
 * 阴影类型
 */
export type ShadowType = 'drop' | 'inner';

/**
 * 阴影 Token
 */
export interface ShadowToken {
  /** Token 名称 */
  name: string;
  /** 阴影类型 */
  type: ShadowType;
  /** X 轴偏移 */
  x: number;
  /** Y 轴偏移 */
  y: number;
  /** 模糊半径 */
  blur: number;
  /** 扩展距离 */
  spread: number;
  /** 阴影颜色 */
  color: CssColorValue;
  /** 阴影透明度 */
  opacity?: number;
  /** Token 描述 */
  description?: string;
}

/**
 * 字体 Token
 */
export interface TypographyToken {
  /** Token 名称 */
  name: string;
  /** 字体族 */
  fontFamily: string;
  /** 字重 */
  fontWeight: number;
  /** 字号 */
  fontSize: number;
  /** 行高 */
  lineHeight?: number;
  /** 字间距 */
  letterSpacing?: number;
  /** 单位 */
  unit?: LengthUnit;
  /** Token 描述 */
  description?: string;
}

/**
 * 设计 Tokens 元数据
 */
export interface DesignTokensMetadata {
  /** 数据来源描述 */
  source: string;
  /** Figma 文件 Key */
  fileKey: FigmaFileKey;
  /** 生成时间（ISO 8601） */
  generatedAt: string;
  /** Figma 文件名 */
  figmaFileName?: string;
}

/**
 * 设计 Tokens 集合
 *
 * 从 Figma 文件中提取的完整设计令牌体系。
 */
export interface DesignTokens {
  /** 颜色 Token 映射 */
  colors: Record<string, ColorToken>;
  /** 间距 Token 映射 */
  spacing: Record<string, SpacingToken>;
  /** 圆角 Token 映射 */
  radius: Record<string, RadiusToken>;
  /** 阴影 Token 映射 */
  shadows: Record<string, ShadowToken>;
  /** 字体 Token 映射 */
  typography: Record<string, TypographyToken>;
  /** 元数据 */
  metadata: DesignTokensMetadata;
}

// ============================================================
// 代码生成类型
// ============================================================

/**
 * 代码输出格式
 */
export type CodeOutputFormat = 'react' | 'vue' | 'html' | 'tailwind-config' | 'css-variables' | 'json';

/**
 * 支持的前端框架
 */
export type Framework = 'react' | 'vue';

/**
 * 样式格式选项（spec FR-05，v1.4.18 T7 扩展为 11 值可插拔联合）
 *
 * 落地状态见 src/services/style-renderers/registry.ts 单一数据源：
 * - available（v1.4.18）：tailwind / unocss / css-modules / inline-styles
 * - planned v1.4.19：styled / emotion / less / sass / vanilla-extract / panda
 * - planned v1.5.0：css-variables（组件级渲染）
 */
export type StyleFormat =
  | 'tailwind'
  | 'unocss'
  | 'css-modules'
  | 'styled'
  | 'emotion'
  | 'less'
  | 'sass'
  | 'vanilla-extract'
  | 'panda'
  | 'inline-styles'
  | 'css-variables';

/**
 * 颜色输出格式
 */
export type ColorFormat = 'hex' | 'rgb' | 'oklch' | 'hsl';

/**
 * 组件代码生成选项
 */
export interface CodeGenOptions {
  /** 输出代码格式 */
  readonly format: CodeOutputFormat;
  /** 目标框架 */
  readonly framework?: Framework;
  /** 是否生成 TypeScript 代码 */
  readonly typescript?: boolean;
  /** 样式处理方式 */
  readonly styleFormat?: StyleFormat;
  /** 是否复用已有 tokens */
  readonly useExistingTokens?: boolean;
  /** Token 名称前缀 */
  readonly tokenPrefix?: string;
  /** 组件名称（覆盖自动推断） */
  readonly componentName?: string;
  /** 导出路径 */
  readonly exportPath?: string;
  /** 是否生成 Props 接口 */
  readonly includeProps?: boolean;
  /** 是否包含子节点 */
  readonly includeChildren?: boolean;
  /** 是否跳过增强功能（flex-fixer/a11y/design-system/responsive） */
  readonly skipEnhancements?: boolean;
}

/**
 * 生成的组件代码
 */
export interface GeneratedComponent {
  /** 组件名称 */
  readonly name: string;
  /** 组件主体代码（TSX/JSX/Vue） */
  readonly code: string;
  /** 独立的 CSS 代码 */
  readonly cssCode?: string;
  /** TypeScript 类型定义代码 */
  readonly typesCode?: string;
  /** Props 接口名称 */
  readonly propsInterface?: string;
  /** 依赖的 npm 包列表 */
  readonly dependencies: string[];
  /** 使用到的 Token 名称列表 */
  readonly tokensUsed: string[];
  /** 扩展字段，允许插件添加额外输出 */
  readonly [key: string]: unknown;
}

/**
 * 生成的样式代码
 */
export interface GeneratedStyles {
  /** CSS 变量定义 */
  readonly cssVariables?: string;
  /** Tailwind 配置代码 */
  readonly tailwindConfig?: string;
  /** 主题配置对象 */
  readonly themeConfig?: Record<string, unknown>;
}

/**
 * 需要 @theme 扩展的 Tailwind 值
 */
export interface TailwindExtension {
  readonly type: string;
  readonly suggestedName: string;
  readonly originalValue: string;
}

/**
 * 待下载资源信息
 */
export interface PendingAsset {
  readonly nodeId: string;
  readonly name: string;
  readonly type: string;
}

/**
 * 增强报告（v1.2.0+ 新增）
 *
 * 包含代码生成过程中各种增强功能的统计和建议
 */
export interface EnhancementReports {
  /** Flex 修复报告 */
  readonly flexFixes?: {
    readonly fixedCount?: number;
    readonly totalFixedNodes?: number;
    readonly fixes: ReadonlyArray<unknown>;
  };
  /** 无障碍增强报告 */
  readonly a11y?: {
    readonly enhancementsCount?: number;
    readonly semanticTagsCount: number;
    readonly buttonsIdentifiedCount: number;
    readonly ariaAddedCount: number;
    readonly report: ReadonlyArray<unknown>;
  };
  /** 设计系统分析报告 */
  readonly designSystem?: {
    readonly suggestionsCount?: number;
    readonly suggestions: ReadonlyArray<unknown>;
    readonly colorSuggestions: ReadonlyArray<unknown>;
    readonly spacingTokens: ReadonlyArray<unknown>;
    readonly radiusTokens: ReadonlyArray<unknown>;
    readonly typographySuggestions: ReadonlyArray<unknown>;
  };
  /** 响应式推断报告 */
  readonly responsive?: {
    readonly suggestionsCount?: number;
    readonly suggestions: ReadonlyArray<unknown>;
    readonly recommendations: ReadonlyArray<unknown>;
    readonly classSuggestions: ReadonlyArray<unknown>;
    readonly layoutSuggestions: ReadonlyArray<unknown>;
  };
}

/**
 * 代码生成结果（React/Vue 通用）
 *
 * 统一 React TSX 和 Vue SFC 生成器的返回类型
 */
export interface CodeGenResult {
  /** 组件名 */
  readonly componentName: string;
  /** 生成的组件代码（TSX 或 Vue SFC） */
  readonly code: string;
  /** 需要的 import 语句集合（React 为 Set<string>，Vue 为 string[]） */
  readonly imports: ReadonlySet<string> | readonly string[];
  /** 需要 @theme 扩展的值 */
  readonly extensionsNeeded: readonly TailwindExtension[];
  /** 需要下载的资源列表 */
  readonly pendingAssets: readonly PendingAsset[];
  /** 代码生成过程中的警告信息（样式未匹配 token、多层描边等，v1.4.2 新增） */
  readonly warnings: readonly string[];
  /** 增强报告 */
  readonly reports: EnhancementReports;
  /**
   * 样式方案配置建议（v1.4.18 T8 新增）
   *
   * UnoCSS（wind/attributify）时非空：uno.config.ts 示例、虚拟模块入口、图标预设、TS shim 等；
   * 仅作为生成结果的指引文本返回，工具不会向用户项目写入任何配置文件。
   */
  readonly styleHints?: ReadonlyArray<{
    /** 建议标题 */
    readonly title: string;
    /** 建议内容（配置/代码片段） */
    readonly code: string;
  }>;
  /**
   * 同名旁路样式文件（v1.4.18 T9 新增，仅 styleFormat='css-modules' 时存在）
   *
   * React：组件经 `import styles from './X.module.css'` 以 styles.x 引用；
   * Vue：SFC 经 `<style module src="./X.module.css">` 外置，模板以 $style.x 引用。
   * 工具只描述文件内容，由调用方决定落盘或展示，不直接写入用户项目目录。
   */
  readonly styleSidecar?: {
    /** 文件名（不含目录，与组件同目录，如 'Card.module.css'） */
    readonly fileName: string;
    /** 文件完整内容 */
    readonly content: string;
  };
}

// ============================================================
// CLI 配置类型
// ============================================================

/**
 * Figma Dev Tools 运行配置
 */
export interface FigmaDevConfig {
  /** Figma Personal Access Token */
  figmaAccessToken: string;
  /** 默认文件 Key */
  defaultFileKey?: FigmaFileKey;
  /** 输出目录路径 */
  outputDir: string;
  /** Tokens 输出路径 */
  tokensOutputPath?: string;
  /** 组件输出路径 */
  componentsOutputPath?: string;
  /** 目标前端框架 */
  framework: Framework;
  /** 样式处理方式 */
  styleFormat: StyleFormat;
  /** 是否使用 TypeScript */
  typescript: boolean;
  /** Token 名称前缀 */
  tokenPrefix?: string;
  /** 颜色输出格式 */
  colorFormat: ColorFormat;
  /** 间距单位 */
  spacingUnit: LengthUnit;
  /** 导入路径别名（如 @/） */
  importAlias?: string;
  /** 已有 tokens 文件路径 */
  existingTokensPath?: string;
}

/**
 * 同步统计信息
 */
export interface SyncStats {
  /** 提取的颜色数量 */
  readonly colors: number;
  /** 提取的间距数量 */
  readonly spacing: number;
  /** 提取的圆角数量 */
  readonly radius: number;
  /** 提取的阴影数量 */
  readonly shadows: number;
  /** 提取的字体样式数量 */
  readonly typography: number;
  /** 生成的组件数量 */
  readonly components: number;
  /** 处理耗时（毫秒） */
  readonly duration: number;
}

/**
 * 同步操作结果
 */
export interface SyncResult {
  /** 是否成功 */
  readonly success: boolean;
  /** 提取的 Tokens */
  readonly tokens?: DesignTokens;
  /** 生成的组件列表 */
  readonly components?: GeneratedComponent[];
  /** 生成的样式 */
  readonly styles?: GeneratedStyles;
  /** 错误信息列表 */
  readonly errors: string[];
  /** 警告信息列表 */
  readonly warnings: string[];
  /** 统计信息 */
  readonly stats: SyncStats;
}

// ============================================================
// URL 解析类型
// ============================================================

/**
 * 解析后的 Figma URL 信息
 *
 * 由 parseFigmaUrl() 函数返回，包含从 Figma 设计链接中提取的关键信息。
 */
export interface ParsedFigmaUrl {
  /** Figma 文件 Key */
  fileKey: FigmaFileKey | '';
  /** 节点 ID（URL 中指定了具体节点时存在） */
  nodeId?: FigmaNodeId;
  /** 文件名称（URL 解码后） */
  fileName?: string;
  /** 是否为设计文件链接（/design/ 或 /file/ 路径） */
  isDesignUrl: boolean;
  /** 是否指向具体组件（有 node-id 或路径含 component） */
  isComponentUrl: boolean;
}
