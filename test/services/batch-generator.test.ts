/**
 * v1.4.19 T20 批量代码生成（TR-20.1 / TR-20.2 的生成阶段）
 *
 * - React Tailwind：每区块一个 .tsx + index.ts barrel + barrel 依赖边（快照）；
 * - React CSS Modules：追加 .module.css 文件与 sidecar 依赖边，主文件 import styles；
 * - Vue 3：每区块一个 .vue，barrel 以 './X.vue' 再导出 default；
 * - --prefix 等价的组件名前缀透传；
 * - 整页拆分与显式 nodeIds 两个入口在同节点上产物逐文件一致（TR-20.2）；
 * - 空选择抛 i18n 错误（中英双键），由 MCP/CLI 层转为用户可见失败。
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { createBatchGenerator, type BatchGenResult } from '../../src/services/batch-generator.js';
import { selectBlocksByIds, splitPageIntoBlocks } from '../../src/services/block-splitter.js';
import type { FigmaClient } from '../../src/services/figma-client.js';
import { I18n, initI18nSync } from '../../src/i18n/index.js';
import type { DesignContext, ProcessedNode } from '../../src/types/nodes.js';

/** 无矢量/位图节点时生成器不触达 client（与 vue-version-pipeline 测试同款桩） */
const NULL_CLIENT = null as unknown as FigmaClient;

let seq = 0;

/** 构造含文本子节点的区块容器（尺寸/布局字段为样式渲染器兜底） */
function makeBlock(name: string, figmaId: string): ProcessedNode {
  seq += 1;
  return {
    id: `block-${seq}`,
    figmaId,
    name,
    originalType: 'FRAME',
    role: 'container',
    visible: true,
    clipsContent: false,
    size: { width: 1200, height: 240 },
    layout: {
      mode: 'HORIZONTAL',
      primaryAxisAlign: 'MIN',
      counterAxisAlign: 'CENTER',
      primaryAxisSizing: 'AUTO',
      counterAxisSizing: 'AUTO',
      layoutWrap: 'NO_WRAP',
      itemSpacing: 16,
      counterAxisSpacing: 0,
      padding: { top: 16, right: 16, bottom: 16, left: 16 },
    },
    children: [
      {
        id: `block-${seq}-text`,
        figmaId: `${figmaId}-t`,
        name: `${name} label`,
        originalType: 'TEXT',
        role: 'text',
        visible: true,
        clipsContent: false,
        size: { width: 160, height: 24 },
        textContent: name,
        children: [],
      },
    ],
  };
}

/** 三区块页面（Header / Hero / Features 关键词各一） */
function makePageTree(): ProcessedNode {
  return {
    id: 'page-root',
    figmaId: '1:0',
    name: 'Landing Page',
    originalType: 'FRAME',
    role: 'container',
    visible: true,
    clipsContent: false,
    size: { width: 1440, height: 1600 },
    children: [
      makeBlock('Header / 导航', '1:1'),
      makeBlock('Hero Banner 首屏', '1:2'),
      makeBlock('Features 功能区', '1:3'),
    ],
  };
}

/** 最小 DesignContext（字段对齐 vue-version-pipeline 测试夹具） */
function makeContext(root: ProcessedNode): DesignContext {
  return {
    fileKey: 'batch-fixture-key',
    node: root,
    colors: [],
    spacing: [],
    radii: [],
    shadows: [],
    assets: [],
    textNodes: [],
    componentsUsed: [],
  };
}

/** 快照清单：文件名 + 依赖边 + barrel 内容（区块组件内部契约由各单文件管线测试覆盖） */
function manifest(result: BatchGenResult): {
  fileNames: string[];
  edges: BatchGenResult['edges'];
  barrel: string;
} {
  const barrel = result.files.find((file) => file.fileName === result.entryPoint);
  return { fileNames: result.files.map((file) => file.fileName), edges: result.edges, barrel: barrel?.content ?? '' };
}

/** 按文件名取内容 */
function contentOf(result: BatchGenResult, fileName: string): string {
  return result.files.find((file) => file.fileName === fileName)?.content ?? '';
}

beforeEach(() => {
  initI18nSync();
});

