/**
 * 截图缓存 - Screenshot Cache
 *
 * v1.4.4 性能优化：基于 figmaUrl + nodeId + dpr 缓存截图结果，
 * 避免对同一设计稿节点的重复截图。
 *
 * 缓存策略：
 * - 缓存键：fileKey + nodeId + dpr 的哈希
 * - 缓存值：截图文件路径 + 元数据
 * - 过期机制：基于 TTL（默认 1 小时）
 * - 存储方式：内存索引 + 文件系统（截图文件持久化到磁盘）
 *
 * 一致性说明：
 * - Figma 设计稿可能被修改，缓存可能过期
 * - 提供 invalidate() 方法手动失效
 * - TTL 过期后自动失效
 *
 * @module
 */

// ============ 依赖导入 ============

import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// ============ 类型定义 ============

/**
 * 截图缓存条目
 */
export interface ScreenshotCacheEntry {
  /** 缓存键（哈希值） */
  key: string;
  /** 截图文件路径 */
  screenshotPath: string;
  /** 截图宽度 */
  width: number;
  /** 截图高度 */
  height: number;
  /** 使用的 devicePixelRatio */
  devicePixelRatio: number;
  /** Dev Mode CSS（如抓取成功） */
  devModeCss?: string;
  /** 探测到的操作系统 */
  os: 'windows' | 'macos' | 'linux' | 'unknown';
  /** 是否成功定位到 node-id */
  nodeFocused: boolean;
  /** 缓存时间戳 */
  cachedAt: number;
  /** 警告信息 */
  warnings: string[];
}

/**
 * 截图缓存配置
 */
export interface ScreenshotCacheOptions {
  /** 缓存目录，默认与 outputDir 相同 */
  cacheDir: string;
  /** 缓存有效期（毫秒），默认 3600000（1 小时） */
  ttl: number;
  /** 最大缓存条目数，默认 50（LRU 淘汰） */
  maxEntries: number;
}

// ============ ScreenshotCache 类 ============

/**
 * 截图缓存
 *
 * 内存索引 + 文件系统存储。
 * LRU 淘汰策略：超过 maxEntries 时删除最久未访问的条目。
 */
export class ScreenshotCache {
  /** 配置选项 */
  private readonly _options: ScreenshotCacheOptions;
  /** 内存索引：key -> entry */
  private readonly _index: Map<string, ScreenshotCacheEntry> = new Map();
  /** LRU 访问顺序：最近访问的 key 在末尾 */
  private readonly _accessOrder: string[] = [];

  /**
   * 构造函数
   *
   * @param options - 配置选项
   */
  constructor(options: Partial<ScreenshotCacheOptions> = {}) {
    this._options = {
      cacheDir: options.cacheDir ?? '',
      ttl: options.ttl ?? 3600000,
      maxEntries: options.maxEntries ?? 50,
    };
  }

  /**
   * 生成缓存键
   *
   * 基于 fileKey + nodeId + dpr 的哈希，确保唯一性。
   *
   * @param fileKey - Figma 文件 key
   * @param nodeId - 节点 ID（可选）
   * @param dpr - devicePixelRatio
   * @returns 缓存键（16 位哈希）
   */
  static generateKey(
    fileKey: string,
    nodeId: string | undefined,
    dpr: number,
  ): string {
    const raw = `${fileKey}|${nodeId ?? ''}|${dpr}`;
    return crypto.createHash('md5').update(raw).digest('hex').substring(0, 16);
  }

  /**
   * 获取缓存的截图
   *
   * @param key - 缓存键
   * @returns 缓存条目（如存在且未过期），否则 undefined
   */
  async get(key: string): Promise<ScreenshotCacheEntry | undefined> {
    const entry = this._index.get(key);
    if (!entry) return undefined;

    // 检查是否过期
    if (Date.now() - entry.cachedAt > this._options.ttl) {
      await this.delete(key);
      return undefined;
    }

    // 检查截图文件是否仍存在
    try {
      await fs.access(entry.screenshotPath);
    } catch {
      // 文件已被外部删除，清理索引
      await this.delete(key);
      return undefined;
    }

    // 更新访问顺序（LRU）
    this._touchAccessOrder(key);
    return entry;
  }

