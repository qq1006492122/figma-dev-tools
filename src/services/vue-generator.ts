/**
 * Vue 代码生成服务 - Vue Generator
 *
 * 核心职责：将 Figma 节点转换为 Vue 单文件组件（SFC）：
 * - vueVersion=3（默认）：<script setup lang="ts"> + Template + Tailwind CSS/UnoCSS；
 * - vueVersion=2（v1.4.19 T18）：Options API SFC（defineComponent + props/data/computed/methods）。
 *
 * @module
 */

import type { DesignContext, ProcessedNode } from '../types/nodes.js';
import type { SmartInferenceSwitches } from '../types.js';
import { escapeAttribute, sanitizeIdentifier, sanitizeText } from '../utils/security.js';
import { getToolVersion } from '../utils/version.js';
import { createA11yEnhancer } from './a11y-enhancer.js';
import { formatCode } from './code-formatter.js';
import type { EnhancementReports } from './code-generator.js';
import { createDesignSystemAnalyzer } from './design-system.js';
import type { FigmaClient } from './figma-client.js';
import { createFlexFixer } from './flex-fixer.js';
import { createResponsiveInferrer } from './responsive-inferrer.js';
import {
  createSemanticInferrer,
  formatSemanticComments,
} from './semantic-inferrer.js';
import { createSmartInferrer, formatSmartInferenceComments } from './smart-inferrer.js';
import { SvgInlineRenderer, isVectorNode } from './svg-inline-renderer.js';
import {
  assertStyleFormatSupported,
  createStyleRenderer,
  partitionAttributifyTokens,
  STYLE_FORMATS_NEW_PIPELINE,
  type StyleExtensionNeeded,
  type StyleFormat,
  type StyleHint,
  type StyleRenderer,
  type StyleSidecarFile,
  type UnocssMode,
} from './style-renderers/index.js';
import { normalizeAssetUrlPath, planAssetReference, toAssetVarName, type BundlerKind } from './asset-paths.js';
import {
  generateVue2Props,
  generateVue3Props,
  type GeneratedVue2Props,
  type GeneratedVue3Props,
} from './props-type-generator.js';
import {
  COMPONENT_LIBRARIES,
  matchComponent,
  renderVuePropAttr,
  resolveLibrary,
  type ComponentLibraryChoice,
  type ComponentLibraryId,
  type ComponentMatch,
  type PackageJsonLike,
} from './component-library/index.js';

// ============ 类型定义 ============

export interface VueCodeGenOptions {
  componentName?: string;
  typescript?: boolean;
  /** 样式方案（v1.4.18 T7：StyleFormat 11 值联合，新管线 tailwind/unocss/css-modules/less/sass） */
  styleFormat?: StyleFormat;
  /** UnoCSS 模式（v1.4.18 T8，仅 styleFormat=unocss 生效）：wind（默认）| attributify */
  unocssMode?: UnocssMode;
  sceneName?: string;
  usePublicCdn?: boolean;
  /** 目标构建器（v1.4.18）：默认 none，模板资源引用与 1.4.17 一致 */
  bundler?: BundlerKind;
  skipEnhancements?: boolean;
  /** v1.4.19 T21：智能推断分项开关（缺省全开，skipEnhancements 为总闸） */
  inference?: SmartInferenceSwitches;
  /** Vue 大版本（v1.4.19 T18）：3（默认，<script setup>）| 2（Options API SFC） */
  vueVersion?: 2 | 3;
  /**
   * WBS-P2-13：组件库选择。'auto' 按 projectPackageJson 真实依赖检测，
   * 'none'（默认）保持原生标签；显式库 id 不做依赖拦截（跨框架选择显式报错）。
   */
  componentLibrary?: ComponentLibraryChoice;
  /** auto 检测用的最近 package.json（CLI 读盘后传入；MCP 无 fs 可不传） */
  projectPackageJson?: PackageJsonLike | null;
}

export interface GeneratedVueComponent {
  code: string;
  componentName: string;
  pendingAssets: Array<{ nodeId: string; name: string; type: string }>;
  extensionsNeeded: StyleExtensionNeeded[];
  warnings: string[];
  reports: EnhancementReports;
  imports: string[];
  /** 样式方案配置建议（v1.4.18 T8，UnoCSS 非空；仅建议，不写入用户项目） */
  styleHints: StyleHint[];
  /** 同名旁路样式文件（css-modules/less/sass：${componentName}.module.*） */
  styleSidecar?: StyleSidecarFile;
  /** 实际采用的 Vue 大版本（v1.4.19 T18，供调用方标注产物） */
  vueVersion: 2 | 3;
}

/**
 * Vue 模板节点渲染上下文（内部类型）
 */
