/**
 * Watch 生命周期管理器 + 框架适配表（WBS-P1-25 / WBS-P1-26）
 *
 * - 每个会话绑定一个 {@link WatchPoller} 与递归调度循环；stop 清理该会话定时器，
 *   disposeAll 清空全部会话与定时器（MCP SIGTERM/disconnect 钩子调用，零残留）；
 * - 框架适配表声明 react/vue/svelte/weapp 是否就绪；未就绪 start 抛
 *   FDT-WATCH-FRAMEWORK-UNAVAILABLE（当前四框架均已就绪）；
 * - 探针统一走 FigmaClient.probeFileMeta（depth=1、bypass），签名变更回调 onRegenerate
 *   由 MCP 层提供（拉节点树 → 框架生成器 → 可选写盘）。
 *
 * @module
 */

import {
  WatchStore,
  WatchError,
  validateWatchParams,
  type WatchFramework,
  type WatchSession,
  type WatchStartParams,
} from './watch-store.js';

export { WatchError };
export type { WatchFramework, WatchSession, WatchStartParams };
import { WatchPoller, createPollingLoop, type ProbeResult, type SchedulerLike } from './watch-poller.js';
import type { FigmaClient } from '../figma-client.js';

export interface WatchAdapter {
  framework: WatchFramework;
  available: boolean;
  unavailableReason?: string;
  /** 粗筛探针（默认实现 depth=1 bypass；测试可替换） */
  probe: (client: FigmaClient, fileKey: string) => Promise<ProbeResult>;
}

const defaultProbe: WatchAdapter['probe'] = (client, fileKey) => client.probeFileMeta(fileKey);

/** 四框架适配表（WBS-P1-26：随各生成器合入而就绪） */
export const WATCH_ADAPTERS: Record<WatchFramework, WatchAdapter> = {
  react: { framework: 'react', available: true, probe: defaultProbe },
  vue: { framework: 'vue', available: true, probe: defaultProbe },
  svelte: { framework: 'svelte', available: true, probe: defaultProbe },
  weapp: { framework: 'weapp', available: true, probe: defaultProbe },
};

export interface WatchManagerOptions {
  store?: WatchStore;
  adapters?: Partial<Record<WatchFramework, WatchAdapter>>;
  scheduler?: SchedulerLike;
  now?: () => number;
  /** 粗筛变更回调（第二级：拉树重新生成 + 可选写盘） */
  onRegenerate?: (
    session: WatchSession,
    snapshot: { lastModified: string; version: string | null },
  ) => void | Promise<void>;
}

interface ActiveLoop {
  poller: WatchPoller;
  stop: () => void;
}

export class WatchManager {
  private readonly store: WatchStore;
  private readonly adapters: Partial<Record<WatchFramework, WatchAdapter>>;
  private readonly loops = new Map<string, ActiveLoop>();

  constructor(private readonly options: WatchManagerOptions = {}) {
    this.store = options.store ?? new WatchStore({ now: options.now });
    this.adapters = options.adapters ?? WATCH_ADAPTERS;
  }

  /** 启动会话并建立轮询循环（幂等复用不重建循环） */
  start(params: WatchStartParams, client: FigmaClient): { session: WatchSession; existing: boolean } {
    const validated = validateWatchParams(params);
    const adapter = this.adapters[validated.framework] ?? WATCH_ADAPTERS[validated.framework];
    if (!adapter?.available) {
      const reason = adapter.unavailableReason ?? '框架未就绪';
      throw new WatchError('FDT-WATCH-FRAMEWORK-UNAVAILABLE', `框架 "${validated.framework}" watch 不可用：${reason}`);
    }

    const { session, existing } = this.store.start(validated);
    if (existing) return { session, existing: true };

    const poller = new WatchPoller({
      intervalMs: session.pollIntervalMs,
      now: this.options.now,
      probe: () => adapter.probe(client, session.fileKey),
      onChange: (snapshot) => this.options.onRegenerate?.(session, snapshot),
      onStateChange: (state, detail) => {
        if (state === 'backoff') this.store.markBackoff(session.sessionId, session.clientId, detail ?? '429');
        else this.store.markRunning(session.sessionId, session.clientId);
      },
    });
    const loop = createPollingLoop(poller, this.options.scheduler);
    this.loops.set(session.sessionId, { poller, stop: loop.stop });
    return { session, existing: false };
  }

  /** 停止会话并清理其调度循环（幂等） */
  stop(sessionId: string, clientId: string): WatchSession | null {
    const session = this.store.stop(sessionId, clientId);
    this.loops.get(sessionId)?.stop();
    this.loops.delete(sessionId);
    return session;
  }

  status(sessionId: string | undefined, clientId: string): WatchSession[] {
    return this.store.status(sessionId, clientId);
  }

  /** 记录一次成功的重新生成 */
  recordChange(sessionId: string, clientId: string): void {
    this.store.recordChange(sessionId, clientId, this.options.now?.() ?? Date.now());
  }

  /** 记录重新生成失败（会话进入 error 态，轮询循环继续） */
  markSessionError(sessionId: string, clientId: string, detail: string): void {
    this.store.markError(sessionId, clientId, detail);
  }

  /** 测试/钩子：手动驱动一次轮询周期 */
  async tick(sessionId: string, clientId: string): Promise<void> {
    await this.loops.get(sessionId)?.poller.tick();
    // 手动 tick 后以最新延迟重新调度
    const active = this.loops.get(sessionId);
    if (active) {
      active.stop();
      const loop = createPollingLoop(active.poller, this.options.scheduler);
      this.loops.set(sessionId, { poller: active.poller, stop: loop.stop });
    }
    void clientId;
  }

  /** 进程退出/disconnect：清空全部会话与定时器（WBS-P1-25） */
  disposeAll(): void {
    for (const loop of this.loops.values()) loop.stop();
    this.loops.clear();
    this.store.dispose();
  }
}
