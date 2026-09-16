/**
 * OCR 文本提取服务 - OCR Text Extraction Service
 *
 * 提供从 Figma 设计稿或本地图片中提取文字的能力，采用「原生优先、OCR 兜底」的混合策略：
 *
 * 1. 原生提取：当拿到 Figma 节点 JSON 时，直接遍历 TEXT 节点读取 `characters` 字段，
 *    零依赖、100% 准确、无需安装任何 OCR 库。
 * 2. OCR 兜底：当只有图片（本地文件或 Figma 导出的 PNG）而没有节点 JSON 时，
 *    使用 tesseract.js 进行光学字符识别（可选依赖，未安装时优雅降级）。
 *
 * 使用场景：
 * 1. 从 Figma 设计稿提取文案，用于国际化、文案校对、SEO 关键词提取
 * 2. 从设计稿截图/切图中提取文字（无 Figma Token 或节点 JSON 不可用时）
 * 3. 辅助代码生成时对齐设计稿文案
 *
 * 依赖说明：
 * - tesseract.js（纯 JS OCR 引擎，wasm 内核，支持 100+ 语言）
 *   可选依赖，仅在走图片 OCR 时需要使用。
 *
 * @module
 */

// ============ 依赖导入 ============

import * as fs from 'node:fs/promises';
import { lookup } from 'node:dns/promises';
import * as net from 'node:net';

import { getI18n } from '../i18n/index.js';
import { FigmaDevError, isFigmaDevError } from '../utils/errors.js';
import type { FigmaNode } from '../types.js';
import { downloadHttpBuffer } from './ca-aware-downloader.js';
import { loadCustomCaConfig, type CustomCaConfig } from './tls-agent.js';

// ============ 类型定义 ============

/**
 * OCR 服务配置选项
 */
export interface OcrOptions {
  /** OCR 语言（tesseract 语言代码，可用 '+' 组合），默认 'chi_sim+eng' */
  language: string;
  /** OCR 引擎模式：1 = LSTM（推荐，默认） */
  oem: number;
  /** 页面分割模式（PSM），默认 3 = 自动 */
  psm: number;
}

/**
 * 单条文本提取结果
 */
export interface OcrTextItem {
  /** 文本内容 */
  text: string;
  /** 置信度（0-100，仅 OCR 路径提供；原生提取恒为 100） */
  confidence: number;
  /** 文本来源：native = 节点 JSON 原生提取，ocr = tesseract 识别 */
  source: 'native' | 'ocr';
  /** 节点 ID（仅原生提取时提供） */
  nodeId?: string;
  /** 节点名称（仅原生提取时提供） */
  nodeName?: string;
  /** 文本边界框（仅 OCR 路径提供） */
  bbox?: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

/**
 * OCR 提取结果
 */
export interface OcrResult {
  /** 提取出的所有文本条目 */
  items: OcrTextItem[];
  /** 拼接后的完整文本（按顺序换行连接） */
  text: string;
  /** 使用的提取策略 */
  strategy: 'native' | 'ocr' | 'hybrid';
  /** 平均置信度（0-100） */
  confidence: number;
  /** 提取过程中的警告信息 */
  warnings: string[];
  /** 提取时间戳 */
  extractedAt: number;
}

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
const DEFAULT_OPTIONS: OcrOptions = {
  language: 'chi_sim+eng',
  oem: 1,
  psm: 3,
};

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const REMOTE_IMAGE_TIMEOUT_MS = 30_000;

function hasSupportedImageSignature(buffer: Buffer): boolean {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return true;
  }
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return true;
  if (buffer.length >= 6 && (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a')) return true;
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return true;
  if (buffer.length >= 2 && buffer.subarray(0, 2).equals(Buffer.from([0x42, 0x4d]))) return true;
  return buffer.length >= 4 && (buffer.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) || buffer.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a])));
}

function validateImageBuffer(buffer: Buffer): Buffer {
  if (buffer.length === 0) throw new Error('图片数据不能为空');
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('图片数据不能超过 10 MiB');
  if (!hasSupportedImageSignature(buffer)) throw new Error('图片格式不受支持或图片数据无效');
  return buffer;
}

