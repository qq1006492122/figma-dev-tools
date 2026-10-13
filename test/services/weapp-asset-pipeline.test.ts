/**
 * 小程序资产三模式编排层测试（WBS-P0-22 核心）
 *
 * 契约：ROADMAP P0-1.2 + 附录 A.5。位图按 assetMode、图标按 iconStrategy；
 * local/cdn/base64 三态 + 4 种 unresolved reason；base64 单文件累计上限。
 * fetcher 注入（零真实网络/磁盘）。
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';

import {
  createWeappAssetManifest,
  declareAsset,
  toManifestJSON,
  type WeappAssetManifest,
} from '../../src/services/weapp-assets.js';
import {
  processWeappAssets,
  buildDataUri,
  joinPublicUrl,
  assetSrcToken,
  resolveAssetSrcTokens,
  type AssetFetchRequest,
  type FetchedAssetBytes,
  type WeappAssetPipelineOptions,
} from '../../src/services/weapp-asset-pipeline.js';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

function makeFetcher(map: Record<string, FetchedAssetBytes | null>) {
  return async (req: AssetFetchRequest): Promise<FetchedAssetBytes | null> => map[req.nodeId] ?? null;
}

function declarePair(manifest: WeappAssetManifest) {
  const raster = declareAsset(manifest, { figmaRef: { nodeId: '1:1', imageRef: null }, kind: 'raster', name: 'hero.png' });
  const icon = declareAsset(manifest, {
    figmaRef: { nodeId: '2:1', imageRef: null },
    kind: 'svg',
    name: 'logo.svg',
    mime: 'image/svg+xml',
  });
  return { raster, icon };
}

const PNG: FetchedAssetBytes = { bytes: Buffer.from([1, 2, 3]), mime: 'image/png' };
const PNG_SHA = sha(Buffer.from([1, 2, 3]));
const SVG: FetchedAssetBytes = { bytes: Buffer.from('<svg/>'), mime: 'image/svg+xml' };

describe('processWeappAssets — local（默认）', () => {
  it('位图与图标默认都落 local：local-resolved 且路径为 /images/<scene>/<hash>-<name>', async () => {
    const m = createWeappAssetManifest();
    const { raster, icon } = declarePair(m);
    await processWeappAssets(m, makeFetcher({ '1:1': PNG, '2:1': SVG }), { assetMode: 'local' });
    expect(raster.state).toBe('local-resolved');
    expect(raster.localPath).toBe(`/images/default/${PNG_SHA.slice(0, 12)}-hero.png`);
    expect(icon.state).toBe('local-resolved');
    expect(icon.localPath).toContain('-logo.svg');
  });
});

describe('processWeappAssets — cdn', () => {
  it('有 publicBaseUrl 且 uploader 校验通过时 cdn-resolved，URL=稳定托管地址', async () => {
    const m = createWeappAssetManifest();
    const { raster } = declarePair(m);
    await processWeappAssets(m, makeFetcher({ '1:1': PNG }), {
      assetMode: 'cdn',
      publicBaseUrl: 'https://cdn.example.com/static/',
      cdnUploader: async (request) => ({
        publicUrl: joinPublicUrl(request.publicBaseUrl, request.key),
        sha256: request.sha256,
        contentType: request.mime,
        status: 200,
        verified: true,
      }),
    });
    expect(raster.state).toBe('cdn-resolved');
    expect(raster.publicUrl).toBe(
      `https://cdn.example.com/static/images/default/${PNG_SHA.slice(0, 12)}-hero.png`,
    );
    expect(raster.sha256).toBe(PNG_SHA);
  });

  it('未配置 uploader 时不会伪造“已上传” CDN URL', async () => {
    const m = createWeappAssetManifest();
    const { raster } = declarePair(m);
    await processWeappAssets(m, makeFetcher({ '1:1': PNG }), {
      assetMode: 'cdn',
      publicBaseUrl: 'https://cdn.example.com/static/',
    });
    expect(raster.state).toBe('unresolved');
    expect(raster.reason).toBe('UPLOAD_REQUIRED');
    expect(raster.publicUrl).toBeNull();
  });

  it('上传返回 hash/类型/验证状态异常时保持 unresolved', async () => {
    for (const [reason, result] of [
      ['UPLOAD_HASH_MISMATCH', { publicUrl: 'https://cdn.example.com/x.png', sha256: 'bad', contentType: 'image/png', status: 200, verified: true }],
      ['UPLOAD_CONTENT_TYPE_MISMATCH', { publicUrl: 'https://cdn.example.com/x.png', sha256: PNG_SHA, contentType: 'text/html', status: 200, verified: true }],
      ['UPLOAD_UNVERIFIED', { publicUrl: 'https://cdn.example.com/x.png', sha256: PNG_SHA, contentType: 'image/png', status: 200, verified: false }],
    ] as const) {
      const m = createWeappAssetManifest();
      const { raster } = declarePair(m);
      await processWeappAssets(m, makeFetcher({ '1:1': PNG }), {
        assetMode: 'cdn',
        publicBaseUrl: 'https://cdn.example.com/static/',
        cdnUploader: async () => result,
      });
      expect(raster.reason).toBe(reason);
    }
  });

  it('缺 publicBaseUrl → MISSING_PUBLIC_BASE_URL（不回退、不输出空 URL）', async () => {
    const m = createWeappAssetManifest();
    const { raster } = declarePair(m);
    await processWeappAssets(m, makeFetcher({ '1:1': PNG }), { assetMode: 'cdn' });
    expect(raster.state).toBe('unresolved');
    expect(raster.reason).toBe('PUBLIC_BASE_URL_REQUIRED');
    expect(raster.publicUrl).toBeNull();
  });

  it('源 URL 是 Figma/S3 临时签名地址 → TEMP_SIGNED_URL（绝不把临时地址当 CDN）', async () => {
    const m = createWeappAssetManifest();
    const raster = declareAsset(m, {
      figmaRef: { nodeId: '1:1', imageRef: null },
      kind: 'raster',
      name: 'hero.png',
    });
    const tempUrl = 'https://s3-alpha.figma.com/p/x.png?X-Amz-Signature=abc&X-Amz-Expires=60';
    await processWeappAssets(m, makeFetcher({ '1:1': { url: tempUrl } }), {
      assetMode: 'cdn',
      publicBaseUrl: 'https://cdn.example.com',
    });
    expect(raster.reason).toBe('TEMP_SIGNED_URL');
    expect(raster.publicUrl).toBeNull();
  });

  it('cdn 模式下 fetcher 给的是稳定 https URL 且无 publicBaseUrl → 直接引用该稳定 URL', async () => {
    const m = createWeappAssetManifest();
    const raster = declareAsset(m, {
      figmaRef: { nodeId: '1:1', imageRef: null },
      kind: 'raster',
      name: 'hero.png',
    });
    await processWeappAssets(
      m,
      makeFetcher({ '1:1': { url: 'https://cdn.example.com/static/hero.png' } }),
      { assetMode: 'cdn' },
    );
    expect(raster.state).toBe('cdn-resolved');
    expect(raster.publicUrl).toBe('https://cdn.example.com/static/hero.png');
  });
});

describe('processWeappAssets — base64', () => {
  it('小图标 base64-resolved，src 为 data URI', async () => {
    const m = createWeappAssetManifest();
    const { icon } = declarePair(m);
    await processWeappAssets(m, makeFetcher({ '2:1': SVG }), {
      assetMode: 'local',
      iconStrategy: 'base64',
    });
    expect(icon.state).toBe('base64-resolved');
    expect(icon.inlineDataUri).toBe(buildDataUri(SVG.bytes, SVG.mime));
  });

  it('位图超 10KB → SIZE_LIMIT unresolved', async () => {
    const m = createWeappAssetManifest();
    const { raster } = declarePair(m);
    const big = { bytes: Buffer.alloc(10 * 1024 + 1), mime: 'image/png' };
    await processWeappAssets(m, makeFetcher({ '1:1': big }), { assetMode: 'base64' });
    expect(raster.state).toBe('unresolved');
    expect(raster.reason).toBe('SIZE_LIMIT');
    expect(raster.inlineDataUri).toBeUndefined();
  });

  it('6 张不同的 7KB 位图：data URI 累计超 50KB 时前 5 张内联、第 6 张 SIZE_LIMIT', async () => {
    // 7168B → base64 9560 + 前缀 22 = 9582 字符；5*9582=47910 ≤ 51200，6*9582=57492 > 51200
    const m = createWeappAssetManifest();
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    for (const id of ids) {
      declareAsset(m, { figmaRef: { nodeId: id, imageRef: null }, kind: 'raster', name: `${id}.png` });
    }
    // 填充字节不同 → sha 不同 → 不会被别名去重，真正触发跨资源累计
    const fetcher = makeFetcher(
      Object.fromEntries(ids.map((id, i) => [id, { bytes: Buffer.alloc(7 * 1024, i + 1), mime: 'image/png' }])),
    );
    await processWeappAssets(m, fetcher, { assetMode: 'base64' });
    const json = toManifestJSON(m);
    expect(json.filter((x) => x.state === 'base64-resolved')).toHaveLength(5);
    expect(json.filter((x) => x.reason === 'SIZE_LIMIT')).toHaveLength(1);
  });

  it('同一字节被多节点引用只产生 1 个 canonical，去重后不重复计入 50KB 预算', async () => {
    const m = createWeappAssetManifest();
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    for (const id of ids) {
      declareAsset(m, { figmaRef: { nodeId: id, imageRef: null }, kind: 'raster', name: `${id}.png` });
    }
    const same = { bytes: Buffer.alloc(7 * 1024, 9), mime: 'image/png' };
    const fetcher = makeFetcher(Object.fromEntries(ids.map((id) => [id, same])));
    await processWeappAssets(m, fetcher, { assetMode: 'base64' });
    const json = toManifestJSON(m); // 仅 canonical
    expect(json).toHaveLength(1);
    expect(json[0].state).toBe('base64-resolved');
    expect(json[0].referencedBy).toHaveLength(6);
  });
});

describe('processWeappAssets — 抓取失败与 iconStrategy 独立', () => {
  it('fetcher 返回 null → FETCH_FAILED', async () => {
    const m = createWeappAssetManifest();
    const { raster } = declarePair(m);
    await processWeappAssets(m, makeFetcher({ '1:1': null }), { assetMode: 'local' });
    expect(raster.state).toBe('unresolved');
    expect(raster.reason).toBe('FETCH_FAILED');
  });

  it('位图 cdn 时图标仍按 iconStrategy=image-local 落本地（两策略独立）', async () => {
    const m = createWeappAssetManifest();
    const { raster, icon } = declarePair(m);
    await processWeappAssets(m, makeFetcher({ '1:1': PNG, '2:1': SVG }), {
      assetMode: 'cdn',
      publicBaseUrl: 'https://cdn.example.com',
      iconStrategy: 'image-local',
      cdnUploader: async (request) => ({
        publicUrl: joinPublicUrl(request.publicBaseUrl, request.key),
        sha256: request.sha256,
        contentType: request.mime,
        status: 200,
        verified: true,
      }),
    });
    expect(raster.state).toBe('cdn-resolved');
    expect(icon.state).toBe('local-resolved');
  });

  it('local 模式缓存已下载字节（sha→bytes），供 CLI 落盘不重复下载', async () => {
    const m = createWeappAssetManifest();
    declarePair(m);
    const result = await processWeappAssets(m, makeFetcher({ '1:1': PNG, '2:1': SVG }), { assetMode: 'local' });
    expect(result.downloaded.get(PNG_SHA)?.bytes).toEqual(Buffer.from([1, 2, 3]));
    expect(result.downloaded.size).toBe(2);
  });
});

describe('joinPublicUrl / buildDataUri', () => {
  it('基址尾部斜杠归一化，避免双斜杠', () => {
    expect(joinPublicUrl('https://cdn.x.com/a', '/images/default/x.png')).toBe('https://cdn.x.com/a/images/default/x.png');
    expect(joinPublicUrl('https://cdn.x.com/a/', '/images/default/x.png')).toBe('https://cdn.x.com/a/images/default/x.png');
  });

  it('buildDataUri 产出标准 data URI', () => {
    expect(buildDataUri(Buffer.from('Hi'), 'image/png')).toBe('data:image/png;base64,SGk=');
  });
});

describe('resolveAssetSrcTokens — 渲染后占位回填（P0-22 两阶段渲染）', () => {
  it('local-resolved：把 src token 换成真实路径，保留其它属性', async () => {
    const m = createWeappAssetManifest();
    const { raster } = declarePair(m);
    await processWeappAssets(m, makeFetcher({ '1:1': PNG, '2:1': SVG }), { assetMode: 'local' });
    const wxml = `<image class="hero" src="${assetSrcToken(raster.id)}" mode="aspectFill" />`;
    const out = resolveAssetSrcTokens(wxml, m);
    expect(out.wxml).toContain(`src="${raster.localPath}"`);
    expect(out.wxml).toContain('class="hero"');
    expect(out.wxml).toContain('mode="aspectFill"');
    expect(out.wxml).not.toContain('__FDT_ASSET_');
    expect(out.unresolved).toEqual([]);
  });

  it('base64-resolved：src 换成 data URI', async () => {
    const m = createWeappAssetManifest();
    const { icon } = declarePair(m);
    await processWeappAssets(m, makeFetcher({ '2:1': SVG }), {
      assetMode: 'local',
      iconStrategy: 'base64',
    });
    const wxml = `<image src="${assetSrcToken(icon.id)}" />`;
    const out = resolveAssetSrcTokens(wxml, m);
    expect(out.wxml).toContain(`src="${buildDataUri(SVG.bytes, SVG.mime)}"`);
  });

  it('unresolved：整块删除 src 属性（绝不留 src=""），并上报 id', async () => {
    const m = createWeappAssetManifest();
    const { raster } = declarePair(m);
    await processWeappAssets(m, makeFetcher({ '1:1': null, '2:1': null }), { assetMode: 'local' });
    const wxml = `<image class="x" src="${assetSrcToken(raster.id)}" mode="aspectFill" />`;
    const out = resolveAssetSrcTokens(wxml, m);
    expect(out.wxml).not.toContain('src=');
    expect(out.wxml).not.toContain('__FDT_ASSET_');
    expect(out.wxml).toContain('class="x"');
    expect(out.unresolved).toContain(raster.id);
  });
});
