/**
 * 资产下载器 - Asset Downloader
 *
 * 核心职责：
 * 1. 调用 Figma Images API 获取节点/图片的导出 URL
 * 2. 批量下载到本地 `public/` 目录下的指定子路径
 * 3. 自动生成符合项目约定的 `publicCdnUrl()` 引用路径
 * 4. 输出 import 代码片段供 AI 代码生成使用
 * 5. 生成 Markdown 格式的资产下载报告
 *
 * **落位约定（对齐 figma-to-code.md）：**
 * ```
 * public/<assetPrefix>/<sanitized-name>.<ext>
 * 引用方式：publicCdnUrl('/<assetPrefix>/<sanitized-name>.<ext>')
 * ```
 * 默认 `assetPrefix` 为 `portal/<场景名>`。
 *
 * **下载流程：**
 * ```
 * ProcessedAsset[] (来自 node-processor)
 *   ↓
 * 1. 按格式分组（SVG / PNG）
 *   ↓
 * 2. 批量调用 Figma Images API 获取导出 URL（每批 50 个节点）
 *   ↓
 * 3. 检查本地是否已存在（skipExisting 选项）
 *   ↓
 * 4. HTTP 下载图片到 public 目录
 *   ↓
 * 5. SVG 优化（如果启用）
 *   ↓
 * 6. 填充 asset.localPath / asset.cdnUrl
 *   ↓
 * DownloadResult[]（含成功/失败状态和错误信息）
 * ```
 *
 * @module
 */

// ============ 依赖导入 ============

import * as fs from 'node:fs';
import * as path from 'node:path';

import { optimize as svgoOptimize } from 'svgo';

import type { FigmaExportFormat } from '../types.js';
import type { ProcessedAsset, ProcessedNode } from '../types/nodes.js';
import type { FigmaClient } from './figma-client.js';
import {
  getAssetRootDir,
  normalizeAssetUrlPath,
  planAssetReference,
  resolveAssetPrefix,
  sanitizeAssetFileName,
  toAssetVarName,
  type BundlerKind,
  type PlannedAssetReference,
} from './asset-paths.js';

// ============ 类型定义 ============

/**
 * 资产下载器配置选项
 */
export interface AssetDownloaderOptions {
  /** 项目根目录（用于解析 public 路径） */
  projectRoot: string;
  /** 资源相对 public 目录的子路径前缀（默认 portal/<scene>） */
  assetPrefix?: string;
  /** 导出倍率（1x, 2x, 3x, 4x），默认 2x，数值越大图片越清晰 */
  scale?: 1 | 2 | 3 | 4;
  /** SVG 类型节点的导出格式：svg 矢量或 png 位图，默认 svg */
  svgFormat?: 'svg' | 'png';
  /** 是否跳过已存在的文件（避免重复下载） */
  skipExisting?: boolean;
  /** 是否使用 SVGO 优化 SVG 输出（移除冗余属性、压缩体积），默认 true */
  optimizeSvg?: boolean;
  /**
   * 目标项目构建器（v1.4.18 新增，T4）：
   * 决定资源落位目录（public 或 src/assets）与引用代码形态；
   * 默认 'none'，行为与 1.4.17 完全一致。
   */
  bundler?: BundlerKind;
}

/**
 * 默认下载配置
 */
const DEFAULT_OPTIONS: Required<Pick<AssetDownloaderOptions, 'scale' | 'svgFormat' | 'skipExisting' | 'optimizeSvg'>> =
  {
    scale: 2,
    svgFormat: 'svg',
    skipExisting: true,
    optimizeSvg: true,
  };

/**
 * Figma Images API 支持的导出格式参数（小写）
 * @internal
 */
type ExportFormatParam = 'png' | 'svg' | 'jpg';

/**
 * 单个资产的下载结果
 */
export interface DownloadResult {
  /** 对应的资产元数据 */
  asset: ProcessedAsset;
  /** 本地文件路径（相对于 public 目录） */
  localPath: string;
  /** publicCdnUrl() 调用代码字符串（bundler 非 none 时为裸 public 路径） */
  cdnUrl: string;
  /** 可直接在代码中使用的 import/引用代码 */
  importCode: string;
  /** 构建器感知的权威引用规划（v1.4.18 新增；仅成功结果存在，以 React 引号风格规划） */
  reference?: PlannedAssetReference;
  /** 是否下载成功 */
  success: boolean;
  /** 失败时的错误信息 */
  error?: string;
}

