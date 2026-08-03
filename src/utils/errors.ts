/**
 * Figma Dev Tools 错误处理工具
 *
 * 提供统一的错误类和错误格式化功能，所有错误都有中文错误码和详细解决方案。
 *
 * @module
 */

import { formatError, getErrorInfo, type ErrorCodeInfo } from '../i18n/index.js';

// ============ 错误码类型 ============

/**
 * 已知错误码枚举
 */
export type ErrorCode =
  | 'TOKEN_INVALID'
  | 'TOKEN_EXPIRED'
  | 'NETWORK_ERROR'
  | 'FILE_NOT_FOUND'
  | 'NODE_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'INVALID_URL'
  | 'CONFIG_DIR_ERROR'
  | 'ENCRYPTION_ERROR'
  | 'PROJECT_NOT_DETECTED'
  | 'ASSET_DOWNLOAD_FAILED'
  | 'CODE_GENERATION_FAILED'
  | 'INVALID_NODE_TYPE'
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
