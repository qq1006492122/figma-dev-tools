/**
 * v1.4.19 T14–T17 新样式渲染器单元测试（渲染器层）
 *
 * 覆盖：
 * - T14 StyledComponentsRenderer：styled 组件标识符、根命名、签名复用、buildPreamble 聚合；
 * - T15 EmotionRenderer：css prop（extraProps）、对象样式常量、根命名与 import；
 * - T17 VanillaExtractRenderer：css-module 绑定、.css.ts 旁路（lang=ts + 命名空间 reactImport）；
 * - T17 PandaRenderer：classNameIsExpression 表达式绑定、cva hints；
 * - T16 PreprocessorRenderer（less/sass）：旁路语言/扩展名、变量提取、mixin 提取、嵌套归属；
 * - createStyleRenderer 工厂 6 方案实例化；
 * - 渐变/图片填充人工复核警告。
 *
 * React/Vue 生成器端到端快照见 new-pipeline-matrix.test.ts。
 */
import { describe, expect, it } from 'vitest';

import { StyledComponentsRenderer } from '../../src/services/style-renderers/styled-components-renderer.js';
import { EmotionRenderer } from '../../src/services/style-renderers/emotion-renderer.js';
import { VanillaExtractRenderer } from '../../src/services/style-renderers/vanilla-extract-renderer.js';
import { PandaRenderer } from '../../src/services/style-renderers/panda-renderer.js';
import { PreprocessorRenderer } from '../../src/services/style-renderers/preprocessor-renderer.js';
import { createStyleRenderer } from '../../src/services/style-renderers/factory.js';
import type { ProcessedNode } from '../../src/types/nodes.js';

/** #rrggbb → FigmaColor（测试夹具用） */
function hexToFigmaColor(hex: string): { r: number; g: number; b: number; a: number } {
  const n = Number.parseInt(hex.slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: 1 };
}

/** 构造带稳定声明集合的容器节点（flex/内边距/尺寸/底色） */
function makeStyledNode(name: string, hexColor = '#f5f5f5', overrides: Partial<ProcessedNode> = {}): ProcessedNode {
  return {
    id: `node-${name}`,
    figmaId: `30:${name.length}`,
    name,
    originalType: 'FRAME',
    role: 'container',
    visible: true,
    clipsContent: false,
    size: { width: 88, height: 40 },
    layout: {
      mode: 'HORIZONTAL',
      primaryAxisAlign: 'CENTER',
      counterAxisAlign: 'CENTER',
      primaryAxisSizing: 'FIXED',
      counterAxisSizing: 'FIXED',
      layoutWrap: 'NO_WRAP',
      itemSpacing: 0,
      counterAxisSpacing: 0,
      padding: { top: 8, right: 16, bottom: 8, left: 16 },
    },
    cornerRadius: { topLeft: 6, topRight: 6, bottomRight: 6, bottomLeft: 6, uniform: true },
    fills: [{ type: 'solid', color: hexToFigmaColor(hexColor) }],
    children: [],
    ...overrides,
  };
}

/** 文本节点（color 声明路径） */
function makeTextNode(name: string, hexColor: string): ProcessedNode {
  return {
    id: `node-${name}`,
    figmaId: `40:${name.length}`,
    name,
    originalType: 'TEXT',
    role: 'text',
    visible: true,
    clipsContent: false,
    size: { width: 120, height: 20 },
    textContent: name,
    fills: [{ type: 'solid', color: hexToFigmaColor(hexColor) }],
    textStyle: { fontFamily: 'Inter', fontWeight: 500, fontSize: 14, lineHeightPx: 20, textAlignHorizontal: 'LEFT' },
    children: [],
  };
}

/** 无任何可映射声明的裸分组 */
function makeEmptyNode(name: string): ProcessedNode {
  return {
    id: `node-${name}`,
    figmaId: `50:${name.length}`,
    name,
    originalType: 'GROUP',
    role: 'container',
    visible: true,
    clipsContent: false,
    children: [],
  };
}

