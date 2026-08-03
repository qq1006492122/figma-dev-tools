#!/usr/bin/env node
/**
 * Figma Dev Tools CLI
 * 命令行工具，用于 tokens 同步、组件生成、代码导出等
 */

import path from 'node:path';

import chalk from 'chalk';
import { Command } from 'commander';
import dotenv from 'dotenv';
import fs from 'fs-extra';

import { createAssetDownloader } from '../services/asset-downloader.js';
import { createCodeGenerator } from '../services/code-generator.js';
import { createDesignContextService } from '../services/design-context.js';
import { createFigmaClient } from '../services/figma-client.js';
import { createFileWriter } from '../services/file-writer.js';
import { createTokensExtractor } from '../services/tokens-extractor.js';
import type { ProcessedAsset, ProcessedFill, ProcessedNode, ProcessedSolidFill, StructuredNode } from '../types/nodes.js';
import { parseFigmaUrl } from '../utils/figma-url.js';

// 加载环境变量
dotenv.config();

const program = new Command();

// 版本和描述
program.name('figma-dev').description('Figma 开发工具 - 设计稿与代码的桥接工具').version('1.1.0');

// 全局选项
program
  .option('-t, --token <token>', 'Figma Access Token')
  .option('-o, --output <dir>', '输出目录', './src/styles/figma')
  .option('--no-backup', '不创建备份文件');

/**
 * 获取 Figma 客户端
 */
function getClient(token?: string) {
  const accessToken = token || process.env.FIGMA_ACCESS_TOKEN || process.env.FIGMA_OAUTH_TOKEN;
  if (!accessToken) {
    console.error(chalk.red('错误: 未提供 Figma Access Token'));
    console.error(chalk.yellow('请通过 --token 参数或 FIGMA_ACCESS_TOKEN 环境变量提供 Token'));
    console.error(chalk.gray('获取 Token: https://www.figma.com/developers/api#access-tokens'));
    process.exit(1);
  }
  return createFigmaClient({ accessToken });
}

/**
 * 解析 URL 或 fileKey
 */
function parseTarget(target: string): { fileKey: string; nodeId?: string } {
  if (target.startsWith('http')) {
    const parsed = parseFigmaUrl(target);
    if (!parsed.fileKey) {
      console.error(chalk.red('错误: 无法解析 Figma URL'));
      process.exit(1);
    }
    return { fileKey: parsed.fileKey, nodeId: parsed.nodeId };
  }
  return { fileKey: target };
}

// ============= 命令: 验证 Token =============

