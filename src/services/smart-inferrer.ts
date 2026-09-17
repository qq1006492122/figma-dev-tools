/**
 * 智能推断器 - Smart Inferrer（v1.4.19 T21）
 *
 * 在增强器链中对精简节点树做四类「只建议、不改写」推断，避免与显式样式冲突：
 *
 * 1. grid（布局）：Auto Layout 换行容器与自由排版的规整行列矩阵 → CSS Grid 类；
 *    名称/坐标语义 → sticky / fixed / absolute（absolute 附最近定位祖先候选）；
 * 2. icons：≤48×48 且名称具图标语义（或小型矢量节点）→ Lucide（按框架分包）/
 *    Iconify 备选 / 内联 SVG 导出建议；
 * 3. dark-mode：dark/night/暗黑等语义命名或近黑实色填充 → dark: 前缀策略；
 * 4. motion：hover/pressed/loading/animate 等状态语义 → transition / hover /
 *    animate-* 时长类建议。
 *
 * 四个分项开关缺省全开，skipEnhancements 为总闸（由调用方在生成器层执行）。
 *
 * @module
 */

import type { Framework, SmartInferenceSwitches } from '../types.js';
import type { ProcessedNode } from '../types/nodes.js';

/** 推断类别（布局含 Grid/定位） */
export type SmartInferenceCategory = 'grid' | 'icon' | 'dark-mode' | 'motion';

/** 单条推断建议 */
export interface SmartSuggestion {
  /** 类别 */
  readonly category: SmartInferenceCategory;
  /** Figma 节点 ID */
  readonly nodeId: string;
  /** Figma 节点名（溯源） */
  readonly nodeName: string;
  /** 建议正文（英文，写入产物注释，与既有生成注释语言一致） */
  readonly message: string;
  /** 建议采用的 Tailwind/UnoCSS 原子类（可直接采纳） */
  readonly utilityClass?: string;
  /** 代码片段提示（import 或用法示例） */
  readonly codeHint?: string;
}

/** 推断结果 */
export interface SmartInferenceResult {
  /** 实际生效的开关 */
  readonly enabled: Required<SmartInferenceSwitches>;
  /** 建议列表（按树先序） */
  readonly suggestions: readonly SmartSuggestion[];
  /** 各类别建议计数 */
  readonly counts: Readonly<Record<SmartInferenceCategory, number>>;
}

/** 全开关缺省开启 */
const ALL_ENABLED: Required<SmartInferenceSwitches> = { grid: true, icons: true, darkMode: true, motion: true };

/** 图标关键词 → Lucide 组件名（键为小写子串，按特异性排序） */
const LUCIDE_KEYWORDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/shopping[- ]?cart|add[- ]?cart|购物车|加购/, 'ShoppingCart'],
  [/chevron[- ]?down|caret[- ]?down|展开|下拉箭头/, 'ChevronDown'],
  [/chevron[- ]?right|折叠箭头/, 'ChevronRight'],
  [/arrow[- ]?left|返回|左箭头/, 'ArrowLeft'],
  [/arrow[- ]?right|右箭头/, 'ArrowRight'],
  [/arrow[- ]?up|上箭头/, 'ArrowUp'],
  [/arrow[- ]?down|下箭头/, 'ArrowDown'],
  [/search|放大镜|搜索/, 'Search'],
  [/close|关闭|叉号/, 'X'],
  [/menu|汉堡|菜单图标/, 'Menu'],
  [/home|首页|主页/, 'Home'],
  [/settings|gear|设置|齿轮/, 'Settings'],
  [/bell|notification|通知|铃铛/, 'Bell'],
  [/user|account|我的|个人中心/, 'User'],
  [/pencil|edit|编辑/, 'Pencil'],
  [/trash|delete|删除|垃圾桶/, 'Trash2'],
  [/check|done|对勾|勾选/, 'Check'],
  [/plus|add|加号|新增/, 'Plus'],
  [/star|favorite|收藏|星级/, 'Star'],
  [/heart|like|点赞|喜欢/, 'Heart'],
];

