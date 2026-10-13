/**
 * P3-11 测量原语：预热 + N 次计时 + GC 后堆增量 + 中位数统计。
 *
 * 约定（ROADMAP 冻结口径）：
 * - 预热 1 次丢弃（JIT/模块懒初始化）；
 * - 正式 5 次，报告中位数（主指标）、min/max（抖动区间）；
 * - 内存仅在 --expose-gc 启动时可用：每次运行前强制 GC，记录 heapUsed 增量；
 *   RSS 始终记录（进程级峰值，含 Prettier 等不可回收缓存）；
 * - 输出体量（字节）随样本返回，验证「优化不是靠少生成内容」。
 */

/** 中位数（偶数个取中间两值均值） */
export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function memMb() {
  const m = process.memoryUsage();
  return {
    heapUsedMB: m.heapUsed / 1024 / 1024,
    rssMB: m.rss / 1024 / 1024,
  };
}

/**
 * 运行测量。
 *
 * @param {() => Promise<object|string>|object|string} fn - 被测函数；返回值含 code 字段或直接是字符串
 * @param {object} opts
 * @param {number} [opts.warmup=1]
 * @param {number} [opts.runs=5]
 * @returns {Promise<object>} 统计结果
 */
export async function measure(fn, { warmup = 1, runs = 5 } = {}) {
  const gcAvailable = typeof global.gc === 'function';

  for (let i = 0; i < warmup; i++) {
    await fn();
  }
  if (gcAvailable) global.gc();

  /** @type {Array<{ms:number, heapDeltaMB:number, retainedMB:number|null, rssMB:number, outBytes:number}>} */
  const samples = [];
  for (let i = 0; i < runs; i++) {
    if (gcAvailable) global.gc();
    const before = memMb();
    const t0 = performance.now();
    let out = await fn();
    const t1 = performance.now();
    const after = memMb();
    const outStr = typeof out === 'string' ? out : JSON.stringify(out?.code ?? out ?? '');
    out = null; // 显式释放产物引用，确保下面 GC 能回收临时对象
    // 释放产物后强制 GC：retained = 无法回收的净增长（缓存/模块态），
    // 区别于 heapDelta（含当次临时分配 churn，受 GC 时机影响噪声大）
    let retainedMB = null;
    if (gcAvailable) {
      global.gc();
      global.gc();
      retainedMB = memMb().heapUsedMB - before.heapUsedMB;
    }
    samples.push({
      ms: t1 - t0,
      heapDeltaMB: gcAvailable ? after.heapUsedMB - before.heapUsedMB : null,
      retainedMB,
      rssMB: after.rssMB,
      outBytes: outStr.length,
    });
    if (gcAvailable) global.gc();
  }

  const ms = samples.map((s) => s.ms);
  const rss = samples.map((s) => s.rssMB);
  const bytes = samples.map((s) => s.outBytes);
  const heap = samples.map((s) => s.heapDeltaMB).filter((v) => v !== null);
  const retained = samples.map((s) => s.retainedMB).filter((v) => v !== null);
  return {
    runs,
    gcAvailable,
    durationMs: {
      median: round(median(ms)),
      min: round(Math.min(...ms)),
      max: round(Math.max(...ms)),
    },
    heapDeltaMB: heap.length ? { median: round(median(heap)), max: round(Math.max(...heap)) } : null,
    retainedMB: retained.length ? { median: round(median(retained)), max: round(Math.max(...retained)) } : null,
    rssMB: { median: round(median(rss)), max: round(Math.max(...rss)) },
    outputBytes: { median: median(bytes), stable: new Set(bytes).size === 1 },
    samples: samples.map((s) => ({
      ...s,
      ms: round(s.ms),
      heapDeltaMB: s.heapDeltaMB === null ? null : round(s.heapDeltaMB),
      retainedMB: s.retainedMB === null ? null : round(s.retainedMB),
      rssMB: round(s.rssMB),
    })),
  };
}

function round(n) {
  return Math.round(n * 100) / 100;
}

/** 控制台表格行 */
export function formatRow(label, stats) {
  const d = stats.durationMs;
  const heap = stats.heapDeltaMB ? `churn+${stats.heapDeltaMB.median}MB` : 'churn=n/a';
  const retained = stats.retainedMB ? `retained+${stats.retainedMB.median}MB` : 'retained=n/a';
  return `${label.padEnd(10)} ${String(d.median).padStart(9)}ms (min ${d.min}/max ${d.max})  ${heap.padEnd(16)} ${retained.padEnd(20)} rss ${stats.rssMB.median}MB  out ${(stats.outputBytes.median / 1024).toFixed(1)}KB`;
}
