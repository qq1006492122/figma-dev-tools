/**
 * CSS Modules 端到端管线快照（v1.4.18，T9 / TR-9.1）
 *
 * React/Vue 各一组快照，验证：
 * 1. 产物含同名 .module.css 旁路文件（fileName 与组件同名），主组件按
 *    React `styles['local-name']` / Vue `$style['local-name']` 引用；
 * 2. 非标像素值直接落原生 CSS（width: 321px），无 Tailwind arbitrary 语法；
 * 3. 同签名节点共享同一本地类（零重复输出）；严格超集经 composes 复用；
 * 4. React 自动 import 同名模块文件；Vue 输出 <style module src="./X.module.css">。
 *
 * legacy React 管线（figma_generate_component）的 css-modules 占位行为由既有快照保证（TR-9.2）。
 */
import { describe, expect, it } from 'vitest';

import { createCodeGenerator } from '../../src/services/code-generator.js';
import { createVueGenerator } from '../../src/services/vue-generator.js';
import type { FigmaClient } from '../../src/services/figma-client.js';
import type { DesignContext, ProcessedNode } from '../../src/types/nodes.js';

/** #rrggbb → FigmaColor（测试夹具用） */
function hexToFigmaColor(hex: string): { r: number; g: number; b: number; a: number } {
  const n = Number.parseInt(hex.slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: 1 };
}

/** 水平居中按钮的公共布局（HORIZONTAL/居中/8-16 padding） */
function buttonLayout(sizing: 'AUTO' | 'FIXED'): ProcessedNode['layout'] {
  return {
    mode: 'HORIZONTAL',
    primaryAxisAlign: 'CENTER',
    counterAxisAlign: 'CENTER',
    primaryAxisSizing: sizing,
    counterAxisSizing: sizing,
    layoutWrap: 'NO_WRAP',
    itemSpacing: 0,
    counterAxisSpacing: 0,
    padding: { top: 8, right: 16, bottom: 8, left: 16 },
  };
}

/**
 * 操作卡片树：
 * - 根 action-card：纵向 flex 居中/13px 间距/16px padding/321×160；
 * - title：14px/600 文本（覆盖文本 color/font-* 声明路径）；
 * - button-base → button-primary：严格超集（composes 复用）；
 * - cancel-button → confirm-button：同签名共享同一类。
 */
function makeActionCardTree(): ProcessedNode {
  const title: ProcessedNode = {
    id: 'node-title',
    figmaId: '21:2',
    name: 'title',
    originalType: 'TEXT',
    role: 'text',
    visible: true,
    clipsContent: false,
    size: { width: 200, height: 24 },
    textContent: 'Card Title',
    fills: [{ type: 'solid', color: hexToFigmaColor('#1a1a1a') }],
    textStyle: { fontFamily: 'Inter', fontWeight: 600, fontSize: 14, lineHeightPx: 20, textAlignHorizontal: 'LEFT' },
    children: [],
  };

  // 基类按钮：AUTO 宽度（不产出 width），高度与超集一致
  const buttonBase: ProcessedNode = {
    id: 'node-base',
    figmaId: '21:3',
    name: 'button-base',
    originalType: 'FRAME',
    role: 'container',
    visible: true,
    clipsContent: false,
    size: { width: 88, height: 40 },
    layout: buttonLayout('AUTO'),
    children: [],
  };

  // 超集按钮：同布局 + 显式宽度 + 圆角 + 主色背景
  const buttonPrimary: ProcessedNode = {
    id: 'node-primary',
    figmaId: '21:4',
    name: 'button-primary',
    originalType: 'FRAME',
    role: 'container',
    visible: true,
    clipsContent: false,
    size: { width: 88, height: 40 },
    layout: buttonLayout('FIXED'),
    cornerRadius: { topLeft: 6, topRight: 6, bottomRight: 6, bottomLeft: 6, uniform: true },
    fills: [{ type: 'solid', color: hexToFigmaColor('#1677ff') }],
    children: [],
  };

  // 两个完全同签名按钮 → 共享 cancel-button 类
  const makeIdenticalButton = (figmaId: string, idSuffix: string): ProcessedNode => ({
    id: `node-${idSuffix}`,
    figmaId,
    name: 'cancel-button',
    originalType: 'FRAME',
    role: 'container',
    visible: true,
    clipsContent: false,
    size: { width: 96, height: 40 },
    layout: buttonLayout('FIXED'),
    cornerRadius: { topLeft: 6, topRight: 6, bottomRight: 6, bottomLeft: 6, uniform: true },
    fills: [{ type: 'solid', color: hexToFigmaColor('#f5f5f5') }],
    children: [],
  });

  return {
    id: 'node-card',
    figmaId: '21:1',
    name: 'action-card',
    originalType: 'FRAME',
    role: 'container',
    visible: true,
    clipsContent: false,
    size: { width: 321, height: 220 },
    layout: {
      mode: 'VERTICAL',
      primaryAxisAlign: 'MIN',
      counterAxisAlign: 'CENTER',
      primaryAxisSizing: 'FIXED',
      counterAxisSizing: 'FIXED',
      layoutWrap: 'NO_WRAP',
      itemSpacing: 13,
      counterAxisSpacing: 0,
      padding: { top: 16, right: 16, bottom: 16, left: 16 },
    },
    children: [title, buttonBase, buttonPrimary, makeIdenticalButton('21:5', 'cancel1'), makeIdenticalButton('21:6', 'cancel2')],
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
    assets: [],
    textNodes: [],
    componentsUsed: [],
  };
}

