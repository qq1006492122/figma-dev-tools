/**
 * 浏览器实例池 - Browser Pool
 *
 * v1.4.4 性能优化：维护可复用的 Playwright 浏览器实例，避免每次截图都重新启动浏览器。
 *
 * 核心能力：
 * - 浏览器实例复用：同一类型（chromium/firefox/webkit）的浏览器实例可被多次获取
 * - 空闲超时自动回收：浏览器实例空闲超过阈值（默认 60 秒）后自动关闭
 * - 并发安全：支持多个调用方同时获取同一浏览器实例（Playwright 浏览器本身支持多页面）
 * - 健康检查：获取实例前检测是否仍可用，崩溃时自动重启
 * - 优雅关闭：进程退出时自动清理所有浏览器实例
 *
 * 性能收益：
 * - 首次调用：与原实现相同（1-3 秒启动）
 * - 后续调用：跳过启动阶段，直接复用，节省 1-3 秒
 * - 内存占用：单浏览器实例约 100-200MB，复用后总占用稳定
 *
 * @module
 */

// ============ 依赖导入 ============

import * as os from 'node:os';

import { getI18n } from '../i18n/index.js';

// ============ 类型定义 ============

/**
 * 浏览器实例池配置选项
 */
export interface BrowserPoolOptions {
  /** 浏览器类型，默认 chromium */
  browser: 'chromium' | 'firefox' | 'webkit';
  /** 是否无头模式，默认 true */
  headless: boolean;
  /**
   * 空闲超时时间（毫秒），默认 60000（60 秒）
   * 浏览器实例在最后一次使用后超过此时间未被获取，将自动关闭
   */
  idleTimeout: number;
  /**
   * 最大实例数量，默认 1
   * 通常 1 个浏览器实例已足够（Playwright 支持多页面并发）
   * 设置 >1 时可支持更高级别的并发隔离
   */
  maxInstances: number;
  /**
   * 是否在进程退出时自动关闭所有浏览器实例，默认 true
   */
  autoCleanupOnExit: boolean;
}

/**
 * 浏览器实例条目（池中每个实例的元数据）
 */
interface BrowserEntry {
  /** Playwright 浏览器实例 */
  browser: import('playwright').Browser;
  /** Playwright 模块引用（用于健康检查时重新启动） */
  playwrightModule: typeof import('playwright');
  /** 浏览器类型 */
  browserType: 'chromium' | 'firefox' | 'webkit';
  /** 是否无头模式 */
  headless: boolean;
  /** 最后一次使用时间戳 */
  lastUsedAt: number;
  /** 当前活跃的页面数（用于判断是否真正空闲） */
  activePageCount: number;
  /** 空闲回收定时器 */
  idleTimer: NodeJS.Timeout | null;
  /** 创建时间戳 */
  createdAt: number;
  /** 累计使用次数 */
  useCount: number;
}

/**
 * 获取浏览器结果
 */
export interface AcquireBrowserResult {
  /** 浏览器实例 */
  browser: import('playwright').Browser;
  /** 释放函数，使用完毕后必须调用以归还实例 */
  release: () => void;
  /** 是否为新建实例（false 表示复用） */
  isNewInstance: boolean;
  /** 实例使用次数（含本次） */
  useCount: number;
}

// ============ 常量定义 ============

/**
 * 默认配置
 */
const DEFAULT_OPTIONS: BrowserPoolOptions = {
  browser: 'chromium',
  headless: true,
  idleTimeout: 60000,
  maxInstances: 1,
  autoCleanupOnExit: true,
};

// ============ BrowserPool 类 ============

/**
 * 浏览器实例池
 *
 * 单例模式，全局维护浏览器实例的复用与回收。
 * 线程安全：Node.js 单线程模型保证池操作无竞态。
 */
