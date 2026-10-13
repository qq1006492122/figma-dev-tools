/**
 * 代码生成服务 - Code Generator
 *
 * 核心职责：将 Figma 节点（原始 FigmaNode 或经 node-processor 精简后的 ProcessedNode）
 * 转换为可直接使用的 React/TSX 组件代码。
 *
 * **两套生成管道：**
 *
 * 1. **旧版管道（generateComponent）**：直接基于原始 FigmaNode 生成
 *    - 内联的简单 Tailwind 映射
 *    - 不支持 token-matcher 的智能匹配
 *    - 保留用于向后兼容
 *
 * 2. **新版管道（generateJsxFromContext）**：基于 ProcessedNode + DesignContext
 *    - 使用 TailwindMapper 自动匹配 design token（bg-primary、rounded-lg、text-sm 等）
 *    - 根据 NodeSemanticRole + a11y-enhancer 选择语义化 HTML 标签
 *    - 自动跳过 layout-only 冗余容器（消除 div soup）
 *    - 图片节点生成 <img> + publicCdnUrl() 引用 + 智能 alt 文本
 *    - 复用组件（reusable-component）标记为 import 占位
 *    - 自动应用 Flex 布局修复（flex-fixer）
 *    - 输出需要 @theme 扩展的 token 提示
 *    - 生成设计系统和响应式建议报告
 *    - **推荐使用此管道**
 *
 * **JSX 生成管道流程（新版 v1.2.0）：**
 * ```
 * ProcessedNode 树 + DesignContext
 *   ↓
 * 0. 应用增强器链：
 *    - flex-fixer: 修复 Flex 布局问题
 *    - a11y-enhancer: 添加无障碍属性
 *    - design-system-analyzer: 生成设计 Token 建议
 *    - responsive-inferrer: 生成响应式建议
 *   ↓
 * 1. 可见性检查 → invisible 节点返回空字符串
 *   ↓
 * 2. layout-only 扁平化 → 直接渲染子节点，跳过当前 div
 *   ↓
 * 3. reusable-component 占位 → 输出 TODO 注释引导引入项目组件
 *   ↓
 * 4. TailwindMapper 映射 → className + extensionsNeeded + inlineStyle
 *    + 合并 flex-fixer 添加的类名
 *   ↓
 * 5. 语义标签选择（_selectSemanticTag + a11y 增强）→ header/nav/main/section/button 等
 *   ↓
 * 6. 特殊节点处理：
 *    - img → alt 文本、aria-hidden、object-cover、src/alt 属性
 *    - text → 直接渲染 textContent
 *    - button → 添加 type="button"、aria-label
 *    - icon → aria-hidden="true"
 *   ↓
 * 7. ARIA 属性添加（aria-label、role 等）
 *   ↓
 * 8. 递归生成子节点 JSX
 *   ↓
 * 9. 组装为完整 TSX 组件（imports + Props 接口 + 组件函数 + 报告注释）
 * ```
 *
 * @module
 */

// ============ 依赖导入 ============

import type { FigmaNode, CodeGenOptions, GeneratedComponent, SmartInferenceSwitches } from '../types.js';
import type { ProcessedNode, DesignContext } from '../types/nodes.js';
import { cn } from '../utils/cn.js';
import { getToolVersion } from '../utils/version.js';
import { convertFigmaColor } from '../utils/color.js';
import { escapeAttribute, sanitizeIdentifier, sanitizeText } from '../utils/security.js';
import { createA11yEnhancer, type A11yEnhancerResult } from './a11y-enhancer.js';
import { formatCode } from './code-formatter.js';
import { createDesignSystemAnalyzer, type DesignSystemResult } from './design-system.js';
import type { FigmaClient } from './figma-client.js';
import { createFlexFixer, type FlexFixResult } from './flex-fixer.js';
import { createInteractionInferrer, type InteractionInferrerResult } from './interaction-inferrer.js';
import { createResponsiveInferrer, type ResponsiveResult } from './responsive-inferrer.js';
import {
  createSemanticInferrer,
  formatSemanticComments,
  type SemanticInferenceResult,
} from './semantic-inferrer.js';
import { createSmartInferrer, type SmartInferenceResult } from './smart-inferrer.js';
import { SvgInlineRenderer, isVectorNode, type InlineSvgResult } from './svg-inline-renderer.js';
import {
  assertStyleFormatSupported,
  createStyleRenderer,
  mergeStyleWithExtraTokens,
  STYLE_FORMATS_NEW_PIPELINE,
  type StyleExtensionNeeded,
  type StyleFormat,
  type StyleHint,
  type StyleRenderer,
  type StyleSidecarFile,
  type UnocssMode,
} from './style-renderers/index.js';
import {
  COMPONENT_LIBRARIES,
  matchComponent,
  resolveLibrary,
  type ComponentLibraryChoice,
  type ComponentLibraryId,
  type DetectHooks,
  type PackageJsonLike,
} from './component-library/index.js';
import { normalizeAssetUrlPath, planAssetReference, toAssetVarName, type BundlerKind } from './asset-paths.js';
import { generateReactPropsInterface } from './props-type-generator.js';

// ============ 组件库映射（WBS-P2-12） ============

/** shadcn/ui 每个组件对应的 components/ui 子路径（与官方 CLI 生成位置一致） */
const SHADCN_UI_PATHS: Readonly<Record<string, string>> = {
  Button: 'button',
  Input: 'input',
  Badge: 'badge',
  Card: 'card',
  Dialog: 'dialog',
  Tabs: 'tabs',
  Avatar: 'avatar',
};

/** 结构需手工调整的组件（容器/组合式），替换标签时必须给警告 */
const COMPOSITION_WARNING_COMPONENTS = new Set(['dialog', 'tabs', 'avatar']);

/**
 * 注册一次组件匹配用到的 import（主组件 + 组合式子组件），
 * 按库形态归入 antd 单包或 shadcn 各 ui 子路径。
 */
function registerUiImport(
  uiImports: Map<string, Set<string>>,
  library: ComponentLibraryId,
  match: ReturnType<typeof matchComponent> extends infer T ? Exclude<T, null> : never,
): void {
  const add = (source: string, name: string): void => {
    let set = uiImports.get(source);
    if (!set) {
      set = new Set<string>();
      uiImports.set(source, set);
    }
    set.add(name);
  };
  if (library === 'shadcn-ui') {
    // 组合式子组件（DialogContent/TabsList/CardHeader 等）与主组件同属一个 ui 子路径，
    // 与 shadcn 官方产物一致：import { Dialog, DialogContent, ... } from '@/components/ui/dialog'
    const source = `@/components/ui/${SHADCN_UI_PATHS[match.importName] ?? ''}`;
    add(source, match.importName);
    for (const sub of match.subImports) {
      add(source, sub);
    }
  } else {
    add(COMPONENT_LIBRARIES[library].packageName, match.importName);
  }
}

// ============ 类型定义 ============

/**
 * 节点生成上下文
 *
 * 在递归生成 JSX 时传递状态信息，避免使用全局变量。
 */
interface NodeContext {
  /** 当前递归深度（用于缩进） */
  depth: number;
  /** 是否为根节点 */
  isRoot: boolean;
  /** 父节点类型（预留） */
  parentType?: string;
  /** 已使用的 token 名称集合（用于统计） */
  usedTokens: Set<string>;
  /** 需要引入的依赖集合 */
  dependencies: Set<string>;
  /** 代码生成选项（已合并默认值） */
  options: Required<CodeGenOptions>;
}

/**
 * ProcessedNode 递归生成上下文（新版管道）
 */
interface ProcessedNodeContext {
  /** 当前递归深度（用于缩进） */
  depth: number;
  /** 是否为根节点 */
  isRoot: boolean;
  /** 需要引入的 import 语句集合 */
  imports: Set<string>;
  /** 需要 @theme 扩展的值列表（v1.4.18 T7 起采用渲染器公共契约类型） */
  extensions: StyleExtensionNeeded[];
  /** Tailwind 映射过程中产生的警告（用于人工复核） */
  warnings: string[];
  /** 需要下载的资源列表（nodeId → 建议文件名） */
  pendingAssets: Array<{ nodeId: string; name: string; type: string }>;
  /** 是否使用 publicCdnUrl 引用资源 */
  usePublicCdn: boolean;
  /** 目标构建器（v1.4.18，决定图片资源引用形态；默认 none 等同 1.4.17） */
  bundler: BundlerKind;
  /** 场景名称（用于资源路径组织） */
  sceneName: string;
  /** 组件使用统计映射 */
  componentMap: DesignContext['componentsUsed'];
  /** Figma 文件 Key（用于 SVG 内联渲染） */
  fileKey: string;
  /** SVG 内联渲染器实例 */
  svgRenderer: SvgInlineRenderer;
  /** 当前组件名（v1.4.19 T14：styled 根包装命名） */
  componentName: string;
  /** 父级节点在样式渲染器中注册的类名/标识符（v1.4.19 T16：Less/Sass 嵌套归属） */
  parentStyleIdentifier?: string;
  /**
   * WBS-P2-12：已解析的组件库 id（null=关闭组件映射，全部原生标签）。
   * 由 generateJsxFromContext 按 componentLibrary + package.json 依赖解析一次。
   */
  componentLibrary: ComponentLibraryId | null;
  /** 组件库 import 收集：source 路径 → 命名导入集合（渲染完后统一生成 import 语句） */
  uiImports: Map<string, Set<string>>;
}

/**
 * 增强报告（v1.2.0 新增）
 *
 * 包含代码生成后各种增强功能的统计和建议
 */
