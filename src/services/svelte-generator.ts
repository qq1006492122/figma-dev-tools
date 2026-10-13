/**
 * Svelte 代码生成服务 - Svelte Generator（WBS-P1-11 / P1-12）
 *
 * 默认 **Svelte 4** 口径：
 * - `<script lang="ts">` + `export let props` + `createEventDispatcher`；
 * - 模板：原生 HTML 标签、`{#if}/{:else if}/{:else}/{/if}`、
 *   `{#each list as item, index (item.id)}`、`on:click/on:input/on:submit`；
 * - Svelte 5 runes（$props/$state）仅在脚本注释中给迁移建议，不作为默认输出。
 *
 * 样式仅承诺三组合：tailwind / unocss / css-modules；其中 css-modules 实际输出
 * Svelte scoped `<style>`（编译器自动局部作用域），**不承诺 CSS Modules 的
 * hash/composes 语义**——composes 在产物中被静态展开合并。
 *
 * @module
 */

import type { DesignContext, ProcessedNode, ProcessedComponentProperty } from '../types/nodes.js';
import type { SmartInferenceSwitches } from '../types.js';
import { escapeAttribute, sanitizeIdentifier, sanitizeText } from '../utils/security.js';
import { createA11yEnhancer } from './a11y-enhancer.js';
import type { EnhancementReports } from './code-generator.js';
import { createDesignSystemAnalyzer } from './design-system.js';
import type { FigmaClient } from './figma-client.js';
import { createFlexFixer } from './flex-fixer.js';
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
  type StyleExtensionNeeded,
  type StyleHint,
  type StyleSidecarFile,
  type UnocssMode,
} from './style-renderers/index.js';
import { normalizeAssetUrlPath, planAssetReference, toAssetVarName, type BundlerKind } from './asset-paths.js';
import {
  inferWeappStructure,
  type WeappStructureInference,
  type ExplicitConditionInput,
  type ConditionBinding,
  type ListBinding,
} from './weapp-structure-inferrer.js';

// ============ 对外常量/类型 ============

/** Svelte 管线承诺的样式三组合（其余枚举触网前显式拒绝，P1-12） */
export const SVELTE_STYLE_FORMATS = ['tailwind', 'unocss', 'css-modules'] as const;
export type SvelteStyleFormat = (typeof SVELTE_STYLE_FORMATS)[number];

export interface SvelteCodeGenOptions {
  componentName?: string;
  /** 默认 true：<script lang="ts"> */
  typescript?: boolean;
  styleFormat?: SvelteStyleFormat;
  /** 仅 unocss 生效：wind（默认）| attributify */
  unocssMode?: UnocssMode;
  sceneName?: string;
  usePublicCdn?: boolean;
  bundler?: BundlerKind;
  skipEnhancements?: boolean;
  inference?: SmartInferenceSwitches & { list?: boolean };
  /** 用户确认的显式条件（if/elif/else/hidden），与 weapp 同一输入模型 */
  conditions?: ExplicitConditionInput[];
}

export interface GeneratedSvelteComponent {
  code: string;
  componentName: string;
  svelteVersion: 4;
  pendingAssets: Array<{ nodeId: string; name: string; type: string }>;
  extensionsNeeded: StyleExtensionNeeded[];
  warnings: string[];
  reports: EnhancementReports;
  imports: string[];
  styleHints: StyleHint[];
  /** 始终 undefined：css-modules 在 Svelte 侧内联 scoped <style>，无外置旁路 */
  styleSidecar?: StyleSidecarFile;
  /** 事件绑定汇总（属性 → handler，供调用方核对脚本） */
  events: Array<{ event: 'click' | 'input' | 'submit'; handler: string; tag: string }>;
  /** 显隐候选建议（默认不自动绑定 {#if}，仅报告） */
  conditionSuggestions: WeappStructureInference['conditionSuggestions'];
}

interface SvelteEvent {
  event: 'click' | 'input' | 'submit';
  handler: string;
  tag: string;
}

interface RenderContext {
  depth: number;
  pendingAssets: Array<{ nodeId: string; name: string; type: string }>;
  warnings: string[];
  extensions: StyleExtensionNeeded[];
  usePublicCdn: boolean;
  bundler: BundlerKind;
  imports: Set<string>;
  sceneName: string;
  fileKey: string;
  svgRenderer: SvgInlineRenderer;
  componentName: string;
  events: SvelteEvent[];
  usedHandlerNames: Set<string>;
  // —— 结构推断索引（与 weapp 同一数据模型）——
  listByContainer: Map<string, ListBinding[]>;
  condByNode: Map<string, ConditionBinding>;
  skipMemberIds: Set<string>;
  prototypeListById: Map<string, ListBinding>;
  textBindingById: Map<string, { alias: string; field: string }>;
}

