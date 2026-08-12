/**
 * 安全工具函数
 *
 * 提供 XSS 防护、日志脱敏、敏感文件检测、隐私保护等功能
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import sanitizeHtml from 'sanitize-html';

// ============ XSS 防护 ============

/**
 * sanitize-html 配置：严格白名单模式，用于清理 Figma 文本内容
 * 禁止所有 HTML 标签，只保留纯文本
 */
const STRICT_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
  allowedSchemes: [],
  disallowedTagsMode: 'recursiveEscape',
};

/**
 * SVG 清理配置：允许安全的 SVG 标签和属性，过滤危险的 script/on* 事件
 */
const SVG_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'svg',
    'path',
    'rect',
    'circle',
    'ellipse',
    'line',
    'polyline',
    'polygon',
    'g',
    'defs',
    'clippath',
    'mask',
    'pattern',
    'lineargradient',
    'radialgradient',
    'stop',
    'use',
    'symbol',
    'image',
    'text',
    'tspan',
    'title',
    'desc',
  ],
  allowedAttributes: {
    svg: ['viewBox', 'width', 'height', 'xmlns', 'fill', 'stroke', 'stroke-width', 'class'],
    path: [
      'd',
      'fill',
      'stroke',
      'stroke-width',
      'stroke-linecap',
      'stroke-linejoin',
      'fill-rule',
      'clip-path',
      'transform',
    ],
    rect: ['x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke', 'stroke-width', 'transform'],
    circle: ['cx', 'cy', 'r', 'fill', 'stroke', 'stroke-width', 'transform'],
    ellipse: ['cx', 'cy', 'rx', 'ry', 'fill', 'stroke', 'stroke-width', 'transform'],
    line: ['x1', 'y1', 'x2', 'y2', 'stroke', 'stroke-width', 'stroke-linecap', 'transform'],
    polyline: ['points', 'fill', 'stroke', 'stroke-width', 'stroke-linejoin', 'transform'],
    polygon: ['points', 'fill', 'stroke', 'stroke-width', 'stroke-linejoin', 'transform'],
    g: ['fill', 'stroke', 'stroke-width', 'transform', 'clip-path', 'class'],
    defs: [],
    clippath: ['id', 'clipPathUnits'],
    mask: ['id'],
    pattern: ['id', 'x', 'y', 'width', 'height', 'patternUnits'],
    lineargradient: ['id', 'x1', 'y1', 'x2', 'y2', 'gradientUnits'],
    radialgradient: ['id', 'cx', 'cy', 'r', 'gradientUnits'],
    stop: ['offset', 'stop-color', 'stop-opacity'],
    use: ['href', 'xlink:href', 'x', 'y', 'width', 'height', 'transform'],
    symbol: ['id', 'viewBox'],
    image: ['href', 'xlink:href', 'x', 'y', 'width', 'height', 'preserveAspectRatio'],
    text: ['x', 'y', 'fill', 'font-size', 'font-family', 'text-anchor', 'transform'],
    tspan: ['x', 'y', 'dx', 'dy'],
    title: [],
    desc: [],
  },
  allowedSchemes: ['http', 'https', 'data'],
  parser: {
    lowerCaseTags: true,
  },
};

/**
 * 清理 HTML 内容，防止 XSS 攻击（严格模式：移除所有标签）
 *
 * 用于清理 Figma 节点名称、文本内容等用户可控数据，防止：
 * - <script>alert('xss')</script> 注入
 * - <img src=x onerror=alert(1)> 事件注入
 * - javascript: 协议链接
 *
 * @param input - 输入字符串
 * @returns 清理后的纯文本
 */
export function sanitizeText(input: string): string {
  if (!input) return input;
  // 先进行 HTML 实体转义，防止标签注入
  return sanitizeHtml(input, STRICT_SANITIZE_OPTIONS).trim();
}

/**
 * 清理 SVG 内容，保留安全的 SVG 标签，移除危险的脚本和事件
 *
 * @param svgString - SVG 字符串
 * @returns 清理后的安全 SVG
 */
export function sanitizeSvg(svgString: string): string {
  if (!svgString) return svgString;
  return sanitizeHtml(svgString, SVG_SANITIZE_OPTIONS);
}

/**
 * 转义 HTML/JSX 属性值中的特殊字符
 *
 * 正确处理 HTML 属性上下文：
 * - 转义 &、"、'、<、> 防止标签注入和属性逃逸
 * - 移除控制字符（换行/回车/制表符），防止属性值断裂
 * - 不转义 $（属性值不是模板字符串插值上下文）
 *
 * @param value - 属性值
 * @returns 转义后的安全属性值
 */
