/**
 * WeappGenerator 单元测试
 *
 * 测试覆盖：
 * 1. HTML → 小程序标签映射
 * 2. px → rpx 单位转换
 * 3. WXML/WXSS/JS/JSON 四件套生成
 * 4. 页面 vs 组件模式
 * 5. 样式规则生成与 class 命名
 * 6. 文本节点渲染
 * 7. 图片节点渲染
 * 8. 边界场景
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { WeappGenerator, createWeappGenerator } from '../../src/services/weapp-generator.js';
import type { DesignContext, ProcessedNode } from '../../src/types/nodes.js';

// Mock FigmaClient
const mockFigmaClient = {
  getFile: vi.fn(),
  getNode: vi.fn(),
  getImage: vi.fn(),
  getSvg: vi.fn(),
  getImages: vi.fn(),
  downloadImage: vi.fn(),
} as any;

// 创建一个简单的模拟设计上下文
function createMockContext(node: Partial<ProcessedNode> = {}): DesignContext {
  return {
    fileKey: 'test-file-key',
    nodeId: 'test-node-id',
    node: {
      id: '1',
      name: 'TestComponent',
      figmaId: '1:1',
      originalType: 'FRAME',
      role: 'container',
      visible: true,
      size: { width: 375, height: 200 },
      children: [],
      ...node,
    } as ProcessedNode,
    componentsUsed: [],
    styles: [],
    warnings: [],
    metadata: { name: 'Test', lastModified: '' },
  };
}

const verifiedUploader = async (request: {
  key: string;
  mime: string;
  sha256: string;
  publicBaseUrl: string;
}) => ({
  publicUrl: `${request.publicBaseUrl.replace(/\/+$/, '')}${request.key}`,
  sha256: request.sha256,
  contentType: request.mime,
  status: 200,
  verified: true,
});
describe('WeappGenerator', () => {
  let generator: WeappGenerator;

  beforeEach(() => {
    generator = new WeappGenerator(mockFigmaClient);
    vi.clearAllMocks();
  });

  describe('工厂函数', () => {
    it('createWeappGenerator 应返回 WeappGenerator 实例', () => {
      const gen = createWeappGenerator(mockFigmaClient);
      expect(gen).toBeInstanceOf(WeappGenerator);
    });

    it('应支持自定义配置', () => {
      const gen = new WeappGenerator(mockFigmaClient, {
        designWidth: 375,
        unit: 'px',
        isPage: true,
      });
      expect(gen).toBeInstanceOf(WeappGenerator);
    });
  });

  describe('标签映射', () => {
    it('应将 div 映射为 view', async () => {
      const ctx = createMockContext({
        originalType: 'FRAME',
        role: 'container',
        size: { width: 100, height: 50 },
      });

      const result = await generator.generateFromContext(ctx, { componentName: 'Test' });
      expect(result.wxml).toContain('<view');
    });

    it('应将文本节点映射为 text', async () => {
      const ctx = createMockContext({
        originalType: 'TEXT',
        role: 'text',
        textContent: 'Hello World',
        size: { width: 100, height: 20 },
      });

      const result = await generator.generateFromContext(ctx, { componentName: 'TextTest' });
      expect(result.wxml).toContain('<text');
      expect(result.wxml).toContain('Hello World');
    });

    it('应将图片节点映射为 image', async () => {
      const ctx = createMockContext({
        originalType: 'RECTANGLE',
        role: 'image',
        size: { width: 100, height: 100 },
        asset: {
          localPath: '/images/test.png',
          cdnUrl: '',
          type: 'image',
        },
      });

      const result = await generator.generateFromContext(ctx, { componentName: 'ImageTest' });
      expect(result.wxml).toContain('<image');
      expect(result.wxml).toContain('mode="aspectFill"');
      expect(result.wxml).toContain('lazy-load="true"');
    });

    it('应将按钮节点映射为 button', async () => {
      const ctx = createMockContext({
        originalType: 'FRAME',
        role: 'button',
        size: { width: 120, height: 40 },
        children: [
          {
            id: '2',
            name: 'Label',
            figmaId: '2:2',
            originalType: 'TEXT',
            role: 'text',
            visible: true,
            textContent: '点击我',
            size: { width: 60, height: 20 },
            children: [],
          },
        ],
      });

      const result = await generator.generateFromContext(ctx, { componentName: 'ButtonTest' });
      expect(result.wxml).toContain('<button');
      expect(result.wxml).toContain('bindtap="handleTap"');
      expect(result.warnings.some((w) => w.includes('handleTap'))).toBe(true);
    });
  });

  describe('单位转换', () => {
    it('px 转 rpx 计算正确（750 设计稿基准）', () => {
      const gen = generator as any;
      // 375px 在 750 设计稿下 = 375rpx（1:1）
      expect(gen._pxToUnit(375, 750, 'rpx')).toBe(375);
      expect(gen._pxToUnit(750, 750, 'rpx')).toBe(750);
      expect(gen._pxToUnit(100, 750, 'rpx')).toBe(100);
      expect(gen._pxToUnit(0, 750, 'rpx')).toBe(0);
    });

    it('px 转 rpx 支持不同设计稿宽度', () => {
      const gen = generator as any;
      // 375px 在 375 设计稿下 = 750rpx（1:2）
      expect(gen._pxToUnit(375, 375, 'rpx')).toBe(750);
      // 50px 在 375 设计稿下 = 100rpx
      expect(gen._pxToUnit(50, 375, 'rpx')).toBe(100);
    });

    it('px 模式下直接返回四舍五入值', () => {
      const gen = generator as any;
      expect(gen._pxToUnit(375, 750, 'px')).toBe(375);
      expect(gen._pxToUnit(100.6, 750, 'px')).toBe(101);
      expect(gen._pxToUnit(50.4, 750, 'px')).toBe(50);
    });

    it('尺寸属性列表包含常见属性', () => {
      const gen = generator as any;
      expect(gen._isSizeProperty('width')).toBe(true);
      expect(gen._isSizeProperty('height')).toBe(true);
      expect(gen._isSizeProperty('padding')).toBe(true);
      expect(gen._isSizeProperty('margin')).toBe(true);
      expect(gen._isSizeProperty('borderRadius')).toBe(true);
      expect(gen._isSizeProperty('fontSize')).toBe(true);
      expect(gen._isSizeProperty('color')).toBe(false);
      expect(gen._isSizeProperty('display')).toBe(false);
    });
  });

  describe('四件套生成', () => {
    it('应生成 WXML 模板', async () => {
      const ctx = createMockContext();
      const result = await generator.generateFromContext(ctx, { componentName: 'WxmlTest' });
      expect(result.wxml).toContain('.wxml');
      expect(result.wxml).toContain('figma-dev-tools');
    });

    it('应生成 WXSS 样式', async () => {
      const ctx = createMockContext();
      const result = await generator.generateFromContext(ctx, { componentName: 'WxssTest' });
      expect(result.wxss).toContain('.wxss');
    });

    it('应生成 JS 逻辑', async () => {
      const ctx = createMockContext();
      const result = await generator.generateFromContext(ctx, { componentName: 'JsTest' });
      expect(result.js).toContain('.js');
    });

    it('应生成 JSON 配置', async () => {
      const ctx = createMockContext();
      const result = await generator.generateFromContext(ctx, { componentName: 'JsonTest' });
      expect(result.json).toContain('usingComponents');
    });
  });

  describe('页面 vs 组件模式', () => {
    it('组件模式应使用 Component 构造器', async () => {
      const ctx = createMockContext();
      const result = await generator.generateFromContext(ctx, {
        componentName: 'CompTest',
        isPage: false,
      });
      expect(result.js).toContain('Component({');
      expect(result.js).toContain('properties');
      expect(result.js).toContain('methods');
      expect(result.json).toContain('"component": true');
    });

    it('页面模式应使用 Page 构造器', async () => {
      const ctx = createMockContext();
      const result = await generator.generateFromContext(ctx, {
        componentName: 'PageTest',
        isPage: true,
      });
      expect(result.js).toContain('Page({');
      expect(result.js).toContain('onLoad');
      expect(result.js).toContain('onReady');
      expect(result.js).toContain('onShow');
      expect(result.js).toContain('onUnload');
      expect(result.json).not.toContain('"component": true');
      expect(result.json).toContain('navigationBarTitleText');
    });
  });

  describe('组件名处理', () => {
    it('应使用指定的组件名', async () => {
      const ctx = createMockContext();
      const result = await generator.generateFromContext(ctx, {
        componentName: 'MyCustomComponent',
      });
      expect(result.componentName).toBe('MyCustomComponent');
    });

    it('应从节点名推断组件名', async () => {
      const ctx = createMockContext({ name: 'CardComponent' });
      const result = await generator.generateFromContext(ctx);
      expect(result.componentName).toBe('CardComponent');
    });

    it('应清理不安全的组件名字符', async () => {
      const ctx = createMockContext({ name: 'My Component <script>' });
      const result = await generator.generateFromContext(ctx);
      // 组件名不应包含特殊字符和 XSS 内容
      expect(result.componentName).not.toContain('<');
      expect(result.componentName).not.toContain('>');
      expect(result.componentName).not.toContain(' ');
    });
  });

  describe('文本节点安全处理', () => {
    it('应转义文本内容防止 XSS', async () => {
      const ctx = createMockContext({
        originalType: 'TEXT',
        role: 'text',
        textContent: '<script>alert("xss")</script>',
        size: { width: 100, height: 20 },
      });

      const result = await generator.generateFromContext(ctx, { componentName: 'XssTest' });
      expect(result.wxml).not.toContain('<script>');
    });
  });

  describe('待下载资源', () => {
    it('无图片时资源列表为空', async () => {
      const ctx = createMockContext({
        originalType: 'FRAME',
        role: 'container',
        size: { width: 100, height: 50 },
      });

      const result = await generator.generateFromContext(ctx, { componentName: 'NoAssetTest' });
      expect(Array.isArray(result.pendingAssets)).toBe(true);
    });

    it('图片节点应添加到待下载资源', async () => {
      const ctx = createMockContext({
        originalType: 'RECTANGLE',
        role: 'image',
        size: { width: 100, height: 100 },
        fills: [
          {
            type: 'image',
            imageRef: 'img_123',
            scaleMode: 'FILL',
          },
        ],
      });

      const result = await generator.generateFromContext(ctx, { componentName: 'AssetTest' });
      expect(result.pendingAssets.length).toBeGreaterThan(0);
      expect(result.pendingAssets[0].type).toBe('image');
    });
  });

  describe('嵌套节点', () => {
    it('应正确渲染嵌套子节点', async () => {
      const ctx = createMockContext({
        originalType: 'FRAME',
        role: 'container',
        size: { width: 200, height: 200 },
        children: [
          {
            id: 'child1',
            name: 'Child Text',
            figmaId: 'c1',
            originalType: 'TEXT',
            role: 'text',
            visible: true,
            textContent: 'Child Content',
            size: { width: 100, height: 20 },
            children: [],
          },
          {
            id: 'child2',
            name: 'Child Container',
            figmaId: 'c2',
            originalType: 'FRAME',
            role: 'container',
            visible: true,
            size: { width: 100, height: 50 },
            children: [],
          },
        ],
      });

      const result = await generator.generateFromContext(ctx, { componentName: 'NestedTest' });
      expect(result.wxml).toContain('Child Content');
      // 应该有两个子节点标签
      expect(result.wxml.match(/<view/g)?.length || 0).toBeGreaterThanOrEqual(2);
    });
  });

  describe('不可见节点', () => {
    it('应跳过 visible=false 的节点', async () => {
      const ctx = createMockContext({
        originalType: 'FRAME',
        role: 'container',
        size: { width: 200, height: 200 },
        children: [
          {
            id: 'visible',
            name: 'Visible',
            figmaId: 'v1',
            originalType: 'TEXT',
            role: 'text',
            visible: true,
            textContent: 'Visible Text',
            size: { width: 100, height: 20 },
            children: [],
          },
          {
            id: 'hidden',
            name: 'Hidden',
            figmaId: 'h1',
            originalType: 'TEXT',
            role: 'text',
            visible: false,
            textContent: 'Hidden Text',
            size: { width: 100, height: 20 },
            children: [],
          },
        ],
      });

      const result = await generator.generateFromContext(ctx, { componentName: 'VisibleTest' });
      expect(result.wxml).toContain('Visible Text');
      expect(result.wxml).not.toContain('Hidden Text');
    });
  });

  describe('警告信息', () => {
    it('按钮节点应生成 handleTap 警告', async () => {
      const ctx = createMockContext({
        originalType: 'FRAME',
        role: 'button',
        size: { width: 120, height: 40 },
        children: [
          {
            id: 'label',
            name: 'Label',
            figmaId: 'l1',
            originalType: 'TEXT',
            role: 'text',
            visible: true,
            textContent: '按钮',
            size: { width: 60, height: 20 },
            children: [],
          },
        ],
      });

      const result = await generator.generateFromContext(ctx, { componentName: 'WarningTest' });
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes('handleTap'))).toBe(true);
    });

    it('应返回警告数组', async () => {
      const ctx = createMockContext();
      const result = await generator.generateFromContext(ctx, { componentName: 'WarnTest' });
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });

  describe('designWidth 自动推断（P0-61）', () => {
    it('375 宽帧无显式参数 → designWidth=375、来源 frame-375（修复旧版写死 750 的 2 倍偏差）', async () => {
      const ctx = createMockContext(); // 默认根节点 width=375
      const result = await generator.generateFromContext(ctx, { componentName: 'Dw375' });
      expect(result.designWidth).toBe(375);
      expect(result.designWidthSource).toBe('frame-375');
    });

    it('750 宽帧 → designWidth=750、来源 frame-750；414 宽帧 → 通用档 414', async () => {
      const ctx750 = createMockContext({ size: { width: 750, height: 1334 } });
      const r750 = await generator.generateFromContext(ctx750, { componentName: 'Dw750' });
      expect(r750.designWidth).toBe(750);
      expect(r750.designWidthSource).toBe('frame-750');

      const ctx414 = createMockContext({ size: { width: 414, height: 896 } });
      const r414 = await generator.generateFromContext(ctx414, { componentName: 'Dw414' });
      expect(r414.designWidth).toBe(414);
      expect(r414.designWidthSource).toBe('frame-generic');
    });

    it('构造器显式 designWidth=750 时，375 帧也按 manual 750（手动覆盖优先）', async () => {
      const manualGen = new WeappGenerator(mockFigmaClient, { designWidth: 750 });
      const ctx = createMockContext();
      const result = await manualGen.generateFromContext(ctx, { componentName: 'DwManual' });
      expect(result.designWidth).toBe(750);
      expect(result.designWidthSource).toBe('manual');
    });

    it('375 帧内子元素普遍比帧宽（疑似 @2x 尺寸）→ 生成基准不一致 warning', async () => {
      const ctx = createMockContext({
        size: { width: 375, height: 200 },
        children: [
          { id: 'a', name: 'A', figmaId: 'a', originalType: 'FRAME', role: 'container', visible: true, size: { width: 620, height: 80 }, children: [] },
          { id: 'b', name: 'B', figmaId: 'b', originalType: 'FRAME', role: 'container', visible: true, size: { width: 580, height: 80 }, children: [] },
          { id: 'c', name: 'C', figmaId: 'c', originalType: 'FRAME', role: 'container', visible: true, size: { width: 640, height: 80 }, children: [] },
        ],
      });
      const result = await generator.generateFromContext(ctx, { componentName: 'DwWarn' });
      expect(result.warnings.some((w) => w.includes('@2x') || w.includes('基准'))).toBe(true);
    });
  });

  describe('位图资产三模式接线（P0-22）', () => {
    const pngBytes = Buffer.from([1, 2, 3]);
    function imageNodeCtx() {
      return createMockContext({
        originalType: 'RECTANGLE',
        role: 'image',
        size: { width: 100, height: 100 },
        fills: [{ type: 'image', imageRef: 'img_1', scaleMode: 'FILL' }],
      });
    }

    it('local（默认）：批量取导出 URL+字节，src 回填 hash 路径；不再出现空 src', async () => {
      mockFigmaClient.getImages.mockResolvedValue({ images: { '1:1': 'https://x/u.png' } });
      mockFigmaClient.downloadImage.mockResolvedValue(pngBytes);

      const result = await generator.generateFromContext(imageNodeCtx(), { componentName: 'LocalImg' });

      expect(mockFigmaClient.getImages).toHaveBeenCalledWith('test-file-key', ['1:1'], 'png', 2);
      expect(result.assetManifest).toHaveLength(1);
      expect(result.assetManifest[0].state).toBe('local-resolved');
      expect(result.assetManifest[0].localPath).toMatch(/^\/images\/default\/[0-9a-f]{12}-test-component\.png$/);
      expect(result.wxml).toContain(`src="${result.assetManifest[0].localPath}"`);
      expect(result.wxml).not.toContain('src=""');
      expect(result.assetBytes.size).toBe(1);
    });

    it('cdn + publicBaseUrl：src 回填稳定 CDN URL', async () => {
      mockFigmaClient.getImages.mockResolvedValue({ images: { '1:1': 'https://x/u.png' } });
      mockFigmaClient.downloadImage.mockResolvedValue(pngBytes);

      const result = await generator.generateFromContext(imageNodeCtx(), {
        componentName: 'CdnImg',
        assetMode: 'cdn',
        publicBaseUrl: 'https://cdn.example.com/a/',
        cdnUploader: verifiedUploader,
      });
      expect(result.assetManifest[0].state).toBe('cdn-resolved');
      expect(result.wxml).toContain('src="https://cdn.example.com/a/images/default/');
      expect(result.wxml).not.toContain('s3-alpha');
    });

    it('base64：小图 src 内联 data URI', async () => {
      mockFigmaClient.getImages.mockResolvedValue({ images: { '1:1': 'https://x/u.png' } });
      mockFigmaClient.downloadImage.mockResolvedValue(pngBytes);

      const result = await generator.generateFromContext(imageNodeCtx(), {
        componentName: 'B64Img',
        assetMode: 'base64',
      });
      expect(result.assetManifest[0].state).toBe('base64-resolved');
      expect(result.wxml).toContain('src="data:image/png;base64,');
    });

    it('导出 URL 缺失（FETCH_FAILED）：移除 src 属性并产生 warning，不阻断生成', async () => {
      mockFigmaClient.getImages.mockResolvedValue({ images: { '1:1': null } });

      const result = await generator.generateFromContext(imageNodeCtx(), { componentName: 'FailImg' });
      expect(result.assetManifest[0].state).toBe('unresolved');
      expect(result.assetManifest[0].reason).toBe('FETCH_FAILED');
      expect(result.wxml).not.toContain('src=');
      expect(result.wxml).toContain('<image');
      expect(result.warnings.some((w) => w.includes('FETCH_FAILED'))).toBe(true);
    });
  });

  describe('图标 SVG 四分支（P0-31，禁止内联 <svg>）', () => {
    const svgBytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    function vectorNodeCtx() {
      return createMockContext({
        originalType: 'VECTOR',
        size: { width: 24, height: 24 },
        children: [],
      });
    }

    it('image-local（默认）：导出 .svg 字节，<image src=hash路径>，绝不内联 <svg>', async () => {
      mockFigmaClient.getImages.mockResolvedValue({ images: { '1:1': 'https://x/i.svg' } });
      mockFigmaClient.downloadImage.mockResolvedValue(svgBytes);

      const result = await generator.generateFromContext(vectorNodeCtx(), { componentName: 'IconLocal' });

      expect(mockFigmaClient.getImages).toHaveBeenCalledWith('test-file-key', ['1:1'], 'svg', 2);
      expect(result.assetManifest).toHaveLength(1);
      expect(result.assetManifest[0].kind).toBe('svg');
      expect(result.assetManifest[0].state).toBe('local-resolved');
      expect(result.assetManifest[0].localPath).toMatch(/\.svg$/);
      expect(result.wxml).toContain(`src="${result.assetManifest[0].localPath}"`);
      expect(result.wxml).toContain('mode="aspectFit"');
      expect(result.wxml).not.toMatch(/<svg[\s>]/);
      expect(result.wxml).not.toContain('src=""');
    });

    it('image-cdn + publicBaseUrl：图标 src 走稳定 CDN', async () => {
      mockFigmaClient.getImages.mockResolvedValue({ images: { '1:1': 'https://x/i.svg' } });
      mockFigmaClient.downloadImage.mockResolvedValue(svgBytes);

      const result = await generator.generateFromContext(vectorNodeCtx(), {
        componentName: 'IconCdn',
        iconStrategy: 'image-cdn',
        publicBaseUrl: 'https://cdn.example.com/app',
        cdnUploader: verifiedUploader,
      });
      expect(result.assetManifest[0].state).toBe('cdn-resolved');
      expect(result.wxml).toContain('src="https://cdn.example.com/app/images/default/');
      expect(result.wxml).not.toMatch(/<svg[\s>]/);
    });

    it('base64：小图标内联 data:image/svg+xml;base64', async () => {
      mockFigmaClient.getImages.mockResolvedValue({ images: { '1:1': 'https://x/i.svg' } });
      mockFigmaClient.downloadImage.mockResolvedValue(svgBytes);

      const result = await generator.generateFromContext(vectorNodeCtx(), {
        componentName: 'IconB64',
        iconStrategy: 'base64',
      });
      expect(result.assetManifest[0].state).toBe('base64-resolved');
      expect(result.wxml).toContain('src="data:image/svg+xml;base64,');
      expect(result.wxml).not.toMatch(/<svg[\s>]/);
    });

    it('base64 但图标超 2KB → SIZE_LIMIT：移除 src + warning，仍不内联 <svg>', async () => {
      mockFigmaClient.getImages.mockResolvedValue({ images: { '1:1': 'https://x/big.svg' } });
      mockFigmaClient.downloadImage.mockResolvedValue(Buffer.alloc(3 * 1024));

      const result = await generator.generateFromContext(vectorNodeCtx(), {
        componentName: 'IconBig',
        iconStrategy: 'base64',
      });
      expect(result.assetManifest[0].state).toBe('unresolved');
      expect(result.assetManifest[0].reason).toBe('SIZE_LIMIT');
      expect(result.wxml).not.toContain('src=');
      expect(result.wxml).not.toMatch(/<svg[\s>]/);
      expect(result.warnings.some((w) => w.includes('SIZE_LIMIT'))).toBe(true);
    });
  });

  describe('列表/条件渲染接线（P0-12）', () => {
    function cardWithTags(suffix: string): Partial<ProcessedNode> {
      return {
        id: `card-${suffix}`,
        figmaId: `card-${suffix}`,
        name: 'Card',
        originalType: 'FRAME',
        role: 'card',
        visible: true,
        size: { width: 120, height: 100 },
        children: [
          {
            id: `title-${suffix}`, figmaId: `title-${suffix}`, name: 'Title', originalType: 'TEXT', role: 'text',
            visible: true, textContent: `标题${suffix}`, size: { width: 60, height: 16 }, children: [],
          } as ProcessedNode,
          {
            id: `tags-${suffix}`, figmaId: `tags-${suffix}`, name: 'Tag Row', originalType: 'FRAME', role: 'container',
            visible: true, size: { width: 120, height: 24 },
            children: [1, 2, 3].map((i) => ({
              id: `tag-${suffix}-${i}`, figmaId: `tag-${suffix}-${i}`, name: 'Tag', originalType: 'FRAME', role: 'chip',
              visible: true, size: { width: 30, height: 20 },
              children: [{
                id: `taglabel-${suffix}-${i}`, figmaId: `taglabel-${suffix}-${i}`, name: 'Label', originalType: 'TEXT',
                role: 'text', visible: true, textContent: `${suffix}-${i}`, size: { width: 20, height: 14 }, children: [],
              } as ProcessedNode],
            })) as ProcessedNode[],
          } as ProcessedNode,
        ],
      };
    }

    it('3 个同构卡片 → 只渲染 1 个原型 + wx:for/key/item/index；文本插值 {{card.title}}', async () => {
      const ctx = createMockContext({
        name: 'Card List',
        children: [cardWithTags('A'), cardWithTags('B'), cardWithTags('C')] as ProcessedNode[],
      });
      const result = await generator.generateFromContext(ctx, { componentName: 'NewsList' });

      // 指令四件套
      expect(result.wxml).toContain('wx:for="{{cardList}}"');
      expect(result.wxml).toContain('wx:for-item="card"');
      expect(result.wxml).toContain('wx:for-index="cardIndex"');
      expect(result.wxml).toContain('wx:key="id"');
      // 只渲染原型：其余两张卡片的静态文案不得出现
      expect(result.wxml).not.toContain('标题B');
      expect(result.wxml).not.toContain('标题C');
      expect(result.wxml).toContain('{{card.title}}');
      // JS data 注入真实占位数据（JSON 风格双引号字符串）
      expect(result.js).toContain('cardList: [');
      expect(result.js).toContain('title: "标题A"');
      // 不再出现旧别名 wx:for-items
      expect(result.wxml).not.toContain('wx:for-items');
    });

    it('嵌套循环：内层 wx:for="{{card.tagRow}}"，别名与外层不碰撞，标签文本 {{tag.label}}', async () => {
      const ctx = createMockContext({
        name: 'Card List',
        children: [cardWithTags('A'), cardWithTags('B'), cardWithTags('C')] as ProcessedNode[],
      });
      const result = await generator.generateFromContext(ctx, { componentName: 'NewsNested' });

      expect(result.wxml).toContain('wx:for="{{card.tagRow}}"');
      expect(result.wxml).toContain('wx:for-item="tag"');
      expect(result.wxml).toContain('{{tag.label}}');
      // 别名全局唯一
      expect(result.wxml).not.toContain('wx:for-item="card"\n... wx:for-item="card"');
      expect(result.js).toContain('tagRow: [');
      expect(result.js).toContain('label: "A-1"');
      expect(result.js).toContain('label: "C-3"');
    });

    it('条件默认保守：Modal 正常渲染、无指令，但进入 conditionSuggestions 报告', async () => {
      const ctx = createMockContext({
        name: 'Screen',
        children: [{
          id: 'm1', figmaId: 'm1', name: 'Confirm Modal', originalType: 'FRAME', role: 'container',
          visible: true, size: { width: 200, height: 120 }, children: [],
        } as ProcessedNode],
      });
      const result = await generator.generateFromContext(ctx, { componentName: 'Scr' });
      expect(result.wxml).not.toContain('wx:if');
      expect(result.wxml).not.toContain('hidden=');
      expect(result.conditionSuggestions.some((s) => s.signal === 'name:modal')).toBe(true);
    });

    it('inference.conditions=true：Modal 元素加 hidden="{{!showConfirmModal}}"，data 默认可见', async () => {
      const ctx = createMockContext({
        name: 'Screen',
        children: [{
          id: 'm1', figmaId: 'm1', name: 'Confirm Modal', originalType: 'FRAME', role: 'container',
          visible: true, size: { width: 200, height: 120 }, children: [],
        } as ProcessedNode],
      });
      const result = await generator.generateFromContext(ctx, {
        componentName: 'Scr2',
        inference: { conditions: true },
      });
      expect(result.wxml).toContain('hidden="{{!showConfirmModal}}"');
      expect(result.js).toContain('showConfirmModal: true');
    });

    it('显式 if/elif/else：三兄弟元素分别带 wx:if / wx:elif / wx:else（同组同父级）', async () => {
      const mk = (id: string, name: string): ProcessedNode => ({
        id, figmaId: id, name, originalType: 'FRAME', role: 'container', visible: true,
        size: { width: 100, height: 40 }, children: [],
      } as ProcessedNode);
      const ctx = createMockContext({
        name: 'Tabs',
        children: [mk('t1', 'Tab Home'), mk('t2', 'Tab Profile'), mk('t3', 'Tab Empty')],
      });
      const result = await generator.generateFromContext(ctx, {
        componentName: 'TabsCmp',
        inference: { list: false },
        conditions: [
          { nodeId: 't1', groupId: 'tabs', expression: "activeTab === 'home'" },
          { nodeId: 't2', groupId: 'tabs', expression: "activeTab === 'profile'" },
          { nodeId: 't3', groupId: 'tabs', isElse: true },
        ],
      });
      expect(result.wxml).toContain(`wx:if="{{activeTab === 'home'}}"`);
      expect(result.wxml).toContain(`wx:elif="{{activeTab === 'profile'}}"`);
      expect(result.wxml).toContain('wx:else');
      // else 分支是无文本空容器，验证三个兄弟元素都被渲染（各自独立 class）
      expect(result.wxml).toMatch(/wx:else[\s\S]*?<\/view>/);
      expect(result.wxml.match(/<view /g)).toHaveLength(4); // 父 Tabs + 三个分支
    });

    it('inference.list=false：不折叠重复组，三张卡片静态渲染、无 wx:for、data 无 cardList', async () => {
      const ctx = createMockContext({
        name: 'Card List',
        children: [cardWithTags('A'), cardWithTags('B'), cardWithTags('C')] as ProcessedNode[],
      });
      const result = await generator.generateFromContext(ctx, {
        componentName: 'StaticCards',
        inference: { list: false },
      });
      expect(result.wxml).not.toContain('wx:for');
      expect(result.wxml).toContain('标题A');
      expect(result.wxml).toContain('标题C');
      expect(result.js).not.toContain('cardList');
    });
  });

  describe('WXSS Skyline 降级接线（P0-41）', () => {
    function multiShadowNode(renderer?: 'webview' | 'skyline') {
      const ctx = createMockContext({
        name: 'ShadowCard',
        originalType: 'FRAME',
        role: 'card',
        size: { width: 100, height: 100 },
        effects: [
          { type: 'drop', x: 0, y: 1, blur: 2, spread: 0, color: { r: 0, g: 0, b: 0, a: 0.2 } },
          { type: 'drop', x: 0, y: 4, blur: 8, spread: 0, color: { r: 0, g: 0, b: 0, a: 0.1 } },
        ] as ProcessedNode['effects'],
      });
      return generator.generateFromContext(ctx, { componentName: 'ShadowCmp', ...(renderer ? { renderer } : {}) });
    }

    it('renderer=skyline：多叠加 box-shadow 只保留首层并产生可追溯 warning', async () => {
      const result = await multiShadowNode('skyline');
      // wxss 中 box-shadow 声明只剩一层（不含第二个阴影的 8px blur 层）
      const shadowLines = result.wxss.split('\n').filter((l) => l.includes('box-shadow'));
      expect(shadowLines).toHaveLength(1);
      expect(shadowLines[0]).not.toContain('4px 8px');
      expect(shadowLines[0]).toContain('2px');
      expect(result.warnings.some((w) => w.includes('FDT-WXSS-SHADOW-MULTI'))).toBe(true);
    });

    it('默认 webview：不做属性级拦截，两层 box-shadow 原样保留、无 WXSS warning', async () => {
      const result = await multiShadowNode();
      const shadowLines = result.wxss.split('\n').filter((l) => l.includes('box-shadow'));
      expect(shadowLines).toHaveLength(1);
      expect(shadowLines[0]).toContain(',');
      expect(result.warnings.some((w) => w.includes('FDT-WXSS-'))).toBe(false);
    });
  });

  describe('原生组件映射（P0-51）', () => {
    it('名称含 scroll 且 clipsContent → scroll-view（含默认 scroll-y），普通 Frame 仍是 view', async () => {
      const scrollCtx = createMockContext({
        name: 'Feed Scroll View',
        clipsContent: true,
        size: { width: 375, height: 600 },
        children: [
          { id: 'r1', figmaId: 'r1', name: 'Row', originalType: 'FRAME', role: 'container', visible: true, size: { width: 350, height: 80 }, children: [] } as ProcessedNode,
        ],
      });
      const r = await generator.generateFromContext(scrollCtx, { componentName: 'Feed' });
      expect(r.wxml).toContain('<scroll-view');
      expect(r.wxml).toContain('scroll-y="true"');
      expect(r.wxml).toContain('</scroll-view>');

      const plainCtx = createMockContext({ name: 'Feed Container', size: { width: 375, height: 600 } });
      const p = await generator.generateFromContext(plainCtx, { componentName: 'Feed2' });
      expect(p.wxml).not.toContain('<scroll-view');
    });

    it('swiper：自动为非 swiper-item 的子节点包裹 swiper-item', async () => {
      const ctx = createMockContext({
        name: 'Banner Swiper',
        size: { width: 375, height: 160 },
        children: [1, 2, 3].map((i) => ({
          id: `s${i}`, figmaId: `s${i}`, name: 'Slide', originalType: 'FRAME', role: 'container', visible: true,
          size: { width: 375, height: 160 },
          children: [{
            id: `st${i}`, figmaId: `st${i}`, name: 'Caption', originalType: 'TEXT', role: 'text', visible: true,
            textContent: `第${i}张`, size: { width: 60, height: 16 }, children: [],
          } as ProcessedNode],
        })) as ProcessedNode[],
      });
      const r = await generator.generateFromContext(ctx, { componentName: 'Banner' });
      // 根 swiper 只渲染原型（3 个同构 Slide 命中列表）；断言 swiper-item 包裹存在
      expect(r.wxml).toContain('<swiper');
      expect(r.wxml).toContain('<swiper-item');
      expect(r.wxml).toContain('</swiper-item>');
      expect(r.wxml).toContain('</swiper>');
      // wx:for 必须提升到 swiper-item（而非其内部 view），否则所有幻灯片堆叠在首个 item
      expect(r.wxml).toMatch(/<swiper-item[^>]*wx:for="\{\{bannerSwiper\}\}"[^>]*>/);
      expect(r.wxml).not.toMatch(/<view[^>]*wx:for[^>]*>/);
      // 只渲染原型一张：第 2/3 张静态文案折叠为数据插值
      expect(r.wxml).not.toContain('第2张');
      expect(r.wxml).not.toContain('第3张');
      expect(r.wxml).toContain('{{bannerSwiper.caption}}');
    });

    it('rich-text（WBS-P2-22）：富文本子树绑定构造好的 nodes 数据，JS 注入节点数组', async () => {
      const ctx = createMockContext({
        name: 'Article Rich Text',
        size: { width: 375, height: 200 },
        children: [
          {
            id: 'h1', figmaId: 'h1', name: 'H2 Title', originalType: 'TEXT', role: 'text', visible: true,
            textContent: '条款标题',
            textStyle: { fontFamily: 'sans', fontWeight: 700, fontSize: 20, lineHeightPx: 28, letterSpacing: 0, textAlignHorizontal: 'LEFT', textAlignVertical: 'TOP' },
            size: { width: 300, height: 28 }, children: [],
          } as ProcessedNode,
          {
            id: 'p1', figmaId: 'p1', name: 'Paragraph', originalType: 'TEXT', role: 'text', visible: true,
            textContent: '正文段落内容', size: { width: 300, height: 40 }, children: [],
          } as ProcessedNode,
        ],
      });
      const r = await generator.generateFromContext(ctx, { componentName: 'Article', isPage: true });
      expect(r.wxml).toContain('<rich-text');
      expect(r.wxml).toMatch(/nodes="\{\{rich[A-Za-z]+Nodes\}\}"/);
      // 正文不直接出现在 WXML
      expect(r.wxml).not.toContain('正文段落内容');
      // JS data 中注入了构造好的 nodes（官方节点名 + 数据叶子，值沿用数据块 JSON 风格）
      expect(r.js).toContain('name: "h2"');
      expect(r.js).toContain('text: "正文段落内容"');
      expect(r.js).toContain('type: "node"');
    });

    it('rich-text 分流（WBS-P2-22）：仅含简单文本时退回普通 <text>，不用 rich-text', async () => {
      const ctx = createMockContext({
        name: 'Simple Rich Text',
        size: { width: 200, height: 40 },
        children: [{
          id: 'p1', figmaId: 'p1', name: 'Paragraph', originalType: 'TEXT', role: 'text', visible: true,
          textContent: '一句普通文本', size: { width: 180, height: 20 }, children: [],
        } as ProcessedNode],
      });
      const r = await generator.generateFromContext(ctx, { componentName: 'SimpleArticle' });
      expect(r.wxml).not.toContain('<rich-text');
      expect(r.wxml).toContain('<text');
      expect(r.wxml).toContain('一句普通文本');
    });

    it('picker：渲染为 picker 包裹触发子节点，带 mode="selector"', async () => {
      const ctx = createMockContext({
        name: 'City Picker',
        size: { width: 200, height: 40 },
        children: [{
          id: 'pl', figmaId: 'pl', name: 'Label', originalType: 'TEXT', role: 'text', visible: true,
          textContent: '请选择城市', size: { width: 80, height: 16 }, children: [],
        } as ProcessedNode],
      });
      const r = await generator.generateFromContext(ctx, { componentName: 'CitySelect' });
      expect(r.wxml).toContain('<picker');
      expect(r.wxml).toContain('mode="selector"');
      expect(r.wxml).toContain('bindchange="onCityPickerChange"');
      expect(r.wxml).toContain('请选择城市');
      expect(r.wxml).toContain('</picker>');
      // P0-52：JS 生成 change 方法骨架（Component），result.events 汇总
      expect(r.js).toContain('onCityPickerChange(e)');
      expect(r.events.some((e) => e.handler === 'onCityPickerChange' && e.event === 'change')).toBe(true);
      expect(r.warnings.some((w) => w.includes('onCityPickerChange'))).toBe(true);
    });
  });

  describe('事件映射与 JS methods（P0-52）', () => {
    it('input：bindinput + JS input 方法读取 e.detail.value（Component 用 triggerEvent）', async () => {
      const ctx = createMockContext({
        name: 'Name Input',
        originalType: 'FRAME',
        role: 'input',
        size: { width: 200, height: 40 },
      });
      const r = await generator.generateFromContext(ctx, { componentName: 'NameField' });
      expect(r.wxml).toContain('bindinput="onNameInput"');
      expect(r.js).toContain('onNameInput(e)');
      expect(r.js).toContain('e.detail.value');
      // 默认组件（非 Page）走 triggerEvent
      expect(r.js).toContain("this.triggerEvent('input'");
    });

    it('Page 模式：事件方法为顶层函数、读取 e.detail.value，不出现 triggerEvent', async () => {
      const ctx = createMockContext({
        name: 'Search Form',
        originalType: 'FRAME',
        role: 'container',
        size: { width: 375, height: 200 },
      });
      // form 标签由 role/标签映射，这里直接构造一个 tag=form 的容器：用 originalType 不可得，
      // 改用原生 input 节点验证 Page 方法缩进（顶层 2 空格）
      const inputCtx = createMockContext({ name: 'Keyword Input', role: 'input', size: { width: 200, height: 40 } });
      const r = await generator.generateFromContext(inputCtx, { componentName: 'SearchPage', isPage: true });
      expect(r.js).toContain('Page({');
      expect(r.js).toMatch(/\n  onKeywordInput\(e\) \{/); // 顶层方法 2 空格缩进
      expect(r.js).not.toContain('triggerEvent');
    });

    it('名称含 mask 的可点击层 → catchtap（阻止冒泡），普通按钮 bindtap', async () => {
      const maskCtx = createMockContext({
        name: 'Dialog Mask',
        role: 'button',
        size: { width: 375, height: 600 },
      });
      const m = await generator.generateFromContext(maskCtx, { componentName: 'MaskCmp' });
      expect(m.wxml).toContain('catchtap="handleTap"');
      expect(m.wxml).not.toContain('bindtap');

      const btnCtx = createMockContext({ name: 'Submit Button', role: 'button', size: { width: 120, height: 40 } });
      const b = await generator.generateFromContext(btnCtx, { componentName: 'OkBtn' });
      expect(b.wxml).toContain('bindtap="handleTap"');
    });

    it('aria-label 按能力矩阵去留：view 保留、rich-text 不输出', async () => {
      const viewCtx = createMockContext({ name: 'Box', size: { width: 100, height: 100 } });
      (viewCtx.node as any)._a11y = { ariaLabel: '盒子' };
      const v = await generator.generateFromContext(viewCtx, { componentName: 'BoxCmp' });
      expect(v.wxml).toContain('aria-label="盒子"');

      const rtCtx = createMockContext({ name: 'Body Rich Text', size: { width: 300, height: 100 } });
      (rtCtx.node as any)._a11y = { ariaLabel: '正文' };
      const r = await generator.generateFromContext(rtCtx, { componentName: 'BodyCmp' });
      expect(r.wxml).not.toContain('aria-label');
    });
  });

  describe('兄弟节点样式隔离（P0-81 保真度闸门暴露的回归）', () => {
    it('同层多个子节点生成互不相同的 class，各自样式独立落 WXSS（不被末位节点覆盖）', async () => {
      const ctx = createMockContext({
        name: 'Siblings',
        size: { width: 375, height: 200 },
        children: [
          {
            id: 'a', figmaId: 'a', name: 'Red Box', originalType: 'FRAME', role: 'container', visible: true,
            size: { width: 100, height: 50 },
            fills: [{ type: 'solid', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' }],
            children: [],
          },
          {
            id: 'b', figmaId: 'b', name: 'Blue Box', originalType: 'FRAME', role: 'container', visible: true,
            size: { width: 200, height: 80 },
            fills: [{ type: 'solid', color: { r: 0, g: 0, b: 1, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' }],
            children: [],
          },
        ],
      });
      const r = await generator.generateFromContext(ctx, { componentName: 'SiblingTest' });
      const classes = [...r.wxml.matchAll(/class="(comp-\d+)"/g)].map((m) => m[1]);
      expect(new Set(classes).size).toBe(classes.length); // 无重复 class
      expect(r.wxss).toContain('rgba(255, 0, 0, 1)'); // 红盒样式未被蓝盒覆盖
      expect(r.wxss).toContain('rgba(0, 0, 255, 1)');
      expect(r.wxss).toContain('200rpx;'); // 红盒 100px→200rpx
      expect(r.wxss).toContain('400rpx;'); // 蓝盒 200px→400rpx
    });
  });

  describe('WXSS 还原度报告（P0-81）', () => {
    it('结果含 fidelity：rate/matched/total/missing/excluded 结构完整', async () => {
      const ctx = createMockContext({
        name: 'Card',
        size: { width: 375, height: 200 },
        fills: [{ type: 'solid', color: { r: 1, g: 1, b: 1, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' }],
        cornerRadius: 12,
        children: [{
          id: 't1', figmaId: 't1', name: 'Title', originalType: 'TEXT', role: 'text', visible: true,
          textContent: '标题', size: { width: 200, height: 28 },
          textStyle: { fontFamily: 'sans', fontWeight: 600, fontSize: 20 } as ProcessedNode['textStyle'],
          children: [],
        } as ProcessedNode],
      });
      const r = await generator.generateFromContext(ctx, { componentName: 'FidCard' });
      expect(r.fidelity).toBeDefined();
      expect(r.fidelity.total).toBeGreaterThan(0);
      expect(r.fidelity.matched).toBeLessThanOrEqual(r.fidelity.total);
      expect(r.fidelity.rate).toBeGreaterThan(0);
      expect(r.fidelity.rate).toBeLessThanOrEqual(1);
      expect(Array.isArray(r.fidelity.missing)).toBe(true);
      expect(Array.isArray(r.fidelity.excluded)).toBe(true);
    });

    it('静态页面视觉属性全部落地 → rate=1、missing 为空', async () => {
      const ctx = createMockContext({
        name: 'Panel',
        size: { width: 375, height: 120 },
        layout: {
          mode: 'VERTICAL', primaryAxisAlign: 'CENTER', counterAxisAlign: 'CENTER',
          primaryAxisSizing: 'AUTO', counterAxisSizing: 'AUTO', layoutWrap: 'NO_WRAP',
          itemSpacing: 12, padding: { top: 16, right: 16, bottom: 16, left: 16 },
        } as ProcessedNode['layout'],
        children: [{
          id: 'lbl', figmaId: 'lbl', name: 'Label', originalType: 'TEXT', role: 'text', visible: true,
          textContent: '确定', size: { width: 80, height: 32 },
          textStyle: { fontFamily: 'sans', fontWeight: 500, fontSize: 16, textAlignHorizontal: 'CENTER' } as ProcessedNode['textStyle'],
          children: [],
        } as ProcessedNode],
      });
      const r = await generator.generateFromContext(ctx, { componentName: 'FidPanel', skipEnhancements: true });
      expect(r.fidelity.rate).toBe(1);
      expect(r.fidelity.missing).toEqual([]);
    });

    it('列表折叠成员登记为 list-folded-member 排除项，不拖垮覆盖率', async () => {
      const row = (i: number): ProcessedNode => ({
        id: `row${i}`, figmaId: `row${i}`, name: 'List Row', originalType: 'FRAME', role: 'container', visible: true,
        size: { width: 343, height: 64 },
        fills: [{ type: 'solid', color: { r: 1, g: 1, b: 1, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' }],
        cornerRadius: 8,
        children: [{
          id: `rt${i}`, figmaId: `rt${i}`, name: 'Row Title', originalType: 'TEXT', role: 'text', visible: true,
          textContent: `第 ${i} 行`, size: { width: 200, height: 22 },
          textStyle: { fontFamily: 'sans', fontWeight: 400, fontSize: 15 } as ProcessedNode['textStyle'],
          children: [],
        }],
      } as ProcessedNode);
      const ctx = createMockContext({
        name: 'Row List',
        size: { width: 375, height: 400 },
        children: [row(1), row(2), row(3)],
      });
      const r = await generator.generateFromContext(ctx, { componentName: 'FidList' });
      // 折叠 2 个非原型成员
      expect(r.fidelity.excluded.filter((x) => x.property === 'list-folded-member')).toHaveLength(2);
      // 原型 class 承载全部承诺属性，覆盖率不应因重复而下降
      expect(r.fidelity.rate).toBeGreaterThanOrEqual(0.85);
    });
  });
});
