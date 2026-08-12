/**
 * Watch 模式服务 - Watch Mode (v1.4.0 新增)
 *
 * 轮询 Figma 文件 lastModified，检测变更后自动重新生成代码：
 * 1. 定期调用 Figma API getFile 获取 lastModified
 * 2. 与缓存的时间戳对比，检测变更
 * 3. 变更后触发完整代码生成流程
 * 4. 输出变更日志
 *
 * v1: 轮询模式（基础版），后续可升级为 Webhook
 *
 * @module
 */

import type { GeneratedComponent } from '../types.js';
import type { CodeGenerator } from './code-generator.js';
import type { DesignContextService } from './design-context.js';
import type { FigmaClient } from './figma-client.js';
import type { FileWriter } from './file-writer.js';

// ============ 类型定义 ============

/**
 * Watch 配置
 */
export interface WatchOptions {
  /** Figma 文件 Key */
  fileKey: string;
  /** 要监听的节点 ID 列表 */
  nodeIds: string[];
  /** 轮询间隔（毫秒），默认 5000ms */
  pollIntervalMs?: number;
  /** 输出目录 */
  outputDir: string;
  /** 组件名称前缀 */
  componentPrefix?: string;
  /** 变更回调 */
  onChange?: (result: WatchChangeResult) => void;
  /** 错误回调 */
  onError?: (error: Error) => void;
  /** 是否立即执行一次生成 */
  runImmediately?: boolean;
}

/**
 * 单次变更结果
 */
export interface WatchChangeResult {
  /** 文件 Key */
  fileKey: string;
  /** 节点 ID */
  nodeId: string;
  /** 旧的 lastModified */
  oldModifiedAt: string | null;
  /** 新的 lastModified */
  newModifiedAt: string;
  /** 生成的文件路径 */
  generatedFiles: string[];
  /** 耗时（ms） */
  durationMs: number;
}

/**
 * Watch 状态
 */
export type WatchStatus = 'idle' | 'running' | 'stopped' | 'error';

// ============ WatchMode 类 ============

/**
 * Watch 模式控制器
 */
export class WatchMode {
  /** Figma 客户端 */
  private _client: FigmaClient;
  /** DesignContext 服务 */
  private _designContext: DesignContextService;
  /** 代码生成器 */
  private _codeGenerator: CodeGenerator;
  /** 文件写入器 */
  private _fileWriter: FileWriter;
  /** 定时器 handle */
  private _timer: ReturnType<typeof setInterval> | null = null;
  /** 状态 */
  private _status: WatchStatus = 'idle';
  /** 每个节点最后一次的 lastModified 缓存 */
  private _lastModifiedCache = new Map<string, string>();
  /** 配置 */
  private _options!: Required<Omit<WatchOptions, 'onChange' | 'onError'>> & {
    onChange?: WatchOptions['onChange'];
    onError?: WatchOptions['onError'];
  };
  /** 是否正在执行生成（防止重入） */
  private _isGenerating = false;

  constructor(
    client: FigmaClient,
    designContext: DesignContextService,
    codeGenerator: CodeGenerator,
    fileWriter: FileWriter,
  ) {
    this._client = client;
    this._designContext = designContext;
    this._codeGenerator = codeGenerator;
    this._fileWriter = fileWriter;
  }

  /**
   * 启动 Watch 模式
   */
  start(options: WatchOptions): void {
    if (this._status === 'running') {
      this.stop();
    }

    this._options = {
      fileKey: options.fileKey,
      nodeIds: options.nodeIds,
      pollIntervalMs: options.pollIntervalMs ?? 5000,
      outputDir: options.outputDir,
      componentPrefix: options.componentPrefix ?? 'Figma',
      runImmediately: options.runImmediately ?? true,
      onChange: options.onChange,
      onError: options.onError,
    };

    this._status = 'running';
    this._lastModifiedCache.clear();

    console.log(`[Watch] Starting watch mode for file ${this._options.fileKey}`);
    console.log(`[Watch] Nodes: ${this._options.nodeIds.join(', ')}`);
    console.log(`[Watch] Poll interval: ${this._options.pollIntervalMs}ms`);

    // 立即执行一次
    if (this._options.runImmediately) {
      void this._checkAndGenerate(true);
    }

    // 启动轮询
    this._timer = setInterval(() => {
      void this._checkAndGenerate(false);
    }, this._options.pollIntervalMs);
  }

