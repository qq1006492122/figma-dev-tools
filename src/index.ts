#!/usr/bin/env node
/**
 * Figma Dev Tools MCP Server
 * 提供 Figma 设计稿与代码的桥接能力，包括：
 * - 设计 Tokens 提取
 * - 组件代码生成（含 Flex 修复、a11y 增强、设计系统对齐、响应式推断、移动端H5适配）
 * - 文件信息查询
 * - 截图获取
 * - 资源下载与 SVG Sprite 生成
 * - 设计规范检查（含维度评分）
 * - 本地缓存加速
 *
 * @version 版本号运行时读取 package.json（见 readPackageVersion），无需手动维护
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { z } from 'zod';

import { getI18n, initI18nSync } from './i18n/index.js';
import type { A11yReportEntry } from './services/a11y-enhancer.js';
import { createAssetDownloader, AssetDownloader } from './services/asset-downloader.js';
import { detectBundler, type BundlerKind } from './services/bundler-detector.js';
import {
  BrowserFallbackService,
  getBrowserFallbackService,
  type BrowserFallbackResult,
} from './services/browser-fallback.js';
import { createFigmaCache } from './services/cache.js';
import { createCodeGenerator } from './services/code-generator.js';
import {
  ALL_STYLE_FORMATS,
  assertStyleFormatSupported,
  STYLE_FORMATS_LEGACY_REACT,
  STYLE_FORMATS_NEW_PIPELINE,
  type StyleFormat,
} from './services/style-renderers/index.js';
import { createComponentMapper } from './services/component-mapper.js';
import { createDesignContextService } from './services/design-context.js';
import { createDesignLinter } from './services/design-linter.js';
import type { DesignSystemSuggestion } from './services/design-system.js';
import {
  FidelityVerifyService,
  type FidelityVerifyOptions,
  type FidelityVerifyResult,
} from './services/fidelity-verify.js';
import { createFigmaClient, type FigmaClient } from './services/figma-client.js';
import { createFileWriter } from './services/file-writer.js';
import { serializeDtcgTokens } from './services/dtcg-token-formatter.js';
import type { FlexFixEntry } from './services/flex-fixer.js';
import {
  OcrService,
  type OcrOptions,
  type OcrResult,
} from './services/ocr-service.js';
import type { ResponsiveSuggestion } from './services/responsive-inferrer.js';
import { generateSvgSprite, generateSpriteTypes } from './services/svg-sprite-generator.js';
import {
  getVisualApproximationService,
  type VisualApproximationResult,
} from './services/visual-approximation.js';
import { createTokensExtractor } from './services/tokens-extractor.js';
import { createVueGenerator } from './services/vue-generator.js';
// v1.4.19 T20：批量生成（页面区块拆分 + 多文件 + barrel + 依赖图）
import { createBatchGenerator } from './services/batch-generator.js';
import { selectBlocksByIds, splitPageIntoBlocks } from './services/block-splitter.js';
import type {
  CodeGenResult,
  DesignTokens,
  FigmaNode,
  Framework,
  SmartInferenceSwitches,
  TailwindExtension,
} from './types.js';
import type { ProcessedNode, StructuredNode } from './types/nodes.js';
import type { FigmaApiError } from './utils/errors.js';
import { isFigmaApiError, isFigmaDevError } from './utils/errors.js';
import { parseFigmaUrl, extractFileKey, extractNodeId } from './utils/figma-url.js';

dotenv.config();

// 初始化 i18n（v1.2.0 新增）
initI18nSync();

let figmaClient: FigmaClient | null = null;
let figmaCache: ReturnType<typeof createFigmaCache> | null = null;
let figmaClientTokenKey = '';

function getFigmaClient(token?: string): FigmaClient {
  const accessToken = token || process.env.FIGMA_ACCESS_TOKEN || process.env.FIGMA_OAUTH_TOKEN;

  if (!accessToken) {
    throw new Error(
      'Figma Access Token 未配置。请设置 FIGMA_ACCESS_TOKEN 环境变量或在调用时传入 token 参数。\n' +
        '如需多 Token 自动轮换，可用英文逗号分隔 FIGMA_ACCESS_TOKENS。\n' +
        '获取 Token: https://www.figma.com/developers/api#access-tokens',
    );
  }

  const fallbackTokens = (process.env.FIGMA_ACCESS_TOKENS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const tokens = Array.from(new Set([accessToken, ...fallbackTokens]));
  const tokenKey = tokens.join('|');

  if (!figmaClient || figmaClientTokenKey !== tokenKey) {
    if (!figmaCache) {
      figmaCache = createFigmaCache();
    }
    figmaClient = createFigmaClient({
      accessToken,
      tokens: fallbackTokens,
      cache: figmaCache,
      staleCacheFallback: true,
    });
    figmaClientTokenKey = tokenKey;
  }

  figmaClient.clearLastWarning();
  return figmaClient;
}

/**
 * getFigmaClient 的安全版本：token 未配置时返回 null 而非抛出异常。
 * 仅用于 catch 块中附带请求统计，不应作为主要获取方式。
 */
function getFigmaClientSafe(token?: string): FigmaClient | undefined {
  try {
    return getFigmaClient(token);
  } catch {
    return undefined;
  }
}

// ============ 统一错误处理与用户感知辅助 ============

/** 工具返回的文本内容块 */
interface TextContentBlock {
  type: 'text';
  text: string;
}

/** 结构化错误信息（放入 structuredContent.error） */
interface StructuredError {
  /** 错误码，如 TOKEN_EXPIRED、PAYMENT_REQUIRED */
  code: string;
  /** HTTP 状态码（如果有） */
  status?: number;
  /** 用户可读的错误原因 */
  reason: string;
  /** 建议操作 */
  solution: string;
  /** Figma 返回的原始错误文本 */
  originalMessage?: string;
  /** 错误发生时间 ISO 字符串 */
  timestamp: string;
  /** 当前请求统计（用于诊断） */
  requestStats?: {
    total: number;
    retried: number;
    cached: number;
    staleFallback: number;
    cacheHitRate: number;
  };
}

/**
 * 将任意异常归一化为结构化错误信息。
 *
 * 处理优先级：
 * 1. FigmaApiError — 包含 HTTP 状态码、错误码、原因、建议
 * 2. FigmaDevError — 包含错误码和 i18n 信息
 * 3. 普通 Error — 取 message
 * 4. 未知类型 — String(error)
 */
