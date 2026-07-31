/**
 * Tailwind 类名映射器 - Tailwind Mapper
 *
 * 核心职责：接收经 node-processor 精简后的 ProcessedNode，结合 TokenMatcher
 * 生成精确命中设计系统的 Tailwind className，尽量复用项目已有的 design token，
 * 无法匹配时使用任意值语法（arbitrary values）或标记需要 @theme 扩展。
 *
 * **支持的样式映射分类：**
 * 1. **可见性与变换**：hidden、opacity-*、rotate-*、overflow-hidden
 * 2. **Flex 布局**：flex 方向、主轴/交叉轴对齐、gap、padding、flex-wrap、align-self、flex-grow
 * 3. **尺寸**：w-*、h-*（根据 Auto Layout sizing mode 智能决定是否设置）
 * 4. **圆角**：统一圆角 rounded-* 或四角独立 rounded-tl/tr/br/bl-*
 * 5. **描边**：border 宽度 + 颜色
 * 6. **填充**：纯色 bg-*、text-*、线性渐变 bg-gradient-to-*、背景图片
 * 7. **阴影/效果**：shadow-sm/md/lg/xl/inner、内联 box-shadow 兜底
 * 8. **绝对定位**：absolute + left/top/right/bottom
 * 9. **文本样式**：font-weight、font-size、line-height、letter-spacing、font-family、text-align、text-decoration、text-case
 *
 * **映射策略（优先级从高到低）：**
 * 1. TokenMatcher 精确/模糊匹配 → 使用设计系统 token 类名（如 bg-primary-500）
 * 2. Tailwind 标准预设值 → 使用内置类名（如 flex、items-center）
 * 3. 任意值语法兜底 → bg-[#hex]、w-[123px]
 * 4. 内联样式兜底 → 复杂渐变、非标准阴影（inlineStyle）
 * 5. @theme 扩展标记 → 记录到 extensionsNeeded 供开发者手动扩展
 *
 * @module
 */

// ============ 依赖导入 ============

import type { FigmaColor } from '../types.js';
import type {
  ProcessedNode,
  ProcessedAutoLayout,
  ProcessedFill,
  ProcessedStroke,
  ProcessedCornerRadius,
  ProcessedShadow,
  ProcessedTextStyle,
  ProcessedSize,
  ProcessedPadding,
  ProcessedAbsolutePosition,
  GradientStop,
} from '../types/nodes.js';
import { cn } from '../utils/cn.js';
import { type TokenMatcher, getTokenMatcher } from './token-matcher.js';

// ============ 类型定义 ============

/**
 * Tailwind 映射结果
 *
 * @example
 * ```typescript
 * const result = mapper.mapNode(node);
 * // {
 * //   className: "flex flex-col items-center p-4 bg-primary-500",
 * //   extensionsNeeded: [{ type: "spacing", suggestedName: "spacing-18", originalValue: "72px" }],
 * //   inlineStyle: undefined
 * // }
 * ```
 */
export interface TailwindMapping {
  /** 生成的 className 字符串（已用 cn() 规范化，自动去重和处理冲突） */
  className: string;
  /**
   * 无法映射为现有 token、需要在 Tailwind `@theme` 中扩展的值列表
   *
   * 开发者可根据此列表在 tailwind.config.ts 或 CSS `@theme` 块中补充自定义 token。
   */
  extensionsNeeded: Array<{
    /** 扩展类型分类 */
    type: 'color' | 'spacing' | 'radius' | 'shadow' | 'font-size' | 'font-weight';
    /** 建议的 token 名称（如 "primary-custom"、"spacing-72"） */
    suggestedName: string;
    /** 原始 Figma 值（如 "#FF5500"、"72px"） */
    originalValue: string;
  }>;
  /**
   * 内联样式对象（仅当无法用 Tailwind 类名表达时使用）
   *
   * 典型场景：复杂多色渐变、非标准多层阴影、特殊变换。
   * 调用方应将此对象展开到元素的 style 属性。
   */
  inlineStyle?: Record<string, string | number>;
}

/**
 * Tailwind 映射器配置选项
 */
export interface TailwindMapperOptions {
  /**
   * 是否允许使用 Tailwind 任意值语法（arbitrary values）
   *
   * - `true`（默认）：无法匹配 token 时使用 `bg-[#hex]`、`w-[123px]` 等语法
   * - `false`：不使用任意值，只标记 extensionsNeeded，强制使用设计系统 token
   */
  allowArbitrary?: boolean;
}

// ============ 常量定义 ============

/** 默认映射器配置 */
const DEFAULT_OPTIONS: Required<TailwindMapperOptions> = {
  allowArbitrary: true,
};

// ============ TailwindMapper 类 ============

