/**
 * W3C DTCG Design Tokens Format Module 格式化器测试（v1.4.18，T11 / TR-11.1）
 *
 * 覆盖：
 * - 五类 token → DTCG 嵌套 group（$type/$value/$description）映射；
 * - dimension/color/fontFamily/fontWeight/number/shadow 类型正确性；
 * - 空分类不产生空 group；序列化 JSON 可往返；
 * - 内置轻量 schema 校验器：合法树通过、典型非法形态全部报错。
 */
import { describe, expect, it } from 'vitest';

import {
  buildDtcgTokens,
  serializeDtcgTokens,
  validateDtcgTokens,
} from '../../src/services/dtcg-token-formatter.js';
import type { DesignTokens } from '../../src/types.js';

/** 全分类最小 DesignTokens 夹具 */
function makeFullTokens(): DesignTokens {
  return {
    colors: {
      'primary-500': { name: 'primary-500', value: '#1677ff', description: '品牌主色' },
    },
    spacing: {
      'spacing-4': { name: 'spacing-4', value: 16, unit: 'px', description: '基础间距' },
    },
    radius: {
      'radius-md': { name: 'radius-md', value: 6, unit: 'px' },
    },
    shadows: {
      'shadow-card': {
        name: 'shadow-card',
        type: 'drop',
        x: 0,
        y: 4,
        blur: 8,
        spread: 0,
        color: '#000000',
        opacity: 0.15,
        description: '卡片阴影',
      },
      'shadow-inset': {
        name: 'shadow-inset',
        type: 'inner',
        x: 0,
        y: 2,
        blur: 4,
        spread: 0,
        color: '#000000',
      },
    },
    typography: {
      'heading-1': {
        name: 'heading-1',
        fontFamily: 'Inter',
        fontWeight: 600,
        fontSize: 24,
        lineHeight: 32,
        letterSpacing: 0.5,
        unit: 'px',
        description: '一级标题',
      },
    },
    metadata: {
      source: 'figma',
      fileKey: 'test-file',
      generatedAt: '2026-05-01T00:00:00.000Z',
      figmaFileName: 'Test Design',
    },
  };
}

describe('T11 buildDtcgTokens 映射', () => {
  it('五类 token 输出嵌套 group，叶子为 $type/$value 结构', () => {
    const tree = buildDtcgTokens(makeFullTokens());

    // 顶层分类 group（DTCG 风格单数/复数分组均为普通 group，不含 $value）
    expect(tree).toHaveProperty('color');
    expect(tree).toHaveProperty('spacing');
    expect(tree).toHaveProperty('radius');
    expect(tree).toHaveProperty('shadow');
    expect(tree).toHaveProperty('typography');
    for (const groupName of ['color', 'spacing', 'radius', 'shadow', 'typography'] as const) {
      const group = tree[groupName];
      expect(group).toBeTypeOf('object');
      expect(group).not.toHaveProperty('$value');
    }

    // color
    const primary = (tree.color as Record<string, unknown>)['primary-500'] as Record<string, unknown>;
    expect(primary.$type).toBe('color');
    expect(primary.$value).toBe('#1677ff');
    expect(primary.$description).toBe('品牌主色');

    // spacing → dimension 对象值
    const spacing4 = (tree.spacing as Record<string, unknown>)['spacing-4'] as Record<string, unknown>;
    expect(spacing4.$type).toBe('dimension');
    expect(spacing4.$value).toEqual({ value: 16, unit: 'px' });

    // radius → dimension；无描述时不存在 $description 键
    const radiusMd = (tree.radius as Record<string, unknown>)['radius-md'] as Record<string, unknown>;
    expect(radiusMd.$type).toBe('dimension');
    expect(radiusMd.$value).toEqual({ value: 6, unit: 'px' });
    expect(radiusMd).not.toHaveProperty('$description');
  });

  it('shadow：drop/inner 分别输出 inset false/true 与像素维度字符串', () => {
    const tree = buildDtcgTokens(makeFullTokens());
    const drop = (tree.shadow as Record<string, unknown>)['shadow-card'] as Record<string, unknown>;
    expect(drop.$type).toBe('shadow');
    expect(drop.$value).toEqual({
      color: '#000000',
      offsetX: '0px',
      offsetY: '4px',
      blur: '8px',
      spread: '0px',
      inset: false,
    });

    const inset = (tree.shadow as Record<string, unknown>)['shadow-inset'] as Record<string, unknown>;
    expect((inset.$value as Record<string, unknown>).inset).toBe(true);
  });

  it('typography：嵌套 fontFamily/dimension/fontWeight/number 子令牌', () => {
    const tree = buildDtcgTokens(makeFullTokens());
    const heading = (tree.typography as Record<string, unknown>)['heading-1'] as Record<string, unknown>;
    expect(heading.$description).toBe('一级标题');

    const fontFamily = heading['font-family'] as Record<string, unknown>;
    expect(fontFamily.$type).toBe('fontFamily');
    expect(fontFamily.$value).toBe('Inter');

    const fontSize = heading['font-size'] as Record<string, unknown>;
    expect(fontSize.$type).toBe('dimension');
    expect(fontSize.$value).toEqual({ value: 24, unit: 'px' });

    expect((heading['font-weight'] as Record<string, unknown>).$type).toBe('fontWeight');
    expect((heading['font-weight'] as Record<string, unknown>).$value).toBe(600);

    const lineHeight = heading['line-height'] as Record<string, unknown>;
    expect(lineHeight.$type).toBe('dimension');
    expect(lineHeight.$value).toEqual({ value: 32, unit: 'px' });

    const letterSpacing = heading['letter-spacing'] as Record<string, unknown>;
    expect(letterSpacing.$type).toBe('dimension');
    expect(letterSpacing.$value).toEqual({ value: 0.5, unit: 'px' });
  });

  it('空分类不产生空 group；unit 缺省回退 px；根节点无 $value', () => {
    const tokens = makeFullTokens();
    tokens.spacing = {};
    tokens.shadows = {};
    tokens.typography = {};
    const tree = buildDtcgTokens(tokens);

    expect(tree).not.toHaveProperty('spacing');
    expect(tree).not.toHaveProperty('shadow');
    expect(tree).not.toHaveProperty('typography');
    expect(tree).toHaveProperty('color');
    expect(tree).not.toHaveProperty('$value');
  });
});