interface VueRenderContext {
  depth: number;
  extensions: StyleExtensionNeeded[];
  pendingAssets: Array<{ nodeId: string; name: string; type: string }>;
  warnings: string[];
  usePublicCdn: boolean;
  /** 目标构建器（v1.4.18，决定图片资源引用形态） */
  bundler: BundlerKind;
  /** 脚本区 import 集合（ESM 资源引用回传到 script 区） */
  imports: Set<string>;
  sceneName: string;
  fileKey: string;
  svgRenderer: SvgInlineRenderer;
  /** 当前组件名（v1.4.19 T14：渲染器上下文） */
  componentName: string;
  /** 父级节点在样式渲染器中注册的类名（v1.4.19 T16：Less/Sass 嵌套归属） */
  parentStyleIdentifier?: string;
  /**
   * WBS-P2-13：已解析的组件库 id（null=关闭组件映射，全部原生标签）。
   * 由 generateFromContext 按 componentLibrary + package.json 依赖解析一次。
   */
  componentLibrary: ComponentLibraryId | null;
  /** 组件库 import 收集：包名 → 命名导入集合（element-plus/ant-design-vue 均为单包聚合） */
  uiImports: Map<string, Set<string>>;
}

const DEFAULT_VUE_OPTIONS: Required<VueCodeGenOptions> = {
  componentName: 'Component',
  typescript: true,
  styleFormat: 'tailwind',
  unocssMode: 'wind',
  sceneName: '',
  usePublicCdn: true,
  bundler: 'none',
  skipEnhancements: false,
  inference: {},
  vueVersion: 3,
  componentLibrary: 'none',
  projectPackageJson: null,
};

// ============ 组件库映射（WBS-P2-13） ============

/** 结构需手工调整的组件（容器/组合式），替换标签时必须给警告 */
const VUE_COMPOSITION_WARNING_COMPONENTS = new Set(['dialog', 'tabs', 'avatar']);

/**
 * 注册一次匹配到的组件 import（主组件 + 组合式子组件）。
 * element-plus / ant-design-vue 均为单包命名导入：
 * `import { ElButton, ElInput } from 'element-plus'`；
 * `<script setup>` 中导入即自动可用，Vue2 Options API 另需 components 注册。
 */
function registerVueUiImport(
  uiImports: Map<string, Set<string>>,
  library: ComponentLibraryId,
  match: ComponentMatch,
): void {
  const pkg = COMPONENT_LIBRARIES[library].packageName;
  let set = uiImports.get(pkg);
  if (!set) {
    set = new Set<string>();
    uiImports.set(pkg, set);
  }
  set.add(match.templateName ?? match.importName);
  for (const sub of match.subImports) set.add(sub);
}

// ============ VueGenerator 类 ============

export class VueGenerator {
  private readonly _client: FigmaClient;
  private readonly _svgRenderer: SvgInlineRenderer;
  private _options: Required<VueCodeGenOptions>;

  constructor(client: FigmaClient, options: Partial<VueCodeGenOptions> = {}) {
    this._client = client;
    // 显式兜底：options.bundler === undefined 时 spread 会覆盖默认值，
    // 进而使 planAssetReference 的 switch 运行时落空
    this._options = { ...DEFAULT_VUE_OPTIONS, ...options, bundler: options.bundler ?? 'none' };
    this._svgRenderer = new SvgInlineRenderer(client, {
      inline: true,
      scale: 1,
      optimize: true,
      currentColor: true,
    });
  }