/**
 * Tailwind 类名映射器类
 *
 * 将 ProcessedNode 的样式属性映射为 Tailwind CSS 类名字符串，
 * 是 Figma 设计到 React 代码转换的核心环节。
 *
 * 通过工厂函数 {@link createTailwindMapper} 创建实例。
 *
 * @example
 * ```typescript
 * const mapper = createTailwindMapper({ allowArbitrary: true });
 * const result = mapper.mapNode(processedNode);
 *
 * // 在 JSX 中使用
 * <div className={result.className} style={result.inlineStyle}>
 *   {children}
 * </div>
 * ```
 */
export class TailwindMapper {
  /** Token 匹配器实例，用于颜色/间距/圆角/字号/字重的智能匹配 */
  private readonly _matcher: TokenMatcher;
  /** 映射器配置（已合并默认值） */
  private readonly _options: Required<TailwindMapperOptions>;

  /**
   * 构造函数 - 初始化 Tailwind 映射器
   *
   * @param options - 映射器配置选项
   */
  constructor(options: TailwindMapperOptions = {}) {
    this._matcher = getTokenMatcher();
    this._options = { ...DEFAULT_OPTIONS, ...options };
  }

  // ============ 公共入口方法 ============

  /**
   * 将单个 ProcessedNode 的所有样式属性映射为 Tailwind 类名 + 必要内联样式
   *
   * 按顺序处理以下样式类别：
   * 1. 可见性与透明度
   * 2. 溢出裁剪
   * 3. 旋转变换
   * 4. Flex 布局（direction/alignment/gap/padding）
   * 5. 尺寸（width/height）
   * 6. 圆角
   * 7. 描边
   * 8. 填充（背景色/渐变/图片）
   * 9. 阴影/效果
   * 10. 绝对定位
   * 11. 文本样式（仅文本节点）
   *
   * @param node - 经 node-processor 精简后的节点
   * @returns 映射结果（className + extensionsNeeded + inlineStyle）
   */
  mapNode(node: ProcessedNode): TailwindMapping {
    const classes: string[] = [];
    const extensionsNeeded: TailwindMapping['extensionsNeeded'] = [];
    const inlineStyle: Record<string, string | number> = {};

    // ============ 1. 可见性与透明度 ============
    this._mapVisibility(node, classes);

    // ============ 2. 溢出裁剪 ============
    if (node.clipsContent) {
      classes.push('overflow-hidden');
    }

    // ============ 3. 旋转变换 ============
    if (node.rotation !== undefined && Math.abs(node.rotation) > 0.1) {
      // 微小旋转（< 0.1deg）视为 Figma 导出误差，忽略
      classes.push(`rotate-[${node.rotation}deg]`);
    }

    // ============ 4. Flex 布局 ============
    this._mapLayout(node.layout, node.alignSelf, node.flexGrow, classes);

    // ============ 5. 尺寸（width/height） ============
    this._mapSize(node.size, node.layout, classes);

    // ============ 6. 圆角 ============
    if (node.cornerRadius) {
      this._mapCornerRadius(node.cornerRadius, classes, extensionsNeeded);
    }

    // ============ 7. 描边 ============
    if (node.strokes && node.strokes.length > 0) {
      this._mapStrokes(node.strokes, classes, extensionsNeeded);
    }

    // ============ 8. 填充（背景色/渐变/图片） ============
    if (node.fills && node.fills.length > 0) {
      this._mapFills(node.fills, node.role, classes, extensionsNeeded, inlineStyle);
    }

    // ============ 9. 阴影/效果 ============
    if (node.effects && node.effects.length > 0) {
      this._mapShadows(node.effects, classes, extensionsNeeded, inlineStyle);
    }

    // ============ 10. 绝对定位 ============
    if (node.absolutePosition) {
      this._mapAbsolutePosition(node.absolutePosition, classes);
    }

    // ============ 11. 文本样式（仅文本节点） ============
    if ((node.role === 'text' || node.originalType === 'TEXT') && node.textContent !== undefined && node.textStyle) {
      this._mapText(node.textStyle, classes, extensionsNeeded);
    }

    return {
      className: cn(...classes),
      extensionsNeeded,
      inlineStyle: Object.keys(inlineStyle).length > 0 ? inlineStyle : undefined,
    };
  }

  // ============ 私有映射方法 - 可见性与变换 ============

  /**
   * 映射可见性与透明度
   *
   * - visible=false → hidden（完全隐藏）
   * - opacity < 1 → opacity-*（标准透明度值或任意值）
   *
   * @param node - 当前节点
   * @param classes - 类名数组（输出参数）
   */
  private _mapVisibility(node: ProcessedNode, classes: string[]): void {
    if (node.visible === false) {
      classes.push('hidden');
    }

    if (node.opacity !== undefined && node.opacity < 1 && node.opacity >= 0) {
      const pct = Math.round(node.opacity * 100);
      // Tailwind 内置的标准透明度值：0, 5, 10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 95, 100
      const stdOpacityValues = [0, 5, 10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 95, 100];
      if (stdOpacityValues.includes(pct)) {
        classes.push(`opacity-${pct}`);
      } else {
        // 非标准透明度使用任意值语法
        classes.push(`opacity-[${pct}]`);
      }
    }
  }

