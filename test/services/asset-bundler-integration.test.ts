/**
 * 构建器感知资源引用：React/Vue 生成器端到端接线测试（T4 / TR-4.2 补充）
 *
 * 使用最小内存 ProcessedNode（含已下载 asset.localPath）直接走生成器，
 * 验证 planAssetReference 的契约在真实生成管线中成立：
 * 1. vite：ESM import 进入脚本区、img 绑定变量表达式、无 publicCdnUrl 残留
 * 2. webpack：require 表达式
 * 3. nextjs：public 绝对路径字面量
 * 4. none：与 1.4.17 一致的 publicCdnUrl() 形态与 import
 */
import { describe, it, expect } from 'vitest';

import { createCodeGenerator } from '../../src/services/code-generator.js';
import { createVueGenerator } from '../../src/services/vue-generator.js';
import type { FigmaClient } from '../../src/services/figma-client.js';
import type { DesignContext, ProcessedNode } from '../../src/types/nodes.js';
import type { BundlerKind } from '../../src/services/bundler-detector.js';

const ASSET_URL_PATH = '/portal/edu/hero-banner.png';

/** 构造最小含图 ProcessedNode（role=image，asset 已下载，localPath 已填充） */
function makeImageNode(): ProcessedNode {
  return {
    id: 'node-hero',
    figmaId: '10:1',
    name: 'hero-image',
    originalType: 'RECTANGLE',
    role: 'image',
    visible: true,
    clipsContent: false,
    size: { width: 320, height: 180 },
    asset: {
      nodeId: '10:1',
      name: 'hero-banner',
      type: 'image',
      format: 'PNG',
      localPath: ASSET_URL_PATH,
    },
    children: [],
  };
}

/** 构造最小 DesignContext（生成器运行所需字段） */
function makeContext(node: ProcessedNode): DesignContext {
  return {
    fileKey: 'test-file-key',
    node,
    colors: [],
    spacing: [],
    radii: [],
    shadows: [],
    assets: node.asset ? [node.asset] : [],
    textNodes: [],
    componentsUsed: [],
  };
}

/** 生成器仅在 SVG 内联渲染分支使用 client，本夹具节点是位图，不会触达 */
const NULL_CLIENT = null as unknown as FigmaClient;

describe('T4 React 生成器：构建器感知图片引用', () => {
  const BUNDLERS: BundlerKind[] = ['none', 'nextjs', 'vite', 'webpack'];

  for (const bundler of BUNDLERS) {
    it(`bundler=${bundler} 产物快照`, async () => {
      const generator = createCodeGenerator(NULL_CLIENT);
      const result = await generator.generateJsxFromContext(makeContext(makeImageNode()), {
        componentName: 'HeroBanner',
        bundler,
        skipEnhancements: true,
      });
      expect(result.code).toMatchSnapshot();
    });
  }

  it('vite：产物包含 @/assets ESM import 与变量 src，且无 publicCdnUrl', async () => {
    const generator = createCodeGenerator(NULL_CLIENT);
    const { code } = await generator.generateJsxFromContext(makeContext(makeImageNode()), {
      bundler: 'vite',
      skipEnhancements: true,
    });
    expect(code).toContain("import heroBannerPng from '@/assets/portal/edu/hero-banner.png';");
    expect(code).toContain('src={heroBannerPng}');
    expect(code).not.toContain('publicCdnUrl');
  });

  it('webpack：产物包含 require("@/assets/...")，无 ESM import', async () => {
    const generator = createCodeGenerator(NULL_CLIENT);
    const { code } = await generator.generateJsxFromContext(makeContext(makeImageNode()), {
      bundler: 'webpack',
      skipEnhancements: true,
    });
    expect(code).toContain("src={require('@/assets/portal/edu/hero-banner.png')}");
    expect(code).not.toMatch(/import\s+heroBannerPng/);
  });

  it('nextjs：产物使用 public 绝对路径字面量，无 publicCdnUrl/import', async () => {
    const generator = createCodeGenerator(NULL_CLIENT);
    const { code } = await generator.generateJsxFromContext(makeContext(makeImageNode()), {
      bundler: 'nextjs',
      skipEnhancements: true,
    });
    expect(code).toContain("src={'/portal/edu/hero-banner.png'}");
    expect(code).not.toContain('publicCdnUrl');
  });

  it('none：保持 1.4.17 形态 publicCdnUrl() 及其 import', async () => {
    const generator = createCodeGenerator(NULL_CLIENT);
    const { code } = await generator.generateJsxFromContext(makeContext(makeImageNode()), {
      bundler: 'none',
      skipEnhancements: true,
    });
    expect(code).toContain("src={publicCdnUrl('/portal/edu/hero-banner.png')}");
    expect(code).toContain("import { publicCdnUrl } from '@/lib/asset-path';");
  });
});

describe('T4 Vue 生成器：构建器感知图片引用', () => {
  it('vite：script setup 含单引号 ESM import，模板 :src 绑定变量，无 publicCdnUrl', async () => {
    const generator = createVueGenerator(NULL_CLIENT);
    const { code } = await generator.generateFromContext(makeContext(makeImageNode()), {
      bundler: 'vite',
      skipEnhancements: true,
    });
    expect(code).toContain("import heroBannerPng from '@/assets/portal/edu/hero-banner.png';");
    expect(code).toContain(':src="heroBannerPng"');
    expect(code).not.toContain('publicCdnUrl');
  });

  it('webpack：:src 内为单引号 require', async () => {
    const generator = createVueGenerator(NULL_CLIENT);
    const { code } = await generator.generateFromContext(makeContext(makeImageNode()), {
      bundler: 'webpack',
      skipEnhancements: true,
    });
    expect(code).toContain(`:src="require('@/assets/portal/edu/hero-banner.png')"`);
  });

  it('nextjs：:src 绑定 public 绝对路径字面量', async () => {
    const generator = createVueGenerator(NULL_CLIENT);
    const { code } = await generator.generateFromContext(makeContext(makeImageNode()), {
      bundler: 'nextjs',
      skipEnhancements: true,
    });
    expect(code).toContain(`:src="'/portal/edu/hero-banner.png'"`);
    expect(code).not.toContain('publicCdnUrl');
  });

  it('none：保持 1.4.17 形态 :src="publicCdnUrl(...)" 及 script import', async () => {
    const generator = createVueGenerator(NULL_CLIENT);
    const { code } = await generator.generateFromContext(makeContext(makeImageNode()), {
      bundler: 'none',
      skipEnhancements: true,
    });
    expect(code).toContain(`:src="publicCdnUrl('/portal/edu/hero-banner.png')"`);
    expect(code).toContain("import { publicCdnUrl } from '@/lib/asset-path';");
  });
});