describe('T11 serializeDtcgTokens 序列化', () => {
  it('两空格缩进 JSON 且末尾换行；parse 往返后通过校验', () => {
    const text = serializeDtcgTokens(makeFullTokens());
    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('\n  "color"');

    const reparsed: unknown = JSON.parse(text);
    const result = validateDtcgTokens(reparsed);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe('T11 / TR-11.1 validateDtcgTokens 内置 schema 校验', () => {
  it('构建产物始终合法', () => {
    expect(validateDtcgTokens(buildDtcgTokens(makeFullTokens())).valid).toBe(true);
  });

  it('根必须是对象', () => {
    expect(validateDtcgTokens([]).valid).toBe(false);
    expect(validateDtcgTokens(null).valid).toBe(false);
    expect(validateDtcgTokens('x').valid).toBe(false);
  });

  it('叶子缺少 $type / $value 报错', () => {
    const r1 = validateDtcgTokens({ color: { x: { $value: '#fff' } } });
    expect(r1.valid).toBe(false);
    expect(r1.errors.some((e) => e.includes('$type'))).toBe(true);

    const r2 = validateDtcgTokens({ color: { x: { $type: 'color' } } });
    expect(r2.valid).toBe(false);
    expect(r2.errors.some((e) => e.includes('$value'))).toBe(true);
  });

  it('未知 $type 与类型不匹配的值报错', () => {
    expect(validateDtcgTokens({ a: { x: { $type: 'weird', $value: 1 } } }).valid).toBe(false);
    expect(validateDtcgTokens({ a: { x: { $type: 'color', $value: 42 } } }).valid).toBe(false);
    expect(validateDtcgTokens({ a: { x: { $type: 'fontWeight', $value: 'bold' } } }).valid).toBe(false);
  });

  it('dimension 必须为 {value:number, unit:px|rem}', () => {
    expect(
      validateDtcgTokens({ a: { x: { $type: 'dimension', $value: { value: 4, unit: 'em' } } } }).valid,
    ).toBe(false);
    expect(
      validateDtcgTokens({ a: { x: { $type: 'dimension', $value: { value: '4', unit: 'px' } } } }).valid,
    ).toBe(false);
  });

  it('shadow 必须具备完整字段且 inset 为 boolean', () => {
    const validShadow = {
      color: '#000',
      offsetX: '0px',
      offsetY: '1px',
      blur: '2px',
      spread: '0px',
      inset: false,
    };
    expect(validateDtcgTokens({ s: { x: { $type: 'shadow', $value: validShadow } } }).valid).toBe(true);
    expect(
      validateDtcgTokens({ s: { x: { $type: 'shadow', $value: { ...validShadow, blur: 2 } } } }).valid,
    ).toBe(false);
    expect(
      validateDtcgTokens({ s: { x: { $type: 'shadow', $value: { ...validShadow, inset: 'yes' } } } }).valid,
    ).toBe(false);
  });

  it('非对象子节点与叶子未知键报错；错误带路径', () => {
    const r1 = validateDtcgTokens({ color: { x: 5 } });
    expect(r1.valid).toBe(false);
    expect(r1.errors[0]).toContain('color.x');

    const r2 = validateDtcgTokens({ color: { x: { $type: 'color', $value: '#fff', extra: 1 } } });
    expect(r2.valid).toBe(false);
    expect(r2.errors.some((e) => e.includes('extra'))).toBe(true);
  });

  it('group 允许 $description 但拒绝其他 $ 保留键', () => {
    expect(validateDtcgTokens({ $description: 'ok', x: { $type: 'number', $value: 1 } }).valid).toBe(true);
    expect(validateDtcgTokens({ $unknown: 1, x: { $type: 'number', $value: 1 } }).valid).toBe(false);
  });
});
