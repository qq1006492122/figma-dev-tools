/**
 * Figma 节点测试夹具工厂（Fixture Factory）
 *
 * 为 v1.4.18-v1.4.20 的三层测试（冒烟 / 全量 / 压测）提供类型安全的
 * Figma REST API 节点构造器。所有构造器返回结构化数据，不发起任何网络请求。
 *
 * 设计约束：
 * - 零 any：扩展字段（componentProperties 等 v1.4.17 类型未覆盖的真实 API 字段）
 *   通过 {@link TestFigmaNode} 显式声明；
 * - 深不可变：返回值与 {@link FigmaNode} 一致使用 readonly 结构，调用方不得就地修改；
 * - 可重复：自动 ID 可通过 {@link resetNodeIdSequence} 重置，保证快照稳定。
 *
 * @packageDocumentation
 */
import type {
  FigmaColor,
  FigmaComponentSet,
  FigmaEffect,
  FigmaLayoutMode,
  FigmaNode,
  FigmaPaint,
  FigmaRectangle,
  FigmaTypeStyle,
} from '../../src/types.js';

// ============================================================
// 扩展类型：FigmaNode 未声明但 REST API 真实存在的字段
// ============================================================

/**
 * Component Property 的属性类型
 *
 * @see https://www.figma.com/develop/api-v2/reference/get-file#component-property
 */
export type ComponentPropertyType = 'BOOLEAN' | 'INSTANCE_SWAP' | 'TEXT' | 'VARIANT';

/**
 * INSTANCE_SWAP 属性的首选组件值
 */
export interface ComponentPropertyPreferredValue {
  /** 可替换目标的类型，组件固定为 COMPONENT */
  readonly type: 'COMPONENT' | 'COMPONENT_SET';
  /** 目标组件 Key */
  readonly key: string;
}

/**
 * INSTANCE 节点上某个 Component Property 的当前值
 */
export interface ComponentPropertyValue {
  /** 属性类型 */
  readonly type: ComponentPropertyType;
  /** 属性当前值（BOOLEAN 为 boolean，TEXT/VARIANT 为 string） */
  readonly value: boolean | string;
  /** INSTANCE_SWAP 类型的可替换目标列表 */
  readonly preferredValues?: readonly ComponentPropertyPreferredValue[];
}

/**
 * COMPONENT 节点上某个 Component Property 的定义（默认值与约束）
 */
export interface ComponentPropertyDefinition {
  /** 属性类型 */
  readonly type: ComponentPropertyType;
  /** 属性默认值 */
  readonly defaultValue: boolean | string;
  /** VARIANT 类型的可选值列表 */
  readonly variantOptions?: readonly string[];
  /** INSTANCE_SWAP 类型的可替换目标列表 */
  readonly preferredValues?: readonly ComponentPropertyPreferredValue[];
}

/**
 * 测试用 Figma 节点
 *
 * 在 {@link FigmaNode} 基础上补充 REST API 真实返回但当前类型定义未覆盖的字段，
 * children 收窄为 TestFigmaNode 以支持递归构造与递归断言。
 */
export interface TestFigmaNode extends Omit<FigmaNode, 'children'> {
  /** 子节点列表（递归收窄为测试节点类型） */
  readonly children?: readonly TestFigmaNode[];
  /** INSTANCE 节点的 Component Property 当前值映射 */
  readonly componentProperties?: Readonly<Record<string, ComponentPropertyValue>>;
  /** COMPONENT 节点的 Component Property 定义映射 */
  readonly componentPropertyDefinitions?: Readonly<Record<string, ComponentPropertyDefinition>>;
  /** 变量绑定映射（字段名 → { 变量 ID } 或多模式映射） */
  readonly boundVariables?: Readonly<Record<string, unknown>>;
}

/** 节点构造器的覆盖项：除 id/type 外的任意字段 */
export type NodeOverrides = Partial<Omit<TestFigmaNode, 'id' | 'type'>>;

