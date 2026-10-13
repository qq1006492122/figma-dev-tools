/**
 * WBS-P2-31/32 响应式推断骨架 + safe-area 建议 单测
 *
 * 本期只输出「断点类名骨架」（mobile-first: md:/lg:；desktop-first: sm:），
 * 覆盖 列转行 / 字号 / 间距 / 栅格列数 四类模式；不臆造断点外内容，
 * 每个信号必须带 nodeId、来源属性与依据。safe-area 分 H5 / 小程序两形态。
 */
import { describe, expect, it } from 'vitest';
import {
  DESKTOP_FIRST_PREFIX,
  MOBILE_FIRST_PREFIX,
  buildResponsiveClasses,
  buildSafeAreaCssSnippet,
  buildSafeAreaWeappSnippet,
  inferResponsiveSignals,
  type ResponsiveFrame,
} from '../../src/services/responsive/responsive-inferrer.js';

describe('WBS-P2-31 断点契约', () => {
  it('冻结断点前缀：移动优先 md/lg，桌面优先 sm', () => {
    expect(MOBILE_FIRST_PREFIX).toBe('md');
    expect(DESKTOP_FIRST_PREFIX).toBe('sm');
  });
});

describe('WBS-P2-31 信号推断（mobile-first fixtures ≥3）', () => {
  it('fixture 1：宽幅横向导航（子项宽度之和超过手机内容宽）→ 列转行信号', () => {
    const frame: ResponsiveFrame = {
      width: 1440,
      nodes: [
        {
          id: 'nav',
          layoutMode: 'horizontal',
          x: 0,
          y: 0,
          width: 800,
          children: [
            { id: 'logo', width: 120 },
            { id: 'm1', width: 120 },
            { id: 'm2', width: 120 },
            { id: 'm3', width: 120 },
          ],
        },
      ],
    };
    const signals = inferResponsiveSignals(frame, { mode: 'mobile-first' });
    const dir = signals.find((s) => s.nodeId === 'nav' && s.type === 'layout-direction');
    expect(dir).toBeTruthy();
    expect(dir?.basis).toBe('mobile-first');
    expect(dir?.mobile).toContain('flex-col');
    expect(dir?.desktop).toContain('flex-row');
  });

  it('fixture 2：大字号标题（≥32px）→ 字号分级信号', () => {
    const frame: ResponsiveFrame = {
      width: 1440,
      nodes: [{ id: 'hero', type: 'text', fontSize: 48, width: 600 }],
    };
    const signals = inferResponsiveSignals(frame, { mode: 'mobile-first' });
    const fs = signals.find((s) => s.nodeId === 'hero' && s.type === 'font-size');
    expect(fs).toBeTruthy();
    expect(fs?.mobile).toMatch(/text-/);
    expect(fs?.desktop).toMatch(/^md:text-/);
  });

  it('fixture 3：等分卡片行 → 栅格列数信号（桌面列数=子项数，手机 1 列）', () => {
    const frame: ResponsiveFrame = {
      width: 1440,
      nodes: [
        {
          id: 'grid',
          layoutMode: 'horizontal',
          width: 1200,
          children: [
            { id: 'c1', width: 384 },
            { id: 'c2', width: 384 },
            { id: 'c3', width: 384 },
          ],
        },
      ],
    };
    const signals = inferResponsiveSignals(frame, { mode: 'mobile-first' });
    const grid = signals.find((s) => s.nodeId === 'grid' && s.type === 'grid-columns');
    expect(grid).toBeTruthy();
    expect(grid?.mobile).toContain('grid-cols-1');
    expect(grid?.desktop).toContain('md:grid-cols-3');
  });

  it('间距信号：大间距容器（≥24px）输出 base/桌面两级 gap', () => {
    const frame: ResponsiveFrame = {
      width: 1440,
      nodes: [{ id: 'row', layoutMode: 'horizontal', itemSpacing: 32, width: 800, children: [{ id: 'a' }, { id: 'b' }] }],
    };
    const signals = inferResponsiveSignals(frame, { mode: 'mobile-first' });
    const gap = signals.find((s) => s.nodeId === 'row' && s.type === 'spacing');
    expect(gap).toBeTruthy();
    expect(gap?.mobile).toMatch(/^gap-/);
    expect(gap?.desktop).toMatch(/^md:gap-/);
  });

  it('竖排且无大字号/无大间距的窄内容不产生信号（不臆造）', () => {
    const frame: ResponsiveFrame = {
      width: 375,
      nodes: [
        { id: 'stack', layoutMode: 'vertical', itemSpacing: 8, children: [{ id: 'x' }, { id: 'y' }] },
        { id: 't', type: 'text', fontSize: 14 },
      ],
    };
    expect(inferResponsiveSignals(frame, { mode: 'mobile-first' })).toEqual([]);
  });
});

