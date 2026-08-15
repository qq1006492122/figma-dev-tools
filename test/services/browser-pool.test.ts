/**
 * BrowserPool 浏览器实例池测试
 *
 * 覆盖：
 * - 配置管理
 * - 单例获取
 * - 健康检查
 * - 统计信息
 * - 预热机制
 */

import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  BrowserPool,
  getBrowserPool,
  resetBrowserPool,
  resetBrowserPoolSync,
} from '../../src/services/browser-pool.js';
import { ScreenshotCache } from '../../src/services/screenshot-cache.js';

describe('BrowserPool', () => {
  let pool: BrowserPool;
  let tempDir: string;

  beforeEach(() => {
    resetBrowserPoolSync();
    pool = new BrowserPool({
      browser: 'chromium',
      headless: true,
      idleTimeout: 1000, // 测试用短超时
      maxInstances: 1,
    });
    tempDir = path.join(os.tmpdir(), `figma-pool-test-${Date.now()}`);
  });

  afterEach(async () => {
    await pool.closeAll();
  });

  describe('配置管理', () => {
    it('应正确合并默认配置', () => {
      const p = new BrowserPool();
      const options = p.getOptions();
      expect(options.browser).toBe('chromium');
      expect(options.headless).toBe(true);
      expect(options.idleTimeout).toBe(60000);
      expect(options.maxInstances).toBe(1);
    });

    it('应支持部分配置覆盖', () => {
      const p = new BrowserPool({ idleTimeout: 30000 });
      expect(p.getOptions().idleTimeout).toBe(30000);
      expect(p.getOptions().browser).toBe('chromium'); // 默认值
    });

    it('应支持动态更新配置', () => {
      pool.updateOptions({ idleTimeout: 5000 });
      expect(pool.getOptions().idleTimeout).toBe(5000);
    });
  });

  describe('可用性检查', () => {
    it('Playwright 未安装时 isAvailable 应返回 false（不缓存）', async () => {
      const result = await pool.isAvailable();
      expect(result).toBe(false);
    });

    it('不可用结果不应被缓存（允许重试）', async () => {
      const result1 = await pool.isAvailable();
      const result2 = await pool.isAvailable();
      expect(result1).toBe(false);
      expect(result2).toBe(false);
    });
  });

  describe('acquire 前置校验', () => {
    it('Playwright 未安装时 acquire 应抛出明确错误', async () => {
      await expect(pool.acquire()).rejects.toThrow(/Playwright|未安装/i);
    });
  });

  describe('统计信息', () => {
    it('getStats 应返回正确的初始状态', () => {
      const stats = pool.getStats();
      expect(stats.totalInstances).toBe(0);
      expect(stats.activeInstances).toBe(0);
      expect(stats.idleInstances).toBe(0);
      expect(stats.totalUseCount).toBe(0);
      expect(stats.cacheHitRate).toBe(0);
    });
  });

  describe('单例管理', () => {
    it('getBrowserPool 应返回同一实例', () => {
      const p1 = getBrowserPool();
      const p2 = getBrowserPool();
      expect(p1).toBe(p2);
    });

    it('resetBrowserPool 后应返回新实例', async () => {
      const p1 = getBrowserPool();
      await resetBrowserPool();
      const p2 = getBrowserPool();
      expect(p1).not.toBe(p2);
    });
  });

  describe('预热机制', () => {
    it('Playwright 未安装时 warmup 应返回 false', async () => {
      const result = await pool.warmup();
      expect(result).toBe(false);
    });
  });

  describe('空闲回收', () => {
    it('sweepIdle 应能正常执行（无实例时不报错）', async () => {
      await expect(pool.sweepIdle()).resolves.toBeUndefined();
    });
  });

  describe('closeAll', () => {
    it('closeAll 应能正常执行（无实例时不报错）', async () => {
      await expect(pool.closeAll()).resolves.toBeUndefined();
    });
  });
});

