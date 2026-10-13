/**
 * 微信小程序资源状态机与 asset manifest（WBS-P0-21）
 *
 * 纯函数层：零 I/O、零网络、零文件系统——字节获取与落盘由 P0-22 在本状态机
 * 之上编排。契约冻结于 ROADMAP-v1.4.20-v2.md P0-1.2（manifest jsonc）与
 * 附录 A.5；字段只允许新增可选字段，不得改语义。
 *
 * 状态机：
 *   declare → unresolved(reason=null,表示尚未处理)
 *           → resolveLocal / resolveCdn / resolveBase64 → *-resolved
 *           → markUnresolved(reason) 永久 unresolved（不可再当 src 输出）
 *
 * 不变量：
 *   - pickSrc(unresolved) === null，调用方（WXML 生成，P0-31）永远拿不到空串 src
 *   - 临时 Figma/S3 签名 URL 不可能进入 cdn-resolved（TEMP_SIGNED_URL 专门错误）
 *   - 物理文件去重键 = `${kind}:${sha256}`，多节点引用共用同一路径
 *
 * @module
 */

// ============ 冻结契约类型 ============

export type WeappAssetKind = 'raster' | 'svg';

export type WeappAssetState =
  | 'local-resolved'
  | 'cdn-resolved'
  | 'base64-resolved'
  | 'unresolved';

/** 与附录 A.1 的 ASSET 错误码同名一一对应（warning code 加 FDT-ASSET- 前缀） */
export type WeappAssetReason =
  | 'TEMP_SIGNED_URL'
  | 'FETCH_FAILED'
  | 'SIZE_LIMIT'
  | 'MISSING_PUBLIC_BASE_URL'
  | 'PUBLIC_BASE_URL_REQUIRED'
  | 'UPLOAD_REQUIRED'
  | 'UPLOAD_FAILED'
  | 'UPLOAD_UNVERIFIED'
  | 'UPLOAD_HASH_MISMATCH'
  | 'UPLOAD_CONTENT_TYPE_MISMATCH';

export interface WeappAssetFigmaRef {
  nodeId: string;
  imageRef: string | null;
}

export interface WeappAssetManifestEntry {
  /** 本次生成内稳定唯一：a_0001 起顺序分配 */
  id: string;
  figmaRef: WeappAssetFigmaRef;
  kind: WeappAssetKind;
  state: WeappAssetState;
  /** 仅 state=unresolved 时非空；null 表示"尚未处理"而非失败 */
  reason: WeappAssetReason | null;
  /** /images/<scene>/<sha256 前12>-<安全名>.<ext> */
  localPath: string | null;
  publicUrl: string | null;
  sha256: string | null;
  bytes: number;
  mime: string;
  pixelRatio: 1 | 2 | 3;
  scene: string;
  /** 引用该物理资源的全部节点（去重后同文件共用一条 canonical 记录） */
  referencedBy: string[];
  /** 指向 canonical 条目 id；存在时本条为别名，不进 manifest JSON */
  aliasOf?: string;
  /** 仅 base64-resolved：内联 data URI（P0-1.2 允许的新增可选字段） */
  inlineDataUri?: string;
}

export interface DeclareAssetInput {
  figmaRef: WeappAssetFigmaRef;
  kind: WeappAssetKind;
  /** 原始资源名（用于落盘文件名安全化） */
  name: string;
  mime?: string;
  pixelRatio?: 1 | 2 | 3;
  scene?: string;
}

export interface WeappAssetManifest {
  /** @internal */
  _seq: number;
  /** @internal */
  _byId: Map<string, WeappAssetManifestEntry>;
  /** @internal 去重键 `${kind}:${sha256}` → canonical id */
  _hashIndex: Map<string, string>;
  /** @internal 声明时的原始资源名（不属于冻结 manifest 字段，仅供路径命名） */
  _names: Map<string, string>;
}

/** base64 资格阈值（字节，冻结于 ROADMAP P0-1.2） */
export const BASE64_ICON_MAX_BYTES = 2 * 1024;
export const BASE64_RASTER_MAX_BYTES = 10 * 1024;
/** 同一生成文件内 data URI 总大小上限（P0-22 累加，本文件仅提供常量） */
export const BASE64_TOTAL_MAX_PER_FILE = 50 * 1024;

export interface AssetWarning {
  /** `FDT-ASSET-` + reason 的 kebab 形式（附录 A.1，如 FDT-ASSET-TEMP-SIGNED-URL） */
  code: string;
  assetId: string;
}

// ============ 注册表与状态迁移 ============

export function createWeappAssetManifest(): WeappAssetManifest {
  return { _seq: 0, _byId: new Map(), _hashIndex: new Map(), _names: new Map() };
}

