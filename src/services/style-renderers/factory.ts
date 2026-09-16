/**
 * 样式渲染器工厂 - Style Renderer Factory（v1.4.18，T7/T8）
 *
 * 按样式方案 + 渲染选项创建每组件一个的 StyleRenderer：
 * - tailwind：AtomicStyleRenderer（TailwindMapper，1.4.17 等价）；
 * - unocss + wind（默认）：AtomicStyleRenderer + UnoCSS 配置建议；
 * - unocss + attributify：UnocssAttributifyRenderer（class→属性分区）；
 * - css-modules（T9）：CssModulesRenderer（语义类 + 同名 .module.css 旁路 + composes）。
 *
 * 调用方必须先用 {@link assertStyleFormatSupported} 完成管线与状态校验，
 * 本工厂对未实现方案兜底抛错（防御性，正常路径不可达）。
 *
 * @module services/style-renderers/factory
 */

import type { Framework } from '../../types.js';
import { CssModulesRenderer } from './css-modules-renderer.js';
import { AtomicStyleRenderer } from './tailwind-renderer.js';
import { buildUnocssHints, UnocssAttributifyRenderer } from './unocss-renderer.js';
import type { StyleFormat, StyleRenderer } from './types.js';

/** UnoCSS 原子类语法模式（T8） */
export type UnocssMode = 'wind' | 'attributify';

/** createStyleRenderer 选项 */
export interface CreateStyleRendererOptions {
  /** 目标框架（影响 UnoCSS hints，如 React attributify 的 TS shim）；默认 react */
  framework?: Framework;
  /** 仅 unocss 生效：wind（默认，preset-wind 原子类）| attributify（属性化模式） */
  unocssMode?: UnocssMode;
}

/**
 * 按样式方案创建渲染器实例。
 *
 * @param format - 样式方案（预期已过注册表管线校验，为 tailwind | unocss）
 * @param options - 渲染选项
 * @returns 渲染器实例（每组件一个，与旧 createTailwindMapper 生命周期一致）
 */
export function createStyleRenderer(format: StyleFormat, options: CreateStyleRendererOptions = {}): StyleRenderer {
  /** 目标框架（默认 react，与生成器默认一致） */
  const framework: Framework = options.framework ?? 'react';
  if (format === 'tailwind') {
    // unocssMode 对 tailwind 无意义，刻意忽略（hints 保持空）
    return new AtomicStyleRenderer('tailwind', { allowArbitrary: true });
  }
  if (format === 'unocss') {
    if (options.unocssMode === 'attributify') {
      return new UnocssAttributifyRenderer(framework);
    }
    return new AtomicStyleRenderer('unocss', { allowArbitrary: true }, buildUnocssHints('wind', framework));
  }
  if (format === 'css-modules') {
    // framework 对 CSS Modules 渲染透明（框架差异由生成器层 styles.x/$style.x 处理）
    return new CssModulesRenderer();
  }
  throw new Error(
    `Style renderer "${format}" is not implemented in the enhanced pipeline (registry gate should have rejected it earlier)`,
  );
}
