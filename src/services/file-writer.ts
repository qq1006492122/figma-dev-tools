/**
 * 文件输出服务 - File Writer
 *
 * 核心职责：将提取的 design tokens 和生成的 React 组件代码写入文件系统，支持：
 *
 * **输出文件类型：**
 * - Tokens JSON：结构化的 design tokens 数据文件
 * - CSS Variables：:root 下的 CSS 自定义属性（兼容 Tailwind v3/v4）
 * - Tailwind Theme：Tailwind CSS v4 `@theme inline` 格式配置
 * - React 组件：.tsx 组件 + CSS Module + 类型文件 + barrel export
 * - 配置文件：figma-dev.config.json（自动排除 access token）
 *
 * **功能特性：**
 * - 自动创建目标目录（递归）
 * - Prettier 代码格式化（TypeScript/CSS/JSON）
 * - 可选的文件备份（覆盖前自动创建 .bak 文件）
 * - 自动维护 index.ts barrel export（不重复导出）
 * - 敏感信息过滤（不写入 figmaAccessToken）
 *
 * **注意**：Prettier 是可选依赖，未安装时自动跳过格式化，使用原始内容。
 *
 * @module
 */

// ============ 依赖导入 ============

import path from 'node:path';

import fs from 'fs-extra';

import type { DesignTokens, GeneratedComponent, FigmaDevConfig } from '../types.js';
import { buildDtcgTokens, validateDtcgTokens } from './dtcg-token-formatter.js';

// ============ 类型定义 ============

/**
 * 文件写入器配置选项
 */
export interface WriteOptions {
  /** 输出根目录（所有文件都写入此目录下） */
  outputDir: string;
  /** 是否使用 Prettier 格式化代码（TypeScript/CSS/JSON），默认 true */
  format?: boolean;
  /** 是否在覆盖文件前创建 .bak 备份，默认 true */
  backup?: boolean;
}

// ============ 常量定义 ============

/** 默认写入配置 */
const DEFAULT_OPTIONS: Required<WriteOptions> = {
  format: true,
  backup: true,
  outputDir: '',
};

// ============ FileWriter 类 ============

/**
 * 文件写入器类
 *
 * 提供各类设计产物的文件写入能力，支持格式化、备份、目录自动创建。
 * 通过工厂函数 {@link createFileWriter} 创建实例。
 *
 * @example
 * ```typescript
 * const writer = createFileWriter({
 *   outputDir: './src/design-system',
 *   format: true,
 *   backup: true,
 * });
 *
 * // 写入 tokens
 * await writer.writeTokensJson(tokens);
 * await writer.writeCSSVariables(tokens);
 *
 * // 写入组件
 * await writer.writeComponent(generatedComponent);
 * ```
 */
export class FileWriter {
  /** 写入器配置（已合并默认值） */
  private readonly _options: Required<WriteOptions>;

  /**
   * 构造函数 - 初始化文件写入器
   *
   * @param options - 写入器配置选项
   */
  constructor(options: WriteOptions) {
    this._options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
  }

  // ============ 公共方法 - 目录操作 ============

  /**
   * 确保目录存在（递归创建）
   *
   * @param dirPath - 要确保存在的目录路径
   * @returns Promise（目录创建完成后 resolve）
   */
  async ensureDir(dirPath: string): Promise<void> {
    await fs.ensureDir(dirPath);
  }

  // ============ 公共方法 - Tokens 输出 ============

  /**
   * 写入设计 Tokens 为 JSON 文件
   *
   * @param tokens - 结构化的设计 tokens 对象
   * @param fileName - 输出文件名，默认 'design-tokens.json'
   * @returns 写入的文件绝对路径
   */
  async writeTokensJson(tokens: DesignTokens, fileName: string = 'design-tokens.json'): Promise<string> {
    const filePath = path.join(this._options.outputDir, fileName);
    await this.ensureDir(path.dirname(filePath));

    const content = JSON.stringify(tokens, null, 2);
    await this._writeFile(filePath, content, 'json');

    return filePath;
  }

