/**
 * WBS-P1-25/26 Watch 生命周期与框架适配测试
 *
 * - 4 框架（react/vue/svelte/weapp）适配均就绪，各自可起会话；
 * - start 建立调度循环、stop 清理该会话定时器；disposeAll 无残留 timer/handle；
 * - 粗筛变更触发 regenerate 回调（第二级：拉节点树重新生成）。
 */
import { describe, it, expect, vi } from 'vitest';
import { WatchManager, WATCH_ADAPTERS } from '../../../src/services/watch/watch-manager.js';
import type { ProbeResult } from '../../../src/services/watch/watch-poller.js';
import type { FigmaClient } from '../../../src/services/figma-client.js';
import type { WatchFramework } from '../../../src/services/watch/watch-store.js';

/** 伪调度器：捕获全部定时器句柄 */
function fakeScheduler() {
  const active = new Set<number>();
  let seq = 0;
  return {
    active,
    scheduler: {
      setTimeout: () => {
        const h = ++seq;
        active.add(h);
        return h;
      },
      clearTimeout: (h: number) => active.delete(h),
    },
  };
}

function fakeClient(probe: ProbeResult): FigmaClient {
  return {
    probeFileMeta: vi.fn(async () => probe),
  } as unknown as FigmaClient;
}

const base = {
  fileKey: 'f',
  nodeId: '1:2',
  clientId: 'c1',
  pollIntervalMs: 5000,
};

describe('WBS-P1-26 框架适配表', () => {
  it('react/vue/svelte/weapp 均 available', () => {
    for (const fw of ['react', 'vue', 'svelte', 'weapp'] as WatchFramework[]) {
      expect(WATCH_ADAPTERS[fw].available).toBe(true);
      expect(typeof WATCH_ADAPTERS[fw].probe).toBe('function');
    }
  });
});

describe('WBS-P1-25 生命周期', () => {
  it('start 建立一个定时器；stop 清理该定时器', () => {
    const { active, scheduler } = fakeScheduler();
    const manager = new WatchManager({ scheduler });
    const r = manager.start({ ...base, framework: 'react' }, fakeClient({ kind: 'ok', lastModified: 't1', version: '1' }));
    expect(active.size).toBe(1);
    manager.stop(r.session.sessionId, 'c1');
    expect(active.size).toBe(0);
  });

  it('多会话各自持有定时器；disposeAll 后无任何残留', () => {
    const { active, scheduler } = fakeScheduler();
    const manager = new WatchManager({ scheduler });
    const a = manager.start({ ...base, nodeId: '1:1', framework: 'react' }, fakeClient({ kind: 'ok', lastModified: 't', version: '1' }));
    manager.start({ ...base, nodeId: '2:2', framework: 'vue', clientId: 'c2' }, fakeClient({ kind: 'ok', lastModified: 't', version: '1' }));
    manager.start({ ...base, nodeId: '3:3', framework: 'svelte', clientId: 'c3' }, fakeClient({ kind: 'ok', lastModified: 't', version: '1' }));
    expect(active.size).toBe(3);
    manager.stop(a.session.sessionId, 'c1');
    expect(active.size).toBe(2);
    manager.disposeAll();
    expect(active.size).toBe(0);
  });

  it('幂等 start 不重复建立调度循环', () => {
    const { active, scheduler } = fakeScheduler();
    const manager = new WatchManager({ scheduler });
    const first = manager.start({ ...base, framework: 'react' }, fakeClient({ kind: 'ok', lastModified: 't', version: '1' }));
    const second = manager.start({ ...base, framework: 'react' }, fakeClient({ kind: 'ok', lastModified: 't', version: '1' }));
    expect(second.session.sessionId).toBe(first.session.sessionId);
    expect(active.size).toBe(1);
  });
});

describe('WBS-P1-22 → 变更触发重新生成', () => {
  it('探针签名变化时调用 onRegenerate（携带会话与新快照）', async () => {
    const clock = (() => {
      let t = 0;
      return { now: () => t, advance: (ms: number) => (t += ms) };
    })();
    const probes: ProbeResult[] = [
      { kind: 'ok', lastModified: 't1', version: '1' },
      { kind: 'ok', lastModified: 't2', version: '2' },
    ];
    const client = {
      probeFileMeta: vi.fn(async () => probes.shift()!),
    } as unknown as FigmaClient;
    const onRegenerate = vi.fn(async () => undefined);
    const manager = new WatchManager({ now: clock.now, onRegenerate });

    const { session } = manager.start({ ...base, framework: 'weapp' }, client);
    await manager.tick(session.sessionId, 'c1'); // 基线
    clock.advance(5000);
    await manager.tick(session.sessionId, 'c1'); // 变更
    expect(onRegenerate).toHaveBeenCalledTimes(1);
    expect(onRegenerate).toHaveBeenCalledWith(
      expect.objectContaining({ fileKey: 'f', framework: 'weapp' }),
      expect.objectContaining({ lastModified: 't2', version: '2' }),
    );
  });

  it('适配器不可用（强制 unavailable）→ start 抛 FDT-WATCH-FRAMEWORK-UNAVAILABLE', () => {
    const manager = new WatchManager({
      adapters: {
        react: { framework: 'react', available: false, unavailableReason: '未就绪', probe: async () => ({ kind: 'ok', lastModified: 't', version: null }) },
      },
    });
    expect(() => manager.start({ ...base, framework: 'react' }, fakeClient({ kind: 'ok', lastModified: 't', version: '1' }))).toThrow(
      /FRAMEWORK-UNAVAILABLE|未就绪/,
    );
  });
});