describe('T14 StyledComponentsRenderer', () => {
  it('renderNode 以 elementIdentifier 返回 PascalCase 样式组件，且不输出静态 className', () => {
    const renderer = new StyledComponentsRenderer();
    const result = renderer.renderNode(makeStyledNode('primary-button'));
    expect(result.elementIdentifier).toBe('PrimaryButton');
    expect(result.className).toBe('');
  });

  it('根节点（isRoot + componentName）命名为 ${componentName}Root', () => {
    const renderer = new StyledComponentsRenderer();
    const result = renderer.renderNode(makeStyledNode('anything'), { componentName: 'HeroCard', isRoot: true });
    expect(result.elementIdentifier).toBe('HeroCardRoot');
  });

  it('同签名节点复用同一 styled 组件标识符', () => {
    const renderer = new StyledComponentsRenderer();
    const a = renderer.renderNode(makeStyledNode('btn-a'));
    const b = renderer.renderNode(makeStyledNode('btn-b'));
    expect(a.elementIdentifier).toBe(b.elementIdentifier);
    expect(a.elementIdentifier).toBe('BtnA');
  });

  it('无声明节点不注册样式组件（elementIdentifier 缺省）', () => {
    const renderer = new StyledComponentsRenderer();
    const result = renderer.renderNode(makeEmptyNode('group'));
    expect(result.elementIdentifier).toBeUndefined();
    expect(renderer.buildPreamble()).toBeUndefined();
  });

  it('buildPreamble 聚合 styled.<tag> 模板字符串与 import，hints 含 ThemeProvider/transient props', () => {
    const renderer = new StyledComponentsRenderer();
    // 使用无语义标签关键词的节点名（card→section、button→button 等均有关键词映射），回退 div
    renderer.renderNode(makeStyledNode('plain-wrapper'));
    const preamble = renderer.buildPreamble();
    expect(preamble).toBeDefined();
    expect(preamble?.imports).toEqual(["import styled from 'styled-components';"]);
    expect(preamble?.code).toContain('const PlainWrapper = styled.div`');
    expect(preamble?.code).toContain('  display: flex;');
    expect(preamble?.code).toContain('  background-color: #f5f5f5;');
    expect(preamble?.code).toContain('`;');
    const hintTitles = renderer.hints.map((hint) => hint.title);
    expect(hintTitles).toContain('theme.ts (example)');
    expect(hintTitles).toContain('transient-props (guidance)');
  });
});

describe('T15 EmotionRenderer', () => {
  it('renderNode 返回 css={cssX} 属性片段，根节点命名 css${Component}Root', () => {
    const renderer = new EmotionRenderer();
    const leaf = renderer.renderNode(makeTextNode('label', '#1a1a1a'));
    expect(leaf.className).toBe('');
    expect(leaf.extraProps).toEqual(['css={cssLabel}']);

    const root = renderer.renderNode(makeStyledNode('card'), { componentName: 'HeroCard', isRoot: true });
    expect(root.extraProps).toEqual(['css={cssHeroCardRoot}']);
  });

  it('同签名节点共享同一 css 常量', () => {
    const renderer = new EmotionRenderer();
    const a = renderer.renderNode(makeStyledNode('btn-a'));
    const b = renderer.renderNode(makeStyledNode('btn-b'));
    expect(a.extraProps).toEqual(b.extraProps);
  });

  it('buildPreamble 输出 camelCase 对象样式常量与 @emotion/react import', () => {
    const renderer = new EmotionRenderer();
    renderer.renderNode(makeStyledNode('primary-button', '#1677ff'));
    const preamble = renderer.buildPreamble();
    expect(preamble?.imports).toEqual(["import { css } from '@emotion/react';"]);
    expect(preamble?.code).toContain('const cssPrimaryButton = css({');
    expect(preamble?.code).toContain("  display: 'flex',");
    expect(preamble?.code).toContain("  backgroundColor: '#1677ff',");
    expect(preamble?.code).toContain('});');
    // 对象样式中不得残留 kebab-case 键
    expect(preamble?.code).not.toContain('background-color');
    // hints 必须解释 jsxImportSource
    expect(renderer.hints[0]?.code).toContain('jsxImportSource');
  });
});

describe('T17 VanillaExtractRenderer', () => {
  it('classBinding 为 css-module；renderNode 返回 camelCase 导出名', () => {
    const renderer = new VanillaExtractRenderer();
    expect(renderer.classBinding).toBe('css-module');
    const result = renderer.renderNode(makeStyledNode('primary-button'));
    expect(result.className).toBe('primaryButton');
  });

  it('根节点导出名 camelCase Root 后缀', () => {
    const renderer = new VanillaExtractRenderer();
    const result = renderer.renderNode(makeStyledNode('card'), { componentName: 'HeroCard', isRoot: true });
    expect(result.className).toBe('heroCardRoot');
  });

  it('buildSidecar 产出 .css.ts（lang=ts）、style() 导出与命名空间 reactImport', () => {
    const renderer = new VanillaExtractRenderer();
    renderer.renderNode(makeStyledNode('primary-button', '#1677ff'));
    const sidecar = renderer.buildSidecar('ActionCard');
    expect(sidecar).toBeDefined();
    expect(sidecar?.fileName).toBe('ActionCard.css.ts');
    expect(sidecar?.lang).toBe('ts');
    expect(sidecar?.reactImport).toBe("import * as styles from './ActionCard.css';");
    expect(sidecar?.content).toContain("import { style } from '@vanilla-extract/css';");
    expect(sidecar?.content).toContain('export const primaryButton = style({');
    expect(sidecar?.content).toContain("  backgroundColor: '#1677ff',");
  });

  it('无注册条目时 buildSidecar 返回 undefined', () => {
    const renderer = new VanillaExtractRenderer();
    renderer.renderNode(makeEmptyNode('group'));
    expect(renderer.buildSidecar('Empty')).toBeUndefined();
  });
});