program
  .command('validate')
  .description('验证 Figma Access Token 是否有效')
  .action(async (_options) => {
    const opts = program.opts();
    console.log(chalk.blue('正在验证 Figma Token...'));

    try {
      const client = getClient(opts.token);
      const isValid = await client.validateToken();

      if (isValid) {
        console.log(chalk.green('✅ Token 验证成功！'));
      } else {
        console.log(chalk.red('❌ Token 验证失败'));
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`验证失败: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// ============= 命令: 查看文件信息 =============

program
  .command('info <url-or-filekey>')
  .description('查看 Figma 文件信息')
  .action(async (target) => {
    const opts = program.opts();
    const { fileKey } = parseTarget(target);

    console.log(chalk.blue(`正在获取文件信息: ${fileKey}`));

    try {
      const client = getClient(opts.token);
      const file = await client.getFile(fileKey, undefined, 1);

      console.log(chalk.green(`\n📄 ${file.name}`));
      console.log(chalk.gray(`   最后修改: ${file.lastModified}`));
      console.log(chalk.gray(`   版本: ${file.version}`));
      console.log('');

      const pages = file.document.children || [];
      console.log(chalk.cyan(`页面列表 (${pages.length}):`));
      pages.forEach((page, i) => {
        console.log(`  ${i + 1}. ${chalk.bold(page.name)} (${page.children?.length || 0} 个子元素)`);
        console.log(chalk.gray(`     ID: ${page.id}`));
      });

      console.log('');
      console.log(chalk.cyan('组件统计:'));
      console.log(`  组件: ${Object.keys(file.components).length}`);
      console.log(`  组件集: ${Object.keys(file.componentSets).length}`);
      console.log(`  样式: ${Object.keys(file.styles).length}`);
    } catch (error) {
      console.error(chalk.red(`获取文件信息失败: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// ============= 命令: 提取 Tokens =============

program
  .command('sync <url-or-filekey>')
  .description('同步设计 Tokens 到本地项目')
  .option('-n, --node <nodeId>', '指定节点 ID')
  .option('--format <format>', '颜色格式 (hex/rgb/oklch/hsl)', 'oklch')
  .option('--spacing-unit <unit>', '间距单位 (px/rem)', 'px')
  .option('--prefix <prefix>', 'Token 名称前缀')
  .option('--output-format <format>', '输出格式 (css/tailwind/json/all)', 'all')
  .option('--file-name <name>', '输出文件名')
  .action(async (target, cmdOptions) => {
    const opts = program.opts();
    const { fileKey, nodeId: urlNodeId } = parseTarget(target);
    const nodeId = cmdOptions.node || urlNodeId;

    console.log(chalk.blue(`正在从 Figma 提取设计 Tokens...`));
    console.log(chalk.gray(`文件: ${fileKey}`));
    if (nodeId) console.log(chalk.gray(`节点: ${nodeId}`));

    const startTime = Date.now();

    try {
      const client = getClient(opts.token);
      const extractor = createTokensExtractor(client, {
        colorFormat: cmdOptions.format,
        spacingUnit: cmdOptions.spacingUnit,
        tokenPrefix: cmdOptions.prefix,
      });

      const tokens = await extractor.extract(fileKey, nodeId);

      // 输出目录
      const outputDir = path.resolve(opts.output);
      await fs.ensureDir(outputDir);
      const writer = createFileWriter({
        outputDir,
        backup: opts.backup !== false,
      });

      const files: string[] = [];
      const format = cmdOptions.outputFormat;

      if (format === 'css' || format === 'all') {
        const cssPath = await writer.writeCSSVariables(tokens, cmdOptions.fileName || 'figma-tokens.css');
        files.push(cssPath);
      }

      if (format === 'tailwind' || format === 'all') {
        const twName = cmdOptions.fileName ? cmdOptions.fileName.replace('.css', '-theme.css') : 'figma-theme.css';
        const twPath = await writer.writeTailwindTheme(tokens, twName);
        files.push(twPath);
      }

      if (format === 'json' || format === 'all') {
        const jsonName = cmdOptions.fileName ? cmdOptions.fileName.replace(/\.[^.]+$/, '.json') : 'design-tokens.json';
        const jsonPath = await writer.writeTokensJson(tokens, jsonName);
        files.push(jsonPath);
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log(chalk.green(`\n✅ Tokens 同步完成 (${duration}s)`));
      console.log('');
      console.log(chalk.cyan('提取统计:'));
      console.log(`  颜色: ${Object.keys(tokens.colors).length} 个`);
      console.log(`  间距: ${Object.keys(tokens.spacing).length} 个`);
      console.log(`  圆角: ${Object.keys(tokens.radius).length} 个`);
      console.log(`  阴影: ${Object.keys(tokens.shadows).length} 个`);
      console.log(`  字体: ${Object.keys(tokens.typography).length} 个`);
      console.log('');
      console.log(chalk.cyan('输出文件:'));
      files.forEach((f) => console.log(`  ${chalk.gray(f)}`));

      console.log('');
      console.log(chalk.yellow('💡 提示: 在 globals.css 中导入生成的 CSS 文件'));
    } catch (error) {
      console.error(chalk.red(`同步失败: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// ============= 命令: 生成组件 =============

program
  .command('component <url-or-figma-url>')
  .description('从 Figma 节点生成 React 组件代码')
  .option('-n, --name <name>', '组件名称')
  .option('--js', '生成 JavaScript 代码 (默认 TypeScript)')
  .option('--style <format>', '样式格式 (tailwind/css-modules/inline)', 'tailwind')
  .option('--no-children', '不包含子元素')
  .option('--output <dir>', '输出目录')
  .action(async (target, cmdOptions) => {
    const opts = program.opts();
    const { fileKey, nodeId: urlNodeId } = parseTarget(target);
    const nodeId = cmdOptions.node || urlNodeId;

    if (!nodeId) {
      console.error(chalk.red('错误: 请提供节点 ID (在 Figma URL 中 ?node-id= 参数)'));
      process.exit(1);
    }

    console.log(chalk.blue(`正在生成组件...`));
    console.log(chalk.gray(`文件: ${fileKey}`));
    console.log(chalk.gray(`节点: ${nodeId}`));

    try {
      const client = getClient(opts.token);
      const generator = createCodeGenerator(client, {
        format: 'react',
        framework: 'react',
        typescript: !cmdOptions.js,
        styleFormat: cmdOptions.style,
        componentName: cmdOptions.name,
        includeChildren: cmdOptions.children !== false,
      });

      const component = await generator.generateComponent(fileKey, nodeId);

      if (cmdOptions.output) {
        // 写入文件
        const outputDir = path.resolve(cmdOptions.output);
        const writer = createFileWriter({ outputDir, backup: opts.backup !== false });
        const files = await writer.writeComponent(component);

        console.log(chalk.green(`\n✅ 组件生成完成: ${component.name}`));
        console.log('');
        console.log(chalk.cyan('输出文件:'));
        files.forEach((f) => console.log(`  ${chalk.gray(f)}`));
      } else {
        // 输出到控制台
        console.log(chalk.green(`\n✅ 组件生成完成: ${component.name}`));
        console.log('');
        console.log(chalk.cyan('组件代码:'));
        console.log(chalk.gray('─'.repeat(60)));
        console.log(component.code);
        console.log(chalk.gray('─'.repeat(60)));
      }
    } catch (error) {
      console.error(chalk.red(`生成组件失败: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// ============= 命令: 截图 =============

program
  .command('screenshot <url-or-filekey>')
  .description('获取节点截图')
  .option('-n, --node <nodeId>', '节点 ID')
  .option('--format <format>', '图片格式 (png/jpg/svg)', 'png')
  .option('--scale <scale>', '缩放比例 (1-4)', '2')
  .option('--download <dir>', '下载到指定目录')
  .action(async (target, cmdOptions) => {
    const opts = program.opts();
    const { fileKey, nodeId: urlNodeId } = parseTarget(target);
    const nodeId = cmdOptions.node || urlNodeId;

    if (!nodeId) {
      console.error(chalk.red('错误: 请提供节点 ID'));
      process.exit(1);
    }

    console.log(chalk.blue(`正在获取截图...`));

    try {
      const client = getClient(opts.token);
      const result = await client.getImages(
        fileKey,
        [nodeId],
        cmdOptions.format,
        Number.parseInt(cmdOptions.scale, 10),
      );

      const imageUrl = result.images[nodeId];
      if (!imageUrl) {
        console.error(chalk.red('获取截图失败'));
        process.exit(1);
      }

      console.log(chalk.green(`\n✅ 截图 URL:`));
      console.log(chalk.cyan(imageUrl));

      if (cmdOptions.download) {
        const downloadDir = path.resolve(cmdOptions.download);
        await fs.ensureDir(downloadDir);

        console.log(chalk.blue(`\n正在下载截图...`));
        const imageBuffer = await client.downloadImage(imageUrl);
        const fileName = `figma-${nodeId.replace(':', '-')}-${Date.now()}.${cmdOptions.format}`;
        const filePath = path.join(downloadDir, fileName);
        await fs.writeFile(filePath, imageBuffer);

        console.log(chalk.green(`✅ 已保存到: ${filePath}`));
      }
    } catch (error) {
      console.error(chalk.red(`获取截图失败: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// ============= 命令: 获取元数据概览 (v2.0) =============

program
  .command('metadata <url-or-filekey>')
  .description('获取设计节点高层结构概览（避免上下文爆炸）')
  .option('-n, --node <nodeId>', '节点 ID')
  .option('-d, --depth <depth>', '概览深度 (1-3)', '1')
  .action(async (target, cmdOptions) => {
    const opts = program.opts();
    const { fileKey, nodeId: urlNodeId } = parseTarget(target);
    const nodeId = cmdOptions.node || urlNodeId;
    const depth = Number.parseInt(cmdOptions.depth, 10) || 1;

    console.log(chalk.blue(`正在获取设计概览...`));
    console.log(chalk.gray(`文件: ${fileKey}${nodeId ? `, 节点: ${nodeId}` : ''}, 深度: ${depth}`));

    try {
      const client = getClient(opts.token);
      const ctxService = createDesignContextService(client);
      const metadata = await ctxService.getMetadata(fileKey, nodeId, depth);

      console.log(chalk.green(`\n📋 ${metadata.name}`));
      console.log(chalk.gray(`   类型: ${metadata.type}`));
      console.log(chalk.gray(`   尺寸: ${Math.round(metadata.size.width)} × ${Math.round(metadata.size.height)}`));
      console.log(chalk.gray(`   直接子节点: ${metadata.childCount}`));
      console.log(chalk.gray(`   使用颜色: ${metadata.colorsUsed.length}`));
      console.log(chalk.gray(`   文本节点: ${metadata.textNodeCount}`));
      console.log(chalk.gray(`   图片: ${metadata.imageCount}`));
      console.log('');

      if (metadata.children.length > 0) {
        console.log(chalk.cyan(`子区块 (${metadata.children.length}):`));
        console.log('   #  名称                      类型       语义         尺寸          子元素  组件');
        console.log('   ─  ────────────────────────  ─────────  ───────────  ────────────  ─────  ────');
        metadata.children.forEach((c, i) => {
          const num = String(i + 1).padStart(2, ' ');
          const name = c.name.padEnd(26, ' ').slice(0, 26);
          const type = c.type.padEnd(10, ' ');
          const role = c.semanticRole.padEnd(11, ' ');
          const size = `${Math.round(c.size.width)}×${Math.round(c.size.height)}`.padEnd(13, ' ');
          const childCnt = String(c.childCount).padStart(4, ' ');
          const isComp = c.isComponent ? '✓' : '';
          console.log(`   ${num} ${name}${type}${role}${size}${childCnt}  ${isComp}`);
        });
        console.log('');
      }

      if (metadata.colorsUsed.length > 0) {
        console.log(chalk.cyan(`使用颜色 (${metadata.colorsUsed.length}, 前15):`));
        metadata.colorsUsed.slice(0, 15).forEach((c) => console.log(`  - ${c}`));
        if (metadata.colorsUsed.length > 15) console.log(chalk.gray(`  ... 共 ${metadata.colorsUsed.length} 个`));
      }
    } catch (error) {
      console.error(chalk.red(`获取元数据失败: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// ============= 命令: 获取框架无关结构化数据 (v1.1.0) =============

program
  .command('structured <url-or-filekey>')
  .description('获取框架无关的结构化设计数据（适用于 Vue/Svelte/HTML 等任意框架）')
  .option('-n, --node <nodeId>', '节点 ID')
  .option('--depth <depth>', '最大节点树深度', '8')
  .option('--format <format>', '输出格式 (pretty/json)', 'pretty')
  .option('--output <file>', '输出到文件（默认输出到控制台）')
  .action(async (target, cmdOptions) => {
    const opts = program.opts();
    const { fileKey, nodeId: urlNodeId } = parseTarget(target);
    const nodeId = cmdOptions.node || urlNodeId;
    const maxDepth = Number.parseInt(cmdOptions.depth, 10) || 8;

    if (!nodeId) {
      console.error(chalk.red('错误: 请提供节点 ID (URL 中 ?node-id= 参数或 --node 选项)'));
      process.exit(1);
    }

    console.log(chalk.blue(`正在获取框架无关结构化数据...`));
    console.log(chalk.gray(`文件: ${fileKey}, 节点: ${nodeId}, 深度: ${maxDepth}`));

    const startTime = Date.now();

    try {
      const client = getClient(opts.token);
      const ctxService = createDesignContextService(client);

      console.log(chalk.gray('  ↳ 获取设计上下文...'));
      const context = await ctxService.getDesignContext(fileKey, nodeId, maxDepth);

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      function countNodes(n: { children?: unknown[] }): number {
        let c = 1;
        if (n.children) for (const child of n.children as Array<{ children?: unknown[] }>) c += countNodes(child);
        return c;
      }

      const nodeCount = countNodes(context.node);
      const structuredNode = toStructuredNode(context.node);
      const output = cmdOptions.format === 'json' ? JSON.stringify(structuredNode, null, 2) : formatStructuredPretty(structuredNode);

      if (cmdOptions.output) {
        const outPath = path.resolve(cmdOptions.output);
        await fs.ensureDir(path.dirname(outPath));
        await fs.writeFile(outPath, output, 'utf-8');
        console.log(chalk.green(`\n✅ 结构化数据已保存 (${duration}s): ${outPath}`));
        console.log(chalk.gray(`   节点数: ${nodeCount}, 资源: ${context.assets.length}, 文本: ${context.textNodes.length}`));
      } else {
        console.log(chalk.green(`\n✅ 获取完成 (${duration}s): ${context.node.name}`));
        console.log(chalk.gray(`   节点数: ${nodeCount}, 资源: ${context.assets.length}, 文本: ${context.textNodes.length}`));
        console.log('');
        console.log(chalk.cyan('─'.repeat(70)));
        console.log(output);
        console.log(chalk.cyan('─'.repeat(70)));
      }
    } catch (error) {
      console.error(chalk.red(`获取结构化数据失败: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

function formatStructuredPretty(node: StructuredNode, indent: number = 0): string {
  const pad = '  '.repeat(indent);
  const lines: string[] = [];
  const sizeStr = node.size ? `${Math.round(node.size.width)}×${Math.round(node.size.height)}` : 'N/A';
  const tag = (node.type || 'unknown').toLowerCase();
  lines.push(`${pad}[${node.role}] <${tag}> "${node.name}" (${sizeStr})`);

  if (node.textContent) {
    lines.push(`${pad}  text: "${node.textContent.slice(0, 60)}${node.textContent.length > 60 ? '...' : ''}"`);
  }

  if (node.layout) {
    const l = node.layout;
    const layoutParts: string[] = [];
    if (l.mode) layoutParts.push(l.mode);
    if (l.itemSpacing !== undefined) layoutParts.push(`gap=${l.itemSpacing}`);
    if (l.padding) {
      const p = l.padding;
      if (p.top || p.right || p.bottom || p.left) {
        layoutParts.push(`p=${p.top}/${p.right}/${p.bottom}/${p.left}`);
      }
    }
    if (layoutParts.length > 0) {
      lines.push(`${pad}  layout: ${layoutParts.join(', ')}`);
    }
  }

  const styleParts: string[] = [];
  if (node.fills && node.fills.length > 0) {
    const solidFill = node.fills.find((f: ProcessedFill): f is ProcessedSolidFill => f.type === 'solid');
    if (solidFill?.color) {
      const c = solidFill.color;
      const r = Math.round((c.r ?? 0) * 255);
      const g = Math.round((c.g ?? 0) * 255);
      const b = Math.round((c.b ?? 0) * 255);
      styleParts.push(`bg=#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`);
    }
  }
  if (node.cornerRadius?.uniform && node.cornerRadius.topLeft > 0) {
    styleParts.push(`radius=${Math.round(node.cornerRadius.topLeft)}px`);
  }
  if (node.textStyle) {
    if (node.textStyle.fontSize) styleParts.push(`font=${Math.round(node.textStyle.fontSize)}px`);
    if (node.textStyle.fontWeight) styleParts.push(`weight=${node.textStyle.fontWeight}`);
  }
  if (styleParts.length > 0) {
    lines.push(`${pad}  styles: ${styleParts.join(', ')}`);
  }

  if (node.asset) {
    lines.push(`${pad}  asset: ${node.asset.name} (${node.asset.type}/${node.asset.format}, ${node.asset.width}×${node.asset.height})`);
  }

  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      lines.push(formatStructuredPretty(child, indent + 1));
    }
  }

  return lines.join('\n');
}

/**
 * 将 ProcessedNode 转换为 StructuredNode
 * StructuredNode 使用 type 字段替代 originalType，保持框架无关性，与 MCP 工具输出一致
 */
function toStructuredNode(node: ProcessedNode): StructuredNode {
  // 构造 StructuredNode，所有必需字段都已包含
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

// ============= 命令: 一键生成 JSX (v2.0) =============

program
  .command('jsx <url-or-filekey>')
  .description('一键生成 React+Tailwind TSX 代码（增强管线）')
  .option('-n, --node <nodeId>', '节点 ID')
  .option('--name <name>', '组件名称')
  .option('--scene <scene>', '场景名（用于 public/portal/<scene>/ 资源路径）')
  .option('--depth <depth>', '最大节点树深度', '8')
  .option('--output <file>', '输出到文件（默认输出到控制台）')
  .action(async (target, cmdOptions) => {
    const opts = program.opts();
    const { fileKey, nodeId: urlNodeId } = parseTarget(target);
    const nodeId = cmdOptions.node || urlNodeId;
    const maxDepth = Number.parseInt(cmdOptions.depth, 10) || 8;

    if (!nodeId) {
      console.error(chalk.red('错误: 请提供节点 ID (URL 中 ?node-id= 参数或 --node 选项)'));
      process.exit(1);
    }

    console.log(chalk.blue(`正在生成 JSX 代码 (增强管线)...`));
    console.log(chalk.gray(`文件: ${fileKey}, 节点: ${nodeId}, 深度: ${maxDepth}`));

    const startTime = Date.now();

    try {
      const client = getClient(opts.token);
      const ctxService = createDesignContextService(client);
      const codeGen = createCodeGenerator(client);

      // 1. 获取精简设计上下文
      console.log(chalk.gray('  ↳ 获取精简设计上下文...'));
      const ctx = await ctxService.getDesignContext(fileKey, nodeId, maxDepth);

      // 2. 生成 JSX
      console.log(chalk.gray('  ↳ 生成 JSX 代码...'));
      const result = codeGen.generateJsxFromContext(ctx, {
        componentName: cmdOptions.name,
        sceneName: cmdOptions.scene,
        usePublicCdn: true,
      });

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      // 统计
      function countNodes(n: { children?: unknown[] }): number {
        let c = 1;
        if (n.children) for (const child of n.children as Array<{ children?: unknown[] }>) c += countNodes(child);
        return c;
      }

      console.log(chalk.green(`\n✅ 生成完成 (${duration}s): ${result.componentName}`));
      console.log(
        chalk.gray(`   节点数: ${countNodes(ctx.node)}, 资源: ${ctx.assets.length}, 文本: ${ctx.textNodes.length}`),
      );

      if (result.extensionsNeeded.length > 0) {
        console.log(chalk.yellow(`\n⚠️  需要 @theme 扩展的 token (${result.extensionsNeeded.length}):`));
        const unique = result.extensionsNeeded.filter(
          (v, i, a) => a.findIndex((x) => x.originalValue === v.originalValue) === i,
        );
        unique.slice(0, 10).forEach((ext) => {
          console.log(`  - @theme inline { --color-${ext.suggestedName}: ${ext.originalValue}; }`);
        });
      }

      if (result.pendingAssets.length > 0) {
        const uniqueAssets = result.pendingAssets.filter((v, i, a) => a.findIndex((x) => x.nodeId === v.nodeId) === i);
        console.log(chalk.cyan(`\n🖼️  需要下载的资源 (${uniqueAssets.length}):`));
        uniqueAssets.forEach((a) => {
          console.log(`  - ${a.nodeId}: ${a.name} (${a.type})`);
        });
        console.log(
          chalk.gray(`   运行: figma-dev assets <url> --scene ${cmdOptions.scene || '<scene>'} --nodes <nodeIds>`),
        );
      }

      const reusableComponents = ctx.componentsUsed.filter((c) => c.instanceCount > 0);
      if (reusableComponents.length > 0) {
        console.log(chalk.magenta(`\n🧩 检查复用组件:`));
        reusableComponents.forEach((c) => {
          console.log(`  - ${c.name} (使用 ${c.instanceCount} 次) → @/components/web-official/`);
        });
      }

      // 输出代码
      console.log('');
      console.log(chalk.cyan('─'.repeat(70)));

      if (cmdOptions.output) {
        const outPath = path.resolve(cmdOptions.output);
        await fs.ensureDir(path.dirname(outPath));
        await fs.writeFile(outPath, result.code, 'utf-8');
        console.log(chalk.green(`✅ 代码已写入: ${outPath}`));
      } else {
        console.log(result.code);
      }
      console.log(chalk.cyan('─'.repeat(70)));
    } catch (error) {
      console.error(chalk.red(`生成 JSX 失败: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// ============= 命令: 下载资源 (v2.0) =============

program
  .command('assets <url-or-filekey>')
  .description('下载设计资源到 public/portal/<scene>/ 目录')
  .option('-n, --node <nodeId>', '节点 ID（可指定多个，逗号分隔）')
  .option('--nodes <nodeIds>', '节点 ID 列表（逗号分隔）')
  .option('--scene <scene>', '场景名称（如 health、edu、ai-innovation-class）', 'default')
  .option('--project-root <dir>', '项目根目录（自动检测）')
  .option('--scale <scale>', '导出倍率 (1-4)', '2')
  .option('--svg-format <format>', '矢量导出格式 (svg/png)', 'svg')
  .action(async (target, cmdOptions) => {
    const opts = program.opts();
    const { fileKey, nodeId: urlNodeId } = parseTarget(target);

    // 收集所有 nodeId
    const nodeIds: string[] = [];
    if (urlNodeId) nodeIds.push(urlNodeId);
    if (cmdOptions.node) nodeIds.push(...cmdOptions.node.split(','));
    if (cmdOptions.nodes) nodeIds.push(...cmdOptions.nodes.split(','));

    if (nodeIds.length === 0) {
      console.error(chalk.red('错误: 请提供节点 ID (--node 或 --nodes)'));
      process.exit(1);
    }

    const scale = Number.parseInt(cmdOptions.scale, 10) || 2;
    const sceneName = cmdOptions.scene || 'default';

    console.log(chalk.blue(`正在下载设计资源...`));
    console.log(chalk.gray(`文件: ${fileKey}, 场景: ${sceneName}, 节点数: ${nodeIds.length}, 倍率: ${scale}x`));

    try {
      const client = getClient(opts.token);

      // 自动检测项目根目录
      let projectRoot = cmdOptions.projectRoot;
      if (!projectRoot) {
        let dir = process.cwd();
        for (let i = 0; i < 8; i++) {
          if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
            projectRoot = dir;
            break;
          }
          const parent = path.dirname(dir);
          if (parent === dir) break;
          dir = parent;
        }
        if (!projectRoot) projectRoot = process.cwd();
      }
      console.log(chalk.gray(`项目根目录: ${projectRoot}`));

      // 获取资源元数据
      const ctxService = createDesignContextService(client);
      const assets: ProcessedAsset[] = [];
      for (const nId of nodeIds) {
        try {
          const ctx = await ctxService.getDesignContext(fileKey, nId, 1);
          if (ctx.node.asset) assets.push(ctx.node.asset);
          const collect = (n: typeof ctx.node) => {
            if (n.asset) assets.push(n.asset);
            if (n.children) n.children.forEach(collect);
          };
          collect(ctx.node);
        } catch {
          /* 单个节点失败不影响整体 */
        }
      }

      // 去重
      const seen = new Set<string>();
      const uniqueAssets = assets.filter((a) => {
        if (seen.has(a.nodeId)) return false;
        seen.add(a.nodeId);
        return true;
      });

      if (uniqueAssets.length === 0) {
        console.log(chalk.yellow('未找到可下载的资源（请确认 nodeId 对应图片/图标节点）'));
        return;
      }

      console.log(chalk.gray(`发现 ${uniqueAssets.length} 个资源，开始下载...`));

      const downloader = createAssetDownloader(client, {
        projectRoot,
        scale: scale as 1 | 2 | 3 | 4,
        svgFormat: cmdOptions.svgFormat as 'svg' | 'png',
      });

      const results = await downloader.downloadAssets(fileKey, sceneName, uniqueAssets);

      console.log(chalk.green(`\n✅ 资源下载完成:`));
      let successCount = 0;
      results.forEach((r) => {
        if (r.success) {
          successCount++;
          console.log(`  ✓ ${r.asset.name} → ${r.localPath}`);
          if (r.importCode) console.log(chalk.gray(`      ${r.importCode}`));
        } else {
          console.log(`  ✗ ${r.asset.nodeId}: ${r.error}`);
        }
      });
      console.log(chalk.gray(`\n   成功: ${successCount}/${results.length}`));
    } catch (error) {
      console.error(chalk.red(`下载资源失败: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// ============= 命令: MCP Server =============

program
  .command('mcp')
  .description('启动 MCP 服务器 (stdio 模式)')
  .action(async () => {
    const { main } = await import('../index.js');
    await main();
  });

// ============= 命令: 初始化配置 =============

program
  .command('init')
  .description('初始化 Figma Dev Tools 配置')
  .action(async () => {
    const configPath = path.resolve('./figma-dev.config.json');
    const envPath = path.resolve('./.env');

    console.log(chalk.blue('正在初始化 Figma Dev Tools...\n'));

    // 创建配置文件
    const defaultConfig = {
      $schema: 'https://schema.figma-dev-tools.com/config.json',
      defaultFileKey: '',
      outputDir: './src/styles/figma',
      framework: 'react',
      styleFormat: 'tailwind',
      typescript: true,
      colorFormat: 'oklch',
      spacingUnit: 'px',
      importAlias: '@',
    };

    if (await fs.pathExists(configPath)) {
      console.log(chalk.yellow(`⚠️  配置文件已存在: ${configPath}`));
    } else {
      await fs.writeJSON(configPath, defaultConfig, { spaces: 2 });
      console.log(chalk.green(`✅ 创建配置文件: ${configPath}`));
    }

    // 创建 .env 示例
    if (await fs.pathExists(envPath)) {
      const envContent = await fs.readFile(envPath, 'utf-8');
      if (!envContent.includes('FIGMA_ACCESS_TOKEN')) {
        await fs.appendFile(
          envPath,
          '\n# Figma Access Token\n# 获取地址: https://www.figma.com/developers/api#access-tokens\nFIGMA_ACCESS_TOKEN=your_token_here\n',
        );
        console.log(chalk.green(`✅ 更新 .env 文件，添加 FIGMA_ACCESS_TOKEN 配置`));
      }
    } else {
      await fs.writeFile(
        envPath,
        '# Figma Access Token\n# 获取地址: https://www.figma.com/developers/api#access-tokens\nFIGMA_ACCESS_TOKEN=your_token_here\n',
      );
      console.log(chalk.green(`✅ 创建 .env 文件: ${envPath}`));
    }

    console.log('');
    console.log(chalk.cyan('下一步:'));
    console.log('  1. 在 .env 文件中设置你的 FIGMA_ACCESS_TOKEN');
    console.log('  2. 运行 figma-dev validate 验证 Token');
    console.log('  3. 运行 figma-dev sync <figma-url> 同步设计 Tokens');
  });

// 解析命令行参数
program.parse();
