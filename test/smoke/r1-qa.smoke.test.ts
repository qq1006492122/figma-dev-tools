/**
 * WBS-R1 发布前 QA 自动化冒烟（v1.4.20）
 *
 * ROADMAP WBS-R1 的 6 个手工冒烟域中，可被自动化固化的部分在此长期回归：
 *
 * - GUI 新选项（P3-32 组件库选择器）：真实启动 HTTP 服务（不打开浏览器），
 *   验证 /api/status 暴露 componentLibrary、/api/config/complete 白名单与落盘、
 *   非法值不被原样写盘、none 省略字段、跨域 Origin 403、静态资源防目录穿越；
 * - React/Vue 回归（组件库部分）：CLI 子进程跨框架选择在触网前以
 *   FDT-UI-LIB-FRAMEWORK-MISMATCH 快速失败，未知库以 FDT-UI-LIB-UNKNOWN 失败。
 *
 * 仍需人工执行的项（微信开发者工具、Svelte dev、Watch 四框架实况、Compare 目检）
 * 见 docs/QA-R1-smoke-checklist.md。
 *
 * 运行：`npm run build && npm run test:smoke`（CLI 用例需要 dist 产物）。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startGuiServer } from '../../src/services/gui-server.js';

/** R1 冒烟固定端口（避开 54321 默认实例与开发机上的常驻 GUI） */
const R1_GUI_PORT = 54401;

const CLI_ENTRY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'dist',
  'cli',
  'index.js',
);

interface CliRunResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly elapsedMs: number;
}

function runCli(args: readonly string[], timeoutMs = 15000): Promise<CliRunResult> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(CLI_ENTRY)) {
      reject(new Error('CLI 冒烟入口不存在，请先执行 "npm run build"。'));
      return;
    }
    const startedAt = Date.now();
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
      resolve({ code, stdout, stderr, elapsedMs: Date.now() - startedAt });
    });
  });
}

