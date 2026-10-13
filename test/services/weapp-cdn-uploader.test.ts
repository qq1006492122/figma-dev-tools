import http from 'node:http';
import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';

import { createHttpCdnUploader } from '../../src/services/weapp-cdn-uploader.js';

describe('createHttpCdnUploader', () => {
  it('真实 PUT 上传后用 HEAD 校验状态、Content-Type 与 SHA-256', async () => {
    const blobs = new Map<string, { body: Buffer; sha256: string; contentType: string }>();
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        const key = (req.url ?? '').replace(/^\/upload/, '').replace(/^\/static/, '');
        if (req.method === 'PUT') {
          const sha256 = String(req.headers['x-fdt-sha256'] ?? '');
          blobs.set(key, { body, sha256, contentType: String(req.headers['content-type'] ?? '') });
          res.statusCode = 201;
          res.end();
          return;
        }
        if (req.method === 'HEAD') {
          const blob = blobs.get(key);
          if (!blob) {
            res.statusCode = 404;
            res.end();
            return;
          }
          res.statusCode = 200;
          res.setHeader('content-type', blob.contentType);
          res.setHeader('content-length', String(blob.body.length));
          res.setHeader('x-fdt-sha256', blob.sha256);
          res.end();
          return;
        }
        res.statusCode = 405;
        res.end();
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('server address missing');
    const publicBaseUrl = `http://127.0.0.1:${address.port}/static`;
    const uploader = createHttpCdnUploader({
      endpoint: `http://127.0.0.1:${address.port}/upload`,
      publicBaseUrl,
    });

    try {
      const bytes = Buffer.from('hello-cdn');
      const sha256 = 'a'.repeat(64);
      const result = await uploader({
        key: '/images/default/test.png',
        bytes,
        mime: 'image/png',
        sha256,
        publicBaseUrl,
      });

      expect(result.verified).toBe(true);
      expect(result.status).toBe(200);
      expect(result.sha256).toBe(sha256);
      expect(result.publicUrl).toBe(`${publicBaseUrl}/images/default/test.png`);
      expect(blobs.get('/images/default/test.png')?.body).toEqual(bytes);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
