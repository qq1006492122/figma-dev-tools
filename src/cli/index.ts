#!/usr/bin/env node
/**
 * Figma Dev Tools CLI
 * 命令行工具，用于 tokens 同步、组件生成、代码导出等
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { input, password, select, confirm } from '@inquirer/prompts';
import boxen from 'boxen';
import chalk from 'chalk';
import { Command } from 'commander';
import dotenv from 'dotenv';
import fs from 'fs-extra';
import open from 'open';
import ora from 'ora';

import { initI18nSync } from '../i18n/index.js';
import type { Language } from '../i18n/index.js';
import { createAssetDownloader } from '../services/asset-downloader.js';
import { createFigmaCache } from '../services/cache.js';
import { createCodeGenerator } from '../services/code-generator.js';
import { createComponentMapper } from '../services/component-mapper.js';
import { createDesignContextService } from '../services/design-context.js';
import { createDesignLinter } from '../services/design-linter.js';
import { createFigmaClient } from '../services/figma-client.js';
import { createFileWriter } from '../services/file-writer.js';
import { createTokenStore } from '../services/token-store.js';
import { createTokensExtractor } from '../services/tokens-extractor.js';
import { createVueGenerator } from '../services/vue-generator.js';
import type { CodeGenResult, TailwindExtension, PendingAsset } from '../types.js';
import type {
  ProcessedAsset,
  ProcessedFill,
  ProcessedNode,
  ProcessedSolidFill,
  StructuredNode,
} from '../types/nodes.js';
import { parseFigmaUrl } from '../utils/figma-url.js';
import { checkGitignore, getPrivacyStatement } from '../utils/security.js';

// 加载环境变量
dotenv.config();

// 初始化 i18n（v1.2.0 新增）
const i18n = initI18nSync();

const program = new Command();

// 版本和描述
program
  .name('figma-dev')
  .description(i18n.t('cli.description') as string)
  .version('1.4.7');

// 全局选项
program
  .option('-t, --token <token>', i18n.t('cli.options.token') as string)
  .option('-o, --output <dir>', i18n.t('cli.options.output') as string, './src/styles/figma')
  .option('--no-backup', i18n.t('cli.options.noBackup') as string)
  .option('-l, --lang <lang>', i18n.t('cli.options.lang') as string)
  .option('-v, --ver', i18n.t('cli.options.ver') as string)
  .option('--update', i18n.t('cli.options.update') as string);

/**
 * 获取 Figma 客户端
 * 优先顺序：--token 参数 > 安全存储的默认 Token > FIGMA_ACCESS_TOKEN 环境变量 > FIGMA_OAUTH_TOKEN 环境变量
 */
async function getClient(token?: string) {
  let accessToken: string | undefined = token;

  // 如果没有通过参数传入 Token，从安全存储加载
  if (!accessToken) {
    const tokenStore = createTokenStore();
    const storedToken = await tokenStore.getToken();
    accessToken = storedToken ?? undefined;

    // 检查是否有 Token 需要验证（启动时静默检查）
    if (accessToken && !token) {
      try {
        const needingValidation = await tokenStore.getTokensNeedingValidation();
        if (needingValidation.length > 0) {
          const defaultName = await tokenStore.getDefault();
          if (needingValidation.includes(defaultName)) {
            // 静默验证，不阻塞用户操作
            tokenStore.validateToken(defaultName, false).catch(() => {});
          }
        }
      } catch {
        // 忽略验证错误，不影响正常使用
      }
    }
  }

  // 回退到环境变量
  if (!accessToken) {
    accessToken = process.env.FIGMA_ACCESS_TOKEN || process.env.FIGMA_OAUTH_TOKEN;
  }

  if (!accessToken) {
    console.error(
      boxen(
        chalk.red.bold((i18n.t('cli.errors.noToken.title') as string) + '\n\n') +
          chalk.white((i18n.t('cli.errors.noToken.howTo') as string) + '\n\n') +
          chalk.cyan(i18n.t('cli.errors.noToken.recommended') as string) +
          chalk.gray((i18n.t('cli.errors.noToken.wizard') as string) + '\n') +
          chalk.cyan(i18n.t('cli.errors.noToken.quick') as string) +
          chalk.gray((i18n.t('cli.errors.noToken.tokenSet') as string) + '\n') +
          chalk.cyan(i18n.t('cli.errors.noToken.temp') as string) +
          chalk.gray((i18n.t('cli.errors.noToken.tempDesc') as string) + '\n') +
          chalk.cyan(i18n.t('cli.errors.noToken.env') as string) +
          chalk.gray((i18n.t('cli.errors.noToken.envDesc') as string) + '\n\n') +
          chalk.yellow(i18n.t('cli.errors.noToken.getToken') as string),
        { padding: 1, borderColor: 'red', margin: { top: 1 } },
      ),
    );
    process.exit(1);
  }

  // 创建带缓存的客户端
  const cache = createFigmaCache();
  return createFigmaClient({ accessToken, cache });
}

/**
 * 解析 URL 或 fileKey
 */
function parseTarget(target: string): { fileKey: string; nodeId?: string } {
  if (target.startsWith('http')) {
    const parsed = parseFigmaUrl(target);
    if (!parsed.fileKey) {
      console.error(chalk.red(i18n.t('cli.errors.invalidUrl') as string));
      process.exit(1);
    }
    return { fileKey: parsed.fileKey, nodeId: parsed.nodeId };
  }
  return { fileKey: target };
}

// ============= 命令: 语言设置 (v1.2.0 新增) =============

const langCmd = program.command('lang').description(i18n.t('cli.commands.lang.description') as string);

langCmd
  .command('set <language>')
  .description(i18n.t('cli.commands.lang.set') as string)
  .action(async (language: string) => {
    const supportedLangs = ['zh-CN', 'en-US'];
    if (!supportedLangs.includes(language)) {
      console.error(chalk.red((i18n.t('cli.commands.lang.invalid') as string) + ': ' + supportedLangs.join(', ')));
      process.exit(1);
    }
    await i18n.setLanguage(language as Language);
    const langNames: Record<Language, string> = {
      'zh-CN': i18n.t('config.languageZhCN') as string,
      'en-US': i18n.t('config.languageEnUS') as string,
    };
    console.log(chalk.green((i18n.t('cli.commands.lang.success') as string) + ': ' + langNames[language as Language]));
  });

langCmd
  .command('list')
  .alias('ls')
  .description(i18n.t('cli.commands.lang.list') as string)
  .action(() => {
    const currentLang = i18n.getLanguage();
    const languages = i18n.getSupportedLanguages();
    console.log(chalk.cyan((i18n.t('cli.commands.lang.current') as string) + ':\n'));
    languages.forEach((lang) => {
      const marker =
        lang.code === currentLang ? chalk.green(('★ ' + i18n.t('cli.commands.lang.currentMarker')) as string) : '  ';
      console.log(`  ${marker} ${chalk.bold(lang.name)} (${lang.code})`);
    });
    console.log('');
    console.log(chalk.gray(i18n.t('cli.commands.lang.switchHint') as string));
  });

langCmd
  .command('switch')
  .description(i18n.t('cli.commands.lang.switch') as string)
  .action(async () => {
    const languages = i18n.getSupportedLanguages();
    const currentLang = i18n.getLanguage();

    const selected = await select({
      message: i18n.t('cli.commands.lang.selectPrompt') as string,
      choices: languages.map((lang) => ({
        name:
          lang.code === currentLang
            ? `${lang.name} (${i18n.t('cli.commands.lang.currentMarker') as string})`
            : lang.name,
        value: lang.code,
      })),
      default: currentLang,
    });

    await i18n.setLanguage(selected);
    const langNames: Record<Language, string> = {
      'zh-CN': i18n.t('config.languageZhCN') as string,
      'en-US': i18n.t('config.languageEnUS') as string,
    };
    console.log(chalk.green((i18n.t('cli.commands.lang.success') as string) + ': ' + langNames[selected]));
  });

// ============= 命令: 验证 Token =============

program
  .command('validate')
  .description(i18n.t('cli.commands.validate.description') as string)
  .action(async (_options) => {
    const opts = program.opts();
    const spinner = ora(chalk.blue(i18n.t('cli.commands.validate.validating') as string)).start();

    try {
      const client = await getClient(opts.token);
      const isValid = await client.validateToken();

      if (isValid) {
        spinner.succeed(chalk.green(i18n.t('cli.commands.validate.success') as string));
      } else {
        spinner.fail(chalk.red(i18n.t('cli.commands.validate.failed') as string));
        process.exit(1);
      }
    } catch (error) {
      spinner.fail(
        chalk.red(
          (i18n.t('common.failed') as string) + ': ' + (error instanceof Error ? error.message : String(error)),
        ),
      );
      process.exit(1);
    }
  });

// ============= 命令组: Token 安全管理 =============

const tokenCmd = program.command('token').description(i18n.t('cli.commands.token.description') as string);

