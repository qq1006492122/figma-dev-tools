/**
 * 浏览器兜底服务 - Browser Fallback Service
 *
 * v1.4.4 新增：当 Figma REST API 因付费墙（PAYMENT_REQUIRED）或权限失败且无本地缓存时，
 * 自动启动 Playwright 无头浏览器加载 Figma 设计稿页面并截图保底。
 *
 * 核心能力：
 * - 动态导入 Playwright（可选依赖，未安装时优雅降级）
 * - 注入 Figma Access Token 为 Cookie 实现登录态
 * - 按 node-id URL 参数定位到指定画板
 * - 检测 devicePixelRatio 按 1x/2x/3x 输出截图（v1.4.4：支持自动探测）
 * - 操作系统差异化 User-Agent（v1.4.4：跨平台一致性）
 * - 尝试抓取 Dev Mode 侧栏的 CSS 属性（如可访问）
 * - 跨平台支持（Windows/macOS/Linux）
 *
 * 使用场景：
 * 1. figma-client.ts 中 _withStaleCache 失败后调用
 * 2. MCP 工具 figma_dev_fallback_status 查询可用兜底层级
 * 3. VisualApproximationService 消费截图生成近似代码
 *
 * @module
 */

// ============ 依赖导入 ============

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { getI18n } from '../i18n/index.js';
import { parseFigmaUrl } from '../utils/figma-url.js';

// ============ 性能优化模块导入 ============

import {
  BrowserPool,
  getBrowserPool,
  type BrowserPoolOptions,
} from './browser-pool.js';
import { ScreenshotCache, type ScreenshotCacheOptions } from './screenshot-cache.js';

// ============ 类型定义 ============

/**
 * 浏览器兜底配置选项
 */
export interface BrowserFallbackOptions {
  /** 是否启用浏览器兜底，默认 true */
  enabled: boolean;
  /** 浏览器类型，默认 chromium */
  browser: 'chromium' | 'firefox' | 'webkit';
  /** 是否无头模式，默认 true（生产环境） */
  headless: boolean;
  /**
   * 页面加载超时（毫秒），默认 30000
   * @deprecated v1.4.4 性能优化后改用 navigationTimeout / renderTimeout / screenshotTimeout 分级控制
   * 保留此字段向后兼容：若未指定分级超时，则统一使用此值
   */
  timeout: number;
  /**
   * 导航超时（毫秒），默认 20000
   * 控制 page.goto 的最大等待时间
   */
  navigationTimeout: number;
  /**
   * 渲染等待超时（毫秒），默认 10000
   * 控制等待画布元素可见的最大时间
   */
  renderTimeout: number;
  /**
   * 截图操作超时（毫秒），默认 5000
   * 控制截图本身的最大时间（不含等待）
   */
  screenshotTimeout: number;
  /**
   * 截图 devicePixelRatio。
   * - 0：自动探测（v1.4.4 新增，从浏览器窗口读取实际 DPR）
   * - 1/2/3：强制按指定倍率输出
   * 默认 0（自动探测）
   */
  devicePixelRatio: number;
  /** 截图输出目录，默认 os.tmpdir() */
  outputDir: string;
  /** 是否尝试抓取 Dev Mode CSS，默认 true */
  captureDevModeCss: boolean;
  /**
   * 是否在截图前尝试定位 node-id 对应的画板元素并缩放到可视区。
   * 默认 true。失败时回退为整页截图。
   */
  focusNode: boolean;
  /**
   * 等待策略，默认 'hybrid'
   * - 'hybrid'：domcontentloaded + 自定义画布可见条件 + 最大渲染超时（推荐）
   * - 'conservative'：networkidle + 固定 2 秒等待（最稳定）
   * - 'aggressive'：仅 domcontentloaded + 最小等待（最快）
   */
  waitStrategy: 'hybrid' | 'conservative' | 'aggressive';
  /**
   * 最大重试次数，默认 2
   * 仅对网络错误、超时错误重试，参数错误不重试
   */
  maxRetries: number;
  /**
   * 重试初始延迟（毫秒），默认 500
   * 指数退避：第 n 次重试延迟 = baseDelay * 2^(n-1)
   */
  retryBaseDelay: number;
  /**
   * 是否启用截图缓存，默认 true
   * 基于 figmaUrl + nodeId + dpr 缓存，避免重复截图
   */
  enableScreenshotCache: boolean;
  /**
   * 截图缓存有效期（毫秒），默认 3600000（1 小时）
   * 超过此时间的缓存条目将被视为过期
   */
  screenshotCacheTtl: number;
  /**
   * 浏览器实例池空闲超时（毫秒），默认 60000（60 秒）
   * 浏览器实例空闲超过此时间后自动关闭
   */
  browserIdleTimeout: number;
}