  /**
   * 写入 W3C DTCG 标准 Tokens JSON 文件（v1.4.18，T11）
   *
   * 输出 Design Tokens Format Module 合规的嵌套令牌树
   *（叶子为 `{ $type, $value, $description? }`）；写入前执行内置
   * schema 校验，理论上构建产物必然合法，校验为防御性兜底。
   *
   * @param tokens - 结构化的设计 tokens 对象
   * @param fileName - 输出文件名，默认 'design-tokens.tokens.json'
   * @returns 写入的文件绝对路径
   * @throws 构建产物未通过 DTCG 内置校验时抛出错误
   */
  async writeDtcgTokens(
    tokens: DesignTokens,
    fileName: string = 'design-tokens.tokens.json',
  ): Promise<string> {
    const tree = buildDtcgTokens(tokens);
    const validation = validateDtcgTokens(tree);
    if (!validation.valid) {
      throw new Error(`Generated DTCG tokens failed validation:\n${validation.errors.join('\n')}`);
    }

    const filePath = path.join(this._options.outputDir, fileName);
    await this.ensureDir(path.dirname(filePath));

    const content = `${JSON.stringify(tree, null, 2)}\n`;
    await this._writeFile(filePath, content, 'json');

    return filePath;
  }

  /**
   * 写入 CSS Variables 文件
   *
   * 生成 :root 下的 CSS 自定义属性声明，包含：
   * - Color Tokens（颜色）
   * - Spacing Tokens（间距）
   * - Radius Tokens（圆角）
   * - Shadow Tokens（阴影）
   * - Typography Tokens（排版：font-family/weight/size/line-height/letter-spacing）
   * - 预留 .dark 深色模式覆盖区块
   *
   * @param tokens - 结构化的设计 tokens 对象
   * @param fileName - 输出文件名，默认 'tokens.css'
   * @returns 写入的文件绝对路径
   */
  async writeCSSVariables(tokens: DesignTokens, fileName: string = 'tokens.css'): Promise<string> {
    const filePath = path.join(this._options.outputDir, fileName);
    await this.ensureDir(path.dirname(filePath));

    const lines: string[] = [
      '/**',
      ' * Design Tokens - Auto-generated from Figma',
      ` * Source: ${tokens.metadata.figmaFileName || tokens.metadata.fileKey}`,
      ` * Generated at: ${tokens.metadata.generatedAt}`,
      ' * Do not edit manually - run figma-dev sync to regenerate',
      ' */',
      '',
      ':root {',
    ];

    // ============ 颜色变量 ============
    lines.push('  /* ========== Color Tokens ========== */');
    for (const [name, token] of Object.entries(tokens.colors)) {
      const comment = token.description ? ` /* ${token.description} */` : '';
      lines.push(`  --${name}: ${token.value};${comment}`);
    }

    // ============ 间距变量 ============
    if (Object.keys(tokens.spacing).length > 0) {
      lines.push('');
      lines.push('  /* ========== Spacing Tokens ========== */');
      for (const [name, token] of Object.entries(tokens.spacing)) {
        const unit = token.unit || 'px';
        const comment = token.description ? ` /* ${token.description} */` : '';
        lines.push(`  --${name}: ${token.value}${unit};${comment}`);
      }
    }

    // ============ 圆角变量 ============
    if (Object.keys(tokens.radius).length > 0) {
      lines.push('');
      lines.push('  /* ========== Radius Tokens ========== */');
      for (const [name, token] of Object.entries(tokens.radius)) {
        const unit = token.unit || 'px';
        const comment = token.description ? ` /* ${token.description} */` : '';
        lines.push(`  --${name}: ${token.value}${unit};${comment}`);
      }
    }

    // ============ 阴影变量 ============
    if (Object.keys(tokens.shadows).length > 0) {
      lines.push('');
      lines.push('  /* ========== Shadow Tokens ========== */');
      for (const [name, token] of Object.entries(tokens.shadows)) {
        const opacityStr = token.opacity !== undefined ? ` / ${(token.opacity * 100).toFixed(0)}%` : '';
        const comment = token.description ? ` /* ${token.description} */` : '';
        lines.push(
          `  --${name}: ${token.x}px ${token.y}px ${token.blur}px ${token.spread}px ${token.color}${opacityStr};${comment}`,
        );
      }
    }

    // ============ 排版变量 ============
    if (Object.keys(tokens.typography).length > 0) {
      lines.push('');
      lines.push('  /* ========== Typography Tokens ========== */');
      for (const [name, token] of Object.entries(tokens.typography)) {
        const unit = token.unit || 'px';
        const comment = token.description ? ` /* ${token.description} */` : '';
        lines.push(`  --${name}-font-family: '${token.fontFamily}';${comment}`);
        lines.push(`  --${name}-font-weight: ${token.fontWeight};`);
        lines.push(`  --${name}-font-size: ${token.fontSize}${unit};`);
        if (token.lineHeight) {
          lines.push(`  --${name}-line-height: ${token.lineHeight}${unit};`);
        }
        if (token.letterSpacing) {
          lines.push(`  --${name}-letter-spacing: ${token.letterSpacing}px;`);
        }
      }
    }

    lines.push('}');
    lines.push('');

    // ============ 深色模式预留区块 ============
    lines.push('.dark {');
    lines.push('  /* Dark theme overrides - map to dark color tokens */');
    lines.push('}');

    const content = lines.join('\n');
    await this._writeFile(filePath, content, 'css');

    return filePath;
  }

