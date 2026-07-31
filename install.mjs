#!/usr/bin/env node
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_NAME = 'figma-dev-tools';
const DIST_INDEX = path.resolve(__dirname, 'dist', 'index.js');
const ENV_FILE = path.resolve(__dirname, '.env');
const ENV_EXAMPLE = path.resolve(__dirname, '.env.example');
const NODE_MODULES = path.resolve(__dirname, 'node_modules');
const PACKAGE_JSON = path.resolve(__dirname, 'package.json');
const PACKAGE_LOCK = path.resolve(__dirname, 'package-lock.json');

const args = process.argv.slice(2);
const flags = {
  force: args.includes('--force') || args.includes('-f'),
  skipNpmInstall: args.includes('--skip-npm-install'),
  skipBuild: args.includes('--skip-build'),
  help: args.includes('--help') || args.includes('-h'),
};

if (flags.help) {
  console.log(`
Figma Dev Tools MCP Installer

Usage:
  node install.mjs [options]
  npx figma-dev-tools install [options]

Options:
  -f, --force              Force rebuild even if dist exists
  --skip-npm-install       Skip npm install step (useful for postinstall)
  --skip-build             Skip build step
  -h, --help               Show this help message
`);
  process.exit(0);
}

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

const c = (code, text) => `${colors[code]}${text}${colors.reset}`;
const log = {
  info: (msg) => console.log(c('cyan', 'ℹ'), msg),
  success: (msg) => console.log(c('green', '✓'), msg),
  warn: (msg) => console.log(c('yellow', '⚠'), msg),
  error: (msg) => console.log(c('red', '✗'), msg),
  step: (msg) => console.log(c('bright', `\n▶ ${msg}`)),
  header: (msg) => console.log(`\n${c('magenta', c('bright', msg))}`),
};

function getHomeDir() {
  return os.homedir();
}

function getAppDataDir() {
  return process.env.APPDATA || path.join(getHomeDir(), 'AppData', 'Roaming');
}

function isNodeModulesFresh() {
  if (!fs.existsSync(NODE_MODULES)) return false;
  if (!fs.existsSync(PACKAGE_JSON)) return false;

  try {
    const pkgStat = fs.statSync(PACKAGE_JSON);
    const nmStat = fs.statSync(NODE_MODULES);
    if (pkgStat.mtimeMs > nmStat.mtimeMs) return false;
    if (fs.existsSync(PACKAGE_LOCK)) {
      const lockStat = fs.statSync(PACKAGE_LOCK);
      if (lockStat.mtimeMs > nmStat.mtimeMs) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function isBuildFresh() {
  if (!fs.existsSync(DIST_INDEX)) return false;
  if (!fs.existsSync(PACKAGE_JSON)) return false;
  try {
    const distStat = fs.statSync(DIST_INDEX);
    const pkgStat = fs.statSync(PACKAGE_JSON);
    if (pkgStat.mtimeMs > distStat.mtimeMs) return false;

    const srcDir = path.resolve(__dirname, 'src');
    if (!fs.existsSync(srcDir)) return true;

    function checkDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (checkDir(fullPath)) return true;
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
          const stat = fs.statSync(fullPath);
          if (stat.mtimeMs > distStat.mtimeMs) return true;
        }
      }
      return false;
    }
    if (checkDir(srcDir)) return false;
    return true;
  } catch {
    return false;
  }
}

