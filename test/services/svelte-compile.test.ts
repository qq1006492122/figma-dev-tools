/**
 * WBS-P1-14 验收：生成的 .svelte 产物必须能被真实 svelte/compiler（v4）编译。
 *
 * - 三套样式组合（tailwind / unocss[wind+attributify] / css-modules）各编译一次；
 * - TS 版本（<script lang="ts">）先用 typescript 转译脚本块，再交 svelte 编译；
 * - examples/svelte-demo/src 下的所有 SFC 同样必须通过编译（QA npm run dev 的机内前置）。
 */
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, preprocess } from 'svelte/compiler';
import * as ts from 'typescript';
import { SvelteGenerator } from '../../src/services/svelte-generator.js';
import type { DesignContext, ProcessedNode } from '../../src/types/nodes.js';

const mockFigmaClient = {
  getFile: vi.fn(),
  getNode: vi.fn(),
  getImage: vi.fn(),
  getSvg: vi.fn(),
  getImages: vi.fn(),
  downloadImage: vi.fn(),
} as any;

/** TS 脚本块预处理（对齐 @sveltejs/vite-plugin-svelte 在 dev/build 时的处理口径） */
const tsPreprocessor = {
  script: ({ content, attributes }: { content: string; attributes: Record<string, unknown> }) => {
    if (attributes.lang !== 'ts') return { code: content };
    return {
      code: ts.transpileModule(content, {
        compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
      }).outputText,
    };
  },
};

/** 预处理（TS）+ 编译，返回编译产物；语法错误直接抛 */
async function compileSvelte(source: string, filename: string) {
  const processed = await preprocess(source, tsPreprocessor, { filename });
  return compile(processed.code, {
    filename,
    generate: 'dom',
    // 原子类未安装 tailwind 时不在编译门禁范围；这里只验证 SFC 语法合法性
    css: 'injected',
  });
}

function richTree(): ProcessedNode {
  const row = (id: string, label: string, stock: boolean): ProcessedNode =>
    ({
      id,
      figmaId: id,
      name: 'Goods Row',
      originalType: 'FRAME',
      role: 'container',
      visible: true,
      clipsContent: false,
      size: { width: 320, height: 80 },
      children: [
        {
          id: `${id}-name`,
          figmaId: `${id}-name`,
          name: 'Goods Name',
          originalType: 'TEXT',
          role: 'text',
          visible: true,
          textContent: label,
          clipsContent: false,
          size: { width: 200, height: 24 },
          children: [],
        } as ProcessedNode,
        {
          id: `${id}-tag`,
          figmaId: `${id}-tag`,
          name: stock ? 'Ok Badge' : 'Empty Badge',
          originalType: 'FRAME',
          role: 'container',
          visible: true,
          clipsContent: false,
          size: { width: 48, height: 24 },
          children: [],
        },
      ],
    }) as ProcessedNode;
  return {
    id: 'root',
    figmaId: '1:1',
    name: 'Shop Panel',
    originalType: 'FRAME',
    role: 'container',
    visible: true,
    clipsContent: false,
    size: { width: 360, height: 600 },
    children: [
      {
        id: 'search',
        figmaId: 'search',
        name: 'Search Input',
        role: 'input',
        originalType: 'FRAME',
        visible: true,
        clipsContent: false,
        size: { width: 320, height: 40 },
        children: [],
      } as ProcessedNode,
      {
        id: 'submit',
        figmaId: 'submit',
        name: 'Search Button',
        role: 'button',
        originalType: 'FRAME',
        visible: true,
        clipsContent: false,
        size: { width: 80, height: 36 },
        children: [
          {
            id: 'submit-label',
            figmaId: 'submit-label',
            name: 'Label',
            originalType: 'TEXT',
            role: 'text',
            visible: true,
            textContent: '搜索',
            clipsContent: false,
            size: { width: 40, height: 20 },
            children: [],
          } as ProcessedNode,
        ],
      } as ProcessedNode,
      row('r1', '台灯', true),
      row('r2', '耳机', true),
      row('r3', '保温杯', true),
    ],
  } as ProcessedNode;
}

function ctx(node: ProcessedNode): DesignContext {
  return {
    fileKey: 'f',
    nodeId: '1:1',
    node,
    componentsUsed: [],
    styles: [],
    warnings: [],
    metadata: { name: node.name ?? 'Demo', lastModified: '' },
  };
}

