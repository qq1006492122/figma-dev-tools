/**
 * 受控并发映射（P3-12）
 *
 * 对列表逐项执行异步 worker，但同时在飞的任务数不超过 limit。
 * 用于网络扇出（如 SVG/位图批量下载）避免一次性打开数百个 socket
 * 导致连接耗尽/被 Figma API 限流；CPU 型任务不需要限流。
 *
 * 纯函数、零依赖；与 Promise.all 一致：
 * - 结果顺序与输入顺序严格对齐；
 * - 任一 worker reject 则整体 reject（不吞错）；
 * - 空列表立即返回空数组。
 *
 * @module utils/concurrency
 */

/**
 * 以受控并发度执行异步映射。
 *
 * @param items - 输入列表
 * @param limit - 最大并发数（<1 按 1 处理，即串行）
 * @param worker - 单项异步处理函数
 * @returns 与输入同序的结果数组
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const concurrency = Math.max(1, Math.floor(limit) || 1);
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function runSlot(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index] as T, index);
    }
  }

  const slots = Array.from({ length: Math.min(concurrency, items.length) }, () => runSlot());
  await Promise.all(slots);
  return results;
}