function getEditorConfigPaths() {
  const home = getHomeDir();
  const appData = getAppDataDir();
  const platform = os.platform();

  const editors = [];

  editors.push({
    name: 'Trae',
    paths: [
      path.join(home, '.trae', 'mcp.json'),
      path.join(appData, 'Trae', 'mcp.json'),
      path.join(appData, 'TRAE SOLO CN', 'mcp.json'),
    ],
    configKey: 'mcpServers',
  });

  editors.push({
    name: 'VS Code',
    paths: getVSCodePaths(home, appData),
    configKey: 'mcpServers',
  });

  editors.push({
    name: 'Cursor',
    paths: [path.join(home, '.cursor', 'mcp.json')],
    configKey: 'mcpServers',
  });

  editors.push({
    name: 'Windsurf',
    paths: [path.join(home, '.codeium', 'windsurf', 'mcp.json')],
    configKey: 'mcpServers',
  });

  if (platform === 'darwin') {
    editors.push({
      name: 'Claude Desktop',
      paths: [path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')],
      configKey: 'mcpServers',
    });
  } else if (platform === 'win32') {
    editors.push({
      name: 'Claude Desktop',
      paths: [path.join(appData, 'Claude', 'claude_desktop_config.json')],
      configKey: 'mcpServers',
    });
  } else {
    editors.push({
      name: 'Claude Desktop',
      paths: [path.join(home, '.config', 'claude', 'claude_desktop_config.json')],
      configKey: 'mcpServers',
    });
  }

  return editors;
}

function getVSCodePaths(home, appData) {
  const platform = os.platform();
  const paths = [];
  if (platform === 'win32') {
    paths.push(path.join(appData, 'Code', 'User', 'mcp.json'));
    paths.push(path.join(appData, 'Code - Insiders', 'User', 'mcp.json'));
  } else if (platform === 'darwin') {
    paths.push(path.join(home, 'Library', 'Application Support', 'Code', 'User', 'mcp.json'));
    paths.push(path.join(home, 'Library', 'Application Support', 'Code - Insiders', 'User', 'mcp.json'));
  } else {
    paths.push(path.join(home, '.config', 'Code', 'User', 'mcp.json'));
    paths.push(path.join(home, '.config', 'Code - Insiders', 'User', 'mcp.json'));
  }
  return paths;
}

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function writeJsonFile(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function getMcpServerConfig() {
  const distPath = DIST_INDEX;
  return {
    command: 'node',
    args: [distPath],
    env: {
      FIGMA_ACCESS_TOKEN: process.env.FIGMA_ACCESS_TOKEN || '',
    },
  };
}

function hasMcpServerConfig(config) {
  if (!config || !config.mcpServers) return false;
  if (!config.mcpServers[SERVER_NAME]) return false;
  const existing = config.mcpServers[SERVER_NAME];
  const expected = getMcpServerConfig();
  return (
    existing.command === expected.command &&
    Array.isArray(existing.args) &&
    existing.args.length >= 1 &&
    existing.args[0] === expected.args[0]
  );
}

function mergeMcpConfig(config) {
  if (!config) config = {};
  if (!config.mcpServers) config.mcpServers = {};
  config.mcpServers[SERVER_NAME] = getMcpServerConfig();
  return config;
}

function runCommand(cmd, cwd) {
  log.info(`Running: ${c('dim', cmd)}`);
  execSync(cmd, { cwd, stdio: 'inherit', shell: true });
}

async function main() {
  console.log(`
${c('magenta', c('bright', '╔══════════════════════════════════════════════╗'))}
${c('magenta', c('bright', '║     Figma Dev Tools - MCP 安装向导          ║'))}
${c('magenta', c('bright', '║     Figma Dev Tools - MCP Installer         ║'))}
${c('magenta', c('bright', '╚══════════════════════════════════════════════╝'))}
`);

  const results = {
    npmInstall: false,
    npmInstallSkipped: false,
    build: false,
    buildSkipped: false,
    envCreated: false,
    editors: [],
    editorsFailed: [],
    alreadyConfigured: [],
  };

  log.step('Step 1/4: 安装依赖 / Installing dependencies');
  if (flags.skipNpmInstall) {
    log.info('跳过 npm install (--skip-npm-install) / Skipped npm install');
    results.npmInstallSkipped = true;
    results.npmInstall = fs.existsSync(NODE_MODULES);
  } else if (isNodeModulesFresh() && !flags.force) {
    log.info('依赖已是最新，跳过 npm install / Dependencies up to date, skipping npm install');
    results.npmInstall = true;
  } else {
    try {
      runCommand('npm install', __dirname);
      results.npmInstall = true;
      log.success('依赖安装成功 / Dependencies installed');
    } catch (err) {
      log.error(`依赖安装失败 / Failed to install dependencies: ${err.message}`);
    }
  }

  log.step('Step 2/4: 编译 TypeScript / Building TypeScript');
  if (flags.skipBuild) {
    log.info('跳过 build (--skip-build) / Skipped build');
    results.buildSkipped = true;
    results.build = fs.existsSync(DIST_INDEX);
  } else if (isBuildFresh() && !flags.force) {
    log.info('编译产物已是最新，跳过 build / Build is up to date, skipping');
    results.build = true;
  } else {
    try {
      runCommand('npm run build', __dirname);
      if (fs.existsSync(DIST_INDEX)) {
        results.build = true;
        log.success('编译成功 / Build successful');
      } else {
        log.error('编译失败：dist/index.js 不存在 / Build failed: dist/index.js not found');
      }
    } catch (err) {
      log.error(`编译失败 / Build failed: ${err.message}`);
    }
  }

  if (!results.build) {
    log.error('无法继续安装，编译未完成 / Cannot continue without a successful build');
    printSummary(results);
    process.exit(1);
  }

  log.step('Step 3/4: 创建环境配置 / Setting up environment');
  if (!fs.existsSync(ENV_FILE) && fs.existsSync(ENV_EXAMPLE)) {
    fs.copyFileSync(ENV_EXAMPLE, ENV_FILE);
    results.envCreated = true;
    log.success('已创建 .env 文件，请编辑填写 FIGMA_ACCESS_TOKEN / Created .env file, please edit to add FIGMA_ACCESS_TOKEN');
    log.info(`  ${c('dim', ENV_FILE)}`);
  } else if (fs.existsSync(ENV_FILE)) {
    log.info('.env 文件已存在 / .env file already exists');
    results.envCreated = true;
  } else {
    log.warn('.env.example 不存在，跳过 / .env.example not found, skipping');
  }

  log.step('Step 4/4: 配置 AI 编辑器 MCP / Configuring AI editor MCP settings');
  const editors = getEditorConfigPaths();

  for (const editor of editors) {
    let configured = false;
    let alreadyThere = false;
    let error = null;

    for (const configPath of editor.paths) {
      try {
        const existing = readJsonFile(configPath);
        if (hasMcpServerConfig(existing)) {
          alreadyThere = true;
          results.alreadyConfigured.push({ name: editor.name, path: configPath });
          break;
        }

        let parentDir = path.dirname(configPath);
        if (!fs.existsSync(parentDir)) {
          continue;
        }

        const merged = mergeMcpConfig(existing);
        writeJsonFile(configPath, merged);
        configured = true;
        results.editors.push({ name: editor.name, path: configPath });
        break;
      } catch (err) {
        error = err;
        continue;
      }
    }

    if (!configured && !alreadyThere && error) {
      results.editorsFailed.push({ name: editor.name, error: error.message });
    }
  }

  printSummary(results);
}

function printSummary(results) {
  log.header('安装总结 / Installation Summary');
  console.log('');

  if (results.npmInstall) {
    log.success('依赖安装 ✓ / Dependencies installed ✓');
  } else if (results.npmInstallSkipped) {
    log.info('依赖安装已跳过 / Dependencies install skipped');
  } else {
    log.error('依赖安装 ✗ / Dependencies failed ✗');
  }

  if (results.build) {
    log.success('TypeScript 编译 ✓ / TypeScript built ✓');
  } else if (results.buildSkipped) {
    log.info('编译已跳过 / Build skipped');
  } else {
    log.error('TypeScript 编译 ✗ / TypeScript build failed ✗');
  }

  if (results.envCreated) {
    log.success('.env 配置就绪 ✓ / .env ready ✓');
  } else {
    log.warn('.env 需要手动配置 / .env needs manual setup');
  }

  console.log('');
  log.header('已配置的编辑器 / Configured Editors');

  if (results.editors.length === 0 && results.alreadyConfigured.length === 0) {
    log.warn('未检测到已安装的 AI 编辑器配置目录 / No AI editor config directories detected');
    console.log('');
    console.log(c('yellow', '  手动配置方法 / Manual configuration:'));
    console.log('  将以下配置添加到你的编辑器 MCP 设置文件中：');
    console.log('  Add the following to your editor\'s MCP config file:');
    console.log('');
    console.log(c('dim', JSON.stringify({ mcpServers: { [SERVER_NAME]: getMcpServerConfig() } }, null, 2)));
    console.log('');
    console.log(c('cyan', '  MCP 配置文件位置 / Config file locations:'));
    console.log('  - Trae:      ~/.trae/mcp.json');
    console.log('  - VS Code:   ~/.config/Code/User/mcp.json (Linux) 或 %APPDATA%/Code/User/mcp.json (Windows)');
    console.log('  - Cursor:    ~/.cursor/mcp.json');
    console.log('  - Windsurf:  ~/.codeium/windsurf/mcp.json');
    console.log('  - Claude:    ~/Library/Application Support/Claude/claude_desktop_config.json (macOS)');
  } else {
    for (const e of results.editors) {
      log.success(`${e.name} ✓`);
      console.log(`    ${c('dim', e.path)}`);
    }
    for (const e of results.alreadyConfigured) {
      log.info(`${e.name} ${c('dim', '(已配置 / already configured)')}`);
      console.log(`    ${c('dim', e.path)}`);
    }
  }

  if (results.editorsFailed.length > 0) {
    console.log('');
    log.header('配置失败 / Failed Editors');
    for (const e of results.editorsFailed) {
      log.error(`${e.name}: ${e.error}`);
    }
  }

  console.log('');
  log.header('后续步骤 / Next Steps');
  console.log(`
  1. ${c('yellow', '配置 Figma Token')}: 编辑 ${c('cyan', '.env')} 文件，填入你的 FIGMA_ACCESS_TOKEN
     Configure Figma Token: Edit .env and set your FIGMA_ACCESS_TOKEN
     Get token: ${c('cyan', 'https://www.figma.com/developers/api#access-tokens')}

  2. ${c('yellow', '重启编辑器')}: 重启你的 AI 编辑器以加载 MCP 服务器
     Restart editor: Restart your AI editor to load the MCP server

  3. ${c('yellow', '验证安装')}: 在编辑器中尝试使用 figma_* 工具
     Verify: Try using figma_* tools in your editor

  4. ${c('dim', '如需卸载')}: 运行 ${c('cyan', 'npx figma-dev-tools uninstall')} 或 ${c('cyan', 'node uninstall.mjs')}
     To uninstall: Run npx figma-dev-tools uninstall or node uninstall.mjs
  `);

  console.log(c('green', c('bright', '安装完成！/ Installation complete! 🎉\n')));
}

main().catch((err) => {
  console.error(c('red', `Fatal error: ${err.message}`));
  console.error(err.stack);
  process.exit(1);
});
