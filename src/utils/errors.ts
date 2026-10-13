/**
 * Figma Dev Tools 错误处理工具
 *
 * 提供统一的错误类和错误格式化功能，所有错误都附带结构化错误信息和详细解决方案。
 * 错误消息按 i18n 当前语言（zh-CN / en-US）输出，默认中文。
 *
 * @module
 */

import { formatError, getErrorInfo, getI18n, type ErrorCodeInfo } from '../i18n/index.js';
import { maskSensitiveData } from './security.js';

export type ErrorCode =
  | 'TOKEN_INVALID'
  | 'TOKEN_EXPIRED'
  | 'FILE_PERMISSION_DENIED'
  | 'PAYMENT_REQUIRED'
  | 'FORBIDDEN'
  | 'NETWORK_ERROR'
  | 'TIMEOUT_ERROR'
  | 'PROXY_ERROR'
  | 'TLS_ERROR'
  | 'DNS_ERROR'
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
  | 'STYLUS_ERROR'
  | 'OCR_ERROR';

export class FigmaDevError extends Error {
  public readonly code: string;
  public readonly info: ErrorCodeInfo;
  constructor(errorCode: ErrorCode | string, message?: string) {
    const info = getErrorInfo(errorCode, message);
    super(`[${info.code}] ${info.title}: ${info.reason}${message ? ` (${message})` : ''}`);
    this.name = 'FigmaDevError';
    this.code = info.code;
    this.info = info;
  }
  toUserString(): string {
    return formatError(this.code, this.message);
  }
}

export class FigmaApiError extends FigmaDevError {
  public readonly status: number;
  public readonly retriable: boolean;
  public readonly staleCacheRecoverable: boolean;
  public readonly originalMessage?: string;
  constructor(errorCode: ErrorCode, status: number, options: {
    reason: string;
    solution: string;
    retriable?: boolean;
    staleCacheRecoverable?: boolean;
    originalMessage?: string;
  }) {
    super(errorCode, options.reason);
    this.name = 'FigmaApiError';
    this.status = status;
    this.retriable = options.retriable ?? false;
    this.staleCacheRecoverable = options.staleCacheRecoverable ?? false;
    this.originalMessage = options.originalMessage;
    const i18n = getI18n();
    const labels = i18n.t('cli.errors.labels') as {
      cause: string;
      suggestion: string;
      originalResponse: string;
      requestFailed: string;
    };
    this.message = maskSensitiveData(
      `[${errorCode}] ${labels.requestFailed} (HTTP ${status})\n` +
      `${labels.cause}：${options.reason}\n` +
      `${labels.suggestion}：${options.solution}` +
      (options.originalMessage ? `\n${labels.originalResponse}：${options.originalMessage}` : ''),
    );
  }
}

export function isFigmaDevError(error: unknown): error is FigmaDevError {
  return error instanceof FigmaDevError;
}

export function isFigmaApiError(error: unknown): error is FigmaApiError {
  return error instanceof FigmaApiError;
}

export function inferErrorCodeFromHttpStatus(status?: number, message?: string): ErrorCode {
  if (!status) {
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

export function wrapError(error: unknown, defaultCode: ErrorCode = 'NETWORK_ERROR'): FigmaDevError {
  if (isFigmaDevError(error)) return error;
  if (error instanceof Error) {
    const status = (error as { response?: { status?: number } }).response?.status;
    return new FigmaDevError(inferErrorCodeFromHttpStatus(status, error.message), maskSensitiveData(error.message));
  }
  return new FigmaDevError(defaultCode, maskSensitiveData(String(error)));
}
