/**
 * WBS-P1-21 Watch 会话状态机与工具协议测试
 *
 * 冻结口径（ROADMAP P1-2 决策 + 附录 A.3）：
 *  - 每 MCP 进程会话上限 5，超限 FDT-WATCH-TOO-MANY-SESSIONS；
 *  - 同 clientId + fileKey+nodeId+framework 重复 start 幂等返回既有 sessionId；
 *  - write=true 必须有 outputDir（FDT-WATCH-MISSING-OUTPUT），
 *    write=false 带 outputDir 拒绝（FDT-WATCH-OUTPUT-WITHOUT-WRITE）；
 *  - stop/status 幂等；未知 sessionId 查 status 才报 SESSION-NOT-FOUND；
 *  - 未就绪框架 start 拒绝（FDT-WATCH-FRAMEWORK-UNAVAILABLE）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { WatchStore, validateWatchParams, WatchError, WATCH_LIMITS } from '../../../src/services/watch/watch-store.js';

const baseParams = {
  fileKey: 'abc',
  nodeId: '1:2',
  framework: 'react' as const,
  pollIntervalMs: 5000,
  write: false,
  clientId: 'client-A',
};

describe('WBS-P1-21 入参校验', () => {
  it('默认参数合法（write=false、pollIntervalMs=5000）', () => {
    const v = validateWatchParams({ ...baseParams });
    expect(v.write).toBe(false);
    expect(v.pollIntervalMs).toBe(5000);
  });

  it('write=true 缺 outputDir → FDT-WATCH-MISSING-OUTPUT', () => {
    expect(() => validateWatchParams({ ...baseParams, write: true })).toThrowError(
      expect.objectContaining({ code: 'FDT-WATCH-MISSING-OUTPUT' }) as unknown as Error,
    );
  });

  it('write=false 带 outputDir → FDT-WATCH-OUTPUT-WITHOUT-WRITE', () => {
    expect(() => validateWatchParams({ ...baseParams, outputDir: '/tmp/x' })).toThrowError(
      expect.objectContaining({ code: 'FDT-WATCH-OUTPUT-WITHOUT-WRITE' }) as unknown as Error,
    );
  });

  it('write=true + outputDir 合法', () => {
    expect(() => validateWatchParams({ ...baseParams, write: true, outputDir: '/tmp/x' })).not.toThrow();
  });

  it('pollIntervalMs 越界（<3000 / >60000）抛 RangeError（MCP 层由 zod 兜底）', () => {
    expect(() => validateWatchParams({ ...baseParams, pollIntervalMs: 2999 })).toThrow(RangeError);
    expect(() => validateWatchParams({ ...baseParams, pollIntervalMs: 60001 })).toThrow(RangeError);
  });
});

describe('WBS-P1-21 会话状态机', () => {
  let seq: number;
  let store: WatchStore;
  beforeEach(() => {
    seq = 0;
    store = new WatchStore({ idGenerator: () => `w_${++seq}` });
  });

  it('start 返回 running 会话与稳定元数据', () => {
    const r = store.start({ ...baseParams });
    expect(r.existing).toBe(false);
    expect(r.session.sessionId).toBe('w_1');
    expect(r.session.state).toBe('running');
    expect(r.session.framework).toBe('react');
    expect(r.session.startedAt).toBeGreaterThan(0);
  });

  it('同 client 同 fileKey+nodeId+framework 重复 start → 幂等返回既有会话（existing=true）', () => {
    const first = store.start({ ...baseParams });
    const second = store.start({ ...baseParams, pollIntervalMs: 9999 });
    expect(second.session.sessionId).toBe(first.session.sessionId);
    expect(second.existing).toBe(true);
    // 首次参数不被覆盖
    expect(second.session.pollIntervalMs).toBe(5000);
  });

  it('不同 clientId 同节点各自独立会话', () => {
    const a = store.start({ ...baseParams });
    const b = store.start({ ...baseParams, clientId: 'client-B' });
    expect(a.session.sessionId).not.toBe(b.session.sessionId);
    expect(store.list('client-A')).toHaveLength(1);
    expect(store.list('client-B')).toHaveLength(1);
  });

  it('同 client 不同节点/框架分别建会话', () => {
    store.start({ ...baseParams });
    store.start({ ...baseParams, nodeId: '3:4' });
    store.start({ ...baseParams, framework: 'vue' });
    expect(store.list('client-A')).toHaveLength(3);
  });

  it('达到 5 个上限再 start → FDT-WATCH-TOO-MANY-SESSIONS（按 client 隔离）', () => {
    for (let i = 0; i < WATCH_LIMITS.maxSessionsPerClient; i++) {
      store.start({ ...baseParams, nodeId: `1:${i + 1}` });
    }
    expect(() => store.start({ ...baseParams, nodeId: '9:9' })).toThrowError(
      expect.objectContaining({ code: 'FDT-WATCH-TOO-MANY-SESSIONS' }) as unknown as Error,
    );
    // 另一 client 不受影响
    expect(() => store.start({ ...baseParams, clientId: 'client-B' })).not.toThrow();
  });

  it('stop 幂等：停止存在的会话 → stopped；重复 stop/未知 id 不报错', () => {
    const { session } = store.start({ ...baseParams });
    const s1 = store.stop(session.sessionId, 'client-A');
    expect(s1?.state).toBe('stopped');
    expect(store.stop(session.sessionId, 'client-A')?.state).toBe('stopped');
    expect(store.stop('w_unknown', 'client-A')).toBeNull();
  });

  it('stop 后释放名额，可再建新会话', () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push(store.start({ ...baseParams, nodeId: `1:${i}` }).session.sessionId);
    expect(() => store.start({ ...baseParams, nodeId: '9:9' })).toThrow();
    store.stop(ids[0]!, 'client-A');
    expect(() => store.start({ ...baseParams, nodeId: '9:9' })).not.toThrow();
  });

  it('status(sessionId) 未知 id → FDT-WATCH-SESSION-NOT-FOUND；status() 列出本 client 全部', () => {
    const { session } = store.start({ ...baseParams });
    expect(store.status(session.sessionId, 'client-A')[0]!.sessionId).toBe(session.sessionId);
    expect(() => store.status('w_nope', 'client-A')).toThrowError(
      expect.objectContaining({ code: 'FDT-WATCH-SESSION-NOT-FOUND' }) as unknown as Error,
    );
    store.start({ ...baseParams, nodeId: '5:5' });
    expect(store.status(undefined, 'client-A')).toHaveLength(2);
  });

  it('client 隔离：A 看不到 B 的会话，B 的 id 在 A 处按 not-found 处理', () => {
    const b = store.start({ ...baseParams, clientId: 'client-B' });
    expect(() => store.status(b.session.sessionId, 'client-A')).toThrowError(
      expect.objectContaining({ code: 'FDT-WATCH-SESSION-NOT-FOUND' }) as unknown as Error,
    );
    // A 无法停止 B 的会话
    expect(store.stop(b.session.sessionId, 'client-A')).toBeNull();
    expect(store.get(b.session.sessionId, 'client-B')?.state).toBe('running');
  });

  it('状态迁移：running → backoff → running（429 退避与恢复）', () => {
    const { session } = store.start({ ...baseParams });
    store.markBackoff(session.sessionId, 'client-A', 10_000);
    expect(store.get(session.sessionId, 'client-A')?.state).toBe('backoff');
    store.markRunning(session.sessionId, 'client-A');
    expect(store.get(session.sessionId, 'client-A')?.state).toBe('running');
  });

  it('recordChange 累加变更计数与 lastChangedAt', () => {
    const { session } = store.start({ ...baseParams });
    store.recordChange(session.sessionId, 'client-A', 1000);
    store.recordChange(session.sessionId, 'client-A', 2000);
    const s = store.get(session.sessionId, 'client-A')!;
    expect(s.changeCount).toBe(2);
    expect(s.lastChangedAt).toBe(2000);
  });

  it('dispose：清空全部会话（进程退出钩子）', () => {
    store.start({ ...baseParams });
    store.start({ ...baseParams, clientId: 'client-B' });
    store.dispose();
    expect(store.status(undefined, 'client-A')).toHaveLength(0);
    expect(store.status(undefined, 'client-B')).toHaveLength(0);
  });
});
