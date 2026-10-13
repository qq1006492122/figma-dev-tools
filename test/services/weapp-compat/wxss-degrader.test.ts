/**
 * WXSS 降级器测试（WBS-P0-41）
 *
 * 每条降级规则必须有正（触发）反（放行）两例；规则事实只来源于
 * wxss-matrix 官方备注，不得自创限制。默认目标 Skyline。
 */
import { describe, it, expect } from 'vitest';

import {
  degradeDeclaration,
  degradeStylesheet,
  checkSelector,
} from '../../../src/services/weapp-compat/wxss-degrader.js';
import { WXSS_MATRIX, listWxssEntriesBySupport } from '../../../src/services/weapp-compat/wxss-matrix.js';

const sky = (property: string, value: string, tag?: string) =>
  degradeDeclaration({ property, value }, { target: 'skyline', tag });

describe('P0-41 矩阵数据完整性', () => {
  it('官方「属性支持」表 109 个属性全部转录（≥80 验收线）', () => {
    expect(WXSS_MATRIX.size).toBe(109);
    expect(WXSS_MATRIX.size).toBeGreaterThanOrEqual(80);
  });

  it('每条记录都有官方来源 URL 且无空 property', () => {
    for (const e of WXSS_MATRIX.values()) {
      expect(e.source).toContain('skyline/wxss.html');
      expect(e.property).not.toBe('');
    }
  });

  it('partial 条目全部带官方限制备注（降级规则的事实来源）', () => {
    const partial = listWxssEntriesBySupport('partial');
    expect(partial.length).toBeGreaterThan(0);
    for (const e of partial) expect(e.note).not.toBe('');
  });
});

describe('P0-41 降级规则（每条正反两例）', () => {
  it('overflow: scroll 不支持（→scroll-view）；hidden/visible 放行', () => {
    const bad = sky('overflow', 'scroll');
    expect(bad.status).toBe('unsupported');
    expect(bad.output).toHaveLength(0);
    expect(bad.warnings[0]!.code).toBe('FDT-WXSS-OVERFLOW-SCROLL');
    expect(sky('overflow', 'hidden').status).toBe('supported');
    expect(sky('overflow', 'visible').status).toBe('supported');
  });

  it('overflow-x/y 单独设置不支持（正反）', () => {
    expect(sky('overflow-x', 'scroll').status).toBe('unsupported');
    expect(sky('overflow-x', 'hidden').status).toBe('unsupported');
    // 通用 overflow 受支持已由上例覆盖
    expect(sky('overflow', 'hidden').status).toBe('supported');
  });

  it('position: sticky 不支持（→sticky-header）；relative/absolute 放行', () => {
    const sticky = sky('position', 'sticky');
    expect(sticky.status).toBe('unsupported');
    expect(sticky.warnings[0]!.message).toContain('sticky-header');
    expect(sky('position', 'relative').status).toBe('supported');
    expect(sky('position', 'absolute').status).toBe('supported');
  });

  it('background-image 多图降级为首张；单图放行', () => {
    const multi = sky('background-image', 'url(a.png), url(b.png)');
    expect(multi.status).toBe('degraded');
    expect(multi.output).toEqual([{ property: 'background-image', value: 'url(a.png)' }]);
    expect(multi.warnings[0]!.code).toBe('FDT-WXSS-BG-MULTI');
    expect(sky('background-image', 'url(a.png)').status).toBe('supported');
  });

  it('box-shadow 多叠加降级为首个；单个放行', () => {
    const multi = sky('box-shadow', '0 1rpx 2rpx red, 0 2rpx 4rpx blue');
    expect(multi.status).toBe('degraded');
    expect(multi.output[0]!.value).toBe('0 1rpx 2rpx red');
    expect(sky('box-shadow', '0 1rpx 2rpx red').status).toBe('supported');
    expect(sky('box-shadow', 'none').status).toBe('supported');
  });

  it('filter 多函数/drop-shadow/url 不支持；单函数放行', () => {
    expect(sky('filter', 'blur(2rpx) brightness(1.2)').status).toBe('unsupported');
    expect(sky('filter', 'drop-shadow(0 0 4rpx red)').status).toBe('unsupported');
    expect(sky('filter', 'url(#x)').status).toBe('unsupported');
    expect(sky('filter', 'blur(4rpx)').status).toBe('supported');
    expect(sky('filter', 'none').status).toBe('supported');
  });

  it('backdrop-filter 多函数不支持；单 blur 放行（partial 但格式合法）', () => {
    expect(sky('backdrop-filter', 'blur(4rpx) brightness(1.1)').status).toBe('unsupported');
    expect(sky('backdrop-filter', 'blur(8rpx)').status).toBe('supported');
  });

  it('mask-image 多图降级首张；单图放行', () => {
    const multi = sky('mask-image', 'url(a.png), url(b.png)');
    expect(multi.status).toBe('degraded');
    expect(multi.output[0]!.value).toBe('url(a.png)');
    expect(sky('mask-image', 'url(a.png)').status).toBe('supported');
  });

  it('font-size 百分比/keyword 不支持；长度放行', () => {
    expect(sky('font-size', '120%').status).toBe('unsupported');
    expect(sky('font-size', 'smaller').status).toBe('unsupported');
    expect(sky('font-size', '32rpx').status).toBe('supported');
  });

  it('text-overflow ellipsis 仅 text 节点：text 放行、view 不支持', () => {
    expect(sky('text-overflow', 'ellipsis', 'text').status).toBe('supported');
    const onView = sky('text-overflow', 'ellipsis', 'view');
    expect(onView.status).toBe('unsupported');
    expect(onView.warnings[0]!.code).toBe('FDT-WXSS-TEXT-ONLY');
  });

  it('text-decoration-line 仅 text 节点（正反）', () => {
    expect(sky('text-decoration-line', 'underline', 'text').status).toBe('supported');
    expect(sky('text-decoration-line', 'underline', 'view').status).toBe('unsupported');
  });

  it('animation-fill-mode none/backwards 降级 forwards；forwards/both 放行', () => {
    for (const v of ['none', 'backwards']) {
      const r = sky('animation-fill-mode', v);
      expect(r.status).toBe('degraded');
      expect(r.output).toEqual([{ property: 'animation-fill-mode', value: 'forwards' }]);
    }
    expect(sky('animation-fill-mode', 'forwards').status).toBe('supported');
    expect(sky('animation-fill-mode', 'both').status).toBe('supported');
  });

  it('display inline/inline-block 部分支持（保留值+warning）；flex/block 放行', () => {
    const ib = sky('display', 'inline-block');
    expect(ib.status).toBe('degraded');
    expect(ib.output).toEqual([{ property: 'display', value: 'inline-block' }]);
    expect(ib.warnings[0]!.code).toBe('FDT-WXSS-DISPLAY-INLINE');
    expect(sky('display', 'flex').status).toBe('supported');
    expect(sky('display', 'block').status).toBe('supported');
  });

  it('简写属性标记 shorthand 但不丢样式（官方支持解析）', () => {
    for (const p of ['background', 'border', 'flex', 'transition', 'font', 'animation', 'border-radius']) {
      const r = sky(p, 'initial');
      expect(r.status).toBe('shorthand');
      expect(r.output).toEqual([{ property: p, value: 'initial' }]);
    }
  });

  it('官方表外属性（如 grid-template-columns）→ unknown：保留值且警告，不假装支持', () => {
    const r = sky('grid-template-columns', '1fr 1fr');
    expect(r.status).toBe('unknown');
    expect(r.output).toEqual([{ property: 'grid-template-columns', value: '1fr 1fr' }]);
    expect(r.warnings[0]!.code).toBe('FDT-WXSS-PROPERTY-UNKNOWN');
  });

  it('WebView 目标不做属性级拦截（overflow:scroll 等仍 supported）', () => {
    expect(degradeDeclaration({ property: 'overflow', value: 'scroll' }, { target: 'webview' }).status).toBe('supported');
    expect(degradeDeclaration({ property: 'position', value: 'sticky' }, { target: 'webview' }).status).toBe('supported');
  });
});

