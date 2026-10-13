/**
 * 代码差异对比（WBS-P1-31/32/33）
 *
 * 零依赖行级 LCS 实现 unified diff；对比前可经 Prettier parser 级归一化消除格式噪音
 * （归一化失败 fail-open 按原文比较，不抛错）。安全：总输入硬上限 512KB、
 * NUL 字节二进制嗅探、文件读取路径越权拒绝。
 *
 * @module
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { formatCode } from '../code-formatter.js';

export const COMPARE_LIMITS = {
  /** 现状+生成输入总字节硬上限（附录 A.4：512KB） */
  maxTotalBytes: 512 * 1024,
  /** unified diff 上下文行数 */
  contextLines: 3,
  /** 二进制嗅探窗口 */
  binarySniffBytes: 8192,
  /** 防止短行大文件触发 LCS O(n*m) 内存爆炸 */
  maxDiffCells: 4_000_000,
} as const;

export type CompareErrorCode =
  | 'FDT-COMPARE-PATH-TRAVERSAL'
  | 'FDT-COMPARE-INPUT-TOO-LARGE'
  | 'FDT-COMPARE-BINARY-UNSUPPORTED';

export class CompareError extends Error {
  readonly code: CompareErrorCode;
  constructor(code: CompareErrorCode, message: string) {
    super(message);
    this.name = 'CompareError';
    this.code = code;
  }
}

export interface CompareInputFile {
  path: string;
  /** 现状侧；null=新增文件 */
  current: string | null;
  /** 生成侧；null=删除文件 */
  generated: string | null;
}

export interface FileDiffStats {
  currentLines: number;
  generatedLines: number;
  added: number;
  removed: number;
}

export interface CompareFileResult {
  path: string;
  status: 'added' | 'removed' | 'changed' | 'unchanged';
  unifiedDiff: string;
  stats: FileDiffStats;
}

export interface CompareSummary {
  files: number;
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
}

export interface CompareResult {
  files: CompareFileResult[];
  summary: CompareSummary;
}

/** NUL 字节嗅探（前 8KB） */
export function looksBinary(text: string): boolean {
  return text.slice(0, COMPARE_LIMITS.binarySniffBytes).includes('\u0000');
}

/**
 * 行级 LCS unified diff（含上下文与 hunk 头）。内容一致返回空串。
 */
