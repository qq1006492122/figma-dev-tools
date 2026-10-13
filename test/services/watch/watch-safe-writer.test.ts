/**
 * WBS-P1-23 安全写盘器 + preserve 区块合并测试（真实临时目录，无网络）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  extractPreserveRegions,
  mergePreserve,
  writeGeneratedFiles,
  PRESERVE_START,
} from '../../../src/services/watch/watch-safe-writer.js';

let tmpRoot: string;
beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fdt-watch-write-'));
});
afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('WBS-P1-23 preserve 区块（按语言注释语法）', () => {
  it('JS/TS：提取与回填命名 preserve 区块', () => {
    const oldCode = [
      'const a = 1;',
      `// ${PRESERVE_START} custom-handlers`,
      'function userCode() { return 42; }',
      '// figma-dev:preserve:end custom-handlers',
      'const b = 2;',
    ].join('\n');
    const regions = extractPreserveRegions(oldCode, 'ts');
    expect(regions.get('custom-handlers')).toContain('function userCode()');

    const generated = [
      'const a = 11;',
      `// ${PRESERVE_START} custom-handlers`,
      '// figma-dev:preserve:end custom-handlers',
      'const b = 22;',
    ].join('\n');
    const merged = mergePreserve(generated, regions, 'ts');
    expect(merged).toContain('function userCode() { return 42; }');
    expect(merged).toContain('const a = 11;');
    expect(merged).not.toContain('const a = 1;');
  });

  it('Svelte/Vue/HTML：<!-- --> 标记；CSS/WXSS：/* */ 标记', () => {
    const svelteOld = `<!-- ${PRESERVE_START} notes -->\n<p>用户笔记</p>\n<!-- figma-dev:preserve:end notes -->`;
    const svelteRegions = extractPreserveRegions(svelteOld, 'svelte');
    expect(svelteRegions.get('notes')).toContain('用户笔记');

    const cssOld = `/* ${PRESERVE_START} overrides */\n.x { color: red; }\n/* figma-dev:preserve:end overrides */`;
    const cssRegions = extractPreserveRegions(cssOld, 'css');
    expect(cssRegions.get('overrides')).toContain('color: red');
  });

  it('新生成文件不含该区块标记时：区块追加到文件末尾（不丢失用户代码）', () => {
    const oldCode = `// ${PRESERVE_START} keep\nconst keep = 1;\n// figma-dev:preserve:end keep`;
    const regions = extractPreserveRegions(oldCode, 'js');
    const merged = mergePreserve('// fresh generated\nconst x = 0;', regions, 'js');
    expect(merged).toContain('const keep = 1;');
  });

  it('无旧区块时原样返回生成内容', () => {
    const out = mergePreserve('a', new Map(), 'ts');
    expect(out).toBe('a');
  });
});

describe('WBS-P1-23 安全写盘', () => {
  it('拒绝绝对路径与目录穿越（0 越权写入）', async () => {
    const result = await writeGeneratedFiles({
      root: tmpRoot,
      files: [
        { path: path.resolve(tmpRoot, 'outside-absolute.js'), content: 'x', lang: 'js' },
        { path: '../escape.js', content: 'x', lang: 'js' },
        { path: 'src/ok.js', content: 'ok', lang: 'js' },
      ],
    });
    expect(result.written.map((p) => p.replace(/\\/g, '/'))).toEqual(['src/ok.js']);
    expect(result.skipped).toHaveLength(2);
    expect(result.skipped.every((s) => /越权|traversal/i.test(s.reason))).toBe(true);
    expect(fs.existsSync(path.join(tmpRoot, 'src', 'ok.js'))).toBe(true);
  });

  it('覆盖前全量备份到 .figma-dev-backup/<时间戳>/，可从备份恢复', async () => {
    fs.mkdirSync(path.join(tmpRoot, 'src'), { recursive: true });
    const oldPath = path.join(tmpRoot, 'src', 'cmp.js');
    fs.writeFileSync(oldPath, 'OLD CONTENT');

    const result = await writeGeneratedFiles({
      root: tmpRoot,
      files: [{ path: 'src/cmp.js', content: 'NEW CONTENT', lang: 'js' }],
      now: () => 20261010120000,
    });
    expect(result.written).toHaveLength(1);
    expect(result.backedUp).toHaveLength(1);
    expect(fs.readFileSync(oldPath, 'utf8')).toBe('NEW CONTENT');
    const backupRel = result.backedUp[0]!;
    expect(fs.readFileSync(path.join(tmpRoot, backupRel), 'utf8')).toBe('OLD CONTENT');
  });

  it('preserve 区块在重写后保留（端到端）', async () => {
    fs.mkdirSync(path.join(tmpRoot), { recursive: true });
    const file = path.join(tmpRoot, 'cmp.js');
    fs.writeFileSync(
      file,
      [
        'const generated = "v1";',
        `// ${PRESERVE_START} my-logic`,
        'const user = "保留我";',
        '// figma-dev:preserve:end my-logic',
      ].join('\n'),
    );
    await writeGeneratedFiles({
      root: tmpRoot,
      files: [
        {
          path: 'cmp.js',
          content: [
            'const generated = "v2";',
            `// ${PRESERVE_START} my-logic`,
            '// figma-dev:preserve:end my-logic',
          ].join('\n'),
          lang: 'js',
        },
      ],
    });
    const content = fs.readFileSync(file, 'utf8');
    expect(content).toContain('const generated = "v2"');
    expect(content).toContain('const user = "保留我";');
  });

  it('preserve 标记不匹配（有 start 无 end）→ 合并失败时 fail-open 保留旧文件并报告', async () => {
    fs.writeFileSync(path.join(tmpRoot, 'bad.js'), `// ${PRESERVE_START} x\nconst a=1;`);
    const result = await writeGeneratedFiles({
      root: tmpRoot,
      files: [{ path: 'bad.js', content: '// fresh', lang: 'js' }],
    });
    expect(result.skipped[0]!.reason).toMatch(/preserve|标记/i);
    expect(fs.readFileSync(path.join(tmpRoot, 'bad.js'), 'utf8')).toContain('const a=1;');
  });
});

describe('WBS-P1-23 symlink/junction 与原子替换', () => {
  it('拒绝通过 junction 目录写到 root 之外', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'fdt-watch-outside-'));
    const link = path.join(tmpRoot, 'linked-output');
    fs.symlinkSync(outside, link, 'junction');

    try {
      const result = await writeGeneratedFiles({
        root: tmpRoot,
        files: [{ path: 'linked-output/escape.js', content: 'x', lang: 'js' }],
      });

      expect(result.written).toEqual([]);
      expect(result.skipped[0]?.reason).toMatch(/symlink\/junction/);
      expect(fs.existsSync(path.join(outside, 'escape.js'))).toBe(false);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('原子替换后不残留临时文件', async () => {
    fs.mkdirSync(path.join(tmpRoot, 'src'), { recursive: true });
    const target = path.join(tmpRoot, 'src', 'atomic.js');
    fs.writeFileSync(target, 'old');

    const result = await writeGeneratedFiles({
      root: tmpRoot,
      files: [{ path: 'src/atomic.js', content: 'new', lang: 'js' }],
    });

    expect(result.written).toEqual(['src/atomic.js']);
    expect(fs.readFileSync(target, 'utf8')).toBe('new');
    expect(fs.readdirSync(path.join(tmpRoot, 'src')).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});
