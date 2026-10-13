/**
 * WeappAssetManifest 单元测试（WBS-P0-21）
 *
 * 契约来源：ROADMAP-v1.4.20-v2.md P0-1.2（manifest jsonc）与附录 A.5。
 * 覆盖：
 *  1. 顺序稳定 id 与 schema 默认值
 *  2. local/cdn/base64 三种 resolved 状态
 *  3. sha256+kind 去重与多节点引用归并
 *  4. hash 路径命名与名称安全化
 *  5. 临时 Figma 签名 URL 专门错误（不得当 CDN）
 *  6. unresolved 永不产生空 src
 *  7. base64 资格判定（图标/位图大小阈值）
 */
import { describe, it, expect } from 'vitest';

import {
  createWeappAssetManifest,
  declareAsset,
  resolveLocal,
  resolveCdn,
  resolveBase64,
  markUnresolved,
  pickSrc,
  toManifestJSON,
  assetWarnings,
  isTemporaryFigmaUrl,
  checkBase64Eligible,
  weappAssetPath,
  BASE64_ICON_MAX_BYTES,
  BASE64_RASTER_MAX_BYTES,
  type DeclareAssetInput,
} from '../../src/services/weapp-assets.js';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

function declareInput(over: Partial<DeclareAssetInput> = {}): DeclareAssetInput {
  return {
    figmaRef: { nodeId: '10:1', imageRef: null },
    kind: 'raster',
    name: 'hero.png',
    ...over,
  };
}

describe('WeappAssetManifest — 声明与 schema', () => {
  it('按声明顺序分配稳定 id（a_0001、a_0002 …）', () => {
    const m = createWeappAssetManifest();
    const e1 = declareAsset(m, declareInput());
    const e2 = declareAsset(m, declareInput({ figmaRef: { nodeId: '10:2', imageRef: null } }));
    expect(e1.id).toBe('a_0001');
    expect(e2.id).toBe('a_0002');
  });

  it('未解析条目包含冻结 schema 全部字段且默认值正确', () => {
    const m = createWeappAssetManifest();
    const e = declareAsset(m, declareInput());
    expect(e).toMatchObject({
      id: 'a_0001',
      figmaRef: { nodeId: '10:1', imageRef: null },
      kind: 'raster',
      state: 'unresolved',
      reason: null,
      localPath: null,
      publicUrl: null,
      sha256: null,
      bytes: 0,
      mime: 'image/png',
      pixelRatio: 2,
      scene: 'default',
    });
    expect(e.referencedBy).toEqual(['10:1']);
    expect(e.aliasOf).toBeUndefined();
  });

  it('scene 与 pixelRatio 从声明入参传播', () => {
    const m = createWeappAssetManifest();
    const e = declareAsset(m, declareInput({ scene: 'home', pixelRatio: 3, mime: 'image/jpeg' }));
    expect(e.scene).toBe('home');
    expect(e.pixelRatio).toBe(3);
    expect(e.mime).toBe('image/jpeg');
  });
});

describe('WeappAssetManifest — local 解析与路径命名', () => {
  it('resolveLocal 产出 local-resolved 与 /images/<scene>/<hash12>-<name>.<ext>', () => {
    const m = createWeappAssetManifest();
    const e = declareAsset(m, declareInput());
    const r = resolveLocal(m, e.id, { sha256: SHA_A, bytes: 1234 });
    expect(r.state).toBe('local-resolved');
    expect(r.sha256).toBe(SHA_A);
    expect(r.bytes).toBe(1234);
    expect(r.localPath).toBe(`/images/default/${SHA_A.slice(0, 12)}-hero.png`);
    expect(pickSrc(r)).toBe(r.localPath);
  });

  it('名称安全化：去特殊字符、防路径穿越；svg/jpeg 扩展名正确', () => {
    expect(weappAssetPath('default', SHA_A, 'My Icon@2x!.PNG', 'image/png', 'raster')).toMatch(
      /^\/images\/default\/a{12}-my-icon-2x\.png$/,
    );
    const traversal = weappAssetPath('default', SHA_A, '../../etc/passwd', 'image/png', 'raster');
    expect(traversal).not.toContain('..');
    expect(traversal.split('/').length).toBe(4);
    expect(weappAssetPath('default', SHA_A, 'logo', 'image/svg+xml', 'svg').endsWith('.svg')).toBe(true);
    expect(weappAssetPath('default', SHA_A, 'photo', 'image/jpeg', 'raster').endsWith('.jpg')).toBe(true);
    expect(weappAssetPath('default', SHA_A, '', 'image/png', 'raster')).toContain('-asset.png');
  });

  it('同 sha256+kind 的第二次解析归并为同一物理文件（去重）', () => {
    const m = createWeappAssetManifest();
    const e1 = declareAsset(m, declareInput({ figmaRef: { nodeId: '10:1', imageRef: null }, name: 'a.png' }));
    const e2 = declareAsset(m, declareInput({ figmaRef: { nodeId: '20:2', imageRef: null }, name: 'b.png' }));
    resolveLocal(m, e1.id, { sha256: SHA_A, bytes: 100 });
    const r2 = resolveLocal(m, e2.id, { sha256: SHA_A, bytes: 100 });
    expect(r2.aliasOf).toBe('a_0001');
    expect(pickSrc(r2)).toBe(`/images/default/${SHA_A.slice(0, 12)}-a.png`);
    const json = toManifestJSON(m);
    expect(json).toHaveLength(1);
    expect(json[0].referencedBy).toEqual(['10:1', '20:2']);
    expect(json[0].localPath).toContain('a.png');
  });
});

