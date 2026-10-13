/**
 * SVG 内联渲染服务 - SVG Inline Renderer
 *
 * 核心职责：
 * 1. 从 Figma 导出 Vector/图标节点为 SVG 格式
 * 2. 下载 SVG 内容并进行安全清理
 * 3. 使用 svgo 优化 SVG
 * 4. 将 SVG 转换为可内联在 React/Vue 组件中的 JSX/Template 代码
 * 5. 支持深层嵌套的矢量图形还原
 *
 * @module
 */

import equal from 'fast-deep-equal';
import { optimize, type Config as SvgoConfig } from 'svgo';

import { sanitizeSvg } from '../utils/security.js';
import { mapWithConcurrency } from '../utils/concurrency.js';
import type { FigmaClient } from './figma-client.js';

// ============ 类型定义 ============

export interface SvgRenderOptions {
  /** 是否内联 SVG（默认 true） */
  inline?: boolean;
  /** SVG 导出倍率（默认 1x，矢量图不需要高倍率） */
  scale?: number;
  /** 是否使用 svgo 优化（默认 true） */
  optimize?: boolean;
  /** 是否为 SVG 添加当前颜色支持（currentColor） */
  currentColor?: boolean;
  /** 自定义 SVG class 名 */
  className?: string;
}

export interface InlineSvgResult {
  /** 渲染类型：inline 表示内联 SVG */
  type: 'inline';
  /** SVG 代码（React JSX 格式） */
  reactCode: string;
  /** SVG 代码（Vue Template 格式） */
  vueCode: string;
  /** 原始 SVG 字符串 */
  rawSvg: string;
  /** 优化后的 SVG 字符串 */
  optimizedSvg: string;
  /** SVG viewBox */
  viewBox: string;
  /** SVG 宽度 */
  width?: number;
  /** SVG 高度 */
  height?: number;
}

export interface SvgAssetResult {
  /** 渲染类型：asset 表示需要下载为文件 */
  type: 'asset';
  /** 资源 URL */
  url: string;
  /** 建议文件名 */
  filename: string;
}

const DEFAULT_SVG_OPTIONS: Required<SvgRenderOptions> = {
  inline: true,
  scale: 1,
  optimize: true,
  currentColor: true,
  className: '',
};

/** SVGO 优化配置 */
const SVGO_CONFIG: SvgoConfig = {
  multipass: true,
  plugins: [
    // 预设配置（保留默认优化，仅关闭 removeViewBox）
    {
      name: 'preset-default',
      params: {
        overrides: {
          // 保留 viewBox，方便响应式缩放
          removeViewBox: false,
        },
      },
    },
    // 移除 Figma 特有的注释和元数据
    'removeComments',
    'removeMetadata',
    'removeEditorsNSData',
    'removeEmptyAttrs',
    'removeEmptyContainers',
    // 排序属性（一致性）
    'sortAttrs',
    // 移除 width/height 属性，使用 CSS 控制
    'removeDimensions',
  ],
};

/** SVG 内存缓存最大条目数（防止内存泄漏） */
const SVG_CACHE_MAX_SIZE = 200;

/**
 * SVG 下载最大并发（P3-12 受控并发）：
 * 图标密集页面可能有上百矢量节点，无界 Promise.all 会瞬时打开大量 socket，
 * 触发连接耗尽或 Figma 429；6 路并发兼顾吞吐与限流安全。
 */
const SVG_DOWNLOAD_CONCURRENCY = 6;

/**
 * SVG 内联渲染器
 *
 * 将 Figma 矢量节点导出为可内联的 SVG JSX/Vue 代码
 */
export class SvgInlineRenderer {
  private readonly _client: FigmaClient | null;
  private _options: Required<SvgRenderOptions>;

  /** SVG 下载缓存（避免重复下载同一节点） */
  private _svgCache: Map<string, Promise<InlineSvgResult | null>> = new Map();

  constructor(client: FigmaClient | null, options: Partial<SvgRenderOptions> = {}) {
    this._client = client;
    this._options = { ...DEFAULT_SVG_OPTIONS, ...options };
  }

