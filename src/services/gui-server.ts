/**
 * GUI Configuration Server
 *
 * Provides a web-based configuration wizard for figma-dev-tools.
 * Uses Node.js built-in http module - no additional dependencies required.
 *
 * Endpoints:
 *   GET  /              - GUI configuration panel
 *   GET  /api/status    - Get current configuration status
 *   POST /api/language  - Set display language
 *   POST /api/token     - Set and validate Figma Access Token
 *   GET  /api/editors   - Detect available AI editors
 *   POST /api/editors/install - Install MCP config for specified editor
 *   POST /api/install-global   - Globally install figma-dev-tools via npm
 *   POST /api/config/complete - Complete configuration and save settings
 */

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import chalk from 'chalk';
import open from 'open';

import { initI18nSync } from '../i18n/index.js';
import type { Language } from '../i18n/index.js';
import { createFigmaClient } from './figma-client.js';
import { createTokenStore } from './token-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GUI_DIR = path.resolve(__dirname, '../../gui');

const BASE_PORT = 54321;
const MAX_PORT_ATTEMPTS = 10;
const VERSION = '1.4.4';

interface EditorInfo {
  name: string;
  detected: boolean;
  installed: boolean;
  configPath?: string;
  /** 编辑器官网下载地址，用于未安装时引导用户前往下载 */
  website?: string;
}

interface ServerState {
  language: Language;
  tokenConfigured: boolean;
  configuredEditors: Set<string>;
  framework: string;
  outputDir: string;
}

function getHomeDir(): string {
  return os.homedir();
}

function getAppDataDir(): string {
  const platform = os.platform();
  if (platform === 'win32') return process.env.APPDATA || path.join(getHomeDir(), 'AppData', 'Roaming');
  if (platform === 'darwin') return path.join(getHomeDir(), 'Library', 'Application Support');
  return path.join(getHomeDir(), '.config');
}

function getVSCodePaths(): string[] {
  const platform = os.platform();
  const home = getHomeDir();
  const appData = getAppDataDir();
  if (platform === 'win32') {
    return [path.join(appData, 'Code', 'User', 'mcp.json'), path.join(appData, 'Code - Insiders', 'User', 'mcp.json')];
  }
  if (platform === 'darwin') {
    return [
      path.join(home, 'Library', 'Application Support', 'Code', 'User', 'mcp.json'),
      path.join(home, 'Library', 'Application Support', 'Code - Insiders', 'User', 'mcp.json'),
    ];
  }
  return [
    path.join(home, '.config', 'Code', 'User', 'mcp.json'),
    path.join(home, '.config', 'Code - Insiders', 'User', 'mcp.json'),
  ];
}

function getCursorPaths(): string[] {
  const platform = os.platform();
  const home = getHomeDir();
  const appData = getAppDataDir();
  if (platform === 'win32') return [path.join(appData, 'Cursor', 'User', 'mcp.json')];
  if (platform === 'darwin') return [path.join(home, 'Library', 'Application Support', 'Cursor', 'User', 'mcp.json')];
  return [path.join(home, '.config', 'Cursor', 'User', 'mcp.json')];
}

function getWindsurfPaths(): string[] {
  const platform = os.platform();
  const home = getHomeDir();
  const appData = getAppDataDir();
  if (platform === 'win32') return [path.join(appData, 'Windsurf', 'User', 'mcp.json')];
  if (platform === 'darwin') return [path.join(home, 'Library', 'Application Support', 'Windsurf', 'User', 'mcp.json')];
  return [path.join(home, '.config', 'Windsurf', 'User', 'mcp.json')];
}

function getTraePaths(): string[] {
  const platform = os.platform();
  const home = getHomeDir();
  const appData = getAppDataDir();
  if (platform === 'win32') {
    return [
      path.join(appData, 'TRAE', 'User', 'mcp.json'),
      path.join(appData, 'TRAE SOLO CN', 'User', 'mcp.json'),
      path.join(appData, 'TRAE SOLO', 'User', 'mcp.json'),
      path.join(appData, 'Trae CN', 'User', 'mcp.json'),
    ];
  }
  if (platform === 'darwin') {
    return [
      path.join(home, 'Library', 'Application Support', 'TRAE', 'User', 'mcp.json'),
      path.join(home, 'Library', 'Application Support', 'TRAE SOLO CN', 'User', 'mcp.json'),
      path.join(home, 'Library', 'Application Support', 'TRAE SOLO', 'User', 'mcp.json'),
      path.join(home, 'Library', 'Application Support', 'Trae CN', 'User', 'mcp.json'),
    ];
  }
  return [
    path.join(home, '.config', 'TRAE', 'User', 'mcp.json'),
    path.join(home, '.config', 'TRAE SOLO CN', 'User', 'mcp.json'),
    path.join(home, '.config', 'TRAE SOLO', 'User', 'mcp.json'),
    path.join(home, '.config', 'Trae CN', 'User', 'mcp.json'),
  ];
}