export function createUnifiedDiff(current: string, generated: string, filePath: string): string {
  const a = current.split('\n');
  const b = generated.split('\n');

  // LCS 动态规划
  const n = a.length;
  const m = b.length;
  if ((n + 1) * (m + 1) > COMPARE_LIMITS.maxDiffCells) {
    throw new CompareError('FDT-COMPARE-INPUT-TOO-LARGE', 'diff size exceeds max cells');
  }
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  // 回溯产出带标记的行
  type Marked = { tag: ' ' | '-' | '+'; line: string; ai: number; bj: number };
  const marked: Marked[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      marked.push({ tag: ' ', line: a[i]!, ai: i, bj: j });
      i += 1;
      j += 1;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      marked.push({ tag: '-', line: a[i]!, ai: i, bj: -1 });
      i += 1;
    } else {
      marked.push({ tag: '+', line: b[j]!, ai: -1, bj: j });
      j += 1;
    }
  }
  while (i < n) marked.push({ tag: '-', line: a[i++]!, ai: i - 1, bj: -1 });
  while (j < m) marked.push({ tag: '+', line: b[j++]!, ai: -1, bj: j - 1 });

  const changedIdx = marked.map((x, idx) => (x.tag === ' ' ? -1 : idx)).filter((x) => x >= 0);
  if (changedIdx.length === 0) return '';

  const context = COMPARE_LIMITS.contextLines;
  const out: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`];

  // 按 changed 索引聚合成不重叠窗口（含 context）
  const windows: Array<[number, number]> = [];
  for (const idx of changedIdx) {
    const s = Math.max(0, idx - context);
    const e = Math.min(marked.length, idx + context + 1);
    const last = windows[windows.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else windows.push([s, e]);
  }

  for (const [ws, we] of windows) {
    const slice = marked.slice(ws, we);
    const oldStart = slice.find((x) => x.ai >= 0)?.ai ?? 0;
    const newStart = slice.find((x) => x.bj >= 0)?.bj ?? 0;
    const oldCount = slice.filter((x) => x.tag !== '+').length;
    const newCount = slice.filter((x) => x.tag !== '-').length;
    out.push(`@@ -${oldStart + 1},${oldCount} +${newStart + 1},${newCount} @@`);
    for (const x of slice) out.push(`${x.tag}${x.line}`);
  }
  return out.join('\n');
}

/**
 * Prettier 归一化（parser 失败 fail-open 返回原文）。
 */
export async function normalizeCode(code: string, filePath: string): Promise<string> {
  try {
    const formatted = await formatCode(code, { filePath: `compare.${path.extname(filePath).slice(1) || 'txt'}` });
    return formatted ?? code;
  } catch {
    return code;
  }
}

/**
 * 对比一组文件（同步；安全错误同步抛出，便于触网前校验）。
 *
 * @throws CompareError
 */
export function compareCodes(files: CompareInputFile[]): CompareResult {
  // 总大小 + 二进制检查
  let total = 0;
  for (const f of files) {
    total += (f.current?.length ?? 0) + (f.generated?.length ?? 0);
    if (f.current && looksBinary(f.current)) {
      throw new CompareError('FDT-COMPARE-BINARY-UNSUPPORTED', `文件 ${f.path} 疑似二进制，不支持对比`);
    }
    if (f.generated && looksBinary(f.generated)) {
      throw new CompareError('FDT-COMPARE-BINARY-UNSUPPORTED', `文件 ${f.path} 生成侧疑似二进制`);
    }
  }
  if (total > COMPARE_LIMITS.maxTotalBytes) {
    throw new CompareError(
      'FDT-COMPARE-INPUT-TOO-LARGE',
      `输入总大小 ${total} 字节超过 ${COMPARE_LIMITS.maxTotalBytes} 上限`,
    );
  }

  const results: CompareFileResult[] = [];
  for (const f of files) {
    const current = f.current;
    const generated = f.generated;

    let status: CompareFileResult['status'];
    let unifiedDiff = '';
    if (current === null && generated !== null) status = 'added';
    else if (generated === null && current !== null) status = 'removed';
    else {
      unifiedDiff = createUnifiedDiff(current ?? '', generated ?? '', f.path);
      status = unifiedDiff === '' ? 'unchanged' : 'changed';
    }

    const added = (unifiedDiff.match(/^\+(?!\+)/gm) ?? []).length;
    const removed = (unifiedDiff.match(/^-(?!--)/gm) ?? []).length;
    results.push({
      path: f.path,
      status,
      unifiedDiff,
      stats: {
        currentLines: current === null ? 0 : current.split('\n').length,
        generatedLines: generated === null ? 0 : generated.split('\n').length,
        added: status === 'added' ? generated!.split('\n').length : added,
        removed: status === 'removed' ? current!.split('\n').length : removed,
      },
    });
  }

  const summary: CompareSummary = {
    files: results.length,
    added: results.filter((r) => r.status === 'added').length,
    removed: results.filter((r) => r.status === 'removed').length,
    changed: results.filter((r) => r.status === 'changed').length,
    unchanged: results.filter((r) => r.status === 'unchanged').length,
  };
  return { files: results, summary };
}

// ============ 现状/生成文件配对（R1 QA：currentCode 固定名与组件名不一致问题） ============

export interface CompareSideFile {
  path: string;
  content: string;
}

function basename(p: string): string {
  return p.split(/[/\\]/).pop() ?? p;
}
function extOf(p: string): string {
  const i = p.lastIndexOf('.');
  return i >= 0 ? p.slice(i).toLowerCase() : '';
}

/**
 * 把现状文件与生成文件配成对（供 compareCodes 逐文件 diff）。
 *
 * 配对优先级：
 *  1. basename 完全相等（磁盘文件与生成同名）；
 *  2. 任一侧路径以另一侧为后缀（目录前缀不同，如 pages/x/x.wxml vs x.wxml）；
 *  3. 同扩展名唯一配对（单文件框架 current.tsx vs Card.tsx；weapp 四件套按扩展名 1:1）——
 *     同扩展名存在多个候选时不猜，留待 added/removed 显式暴露。
 *
 * @returns CompareInputFile[]（含 added/removed/待 diff 对），路径统一展示为现状侧路径
 */
export function pairCompareFiles(
  currentFiles: CompareSideFile[],
  generatedFiles: CompareSideFile[],
): CompareInputFile[] {
  const consumedGen = new Set<number>();
  const pairs: CompareInputFile[] = [];

  const takeGen = (pred: (f: CompareSideFile) => boolean): number | null => {
    const idx = generatedFiles.findIndex((f, i) => !consumedGen.has(i) && pred(f));
    if (idx >= 0) {
      consumedGen.add(idx);
      return idx;
    }
    return null;
  };

  for (const cur of currentFiles) {
    let genIdx = takeGen((g) => basename(g.path) === basename(cur.path));
    if (genIdx === null) {
      genIdx = takeGen((g) => g.path.endsWith(cur.path) || cur.path.endsWith(g.path));
    }
    if (genIdx === null) {
      const sameExt = generatedFiles
        .map((g, i) => ({ g, i }))
        .filter(({ g, i }) => !consumedGen.has(i) && extOf(g.path) === extOf(cur.path) && extOf(cur.path) !== '');
      if (sameExt.length === 1) {
        genIdx = sameExt[0]!.i;
        consumedGen.add(genIdx);
      }
    }
    pairs.push({
      path: cur.path,
      current: cur.content,
      generated: genIdx === null ? null : generatedFiles[genIdx]!.content,
    });
  }

  for (let i = 0; i < generatedFiles.length; i++) {
    if (!consumedGen.has(i)) {
      pairs.push({ path: generatedFiles[i]!.path, current: null, generated: generatedFiles[i]!.content });
    }
  }
  return pairs;
}

/**
 * 对比前对两侧做 Prettier 归一化（异步；归一化失败逐文件 fail-open 按原文）。
 */
export async function compareCodesNormalized(files: CompareInputFile[]): Promise<CompareResult> {
  const normalized: CompareInputFile[] = await Promise.all(
    files.map(async (f) => ({
      path: f.path,
      current: f.current === null ? null : await normalizeCode(f.current, f.path),
      generated: f.generated === null ? null : await normalizeCode(f.generated, f.path),
    })),
  );
  return compareCodes(normalized);
}

/**
 * 从项目目录读取对比现状文件（越权拒绝、二进制拒绝）。
 */
export function readCompareFile(root: string, relPath: string): { content: string } {
  if (path.isAbsolute(relPath)) {
    throw new CompareError('FDT-COMPARE-PATH-TRAVERSAL', `拒绝绝对路径：${relPath}`);
  }
  const rootNorm = path.resolve(root);
  const full = path.resolve(rootNorm, relPath.split('/').join(path.sep));
  if (full !== rootNorm && !full.startsWith(rootNorm + path.sep)) {
    throw new CompareError('FDT-COMPARE-PATH-TRAVERSAL', `路径逃出项目根：${relPath}`);
  }
  const content = fs.readFileSync(full, 'utf8');
  if (looksBinary(content)) {
    throw new CompareError('FDT-COMPARE-BINARY-UNSUPPORTED', `文件 ${relPath} 疑似二进制`);
  }
  return { content };
}