export interface EnhancementReports {
  /** Flex 修复报告 */
  flexFixes?: FlexFixResult;
  /** 无障碍增强报告 */
  a11y?: A11yEnhancerResult;
  /** 设计系统分析报告 */
  designSystem?: DesignSystemResult;
  /** 响应式推断报告 */
  responsive?: ResponsiveResult;
  /** 交互逻辑推断报告（v1.4.0 新增） */
  interaction?: InteractionInferrerResult;
  /** 智能推断报告（v1.4.19 T21：布局/图标/主题/动效） */
  smartInference?: SmartInferenceResult;
  /** 语义推断报告（v1.4.19 T22：列表数据化 + 语义命名） */
  semantic?: SemanticInferenceResult;
}

// ============ 常量定义 ============

/**
 * 默认代码生成选项
 */
const DEFAULT_CODE_GEN_OPTIONS: Required<CodeGenOptions> = {
  format: 'react',
  framework: 'react',
  typescript: true,
  styleFormat: 'tailwind',
  useExistingTokens: true,
  tokenPrefix: '',
  componentName: 'Component',
  exportPath: './components',
  includeProps: true,
  includeChildren: true,
  skipEnhancements: false,
  inference: {},
};

/**
 * P3-12：语义标签推断结果缓存（name + role + fontSize → tag）。
 * 模块级跨生成复用；键空间为页面中出现过的唯一名/角色组合，
 * 千节点页通常仅数十个唯一键，命中后跳过 ~20 条名称正则。
 */
const SEMANTIC_TAG_CACHE = new Map<string, string>();

// ============ CodeGenerator 类 ============

/**
 * 代码生成器类
 *
 * 提供两套代码生成管道：
 * - 旧版：{@link generateComponent} 基于原始 FigmaNode
 * - 新版：{@link generateJsxFromContext} 基于 ProcessedNode + DesignContext（推荐）
 *
 * 辅助功能：
 * - {@link generateCSSVariables} 生成 CSS Variables
 * - {@link generateTailwindConfig} 生成 Tailwind 配置
 *
 * 通过工厂函数 {@link createCodeGenerator} 创建实例。
 *
 * @example
 * ```typescript
 * const generator = createCodeGenerator(figmaClient);
 *
 * // 推荐：使用 DesignContext 生成
 * const context = await designContextService.getDesignContext(fileKey, nodeId);
 * const result = generator.generateJsxFromContext(context, { componentName: 'HeroSection' });
 * console.log(result.code);
 * console.log(result.reports); // 增强报告
 * ```
 */
export class CodeGenerator {
  /** Figma API 客户端实例（纯 CSS 生成等场景可为 null） */
  private readonly _client: FigmaClient | null;
  /** 代码生成选项（已合并默认值） */
  private _options: Required<CodeGenOptions>;
  /** SVG 内联渲染器实例 */
  private readonly _svgRenderer: SvgInlineRenderer;

  /**
   * 构造函数 - 初始化代码生成器
   *
   * @param client - Figma API 客户端实例（纯本地转换时可传 null）
   * @param options - 代码生成选项
   */
  constructor(client: FigmaClient | null, options: Partial<CodeGenOptions> = {}) {
    this._client = client;
    this._options = { ...DEFAULT_CODE_GEN_OPTIONS, ...options };
    this._svgRenderer = new SvgInlineRenderer(client, {
      inline: true,
      scale: 1,
      optimize: true,
      currentColor: true,
    });
  }

  // ============ 旧版管道（基于原始 FigmaNode） ============

  /**
   * 从 Figma 原始节点生成组件代码（旧版管道）
   *
   * @deprecated 推荐使用 {@link generateJsxFromContext} 基于 DesignContext 生成，
   *             新版支持智能 token 匹配、语义标签、Flex 修复、a11y 增强等功能。
   *
   * @param fileKey - Figma 文件 Key
   * @param nodeId - 节点 ID
   * @param options - 覆盖默认的生成选项
   * @returns 生成的组件结果（代码、类型、依赖等）
   * @throws {Error} 节点不存在时抛出错误
   */
  async generateComponent(
    fileKey: string,
    nodeId: string,
    options?: Partial<CodeGenOptions>,
  ): Promise<GeneratedComponent> {
    if (!this._client) throw new Error('generateComponent 需要 FigmaClient 实例');
    const opts = { ...this._options, ...options };
    const node = await this._client.getNode(fileKey, nodeId);

    if (!node) {
      throw new Error(`Node ${nodeId} not found in file ${fileKey}`);
    }

    const context: NodeContext = {
      depth: 0,
      isRoot: true,
      usedTokens: new Set(),
      dependencies: new Set(['react']),
      options: opts,
    };

    // 生成组件名称
    const componentName = opts.componentName || this._generateComponentName(node.name);

    // 生成 JSX/TSX
    const jsxCode = this._generateNodeCodeLegacy(node, context);

    // 生成 Props 接口
    const propsInterface = opts.includeProps ? this._generatePropsInterfaceLegacy(componentName, node) : '';

    // 生成完整组件代码
    const code = this._assembleComponentLegacy(componentName, jsxCode, propsInterface, context);

    return {
      name: componentName,
      code,
      cssCode: opts.styleFormat === 'css-modules' ? this._generateCSSModuleLegacy(node) : undefined,
      typesCode: opts.typescript ? propsInterface : undefined,
      propsInterface,
      dependencies: Array.from(context.dependencies),
      tokensUsed: Array.from(context.usedTokens),
    };
  }

  // ============ CSS/配置生成 ============

