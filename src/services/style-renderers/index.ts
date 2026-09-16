/**
 * 样式渲染器子系统桶入口（v1.4.18，T7）
 *
 * @module services/style-renderers
 */

export type {
  Framework,
  NodeStyleResult,
  StyleExtensionNeeded,
  StyleFormat,
  StyleHint,
  StyleLanguage,
  StyleRenderContext,
  StyleRenderer,
  StyleRendererDescriptor,
  StyleRendererStatus,
  StyleSidecarFile,
} from './types.js';
export {
  ALL_STYLE_FORMATS,
  assertStyleFormatSupported,
  buildStyleFormatHelp,
  getStyleDescriptor,
  listStyleFormatsByStatus,
  STYLE_FORMATS_LEGACY_REACT,
  STYLE_FORMATS_NEW_PIPELINE,
  UnsupportedStyleFormatError,
} from './registry.js';
export { CssModulesRenderer, type CssDeclaration, extractCssDeclarations } from './css-modules-renderer.js';
export { AtomicStyleRenderer } from './tailwind-renderer.js';
export { createStyleRenderer, type CreateStyleRendererOptions, type UnocssMode } from './factory.js';
export {
  buildUnocssHints,
  mergeStyleWithExtraTokens,
  partitionAttributifyTokens,
  UNOCSS_ATTRIBUTIFY_SAFE_RE,
  UnocssAttributifyRenderer,
} from './unocss-renderer.js';