// ============ 文件名/导出格式工具函数 ============

/**
 * 根据节点类型和内容推断导出格式
 *
 * 推断规则：
 * 1. 矢量类型（VECTOR / BOOLEAN_OPERATION）→ 根据 svgFormat 配置（SVG 或 PNG）
 * 2. 图片填充节点（IMAGE fill）→ PNG（位图导出保真度更高）
 * 3. Frame/Group 带视觉样式 → PNG（默认）
 *
 * @param nodeType - Figma 节点类型字符串
 * @param hasImageFill - 是否包含图片填充
 * @param svgFormat - SVG 节点的导出格式偏好
 * @returns Figma API 导出格式枚举值
 */
function inferExportFormat(nodeType: string, hasImageFill: boolean, svgFormat: 'svg' | 'png'): FigmaExportFormat {
  if (nodeType === 'VECTOR' || nodeType === 'BOOLEAN_OPERATION') {
    return svgFormat.toUpperCase() as FigmaExportFormat;
  }
  if (hasImageFill) {
    return 'PNG';
  }
  return 'PNG';
}

// ============ AssetDownloader 类 ============

/**
 * 资产下载器类
 *
 * 负责将 Figma 设计稿中的图片/图标资源下载到本地项目 public 目录，
 * 并生成符合项目规范的 CDN 引用路径。
 * 通过工厂函数 {@link createAssetDownloader} 创建实例。
 *
 * @example
 * ```typescript
 * const downloader = createAssetDownloader(figmaClient, {
 *   projectRoot: '/path/to/project',
 *   scale: 2,
 * });
 * const assets = AssetDownloader.extractAssetsFromNode(rootNode);
 * const results = await downloader.downloadAssets(fileKey, 'edu', assets);
 * console.log(`Downloaded ${results.filter(r => r.success).length} assets`);
 * ```
 */
export class AssetDownloader {
  /** Figma API 客户端实例 */
  private readonly _client: FigmaClient;
  /** 下载器配置（已合并默认值，projectRoot 已转为绝对路径） */
  private readonly _options: Required<AssetDownloaderOptions>;

  /**
   * 构造函数 - 初始化资产下载器
   *
   * 将 projectRoot 解析为绝对路径，确保后续路径拼接正确。
   *
   * @param client - Figma API 客户端实例
   * @param options - 下载器配置
   */
  constructor(client: FigmaClient, options: AssetDownloaderOptions) {
    this._client = client;
    this._options = {
      ...DEFAULT_OPTIONS,
      ...options,
      // 显式兜底：spread 无法清除 options.bundler === undefined 的覆盖，
      // 否则 planAssetReference 会因 switch 未命中在运行时返回 undefined
      bundler: options.bundler ?? 'none',
      projectRoot: path.resolve(options.projectRoot),
    } as Required<AssetDownloaderOptions>;
  }

  // ============ 路径生成私有方法 ============

  /**
   * 解析资源子目录前缀（显式 assetPrefix 优先，否则 portal/<场景名>）
   *
   * @param sceneName - 场景名称（用于构建默认子路径）
   * @returns POSIX 目录前缀（无前导/尾随斜杠）
   */
  private _getPrefix(sceneName: string): string {
    return resolveAssetPrefix(this._options.assetPrefix, sceneName);
  }

  /**
   * 获取资源落位目录的完整绝对路径（v1.4.18：构建器感知）
   *
   * - none/nextjs/remix：`{projectRoot}/public/{prefix}`
   * - vite/webpack：`{projectRoot}/src/assets/{prefix}`
   *
   * @param sceneName - 场景名称（用于构建默认子路径）
   * @returns 资源目录绝对路径
   */
  private _getAssetDir(sceneName: string): string {
    return path.join(this._options.projectRoot, getAssetRootDir(this._options.bundler), this._getPrefix(sceneName));
  }

  /**
   * 生成资源根相对 URL 路径（/ 开头）
   *
   * @param sceneName - 场景名称
   * @param fileName - 文件名（含扩展名）
   * @returns 以 / 开头的资源根相对路径
   */
  private _generateUrlPath(sceneName: string, fileName: string): string {
    return `/${this._getPrefix(sceneName)}/${fileName}`;
  }

