/**
 * TLS Agent 工厂（v1.4.18 T3）
 *
 * 统一处理企业内网常见的「自签名 / 私有根 CA」场景：
 * 当环境变量 `FIGMA_CA_CERT_PATH` 指向一个 PEM 证书文件时，构造
 * 同时信任系统内置根证书（{@link tls.rootCertificates}）与该自定义 CA 的
 * https.Agent，供 axios（figma-client）与 node:https 下载路径（ocr-service）共用。
 *
 * 契约：
 * - 未配置（缺省 / 空串）→ 返回 undefined，网络行为与 1.4.17 完全一致；
 * - 配置但文件缺失 / 不可读 / 非 PEM → 抛出 i18n（zh-CN/en-US）错误，不静默回退，
 *   避免用户在误以为证书已生效的状态下工作；
 * - Agent 进程内单例缓存（环境变量在进程生命周期内视为不变）。
 *
 * @packageDocumentation
 */
import * as fs from 'node:fs';
import * as https from 'node:https';
import * as tls from 'node:tls';

import { HttpsProxyAgent } from 'https-proxy-agent';

import { getI18n } from '../i18n/index.js';

/** 自定义 CA 证书路径的环境变量名 */
export const FIGMA_CA_CERT_PATH_ENV = 'FIGMA_CA_CERT_PATH';

/** PEM 证书边界标记（缺失即判定文件内容无效） */
const PEM_BEGIN_MARKER = '-----BEGIN CERTIFICATE-----';

/**
 * 解析后的自定义 CA 配置
 */
export interface CustomCaConfig {
  /** CA 证书文件绝对/相对路径（原样保留，用于错误回显） */
  readonly certPath: string;
  /** 自定义 CA PEM 文本列表（与系统根证书合并使用） */
  readonly extraCa: readonly string[];
}

/**
 * 测试/配置接缝：可注入环境变量、显式证书路径与文件读取实现
 */
export interface TlsAgentSeams {
  /** 显式 CA 路径（如 ssl.caCertPath 配置），优先级高于环境变量 */
  readonly certPath?: string;
  /** 环境变量映射，默认 process.env */
  readonly env?: NodeJS.ProcessEnv;
  /** 同步读取文件实现（接收 UTF-8 编码），默认 fs.readFileSync */
  readonly readFileSync?: (filePath: string) => string;
}

/**
 * 读取并校验自定义 CA 配置
 *
 * 路径来源优先级：显式 `seams.certPath`（代码内 ssl.caCertPath 配置）
 * > `FIGMA_CA_CERT_PATH` 环境变量。
 *
 * @param seams 可选测试/配置接缝
 * @returns 配置存在且有效返回 {@link CustomCaConfig}；均未配置返回 undefined
 * @throws 配置路径不可读或内容非 PEM 时抛出当前语言的 i18n 错误
 */
export function loadCustomCaConfig(seams: TlsAgentSeams = {}): CustomCaConfig | undefined {
  const env = seams.env ?? process.env;
  const envPath = env[FIGMA_CA_CERT_PATH_ENV];
  // 显式配置优先；其次环境变量；纯空白视为未配置
  const certPath = (seams.certPath ?? (typeof envPath === 'string' ? envPath : '')).trim();
  if (certPath.length === 0) {
    return undefined;
  }

  const readFile = seams.readFileSync ?? ((filePath: string) => fs.readFileSync(filePath, 'utf8'));
  let pemText: string;
  try {
    pemText = readFile(certPath);
  } catch (error) {
    // 文件不存在 / 权限不足等：区分消息但都走 i18n，且不吞掉路径信息
    const reason = error instanceof Error ? error.message : String(error);
    if (/ENOENT|no such file/i.test(reason)) {
      throw new Error(getI18n().t('cli.errors.labels.caCertPathMissing', certPath) as string);
    }
    throw new Error(getI18n().t('cli.errors.labels.caCertReadFailed', certPath, reason) as string);
  }

  if (!pemText.includes(PEM_BEGIN_MARKER)) {
    throw new Error(getI18n().t('cli.errors.labels.caCertInvalid', certPath) as string);
  }
  return { certPath, extraCa: [pemText] };
}

/**
 * 构造信任自定义 CA 的 https.Agent
 *
 * Agent 的 ca 列表为「系统根证书 + 自定义 CA PEM」，因此公有网站与私有
 * CA 签发的内网端点可同时被信任。
 *
 * @param seams 可选测试接缝
 * @returns 配置存在时返回 Agent；未配置返回 undefined
 */
