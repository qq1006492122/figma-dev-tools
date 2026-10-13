/**
 * 微信小程序资产三模式编排层（WBS-P0-22）
 *
 * 在 P0-21 的纯状态机（{@link ./weapp-assets.ts}）之上编排"取字节 → 算 hash →
 * 按模式落地"，本身不直接做网络/磁盘 I/O：字节获取通过注入的 {@link AssetFetcher}
 * 完成，local 模式的物理写盘由 CLI 层（weapp-asset-writer）另行执行。这样核心
 * 决策可完全单测（零网络、零磁盘）。
 *
 * 模式（ROADMAP P0-1.2）：
 *   - 位图按 `assetMode`；图标（svg）按独立的 `iconStrategy`
 *   - local：解析 /images/<scene>/<hash>-<name>.<ext>，字节待 CLI 落盘
 *   - cdn  ：引用稳定 URL（publicBaseUrl + localPath，或 fetcher 直供的稳定 URL）；
 *            Figma/S3 临时签名地址永远进不了 cdn-resolved（TEMP_SIGNED_URL）
 *   - base64：小图标/小位图内联 data URI；单限 + 单文件 50KB 累计（去重后计量）
 *
 * @module
 */

import { createHash } from 'node:crypto';

import {
  resolveLocal,
  resolveCdn,
  resolveBase64,
  markUnresolved,
  assetWarnings,
  isTemporaryFigmaUrl,
  checkBase64Eligible,
  weappAssetPath,
  pickSrc,
  BASE64_TOTAL_MAX_PER_FILE,
  type WeappAssetManifest,
  type WeappAssetKind,
  type AssetWarning,
} from './weapp-assets.js';
import { escapeAttribute } from '../utils/security.js';

// ============ 选项与 I/O 端口 ============

export type WeappAssetMode = 'local' | 'cdn' | 'base64';

/** 图标（svg）独立策略；默认 image-local。image-* 复用位图的 local/cdn 落位逻辑 */
export type WeappIconStrategy = 'image-local' | 'image-cdn' | 'base64';

export interface WeappAssetPipelineOptions {
  /** 位图（raster）处理模式 */
  assetMode: WeappAssetMode;
  /** 图标（svg）处理策略；缺省 image-local */
  iconStrategy?: WeappIconStrategy;
  /** cdn 模式下资源将托管的稳定基址（末尾斜杠可选） */
  publicBaseUrl?: string;
  /** 真实 CDN uploader；没有 uploader 时字节资源保持 UPLOAD_REQUIRED，不伪造已上传 URL */
  cdnUploader?: WeappCdnUploader;
}

export interface AssetFetchRequest {
  nodeId: string;
  kind: WeappAssetKind;
  name: string;
  scene: string;
  mime: string;
  pixelRatio: 1 | 2 | 3;
}

export interface FetchedAssetBytes {
  bytes: Uint8Array;
  mime: string;
}

/**
 * fetcher 返回：
 *  - 字节：可服务任意模式
 *  - `{ url }`：仅 cdn 模式可直接引用（经临时签名校验）；local/base64 因无字节而 FETCH_FAILED
 *  - null：抓取失败
 */
export type AssetFetchResult = FetchedAssetBytes | { url: string } | null;

export type AssetFetcher = (req: AssetFetchRequest) => Promise<AssetFetchResult>;

export interface CdnUploadRequest {
  /** Immutable object key/path, e.g. /images/default/<hash>-hero.png */
  key: string;
  bytes: Uint8Array;
  mime: string;
  sha256: string;
  publicBaseUrl: string;
}

export interface CdnUploadResult {
  publicUrl: string;
  sha256?: string;
  contentType?: string;
  status?: number;
  /** Must be true only after HTTP status, Content-Type and SHA-256 verification passed. */
  verified: boolean;
}

