/**
 * TLS Agent 工厂单元测试（T3：FIGMA_CA_CERT_PATH 自定义 CA）
 *
 * 覆盖三分支契约（TR-3.1，不发任何真实网络请求）：
 * 1. 未配置环境变量 → undefined，行为完全等同 1.4.17；
 * 2. 有效 PEM → https.Agent，ca 列表 = 系统根证书 + 自定义 CA；
 * 3. 坏路径 / 坏内容 → 抛出 i18n 错误（非静默回退）。
 * 另含 zh-CN/en-US 双键齐全性验证（TR-3.2）。
 */
import { afterEach, describe, expect, it } from 'vitest';
import * as https from 'node:https';
import * as tls from 'node:tls';

import { I18n, getI18n, initI18nSync } from '../../src/i18n/index.js';
import {
  createCustomHttpsAgent,
  getConfiguredHttpsAgent,
  loadCustomCaConfig,
  resetConfiguredHttpsAgentCache,
  type TlsAgentSeams,
} from '../../src/services/tls-agent.js';

/** 合法形态的自签名 CA PEM（内容无需真实可解析，只需具备 PEM 边界标记） */
const VALID_PEM = [
  '-----BEGIN CERTIFICATE-----',
  'MIIBogIJAK1xAMPLE1234567890abcdefghijklmnopqrstuvwxyzABCD',
  '-----END CERTIFICATE-----',
  '',
].join('\n');

/** 不存在文件路径场景的读文件接缝 */
function failingReadFile(): never {
  throw new Error('ENOENT: no such file or directory');
}

describe('TLS Agent 工厂：FIGMA_CA_CERT_PATH', () => {
  afterEach(() => {
    resetConfiguredHttpsAgentCache();
  });

  it('未配置环境变量时 config/agent 均为 undefined（等同 1.4.17 行为）', () => {
    const seams: TlsAgentSeams = { env: {} };
    expect(loadCustomCaConfig(seams)).toBeUndefined();
    expect(createCustomHttpsAgent(seams)).toBeUndefined();
  });

  it('环境变量为空字符串或纯空白时视为未配置', () => {
    expect(loadCustomCaConfig({ env: { FIGMA_CA_CERT_PATH: '' } })).toBeUndefined();
    expect(loadCustomCaConfig({ env: { FIGMA_CA_CERT_PATH: '   ' } })).toBeUndefined();
  });

  it('有效 PEM：config 返回路径与 PEM，Agent 合并系统根证书 + 自定义 CA', () => {
    const certPath = '/corporate/ca.pem';
    const seams: TlsAgentSeams = {
      env: { FIGMA_CA_CERT_PATH: certPath },
      readFileSync: () => VALID_PEM,
    };
    const config = loadCustomCaConfig(seams);
    expect(config).toBeDefined();
    expect(config?.certPath).toBe(certPath);
    expect(config?.extraCa).toEqual([VALID_PEM]);

    const agent = createCustomHttpsAgent(seams);
    expect(agent).toBeInstanceOf(https.Agent);
    // https.Agent 的 options.ca 为 PEM/Buffer 数组（类型在 Node16 定义中较宽，经 unknown 收窄断言）
    const caList = (agent as https.Agent & { options: { ca?: unknown } }).options.ca;
    expect(Array.isArray(caList)).toBe(true);
    expect((caList as readonly unknown[])).toContain(VALID_PEM);
    expect((caList as readonly unknown[]).length).toBe(tls.rootCertificates.length + 1);
  });

  it('CA 文件不存在时抛出包含路径的错误（非静默回退）', () => {
    const certPath = '/missing/ca.pem';
    const seams: TlsAgentSeams = {
      env: { FIGMA_CA_CERT_PATH: certPath },
      readFileSync: failingReadFile,
    };
    expect(() => loadCustomCaConfig(seams)).toThrow(certPath);
    expect(() => createCustomHttpsAgent(seams)).toThrow(certPath);
  });

  it('文件内容不是 PEM（缺少 BEGIN CERTIFICATE）时抛出证书无效错误', () => {
    const certPath = '/broken/ca.pem';
    const seams: TlsAgentSeams = {
      env: { FIGMA_CA_CERT_PATH: certPath },
      readFileSync: () => 'this is definitely not a certificate',
    };
    expect(() => loadCustomCaConfig(seams)).toThrow(certPath);
  });

  it('zh-CN 与 en-US 的三个 CA 错误键均已定义、可格式化且语言文本不同（TR-3.2）', () => {
    initI18nSync();
    const zh = getI18n();
    const en = new I18n('en-US');
    const certPath = '/x/ca.pem';
    const reason = 'EACCES';
    const keys = [
      'cli.errors.labels.caCertPathMissing',
      'cli.errors.labels.caCertReadFailed',
      'cli.errors.labels.caCertInvalid',
    ] as const;
    for (const key of keys) {
      const zhText = zh.t(key, certPath, reason) as string;
      const enText = en.t(key, certPath, reason) as string;
      // 不能回退为键名字面量
      expect(zhText, `zh-CN 缺少键 ${key}`).not.toBe(key);
      expect(enText, `en-US 缺少键 ${key}`).not.toBe(key);
      // 参数被真正格式化进文案
      expect(zhText, `zh-CN 文案 ${key} 未包含路径`).toContain(certPath);
      expect(enText, `en-US 文案 ${key} 未包含路径`).toContain(certPath);
      // 两种语言文本必须不同（证明不是复制粘贴同一文案）
      expect(zhText, `键 ${key} 中英文案相同`).not.toBe(enText);
    }
  });

  it('进程级单例：重复获取返回同一 Agent/undefined 引用', () => {
    // 测试环境不设置 FIGMA_CA_CERT_PATH
    const first = getConfiguredHttpsAgent();
    const second = getConfiguredHttpsAgent();
    expect(second).toBe(first);
  });
});