  async generateFromContext(
    context: DesignContext,
    options: Partial<VueCodeGenOptions> = {},
  ): Promise<GeneratedVueComponent> {
    const opts = { ...this._options, ...options };
    // 使用安全标识符处理（XSS 防护 v1.4.0）
    const componentName = opts.componentName || sanitizeIdentifier(context.node.name || 'MyComponent');

    const a11yEnhancer = createA11yEnhancer();
    const flexFixer = createFlexFixer();
    const designSystem = createDesignSystemAnalyzer();
    const responsiveInferrer = createResponsiveInferrer();
    // v1.4.18（T7/T8）：样式方案注册表校验 + 渲染器工厂（tailwind/unocss 共用原子类映射；attributify 属性化）
    // v1.4.19 T14–T17：追加框架矩阵校验（styled/emotion/vanilla-extract/panda 仅 React，Vue 选择时显式抛错不降级）
    assertStyleFormatSupported(opts.styleFormat ?? 'tailwind', STYLE_FORMATS_NEW_PIPELINE, undefined, 'vue');
    const styleRenderer = createStyleRenderer(opts.styleFormat ?? 'tailwind', {
      framework: 'vue',
      unocssMode: opts.unocssMode ?? 'wind',
    });

    const reports: EnhancementReports = {};
    const extensionsNeeded: StyleExtensionNeeded[] = [];
    const pendingAssets: Array<{ nodeId: string; name: string; type: string }> = [];
    const warnings: string[] = [];
    const imports = new Set<string>();

    // WBS-P2-13：组件库解析（auto 必须有真实依赖证据；无证据/显式 none → 原生标签）
    const resolvedComponentLibrary = resolveLibrary(
      'vue',
      options.componentLibrary ?? 'none',
      options.projectPackageJson ?? null,
    );
    const uiImports = new Map<string, Set<string>>();
    if (options.componentLibrary === 'auto' && !resolvedComponentLibrary) {
      warnings.push(
        'componentLibrary=auto 未检测到 element-plus/ant-design-vue 依赖，已降级为原生标签（显式指定 componentLibrary 可覆盖）',
      );
    }

    // 透传 design-context 层的警告（如陈旧缓存降级）
    if (context.warnings && context.warnings.length > 0) {
      warnings.push(...context.warnings);
    }

    if (!opts.skipEnhancements) {
      reports.flexFixes = flexFixer.applyFixes(context.node);
      reports.a11y = a11yEnhancer.enhance(context.node);
      reports.designSystem = designSystem.analyze(context);
      reports.responsive = responsiveInferrer.infer(context);
      // v1.4.19 T21：智能推断（布局/图标/主题/动效，只建议不改写显式样式）
      reports.smartInference = createSmartInferrer().infer(context.node, {
        framework: 'vue',
        switches: opts.inference,
      });
      // v1.4.19 T22：语义推断（列表数据化示例 + 语义命名，仅输出建议）
      reports.semantic = createSemanticInferrer().infer(context.node, {
        framework: 'vue',
      });
    }

    const templateContent = await this._renderNode(
      context.node,
      styleRenderer,
      {
        depth: 1,
        extensions: extensionsNeeded,
        pendingAssets,
        warnings,
        usePublicCdn: opts.usePublicCdn !== false,
        bundler: opts.bundler ?? 'none',
        imports,
        sceneName: opts.sceneName || '',
        fileKey: context.fileKey,
        svgRenderer: this._svgRenderer,
        componentName,
        componentLibrary: resolvedComponentLibrary,
        uiImports,
      },
      true,
    );

    // 仅当模板实际出现 publicCdnUrl() 调用时才导入（v1.4.18：非 none 构建器不产出该调用）
    if (templateContent.includes('publicCdnUrl')) {
      imports.add("import { publicCdnUrl } from '@/lib/asset-path';");
    }

    // WBS-P2-13：组件库 import 收口（element-plus / ant-design-vue 单包聚合）
    const uiComponentNames: string[] = [];
    for (const [pkg, names] of uiImports) {
      const nameList = [...names];
      imports.add(`import { ${nameList.join(', ')} } from '${pkg}';`);
      uiComponentNames.push(...nameList);
    }

    // 样式旁路文件（v1.4.18 T9 css-modules；v1.4.19 T16 less/sass；vanilla-extract 不支持 Vue 已在校验闸被拒）
    const styleSidecar = styleRenderer.buildSidecar ? styleRenderer.buildSidecar(componentName) : undefined;

    // v1.4.18 T10：Component Properties → Props 类型推导
    // v1.4.19 T18：按 vueVersion 分流 Vue3 script setup / Vue2 Options API（模板与增强链完全一致）
    const vueVersion: 2 | 3 = opts.vueVersion === 2 ? 2 : 3;
    // v1.4.19 T21：智能推断以脚本头注释形式留痕；关开关（含 skipEnhancements）为空数组
    const smartCommentLines = reports.smartInference ? formatSmartInferenceComments(reports.smartInference) : [];
    // v1.4.19 T22：列表数据化/命名建议同样以脚本头注释留痕（slash 风格）
    const semanticCommentLines = reports.semantic ? formatSemanticComments(reports.semantic, 'slash') : [];
    const advisoryCommentLines = [...smartCommentLines, ...semanticCommentLines];
    let scriptBlock: string;
    if (vueVersion === 2) {
      const vue2Props = generateVue2Props(context.node.componentProperties ?? [], {
        typescript: opts.typescript,
      });
      scriptBlock = this._generateOptionsApiScript(
        componentName,
        opts.typescript,
        Array.from(imports),
        vue2Props,
        advisoryCommentLines,
        uiComponentNames,
      );
    } else {
      const generatedProps = generateVue3Props(context.node.componentProperties ?? [], {
        typescript: opts.typescript,
      });
      if (opts.typescript && generatedProps.needsComponentImport) {
        imports.add("import type { Component } from 'vue';");
      }
      scriptBlock = this._generateScriptSetup(
        componentName,
        opts.typescript,
        Array.from(imports),
        generatedProps,
        advisoryCommentLines,
      );
    }
    const template = `<template>\n${templateContent}\n</template>`;
    const style = this._generateStyle(styleSidecar);

    const lines: string[] = [];
    lines.push(template);
    lines.push('');
    lines.push('<!--');
    lines.push(' TODOs:');
    lines.push(' - 添加交互逻辑（@click、表单提交等）');
    lines.push(' - 根据需要拆分组件');
    lines.push(' - 补充 Props/Emits 类型定义');
    lines.push('-->');
    lines.push('');
    lines.push(scriptBlock);
    lines.push('');
    lines.push(style);
    lines.push('');

    // 去重 extensionsNeeded（按 type:originalValue 唯一键）
    const extSeen = new Set<string>();
    const dedupedExtensions = extensionsNeeded.filter((ext) => {
      const key = `${ext.type}:${ext.originalValue}`;
      if (extSeen.has(key)) return false;
      extSeen.add(key);
      return true;
    });

    // 去重 pendingAssets（按 nodeId）
    const assetSeen = new Set<string>();
    const dedupedAssets = pendingAssets.filter((a) => {
      if (assetSeen.has(a.nodeId)) return false;
      assetSeen.add(a.nodeId);
      return true;
    });

    const rawCode = lines.join('\n');
    const formattedCode = await formatCode(rawCode, { filePath: `${componentName}.vue` });

    return {
      code: formattedCode,
      componentName,
      pendingAssets: dedupedAssets,
      extensionsNeeded: dedupedExtensions,
      warnings: Array.from(new Set(warnings)),
      reports,
      imports: Array.from(imports),
      styleHints: [...(styleRenderer.hints ?? [])],
      styleSidecar,
      vueVersion,
    };
  }

