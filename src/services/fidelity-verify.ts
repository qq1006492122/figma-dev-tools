/**
 * 还原度校验服务 - Fidelity Verify Service
 *
 * v1.4.4 新增：将 Figma 设计稿截图与生成代码的渲染截图进行像素级 diff，
 * 输出量化还原度评分 + 差异热力图，帮助用户快速定位失真区域。
 *
 * 核心能力：
 * - 下载 Figma 节点截图（通过 URL 或本地 Buffer）
 * - 使用 Playwright 渲染生成代码并截图（复用 BrowserFallbackService 的浏览器引擎）
 * - 使用 pixelmatch 进行像素 diff（可选依赖，未安装时优雅降级）
 * - 输出还原度评分（0-100%）、差异像素数、差异像素占比
 * - 输出差异热力图（PNG，红色标记差异区域）
 * - 支持自定义颜色差异阈值
 *
 * 使用场景：
 * 1. figma_generate_jsx 生成代码后，调用此工具验证还原度
 * 2. 浏览器兜底近似模式下，对比近似代码与 Figma 截图
 * 3. 持续集成中作为还原度门槛检查
 *
 * 依赖说明：
 * - pixelmatch（高星项目，16k+ stars，业界标准像素 diff 库）
 * - pngjs（纯 JS PNG 解码，无原生依赖）
 * - playwright（复用 BrowserFallbackService 的动态导入机制）
 *
 * @module
 */

// ============ 依赖导入 ============

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { getI18n } from '../i18n/index.js';

// ============ 类型定义 ============

/**
 * 还原度校验配置选项
 */
export interface FidelityVerifyOptions {
  /** 颜色差异阈值（0-1），默认 0.1。值越小越严格 */
  threshold: number;
  /** 输出目录（差异热力图与代码截图写入位置），默认 os.tmpdir() */
  outputDir: string;
  /** 是否生成差异热力图，默认 true */
  generateDiffImage: boolean;
  /** 代码截图的 devicePixelRatio，默认 2 */
  devicePixelRatio: number;
  /** 代码截图的视口宽度（像素），默认 0 表示用 Figma 截图宽度 */
  viewportWidth: number;
  /** 代码截图的视口高度（像素），默认 0 表示用 Figma 截图高度 */
  viewportHeight: number;
  /** Playwright 无头模式，默认 true */
  headless: boolean;
  /** 页面加载超时（毫秒），默认 30000 */
  timeout: number;
}

/**
 * 还原度校验结果
 */
export interface FidelityVerifyResult {
  /** 还原度评分（0-100，100 表示完全一致） */
  fidelityScore: number;
  /** 差异像素数 */
  diffPixels: number;
  /** 总像素数 */
  totalPixels: number;
  /** 差异像素占比（0-1） */
  diffRatio: number;
  /** Figma 截图宽度 */
  figmaWidth: number;
  /** Figma 截图高度 */
  figmaHeight: number;
  /** 代码截图宽度 */
  codeWidth: number;
  /** 代码截图高度 */
  codeHeight: number;
  /** 差异热力图文件路径（如已生成） */
  diffImagePath?: string;
  /** 代码截图文件路径 */
  codeScreenshotPath: string;
  /** Figma 截图文件路径（本地缓存） */
  figmaScreenshotPath: string;
  /** 还原度等级（excellent/good/acceptable/poor） */
  grade: FidelityGrade;
  /** 还原度评分说明 */
  gradeDescription: string;
  /** 校验过程中产生的警告信息 */
  warnings: string[];
  /** 校验时间戳 */
  verifiedAt: number;
}

/**
 * 还原度等级
 */
export type FidelityGrade =
  /** 95-100%：几乎完全一致 */
  | 'excellent'
  /** 85-94%：还原良好，少量细节差异 */
  | 'good'
  /** 70-84%：可接受，部分区域需校对 */
  | 'acceptable'
  /** <70%：差异较大，需重新校对 */
  | 'poor';

/**
 * 可选依赖可用性检查结果
 */