/** HTML void 元素（无 children，必须自闭合） */
const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

// ============ 生成器 ============

export class SvelteGenerator {
  private readonly _svgRenderer: SvgInlineRenderer;
  private readonly _options: Partial<SvelteCodeGenOptions>;

  constructor(_client: FigmaClient, options: Partial<SvelteCodeGenOptions> = {}) {
    this._options = options;
    this._svgRenderer = new SvgInlineRenderer(_client, {
      inline: true,
      scale: 1,
      optimize: true,
      currentColor: true,
    });
  }

  async generateFromContext(
    context: DesignContext,
    options: Partial<SvelteCodeGenOptions> = {},
  ): Promise<GeneratedSvelteComponent> {
    const opts = {
      typescript: true,
      styleFormat: 'tailwind' as SvelteStyleFormat,
      sceneName: '',
      usePublicCdn: true,
      skipEnhancements: false,
      ...this._options,
      ...options,
      bundler: (options.bundler ?? this._options.bundler ?? 'none') as BundlerKind,
    };
    const componentName = sanitizeIdentifier(opts.componentName || context.node.name || 'MyComponent');
    const useTs = opts.typescript !== false;
    const styleFormat = opts.styleFormat ?? 'tailwind';

    // P1-12：样式组合白名单（触网前，非法组合显式报错不降级）
    assertStyleFormatSupported(styleFormat, SVELTE_STYLE_FORMATS, undefined, 'svelte');
    const styleRenderer = createStyleRenderer(styleFormat, {
      framework: 'svelte',
      unocssMode: opts.unocssMode ?? 'wind',
    });
    const isCssModuleBinding = styleRenderer.classBinding === 'css-module';

    const reports: EnhancementReports = {};
    const warnings: string[] = [...(context.warnings ?? [])];
    const pendingAssets: Array<{ nodeId: string; name: string; type: string }> = [];
    const extensions: StyleExtensionNeeded[] = [];
    const imports = new Set<string>();
    const events: SvelteEvent[] = [];
    const usedHandlerNames = new Set<string>();

    if (!opts.skipEnhancements) {
      reports.flexFixes = createFlexFixer().applyFixes(context.node);
      reports.a11y = createA11yEnhancer().enhance(context.node);
      reports.designSystem = createDesignSystemAnalyzer().analyze(context);
      reports.smartInference = createSmartInferrer().infer(context.node, {
        framework: 'svelte',
        switches: opts.inference ?? {},
      });
      reports.semantic = createSemanticInferrer().infer(context.node, { framework: 'svelte' });
    }

    // 列表/条件推断（列表默认开；名称信号条件默认仅建议）
    const structure = inferWeappStructure(
      context.node as Parameters<typeof inferWeappStructure>[0],
      { list: opts.inference?.list !== false },
      opts.conditions ?? [],
    );
    for (const w of structure.warnings) warnings.push(`${w.code}: ${w.message}`);
    const indexes = buildStructureIndexes(context.node, structure);

    const ctx: RenderContext = {
      depth: 0,
      pendingAssets,
      warnings,
      extensions,
      usePublicCdn: opts.usePublicCdn !== false,
      bundler: opts.bundler,
      imports,
      sceneName: opts.sceneName || '',
      fileKey: context.fileKey,
      svgRenderer: this._svgRenderer,
      componentName,
      events,
      usedHandlerNames,
      ...indexes,
    };

    const markup = (await this._renderNode(context.node, styleRenderer, ctx, true)).trim();

    if (imports.has('publicCdnUrl-placeholder')) imports.delete('publicCdnUrl-placeholder');
    if (markup.includes('publicCdnUrl')) {
      imports.add("import { publicCdnUrl } from '@/lib/asset-path';");
    }

    // css-modules：聚合旁路 CSS → 展开 composes → 内联进 scoped <style>
    let embeddedScopedCss: string | null = null;
    const rawSidecar = styleRenderer.buildSidecar ? styleRenderer.buildSidecar(componentName) : undefined;
    if (isCssModuleBinding && rawSidecar) {
      embeddedScopedCss = flattenComposes(rawSidecar.content);
    }

    const script = this._buildScript({
      componentName,
      useTs,
      imports: Array.from(imports),
      props: context.node.componentProperties ?? [],
      lists: structure.lists.filter((l) => l.parentListId === null),
      placeholderData: structure.placeholderData,
      events,
      smartLines: reports.smartInference ? formatSmartInferenceComments(reports.smartInference) : [],
      semanticLines: reports.semantic ? formatSemanticComments(reports.semantic, 'slash') : [],
    });
    const style = this._buildStyle(embeddedScopedCss);

    const code = [markup, '', this._todoComment(), '', script, '', style, ''].join('\n');

    return {
      code,
      componentName,
      svelteVersion: 4,
      pendingAssets: dedupeBy(pendingAssets, (a) => a.nodeId),
      extensionsNeeded: dedupeBy(extensions, (e) => `${e.type}:${e.originalValue}`),
      warnings: Array.from(new Set(warnings)),
      reports,
      imports: Array.from(imports),
      styleHints: [...(styleRenderer.hints ?? [])],
      styleSidecar: undefined,
      events: events.map((e) => ({ ...e })),
      conditionSuggestions: structure.conditionSuggestions,
    };
  }

