/**
 * AssetDownloader 构建器接线测试（v1.4.18，T4）
 *
 * 纯函数层（asset-paths）已锁定引用规划契约，本文件锁定下载器两处
 * 成功结果构造点（skipExisting 命中 + 实际下载写入）与落位/报告的接线：
 * - vite/webpack → src/assets 落位 + esm-import/require 引用
 * - nextjs/none → public 落位 + public-absolute/public-cdn 引用
 * - 下载报告的 import 片段随构建器形态变化
 *
 * 网络层以 vi.stubGlobal('fetch') 替换，零真实网络依赖。
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AssetDownloader, createAssetDownloader } from '../../src/services/asset-downloader.js';
import type { FigmaClient } from '../../src/services/figma-client.js';
import type { ProcessedAsset } from '../../src/types/nodes.js';

/** 最小合法 PNG 魔数（仅用于落盘内容断言，不参与解码） */
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * 构造测试用 ProcessedAsset（默认 PNG 图片节点）
 *
 * @param overrides - 字段覆盖
 * @returns 最小完整 ProcessedAsset
 */
function makeAsset(overrides: Partial<ProcessedAsset> = {}): ProcessedAsset {
  return {
    nodeId: '10:1',
    name: 'hero-banner',
    type: 'image',
    format: 'PNG',
    ...overrides,
  };
}

/**
 * 构造 getImages 返回固定导出 URL 的 FigmaClient 桩
 *
 * @param url - Figma Images API 返回的临时导出地址
 * @returns FigmaClient 形态桩对象
 */
function makeClient(url = 'https://figma.example/export/10-1.png'): FigmaClient {
  return {
    getImages: vi.fn(async () => ({ images: { '10:1': url } })),
  } as unknown as FigmaClient;
}

