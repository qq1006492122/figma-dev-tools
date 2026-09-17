/**
 * 样式渲染器工厂 - Style Renderer Factory（v1.4.18，T7/T8；v1.4.19，T14–T17）
 *
 * 按样式方案 + 渲染选项创建每组件一个的 StyleRenderer：
 * - tailwind：AtomicStyleRenderer（TailwindMapper，1.4.17 等价）；
 * - unocss + wind（默认）：AtomicStyleRenderer + UnoCSS 配置建议；
 * - unocss + attributify：UnocssAttributifyRenderer（class→属性分区）；
 * - css-modules（T9）：CssModulesRenderer（语义类 + 同名 .module.css 旁路 + composes）；
 * - styled（T14）：StyledComponentsRenderer（React 专属 styled.x 前导段）；
 * - emotion（T15）：EmotionRenderer（React 专属 css() 常量 + css prop）；
 * - less/sass（T16）：PreprocessorRenderer（变量/mixin/嵌套 .module.less/.scss，React/Vue）；
 * - vanilla-extract（T17）：VanillaExtractRenderer（React 专属 .css.ts 旁路）；
 * - panda（T17）：PandaRenderer（React 专属 css() 常量）。
 *
 * 调用方必须先用 {@link assertStyleFormatSupported} 完成管线/框架/状态校验，
 * 本工厂对未实现方案兜底抛错（防御性，正常路径不可达）。
 *
 * @module services/style-renderers/factory
 */

import type { Framework } from '../../types.js';
import { CssModulesRenderer } from './css-modules-renderer.js';
import { EmotionRenderer } from './emotion-renderer.js';
import { PandaRenderer } from './panda-renderer.js';
import { PreprocessorRenderer } from './preprocessor-renderer.js';
import { StyledComponentsRenderer } from './styled-components-renderer.js';
import { AtomicStyleRenderer } from './tailwind-renderer.js';
import { buildUnocssHints, UnocssAttributifyRenderer } from './unocss-renderer.js';
import { VanillaExtractRenderer } from './vanilla-extract-renderer.js';
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
  // v1.4.19 T14–T17：六个新方案（框架矩阵已由注册表断言拦截 React 专属方案进入 Vue）
  if (format === 'styled') {
    return new StyledComponentsRenderer();
  }
  if (format === 'emotion') {
    return new EmotionRenderer();
  }
  if (format === 'less') {
    return new PreprocessorRenderer('less');
  }
  if (format === 'sass') {
    return new PreprocessorRenderer('scss');
  }
  if (format === 'vanilla-extract') {
    return new VanillaExtractRenderer();
  }
  if (format === 'panda') {
    return new PandaRenderer();
  }
  throw new Error(
    `Style renderer "${format}" is not implemented in the enhanced pipeline (registry gate should have rejected it earlier)`,
  );
}