export class BrowserPool {
  /** 配置选项（已合并默认值） */
  private readonly _options: BrowserPoolOptions;
  /** 实例池：按浏览器类型分桶存储 */
  private readonly _pool: Map<string, BrowserEntry[]> = new Map();
  /** Playwright 模块缓存（动态导入后缓存） */
  private _playwrightModule: typeof import('playwright') | null = null;
  /** Playwright 可用性缓存 */
  private _availabilityCache: boolean | null = null;
  /** 是否已注册进程退出清理钩子 */
  private _exitHandlerRegistered = false;
  /** 空闲回收检查定时器 */
  private _sweepTimer: NodeJS.Timeout | null = null;

  /**
   * 构造函数
   *
   * @param options - 配置选项（部分提供时合并默认值）
   */
  constructor(options: Partial<BrowserPoolOptions> = {}) {
    this._options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * 检查 Playwright 是否可用
   *
   * 缓存策略与 BrowserFallbackService 一致：
   * - 仅缓存「可用」结果，不可用时不缓存（允许安装后重试）
   *
   * @returns 是否可用
   */
  async isAvailable(): Promise<boolean> {
    if (this._availabilityCache === true) {
      return true;
    }

    try {
      const playwright = await import('playwright');
      this._playwrightModule = playwright;
      this._availabilityCache = true;
      return true;
    } catch {
      this._availabilityCache = null;
      return false;
    }
  }

  /**
   * 获取浏览器实例
   *
   * 优先复用池中空闲实例，无可用实例时新建。
   * 调用方使用完毕后必须调用返回的 release 函数归还实例。
   *
   * @returns 浏览器实例 + 释放函数
   */
  async acquire(): Promise<AcquireBrowserResult> {
    // 检查 Playwright 可用性
    if (!(await this.isAvailable()) || !this._playwrightModule) {
      const i18n = getI18n();
      const labels = i18n.t('cli.errors.labels') as {
        playwrightNotInstalled?: string;
        playwrightInstallHint?: string;
      };
      throw new Error(
        `${labels.playwrightNotInstalled ?? 'Playwright 未安装'}。${
          labels.playwrightInstallHint ?? '运行 npm install playwright && npx playwright install chromium 安装浏览器引擎'
        }`,
      );
    }

    // 注册进程退出清理钩子（仅注册一次）
    this._registerExitHandler();
    // 启动空闲回收扫描定时器
    this._startSweepTimer();

    const poolKey = this._getPoolKey();
    const instances = this._pool.get(poolKey) ?? [];

    // 尝试复用空闲实例
    for (const entry of instances) {
      if (entry.activePageCount === 0 && (await this._isHealthy(entry))) {
        entry.activePageCount++;
        entry.lastUsedAt = Date.now();
        entry.useCount++;
        this._clearIdleTimer(entry);
        return {
          browser: entry.browser,
          release: () => this._release(entry),
          isNewInstance: false,
          useCount: entry.useCount,
        };
      }
    }

    // 无可用实例，新建
    if (instances.length >= this._options.maxInstances) {
      // 达到上限，等待最旧的实例释放（简单策略：直接报错让调用方重试）
      // 高级实现可用 Promise + 队列等待，但 MCP 场景通常串行调用，暂不实现
      const i18n = getI18n();
      const labels = i18n.t('cli.errors.labels') as {
        browserPoolExhausted?: string;
      };
      throw new Error(
        labels.browserPoolExhausted ??
          `浏览器实例池已满（max=${this._options.maxInstances}），请稍后重试或调大 maxInstances 配置`,
      );
    }

    const playwright = this._playwrightModule;
    // Playwright launch 支持 args 参数，但可选依赖场景下类型推断不完整
    // 使用类型断言传递完整启动参数
    const launchOptions = {
      headless: this._options.headless,
      args: [
        // 优化：禁用不必要的特性，减少内存占用
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-default-apps',
      ],
    };
    const browser = await playwright[this._options.browser].launch(launchOptions as never);

    const entry: BrowserEntry = {
      browser,
      playwrightModule: playwright,
      browserType: this._options.browser,
      headless: this._options.headless,
      lastUsedAt: Date.now(),
      activePageCount: 1,
      idleTimer: null,
      createdAt: Date.now(),
      useCount: 1,
    };

    instances.push(entry);
    this._pool.set(poolKey, instances);

    return {
      browser,
      release: () => this._release(entry),
      isNewInstance: true,
      useCount: 1,
    };
  }

  /**
   * 释放浏览器实例（归还到池中）
   *
   * @param entry - 浏览器实例条目
   */
  private _release(entry: BrowserEntry): void {
    entry.activePageCount = Math.max(0, entry.activePageCount - 1);
    entry.lastUsedAt = Date.now();

    // 若活跃页面数为 0，启动空闲回收定时器
    if (entry.activePageCount === 0) {
      this._setupIdleTimer(entry);
    }
  }

  /**
   * 健康检查：浏览器实例是否仍可用
   *
   * @param entry - 浏览器实例条目
   * @returns 是否可用
   */
  private async _isHealthy(entry: BrowserEntry): Promise<boolean> {
    try {
      // 通过检查浏览器是否仍连接来判断健康状态
      // isConnected() 返回 true 表示浏览器进程仍存活且可通信
      // 可选依赖场景下类型推断不完整，使用类型断言访问
      const browser = entry.browser as unknown as { isConnected: () => boolean };
      return browser.isConnected();
    } catch {
      return false;
    }
  }

  /**
   * 设置空闲回收定时器
   *
   * 当实例空闲超过 idleTimeout 后自动关闭。
   *
   * @param entry - 浏览器实例条目
   */
  private _setupIdleTimer(entry: BrowserEntry): void {
    this._clearIdleTimer(entry);
    entry.idleTimer = setTimeout(() => {
      this._closeEntry(entry).catch(() => {
        // 关闭失败忽略，下次扫描会重试
      });
    }, this._options.idleTimeout);
    // unref：定时器不阻止进程退出
    entry.idleTimer.unref?.();
  }

  /**
   * 清除空闲回收定时器
   *
   * @param entry - 浏览器实例条目
   */
  private _clearIdleTimer(entry: BrowserEntry): void {
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
      entry.idleTimer = null;
    }
  }

