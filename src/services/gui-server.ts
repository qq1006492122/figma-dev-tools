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

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';

import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import chalk from 'chalk';
import open from 'open';

import { initI18nSync } from '../i18n/index.js';
import type { Language } from '../i18n/index.js';
import {
  detectAllEditors,
  getEditorDefinitions,
  resolveConfigPath,
  type DetectionMethod,
} from './editor-detector.js';
import { createFigmaClient } from './figma-client.js';
import { createTokenStore } from './token-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GUI_DIR = path.resolve(__dirname, '../../gui');

/** package.json 路径（作为版本号唯一来源） */
const PKG_JSON_PATH = path.resolve(__dirname, '../../package.json');

/** 从 package.json 读取版本号 */
function readVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(PKG_JSON_PATH, 'utf-8'));
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

const VERSION = readVersion();
const BASE_PORT = 54321;
const MAX_PORT_ATTEMPTS = 10;

interface EditorInfo {
  id: string;
  name: string;
  detected: boolean;
  installed: boolean;
  configPath?: string;
  /** 编辑器官网下载地址，用于未安装时引导用户前往下载 */
  website?: string;
  /** 命中的检测方式（process / executable / desktop-entry / registry / config-dir） */
  detectionMethod: DetectionMethod | 'none';
  /** 所有命中的检测方式（用于详细展示） */
  matchedMethods: DetectionMethod[];
  /** 命中的可执行文件绝对路径（若有） */
  executablePath?: string;
  /** 可信度评分 0-100 */
  confidence: number;
}

