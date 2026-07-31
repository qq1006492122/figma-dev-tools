/**
 * 设计 Tokens 提取服务 - Tokens Extractor
 *
 * 核心职责：从 Figma 文件和变量中提取结构化的设计 tokens，支持三种提取来源（按优先级）：
 *
 * 1. **Figma Variables（推荐）**：通过 Variables API 获取本地变量集合
 *    - COLOR → tokens.colors
 *    - FLOAT → 根据变量名判断是 spacing/radius/其他
 *    - STRING → 字体家族等（当前通过 Typography 处理）
 *
 * 2. **Figma Styles**：从文档共享样式中提取
 *    - FILL 样式 → 颜色 token
 *    - TEXT 样式 → 排版 token（字号、字重、行高、字间距等）
 *    - EFFECT 样式 → 阴影 token
 *
 * 3. **节点分析（补充）**：遍历节点树，从 Auto Layout 和样式属性中提取
 *    - padding → spacing tokens
 *    - itemSpacing → gap tokens
 *    - cornerRadius → radius tokens
 *    - 自动补充标准圆角值（sm/md/lg/xl 等）
 *
 * **提取流程：**
 * ```
 * 获取文件数据 → 尝试获取 Variables → Variables 提取 → Styles 补充 → 节点分析补充 → 返回 tokens
 * ```
 *
 * @module
 */

// ============ 依赖导入 ============

import type { FigmaFileResponse, FigmaVariablesResponse, FigmaNode, FigmaVariable, DesignTokens } from '../types.js';
import { createColorToken, convertFigmaColor } from '../utils/color.js';
import type { FigmaClient } from './figma-client.js';

// ============ 类型定义 ============

/**
 * Tokens 提取器配置选项
 */
export interface ExtractTokensOptions {
  /** 颜色输出格式，支持 hex/rgb/oklch/hsl，默认 oklch */
  colorFormat?: 'hex' | 'rgb' | 'oklch' | 'hsl';
  /** 间距单位，px 或 rem，默认 px */
  spacingUnit?: 'px' | 'rem';
  /** Token 名称前缀（如 "portal" 会生成 portal-primary-500） */
  tokenPrefix?: string;
  /** 是否从 Figma Variables 提取（优先级最高），默认 true */
  useVariables?: boolean;
  /** 是否从 Figma 共享样式提取，默认 true */
  useStyles?: boolean;
  /** 要提取的 Variables 模式名称（如 "light"/"dark"），默认使用默认模式 */
  modeName?: string;
}

// ============ 常量定义 ============

/** 默认提取选项 */
const DEFAULT_OPTIONS: Required<ExtractTokensOptions> = {
  colorFormat: 'oklch',
  spacingUnit: 'px',
  tokenPrefix: '',
  useVariables: true,
  useStyles: true,
  modeName: '',
};

// ============ TokensExtractor 类 ============

/**
 * 设计 Tokens 提取器类
 *
 * 从 Figma 文件中提取结构化的设计 tokens，包含颜色、间距、圆角、阴影、排版五大类。
 * 通过工厂函数 {@link createTokensExtractor} 创建实例。
 *
 * @example
 * ```typescript
 * const extractor = createTokensExtractor(figmaClient, { colorFormat: 'hex' });
 * const tokens = await extractor.extract(fileKey, nodeId);
 *
 * // tokens.colors.primary → { value: '#6274ff', ... }
 * // tokens.spacing['spacing-4'] → { value: 16, unit: 'px', ... }
 * // tokens.radius.lg → { value: 8, unit: 'px', ... }
 * ```
 */
export class TokensExtractor {
  /** Figma API 客户端实例 */
  private readonly _client: FigmaClient;
  /** 提取器配置（已合并默认值） */
  private readonly _options: Required<ExtractTokensOptions>;

  /**
   * 构造函数 - 初始化 Tokens 提取器
   *
   * @param client - Figma API 客户端实例
   * @param options - 提取器配置选项
   */
  constructor(client: FigmaClient, options: ExtractTokensOptions = {}) {
    this._client = client;
    this._options = { ...DEFAULT_OPTIONS, ...options };
  }

