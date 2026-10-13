/**
 * 样式渲染器子系统桶入口（v1.4.18，T7）
 *
 * @module services/style-renderers
 */

export type {
  ClassBindingKind,
  Framework,
  NodeStyleResult,
  StyleExtensionNeeded,
  StyleFormat,
  StyleHint,
  StyleLanguage,
  StylePreamble,
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
  NEW_PIPELINE_FRAMEWORK_SUPPORT,
  STYLE_FORMATS_LEGACY_REACT,
  STYLE_FORMATS_NEW_PIPELINE,
  UnsupportedStyleFormatError,
} from './registry.js';
export { CssModulesRenderer, type CssDeclaration, extractCssDeclarations, nodeNameToClass } from './css-modules-renderer.js';
export { AtomicStyleRenderer } from './tailwind-renderer.js';
export { createStyleRenderer, type CreateStyleRendererOptions, type UnocssMode } from './factory.js';
export {
  buildUnocssHints,
  mergeStyleWithExtraTokens,
  partitionAttributifyTokens,
  UNOCSS_ATTRIBUTIFY_SAFE_RE,
  UnocssAttributifyRenderer,
} from './unocss-renderer.js';
export { StyledComponentsRenderer } from './styled-components-renderer.js';
export { EmotionRenderer } from './emotion-renderer.js';
export { PreprocessorRenderer, type PreprocessorSyntax } from './preprocessor-renderer.js';
export { VanillaExtractRenderer } from './vanilla-extract-renderer.js';
export { PandaRenderer } from './panda-renderer.js';
export {
  buildCssVariableName,
  buildRootVariableBlock,
  CSS_VARIABLE_PREFIX,
  CSS_VARIABLES_PLANNED_VERSION,
  CssVariablesRenderer,
  mapValueToCssVariable,
  parseCssVariableName,
  toKebabSegment,
  type CssTokenCategory,
  type CssTokenDefinition,
  type CssVariableMatch,
} from './css-variables-renderer.js';
export {
  collectUnsupportedFillWarnings,
  declarationsToObjectEntries,
  resolveHtmlTag,
  toCamelIdentifier,
  toPascalIdentifier,
} from './shared.js';
