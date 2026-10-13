/**
 * Watch 安全写盘器（WBS-P1-23）
 *
 * 写盘边界（ROADMAP P1-2 决策 1/5）：
 *  - 所有相对路径必须解析在 root 之内（拒绝绝对路径与 `../` 穿越），越权 0 写入；
 *  - 覆盖前把旧文件全量备份到 `.figma-dev-backup/<timestamp>/`；
 *  - 代码类文件（js/ts/vue/svelte/wxml/wxss/css/...）按语言注释语法提取
 *    `figma-dev:preserve:start/end <key>` 用户区块，重写后回填；
 *  - 任何解析/合并异常 fail-open：放弃该文件、保留旧内容并在 skipped 报告；
 *  - JSON 的用户区不经标记，由 watch-json-merge.ts 的 *.figma.json 旁路承担。
 *
 * @module
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { applyJsonOverrides, loadFigmaOverrides } from './watch-json-merge.js';

export const PRESERVE_PREFIX = 'figma-dev:preserve';
export const PRESERVE_START = `${PRESERVE_PREFIX}:start`;
export const PRESERVE_END = `${PRESERVE_PREFIX}:end`;

/** 支持 preserve 区块的文件语言（决定注释语法；json 无标记，区块提取必为空） */
export type PreserveLang =
  | 'js'
  | 'ts'
  | 'tsx'
  | 'jsx'
  | 'svelte'
  | 'vue'
  | 'html'
  | 'wxml'
  | 'css'
  | 'wxss'
  | 'scss'
  | 'less'
  | 'json';

interface LangSyntax {
  start: (key: string) => string;
  end: (key: string) => string;
}

const LINE_COMMENT: LangSyntax = {
  start: (key) => `// ${PRESERVE_START} ${key}`,
  end: (key) => `// ${PRESERVE_END} ${key}`,
};
const HTML_COMMENT: LangSyntax = {
  start: (key) => `<!-- ${PRESERVE_START} ${key} -->`,
  end: (key) => `<!-- ${PRESERVE_END} ${key} -->`,
};
const BLOCK_COMMENT: LangSyntax = {
  start: (key) => `/* ${PRESERVE_START} ${key} */`,
  end: (key) => `/* ${PRESERVE_END} ${key} */`,
};

function syntaxFor(lang: PreserveLang): LangSyntax {
  if (['js', 'ts', 'tsx', 'jsx'].includes(lang)) return LINE_COMMENT;
  if (['css', 'wxss', 'scss', 'less'].includes(lang)) return BLOCK_COMMENT;
  return HTML_COMMENT; // svelte/vue/html/wxml
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 转义行内任意字符，供标记正则安全使用 */
function escapeMarker(line: string): string {
  return escapeRegExp(line.trim());
}

/**
 * 提取旧文件中的命名 preserve 区块（key → 区块内部文本，含首尾换行）。
 *
 * @throws 当存在 start 无匹配 end（标记不配对）时抛错，由写盘层 fail-open
 */
export function extractPreserveRegions(source: string, lang: PreserveLang): Map<string, string> {
  const syntax = syntaxFor(lang);
  const regions = new Map<string, string>();
  const startRe = /(?:[^\n]*\bfigma-dev:preserve:start)\s+([A-Za-z0-9_-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = startRe.exec(source)) !== null) {
    const key = m[1]!;
    const endMarker = syntax.end(key);
    const startIdx = m.index;
    const endIdx = source.indexOf(endMarker, startIdx);
    if (endIdx === -1) {
      throw new Error(`preserve 区块 "${key}" 缺少结束标记（${endMarker.trim()}），已中止合并保留旧文件`);
    }
    // 区块体 = start 标记行末到 end 标记开始之间
    const lineEnd = source.indexOf('\n', startIdx);
    const bodyStart = lineEnd === -1 ? source.length : lineEnd + 1;
    const body = source.slice(bodyStart, endIdx);
    regions.set(key, body);
  }
  return regions;
}

/**
 * 把 preserve 区块回填进新生成内容：
 *  - 新内容中存在同名区块标记 → 替换其内部；
 *  - 不存在 → 在文件末尾追加完整区块（用户代码不丢失）。
 */
export function mergePreserve(generated: string, regions: Map<string, string>, lang: PreserveLang): string {
  if (regions.size === 0) return generated;
  const syntax = syntaxFor(lang);
  let output = generated;

  for (const [key, body] of regions) {
    const startMarker = syntax.start(key);
    const endMarker = syntax.end(key);
    const blockRe = new RegExp(
      `${escapeMarker(startMarker)}[\\s\\S]*?${escapeMarker(endMarker)}`,
    );
    const replacement = `${startMarker}\n${body.replace(/\n$/, '')}\n${endMarker}`;
    if (blockRe.test(output)) {
      output = output.replace(blockRe, replacement);
    } else {
      output = `${output.replace(/\s*$/, '')}\n\n${replacement}\n`;
    }
  }
  return output;
}

export interface WriteFileEntry {
  /** 相对 root 的 POSIX/本地相对路径（绝对路径与 ../ 会被拒绝） */
  path: string;
  content: string;
  lang: PreserveLang;
}

export interface WriteResult {
  /** 成功写入的相对路径 */
  written: string[];
  /** 产生了备份的相对路径（备份文件相对 root 的路径） */
  backedUp: string[];
  /** 未写入文件及原因（越权/preserve 失败等） */
  skipped: Array<{ path: string; reason: string }>;
  warnings: string[];
  /** JSON 旁路覆盖应用情况，按目标文件相对路径记录 */
  jsonOverrides: Array<{ path: string; applied: string[]; warnings: string[] }>;
}

export interface WriteOptions {
  root: string;
  files: WriteFileEntry[];
  /** 备份时间戳（注入便于测试；默认 Date.now） */
  now?: () => number;
  /** 是否启用备份（默认 true） */
  backup?: boolean;
}

/**
 * 越权校验：与 weapp project-config.resolveSafeOutputPath 同口径
 * （拒绝绝对路径、解析后逃出 root 的 ../）。
 */
function isInsideRoot(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root + path.sep);
}

