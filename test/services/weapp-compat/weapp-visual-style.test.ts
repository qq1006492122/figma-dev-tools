/**
 * 节点视觉属性 → WXSS 声明映射（WBS-P0-81 方案 B 的单一事实来源）
 *
 * 生成器用它把 Figma 视觉字段直接落成 WXSS（小程序无 Tailwind 运行时，
 * tailwind class 名不产生真实样式）；fidelity 覆盖率用同一份清单计算分母，
 * 保证"承诺可还原"与"实际产出"口径一致、可复现。
 */
import { describe, it, expect } from 'vitest';
import type { ProcessedNode } from '../../../src/types/nodes.js';
import { collectVisualDeclarations, pxToRpxValue } from '../../../src/services/weapp-compat/weapp-visual-style.js';

function node(partial: Partial<ProcessedNode>): ProcessedNode {
  return {
    id: 'n', figmaId: 'n:1', name: 'N', originalType: 'FRAME', role: 'container',
    visible: true, size: { width: 0, height: 0 }, children: [],
    ...partial,
  } as ProcessedNode;
}

describe('P0-81 px→rpx', () => {
  it('375 设计宽基准 750 时 1px=2rpx；750 帧 1px=1rpx', () => {
    expect(pxToRpxValue(100, 750, 375)).toBe(200);
    expect(pxToRpxValue(100, 750, 750)).toBe(100);
  });
});

describe('P0-81 视觉字段 → WXSS 声明', () => {
  it('尺寸 → width/height（rpx）', () => {
    const d = collectVisualDeclarations(node({ size: { width: 100, height: 50 } }), 750, 375);
    expect(d.width).toBe('200rpx');
    expect(d.height).toBe('100rpx');
  });

  it('自动布局 → display:flex + direction + 主轴/交叉对齐 + gap + padding', () => {
    const d = collectVisualDeclarations(
      node({
        layout: {
          mode: 'HORIZONTAL',
          primaryAxisAlign: 'SPACE_BETWEEN',
          counterAxisAlign: 'CENTER',
          primaryAxisSizing: 'AUTO', counterAxisSizing: 'AUTO', layoutWrap: 'NO_WRAP',
          itemSpacing: 8,
          padding: { top: 4, right: 10, bottom: 4, left: 10 },
        } as ProcessedNode['layout'],
      }),
      750,
      375,
    );
    expect(d.display).toBe('flex');
    expect(d['flex-direction']).toBe('row');
    expect(d['justify-content']).toBe('space-between');
    expect(d['align-items']).toBe('center');
    expect(d.gap).toBe('16rpx');
    expect(d.padding).toBe('8rpx 20rpx');
  });

  it('圆角 → border-radius；纯色填充 → background-color', () => {
    const d = collectVisualDeclarations(
      node({
        cornerRadius: 8,
        fills: [{ type: 'solid', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' }] as ProcessedNode['fills'],
      }),
      750,
      375,
    );
    expect(d['border-radius']).toBe('16rpx');
    expect(d['background-color']).toBe('rgba(255, 0, 0, 1)');
  });

  it('文本节点 textStyle → font-size/weight/color/line-height/letter-spacing', () => {
    const d = collectVisualDeclarations(
      node({
        originalType: 'TEXT', role: 'text',
        textStyle: { fontFamily: 'sans-serif', fontSize: 16, fontWeight: 700, lineHeightPx: 24, letterSpacing: 1, textAlignHorizontal: 'LEFT' } as ProcessedNode['textStyle'],
        fills: [{ type: 'solid', color: { r: 0.2, g: 0.2, b: 0.2, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' }] as ProcessedNode['fills'],
      }),
      750,
      375,
    );
    expect(d['font-size']).toBe('32rpx');
    expect(d['font-weight']).toBe('700');
    expect(d['line-height']).toBe('48rpx');
    expect(d['letter-spacing']).toBe('2rpx');
    expect(d.color).toBe('rgba(51, 51, 51, 1)');
  });

  it('单个投影 → box-shadow；透明度 → opacity', () => {
    const d = collectVisualDeclarations(
      node({
        opacity: 0.5,
        effects: [
          { type: 'drop', x: 0, y: 2, blur: 4, spread: 0, color: { r: 0, g: 0, b: 0, a: 0.25 } },
        ] as ProcessedNode['effects'],
      }),
      750,
      375,
    );
    expect(d.opacity).toBe('0.5');
    expect(d['box-shadow']).toContain('rpx');
    expect(d['box-shadow']).toContain('0.25');
  });
});

describe('P0-81 排除项（不承诺由本方案还原，进报告但不进分母）', () => {
  it('图片填充/复杂渐变/多阴影 被排除并给出原因', () => {
    const imageNode = node({ fills: [{ type: 'image', imageRef: 'x', scaleMode: 'FILL' }] as ProcessedNode['fills'] });
    const di = collectVisualDeclarations(imageNode, 750, 375);
    // 图片走 <image> 资源管线，不产出 background-color
    expect(di['background-color']).toBeUndefined();

    const multiShadow = node({
      effects: [
        { type: 'drop', x: 0, y: 1, blur: 2, spread: 0, color: { r: 0, g: 0, b: 0, a: 0.2 } },
        { type: 'drop', x: 0, y: 4, blur: 8, spread: 0, color: { r: 0, g: 0, b: 0, a: 0.1 } },
      ] as ProcessedNode['effects'],
    });
    const dm = collectVisualDeclarations(multiShadow, 750, 375);
    // 多阴影只承诺首层（或交 Skyline 降级器），不计入本清单 box-shadow
    expect(dm['box-shadow']).toBeUndefined();
  });
});
