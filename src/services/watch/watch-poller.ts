/**
 * Watch 轮询状态机（WBS-P1-22）
 *
 * 两级变更检测的第一级（粗筛）：探针只拉 `GET /v1/files/:key?depth=1`
 * 的 `lastModified` / `version`（调用方必须以 cachePolicy:'bypass' 请求，
 * 不走 latest 缓存键），签名不变则不拉节点树。
 *
 * 本模块为**可注入时钟的纯状态机**：每次 {@link WatchPoller.tick} 是一个轮询周期，
 * 退避窗口内 tick 直接跳过；真实定时器由 {@link createPollingLoop} 递归调度，
 * 使退避延迟生效（而非固定 setInterval）。
 *
 * @module
 */

/** 粗筛探针结果（由 MCP 层用 FigmaClient 实现） */
export type ProbeResult =
  | { kind: 'ok'; lastModified: string; version: string | null }
  | { kind: 'rate-limited'; retryAfterMs?: number };

export interface ProbeFn {
  (): Promise<ProbeResult>;
}

export interface WatchPollerOptions {
  /** 正常轮询间隔（ms），默认 5000（≈720 req/h） */
  intervalMs: number;
  /** 粗筛探针 */
  probe: ProbeFn;
  /** 签名变更回调（第二级：调用方此时才拉节点树并重新生成） */
  onChange: (snapshot: { lastModified: string; version: string | null }) => void | Promise<void>;
  /** 状态变化通知（running/backoff），可选 */
  onStateChange?: (state: 'running' | 'backoff', detail?: string) => void;
  now?: () => number;
  /** 退避初始（10s）/倍率（2）/封顶（120s），与 ROADMAP 决策 7 一致 */
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}

export class WatchPoller {
  state: 'running' | 'backoff' = 'running';
  backoffMs = 0;
  private consecutiveRateLimits = 0;
  private lastSignature: string | null = null;
  private nextEligibleAt: number;
  private readonly now: () => number;
  private readonly base: number;
  private readonly max: number;

  constructor(private readonly opts: WatchPollerOptions) {
    this.now = opts.now ?? Date.now;
    this.base = Math.max(1, opts.baseBackoffMs ?? 10_000);
    this.max = Math.max(this.base, opts.maxBackoffMs ?? 120_000);
    // 构造即允许立即首次探针
    this.nextEligibleAt = 0;
  }

  /** 调度器下次 tick 的延迟（running=interval，backoff=剩余退避时间） */
  nextDelayMs(): number {
    const delay = this.state !== 'backoff' ? this.opts.intervalMs : this.nextEligibleAt - this.now();
    return Math.max(1, Number.isFinite(delay) ? delay : 1);
  }

  /**
   * 执行一个轮询周期。退避窗口未到直接返回（不探针、不报错）。
   */
  async tick(): Promise<void> {
    if (this.now() < this.nextEligibleAt) return;

    let result: ProbeResult;
    try {
      result = await this.opts.probe();
    } catch (error) {
      // 网络异常按 429 同口径退避（失败不死循环），状态记 backoff
      this.enterBackoff(error instanceof Error ? error.message : String(error));
      return;
    }

    if (result.kind === 'rate-limited') {
      this.enterBackoff('HTTP 429 rate limited', result.retryAfterMs);
      return;
    }

    // 200：无论之前是否在退避，都恢复 running
    if (this.state === 'backoff') {
      this.state = 'running';
      this.backoffMs = 0;
      this.consecutiveRateLimits = 0;
      this.opts.onStateChange?.('running');
    }

    const signature = `${result.lastModified}#${result.version ?? ''}`;
    if (this.lastSignature !== null && signature !== this.lastSignature) {
      try {
        await this.opts.onChange({ lastModified: result.lastModified, version: result.version });
      } catch (error) {
        this.enterBackoff(error instanceof Error ? error.message : String(error));
        return;
      }
    }
    this.lastSignature = signature;
  }
  private enterBackoff(detail: string, retryAfterMs?: number): void {
    this.consecutiveRateLimits += 1;
    // 指数：base * 2^(n-1)，封顶 max；服务端给 Retry-After 时优先采用（仍受封顶约束）
    const exponential = this.base * 2 ** (this.consecutiveRateLimits - 1);
    const requested = retryAfterMs !== undefined && Number.isFinite(retryAfterMs) && retryAfterMs >= 0
      ? retryAfterMs
      : exponential;
    this.backoffMs = Math.min(this.max, Math.max(1, requested));
    this.nextEligibleAt = this.now() + this.backoffMs;
    this.state = 'backoff';
    this.opts.onStateChange?.('backoff', detail);
  }
}

export type TimerHandle = ReturnType<typeof setTimeout> | number;

export interface SchedulerLike {
  setTimeout: (fn: () => void, ms: number) => TimerHandle;
  clearTimeout: (handle: TimerHandle) => void;
}

/**
 * 递归调度循环：每次 tick 完成后按 nextDelayMs() 安排下一次，
 * 使 backoff 延迟自然生效；返回控制器，stop 后无残留定时器。
 */
export function createPollingLoop(
  poller: WatchPoller,
  scheduler: SchedulerLike = { setTimeout, clearTimeout },
): { stop: () => void } {
  let stopped = false;
  let handle: TimerHandle | undefined;

  const scheduleNext = () => {
    if (stopped) return;
    handle = scheduler.setTimeout(() => {
      void Promise.resolve()
        .then(() => poller.tick())
        .catch(() => undefined)
        .finally(scheduleNext);
    }, poller.nextDelayMs());
  };
  scheduleNext();

  return {
    stop() {
      stopped = true;
      if (handle !== undefined) scheduler.clearTimeout(handle);
    },
  };
}
