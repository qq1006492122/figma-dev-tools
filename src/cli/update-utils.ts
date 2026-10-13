/**
 * 更新工具集（v1.4.20 重构）
 *
 * v1.4.20 修复：
 * - 读取 npm 配置的 registry（支持国内镜像）
 * - 原生 fetch 不支持代理 → 改用 axios + https-proxy-agent
 * - 支持自定义 CA 证书（复用 tls-agent）
 * - 主 registry 失败自动 fallback 到 npmmirror
 * - 错误信息分类，给出可操作建议
 *
 * @module
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import axios, { type AxiosError } from 'axios';

import { buildRequestAgent, loadCustomCaConfig, type ProxyTarget } from '../services/tls-agent.js';

const STABLE_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** 默认 npm registry */
const DEFAULT_NPM_REGISTRY = 'https://registry.npmjs.org';
/** 国内镜像兜底 registry */
const FALLBACK_NPM_REGISTRY = 'https://registry.npmmirror.com';

export function isValidStableVersion(version: unknown): version is string {
  return typeof version === 'string' && STABLE_VERSION_PATTERN.test(version);
}

export function compareStableVersions(left: string, right: string): -1 | 0 | 1 {
  if (!isValidStableVersion(left) || !isValidStableVersion(right)) {
    throw new Error('版本号必须是稳定的 major.minor.patch SemVer');
  }
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < leftParts.length; index++) {
    if (leftParts[index]! > rightParts[index]!) return 1;
    if (leftParts[index]! < rightParts[index]!) return -1;
  }
  return 0;
}

// ============ Registry 检测 ============

/**
 * 检测当前 npm 配置使用的 registry 地址。
 *
 * 优先级：
 * 1. `npm config get registry` 命令输出
 * 2. 用户目录 `.npmrc` 中的 registry 配置
 * 3. 项目目录 `.npmrc` 中的 registry 配置
 * 4. 默认 `https://registry.npmjs.org`
 */
export function detectNpmRegistry(): string {
  // 1. 尝试执行 npm config get registry
  try {
    const isWin = os.platform() === 'win32';
    const npmBin = isWin ? 'npm.cmd' : 'npm';
    const output = execFileSync(npmBin, ['config', 'get', 'registry'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
      shell: true,
    }).trim();
    if (output && /^https?:\/\//.test(output)) {
      return output.replace(/\/$/, '');
    }
  } catch {
    // npm 命令不可用或超时，继续尝试 .npmrc
  }

  // 2. 尝试读取用户目录 .npmrc
  try {
    const userNpmrc = path.join(os.homedir(), '.npmrc');
    if (fs.existsSync(userNpmrc)) {
      const registry = parseNpmrcRegistry(fs.readFileSync(userNpmrc, 'utf-8'));
      if (registry) return registry;
    }
  } catch {
    // 忽略读取错误
  }

  // 3. 尝试读取当前工作目录 .npmrc
  try {
    const localNpmrc = path.join(process.cwd(), '.npmrc');
    if (fs.existsSync(localNpmrc)) {
      const registry = parseNpmrcRegistry(fs.readFileSync(localNpmrc, 'utf-8'));
      if (registry) return registry;
    }
  } catch {
    // 忽略读取错误
  }

  // 4. 默认
  return DEFAULT_NPM_REGISTRY;
}

/**
 * 从 .npmrc 内容中解析 registry 配置
 */
export function parseNpmrcRegistry(content: string): string | null {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
    // 支持 registry=https://... 或 registry = https://...
    const match = trimmed.match(/^registry\s*=\s*(.+)$/i);
    if (match) {
      const url = match[1]!.trim().replace(/\/$/, '');
      if (/^https?:\/\//.test(url)) return url;
    }
  }
  return null;
}

// ============ 代理检测 ============

/**
 * 从环境变量检测代理配置（与 figma-client 逻辑一致）
 */
export function detectProxyFromEnv(targetHost?: string): ProxyTarget | false {
  const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
  const noProxy = process.env.NO_PROXY || process.env.no_proxy;

  const proxyUrl = httpsProxy || httpProxy;
  if (!proxyUrl) return false;

  // 检查 NO_PROXY 是否匹配目标域名
  if (noProxy && targetHost) {
    const noProxyList = noProxy.split(',').map((s) => s.trim().toLowerCase());
    const host = targetHost.toLowerCase();
    for (const noProxyEntry of noProxyList) {
      if (noProxyEntry === '*' || host === noProxyEntry || host.endsWith('.' + noProxyEntry)) {
        return false;
      }
    }
  }

  try {
    const url = new URL(proxyUrl);
    return {
      host: url.hostname,
      port: Number.parseInt(url.port || (url.protocol === 'https:' ? '443' : '80'), 10),
      protocol: url.protocol === 'https:' ? 'https' : 'http',
      username: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
    };
  } catch {
    return false;
  }
}