  // ============ 私有映射方法 - 布局 ============

  /**
   * 映射 Flex 布局属性：方向、对齐、gap、padding、wrap、align-self、flex-grow
   *
   * @param layout - Auto Layout 数据
   * @param alignSelf - 子项自身对齐方式
   * @param flexGrow - flex-grow 值
   * @param classes - 类名数组（输出参数）
   */
  private _mapLayout(
    layout: ProcessedAutoLayout | undefined,
    alignSelf: ProcessedNode['alignSelf'],
    flexGrow: number | undefined,
    classes: string[],
  ): void {
    if (!layout || layout.mode === 'NONE') return;

    // ============ Flex 方向 ============
    if (layout.mode === 'HORIZONTAL') {
      classes.push('flex', 'flex-row');
    } else {
      classes.push('flex', 'flex-col');
    }

    // ============ 主轴对齐（justify-content） ============
    switch (layout.primaryAxisAlign) {
      case 'CENTER':
        classes.push('justify-center');
        break;
      case 'MAX':
        // Figma 中 MAX 对应主轴终点对齐（水平布局=右对齐，垂直布局=底部对齐）
        classes.push('justify-end');
        break;
      case 'SPACE_BETWEEN':
        classes.push('justify-between');
        break;
      case 'MIN':
      default:
        // MIN 对应主轴起点对齐（默认值）
        classes.push('justify-start');
    }

    // ============ 交叉轴对齐（align-items） ============
    switch (layout.counterAxisAlign) {
      case 'CENTER':
        classes.push('items-center');
        break;
      case 'MAX':
        classes.push('items-end');
        break;
      case 'BASELINE':
        classes.push('items-baseline');
        break;
      case 'MIN':
      default:
        classes.push('items-start');
    }

    // ============ Flex 换行 ============
    if (layout.layoutWrap === 'WRAP') {
      classes.push('flex-wrap');
    }

    // ============ 主轴间距（gap） ============
    if (layout.itemSpacing > 0) {
      const match = this._matcher.matchSpacing(layout.itemSpacing, 'gap');
      classes.push(this._cls(match, `gap-[${layout.itemSpacing}px]`));
    }

    // ============ 交叉轴间距（gap-x / gap-y） ============
    // Figma counterAxisSpacing 在水平布局时对应垂直间距（gap-y），垂直布局时对应水平间距（gap-x）
    if (layout.counterAxisSpacing !== undefined && layout.counterAxisSpacing > 0) {
      if (layout.mode === 'HORIZONTAL') {
        const match = this._matcher.matchSpacing(layout.counterAxisSpacing, 'gap', 'y');
        classes.push(this._cls(match, `gap-y-[${layout.counterAxisSpacing}px]`));
      } else {
        const match = this._matcher.matchSpacing(layout.counterAxisSpacing, 'gap', 'x');
        classes.push(this._cls(match, `gap-x-[${layout.counterAxisSpacing}px]`));
      }
    }

    // ============ 内边距（padding） ============
    this._mapPadding(layout.padding, classes);

    // ============ 子项自身对齐（align-self） ============
    if (alignSelf) {
      switch (alignSelf) {
        case 'CENTER':
          classes.push('self-center');
          break;
        case 'MAX':
          classes.push('self-end');
          break;
        case 'STRETCH':
          classes.push('self-stretch');
          break;
        case 'MIN':
        default:
          classes.push('self-start');
      }
    }

    // ============ Flex Grow ============
    if (flexGrow !== undefined && flexGrow > 0) {
      // flex-1 对应 flex-grow: 1（最常用场景）
      classes.push(flexGrow === 1 ? 'flex-1' : `grow-[${flexGrow}]`);
    }
  }

  /**
   * 映射内边距（padding）
   *
   * - 四边相等时使用 p-*
   * - 四边不等时分别使用 pt-/pr-/pb-/pl-*
   *
   * @param padding - 四边内边距数据
   * @param classes - 类名数组（输出参数）
   */
  private _mapPadding(padding: ProcessedPadding, classes: string[]): void {
    const { top, right, bottom, left } = padding;
    const allEqual = top === right && right === bottom && bottom === left;

    if (allEqual) {
      if (top === 0) {
        classes.push('p-0');
      } else {
        const match = this._matcher.matchSpacing(top, 'p');
        classes.push(this._cls(match, `p-[${top}px]`));
      }
      return;
    }

    // 四边不等，分别映射
    const dirs: Array<['pt' | 'pr' | 'pb' | 'pl', number]> = [
      ['pt', top],
      ['pr', right],
      ['pb', bottom],
      ['pl', left],
    ];
    for (const [prefix, val] of dirs) {
      if (val === 0) {
        classes.push(`${prefix}-0`);
      } else {
        const dirMap: Record<string, 't' | 'r' | 'b' | 'l'> = { pt: 't', pr: 'r', pb: 'b', pl: 'l' };
        const match = this._matcher.matchSpacing(val, 'p', dirMap[prefix]!);
        classes.push(this._cls(match, `${prefix}-[${val}px]`));
      }
    }
  }