export function createCustomHttpsAgent(seams: TlsAgentSeams = {}): https.Agent | undefined {
  const config = loadCustomCaConfig(seams);
  if (config === undefined) {
    return undefined;
  }
  return new https.Agent({
    keepAlive: true,
    ca: [...tls.rootCertificates, ...config.extraCa],
  });
}

/** 进程级单例（undefined 也是一种有效缓存状态，用标志位区分"未计算"） */
let cachedAgent: https.Agent | undefined;
/** 单例是否已完成首次计算 */
let cacheInitialized = false;

/**
 * 获取进程级单例自定义 CA Agent
 *
 * @returns 配置存在时返回单例 Agent；未配置返回 undefined
 */
export function getConfiguredHttpsAgent(): https.Agent | undefined {
  if (!cacheInitialized) {
    cachedAgent = createCustomHttpsAgent();
    cacheInitialized = true;
  }
  return cachedAgent;
}

/**
 * 重置进程级单例缓存。
 *
 * 仅供单元测试使用（生产环境环境变量不在运行期变化）。
 */
export function resetConfiguredHttpsAgentCache(): void {
  cachedAgent = undefined;
  cacheInitialized = false;
}

// ============================================================
// 统一请求 Agent 出口（axios / node:https 下载共用）
// ============================================================

/**
 * 代理目标的结构化描述（与 figma-client.ProxyConfig 结构兼容）
 */
export interface ProxyTarget {
  /** 代理服务器地址 */
  readonly host: string;
  /** 代理端口 */
  readonly port: number;
  /** 代理协议，默认 https */
  readonly protocol?: 'http' | 'https';
  /** 代理认证用户名 */
  readonly username?: string;
  /** 代理认证密码 */
  readonly password?: string;
}

/**
 * 请求 Agent 构造选项
 */
export interface RequestAgentOptions {
  /** 代理配置；false/undefined 表示直连 */
  readonly proxyConfig?: ProxyTarget | false;
  /** 自定义 CA 配置；undefined 表示不追加 CA */
  readonly caConfig?: CustomCaConfig;
  /** 是否校验对端证书；仅显式 false 时关闭（调试用） */
  readonly rejectUnauthorized?: boolean;
}

/**
 * 根据代理与自定义 CA 配置构造请求用 Agent
 *
 * 组合规则：
 * - 代理 + TLS 覆盖：HttpsProxyAgent 透传 ca/rejectUnauthorized；
 * - 代理 + 无 TLS 覆盖：HttpsProxyAgent 单参构造（与 1.4.17 形态等价）；
 * - 直连 + TLS 覆盖：https.Agent(keepAlive, ca, rejectUnauthorized)；
 * - 直连 + 无 TLS 覆盖：undefined（axios 使用 Node 默认 TLS 栈，等同 1.4.17）。
 *
 * @param options 代理 / CA / 证书校验选项
 * @returns 对应 Agent；无需定制时返回 undefined
 */
export function buildRequestAgent(
  options: RequestAgentOptions = {},
): https.Agent | HttpsProxyAgent<string> | undefined {
  const { proxyConfig, caConfig, rejectUnauthorized } = options;
  const hasTlsOverride = caConfig !== undefined || rejectUnauthorized === false;
  // 无任何 TLS 定制时不构造额外 options 对象，保持与 1.4.17 代理路径逐形态等价
  const tlsOverrides: { ca?: string[]; rejectUnauthorized?: false } = {};
  if (caConfig !== undefined) {
    tlsOverrides.ca = [...tls.rootCertificates, ...caConfig.extraCa];
  }
  if (rejectUnauthorized === false) {
    tlsOverrides.rejectUnauthorized = false;
  }

  if (proxyConfig) {
    const auth =
      proxyConfig.username && proxyConfig.password
        ? `${proxyConfig.username}:${proxyConfig.password}@`
        : '';
    const proxyUrl = `${proxyConfig.protocol || 'https'}://${auth}${proxyConfig.host}:${proxyConfig.port}`;
    return hasTlsOverride
      ? new HttpsProxyAgent(proxyUrl, { keepAlive: true, ...tlsOverrides })
      : new HttpsProxyAgent(proxyUrl);
  }

  if (!hasTlsOverride) {
    return undefined;
  }
  return new https.Agent({ keepAlive: true, ...tlsOverrides });
}