  // ============ 公共入口方法 ============

  /**
   * 从 Figma 文件提取所有设计 tokens
   *
   * 执行流程：
   * 1. 获取文件元数据
   * 2. 尝试获取 Variables（可能因权限失败，静默降级到样式提取）
   * 3. 初始化 tokens 对象（含元数据）
   * 4. 优先从 Variables 提取（最准确）
   * 5. 从 Styles 补充提取（Variables 未覆盖的部分）
   * 6. 遍历节点树补充提取（padding/gap/cornerRadius）
   * 7. 补充标准圆角 tokens
   *
   * @param fileKey - Figma 文件 Key
   * @param nodeId - 可选的节点 ID，指定时仅提取该节点范围内的 tokens
   * @returns 结构化的设计 tokens 对象
   * @throws {Error} 文件获取失败时抛出错误（Variables 失败不抛出，静默降级）
   */
  async extract(fileKey: string, nodeId?: string): Promise<DesignTokens> {
    const _startTime = Date.now();

    // ============ 获取文件数据 ============
    // depth=2 足够获取样式引用关系，避免加载过深节点树
    const file = await this._client.getFile(fileKey, undefined, nodeId ? undefined : 2);
    let variables: FigmaVariablesResponse | null = null;

    // ============ 尝试获取 Variables ============
    // Variables API 需要企业版或特定权限，可能失败，此处静默降级
    if (this._options.useVariables) {
      try {
        variables = await this._client.getVariables(fileKey);
      } catch {
        // Variables API 不可用时忽略，继续使用样式提取
      }
    }

    // ============ 初始化 tokens 对象 ============
    const tokens: DesignTokens = {
      colors: {},
      spacing: {},
      radius: {},
      shadows: {},
      typography: {},
      metadata: {
        source: 'figma',
        fileKey,
        generatedAt: new Date().toISOString(),
        figmaFileName: file.name,
      },
    };

    // ============ 1. 从 Variables 提取（优先级最高） ============
    if (variables) {
      await this._extractFromVariables(variables, tokens);
    }

    // ============ 2. 从 Styles 补充提取 ============
    if (this._options.useStyles) {
      await this._extractFromStyles(file, tokens);
    }

    // ============ 3. 从节点分析补充提取 ============
    // 指定 nodeId 时获取该节点作为根节点，否则使用文件根节点
    const rootNode = nodeId ? (await this._client.getNode(fileKey, nodeId)) || file.document : file.document;
    this._extractFromNodes(rootNode, tokens);

    return tokens;
  }

  // ============ 私有提取方法 - Variables ============

  /**
   * 从 Figma Variables 提取 tokens
   *
   * 支持三种变量类型：
   * - COLOR：颜色变量 → tokens.colors
   * - FLOAT：浮点数值 → 根据名称判断是间距/圆角/其他
   * - STRING：字符串变量 → 字体家族等（当前暂不处理，通过 Typography 处理）
   *
   * @param variablesData - Variables API 响应数据
   * @param tokens - 输出 tokens 对象（直接修改）
   */
  private async _extractFromVariables(variablesData: FigmaVariablesResponse, tokens: DesignTokens): Promise<void> {
    const { variables, variableCollections } = variablesData.meta;

    for (const [_varId, variable] of Object.entries(variables)) {
      // 找到变量所属的集合
      const collection = variableCollections[variable.variableCollectionId];
      if (!collection) continue;

      // 确定使用哪个模式（默认模式或指定模式）
      const modeId = this._options.modeName
        ? collection.modes.find((m) => m.name === this._options.modeName)?.modeId
        : collection.defaultModeId;

      if (!modeId) continue;

      // 获取该模式下的变量值
      const value = variable.valuesByMode[modeId];
      if (value === undefined || value === null) continue;

      const collectionName = this._normalizeCollectionName(collection.name);
      const tokenName = this._buildTokenName(collectionName, variable.name, variable.codeSyntax?.WEB);

      switch (variable.resolvedType) {
        case 'COLOR':
          // 颜色变量
          if (typeof value === 'object' && 'r' in value) {
            tokens.colors[tokenName] = createColorToken(
              variable.name,
              value,
              this._options.colorFormat,
              this._options.tokenPrefix,
              variable.description,
              variable.codeSyntax?.WEB,
            );
          }
          break;

        case 'FLOAT':
          // 浮点数值（间距、圆角、阴影参数等）
          if (typeof value === 'number') {
            this._extractFloatToken(variable, collectionName, value, tokens);
          }
          break;

        case 'STRING':
          // 字符串类型通常用于字体家族等，通过 Typography 处理
          if (typeof value === 'string' && this._isFontFamilyToken(variable.name, collection.name)) {
            // 字体家族 token 暂不单独提取，由 typography 处理
          }
          break;
      }
    }
  }

