/**
 * 微信小程序代码生成服务 - Weapp Generator
 *
 * 核心职责：将 Figma 节点转换为微信小程序原生组件，
 * 输出 WXML + WXSS + JS + JSON 四件套。
 *
 * 微信小程序特点：
 * - 标签：view / text / image / button / navigator 等
 * - 样式：WXSS（CSS 子集），rpx 响应式像素单位
 * - 组件：Component 构造器，四件套文件
 * - 事件：bindtap / bindinput 等
 *
 * @module
 */

import type { DesignContext, ProcessedNode } from '../types/nodes.js';
import { escapeAttribute, sanitizeIdentifier, sanitizeText } from '../utils/security.js';
import { createA11yEnhancer } from './a11y-enhancer.js';
import type { EnhancementReports } from './code-generator.js';
import { createDesignSystemAnalyzer } from './design-system.js';
import type { FigmaClient } from './figma-client.js';
import { createFlexFixer } from './flex-fixer.js';
import { SvgInlineRenderer, isVectorNode } from './svg-inline-renderer.js';
import { createTailwindMapper, type TailwindMapping } from './tailwind-mapper.js';
import { resolveDesignWidth, pxToRpx } from './weapp-design-width.js';
import {
  createWeappAssetManifest,
  declareAsset,
  toManifestJSON,
  type WeappAssetManifest,
  type WeappAssetManifestEntry,
} from './weapp-assets.js';
import {
  processWeappAssets,
  assetSrcToken,
  resolveAssetSrcTokens,
  type AssetFetcher,
  type FetchedAssetBytes,
  type WeappAssetMode,
  type WeappIconStrategy,
  type WeappCdnUploader,
} from './weapp-asset-pipeline.js';
import {
  inferWeappStructure,
  assertBlockHasNoStyle,
  type WeappStructureInference,
  type WeappInferenceOptions,
  type ExplicitConditionInput,
  type ConditionBinding,
  type ConditionSuggestion,
  type ListBinding,
} from './weapp-structure-inferrer.js';
import { degradeStylesheet, type RenderTarget } from './weapp-compat/wxss-degrader.js';
import { collectVisualDeclarations } from './weapp-compat/weapp-visual-style.js';
import {
  extractExpectedNodeProperties,
  computeNodeFidelity,
  type FidelityReport,
} from './weapp-compat/fidelity-wxss.js';
import { parseRichText, isRichDocument } from './weapp-compat/rich-text-model.js';
import { buildRichTextNodes } from './weapp-compat/rich-text-wxml.js';
import {
  matchNativeComponent,
  getNativeComponent,
  validateNativeNesting,
} from './weapp-compat/native-components.js';
import {
  eventsForNode,
  ariaAttrAllowed,
  collectJsMethods,
  type WeappEventBinding,
  type HandlerInput,
} from './weapp-compat/weapp-events.js';

// ============ 类型定义 ============

export interface WeappCodeGenOptions {
  /** 组件名称（可选，未指定时从节点名推断） */
  componentName?: string;
  /** 场景名称（用于资源路径） */
  sceneName?: string;
  /** 设计稿宽度（默认 750，用于 px → rpx 转换） */
  designWidth?: number;
  /** 输出单位：rpx（推荐）或 px */
  unit?: 'rpx' | 'px';
  /** 是否使用 public 路径 */
  usePublicPath?: boolean;
  /** 跳过增强优化 */
  skipEnhancements?: boolean;
  /** 是否为页面组件（影响 JSON 配置） */
  isPage?: boolean;
  /** 位图资源处理模式（P0-22）：local（默认，CLI 落盘）| cdn | base64 */
  assetMode?: WeappAssetMode;
  /** 图标（svg）策略（P0-31 消费；此处仅透传） */
  iconStrategy?: WeappIconStrategy;
  /** cdn 模式资源托管的稳定基址（缺失则 cdn 资产报 MISSING_PUBLIC_BASE_URL） */
  publicBaseUrl?: string;
  /** 真实 CDN uploader；cdn 模式必须提供才能把字节资源标记为已上传 */
  cdnUploader?: WeappCdnUploader;
  /** Figma 位图导出倍率（getImages scale），默认 2 */
  pixelRatio?: 1 | 2 | 3;
  /** 列表/条件推断开关（P0-12）：list 默认 true，conditions 默认 false（保守） */
  inference?: WeappInferenceOptions;
  /** 显式条件绑定（用户确认的 if/elif/else/hidden，P0-12） */
  conditions?: ExplicitConditionInput[];
  /** 目标渲染器（P0-41）：webview（默认，不做属性级拦截）| skyline（按官方矩阵降级 WXSS） */
  renderer?: RenderTarget;
}

export interface GeneratedWeappComponent {
  /** WXML 模板代码 */
  wxml: string;
  /** WXSS 样式代码 */
  wxss: string;
  /** JS 逻辑代码 */
  js: string;
  /** JSON 配置代码 */
  json: string;
  /** 组件名称 */
  componentName: string;
  /** 待下载资源列表 */
  pendingAssets: Array<{ nodeId: string; name: string; type: string }>;
  /** 警告信息 */
  warnings: string[];
  /** 本次生成实际使用的 designWidth（显式覆盖或帧宽推断，P0-61） */
  designWidth: number;
  /** designWidth 来源：manual | frame-375 | frame-750 | frame-generic（P0-61） */
  designWidthSource: string;
  /** 资源清单（canonical 条目，P0-22；含 local/cdn/base64 解析结果与 unresolved） */
  assetManifest: WeappAssetManifestEntry[];
  /**
   * 已下载字节（sha256 → bytes/mime，P0-22）。CLI local 模式据此写盘；
   * 非序列化运行时句柄，MCP 输出不得包含。
   */
  assetBytes: Map<string, FetchedAssetBytes>;
  /** 显隐候选建议（默认不生成 wx:if，仅报告，P0-12） */
  conditionSuggestions: ConditionSuggestion[];
  /** 事件绑定汇总（P0-52） */
  events: Array<{ event: string; handler: string; tag: string }>;
  /**
   * WXSS 还原度覆盖率报告（P0-81 方案 B）：分母为同一份视觉映射清单在
   * 实际渲染节点上的承诺属性条数（wx:for 折叠成员/不可见子树按渲染口径剪枝），
   * 分子为生成 WXSS 中的声明条数；排除项（图片填充/多阴影等）可见但不进分母。
   */
  fidelity: FidelityReport;
  /** 增强报告 */
  reports: EnhancementReports;
}

/**
 * 小程序渲染上下文（内部类型）
 */