export function escapeAttribute(value: string): string {
  if (!value) return value;
  return (
    value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // 移除控制字符（换行/回车/制表符/零宽空格），防止属性值格式破坏
      .replace(/[\n\r\t\u200b-\u200d\ufeff]/g, ' ')
      // 合并多个连续空格
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
}

/**
 * 转义 JavaScript/JSX/Vue 模板字符串中的特殊字符
 *
 * @param value - 字符串内容
 * @returns 转义后的安全字符串
 */
export function escapeJsString(value: string): string {
  if (!value) return value;
  return value
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * 安全处理组件/变量名称：只保留字母、数字、下划线，首字母大写
 *
 * @param name - 原始名称（可能来自 Figma 节点名）
 * @returns 安全的 PascalCase 标识符
 */
export function sanitizeIdentifier(name: string): string {
  if (!name) return 'Component';
  // 移除非字母数字字符，转换为 PascalCase
  const cleaned = name
    .replace(/[^\w\u4e00-\u9fa5\s-]/g, '')
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/[\u4e00-\u9fa5]/g, ''); // 移除中文字符用于标识符
  // 确保首字母大写
  const result = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  // 如果结果为空或不以字母开头，使用默认名
  if (!result || !/^[a-zA-Z]/.test(result)) {
    return 'Component';
  }
  return result;
}

/**
 * 安全处理 CSS 类名：只保留安全字符
 *
 * @param name - 原始名称
 * @returns 安全的 CSS 类名
 */
export function sanitizeClassName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ============ 日志脱敏 ============

/** Token 正则：匹配 figd_ 开头的 Token */
const TOKEN_PATTERN = /figd_[a-zA-Z0-9_-]{20,}/g;
/** 通用密钥模式 */
const SECRET_PATTERNS = [
  /(?:api[_-]?key|secret|token|password|passwd|pwd)["']?\s*[:=]\s*["']?([a-zA-Z0-9_-]{20,})/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];
/** 邮箱脱敏 */
const EMAIL_PATTERN = /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
/** 手机号脱敏（中国大陆） */
const PHONE_PATTERN = /(?<!\d)(1[3-9]\d)(\d{4})(\d{4})(?!\d)/g;
/** 用户名路径脱敏 */
const USER_PATH_PATTERN = /(Users|home|Documents and Settings)[/\\]([^/\\]+)/g;

/**
 * 脱敏字符串
 *
 * 自动检测并脱敏：
 * - Figma Token (figd_*)
 * - API Key/Secret/Password
 * - 邮箱地址
 * - 手机号
 * - 路径中的用户名
 *
 * @param input - 输入字符串
 * @returns 脱敏后的字符串
 */
export function maskSensitiveData(input: string): string {
  if (!input) return input;

  let result = input;

  // 1. 脱敏 Figma Token
  result = result.replace(TOKEN_PATTERN, (token) => {
    if (token.length <= 10) return 'figd_***';
    return `${token.slice(0, 8)}****${token.slice(-4)}`;
  });

  // 2. 脱敏通用密钥
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, (match, group1) => {
      if (group1 && typeof group1 === 'string') {
        return match.replace(group1, `${group1.slice(0, 4)}****${group1.slice(-4)}`);
      }
      // 私钥完全替换
      return '[REDACTED PRIVATE KEY]';
    });
  }

  // 3. 脱敏邮箱
  result = result.replace(EMAIL_PATTERN, (_match, local: string, domain: string) => {
    if (local.length <= 2) {
      return `${local[0] || ''}***@${domain}`;
    }
    return `${local.slice(0, 2)}***@${domain}`;
  });

  // 4. 脱敏手机号
  result = result.replace(PHONE_PATTERN, (_match, prefix: string, _middle: string, suffix: string) => {
    return `${prefix}****${suffix}`;
  });

  // 5. 脱敏路径中的用户名
  result = result.replace(USER_PATH_PATTERN, (_match, dir: string, username: string) => {
    if (username.length <= 2) {
      return `${dir}/${username[0] || ''}***`;
    }
    return `${dir}/${username.slice(0, 2)}***`;
  });

  return result;
}

/**
 * 脱敏对象（递归处理所有字符串值）
 *
 * @param obj - 输入对象
 * @param seen - 内部使用的循环引用检测集合
 * @returns 脱敏后的对象副本
 */
export function maskSensitiveObject<T>(obj: T, seen: WeakSet<object> = new WeakSet()): T {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    return maskSensitiveData(obj) as unknown as T;
  }

  if (typeof obj === 'object') {
    if (seen.has(obj as object)) {
      return '[Circular]' as unknown as T;
    }
    seen.add(obj as object);

    if (Array.isArray(obj)) {
      return obj.map((item) => maskSensitiveObject(item, seen)) as unknown as T;
    }

    const masked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // 敏感 key 直接替换值
      const sensitiveKeys = ['token', 'accessToken', 'apiKey', 'secret', 'password', 'authorization'];
      if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk.toLowerCase()))) {
        if (typeof value === 'string' && value.length > 8) {
          masked[key] = `${value.slice(0, 4)}****${value.slice(-4)}`;
        } else {
          masked[key] = '***';
        }
      } else {
        masked[key] = maskSensitiveObject(value, seen);
      }
    }
    return masked as T;
  }

  return obj;
}

