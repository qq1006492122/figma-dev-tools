/**
 * 样式渲染器注册表测试（v1.4.18，T7）
 *
 * 锁定单一数据源：
 * - 11 值 StyleFormat 全登记，枚举顺序稳定（CLI/MCP/文档共用）；
 * - available / planned 状态与版本路线图；
 * - 管线支持集合（新 React/Vue 管线、legacy React 管线）；
 * - 未启用/未知值显式抛 i18n 错误，绝不静默错配到 tailwind。
 */
import { describe, expect, it } from 'vitest';

import {
  ALL_STYLE_FORMATS,
  assertStyleFormatSupported,
  buildStyleFormatHelp,
  getStyleDescriptor,
  listStyleFormatsByStatus,
  STYLE_FORMATS_LEGACY_REACT,
  STYLE_FORMATS_NEW_PIPELINE,
  UnsupportedStyleFormatError,
} from '../../src/services/style-renderers/index.js';

describe('T7 样式渲染器注册表（单一数据源）', () => {
  it('登记 spec FR-05 全部 11 个样式方案且顺序稳定', () => {
    expect(ALL_STYLE_FORMATS).toEqual([
      'tailwind',
      'unocss',
      'css-modules',
      'styled',
      'emotion',
      'less',
      'sass',
      'vanilla-extract',
      'panda',
      'inline-styles',
      'css-variables',
    ]);
    expect(new Set(ALL_STYLE_FORMATS).size).toBe(11);
  });

  it('每个描述符含中英 label/description，planned 项带版本号', () => {
    for (const id of ALL_STYLE_FORMATS) {
      const d = getStyleDescriptor(id);
      expect(d.id).toBe(id);
      expect(d.labels['zh-CN'].length).toBeGreaterThan(0);
      expect(d.labels['en-US'].length).toBeGreaterThan(0);
      expect(d.descriptions['zh-CN'].length).toBeGreaterThan(0);
      expect(d.descriptions['en-US'].length).toBeGreaterThan(0);
      // 品牌名 label 中英可相同（如 Tailwind CSS），但说明文案必须分别本地化
      expect(d.descriptions['zh-CN']).not.toBe(d.descriptions['en-US']);
      if (d.status === 'planned') {
        expect(d.plannedVersion, `${id} 必须声明计划版本`).toBeTruthy();
      } else {
        expect(d.plannedVersion).toBeUndefined();
      }
    }
  });

  it('状态分组：批次一可用 4 项；styled/emotion/less/sass/vanilla-extract 规划 v1.4.19', () => {
    expect(listStyleFormatsByStatus('available')).toEqual([
      'tailwind',
      'unocss',
      'css-modules',
      'inline-styles',
    ]);
    const planned = listStyleFormatsByStatus('planned');
    expect(planned).toEqual(['styled', 'emotion', 'less', 'sass', 'vanilla-extract', 'panda', 'css-variables']);
    for (const id of ['styled', 'emotion', 'less', 'sass', 'vanilla-extract', 'panda'] as const) {
      expect(getStyleDescriptor(id).plannedVersion).toBe('1.4.19');
    }
  });

  it('管线支持集合：新管线 tailwind/unocss/css-modules（T9 起）；legacy React 三方案', () => {
    expect(STYLE_FORMATS_NEW_PIPELINE).toEqual(['tailwind', 'unocss', 'css-modules']);
    expect(STYLE_FORMATS_LEGACY_REACT).toEqual(['tailwind', 'css-modules', 'inline-styles']);
  });

  it('新管线可用值校验通过并原样返回', () => {
    expect(assertStyleFormatSupported('tailwind', STYLE_FORMATS_NEW_PIPELINE, 'zh-CN')).toBe('tailwind');
    expect(assertStyleFormatSupported('unocss', STYLE_FORMATS_NEW_PIPELINE, 'en-US')).toBe('unocss');
    expect(assertStyleFormatSupported('inline-styles', STYLE_FORMATS_LEGACY_REACT, 'zh-CN')).toBe('inline-styles');
  });

  it('planned 值在新管线抛中英双语错误，消息含计划版本与可用列表', () => {
    const zh = () => assertStyleFormatSupported('styled', STYLE_FORMATS_NEW_PIPELINE, 'zh-CN');
    const en = () => assertStyleFormatSupported('styled', STYLE_FORMATS_NEW_PIPELINE, 'en-US');
    expect(zh).toThrow(UnsupportedStyleFormatError);
    expect(zh).toThrow(/styled/);
    expect(zh).toThrow(/1\.4\.19/);
    expect(zh).toThrow(/tailwind/);
    const err = catchError(zh);
    expect(err).toBeInstanceOf(UnsupportedStyleFormatError);
    expect((err as UnsupportedStyleFormatError).format).toBe('styled');
    // 英文消息结构不同（planned for v...）
    expect(en).toThrow(/planned for v1\.4\.19/i);
    expect(en).not.toThrow(/样式方案/);
  });

  it('已全局可用但当前管线不支持（inline-styles 进新管线）：报管线不支持而非静默降级', () => {
    const fn = () => assertStyleFormatSupported('inline-styles', STYLE_FORMATS_NEW_PIPELINE, 'zh-CN');
    expect(fn).toThrow(UnsupportedStyleFormatError);
    expect(fn).toThrow(/inline-styles/);
    expect(fn).toThrow(/tailwind/);
  });

  it('未知样式值抛未知错误并列出全部合法值', () => {
    const zh = () => assertStyleFormatSupported('bootstrap', STYLE_FORMATS_NEW_PIPELINE, 'zh-CN');
    const en = () => assertStyleFormatSupported('bootstrap', STYLE_FORMATS_NEW_PIPELINE, 'en-US');
    expect(zh).toThrow(/bootstrap/);
    expect(zh).toThrow(/tailwind/);
    expect(en).toThrow(/unknown style format/i);
  });

  it('buildStyleFormatHelp 中英帮助串含全部方案名与状态', () => {
    const zh = buildStyleFormatHelp('zh-CN');
    const en = buildStyleFormatHelp('en-US');
    for (const id of ALL_STYLE_FORMATS) {
      expect(zh).toContain(id);
      expect(en).toContain(id);
    }
    expect(zh).toMatch(/计划/);
    expect(en).toMatch(/planned/i);
    expect(zh).not.toBe(en);
  });
});

/**
 * 执行无参函数捕获抛出值（绕开 expect().toThrow 无法取错误对象的限制）
 *
 * @param fn - 预期抛错的函数
 * @returns 捕获到的错误
 */
function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error('预期函数抛错但未抛出');
}