  private async _renderNode(
    node: ProcessedNode,
    styleRenderer: StyleRenderer,
    ctx: VueRenderContext,
    isRoot = false,
  ): Promise<string> {
    if (node.visible === false) return '';

    const baseIndent = isRoot ? 2 : ctx.depth + 1;
    const indent = '  '.repeat(baseIndent);

    // 类型增强：安全访问 a11y-enhancer 和 flex-fixer 添加的扩展字段
    const nodeEnhancements = node as ProcessedNode & {
      _a11y?: {
        className?: string;
        semanticTag?: string;
        isDecorative?: boolean;
        altText?: string;
        ariaLabel?: string;
        ariaHidden?: boolean;
        role?: string;
        isButton?: boolean;
      };
      _flexFixes?: string[];
    };

    // ============ SVG 矢量/图标节点 → 尝试内联 SVG 渲染（v1.4.0 新增） ============
    if (isVectorNode(node)) {
      const svgResult = await this._tryRenderInlineSvg(node, ctx);
      if (svgResult) {
        // SVG 内联成功，直接返回 Vue SVG 代码
        return `${indent}${svgResult.vueCode}`;
      }
      // 失败时回退到普通渲染
    }

    if (
      !isRoot &&
      (node.role === 'layout-only' || node.originalType === 'GROUP') &&
      node.children &&
      node.children.length > 0
    ) {
      const childResults = await Promise.all(
        node.children.map((child) => this._renderNode(child, styleRenderer, { ...ctx, depth: ctx.depth }, false)),
      );
      return childResults.filter(Boolean).join('\n');
    }

    if (node.role === 'reusable-component' && node.componentKey) {
      const compName = sanitizeIdentifier(node.name || 'CustomComponent');
      return `${indent}<!-- TODO: 引入并使用项目组件 ${compName} -->\n${indent}<${compName} />`;
    }

    const mapping = styleRenderer.renderNode(node, {
      framework: 'vue',
      componentName: ctx.componentName,
      isRoot,
      parentIdentifier: ctx.parentStyleIdentifier,
    });
    ctx.extensions.push(...(mapping.extensionsNeeded || []));

    // 收集 Tailwind 映射警告（去重后添加到上下文）
    if (mapping.warnings && mapping.warnings.length > 0) {
      for (const w of mapping.warnings) {
        const warningWithNode = `[${node.name || node.figmaId}] ${w}`;
        if (!ctx.warnings.includes(warningWithNode)) {
          ctx.warnings.push(warningWithNode);
        }
      }
    }

    // 合并 a11y-enhancer 和 flex-fixer 添加的类名
    const extraTokens: string[] = [];
    if (nodeEnhancements._a11y?.className) extraTokens.push(nodeEnhancements._a11y.className);
    if (Array.isArray(nodeEnhancements._flexFixes)) {
      extraTokens.push(...nodeEnhancements._flexFixes);
    }

    // v1.4.18 T9 / v1.4.19 T16：css-module 绑定（css-modules/less/sass）渲染器产出语义本地类名（$style.x），
    // a11y/flexFixes 补丁都是 Tailwind 原子类，合入会引入未声明 token，故整体跳过；
    // attributify 属性化也不适用于模块类。
    const isCssModuleBinding = styleRenderer.classBinding === 'css-module';

    // v1.4.18 T8：attributify 模式下安全 token 分流为无值模板属性；
    // 注意渲染器已做过一次分区（attributes + 回退 className），
    // 这里必须把 attributes 的 token 一并放回再与 extraTokens 统一重分区，
    // 否则只对回退 class 再分区会把安全 token 整体丢弃。
    let className: string;
    let attributifyAttrs: string[] = [];
    if (isCssModuleBinding) {
      className = mapping.className;
    } else if (mapping.attributes !== undefined) {
      const existingAttrTokens = mapping.attributes.map((attr) => attr.name);
      const partition = partitionAttributifyTokens(
        [...existingAttrTokens, mapping.className, ...extraTokens].filter(Boolean).join(' '),
      );
      className = partition.fallbackClassName;
      attributifyAttrs = partition.attributeNames;
    } else {
      className = [mapping.className, ...extraTokens].filter(Boolean).join(' ');
    }

    /** 输出 class 属性：css-module 绑定走 $style 动态绑定（kebab 本地名必须方括号访问），其余走静态 class */
    const buildClassAttr = (value: string): string =>
      isCssModuleBinding ? `:class="$style['${value}']"` : `class="${value}"`;

    let tag = this._selectTag(node);

    // WBS-P2-13：组件库映射（保守门控，未命中保持原生标签）
    const uiMatch = ctx.componentLibrary ? matchComponent(node, ctx.componentLibrary) : null;
    if (uiMatch && ctx.componentLibrary) {
      tag = uiMatch.templateName ?? uiMatch.tagName ?? uiMatch.importName;
      registerVueUiImport(ctx.uiImports, ctx.componentLibrary, uiMatch);
      for (const advice of uiMatch.compositionAdvice ?? []) {
        const warning = `[${node.name || node.figmaId}] ${uiMatch.tagName ?? uiMatch.importName}: ${advice}`;
        if (!ctx.warnings.includes(warning)) ctx.warnings.push(warning);
      }
      if (VUE_COMPOSITION_WARNING_COMPONENTS.has(uiMatch.component)) {
        const structural = `[${node.name || node.figmaId}] ${tag} 结构与原生素材不同（${uiMatch.component} 子结构/受控状态/src 绑定），已替换容器标签，请按组件库文档手工调整子节点结构`;
        if (!ctx.warnings.includes(structural)) ctx.warnings.push(structural);
      }
    }

    // 文本节点（XSS 防护：清理文本内容）
    if (node.originalType === 'TEXT' || node.role === 'text') {
      const rawText = node.textContent || '';
      const textContent = sanitizeText(rawText);
      // UnoCSS attributify（v1.4.18 T8）：安全 token 以无值模板属性输出
      const textAttrs: string[] = [];
      if (className) textAttrs.push(buildClassAttr(className));
      textAttrs.push(...attributifyAttrs);
      const textAttrStr = textAttrs.length > 0 ? ' ' + textAttrs.join(' ') : '';
      return `${indent}<${tag}${textAttrStr}>${textContent}</${tag}>`;
    }

    // ============ 图片节点特殊处理（增强版 v1.4.0；组件映射后交由 Avatar 等组件处理） ============
    const isImageNode =
      !uiMatch &&
      ((node.originalType === 'RECTANGLE' && node.fills?.some((f) => f.type === 'image')) || node.asset || tag === 'img');

    if (isImageNode) {
      const attrs: string[] = [];

      // v1.4.18 T9 / v1.4.19 T16：css-module 绑定没有原子工具类，object-fit:cover 以内联样式兜底；
      // 其余管线继续追加 object-cover 原子类
      let imgClassName = className || '';
      if (isCssModuleBinding) {
        if (imgClassName) attrs.push(buildClassAttr(imgClassName));
        attrs.push('style="object-fit: cover;"');
      } else {
        // object-cover 类
        if (imgClassName && !imgClassName.includes('object-')) {
          imgClassName = `${imgClassName} object-cover`;
        } else if (!imgClassName) {
          imgClassName = 'object-cover';
        }
        // UnoCSS attributify（v1.4.18 T8）：object-cover 等安全 token 同样分流为属性
        let imgAttributify = attributifyAttrs;
        if (imgAttributify.length > 0) {
          const imgPartition = partitionAttributifyTokens(imgClassName);
          imgClassName = imgPartition.fallbackClassName;
          imgAttributify = Array.from(new Set([...imgAttributify, ...imgPartition.attributeNames]));
        }
        if (imgClassName) attrs.push(`class="${imgClassName}"`);
        attrs.push(...imgAttributify);
      }

      // alt 文本（优先使用 a11y-enhancer 生成的，XSS 防护）
      let altText = node.name || '';
      let isDecorative = false;
      if (nodeEnhancements._a11y) {
        if (nodeEnhancements._a11y.isDecorative) {
          altText = '';
          isDecorative = true;
        } else if (nodeEnhancements._a11y.altText !== undefined) {
          altText = nodeEnhancements._a11y.altText;
        }
      }
      // 清理并转义 alt 文本，防止 XSS
      const safeAltText = altText ? escapeAttribute(sanitizeText(altText)) : '';
      attrs.push(`alt="${safeAltText}"`);

      // 装饰性图片使用 aria-hidden
      if (isDecorative || nodeEnhancements._a11y?.ariaHidden) {
        attrs.push('aria-hidden="true"');
      }

      // 懒加载：非首屏图片默认懒加载，根节点或大尺寸图片使用 eager
      const nodeWidth = node.size?.width ?? 0;
      const nodeHeight = node.size?.height ?? 0;
      const isLikelyHero = isRoot || nodeWidth >= 800;
      attrs.push(`loading="${isLikelyHero ? 'eager' : 'lazy'}"`);

      // 异步解码，不阻塞主线程
      attrs.push('decoding="async"');

      // 图片尺寸提示：防止 CLS
      if (nodeWidth > 0 && nodeHeight > 0) {
        attrs.push(`width="${Math.round(nodeWidth)}"`);
        attrs.push(`height="${Math.round(nodeHeight)}"`);
      }

      // 资源优先级：Hero 图片高优先级
      if (isLikelyHero) {
        attrs.push('fetchpriority="high"');
      }

      // src 处理（v1.4.18：按 ctx.bundler 规划引用；none 与 1.4.17 逐字节一致）
      if ((node.asset?.cdnUrl || node.asset?.localPath) && ctx.usePublicCdn) {
        const assetUrlRaw = node.asset.cdnUrl ?? node.asset.localPath ?? '';
        const urlPath = normalizeAssetUrlPath(assetUrlRaw);
        const plannedAsset = planAssetReference({
          bundler: ctx.bundler,
          urlPath,
          varName: toAssetVarName(urlPath),
        });
        for (const assetImport of plannedAsset.imports) {
          ctx.imports.add(assetImport);
        }
        attrs.push(`:src="${plannedAsset.expression}"`);
      } else {
        ctx.pendingAssets.push({
          nodeId: node.figmaId || node.id,
          name: this._kebabCase(node.name || 'image') + '.png',
          type: 'image',
        });
        // 1x1 透明 GIF data URI，避免 src="" 产生额外请求
        const transparentGif = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        attrs.push(`src="${transparentGif}"`);
      }

      return `${indent}<img ${attrs.join(' ')} />`;
    }

    const attrs: string[] = [];
    if (className) attrs.push(buildClassAttr(className));
    // UnoCSS attributify（v1.4.18 T8）：安全 token 以无值模板属性输出
    attrs.push(...attributifyAttrs);

    // aria-label（XSS 防护）
    if (nodeEnhancements._a11y?.ariaLabel) {
      const safeLabel = escapeAttribute(sanitizeText(nodeEnhancements._a11y.ariaLabel));
      attrs.push(`aria-label="${safeLabel}"`);
    }
    if (nodeEnhancements._a11y?.ariaHidden) {
      attrs.push('aria-hidden="true"');
    }
    if (nodeEnhancements._a11y?.role && nodeEnhancements._a11y.role !== tag) {
      attrs.push(`role="${escapeAttribute(nodeEnhancements._a11y.role)}"`);
    }
    // 组件库 Button 的 type 是 variant 口径（primary/default…），不能注入原生 type=button
    if (!uiMatch && (tag === 'button' || nodeEnhancements._a11y?.isButton)) attrs.push('type="button"');

    // 图标节点默认 aria-hidden
    if (node.role === 'icon' && !nodeEnhancements._a11y?.ariaHidden && !nodeEnhancements._a11y?.ariaLabel) {
      attrs.push('aria-hidden="true"');
    }

    if (mapping.inlineStyle && Object.keys(mapping.inlineStyle).length > 0) {
      const styleEntries = Object.entries(mapping.inlineStyle)
        .map(([k, v]) => {
          // Vue style 使用 kebab-case
          const kebabKey = k.replace(/([A-Z])/g, '-$1').toLowerCase();
          return `'${kebabKey}': ${typeof v === 'number' ? v : JSON.stringify(v)}`;
        })
        .join(', ');
      attrs.push(`:style="{ ${styleEntries} }"`);
    }

    // WBS-P2-13：组件库 Props 注入（Vue 模板属性口径；无法静态输出的运行时 prop 由结构警告覆盖）
    if (uiMatch && ctx.componentLibrary) {
      for (const prop of uiMatch.props) {
        const attr = renderVuePropAttr(ctx.componentLibrary, uiMatch.component, prop);
        if (attr) attrs.push(attr);
      }
    }

    const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';

    // WBS-P2-13：组件库叶子组件（Button/Badge 等）仅含文本子节点时，
    // 文案直接内联为插槽内容（<el-button type="primary">Save</el-button>），
    // 避免文本被 <p>/<span> 包裹而不符合组件库用法
    if (
      uiMatch &&
      node.children &&
      node.children.length > 0 &&
      node.children.every((c) => c.role === 'text' || c.originalType === 'TEXT')
    ) {
      const textContent = node.children
        .map((c) => (c.textContent ? sanitizeText(c.textContent) : ''))
        .join('');
      if (textContent) {
        return `${indent}<${tag}${attrStr}>${textContent}</${tag}>`;
      }
    }

    let children = '';
    if (node.children && node.children.length > 0) {
      // v1.4.19 T16：向子节点传递当前样式归属（Less/Sass 嵌套输出；其他渲染器忽略）
      const childCtx: VueRenderContext = {
        ...ctx,
        depth: ctx.depth + 1,
        parentStyleIdentifier: mapping.className || undefined,
      };
      const childResults = await Promise.all(
        node.children.map((child) => this._renderNode(child, styleRenderer, childCtx, false)),
      );
      children = childResults.filter(Boolean).join('\n');
    }

    if (children) {
      return `${indent}<${tag}${attrStr}>\n${children}\n${indent}</${tag}>`;
    }
    return `${indent}<${tag}${attrStr} />`;
  }