/**
 * 浏览器兜底结果
 */
export interface BrowserFallbackResult {
  /** 截图文件绝对路径 */
  screenshotPath: string;
  /** 截图宽度（像素，已乘以 DPR） */
  width: number;
  /** 截图高度（像素，已乘以 DPR） */
  height: number;
  /** 使用的 devicePixelRatio */
  devicePixelRatio: number;
  /** Dev Mode CSS 属性（如抓取成功） */
  devModeCss?: string;
  /** 截图时间戳 */
  capturedAt: number;
  /** 兜底过程中产生的警告信息 */
  warnings: string[];
  /** 是否为近似模式（截图无法精确还原节点树） */
  isApproximate: boolean;
  /** 探测到的操作系统（用于差异化渲染） */
  os: 'windows' | 'macos' | 'linux' | 'unknown';
  /** 是否成功定位到 node-id 对应元素（focusNode 失败时为 false） */
  nodeFocused: boolean;
}

/**
 * Playwright 可用性检查结果
 */
export interface PlaywrightAvailability {
  /** 是否已安装 */
  available: boolean;
  /** 未安装时的错误原因 */
  reason?: string;
  /** 安装建议 */
  installHint?: string;
}

// ============ 常量定义 ============

/**
 * Figma 设计稿 URL 前缀
 */
const FIGMA_DESIGN_URL_PREFIX = 'https://www.figma.com/design/';

/**
 * Figma Token Cookie 名称（用于注入登录态）
 */
const FIGMA_TOKEN_COOKIE_NAME = 'figma_access_token';

/**
 * 默认配置
 */
const DEFAULT_OPTIONS: BrowserFallbackOptions = {
  enabled: true,
  browser: 'chromium',
  headless: true,
  timeout: 30000, // 向后兼容：未指定分级超时时使用
  navigationTimeout: 20000, // 导航阶段 20 秒
  renderTimeout: 10000, // 渲染等待 10 秒
  screenshotTimeout: 5000, // 截图操作 5 秒
  devicePixelRatio: 0,
  outputDir: os.tmpdir(),
  captureDevModeCss: true,
  focusNode: true,
  waitStrategy: 'hybrid',
  maxRetries: 2,
  retryBaseDelay: 500,
  enableScreenshotCache: true,
  screenshotCacheTtl: 3600000, // 1 小时
  browserIdleTimeout: 60000, // 60 秒
};

/**
 * 主流桌面浏览器 User-Agent（Chromium on Windows）
 * 用于绕过 Figma 对无头浏览器的简单检测
 */
const USER_AGENT_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * 主流桌面浏览器 User-Agent（Chromium on macOS）
 */
const USER_AGENT_MACOS =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * 主流桌面浏览器 User-Agent（Chromium on Linux）
 */
const USER_AGENT_LINUX =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ============ 工具函数 ============

/**
 * 探测当前操作系统类型
 *
 * @returns 操作系统标识
 */
function detectOs(): 'windows' | 'macos' | 'linux' | 'unknown' {
  const platform = os.platform();
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'macos';
  if (platform === 'linux') return 'linux';
  return 'unknown';
}

/**
 * 根据操作系统选择对应的 User-Agent
 *
 * @param osType - 操作系统标识
 * @returns 对应的 User-Agent 字符串
 */
function getUserAgentForOs(osType: 'windows' | 'macos' | 'linux' | 'unknown'): string {
  switch (osType) {
    case 'windows':
      return USER_AGENT_WINDOWS;
    case 'macos':
      return USER_AGENT_MACOS;
    case 'linux':
      return USER_AGENT_LINUX;
    default:
      return USER_AGENT_WINDOWS;
  }
}

/**
 * 将 API 风格的 nodeId（"14:7721"）转换为 URL 风格（"14-7721"）
 *
 * @param nodeId - API 风格节点 ID
 * @returns URL 风格节点 ID
 */
function toUrlNodeId(nodeId: string): string {
  return nodeId.replace(/:/g, '-');
}

