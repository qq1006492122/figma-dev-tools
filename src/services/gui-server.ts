/**
 * GUI Configuration Server
 *
 * Provides a web-based configuration wizard for figma-dev-tools.
 * Uses Node.js built-in http module - no additional dependencies required.
 *
 * Endpoints:
 *   GET  /              - GUI configuration panel
 *   GET  /api/status    - Get current configuration status`n *   GET  /api/diagnostics/network - Diagnose DNS/proxy/TLS/HTTP connectivity
 *   POST /api/language  - Set display language
 *   POST /api/token     - Set and validate Figma Access Token
 *   GET  /api/editors   - Detect available AI editors
 *   POST /api/editors/install - Install MCP config for specified editor
 *   POST /api/install-global   - Globally install figma-dev-tools via npm
 *   POST /api/config/complete - Complete configuration and save settings
 */

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';

import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import * as tar from 'tar';
import { fileURLToPath } from 'node:url';

import chalk from 'chalk';
import open from 'open';

import { initI18nSync } from '../i18n/index.js';
import type { Language } from '../i18n/index.js';
import { isLibraryCompatibleWithFramework } from './component-library/detect-library.js';
import { canUseFallbackPackage, fetchLatestStableVersion } from '../cli/update-utils.js';
import {
  detectAllEditors,
  getEditorDefinitions,
  resolveConfigPath,
  type DetectionMethod,
} from './editor-detector.js';
import { createFigmaClient, classifyNetworkFailure, type NetworkFailureDetail } from './figma-client.js';
import { createTokenStore } from './token-store.js';
import { FigmaApiError } from '../utils/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GUI_DIR = path.resolve(__dirname, '../../gui');
export const GUI_VERSION_TOKEN = '{{FIGMA_DEV_TOOLS_VERSION}}';

/** package.json 路径（作为版本号唯一来源） */
const PKG_JSON_PATH = path.resolve(__dirname, '../../package.json');

/**
 * P3-32：探测占用端口的 GUI 实例版本（短超时；非本工具服务/失败返回 null）。
 */
function probeOccupantVersion(port: number): Promise<string | null> {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: '127.0.0.1',
        port,
        path: '/api/status',
        timeout: 600,
        headers: { Origin: 'http://localhost' },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => {
          body += chunk.toString('utf8');
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body) as { version?: string };
            resolve(typeof parsed.version === 'string' ? parsed.version : null);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}


export interface ProxyDiagnostic {
  name: string;
  configured: boolean;
  protocol?: string;
  host?: string;
  port?: string;
  authConfigured?: boolean;
}

export interface NetworkDiagnosticResult {
  target: string;
  targetHost: string;
  startedAt: string;
  totalMs: number;
  dns?: { address: string; family: number; ms: number };
  proxy: ProxyDiagnostic[];
  tls?: {
    protocol?: string;
    cipher?: string;
    authorized: boolean;
    authorizationError?: string;
    issuer?: string;
    validTo?: string;
  };
  http?: { status: number; statusText: string; server?: string };
  reachedFigma: boolean;
  error?: { code: string; category: string; message: string; nextAction: string };
}

function sanitizeProxy(name: string, value: string | undefined): ProxyDiagnostic {
  if (!value) return { name, configured: false };
  try {
    const url = new URL(value);
    return {
      name,
      configured: true,
      protocol: url.protocol.replace(':', ''),
      host: url.hostname,
      port: url.port || (url.protocol === 'https:' ? '443' : '80'),
      authConfigured: Boolean(url.username || url.password),
    };
  } catch {
    return { name, configured: true, authConfigured: false };
  }
}

export function snapshotProxyEnvironment(env: NodeJS.ProcessEnv = process.env): ProxyDiagnostic[] {
  return [
    sanitizeProxy('HTTPS_PROXY', env.HTTPS_PROXY || env.https_proxy),
    sanitizeProxy('HTTP_PROXY', env.HTTP_PROXY || env.http_proxy),
    sanitizeProxy('NO_PROXY', env.NO_PROXY || env.no_proxy),
  ];
}

function isAllowedDiagnosticTarget(target: URL): boolean {
  if (target.protocol !== 'https:' || target.username || target.password) return false;
  const host = target.hostname.toLowerCase();
  return host === 'figma.com' || host.endsWith('.figma.com');
}