interface WeappRenderContext {
  depth: number;
  pendingAssets: Array<{ nodeId: string; name: string; type: string }>;
  warnings: string[];
  usePublicPath: boolean;
  sceneName: string;
  fileKey: string;
  svgRenderer: SvgInlineRenderer;
  designWidth: number;
  unit: 'rpx' | 'px';
  /** 资源状态机（渲染期 declare，渲染后统一解析，P0-22） */
  assetManifest: WeappAssetManifest;
  /** 位图导出倍率（透传给声明条目） */
  pixelRatio: 1 | 2 | 3;
  /** 列表/条件结构推断结果（P0-12） */
  structure: WeappStructureInference;
  /** 容器 id → 该容器上检测到的列表绑定（P0-12） */
  listByContainer: Map<string, ListBinding[]>;
  /** 节点 id → 条件绑定（P0-12） */
  condByNode: Map<string, ConditionBinding>;
  /** 重复组中非原型成员 id（渲染时折叠跳过，P0-12） */
  skipMemberIds: Set<string>;
  /** 列表原型节点 id → 所属列表（渲染该元素时注入 wx:for，P0-12） */
  prototypeListById: Map<string, ListBinding>;
  /** TEXT 节点 id → 列表作用域插值（{{alias.field}}，P0-12） */
  textBindingById: Map<string, { alias: string; field: string }>;
  /** 已用 handler 名集合（P0-52，跨节点全局唯一） */
  usedHandlerNames: Set<string>;
  /** 收集到的事件处理器（P0-52，供 JS methods 生成） */
  eventHandlers: HandlerInput[];
  /** WBS-P2-22：rich-text nodes 数据（dataKey → 节点数组），注入 JS data */
  richTextData: Map<string, unknown>;
  /** 收集到的样式规则（class → 样式对象） */
  styleRules: Map<string, Record<string, string | number>>;
  /** R1 QA：节点 id → 挂到该节点上的自定义 class（fidelity 按节点比对） */
  classByNodeId: Map<string, string[]>;
  /**
   * class 名称计数器（共享可变持有：_renderChildren 以浅拷贝传递 ctx、
   * depth 等值靠拷贝隔离，但计数器必须跨兄弟节点持续递增，否则同层 class
   * 重名导致 styleRules 相互覆盖——P0-81 保真度闸门暴露）。
   */
  classCounter: { value: number };
}

type ResolvedWeappOptions = Required<
  Omit<WeappCodeGenOptions, 'componentName' | 'iconStrategy' | 'publicBaseUrl' | 'cdnUploader' | 'inference' | 'conditions'>
> & {
  componentName?: string;
  iconStrategy?: WeappIconStrategy;
  publicBaseUrl?: string;
  cdnUploader?: WeappCdnUploader;
  inference?: WeappInferenceOptions;
  conditions?: ExplicitConditionInput[];
};

const DEFAULT_WEAPP_OPTIONS: ResolvedWeappOptions = {
  componentName: undefined, // 未指定时从节点名推断
  sceneName: '',
  designWidth: 750,
  unit: 'rpx',
  usePublicPath: true,
  skipEnhancements: false,
  isPage: false,
  assetMode: 'local',
  pixelRatio: 2,
  cdnUploader: undefined,
  renderer: 'webview',
};

// ============ HTML → 小程序标签映射 ============

const HTML_TO_WEAPP_TAG: Record<string, string> = {
  div: 'view',
  span: 'text',
  p: 'text',
  h1: 'text',
  h2: 'text',
  h3: 'text',
  h4: 'text',
  h5: 'text',
  h6: 'text',
  section: 'view',
  article: 'view',
  header: 'view',
  footer: 'view',
  nav: 'view',
  main: 'view',
  aside: 'view',
  ul: 'view',
  ol: 'view',
  li: 'view',
  img: 'image',
  button: 'button',
  input: 'input',
  textarea: 'textarea',
  a: 'navigator',
  hr: 'view',
  br: 'text',
  label: 'text',
  form: 'view',
  i: 'text',
  b: 'text',
  strong: 'text',
  em: 'text',
  small: 'text',
};

// ============ WeappGenerator 类 ============

export class WeappGenerator {
  private readonly _client: FigmaClient;
  private readonly _svgRenderer: SvgInlineRenderer;
  private _options: ResolvedWeappOptions;
  /** 构造器中显式传入的 designWidth（区别于 DEFAULT 的 750，P0-61） */
  private readonly _explicitDesignWidth?: number;

  constructor(client: FigmaClient, options: Partial<WeappCodeGenOptions> = {}) {
    this._client = client;
    this._options = { ...DEFAULT_WEAPP_OPTIONS, ...options };
    if (typeof options.designWidth === 'number') this._explicitDesignWidth = options.designWidth;
    this._svgRenderer = new SvgInlineRenderer(client, {
      inline: false, // 小程序不支持内联 SVG，导出为图片
      scale: 2,
      optimize: true,
      currentColor: false,
    });
  }

