/**
 * WBS-P2-41 CSS Variables renderer 骨架 + 命名规范 + tokens 映射 单测
 *
 * 本期承诺（ROADMAP P2-4）：
 * - 冻结 --color-xxx / --spacing-xxx 等分类前缀命名规范；
 * - 提供 tokens→:root 声明块与 value→var(--x) 映射纯函数；
 * - 渲染器仅交付骨架：注册表保持 planned、工厂不接线，renderNode 必须显式抛错，
 *   不产生任何半成品组件输出，且不改变现有样式枚举/smoke 契约。
 */
import { describe, expect, it } from 'vitest';
import {
  buildCssVariableName,
  buildRootVariableBlock,
  CSS_VARIABLE_PREFIX,
  CssVariablesRenderer,
  mapValueToCssVariable,
  parseCssVariableName,
  type CssTokenCategory,
  type CssTokenDefinition,
} from '../../src/services/style-renderers/css-variables-renderer.js';
import { createStyleRenderer } from '../../src/services/style-renderers/factory.js';
import {
  getStyleDescriptor,
  listStyleFormatsByStatus,
  STYLE_FORMATS_NEW_PIPELINE,
} from '../../src/services/style-renderers/registry.js';

describe('WBS-P2-41 CSS 变量命名规范', () => {
  it('按分类加冻结前缀（--color-*/--spacing-* 等 7 类）', () => {
    expect(buildCssVariableName('color', 'primary')).toBe('--color-primary');
    expect(buildCssVariableName('spacing', 'page-padding')).toBe('--spacing-page-padding');
    expect(buildCssVariableName('radius', 'card-lg')).toBe('--radius-card-lg');
    expect(buildCssVariableName('font-size', 'heading-xl')).toBe('--font-size-heading-xl');
    expect(buildCssVariableName('font-weight', 'bold')).toBe('--font-weight-bold');
    expect(buildCssVariableName('line-height', 'tight')).toBe('--line-height-tight');
    expect(buildCssVariableName('shadow', 'card-hover')).toBe('--shadow-card-hover');
  });

  it('名称段规范化：去空白/下划线/非法字符、折叠连字符、去首尾连字符、小写', () => {
    expect(buildCssVariableName('color', 'Primary 500')).toBe('--color-primary-500');
    expect(buildCssVariableName('color', 'brand_dark_2')).toBe('--color-brand-dark-2');
    expect(buildCssVariableName('color', '  Brand--Dark!! ')).toBe('--color-brand-dark');
    expect(buildCssVariableName('spacing', 'MARGIN_XL')).toBe('--spacing-margin-xl');
    expect(buildCssVariableName('color', 'Success/Green')).toBe('--color-success-green');
  });

  it('规范化后为空的名称必须抛错（禁止生成 --color- 空变量）', () => {
    expect(() => buildCssVariableName('color', '')).toThrow(/name/i);
    expect(() => buildCssVariableName('color', '   ')).toThrow(/name/i);
    expect(() => buildCssVariableName('color', '!!!')).toThrow(/name/i);
  });

  it('parseCssVariableName 与命名互逆；非法/未知分类返回 null', () => {
    expect(parseCssVariableName('--color-primary-500')).toEqual({ category: 'color', name: 'primary-500' });
    expect(parseCssVariableName('--spacing-page-padding')).toEqual({
      category: 'spacing',
      name: 'page-padding',
    });
    expect(parseCssVariableName('color-primary')).toBeNull();
    expect(parseCssVariableName('--unknown-foo')).toBeNull();
    expect(parseCssVariableName('--color-')).toBeNull();
  });

  it('所有分类前缀都带 -- 并以连字符结尾', () => {
    for (const prefix of Object.values(CSS_VARIABLE_PREFIX)) {
      expect(prefix.startsWith('--')).toBe(true);
      expect(prefix.endsWith('-')).toBe(true);
    }
  });
});

