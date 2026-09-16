/**
 * CA 感知的 HTTP(S) 下载器单元测试（T3）
 *
 * 自定义 CA 存在时，OCR 远程图片下载不能走全局 fetch（undici 无法注入
 * https.Agent），改由 node:http/https 下载。本套件用本地真实 HTTP server
 * 验证行为契约，用请求接缝验证自定义 CA Agent 透传：
 *
 * 1. 200 响应原样返回 Buffer；
 * 2. 3xx 重定向直接报错（安全策略等同 fetch redirect:'error'，绝不自动跳转）；
 * 3. 4xx/5xx 报错含状态码；
 * 4. 流式传输中超 maxBytes 立即中断并报错；
 * 5. AbortSignal 触发时请求被中止；
 * 6. https 请求透传携带自定义 CA 的 agent。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as http from 'node:http';
import type { ClientRequest, IncomingMessage, RequestOptions } from 'node:http';
import { once, EventEmitter } from 'node:events';

import { downloadHttpBuffer, type RequestFunction } from '../../src/services/ca-aware-downloader.js';
import type { CustomCaConfig } from '../../src/services/tls-agent.js';

/** 测试用 CA 配置（内容只需 PEM 形态） */
const CA_CONFIG: CustomCaConfig = {
  certPath: '/test/ca.pem',
  extraCa: ['-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----\n'],
};

/** 8 字节 PNG 魔数 */
const PNG_BYTES = Buffer.from('89504e470d0a1a0a', 'hex');

/** 本地测试 server */
let server: http.Server;
/** server 基础地址 */
let baseUrl: URL;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = req.url ?? '';
    if (url.startsWith('/ok')) {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(PNG_BYTES);
      return;
    }
    if (url.startsWith('/redirect')) {
      res.writeHead(302, { Location: 'http://127.0.0.1/elsewhere' });
      res.end();
      return;
    }
    if (url.startsWith('/notfound')) {
      res.writeHead(404);
      res.end();
      return;
    }
    if (url.startsWith('/large')) {
      // 分块持续写入，直到客户端主动中断
      res.writeHead(200);
      const timer = setInterval(() => {
        res.write(Buffer.alloc(1024, 0x61));
      }, 5);
      res.on('close', () => clearInterval(timer));
      return;
    }
    res.writeHead(500);
    res.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('测试 server 监听地址异常');
  }
  baseUrl = new URL(`http://127.0.0.1:${address.port}/`);
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('CA 感知下载器 downloadHttpBuffer', () => {
  it('200 响应原样返回二进制内容', async () => {
    const buffer = await downloadHttpBuffer(
      new URL('ok', baseUrl),
      { signal: new AbortController().signal, maxBytes: 1024, caConfig: CA_CONFIG },
    );
    expect(buffer).toEqual(PNG_BYTES);
  });

  it('3xx 重定向直接报错且不自动跳转', async () => {
    await expect(
      downloadHttpBuffer(
        new URL('redirect', baseUrl),
        { signal: new AbortController().signal, maxBytes: 1024, caConfig: CA_CONFIG },
      ),
    ).rejects.toThrow(/重定向|302/);
  });

  it('404 响应报错包含 HTTP 状态码', async () => {
    await expect(
      downloadHttpBuffer(
        new URL('notfound', baseUrl),
        { signal: new AbortController().signal, maxBytes: 1024, caConfig: CA_CONFIG },
      ),
    ).rejects.toThrow(/HTTP 404/);
  });

  it('流式内容超过 maxBytes 时立即中断并报错', async () => {
    await expect(
      downloadHttpBuffer(
        new URL('large', baseUrl),
        { signal: new AbortController().signal, maxBytes: 2048, caConfig: CA_CONFIG },
      ),
    ).rejects.toThrow(/超过|上限|2048/);
  });

  it('AbortSignal 中止时请求失败', async () => {
    const controller = new AbortController();
    const promise = downloadHttpBuffer(
      new URL('large', baseUrl),
      { signal: controller.signal, maxBytes: 1024 * 1024, caConfig: CA_CONFIG },
    );
    controller.abort();
    await expect(promise).rejects.toThrow();
  });

  it('https 请求将携带自定义 CA 的 agent 透传给请求层（接缝验证）', async () => {
    /** 捕获的请求选项 */
    const captured: { url?: URL; options?: RequestOptions } = {};
    /**
     * 最小 request 接缝：记录入参并在 end() 后回放 200 + PNG
     */
    const fakeRequest: RequestFunction = (url, options, callback) => {
      captured.url = url;
      captured.options = options;
      const req = new EventEmitter() as unknown as ClientRequest;
      const response = new EventEmitter() as unknown as IncomingMessage;
      response.statusCode = 200;
      req.end = () => {
        callback(response);
        setImmediate(() => {
          response.emit('data', PNG_BYTES);
          response.emit('end');
        });
        return req;
      };
      req.destroy = (() => req) as ClientRequest['destroy'];
      return req;
    };

    const buffer = await downloadHttpBuffer(
      new URL('https://example.invalid/image.png'),
      { signal: new AbortController().signal, maxBytes: 1024, caConfig: CA_CONFIG },
      { requestImpl: fakeRequest },
    );
    expect(buffer).toEqual(PNG_BYTES);
    expect(captured.url?.protocol).toBe('https:');
    const agent = captured.options?.agent as { options?: { ca?: unknown } } | undefined;
    expect(agent).toBeDefined();
    expect(agent?.options?.ca as readonly unknown[]).toEqual(
      expect.arrayContaining([expect.stringContaining('BEGIN CERTIFICATE')]),
    );
  });
});