tokenCmd
  .command('set [name]')
  .description(i18n.t('cli.commands.token.set') as string)
  .option('-t, --token <token>', i18n.t('cli.commands.token.tokenOption') as string)
  .option('-n, --note <note>', i18n.t('cli.commands.token.note') as string)
  .action(async (name = 'default', cmdOptions) => {
    const tokenStore = createTokenStore();
    let tokenValue = cmdOptions.token;

    if (!tokenValue) {
      console.log(
        boxen(
          chalk.cyan((i18n.t('cli.commands.token.secureStorage') as string) + '\n\n') +
            chalk.white((i18n.t('cli.commands.token.storageLocation') as string) + ':\n') +
            chalk.gray('- macOS: Keychain\n') +
            chalk.gray('- Windows: Credential Manager\n') +
            chalk.gray((('- Linux: libsecret (' + i18n.t('cli.commands.token.linuxFallback')) as string) + ')\n\n') +
            chalk.yellow(i18n.t('cli.commands.token.privacyNotice') as string),
          { padding: 1, borderColor: 'cyan', margin: { top: 1, bottom: 1 } },
        ),
      );

      tokenValue = await password({
        message: i18n.t('cli.commands.token.pastePrompt') as string,
        validate: (v: string) => {
          if (!v || v.length < 20) return i18n.t('cli.commands.token.invalidLength') as string;
          if (!v.startsWith('figd_')) return i18n.t('cli.commands.token.invalidPrefix') as string;
          return true;
        },
      });
    }

    const spinner = ora(i18n.t('cli.commands.token.saving') as string).start();
    try {
      await tokenStore.saveToken(name, tokenValue, cmdOptions.note);
      await tokenStore.setDefault(name);
      const backend = await tokenStore.getBackend();
      spinner.succeed(
        chalk.green(
          (i18n.t('cli.commands.token.saved') as string) +
            ` (${backend === 'keytar' ? (i18n.t('cli.commands.token.keychain') as string) : (i18n.t('cli.commands.token.encryptedFile') as string)})`,
        ),
      );

      // 验证 Token
      spinner.start(i18n.t('cli.commands.token.validating') as string);
      const client = createFigmaClient({ accessToken: tokenValue });
      const isValid = await client.validateToken();
      if (isValid) {
        spinner.succeed(chalk.green(i18n.t('cli.commands.token.validateSuccess') as string));
      } else {
        spinner.warn(chalk.yellow(i18n.t('cli.commands.token.validateFailed') as string));
      }
    } catch (error) {
      spinner.fail(
        chalk.red(
          (i18n.t('common.failed') as string) + ': ' + (error instanceof Error ? error.message : String(error)),
        ),
      );
      process.exit(1);
    }
  });

tokenCmd
  .command('get [name]')
  .description(i18n.t('cli.commands.token.get') as string)
  .option('--show-full', i18n.t('cli.commands.token.showFull') as string)
  .action(async (name = 'default', cmdOptions) => {
    const tokenStore = createTokenStore();
    const info = await tokenStore.getTokenInfo(name);

    if (!info) {
      console.log(chalk.yellow((i18n.t('cli.commands.token.notFound') as string) + ` "${name}"`));
      const list = await tokenStore.listTokens();
      if (list.length > 0) {
        console.log(chalk.gray((i18n.t('cli.commands.token.savedTokens') as string) + ': ' + list.join(', ')));
      } else {
        console.log(chalk.gray(i18n.t('cli.commands.token.noTokens') as string));
      }
      return;
    }

    const maskedToken = cmdOptions.showFull ? info.value : `${info.value.slice(0, 8)}****${info.value.slice(-4)}`;
    const backend = await tokenStore.getBackend();

    console.log(
      boxen(
        chalk.cyan(`🔐 Token: ${info.name}\n\n`) +
          chalk.white(`值: ${maskedToken}\n`) +
          chalk.gray(
            `存储方式: ${backend === 'keytar' ? (i18n.t('cli.commands.token.keychain') as string) : (i18n.t('cli.commands.token.encryptedFile') as string)}\n`,
          ) +
          chalk.gray(
            `保存时间: ${new Date(info.createdAt).toLocaleString(i18n.getLanguage() === 'zh-CN' ? 'zh-CN' : 'en-US')}\n`,
          ) +
          (info.lastUsedAt
            ? chalk.gray(
                `最后使用: ${new Date(info.lastUsedAt).toLocaleString(i18n.getLanguage() === 'zh-CN' ? 'zh-CN' : 'en-US')}\n`,
              )
            : '') +
          (info.note ? chalk.gray(`备注: ${info.note}\n`) : ''),
        { padding: 1, borderColor: 'green', margin: { top: 1 } },
      ),
    );
  });

tokenCmd
  .command('list')
  .alias('ls')
  .description(i18n.t('cli.commands.token.list') as string)
  .action(async () => {
    const tokenStore = createTokenStore();
    const list = await tokenStore.listTokens();
    const defaultName = await tokenStore.getDefault();
    const backend = await tokenStore.getBackend();

    if (list.length === 0) {
      console.log(chalk.yellow(i18n.t('cli.commands.token.noTokens') as string));
      console.log(chalk.gray(i18n.t('cli.commands.token.runSet') as string));
      return;
    }

    console.log(
      chalk.cyan(
        `🔐 ${i18n.t('cli.commands.token.savedTokensList') as string} (${backend === 'keytar' ? (i18n.t('cli.commands.token.keychain') as string) : (i18n.t('cli.commands.token.encryptedFile') as string)}):\n`,
      ),
    );
    for (const name of list) {
      const info = await tokenStore.getTokenInfo(name);
      const isDefault = name === defaultName;
      const marker = isDefault ? chalk.green('★') : ' ';
      const note = info?.note ? chalk.gray(` (${info.note})`) : '';
      console.log(
        `  ${marker} ${chalk.bold(name)}${isDefault ? chalk.green(((' [' + i18n.t('cli.commands.token.default')) as string) + ']') : ''}${note}`,
      );
    }
    console.log('');
  });

tokenCmd
  .command('delete <name>')
  .alias('rm')
  .description(i18n.t('cli.commands.token.delete') as string)
  .option('-f, --force', i18n.t('cli.commands.token.forceDelete') as string)
  .action(async (name, cmdOptions) => {
    const tokenStore = createTokenStore();

    if (!cmdOptions.force) {
      const confirmed = await confirm({
        message: (i18n.t('cli.commands.token.confirmDelete') as string) + ` "${name}"?`,
        default: false,
      });
      if (!confirmed) {
        console.log(chalk.gray(i18n.t('common.cancelled') as string));
        return;
      }
    }

    const ok = await tokenStore.deleteToken(name);
    if (ok) {
      console.log(chalk.green((i18n.t('cli.commands.token.deleted') as string) + ` "${name}"`));
    } else {
      console.log(chalk.yellow((i18n.t('cli.commands.token.notExist') as string) + ` "${name}"`));
    }
  });

tokenCmd
  .command('default <name>')
  .description(i18n.t('cli.commands.token.setDefault') as string)
  .action(async (name) => {
    const tokenStore = createTokenStore();
    const list = await tokenStore.listTokens();
    if (!list.includes(name)) {
      console.log(chalk.red((i18n.t('cli.commands.token.notExist') as string) + ` "${name}"`));
      process.exit(1);
    }
    await tokenStore.setDefault(name);
    console.log(chalk.green((i18n.t('cli.commands.token.defaultSet') as string) + ': ' + name));
  });

// ============= 命令: 查看文件信息 =============

program
  .command('info <url-or-filekey>')
  .description(i18n.t('cli.commands.info.description') as string)
  .action(async (target) => {
    const opts = program.opts();
    const { fileKey } = parseTarget(target);

    console.log(chalk.blue((i18n.t('cli.commands.info.fetching') as string) + ': ' + fileKey));

    try {
      const client = await getClient(opts.token);
      const file = await client.getFile(fileKey, undefined, 1);

      console.log(chalk.green(`\n📄 ${file.name}`));
      console.log(chalk.gray(`   ${i18n.t('cli.commands.info.lastModified') as string}: ${file.lastModified}`));
      console.log(chalk.gray(`   ${i18n.t('cli.commands.info.version') as string}: ${file.version}`));
      console.log('');

      const pages = file.document.children || [];
      console.log(chalk.cyan((i18n.t('cli.commands.info.pages') as string) + ` (${pages.length}):`));
      pages.forEach((page, i) => {
        console.log(
          `  ${i + 1}. ${chalk.bold(page.name)} (${page.children?.length || 0} ${i18n.t('cli.commands.info.children') as string})`,
        );
        console.log(chalk.gray(`     ID: ${page.id}`));
      });

      console.log('');
      console.log(chalk.cyan((i18n.t('cli.commands.info.stats') as string) + ':'));
      console.log(`  ${i18n.t('cli.commands.info.components') as string}: ${Object.keys(file.components).length}`);
      console.log(
        `  ${i18n.t('cli.commands.info.componentSets') as string}: ${Object.keys(file.componentSets).length}`,
      );
      console.log(`  ${i18n.t('cli.commands.info.styles') as string}: ${Object.keys(file.styles).length}`);
    } catch (error) {
      console.error(
        chalk.red(
          (i18n.t('cli.commands.info.failed') as string) +
            ': ' +
            (error instanceof Error ? error.message : String(error)),
        ),
      );
      process.exit(1);
    }
  });

// ============= 命令: 提取 Tokens =============

