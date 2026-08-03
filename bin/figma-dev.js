#!/usr/bin/env node
/**
 * Figma Dev Tools CLI 启动器
 *
 * 职责：
 * 1. 解析 --figma-api-key/-t/--token 参数并注入到环境变量（MCP 零配置启动用）
 * 2. 单独处理 install/uninstall 命令（安装脚本不依赖编译产物）
 * 3. 其余所有命令（包括 --help/-h、--version/-V、无参数）均委托给编译后的 dist/cli/index.js
 *    开发模式下（无 dist 目录）使用 tsx 直接运行 src/cli/index.ts
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');

let [, , ...args] = process.argv;

/**
 * 使用 Node.js 子进程运行脚本
 * @param {string} scriptPath - 脚本绝对路径
 * @param {string[]} scriptArgs - 传递给脚本的参数
 * @returns {Promise<void>}
 */
function runNodeScript(scriptPath, scriptArgs) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [scriptPath, ...scriptArgs], {
      cwd: packageRoot,
      stdio: 'inherit',
      env: process.env,
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Process exited with code ${code ?? 1}`));
    });
    proc.on('error', reject);
  });
}

/**
 * 解析并过滤 token 参数，注入到 FIGMA_ACCESS_TOKEN 环境变量
 * 支持 --figma-api-key=xxx、--token=xxx、--figma-api-key <value>、-t <value>、--token <value>
 * @param {string[]} rawArgs
 * @returns {string[]}
 */
function extractTokenArgs(rawArgs) {
  const filteredArgs = [];
  let i = 0;
  while (i < rawArgs.length) {
    const arg = rawArgs[i];

    if (arg.startsWith('--figma-api-key=') || arg.startsWith('--figma-api_key=')) {
      process.env.FIGMA_ACCESS_TOKEN = arg.split('=')[1];
      i++;
      continue;
    }
    if (arg.startsWith('--token=')) {
      process.env.FIGMA_ACCESS_TOKEN = arg.split('=')[1];
      i++;
      continue;
    }

    if (arg === '--figma-api-key' || arg === '--figma-api_key' || arg === '-t' || arg === '--token') {
      if (i + 1 < rawArgs.length) {
        process.env.FIGMA_ACCESS_TOKEN = rawArgs[i + 1];
        i += 2;
        continue;
      }
    }

    filteredArgs.push(arg);
    i++;
  }
  return filteredArgs;
}

async function runCli() {
  args = extractTokenArgs(args);
  const command = args[0];

  if (command === 'install' || command === 'uninstall') {
    const scriptName = command === 'install' ? 'install.mjs' : 'uninstall.mjs';
    const scriptPath = path.join(packageRoot, scriptName);
    if (!fs.existsSync(scriptPath)) {
      console.error(`Error: ${scriptName} not found`);
      process.exit(1);
    }
    try {
      await runNodeScript(scriptPath, args.slice(1));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${command} failed: ${msg}`);
      process.exit(1);
    }
    return;
  }

  const distCli = path.join(packageRoot, 'dist', 'cli', 'index.js');
  const hasDist = fs.existsSync(distCli);

  if (hasDist) {
    try {
      await runNodeScript(distCli, args);
    } catch {
      process.exit(1);
    }
  } else {
    const tsxBin = path.join(
      packageRoot,
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'tsx.cmd' : 'tsx',
    );
    const srcCli = path.join(packageRoot, 'src', 'cli', 'index.ts');

    if (fs.existsSync(tsxBin) && fs.existsSync(srcCli)) {
      console.error('Running with tsx (not compiled)...');
      const proc = spawn(tsxBin, [srcCli, ...args], {
        cwd: packageRoot,
        stdio: 'inherit',
        env: process.env,
      });
      proc.on('close', (code) => process.exit(code ?? 0));
      proc.on('error', (err) => {
        console.error(`Failed to run CLI: ${err.message}`);
        console.error('Try running: npm run build');
        process.exit(1);
      });
    } else {
      console.error('Error: Compiled CLI not found.');
      console.error('Please run: npm install && npm run build');
      console.error(`  Expected: ${distCli}`);
      process.exit(1);
    }
  }
}

runCli().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