  /**
   * 批量渲染多个节点为内联 SVG
   *
   * @param fileKey - Figma 文件 Key
   * @param nodeIds - 要导出的节点 ID 列表
   * @param options - 渲染选项
   * @returns 按 nodeId 索引的渲染结果映射
   */
  async renderNodes(
    fileKey: string,
    nodeIds: Array<{ nodeId: string; name: string }>,
    options: Partial<SvgRenderOptions> = {},
  ): Promise<Map<string, InlineSvgResult | null>> {
    const opts = { ...this._options, ...options };
    const results = new Map<string, InlineSvgResult | null>();

    if (nodeIds.length === 0) return results;
    if (!this._client) throw new Error('SvgInlineRenderer 需要 FigmaClient 才能渲染 SVG 节点');

    // 1. 批量获取 SVG 导出 URL
    const idList = nodeIds.map((n) => n.nodeId);
    const { images: svgUrls } = await this._client.getImages(fileKey, idList, 'svg', opts.scale);

    // 2. 受控并发下载和处理 SVG（P3-12：避免图标密集页面无界扇出耗尽 socket/触发 429）
    await mapWithConcurrency(nodeIds, SVG_DOWNLOAD_CONCURRENCY, async ({ nodeId, name }) => {
      const url = svgUrls[nodeId];
      if (!url) {
        results.set(nodeId, null);
        return;
      }

      try {
        const result = await this._downloadAndProcessSvg(url, name, opts);
        results.set(nodeId, result);
      } catch {
        results.set(nodeId, null);
      }
    });

    return results;
  }

  /**
   * 渲染单个节点为内联 SVG
   *
   * @param fileKey - Figma 文件 Key
   * @param nodeId - 节点 ID
   * @param nodeName - 节点名称（用于错误提示）
   * @param options - 渲染选项
   * @returns 内联 SVG 结果，失败返回 null
   */
  async renderNode(
    fileKey: string,
    nodeId: string,
    nodeName: string,
    options: Partial<SvgRenderOptions> = {},
  ): Promise<InlineSvgResult | null> {
    // 合并默认选项生成稳定配置
    const opts = { ...this._options, ...options };

    // 基于关键属性生成稳定缓存键（避免 JSON.stringify 的键顺序不稳定性）
    // fast-deep-equal 用于选项对象的深度比较，这里用稳定的属性拼接作为主键
    const cacheKey = this._buildCacheKey(fileKey, nodeId, opts);

    if (this._svgCache.has(cacheKey)) {
      return this._svgCache.get(cacheKey)!;
    }

    // LRU 淘汰：缓存超过最大条目数时，删除最早的已完成条目
    this._evictCacheIfNeeded();

    const promise = this._renderNodeInternalWithOpts(fileKey, nodeId, nodeName, opts);
    this._svgCache.set(cacheKey, promise);

    try {
      return await promise;
    } catch {
      this._svgCache.delete(cacheKey);
      return null;
    }
  }

  /**
   * LRU 缓存淘汰：当缓存条目超过限制时，删除最早插入的条目
   *
   * 使用 Map 的插入顺序特性实现简单 LRU。CLI 场景下单次生成
   * 通常不会超过 200 个 SVG 节点，此策略足够安全。
   */
  private _evictCacheIfNeeded(): void {
    while (this._svgCache.size >= SVG_CACHE_MAX_SIZE) {
      const firstKey = this._svgCache.keys().next().value;
      if (firstKey) {
        this._svgCache.delete(firstKey);
      } else {
        break;
      }
    }
  }

  /**
   * 生成稳定的缓存键
   *
   * 使用关键属性显式拼接，比 JSON.stringify 更稳定可靠：
   * - 避免对象键顺序不一致导致的缓存未命中
   * - 键更短，内存占用更少
   * - 明确控制哪些属性影响缓存
   */
  private _buildCacheKey(fileKey: string, nodeId: string, opts: Required<SvgRenderOptions>): string {
    return `${fileKey}:${nodeId}:s${opts.scale}:o${opts.optimize ? 1 : 0}:c${opts.currentColor ? 1 : 0}:i${opts.inline ? 1 : 0}:${opts.className || ''}`;
  }

  /**
   * 比较两个选项对象是否相等（使用 fast-deep-equal 深度比较）
   */
  optionsEqual(a: Partial<SvgRenderOptions>, b: Partial<SvgRenderOptions>): boolean {
    return equal(a, b);
  }