  // ============ 私有映射方法 - 尺寸 ============

  /**
   * 映射尺寸（width/height）
   *
   * 根据 Auto Layout 的 sizing mode 智能决定是否显式设置尺寸：
   * - **主轴**：FIXED → 显式设置；AUTO → 不设置（由内容撑开）
   * - **交叉轴**：FIXED → 设置另一个维度；AUTO → 拉伸（不设置）
   * - **无布局模式**：宽高都设置
   *
   * @param size - 宽高尺寸
   * @param layout - Auto Layout 数据（用于判断 sizing mode）
   * @param classes - 类名数组（输出参数）
   */
  private _mapSize(size: ProcessedSize | undefined, layout: ProcessedAutoLayout | undefined, classes: string[]): void {
    if (!size) return;

    const isHorizontalLayout = layout?.mode === 'HORIZONTAL';
    const isVerticalLayout = layout?.mode === 'VERTICAL';

    // 判断是否需要显式设置宽高
    // 水平布局：宽度是主轴，高度是交叉轴
    // 垂直布局：高度是主轴，宽度是交叉轴
    const shouldSetWidth =
      !isHorizontalLayout || layout?.primaryAxisSizing === 'FIXED' || layout?.counterAxisSizing === 'FIXED';
    const shouldSetHeight =
      !isVerticalLayout || layout?.primaryAxisSizing === 'FIXED' || layout?.counterAxisSizing === 'FIXED';

    // 无布局模式时，宽高都显式设置
    if (!layout) {
      this._setWidthClass(size.width, classes);
      this._setHeightClass(size.height, classes);
      return;
    }

    if (shouldSetWidth) this._setWidthClass(size.width, classes);
    if (shouldSetHeight) this._setHeightClass(size.height, classes);
  }

  /**
   * 设置宽度类名
   *
   * @param width - 宽度（像素）
   * @param classes - 类名数组（输出参数）
   */
  private _setWidthClass(width: number, classes: string[]): void {
    const match = this._matcher.matchSpacing(width, 'w');
    classes.push(this._cls(match, `w-[${width}px]`));
  }

  /**
   * 设置高度类名
   *
   * @param height - 高度（像素）
   * @param classes - 类名数组（输出参数）
   */
  private _setHeightClass(height: number, classes: string[]): void {
    const match = this._matcher.matchSpacing(height, 'h');
    classes.push(this._cls(match, `h-[${height}px]`));
  }

  // ============ 私有映射方法 - 圆角 ============

  /**
   * 映射圆角
   *
   * - 统一圆角（uniform 或四角相等）→ rounded-*
   * - 四角独立 → rounded-tl-/tr-/br-/bl-*
   *
   * @param cr - 圆角数据
   * @param classes - 类名数组（输出参数）
   * @param extensions - 待扩展 token 列表（输出参数）
   */
  private _mapCornerRadius(
    cr: ProcessedCornerRadius,
    classes: string[],
    extensions: TailwindMapping['extensionsNeeded'],
  ): void {
    const { topLeft, topRight, bottomRight, bottomLeft, uniform } = cr;

    // 统一圆角或四角相等
    if (uniform || (topLeft === topRight && topRight === bottomRight && bottomRight === bottomLeft)) {
      this._mapSingleRadius(topLeft, 'rounded', classes, extensions);
      return;
    }

    // 四角独立设置
    const corners: Array<[string, number]> = [
      ['rounded-tl', topLeft],
      ['rounded-tr', topRight],
      ['rounded-br', bottomRight],
      ['rounded-bl', bottomLeft],
    ];
    for (const [prefix, val] of corners) {
      this._mapSingleRadius(val, prefix, classes, extensions);
    }
  }

