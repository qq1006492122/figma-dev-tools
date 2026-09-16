/**
 * MCP stdio 协议测试线束（Test Harness）
 *
 * 以子进程方式启动真实的 `dist/cli/index.js mcp` 入口，通过 stdin/stdout
 * 按 MCP stdio 传输约定（每行一条 JSON-RPC 消息，换行分隔）驱动完整握手：
 *
 *   initialize → notifications/initialized → tools/list → tools/call
 *
 * 设计要点：
 * - 与生产完全相同的入口，不 import 源码内部模块，避免绕过真实协议层；
 * - 每个请求独立超时，进程异常退出时统一 reject，杜绝挂死；
 * - stderr 仅收集到缓冲区，便于失败时排查，不污染测试输出。
 *
 * 运行前提：先执行 `npm run build`。dist 缺失时 {@link McpTestHarness.start}
 * 会抛出带修复提示的错误。
 *
 * @packageDocumentation
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/** MCP 协议版本（与 @modelcontextprotocol/sdk 2024-11-05 版一致） */
const MCP_PROTOCOL_VERSION = '2024-11-05';

/** JSON-RPC 2.0 错误对象 */
export interface JsonRpcError {
  /** 错误码 */
  readonly code: number;
  /** 错误消息 */
  readonly message: string;
  /** 可选附加数据 */
  readonly data?: unknown;
}

/** initialize 结果中的服务信息 */
export interface McpServerInfo {
  /** 服务名 */
  readonly name: string;
  /** 服务版本 */
  readonly version: string;
}

/** tools/list 返回的工具描述（仅断言所需字段） */
export interface McpToolDescriptor {
  /** 工具名 */
  readonly name: string;
  /** 工具描述 */
  readonly description?: string;
  /** 入参 JSON Schema */
  readonly inputSchema?: unknown;
  /** 工具注解 */
  readonly annotations?: Readonly<Record<string, unknown>>;
}

/** tools/call 返回内容条目 */
export interface McpContentItem {
  /** 内容类型 */
  readonly type: string;
  /** 文本内容（text 类型时） */
  readonly text?: string;
  /** 其余字段按类型变化 */
  readonly [key: string]: unknown;
}

/** tools/call 的返回结果 */
export interface McpCallResult {
  /** 内容条目 */
  readonly content?: readonly McpContentItem[];
  /** 是否为工具级错误（协议层成功但业务报错） */
  readonly isError?: boolean;
  /** 其余字段 */
  readonly [key: string]: unknown;
}

/** 待决请求表项 */
interface PendingRequest {
  /** 成功回调 */
  readonly resolve: (result: unknown) => void;
  /** 失败回调 */
  readonly reject: (error: Error) => void;
  /** 超时计时器 */
  readonly timer: ReturnType<typeof setTimeout>;
}

/** harness 启动选项 */
export interface McpHarnessOptions {
  /** 单请求超时毫秒数，默认 15000 */
  readonly requestTimeoutMs?: number;
  /** 注入的子进程环境变量（默认继承当前进程） */
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * MCP stdio 测试客户端
 */
export class McpTestHarness {
  /** MCP 服务子进程 */
  private child: ChildProcessWithoutNullStreams | null = null;

  /** stdout 行缓冲（不完整的最后一行） */
  private lineBuffer = '';

  /** 自增 JSON-RPC ID */
  private nextId = 1;

  /** 待决请求映射（id → resolver） */
  private readonly pending = new Map<number, PendingRequest>();

  /** 已收集的 stderr 文本 */
  private stderrText = '';

  /** 单请求超时毫秒数 */
  private readonly requestTimeoutMs: number;

  /** 启动时注入的环境变量 */
  private readonly extraEnv: NodeJS.ProcessEnv;

  constructor(options: McpHarnessOptions = {}) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15000;
    this.extraEnv = options.env ?? {};
  }

  /**
   * 启动子进程并完成 MCP initialize 握手
   *
   * @returns initialize 返回的 serverInfo
   */
  async start(): Promise<McpServerInfo> {
    // test/smoke/mcp-harness.js → 项目根目录
    const here = path.dirname(fileURLToPath(import.meta.url));
    const projectRoot = path.resolve(here, '..', '..');
    const cliEntry = path.join(projectRoot, 'dist', 'cli', 'index.js');
    if (!fs.existsSync(cliEntry)) {
      throw new Error(
        `MCP 冒烟测试入口不存在：${cliEntry}。请先执行 "npm run build" 再运行 test:smoke。`,
      );
    }
    this.child = spawn(process.execPath, [cliEntry, 'mcp'], {
      cwd: projectRoot,
      env: { ...process.env, ...this.extraEnv },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => this.handleStdout(chunk));
    this.child.stderr.on('data', (chunk: string) => {
      this.stderrText += chunk;
    });
    this.child.on('error', (error) => this.failAll(new Error(`MCP 子进程启动失败：${error.message}`)));
    this.child.on('exit', (code, signal) => {
      this.failAll(
        new Error(`MCP 子进程提前退出（code=${code ?? 'null'}, signal=${signal ?? 'null'}）。stderr：${this.stderrText}`),
      );
    });

    const initResult = (await this.request('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'figma-dev-smoke-harness', version: '1.0.0' },
    })) as { serverInfo?: McpServerInfo; protocolVersion?: string };
    this.notify('notifications/initialized', {});
    if (!initResult.serverInfo) {
      throw new Error('initialize 响应缺少 serverInfo 字段');
    }
    return initResult.serverInfo;
  }

