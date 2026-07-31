/**
 * 设计上下文服务 - Design Context Service
 *
 * 提供两个核心能力，用于 AI 代码生成前的设计理解：
 *
 * 1. **getMetadata()** - 高层结构概览（depth=1）
 *    只返回一层子节点信息，输出大小控制在 < 4KB，可安全放入 AI 上下文。
 *    使用场景：在开始实现前，先了解一个页面/Frame 有几个区块、用了什么组件、主要颜色等。
 *
 * 2. **getDesignContext()** - 定向钻取精简后的结构化设计上下文
 *    返回完整的精简节点树 + 提取的颜色/间距/圆角/阴影/资源/文本/组件统计。
 *    使用场景：在确定要实现的区块后，获取该节点的完整设计上下文用于代码生成。
 *
 * **标准调用流程（对齐 figma-to-code.md 规范）：**
 * ```
 * get_metadata → get_design_context（按需对子节点）→ get_screenshot → download_assets
 * ```
 *
 * @module
 */

// ============ 依赖导入 ============

import type { FigmaNode, FigmaComponent, FigmaColor, ColorToken } from '../types.js';
import type {
  DesignMetadata,
  DesignContext,
  NodeOverview,
  TextNodeSummary,
  ProcessedNode,
  ProcessedAsset,
  ProcessedShadow,
  ProcessedFill,
  NodeSemanticRole,
} from '../types/nodes.js';
import type { FigmaClient } from './figma-client.js';
import { createNodeProcessor } from './node-processor.js';

// ============ 类型定义 ============

/**
 * 设计上下文服务配置选项
 */
export interface DesignContextOptions {
  /** 默认最大深度，getDesignContext 默认使用此值 */
  defaultMaxDepth?: number;
  /** 颜色输出格式，用于 getDesignContext 中的颜色 token */
  colorFormat?: 'hex' | 'rgb' | 'oklch' | 'hsl';
}

// ============ 常量定义 ============

/** 默认配置选项 */
const DEFAULT_OPTIONS: Required<DesignContextOptions> = {
  defaultMaxDepth: 5,
  colorFormat: 'hex',
};

// ============ 颜色工具函数 ============

/**
 * 将 FigmaColor（0-1 浮点数 RGBA）转为大写 hex 字符串（用于去重和集合存储）
 *
 * @param color - Figma 颜色对象
 * @returns 6位大写 Hex 字符串（如 "#FF5500"），忽略 alpha 通道
 */
function colorToHex(color: FigmaColor): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ============ 信息收集函数 ============

/**
 * 从 ProcessedFill 数组中收集纯色填充的 hex 值到 Set 中
 *
 * 跳过透明色（opacity ≤ 0.01）、渐变、图片填充。
 *
 * @param fills - 处理后的填充数组
 * @param result - 用于收集 hex 的 Set（输出参数）
 */
function collectColorsFromFills(fills: ProcessedFill[] | undefined, result: Set<string>): void {
  if (!fills) return;
  for (const fill of fills) {
    if (fill.type === 'solid' && fill.color) {
      const hex = colorToHex(fill.color);
      // 忽略接近透明的颜色，避免收集到无用的透明色 token
      if (fill.opacity === undefined || fill.opacity > 0.01) {
        result.add(hex);
      }
    }
  }
}

/**
 * 递归收集 ProcessedNode 树中的颜色、资源、文本、组件、间距、圆角、阴影信息
 *
 * 遍历整个节点树，将各类信息收集到对应的集合/数组中：
 * - colors: 所有纯色填充/描边/阴影的 hex 颜色（去重）
 * - assets: 所有标记为资源的节点（图片/图标/SVG）
 * - textNodes: 所有文本节点的摘要（内容、颜色、字号、字重、样式）
 * - componentsUsed: 所有可复用组件实例的使用统计
 * - spacingValues: 所有间距值（padding/gap，去重）
 * - radiusValues: 所有圆角值（四角独立，去重）
 * - shadows: 所有阴影效果
 *
 * @param node - 当前处理的节点
 * @param colors - 颜色集合（输出）
 * @param assets - 资源数组（输出）
 * @param textNodes - 文本摘要数组（输出）
 * @param componentsUsed - 组件使用统计 Map（输出）
 * @param spacingValues - 间距值集合（输出）
 * @param radiusValues - 圆角值集合（输出）
 * @param shadows - 阴影数组（输出）
 */