function validateOcrOptions(options: OcrOptions): OcrOptions {
  if (!options.language.trim()) throw new FigmaDevError('OCR_ERROR', 'OCR language 不能为空');
  if (!Number.isInteger(options.psm) || options.psm < 1 || options.psm > 13) {
    throw new FigmaDevError('OCR_ERROR', 'OCR PSM 必须是 1-13');
  }
  if (!Number.isInteger(options.oem) || options.oem < 0 || options.oem > 3) {
    throw new FigmaDevError('OCR_ERROR', 'OCR OEM 必须是 0-3');
  }
  return options;
}

export async function readResponseWithLimit(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) throw new Error('远程图片响应为空');
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > maxBytes) throw new Error('远程图片不能超过 10 MiB');
      chunks.push(chunk);
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

/**
 * 判断主机名/IP 是否为本机、内网或保留地址（SSRF 黑名单）。
 *
 * 覆盖 RFC 9110/6890/6598/2544/5737/8155 等保留/特殊段；导出供单元测试逐段回归。
 */
export function isPrivateOrReservedAddress(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  const address = mappedIpv4 ?? normalized;
  if (address === 'localhost' || address.endsWith('.localhost')) return true;

  const ipVersion = net.isIP(address);
  if (ipVersion === 4) {
    const [first, second, third] = address.split('.').map(Number);
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second !== undefined && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
      // 192.0.0.0/24 由 third===0 整段拦截；192.0.2.0/24（TEST-NET-1）单独拦截
      (first === 192 && second === 0 && (third === 0 || third === 2)) ||
      (first === 192 && second === 168) ||
      // RFC 2544 基准测试段为 198.18.0.0/15，同时包含 198.18.x 与 198.19.x
      (first === 198 && (second === 18 || second === 19)) ||
      (first === 198 && second === 51 && third === 100) ||
      (first === 203 && second === 0 && third === 113) ||
      (first !== undefined && first >= 224)
    );
  }

  if (ipVersion === 6) {
    return (
      address === '::1' ||
      address === '::' ||
      address.startsWith('fe80:') ||
      address.startsWith('fc') ||
      address.startsWith('fd')
    );
  }

  return address === 'localhost' || address.endsWith('.localhost');
}

/** DNS 解析结果形状（与 node:dns/promises.lookup({all:true}) 一致） */
interface DnsAddressRecord {
  address: string;
}

/**
 * 远程图片网络接缝：仅供单元测试注入，生产路径不传，行为与默认实现完全一致。
 */
export interface RemoteImageNetworkSeams {
  /** DNS 解析实现，默认 node:dns/promises.lookup */
  lookup?: (hostname: string, options: { all: true }) => Promise<DnsAddressRecord[]>;
  /** fetch 实现，默认全局 fetch（无自定义 CA 时使用） */
  fetchImpl?: typeof fetch;
  /** 自定义 CA 配置提供者，默认读取 FIGMA_CA_CERT_PATH（仅供单元测试注入） */
  loadCaConfig?: () => CustomCaConfig | undefined;
  /** 自定义 CA 存在时的 http(s) 缓冲下载实现，默认 node:http/https 下载器 */
  httpDownload?: (
    url: URL,
    options: { signal: AbortSignal; maxBytes: number; caConfig: CustomCaConfig },
  ) => Promise<Buffer>;
}