  // ============ 私有提取方法 - Styles ============

  /**
   * 从 Figma 共享样式提取 tokens
   *
   * 遍历文件中所有共享样式，在文档中找到使用该样式的节点，
   * 从节点实际属性中提取样式值。
   *
   * @param file - Figma 文件响应
   * @param tokens - 输出 tokens 对象（直接修改）
   */
  private async _extractFromStyles(file: FigmaFileResponse, tokens: DesignTokens): Promise<void> {
    for (const [styleId, style] of Object.entries(file.styles)) {
      // 在文档中查找使用此样式的第一个节点以获取样式值
      const styleNode = this._findStyleNode(file.document, styleId);
      if (!styleNode) continue;

      const tokenName = this._buildTokenName('style', style.name);

      switch (style.styleType) {
        case 'FILL':
          this._extractFillStyle(styleNode, tokenName, style, tokens);
          break;
        case 'TEXT':
          this._extractTextStyle(styleNode, tokenName, style, tokens);
          break;
        case 'EFFECT':
          this._extractEffectStyle(styleNode, tokenName, style, tokens);
          break;
      }
    }
  }

  // ============ 私有提取方法 - 节点分析 ============

  /**
   * 从节点递归提取 tokens（补充提取）
   *
   * 遍历节点树，从 Auto Layout 属性和视觉属性中提取：
   * - paddingLeft/paddingTop → 间距 token（水平/垂直内边距）
   * - itemSpacing → gap token
   * - cornerRadius → 圆角 token（自动匹配标准值）
   *
   * @param rootNode - 遍历起始根节点
   * @param tokens - 输出 tokens 对象（直接修改）
   */
  private _extractFromNodes(rootNode: FigmaNode, tokens: DesignTokens): void {
    // 从自动布局提取间距
    this._client.traverseNodes(rootNode, (node) => {
      // ============ 提取内边距 ============
      if (node.paddingLeft !== undefined || node.paddingTop !== undefined) {
        const nameBase = node.name.toLowerCase().replace(/\s+/g, '-');

        // 水平内边距
        if (node.paddingLeft !== undefined && node.paddingLeft > 0) {
          const key = `padding-${nameBase}-x`;
          if (!tokens.spacing[key]) {
            tokens.spacing[key] = {
              name: key,
              value: node.paddingLeft,
              unit: this._options.spacingUnit,
              description: `Extracted from node "${node.name}" horizontal padding`,
            };
          }
        }

        // 垂直内边距
        if (node.paddingTop !== undefined && node.paddingTop > 0) {
          const key = `padding-${nameBase}-y`;
          if (!tokens.spacing[key]) {
            tokens.spacing[key] = {
              name: key,
              value: node.paddingTop,
              unit: this._options.spacingUnit,
              description: `Extracted from node "${node.name}" vertical padding`,
            };
          }
        }
      }

      // ============ 提取项目间距（gap） ============
      if (node.itemSpacing !== undefined && node.itemSpacing > 0) {
        const nameBase = node.name.toLowerCase().replace(/\s+/g, '-');
        const key = `gap-${nameBase}`;
        if (!tokens.spacing[key]) {
          tokens.spacing[key] = {
            name: key,
            value: node.itemSpacing,
            unit: this._options.spacingUnit,
            description: `Extracted from node "${node.name}" item spacing`,
          };
        }
      }

      // ============ 提取圆角 ============
      if (node.cornerRadius !== undefined && node.cornerRadius > 0) {
        const _nameBase = node.name.toLowerCase().replace(/\s+/g, '-');
        const radiusValue = node.cornerRadius;
        const radiusKey = this._findRadiusKey(radiusValue);
        if (!tokens.radius[radiusKey]) {
          tokens.radius[radiusKey] = {
            name: radiusKey,
            value: radiusValue,
            unit: this._options.spacingUnit,
            description: `Corner radius ${radiusValue}px`,
          };
        }
      }
    });

    // ============ 补充标准圆角值（如果节点中未提取到） ============
    this._addDefaultRadiusTokens(tokens);
  }