  /**
   * 尝试渲染节点为内联 SVG（Vue 版本，v1.4.0 新增）
   */
  private async _tryRenderInlineSvg(node: ProcessedNode, ctx: VueRenderContext): Promise<{ vueCode: string } | null> {
    try {
      if (this._hasNonVectorDescendants(node)) {
        return null;
      }

      const result = await ctx.svgRenderer.renderNode(ctx.fileKey, node.figmaId, node.name, {
        inline: true,
        scale: 1,
        optimize: true,
        currentColor: node.role === 'icon',
      });

      return result ? { vueCode: result.vueCode } : null;
    } catch {
      return null;
    }
  }

  /**
   * 检查节点是否包含非矢量子节点
   */
  private _hasNonVectorDescendants(node: ProcessedNode): boolean {
    if (!node.children || node.children.length === 0) return false;

    for (const child of node.children) {
      if (child.role === 'text' || child.originalType === 'TEXT') return true;
      if (child.role === 'image') return true;
      if (child.fills?.some((f) => f.type === 'image')) return true;
      if (this._hasNonVectorDescendants(child)) return true;
    }

    return false;
  }

  private _selectTag(node: ProcessedNode): string {
    // 优先使用 a11y-enhancer 推荐的语义标签
    const nodeWithA11y = node as ProcessedNode & {
      _a11y?: { semanticTag?: string };
    };
    if (nodeWithA11y._a11y?.semanticTag) return nodeWithA11y._a11y.semanticTag;
    const name = (node.name || '').toLowerCase();

    if (name.includes('button') || node.role === 'button') return 'button';
    if (name.includes('img') || name.includes('image')) return 'img';
    if (name.includes('heading') || name.includes('title')) {
      if (name.includes('h1')) return 'h1';
      if (name.includes('h2')) return 'h2';
      if (name.includes('h3')) return 'h3';
      return 'h2';
    }
    if (name.includes('paragraph') || name.includes('text') || node.role === 'text') return 'p';
    if (name.includes('link')) return 'a';
    if (name.includes('input')) return 'input';
    if (name.includes('nav')) return 'nav';
    if (name.includes('header')) return 'header';
    if (name.includes('footer')) return 'footer';
    if (name.includes('main')) return 'main';
    if (name.includes('section') || name.includes('card')) return 'section';
    if (name.includes('list') && !name.includes('listitem')) return 'ul';
    if (name.includes('listitem') || name.includes('item')) return 'li';
    if (node.role === 'icon' || name.includes('icon')) return 'span';

    return 'div';
  }