/** 通用图标语义（无具体 Lucide 映射时触发通用建议） */
const GENERIC_ICON_PATTERN = /icon|svg|图标|矢量/;

/** 名称含深色语义 */
const DARK_NAME_PATTERN = /dark|night|midnight|暗黑|深色|夜间|暗夜/i;
/** 名称含浅色语义（成对出现时提示双主题） */
const LIGHT_NAME_PATTERN = /light|day|明亮|浅色|日间|白天/i;
/** 深色填充相关命名（颜色兜底时要求命名佐证，避免误报） */
const SURFACE_NAME_PATTERN = /bg|background|surface|card|背景|卡片|面板|弹层/i;

/** hover 状态语义 */
const HOVER_PATTERN = /hover|mouse[- ]?over|悬停/i;
/** active/pressed 状态语义 */
const PRESSED_PATTERN = /pressed|active[- ]?state|按下|点击态/i;
/** 循环/加载动效语义 */
const SPIN_PATTERN = /spin|spinner|loading[- ]?spinner|加载中|旋转/i;
/** 通用动效语义 */
const ANIMATE_PATTERN = /animate|animation|transition|pulse|动画|动效|轮播|播放/i;

/** Tailwind 间距刻度（px → 类名） */
const SPACING_SCALE: readonly number[] = [0, 1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48];

/**
 * 取最近的 Tailwind 间距类
 *
 * @param px - 像素间距
 * @returns 形如 gap-4 / gap-x-6 的刻度值（不含前缀）
 */
function nearestSpacing(px: number): number {
  let best = SPACING_SCALE[0] ?? 0;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const value of SPACING_SCALE) {
    const delta = Math.abs(value * 4 - px);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = value;
    }
  }
  return best;
}

/**
 * 计算相对亮度（0-1，Rec. 603）
 *
 * @param color - r/g/b 0-1
 * @returns 亮度
 */
