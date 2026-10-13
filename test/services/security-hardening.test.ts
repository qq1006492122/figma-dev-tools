import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createFigmaClient } from '../../src/services/figma-client.js';
import { snapshotProxyEnvironment, diagnoseNetwork } from '../../src/services/gui-server.js';
import { classifyTokenValidationFailure } from '../../src/services/token-store.js';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..');

describe('Token 与错误边界', () => {
  it('网络、代理、TLS、限流错误不会被分类成 invalid', () => {
    for (const code of ['NETWORK_ERROR', 'TIMEOUT_ERROR', 'PROXY_ERROR', 'TLS_ERROR', 'RATE_LIMITED']) {
      expect(classifyTokenValidationFailure(Object.assign(new Error('temporary failure'), { code }))).toBe('unknown');
    }
    expect(classifyTokenValidationFailure(new Error('connect ETIMEDOUT'))).toBe('unknown');
    expect(classifyTokenValidationFailure(new Error('Token validation failed (HTTP 401)'))).toBe('invalid');
    expect(classifyTokenValidationFailure(new Error('permission denied'))).toBe('invalid');
  });

  it('MCP schema 不再暴露原始 accessToken 字段', () => {
    const source = readFileSync(resolve(ROOT, 'src/index.ts'), 'utf8');
    expect(source).not.toMatch(/accessToken:\s*z\./);
    expect(source).toMatch(/tokenProfile:\s*z\.string\(\)\.optional\(\)/);
    expect(source).toContain('createTokenStore()');
    expect(readFileSync(resolve(ROOT, 'src/services/figma-client.ts'), 'utf8')).not.toContain('getAccessToken(');
  });
});

describe('FigmaClient 重试与请求合并', () => {
  const client = createFigmaClient({
    accessToken: `figd_${'a'.repeat(40)}`,
    proxy: false,
  });
  const internals = client as unknown as {
    _calculateRetryDelay(retryCount: number, retryAfter?: number): number;
    _coalesce<T>(key: string, request: () => Promise<T>): Promise<T>;
  };

  it('Retry-After 被限制在 30 秒上限内', () => {
    expect(internals._calculateRetryDelay(0, 3_600)).toBe(30_000);
    expect(internals._calculateRetryDelay(0, 2)).toBe(2_000);
    expect(internals._calculateRetryDelay(2)).toBe(4_000);
  });

  it('并发同 key GET 共享同一个 in-flight Promise', async () => {
    let calls = 0;
    const request = async (): Promise<string> => {
      calls++;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
      return 'ok';
    };

    const [first, second] = await Promise.all([
      internals._coalesce('same-request', request),
      internals._coalesce('same-request', request),
    ]);

    expect(first).toBe('ok');
    expect(second).toBe('ok');
    expect(calls).toBe(1);
  });
});

describe('GUI 网络诊断安全边界', () => {
  it('代理诊断只输出主机和是否配置认证，不输出用户名或密码', () => {
    const diagnostics = snapshotProxyEnvironment({
      HTTPS_PROXY: 'http://private-user:private-password@127.0.0.1:8888',
    } as NodeJS.ProcessEnv);
    const serialized = JSON.stringify(diagnostics);

    expect(serialized).toContain('127.0.0.1');
    expect(serialized).toContain('authConfigured":true');
    expect(serialized).not.toContain('private-user');
    expect(serialized).not.toContain('private-password');
  });

  it('诊断目标限制为 HTTPS figma.com，阻断 SSRF', async () => {
    await expect(diagnoseNetwork('https://example.com/')).rejects.toThrow(/figma\.com/);
    await expect(diagnoseNetwork('http://api.figma.com/')).rejects.toThrow(/HTTPS|figma\.com/);
    await expect(diagnoseNetwork('https://user:pass@api.figma.com/')).rejects.toThrow(/figma\.com/);
  });
});
