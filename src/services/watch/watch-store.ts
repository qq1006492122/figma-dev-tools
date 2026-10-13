/**
 * Watch 会话状态机（WBS-P1-21）
 *
 * 纯内存、零 I/O、零定时器：只负责会话表的一致性规则（ROADMAP P1-2 决策 8 + 附录 A.3）：
 *  - 单 client 会话上限 5（超限 FDT-WATCH-TOO-MANY-SESSIONS），名额按 client 隔离；
 *  - 同 client + fileKey+nodeId+framework 重复 start 幂等返回既有会话；
 *  - stop/status 幂等；跨 client 互不可见；
 *  - dispose() 清空（MCP 进程退出 / disconnect 钩子，WBS-P1-25）。
 *
 * 轮询调度在 watch-poller.ts，写盘在 watch-safe-writer.ts，本模块不持有它们。
 *
 * @module
 */

import { randomUUID } from 'node:crypto';

// ============ 冻结常量（可审计，不允许凭感觉调） ============

export const WATCH_LIMITS = {
  /** 单 client 最大并发 watch 会话数（决策 8） */
  maxSessionsPerClient: 5,
  /** 默认/允许的轮询间隔（附录 A.3） */
  defaultPollIntervalMs: 5000,
  minPollIntervalMs: 3000,
  maxPollIntervalMs: 60000,
  /**
   * 粗筛额度账（决策 7）：
   * 单会话 5s 间隔 ≈ 3600/5 = 720 请求/小时（仅 GET /v1/files/:key?depth=1 粗筛，
   * 不拉节点树）。每 client 5 会话上限 → 峰值 5×720 = 3600 请求/小时（≈1 req/s）。
   * 命中官方速率限制返回 429 时由 watch-poller 指数退避（10s 起、×2、封顶 120s）。
   */
  requestsPerHourPerSession: 720,
  maxRequestsPerHourPerClient: 3600,
} as const;

/** watch 支持的框架（WBS-P1-26 适配表） */
export type WatchFramework = 'react' | 'vue' | 'svelte' | 'weapp';

/** Watch 冻结错误码（附录 A.1，域 = WATCH） */
export type WatchErrorCode =
  | 'FDT-WATCH-MISSING-OUTPUT'
  | 'FDT-WATCH-OUTPUT-WITHOUT-WRITE'
  | 'FDT-WATCH-TOO-MANY-SESSIONS'
  | 'FDT-WATCH-FRAMEWORK-UNAVAILABLE'
  | 'FDT-WATCH-SESSION-NOT-FOUND';

export class WatchError extends Error {
  readonly code: WatchErrorCode;
  constructor(code: WatchErrorCode, message: string) {
    super(message);
    this.name = 'WatchError';
    this.code = code;
  }
}

export interface WatchStartParams {
  fileKey: string;
  nodeId: string;
  framework: WatchFramework;
  clientId: string;
  pollIntervalMs?: number;
  write?: boolean;
  outputDir?: string;
  styleFormat?: string;
  vueVersion?: 2 | 3;
  componentName?: string;
}

export type SessionState = 'running' | 'backoff' | 'stopped' | 'error';

export interface WatchSession {
  sessionId: string;
  clientId: string;
  fileKey: string;
  nodeId: string;
  framework: WatchFramework;
  state: SessionState;
  pollIntervalMs: number;
  write: boolean;
  outputDir?: string;
  styleFormat?: string;
  vueVersion?: 2 | 3;
  /** R1 QA：compare 合成会话/显式指定时覆盖从节点名推导的组件名（影响产物文件名） */
  componentName?: string;
  startedAt: number;
  lastChangedAt?: number;
  changeCount: number;
  lastError?: string;
}

/** 已就绪框架（WBS-P1-26：react/vue 既有，svelte P1-1、weapp P0 已合入） */
const AVAILABLE_FRAMEWORKS: readonly WatchFramework[] = ['react', 'vue', 'svelte', 'weapp'];

/**
 * start 入参校验（与 MCP zod superRefine 同口径，CLI/内部调用共用）。
 *
 * @throws WatchError
 */
export function validateWatchParams(params: WatchStartParams): Required<Pick<WatchStartParams, 'pollIntervalMs' | 'write'>> & WatchStartParams {
  if (!AVAILABLE_FRAMEWORKS.includes(params.framework)) {
    throw new WatchError(
      'FDT-WATCH-FRAMEWORK-UNAVAILABLE',
      `框架 "${params.framework}" 的 watch 适配未就绪；当前支持：${AVAILABLE_FRAMEWORKS.join(', ')}`,
    );
  }
  const write = params.write === true;
  if (write && !params.outputDir) {
    throw new WatchError('FDT-WATCH-MISSING-OUTPUT', 'write=true 时必须提供 outputDir');
  }
  if (!write && params.outputDir) {
    throw new WatchError('FDT-WATCH-OUTPUT-WITHOUT-WRITE', 'write=false 时不允许传 outputDir（MCP 默认不落盘）');
  }
  const pollIntervalMs = params.pollIntervalMs ?? WATCH_LIMITS.defaultPollIntervalMs;
  if (
    !Number.isInteger(pollIntervalMs) ||
    pollIntervalMs < WATCH_LIMITS.minPollIntervalMs ||
    pollIntervalMs > WATCH_LIMITS.maxPollIntervalMs
  ) {
    // 间隔范围非冻结业务错误码（MCP 层由 zod min/max 拒绝），内部调用以 RangeError 兜底
    throw new RangeError(
      `pollIntervalMs 必须在 ${WATCH_LIMITS.minPollIntervalMs}~${WATCH_LIMITS.maxPollIntervalMs} 之间`,
    );
  }
  return { ...params, write, pollIntervalMs };
}

