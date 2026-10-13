/**
 * 节点视觉属性 → WXSS 声明映射（WBS-P0-81 方案 B）
 *
 * 这是"Figma 视觉字段 → 小程序 WXSS"的单一映射清单：
 *  - 生成器据此把视觉属性落成真实 WXSS（小程序无 Tailwind 运行时）；
 *  - fidelity-wxss 覆盖率据此计算"承诺可还原"的分母，口径一致。
 *
 * 不在本清单的视觉特征（图片填充、复杂渐变、多阴影叠加等）属排除项，
 * 由资源管线 / Skyline 降级器处理或标记，不进入还原度分母。
 *
 * @module
 */

import type { ProcessedNode, ProcessedSolidFill } from '../../types/nodes.js';
import type { FigmaColor } from '../../types.js';

/** px → rpx：Math.round 与 design-width resolver 口径一致 */
export function pxToRpxValue(px: number, frameDesignWidth: number, targetDesignWidth: number): number {
  return Math.round((px / targetDesignWidth) * frameDesignWidth);
}

function rpx(px: number | undefined, frame: number, target: number): string | undefined {
  if (px === undefined || px === null || Number.isNaN(px)) return undefined;
  return `${pxToRpxValue(px, frame, target)}rpx`;
}

function rgba(c: FigmaColor, opacity = 1): string {
  const clamp255 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  const a = c.a === undefined ? opacity : c.a * opacity;
  return `rgba(${clamp255(c.r)}, ${clamp255(c.g)}, ${clamp255(c.b)}, ${Number(a.toFixed(3))})`;
}

const PRIMARY_JUSTIFY: Record<string, string> = {
  MIN: 'flex-start',
  CENTER: 'center',
  MAX: 'flex-end',
  SPACE_BETWEEN: 'space-between',
  SPACE_AROUND: 'space-around',
  SPACE_EVENLY: 'space-evenly',
};
const COUNTER_ALIGN: Record<string, string> = {
  MIN: 'flex-start',
  CENTER: 'center',
  MAX: 'flex-end',
  BASELINE: 'baseline',
};

function firstSolidFill(node: ProcessedNode): ProcessedSolidFill | undefined {
  return (node.fills ?? []).find(
    (f): f is ProcessedSolidFill =>
      f.type === 'solid' && Boolean((f as ProcessedSolidFill).color),
  );
}

function paddingShorthand(padding: { top: number; right: number; bottom: number; left: number } | undefined) {
  if (!padding) return undefined;
  const { top, right, bottom, left } = padding;
  if ([top, right, bottom, left].every((v) => v === 0)) return undefined;
  return { top, right, bottom, left };
}

/**
 * 收集单节点承诺可还原的 WXSS 声明（kebab-case 属性 → 值）。
 * 返回空对象表示该节点无本清单覆盖的视觉属性。
 */
export function collectVisualDeclarations(
  node: ProcessedNode,
  frameDesignWidth: number,
  targetDesignWidth: number,
): Record<string, string> {
  const decls: Record<string, string> = {};
  const at = (px?: number) => rpx(px, frameDesignWidth, targetDesignWidth);

  // —— 尺寸 ——
  if (node.size && node.size.width > 0) decls.width = at(node.size.width)!;
  if (node.size && node.size.height > 0) decls.height = at(node.size.height)!;

  // —— 自动布局 ——
  const layout = node.layout;
  if (layout && layout.mode !== 'NONE') {
    decls.display = 'flex';
    decls['flex-direction'] = layout.mode === 'HORIZONTAL' ? 'row' : 'column';
    if (layout.layoutWrap === 'WRAP') decls['flex-wrap'] = 'wrap';
    const justify = PRIMARY_JUSTIFY[layout.primaryAxisAlign];
    if (justify) decls['justify-content'] = justify;
    const align = COUNTER_ALIGN[layout.counterAxisAlign];
    if (align) decls['align-items'] = align;
    if (layout.itemSpacing) decls.gap = at(layout.itemSpacing)!;
    const pad = paddingShorthand(layout.padding);
    if (pad) {
      const t = at(pad.top) ?? '0rpx';
      const r = at(pad.right) ?? '0rpx';
      const b = at(pad.bottom) ?? '0rpx';
      const l = at(pad.left) ?? '0rpx';
      if (t === b && r === l) decls.padding = t === r ? t : `${t} ${r}`;
      else decls.padding = `${t} ${r} ${b} ${l}`;
    }
  }

  // —— 圆角（仅统一圆角；异形角交复杂场景，不进本清单）——
  if (typeof node.cornerRadius === 'number' && node.cornerRadius > 0) {
    decls['border-radius'] = at(node.cornerRadius)!;
  }

  // —— 纯色填充 → background-color ——（图片/渐变填充不进本清单）
  const solid = firstSolidFill(node);
  if (solid) {
    decls['background-color'] = rgba(solid.color, solid.opacity ?? 1);
  }

  // —— 不透明度 ——
  if (node.opacity !== undefined && node.opacity < 1) {
    decls.opacity = String(node.opacity);
  }

  // —— 单个投影 → box-shadow（多阴影叠加不进本清单，交 Skyline 降级/人工）——
  const drops = (node.effects ?? []).filter((e) => e.type === 'drop');
  if (drops.length === 1) {
    const e = drops[0]!;
    const x = at(e.x) ?? '0rpx';
    const y = at(e.y) ?? '0rpx';
    const blur = at(e.blur) ?? '0rpx';
    const spread = e.spread ? ` ${at(e.spread)}` : '';
    decls['box-shadow'] = `${x} ${y} ${blur}${spread} ${rgba(e.color)}`;
  }

  // —— 文本 ——
  const ts = node.textStyle;
  if (ts && (node.originalType === 'TEXT' || node.role === 'text')) {
    if (ts.fontSize) decls['font-size'] = at(ts.fontSize)!;
    if (ts.fontWeight) decls['font-weight'] = String(ts.fontWeight);
    if (ts.lineHeightPx) decls['line-height'] = at(ts.lineHeightPx)!;
    if (ts.letterSpacing) decls['letter-spacing'] = at(ts.letterSpacing)!;
    if (ts.textAlignHorizontal) {
      const map: Record<string, string> = { LEFT: 'left', CENTER: 'center', RIGHT: 'right', JUSTIFIED: 'justify' };
      if (map[ts.textAlignHorizontal]) decls['text-align'] = map[ts.textAlignHorizontal]!;
    }
    // 文本颜色取节点首个纯色填充
    if (solid) decls.color = rgba(solid.color, solid.opacity ?? 1);
  }

  return decls;
}

/** 本清单承诺可还原的 CSS 属性键（fidelity 分母白名单） */
export const SUPPORTED_VISUAL_PROPERTIES: readonly string[] = [
  'width', 'height',
  'display', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'gap', 'padding',
  'border-radius', 'background-color', 'opacity', 'box-shadow',
  'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align', 'color',
];