  /**
   * 映射单个圆角值
   *
   * @param px - 圆角值（像素）
   * @param prefix - 类名前缀（rounded/rounded-tl/rounded-tr/rounded-br/rounded-bl）
   * @param classes - 类名数组（输出参数）
   * @param extensions - 待扩展 token 列表（输出参数）
   */
  private _mapSingleRadius(
    px: number,
    prefix: string,
    classes: string[],
    extensions: TailwindMapping['extensionsNeeded'],
  ): void {
    if (px <= 0.5) {
      // ≤ 0.5px 视为无圆角（Figma 导出误差）
      classes.push(`${prefix}-none`);
      return;
    }

    const match = this._matcher.matchRadius(px);
    if (match.matched && match.className) {
      if (prefix === 'rounded') {
        // 统一圆角直接使用类名（如 rounded-lg）
        classes.push(match.className);
      } else {
        // 四角独立圆角需要提取后缀（如 rounded-lg → rounded-tl-lg）
        const suffix = match.className.replace('rounded-', '');
        classes.push(`${prefix}-${suffix}`);
      }
    } else {
      // 无匹配，使用任意值语法
      classes.push(`${prefix}-[${px}px]`);
      if (match.needsExtension) {
        extensions.push({
          type: 'radius',
          suggestedName: `radius-${Math.round(px)}`,
          originalValue: `${px}px`,
        });
      }
    }
  }

  // ============ 私有映射方法 - 描边 ============

  /**
   * 映射描边（border）
   *
   * 目前仅处理第一个有效描边（Figma 虽然支持多层描边，但实际设计中很少使用）。
   *
   * @param strokes - 描边数组
   * @param classes - 类名数组（输出参数）
   * @param extensions - 待扩展 token 列表（输出参数）
   */
  private _mapStrokes(
    strokes: ProcessedStroke[],
    classes: string[],
    extensions: TailwindMapping['extensionsNeeded'],
  ): void {
    for (const stroke of strokes) {
      // ============ 描边宽度 ============
      const weight = stroke.weight;
      if (weight === 1) classes.push('border');
      else if (weight === 2) classes.push('border-2');
      else if (weight === 4) classes.push('border-4');
      else if (weight === 8) classes.push('border-8');
      else classes.push(`border-[${weight}px]`);

      // ============ 描边颜色 ============
      const colorMatch = this._matcher.matchColor(stroke.color, 'border');
      if (colorMatch.matched && colorMatch.className) {
        classes.push(colorMatch.className);
      } else {
        const hex = this._colorToHex(stroke.color);
        if (this._options.allowArbitrary) classes.push(`border-[${hex}]`);
        extensions.push({ type: 'color', suggestedName: 'border-custom', originalValue: hex });
      }

      // 仅处理第一个描边（多层描边罕见，暂不支持）
      break;
    }
  }

  // ============ 私有映射方法 - 填充 ============

  /**
   * 映射填充（背景色/渐变/图片）
   *
   * **注意**：Figma fills 数组中后画的在顶层（类似 z-index），
   * 所以需要**倒序遍历**以确保背景色在底层。
   *
   * @param fills - 填充数组
   * @param role - 节点语义角色（text 角色使用 text-* 类名，其他使用 bg-*）
   * @param classes - 类名数组（输出参数）
   * @param extensions - 待扩展 token 列表（输出参数）
   * @param inlineStyle - 内联样式对象（输出参数，用于复杂渐变）
   */
  private _mapFills(
    fills: ProcessedFill[],
    role: string,
    classes: string[],
    extensions: TailwindMapping['extensionsNeeded'],
    inlineStyle: Record<string, string | number>,
  ): void {
    // Figma fills 数组：索引 0 是最底层，最后一个是最顶层
    // 倒序遍历确保先处理背景色（底层）
    for (let i = fills.length - 1; i >= 0; i--) {
      const fill = fills[i]!;

      switch (fill.type) {
        case 'solid': {
          // 纯色填充
          // text 角色使用 text-* 前景色类名，其他节点使用 bg-* 背景色
          const purpose: 'text' | 'bg' = role === 'text' ? 'text' : 'bg';
          const match = this._matcher.matchColor(fill.color, purpose);
          if (match.matched && match.className) {
            let cls = match.className;
            // 不透明度后缀（Tailwind v3 支持 bg-primary-500/50 语法）
            if (fill.opacity !== undefined && fill.opacity < 1) {
              cls += `/${Math.round(fill.opacity * 100)}`;
            }
            classes.push(cls);
          } else {
            const hex = this._colorToHex(fill.color, fill.opacity);
            if (this._options.allowArbitrary) classes.push(`${purpose}-[${hex}]`);
            extensions.push({ type: 'color', suggestedName: `${purpose}-custom`, originalValue: hex });
          }
          break;
        }

        case 'gradient-linear': {
          // 线性渐变
          this._mapLinearGradient(fill.gradientHandlePositions, fill.gradientStops, classes, inlineStyle);
          break;
        }

        case 'image': {
          // 图片填充（背景图片）
          classes.push('bg-cover', 'bg-center', 'bg-no-repeat');
          if (fill.scaleMode === 'FIT') classes.push('bg-contain');
          break;
        }
      }
    }
  }

