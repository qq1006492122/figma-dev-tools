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
 *    - 根据 NodeSemanticRole 选择语义化 HTML 标签
 *    - 自动跳过 layout-only 冗余容器（消除 div soup）
 *    - 图片节点生成 &lt;img&gt; + publicCdnUrl() 引用
 *    - 复用组件（reusable-component）标记为 import 占位
 *    - 输出需要 @theme 扩展的 token 提示
 *    - **推荐使用此管道**
 *
 * **JSX 生成管道流程（新版）：**
 * ```
 * ProcessedNode 树
 *   ↓
 * 1. 可见性检查 → invisible 节点返回空字符串
 *   ↓
 * 2. layout-only 扁平化 → 直接渲染子节点，跳过当前 div
 *   ↓
 * 3. reusable-component 占位 → 输出 TODO 注释引导引入项目组件
 *   ↓
 * 4. TailwindMapper 映射 → className + extensionsNeeded + inlineStyle
 *   ↓
 * 5. 语义标签选择（_selectSemanticTag）→ h1-h6/p/button/img/span/ul/li/section 等
 *   ↓
 * 6. 特殊节点处理：
 *    - img → 追加 object-cover、src/alt 属性、待下载资源标记
 *    - text → 直接渲染 textContent
 *    - button → 添加 type="button"
 *   ↓
 * 7. 递归生成子节点 JSX
 *   ↓
 * 8. 组装为完整 TSX 组件（imports + Props 接口 + 组件函数）
 * ```
 *
 * @module
 */

// ============ 依赖导入 ============