  private _generateScriptSetup(
    componentName: string,
    useTs: boolean,
    imports: string[],
    generatedProps: GeneratedVue3Props,
    smartCommentLines: string[] = [],
  ): string {
    const lang = useTs ? ' lang="ts"' : '';
    const lines: string[] = [];

    lines.push(`<script setup${lang}>`);
    lines.push(`// ${componentName} - Generated by figma-dev-tools v${getToolVersion()}`);
    if (smartCommentLines.length > 0) {
      lines.push(...smartCommentLines);
    }
    lines.push('');

    if (imports.length > 0) {
      lines.push(...imports);
      lines.push('');
    }

    if (useTs) {
      // v1.4.18 T10：interface Props 由 Component Properties 推导（无业务属性时仅保留 class 契约）
      lines.push(generatedProps.interfaceBlock);
      lines.push('');
      lines.push(`const props = withDefaults(defineProps<Props>(), {`);
      // 服务返回的条目不含尾逗号，由生成器统一补齐（否则对象字面量非法，Prettier 静默回退）
      lines.push(...generatedProps.withDefaultsEntries.map((entry) => `  ${entry},`));
      lines.push('});');
    } else {
      lines.push('const props = defineProps({');
      // v1.4.18 T10：运行时 props（非 TS）；始终保留 class 默认值契约
      lines.push("  class: { type: String, default: '' },");
      lines.push(...generatedProps.runtimeEntries.map((entry) => `  ${entry}`));
      lines.push('});');
    }

    lines.push('');
    lines.push('// TODO: 定义 emits、响应式数据、计算属性、方法');
    lines.push('</script>');

    return lines.join('\n');
  }