function collectNodeInfo(
  node: ProcessedNode,
  colors: Set<string>,
  assets: ProcessedAsset[],
  textNodes: TextNodeSummary[],
  componentsUsed: Map<string, { id: string; name: string; key?: string; instanceCount: number }>,
  spacingValues: Set<number>,
  radiusValues: Set<number>,
  shadows: ProcessedShadow[],
): void {
  // ============ 收集颜色 ============
  collectColorsFromFills(node.fills, colors);
  // 描边颜色
  if (node.strokes) {
    for (const stroke of node.strokes) {
      colors.add(colorToHex(stroke.color));
    }
  }
  // 阴影颜色
  if (node.effects) {
    for (const shadow of node.effects) {
      shadows.push(shadow);
      if (shadow.color.a > 0.01) {
        colors.add(colorToHex(shadow.color));
      }
    }
  }

  // ============ 收集间距 ============
  // 间距来自 Auto Layout 的 padding 和 itemSpacing
  if (node.layout) {
    const { itemSpacing, padding, counterAxisSpacing } = node.layout;
    // 主轴子项间距（gap）
    if (itemSpacing > 0) spacingValues.add(itemSpacing);
    // 交叉轴间距（多行/列布局时的行距/列距）
    if (counterAxisSpacing && counterAxisSpacing > 0) spacingValues.add(counterAxisSpacing);
    // 四边内边距
    if (padding.top > 0) spacingValues.add(padding.top);
    if (padding.right > 0) spacingValues.add(padding.right);
    if (padding.bottom > 0) spacingValues.add(padding.bottom);
    if (padding.left > 0) spacingValues.add(padding.left);
  }

  // ============ 收集圆角 ============
  // 四角圆角独立收集，便于后续判断是否统一圆角
  if (node.cornerRadius) {
    radiusValues.add(node.cornerRadius.topLeft);
    radiusValues.add(node.cornerRadius.topRight);
    radiusValues.add(node.cornerRadius.bottomRight);
    radiusValues.add(node.cornerRadius.bottomLeft);
  }

  // ============ 收集资源 ============
  // node-processor 标记的 asset（图片/图标/SVG）
  if (node.asset) {
    assets.push(node.asset);
  }

  // ============ 收集组件实例统计 ============
  // reusable-component 角色表示 Figma Component/Instance
  if (node.role === 'reusable-component' && node.componentName) {
    const existing = componentsUsed.get(node.componentName);
    if (existing) {
      existing.instanceCount++;
    } else {
      componentsUsed.set(node.componentName, {
        id: node.figmaId,
        name: node.componentName,
        key: node.componentKey,
        instanceCount: 1,
      });
    }
  }

  // ============ 收集文本节点摘要 ============
  // 文本节点包含内容、颜色、字号、字重、字体样式
  if (node.role === 'text' && node.textContent && node.textStyle) {
    const textFill = node.fills?.find((f) => f.type === 'solid' && f.color);
    textNodes.push({
      id: node.figmaId,
      content: node.textContent,
      color: textFill && textFill.type === 'solid' && textFill.color ? colorToHex(textFill.color) : '#000000',
      fontSize: node.textStyle.fontSize,
      fontWeight: node.textStyle.fontWeight,
      style: {
        name: `text-${node.textStyle.fontSize}`,
        fontFamily: node.textStyle.fontFamily,
        fontWeight: node.textStyle.fontWeight,
        fontSize: node.textStyle.fontSize,
        lineHeight: node.textStyle.lineHeightPx,
        letterSpacing: node.textStyle.letterSpacing,
      },
    });
  }

  // ============ 递归处理子节点 ============
  if (node.children) {
    for (const child of node.children) {
      collectNodeInfo(child, colors, assets, textNodes, componentsUsed, spacingValues, radiusValues, shadows);
    }
  }
}

// ============ Metadata 辅助函数 ============

/**
 * 从 FigmaNode 生成一层 NodeOverview（用于 metadata 轻量输出）
 *
 * NodeOverview 只包含节点的高层摘要信息，避免返回完整节点树导致上下文爆炸。
 *
 * @param node - Figma 节点
 * @param role - 预检测的语义角色
 * @returns 节点概览对象
 */
