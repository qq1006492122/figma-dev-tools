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

import { organizeFrameworkImports } from './import-organizer.js';

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
  /**
   * 是否在 Prettier 之前自动整理 React/Vue 框架导入（v1.4.18，T5）。
   * 默认 true；仅 .tsx/.jsx（React）与 .vue（Vue，仅 script 块）产物生效。
   */
  organizeImports?: boolean;
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
  const { filePath, projectRoot = process.cwd(), silent = true, organizeImports = true } = options;

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

    // v1.4.18（T5）：Prettier 之前先做框架导入权威整理（纯函数、幂等）。
    // React 仅作用于组件产物扩展名；.ts/.js 工具文件保守不动以免误删。
    let organizedCode = code;
    if (organizeImports) {
      if (ext === '.tsx' || ext === '.jsx') {
        organizedCode = organizeFrameworkImports(organizedCode, { framework: 'react' });
      } else if (ext === '.vue') {
        organizedCode = organizeFrameworkImports(organizedCode, { framework: 'vue' });
      }
    }

    // P3-12：配置发现按项目根记忆化（批量生成多文件只扫描/解析一次）
    const { resolvedConfig } = await resolveProjectPrettierConfig(projectRoot);

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

    return await prettier.format(organizedCode, prettierOptions);
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
 * P3-12：按项目根缓存 Prettier 配置发现结果。
 * 每次 formatCode 原本都做最多 10 层 ×（package.json + 6 个配置名）的同步 stat
 * 与一次异步 resolveConfig（含 editorconfig 解析）；批量生成 N 个文件时重复 N 遍。
 * 配置在单次 CLI/MCP 进程生命周期内不会变化，缓存 Promise 同时合并并发调用。
 */
const prettierConfigCache = new Map<
  string,
  Promise<{ configPath: string | null; resolvedConfig: prettier.Options | null }>
>();

/**
 * 发现（或从缓存取）项目的 Prettier 配置；configPath/resolvedConfig 均可能为 null。
 */
function resolveProjectPrettierConfig(projectRoot: string): Promise<{
  configPath: string | null;
  resolvedConfig: prettier.Options | null;
}> {
  const cached = prettierConfigCache.get(projectRoot);
  if (cached) return cached;
  const pending = (async () => {
    const configPath = await findPrettierConfig(projectRoot);
    let resolvedConfig: prettier.Options | null = null;
    if (configPath) {
      resolvedConfig = await prettier.resolveConfig(configPath, {
        editorconfig: true,
      });
    }
    return { configPath, resolvedConfig };
  })();
  prettierConfigCache.set(projectRoot, pending);
  return pending;
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
      } catch (err) {
        // package.json 解析失败时静默继续（可能是注释 JSON 或格式问题）
        console.warn(`[figma-dev] Failed to parse ${pkgPath}:`, err instanceof Error ? err.message : err);
      }
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
