/**
 * resolveSubcommandOutput 单测（WBS-R1：全局/子命令同名 --output 冲突回收）
 */
import { describe, expect, it } from 'vitest';

import { GLOBAL_OUTPUT_DEFAULT, resolveSubcommandOutput } from '../../src/cli/sub-output.js';

describe('resolveSubcommandOutput', () => {
  it('子命令自身取到值时优先（不被全局值覆盖）', () => {
    expect(resolveSubcommandOutput('./gen/X.tsx', './tokens')).toBe('./gen/X.tsx');
  });

  it('子命令缺失（commander 吞给父级）时回收全局袋中的非默认值——本 bug 的核心场景', () => {
    expect(resolveSubcommandOutput(undefined, '.qa-tmp/svelte/a.svelte')).toBe(
      '.qa-tmp/svelte/a.svelte',
    );
  });

  it('全局袋仅为默认 token 目录时不回收（否则会把目录路径当生成文件写入）', () => {
    expect(resolveSubcommandOutput(undefined, GLOBAL_OUTPUT_DEFAULT)).toBeUndefined();
    expect(resolveSubcommandOutput(undefined, './src/styles/figma')).toBeUndefined();
  });

  it('两边都未提供时返回 undefined，由调用方按命令语义兜底', () => {
    expect(resolveSubcommandOutput(undefined, undefined)).toBeUndefined();
  });

  it('空字符串不视为有效值', () => {
    expect(resolveSubcommandOutput('', './x')).toBe('./x');
    expect(resolveSubcommandOutput('', '')).toBeUndefined();
  });
});