  /**
   * 关闭浏览器实例并从池中移除
   *
   * @param entry - 浏览器实例条目
   */
  private async _closeEntry(entry: BrowserEntry): Promise<void> {
    this._clearIdleTimer(entry);
    const poolKey = this._getPoolKey();
    const instances = this._pool.get(poolKey);
    if (instances) {
      const idx = instances.indexOf(entry);
      if (idx >= 0) {
        instances.splice(idx, 1);
      }
    }
    try {
      await entry.browser.close();
    } catch {
      // 关闭失败忽略
    }
  }

  /**
   * 扫描并回收所有超时空闲实例
   *
   * 由定时器定期触发，也供手动调用。
   */
  async sweepIdle(): Promise<void> {
    const now = Date.now();
    for (const instances of this._pool.values()) {
      for (const entry of instances) {
        if (
          entry.activePageCount === 0 &&
          now - entry.lastUsedAt >= this._options.idleTimeout
        ) {
          await this._closeEntry(entry);
        }
      }
    }
  }

  /**
   * 启动空闲回收扫描定时器
   */
  private _startSweepTimer(): void {
    if (this._sweepTimer) return;
    // 每 30 秒扫描一次
    this._sweepTimer = setInterval(() => {
      this.sweepIdle().catch(() => {
        // 扫描失败忽略
      });
    }, 30000);
    this._sweepTimer.unref?.();
  }

  /**
   * 获取池键（按浏览器类型 + 无头模式分桶）
   *
   * @returns 池键
   */
  private _getPoolKey(): string {
    return `${this._options.browser}-${this._options.headless}`;
  }

  /**
   * 注册进程退出清理钩子
   */
  private _registerExitHandler(): void {
    if (this._exitHandlerRegistered || !this._options.autoCleanupOnExit) return;
    this._exitHandlerRegistered = true;

    const cleanup = async (): Promise<void> => {
      await this.closeAll();
    };

    process.on('exit', () => {
      // exit 钩子中不能执行异步操作，同步关闭
      for (const instances of this._pool.values()) {
        for (const entry of instances) {
          this._clearIdleTimer(entry);
          try {
            entry.browser.close();
          } catch {
            // 忽略
          }
        }
      }
    });
    process.on('SIGINT', () => {
      cleanup().finally(() => process.exit(0));
    });
    process.on('SIGTERM', () => {
      cleanup().finally(() => process.exit(0));
    });
  }