  // ============ 脚本 ============

  private _todoComment(): string {
    return [
      '<!--',
      ' TODOs:',
      ' - 接入真实数据源（each 占位数组与 export props）',
      ' - 完善事件处理函数（当前仅 dispatch 同名事件）',
      ' - Svelte 5 项目可将 export let / createEventDispatcher 迁移为 $props / 事件回调 props（runes）',
      '-->',
    ].join('\n');
  }

  private _buildScript(args: {
    componentName: string;
    useTs: boolean;
    imports: string[];
    props: ProcessedComponentProperty[];
    lists: ListBinding[];
    placeholderData: Record<string, unknown>;
    events: SvelteEvent[];
    smartLines: string[];
    semanticLines: string[];
  }): string {
    const { componentName, useTs, imports: scriptImports, props, lists, placeholderData, events, smartLines, semanticLines } = args;
    const L: string[] = [];
    L.push(`<script${useTs ? ' lang="ts"' : ''}>`);
    L.push(`// ${componentName} - Generated by figma-dev-tools (Svelte 4 口径；Svelte 5 runes 见文件末迁移建议)`);
    for (const line of [...smartLines, ...semanticLines]) L.push(line);
    L.push('');

    if (events.length > 0) {
      L.push("import { createEventDispatcher } from 'svelte';");
    }
    for (const imp of scriptImports) {
      if (imp.startsWith("import { createEventDispatcher")) continue;
      L.push(imp);
    }
    if (scriptImports.length > 0 || events.length > 0) L.push('');

    // —— Component Properties → export let ——
    if (props.length > 0) {
      L.push('// ===== Props（由 Figma Component Properties 推导）=====');
      for (const p of props) L.push(this._propLine(p, useTs));
      L.push('');
    }

    // —— 列表占位数据 → export let（{#each} 直接可运行）——
    if (lists.length > 0) {
      L.push('// ===== 列表占位数据（推断自重复组，接入时替换为真实数据源）=====');
      for (const list of lists) {
        const rows = placeholderData[list.dataKey];
        const rowsText = JSON.stringify(rows, null, 2)
          // JS 对象字面量风格：合法标识符键去引号、字符串值改单引号
          .replace(
            /^(\s+)"([A-Za-z_$][\w$]*)":\s*("(?:[^"\\]|\\.)*")(,?)$/gm,
            (_m, indent: string, key: string, jsonStr: string, comma: string) => {
              const raw = JSON.parse(jsonStr) as string;
              return `${indent}${key}: '${raw.replace(/'/g, "\\'")}'${comma}`;
            },
          )
          .replace(/^(\s+)"([A-Za-z_$][\w$]*)":/gm, '$1$2:');
        const indentedRows = rowsText
          .split('\n')
          .map((line, i) => (i === 0 ? line : `  ${line}`))
          .join('\n');
        if (useTs) {
          const typeText = this._rowsType(rows);
          L.push(`export let ${list.dataKey}: ${typeText} = ${indentedRows};`);
        } else {
          L.push(`export let ${list.dataKey} = ${indentedRows};`);
        }
      }
      L.push('');
    }

    // —— 事件 ——
    if (events.length > 0) {
      L.push('const dispatch = createEventDispatcher();');
      L.push('');
      const seen = new Set<string>();
      for (const e of events) {
        if (seen.has(e.handler)) continue;
        seen.add(e.handler);
        if (e.event === 'input') {
          const param = useTs
            ? 'event: Event & { currentTarget: HTMLInputElement }'
            : 'event';
          L.push(`const ${e.handler} = (${param}) => {`);
          L.push('  // TODO: 校验 / 双向绑定');
          L.push("  dispatch('input', event.currentTarget.value);");
          L.push('};');
        } else if (e.event === 'submit') {
          L.push(`const ${e.handler} = () => {`);
          L.push('  // TODO: 表单提交逻辑');
          L.push("  dispatch('submit');");
          L.push('};');
        } else {
          L.push(`const ${e.handler} = () => {`);
          L.push('  // TODO: 业务交互逻辑');
          L.push("  dispatch('click');");
          L.push('};');
        }
      }
    }

