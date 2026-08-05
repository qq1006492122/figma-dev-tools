/**
 * Figma URL 解析工具
 *
 * 提供 Figma 设计链接的解析、构建和验证功能。
 * 支持从多种 Figma URL 格式中提取 fileKey 和 nodeId，
 * 以及根据 fileKey/nodeId 反向构建 URL。
 *
 * 支持的 URL 格式：
 * - https://www.figma.com/design/{fileKey}/{fileName}?node-id={nodeId}
 * - https://www.figma.com/file/{fileKey}/{fileName}?node-id={nodeId}
 * - https://www.figma.com/proto/{fileKey}/{fileName}?node-id={nodeId}
 * - https://www.figma.com/board/{fileKey}/{fileName}
 * - 直接传入 fileKey 字符串（22+ 位字母数字）
 *
 * @module
 */

import type { FigmaFileKey, FigmaNodeId, ParsedFigmaUrl } from '../types.js';

/**
 * 解析 Figma URL，提取文件 Key、节点 ID 等信息
 *
 * 支持的 URL 路径前缀：/design/, /file/, /proto/, /board/
 * node-id 参数格式：Figma URL 中使用 "-" 分隔（如 "23-11032"），
 * 解析后自动转换为 API 使用的 ":" 分隔格式（如 "23:11032"）。
 *
 * @param url - Figma 设计链接或直接传入的 fileKey 字符串
 * @returns 解析结果对象，包含 fileKey、nodeId、fileName 等字段
 *
 * @example
 * ```typescript
 * const result = parseFigmaUrl('https://www.figma.com/design/abc123/MyDesign?node-id=23-11032');
 * // result.fileKey === 'abc123'
 * // result.nodeId === '23:11032'
 * // result.fileName === 'MyDesign'
 * // result.isDesignUrl === true
 * ```
 *
 * @example
 * ```typescript
 * // 直接传入 fileKey
 * const result = parseFigmaUrl('abcdefghij1234567890AB');
 * // result.fileKey === 'abcdefghij1234567890AB'
 * // result.isDesignUrl === true
 * ```
 *
 * 边界情况：
 * - 传入无效 URL 且不是合法 fileKey：返回 fileKey 为空字符串
 * - URL 中没有 node-id 参数：nodeId 为 undefined
 * - URL 包含特殊字符的文件名：自动进行 URL 解码
 * - 非 figma.com 域名：尝试作为 fileKey 处理
 */
export function parseFigmaUrl(url: string): ParsedFigmaUrl {
  const result: ParsedFigmaUrl = {
    fileKey: '',
    nodeId: undefined,
    fileName: undefined,
    isDesignUrl: false,
    isComponentUrl: false,
  };

  try {
    const urlObj = new URL(url);

    if (!urlObj.hostname.includes('figma.com')) {
      throw new Error('Not a valid Figma URL');
    }

    const pathParts = urlObj.pathname.split('/').filter(Boolean);

    let fileKeyIndex = -1;
    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];
      if (part === 'design' || part === 'file' || part === 'proto' || part === 'board') {
        fileKeyIndex = i + 1;
        result.isDesignUrl = part === 'design' || part === 'file';
        break;
      }
    }

    if (fileKeyIndex >= 0) {
      const keyPart = pathParts[fileKeyIndex];
      if (keyPart) {
        result.fileKey = keyPart as FigmaFileKey;
      }
    }

    if (fileKeyIndex >= 0) {
      const namePart = pathParts[fileKeyIndex + 1];
      if (namePart) {
        result.fileName = decodeURIComponent(namePart);
      }
    }

    const nodeIdParam = urlObj.searchParams.get('node-id');
    if (nodeIdParam) {
      // Figma URL 中使用 "-" 替代所有 ":"，全局替换（支持多层嵌套节点 ID 如 "1547-6316-100" → "1547:6316:100"）
      result.nodeId = nodeIdParam.replace(/-/g, ':') as FigmaNodeId;
    }

    result.isComponentUrl = url.includes('component') || result.nodeId !== undefined;

    if (!result.fileKey) {
      const fileKeyParam = urlObj.searchParams.get('file-key');
      if (fileKeyParam) {
        result.fileKey = fileKeyParam as FigmaFileKey;
      }
    }
  } catch {
    if (/^[a-zA-Z0-9]{22,}$/.test(url.trim())) {
      result.fileKey = url.trim() as FigmaFileKey;
      result.isDesignUrl = true;
    }
  }

  return result;
}

/**
 * 从 Figma URL 中提取 fileKey（便捷方法）
 *
 * @param url - Figma 设计链接或 fileKey 字符串
 * @returns Figma 文件 Key，如果解析失败返回空字符串
 *
 * @example
 * ```typescript
 * const key = extractFileKey('https://www.figma.com/design/abc123/MyDesign');
 * // key === 'abc123'
 * ```
 */
export function extractFileKey(url: string): FigmaFileKey | '' {
  const parsed = parseFigmaUrl(url);
  return parsed.fileKey;
}

/**
 * 从 Figma URL 中提取 nodeId（便捷方法）
 *
 * @param url - Figma 设计链接
 * @returns Figma 节点 ID（冒号分隔格式，如 "23:11032"），URL 中没有节点参数时返回 undefined
 *
 * @example
 * ```typescript
 * const nodeId = extractNodeId('https://www.figma.com/design/abc123/MyDesign?node-id=23-11032');
 * // nodeId === '23:11032'
 * ```
 */
export function extractNodeId(url: string): FigmaNodeId | undefined {
  const parsed = parseFigmaUrl(url);
  return parsed.nodeId;
}

/**
 * 根据 fileKey 和可选的 nodeId 构建 Figma 设计链接
 *
 * 构建的链接使用 /design/ 路径格式，nodeId 会自动转换为 URL 中使用的 "-" 分隔格式。
 *
 * @param fileKey - Figma 文件 Key
 * @param nodeId - 节点 ID（冒号分隔格式，如 "23:11032"）
 * @param fileName - 文件名称（可选，默认 "Untitled"）
 * @returns 完整的 Figma 设计链接
 *
 * @example
 * ```typescript
 * const url = buildFigmaUrl('abc123', '23:11032', 'MyDesign');
 * // url === 'https://www.figma.com/design/abc123/MyDesign?node-id=23-11032'
 * ```
 */
export function buildFigmaUrl(fileKey: FigmaFileKey, nodeId?: FigmaNodeId, fileName?: string): string {
  const baseUrl = 'https://www.figma.com/design';
  const name = fileName || 'Untitled';
  let url = `${baseUrl}/${fileKey}/${encodeURIComponent(name)}`;

  if (nodeId) {
    // 全局替换 ":" 为 "-"（支持多层嵌套节点 ID）
    const urlNodeId = nodeId.replace(/:/g, '-');
    url += `?node-id=${urlNodeId}`;
  }

  return url;
}

/**
 * 验证 Figma fileKey 格式是否有效
 *
 * Figma fileKey 通常是 20 个以上字符的字母数字组合。
 * 注意：此方法仅验证格式，不验证 Key 是否真实存在或有权访问。
 *
 * @param fileKey - 待验证的文件 Key
 * @returns 如果格式合法返回 true，否则返回 false
 *
 * @example
 * ```typescript
 * isValidFileKey('abcdefghij1234567890AB'); // true
 * isValidFileKey('short'); // false
 * isValidFileKey(''); // false
 * ```
 */
export function isValidFileKey(fileKey: string): fileKey is FigmaFileKey {
  return /^[a-zA-Z0-9]{20,}$/.test(fileKey);
}
