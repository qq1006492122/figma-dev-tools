/**
 * Figma Dev Tools 错误处理工具
 *
 * 提供统一的错误类和错误格式化功能，所有错误都附带结构化错误信息和详细解决方案。
 * 错误消息按 i18n 当前语言（zh-CN / en-US）输出，默认中文。
 *
 * @module
 */

import { formatError, getErrorInfo, getI18n, type ErrorCodeInfo } from '../i18n/index.js';

// ============ 错误码类型 ============

/**
 * 已知错误码枚举
 */
export type ErrorCode =
  | 'TOKEN_INVALID'
  | 'TOKEN_EXPIRED'
  | 'FILE_PERMISSION_DENIED'
  | 'PAYMENT_REQUIRED'
  | 'FORBIDDEN'
  | 'NETWORK_ERROR'
  | 'FILE_NOT_FOUND'
  | 'NODE_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'INVALID_URL'
  | 'CONFIG_DIR_ERROR'
  | 'ENCRYPTION_ERROR'
  | 'PROJECT_NOT_DETECTED'
  | 'ASSET_DOWNLOAD_FAILED'
  | 'CODE_GENERATION_FAILED'
  | 'INVALID_NODE_TYPE'
  | 'STALE_CACHE_USED'
  | 'STYLUS_ERROR';

// ============ FigmaDevError 类 ============

/**
 * Figma Dev Tools 自定义错误类
 *
 * 包含错误码、结构化错误信息和用户友好的解决方案。
 *
 * @example
 * ```typescript
 * throw new FigmaDevError('TOKEN_INVALID');
 * throw new FigmaDevError('NODE_NOT_FOUND', `Node ${nodeId} not found`);
 * ```
 */
export class FigmaDevError extends Error {
  /** 错误码 */
  public readonly code: string;
  /** 结构化错误信息 */
  public readonly info: ErrorCodeInfo;

  /**
   * 构造函数
   *
   * @param errorCode - 错误码
   * @param message - 附加错误消息（可选）
   */
  constructor(errorCode: ErrorCode | string, message?: string) {
    const info = getErrorInfo(errorCode, message);
    super(`[${info.code}] ${info.title}: ${info.reason}${message ? ` (${message})` : ''}`);

    this.name = 'FigmaDevError';
    this.code = info.code;
    this.info = info;
  }

  /**
   * 格式化为用户友好的消息
   *
   * @returns 格式化后的错误消息字符串
   */
  toUserString(): string {
    return formatError(this.code, this.message);
  }
}

/**
 * Figma REST API 结构化错误。
 *
 * 与普通 FigmaDevError 相比，额外保留 HTTP 状态码、是否可重试、是否可通过陈旧缓存降级等信息。
 */
export class FigmaApiError extends FigmaDevError {
  /** HTTP 状态码 */
  public readonly status: number;
  /** 是否建议重试 */
  public readonly retriable: boolean;
  /** 是否可以通过本地陈旧缓存继续返回设计数据 */
  public readonly staleCacheRecoverable: boolean;
  /** Figma 接口返回的原始错误文本 */
  public readonly originalMessage?: string;

  constructor(
    errorCode: ErrorCode,
    status: number,
    options: {
      reason: string;
      solution: string;
      retriable?: boolean;
      staleCacheRecoverable?: boolean;
      originalMessage?: string;
    },
  ) {
    super(errorCode, options.reason);
    this.name = 'FigmaApiError';
    this.status = status;
    this.retriable = options.retriable ?? false;
    this.staleCacheRecoverable = options.staleCacheRecoverable ?? false;
    this.originalMessage = options.originalMessage;

    // 错误消息拼装使用 i18n labels，按用户 GUI 选定语言输出
    const i18n = getI18n();
    const labels = i18n.t('cli.errors.labels') as {
      cause: string;
      suggestion: string;
      originalResponse: string;
      requestFailed: string;
    };
    this.message =
      `[${errorCode}] ${labels.requestFailed} (HTTP ${status})\n` +
      `${labels.cause}：${options.reason}\n` +
      `${labels.suggestion}：${options.solution}` +
      (options.originalMessage ? `\n${labels.originalResponse}：${options.originalMessage}` : '');
  }
}

// ============ 错误处理工具函数 ============

/**
 * 判断是否为 FigmaDevError
 *
 * @param error - 待检测的错误对象
 * @returns 如果是 FigmaDevError 返回 true
 */
export function isFigmaDevError(error: unknown): error is FigmaDevError {
  return error instanceof FigmaDevError;
}

/**
 * 判断是否为 Figma REST API 结构化错误。
 */
export function isFigmaApiError(error: unknown): error is FigmaApiError {
  return error instanceof FigmaApiError;
}

/**
 * 从 Axios/HTTP 错误推断错误码
 *
 * @param status - HTTP 状态码
 * @param message - 错误消息
 * @returns 对应的错误码
 */
export function inferErrorCodeFromHttpStatus(status?: number, message?: string): ErrorCode {
  if (!status) {
    if (message?.includes('ECONNREFUSED') || message?.includes('ENOTFOUND') || message?.includes('network')) {
      return 'NETWORK_ERROR';
    }
    return 'NETWORK_ERROR';
  }

  switch (status) {
    case 401:
      return 'TOKEN_INVALID';
    case 403:
      return 'PERMISSION_DENIED';
    case 404:
      return 'FILE_NOT_FOUND';
    case 429:
      return 'RATE_LIMITED';
    default:
      return 'NETWORK_ERROR';
  }
}

/**
 * 包装错误为 FigmaDevError
 *
 * 如果错误已经是 FigmaDevError 则直接返回，否则根据错误类型推断错误码。
 *
 * @param error - 原始错误
 * @param defaultCode - 默认错误码
 * @returns FigmaDevError 实例
 */
export function wrapError(error: unknown, defaultCode: ErrorCode = 'NETWORK_ERROR'): FigmaDevError {
  if (isFigmaDevError(error)) {
    return error;
  }

  if (error instanceof Error) {
    // 尝试从 HTTP 状态码推断
    const status = (error as { response?: { status?: number } }).response?.status;
    const code = inferErrorCodeFromHttpStatus(status, error.message);
    return new FigmaDevError(code, error.message);
  }

  return new FigmaDevError(defaultCode, String(error));
}
