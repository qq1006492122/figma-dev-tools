/**
 * Figma REST API 客户端
 *
 * 封装 Figma REST API 的所有调用，统一处理：
 * - HTTP 请求认证（Authorization: Bearer + X-Figma-Token 双保险）
 * - 错误状态码映射为友好中文消息
 * - 响应数据类型转换
 * - 节点树遍历工具方法
 *
 * API 版本：v1
 * 官方文档：https://www.figma.com/developers/api
 */

// ============ 依赖导入 ============

import {
  create as axiosCreate,
  type AxiosInstance,
  type AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';

import type {
  FigmaFileResponse,
  FigmaVariablesResponse,
  FigmaNode,
  FigmaComponent,
  FigmaStyle,
  FigmaPaint,
} from '../types.js';
import { FigmaApiError, type ErrorCode } from '../utils/errors.js';
import { getI18n } from '../i18n/index.js';
import { FigmaCache } from './cache.js';
import { buildRequestAgent, loadCustomCaConfig } from './tls-agent.js';

// ============ 类型定义 ============

/**
 * 重试配置
 */
export interface RetryConfig {
  /** 最大重试次数，默认 3 */
  maxRetries?: number;
  /** 初始重试延迟（毫秒），默认 1000 */
  initialDelayMs?: number;
  /** 重试的 HTTP 状态码，默认 [408, 429, 500, 502, 503, 504] */
  retryableStatusCodes?: number[];
}

/**
 * 速率限制配置
 */
export interface RateLimitConfig {
  /** 最小请求间隔（毫秒），默认 100 */
  minIntervalMs?: number;
  /** 是否自动根据 RateLimit headers 调整 */
  autoThrottle?: boolean;
}

/**
 * 代理配置
 */
export interface ProxyConfig {
  /** 代理服务器地址 */
  host: string;
  /** 代理端口 */
  port: number;
  /** 代理协议，默认 https */
  protocol?: 'http' | 'https';
  /** 代理认证用户名 */
  username?: string;
  /** 代理认证密码 */
  password?: string;
}

/**
 * SSL 配置
 */
export interface SslConfig {
  /** CA 证书路径，用于企业自签名证书 */
  caCertPath?: string;
  /** 是否跳过 SSL 证书验证（不推荐，仅用于调试） */
  rejectUnauthorized?: boolean;
}

/**
 * Figma API 客户端配置选项
 */
export interface FigmaClientConfig {
  /** Figma Personal Access Token，从 https://www.figma.com/settings 获取 */
  accessToken: string;
  /** API 版本号，默认 v1 */
  apiVersion?: string;
  /** 请求超时时间（毫秒），默认 30000 */
  timeout?: number;
  /** 自定义 API Base URL，用于企业版或反向代理场景 */
  baseURL?: string;
  /** 代理配置，未设置则自动检测环境变量 */
  proxy?: ProxyConfig | false;
  /** SSL 配置 */
  ssl?: SslConfig;
  /** 重试配置 */
  retry?: RetryConfig;
  /** 速率限制配置 */
  rateLimit?: RateLimitConfig;
  /** 缓存实例，不传则不使用缓存 */
  cache?: FigmaCache;
  /** 缓存 TTL（毫秒），默认 10 分钟 */
  cacheTTL?: number;
  /** 备用 Token 列表。当前 Token 遇到 401/Token 类 403 时会自动轮换。 */
  tokens?: string[];
  /** 是否启用多 Token 自动轮换，默认 true */
  enableTokenRotation?: boolean;
  /** 鉴权、权限、付费墙或网络异常时是否允许回退到陈旧缓存，默认 true */
  staleCacheFallback?: boolean;
  /** 陈旧缓存最大可接受年龄（毫秒），默认 7 天 */
  staleCacheMaxAgeMs?: number;
}

/**
 * 速率限制状态
 */
interface RateLimitState {
  /** 剩余请求数 */
  remaining: number;
  /** 重置时间戳（毫秒） */
  resetAt: number;
  /** 上次请求时间戳 */
  lastRequestAt: number;
}

/**
 * 请求元数据（用于重试计数）
 */
export interface NetworkFailureDetail {
  code: 'NETWORK_ERROR' | 'TIMEOUT_ERROR' | 'PROXY_ERROR' | 'TLS_ERROR' | 'DNS_ERROR';
  message: string;
  category: 'network' | 'timeout' | 'proxy' | 'tls' | 'dns';
  retriable: boolean;
  nextAction: string;
}

export function classifyNetworkFailure(error: Error & { code?: string }): NetworkFailureDetail {
  const code = error.code ?? '';
  const message = error.message || code || 'network failure';
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || /timeout/i.test(message)) return { code: 'TIMEOUT_ERROR', category: 'timeout', message, retriable: true, nextAction: '检查网络延迟或增大 timeout' };
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || /dns/i.test(message)) return { code: 'DNS_ERROR', category: 'dns', message, retriable: true, nextAction: '检查 DNS 和目标域名解析' };
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET' || /proxy|ECONNREFUSED/i.test(message)) return { code: 'PROXY_ERROR', category: 'proxy', message, retriable: true, nextAction: '检查 HTTP_PROXY/HTTPS_PROXY/NO_PROXY 或改用直连' };
  if (code.startsWith('ERR_TLS') || code.startsWith('CERT_') || /certificate|tls|ssl/i.test(message)) return { code: 'TLS_ERROR', category: 'tls', message, retriable: false, nextAction: '检查系统证书、企业 CA 或 ssl.caCertPath' };
  return { code: 'NETWORK_ERROR', category: 'network', message, retriable: true, nextAction: '检查网络连接和代理设置' };
}

interface RequestMetadata {
  retryCount?: number;
  authRetryCount?: number;
}

/**
 * HTTP 失败分类结果
 */
interface HttpFailureClassification {
  code: ErrorCode;
  reason: string;
  solution: string;
  retriable: boolean;
  tokenRecoverable: boolean;
  staleCacheRecoverable: boolean;
}

/**
 * Figma API 错误响应结构
 */
export interface FigmaApiErrorResponse {
  /** HTTP 状态码 */
  status: number;
  /** 错误消息 */
  message: string;
  /** Figma 原始错误描述 */
  err?: string;
}

/**
 * Figma `/v1/me` 响应结构
 */
export interface FigmaMeResponse {
  id: string;
  email: string;
  handle: string;
  img_url: string;
}

/**
 * getFileNodes 方法的查询选项
 */