  /**
   * 生成 CSS Variables 代码
   *
   * 将 DesignTokens 对象转换为 :root 下的 CSS 自定义属性声明，
   * 可直接用于 Tailwind CSS v4 @theme 或全局样式。
   *
   * @param tokens - 设计 tokens 对象（颜色、间距、圆角、阴影）
   * @returns CSS 变量声明代码字符串
   */
  generateCSSVariables(tokens: {
    colors?: Record<string, { value: string }>;
    spacing?: Record<string, { value: number; unit?: string }>;
    radius?: Record<string, { value: number; unit?: string }>;
    shadows?: Record<string, { x: number; y: number; blur: number; spread: number; color: string }>;
  }): string {
    const lines: string[] = [':root {'];

    // ============ 颜色变量 ============
    if (tokens.colors) {
      lines.push('  /* Color Tokens */');
      for (const [name, token] of Object.entries(tokens.colors)) {
        lines.push(`  --${name}: ${token.value};`);
      }
    }

    // ============ 间距变量 ============
    if (tokens.spacing) {
      lines.push('');
      lines.push('  /* Spacing Tokens */');
      for (const [name, token] of Object.entries(tokens.spacing)) {
        lines.push(`  --${name}: ${token.value}${token.unit || 'px'};`);
      }
    }

    // ============ 圆角变量 ============
    if (tokens.radius) {
      lines.push('');
      lines.push('  /* Radius Tokens */');
      for (const [name, token] of Object.entries(tokens.radius)) {
        lines.push(`  --${name}: ${token.value}${token.unit || 'px'};`);
      }
    }

    // ============ 阴影变量 ============
    if (tokens.shadows) {
      lines.push('');
      lines.push('  /* Shadow Tokens */');
      for (const [name, token] of Object.entries(tokens.shadows)) {
        lines.push(`  --${name}: ${token.x}px ${token.y}px ${token.blur}px ${token.spread}px ${token.color};`);
      }
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * 生成 Tailwind 配置文件代码
   *
   * 输出 Tailwind CSS v3 格式的配置对象，将 colors/spacing/borderRadius
   * 映射到 CSS 变量引用。
   *
   * @param tokens - 设计 tokens 对象
   * @returns Tailwind 配置 TypeScript 代码
   */
  generateTailwindConfig(tokens: {
    colors?: Record<string, { value: string }>;
    spacing?: Record<string, { value: number }>;
    borderRadius?: Record<string, { value: number }>;
  }): string {
    const config: {
      theme: {
        extend: {
          colors?: Record<string, string>;
          spacing?: Record<string, string>;
          borderRadius?: Record<string, string>;
        };
      };
    } = {
      theme: {
        extend: {},
      },
    };

    if (tokens.colors) {
      config.theme.extend.colors = {};
      for (const [name, _token] of Object.entries(tokens.colors)) {
        config.theme.extend.colors[name] = `var(--${name})`;
      }
    }

    if (tokens.spacing) {
      config.theme.extend.spacing = {};
      for (const [name, _token] of Object.entries(tokens.spacing)) {
        config.theme.extend.spacing[name] = `var(--${name})`;
      }
    }

    if (tokens.borderRadius) {
      config.theme.extend.borderRadius = {};
      for (const [name, _token] of Object.entries(tokens.borderRadius)) {
        config.theme.extend.borderRadius[name] = `var(--${name})`;
      }
    }

    return `import type { Config } from 'tailwindcss';\n\nexport default ${JSON.stringify(config, null, 2)} satisfies Config;`;
  }

  // ============ 新版管道（基于 ProcessedNode + DesignContext） ============

  /**
   * 从 DesignContext（经 node-processor 精简后的数据）生成 React 组件
   *
   * **推荐使用的代码生成入口（v1.2.0）**。特点：
   * - 使用 TailwindMapper 自动匹配 design token（bg-primary、rounded-lg、text-sm 等）
   * - 根据 NodeSemanticRole + a11y-enhancer 选择正确的语义化 HTML 标签（header/nav/main/section/button/article/aside/footer）
   * - 自动跳过 layout-only 冗余容器（消除 div soup）
   * - 图片节点生成 <img> + publicCdnUrl() 引用 + 智能 alt 文本
   * - 复用组件（reusable-component）标记为 import 占位
   * - 自动应用 Flex 布局修复（flex-fixer）：图标变形、文本截断、溢出滚动等
   * - 自动添加无障碍属性（aria-label、aria-hidden、role 等）
   * - 输出需要 @theme 扩展的 token 提示
   * - 标记待下载的资源列表
   * - 生成设计系统分析报告和响应式建议报告
   *
   * @param context - 设计上下文（来自 DesignContextService.getDesignContext）
   * @param options - 生成选项
   * @returns 生成结果，包含 TSX 代码、imports、待扩展 token、待下载资源、增强报告
   */
  async generateJsxFromContext(
    context: DesignContext,
    options: {
      /** 组件名称（默认从节点名推断） */
      componentName?: string;
      /** 是否使用 publicCdnUrl() 引用资源，默认 true */
      usePublicCdn?: boolean;
      /** 目标构建器（v1.4.18）：默认 none，产物与 1.4.17 一致；vite/webpack/nextjs/remix 产出对应资源引用 */
      bundler?: BundlerKind;
      /** 样式方案（v1.4.18 T7）：默认 tailwind；新管线仅 tailwind/unocss，其他值经注册表显式拒绝 */
      styleFormat?: StyleFormat;
      /** UnoCSS 模式（v1.4.18 T8，仅 styleFormat=unocss 生效）：wind（默认）| attributify */
      unocssMode?: UnocssMode;
      /** 场景名称（用于资源路径组织） */
      sceneName?: string;
      /** 是否跳过增强器（flex-fixer/a11y/design-system/responsive），默认 false */
      skipEnhancements?: boolean;
      /** v1.4.19 T21：智能推断分项开关（缺省全开，skipEnhancements 为总闸） */
      inference?: SmartInferenceSwitches;
      /**
       * WBS-P2-12：组件库选择。'auto' 按 projectPackageJson 真实依赖检测，
       * 'none'（默认）保持原生标签；显式库 id 不做依赖拦截（由调用方给安装提示）。
       */
      componentLibrary?: ComponentLibraryChoice;
      /** auto 检测用的最近 package.json（CLI 读盘后传入；MCP 无 fs 可不传） */
      projectPackageJson?: PackageJsonLike | null;
      /** shadcn/ui 组件目录探测谓词（@/components/ui/<component> 是否存在） */
      uiComponentExists?: DetectHooks['uiComponentExists'];
    } = {},
  ): Promise<{
    /** 组件名 */
    componentName: string;
    /** 生成的 TSX 代码 */
    code: string;
    /** 需要的 import 语句集合 */
    imports: Set<string>;
    /** 需要 @theme 扩展的值 */
    extensionsNeeded: Array<{ type: string; suggestedName: string; originalValue: string }>;
    /** 需要下载的资源列表（nodeId → 建议文件名） */
    pendingAssets: Array<{ nodeId: string; name: string; type: string }>;
    /** Tailwind 映射和代码生成过程中产生的警告（需人工复核） */
    warnings: string[];
    /** 增强报告（v1.2.0 新增） */
    reports: EnhancementReports;
    /** 样式方案配置建议（v1.4.18 T8，UnoCSS 非空；仅建议，不写入用户项目） */
    styleHints: StyleHint[];
    /** 同名旁路样式文件（v1.4.18 T9，仅 css-modules：${componentName}.module.css） */
    styleSidecar?: StyleSidecarFile;
  }> {
    const componentName = options.componentName || this._generateComponentName(context.node.name);
    // v1.4.18（T7/T8）：样式方案走注册表校验 + 渲染器工厂；
    // 新管线仅 tailwind/unocss，planned/其他管线值显式抛错而非静默错配
    const effectiveStyleFormat = options.styleFormat ?? 'tailwind';
    // v1.4.19 T14–T17：追加框架矩阵校验（styled/emotion/vanilla-extract/panda 仅 React，显式报错不降级）
    assertStyleFormatSupported(effectiveStyleFormat, STYLE_FORMATS_NEW_PIPELINE, undefined, 'react');
    const unocssMode: UnocssMode = options.unocssMode ?? 'wind';
    const styleRenderer = createStyleRenderer(effectiveStyleFormat, { framework: 'react', unocssMode });
    // WBS-P2-12：组件库解析（auto 必须有真实依赖证据；无证据/显式 none → 原生标签）
    const resolvedComponentLibrary = resolveLibrary('react', options.componentLibrary ?? 'none', options.projectPackageJson ?? null, {
      uiComponentExists: options.uiComponentExists,
    });
    const uiImports = new Map<string, Set<string>>();
    const imports = new Set<string>(['import React from "react";']);
    const extensionsNeeded: StyleExtensionNeeded[] = [];
    const warnings: string[] = [];
    if (options.componentLibrary === 'auto' && !resolvedComponentLibrary) {
      warnings.push(
        'componentLibrary=auto 未检测到 antd 依赖或 @/components/ui 组件目录，已降级为原生标签（显式指定 componentLibrary 可覆盖）',
      );
    }
    const pendingAssets: Array<{ nodeId: string; name: string; type: string }> = [];
    const reports: EnhancementReports = {};
    let needsPublicCdnUrl = false;

    // 透传 design-context 层的警告（如陈旧缓存降级）
    if (context.warnings && context.warnings.length > 0) {
      warnings.push(...context.warnings);
    }

    // ============ 0. 应用增强器链（v1.2.0 新增） ============
    if (!options.skipEnhancements) {
      // Flex 布局修复
      const flexFixer = createFlexFixer();
      reports.flexFixes = flexFixer.applyFixes(context.node);

      // 无障碍增强
      const a11yEnhancer = createA11yEnhancer();
      reports.a11y = a11yEnhancer.enhance(context.node);

      // 设计系统分析
      const designSystemAnalyzer = createDesignSystemAnalyzer();
      reports.designSystem = designSystemAnalyzer.analyze(context);

      // 响应式推断
      const responsiveInferrer = createResponsiveInferrer();
      reports.responsive = responsiveInferrer.infer(context);

      // 交互逻辑推断（v1.4.0 新增）
      const interactionInferrer = createInteractionInferrer();
      reports.interaction = interactionInferrer.infer(context.node);

      // 智能推断（v1.4.19 T21：布局/图标/主题/动效，只建议不改写显式样式）
      reports.smartInference = createSmartInferrer().infer(context.node, {
        framework: 'react',
        switches: options.inference,
      });

      // 语义推断（v1.4.19 T22：列表数据化 + 语义命名，仅输出示例/建议）
      reports.semantic = createSemanticInferrer().infer(context.node, { framework: 'react' });

      // 添加 useState 等 React hooks import
      if (reports.interaction.requiredReactImports.length > 0) {
        // 检查是否已有 useState import
        const hooksStr = reports.interaction.requiredReactImports.join(', ');
        const existingReactImport = Array.from(imports).find((i) => i.startsWith('import React'));
        if (existingReactImport) {
          imports.delete(existingReactImport);
        }
        imports.add(`import React, { ${hooksStr} } from "react";`);
      }
    }

    // ============ 递归生成 JSX 主体（异步，支持 SVG 内联渲染） ============
    const jsxBody = await this._generateProcessedNodeJsx(context.node, styleRenderer, {
      depth: 1,
      isRoot: true,
      imports,
      extensions: extensionsNeeded,
      warnings,
      pendingAssets,
      usePublicCdn: options.usePublicCdn !== false,
      bundler: options.bundler ?? 'none',
      sceneName: options.sceneName || '',
      componentMap: context.componentsUsed,
      fileKey: context.fileKey,
      svgRenderer: this._svgRenderer,
      componentName,
      componentLibrary: resolvedComponentLibrary,
      uiImports,
    });

    // 检测是否需要 publicCdnUrl import
    if (jsxBody.includes('publicCdnUrl')) {
      needsPublicCdnUrl = true;
    }

    // WBS-P2-12：组件库 import 收口（antd 聚合单包；shadcn 按 ui 子路径分组）
    for (const [source, names] of uiImports) {
      imports.add(`import { ${[...names].join(', ')} } from "${source}";`);
    }

    // ============ 样式旁路文件（v1.4.18 T9 css-modules；v1.4.19 T16 less/sass、T17 vanilla-extract） ============
    // 整棵树渲染完成后从渲染器聚合声明；主文件 import styles 引用，工具不直接写用户项目目录。
    const styleSidecar = styleRenderer.buildSidecar ? styleRenderer.buildSidecar(componentName) : undefined;

    // ============ v1.4.19 T14/T15/T17：同文件样式前导段（styled/emotion/panda） ============
    const stylePreamble = styleRenderer.buildPreamble ? styleRenderer.buildPreamble(componentName) : undefined;
    if (stylePreamble) {
      for (const statement of stylePreamble.imports) imports.add(statement);
    }

    // ============ 组装完整 TSX 文件 ============
    const propsName = `${componentName}Props`;
    const lines: string[] = [];

    // imports 按前端规范分组：
    // 1. React 核心
    // 2. 第三方依赖（external）
    // 3. @/ 别名内部模块（internal）
    // 注意：组内不按字母排序，保持逻辑引入顺序
    const allImports = new Set(imports);
    allImports.add('import { cn } from "@/lib/utils";');
    // 样式旁路文件引用：缺省 CSS Modules 默认导入；vanilla-extract 等方案用 reactImport 覆盖
    if (styleSidecar) {
      allImports.add(styleSidecar.reactImport ?? `import styles from "./${styleSidecar.fileName}";`);
    }
    if (needsPublicCdnUrl) {
      allImports.add('import { publicCdnUrl } from "@/lib/asset-path";');
    }

    const reactImports: string[] = [];
    const externalImports: string[] = [];
    const internalImports: string[] = [];

    for (const imp of allImports) {
      // v1.4.18：引号无关匹配（资源 import 经规划器产出时为单引号）
      if (/from ['"]react['"]/.test(imp)) {
        reactImports.push(imp);
      } else if (/from ['"]@\//.test(imp)) {
        internalImports.push(imp);
      } else {
        externalImports.push(imp);
      }
    }

    lines.push(...reactImports);
    if (externalImports.length > 0) {
      lines.push('');
      lines.push(...externalImports);
    }
    if (internalImports.length > 0) {
      lines.push('');
      lines.push(...internalImports);
    }

    // 添加报告注释（包含增强器统计和人工复核警告）
    const reportComments = this._generateReportComments(reports, warnings);
    if (reportComments) {
      lines.push('');
      lines.push(...reportComments);
    }

    // v1.4.18 T10：由根节点 Component Properties 推导 Props interface
    // TR-10.3：无属性时不生成空 interface，FC 泛型直接内联 HTMLAttributes
    const componentProps = context.node.componentProperties ?? [];
    const propsInterface = generateReactPropsInterface(componentName, componentProps);

    lines.push('');
    if (propsInterface) {
      lines.push(...propsInterface.split('\n'));
      lines.push('');
    }
    // v1.4.19 T14/T15/T17：styled/emotion/panda 同文件样式定义注入于组件声明之前
    if (stylePreamble) {
      lines.push(...stylePreamble.code.split('\n'));
      lines.push('');
    }
    const fcGeneric = propsInterface ? propsName : 'React.HTMLAttributes<HTMLElement>';
    lines.push(`export const ${componentName}: React.FC<${fcGeneric}> = ({ className, ...rest }) => {`);

    // 插入交互推断生成的 state 声明（v1.4.0 新增）
    if (reports.interaction?.stateDeclarations.length) {
      lines.push('  // ============ State (auto-inferred by interaction-inferrer) ============');
      lines.push(...reports.interaction.stateDeclarations);
      lines.push('');
    }

    // 插入交互推断生成的 handler 骨架（v1.4.0 新增）
    if (reports.interaction?.handlerSkeletons.length) {
      lines.push('  // ============ Event Handlers (TODO: implement business logic) ============');
      lines.push(...reports.interaction.handlerSkeletons);
      lines.push('');
    }

    lines.push('  return (');
    lines.push(jsxBody);
    lines.push('  );');
    lines.push('};');
    lines.push('');
    lines.push(`export default ${componentName};`);

    // 添加 @theme 扩展建议
    if (reports.designSystem?.themeExtensions) {
      lines.push('');
      lines.push('/*');
      lines.push(' === Design Token Suggestions ===');
      lines.push(' Add the following to your CSS @theme block:');
      lines.push('');
      lines.push(reports.designSystem.themeExtensions);
      lines.push('*/');
    }

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

    // v1.4.18 T8：UnoCSS attributify 产物在文件头提示 TS shim（仅注释，不改用户配置）
    if (effectiveStyleFormat === 'unocss' && unocssMode === 'attributify') {
      lines.unshift(
        '// UnoCSS attributify mode: utility classes are emitted as JSX attributes.',
        '// If TypeScript reports unknown attributes, add the env.d.ts shim from the generation output hints.',
        '',
      );
    }

    const rawCode = lines.join('\n');
    const formattedCode = await formatCode(rawCode, { filePath: `${componentName}.tsx` });

    return {
      componentName,
      code: formattedCode,
      imports,
      extensionsNeeded: dedupedExtensions,
      pendingAssets: dedupedAssets,
      warnings: Array.from(new Set(warnings)),
      reports,
      styleHints: [...(styleRenderer.hints ?? [])],
      styleSidecar,
    };
  }

  // ============ 私有方法：报告注释生成 ============

  /**
   * 生成增强报告的注释
   *
   * @param reports - 增强报告
   * @param warnings - 代码生成过程中的警告列表
   * @returns 注释行数组
   */
  private _generateReportComments(reports: EnhancementReports, warnings: string[] = []): string[] {
    const comments: string[] = [];
    const hasContent =
      reports.flexFixes ||
      reports.a11y ||
      reports.designSystem ||
      reports.responsive ||
      reports.interaction ||
      (reports.smartInference !== undefined && reports.smartInference.suggestions.length > 0) ||
      (reports.semantic !== undefined &&
        (reports.semantic.counts.dataStructures > 0 || reports.semantic.counts.nameSuggestions > 0)) ||
      warnings.length > 0;

    if (!hasContent) return comments;

    comments.push('/**');
    comments.push(` * 🤖 Generated by figma-dev-tools v${getToolVersion()}`);
    comments.push(' *');

    if (reports.flexFixes && reports.flexFixes.totalFixedNodes > 0) {
      comments.push(
        ` * ✅ Flex fixes applied: ${reports.flexFixes.fixedCount} nodes fixed ` +
          `(shrink: ${reports.flexFixes.shrinkFixedCount}, ` +
          `truncate: ${reports.flexFixes.truncateFixedCount}, ` +
          `min-width: ${reports.flexFixes.minWidthFixedCount}, ` +
          `object-fit: ${reports.flexFixes.objectFitFixedCount})`,
      );
    }

    if (reports.a11y) {
      comments.push(
        ` * ♿ Accessibility enhancements: ` +
          `${reports.a11y.semanticTagsCount} semantic tags, ` +
          `${reports.a11y.imagesCheckedCount} images labeled, ` +
          `${reports.a11y.buttonsIdentifiedCount} buttons identified, ` +
          `${reports.a11y.ariaAddedCount} ARIA attributes added`,
      );
    }

    if (reports.designSystem) {
      comments.push(
        ` * 🎨 Design system: ${reports.designSystem.summary.colorsAnalyzed} colors, ` +
          `${reports.designSystem.summary.spacingAnalyzed} spacings, ` +
          `${reports.designSystem.summary.fontsAnalyzed} font sizes analyzed`,
      );
    }

    if (reports.responsive) {
      comments.push(` * 📱 Target device: ${reports.responsive.inferredDevice} (${reports.responsive.designWidth}px)`);
    }

    if (reports.interaction && reports.interaction.interactionsCount > 0) {
      const typeCounts = new Map<string, number>();
      reports.interaction.interactions.forEach((i) => {
        typeCounts.set(i.type, (typeCounts.get(i.type) || 0) + 1);
      });
      const typeSummary = Array.from(typeCounts.entries())
        .map(([type, count]) => `${type}:${count}`)
        .join(', ');
      comments.push(` * 🔄 Interactions inferred: ${reports.interaction.interactionsCount} (${typeSummary})`);
      if (reports.interaction.interactions.some((i) => i.codeHint)) {
        comments.push(' *    ⚠️  Check TODO comments for event handler wiring');
      }
    }

    // v1.4.19 T21：智能推断建议（仅注释建议，不改写显式样式）
    if (reports.smartInference && reports.smartInference.suggestions.length > 0) {
      const counts = reports.smartInference.counts;
      comments.push(
        ` * 🧠 Smart inference (v1.4.19, advisory): layout ${counts.grid}, ` +
          `icons ${counts.icon}, dark-mode ${counts['dark-mode']}, motion ${counts.motion}`,
      );
      for (const suggestion of reports.smartInference.suggestions.slice(0, 8)) {
        const tail = suggestion.utilityClass ? ` → ${suggestion.utilityClass}` : '';
        const line = `[${suggestion.category}] ${suggestion.nodeName}: ${suggestion.message}${tail}`;
        comments.push(` *    - ${line.length > 100 ? line.slice(0, 97) + '...' : line}`);
        if (suggestion.codeHint) {
          comments.push(` *      ↳ ${suggestion.codeHint}`);
        }
      }
      if (reports.smartInference.suggestions.length > 8) {
        comments.push(
          ` *    ... and ${reports.smartInference.suggestions.length - 8} more (see result.reports.smartInference)`,
        );
      }
    }

    // v1.4.19 T22：语义推断（列表数据化示例 + 语义命名建议，仅注释，不自动应用）
    if (reports.semantic) {
      comments.push(...formatSemanticComments(reports.semantic, 'jsdoc'));
    }

    // 添加人工复核警告
    if (warnings.length > 0) {
      comments.push(' *');
      comments.push(` * ⚠️  Manual review needed (${warnings.length} item${warnings.length > 1 ? 's' : ''}):`);
      // 最多展示10条警告，避免注释过长
      const displayWarnings = warnings.slice(0, 10);
      for (const w of displayWarnings) {
        // 限制单行长度
        const line = w.length > 100 ? w.slice(0, 97) + '...' : w;
        comments.push(` *    - ${line}`);
      }
      if (warnings.length > 10) {
        comments.push(` *    ... and ${warnings.length - 10} more (see result.warnings for full list)`);
      }
    }

    comments.push(' */');

    return comments;
  }

  // ============ 私有方法：JSX 生成核心 ============

  /**
   * 递归生成 ProcessedNode 的 JSX（新版管道核心，v1.4.0 改为异步支持 SVG 内联渲染）
   *
   * 处理流程（按顺序，v1.4.0 更新）：
   * 1. 不可见节点 → 返回空字符串
   * 2. layout-only 节点 → 扁平化，直接渲染子节点
   * 3. reusable-component → TODO 注释占位
   * 4. TailwindMapper 映射样式 + 合并 Flex 修复类名
   * 5. 语义标签选择（_selectSemanticTag + a11y 增强覆盖）
   * 6. 特殊节点处理（img、svg-icon、text、button、icon）
   * 7. ARIA 属性添加
   * 8. 递归生成子节点（异步等待）
   *
   * @param node - 当前精简节点
   * @param styleRenderer - 样式渲染器实例（v1.4.18 T7：注册表派生，tailwind/unocss 原子类）
   * @param ctx - 生成上下文（depth、imports、extensions 等）
   * @returns JSX 代码字符串（Promise）
   */
  private async _generateProcessedNodeJsx(
    node: ProcessedNode,
    styleRenderer: StyleRenderer,
    ctx: ProcessedNodeContext,
  ): Promise<string> {
    const indent = '  '.repeat(ctx.depth + 1);
    const nextCtx: ProcessedNodeContext = { ...ctx, depth: ctx.depth + 1, isRoot: false };

    // ============ 1. 不可见节点 → 跳过 ============
    if (node.visible === false) return '';

    // ============ 2. layout-only 节点 → 扁平化，直接渲染子节点 ============
    // 原因：这类节点无视觉样式，仅用于 Auto Layout 分组，
    // 在 HTML 中不需要额外的 div 嵌套，将 flex 布局传递给子节点即可
    if (node.role === 'layout-only') {
      if (!node.children || node.children.length === 0) return '';
      const childResults = await Promise.all(
        node.children.map((child) => this._generateProcessedNodeJsx(child, styleRenderer, nextCtx)),
      );
      return childResults.filter(Boolean).join('\n');
    }

    // ============ 3. 复用组件 → TODO 注释占位 ============
    // 原因：Figma Component/Instance 应映射到项目中已有的 React 组件，
    // 此处输出占位注释引导开发者从 @/components 引入对应组件
    if (node.role === 'reusable-component' && node.componentName) {
      const compName = this._generateComponentName(node.componentName);
      return `${indent}{/* TODO: 复用组件 <${compName} /> — 检查 @/components/web-official 或 componentMap */}`;
    }

    // ============ 4. SVG 矢量/图标节点 → 尝试内联 SVG 渲染（v1.4.0 新增） ============
    // 检测是否为矢量图形节点（VECTOR/BOOLEAN_OPERATION/STAR/LINE 等，或标记为 icon 角色的椭圆/矩形）
    if (isVectorNode(node)) {
      const svgResult = await this._tryRenderInlineSvg(node, ctx);
      if (svgResult) {
        // SVG 内联成功，直接返回 SVG JSX 代码（不再包裹 span）
        return `${indent}${svgResult.reactCode}`;
      }
      // SVG 渲染失败时，回退到普通 span 占位
    }

    // ============ 5. 样式映射（注册表渲染器：原子类/语义类/styled 组件/css 常量） ============
    const tw = styleRenderer.renderNode(node, {
      framework: 'react',
      componentName: ctx.componentName,
      isRoot: ctx.isRoot,
      parentIdentifier: ctx.parentStyleIdentifier,
    });
    ctx.extensions.push(...tw.extensionsNeeded);

    // 收集样式映射警告（去重后添加到上下文）
    if (tw.warnings && tw.warnings.length > 0) {
      for (const w of tw.warnings) {
        const warningWithNode = `[${node.name || node.figmaId}] ${w}`;
        if (!ctx.warnings.includes(warningWithNode)) {
          ctx.warnings.push(warningWithNode);
        }
      }
    }

    // v1.4.19 T14–T17：仅原子类渲染器（tailwind/unocss）合并 flex-fixer 原子补丁；
    // css-module 绑定（css-modules/less/sass/vanilla-extract）输出原生声明，
    // styled 组件/emotion css prop/panda 常量各成体系，合入未声明工具类均属污染，故跳过
    const isAtomicStyle = styleRenderer.id === 'tailwind' || styleRenderer.id === 'unocss';
    const isCssModuleBinding = styleRenderer.classBinding === 'css-module';
    const finalStyle =
      isAtomicStyle && node._flexFixes && Array.isArray(node._flexFixes) && node._flexFixes.length > 0
        ? mergeStyleWithExtraTokens(tw, node._flexFixes as string[])
        : tw;
    const finalClassName = finalStyle.className;
    /** styled-components 等方案：以样式组件标识符替换原生标签 */
    const elementIdentifier = finalStyle.elementIdentifier;
    // v1.4.19 T16：向子节点传递当前样式归属（Less/Sass 渲染器据此做选择器嵌套；其他渲染器忽略）
    nextCtx.parentStyleIdentifier = (elementIdentifier ?? finalClassName) || undefined;

    // ============ 6. 语义标签选择（优先使用 a11y-enhancer 推荐的标签） ============
    let semanticTag = this._selectSemanticTag(node);
    const a11yEnhancements = node._a11y as
      | {
          semanticTag?: string;
          isDecorative?: boolean;
          ariaLabel?: string;
          ariaHidden?: boolean;
          role?: string;
          isButton?: boolean;
          altText?: string;
        }
      | undefined;

    if (a11yEnhancements?.semanticTag) {
      semanticTag = a11yEnhancements.semanticTag;
    }

    // 输出标签：styled 方案替换为样式组件标识符，其余为语义 HTML 标签
    let tag = elementIdentifier ?? semanticTag;

    // WBS-P2-12：组件库映射（保守门控，未命中保持原生标签）
    const uiMatch = ctx.componentLibrary ? matchComponent(node, ctx.componentLibrary) : null;
    let uiComponentTag: string | null = null;
    if (uiMatch) {
      uiComponentTag = uiMatch.importName;
      tag = uiComponentTag;
      registerUiImport(ctx.uiImports, ctx.componentLibrary as ComponentLibraryId, uiMatch);
      for (const advice of uiMatch.compositionAdvice ?? []) {
        const warning = `[${node.name || node.figmaId}] ${uiMatch.importName}: ${advice}`;
        if (!ctx.warnings.includes(warning)) ctx.warnings.push(warning);
      }
      if (COMPOSITION_WARNING_COMPONENTS.has(uiMatch.component)) {
        const structural = `[${node.name || node.figmaId}] ${uiMatch.importName} 结构与原生素材不同（${uiMatch.component} 子结构/受控状态/src 绑定），已替换容器标签，请按组件库文档手工调整子节点结构`;
        if (!ctx.warnings.includes(structural)) ctx.warnings.push(structural);
      }
    }

    // ============ 7. 判断是否为自闭合标签（样式组件标识符永不自闭合） ============
    // 组件映射：Input/Avatar 自闭合；Button/Card/Badge/Tabs/Dialog 保留子节点
    const UI_SELF_CLOSE = new Set(['input', 'avatar']);
    const selfClosing = uiComponentTag
      ? UI_SELF_CLOSE.has(uiMatch!.component)
      : !elementIdentifier && ['img', 'input', 'br', 'hr'].includes(semanticTag);

    // ============ 8. 构建 props ============
    const props: string[] = [];

    // className：根节点合并外部传入的 className，其他节点直接使用
    if (elementIdentifier) {
      // v1.4.19 T14：styled 组件自带样式；根节点仍透传外部 className（styled 自动转发到底层标签）
      if (ctx.isRoot) props.push('className={className}');
    } else if (ctx.isRoot) {
      // attributify 全属性化节点可能无回退 class，仅透传外部 className
      if (!finalClassName) {
        props.push('className={className}');
      } else if (isCssModuleBinding) {
        // T9/T16/T17：styles['local-name'] 引用（本地名可能含连字符，统一方括号访问）
        props.push(`className={cn(styles['${finalClassName}'], className)}`);
      } else if (finalStyle.classNameIsExpression) {
        // T17 Panda：css() 返回字符串常量，按表达式合入
        props.push(`className={cn(${finalClassName}, className)}`);
      } else {
        props.push(`className={cn("${finalClassName}", className)}`);
      }
    } else if (finalClassName) {
      if (isCssModuleBinding) {
        props.push(`className={styles['${finalClassName}']}`);
      } else if (finalStyle.classNameIsExpression) {
        props.push(`className={${finalClassName}}`);
      } else {
        props.push(`className="${finalClassName}"`);
      }
    }

    // v1.4.19 T15：Emotion css prop 等原样属性片段
    if (finalStyle.extraProps) {
      for (const extra of finalStyle.extraProps) {
        props.push(extra);
      }
    }

    // UnoCSS attributify（v1.4.18 T8）：安全原子类以无值属性输出（JSX 统一空串值，兼容 React 透传）
    if (finalStyle.attributes) {
      for (const attr of finalStyle.attributes) {
        props.push(`${attr.name}="${attr.value}"`);
      }
    }

    // data 属性用于调试溯源（XSS 防护：清理并转义）
    props.push(`data-figma-id="${escapeAttribute(node.figmaId || '')}"`);
    props.push(`data-figma-name="${escapeAttribute(sanitizeText(node.name || ''))}"`);

    // 内联样式兜底（复杂渐变等无法用 Tailwind 表达时使用）
    if (tw.inlineStyle) {
      const styleEntries = Object.entries(tw.inlineStyle)
        .map(([k, v]) => `${JSON.stringify(k)}: ${typeof v === 'number' ? v : JSON.stringify(v)}`)
        .join(', ');
      props.push(`style={{ ${styleEntries} }}`);
    }

    // ============ 9. ARIA 属性和无障碍增强（v1.2.0 新增） ============
    if (a11yEnhancements) {
      // aria-hidden
      if (a11yEnhancements.ariaHidden) {
        props.push('aria-hidden="true"');
      }
      // aria-label（XSS 防护：使用 escapeAttribute 转义）
      if (a11yEnhancements.ariaLabel) {
        const safeLabel = escapeAttribute(sanitizeText(a11yEnhancements.ariaLabel));
        props.push(`aria-label="${safeLabel}"`);
      }
      // role
      if (a11yEnhancements.role) {
        props.push(`role="${escapeAttribute(a11yEnhancements.role)}"`);
      }
    }

    // 图标节点默认 aria-hidden（如果没有 a11y 增强）
    if (node.role === 'icon' && !a11yEnhancements?.ariaHidden && !a11yEnhancements?.ariaLabel) {
      props.push('aria-hidden="true"');
    }

    // 根节点展开外部传入的 rest props。
    // 组件库映射标签不透传：rest 类型为 React.HTMLAttributes（color?: string 等宽类型），
    // 与 antd 等库组件的窄联合 props（color: 'default'|'primary'|'danger'）冲突，tsc strict 下报错；
    // 库组件需要的额外 props 由使用方在组件外层按库文档传入（见手工调整建议）。
    if (ctx.isRoot && !uiMatch) {
      props.push('{...rest}');
    }

    // WBS-P2-12：组件库 Props 注入（在 data/aria 之后，避免与原生分支重复）
    if (uiMatch) {
      for (const prop of uiMatch.props) {
        if (prop.value === 'true') {
          props.push(prop.name);
        } else if (prop.name === 'placeholder') {
          props.push(`placeholder=${JSON.stringify(escapeAttribute(sanitizeText(prop.value)))}`);
        } else {
          props.push(`${prop.name}=${JSON.stringify(prop.value)}`);
        }
      }
    }

    // ============ 10. 图片节点特殊处理（增强版 v1.4.0；组件映射后交由 Avatar 等组件处理） ============
    if (semanticTag === 'img' && !uiComponentTag) {
      // object-fit 处理：
      // - 原子类（tailwind/unocss）：追加 object-cover 工具类（历史行为）；
      // - v1.4.19 非原子方案：不修改样式绑定，补内联 object-fit 兜底（styled/VE/Panda 等）
      const classIdx = props.findIndex((p) => p.startsWith('className='));
      if (elementIdentifier || isCssModuleBinding || finalStyle.classNameIsExpression) {
        if (!props.some((p) => p.startsWith('style='))) {
          props.push('style={{ objectFit: "cover" }}');
        }
      } else {
        const hasObjectFit = finalClassName.includes('object-');
        const imgClassName = hasObjectFit ? finalClassName : cn(finalClassName, 'object-cover');
        if (classIdx >= 0) {
          if (ctx.isRoot) {
            props[classIdx] = `className={cn("${imgClassName}", className)}`;
          } else {
            props[classIdx] = `className="${imgClassName}"`;
          }
        } else if (ctx.isRoot) {
          props.push('className={className}');
        }
      }

      // src 优先使用已下载的本地路径，其次是 CDN URL，最后用透明像素占位（避免 src="" 导致请求当前页面）
      const hasSrc = props.some((p) => p.startsWith('src='));
      if (!hasSrc) {
        if (node.asset?.cdnUrl || node.asset?.localPath) {
          // v1.4.18：按目标构建器规划引用（none 时与 1.4.17 逐字节一致）；
          // normalizeAssetUrlPath 兼容下载后 cdnUrl 已被 publicCdnUrl() 包裹的情况
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
          props.push(`src={${plannedAsset.expression}}`);
        } else {
          ctx.pendingAssets.push({ nodeId: node.figmaId, name: node.name, type: node.asset?.type || 'image' });
          // 1x1 透明 GIF data URI，避免 src="" 产生额外请求
          props.push('src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"');
        }
      }

      // alt 文本（优先使用 a11y-enhancer 生成的，XSS 防护）
      let altText = node.name || '';
      let isDecorative = false;
      if (a11yEnhancements) {
        if (a11yEnhancements.isDecorative) {
          altText = '';
          isDecorative = true;
        } else if (a11yEnhancements.altText !== undefined) {
          altText = a11yEnhancements.altText;
        }
      }
      // 清理并转义 alt 文本，防止 XSS
      const safeAltText = altText ? escapeAttribute(sanitizeText(altText)) : '';
      props.push(`alt="${safeAltText}"`);

      // 图片优化属性（v1.4.0 新增）
      // 装饰性图片使用 aria-hidden
      if (isDecorative) {
        props.push('aria-hidden="true"');
      }

      // 懒加载：非首屏图片默认懒加载
      // 根节点或尺寸较大的图片使用 eager，其他使用 lazy
      const nodeWidth = node.size?.width ?? 0;
      const nodeHeight = node.size?.height ?? 0;
      const isLikelyHero = ctx.isRoot || nodeWidth >= 800;
      props.push(`loading="${isLikelyHero ? 'eager' : 'lazy'}"`);

      // 异步解码，不阻塞主线程
      props.push('decoding="async"');

      // 图片尺寸提示：防止 CLS（Cumulative Layout Shift）
      if (nodeWidth > 0 && nodeHeight > 0) {
        props.push(`width={${Math.round(nodeWidth)}}`);
        props.push(`height={${Math.round(nodeHeight)}}`);
      }

      // 资源优先级：Hero 图片高优先级
      if (isLikelyHero) {
        props.push('fetchPriority="high"');
      }

      return `${indent}<${tag} ${props.join(' ')} />`;
    }

    // ============ 11. 输入框特殊处理（原生 input 补 type；组件 Input 的 type 已由映射 props 提供） ============
    if (semanticTag === 'input' && !uiComponentTag) {
      const inputType =
        a11yEnhancements && 'inputType' in a11yEnhancements
          ? (a11yEnhancements as { inputType?: string }).inputType
          : 'text';
      props.unshift(`type="${inputType || 'text'}"`);
      return `${indent}<${tag} ${props.join(' ')} />`;
    }

    // ============ 12. 文本节点 → 直接渲染内容（XSS 防护：清理文本） ============
    if (node.role === 'text' || node.originalType === 'TEXT') {
      // 清理文本内容，移除 HTML 标签防止注入
      const text = node.textContent ? sanitizeText(node.textContent) : '';
      return `${indent}<${tag} ${props.join(' ')}>${text}</${tag}>`;
    }

    // ============ 13. 按钮节点 → 添加 type="button" 防止表单默认提交 ============
    // 组件库 Button 的 type 是 variant 口径（primary/default…），不能注入原生 type=button
    if (!uiComponentTag && (semanticTag === 'button' || a11yEnhancements?.isButton)) {
      if (!props.some((p) => p.startsWith('type='))) {
        props.unshift('type="button"');
      }
    }

    // ============ 14. 链接节点 → 添加安全属性 ============
    if (semanticTag === 'a') {
      // 如果没有 href，使用 # 占位并添加注释
      if (!props.some((p) => p.startsWith('href='))) {
        props.push('href="#"');
      }
    }

    // ============ 15. 递归生成子节点（异步等待） ============
    // WBS-P2-12：组件库叶子组件（Button/Badge 等）仅含文本子节点时，
    // 文案直接内联为 children（<Button ...>Save</Button>），
    // 避免文本被 <p> 包裹而不符合组件库用法；含图标等非文本子节点时保持结构递归
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
        return `${indent}<${tag} ${props.join(' ')}>${textContent}</${tag}>`;
      }
    }

    const childrenJsx =
      node.children && node.children.length > 0
        ? (await Promise.all(node.children.map((child) => this._generateProcessedNodeJsx(child, styleRenderer, nextCtx))))
            .filter(Boolean)
            .join('\n')
        : '';

    // ============ 16. 组装最终 JSX ============
    if (selfClosing) {
      return `${indent}<${tag} ${props.join(' ')} />`;
    }

    if (childrenJsx) {
      return `${indent}<${tag} ${props.join(' ')}>\n${childrenJsx}\n${indent}</${tag}>`;
    }

    return `${indent}<${tag} ${props.join(' ')} />`;
  }

  /**
   * 尝试渲染节点为内联 SVG（v1.4.0 新增）
   *
   * 对矢量图形节点调用 SvgInlineRenderer，下载并优化 SVG 后返回 React JSX 代码。
   * 如果 SVG 导出失败或节点不是纯矢量图形，返回 null 回退到普通元素渲染。
   *
   * @param node - 要渲染的节点
   * @param ctx - 生成上下文
   * @returns 内联 SVG 结果，失败返回 null
   */
  private async _tryRenderInlineSvg(node: ProcessedNode, ctx: ProcessedNodeContext): Promise<InlineSvgResult | null> {
    try {
      // 检查节点是否包含非矢量子节点（如文本），如果有则不内联
      if (this._hasNonVectorDescendants(node)) {
        return null;
      }

      const result = await ctx.svgRenderer.renderNode(ctx.fileKey, node.figmaId, node.name, {
        inline: true,
        scale: 1,
        optimize: true,
        currentColor: node.role === 'icon', // 图标节点启用 currentColor
      });

      return result;
    } catch {
      // 任何错误都静默回退
      return null;
    }
  }

  /**
   * 检查节点是否包含非矢量子节点（文本、图片等）
   *
   * 如果图标容器内包含文本或其他非矢量元素，则不应该内联为纯 SVG，
   * 而是保留容器结构，仅子矢量节点内联。
   *
   * @param node - 要检查的节点
   * @returns 包含非矢量子节点返回 true
   */
  private _hasNonVectorDescendants(node: ProcessedNode): boolean {
    if (!node.children || node.children.length === 0) return false;

    for (const child of node.children) {
      // 文本节点
      if (child.role === 'text' || child.originalType === 'TEXT') return true;
      // 图片节点
      if (child.role === 'image' || child.originalType === 'RECTANGLE') {
        // 检查是否有图片填充
        const hasImageFill = child.fills?.some((f) => f.type === 'image');
        if (hasImageFill) return true;
      }
      // 递归检查
      if (this._hasNonVectorDescendants(child)) return true;
    }

    return false;
  }

  /**
   * 根据语义角色和节点名称选择 HTML 标签（增强版，v1.4.0 优化）
   *
   * **选择规则（按优先级从高到低）：**
   *
   * 1. **名称关键词匹配**（v1.4.0 新增）：
   *    - header/top/nav/menu/navbar → `<header>` 或 `<nav>`
   *    - footer/bottom → `<footer>`
   *    - main/content → `<main>`
   *    - sidebar/aside → `<aside>`
   *    - article/post → `<article>`
   *    - form → `<form>`
   *    - label → `<label>`
   *    - textarea → `<textarea>`
   *    - select/dropdown → `<select>`
   *
   * 2. **自闭合元素**：
   *    - `image` → `<img>`（图片，无闭合标签）
   *    - `input` → `<input>`（输入框，无闭合标签）
   *    - `divider` → `<hr>`（分割线，无闭合标签）
   *
   * 2. **标题层级（text 角色）**：根据字号推断标题级别
   *    - fontSize ≥ 48px → `<h1>`
   *    - fontSize ≥ 36px → `<h2>`
   *    - fontSize ≥ 30px → `<h3>`
   *    - fontSize ≥ 24px → `<h4>`
   *    - fontSize ≥ 20px → `<h5>`
   *    - 其他 → `<p>`（段落）
   *
   * 3. **交互元素**：
   *    - `button` 角色 → `<button>`（添加 type="button"）
   *    - `link` 角色 → `<a>`（链接）
   *
   * 4. **列表**：
   *    - `list` 角色 → `<ul>`（无序列表）
   *    - `list-item` 角色 → `<li>`（列表项）
   *
   * 5. **内联元素**：
   *    - `icon` 角色 → `<span aria-hidden="true">`（图标占位）
   *    - `badge` 角色 → `<span>`（徽章/标签）
   *
   * 6. **容器/区块**：
   *    - `section` 角色 → `<section>`（页面区块）
   *    - 其他 → `<div>`
   *
   * **注意**：a11y-enhancer 会根据节点名称进一步优化为 header/nav/main/article/aside/footer 等标签。
   *
   * @param node - 当前精简节点
   * @returns HTML 标签名（小写）
   */
  private _selectSemanticTag(node: ProcessedNode): string {
    // P3-12：标签只由 name/role/fontSize 决定，真实页面同名节点大量重复
    // （如 200+ 张 Product Card），记忆化避免每节点重跑 20+ 条名称正则。
    const cacheKey = `${node.name ?? ''}\u0000${node.role}\u0000${node.textStyle?.fontSize ?? 0}`;
    const cached = SEMANTIC_TAG_CACHE.get(cacheKey);
    if (cached !== undefined) return cached;
    const tag = this._selectSemanticTagUncached(node);
    SEMANTIC_TAG_CACHE.set(cacheKey, tag);
    return tag;
  }

  private _selectSemanticTagUncached(node: ProcessedNode): string {
    // ============ 0. 基于节点名称的语义标签推断（v1.4.0 新增） ============
    const nodeNameLower = (node.name || '').toLowerCase();

    // 页眉/头部（优先于 nav 判断，header 内常包含 nav）
    if (/^(header|top-bar|topbar|page-header)/i.test(nodeNameLower)) {
      return 'header';
    }
    // 导航栏/菜单（nav/menu 开头或包含独立词 navigation）
    if (/^(nav|navbar|navigation|menu)/i.test(nodeNameLower)) {
      return 'nav';
    }
    // 页脚
    if (/^(footer|bottom-bar|copyright)/i.test(nodeNameLower)) {
      return 'footer';
    }
    // 主要内容区
    if (/^(main|main-content)/i.test(nodeNameLower)) {
      return 'main';
    }
    // 侧边栏
    if (/^(sidebar|aside|side-panel)/i.test(nodeNameLower)) {
      return 'aside';
    }
    // 文章/独立内容块
    if (/^(article|post|blog-post)/i.test(nodeNameLower)) {
      return 'article';
    }
    // 表单
    if (/^(form|login-form|signup-form|contact-form)/i.test(nodeNameLower)) {
      return 'form';
    }
    // 标签
    if (/^(label|field-label)/i.test(nodeNameLower) && node.role === 'text') {
      return 'label';
    }
    // 多行文本输入
    if (/^(textarea|multi-line|text-area)/i.test(nodeNameLower)) {
      return 'textarea';
    }
    // 下拉选择
    if (/^(select|dropdown|picker|combobox)/i.test(nodeNameLower)) {
      return 'select';
    }
    // 有序列表
    if (/^(ol|ordered-list)/i.test(nodeNameLower)) {
      return 'ol';
    }

    switch (node.role) {
      // ============ 文本节点：根据字号推断标题级别 ============
      case 'text': {
        const size = node.textStyle?.fontSize;
        if (size) {
          if (size >= 48) return 'h1';
          if (size >= 36) return 'h2';
          if (size >= 30) return 'h3';
          if (size >= 24) return 'h4';
          if (size >= 20) return 'h5';
        }
        return 'p';
      }

      // ============ 交互元素 ============
      case 'button':
        return 'button';
      case 'link':
        return 'a';

      // ============ 自闭合元素 ============
      case 'image':
        return 'img';
      case 'input':
        return 'input';
      case 'divider':
        return 'hr';

      // ============ 列表 ============
      case 'list':
        return 'ul';
      case 'list-item':
        return 'li';

      // ============ 内联元素 ============
      case 'icon':
        return 'span';
      case 'badge':
        return 'span';

      // ============ 容器/区块 ============
      case 'section':
        return 'section';
      case 'card':
        return 'div';
      case 'avatar':
        return 'div';
      case 'steps':
        return 'div';
      case 'traffic-light':
        return 'div';

      // ============ 可复用组件/兜底 ============
      case 'container':
      case 'reusable-component':
      default:
        return 'div';
    }
  }

  // ============ 旧版管道私有方法（保留用于向后兼容） ============

  /**
   * 递归生成节点代码（旧版）
   *
   * @param node - Figma 原始节点
   * @param context - 生成上下文
   * @returns JSX 代码字符串
   */
  private _generateNodeCodeLegacy(node: FigmaNode, context: NodeContext): string {
    if (node.visible === false) return '';

    const indent = '  '.repeat(context.depth + 2);
    const props = this._generateNodePropsLegacy(node, context);
    const children = this._generateChildrenLegacy(node, context);

    // 根据节点类型选择 HTML 标签
    const tag = this._getHtmlTagLegacy(node);

    // 处理文本节点（XSS 防护）
    if (node.type === 'TEXT' && node.characters) {
      const safeText = sanitizeText(node.characters);
      return `${indent}<${tag}${props}>${safeText}</${tag}>`;
    }

    // 处理自闭合标签
    if (!children && this._isSelfClosingTagLegacy(tag)) {
      return `${indent}<${tag}${props} />`;
    }

    // 处理有子元素的标签
    if (children) {
      return `${indent}<${tag}${props}>\n${children}\n${indent}</${tag}>`;
    }

    return `${indent}<${tag}${props} />`;
  }

  /**
   * 生成节点属性（旧版）
   *
   * @param node - Figma 原始节点
   * @param context - 生成上下文
   * @returns 属性字符串（含前导空格）
   */
  private _generateNodePropsLegacy(node: FigmaNode, context: NodeContext): string {
    const props: string[] = [];
    const classes: string[] = [];

    // 生成 className
    if (context.options.styleFormat === 'tailwind') {
      classes.push(...this._generateTailwindClassesLegacy(node, context));
    } else {
      classes.push(this._generateClassNameLegacy(node));
    }

    if (classes.length > 0) {
      props.push(`className="${classes.join(' ')}"`);
    }

    // 处理 style 属性（内联样式）
    if (context.options.styleFormat === 'inline-styles') {
      const style = this._generateInlineStyleLegacy(node);
      if (style) {
        props.push(`style={${style}}`);
      }
    }

    // 添加 data 属性用于标识（XSS 防护）
    props.push(`data-figma-id="${escapeAttribute(node.id || '')}"`);
    props.push(`data-figma-name="${escapeAttribute(sanitizeText(node.name || ''))}"`);

    // 根节点添加 props 展开
    if (context.isRoot && context.options.includeProps) {
      props.unshift('{...props}');
    }

    return props.length > 0 ? ` ${props.join(' ')}` : '';
  }

  /**
   * 生成 Tailwind 类名（旧版简化映射）
   *
   * @param node - Figma 原始节点
   * @param _context - 生成上下文
   * @returns Tailwind 类名数组
   */
  private _generateTailwindClassesLegacy(node: FigmaNode, _context: NodeContext): string[] {
    const classes: string[] = [];

    // ============ 布局模式 ============
    if (node.layoutMode === 'HORIZONTAL') {
      classes.push('flex', 'flex-row');
    } else if (node.layoutMode === 'VERTICAL') {
      classes.push('flex', 'flex-col');
    }

    // ============ 主轴对齐 ============
    if (node.primaryAxisAlignItems) {
      switch (node.primaryAxisAlignItems) {
        case 'CENTER':
          classes.push('justify-center');
          break;
        case 'MAX':
          classes.push('justify-end');
          break;
        case 'SPACE_BETWEEN':
          classes.push('justify-between');
          break;
        case 'MIN':
        default:
          classes.push('justify-start');
      }
    }

    // ============ 交叉轴对齐 ============
    if (node.counterAxisAlignItems) {
      switch (node.counterAxisAlignItems) {
        case 'CENTER':
          classes.push('items-center');
          break;
        case 'MAX':
          classes.push('items-end');
          break;
        case 'BASELINE':
          classes.push('items-baseline');
          break;
        case 'MIN':
        default:
          classes.push('items-start');
      }
    }

    // ============ 内边距 ============
    if (node.paddingTop !== undefined || node.paddingLeft !== undefined) {
      const pt = node.paddingTop ?? 0;
      const pr = node.paddingRight ?? node.paddingLeft ?? 0;
      const pb = node.paddingBottom ?? node.paddingTop ?? 0;
      const pl = node.paddingLeft ?? 0;

      if (pt === pr && pr === pb && pb === pl) {
        classes.push(`p-${this._tailwindSpacingLegacy(pt)}`);
      } else {
        classes.push(`pt-${this._tailwindSpacingLegacy(pt)}`);
        classes.push(`pr-${this._tailwindSpacingLegacy(pr)}`);
        classes.push(`pb-${this._tailwindSpacingLegacy(pb)}`);
        classes.push(`pl-${this._tailwindSpacingLegacy(pl)}`);
      }
    }

    // ============ 间距 ============
    if (node.itemSpacing !== undefined && node.itemSpacing > 0) {
      classes.push(`gap-${this._tailwindSpacingLegacy(node.itemSpacing)}`);
    }

    // ============ 尺寸 ============
    if (node.absoluteBoundingBox) {
      const { width } = node.absoluteBoundingBox;
      if (node.primaryAxisSizingMode === 'FIXED') {
        if (node.layoutMode === 'HORIZONTAL') {
          classes.push(`w-[${width}px]`);
        }
      }
      if (node.counterAxisSizingMode === 'FIXED') {
        if (node.layoutMode === 'VERTICAL') {
          classes.push(`w-[${width}px]`);
        }
      }
    }

    // ============ 圆角 ============
    if (node.cornerRadius !== undefined && node.cornerRadius > 0) {
      const radiusMap: Record<number, string> = {
        0: 'rounded-none',
        2: 'rounded-sm',
        4: 'rounded',
        6: 'rounded-md',
        8: 'rounded-lg',
        12: 'rounded-xl',
        16: 'rounded-2xl',
        24: 'rounded-3xl',
      };
      classes.push(radiusMap[node.cornerRadius] || `rounded-[${node.cornerRadius}px]`);
    }

    // ============ 背景色（简化版：仅黑白和任意值） ============
    const fill = this._client?.getSolidFill(node) ?? null;
    if (fill && 'color' in fill && fill.color) {
      const colorHex = convertFigmaColor(fill.color, 'hex');
      if (colorHex === '#FFFFFFFF' || colorHex === '#FFFFFF') {
        classes.push('bg-white');
      } else if (colorHex === '#000000FF' || colorHex === '#000000') {
        classes.push('bg-black');
      } else {
        classes.push(`bg-[${colorHex}]`);
      }
    }

    // ============ 透明度 ============
    if (node.opacity !== undefined && node.opacity < 1) {
      classes.push(`opacity-${Math.round(node.opacity * 100)}`);
    }

    // ============ 溢出裁剪 ============
    if (node.clipsContent) {
      classes.push('overflow-hidden');
    }

    // ============ 文本样式 ============
    if (node.style) {
      const { fontWeight, fontSize, textAlignHorizontal } = node.style;

      // 字重
      if (fontWeight) {
        const weightMap: Record<number, string> = {
          100: 'font-thin',
          200: 'font-extralight',
          300: 'font-light',
          400: 'font-normal',
          500: 'font-medium',
          600: 'font-semibold',
          700: 'font-bold',
          800: 'font-extrabold',
          900: 'font-black',
        };
        classes.push(weightMap[fontWeight] || `font-[${fontWeight}]`);
      }

      // 字号
      if (fontSize) {
        const sizeMap: Record<number, string> = {
          12: 'text-xs',
          14: 'text-sm',
          16: 'text-base',
          18: 'text-lg',
          20: 'text-xl',
          24: 'text-2xl',
          30: 'text-3xl',
          36: 'text-4xl',
          48: 'text-5xl',
        };
        classes.push(sizeMap[fontSize] || `text-[${fontSize}px]`);
      }

      // 文本对齐
      if (textAlignHorizontal) {
        const alignMap: Record<string, string> = {
          LEFT: 'text-left',
          CENTER: 'text-center',
          RIGHT: 'text-right',
          JUSTIFIED: 'text-justify',
        };
        if (alignMap[textAlignHorizontal]) {
          classes.push(alignMap[textAlignHorizontal]!);
        }
      }
    }

    return classes;
  }

  /**
   * 生成内联样式（旧版）
   *
   * @param node - Figma 原始节点
   * @returns 内联样式对象字符串或 null
   */
  private _generateInlineStyleLegacy(node: FigmaNode): string | null {
    const styles: string[] = [];

    const fill = this._client?.getSolidFill(node) ?? null;
    if (fill && 'color' in fill && fill.color) {
      const color = convertFigmaColor(fill.color, 'rgb');
      styles.push(`backgroundColor: '${color}'`);
    }

    if (node.cornerRadius !== undefined) {
      styles.push(`borderRadius: '${node.cornerRadius}px'`);
    }

    if (styles.length === 0) return null;

    return `{\n        ${styles.join(',\n        ')}\n      }`;
  }

  /**
   * 生成子元素代码（旧版）
   *
   * @param node - Figma 原始节点
   * @param context - 生成上下文
   * @returns 子元素 JSX 字符串或 null
   */
  private _generateChildrenLegacy(node: FigmaNode, context: NodeContext): string | null {
    if (!node.children || node.children.length === 0 || !context.options.includeChildren) {
      return null;
    }

    const childContext: NodeContext = {
      ...context,
      depth: context.depth + 1,
      isRoot: false,
      parentType: node.type,
    };

    const childrenCode = node.children
      .map((child) => this._generateNodeCodeLegacy(child, childContext))
      .filter(Boolean)
      .join('\n');

    return childrenCode || null;
  }

  /**
   * 获取 HTML 标签（旧版简化版）
   *
   * @param node - Figma 原始节点
   * @returns HTML 标签名
   */
  private _getHtmlTagLegacy(node: FigmaNode): string {
    if (node.type === 'TEXT') return 'p';
    if (this._isButtonLegacy(node)) return 'button';
    if (this._isInputLegacy(node)) return 'input';
    if (this._isImageLegacy(node)) return 'img';
    if (this._isLinkLegacy(node)) return 'a';
    return 'div';
  }

  /**
   * 判断是否为按钮（旧版）
   */
  private _isButtonLegacy(node: FigmaNode): boolean {
    const name = node.name.toLowerCase();
    return name.includes('button') || name.includes('btn') || name.includes('按钮');
  }

  /**
   * 判断是否为输入框（旧版）
   */
  private _isInputLegacy(node: FigmaNode): boolean {
    const name = node.name.toLowerCase();
    return name.includes('input') || name.includes('textfield') || name.includes('输入');
  }

  /**
   * 判断是否为图片（旧版）
   */
  private _isImageLegacy(node: FigmaNode): boolean {
    if (node.fills) {
      for (const fill of node.fills) {
        if (fill.type === 'IMAGE') return true;
      }
    }
    return node.type === 'VECTOR' || (node.type === 'RECTANGLE' && node.name.toLowerCase().includes('image'));
  }

  /**
   * 判断是否为链接（旧版）
   */
  private _isLinkLegacy(node: FigmaNode): boolean {
    const name = node.name.toLowerCase();
    return name.includes('link') || name.includes('href') || name.includes('链接');
  }

  /**
   * 判断是否为自闭合标签（旧版）
   */
  private _isSelfClosingTagLegacy(tag: string): boolean {
    return ['img', 'input', 'br', 'hr'].includes(tag);
  }

  /**
   * 生成类名（旧版：从节点名生成 kebab-case 类名）
   */
  private _generateClassNameLegacy(node: FigmaNode): string {
    return node.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * 转换为 Tailwind 间距值（旧版）
   *
   * 1 unit = 0.25rem = 4px（基于 16px 根字号）
   */
  private _tailwindSpacingLegacy(px: number): string {
    const spacingMap: Record<number, string> = {
      0: '0',
      1: 'px',
      2: '0.5',
      4: '1',
      6: '1.5',
      8: '2',
      10: '2.5',
      12: '3',
      14: '3.5',
      16: '4',
      20: '5',
      24: '6',
      28: '7',
      32: '8',
      40: '10',
      48: '12',
      56: '14',
      64: '16',
    };
    return spacingMap[px] || `[${px}px]`;
  }

  /**
   * 生成组件名称（PascalCase）
   *
   * 将节点名称转换为有效的 React 组件名：
   * - 移除非字母数字字符
   * - 按空格/下划线/连字符分词
   * - 每个词首字母大写
   */
  private _generateComponentName(name: string): string {
    // 使用安全的标识符清理函数（v1.4.0 XSS 防护增强）
    return sanitizeIdentifier(name);
  }

  /**
   * 生成 Props 接口（旧版）
   */
  private _generatePropsInterfaceLegacy(componentName: string, _node: FigmaNode): string {
    return `export interface ${componentName}Props extends React.HTMLAttributes<HTMLDivElement> {
  /** 子元素 */
  children?: React.ReactNode;
  /** 自定义类名 */
  className?: string;
}`;
  }

  /**
   * 组装完整组件代码（旧版）
   */
  private _assembleComponentLegacy(
    componentName: string,
    jsxCode: string,
    propsInterface: string,
    context: NodeContext,
  ): string {
    const { options } = context;
    const lines: string[] = [];

    lines.push('import React from "react";');
    lines.push('');

    if (options.typescript && propsInterface) {
      lines.push(propsInterface);
      lines.push('');
    }

    const propsType = options.typescript ? `: React.FC<${componentName}Props>` : '';
    lines.push(`export const ${componentName}${propsType} = (props) => {`);
    lines.push(`  const { className, children, ...rest } = props;`);
    lines.push('');
    lines.push('  return (');
    lines.push(jsxCode);
    lines.push('  );');
    lines.push('};');
    lines.push('');
    lines.push(`export default ${componentName};`);

    return lines.join('\n');
  }

  /**
   * 生成 CSS Module（旧版，简化占位）
   */
  private _generateCSSModuleLegacy(node: FigmaNode): string {
    return `.root {
  /* Generated styles for ${node.name} */
}\n`;
  }
}

// ============ 工厂函数 ============

/**
 * 创建代码生成器实例
 *
 * @param client - Figma API 客户端实例（纯本地 CSS 转换时可传 null）
 * @param options - 代码生成选项
 * @returns CodeGenerator 实例
 */
export function createCodeGenerator(client: FigmaClient | null, options?: CodeGenOptions): CodeGenerator {
  return new CodeGenerator(client, options);
}