/**
 * 从 PNG Buffer 解析宽高（IHDR 块）
 *
 * PNG 文件头结构：8 字节签名 + 25 字节 IHDR（长度4 + 类型4 + 数据13 + CRC4）。
 * 宽度位于字节 16-19，高度位于字节 20-23（大端序）。
 *
 * 边界场景处理：
 * - Buffer 长度 < 24 字节：返回 {0, 0}，让调用方走兜底逻辑
 * - Buffer 不是 PNG（签名不匹配）：返回 {0, 0}
 *
 * @param buffer - PNG 文件 Buffer
 * @returns 宽度和高度，解析失败时返回 {0, 0}
 */
function _readPngDimensions(buffer: Buffer): { width: number; height: number } {
  // PNG 签名：89 50 4E 47 0D 0A 1A 0A（8 字节）
  const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // 边界场景：Buffer 过短，无法包含 IHDR，返回 0 让调用方走兜底
  if (buffer.length < 24) {
    return { width: 0, height: 0 };
  }

  // 边界场景：签名不匹配，不是 PNG，返回 0 让调用方走兜底
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { width: 0, height: 0 };
  }

  // 读取 IHDR 中的宽高（大端序，位于字节 16-19 和 20-23）
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

// ============ BrowserFallbackService 类 ============

/**
 * 浏览器兜底服务
 *
 * 当 Figma REST API 失败时，使用 Playwright 无头浏览器加载设计稿页面并截图。
 * Playwright 为可选依赖，未安装时返回明确的不可用状态。
 *
 * v1.4.4 性能优化：
 * - 使用 BrowserPool 实例池复用浏览器实例（节省 1-3 秒启动开销）
 * - 分级超时（导航/渲染/截图分别控制）
 * - 混合智能等待策略（针对 Figma SPA 优化）
 * - 指数退避重试机制
 * - 截图缓存（基于 url+nodeId+dpr）
 */
export class BrowserFallbackService {
  /** 配置选项（已合并默认值） */
  private readonly _options: BrowserFallbackOptions;
  /** Playwright 模块缓存（动态导入后缓存） */
  private _playwrightModule: typeof import('playwright') | null = null;
  /** Playwright 可用性缓存 */
  private _availabilityCache: PlaywrightAvailability | null = null;
  /** 浏览器实例池引用 */
  private _browserPool: BrowserPool | null = null;
  /** 截图缓存实例 */
  private _screenshotCache: ScreenshotCache | null = null;

