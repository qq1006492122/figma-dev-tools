/**
 * 小程序 local 资产落盘器测试（WBS-P0-22）
 *
 * 真实临时目录写盘，验证：内容/路径正确、sha 去重只写一次、路径越权拒绝、
 * local-resolved 但缺字节（编程错误）快速失败。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  createWeappAssetManifest,
  declareAsset,
  toManifestJSON,
  type WeappAssetManifest,
} from '../../src/services/weapp-assets.js';
import { processWeappAssets, type FetchedAssetBytes } from '../../src/services/weapp-asset-pipeline.js';
import {
  writeWeappLocalAssets,
  WeappAssetPathTraversalError,
} from '../../src/services/weapp-asset-writer.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'fdt-weapp-write-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const PNG_A: FetchedAssetBytes = { bytes: Buffer.from([10, 20, 30]), mime: 'image/png' };
const SVG_B: FetchedAssetBytes = { bytes: Buffer.from('<svg data="b"/>'), mime: 'image/svg+xml' };

async function buildLocalManifest(): Promise<{ manifest: WeappAssetManifest; bytes: Map<string, FetchedAssetBytes> }> {
  const manifest = createWeappAssetManifest();
  declareAsset(manifest, { figmaRef: { nodeId: '1:1', imageRef: null }, kind: 'raster', name: 'hero.png', scene: 'home' });
  declareAsset(manifest, { figmaRef: { nodeId: '2:1', imageRef: null }, kind: 'svg', name: 'logo.svg', mime: 'image/svg+xml', scene: 'home' });
  // 第三个节点引用与 hero 完全相同的字节 → 别名归并，不应产生第二个文件
  declareAsset(manifest, { figmaRef: { nodeId: '3:1', imageRef: null }, kind: 'raster', name: 'hero-copy.png', scene: 'home' });
  const result = await processWeappAssets(
    manifest,
    async (req) => (req.nodeId === '2:1' ? SVG_B : PNG_A),
    { assetMode: 'local' },
  );
  return { manifest, bytes: result.downloaded };
}

describe('writeWeappLocalAssets', () => {
  it('按 hash 路径写入唯一物理文件（别名不重复写），字节与磁盘一致', async () => {
    const { manifest, bytes } = await buildLocalManifest();
    const result = await writeWeappLocalAssets({
      projectRoot: dir,
      entries: toManifestJSON(manifest),
      bytes,
    });

    const canonical = toManifestJSON(manifest);
    expect(canonical).toHaveLength(2);
    expect(result.written).toHaveLength(2);

    const raster = canonical.find((e) => e.kind === 'raster')!;
    const abs = path.join(dir, raster.localPath!.replace(/^\//, '').split('/').join(path.sep));
    await access(abs);
    expect(await readFile(abs)).toEqual(Buffer.from([10, 20, 30]));
    expect(abs).toContain(path.join('images', 'home'));
  });

  it('幂等：对同一 manifest 再写一次不报错且 written 仍为同一组路径', async () => {
    const { manifest, bytes } = await buildLocalManifest();
    await writeWeappLocalAssets({ projectRoot: dir, entries: toManifestJSON(manifest), bytes });
    const again = await writeWeappLocalAssets({ projectRoot: dir, entries: toManifestJSON(manifest), bytes });
    expect(again.written).toHaveLength(2);
  });

  it('localPath 试图越出 projectRoot（路径穿越）→ 抛 WeappAssetPathTraversalError，不落盘', async () => {
    const manifest = createWeappAssetManifest();
    const entry = declareAsset(manifest, { figmaRef: { nodeId: '9:1', imageRef: null }, kind: 'raster', name: 'x.png' });
    // 手工伪造一个越权 local-resolved 条目（纵深防御：即便上游被绕过也不能写出 root）
    entry.state = 'local-resolved';
    entry.reason = null;
    entry.sha256 = 'deadbeef';
    entry.localPath = '/images/../../../../Windows/Temp/evil.png';
    const bytes = new Map<string, FetchedAssetBytes>([['deadbeef', PNG_A]]);

    await expect(
      writeWeappLocalAssets({ projectRoot: dir, entries: [entry], bytes }),
    ).rejects.toBeInstanceOf(
      WeappAssetPathTraversalError,
    );
  });

  it('local-resolved 但 downloaded 缺字节（不应发生的编程错误）→ 直接抛错而非静默丢图', async () => {
    const { manifest } = await buildLocalManifest();
    await expect(
      writeWeappLocalAssets({ projectRoot: dir, entries: toManifestJSON(manifest), bytes: new Map() }),
    ).rejects.toThrow(/bytes/i);
  });
});
