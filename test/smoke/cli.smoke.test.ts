/**
 * CLI 冒烟测试（v1.4.18 起三层测试之「冒烟层」）
 *
 * 对构建产物 `dist/cli/index.js` 做子进程级验证，不 mock 任何内部模块：
 *
 * 1. `--version` / `-V` 输出 package.json 版本且退出码 0；
 * 2. `--help` 输出用法与命令清单且退出码 0；
 * 3. 无参数干跑：打印用法提示并以退出码 1 结束（1.4.17 现状，不允许挂死）；
 * 4. 未知子命令：非 0 退出且给出错误提示，不允许挂死或静默成功。
 *
 * 运行：`npm run test:smoke`（前置 `npm run build`）。
 */
import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/** CLI 子进程执行结果 */
interface CliRunResult {
  /** 退出码（信号终止时为 null） */
  readonly code: number | null;
  /** 标准输出 */
  readonly stdout: string;
  /** 标准错误 */
  readonly stderr: string;
}

/** 冒烟用 CLI 入口绝对路径（test/smoke → 项目根 → dist/cli/index.js） */
const CLI_ENTRY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'dist',
  'cli',
  'index.js',
);

/**
 * 以子进程执行一次 CLI
 *
 * @param args 命令行参数
 * @param timeoutMs 超时毫秒，默认 15000
 * @returns 退出码与输出
 */
function runCli(args: readonly string[], timeoutMs = 15000): Promise<CliRunResult> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(CLI_ENTRY)) {
      reject(new Error('CLI 冒烟入口不存在，请先执行 "npm run build"。'));
      return;
    }
    const child = spawn(process.execPath, [CLI_ENTRY, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`CLI 执行超时（${timeoutMs}ms）：${args.join(' ')}`));
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/**
 * 从项目根读取 package.json 版本
 *
 * @returns version 字段
 */
function readPackageVersion(): string {
  const pkgPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: unknown };
  if (typeof pkg.version !== 'string') {
    throw new Error('package.json 缺少 version 字段');
  }
  return pkg.version;
}

describe('CLI 冒烟：构建产物入口契约', () => {
  it('--version 输出 package.json 版本且退出码 0', async () => {
    const result = await runCli(['--version']);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(readPackageVersion());
  });

  it('-V 与 --version 等价', async () => {
    const result = await runCli(['-V']);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(readPackageVersion());
  });

  it('--help 输出用法、命令清单与主要子命令，退出码 0', async () => {
    const result = await runCli(['--help']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Usage: figma-dev');
    expect(result.stdout).toContain('Commands:');
    // 关键命令必须出现在帮助中
    for (const command of ['mcp', 'sync', 'jsx', 'wizard']) {
      expect(result.stdout, `帮助缺少命令：${command}`).toContain(command);
    }
  });

  it('无参数干跑：打印用法并以退出码 1 结束（不挂死）', async () => {
    const result = await runCli([]);
    expect(result.code).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain('Usage: figma-dev');
  });

  it('未知子命令：非 0 退出并给出错误提示（不挂死、不静默成功）', async () => {
    const result = await runCli(['__no_such_command__']);
    expect(result.code).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/unknown command|未知命令|error/i);
  });
});
