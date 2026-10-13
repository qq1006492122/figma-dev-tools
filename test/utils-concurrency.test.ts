/**
 * P3-12 受控并发工具单测：
 * 顺序对齐、并发上限真实生效、空列表、串行降级、错误传播。
 */
import { describe, expect, it, vi } from 'vitest';
import { mapWithConcurrency } from '../src/utils/concurrency.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('P3-12 mapWithConcurrency', () => {
  it('空列表立即返回空数组，不调用 worker', async () => {
    const worker = vi.fn();
    await expect(mapWithConcurrency([], 3, worker)).resolves.toEqual([]);
    expect(worker).not.toHaveBeenCalled();
  });

  it('结果顺序与输入严格对齐（即使后入项先完成）', async () => {
    const items = [1, 2, 3, 4, 5];
    // 大索引先完成，制造乱序完成
    const out = await mapWithConcurrency(items, 5, async (n) => {
      await sleep((6 - n) * 5);
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50]);
  });

  it('并发上限真实生效：limit=2 时任何时刻在飞任务 ≤2', async () => {
    let active = 0;
    let maxActive = 0;
    await mapWithConcurrency(Array.from({ length: 10 }, (_, i) => i), 2, async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await sleep(8);
      active--;
    });
    expect(maxActive).toBeLessThanOrEqual(2);
    expect(maxActive).toBe(2);
  });

  it('limit=1 严格串行（后一项必须等前一项完成）', async () => {
    const order: number[] = [];
    await mapWithConcurrency([1, 2, 3], 1, async (n) => {
      order.push(n);
      await sleep(5);
      order.push(-n);
    });
    expect(order).toEqual([1, -1, 2, -2, 3, -3]);
  });

  it('limit<1 / NaN 按 1（串行）处理', async () => {
    let maxActive = 0;
    let active = 0;
    await mapWithConcurrency([1, 2, 3], 0, async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await sleep(2);
      active--;
    });
    expect(maxActive).toBe(1);
  });

  it('worker reject 时整体 reject 且不吞错', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom');
        return n;
      }),
    ).rejects.toThrow('boom');
  });

  it('limit 大于列表长度时不会创建多余 worker 槽', async () => {
    const worker = vi.fn(async (n: number) => n);
    const out = await mapWithConcurrency([10, 20], 10, worker);
    expect(out).toEqual([10, 20]);
    expect(worker).toHaveBeenCalledTimes(2);
  });
});
