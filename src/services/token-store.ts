/**
 * Figma Token 安全存储服务
 *
 * 提供双后端 Token 存储：
 * 1. 优先使用系统密钥链（keytar），安全级别最高
 * 2. 自动降级到 AES-256-GCM 加密文件存储，零依赖
 *
 * 加密文件存储位置：~/.config/figma-dev-tools/credentials.enc
 * 跨平台兼容 Windows / macOS / Linux
 */

import * as crypto from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

// ============ 类型定义 ============

/**
 * 已存储的 Token 信息（含元数据）
 */
export interface StoredToken {
  /** Token 名称（用于多 Token 切换） */
  name: string;
  /** Token 值 */
  value: string;
  /** 存储时间戳 */
  createdAt: number;
  /** 最后使用时间戳 */
  lastUsedAt?: number;
  /** 备注/描述 */
  note?: string;
}

/**
 * Token 存储服务接口
 */
export interface TokenStore {
  /**
   * 保存 Token（会加密存储）
   * @param name - Token 名称（如 'default', 'work', 'personal'）
   * @param token - Figma Access Token 值
   * @param note - 可选备注
   */
  saveToken(name: string, token: string, note?: string): Promise<void>;

  /**
   * 获取 Token
   * @param name - Token 名称，默认 'default'
   * @returns Token 值，如果不存在返回 null
   */
  getToken(name?: string): Promise<string | null>;

  /**
   * 获取指定 Token 的完整信息（含元数据）
   */
  getTokenInfo(name?: string): Promise<StoredToken | null>;

  /**
   * 删除 Token
   */
  deleteToken(name: string): Promise<boolean>;

  /**
   * 列出所有已存储的 Token 名称
   */
  listTokens(): Promise<string[]>;

  /**
   * 设置默认 Token 名称
   */
  setDefault(name: string): Promise<void>;

  /**
   * 获取默认 Token 名称
   */
  getDefault(): Promise<string>;

  /**
   * 验证 Token 存储是否可用（keytar 是否可用，或加密文件是否可读写）
   */
  isAvailable(): Promise<boolean>;

  /**
   * 获取当前使用的存储后端（'keytar' | 'encrypted-file' | 'none'）
   */
  getBackend(): Promise<'keytar' | 'encrypted-file' | 'none'>;
}

// ============ 内部类型定义 ============

/**
 * keytar 模块类型定义（可选依赖）
 */
interface Keytar {
  setPassword(service: string, account: string, password: string): Promise<void>;
  getPassword(service: string, account: string): Promise<string | null>;
  deletePassword(service: string, account: string): Promise<boolean>;
  findCredentials(service: string): Promise<Array<{ account: string; password: string }>>;
}

/**
 * 加密文件存储格式
 */
interface EncryptedFileData {
  /** 存储格式版本 */
  version: 1;
  /** 默认 Token 名称 */
  default: string;
  /** Token 元数据（value 字段已加密） */
  tokens: Record<string, EncryptedStoredToken>;
}

/**
 * 加密后的 Token 元数据
 */
interface EncryptedStoredToken {
  name: string;
  /** 加密后的 Token 值 */
  encryptedValue: string;
  createdAt: number;
  lastUsedAt?: number;
  note?: string;
}

// ============ 常量定义 ============

/** keytar 服务名 */
const KEYTAR_SERVICE = 'figma-dev-tools';

/** keytar 中存储默认 Token 名称的特殊账号名 */
const KEYTAR_DEFAULT_ACCOUNT = '__default__';

/** 配置目录名 */
const CONFIG_DIR_NAME = '.config';

/** 配置子目录名 */
const APP_DIR_NAME = 'figma-dev-tools';

/** 加密文件名 */
const CREDENTIALS_FILE = 'credentials.enc';

/** 加密算法 */
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

/** 密钥派生盐值（固定值，配合机器信息派生唯一密钥） */
const KEY_DERIVATION_SALT = 'figma-dev-tools-token-store-v1-salt';

/** 密钥派生迭代次数 */
const KEY_DERIVATION_ITERATIONS = 65536;

/** 派生密钥长度（字节） */
const KEY_LENGTH = 32;

/** GCM 认证标签长度（字节） */
const AUTH_TAG_LENGTH = 16;