/** 生成期声明一个节点引用的资源；初始 unresolved(reason=null) */
export function declareAsset(
  manifest: WeappAssetManifest,
  input: DeclareAssetInput,
): WeappAssetManifestEntry {
  const id = `a_${String(++manifest._seq).padStart(4, '0')}`;
  const entry: WeappAssetManifestEntry = {
    id,
    figmaRef: input.figmaRef,
    kind: input.kind,
    state: 'unresolved',
    reason: null,
    localPath: null,
    publicUrl: null,
    sha256: null,
    bytes: 0,
    mime: input.mime ?? 'image/png',
    pixelRatio: input.pixelRatio ?? 2,
    scene: input.scene ?? 'default',
    referencedBy: [input.figmaRef.nodeId],
  };
  manifest._byId.set(id, entry);
  manifest._names.set(id, input.name);
  return entry;
}

export interface LocalResolution {
  sha256: string;
  bytes: number;
  /** 覆盖声明名（落盘文件名） */
  name?: string;
}

export function resolveLocal(
  manifest: WeappAssetManifest,
  id: string,
  res: LocalResolution,
): WeappAssetManifestEntry {
  const entry = requireEntry(manifest, id);
  const canonical = findCanonical(manifest, entry.kind, res.sha256);
  if (canonical) return aliasTo(manifest, entry, canonical);
  entry.state = 'local-resolved';
  entry.reason = null;
  entry.sha256 = res.sha256;
  entry.bytes = res.bytes;
  entry.localPath = weappAssetPath(
    entry.scene,
    res.sha256,
    res.name ?? manifest._names.get(id) ?? '',
    entry.mime,
    entry.kind,
  );
  manifest._hashIndex.set(hashKey(entry.kind, res.sha256), entry.id);
  return entry;
}

export interface CdnResolution {
  publicUrl: string;
  sha256: string | null;
  bytes: number;
}

export function resolveCdn(
  manifest: WeappAssetManifest,
  id: string,
  res: CdnResolution,
): WeappAssetManifestEntry {
  const entry = requireEntry(manifest, id);
  // 临时签名 URL：永远进不了 cdn-resolved，专门错误码
  if (isTemporaryFigmaUrl(res.publicUrl)) {
    return markUnresolved(manifest, id, 'TEMP_SIGNED_URL');
  }
  if (res.sha256) {
    const canonical = findCanonical(manifest, entry.kind, res.sha256);
    if (canonical) return aliasTo(manifest, entry, canonical);
  }
  entry.state = 'cdn-resolved';
  entry.reason = null;
  entry.publicUrl = res.publicUrl;
  entry.sha256 = res.sha256;
  entry.bytes = res.bytes;
  if (res.sha256) manifest._hashIndex.set(hashKey(entry.kind, res.sha256), entry.id);
  return entry;
}

export interface Base64Resolution {
  sha256: string;
  bytes: number;
  dataUri: string;
}

export function resolveBase64(
  manifest: WeappAssetManifest,
  id: string,
  res: Base64Resolution,
): WeappAssetManifestEntry {
  const entry = requireEntry(manifest, id);
  const eligible = checkBase64Eligible(entry.kind, res.bytes);
  if (eligible !== 'ok') return markUnresolved(manifest, id, eligible);
  const canonical = findCanonical(manifest, entry.kind, res.sha256);
  if (canonical) return aliasTo(manifest, entry, canonical);
  entry.state = 'base64-resolved';
  entry.reason = null;
  entry.sha256 = res.sha256;
  entry.bytes = res.bytes;
  entry.inlineDataUri = res.dataUri;
  manifest._hashIndex.set(hashKey(entry.kind, res.sha256), entry.id);
  return entry;
}

export function markUnresolved(
  manifest: WeappAssetManifest,
  id: string,
  reason: WeappAssetReason,
): WeappAssetManifestEntry {
  const entry = requireEntry(manifest, id);
  entry.state = 'unresolved';
  entry.reason = reason;
  entry.localPath = null;
  entry.publicUrl = null;
  entry.inlineDataUri = undefined;
  entry.sha256 = null;
  entry.bytes = 0;
  return entry;
}

// ============ 查询与输出 ============

/**
 * 生成 WXML/样式时唯一允许使用的 src 选择器。
 * unresolved（含尚未处理/失败）一律返回 null——调用方不得回退为空串。
 */
export function pickSrc(entry: WeappAssetManifestEntry): string | null {
  switch (entry.state) {
    case 'local-resolved':
      return entry.localPath;
    case 'cdn-resolved':
      return entry.publicUrl;
    case 'base64-resolved':
      return entry.inlineDataUri ?? null;
    case 'unresolved':
      return null;
  }
}