  /**
   * 停止 Watch 模式
   */
  stop(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._status = 'stopped';
    this._isGenerating = false;
    console.log('[Watch] Stopped');
  }

  /**
   * 获取当前状态
   */
  getStatus(): WatchStatus {
    return this._status;
  }

  /**
   * 检查并生成（核心逻辑）
   */
  private async _checkAndGenerate(isFirstRun: boolean): Promise<void> {
    if (this._isGenerating) return;
    this._isGenerating = true;

    try {
      // 获取文件元信息（depth=1 最小化数据传输，仍包含 lastModified）
      // 注意：必须在循环外获取，同一文件的 lastModified 对所有节点相同
      const fileMeta = await this._client.getFile(this._options.fileKey, undefined, 1);
      const newModifiedAt = fileMeta.lastModified;

      for (const nodeId of this._options.nodeIds) {
        const startTime = Date.now();

        const oldModifiedAt = this._lastModifiedCache.get(nodeId) ?? null;

        const hasChanged = isFirstRun || oldModifiedAt !== newModifiedAt;

        if (hasChanged) {
          console.log(
            isFirstRun
              ? `[Watch] Initial generation for ${nodeId}...`
              : `[Watch] Change detected for ${nodeId} (${oldModifiedAt} → ${newModifiedAt})`,
          );

          // 获取完整 DesignContext
          const context = await this._designContext.getDesignContext(this._options.fileKey, nodeId);

          const componentName = this._deriveComponentName(nodeId);

          // 生成代码
          const genResult = await this._codeGenerator.generateJsxFromContext(context, {
            componentName,
          });

          // 转换为 GeneratedComponent 格式
          const component: GeneratedComponent = {
            name: genResult.componentName,
            code: genResult.code,
            dependencies: Array.from(genResult.imports),
            tokensUsed: [],
          };

          // 写入文件
          const generatedFiles = await this._fileWriter.writeComponent(component, this._options.outputDir);

          const durationMs = Date.now() - startTime;

          const changeResult: WatchChangeResult = {
            fileKey: this._options.fileKey,
            nodeId,
            oldModifiedAt,
            newModifiedAt,
            generatedFiles,
            durationMs,
          };

          this._lastModifiedCache.set(nodeId, newModifiedAt);

          console.log(`[Watch] Generated ${generatedFiles.length} files in ${durationMs}ms`);
          generatedFiles.forEach((f) => console.log(`[Watch]   - ${f}`));

          this._options.onChange?.(changeResult);
        }
      }
    } catch (err) {
      this._status = 'error';
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('[Watch] Error:', error.message);
      this._options.onError?.(error);
      // 不终止，继续轮询
      this._status = 'running';
    } finally {
      this._isGenerating = false;
    }
  }

  /**
   * 从节点 ID 推导组件名
   */
  private _deriveComponentName(nodeId: string): string {
    // 将节点 ID 中的特殊字符替换，生成合法标识符
    const safeId = nodeId.replace(/[^a-zA-Z0-9]/g, '');
    return `${this._options.componentPrefix}${safeId.slice(0, 8)}`;
  }
}

// ============ 工厂函数 ============

/**
 * 创建 WatchMode 实例
 */
export function createWatchMode(
  client: FigmaClient,
  designContext: DesignContextService,
  codeGenerator: CodeGenerator,
  fileWriter: FileWriter,
): WatchMode {
  return new WatchMode(client, designContext, codeGenerator, fileWriter);
}