  /**
   * 写入缓存
   *
   * @param entry - 缓存条目
   */
  async set(entry: ScreenshotCacheEntry): Promise<void> {
    // 检查是否超过最大条目数，执行 LRU 淘汰
    while (this._index.size >= this._options.maxEntries) {
      const oldestKey = this._accessOrder.shift();
      if (oldestKey) {
        await this.delete(oldestKey);
      } else {
        break;
      }
    }

    this._index.set(entry.key, entry);
    this._touchAccessOrder(entry.key);
  }

  /**
   * 删除缓存条目
   *
   * @param key - 缓存键
   */
  async delete(key: string): Promise<void> {
    const entry = this._index.get(key);
    if (!entry) return;

    this._index.delete(key);
    const idx = this._accessOrder.indexOf(key);
    if (idx >= 0) {
      this._accessOrder.splice(idx, 1);
    }

    // 尝试删除截图文件（失败忽略，可能已被清理）
    try {
      await fs.unlink(entry.screenshotPath);
    } catch {
      // 文件可能已被删除，忽略
    }
  }

  /**
   * 按 fileKey 失效缓存
   *
   * 用于设计稿被修改后手动失效相关缓存。
   *
   * @param fileKey - Figma 文件 key
   */
  async invalidateByFileKey(fileKey: string): Promise<void> {
    // 遍历所有条目，删除 fileKey 匹配的（通过重新生成 key 前缀判断）
    // 由于 key 是哈希，无法直接匹配 fileKey，需要遍历所有条目检查路径
    const keysToDelete: string[] = [];
    for (const [key, entry] of this._index) {
      // 通过截图文件名中的 fileKey 判断（figma-fallback-{fileKey}-{timestamp}.png）
      if (path.basename(entry.screenshotPath).includes(fileKey)) {
        keysToDelete.push(key);
      }
    }
    await Promise.all(keysToDelete.map((k) => this.delete(k)));
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    const keys = Array.from(this._index.keys());
    await Promise.all(keys.map((k) => this.delete(k)));
    this._accessOrder.length = 0;
  }

  /**
   * 清理过期缓存
   *
   * 供定期调用，清理已过期的条目。
   */
  async sweepExpired(): Promise<void> {
    const now = Date.now();
    const keysToDelete: string[] = [];
    for (const [key, entry] of this._index) {
      if (now - entry.cachedAt > this._options.ttl) {
        keysToDelete.push(key);
      }
    }
    await Promise.all(keysToDelete.map((k) => this.delete(k)));
  }

  /**
   * 更新访问顺序（LRU）
   *
   * @param key - 缓存键
   */
  private _touchAccessOrder(key: string): void {
    const idx = this._accessOrder.indexOf(key);
    if (idx >= 0) {
      this._accessOrder.splice(idx, 1);
    }
    this._accessOrder.push(key);
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): ScreenshotCacheStats {
    return {
      entryCount: this._index.size,
      maxEntries: this._options.maxEntries,
      ttl: this._options.ttl,
    };
  }
}

/**
 * 截图缓存统计信息
 */
export interface ScreenshotCacheStats {
  /** 当前条目数 */
  entryCount: number;
  /** 最大条目数 */
  maxEntries: number;
  /** TTL（毫秒） */
  ttl: number;
}

// ============ 单例管理 ============

let screenshotCacheInstance: ScreenshotCache | null = null;

/**
 * 获取 ScreenshotCache 单例
 *
 * @param options - 首次创建时的配置选项
 * @returns ScreenshotCache 实例
 */
export function getScreenshotCache(
  options?: Partial<ScreenshotCacheOptions>,
): ScreenshotCache {
  if (!screenshotCacheInstance) {
    screenshotCacheInstance = new ScreenshotCache(options);
  }
  return screenshotCacheInstance;
}

/**
 * 重置 ScreenshotCache 单例（主要用于测试）
 */
export function resetScreenshotCache(): void {
  screenshotCacheInstance = null;
}
