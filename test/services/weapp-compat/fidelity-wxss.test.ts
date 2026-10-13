/**
 * 方案 B WXSS 还原度覆盖率测试（WBS-P0-81）
 *
 * 分母 = 节点树中本方案承诺可还原的视觉属性（按 weapp-visual-style 清单）；
 * 分子 = 生成 WXSS 中实际出现的属性；排除项不进分母但在报告可见。
 */
import { describe, it, expect } from 'vitest';
import type { ProcessedNode } from '../../../src/types/nodes.js';
import {
  extractExpectedProperties,
  extractExpectedNodeProperties,
  extractGeneratedProperties,
  computeFidelity,
  computeNodeFidelity,
  canonicalDeclarationValue,
} from '../../../src/services/weapp-compat/fidelity-wxss.js';

function frame(children: ProcessedNode[] = []): ProcessedNode {
  return {
    id: 'root', figmaId: '1:1', name: 'Frame', originalType: 'FRAME', role: 'container', visible: true,
    size: { width: 375, height: 200 }, children,
  } as ProcessedNode;
}
function box(id: string, partial: Partial<ProcessedNode> = {}): ProcessedNode {
  return {
    id, figmaId: `${id}:1`, name: id, originalType: 'FRAME', role: 'container', visible: true,
    size: { width: 100, height: 50 },
    fills: [{ type: 'solid', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' }],
    cornerRadius: 8,
    children: [],
    ...partial,
  } as ProcessedNode;
}

describe('P0-81 期望属性提取（分母）', () => {
  it('收集树中所有承诺可还原属性，按节点去重计数', () => {
    const tree = frame([box('a'), box('b')]);
    const expected = extractExpectedProperties(tree, 750, 375);
    // root: width+height；每 box: width/height/background-color/border-radius
    const counts = expected.counts;
    expect(counts.width).toBe(3);
    expect(counts.height).toBe(3);
    expect(counts['background-color']).toBe(2);
    expect(counts['border-radius']).toBe(2);
  });

  it('图片填充不进入分母（属资源管线）', () => {
    const tree = frame([
      box('img', {
        fills: [{ type: 'image', imageRef: 'x', scaleMode: 'FILL' }] as ProcessedNode['fills'],
        cornerRadius: undefined,
      }),
    ]);
    const expected = extractExpectedProperties(tree, 750, 375);
    expect(expected.counts['background-color']).toBeUndefined();
    expect(expected.excluded.some((x) => x.property === 'fill:image')).toBe(true);
  });

  it('多阴影叠加列为排除项（可见但不进分母）', () => {
    const tree = frame([
      box('ms', {
        effects: [
          { type: 'drop', x: 0, y: 1, blur: 2, spread: 0, color: { r: 0, g: 0, b: 0, a: 0.2 } },
          { type: 'drop', x: 0, y: 4, blur: 8, spread: 0, color: { r: 0, g: 0, b: 0, a: 0.1 } },
        ] as ProcessedNode['effects'],
      }),
    ]);
    const expected = extractExpectedProperties(tree, 750, 375);
    expect(expected.counts['box-shadow']).toBeUndefined();
    expect(expected.excluded.some((x) => x.property === 'box-shadow:multi')).toBe(true);
  });
});

describe('P0-81 生成属性提取（分子）', () => {
  it('从 WXSS 文本解析出现过的属性集合（多规则去重计数取声明总条数）', () => {
    const wxss = '.a { width: 100rpx; height: 50rpx; }\n.b { width: 200rpx; background-color: red; }';
    const gen = extractGeneratedProperties(wxss);
    expect(gen.counts.width).toBe(2);
    expect(gen.counts.height).toBe(1);
    expect(gen.counts['background-color']).toBe(1);
  });
});

describe('P0-81 覆盖率报告', () => {
  it('完全匹配 → 100%', () => {
    const tree = frame([box('a')]);
    const expected = extractExpectedProperties(tree, 750, 375);
    // 手工构造覆盖全部期望属性的 wxss
    const wxss =
      '.root { width: 750rpx; height: 400rpx; }\n' +
      '.a { width: 200rpx; height: 100rpx; background-color: red; border-radius: 16rpx; }';
    const report = computeFidelity(expected, wxss);
    expect(report.rate).toBe(1);
    expect(report.matched).toBe(report.total);
    expect(report.missing).toEqual([]);
  });

  it('缺失部分 → rate 在 0~1 之间且列出 missing', () => {
    const tree = frame([box('a')]);
    const expected = extractExpectedProperties(tree, 750, 375);
    const wxss = '.root { width: 750rpx; }\n.a { width: 200rpx; height: 100rpx; }';
    const report = computeFidelity(expected, wxss);
    expect(report.rate).toBeGreaterThan(0);
    expect(report.rate).toBeLessThan(1);
    expect(report.missing).toContain('background-color');
    expect(report.missing).toContain('border-radius');
  });

  it('分母为 0（空树）→ rate=1，避免除零', () => {
    const report = computeFidelity({ counts: {}, excluded: [] }, '.a {}');
    expect(report.rate).toBe(1);
    expect(report.total).toBe(0);
  });
});

describe('P0-81 渲染折叠/不可见节点口径（与生成器渲染决策一致）', () => {
  it('skipNodeIds 的整棵子树不进分母（wx:for 折叠成员样式由原型 class 承载）', () => {
    const folded = box('folded', { cornerRadius: undefined });
    const tree = frame([box('proto'), folded]);
    const all = extractExpectedProperties(tree, 750, 375);
    const skipped = extractExpectedProperties(tree, 750, 375, { skipNodeIds: new Set(['folded']) });

    // 折叠前：两个节点各贡献 width/height/background-color
    expect(all.counts.width).toBe(3);
    // 折叠后：folded 整棵子树（含自身）不进分母
    expect(skipped.counts.width).toBe(2);
    expect(skipped.counts['background-color']).toBe(1);
    const item = skipped.excluded.find((x) => x.property === 'list-folded-member');
    expect(item).toBeDefined();
    expect(item!.nodeId).toBe('folded');
  });

  it('visible:false 子树默认剪枝（invisible-node），不渲染就不进分母', () => {
    const tree = frame([
      box('shown'),
      box('hidden', { visible: false, children: [box('hidden-child')] }),
    ]);
    const expected = extractExpectedProperties(tree, 750, 375);
    expect(expected.counts.width).toBe(2); // root + shown
    expect(expected.excluded.some((x) => x.nodeId === 'hidden' && x.property === 'invisible-node')).toBe(true);
    // 剪枝是整棵子树：hidden-child 不产生任何排除/计数
    expect(expected.excluded.some((x) => x.nodeId === 'hidden-child')).toBe(false);
  });

  it('visible:false 但在 forceRenderIds 中（承载 wx:if 指令）→ 仍进分母', () => {
    const tree = frame([box('conditional', { visible: false })]);
    const expected = extractExpectedProperties(tree, 750, 375, {
      forceRenderIds: new Set(['conditional']),
    });
    expect(expected.counts.width).toBe(2);
    expect(expected.excluded.some((x) => x.property === 'invisible-node')).toBe(false);
  });
});

describe('P0-81 R1 加固：按节点 + 属性值比对（computeNodeFidelity）', () => {
  it('同一节点属性值正确才计命中；别的节点的同名声明不能抵扣（防闸门虚高）', () => {
    const tree = frame([box('a'), box('b')]);
    const expected = extractExpectedNodeProperties(tree, 750, 375);

    // 只给 a 正确声明，b 完全缺失 → b 的属性必须全部计为未命中
    const aDecls = expected.byNode.get('a')!;
    const generated = new Map([['a', { ...aDecls }]]);
    const report = computeNodeFidelity(expected, generated);

    const expectedTotal = [...expected.byNode.values()].reduce((s, d) => s + Object.keys(d).length, 0);
    const aTotal = Object.keys(aDecls).length;
    expect(report.total).toBe(expectedTotal);
    expect(report.matched).toBe(aTotal);
    expect(report.rate).toBeLessThan(1);
    // 旧的纯计数口径在这种场景会被 b 的缺失被 a 重复抵扣掩盖——新口径必须暴露
    expect(report.mismatched.some((m) => m.nodeId === 'b' && m.actual === null)).toBe(true);
  });

  it('属性存在但颜色值错误 → 不计命中，并给出 expected/actual 明细', () => {
    const tree = frame([box('a')]);
    const expected = extractExpectedNodeProperties(tree, 750, 375);
    const wrong = new Map<string, Record<string, string>>();
    for (const [nodeId, decls] of expected.byNode) {
      wrong.set(
        nodeId,
        Object.fromEntries(
          Object.entries(decls).map(([p, v]) => [p, p === 'background-color' ? '#0000ff' : v]),
        ),
      );
    }
    const report = computeNodeFidelity(expected, wrong);
    const colorMiss = report.mismatched.find((m) => m.property === 'background-color');
    expect(colorMiss).toBeDefined();
    expect(colorMiss!.actual).toBe('#0000ff');
    expect(report.matched).toBe(report.total - 1);
  });

  it('值规范化：#fff 与 #ffffff、0rpx 与 0 视为相等', () => {
    expect(canonicalDeclarationValue('#fff')).toBe('#ffffff');
    expect(canonicalDeclarationValue(' 0rpx ')).toBe('0');
    const expected = {
      byNode: new Map([['n1', { 'background-color': '#ffffff', width: '0rpx' }]]),
      excluded: [],
    };
    const generated = new Map([['n1', { 'background-color': '#FFF', width: '0' }]]);
    const report = computeNodeFidelity(expected, generated);
    expect(report.matched).toBe(2);
    expect(report.rate).toBe(1);
  });

  it('分母为 0 → rate=1', () => {
    const report = computeNodeFidelity({ byNode: new Map(), excluded: [] }, new Map());
    expect(report.rate).toBe(1);
    expect(report.mismatched).toEqual([]);
  });
});
