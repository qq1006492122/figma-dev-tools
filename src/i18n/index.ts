/**
 * i18n 国际化模块
 *
 * 提供多语言支持，目前支持简体中文 (zh-CN) 和英文 (en-US)。
 * 语言设置保存到用户配置目录 ~/.figma-dev-tools/config.json
 *
 * @module
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { enUS } from './en-US.js';
import { zhCN } from './zh-CN.js';

// ============ 类型定义 ============

/**
 * 支持的语言代码
 */
export type Language = 'zh-CN' | 'en-US';

/**
 * i18n 消息对象类型（宽松类型，支持嵌套对象）
 */
export type Messages = Record<string, unknown>;

/**
 * 用户配置
 */
interface UserConfig {
  /** 语言设置 */
  language: Language;
  /** 配置版本 */
  version: string;
}

// ============ 常量定义 ============

/**
 * 配置目录名
 */
const CONFIG_DIR_NAME = '.figma-dev-tools';

/**
 * 配置文件名
 */
const CONFIG_FILE_NAME = 'config.json';

/**
 * 默认语言
 */
const DEFAULT_LANGUAGE: Language = 'zh-CN';

/**
 * 配置文件版本
 */
const CONFIG_VERSION = '1.0.0';

// ============ 语言包映射 ============

const messagesMap: Record<Language, Messages> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

// ============ 工具函数：路径操作 ============

/**
 * 获取配置目录路径（跨平台）
 *
 * @returns 配置目录绝对路径
 */
function getConfigDir(): string {
  return path.join(os.homedir(), CONFIG_DIR_NAME);
}

/**
 * 获取配置文件路径
 *
 * @returns 配置文件绝对路径
 */
function getConfigFilePath(): string {
  return path.join(getConfigDir(), CONFIG_FILE_NAME);
}

/**
 * 确保配置目录存在
 */
async function ensureConfigDir(): Promise<void> {
  await fs.mkdir(getConfigDir(), { recursive: true });
}

// ============ 配置读写 ============

/**
 * 读取用户配置
 *
 * @returns 用户配置对象，如果文件不存在则返回默认配置
 */
async function readConfig(): Promise<UserConfig> {
  try {
    const content = await fs.readFile(getConfigFilePath(), 'utf8');
    const parsed = JSON.parse(content) as Partial<UserConfig>;
    return {
      language: parsed.language || DEFAULT_LANGUAGE,
      version: parsed.version || CONFIG_VERSION,
    };
  } catch {
    return {
      language: DEFAULT_LANGUAGE,
      version: CONFIG_VERSION,
    };
  }
}

/**
 * 写入用户配置
 *
 * @param config - 要写入的配置
 */
async function writeConfig(config: UserConfig): Promise<void> {
  await ensureConfigDir();
  await fs.writeFile(getConfigFilePath(), JSON.stringify(config, null, 2), 'utf8');
}

// ============ I18n 类 ============

/**
 * i18n 国际化类
 *
 * 管理当前语言设置，提供翻译消息获取功能。
 * 支持嵌套键路径访问，如 t('cli.commands.wizard.title')
 */
export class I18n {
  /** 当前语言 */
  private _language: Language;
  /** 当前语言包 */
  private _messages: Messages;
  /** 是否已初始化 */
  private _initialized = false;

  /**
   * 构造函数
   *
   * @param defaultLanguage - 默认语言
   */
  constructor(defaultLanguage: Language = DEFAULT_LANGUAGE) {
    this._language = defaultLanguage;
    this._messages = messagesMap[defaultLanguage];
  }

  /**
   * 初始化 i18n（异步加载配置）
   *
   * @returns Promise<void>
   */
  async initialize(): Promise<void> {
    if (this._initialized) return;

    try {
      const config = await readConfig();
      this._language = config.language;
      this._messages = messagesMap[config.language] || messagesMap[DEFAULT_LANGUAGE];
    } catch {
      this._language = DEFAULT_LANGUAGE;
      this._messages = messagesMap[DEFAULT_LANGUAGE];
    }

    this._initialized = true;
  }

  /**
   * 获取当前语言
   *
   * @returns 当前语言代码
   */
  getLanguage(): Language {
    return this._language;
  }

  /**
   * 设置语言并保存到配置
   *
   * @param language - 目标语言
   */
  async setLanguage(language: Language): Promise<void> {
    if (!messagesMap[language]) {
      throw new Error(`Unsupported language: ${language}`);
    }

    this._language = language;
    this._messages = messagesMap[language];

    await writeConfig({
      language,
      version: CONFIG_VERSION,
    });
  }

  /**
   * 仅在内存中切换语言（**不写入配置**）。
   *
   * 用于 CLI `-l, --lang` 单次运行覆盖：命令定义前即完成切换，
   * 使 `--help` 文案随参数语言渲染；不支持的语言码返回 false 且保持现状。
   *
   * @param language - 目标语言代码
   * @returns 是否切换成功
   */
  useLanguage(language: string): boolean {
    const messages = messagesMap[language as Language];
    if (!messages) return false;
    this._language = language as Language;
    this._messages = messages;
    return true;
  }

