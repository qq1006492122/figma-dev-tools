/**
 * 本地加密缓存服务
 *
 * 提供文件/节点/元数据的本地加密缓存，减少 Figma API 请求：
 * - AES-256-GCM 加密存储
 * - TTL 过期机制
 * - LRU 淘汰策略（最大 100MB）
 * - 缓存命中统计
 *
 * 缓存位置：~/.config/figma-dev-tools/cache/
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

// ============ 类型定义 ============

/**
 * 缓存条目
 */
interface CacheEntry<T = unknown> {
  /** 缓存键 */
  key: string;
  /** 缓存数据 */
  data: T;
  /** 创建时间戳 */
  createdAt: number;
  /** 过期时间戳（0 表示永不过期） */
  expiresAt: number;
  /** 最后访问时间戳 */
  lastAccessedAt: number;
  /** 访问次数 */
  accessCount: number;
  /** 数据大小（字节） */
  size: number;
}

/**
 * 缓存统计
 */
export interface CacheStats {
  /** 总缓存条目数 */
  totalEntries: number;
  /** 总缓存大小（字节） */
  totalSize: number;
  /** 命中次数 */
  hits: number;
  /** 未命中次数 */
  misses: number;
  /** 命中率 */
  hitRate: number;
  /** 被驱逐的条目数 */
  evictions: number;
}

/**
 * 陈旧缓存读取结果
 */
export interface StaleCacheResult<T> {
  /** 缓存数据 */
  data: T;
  /** 数据创建时间 */
  createdAt: number;
  /** 原始过期时间 */
  expiresAt: number;
  /** 数据已存在时长（毫秒） */
  ageMs: number;
}

/**
 * 缓存配置
 */
export interface CacheConfig {
  /** 缓存目录 */
  cacheDir?: string;
  /** 最大缓存大小（字节），默认 100MB */
  maxSize?: number;
  /** 默认 TTL（毫秒），默认 1 小时 */
  defaultTTL?: number;
  /** 是否启用加密，默认 true */
  encryption?: boolean;
}

// ============ 常量定义 ============

/** 缓存目录名 */
const CACHE_DIR_NAME = 'cache';

/** 索引文件名 */
const INDEX_FILE_NAME = 'index.json';

/** 最大缓存大小：100MB */
const DEFAULT_MAX_SIZE = 100 * 1024 * 1024;

/** 默认 TTL：1 小时 */
const DEFAULT_TTL = 60 * 60 * 1000;

/** 陈旧缓存最大保留时间：7 天。过期数据在该窗口内可作为 401/403/网络异常时的兜底数据。 */
const STALE_CACHE_GRACE = 7 * 24 * 60 * 60 * 1000;

/** 加密算法 */
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

/** 密钥派生盐值 */
const KEY_DERIVATION_SALT = 'figma-dev-tools-cache-v1-salt';

/** PBKDF2 迭代次数 */
const PBKDF2_ITERATIONS = 100000;

/** 密钥长度 */
const KEY_LENGTH = 32;

/** GCM IV 长度 */
const IV_LENGTH = 12;

/** GCM 认证标签长度 */
const AUTH_TAG_LENGTH = 16;

// ============ 加密工具 ============

/**
 * 派生加密密钥（基于机器信息）
 */
function deriveCacheKey(): Buffer {
  const machineInfo = `${os.hostname()}:${os.userInfo().username}:cache-v1`;
  return crypto.pbkdf2Sync(machineInfo, KEY_DERIVATION_SALT, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

/**
 * 加密数据
 */
function encryptData(plaintext: string): string {
  const key = deriveCacheKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':');
}

/**
 * 解密数据
 */
function decryptData(encryptedData: string): string | null {
  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) return null;

    const iv = Buffer.from(parts[0]!, 'base64');
    const authTag = Buffer.from(parts[1]!, 'base64');
    const encrypted = Buffer.from(parts[2]!, 'base64');

    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) return null;

    const key = deriveCacheKey();
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

/**
 * 生成缓存文件名（基于 key 的 hash）
 */
function getCacheFileName(key: string): string {
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  return `${hash}.cache`;
}

// ============ 缓存实现 ============

/**
 * 本地缓存服务类
 */
export class FigmaCache {
  private readonly _cacheDir: string;
  private readonly _maxSize: number;
  private readonly _defaultTTL: number;
  private readonly _encryption: boolean;
  private _index: Map<string, CacheEntry>;
  private _stats: CacheStats;
  private _initialized: boolean;

  constructor(config: CacheConfig = {}) {
    this._cacheDir = config.cacheDir || path.join(os.homedir(), '.config', 'figma-dev-tools', CACHE_DIR_NAME);
    this._maxSize = config.maxSize ?? DEFAULT_MAX_SIZE;
    this._defaultTTL = config.defaultTTL ?? DEFAULT_TTL;
    this._encryption = config.encryption ?? true;
    this._index = new Map();
    this._stats = {
      totalEntries: 0,
      totalSize: 0,
      hits: 0,
      misses: 0,
      hitRate: 0,
      evictions: 0,
    };
    this._initialized = false;
  }