  async generateFromContext(
    context: DesignContext,
    options: Partial<WeappCodeGenOptions> = {},
  ): Promise<GeneratedWeappComponent> {
    const opts = { ...this._options, ...options };
    // 显式传入的 componentName 优先级最高，其次使用节点名
    const componentName = sanitizeIdentifier(
      opts.componentName || context.node.name || 'MyComponent',
    );

    const a11yEnhancer = createA11yEnhancer();
    const flexFixer = createFlexFixer();
    const designSystem = createDesignSystemAnalyzer();
    const twMapper = createTailwindMapper({ allowArbitrary: true });

    const reports: EnhancementReports = {};
    const pendingAssets: Array<{ nodeId: string; name: string; type: string }> = [];
    const warnings: string[] = [];
    const styleRules = new Map<string, Record<string, string | number>>();
    // R1 QA：节点 → 其生成 class 的归属表（fidelity 按节点比对属性值，避免跨节点同名声明误算命中）
    const classByNodeId = new Map<string, string[]>();
    // P0-22：位图资源状态机（渲染期 declare，渲染后统一取字节解析）
    const assetManifest = createWeappAssetManifest();
    // P0-52：事件 handler 收集（全局唯一命名 + JS methods 生成）
    const usedHandlerNames = new Set<string>();
    const eventHandlers: HandlerInput[] = [];
    const richTextData = new Map<string, unknown>();

    // 透传 design-context 层的警告
    if (context.warnings && context.warnings.length > 0) {
      warnings.push(...context.warnings);
    }

    // P0-61：designWidth 优先用显式覆盖，否则从目标帧宽度推断（375/750/通用）
    const frameWidth = context.node.size?.width ?? DEFAULT_WEAPP_OPTIONS.designWidth;
    const childWidths = (context.node.children ?? [])
      .map((c) => c.size?.width)
      .filter((w): w is number => typeof w === 'number' && Number.isFinite(w) && w > 0);
    const dwResolved = resolveDesignWidth({
      frameWidth,
      manualOverride: options.designWidth ?? this._explicitDesignWidth,
      childWidths,
    });
    warnings.push(...dwResolved.warnings.map((w) => w.message));

    if (!opts.skipEnhancements) {
      reports.flexFixes = flexFixer.applyFixes(context.node);
      reports.a11y = a11yEnhancer.enhance(context.node);
      reports.designSystem = designSystem.analyze(context);
    }

    // P0-12：列表/条件结构推断（默认列表开、条件保守仅建议），并预建渲染索引
    const structure = inferWeappStructure(
      context.node as Parameters<typeof inferWeappStructure>[0],
      opts.inference ?? {},
      opts.conditions ?? [],
    );
    for (const w of structure.warnings) warnings.push(`${w.code}: ${w.message}`);
    const structureIndexes = this._buildStructureIndexes(context.node, structure);

    // 生成 WXML
    const wxmlContent = await this._renderNode(
      context.node,
      twMapper,
      {
        depth: 0,
        pendingAssets,
        warnings,
        usePublicPath: opts.usePublicPath !== false,
        sceneName: opts.sceneName || '',
        fileKey: context.fileKey,
        svgRenderer: this._svgRenderer,
        designWidth: dwResolved.designWidth,
        unit: opts.unit,
        assetManifest,
        pixelRatio: opts.pixelRatio,
        structure,
        ...structureIndexes,
        usedHandlerNames,
        eventHandlers,
        richTextData,
        styleRules,
        classByNodeId,
        classCounter: { value: 0 },
      },
      true,
    );

    // P0-22：渲染已用 token 占位 <image src>，此处批量取字节 → 三模式解析 → 回填 src
    let resolvedWxmlContent = wxmlContent;
    let assetBytes = new Map<string, FetchedAssetBytes>();
    if (assetManifest._byId.size > 0) {
      const fetcher = await this._buildWeappAssetFetcher(
        context.fileKey,
        [...assetManifest._byId.values()],
        opts.pixelRatio,
      );
      const processed = await processWeappAssets(assetManifest, fetcher, {
        assetMode: opts.assetMode,
        iconStrategy: opts.iconStrategy,
        publicBaseUrl: opts.publicBaseUrl,
        cdnUploader: opts.cdnUploader,
      });
      assetBytes = processed.downloaded;
      const { wxml: replacedWxml, unresolved } = resolveAssetSrcTokens(wxmlContent, assetManifest);
      resolvedWxmlContent = replacedWxml;
      for (const id of unresolved) {
        const entry = assetManifest._byId.get(id);
        warnings.push(
          `资源 ${entry?.figmaRef.nodeId ?? id} 未能解析（${entry?.reason ?? 'UNKNOWN'}），已从 <image> 移除 src`,
        );
      }
    }

    // 组装各文件
    const wxml = this._generateWxml(resolvedWxmlContent, componentName);
    const wxss = this._generateWxss(styleRules, componentName, opts.renderer, warnings);

    // P0-81（方案 B，R1 QA 加固）：WXSS 还原度按**节点+属性+值**比对——
    // 生成侧直接取自 styleRules（节点→class 归属表），错色/错尺寸/跨节点同名声明
    // 均不计命中；剪枝口径与渲染决策一致。
    const forceRenderIds = new Set<string>([
      ...structureIndexes.condByNode.keys(),
      ...structureIndexes.prototypeListById.keys(),
    ]);
    const expectedNodes = extractExpectedNodeProperties(context.node, 750, dwResolved.designWidth, {
      skipNodeIds: structureIndexes.skipMemberIds,
      forceRenderIds,
    });
    const generatedByNode = new Map<string, Record<string, string>>();
    for (const [nodeId, classNames] of classByNodeId) {
      const merged: Record<string, string> = {};
      for (const cn of classNames) {
        const rule = styleRules.get(cn);
        if (!rule) continue;
        for (const [prop, value] of Object.entries(rule)) merged[this._camelToKebab(prop)] = String(value);
      }
      generatedByNode.set(nodeId, merged);
    }
    const fidelity = computeNodeFidelity(expectedNodes, generatedByNode);

    const methodsReport = collectJsMethods(eventHandlers, { isCustomComponent: !opts.isPage });
    const js = this._generateJs(
      componentName,
      opts.isPage,
      structure.placeholderData,
      methodsReport.methodsCode,
      richTextData,
    );
    const json = this._generateJson(componentName, opts.isPage);

    // 去重 pendingAssets
    const assetSeen = new Set<string>();
    const dedupedAssets = pendingAssets.filter((a) => {
      if (assetSeen.has(a.nodeId)) return false;
      assetSeen.add(a.nodeId);
      return true;
    });

    return {
      wxml,
      wxss,
      js,
      json,
      componentName,
      pendingAssets: dedupedAssets,
      warnings: Array.from(new Set(warnings)),
      designWidth: dwResolved.designWidth,
      designWidthSource: dwResolved.source,
      assetManifest: toManifestJSON(assetManifest),
      assetBytes,
      conditionSuggestions: structure.conditionSuggestions,
      // P0-52：事件绑定汇总（handler 名 + 事件类型，供调用方核对 JS 方法）
      events: eventHandlers.map((h) => ({ event: h.event, handler: h.handler, tag: h.tag })),
      // P0-81：WXSS 还原度覆盖率（方案 B，属性条数口径）
      fidelity,
      reports,
    };
  }

  // ============ WXML 生成 ============

  private _generateWxml(content: string, componentName: string): string {
    const lines: string[] = [];
    lines.push(`<!-- ${componentName}.wxml -->`);
    lines.push(`<!-- 由 figma-dev-tools 自动生成，请勿手动修改 -->`);
    lines.push('');
    lines.push(content.trim());
    lines.push('');
    return lines.join('\n');
  }

  // ============ WXSS 生成 ============