  /**
   * 获取翻译消息（支持嵌套键路径）
   *
   * @param key - 消息键路径，使用点号分隔，如 'cli.commands.wizard.title'
   * @param args - 函数参数（当消息是函数时）
   * @returns 翻译后的消息，如果是函数则返回函数执行结果
   */
  t(key: string, ...args: unknown[]): unknown {
    const keys = key.split('.');
    let value: unknown = this._messages;

    for (const k of keys) {
      if (value === null || value === undefined || typeof value !== 'object') {
        break;
      }
      value = (value as Record<string, unknown>)[k];
    }

    if (value === undefined) {
      return key;
    }

    if (typeof value === 'function') {
      return (value as (...fnArgs: unknown[]) => unknown)(...args);
    }

    return value;
  }

  /**
   * 获取指定语言的消息对象
   *
   * @param language - 语言代码
   * @returns 消息对象
   */
  getMessages(language?: Language): Messages {
    if (language && messagesMap[language]) {
      return messagesMap[language];
    }
    return this._messages;
  }

  /**
   * 获取支持的语言列表
   *
   * @returns 支持的语言数组
   */
  getSupportedLanguages(): Array<{ code: Language; name: string }> {
    const config = this._messages.config as Record<string, string>;
    return [
      { code: 'zh-CN', name: config.languageZhCN || '简体中文' },
      { code: 'en-US', name: config.languageEnUS || 'English' },
    ];
  }
}

// ============ 单例管理 ============

let i18nInstance: I18n | null = null;

/**
 * 获取 i18n 单例
 *
 * @returns I18n 实例
 */
export function getI18n(): I18n {
  if (!i18nInstance) {
    i18nInstance = new I18n();
  }
  return i18nInstance;
}

/**
 * 同步初始化 i18n（用于启动时快速使用，不等待文件读取）
 * 之后会在后台异步加载配置
 *
 * @returns I18n 实例
 */
export function initI18nSync(): I18n {
  const i18n = getI18n();
  // 后台异步初始化
  void i18n.initialize();
  return i18n;
}

/**
 * t 函数快捷方式（需要先初始化 i18n）
 *
 * @param key - 消息键
 * @param args - 函数参数
 * @returns 翻译结果
 */
export function t(key: string, ...args: unknown[]): unknown {
  return getI18n().t(key, ...args);
}

// ============ 错误码国际化 ============

/**
 * 错误码信息
 */
export interface ErrorCodeInfo {
  /** 错误码 */
  code: string;
  /** 错误标题 */
  title: string;
  /** 错误原因 */
  reason: string;
  /** 解决方案列表 */
  solutions: string[];
  /** 相关文档链接 */
  docs?: string;
}

/**
 * 获取错误码的国际化信息
 *
 * @param errorCode - 错误码（如 TOKEN_INVALID, NETWORK_ERROR）
 * @param defaultMessage - 默认错误消息（用于未知错误）
 * @returns 结构化的错误信息
 */
export function getErrorInfo(errorCode: string, defaultMessage?: string): ErrorCodeInfo {
  // 防御：入口归一化，避免 null / undefined / 非字符串调用方导致下游 title/reason 变 null，
  // 再次触发 "Cannot read properties of undefined" 链式崩溃。
  const code = errorCode == null ? 'UNKNOWN' : String(errorCode);
  const fallbackMsg = defaultMessage == null ? code : String(defaultMessage);

  const i18n = getI18n();
  const messages = i18n.getMessages();
  const errors = ((messages.cli as Record<string, unknown>)?.errors ?? {}) as Record<string, unknown>;
  const codes = (errors.codes ?? {}) as Record<string, ErrorCodeInfo>;

  if (codes[code]) {
    return codes[code]!;
  }

  const unknownError = errors.unknown as ((msg: string) => ErrorCodeInfo) | undefined;
  if (unknownError) {
    return unknownError(fallbackMsg);
  }

  return {
    code,
    title: fallbackMsg,
    reason: fallbackMsg,
    solutions: [],
  };
}

/**
 * 格式化错误消息为用户友好的字符串
 *
 * @param errorCode - 错误码
 * @param defaultMessage - 默认消息
 * @returns 格式化后的错误消息字符串
 */
export function formatError(errorCode: string, defaultMessage?: string): string {
  const info = getErrorInfo(errorCode, defaultMessage);
  const i18n = getI18n();
  const messages = i18n.getMessages();
  const common = messages.common as Record<string, string>;

  const lines: string[] = [
    `[${info.code}] ${info.title}`,
    '',
    `${common.error || '错误'}: ${info.reason}`,
    '',
    `${common.info || '信息'}:`,
    ...info.solutions.map((s, i) => `  ${i + 1}. ${s}`),
  ];

  if (info.docs) {
    lines.push('', `${common.docs || '文档'}: ${info.docs}`);
  }

  return lines.join('\n');
}