export async function diagnoseNetwork(
  targetUrl = 'https://api.figma.com/v1/me',
  timeoutMs = 5_000,
): Promise<NetworkDiagnosticResult> {
  const startedAt = new Date();
  const target = new URL(targetUrl);
  if (!isAllowedDiagnosticTarget(target)) {
    throw new Error('Network diagnostic target must be an HTTPS URL on figma.com');
  }

  const result: NetworkDiagnosticResult = {
    target: target.toString(),
    targetHost: target.hostname,
    startedAt: startedAt.toISOString(),
    totalMs: 0,
    proxy: snapshotProxyEnvironment(),
    reachedFigma: false,
  };

  const dnsStart = Date.now();
  try {
    const lookup = await dns.lookup(target.hostname, { all: true });
    const first = lookup[0];
    if (first) {
      result.dns = { address: first.address, family: first.family, ms: Date.now() - dnsStart };
    }
  } catch (error) {
    const detail = classifyNetworkFailure(error as Error & { code?: string });
    result.totalMs = Date.now() - startedAt.getTime();
    result.error = {
      code: detail.code,
      category: detail.category,
      message: detail.message,
      nextAction: detail.nextAction,
    };
    return result;
  }

  await new Promise<void>((resolve) => {
    const request = https.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || 443,
        path: `${target.pathname}${target.search}`,
        method: 'HEAD',
        timeout: timeoutMs,
        headers: {
          'User-Agent': 'figma-dev-tools-network-diagnostics',
          Accept: 'application/json',
        },
      },
      (response) => {
        const tlsSocket = response.socket as import('node:tls').TLSSocket;
        const certificate = tlsSocket.getPeerCertificate?.();
        result.http = {
          status: response.statusCode ?? 0,
          statusText: response.statusMessage ?? '',
          server: typeof response.headers.server === 'string' ? response.headers.server : response.headers.server?.[0],
        };
        result.tls = {
          protocol: tlsSocket.getProtocol?.() ?? undefined,
          cipher: tlsSocket.getCipher?.().name,
          authorized: tlsSocket.authorized,
          authorizationError: tlsSocket.authorizationError?.message,
          issuer: typeof certificate?.issuer === 'string'
            ? certificate.issuer
            : Array.isArray(certificate?.issuer?.O)
              ? certificate.issuer.O[0]
              : certificate?.issuer?.O,
          validTo: certificate?.valid_to,
        };
        result.reachedFigma = response.statusCode !== undefined;
        response.resume();
        response.on('end', resolve);
      },
    );

    request.on('timeout', () => {
      request.destroy(Object.assign(new Error('Request timed out'), { code: 'ETIMEDOUT' }));
    });
    request.on('error', (error) => {
      const detail = classifyNetworkFailure(error as Error & { code?: string });
      result.error = {
        code: detail.code,
        category: detail.category,
        message: detail.message,
        nextAction: detail.nextAction,
      };
      resolve();
    });
    request.end();
  });

  result.totalMs = Date.now() - startedAt.getTime();
  return result;
}
/** 将 package.json 版本注入 GUI HTML，避免静态页面再出现独立版本号 */
export function injectGuiVersion(content: string, version: string): string {
  return content.split(GUI_VERSION_TOKEN).join(version);
}
/** 从 package.json 读取版本号 */
export function readGuiVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(PKG_JSON_PATH, 'utf-8'));
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

const VERSION = readGuiVersion();
const BASE_PORT = 54321;
const MAX_PORT_ATTEMPTS = 10;

function isAllowedLocalOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1')
    );
  } catch {
    return false;
  }
}

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
  /** P3-32：组件库偏好（'auto' | 'none' | 具体库 id；默认 'auto'） */
  componentLibrary: string;
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
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

/** 请求体大小上限（1MB），防止恶意超大 body 导致内存耗尽 */
const MAX_BODY_BYTES = 1 * 1024 * 1024;
/** 慢速/断开请求体的最长等待时间，避免 Promise 永久悬挂 */
const REQUEST_BODY_TIMEOUT_MS = 30_000;

