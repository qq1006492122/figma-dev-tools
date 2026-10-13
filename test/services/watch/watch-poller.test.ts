/**
 * WBS-P1-22 轮询状态机测试（注入伪时钟与探针，零真实网络/定时器）
 *
 * 口径：粗筛探针 GET /v1/files/:key?depth=1（仅 lastModified/version，cachePolicy=bypass）；
 * 429 指数退避 10s 起 ×2、封顶 120s，退避窗口内不发请求；恢复后回到 running。
 */
import { describe, it, expect, vi } from 'vitest';
import { WatchPoller, type ProbeResult } from '../../../src/services/watch/watch-poller.js';

function fakeClock(start = 100_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

function makeProbe(seq: ProbeResult[]) {
  const calls: number[] = [];
  const fn = vi.fn(async () => {
    calls.push(1);
    return seq.shift()!;
  });
  return { fn, calls };
}

describe('WBS-P1-22 粗筛轮询（lastModified/version，bypass）', () => {
  it('首次探针记录基线，不触发 onChange', async () => {
    const clock = fakeClock();
    const probe = makeProbe([{ kind: 'ok', lastModified: '2026-10-10T00:00:00Z', version: '1' }]);
    const onChange = vi.fn();
    const poller = new WatchPoller({ intervalMs: 5000, probe: probe.fn, onChange, now: clock.now });

    await poller.tick();
    expect(onChange).not.toHaveBeenCalled();
    expect(probe.calls).toHaveLength(1);
    expect(poller.state).toBe('running');
  });


  it('onChange 失败保留旧签名，下一版本继续重试', async () => {
    const clock = fakeClock();
    const probe = makeProbe([
      { kind: 'ok', lastModified: 't1', version: '1' },
      { kind: 'ok', lastModified: 't2', version: '2' },
      { kind: 'ok', lastModified: 't2', version: '2' },
    ]);
    const onChange = vi.fn().mockRejectedValueOnce(new Error('regeneration failed')).mockResolvedValue(undefined);
    const poller = new WatchPoller({ intervalMs: 5000, probe: probe.fn, onChange, now: clock.now });
    await poller.tick();
    clock.advance(5000);
    await poller.tick();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(poller.state).toBe('backoff');
    clock.advance(10000);
    await poller.tick();
    expect(onChange).toHaveBeenCalledTimes(2);
  });  it('lastModified 不变 → 不触发；变化 → 触发 onChange 并更新签名', async () => {
    const clock = fakeClock();
    const probe = makeProbe([
      { kind: 'ok', lastModified: 't1', version: '1' },
      { kind: 'ok', lastModified: 't1', version: '1' },
      { kind: 'ok', lastModified: 't2', version: '2' },
    ]);
    const onChange = vi.fn();
    const poller = new WatchPoller({ intervalMs: 5000, probe: probe.fn, onChange, now: clock.now });

    await poller.tick();
    clock.advance(5000);
    await poller.tick();
    expect(onChange).not.toHaveBeenCalled();

    clock.advance(5000);
    await poller.tick();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ lastModified: 't2', version: '2' }),
    );
  });
});

describe('WBS-P1-22 429 指数退避', () => {
  it('连续 429 退避 10s→20s→40s，封顶 120s，且退避窗口内不发请求', async () => {
    const clock = fakeClock();
    const probe = makeProbe([
      { kind: 'rate-limited' },
      { kind: 'rate-limited' },
      { kind: 'rate-limited' },
      { kind: 'rate-limited' },
      { kind: 'rate-limited' },
    ]);
    const poller = new WatchPoller({ intervalMs: 5000, probe: probe.fn, onChange: vi.fn(), now: clock.now });

    await poller.tick();
    expect(poller.state).toBe('backoff');
    expect(poller.backoffMs).toBe(10_000);

    // 退避窗口内：不探针
    clock.advance(5000);
    await poller.tick();
    expect(probe.calls).toHaveLength(1);

    clock.advance(5000); // 到 10s
    await poller.tick(); // 第 2 次 429
    expect(poller.backoffMs).toBe(20_000);

    clock.advance(20_000);
    await poller.tick(); // 第 3 次
    expect(poller.backoffMs).toBe(40_000);

    clock.advance(40_000);
    await poller.tick(); // 第 4 次
    expect(poller.backoffMs).toBe(80_000);

    clock.advance(80_000);
    await poller.tick(); // 第 5 次
    expect(poller.backoffMs).toBe(120_000); // 封顶
  });

  it('退避后探针恢复 200 → 清零退避、状态回 running、变更正常上报', async () => {
    const clock = fakeClock();
    const probe = makeProbe([
      { kind: 'rate-limited' },
      { kind: 'ok', lastModified: 't1', version: '1' },
      { kind: 'ok', lastModified: 't2', version: '2' },
    ]);
    const onChange = vi.fn();
    const poller = new WatchPoller({ intervalMs: 5000, probe: probe.fn, onChange, now: clock.now });

    await poller.tick(); // 429
    expect(poller.state).toBe('backoff');
    clock.advance(10_000);
    await poller.tick(); // 恢复 + 基线
    expect(poller.state).toBe('running');
    expect(poller.backoffMs).toBe(0);

    clock.advance(5000);
    await poller.tick(); // 变更
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('普通间隔 tick（running）按 intervalMs 调度；backoff 中按 backoffMs 调度', async () => {
    const clock = fakeClock();
    const probe = makeProbe([{ kind: 'rate-limited' }]);
    const poller = new WatchPoller({ intervalMs: 5000, probe: probe.fn, onChange: vi.fn(), now: clock.now });
    expect(poller.nextDelayMs()).toBe(5000);
    await poller.tick();
    expect(poller.nextDelayMs()).toBe(10_000);
  });
});
import { describe, expect, it } from 'vitest';

import { createPollingLoop, WatchPoller } from '../../../src/services/watch/watch-poller.js';

describe('Watch polling loop logic traps', () => {
  it('负 Retry-After 不会退化为 0ms 忙循环', async () => {
    const poller = new WatchPoller({
      intervalMs: 5000,
      baseBackoffMs: 0,
      maxBackoffMs: 0,
      probe: async () => ({ kind: 'rate-limited', retryAfterMs: -5 }),
      onChange: () => undefined,
      now: () => 0,
    });

    await poller.tick();
    expect(poller.backoffMs).toBeGreaterThanOrEqual(1);
    expect(poller.nextDelayMs()).toBeGreaterThanOrEqual(1);
  });

  it('tick 或状态回调抛错时仍安排下一次，不产生未处理 rejection', async () => {
    const callbacks: Array<() => void> = [];
    const delays: number[] = [];
    let sequence = 0;
    const scheduler = {
      setTimeout: (fn: () => void, ms: number) => {
        callbacks.push(fn);
        delays.push(ms);
        return ++sequence;
      },
      clearTimeout: () => undefined,
    };
    const poller = new WatchPoller({
      intervalMs: 5,
      baseBackoffMs: 0,
      maxBackoffMs: 0,
      probe: async () => {
        throw new Error('probe failed');
      },
      onChange: () => undefined,
      onStateChange: () => {
        throw new Error('state callback failed');
      },
      now: () => 0,
    });

    const loop = createPollingLoop(poller, scheduler);
    expect(delays[0]).toBeGreaterThanOrEqual(1);
    callbacks[0]?.();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(delays.length).toBeGreaterThanOrEqual(2);
    loop.stop();
  });
});