  /**
   * 内部渲染实现（接收已合并的完整选项）
   */
  private async _renderNodeInternalWithOpts(
    fileKey: string,
    nodeId: string,
    nodeName: string,
    opts: Required<SvgRenderOptions>,
  ): Promise<InlineSvgResult | null> {
    if (!this._client) throw new Error('SvgInlineRenderer 需要 FigmaClient 才能渲染 SVG 节点');
    // 获取 SVG URL
    const { images: svgUrls } = await this._client.getImages(fileKey, [nodeId], 'svg', opts.scale);
    const url = svgUrls[nodeId];
    if (!url) return null;

    return this._downloadAndProcessSvg(url, nodeName, opts);
  }

  /**
   * 下载并处理 SVG
   */
  private async _downloadAndProcessSvg(
    url: string,
    _name: string,
    opts: Required<SvgRenderOptions>,
  ): Promise<InlineSvgResult | null> {
    if (!this._client) throw new Error('SvgInlineRenderer 需要 FigmaClient 才能下载 SVG');
    // 下载 SVG 内容
    const buffer = await this._client.downloadImage(url);
    const rawSvg = buffer.toString('utf-8');

    // 安全清理 SVG
    const cleanedSvg = sanitizeSvg(rawSvg);

    // 使用 svgo 优化
    let optimizedSvg = cleanedSvg;
    if (opts.optimize) {
      try {
        const result = optimize(cleanedSvg, SVGO_CONFIG);
        optimizedSvg = result.data;
      } catch {
        // svgo 优化失败时使用清理后的版本
        optimizedSvg = cleanedSvg;
      }
    }

    // currentColor 处理：将 fill/stroke 替换为 currentColor（必须在转换前应用）
    if (opts.currentColor) {
      optimizedSvg = this._applyCurrentColor(optimizedSvg);
    }

    // 提取 viewBox
    const viewBoxMatch = optimizedSvg.match(/viewBox=["']([^"']+)["']/);
    const viewBox = viewBoxMatch?.[1] || '0 0 24 24';

    // 提取尺寸
    const widthMatch = optimizedSvg.match(/width=["']([^"']+)["']/);
    const heightMatch = optimizedSvg.match(/height=["']([^"']+)["']/);
    const width = widthMatch?.[1] ? Number.parseFloat(widthMatch[1]) : undefined;
    const height = heightMatch?.[1] ? Number.parseFloat(heightMatch[1]) : undefined;

    // 转换为 React JSX 格式
    const reactCode = this._convertToReactSvg(optimizedSvg, opts);

    // 转换为 Vue Template 格式
    const vueCode = this._convertToVueSvg(optimizedSvg, opts);

    return {
      type: 'inline',
      reactCode,
      vueCode,
      rawSvg,
      optimizedSvg,
      viewBox,
      width,
      height,
    };
  }

  /**
   * 将 SVG 转换为 React JSX 格式
   *
   * 处理：
   * - 属性驼峰化（stroke-width → strokeWidth）
   * - class → className
   * - style 字符串 → 对象
   * - 移除 XML 声明和 DOCTYPE
   */
  private _convertToReactSvg(svg: string, opts: Required<SvgRenderOptions>): string {
    let result = svg;

    // 移除 XML 声明
    result = result.replace(/<\?xml[^?]*\?>/g, '');
    // 移除 DOCTYPE
    result = result.replace(/<!DOCTYPE[^>]*>/g, '');
    // 移除注释
    result = result.replace(/<!--[\s\S]*?-->/g, '');

    // SVG 属性驼峰化映射
    const attrMap: Record<string, string> = {
      'stroke-width': 'strokeWidth',
      'stroke-linecap': 'strokeLinecap',
      'stroke-linejoin': 'strokeLinejoin',
      'stroke-dasharray': 'strokeDasharray',
      'stroke-dashoffset': 'strokeDashoffset',
      'stroke-miterlimit': 'strokeMiterlimit',
      'fill-rule': 'fillRule',
      'fill-opacity': 'fillOpacity',
      'stroke-opacity': 'strokeOpacity',
      'font-size': 'fontSize',
      'font-family': 'fontFamily',
      'font-weight': 'fontWeight',
      'text-anchor': 'textAnchor',
      'clip-path': 'clipPath',
      'clip-rule': 'clipRule',
      'marker-start': 'markerStart',
      'marker-mid': 'markerMid',
      'marker-end': 'markerEnd',
      'stop-color': 'stopColor',
      'stop-opacity': 'stopOpacity',
      'xlink:href': 'xlinkHref',
      class: 'className',
      'xml:space': 'xmlSpace',
      'xmlns:xlink': 'xmlnsXlink',
    };

    // 替换属性名
    result = result.replace(/([a-z-]+)=["']([^"']*)["']/g, (match, attr: string, value: string) => {
      // data-* 和 aria-* 属性保持不变
      if (attr.startsWith('data-') || attr.startsWith('aria-')) {
        return match;
      }

      const reactAttr = attrMap[attr] || attr;

      // className 属性
      if (reactAttr === 'className') {
        const classes = [value, opts.className].filter(Boolean).join(' ');
        return `className="${classes}"`;
      }

      // 数值属性不需要引号（可选，保持字符串更安全）
      return `${reactAttr}="${value}"`;
    });

    // 如果指定了 className 且原 SVG 没有 class 属性
    if (opts.className && !result.includes('className=')) {
      result = result.replace(/<svg /, `<svg className="${opts.className}" `);
    }

    // 添加 aria-hidden="true"（图标默认是装饰性的）
    if (!result.includes('aria-hidden') && !result.includes('aria-label')) {
      result = result.replace(/<svg /, '<svg aria-hidden="true" ');
    }

    // 清理多余空白
    result = result.trim();

    return result;
  }