export interface GetFileNodesOptions {
  /** 要获取的节点 ID 列表，不传则返回文件中所有节点 */
  ids?: string[];
  /**
   * 返回节点树的深度
   * - -1：返回完整深度（默认）
   * - 0：仅返回根节点
   * - N：返回 N 层子节点
   */
  depth?: number;
  /** 几何数据输出格式，设为 'paths' 时返回矢量路径数据 */
  geometry?: 'paths';
  /** 插件数据返回级别 */
  plugin_data?: 'none' | 'shared' | 'all';
}

// ============ 常量定义 ============

/** 默认超时时间：30秒 */
const DEFAULT_TIMEOUT = 30_000;

/** 默认 API Base URL */
const DEFAULT_BASE_URL = 'https://api.figma.com';

/** 默认最大重试次数 */
const DEFAULT_MAX_RETRIES = 3;

/** 默认初始重试延迟（毫秒） */
const DEFAULT_INITIAL_DELAY_MS = 1_000;

/** 可重试的 HTTP 状态码 */
const DEFAULT_RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

/** 默认最小请求间隔（毫秒） */
const DEFAULT_MIN_INTERVAL_MS = 100;

/** HTTPS 协议前缀 */
const HTTPS_PROTOCOL = 'https:';

/** 本地地址（允许 HTTP） */
const LOCALHOST_ADDRESSES = new Set(['localhost', '127.0.0.1', '::1']);

/** getImages 单批最大节点数（防止 URL 过长导致 HTTP 414 错误） */
const GET_IMAGES_BATCH_SIZE = 50;

/** 陈旧缓存默认最大保留时间：7 天 */
const DEFAULT_STALE_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

// ============ FigmaClient 类 ============

/**
 * Figma REST API 客户端类
 *
 * 提供对 Figma REST API 的完整封装，方法分类：
 *
 * **文件/节点操作：**
 * - {@link getFile} 获取文件信息
 * - {@link getFileNodes} 批量获取节点
 * - {@link getNode} 获取单个节点
 *
 * **设计资源：**
 * - {@link getComponents} 获取文件中的组件
 * - {@link getComponentSets} 获取组件集
 * - {@link getStyles} 获取文件中的样式
 * - {@link getVariables} 获取本地变量（Variables API）
 *
 * **图片导出：**
 * - {@link getImages} 批量获取节点导出图片 URL
 * - {@link getImageFills} 获取图片填充资源映射
 * - {@link downloadImage} 下载图片到 Buffer
 *
 * **遍历工具：**
 * - {@link traverseNodes} 递归遍历节点树（可中止）
 * - {@link findNodesByType} 按类型查找节点
 * - {@link findNodesByName} 按名称查找节点（支持正则）
 *
 * **便捷样式提取：**
 * - {@link getSolidFill} 获取第一个有效 SOLID 填充
 * - {@link getSolidStroke} 获取第一个有效 SOLID 描边
 */
export class FigmaClient {
  /** Axios HTTP 客户端实例（已配置认证头部和错误拦截器） */
  private readonly _client: AxiosInstance;
  /** Figma Personal Access Token */
  private _accessToken: string;
  /** 重试配置 */
  private readonly _retryConfig: Required<RetryConfig>;
  /** 速率限制配置 */
  private readonly _rateLimitConfig: Required<RateLimitConfig>;
  /** 速率限制状态 */
  private _rateLimitState: RateLimitState;
  /** 缓存统计 */
  private _requestStats: { total: number; retried: number; cached: number; staleFallback: number };
  /** 缓存实例 */
  private readonly _cache: FigmaCache | null;
  /** 缓存 TTL */
  private readonly _cacheTTL: number;
  /** 可用 Token 列表，首个为当前 Token */
  private readonly _tokens: string[];
  /** 当前 Token 在列表中的下标 */
  private _tokenIndex: number;
  /** 是否启用 Token 轮换 */
  private readonly _enableTokenRotation: boolean;
  /** 是否允许陈旧缓存兜底 */
  private readonly _staleCacheFallback: boolean;
  /** 陈旧缓存最大年龄 */
  private readonly _staleCacheMaxAgeMs: number;
  /** 同一 GET 请求的 in-flight 合并表 */
  private readonly _inflight = new Map<string, Promise<unknown>>();
  /** 429/Retry-After 全局等待截止时间 */
  private _rateLimitedUntil = 0;
  /** 上一次请求的降级警告 */
  private _lastWarning?: string;

  /**
   * 从环境变量自动检测代理配置
   */
  private _detectProxy(): ProxyConfig | false {
    const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
    const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
    const noProxy = process.env.NO_PROXY || process.env.no_proxy;

    const proxyUrl = httpsProxy || httpProxy;
    if (!proxyUrl) return false;

    // 检查 NO_PROXY 是否包含 api.figma.com
    if (noProxy) {
      const noProxySet = new Set(noProxy.split(',').map((s) => s.trim().toLowerCase()));
      if (noProxySet.has('api.figma.com') || noProxySet.has('*')) {
        return false;
      }
    }

    try {
      const url = new URL(proxyUrl);
      return {
        host: url.hostname,
        port: Number.parseInt(url.port || (url.protocol === 'https:' ? '443' : '80'), 10),
        protocol: url.protocol === 'https:' ? 'https' : 'http',
        username: url.username || undefined,
        password: url.password || undefined,
      };
    } catch {
      return false;
    }
  }

  /**
   * 检查 URL 是否为本地地址（允许 HTTP）
   */
  private _isLocalhost(url: string): boolean {
    try {
      const parsed = new URL(url);
      return LOCALHOST_ADDRESSES.has(parsed.hostname.toLowerCase());
    } catch {
      return false;
    }
  }

  /**
   * 等待指定毫秒数
   */
  private _delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 计算重试延迟（指数退避）
   */
  private _calculateRetryDelay(retryCount: number, retryAfter?: number): number {
    const maxDelayMs = 30_000;
    if (retryAfter !== undefined && Number.isFinite(retryAfter)) {
      return Math.min(Math.max(0, retryAfter * 1000), maxDelayMs);
    }
    const baseDelay = this._retryConfig.initialDelayMs;
    return Math.min(baseDelay * Math.pow(2, retryCount), maxDelayMs);
  }

  /**
   * 合并并发的同参 GET 请求，避免 Watch/批量生成触发重复请求风暴。
   * 失败也会共享同一个 rejection，随后从 in-flight 表移除。
   */
  private _coalesce<T>(key: string, request: () => Promise<T>): Promise<T> {
    const existing = this._inflight.get(key);
    if (existing) return existing as Promise<T>;

    const pending = request().finally(() => {
      if (this._inflight.get(key) === pending) this._inflight.delete(key);
    });
    this._inflight.set(key, pending);
    return pending;
  }

