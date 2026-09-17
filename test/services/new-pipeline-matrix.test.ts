/**
 * v1.4.19 T14–T17 新样式方案 × 框架端到端管线矩阵（TR-14.1/TR-15.1/TR-16.1/TR-17.1）
 *
 * React 6 方案快照：styled / emotion / panda / vanilla-extract / less / sass；
 * Vue 双框架方案快照：less / sass；
 * Vue 选择 React 专属方案（styled/emotion/vanilla-extract/panda）必须在触网前抛
 * UnsupportedStyleFormatError（框架矩阵闸门，不静默降级）。
 *
 * 渲染器层纯单元测试见 new-style-renderers.test.ts；
 * 旧三方案（tailwind/unocss/css-modules）回归见各自既有快照。
 */
import { describe, expect, it } from 'vitest';

import { createCodeGenerator, type CodeGenerator } from '../../src/services/code-generator.js';
import { createVueGenerator } from '../../src/services/vue-generator.js';
import type { FigmaClient } from '../../src/services/figma-client.js';
import { UnsupportedStyleFormatError } from '../../src/services/style-renderers/index.js';
import type { DesignContext, ProcessedNode } from '../../src/types/nodes.js';
import type { StyleFormat } from '../../src/types.js';

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
 * 操作卡片树（与 css-modules-pipeline 夹具同构，保证各样式方案面对同一棵树）：
 * 根 action-card + 文本 title + 基类/超集按钮 + 两个同签名按钮。
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

/** Promise/方法返回值类型解包（测试内联类型工具，零 any） */
type Awaited<T> = T extends Promise<infer U> ? U : T;
/** React 生成结果类型（经实例方法推导，避免手写大接口漂移） */
type ReactResult = Awaited<ReturnType<CodeGenerator['generateJsxFromContext']>>;

/** React 生成统一入口 */
async function generateReact(styleFormat: StyleFormat): Promise<ReactResult> {
  const generator = createCodeGenerator(NULL_CLIENT);
  return generator.generateJsxFromContext(makeContext(makeActionCardTree()), {
    componentName: 'ActionCard',
    styleFormat,
    bundler: 'none',
    skipEnhancements: true,
  });
}

describe('TR-14.1 React styled-components 管线', () => {
  it('标签替换为 styled 组件 + 同文件 styled 定义 + import，快照', async () => {
    const result: ReactResult = await generateReact('styled');
    expect(result.code).toMatchSnapshot();

    // 根节点以组件标识符替换语义标签，根仍透传外部 className
    expect(result.code).toContain('<ActionCardRoot');
    expect(result.code).toContain('className={className}');
    // 同签名按钮在 JSX 中复用同一 styled 组件
    const refCount = result.code.split('<CancelButton').length - 1;
    expect(refCount).toBe(2);
    // 前导样式段与依赖 import
    expect(result.code).toContain("import styled from 'styled-components';");
    expect(result.code).toContain('const ActionCardRoot = styled.section`');
    expect(result.code).toContain('const ButtonPrimary = styled.button`');
    // 不得输出静态原子类 className（styled 标签自带样式；模板内的 CSS 声明除外）
    expect(result.code).not.toContain('className="');
    // 无旁路文件，样式全部同文件
    expect(result.styleSidecar).toBeUndefined();
    // hints 透出到结果
    expect(result.styleHints.some((hint) => hint.title.includes('theme.ts'))).toBe(true);
  });
});

describe('TR-15.1 React Emotion 管线', () => {
  it('css prop + css() 对象常量 + @emotion/react import，快照', async () => {
    const result: ReactResult = await generateReact('emotion');
    expect(result.code).toMatchSnapshot();

    // 根与节点均经 css prop 引用；根同时透传 className
    expect(result.code).toContain('css={cssActionCardRoot}');
    expect(result.code).toContain('className={className}');
    expect(result.code).toContain('css={cssTitle}');
    const sharedCount = result.code.split('css={cssCancelButton}').length - 1;
    expect(sharedCount).toBe(2);
    // 前导常量段：camelCase 对象样式
    expect(result.code).toContain("import { css } from '@emotion/react';");
    expect(result.code).toContain('const cssButtonPrimary = css({');
    expect(result.code).toContain("  backgroundColor: '#1677ff',");
    expect(result.code).not.toContain('background-color:');
    expect(result.styleSidecar).toBeUndefined();
    // 保留原生语义标签（不替换为组件标识符；React 管线该树语义标签为 div/p）
    expect(result.code).toContain('<div');
    expect(result.code).toContain('<p');
  });
});

describe('TR-17.1 React Panda CSS 管线', () => {
  it('className 表达式绑定 + css() 常量 + outdir import，快照', async () => {
    const result: ReactResult = await generateReact('panda');
    expect(result.code).toMatchSnapshot();

    // 根 cn(常量, 外部 className)；非根直接表达式
    expect(result.code).toContain('className={cn(actionCardRoot, className)}');
    expect(result.code).toContain('className={title}');
    expect(result.code).toContain('className={buttonPrimary}');
    // 前导常量段
    expect(result.code).toContain("import { css } from '@/styled-system/css';");
    expect(result.code).toContain('const buttonPrimary = css({');
    expect(result.code).not.toContain('className="');
    expect(result.styleSidecar).toBeUndefined();
    expect(result.styleHints.some((hint) => hint.code.includes('cva'))).toBe(true);
  });
});