  /**
   * 构造函数
   *
   * @param options - 配置选项（部分提供时合并默认值）
   */
  constructor(options: Partial<BrowserFallbackOptions> = {}) {
    this._options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * 获取浏览器实例池（懒加载）
   *
   * @returns BrowserPool 实例
   */
  private _getBrowserPool(): BrowserPool {
    if (!this._browserPool) {
      this._browserPool = getBrowserPool({
        browser: this._options.browser,
        headless: this._options.headless,
        idleTimeout: this._options.browserIdleTimeout,
        maxInstances: 1,
        autoCleanupOnExit: true,
      });
    }
    return this._browserPool;
  }

  /**
   * 获取截图缓存实例（懒加载）
   */
  private _getScreenshotCache(): ScreenshotCache {
    if (!this._screenshotCache) {
      this._screenshotCache = new ScreenshotCache({
        cacheDir: this._options.outputDir,
        ttl: this._options.screenshotCacheTtl,
        maxEntries: 50,
      });
    }
    return this._screenshotCache;
  }

  /**
   * 检查 Playwright 是否可用
   *
   * 使用动态 import 尝试加载 Playwright。
   *
   * 缓存策略：
   * - 仅缓存「可用」结果（available=true），避免用户安装后仍命中旧缓存
   * - 「不可用」结果不缓存，每次都重试，以便用户安装后立即生效
   *
   * @returns 可用性检查结果
   */
  async checkAvailability(): Promise<PlaywrightAvailability> {
    // 仅缓存「可用」结果，不可用时不缓存（允许重试）
    if (this._availabilityCache?.available) {
      return this._availabilityCache;
    }

    try {
      // 动态导入 Playwright（可选依赖）
      const playwright = await import('playwright');
      this._playwrightModule = playwright;
      this._availabilityCache = {
        available: true,
      };
      return this._availabilityCache;
    } catch {
      // Playwright 未安装：不缓存，允许下次重试
      const i18n = getI18n();
      const labels = i18n.t('cli.errors.labels') as {
        playwrightNotInstalled?: string;
        playwrightInstallHint?: string;
      };
      return {
        available: false,
        reason: labels.playwrightNotInstalled ?? 'Playwright 未安装',
        installHint:
          labels.playwrightInstallHint ??
          '运行 npm install playwright && npx playwright install chromium 安装浏览器引擎',
      };
    }
  }

  /**
   * 截取 Figma 设计稿页面截图
   *
   * v1.4.4 优化流程：
   * 1. 前置检查（启用状态、Token、URL 解析）
   * 2. 截图缓存查询（命中则直接返回）
   * 3. 依赖检查（Playwright 可用性）
   * 4. 从实例池获取浏览器实例（复用或新建）
   * 5. 创建上下文 + 注入 Token Cookie
   * 6. 导航到设计稿页面（分级超时 + 智能等待策略）
   * 7. 定位 node-id 元素 + 探测 DPR
   * 8. 截图 + 写入文件
   * 9. 可选：抓取 Dev Mode CSS
   * 10. 写入缓存 + 归还浏览器实例
   * 11. 失败时指数退避重试
   *
   * @param figmaUrl - Figma 设计稿 URL（含 node-id）
   * @param accessToken - Figma Personal Access Token
   * @returns 兜底结果，失败时抛错
   */
  async captureScreenshot(
    figmaUrl: string,
    accessToken: string,
  ): Promise<BrowserFallbackResult> {
    // ============ 1. 前置检查（参数校验优先于依赖检查） ============
    const i18n = getI18n();
    const labels = i18n.t('cli.errors.labels') as {
      fallbackDisabled?: string;
      fallbackUnavailable?: (reason: string, hint: string) => string;
      fallbackTokenRequired?: string;
      fallbackParseFileKeyFailed?: (url: string) => string;
    };

    if (!this._options.enabled) {
      throw new Error(labels.fallbackDisabled ?? '浏览器兜底已禁用（enabled=false）');
    }

    if (!accessToken) {
      throw new Error(labels.fallbackTokenRequired ?? '浏览器兜底需要 Figma Access Token 注入 Cookie');
    }

    // 解析 URL（参数校验）
    const parsed = parseFigmaUrl(figmaUrl);
    if (!parsed.fileKey) {
      throw new Error(
        (labels.fallbackParseFileKeyFailed ?? ((u) => `无法从 URL 解析 fileKey: ${u}`))(figmaUrl),
      );
    }

    // ============ 2. 截图缓存查询 ============
    if (this._options.enableScreenshotCache) {
      const cacheKey = this._generateCacheKey(parsed.fileKey, parsed.nodeId, this._options.devicePixelRatio);
      const cached = await this._getScreenshotCache().get(cacheKey);
      if (cached) {
        // 缓存命中，直接返回（附带缓存标记）
        return {
          screenshotPath: cached.screenshotPath,
          width: cached.width,
          height: cached.height,
          devicePixelRatio: cached.devicePixelRatio,
          devModeCss: cached.devModeCss,
          capturedAt: cached.cachedAt,
          warnings: [...cached.warnings, '截图命中缓存（未重新截图）'],
          isApproximate: true,
          os: cached.os,
          nodeFocused: cached.nodeFocused,
        };
      }
    }

    // 依赖检查（在参数校验和缓存查询之后）
    const availability = await this.checkAvailability();
    if (!availability.available) {
      throw new Error(
        (labels.fallbackUnavailable ?? ((r, h) => `浏览器兜底不可用：${r}。${h}`))(
          availability.reason ?? '',
          availability.installHint ?? '',
        ),
      );
    }

    // ============ 3. 执行截图（带重试） ============
    const result = await this._captureWithRetry(figmaUrl, accessToken, parsed);

    // ============ 4. 写入缓存 ============
    if (this._options.enableScreenshotCache) {
      const cacheKey = this._generateCacheKey(parsed.fileKey, parsed.nodeId, result.devicePixelRatio);
      try {
        await this._getScreenshotCache().set({
          key: cacheKey,
          screenshotPath: result.screenshotPath,
          width: result.width,
          height: result.height,
          devicePixelRatio: result.devicePixelRatio,
          devModeCss: result.devModeCss,
          os: result.os,
          nodeFocused: result.nodeFocused,
          cachedAt: result.capturedAt,
          warnings: result.warnings,
        });
      } catch {
        // 缓存写入失败不影响主流程
      }
    }

    return result;
  }

  /**
   * 带指数退避重试的截图执行
   *
   * 仅对网络错误、超时错误重试，参数错误不重试。
   *
   * @param figmaUrl - Figma URL
   * @param accessToken - Token
   * @param parsed - 已解析的 URL 信息
   * @returns 截图结果
   */
  private async _captureWithRetry(
    _figmaUrl: string,
    accessToken: string,
    parsed: { fileKey: string; nodeId?: string },
  ): Promise<BrowserFallbackResult> {
    let lastError: unknown;
    const maxRetries = this._options.maxRetries;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this._doCapture(accessToken, parsed);
      } catch (error) {
        lastError = error;

        // 判断是否可重试（仅网络错误、超时错误重试）
        if (!this._isRetryableError(error) || attempt === maxRetries) {
          throw error;
        }

        // 指数退避：baseDelay * 2^attempt
        const delay = this._options.retryBaseDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * 判断错误是否可重试
   *
   * 可重试：网络错误、超时错误、浏览器崩溃
   * 不可重试：参数错误、权限错误、配置错误
   *
   * @param error - 错误对象
   * @returns 是否可重试
   */
  private _isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      // 可重试的错误特征
      if (
        msg.includes('timeout') ||
        msg.includes('timed out') ||
        msg.includes('net::err') ||
        msg.includes('network') ||
        msg.includes('econnreset') ||
        msg.includes('econnrefused') ||
        msg.includes('target closed') ||
        msg.includes('browser has been closed') ||
        msg.includes('navigation failed')
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * 实际执行截图（单次尝试）
   *
   * @param accessToken - Figma Token
   * @param parsed - 已解析的 URL 信息
   * @returns 截图结果
   */
  private async _doCapture(
    accessToken: string,
    parsed: { fileKey: string; nodeId?: string },
  ): Promise<BrowserFallbackResult> {
    const i18n = getI18n();
    const nodeId = parsed.nodeId;
    const targetUrl = nodeId
      ? `${FIGMA_DESIGN_URL_PREFIX}${parsed.fileKey}?node-id=${toUrlNodeId(nodeId)}`
      : `${FIGMA_DESIGN_URL_PREFIX}${parsed.fileKey}`;

    const warnings: string[] = [];
    const detectedOs = detectOs();
    const userAgent = getUserAgentForOs(detectedOs);

    // ============ 从实例池获取浏览器 ============
    const pool = this._getBrowserPool();
    const acquired = await pool.acquire();

    try {
      const browser = acquired.browser;

      // 创建上下文，设置 deviceScaleFactor 与 User-Agent
      const normalizedDpr = this._options.devicePixelRatio > 0 ? this._options.devicePixelRatio : 2;
      const context = await browser.newContext({
        deviceScaleFactor: normalizedDpr,
        viewport: { width: 1920, height: 1080 },
        userAgent,
        locale: i18n.getLanguage() === 'zh-CN' ? 'zh-CN' : 'en-US',
      });

      try {
        // 注入 Figma Token Cookie 实现登录态
        await context.addCookies([
          {
            name: FIGMA_TOKEN_COOKIE_NAME,
            value: accessToken,
            domain: '.figma.com',
            path: '/',
            httpOnly: true,
            secure: true,
            sameSite: 'None',
          },
        ]);

        const page = await context.newPage();

        // ============ 导航到设计稿页面（分级超时 + 智能等待） ============
        await this._navigateAndWait(page, targetUrl, warnings);

        // ============ 定位 node-id 对应元素 ============
        let focusedLocator: import('playwright').Locator | null = null;
        if (this._options.focusNode && nodeId) {
          focusedLocator = await this._focusNodeElement(page, nodeId, warnings);
        }
        const nodeFocused = focusedLocator !== null;

        // ============ 探测实际 devicePixelRatio ============
        let actualDpr = normalizedDpr;
        if (this._options.devicePixelRatio === 0) {
          const detectedDpr = await page.evaluate(() => {
            const w = globalThis as unknown as { devicePixelRatio?: number };
            return w.devicePixelRatio ?? 0;
          });
          actualDpr = detectedDpr > 0 ? detectedDpr : normalizedDpr;
        }

        // 获取实际视口尺寸
        const viewportInfo = await page.evaluate(() => {
          const w = globalThis as unknown as { innerWidth?: number; innerHeight?: number };
          return {
            width: w.innerWidth ?? 1920,
            height: w.innerHeight ?? 1080,
          };
        });

        // ============ 截图 ============
        let screenshotBuffer: Buffer;
        let screenshotSource: 'node' | 'page';

        if (focusedLocator) {
          try {
            screenshotBuffer = (await focusedLocator.screenshot({ type: 'png' })) as Buffer;
            screenshotSource = 'node';
          } catch {
            warnings.push('节点元素截图失败，回退为整页截图');
            screenshotBuffer = (await page.screenshot({
              fullPage: false,
              type: 'png',
            })) as Buffer;
            screenshotSource = 'page';
          }
        } else {
          screenshotBuffer = (await page.screenshot({
            fullPage: false,
            type: 'png',
          })) as Buffer;
          screenshotSource = 'page';
        }

        // 尺寸推断：PNG 解析 + 视口*DPR + 0 兜底
        const { width: parsedWidth, height: parsedHeight } = _readPngDimensions(screenshotBuffer);
        const fallbackWidth = (viewportInfo.width || 1920) * actualDpr;
        const fallbackHeight = (viewportInfo.height || 1080) * actualDpr;
        const screenshotWidth = parsedWidth > 0 ? parsedWidth : fallbackWidth;
        const screenshotHeight = parsedHeight > 0 ? parsedHeight : fallbackHeight;
        void screenshotSource;

        // 写入文件
        const timestamp = Date.now();
        const fileName = `figma-fallback-${parsed.fileKey}-${timestamp}.png`;
        const screenshotPath = path.join(this._options.outputDir, fileName);
        await fs.mkdir(this._options.outputDir, { recursive: true });
        await fs.writeFile(screenshotPath, screenshotBuffer);

        // 抓取 Dev Mode CSS
        let devModeCss: string | undefined;
        if (this._options.captureDevModeCss) {
          devModeCss = await this._captureDevModeCss(page, warnings);
        }

        return {
          screenshotPath,
          width: screenshotWidth,
          height: screenshotHeight,
          devicePixelRatio: actualDpr,
          devModeCss,
          capturedAt: timestamp,
          warnings,
          isApproximate: true,
          os: detectedOs,
          nodeFocused,
        };
      } finally {
        await context.close();
      }
    } finally {
      // 归还浏览器实例到池中
      acquired.release();
    }
  }

  /**
   * 导航到设计稿页面并等待渲染完成
   *
   * 根据 waitStrategy 配置选择不同的等待策略：
   * - hybrid（推荐）：domcontentloaded + 画布可见 + 最大渲染超时
   * - conservative：networkidle + 固定 2 秒等待
   * - aggressive：仅 domcontentloaded + 最小等待
   *
   * @param page - Playwright Page 实例
   * @param targetUrl - 目标 URL
   * @param warnings - 警告信息输出数组
   */
  private async _navigateAndWait(
    page: import('playwright').Page,
    targetUrl: string,
    warnings: string[],
  ): Promise<void> {
    const strategy = this._options.waitStrategy;

    if (strategy === 'conservative') {
      // 保守策略：networkidle + 固定 2 秒等待
      await page.goto(targetUrl, {
        waitUntil: 'networkidle',
        timeout: this._options.navigationTimeout,
      });
      try {
        await page.waitForSelector('[class*="canvas"], [class*="frame"], canvas', {
          timeout: this._options.renderTimeout,
        });
      } catch {
        warnings.push('等待画布渲染超时，截图可能不完整');
      }
      await page.waitForTimeout(2000);
      return;
    }

    if (strategy === 'aggressive') {
      // 激进策略：仅 domcontentloaded + 最小等待（500ms）
      await page.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: this._options.navigationTimeout,
      });
      await page.waitForTimeout(500);
      return;
    }

    // hybrid 策略（推荐）：domcontentloaded + 自定义等待条件 + 最大渲染超时
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: this._options.navigationTimeout,
    });

