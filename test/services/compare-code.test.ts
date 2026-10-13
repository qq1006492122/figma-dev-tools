/**
 * WBS-P1-31/32/33 代码差异对比测试
 * 覆盖：added/removed/changed/unchanged、行级 stats、Prettier 归一化去噪、
 * 二进制拒绝、512KB 上限、路径越权、多文件汇总、1000 行性能。
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  compareCodes,
  compareCodesNormalized,
  createUnifiedDiff,
  normalizeCode,
  pairCompareFiles,
  readCompareFile,
  CompareError,
  COMPARE_LIMITS,
  type CompareInputFile,
} from '../../src/services/compare/compare-code.js';

describe('WBS-P1-31 行级 LCS unified diff', () => {
  it('新增行：+ 计数与 + 号行', () => {
    const diff = createUnifiedDiff('a', 'a\nb', 'x.ts');
    expect(diff).toContain('--- a/x.ts');
    expect(diff).toContain('+++ b/x.ts');
    expect(diff).toMatch(/^\+b$/m);
  });

  it('删除行：- 计数', () => {
    const diff = createUnifiedDiff('a\nb\nc', 'a\nc', 'x.ts');
    expect(diff).toMatch(/^-b$/m);
  });

  it('相同内容：空 diff', () => {
    expect(createUnifiedDiff('same', 'same', 'x.ts')).toBe('');
  });

  it('changed 文件 stats：added/removed 行计数', () => {
    const result = compareCodes([{ path: 'a.ts', current: 'a\nb', generated: 'a\nc\nd' }]);
    const f = result.files[0]!;
    expect(f.status).toBe('changed');
    expect(f.stats.removed).toBe(1);
    expect(f.stats.added).toBe(2);
    expect(result.summary.changed).toBe(1);
  });

  it('added（无现状）/ removed（无生成）状态', () => {
    const result = compareCodes([
      { path: 'new.ts', current: null, generated: 'console.log(1)' },
      { path: 'old.ts', current: 'dead code', generated: null },
    ]);
    expect(result.files[0]!.status).toBe('added');
    expect(result.files[1]!.status).toBe('removed');
    expect(result.summary.added).toBe(1);
    expect(result.summary.removed).toBe(1);
  });

  it('unchanged 计入 summary', () => {
    const result = compareCodes([{ path: 'a.ts', current: 'x', generated: 'x' }]);
    expect(result.files[0]!.status).toBe('unchanged');
    expect(result.summary.unchanged).toBe(1);
  });
});

describe('WBS-P1-32 Prettier 归一化', () => {
  it('仅格式差异（空格/换行）归一化后判 unchanged', async () => {
    const noisy = "import {x} from 'x';\nconst a={b:1}\n";
    const clean = "import { x } from 'x';\nconst a = { b: 1 };\n";
    const result = await compareCodesNormalized([{ path: 'a.ts', current: noisy, generated: clean }]);
    expect(result.files[0]!.status).toBe('unchanged');
  });

  it('parser 失败 fail-open：按原始文本对比（不抛错）', async () => {
    const broken = 'this is ((( not valid code !!!';
    const result = await compareCodesNormalized([{ path: 'a.txt', current: broken, generated: `${broken} x` }]);
    expect(result.files[0]!.status).toBe('changed');
  });

  it('normalizeCode 对未知扩展名返回原文', async () => {
    const out = await normalizeCode('a  b  c', 'a.weird');
    expect(out).toBe('a  b  c');
  });
});

describe('WBS-P1-33 安全与大输入', () => {
  it('总输入超 512KB → FDT-COMPARE-INPUT-TOO-LARGE', () => {
    const big = 'x'.repeat(COMPARE_LIMITS.maxTotalBytes + 1);
    expect(() => compareCodes([{ path: 'a.ts', current: big, generated: '' }])).toThrowError(
      expect.objectContaining({ code: 'FDT-COMPARE-INPUT-TOO-LARGE' }) as unknown as Error,
    );
  });

  it('NUL 字节嗅探为二进制 → FDT-COMPARE-BINARY-UNSUPPORTED', () => {
    expect(() => compareCodes([{ path: 'a.png', current: Buffer.from([0, 1, 2, 3]).toString('latin1'), generated: '' }])).toThrowError(
      expect.objectContaining({ code: 'FDT-COMPARE-BINARY-UNSUPPORTED' }) as unknown as Error,
    );
  });

  it('readCompareFile 拒绝目录穿越（FDT-COMPARE-PATH-TRAVERSAL）', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fdt-cmp-'));
    try {
      expect(() => readCompareFile(tmp, '../escape.txt')).toThrowError(
        expect.objectContaining({ code: 'FDT-COMPARE-PATH-TRAVERSAL' }) as unknown as Error,
      );
      expect(() => readCompareFile(tmp, path.resolve(tmp, 'abs.txt'))).toThrowError(
        expect.objectContaining({ code: 'FDT-COMPARE-PATH-TRAVERSAL' }) as unknown as Error,
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('readCompareFile 读取合法文件并嗅探文本', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fdt-cmp-'));
    try {
      fs.writeFileSync(path.join(tmp, 'a.ts'), 'const a = 1;');
      const r = readCompareFile(tmp, 'a.ts');
      expect(r.content).toBe('const a = 1;');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('WBS-P1-31 多文件与性能', () => {
  it('多文件汇总统计', () => {
    const files: CompareInputFile[] = [
      { path: 'a.ts', current: '1', generated: '1' },
      { path: 'b.ts', current: '1', generated: '2' },
      { path: 'c.ts', current: null, generated: 'new' },
    ];
    const result = compareCodes(files);
    expect(result.summary).toEqual({ files: 3, added: 1, removed: 0, changed: 1, unchanged: 1 });
  });

  it('1000 行文件 diff P95 < 100ms（跑 5 次取中位数）', () => {
    const oldLines = Array.from({ length: 1000 }, (_, i) => `line ${i}`);
    const newLines = oldLines.map((l, i) => (i % 50 === 0 ? `CHANGED ${i}` : l));
    const samples: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      compareCodes([{ path: 'big.ts', current: oldLines.join('\n'), generated: newLines.join('\n') }]);
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    expect(samples[2]!).toBeLessThan(100);
  });
});

describe('R1 QA 现状/生成文件配对（pairCompareFiles）', () => {
  it('currentCode 固定名 current.tsx 与组件名 Card.tsx → 按扩展名唯一配对为 changed 而非 added+removed', () => {
    const paired = pairCompareFiles(
      [{ path: 'current.tsx', content: 'old' }],
      [{ path: 'Card.tsx', content: 'new' }],
    );
    expect(paired).toHaveLength(1);
    expect(paired[0]).toMatchObject({ path: 'current.tsx', current: 'old', generated: 'new' });
    const r = compareCodes(paired);
    expect(r.summary.changed).toBe(1);
    expect(r.summary.added).toBe(0);
    expect(r.summary.removed).toBe(0);
  });

  it('内容一致（即便文件名不同）→ unchanged', () => {
    const paired = pairCompareFiles(
      [{ path: 'current.vue', content: 'same' }],
      [{ path: 'Button.vue', content: 'same' }],
    );
    expect(compareCodes(paired).summary.unchanged).toBe(1);
  });

  it('weapp 四件套：目录前缀不同但按扩展名 1:1 配对', () => {
    const paired = pairCompareFiles(
      ['wxml', 'wxss', 'js', 'json'].map((e) => ({ path: `pages/x/x.${e}`, content: `old-${e}` })),
      ['wxml', 'wxss', 'js', 'json'].map((e) => ({ path: `X.${e}`, content: `new-${e}` })),
    );
    expect(paired).toHaveLength(4);
    expect(paired.every((p) => p.current !== null && p.generated !== null)).toBe(true);
    expect(compareCodes(paired).summary.changed).toBe(4);
  });

  it('basename 相同优先于扩展名配对', () => {
    const paired = pairCompareFiles(
      [{ path: 'src/a.tsx', content: 'x' }],
      [
        { path: 'a.tsx', content: 'y' },
        { path: 'b.tsx', content: 'z' },
      ],
    );
    expect(paired.find((p) => p.path === 'src/a.tsx')!.generated).toBe('y');
    expect(paired.some((p) => p.path === 'b.tsx' && p.current === null)).toBe(true);
  });

  it('同扩展名多个候选且 basename/后缀均不匹配 → 不猜测，现状记 removed、候选记 added', () => {
    const paired = pairCompareFiles(
      [{ path: 'current.tsx', content: 'x' }],
      [
        { path: 'A.tsx', content: '1' },
        { path: 'B.tsx', content: '2' },
      ],
    );
    expect(paired).toHaveLength(3);
    expect(compareCodes(paired).summary.removed).toBe(1);
    expect(compareCodes(paired).summary.added).toBe(2);
  });
});