function luminance(color: { r: number; g: number; b: number }): number {
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

/**
 * 取节点首个不透明实色填充
 *
 * @param node - 节点
 * @returns 颜色（含亮度）或 undefined
 */
function firstSolidFill(node: ProcessedNode): { r: number; g: number; b: number } | undefined {
  const solid = node.fills?.find((fill) => fill.type === 'solid' && fill.opacity !== 0);
  if (!solid || solid.type !== 'solid') return undefined;
  return { r: solid.color.r, g: solid.color.g, b: solid.color.b };
}

/** 推断入参 */
export interface SmartInferrerOptions {
  /** 目标框架（图标包建议按框架区分） */
  framework: Framework;
  /** 分项开关（缺省全开） */
  switches?: SmartInferenceSwitches;
}

/**
 * 智能推断器（纯树分析，不触网不改写节点）。
 * 通过工厂 {@link createSmartInferrer} 创建。
 */
export class SmartInferrer {
  /**
   * 执行四类推断
   *
   * @param root - 组件根节点
   * @param options - 框架与开关
   * @returns 建议集合与计数
   */
  infer(root: ProcessedNode, options: SmartInferrerOptions): SmartInferenceResult {
    const enabled: Required<SmartInferenceSwitches> = { ...ALL_ENABLED, ...(options.switches ?? {}) };
    const suggestions: SmartSuggestion[] = [];

    const visit = (node: ProcessedNode, parent: ProcessedNode | null): void => {
      if (enabled.grid) this._inferLayout(node, parent, suggestions);
      if (enabled.icons) this._inferIcon(node, options.framework, suggestions);
      if (enabled.darkMode) this._inferDarkMode(node, suggestions);
      if (enabled.motion) this._inferMotion(node, suggestions);
      for (const child of node.children ?? []) visit(child, node);
    };
    visit(root, null);

    const counts: Record<SmartInferenceCategory, number> = { grid: 0, icon: 0, 'dark-mode': 0, motion: 0 };
    for (const suggestion of suggestions) counts[suggestion.category] += 1;

    return { enabled, suggestions, counts };
  }

  /**
   * 布局推断：Grid 矩阵 + sticky/fixed/absolute 参照物
   *
   * @param node - 当前节点
   * @param parent - 父节点（absolute 参照物候选）
   * @param out - 建议输出数组
   */
  private _inferLayout(node: ProcessedNode, parent: ProcessedNode | null, out: SmartSuggestion[]): void {
    const name = node.name || '';
    const children = (node.children ?? []).filter((child) => child.visible !== false);

    // 1a. Auto Layout 换行容器（≥3 子节点）→ 用首行 x 坐标数估列数
    if (node.layout?.layoutWrap === 'WRAP' && children.length >= 3) {
      const positions = children
        .map((child) => child.position)
        .filter((position): position is { x: number; y: number } => Boolean(position));
      if (positions.length >= 3) {
        const minY = Math.min(...positions.map((position) => position.y));
        const firstRowXs = new Set(
          positions.filter((position) => Math.abs(position.y - minY) <= 2).map((position) => Math.round(position.x)),
        );
        const cols = firstRowXs.size;
        if (cols >= 2) {
          const gap = nearestSpacing(node.layout.itemSpacing ?? node.layout.counterAxisSpacing ?? 8);
          out.push({
            category: 'grid',
            nodeId: node.figmaId,
            nodeName: name,
            message: `Wrapping auto-layout with ${children.length} items reads as a ${cols}-column responsive grid (flex-wrap fallback also valid).`,
            utilityClass: `grid grid-cols-${cols} gap-${gap}`,
          });
        }
      }
    }

    // 1b. 自由排版容器（无 Auto Layout）且子节点行列规整、尺寸一致 → CSS Grid
    if (!node.layout && children.length >= 4) {
      const positioned = children
        .map((child) => ({ child, position: child.position, size: child.size }))
        .filter(
          (entry): entry is { child: ProcessedNode; position: { x: number; y: number }; size: { width: number; height: number } } =>
            Boolean(entry.position) && Boolean(entry.size),
        );
      if (positioned.length === children.length) {
        const xs = Array.from(new Set(positioned.map((entry) => Math.round(entry.position.x)))).sort((a, b) => a - b);
        const ys = Array.from(new Set(positioned.map((entry) => Math.round(entry.position.y)))).sort((a, b) => a - b);
        const cols = xs.length;
        const rows = ys.length;
        const sameWidth = positioned.every((entry) => Math.abs(entry.size.width - positioned[0]!.size.width) <= 4);
        const sameHeight = positioned.every((entry) => Math.abs(entry.size.height - positioned[0]!.size.height) <= 4);
        if (cols >= 2 && cols <= 6 && rows >= 2 && sameWidth && sameHeight) {
          const gapXs = xs.slice(1).map((x, index) => x - xs[index]! - positioned[0]!.size.width);
          const gapYs = ys.slice(1).map((y, index) => y - ys[index]! - positioned[0]!.size.height);
          const gapX = nearestSpacing(gapXs[0] ?? 8);
          const gapY = nearestSpacing(gapYs[0] ?? 8);
          out.push({
            category: 'grid',
            nodeId: node.figmaId,
            nodeName: name,
            message: `Free-positioned ${cols}×${rows} matrix of uniform items maps to CSS Grid; make the parent the positioning context.`,
            utilityClass: `grid grid-cols-${cols} gap-x-${gapX} gap-y-${gapY}`,
          });
        }
      }
    }

    // 2a. sticky 吸顶（先于 fixed 判定）
    if (/sticky|吸顶/i.test(name)) {
      out.push({
        category: 'grid',
        nodeId: node.figmaId,
        nodeName: name,
        message: 'Node name indicates a pinned bar; use sticky positioning so it stays in flow when unpinned.',
        utilityClass: 'sticky top-0 z-50',
      });
    } else if (/\bfixed\b|floating[- ]?action|fab\b|悬浮按钮|浮动按钮|回到顶部|back[- ]?to[- ]?top/i.test(name)) {
      // 2b. fixed 悬浮按钮/回到顶部
      out.push({
        category: 'grid',
        nodeId: node.figmaId,
        nodeName: name,
        message: 'Overlay/FA semantics detected; fix to the viewport and choose an inset placement.',
        utilityClass: 'fixed z-50',
      });
    }

    // 2c. absolute：原始定位字段或自由排版父级中的角标/浮层语义 → 指出参照物
    const rawPositioning = (node as { layoutPositioning?: unknown }).layoutPositioning;
    const positionedAbsolute = rawPositioning === 'ABSOLUTE';
    const overlayName = /badge|corner|角标|角贴|浮层|装饰|decoration|ribbon|tag/i.test(name);
    if (positionedAbsolute || (overlayName && parent && !parent.layout)) {
      const parentLabel = parent?.name || parent?.figmaId || 'the nearest positioned ancestor';
      out.push({
        category: 'grid',
        nodeId: node.figmaId,
        nodeName: name,
        message: `Position relative to "${parentLabel}": mark that parent relative and place this node with absolute offsets.`,
        utilityClass: 'absolute',
      });
    }
  }

  /**
   * 图标识别：尺寸 + 语义命名/矢量类型 → Lucide/Iconify/内联 SVG 建议
   *
   * @param node - 当前节点
   * @param framework - 目标框架
   * @param out - 建议输出数组
   */
  private _inferIcon(node: ProcessedNode, framework: Framework, out: SmartSuggestion[]): void {
    const width = node.size?.width;
    const height = node.size?.height;
    if (width === undefined || height === undefined) return;
    if (width <= 0 || height <= 0 || width > 48 || height > 48) return;
    // 含文本后代的小节点通常是徽标/按钮而非纯图标
    if (this._hasTextDescendant(node)) return;

    const name = node.name || '';
    const lower = name.toLowerCase();
    const isVectorLike =
      node.originalType === 'VECTOR' ||
      node.originalType === 'STAR' ||
      node.originalType === 'LINE' ||
      node.originalType === 'BOOLEAN_OPERATION';
    const matched = LUCIDE_KEYWORDS.find(([pattern]) => pattern.test(lower));
    const generic = GENERIC_ICON_PATTERN.test(lower);

    if (!matched && !generic && !isVectorLike) return;

    const lucideName = matched?.[1];
    if (lucideName) {
      const pkg = framework === 'vue' ? 'lucide-vue-next' : 'lucide-react';
      const usage =
        framework === 'vue'
          ? `import { ${lucideName} } from '${pkg}'; // <${lucideName} class="w-6 h-6" />`
          : `import { ${lucideName} } from '${pkg}'; // <${lucideName} className="w-6 h-6" />`;
      out.push({
        category: 'icon',
        nodeId: node.figmaId,
        nodeName: name,
        message: `Small semantic node matches Lucide "${lucideName}"; prefer the icon component over an exported bitmap.`,
        utilityClass: 'w-6 h-6 text-current',
        codeHint: usage,
      });
    } else {
      out.push({
        category: 'icon',
        nodeId: node.figmaId,
        nodeName: name,
        message:
          'Small icon-sized node without a standard-icon name match; use an Iconify token or export/inline SVG, and name it semantically.',
        codeHint: "Iconify: i-lucide-box / or inline <svg> with aria-hidden=\"true\"",
      });
    }
  }

  /**
   * 深色模式策略推断
   *
   * @param node - 当前节点
   * @param out - 建议输出数组
   */
  private _inferDarkMode(node: ProcessedNode, out: SmartSuggestion[]): void {
    const name = node.name || '';
    if (DARK_NAME_PATTERN.test(name)) {
      out.push({
        category: 'dark-mode',
        nodeId: node.figmaId,
        nodeName: name,
        message:
          'Dark-variant naming detected: author light classes first and add dark: overrides (or a .dark theme token set) instead of a separate component.',
        utilityClass: 'dark:',
      });
      return;
    }
    if (LIGHT_NAME_PATTERN.test(name)) {
      out.push({
        category: 'dark-mode',
        nodeId: node.figmaId,
        nodeName: name,
        message: 'Light-variant naming detected: pair it with a dark: counterpart from the design tokens.',
        utilityClass: 'dark:',
      });
    }
    // 近黑实色 + 表面类命名（无命名佐证不提示，压低误报）
    if (SURFACE_NAME_PATTERN.test(name)) {
      const fill = firstSolidFill(node);
      if (fill && luminance(fill) <= 0.1) {
        out.push({
          category: 'dark-mode',
          nodeId: node.figmaId,
          nodeName: name,
          message: 'Near-black solid surface fill; verify whether it is a dark-theme surface and express it via dark: tokens.',
          utilityClass: 'dark:bg-neutral-900',
        });
      }
    }
  }

  /**
   * 交互动效建议（transition/hover/持续时间）
   *
   * @param node - 当前节点
   * @param out - 建议输出数组
   */
  private _inferMotion(node: ProcessedNode, out: SmartSuggestion[]): void {
    const name = node.name || '';
    if (HOVER_PATTERN.test(name)) {
      out.push({
        category: 'motion',
        nodeId: node.figmaId,
        nodeName: name,
        message: 'Hover-state artboard/layer detected: implement one component with a hover: variant, not a duplicate node.',
        utilityClass: 'transition-colors duration-200 hover:',
      });
    } else if (PRESSED_PATTERN.test(name)) {
      out.push({
        category: 'motion',
        nodeId: node.figmaId,
        nodeName: name,
        message: 'Pressed-state layer detected: express it via the active: variant with a short duration.',
        utilityClass: 'transition-colors duration-150 active:',
      });
    } else if (SPIN_PATTERN.test(name)) {
      out.push({
        category: 'motion',
        nodeId: node.figmaId,
        nodeName: name,
        message: 'Loading spinner semantics detected; use a CSS animation instead of frame-by-frame assets.',
        utilityClass: 'animate-spin',
      });
    } else if (ANIMATE_PATTERN.test(name)) {
      out.push({
        category: 'motion',
        nodeId: node.figmaId,
        nodeName: name,
        message: 'Animated/transition layer detected: encode enter/exit and state changes with transition/animation utilities.',
        utilityClass: 'transition duration-200 ease-out',
      });
    }
  }

  /**
   * 是否存在文本类型后代（图标判定排除按钮/徽标）
   *
   * @param node - 起始节点
   * @returns 含文本后代为 true
   */
  private _hasTextDescendant(node: ProcessedNode): boolean {
    for (const child of node.children ?? []) {
      if (child.role === 'text' || child.originalType === 'TEXT') return true;
      if (this._hasTextDescendant(child)) return true;
    }
    return false;
  }
}

/**
 * 创建智能推断器
 *
 * @returns SmartInferrer 实例（无状态，可跨次复用）
 */
export function createSmartInferrer(): SmartInferrer {
  return new SmartInferrer();
}

/**
 * 将推断结果渲染为产物注释行（React // 与 Vue <script> 内 // 同形）
 *
 * @param result - 推断结果
 * @returns 注释行数组；无建议时返回空数组
 */
export function formatSmartInferenceComments(result: SmartInferenceResult): string[] {
  if (result.suggestions.length === 0) return [];
  const lines: string[] = ['// 🧠 Smart inference hints (v1.4.19, advisory only — verify before ship):'];
  for (const suggestion of result.suggestions.slice(0, 12)) {
    const tail = suggestion.utilityClass ? ` → ${suggestion.utilityClass}` : '';
    lines.push(`//   [${suggestion.category}] ${suggestion.nodeName}: ${suggestion.message}${tail}`);
    if (suggestion.codeHint) {
      lines.push(`//     ↳ ${suggestion.codeHint}`);
    }
  }
  if (result.suggestions.length > 12) {
    lines.push(`//   ...and ${result.suggestions.length - 12} more (see result.reports.smartInference)`);
  }
  return lines;
}