describe('T17 PandaRenderer', () => {
  it('renderNode 返回 camelCase 常量并标记 classNameIsExpression', () => {
    const renderer = new PandaRenderer();
    const leaf = renderer.renderNode(makeStyledNode('primary-button'));
    expect(leaf.className).toBe('primaryButton');
    expect(leaf.classNameIsExpression).toBe(true);

    // 根节点使用与叶子不同的声明签名，避免命中签名复用
    const root = renderer.renderNode(makeStyledNode('hero-card', '#1677ff'), {
      componentName: 'HeroCard',
      isRoot: true,
    });
    expect(root.className).toBe('heroCardRoot');
  });

  it('buildPreamble 输出 css({}) 常量与 @/styled-system/css import；hints 含 cva', () => {
    const renderer = new PandaRenderer();
    renderer.renderNode(makeStyledNode('primary-button', '#1677ff'));
    const preamble = renderer.buildPreamble();
    expect(preamble?.imports).toEqual(["import { css } from '@/styled-system/css';"]);
    expect(preamble?.code).toContain('const primaryButton = css({');
    expect(preamble?.code).toContain("  backgroundColor: '#1677ff',");
    expect(renderer.hints.some((hint) => hint.code.includes('cva'))).toBe(true);
  });
});

describe('T16 PreprocessorRenderer（less / sass 方言同构）', () => {
  /**
   * 构造两个签名不同但共享 background-color+padding 子集的类，
   * 外加一个同色文本节点（color 与 background-color 同值，满足变量提升 ≥2 键）。
   */
  function renderSharedSubsetTree(renderer: PreprocessorRenderer): void {
    renderer.renderNode(makeTextNode('caption', '#1677ff'));
    renderer.renderNode(
      makeStyledNode('panel-a', '#1677ff', {
        size: { width: 120, height: 40 },
        cornerRadius: undefined,
        layout: {
          mode: 'HORIZONTAL',
          primaryAxisAlign: 'MIN',
          counterAxisAlign: 'MIN',
          primaryAxisSizing: 'FIXED',
          counterAxisSizing: 'FIXED',
          layoutWrap: 'NO_WRAP',
          itemSpacing: 0,
          counterAxisSpacing: 0,
          padding: { top: 8, right: 16, bottom: 8, left: 16 },
        },
      }),
    );
    renderer.renderNode(
      makeStyledNode('panel-b', '#1677ff', {
        size: { width: 200, height: 40 },
        cornerRadius: { topLeft: 10, topRight: 10, bottomRight: 10, bottomLeft: 10, uniform: true },
        layout: {
          mode: 'HORIZONTAL',
          primaryAxisAlign: 'CENTER',
          counterAxisAlign: 'CENTER',
          primaryAxisSizing: 'FIXED',
          counterAxisSizing: 'FIXED',
          layoutWrap: 'NO_WRAP',
          itemSpacing: 0,
          counterAxisSpacing: 0,
          padding: { top: 8, right: 16, bottom: 8, left: 16 },
        },
      }),
    );
  }

  it('id/classBinding/旁路扩展名与 lang 按方言区分', () => {
    const less = new PreprocessorRenderer('less');
    const sass = new PreprocessorRenderer('scss');
    expect(less.id).toBe('less');
    expect(sass.id).toBe('sass');
    expect(less.classBinding).toBe('css-module');
    expect(sass.classBinding).toBe('css-module');

    less.renderNode(makeStyledNode('card'));
    sass.renderNode(makeStyledNode('card'));
    expect(less.buildSidecar('Page')?.fileName).toBe('Page.module.less');
    expect(less.buildSidecar('Page')?.lang).toBe('less');
    expect(sass.buildSidecar('Page')?.fileName).toBe('Page.module.scss');
    expect(sass.buildSidecar('Page')?.lang).toBe('scss');
  });

  it('Less：同值跨 ≥2 属性提升为 @color 变量；共享子集提取为 .mixin() 并在类中调用', () => {
    const renderer = new PreprocessorRenderer('less');
    renderSharedSubsetTree(renderer);
    const content = renderer.buildSidecar('Dashboard')?.content ?? '';
    // 变量：color/background-color 同值 #1677ff
    expect(content).toContain('@color-1: #1677ff;');
    expect(content).toContain('color: @color-1;');
    expect(content).toContain('background-color: @color-1;');
    // mixin：两个 panel 共享 padding + background-color
    expect(content).toMatch(/\.mixin-\d+\(\) \{/);
    expect(content).toMatch(/\.mixin-\d+\(\);/);
    // 增量声明仍在各自类块
    expect(content).toContain('.panel-a {');
    expect(content).toContain('.panel-b {');
    expect(content).toContain('border-radius: 10px;');
  });

  it('Sass：变量用 $ 前缀，mixin 用 @mixin/@include 语法', () => {
    const renderer = new PreprocessorRenderer('scss');
    renderSharedSubsetTree(renderer);
    const content = renderer.buildSidecar('Dashboard')?.content ?? '';
    expect(content).toContain('$color-1: #1677ff;');
    expect(content).toMatch(/@mixin mixin-\d+ \{/);
    expect(content).toMatch(/@include mixin-\d+;/);
    expect(content).not.toContain('@mixin-');
  });

  it('嵌套：子节点携带 parentIdentifier 时规则嵌套输出于父类', () => {
    const renderer = new PreprocessorRenderer('less');
    const parent = renderer.renderNode(makeStyledNode('hero'));
    const child = renderer.renderNode(makeStyledNode('headline', '#1a1a1a'), { parentIdentifier: parent.className });
    const content = renderer.buildSidecar('Landing')?.content ?? '';
    expect(child.className).toBe('headline');
    // .headline 规则行应带两空格缩进，且出现在 .hero 块内
    expect(content).toContain('.hero {');
    expect(content).toMatch(/\.hero \{[\s\S]*?  \.headline \{/);
  });

  it('parentIdentifier 指向未注册类时回退顶层（防御性）', () => {
    const renderer = new PreprocessorRenderer('less');
    renderer.renderNode(makeStyledNode('orphan'), { parentIdentifier: 'ghost-parent' });
    const content = renderer.buildSidecar('X')?.content ?? '';
    expect(content).toContain('.orphan {');
    expect(content).not.toMatch(/  \.orphan \{/);
  });

  it('无声明节点不注册类；无条目时 buildSidecar 返回 undefined', () => {
    const renderer = new PreprocessorRenderer('scss');
    expect(renderer.renderNode(makeEmptyNode('group')).className).toBe('');
    expect(renderer.buildSidecar('Empty')).toBeUndefined();
  });
});

describe('T14–T17 createStyleRenderer 工厂分支', () => {
  it('6 个新方案均按 id 实例化对应渲染器', () => {
    expect(createStyleRenderer('styled', { framework: 'react' }).id).toBe('styled');
    expect(createStyleRenderer('emotion', { framework: 'react' }).id).toBe('emotion');
    expect(createStyleRenderer('less', { framework: 'react' }).id).toBe('less');
    expect(createStyleRenderer('sass', { framework: 'vue' }).id).toBe('sass');
    expect(createStyleRenderer('vanilla-extract', { framework: 'react' }).id).toBe('vanilla-extract');
    expect(createStyleRenderer('panda', { framework: 'react' }).id).toBe('panda');
  });
});

describe('T14–T17 不支持填充的人工复核警告', () => {
  it('渐变填充在各新渲染器产出复核警告', () => {
    const gradientNode = makeStyledNode('banner', '#ffffff', {
      fills: [
        {
          type: 'gradient-linear',
          gradientStops: [
            { position: 0, color: { r: 1, g: 1, b: 1, a: 1 } },
            { position: 1, color: { r: 0, g: 0, b: 0, a: 1 } },
          ],
          gradientHandlePositions: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        },
      ],
    });
    const renderers = [
      new StyledComponentsRenderer(),
      new EmotionRenderer(),
      new VanillaExtractRenderer(),
      new PandaRenderer(),
      new PreprocessorRenderer('scss'),
    ];
    for (const renderer of renderers) {
      const result = renderer.renderNode(gradientNode);
      expect(result.warnings.length, `${renderer.id} 应产出渐变警告`).toBeGreaterThan(0);
    }
  });
});