  // ============ 私有辅助方法 - 类型判断与提取 ============

  /**
   * 提取浮点类型 token（间距/圆角等）
   *
   * 根据变量名和集合名判断 FLOAT 类型变量属于哪类 token：
   * - 名称含 radius/corner/rounded → radius token
   * - 名称含 shadow/blur/elevation → 跳过（阴影参数由 effect 样式处理）
   * - 其他 → 默认为 spacing token
   *
   * @param variable - Figma 变量对象
   * @param collectionName - 规范化后的集合名
   * @param value - 变量数值
   * @param tokens - 输出 tokens 对象（直接修改）
   */
  private _extractFloatToken(
    variable: FigmaVariable,
    collectionName: string,
    value: number,
    tokens: DesignTokens,
  ): void {
    const name = variable.name.toLowerCase();
    const tokenName = this._buildTokenName(collectionName, variable.name, variable.codeSyntax?.WEB);

    if (this._isRadiusToken(name, collectionName)) {
      // 圆角 token
      tokens.radius[tokenName] = {
        name: tokenName,
        value,
        unit: this._options.spacingUnit,
        description: variable.description,
      };
    } else if (this._isShadowToken(name, collectionName)) {
      // 阴影相关的浮点值（blur/spread 等）通过阴影样式处理，此处跳过
    } else {
      // 默认为间距 token
      tokens.spacing[tokenName] = {
        name: tokenName,
        value,
        unit: this._options.spacingUnit,
        description: variable.description,
      };
    }
  }

  /**
   * 提取填充样式为颜色 token
   *
   * @param node - 使用该样式的节点
   * @param tokenName - token 名称
   * @param style - Figma 样式对象
   * @param tokens - 输出 tokens 对象（直接修改）
   */
  private _extractFillStyle(
    node: FigmaNode,
    tokenName: string,
    style: { name: string; description: string },
    tokens: DesignTokens,
  ): void {
    const fill = this._client.getSolidFill(node);
    if (fill && 'color' in fill && fill.color) {
      tokens.colors[tokenName] = createColorToken(
        style.name,
        fill.color,
        this._options.colorFormat,
        this._options.tokenPrefix,
        style.description,
      );
    }
  }

  /**
   * 提取文本样式为排版 token
   *
   * 提取字号、字重、行高、字间距、字体家族等属性，
   * 如果文本有颜色，同时提取为颜色 token。
   *
   * @param node - 使用该样式的节点
   * @param tokenName - token 名称
   * @param style - Figma 样式对象
   * @param tokens - 输出 tokens 对象（直接修改）
   */
  private _extractTextStyle(
    node: FigmaNode,
    tokenName: string,
    style: { name: string; description: string },
    tokens: DesignTokens,
  ): void {
    if (!node.style) return;

    const textStyle = node.style;
    const fill = this._client.getSolidFill(node);

    tokens.typography[tokenName] = {
      name: tokenName,
      fontFamily: textStyle.fontFamily,
      fontWeight: textStyle.fontWeight,
      fontSize: textStyle.fontSize,
      lineHeight: textStyle.lineHeightPx,
      letterSpacing: textStyle.letterSpacing,
      unit: this._options.spacingUnit,
      description: style.description,
    };

    // 如果文本有颜色，也提取为颜色 token（避免重复）
    if (fill && 'color' in fill && fill.color) {
      const colorTokenName = `${tokenName}-color`;
      if (!tokens.colors[colorTokenName]) {
        tokens.colors[colorTokenName] = createColorToken(
          `${style.name} text`,
          fill.color,
          this._options.colorFormat,
          this._options.tokenPrefix,
        );
      }
    }
  }

