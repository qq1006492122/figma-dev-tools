/**
 * 组件库映射子系统桶入口（WBS-P2-11/12/13）
 *
 * @module services/component-library
 */

export type {
  ComponentLibraryChoice,
  ComponentLibraryDefinition,
  ComponentLibraryId,
  ComponentMatch,
  ComponentRule,
  MatchStats,
  MappableComponent,
  MappedProp,
  NameKeywordRule,
  NodeMatchView,
  ReactComponentLibrary,
  VueComponentLibrary,
} from './types.js';
export {
  ALL_COMPONENT_RULES,
  COMPONENT_LIBRARIES,
  COMPONENT_RULES,
  CONSERVATIVE_MATCH_THRESHOLD,
  needsDangerFlag,
  normalizePropValue,
} from './registry.js';
export { detectReactLibrary, detectVueLibrary, resolveLibrary } from './detect-library.js';
export type { DetectHooks, PackageJsonLike } from './detect-library.js';
export { matchComponent, matchTree, toNodeMatchView } from './matcher.js';
export { renderVuePropAttr } from './vue-template.js';
export { loadProjectComponentLibrary, loadProjectLibraryHints } from './project-discovery.js';
export type { ProjectDiscoverySeams, ProjectLibraryHints } from './project-discovery.js';
