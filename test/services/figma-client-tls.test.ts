/**
 * FigmaClient 自定义 CA 接入测试（T3）
 *
 * 验证 tls-agent 工厂在真实 FigmaClient 构造路径上的行为（不发任何网络请求）：
 * - ssl.caCertPath 与 FIGMA_CA_CERT_PATH 两种入口等价生效；
 * - 代理场景下自定义 CA 透传到 HttpsProxyAgent；
 * - 坏路径在构造期抛出（快速失败，不静默）；
 * - 既有的 ssl.rejectUnauthorized=false 配置同步接通。
 */
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as https from 'node:https';
import * as os from 'node:os';
import * as path from 'node:path';

import { HttpsProxyAgent } from 'https-proxy-agent';
import { createFigmaClient, type FigmaClient } from '../../src/services/figma-client.js';

/** 暴露私有字段的最小内部结构（仅测试断言用，经 unknown 收窄，零 any） */
interface ClientInternals {
  /** axios 实例 */
  readonly _client: {
    readonly defaults: {
      /** 构造时注入的 httpsAgent */
      readonly httpsAgent?: unknown;
    };
  };
}

/** 合法 PEM 形态 */
const PEM = '-----BEGIN CERTIFICATE-----\nAAAA1234\n-----END CERTIFICATE-----\n';

/** 临时 CA 文件目录 */
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-ca-test-'));
/** 临时 CA 文件路径 */
const caFile = path.join(tmpDir, 'corp-ca.pem');

/** 保存环境变量原值，便于恢复 */
const originalEnvValue = process.env.FIGMA_CA_CERT_PATH;

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

afterEach(() => {
  if (originalEnvValue === undefined) {
    delete process.env.FIGMA_CA_CERT_PATH;
  } else {
    process.env.FIGMA_CA_CERT_PATH = originalEnvValue;
  }
});

/**
 * 取出 client 构造时注入 axios 的 httpsAgent
 *
 * @param client FigmaClient
 * @returns httpsAgent
 */
function getAgent(client: FigmaClient): unknown {
  return (client as unknown as ClientInternals)._client.defaults.httpsAgent;
}

describe('FigmaClient 自定义 CA 接入', () => {
  it('无 CA 配置且禁用代理时 httpsAgent 为 undefined（1.4.17 行为不变）', () => {
    const client = createFigmaClient({ accessToken: 'figd_test_token', proxy: false });
    expect(getAgent(client)).toBeUndefined();
  });

  it('ssl.caCertPath 指向有效 PEM 时注入携带自定义 CA 的 https.Agent', () => {
    fs.writeFileSync(caFile, PEM, 'utf8');
    const client = createFigmaClient({
      accessToken: 'figd_test_token',
      proxy: false,
      ssl: { caCertPath: caFile },
    });
    const agent = getAgent(client);
    expect(agent).toBeInstanceOf(https.Agent);
    const caList = (agent as https.Agent & { options: { ca?: unknown } }).options.ca;
    expect(caList).toEqual(expect.arrayContaining([expect.stringContaining('BEGIN CERTIFICATE')]));
  });

  it('FIGMA_CA_CERT_PATH 环境变量入口与 ssl.caCertPath 等价生效', () => {
    fs.writeFileSync(caFile, PEM, 'utf8');
    process.env.FIGMA_CA_CERT_PATH = caFile;
    const client = createFigmaClient({ accessToken: 'figd_test_token', proxy: false });
    expect(getAgent(client)).toBeInstanceOf(https.Agent);
  });

  it('ssl.caCertPath 指向不存在文件时构造期即抛出（快速失败）', () => {
    const missing = path.join(tmpDir, 'missing.pem');
    expect(() =>
      createFigmaClient({ accessToken: 'figd_test_token', proxy: false, ssl: { caCertPath: missing } }),
    ).toThrow(missing);
  });

  it('代理 + 自定义 CA 同时存在：CA 透传到 HttpsProxyAgent 的 connectOpts', () => {
    fs.writeFileSync(caFile, PEM, 'utf8');
    const client = createFigmaClient({
      accessToken: 'figd_test_token',
      proxy: { host: '127.0.0.1', port: 8888, protocol: 'http' },
      ssl: { caCertPath: caFile },
    });
    const agent = getAgent(client);
    expect(agent).toBeInstanceOf(HttpsProxyAgent);
    const connectOpts = (agent as HttpsProxyAgent<string> & {
      connectOpts?: { ca?: unknown };
    }).connectOpts;
    expect(Array.isArray(connectOpts?.ca)).toBe(true);
    expect(connectOpts?.ca as readonly unknown[]).toEqual(
      expect.arrayContaining([expect.stringContaining('BEGIN CERTIFICATE')]),
    );
  });

  it('ssl.rejectUnauthorized=false 时 Agent 关闭证书校验（既有声明配置被接通）', () => {
    const client = createFigmaClient({
      accessToken: 'figd_test_token',
      proxy: false,
      ssl: { rejectUnauthorized: false },
    });
    const agent = getAgent(client);
    expect(agent).toBeInstanceOf(https.Agent);
    const options = (agent as https.Agent & { options: { rejectUnauthorized?: boolean } }).options;
    expect(options.rejectUnauthorized).toBe(false);
  });
});