  /**
   * 提取效果样式为阴影 token
   *
   * 处理 DROP_SHADOW 和 INNER_SHADOW 两种效果类型，
   * 多个阴影按索引命名（tokenName、tokenName-2、tokenName-3...）。
   *
   * @param node - 使用该样式的节点
   * @param tokenName - token 名称
   * @param style - Figma 样式对象
   * @param tokens - 输出 tokens 对象（直接修改）
   */
  private _extractEffectStyle(
    node: FigmaNode,
    tokenName: string,
    style: { name: string; description: string },
    tokens: DesignTokens,
  ): void {
    if (!node.effects) return;

    for (let i = 0; i < node.effects.length; i++) {
      const effect = node.effects[i];
      if (!effect || !effect.visible) continue;

      if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
        // 第一个阴影直接用 tokenName，多个阴影加数字后缀
        const shadowKey = i === 0 ? tokenName : `${tokenName}-${i + 1}`;
        tokens.shadows[shadowKey] = {
          name: shadowKey,
          type: effect.type === 'DROP_SHADOW' ? 'drop' : 'inner',
          x: effect.offset?.x || 0,
          y: effect.offset?.y || 0,
          blur: effect.radius,
          spread: effect.spread || 0,
          color: effect.color ? convertFigmaColor(effect.color, this._options.colorFormat) : '#000000',
          opacity: effect.color?.a,
          description: style.description,
        };
      }
    }
  }

  // ============ 私有辅助方法 - 查找与工具 ============

  /**
   * 在文档中递归查找使用特定样式的第一个节点
   *
   * @param root - 遍历起始根节点
   * @param styleId - 要查找的样式 ID
   * @returns 找到的节点，未找到返回 null
   */
  private _findStyleNode(root: FigmaNode, styleId: string): FigmaNode | null {
    let found: FigmaNode | null = null;

    this._client.traverseNodes(root, (node) => {
      // 检查节点的填充/文本/效果样式引用
      if (node.styles?.fill === styleId || node.styles?.text === styleId || node.styles?.effect === styleId) {
        found = node;
        return false; // 找到第一个后停止遍历
      }
      return true; // 继续遍历
    });

    return found;
  }

  /**
   * 规范化变量集合名称
   *
   * 将集合名转换为 kebab-case，移除特殊字符：
   * - 转小写
   * - 斜杠/反斜杠/空格 → 连字符
   * - 移除非字母数字连字符的字符
   * - 合并连续连字符
   * - 去除首尾连字符
   *
   * @param name - 原始集合名称
   * @returns 规范化后的 kebab-case 名称
   */
  private _normalizeCollectionName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[/\\\s]+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * 构建 token 名称
   *
   * 将多个部分拼接为 kebab-case token 名：
   * - 过滤 undefined/null 部分
   * - 每个部分转小写、特殊字符转连字符
   * - 用连字符拼接
   * - 可选添加前缀
   *
   * @param parts - 名称部分（可变参数）
   * @returns 完整的 kebab-case token 名称
   */
  private _buildTokenName(...parts: Array<string | undefined>): string {
    const validParts = parts.filter(Boolean).map((p) =>
      p!
        .toLowerCase()
        .replace(/[/\\\s_]+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, ''),
    );

    let name = validParts.join('-');
    if (this._options.tokenPrefix) {
      name = `${this._options.tokenPrefix}-${name}`;
    }
    return name;
  }

  /**
   * 判断是否是圆角 token
   *
   * 根据变量名和集合名中是否包含 radius/corner/rounded 关键字判断。
   *
   * @param name - 变量名（小写）
   * @param collectionName - 集合名（小写）
   * @returns 是圆角 token 返回 true
   */
  private _isRadiusToken(name: string, collectionName: string): boolean {
    const combined = `${collectionName} ${name}`.toLowerCase();
    return combined.includes('radius') || combined.includes('corner') || combined.includes('rounded');
  }

  /**
   * 判断是否是阴影 token
   *
   * 根据变量名和集合名中是否包含 shadow/blur/elevation 关键字判断。
   *
   * @param name - 变量名（小写）
   * @param collectionName - 集合名（小写）
   * @returns 是阴影 token 返回 true
   */
  private _isShadowToken(name: string, collectionName: string): boolean {
    const combined = `${collectionName} ${name}`.toLowerCase();
    return combined.includes('shadow') || combined.includes('blur') || combined.includes('elevation');
  }

  /**
   * 判断是否是字体家族 token
   *
   * 根据变量名和集合名中是否包含 font + family/face 关键字判断。
   *
   * @param name - 变量名（小写）
   * @param collectionName - 集合名（小写）
   * @returns 是字体家族 token 返回 true
   */
  private _isFontFamilyToken(name: string, collectionName: string): boolean {
    const combined = `${collectionName} ${name}`.toLowerCase();
    return combined.includes('font') && (combined.includes('family') || combined.includes('face'));
  }

  /**
   * 根据圆角值查找对应的标准 key
   *
   * Tailwind 标准圆角值映射：
   * - 0 → none
   * - 2 → sm
   * - 4 → default
   * - 6 → md
   * - 8 → lg
   * - 12 → xl
   * - 16 → 2xl
   * - 24 → 3xl
   * - 其他 → radius-{value}
   *
   * @param value - 圆角像素值
   * @returns 对应的圆角 key
   */
  private _findRadiusKey(value: number): string {
    const standardRadii: Record<number, string> = {
      0: 'none',
      2: 'sm',
      4: 'default',
      6: 'md',
      8: 'lg',
      12: 'xl',
      16: '2xl',
      24: '3xl',
    };
    return standardRadii[value] || `radius-${value}`;
  }

  /**
   * 添加默认圆角 tokens
   *
   * 补充 Tailwind 标准圆角值（none/sm/default/md/lg/xl/2xl），
   * 仅当 tokens.radius 中不存在时添加，避免覆盖 Variables/Styles 中定义的值。
   *
   * @param tokens - 输出 tokens 对象（直接修改）
   */
  private _addDefaultRadiusTokens(tokens: DesignTokens): void {
    const defaults = [
      { name: 'none', value: 0 },
      { name: 'sm', value: 2 },
      { name: 'default', value: 4 },
      { name: 'md', value: 6 },
      { name: 'lg', value: 8 },
      { name: 'xl', value: 12 },
      { name: '2xl', value: 16 },
    ];

    for (const { name, value } of defaults) {
      const key = this._options.tokenPrefix ? `${this._options.tokenPrefix}-${name}` : name;
      if (!tokens.radius[key]) {
        tokens.radius[key] = {
          name: key,
          value,
          unit: this._options.spacingUnit,
          description: `Default ${name} radius`,
        };
      }
    }
  }
}

// ============ 工厂函数 ============

/**
 * 创建 Tokens 提取器实例
 *
 * @param client - Figma API 客户端实例
 * @param options - 提取器配置选项
 * @returns TokensExtractor 实例
 *
 * @example
 * ```typescript
 * const extractor = createTokensExtractor(figmaClient, {
 *   colorFormat: 'hex',
 *   tokenPrefix: 'portal',
 * });
 * ```
 */
export function createTokensExtractor(client: FigmaClient, options?: ExtractTokensOptions): TokensExtractor {
  return new TokensExtractor(client, options);
}
