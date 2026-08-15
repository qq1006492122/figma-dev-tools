/**
 * Playwright 可选依赖的类型声明
 *
 * Playwright 是 figma-dev-tools v1.4.4 浏览器兜底服务的可选依赖。
 * 当用户未安装 Playwright 时，运行时通过动态 import() 优雅降级，
 * 但 TypeScript 编译期需要类型声明以避免 TS2307 错误。
 *
 * 安装 Playwright 后（npm install playwright），真实类型会覆盖此声明。
 *
 * @module
 */

declare module 'playwright' {
  /**
   * 浏览器类型枚举（chromium/firefox/webkit）
   *
   * 注意：此处仅声明兜底用到的最小子集。
   * 安装真实 Playwright 后，其自带类型会覆盖此声明。
   */
  export interface Browser {
    /** 创建浏览器上下文 */
    newContext(options?: {
      deviceScaleFactor?: number;
      viewport?: { width: number; height: number };
      userAgent?: string;
      locale?: string;
    }): Promise<BrowserContext>;
    /** 关闭浏览器 */
    close(): Promise<void>;
  }

  /** 浏览器上下文 */
  export interface BrowserContext {
    /** 添加 Cookie */
    addCookies(cookies: Array<{
      name: string;
      value: string;
      domain: string;
      path: string;
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: 'Strict' | 'Lax' | 'None';
    }>): Promise<void>;
    /** 创建新页面 */
    newPage(): Promise<Page>;
    /** 关闭上下文 */
    close(): Promise<void>;
  }

  /** 页面 */
  export interface Page {
    /** 导航到指定 URL */
    goto(url: string, options?: {
      waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
      timeout?: number;
    }): Promise<unknown>;
    /** 设置页面 HTML 内容（用于渲染 HTML 字符串） */
    setContent(html: string, options?: {
      waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
      timeout?: number;
    }): Promise<unknown>;
    /** 等待选择器匹配的元素出现 */
    waitForSelector(selector: string, options?: { timeout?: number }): Promise<unknown>;
    /** 等待指定毫秒 */
    waitForTimeout(ms: number): Promise<void>;
    /** 整页截图 */
    screenshot(options?: {
      fullPage?: boolean;
      type?: 'png' | 'jpeg';
    }): Promise<Buffer>;
    /** 在页面上下文中执行函数（浏览器端运行） */
    evaluate<T>(fn: () => T): Promise<T>;
    /** 获取元素定位器 */
    locator(selector: string): Locator;
  }

  /** 元素定位器 */
  export interface Locator {
    /** 取第一个匹配元素 */
    first(): Locator;
    /** 元素是否可见 */
    isVisible(): Promise<boolean>;
    /** 滚动到可视区（如需要） */
    scrollIntoViewIfNeeded(options?: { timeout?: number }): Promise<void>;
    /** 元素截图 */
    screenshot(options?: { type?: 'png' | 'jpeg' }): Promise<Buffer>;
  }

  /** 浏览器启动器（chromium/firefox/webkit） */
  export interface BrowserType {
    /** 启动浏览器 */
    launch(options?: { headless?: boolean }): Promise<Browser>;
  }

  /** 模块导出：包含 chromium/firefox/webkit 三种浏览器类型 */
  export const chromium: BrowserType;
  export const firefox: BrowserType;
  export const webkit: BrowserType;
}