// ============ 网络错误分类 ============

/**
 * 网络错误分类，用于给出可操作的修复建议
 */
export type NetworkErrorCategory =
  | 'dns' // DNS 解析失败
  | 'timeout' // 连接/读取超时
  | 'connection-refused' // 连接被拒绝
  | 'tls' // TLS/SSL 证书错误
  | 'proxy' // 代理相关错误
  | 'network' // 其他网络错误
  | 'http' // HTTP 状态码错误
  | 'unknown';

export interface ClassifiedError {
  category: NetworkErrorCategory;
  message: string;
  suggestion: string;
}

/**
 * 分类网络错误并给出修复建议
 */
export function classifyNetworkError(error: unknown, registryUrl: string): ClassifiedError {
  if (axios.isAxiosError(error)) {
    const axiosErr = error as AxiosError;
    const code = axiosErr.code || '';
    const message = axiosErr.message || '';

    // HTTP 状态码错误
    if (axiosErr.response) {
      const status = axiosErr.response.status;
      return {
        category: 'http',
        message: `registry 返回 HTTP ${status}`,
        suggestion:
          status >= 500
            ? `registry 服务端错误 (${status})，稍后重试或切换镜像：npm config set registry ${FALLBACK_NPM_REGISTRY}`
            : `请求被拒绝 (HTTP ${status})，检查网络或切换镜像`,
      };
    }

    // 超时
    if (code === 'ECONNABORTED' || /timeout/i.test(message)) {
      return {
        category: 'timeout',
        message: '请求超时',
        suggestion: `网络较慢，可尝试切换镜像：npm config set registry ${FALLBACK_NPM_REGISTRY}；或检查代理设置 HTTP_PROXY/HTTPS_PROXY`,
      };
    }

    // DNS 解析失败
    if (code === 'ENOTFOUND' || /getaddrinfo/i.test(message) || /dns/i.test(message)) {
      return {
        category: 'dns',
        message: `无法解析域名 ${new URL(registryUrl).hostname}`,
        suggestion: `DNS 解析失败。检查网络/DNS 设置，或切换镜像：npm config set registry ${FALLBACK_NPM_REGISTRY}`,
      };
    }

    // 连接被拒绝
    if (code === 'ECONNREFUSED') {
      return {
        category: 'connection-refused',
        message: '连接被拒绝',
        suggestion: `目标主机拒绝连接。检查防火墙/代理设置，或切换镜像：npm config set registry ${FALLBACK_NPM_REGISTRY}`,
      };
    }

    // TLS/SSL 错误
    if (code === 'CERT_HAS_EXPIRED' || code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || code === 'SELF_SIGNED_CERT_IN_CHAIN' || /certificate/i.test(message)) {
      return {
        category: 'tls',
        message: `TLS 证书验证失败 (${code || message})`,
        suggestion: `证书验证失败。如为企业内网自签证书，设置环境变量 FIGMA_CA_CERT_PATH 指向 CA 证书；或临时用 npm config set registry ${FALLBACK_NPM_REGISTRY}`,
      };
    }

    // 代理错误
    if (code === 'ECONNRESET' || /proxy/i.test(message) || code === 'EPROTO') {
      return {
        category: 'proxy',
        message: `代理连接失败 (${code || message})`,
        suggestion: '检查 HTTP_PROXY/HTTPS_PROXY 环境变量是否正确，或暂时取消代理后重试',
      };
    }

    // 网络不可达
    if (code === 'ENETUNREACH' || code === 'EHOSTUNREACH') {
      return {
        category: 'network',
        message: '网络不可达',
        suggestion: '检查网络连接是否正常，或切换镜像源',
      };
    }

    return {
      category: 'network',
      message: `网络错误 (${code || message})`,
      suggestion: `检查网络连接，或切换镜像：npm config set registry ${FALLBACK_NPM_REGISTRY}`,
    };
  }

  // 非 axios 错误
  const msg = error instanceof Error ? error.message : String(error);
  return {
    category: 'unknown',
    message: msg,
    suggestion: `未知错误，可尝试切换镜像：npm config set registry ${FALLBACK_NPM_REGISTRY}`,
  };
}

// ============ fetchLatestStableVersion（重构版） ============