program
  .command('sync <url-or-filekey>')
  .description(i18n.t('cli.commands.sync.description') as string)
  .option('-n, --node <nodeId>', i18n.t('cli.commands.sync.node') as string)
  .option('--format <format>', i18n.t('cli.commands.sync.format') as string, 'oklch')
  .option('--spacing-unit <unit>', i18n.t('cli.commands.sync.spacingUnit') as string, 'px')
  .option('--prefix <prefix>', i18n.t('cli.commands.sync.prefix') as string)
  .option('--output-format <format>', i18n.t('cli.commands.sync.outputFormat') as string, 'all')
  .option('--file-name <name>', i18n.t('cli.commands.sync.fileName') as string)
  .action(async (target, cmdOptions) => {
    const opts = program.opts();
    const { fileKey, nodeId: urlNodeId } = parseTarget(target);
    const nodeId = cmdOptions.node || urlNodeId;

    const spinner = ora(chalk.blue(i18n.t('cli.commands.sync.syncing') as string)).start();
    console.log(chalk.gray(`${i18n.t('cli.commands.sync.file') as string}: ${fileKey}`));
    if (nodeId) console.log(chalk.gray(`${i18n.t('cli.commands.sync.node') as string}: ${nodeId}`));

    const startTime = Date.now();

    try {
      const client = await getClient(opts.token);
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

      spinner.succeed(chalk.green((i18n.t('cli.commands.sync.completed') as string) + ` (${duration}s)`));
      console.log('');
      console.log(chalk.cyan((i18n.t('cli.commands.sync.stats') as string) + ':'));
      console.log(`  ${i18n.t('cli.commands.sync.colors') as string}: ${Object.keys(tokens.colors).length}`);
      console.log(`  ${i18n.t('cli.commands.sync.spacing') as string}: ${Object.keys(tokens.spacing).length}`);
      console.log(`  ${i18n.t('cli.commands.sync.radius') as string}: ${Object.keys(tokens.radius).length}`);
      console.log(`  ${i18n.t('cli.commands.sync.shadows') as string}: ${Object.keys(tokens.shadows).length}`);
      console.log(`  ${i18n.t('cli.commands.sync.typography') as string}: ${Object.keys(tokens.typography).length}`);
      console.log('');
      console.log(chalk.cyan((i18n.t('cli.commands.sync.outputFiles') as string) + ':'));
      files.forEach((f) => console.log(`  ${chalk.gray(f)}`));

      console.log('');
      console.log(chalk.yellow(i18n.t('cli.commands.sync.importHint') as string));
    } catch (error) {
      spinner.fail(
        chalk.red(
          (i18n.t('cli.commands.sync.failed') as string) +
            ': ' +
            (error instanceof Error ? error.message : String(error)),
        ),
      );
      process.exit(1);
    }
  });

// ============= 命令: 生成组件 =============

program
  .command('component <url-or-figma-url>')
  .description(i18n.t('cli.commands.component.description') as string)
  .option('-n, --name <name>', i18n.t('cli.commands.component.name') as string)
  .option('-N, --node <nodeId>', i18n.t('cli.commands.sync.node') as string)
  .option('--js', i18n.t('cli.commands.component.js') as string)
  .option('--style <format>', i18n.t('cli.commands.component.style') as string, 'tailwind')
  .option('--no-children', i18n.t('cli.commands.component.noChildren') as string)
  .option('--output <dir>', i18n.t('cli.commands.component.output') as string)
  .action(async (target, cmdOptions) => {
    const opts = program.opts();
    const { fileKey, nodeId: urlNodeId } = parseTarget(target);
    const nodeId = cmdOptions.node || urlNodeId;

    if (!nodeId) {
      console.error(chalk.red(i18n.t('cli.commands.component.noNodeId') as string));
      process.exit(1);
    }

    console.log(chalk.blue(i18n.t('cli.commands.component.generating') as string));
    console.log(chalk.gray(`${i18n.t('cli.commands.sync.file') as string}: ${fileKey}`));
    console.log(chalk.gray(`${i18n.t('cli.commands.sync.node') as string}: ${nodeId}`));

    try {
      const client = await getClient(opts.token);
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

        console.log(chalk.green(`\n✅ ${i18n.t('cli.commands.component.completed') as string}: ${component.name}`));
        console.log('');
        console.log(chalk.cyan((i18n.t('cli.commands.sync.outputFiles') as string) + ':'));
        files.forEach((f) => console.log(`  ${chalk.gray(f)}`));
      } else {
        // 输出到控制台
        console.log(chalk.green(`\n✅ ${i18n.t('cli.commands.component.completed') as string}: ${component.name}`));
        console.log('');
        console.log(chalk.cyan((i18n.t('cli.commands.component.code') as string) + ':'));
        console.log(chalk.gray('─'.repeat(60)));
        console.log(component.code);
        console.log(chalk.gray('─'.repeat(60)));
      }
    } catch (error) {
      console.error(
        chalk.red(
          (i18n.t('cli.commands.component.failed') as string) +
            ': ' +
            (error instanceof Error ? error.message : String(error)),
        ),
      );
      process.exit(1);
    }
  });

// ============= 命令: 截图 =============

program
  .command('screenshot <url-or-filekey>')
  .description(i18n.t('cli.commands.screenshot.description') as string)
  .option('-n, --node <nodeId>', i18n.t('cli.commands.sync.node') as string)
  .option('--format <format>', i18n.t('cli.commands.screenshot.format') as string, 'png')
  .option('--scale <scale>', i18n.t('cli.commands.screenshot.scale') as string, '2')
  .option('--download <dir>', i18n.t('cli.commands.screenshot.download') as string)
  .action(async (target, cmdOptions) => {
    const opts = program.opts();
    const { fileKey, nodeId: urlNodeId } = parseTarget(target);
    const nodeId = cmdOptions.node || urlNodeId;

    if (!nodeId) {
      console.error(chalk.red(i18n.t('cli.commands.screenshot.noNodeId') as string));
      process.exit(1);
    }

    const spinner = ora(chalk.blue(i18n.t('cli.commands.screenshot.fetching') as string)).start();

    try {
      const client = await getClient(opts.token);
      const result = await client.getImages(
        fileKey,
        [nodeId],
        cmdOptions.format,
        Number.parseInt(cmdOptions.scale, 10),
      );

      const imageUrl = result.images[nodeId];
      if (!imageUrl) {
        spinner.fail(chalk.red(i18n.t('cli.commands.screenshot.failed') as string));
        process.exit(1);
      }

      spinner.succeed(chalk.green((i18n.t('cli.commands.screenshot.url') as string) + ':'));
      console.log(chalk.cyan(imageUrl));

      if (cmdOptions.download) {
        const downloadDir = path.resolve(cmdOptions.download);
        await fs.ensureDir(downloadDir);

        const downloadSpinner = ora(chalk.blue(i18n.t('cli.commands.screenshot.downloading') as string)).start();
        const imageBuffer = await client.downloadImage(imageUrl);
        const fileName = `figma-${nodeId.replace(':', '-')}-${Date.now()}.${cmdOptions.format}`;
        const filePath = path.join(downloadDir, fileName);
        await fs.writeFile(filePath, imageBuffer);

        downloadSpinner.succeed(chalk.green((i18n.t('cli.commands.screenshot.saved') as string) + `: ${filePath}`));
      }
    } catch (error) {
      spinner.fail(
        chalk.red(
          (i18n.t('cli.commands.screenshot.failed') as string) +
            ': ' +
            (error instanceof Error ? error.message : String(error)),
        ),
      );
      process.exit(1);
    }
  });

// ============= 命令: 获取元数据概览 (v2.0) =============

program
  .command('metadata <url-or-filekey>')
  .description(i18n.t('cli.commands.metadata.description') as string)
  .option('-n, --node <nodeId>', i18n.t('cli.commands.sync.node') as string)
  .option('-d, --depth <depth>', i18n.t('cli.commands.metadata.depth') as string, '1')
  .action(async (target, cmdOptions) => {
    const opts = program.opts();
    const { fileKey, nodeId: urlNodeId } = parseTarget(target);
    const nodeId = cmdOptions.node || urlNodeId;
    const depth = Number.parseInt(cmdOptions.depth, 10) || 1;

    const spinner = ora(chalk.blue(i18n.t('cli.commands.metadata.fetching') as string)).start();
    console.log(
      chalk.gray(
        `${i18n.t('cli.commands.sync.file') as string}: ${fileKey}${nodeId ? `, ${i18n.t('cli.commands.sync.node') as string}: ${nodeId}` : ''}, ${i18n.t('cli.commands.metadata.depth') as string}: ${depth}`,
      ),
    );

    try {
      const client = await getClient(opts.token);
      const ctxService = createDesignContextService(client);
      const metadata = await ctxService.getMetadata(fileKey, nodeId, depth);

      spinner.succeed(chalk.green(`📋 ${metadata.name}`));
      console.log(chalk.gray(`   ${i18n.t('cli.commands.info.type') as string}: ${metadata.type}`));
      console.log(
        chalk.gray(
          `   ${i18n.t('cli.commands.metadata.size') as string}: ${Math.round(metadata.size.width)} × ${Math.round(metadata.size.height)}`,
        ),
      );
      console.log(chalk.gray(`   ${i18n.t('cli.commands.metadata.directChildren') as string}: ${metadata.childCount}`));
      console.log(
        chalk.gray(`   ${i18n.t('cli.commands.metadata.colorsUsed') as string}: ${metadata.colorsUsed.length}`),
      );
      console.log(chalk.gray(`   ${i18n.t('cli.commands.metadata.textNodes') as string}: ${metadata.textNodeCount}`));
      console.log(chalk.gray(`   ${i18n.t('cli.commands.metadata.images') as string}: ${metadata.imageCount}`));
      console.log('');

      if (metadata.children.length > 0) {
        console.log(chalk.cyan(`${i18n.t('cli.commands.metadata.sections') as string} (${metadata.children.length}):`));
        console.log(
          ((((((((((('   #  ' + i18n.t('cli.commands.metadata.nameHeader')) as string) +
            '  ' +
            i18n.t('cli.commands.metadata.typeHeader')) as string) +
            '  ' +
            i18n.t('cli.commands.metadata.semanticHeader')) as string) +
            '  ' +
            i18n.t('cli.commands.metadata.sizeHeader')) as string) +
            '  ' +
            i18n.t('cli.commands.metadata.childrenHeader')) as string) +
            '  ' +
            i18n.t('cli.commands.metadata.componentHeader')) as string,
        );
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
        console.log(
          chalk.cyan(
            `${i18n.t('cli.commands.metadata.colorsUsed') as string} (${metadata.colorsUsed.length}, ${i18n.t('cli.commands.metadata.top15') as string}):`,
          ),
        );
        metadata.colorsUsed.slice(0, 15).forEach((c) => console.log(`  - ${c}`));
        if (metadata.colorsUsed.length > 15)
          console.log(
            chalk.gray(
              `  ... ${i18n.t('cli.commands.metadata.totalPrefix') as string} ${metadata.colorsUsed.length} ${i18n.t('cli.commands.metadata.totalSuffix') as string}`,
            ),
          );
      }
    } catch (error) {
      spinner.fail(
        chalk.red(
          (i18n.t('cli.commands.metadata.failed') as string) +
            ': ' +
            (error instanceof Error ? error.message : String(error)),
        ),
      );
      process.exit(1);
    }
  });