  /**
   * 写入 Tailwind CSS v4 主题配置文件
   *
   * 适配项目现有的 `@theme inline` 格式，自动映射常用语义色：
   * primary → color-primary, success → color-success, error → color-destructive 等。
   * 输出文件需在 globals.css 中 `@import "tailwindcss"` 之后导入。
   *
   * @param tokens - 结构化的设计 tokens 对象
   * @param fileName - 输出文件名，默认 'figma-theme.css'
   * @returns 写入的文件绝对路径
   */
  async writeTailwindTheme(tokens: DesignTokens, fileName: string = 'figma-theme.css'): Promise<string> {
    const filePath = path.join(this._options.outputDir, fileName);
    await this.ensureDir(path.dirname(filePath));

    const lines: string[] = [
      '/**',
      ' * Figma Design Tokens - Tailwind CSS v4 Format',
      ` * Source: ${tokens.metadata.figmaFileName || tokens.metadata.fileKey}`,
      ` * Generated at: ${tokens.metadata.generatedAt}`,
      ' * Import this file in your globals.css after @import "tailwindcss"',
      ' */',
      '',
      '@theme inline {',
    ];

    // ============ 颜色 - 映射到 Tailwind 语义色 ============
    // Figma 常用色名到 Tailwind 语义色的映射表
    const colorMappings: Record<string, string> = {
      primary: 'color-primary',
      secondary: 'color-secondary',
      success: 'color-success',
      warning: 'color-warning',
      error: 'color-destructive',
      background: 'color-background',
      foreground: 'color-foreground',
      card: 'color-card',
      'card-foreground': 'color-card-foreground',
      muted: 'color-muted',
      'muted-foreground': 'color-muted-foreground',
      accent: 'color-accent',
      border: 'color-border',
      input: 'color-input',
      ring: 'color-ring',
    };

    for (const [name, token] of Object.entries(tokens.colors)) {
      // 尝试匹配语义色，未匹配则使用通用 color-{name} 命名
      let tailwindName = `color-${name}`;
      for (const [figmaName, twName] of Object.entries(colorMappings)) {
        if (name.toLowerCase().includes(figmaName)) {
          tailwindName = twName;
          break;
        }
      }
      lines.push(`  --${tailwindName}: ${token.value};`);
    }

    // ============ 圆角 ============
    lines.push('');
    lines.push('  /* Radius */');
    lines.push(`  --radius-sm: ${tokens.radius.sm?.value || 2}px;`);
    lines.push(`  --radius-md: ${tokens.radius.md?.value || 6}px;`);
    lines.push(`  --radius-lg: ${tokens.radius.lg?.value || 8}px;`);
    lines.push(`  --radius-xl: ${tokens.radius.xl?.value || 12}px;`);

    // ============ 字体 ============
    const fontKeys = Object.keys(tokens.typography);
    if (fontKeys.length > 0) {
      lines.push('');
      lines.push('  /* Fonts */');
      const defaultFont = tokens.typography[fontKeys[0]!];
      if (defaultFont) {
        lines.push(`  --font-sans: '${defaultFont.fontFamily}', system-ui, sans-serif;`);
      }
    }

    lines.push('}');

    const content = lines.join('\n');
    await this._writeFile(filePath, content, 'css');

    return filePath;
  }

  // ============ 公共方法 - 组件输出 ============