interface ServerState {
  language: Language;
  tokenConfigured: boolean;
  configuredEditors: Set<string>;
  framework: string;
  outputDir: string;
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

/**
 * 检测所有编辑器，返回排序后的列表（已安装优先）
 */
function detectAllEditorsWithInfo(): EditorInfo[] {
  return detectAllEditors().map(({ definition, detection }) => {
    const info: EditorInfo = {
      id: definition.id,
      name: definition.name,
      detected: detection.detected,
      installed: detection.installed,
      configPath: detection.configPath,
      website: definition.website,
      detectionMethod: detection.method,
      matchedMethods: detection.matchedMethods,
      executablePath: detection.executablePath,
      confidence: detection.confidence,
    };
    return info;
  });
}

/**
 * 安装 MCP 配置到指定编辑器
 * 使用 editor-detector 提供的多维数据
 */
function installForEditorById(editorId: string): { success: boolean; configPath?: string; error?: string } {
  const def = getEditorDefinitions().find((d) => d.id === editorId);
  if (!def) return { success: false, error: `Editor '${editorId}' not found` };

  const serverEntry = getMcpServerEntry();
  const configPath = resolveConfigPath(def);
  if (!configPath) return { success: false, error: 'No config path available for this editor' };

  try {
    const existing = readJsonSafe(configPath) || {};
    const serversKey = def.zedFormat ? 'mcp_servers' : 'mcpServers';
    const existingRecord = existing as Record<string, unknown>;
    if (!existingRecord[serversKey]) {
      existingRecord[serversKey] = {};
    }
    (existingRecord[serversKey] as Record<string, unknown>)['figma-dev-tools'] = serverEntry;
    writeJson(configPath, existing as Record<string, unknown>);
    return { success: true, configPath };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
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

          // 验证已存储的 Token（"使用现有 Token" 按钮）
          if (pathname === '/api/token/validate-existing' && req.method === 'POST') {
            console.log('[GUI] /api/token/validate-existing request received');
            try {
              const storedToken = await tokenStore.getToken();
              if (!storedToken) {
                console.log('[GUI] No existing token found in storage');
                sendJson(res, 200, { success: false, valid: false, error: 'No stored token found' });
                return;
              }
              console.log('[GUI] Validating stored token with Figma API...');
              const client = createFigmaClient({ accessToken: storedToken });
              const isValid = await client.validateToken();
              console.log('[GUI] Stored token validation result:', isValid);
              if (isValid) {
                sendJson(res, 200, { success: true, valid: true });
              } else {
                sendJson(res, 200, { success: false, valid: false, error: 'Stored token is invalid' });
              }
            } catch (error) {
              console.error('[GUI] Validate existing token error:', error);
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
            const editors = detectAllEditorsWithInfo();
            // 合并运行时配置状态（用户在本会话中已安装的编辑器）
            for (const editor of editors) {
              if (state.configuredEditors.has(editor.id)) {
                editor.installed = true;
              }
            }
            sendJson(res, 200, { success: true, editors });
            return;
          }

          if (pathname === '/api/editors/install' && req.method === 'POST') {
            console.log('[GUI] /api/editors/install request received');
            const body = await readBody(req);
            const data = JSON.parse(body) as { editor?: string };
            const editorId = data.editor;

            if (!editorId) {
              sendJson(res, 400, { success: false, error: 'Editor id required' });
              return;
            }

            try {
              console.log('[GUI] Installing for editor:', editorId);
              const result = installForEditorById(editorId);
              if (result.success) {
                state.configuredEditors.add(editorId);
                console.log('[GUI] Editor installed successfully:', editorId);
                sendJson(res, 200, { success: true, editor: editorId, configPath: result.configPath });
              } else {
                console.log('[GUI] Editor config directory not found:', editorId, result.error);
                sendJson(res, 200, {
                  success: false,
                  error: result.error || 'Editor config directory not found',
                  editor: editorId,
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
              child.on('close', async (code: number | null) => {
                clearTimeout(timeoutHandle);
                if (code === 0) {
                  console.log('[GUI] Global install succeeded');
                  sendEvent({
                    type: 'success',
                    data: { message: `${packageName} installed globally via ${packageManager}` },
                  });
                } else {
                  console.error('[GUI] Global install failed, exit code:', code);
                  // 检测是否因 EBUSY 失败（MCP 进程占用文件）
                  const isEBUSY = stderrBuffer.includes('EBUSY') || stderrBuffer.includes('errno -4082');
                  if (isEBUSY) {
                    console.log('[GUI] Detected EBUSY error, trying fallback copy...');
                    sendEvent({ type: 'progress', data: { message: 'Detected file lock, trying fallback copy...' } });
                    const isWin = os.platform() === 'win32';
                    try {
                      const runRobocopy = (srcDir: string, dstDir: string): void => {
                        const res = spawnSync(
                          'robocopy',
                          [srcDir, dstDir, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NC', '/NS', '/R:2', '/W:1', '/XF', '*.ps1'],
                          { shell: true, stdio: 'pipe' },
                        );
                        const rc = res.status ?? -1;
                        // robocopy exit <8 为成功；用 /E 而非 /MIR 避免删不掉锁文件导致整体失败
                        if (rc >= 8) {
                          const errMsg = (res.stderr ?? '').toString() || (res.stdout ?? '').toString();
                          throw new Error(`robocopy exit=${rc}: ${errMsg.trim()}`);
                        }
                      };
                      const mkdirp = (p: string): void => {
                        if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
                      };
                      const rmtree = (p: string): void => {
                        if (!fs.existsSync(p)) return;
                        fs.rmSync(p, { recursive: true, force: true, maxRetries: 2 });
                      };

                      // ============ npm.cmd 避免 Git Bash/MINGW64 MSYS 版本冲突 ============
                      const npmBin = isWin ? 'npm.cmd' : 'npm';
                      const cmdBin = isWin ? 'cmd.exe' : 'cmd';

                      // 全局包目录
                      const globalPrefix = execFileSync(npmBin, ['root', '-g'], { encoding: 'utf-8', shell: true }).trim();
                      const globalPkgDir = path.join(globalPrefix, 'figma-dev-tools');
                      mkdirp(globalPkgDir);

                      // 优先从 registry 拉最新 tgz 解压后覆盖（避免从旧版本地目录复制导致内容不新）
                      let srcPkgDir: string;
                      let tempRoot: string | null = null;
                      try {
                        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-dev-tools-install-'));
                        execFileSync(npmBin, ['pack', `${packageName}@latest`, '--pack-destination', tempRoot], {
                          cwd: tempRoot,
                          stdio: 'pipe',
                          shell: true,
                        });
                        const tgzList = fs.readdirSync(tempRoot).filter((f) => f.endsWith('.tgz'));
                        if (tgzList.length === 0) throw new Error('npm pack produced no tgz');
                        const tgzPath = path.join(tempRoot, tgzList[0] as string);
                        try {
                          execFileSync('tar', ['-xzf', tgzPath, '-C', tempRoot], { stdio: 'pipe', shell: true });
                        } catch (tarErr) {
                          const untarScript =
                            "require('tar').x({file:" + JSON.stringify(tgzPath) +
                            ",cwd:" + JSON.stringify(tempRoot) + ",sync:true})";
                          try { execFileSync('node', ['-e', untarScript], { stdio: 'pipe', shell: true }); } catch {
                            throw tarErr;
                          }
                        }
                        srcPkgDir = path.join(tempRoot, 'package');
                        if (!fs.existsSync(srcPkgDir)) throw new Error('tgz extract failed: package/ not found');
                      } catch (packErr) {
                        // 兜底：从本地已加载的包目录复制
                        const currentDir = path.dirname(fileURLToPath(import.meta.url));
                        srcPkgDir = path.resolve(currentDir, '../..');
                      }

                      const subdirs = ['dist', 'gui', 'bin'];
                      for (const d of subdirs) {
                        const s = path.join(srcPkgDir, d);
                        if (!fs.existsSync(s)) continue;
                        if (isWin) {
                          runRobocopy(s, path.join(globalPkgDir, d));
                        } else {
                          execFileSync('cp', ['-r', `${s}/`, path.join(globalPkgDir, d)], { stdio: 'pipe' });
                        }
                      }
                      const srcPkgJson = path.join(srcPkgDir, 'package.json');
                      const dstPkgJson = path.join(globalPkgDir, 'package.json');
                      if (isWin) {
                        execFileSync(cmdBin, ['/c', 'copy', '/Y', srcPkgJson, dstPkgJson], { stdio: 'pipe', shell: true });
                      } else {
                        execFileSync('cp', [srcPkgJson, dstPkgJson], { stdio: 'pipe' });
                      }

                      if (tempRoot) {
                        // 延迟清理，避免文件刚复制完仍被占用
                        setTimeout(() => { try { rmtree(tempRoot as string); } catch { /* ignore */ } }, 5000);
                      }

                      console.log('[GUI] Fallback copy succeeded');
                      sendEvent({ type: 'success', data: { message: `${packageName} updated via fallback copy (EBUSY bypass)` } });
                    } catch (fallbackError) {
                      console.error('[GUI] Fallback copy also failed:', fallbackError);
                      sendEvent({
                        type: 'error',
                        data: {
                          message: `Installation failed (EBUSY). Please close the editor (Trae/Cursor/VS Code) and try again, or run manually: npm install -g figma-dev-tools`,
                        },
                      });
                    }
                  } else {
                    sendEvent({
                      type: 'error',
                      data: { message: `Installation failed (exit code ${code}). ${stderrBuffer.slice(-500)}` },
                    });
                  }
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