describe('ScreenshotCache', () => {
  let cache: ScreenshotCache;

  beforeEach(() => {
    cache = new ScreenshotCache({ ttl: 1000, maxEntries: 3 });
  });

  describe('缓存键生成', () => {
    it('相同参数应生成相同键', () => {
      const key1 = ScreenshotCache.generateKey('file1', 'node1', 2);
      const key2 = ScreenshotCache.generateKey('file1', 'node1', 2);
      expect(key1).toBe(key2);
    });

    it('不同参数应生成不同键', () => {
      const key1 = ScreenshotCache.generateKey('file1', 'node1', 2);
      const key2 = ScreenshotCache.generateKey('file2', 'node1', 2);
      const key3 = ScreenshotCache.generateKey('file1', 'node2', 2);
      const key4 = ScreenshotCache.generateKey('file1', 'node1', 3);
      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
      expect(key1).not.toBe(key4);
    });

    it('nodeId 为 undefined 和空字符串应生成相同键（都表示无节点）', () => {
      // undefined ?? '' === ''，两者语义相同（都表示无 nodeId），应生成相同键
      const key1 = ScreenshotCache.generateKey('file1', undefined, 2);
      const key2 = ScreenshotCache.generateKey('file1', '', 2);
      expect(key1).toBe(key2);
    });
  });

  describe('缓存读写', () => {
    it('写入后应能读取', async () => {
      const key = ScreenshotCache.generateKey('file1', 'node1', 2);
      // 创建临时文件作为截图路径
      const fs = await import('node:fs/promises');
      const screenshotPath = path.join(os.tmpdir(), `test-screenshot-${Date.now()}.png`);
      await fs.writeFile(screenshotPath, Buffer.alloc(0));

      await cache.set({
        key,
        screenshotPath,
        width: 1920,
        height: 1080,
        devicePixelRatio: 2,
        os: 'windows',
        nodeFocused: true,
        cachedAt: Date.now(),
        warnings: [],
      });

      const result = await cache.get(key);
      expect(result).toBeDefined();
      expect(result?.width).toBe(1920);
      expect(result?.height).toBe(1080);

      // 清理
      await fs.unlink(screenshotPath).catch(() => {});
    });

    it('过期后应返回 undefined', async () => {
      const key = ScreenshotCache.generateKey('file1', 'node1', 2);
      const fs = await import('node:fs/promises');
      const screenshotPath = path.join(os.tmpdir(), `test-screenshot-${Date.now()}.png`);
      await fs.writeFile(screenshotPath, Buffer.alloc(0));

      await cache.set({
        key,
        screenshotPath,
        width: 1920,
        height: 1080,
        devicePixelRatio: 2,
        os: 'windows',
        nodeFocused: true,
        cachedAt: Date.now() - 2000, // 2 秒前，已超过 TTL（1 秒）
        warnings: [],
      });

      const result = await cache.get(key);
      expect(result).toBeUndefined();

      // 清理
      await fs.unlink(screenshotPath).catch(() => {});
    });

    it('截图文件被外部删除后应返回 undefined', async () => {
      const key = ScreenshotCache.generateKey('file1', 'node1', 2);
      const fs = await import('node:fs/promises');
      const screenshotPath = path.join(os.tmpdir(), `test-screenshot-${Date.now()}.png`);
      await fs.writeFile(screenshotPath, Buffer.alloc(0));

      await cache.set({
        key,
        screenshotPath,
        width: 1920,
        height: 1080,
        devicePixelRatio: 2,
        os: 'windows',
        nodeFocused: true,
        cachedAt: Date.now(),
        warnings: [],
      });

      // 删除文件
      await fs.unlink(screenshotPath);

      const result = await cache.get(key);
      expect(result).toBeUndefined();
    });
  });

  describe('LRU 淘汰', () => {
    it('超过 maxEntries 时应淘汰最久未访问的条目', async () => {
      const fs = await import('node:fs/promises');
      const paths: string[] = [];

      // 写入 3 个条目（maxEntries=3）
      for (let i = 0; i < 3; i++) {
        const key = ScreenshotCache.generateKey(`file${i}`, 'node1', 2);
        const screenshotPath = path.join(os.tmpdir(), `test-screenshot-${Date.now()}-${i}.png`);
        await fs.writeFile(screenshotPath, Buffer.alloc(0));
        paths.push(screenshotPath);

        await cache.set({
          key,
          screenshotPath,
          width: 1920,
          height: 1080,
          devicePixelRatio: 2,
          os: 'windows',
          nodeFocused: true,
          cachedAt: Date.now(),
          warnings: [],
        });
      }

      expect(cache.getStats().entryCount).toBe(3);

      // 写入第 4 个，应淘汰第 1 个（最久未访问）
      const key4 = ScreenshotCache.generateKey('file3', 'node1', 2);
      const screenshotPath4 = path.join(os.tmpdir(), `test-screenshot-${Date.now()}-4.png`);
      await fs.writeFile(screenshotPath4, Buffer.alloc(0));
      paths.push(screenshotPath4);

      await cache.set({
        key: key4,
        screenshotPath: screenshotPath4,
        width: 1920,
        height: 1080,
        devicePixelRatio: 2,
        os: 'windows',
        nodeFocused: true,
        cachedAt: Date.now(),
        warnings: [],
      });

      expect(cache.getStats().entryCount).toBe(3);

      // 第 1 个应已被淘汰
      const key1 = ScreenshotCache.generateKey('file0', 'node1', 2);
      const result1 = await cache.get(key1);
      expect(result1).toBeUndefined();

      // 清理
      await Promise.all(paths.map((p) => fs.unlink(p).catch(() => {})));
    });
  });

  describe('统计信息', () => {
    it('getStats 应返回正确信息', () => {
      const stats = cache.getStats();
      expect(stats.entryCount).toBe(0);
      expect(stats.maxEntries).toBe(3);
      expect(stats.ttl).toBe(1000);
    });
  });

  describe('clear', () => {
    it('clear 应清空所有缓存', async () => {
      const fs = await import('node:fs/promises');
      const key = ScreenshotCache.generateKey('file1', 'node1', 2);
      const screenshotPath = path.join(os.tmpdir(), `test-screenshot-${Date.now()}.png`);
      await fs.writeFile(screenshotPath, Buffer.alloc(0));

      await cache.set({
        key,
        screenshotPath,
        width: 1920,
        height: 1080,
        devicePixelRatio: 2,
        os: 'windows',
        nodeFocused: true,
        cachedAt: Date.now(),
        warnings: [],
      });

      expect(cache.getStats().entryCount).toBe(1);

      await cache.clear();
      expect(cache.getStats().entryCount).toBe(0);
    });
  });
});
