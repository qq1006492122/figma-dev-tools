/**
 * CSS Modules 渲染器测试（v1.4.18，T9 / TR-9.1 基础层）
 *
 * 覆盖：
 * 1. extractCssDeclarations：ProcessedNode → 确定性排序的原生 CSS 声明（布局/尺寸/圆角/描边/填充/文本）；
 * 2. CssModulesRenderer：节点 → 语义化本地类名；同签名样式复用同一类；命名冲突加后缀；
 * 3. buildSidecar：输出同名 .module.css 文本；严格子集经 composes 复用；
 * 4. 不支持的填充（渐变/图片）产出人工复核警告。
 *
 * React/Vue 端到端快照（styles.x / $style.x + 旁路文件）见 css-modules-pipeline.test.ts。
 */
import { describe, expect, it } from 'vitest';

import {
  CssModulesRenderer,
  extractCssDeclarations,
} from '../../src/services/style-renderers/css-modules-renderer.js';
import type { ProcessedNode } from '../../src/types/nodes.js';

/** 纵向自动布局容器：flex/列/居中/13px 间距/16px 内边距/固定宽（非标值直接落原生 CSS，无 arbitrary 语法） */
function makeAutoLayoutFrame(overrides: Partial<ProcessedNode> = {}): ProcessedNode {
  return {
    id: 'node-box',
    figmaId: '20:1',
    name: 'card',
    originalType: 'FRAME',
    role: 'container',
    visible: true,
    clipsContent: false,
    size: { width: 321, height: 160 },
    layout: {
      mode: 'VERTICAL',
      primaryAxisAlign: 'CENTER',
      counterAxisAlign: 'CENTER',
      primaryAxisSizing: 'FIXED',
      counterAxisSizing: 'FIXED',
      layoutWrap: 'NO_WRAP',
      itemSpacing: 13,
      counterAxisSpacing: 0,
      padding: { top: 16, right: 16, bottom: 16, left: 16 },
    },
    children: [],
    ...overrides,
  };
}

/** #rrggbb → FigmaColor（测试夹具用） */
function hexToFigmaColor(hex: string): { r: number; g: number; b: number; a: number } {
  const n = Number.parseInt(hex.slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: 1 };
}

/** 构造一个声明集合稳定的按钮节点（flex/内边距/圆角/底色） */
function makeButtonNode(name: string, hexColor = '#f5f5f5'): ProcessedNode {
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
  };
}

describe('T9 extractCssDeclarations：节点 → 原生 CSS 声明', () => {
  it('自动布局容器：flex 列布局/对齐/gap/等距 padding/固定尺寸，声明顺序确定', () => {
    const decls = extractCssDeclarations(makeAutoLayoutFrame());
    const text = decls.map(([prop, value]) => `${prop}: ${value}`).join('; ');
    expect(text).toContain('display: flex');
    expect(text).toContain('flex-direction: column');
    expect(text).toContain('justify-content: center');
    expect(text).toContain('align-items: center');
    expect(text).toContain('gap: 13px');
    expect(text).toContain('padding: 16px');
    expect(text).toContain('width: 321px');
    expect(text).toContain('height: 160px');
    // 原生 CSS 中不允许出现 Tailwind arbitrary 语法
    expect(text).not.toContain('[');
    // display 必须是第一个声明（规范顺序）
    expect(decls[0]?.[0]).toBe('display');
  });

  it('四边不等 padding 输出四值简写；水平布局输出 row，AUTO 主轴不输出宽度', () => {
    const node = makeAutoLayoutFrame({
      layout: {
        mode: 'HORIZONTAL',
        primaryAxisAlign: 'MIN',
        counterAxisAlign: 'MIN',
        primaryAxisSizing: 'AUTO',
        counterAxisSizing: 'AUTO',
        layoutWrap: 'NO_WRAP',
        itemSpacing: 0,
        counterAxisSpacing: 0,
        padding: { top: 4, right: 8, bottom: 12, left: 16 },
      },
    });
    const decls = extractCssDeclarations(node);
    const map = new Map(decls);
    expect(map.get('flex-direction')).toBe('row');
    expect(map.get('padding')).toBe('4px 8px 12px 16px');
    // 水平 AUTO 主轴（宽度）不输出 width；交叉轴 height 与 TailwindMapper 语义保持一致仍输出
    expect(map.has('width')).toBe(false);
    expect(map.has('height')).toBe(true);
  });

  it('纯色填充容器输出 background-color（8 位 hex 表达透明度）', () => {
    const node = makeAutoLayoutFrame({
      fills: [{ type: 'solid', color: { r: 1, g: 0, b: 0, a: 0.5 } }],
    });
    const map = new Map(extractCssDeclarations(node));
    expect(map.get('background-color')).toBe('#ff000080');
    expect(map.has('color')).toBe(false);
  });

  it('文本节点：文字色走 color，含字号/字重/行高', () => {
    const node: ProcessedNode = {
      id: 't1',
      figmaId: '40:1',
      name: 'label',
      originalType: 'TEXT',
      role: 'text',
      visible: true,
      clipsContent: false,
      size: { width: 100, height: 20 },
      fills: [{ type: 'solid', color: { r: 0.1, g: 0.1, b: 0.1, a: 1 } }],
      textStyle: {
        fontFamily: 'Inter',
        fontWeight: 600,
        fontSize: 14,
        lineHeightPx: 20,
        textAlignHorizontal: 'LEFT',
      },
      children: [],
    };
    const map = new Map(extractCssDeclarations(node));
    expect(map.get('color')).toBe('#1a1a1a');
    expect(map.get('font-size')).toBe('14px');
    expect(map.get('font-weight')).toBe('600');
    expect(map.get('line-height')).toBe('20px');
    expect(map.has('background-color')).toBe(false);
  });

  it('统一圆角输出 border-radius；描边输出 border 简写；四角独立输出四值', () => {
    const uniform = new Map(
      extractCssDeclarations(makeAutoLayoutFrame({
        cornerRadius: { topLeft: 8, topRight: 8, bottomRight: 8, bottomLeft: 8, uniform: true },
        strokes: [{ color: { r: 0, g: 0, b: 0, a: 1 }, weight: 1, align: 'INSIDE' }],
      })),
    );
    expect(uniform.get('border-radius')).toBe('8px');
    expect(uniform.get('border')).toBe('1px solid #000000');

    const mixed = new Map(
      extractCssDeclarations(makeAutoLayoutFrame({
        cornerRadius: { topLeft: 2, topRight: 4, bottomRight: 6, bottomLeft: 8 },
      })),
    );
    expect(mixed.get('border-radius')).toBe('2px 4px 6px 8px');
  });
});