  /**
   * 生成 Vue 2 Options API 的 <script> 块（v1.4.19 T18）。
   *
   * - TS 模式：`export default defineComponent({...})`，VARIANT/INSTANCE_SWAP 走 PropType 泛型；
   * - JS 模式：`export default {...}`，VARIANT 以运行时 validator 白名单兜底；
   * - 固定骨架 name/props/data/computed/methods，业务内容以 TODO 占位，
   *   class 透传契约与 Vue3 输出保持一致。
   *
   * @param componentName - PascalCase 组件名（同时作为 name 选项）
   * @param useTs - 是否 lang="ts"
   * @param scriptImports - 模板区回传的 ESM import（资源引用等）
   * @param generatedProps - Vue2 props 声明片段
   * @param smartCommentLines - v1.4.19 T21 智能推断注释行（关闭时为空）
   * @returns 完整 script 块文本
   */
  private _generateOptionsApiScript(
    componentName: string,
    useTs: boolean,
    scriptImports: string[],
    generatedProps: GeneratedVue2Props,
    smartCommentLines: string[] = [],
    uiComponentNames: readonly string[] = [],
  ): string {
    const lang = useTs ? ' lang="ts"' : '';
    const lines: string[] = [];

    lines.push(`<script${lang}>`);
    lines.push(`// ${componentName} - Generated by figma-dev-tools v${getToolVersion()} (Vue 2 Options API)`);
    if (smartCommentLines.length > 0) {
      lines.push(...smartCommentLines);
    }
    lines.push('');

    if (useTs) {
      // 组合 vue 导入：defineComponent 必有；PropType/Component 按 props 类型需要追加
      const namedImports: string[] = ['defineComponent'];
      if (generatedProps.needsPropType) namedImports.push('type PropType');
      if (generatedProps.needsComponentImport) namedImports.push('type Component');
      lines.push(`import { ${namedImports.join(', ')} } from 'vue';`);
    }
    if (scriptImports.length > 0) {
      lines.push(...scriptImports);
      lines.push('');
    }

    lines.push(useTs ? 'export default defineComponent({' : 'export default {');
    lines.push(`  name: '${componentName}',`);
    // WBS-P2-13：Options API 不会自动注册 <script setup> 式导入，组件库组件需显式注册
    if (uiComponentNames.length > 0) {
      lines.push(`  components: { ${uiComponentNames.join(', ')} },`);
    }
    lines.push('  props: {');
    // 始终保留 class 透传契约（与 Vue3 script setup 输出一致）
    lines.push("    class: { type: String, default: '' },");
    lines.push(...generatedProps.entries.map((entry) => `    ${entry}`));
    lines.push('  },');
    lines.push('  data() {');
    lines.push('    return {');
    lines.push('      // TODO: 在此声明响应式数据');
    lines.push('    };');
    lines.push('  },');
    lines.push('  computed: {');
    lines.push('    // TODO: 在此声明计算属性');
    lines.push('  },');
    lines.push('  methods: {');
    lines.push('    // TODO: 在此实现交互方法（@click、表单提交等）');
    lines.push('  },');
    lines.push(useTs ? '});' : '};');
    lines.push('</script>');

    return lines.join('\n');
  }