describe('WBS-R1 / GUI 组件库选择器（真实 HTTP 服务）', () => {
  let server: Server;
  let tempCwd: string;
  let originalCwd: string;
  const base = `http://127.0.0.1:${R1_GUI_PORT}`;

  beforeAll(async () => {
    // GUI 配置/figma-dev.config.json 与 .env 均按 process.cwd() 落盘：
    // 切到一次性目录，保证冒烟不污染项目工作区（chdir 仅影响本 worker 进程）
    tempCwd = fs.mkdtempSync(path.join(tmpdir(), 'fdt-r1-gui-'));
    originalCwd = process.cwd();
    process.chdir(tempCwd);
    server = await startGuiServer({ port: R1_GUI_PORT, openBrowser: false });
  }, 30000);

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    process.chdir(originalCwd);
    fs.rmSync(tempCwd, { recursive: true, force: true });
  });

  it('服务仅绑定 127.0.0.1（不暴露局域网）', () => {
    const addr = server.address();
    expect(addr).not.toBeNull();
    expect(addr).toMatchObject({ address: '127.0.0.1', port: R1_GUI_PORT });
  });

  it('/api/status 返回结构含 config.componentLibrary 字段', async () => {
    const res = await fetch(`${base}/api/status`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success?: unknown; config?: Record<string, unknown> };
    expect(data.success).toBe(true);
    expect(data.config).toBeTypeOf('object');
    expect(typeof data.config?.componentLibrary).toBe('string');
  });

  it('首页 HTML 由服务端注入当前版本号（不再硬编码旧版本）', async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-version="1.4.20"');
    // 注入后标题携带真实版本（中文页默认语言），且不再残留占位符
    expect(html).toContain('配置向导 v1.4.20');
    expect(html).not.toContain('{{FIGMA_DEV_TOOLS_VERSION}}');
  });

  it('跨域 Origin 被 403 拒绝（白名单仅 localhost）', async () => {
    const res = await fetch(`${base}/api/status`, {
      headers: { Origin: 'http://evil.example.com' },
    });
    expect(res.status).toBe(403);
    const data = (await res.json()) as { error?: string };
    expect(data.error).toMatch(/localhost/i);
  });

  it('静态资源防目录穿越：编码 ../ 无法读出项目 package.json', async () => {
    const res = await fetch(`${base}/..%2f..%2f..%2fpackage.json`);
    expect([403, 404]).toContain(res.status);
    if (res.status === 200) throw new Error('目录穿越防护失效');
  });

  it('合法 react 组件库（shadcn-ui）经 complete 白名单并落盘', async () => {
    const res = await fetch(`${base}/api/config/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        framework: 'react',
        outputDir: './src/styles/figma',
        componentLibrary: 'shadcn-ui',
      }),
    });
    expect(res.status).toBe(200);
    const written = JSON.parse(
      fs.readFileSync(path.join(tempCwd, 'figma-dev.config.json'), 'utf-8'),
    ) as Record<string, unknown>;
    expect(written.componentLibrary).toBe('shadcn-ui');
  });

  it('非法组件库值不会原样落盘（白名单降级为 auto）', async () => {
    const res = await fetch(`${base}/api/config/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        framework: 'react',
        outputDir: './x',
        componentLibrary: 'bootstrap-ui',
      }),
    });
    expect(res.status).toBe(200);
    const written = JSON.parse(
      fs.readFileSync(path.join(tempCwd, 'figma-dev.config.json'), 'utf-8'),
    ) as Record<string, unknown>;
    expect(written.componentLibrary).toBe('auto');
    expect(written.componentLibrary).not.toBe('bootstrap-ui');
  });

  it('vue + element-plus 可正常写盘；none 时省略 componentLibrary 字段', async () => {
    const resVue = await fetch(`${base}/api/config/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        framework: 'vue',
        outputDir: './x',
        componentLibrary: 'element-plus',
      }),
    });
    expect(resVue.status).toBe(200);
    const writtenVue = JSON.parse(
      fs.readFileSync(path.join(tempCwd, 'figma-dev.config.json'), 'utf-8'),
    ) as Record<string, unknown>;
    expect(writtenVue.componentLibrary).toBe('element-plus');

    const resNone = await fetch(`${base}/api/config/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ framework: 'react', outputDir: './x', componentLibrary: 'none' }),
    });
    expect(resNone.status).toBe(200);
    const writtenNone = JSON.parse(
      fs.readFileSync(path.join(tempCwd, 'figma-dev.config.json'), 'utf-8'),
    ) as Record<string, unknown>;
    expect(writtenNone).not.toHaveProperty('componentLibrary');
  });
});

describe('WBS-R1 / CLI 组件库闸门（子进程，触网前失败）', () => {
  const FAKE_TARGET = 'https://www.figma.com/design/abc123/QA-Smoke?node-id=1-2';

  it('react 管线选择 Vue 库 → FDT-UI-LIB-FRAMEWORK-MISMATCH、非 0 退出且秒级失败（不触网）', async () => {
    const result = await runCli(['batch', FAKE_TARGET, '--component-library', 'element-plus']);
    const combined = `${result.stdout}\n${result.stderr}`;
    expect(result.code).not.toBe(0);
    expect(combined).toContain('FDT-UI-LIB-FRAMEWORK-MISMATCH');
    // 触网前失败：宽松上界 10s，正常机器 <1s
    expect(result.elapsedMs).toBeLessThan(10000);
  });

  it('未知组件库名 → FDT-UI-LIB-UNKNOWN、非 0 退出', async () => {
    const result = await runCli(['batch', FAKE_TARGET, '--component-library', 'made-up-ui']);
    const combined = `${result.stdout}\n${result.stderr}`;
    expect(result.code).not.toBe(0);
    expect(combined).toContain('FDT-UI-LIB-UNKNOWN');
  });
});
