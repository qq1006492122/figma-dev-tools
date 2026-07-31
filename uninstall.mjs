#!/usr/bin/env node
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_NAME = 'figma-dev-tools';

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
  });

  editors.push({
    name: 'VS Code',
    paths: getVSCodePaths(home, appData),
  });

  editors.push({
    name: 'Cursor',
    paths: [path.join(home, '.cursor', 'mcp.json')],
  });

  editors.push({
    name: 'Windsurf',
    paths: [path.join(home, '.codeium', 'windsurf', 'mcp.json')],
  });

  if (platform === 'darwin') {
    editors.push({
      name: 'Claude Desktop',
      paths: [path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')],
    });
  } else if (platform === 'win32') {
    editors.push({
      name: 'Claude Desktop',
      paths: [path.join(appData, 'Claude', 'claude_desktop_config.json')],
    });
  } else {
    editors.push({
      name: 'Claude Desktop',
      paths: [path.join(home, '.config', 'claude', 'claude_desktop_config.json')],
    });
  }

  return editors;
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

function removeMcpConfig(config) {
  if (!config || !config.mcpServers) return { config, removed: false };
  if (!config.mcpServers[SERVER_NAME]) return { config, removed: false };
  delete config.mcpServers[SERVER_NAME];
  if (Object.keys(config.mcpServers).length === 0) {
    delete config.mcpServers;
  }
  return { config, removed: true };
}

async function main() {
  console.log(`
${c('magenta', c('bright', '╔══════════════════════════════════════════════╗'))}
${c('magenta', c('bright', '║     Figma Dev Tools - MCP 卸载向导          ║'))}
${c('magenta', c('bright', '║     Figma Dev Tools - MCP Uninstaller       ║'))}
${c('magenta', c('bright', '╚══════════════════════════════════════════════╝'))}
`);

  const results = {
    removed: [],
    notFound: [],
    failed: [],
  };

  log.step('正在移除 MCP 配置 / Removing MCP configuration');

  const editors = getEditorConfigPaths();

  for (const editor of editors) {
    let found = false;
    let removed = false;
    let error = null;

    for (const configPath of editor.paths) {
      try {
        if (!fs.existsSync(configPath)) continue;
        found = true;

        const existing = readJsonFile(configPath);
        if (!existing) {
          error = '无法解析配置文件 / Cannot parse config file';
          continue;
        }

        if (!existing.mcpServers || !existing.mcpServers[SERVER_NAME]) {
          continue;
        }

        const { config: updated, removed: didRemove } = removeMcpConfig(existing);
        if (didRemove) {
          writeJsonFile(configPath, updated);
          removed = true;
          results.removed.push({ name: editor.name, path: configPath });
          break;
        }
      } catch (err) {
        error = err.message;
        continue;
      }
    }

    if (!found) {
      results.notFound.push(editor.name);
    } else if (!removed && !error) {
      results.notFound.push(`${editor.name} (配置文件存在但未找到 figma-dev-tools 配置)`);
    } else if (error) {
      results.failed.push({ name: editor.name, error });
    }
  }

  printSummary(results);
}

function printSummary(results) {
  log.header('卸载总结 / Uninstall Summary');
  console.log('');

  if (results.removed.length > 0) {
    log.success('已从以下编辑器移除配置 / Removed from:');
    for (const e of results.removed) {
      console.log(`  ${c('green', '✓')} ${e.name}`);
      console.log(`    ${c('dim', e.path)}`);
    }
  } else {
    log.info('未在任何编辑器中找到 figma-dev-tools 配置 / No configuration found');
  }

  if (results.notFound.length > 0) {
    console.log('');
    log.info('未检测到配置的编辑器 / Not configured in:');
    for (const name of results.notFound) {
      console.log(`  ${c('dim', '- ' + name)}`);
    }
  }

  if (results.failed.length > 0) {
    console.log('');
    log.header('失败 / Failed');
    for (const e of results.failed) {
      log.error(`${e.name}: ${e.error}`);
    }
  }

  console.log('');
  log.header('后续步骤 / Next Steps');
  console.log(`
  1. ${c('yellow', '重启编辑器')}: 重启你的 AI 编辑器以应用更改
     Restart editor: Restart your AI editor for changes to take effect

  2. ${c('dim', '如需完全卸载')}: 运行 ${c('cyan', 'npm uninstall -g figma-dev-tools')} 或删除本地目录
     To fully uninstall: Run npm uninstall -g figma-dev-tools or delete the local directory

  3. ${c('dim', '重新安装')}: 随时可以运行 ${c('cyan', 'npx figma-dev-tools install')} 重新配置
     To reinstall: Run npx figma-dev-tools install anytime
  `);

  console.log(c('green', c('bright', '卸载完成！/ Uninstall complete! 👋\n')));
}

main().catch((err) => {
  console.error(c('red', `Fatal error: ${err.message}`));
  console.error(err.stack);
  process.exit(1);
});
