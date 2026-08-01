/**
 * Figma REST API 客户端
 *
 * 封装 Figma REST API 的所有调用，统一处理：
 * - HTTP 请求认证（X-Figma-Token 头部）
 * - 错误状态码映射为友好中文消息
 * - 响应数据类型转换
 * - 节点树遍历工具方法
 *
 * API 版本：v1
 * 官方文档：https://www.figma.com/developers/api
 */

// ============ 依赖导入 ============

import { create as axiosCreate, type AxiosInstance, type AxiosError } from 'axios';

import type {
  FigmaFileResponse,
  FigmaVariablesResponse,
  FigmaNode,
  FigmaComponent,
  FigmaStyle,
  FigmaPaint,
} from '../types.js';

// ============ 类型定义 ============

/**
 * Figma API 客户端配置选项
 */
export interface FigmaClientConfig {
  /** Figma Personal Access Token，从 https://www.figma.com/settings 获取 */
  accessToken: string;
  /** API 版本号，默认 v1 */
  apiVersion?: string;
  /** 请求超时时间（毫秒），默认 30000 */
  timeout?: number;
  /** 自定义 API Base URL，用于企业版或反向代理场景 */
  baseURL?: string;
}

/**
 * Figma API 错误响应结构
 */
export interface FigmaApiError {
  /** HTTP 状态码 */
  status: number;
  /** 错误消息 */
  message: string;
  /** Figma 原始错误描述 */
  err?: string;
}

/**
 * getFileNodes 方法的查询选项
 */
export interface GetFileNodesOptions {
  /** 要获取的节点 ID 列表，不传则返回文件中所有节点 */
  ids?: string[];
  /**
   * 返回节点树的深度
   * - -1：返回完整深度（默认）
   * - 0：仅返回根节点
   * - N：返回 N 层子节点
   */
  depth?: number;
  /** 几何数据输出格式，设为 'paths' 时返回矢量路径数据 */
  geometry?: 'paths';
  /** 插件数据返回级别 */
  plugin_data?: 'none' | 'shared' | 'all';
}

// ============ 常量定义 ============

/** 默认超时时间：30秒 */
const DEFAULT_TIMEOUT = 30_000;

/** 默认 API Base URL */
const DEFAULT_BASE_URL = 'https://api.figma.com';

// ============ FigmaClient 类 ============

/**
 * Figma REST API 客户端类
 *
 * 提供对 Figma REST API 的完整封装，方法分类：
 *
 * **文件/节点操作：**
 * - {@link getFile} 获取文件信息
 * - {@link getFileNodes} 批量获取节点
 * - {@link getNode} 获取单个节点
 *
 * **设计资源：**
 * - {@link getComponents} 获取文件中的组件
 * - {@link getComponentSets} 获取组件集
 * - {@link getStyles} 获取文件中的样式
 * - {@link getVariables} 获取本地变量（Variables API）
 *
 * **图片导出：**
 * - {@link getImages} 批量获取节点导出图片 URL
 * - {@link getImageFills} 获取图片填充资源映射
 * - {@link downloadImage} 下载图片到 Buffer
 *
 * **遍历工具：**
 * - {@link traverseNodes} 递归遍历节点树（可中止）
 * - {@link findNodesByType} 按类型查找节点
 * - {@link findNodesByName} 按名称查找节点（支持正则）
 *
 * **便捷样式提取：**
 * - {@link getSolidFill} 获取第一个有效 SOLID 填充
 * - {@link getSolidStroke} 获取第一个有效 SOLID 描边
 */
export class FigmaClient {
  /** Axios HTTP 客户端实例（已配置认证头部和错误拦截器） */
  private readonly _client: AxiosInstance;
  /** Figma Personal Access Token */
  private readonly _accessToken: string;