describe('WBS-P2-31 desktop-first 模式（fixtures ≥3）', () => {
  it('fixture 1：横向导航输出 sm: 前缀（桌面 row → 窄屏 col）', () => {
    const frame: ResponsiveFrame = {
      width: 1280,
      nodes: [
        { id: 'nav', layoutMode: 'horizontal', width: 900, children: [{ id: 'a', width: 200 }, { id: 'b', width: 200 }, { id: 'c', width: 200 }] },
      ],
    };
    const signals = inferResponsiveSignals(frame, { mode: 'desktop-first' });
    const dir = signals.find((s) => s.nodeId === 'nav' && s.type === 'layout-direction');
    expect(dir?.basis).toBe('desktop-first');
    expect(dir?.desktop).toContain('flex-row');
    expect(dir?.mobile).toMatch(/^sm:.*flex-col/);
  });

  it('fixture 2：桌面大标题给 sm: 降级字号', () => {
    const frame: ResponsiveFrame = { width: 1280, nodes: [{ id: 'h', type: 'text', fontSize: 40 }] };
    const signals = inferResponsiveSignals(frame, { mode: 'desktop-first' });
    const fs = signals.find((s) => s.nodeId === 'h' && s.type === 'font-size');
    expect(fs?.desktop).toMatch(/^text-/);
    expect(fs?.mobile).toMatch(/^sm:text-/);
  });

  it('fixture 3：桌面 3 列卡片在窄屏降 1 列（sm:grid-cols-1）', () => {
    const frame: ResponsiveFrame = {
      width: 1280,
      nodes: [
        {
          id: 'g',
          layoutMode: 'horizontal',
          width: 1100,
          children: [{ id: '1', width: 350 }, { id: '2', width: 350 }, { id: '3', width: 350 }],
        },
      ],
    };
    const signals = inferResponsiveSignals(frame, { mode: 'desktop-first' });
    const grid = signals.find((s) => s.nodeId === 'g' && s.type === 'grid-columns');
    expect(grid?.desktop).toContain('grid-cols-3');
    expect(grid?.mobile).toContain('sm:grid-cols-1');
  });
});

describe('WBS-P2-31 类名骨架组装', () => {
  it('mobile-first：base 与 md 片段分离，便于直接拼到 class 属性', () => {
    const frame: ResponsiveFrame = {
      width: 1440,
      nodes: [
        {
          id: 'nav',
          layoutMode: 'horizontal',
          width: 900,
          children: [{ id: 'a', width: 200 }, { id: 'b', width: 200 }, { id: 'c', width: 200 }, { id: 'd', width: 200 }],
        },
      ],
    };
    const signals = inferResponsiveSignals(frame, { mode: 'mobile-first' });
    const classes = buildResponsiveClasses(signals);
    expect(classes.get('nav')?.base).toContain('flex-col');
    expect(classes.get('nav')?.breakpoint).toContain('md:flex-row');
  });

  it('同节点多信号合并、去重，按固定顺序排列（direction→columns→font→spacing）', () => {
    const frame: ResponsiveFrame = {
      width: 1440,
      nodes: [
        {
          id: 'mix',
          layoutMode: 'horizontal',
          itemSpacing: 32,
          width: 1200,
          children: [{ id: '1', width: 384 }, { id: '2', width: 384 }, { id: '3', width: 384 }],
        },
      ],
    };
    const signals = inferResponsiveSignals(frame, { mode: 'mobile-first' });
    const classes = buildResponsiveClasses(signals);
    const entry = classes.get('mix');
    expect(entry).toBeTruthy();
    const all = [...(entry?.base ?? []), ...(entry?.breakpoint ?? [])];
    expect(new Set(all).size).toBe(all.length);
    expect(entry?.breakpoint.join(' ')).toMatch(/grid-cols-3.*md:gap-4/);
  });
});

describe('WBS-P2-32 safe-area 两形态', () => {
  it('H5：输出 env(safe-area-inset-*) 声明（四方向）', () => {
    expect(buildSafeAreaCssSnippet('bottom')).toContain('env(safe-area-inset-bottom)');
    expect(buildSafeAreaCssSnippet('top')).toContain('env(safe-area-inset-top)');
    expect(buildSafeAreaCssSnippet('bottom')).toMatch(/padding|margin/);
    expect(() => buildSafeAreaCssSnippet('left' as never)).not.toThrow();
  });

  it('小程序：输出 wx.getSystemInfoSync safeArea 建议片段（JS + WXML 绑定说明）', () => {
    const snippet = buildSafeAreaWeappSnippet();
    expect(snippet.js).toContain('wx.getSystemInfoSync');
    expect(snippet.js).toContain('safeArea');
    expect(snippet.wxmlAdvice).toContain('style');
    // 不输出 H5 专用 env() 到小程序片段
    expect(snippet.js).not.toContain('env(safe-area-inset');
  });
});
