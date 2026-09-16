/**
 * Vue 3 SFC 代码生成服务 - Vue Generator
 *
 * 核心职责：将 Figma 节点转换为 Vue 3 单文件组件（SFC），
 * 使用 <script setup lang="ts"> + Template + Tailwind CSS/UnoCSS。
 *
 * @module
 */

import type { DesignContext, ProcessedNode } from '../types/nodes.js';
import { escapeAttribute, sanitizeIdentifier, sanitizeText } from '../utils/security.js';
import { createA11yEnhancer } from './a11y-enhancer.js';
import { formatCode } from './code-formatter.js';
import type { EnhancementReports } from './code-generator.js';
import { createDesignSystemAnalyzer } from './design-system.js';
import type { FigmaClient } from './figma-client.js';
import { createFlexFixer } from './flex-fixer.js';
import { createResponsiveInferrer } from './responsive-inferrer.js';
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
import { generateVue3Props, type GeneratedVue3Props } from './props-type-generator.js';

// ============ 类型定义 ============

export interface VueCodeGenOptions {
  componentName?: string;
  typescript?: boolean;
  /** 样式方案（v1.4.18 T7：StyleFormat 11 值联合，新管线仅 tailwind/unocss 可用） */
  styleFormat?: StyleFormat;
  /** UnoCSS 模式（v1.4.18 T8，仅 styleFormat=unocss 生效）：wind（默认）| attributify */
  unocssMode?: UnocssMode;
  sceneName?: string;
  usePublicCdn?: boolean;
  /** 目标构建器（v1.4.18）：默认 none，模板资源引用与 1.4.17 一致 */
  bundler?: BundlerKind;
  skipEnhancements?: boolean;
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
  /** 同名旁路样式文件（v1.4.18 T9，仅 css-modules：${componentName}.module.css） */
  styleSidecar?: StyleSidecarFile;
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
  /** 脚本区 import 集合（ESM 资源引用回传到 script setup） */
  imports: Set<string>;
  sceneName: string;
  fileKey: string;
  svgRenderer: SvgInlineRenderer;
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
};

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
    assertStyleFormatSupported(opts.styleFormat ?? 'tailwind', STYLE_FORMATS_NEW_PIPELINE);
    const styleRenderer = createStyleRenderer(opts.styleFormat ?? 'tailwind', {
      framework: 'vue',
      unocssMode: opts.unocssMode ?? 'wind',
    });

    const reports: EnhancementReports = {};
    const extensionsNeeded: StyleExtensionNeeded[] = [];
    const pendingAssets: Array<{ nodeId: string; name: string; type: string }> = [];
    const warnings: string[] = [];
    const imports = new Set<string>();

    // 透传 design-context 层的警告（如陈旧缓存降级）
    if (context.warnings && context.warnings.length > 0) {
      warnings.push(...context.warnings);
    }

    if (!opts.skipEnhancements) {
      reports.flexFixes = flexFixer.applyFixes(context.node);
      reports.a11y = a11yEnhancer.enhance(context.node);
      reports.designSystem = designSystem.analyze(context);
      reports.responsive = responsiveInferrer.infer(context);
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
      },
      true,
    );

    // 仅当模板实际出现 publicCdnUrl() 调用时才导入（v1.4.18：非 none 构建器不产出该调用）
    if (templateContent.includes('publicCdnUrl')) {
      imports.add("import { publicCdnUrl } from '@/lib/asset-path';");
    }

    // v1.4.18 T9：CSS Modules 同名 .module.css 旁路（模板以 $style.x 引用，SFC 经 <style module src> 外置）
    const styleSidecar =
      opts.styleFormat === 'css-modules' && styleRenderer.buildSidecar
        ? styleRenderer.buildSidecar(componentName)
        : undefined;

    // v1.4.18 T10：Component Properties → Vue3 Props 类型推导
    const generatedProps = generateVue3Props(context.node.componentProperties ?? [], {
      typescript: opts.typescript,
    });
    if (opts.typescript && generatedProps.needsComponentImport) {
      imports.add("import type { Component } from 'vue';");
    }

    const scriptSetup = this._generateScriptSetup(componentName, opts.typescript, Array.from(imports), generatedProps);
    const template = `<template>\n${templateContent}\n</template>`;
    const style = this._generateStyle(opts.styleFormat, componentName);

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
    lines.push(scriptSetup);
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

    const mapping = styleRenderer.renderNode(node);
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

    // v1.4.18 T9：CSS Modules 下渲染器产出语义本地类名（$style.x），
    // a11y/flexFixes 补丁都是 Tailwind 原子类，合入会引入未声明 token，故整体跳过；
    // attributify 属性化也不适用于模块类。
    const isCssModulesFormat = styleRenderer.id === 'css-modules';

    // v1.4.18 T8：attributify 模式下安全 token 分流为无值模板属性；
    // 注意渲染器已做过一次分区（attributes + 回退 className），
    // 这里必须把 attributes 的 token 一并放回再与 extraTokens 统一重分区，
    // 否则只对回退 class 再分区会把安全 token 整体丢弃。
    let className: string;
    let attributifyAttrs: string[] = [];
    if (isCssModulesFormat) {
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

    /** 输出 class 属性：CSS Modules 走 $style 动态绑定（kebab 本地名必须方括号访问），其余走静态 class */
    const buildClassAttr = (value: string): string =>
      isCssModulesFormat ? `:class="$style['${value}']"` : `class="${value}"`;

    const tag = this._selectTag(node);

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

    // ============ 图片节点特殊处理（增强版 v1.4.0） ============
    const isImageNode =
      (node.originalType === 'RECTANGLE' && node.fills?.some((f) => f.type === 'image')) || node.asset || tag === 'img';

    if (isImageNode) {
      const attrs: string[] = [];

      // v1.4.18 T9：CSS Modules 没有原子工具类，object-fit:cover 以内联样式兜底；
      // 其余管线继续追加 object-cover 原子类
      let imgClassName = className || '';
      if (isCssModulesFormat) {
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
    if (tag === 'button' || nodeEnhancements._a11y?.isButton) attrs.push('type="button"');

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

    let children = '';
    if (node.children && node.children.length > 0) {
      const childResults = await Promise.all(
        node.children.map((child) => this._renderNode(child, styleRenderer, { ...ctx, depth: ctx.depth + 1 }, false)),
      );
      children = childResults.filter(Boolean).join('\n');
    }

    const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';

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
  ): string {
    const lang = useTs ? ' lang="ts"' : '';
    const lines: string[] = [];

    lines.push(`<script setup${lang}>`);
    lines.push(`// ${componentName} - Generated by figma-dev-tools v1.4.0`);
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
   * 生成 SFC style 块。
   *
   * - css-modules（v1.4.18 T9）：`<style module src="./X.module.css">` 外置同名旁路文件，
   *   模板即可使用 $style.x；
   * - tailwind/unocss：保持 1.4.17 的 scoped 占位块（历史快照契约）。
   *
   * @param styleFormat - 样式方案
   * @param componentName - 组件名（css-modules 旁路文件命名用）
   * @returns SFC style 块文本
   */
  private _generateStyle(styleFormat: string, componentName: string): string {
    if (styleFormat === 'css-modules') {
      return `<style module src="./${componentName}.module.css"></style>`;
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