  /**
   * 按当前构建器规划资源引用（供下载报告与 MCP 结果展示；
   * 代码生成器以相同契约重新规划）
   *
   * @param urlPath - 资源根相对 URL 路径
   * @returns 引用规划
   */
  private _planReference(urlPath: string): PlannedAssetReference {
    return planAssetReference({
      bundler: this._options.bundler,
      urlPath: normalizeAssetUrlPath(urlPath),
      varName: toAssetVarName(urlPath),
    });
  }

  // ============ 批量下载公开方法 ============

  /**
   * 批量下载资产到本地 public 目录
   *
   * 执行流程：
   * 1. 确保目标目录存在（自动创建）
   * 2. 按导出格式（SVG/PNG）分组节点 ID
   * 3. 分批调用 Figma Images API 获取导出 URL
   * 4. 逐一下载图片（跳过已存在的文件）
   * 5. SVG 优化（如果启用）
   * 6. 填充 asset 的 localPath 和 cdnUrl 字段
   *
   * @param fileKey - Figma 文件 Key
   * @param sceneName - 场景名称（用于目录组织）
   * @param assets - ProcessedAsset 列表（通常来自 node-processor 或 get_design_context）
   * @returns 下载结果列表，每个资产对应一条结果（含成功/失败状态）
   */
  async downloadAssets(fileKey: string, sceneName: string, assets: ProcessedAsset[]): Promise<DownloadResult[]> {
    if (assets.length === 0) {
      return [];
    }

    const assetDir = this._getAssetDir(sceneName);

    // ============ 确保目录存在 ============
    // recursive: true 允许创建多级目录，已存在时不报错
    fs.mkdirSync(assetDir, { recursive: true });

    // ============ 按格式分组节点 ID ============
    // Figma Images API 支持按格式批量获取 URL，同格式节点可一次请求
    const pngNodeIds: string[] = [];
    const svgNodeIds: string[] = [];
    const assetMap = new Map<string, ProcessedAsset>();

    for (const asset of assets) {
      // 根据节点类型推断导出格式（若未显式指定）
      // icon 类型视为矢量节点（VECTOR），image 类型视为带图片填充
      const format =
        asset.format ||
        inferExportFormat(asset.type === 'icon' ? 'VECTOR' : 'FRAME', asset.type === 'image', this._options.svgFormat);
      asset.format = format;

      if (format === 'SVG') {
        svgNodeIds.push(asset.nodeId);
      } else {
        pngNodeIds.push(asset.nodeId);
      }
      assetMap.set(asset.nodeId, asset);
    }

    const results: DownloadResult[] = [];

    // ============ 分批下载 PNG/JPG 资源 ============
    if (pngNodeIds.length > 0) {
      const pngResults = await this._downloadImageBatch(fileKey, sceneName, pngNodeIds, assetMap, assetDir, 'png');
      results.push(...pngResults);
    }

    // ============ 分批下载 SVG 资源 ============
    if (svgNodeIds.length > 0) {
      const svgResults = await this._downloadImageBatch(fileKey, sceneName, svgNodeIds, assetMap, assetDir, 'svg');
      results.push(...svgResults);
    }

    return results;
  }

  // ============ 单批次下载私有方法 ============