describe('TR-20.1 React Tailwind 批量产物', () => {
  it('每区块一个 .tsx + index.ts barrel + barrel 依赖边（快照）', async () => {
    const root = makePageTree();
    const result = await createBatchGenerator(NULL_CLIENT).generate(splitPageIntoBlocks(root), makeContext(root), {
      framework: 'react',
      styleFormat: 'tailwind',
      bundler: 'none',
      skipEnhancements: true,
    });

    expect(result.blocks.map((block) => [block.kind, block.componentName, block.nodeId])).toEqual([
      ['header', 'Header', '1:1'],
      ['hero', 'HeroSection', '1:2'],
      ['features', 'FeaturesSection', '1:3'],
    ]);
    expect(manifest(result)).toMatchSnapshot();

    // barrel 三行 default 再导出，入口固定 index.ts
    expect(result.entryPoint).toBe('index.ts');
    expect(contentOf(result, 'index.ts')).toContain("export { default as Header } from './Header';");
    // 每个主文件含 default export（barrel 可再导出）
    expect(contentOf(result, 'Header.tsx')).toContain('export default Header;');
    expect(contentOf(result, 'HeroSection.tsx')).toContain('export default HeroSection;');
  });

  it('componentNamePrefix 透传到组件名与文件名', async () => {
    const root = makePageTree();
    const result = await createBatchGenerator(NULL_CLIENT).generate(splitPageIntoBlocks(root), makeContext(root), {
      framework: 'react',
      styleFormat: 'tailwind',
      bundler: 'none',
      skipEnhancements: true,
      componentNamePrefix: 'Landing',
    });

    expect(result.files.map((file) => file.fileName)).toEqual(
      expect.arrayContaining(['LandingHeader.tsx', 'LandingHeroSection.tsx', 'LandingFeaturesSection.tsx']),
    );
    expect(contentOf(result, 'index.ts')).toContain("export { default as LandingHeader } from './LandingHeader';");
  });
});

describe('TR-20.1 样式旁路与 Vue 矩阵', () => {
  it('React CSS Modules：追加 .module.css 文件与 sidecar 依赖边，主文件 import styles（快照）', async () => {
    const root = makePageTree();
    const result = await createBatchGenerator(NULL_CLIENT).generate(splitPageIntoBlocks(root), makeContext(root), {
      framework: 'react',
      styleFormat: 'css-modules',
      bundler: 'none',
      skipEnhancements: true,
    });

    // 3 主文件 + 3 旁路 + barrel = 7
    expect(result.files).toHaveLength(7);
    expect(result.files.map((file) => file.fileName)).toEqual(
      expect.arrayContaining(['Header.module.css', 'HeroSection.module.css', 'FeaturesSection.module.css']),
    );
    // sidecar 边：主文件 → 旁路；barrel 只依赖主文件
    const sidecarEdges = result.edges.filter((edge) => edge.kind === 'sidecar');
    expect(sidecarEdges).toHaveLength(3);
    expect(sidecarEdges[0]).toEqual({ from: 'Header.tsx', to: 'Header.module.css', kind: 'sidecar' });
    expect(result.edges.filter((edge) => edge.from === 'index.ts')).toHaveLength(3);
    expect(contentOf(result, 'Header.tsx')).toContain("import styles from './Header.module.css';");
    expect(manifest(result)).toMatchSnapshot();
  });

  it('Vue 3：每区块 .vue 文件，barrel 以 .vue 路径再导出', async () => {
    const root = makePageTree();
    const result = await createBatchGenerator(NULL_CLIENT).generate(splitPageIntoBlocks(root), makeContext(root), {
      framework: 'vue',
      vueVersion: 3,
      styleFormat: 'tailwind',
      bundler: 'none',
      skipEnhancements: true,
    });

    expect(result.vueVersion).toBe(3);
    expect(result.files.map((file) => file.fileName)).toEqual(
      expect.arrayContaining(['Header.vue', 'HeroSection.vue', 'FeaturesSection.vue', 'index.ts']),
    );
    expect(contentOf(result, 'index.ts')).toContain("export { default as Header } from './Header.vue';");
    expect(contentOf(result, 'Header.vue')).toContain('<script setup lang="ts">');
  });
});