  /**
   * 更新速率限制状态（从响应 headers）
   */
  private _updateRateLimitFromHeaders(headers: Record<string, string>): void {
    const remaining = headers['x-ratelimit-remaining'];
    const reset = headers['x-ratelimit-reset'];

    if (remaining !== undefined) {
      this._rateLimitState.remaining = Number.parseInt(remaining, 10);
    }
    if (reset !== undefined) {
      // Figma 返回的是 Unix 时间戳（秒）
      this._rateLimitState.resetAt = Number.parseInt(reset, 10) * 1000;
    }
  }

  /**
   * 请求前等待（速率控制）
   */
  private async _throttle(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this._rateLimitState.lastRequestAt;
    const minInterval = this._rateLimitConfig.minIntervalMs;
    const rateLimitedDelay = Math.max(0, this._rateLimitedUntil - now);

    // 基础间隔控制
    const baseDelay = Math.max(minInterval - timeSinceLastRequest, rateLimitedDelay);
    if (baseDelay > 0) {
      await this._delay(baseDelay);
    }

    // 如果接近速率限制，增加延迟
    if (this._rateLimitConfig.autoThrottle && this._rateLimitState.remaining <= 10) {
      const timeUntilReset = this._rateLimitState.resetAt - now;
      if (timeUntilReset > 0 && this._rateLimitState.remaining > 0) {
        const safeDelay = timeUntilReset / this._rateLimitState.remaining;
        await this._delay(Math.min(safeDelay, 2_000));
      }
    }

    this._rateLimitState.lastRequestAt = Date.now();
  }

  /**
   * 判断是否应该重试
   */
  private _isRetryable(error: AxiosError<FigmaApiErrorResponse>): boolean {
    if (!error.response) {
      // 网络错误（没有响应）：仅超时/中止类错误可重试，DNS 失败/连接拒绝等不应重试
      return error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
    }
    return this._retryConfig.retryableStatusCodes.includes(error.response.status);
  }