export function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    let settled = false;

    const cleanup = () => {
      clearTimeout(timeoutHandle);
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
      req.off('aborted', onAborted);
      req.off('close', onClose);
    };
    const settle = (action: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      action();
    };
    const fail = (error: Error) => settle(() => reject(error));

    const onData = (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        fail(new Error('Request body too large (max 1MB)'));
        return;
      }
      body += chunk.toString();
    };
    const onEnd = () => settle(() => resolve(body));
    const onError = (error: Error) => fail(error);
    const onAborted = () => fail(new Error('Request aborted before body completion'));
    const onClose = () => fail(new Error('Request closed before body completion'));
    const timeoutHandle = setTimeout(() => {
      req.destroy();
      fail(new Error('Request body timed out'));
    }, REQUEST_BODY_TIMEOUT_MS);
    timeoutHandle.unref?.();

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
    req.on('aborted', onAborted);
    req.on('close', onClose);
  });
}
export interface GuiServerOptions {
  /** 默认打开浏览器；测试或后台启动可显式关闭 */
  openBrowser?: boolean;
  /** 起始端口；默认 54321 */
  port?: number;
}

export async function startGuiServer(options: GuiServerOptions = {}): Promise<http.Server> {
  const preferredPort = options.port ?? BASE_PORT;
  const shouldOpenBrowser = options.openBrowser ?? true;
  console.log('[GUI] Starting GUI server...');
  console.log('[GUI] Version:', VERSION);
  console.log('[GUI] Platform:', os.platform());
  console.log('[GUI] Node.js version:', process.version);
  console.log('[GUI] GUI directory:', GUI_DIR);
  console.log('[GUI] Base port:', preferredPort);

  const i18n = initI18nSync();
  const tokenStore = createTokenStore();

  const state: ServerState = {
    language: i18n.getLanguage(),
    tokenConfigured: false,
    configuredEditors: new Set(),
    framework: 'react',
    outputDir: './src/styles/figma',
    componentLibrary: 'auto',
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
    if (
      typeof existingConfig.componentLibrary === 'string' &&
      ['auto', 'none', 'shadcn-ui', 'ant-design', 'element-plus', 'ant-design-vue'].includes(
        existingConfig.componentLibrary,
      )
    ) {
      state.componentLibrary = existingConfig.componentLibrary;
    }
    console.log('[GUI] Loaded existing config:', {
      framework: state.framework,
      outputDir: state.outputDir,
      componentLibrary: state.componentLibrary,
    });
  }

  let port = preferredPort;
  let server: http.Server;

  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
    port = preferredPort + attempt;
    console.log('[GUI] Trying port:', port);
    try {
      server = http.createServer(async (req, res) => {
        const reqUrl = req.url || '/';
        const urlObj = new URL(reqUrl, `http://localhost:${port}`);
        const pathname = urlObj.pathname;

        const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
        if (!isAllowedLocalOrigin(origin)) {
          res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, error: 'Only localhost origins are allowed' }));
          return;
        }
        if (origin) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Vary', 'Origin');
        }
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        try {
          if (pathname === '/api/diagnostics/network' && req.method === 'GET') {
            const target = urlObj.searchParams.get('target') || 'https://api.figma.com/v1/me';
            try {
              const diagnostic = await diagnoseNetwork(target);
              sendJson(res, diagnostic.error ? 200 : 200, { success: true, diagnostic });
            } catch (error) {
              sendJson(res, 400, {
                success: false,
                error: error instanceof Error ? error.message : 'Invalid diagnostic target',
              });
            }
            return;
          }

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
                componentLibrary: state.componentLibrary,
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
              // 主目录配置文件可能因系统策略（受控目录访问/杀软/只读）不可写：
              // i18n 内存切换在落盘前已完成，且语言会随 /api/config/complete 写入项目级
              // figma-dev.config.json，因此落盘失败不阻断向导，仅降级为「本次会话有效」。
              let persisted = true;
              try {
                await i18n.setLanguage(data.language);
              } catch (err) {
                persisted = false;
                console.warn(
                  '[GUI] Language switched in memory but user-config persistence failed:',
                  err instanceof Error ? err.message : String(err),
                );
              }
              console.log('[GUI] Language set to:', data.language, persisted ? '' : '(in-memory only)');
              sendJson(res, 200, { success: true, language: data.language, persisted });
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
            if (!token || token.length < 20 || !token.startsWith('figd_')) {
              sendJson(res, 400, { success: false, valid: false, category: 'auth', error: 'Invalid token format' });
              return;
            }
            try {
              const client = createFigmaClient({ accessToken: token });
              const userInfo = await client.validateToken();
              if (userInfo) {
                await tokenStore.saveToken('default', token);
                await tokenStore.setDefault('default');
                state.tokenConfigured = true;
                sendJson(res, 200, { success: true, valid: true });
              } else {
                sendJson(res, 200, { success: false, valid: false, category: 'auth', error: 'Token validation failed' });
              }
            } catch (error) {
              const detail: NetworkFailureDetail = error instanceof FigmaApiError && error.status === 0
                ? classifyNetworkFailure(new Error(error.message))
                : classifyNetworkFailure(error as Error);
              console.error('[GUI] Token validation error:', detail.code, detail.category);
              sendJson(res, 200, {
                success: false,
                valid: false,
                category: detail.category,
                code: detail.code,
                retriable: detail.retriable,
                error: detail.message,
                nextAction: detail.nextAction,
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
                    // 提升到 try 外声明，保证失败路径的 finally 也能清理临时目录
                    let tempRoot: string | null = null;
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

                      // ============ npm.cmd 避免 Git Bash/MINGW64 MSYS 版本冲突 ============
                      const npmBin = isWin ? 'npm.cmd' : 'npm';
                      const cmdBin = isWin ? 'cmd.exe' : 'cmd';

                      // 全局包目录
                      const globalPrefix = execFileSync(npmBin, ['root', '-g'], { encoding: 'utf-8', shell: true }).trim();
                      const globalPkgDir = path.join(globalPrefix, 'figma-dev-tools');
                      mkdirp(globalPkgDir);

                      // 先解析 registry 最新稳定版本，全程钉住该版本（不用浮动的 @latest）
                      const latestVersion = await fetchLatestStableVersion(
                        'https://registry.npmjs.org/figma-dev-tools/latest',
                      );

                      // 优先从 registry 拉指定版本 tgz 解压后覆盖（避免从旧版本地目录复制导致内容不新）
                      let srcPkgDir: string;
                      try {
                        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-dev-tools-install-'));
                        execFileSync(npmBin, ['pack', `${packageName}@${latestVersion}`, '--pack-destination', tempRoot], {
                          cwd: tempRoot,
                          stdio: 'pipe',
                          shell: true,
                        });
                        const tgzList = fs.readdirSync(tempRoot).filter((f) => f.endsWith('.tgz'));
                        if (tgzList.length === 0) throw new Error('npm pack produced no tgz');
                        const tgzPath = path.join(tempRoot, tgzList[0] as string);
                        await tar.x({ file: tgzPath, cwd: tempRoot, strict: true });
                        srcPkgDir = path.join(tempRoot, 'package');
                        if (!fs.existsSync(srcPkgDir)) throw new Error('tgz extract failed: package/ not found');
                      } catch (packErr) {
                        throw new Error(
                          `Failed to fetch the v${latestVersion} package: ${packErr instanceof Error ? packErr.message : String(packErr)}`,
                        );
                      }

                      // 来源包版本必须与目标版本严格一致（仅校验格式不足以发现镜像滞后/拉错版本）
                      const sourcePkg = JSON.parse(fs.readFileSync(path.join(srcPkgDir, 'package.json'), 'utf8')) as { version?: unknown };
                      if (!canUseFallbackPackage(sourcePkg.version, latestVersion)) {
                        throw new Error(
                          `Fallback package version mismatch: expected v${latestVersion}, got v${String(sourcePkg.version)}`,
                        );
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

                      // 落盘后重读 package.json 校验：robocopy /E 会跳过被锁文件，
                      // 不校验可能在内容实际未更新时仍向前端谎报 success
                      const installedPkg = JSON.parse(fs.readFileSync(dstPkgJson, 'utf8')) as { version?: unknown };
                      if (!canUseFallbackPackage(installedPkg.version, latestVersion)) {
                        throw new Error(
                          `Post-update version verification failed: expected v${latestVersion}, got v${String(installedPkg.version)}`,
                        );
                      }

                      console.log('[GUI] Fallback copy succeeded');
                      sendEvent({
                        type: 'success',
                        data: {
                          message: `${packageName} updated to v${latestVersion} via fallback copy (EBUSY bypass). Please restart the editor to apply changes`,
                        },
                      });
                    } catch (fallbackError) {
                      console.error('[GUI] Fallback copy also failed:', fallbackError);
                      const reason = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
                      sendEvent({
                        type: 'error',
                        data: {
                          message: `Installation failed (EBUSY): ${reason}. Please close the editor (Trae/Cursor/VS Code) and try again, or run manually: npm install -g figma-dev-tools`,
                        },
                      });
                    } finally {
                      // 成功/失败都立即清理临时目录，5s 后再幂等兜底一次（应对文件短暂占用）
                      if (tempRoot) {
                        const target = tempRoot;
                        try {
                          fs.rmSync(target, { recursive: true, force: true, maxRetries: 2 });
                        } catch {
                          /* ignore */
                        }
                        setTimeout(() => {
                          try {
                            fs.rmSync(target, { recursive: true, force: true, maxRetries: 2 });
                          } catch {
                            /* ignore */
                          }
                        }, 5000).unref?.();
                      }
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
            const data = JSON.parse(body) as { framework?: string; outputDir?: string; componentLibrary?: string };

            if (data.framework) state.framework = data.framework;
            if (data.outputDir) state.outputDir = data.outputDir;
            // P3-32：组件库偏好白名单校验（非法值不写盘，回退 auto）
            const UI_LIB_VALUES = ['auto', 'none', 'shadcn-ui', 'ant-design', 'element-plus', 'ant-design-vue'];
            const rawLibrary =
              typeof data.componentLibrary === 'string' && UI_LIB_VALUES.includes(data.componentLibrary)
                ? data.componentLibrary
                : 'auto';
            // R1 QA：框架×组件库匹配校验（如 framework=react + element-plus 是无效配置，
            // 前端选择器已限制，这里拦截直接构造的 API 请求，不落盘）
            const frameworkForCheck = state.framework;
            if (
              (frameworkForCheck === 'react' || frameworkForCheck === 'vue') &&
              !isLibraryCompatibleWithFramework(frameworkForCheck, rawLibrary)
            ) {
              sendJson(res, 400, {
                success: false,
                error: `组件库 "${rawLibrary}" 与框架 "${frameworkForCheck}" 不匹配（FDT-UI-LIB-FRAMEWORK-MISMATCH），配置未保存`,
              });
              return;
            }
            const componentLibrary = rawLibrary;
            state.componentLibrary = componentLibrary;

            console.log('[GUI] Saving config:', {
              framework: state.framework,
              outputDir: state.outputDir,
              componentLibrary,
            });

            const config: Record<string, unknown> = {
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
            if (componentLibrary && componentLibrary !== 'none') {
              config.componentLibrary = componentLibrary;
            }

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
            let content = fs.readFileSync(normalizedPath);
            if (normalizedPath === path.join(GUI_DIR, 'index.html')) {
              content = Buffer.from(injectGuiVersion(content.toString('utf-8'), VERSION), 'utf-8');
            }
            res.writeHead(200, { 'Content-Type': getMimeType(normalizedPath), 'Cache-Control': 'no-store' });
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
        server.listen(port, '127.0.0.1', () => {
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
      if (shouldOpenBrowser) {
        console.log(chalk.yellow('   💡 The browser will open automatically.'));
      } else {
        console.log(chalk.gray('   Browser auto-open is disabled for this session.'));
      }
      console.log(chalk.gray('      Press Ctrl+C to stop the server.'));
      console.log('');

      if (shouldOpenBrowser) {
        try {
          await open(`http://localhost:${port}`);
        } catch {
          console.log(chalk.gray('   (Could not open browser automatically, please visit the URL above)'));
        }
      }

      return server;
    } catch (err) {
      if (err instanceof Error && err.message === 'EADDRINUSE') {
        // P3-32：端口被占时探测占用方版本，提示用户「浏览器看到的可能是旧实例」
        if (attempt === 0) {
          const occupantVersion = await probeOccupantVersion(port).catch(() => null);
          if (occupantVersion && occupantVersion !== VERSION) {
            console.log(
              chalk.yellow(
                `   ⚠️  端口 ${port} 已被旧版本 GUI 占用（运行中 v${occupantVersion}，当前 v${VERSION}）。\n` +
                  `      浏览器若仍打开 http://localhost:${preferredPort}/ 看到的会是旧版本；请结束旧实例后重试，或使用下方新端口。`,
              ),
            );
          } else {
            console.log(chalk.yellow(`   ⚠️  Port ${port} is in use, trying next port...`));
          }
        } else {
          console.log(chalk.yellow(`   ⚠️  Port ${port} is in use, trying next port...`));
        }
        continue;
      }
      console.error('[GUI] Failed to start server:', err);
      throw err;
    }
  }

  throw new Error(`Could not find an available port between ${preferredPort} and ${preferredPort + MAX_PORT_ATTEMPTS - 1}`);
}