describe('WBS-P1-13 Svelte 批量产物', () => {
  it('每区块一个 .svelte（Svelte 4 口径），barrel 以 .svelte 路径再导出 default', async () => {
    const root = makePageTree();
    const result = await createBatchGenerator(NULL_CLIENT).generate(splitPageIntoBlocks(root), makeContext(root), {
      framework: 'svelte',
      styleFormat: 'tailwind',
      bundler: 'none',
      skipEnhancements: true,
    });

    expect(result.framework).toBe('svelte');
    expect(result.files.map((file) => file.fileName)).toEqual(
      expect.arrayContaining(['Header.svelte', 'HeroSection.svelte', 'FeaturesSection.svelte', 'index.ts']),
    );
    // 区块文件 lang 标记为 svelte
    expect(result.files.filter((f) => f.lang === 'svelte')).toHaveLength(3);
    expect(contentOf(result, 'index.ts')).toContain("export { default as Header } from './Header.svelte';");
    expect(contentOf(result, 'Header.svelte')).toContain('<script lang="ts">');
    expect(contentOf(result, 'Header.svelte')).toContain('Svelte 4');
  });

  it('css-modules：样式内联 scoped <style>，不产出额外旁路文件', async () => {
    const root = makePageTree();
    const result = await createBatchGenerator(NULL_CLIENT).generate(splitPageIntoBlocks(root), makeContext(root), {
      framework: 'svelte',
      styleFormat: 'css-modules',
      bundler: 'none',
      skipEnhancements: true,
    });
    // 3 个 .svelte + barrel，无 .module.css 旁路
    expect(result.files).toHaveLength(4);
    expect(result.files.some((f) => f.fileName.endsWith('.module.css'))).toBe(false);
    expect(contentOf(result, 'Header.svelte')).toContain('<style>');
  });

  it('非法样式组合在批量入口同样被拒绝（styled 为 React 专属）', async () => {
    const root = makePageTree();
    await expect(
      createBatchGenerator(NULL_CLIENT).generate(splitPageIntoBlocks(root), makeContext(root), {
        framework: 'svelte',
        styleFormat: 'styled',
        bundler: 'none',
        skipEnhancements: true,
      }),
    ).rejects.toThrow();
  });
});

describe('TR-20.2 两入口一致性与空选择', () => {
  it('整页拆分与显式 nodeIds 在同一区块集合上产物逐文件一致', async () => {
    // 两棵独立但同构的树，避免增强器原地标注造成两次生成互相干扰
    const autoRoot = makePageTree();
    const explicitRoot = structuredClone(autoRoot) as ProcessedNode;

    const generator = createBatchGenerator(NULL_CLIENT);
    const autoResult = await generator.generate(splitPageIntoBlocks(autoRoot), makeContext(autoRoot), {
      framework: 'react',
      styleFormat: 'tailwind',
      bundler: 'none',
      skipEnhancements: true,
    });
    const explicitResult = await generator.generate(
      selectBlocksByIds(explicitRoot, ['1:1', '1:2', '1:3']),
      makeContext(explicitRoot),
      { framework: 'react', styleFormat: 'tailwind', bundler: 'none', skipEnhancements: true },
    );

    expect(explicitResult.blocks.map((block) => block.componentName)).toEqual(
      autoResult.blocks.map((block) => block.componentName),
    );
    expect(explicitResult.edges).toEqual(autoResult.edges);
    const autoByName = new Map(autoResult.files.map((file) => [file.fileName, file.content]));
    for (const file of explicitResult.files) {
      expect(autoByName.get(file.fileName)).toBe(file.content);
    }
  });

  it('空区块列表抛 i18n 空选择错误（中英双键均可渲染且文本不同）', async () => {
    const root = makePageTree();
    const generator = createBatchGenerator(NULL_CLIENT);
    await expect(
      generator.generate([], makeContext(root), { framework: 'react', styleFormat: 'tailwind' }),
    ).rejects.toThrow('批量生成需要至少一个区块');

    const zh = initI18nSync().t('batchGenerate.emptySelection') as string;
    const en = new I18n('en-US').t('batchGenerate.emptySelection') as string;
    expect(zh).not.toBe('batchGenerate.emptySelection');
    expect(en).not.toBe('batchGenerate.emptySelection');
    expect(zh).not.toBe(en);
  });
});