    L.push('</script>');
    return L.join('\n');
  }

  private _propLine(p: ProcessedComponentProperty, useTs: boolean): string {
    const name = p.propName;
    if (!useTs) {
      const dv = this._runtimeDefault(p);
      return dv === undefined ? `export let ${name};` : `export let ${name} = ${dv};`;
    }
    switch (p.type) {
      case 'BOOLEAN':
        return `export let ${name}: boolean = ${p.defaultValue === true ? 'true' : 'false'};`;
      case 'VARIANT': {
        const options = (p.variantOptions ?? []).map((v) => `'${v}'`).join(' | ') || 'string';
        const required = p.required || p.defaultValue === undefined;
        return required
          ? `export let ${name}: ${options};`
          : `export let ${name}: ${options} = '${p.defaultValue}';`;
      }
      case 'INSTANCE_SWAP':
        return p.required ? `export let ${name}: string;` : `export let ${name}: string = '';`;
      case 'TEXT':
      default: {
        // 文本型默认值保持字符串口径，数字/结构化文本由业务侧自行转换（不臆造解析）
        const dv = p.defaultValue === undefined ? "''" : `'${String(p.defaultValue).replace(/'/g, "\\'")}'`;
        return `export let ${name}: string = ${dv};`;
      }
    }
  }

  private _runtimeDefault(p: ProcessedComponentProperty): string | undefined {
    if (p.defaultValue === undefined) return undefined;
    if (p.type === 'BOOLEAN') return p.defaultValue === true ? 'true' : 'false';
    return `'${String(p.defaultValue).replace(/'/g, "\\'")}'`;
  }

  private _rowsType(rows: unknown): string {
    if (!Array.isArray(rows) || rows.length === 0 || typeof rows[0] !== 'object' || rows[0] === null) {
      return 'Array<Record<string, unknown>>';
    }
    const sample = rows[0] as Record<string, unknown>;
    const parts = Object.keys(sample).map((key) => {
      const v = sample[key];
      let t: string;
      if (typeof v === 'string') t = 'string';
      else if (typeof v === 'number') t = 'number';
      else if (typeof v === 'boolean') t = 'boolean';
      else if (Array.isArray(v)) t = 'Array<Record<string, unknown>>';
      else t = 'Record<string, unknown>';
      return `${/^[A-Za-z_$][\w$]*$/.test(key) ? key : `'${key}'`}: ${t}`;
    });
    return `Array<{ ${parts.join('; ')} }>`;
  }

  // ============ 样式块 ============

  private _buildStyle(embeddedCss: string | null): string {
    if (embeddedCss !== null) {
      return [
        '<style>',
        '  /*',
        '   * figma-dev-tools 生成的 Svelte scoped 样式：编译器自动做局部作用域。',
        '   * 注意：此处不承诺 CSS Modules 的 hash/composes 语义——',
        '   * 上游 composes 引用已被静态展开合并为完整声明。',
        '   */',
        embeddedCss,
        '</style>',
      ].join('\n');
    }
    return '<style>\n  /* 自定义样式（如需覆盖 Tailwind/UnoCSS 原子类） */\n</style>';
  }

  // ============ 节点渲染 ============

  private async _renderNode(
    node: ProcessedNode,
    styleRenderer: ReturnType<typeof createStyleRenderer>,
    ctx: RenderContext,
    isRoot = false,
  ): Promise<string> {
    if (node.visible === false && !this._hasDirective(node.id, ctx)) return '';

    const indent = '  '.repeat(isRoot ? 0 : ctx.depth + 1);
    const enhancements = node as ProcessedNode & {
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

    if (isVectorNode(node)) {
      const svg = await this._tryInlineSvg(node, ctx);
      if (svg) return `${indent}${svg}`;
    }

    if (
      !isRoot &&
      (node.role === 'layout-only' || node.originalType === 'GROUP') &&
      node.children?.length
    ) {
      const kids = await this._renderChildren(node, styleRenderer, ctx, 0);
      return kids.filter(Boolean).join('\n');
    }

    if (node.role === 'reusable-component' && node.componentKey) {
      const comp = sanitizeIdentifier(node.name || 'CustomComponent');
      return `${indent}<!-- TODO: import 并使用项目组件 ${comp} -->\n${indent}<${comp} />`;
    }

    const mapping = styleRenderer.renderNode(node, {
      framework: 'svelte',
      componentName: ctx.componentName,
      isRoot,
    });
    ctx.extensions.push(...(mapping.extensionsNeeded ?? []));
    for (const w of mapping.warnings ?? []) {
      const line = `[${node.name || node.figmaId}] ${w}`;
      if (!ctx.warnings.includes(line)) ctx.warnings.push(line);
    }

    const extraTokens: string[] = [];
    if (enhancements._a11y?.className) extraTokens.push(enhancements._a11y.className);
    if (Array.isArray(enhancements._flexFixes)) extraTokens.push(...enhancements._flexFixes);

    const isCssModuleBinding = styleRenderer.classBinding === 'css-module';
    let className: string;
    let attributifyAttrs: string[] = [];
    if (isCssModuleBinding) {
      // Svelte scoped <style>：语义类名直接静态使用（无 styles[]/$style 间接层）
      className = mapping.className;
    } else if (mapping.attributes !== undefined) {
      const partition = partitionAttributifyTokens(
        [...mapping.attributes.map((a) => a.name), mapping.className, ...extraTokens].filter(Boolean).join(' '),
      );
      className = partition.fallbackClassName;
      attributifyAttrs = partition.attributeNames.map((n) => `${n}=""`);
    } else {
      className = [mapping.className, ...extraTokens].filter(Boolean).join(' ');
    }

    const tag = this._selectTag(node);

    // 文本节点（列表原型内 → {item.field} 插值）
    if (node.originalType === 'TEXT' || node.role === 'text') {
      const binding = ctx.textBindingById.get(node.id);
      const text = binding ? `{${binding.alias}.${binding.field}}` : sanitizeText(node.textContent || '');
      const attrs = [className ? `class="${className}"` : '', ...attributifyAttrs].filter(Boolean).join(' ');
      return `${indent}<${tag}${attrs ? ` ${attrs}` : ''}>${text}</${tag}>`;
    }

    // 图片
    const isImage =
      (node.originalType === 'RECTANGLE' && node.fills?.some((f) => f.type === 'image')) ||
      node.asset ||
      tag === 'img';
    if (isImage) {
      return this._renderImage(node, enhancements, className, attributifyAttrs, isCssModuleBinding, ctx, indent);
    }

    const attrs: string[] = [];
    if (className) attrs.push(`class="${className}"`);
    attrs.push(...attributifyAttrs);

    // a11y
    if (enhancements._a11y?.ariaLabel) {
      attrs.push(`aria-label="${escapeAttribute(sanitizeText(enhancements._a11y.ariaLabel))}"`);
    }
    if (enhancements._a11y?.ariaHidden) attrs.push('aria-hidden="true"');
    if (enhancements._a11y?.role && enhancements._a11y.role !== tag) {
      attrs.push(`role="${escapeAttribute(enhancements._a11y.role)}"`);
    }
    if (tag === 'button' || enhancements._a11y?.isButton) attrs.push('type="button"');
    if (node.role === 'icon' && !enhancements._a11y?.ariaHidden && !enhancements._a11y?.ariaLabel) {
      attrs.push('aria-hidden="true"');
    }

    // 内联样式（静态字符串，Svelte 兼容；值来自受控映射）
    if (mapping.inlineStyle && Object.keys(mapping.inlineStyle).length > 0) {
      const body = Object.entries(mapping.inlineStyle)
        .map(([k, v]) => {
          const kebab = k.replace(/([A-Z])/g, '-$1').toLowerCase();
          return `${kebab}: ${typeof v === 'number' ? v : String(v)}`;
        })
        .join('; ');
      attrs.push(`style="${body}"`);
    }

    // 事件
    const ev = this._eventFor(node, tag, ctx.usedHandlerNames);
    if (ev) {
      ctx.events.push(ev);
      if (ev.event === 'submit') attrs.push(`on:submit|preventDefault={${ev.handler}}`);
      else attrs.push(`on:${ev.event}={${ev.handler}}`);
    }

    const childHtml = (await this._renderChildren(node, styleRenderer, ctx, 1)).filter(Boolean).join('\n');
    const attrStr = attrs.length > 0 ? ` ${attrs.join(' ')}` : '';
    if (childHtml) {
      return `${indent}<${tag}${attrStr}>\n${childHtml}\n${indent}</${tag}>`;
    }
    // void 元素必须自闭合（svelte 编译器对 <input></input> 报 ParseError）
    if (VOID_ELEMENTS.has(tag)) {
      return `${indent}<${tag}${attrStr} />`;
    }
    return `${indent}<${tag}${attrStr}></${tag}>`;
  }

  private async _renderChildren(
    parent: ProcessedNode,
    styleRenderer: ReturnType<typeof createStyleRenderer>,
    ctx: RenderContext,
    depthDelta: 0 | 1,
  ): Promise<string[]> {
    const out: string[] = [];
    const children = parent.children ?? [];
    const consumedChainNodes = new Set<string>();

    for (const child of children) {
      if (ctx.skipMemberIds.has(child.id)) continue;
      if (consumedChainNodes.has(child.id)) continue;

      const cond = ctx.condByNode.get(child.id);

      // 同父级 if/elif/else 链：合并为一个 {#if} 块
      if (cond?.groupId && cond.branch !== 'standalone') {
        const chain = children
          .filter((c) => ctx.condByNode.get(c.id)?.groupId === cond.groupId)
          .filter((c) => !ctx.skipMemberIds.has(c.id));
        const rendered: Array<{ binding: ConditionBinding; html: string }> = [];
        for (const member of chain) {
          consumedChainNodes.add(member.id);
          const html = await this._renderNode(
            member,
            styleRenderer,
            { ...ctx, depth: ctx.depth + depthDelta },
            false,
          );
          const binding = ctx.condByNode.get(member.id)!;
          rendered.push({ binding, html });
        }
        out.push(this._wrapChain(rendered, '  '.repeat(ctx.depth + 1 + depthDelta)));
        continue;
      }

      const html = await this._renderNode(
        child,
        styleRenderer,
        { ...ctx, depth: ctx.depth + depthDelta },
        false,
      );
      if (!html) continue;
      out.push(this._applyDirectives(child, html, ctx));
    }
    return out;
  }

  private _wrapChain(items: Array<{ binding: ConditionBinding; html: string }>, indent: string): string {
    const L: string[] = [];
    items.forEach((item, i) => {
      const b = item.binding;
      if (i === 0) {
        L.push(`${indent}{#if ${b.expression ?? 'true'}}`);
      } else if (b.branch === 'else' || b.directive === 'wx:else') {
        L.push(`${indent}{:else}`);
      } else {
        L.push(`${indent}{:else if ${b.expression ?? 'true'}}`);
      }
      L.push(item.html);
    });
    L.push(`${indent}{/if}`);
    return L.join('\n');
  }

  private _applyDirectives(node: ProcessedNode, html: string, ctx: RenderContext): string {
    let out = html;
    const cond = ctx.condByNode.get(node.id);
    if (cond) {
      if (cond.directive === 'hidden') {
        out = this._injectAttr(out, `hidden={${cond.expression ?? 'true'}}`);
      } else if (cond.branch === 'standalone' || (!cond.groupId && cond.branch === 'if')) {
        const indent = (/^(\s*)/.exec(out)?.[1]) ?? '';
        out = `${indent}{#if ${cond.expression ?? 'true'}}\n${out}\n${indent}{/if}`;
      }
    }
    const list = ctx.prototypeListById.get(node.id);
    if (list) {
      const indent = (/^(\s*)/.exec(out)?.[1]) ?? '';
      out =
        `${indent}{#each ${list.dataPath} as ${list.itemAlias}, ${list.indexAlias} (${list.itemAlias}.${list.wxKey})}\n` +
        `${out}\n${indent}{/each}`;
    }
    return out;
  }

  private _injectAttr(html: string, attr: string): string {
    return html.replace(/<([a-zA-Z][\w-]*)([\s>])/, (_m, tag: string, after: string) => `<${tag} ${attr}${after}`);
  }

  private _hasDirective(nodeId: string, ctx: RenderContext): boolean {
    return ctx.condByNode.has(nodeId) || ctx.prototypeListById.has(nodeId);
  }

  // ============ 图片 / SVG ============

  private _renderImage(
    node: ProcessedNode,
    enhancements: { _a11y?: { isDecorative?: boolean; altText?: string; ariaHidden?: boolean } },
    className: string,
    attributifyAttrs: string[],
    isCssModuleBinding: boolean,
    ctx: RenderContext,
    indent: string,
  ): string {
    const attrs: string[] = [];
    let cls = className;
    if (isCssModuleBinding) {
      if (cls) attrs.push(`class="${cls}"`);
      attrs.push('style="object-fit: cover;"');
    } else {
      if (cls && !cls.includes('object-')) cls = `${cls} object-cover`;
      if (!cls) cls = 'object-cover';
      if (attributifyAttrs.length > 0) {
        attrs.push(`class="${cls}"`);
        attrs.push(...attributifyAttrs);
      } else {
        attrs.push(`class="${cls}"`);
      }
    }

    let altText = node.name || '';
    let decorative = false;
    if (enhancements._a11y?.isDecorative) {
      altText = '';
      decorative = true;
    } else if (enhancements._a11y?.altText !== undefined) {
      altText = enhancements._a11y.altText;
    }
    const safeAlt = altText ? escapeAttribute(sanitizeText(altText)) : '';
    attrs.push(`alt="${safeAlt}"`);
    if (decorative || enhancements._a11y?.ariaHidden) attrs.push('aria-hidden="true"');

    const w = node.size?.width ?? 0;
    const h = node.size?.height ?? 0;
    if (w > 0 && h > 0) {
      attrs.push(`width="${Math.round(w)}"`);
      attrs.push(`height="${Math.round(h)}"`);
    }
    attrs.push('loading="lazy"');
    attrs.push('decoding="async"');

    if ((node.asset?.cdnUrl || node.asset?.localPath) && ctx.usePublicCdn) {
      const urlPath = normalizeAssetUrlPath(node.asset.cdnUrl ?? node.asset.localPath ?? '');
      const planned = planAssetReference({
        bundler: ctx.bundler,
        urlPath,
        varName: toAssetVarName(urlPath),
      });
      for (const imp of planned.imports) ctx.imports.add(imp);
      attrs.push(`src={${planned.expression}}`);
    } else {
      ctx.pendingAssets.push({
        nodeId: node.figmaId || node.id,
        name: `${this._kebab(node.name || 'image')}.png`,
        type: 'image',
      });
      attrs.push('src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"');
    }

    return `${indent}<img ${attrs.join(' ')} />`;
  }

  private async _tryInlineSvg(node: ProcessedNode, ctx: RenderContext): Promise<string | null> {
    try {
      if (hasNonVectorDescendants(node)) return null;
      const result = await ctx.svgRenderer.renderNode(ctx.fileKey, node.figmaId, node.name, {
        inline: true,
        scale: 1,
        optimize: true,
        currentColor: node.role === 'icon',
      });
      return result ? result.vueCode : null;
    } catch {
      return null;
    }
  }

  // ============ 事件命名 ============

  private _eventFor(node: ProcessedNode, tag: string, used: Set<string>): SvelteEvent | null {
    let event: SvelteEvent['event'] | null = null;
    if (tag === 'form') event = 'submit';
    else if (tag === 'button' || node.role === 'button' || (node as any)._a11y?.isButton) event = 'click';
    else if (tag === 'input' || tag === 'textarea' || node.role === 'input') event = 'input';
    if (!event) return null;

    const suffix = event === 'click' ? 'Click' : event === 'input' ? 'Input' : 'Submit';
    const base = this._pascal(node.name || tag) || this._pascal(tag);
    let handler = `on${base}${suffix}`;
    let n = 2;
    while (used.has(handler)) handler = `on${base}${suffix}${n++}`;
    used.add(handler);
    return { event, handler, tag };
  }

  // ============ 标签/命名工具 ============

  private _selectTag(node: ProcessedNode): string {
    const semantic = (node as ProcessedNode & { _a11y?: { semanticTag?: string } })._a11y?.semanticTag;
    if (semantic) return semantic;
    const name = (node.name || '').toLowerCase();
    if (name.includes('textarea')) return 'textarea';
    if (name.includes('button') || node.role === 'button') return 'button';
    if (node.role === 'input' || name.includes('input')) return 'input';
    if (name.includes('form')) return 'form';
    if (name.includes('img') || name.includes('image') || node.role === 'image') return 'img';
    if (name.includes('heading') || name.includes('title')) {
      if (name.includes('h1')) return 'h1';
      if (name.includes('h3')) return 'h3';
      return 'h2';
    }
    if (name.includes('paragraph') || node.role === 'text' || name.includes('text')) return 'p';
    if (name.includes('link') || node.role === 'link') return 'a';
    if (name.includes('nav')) return 'nav';
    if (name.includes('header')) return 'header';
    if (name.includes('footer')) return 'footer';
    if (name.includes('main')) return 'main';
    if (name.includes('section') || name.includes('card')) return 'section';
    if (name.includes('list') && !name.includes('listitem')) return 'ul';
    if (name.includes('listitem') || name.includes('item')) return 'li';
    return 'div';
  }

  private _pascal(s: string): string {
    return s
      .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('')
      .replace(/[\u4e00-\u9fa5]/g, '');
  }

  private _kebab(s: string): string {
    return (
      s
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[^a-zA-Z0-9]/g, '-')
        .toLowerCase()
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'image'
    );
  }
}