function pathExists(target: string): boolean {
  try {
    fs.lstatSync(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * 检查 root 下的每个路径分量。拒绝 symlink/junction、非目录中间分量和非普通文件目标，
 * 避免 Windows junction / POSIX symlink 把写入引导到输出根目录之外。
 */
function assertNoLinksBetween(root: string, target: string): { ok: true } | { ok: false; reason: string } {
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return { ok: false, reason: `路径越权（不在实际输出根目录内）：${target}` };
  }

  let current = root;
  const segments = relative.split(path.sep).filter(Boolean);
  for (let index = 0; index < segments.length; index++) {
    current = path.join(current, segments[index]!);
    if (!pathExists(current)) continue;

    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(current);
    } catch {
      return { ok: false, reason: `无法检查路径：${relative}` };
    }
    if (stat.isSymbolicLink()) {
      return { ok: false, reason: `路径包含 symlink/junction，拒绝写入：${relative}` };
    }
    const isLeaf = index === segments.length - 1;
    if (!isLeaf && !stat.isDirectory()) {
      return { ok: false, reason: `路径中间分量不是目录：${relative}` };
    }
    if (isLeaf && !stat.isDirectory() && !stat.isFile()) {
      return { ok: false, reason: `目标不是普通文件：${relative}` };
    }
  }

  return { ok: true };
}

/**
 * 越权校验：
 * 1. 拒绝绝对路径与 lexical `../`；
 * 2. root 与目标都解析为真实路径后再次确认；
 * 3. root 到目标之间不得包含 symlink/junction。
 */
function resolveInsideRoot(root: string, relPath: string): { ok: true; full: string } | { ok: false; reason: string } {
  if (path.isAbsolute(relPath)) {
    return { ok: false, reason: `路径越权（拒绝绝对路径）：${relPath}` };
  }

  const rootNorm = path.resolve(root);
  const lexicalFull = path.resolve(rootNorm, relPath.split('/').join(path.sep));
  if (!isInsideRoot(rootNorm, lexicalFull)) {
    return { ok: false, reason: `路径越权（解析后逃出输出根目录）：${relPath}` };
  }

  let realRoot: string;
  try {
    fs.mkdirSync(rootNorm, { recursive: true });
    realRoot = fs.realpathSync(rootNorm);
  } catch (error) {
    return { ok: false, reason: `输出根目录不可用：${error instanceof Error ? error.message : String(error)}` };
  }

  const full = path.resolve(realRoot, relPath.split('/').join(path.sep));
  if (!isInsideRoot(realRoot, full)) {
    return { ok: false, reason: `路径越权（真实路径逃出输出根目录）：${relPath}` };
  }

  const noLinks = assertNoLinksBetween(realRoot, full);
  if (!noLinks.ok) return noLinks;

  return { ok: true, full };
}

/**
 * 同目录临时文件 + fsync + rename，保证单文件替换是原子的。
 */
function writeFileSyncAtomic(full: string, content: string): void {
  const directory = path.dirname(full);
  fs.mkdirSync(directory, { recursive: true });
  const noLinks = assertNoLinksBetween(fs.realpathSync(directory === full ? path.dirname(full) : directory), full);
  if (!noLinks.ok) throw new Error(noLinks.reason);

  const temp = path.join(directory, `.${path.basename(full)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  let fd: number | undefined;
  try {
    fd = fs.openSync(temp, 'wx', 0o600);
    fs.writeFileSync(fd, content, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;

    const tempStat = fs.lstatSync(temp);
    if (!tempStat.isFile() || tempStat.isSymbolicLink()) {
      throw new Error('原子写入临时文件不是普通文件');
    }
    fs.renameSync(temp, full);

    const finalStat = fs.lstatSync(full);
    if (!finalStat.isFile() || finalStat.isSymbolicLink()) {
      throw new Error('原子替换后的目标不是普通文件');
    }
  } catch (error) {
    if (fd !== undefined) fs.closeSync(fd);
    try {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    } catch {
      // 保留原始错误
    }
    throw error;
  }
}

/**
 * 安全写入全部文件（原子替换、symlink/junction 防护、备份与 preserve 合并）。
 * 单文件失败不影响其他文件。
 */
export async function writeGeneratedFiles(options: WriteOptions): Promise<WriteResult> {
  const result: WriteResult = { written: [], backedUp: [], skipped: [], warnings: [], jsonOverrides: [] };
  fs.mkdirSync(path.resolve(options.root), { recursive: true });
  const rootNorm = fs.realpathSync(path.resolve(options.root));
  const doBackup = options.backup !== false;
  const stamp = String(options.now?.() ?? Date.now());

  for (const file of options.files) {
    const safe = resolveInsideRoot(rootNorm, file.path);
    if (!safe.ok) {
      result.skipped.push({ path: file.path, reason: safe.reason });
      continue;
    }
    const full = safe.full;
    const rel = path.relative(rootNorm, full).split(path.sep).join('/');

    let finalContent = file.content;
    let existing: string | null = null;
    try {
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) {
        result.skipped.push({ path: rel, reason: '目标是 symlink/junction，保留旧路径并跳过写入' });
        continue;
      }
      if (!stat.isFile()) {
        result.skipped.push({ path: rel, reason: '目标不是普通文件，拒绝覆盖' });
        continue;
      }
      existing = fs.readFileSync(full, 'utf8');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        result.skipped.push({ path: rel, reason: `读取旧文件失败：${error instanceof Error ? error.message : String(error)}` });
        continue;
      }
      existing = null;
    }

    if (existing !== null || file.lang === 'json') {
      if (existing !== null) {
        try {
          const regions = extractPreserveRegions(existing, file.lang);
          finalContent = mergePreserve(finalContent, regions, file.lang);
        } catch (error) {
          result.skipped.push({ path: rel, reason: 'preserve 合并失败，保留旧文件：' + (error instanceof Error ? error.message : String(error)) });
          continue;
        }
      }
      if (file.lang === 'json') {
        const overridePath = `${file.path.replace(/\.json$/i, '')}.figma.json`;
        const safeOverride = resolveInsideRoot(rootNorm, overridePath);
        if (safeOverride.ok && fs.existsSync(safeOverride.full)) {
          try {
            const overrideStat = fs.lstatSync(safeOverride.full);
            if (!overrideStat.isFile() || overrideStat.isSymbolicLink()) {
              result.skipped.push({ path: rel, reason: 'JSON 旁路不是普通文件，保留旧文件' });
              continue;
            }
            const loaded = loadFigmaOverrides(fs.readFileSync(safeOverride.full, 'utf8'));
            if (!loaded.ok) {
              result.skipped.push({ path: rel, reason: `JSON 旁路文件非法，保留旧文件：${loaded.warnings.join('; ')}` });
              continue;
            }
            const merged = applyJsonOverrides(finalContent, loaded.overrides);
            if (!merged.ok || merged.json === null) {
              result.skipped.push({ path: rel, reason: `JSON 覆盖合并失败，保留旧文件：${merged.warnings.join('; ')}` });
              continue;
            }
            finalContent = merged.json;
            result.jsonOverrides.push({ path: rel, applied: merged.applied, warnings: merged.warnings });
            result.warnings.push(...merged.warnings.map((warning) => `${rel}: ${warning}`));
          } catch (error) {
            result.skipped.push({ path: rel, reason: `JSON 旁路合并异常，保留旧文件：${error instanceof Error ? error.message : String(error)}` });
            continue;
          }
        }
      }
      if (doBackup && existing !== null) {
        const backupRel = path.join('.figma-dev-backup', stamp, rel).split(path.sep).join('/');
        const safeBackup = resolveInsideRoot(rootNorm, backupRel);
        if (!safeBackup.ok) {
          result.skipped.push({ path: rel, reason: `备份路径不安全，保留旧文件：${safeBackup.reason}` });
          continue;
        }
        try {
          writeFileSyncAtomic(safeBackup.full, existing);
          result.backedUp.push(backupRel);
        } catch (error) {
          result.skipped.push({ path: rel, reason: `备份失败，保留旧文件：${error instanceof Error ? error.message : String(error)}` });
          continue;
        }
      }
    }

    try {
      writeFileSyncAtomic(full, finalContent);
      result.written.push(rel);
    } catch (error) {
      result.skipped.push({ path: rel, reason: `原子写入失败：${error instanceof Error ? error.message : String(error)}` });
    }
  }

  return result;
}