describe('T9 CssModulesRenderer：类名注册/复用/旁路文件', () => {
  it('renderNode 返回语义化本地类名（由节点名 kebab 化），无 styles./$style 框架语法', () => {
    const renderer = new CssModulesRenderer();
    const result = renderer.renderNode(makeButtonNode('PrimaryButton'));
    expect(result.className).toBe('primary-button');
  });

  it('同签名声明的两个节点复用同一个类名（重复样式零重复输出）', () => {
    const renderer = new CssModulesRenderer();
    const a = renderer.renderNode(makeButtonNode('btn-a'));
    const b = renderer.renderNode(makeButtonNode('btn-b'));
    expect(a.className).toBe(b.className);
  });

  it('同名但不同样式的节点类名自动加后缀避免碰撞', () => {
    const renderer = new CssModulesRenderer();
    const first = renderer.renderNode(makeButtonNode('tag'));
    const second = renderer.renderNode(
      makeButtonNode('tag', '#1677ff'),
    );
    expect(first.className).toBe('tag');
    expect(second.className).toBe('tag-2');
  });

  it('buildSidecar：输出 .module.css 文本，含注册类与声明', () => {
    const renderer = new CssModulesRenderer();
    renderer.renderNode(makeButtonNode('primary-button'));
    const sidecar = renderer.buildSidecar('ActionCard');
    expect(sidecar).toBeDefined();
    expect(sidecar?.fileName).toBe('ActionCard.module.css');
    expect(sidecar?.content).toContain('.primary-button {');
    expect(sidecar?.content).toContain('display: flex;');
    expect(sidecar?.content).toContain('background-color: #f5f5f5;');
  });

  it('严格超集类通过 composes 复用基类，且只输出增量声明', () => {
    const renderer = new CssModulesRenderer();
    // 基类：布局三件套 + 内边距 + 交叉轴高度（水平 AUTO 宽度不产出 width；height 与超集取同值）
    renderer.renderNode(
      makeAutoLayoutFrame({
        name: 'button-base',
        fills: undefined,
        cornerRadius: undefined,
        size: { width: 88, height: 40 },
        layout: {
          mode: 'HORIZONTAL',
          primaryAxisAlign: 'CENTER',
          counterAxisAlign: 'CENTER',
          primaryAxisSizing: 'AUTO',
          counterAxisSizing: 'AUTO',
          layoutWrap: 'NO_WRAP',
          itemSpacing: 0,
          counterAxisSpacing: 0,
          padding: { top: 8, right: 16, bottom: 8, left: 16 },
        },
      }),
    );
    // 超集：同布局/同高度 + 显式宽度 + 圆角 + 主色背景
    const superset = makeButtonNode('button-primary');
    const className = renderer.renderNode(superset).className;
    const css = renderer.buildSidecar('Buttons')?.content ?? '';
    expect(className).toBe('button-primary');
    expect(css).toContain('composes: button-base;');
    // composes 块只保留增量：宽度/背景与圆角，不重复 display/flex-direction/padding
    const block = css.split('.button-primary {')[1]?.split('}')[0] ?? '';
    expect(block).toContain('width:');
    expect(block).toContain('background-color:');
    expect(block).toContain('border-radius:');
    expect(block).not.toContain('display:');
    expect(block).not.toContain('padding:');
  });

  it('无任何可映射样式的节点返回空类名且不产生空类块', () => {
    const renderer = new CssModulesRenderer();
    const plain = {
      id: 'g1',
      figmaId: '50:1',
      name: 'group',
      originalType: 'GROUP',
      role: 'container',
      visible: true,
      clipsContent: false,
      children: [],
    } as unknown as ProcessedNode;
    const result = renderer.renderNode(plain);
    expect(result.className).toBe('');
    const css = renderer.buildSidecar('Empty')?.content ?? '';
    expect(css).not.toContain('.group');
  });

  it('渐变填充不可逐像素映射为普通背景时产出人工复核警告', () => {
    const renderer = new CssModulesRenderer();
    const node = makeAutoLayoutFrame({
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
    const result = renderer.renderNode(node);
    expect(result.warnings?.length).toBeGreaterThan(0);
    expect(result.warnings?.join('\n')).toContain('渐变');
  });
});