export interface FetchLatestStableVersionOptions {
  /** 自定义 registry 地址列表（按顺序尝试，全部失败才报错） */
  registries?: string[];
  /** 最大重试次数（单个 registry） */
  maxAttempts?: number;
  /** 超时时间（毫秒） */
  timeoutMs?: number;
  /** 测试接缝：可注入的请求实现 */
  requestImpl?: (url: string, options: { timeoutMs: number }) => Promise<{ version?: unknown }>;
  /** 测试接缝：可注入的 registry 检测函数 */
  registryDetector?: () => string;
  /** 测试接缝：可注入的代理检测函数 */
  proxyDetector?: (host: string) => ProxyTarget | false;
}

/**
 * 获取 npm 上 figma-dev-tools 的最新稳定版本号。
 *
 * v1.4.20 改进：
 * - 自动读取 npm 配置的 registry（支持国内镜像）
 * - 支持 HTTP_PROXY/HTTPS_PROXY 代理
 * - 支持 FIGMA_CA_CERT_PATH 自定义 CA 证书
 * - 主 registry 失败后自动 fallback 到 npmmirror
 * - 错误信息分类，给出可操作建议
 */
export async function fetchLatestStableVersion(
  packageName: string,
  options: FetchLatestStableVersionOptions = {},
): Promise<string> {
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? 3, 5));
  const timeoutMs = Math.max(100, Math.min(options.timeoutMs ?? 15_000, 60_000));

  // 构建 registry 列表：用户指定 > 自动检测 > 默认 > 兜底镜像
  const detectedRegistry = options.registryDetector
    ? options.registryDetector()
    : detectNpmRegistry();
  const registries = options.registries && options.registries.length > 0
    ? options.registries
    : [detectedRegistry, FALLBACK_NPM_REGISTRY];

  // 去重（保持顺序）
  const uniqueRegistries = Array.from(new Set(registries));

  // 构建 axios 实例（带代理 + CA）
  const proxyDetector = options.proxyDetector ?? detectProxyFromEnv;
  const registryHost = new URL(uniqueRegistries[0]!).hostname;
  const proxyConfig = proxyDetector(registryHost);
  const caConfig = (() => {
    try {
      return loadCustomCaConfig();
    } catch {
      // CA 配置错误不阻断，仅在 TLS 错误时提示
      return undefined;
    }
  })();

  const httpsAgent = buildRequestAgent({ proxyConfig, caConfig });

  // 默认请求实现：axios
  const defaultRequest = async (url: string, reqOptions: { timeoutMs: number }) => {
    const response = await axios.get(url, {
      timeout: reqOptions.timeoutMs,
      httpsAgent,
      proxy: false, // 使用 agent 而非 axios 内置 proxy
      headers: { Accept: 'application/json' },
      // 不自动抛出非 2xx，由调用方处理
      validateStatus: () => true,
    });
    if (response.status >= 200 && response.status < 300) {
      return response.data as { version?: unknown };
    }
    const err = new Error(`HTTP ${response.status}`) as Error & { code?: string; response?: { status: number } };
    err.response = { status: response.status };
    throw err;
  };

  const requestImpl = options.requestImpl ?? defaultRequest;

  let lastClassified: ClassifiedError | null = null;
  const triedRegistries: string[] = [];

  for (const registry of uniqueRegistries) {
    triedRegistries.push(registry);
    const url = `${registry.replace(/\/$/, '')}/${packageName}/latest`;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const data = await requestImpl(url, { timeoutMs });
        if (!isValidStableVersion(data.version)) {
          throw new Error(`registry 返回的版本号无效: ${String(data.version)}`);
        }
        return data.version;
      } catch (error) {
        lastClassified = classifyNetworkError(error, url);
        // 最后一次尝试或最后一个 registry 才延迟
        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
        }
      }
    }
  }

  // 所有 registry 都失败
  const detail = lastClassified
    ? `${lastClassified.message}（已尝试: ${triedRegistries.join(', ')}）。建议：${lastClassified.suggestion}`
    : `无法获取最新版本（已尝试: ${triedRegistries.join(', ')}）`;

  throw new Error(detail);
}

// ============ 更新流程辅助 ============

export interface UpdateAttemptState {
  installSucceeded: boolean;
  fallbackSucceeded: boolean;
}

export function getUpdateExitCode(state: UpdateAttemptState): 0 | 1 {
  return state.installSucceeded || state.fallbackSucceeded ? 0 : 1;
}

export function canUseFallbackPackage(sourceVersion: unknown, targetVersion: unknown): boolean {
  return (
    isValidStableVersion(sourceVersion) &&
    isValidStableVersion(targetVersion) &&
    compareStableVersions(sourceVersion, targetVersion) === 0
  );
}