// ============================================================
// 基础工厂
// ============================================================

/** 自动 ID 计数器（进程内） */
let autoIdSequence = 0;

/**
 * 重置自动 ID 计数器。
 *
 * 在需要稳定快照或确定性用例的 beforeEach 中调用。
 */
export function resetNodeIdSequence(): void {
  autoIdSequence = 0;
}

/**
 * 生成形如 `12:34` 的自动节点 ID
 *
 * @returns 唯一节点 ID
 */
function nextAutoId(): string {
  autoIdSequence += 1;
  return `0:${autoIdSequence}`;
}

/**
 * 节点基础工厂：合并必填字段与调用方覆盖项
 *
 * @param id 节点 ID，不传则自动生成
 * @param name 节点名称
 * @param type 节点类型
 * @param overrides 字段覆盖项
 * @returns 完整测试节点
 */
function makeNode(
  id: string | undefined,
  name: string,
  type: TestFigmaNode['type'],
  overrides: NodeOverrides = {},
): TestFigmaNode {
  return { id: id ?? nextAutoId(), name, type, ...overrides };
}

/**
 * 构造边界框
 *
 * @param x 左上角 X
 * @param y 左上角 Y
 * @param width 宽度
 * @param height 高度
 * @returns FigmaRectangle
 */
export function makeBox(x: number, y: number, width: number, height: number): FigmaRectangle {
  return { x, y, width, height };
}

/**
 * 将 #RRGGBB / #RGB 十六进制颜色转换为 Figma 0-1 浮点颜色
 *
 * @param hex 十六进制色值
 * @param alpha 透明度，默认 1
 * @returns FigmaColor
 */
export function makeHexColor(hex: string, alpha = 1): FigmaColor {
  const normalized = hex.startsWith('#') ? hex.slice(1) : hex;
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : normalized;
  const numeric = Number.parseInt(full, 16);
  return {
    r: ((numeric >> 16) & 0xff) / 255,
    g: ((numeric >> 8) & 0xff) / 255,
    b: (numeric & 0xff) / 255,
    a: alpha,
  };
}

/**
 * 构造纯色填充 Paint
 *
 * @param hex 十六进制色值
 * @param opacity 填充透明度
 * @returns SOLID Paint
 */
export function makeSolidPaint(hex: string, opacity = 1): FigmaPaint {
  return { type: 'SOLID', color: makeHexColor(hex), opacity: opacity < 1 ? opacity : undefined };
}

/**
 * 构造线性渐变填充 Paint
 *
 * @param stops 渐变停点（位置 + 色值）
 * @returns GRADIENT_LINEAR Paint
 */
export function makeLinearGradient(
  stops: readonly { readonly position: number; readonly hex: string }[],
): FigmaPaint {
  return {
    type: 'GRADIENT_LINEAR',
    gradientHandlePositions: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 0 },
    ],
    gradientStops: stops.map((stop) => ({ position: stop.position, color: makeHexColor(stop.hex) })),
  };
}

/**
 * 构造投影 Effect
 *
 * @param options 阴影参数
 * @returns DROP_SHADOW Effect
 */
export function makeDropShadow(options: {
  readonly hex?: string;
  readonly alpha?: number;
  readonly offsetX?: number;
  readonly offsetY?: number;
  readonly blur?: number;
  readonly spread?: number;
} = {}): FigmaEffect {
  const { hex = '#000000', alpha = 0.25, offsetX = 0, offsetY = 4, blur = 8, spread = 0 } = options;
  return {
    type: 'DROP_SHADOW',
    visible: true,
    radius: blur,
    color: makeHexColor(hex, alpha),
    offset: { x: offsetX, y: offsetY },
    spread,
  };
}

/**
 * 构造文本样式
 *
 * @param overrides 样式覆盖项（fontFamily / fontWeight / fontSize 有默认值）
 * @returns FigmaTypeStyle
 */
