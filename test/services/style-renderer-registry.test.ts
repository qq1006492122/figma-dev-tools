/**
 * 样式渲染器注册表测试（v1.4.18 T7 建立；v1.4.19 T14–T17 翻转为 9 方案新管线）
 *
 * 锁定单一数据源：
 * - 11 值 StyleFormat 全登记，枚举顺序稳定（CLI/MCP/文档共用）；
 * - available / planned 状态与版本路线图；
 * - 管线支持集合（新 React/Vue 管线、legacy React 管线）与框架矩阵；
 * - 未启用/未知值显式抛 i18n 错误，绝不静默错配到 tailwind。
 */
import { describe, expect, it } from 'vitest';

import {
  ALL_STYLE_FORMATS,
  assertStyleFormatSupported,
  buildStyleFormatHelp,
  getStyleDescriptor,
  listStyleFormatsByStatus,
  NEW_PIPELINE_FRAMEWORK_SUPPORT,
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

  it('状态分组：v1.4.19 起 10 项可用（含新管线 6 方案）；css-variables 规划 v1.5.0', () => {
    expect(listStyleFormatsByStatus('available')).toEqual([
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
    ]);
    expect(listStyleFormatsByStatus('planned')).toEqual(['css-variables']);
    expect(getStyleDescriptor('css-variables').plannedVersion).toBe('1.5.0');
    for (const id of ['styled', 'emotion', 'less', 'sass', 'vanilla-extract', 'panda'] as const) {
      expect(getStyleDescriptor(id).status).toBe('available');
      expect(getStyleDescriptor(id).plannedVersion).toBeUndefined();
    }
  });

  it('管线支持集合：v1.4.19 新管线 9 方案；legacy React 三方案', () => {
    expect(STYLE_FORMATS_NEW_PIPELINE).toEqual([
      'tailwind',
      'unocss',
      'css-modules',
      'styled',
      'emotion',
      'less',
      'sass',
      'vanilla-extract',
      'panda',
    ]);
    expect(STYLE_FORMATS_LEGACY_REACT).toEqual(['tailwind', 'css-modules', 'inline-styles']);
  });

  it('新管线可用值校验通过并原样返回', () => {
    expect(assertStyleFormatSupported('tailwind', STYLE_FORMATS_NEW_PIPELINE, 'zh-CN')).toBe('tailwind');
    expect(assertStyleFormatSupported('unocss', STYLE_FORMATS_NEW_PIPELINE, 'en-US')).toBe('unocss');
    expect(assertStyleFormatSupported('inline-styles', STYLE_FORMATS_LEGACY_REACT, 'zh-CN')).toBe('inline-styles');
  });

  it('v1.4.19 框架矩阵：React 专属方案在 Vue 侧抛中英双语错误（TR-14.1 显式拒绝不静默降级）', () => {
    // React 侧：全部 9 方案通过
    for (const id of STYLE_FORMATS_NEW_PIPELINE) {
      expect(assertStyleFormatSupported(id, STYLE_FORMATS_NEW_PIPELINE, 'zh-CN', 'react')).toBe(id);
    }
    // Vue 侧：双框架方案通过
    for (const id of ['tailwind', 'unocss', 'css-modules', 'less', 'sass'] as const) {
      expect(assertStyleFormatSupported(id, STYLE_FORMATS_NEW_PIPELINE, 'en-US', 'vue')).toBe(id);
    }
    const zh = () => assertStyleFormatSupported('styled', STYLE_FORMATS_NEW_PIPELINE, 'zh-CN', 'vue');
    const en = () => assertStyleFormatSupported('panda', STYLE_FORMATS_NEW_PIPELINE, 'en-US', 'vue');
    expect(zh).toThrow(UnsupportedStyleFormatError);
    expect(zh).toThrow(/styled/);
    expect(zh).toThrow(/vue/);
    expect(zh).toThrow(/react/);
    const err = catchError(zh);
    expect(err).toBeInstanceOf(UnsupportedStyleFormatError);
    expect((err as UnsupportedStyleFormatError).format).toBe('styled');
    expect(en).toThrow(/does not support the vue framework/i);
    expect(en).toThrow(/panda/);
    expect(en).not.toThrow(/样式方案/);
  });

  it('框架矩阵数据源：styled/emotion/vanilla-extract/panda 仅 react；less/sass 双框架', () => {
    expect(NEW_PIPELINE_FRAMEWORK_SUPPORT.styled).toEqual(['react']);
    expect(NEW_PIPELINE_FRAMEWORK_SUPPORT.emotion).toEqual(['react']);
    expect(NEW_PIPELINE_FRAMEWORK_SUPPORT['vanilla-extract']).toEqual(['react']);
    expect(NEW_PIPELINE_FRAMEWORK_SUPPORT.panda).toEqual(['react']);
    expect(NEW_PIPELINE_FRAMEWORK_SUPPORT.less).toEqual(['react', 'vue']);
    expect(NEW_PIPELINE_FRAMEWORK_SUPPORT.sass).toEqual(['react', 'vue']);
  });

  it('planned 值在新管线抛中英双语错误，消息含计划版本与可用列表（css-variables v1.5.0）', () => {
    const zh = () => assertStyleFormatSupported('css-variables', STYLE_FORMATS_NEW_PIPELINE, 'zh-CN');
    const en = () => assertStyleFormatSupported('css-variables', STYLE_FORMATS_NEW_PIPELINE, 'en-US');
    expect(zh).toThrow(UnsupportedStyleFormatError);
    expect(zh).toThrow(/css-variables/);
    expect(zh).toThrow(/1\.5\.0/);
    expect(zh).toThrow(/tailwind/);
    const err = catchError(zh);
    expect(err).toBeInstanceOf(UnsupportedStyleFormatError);
    expect((err as UnsupportedStyleFormatError).format).toBe('css-variables');
    expect(en).toThrow(/planned for v1\.5\.0/i);
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