// ============ 敏感文件检测 ============

export interface GitignoreCheckResult {
  /** .gitignore 是否存在 */
  exists: boolean;
  /** .env 是否被忽略 */
  envIgnored: boolean;
  /** credentials.enc 是否被忽略 */
  credentialsIgnored: boolean;
  /** 建议添加的规则 */
  suggestedRules: string[];
}

/**
 * 检查项目 .gitignore 是否正确忽略敏感文件
 *
 * @param projectDir - 项目目录路径
 * @returns 检查结果
 */
export async function checkGitignore(projectDir: string): Promise<GitignoreCheckResult> {
  const gitignorePath = path.join(projectDir, '.gitignore');
  const result: GitignoreCheckResult = {
    exists: false,
    envIgnored: false,
    credentialsIgnored: false,
    suggestedRules: [],
  };

  try {
    const content = await fs.readFile(gitignorePath, 'utf8');
    result.exists = true;

    const lines = content.split('\n').map((line) => line.trim());

    // 检查 .env
    result.envIgnored = lines.some((line) => {
      const normalized = line.replace(/^\/+/, '').replace(/\\/g, '/');
      return (
        normalized === '.env' ||
        normalized === '.env.*' ||
        normalized === '*.env' ||
        normalized === '.env.local' ||
        normalized.startsWith('.env')
      );
    });

    // 检查 credentials.enc
    result.credentialsIgnored = lines.some((line) => {
      const normalized = line.replace(/^\/+/, '').replace(/\\/g, '/');
      return normalized.includes('credentials.enc') || normalized.includes('.config/figma-dev-tools');
    });
  } catch {
    result.exists = false;
  }

  // 生成建议规则
  if (!result.envIgnored) {
    result.suggestedRules.push('.env', '.env.*', '!.env.example');
  }
  if (!result.credentialsIgnored) {
    result.suggestedRules.push('.config/figma-dev-tools/');
  }

  return result;
}

/**
 * 检查 .env 文件是否存在并包含 Figma Token
 *
 * @param projectDir - 项目目录路径
 * @returns 检查结果
 */
export async function checkEnvFile(projectDir: string): Promise<{
  exists: boolean;
  hasFigmaToken: boolean;
  filePath: string;
}> {
  const envPath = path.join(projectDir, '.env');

  try {
    const content = await fs.readFile(envPath, 'utf8');
    const hasFigmaToken = /FIGMA_API_KEY|FIGMA_TOKEN|FIGMA_ACCESS_TOKEN/i.test(content);
    return {
      exists: true,
      hasFigmaToken,
      filePath: envPath,
    };
  } catch {
    return {
      exists: false,
      hasFigmaToken: false,
      filePath: envPath,
    };
  }
}

/**
 * 生成隐私承诺文本
 */
export function getPrivacyStatement(): string {
  return `
========================================
隐私承诺 Privacy Statement
========================================

figma-dev-tools 重视你的隐私安全：

1. 数据不上传：所有 Figma 设计稿数据、Token、代码仅在本地处理，不会上传到任何第三方服务器
2. 安全存储：Figma Access Token 使用系统密钥链（Keychain/Credential Manager）或 AES-256-GCM 加密存储
3. 开源透明：代码完全开源（MIT 协议），可在 https://gitee.com/shanxi-youcha/figma-dev-tools 审查
4. 零遥测：默认不收集任何使用数据，不发送任何遥测信息
5. 本地缓存：所有缓存数据存储在本地 ~/.config/figma-dev-tools/ 目录，可随时清除

如有安全问题，请提交 Issue 或联系开发者。
========================================
`.trim();
}