describe('WeappAssetManifest — cdn 与临时签名 URL', () => {
  it('稳定 https URL 可作为 cdn-resolved', () => {
    const m = createWeappAssetManifest();
    const e = declareAsset(m, declareInput());
    const r = resolveCdn(m, e.id, {
      publicUrl: 'https://cdn.example.com/images/hero.png',
      sha256: SHA_A,
      bytes: 100,
    });
    expect(r.state).toBe('cdn-resolved');
    expect(r.publicUrl).toBe('https://cdn.example.com/images/hero.png');
    expect(pickSrc(r)).toBe('https://cdn.example.com/images/hero.png');
  });

  it('任意 HTTPS 临时签名 URL 都不能进入 CDN resolved', () => {
    const url = 'https://images.example.com/export.png?X-Amz-Signature=abc&X-Amz-Expires=60';
    expect(isTemporaryFigmaUrl(url)).toBe(true);
    const m = createWeappAssetManifest();
    const e = declareAsset(m, declareInput());
    const r = resolveCdn(m, e.id, { publicUrl: url, sha256: SHA_A, bytes: 100 });
    expect(r.state).toBe('unresolved');
    expect(r.reason).toBe('TEMP_SIGNED_URL');
  });
  it.each([
    ['X-Amz 签名参数', 'https://s3-alpha.figma.com/p/abc.png?X-Amz-Signature=deadbeef&X-Amz-Expires=3600'],
    ['AWS Signature 参数', 'https://figma-alpha-api.s3.us-west-1.amazonaws.com/x.png?Signature=abc&Expires=123'],
  ])('%s 判为临时 URL：%s', (_label, url) => {
    expect(isTemporaryFigmaUrl(url)).toBe(true);
    const m = createWeappAssetManifest();
    const e = declareAsset(m, declareInput());
    const r = resolveCdn(m, e.id, { publicUrl: url, sha256: SHA_A, bytes: 100 });
    expect(r.state).toBe('unresolved');
    expect(r.reason).toBe('TEMP_SIGNED_URL');
    expect(r.publicUrl).toBeNull();
    expect(pickSrc(r)).toBeNull();
    expect(assetWarnings(m)).toEqual([{ code: 'FDT-ASSET-TEMP-SIGNED-URL', assetId: 'a_0001' }]);
  });
});

describe('WeappAssetManifest — unresolved / base64', () => {
  it('markUnresolved 支持 FETCH_FAILED 与 MISSING_PUBLIC_BASE_URL，pickSrc 永远为 null', () => {
    const m = createWeappAssetManifest();
    const e1 = declareAsset(m, declareInput({ figmaRef: { nodeId: '1:1', imageRef: null } }));
    const e2 = declareAsset(m, declareInput({ figmaRef: { nodeId: '1:2', imageRef: null } }));
    expect(pickSrc(markUnresolved(m, e1.id, 'FETCH_FAILED'))).toBeNull();
    expect(pickSrc(markUnresolved(m, e2.id, 'MISSING_PUBLIC_BASE_URL'))).toBeNull();
    const json = toManifestJSON(m);
    expect(json.map((x) => x.reason)).toEqual(['FETCH_FAILED', 'MISSING_PUBLIC_BASE_URL']);
    expect(json.every((x) => x.localPath === null && x.publicUrl === null && x.sha256 === null)).toBe(true);
  });

  it('resolveBase64 产出 data URI，pickSrc 直接可用', () => {
    const m = createWeappAssetManifest();
    const e = declareAsset(m, declareInput({ kind: 'svg', mime: 'image/svg+xml' }));
    const r = resolveBase64(m, e.id, {
      sha256: SHA_B,
      bytes: 64,
      dataUri: 'data:image/svg+xml;base64,PHN2Zy8+',
    });
    expect(r.state).toBe('base64-resolved');
    expect(pickSrc(r)).toBe('data:image/svg+xml;base64,PHN2Zy8+');
  });

  it('checkBase64Eligible：图标 2KB / 位图 10KB 为界，超限给 SIZE_LIMIT', () => {
    expect(checkBase64Eligible('svg', BASE64_ICON_MAX_BYTES)).toBe('ok');
    expect(checkBase64Eligible('svg', BASE64_ICON_MAX_BYTES + 1)).toBe('SIZE_LIMIT');
    expect(checkBase64Eligible('raster', BASE64_RASTER_MAX_BYTES)).toBe('ok');
    expect(checkBase64Eligible('raster', BASE64_RASTER_MAX_BYTES + 1)).toBe('SIZE_LIMIT');
  });

  it('对未知 id 执行状态迁移抛错（fail fast，不静默吞掉）', () => {
    const m = createWeappAssetManifest();
    expect(() => markUnresolved(m, 'a_9999', 'FETCH_FAILED')).toThrowError(/a_9999/);
  });
});
