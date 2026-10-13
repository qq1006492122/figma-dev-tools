/**
 * P3-12 NodeProcessor 路径式 visited 语义测试：
 * - 兄弟分支互不污染（A 分支 id 不影响 B 分支）
 * - 同 id 跨兄弟复用（如实例化节点）两个都处理（与旧 new Set(path) 语义一致）
 * - 深链完整处理（路径集随递归返回收缩）
 * - 线性时间：1200 节点宽树不出现 O(n²) 劣化（宽松倍数断言防 CI 抖动）
 * 注：真正的父子回边（环）在层级修复器阶段即报 circular_reference；真实 Figma
 * 树无环，处理器内层 visited.has 守卫仍保留（深链/兄弟用例覆盖其增删路径语义）。
 */
import { describe, expect, it } from 'vitest';
import { createNodeProcessor } from '../../src/services/node-processor.js';
import type { FigmaNode } from '../../src/types/nodes.js';

/** 带纯色填充的 FRAME（避免被层级修复器当作空容器自动隐藏） */
function rawNode(
  id: string,
  children: FigmaNode[] = [],
  extra: Partial<FigmaNode> = {},
): FigmaNode {
  return {
    id,
    name: id,
    type: 'FRAME',
    visible: true,
    absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
    fills: [{ type: 'SOLID', color: { r: 0.09, g: 0.47, b: 1 }, opacity: 1 }],
    children,
    ...extra,
  } as unknown as FigmaNode;
}

function countProcessed(node: { children?: unknown[] } | null): number {
  if (!node) return 0;
  let n = 1;
  for (const c of (node as { children?: Array<{ children?: unknown[] } | null> }).children ?? []) {
    n += countProcessed(c as { children?: unknown[] } | null);
  }
  return n;
}

describe('P3-12 NodeProcessor 路径式 visited（O(n²)→O(n)）', () => {
  it('兄弟分支互不污染：两个分支各含同 id 节点时均被处理', () => {
    const root = rawNode('root', [
      rawNode('branch-a', [rawNode('shared-id')]),
      rawNode('branch-b', [rawNode('shared-id')]),
    ]);
    const { node } = createNodeProcessor({ maxDepth: -1 }).process(root);
    expect(node).not.toBeNull();
    // root + 2 branches + 2 shared-id 全部保留
    expect(countProcessed(node)).toBe(5);
  });

  it('45 层深链完整处理（旧实现每层复制祖先 Set；SAFE_MAX_DEPTH=50 内）', () => {
    let cur = rawNode('deep-44');
    for (let i = 43; i >= 0; i--) cur = rawNode(`deep-${i}`, [cur]);
    const { node, stats } = createNodeProcessor({ maxDepth: -1 }).process(cur);
    expect(node).not.toBeNull();
    expect(countProcessed(node)).toBe(45);
    expect(stats.originalNodeCount).toBe(45);
  });

  it('线性性能：300→1200 节点（4x）耗时显著低于 O(n²) 的 ~16x（CI 宽松闸 6x）', () => {
    const build = (sections: number) => {
      const children: FigmaNode[] = [];
      for (let i = 0; i < sections; i++) {
        children.push(rawNode(`s-${i}`, [rawNode(`c-${i}-0`), rawNode(`c-${i}-1`), rawNode(`c-${i}-2`)]));
      }
      return rawNode('root', children);
    };
    const processor = createNodeProcessor({ maxDepth: -1 });
    processor.process(build(5)); // 预热
    const t1 = performance.now();
    processor.process(build(60)); // 60×4+1 = 241
    const small = performance.now() - t1;
    const t2 = performance.now();
    processor.process(build(300)); // 300×4+1 = 1201
    const large = performance.now() - t2;
    // O(n) 期望 ~4-5x（含层级修复器）；给 6x 宽松上界（旧 visited 复制为 O(n²)）
    expect(large / Math.max(small, 0.01)).toBeLessThan(6);
  });
});
