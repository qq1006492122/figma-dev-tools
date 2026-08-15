/**
 * 冒烟测试（Smoke Test）
 *
 * 验证三个新服务的核心流程能够正常启动和基本运行，
 * 不深入边界细节，只验证「主路径不崩溃」。
 *
 * 覆盖：
 * 1. 三个服务的单例获取
 * 2. 配置默认值合理性
 * 3. 依赖检查不崩溃
 * 4. VisualApproximationService 端到端流程（最关键，不依赖外部服务）
 * 5. i18n 集成验证
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  BrowserFallbackService,
  getBrowserFallbackService,
  resetBrowserFallbackService,
} from '../src/services/browser-fallback.js';
import {
  VisualApproximationService,
  getVisualApproximationService,
  resetVisualApproximationService,
} from '../src/services/visual-approximation.js';
import {
  FidelityVerifyService,
  getFidelityVerifyService,
  resetFidelityVerifyService,
} from '../src/services/fidelity-verify.js';
import type { BrowserFallbackResult } from '../src/services/browser-fallback.js';

describe('冒烟测试：v1.4.4 新增服务', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = path.join(os.tmpdir(), `figma-smoke-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterAll(async () => {
    resetBrowserFallbackService();
    resetVisualApproximationService();
    resetFidelityVerifyService();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 忽略
    }
  });

  describe('服务实例化', () => {
    it('BrowserFallbackService 应能正确实例化', () => {
      const svc = new BrowserFallbackService({ outputDir: tempDir });
      expect(svc).toBeInstanceOf(BrowserFallbackService);
      expect(svc.getOptions().enabled).toBe(true);
    });

    it('VisualApproximationService 应能正确实例化', () => {
      const svc = new VisualApproximationService({ outputDir: tempDir });
      expect(svc).toBeInstanceOf(VisualApproximationService);
      expect(svc.getOptions().framework).toBe('react');
    });

    it('FidelityVerifyService 应能正确实例化', () => {
      const svc = new FidelityVerifyService({ outputDir: tempDir });
      expect(svc).toBeInstanceOf(FidelityVerifyService);
      expect(svc.getOptions().threshold).toBe(0.1);
    });
  });

  describe('单例获取', () => {
    it('三个服务的单例获取函数应返回有效实例', () => {
      expect(getBrowserFallbackService()).toBeDefined();
      expect(getVisualApproximationService()).toBeDefined();
      expect(getFidelityVerifyService()).toBeDefined();
    });
  });

  describe('依赖检查（不崩溃）', () => {
    it('BrowserFallbackService.checkAvailability 不应崩溃', async () => {
      const svc = new BrowserFallbackService({ outputDir: tempDir });
      const result = await svc.checkAvailability();
      expect(result).toBeDefined();
      expect(typeof result.available).toBe('boolean');
    });

    it('FidelityVerifyService.checkDependencies 不应崩溃', async () => {
      const svc = new FidelityVerifyService({ outputDir: tempDir });
      const result = await svc.checkDependencies();
      expect(result).toBeDefined();
      expect(typeof result.available).toBe('boolean');
    });
  });

  describe('VisualApproximationService 端到端流程', () => {
    it('应能从 BrowserFallbackResult 生成完整的近似模式输出', async () => {
      // 构造一个模拟的 BrowserFallbackResult
      const mockFallbackResult: BrowserFallbackResult = {
        screenshotPath: path.join(tempDir, 'mock-screenshot.png'),
        width: 1920,
        height: 1080,
        devicePixelRatio: 2,
        capturedAt: Date.now(),
        warnings: ['测试警告'],
        isApproximate: true,
        os: 'windows',
        nodeFocused: true,
      };

      // 创建模拟截图文件（空文件即可，测试不读取内容）
      await fs.writeFile(mockFallbackResult.screenshotPath, Buffer.alloc(0));

      const svc = new VisualApproximationService({ outputDir: tempDir });
      const result = await svc.generateApproximation(mockFallbackResult);

      // 验证核心字段
      expect(result.screenshotPath).toBe(mockFallbackResult.screenshotPath);
      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
      expect(result.devicePixelRatio).toBe(2);
      expect(result.os).toBe('windows');
      expect(result.expectedFidelity).toBe(75);
      expect(result.banner).toContain('近似模式');
      expect(result.skeletonCode).toContain('ApproximateDesign');
      expect(result.todoMarkdown).toContain('待人工校对项');

      // 验证文件已生成
      expect(result.skeletonPath).toBeDefined();
      expect(result.todoPath).toBeDefined();
    });

    it('应能正确处理带 Dev Mode CSS 的结果', async () => {
      const mockFallbackResult: BrowserFallbackResult = {
        screenshotPath: path.join(tempDir, 'mock-screenshot-2.png'),
        width: 1440,
        height: 900,
        devicePixelRatio: 2,
        devModeCss: '.test { color: red; }',
        capturedAt: Date.now(),
        warnings: [],
        isApproximate: true,
        os: 'macos',
        nodeFocused: false,
      };

      await fs.writeFile(mockFallbackResult.screenshotPath, Buffer.alloc(0));

      const svc = new VisualApproximationService({ outputDir: tempDir });
      const result = await svc.generateApproximation(mockFallbackResult);

      expect(result.devModeCss).toBe('.test { color: red; }');
      expect(result.skeletonCode).toContain('Dev Mode CSS');
      expect(result.os).toBe('macos');
    });
  });

  describe('多框架骨架生成', () => {
    it('React 骨架应能正确生成', async () => {
      const mockResult: BrowserFallbackResult = {
        screenshotPath: path.join(tempDir, 'react-test.png'),
        width: 1920,
        height: 1080,
        devicePixelRatio: 2,
        capturedAt: Date.now(),
        warnings: [],
        isApproximate: true,
        os: 'linux',
        nodeFocused: true,
      };
      await fs.writeFile(mockResult.screenshotPath, Buffer.alloc(0));

      const svc = new VisualApproximationService({ outputDir: tempDir, framework: 'react' });
      const result = await svc.generateApproximation(mockResult);
      expect(result.skeletonCode).toContain('React.FC');
      expect(result.skeletonCode).toContain('export');
    });

    it('Vue 骨架应能正确生成', async () => {
      const mockResult: BrowserFallbackResult = {
        screenshotPath: path.join(tempDir, 'vue-test.png'),
        width: 1920,
        height: 1080,
        devicePixelRatio: 2,
        capturedAt: Date.now(),
        warnings: [],
        isApproximate: true,
        os: 'windows',
        nodeFocused: true,
      };
      await fs.writeFile(mockResult.screenshotPath, Buffer.alloc(0));

      const svc = new VisualApproximationService({ outputDir: tempDir, framework: 'vue' });
      const result = await svc.generateApproximation(mockResult);
      expect(result.skeletonCode).toContain('<template>');
      expect(result.skeletonCode).toContain('<script setup');
    });

    it('HTML 骨架应能正确生成', async () => {
      const mockResult: BrowserFallbackResult = {
        screenshotPath: path.join(tempDir, 'html-test.png'),
        width: 1920,
        height: 1080,
        devicePixelRatio: 2,
        capturedAt: Date.now(),
        warnings: [],
        isApproximate: true,
        os: 'windows',
        nodeFocused: true,
      };
      await fs.writeFile(mockResult.screenshotPath, Buffer.alloc(0));

      const svc = new VisualApproximationService({ outputDir: tempDir, framework: 'html' });
      const result = await svc.generateApproximation(mockResult);
      expect(result.skeletonCode).toContain('<!DOCTYPE html>');
      expect(result.skeletonCode).toContain('<html');
    });
  });

  describe('i18n 集成验证', () => {
    it('近似模式横幅应根据当前语言输出', async () => {
      const mockResult: BrowserFallbackResult = {
        screenshotPath: path.join(tempDir, 'i18n-test.png'),
        width: 1920,
        height: 1080,
        devicePixelRatio: 2,
        capturedAt: Date.now(),
        warnings: [],
        isApproximate: true,
        os: 'windows',
        nodeFocused: true,
      };
      await fs.writeFile(mockResult.screenshotPath, Buffer.alloc(0));

      const svc = new VisualApproximationService({ outputDir: tempDir });
      const result = await svc.generateApproximation(mockResult);

      // 默认中文环境
      expect(result.banner).toBeDefined();
      expect(result.banner.length).toBeGreaterThan(0);
      // 横幅应包含还原度数字
      expect(result.banner).toMatch(/\d+.*%/);
    });
  });
});
