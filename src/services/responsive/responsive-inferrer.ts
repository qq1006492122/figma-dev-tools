/**
 * 响应式推断骨架（WBS-P2-31）+ safe-area 建议（WBS-P2-32）
 *
 * v1.4.20 只产出「断点类名骨架」与安全区域代码建议，不直接改写任何生成器产物：
 * - 移动优先（默认）：基础样式即手机态，桌面态加 md: 前缀；
 * - 桌面优先：基础样式即桌面态，窄屏态加 sm: 前缀。
 * 四类模式：列转行(layout-direction)、字号(font-size)、间距(spacing)、栅格列数(grid-columns)。
 *
 * 保守原则：信号必须由明确布局属性触发（横向容器+超宽子项/大字号/大间距/等分行），
 * 竖排窄内容不产生任何信号；每条信号带 nodeId、来源依据(rationale)与两态类名，
 * 调用方（v1.5.0 起的生成器）决定是否把骨架写入 class——本模块不臆造断点外内容。
 *
 * @module services/responsive/responsive-inferrer
 */

/** 响应式模式：mobile-first=手机为基础态；desktop-first=桌面为基础态 */
export type ResponsiveMode = 'mobile-first' | 'desktop-first';

/** 四类响应式模式 */
export type ResponsivePatternType =
  | 'layout-direction'
  | 'font-size'
  | 'spacing'
  | 'grid-columns';

/** 移动优先断点前缀（桌面态 md:，更大屏可在 v1.5.0 扩展 lg:） */
export const MOBILE_FIRST_PREFIX = 'md';
/** 桌面优先断点前缀（窄屏态 sm:） */
export const DESKTOP_FIRST_PREFIX = 'sm';

/** 手机视口设计内容宽参考（375pt 基准，子项宽度之和超过它即认为横向布局装不下） */
const MOBILE_CONTENT_WIDTH = 375;
/** 触发字号分级的最小字号（px） */
const LARGE_FONT_PX = 32;
/** 触发间距分级的最小间距（px） */
const LARGE_GAP_PX = 24;
/** 栅格信号要求的最少等分子项数 */
const GRID_MIN_CHILDREN = 3;
/**
 * 栅格信号的单子项最小宽度（px）：横向导航菜单子项通常较窄（<280），
 * 卡片栅格的等分卡片在桌面帧下更宽；骨架用该阈值区分两类行。
 */
const GRID_CARD_MIN_WIDTH = 280;

/** 推断用的精简节点结构（字段全部可选，仅按显式存在的属性判定） */
export interface ResponsiveNode {
  readonly id: string;
  /** 节点类型（text 才参与字号推断） */
  readonly type?: 'text' | 'frame' | 'other';
  /** Figma 布局模式 */
  readonly layoutMode?: 'horizontal' | 'vertical';
  /** 横向布局子项间距（px） */
  readonly itemSpacing?: number;
  /** 节点宽（px） */
  readonly width?: number;
  /** 文本字号（px） */
  readonly fontSize?: number;
  /** 子节点 */
  readonly children?: readonly ResponsiveNode[];
}

/** 推断用的精简帧 */
export interface ResponsiveFrame {
  /** 帧宽（px） */
  readonly width: number;
  /** 帧内节点 */
  readonly nodes?: readonly ResponsiveNode[];
}

/** 推断选项 */
export interface InferResponsiveOptions {
  readonly mode: ResponsiveMode;
}

/** 单条响应式信号（两态类名 + 依据） */
export interface ResponsiveSignal {
  /** 命中的模式 */
  readonly type: ResponsivePatternType;
  /** 节点 id */
  readonly nodeId: string;
  /** 推断基准（与选项一致，便于消费方直接分组） */
  readonly basis: ResponsiveMode;
  /**
   * 基础态类名（mobile-first=手机；desktop-first=桌面）。
   * 可能是单个类或多个类（空格分隔）。
   */
  readonly mobile: string;
  /** 另一个形态的类名（带断点前缀） */
  readonly desktop: string;
  /** 触发依据（人类可读，供报告展示） */
  readonly rationale: string;
}

/** 信号类型的固定输出顺序（类名合并时稳定） */
const PATTERN_ORDER: readonly ResponsivePatternType[] = [
  'layout-direction',
  'grid-columns',
  'font-size',
  'spacing',
];