function getClaudeDesktopPaths(): string[] {
  const platform = os.platform();
  const home = getHomeDir();
  if (platform === 'win32') return [path.join(getAppDataDir(), 'Claude', 'claude_desktop_config.json')];
  if (platform === 'darwin')
    return [path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')];
  return [path.join(home, '.config', 'Claude', 'claude_desktop_config.json')];
}

function getZedPaths(): string[] {
  return [path.join(getHomeDir(), '.zed', 'settings.json')];
}

function getClinePaths(): string[] {
  const platform = os.platform();
  const home = getHomeDir();
  const appData = getAppDataDir();
  if (platform === 'win32') {
    return [
      path.join(
        appData,
        'Code',
        'User',
        'globalStorage',
        'saoudrizwan.claude-dev',
        'settings',
        'cline_mcp_settings.json',
      ),
      path.join(
        appData,
        'Cursor',
        'User',
        'globalStorage',
        'saoudrizwan.claude-dev',
        'settings',
        'cline_mcp_settings.json',
      ),
    ];
  }
  if (platform === 'darwin') {
    return [
      path.join(
        home,
        'Library',
        'Application Support',
        'Code',
        'User',
        'globalStorage',
        'saoudrizwan.claude-dev',
        'settings',
        'cline_mcp_settings.json',
      ),
      path.join(
        home,
        'Library',
        'Application Support',
        'Cursor',
        'User',
        'globalStorage',
        'saoudrizwan.claude-dev',
        'settings',
        'cline_mcp_settings.json',
      ),
    ];
  }
  return [
    path.join(
      home,
      '.config',
      'Code',
      'User',
      'globalStorage',
      'saoudrizwan.claude-dev',
      'settings',
      'cline_mcp_settings.json',
    ),
    path.join(
      home,
      '.config',
      'Cursor',
      'User',
      'globalStorage',
      'saoudrizwan.claude-dev',
      'settings',
      'cline_mcp_settings.json',
    ),
  ];
}

function getRooCodePaths(): string[] {
  const platform = os.platform();
  const home = getHomeDir();
  const appData = getAppDataDir();
  if (platform === 'win32') {
    return [
      path.join(
        appData,
        'Code',
        'User',
        'globalStorage',
        'rooveterinaryinc.roo-cline',
        'settings',
        'mcp_settings.json',
      ),
      path.join(
        appData,
        'Cursor',
        'User',
        'globalStorage',
        'rooveterinaryinc.roo-cline',
        'settings',
        'mcp_settings.json',
      ),
    ];
  }
  if (platform === 'darwin') {
    return [
      path.join(
        home,
        'Library',
        'Application Support',
        'Code',
        'User',
        'globalStorage',
        'rooveterinaryinc.roo-cline',
        'settings',
        'mcp_settings.json',
      ),
      path.join(
        home,
        'Library',
        'Application Support',
        'Cursor',
        'User',
        'globalStorage',
        'rooveterinaryinc.roo-cline',
        'settings',
        'mcp_settings.json',
      ),
    ];
  }
  return [
    path.join(
      home,
      '.config',
      'Code',
      'User',
      'globalStorage',
      'rooveterinaryinc.roo-cline',
      'settings',
      'mcp_settings.json',
    ),
    path.join(
      home,
      '.config',
      'Cursor',
      'User',
      'globalStorage',
      'rooveterinaryinc.roo-cline',
      'settings',
      'mcp_settings.json',
    ),
  ];
}

interface EditorPathConfig {
  paths: string[];
  name: string;
  zedFormat?: boolean;
  /** 编辑器官网下载地址 */
  website?: string;
}

/**
 * 检测系统可用的包管理器
 * 优先级：npm > pnpm > yarn
 * Windows 下 npm 实际为 npm.cmd，需要 shell:true 才能被 execFileSync 找到
 * @returns 包管理器名称
 */
function detectPackageManager(): 'npm' | 'pnpm' | 'yarn' {
  const managers: Array<'npm' | 'pnpm' | 'yarn'> = ['npm', 'pnpm', 'yarn'];
  const isWindows = os.platform() === 'win32';
  for (const pm of managers) {
    try {
      execFileSync(pm, ['--version'], {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 5000,
        shell: isWindows, // Windows 下 npm/pnpm/yarn 均为 .cmd 脚本，需要 shell 模式
      });
      return pm;
    } catch {
      // 包管理器不存在，继续检测下一个
    }
  }
  // 默认回退到 npm（Node.js 自带）
  return 'npm';
}

function getEditorConfigs(): EditorPathConfig[] {
  return [
    { name: 'Trae', paths: getTraePaths(), website: 'https://www.trae.ai/download' },
    { name: 'VS Code', paths: getVSCodePaths(), website: 'https://code.visualstudio.com/download' },
    { name: 'Cursor', paths: getCursorPaths(), website: 'https://www.cursor.com/downloads' },
    { name: 'Windsurf', paths: getWindsurfPaths(), website: 'https://windsurf.com/editor/download' },
    { name: 'Claude Desktop', paths: getClaudeDesktopPaths(), website: 'https://claude.ai/download' },
    { name: 'Zed', paths: getZedPaths(), zedFormat: true, website: 'https://zed.dev/download' },
    { name: 'Cline', paths: getClinePaths(), website: 'https://github.com/cline/cline' },
    { name: 'Roo Code', paths: getRooCodePaths(), website: 'https://github.com/RooVetGit/Roo-Code' },
  ];
}

function readJsonSafe(filePath: string): Record<string, unknown> | null {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch {
    // ignore
  }
  return null;
}

function writeJson(filePath: string, data: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function getMcpServerEntry(): { command: string; args: string[] } {
  const binScript = path.resolve(__dirname, '../../bin/figma-dev.js');
  return {
    command: process.execPath,
    args: [binScript, 'mcp'],
  };
}

function hasMcpConfig(config: Record<string, unknown>, zedFormat: boolean): boolean {
  const servers = zedFormat
    ? (config.mcp_servers as Record<string, unknown> | undefined)
    : (config.mcpServers as Record<string, unknown> | undefined);
  return !!(servers && servers['figma-dev-tools']);
}

function mergeMcpConfig(
  config: Record<string, unknown>,
  serverEntry: { command: string; args: string[] },
  zedFormat: boolean,
): Record<string, unknown> {
  if (zedFormat) {
    if (!config.mcp_servers) config.mcp_servers = {};
    (config.mcp_servers as Record<string, unknown>)['figma-dev-tools'] = serverEntry;
  } else {
    if (!config.mcpServers) config.mcpServers = {};
    (config.mcpServers as Record<string, unknown>)['figma-dev-tools'] = serverEntry;
  }
  return config;
}

function detectEditor(config: EditorPathConfig): { detected: boolean; installed: boolean; configPath?: string } {
  for (const p of config.paths) {
    const dir = path.dirname(p);
    const parentDir = path.dirname(dir);
    const dirExists = fs.existsSync(dir) || fs.existsSync(parentDir);
    if (dirExists) {
      const json = readJsonSafe(p);
      const installed = json ? hasMcpConfig(json, config.zedFormat ?? false) : false;
      return { detected: true, installed, configPath: p };
    }
  }
  return { detected: false, installed: false };
}

function installForEditor(config: EditorPathConfig): boolean {
  const serverEntry = getMcpServerEntry();
  let installed = false;

  for (const p of config.paths) {
    const dir = path.dirname(p);
    if (fs.existsSync(dir) || fs.existsSync(path.dirname(dir))) {
      const existing = readJsonSafe(p) || {};
      mergeMcpConfig(existing, serverEntry, config.zedFormat ?? false);
      writeJson(p, existing);
      installed = true;
    }
  }

  return installed;
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

function sendJson(res: http.ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

/** 请求体大小上限（1MB），防止恶意超大 body 导致内存耗尽 */
const MAX_BODY_BYTES = 1 * 1024 * 1024;

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    let aborted = false;
    req.on('data', (chunk: Buffer) => {
      if (aborted) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        aborted = true;
        req.destroy();
        reject(new Error('Request body too large (max 1MB)'));
        return;
      }
      body += chunk.toString();
    });
    req.on('end', () => {
      if (!aborted) resolve(body);
    });
    req.on('error', (err) => {
      if (!aborted) reject(err);
    });
  });
}