import type { FigmaNode, CodeGenOptions, GeneratedComponent } from '../types.js';
import type { ProcessedNode, DesignContext } from '../types/nodes.js';
import { cn } from '../utils/cn.js';
import { convertFigmaColor } from '../utils/color.js';
import type { FigmaClient } from './figma-client.js';
import { createTailwindMapper, type TailwindMapping } from './tailwind-mapper.js';

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
  /** 需要 @theme 扩展的值列表 */
  extensions: TailwindMapping['extensionsNeeded'];
  /** 需要下载的资源列表（nodeId → 建议文件名） */
  pendingAssets: Array<{ nodeId: string; name: string; type: string }>;
  /** 是否使用 publicCdnUrl 引用资源 */
  usePublicCdn: boolean;
  /** 场景名称（用于资源路径组织） */
  sceneName: string;
  /** 组件使用统计映射 */
  componentMap: DesignContext['componentsUsed'];
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
};

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
 * ```
 */
export class CodeGenerator {
  /** Figma API 客户端实例 */
  private readonly _client: FigmaClient;
  /** 代码生成选项（已合并默认值） */
  private _options: Required<CodeGenOptions>;

  /**
   * 构造函数 - 初始化代码生成器
   *
   * @param client - Figma API 客户端实例
   * @param options - 代码生成选项
   */
  constructor(client: FigmaClient, options: Partial<CodeGenOptions> = {}) {
    this._client = client;
    this._options = { ...DEFAULT_CODE_GEN_OPTIONS, ...options };
  }

  // ============ 旧版管道（基于原始 FigmaNode） ============

  /**
   * 从 Figma 原始节点生成组件代码（旧版管道）
   *
   * @deprecated 推荐使用 {@link generateJsxFromContext} 基于 DesignContext 生成，
   *             新版支持智能 token 匹配和语义标签选择。
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
   * **推荐使用的代码生成入口**。特点：
   * - 使用 TailwindMapper 自动匹配 design token（bg-primary、rounded-lg、text-sm 等）
   * - 根据 NodeSemanticRole 选择正确的语义化 HTML 标签
   * - 自动跳过 layout-only 冗余容器（消除 div soup）
   * - 图片节点生成 &lt;img&gt; + publicCdnUrl() 引用
   * - 复用组件（reusable-component）标记为 import 占位
   * - 输出需要 @theme 扩展的 token 提示
   * - 标记待下载的资源列表
   *
   * @param context - 设计上下文（来自 DesignContextService.getDesignContext）
   * @param options - 生成选项
   * @returns 生成结果，包含 TSX 代码、imports、待扩展 token、待下载资源
   */
  generateJsxFromContext(
    context: DesignContext,
    options: {
      /** 组件名称（默认从节点名推断） */
      componentName?: string;
      /** 是否使用 publicCdnUrl() 引用资源，默认 true */
      usePublicCdn?: boolean;
      /** 场景名称（用于资源路径组织） */
      sceneName?: string;
    } = {},
  ): {
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
  } {
    const componentName = options.componentName || this._generateComponentName(context.node.name);
    const twMapper = createTailwindMapper({ allowArbitrary: true });
    const imports = new Set<string>(['import React from "react";']);
    const extensionsNeeded: TailwindMapping['extensionsNeeded'] = [];
    const pendingAssets: Array<{ nodeId: string; name: string; type: string }> = [];

    // ============ 递归生成 JSX 主体 ============
    const jsxBody = this._generateProcessedNodeJsx(context.node, twMapper, {
      depth: 1,
      isRoot: true,
      imports,
      extensions: extensionsNeeded,
      pendingAssets,
      usePublicCdn: options.usePublicCdn !== false,
      sceneName: options.sceneName || '',
      componentMap: context.componentsUsed,
    });

    // ============ 组装完整 TSX 文件 ============
    const propsName = `${componentName}Props`;
    const lines: string[] = [];
    lines.push('import React from "react";');
    lines.push('import { cn } from "@/lib/utils";');
    lines.push('');
    lines.push(`export interface ${propsName} extends React.HTMLAttributes<HTMLDivElement> {`);
    lines.push('  children?: React.ReactNode;');
    lines.push('}');
    lines.push('');
    lines.push(`export const ${componentName}: React.FC<${propsName}> = ({ className, children, ...rest }) => {`);
    lines.push('  return (');
    lines.push(jsxBody);
    lines.push('  );');
    lines.push('};');
    lines.push('');
    lines.push(`export default ${componentName};`);

    return {
      componentName,
      code: lines.join('\n'),
      imports,
      extensionsNeeded,
      pendingAssets,
    };
  }

  /**
   * 递归生成 ProcessedNode 的 JSX（新版管道核心）
   *
   * 处理流程（按顺序）：
   * 1. 不可见节点 → 返回空字符串
   * 2. layout-only 节点 → 跳过当前层，直接渲染子节点
   * 3. reusable-component → 输出 TODO 注释占位
   * 4. TailwindMapper 映射样式
   * 5. 语义标签选择
   * 6. 特殊节点处理（img、text、button）
   * 7. 递归生成子节点
   *
   * @param node - 当前精简节点
   * @param twMapper - Tailwind 映射器实例
   * @param ctx - 生成上下文（depth、imports、extensions 等）
   * @returns JSX 代码字符串
   */
  private _generateProcessedNodeJsx(
    node: ProcessedNode,
    twMapper: ReturnType<typeof createTailwindMapper>,
    ctx: ProcessedNodeContext,
  ): string {
    const indent = '  '.repeat(ctx.depth + 1);
    const nextCtx: ProcessedNodeContext = { ...ctx, depth: ctx.depth + 1, isRoot: false };

    // ============ 1. 不可见节点 → 跳过 ============
    if (node.visible === false) return '';

    // ============ 2. layout-only 节点 → 扁平化，直接渲染子节点 ============
    // 原因：这类节点无视觉样式，仅用于 Auto Layout 分组，
    // 在 HTML 中不需要额外的 div 嵌套，将 flex 布局传递给子节点即可
    if (node.role === 'layout-only') {
      if (!node.children || node.children.length === 0) return '';
      return node.children
        .map((child) => this._generateProcessedNodeJsx(child, twMapper, nextCtx))
        .filter(Boolean)
        .join('\n');
    }

    // ============ 3. 复用组件 → TODO 注释占位 ============
    // 原因：Figma Component/Instance 应映射到项目中已有的 React 组件，
    // 此处输出占位注释引导开发者从 @/components 引入对应组件
    if (node.role === 'reusable-component' && node.componentName) {
      const compName = this._generateComponentName(node.componentName);
      return `${indent}{/* TODO: 复用组件 <${compName} /> — 检查 @/components/web-official 或 componentMap */}`;
    }

    // ============ 4. Tailwind 样式映射 ============
    const tw = twMapper.mapNode(node);
    ctx.extensions.push(...tw.extensionsNeeded);

    // ============ 5. 语义标签选择 ============
    const tag = this._selectSemanticTag(node);

    // ============ 6. 判断是否为自闭合标签 ============
    const selfClosing = ['img', 'input', 'br', 'hr'].includes(tag);

    // ============ 7. 构建 props ============
    const props: string[] = [];

    // className：根节点合并外部传入的 className，其他节点直接使用
    if (ctx.isRoot) {
      props.push(`className={cn("${tw.className}", className)}`);
    } else {
      props.push(`className="${tw.className}"`);
    }

    // data 属性用于调试溯源
    props.push(`data-figma-id="${node.figmaId}"`);
    props.push(`data-figma-name="${node.name.replace(/"/g, '&quot;')}"`);

    // 内联样式兜底（复杂渐变等无法用 Tailwind 表达时使用）
    if (tw.inlineStyle) {
      const styleEntries = Object.entries(tw.inlineStyle)
        .map(([k, v]) => `${JSON.stringify(k)}: ${typeof v === 'number' ? v : JSON.stringify(v)}`)
        .join(', ');
      props.push(`style={{ ${styleEntries} }}`);
    }

    // 根节点展开外部传入的 rest props
    if (ctx.isRoot) {
      props.push('{...rest}');
    }

    // ============ 8. 图片节点特殊处理 ============
    if (tag === 'img') {
      // 图片默认追加 object-cover 防止变形
      const imgClassName = cn(tw.className, 'object-cover');
      const classIdx = props.findIndex((p) => p.startsWith('className='));
      if (classIdx >= 0) props[classIdx] = `className="${imgClassName}"`;

      // src 优先使用已下载的本地路径，其次是 CDN URL，最后标记为待下载
      if (node.asset?.cdnUrl) {
        props.push(`src={publicCdnUrl('${node.asset.cdnUrl}')}`);
      } else if (node.asset?.localPath) {
        props.push(`src={publicCdnUrl('${node.asset.localPath}')}`);
      } else {
        ctx.pendingAssets.push({ nodeId: node.figmaId, name: node.name, type: node.asset?.type || 'image' });
        props.push('src=""');
      }
      props.push(`alt="${node.name.replace(/"/g, '&quot;')}"`);
      return `${indent}<${tag} ${props.join(' ')} />`;
    }

    // ============ 9. 文本节点 → 直接渲染内容 ============
    if (node.role === 'text' || node.originalType === 'TEXT') {
      const text = node.textContent || '';
      return `${indent}<${tag} ${props.join(' ')}>${text}</${tag}>`;
    }

    // ============ 10. 按钮节点 → 添加 type="button" 防止表单默认提交 ============
    if (tag === 'button') {
      props.unshift('type="button"');
    }

    // ============ 11. 递归生成子节点 ============
    const childrenJsx =
      node.children && node.children.length > 0
        ? node.children
            .map((child) => this._generateProcessedNodeJsx(child, twMapper, nextCtx))
            .filter(Boolean)
            .join('\n')
        : '';

    // ============ 12. 组装最终 JSX ============
    if (selfClosing) {
      return `${indent}<${tag} ${props.join(' ')} />`;
    }

    if (childrenJsx) {
      return `${indent}<${tag} ${props.join(' ')}>\n${childrenJsx}\n${indent}</${tag}>`;
    }

    return `${indent}<${tag} ${props.join(' ')} />`;
  }

  /**
   * 根据语义角色选择 HTML 标签
   *
   * **选择规则（按优先级从高到低）：**
   *
   * 1. **自闭合元素**：
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
   *    - `icon` 角色 → `<span aria-hidden="true">`（图标占位，通常由 @repo/icons 渲染）
   *    - `badge` 角色 → `<span>`（徽章/标签）
   *
   * 6. **容器/区块**：
   *    - `section` 角色 → `<section>`（页面区块）
   *    - `card` 角色 → `<div>`（卡片容器，配合 card 语义类）
   *    - `avatar` 角色 → `<div>`（头像容器）
   *    - `steps`/`traffic-light` 角色 → `<div>`（复杂组件占位）
   *
   * 7. **可复用组件/兜底**：
   *    - `reusable-component` → `<div>`（占位，后续替换为组件引用）
   *    - `container`/其他 → `<div>`（普通容器）
   *
   * @param node - 当前精简节点
   * @returns HTML 标签名（小写）
   */
  private _selectSemanticTag(node: ProcessedNode): string {
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

    // 处理文本节点
    if (node.type === 'TEXT' && node.characters) {
      return `${indent}<${tag}${props}>${node.characters}</${tag}>`;
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

    // 添加 data 属性用于标识
    props.push(`data-figma-id="${node.id}"`);
    props.push(`data-figma-name="${node.name.replace(/"/g, '&quot;')}"`);

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
    const fill = this._client.getSolidFill(node);
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

    const fill = this._client.getSolidFill(node);
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
    return (
      name
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .split(/[\s_-]+/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('') || 'Component'
    );
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
 * @param client - Figma API 客户端实例
 * @param options - 代码生成选项
 * @returns CodeGenerator 实例
 */
export function createCodeGenerator(client: FigmaClient, options?: CodeGenOptions): CodeGenerator {
  return new CodeGenerator(client, options);
}