  /**
   * 映射线性渐变
   *
   * - 简单渐变（方向是 8 个标准方向之一、色标 ≤ 3 个）→ 使用 Tailwind bg-gradient-to-* from-/via-/to-*
   * - 复杂渐变（任意角度、多色标）→ 使用内联 linear-gradient()
   *
   * @param handles - 渐变控制点位置（Figma gradientHandlePositions）
   * @param stops - 渐变色标
   * @param classes - 类名数组（输出参数）
   * @param inlineStyle - 内联样式对象（输出参数）
   */
  private _mapLinearGradient(
    handles: Array<{ x: number; y: number }>,
    stops: GradientStop[],
    classes: string[],
    inlineStyle: Record<string, string | number>,
  ): void {
    if (!handles || handles.length < 2 || !stops || stops.length < 2) return;

    const direction = this._gradientDirection(handles);
    if (direction && stops.length <= 3) {
      // ============ 简单渐变：使用 Tailwind 内置语法 ============
      classes.push('bg-gradient-to', direction);

      // from 色标（起点）
      const fromMatch = this._matcher.matchColor(stops[0]!.color, 'bg');
      if (fromMatch.matched) classes.push(`from-${fromMatch.tokenValue}`);
      else classes.push(`from-[${this._colorToHex(stops[0]!.color)}]`);

      // to 色标（终点）
      const toMatch = this._matcher.matchColor(stops[stops.length - 1]!.color, 'bg');
      if (toMatch.matched) classes.push(`to-${toMatch.tokenValue}`);
      else classes.push(`to-[${this._colorToHex(stops[stops.length - 1]!.color)}]`);

      // via 色标（中间点，仅 3 个色标时）
      if (stops.length === 3) {
        const viaMatch = this._matcher.matchColor(stops[1]!.color, 'bg');
        if (viaMatch.matched) classes.push(`via-${viaMatch.tokenValue}`);
        else classes.push(`via-[${this._colorToHex(stops[1]!.color)}]`);
      }
    } else {
      // ============ 复杂渐变：使用内联样式 ============
      const angle = this._gradientAngle(handles);
      const cssStops = stops.map((s) => `${this._colorToRgba(s.color)} ${(s.position * 100).toFixed(0)}%`).join(', ');
      inlineStyle.background = `linear-gradient(${angle}deg, ${cssStops})`;
    }
  }

  // ============ 私有映射方法 - 阴影 ============

  /**
   * 映射阴影/效果
   *
   * - inner shadow → shadow-inner
   * - drop shadow → 尝试匹配 Tailwind 预设（shadow-sm/md/lg/xl）
   * - 非标准阴影 → 内联 box-shadow
   *
   * @param effects - 阴影/效果数组
   * @param classes - 类名数组（输出参数）
   * @param extensions - 待扩展 token 列表（输出参数）
   * @param inlineStyle - 内联样式对象（输出参数）
   */
  private _mapShadows(
    effects: ProcessedShadow[],
    classes: string[],
    extensions: TailwindMapping['extensionsNeeded'],
    inlineStyle: Record<string, string | number>,
  ): void {
    for (const eff of effects) {
      if (eff.type === 'inner') {
        // 内阴影直接使用 Tailwind 预设
        classes.push('shadow-inner');
        continue;
      }

      // Drop shadow：尝试匹配预设
      const preset = this._matchShadowPreset(eff);
      if (preset) {
        classes.push(preset);
      } else {
        // 非标准阴影：使用内联样式
        const spreadPart = eff.spread ? ` ${eff.spread}px` : '';
        inlineStyle.boxShadow = `${eff.x}px ${eff.y}px ${eff.blur}px${spreadPart} ${this._colorToRgba(eff.color)}`;
        extensions.push({
          type: 'shadow',
          suggestedName: `shadow-${Math.round(eff.blur)}`,
          originalValue: inlineStyle.boxShadow as string,
        });
      }
    }
  }

  // ============ 私有映射方法 - 定位 ============

  /**
   * 映射绝对定位
   *
   * @param pos - 绝对定位数据
   * @param classes - 类名数组（输出参数）
   */
  private _mapAbsolutePosition(pos: ProcessedAbsolutePosition, classes: string[]): void {
    classes.push('absolute');
    classes.push(`left-[${pos.left}px]`, `top-[${pos.top}px]`);
    if (pos.right !== undefined) classes.push(`right-[${pos.right}px]`);
    if (pos.bottom !== undefined) classes.push(`bottom-[${pos.bottom}px]`);
  }

  // ============ 私有映射方法 - 文本样式 ============