  /**
   * 批量下载同一格式的图片
   *
   * **分批次原因：** Figma Images API 单次请求节点数有限制（经验值 50 个/批较稳定），
   * 超过可能导致 API 返回错误或 URL 缺失。
   *
   * **错误处理：**
   * - 整批 API 调用失败：为该批每个节点记录错误
   * - 单个节点无导出 URL：标记为失败，不影响其他节点
   * - 单个文件下载失败：标记为失败，不影响其他节点
   * - SVG 优化失败：使用原始 SVG，不阻塞下载
   *
   * @param fileKey - Figma 文件 Key
   * @param sceneName - 场景名称
   * @param nodeIds - 待下载的节点 ID 列表（同格式）
   * @param assetMap - 节点 ID → ProcessedAsset 映射
   * @param assetDir - 资源落位目录绝对路径
   * @param format - 导出格式参数（Figma API 使用小写）
   * @returns 该批次所有节点的下载结果
   */
  private async _downloadImageBatch(
    fileKey: string,
    sceneName: string,
    nodeIds: string[],
    assetMap: Map<string, ProcessedAsset>,
    assetDir: string,
    format: ExportFormatParam,
  ): Promise<DownloadResult[]> {
    const results: DownloadResult[] = [];

    // Figma Images API 每批最多处理 50 个节点（保守值，实际可能支持更多）
    const batchSize = 50;
    for (let i = 0; i < nodeIds.length; i += batchSize) {
      const batch = nodeIds.slice(i, i + batchSize);

      try {
        // ============ 调用 Figma Images API 获取导出 URL ============
        // getImages 返回 { images: { [nodeId]: string | null } }，值为临时下载 URL
        const urlResult = await this._client.getImages(fileKey, batch, format, this._options.scale);
        const urlMap = urlResult.images;

        for (const nodeId of batch) {
          const asset = assetMap.get(nodeId);
          if (!asset) continue;

          const exportUrl = urlMap[nodeId];
          // Figma API 可能对某些节点返回 null（如节点不存在或不可导出）
          if (!exportUrl) {
            results.push({
              asset,
              localPath: '',
              cdnUrl: '',
              importCode: '',
              success: false,
              error: 'No export URL returned from Figma (node may not be exportable)',
            });
            continue;
          }

          asset.exportUrl = exportUrl;

          // ============ 生成文件名和路径 ============
          // nodeId 中的冒号和连字符替换为下划线，避免文件系统问题
          const baseName = sanitizeAssetFileName(asset.name || `asset_${nodeId.replace(/[:-]/g, '_')}`);
          const ext = format === 'jpg' ? 'jpg' : format;
          const fileName = `${baseName}.${ext}`;
          const filePath = path.join(assetDir, fileName);

          // ============ 检查文件是否已存在 ============
          if (this._options.skipExisting && fs.existsSync(filePath)) {
            const localPath = this._generateUrlPath(sceneName, fileName);
            const reference = this._planReference(localPath);
            // none 时保持 1.4.17 的 publicCdnUrl() 调用串；其他构建器写裸路径
            const cdnUrl = this._options.bundler === 'none' ? reference.expression : localPath;
            asset.localPath = localPath;
            asset.cdnUrl = cdnUrl;
            results.push({
              asset,
              localPath,
              cdnUrl,
              importCode: reference.expression,
              reference,
              success: true,
            });
            continue;
          }

          // ============ 下载并写入文件 ============
          try {
            const response = await fetch(exportUrl);
            if (!response.ok) {
              // HTTP 错误状态码（4xx/5xx），抛出异常被 catch 捕获
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            // 使用 arrayBuffer() 下载二进制数据，转为 Buffer 后写入文件
            const buffer = Buffer.from(await response.arrayBuffer());

            // SVG 优化（如果启用）
            let finalBuffer = buffer;
            if (format === 'svg' && this._options.optimizeSvg) {
              try {
                const svgString = buffer.toString('utf-8');
                const result = svgoOptimize(svgString, {
                  multipass: true,
                  plugins: [
                    'preset-default',
                    'removeDimensions',
                    {
                      name: 'removeAttrs',
                      params: {
                        attrs: ['data-name', 'id'],
                      },
                    },
                  ],
                });
                finalBuffer = Buffer.from(result.data, 'utf-8');
              } catch {
                // SVGO 优化失败时使用原始 SVG，不阻塞下载
              }
            }
            fs.writeFileSync(filePath, finalBuffer);

            const localPath = this._generateUrlPath(sceneName, fileName);
            const reference = this._planReference(localPath);
            // none 时保持 1.4.17 的 publicCdnUrl() 调用串；其他构建器写裸路径
            const cdnUrl = this._options.bundler === 'none' ? reference.expression : localPath;
            asset.localPath = localPath;
            asset.cdnUrl = cdnUrl;

            results.push({
              asset,
              localPath,
              cdnUrl,
              importCode: reference.expression,
              reference,
              success: true,
            });
          } catch (downloadErr) {
            // 单个文件下载失败（网络错误、磁盘写入错误等），记录错误但继续处理其他节点
            results.push({
              asset,
              localPath: '',
              cdnUrl: '',
              importCode: '',
              success: false,
              error: downloadErr instanceof Error ? downloadErr.message : String(downloadErr),
            });
          }
        }
      } catch (err) {
        // ============ 整批 API 调用失败 ============
        // 可能原因：Token 权限不足、fileKey 错误、节点 ID 无效、API 限流等
        // 为该批次每个节点记录错误信息
        for (const nodeId of batch) {
          const asset = assetMap.get(nodeId);
          if (asset) {
            results.push({
              asset,
              localPath: '',
              cdnUrl: '',
              importCode: '',
              success: false,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    }

    return results;
  }

  // ============ 静态工具方法 ============

  /**
   * 从节点树中递归提取所有需要下载的资产
   *
   * 遍历 ProcessedNode 树，收集所有标记了 asset 字段的节点。
   * 通常在调用 downloadAssets 之前使用此方法获取资产列表。
   *
   * @param node - 处理后的精简节点树（根节点）
   * @returns 所有需要下载的 ProcessedAsset 列表（扁平化数组）
   */
  static extractAssetsFromNode(node: ProcessedNode): ProcessedAsset[] {
    const assets: ProcessedAsset[] = [];

    /**
     * 递归遍历节点树，收集资产
     * @param n - 当前遍历节点
     */
    function walk(n: ProcessedNode): void {
      if (n.asset) {
        assets.push(n.asset);
      }
      if (n.children) {
        for (const child of n.children) {
          walk(child);
        }
      }
    }

    walk(node);
    return assets;
  }

  /**
   * 生成资产下载汇总报告（Markdown 格式，用于 AI 上下文）
   *
   * 报告包含：
   * - 下载统计（总计/成功/失败）
   * - 成功资产的表格列表（名称、类型、本地路径、CDN 引用）
   * - 失败资产的错误列表
   * - TypeScript 代码使用示例
   *
   * @param results - downloadAssets() 返回的下载结果列表
   * @returns Markdown 格式的报告字符串
   */
  static generateAssetsReport(results: DownloadResult[]): string {
    const lines: string[] = [];
    const successResults = results.filter((r) => r.success);
    const failResults = results.filter((r) => !r.success);

    // ============ 统计摘要 ============
    lines.push('## 资产下载报告');
    lines.push(`- 总计: ${results.length}`);
    lines.push(`- 成功: ${successResults.length}`);
    lines.push(`- 失败: ${failResults.length}`);
    lines.push('');

    // ============ 成功资产表格 ============
    if (successResults.length > 0) {
      lines.push('### 成功下载的资产');
      lines.push('');
      lines.push('| 名称 | 类型 | 本地路径 | 代码引用 |');
      lines.push('|------|------|----------|----------|');
      for (const r of successResults) {
        // 落位目录随构建器变化（public 或 src/assets）；localPath 末段为文件名
        const baseDir = r.reference?.assetDir ?? 'public';
        const fileName = r.localPath.split('/').pop() ?? r.localPath;
        lines.push(`| ${r.asset.name} | ${r.asset.type} | ${baseDir}/${fileName} | \`${r.importCode}\` |`);
      }
      lines.push('');
    }

    // ============ 失败资产列表 ============
    if (failResults.length > 0) {
      lines.push('### 下载失败的资产');
      lines.push('');
      for (const r of failResults) {
        lines.push(`- ${r.asset.name} (${r.asset.nodeId}): ${r.error}`);
      }
      lines.push('');
    }

    // ============ 使用示例代码 ============
    // 只展示前 3 个资产的示例，避免报告过长
    lines.push('### 使用示例');
    lines.push('');
    lines.push('```tsx');
    // 仅当存在 public-cdn 形态引用时才输出 publicCdnUrl 导入（none 构建器）
    if (successResults.some((r) => r.reference?.kind === 'public-cdn')) {
      lines.push(`import { publicCdnUrl } from '@/core/config';`);
      lines.push('');
    }
    // ESM import 形态（vite）：先去重输出 import 语句
    const esmImports = new Set<string>();
    for (const r of successResults) {
      for (const imp of r.reference?.imports ?? []) {
        esmImports.add(imp);
      }
    }
    for (const imp of esmImports) {
      lines.push(imp);
    }
    if (esmImports.size > 0) {
      lines.push('');
    }
    for (const r of successResults.slice(0, 3)) {
      // ESM 形态变量已由 import 定义，不再重复声明常量
      if (r.reference?.kind === 'esm-import') {
        continue;
      }
      // 文件名转为 SCREAMING_SNAKE_CASE 作为常量名
      const varName = sanitizeAssetFileName(r.asset.name).replace(/-/g, '_').toUpperCase();
      lines.push(`const ${varName}_URL = ${r.importCode};`);
    }
    lines.push('```');

    return lines.join('\n');
  }
}

// ============ 工厂函数 ============

/**
 * 创建资产下载器实例
 *
 * @param client - Figma API 客户端实例
 * @param options - 下载器配置
 * @returns AssetDownloader 实例
 */
export function createAssetDownloader(client: FigmaClient, options: AssetDownloaderOptions): AssetDownloader {
  return new AssetDownloader(client, options);
}