/** manifest JSON：仅 canonical 条目（别名已归并），保持声明顺序 */
export function toManifestJSON(
  manifest: WeappAssetManifest,
): WeappAssetManifestEntry[] {
  return [...manifest._byId.values()].filter((e) => e.aliasOf === undefined);
}

/** 失败资源的结构化 warning（消息 i18n 在工具层拼装，见附录 A.5） */
export function assetWarnings(manifest: WeappAssetManifest): AssetWarning[] {
  const out: AssetWarning[] = [];
  for (const e of manifest._byId.values()) {
    if (e.state === 'unresolved' && e.reason) {
      out.push({ code: `FDT-ASSET-${e.reason.replaceAll('_', '-')}`, assetId: e.id });
    }
  }
  return out;
}

/**
 * base64 资格判定（纯判定，不抛错；调用方据结果转 SIZE_LIMIT unresolved）。
 * 图标（svg 等）2KB、位图 10KB（冻结于 ROADMAP P0-1.2）。
 */
export function checkBase64Eligible(
  kind: WeappAssetKind,
  bytes: number,
): 'ok' | 'SIZE_LIMIT' {
  const limit = kind === 'svg' ? BASE64_ICON_MAX_BYTES : BASE64_RASTER_MAX_BYTES;
  return bytes <= limit ? 'ok' : 'SIZE_LIMIT';
}

/**
 * 临时 Figma/S3 签名 URL 识别（专门错误 TEMP_SIGNED_URL）：
 *  - 查询参数含 AWS 签名（X-Amz-Signature/Expires、Signature/Expires）
 *  - 主机为 S3/Figma alpha 临时桶（s3-alpha.figma.com、*.amazonaws.com）
 */
export function isTemporaryFigmaUrl(rawUrl: string): boolean {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  const signedQuery =
    u.searchParams.has('X-Amz-Signature') ||
    u.searchParams.has('X-Amz-Expires') ||
    u.searchParams.has('Signature') ||
    u.searchParams.has('Expires');
  const tempHost =
    host === 's3-alpha.figma.com' || host.endsWith('.amazonaws.com');
  return signedQuery || tempHost;
}

/**
 * 小程序资源落位路径：/images/<scene>/<sha256前12>-<安全名>.<ext>
 * 名称做 slug 化（防穿越/特殊字符），扩展名只从白名单映射。
 */
export function weappAssetPath(
  scene: string,
  sha256: string,
  rawName: string,
  mime: string,
  kind: WeappAssetKind,
): string {
  const seg = slugify(scene) || 'default';
  const base = stripExtension(rawName);
  const name = slugify(base) || 'asset';
  const ext = extensionFor(mime, kind);
  return `/images/${seg}/${sha256.slice(0, 12)}-${name}.${ext}`;
}

// ============ 内部辅助 ============

function requireEntry(
  manifest: WeappAssetManifest,
  id: string,
): WeappAssetManifestEntry {
  const e = manifest._byId.get(id);
  if (!e) throw new RangeError(`weapp asset id not found: ${id}`);
  return e;
}

function hashKey(kind: WeappAssetKind, sha256: string): string {
  return `${kind}:${sha256}`;
}

function findCanonical(
  manifest: WeappAssetManifest,
  kind: WeappAssetKind,
  sha256: string,
): WeappAssetManifestEntry | null {
  const cid = manifest._hashIndex.get(hashKey(kind, sha256));
  return cid ? manifest._byId.get(cid) ?? null : null;
}

/** 把重复资源条目别名化到 canonical：复制解析结果、归并 referencedBy */
function aliasTo(
  manifest: WeappAssetManifest,
  entry: WeappAssetManifestEntry,
  canonical: WeappAssetManifestEntry,
): WeappAssetManifestEntry {
  entry.aliasOf = canonical.id;
  entry.state = canonical.state;
  entry.reason = canonical.reason;
  entry.localPath = canonical.localPath;
  entry.publicUrl = canonical.publicUrl;
  entry.sha256 = canonical.sha256;
  entry.bytes = canonical.bytes;
  entry.inlineDataUri = canonical.inlineDataUri;
  for (const ref of entry.referencedBy) {
    if (!canonical.referencedBy.includes(ref)) canonical.referencedBy.push(ref);
  }
  return entry;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function stripExtension(name: string): string {
  return name.replace(/\.[a-z0-9]{1,5}$/i, '');
}

function extensionFor(mime: string, kind: WeappAssetKind): string {
  if (kind === 'svg' || mime === 'image/svg+xml') return 'svg';
  switch (mime) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
}