export async function startGuiServer(): Promise<http.Server> {
  console.log('[GUI] Starting GUI server...');
  console.log('[GUI] Version:', VERSION);
  console.log('[GUI] Platform:', os.platform());
  console.log('[GUI] Node.js version:', process.version);
  console.log('[GUI] GUI directory:', GUI_DIR);
  console.log('[GUI] Base port:', BASE_PORT);

  const i18n = initI18nSync();
  const tokenStore = createTokenStore();

  const state: ServerState = {
    language: i18n.getLanguage(),
    tokenConfigured: false,
    configuredEditors: new Set(),
    framework: 'react',
    outputDir: './src/styles/figma',
  };

  try {
    console.log('[GUI] Checking for existing token...');
    const existingToken = await tokenStore.getToken();
    state.tokenConfigured = !!existingToken;
    console.log('[GUI] Existing token found:', state.tokenConfigured);
  } catch (error) {
    console.error('[GUI] Error checking existing token:', error);
    state.tokenConfigured = false;
  }

  const configPath = path.resolve(process.cwd(), 'figma-dev.config.json');
  const existingConfig = readJsonSafe(configPath);
  if (existingConfig) {
    if (typeof existingConfig.framework === 'string') state.framework = existingConfig.framework;
    if (typeof existingConfig.outputDir === 'string') state.outputDir = existingConfig.outputDir;
    console.log('[GUI] Loaded existing config:', { framework: state.framework, outputDir: state.outputDir });
  }

  let port = BASE_PORT;
  let server: http.Server;

  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
    port = BASE_PORT + attempt;
    console.log('[GUI] Trying port:', port);
    try {
      server = http.createServer(async (req, res) => {
        const reqUrl = req.url || '/';
        const urlObj = new URL(reqUrl, `http://localhost:${port}`);
        const pathname = urlObj.pathname;

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        try {
          if (pathname === '/api/status') {
            console.log('[GUI] /api/status request received');
            let hasToken = false;
            try {
              hasToken = !!(await tokenStore.getToken());
              console.log('[GUI] /api/status: token check result:', hasToken);
            } catch (error) {
              console.error('[GUI] /api/status: error checking token:', error);
              hasToken = false;
            }
            sendJson(res, 200, {
              success: true,
              language: state.language,
              hasToken,
              config: {
                framework: state.framework,
                outputDir: state.outputDir,
              },
              configuredEditors: Array.from(state.configuredEditors),
              version: VERSION,
            });
            return;
          }

          if (pathname === '/api/language' && req.method === 'POST') {
            console.log('[GUI] /api/language request received');
            const body = await readBody(req);
            const data = JSON.parse(body) as { language?: Language };
            if (data.language && (data.language === 'zh-CN' || data.language === 'en-US')) {
              state.language = data.language;
              await i18n.setLanguage(data.language);
              console.log('[GUI] Language set to:', data.language);
              sendJson(res, 200, { success: true, language: data.language });
            } else {
              console.log('[GUI] Invalid language:', data.language);
              sendJson(res, 400, { success: false, error: 'Invalid language' });
            }
            return;
          }

          if (pathname === '/api/token' && req.method === 'POST') {
            console.log('[GUI] /api/token request received');
            const body = await readBody(req);
            const data = JSON.parse(body) as { token?: string };
            const token = data.token;

            console.log('[GUI] Received token validation request, token length:', token?.length);

            if (!token || token.length < 20 || !token.startsWith('figd_')) {
              console.log('[GUI] Invalid token format');
              sendJson(res, 400, { success: false, valid: false, error: 'Invalid token format' });
              return;
            }

            try {
              console.log('[GUI] Validating token with Figma API...');
              const client = createFigmaClient({ accessToken: token });
              const isValid = await client.validateToken();
              console.log('[GUI] Figma API validation result:', isValid);

              if (isValid) {
                console.log('[GUI] Saving token to secure storage...');
                await tokenStore.saveToken('default', token);
                await tokenStore.setDefault('default');
                state.tokenConfigured = true;
                console.log('[GUI] Token saved successfully');
                sendJson(res, 200, { success: true, valid: true });
              } else {
                console.log('[GUI] Token validation failed');
                sendJson(res, 200, { success: false, valid: false, error: 'Token validation failed' });
              }
            } catch (error) {
              console.error('[GUI] Token error:', error);
              sendJson(res, 200, {
                success: false,
                valid: false,
                error: error instanceof Error ? error.message : String(error),
              });
            }
            return;
          }

          if (pathname === '/api/editors') {
            console.log('[GUI] /api/editors request received');
            const editorConfigs = getEditorConfigs();
            const editors: EditorInfo[] = editorConfigs.map((ec) => {
              const result = detectEditor(ec);
              return {
                name: ec.name,
                detected: result.detected,
                installed: result.installed || state.configuredEditors.has(ec.name),
                configPath: result.configPath,
                website: ec.website,
              };
            });
            sendJson(res, 200, { success: true, editors });
            return;
          }

          if (pathname === '/api/editors/install' && req.method === 'POST') {
            console.log('[GUI] /api/editors/install request received');
            const body = await readBody(req);
            const data = JSON.parse(body) as { editor?: string };
            const editorName = data.editor;

            if (!editorName) {
              sendJson(res, 400, { success: false, error: 'Editor name required' });
              return;
            }

            const editorConfig = getEditorConfigs().find((e) => e.name === editorName);
            if (!editorConfig) {
              sendJson(res, 404, { success: false, error: `Editor '${editorName}' not found` });
              return;
            }

            try {
              console.log('[GUI] Installing for editor:', editorName);
              const success = installForEditor(editorConfig);
              if (success) {
                state.configuredEditors.add(editorName);
                console.log('[GUI] Editor installed successfully:', editorName);
                sendJson(res, 200, { success: true, editor: editorName });
              } else {
                console.log('[GUI] Editor config directory not found:', editorName);
                sendJson(res, 200, {
                  success: false,
                  error: 'Editor config directory not found',
                  editor: editorName,
                });
              }
            } catch (error) {
              console.error('[GUI] Editor install error:', error);
              sendJson(res, 500, {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              });
            }
            return;
          }

          // 全局安装 figma-dev-tools（通过 npm install -g）
          // 使用 SSE (Server-Sent Events) 流式推送安装进度和日志
          if (pathname === '/api/install-global' && req.method === 'POST') {
            console.log('[GUI] /api/install-global request received (SSE stream)');

            // 设置 SSE 响应头
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
              'Access-Control-Allow-Origin': '*',
            });

            /** 向前端推送一条 SSE 事件 */
            const sendEvent = (event: { type: string; data: unknown }): void => {
              res.write(`data: ${JSON.stringify(event)}\n\n`);
            };

            try {
              const packageManager = detectPackageManager();
              const packageName = 'figma-dev-tools';
              console.log('[GUI] Installing globally via:', packageManager, packageName);

              // 推送开始事件
              sendEvent({
                type: 'start',
                data: { packageManager, packageName, message: `Installing via ${packageManager}...` },
              });

              const args =
                packageManager === 'pnpm' ? ['add', '-g', packageName] : ['install', '-g', packageName];

              // 使用 spawn 异步执行，实时捕获 stdout/stderr
              const child = spawn(packageManager, args, {
                shell: os.platform() === 'win32', // Windows 下 npm/pnpm/yarn 均为 .cmd 脚本
                stdio: ['pipe', 'pipe', 'pipe'],
              });

              let stderrBuffer = '';

              // 超时定时器（2 分钟）
              const timeoutHandle = setTimeout(() => {
                child.kill('SIGKILL');
                sendEvent({ type: 'error', data: { message: 'Installation timed out (120s)' } });
                res.end();
              }, 120000);

              // 实时推送 stdout 输出
              child.stdout?.on('data', (chunk: Buffer) => {
                const text = chunk.toString('utf-8');
                console.log('[GUI] install stdout:', text.trim());
                sendEvent({ type: 'progress', data: { message: text.trim() } });
              });

              // 实时推送 stderr 输出（npm 常把进度信息输出到 stderr）
              child.stderr?.on('data', (chunk: Buffer) => {
                const text = chunk.toString('utf-8');
                stderrBuffer += text;
                console.log('[GUI] install stderr:', text.trim());
                sendEvent({ type: 'progress', data: { message: text.trim() } });
              });

              // 进程结束
              child.on('close', (code: number | null) => {
                clearTimeout(timeoutHandle);
                if (code === 0) {
                  console.log('[GUI] Global install succeeded');
                  sendEvent({
                    type: 'success',
                    data: { message: `${packageName} installed globally via ${packageManager}` },
                  });
                } else {
                  console.error('[GUI] Global install failed, exit code:', code);
                  sendEvent({
                    type: 'error',
                    data: { message: `Installation failed (exit code ${code}). ${stderrBuffer.slice(-500)}` },
                  });
                }
                res.end();
              });

              // 进程启动错误
              child.on('error', (err: Error) => {
                clearTimeout(timeoutHandle);
                console.error('[GUI] Global install spawn error:', err);
                sendEvent({ type: 'error', data: { message: err.message } });
                res.end();
              });

              // 客户端断开连接时清理
              req.on('close', () => {
                clearTimeout(timeoutHandle);
                child.kill('SIGKILL');
              });
            } catch (error) {
              console.error('[GUI] Global install error:', error);
              const errorMessage = error instanceof Error ? error.message : String(error);
              sendEvent({ type: 'error', data: { message: errorMessage } });
              res.end();
            }
            return;
          }

          if (pathname === '/api/config/complete' && req.method === 'POST') {
            console.log('[GUI] /api/config/complete request received');
            const body = await readBody(req);
            const data = JSON.parse(body) as { framework?: string; outputDir?: string };

            if (data.framework) state.framework = data.framework;
            if (data.outputDir) state.outputDir = data.outputDir;

            console.log('[GUI] Saving config:', { framework: state.framework, outputDir: state.outputDir });

            const config = {
              $schema: 'https://schema.figma-dev-tools.com/config.json',
              defaultToken: 'default',
              outputDir: state.outputDir,
              framework: state.framework,
              styleFormat: 'tailwind',
              typescript: true,
              colorFormat: 'oklch',
              spacingUnit: 'px',
              importAlias: '@',
              language: state.language,
            };

            writeJson(configPath, config);

            const envPath = path.resolve(process.cwd(), '.env');
            if (!fs.existsSync(envPath)) {
              fs.writeFileSync(
                envPath,
                '# Figma Dev Tools Configuration\n' +
                  '# Token is securely stored in system keychain/encrypted file\n' +
                  '# Set FIGMA_ACCESS_TOKEN environment variable to override\n',
              );
            }

            console.log('[GUI] Config saved successfully');
            sendJson(res, 200, { success: true, config });
            return;
          }

          let filePath = pathname === '/' ? '/index.html' : pathname;
          filePath = path.join(GUI_DIR, filePath);

          const normalizedPath = path.normalize(filePath);
          if (!normalizedPath.startsWith(GUI_DIR)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
          }

          if (fs.existsSync(normalizedPath) && fs.statSync(normalizedPath).isFile()) {
            const content = fs.readFileSync(normalizedPath);
            res.writeHead(200, { 'Content-Type': getMimeType(normalizedPath) });
            res.end(content);
            return;
          }

          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not Found');
        } catch (error) {
          console.error('[GUI] Server error:', error);
          sendJson(res, 500, { success: false, error: 'Internal server error' });
        }
      });

      await new Promise<void>((resolve, reject) => {
        server.listen(port, () => {
          console.log('[GUI] Server listening on port:', port);
          resolve();
        });
        server.on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE') {
            console.log('[GUI] Port', port, 'is in use');
            server.close();
            reject(new Error('EADDRINUSE'));
          } else {
            console.error('[GUI] Server error:', err);
            reject(err);
          }
        });
      });

      console.log('');
      console.log(chalk.cyan.bold('🎨 Figma Dev Tools - GUI Configuration Wizard'));
      console.log(chalk.gray('   ' + '═'.repeat(50)));
      console.log(chalk.green('   ✅ Server started successfully!'));
      console.log('');
      console.log(chalk.white('   🌐 Access URL: ') + chalk.cyan(`http://localhost:${port}`));
      console.log(chalk.white('   📂 GUI directory: ') + chalk.gray(GUI_DIR));
      console.log(chalk.white('   🔢 Version: ') + chalk.gray(VERSION));
      console.log(chalk.white('   🖥️  Platform: ') + chalk.gray(os.platform()));
      console.log('');
      console.log(chalk.yellow('   💡 The browser will open automatically.'));
      console.log(chalk.gray('      Press Ctrl+C to stop the server.'));
      console.log('');

      try {
        await open(`http://localhost:${port}`);
      } catch {
        console.log(chalk.gray('   (Could not open browser automatically, please visit the URL above)'));
      }

      return server;
    } catch (err) {
      if (err instanceof Error && err.message === 'EADDRINUSE') {
        console.log(chalk.yellow(`   ⚠️  Port ${port} is in use, trying next port...`));
        continue;
      }
      console.error('[GUI] Failed to start server:', err);
      throw err;
    }
  }

  throw new Error(`Could not find an available port between ${BASE_PORT} and ${BASE_PORT + MAX_PORT_ATTEMPTS - 1}`);
}