  /**
   * 映射文本排版样式
   *
   * 处理顺序：font-weight → font-size → line-height → letter-spacing →
   *          font-family → text-align → text-decoration → text-case
   *
   * @param style - 文本样式数据
   * @param classes - 类名数组（输出参数）
   * @param extensions - 待扩展 token 列表（输出参数）
   */
  private _mapText(style: ProcessedTextStyle, classes: string[], extensions: TailwindMapping['extensionsNeeded']): void {
    // ============ 字重（font-weight） ============
    if (style.fontWeight !== undefined) {
      const weightMatch = this._matcher.matchFontWeight(style.fontWeight);
      if (weightMatch.matched && weightMatch.className) {
        classes.push(weightMatch.className);
      } else {
        classes.push(`font-[${style.fontWeight}]`);
        extensions.push({
          type: 'font-weight',
          suggestedName: `font-${style.fontWeight}`,
          originalValue: String(style.fontWeight),
        });
      }
    }

    // ============ 字号（font-size） ============
    if (style.fontSize !== undefined) {
      const sizeMatch = this._matcher.matchFontSize(style.fontSize);
      if (sizeMatch.matched && sizeMatch.className) {
        classes.push(sizeMatch.className);
      } else {
        classes.push(`text-[${style.fontSize}px]`);
        extensions.push({
          type: 'font-size',
          suggestedName: `text-${Math.round(style.fontSize)}`,
          originalValue: `${style.fontSize}px`,
        });
      }
    }

    // ============ 行高（line-height） ============
    if (style.lineHeightPx !== undefined && style.fontSize !== undefined) {
      const lhMatch = this._matcher.matchLineHeight(style.lineHeightPx, style.fontSize);
      if (lhMatch.matched && lhMatch.className) {
        classes.push(lhMatch.className);
      } else {
        classes.push(`leading-[${style.lineHeightPx}px]`);
      }
    }

    // ============ 字间距（letter-spacing） ============
    // 微小字间距（< 0.05px）视为 Figma 导出误差，忽略
    if (style.letterSpacing !== undefined && Math.abs(style.letterSpacing) > 0.05) {
      const lsMatch = this._matcher.matchLetterSpacing(style.letterSpacing);
      if (lsMatch.matched && lsMatch.className) {
        classes.push(lsMatch.className);
      } else {
        classes.push(`tracking-[${style.letterSpacing}px]`);
      }
    }

    // ============ 字体族（font-family） ============
    if (style.fontFamily) {
      const familyName = style.fontFamily.toLowerCase();
      // 简单关键字匹配：mono/code → font-mono, serif/宋 → font-serif, 其他 → font-sans
      if (familyName.includes('mono') || familyName.includes('code')) classes.push('font-mono');
      else if (familyName.includes('serif') || familyName.includes('song') || familyName.includes('宋'))
        classes.push('font-serif');
      else classes.push('font-sans');
    }

    // ============ 水平对齐（text-align） ============
    if (style.textAlignHorizontal) {
      switch (style.textAlignHorizontal) {
        case 'CENTER':
          classes.push('text-center');
          break;
        case 'RIGHT':
          classes.push('text-right');
          break;
        case 'JUSTIFIED':
          classes.push('text-justify');
          break;
        case 'LEFT':
        default:
          classes.push('text-left');
      }
    }

    // ============ 文本装饰（text-decoration） ============
    if (style.textDecoration === 'UNDERLINE') classes.push('underline');
    if (style.textDecoration === 'STRIKETHROUGH') classes.push('line-through');

    // ============ 大小写转换（text-case） ============
    if (style.textCase) {
      switch (style.textCase) {
        case 'UPPER':
          classes.push('uppercase');
          break;
        case 'LOWER':
          classes.push('lowercase');
          break;
        case 'TITLE':
          classes.push('capitalize');
          break;
      }
    }
  }

  // ============ 辅助方法 ============

  /**
   * 安全获取 TokenMatch 的 className
   *
   * 当匹配成功时返回匹配到的类名，否则返回 fallback 任意值类名。
   * 利用 TypeScript 类型守卫确保 matched=true 时 className 一定存在。
   *
   * @param match - Token 匹配结果
   * @param fallback - 匹配失败时的回退类名
   * @returns 最终使用的类名
   */
  private _cls(match: { matched: boolean; className?: string }, fallback: string): string {
    return match.matched && match.className ? match.className : fallback;
  }

  /**
   * 根据渐变控制点计算 Tailwind 渐变方向
   *
   * 将 Figma 的线性渐变向量映射到 Tailwind 的 8 个标准方向：
   * t/tr/r/br/b/bl/l/tl
   *
   * @param handles - 渐变控制点（至少 2 个：起点和终点）
   * @returns Tailwind 方向后缀（如 "r"、"br"），非标准方向返回 null
   */
  private _gradientDirection(handles: Array<{ x: number; y: number }>): string | null {
    const [start, , end] = handles;
    if (!start || !end) return null;

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    // 计算渐变角度（弧度 → 角度）
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

    // 8 个方向，每个 45 度区间
    if (angle >= -22.5 && angle < 22.5) return 'r';
    if (angle >= 22.5 && angle < 67.5) return 'br';
    if (angle >= 67.5 && angle < 112.5) return 'b';
    if (angle >= 112.5 && angle < 157.5) return 'bl';
    if (angle >= 157.5 || angle < -157.5) return 'l';
    if (angle >= -157.5 && angle < -112.5) return 'tl';
    if (angle >= -112.5 && angle < -67.5) return 't';
    if (angle >= -67.5 && angle < -22.5) return 'tr';

    return null;
  }