  /**
   * 获取 Retry-After 头的值（秒）
   */
  private _getRetryAfter(error: AxiosError<FigmaApiErrorResponse>): number | undefined {
    if (!error.response?.headers) return undefined;
    const retryAfter = error.response.headers['retry-after'];
    if (!retryAfter) return undefined;

    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds);

    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) return Math.max(0, (retryAt - Date.now()) / 1000);
    return undefined;
  }

  /**
   * 规范化 Token 列表，去重并过滤空值。
   */
  private _normalizeTokens(config: FigmaClientConfig): string[] {
    const tokens = [config.accessToken, ...(config.tokens ?? [])]
      .map((token) => token?.trim())
      .filter((token): token is string => Boolean(token));
    return Array.from(new Set(tokens));
  }

  /**
   * 切换到下一个可用 Token。
   */
  private _rotateToken(requestConfig: InternalAxiosRequestConfig): boolean {
    if (!this._enableTokenRotation || this._tokens.length <= 1) return false;

    const nextIndex = (this._tokenIndex + 1) % this._tokens.length;
    if (nextIndex === this._tokenIndex) return false;

    this._tokenIndex = nextIndex;
    const nextToken = this._tokens[nextIndex]!;
    this._accessToken = nextToken;

    if (requestConfig) {
      requestConfig.headers.delete('Authorization');
      requestConfig.headers.delete('X-Figma-Token');
      if (nextToken.startsWith('figd_')) {
        requestConfig.headers.set('X-Figma-Token', nextToken);
      } else {
        requestConfig.headers.set('Authorization', `Bearer ${nextToken}`);
        requestConfig.headers.set('X-Figma-Token', nextToken);
      }
    }
    return true;
  }

  /**
   * 从 Figma 错误响应中提取可搜索的小写错误文本。
   */
  private _getResponseText(data?: FigmaApiErrorResponse): string {
    return [data?.err, data?.message].filter(Boolean).join(' ').toLowerCase();
  }

  /**
   * 根据 HTTP 状态码和响应文本细分失败原因。
   * reason/solution 从 i18n httpFailures 段落按当前语言解析，确保错误消息国际化。
   */
  private _classifyHttpFailure(status: number, data?: FigmaApiErrorResponse): HttpFailureClassification {
    const text = this._getResponseText(data);
    const has = (...keywords: string[]): boolean => keywords.some((keyword) => text.includes(keyword));

    // 从 i18n 取 HTTP 失败原因结构（按用户 GUI 选定语言解析）
    const i18n = getI18n();
    const httpFailures = i18n.t('cli.errors.httpFailures') as Record<
      string,
      Record<string, { reason: string | ((status: number) => string); solution: string }> | { reason: string | ((status: number) => string); solution: string }
    >;

    // 工具函数：按状态码 key + 子分类 key 解析 reason/solution（支持函数式 reason）
    const resolveFailure = (
      statusKey: string,
      subKey?: string,
    ): { reason: string; solution: string } => {
      const group = httpFailures[statusKey];
      if (!group) {
        return { reason: `HTTP ${status}`, solution: '' };
      }
      const entry = subKey
        ? (group as Record<string, { reason: string | ((status: number) => string); solution: string }>)[subKey]
        : (group as { reason: string | ((status: number) => string); solution: string });
      if (!entry) {
        return { reason: `HTTP ${status}`, solution: '' };
      }
      const reason = typeof entry.reason === 'function' ? entry.reason(status) : entry.reason;
      return { reason, solution: entry.solution };
    };

    if (status === 401) {
      const expired = has('expired', 'expire', 'invalid token', 'unauthorized');
      const subKey = expired ? 'expired' : 'invalid';
      const { reason, solution } = resolveFailure('status401', subKey);
      return {
        code: expired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
        reason,
        solution,
        retriable: false,
        tokenRecoverable: true,
        staleCacheRecoverable: true,
      };
    }

    if (status === 403) {
      if (has('payment', 'paid', 'seat', 'billing', 'upgrade', 'subscription', 'dev mode', 'developer mode')) {
        const { reason, solution } = resolveFailure('status403', 'payment');
        return {
          code: 'PAYMENT_REQUIRED',
          reason,
          solution,
          retriable: false,
          tokenRecoverable: false,
          staleCacheRecoverable: true,
        };
      }

      if (has('token', 'auth', 'credential', 'forbidden token')) {
        const { reason, solution } = resolveFailure('status403', 'token');
        return {
          code: 'TOKEN_INVALID',
          reason,
          solution,
          retriable: false,
          tokenRecoverable: true,
          staleCacheRecoverable: true,
        };
      }

      if (has('permission', 'access', 'not allowed', 'not found', 'file')) {
        const { reason, solution } = resolveFailure('status403', 'permission');
        return {
          code: 'FILE_PERMISSION_DENIED',
          reason,
          solution,
          retriable: false,
          tokenRecoverable: false,
          staleCacheRecoverable: true,
        };
      }

      const { reason, solution } = resolveFailure('status403', 'forbidden');
      return {
        code: 'FORBIDDEN',
        reason,
        solution,
        retriable: false,
        tokenRecoverable: false,
        staleCacheRecoverable: true,
      };
    }

    if (status === 404) {
      const { reason, solution } = resolveFailure('status404');
      return {
        code: 'FILE_NOT_FOUND',
        reason,
        solution,
        retriable: false,
        tokenRecoverable: false,
        staleCacheRecoverable: true,
      };
    }

    if (status === 429) {
      const { reason, solution } = resolveFailure('status429');
      return {
        code: 'RATE_LIMITED',
        reason,
        solution,
        retriable: true,
        tokenRecoverable: false,
        staleCacheRecoverable: true,
      };
    }

    if (status >= 500) {
      const { reason, solution } = resolveFailure('status5xx');
      return {
        code: 'SERVER_ERROR',
        reason,
        solution,
        retriable: true,
        tokenRecoverable: false,
        staleCacheRecoverable: true,
      };
    }

    const { reason: networkReason, solution: networkSolution } = resolveFailure('network');
    return {
      code: 'NETWORK_ERROR',
      reason: data?.err || data?.message || networkReason,
      solution: networkSolution,
      retriable: status === 408,
      tokenRecoverable: false,
      staleCacheRecoverable: status >= 500 || status === 408,
    };
  }

  /**
   * 构造结构化 FigmaApiError。
   */
  private _createApiError(
    status: number,
    data: FigmaApiErrorResponse | undefined,
    classification: HttpFailureClassification,
  ): FigmaApiError {
    const originalMessage = [data?.err, data?.message].filter(Boolean).join(' ');
    return new FigmaApiError(classification.code, status, {
      reason: classification.reason,
      solution: classification.solution,
      retriable: classification.retriable,
      staleCacheRecoverable: classification.staleCacheRecoverable,
      originalMessage: originalMessage || undefined,
    });
  }

  /**
   * 判断错误是否允许读取陈旧缓存。
   */
  private _canUseStaleCache(error: unknown): boolean {
    if (!this._staleCacheFallback || !this._cache) return false;
    if (error instanceof FigmaApiError) return error.staleCacheRecoverable;
    if (error instanceof Error) {
      return ['ECONNABORTED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET'].some((code) => error.message.includes(code));
    }
    return false;
  }

  /**
   * 实时请求失败时，尝试读取 7 天内的陈旧缓存作为兜底。
   */
  private async _withStaleCache<T>(cacheKey: string | null, request: () => Promise<T>): Promise<T> {
    this._lastWarning = undefined;
    try {
      return await request();
    } catch (error) {
      if (!cacheKey || !this._canUseStaleCache(error)) {
        throw error;
      }

      const stale = await this._cache?.getStale<T>(cacheKey, this._staleCacheMaxAgeMs);
      if (!stale) {
        throw error;
      }

      const ageHours = Math.round(stale.ageMs / (60 * 60 * 1000));
      const i18n = getI18n();
      const labels = i18n.t('cli.errors.labels') as {
        staleCacheWarning: (hours: number) => string;
      };
      this._lastWarning = labels.staleCacheWarning(ageHours);
      this._requestStats.staleFallback++;
      return stale.data;
    }
  }

  /**
   * 构造函数 - 初始化 Figma API 客户端
   *
   * 创建 Axios 实例并配置：
   * 1. 基础 URL 和超时设置
   * 2. 代理自动检测
   * 3. HTTPS 强制和 SSL 配置
   * 4. X-Figma-Token 认证头部
   * 5. 请求拦截器（速率控制）
   * 6. 响应拦截器（错误处理、重试、速率限制更新）
   *
   * @param config - 客户端配置选项
   * @throws {Error} 当 accessToken 为空时构造函数不会直接抛出，但后续 API 调用会返回 401
   */
  constructor(config: FigmaClientConfig) {
    this._tokens = this._normalizeTokens(config);
    this._tokenIndex = 0;
    this._accessToken = this._tokens[0] ?? config.accessToken;
    this._enableTokenRotation = config.enableTokenRotation ?? true;
    this._staleCacheFallback = config.staleCacheFallback ?? true;
    this._staleCacheMaxAgeMs = config.staleCacheMaxAgeMs ?? DEFAULT_STALE_CACHE_MAX_AGE;
    this._cache = config.cache || null;
    this._cacheTTL = config.cacheTTL ?? 10 * 60 * 1000; // 默认 10 分钟
    this._requestStats = { total: 0, retried: 0, cached: 0, staleFallback: 0 };

    // 初始化重试配置
    this._retryConfig = {
      maxRetries: config.retry?.maxRetries ?? DEFAULT_MAX_RETRIES,
      initialDelayMs: config.retry?.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS,
      retryableStatusCodes: config.retry?.retryableStatusCodes ?? DEFAULT_RETRYABLE_STATUS_CODES,
    };

    // 初始化速率限制配置
    this._rateLimitConfig = {
      minIntervalMs: config.rateLimit?.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS,
      autoThrottle: config.rateLimit?.autoThrottle ?? true,
    };

    this._rateLimitState = {
      remaining: 100,
      resetAt: Date.now() + 60_000,
      lastRequestAt: 0,
    };

    // HTTPS 强制检查（错误消息走 i18n）
    const baseURL = config.baseURL || DEFAULT_BASE_URL;
    if (!this._isLocalhost(baseURL) && !baseURL.startsWith(HTTPS_PROTOCOL)) {
      const i18n = getI18n();
      const labels = i18n.t('cli.errors.labels') as { httpsRequired: string };
      throw new Error(labels.httpsRequired);
    }

    // 代理配置 + 自定义 CA（ssl.caCertPath 或 FIGMA_CA_CERT_PATH）统一在 tls-agent 装配
    const proxyConfig = config.proxy === false ? false : config.proxy || this._detectProxy();
    // 显式 ssl.caCertPath 优先于环境变量；文件缺失/非 PEM 在此处快速抛出 i18n 错误
    const caConfig = loadCustomCaConfig({ certPath: config.ssl?.caCertPath });
    const httpsAgent = buildRequestAgent({
      proxyConfig,
      caConfig,
      rejectUnauthorized: config.ssl?.rejectUnauthorized,
    });

    // Axios 实例配置
    // Figma API 认证：
    // - figd_ 类型 Token（新 Token 格式）必须使用 X-Figma-Token 请求头，不能使用 Authorization
    // - 其他类型 Token（旧格式）使用 Authorization: Bearer 请求头
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this._accessToken.startsWith('figd_')) {
      headers['X-Figma-Token'] = this._accessToken;
    } else {
      headers['Authorization'] = `Bearer ${this._accessToken}`;
      headers['X-Figma-Token'] = this._accessToken;
    }
    const defaultHeaders: Record<string, string> = { ...headers };
    const axiosConfig: AxiosRequestConfig = {
      baseURL,
      timeout: config.timeout || DEFAULT_TIMEOUT,
      headers,
      httpsAgent,
      proxy: false, // 使用 agent 而非 axios 内置 proxy
    };

    this._client = axiosCreate(axiosConfig);
    this._client.interceptors.request.use((requestConfig: InternalAxiosRequestConfig) => {
      requestConfig.headers.set('Content-Type', defaultHeaders['Content-Type']);
      return requestConfig;
    });

    // ============ 请求拦截器 - 速率控制 ============
    this._client.interceptors.request.use(async (requestConfig: InternalAxiosRequestConfig) => {
      await this._throttle();
      this._requestStats.total++;
      return requestConfig;
    });

    // ============ 响应拦截器 - 统一处理 ============
    this._client.interceptors.response.use(
      (response) => {
        // 更新速率限制状态
        if (response.headers) {
          this._updateRateLimitFromHeaders(response.headers as Record<string, string>);
        }
        return response;
      },
      async (error: AxiosError<FigmaApiErrorResponse>) => {
        const requestConfig = error.config as (InternalAxiosRequestConfig & RequestMetadata) | undefined;

        // 更新速率限制状态（即使是错误响应）
        if (error.response?.headers) {
          this._updateRateLimitFromHeaders(error.response.headers as Record<string, string>);
        }

        if (error.response) {
          const { status, data } = error.response;
          const classification = this._classifyHttpFailure(status, data);

          // 401/Token 类 403：优先尝试下一个 Token，避免单个 Token 过期导致整次生成失败。
          if (
            requestConfig &&
            classification.tokenRecoverable &&
            (requestConfig.authRetryCount ?? 0) < Math.max(this._tokens.length - 1, 0) &&
            this._rotateToken(requestConfig)
          ) {
            requestConfig.authRetryCount = (requestConfig.authRetryCount ?? 0) + 1;
            requestConfig.retryCount = requestConfig.retryCount ?? 0;
            return this._client.request(requestConfig);
          }

          // 429/5xx/超时：按照指数退避与 Retry-After 自动重试。
          if (requestConfig && classification.retriable && this._isRetryable(error)) {
            const retryCount = requestConfig.retryCount ?? 0;
            if (retryCount < this._retryConfig.maxRetries) {
              this._requestStats.retried++;
              const retryAfter = this._getRetryAfter(error);
              const delay = this._calculateRetryDelay(retryCount, retryAfter);
              if (error.response?.status === 429) {
                this._rateLimitedUntil = Math.max(this._rateLimitedUntil, Date.now() + delay);
              }
              await this._delay(delay);
              requestConfig.retryCount = retryCount + 1;
              return this._client.request(requestConfig);
            }
          }

          throw this._createApiError(status, data, classification);
        }

        const network = classifyNetworkFailure(error as Error & { code?: string });
        throw new FigmaApiError(network.code, 0, {
          reason: network.message,
          solution: network.nextAction,
          retriable: network.retriable,
          staleCacheRecoverable: network.retriable,
        });
      },
    );
  }

  // ============ 认证相关 ============

  /**
   * 获取请求统计信息
   *
   * @returns 包含总请求数、重试次数、缓存命中数的统计对象
   */
  getRequestStats(): {
    total: number;
    retried: number;
    cached: number;
    staleFallback: number;
    retryRate: number;
    cacheHitRate: number;
  } {
    const retryRate = this._requestStats.total > 0 ? this._requestStats.retried / this._requestStats.total : 0;
    const cacheHitRate = this._requestStats.total > 0 ? this._requestStats.cached / this._requestStats.total : 0;
    return {
      ...this._requestStats,
      retryRate,
      cacheHitRate,
    };
  }

  /**
   * 获取上一次请求的降级警告。
   */
  getLastWarning(): string | undefined {
    return this._lastWarning;
  }

  /**
   * 清除降级警告，避免跨工具调用误报。
   */
  clearLastWarning(): void {
    this._lastWarning = undefined;
  }

  /**
   * 获取当前速率限制状态
   *
   * @returns 速率限制状态信息
   */
  getRateLimitState(): { remaining: number; resetAt: number; msUntilReset: number } {
    return {
      remaining: this._rateLimitState.remaining,
      resetAt: this._rateLimitState.resetAt,
      msUntilReset: Math.max(0, this._rateLimitState.resetAt - Date.now()),
    };
  }

  /**
   * 验证 Access Token 是否有效，并返回用户信息
   *
   * 通过调用 `/v1/me` 接口验证 Token 有效性。
   * Token 有效时返回用户信息，无效时抛出详细错误（含 HTTP 状态码和原因）。
   *
   * @returns Token 有效返回用户信息
   * @throws {Error} Token 无效或网络错误时抛出，包含 HTTP 状态码和具体原因
   */
  async validateToken(): Promise<FigmaMeResponse | null> {
    try {
      const response = await this._client.get<FigmaMeResponse>('/v1/me');
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError<FigmaApiErrorResponse>;
      const i18n = getI18n();
      const labels = i18n.t('cli.errors.labels') as Record<string, unknown>;

      // 如果是 HTTP 错误响应（4xx/5xx）
      if (axiosError.response) {
        const status = axiosError.response.status;
        const apiMessage = axiosError.response.data?.message || axiosError.message;

        // 详细日志：帮助诊断问题
        console.warn(`[FigmaClient] Token validation failed (HTTP ${status}): ${apiMessage}`);

        // 401/403 属于认证问题，抛出详细错误信息
        if (status === 401) {
          throw new Error((labels.tokenValidateFailed401 as (msg: string) => string)(apiMessage));
        }
        if (status === 403) {
          throw new Error((labels.tokenValidateFailed403 as (msg: string) => string)(apiMessage));
        }

        // 429 Rate Limit - 请求过于频繁
        if (status === 429) {
          throw new Error(labels.tokenValidateFailed429 as string);
        }

        // 其他 HTTP 错误（如 5xx 服务器错误）
        throw new Error((labels.tokenValidateFailedHttp as (status: number, msg: string) => string)(status, apiMessage));
      }

      // 无响应错误（网络问题、DNS 失败、超时等）
      const errorCode = axiosError.code;
      const errorMessage = axiosError.message;
      console.warn(`[FigmaClient] Token validation network error (code: ${errorCode}): ${errorMessage}`);

      // 网络类错误
      if (['ECONNABORTED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'EPIPE', 'EHOSTUNREACH'].includes(errorCode as string)) {
        throw new Error((labels.tokenValidateFailedNetwork as (msg: string) => string)(errorMessage));
      }

      // 其他未知错误
      throw new Error((labels.tokenValidateFailed as (msg: string) => string)(errorMessage));
    }
  }

  // ============ 文件/节点获取 ============

  /**
   * 获取 Figma 文件的完整信息
   *
   * 返回文件的名称、最后修改时间、缩略图、完整节点树、组件库、样式库等。
   * 注意：当 depth=-1 时，大型文件的响应可能非常大（数 MB），建议指定 depth 控制返回深度。
   *
   * @param fileKey - Figma 文件 Key（从 URL 获取：`figma.com/file/<fileKey>/...`）
   * @param version - 文件版本号（可选，不传则返回最新版本）
   * @param depth - 节点树返回深度，-1 表示全部，2 表示返回两层
   * @returns Figma 文件响应对象
   * @throws {Error} 当 fileKey 无效或无权限时抛出 Figma API 错误
   */
  async getFile(fileKey: string, version?: string, depth?: number): Promise<FigmaFileResponse> {
    const cache = this._cache;
    const cacheKey = cache ? FigmaCache.generateFileCacheKey(fileKey, version, depth) : null;

    if (cache && cacheKey) {
      const cached = await cache.get<FigmaFileResponse>(cacheKey);
      if (cached) {
        this._requestStats.cached++;
        return cached;
      }
    }

    const params: Record<string, string | number> = {};
    if (version) params.version = version;
    if (depth !== undefined) params.depth = depth;

    const response = await this._coalesce(`GET:/v1/files/${fileKey}:${version ?? ''}:${depth ?? ''}`, () =>
      this._withStaleCache(cacheKey, () => this._client.get<FigmaFileResponse>(`/v1/files/${fileKey}`, { params })),
    );

    if (cache && cacheKey) {
      await cache.set(cacheKey, response.data, this._cacheTTL);
    }

    return response.data;
  }

  /**
   * Watch 粗筛探针（WBS-P1-22）：GET /v1/files/:key?depth=1，**绕过缓存**
   * （决策 3：watch 链路不允许命中 latest 缓存键），只取 lastModified/version。
   * 429 归一化为 rate-limited 供轮询器退避；其余错误抛出由调用方处理。
   *
   * @param fileKey - Figma 文件 Key
   */
  async probeFileMeta(fileKey: string): Promise<
    | { kind: 'ok'; lastModified: string; version: string | null }
    | { kind: 'rate-limited'; retryAfterMs?: number }
  > {
    try {
      const response = await this._coalesce(`PROBE:/v1/files/${fileKey}`, () =>
        this._client.get<FigmaFileResponse>(`/v1/files/${fileKey}`, {
          params: { depth: 1, branch_data: false },
        }),
      );
      return { kind: 'ok', lastModified: response.data.lastModified, version: response.data.version ?? null };
    } catch (error) {
      const status = (error as { response?: { status?: number; headers?: { 'retry-after'?: string } } })?.response
        ?.status;
      if (status === 429) {
        const retryAfter = error as { response?: { headers?: Record<string, string | undefined> } };
        const retryAfterHeader = retryAfter.response?.headers?.['retry-after'];
        const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : undefined;
        return { kind: 'rate-limited', retryAfterMs: Number.isFinite(retryAfterMs) ? retryAfterMs : undefined };
      }
      throw error;
    }
  }

  /**
   * 批量获取文件中的特定节点
   *
   * 与 {@link getFile} 不同，此方法只返回指定 IDs 的节点，
   * 适合只需要部分节点数据的场景，可显著减少响应体积。
   *
   * @param fileKey - Figma 文件 Key
   * @param options - 节点查询选项（ids、depth、geometry 等）
   * @returns 按 nodeId 索引的节点数据映射
   */
  async getFileNodes(
    fileKey: string,
    options: GetFileNodesOptions = {},
  ): Promise<{ nodes: Record<string, { document: FigmaNode }> }> {
    const cacheKeyParts = [
      fileKey,
      (options.ids || []).sort().join(','),
      String(options.depth ?? -1),
      options.geometry || '',
      options.plugin_data || '',
    ];
    const cache = this._cache;
    const cacheKey = cache ? FigmaCache.generateApiCacheKey('nodes', ...cacheKeyParts) : null;

    if (cache && cacheKey) {
      const cached = await cache.get<{ nodes: Record<string, { document: FigmaNode }> }>(cacheKey);
      if (cached) {
        this._requestStats.cached++;
        return cached;
      }
    }

    const params: Record<string, string | number> = {};
    if (options.ids && options.ids.length > 0) {
      params.ids = options.ids.join(',');
    }
    if (options.depth !== undefined) params.depth = options.depth;
    if (options.geometry) params.geometry = options.geometry;
    if (options.plugin_data) params.plugin_data = options.plugin_data;

    const requestKey = `GET:/v1/files/${fileKey}/nodes:${JSON.stringify(params)}`;
    const response = await this._coalesce(requestKey, () =>
      this._withStaleCache(cacheKey, () =>
        this._client.get<{ nodes: Record<string, { document: FigmaNode }> }>(`/v1/files/${fileKey}/nodes`, {
          params,
        }),
      ),
    );

    if (cache && cacheKey) {
      await cache.set(cacheKey, response.data, this._cacheTTL);
    }

    return response.data;
  }

  /**
   * 获取单个节点（便捷方法）
   *
   * 封装 getFileNodes，返回单个节点或 null。
   *
   * @param fileKey - Figma 文件 Key
   * @param nodeId - 节点 ID（格式如 "1:2"、"12:34"）
   * @param depth - 返回深度
   * @returns 找到的 FigmaNode，不存在返回 null
   */
  async getNode(fileKey: string, nodeId: string, depth?: number): Promise<FigmaNode | null> {
    const result = await this.getFileNodes(fileKey, {
      ids: [nodeId],
      depth,
    });

    const nodeData = result.nodes[nodeId];
    return nodeData?.document || null;
  }

  // ============ 组件与样式 ============

  /**
   * 获取文件中所有已发布的组件
   *
   * 返回文件组件库中所有 Component 的元数据（名称、描述、key 等），
   * 不包含组件的完整节点树。
   *
   * @param fileKey - Figma 文件 Key
   * @returns 组件 key 到组件元数据的映射
   */
  async getComponents(fileKey: string): Promise<Record<string, FigmaComponent>> {
    // 使用 depth=1 只获取顶层元数据，避免加载整个文件
    const file = await this.getFile(fileKey, undefined, 1);
    return file.components || {};
  }

  /**
   * 获取文件中所有已发布的样式（填充/文本/效果）
   *
   * @param fileKey - Figma 文件 Key
   * @returns 样式 key 到样式元数据的映射
   */
  async getStyles(fileKey: string): Promise<Record<string, FigmaStyle>> {
    const file = await this.getFile(fileKey, undefined, 1);
    return file.styles || {};
  }

  /**
   * 获取文件的本地变量（Variables）
   *
   * **注意：** 这是 Figma 的内部 API（未完全公开），可能随 Figma 更新变化。
   * 包含变量集合（Collections）、变量模式（Modes）、变量值和 codeSyntax 映射。
   * 如果文件未启用 Variables 或 Token 无权限，会抛出 403/404 错误。
   *
   * @param fileKey - Figma 文件 Key
   * @returns Variables 响应（包含 collections 和 variables）
   * @throws {Error} Variables API 不可用或无权限时抛出
   */
  async getVariables(fileKey: string): Promise<FigmaVariablesResponse> {
    const cache = this._cache;
    const cacheKey = cache ? FigmaCache.generateApiCacheKey('variables', fileKey) : null;

    if (cache && cacheKey) {
      const cached = await cache.get<FigmaVariablesResponse>(cacheKey);
      if (cached) {
        this._requestStats.cached++;
        return cached;
      }
    }

    const response = await this._withStaleCache(cacheKey, () =>
      this._client.get<FigmaVariablesResponse>(`/v1/files/${fileKey}/variables/local`),
    );

    if (cache && cacheKey) {
      await cache.set(cacheKey, response.data, this._cacheTTL);
    }

    return response.data;
  }

  /**
   * 获取组件集（Component Sets）
   *
   * Component Set 是一组 Component 的容器（如按钮的 hover/pressed/disabled 状态集合）。
   *
   * @param fileKey - Figma 文件 Key
   * @returns 组件集列表（含 key、name、componentIds 等）
   */
  async getComponentSets(fileKey: string): Promise<{
    componentSets: Array<{
      key: string;
      name: string;
      description: string;
      componentIds: string[];
    }>;
  }> {
    type ComponentSetsResponse = {
      componentSets: Array<{
        key: string;
        name: string;
        description: string;
        componentIds: string[];
      }>;
    };

    const cache = this._cache;
    const cacheKey = cache ? FigmaCache.generateApiCacheKey('component-sets', fileKey) : null;
    if (cache && cacheKey) {
      const cached = await cache.get<ComponentSetsResponse>(cacheKey);
      if (cached) {
        this._requestStats.cached++;
        return cached;
      }
    }

    const response = await this._withStaleCache(cacheKey, () =>
      this._client.get<ComponentSetsResponse>(`/v1/files/${fileKey}/component_sets`),
    );

    if (cache && cacheKey) {
      await cache.set(cacheKey, response.data, this._cacheTTL);
    }

    return response.data;
  }

  // ============ 图片导出 ============

  /**
   * 批量获取节点导出图片的 URL
   *
   * Figma 服务端渲染节点并返回临时 CDN URL（有效期约 30 天），
   * 需要配合 {@link downloadImage} 或直接使用 `<img src={url}>` 展示。
   *
   * **自动分批保护（v1.4.0 新增）：**
   * 当 nodeIds 数量超过 {@link GET_IMAGES_BATCH_SIZE}（默认 50）时，
   * 自动分批请求并合并结果，避免 URL 过长导致 HTTP 414 错误。
   *
   * @param fileKey - Figma 文件 Key
   * @param nodeIds - 要导出的节点 ID 列表
   * @param format - 导出格式：jpg / png / svg / pdf
   * @param scale - 导出倍率（1-4），2x 适合 Retina 屏幕
   * @param useAbsoluteBounds - 是否使用绝对边界（忽略裁剪和旋转）
   * @returns 按 nodeId 索引的图片 URL 映射，失败的节点值为 null
   */
  async getImages(
    fileKey: string,
    nodeIds: string[],
    format: 'jpg' | 'png' | 'svg' | 'pdf' = 'png',
    scale: number = 2,
    useAbsoluteBounds: boolean = false,
  ): Promise<{ images: Record<string, string | null>; err?: string }> {
    // 空列表直接返回
    if (nodeIds.length === 0) {
      return { images: {} };
    }

    // ============ 自动分批逻辑（v1.4.0 新增） ============
    // 当节点数超过批大小时，分批请求并合并结果
    if (nodeIds.length > GET_IMAGES_BATCH_SIZE) {
      return this._getImagesInBatches(fileKey, nodeIds, format, scale, useAbsoluteBounds);
    }

    // 单批请求逻辑
    return this._getImagesSingleBatch(fileKey, nodeIds, format, scale, useAbsoluteBounds);
  }

  /**
   * 单批获取图片 URL（内部方法，不缓存临时签名 URL）。
   */
  private async _getImagesSingleBatch(
    fileKey: string,
    nodeIds: string[],
    format: 'jpg' | 'png' | 'svg' | 'pdf',
    scale: number,
    useAbsoluteBounds: boolean,
  ): Promise<{ images: Record<string, string | null>; err?: string }> {
    const params: Record<string, string | number | boolean> = {
      ids: nodeIds.join(','),
      format,
      scale,
    };

    if (useAbsoluteBounds) {
      params.use_absolute_bounds = true;
    }

    const requestKey = `GET:/v1/images/${fileKey}:${JSON.stringify(params)}`;
    const response = await this._coalesce(requestKey, () =>
      this._client.get<{ images: Record<string, string | null>; err?: string }>(`/v1/images/${fileKey}`, { params }),
    );
    return response.data;
  }
  /**
   * 分批获取图片 URL（内部方法，自动分批并合并结果）
   *
   * 当 nodeIds 数量过大时，按 GET_IMAGES_BATCH_SIZE 分批请求，
   * 然后合并所有批次的 images 映射。
   */
  private async _getImagesInBatches(
    fileKey: string,
    nodeIds: string[],
    format: 'jpg' | 'png' | 'svg' | 'pdf',
    scale: number,
    useAbsoluteBounds: boolean,
  ): Promise<{ images: Record<string, string | null>; err?: string }> {
    const mergedImages: Record<string, string | null> = {};
    const errors: string[] = [];

    // 分批
    const batches: string[][] = [];
    for (let i = 0; i < nodeIds.length; i += GET_IMAGES_BATCH_SIZE) {
      batches.push(nodeIds.slice(i, i + GET_IMAGES_BATCH_SIZE));
    }

    // 串行请求各批次（避免触发 Rate Limit）
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex]!;
      try {
        const result = await this._getImagesSingleBatch(fileKey, batch, format, scale, useAbsoluteBounds);
        // 合并 images
        Object.assign(mergedImages, result.images);
        if (result.err) {
          errors.push(`Batch ${batchIndex + 1}: ${result.err}`);
        }
      } catch (error) {
        // 单批失败时，该批节点标记为 null
        for (const nodeId of batch) {
          mergedImages[nodeId] = null;
        }
        errors.push(`Batch ${batchIndex + 1}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      images: mergedImages,
      err: errors.length > 0 ? errors.join('; ') : undefined,
    };
  }

  /**
   * 获取文件中所有图片填充的 URL 映射
   *
   * 当节点使用 IMAGE 填充时，fill.imageRef 指向的图片可以通过此接口获取下载 URL。
   *
   * @param fileKey - Figma 文件 Key
   * @returns imageRef 到图片 URL 的映射
   */
  async getImageFills(fileKey: string): Promise<{ images: Record<string, string> }> {
    const response = await this._client.get<{ images: Record<string, string> }>(`/v1/files/${fileKey}/images`);
    return response.data;
  }

  /**
   * 下载图片到内存 Buffer
   *
   * 用于将 {@link getImages} 返回的 URL 下载到本地保存。
   * 注意：下载时不使用 Figma API Base URL，直接访问 CDN 地址。
   *
   * @param url - 图片 CDN URL（从 getImages 获取）
   * @returns 图片二进制数据 Buffer
   * @throws {Error} 下载失败（HTTP 错误、网络错误）时抛出
   */
  async downloadImage(url: string): Promise<Buffer> {
    const response = await this._client.get(url, {
      responseType: 'arraybuffer',
      baseURL: '', // 覆盖默认 baseURL，直接访问 CDN 绝对 URL
    });
    return Buffer.from(response.data as ArrayBuffer);
  }

  // ============ 节点遍历工具 ============

  /**
   * 递归遍历节点树
   *
   * 深度优先遍历，回调函数返回 false 可提前停止遍历（短路求值）。
   *
   * @param node - 起始根节点
   * @param callback - 对每个节点调用的回调函数，返回 false 停止遍历
   * @returns 遍历是否完整完成（false 表示被中止）
   *
   * @example
   * ```typescript
   * // 找到第一个名为 "Button" 的节点后停止
   * let found: FigmaNode | null = null;
   * client.traverseNodes(rootNode, (node) => {
   *   if (node.name === 'Button') {
   *     found = node;
   *     return false; // 停止遍历
   *   }
   * });
   * ```
   */
  traverseNodes(node: FigmaNode, callback: (node: FigmaNode) => boolean | void): boolean {
    const shouldContinue = callback(node);
    if (shouldContinue === false) return false;

    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        if (!this.traverseNodes(child, callback)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * 按节点类型查找所有匹配节点
   *
   * 支持单个类型或类型数组，可限制最大遍历深度。
   *
   * @param root - 搜索根节点
   * @param type - 要查找的节点类型（如 'FRAME'、'TEXT'），或类型数组
   * @param maxDepth - 最大深度，-1 表示无限制
   * @returns 匹配的节点数组（深度优先顺序）
   */
  findNodesByType(root: FigmaNode, type: FigmaNode['type'] | FigmaNode['type'][], maxDepth: number = -1): FigmaNode[] {
    const types = Array.isArray(type) ? type : [type];
    const results: FigmaNode[] = [];

    const traverse = (node: FigmaNode, depth: number): void => {
      if (types.includes(node.type)) {
        results.push(node);
      }

      // 达到最大深度时不再深入
      if (maxDepth >= 0 && depth >= maxDepth) return;

      if (node.children) {
        for (const child of node.children) {
          traverse(child, depth + 1);
        }
      }
    };

    traverse(root, 0);
    return results;
  }

  /**
   * 按节点名称正则匹配查找节点
   *
   * @param root - 搜索根节点
   * @param name - 名称模式（字符串会被转义为精确子串匹配，或直接传入 RegExp）
   * @param caseSensitive - 是否大小写敏感，默认 false（不敏感）
   * @returns 匹配的节点数组
   *
   * @example
   * ```typescript
   * // 查找名称含 "button" 的节点（不区分大小写）
   * const buttons = client.findNodesByName(page, 'button');
   * // 使用正则匹配
   * const headings = client.findNodesByName(page, /^Heading [1-6]$/, true);
   * ```
   */
  findNodesByName(root: FigmaNode, name: string | RegExp, caseSensitive: boolean = false): FigmaNode[] {
    const results: FigmaNode[] = [];
    // 字符串输入自动转义为正则表达式（避免特殊字符导致匹配异常）
    const nameRegex =
      typeof name === 'string'
        ? new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? '' : 'i')
        : name;

    this.traverseNodes(root, (node) => {
      if (nameRegex.test(node.name)) {
        results.push(node);
      }
    });

    return results;
  }

  // ============ 样式便捷方法 ============

  /**
   * 获取节点的第一个可见 SOLID 填充
   *
   * 遍历 fills 数组，跳过不可见填充和非 SOLID 类型，
   * 返回第一个有颜色值的纯色填充。
   *
   * @param node - Figma 节点
   * @returns SOLID 填充对象，没有有效填充返回 null
   */
  getSolidFill(node: FigmaNode): FigmaPaint | null {
    if (!node.fills) return null;

    for (const fill of node.fills) {
      // visible !== false 表示显式设置了 visible=false 的才跳过，undefined 视为可见
      if (fill.type === 'SOLID' && fill.visible !== false && fill.color) {
        return fill;
      }
    }

    return null;
  }

  /**
   * 获取节点的第一个可见 SOLID 描边
   *
   * @param node - Figma 节点
   * @returns SOLID 描边对象，没有有效描边返回 null
   */
  getSolidStroke(node: FigmaNode): FigmaPaint | null {
    if (!node.strokes) return null;

    for (const stroke of node.strokes) {
      if (stroke.type === 'SOLID' && stroke.visible !== false && stroke.color) {
        return stroke;
      }
    }

    return null;
  }
}

// ============ 工厂函数 ============

/**
 * 创建 FigmaClient 实例的工厂函数
 *
 * @param config - 客户端配置
 * @returns FigmaClient 实例
 */
export function createFigmaClient(config: FigmaClientConfig): FigmaClient {
  return new FigmaClient(config);
}
