/**
 * design-width resolver 单元测试（WBS-P0-61）
 *
 * 契约：ROADMAP-v1.4.20-v2.md P0-1.6
 *  - ≈375 → 375（rpx≈px×2）；≈750 → 750（×1）；其他帧宽按 rpx=px×750/frameWidth
 *  - 参数可手动覆盖（manual 不做档位吸附）
 *  - 帧内子元素尺寸基准不一致时 warn
 */
import { describe, it, expect } from 'vitest';

import {
  resolveDesignWidth,
  pxToRpx,
  DESIGN_WIDTH_PRESETS,
  FRAME_WIDTH_TOLERANCE,
  type ResolveDesignWidthInput,
} from '../../src/services/weapp-design-width.js';

function input(over: Partial<ResolveDesignWidthInput> = {}): ResolveDesignWidthInput {
  return { frameWidth: 375, ...over };
}

describe('resolveDesignWidth — 帧宽推断', () => {
  it('帧宽 375（容差内 367/383）吸附到 375 预设档', () => {
    expect(resolveDesignWidth(input({ frameWidth: 375 }))).toMatchObject({
      designWidth: DESIGN_WIDTH_PRESETS.IPHONE_1X,
      source: 'frame-375',
    });
    expect(resolveDesignWidth(input({ frameWidth: 375 - FRAME_WIDTH_TOLERANCE })).source).toBe('frame-375');
    expect(resolveDesignWidth(input({ frameWidth: 375 + FRAME_WIDTH_TOLERANCE })).source).toBe('frame-375');
  });

  it('帧宽 750（容差内）吸附到 750 预设档', () => {
    expect(resolveDesignWidth(input({ frameWidth: 750 }))).toMatchObject({
      designWidth: DESIGN_WIDTH_PRESETS.RETINA_2X,
      source: 'frame-750',
    });
    expect(resolveDesignWidth(input({ frameWidth: 750 - FRAME_WIDTH_TOLERANCE })).source).toBe('frame-750');
    expect(resolveDesignWidth(input({ frameWidth: 750 + FRAME_WIDTH_TOLERANCE })).source).toBe('frame-750');
  });

  it('414 等非预设帧宽走通用档：designWidth=帧宽本身（精确换算）', () => {
    const r = resolveDesignWidth(input({ frameWidth: 414 }));
    expect(r).toMatchObject({ designWidth: 414, source: 'frame-generic' });
    // 390/360 不被错误吸附进 375（距 375 超过容差）
    expect(resolveDesignWidth(input({ frameWidth: 390 })).source).toBe('frame-generic');
    expect(resolveDesignWidth(input({ frameWidth: 360 })).source).toBe('frame-generic');
  });
});

describe('resolveDesignWidth — 手动覆盖', () => {
  it('manualOverride 优先于帧宽推断，且不做档位吸附', () => {
    // 375 的帧，用户显式指定 750（@2x 稿按 750 基准）
    const r = resolveDesignWidth(input({ frameWidth: 375, manualOverride: 750 }));
    expect(r).toMatchObject({ designWidth: 750, source: 'manual' });
    // 任意值原样采用（不吸附到 375/750）
    expect(resolveDesignWidth(input({ frameWidth: 414, manualOverride: 360 })).designWidth).toBe(360);
  });

  it('manualOverride 非正数被忽略（回退到帧宽推断，不产生 NaN）', () => {
    expect(resolveDesignWidth(input({ frameWidth: 750, manualOverride: 0 })).source).toBe('frame-750');
    expect(resolveDesignWidth(input({ frameWidth: 750, manualOverride: -10 })).source).toBe('frame-750');
  });
});

describe('pxToRpx — 换算公式', () => {
  it('750 基准 ×1、375 基准 ×2、414 基准按 750/414 比例（四舍五入）', () => {
    expect(pxToRpx(100, 750)).toBe(100);
    expect(pxToRpx(100, 375)).toBe(200);
    expect(pxToRpx(100, 414)).toBe(181); // 100*750/414 = 181.16
    expect(pxToRpx(375, 375)).toBe(750); // 整屏宽恒为 750rpx
    expect(pxToRpx(414, 414)).toBe(750);
  });
});

describe('resolveDesignWidth — 子元素基准一致性检查', () => {
  it('375 帧内出现大量比帧更宽的子元素（疑似 @2x 尺寸）→ warning', () => {
    // 帧 375，4 个子元素里 3 个宽度 ~600+（明显按 750 稿画）
    const r = resolveDesignWidth(
      input({ frameWidth: 375, childWidths: [620, 580, 640, 300] }),
    );
    expect(r.source).toBe('frame-375');
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].code).toBe('FDT-WEAPP-DW-CHILDREN-2X');
    expect(r.warnings[0].message).toContain('375');
  });

  it('750 帧内子元素普遍只有帧宽一半量级（疑似 @1x 尺寸）→ warning', () => {
    const r = resolveDesignWidth(
      input({ frameWidth: 750, childWidths: [360, 320, 400, 375, 700] }),
    );
    expect(r.source).toBe('frame-750');
    expect(r.warnings[0].code).toBe('FDT-WEAPP-DW-CHILDREN-1X');
  });

  it('正常 375 稿子元素均小于帧宽 → 无 warning；无样本也不 warn', () => {
    expect(resolveDesignWidth(input({ frameWidth: 375, childWidths: [343, 120, 80, 200] })).warnings).toEqual([]);
    expect(resolveDesignWidth(input({ frameWidth: 375 })).warnings).toEqual([]);
  });

  it('generic/manual 档不做启发式检查（避免对 414/自定义基准误报）', () => {
    expect(resolveDesignWidth(input({ frameWidth: 414, childWidths: [900, 900, 900] })).warnings).toEqual([]);
    expect(
      resolveDesignWidth(input({ frameWidth: 375, manualOverride: 750, childWidths: [620, 580, 640] })).warnings,
    ).toEqual([]);
  });
});