  /**
   * 构造函数 - 初始化 Figma API 客户端
   *
   * 创建 Axios 实例并配置：
   * 1. 基础 URL 和超时设置
   * 2. X-Figma-Token 认证头部
   * 3. 响应拦截器统一处理 HTTP 错误码
   *
   * @param config - 客户端配置选项
   * @throws {Error} 当 accessToken 为空时构造函数不会直接抛出，但后续 API 调用会返回 401
   */
  constructor(config: FigmaClientConfig) {
    this._accessToken = config.accessToken;

    this._client = axiosCreate({
      baseURL: config.baseURL || DEFAULT_BASE_URL,
      timeout: config.timeout || DEFAULT_TIMEOUT,
      headers: {
        'X-Figma-Token': config.accessToken,
        'Content-Type': 'application/json',
      },
    });

    // ============ 响应错误拦截器 ============
    // 将 HTTP 状态码映射为中文错误消息，便于上层理解和处理
    this._client.interceptors.response.use(
      (response) => response,
      (error: AxiosError<FigmaApiError>) => {
        if (error.response) {
          const { status, data } = error.response;
          let message = 'Figma API 请求失败';

          switch (status) {
            case 400:
              message = '请求参数错误，请检查 nodeId、fileKey 等参数格式';
              break;
            case 401:
              message = '认证失败，请检查 Figma Access Token 是否有效或已过期';
              break;
            case 403:
              message = '权限不足，该 Token 无法访问此文件（可能需要文件编辑权限）';
              break;
            case 404:
              message = '文件或节点不存在，请检查 fileKey/nodeId 是否正确';
              break;
            case 429:
              message = '请求频率超限（Rate Limit），请稍后重试或降低并发数';
              break;
            case 500:
              message = 'Figma 服务器内部错误，请稍后重试';
              break;
            default:
              message = data?.err || data?.message || `HTTP ${status} 错误`;
          }

          throw new Error(`Figma API Error (${status}): ${message}`);
        } else if (error.request) {
          // 请求已发出但未收到响应（网络问题、DNS 失败、超时等）
          throw new Error('Figma API 请求失败：网络连接错误或请求超时，请检查网络设置');
        } else {
          // 请求配置阶段出错
          throw new Error(`Figma API 请求失败：${error.message}`);
        }
      },
    );
  }

  // ============ 认证相关 ============

  /**
   * 获取当前配置的 Access Token
   *
   * @returns Figma Personal Access Token 字符串
   */
  getAccessToken(): string {
    return this._accessToken;
  }

  /**
   * 验证 Access Token 是否有效
   *
   * 通过调用 `/v1/me` 接口验证 Token 有效性。
   * 该接口返回当前用户信息，Token 无效时返回 401。
   *
   * @returns Token 有效返回 true，无效或网络错误返回 false
   */
  async validateToken(): Promise<boolean> {
    try {
      await this._client.get('/v1/me');
      return true;
    } catch {
      // 任何错误（401、网络错误等）都视为 Token 无效
      return false;
    }
  }

  // ============ 文件/节点获取 ============

  /**
   * 获取 Figma 文件的完整信息
   *
   * 返回文件的名称、最后修改时间、缩略图、完整节点树、组件库、样式库等。
   * 注意：当 depth=-1 时，大型文件的响应可能非常大（数 MB），建议指定 depth 控制返回深度。
   *
   * @param fileKey - Figma 文件 Key（从 URL 获取：`figma.com/file/<fileKey>/...`）
   * @param version - 文件版本号（可选，不传则返回最新版本）
   * @param depth - 节点树返回深度，-1 表示全部，2 表示返回两层
   * @returns Figma 文件响应对象
   * @throws {Error} 当 fileKey 无效或无权限时抛出 Figma API 错误
   */
  async getFile(fileKey: string, version?: string, depth?: number): Promise<FigmaFileResponse> {
    const params: Record<string, string | number> = {};
    if (version) params.version = version;
    if (depth !== undefined) params.depth = depth;

    const response = await this._client.get<FigmaFileResponse>(`/v1/files/${fileKey}`, {
      params,
    });

    return response.data;
  }

  /**
   * 批量获取文件中的特定节点
   *
   * 与 {@link getFile} 不同，此方法只返回指定 IDs 的节点，
   * 适合只需要部分节点数据的场景，可显著减少响应体积。
   *
   * @param fileKey - Figma 文件 Key
   * @param options - 节点查询选项（ids、depth、geometry 等）
   * @returns 按 nodeId 索引的节点数据映射
   */
  async getFileNodes(
    fileKey: string,
    options: GetFileNodesOptions = {},
  ): Promise<{ nodes: Record<string, { document: FigmaNode }> }> {
    const params: Record<string, string | number> = {};
    if (options.ids && options.ids.length > 0) {
      params.ids = options.ids.join(',');
    }
    if (options.depth !== undefined) params.depth = options.depth;
    if (options.geometry) params.geometry = options.geometry;
    if (options.plugin_data) params.plugin_data = options.plugin_data;

    const response = await this._client.get(`/v1/files/${fileKey}/nodes`, {
      params,
    });

    return response.data;
  }

  /**
   * 获取单个节点（便捷方法）
   *
   * 封装 getFileNodes，返回单个节点或 null。
   *
   * @param fileKey - Figma 文件 Key
   * @param nodeId - 节点 ID（格式如 "1:2"、"12:34"）
   * @param depth - 返回深度
   * @returns 找到的 FigmaNode，不存在返回 null
   */
  async getNode(fileKey: string, nodeId: string, depth?: number): Promise<FigmaNode | null> {
    const result = await this.getFileNodes(fileKey, {
      ids: [nodeId],
      depth,
    });

    const nodeData = result.nodes[nodeId];
    return nodeData?.document || null;
  }