/** GCM 推荐 IV 长度（字节） */
const IV_LENGTH = 12;

/** 默认 Token 名称 */
const DEFAULT_TOKEN_NAME = 'default';

// ============ 加密工具函数 ============

/**
 * 派生加密密钥
 *
 * 使用机器唯一信息（主机名 + 用户名）+ 固定盐通过 scrypt 派生密钥
 * 确保同一台机器上的数据可以解密，跨机器无法解密
 */
function deriveEncryptionKey(): Buffer {
  const machineInfo = `${os.hostname()}:${os.userInfo().username}`;
  return crypto.scryptSync(machineInfo, KEY_DERIVATION_SALT, KEY_LENGTH, {
    N: KEY_DERIVATION_ITERATIONS,
    r: 8,
    p: 1,
  });
}

/**
 * 加密字符串（AES-256-GCM）
 * @param plaintext - 明文
 * @returns 格式：base64(iv) + ':' + base64(authTag) + ':' + base64(encryptedData)
 */
function encryptString(plaintext: string): string {
  const key = deriveEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':');
}

/**
 * 解密字符串（AES-256-GCM）
 * @param encryptedData - 加密格式字符串
 * @returns 明文，解密失败返回 null
 */
function decryptString(encryptedData: string): string | null {
  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      return null;
    }

    const iv = Buffer.from(parts[0]!, 'base64');
    const authTag = Buffer.from(parts[1]!, 'base64');
    const encrypted = Buffer.from(parts[2]!, 'base64');

    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
      return null;
    }

    const key = deriveEncryptionKey();
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

// ============ 文件路径工具 ============

/**
 * 获取配置目录路径（跨平台）
 */
function getConfigDir(): string {
  return path.join(os.homedir(), CONFIG_DIR_NAME, APP_DIR_NAME);
}

/**
 * 获取凭证文件路径
 */
function getCredentialsFilePath(): string {
  return path.join(getConfigDir(), CREDENTIALS_FILE);
}

/**
 * 确保配置目录存在
 */
async function ensureConfigDir(): Promise<void> {
  await fs.mkdir(getConfigDir(), { recursive: true });
}

// ============ TokenStore 实现类 ============

class TokenStoreImpl implements TokenStore {
  private keytarInstance: Keytar | null | undefined = undefined;
  private keytarCheckPromise: Promise<Keytar | null> | null = null;

  // ============ 后端检测 ============

  /**
   * 尝试加载 keytar 模块
   */
  private async loadKeytar(): Promise<Keytar | null> {
    if (this.keytarInstance !== undefined) {
      return this.keytarInstance;
    }

    if (this.keytarCheckPromise) {
      return this.keytarCheckPromise;
    }

    this.keytarCheckPromise = (async (): Promise<Keytar | null> => {
      try {
        // keytar 是可选依赖，通过 Function 构造器动态导入以避免编译时依赖检查
        const dynamicImport = new Function('specifier', 'return import(specifier)') as (
          specifier: string
        ) => Promise<{ default: Keytar }>;
        const keytarModule = await dynamicImport('keytar');
        this.keytarInstance = keytarModule.default;
        return this.keytarInstance;
      } catch {
        this.keytarInstance = null;
        return null;
      }
    })();

    return this.keytarCheckPromise;
  }

  async getBackend(): Promise<'keytar' | 'encrypted-file' | 'none'> {
    const keytar = await this.loadKeytar();
    if (keytar) {
      return 'keytar';
    }
    try {
      await ensureConfigDir();
      await fs.access(getConfigDir(), fs.constants.W_OK);
      return 'encrypted-file';
    } catch {
      return 'none';
    }
  }

  async isAvailable(): Promise<boolean> {
    const backend = await this.getBackend();
    return backend !== 'none';
  }

  // ============ Keytar 后端实现 ============

  /**
   * keytar 账号名（Token 存储使用 "token:" 前缀，默认值使用 "__default__" 特殊账号）
   */
  private keytarAccountName(name: string): string {
    return `token:${name}`;
  }