// ============= 命令: 设计规范检查 (v1.2.0) =============

program
  .command('lint <url-or-filekey>')
  .description(i18n.t('cli.commands.lint.description') as string)
  .option('-n, --node <nodeId>', i18n.t('cli.commands.lint.node') as string)
  .option('-d, --depth <depth>', i18n.t('cli.commands.lint.depth') as string, '15')
  .option('--format <format>', '输出格式 (markdown/json)', 'markdown')
  .option('--output <file>', i18n.t('cli.commands.structured.output') as string)
  .action(async (target, cmdOptions) => {
    const opts = program.opts();
    const { fileKey, nodeId: urlNodeId } = parseTarget(target);
    const nodeId = cmdOptions.node || urlNodeId;
    const maxDepth = Number.parseInt(cmdOptions.depth, 10) || 8;

    const spinner = ora(chalk.blue(i18n.t('cli.commands.lint.checking') as string)).start();
    console.log(
      chalk.gray(
        `${i18n.t('cli.commands.sync.file') as string}: ${fileKey}${nodeId ? `, ${i18n.t('cli.commands.sync.node') as string}: ${nodeId}` : ''}, ${i18n.t('cli.commands.metadata.depth') as string}: ${maxDepth}`,
      ),
    );

    const startTime = Date.now();

    try {
      const client = await getClient(opts.token);
      const ctxService = createDesignContextService(client);
      const linter = createDesignLinter();

      let nodesToLint: ProcessedNode[] = [];

      console.log(chalk.gray(('  ↳ ' + i18n.t('cli.commands.lint.getContext')) as string));
      if (nodeId) {
        const context = await ctxService.getDesignContext(fileKey, nodeId, maxDepth);
        nodesToLint = [context.node];
      } else {
        const file = await client.getFile(fileKey, undefined, 2);
        const pages = file.document.children || [];
        for (const page of pages) {
          try {
            const context = await ctxService.getDesignContext(fileKey, page.id, maxDepth);
            nodesToLint.push(context.node);
          } catch (err) {
            // 单页获取失败时跳过该页继续处理
            console.warn(chalk.yellow(`  ↳ Skipped page ${page.id}: ${err instanceof Error ? err.message : err}`));
          }
        }
      }

      console.log(chalk.gray(('  ↳ ' + i18n.t('cli.commands.lint.running')) as string));
      const result = linter.lint(nodesToLint);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      spinner.succeed(chalk.green((i18n.t('cli.commands.lint.completed') as string) + ` (${duration}s)`));
      console.log('');

      function getScoreEmoji(score: number): string {
        if (score >= 90) return '🎉';
        if (score >= 80) return '✅';
        if (score >= 60) return '🔶';
        if (score >= 40) return '🔶';
        return '❌';
      }

      function getScoreRating(score: number): string {
        if (score >= 90) return i18n.t('cli.commands.lint.scoreExcellent') as string;
        if (score >= 80) return i18n.t('cli.commands.lint.scoreGood') as string;
        if (score >= 60) return i18n.t('cli.commands.lint.scorePass') as string;
        if (score >= 40) return i18n.t('cli.commands.lint.scorePoor') as string;
        return i18n.t('cli.commands.lint.scoreBad') as string;
      }

      const scoreEmoji = getScoreEmoji(result.score);
      const rating = getScoreRating(result.score);

      console.log(
        chalk.cyan(
          `${scoreEmoji} ${i18n.t('cli.commands.lint.score') as string}: ${chalk.bold(result.score)}/100 (${rating})`,
        ),
      );
      console.log('');
      console.log(chalk.gray(`   ${i18n.t('cli.commands.sync.file') as string}: ${result.totalNodes} 个节点`));
      console.log(chalk.gray(`   ${i18n.t('cli.commands.lint.errors') as string}: ${result.errorCount}`));
      console.log(chalk.gray(`   ${i18n.t('cli.commands.lint.warnings') as string}: ${result.warningCount}`));
      console.log(chalk.gray(`   ${i18n.t('cli.commands.lint.infos') as string}: ${result.infoCount}`));
      console.log('');

      if (result.score < 80) {
        console.log(chalk.yellow(i18n.t('cli.commands.lint.hint') as string));
        console.log('');
      }

      if (cmdOptions.output) {
        const outPath = path.resolve(cmdOptions.output);
        await fs.ensureDir(path.dirname(outPath));
        const outputContent = cmdOptions.format === 'json' ? JSON.stringify(result, null, 2) : result.markdownReport;
        await fs.writeFile(outPath, outputContent, 'utf-8');
        console.log(chalk.green(`📄 报告已保存到: ${outPath}`));
      } else {
        console.log(chalk.cyan('─'.repeat(70)));
        if (cmdOptions.format === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(result.markdownReport);
        }
        console.log(chalk.cyan('─'.repeat(70)));
      }
    } catch (error) {
      spinner.fail(
        chalk.red(
          (i18n.t('cli.commands.lint.failed') as string) +
            ': ' +
            (error instanceof Error ? error.message : String(error)),
        ),
      );
      process.exit(1);
    }
  });

// ============= 命令: 获取框架无关结构化数据 (v1.1.0) =============