  private _generateWxss(
    styleRules: Map<string, Record<string, string | number>>,
    componentName: string,
    renderer: RenderTarget = 'webview',
    warnings: string[] = [],
  ): string {
    const lines: string[] = [];
    lines.push(`/* ${componentName}.wxss */`);
    lines.push('/* 由 figma-dev-tools 自动生成 */');
    lines.push('');

    if (styleRules.size === 0) {
      lines.push('/* 暂无自定义样式 */');
    } else {
      for (const [className, styles] of styleRules) {
        // 先转成标准 CSS 声明（camelCase→kebab、数值补单位）
        const declarations = Object.entries(styles).map(([prop, value]) => ({
          property: this._camelToKebab(prop),
          value: typeof value === 'number' ? `${value}${this._options.unit}` : String(value),
        }));

        // P0-41：Skyline 目标按官方矩阵降级；WebView 原样输出（不做属性级拦截）
        let outputDecls = declarations;
        if (renderer === 'skyline') {
          const report = degradeStylesheet(declarations, { target: 'skyline' });
          outputDecls = report.outputs;
          for (const w of report.warnings) {
            warnings.push(`[WXSS Skyline] .${className} 的 ${w.property}: ${w.message}（${w.code}）`);
          }
        }

        if (outputDecls.length === 0) {
          lines.push(`/* .${className}: 声明在 Skyline 均不受支持，已剔除（见 warning） */`);
          lines.push('');
          continue;
        }
        lines.push(`.${className} {`);
        for (const decl of outputDecls) {
          lines.push(`  ${decl.property}: ${decl.value};`);
        }
        lines.push('}');
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  // ============ JS 生成 ============

  private _generateJs(
    componentName: string,
    isPage: boolean,
    placeholderData: Record<string, unknown> = {},
    methodsCode = '',
    richTextData?: Map<string, unknown>,
  ): string {
    const lines: string[] = [];
    lines.push(`// ${componentName}.js`);
    lines.push('// 由 figma-dev-tools 自动生成');
    lines.push('');

    // P0-52：事件方法骨架。methodsCode 基准缩进 4 空格（Component methods 内）；
    // Page 的方法是顶层成员，整体左移 2 空格。
    const componentMethodLines = methodsCode ? methodsCode.split('\n') : [];
    const pageMethodLines = methodsCode
      ? methodsCode.split('\n').map((l) => (l.startsWith('  ') ? l.slice(2) : l))
      : [];

    // P0-12：有列表/条件占位数据时内联进 data（无数据保持 TODO 模板）；
    // WBS-P2-22：rich-text nodes 数据同样内联
    const mergedData: Record<string, unknown> = { ...placeholderData };
    if (richTextData) {
      for (const [key, value] of richTextData) mergedData[key] = value;
    }
    const hasData = Object.keys(mergedData).length > 0;
    const dataBlock = hasData ? this._formatDataBlock(mergedData) : null;

    if (isPage) {
      lines.push('Page({');
      lines.push('  /**');
      lines.push('   * 页面的初始数据');
      lines.push('   */');
      if (dataBlock) {
        lines.push(...dataBlock);
      } else {
        lines.push('  data: {');
        lines.push('    // TODO: 添加页面数据');
        lines.push('  },');
      }
      if (pageMethodLines.length > 0) {
        lines.push('');
        lines.push(...pageMethodLines);
      }
      lines.push('');
      lines.push('  /**');
      lines.push('   * 生命周期函数--监听页面加载');
      lines.push('   */');
      lines.push('  onLoad(options) {');
      lines.push('    // TODO: 页面加载逻辑');
      lines.push('  },');
      lines.push('');
      lines.push('  /**');
      lines.push('   * 生命周期函数--监听页面初次渲染完成');
      lines.push('   */');
      lines.push('  onReady() {');
      lines.push('    // TODO: 渲染完成逻辑');
      lines.push('  },');
      lines.push('');
      lines.push('  /**');
      lines.push('   * 生命周期函数--监听页面显示');
      lines.push('   */');
      lines.push('  onShow() {');
      lines.push('    // TODO: 页面显示逻辑');
      lines.push('  },');
      lines.push('');
      lines.push('  /**');
      lines.push('   * 生命周期函数--监听页面隐藏');
      lines.push('   */');
      lines.push('  onHide() {');
      lines.push('    // TODO: 页面隐藏逻辑');
      lines.push('  },');
      lines.push('');
      lines.push('  /**');
      lines.push('   * 生命周期函数--监听页面卸载');
      lines.push('   */');
      lines.push('  onUnload() {');
      lines.push('    // TODO: 页面卸载逻辑');
      lines.push('  },');
      lines.push('});');
    } else {
      lines.push('Component({');
      lines.push('  /**');
      lines.push('   * 组件的属性列表');
      lines.push('   */');
      lines.push('  properties: {');
      lines.push('    // TODO: 添加组件属性');
      lines.push('    // 例如：');
      lines.push('    // title: {');
      lines.push('    //   type: String,');
      lines.push('    //   value: \'\'');
      lines.push('    // }');
      lines.push('  },');
      lines.push('');
      lines.push('  /**');
      lines.push('   * 组件的初始数据');
      lines.push('   */');
      if (dataBlock) {
        lines.push(...dataBlock);
      } else {
        lines.push('  data: {');
        lines.push('    // TODO: 添加组件内部数据');
        lines.push('  },');
      }
      lines.push('');
      lines.push('  /**');
      lines.push('   * 组件的方法列表');
      lines.push('   */');
      lines.push('  methods: {');
      if (componentMethodLines.length > 0) {
        lines.push(...componentMethodLines);
      } else {
        lines.push('    // TODO: 添加组件方法');
        lines.push('    // 例如：');
        lines.push('    // handleTap(e) {');
        lines.push('    //   this.triggerEvent(\'tap\', e.detail);');
        lines.push('    // }');
      }
      lines.push('  },');
      lines.push('});');
    }

    lines.push('');
    return lines.join('\n');
  }

  /**
   * 把占位数据序列化为 JS data 块（P0-12）：JSON 2 空格缩进整体右移 2 空格，
   * 包裹为 `  data: { … },`，作为 Page({/Component({ 的直接成员。
   */
  private _formatDataBlock(data: Record<string, unknown>): string[] {
    const json = JSON.stringify(data, null, 2);
    const body = json
      .split('\n')
      .slice(1, -1) // 去掉最外层 { 与 }
      .map((line) => `  ${line}`)
      // 合法标识符键去掉 JSON 引号，输出 JS 对象字面量风格（cardList: [）
      .map((line) => line.replace(/^(\s+)"([A-Za-z_$][\w$]*)":/g, '$1$2:'))
      .join('\n');
    return ['  data: {', body, '  },'];
  }

  // ============ JSON 配置生成 ============

  private _generateJson(componentName: string, isPage: boolean): string {
    const config: Record<string, unknown> = {};

    if (isPage) {
      config.navigationBarTitleText = componentName;
      config.usingComponents = {};
    } else {
      config.component = true;
      config.usingComponents = {};
    }

    return JSON.stringify(config, null, 2) + '\n';
  }

  // ============ 节点渲染核心 ============

  private async _renderNode(
    node: ProcessedNode,
    twMapper: ReturnType<typeof createTailwindMapper>,
    ctx: WeappRenderContext,
    isRoot = false,
  ): Promise<string> {
    // P0-12：不可见节点若承载显式条件（wx:if/hidden），仍渲染元素交由指令控制；
    // 无绑定的不可见节点保持原行为（不出现在 WXML）。
    if (node.visible === false && !this._hasStructureDirective(node, ctx)) return '';

    const baseIndent = isRoot ? 0 : ctx.depth + 1;
    const indent = '  '.repeat(baseIndent);

    // 类型增强：安全访问扩展字段
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

    // SVG 矢量节点 → 导出为图片（小程序不支持内联 SVG）
    if (isVectorNode(node)) {
      const svgResult = await this._tryRenderSvgAsImage(node, ctx);
      if (svgResult) {
        return `${indent}${svgResult}`;
      }
      // 失败时回退到普通渲染
    }

    // 纯布局层扁平化（列表折叠/条件指令同样生效）
    if (
      !isRoot &&
      (node.role === 'layout-only' || node.originalType === 'GROUP') &&
      node.children &&
      node.children.length > 0
    ) {
      const childResults = await this._renderChildren(node, twMapper, ctx, 0);
      return childResults.filter(Boolean).join('\n');
    }

    // 可复用组件
    if (node.role === 'reusable-component' && node.componentKey) {
      const compName = sanitizeIdentifier(node.name || 'CustomComponent');
      return `${indent}<!-- TODO: 引入并使用自定义组件 ${compName} -->\n${indent}<${this._kebabCase(compName)} />`;
    }

    const mapping: TailwindMapping = twMapper.mapNode(node);

    // 收集警告
    if (mapping.warnings && mapping.warnings.length > 0) {
      for (const w of mapping.warnings) {
        const warningWithNode = `[${node.name || node.figmaId}] ${w}`;
        if (!ctx.warnings.includes(warningWithNode)) {
          ctx.warnings.push(warningWithNode);
        }
      }
    }

    // 生成 class 名称和样式规则
    const { className, hasStyles } = this._generateClassAndStyles(node, mapping, ctx);

    const tag = this._selectWeappTag(node);

    // 文本节点（P0-12：列表原型内文本插值为 {{item.field}}）
    if (node.originalType === 'TEXT' || node.role === 'text') {
      const binding = ctx.textBindingById.get(node.id);
      const textContent = binding
        ? `{{${binding.alias}.${binding.field}}}`
        : sanitizeText(node.textContent || '');
      if (className) {
        return `${indent}<${tag} class="${className}">${textContent}</${tag}>`;
      }
      return `${indent}<${tag}>${textContent}</${tag}>`;
    }

    // 图片节点
    const isImageNode =
      (node.originalType === 'RECTANGLE' && node.fills?.some((f) => f.type === 'image')) ||
      node.asset ||
      tag === 'image';

    if (isImageNode) {
      return this._renderImageNode(node, className, ctx, indent);
    }

    // 按钮节点
    if (tag === 'button' || node.role === 'button') {
      return this._renderButtonNode(node, className, ctx, indent);
    }

    // 输入框节点
    if (tag === 'input' || node.role === 'input') {
      return this._renderInputNode(node, className, ctx, indent);
    }

    // 链接/导航节点
    if (tag === 'navigator' || node.role === 'link') {
      return this._renderNavigatorNode(node, className, ctx, indent);
    }

    // P0-51：原生组件（scroll-view/swiper/picker/rich-text 等，按名称信号识别）
    const nativeMatch = matchNativeComponent(node as Parameters<typeof matchNativeComponent>[0]);
    if (nativeMatch) {
      return this._renderNativeComponent(node, nativeMatch.tag, className, twMapper, ctx, indent);
    }

    // 普通容器节点
    return this._renderContainerNode(node, tag, className, mapping, twMapper, ctx, indent, isRoot);
  }

  /**
   * P0-52：统一计算节点的事件属性并登记 handler（bind/catch/input/change/submit/...）。
   * 由各渲染方法调用，替代历史上散落硬编码的 bindtap="handleTap" 等。
   */
  private _eventAttrsFor(node: ProcessedNode, tag: string, ctx: WeappRenderContext): string[] {
    const nativeMatch = matchNativeComponent(node as Parameters<typeof matchNativeComponent>[0]);
    const bindings: WeappEventBinding[] = eventsForNode(
      {
        id: node.id,
        name: node.name || '',
        tag,
        role: node.role,
        isButton: (node as any)._a11y?.isButton,
        nameSignals: nativeMatch ? [nativeMatch.signal] : [],
      },
      ctx.usedHandlerNames,
    );
    if (bindings.length === 0) return [];
    for (const b of bindings) {
      ctx.eventHandlers.push({ tag, handler: b.handler, event: b.event, detailHint: b.detailHint });
    }
    return bindings.map((b) => `${b.attr}="${b.handler}"`);
  }

  // ============ 各类节点渲染方法 ============

  private _renderImageNode(
    node: ProcessedNode,
    className: string,
    ctx: WeappRenderContext,
    indent: string,
  ): string {
    const attrs: string[] = [];
    if (className) attrs.push(`class="${className}"`);

    // mode 属性（小程序 image 特有）
    attrs.push('mode="aspectFill"');

    // lazy-load
    attrs.push('lazy-load="true"');

    // alt 文本（小程序不支持 alt，但可以加 aria-label）
    let altText = node.name || '';
    if ((node as any)._a11y?.isDecorative) {
      altText = '';
    } else if ((node as any)._a11y?.altText) {
      altText = (node as any)._a11y.altText;
    }
    const safeAltText = altText ? escapeAttribute(sanitizeText(altText)) : '';
    if (safeAltText) attrs.push(`aria-label="${safeAltText}"`);

    // src 处理：所有图片必须经过 asset 状态机，不能直接信任 node.asset URL。
    const nodeId = node.figmaId || node.id;
    const assetName = this._kebabCase(node.name || 'image') + '.png';
    const entry = declareAsset(ctx.assetManifest, {
      figmaRef: { nodeId, imageRef: null },
      kind: 'raster',
      name: assetName,
      scene: ctx.sceneName || 'default',
      pixelRatio: ctx.pixelRatio,
    });
    ctx.pendingAssets.push({ nodeId, name: assetName, type: 'image' });
    attrs.push(`src="${assetSrcToken(entry.id)}"`);
    return `${indent}<image ${attrs.join(' ')} />`;
  }

  /**
   * 结构感知的子节点渲染（P0-12）：
   * 重复组的非原型成员直接折叠（不产生静态副本）；原型/普通节点渲染后注入
   * wx:for 与条件指令。depthDelta=0 用于布局扁平化层（不增加缩进层级）。
   */
  private async _renderChildren(
    parent: ProcessedNode,
    twMapper: ReturnType<typeof createTailwindMapper>,
    ctx: WeappRenderContext,
    depthDelta: 0 | 1,
  ): Promise<string[]> {
    const out: string[] = [];
    for (const child of parent.children ?? []) {
      if (ctx.skipMemberIds.has(child.id)) continue;
      const html = await this._renderNode(
        child,
        twMapper,
        { ...ctx, depth: ctx.depth + depthDelta },
        false,
      );
      if (!html) continue;
      out.push(this._applyStructureDirectives(child, html, ctx));
    }
    return out;
  }

  private _hasStructureDirective(node: ProcessedNode, ctx: WeappRenderContext): boolean {
    return ctx.condByNode.has(node.id) || ctx.prototypeListById.has(node.id);
  }

  /**
   * 把列表/条件指令写到节点最外层开标签上（block 模型时外包无样式 <block>）。
   */
  private _applyStructureDirectives(
    node: ProcessedNode,
    html: string,
    ctx: WeappRenderContext,
  ): string {
    const list = ctx.prototypeListById.get(node.id);
    const cond = ctx.condByNode.get(node.id);
    const attrs: string[] = [];
    if (list) {
      attrs.push(`wx:for="{{${list.dataPath}}}"`);
      attrs.push(`wx:for-item="${list.itemAlias}"`);
      attrs.push(`wx:for-index="${list.indexAlias}"`);
      attrs.push(`wx:key="${list.wxKey}"`);
    }
    if (cond) {
      switch (cond.directive) {
        case 'wx:if':
          attrs.push(`wx:if="{{${cond.expression}}}"`);
          break;
        case 'wx:elif':
          attrs.push(`wx:elif="{{${cond.expression}}}"`);
          break;
        case 'wx:else':
          attrs.push('wx:else');
          break;
        case 'hidden':
          attrs.push(`hidden="{{${cond.expression}}}"`);
          break;
      }
    }
    if (attrs.length === 0) return html;

    const useBlock = list?.wrapper === 'block' || cond?.wrapper === 'block';
    if (useBlock) {
      // <block> 仅是无样式逻辑包裹：断言其自身不带任何 class/style
      assertBlockHasNoStyle({});
      const indentMatch = /^(\s*)/.exec(html);
      const indent = indentMatch?.[1] ?? '';
      return `${indent}<block ${attrs.join(' ')}>\n${html}\n${indent}</block>`;
    }
    return this._injectOpenTagAttrs(html, attrs);
  }

  /** 在片段的第一个元素开标签（跳过注释）上插入属性 */
  private _injectOpenTagAttrs(html: string, attrs: string[]): string {
    return html.replace(/<([a-zA-Z][\w-]*)([\s>])/, (_m, tag: string, after: string) => {
      return `<${tag} ${attrs.join(' ')}${after}`;
    });
  }

  /**
   * 由 P0-11 结构推断结果预建渲染索引（P0-12）：
   * 容器→列表、节点→条件、折叠成员集合、原型→列表，以及原型子树 TEXT 的插值绑定。
   * TEXT 绑定在渲染前静态确定，规避渲染期 Promise 并发下的作用域计数问题。
   */
  private _buildStructureIndexes(root: ProcessedNode, structure: WeappStructureInference) {
    const listByContainer = new Map<string, ListBinding[]>();
    const condByNode = new Map<string, ConditionBinding>();
    const skipMemberIds = new Set<string>();
    const prototypeListById = new Map<string, ListBinding>();
    const textBindingById = new Map<string, { alias: string; field: string }>();

    for (const list of structure.lists) {
      const arr = listByContainer.get(list.containerId) ?? [];
      arr.push(list);
      listByContainer.set(list.containerId, arr);
      // 每组只渲染第一个（原型），其余折叠由 wx:for 展开
      const [protoId, ...rest] = list.repeatedChildIds;
      if (protoId) prototypeListById.set(protoId, list);
      for (const id of rest) skipMemberIds.add(id);

      // 原型 TEXT → {{itemAlias.field}}；跳过直接子列表的容器子树
      const childContainerIds = new Set(
        structure.lists.filter((l) => l.parentListId === list.id).map((l) => l.containerId),
      );
      const protoNode = this._findNodeById(root, protoId!);
      if (protoNode) {
        const textIds: string[] = [];
        const walk = (node: ProcessedNode): void => {
          if (childContainerIds.has(node.id)) return;
          if (node.originalType === 'TEXT' || node.role === 'text') {
            textIds.push(node.id);
            return;
          }
          for (const c of node.children ?? []) walk(c);
        };
        walk(protoNode);
        list.fields.forEach((f, i) => {
          const tid = textIds[i];
          if (tid) textBindingById.set(tid, { alias: list.itemAlias, field: f.name });
        });
      }
    }

    for (const cond of structure.conditions) condByNode.set(cond.nodeId, cond);

    return { listByContainer, condByNode, skipMemberIds, prototypeListById, textBindingById };
  }

  private _findNodeById(root: ProcessedNode, id: string): ProcessedNode | null {
    if (root.id === id) return root;
    for (const c of root.children ?? []) {
      const hit = this._findNodeById(c, id);
      if (hit) return hit;
    }
    return null;
  }

  /**
   * 构造资产字节 fetcher（P0-22/P0-31）：按 kind 分组一次性批量请求 Figma 导出 URL
   * （raster→png、svg→svg；getImages 自动分批 + 缓存），再逐条下载字节。
   * 单图失败返回 null（→ FETCH_FAILED），不阻断整体生成。
   */
  private async _buildWeappAssetFetcher(
    fileKey: string,
    entries: WeappAssetManifestEntry[],
    pixelRatio: 1 | 2 | 3,
  ): Promise<AssetFetcher> {
    const groups: Array<{ kind: 'raster' | 'svg'; format: 'png' | 'svg'; ids: string[] }> = [
      {
        kind: 'raster',
        format: 'png',
        ids: [...new Set(entries.filter((e) => e.kind === 'raster').map((e) => e.figmaRef.nodeId))],
      },
      {
        kind: 'svg',
        format: 'svg',
        ids: [...new Set(entries.filter((e) => e.kind === 'svg').map((e) => e.figmaRef.nodeId))],
      },
    ];
    const urlMaps: Record<'raster' | 'svg', Record<string, string | null>> = {
      raster: {},
      svg: {},
    };
    for (const group of groups) {
      if (group.ids.length === 0) continue;
      try {
        const res = await this._client.getImages(fileKey, group.ids, group.format, pixelRatio);
        urlMaps[group.kind] = res.images ?? {};
      } catch {
        urlMaps[group.kind] = {};
      }
    }

    return async (req) => {
      if (req.kind !== 'raster' && req.kind !== 'svg') return null;
      const url = urlMaps[req.kind][req.nodeId];
      if (!url) return null;
      try {
        const buf = await this._client.downloadImage(url);
        return { bytes: buf, mime: req.kind === 'svg' ? 'image/svg+xml' : 'image/png' };
      } catch {
        return null;
      }
    };
  }

  private _renderButtonNode(
    node: ProcessedNode,
    className: string,
    ctx: WeappRenderContext,
    indent: string,
  ): string {
    const attrs: string[] = [];
    if (className) attrs.push(`class="${className}"`);
    attrs.push(...this._eventAttrsFor(node, 'button', ctx));

    // 按钮文本
    let textContent = '';
    if (node.children && node.children.length > 0) {
      const textChild = node.children.find((c) => c.originalType === 'TEXT' || c.role === 'text');
      if (textChild && textChild.textContent) {
        textContent = sanitizeText(textChild.textContent);
      }
    }
    if (!textContent) {
      textContent = sanitizeText(node.name || '按钮');
    }

    ctx.warnings.push(`[${node.name || node.figmaId}] 请在 JS 中实现 handleTap 方法`);

    return `${indent}<button ${attrs.join(' ')}>${textContent}</button>`;
  }

  private _renderInputNode(
    node: ProcessedNode,
    className: string,
    ctx: WeappRenderContext,
    indent: string,
  ): string {
    const attrs: string[] = [];
    if (className) attrs.push(`class="${className}"`);

    // placeholder
    let placeholder = '';
    if (node.name && node.name.toLowerCase().includes('input')) {
      placeholder = '请输入';
    } else {
      placeholder = node.name || '';
    }
    if (placeholder) {
      attrs.push(`placeholder="${escapeAttribute(sanitizeText(placeholder))}"`);
    }

    attrs.push(
      ...this._eventAttrsFor(node, String(node.role) === 'textarea' ? 'textarea' : 'input', ctx),
    );
    ctx.warnings.push(`[${node.name || node.figmaId}] 请在 JS 中实现输入处理方法`);

    return `${indent}<input ${attrs.join(' ')} />`;
  }

  private _renderNavigatorNode(
    node: ProcessedNode,
    className: string,
    ctx: WeappRenderContext,
    indent: string,
  ): string {
    const attrs: string[] = [];
    if (className) attrs.push(`class="${className}"`);
    attrs.push('url=""');
    attrs.push('hover-class="none"');

    // 链接文本
    let textContent = '';
    if (node.children && node.children.length > 0) {
      const textChild = node.children.find((c) => c.originalType === 'TEXT' || c.role === 'text');
      if (textChild && textChild.textContent) {
        textContent = sanitizeText(textChild.textContent);
      }
    }
    if (!textContent) {
      textContent = sanitizeText(node.name || '链接');
    }

    ctx.warnings.push(`[${node.name || node.figmaId}] 请设置 navigator 的 url 属性`);

    return `${indent}<navigator ${attrs.join(' ')}>${textContent}</navigator>`;
  }

  private async _renderContainerNode(
    node: ProcessedNode,
    tag: string,
    className: string,
    mapping: TailwindMapping,
    twMapper: ReturnType<typeof createTailwindMapper>,
    ctx: WeappRenderContext,
    indent: string,
    isRoot: boolean,
  ): Promise<string> {
    const attrs: string[] = [];
    if (className) attrs.push(`class="${className}"`);

    // aria-label（P0-52：按基础库能力矩阵决定是否输出到该标签）
    if ((node as any)._a11y?.ariaLabel && ariaAttrAllowed(tag, 'aria-label')) {
      const safeLabel = escapeAttribute(sanitizeText((node as any)._a11y.ariaLabel));
      attrs.push(`aria-label="${safeLabel}"`);
    }

    // 点击事件（可点击容器，P0-52 统一事件映射；mask/overlay 自动 catchtap）
    if ((node as any)._a11y?.isButton || node.role === 'button') {
      attrs.push(...this._eventAttrsFor(node, tag, ctx));
      ctx.warnings.push(`[${node.name || node.figmaId}] 请在 JS 中实现 handleTap 方法`);
    }

    // 子节点（P0-12：重复组只渲染原型并注入 wx:for；条件节点注入 wx:if/hidden）
    let childrenHtml = '';
    if (node.children && node.children.length > 0) {
      const childResults = await this._renderChildren(node, twMapper, ctx, 1);
      childrenHtml = childResults.filter(Boolean).join('\n');
    }

    if (childrenHtml) {
      return `${indent}<${tag} ${attrs.join(' ').trim()}>\n${childrenHtml}\n${indent}</${tag}>`;
    }
    return `${indent}<${tag} ${attrs.join(' ').trim()}></${tag}>`;
  }

  /**
   * 原生组件渲染（P0-51）：scroll-view / swiper / picker / rich-text。
   * 属性走官方白名单；嵌套非法（swiper 非 item 子节点自动包 swiper-item；
   * rich-text 拒绝子节点）由 childPolicy 驱动，保证错误嵌套/无效属性不输出。
   */
  private async _renderNativeComponent(
    node: ProcessedNode,
    nativeTag: string,
    className: string,
    twMapper: ReturnType<typeof createTailwindMapper>,
    ctx: WeappRenderContext,
    indent: string,
  ): Promise<string> {
    const spec = getNativeComponent(nativeTag)!;
    const attrs: string[] = [];
    if (className) attrs.push(`class="${className}"`);

    // 各组件的最小可用默认属性（Figma 无法表达的交互语义）
    if (nativeTag === 'scroll-view') {
      attrs.push('scroll-y="true"');
    }
    if (nativeTag === 'picker') {
      attrs.push('mode="selector"');
    }
    // P0-52：原生组件事件统一映射（picker/swiper bindchange、scroll-view bindscroll）
    const nativeEventAttrs = this._eventAttrsFor(node, nativeTag, ctx);
    attrs.push(...nativeEventAttrs);
    if (nativeTag === 'picker') {
      const changeHandler = nativeEventAttrs.find((a) => a.startsWith('bindchange'));
      if (changeHandler) {
        const handlerName = changeHandler.split('="')[1]!.replace('"', '');
        ctx.warnings.push(`[${node.name || node.figmaId}] 请在 JS 中实现 ${handlerName} 方法`);
      }
    }

    const childIndent = '  '.repeat(ctx.depth + 2);
    const innerIndent = '  '.repeat(ctx.depth + 3);

    // rich-text（WBS-P2-22）：富文本子树 → 构造官方 nodes 并由 JS data 绑定；
    // 仅含简单文本时分流回普通 <text>（不强制使用 rich-text）
    if (nativeTag === 'rich-text') {
      const document = parseRichText(node);
      if (isRichDocument(document)) {
        const nodes = buildRichTextNodes(document);
        const dataKey = this._registerRichTextData(node, nodes, ctx);
        return `${indent}<rich-text nodes="{{${dataKey}}}"></rich-text>`;
      }
      const diverted = (
        await Promise.all(
          (node.children ?? []).map((child) =>
            this._renderNode(child, twMapper, { ...ctx, depth: ctx.depth + 1 }, false),
          ),
        )
      )
        .filter(Boolean)
        .join('\n');
      return diverted;
    }

    // 其余叶子组件（保留策略扩展位）
    if (spec.childPolicy.kind === 'leaf') {
      attrs.push('nodes=""');
      ctx.warnings.push(
        `[${node.name || node.figmaId}] rich-text 内容需通过 nodes 提供（Figma 文本未内联），请填充结构化 nodes`,
      );
      return `${indent}<${nativeTag} ${attrs.join(' ').trim()}>\n${childIndent}<!-- TODO: 提供 nodes 数据 -->\n${indent}</${nativeTag}>`;
    }

    // 渲染结构子节点（与容器一致，重复组/条件折叠同样生效）
    const rawChildren = await this._renderChildren(node, twMapper, ctx, 1);

    if (nativeTag === 'swiper') {
      // 直接子节点必须是 swiper-item。若子级是被 P0-12 识别出的重复组，
      // wx:for 必须作用在 swiper-item 上（而非 item 内部的 view），否则幻灯片堆叠。
      const listBindings = ctx.listByContainer.get(node.id) ?? [];
      const wrapped: string[] = [];
      for (const child of node.children ?? []) {
        const owningList = listBindings.find((l) => l.repeatedChildIds.includes(child.id));
        if (owningList && owningList.repeatedChildIds[0] !== child.id) continue; // 折叠非原型

        // 直接渲染、不应用结构指令（指令要提升到 swiper-item）
        const childHtml = await this._renderNode(
          child,
          twMapper,
          { ...ctx, depth: ctx.depth + 1 },
          false,
        );
        if (!childHtml) continue;
        const isItem = /^\s*<swiper-item[\s>]/.test(childHtml);
        const itemAttrs: string[] = [];
        if (owningList && owningList.repeatedChildIds[0] === child.id) {
          itemAttrs.push(`wx:for="{{${owningList.dataPath}}}"`);
          itemAttrs.push(`wx:for-item="${owningList.itemAlias}"`);
          itemAttrs.push(`wx:for-index="${owningList.indexAlias}"`);
          itemAttrs.push(`wx:key="${owningList.wxKey}"`);
        }
        if (isItem) {
          wrapped.push(this._injectOpenTagAttrs(childHtml, itemAttrs));
        } else {
          wrapped.push(
            `${childIndent}<swiper-item${itemAttrs.length ? ` ${itemAttrs.join(' ')}` : ''}>\n${innerIndent}${childHtml.trimStart()}\n${childIndent}</swiper-item>`,
          );
        }
      }
      const body = wrapped.join('\n');
      return body
        ? `${indent}<${nativeTag} ${attrs.join(' ').trim()}>\n${body}\n${indent}</${nativeTag}>`
        : `${indent}<${nativeTag} ${attrs.join(' ').trim()}></${nativeTag}>`;
    }

    // scroll-view / picker / swiper-item：any 子策略；对同方向 scroll-view 嵌套给警告
    if (nativeTag === 'scroll-view') {
      for (const child of node.children ?? []) {
        const childMatch = matchNativeComponent(child as Parameters<typeof matchNativeComponent>[0]);
        if (childMatch?.tag === 'scroll-view') {
          const errs = validateNativeNesting('scroll-view', 'scroll-view', {
            parentAttrs: { 'scroll-y': 'true' },
            childAttrs: { 'scroll-y': 'true' },
          });
          for (const e of errs) ctx.warnings.push(`[${node.name || node.figmaId}] ${e.message}（${e.code}）`);
        }
      }
    }

    const body = rawChildren.join('\n');
    return body
      ? `${indent}<${nativeTag} ${attrs.join(' ').trim()}>\n${body}\n${indent}</${nativeTag}>`
      : `${indent}<${nativeTag} ${attrs.join(' ').trim()}></${nativeTag}>`;
  }

  /**
   * WBS-P2-22：登记一份 rich-text nodes 数据，返回 data 绑定键（全局去重）。
   */
  private _registerRichTextData(node: ProcessedNode, nodes: unknown, ctx: WeappRenderContext): string {
    const base =
      (node.name || '')
        .replace(/rich|text/gi, ' ')
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join('') || 'RichText';
    let key = `rich${base}Nodes`;
    let n = 2;
    while (ctx.richTextData.has(key)) key = `rich${base}${n++}Nodes`;
    ctx.richTextData.set(key, nodes);
    return key;
  }

  // ============ 辅助方法 ============

  /**
   * 生成 class 名称和对应的样式规则
   * 小程序不使用 Tailwind，而是生成自定义 class + WXSS 样式
   */
  private _generateClassAndStyles(
    node: ProcessedNode,
    mapping: TailwindMapping,
    ctx: WeappRenderContext,
  ): { className: string; hasStyles: boolean } {
    const styles: Record<string, string | number> = {};

    // P0-81（方案 B）：直接从节点视觉字段产出 WXSS（小程序无 Tailwind 运行时，
    // tailwind class 名不产生真实样式）。键为 kebab-case、值已转 rpx 字符串。
    const visual = collectVisualDeclarations(node, 750, ctx.designWidth);
    for (const [prop, value] of Object.entries(visual)) styles[prop] = value;

    // Tailwind 映射的内联兜底（渐变/复杂阴影等）：visual 已覆盖的属性不重复写入
    if (mapping.inlineStyle) {
      for (const [key, value] of Object.entries(mapping.inlineStyle)) {
        const kebab = this._camelToKebab(key);
        if (styles[kebab] === undefined) styles[kebab] = value;
      }
    }

    // 有真实样式声明，或 Tailwind 识别出了 class，才生成自定义 class
    if (Object.keys(styles).length === 0 && !mapping.className) {
      return { className: '', hasStyles: false };
    }

    // 生成唯一 class 名称（计数器为共享持有，跨同层兄弟持续递增）
    ctx.classCounter.value += 1;
    const className = `${this._kebabCase(ctx.sceneName || 'comp')}-${ctx.classCounter.value}`;

    // 数值型像素值转换为 rpx（visual 声明已是 rpx 字符串，不受影响）
    const convertedStyles: Record<string, string | number> = {};
    for (const [prop, value] of Object.entries(styles)) {
      if (typeof value === 'number' && this._isSizeProperty(prop)) {
        convertedStyles[prop] = this._pxToUnit(value, ctx.designWidth, ctx.unit);
      } else {
        convertedStyles[prop] = value;
      }
    }

    ctx.styleRules.set(className, convertedStyles);
    // R1 QA：登记节点→class 归属（fidelity 按节点核对属性值）
    ctx.classByNodeId.set(node.id, [...(ctx.classByNodeId.get(node.id) ?? []), className]);

    return { className, hasStyles: true };
  }

  /**
   * 判断是否为尺寸属性（需要 px → rpx 转换）
   */
  private _isSizeProperty(prop: string): boolean {
    const sizeProps = [
      'width',
      'height',
      'margin',
      'marginTop',
      'marginRight',
      'marginBottom',
      'marginLeft',
      'padding',
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'top',
      'right',
      'bottom',
      'left',
      'borderRadius',
      'borderTopLeftRadius',
      'borderTopRightRadius',
      'borderBottomLeftRadius',
      'borderBottomRightRadius',
      'borderWidth',
      'borderTopWidth',
      'borderRightWidth',
      'borderBottomWidth',
      'borderLeftWidth',
      'fontSize',
      'lineHeight',
      'letterSpacing',
      'gap',
      'rowGap',
      'columnGap',
      'minWidth',
      'maxWidth',
      'minHeight',
      'maxHeight',
    ];
    return sizeProps.includes(prop);
  }

  /**
   * px 转换为小程序单位
   */
  private _pxToUnit(px: number, designWidth: number, unit: 'rpx' | 'px'): number {
    if (unit === 'px') return Math.round(px);
    // rpx: 750rpx = designWidth 屏宽（公式单一来源，P0-61 抽到 weapp-design-width）
    return pxToRpx(px, designWidth);
  }

  /**
   * 选择小程序标签
   */
  private _selectWeappTag(node: ProcessedNode): string {
    const htmlTag = this._selectHtmlTag(node);
    return HTML_TO_WEAPP_TAG[htmlTag] || 'view';
  }

  /**
   * 选择 HTML 标签（用于映射到小程序标签）
   * 简化版，复用 code-generator 的逻辑
   */
  private _selectHtmlTag(node: ProcessedNode): string {
    const a11yTag = (node as any)._a11y?.semanticTag;
    if (a11yTag) return a11yTag;

    switch (node.role) {
      case 'text':
        return 'span';
      case 'button':
        return 'button';
      case 'image':
      case 'icon':
        return 'img';
      case 'input':
        return 'input';
      case 'link':
        return 'a';
      case 'divider':
        return 'hr';
      case 'list':
        return 'ul';
      case 'list-item':
        return 'li';
      default:
        return 'div';
    }
  }

  /**
   * 尝试将 SVG 节点渲染为 image 标签（小程序不支持内联 SVG）
   */
  private async _tryRenderSvgAsImage(
    node: ProcessedNode,
    ctx: WeappRenderContext,
  ): Promise<string | null> {
    // 小程序不支持内联 SVG：声明为 svg 资源，渲染期放 token，渲染后按 iconStrategy
    // （image-local / image-cdn / base64）统一解析回填——绝不产生内联 <svg>。
    const nodeId = node.figmaId || node.id;
    const assetName = this._kebabCase(node.name || 'icon') + '.svg';
    const entry = declareAsset(ctx.assetManifest, {
      figmaRef: { nodeId, imageRef: null },
      kind: 'svg',
      name: assetName,
      mime: 'image/svg+xml',
      scene: ctx.sceneName || 'default',
      pixelRatio: ctx.pixelRatio,
    });
    ctx.pendingAssets.push({ nodeId, name: assetName, type: 'svg' });

    const className = `${this._kebabCase(ctx.sceneName || 'icon')}-icon`;
    return `<image class="${className}" src="${assetSrcToken(entry.id)}" mode="aspectFit" />`;
  }

  /**
   * 驼峰转短横线
   */
  private _camelToKebab(str: string): string {
    return str.replace(/([A-Z])/g, '-$1').toLowerCase();
  }

  /**
   * 转换为 kebab-case
   */
  private _kebabCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase()
      .replace(/^-+|-+$/g, '');
  }
}

// ============ 工厂函数 ============

export function createWeappGenerator(client: FigmaClient, options?: Partial<WeappCodeGenOptions>) {
  return new WeappGenerator(client, options);
}