  /**
   * 根据渐变控制点计算 CSS linear-gradient 角度
   *
   * 注意：CSS 和 Figma 的角度坐标系不同：
   * - CSS `linear-gradient(0deg, ...)` 表示**从下到上**（to top）
   * - Figma 渐变向量 0 弧度表示**水平向右**
   *
   * 转换公式：cssAngle = 90 - figmaAngle（度）
   *
   * @param handles - 渐变控制点
   * @returns CSS 渐变角度（度）
   */
  private _gradientAngle(handles: Array<{ x: number; y: number }>): number {
    const [start, , end] = handles;
    if (!start || !end) return 90; // 默认向下渐变

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const angleRad = Math.atan2(dy, dx);
    // 转换为 CSS 角度（0deg = 向上）
    return Math.round(90 - (angleRad * 180) / Math.PI);
  }

  /**
   * 尝试将阴影匹配到 Tailwind 预设值
   *
   * 预设判定基于 Tailwind 默认阴影参数：
   * - shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05)
   * - shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)
   * - shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)
   * - shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)
   * - shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)
   *
   * @param shadow - 处理后的阴影数据
   * @returns 匹配到的 Tailwind 类名，不匹配返回 null
   */
  private _matchShadowPreset(shadow: ProcessedShadow): string | null {
    const isLightShadow = shadow.color.a < 0.2;

    // shadow-none：无模糊无偏移
    if (shadow.blur === 0 && shadow.x === 0 && shadow.y === 0) return 'shadow-none';
    // shadow-sm：轻微下偏移、小模糊、低透明度
    if (shadow.x === 0 && shadow.y === 1 && shadow.blur <= 2 && isLightShadow) return 'shadow-sm';
    // shadow：小模糊、中低透明度
    if (shadow.x === 0 && shadow.y === 1 && shadow.blur <= 4 && shadow.color.a <= 0.15) return 'shadow';
    // shadow-md：中等模糊
    if (
      shadow.x === 0 &&
      shadow.y >= 3 &&
      shadow.y <= 5 &&
      shadow.blur >= 4 &&
      shadow.blur <= 8 &&
      shadow.color.a <= 0.15
    )
      return 'shadow-md';
    // shadow-lg：大模糊
    if (
      shadow.x === 0 &&
      shadow.y >= 8 &&
      shadow.y <= 12 &&
      shadow.blur >= 10 &&
      shadow.blur <= 18 &&
      shadow.color.a <= 0.12
    )
      return 'shadow-lg';
    // shadow-xl：超大模糊
    if (shadow.x === 0 && shadow.y >= 18 && shadow.blur >= 20 && shadow.blur <= 30 && shadow.color.a <= 0.1)
      return 'shadow-xl';

    return null;
  }

  /**
   * 将 FigmaColor（0-1 浮点数 RGBA）转换为 hex 字符串
   *
   * @param color - Figma 颜色对象
   * @param alphaOverride - 可选的透明度覆盖值（如来自 fill.opacity）
   * @returns hex 字符串（如 "#FF5500" 或 "#FF550080"）
   */
  private _colorToHex(color: FigmaColor, alphaOverride?: number): string {
    const r = Math.round(color.r * 255)
      .toString(16)
      .padStart(2, '0');
    const g = Math.round(color.g * 255)
      .toString(16)
      .padStart(2, '0');
    const b = Math.round(color.b * 255)
      .toString(16)
      .padStart(2, '0');
    const alpha = alphaOverride !== undefined ? alphaOverride : color.a;

    if (alpha < 1) {
      const ai = Math.round(alpha * 255)
        .toString(16)
        .padStart(2, '0');
      return `#${r}${g}${b}${ai}`;
    }
    return `#${r}${g}${b}`;
  }

  /**
   * 将 FigmaColor 转换为 rgba() CSS 函数字符串
   *
   * 用于内联样式中的阴影、渐变等场景。
   *
   * @param color - Figma 颜色对象
   * @returns rgba() 字符串（如 "rgba(255,85,0,0.50)"）
   */
  private _colorToRgba(color: FigmaColor): string {
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    return `rgba(${r},${g},${b},${(color.a ?? 1).toFixed(2)})`;
  }
}

// ============ 工厂函数 ============

/**
 * 创建 TailwindMapper 实例
 *
 * @param options - 映射器配置选项
 * @returns TailwindMapper 实例
 *
 * @example
 * ```typescript
 * const mapper = createTailwindMapper({ allowArbitrary: true });
 * const result = mapper.mapNode(node);
 * ```
 */
export function createTailwindMapper(options?: TailwindMapperOptions): TailwindMapper {
  return new TailwindMapper(options);
}