program
  .command('structured <url-or-filekey>')
  .description(i18n.t('cli.commands.structured.description') as string)
  .option('-n, --node <nodeId>', i18n.t('cli.commands.sync.node') as string)
  .option('--depth <depth>', i18n.t('cli.commands.structured.depth') as string, '15')
  .option('--format <format>', i18n.t('cli.commands.structured.format') as string, 'pretty')
  .option('--output <file>', i18n.t('cli.commands.structured.output') as string)
  .action(async (target, cmdOptions) => {
    const opts = program.opts();
    const { fileKey, nodeId: urlNodeId } = parseTarget(target);
    const nodeId = cmdOptions.node || urlNodeId;
    const maxDepth = Number.parseInt(cmdOptions.depth, 10) || 8;
    const isJsonFormat = cmdOptions.format === 'json';

    if (!nodeId) {
      console.error(chalk.red(i18n.t('cli.commands.structured.noNodeId') as string));
      process.exit(1);
    }

    // JSON 模式下，进度信息输出到 stderr，避免污染 stdout 的 JSON 数据
    const log = isJsonFormat ? (...args: unknown[]) => console.error(...args) : console.log;
    const spinner = ora({
      text: chalk.blue(i18n.t('cli.commands.structured.fetching') as string),
      stream: isJsonFormat ? process.stderr : process.stdout,
    }).start();
    log(
      chalk.gray(
        `${i18n.t('cli.commands.sync.file') as string}: ${fileKey}, ${i18n.t('cli.commands.sync.node') as string}: ${nodeId}, ${i18n.t('cli.commands.metadata.depth') as string}: ${maxDepth}`,
      ),
    );

    const startTime = Date.now();

    try {
      const client = await getClient(opts.token);
      const ctxService = createDesignContextService(client);

      log(chalk.gray(('  ↳ ' + i18n.t('cli.commands.structured.getContext')) as string));
      const context = await ctxService.getDesignContext(fileKey, nodeId, maxDepth);

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      function countNodes(n: { children?: unknown[] }): number {
        let c = 1;
        if (n.children) for (const child of n.children as Array<{ children?: unknown[] }>) c += countNodes(child);
        return c;
      }

      const nodeCount = countNodes(context.node);
      const structuredNode = toStructuredNode(context.node);
      const output = isJsonFormat ? JSON.stringify(structuredNode, null, 2) : formatStructuredPretty(structuredNode);

      if (cmdOptions.output) {
        const outPath = path.resolve(cmdOptions.output);
        await fs.ensureDir(path.dirname(outPath));
        await fs.writeFile(outPath, output, 'utf-8');
        spinner.succeed(
          chalk.green((i18n.t('cli.commands.structured.saved') as string) + ` (${duration}s): ${outPath}`),
        );
        log(
          chalk.gray(
            `   ${i18n.t('cli.commands.structured.nodeCount') as string}: ${nodeCount}, ${i18n.t('cli.commands.structured.assets') as string}: ${context.assets.length}, ${i18n.t('cli.commands.structured.text') as string}: ${context.textNodes.length}`,
          ),
        );
      } else if (isJsonFormat) {
        // JSON 模式：停止 spinner 到 stderr，仅输出纯 JSON 到 stdout
        spinner.stop();
        process.stdout.write(output + '\n');
      } else {
        spinner.succeed(
          chalk.green(
            (i18n.t('cli.commands.structured.completed') as string) + ` (${duration}s): ${context.node.name}`,
          ),
        );
        log(
          chalk.gray(
            `   ${i18n.t('cli.commands.structured.nodeCount') as string}: ${nodeCount}, ${i18n.t('cli.commands.structured.assets') as string}: ${context.assets.length}, ${i18n.t('cli.commands.structured.text') as string}: ${context.textNodes.length}`,
          ),
        );
        log('');
        log(chalk.cyan('─'.repeat(70)));
        log(output);
        log(chalk.cyan('─'.repeat(70)));
      }
    } catch (error) {
      spinner.fail(
        chalk.red(
          (i18n.t('cli.commands.structured.failed') as string) +
            ': ' +
            (error instanceof Error ? error.message : String(error)),
        ),
      );
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
      styleParts.push(
        `bg=#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`,
      );
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
    lines.push(
      `${pad}  asset: ${node.asset.name} (${node.asset.type}/${node.asset.format}, ${node.asset.width}×${node.asset.height})`,
    );
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

// ============= 命令: 一键生成 JSX/Vue (v2.0) =============

program
  .command('jsx <url-or-filekey>')
  .description(i18n.t('cli.commands.jsx.description') as string)
  .option('-n, --node <nodeId>', i18n.t('cli.commands.sync.node') as string)
  .option('--name <name>', i18n.t('cli.commands.component.name') as string)
  .option('--scene <scene>', i18n.t('cli.commands.jsx.scene') as string)
  .option('--depth <depth>', i18n.t('cli.commands.structured.depth') as string, '15')
  .option('--output <file>', i18n.t('cli.commands.structured.output') as string)
  .option('--framework <framework>', i18n.t('cli.commands.jsx.framework') as string, 'react')
  .option('--style <styleFormat>', i18n.t('cli.commands.jsx.style') as string, 'tailwind')
  .option('--skip-lint', i18n.t('cli.commands.jsx.skipLint') as string)
  .option('--inline-svg', '内联渲染 SVG 图标节点（v1.4.0 新增，默认开启）', true)
  .action(async (target, cmdOptions) => {
    const opts = program.opts();
    const { fileKey, nodeId: urlNodeId } = parseTarget(target);
    const nodeId = cmdOptions.node || urlNodeId;
    // 默认深度提高到 15 层，支持深层嵌套节点（v1.4.0 优化）
    const maxDepth = Number.parseInt(cmdOptions.depth, 10) || 15;
    const framework = cmdOptions.framework === 'vue' ? 'vue' : 'react';

    if (!nodeId) {
      console.error(chalk.red(i18n.t('cli.commands.jsx.noNodeId') as string));
      process.exit(1);
    }

    const spinner = ora(chalk.blue(`Generating ${framework.toUpperCase()} component...`)).start();
    console.log(
      chalk.gray(
        `${i18n.t('cli.commands.sync.file') as string}: ${fileKey}, ${i18n.t('cli.commands.sync.node') as string}: ${nodeId}, ${i18n.t('cli.commands.metadata.depth') as string}: ${maxDepth}, framework: ${framework}, style: ${cmdOptions.style}`,
      ),
    );

    const startTime = Date.now();

    try {
      const client = await getClient(opts.token);
      const ctxService = createDesignContextService(client);
      const codeGen = createCodeGenerator(client);
      const vueGen = createVueGenerator(client);
      const componentMapper = createComponentMapper();

      // 1. 获取精简设计上下文
      console.log(chalk.gray(('  ↳ ' + i18n.t('cli.commands.jsx.getContext')) as string));
      const ctx = await ctxService.getDesignContext(fileKey, nodeId, maxDepth);

      // v1.4.0 新增：自动检测组件库
      const libDetection = componentMapper.detectLibrary();
      if (libDetection.library !== 'none') {
        console.log(chalk.cyan(`  ↳ 检测到组件库: ${libDetection.library} (${libDetection.reason})`));
        const matches = componentMapper.matchComponentsInTree(ctx.node, libDetection.library);
        if (matches.length > 0) {
          console.log(chalk.green(`     匹配到 ${matches.length} 个可复用组件:`));
          matches.slice(0, 5).forEach((m) => {
            console.log(
              `     • ${m.componentName} (置信度: ${Math.round(m.confidence * 100)}%) → import from ${m.importPath}`,
            );
          });
        }
      }

      // 2. 可选：设计规范检查
      if (!cmdOptions.skipLint) {
        try {
          console.log(chalk.gray('  ↳ 代码还原质量预检...'));
          const linter = createDesignLinter();
          const lintResult = linter.lint(ctx.node);
          if (lintResult.errorCount > 0 || lintResult.warningCount > 3) {
            const scoreEmoji =
              lintResult.score >= 90 ? '🎉' : lintResult.score >= 80 ? '✅' : lintResult.score >= 60 ? '🔶' : '❌';
            console.log(
              chalk.yellow(
                `  ${scoreEmoji} 代码还原质量评分: ${lintResult.score}/100，发现 ${lintResult.errorCount} 个错误、${lintResult.warningCount} 个警告`,
              ),
            );
            if (lintResult.score < 80) {
              console.log(chalk.gray('     💡 建议先运行 figma-dev lint 查看详细报告，修复问题后再生成代码'));
            }
          }
        } catch (err) {
          // Lint 预检失败不应阻断代码生成，仅输出提示
          console.warn(chalk.yellow(`  ↳ Lint 预检失败（已跳过）: ${err instanceof Error ? err.message : err}`));
        }
      }

      // 3. 生成代码（React 或 Vue）
      console.log(chalk.gray(`  ↳ Generating ${framework.toUpperCase()} code...`));
      let result: CodeGenResult;

      if (framework === 'vue') {
        const vueResult = await vueGen.generateFromContext(ctx, {
          componentName: cmdOptions.name,
          sceneName: cmdOptions.scene,
          usePublicCdn: true,
          styleFormat: cmdOptions.style === 'unocss' ? 'unocss' : 'tailwind',
        });
        result = vueResult as unknown as CodeGenResult;
      } else {
        result = (await codeGen.generateJsxFromContext(ctx, {
          componentName: cmdOptions.name,
          sceneName: cmdOptions.scene,
          usePublicCdn: true,
        })) as unknown as CodeGenResult;
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      // 统计
      function countNodes(n: { children?: unknown[] }): number {
        let c = 1;
        if (n.children) for (const child of n.children as Array<{ children?: unknown[] }>) c += countNodes(child);
        return c;
      }

      spinner.succeed(
        chalk.green((i18n.t('cli.commands.jsx.completed') as string) + ` (${duration}s): ${result.componentName}`),
      );
      console.log(
        chalk.gray(
          `   ${i18n.t('cli.commands.structured.nodeCount') as string}: ${countNodes(ctx.node)}, ${i18n.t('cli.commands.structured.assets') as string}: ${ctx.assets.length}, ${i18n.t('cli.commands.structured.text') as string}: ${ctx.textNodes.length}`,
        ),
      );

      if (result.reports) {
        // v1.2.0 新增：显示增强报告
        const reports = result.reports;
        const flexFixes = reports.flexFixes;
        if (flexFixes && (flexFixes.fixedCount ?? flexFixes.totalFixedNodes ?? 0) > 0) {
          const flexCount = flexFixes.fixedCount ?? flexFixes.totalFixedNodes ?? 0;
          console.log(
            chalk.green(
              `\n🔧 ${i18n.t('reports.flex.title') as string}: ${flexCount} ${i18n.t('reports.flex.fixesApplied') as string}`,
            ),
          );
        }
        const a11y = reports.a11y;
        if (a11y) {
          const a11yCount =
            a11y.enhancementsCount ??
            (a11y.semanticTagsCount || 0) + (a11y.buttonsIdentifiedCount || 0) + (a11y.ariaAddedCount || 0);
          if (a11yCount > 0) {
            console.log(
              chalk.green(
                `♿ ${i18n.t('reports.a11y.title') as string}: ${a11yCount} ${i18n.t('reports.a11y.enhancementsApplied') as string}`,
              ),
            );
          }
        }
        const ds = reports.designSystem;
        if (ds) {
          const dsCount =
            ds.suggestionsCount ??
            (ds.colorSuggestions?.length || 0) +
              (ds.spacingTokens?.length || 0) +
              (ds.radiusTokens?.length || 0) +
              (ds.typographySuggestions?.length || 0);
          if (dsCount > 0) {
            console.log(
              chalk.cyan(
                `\n🎨 ${i18n.t('reports.design.title') as string}: ${dsCount} ${i18n.t('reports.design.suggestions') as string}`,
              ),
            );
          }
        }
        const resp = reports.responsive;
        if (resp) {
          const respCount =
            resp.suggestionsCount ??
            (resp.recommendations?.length || 0) +
              (resp.classSuggestions?.length || 0) +
              (resp.layoutSuggestions?.length || 0);
          if (respCount > 0) {
            console.log(
              chalk.cyan(
                `📱 ${i18n.t('reports.responsive.title') as string}: ${respCount} ${i18n.t('reports.responsive.suggestions') as string}`,
              ),
            );
          }
        }
      }

      if ((result.extensionsNeeded || []).length > 0) {
        // 按 type:originalValue 去重，相同值只显示一次
        const seen = new Set<string>();
        const unique = (result.extensionsNeeded as readonly TailwindExtension[]).filter((ext) => {
          const key = `${ext.type}:${ext.originalValue}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        // Tailwind v4 @theme 变量前缀映射
        const prefixMap: Record<string, string> = {
          color: '--color-',
          spacing: '--spacing-',
          radius: '--radius-',
          shadow: '--shadow-',
          'font-size': '--text-',
          'font-weight': '--font-weight-',
        };

        console.log(chalk.yellow(`\n⚠️  ${i18n.t('cli.commands.jsx.themeExtensions') as string} (${unique.length}):`));
        unique.slice(0, 10).forEach((ext) => {
          const prefix = prefixMap[ext.type] || '--color-';
          console.log(`  - @theme inline { ${prefix}${ext.suggestedName}: ${ext.originalValue}; }`);
        });
        if (unique.length > 10) {
          console.log(`  - ... and ${unique.length - 10} more`);
        }
      }

      if ((result.pendingAssets || []).length > 0) {
        const uniqueAssets = (result.pendingAssets as readonly PendingAsset[]).filter(
          (v, i, a) => a.findIndex((x) => x.nodeId === v.nodeId) === i,
        );
        console.log(chalk.cyan(`\n🖼️  ${i18n.t('cli.commands.jsx.assetsNeeded') as string} (${uniqueAssets.length}):`));
        uniqueAssets.forEach((a) => {
          console.log(`  - ${a.nodeId}: ${a.name} (${a.type})`);
        });
        console.log(
          chalk.gray(
            `   ${i18n.t('cli.commands.jsx.downloadHint') as string} figma-dev assets <url> --scene ${cmdOptions.scene || '<scene>'} --nodes <nodeIds>`,
          ),
        );
      }

      const reusableComponents = ctx.componentsUsed.filter((c) => c.instanceCount > 0);
      if (reusableComponents.length > 0) {
        console.log(chalk.magenta(`\n🧩 ${i18n.t('cli.commands.jsx.reusableComponents') as string}:`));
        reusableComponents.forEach((c) => {
          console.log(
            `  - ${c.name} (${i18n.t('cli.commands.jsx.usedTimes') as string} ${c.instanceCount} ${i18n.t('cli.commands.jsx.times') as string}) → @/components/web-official/`,
          );
        });
      }

      // 输出代码
      console.log('');
      console.log(chalk.cyan('─'.repeat(70)));

      if (cmdOptions.output) {
        const outPath = path.resolve(cmdOptions.output);
        await fs.ensureDir(path.dirname(outPath));
        await fs.writeFile(outPath, result.code, 'utf-8');
        console.log(chalk.green((i18n.t('cli.commands.jsx.codeSaved') as string) + `: ${outPath}`));
      } else {
        console.log(result.code);
      }
      console.log(chalk.cyan('─'.repeat(70)));
    } catch (error) {
      spinner.fail(
        chalk.red(
          (i18n.t('cli.commands.jsx.failed') as string) +
            ': ' +
            (error instanceof Error ? error.message : String(error)),
        ),
      );
      process.exit(1);
    }
  });

// ============= 命令: 下载资源 (v2.0) =============

program
  .command('assets <url-or-filekey>')
  .description(i18n.t('cli.commands.assets.description') as string)
  .option('-n, --node <nodeId>', i18n.t('cli.commands.assets.node') as string)
  .option('--nodes <nodeIds>', i18n.t('cli.commands.assets.nodes') as string)
  .option('--scene <scene>', i18n.t('cli.commands.assets.scene') as string, 'default')
  .option('--project-root <dir>', i18n.t('cli.commands.assets.projectRoot') as string)
  .option('--scale <scale>', i18n.t('cli.commands.screenshot.scale') as string, '2')
  .option('--svg-format <format>', i18n.t('cli.commands.assets.svgFormat') as string, 'svg')
  .action(async (target, cmdOptions) => {
    const opts = program.opts();
    const { fileKey, nodeId: urlNodeId } = parseTarget(target);

    // 收集所有 nodeId
    const nodeIds: string[] = [];
    if (urlNodeId) nodeIds.push(urlNodeId);
    if (cmdOptions.node) nodeIds.push(...cmdOptions.node.split(','));
    if (cmdOptions.nodes) nodeIds.push(...cmdOptions.nodes.split(','));

    if (nodeIds.length === 0) {
      console.error(chalk.red(i18n.t('cli.commands.assets.noNodeId') as string));
      process.exit(1);
    }

    const scale = Number.parseInt(cmdOptions.scale, 10) || 2;
    const sceneName = cmdOptions.scene || 'default';

    const spinner = ora(chalk.blue(i18n.t('cli.commands.assets.downloading') as string)).start();
    console.log(
      chalk.gray(
        `${i18n.t('cli.commands.sync.file') as string}: ${fileKey}, ${i18n.t('cli.commands.assets.sceneName') as string}: ${sceneName}, ${i18n.t('cli.commands.assets.nodeCount') as string}: ${nodeIds.length}, ${i18n.t('cli.commands.screenshot.scale') as string}: ${scale}x`,
      ),
    );

    try {
      const client = await getClient(opts.token);

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
      console.log(chalk.gray(`${i18n.t('cli.commands.assets.projectRootDetected') as string}: ${projectRoot}`));

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
        spinner.warn(chalk.yellow(i18n.t('cli.commands.assets.noAssets') as string));
        return;
      }

      console.log(
        chalk.gray(
          `${i18n.t('cli.commands.assets.foundAssets') as string} ${uniqueAssets.length} ${i18n.t('cli.commands.assets.assets') as string}`,
        ),
      );

      const downloader = createAssetDownloader(client, {
        projectRoot,
        scale: scale as 1 | 2 | 3 | 4,
        svgFormat: cmdOptions.svgFormat as 'svg' | 'png',
      });

      const results = await downloader.downloadAssets(fileKey, sceneName, uniqueAssets);

      spinner.succeed(chalk.green((i18n.t('cli.commands.assets.completed') as string) + ':'));
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
      console.log(
        chalk.gray(`\n   ${i18n.t('cli.commands.assets.success') as string}: ${successCount}/${results.length}`),
      );
    } catch (error) {
      spinner.fail(
        chalk.red(
          (i18n.t('cli.commands.assets.failed') as string) +
            ': ' +
            (error instanceof Error ? error.message : String(error)),
        ),
      );
      process.exit(1);
    }
  });

// ============= 命令: 教程 =============

program
  .command('tutorial')
  .alias('help')
  .description(i18n.t('cli.commands.tutorial.description') as string)
  .option('--no-browser', i18n.t('cli.commands.tutorial.noBrowser') as string)
  .action(async (cmdOptions) => {
    const docsUrl = 'https://gitee.com/shanxi-youcha/figma-dev-tools';
    const tokenUrl = 'https://www.figma.com/developers/api#access-tokens';

    console.log(
      boxen(
        chalk.cyan.bold((('📚 ' + i18n.t('cli.commands.tutorial.title')) as string) + '\n\n') +
          chalk.white((('📖 ' + i18n.t('cli.commands.tutorial.docs')) as string) + ':\n') +
          chalk.cyan(`  ${docsUrl}\n\n`) +
          chalk.white((('🔑 ' + i18n.t('cli.commands.tutorial.getToken')) as string) + ':\n') +
          chalk.cyan(`  ${tokenUrl}\n\n`) +
          chalk.white((('💡 ' + i18n.t('cli.commands.tutorial.quickStart')) as string) + ':\n') +
          chalk.gray((('  1. figma-dev wizard      ' + i18n.t('cli.commands.tutorial.step1')) as string) + '\n') +
          chalk.gray((('  2. figma-dev validate    ' + i18n.t('cli.commands.tutorial.step2')) as string) + '\n') +
          chalk.gray((('  3. figma-dev lint <url>  ' + i18n.t('cli.commands.wizard.cmdLint')) as string) + '\n') +
          chalk.gray(('  4. figma-dev jsx <url>   ' + i18n.t('cli.commands.tutorial.step3')) as string),
        { padding: 1, borderColor: 'cyan', margin: { top: 1 } },
      ),
    );

    if (cmdOptions.browser !== false) {
      console.log(chalk.gray(i18n.t('cli.commands.tutorial.openingBrowser') as string));
      await open(docsUrl);
    }
  });

// ============= 命令: MCP Server =============

program
  .command('mcp')
  .description(i18n.t('cli.commands.mcp.description') as string)
  .action(async () => {
    const { main } = await import('../index.js');
    await main();
  });

// ============= 命令: 交互式配置向导 =============

program
  .command('wizard')
  .alias('init')
  .description(i18n.t('cli.commands.wizard.description') as string)
  .option('--gui', i18n.t('gui.guiOption') as string)
  .action(async (cmdOptions) => {
    if (cmdOptions.gui) {
      const { startGuiServer } = await import('../services/gui-server.js');
      try {
        const server = await startGuiServer();
        process.on('SIGINT', () => {
          server.close();
          console.log('');
          console.log(chalk.gray(i18n.t('gui.serverStopped') as string));
          process.exit(0);
        });
        return;
      } catch (error) {
        console.error(
          chalk.red(
            (i18n.t('common.failed') as string) + ': ' + (error instanceof Error ? error.message : String(error)),
          ),
        );
        process.exit(1);
      }
    }
    console.log(
      boxen(
        chalk.cyan.bold((('🎨 ' + i18n.t('cli.commands.wizard.title')) as string) + ' v1.4.0\n\n') +
          chalk.white(i18n.t('cli.commands.wizard.subtitle') as string),
        {
          padding: 1,
          borderColor: 'cyan',
          margin: { top: 1, bottom: 1 },
        },
      ),
    );

    // 步骤 0: 语言选择（v1.2.0 新增）
    const currentLang = i18n.getLanguage();
    const languages = i18n.getSupportedLanguages();
    const langChoices = languages.map((lang) => ({
      name:
        lang.code === currentLang ? `${lang.name} (${i18n.t('cli.commands.lang.currentMarker') as string})` : lang.name,
      value: lang.code,
    }));

    const selectedLang = await select({
      message: i18n.t('config.selectLanguage') as string,
      choices: langChoices,
      default: currentLang,
    });

    if (selectedLang !== currentLang) {
      await i18n.setLanguage(selectedLang);
      console.log(chalk.green((i18n.t('cli.commands.lang.success') as string) + '\n'));
    }

    const tokenStore = createTokenStore();
    const backend = await tokenStore.getBackend();

    // 步骤 1: Token 配置
    const existingTokens = await tokenStore.listTokens();
    const defaultToken = await tokenStore.getDefault();

    let selectedToken: string | null = null;

    if (existingTokens.length > 0) {
      const useExisting = await confirm({
        message:
          (i18n.t('cli.commands.wizard.existingToken') as string) +
          ` (${backend === 'keytar' ? (i18n.t('cli.commands.token.keychain') as string) : (i18n.t('cli.commands.token.encryptedFile') as string)})?`,
        default: true,
      });

      if (useExisting) {
        selectedToken = await select({
          message: i18n.t('cli.commands.wizard.selectToken') as string,
          choices: existingTokens.map((name) => ({
            name: name === defaultToken ? `${name} (${i18n.t('cli.commands.token.default') as string})` : name,
            value: name,
          })),
          default: defaultToken,
        });
        await tokenStore.setDefault(selectedToken);
      }
    }

    if (!selectedToken) {
      console.log('');
      console.log(chalk.cyan((('📝 ' + i18n.t('cli.commands.wizard.howToGetToken')) as string) + ':'));
      console.log(chalk.gray(('   1. ' + i18n.t('cli.commands.wizard.tokenStep1')) as string));
      console.log(chalk.gray(('   2. ' + i18n.t('cli.commands.wizard.tokenStep2')) as string));
      console.log(chalk.gray(('   3. ' + i18n.t('cli.commands.wizard.tokenStep3')) as string));
      console.log('');

      const openBrowser = await confirm({
        message: (i18n.t('cli.commands.wizard.openTokenPage') as string) + '?',
        default: true,
      });
      if (openBrowser) {
        await open('https://www.figma.com/developers/api#access-tokens');
      }

      const tokenValue = await password({
        message: i18n.t('cli.commands.token.pastePrompt') as string,
        validate: (v: string) => {
          if (!v || v.length < 20) return i18n.t('cli.commands.token.invalidLength') as string;
          if (!v.startsWith('figd_')) return i18n.t('cli.commands.token.invalidPrefix') as string;
          return true;
        },
      });

      const tokenName = await input({
        message: i18n.t('cli.commands.wizard.tokenName') as string,
        default: 'default',
      });

      const spinner = ora(i18n.t('cli.commands.wizard.savingToken') as string).start();
      await tokenStore.saveToken(tokenName, tokenValue);
      await tokenStore.setDefault(tokenName);

      try {
        const client = createFigmaClient({ accessToken: tokenValue });
        const userInfo = await client.validateToken();
        if (userInfo) {
          spinner.succeed(
            chalk.green((i18n.t('cli.commands.token.validateSuccess') as string) + ` (${userInfo.email})`),
          );
          selectedToken = tokenName;
        } else {
          spinner.fail(chalk.red(i18n.t('cli.commands.token.validateFailed') as string));
          process.exit(1);
        }
      } catch (error) {
        spinner.fail(
          chalk.red(
            (i18n.t('cli.commands.wizard.tokenValidateError') as string) +
              ': ' +
              (error instanceof Error ? error.message : String(error)),
          ),
        );
        process.exit(1);
      }
    }

    // 步骤 2: 项目配置
    console.log('');
    const framework = await select({
      message: i18n.t('cli.commands.wizard.selectFramework') as string,
      choices: [
        {
          name: (('React + TypeScript + Tailwind CSS (' + i18n.t('cli.commands.wizard.recommended')) as string) + ')',
          value: 'react',
        },
        {
          name: (('Vue 3 (' + i18n.t('cli.commands.wizard.comingSoon')) as string) + ')',
          value: 'vue',
          disabled: (('(' + i18n.t('cli.commands.wizard.stayTuned')) as string) + ')',
        },
        { name: (('HTML/CSS (' + i18n.t('cli.commands.wizard.noFramework')) as string) + ')', value: 'html' },
      ],
      default: 'react',
    });

    const outputDir = await input({
      message: i18n.t('cli.commands.wizard.outputDir') as string,
      default: './src/styles/figma',
    });

    // 创建配置文件
    const configPath = path.resolve('./figma-dev.config.json');
    const envPath = path.resolve('./.env');

    const spinner = ora(i18n.t('cli.commands.wizard.creatingConfig') as string).start();

    const config = {
      $schema: 'https://schema.figma-dev-tools.com/config.json',
      defaultToken: selectedToken || 'default',
      outputDir,
      framework,
      styleFormat: 'tailwind',
      typescript: true,
      colorFormat: 'oklch',
      spacingUnit: 'px',
      importAlias: '@',
      language: i18n.getLanguage(),
    };

    await fs.writeJSON(configPath, config, { spaces: 2 });

    // .env 文件不再需要明文 Token（因为使用安全存储）
    if (!(await fs.pathExists(envPath))) {
      await fs.writeFile(
        envPath,
        '# Figma Dev Tools 配置\n# Token 已安全存储在系统密钥链/加密文件中，无需在此配置\n# 如需覆盖可设置 FIGMA_ACCESS_TOKEN 环境变量\n',
      );
    }

    spinner.succeed(chalk.green(i18n.t('cli.commands.wizard.configComplete') as string));

    // 显示成功信息和下一步指引
    console.log(
      boxen(
        chalk.green.bold((('🎉 ' + i18n.t('cli.commands.wizard.setupComplete')) as string) + '\n\n') +
          chalk.white((i18n.t('cli.commands.wizard.commonCommands') as string) + ':\n') +
          chalk.cyan('  figma-dev validate') +
          chalk.gray((('        ' + i18n.t('cli.commands.wizard.cmdValidate')) as string) + '\n') +
          chalk.cyan('  figma-dev sync <url>') +
          chalk.gray((('      ' + i18n.t('cli.commands.wizard.cmdSync')) as string) + '\n') +
          chalk.cyan('  figma-dev lint <url>') +
          chalk.gray((('      ' + i18n.t('cli.commands.wizard.cmdLint')) as string) + '\n') +
          chalk.cyan('  figma-dev jsx <url>') +
          chalk.gray((('       ' + i18n.t('cli.commands.wizard.cmdJsx')) as string) + '\n') +
          chalk.cyan('  figma-dev assets <url>') +
          chalk.gray((('    ' + i18n.t('cli.commands.wizard.cmdAssets')) as string) + '\n') +
          chalk.cyan('  figma-dev metadata <url>') +
          chalk.gray((('  ' + i18n.t('cli.commands.wizard.cmdMetadata')) as string) + '\n') +
          chalk.cyan('  figma-dev lang switch') +
          chalk.gray((('    ' + i18n.t('cli.commands.wizard.cmdLang')) as string) + '\n') +
          chalk.cyan('  figma-dev tutorial') +
          chalk.gray((('      ' + i18n.t('cli.commands.wizard.cmdTutorial')) as string) + '\n\n') +
          chalk.yellow(('💡 ' + i18n.t('cli.commands.wizard.mcpHint')) as string),
        { padding: 1, borderColor: 'green', margin: { top: 1 } },
      ),
    );
  });

// ============= 命令: GUI 配置向导 (v1.3.2) =============

program
  .command('gui')
  .description(i18n.t('gui.cmdDescription') as string)
  .action(async () => {
    const { startGuiServer } = await import('../services/gui-server.js');
    try {
      const server = await startGuiServer();
      process.on('SIGINT', () => {
        server.close();
        console.log('');
        console.log(chalk.gray(i18n.t('gui.serverStopped') as string));
        process.exit(0);
      });
    } catch (error) {
      console.error(
        chalk.red(
          (i18n.t('common.failed') as string) + ': ' + (error instanceof Error ? error.message : String(error)),
        ),
      );
      process.exit(1);
    }
  });

// ============= 命令: 缓存管理 (v1.4.0 新增) =============

const cacheCmd = program.command('cache').description('管理本地缓存');

cacheCmd
  .command('status')
  .alias('stats')
  .description('查看缓存统计信息')
  .action(async () => {
    const cache = createFigmaCache();
    const stats = await cache.getStats();

    console.log(
      boxen(
        chalk.cyan.bold('📦 本地缓存统计\n\n') +
          chalk.white(`条目数量: ${chalk.bold(stats.totalEntries)}\n`) +
          chalk.white(`缓存大小: ${chalk.bold(formatBytes(stats.totalSize))}\n`) +
          chalk.white(`命中次数: ${chalk.green(stats.hits)}\n`) +
          chalk.white(`未命中次数: ${chalk.yellow(stats.misses)}\n`) +
          chalk.white(`命中率: ${chalk.bold((stats.hitRate * 100).toFixed(1))}%\n`) +
          chalk.white(`LRU 驱逐: ${chalk.gray(stats.evictions)} 次`),
        { padding: 1, borderColor: 'cyan', margin: { top: 1 } },
      ),
    );
  });

cacheCmd
  .command('clear')
  .alias('clean')
  .description('清空所有缓存')
  .option('-f, --force', '强制清空，不确认')
  .action(async (cmdOptions) => {
    if (!cmdOptions.force) {
      const confirmed = await confirm({
        message: '确定要清空所有本地缓存吗？',
        default: false,
      });
      if (!confirmed) {
        console.log(chalk.gray('已取消'));
        return;
      }
    }

    const spinner = ora('正在清空缓存...').start();
    const cache = createFigmaCache();
    await cache.clear();
    spinner.succeed(chalk.green('缓存已清空'));
  });

/**
 * 格式化字节大小
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// ============= 命令: 隐私声明 (v1.4.0 新增) =============

program
  .command('privacy')
  .description('查看隐私承诺声明')
  .action(() => {
    console.log(
      boxen(getPrivacyStatement(), {
        padding: 1,
        borderColor: 'green',
        margin: { top: 1 },
      }),
    );

    // 检查当前目录 .gitignore
    checkGitignore(process.cwd()).then((result) => {
      if (result.exists && result.envIgnored && result.credentialsIgnored) {
        console.log(chalk.green('✅ 当前项目 .gitignore 配置正确，敏感文件已被忽略'));
      } else {
        console.log(chalk.yellow('\n⚠️  安全建议：'));
        if (!result.exists) {
          console.log(chalk.yellow('  - 未找到 .gitignore 文件，建议创建'));
        }
        if (result.suggestedRules.length > 0) {
          console.log(chalk.yellow('  - 建议在 .gitignore 中添加以下规则：'));
          result.suggestedRules.forEach((rule) => {
            console.log(chalk.cyan(`    ${rule}`));
          });
        }
      }
    });
  });

// ============= Shell 自动补全 =============

program.addHelpText(
  'after',
  chalk.gray(`
${i18n.t('cli.completion.title') as string}:
  ${i18n.t('cli.completion.install') as string}:
    ${chalk.cyan('figma-dev completion >> ~/.zshrc')}     # Zsh
    ${chalk.cyan('figma-dev completion >> ~/.bashrc')}    # Bash
    ${chalk.cyan('figma-dev completion | Out-String | Invoke-Expression')}  # PowerShell

  ${i18n.t('cli.completion.afterInstall') as string}
`),
);

// Shell 自动补全命令
program
  .command('completion', { hidden: true })
  .description(i18n.t('cli.completion.description') as string)
  .action(() => {
    const shell = process.env.SHELL?.includes('zsh') ? 'zsh' : process.env.SHELL?.includes('fish') ? 'fish' : 'bash';
    // Commander 内置补全 - 简单实现
    const compLog = (msg: string) => console.log(msg);

    if (shell === 'zsh') {
      compLog(`# Figma Dev Tools Zsh Completion`);
      compLog(`# 追加到 ~/.zshrc 即可生效:`);
      compLog(`#   figma-dev completion >> ~/.zshrc && source ~/.zshrc`);
      compLog(``);
      compLog(`#compdef figma-dev figma-dev-tools`);
      compLog(`_figma_dev_completion() {`);
      compLog(`  local -a commands`);
      compLog(`  commands=(`);
      compLog(`    'wizard:交互式配置向导'`);
      compLog(`    'gui:GUI 可视化配置向导'`);
      compLog(`    'lang:语言设置'`);
      compLog(`    'validate:验证 Figma Token'`);
      compLog(`    'token:管理 Access Token（set/get/list/delete/default）'`);
      compLog(`    'sync:同步设计 Tokens'`);
      compLog(`    'lint:检查设计规范'`);
      compLog(`    'jsx:生成 React+Tailwind TSX 代码'`);
      compLog(`    'component:生成 React 组件'`);
      compLog(`    'assets:下载设计资源'`);
      compLog(`    'metadata:查看设计稿概览'`);
      compLog(`    'structured:获取结构化设计数据'`);
      compLog(`    'screenshot:获取节点截图'`);
      compLog(`    'info:查看文件信息'`);
      compLog(`    'cache:管理本地缓存（status/clear）'`);
      compLog(`    'privacy:查看隐私承诺声明'`);
      compLog(`    'mcp:启动 MCP 服务器'`);
      compLog(`    'tutorial:查看教程文档'`);
      compLog(`    'completion:生成补全脚本'`);
      compLog(`  )`);
      compLog(`  _describe 'command' commands`);
      compLog(`}`);
      compLog(`compdef _figma_dev_completion figma-dev figma-dev-tools`);
    } else if (shell === 'bash') {
      compLog(`# Figma Dev Tools Bash Completion`);
      compLog(`_figma_dev_completion() {`);
      compLog(`  local cur prev commands`);
      compLog(`  COMPREPLY=()`);
      compLog(`  cur="\${COMP_WORDS[COMP_CWORD]}"`);
      compLog(`  prev="\${COMP_WORDS[COMP_CWORD-1]}"`);
      compLog(
        `  commands="wizard gui lang validate token sync lint jsx component assets metadata structured screenshot info cache privacy mcp tutorial completion"`,
      );
      compLog(`  COMPREPLY=( $(compgen -W "\${commands}" -- \${cur}) )`);
      compLog(`  return 0`);
      compLog(`}`);
      compLog(`complete -F _figma_dev_completion figma-dev figma-dev-tools`);
    } else {
      // PowerShell
      compLog(`# Figma Dev Tools PowerShell Completion`);
      compLog(`# 将此输出追加到 $PROFILE 即可生效:`);
      compLog(`#   figma-dev completion >> $PROFILE`);
      compLog(`Register-ArgumentCompleter -Native -CommandName figma-dev,figma-dev-tools -ScriptBlock {`);
      compLog(`  param($wordToComplete, $commandAst, $cursorPosition)`);
      compLog(
        `  @('wizard','gui','lang','validate','token','sync','lint','jsx','component','assets','metadata','structured','screenshot','info','cache','privacy','mcp','tutorial') | Where-Object { $_ -like "$wordToComplete*" }`,
      );
      compLog(`}`);
    }
  });

// ============= 全局选项: -v / --ver =============

const rawArgs = process.argv.slice(2);
if (rawArgs.includes('-v') || rawArgs.includes('--ver')) {
  console.log(chalk.cyan(`figma-dev v${program.version()}`));
  console.log(chalk.gray(i18n.t('cli.description') as string));
  process.exit(0);
}

// ============= 全局选项: --update =============

if (rawArgs.includes('--update')) {
  // 使用 IIFE 处理异步更新逻辑，外层用 process.exit 终止
  void (async () => {
    const spinner = ora(chalk.blue(i18n.t('update.checking') as string)).start();
    try {
      const pkgJson = await fs.readJson(
        path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../package.json'),
      );
      const currentVersion = pkgJson.version as string;

      const response = await fetch('https://registry.npmjs.org/figma-dev-tools/latest');
      if (!response.ok) {
        spinner.fail(chalk.red(i18n.t('update.notFound') as string));
        process.exit(1);
      }
      const data = (await response.json()) as { version: string };
      const latestVersion = data.version;

      spinner.stop();
      console.log(chalk.gray(i18n.t('update.currentVersion', currentVersion) as string));
      console.log(chalk.gray(i18n.t('update.latestVersion', latestVersion) as string));

      if (currentVersion === latestVersion) {
        console.log(`\n${chalk.green(i18n.t('update.alreadyLatest') as string)}`);
        process.exit(0);
      }

      console.log(`\n${chalk.yellow(i18n.t('update.updateAvailable', currentVersion, latestVersion) as string)}`);
      const updateSpinner = ora(chalk.blue(i18n.t('update.updating') as string)).start();
      try {
        execSync('npm install -g figma-dev-tools', { stdio: 'pipe' });
        updateSpinner.succeed(chalk.green(i18n.t('update.success') as string));
      } catch {
        updateSpinner.fail(chalk.red(i18n.t('update.failed') as string));
        console.log(chalk.gray(i18n.t('update.hint') as string));
      }
    } catch (error) {
      const spinner2 = ora();
      spinner2.fail(chalk.red(i18n.t('update.failed') as string) + ': ' + (error instanceof Error ? error.message : String(error)));
      console.log(chalk.gray(i18n.t('update.hint') as string));
    }
    process.exit(0);
  })();
} else {
  // 解析命令行参数
  program.parse();
}