export function makeTextStyle(overrides: Partial<FigmaTypeStyle> = {}): FigmaTypeStyle {
  return {
    fontFamily: 'Inter',
    fontWeight: 400,
    fontSize: 14,
    ...overrides,
  };
}

// ============================================================
// 具体节点工厂
// ============================================================

/**
 * 构造普通 FRAME 节点
 *
 * @param name 名称
 * @param children 子节点
 * @param overrides 覆盖项
 * @returns FRAME 节点
 */
export function makeFrame(
  name: string,
  children: readonly TestFigmaNode[] = [],
  overrides: NodeOverrides = {},
): TestFigmaNode {
  return makeNode(overrides.id, name, 'FRAME', {
    clipsContent: true,
    ...(children.length > 0 ? { children } : {}),
    ...overrides,
  });
}

/**
 * 构造自动布局 FRAME 节点
 *
 * @param name 名称
 * @param options 自动布局参数与子节点
 * @returns 带 layoutMode 的 FRAME 节点
 */
export function makeAutoLayoutFrame(
  name: string,
  options: {
    readonly mode?: FigmaLayoutMode;
    readonly children?: readonly TestFigmaNode[];
    readonly gap?: number;
    readonly padding?: number;
    readonly primaryAlign?: TestFigmaNode['primaryAxisAlignItems'];
    readonly counterAlign?: TestFigmaNode['counterAxisAlignItems'];
    readonly overrides?: NodeOverrides;
  } = {},
): TestFigmaNode {
  const {
    mode = 'VERTICAL',
    children = [],
    gap = 0,
    padding = 0,
    primaryAlign = 'MIN',
    counterAlign = 'MIN',
    overrides = {},
  } = options;
  return makeFrame(name, children, {
    layoutMode: mode,
    primaryAxisSizingMode: 'AUTO',
    counterAxisSizingMode: 'AUTO',
    primaryAxisAlignItems: primaryAlign,
    counterAxisAlignItems: counterAlign,
    itemSpacing: gap,
    paddingTop: padding,
    paddingRight: padding,
    paddingBottom: padding,
    paddingLeft: padding,
    ...overrides,
  });
}

/**
 * 构造 RECTANGLE 节点
 *
 * @param name 名称
 * @param options 填充/描边/圆角
 * @returns RECTANGLE 节点
 */
export function makeRect(
  name: string,
  options: {
    readonly fill?: string;
    readonly cornerRadius?: number;
    readonly width?: number;
    readonly height?: number;
    readonly overrides?: NodeOverrides;
  } = {},
): TestFigmaNode {
  const { fill, cornerRadius, width, height, overrides = {} } = options;
  return makeNode(overrides.id, name, 'RECTANGLE', {
    ...(fill !== undefined ? { fills: [makeSolidPaint(fill)] } : {}),
    ...(cornerRadius !== undefined ? { cornerRadius } : {}),
    ...(width !== undefined && height !== undefined ? { absoluteBoundingBox: makeBox(0, 0, width, height) } : {}),
    ...overrides,
  });
}

/**
 * 构造 TEXT 节点
 *
 * @param name 名称
 * @param characters 文本内容
 * @param styleOverrides 文本样式覆盖
 * @param overrides 节点字段覆盖
 * @returns TEXT 节点
 */
export function makeText(
  name: string,
  characters: string,
  styleOverrides: Partial<FigmaTypeStyle> = {},
  overrides: NodeOverrides = {},
): TestFigmaNode {
  return makeNode(overrides.id, name, 'TEXT', {
    characters,
    style: makeTextStyle(styleOverrides),
    ...overrides,
  });
}

/**
 * 构造 COMPONENT 节点
 *
 * @param name 组件名（如 Button/Size=Large,State=Default）
 * @param children 子节点
 * @param propertyDefinitions Component Property 定义
 * @param overrides 覆盖项
 * @returns COMPONENT 节点
 */