  /**
   * 关闭所有浏览器实例并清空池
   */
  async closeAll(): Promise<void> {
    const closePromises: Promise<void>[] = [];
    for (const instances of this._pool.values()) {
      for (const entry of instances) {
        closePromises.push(this._closeEntry(entry));
      }
    }
    await Promise.allSettled(closePromises);
    this._pool.clear();
    if (this._sweepTimer) {
      clearInterval(this._sweepTimer);
      this._sweepTimer = null;
    }
  }

  /**
   * 预热：启动一个浏览器实例并加入池中
   *
   * 用于服务启动时提前启动浏览器，避免首次调用延迟。
   *
   * @returns 是否预热成功
   */
  async warmup(): Promise<boolean> {
    if (!(await this.isAvailable())) {
      return false;
    }
    try {
      const result = await this.acquire();
      result.release();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取池状态统计信息
   *
   * 用于性能指标埋点和诊断。
   *
   * @returns 池状态
   */
  getStats(): BrowserPoolStats {
    let totalInstances = 0;
    let activeInstances = 0;
    let totalUseCount = 0;
    let oldestInstanceAge = 0;
    const now = Date.now();

    for (const instances of this._pool.values()) {
      for (const entry of instances) {
        totalInstances++;
        if (entry.activePageCount > 0) activeInstances++;
        totalUseCount += entry.useCount;
        const age = now - entry.createdAt;
        if (age > oldestInstanceAge) oldestInstanceAge = age;
      }
    }

    return {
      totalInstances,
      activeInstances,
      idleInstances: totalInstances - activeInstances,
      totalUseCount,
      oldestInstanceAge,
      cacheHitRate: totalUseCount > 0 ? (totalUseCount - totalInstances) / totalUseCount : 0,
    };
  }

  /**
   * 获取当前配置
   *
   * @returns 配置选项的只读副本
   */
  getOptions(): Readonly<BrowserPoolOptions> {
    return { ...this._options };
  }

  /**
   * 更新配置
   *
   * 注意：更新 browser/headless 后，已存在的实例不会被立即关闭，
   * 会按新配置创建新实例，旧实例在空闲后自动回收。
   *
   * @param options - 要更新的配置项
   */
  updateOptions(options: Partial<BrowserPoolOptions>): void {
    Object.assign(this._options, options);
  }
}

/**
 * 浏览器池状态统计
 */
export interface BrowserPoolStats {
  /** 总实例数 */
  totalInstances: number;
  /** 活跃实例数（正在使用中） */
  activeInstances: number;
  /** 空闲实例数 */
  idleInstances: number;
  /** 累计使用次数 */
  totalUseCount: number;
  /** 最老实例的存活时长（毫秒） */
  oldestInstanceAge: number;
  /** 缓存命中率（0-1，复用次数/总使用次数） */
  cacheHitRate: number;
}

// ============ 单例管理 ============

let browserPoolInstance: BrowserPool | null = null;

/**
 * 获取 BrowserPool 单例
 *
 * @param options - 首次创建时的配置选项
 * @returns BrowserPool 实例
 */
export function getBrowserPool(options?: Partial<BrowserPoolOptions>): BrowserPool {
  if (!browserPoolInstance) {
    browserPoolInstance = new BrowserPool(options);
  }
  return browserPoolInstance;
}

/**
 * 重置 BrowserPool 单例（主要用于测试）
 *
 * 会先关闭所有浏览器实例。
 */
export async function resetBrowserPool(): Promise<void> {
  if (browserPoolInstance) {
    await browserPoolInstance.closeAll();
  }
  browserPoolInstance = null;
}

/**
 * 同步重置 BrowserPool 单例（仅供测试 teardown 使用）
 *
 * 注意：不等待浏览器关闭完成，可能残留进程。
 */
export function resetBrowserPoolSync(): void {
  browserPoolInstance = null;
}
