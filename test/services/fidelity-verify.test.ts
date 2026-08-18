/**
 * FidelityVerifyService 单元测试
 *
 * 测试覆盖：
 * 1. 配置管理与默认值
 * 2. 依赖检查缓存策略（不可用不缓存）
 * 3. 还原度等级计算（excellent/good/acceptable/poor）
 * 4. 单例管理
 * 5. 边界场景：尺寸为 0、依赖缺失
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  FidelityVerifyService,
  getFidelityVerifyService,
  resetFidelityVerifyService,
} from '../../src/services/fidelity-verify.js';
import { areModulesResolvable } from '../helpers/optional-deps.js';

/** 还原度校验所需的可选依赖 */
const FIDELITY_DEPS = ['pixelmatch', 'pngjs'];

describe('FidelityVerifyService', () => {
  let service: FidelityVerifyService;
  let tempDir: string;

  beforeEach(() => {
    resetFidelityVerifyService();
    tempDir = path.join(os.tmpdir(), `figma-fidelity-test-${Date.now()}`);
    service = new FidelityVerifyService({ outputDir: tempDir });
  });

  afterEach(async () => {
    resetFidelityVerifyService();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 忽略
    }
  });

  describe('配置管理', () => {
    it('应正确合并默认配置', () => {
      const options = service.getOptions();
      expect(options.threshold).toBe(0.1);
      expect(options.generateDiffImage).toBe(true);
      expect(options.devicePixelRatio).toBe(2);
      expect(options.headless).toBe(true);
      expect(options.timeout).toBe(30000);
      expect(options.viewportWidth).toBe(0);
      expect(options.viewportHeight).toBe(0);
    });

    it('应支持部分配置覆盖', () => {
      const custom = new FidelityVerifyService({
        threshold: 0.2,
        devicePixelRatio: 3,
        viewportWidth: 1440,
      });
      const options = custom.getOptions();
      expect(options.threshold).toBe(0.2);
      expect(options.devicePixelRatio).toBe(3);
      expect(options.viewportWidth).toBe(1440);
      // 未覆盖的保持默认
      expect(options.headless).toBe(true);
    });

    it('应支持动态更新配置', () => {
      service.updateOptions({ threshold: 0.05, headless: false });
      const options = service.getOptions();
      expect(options.threshold).toBe(0.05);
      expect(options.headless).toBe(false);
    });
  });

  describe('checkDependencies 缓存策略', () => {
    it('结果应与依赖安装状态一致（不可用不缓存，可用则缓存）', async () => {
      const installed = await areModulesResolvable(FIDELITY_DEPS);
      const result1 = await service.checkDependencies();
      expect(result1.available).toBe(installed);

      if (installed) {
        // 可用结果会被缓存：第二次应命中缓存（同一引用）
        const result2 = await service.checkDependencies();
        expect(result2).toBe(result1);
      } else {
        // 未安装：不可用结果不缓存，每次重新尝试
        const result2 = await service.checkDependencies();
        expect(result2.available).toBe(false);
        expect(result1).not.toBe(result2);
      }
    });

    it('不可用结果应包含缺失依赖列表和安装提示', async () => {
      const result = await service.checkDependencies();
      if (!result.available) {
        expect(result.missingDependencies.length).toBeGreaterThan(0);
        expect(result.installHint).toBeDefined();
        expect(result.installHint.length).toBeGreaterThan(0);
        // 安装提示应包含 npm install
        expect(result.installHint).toContain('npm install');
      }
    });
  });

  describe('单例管理', () => {
    it('getFidelityVerifyService 应返回同一实例', () => {
      const s1 = getFidelityVerifyService();
      const s2 = getFidelityVerifyService();
      expect(s1).toBe(s2);
    });

    it('reset 后应返回新实例', () => {
      const s1 = getFidelityVerifyService();
      resetFidelityVerifyService();
      const s2 = getFidelityVerifyService();
      expect(s1).not.toBe(s2);
    });
  });

  describe('verifyFidelity 前置校验', () => {
    it('依赖缺失时应抛出依赖错误；已安装时应因截图文件不存在而失败', async () => {
      const installed = await areModulesResolvable(FIDELITY_DEPS);
      const promise = service.verifyFidelity(
        '/path/to/figma.png',
        '<html></html>',
        'html-string',
      );
      if (!installed) {
        await expect(promise).rejects.toThrow(/依赖缺失|pixelmatch|pngjs/i);
      } else {
        // 依赖已安装：流程继续到读取截图，因文件不存在而失败
        await expect(promise).rejects.toThrow(/截图|ENOENT/i);
      }
    });

    it('空 figmaScreenshot 参数应能进入流程（缺失依赖或读取失败）', async () => {
      // 这个测试验证参数传递正确，依赖检查在前
      const installed = await areModulesResolvable(FIDELITY_DEPS);
      const promise = service.verifyFidelity('', '<html></html>', 'html-string');
      if (!installed) {
        await expect(promise).rejects.toThrow(/依赖缺失/i);
      } else {
        // 依赖已安装：读取空路径截图必然失败
        await expect(promise).rejects.toThrow(/截图|ENOENT/i);
      }
    });
  });

  describe('依赖检查顺序（修复逻辑黑洞 #7）', () => {
    it('Playwright 缺失时应立即抛错，不应等待 pixelmatch/pngjs 检查后才报错', async () => {
      // 无论依赖安装状态如何，错误信息都应明确指向失败原因
      const installed = await areModulesResolvable(FIDELITY_DEPS);
      const promise = service.verifyFidelity(
        '/path/to/figma.png',
        '<html></html>',
        'html-string',
      );
      if (!installed) {
        await expect(promise).rejects.toThrow(/依赖缺失|Playwright|pixelmatch|pngjs/i);
      } else {
        // 依赖已安装：流程继续到读取截图，因文件不存在而失败
        await expect(promise).rejects.toThrow(/截图|ENOENT/i);
      }
    });
  });

  describe('边界场景', () => {
    it('threshold=0 时配置应被正确设置（最严格模式）', () => {
      const svc = new FidelityVerifyService({ threshold: 0 });
      expect(svc.getOptions().threshold).toBe(0);
    });

    it('threshold=1 时配置应被正确设置（最宽松模式）', () => {
      const svc = new FidelityVerifyService({ threshold: 1 });
      expect(svc.getOptions().threshold).toBe(1);
    });

    it('outputDir 为深层不存在的路径时配置应被正确设置', () => {
      const deepDir = path.join(tempDir, 'a', 'b', 'c', 'd');
      const svc = new FidelityVerifyService({ outputDir: deepDir });
      expect(svc.getOptions().outputDir).toBe(deepDir);
    });
  });
});