/** 汇总所有子节点宽度（缺宽度按 0 计） */
function sumChildrenWidth(node: ResponsiveNode): number {
  return (node.children ?? []).reduce((sum, child) => sum + (child.width ?? 0), 0);
}

/** 像素字号 → Tailwind 档位近似映射（骨架用，仅覆盖大字号分级区间） */
function fontSizeClass(px: number): string {
  if (px >= 60) return 'text-5xl';
  if (px >= 48) return 'text-4xl';
  if (px >= 36) return 'text-3xl';
  return 'text-2xl';
}

/** 大字号手机态降一档（仅骨架建议，不承诺精确还原） */
function downFontSizeClass(cls: string): string {
  const down: Record<string, string> = {
    'text-5xl': 'text-4xl',
    'text-4xl': 'text-3xl',
    'text-3xl': 'text-2xl',
    'text-2xl': 'text-xl',
  };
  return down[cls] ?? 'text-xl';
}

/** 间距像素 → gap 档位近似 */
function gapClass(px: number): string {
  if (px >= 48) return 'gap-6';
  if (px >= 24) return 'gap-4';
  return 'gap-3';
}

/** 间距档位顺序（手机态取桌面态的前一档） */
const GAP_ORDER = ['gap-3', 'gap-4', 'gap-6', 'gap-8'] as const;

/** 间距降一档（已是最小档则保持） */
function downGapClass(cls: string): string {
  const index = GAP_ORDER.indexOf(cls as (typeof GAP_ORDER)[number]);
  return index > 0 ? (GAP_ORDER[index - 1] ?? cls) : cls;
}

/**
 * 按模式构造一条信号（mobile 字段始终承载手机态类名，desktop 承载桌面态类名）。
 */
function makeSignal(
  type: ResponsivePatternType,
  nodeId: string,
  mode: ResponsiveMode,
  mobileClasses: string,
  desktopClasses: string,
  rationale: string,
): ResponsiveSignal {
  const prefix = mode === 'mobile-first' ? MOBILE_FIRST_PREFIX : DESKTOP_FIRST_PREFIX;
  if (mode === 'mobile-first') {
    return {
      type,
      nodeId,
      basis: mode,
      mobile: mobileClasses,
      desktop: desktopClasses
        .split(' ')
        .filter(Boolean)
        .map((c) => `${prefix}:${c}`)
        .join(' '),
      rationale,
    };
  }
  return {
    type,
    nodeId,
    basis: mode,
    mobile: mobileClasses
      .split(' ')
      .filter(Boolean)
      .map((c) => `${prefix}:${c}`)
      .join(' '),
    desktop: desktopClasses,
    rationale,
  };
}

/**
 * 从精简帧推断响应式信号（纯函数、无副作用）。
 *
 * @param frame - 帧布局数据
 * @param options - `{ mode: 'mobile-first' | 'desktop-first' }`
 * @returns 信号列表（按 PATTERN_ORDER 稳定排序）；无可信信号时为空数组
 */
export function inferResponsiveSignals(frame: ResponsiveFrame, options: InferResponsiveOptions): ResponsiveSignal[] {
  const mode = options.mode;
  const signals: ResponsiveSignal[] = [];

  const visit = (node: ResponsiveNode): void => {
    const children = node.children ?? [];

    if (node.layoutMode === 'horizontal' && children.length >= 2) {
      const childrenWidth = sumChildrenWidth(node);
      const isWideRow = childrenWidth > MOBILE_CONTENT_WIDTH;

      // 等分卡片行（≥3 个、子项都足够宽且总宽超手机内容宽）→ 栅格列数；
      // 窄子项的横向行视为导航/工具条 → 列转行
      const isCardRow = children.every((child) => (child.width ?? 0) >= GRID_CARD_MIN_WIDTH);
      const isGridLike = children.length >= GRID_MIN_CHILDREN && isWideRow && isCardRow;
      if (isGridLike) {
        signals.push(
          makeSignal(
            'grid-columns',
            node.id,
            mode,
            'grid grid-cols-1',
            `grid grid-cols-${children.length}`,
            `horizontal row of ${children.length} equal cards (children width ${childrenWidth}px > ${MOBILE_CONTENT_WIDTH})`,
          ),
        );
      } else if (isWideRow) {
        signals.push(
          makeSignal(
            'layout-direction',
            node.id,
            mode,
            'flex flex-col',
            'flex flex-row',
            `horizontal row children width ${childrenWidth}px exceeds mobile ${MOBILE_CONTENT_WIDTH}px`,
          ),
        );
      }

      if (typeof node.itemSpacing === 'number' && node.itemSpacing >= LARGE_GAP_PX) {
        const desktopGap = gapClass(node.itemSpacing);
        signals.push(
          makeSignal(
            'spacing',
            node.id,
            mode,
            downGapClass(desktopGap),
            desktopGap,
            `horizontal gap ${node.itemSpacing}px >= ${LARGE_GAP_PX}px`,
          ),
        );
      }
    }

    if (node.type === 'text' && typeof node.fontSize === 'number' && node.fontSize >= LARGE_FONT_PX) {
      const desktop = fontSizeClass(node.fontSize);
      const mobile = downFontSizeClass(desktop);
      signals.push(
        makeSignal(
          'font-size',
          node.id,
          mode,
          mobile,
          desktop,
          `large heading font-size ${node.fontSize}px >= ${LARGE_FONT_PX}px`,
        ),
      );
    }

    for (const child of children) visit(child);
  };

  for (const node of frame.nodes ?? []) visit(node);

  const rank = (s: ResponsiveSignal): number => PATTERN_ORDER.indexOf(s.type);
  return signals.sort((a, b) => rank(a) - rank(b) || a.nodeId.localeCompare(b.nodeId));
}

