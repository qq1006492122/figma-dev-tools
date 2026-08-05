/**
 * 代码格式化服务 - Code Formatter
 *
 * 在代码生成后自动通过 Prettier 格式化输出，
 * 自动检测并遵循项目现有的 Prettier 配置（.prettierrc、prettier.config.js 等），
 * 确保生成的代码与项目代码风格一致。
 *
 * @module
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import * as prettier from 'prettier';

/**
 * 格式化选项
 */
export interface FormatCodeOptions {
  /** 文件路径（用于推断 parser 和查找配置），如 'Component.tsx' */
  filePath?: string;
  /** 项目根目录（向上查找 prettier 配置的起点），默认 process.cwd() */
  projectRoot?: string;
  /** 是否在格式化失败时静默返回原始代码（默认 true） */
  silent?: boolean;
}

/**
 * 格式化代码
 *
 * 自动查找项目根目录的 Prettier 配置并应用格式化。
 * 如果找不到配置文件，则使用适合 React/TypeScript 项目的默认配置。
 *
 * @param code - 要格式化的源代码字符串
 * @param options - 格式化选项
 * @returns 格式化后的代码字符串（失败时返回原始代码）
 */
export async function formatCode(code: string, options: FormatCodeOptions = {}): Promise<string> {
  const { filePath, projectRoot = process.cwd(), silent = true } = options;

  try {
    const ext = filePath ? path.extname(filePath).toLowerCase() : '.tsx';
    let parser: prettier.BuiltInParserName = 'typescript';

    if (ext === '.tsx' || ext === '.jsx') parser = 'typescript';
    else if (ext === '.ts' || ext === '.js') parser = 'typescript';
    else if (ext === '.css') parser = 'css';
    else if (ext === '.json') parser = 'json';
    else if (ext === '.md') parser = 'markdown';
    else if (ext === '.html') parser = 'html';
    else if (ext === '.vue') parser = 'vue';
    else if (ext === '.svelte') parser = 'babel' as prettier.BuiltInParserName;

    const configPath = await findPrettierConfig(projectRoot);

    let resolvedConfig: prettier.Options | null = null;
    if (configPath) {
      resolvedConfig = await prettier.resolveConfig(configPath, {
        editorconfig: true,
      });
    }

    const defaultConfig: prettier.Options = {
      parser,
      semi: true,
      singleQuote: true,
      tabWidth: 2,
      trailingComma: 'all',
      printWidth: 100,
      bracketSpacing: true,
      bracketSameLine: false,
      arrowParens: 'always',
      endOfLine: 'lf',
    };

    const prettierOptions: prettier.Options = {
      ...defaultConfig,
      ...resolvedConfig,
      parser,
    };

    return await prettier.format(code, prettierOptions);
  } catch (error) {
    if (!silent) {
      console.warn(
        `[figma-dev] Prettier 格式化失败，返回原始代码: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return code;
  }
}

/**
 * 同步格式化代码（用于非 async 上下文）
 * 注意：Prettier 核心 API 是异步的，这里只是简单封装
 */
export function formatCodeSync(code: string, _options: FormatCodeOptions = {}): string {
  return code;
}

/**
 * 向上查找 Prettier 配置文件
 * @returns 找到的配置文件路径，null 表示未找到
 */
async function findPrettierConfig(startDir: string): Promise<string | null> {
  const configNames = [
    '.prettierrc',
    '.prettierrc.json',
    '.prettierrc.js',
    '.prettierrc.cjs',
    '.prettierrc.mjs',
    '.prettierrc.yml',
    '.prettierrc.yaml',
    'prettier.config.js',
    'prettier.config.cjs',
    'prettier.config.mjs',
  ];

  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { prettier?: unknown };
        if (pkg.prettier) return pkgPath;
      } catch {}
    }

    for (const name of configNames) {
      const configPath = path.join(dir, name);
      if (fs.existsSync(configPath)) return configPath;
    }

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

/**
 * 创建代码格式化器实例
 * 预加载配置以提升性能
 */
export async function createCodeFormatter(projectRoot: string = process.cwd()) {
  const configPath = await findPrettierConfig(projectRoot);
  let config: prettier.Options | null = null;

  if (configPath) {
    config = await prettier.resolveConfig(configPath, { editorconfig: true });
  }

  return {
    async format(code: string, filePath?: string): Promise<string> {
      return formatCode(code, { filePath, projectRoot });
    },

    getConfig(): prettier.Options | null {
      return config;
    },
  };
}
