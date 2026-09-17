/**
 * v1.4.19 T20 页面区块拆分（TR-20.1 / TR-20.2 的拆分阶段）
 *
 * - 六类区块（header/hero/features/section/sticky/footer）关键词与位置兜底识别；
 * - 组件名 PascalCase 稳定分配、重名去重；
 * - 游离 TEXT/不可见节点不拆；无子区块时根节点整体兜底；
 * - selectBlocksByIds 按树位置归一化顺序，与整页拆分可对齐（TR-20.2）。
 */
import { describe, expect, it } from 'vitest';

import { selectBlocksByIds, splitPageIntoBlocks, type PageBlock } from '../../src/services/block-splitter.js';
import type { ProcessedNode } from '../../src/types/nodes.js';

let idSeq = 0;

/**
 * 构造区块容器节点
 *
 * @param name - 节点名（可带中英关键词）
 * @param options - 位置/尺寸/类型/可见性
 * @returns ProcessedNode 容器（含一个文本叶子）
 */
function makeContainer(
  name: string,
  options: {
    y?: number;
    height?: number;
    originalType?: ProcessedNode['originalType'];
    visible?: boolean;
    figmaId?: string;
  } = {},
): ProcessedNode {
  idSeq += 1;
  return {
    id: `n-${idSeq}`,
    figmaId: options.figmaId ?? `10:${idSeq}`,
    name,
    originalType: options.originalType ?? 'FRAME',
    role: 'container',
    visible: options.visible ?? true,
    clipsContent: false,
    size: { width: 1440, height: options.height ?? 320 },
    position: { x: 0, y: options.y ?? 0 },
    children: [
      {
        id: `n-${idSeq}-t`,
        figmaId: `11:${idSeq}`,
        name: `${name}-label`,
        originalType: 'TEXT',
        role: 'text',
        visible: true,
        clipsContent: false,
        size: { width: 80, height: 20 },
        textContent: name,
        children: [],
      },
    ],
  };
}

/**
 * 构造页面根
 *
 * @param children - 顶层子节点
 * @param height - 页面高度（几何兜底用）
 */
function makePage(children: ProcessedNode[], height = 2000): ProcessedNode {
  return {
    id: 'page',
    figmaId: '1:0',
    name: 'Landing Page',
    originalType: 'FRAME',
    role: 'container',
    visible: true,
    clipsContent: false,
    size: { width: 1440, height },
    children,
  };
}

/** 提取拆分结果的 [kind, componentName] 摘要 */
function summary(blocks: PageBlock[]): Array<[PageBlock['kind'], string]> {
  return blocks.map((block) => [block.kind, block.componentName]);
}

