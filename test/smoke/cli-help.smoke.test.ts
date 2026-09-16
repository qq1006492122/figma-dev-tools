/**
 * 全量 CLI --help 冒烟（v1.4.18，T6 / TR-6.1）
 *
 * 每条命令/子命令在 zh-CN / en-US 两种语言下：
 * - `--help` 退出码为 0；
 * - 输出包含示例标记（中文「示例:」/ 英文「Examples:」）。
 * 两种语言各产出一份聚合快照（版本号归一化，避免发版即漂移）。
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import * as path from 'node:path';

const CLI_ENTRY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist/cli/index.js');

/** 需要覆盖的全部帮助路径（'' 表示根命令） */
const HELP_PATHS: readonly string[] = [
  '',
  'lang',
  'lang set',
  'lang list',
  'lang switch',
  'validate',
  'token',
  'token set',
  'token get',
  'token list',
  'token delete',
  'token default',
  'info',
  'sync',
  'component',
  'screenshot',
  'metadata',
  'lint',
  'structured',
  'jsx',
  'assets',
  'tutorial',
  'mcp',
  'wizard',
  'gui',
  'cache',
  'cache status',
  'cache clear',
  'privacy',
];

/** 版本号归一化，避免每次发版 help 快照整体漂移 */
function normalizeHelp(text: string): string {
  return text.replace(/\d+\.\d+\.\d+/g, 'X.Y.Z').replace(/\r\n/g, '\n');
}

/** 以指定语言执行某条命令的 --help，返回 stdout */
function runHelp(language: 'zh-CN' | 'en-US', commandPath: string): string {
  const args = ['-l', language, ...commandPath.split(' ').filter(Boolean), '--help'];
  return execFileSync(process.execPath, [CLI_ENTRY, ...args], {
    encoding: 'utf8',
    env: { ...process.env, NODE_NO_WARNINGS: '1', FORCE_COLOR: '0' },
  });
}

describe('TR-6.1 zh-CN 全命令 --help', () => {
  for (const commandPath of HELP_PATHS) {
    const label = commandPath || '(root)';
    it(`${label} 退出码 0 且含「示例:」标记`, () => {
      const stdout = runHelp('zh-CN', commandPath);
      expect(stdout).toContain('示例:');
    });
  }

  it('全部中文 help 聚合快照', () => {
    const all: Record<string, string> = {};
    for (const commandPath of HELP_PATHS) {
      all[commandPath || '(root)'] = normalizeHelp(runHelp('zh-CN', commandPath));
    }
    expect(all).toMatchSnapshot();
  });
});

describe('TR-6.1 en-US 全命令 --help', () => {
  it('every command exits 0 and contains "Examples:" marker', () => {
    for (const commandPath of HELP_PATHS) {
      const stdout = runHelp('en-US', commandPath);
      expect(
        stdout.includes('Examples:'),
        `help output of "${commandPath || '(root)'}" should contain Examples:`,
      ).toBe(true);
    }
  });

  it('aggregate English help snapshot', () => {
    const all: Record<string, string> = {};
    for (const commandPath of HELP_PATHS) {
      all[commandPath || '(root)'] = normalizeHelp(runHelp('en-US', commandPath));
    }
    expect(all).toMatchSnapshot();
  });
});