    // 等待画布元素可见（带超时）
    const canvasVisible = await this._waitForCanvasVisible(page, this._options.renderTimeout);
    if (!canvasVisible) {
      warnings.push('等待画布渲染超时，截图可能不完整');
    }

    // 智能等待：等待网络请求趋于平静（最多 renderTimeout 的一半）
    // Figma 的设计稿加载后会有大量图片/字体请求，等待它们完成
    try {
      await this._waitForNetworkIdle(page, Math.floor(this._options.renderTimeout / 2));
    } catch {
      // 网络等待失败不致命
    }
  }

  /**
   * 等待画布元素可见
   *
   * @param page - Playwright Page 实例
   * @param timeout - 超时时间
   * @returns 是否在超时前可见
   */
  private async _waitForCanvasVisible(
    page: import('playwright').Page,
    timeout: number,
  ): Promise<boolean> {
    try {
      // 使用类型断言绕过 Playwright 可选依赖类型推断不完整的问题
      // state: 'visible' 是 Playwright waitForSelector 的合法选项
      await page.waitForSelector('[class*="canvas"], [class*="frame"], canvas', {
        timeout,
        state: 'visible',
      } as never);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 等待网络请求趋于平静
   *
   * 监听网络请求，当连续 500ms 无新请求时认为加载完成。
   * 这比 networkidle 更适合 SPA，因为 SPA 可能有长连接导致永不 idle。
   *
   * @param page - Playwright Page 实例
   * @param timeout - 超时时间
   */
  private async _waitForNetworkIdle(
    page: import('playwright').Page,
    timeout: number,
  ): Promise<void> {
    let lastRequestTime = Date.now();
    let requestCount = 0;

    const onRequest = (): void => {
      lastRequestTime = Date.now();
      requestCount++;
    };

    // Playwright Page 支持 EventEmitter 接口，但可选依赖场景下类型推断不完整
    // 使用类型断言访问 on/off 方法
    const eventTarget = page as unknown as {
      on: (event: string, handler: () => void) => void;
      off: (event: string, handler: () => void) => void;
    };
    eventTarget.on('request', onRequest);

    try {
      const startTime = Date.now();
      const quietPeriod = 500; // 500ms 无请求认为平静

      while (Date.now() - startTime < timeout) {
        if (requestCount > 0 && Date.now() - lastRequestTime >= quietPeriod) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } finally {
      eventTarget.off('request', onRequest);
    }
  }

  /**
   * 生成截图缓存键
   *
   * @param fileKey - Figma 文件 key
   * @param nodeId - 节点 ID
   * @param dpr - devicePixelRatio
   * @returns 缓存键
   */
  private _generateCacheKey(
    fileKey: string,
    nodeId: string | undefined,
    dpr: number,
  ): string {
    return ScreenshotCache.generateKey(fileKey, nodeId, dpr);
  }

  /**
   * 预热浏览器实例池
   *
   * 在服务启动时调用，提前启动浏览器实例，避免首次调用延迟。
   *
   * @returns 是否预热成功
   */
  async warmup(): Promise<boolean> {
    const available = await this.checkAvailability();
    if (!available.available) return false;
    return this._getBrowserPool().warmup();
  }

  /**
   * 获取性能指标
   *
   * @returns 浏览器池和截图缓存统计信息
   */
  getPerformanceStats(): {
    browserPool: import('./browser-pool.js').BrowserPoolStats | null;
    screenshotCache: import('./screenshot-cache.js').ScreenshotCacheStats | null;
  } {
    return {
      browserPool: this._browserPool?.getStats() ?? null,
      screenshotCache: this._screenshotCache?.getStats() ?? null,
    };
  }

  /**
   * 清空截图缓存
   */
  async clearScreenshotCache(): Promise<void> {
    if (this._screenshotCache) {
      await this._screenshotCache.clear();
    }
  }

  /**
   * 按 fileKey 失效截图缓存
   *
   * @param fileKey - Figma 文件 key
   */
  async invalidateCache(fileKey: string): Promise<void> {
    if (this._screenshotCache) {
      await this._screenshotCache.invalidateByFileKey(fileKey);
    }
  }

  /**
   * 尝试定位 node-id 对应的画板元素并滚动到可视区
   *
   * Figma 的画板在 DOM 中通常带有 data-node-id 属性或位于特定的层级结构中。
   * 此方法为 best-effort：失败时不抛错，仅记录警告。
   *
   * @param page - Playwright Page 实例
   * @param nodeId - API 风格节点 ID（如 "14:7721"）
   * @param warnings - 警告信息输出数组
   * @returns 成功定位时返回 Locator 实例，否则返回 null
   */
  private async _focusNodeElement(
    page: import('playwright').Page,
    nodeId: string,
    warnings: string[],
  ): Promise<import('playwright').Locator | null> {
    // Figma 画板元素的 data-node-id 通常使用 ";" 分隔（如 "14;7721"）
    const domNodeId = nodeId.replace(/:/g, ';');
    const selectors = [
      `[data-node-id="${domNodeId}"]`,
      `[data-node-id="${nodeId}"]`,
      `[data-node-id="${toUrlNodeId(nodeId)}"]`,
    ];

    for (const selector of selectors) {
      try {
        const element = page.locator(selector).first();
        const isVisible = await element.isVisible().catch(() => false);
        if (isVisible) {
          await element.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {
            /* 滚动失败忽略 */
          });
          return element;
        }
      } catch {
        // 该选择器无效，继续尝试下一个
      }
    }

    warnings.push(`未能定位到 node-id=${nodeId} 对应元素，使用整页截图`);
    return null;
  }

  /**
   * 尝试抓取 Dev Mode 侧栏的 CSS 属性
   *
   * Figma Dev Mode 侧栏会显示选中元素的 CSS 属性。
   * 此方法尝试定位侧栏元素并提取文本内容。
   * 由于 Figma 的 DOM 结构可能变化，此操作为 best-effort。
   *
   * @param page - Playwright Page 实例
   * @param warnings - 警告信息输出数组
   * @returns 抓取到的 CSS 文本，失败时返回 undefined
   */
  private async _captureDevModeCss(
    page: import('playwright').Page,
    warnings: string[],
  ): Promise<string | undefined> {
    try {
      // 尝试定位 Dev Mode 侧栏的 CSS 代码块
      // Figma 的 CSS 输出通常在 class 含 "inspect" 或 "code" 的容器中
      // evaluate 回调运行在浏览器上下文，使用 globalThis 访问 document
      const cssText = await page.evaluate(() => {
        // 查找 Dev Mode 侧栏可能的选择器
        const selectors = [
          '[class*="inspect"] [class*="code"]',
          '[class*="css"] [class*="property"]',
          '[data-testid*="inspect"]',
          '[class*="dev-mode"] [class*="code"]',
        ];

        const doc = globalThis as unknown as {
          querySelector?: (selector: string) => {
            textContent?: string | null;
          } | null;
        };

        for (const selector of selectors) {
          const element = doc.querySelector?.(selector);
          if (element?.textContent) {
            return element.textContent;
          }
        }
        return null;
      });

      if (!cssText) {
        const i18n = getI18n();
        const labels = i18n.t('cli.errors.labels') as {
          devModeCssNotFound?: string;
        };
        warnings.push(
          labels.devModeCssNotFound ??
            '未找到 Dev Mode CSS 侧栏（可能需要 Figma 付费订阅或页面结构变化）',
        );
      }

      return cssText ?? undefined;
    } catch (error) {
      warnings.push(
        `抓取 Dev Mode CSS 失败: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }

  /**
   * 获取当前配置
   *
   * @returns 配置选项的只读副本
   */
  getOptions(): Readonly<BrowserFallbackOptions> {
    return { ...this._options };
  }

  /**
   * 更新配置
   *
   * @param options - 要更新的配置项
   */
  updateOptions(options: Partial<BrowserFallbackOptions>): void {
    Object.assign(this._options, options);
    // 配置变更后清除可用性缓存（如 browser 变化可能影响可用性）
    if (options.browser !== undefined) {
      this._availabilityCache = null;
    }
  }
}

// ============ 单例管理 ============

let browserFallbackInstance: BrowserFallbackService | null = null;

/**
 * 获取 BrowserFallbackService 单例
 *
 * @param options - 首次创建时的配置选项
 * @returns BrowserFallbackService 实例
 */
export function getBrowserFallbackService(
  options?: Partial<BrowserFallbackOptions>,
): BrowserFallbackService {
  if (!browserFallbackInstance) {
    browserFallbackInstance = new BrowserFallbackService(options);
  }
  return browserFallbackInstance;
}

/**
 * 重置 BrowserFallbackService 单例（主要用于测试）
 */
export function resetBrowserFallbackService(): void {
  browserFallbackInstance = null;
}