  // ============ 组件与样式 ============

  /**
   * 获取文件中所有已发布的组件
   *
   * 返回文件组件库中所有 Component 的元数据（名称、描述、key 等），
   * 不包含组件的完整节点树。
   *
   * @param fileKey - Figma 文件 Key
   * @returns 组件 key 到组件元数据的映射
   */
  async getComponents(fileKey: string): Promise<Record<string, FigmaComponent>> {
    // 使用 depth=1 只获取顶层元数据，避免加载整个文件
    const file = await this.getFile(fileKey, undefined, 1);
    return file.components || {};
  }

  /**
   * 获取文件中所有已发布的样式（填充/文本/效果）
   *
   * @param fileKey - Figma 文件 Key
   * @returns 样式 key 到样式元数据的映射
   */
  async getStyles(fileKey: string): Promise<Record<string, FigmaStyle>> {
    const file = await this.getFile(fileKey, undefined, 1);
    return file.styles || {};
  }

  /**
   * 获取文件的本地变量（Variables）
   *
   * **注意：** 这是 Figma 的内部 API（未完全公开），可能随 Figma 更新变化。
   * 包含变量集合（Collections）、变量模式（Modes）、变量值和 codeSyntax 映射。
   * 如果文件未启用 Variables 或 Token 无权限，会抛出 403/404 错误。
   *
   * @param fileKey - Figma 文件 Key
   * @returns Variables 响应（包含 collections 和 variables）
   * @throws {Error} Variables API 不可用或无权限时抛出
   */
  async getVariables(fileKey: string): Promise<FigmaVariablesResponse> {
    const response = await this._client.get<FigmaVariablesResponse>(`/v1/files/${fileKey}/variables/local`);
    return response.data;
  }

  /**
   * 获取组件集（Component Sets）
   *
   * Component Set 是一组 Component 的容器（如按钮的 hover/pressed/disabled 状态集合）。
   *
   * @param fileKey - Figma 文件 Key
   * @returns 组件集列表（含 key、name、componentIds 等）
   */
  async getComponentSets(fileKey: string): Promise<{
    componentSets: Array<{
      key: string;
      name: string;
      description: string;
      componentIds: string[];
    }>;
  }> {
    const response = await this._client.get(`/v1/files/${fileKey}/component_sets`);
    return response.data;
  }

  // ============ 图片导出 ============

  /**
   * 批量获取节点导出图片的 URL
   *
   * Figma 服务端渲染节点并返回临时 CDN URL（有效期约 30 天），
   * 需要配合 {@link downloadImage} 或直接使用 `<img src={url}>` 展示。
   *
   * @param fileKey - Figma 文件 Key
   * @param nodeIds - 要导出的节点 ID 列表
   * @param format - 导出格式：jpg / png / svg / pdf
   * @param scale - 导出倍率（1-4），2x 适合 Retina 屏幕
   * @param useAbsoluteBounds - 是否使用绝对边界（忽略裁剪和旋转）
   * @returns 按 nodeId 索引的图片 URL 映射，失败的节点值为 null
   */
  async getImages(
    fileKey: string,
    nodeIds: string[],
    format: 'jpg' | 'png' | 'svg' | 'pdf' = 'png',
    scale: number = 2,
    useAbsoluteBounds: boolean = false,
  ): Promise<{ images: Record<string, string | null>; err?: string }> {
    const params: Record<string, string | number | boolean> = {
      ids: nodeIds.join(','),
      format,
      scale,
    };

    if (useAbsoluteBounds) {
      params.use_absolute_bounds = true;
    }

    const response = await this._client.get<{ images: Record<string, string | null>; err?: string }>(
      `/v1/images/${fileKey}`,
      { params },
    );

    return response.data;
  }

  /**
   * 获取文件中所有图片填充的 URL 映射
   *
   * 当节点使用 IMAGE 填充时，fill.imageRef 指向的图片可以通过此接口获取下载 URL。
   *
   * @param fileKey - Figma 文件 Key
   * @returns imageRef 到图片 URL 的映射
   */
  async getImageFills(fileKey: string): Promise<{ images: Record<string, string> }> {
    const response = await this._client.get<{ images: Record<string, string> }>(`/v1/files/${fileKey}/images`);
    return response.data;
  }

  /**
   * 下载图片到内存 Buffer
   *
   * 用于将 {@link getImages} 返回的 URL 下载到本地保存。
   * 注意：下载时不使用 Figma API Base URL，直接访问 CDN 地址。
   *
   * @param url - 图片 CDN URL（从 getImages 获取）
   * @returns 图片二进制数据 Buffer
   * @throws {Error} 下载失败（HTTP 错误、网络错误）时抛出
   */
  async downloadImage(url: string): Promise<Buffer> {
    const response = await this._client.get(url, {
      responseType: 'arraybuffer',
      baseURL: '', // 覆盖默认 baseURL，直接访问 CDN 绝对 URL
    });
    return Buffer.from(response.data as ArrayBuffer);
  }

