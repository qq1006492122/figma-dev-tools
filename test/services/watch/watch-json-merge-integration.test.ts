import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { writeGeneratedFiles } from '../../../src/services/watch/watch-safe-writer.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'fdt-json-merge-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('WBS-P1-24 JSON 旁路覆盖接入安全写盘', () => {
  it('按 *.figma.json 合并用户字段，并保留 generated 区域', async () => {
    await writeFile(path.join(dir, 'page.figma.json'), JSON.stringify({ '/navigationBarTitleText': '用户标题' }), 'utf8');
    const result = await writeGeneratedFiles({
      root: dir,
      files: [{ path: 'page.json', content: '{"navigationBarTitleText":"生成标题","window":{"background":"#fff"}}', lang: 'json' }],
    });
    expect(result.written).toEqual(['page.json']);
    const merged = JSON.parse(await readFile(path.join(dir, 'page.json'), 'utf8'));
    expect(merged.navigationBarTitleText).toBe('用户标题');
    expect(merged.window.background).toBe('#fff');
  });

  it('非法旁路 JSON 不覆盖旧文件，报告原因', async () => {
    await writeFile(path.join(dir, 'bad.json'), '{"navigationBarTitleText":"old"}', 'utf8');
    await writeFile(path.join(dir, 'bad.figma.json'), '{bad', 'utf8');
    const result = await writeGeneratedFiles({
      root: dir,
      files: [{ path: 'bad.json', content: '{"navigationBarTitleText":"new"}', lang: 'json' }],
    });
    expect(result.written).toEqual([]);
    expect(result.skipped[0]?.reason).toMatch(/JSON|旁路|invalid/i);
    expect(JSON.parse(await readFile(path.join(dir, 'bad.json'), 'utf8')).navigationBarTitleText).toBe('old');
  });

  it('拒绝原型污染指针，保留旧文件', async () => {
    await writeFile(path.join(dir, 'proto.json'), '{"safe":true}', 'utf8');
    await writeFile(path.join(dir, 'proto.figma.json'), JSON.stringify({ '/__proto__/polluted': true }), 'utf8');
    const result = await writeGeneratedFiles({
      root: dir,
      files: [{ path: 'proto.json', content: '{"safe":false}', lang: 'json' }],
    });
    expect(result.written).toEqual(['proto.json']);
    expect(result.jsonOverrides[0]?.warnings[0]).toMatch(/危险|原型/);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(JSON.parse(await readFile(path.join(dir, 'proto.json'), 'utf8')).safe).toBe(false);
  });

  it('没有旁路文件时按生成内容写入', async () => {
    const result = await writeGeneratedFiles({
      root: dir,
      files: [{ path: 'plain.json', content: '{"a":1}', lang: 'json' }],
    });
    expect(result.written).toEqual(['plain.json']);
    expect(JSON.parse(await readFile(path.join(dir, 'plain.json'), 'utf8'))).toEqual({ a: 1 });
  });
});