function normalizeError(error: unknown): StructuredError {
  const timestamp = new Date().toISOString();

  if (isFigmaApiError(error)) {
    const apiError = error as FigmaApiError;
    return {
      code: apiError.code,
      status: apiError.status,
      reason: apiError.message.split('\n')[0] || apiError.name,
      solution: apiError.message.includes('建议：') ? (apiError.message.split('建议：')[1]?.trim() ?? '') : '',
      originalMessage: apiError.originalMessage,
      timestamp,
    };
  }

  if (isFigmaDevError(error)) {
    const devError = error;
    return {
      code: devError.code,
      reason: devError.info.reason || devError.message,
      solution: (devError.info.solutions || []).join('；'),
      timestamp,
    };
  }

  if (error instanceof Error) {
    return {
      code: 'UNKNOWN_ERROR',
      reason: error.message,
      solution: '请检查参数和网络后重试；如问题持续请查看工具日志。',
      timestamp,
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    reason: String(error),
    solution: '请检查参数和网络后重试。',
    timestamp,
  };
}

/**
 * 构造统一的 MCP 工具错误返回。
 *
 * @param operation - 操作名称（如 "获取文件信息"），用于拼接用户可见消息
 * @param error - 捕获到的异常
 * @param client - 可选的 FigmaClient 实例，用于附带请求统计
 */
function buildToolErrorResponse(
  operation: string,
  error: unknown,
  client?: FigmaClient,
): {
  content: TextContentBlock[];
  isError: true;
  structuredContent: { error: StructuredError };
} {
  const structured = normalizeError(error);

  if (client) {
    structured.requestStats = client.getRequestStats();
  }

  const lines: string[] = [`❌ ${operation}失败。`];

  if (structured.status) {
    lines.push(`HTTP ${structured.status} [${structured.code}]`);
  } else {
    lines.push(`[${structured.code}]`);
  }

  lines.push(`原因：${structured.reason}`);
  if (structured.solution) {
    lines.push(`建议：${structured.solution}`);
  }
  if (structured.originalMessage) {
    lines.push(`原始响应：${structured.originalMessage}`);
  }

  return {
    content: [{ type: 'text', text: lines.join('\n') }],
    isError: true,
    structuredContent: { error: structured },
  };
}

/**
 * 将陈旧缓存降级警告追加到工具返回的文本内容顶部。
 *
 * @param lines - 已有的文本行数组（会被原地修改）
 * @param client - FigmaClient 实例，用于读取 lastWarning
 */
function prependStaleCacheWarning(lines: string[], client: FigmaClient): void {
  const warning = client.getLastWarning();
  if (warning) {
    lines.unshift(`> ⚠️ ${warning}\n`);
  }
}

/**
 * 运行时读取包版本，避免 MCP 握手版本与 package.json 脱节。
 *
 * 编译后本文件位于 dist/index.js，package.json 在其上一级目录。
 */
function readPackageVersion(): string {
  try {
    const pkgPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: unknown };
    return typeof pkg.version === 'string' && pkg.version.length > 0 ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const server = new McpServer({
  name: 'figma-dev-tools',
  version: readPackageVersion(),
});

/**
 * 样式方案参数（v1.4.18 T7；v1.4.19 T14–T17 六方案翻转为可用）：
 * schema 层暴露注册表全部 11 个方案（单一数据源），
 * handler 层按管线/框架用 assertStyleFormatSupported 显式拒绝未启用值，
 * 用户可看到「计划于 1.5.0 支持」或「该方案不支持 vue 框架」的提示而非静默错配。
 */
const STYLE_FORMAT_PARAM = z
  .enum(ALL_STYLE_FORMATS as [StyleFormat, ...StyleFormat[]])
  .default('tailwind')
  .describe(
    '样式方案：tailwind（默认）/unocss/css-modules/styled/emotion/less/sass/vanilla-extract/panda 已启用（styled/emotion/vanilla-extract/panda 仅 React；less/sass 支持 React+Vue）；css-variables 计划 1.5.0',
  );

/**
 * legacy React 管线（figma_generate_component）样式参数：
 * 仅 tailwind/css-modules/inline-styles，枚举由注册表常量展开派生。
 */
const LEGACY_STYLE_FORMAT_PARAM = z
  .enum([...STYLE_FORMATS_LEGACY_REACT])
  .default('tailwind')
  .describe('样式格式：tailwind（默认）| css-modules | inline-styles');

/**
 * v1.4.19 T21 智能推断分项开关：
 * 缺省四项全开；仅产出建议（注释/报告），不改写显式样式；skipEnhancements 为总闸。
 * Per-category smart inference toggles; all default on; advisory only (no explicit-style rewrites).
 */
const INFERENCE_PARAM = z
  .object({
    grid: z
      .boolean()
      .optional()
      .describe('布局推断：CSS Grid 行列/间隙、sticky/fixed/absolute 参照物（默认开）/ Grid & positioning inference (default on)'),
    icons: z
      .boolean()
      .optional()
      .describe('图标识别：≤48px 语义图标 → Lucide/Iconify/内联 SVG 建议（默认开）/ Icon recognition (default on)'),
    darkMode: z
      .boolean()
      .optional()
      .describe('深色模式：dark/light 语义 → dark: 前缀策略建议（默认开）/ Dark-mode strategy (default on)'),
    motion: z
      .boolean()
      .optional()
      .describe('交互动效：transition/hover/持续时间类建议（默认开）/ Motion hints (default on)'),
  })
  .optional()
  .describe(
    '智能推断分项开关（v1.4.19，缺省全开，仅建议不改写）/ Smart inference switches (v1.4.19, all on by default, advisory only)',
  );

server.registerTool(
  'figma_parse_url',
  {
    title: '解析 Figma URL',
    description: `解析 Figma 设计链接，提取 fileKey 和 nodeId。
支持多种 Figma URL 格式：
- https://www.figma.com/design/{fileKey}/{name}?node-id={nodeId}
- https://www.figma.com/file/{fileKey}/{name}?node-id={nodeId}

使用此工具获取 fileKey 后，再调用其他工具。`,
    inputSchema: z.object({
      url: z.string().describe('Figma 设计链接 URL'),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ url }) => {
    try {
      const parsed = parseFigmaUrl(url);

      if (!parsed.fileKey) {
        return {
          content: [
            {
              type: 'text',
              text: '无法从 URL 中解析出 fileKey，请确认 URL 格式是否正确。',
            },
          ],
          isError: true,
        };
      }

      const result = {
        fileKey: parsed.fileKey,
        nodeId: parsed.nodeId || null,
        fileName: parsed.fileName || null,
        isDesignUrl: parsed.isDesignUrl,
        figmaUrl: `https://www.figma.com/design/${parsed.fileKey}/${parsed.fileName || 'Untitled'}${
          parsed.nodeId ? `?node-id=${parsed.nodeId.replace(':', '-')}` : ''
        }`,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
        structuredContent: result,
      };
    } catch (error) {
      return buildToolErrorResponse('解析 URL', error);
    }
  },
);

server.registerTool(
  'figma_get_file',
  {
    title: '获取 Figma 文件信息',
    description: `获取 Figma 文件的基本信息，包括页面列表、组件数量、样式数量等。
在开始提取 tokens 或生成代码前，先用此工具了解文件结构。`,
    inputSchema: z.object({
      fileKey: z.string().describe('Figma 文件 Key（从 figma_parse_url 获取）'),
      figmaUrl: z.string().optional().describe('Figma URL（如果提供则自动解析 fileKey）'),
      accessToken: z.string().optional().describe('Figma Access Token（可选，优先使用环境变量）'),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ fileKey, figmaUrl, accessToken }) => {
    try {
      const key = figmaUrl ? extractFileKey(figmaUrl) : fileKey;
      if (!key) {
        return {
          content: [{ type: 'text', text: '请提供 fileKey 或有效的 figmaUrl' }],
          isError: true,
        };
      }

      const client = getFigmaClient(accessToken);
      const file = await client.getFile(key, undefined, 1);

      const pages =
        file.document.children?.map((page) => ({
          id: page.id,
          name: page.name,
          childCount: page.children?.length || 0,
        })) || [];

      const result = {
        name: file.name,
        lastModified: file.lastModified,
        version: file.version,
        role: file.role,
        pages,
        componentsCount: Object.keys(file.components).length,
        componentSetsCount: Object.keys(file.componentSets).length,
        stylesCount: Object.keys(file.styles).length,
        thumbnailUrl: file.thumbnailUrl,
        dataSource: client.getLastWarning() ? 'stale-cache' : 'live',
        warning: client.getLastWarning() ?? null,
      };

      const contentLines: string[] = [];
      prependStaleCacheWarning(contentLines, client);
      contentLines.push(
        `# ${file.name}\n\n` +
          `- **最后修改**: ${file.lastModified}\n` +
          `- **版本**: ${file.version}\n` +
          `- **页面数**: ${pages.length}\n` +
          `- **组件数**: ${result.componentsCount}\n` +
          `- **组件集数**: ${result.componentSetsCount}\n` +
          `- **样式数**: ${result.stylesCount}\n\n` +
          `## 页面列表\n\n` +
          pages.map((p, i) => `${i + 1}. **${p.name}** (${p.childCount} 个子元素) - ID: \`${p.id}\``).join('\n'),
      );

      return {
        content: [
          {
            type: 'text',
            text: contentLines.join('\n'),
          },
        ],
        structuredContent: result,
      };
    } catch (error) {
      return buildToolErrorResponse('获取文件信息', error, getFigmaClientSafe(accessToken));
    }
  },
);

server.registerTool(
  'figma_extract_tokens',
  {
    title: '提取设计 Tokens',
    description: `从 Figma 文件中提取设计 tokens，包括颜色、间距、圆角、阴影、字体等。
支持从 Figma Variables、Styles 和节点自动布局中提取。
提取的 tokens 可用于生成 CSS Variables 或 Tailwind 配置。`,
    inputSchema: z.object({
      fileKey: z.string().describe('Figma 文件 Key'),
      figmaUrl: z.string().optional().describe('Figma URL（如果提供则自动解析 fileKey）'),
      nodeId: z.string().optional().describe('节点 ID（可选，仅提取该节点下的 tokens）'),
      colorFormat: z
        .enum(['hex', 'rgb', 'oklch', 'hsl'])
        .default('oklch')
        .describe('颜色输出格式（推荐 oklch 用于 Tailwind v4）'),
      spacingUnit: z.enum(['px', 'rem']).default('px').describe('间距单位'),
      tokenPrefix: z.string().optional().describe('Token 名称前缀'),
      accessToken: z.string().optional().describe('Figma Access Token'),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ fileKey, figmaUrl, nodeId, colorFormat, spacingUnit, tokenPrefix, accessToken }) => {
    try {
      const key = figmaUrl ? extractFileKey(figmaUrl) : fileKey;
      const nId = figmaUrl ? extractNodeId(figmaUrl) : nodeId;

      if (!key) {
        return {
          content: [{ type: 'text', text: '请提供 fileKey 或有效的 figmaUrl' }],
          isError: true,
        };
      }

      const client = getFigmaClient(accessToken);
      const extractor = createTokensExtractor(client, {
        colorFormat,
        spacingUnit,
        tokenPrefix,
      });

      const tokens = await extractor.extract(key, nId);

      const summary = {
        colors: Object.keys(tokens.colors).length,
        spacing: Object.keys(tokens.spacing).length,
        radius: Object.keys(tokens.radius).length,
        shadows: Object.keys(tokens.shadows).length,
        typography: Object.keys(tokens.typography).length,
        source: tokens.metadata.figmaFileName || key,
      };

      let preview = `# 设计 Tokens 提取结果\n\n`;
      const staleWarning = client.getLastWarning();
      if (staleWarning) {
        preview += `> ⚠️ ${staleWarning}\n\n`;
      }
      preview += `**来源**: ${summary.source}\n\n`;
      preview += `## 统计\n\n`;
      preview += `- 颜色: ${summary.colors} 个\n`;
      preview += `- 间距: ${summary.spacing} 个\n`;
      preview += `- 圆角: ${summary.radius} 个\n`;
      preview += `- 阴影: ${summary.shadows} 个\n`;
      preview += `- 字体样式: ${summary.typography} 个\n\n`;

      if (Object.keys(tokens.colors).length > 0) {
        preview += `## 颜色预览（前 20 个）\n\n`;
        preview += '| 名称 | 值 |\n|------|----|\n';
        Object.entries(tokens.colors)
          .slice(0, 20)
          .forEach(([name, token]) => {
            preview += `| --${name} | ${token.value} |\n`;
          });
      }

      return {
        content: [{ type: 'text', text: preview }],
        structuredContent: {
          summary,
          tokens,
          dataSource: staleWarning ? 'stale-cache' : 'live',
          warning: staleWarning ?? null,
        },
      };
    } catch (error) {
      return buildToolErrorResponse('提取 Tokens', error, getFigmaClientSafe(accessToken));
    }
  },
);

server.registerTool(
  'figma_generate_component',
  {
    title: '生成 React 组件代码',
    description: `从 Figma 节点生成 React/TypeScript 组件代码（兼容旧版）。
自动识别布局、样式、文本等属性，生成 Tailwind CSS 类名。
注意：此工具使用旧版代码生成管线。如需 Flex 修复、a11y 增强、设计系统分析、
响应式推断等 v1.2.0 增强功能，请使用 figma_generate_jsx 工具。`,
    inputSchema: z.object({
      fileKey: z.string().describe('Figma 文件 Key'),
      nodeId: z.string().describe('节点 ID（必需）'),
      figmaUrl: z.string().optional().describe('Figma URL（如果提供则自动解析 fileKey 和 nodeId）'),
      componentName: z.string().optional().describe('组件名称（默认从节点名称生成）'),
      typescript: z.boolean().default(true).describe('是否生成 TypeScript 代码'),
      styleFormat: LEGACY_STYLE_FORMAT_PARAM,
      includeChildren: z.boolean().default(true).describe('是否包含子元素'),
      skipEnhancements: z.boolean().default(false).describe('是否跳过 v1.2.0 增强功能（Flex 修复、a11y 等）'),
      accessToken: z.string().optional().describe('Figma Access Token'),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({
    fileKey,
    nodeId,
    figmaUrl,
    componentName,
    typescript,
    styleFormat,
    includeChildren,
    skipEnhancements,
    accessToken,
  }) => {
    try {
      let key = fileKey;
      let nId = nodeId;

      if (figmaUrl) {
        key = extractFileKey(figmaUrl) || key;
        nId = extractNodeId(figmaUrl) || nId;
      }

      if (!key) {
        return {
          content: [{ type: 'text', text: '请提供 fileKey 或有效的 figmaUrl' }],
          isError: true,
        };
      }

      if (!nId) {
        return {
          content: [{ type: 'text', text: '请提供 nodeId（组件节点 ID）' }],
          isError: true,
        };
      }

      // v1.4.18（T7）：legacy 管线防御性校验（schema 已限三值，此处防程序化误调）
      assertStyleFormatSupported(styleFormat, STYLE_FORMATS_LEGACY_REACT);

      const client = getFigmaClient(accessToken);
      const generator = createCodeGenerator(client, {
        format: 'react',
        framework: 'react',
        typescript,
        styleFormat,
        componentName,
        includeChildren,
        skipEnhancements,
      });

      const component = await generator.generateComponent(key, nId);

      return {
        content: [
          {
            type: 'text',
            text:
              `# 生成组件: ${component.name}\n\n` +
              `## 依赖\n\n\`\`\`json\n${JSON.stringify(component.dependencies, null, 2)}\n\`\`\`\n\n` +
              `## 使用的 Tokens\n\n${component.tokensUsed.length > 0 ? component.tokensUsed.map((t) => `- ${t}`).join('\n') : '无'}\n\n` +
              `## 组件代码\n\n\`\`\`tsx\n${component.code}\n\`\`\``,
          },
        ],
        structuredContent: component,
      };
    } catch (error) {
      return buildToolErrorResponse('生成组件代码', error, getFigmaClientSafe(accessToken));
    }
  },
);

server.registerTool(
  'figma_get_screenshot',
  {
    title: '获取节点截图',
    description: `获取 Figma 节点的截图 URL，用于视觉参考。
在实现组件前获取截图，可以对照设计稿验证还原度。`,
    inputSchema: z.object({
      fileKey: z.string().describe('Figma 文件 Key'),
      nodeId: z.string().describe('节点 ID'),
      figmaUrl: z.string().optional().describe('Figma URL'),
      format: z.enum(['png', 'jpg', 'svg']).default('png').describe('图片格式'),
      scale: z.number().min(1).max(4).default(2).describe('缩放比例（1-4）'),
      accessToken: z.string().optional().describe('Figma Access Token'),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ fileKey, nodeId, figmaUrl, format, scale, accessToken }) => {
    try {
      const key = figmaUrl ? extractFileKey(figmaUrl) || fileKey : fileKey;
      const nId = figmaUrl ? extractNodeId(figmaUrl) || nodeId : nodeId;

      if (!key || !nId) {
        return {
          content: [{ type: 'text', text: '请提供 fileKey 和 nodeId' }],
          isError: true,
        };
      }

      const client = getFigmaClient(accessToken);
      const result = await client.getImages(key, [nId], format, scale);

      const imageUrl = result.images[nId];
      if (!imageUrl) {
        return {
          content: [{ type: 'text', text: '获取截图失败，节点可能不存在或无法导出' }],
          isError: true,
        };
      }

      const screenshotLines: string[] = [];
      prependStaleCacheWarning(screenshotLines, client);
      screenshotLines.push(
        `# 节点截图\n\n**节点 ID**: ${nId}\n**格式**: ${format}\n**缩放**: ${scale}x\n\n![Screenshot](${imageUrl})\n\n[查看原图](${imageUrl})`,
      );

      return {
        content: [
          {
            type: 'text',
            text: screenshotLines.join('\n'),
          },
        ],
        structuredContent: {
          nodeId: nId,
          format,
          scale,
          imageUrl,
          dataSource: client.getLastWarning() ? 'stale-cache' : 'live',
        },
      };
    } catch (error) {
      return buildToolErrorResponse('获取截图', error, getFigmaClientSafe(accessToken));
    }
  },
);

server.registerTool(
  'figma_generate_styles',
  {
    title: '生成样式配置文件',
    description: `将提取的设计 tokens 转换为可用的样式配置文件：
- CSS Variables 文件（:root 变量）
- Tailwind CSS v4 @theme inline 格式（适配项目现有样式系统）
- W3C DTCG 格式（$type/$value 嵌套 JSON，跨工具标准格式）
输出格式与项目的 @repo/tailwind-config 兼容。`,
    inputSchema: z.object({
      tokens: z.record(z.unknown()).describe('从 figma_extract_tokens 获取的 tokens 数据'),
      outputFormat: z
        .enum(['css-variables', 'tailwind-v4', 'json', 'dtcg'])
        .default('tailwind-v4')
        .describe('输出格式（dtcg=W3C Design Tokens 标准 JSON）'),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ tokens, outputFormat }) => {
    try {
      const designTokens = tokens as unknown as DesignTokens;
      // 纯本地转换，不需要 Figma API 调用，传 null 避免要求配置 Token
      const generator = createCodeGenerator(null);

      let output = '';
      let language = 'css';

      switch (outputFormat) {
        case 'css-variables':
          output = generator.generateCSSVariables({
            colors: designTokens.colors,
            spacing: designTokens.spacing,
            radius: designTokens.radius,
            shadows: designTokens.shadows,
          });
          break;
        case 'tailwind-v4':
          output =
            `@import 'tailwindcss';\n\n` +
            `@theme inline {\n` +
            Object.entries(designTokens.colors)
              .map(([name, token]) => `  --color-${name}: ${token.value};`)
              .join('\n') +
            `\n}`;
          break;
        case 'json':
          output = JSON.stringify(designTokens, null, 2);
          language = 'json';
          break;
        case 'dtcg':
          // v1.4.18 T11：W3C DTCG（$type/$value）标准 JSON
          output = serializeDtcgTokens(designTokens).trimEnd();
          language = 'json';
          break;
      }

      return {
        content: [
          {
            type: 'text',
            text: `# 生成的样式配置 (${outputFormat})\n\n\`\`\`${language}\n${output}\n\`\`\`\n\n将此代码保存到项目的样式文件中并导入到 globals.css。`,
          },
        ],
        structuredContent: {
          format: outputFormat,
          code: output,
        },
      };
    } catch (error) {
      return buildToolErrorResponse('生成样式配置', error);
    }
  },
);

server.registerTool(
  'figma_sync_to_project',
  {
    title: '同步 Tokens 到本地项目',
    description: `将提取的设计 tokens 写入到本地项目文件。
支持输出到：
- CSS Variables 文件
- Tailwind 主题文件
- JSON 格式的 tokens 文件
- W3C DTCG 标准 tokens 文件（v1.4.18）
文件会自动格式化并创建备份。`,
    inputSchema: z.object({
      tokens: z.record(z.unknown()).describe('设计 tokens'),
      outputDir: z.string().describe('输出目录路径（绝对路径）'),
      fileName: z.string().optional().describe('文件名（默认 figma-tokens.css）'),
      format: z
        .enum(['css', 'tailwind', 'json', 'dtcg', 'all'])
        .default('all')
        .describe('输出格式（all=css+tailwind+json+dtcg）'),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async ({ tokens, outputDir, fileName, format }) => {
    try {
      const designTokens = tokens as unknown as DesignTokens;
      const writer = createFileWriter({ outputDir, format: true, backup: true });

      const files: string[] = [];

      if (format === 'css' || format === 'all') {
        const cssPath = await writer.writeCSSVariables(designTokens, fileName || 'figma-tokens.css');
        files.push(cssPath);
      }

      if (format === 'tailwind' || format === 'all') {
        const twPath = await writer.writeTailwindTheme(
          designTokens,
          fileName?.replace('.css', '-theme.css') || 'figma-theme.css',
        );
        files.push(twPath);
      }

      if (format === 'json' || format === 'all') {
        const jsonPath = await writer.writeTokensJson(
          designTokens,
          fileName?.replace(/\.[^.]+$/, '.json') || 'design-tokens.json',
        );
        files.push(jsonPath);
      }

      // v1.4.18 T11：W3C DTCG 标准 tokens 文件
      if (format === 'dtcg' || format === 'all') {
        const dtcgName = fileName
          ? fileName.replace(/\.[^.]+$/, '.tokens.json')
          : 'design-tokens.tokens.json';
        const dtcgPath = await writer.writeDtcgTokens(designTokens, dtcgName);
        files.push(dtcgPath);
      }

      return {
        content: [
          {
            type: 'text',
            text: `# Tokens 同步完成\n\n已写入以下文件:\n\n${files.map((f) => `- \`${f}\``).join('\n')}\n\n记得在 globals.css 中导入生成的 CSS 文件。`,
          },
        ],
        structuredContent: { files },
      };
    } catch (error) {
      return buildToolErrorResponse('同步到项目', error);
    }
  },
);

server.registerTool(
  'figma_validate_token',
  {
    title: '验证 Figma Access Token',
    description: '验证 Figma Personal Access Token 是否有效，在使用其他工具前可以先验证。',
    inputSchema: z.object({
      accessToken: z.string().describe('Figma Access Token'),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ accessToken }) => {
    try {
      const client = createFigmaClient({ accessToken });
      const isValid = await client.validateToken();

      return {
        content: [
          {
            type: 'text',
            text: isValid
              ? '✅ Token 验证成功！可以正常访问 Figma API。'
              : '❌ Token 验证失败。请检查 Token 是否正确、是否过期。',
          },
        ],
        structuredContent: { valid: isValid },
      };
    } catch (error) {
      return buildToolErrorResponse('验证 Token', error);
    }
  },
);

server.registerTool(
  'figma_get_metadata',
  {
    title: '获取设计节点元数据（概览）',
    description: `获取 Figma 节点的高层结构概览，仅返回一层子节点信息（区块名、尺寸、组件数、颜色数）。
用于在开始实现前快速了解页面/Frame的结构分区，输出大小控制在 4KB 以内，避免上下文爆炸。
标准调用序：get_metadata → get_design_context → get_screenshot → download_assets`,
    inputSchema: z.object({
      fileKey: z.string().describe('Figma 文件 Key'),
      nodeId: z.string().optional().describe('节点 ID（不填则返回文件根信息）'),
      figmaUrl: z.string().optional().describe('Figma URL（自动解析 fileKey/nodeId）'),
      depth: z.number().min(1).max(3).default(1).describe('概览深度（默认1，最大3）'),
      accessToken: z.string().optional().describe('Figma Access Token'),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ fileKey, nodeId, figmaUrl, depth, accessToken }) => {
    try {
      const key = figmaUrl ? extractFileKey(figmaUrl) || fileKey : fileKey;
      const nId = figmaUrl ? extractNodeId(figmaUrl) : nodeId;
      if (!key) return { content: [{ type: 'text', text: '请提供 fileKey 或 figmaUrl' }], isError: true };

      const client = getFigmaClient(accessToken);
      const ctxService = createDesignContextService(client);
      const metadata = await ctxService.getMetadata(key, nId, depth);

      let preview = `# 设计概览: ${metadata.name}\n\n`;
      if (metadata.warnings && metadata.warnings.length > 0) {
        for (const w of metadata.warnings) {
          preview += `> ⚠️ ${w}\n\n`;
        }
      }
      preview += `- **数据来源**: ${metadata.dataSource === 'stale-cache' ? '陈旧缓存（可能非最新）' : '实时请求'}\n`;
      preview += `- **类型**: ${metadata.type}\n`;
      preview += `- **尺寸**: ${Math.round(metadata.size.width)} × ${Math.round(metadata.size.height)}\n`;
      preview += `- **直接子节点数**: ${metadata.childCount}\n`;
      preview += `- **使用颜色数**: ${metadata.colorsUsed.length}\n`;
      preview += `- **文本节点数**: ${metadata.textNodeCount}\n`;
      preview += `- **图片数**: ${metadata.imageCount}\n\n`;

      if (metadata.children.length > 0) {
        preview += `## 直接子区块（${metadata.children.length}个）\n\n`;
        preview += '| # | 名称 | 类型 | 语义 | 尺寸 | 子元素 | 组件? |\n';
        preview += '|---|------|------|------|------|--------|-------|\n';
        metadata.children.forEach((c, i) => {
          preview += `| ${i + 1} | ${c.name} | ${c.type} | ${c.semanticRole} | ${Math.round(c.size.width)}×${Math.round(c.size.height)} | ${c.childCount} | ${c.isComponent ? '✓' : ''} |\n`;
        });
        preview += '\n';
      }

      if (metadata.colorsUsed.length > 0) {
        preview += `## 使用的颜色（${metadata.colorsUsed.length}个）\n\n`;
        preview += metadata.colorsUsed
          .slice(0, 15)
          .map((c) => `- ${c}`)
          .join('\n');
        if (metadata.colorsUsed.length > 15) preview += `\n- ... (共${metadata.colorsUsed.length}个)`;
        preview += '\n';
      }

      return {
        content: [{ type: 'text', text: preview }],
        structuredContent: metadata,
      };
    } catch (error) {
      return buildToolErrorResponse('获取元数据', error, getFigmaClientSafe(accessToken));
    }
  },
);

server.registerTool(
  'figma_get_design_context',
  {
    title: '获取精简设计上下文',
    description: `获取指定节点经过层级精简后的结构化设计上下文，包含：精简节点树、使用的颜色/间距/圆角/阴影、文本节点摘要、资源列表、组件实例统计。
此工具对节点树进行了 GROUP 扁平化、冗余层过滤、语义角色标注，输出更适合 AI 生成代码。
建议先调用 get_metadata 了解结构，再对需要实现的子区块调用此工具。`,
    inputSchema: z.object({
      fileKey: z.string().describe('Figma 文件 Key'),
      nodeId: z.string().describe('节点 ID（必需）'),
      figmaUrl: z.string().optional().describe('Figma URL（自动解析 fileKey/nodeId）'),
      maxDepth: z.number().min(1).max(10).default(6).describe('最大节点树深度（默认6）'),
      accessToken: z.string().optional().describe('Figma Access Token'),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ fileKey, nodeId, figmaUrl, maxDepth, accessToken }) => {
    try {
      const key = figmaUrl ? extractFileKey(figmaUrl) || fileKey : fileKey;
      const nId = figmaUrl ? extractNodeId(figmaUrl) || nodeId : nodeId;
      if (!key || !nId) return { content: [{ type: 'text', text: '请提供 fileKey 和 nodeId' }], isError: true };

      const client = getFigmaClient(accessToken);
      const ctxService = createDesignContextService(client);
      const context = await ctxService.getDesignContext(key, nId, maxDepth);

      let preview = `# 设计上下文: ${context.node.name}\n\n`;
      if (context.warnings && context.warnings.length > 0) {
        for (const w of context.warnings) {
          preview += `> ⚠️ ${w}\n\n`;
        }
      }
      preview += `- **数据来源**: ${context.dataSource === 'stale-cache' ? '陈旧缓存（可能非最新）' : '实时请求'}\n`;
      preview += `- **语义角色**: ${context.node.role}\n`;
      preview += `- **尺寸**: ${context.node.size ? Math.round(context.node.size.width) + '×' + Math.round(context.node.size.height) : 'N/A'}\n`;
      preview += `- **颜色 token 数**: ${context.colors.length}\n`;
      preview += `- **间距值**: [${context.spacing.join(', ')}]\n`;
      preview += `- **圆角值**: [${context.radii.join(', ')}]\n`;
      preview += `- **阴影数**: ${context.shadows.length}\n`;
      preview += `- **资源数**: ${context.assets.length}\n`;
      preview += `- **文本节点**: ${context.textNodes.length}\n`;
      preview += `- **组件实例**: ${context.componentsUsed.length}\n\n`;

      if (context.assets.length > 0) {
        preview += `## 资源列表（需调用 figma_download_assets 下载）\n\n`;
        preview += '| 节点ID | 名称 | 类型 | 尺寸 |\n|--------|------|------|------|\n';
        context.assets.slice(0, 20).forEach((a) => {
          preview += `| ${a.nodeId} | ${a.name} | ${a.type}/${a.format} | ${a.width}×${a.height} |\n`;
        });
        preview += '\n';
      }

      if (context.textNodes.length > 0) {
        preview += `## 文本内容（前15条）\n\n`;
        context.textNodes.slice(0, 15).forEach((t) => {
          preview += `- \`${t.content.slice(0, 50)}${t.content.length > 50 ? '...' : ''}\` (${t.fontSize}px, ${t.fontWeight})\n`;
        });
        preview += '\n';
      }

      preview += `\n> 完整精简节点树已在 structuredContent.node 中，可直接遍历生成代码。\n`;

      return {
        content: [{ type: 'text', text: preview }],
        structuredContent: context,
      };
    } catch (error) {
      return buildToolErrorResponse('获取设计上下文', error, getFigmaClientSafe(accessToken));
    }
  },
);

/**
 * 构建器选择参数（v1.4.18，T4）：
 * auto = 依据 projectRoot 的 package.json/配置文件自动检测；
 * none = 强制 1.4.17 兼容行为（publicCdnUrl）。
 */
const BUNDLER_PARAM = z
  .enum(['auto', 'vite', 'webpack', 'nextjs', 'remix', 'none'])
  .default('auto')
  .describe('目标项目构建器：auto=自动检测（默认）；vite/webpack/nextjs/remix 显式指定；none=旧版 publicCdnUrl 行为');

server.registerTool(
  'figma_download_assets',
  {
    title: '下载设计资源到项目资源目录',
    description: `将 figma_get_design_context 返回的资源下载到项目资源目录，并生成与构建器匹配的引用代码。
v1.4.18 起按 bundler 落位：vite/webpack → src/assets/<场景>/（ESM import / require）；
nextjs/remix/未识别 → public/<场景>/（绝对路径或 publicCdnUrl()）。
v1.1.5 新增：自动使用 SVGO 优化 SVG，移除冗余属性。
遵循项目资源落位规范（figma-to-code.md）。`,
    inputSchema: z.object({
      fileKey: z.string().describe('Figma 文件 Key'),
      sceneName: z.string().describe('场景名称（如 c-nexus/home、health、edu，用于目录组织）'),
      assetNodeIds: z.array(z.string()).describe('要下载的资源节点 ID 列表'),
      figmaUrl: z.string().optional().describe('Figma URL（自动解析 fileKey）'),
      projectRoot: z.string().optional().describe('项目根目录绝对路径（默认自动检测）'),
      bundler: BUNDLER_PARAM,
      scale: z.number().min(1).max(4).default(2).describe('导出倍率（默认2x）'),
      svgFormat: z.enum(['svg', 'png']).default('svg').describe('矢量图形导出格式'),
      optimizeSvg: z.boolean().default(true).describe('是否使用 SVGO 优化 SVG（移除冗余属性、压缩体积），默认 true'),
      accessToken: z.string().optional().describe('Figma Access Token'),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ fileKey, sceneName, assetNodeIds, figmaUrl, projectRoot, bundler, scale, svgFormat, optimizeSvg, accessToken }) => {
    try {
      const key = figmaUrl ? extractFileKey(figmaUrl) || fileKey : fileKey;
      if (!key) return { content: [{ type: 'text', text: '请提供 fileKey 或 figmaUrl' }], isError: true };

      let root = projectRoot;
      if (!root) {
        let dir = process.cwd();
        for (let i = 0; i < 8; i++) {
          if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
            root = dir;
            break;
          }
          const parent = path.dirname(dir);
          if (parent === dir) break;
          dir = parent;
        }
        if (!root) root = process.cwd();
      }

      // v1.4.18（T4）：解析构建器；auto 时检测项目信号，未识别得到 none（等同 1.4.17）
      const effectiveBundler: BundlerKind =
        bundler === 'auto' ? (await detectBundler(root)).kind : bundler;

      const client = getFigmaClient(accessToken);

      const ctxService = createDesignContextService(client);
      const assets: NonNullable<ProcessedNode['asset']>[] = [];
      const skippedNodeIds: string[] = [];
      for (const nodeId of assetNodeIds) {
        try {
          const ctx = await ctxService.getDesignContext(key, nodeId, 1);
          if (ctx.node.asset) assets.push(ctx.node.asset);
          function collectAssets(n: ProcessedNode): void {
            if (n.asset) assets.push(n.asset);
            if (n.children) n.children.forEach(collectAssets);
          }
          collectAssets(ctx.node);
        } catch {
          // 单个节点获取失败时跳过，不影响其他资源下载
          skippedNodeIds.push(nodeId);
        }
      }

      const seen = new Set<string>();
      const uniqueAssets = assets.filter((a) => {
        if (seen.has(a.nodeId)) return false;
        seen.add(a.nodeId);
        return true;
      });

      if (uniqueAssets.length === 0) {
        return {
          content: [{ type: 'text', text: '未找到可下载的资源，请确认 nodeId 对应的是图片/图标节点。' }],
          isError: false,
        };
      }

      const downloader = createAssetDownloader(client, {
        projectRoot: root,
        scale: scale as 1 | 2 | 3 | 4,
        svgFormat: svgFormat as 'svg' | 'png',
        optimizeSvg,
        bundler: effectiveBundler,
      });

      const results = await downloader.downloadAssets(key, sceneName, uniqueAssets);
      const report = AssetDownloader.generateAssetsReport(results);

      const finalReport =
        skippedNodeIds.length > 0 ? `${report}\n\n> ⚠️ 以下节点获取失败已跳过: ${skippedNodeIds.join(', ')}` : report;

      return {
        content: [{ type: 'text', text: finalReport }],
        structuredContent: { results, projectRoot: root, sceneName, bundler: effectiveBundler, skippedNodeIds },
      };
    } catch (error) {
      return buildToolErrorResponse('下载资源', error, getFigmaClientSafe(accessToken));
    }
  },
);

server.registerTool(
  'figma_create_icon_sprite',
  {
    title: '生成 SVG Sprite 图标雪碧图',
    description: `将本地 public 目录下已下载的 SVG 图标合并为一个 SVG Sprite 文件，支持通过 <use href="#icon-name"> 引用。
适用场景：批量下载图标资源后，生成统一的雪碧图以减少 HTTP 请求。
使用前提：先调用 figma_download_assets 将 SVG 图标下载到项目目录。
输出：一个 sprite.svg 文件 + 可选的 TypeScript 类型定义文件（含图标名称联合类型）。`,
    inputSchema: z.object({
      svgDir: z.string().describe('包含 SVG 文件的目录绝对路径（通常是 public/portal/<场景名>/icons 之类的目录）'),
      outputPath: z.string().describe('输出 sprite.svg 的绝对路径（如 /path/to/public/icons/sprite.svg）'),
      typesPath: z.string().optional().describe('可选，输出 TypeScript 类型文件路径（如 /path/src/types/icons.ts）'),
      prefix: z.string().default('icon-').describe('symbol id 前缀，默认 "icon-"'),
      removeFill: z.boolean().default(true).describe('是否移除 fill 属性以便通过 CSS color 控制颜色，默认 true'),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ svgDir, outputPath, typesPath, prefix, removeFill }) => {
    try {
      if (!fs.existsSync(svgDir)) {
        return {
          content: [{ type: 'text', text: `目录不存在: ${svgDir}，请先调用 figma_download_assets 下载 SVG 资源。` }],
          isError: true,
        };
      }

      const allFiles = fs.readdirSync(svgDir);
      const svgFiles = allFiles
        .filter((f: string) => f.toLowerCase().endsWith('.svg'))
        .map((f: string) => path.join(svgDir, f));

      if (svgFiles.length === 0) {
        return {
          content: [{ type: 'text', text: `目录 ${svgDir} 中没有找到 SVG 文件。` }],
          isError: false,
        };
      }

      const results = generateSvgSprite(svgFiles, { outputPath, prefix, removeFill });
      const successCount = results.filter((r) => r.success).length;
      const failCount = results.filter((r) => !r.success).length;

      let typesFile: string | null = null;
      if (typesPath) {
        generateSpriteTypes(svgFiles, typesPath, prefix);
        typesFile = typesPath;
      }

      const exampleIcon = results.find((r) => r.success);
      const spriteRelPath = './' + path.basename(outputPath);
      const exampleSnippet = exampleIcon
        ? `\n## 使用示例\n\n\`\`\`tsx\n// 1. 在入口文件导入 sprite\nimport '${spriteRelPath}';\n\n// 2. 在组件中使用\nexport const Icon = ({ name }: { name: IconName }) => (\n  <svg className="icon" aria-hidden="true">\n    <use href={\`#${prefix}\${name}\`} />\n  </svg>\n);\n\`\`\``
        : '';

      let preview = `# SVG Sprite 生成完成\n\n`;
      preview += `- **输入目录**: ${svgDir}\n`;
      preview += `- **SVG 文件数**: ${svgFiles.length}\n`;
      preview += `- **成功合并**: ${successCount}\n`;
      preview += `- **失败**: ${failCount}\n`;
      preview += `- **输出文件**: ${outputPath}\n`;
      if (typesFile) preview += `- **类型文件**: ${typesFile}\n`;
      preview += exampleSnippet;

      if (failCount > 0) {
        preview += `\n## 处理失败的文件\n\n`;
        results
          .filter((r) => !r.success)
          .forEach((r) => {
            preview += `- ${r.name}: ${r.error}\n`;
          });
      }

      return {
        content: [{ type: 'text', text: preview }],
        structuredContent: {
          outputPath,
          typesPath: typesFile,
          totalSvg: svgFiles.length,
          successCount,
          failCount,
          icons: results.filter((r) => r.success).map((r) => r.name),
        },
      };
    } catch (error) {
      return buildToolErrorResponse('生成 SVG Sprite', error);
    }
  },
);

server.registerTool(
  'figma_list_components',
  {
    title: '列出文件中的组件',
    description: '列出 Figma 文件中定义的所有 Components 和 Component Sets，用于在生成代码前了解可用的可复用组件。',
    inputSchema: z.object({
      fileKey: z.string().describe('Figma 文件 Key'),
      figmaUrl: z.string().optional().describe('Figma URL'),
      accessToken: z.string().optional().describe('Figma Access Token'),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ fileKey, figmaUrl, accessToken }) => {
    try {
      const key = figmaUrl ? extractFileKey(figmaUrl) || fileKey : fileKey;
      if (!key) return { content: [{ type: 'text', text: '请提供 fileKey' }], isError: true };

      const client = getFigmaClient(accessToken);
      const ctxService = createDesignContextService(client);
      const { components, componentSets } = await ctxService.listComponents(key);

      let preview = `# 组件列表 (${components.length} 个组件, ${componentSets.length} 个组件集)\n\n`;
      if (componentSets.length > 0) {
        preview += `## 组件集（Variants）\n\n`;
        componentSets.slice(0, 30).forEach((cs) => {
          preview += `- **${cs.name}** (${cs.componentIds.length} variants)\n`;
        });
        preview += '\n';
      }
      if (components.length > 0) {
        preview += `## 组件\n\n`;
        components.slice(0, 50).forEach((c) => {
          preview += `- ${c.name} (key: \`${c.key}\`)\n`;
        });
        if (components.length > 50) preview += `\n- ... 共 ${components.length} 个`;
      }

      return {
        content: [{ type: 'text', text: preview }],
        structuredContent: { components, componentSets },
      };
    } catch (error) {
      return buildToolErrorResponse('获取组件列表', error, getFigmaClientSafe(accessToken));
    }
  },
);

server.registerTool(
  'figma_lint_design',
  {
    title: '代码还原质量预检',
    description: `检查 Figma 设计稿的代码还原质量，识别会影响生成代码质量的问题并给出修复建议。
这是代码生成前的预检工具，专注于"如何让 AI 更好地还原设计"，与官方 Figma Code Connect 互补（Code Connect 用于映射已有设计系统组件）。
检查项包括：Auto Layout 使用、图层命名、规范间距/尺寸/圆角、组件复用、无障碍尺寸、嵌套层级等。
评分低于 80 分时建议先修复问题再生成代码，以获得最佳还原效果。
参见：FIGMA-DESIGN-GUIDELINES.md 给设计师/AI 的设计规范。`,
    inputSchema: z.object({
      fileKey: z.string().describe('Figma 文件 Key'),
      nodeId: z.string().optional().describe('节点 ID（可选，默认检查整个文件或指定节点）'),
      figmaUrl: z.string().optional().describe('Figma URL（如果提供则自动解析 fileKey 和 nodeId）'),
      maxDepth: z.number().min(1).max(30).default(15).describe('最大检查深度（默认15）'),
      accessToken: z.string().optional().describe('Figma Access Token'),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ fileKey, nodeId, figmaUrl, maxDepth, accessToken }) => {
    try {
      const key = figmaUrl ? extractFileKey(figmaUrl) || fileKey : fileKey;
      const nId = figmaUrl ? extractNodeId(figmaUrl) || nodeId : nodeId;
      if (!key) {
        return { content: [{ type: 'text', text: '请提供 fileKey 或有效的 figmaUrl' }], isError: true };
      }

      const client = getFigmaClient(accessToken);
      const ctxService = createDesignContextService(client);
      const linter = createDesignLinter();

      let nodesToLint: ProcessedNode[] = [];

      if (nId) {
        const context = await ctxService.getDesignContext(key, nId, maxDepth);
        nodesToLint = [context.node];
      } else {
        const file = await client.getFile(key, undefined, 2);
        const pages = file.document.children || [];
        for (const page of pages) {
          try {
            const context = await ctxService.getDesignContext(key, page.id, maxDepth);
            nodesToLint.push(context.node);
          } catch {
            // 单页获取失败时跳过，继续检查其他页面
          }
        }
      }

      const result = linter.lint(nodesToLint);

      return {
        content: [{ type: 'text', text: result.markdownReport }],
        structuredContent: {
          score: result.score,
          totalNodes: result.totalNodes,
          errorCount: result.errorCount,
          warningCount: result.warningCount,
          infoCount: result.infoCount,
          issues: result.issues,
          categoryBreakdown: result.categoryBreakdown,
          summary: result.summary,
        },
      };
    } catch (error) {
      return buildToolErrorResponse('代码还原质量预检', error, getFigmaClientSafe(accessToken));
    }
  },
);

server.registerTool(
  'figma_generate_jsx',
  {
    title: '一键生成 React/Vue 组件代码（增强版 v1.4.0）',
    description: `整合增强管线：自动精简层级 → 匹配 design token → 语义标签选择 → Flex 布局修复 → 无障碍增强 → 设计系统对齐 → 响应式推断 → 生成组件代码。
v1.4.0 新增支持 Vue 3 SFC (<script setup lang="ts">) 和 UnoCSS！
v1.2.0 新增强化功能：
- 🔧 Flex 布局问题自动修复（图标变形、文本截断、溢出滚动等）
- ♿ 无障碍(a11y)自动增强（语义化标签、alt 文本、ARIA 属性）
- 🎨 设计系统自动化（颜色变量、间距/字体/圆角/阴影映射）
- 📱 响应式断点智能推断（设备类型、响应式前缀建议）
- 🧩 shadcn/ui 等组件库自动检测与映射建议
自动：消除 div soup（layout-only 节点扁平化）、颜色/间距/圆角/阴影命中 token、图片标记 publicCdnUrl 占位、复用组件提示 import。
输出包含：TSX/Vue 代码、增强报告、需下载资源列表、需 @theme 扩展的 token、复用组件提示。

工作流建议：
1. 先调用 figma_get_metadata 了解结构
2. 可选：调用 figma_lint_design 检查设计规范并修复问题
3. 对目标区块调用 figma_generate_jsx 生成代码（指定 framework=vue 生成 Vue 3）
4. 如有图片，调用 figma_download_assets 下载资源（v1.4.18 起按构建器落位 public/ 或 src/assets/）
5. 将生成代码复制到项目，处理 TODO 注释（复用组件映射）`,
    inputSchema: z.object({
      fileKey: z.string().describe('Figma 文件 Key（URL 中 /design/<key>/ 部分）'),
      nodeId: z.string().describe('目标节点 ID（URL 中 node-id= 参数）'),
      figmaUrl: z.string().optional().describe('Figma URL（可替代 fileKey+nodeId）'),
      componentName: z.string().optional().describe('生成的组件名（默认从节点名推断）'),
      sceneName: z.string().optional().describe('场景名（用于资源子路径组织）'),
      projectRoot: z
        .string()
        .optional()
        .describe('项目根目录绝对路径（bundler=auto 时用于检测构建器；默认取当前工作目录）'),
      bundler: BUNDLER_PARAM,
      maxDepth: z.number().min(1).max(30).default(15).describe('节点树最大遍历深度（默认 15）'),
      framework: z.enum(['react', 'vue']).default('react').describe('目标框架：react (默认) | vue (v1.4.0新增)'),
      styleFormat: STYLE_FORMAT_PARAM,
      unocssAttributify: z
        .boolean()
        .default(false)
        .describe('UnoCSS attributify 模式（v1.4.18新增，仅 styleFormat=unocss 生效；默认 false=wind 模式）'),
      skipEnhancements: z.boolean().default(false).describe('是否跳过 v1.2.0 增强功能'),
      inference: INFERENCE_PARAM,
      skipLintCheck: z.boolean().default(false).describe('是否跳过设计规范检查提示'),
      accessToken: z.string().optional().describe('Figma Access Token'),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (params) =>
    executeGenerateCodeTool({
      ...params,
      framework: params.framework,
      vueVersion: 3,
    }),
);

server.registerTool(
  'figma_generate_vue',
  {
    title: '一键生成 Vue 2/3 SFC 组件代码（v1.4.19 新增）/ Generate Vue 2 or Vue 3 SFC',
    description: `figma_generate_jsx 的 Vue 一级入口：自动精简层级 → design token 匹配 → 语义标签 → Flex 修复 → 无障碍增强 → 设计系统对齐 → 响应式推断 → 生成 .vue 单文件组件。
Dedicated Vue entry of figma_generate_jsx: produces a .vue SFC with the full enhancement pipeline (flex fixes, a11y, design-system tokens, responsive hints).
- vueVersion=3（默认/default）：<script setup lang="ts">；vueVersion=2：Options API（export default defineComponent，含 props/data/computed/methods 骨架与 PropType/validator）。
- 样式方案：tailwind / unocss / css-modules / less / sass（React 专属的 styled-components / Emotion / vanilla-extract / Panda CSS 会在触网前明确报错）。
- Style options: tailwind, unocss, css-modules, less, sass (React-only formats fail fast with a clear error).
输出包含 Output：Vue SFC 代码、增强报告、需下载资源、@theme 扩展 token、旁路样式文件（.module.css/.less/.scss）。`,
    inputSchema: z.object({
      fileKey: z.string().describe('Figma 文件 Key（URL 中 /design/<key>/ 部分）/ Figma file key'),
      nodeId: z.string().describe('目标节点 ID（URL 中 node-id= 参数）/ Target node id'),
      figmaUrl: z
        .string()
        .optional()
        .describe('Figma URL（可替代 fileKey+nodeId）/ Figma URL (alternative to fileKey+nodeId)'),
      componentName: z
        .string()
        .optional()
        .describe('生成的组件名（默认从节点名推断）/ Component name (inferred from node name by default)'),
      sceneName: z.string().optional().describe('场景名（用于资源子路径组织）/ Scene name for asset sub-path'),
      projectRoot: z
        .string()
        .optional()
        .describe('项目根目录绝对路径（bundler=auto 时用于检测构建器）/ Project root for bundler auto-detection'),
      bundler: BUNDLER_PARAM,
      maxDepth: z.number().min(1).max(30).default(15).describe('节点树最大遍历深度（默认 15）/ Max traversal depth (default 15)'),
      vueVersion: z
        .union([z.literal(2), z.literal(3)])
        .default(3)
        .describe(
          'Vue 大版本：3（默认，<script setup>）| 2（Options API）/ Vue major version: 3 (default, script setup) | 2 (Options API)',
        ),
      styleFormat: STYLE_FORMAT_PARAM,
      unocssAttributify: z
        .boolean()
        .default(false)
        .describe(
          'UnoCSS attributify 模式（仅 styleFormat=unocss 生效，默认 false）/ UnoCSS attributify mode (unocss only, default false)',
        ),
      skipEnhancements: z.boolean().default(false).describe('是否跳过增强功能 / Skip enhancement pipeline'),
      inference: INFERENCE_PARAM,
      skipLintCheck: z.boolean().default(false).describe('是否跳过设计规范检查提示 / Skip design lint hints'),
      accessToken: z.string().optional().describe('Figma Access Token'),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (params) =>
    executeGenerateCodeTool({
      ...params,
      framework: 'vue',
    }),
);

// ============= v1.4.19 T20：整页批量生成（工具 22） =============

server.registerTool(
  'figma_batch_generate',
  {
    title: '批量生成整页组件：区块拆分 → 多文件组件 → index barrel（v1.4.19 新增）',
    description: `把一个页面/大 Frame 自动拆分为语义区块（header / hero / features / section / sticky / footer），逐区块复用与 figma_generate_jsx 完全相同的增强管线生成独立组件文件，并产出 index.ts barrel 与文件依赖图。
Auto-splits a page/frame into semantic blocks (header, hero, features, sections, sticky bars, footer), generates one component file per block with the same enhancement pipeline as figma_generate_jsx, and emits an index.ts barrel plus a dependency graph.
- 省略 nodeIds：自动拆分 nodeId 指向页面/Frame 的顶层区块；提供 nodeIds 时仅生成指定区块（顺序按树位置归一化，与整页拆分同节点结果一致）。
- 框架与样式透传：framework=react|vue（vueVersion 2|3），styleFormat 支持全部 11 方案，React 专属方案在 Vue 下触网前明确报错。
- 输出 Output：区块清单、文件树、依赖图（barrel→主文件→旁路样式）、每个文件的完整代码、聚合待下载资源。
- MCP 不写磁盘；CLI figma-dev batch 可直接落盘为多文件目录。`,
    inputSchema: z.object({
      fileKey: z.string().describe('Figma 文件 Key（URL 中 /design/<key>/ 部分）/ Figma file key'),
      nodeId: z
        .string()
        .describe('页面或大 Frame 的根节点 ID（自动拆分对象；URL node-id）/ Root page/frame node id to split'),
      figmaUrl: z
        .string()
        .optional()
        .describe('Figma URL（可替代 fileKey+nodeId）/ Figma URL (alternative to fileKey+nodeId)'),
      nodeIds: z
        .array(z.string())
        .optional()
        .describe(
          '显式区块节点 ID 列表（省略=自动拆分整页；顺序按树位置归一化）/ Explicit block node ids (omit to auto-split)',
        ),
      componentNamePrefix: z
        .string()
        .optional()
        .describe('所有区块组件名统一前缀（ASCII，如 Landing）/ Prefix applied to every block component name'),
      sceneName: z.string().optional().describe('场景名（资源子路径组织）/ Scene name for asset sub-path'),
      projectRoot: z
        .string()
        .optional()
        .describe('项目根目录绝对路径（bundler=auto 检测用）/ Project root for bundler auto-detection'),
      bundler: BUNDLER_PARAM,
      maxDepth: z.number().min(1).max(30).default(15).describe('节点树最大遍历深度（默认 15）/ Max traversal depth'),
      framework: z.enum(['react', 'vue']).default('react').describe('目标框架：react (默认) | vue'),
      vueVersion: z.union([z.literal(2), z.literal(3)]).default(3).describe('Vue 大版本（仅 framework=vue）：3 默认 | 2'),
      styleFormat: STYLE_FORMAT_PARAM,
      unocssAttributify: z
        .boolean()
        .default(false)
        .describe('UnoCSS attributify 模式（仅 unocss 生效，默认 false）'),
      skipEnhancements: z.boolean().default(false).describe('是否跳过增强管线 / Skip enhancement pipeline'),
      inference: INFERENCE_PARAM,
      accessToken: z.string().optional().describe('Figma Access Token'),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (params) => executeBatchGenerateTool(params),
);

/** figma_batch_generate 工具入参（v1.4.19 T20） */
interface BatchGenerateToolInput {
  fileKey?: string;
  nodeId?: string;
  figmaUrl?: string;
  /** 显式区块节点 ID；省略/空数组 = 自动拆分整页 */
  nodeIds?: string[];
  componentNamePrefix?: string;
  sceneName?: string;
  projectRoot?: string;
  bundler: 'auto' | BundlerKind;
  maxDepth: number;
  framework: Framework;
  vueVersion: 2 | 3;
  styleFormat: StyleFormat;
  unocssAttributify: boolean;
  skipEnhancements: boolean;
  /** v1.4.19 T21：智能推断分项开关（缺省全开） */
  inference?: SmartInferenceSwitches;
  accessToken?: string;
}

/**
 * figma_batch_generate 工具执行体：整页区块拆分 + 逐区块生成 + barrel 汇总（v1.4.19 T20）。
 *
 * @param input - 已合并默认值的工具入参
 * @returns MCP 工具响应（Markdown 报告含全部文件代码 + structuredContent 文件清单）
 */
async function executeBatchGenerateTool(input: BatchGenerateToolInput): Promise<CallToolResult> {
  const {
    fileKey,
    nodeId,
    figmaUrl,
    nodeIds,
    componentNamePrefix,
    projectRoot,
    bundler,
    maxDepth,
    framework,
    vueVersion,
    styleFormat,
    unocssAttributify,
    skipEnhancements,
    inference,
    accessToken,
  } = input;
  const i18n = getI18n();
  try {
    let resolvedKey = fileKey;
    let resolvedNode = nodeId;
    if (figmaUrl) {
      const parsed = parseFigmaUrl(figmaUrl);
      if (parsed?.fileKey) resolvedKey = parsed.fileKey;
      if (parsed?.nodeId) resolvedNode = parsed.nodeId;
    }
    if (!resolvedKey || !resolvedNode) {
      return { content: [{ type: 'text', text: '请提供 fileKey 和 nodeId（页面/Frame 根节点），或 figmaUrl' }], isError: true };
    }

    // 本地校验先行（与单文件入口一致）：构建器检测与样式矩阵闸门均不触网
    const effectiveBundler: BundlerKind =
      bundler === 'auto' ? (await detectBundler(projectRoot ?? process.cwd())).kind : bundler;
    assertStyleFormatSupported(styleFormat, STYLE_FORMATS_NEW_PIPELINE, undefined, framework);

    const client = getFigmaClient(accessToken);
    const ctxService = createDesignContextService(client);
    const ctx = await ctxService.getDesignContext(resolvedKey, resolvedNode, maxDepth);

    // 阶段一：显式 nodeIds 优先；否则自动拆分整页（两者同节点时结果一致，TR-20.2）
    const explicitIds = (nodeIds ?? []).map((id) => id.trim()).filter(Boolean);
    const blocks = explicitIds.length > 0 ? selectBlocksByIds(ctx.node, explicitIds) : splitPageIntoBlocks(ctx.node);
    if (blocks.length === 0) {
      return { content: [{ type: 'text', text: i18n.t('batchGenerate.emptySelection') as string }], isError: true };
    }

    // 阶段二：逐区块复用单组件生成管线并汇总多文件产物
    const unocssMode: 'wind' | 'attributify' = unocssAttributify ? 'attributify' : 'wind';
    const batchGenerator = createBatchGenerator(client);
    const result = await batchGenerator.generate(blocks, ctx, {
      framework,
      vueVersion: framework === 'vue' ? vueVersion : undefined,
      styleFormat,
      unocssMode,
      bundler: effectiveBundler,
      skipEnhancements,
      inference,
      componentNamePrefix,
    });

    const lines: string[] = [];
    const frameworkLabel =
      framework === 'vue'
        ? vueVersion === 2
          ? 'Vue 2 SFC (Options API)'
          : 'Vue 3 SFC (<script setup>)'
        : 'React TSX';
    lines.push(`# ${i18n.t('batchGenerate.title') as string} - ${frameworkLabel} (${styleFormat})\n`);
    lines.push(`- **数据来源**: ${ctx.dataSource === 'stale-cache' ? '陈旧缓存（可能非最新）' : '实时请求'}`);
    lines.push(`- **区块数量**: ${result.blocks.length}`);
    lines.push(`- **文件数量**: ${result.files.length}（含 ${result.entryPoint}）\n`);

    // 区块清单
    lines.push(`## 🧱 ${i18n.t('batchGenerate.blocksHeading') as string}\n`);
    lines.push('| # | 类型 | 组件 | 源节点 | nodeId |');
    lines.push('| - | ---- | ---- | ------ | ------ |');
    result.blocks.forEach((block, index) => {
      lines.push(
        `| ${index + 1} | ${block.kind} | ${block.componentName} | ${block.sourceName} | \`${block.nodeId}\` |`,
      );
    });
    lines.push('');

    // 文件树
    lines.push(`## 📂 ${i18n.t('batchGenerate.filesHeading') as string}\n`);
    lines.push('```text');
    result.files.forEach((file, index) => {
      const branch = index === result.files.length - 1 ? '└──' : '├──';
      lines.push(`${branch} ${file.fileName}`);
    });
    lines.push('```\n');

    // 依赖图
    lines.push(`## 🔗 ${i18n.t('batchGenerate.graphHeading') as string}\n`);
    for (const edge of result.edges) {
      lines.push(`- \`${edge.from}\` → \`${edge.to}\` (${edge.kind})`);
    }
    lines.push('');

    // 全部文件内容
    for (const file of result.files) {
      lines.push(`## 📄 ${file.fileName}\n`);
      lines.push(`\`\`\`${file.lang}`);
      lines.push(file.content);
      lines.push('```\n');
    }

    if (result.pendingAssets.length > 0) {
      lines.push('## 🖼️ 需要下载的资源\n');
      lines.push('调用 `figma_download_assets` 下载以下资源：\n');
      const uniqueAssets = result.pendingAssets.filter((v, i, a) => a.findIndex((x) => x.nodeId === v.nodeId) === i);
      uniqueAssets.forEach((a) => {
        lines.push(`- nodeId: \`${a.nodeId}\` | 名称: ${a.name} | 类型: ${a.type}`);
      });
      lines.push('');
    }

    if (result.warnings.length > 0) {
      lines.push('## ⚠️ 聚合警告\n');
      result.warnings.slice(0, 15).forEach((w) => lines.push(`- ${w}`));
      if (result.warnings.length > 15) lines.push(`- ...还有 ${result.warnings.length - 15} 条`);
      lines.push('');
    }

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
      structuredContent: {
        framework,
        vueVersion: framework === 'vue' ? vueVersion : undefined,
        styleFormat,
        blocks: result.blocks,
        files: result.files,
        entryPoint: result.entryPoint,
        edges: result.edges,
        warnings: result.warnings,
        pendingAssets: result.pendingAssets,
        dataSource: ctx.dataSource ?? 'live',
      },
    };
  } catch (error) {
    return buildToolErrorResponse(
      framework === 'vue' ? '批量生成 Vue 组件' : '批量生成页面组件',
      error,
      getFigmaClientSafe(accessToken),
    );
  }
}

/** figma_generate_jsx / figma_generate_vue 的合并入参（v1.4.19 T18） */
interface GenerateCodeToolInput {
  fileKey?: string;
  nodeId?: string;
  figmaUrl?: string;
  componentName?: string;
  sceneName?: string;
  projectRoot?: string;
  /** zod 参数保留 'auto'，进入管线后解析为具体 BundlerKind */
  bundler: 'auto' | BundlerKind;
  maxDepth: number;
  /** 目标框架：figma_generate_jsx 由用户选择；figma_generate_vue 固定 vue */
  framework: Framework;
  /** Vue 大版本（仅 framework=vue 生效；jsx 工具固定补 3） */
  vueVersion: 2 | 3;
  styleFormat: StyleFormat;
  unocssAttributify: boolean;
  skipEnhancements: boolean;
  /** v1.4.19 T21：智能推断分项开关（缺省全开） */
  inference?: SmartInferenceSwitches;
  skipLintCheck: boolean;
  accessToken?: string;
}

/**
 * figma_generate_jsx 与 figma_generate_vue 的共享生成管线（v1.4.19 T18 抽取）。
 *
 * @param input - 已合并默认值的工具入参
 * @returns MCP 工具响应（Markdown 报告 + structuredContent）
 */
async function executeGenerateCodeTool(input: GenerateCodeToolInput): Promise<CallToolResult> {
  const {
    fileKey,
    nodeId,
    figmaUrl,
    componentName,
    sceneName,
    projectRoot,
    bundler,
    maxDepth,
    framework,
    vueVersion,
    styleFormat,
    unocssAttributify,
    skipEnhancements,
    inference,
    skipLintCheck,
    accessToken,
  } = input;
  try {
    let resolvedKey = fileKey;
    let resolvedNode = nodeId;
    if (figmaUrl) {
      const parsed = parseFigmaUrl(figmaUrl);
      if (parsed?.fileKey) resolvedKey = parsed.fileKey;
      if (parsed?.nodeId) resolvedNode = parsed.nodeId;
    }
    if (!resolvedKey || !resolvedNode) {
      return { content: [{ type: 'text', text: '请提供 fileKey 和 nodeId，或 figmaUrl' }], isError: true };
    }

    // v1.4.18（T4）：解析构建器；auto 时以 projectRoot（默认 cwd）检测，未识别得到 none
    const effectiveBundler: BundlerKind =
      bundler === 'auto' ? (await detectBundler(projectRoot ?? process.cwd())).kind : bundler;

    // v1.4.18（T7）：新管线样式注册表校验；planned/其他管线值显式报错（含计划版本），不静默降级
    // v1.4.19 T14–T17：追加框架矩阵（styled/emotion/vanilla-extract/panda 在 vue 下触网前拒绝）
    assertStyleFormatSupported(styleFormat, STYLE_FORMATS_NEW_PIPELINE, undefined, framework);

    const client = getFigmaClient(accessToken);
    const ctxService = createDesignContextService(client);
    const codeGen = createCodeGenerator(client);
    const vueGen = createVueGenerator(client);
    const componentMapper = createComponentMapper();

    const ctx = await ctxService.getDesignContext(resolvedKey, resolvedNode, maxDepth);

    // v1.4.0 新增：组件库检测
    const libDetection = componentMapper.detectLibrary();
    const componentMatches = componentMapper.matchComponentsInTree(ctx.node, libDetection.library);

    let lintReport: Awaited<ReturnType<ReturnType<typeof createDesignLinter>['lint']>> | null = null;
    if (!skipLintCheck) {
      try {
        const linter = createDesignLinter();
        lintReport = linter.lint(ctx.node);
      } catch {
        // 设计规范检查失败不阻塞代码生成
      }
    }

    let result: CodeGenResult;
    // v1.4.18 T8：UnoCSS attributify 模式透传（仅 unocss 时有意义，其他格式渲染器忽略该参数）
    const unocssMode: 'wind' | 'attributify' = unocssAttributify ? 'attributify' : 'wind';

    if (framework === 'vue') {
      const vueResult = await vueGen.generateFromContext(ctx, {
        componentName,
        sceneName,
        usePublicCdn: true,
        bundler: effectiveBundler,
        styleFormat,
        unocssMode,
        skipEnhancements,
        inference,
        // v1.4.19 T18：Vue 一级工具可选 Vue2 Options API；jsx 工具固定补 3
        vueVersion,
      });
      result = vueResult as unknown as CodeGenResult;
    } else {
      result = (await codeGen.generateJsxFromContext(ctx, {
        componentName,
        sceneName,
        usePublicCdn: true,
        bundler: effectiveBundler,
        styleFormat,
        unocssMode,
        skipEnhancements,
        inference,
      })) as unknown as CodeGenResult;
    }

    const lines: string[] = [];

    // 陈旧缓存降级警告（最优先展示）
    if (ctx.warnings && ctx.warnings.length > 0) {
      for (const w of ctx.warnings) {
        lines.push(`> ⚠️ ${w}\n`);
      }
    }

    // v1.4.19 T18：Vue 工具按 vueVersion 标注产物形态
    const frameworkLabel =
      framework === 'vue'
        ? vueVersion === 2
          ? 'Vue 2 SFC (Options API)'
          : 'Vue 3 SFC (<script setup>)'
        : 'React TSX';
    lines.push(`# ${result.componentName} - ${frameworkLabel} 代码 (${styleFormat})\n`);
    lines.push(`- **数据来源**: ${ctx.dataSource === 'stale-cache' ? '陈旧缓存（可能非最新）' : '实时请求'}\n`);

    if (libDetection.library !== 'none' && componentMatches.length > 0) {
      lines.push(`## 🧩 检测到组件库: ${libDetection.library}\n`);
      lines.push(`匹配到 ${componentMatches.length} 个可复用组件：\n`);
      componentMatches.slice(0, 5).forEach((m) => {
        lines.push(
          `- **${m.componentName}** (置信度 ${Math.round(m.confidence * 100)}%) → import from \`${m.importPath}\``,
        );
      });
      lines.push('');
    }

    if (lintReport && (lintReport.errorCount > 0 || lintReport.warningCount > 3)) {
      lines.push(`## ⚠️ 设计规范提示\n`);
      const scoreEmoji =
        lintReport.score >= 90 ? '🎉' : lintReport.score >= 80 ? '✅' : lintReport.score >= 60 ? '🔶' : '❌';
      lines.push(
        `${scoreEmoji} 当前设计规范评分: **${lintReport.score}/100**，发现 ${lintReport.errorCount} 个错误、${lintReport.warningCount} 个警告`,
      );
      if (lintReport.score < 80) {
        lines.push('');
        lines.push('💡 建议先修复设计规范问题再生成代码，可以获得更高质量的还原结果。');
        lines.push(`   可调用 \`figma_lint_design\` 工具查看详细报告。`);
      }
      lines.push('');
    }

    // v1.2.0 新增：显示增强报告
    if (result.reports && !skipEnhancements) {
      const reports = result.reports;
      const flexFixes = reports.flexFixes;
      if (flexFixes && (flexFixes.fixedCount ?? flexFixes.totalFixedNodes ?? 0) > 0) {
        const flexCount = flexFixes.fixedCount ?? flexFixes.totalFixedNodes ?? 0;
        lines.push(`## 🔧 Flex 布局修复 (${flexCount} 处)\n`);
        ((flexFixes.fixes as readonly FlexFixEntry[]) || []).slice(0, 10).forEach((fix) => {
          lines.push(`- 节点 \`${fix.nodeName}\`: 添加了 ${fix.addedClasses.join(', ')}`);
        });
        lines.push('');
      }
      const a11yReport = reports.a11y;
      if (a11yReport) {
        const a11yCount =
          a11yReport.enhancementsCount ??
          (a11yReport.semanticTagsCount || 0) +
            (a11yReport.buttonsIdentifiedCount || 0) +
            (a11yReport.ariaAddedCount || 0);
        if (a11yCount > 0) {
          lines.push(`## ♿ 无障碍增强 (${a11yCount} 处)\n`);
          (a11yReport.report as readonly A11yReportEntry[]).slice(0, 10).forEach((enh) => {
            lines.push(`- 节点 \`${enh.nodeName}\`: ${enh.enhancement}`);
          });
          lines.push('');
        }
      }
      const dsReport = reports.designSystem;
      if (dsReport) {
        const dsCount =
          dsReport.suggestionsCount ??
          (dsReport.colorSuggestions?.length || 0) +
            (dsReport.spacingTokens?.length || 0) +
            (dsReport.radiusTokens?.length || 0) +
            (dsReport.typographySuggestions?.length || 0);
        if (dsCount > 0) {
          lines.push(`## 🎨 设计系统建议 (${dsCount} 条)\n`);
          ((dsReport.suggestions as readonly DesignSystemSuggestion[]) || []).slice(0, 10).forEach((sug) => {
            lines.push(`- ${sug.message}`);
          });
          lines.push('');
        }
      }
      const respReport = reports.responsive;
      if (respReport) {
        const respCount =
          respReport.suggestionsCount ??
          (respReport.recommendations?.length || 0) +
            (respReport.classSuggestions?.length || 0) +
            (respReport.layoutSuggestions?.length || 0);
        if (respCount > 0) {
          lines.push(`## 📱 响应式建议 (${respCount} 条)\n`);
          ((respReport.suggestions as readonly ResponsiveSuggestion[]) || []).slice(0, 10).forEach((sug) => {
            lines.push(`- ${sug.message}`);
          });
          lines.push('');
        }
      }
      // v1.4.19 T21：智能推断（布局/图标/主题/动效；仅建议，不改写显式样式）
      const smartReport = reports.smartInference;
      if (smartReport && smartReport.suggestions.length > 0) {
        const smartCount = smartReport.suggestions.length;
        lines.push(`## 🧠 智能推断建议 (${smartCount} 条，v1.4.19 仅建议)\n`);
        smartReport.suggestions.slice(0, 12).forEach((sug) => {
          const utility = sug.utilityClass ? ` → \`${sug.utilityClass}\`` : '';
          lines.push(`- [${sug.category}] \`${sug.nodeName}\`: ${sug.message}${utility}`);
        });
        if (smartReport.suggestions.length > 12) {
          lines.push(`- ……另有 ${smartReport.suggestions.length - 12} 条见 structuredContent.reports.smartInference`);
        }
        lines.push('');
      }
      // v1.4.19 T22：语义推断（列表数据化示例 + 语义命名；仅建议，不自动改写）
      const semanticReport = reports.semantic;
      if (semanticReport && semanticReport.dataStructures.length > 0) {
        lines.push(`## 📐 列表数据化建议 (${semanticReport.dataStructures.length} 组，v1.4.19 仅示例)\n`);
        lines.push('> 以下为数据驱动重构示例（TS 接口 + mock + 渲染），工具不会改写已生成代码，请按需手动落地。\n');
        semanticReport.dataStructures.slice(0, 2).forEach((structure) => {
          lines.push(`### \`${structure.nodeName}\`：${structure.repeatedCount} 个重复子项 → ${structure.interfaceName}\n`);
          lines.push('```ts');
          lines.push(structure.interfaceCode);
          lines.push('');
          lines.push(structure.mockCode);
          lines.push('```');
          lines.push(framework === 'vue' ? '```vue' : '```tsx');
          lines.push(structure.renderHint);
          lines.push('```\n');
        });
        if (semanticReport.dataStructures.length > 2) {
          lines.push(`- ……另有 ${semanticReport.dataStructures.length - 2} 组见 structuredContent.reports.semantic.dataStructures`);
          lines.push('');
        }
      }
      if (semanticReport && semanticReport.nameSuggestions.length > 0) {
        lines.push(`## 🏷️ 语义命名建议 (${semanticReport.nameSuggestions.length} 条，v1.4.19 仅建议)\n`);
        semanticReport.nameSuggestions.slice(0, 12).forEach((suggestion) => {
          lines.push(`- \`${suggestion.nodeName}\` → **${suggestion.suggestedName}**（${suggestion.reason}）`);
        });
        if (semanticReport.nameSuggestions.length > 12) {
          lines.push(`- ……另有 ${semanticReport.nameSuggestions.length - 12} 条见 structuredContent.reports.semantic.nameSuggestions`);
        }
        lines.push('');
      }
    }

    lines.push(framework === 'vue' ? '```vue' : '```tsx');
    lines.push(result.code);
    lines.push('```\n');

    // v1.4.18 T8：UnoCSS 配置指引（仅建议文本，不写用户项目文件；attributify 模式额外附 TS shim）
    if (styleFormat === 'unocss' && result.styleHints && result.styleHints.length > 0) {
      lines.push(`## 🎛️ UnoCSS 配置指引（${unocssMode} 模式）\n`);
      lines.push('> 以下为配置建议，工具不会修改你的项目文件，请按需手动落地。\n');
      for (const hint of result.styleHints) {
        lines.push(`### ${hint.title}\n`);
        lines.push('```ts');
        lines.push(hint.code);
        lines.push('```\n');
      }
    }

    // v1.4.18 T9 / v1.4.19 T16：同名样式旁路文件（CSS Modules / Less / Sass；工具只输出内容，不直接写项目目录）
    if (result.styleSidecar) {
      // 代码块语言：css/less/scss（vanilla-extract 的 .css.ts 仅 React 管线产出）
      const sidecarFenceLang =
        result.styleSidecar.lang === 'less' || result.styleSidecar.lang === 'scss'
          ? result.styleSidecar.lang
          : 'css';
      lines.push(`## 📎 同名旁路样式文件：${result.styleSidecar.fileName}\n`);
      lines.push(
        `> 请将以下内容保存为与组件同目录的 \`${result.styleSidecar.fileName}\`；组件代码已按 ${
          framework === 'vue' ? '$style.x' : 'styles.x'
        } 引用。\n`,
      );
      lines.push(`\`\`\`${sidecarFenceLang}`);
      lines.push(result.styleSidecar.content);
      lines.push('```\n');
    }

    if ((result.extensionsNeeded || []).length > 0) {
      lines.push('## ⚠️ 需要 @theme 扩展的 token\n');
      const grouped = new Map<string, Array<{ name: string; value: string }>>();
      for (const ext of result.extensionsNeeded as readonly TailwindExtension[]) {
        if (!grouped.has(ext.type)) grouped.set(ext.type, []);
        grouped.get(ext.type)!.push({ name: ext.suggestedName, value: ext.originalValue });
      }
      for (const [type, items] of grouped) {
        lines.push(`**${type}:**`);
        const uniqueItems = items.filter((v, i, a) => a.findIndex((x) => x.value === v.value) === i);
        uniqueItems.slice(0, 10).forEach((it) => {
          lines.push(`- @theme inline { --color-${it.name}: ${it.value}; } /* ${it.value} */`);
        });
        lines.push('');
      }
    }

    if ((result.pendingAssets || []).length > 0) {
      lines.push('## 🖼️ 需要下载的资源\n');
      lines.push('调用 `figma_download_assets` 下载以下资源：\n');
      const uniqueAssets = result.pendingAssets.filter((v, i, a) => a.findIndex((x) => x.nodeId === v.nodeId) === i);
      uniqueAssets.forEach((a) => {
        lines.push(`- nodeId: \`${a.nodeId}\` | 名称: ${a.name} | 类型: ${a.type}`);
      });
      lines.push('');
    }

    const reusableComponents = ctx.componentsUsed.filter((c) => c.instanceCount > 0);
    if (reusableComponents.length > 0) {
      lines.push('## 🧩 复用组件（检查 web-official）\n');
      reusableComponents.forEach((c) => {
        lines.push(`- ${c.name} (使用 ${c.instanceCount} 次) → 检查 @/components/web-official/ 是否已有`);
      });
      lines.push('');
    }

    // 代码生成阶段产生的样式映射警告（与 ctx.warnings 去重后展示）
    const ctxWarningsSet = new Set(ctx.warnings ?? []);
    const codeGenWarnings = (result.warnings ?? []).filter((w) => !ctxWarningsSet.has(w));
    if (codeGenWarnings.length > 0) {
      lines.push('## ⚠️ 样式还原警告\n');
      codeGenWarnings.slice(0, 15).forEach((w) => {
        lines.push(`- ${w}`);
      });
      if (codeGenWarnings.length > 15) {
        lines.push(`- ...还有 ${codeGenWarnings.length - 15} 条警告（详见 structuredContent.warnings）`);
      }
      lines.push('');
    }

    lines.push('## 📋 节点层级精简统计\n');
    lines.push(`- 精简后节点树深度：${maxDepth}`);
    lines.push(`- 节点数量：${countNodes(ctx.node)}`);
    lines.push(`- 图片/图标资源：${ctx.assets.length}`);
    lines.push(`- 文本节点：${ctx.textNodes.length}`);
    lines.push(`- 阴影效果：${ctx.shadows.length}`);

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
      structuredContent: {
        componentName: result.componentName,
        framework,
        vueVersion: framework === 'vue' ? vueVersion : undefined,
        code: result.code,
        reports: result.reports,
        extensionsNeeded: result.extensionsNeeded,
        pendingAssets: result.pendingAssets,
        warnings: result.warnings ?? [],
        reusableComponents,
        lintScore: lintReport?.score,
        dataSource: ctx.dataSource ?? 'live',
        stats: {
          assetCount: ctx.assets.length,
          textCount: ctx.textNodes.length,
          shadowCount: ctx.shadows.length,
          colorsUsed: ctx.colors.length,
        },
      },
    };
  } catch (error) {
    return buildToolErrorResponse(
      framework === 'vue' ? '生成 Vue 组件' : '生成 JSX',
      error,
      getFigmaClientSafe(accessToken),
    );
  }
}

server.registerTool(
  'figma_get_structured_data',
  {
    title: '获取框架无关结构化数据',
    description: `从 design context 转换为框架无关的描述性 JSON 结构，包含每个节点的 id/name/role/type/size/layout/styles/text/asset/children 信息。
不输出 React 代码，适用于 Vue、Svelte、HTML、Angular、Solid 等任意框架的代码生成。
v1.2.0 增强：输出包含语义标签建议、a11y 属性建议、设计系统 token 映射信息。
输出结构包含完整的精简节点树，可直接遍历渲染任意框架组件。`,
    inputSchema: z.object({
      fileKey: z.string().describe('Figma 文件 Key'),
      nodeId: z.string().describe('节点 ID（必需）'),
      figmaUrl: z.string().optional().describe('Figma URL（自动解析 fileKey/nodeId）'),
      maxDepth: z.number().min(1).max(30).default(15).describe('最大节点树深度（默认15）'),
      accessToken: z.string().optional().describe('Figma Access Token'),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ fileKey, nodeId, figmaUrl, maxDepth, accessToken }) => {
    try {
      const key = figmaUrl ? extractFileKey(figmaUrl) || fileKey : fileKey;
      const nId = figmaUrl ? extractNodeId(figmaUrl) || nodeId : nodeId;
      if (!key || !nId) return { content: [{ type: 'text', text: '请提供 fileKey 和 nodeId' }], isError: true };

      const client = getFigmaClient(accessToken);
      const ctxService = createDesignContextService(client);
      const context = await ctxService.getDesignContext(key, nId, maxDepth);

      let preview = `# 框架无关结构化数据: ${context.node.name}\n\n`;
      preview += `- **语义角色**: ${context.node.role}\n`;
      preview += `- **节点类型**: ${context.node.originalType}\n`;
      preview += `- **尺寸**: ${context.node.size ? Math.round(context.node.size.width) + '×' + Math.round(context.node.size.height) : 'N/A'}\n`;
      preview += `- **总节点数**: ${countNodes(context.node)}\n`;
      preview += `- **颜色数**: ${context.colors.length}\n`;
      preview += `- **资源数**: ${context.assets.length}\n`;
      preview += `- **文本节点**: ${context.textNodes.length}\n\n`;
      preview += `> v1.2.0: 结构化数据包含语义标签建议、a11y 属性、设计 token 映射。\n\n`;
      preview += `> 完整结构化节点树（含 id/name/role/type/size/layout/styles/text/asset/children）已在 structuredContent 中，可用于任意框架代码生成。\n`;

      return {
        content: [{ type: 'text', text: preview }],
        structuredContent: toStructuredNode(context.node),
      };
    } catch (error) {
      return buildToolErrorResponse('获取结构化数据', error, getFigmaClientSafe(accessToken));
    }
  },
);

function toStructuredNode(node: ProcessedNode): StructuredNode {
  const result: StructuredNode = {
    id: node.id,
    name: node.name,
    type: node.originalType,
    role: node.role,
    visible: node.visible,
    figmaId: node.figmaId,
    clipsContent: node.clipsContent,
  };
  if (node.opacity !== undefined) result.opacity = node.opacity;
  if (node.rotation !== undefined) result.rotation = node.rotation;
  if (node.size) result.size = node.size;
  if (node.position) result.position = node.position;
  if (node.absolutePosition) result.absolutePosition = node.absolutePosition;
  if (node.layout) result.layout = node.layout;
  if (node.alignSelf) result.alignSelf = node.alignSelf;
  if (node.flexGrow !== undefined) result.flexGrow = node.flexGrow;
  if (node.fills) result.fills = node.fills;
  if (node.strokes) result.strokes = node.strokes;
  if (node.cornerRadius) result.cornerRadius = node.cornerRadius;
  if (node.effects) result.effects = node.effects;
  if (node.textContent) result.textContent = node.textContent;
  if (node.textStyle) result.textStyle = node.textStyle;
  if (node.componentId) result.componentId = node.componentId;
  if (node.componentKey) result.componentKey = node.componentKey;
  if (node.componentName) result.componentName = node.componentName;
  if (node.asset) result.asset = node.asset;
  if (node.children && node.children.length > 0) {
    result.children = node.children.map(toStructuredNode);
  }
  return result;
}

function countNodes(node: { children?: unknown[] }): number {
  let count = 1;
  if (node.children) {
    for (const child of node.children as Array<{ children?: unknown[] }>) {
      count += countNodes(child);
    }
  }
  return count;
}

// ============ v1.4.4 付费墙兜底与还原度校验工具 ============

/**
 * figma_dev_fallback_status - 查询兜底系统状态
 *
 * 当 Figma REST API 因付费墙（PAYMENT_REQUIRED）失败时，工具会按以下优先级兜底：
 * 1. 本地陈旧缓存（7 天内）
 * 2. Playwright 无头浏览器截图 + Dev Mode CSS 抓取
 * 3. 视觉近似模式（截图打包 + 近似代码骨架 + TODO 清单）
 *
 * 此工具查询当前兜底系统的可用性状态，无需 Figma URL。
 */
server.registerTool(
  'figma_dev_fallback_status',
  {
    title: '查询付费墙兜底系统状态',
    description: `查询当前付费墙兜底系统的可用性状态，包括：
- Playwright 浏览器引擎是否已安装
- 当前兜底配置（浏览器类型、DPR、无头模式等）
- 兜底优先级说明（陈旧缓存 → 浏览器截图 → 视觉近似模式）

无需 Figma URL，仅查询本地环境能力。`,
    inputSchema: z.object({}),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => {
    try {
      const fallbackService = getBrowserFallbackService();
      const availability = await fallbackService.checkAvailability();
      const options = fallbackService.getOptions();

      const result = {
        playwright: {
          available: availability.available,
          reason: availability.reason ?? null,
          installHint: availability.installHint ?? null,
        },
        config: {
          enabled: options.enabled,
          browser: options.browser,
          headless: options.headless,
          timeout: options.timeout,
          devicePixelRatio:
            options.devicePixelRatio === 0 ? 'auto-detect' : options.devicePixelRatio,
          captureDevModeCss: options.captureDevModeCss,
          focusNode: options.focusNode,
        },
        fallbackPriority: [
          '1. 本地陈旧缓存（7 天内，AES-256-GCM 加密）',
          '2. Playwright 无头浏览器截图 + Dev Mode CSS 抓取',
          '3. 视觉近似模式（截图打包 + 近似代码骨架 + TODO 清单，预期还原度 ~70-80%）',
        ],
        expectedFidelity: {
          normal: '95-100%',
          staleCache: '85-95%（陈旧数据，可能非最新设计）',
          browserFallback: '70-80%（仅截图，无节点树）',
        },
      };

      const statusIcon = availability.available ? '✅' : '❌';
      const lines = [
        `# 付费墙兜底系统状态\n`,
        `## Playwright 浏览器引擎\n`,
        `${statusIcon} 可用: ${availability.available}`,
      ];

      if (!availability.available) {
        lines.push(`原因: ${availability.reason}`);
        lines.push(`安装建议: ${availability.installHint}`);
      }

      lines.push(`\n## 当前配置\n`);
      lines.push(`- 启用: ${options.enabled}`);
      lines.push(`- 浏览器: ${options.browser}`);
      lines.push(`- 无头模式: ${options.headless}`);
      lines.push(`- 超时: ${options.timeout}ms`);
      lines.push(
        `- DPR: ${options.devicePixelRatio === 0 ? '自动探测' : options.devicePixelRatio + 'x'}`,
      );
      lines.push(`- 抓取 Dev Mode CSS: ${options.captureDevModeCss}`);
      lines.push(`- 定位 node 元素: ${options.focusNode}\n`);

      lines.push(`## 兜底优先级\n`);
      result.fallbackPriority.forEach((p) => lines.push(`- ${p}`));

      lines.push(`\n## 预期还原度\n`);
      lines.push(`- 正常模式: ${result.expectedFidelity.normal}`);
      lines.push(`- 陈旧缓存: ${result.expectedFidelity.staleCache}`);
      lines.push(`- 浏览器兜底: ${result.expectedFidelity.browserFallback}`);

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
        structuredContent: result,
      };
    } catch (error) {
      return buildToolErrorResponse('查询兜底系统状态', error);
    }
  },
);

/**
 * figma_dev_fallback_capture - 触发浏览器兜底截图
 *
 * 当用户已知 Figma 付费墙阻断时，可主动调用此工具触发浏览器兜底：
 * 1. 启动 Playwright 无头浏览器
 * 2. 注入 Token Cookie 加载设计稿页面
 * 3. 按 node-id 定位并截图
 * 4. 抓取 Dev Mode CSS（如可访问）
 * 5. 进入视觉近似模式生成代码骨架 + TODO 清单
 */
server.registerTool(
  'figma_dev_fallback_capture',
  {
    title: '触发浏览器兜底截图（付费墙兜底）',
    description: `当 Figma REST API 因付费墙失败时，主动触发浏览器兜底：
1. 启动 Playwright 无头浏览器加载 Figma 设计稿页面
2. 注入 Figma Access Token 为 Cookie 实现登录态
3. 按 node-id 定位到指定画板并截图
4. 尝试抓取 Dev Mode 侧栏的 CSS 属性
5. 进入视觉近似模式：生成近似代码骨架 + TODO 清单（预期还原度 ~70-80%）

注意：需要先安装 Playwright（npm install playwright && npx playwright install chromium）。
截图仅为保底方案，无法精确还原节点树，部分细节需人工校对。`,
    inputSchema: z.object({
      figmaUrl: z
        .string()
        .describe('Figma 设计稿 URL（含 node-id 参数，如 https://www.figma.com/design/xxx?node-id=14-7721）'),
      accessToken: z
        .string()
        .optional()
        .describe('Figma Access Token（可选，优先使用环境变量 FIGMA_ACCESS_TOKEN）'),
      devicePixelRatio: z
        .number()
        .min(0)
        .max(4)
        .optional()
        .describe(
          '截图 devicePixelRatio，0=自动探测（默认），1/2/3=强制指定倍率',
        ),
      framework: z
        .enum(['react', 'vue', 'html'])
        .optional()
        .describe('近似代码骨架的目标框架，默认 react'),
      inlineScreenshot: z
        .boolean()
        .optional()
        .describe('是否将截图转为 base64 内联到结果中（便于直接回传），默认 false'),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ figmaUrl, accessToken, devicePixelRatio, framework, inlineScreenshot }) => {
    try {
      const token =
        accessToken || process.env.FIGMA_ACCESS_TOKEN || process.env.FIGMA_OAUTH_TOKEN;
      if (!token) {
        return {
          content: [
            {
              type: 'text',
              text: '❌ 浏览器兜底需要 Figma Access Token。请设置 FIGMA_ACCESS_TOKEN 环境变量或传入 token 参数。',
            },
          ],
          isError: true,
        };
      }

      const fallbackService = new BrowserFallbackService(
        devicePixelRatio === undefined ? {} : { devicePixelRatio },
      );

      // 执行浏览器兜底截图
      const fallbackResult: BrowserFallbackResult = await fallbackService.captureScreenshot(
        figmaUrl,
        token,
      );

      // 进入视觉近似模式
      const approximationService = getVisualApproximationService({
        framework: framework ?? 'react',
        inlineScreenshot: inlineScreenshot ?? false,
      });
      const approximationResult: VisualApproximationResult =
        await approximationService.generateApproximation(fallbackResult);

      const lines = [
        `# 浏览器兜底截图完成（视觉近似模式）\n`,
        `> ${approximationResult.banner}\n`,
        `## 截图信息`,
        `- 截图路径: ${approximationResult.screenshotPath}`,
        `- 尺寸: ${approximationResult.width}x${approximationResult.height}px`,
        `- DPR: ${approximationResult.devicePixelRatio}x`,
        `- 操作系统: ${approximationResult.os}`,
        `- 节点定位: ${fallbackResult.nodeFocused ? '✅ 成功' : '❌ 回退整页'}`,
        `- 预期还原度: ~${approximationResult.expectedFidelity}%\n`,
      ];

      if (approximationResult.devModeCss) {
        lines.push(`## Dev Mode CSS（参考）`);
        lines.push('```css');
        lines.push(approximationResult.devModeCss);
        lines.push('```\n');
      }

      if (approximationResult.skeletonPath) {
        lines.push(`## 近似代码骨架`);
        lines.push(`- 文件路径: ${approximationResult.skeletonPath}\n`);
      }

      if (approximationResult.todoPath) {
        lines.push(`## TODO 清单`);
        lines.push(`- 文件路径: ${approximationResult.todoPath}\n`);
      }

      if (approximationResult.warnings.length > 0) {
        lines.push(`## 警告信息`);
        approximationResult.warnings.forEach((w) => lines.push(`- ⚠️ ${w}`));
        lines.push('');
      }

      lines.push(`## TODO 清单内容`);
      lines.push(approximationResult.todoMarkdown);

      const structured = {
        screenshotPath: approximationResult.screenshotPath,
        skeletonPath: approximationResult.skeletonPath ?? null,
        todoPath: approximationResult.todoPath ?? null,
        width: approximationResult.width,
        height: approximationResult.height,
        devicePixelRatio: approximationResult.devicePixelRatio,
        os: approximationResult.os,
        nodeFocused: fallbackResult.nodeFocused,
        devModeCss: approximationResult.devModeCss ?? null,
        expectedFidelity: approximationResult.expectedFidelity,
        warnings: approximationResult.warnings,
        capturedAt: approximationResult.capturedAt,
      };

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
        structuredContent: structured,
      };
    } catch (error) {
      return buildToolErrorResponse('浏览器兜底截图', error);
    }
  },
);

/**
 * figma_verify_fidelity - 还原度校验工具
 *
 * 将 Figma 设计稿截图与生成代码的渲染截图进行像素级 diff，
 * 输出量化还原度评分（0-100%）+ 差异热力图。
 *
 * 工作流程：
 * 1. 获取 Figma 截图（通过 getImages API URL 或本地文件路径）
 * 2. 使用 Playwright 渲染生成代码并截图
 * 3. 使用 pixelmatch 进行像素 diff
 * 4. 输出还原度评分 + 差异热力图 + 等级描述
 */
server.registerTool(
  'figma_verify_fidelity',
  {
    title: '还原度校验（像素 diff）',
    description: `将 Figma 设计稿截图与生成代码的渲染截图进行像素级 diff，输出量化还原度评分。

工作流程：
1. 获取 Figma 节点截图（通过 figmaUrl 调用 Figma Images API，或传入本地截图路径）
2. 使用 Playwright 渲染生成代码并截图（支持 HTML 字符串或 HTML 文件路径）
3. 使用 pixelmatch 进行像素 diff（业界标准像素 diff 库，16k+ stars）
4. 输出还原度评分（0-100%）、差异像素数、差异热力图

还原度等级：
- excellent（95-100%）：几乎完全一致
- good（85-94%）：还原良好，少量细节差异
- acceptable（70-84%）：可接受，部分区域需校对
- poor（<70%）：差异较大，需重新校对

依赖：pixelmatch + pngjs + playwright（均为可选依赖，未安装时给出安装提示）`,
    inputSchema: z.object({
      figmaUrl: z
        .string()
        .optional()
        .describe(
          'Figma 设计稿 URL（如提供，自动调用 Figma Images API 获取截图）。与 figmaScreenshotPath 二选一',
        ),
      figmaScreenshotPath: z
        .string()
        .optional()
        .describe('Figma 截图本地文件路径（如已有截图，直接读取）。与 figmaUrl 二选一'),
      codeContent: z
        .string()
        .describe('生成代码内容（HTML 字符串 或 HTML 文件路径）'),
      codeSourceType: z
        .enum(['html-string', 'file-path'])
        .default('html-string')
        .describe('代码来源类型：html-string=直接传 HTML 字符串，file-path=传 HTML 文件路径'),
      threshold: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe('颜色差异阈值（0-1），默认 0.1。值越小越严格'),
      devicePixelRatio: z
        .number()
        .min(1)
        .max(4)
        .optional()
        .describe('代码截图的 devicePixelRatio，默认 2'),
      viewportWidth: z
        .number()
        .min(1)
        .max(8192)
        .optional()
        .describe('代码截图的视口宽度（像素），默认用 Figma 截图宽度'),
      viewportHeight: z
        .number()
        .min(1)
        .max(8192)
        .optional()
        .describe('代码截图的视口高度（像素），默认用 Figma 截图高度'),
      outputDir: z
        .string()
        .optional()
        .describe('差异热力图与截图缓存输出目录，默认系统临时目录'),
      accessToken: z
        .string()
        .optional()
        .describe('Figma Access Token（可选，优先使用环境变量）'),
      figmaScale: z
        .number()
        .min(1)
        .max(4)
        .default(2)
        .describe('Figma 截图缩放比例（1-4），默认 2。仅当使用 figmaUrl 时生效'),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({
    figmaUrl,
    figmaScreenshotPath,
    codeContent,
    codeSourceType,
    threshold,
    devicePixelRatio,
    viewportWidth,
    viewportHeight,
    outputDir,
    accessToken,
    figmaScale,
  }) => {
    try {
      // ============ 1. 确定 Figma 截图来源 ============
      let figmaScreenshotSource: string;

      if (figmaScreenshotPath) {
        // 直接使用本地截图路径
        figmaScreenshotSource = figmaScreenshotPath;
      } else if (figmaUrl) {
        // 通过 Figma Images API 获取截图 URL
        const key = extractFileKey(figmaUrl);
        const nId = extractNodeId(figmaUrl);
        if (!key || !nId) {
          return {
            content: [
              {
                type: 'text',
                text: '❌ 无法从 figmaUrl 解析 fileKey 或 nodeId，请确认 URL 格式正确，或改用 figmaScreenshotPath 参数。',
              },
            ],
            isError: true,
          };
        }

        const client = getFigmaClient(accessToken);
        const imageResult = await client.getImages(key, [nId], 'png', figmaScale);
        const imageUrl = imageResult.images[nId];
        if (!imageUrl) {
          return {
            content: [
              {
                type: 'text',
                text: '❌ 获取 Figma 截图失败，节点可能不存在或无法导出。建议先用 figma_get_screenshot 工具获取截图后传入 figmaScreenshotPath。',
              },
            ],
            isError: true,
          };
        }
        figmaScreenshotSource = imageUrl;
      } else {
        return {
          content: [
            {
              type: 'text',
              text: '❌ 必须提供 figmaUrl 或 figmaScreenshotPath 之一作为 Figma 截图来源。',
            },
          ],
          isError: true,
        };
      }

      // ============ 2. 配置并执行还原度校验 ============
      const optionsToUpdate: Partial<FidelityVerifyOptions> = {};
      if (threshold !== undefined) optionsToUpdate.threshold = threshold;
      if (devicePixelRatio !== undefined) optionsToUpdate.devicePixelRatio = devicePixelRatio;
      if (viewportWidth !== undefined) optionsToUpdate.viewportWidth = viewportWidth;
      if (viewportHeight !== undefined) optionsToUpdate.viewportHeight = viewportHeight;
      if (outputDir !== undefined) optionsToUpdate.outputDir = outputDir;
      const verifyService = new FidelityVerifyService(optionsToUpdate);

      // 先检查依赖可用性
      const deps = await verifyService.checkDependencies();
      if (!deps.available) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ 还原度校验依赖缺失: ${deps.missingDependencies.join(', ')}\n\n安装建议: ${deps.installHint}`,
            },
          ],
          isError: true,
        };
      }

      const result: FidelityVerifyResult = await verifyService.verifyFidelity(
        figmaScreenshotSource,
        codeContent,
        codeSourceType,
      );

      // ============ 3. 构造输出 ============
      const gradeIcon: Record<string, string> = {
        excellent: '🟢',
        good: '🟡',
        acceptable: '🟠',
        poor: '🔴',
      };

      const lines = [
        `# 还原度校验结果\n`,
        `## 评分`,
        `${gradeIcon[result.grade] ?? '⚪'} 还原度: ${result.fidelityScore}% (${result.grade})`,
        `${result.gradeDescription}\n`,
        `## 像素 diff 统计`,
        `- 差异像素: ${result.diffPixels.toLocaleString()} / ${result.totalPixels.toLocaleString()}`,
        `- 差异占比: ${(result.diffRatio * 100).toFixed(2)}%\n`,
        `## 截图信息`,
        `- Figma 截图: ${result.figmaWidth}x${result.figmaHeight}px`,
        `- 代码截图: ${result.codeWidth}x${result.codeHeight}px`,
        `- Figma 截图缓存: ${result.figmaScreenshotPath}`,
        `- 代码截图缓存: ${result.codeScreenshotPath}\n`,
      ];

      if (result.diffImagePath) {
        lines.push(`## 差异热力图`);
        lines.push(`- 文件路径: ${result.diffImagePath}`);
        lines.push(`- 红色区域为差异像素\n`);
      }

      if (result.warnings.length > 0) {
        lines.push(`## 警告信息`);
        result.warnings.forEach((w) => lines.push(`- ⚠️ ${w}`));
        lines.push('');
      }

      // 还原度建议
      lines.push(`## 改进建议`);
      if (result.grade === 'excellent') {
        lines.push('- 还原度优秀，无需额外校对');
      } else if (result.grade === 'good') {
        lines.push('- 检查差异热力图中的红色区域，校对少量细节');
      } else if (result.grade === 'acceptable') {
        lines.push('- 重点检查差异热力图中的红色区域，校对字体/颜色/间距');
        lines.push('- 建议用 figma_get_design_context 重新获取精确节点信息');
      } else {
        lines.push('- 还原度较差，建议重新生成代码');
        lines.push('- 检查是否使用了正确的 node-id');
        lines.push('- 确认 Figma 设计稿中的自动布局设置是否完整');
      }

      const structured = {
        fidelityScore: result.fidelityScore,
        grade: result.grade,
        gradeDescription: result.gradeDescription,
        diffPixels: result.diffPixels,
        totalPixels: result.totalPixels,
        diffRatio: result.diffRatio,
        figmaWidth: result.figmaWidth,
        figmaHeight: result.figmaHeight,
        codeWidth: result.codeWidth,
        codeHeight: result.codeHeight,
        diffImagePath: result.diffImagePath ?? null,
        codeScreenshotPath: result.codeScreenshotPath,
        figmaScreenshotPath: result.figmaScreenshotPath,
        warnings: result.warnings,
        verifiedAt: result.verifiedAt,
      };

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
        structuredContent: structured,
      };
    } catch (error) {
      return buildToolErrorResponse('还原度校验', error, getFigmaClientSafe(accessToken));
    }
  },
);

/**
 * figma_ocr_extract - OCR 文本提取工具
 *
 * 从 Figma 设计稿或本地图片中提取文字，采用「原生优先、OCR 兜底」的混合策略：
 * 1. 提供 figmaUrl 时，优先读取节点 JSON 原生提取 TEXT 节点文字（零依赖、100% 准确）
 * 2. 无节点 JSON 或原生无结果时，使用 tesseract.js 对图片进行 OCR 识别
 *
 * 使用场景：
 * - 从设计稿提取文案，用于国际化、文案校对、SEO 关键词提取
 * - 从设计稿截图/切图中提取文字（无节点 JSON 时）
 */
server.registerTool(
  'figma_ocr_extract',
  {
    title: 'OCR 文本提取',
    description: `从 Figma 设计稿或图片中提取文字。

混合策略：
1. 原生优先：提供 figmaUrl 时，读取节点 JSON 并直接遍历 TEXT 节点提取文字（零依赖、100% 准确）
2. 截图 OCR 兜底：原生提取无文本时，自动调用 Figma 截图接口下载节点图片做 OCR 识别
3. 图片 OCR：提供 imagePath 时，使用 tesseract.js 对图片进行光学字符识别

参数：
- figmaUrl：Figma 设计稿链接（与 imagePath 至少提供一个）
- imagePath：图片来源（本地文件路径 / 远程 http(s) URL / base64 data URI），与 figmaUrl 至少提供一个
- language：OCR 语言代码（tesseract 格式，可用 '+' 组合，如 'chi_sim+eng'），默认 'chi_sim+eng'
- psm：页面分割模式（1-13，默认 3 = 自动，11 = 稀疏文本，6 = 单一文本块）
- oem：OCR 引擎模式（1 = LSTM 推荐，默认）
- autoScreenshot：原生提取无文本时是否自动截图做 OCR 兜底（默认 true，需 figmaUrl）
- screenshotScale：自动截图缩放比例（1-4，默认 2）
- accessToken：Figma Access Token（可选，优先使用环境变量）

依赖：tesseract.js（可选依赖，仅在图片 OCR 时需要，未安装时给出安装提示）`,
    inputSchema: z.object({
      figmaUrl: z
        .string()
        .optional()
        .describe('Figma 设计稿 URL（如提供，优先读取节点 JSON 原生提取文字）。与 imagePath 至少提供一个'),
      imagePath: z
        .string()
        .optional()
        .describe('图片来源：本地文件路径、远程 http(s) URL、或 base64 data URI（用于 tesseract OCR 识别）。与 figmaUrl 至少提供一个'),
      language: z
        .string()
        .optional()
        .describe("OCR 语言代码（tesseract 格式，可用 '+' 组合，如 'chi_sim+eng'），默认 'chi_sim+eng'"),
      psm: z
        .number()
        .int()
        .min(1)
        .max(13)
        .optional()
        .describe('页面分割模式 PSM（1-13），默认 3 = 自动；11 = 稀疏文本；6 = 单一文本块'),
      oem: z
        .number()
        .int()
        .min(0)
        .max(3)
        .optional()
        .describe('OCR 引擎模式 OEM（0-3），默认 1 = LSTM'),
      autoScreenshot: z
        .boolean()
        .optional()
        .describe('原生提取无文本时，是否自动调用 Figma 截图接口下载节点图片做 OCR 兜底（默认 true，需提供 figmaUrl）'),
      screenshotScale: z
        .number()
        .int()
        .min(1)
        .max(4)
        .optional()
        .describe('自动截图缩放比例（1-4，默认 2）'),
      accessToken: z
        .string()
        .optional()
        .describe('Figma Access Token（可选，优先使用环境变量）'),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ figmaUrl, imagePath, language, psm, oem, autoScreenshot, screenshotScale, accessToken }) => {
    try {
      const optionsToUpdate: Partial<OcrOptions> = {};
      if (language !== undefined) optionsToUpdate.language = language;
      if (psm !== undefined) optionsToUpdate.psm = psm;
      if (oem !== undefined) optionsToUpdate.oem = oem;
      const ocrService = new OcrService(optionsToUpdate);

      // ============ 1. 确定提取输入 ============
      let figmaNode: FigmaNode | undefined;
      let imageSource: string | undefined;
      let fileKey: string | undefined;
      let nodeId: string | undefined;

      if (figmaUrl) {
        fileKey = extractFileKey(figmaUrl);
        nodeId = extractNodeId(figmaUrl);
        if (!fileKey) {
          return {
            content: [
              {
                type: 'text',
                text: '❌ 无法从 figmaUrl 解析 fileKey，请确认 URL 格式正确，或改用 imagePath 参数。',
              },
            ],
            isError: true,
          };
        }

        const client = getFigmaClient(accessToken);
        if (nodeId) {
          figmaNode = (await client.getNode(fileKey, nodeId, -1)) ?? undefined;
        } else {
          const file = await client.getFile(fileKey, undefined, -1);
          figmaNode = file.document;
        }
      }

      if (imagePath) {
        imageSource = imagePath;
      }

      if (!figmaNode && !imageSource) {
        return {
          content: [
            {
              type: 'text',
              text: '❌ 必须提供 figmaUrl 或 imagePath 之一作为 OCR 提取输入。',
            },
          ],
          isError: true,
        };
      }

      // ============ 2. 执行提取（含自动截图兜底） ============
      let result: OcrResult;

      if (figmaNode) {
        // 先尝试原生提取，无结果时若有图片则 OCR 兜底
        result = await ocrService.extractText({ figmaNode, image: imageSource });
        // 原生无文本、未提供图片、允许自动截图且能定位节点时，自动截图 OCR 兜底
        if (
          result.items.length === 0 &&
          !imageSource &&
          autoScreenshot !== false &&
          fileKey &&
          nodeId
        ) {
          try {
            const client = getFigmaClient(accessToken);
            const images = await client.getImages(fileKey, [nodeId], 'png', screenshotScale ?? 2);
            const screenshotUrl = images.images[nodeId];
            if (screenshotUrl) {
              const screenshotBuffer = await client.downloadImage(screenshotUrl);
              result = await ocrService.extractTextFromImage(screenshotBuffer);
              result.strategy = 'hybrid';
              result.warnings = [
                ...result.warnings,
                '已自动使用 Figma 截图做 OCR 兜底（原生节点 JSON 未提取到文本）',
              ];
            }
          } catch (screenshotError) {
            const message =
              screenshotError instanceof Error ? screenshotError.message : String(screenshotError);
            result.warnings = [...result.warnings, `自动截图 OCR 兜底失败: ${message}`];
          }
        }
      } else {
        result = await ocrService.extractTextFromImage(imageSource!);
      }

      // ============ 3. 构造输出 ============
      const strategyLabels: Record<string, string> = {
        native: '原生提取（节点 JSON）',
        ocr: 'OCR 识别（tesseract.js）',
        hybrid: '混合（原生无结果，回退 OCR）',
      };

      const lines = [
        `# OCR 文本提取结果\n`,
        `## 提取策略`,
        `${strategyLabels[result.strategy] ?? result.strategy}\n`,
        `## 提取文本`,
        result.text && result.text.trim().length > 0
          ? result.text
          : '（未提取到任何文本）',
        `\n## 统计信息`,
        `- 文本条目数: ${result.items.length}`,
        `- 平均置信度: ${result.confidence.toFixed(2)}%\n`,
      ];

      if (result.items.length > 0) {
        lines.push(`## 详细条目`);
        result.items.forEach((item, index) => {
          const meta =
            item.source === 'native' && item.nodeId
              ? ` (节点 ${item.nodeId}${item.nodeName ? ` - ${item.nodeName}` : ''})`
              : item.source === 'ocr'
                ? ` (置信度 ${item.confidence.toFixed(2)}%)`
                : '';
          lines.push(`${index + 1}. ${item.text.replace(/\n/g, ' ')}${meta}`);
        });
        lines.push('');
      }

      if (result.warnings.length > 0) {
        lines.push(`## 警告信息`);
        result.warnings.forEach((w) => lines.push(`- ⚠️ ${w}`));
        lines.push('');
      }

      const structured = {
        strategy: result.strategy,
        text: result.text,
        confidence: result.confidence,
        itemCount: result.items.length,
        items: result.items.map((item) => ({
          text: item.text,
          confidence: item.confidence,
          source: item.source,
          nodeId: item.nodeId ?? null,
          nodeName: item.nodeName ?? null,
          bbox: item.bbox ?? null,
        })),
        warnings: result.warnings,
        extractedAt: result.extractedAt,
      };

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
        structuredContent: structured,
      };
    } catch (error) {
      return buildToolErrorResponse('OCR 文本提取', error, getFigmaClientSafe(accessToken));
    }
  },
);

export async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Figma Dev Tools MCP Server v${readPackageVersion()} running via stdio`);
}
