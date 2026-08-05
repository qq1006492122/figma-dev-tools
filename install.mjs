#!/usr/bin/env node

/**
 * figma-dev-tools 安装脚本
 * 一键安装依赖并配置到支持的编辑器中
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_NAME = 'figma-dev-tools';
const SKILL_DIR = __dirname;

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * 检测包管理器
 */
function detectPackageManager() {
  const cwd = process.cwd();
  const home = getHomeDir();
  const lockFiles = [
    { file: 'pnpm-lock.yaml', pm: 'pnpm', installCmd: 'pnpm install', buildCmd: 'pnpm build' },
    { file: 'bun.lockb', pm: 'bun', installCmd: 'bun install', buildCmd: 'bun run build' },
    { file: 'bun.lock', pm: 'bun', installCmd: 'bun install', buildCmd: 'bun run build' },
    { file: 'yarn.lock', pm: 'yarn', installCmd: 'yarn install', buildCmd: 'yarn build' },
    { file: 'package-lock.json', pm: 'npm', installCmd: 'npm install', buildCmd: 'npm run build' },
  ];

  let dir = cwd;
  for (let i = 0; i < 6; i++) {
    for (const lf of lockFiles) {
      if (fs.existsSync(path.join(dir, lf.file))) return lf;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (fs.existsSync(path.join(home, '.pnpm-state'))) return lockFiles[0];
  return lockFiles[4];
}

function getHomeDir() {
  return os.homedir();
}

function getAppDataDir() {
  const platform = os.platform();
  if (platform === 'win32') return process.env.APPDATA;
  if (platform === 'darwin') return path.join(getHomeDir(), 'Library', 'Application Support');
  return path.join(getHomeDir(), '.config');
}

// ─── Editor Config Path Detection ────────────────────────────────────────────

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

function getCursorPaths(home, appData) {
  const platform = os.platform();
  if (platform === 'win32') {
    return [path.join(appData, 'Cursor', 'User', 'mcp.json')];
  }
  if (platform === 'darwin') {
    return [path.join(home, 'Library', 'Application Support', 'Cursor', 'User', 'mcp.json')];
  }
  return [path.join(home, '.config', 'Cursor', 'User', 'mcp.json')];
}

function getWindsurfPaths(home, appData) {
  const platform = os.platform();
  if (platform === 'win32') {
    return [path.join(appData, 'Windsurf', 'User', 'mcp.json')];
  }
  if (platform === 'darwin') {
    return [path.join(home, 'Library', 'Application Support', 'Windsurf', 'User', 'mcp.json')];
  }
  return [path.join(home, '.config', 'Windsurf', 'User', 'mcp.json')];
}

function getTraePaths(home, appData) {
  const platform = os.platform();
  const paths = [];
  if (platform === 'win32') {
    paths.push(path.join(appData, 'TRAE', 'User', 'mcp.json'));
    paths.push(path.join(appData, 'TRAE SOLO CN', 'User', 'mcp.json'));
    paths.push(path.join(appData, 'TRAE SOLO', 'User', 'mcp.json'));
    paths.push(path.join(appData, 'Trae CN', 'User', 'mcp.json'));
  } else if (platform === 'darwin') {
    paths.push(path.join(home, 'Library', 'Application Support', 'TRAE', 'User', 'mcp.json'));
    paths.push(path.join(home, 'Library', 'Application Support', 'TRAE SOLO CN', 'User', 'mcp.json'));
    paths.push(path.join(home, 'Library', 'Application Support', 'TRAE SOLO', 'User', 'mcp.json'));
    paths.push(path.join(home, 'Library', 'Application Support', 'Trae CN', 'User', 'mcp.json'));
  } else {
    paths.push(path.join(home, '.config', 'TRAE', 'User', 'mcp.json'));
    paths.push(path.join(home, '.config', 'TRAE SOLO CN', 'User', 'mcp.json'));
    paths.push(path.join(home, '.config', 'TRAE SOLO', 'User', 'mcp.json'));
    paths.push(path.join(home, '.config', 'Trae CN', 'User', 'mcp.json'));
  }
  return paths;
}

function getClaudeDesktopPaths(home) {
  const platform = os.platform();
  if (platform === 'win32') {
    return [path.join(getAppDataDir(), 'Claude', 'claude_desktop_config.json')];
  }
  if (platform === 'darwin') {
    return [path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')];
  }
  return [path.join(home, '.config', 'Claude', 'claude_desktop_config.json')];
}

function getZedPaths(home) {
  return [path.join(home, '.zed', 'settings.json')];
}

function getClinePaths(home, appData) {
  const platform = os.platform();
  const paths = [];
  if (platform === 'win32') {
    paths.push(path.join(appData, 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'));
    paths.push(path.join(appData, 'Cursor', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'));
  } else if (platform === 'darwin') {
    paths.push(path.join(home, 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'));
    paths.push(path.join(home, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'));
  } else {
    paths.push(path.join(home, '.config', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'));
    paths.push(path.join(home, '.config', 'Cursor', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'));
  }
  return paths;
}

function getRooCodePaths(home, appData) {
  const platform = os.platform();
  const paths = [];
  if (platform === 'win32') {
    paths.push(path.join(appData, 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'mcp_settings.json'));
    paths.push(path.join(appData, 'Cursor', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'mcp_settings.json'));
  } else if (platform === 'darwin') {
    paths.push(path.join(home, 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'mcp_settings.json'));
    paths.push(path.join(home, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'mcp_settings.json'));
  } else {
    paths.push(path.join(home, '.config', 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'mcp_settings.json'));
    paths.push(path.join(home, '.config', 'Cursor', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'mcp_settings.json'));
  }
  return paths;
}

function getEditorConfigPaths() {
  const home = getHomeDir();
  const appData = getAppDataDir();

  return [
    ...getTraePaths(home, appData).map((p) => ({ path: p, editor: 'Trae' })),
    ...getVSCodePaths(home, appData).map((p) => ({ path: p, editor: 'VS Code' })),
    ...getCursorPaths(home, appData).map((p) => ({ path: p, editor: 'Cursor' })),
    ...getWindsurfPaths(home, appData).map((p) => ({ path: p, editor: 'Windsurf' })),
    ...getClaudeDesktopPaths(home).map((p) => ({ path: p, editor: 'Claude Desktop' })),
    ...getZedPaths(home).map((p) => ({ path: p, editor: 'Zed', zedFormat: true })),
    ...getClinePaths(home, appData).map((p) => ({ path: p, editor: 'Cline' })),
    ...getRooCodePaths(home, appData).map((p) => ({ path: p, editor: 'Roo Code' })),
  ];
}

// ─── JSON Config Helpers ─────────────────────────────────────────────────────

function readJsonSafe(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (_) {
    // Ignore
  }
  return null;
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function getMcpServerEntry() {
  // Use bin/figma-dev.js as entry point - it automatically handles both
  // compiled (dist/) and development (tsx) modes
  const binScript = path.join(SKILL_DIR, 'bin', 'figma-dev.js');
  
  return {
    command: process.execPath,
    args: [binScript, 'mcp'],
  };
}

function mergeMcpConfig(config, serverEntry, zedFormat = false) {
  if (zedFormat) {
    if (!config.mcp_servers) config.mcp_servers = {};
    config.mcp_servers[SERVER_NAME] = serverEntry;
  } else {
    if (!config.mcpServers) config.mcpServers = {};
    config.mcpServers[SERVER_NAME] = serverEntry;
  }
  return config;
}

function hasMcpServerConfig(config, zedFormat = false) {
  const servers = zedFormat ? config?.mcp_servers : config?.mcpServers;
  return !!(servers && servers[SERVER_NAME]);
}

// ─── Main Installation ───────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║     figma-dev-tools - 一键安装脚本           ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // Step 1: Detect package manager
  const pm = detectPackageManager();
  console.log(`📦 检测到包管理器: ${pm.pm}\n`);

  // Step 2: Install dependencies
  console.log('📥 正在安装依赖...');
  try {
    execSync(pm.installCmd, { cwd: SKILL_DIR, stdio: 'inherit' });
    console.log('✅ 依赖安装完成\n');
  } catch (_) {
    console.error('❌ 依赖安装失败，请手动运行: ' + pm.installCmd);
    process.exit(1);
  }

  // Step 3: Build the project
  console.log('🔨 正在构建项目...');
  try {
    execSync(pm.buildCmd, { cwd: SKILL_DIR, stdio: 'inherit' });
    console.log('✅ 构建完成\n');
  } catch (_) {
    console.warn('⚠️  构建失败，将使用 tsx 直接运行 TypeScript 源码（通过 bin/figma-dev.js 自动处理）');
  }

  // Step 4: Configure editors
  console.log('🔧 正在配置编辑器...\n');
  const serverEntry = getMcpServerEntry();
  const editorConfigs = getEditorConfigPaths();
  const configured = [];
  const alreadyConfigured = [];

  for (const { path: configPath, editor, zedFormat } of editorConfigs) {
    let config = readJsonSafe(configPath);

    if (config && hasMcpServerConfig(config, zedFormat)) {
      alreadyConfigured.push({ path: configPath, editor });
      continue;
    }

    config = mergeMcpConfig(config || {}, serverEntry, zedFormat);
    writeJson(configPath, config);
    configured.push({ path: configPath, editor });
  }

  // Step 5: Report results
  console.log('═══════════════════════════════════════════════\n');

  if (configured.length > 0) {
    console.log('✅ 已自动配置以下编辑器:');
    for (const { path: p, editor } of configured) {
      console.log(`   • ${editor}: ${p}`);
    }
    console.log('');
  }

  if (alreadyConfigured.length > 0) {
    console.log('ℹ️  以下编辑器已配置（未修改）:');
    for (const { path: p, editor } of alreadyConfigured) {
      console.log(`   • ${editor}: ${p}`);
    }
    console.log('');
  }

  const allSupported = editorConfigs.map((e) => e.editor);
  const foundSet = new Set([...configured.map((c) => c.editor), ...alreadyConfigured.map((c) => c.editor)]);
  const notFound = allSupported.filter((e) => !foundSet.has(e));

  if (notFound.length > 0) {
    console.log('💡 以下编辑器未检测到，如需使用请手动配置:');
    console.log(`   ${notFound.join(', ')}\n`);
    console.log('   手动配置示例:');
    console.log('   ```json');
    console.log('   {');
    console.log('     "mcpServers": {');
    console.log(`       "${SERVER_NAME}": {`);
    console.log(`         "command": "${serverEntry.command.replace(/\\/g, '\\\\')}",`);
    console.log(`         "args": ["${serverEntry.args[0].replace(/\\/g, '\\\\')}", "${serverEntry.args[1]}"]`);
    console.log('       }');
    console.log('     }');
    console.log('   }');
    console.log('   ```\n');
    console.log('   配置文件位置:');
    for (const { path: p, editor } of editorConfigs.filter((e) => notFound.includes(e.editor))) {
      console.log(`   • ${editor}: ${p}`);
    }
    console.log('');
  }

  console.log('═══════════════════════════════════════════════');
  console.log('🎉 安装完成！请重启编辑器以加载 MCP 服务器。');
  console.log('═══════════════════════════════════════════════\n');
}

main().catch((error) => {
  console.error('❌ 安装失败:', error);
  process.exit(1);
});