/** Provider-neutral CDN upload port. Implementations must verify before returning. */
export type WeappCdnUploader = (request: CdnUploadRequest) => Promise<CdnUploadResult>;

export interface ProcessWeappAssetsResult {
  manifest: WeappAssetManifest;
  warnings: AssetWarning[];
  /**
   * 本轮实际下载到的字节（sha256 → bytes/mime）。CLI local 落盘直接复用，
   * 避免二次请求 Figma；仅以字节为结果的条目会进入（`{url}` 直供不下载）。
   */
  downloaded: Map<string, FetchedAssetBytes>;
}

function isBytesResult(r: AssetFetchResult): r is FetchedAssetBytes {
  return r !== null && !('url' in r);
}

// ============ 纯工具 ============

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}

export function buildDataUri(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

/** 稳定基址与绝对资源路径拼接，归一化基址尾部斜杠以避免双斜杠 */
export function joinPublicUrl(publicBaseUrl: string, localPath: string): string {
  const base = publicBaseUrl.endsWith('/') ? publicBaseUrl.slice(0, -1) : publicBaseUrl;
  return `${base}${localPath.startsWith('/') ? localPath : `/${localPath}`}`;
}

function effectiveMode(kind: WeappAssetKind, opts: WeappAssetPipelineOptions): WeappAssetMode {
  if (kind === 'svg') {
    switch (opts.iconStrategy ?? 'image-local') {
      case 'image-cdn':
        return 'cdn';
      case 'base64':
        return 'base64';
      case 'image-local':
      default:
        return 'local';
    }
  }
  return opts.assetMode;
}

// ============ 编排 ============

/**
 * 顺序处理 manifest 中所有"已声明但未处理"条目（state=unresolved 且 reason=null）。
 * 已解析（含别名）条目跳过，因此可安全重复调用。
 */
export async function processWeappAssets(
  manifest: WeappAssetManifest,
  fetcher: AssetFetcher,
  opts: WeappAssetPipelineOptions,
): Promise<ProcessWeappAssetsResult> {
  // 去重后已计入累计预算的物理资源键；别名引用不重复计量
  const budgetedHashes = new Set<string>();
  let base64BudgetUsed = 0;
  const downloaded = new Map<string, FetchedAssetBytes>();

  for (const entry of [...manifest._byId.values()]) {
    if (entry.state !== 'unresolved' || entry.reason !== null) continue;

    const name = manifest._names.get(entry.id) ?? 'asset';
    const mode = effectiveMode(entry.kind, opts);
    const result = await fetcher({
      nodeId: entry.figmaRef.nodeId,
      kind: entry.kind,
      name,
      scene: entry.scene,
      mime: entry.mime,
      pixelRatio: entry.pixelRatio,
    });

    if (result === null) {
      markUnresolved(manifest, entry.id, 'FETCH_FAILED');
      continue;
    }

    // fetcher 仅能给出可引用 URL：只有 cdn 模式可直接使用
    if (!isBytesResult(result)) {
      if (mode !== 'cdn') {
        markUnresolved(manifest, entry.id, 'FETCH_FAILED');
        continue;
      }
      if (isTemporaryFigmaUrl(result.url)) {
        markUnresolved(manifest, entry.id, 'TEMP_SIGNED_URL');
        continue;
      }
      resolveCdn(manifest, entry.id, { publicUrl: result.url, sha256: null, bytes: 0 });
      continue;
    }

    const { bytes } = result;
    const mime = result.mime || entry.mime;
    const hash = sha256Bytes(bytes);
    const size = bytes.length;
    const dedupeKey = `${entry.kind}:${hash}`;
    if (!downloaded.has(hash)) downloaded.set(hash, { bytes, mime });

    if (mode === 'local') {
      resolveLocal(manifest, entry.id, { sha256: hash, bytes: size });
      continue;
    }

    if (mode === 'cdn') {
      if (!opts.publicBaseUrl) {
        markUnresolved(manifest, entry.id, 'PUBLIC_BASE_URL_REQUIRED');
        continue;
      }
      if (!opts.cdnUploader) {
        markUnresolved(manifest, entry.id, 'UPLOAD_REQUIRED');
        continue;
      }

      const localPath = weappAssetPath(entry.scene, hash, name, mime, entry.kind);
      try {
        const uploaded = await opts.cdnUploader({
          key: localPath,
          bytes,
          mime,
          sha256: hash,
          publicBaseUrl: opts.publicBaseUrl,
        });

        if (uploaded.status !== undefined && (uploaded.status < 200 || uploaded.status >= 300)) {
          markUnresolved(manifest, entry.id, 'UPLOAD_FAILED');
          continue;
        }
        if (uploaded.sha256 !== undefined && uploaded.sha256 !== hash) {
          markUnresolved(manifest, entry.id, 'UPLOAD_HASH_MISMATCH');
          continue;
        }
        if (uploaded.contentType && uploaded.contentType.split(';')[0]!.trim().toLowerCase() !== mime.toLowerCase()) {
          markUnresolved(manifest, entry.id, 'UPLOAD_CONTENT_TYPE_MISMATCH');
          continue;
        }
        if (!uploaded.verified || !uploaded.publicUrl || isTemporaryFigmaUrl(uploaded.publicUrl)) {
          markUnresolved(manifest, entry.id, 'UPLOAD_UNVERIFIED');
          continue;
        }

        resolveCdn(manifest, entry.id, {
          publicUrl: uploaded.publicUrl,
          sha256: hash,
          bytes: size,
        });
      } catch {
        markUnresolved(manifest, entry.id, 'UPLOAD_FAILED');
      }
      continue;
    }

    // mode === 'base64'：先单限，再单文件累计预算（仅对新的物理资源计量）
    if (checkBase64Eligible(entry.kind, size) !== 'ok') {
      markUnresolved(manifest, entry.id, 'SIZE_LIMIT');
      continue;
    }
    const dataUri = buildDataUri(bytes, mime);
    if (!budgetedHashes.has(dedupeKey) && base64BudgetUsed + dataUri.length > BASE64_TOTAL_MAX_PER_FILE) {
      markUnresolved(manifest, entry.id, 'SIZE_LIMIT');
      continue;
    }
    resolveBase64(manifest, entry.id, { sha256: hash, bytes: size, dataUri });
    if (!budgetedHashes.has(dedupeKey)) {
      budgetedHashes.add(dedupeKey);
      base64BudgetUsed += dataUri.length;
    }
  }

  return { manifest, warnings: assetWarnings(manifest), downloaded };
}

// ============ 两阶段渲染：src 占位与回填 ============

/** 渲染期占位（WXML 中 src 的值）；资产解析后由 resolveAssetSrcTokens 回填 */
export function assetSrcToken(assetId: string): string {
  return `__FDT_ASSET_${assetId}__`;
}

const ASSET_SRC_TOKEN_RE = / src="__FDT_ASSET_(a_\d{4})__"/g;

/**
 * 把 WXML 中的资产 src 占位回填为真实引用：
 *  - local/cdn/base64 已解析 → ` src="<pickSrc>"`（属性值做 HTML 转义）
 *  - unresolved（失败/未解析）→ 整个 src 属性移除（绝不输出空 src），id 计入 unresolved
 */
export function resolveAssetSrcTokens(
  wxml: string,
  manifest: WeappAssetManifest,
): { wxml: string; unresolved: string[] } {
  const unresolved: string[] = [];
  const replaced = wxml.replace(ASSET_SRC_TOKEN_RE, (_match, id: string) => {
    const entry = manifest._byId.get(id);
    const src = entry ? pickSrc(entry) : null;
    if (!src) {
      unresolved.push(id);
      return '';
    }
    return ` src="${escapeAttribute(src)}"`;
  });
  return { wxml: replaced, unresolved };
}