describe('AssetDownloader 构建器感知落位与引用（T4）', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-asset-bundler-'));
    // 下载器内部使用全局 fetch 拉取导出 URL；以内存响应替换
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(PNG_BYTES, { status: 200, headers: { 'content-type': 'image/png' } })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('bundler=vite：资源落位 src/assets 且引用为 esm-import 形态', async () => {
    const client = makeClient();
    const downloader = createAssetDownloader(client, { projectRoot, bundler: 'vite', skipExisting: false });

    const [result] = await downloader.downloadAssets('file-key', 'edu', [makeAsset()]);
    expect(result).toBeDefined();
    expect(result?.success).toBe(true);

    // 1. 文件物理落位到 src/assets（而非 1.4.17 的 public）
    const expectedFile = path.join(projectRoot, 'src', 'assets', 'portal', 'edu', 'hero-banner.png');
    expect(fs.existsSync(expectedFile)).toBe(true);
    expect(fs.readFileSync(expectedFile)).toEqual(PNG_BYTES);

    // 2. URL 路径仍是根相对裸路径（vite 下 cdnUrl 字段不再包 publicCdnUrl）
    expect(result?.localPath).toBe('/portal/edu/hero-banner.png');
    expect(result?.cdnUrl).toBe('/portal/edu/hero-banner.png');

    // 3. 引用规划：esm 变量 + @/assets import
    expect(result?.reference?.kind).toBe('esm-import');
    expect(result?.importCode).toBe('heroBannerPng');
    expect(result?.reference?.expression).toBe('heroBannerPng');
    expect(result?.reference?.imports).toEqual([
      "import heroBannerPng from '@/assets/portal/edu/hero-banner.png';",
    ]);
    // assetDir 为相对项目根的完整落位目录（含场景前缀）
    expect(result?.reference?.assetDir).toBe('src/assets/portal/edu');

    // 4. 回写 ProcessedAsset 的字段与结果一致
    expect(result?.asset.localPath).toBe('/portal/edu/hero-banner.png');
    expect(result?.asset.cdnUrl).toBe('/portal/edu/hero-banner.png');

    // 5. 实际发起了一次导出下载
    const mockedFetch = vi.mocked(fetch);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it('bundler=vite + skipExisting 命中：第二处成功构造点同样产出 esm-import 且不再发起下载', async () => {
    const client = makeClient();
    const downloader = createAssetDownloader(client, { projectRoot, bundler: 'vite', skipExisting: true });

    // 第一次：真实写入
    const [first] = await downloader.downloadAssets('file-key', 'edu', [makeAsset()]);
    expect(first?.success).toBe(true);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);

    // 第二次：文件已存在，命中 skipExisting 分支（不下载）
    const [second] = await downloader.downloadAssets('file-key', 'edu', [makeAsset()]);
    expect(second?.success).toBe(true);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1); // 无新增 fetch

    // 两处构造点行为一致
    expect(second?.reference?.kind).toBe('esm-import');
    expect(second?.importCode).toBe('heroBannerPng');
    expect(second?.localPath).toBe('/portal/edu/hero-banner.png');
    expect(second?.cdnUrl).toBe('/portal/edu/hero-banner.png');
  });

  it('bundler=none：完整保持 1.4.17 行为（public 落位 + publicCdnUrl 包裹）', async () => {
    const client = makeClient();
    const downloader = createAssetDownloader(client, { projectRoot, skipExisting: false });

    const [result] = await downloader.downloadAssets('file-key', 'edu', [makeAsset()]);
    expect(result?.success).toBe(true);

    const expectedFile = path.join(projectRoot, 'public', 'portal', 'edu', 'hero-banner.png');
    expect(fs.existsSync(expectedFile)).toBe(true);

    expect(result?.reference?.kind).toBe('public-cdn');
    expect(result?.reference?.assetDir).toBe('public/portal/edu');
    expect(result?.importCode).toBe("publicCdnUrl('/portal/edu/hero-banner.png')");
    expect(result?.cdnUrl).toBe("publicCdnUrl('/portal/edu/hero-banner.png')");
    expect(result?.reference?.imports).toEqual([]);
  });

  it('bundler=webpack：src/assets 落位 + require() 引用形态', async () => {
    const client = makeClient();
    const downloader = createAssetDownloader(client, { projectRoot, bundler: 'webpack', skipExisting: false });

    const [result] = await downloader.downloadAssets('file-key', 'edu', [makeAsset()]);
    expect(result?.success).toBe(true);

    expect(fs.existsSync(path.join(projectRoot, 'src', 'assets', 'portal', 'edu', 'hero-banner.png'))).toBe(true);
    expect(result?.reference?.kind).toBe('require');
    expect(result?.importCode).toBe("require('@/assets/portal/edu/hero-banner.png')");
    expect(result?.cdnUrl).toBe('/portal/edu/hero-banner.png');
  });

  it('bundler=nextjs：public 落位 + 裸绝对路径引用（public-absolute）', async () => {
    const client = makeClient();
    const downloader = createAssetDownloader(client, { projectRoot, bundler: 'nextjs', skipExisting: false });

    const [result] = await downloader.downloadAssets('file-key', 'edu', [makeAsset()]);
    expect(result?.success).toBe(true);

    expect(fs.existsSync(path.join(projectRoot, 'public', 'portal', 'edu', 'hero-banner.png'))).toBe(true);
    expect(result?.reference?.kind).toBe('public-absolute');
    expect(result?.importCode).toBe("'/portal/edu/hero-banner.png'");
    expect(result?.cdnUrl).toBe('/portal/edu/hero-banner.png');
  });

  it('默认缺省 bundler 时与显式 none 等价（回归 1.4.17）', async () => {
    const downloader = createAssetDownloader(makeClient(), { projectRoot, bundler: undefined, skipExisting: false });
    const [result] = await downloader.downloadAssets('file-key', 'default', [makeAsset()]);
    expect(result?.success).toBe(true);
    expect(result?.reference?.kind).toBe('public-cdn');
    expect(result?.importCode).toBe("publicCdnUrl('/portal/default/hero-banner.png')");
    expect(fs.existsSync(path.join(projectRoot, 'public', 'portal', 'default', 'hero-banner.png'))).toBe(true);
  });

  it('generateAssetsReport：vite 结果输出 esm import 且不含 publicCdnUrl 导入', async () => {
    const downloader = createAssetDownloader(makeClient(), { projectRoot, bundler: 'vite', skipExisting: false });
    const results = await downloader.downloadAssets('file-key', 'edu', [makeAsset()]);

    const report = AssetDownloader.generateAssetsReport(results);
    expect(report).toContain("import heroBannerPng from '@/assets/portal/edu/hero-banner.png';");
    expect(report).not.toContain("import { publicCdnUrl } from '@/core/config';");
    // esm 形态不重复声明常量
    expect(report).not.toContain('HERO_BANNER_URL');
    // 落位列体现 src/assets 完整目录
    expect(report).toContain('src/assets/portal/edu/hero-banner.png');
  });

  it('generateAssetsReport：none 结果输出 publicCdnUrl 导入与常量示例', async () => {
    const downloader = createAssetDownloader(makeClient(), { projectRoot, bundler: 'none', skipExisting: false });
    const results = await downloader.downloadAssets('file-key', 'edu', [makeAsset()]);

    const report = AssetDownloader.generateAssetsReport(results);
    expect(report).toContain("import { publicCdnUrl } from '@/core/config';");
    expect(report).toContain("const HERO_BANNER_URL = publicCdnUrl('/portal/edu/hero-banner.png');");
    expect(report).toContain('public/portal/edu/hero-banner.png');
  });
});