export async function validateRemoteImageUrl(
  source: string,
  seams: RemoteImageNetworkSeams = {},
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new Error(`无效的远程图片 URL: ${source}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('远程图片 URL 仅支持 HTTP 或 HTTPS 协议');
  }
  if (url.username || url.password) {
    throw new Error('远程图片 URL 不允许包含用户名或密码');
  }
  if (isPrivateOrReservedAddress(url.hostname)) {
    throw new Error('远程图片 URL 不允许指向本机、内网或保留地址');
  }
  if (net.isIP(url.hostname) === 0) {
    // 任一解析结果落在内网/保留段即拒绝（防止同时返回公网+内网地址绕过）。
    //
    // 安全说明（DNS rebinding 残留 TOCTOU 风险）：此处先解析校验，随后 fetch
    // 建连时会再次独立解析 DNS，两次查询之间存在时间窗。攻击者控制低 TTL 权威
    // DNS 时可在校验通过后把地址切换为 127.0.0.1/内网。当前缓解措施：
    //   1) 域名解析结果任一为内网/保留地址即拒绝；
    //   2) fetch 使用 redirect:'error'，禁止 3xx 跳转到未校验主机；
    //   3) 仅允许 http/https、拒绝 URL 凭据。
    // 彻底消除需自定义 undici dispatcher 的 connect.lookup，把已校验 IP 钉到
    // 连接层，作为后续加固项（Node 20 原生 fetch 不支持直接传 lookup）。
    const resolveDns: NonNullable<RemoteImageNetworkSeams['lookup']> =
      seams.lookup ?? ((hostname) => lookup(hostname, { all: true }));
    const resolved = await resolveDns(url.hostname, { all: true });
    if (resolved.length === 0 || resolved.some(({ address }) => isPrivateOrReservedAddress(address))) {
      throw new Error('远程图片 URL 解析到了本机、内网或保留地址');
    }
  }
  return url;
}

/**
 * 将图片来源解析为二进制数据。
 *
 * 外部调用者可传 Buffer、本地路径、http(s) URL 或 base64 data URI。远程和本地
 * 图片都限制为 10 MiB，避免一次 OCR 调用意外占用过多内存。
 *
 * @param image - 图片二进制、本地路径、远程 URL 或 data URI
 * @param seams - 仅供单元测试注入 DNS/fetch 接缝，生产调用无需传
 */
export async function resolveImageBuffer(
  image: Buffer | string,
  seams: RemoteImageNetworkSeams = {},
): Promise<Buffer> {
  if (Buffer.isBuffer(image)) {
    return validateImageBuffer(image);
  }

  const source = image.trim();
  if (!source) throw new Error('图片来源不能为空');

  if (source.startsWith('data:')) {
    const match = /^data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/\s]+=*)$/i.exec(source);
    if (!match?.[1]) {
      throw new Error('无效的图片 base64 data URI：仅支持 data:image/*;base64,... 格式');
    }
    const buffer = Buffer.from(match[1].replace(/\s/g, ''), 'base64');
    return validateImageBuffer(buffer);
  }

  if (/^https?:\/\//i.test(source)) {
    const url = await validateRemoteImageUrl(source, seams);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REMOTE_IMAGE_TIMEOUT_MS);
    try {
      // 自定义 CA 分支：全局 fetch（undici）无法注入 https.Agent，改走 node:http/https
      // 下载器；下载器同样禁 3xx 跳转并在流式层强制 10 MiB 上限。
      const caConfig = (seams.loadCaConfig ?? loadCustomCaConfig)();
      if (caConfig) {
        const doDownload = seams.httpDownload ?? downloadHttpBuffer;
        const caBuffer = await doDownload(url, {
          signal: controller.signal,
          maxBytes: MAX_IMAGE_BYTES,
          caConfig,
        });
        return validateImageBuffer(caBuffer);
      }
      // redirect:'error'：禁止跟随 3xx，避免跳转到未经过 SSRF 校验的主机
      const doFetch = seams.fetchImpl ?? fetch;
      const response = await doFetch(url, { signal: controller.signal, redirect: 'error' });
      if (!response.ok) {
        throw new Error(`下载远程图片失败 (HTTP ${response.status}): ${source}`);
      }
      const contentLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
        throw new Error('远程图片不能超过 10 MiB');
      }
      const buffer = await readResponseWithLimit(response, MAX_IMAGE_BYTES);
      return validateImageBuffer(buffer);
    } finally {
      clearTimeout(timeout);
    }
  }

  try {
    const stat = await fs.stat(source);
    if (!stat.isFile()) throw new Error('图片路径必须指向普通文件');
    if (stat.size > MAX_IMAGE_BYTES) throw new Error('本地图片不能超过 10 MiB');
    if (stat.size === 0) throw new Error('本地图片不能为空');
    return validateImageBuffer(await fs.readFile(source));
  } catch (error) {
    if (error instanceof Error && (error.message.includes('不能超过') || error.message.includes('不能为空'))) {
      throw error;
    }
    throw new Error(
      `读取图片文件失败: ${source}（${error instanceof Error ? error.message : String(error)}）`,
    );
  }
}

// ============ OcrService 类 ============

/**
 * OCR 文本提取服务
 *
 * 采用「原生优先、OCR 兜底」的混合策略。
 */
export class OcrService {
  /** 配置选项（已合并默认值） */
  private readonly _options: OcrOptions;
  /** tesseract.js 模块缓存（动态导入结果） */
  private _tesseractModule: typeof import('tesseract.js') | null = null;
  /** 可选依赖可用性缓存 */
  private _dependencyCache: DependencyAvailability | null = null;

  /**
   * 构造函数
   *
   * @param options - 配置选项（部分提供时合并默认值）
   */
  constructor(options: Partial<OcrOptions> = {}) {
    this._options = validateOcrOptions({ ...DEFAULT_OPTIONS, ...options });
  }

  /**
   * 检查可选依赖（tesseract.js）是否可用
   *
   * 缓存策略：
   * - 仅缓存「可用」结果（available=true），避免用户安装后仍命中旧缓存
   * - 「不可用」结果不缓存，每次都重试，以便用户安装后立即生效
   *
   * @returns 可用性检查结果
   */
  async checkDependencies(): Promise<DependencyAvailability> {
    if (this._dependencyCache?.available) {
      return this._dependencyCache;
    }

    const missing: string[] = [];

    try {
      const tesseract = await import('tesseract.js');
      this._tesseractModule = tesseract;
    } catch {
      missing.push('tesseract.js');
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
      ocrDepsInstallHint?: string;
    };
    return {
      available: false,
      missingDependencies: missing,
      installHint:
        labels.ocrDepsInstallHint ??
        `运行 npm install ${missing.join(' ')} 安装 OCR 依赖`,
    };
  }

  /**
   * 从 Figma 节点 JSON 原生提取文本
   *
   * 深度优先遍历节点树，收集所有可见 TEXT 节点的 `characters` 字段。
   * 零依赖、100% 准确。
   *
   * @param node - Figma 节点（可为任意类型，内部递归遍历）
   * @returns 提取结果
   */
  extractNativeText(node: FigmaNode): OcrResult {
    const items: OcrTextItem[] = [];
    this._walkTextNodes(node, items);

    const text = items.map((item) => item.text).join('\n');
    const confidence = 100;
    const extractedAt = Date.now();

    return {
      items,
      text,
      strategy: 'native',
      confidence,
      warnings: [],
      extractedAt,
    };
  }

  /**
   * 递归遍历节点树，收集 TEXT 节点文本
   *
   * @param node - 当前节点
   * @param items - 结果收集数组（原地追加）
   */
  private _walkTextNodes(node: FigmaNode, items: OcrTextItem[]): void {
    // 跳过不可见节点（visible === false 时隐藏，仍遍历其子节点无意义）
    if (node.visible === false) {
      return;
    }

    if (node.type === 'TEXT' && node.characters && node.characters.trim().length > 0) {
      items.push({
        text: node.characters,
        confidence: 100,
        source: 'native',
        nodeId: node.id,
        nodeName: node.name,
      });
    }

    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        this._walkTextNodes(child, items);
      }
    }
  }

  /**
   * 将图片来源归一化为 Buffer
   *
   * 支持三种输入来源：
   * 1. Buffer（原样返回）
   * 2. 本地文件路径（读取文件内容）
   * 3. 远程 http(s) URL（通过 fetch 下载）
   * 4. base64 data URI（如 data:image/png;base64,...）
   *
   * @param image - 图片来源：Buffer 或字符串（本地路径 / URL / base64 data URI）
   * @returns 图片二进制数据
   * @throws {Error} 输入格式无法识别或读取失败时抛出
   */
  private async _resolveImageBuffer(image: Buffer | string): Promise<Buffer> {
    return resolveImageBuffer(image);
  }

  /**
   * 从图片提取文本（tesseract.js OCR）
   *
   * @param image - 图片来源：Buffer、本地文件路径、远程 URL、或 base64 data URI
   * @returns 提取结果
   */
  async extractTextFromImage(
    image: Buffer | string,
  ): Promise<OcrResult> {
    const warnings: string[] = [];
    const extractedAt = Date.now();

    const deps = await this.checkDependencies();
    if (!deps.available) {
      throw new FigmaDevError(
        'OCR_ERROR',
        `OCR 依赖缺失: ${deps.missingDependencies.join(', ')}。${deps.installHint}`,
      );
    }

    const tesseract = this._tesseractModule!;
    let worker: Awaited<ReturnType<typeof tesseract.createWorker>> | null = null;

    try {
      // 先解析输入，避免无效路径触发昂贵的 OCR worker 初始化。
      const imageBuffer = await this._resolveImageBuffer(image);
      worker = await tesseract.createWorker(this._options.language, this._options.oem);
      await worker.setParameters({ tessedit_pageseg_mode: this._options.psm });
      const result = await worker.recognize(imageBuffer);

      const items: OcrTextItem[] = [];
      const data = result.data;
      const blocks = data.blocks ?? [];

      if (data.text && data.text.trim().length > 0) {
        if (blocks.length > 0) {
          for (const block of blocks) {
            const text = (block.text ?? '').trim();
            if (text.length === 0) continue;
            items.push({
              text,
              confidence: block.confidence ?? 0,
              source: 'ocr',
              bbox: block.bbox,
            });
          }
        } else {
          items.push({
            text: data.text.trim(),
            confidence: data.confidence ?? 0,
            source: 'ocr',
          });
        }
      }

      const text = items.map((item) => item.text).join('\n');
      const confidence =
        items.length > 0
          ? items.reduce((sum, item) => sum + item.confidence, 0) / items.length
          : 0;

      if (items.length === 0) {
        warnings.push('OCR 未识别到任何文本，请检查图片是否清晰或更换 language 参数');
      }

      return {
        items,
        text,
        strategy: 'ocr',
        confidence,
        warnings,
        extractedAt,
      };
    } catch (error) {
      if (isFigmaDevError(error)) throw error;
      throw new FigmaDevError('OCR_ERROR', error instanceof Error ? error.message : String(error));
    } finally {
      if (worker) await worker.terminate();
    }
  }

  /**
   * 混合提取入口
   *
   * 优先使用原生节点 JSON 提取；当原生提取无结果且提供了图片来源时，
   * 回退到 tesseract OCR。
   *
   * @param options - 提取输入（figmaNode 与 image 至少提供一个）
   * @returns 提取结果
   */
  async extractText(options: {
    figmaNode?: FigmaNode;
    image?: Buffer | string;
  }): Promise<OcrResult> {
    const { figmaNode, image } = options;

    if (!figmaNode && !image) {
      throw new Error('必须提供 figmaNode 或 image 之一作为 OCR 提取输入');
    }

    // 优先原生提取
    if (figmaNode) {
      const nativeResult = this.extractNativeText(figmaNode);
      if (nativeResult.items.length > 0) {
        return nativeResult;
      }
      // 原生无文本：若提供图片则回退 OCR
      if (!image) {
        return nativeResult;
      }
    }

    // OCR 兜底
    const ocrResult = await this.extractTextFromImage(image!);
    if (figmaNode) {
      ocrResult.strategy = 'hybrid';
      ocrResult.warnings = [
        ...ocrResult.warnings,
        '原生节点未提取到文本，已使用图片 OCR 结果',
      ];
    }
    return ocrResult;
  }

  /**
   * 获取当前配置
   *
   * @returns 配置选项的只读副本
   */
  getOptions(): Readonly<OcrOptions> {
    return { ...this._options };
  }

  /**
   * 更新配置
   *
   * @param options - 要更新的配置项
   */
  updateOptions(options: Partial<OcrOptions>): void {
    validateOcrOptions({ ...this._options, ...options });
    Object.assign(this._options, options);
  }
}

// ============ 单例管理 ============

let ocrInstance: OcrService | null = null;

/**
 * 获取 OcrService 单例
 *
 * @param options - 首次创建时的配置选项
 * @returns OcrService 实例
 */
export function getOcrService(options?: Partial<OcrOptions>): OcrService {
  if (!ocrInstance) {
    ocrInstance = new OcrService(options);
  }
  return ocrInstance;
}

/**
 * 重置 OcrService 单例（主要用于测试）
 */
export function resetOcrService(): void {
  ocrInstance = null;
}