export interface WatchStoreOptions {
  idGenerator?: () => string;
  now?: () => number;
  maxSessionsPerClient?: number;
}

/**
 * Watch 会话表（进程内单例由 MCP server 持有；测试直接 new）。
 */
export class WatchStore {
  private readonly sessions = new Map<string, WatchSession>();
  private readonly idGenerator: () => string;
  private readonly now: () => number;
  private readonly maxSessions: number;

  constructor(options: WatchStoreOptions = {}) {
    this.idGenerator = options.idGenerator ?? (() => `w_${randomUUID()}`);
    this.now = options.now ?? Date.now;
    this.maxSessions = options.maxSessionsPerClient ?? WATCH_LIMITS.maxSessionsPerClient;
  }

  /**
   * 启动（或幂等复用）会话。
   *
   * @returns 会话与 existing 标记（true=复用既有，未建立新轮询）
   */
  start(rawParams: WatchStartParams): { session: WatchSession; existing: boolean } {
    const params = validateWatchParams(rawParams);
    const existing = this.findByIdentity(params.clientId, params.fileKey, params.nodeId, params.framework);
    if (existing) return { session: existing, existing: true };

    const activeCount = this.list(params.clientId).filter((s) => s.state !== 'stopped').length;
    if (activeCount >= this.maxSessions) {
      throw new WatchError(
        'FDT-WATCH-TOO-MANY-SESSIONS',
        `单个客户端最多 ${this.maxSessions} 个并发 watch 会话；请先 stop 无用会话`,
      );
    }

    const session: WatchSession = {
      sessionId: this.idGenerator(),
      clientId: params.clientId,
      fileKey: params.fileKey,
      nodeId: params.nodeId,
      framework: params.framework,
      state: 'running',
      pollIntervalMs: params.pollIntervalMs,
      write: params.write,
      outputDir: params.outputDir,
      styleFormat: params.styleFormat,
      vueVersion: params.vueVersion,
      componentName: params.componentName,
      startedAt: this.now(),
      changeCount: 0,
    };
    this.sessions.set(session.sessionId, session);
    return { session, existing: false };
  }

  /** 停止会话（幂等；跨 client/未知 id 返回 null，不抛错） */
  stop(sessionId: string, clientId: string): WatchSession | null {
    const session = this.sessions.get(sessionId);
    if (!session || session.clientId !== clientId) return null;
    session.state = 'stopped';
    return session;
  }

  /** 取单个会话（跨 client 视为不存在） */
  get(sessionId: string, clientId: string): WatchSession | null {
    const session = this.sessions.get(sessionId);
    if (!session || session.clientId !== clientId) return null;
    return session;
  }

  /**
   * 查状态。传 sessionId：未知 id 抛 SESSION-NOT-FOUND；
   * 不传：返回该 client 全部会话。
   */
  status(sessionId: string | undefined, clientId: string): WatchSession[] {
    if (sessionId === undefined) return this.list(clientId);
    const session = this.get(sessionId, clientId);
    if (!session) {
      throw new WatchError('FDT-WATCH-SESSION-NOT-FOUND', `会话 ${sessionId} 不存在或不属于当前客户端`);
    }
    return [session];
  }

  /** 列出某 client 的全部会话 */
  list(clientId: string): WatchSession[] {
    return [...this.sessions.values()].filter((s) => s.clientId === clientId);
  }

  /** 列出全部会话（进程级清理/诊断用） */
  listAll(): WatchSession[] {
    return [...this.sessions.values()];
  }

  markBackoff(sessionId: string, clientId: string, error: string): void {
    const s = this.get(sessionId, clientId);
    if (!s) return;
    s.state = 'backoff';
    s.lastError = error;
  }

  markRunning(sessionId: string, clientId: string): void {
    const s = this.get(sessionId, clientId);
    if (!s) return;
    s.state = 'running';
    s.lastError = undefined;
  }

  markError(sessionId: string, clientId: string, error: string): void {
    const s = this.get(sessionId, clientId);
    if (!s) return;
    s.state = 'error';
    s.lastError = error;
  }

  recordChange(sessionId: string, clientId: string, changedAt: number): void {
    const s = this.get(sessionId, clientId);
    if (!s) return;
    s.changeCount += 1;
    s.lastChangedAt = changedAt;
  }

  /** 清空全部会话（disconnect / SIGTERM 钩子，WBS-P1-25） */
  dispose(): void {
    this.sessions.clear();
  }

  private findByIdentity(
    clientId: string,
    fileKey: string,
    nodeId: string,
    framework: WatchFramework,
  ): WatchSession | undefined {
    return [...this.sessions.values()].find(
      (s) =>
        s.clientId === clientId &&
        s.fileKey === fileKey &&
        s.nodeId === nodeId &&
        s.framework === framework &&
        s.state !== 'stopped',
    );
  }
}