export function makeComponent(
  name: string,
  children: readonly TestFigmaNode[] = [],
  propertyDefinitions: Readonly<Record<string, ComponentPropertyDefinition>> = {},
  overrides: NodeOverrides = {},
): TestFigmaNode {
  return makeNode(overrides.id, name, 'COMPONENT', {
    ...(children.length > 0 ? { children } : {}),
    ...(Object.keys(propertyDefinitions).length > 0 ? { componentPropertyDefinitions: propertyDefinitions } : {}),
    ...overrides,
  });
}

/**
 * 构造 COMPONENT_SET 节点（变体容器）
 *
 * @param name 组件集名称
 * @param components 变体 COMPONENT 子节点
 * @param overrides 覆盖项
 * @returns COMPONENT_SET 节点
 */
export function makeComponentSet(
  name: string,
  components: readonly TestFigmaNode[] = [],
  overrides: NodeOverrides = {},
): TestFigmaNode {
  return makeNode(overrides.id, name, 'COMPONENT_SET', {
    ...(components.length > 0 ? { children: components } : {}),
    ...overrides,
  });
}

/**
 * 构造 INSTANCE 节点
 *
 * @param name 实例名称
 * @param componentId 关联主组件的节点 ID
 * @param propertyValues Component Property 当前值
 * @param overrides 覆盖项
 * @returns INSTANCE 节点
 */
export function makeInstance(
  name: string,
  componentId: string,
  propertyValues: Readonly<Record<string, ComponentPropertyValue>> = {},
  overrides: NodeOverrides = {},
): TestFigmaNode {
  return makeNode(overrides.id, name, 'INSTANCE', {
    componentId,
    ...(Object.keys(propertyValues).length > 0 ? { componentProperties: propertyValues } : {}),
    ...overrides,
  });
}

/**
 * 统计节点树的节点总数
 *
 * @param root 根节点
 * @returns 含根节点在内的全部节点数
 */
export function countNodes(root: TestFigmaNode): number {
  const children = root.children ?? [];
  return 1 + children.reduce((sum, child) => sum + countNodes(child), 0);
}

/**
 * 构造一个平衡多叉大树（压测用）
 *
 * 每层内部节点均为 branch 个子 FRAME，叶子为 RECTANGLE；
 * depth 表示分支层级数，树总深度（含叶子）为 depth+1。
 * branch=4、depth=7 时节点总数为 (4^8−1)/3 = 21845（≥20000）。
 *
 * @param options branch 叉数 / depth 分支层级数
 * @returns 根节点
 */
export function makeLargeTree(options: { readonly branch?: number; readonly depth?: number } = {}): TestFigmaNode {
  const { branch = 4, depth = 7 } = options;
  /** 递归构造指定层级的节点 */
  function build(level: number, seq: { value: number }): TestFigmaNode {
    seq.value += 1;
    const id = `tree:${seq.value}`;
    if (level <= 0) {
      return makeNode(id, `leaf-${seq.value}`, 'RECTANGLE', {
        fills: [makeSolidPaint('#E5E7EB')],
        absoluteBoundingBox: makeBox(0, 0, 8, 8),
      });
    }
    const children: TestFigmaNode[] = [];
    for (let i = 0; i < branch; i += 1) {
      children.push(build(level - 1, seq));
    }
    return makeNode(id, `frame-l${level}-${seq.value}`, 'FRAME', {
      layoutMode: 'HORIZONTAL',
      itemSpacing: 4,
      children,
    });
  }
  return build(depth, { value: 0 });
}

/**
 * FigmaComponentSet 元数据工厂（list_components / 变量测试用）
 *
 * @param name 组件集名称
 * @param overrides 覆盖项
 * @returns 组件集元数据
 */
export function makeComponentSetMeta(
  name: string,
  overrides: Partial<FigmaComponentSet> = {},
): FigmaComponentSet {
  return {
    key: overrides.key ?? `key-${name}`,
    name,
    description: overrides.description ?? '',
    ...overrides,
  };
}