  private async saveTokenKeytar(name: string, token: string, note?: string): Promise<void> {
    const keytar = await this.loadKeytar();
    if (!keytar) {
      throw new Error('keytar not available');
    }

    const metadata = JSON.stringify({ note, createdAt: Date.now() });
    const password = JSON.stringify({ value: token, metadata });

    await keytar.setPassword(KEYTAR_SERVICE, this.keytarAccountName(name), password);
  }

  private async getTokenKeytar(name: string): Promise<string | null> {
    const info = await this.getTokenInfoKeytar(name);
    return info?.value ?? null;
  }

  private async getTokenInfoKeytar(name: string): Promise<StoredToken | null> {
    const keytar = await this.loadKeytar();
    if (!keytar) {
      throw new Error('keytar not available');
    }

    try {
      const password = await keytar.getPassword(KEYTAR_SERVICE, this.keytarAccountName(name));
      if (!password) {
        return null;
      }

      const parsed = JSON.parse(password) as { value: string; metadata: string };
      const metadata = JSON.parse(parsed.metadata) as { note?: string; createdAt: number };

      return {
        name,
        value: parsed.value,
        createdAt: metadata.createdAt,
        note: metadata.note,
      };
    } catch {
      return null;
    }
  }

  private async deleteTokenKeytar(name: string): Promise<boolean> {
    const keytar = await this.loadKeytar();
    if (!keytar) {
      throw new Error('keytar not available');
    }
    return keytar.deletePassword(KEYTAR_SERVICE, this.keytarAccountName(name));
  }

  private async listTokensKeytar(): Promise<string[]> {
    const keytar = await this.loadKeytar();
    if (!keytar) {
      throw new Error('keytar not available');
    }

    const credentials = await keytar.findCredentials(KEYTAR_SERVICE);
    return credentials
      .map((cred) => {
        const match = cred.account.match(/^token:(.+)$/);
        return match ? match[1]! : null;
      })
      .filter((name): name is string => name !== null);
  }