  /**
   * 写入 React 组件文件（.tsx + CSS Module + 类型文件 + barrel export）
   *
   * 输出文件：
   * - `{name}.tsx` - 组件主体代码
   * - `{name}.module.css` - CSS Module（仅当 cssCode 存在时）
   * - `{name}.types.ts` - 类型定义（仅当 typesCode 存在且与主体不同时）
   * - `index.ts` - barrel 导出文件（自动追加 export 语句，不重复）
   *
   * @param component - 生成的组件对象
   * @param outputDir - 组件输出目录（默认 {outputDir}/components）
   * @returns 所有写入文件的绝对路径数组
   */
  async writeComponent(component: GeneratedComponent, outputDir?: string): Promise<string[]> {
    const dir = outputDir || path.join(this._options.outputDir, 'components');
    await this.ensureDir(dir);

    const files: string[] = [];

    // ============ 主组件文件 (.tsx) ============
    const componentFileName = `${component.name}.tsx`;
    const componentPath = path.join(dir, componentFileName);
    await this._writeFile(componentPath, component.code, 'typescript');
    files.push(componentPath);

    // ============ CSS Module（如果有） ============
    if (component.cssCode) {
      const cssPath = path.join(dir, `${component.name}.module.css`);
      await this._writeFile(cssPath, component.cssCode, 'css');
      files.push(cssPath);
    }

    // ============ 类型文件（如果有且与主体代码不同） ============
    if (component.typesCode && component.typesCode !== component.code) {
      const typesPath = path.join(dir, `${component.name}.types.ts`);
      await this._writeFile(typesPath, component.typesCode, 'typescript');
      files.push(typesPath);
    }

    // ============ index.ts barrel export ============
    // 自动维护导出索引，避免重复导出
    const indexPath = path.join(dir, 'index.ts');
    const exportLine = `export { ${component.name} } from './${component.name}';\n`;

    let indexContent = '';
    if (await fs.pathExists(indexPath)) {
      indexContent = await fs.readFile(indexPath, 'utf-8');
      if (!indexContent.includes(exportLine.trim())) {
        indexContent += exportLine;
      }
    } else {
      indexContent = exportLine;
    }
    await this._writeFile(indexPath, indexContent, 'typescript');
    files.push(indexPath);

    return files;
  }

  // ============ 公共方法 - 配置输出 ============

  /**
   * 写入配置文件 (figma-dev.config.json)
   *
   * **安全注意**：自动从配置中移除 `figmaAccessToken` 字段，
   * 避免将敏感的 access token 提交到代码仓库。
   *
   * @param config - Figma 开发工具配置对象
   * @param fileName - 输出文件名，默认 'figma-dev.config.json'
   * @returns 写入的文件绝对路径
   */
  async writeConfig(config: FigmaDevConfig, fileName: string = 'figma-dev.config.json'): Promise<string> {
    const filePath = path.join(this._options.outputDir, fileName);
    await this.ensureDir(path.dirname(filePath));

    // 安全处理：不写入 access token 到文件
    const configToWrite = { ...config };
    delete (configToWrite as Partial<FigmaDevConfig>).figmaAccessToken;

    const content = JSON.stringify(configToWrite, null, 2);
    await this._writeFile(filePath, content, 'json');

    return filePath;
  }

  // ============ 私有方法 - 底层写入 ============

  /**
   * 底层文件写入方法（带备份和格式化）
   *
   * 执行流程：
   * 1. 如果 backup=true 且文件已存在，先创建 .bak 备份
   * 2. 如果 format=true 且指定了 parser，尝试用 Prettier 格式化
   * 3. 格式化失败时静默降级，使用原始内容
   * 4. 写入文件（UTF-8 编码）
   *
   * **注意**：Prettier 是可选依赖，使用动态导入避免未安装时报错。
   *
   * @param filePath - 目标文件绝对路径
   * @param content - 文件内容字符串
   * @param parser - Prettier parser 名称（typescript/css/json），不指定则不格式化
   */
  private async _writeFile(filePath: string, content: string, parser?: string): Promise<void> {
    // ============ 备份现有文件 ============
    if (this._options.backup && (await fs.pathExists(filePath))) {
      const backupPath = `${filePath}.bak`;
      await fs.copy(filePath, backupPath, { overwrite: true });
    }

    // ============ 格式化代码 ============
    let formattedContent = content;
    if (this._options.format && parser) {
      try {
        // 动态导入 Prettier（可选依赖，未安装时跳过格式化）
        const prettierModule = await import('prettier');
        const prettierFormat = prettierModule.format;
        formattedContent = await prettierFormat(content, {
          parser,
          semi: true,
          singleQuote: true,
          trailingComma: 'es5',
          printWidth: 100,
        });
      } catch {
        // Prettier 格式化失败或未安装，使用原始内容
      }
    }

    // ============ 写入文件 ============
    await fs.writeFile(filePath, formattedContent, 'utf-8');
  }
}

// ============ 工厂函数 ============

/**
 * 创建文件写入器实例
 *
 * @param options - 写入器配置选项
 * @returns FileWriter 实例
 *
 * @example
 * ```typescript
 * const writer = createFileWriter({
 *   outputDir: './src/design-system',
 *   format: true,
 *   backup: false,
 * });
 * ```
 */
export function createFileWriter(options: WriteOptions): FileWriter {
  return new FileWriter(options);
}