/** 生成器仅在 SVG 内联渲染分支使用 client，本夹具无矢量/位图节点，不会触达 */
const NULL_CLIENT = null as unknown as FigmaClient;

describe('T9 / TR-9.1 React CSS Modules 管线快照', () => {
  it('styles.x 引用 + 同名模块 import + 旁路文件，快照', async () => {
    const generator = createCodeGenerator(NULL_CLIENT);
    const result = await generator.generateJsxFromContext(makeContext(makeActionCardTree()), {
      componentName: 'ActionCard',
      styleFormat: 'css-modules',
      bundler: 'none',
      skipEnhancements: true,
    });

    expect(result.code).toMatchSnapshot();

    // 同名模块 import；kebab 本地名以方括号成员访问；根节点 cn() 合并外部 className
    expect(result.code).toContain("import styles from './ActionCard.module.css';");
    expect(result.code).toContain("className={cn(styles['action-card'], className)}");
    expect(result.code).toContain("className={styles['title']}");
    // 无 Tailwind arbitrary 语法、无原子工具类残留
    expect(result.code).not.toContain('-[');
    expect(result.code).not.toContain('flex flex-col');

    // 旁路文件：同名 + 原生声明
    expect(result.styleSidecar).toBeDefined();
    expect(result.styleSidecar?.fileName).toBe('ActionCard.module.css');
    const css = result.styleSidecar?.content ?? '';
    expect(css).toContain('.action-card {');
    expect(css).toContain('display: flex;');
    expect(css).toContain('gap: 13px;');
    expect(css).toContain('width: 321px;');
    expect(css).toContain('.title {');
    expect(css).toContain('font-size: 14px;');
    expect(css).toContain('color: #1a1a1a;');
  });

  it('同签名共享类、严格超集 composes 复用，且无重复声明块', async () => {
    const generator = createCodeGenerator(NULL_CLIENT);
    const result = await generator.generateJsxFromContext(makeContext(makeActionCardTree()), {
      componentName: 'ActionCard',
      styleFormat: 'css-modules',
      bundler: 'none',
      skipEnhancements: true,
    });
    const css = result.styleSidecar?.content ?? '';

    // 两个同签名按钮在组件代码中引用同一个本地类
    const refCount = result.code.split("styles['cancel-button']").length - 1;
    expect(refCount).toBe(2);
    // 旁路文件里 cancel-button 类块只出现一次
    expect(css.match(/^\.cancel-button \{/gm)?.length ?? 0).toBe(1);

    // 超集按钮 composes 基类，增量块不重复 display/padding
    expect(css).toContain('composes: button-base;');
    const primaryBlock = css.split('.button-primary {')[1]?.split('}')[0] ?? '';
    expect(primaryBlock).toContain('background-color: #1677ff;');
    expect(primaryBlock).toContain('border-radius: 6px;');
    expect(primaryBlock).not.toContain('display:');
    expect(primaryBlock).not.toContain('padding:');
  });
});

describe('T9 / TR-9.1 Vue CSS Modules 管线快照', () => {
  it('$style.x 引用 + <style module src> 外置旁路，快照', async () => {
    const generator = createVueGenerator(NULL_CLIENT);
    const result = await generator.generateFromContext(makeContext(makeActionCardTree()), {
      componentName: 'ActionCard',
      styleFormat: 'css-modules',
      bundler: 'none',
      skipEnhancements: true,
    });

    expect(result.code).toMatchSnapshot();

    // SFC 外置 style module；模板以 $style['local-name'] 动态绑定（根标签为语义标签 section）
    expect(result.code).toContain('<style module src="./ActionCard.module.css"></style>');
    expect(result.code).toContain(":class=\"$style['action-card']\"");
    expect(result.code).toContain('Card Title');
    // 不出现 scoped 占位块与原子类
    expect(result.code).not.toContain('<style scoped>');
    expect(result.code).not.toContain('flex flex-col');

    // 同名旁路文件内容与 React 一致（同渲染器）
    expect(result.styleSidecar?.fileName).toBe('ActionCard.module.css');
    const css = result.styleSidecar?.content ?? '';
    expect(css).toContain('.action-card {');
    expect(css).toContain('gap: 13px;');
    expect(css).toContain('composes: button-base;');
  });
});