function buildNodeOverview(node: FigmaNode, role: NodeSemanticRole): NodeOverview {
  const size = node.absoluteBoundingBox || node.absoluteRenderBounds;
  // 检查是否有 IMAGE 填充
  const hasImageFill = !!(node.fills && node.fills.some((f) => f.type === 'IMAGE'));
  // 检查自身或直接子节点是否包含 TEXT
  const hasText = !!(node.type === 'TEXT' || (node.children && node.children.some((c) => c.type === 'TEXT')));

  return {
    id: node.id,
    name: node.name,
    type: node.type,
    size: size ? { width: size.width, height: size.height } : { width: 0, height: 0 },
    childCount: node.children?.filter((c) => c.visible !== false).length || 0,
    isComponent: node.type === 'COMPONENT' || node.type === 'COMPONENT_SET' || node.type === 'INSTANCE',
    hasImageFill,
    hasText,
    semanticRole: role,
  };
}

/**
 * 快速检测节点语义角色（不递归子节点，用于 metadata 概览性能优化）
 *
 * 与 node-processor 中的 detectSemanticRole 相比，这是一个简化版本，
 * 只检测最常见的角色，避免完整的节点处理开销。
 *
 * @param node - Figma 节点
 * @returns 语义角色
 */
function quickDetectRole(node: FigmaNode): NodeSemanticRole {
  const name = node.name.toLowerCase();
  // 文本节点最高优先级
  if (node.type === 'TEXT') return 'text';
  // 可复用组件
  if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET' || node.type === 'INSTANCE')
    return 'reusable-component';
  // 图标（矢量类型或名称含 icon）
  if (node.type === 'VECTOR' || node.type === 'BOOLEAN_OPERATION' || name.includes('icon') || name.includes('图标'))
    return 'icon';
  // 图片（IMAGE 填充或名称含 image/img）
  if (name.includes('image') || name.includes('img') || node.fills?.some((f) => f.type === 'IMAGE')) return 'image';
  // 按钮
  if (name.includes('button') || name.includes('btn')) return 'button';
  // 卡片
  if (name.includes('card')) return 'card';
  // 纯布局节点（FRAME + Auto Layout + 无视觉属性）
  if (isLayoutOnlyQuick(node)) return 'layout-only';
  // 兜底：普通容器
  return 'container';
}

/**
 * 快速判断节点是否为纯布局节点（FRAME + Auto Layout + 无视觉属性）
 *
 * 与 node-processor 中的 isLayoutOnly 类似，但为性能优化做了简化：
 * - 只检查显式的视觉属性（SOLID 填充、描边、圆角、可见阴影）
 * - 不做完整的视觉属性检查（如渐变、背景模糊等）
 *
 * @param node - Figma 节点
 * @returns 纯布局节点返回 true
 */
function isLayoutOnlyQuick(node: FigmaNode): boolean {
  if (node.type !== 'FRAME') return false;
  if (!node.layoutMode || node.layoutMode === 'NONE') return false;
  // 检查是否有可见的 SOLID 填充（非全透明）
  if (node.fills && node.fills.some((f) => f.visible !== false && f.type === 'SOLID' && f.color && f.color.a > 0))
    return false;
  // 检查是否有描边
  if (node.strokes && node.strokes.length > 0 && node.strokeWeight && node.strokeWeight > 0) return false;
  // 检查是否有圆角
  if (node.cornerRadius && node.cornerRadius > 0) return false;
  // 检查是否有可见的阴影/效果（忽略 LAYER_BLUR）
  if (node.effects && node.effects.some((e) => e.visible && e.type !== 'LAYER_BLUR')) return false;
  return true;
}

// ============ DesignContextService 类 ============

/**
 * 设计上下文服务类
 *
 * 提供高层元数据概览和完整设计上下文两种粒度的设计信息获取能力。
 * 通过工厂函数 {@link createDesignContextService} 创建实例。
 *
 * @example
 * ```typescript
 * const service = createDesignContextService(figmaClient);
 *
 * // 1. 先获取高层概览（轻量）
 * const metadata = await service.getMetadata(fileKey);
 * console.log(`页面有 ${metadata.children.length} 个区块`);
 *
 * // 2. 获取某个区块的完整设计上下文（用于代码生成）
 * const context = await service.getDesignContext(fileKey, targetNodeId);
 * ```
 */
export class DesignContextService {
  /** Figma API 客户端实例 */
  private readonly _client: FigmaClient;
  /** 服务配置（已合并默认值） */
  private readonly _options: Required<DesignContextOptions>;