  /**
   * 获取缓存目录路径
   */
  private _getEntryPath(key: string): string {
    return path.join(this._cacheDir, getCacheFileName(key));
  }

  /**
   * 获取索引文件路径
   */
  private _getIndexPath(): string {
    return path.join(this._cacheDir, INDEX_FILE_NAME);
  }

  /**
   * 初始化缓存目录
   */
  private async _ensureInit(): Promise<void> {
    if (this._initialized) return;

    await fs.mkdir(this._cacheDir, { recursive: true });
    await this._loadIndex();
    this._initialized = true;
  }

  /**
   * 加载索引文件
   */
  private async _loadIndex(): Promise<void> {
    try {
      const indexPath = this._getIndexPath();
      const content = await fs.readFile(indexPath, 'utf8');
      const decrypted = this._encryption ? decryptData(content) : content;

      if (decrypted) {
        const data = JSON.parse(decrypted) as {
          entries: Array<[string, CacheEntry]>;
          stats: CacheStats;
        };
        this._index = new Map(data.entries);
        this._stats = data.stats;
      }
    } catch {
      // 索引文件不存在或损坏，重新初始化
      this._index = new Map();
      this._stats = {
        totalEntries: 0,
        totalSize: 0,
        hits: 0,
        misses: 0,
        hitRate: 0,
        evictions: 0,
      };
    }

    // 清理过期条目
    await this._cleanupExpired();
  }

  /**
   * 保存索引文件
   */
  private async _saveIndex(): Promise<void> {
    const data = {
      entries: Array.from(this._index.entries()),
      stats: this._stats,
    };
    const json = JSON.stringify(data);
    const content = this._encryption ? encryptData(json) : json;
    await fs.writeFile(this._getIndexPath(), content, 'utf8');
  }