// ============ 模块级纯函数 ============

function dedupeBy<T>(arr: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  return arr.filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function hasNonVectorDescendants(node: ProcessedNode): boolean {
  for (const child of node.children ?? []) {
    if (child.originalType === 'TEXT' || child.role === 'text') return true;
    if (child.role === 'image' || child.fills?.some((f) => f.type === 'image')) return true;
    if (hasNonVectorDescendants(child)) return true;
  }
  return false;
}

/**
 * 将 css-modules 渲染器产物中的 `composes: base;` 静态展开为完整声明。
 *
 * Svelte 编译器不实现 CSS Modules 语义；为保证产物在 scoped `<style>` 中
 * 独立成立，把被复用基类的声明按属性合并进当前规则（当前类声明优先）。
 * 输入为 CssModulesRenderer 的受控输出（`.kebab-name { ... }`）。
 */
export function flattenComposes(css: string): string {
  const ruleRe = /\.([a-z0-9-_]+)\s*\{([^}]*)\}/g;
  const raw = new Map<string, string>();
  const order: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = ruleRe.exec(css)) !== null) {
    const name = m[1]!;
    if (!raw.has(name)) order.push(name);
    raw.set(name, m[2]!);
  }

  const declMap = (body: string): Map<string, string> => {
    const map = new Map<string, string>();
    for (const line of body.split(';')) {
      const decl = line.trim();
      if (!decl) continue;
      const colon = decl.indexOf(':');
      if (colon <= 0) continue;
      map.set(decl.slice(0, colon).trim(), decl.slice(colon + 1).trim());
    }
    return map;
  };

  const resolve = (name: string, stack: string[] = []): Map<string, string> => {
    const merged = new Map<string, string>();
    if (stack.includes(name)) return merged; // 防御 composes 环
    const body = raw.get(name);
    if (body === undefined) return merged;
    const composes: string[] = [];
    const own = new Map<string, string>();
    for (const line of body.split(';')) {
      const decl = line.trim();
      if (!decl) continue;
      if (decl.startsWith('composes')) {
        const colon = decl.indexOf(':');
        const refs = decl
          .slice(colon + 1)
          .split(/\s+/)
          .map((s) => s.trim())
          .filter((s) => s && s !== 'from' && !s.startsWith('"') && !s.startsWith("'"));
        for (const r of refs) {
          // 仅保留同文件类名引用（忽略 from '...'）
          if (/^[a-z0-9-_]+$/.test(r) && r !== name) composes.push(r);
        }
        continue;
      }
      const colon = decl.indexOf(':');
      if (colon > 0) own.set(decl.slice(0, colon).trim(), decl.slice(colon + 1).trim());
    }
    for (const base of composes) {
      for (const [k, v] of resolve(base, [...stack, name])) merged.set(k, v);
    }
    for (const [k, v] of own) merged.set(k, v); // 自身声明覆盖基类
    return merged;
  };

  return order
    .map((name) => {
      const decls = resolve(name);
      const body = [...decls.entries()].map(([k, v]) => `  ${k}: ${v};`).join('\n');
      return `.${name} {\n${body}\n}`;
    })
    .join('\n\n');
}