describe('TR-17.1 React vanilla-extract 管线', () => {
  it('命名空间 import + styles[camel] 绑定 + .css.ts 旁路，快照', async () => {
    const result: ReactResult = await generateReact('vanilla-extract');
    expect(result.code).toMatchSnapshot();

    // reactImport 覆盖缺省形态：*.css 命名空间导入
    expect(result.code).toContain("import * as styles from './ActionCard.css';");
    expect(result.code).toContain("className={cn(styles['actionCardRoot'], className)}");
    expect(result.code).toContain("className={styles['title']}");
    // 旁路 .css.ts
    expect(result.styleSidecar?.fileName).toBe('ActionCard.css.ts');
    expect(result.styleSidecar?.lang).toBe('ts');
    const sidecar = result.styleSidecar?.content ?? '';
    expect(sidecar).toContain("import { style } from '@vanilla-extract/css';");
    expect(sidecar).toContain('export const buttonPrimary = style({');
    expect(sidecar).toContain("  backgroundColor: '#1677ff',");
  });
});

describe('TR-16.1 React Less / Sass 管线', () => {
  it('Less：styles 引用 + .module.less 旁路（lang=less，嵌套 + mixin）', async () => {
    const result: ReactResult = await generateReact('less');
    expect(result.code).toMatchSnapshot();

    expect(result.code).toContain("import styles from './ActionCard.module.less';");
    expect(result.code).toContain("className={cn(styles['action-card'], className)}");
    expect(result.code).toContain("className={styles['button-primary']}");
    // 同签名类复用
    expect(result.code.split("styles['cancel-button']").length - 1).toBe(2);

    const sidecar = result.styleSidecar?.content ?? '';
    expect(result.styleSidecar?.fileName).toBe('ActionCard.module.less');
    expect(result.styleSidecar?.lang).toBe('less');
    expect(sidecar).toContain('.action-card {');
    // 子类嵌套于根类（parentIdentifier 透传）
    expect(sidecar).toContain('  .title {');
    // 三个按钮共享布局子集 → mixin 提取（变量提取由渲染器单测专用夹具覆盖）
    expect(sidecar).toMatch(/\.mixin-\d+\(\) \{/);
    expect(sidecar).toMatch(/\.mixin-\d+\(\);/);
  });

  it('Sass：styles 引用 + .module.scss 旁路（lang=scss，$ 变量/@mixin）', async () => {
    const result: ReactResult = await generateReact('sass');
    expect(result.code).toMatchSnapshot();

    expect(result.code).toContain("import styles from './ActionCard.module.scss';");
    expect(result.code).toContain("className={styles['button-base']}");
    expect(result.styleSidecar?.fileName).toBe('ActionCard.module.scss');
    expect(result.styleSidecar?.lang).toBe('scss');
    const sidecar = result.styleSidecar?.content ?? '';
    expect(sidecar).toContain('.action-card {');
    expect(sidecar).toContain('  .button-primary {');
  });
});

describe('TR-16.1 Vue Less / Sass 管线', () => {
  it('Vue Less：$style 绑定 + <style module lang="less" src> 外置旁路，快照', async () => {
    const generator = createVueGenerator(NULL_CLIENT);
    const result = await generator.generateFromContext(makeContext(makeActionCardTree()), {
      componentName: 'ActionCard',
      styleFormat: 'less',
      bundler: 'none',
      skipEnhancements: true,
    });
    expect(result.code).toMatchSnapshot();

    expect(result.code).toContain('<style module lang="less" src="./ActionCard.module.less"></style>');
    expect(result.code).toContain(":class=\"$style['action-card']\"");
    expect(result.code).toContain(":class=\"$style['button-primary']\"");
    // scoped 占位块被旁路取代
    expect(result.code).not.toContain('<style scoped>');
    expect(result.styleSidecar?.lang).toBe('less');
    expect(result.styleSidecar?.content).toContain('.action-card {');
  });

  it('Vue Sass：$style 绑定 + lang="scss" style 块', async () => {
    const generator = createVueGenerator(NULL_CLIENT);
    const result = await generator.generateFromContext(makeContext(makeActionCardTree()), {
      componentName: 'ActionCard',
      styleFormat: 'sass',
      bundler: 'none',
      skipEnhancements: true,
    });
    expect(result.code).toMatchSnapshot();

    expect(result.code).toContain('<style module lang="scss" src="./ActionCard.module.scss"></style>');
    expect(result.code).toContain(":class=\"$style['title']\"");
    expect(result.styleSidecar?.fileName).toBe('ActionCard.module.scss');
  });
});

describe('TR-14.1 Vue 框架矩阵闸门（React 专属方案显式拒绝）', () => {
  const reactOnlyFormats: readonly StyleFormat[] = ['styled', 'emotion', 'vanilla-extract', 'panda'];

  for (const format of reactOnlyFormats) {
    it(`Vue 选择 ${format} 抛框架不支持错误（触网前、英文消息含方案与框架）`, async () => {
      const generator = createVueGenerator(NULL_CLIENT);
      const fn = generator.generateFromContext(makeContext(makeActionCardTree()), {
        componentName: 'ActionCard',
        styleFormat: format,
        bundler: 'none',
        skipEnhancements: true,
      });
      await expect(fn).rejects.toBeInstanceOf(UnsupportedStyleFormatError);
      await expect(fn).rejects.toThrow(/does not support the vue framework/i);
      await expect(fn).rejects.toThrow(format);
    });
  }
});