describe('WBS-P1-14 生成产物经 svelte/compiler v4 编译', () => {
  const gen = new SvelteGenerator(mockFigmaClient);

  it('tailwind 组合（默认 TS + each + on: 事件）编译通过', async () => {
    const r = await gen.generateFromContext(ctx(richTree()), {
      componentName: 'ShopTailwind',
      styleFormat: 'tailwind',
    });
    expect(r.code).toContain('{#each');
    const out = await compileSvelte(r.code, 'ShopTailwind.svelte');
    expect(out.js.code).toContain('ShopTailwind');
    expect(out.warnings.filter((w) => w.code?.startsWith('parse-error')).length).toBe(0);
  });

  it('unocss wind 组合编译通过', async () => {
    const r = await gen.generateFromContext(ctx(richTree()), {
      componentName: 'ShopUno',
      styleFormat: 'unocss',
      unocssMode: 'wind',
    });
    const out = await compileSvelte(r.code, 'ShopUno.svelte');
    expect(out.js.code).toBeTruthy();
  });

  it('unocss attributify（无值属性）组合编译通过', async () => {
    const r = await gen.generateFromContext(ctx(richTree()), {
      componentName: 'ShopUnoAttr',
      styleFormat: 'unocss',
      unocssMode: 'attributify',
    });
    expect(r.code).toMatch(/[a-z-]+=""/);
    const out = await compileSvelte(r.code, 'ShopUnoAttr.svelte');
    expect(out.warnings.filter((w) => w.code?.startsWith('parse-error')).length).toBe(0);
  });

  it('css-modules 组合：内联 scoped <style> 编译通过且产出 scoped CSS', async () => {
    const r = await gen.generateFromContext(ctx(richTree()), {
      componentName: 'ShopModule',
      styleFormat: 'css-modules',
    });
    const out = await compileSvelte(r.code, 'ShopModule.svelte');
    // svelte 给选择器加 svelte-hash 作用域属性
    expect(out.css?.code).toMatch(/svelte-[a-z0-9]+/);
    expect(r.code).not.toContain('composes:');
  });

  it('非 TS（--no-ts）纯 JS 产物编译通过', async () => {
    const r = await gen.generateFromContext(ctx(richTree()), {
      componentName: 'ShopJs',
      styleFormat: 'tailwind',
      typescript: false,
    });
    expect(r.code).toContain('<script>');
    const out = await compileSvelte(r.code, 'ShopJs.svelte');
    expect(out.warnings.filter((w) => w.code?.startsWith('parse-error')).length).toBe(0);
  });

  it('显式 {#if}/{:else if}/{:else} 链与 hidden 属性产物均可编译', async () => {
    const node: ProcessedNode = {
      ...richTree(),
      children: [
        {
          id: 'pa',
          figmaId: 'pa',
          name: 'Tab A Panel',
          originalType: 'FRAME',
          role: 'container',
          visible: true,
          clipsContent: false,
          size: { width: 300, height: 80 },
          children: [],
        } as ProcessedNode,
        {
          id: 'pb',
          figmaId: 'pb',
          name: 'Tab B Panel',
          originalType: 'FRAME',
          role: 'container',
          visible: true,
          clipsContent: false,
          size: { width: 300, height: 80 },
          children: [],
        } as ProcessedNode,
        {
          id: 'tip',
          figmaId: 'tip',
          name: 'Tooltip Bubble',
          originalType: 'FRAME',
          role: 'container',
          visible: true,
          clipsContent: false,
          size: { width: 120, height: 40 },
          children: [],
        } as ProcessedNode,
      ],
    } as ProcessedNode;
    const r = await gen.generateFromContext(ctx(node), {
      componentName: 'CondShop',
      styleFormat: 'tailwind',
      conditions: [
        { nodeId: 'pa', groupId: 'g1', expression: 'tab === "a"' },
        { nodeId: 'pb', groupId: 'g1', isElse: true },
        { nodeId: 'tip', expression: 'showTip', directive: 'hidden' },
      ],
    });
    expect(r.code).toContain('{:else}'); // 两成员链：if + else
    expect(r.code).not.toContain('{:else if}');
    const out = await compileSvelte(r.code, 'CondShop.svelte');
    expect(out.warnings.filter((w) => w.code?.startsWith('parse-error')).length).toBe(0);
  });
});

describe('WBS-P1-14 examples/svelte-demo 工程 SFC 编译', () => {
  const demoDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'examples',
    'svelte-demo',
    'src',
  );

  function collectSvelte(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...collectSvelte(full));
      else if (entry.name.endsWith('.svelte')) out.push(full);
    }
    return out;
  }

  it('demo 工程内每个 .svelte 均可编译（npm run dev 的机内前置）', async () => {
    const files = collectSvelte(demoDir);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      const out = await compileSvelte(source, file);
      expect(out.warnings.filter((w) => w.code?.startsWith('parse-error')).length).toBe(0);
    }
  });
});
