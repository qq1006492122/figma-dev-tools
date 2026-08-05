/**
 * Figma REST API 客户端
 *
 * 封装 Figma REST API 的所有调用，统一处理：
 * - HTTP 请求认证（X-Figma-Token 头部）
 * - 错误状态码映射为友好中文消息
 * - 响应数据类型转换
 * - 节点树遍历工具方法
 *
 * API 版本：v1
 * 官方文档：https://www.figma.com/developers/api
 */

// ============ 依赖导入 ============

import { create as axiosCreate, type AxiosInstance, type AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import type { Agent as HttpsAgent } from 'https';

import type {
  FigmaFileResponse,
  FigmaVariablesResponse,
  FigmaNode,
  FigmaComponent,
  FigmaStyle,
  FigmaPaint,
} from '../types.js';
import { FigmaCache } from './cache.js';

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
interface RequestMetadata {
  retryCount?: number;
}

/**
 * Figma API 错误响应结构
 */
export interface FigmaApiError {
  /** HTTP 状态码 */
  status: number;
  /** 错误消息 */
  message: string;
  /** Figma 原始错误描述 */
  err?: string;
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
const LOCALHOST_ADDRESSES = ['localhost', '127.0.0.1', '::1'];

/** getImages 单批最大节点数（防止 URL 过长导致 HTTP 414 错误） */
const GET_IMAGES_BATCH_SIZE = 50;

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
  private readonly _accessToken: string;
  /** 重试配置 */
  private readonly _retryConfig: Required<RetryConfig>;
  /** 速率限制配置 */
  private readonly _rateLimitConfig: Required<RateLimitConfig>;
  /** 速率限制状态 */
  private _rateLimitState: RateLimitState;
  /** 缓存统计 */
  private _requestStats: { total: number; retried: number; cached: number };
  /** 缓存实例 */
  private readonly _cache: FigmaCache | null;
  /** 缓存 TTL */
  private readonly _cacheTTL: number;

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
      const noProxyList = noProxy.split(',').map((s) => s.trim().toLowerCase());
      if (noProxyList.includes('api.figma.com') || noProxyList.includes('*')) {
        return false;
      }
    }

    try {
      const url = new URL(proxyUrl);
      return {
        host: url.hostname,
        port: parseInt(url.port || (url.protocol === 'https:' ? '443' : '80'), 10),
        protocol: url.protocol === 'https:' ? 'https' : 'http',
        username: url.username || undefined,
        password: url.password || undefined,
      };
    } catch {
      return false;
    }
  }

  /**
   * 创建代理 Agent
   */
  private _createProxyAgent(proxyConfig: ProxyConfig): HttpsAgent {
    const auth = proxyConfig.username && proxyConfig.password
      ? `${proxyConfig.username}:${proxyConfig.password}@`
      : '';
    const proxyUrl = `${proxyConfig.protocol || 'https'}://${auth}${proxyConfig.host}:${proxyConfig.port}`;
    return new HttpsProxyAgent(proxyUrl);
  }

  /**
   * 检查 URL 是否为本地地址（允许 HTTP）
   */
  private _isLocalhost(url: string): boolean {
    try {
      const parsed = new URL(url);
      return LOCALHOST_ADDRESSES.includes(parsed.hostname.toLowerCase());
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
    if (retryAfter) {
      return retryAfter * 1000;
    }
    const baseDelay = this._retryConfig.initialDelayMs;
    return Math.min(baseDelay * Math.pow(2, retryCount), 30_000);
  }

  /**
   * 更新速率限制状态（从响应 headers）
   */
  private _updateRateLimitFromHeaders(headers: Record<string, string>): void {
    const remaining = headers['x-ratelimit-remaining'];
    const reset = headers['x-ratelimit-reset'];

    if (remaining !== undefined) {
      this._rateLimitState.remaining = parseInt(remaining, 10);
    }
    if (reset !== undefined) {
      // Figma 返回的是 Unix 时间戳（秒）
      this._rateLimitState.resetAt = parseInt(reset, 10) * 1000;
    }
  }

  /**
   * 请求前等待（速率控制）
   */
  private async _throttle(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this._rateLimitState.lastRequestAt;
    const minInterval = this._rateLimitConfig.minIntervalMs;

    // 基础间隔控制
    if (timeSinceLastRequest < minInterval) {
      await this._delay(minInterval - timeSinceLastRequest);
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
  private _isRetryable(error: AxiosError<FigmaApiError>): boolean {
    if (!error.response) {
      // 网络错误（没有响应）可以重试
      return error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || !error.response;
    }
    return this._retryConfig.retryableStatusCodes.includes(error.response.status);
  }

  /**
   * 获取 Retry-After 头的值（秒）
   */
  private _getRetryAfter(error: AxiosError<FigmaApiError>): number | undefined {
    if (!error.response?.headers) return undefined;
    const retryAfter = error.response.headers['retry-after'];
    if (retryAfter) {
      const parsed = parseInt(retryAfter, 10);
      return isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
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
    this._accessToken = config.accessToken;
    this._cache = config.cache || null;
    this._cacheTTL = config.cacheTTL ?? 10 * 60 * 1000; // 默认 10 分钟
    this._requestStats = { total: 0, retried: 0, cached: 0 };

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

    // HTTPS 强制检查
    const baseURL = config.baseURL || DEFAULT_BASE_URL;
    if (!this._isLocalhost(baseURL) && !baseURL.startsWith(HTTPS_PROTOCOL)) {
      throw new Error('Figma API Base URL 必须使用 HTTPS（本地调试除外）');
    }

    // 代理配置
    const proxyConfig = config.proxy === false ? false : (config.proxy || this._detectProxy());
    const httpsAgent = proxyConfig ? this._createProxyAgent(proxyConfig) : undefined;

    // Axios 实例配置
    const axiosConfig: AxiosRequestConfig = {
      baseURL,
      timeout: config.timeout || DEFAULT_TIMEOUT,
      headers: {
        'X-Figma-Token': config.accessToken,
        'Content-Type': 'application/json',
      },
      httpsAgent,
      proxy: false, // 使用 agent 而非 axios 内置 proxy
    };

    this._client = axiosCreate(axiosConfig);

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
      async (error: AxiosError<FigmaApiError>) => {
        const config = error.config as (InternalAxiosRequestConfig & RequestMetadata) | undefined;

        // 更新速率限制状态（即使是错误响应）
        if (error.response?.headers) {
          this._updateRateLimitFromHeaders(error.response.headers as Record<string, string>);
        }

        // 重试逻辑
        if (config && this._isRetryable(error)) {
          const retryCount = config.retryCount ?? 0;
          if (retryCount < this._retryConfig.maxRetries) {
            this._requestStats.retried++;
            const retryAfter = this._getRetryAfter(error);
            const delay = this._calculateRetryDelay(retryCount, retryAfter);
            await this._delay(delay);

            // 重试请求
            const newConfig = { ...config, retryCount: retryCount + 1 };
            return this._client.request(newConfig);
          }
        }

        // 错误消息格式化
        if (error.response) {
          const { status, data } = error.response;
          let message = 'Figma API 请求失败';
          let suggestion = '';

          switch (status) {
            case 400:
              message = '请求参数错误';
              suggestion = '请检查 nodeId、fileKey 等参数格式是否正确';
              break;
            case 401:
              message = '认证失败';
              suggestion = '请检查 Figma Access Token 是否有效或已过期，可使用 figma-dev token set 更新';
              break;
            case 403:
              message = '权限不足';
              suggestion = '该 Token 无法访问此文件，请确认 Token 权限包含 File content (Read only)，且你有该文件的访问权限';
              break;
            case 404:
              message = '文件或节点不存在';
              suggestion = '请检查 fileKey/nodeId 是否正确，文件是否已被删除或移动';
              break;
            case 429:
              message = '请求频率超限（Rate Limit）';
              suggestion = '已自动重试多次仍失败，请稍后再试，或降低并发请求数';
              break;
            case 408:
              message = '请求超时';
              suggestion = '网络不稳定，已自动重试，请检查网络连接';
              break;
            case 500:
            case 502:
            case 503:
            case 504:
              message = 'Figma 服务器错误';
              suggestion = '已自动重试多次，请稍后再试，或查看 https://status.figma.com 了解服务状态';
              break;
            default:
              message = data?.err || data?.message || `HTTP ${status} 错误`;
              suggestion = '如果问题持续，请检查网络连接或稍后重试';
          }

          const errorMsg = `Figma API Error (${status}): ${message}。${suggestion}`;
          const enhancedError = new Error(errorMsg);
          (enhancedError as Error & { status?: number }).status = status;
          throw enhancedError;
        } else if (error.request) {
          // 请求已发出但未收到响应（网络问题、DNS 失败、超时等）
          const networkError = new Error(
            'Figma API 请求失败：网络连接错误或请求超时。' +
            '请检查网络设置，如有代理可配置 HTTP_PROXY/HTTPS_PROXY 环境变量，' +
            '或使用 figma-dev config set proxy 配置代理。'
          );
          throw networkError;
        } else {
          // 请求配置阶段出错
          throw new Error(`Figma API 请求失败：${error.message}`);
        }
      },
    );
  }

  // ============ 认证相关 ============

  /**
   * 获取当前配置的 Access Token
   *
   * @returns Figma Personal Access Token 字符串
   */
  getAccessToken(): string {
    return this._accessToken;
  }

  /**
   * 获取请求统计信息
   *
   * @returns 包含总请求数、重试次数、缓存命中数的统计对象
   */
  getRequestStats(): { total: number; retried: number; cached: number; retryRate: number; cacheHitRate: number } {
    const retryRate = this._requestStats.total > 0
      ? this._requestStats.retried / this._requestStats.total
      : 0;
    const cacheHitRate = this._requestStats.total > 0
      ? this._requestStats.cached / this._requestStats.total
      : 0;
    return {
      ...this._requestStats,
      retryRate,
      cacheHitRate,
    };
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
   * 该接口返回当前用户信息，Token 无效时返回 401。
   *
   * @returns Token 有效返回用户信息，无效返回 null
   */
  async validateToken(): Promise<{ id: string; email: string; handle: string; img_url: string } | null> {
    try {
      const response = await this._client.get('/v1/me');
      return response.data;
    } catch {
      // 任何错误（401、网络错误等）都视为 Token 无效
      return null;
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
    // 尝试从缓存获取
    if (this._cache) {
      const cacheKey = FigmaCache.generateFileCacheKey(fileKey, version, depth);
      const cached = await this._cache.get<FigmaFileResponse>(cacheKey);
      if (cached) {
        this._requestStats.cached++;
        return cached;
      }
    }

    const params: Record<string, string | number> = {};
    if (version) params.version = version;
    if (depth !== undefined) params.depth = depth;

    const response = await this._client.get<FigmaFileResponse>(`/v1/files/${fileKey}`, {
      params,
    });

    // 写入缓存
    if (this._cache) {
      const cacheKey = FigmaCache.generateFileCacheKey(fileKey, version, depth);
      await this._cache.set(cacheKey, response.data, this._cacheTTL);
    }

    return response.data;
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
    // 生成缓存键（包含所有选项）
    const cacheKeyParts = [
      fileKey,
      (options.ids || []).sort().join(','),
      String(options.depth ?? -1),
      options.geometry || '',
      options.plugin_data || '',
    ];
    const cacheKey = FigmaCache.generateApiCacheKey('nodes', ...cacheKeyParts);

    // 尝试从缓存获取
    if (this._cache) {
      const cached = await this._cache.get<{ nodes: Record<string, { document: FigmaNode }> }>(cacheKey);
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

    const response = await this._client.get(`/v1/files/${fileKey}/nodes`, {
      params,
    });

    // 写入缓存
    if (this._cache) {
      await this._cache.set(cacheKey, response.data, this._cacheTTL);
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
    const response = await this._client.get<FigmaVariablesResponse>(`/v1/files/${fileKey}/variables/local`);
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
    const response = await this._client.get(`/v1/files/${fileKey}/component_sets`);
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
   * 单批获取图片 URL（内部方法，带缓存）
   */
  private async _getImagesSingleBatch(
    fileKey: string,
    nodeIds: string[],
    format: 'jpg' | 'png' | 'svg' | 'pdf',
    scale: number,
    useAbsoluteBounds: boolean,
  ): Promise<{ images: Record<string, string | null>; err?: string }> {
    // 尝试从缓存获取
    if (this._cache) {
      const cacheKey = FigmaCache.generateImageCacheKey(fileKey, nodeIds, format, scale) + (useAbsoluteBounds ? ':abs' : '');
      const cached = await this._cache.get<{ images: Record<string, string | null>; err?: string }>(cacheKey);
      if (cached) {
        this._requestStats.cached++;
        return cached;
      }
    }

    const params: Record<string, string | number | boolean> = {
      ids: nodeIds.join(','),
      format,
      scale,
    };

    if (useAbsoluteBounds) {
      params.use_absolute_bounds = true;
    }

    const response = await this._client.get<{ images: Record<string, string | null>; err?: string }>(
      `/v1/images/${fileKey}`,
      { params },
    );

    // 写入缓存（图片URL缓存时间稍短，5分钟）
    if (this._cache) {
      const cacheKey = FigmaCache.generateImageCacheKey(fileKey, nodeIds, format, scale) + (useAbsoluteBounds ? ':abs' : '');
      await this._cache.set(cacheKey, response.data, Math.min(this._cacheTTL, 5 * 60 * 1000));
    }

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
