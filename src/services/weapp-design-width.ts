/**
 * 小程序 designWidth 推断与 rpx 换算（WBS-P0-61）
 *
 * 纯函数层（零 I/O）。契约见 ROADMAP-v1.4.20-v2.md P0-1.6：
 *   ≈375 → 375（rpx≈px×2）；≈750 → 750（×1）；其他帧宽 designWidth=帧宽，
 *   统一公式 rpx = px × 750 / designWidth；用户可手动覆盖；子元素基准疑似
 *   混用 @1x/@2x 时给 warning（不阻断）。
 *
 * @module
 */

/** 帧宽预设档（绝对宽度，单位 px） */
export const DESIGN_WIDTH_PRESETS = {
  /** iPhone 逻辑宽 @1x 稿 */
  IPHONE_1X: 375,
  /** @2x 视网膜稿 */
  RETINA_2X: 750,
} as const;

/** 预设档吸附容差：覆盖 374.x 浮点、1px 边框等噪声；390/360 不会误吸附 */
export const FRAME_WIDTH_TOLERANCE = 8;

/** @1x 帧中疑似按 @2x 绘制：子元素比帧宽还宽的样本占比阈值 */
const CHILDREN_2X_RATIO = 0.4;
/** @2x 帧中疑似按 @1x 绘制：子元素宽度不足帧宽 55%（约 <412@750）的占比阈值 */
const CHILDREN_1X_RATIO = 0.6;
const CHILDREN_1X_MAX_FACTOR = 0.55;
/** 启发式最少命中个数，避免 1-2 个离群值触发 */
const CHILDREN_MIN_HITS = 2;

export type DesignWidthSource = 'manual' | 'frame-375' | 'frame-750' | 'frame-generic';

export interface DesignWidthWarning {
  code: 'FDT-WEAPP-DW-CHILDREN-2X' | 'FDT-WEAPP-DW-CHILDREN-1X';
  message: string;
}

export interface ResolveDesignWidthInput {
  /** 目标帧绝对宽度（Figma 根节点 size.width） */
  frameWidth: number;
  /** 用户显式指定（CLI --design-width / MCP designWidth）；正整数才生效 */
  manualOverride?: number;
  /** 帧内直接子元素宽度样本（用于基准一致性检查） */
  childWidths?: number[];
}

export interface ResolveDesignWidthResult {
  designWidth: number;
  source: DesignWidthSource;
  warnings: DesignWidthWarning[];
}

/**
 * 推断小程序 designWidth。
 * 手动覆盖优先且不吸附预设档；否则按帧宽就近吸附 375/750，落档外走通用档。
 */
export function resolveDesignWidth(input: ResolveDesignWidthInput): ResolveDesignWidthResult {
  const warnings: DesignWidthWarning[] = [];

  if (typeof input.manualOverride === 'number' && Number.isFinite(input.manualOverride) && input.manualOverride > 0) {
    return { designWidth: Math.round(input.manualOverride), source: 'manual', warnings };
  }

  const fw = input.frameWidth;
  let designWidth: number;
  let source: DesignWidthSource;
  if (Math.abs(fw - DESIGN_WIDTH_PRESETS.IPHONE_1X) <= FRAME_WIDTH_TOLERANCE) {
    designWidth = DESIGN_WIDTH_PRESETS.IPHONE_1X;
    source = 'frame-375';
  } else if (Math.abs(fw - DESIGN_WIDTH_PRESETS.RETINA_2X) <= FRAME_WIDTH_TOLERANCE) {
    designWidth = DESIGN_WIDTH_PRESETS.RETINA_2X;
    source = 'frame-750';
  } else {
    designWidth = fw;
    source = 'frame-generic';
  }

  // 基准一致性仅对两档标准稿做启发式；generic/manual 不臆断
  const sample = (input.childWidths ?? []).filter((w) => Number.isFinite(w) && w > 0);
  if (source === 'frame-375' && sample.length >= CHILDREN_MIN_HITS) {
    const hits = sample.filter((w) => w > fw).length;
    if (hits / sample.length >= CHILDREN_2X_RATIO && hits >= CHILDREN_MIN_HITS) {
      warnings.push({
        code: 'FDT-WEAPP-DW-CHILDREN-2X',
        message:
          `帧宽按 ${fw}px（@1x 逻辑稿，designWidth=375）推断，但 ${hits}/${sample.length} 个子元素比帧更宽，` +
          '疑似子元素按 @2x（750 基准）绘制：请核对设计稿倍率，或用 --design-width 手动指定。',
      });
    }
  } else if (source === 'frame-750' && sample.length >= CHILDREN_MIN_HITS) {
    const hits = sample.filter((w) => w < fw * CHILDREN_1X_MAX_FACTOR).length;
    if (hits / sample.length >= CHILDREN_1X_RATIO && hits >= CHILDREN_MIN_HITS) {
      warnings.push({
        code: 'FDT-WEAPP-DW-CHILDREN-1X',
        message:
          `帧宽按 ${fw}px（@2x 稿，designWidth=750）推断，但 ${hits}/${sample.length} 个子元素宽度不足帧宽的一半，` +
          '疑似子元素按 @1x（375 基准）绘制：请核对设计稿倍率，或用 --design-width 手动指定。',
      });
    }
  }

  return { designWidth, source, warnings };
}

/**
 * px → rpx：750rpx = designWidth 屏宽。四舍五入到整数 rpx。
 */
export function pxToRpx(px: number, designWidth: number): number {
  if (!(designWidth > 0)) return Math.round(px);
  return Math.round((px / designWidth) * 750);
}