  /**
   * 清理过期条目
   */
  private async _cleanupExpired(): Promise<void> {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this._index.entries()) {
      if (entry.expiresAt > 0 && entry.expiresAt < now - STALE_CACHE_GRACE) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      await this._deleteEntry(key);
    }
  }

  /**
   * LRU 淘汰：当缓存超过最大大小时，删除最久未使用的条目
   */
  private async _evictIfNeeded(newEntrySize: number): Promise<void> {
    while (this._stats.totalSize + newEntrySize > this._maxSize && this._index.size > 0) {
      // 找到最久未访问的条目
      let oldestKey: string | null = null;
      let oldestTime = Infinity;

      for (const [key, entry] of this._index.entries()) {
        if (entry.lastAccessedAt < oldestTime) {
          oldestTime = entry.lastAccessedAt;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        await this._deleteEntry(oldestKey);
        this._stats.evictions++;
      } else {
        break;
      }
    }
  }

  /**
   * 删除单个缓存条目（内部方法，不更新索引持久化）
   */
  private async _deleteEntry(key: string): Promise<void> {
    const entry = this._index.get(key);
    if (!entry) return;

    // 删除文件
    try {
      await fs.unlink(this._getEntryPath(key));
    } catch {
      // 文件不存在，忽略
    }

    // 更新统计
    this._stats.totalSize -= entry.size;
    this._stats.totalEntries--;

    // 从索引移除
    this._index.delete(key);
  }

  /**
   * 更新命中率统计
   */
  private _updateHitRate(): void {
    const total = this._stats.hits + this._stats.misses;
    this._stats.hitRate = total > 0 ? this._stats.hits / total : 0;
  }

  /**
   * 读取缓存文件中的真实数据，并更新 LRU 访问时间。
   *
   * 索引中只保存元数据，真实数据始终以文件内容为准，避免索引损坏导致脏数据返回。
   */
  private async _readEntryData<T>(key: string, entry: CacheEntry<T>): Promise<T | null> {
    try {
      const fileContent = await fs.readFile(this._getEntryPath(key), 'utf8');
      const decrypted = this._encryption ? decryptData(fileContent) : fileContent;

      if (!decrypted) {
        await this._deleteEntry(key);
        return null;
      }

      const data = JSON.parse(decrypted) as T;
      entry.lastAccessedAt = Date.now();
      entry.accessCount++;
      this._index.set(key, entry as CacheEntry);
      await this._saveIndex();
      return data;
    } catch {
      await this._deleteEntry(key);
      return null;
    }
  }

  // ============ 公共 API ============

  /**
   * 设置缓存
   *
   * @param key - 缓存键
   * @param data - 要缓存的数据
   * @param ttl - 过期时间（毫秒），不传使用默认 TTL，0 表示永不过期
   */
  async set<T>(key: string, data: T, ttl?: number): Promise<void> {
    await this._ensureInit();

    const effectiveTTL = ttl ?? this._defaultTTL;
    const serialized = JSON.stringify(data);
    const size = Buffer.byteLength(serialized, 'utf8');

    // 如果已有同 key 条目，先删除旧的
    const existing = this._index.get(key);
    if (existing) {
      this._stats.totalSize -= existing.size;
      this._stats.totalEntries--;
    }

    // LRU 淘汰
    await this._evictIfNeeded(size);

    // 写入缓存文件
    const content = this._encryption ? encryptData(serialized) : serialized;
    await fs.writeFile(this._getEntryPath(key), content, 'utf8');

    // 更新索引
    const now = Date.now();
    const entry: CacheEntry<T> = {
      key,
      data,
      createdAt: now,
      expiresAt: effectiveTTL === 0 ? 0 : now + effectiveTTL,
      lastAccessedAt: now,
      accessCount: 0,
      size,
    };
    this._index.set(key, entry as CacheEntry);

    this._stats.totalSize += size;
    this._stats.totalEntries++;

    await this._saveIndex();
  }

  /**
   * 获取缓存
   *
   * @param key - 缓存键
   * @returns 缓存数据，不存在或已过期返回 null
   */
  async get<T>(key: string): Promise<T | null> {
    await this._ensureInit();

    const entry = this._index.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      this._stats.misses++;
      this._updateHitRate();
      return null;
    }

    // 检查是否过期。过期条目不立即删除，保留一段时间用于鉴权失败或网络异常时降级。
    if (entry.expiresAt > 0 && entry.expiresAt < Date.now()) {
      this._stats.misses++;
      this._updateHitRate();
      return null;
    }

    const data = await this._readEntryData(key, entry);
    if (data === null) {
      this._stats.misses++;
      this._updateHitRate();
      await this._saveIndex();
      return null;
    }

    this._stats.hits++;
    this._updateHitRate();
    return data;
  }

  /**
   * 获取陈旧缓存。
   *
   * 用于 Token 失效、付费权限受限或网络异常时的降级场景。读取结果必须显式提示用户数据可能不是最新。
   */
  async getStale<T>(key: string, maxAgeMs: number = STALE_CACHE_GRACE): Promise<StaleCacheResult<T> | null> {
    await this._ensureInit();

    const entry = this._index.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;

    const ageMs = Date.now() - entry.createdAt;
    if (ageMs > maxAgeMs) {
      await this._deleteEntry(key);
      await this._saveIndex();
      return null;
    }

    const data = await this._readEntryData(key, entry);
    if (data === null) return null;

    return {
      data,
      createdAt: entry.createdAt,
      expiresAt: entry.expiresAt,
      ageMs,
    };
  }

  /**
   * 检查缓存键是否存在且未过期
   */
  async has(key: string): Promise<boolean> {
    await this._ensureInit();

    const entry = this._index.get(key);
    if (!entry) return false;
    if (entry.expiresAt > 0 && entry.expiresAt < Date.now()) {
      return false;
    }
    return true;
  }

  /**
   * 删除缓存
   */
  async delete(key: string): Promise<boolean> {
    await this._ensureInit();

    if (!this._index.has(key)) return false;
    await this._deleteEntry(key);
    await this._saveIndex();
    return true;
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    await this._ensureInit();

    // 删除所有缓存文件
    const keys = Array.from(this._index.keys());
    for (const key of keys) {
      await this._deleteEntry(key);
    }

    // 重置统计
    this._stats = {
      totalEntries: 0,
      totalSize: 0,
      hits: 0,
      misses: 0,
      hitRate: 0,
      evictions: 0,
    };

    await this._saveIndex();
  }

  /**
   * 获取缓存统计信息
   */
  async getStats(): Promise<CacheStats> {
    await this._ensureInit();
    return { ...this._stats };
  }

  /**
   * 生成 Figma API 请求的缓存键
   */
  static generateApiCacheKey(method: string, ...parts: string[]): string {
    const keyParts = [method, ...parts].filter(Boolean).join(':');
    return `api:${keyParts}`;
  }

  /**
   * 生成文件缓存键
   */
  static generateFileCacheKey(fileKey: string, version?: string, depth?: number): string {
    return FigmaCache.generateApiCacheKey('file', fileKey, version ?? 'latest', String(depth ?? -1));
  }

  /**
   * 生成节点缓存键
   */
  static generateNodeCacheKey(fileKey: string, nodeId: string, depth?: number): string {
    return FigmaCache.generateApiCacheKey('node', fileKey, nodeId, String(depth ?? -1));
  }

  /**
   * 生成图片缓存键
   */
  static generateImageCacheKey(fileKey: string, nodeIds: string[], format: string, scale: number): string {
    return FigmaCache.generateApiCacheKey('image', fileKey, nodeIds.sort().join(','), format, String(scale));
  }
}

// ============ 单例管理 ============

let cacheInstance: FigmaCache | null = null;
let cacheConfigKey: string | null = null;

/**
 * 获取缓存服务单例。
 *
 * 单例行为：首次调用时创建实例；后续若传入不同配置（如 cacheDir 变化），
 * 会重建实例以确保配置生效。
 */
export function createFigmaCache(config?: CacheConfig): FigmaCache {
  const newKey = config ? JSON.stringify(config) : '';
  if (!cacheInstance || cacheConfigKey !== newKey) {
    cacheInstance = new FigmaCache(config);
    cacheConfigKey = newKey;
  }
  return cacheInstance;
}