/** 每节点合并后的两态类名 */
export interface NodeResponsiveClasses {
  /** 基础态类名（去重、保序） */
  readonly base: string[];
  /** 断点态类名（带 sm:/md: 前缀，去重、保序） */
  readonly breakpoint: string[];
}

/**
 * 把信号按节点合并为 class 骨架。
 *
 * @param signals - inferResponsiveSignals 的输出
 * @returns nodeId → { base, breakpoint }；同节点类名去重，按模式类型固定顺序排列
 */
export function buildResponsiveClasses(signals: readonly ResponsiveSignal[]): Map<string, NodeResponsiveClasses> {
  const result = new Map<string, { base: string[]; breakpoint: string[] }>();
  const addUnique = (arr: string[], value: string): void => {
    for (const cls of value.split(' ').filter(Boolean)) {
      if (!arr.includes(cls)) arr.push(cls);
    }
  };

  for (const signal of signals) {
    let entry = result.get(signal.nodeId);
    if (!entry) {
      entry = { base: [], breakpoint: [] };
      result.set(signal.nodeId, entry);
    }
    addUnique(entry.base, signal.mobile);
    addUnique(entry.breakpoint, signal.desktop);
  }
  return result;
}

/** safe-area 四方向 */
export type SafeAreaEdge = 'top' | 'right' | 'bottom' | 'left';

/**
 * H5 安全区域 CSS 声明（env(safe-area-inset-*)）。
 *
 * @param edge - 方向
 * @returns 形如 `padding-bottom: env(safe-area-inset-bottom);` 的声明
 */
export function buildSafeAreaCssSnippet(edge: SafeAreaEdge): string {
  const property = edge === 'top' || edge === 'bottom' ? `padding-${edge}` : `padding-${edge}`;
  return `${property}: env(safe-area-inset-${edge});`;
}

/**
 * 小程序安全区域建议片段：wx.getSystemInfoSync 读取 safeArea，
 * 由页面 data 承载差值并通过内联 style 绑定（小程序 WXSS 不支持 env()）。
 */
export interface WeappSafeAreaSnippet {
  /** onLoad 中读取并计算安全区差值的 JS 代码 */
  readonly js: string;
  /** WXML 绑定方式说明/示例 */
  readonly wxmlAdvice: string;
}

/**
 * 生成小程序 safe-area 建议（JS + WXML 绑定说明）。
 */
export function buildSafeAreaWeappSnippet(): WeappSafeAreaSnippet {
  const js = [
    '// 小程序安全区域（WXSS 不支持 env()，用 wx.getSystemInfoSync 取差值）',
    'onLoad() {',
    '  const { screenHeight, safeArea } = wx.getSystemInfoSync();',
    "  this.setData({ safeBottom: screenHeight - safeArea.bottom });",
    '}',
  ].join('\n');
  const wxmlAdvice =
    '在需要避让的容器上绑定内联样式，如 <view style="padding-bottom: {{safeBottom}}px">';
  return { js, wxmlAdvice };
}