export interface DependencyAvailability {
  /** 是否已安装 */
  available: boolean;
  /** 未安装时的依赖名称 */
  missingDependencies: string[];
  /** 安装建议 */
  installHint: string;
}

// ============ 常量定义 ============

/**
 * 默认配置
 */
const DEFAULT_OPTIONS: FidelityVerifyOptions = {
  threshold: 0.1,
  outputDir: os.tmpdir(),
  generateDiffImage: true,
  devicePixelRatio: 2,
  viewportWidth: 0,
  viewportHeight: 0,
  headless: true,
  timeout: 30000,
};

/**
 * 还原度等级阈值
 */
const GRADE_THRESHOLDS = {
  excellent: 95,
  good: 85,
  acceptable: 70,
} as const;

/**
 * 还原度等级描述（中文）
 */
const GRADE_DESCRIPTIONS_ZH: Record<FidelityGrade, string> = {
  excellent: '还原度优秀（95-100%），几乎与设计稿完全一致',
  good: '还原度良好（85-94%），仅有少量细节差异',
  acceptable: '还原度可接受（70-84%），部分区域需人工校对',
  poor: '还原度较差（<70%），差异较大，建议重新校对',
};

/**
 * 还原度等级描述（英文）
 */
const GRADE_DESCRIPTIONS_EN: Record<FidelityGrade, string> = {
  excellent: 'Excellent fidelity (95-100%), nearly identical to design',
  good: 'Good fidelity (85-94%), minor detail differences',
  acceptable: 'Acceptable fidelity (70-84%), some areas need manual review',
  poor: 'Poor fidelity (<70%), significant differences, recommend re-checking',
};

/**
 * 将本地文件路径转换为跨平台 file:// URL
 *
 * 修复逻辑黑洞：原实现使用 `file:///${path.replace(/\\/g, '/')}`，
 * 在 Linux 上会得到 `file:////home/user/file.html`（多一个斜杠），
 * 在 Windows 上虽然恰好正确但不规范。
 * 改用 Node.js 内置的 url.pathToFileURL，自动处理跨平台差异。
 *
 * @param filePath - 本地文件路径（绝对路径）
 * @returns 跨平台 file:// URL 字符串
 */
function _pathToFileUrl(filePath: string): string {
  return pathToFileURL(filePath).toString();
}

// ============ FidelityVerifyService 类 ============

/**
 * 还原度校验服务
 *
 * 将 Figma 截图与生成代码的渲染截图进行像素级 diff，输出量化还原度评分。
 */
export class FidelityVerifyService {
  /** 配置选项（已合并默认值） */
  private readonly _options: FidelityVerifyOptions;
  /** pixelmatch 模块缓存 */
  private _pixelmatchModule: (typeof import('pixelmatch'))['default'] | null = null;
  /** pngjs PNG 模块缓存 */
  private _pngModule: typeof import('pngjs') | null = null;
  /** 可选依赖可用性缓存 */
  private _dependencyCache: DependencyAvailability | null = null;

