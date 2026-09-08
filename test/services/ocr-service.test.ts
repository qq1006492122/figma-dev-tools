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
} from '../../src/services/ocr-service.js';
import type { FigmaNode } from '../../src/types.js';

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

    it('updateOptions 应合并配置', () => {
      service.updateOptions({ psm: 11 });
      expect(service.getOptions().psm).toBe(11);
      expect(service.getOptions().language).toBe('chi_sim+eng');
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
      const buffer = Buffer.from('image-data');
      await expect(resolveImageBuffer(buffer)).resolves.toEqual(buffer);
      await expect(resolveImageBuffer(`data:image/png;base64,${buffer.toString('base64')}`)).resolves.toEqual(buffer);
    });

    it('应拒绝空数据和非图片 data URI', async () => {
      await expect(resolveImageBuffer('')).rejects.toThrow('不能为空');
      await expect(resolveImageBuffer('data:text/plain;base64,SGVsbG8=')).rejects.toThrow('无效');
    });

    it('应支持本地图片路径', async () => {
      const filePath = `${process.cwd()}/.ocr-test-image.bin`;
      await import('node:fs/promises').then(({ writeFile, unlink }) =>
        writeFile(filePath, Buffer.from('image-data')).then(async () => {
          await expect(resolveImageBuffer(filePath)).resolves.toEqual(Buffer.from('image-data'));
          await unlink(filePath);
        }),
      );
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

    it('应拒绝 URL 中的凭据', async () => {
      await expect(resolveImageBuffer('https://user:secret@example.com/image.png')).rejects.toThrow('不允许包含用户名或密码');
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