  /**
   * 在 keytar 中设置默认 Token 名称
   * 使用特殊账号 "__default__" 存储默认 Token 名，与普通 Token 账号（"token:xxx" 前缀）不冲突
   */
  private async setDefaultKeytar(name: string): Promise<void> {
    const keytar = await this.loadKeytar();
    if (!keytar) {
      throw new Error('keytar not available');
    }
    await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_DEFAULT_ACCOUNT, name);
  }

  /**
   * 从 keytar 中获取默认 Token 名称
   * 如果未设置过默认值，返回 DEFAULT_TOKEN_NAME
   */
  private async getDefaultKeytar(): Promise<string> {
    const keytar = await this.loadKeytar();
    if (!keytar) {
      throw new Error('keytar not available');
    }
    try {
      const stored = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_DEFAULT_ACCOUNT);
      if (stored) {
        return stored;
      }
    } catch {
      // 读取失败时回退到默认值
    }
    return DEFAULT_TOKEN_NAME;
  }

  // ============ 加密文件后端实现 ============

  /**
   * 读取加密文件数据
   */
  private async readEncryptedFile(): Promise<EncryptedFileData> {
    try {
      const filePath = getCredentialsFilePath();
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content) as EncryptedFileData;
    } catch {
      return {
        version: 1,
        default: DEFAULT_TOKEN_NAME,
        tokens: {},
      };
    }
  }

  /**
   * 写入加密文件数据
   */
  private async writeEncryptedFile(data: EncryptedFileData): Promise<void> {
    await ensureConfigDir();
    const filePath = getCredentialsFilePath();
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  private async saveTokenEncryptedFile(name: string, token: string, note?: string): Promise<void> {
    const data = await this.readEncryptedFile();
    const encryptedValue = encryptString(token);
    const now = Date.now();

    const existing = data.tokens[name];
    data.tokens[name] = {
      name,
      encryptedValue,
      createdAt: existing?.createdAt ?? now,
      lastUsedAt: existing?.lastUsedAt,
      note: note ?? existing?.note,
    };

    await this.writeEncryptedFile(data);
  }

  private async getTokenEncryptedFile(name: string): Promise<string | null> {
    const info = await this.getTokenInfoEncryptedFile(name);
    return info?.value ?? null;
  }

  private async getTokenInfoEncryptedFile(name: string): Promise<StoredToken | null> {
    const data = await this.readEncryptedFile();
    const encryptedToken = data.tokens[name];
    if (!encryptedToken) {
      return null;
    }

    const value = decryptString(encryptedToken.encryptedValue);
    if (value === null) {
      return null;
    }

    return {
      name: encryptedToken.name,
      value,
      createdAt: encryptedToken.createdAt,
      lastUsedAt: encryptedToken.lastUsedAt,
      note: encryptedToken.note,
    };
  }

  private async deleteTokenEncryptedFile(name: string): Promise<boolean> {
    const data = await this.readEncryptedFile();
    if (!data.tokens[name]) {
      return false;
    }
    delete data.tokens[name];
    if (data.default === name) {
      const remaining = Object.keys(data.tokens);
      data.default = remaining[0] ?? DEFAULT_TOKEN_NAME;
    }
    await this.writeEncryptedFile(data);
    return true;
  }

  private async listTokensEncryptedFile(): Promise<string[]> {
    const data = await this.readEncryptedFile();
    return Object.keys(data.tokens);
  }

  private async setDefaultEncryptedFile(name: string): Promise<void> {
    const data = await this.readEncryptedFile();
    if (!data.tokens[name]) {
      throw new Error(`Token '${name}' does not exist`);
    }
    data.default = name;
    await this.writeEncryptedFile(data);
  }

  private async getDefaultEncryptedFile(): Promise<string> {
    const data = await this.readEncryptedFile();
    return data.default;
  }

  // ============ 公共 API 实现 ============

  async saveToken(name: string, token: string, note?: string): Promise<void> {
    const keytar = await this.loadKeytar();
    if (keytar) {
      await this.saveTokenKeytar(name, token, note);
      return;
    }
    await this.saveTokenEncryptedFile(name, token, note);
  }

  async getToken(name: string = DEFAULT_TOKEN_NAME): Promise<string | null> {
    const tokenInfo = await this.getTokenInfo(name);

    if (tokenInfo) {
      await this.updateLastUsed(name);
      return tokenInfo.value;
    }

    return null;
  }

  async getTokenInfo(name: string = DEFAULT_TOKEN_NAME): Promise<StoredToken | null> {
    const keytar = await this.loadKeytar();
    if (keytar) {
      return this.getTokenInfoKeytar(name);
    }
    return this.getTokenInfoEncryptedFile(name);
  }

  async deleteToken(name: string): Promise<boolean> {
    const keytar = await this.loadKeytar();
    if (keytar) {
      return this.deleteTokenKeytar(name);
    }
    return this.deleteTokenEncryptedFile(name);
  }

  async listTokens(): Promise<string[]> {
    const keytar = await this.loadKeytar();
    if (keytar) {
      return this.listTokensKeytar();
    }
    return this.listTokensEncryptedFile();
  }

  async setDefault(name: string): Promise<void> {
    const keytar = await this.loadKeytar();
    if (keytar) {
      const exists = await this.getTokenInfoKeytar(name);
      if (!exists) {
        throw new Error(`Token '${name}' does not exist`);
      }
      await this.setDefaultKeytar(name);
      return;
    }
    await this.setDefaultEncryptedFile(name);
  }

  async getDefault(): Promise<string> {
    const keytar = await this.loadKeytar();
    if (keytar) {
      return this.getDefaultKeytar();
    }
    return this.getDefaultEncryptedFile();
  }

  /**
   * 更新 Token 最后使用时间（仅文件后端支持）
   */
  private async updateLastUsed(name: string): Promise<void> {
    const keytar = await this.loadKeytar();
    if (keytar) {
      return;
    }

    const data = await this.readEncryptedFile();
    const token = data.tokens[name];
    if (token) {
      token.lastUsedAt = Date.now();
      await this.writeEncryptedFile(data);
    }
  }
}

// ============ 单例管理 ============

let tokenStoreInstance: TokenStore | null = null;

/**
 * 创建 Token 存储服务实例（单例模式）
 *
 * 整个进程只会创建一个实例，重复调用返回同一实例
 */
export function createTokenStore(): TokenStore {
  if (!tokenStoreInstance) {
    tokenStoreInstance = new TokenStoreImpl();
  }
  return tokenStoreInstance;
}
