/**
 * CA 感知的 HTTP(S) 缓冲下载器（v1.4.18 T3）
 *
 * 仅在用户配置了自定义 CA（{@link CustomCaConfig}）时替代全局 fetch：
 * Node 内置 fetch（undici）不接受 https.Agent，无法为企业私有 CA 定制信任链；
 * node:http/https 的 `request` 则可通过 agent 选项透传自定义 CA。
 *
 * 安全行为与 OCR 既有 fetch 路径保持同构：
 * - `redirect` 等价策略：3xx 直接报错，绝不自动跳转（避免绕过 SSRF 主机校验）；
 * - 流式大小上限：接收过程中超过 maxBytes 立即中断；
 * - 支持外部 AbortSignal（超时控制由调用方负责）。
 *
 * @packageDocumentation
 */
import * as http from 'node:http';
import * as https from 'node:https';

import { buildRequestAgent, type CustomCaConfig } from './tls-agent.js';

/** 下载选项 */
export interface DownloadOptions {
  /** 中止信号（调用方控制超时） */
  readonly signal: AbortSignal;
  /** 允许接收的最大字节数 */
  readonly maxBytes: number;
  /** 自定义 CA 配置（决定 https 信任链） */
  readonly caConfig: CustomCaConfig;
}

/**
 * 底层请求函数类型（URL + 选项 + 响应回调）
 */
export type RequestFunction = (
  url: URL,
  options: http.RequestOptions,
  callback: (res: http.IncomingMessage) => void,
) => http.ClientRequest;

/** 测试接缝：可注入底层请求实现 */
export interface DownloaderSeams {
  /** 请求实现，默认按协议选择 node:http / node:https */
  readonly requestImpl?: RequestFunction;
}

/**
 * 默认请求函数：http: 走 node:http，其余（https:）走 node:https
 */
const defaultRequest: RequestFunction = (url, options, callback) =>
  url.protocol === 'http:'
    ? http.request(url, options, callback)
    : https.request(url, options, callback);

/**
 * 下载远程资源为 Buffer（带自定义 CA、禁跳转、限长、可中止）
 *
 * @param url 已通过 SSRF 校验的目标 URL
 * @param options 信号 / 上限 / CA 配置
 * @param seams 可选测试接缝
 * @returns 响应体 Buffer
 * @throws 重定向、非 2xx、超大小限制或中止时抛出错误
 */
export function downloadHttpBuffer(
  url: URL,
  options: DownloadOptions,
  seams: DownloaderSeams = {},
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const request = seams.requestImpl ?? defaultRequest;
    // 仅 https 需要自定义 CA Agent；http 本地/明文请求传 undefined（默认行为）
    const agent =
      url.protocol === 'https:' ? buildRequestAgent({ caConfig: options.caConfig }) : undefined;

    const req = request(url, { method: 'GET', agent, signal: options.signal }, (res) => {
      const status = res.statusCode ?? 0;
      // 3xx：安全策略禁止自动跳转（与 fetch redirect:'error' 等价）
      if (status >= 300 && status < 400) {
        res.destroy();
        reject(new Error(`下载远程图片失败：服务器返回重定向 (HTTP ${status})，安全策略禁止自动跳转`));
        return;
      }
      if (status < 200 || status >= 300) {
        res.destroy();
        reject(new Error(`下载远程图片失败 (HTTP ${status}): ${url.href}`));
        return;
      }

      const chunks: Buffer[] = [];
      let receivedBytes = 0;
      res.on('data', (chunk: Buffer) => {
        receivedBytes += chunk.length;
        if (receivedBytes > options.maxBytes) {
          // 立即中断，避免继续读入超大响应体
          req.destroy();
          reject(new Error(`远程图片内容超过大小上限（${options.maxBytes} 字节）`));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', (error) => reject(error));
    });

    req.on('error', (error: Error & { name?: string }) => {
      // AbortSignal 触发时统一为可读错误
      if (error.name === 'AbortError') {
        reject(new Error('下载远程图片已取消（超时或主动中止）'));
        return;
      }
      reject(error);
    });
    req.end();
  });
}