/** 结构索引（与 weapp 生成器同算法，保持单一推断模型） */
function buildStructureIndexes(root: ProcessedNode, structure: WeappStructureInference) {
  const listByContainer = new Map<string, ListBinding[]>();
  const condByNode = new Map<string, ConditionBinding>();
  const skipMemberIds = new Set<string>();
  const prototypeListById = new Map<string, ListBinding>();
  const textBindingById = new Map<string, { alias: string; field: string }>();

  const findById = (node: ProcessedNode, id: string | undefined): ProcessedNode | null => {
    if (!id) return null;
    if (node.id === id) return node;
    for (const c of node.children ?? []) {
      const hit = findById(c, id);
      if (hit) return hit;
    }
    return null;
  };

  for (const list of structure.lists) {
    const arr = listByContainer.get(list.containerId) ?? [];
    arr.push(list);
    listByContainer.set(list.containerId, arr);
    const [protoId, ...rest] = list.repeatedChildIds;
    if (protoId) prototypeListById.set(protoId, list);
    for (const id of rest) skipMemberIds.add(id);

    const childContainerIds = new Set(
      structure.lists.filter((l) => l.parentListId === list.id).map((l) => l.containerId),
    );
    const proto = findById(root, protoId);
    if (proto) {
      const textIds: string[] = [];
      const walk = (node: ProcessedNode): void => {
        if (childContainerIds.has(node.id)) return;
        if (node.originalType === 'TEXT' || node.role === 'text') {
          textIds.push(node.id);
          return;
        }
        for (const c of node.children ?? []) walk(c);
      };
      walk(proto);
      list.fields.forEach((f, i) => {
        const tid = textIds[i];
        if (tid) textBindingById.set(tid, { alias: list.itemAlias, field: f.name });
      });
    }
  }
  for (const c of structure.conditions) condByNode.set(c.nodeId, c);

  return { listByContainer, condByNode, skipMemberIds, prototypeListById, textBindingById };
}

export function createSvelteGenerator(client: FigmaClient, options?: Partial<SvelteCodeGenOptions>): SvelteGenerator {
  return new SvelteGenerator(client, options);
}
