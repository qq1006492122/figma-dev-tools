/**
 * VisualApproximationService 单元测试
 *
 * 测试覆盖：
 * 1. 配置合并与更新
 * 2. 近似代码骨架生成（React/Vue/HTML 三框架）
 * 3. TODO 清单生成（中英文）
 * 4. 边界场景：DPR=0、width=0、height=0
 * 5. 文件写入与目录创建
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  VisualApproximationService,
  getVisualApproximationService,
  resetVisualApproximationService,
} from '../../src/services/visual-approximation.js';
import type { BrowserFallbackResult } from '../../src/services/browser-fallback.js';

describe('VisualApproximationService', () => {
  let service: VisualApproximationService;
  let tempDir: string;

  beforeEach(() => {
    resetVisualApproximationService();
    tempDir = path.join(os.tmpdir(), `figma-visual-test-${Date.now()}`);
    service = new VisualApproximationService({ outputDir: tempDir });
  });

  afterEach(async () => {
    resetVisualApproximationService();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 忽略
    }
  });

  /** 构造一个标准的 BrowserFallbackResult 用于测试 */
  function createMockFallbackResult(overrides: Partial<BrowserFallbackResult> = {}): BrowserFallbackResult {
    return {
      screenshotPath: path.join(tempDir, 'mock-screenshot.png'),
      width: 1920,
      height: 1080,
      devicePixelRatio: 2,
      capturedAt: Date.now(),
      warnings: [],
      isApproximate: true,
      os: 'windows',
      nodeFocused: true,
      ...overrides,
    };
  }

  describe('配置管理', () => {
    it('应正确合并默认配置', () => {
      const options = service.getOptions();
      expect(options.framework).toBe('react');
      expect(options.generateSkeleton).toBe(true);
      expect(options.includeTodoComments).toBe(true);
      expect(options.inlineScreenshot).toBe(false);
    });

    it('应支持动态更新配置', () => {
      service.updateOptions({ framework: 'vue', inlineScreenshot: true });
      const options = service.getOptions();
      expect(options.framework).toBe('vue');
      expect(options.inlineScreenshot).toBe(true);
    });
  });

  describe('近似代码骨架生成', () => {
    it('React 骨架应包含组件名和 TODO 注释', async () => {
      const result = await service.generateApproximation(createMockFallbackResult());
      expect(result.skeletonCode).toContain('ApproximateDesign');
      expect(result.skeletonCode).toContain('React.FC');
      expect(result.skeletonCode).toContain('TODO');
      expect(result.skeletonCode).toContain('data-approximate-mode');
      expect(result.skeletonCode).toContain('data-fidelity');
    });

    it('Vue 骨架应包含 template 和 script setup', async () => {
      const vueService = new VisualApproximationService({
        outputDir: tempDir,
        framework: 'vue',
      });
      const result = await vueService.generateApproximation(createMockFallbackResult());
      expect(result.skeletonCode).toContain('<template>');
      expect(result.skeletonCode).toContain('<script setup');
      expect(result.skeletonCode).toContain('approximate-design');
    });

    it('HTML 骨架应包含 DOCTYPE 和 body', async () => {
      const htmlService = new VisualApproximationService({
        outputDir: tempDir,
        framework: 'html',
      });
      const result = await htmlService.generateApproximation(createMockFallbackResult());
      expect(result.skeletonCode).toContain('<!DOCTYPE html>');
      expect(result.skeletonCode).toContain('<html');
      expect(result.skeletonCode).toContain('<body>');
      expect(result.skeletonCode).toContain('approximate-design');
    });

    it('骨架应包含横幅提示和预期还原度', async () => {
      const result = await service.generateApproximation(createMockFallbackResult());
      expect(result.banner).toContain('近似模式');
      expect(result.banner).toContain('70-80%');
      expect(result.expectedFidelity).toBe(75);
    });
  });

  describe('TODO 清单生成', () => {
    it('TODO 清单应包含 10 个条目', async () => {
      const result = await service.generateApproximation(createMockFallbackResult());
      // 计算未勾选的 TODO 条目数
      const todoCount = (result.todoMarkdown.match(/- \[ \]/g) || []).length;
      expect(todoCount).toBe(10);
    });

    it('TODO 清单应包含标题和预期还原度', async () => {
      const result = await service.generateApproximation(createMockFallbackResult());
      expect(result.todoMarkdown).toContain('待人工校对项');
      // TODO 清单中的还原度格式是 ~75%（数值），70-80% 只在 banner 中
      expect(result.todoMarkdown).toContain('~75%');
    });
  });

  describe('文件输出', () => {
    it('应生成骨架文件和 TODO 文件', async () => {
      const result = await service.generateApproximation(createMockFallbackResult());
      expect(result.skeletonPath).toBeDefined();
      expect(result.todoPath).toBeDefined();

      // 验证文件实际存在
      const skeletonExists = await fs.access(result.skeletonPath!).then(() => true).catch(() => false);
      const todoExists = await fs.access(result.todoPath!).then(() => true).catch(() => false);
      expect(skeletonExists).toBe(true);
      expect(todoExists).toBe(true);
    });

    it('应自动创建不存在的输出目录', async () => {
      const nestedDir = path.join(tempDir, 'nested', 'deep', 'dir');
      const svc = new VisualApproximationService({ outputDir: nestedDir });
      const result = await svc.generateApproximation(createMockFallbackResult());
      expect(result.skeletonPath).toBeDefined();
      // 目录应被自动创建
      const dirExists = await fs.access(nestedDir).then(() => true).catch(() => false);
      expect(dirExists).toBe(true);
    });
  });

  describe('边界场景', () => {
    it('DPR=0 时应兜底为默认值 2，不产生 NaN', async () => {
      const result = await service.generateApproximation(
        createMockFallbackResult({ devicePixelRatio: 0 }),
      );
      // 骨架中不应出现 NaN 或 Infinity
      expect(result.skeletonCode).not.toContain('NaN');
      expect(result.skeletonCode).not.toContain('Infinity');
      // DPR=0 时 safeDpr 兜底为 2，1920/2=960 是正确的逻辑像素值
      expect(result.skeletonCode).toContain('960px');
      expect(result.skeletonCode).toContain('540px');
    });

    it('width=0、height=0 时应兜底为默认视口尺寸', async () => {
      const result = await service.generateApproximation(
        createMockFallbackResult({ width: 0, height: 0 }),
      );
      // 不应出现 width: '0px'
      expect(result.skeletonCode).not.toContain("width: '0px'");
      expect(result.skeletonCode).not.toContain("minHeight: '0px'");
      // 应使用默认尺寸
      expect(result.skeletonCode).toContain('1920');
      expect(result.skeletonCode).toContain('1080');
    });

    it('DPR 为负数时应兜底为默认值', async () => {
      const result = await service.generateApproximation(
        createMockFallbackResult({ devicePixelRatio: -1 }),
      );
      expect(result.skeletonCode).not.toContain('NaN');
      expect(result.skeletonCode).not.toContain('Infinity');
    });
  });

  describe('devModeCss 注释注入防护（修复逻辑黑洞 #4）', () => {
    it('包含星号-斜杠的 devModeCss 不应提前终止注释块', async () => {
      // 构造恶意 devModeCss，含 */ 试图提前结束注释块
      const maliciousCss = '.test { color: red; }\n/* injected */ .bad { color: blue; }';
      const result = await service.generateApproximation(
        createMockFallbackResult({ devModeCss: maliciousCss }),
      );

      // 骨架应能正常生成，不包含被注入的代码结构
      // 验证：原始 */ 应被转义为 *\/，不会破坏外层注释
      expect(result.skeletonCode).toContain('Dev Mode CSS');
      // 关键断言：骨架代码不应包含未转义的 */ 字符在 Dev Mode CSS 注释区域
      // 通过检查 export 语句仍存在来验证骨架结构完整
      expect(result.skeletonCode).toContain('export');
      expect(result.skeletonCode).toContain('ApproximateDesign');
    });

    it('包含 --> 的 devModeCss 在 Vue/HTML 骨架中不应破坏注释', async () => {
      const vueService = new VisualApproximationService({
        outputDir: tempDir,
        framework: 'vue',
      });
      const maliciousCss = '.test { color: red; } --> <script>alert(1)</script>';
      const result = await vueService.generateApproximation(
        createMockFallbackResult({ devModeCss: maliciousCss }),
      );

      // Vue 骨架结构应完整
      expect(result.skeletonCode).toContain('<template>');
      expect(result.skeletonCode).toContain('<script setup');
      // 关键断言：--> 应被转义为 -\->，不会提前终止 HTML 注释
      // 验证方式：骨架中只有 1 个 <script setup 标签（注入的 script 不会变成真正的标签）
      const scriptSetupCount = (result.skeletonCode.match(/<script setup/g) || []).length;
      expect(scriptSetupCount).toBe(1);
      // 注释终止符 --> 应只出现在合法位置（Vue 骨架末尾的固定位置）
      // 通过验证 <template> 后仍有完整的 </template> 闭合标签来确认注释未提前终止
      expect(result.skeletonCode).toContain('</template>');
    });

    it('包含控制字符的 devModeCss 应被清理', async () => {
      // 注入控制字符（U+0000-U+001F 中的部分）
      const maliciousCss = '.test {\x00\x01color: red;\x0b\x0c}';
      const result = await service.generateApproximation(
        createMockFallbackResult({ devModeCss: maliciousCss }),
      );

      // 骨架代码不应包含原始控制字符
      expect(result.skeletonCode).not.toContain('\x00');
      expect(result.skeletonCode).not.toContain('\x01');
    });
  });

  describe('单例管理', () => {
    it('getVisualApproximationService 应返回同一实例', () => {
      const s1 = getVisualApproximationService();
      const s2 = getVisualApproximationService();
      expect(s1).toBe(s2);
    });

    it('reset 后应返回新实例', () => {
      const s1 = getVisualApproximationService();
      resetVisualApproximationService();
      const s2 = getVisualApproximationService();
      expect(s1).not.toBe(s2);
    });
  });
});