describe('TR-20.1 区块关键词识别与命名', () => {
  it('六类区块按关键词识别，组件名稳定且保持自上而下顺序', () => {
    const page = makePage([
      makeContainer('Header / 顶部导航'),
      makeContainer('Hero Banner 首屏主视觉'),
      makeContainer('Features 功能特性区'),
      makeContainer('Sticky 吸顶工具条'),
      makeContainer('About Us'),
      makeContainer('Footer 页脚版权'),
    ]);

    expect(summary(splitPageIntoBlocks(page))).toEqual([
      ['header', 'Header'],
      ['hero', 'HeroSection'],
      ['features', 'FeaturesSection'],
      ['sticky', 'StickyBar'],
      ['section', 'AboutUs'],
      ['footer', 'Footer'],
    ]);
  });

  it('sticky 优先于 header（"Sticky Header" 归 sticky），重名类型追加序号', () => {
    const page = makePage(
      [
        makeContainer('Sticky Header 吸顶导航'),
        makeContainer('导航栏 Navbar'),
        makeContainer('页脚 A'),
        makeContainer('Footer B'),
      ],
      1200,
    );

    expect(summary(splitPageIntoBlocks(page))).toEqual([
      ['sticky', 'StickyBar'],
      ['header', 'Header'],
      ['footer', 'Footer'],
      ['footer', 'Footer2'],
    ]);
  });

  it('无关键词时按几何位置兜底：贴顶 header、贴底 footer、其余 Section 序号', () => {
    const page = makePage(
      [
        makeContainer('顶部容器', { y: 0, height: 80 }),
        makeContainer('内容容器甲', { y: 200, height: 400 }),
        makeContainer('内容容器乙', { y: 700, height: 400 }),
        makeContainer('底部容器', { y: 1900, height: 100 }),
      ],
      2000,
    );

    expect(summary(splitPageIntoBlocks(page))).toEqual([
      ['header', 'Header'],
      ['section', 'Section1'],
      ['section', 'Section2'],
      ['footer', 'Footer'],
    ]);
  });

  it('游离 TEXT 叶子与不可见节点不拆；全部不可拆时根节点整体兜底为单 section', () => {
    const textLeaf: ProcessedNode = {
      id: 'leaf',
      figmaId: '20:1',
      name: '游离标题',
      originalType: 'TEXT',
      role: 'text',
      visible: true,
      clipsContent: false,
      size: { width: 100, height: 24 },
      children: [],
    };
    const hiddenHeader = makeContainer('Header', { visible: false, figmaId: '20:2' });
    const visibleHeader = makeContainer('Header', { figmaId: '20:3' });
    const page = makePage([textLeaf, hiddenHeader, visibleHeader]);

    const blocks = splitPageIntoBlocks(page);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.componentName).toBe('Header');
    expect(blocks[0]?.node.figmaId).toBe('20:3');

    const barePage = makePage([]);
    const fallback = splitPageIntoBlocks(barePage);
    expect(fallback).toHaveLength(1);
    expect(fallback[0]?.kind).toBe('section');
    expect(fallback[0]?.componentName).toBe('LandingPage');
  });
});

describe('TR-20.2 显式多选与整页拆分的一致性', () => {
  it('selectBlocksByIds 按树位置（而非入参顺序）返回区块', () => {
    const first = makeContainer('Header', { figmaId: '30:1' });
    const mid = makeContainer('Features 功能区', { figmaId: '30:2' });
    const last = makeContainer('Footer', { figmaId: '30:3' });
    const page = makePage([first, mid, last]);

    // 故意乱序传入
    const picked = selectBlocksByIds(page, ['30:3', '30:1']);
    expect(picked.map((block) => block.node.figmaId)).toEqual(['30:1', '30:3']);
    expect(summary(picked)).toEqual([
      ['header', 'Header'],
      ['footer', 'Footer'],
    ]);
  });

  it('支持嵌套节点 ID；空列表与全部未命中返回空数组（调用方给空选择错误）', () => {
    const nested: ProcessedNode = {
      ...makeContainer('Hero Banner', { figmaId: '40:1' }),
      children: [
        {
          id: 'nested-child',
          figmaId: '40:9',
          name: 'Nested Card',
          originalType: 'FRAME',
          role: 'container',
          visible: true,
          clipsContent: false,
          size: { width: 200, height: 120 },
          children: [],
        },
      ],
    };
    const page = makePage([nested]);

    const deep = selectBlocksByIds(page, ['40:9']);
    expect(deep).toHaveLength(1);
    expect(deep[0]?.node.figmaId).toBe('40:9');
    expect(selectBlocksByIds(page, [])).toEqual([]);
    expect(selectBlocksByIds(page, ['99:99'])).toEqual([]);
  });

  it('整页拆分的区块节点 ID 集合经显式多选取回时，节点逐个相同', () => {
    const page = makePage([
      makeContainer('Header', { figmaId: '50:1' }),
      makeContainer('Hero Banner', { figmaId: '50:2' }),
      makeContainer('Footer', { figmaId: '50:3' }),
    ]);
    const autoBlocks = splitPageIntoBlocks(page);
    const explicitBlocks = selectBlocksByIds(
      page,
      autoBlocks.map((block) => block.node.figmaId),
    );

    expect(explicitBlocks.map((block) => block.componentName)).toEqual(
      autoBlocks.map((block) => block.componentName),
    );
    expect(explicitBlocks.map((block) => block.kind)).toEqual(autoBlocks.map((block) => block.kind));
    expect(explicitBlocks.map((block) => block.node)).toEqual(autoBlocks.map((block) => block.node));
  });
});
