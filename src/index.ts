#!/usr/bin/env node
/**
 * Figma Dev Tools MCP Server
 * 提供 Figma 设计稿与代码的桥接能力，包括：
 * - 设计 Tokens 提取
 * - 组件代码生成（含 Flex 修复、a11y 增强、设计系统对齐、响应式推断）
 * - 文件信息查询
 * - 截图获取
 * - 资源下载与 SVG Sprite 生成
 * - 设计规范检查
 *
 * @version 1.2.1
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
import { z } from 'zod';

import { createAssetDownloader, AssetDownloader } from './services/asset-downloader.js';
import { createCodeGenerator } from './services/code-generator.js';
import { createDesignContextService } from './services/design-context.js';
import { createDesignLinter } from './services/design-linter.js';
import { createFigmaClient, type FigmaClient } from './services/figma-client.js';
import { createFileWriter } from './services/file-writer.js';
import { createTokensExtractor } from './services/tokens-extractor.js';
import { generateSvgSprite, generateSpriteTypes } from './services/svg-sprite-generator.js';
import { initI18nSync } from './i18n/index.js';
import type { DesignTokens } from './types.js';
import type { ProcessedNode, StructuredNode } from './types/nodes.js';
import type { FlexFixEntry } from './services/flex-fixer.js';
import type { A11yReportEntry } from './services/a11y-enhancer.js';
import type { DesignSystemSuggestion } from './services/design-system.js';
import type { ResponsiveSuggestion } from './services/responsive-inferrer.js';
import { parseFigmaUrl, extractFileKey, extractNodeId } from './utils/figma-url.js';

dotenv.config();

// 初始化 i18n（v1.2.0 新增）
initI18nSync();

let figmaClient: FigmaClient | null = null;

function getFigmaClient(token?: string): FigmaClient {
  const accessToken = token || process.env.FIGMA_ACCESS_TOKEN || process.env.FIGMA_OAUTH_TOKEN;

  if (!accessToken) {
    throw new Error(
      'Figma Access Token 未配置。请设置 FIGMA_ACCESS_TOKEN 环境变量或在调用时传入 token 参数。\n' +
        '获取 Token: https://www.figma.com/developers/api#access-tokens',
    );
  }

  if (!figmaClient || figmaClient.getAccessToken() !== accessToken) {
    figmaClient = createFigmaClient({ accessToken });
  }

  return figmaClient;
}

const server = new McpServer({
  name: 'figma-dev-tools',
  version: '1.2.1',
});

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
      return {
        content: [
          {
            type: 'text',
            text: `解析 URL 失败: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
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
      };

      return {
        content: [
          {
            type: 'text',
            text:
              `# ${file.name}\n\n` +
              `- **最后修改**: ${file.lastModified}\n` +
              `- **版本**: ${file.version}\n` +
              `- **页面数**: ${pages.length}\n` +
              `- **组件数**: ${result.componentsCount}\n` +
              `- **组件集数**: ${result.componentSetsCount}\n` +
              `- **样式数**: ${result.stylesCount}\n\n` +
              `## 页面列表\n\n` +
              pages.map((p, i) => `${i + 1}. **${p.name}** (${p.childCount} 个子元素) - ID: \`${p.id}\``).join('\n'),
          },
        ],
        structuredContent: result,
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `获取文件信息失败: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
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
        },
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `提取 Tokens 失败: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
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
      styleFormat: z.enum(['tailwind', 'css-modules', 'inline-styles']).default('tailwind').describe('样式格式'),
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
  async ({ fileKey, nodeId, figmaUrl, componentName, typescript, styleFormat, includeChildren, skipEnhancements, accessToken }) => {
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
      return {
        content: [
          {
            type: 'text',
            text: `生成组件代码失败: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
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

      return {
        content: [
          {
            type: 'text',
            text: `# 节点截图\n\n**节点 ID**: ${nId}\n**格式**: ${format}\n**缩放**: ${scale}x\n\n![Screenshot](${imageUrl})\n\n[查看原图](${imageUrl})`,
          },
        ],
        structuredContent: {
          nodeId: nId,
          format,
          scale,
          imageUrl,
        },
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `获取截图失败: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
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
输出格式与项目的 @repo/tailwind-config 兼容。`,
    inputSchema: z.object({
      tokens: z.record(z.unknown()).describe('从 figma_extract_tokens 获取的 tokens 数据'),
      outputFormat: z.enum(['css-variables', 'tailwind-v4', 'json']).default('tailwind-v4').describe('输出格式'),
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
      const client = getFigmaClient();
      const generator = createCodeGenerator(client);

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
      return {
        content: [
          {
            type: 'text',
            text: `生成样式配置失败: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
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
文件会自动格式化并创建备份。`,
    inputSchema: z.object({
      tokens: z.record(z.unknown()).describe('设计 tokens'),
      outputDir: z.string().describe('输出目录路径（绝对路径）'),
      fileName: z.string().optional().describe('文件名（默认 figma-tokens.css）'),
      format: z.enum(['css', 'tailwind', 'json', 'all']).default('all').describe('输出格式'),
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
      return {
        content: [
          {
            type: 'text',
            text: `同步到项目失败: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
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
      return {
        content: [
          {
            type: 'text',
            text: `验证失败: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
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
      return {
        content: [{ type: 'text', text: `获取元数据失败: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
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
      return {
        content: [
          { type: 'text', text: `获取设计上下文失败: ${error instanceof Error ? error.message : String(error)}` },
        ],
        isError: true,
      };
    }
  },
);

server.registerTool(
  'figma_download_assets',
  {
    title: '下载设计资源到项目 public 目录',
    description: `将 figma_get_design_context 返回的资源下载到项目 public/portal/<场景名>/ 目录，
并自动生成 publicCdnUrl() 引用代码。下载的图片可直接在组件中通过 publicCdnUrl('/<场景>/xxx.png') 引用。
v1.1.5 新增：自动使用 SVGO 优化 SVG，移除冗余属性。
遵循项目资源落位规范（figma-to-code.md）。`,
    inputSchema: z.object({
      fileKey: z.string().describe('Figma 文件 Key'),
      sceneName: z.string().describe('场景名称（如 c-nexus/home、health、edu，用于目录组织）'),
      assetNodeIds: z.array(z.string()).describe('要下载的资源节点 ID 列表'),
      figmaUrl: z.string().optional().describe('Figma URL（自动解析 fileKey）'),
      projectRoot: z.string().optional().describe('项目根目录绝对路径（默认自动检测）'),
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
  async ({ fileKey, sceneName, assetNodeIds, figmaUrl, projectRoot, scale, svgFormat, optimizeSvg, accessToken }) => {
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

      const client = getFigmaClient(accessToken);

      const ctxService = createDesignContextService(client);
      const assets = [];
      for (const nodeId of assetNodeIds) {
        try {
          const ctx = await ctxService.getDesignContext(key, nodeId, 1);
          if (ctx.node.asset) assets.push(ctx.node.asset);
          function collectAssets(n: typeof ctx.node) {
            if (n.asset) assets.push(n.asset);
            if (n.children) n.children.forEach(collectAssets);
          }
          collectAssets(ctx.node);
        } catch {
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
      });

      const results = await downloader.downloadAssets(key, sceneName, uniqueAssets);
      const report = AssetDownloader.generateAssetsReport(results);

      return {
        content: [{ type: 'text', text: report }],
        structuredContent: { results, projectRoot: root, sceneName },
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `下载资源失败: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
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
        results.filter((r) => !r.success).forEach((r) => {
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
      return {
        content: [{ type: 'text', text: `生成 SVG Sprite 失败: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
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
      return {
        content: [
          { type: 'text', text: `获取组件列表失败: ${error instanceof Error ? error.message : String(error)}` },
        ],
        isError: true,
      };
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
      maxDepth: z.number().min(1).max(10).default(8).describe('最大检查深度（默认8）'),
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
      return {
        content: [{ type: 'text', text: `代码还原质量预检失败: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  },
);

server.registerTool(
  'figma_generate_jsx',
  {
    title: '一键生成 React JSX 代码（增强版）',
    description: `整合增强管线：自动精简层级 → 匹配 design token → 语义标签选择 → Flex 布局修复 → 无障碍增强 → 设计系统对齐 → 响应式推断 → 生成 React+Tailwind TSX 代码。
v1.2.0 新增强化功能：
- 🔧 Flex 布局问题自动修复（图标变形、文本截断、溢出滚动等）
- ♿ 无障碍(a11y)自动增强（语义化标签、alt 文本、ARIA 属性）
- 🎨 设计系统自动化（颜色变量、间距/字体/圆角/阴影映射）
- 📱 响应式断点智能推断（设备类型、响应式前缀建议）
自动：消除 div soup（layout-only 节点扁平化）、颜色/间距/圆角/阴影命中 token、图片标记 publicCdnUrl 占位、复用组件提示 import。
输出包含：TSX 代码、增强报告、需下载资源列表、需 @theme 扩展的 token、复用组件提示。

工作流建议：
1. 先调用 figma_get_metadata 了解结构
2. 可选：调用 figma_lint_design 检查设计规范并修复问题
3. 对目标区块调用 figma_generate_jsx 生成代码
4. 如有图片，调用 figma_download_assets 下载到 public/portal/<场景>/
5. 将生成代码复制到项目，处理 TODO 注释（复用组件映射）`,
    inputSchema: z.object({
      fileKey: z.string().describe('Figma 文件 Key（URL 中 /design/<key>/ 部分）'),
      nodeId: z.string().describe('目标节点 ID（URL 中 node-id= 参数）'),
      figmaUrl: z.string().optional().describe('Figma URL（可替代 fileKey+nodeId）'),
      componentName: z.string().optional().describe('生成的组件名（默认从节点名推断）'),
      sceneName: z.string().optional().describe('场景名（用于 public/portal/<场景>/ 资源路径）'),
      maxDepth: z.number().default(8).describe('节点树最大遍历深度（默认 8）'),
      skipEnhancements: z.boolean().default(false).describe('是否跳过 v1.2.0 增强功能'),
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
  async ({ fileKey, nodeId, figmaUrl, componentName, sceneName, maxDepth, skipEnhancements, skipLintCheck, accessToken }) => {
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

      const client = getFigmaClient(accessToken);
      const ctxService = createDesignContextService(client);
      const codeGen = createCodeGenerator(client);

      const ctx = await ctxService.getDesignContext(resolvedKey, resolvedNode, maxDepth);

      let lintReport: Awaited<ReturnType<ReturnType<typeof createDesignLinter>['lint']>> | null = null;
      if (!skipLintCheck) {
        try {
          const linter = createDesignLinter();
          lintReport = linter.lint(ctx.node);
        } catch {
        }
      }

      const result = await codeGen.generateJsxFromContext(ctx, {
        componentName,
        sceneName,
        usePublicCdn: true,
        skipEnhancements,
      });

      const lines: string[] = [];
      lines.push(`# ${result.componentName} - React TSX 代码\n`);

      if (lintReport && (lintReport.errorCount > 0 || lintReport.warningCount > 3)) {
        lines.push(`## ⚠️ 设计规范提示\n`);
        const scoreEmoji = lintReport.score >= 75 ? '✅' : lintReport.score >= 60 ? '⚠️' : '❌';
        lines.push(`${scoreEmoji} 当前设计规范评分: **${lintReport.score}/100**，发现 ${lintReport.errorCount} 个错误、${lintReport.warningCount} 个警告`);
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
        if (flexFixes && (flexFixes.fixedCount ?? flexFixes.totalFixedNodes) > 0) {
          const flexCount = flexFixes.fixedCount ?? flexFixes.totalFixedNodes;
          lines.push(`## 🔧 Flex 布局修复 (${flexCount} 处)\n`);
          flexFixes.fixes.slice(0, 10).forEach((fix: FlexFixEntry) => {
            lines.push(`- 节点 \`${fix.nodeName}\`: 添加了 ${fix.addedClasses.join(', ')}`);
          });
          lines.push('');
        }
        const a11yReport = reports.a11y;
        if (a11yReport) {
          const a11yCount = a11yReport.enhancementsCount ?? (a11yReport.semanticTagsCount + a11yReport.buttonsIdentifiedCount + a11yReport.ariaAddedCount);
          if (a11yCount > 0) {
            lines.push(`## ♿ 无障碍增强 (${a11yCount} 处)\n`);
            a11yReport.report.slice(0, 10).forEach((enh: A11yReportEntry) => {
              lines.push(`- 节点 \`${enh.nodeName}\`: ${enh.enhancement}`);
            });
            lines.push('');
          }
        }
        const dsReport = reports.designSystem;
        if (dsReport) {
          const dsCount = dsReport.suggestionsCount ?? (dsReport.colorSuggestions.length + dsReport.spacingTokens.length + dsReport.radiusTokens.length + dsReport.typographySuggestions.length);
          if (dsCount > 0) {
            lines.push(`## 🎨 设计系统建议 (${dsCount} 条)\n`);
            dsReport.suggestions.slice(0, 10).forEach((sug: DesignSystemSuggestion) => {
              lines.push(`- ${sug.message}`);
            });
            lines.push('');
          }
        }
        const respReport = reports.responsive;
        if (respReport) {
          const respCount = respReport.suggestionsCount ?? (respReport.recommendations.length + respReport.classSuggestions.length + respReport.layoutSuggestions.length);
          if (respCount > 0) {
            lines.push(`## 📱 响应式建议 (${respCount} 条)\n`);
            respReport.suggestions.slice(0, 10).forEach((sug: ResponsiveSuggestion) => {
              lines.push(`- ${sug.message}`);
            });
            lines.push('');
          }
        }
      }

      lines.push('```tsx');
      lines.push(result.code);
      lines.push('```\n');

      if (result.extensionsNeeded.length > 0) {
        lines.push('## ⚠️ 需要 @theme 扩展的 token\n');
        const grouped = new Map<string, Array<{ name: string; value: string }>>();
        for (const ext of result.extensionsNeeded) {
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

      if (result.pendingAssets.length > 0) {
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
          code: result.code,
          reports: result.reports,
          extensionsNeeded: result.extensionsNeeded,
          pendingAssets: result.pendingAssets,
          reusableComponents,
          lintScore: lintReport?.score,
          stats: {
            assetCount: ctx.assets.length,
            textCount: ctx.textNodes.length,
            shadowCount: ctx.shadows.length,
            colorsUsed: ctx.colors.length,
          },
        },
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `生成 JSX 失败: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  },
);

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
      maxDepth: z.number().min(1).max(10).default(8).describe('最大节点树深度（默认8）'),
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
      return {
        content: [
          { type: 'text', text: `获取结构化数据失败: ${error instanceof Error ? error.message : String(error)}` },
        ],
        isError: true,
      };
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

export async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Figma Dev Tools MCP Server v1.2.0 running via stdio');
}