  /**
   * 构造函数 - 初始化设计上下文服务
   *
   * @param client - Figma API 客户端实例
   * @param options - 服务配置选项
   */
  constructor(client: FigmaClient, options: DesignContextOptions = {}) {
    this._client = client;
    this._options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * 获取节点高层元数据（概览）
   *
   * 只返回一层子节点信息，输出大小控制在 < 4KB，可安全放入 AI 上下文。
   * 使用场景：在开始实现前，先了解一个页面/Frame 有几个区块、用了什么组件、主要颜色等。
   *
   * @param fileKey - Figma 文件 Key
   * @param nodeId - 节点 ID（可选，不传则获取整个文件根节点）
   * @param depth - 子节点概览深度，默认 1
   * @returns 设计元数据对象
   * @throws {Error} 节点不存在时抛出错误
   */
  async getMetadata(fileKey: string, nodeId?: string, depth: number = 1): Promise<DesignMetadata> {
    // 获取节点数据，depth+1 即可获得一层子节点信息（当前层 + 直接子节点）
    const node = nodeId
      ? await this._client.getNode(fileKey, nodeId, depth + 1)
      : (await this._client.getFile(fileKey, undefined, depth + 1)).document;

    if (!node) {
      throw new Error(`Node not found: ${nodeId || 'root'}`);
    }

    const size = node.absoluteBoundingBox || node.absoluteRenderBounds;

    // ============ 构建直接子节点概览 ============
    const children: NodeOverview[] = [];
    const colorsUsed = new Set<string>();
    const componentsUsed = new Set<string>();
    const typographyStyles = new Set<string>();
    let imageCount = 0;
    let textNodeCount = 0;

    // ============ 统计当前节点自身的属性 ============
    if (node.type === 'TEXT') {
      textNodeCount++;
    }
    if (node.fills) {
      for (const fill of node.fills) {
        if (fill.type === 'SOLID' && fill.color && fill.color.a > 0) {
          colorsUsed.add(colorToHex(fill.color));
        }
        if (fill.type === 'IMAGE') imageCount++;
      }
    }
    if (node.style) {
      typographyStyles.add(`${node.style.fontFamily}-${node.style.fontWeight}-${node.style.fontSize}`);
    }
    if (node.type === 'COMPONENT' || node.type === 'INSTANCE') {
      componentsUsed.add(node.name);
    }

    // ============ 统计直接子节点（仅一层，不递归） ============
    if (node.children) {
      for (const child of node.children) {
        // 跳过不可见子节点
        if (child.visible === false) continue;

        const role = quickDetectRole(child);
        children.push(buildNodeOverview(child, role));

        // 统计子节点的颜色、图片、文本等
        if (child.fills) {
          for (const fill of child.fills) {
            if (fill.type === 'SOLID' && fill.color && fill.color.a > 0) {
              colorsUsed.add(colorToHex(fill.color));
            }
            if (fill.type === 'IMAGE') imageCount++;
          }
        }
        if (child.type === 'TEXT') {
          textNodeCount++;
          if (child.style) {
            typographyStyles.add(`${child.style.fontFamily}-${child.style.fontWeight}-${child.style.fontSize}`);
          }
        }
        if (child.type === 'COMPONENT' || child.type === 'INSTANCE' || child.type === 'COMPONENT_SET') {
          componentsUsed.add(child.name);
        }
      }
    }

    // ============ 构建并返回元数据 ============
    // 最多返回 30 个颜色，避免上下文过长
    return {
      name: node.name,
      type:
        node.type === 'CANVAS' ||
        node.type === 'FRAME' ||
        node.type === 'COMPONENT' ||
        node.type === 'COMPONENT_SET' ||
        node.type === 'SECTION'
          ? (node.type as DesignMetadata['type'])
          : 'FRAME',
      size: size ? { width: size.width, height: size.height } : { width: 0, height: 0 },
      children,
      childCount: node.children?.length || 0,
      colorsUsed: Array.from(colorsUsed).slice(0, 30),
      componentsUsed: Array.from(componentsUsed),
      typographyStyles: Array.from(typographyStyles),
      imageCount,
      textNodeCount,
    };
  }

  /**
   * 获取节点的完整设计上下文（精简后）
   *
   * 包含：精简节点树、使用的颜色 tokens、间距、圆角、资源列表、文本节点摘要、组件使用统计。
   * 此方法使用 node-processor 对原始节点树进行扁平化和语义标注，
   * 输出结果直接可用作 AI 代码生成的结构化输入。
   *
   * @param fileKey - Figma 文件 Key
   * @param nodeId - 目标节点 ID
   * @param maxDepth - 最大处理深度，默认使用配置的 defaultMaxDepth
   * @param _includeChildren - 是否包含子节点（预留参数，当前始终包含）
   * @returns 完整设计上下文对象
   * @throws {Error} 节点不存在时抛出错误
   */
  async getDesignContext(
    fileKey: string,
    nodeId: string,
    maxDepth: number = this._options.defaultMaxDepth,
    _includeChildren: boolean = true,
  ): Promise<DesignContext> {
    // ============ 获取原始节点 ============
    // 获取足够深度的原始节点（node-processor 内部会控制输出深度）
    // maxDepth+2 是为了给扁平化操作预留缓冲
    const rawNode = await this._client.getNode(fileKey, nodeId, maxDepth > 0 ? maxDepth + 2 : -1);

    if (!rawNode) {
      throw new Error(`Node not found: ${nodeId} in file ${fileKey}`);
    }

    // ============ 使用 node-processor 精简处理 ============
    // 配置：跳过不可见、扁平化 GROUP、自动检测资源
    const processor = createNodeProcessor({
      maxDepth,
      skipInvisible: true,
      flattenGroups: true,
      detectAssets: true,
    });

    const result = processor.process(rawNode);
    const processedNode = result.node;

    // ============ 收集节点树中的所有信息 ============
    const colors = new Set<string>();
    const assets: ProcessedAsset[] = [];
    const textNodes: TextNodeSummary[] = [];
    const componentsUsed = new Map<string, { id: string; name: string; key?: string; instanceCount: number }>();
    const spacingValues = new Set<number>();
    const radiusValues = new Set<number>();
    const shadows: ProcessedShadow[] = [];

    // 递归遍历精简后的节点树，收集所有设计信息
    collectNodeInfo(processedNode, colors, assets, textNodes, componentsUsed, spacingValues, radiusValues, shadows);

    // ============ 将颜色 hex 转为 ColorToken 数组 ============
    // 为每个颜色生成临时名称（color-1, color-2, ...），后续可通过 token-matcher 匹配到系统色板
    const colorTokens: ColorToken[] = Array.from(colors).map((hex, i) => ({
      name: `color-${i + 1}`,
      value: hex,
      valueRgb: {
        r: Number.parseInt(hex.slice(1, 3), 16),
        g: Number.parseInt(hex.slice(3, 5), 16),
        b: Number.parseInt(hex.slice(5, 7), 16),
      },
    }));

    // ============ 组装并返回设计上下文 ============
    return {
      node: processedNode,
      colors: colorTokens,
      // 间距和圆角按数值升序排列，便于阅读和 token 匹配
      spacing: Array.from(spacingValues).sort((a, b) => a - b),
      radii: Array.from(radiusValues).sort((a, b) => a - b),
      shadows,
      assets,
      textNodes,
      componentsUsed: Array.from(componentsUsed.values()),
    };
  }

  /**
   * 列出文件中所有 Figma Components 和 Component Sets
   *
   * 用于组件库浏览和映射配置。
   *
   * @param fileKey - Figma 文件 Key
   * @returns 组件和组件集列表
   */
  async listComponents(fileKey: string): Promise<{
    components: Array<FigmaComponent & { nodeId?: string }>;
    componentSets: Array<{ key: string; name: string; description: string; componentIds: string[] }>;
  }> {
    // depth=1 只获取文件元数据（包含 components/componentSets 映射），不加载完整节点树
    const file = await this._client.getFile(fileKey, undefined, 1);
    const components = Object.values(file.components).map((c) => Object.assign({}, c));
    const componentSets = Object.values(file.componentSets).map((cs) =>
      Object.assign({}, cs, {
        componentIds: [] as string[],
      }),
    );

    return { components, componentSets };
  }
}

// ============ 工厂函数 ============

/**
 * 创建设计上下文服务实例的工厂函数
 *
 * @param client - Figma API 客户端实例
 * @param options - 服务配置选项
 * @returns DesignContextService 实例
 */
export function createDesignContextService(client: FigmaClient, options?: DesignContextOptions): DesignContextService {
  return new DesignContextService(client, options);
}