  /**
   * 生成 SFC style 块。
   *
   * - css-module 绑定（v1.4.18 T9 css-modules；v1.4.19 T16 less/sass）：
   *   `<style module [lang="less|scss"] src="./X.module.*">` 外置同名旁路文件，
   *   模板即可使用 $style.x；
   * - tailwind/unocss：保持 1.4.17 的 scoped 占位块（历史快照契约）。
   *
   * @param sidecar - 样式旁路文件描述（无则输出 scoped 占位块）
   * @returns SFC style 块文本
   */
  private _generateStyle(sidecar?: StyleSidecarFile): string {
    if (sidecar) {
      const langAttr = sidecar.lang && sidecar.lang !== 'css' ? ` lang="${sidecar.lang}"` : '';
      return `<style module${langAttr} src="./${sidecar.fileName}"></style>`;
    }
    return `<style scoped>\n/* 自定义样式（如需覆盖 Tailwind/UnoCSS） */\n</style>`;
  }

  private _pascalCase(str: string): string {
    if (!str) return '';
    return str
      .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('')
      .replace(/[\u4e00-\u9fa5]/g, '');
  }

  private _kebabCase(str: string): string {
    if (!str) return 'image';
    return (
      str
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[^a-zA-Z0-9]/g, '-')
        .toLowerCase()
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'image'
    );
  }
}

export function createVueGenerator(client: FigmaClient, options?: Partial<VueCodeGenOptions>): VueGenerator {
  return new VueGenerator(client, options);
}
