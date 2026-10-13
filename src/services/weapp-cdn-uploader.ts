/**
 * Generic HTTPS CDN uploader for Weapp asset pipeline.
 *
 * The uploader is intentionally provider-neutral: it PUTs immutable content to
 * a configured endpoint and verifies the returned URL with a HEAD request.
 * Providers that expose a different auth scheme can implement WeappCdnUploader
 * directly; the pipeline never marks an asset resolved without verification.
 */

import http from 'node:http';
import https from 'node:https';
import { Buffer } from 'node:buffer';

import type {
  CdnUploadRequest,
  CdnUploadResult,
  WeappCdnUploader,
} from './weapp-asset-pipeline.js';
import { joinPublicUrl } from './weapp-asset-pipeline.js';

export interface HttpCdnUploaderOptions {
  /** Upload endpoint. The asset key is appended as a URL path unless `{key}` is present. */
  endpoint: string;
  /** Stable public CDN base URL used to derive the returned URL. */
  publicBaseUrl: string;
  method?: 'PUT' | 'POST';
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Header carrying the SHA-256 digest during upload verification. */
  sha256Header?: string | null;
  /** Require the SHA-256 header during verification (default true). */
  requireSha256Header?: boolean;
}

function uploadUrl(endpoint: string, key: string): URL {
  const url = new URL(endpoint);
  if (url.pathname.includes('{key}')) {
    url.pathname = url.pathname.replace('{key}', key.replace(/^\/+/, ''));
  } else {
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`;
  }
  return url;
}

function request(
  url: URL,
  method: string,
  headers: Record<string, string>,
  body: Buffer | null,
  timeoutMs: number,
): Promise<{ status: number; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'http:' ? http : https;
    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === 'http:' ? 80 : 443),
        path: `${url.pathname}${url.search}`,
        method,
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers }));
      },
    );
    req.on('timeout', () => req.destroy(Object.assign(new Error('CDN upload timed out'), { code: 'ETIMEDOUT' })));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function normalizedContentType(value: string | undefined): string {
  return (value ?? '').split(';')[0]!.trim().toLowerCase();
}

/**
 * Build a real HTTP(S) uploader with immutable PUT semantics and post-upload verification.
 */
export function createHttpCdnUploader(options: HttpCdnUploaderOptions): WeappCdnUploader {
  return async (input: CdnUploadRequest): Promise<CdnUploadResult> => {
    const key = input.key.replace(/^\/+/, '');
    const url = uploadUrl(options.endpoint, key);
    const timeoutMs = options.timeoutMs ?? 15_000;
    const body = Buffer.from(input.bytes);
    const sha256Header = options.sha256Header === undefined ? 'x-fdt-sha256' : options.sha256Header;

    const uploadResponse = await request(
      url,
      options.method ?? 'PUT',
      {
        ...options.headers,
        'content-type': input.mime,
        'content-length': String(body.length),
        ...(sha256Header ? { [sha256Header]: input.sha256 } : {}),
      },
      body,
      timeoutMs,
    );
    if (uploadResponse.status < 200 || uploadResponse.status >= 300) {
      throw new Error(`CDN upload failed with HTTP ${uploadResponse.status}`);
    }

    const publicUrl = joinPublicUrl(options.publicBaseUrl, `/${key}`);
    const verifyUrl = new URL(publicUrl);
    const verifyResponse = await request(
      verifyUrl,
      'HEAD',
      { 'user-agent': 'figma-dev-tools-weapp-cdn-uploader' },
      null,
      timeoutMs,
    );

    const remoteSha = sha256Header
      ? verifyResponse.headers[sha256Header] ?? verifyResponse.headers['x-amz-meta-sha256']
      : undefined;
    const remoteShaValue = Array.isArray(remoteSha) ? remoteSha[0] : remoteSha;
    const contentType = normalizedContentType(
      Array.isArray(verifyResponse.headers['content-type'])
        ? verifyResponse.headers['content-type'][0]
        : verifyResponse.headers['content-type'],
    );
    const requireSha = options.requireSha256Header !== false;
    const verified =
      verifyResponse.status >= 200 &&
      verifyResponse.status < 300 &&
      (!contentType || contentType === normalizedContentType(input.mime)) &&
      (!requireSha || remoteShaValue === input.sha256);

    return {
      publicUrl,
      sha256: input.sha256,
      contentType,
      status: verifyResponse.status,
      verified,
    };
  };
}