describe('P0-41 样式表聚合报告（可追溯原属性→结果）', () => {
  it('degradeStylesheet：outputs 只含可写回声明，warnings 带原始属性与处置', () => {
    const report = degradeStylesheet(
      [
        { property: 'color', value: 'red' },
        { property: 'overflow', value: 'scroll' },
        { property: 'box-shadow', value: '0 1rpx red, 0 2rpx blue' },
      ],
      { target: 'skyline' },
    );
    const props = report.outputs.map((o) => o.property);
    expect(props).toContain('color');
    expect(props).not.toContain('overflow'); // 不支持 → 丢弃
    expect(props).toContain('box-shadow'); // 降级 → 保留改写值
    expect(report.warnings).toHaveLength(2);
    const overflowWarn = report.warnings.find((w) => w.property === 'overflow')!;
    expect(overflowWarn.originalValue).toBe('scroll');
    expect(overflowWarn.action).toBe('unsupported');
  });
});

describe('P0-41 选择器限制', () => {
  it('属性选择器拦截（正反）', () => {
    expect(checkSelector('.card[data-id]').ok).toBe(false);
    expect(checkSelector('.card[data-id]').warnings[0]!.code).toBe('FDT-WXSS-SELECTOR-ATTR');
    expect(checkSelector('.card').ok).toBe(true);
  });

  it('带参伪类拦截、无参伪类放行', () => {
    expect(checkSelector('.item:nth-child(2)').ok).toBe(false);
    expect(checkSelector('.item:nth-child(2)').warnings[0]!.code).toBe('FDT-WXSS-SELECTOR-PSEUDO-ARGS');
    expect(checkSelector('.item:active').ok).toBe(true);
  });
});