  /**
   * 调用 tools/list
   *
   * @returns 工具描述数组（保持服务端注册顺序）
   */
  async listTools(): Promise<readonly McpToolDescriptor[]> {
    const result = (await this.request('tools/list', {})) as { tools?: readonly McpToolDescriptor[] };
    return result.tools ?? [];
  }

  /**
   * 调用 tools/call
   *
   * @param name 工具名
   * @param args 工具入参
   * @returns 工具返回结果
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<McpCallResult> {
    return (await this.request('tools/call', { name, arguments: args })) as McpCallResult;
  }

  /**
   * 获取已收集的 stderr 文本（失败诊断用）
   *
   * @returns stderr 全文
   */
  getStderr(): string {
    return this.stderrText;
  }

  /**
   * 关闭子进程并清理资源
   *
   * @returns 进程退出完成
   */
  async close(): Promise<void> {
    const child = this.child;
    if (child === null) {
      return;
    }
    this.child = null;
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
    }
    this.pending.clear();
    await new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      child.kill();
      // 兜底：500ms 后无论是否退出都释放（Windows 下句柄延迟场景）
      setTimeout(resolve, 500).unref();
    });
  }

  /**
   * 处理 stdout 数据块，按换行切分 JSON-RPC 消息
   *
   * @param chunk 数据块
   */
  private handleStdout(chunk: string): void {
    this.lineBuffer += chunk;
    let newlineIndex = this.lineBuffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const rawLine = this.lineBuffer.slice(0, newlineIndex).trim();
      this.lineBuffer = this.lineBuffer.slice(newlineIndex + 1);
      if (rawLine.length > 0) {
        this.dispatchLine(rawLine);
      }
      newlineIndex = this.lineBuffer.indexOf('\n');
    }
  }

  /**
   * 解析并分发一条 JSON-RPC 响应
   *
   * @param rawLine 单行 JSON
   */
  private dispatchLine(rawLine: string): void {
    let message: { id?: unknown; result?: unknown; error?: JsonRpcError };
    try {
      message = JSON.parse(rawLine) as { id?: unknown; result?: unknown; error?: JsonRpcError };
    } catch {
      // 非 JSON 行（如意外日志）忽略，避免单条脏数据导致整个进程挂起
      return;
    }
    if (typeof message.id !== 'number') {
      return;
    }
    const pending = this.pending.get(message.id);
    if (pending === undefined) {
      return;
    }
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.error !== undefined) {
      pending.reject(new Error(`JSON-RPC 错误 ${message.error.code}：${message.error.message}`));
    } else {
      pending.resolve(message.result);
    }
  }

  /**
   * 发送一条 JSON-RPC 请求并等待响应
   *
   * @param method MCP 方法名
   * @param params 参数
   * @returns result 字段
   */
  private request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const child = this.child;
    if (child === null) {
      return Promise.reject(new Error('MCP harness 尚未 start()'));
    }
    const id = this.nextId;
    this.nextId += 1;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) {
          reject(new Error(`MCP 请求超时（${this.requestTimeoutMs}ms）：${method}。stderr：${this.stderrText}`));
        }
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  /**
   * 发送一条 JSON-RPC 通知（无 ID、无响应）
   *
   * @param method 通知方法名
   * @param params 参数
   */
  private notify(method: string, params: Record<string, unknown>): void {
    this.child?.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  /**
   * 以错误结束全部待决请求（进程退出/启动失败场景）
   *
   * @param error 错误对象
   */
  private failAll(error: Error): void {
    const items = Array.from(this.pending.values());
    this.pending.clear();
    for (const item of items) {
      clearTimeout(item.timer);
      item.reject(error);
    }
  }
}

/**
 * 启动一个完成握手的 MCP harness（测试 beforeAll 便捷方法）
 *
 * @param options 启动选项
 * @returns 已完成 initialize 的 harness
 */
export async function startMcpHarness(options?: McpHarnessOptions): Promise<McpTestHarness> {
  const harness = new McpTestHarness(options);
  await harness.start();
  return harness;
}