describe('WBS-P2-41 tokens → :root 声明块', () => {
  const tokens: CssTokenDefinition[] = [
    { category: 'spacing', name: 'page padding', value: '32rpx' },
    { category: 'color', name: 'Brand/Primary', value: '#07c160' },
    { category: 'color', name: 'text-main', value: '#1a1a1a', comment: '正文主色' },
    { category: 'radius', name: 'card', value: '20rpx' },
  ];

  it('按分类固定顺序 + 名称排序输出 :root 声明，保留注释', () => {
    const block = buildRootVariableBlock(tokens);
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    expect(lines[0]).toBe(':root {');
    expect(lines[lines.length - 1]).toBe('}');
    // color 在 spacing 之前（color→spacing→radius 固定顺序），同分类按名称排序
    const colorLine = lines.indexOf('--color-brand-primary: #07c160;');
    const textLine = lines.indexOf('--color-text-main: #1a1a1a; /* 正文主色 */');
    const spacingLine = lines.indexOf('--spacing-page-padding: 32rpx;');
    const radiusLine = lines.indexOf('--radius-card: 20rpx;');
    expect(colorLine).toBeGreaterThan(0);
    expect(textLine).toBeGreaterThan(colorLine);
    expect(spacingLine).toBeGreaterThan(textLine);
    expect(radiusLine).toBeGreaterThan(spacingLine);
  });

  it('空 token 列表输出空 :root 块', () => {
    expect(buildRootVariableBlock([])).toBe(':root {\n}\n');
  });

  it('同一变量名重复时后者覆盖前者（last-wins，模拟 token 表去重语义）', () => {
    const block = buildRootVariableBlock([
      { category: 'color', name: 'primary', value: '#000000' },
      { category: 'color', name: 'primary', value: '#ffffff' },
    ]);
    expect(block).toContain('--color-primary: #ffffff;');
    expect(block).not.toContain('--color-primary: #000000;');
  });
});

describe('WBS-P2-41 value → var() 映射', () => {
  // 属性 → (值 → 变量名) 映射表
  const table = new Map<string, string>([
    ['#07c160', '--color-success'],
    ['32rpx', '--spacing-page-padding'],
  ]);

  it('命中 token 时输出 var(--x) 表达式并标记 matched', () => {
    const hit = mapValueToCssVariable('color', '#07c160', table);
    expect(hit.matched).toBe(true);
    expect(hit.expression).toBe('var(--color-success)');
    expect(hit.variable).toBe('--color-success');
  });

  it('未命中时保留字面值表达式并标记 unmatched（由调用方决定是否 warn）', () => {
    const miss = mapValueToCssVariable('margin-top', '13rpx', table);
    expect(miss.matched).toBe(false);
    expect(miss.expression).toBe('13rpx');
    expect(miss.variable).toBeUndefined();
  });

  it('颜色值按忽略大小写匹配', () => {
    const hit = mapValueToCssVariable('color', '#07C160', table);
    expect(hit.matched).toBe(true);
    expect(hit.expression).toBe('var(--color-success)');
  });
});

describe('WBS-P2-41 门控：骨架不进生成枚举', () => {
  it('注册表状态保持 planned、计划版本 1.5.0，且不在新管线集合', () => {
    const descriptor = getStyleDescriptor('css-variables');
    expect(descriptor.status).toBe('planned');
    expect(descriptor.plannedVersion).toBe('1.5.0');
    expect(STYLE_FORMATS_NEW_PIPELINE).not.toContain('css-variables');
    expect(listStyleFormatsByStatus('planned')).toContain('css-variables');
  });

  it('工厂不为 css-variables 实例化（走未实现兜底抛错）', () => {
    expect(() => createStyleRenderer('css-variables')).toThrow(/not implemented/i);
  });

  it('骨架渲染器 renderNode 显式抛 planned 错误，绝不产出半成品', () => {
    const renderer = new CssVariablesRenderer();
    expect(renderer.id).toBe('css-variables');
    expect(() =>
      renderer.renderNode({ id: 'x', name: 'div', type: 'FRAME' } as never),
    ).toThrow(/1\.5\.0|planned/i);
  });

  it('现有可用方案枚举数量不回归（9 新管线 + inline + planned 各归各位）', () => {
    // 11 个描述符总数是 v1.4.18 冻结契约，P2-41 只加骨架不加枚举
    expect(listStyleFormatsByStatus('available')).toHaveLength(10);
    expect(listStyleFormatsByStatus('planned')).toEqual(['css-variables']);
    const category: CssTokenCategory = 'shadow';
    expect(CSS_VARIABLE_PREFIX[category]).toBe('--shadow-');
  });
});
