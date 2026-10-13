/**
 * FigmaClient 自定义 CA 接入测试（T3）
 */
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as https from 'node:https';
import * as os from 'node:os';
import * as path from 'node:path';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { createFigmaClient, classifyNetworkFailure, type FigmaClient } from '../../src/services/figma-client.js';
import { FigmaApiError } from '../../src/utils/errors.js';

const PEM = '-----BEGIN CERTIFICATE-----\nAAAA1234\n-----END CERTIFICATE-----\n';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-ca-test-'));
const caFile = path.join(tmpDir, 'corp-ca.pem');
const originalEnvValue = process.env.FIGMA_CA_CERT_PATH;
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
afterEach(() => {
  if (originalEnvValue === undefined) delete process.env.FIGMA_CA_CERT_PATH;
  else process.env.FIGMA_CA_CERT_PATH = originalEnvValue;
});
function getAgent(client: FigmaClient): unknown {
  return (client as unknown as { _client: { defaults: { httpsAgent?: unknown } } })._client.defaults.httpsAgent;
}
describe('FigmaClient 自定义 CA 接入', () => {
  it('无 CA 配置且禁用代理时 httpsAgent 为 undefined', () => {
    expect(getAgent(createFigmaClient({ accessToken: 'figd_test_token', proxy: false }))).toBeUndefined();
  });
  it('有效 CA 注入自定义 Agent', () => {
    fs.writeFileSync(caFile, PEM, 'utf8');
    const agent = getAgent(createFigmaClient({ accessToken: 'figd_test_token', proxy: false, ssl: { caCertPath: caFile } }));
    expect(agent).toBeInstanceOf(https.Agent);
  });
  it('环境变量 CA 等价生效', () => {
    fs.writeFileSync(caFile, PEM, 'utf8');
    process.env.FIGMA_CA_CERT_PATH = caFile;
    expect(getAgent(createFigmaClient({ accessToken: 'figd_test_token', proxy: false }))).toBeInstanceOf(https.Agent);
  });
  it('坏 CA 路径构造期抛出', () => {
    expect(() => createFigmaClient({ accessToken: 'figd_test_token', proxy: false, ssl: { caCertPath: path.join(tmpDir, 'missing.pem') } })).toThrow();
  });
  it('代理 + CA 传递到代理 Agent', () => {
    fs.writeFileSync(caFile, PEM, 'utf8');
    expect(getAgent(createFigmaClient({ accessToken: 'figd_test_token', proxy: { host: '127.0.0.1', port: 8888, protocol: 'http' }, ssl: { caCertPath: caFile } }))).toBeInstanceOf(HttpsProxyAgent);
  });
  it('rejectUnauthorized=false 传递到 Agent', () => {
    const agent = getAgent(createFigmaClient({ accessToken: 'figd_test_token', proxy: false, ssl: { rejectUnauthorized: false } })) as https.Agent & { options: { rejectUnauthorized?: boolean } };
    expect(agent.options.rejectUnauthorized).toBe(false);
  });
});
describe('FigmaClient 网络错误分类与脱敏', () => {
  it('ECONNREFUSED 归类为 PROXY_ERROR', () => {
    const detail = classifyNetworkFailure(Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:9'), { code: 'ECONNREFUSED' }));
    expect(detail.code).toBe('PROXY_ERROR');
    expect(detail.category).toBe('proxy');
  });
  it('timeout/DNS/TLS 分别得到稳定类别', () => {
    expect(classifyNetworkFailure(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })).code).toBe('TIMEOUT_ERROR');
    expect(classifyNetworkFailure(Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })).code).toBe('DNS_ERROR');
    expect(classifyNetworkFailure(Object.assign(new Error('certificate has expired'), { code: 'CERT_HAS_EXPIRED' })).code).toBe('TLS_ERROR');
  });
  it('未知长度 Figma Token 不会完整进入错误消息', () => {
    const token = 'figd_' + 'a'.repeat(120);
    const err = new FigmaApiError('TOKEN_INVALID', 401, { reason: token, solution: 'rotate token', originalMessage: token });
    expect(err.message).not.toContain(token);
    expect(err.message).toContain('****');
  });
});
