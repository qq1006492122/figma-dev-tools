/**
 * OcrService 单元测试
 *
 * 测试覆盖（均不依赖 tesseract.js，可在未安装环境下稳定运行）：
 * 1. 配置管理与默认值（默认语言 chi_sim+eng）
 * 2. 原生节点 JSON 文本提取（可见性过滤、空文本过滤、递归遍历）
 * 3. 混合提取入口的输入校验
 * 4. 依赖检查不崩溃
 * 5. 单例管理
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  OcrService,
  getOcrService,
  resetOcrService,
  resolveImageBuffer,
  validateRemoteImageUrl,
  isPrivateOrReservedAddress,
  type RemoteImageNetworkSeams,
} from '../../src/services/ocr-service.js';
import type { CustomCaConfig } from '../../src/services/tls-agent.js';
import type { FigmaNode } from '../../src/types.js';

function makePngBuffer(): Buffer {
  return Buffer.from('89504e470d0a1a0a', 'hex');
}

function makeTextNode(id: string, name: string, characters: string, visible: boolean = true): FigmaNode {
  return {
    id,
    name,
    type: 'TEXT',
    characters,
    visible,
  };
}

describe('OcrService', () => {
  it('readResponseWithLimit 超限时应取消底层响应流', async () => {
    const { readResponseWithLimit } = await import('../../src/services/ocr-service.js');
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(11));
      },
      cancel() {
        cancelled = true;
      },
    });
    const response = new Response(body);
    await expect(readResponseWithLimit(response, 10)).rejects.toThrow('不能超过');
    expect(cancelled).toBe(true);
  });

  let service: OcrService;

  beforeEach(() => {
    resetOcrService();
    service = new OcrService();
  });

  afterEach(() => {
    resetOcrService();
  });

  describe('配置管理', () => {
    it('应使用 chi_sim+eng 作为默认语言', () => {
      const options = service.getOptions();
      expect(options.language).toBe('chi_sim+eng');
      expect(options.oem).toBe(1);
      expect(options.psm).toBe(3);
    });

    it('应支持部分配置覆盖', () => {
      const custom = new OcrService({ language: 'eng', psm: 6 });
      const options = custom.getOptions();
      expect(options.language).toBe('eng');
      expect(options.psm).toBe(6);
      expect(options.oem).toBe(1);
    });

    it('应拒绝空语言和越界 OCR 参数', () => {
      expect(() => new OcrService({ language: '  ' })).toThrow(/language|语言/);
      expect(() => new OcrService({ psm: 0 })).toThrow(/PSM|psm/);
      expect(() => new OcrService({ oem: 4 })).toThrow(/OEM|oem/);
    });

    it('updateOptions 应合并配置', () => {
      service.updateOptions({ psm: 11 });
      expect(service.getOptions().psm).toBe(11);
      expect(service.getOptions().language).toBe('chi_sim+eng');
    });

    it('updateOptions 应拒绝非法 OCR 参数', () => {
      expect(() => service.updateOptions({ language: '' })).toThrow(/language|语言/);
      expect(() => service.updateOptions({ psm: 14 })).toThrow(/PSM|psm/);
      expect(() => service.updateOptions({ oem: -1 })).toThrow(/OEM|oem/);
    });

  });

  describe('原生文本提取', () => {
    it('应从节点树提取所有可见 TEXT 节点文本', () => {
      const root: FigmaNode = {
        id: '0:0',
        name: 'root',
        type: 'FRAME',
        visible: true,
        children: [
          makeTextNode('1:1', 'title', 'Hello'),
          makeTextNode('1:2', 'subtitle', 'World'),
        ],
      };

      const result = service.extractNativeText(root);
      expect(result.strategy).toBe('native');
      expect(result.items.length).toBe(2);
      expect(result.text).toBe('Hello\nWorld');
      expect(result.confidence).toBe(100);
    });

    it('应跳过不可见节点', () => {
      const root: FigmaNode = {
        id: '0:0',
        name: 'root',
        type: 'FRAME',
        children: [
          makeTextNode('1:1', 'visible', 'shown'),
          makeTextNode('1:2', 'hidden', 'hidden-text', false),
        ],
      };

      const result = service.extractNativeText(root);
      expect(result.items.length).toBe(1);
      expect(result.text).toBe('shown');
    });

    it('应跳过空文本节点', () => {
      const root: FigmaNode = {
        id: '0:0',
        name: 'root',
        type: 'FRAME',
        children: [
          makeTextNode('1:1', 'empty', '   '),
          makeTextNode('1:2', 'real', 'real text'),
        ],
      };

      const result = service.extractNativeText(root);
      expect(result.items.length).toBe(1);
      expect(result.items[0]!.text).toBe('real text');
    });

    it('应携带节点 id 与 name', () => {
      const root: FigmaNode = makeTextNode('9:9', 'label', 'Label');
      const result = service.extractNativeText(root);
      expect(result.items[0]!.nodeId).toBe('9:9');
      expect(result.items[0]!.nodeName).toBe('label');
      expect(result.items[0]!.source).toBe('native');
    });
  });

  describe('图片来源解析', () => {
    it('应支持 Buffer 和图片 base64 data URI', async () => {
      const buffer = makePngBuffer();
      await expect(resolveImageBuffer(buffer)).resolves.toEqual(buffer);
      await expect(resolveImageBuffer(`data:image/png;base64,${buffer.toString('base64')}`)).resolves.toEqual(buffer);
    });

    it('应拒绝没有图片签名的 Buffer', async () => {
      await expect(resolveImageBuffer(Buffer.from('not-an-image'))).rejects.toThrow(/图片格式|图片数据/);
    });

    it('应拒绝解码后不是图片的 base64 data URI', async () => {
      const payload = Buffer.from('plain text').toString('base64');
      await expect(resolveImageBuffer(`data:image/png;base64,${payload}`)).rejects.toThrow(/图片格式|图片数据/);
    });


    it('应拒绝目录作为本地图片路径', async () => {
      await expect(resolveImageBuffer(process.cwd())).rejects.toThrow('普通文件');
    });

    it('应支持本地图片路径', async () => {
      const filePath = `${process.cwd()}/.ocr-test-image.png`;
      const { writeFile, unlink } = await import('node:fs/promises');
      await writeFile(filePath, makePngBuffer());
      try {
        await expect(resolveImageBuffer(filePath)).resolves.toEqual(makePngBuffer());
      } finally {
        await unlink(filePath).catch(() => undefined);
      }
    });
  });

  describe('远程图片 URL 安全校验', () => {
    it.each([
      'http://localhost/image.png',
      'http://127.0.0.1/image.png',
      'http://10.0.0.1/image.png',
      'http://192.168.1.1/image.png',
      'http://169.254.169.254/latest/meta-data',
      'http://[::1]/image.png',
    ])('应拒绝内网或保留地址：%s', async (url) => {
      await expect(resolveImageBuffer(url)).rejects.toThrow('不允许指向本机、内网或保留地址');
    });

    it('应拒绝 IPv4-mapped IPv6 的本机地址', async () => {
      await expect(resolveImageBuffer('http://[::ffff:127.0.0.1]/image.png')).rejects.toThrow(/本机、内网或保留地址/);
    });

    it('应拒绝 URL 中的凭据', async () => {
      await expect(resolveImageBuffer('https://user:secret@example.com/image.png')).rejects.toThrow('不允许包含用户名或密码');
    });

    it.each([
      ['198.18.0.1', true],
      ['198.18.255.255', true],
      ['198.19.0.1', true],
      ['198.19.255.255', true],
      ['192.0.0.1', true],
      ['192.0.2.10', true],
      ['100.64.0.1', true],
      ['169.254.1.1', true],
      ['172.16.0.1', true],
      ['172.32.0.1', false],
      ['198.51.100.7', true],
      ['203.0.113.9', true],
      ['8.8.8.8', false],
      ['114.114.114.114', false],
    ])('RFC 保留段判定 isPrivateOrReservedAddress(%s) === %s', (ip, expected) => {
      expect(isPrivateOrReservedAddress(ip)).toBe(expected);
    });

    it('DNS 解析结果中混入内网地址时应拒绝（防多 A 记录绕过）', async () => {
      const mixedLookup: NonNullable<RemoteImageNetworkSeams['lookup']> = async () => [
        { address: '93.184.216.34' },
        { address: '10.0.0.1' },
      ];
      await expect(
        resolveImageBuffer('http://cdn.example.com/a.png', { lookup: mixedLookup }),
      ).rejects.toThrow('解析到了本机、内网或保留地址');
    });

    it('应通过注入的 DNS 接缝拒绝 DNS rebinding 到 127.0.0.1', async () => {
      const evilLookup: NonNullable<RemoteImageNetworkSeams['lookup']> = async () => [
        { address: '127.0.0.1' },
      ];
      await expect(
        validateRemoteImageUrl('http://rebind.example.com/a.png', { lookup: evilLookup }),
      ).rejects.toThrow('解析到了本机、内网或保留地址');
    });

    it('DNS 仅解析到公网地址时应放行并返回 URL', async () => {
      const safeLookup: NonNullable<RemoteImageNetworkSeams['lookup']> = async () => [
        { address: '93.184.216.34' },
      ];
      const url = await validateRemoteImageUrl('http://cdn.example.com/a.png', { lookup: safeLookup });
      expect(url).toBeInstanceOf(URL);
      expect(url.hostname).toBe('cdn.example.com');
    });

    it('下载远程图片时必须使用 redirect:error 模式（禁止跳转绕过 SSRF 校验）', async () => {
      const safeLookup: NonNullable<RemoteImageNetworkSeams['lookup']> = async () => [
        { address: '93.184.216.34' },
      ];
      let captured: RequestInit | undefined;
      const fetchImpl: typeof fetch = async (_input, init) => {
        captured = init;
        return new Response(new Uint8Array(makePngBuffer()), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      };
      const buffer = await resolveImageBuffer('http://cdn.example.com/a.png', {
        lookup: safeLookup,
        fetchImpl,
      });
      expect(buffer).toEqual(makePngBuffer());
      expect(captured?.redirect).toBe('error');
    });
  });

  describe('远程图片自定义 CA 分支（T3）', () => {
    /** 公网 DNS 接缝（不真实建连，下载层均被注入） */
    const safeLookup: NonNullable<RemoteImageNetworkSeams['lookup']> = async () => [
      { address: '93.184.216.34' },
    ];
    /** 测试用 CA 配置 */
    const caConfig: CustomCaConfig = {
      certPath: '/test/ca.pem',
      extraCa: ['-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----\n'],
    };

    it('存在自定义 CA 时改走 httpDownload 接缝且绝不调用 fetch', async () => {
      let downloadCalled = false;
      let receivedConfig: CustomCaConfig | undefined;
      const buffer = await resolveImageBuffer('https://cdn.example.com/a.png', {
        lookup: safeLookup,
        loadCaConfig: () => caConfig,
        httpDownload: async (url, options) => {
          downloadCalled = true;
          receivedConfig = options.caConfig;
          expect(url.pathname).toBe('/a.png');
          return makePngBuffer();
        },
        fetchImpl: async () => {
          throw new Error('存在自定义 CA 时不应走 fetch 分支');
        },
      });
      expect(buffer).toEqual(makePngBuffer());
      expect(downloadCalled).toBe(true);
      expect(receivedConfig).toBe(caConfig);
    });

    it('无自定义 CA 时保持 1.4.17 行为：仍走全局 fetch 路径', async () => {
      const buffer = await resolveImageBuffer('http://cdn.example.com/b.png', {
        lookup: safeLookup,
        loadCaConfig: () => undefined,
        httpDownload: async () => {
          throw new Error('无 CA 配置时不应走下载器分支');
        },
        fetchImpl: async () =>
          new Response(new Uint8Array(makePngBuffer()), {
            status: 200,
            headers: { 'content-type': 'image/png' },
          }),
      });
      expect(buffer).toEqual(makePngBuffer());
    });

    it('下载器错误（如 302 禁跳转）原样透传', async () => {
      await expect(
        resolveImageBuffer('https://cdn.example.com/c.png', {
          lookup: safeLookup,
          loadCaConfig: () => caConfig,
          httpDownload: async () => {
            throw new Error('下载远程图片失败：服务器返回重定向 (HTTP 302)，安全策略禁止自动跳转');
          },
        }),
      ).rejects.toThrow(/302/);
    });
  });

  describe('混合提取入口', () => {
    it('无输入时应抛出错误', async () => {
      await expect(service.extractText({})).rejects.toThrow('必须提供');
    });

    it('仅提供节点时应走原生提取，不触发 OCR', async () => {
      const node: FigmaNode = makeTextNode('1:1', 't', 'Native only');
      const result = await service.extractText({ figmaNode: node });
      expect(result.strategy).toBe('native');
      expect(result.text).toBe('Native only');
    });
  });

  describe('依赖检查', () => {
    it('checkDependencies 不应崩溃且返回 available 布尔值', async () => {
      const result = await service.checkDependencies();
      expect(result).toBeDefined();
      expect(typeof result.available).toBe('boolean');
      expect(Array.isArray(result.missingDependencies)).toBe(true);
    });
  });

  describe('单例管理', () => {
    it('getOcrService 应返回同一实例', () => {
      const a = getOcrService();
      const b = getOcrService();
      expect(a).toBe(b);
    });

    it('resetOcrService 后应返回新实例', () => {
      const a = getOcrService();
      resetOcrService();
      const b = getOcrService();
      expect(a).not.toBe(b);
    });
  });
});