  // ============ 节点遍历工具 ============

  /**
   * 递归遍历节点树
   *
   * 深度优先遍历，回调函数返回 false 可提前停止遍历（短路求值）。
   *
   * @param node - 起始根节点
   * @param callback - 对每个节点调用的回调函数，返回 false 停止遍历
   * @returns 遍历是否完整完成（false 表示被中止）
   *
   * @example
   * ```typescript
   * // 找到第一个名为 "Button" 的节点后停止
   * let found: FigmaNode | null = null;
   * client.traverseNodes(rootNode, (node) => {
   *   if (node.name === 'Button') {
   *     found = node;
   *     return false; // 停止遍历
   *   }
   * });
   * ```
   */
  traverseNodes(node: FigmaNode, callback: (node: FigmaNode) => boolean | void): boolean {
    const shouldContinue = callback(node);
    if (shouldContinue === false) return false;

    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        if (!this.traverseNodes(child, callback)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * 按节点类型查找所有匹配节点
   *
   * 支持单个类型或类型数组，可限制最大遍历深度。
   *
   * @param root - 搜索根节点
   * @param type - 要查找的节点类型（如 'FRAME'、'TEXT'），或类型数组
   * @param maxDepth - 最大深度，-1 表示无限制
   * @returns 匹配的节点数组（深度优先顺序）
   */
  findNodesByType(root: FigmaNode, type: FigmaNode['type'] | FigmaNode['type'][], maxDepth: number = -1): FigmaNode[] {
    const types = Array.isArray(type) ? type : [type];
    const results: FigmaNode[] = [];

    const traverse = (node: FigmaNode, depth: number): void => {
      if (types.includes(node.type)) {
        results.push(node);
      }

      // 达到最大深度时不再深入
      if (maxDepth >= 0 && depth >= maxDepth) return;

      if (node.children) {
        for (const child of node.children) {
          traverse(child, depth + 1);
        }
      }
    };

    traverse(root, 0);
    return results;
  }

  /**
   * 按节点名称正则匹配查找节点
   *
   * @param root - 搜索根节点
   * @param name - 名称模式（字符串会被转义为精确子串匹配，或直接传入 RegExp）
   * @param caseSensitive - 是否大小写敏感，默认 false（不敏感）
   * @returns 匹配的节点数组
   *
   * @example
   * ```typescript
   * // 查找名称含 "button" 的节点（不区分大小写）
   * const buttons = client.findNodesByName(page, 'button');
   * // 使用正则匹配
   * const headings = client.findNodesByName(page, /^Heading [1-6]$/, true);
   * ```
   */
  findNodesByName(root: FigmaNode, name: string | RegExp, caseSensitive: boolean = false): FigmaNode[] {
    const results: FigmaNode[] = [];
    // 字符串输入自动转义为正则表达式（避免特殊字符导致匹配异常）
    const nameRegex =
      typeof name === 'string'
        ? new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? '' : 'i')
        : name;

    this.traverseNodes(root, (node) => {
      if (nameRegex.test(node.name)) {
        results.push(node);
      }
    });

    return results;
  }

  // ============ 样式便捷方法 ============

  /**
   * 获取节点的第一个可见 SOLID 填充
   *
   * 遍历 fills 数组，跳过不可见填充和非 SOLID 类型，
   * 返回第一个有颜色值的纯色填充。
   *
   * @param node - Figma 节点
   * @returns SOLID 填充对象，没有有效填充返回 null
   */
  getSolidFill(node: FigmaNode): FigmaPaint | null {
    if (!node.fills) return null;

    for (const fill of node.fills) {
      // visible !== false 表示显式设置了 visible=false 的才跳过，undefined 视为可见
      if (fill.type === 'SOLID' && fill.visible !== false && fill.color) {
        return fill;
      }
    }

    return null;
  }

  /**
   * 获取节点的第一个可见 SOLID 描边
   *
   * @param node - Figma 节点
   * @returns SOLID 描边对象，没有有效描边返回 null
   */
  getSolidStroke(node: FigmaNode): FigmaPaint | null {
    if (!node.strokes) return null;

    for (const stroke of node.strokes) {
      if (stroke.type === 'SOLID' && stroke.visible !== false && stroke.color) {
        return stroke;
      }
    }

    return null;
  }
}

// ============ 工厂函数 ============

/**
 * 创建 FigmaClient 实例的工厂函数
 *
 * @param config - 客户端配置
 * @returns FigmaClient 实例
 */
export function createFigmaClient(config: FigmaClientConfig): FigmaClient {
  return new FigmaClient(config);
}
