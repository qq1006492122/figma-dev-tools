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
import { createTailwindMapper, type TailwindMapping } from './tailwind-mapper.js';

// ============ 类型定义 ============

export interface VueCodeGenOptions {
  componentName?: string;
  typescript?: boolean;
  styleFormat?: 'tailwind' | 'unocss' | 'css-modules';
  sceneName?: string;
  usePublicCdn?: boolean;
  skipEnhancements?: boolean;
}

export interface GeneratedVueComponent {
  code: string;
  componentName: string;
  pendingAssets: Array<{ nodeId: string; name: string; type: string }>;
  extensionsNeeded: TailwindMapping['extensionsNeeded'];
  reports: EnhancementReports;
  imports: string[];
}

/**
 * Vue 模板节点渲染上下文（内部类型）
 */
interface VueRenderContext {
  depth: number;
  extensions: TailwindMapping['extensionsNeeded'];
  pendingAssets: Array<{ nodeId: string; name: string; type: string }>;
  usePublicCdn: boolean;
  sceneName: string;
  fileKey: string;
  svgRenderer: SvgInlineRenderer;
}

const DEFAULT_VUE_OPTIONS: Required<VueCodeGenOptions> = {
  componentName: 'Component',
  typescript: true,
  styleFormat: 'tailwind',
  sceneName: '',
  usePublicCdn: true,
  skipEnhancements: false,
};

// ============ VueGenerator 类 ============

export class VueGenerator {
  private readonly _client: FigmaClient;
  private readonly _svgRenderer: SvgInlineRenderer;
  private _options: Required<VueCodeGenOptions>;

  constructor(client: FigmaClient, options: Partial<VueCodeGenOptions> = {}) {
    this._client = client;
    this._options = { ...DEFAULT_VUE_OPTIONS, ...options };
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
    const twMapper = createTailwindMapper({ allowArbitrary: true });

    const reports: EnhancementReports = {};
    const extensionsNeeded: TailwindMapping['extensionsNeeded'] = [];
    const pendingAssets: Array<{ nodeId: string; name: string; type: string }> = [];
    const imports = new Set<string>();

    if (!opts.skipEnhancements) {
      reports.flexFixes = flexFixer.applyFixes(context.node);
      reports.a11y = a11yEnhancer.enhance(context.node);
      reports.designSystem = designSystem.analyze(context);
      reports.responsive = responsiveInferrer.infer(context);
    }

    if (opts.usePublicCdn) {
      imports.add("import { publicCdnUrl } from '@/lib/asset-path';");
    }

    const templateContent = await this._renderNode(
      context.node,
      twMapper,
      {
        depth: 1,
        extensions: extensionsNeeded,
        pendingAssets,
        usePublicCdn: opts.usePublicCdn !== false,
        sceneName: opts.sceneName || '',
        fileKey: context.fileKey,
        svgRenderer: this._svgRenderer,
      },
      true,
    );

    const scriptSetup = this._generateScriptSetup(componentName, opts.typescript, Array.from(imports));
    const template = `<template>\n${templateContent}\n</template>`;
    const style = this._generateStyle(opts.styleFormat);

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
      reports,
      imports: Array.from(imports),
    };
  }

  private async _renderNode(
    node: ProcessedNode,
    twMapper: ReturnType<typeof createTailwindMapper>,
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
        node.children.map((child) => this._renderNode(child, twMapper, { ...ctx, depth: ctx.depth }, false)),
      );
      return childResults.filter(Boolean).join('\n');
    }

    if (node.role === 'reusable-component' && node.componentKey) {
      const compName = sanitizeIdentifier(node.name || 'CustomComponent');
      return `${indent}<!-- TODO: 引入并使用项目组件 ${compName} -->\n${indent}<${compName} />`;
    }

    const mapping: TailwindMapping = twMapper.mapNode(node);
    ctx.extensions.push(...(mapping.extensionsNeeded || []));

    const classNames: string[] = [];
    if (mapping.className) classNames.push(mapping.className);
    // 合并 a11y-enhancer 和 flex-fixer 添加的类名
    if (nodeEnhancements._a11y?.className) classNames.push(nodeEnhancements._a11y.className);
    if (Array.isArray(nodeEnhancements._flexFixes)) {
      classNames.push(...nodeEnhancements._flexFixes);
    }

    const className = classNames.filter(Boolean).join(' ');

    const tag = this._selectTag(node);

    // 文本节点（XSS 防护：清理文本内容）
    if (node.originalType === 'TEXT' || node.role === 'text') {
      const rawText = node.textContent || '';
      const textContent = sanitizeText(rawText);
      if (className) {
        return `${indent}<${tag} class="${className}">${textContent}</${tag}>`;
      }
      return `${indent}<${tag}>${textContent}</${tag}>`;
    }

    // ============ 图片节点特殊处理（增强版 v1.4.0） ============
    const isImageNode =
      (node.originalType === 'RECTANGLE' && node.fills?.some((f) => f.type === 'image')) || node.asset || tag === 'img';

    if (isImageNode) {
      const attrs: string[] = [];

      // object-cover 类
      let imgClassName = className || '';
      if (imgClassName && !imgClassName.includes('object-')) {
        imgClassName = `${imgClassName} object-cover`;
      } else if (!imgClassName) {
        imgClassName = 'object-cover';
      }
      if (imgClassName) attrs.push(`class="${imgClassName}"`);

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

      // src 处理
      if (node.asset?.cdnUrl && ctx.usePublicCdn) {
        attrs.push(`:src="publicCdnUrl('${node.asset.cdnUrl}')"`);
      } else if (node.asset?.localPath && ctx.usePublicCdn) {
        attrs.push(`:src="publicCdnUrl('${node.asset.localPath}')"`);
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
    if (className) attrs.push(`class="${className}"`);

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
        node.children.map((child) => this._renderNode(child, twMapper, { ...ctx, depth: ctx.depth + 1 }, false)),
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

  private _generateScriptSetup(componentName: string, useTs: boolean, imports: string[]): string {
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
      lines.push('interface Props {');
      lines.push('  // TODO: 定义组件 props');
      lines.push('  class?: string;');
      lines.push('}');
      lines.push('');
      lines.push('const props = withDefaults(defineProps<Props>(), {');
      lines.push("  class: '',");
      lines.push('});');
    } else {
      lines.push('const props = defineProps({');
      lines.push("  class: { type: String, default: '' },");
      lines.push('});');
    }

    lines.push('');
    lines.push('// TODO: 定义 emits、响应式数据、计算属性、方法');
    lines.push('</script>');

    return lines.join('\n');
  }

  private _generateStyle(styleFormat: string): string {
    if (styleFormat === 'css-modules') {
      return `<style module scoped>\n/* CSS Modules styles */\n</style>`;
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