  /**
   * 将 SVG 转换为 Vue Template 格式
   *
   * Vue Template 中：
   * - 属性使用 kebab-case
   * - class 保持 class（不是 className）
   * - xlink:href 可以用 :href 或 xlinkHref（Vue 3）
   */
  private _convertToVueSvg(svg: string, opts: Required<SvgRenderOptions>): string {
    let result = svg;

    // 移除 XML 声明
    result = result.replace(/<\?xml[^?]*\?>/g, '');
    // 移除 DOCTYPE
    result = result.replace(/<!DOCTYPE[^>]*>/g, '');
    // 移除注释
    result = result.replace(/<!--[\s\S]*?-->/g, '');

    // Vue 3 中 xlink:href 可以用 href
    result = result.replace(/xlink:href=["']([^"']*)["']/g, 'href="$1"');
    result = result.replace(/xmlns:xlink=["'][^"']*["']/g, '');

    // 添加 class
    if (opts.className) {
      if (result.includes('class="')) {
        result = result.replace(/class="([^"]*)"/, (match, existing) => {
          return `class="${existing} ${opts.className}"`;
        });
      } else {
        result = result.replace(/<svg /, `<svg class="${opts.className}" `);
      }
    }

    // 添加 aria-hidden="true"（图标默认是装饰性的）
    if (!result.includes('aria-hidden') && !result.includes('aria-label')) {
      result = result.replace(/<svg /, '<svg aria-hidden="true" ');
    }

    result = result.trim();

    return result;
  }

  /**
   * 应用 currentColor：将固定颜色替换为 currentColor
   *
   * 这样图标可以通过 CSS color 属性控制颜色
   */
  private _applyCurrentColor(svg: string): string {
    let result = svg;

    // 匹配 fill="#xxx" 和 stroke="#xxx"（非 none、非透明、非 url() 引用）
    result = result.replace(
      /(fill|stroke)=["'](?!none|transparent|url\(|white|#fff|#ffffff)([^"']+)["']/g,
      (match, attr: string) => {
        return `${attr}="currentColor"`;
      },
    );

    return result;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this._svgCache.clear();
  }
}

interface VectorCheckNode {
  type?: string;
  originalType?: string;
  role?: string;
  children?: VectorCheckNode[];
}

/**
 * 判断节点是否为矢量图形节点（适合内联 SVG 渲染）
 */
export function isVectorNode(node: VectorCheckNode): boolean {
  const type = node.type || node.originalType;
  return (
    type === 'VECTOR' ||
    type === 'BOOLEAN_OPERATION' ||
    type === 'STAR' ||
    type === 'LINE' ||
    type === 'REGULAR_POLYGON' ||
    (type === 'ELLIPSE' && node.role === 'icon') ||
    (type === 'RECTANGLE' && node.role === 'icon')
  );
}

/**
 * 检查节点是否包含矢量子节点
 */
export function hasVectorDescendants(node: VectorCheckNode): boolean {
  if (!node.children) return false;
  return node.children.some((child) => {
    if (isVectorNode(child)) return true;
    return hasVectorDescendants(child);
  });
}