  /**
   * 构造函数
   *
   * @param options - 配置选项（部分提供时合并默认值）
   */
  constructor(options: Partial<FidelityVerifyOptions> = {}) {
    this._options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * 检查可选依赖（pixelmatch + pngjs）是否可用
   *
   * 使用动态 import 尝试加载。
   *
   * 缓存策略：
   * - 仅缓存「可用」结果（available=true），避免用户安装后仍命中旧缓存
   * - 「不可用」结果不缓存，每次都重试，以便用户安装后立即生效
   *
   * @returns 可用性检查结果
   */
  async checkDependencies(): Promise<DependencyAvailability> {
    // 仅缓存「可用」结果，不可用时不缓存（允许重试）
    if (this._dependencyCache?.available) {
      return this._dependencyCache;
    }

    const missing: string[] = [];

    try {
      const pngjs = await import('pngjs');
      this._pngModule = pngjs;
    } catch {
      missing.push('pngjs');
    }

    try {
      const pixelmatchModule = await import('pixelmatch');
      this._pixelmatchModule = pixelmatchModule.default;
    } catch {
      missing.push('pixelmatch');
    }

    if (missing.length === 0) {
      this._dependencyCache = {
        available: true,
        missingDependencies: [],
        installHint: '',
      };
      return this._dependencyCache;
    }

    // 不可用：不缓存，允许下次重试
    const i18n = getI18n();
    const labels = i18n.t('cli.errors.labels') as {
      fidelityDepsInstallHint?: string;
    };
    return {
      available: false,
      missingDependencies: missing,
      installHint:
        labels.fidelityDepsInstallHint ??
        `运行 npm install ${missing.join(' ')} 安装备用依赖`,
    };
  }

  /**
   * 校验还原度
   *
   * 流程：
   * 1. 检查所有依赖（pixelmatch + pngjs + Playwright，避免渲染中途失败）
   * 2. 获取 Figma 截图（下载 URL 或读取本地文件）
   * 3. 使用 Playwright 渲染生成代码并截图
   * 4. 将两张截图统一到相同尺寸
   * 5. 使用 pixelmatch 进行像素 diff
   * 6. 计算还原度评分与等级（评分 clamp 到 [0, 100]）
   * 7. 输出差异热力图（如启用）
   *
   * @param figmaScreenshot - Figma 截图来源（URL 或本地文件路径）
   * @param codeContent - 生成代码内容（HTML 字符串或文件路径）
   * @param codeSourceType - 代码来源类型
   * @returns 还原度校验结果
   */
  async verifyFidelity(
    figmaScreenshot: string,
    codeContent: string,
    codeSourceType: 'html-string' | 'file-path',
  ): Promise<FidelityVerifyResult> {
    const warnings: string[] = [];
    const verifiedAt = Date.now();

    // ============ 1. 检查依赖（pixelmatch + pngjs + Playwright 一次性检查） ============
    // 修复逻辑黑洞：原实现先检查 pixelmatch/pngjs，等到渲染时才发现 Playwright 缺失，
    // 用户需要等很久才能看到错误。这里提前检查所有依赖，快速失败。
    const deps = await this.checkDependencies();
    if (!deps.available) {
      throw new Error(
        `还原度校验依赖缺失: ${deps.missingDependencies.join(', ')}。${deps.installHint}`,
      );
    }
    // 提前检查 Playwright（不渲染时就发现缺失，避免下载截图后才发现渲染失败）
    try {
      await import('playwright');
    } catch {
      const i18n = getI18n();
      const labels = i18n.t('cli.errors.labels') as {
        playwrightInstallHint?: string;
      };
      throw new Error(
        `还原度校验需要 Playwright 渲染生成代码。${
          labels.playwrightInstallHint ??
          '运行 npm install playwright && npx playwright install chromium 安装浏览器引擎'
        }`,
      );
    }

    // ============ 2. 获取 Figma 截图 Buffer ============
    const figmaBuffer = await this._loadScreenshot(figmaScreenshot, warnings);
    const figmaPng = this._pngModule!.PNG.sync.read(figmaBuffer);
    const figmaWidth = figmaPng.width;
    const figmaHeight = figmaPng.height;

    // ============ 3. 渲染生成代码并截图 ============
    const targetWidth = this._options.viewportWidth > 0 ? this._options.viewportWidth : figmaWidth;
    const targetHeight =
      this._options.viewportHeight > 0 ? this._options.viewportHeight : figmaHeight;

    const codeScreenshotBuffer = await this._renderCodeAndScreenshot(
      codeContent,
      codeSourceType,
      targetWidth,
      targetHeight,
      warnings,
    );
    const codePng = this._pngModule!.PNG.sync.read(codeScreenshotBuffer);
    const codeWidth = codePng.width;
    const codeHeight = codePng.height;

    // ============ 4. 统一尺寸（以 Figma 截图为基准） ============
    // pixelmatch 要求两张图尺寸完全一致
    const { img1Data, img2Data, diffData, unifiedWidth, unifiedHeight } =
      this._unifyImageSizes(figmaPng, codePng, warnings);

    // ============ 5. 像素 diff ============
    const diffPixels = this._pixelmatchModule!(
      img1Data,
      img2Data,
      diffData,
      unifiedWidth,
      unifiedHeight,
      { threshold: this._options.threshold },
    );

    const totalPixels = unifiedWidth * unifiedHeight;
    // 边界场景：totalPixels 为 0 会导致 diffRatio = NaN
    // _unifyImageSizes 已保证 unifiedWidth/Height > 0，这里再做防御性检查
    const diffRatio = totalPixels > 0 ? diffPixels / totalPixels : 1;
    // 修复逻辑黑洞：clamp 到 [0, 100]，防止 diffRatio > 1 时得到负分
    const rawScore = (1 - diffRatio) * 100;
    const fidelityScore = Math.round(Math.max(0, Math.min(100, rawScore)) * 100) / 100;

    // ============ 6. 输出差异热力图 ============
    let diffImagePath: string | undefined;
    if (this._options.generateDiffImage && diffPixels > 0) {
      const diffFileName = `fidelity-diff-${verifiedAt}.png`;
      diffImagePath = path.join(this._options.outputDir, diffFileName);
      try {
        await fs.mkdir(this._options.outputDir, { recursive: true });
        const diffBuffer = this._pngModule!.PNG.sync.write({
          width: unifiedWidth,
          height: unifiedHeight,
          data: diffData,
        });
        await fs.writeFile(diffImagePath, diffBuffer);
      } catch (error) {
        warnings.push(
          `写入差异热力图失败: ${error instanceof Error ? error.message : String(error)}`,
        );
        diffImagePath = undefined;
      }
    }

    // ============ 7. 保存代码截图与 Figma 截图（本地缓存） ============
    const codeScreenshotPath = path.join(
      this._options.outputDir,
      `fidelity-code-${verifiedAt}.png`,
    );
    const figmaScreenshotPath = path.join(
      this._options.outputDir,
      `fidelity-figma-${verifiedAt}.png`,
    );
    try {
      await fs.mkdir(this._options.outputDir, { recursive: true });
      await fs.writeFile(codeScreenshotPath, codeScreenshotBuffer);
      await fs.writeFile(figmaScreenshotPath, figmaBuffer);
    } catch (error) {
      warnings.push(
        `保存截图缓存失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // ============ 8. 计算还原度等级 ============
    const grade = this._calculateGrade(fidelityScore);
    const gradeDescription = this._getGradeDescription(grade);

    return {
      fidelityScore,
      diffPixels,
      totalPixels,
      diffRatio,
      figmaWidth,
      figmaHeight,
      codeWidth,
      codeHeight,
      diffImagePath,
      codeScreenshotPath,
      figmaScreenshotPath,
      grade,
      gradeDescription,
      warnings,
      verifiedAt,
    };
  }

  /**
   * 加载截图文件（URL 或本地路径）
   *
   * URL 形式：通过 fetch 下载，带超时保护（30 秒），避免网络不通时永久挂起。
   * 本地路径形式：直接读取文件。
   *
   * @param source - 截图来源（http URL 或本地文件路径）
   * @param warnings - 警告信息输出数组
   * @returns PNG 文件 Buffer
   */
  private async _loadScreenshot(source: string, warnings: string[]): Promise<Buffer> {
    // URL 形式：通过 fetch 下载，带 30 秒超时
    if (source.startsWith('http://') || source.startsWith('https://')) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      try {
        const response = await fetch(source, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(
            `下载 Figma 截图失败: HTTP ${response.status} ${response.statusText}`,
          );
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('下载 Figma 截图超时（30 秒），请检查网络连接或改用本地文件路径');
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    // 本地文件路径形式：直接读取
    try {
      const buffer = await fs.readFile(source);
      return buffer;
    } catch (error) {
      throw new Error(
        `读取 Figma 截图文件失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 使用 Playwright 渲染生成代码并截图
   *
   * 复用 BrowserFallbackService 的 Playwright 动态导入机制。
   * Playwright 可用性已在 verifyFidelity 入口处提前检查，此处不再重复检查。
   *
   * @param codeContent - 代码内容（HTML 字符串或文件路径）
   * @param codeSourceType - 代码来源类型
   * @param width - 视口宽度
   * @param height - 视口高度
   * @param warnings - 警告信息输出数组
   * @returns 截图 Buffer
   */
  private async _renderCodeAndScreenshot(
    codeContent: string,
    codeSourceType: 'html-string' | 'file-path',
    width: number,
    height: number,
    warnings: string[],
  ): Promise<Buffer> {
    // 动态导入 Playwright（verifyFidelity 已做依赖检查，此处理论必成功）
    const playwright = await import('playwright');

    // 准备要渲染的 HTML 内容
    // 修复逻辑黑洞：原实现 baseUrl 变量赋值后从未使用（死代码），已删除。
    let htmlContent: string;
    // fileUrl 用于 file-path 形式加载，保留相对路径资源引用
    let fileUrl: string | undefined;

    if (codeSourceType === 'file-path') {
      // 文件路径形式：读取文件内容，并构造跨平台 file:// URL
      try {
        htmlContent = await fs.readFile(codeContent, 'utf8');
        // 修复逻辑黑洞：原实现手动拼接 'file:///' + codeContent，
        // 在 Linux 上会得到 'file:////home/...' 多一个斜杠。
        // 改用 Node.js 内置 url.pathToFileURL，自动处理跨平台路径差异。
        fileUrl = _pathToFileUrl(codeContent);
      } catch (error) {
        throw new Error(
          `读取代码文件失败: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } else {
      // HTML 字符串形式：直接使用
      htmlContent = codeContent;
    }

    const browser = await playwright.chromium.launch({ headless: this._options.headless });

    try {
      const context = await browser.newContext({
        deviceScaleFactor: this._options.devicePixelRatio,
        viewport: { width, height },
      });

      const page = await context.newPage();

      // 加载 HTML 内容
      if (fileUrl) {
        // 文件路径形式：使用 file:// 协议加载，保留相对路径资源引用
        await page.goto(fileUrl, {
          waitUntil: 'networkidle',
          timeout: this._options.timeout,
        });
      } else {
        // HTML 字符串形式：直接设置内容
        await page.setContent(htmlContent, {
          waitUntil: 'networkidle',
          timeout: this._options.timeout,
        });
      }

      // 额外等待 1 秒让字体和样式加载完成
      await page.waitForTimeout(1000);

      // 截图
      const screenshotBuffer = (await page.screenshot({
        fullPage: false,
        type: 'png',
      })) as Buffer;

      return screenshotBuffer;
    } finally {
      await browser.close();
    }
  }

  /**
   * 统一两张图的尺寸（以第一张图为基准）
   *
   * pixelmatch 要求两张图尺寸完全一致。如果尺寸不同，将第二张图裁剪或填充到与第一张相同。
   * 这里采用简单策略：以较小的宽高为基准裁剪两张图。
   *
   * @param png1 - 第一张 PNG（Figma 截图）
   * @param png2 - 第二张 PNG（代码截图）
   * @param warnings - 警告信息输出数组
   * @returns 统一尺寸后的像素数据 + 差异图缓冲区
   */
  private _unifyImageSizes(
    png1: import('pngjs').PNGData,
    png2: import('pngjs').PNGData,
    warnings: string[],
  ): {
    img1Data: Uint8Array;
    img2Data: Uint8Array;
    diffData: Buffer;
    unifiedWidth: number;
    unifiedHeight: number;
  } {
    const unifiedWidth = Math.min(png1.width, png2.width);
    const unifiedHeight = Math.min(png1.height, png2.height);

    // 边界场景：尺寸为 0 时 pixelmatch 会崩溃，提前拦截
    if (unifiedWidth <= 0 || unifiedHeight <= 0) {
      throw new Error(
        `截图尺寸无效（Figma: ${png1.width}x${png1.height}, 代码: ${png2.width}x${png2.height}），无法进行像素 diff。请检查截图是否正确生成。`,
      );
    }

    if (png1.width !== png2.width || png1.height !== png2.height) {
      warnings.push(
        `截图尺寸不一致（Figma: ${png1.width}x${png1.height}, 代码: ${png2.width}x${png2.height}），已裁剪到 ${unifiedWidth}x${unifiedHeight} 进行比较`,
      );
    }

    // 裁剪两张图到统一尺寸
    const img1Data = this._cropPngData(png1, unifiedWidth, unifiedHeight);
    const img2Data = this._cropPngData(png2, unifiedWidth, unifiedHeight);

    // 创建差异图缓冲区
    const diffData = Buffer.alloc(unifiedWidth * unifiedHeight * 4);

    return {
      img1Data,
      img2Data,
      diffData,
      unifiedWidth,
      unifiedHeight,
    };
  }

  /**
   * 裁剪 PNG 数据到指定尺寸
   *
   * 从左上角开始裁剪，保留指定宽高范围内的像素。
   *
   * @param png - 原始 PNG 数据
   * @param targetWidth - 目标宽度
   * @param targetHeight - 目标高度
   * @returns 裁剪后的像素数据
   */
  private _cropPngData(
    png: import('pngjs').PNGData,
    targetWidth: number,
    targetHeight: number,
  ): Uint8Array {
    // 如果尺寸已经一致，直接返回
    if (png.width === targetWidth && png.height === targetHeight) {
      return png.data;
    }

    const cropped = Buffer.alloc(targetWidth * targetHeight * 4);

    for (let y = 0; y < targetHeight; y++) {
      for (let x = 0; x < targetWidth; x++) {
        const srcIdx = (y * png.width + x) * 4;
        const dstIdx = (y * targetWidth + x) * 4;
        cropped[dstIdx] = png.data[srcIdx]!;
        cropped[dstIdx + 1] = png.data[srcIdx + 1]!;
        cropped[dstIdx + 2] = png.data[srcIdx + 2]!;
        cropped[dstIdx + 3] = png.data[srcIdx + 3]!;
      }
    }

    return cropped;
  }

  /**
   * 根据还原度评分计算等级
   *
   * @param score - 还原度评分（0-100）
   * @returns 还原度等级
   */
  private _calculateGrade(score: number): FidelityGrade {
    if (score >= GRADE_THRESHOLDS.excellent) return 'excellent';
    if (score >= GRADE_THRESHOLDS.good) return 'good';
    if (score >= GRADE_THRESHOLDS.acceptable) return 'acceptable';
    return 'poor';
  }

  /**
   * 获取还原度等级描述（按用户语言）
   *
   * @param grade - 还原度等级
   * @returns 等级描述字符串
   */
  private _getGradeDescription(grade: FidelityGrade): string {
    const i18n = getI18n();
    const isZh = i18n.getLanguage() === 'zh-CN';
    return isZh ? GRADE_DESCRIPTIONS_ZH[grade] : GRADE_DESCRIPTIONS_EN[grade];
  }

  /**
   * 获取当前配置
   *
   * @returns 配置选项的只读副本
   */
  getOptions(): Readonly<FidelityVerifyOptions> {
    return { ...this._options };
  }

  /**
   * 更新配置
   *
   * @param options - 要更新的配置项
   */
  updateOptions(options: Partial<FidelityVerifyOptions>): void {
    Object.assign(this._options, options);
  }
}

// ============ 单例管理 ============

let fidelityVerifyInstance: FidelityVerifyService | null = null;

/**
 * 获取 FidelityVerifyService 单例
 *
 * @param options - 首次创建时的配置选项
 * @returns FidelityVerifyService 实例
 */
export function getFidelityVerifyService(
  options?: Partial<FidelityVerifyOptions>,
): FidelityVerifyService {
  if (!fidelityVerifyInstance) {
    fidelityVerifyInstance = new FidelityVerifyService(options);
  }
  return fidelityVerifyInstance;
}

/**
 * 重置 FidelityVerifyService 单例（主要用于测试）
 */
export function resetFidelityVerifyService(): void {
  fidelityVerifyInstance = null;
}
