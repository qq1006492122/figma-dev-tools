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
 *   POST /api/config/complete - Complete configuration and save settings
 */

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
const VERSION = '1.4.2';

interface EditorInfo {
  name: string;
  detected: boolean;
  installed: boolean;
  configPath?: string;
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
}

function getEditorConfigs(): EditorPathConfig[] {
  return [
    { name: 'Trae', paths: getTraePaths() },
    { name: 'VS Code', paths: getVSCodePaths() },
    { name: 'Cursor', paths: getCursorPaths() },
    { name: 'Windsurf', paths: getWindsurfPaths() },
    { name: 'Claude Desktop', paths: getClaudeDesktopPaths() },
    { name: 'Zed', paths: getZedPaths(), zedFormat: true },
    { name: 'Cline', paths: getClinePaths() },
    { name: 'Roo Code', paths: getRooCodePaths() },
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

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => resolve(body));
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
