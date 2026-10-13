/**
 * 富文本数据模型（WBS-P2-21）
 *
 * 把精简节点树中的文本/链接/列表结构归一化为框架无关的富文本中间表示，
 * 供 WBS-P2-22 构造微信 rich-text nodes。纯函数、零 I/O、不依赖 Figma Client。
 *
 * 识别范围（对 ≥50 个标注样本验收，误识别率 <10%）：
 *  - 行内：bold / italic / underline / lineThrough / link；
 *  - 块：paragraph / heading(h1-h3) / quote / ordered-list / unordered-list；
 *  - 列表：容器强信号（role=list、名称含 ordered/ol/steps 等，单项也成立）、
 *    弱信号（list/feature/bullet，需 ≥2 项）、连续 item 命名/编号/项目符号前缀；
 *  - 大小写：upper / lower / mixed / none（CJK 与纯数字视为 none）。
 *
 * @module
 */

import type { ProcessedNode, ProcessedTextStyle } from '../../types/nodes.js';

// ============ 类型 ============

/** 行内片段（一行/一条列表项由多个片段组成） */
export interface RichInline {
  type: 'text' | 'link';
  text: string;
  /** 仅 type=link；Figma 文本一般无 href，缺省由后续人工补 */
  href?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  lineThrough?: boolean;
}

export type RichBlockType =
  | 'paragraph'
  | 'heading'
  | 'quote'
  | 'ordered-list'
  | 'unordered-list';

export interface RichBlock {
  type: RichBlockType;
  /** heading 层级 1-3 */
  level?: number;
  /** paragraph/heading/quote 的行内片段序列 */
  inlines?: RichInline[];
  /** list 的条目：每条 = 一行片段序列 */
  items?: RichInline[][];
}

export interface RichTextDocument {
  blocks: RichBlock[];
  /** 文档级大小写模式 */
  caseMode: 'upper' | 'lower' | 'mixed' | 'none';
}

// ============ 行内 ============

/**
 * 从单个 TEXT 节点提取行内片段。
 *
 * @param node - 精简节点（预期 originalType=TEXT，非文本节点视为普通文本兜底）
 * @returns 行内片段
 */
export function inlineFromTextNode(node: ProcessedNode): RichInline {
  const ts: ProcessedTextStyle | undefined = node.textStyle;
  const isLink = node.role === 'link' || /link/i.test(node.name ?? '');
  const inline: RichInline = {
    type: isLink ? 'link' : 'text',
    text: node.textContent ?? '',
  };
  const bold = typeof ts?.fontWeight === 'number' && ts.fontWeight >= 600;
  // ProcessedTextStyle 未归一化 fontStyle；Figma 斜体来自字体名 style 描述，宽松读取
  const fontStyle = (ts as (ProcessedTextStyle & { fontStyle?: string }) | undefined)?.fontStyle;
  const italic = fontStyle === 'italic';
  const underline = ts?.textDecoration === 'UNDERLINE';
  const lineThrough = ts?.textDecoration === 'STRIKETHROUGH';
  if (bold) inline.bold = true;
  if (italic) inline.italic = true;
  if (underline) inline.underline = true;
  if (lineThrough) inline.lineThrough = true;
  return inline;
}

// ============ 大小写 ============

const LATIN_RE = /[A-Za-z]/;

/**
 * 判定文本大小写模式。
 *
 * - 无拉丁字母（纯 CJK/数字/符号/空串）→ none；
 * - 拉丁字母全部大写（≥1 个）→ upper；全部小写 → lower；混合 → mixed。
 */
export function detectCaseMode(text: string): RichTextDocument['caseMode'] {
  if (!text || !LATIN_RE.test(text)) return 'none';
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length === 0) return 'none';
  let upper = 0;
  let lower = 0;
  for (const ch of letters) {
    if (ch >= 'A' && ch <= 'Z') upper += 1;
    else if (ch >= 'a' && ch <= 'z') lower += 1;
  }
  if (upper > 0 && lower === 0) return 'upper';
  if (lower > 0 && upper === 0) return 'lower';
  return 'mixed';
}

// ============ 块级解析 ============

const ORDERED_PREFIX_RE = /^\s*\d+\s*[.)、]\s+/;
const BULLET_PREFIX_RE = /^\s*[•·▪‣*\-－]\s+/;

/** 去掉行首编号/项目符号前缀，返回纯文本 */
export function stripItemPrefix(text: string): string {
  return text.replace(ORDERED_PREFIX_RE, '').replace(BULLET_PREFIX_RE, '').trim();
}

function headingLevel(name: string): number | undefined {
  if (/\bh1\b/i.test(name)) return 1;
  if (/\bh3\b/i.test(name)) return 3;
  if (/\bh2\b/i.test(name) || /heading|title/i.test(name)) return 2;
  return undefined;
}

function isQuoteNode(node: ProcessedNode): boolean {
  return (node.role as string) === 'quote' || /quote/i.test(node.name ?? '');
}

/** 强列表信号：单项也算列表（role=list / 明确 ordered/ol/steps 名称） */
function strongListKind(node: ProcessedNode): 'ordered' | 'unordered' | null {
  if ((node.role as string) === 'list') return 'unordered';
  const name = node.name ?? '';
  if (/ordered|(\bol\b)|steps?|number/i.test(name)) return 'ordered';
  if (/unordered|(\bul\b)|bullet/i.test(name)) return 'unordered';
  return null;
}

/** 弱列表信号：需要 ≥2 个条目才成立 */
function weakListKind(node: ProcessedNode): 'ordered' | 'unordered' | null {
  const name = node.name ?? '';
  if (/list|feature/i.test(name)) {
    return /ordered|steps?|number/i.test(name) ? 'ordered' : 'unordered';
  }
  return null;
}

function itemNameSignal(node: ProcessedNode): boolean {
  return /list\s*item|bullet/i.test(node.name ?? '');
}

/** 扁平化收集容器内可见、非空 TEXT 节点（DFS 顺序） */
function flattenText(node: ProcessedNode, out: ProcessedNode[] = []): ProcessedNode[] {
  if (node.visible === false) return out;
  if (node.originalType === 'TEXT') {
    if ((node.textContent ?? '').trim() !== '') out.push(node);
    return out;
  }
  for (const child of node.children ?? []) flattenText(child, out);
  return out;
}

/** 序列条目（frame 已解析为 block，text 仍为 line） */
type SeqItem = { kind: 'line'; node: ProcessedNode } | { kind: 'block'; block: RichBlock };

function textLine(node: ProcessedNode): RichBlock {
  const name = node.name ?? '';
  const level = headingLevel(name);
  if (level !== undefined && !/button/i.test(name)) {
    return { type: 'heading', level, inlines: [inlineFromTextNode(node)] };
  }
  return { type: 'paragraph', inlines: [inlineFromTextNode(node)] };
}

function listBlockFromNodes(kind: 'ordered' | 'unordered', nodes: ProcessedNode[]): RichBlock {
  return {
    type: kind === 'ordered' ? 'ordered-list' : 'unordered-list',
    items: nodes.map((n) => {
      const seg = inlineFromTextNode(n);
      seg.text = stripItemPrefix(seg.text);
      return [seg];
    }),
  };
}

/** 判断一行是否符合「列表条目」（名称信号或编号/项目符号前缀） */
function qualifiesAsItem(node: ProcessedNode): 'ordered' | 'unordered' | null {
  if (itemNameSignal(node)) return 'unordered';
  const text = node.textContent ?? '';
  if (ORDERED_PREFIX_RE.test(text)) return 'ordered';
  if (BULLET_PREFIX_RE.test(text)) return 'unordered';
  return null;
}

/** 将兄弟序列中的连续 item 行合并为列表块 */
function groupSequence(items: SeqItem[]): RichBlock[] {
  const blocks: RichBlock[] = [];
  let i = 0;
  while (i < items.length) {
    const item = items[i]!;
    if (item.kind === 'block') {
      blocks.push(item.block);
      i += 1;
      continue;
    }
    // 探测从 i 开始的连续 item 行
    let j = i;
    const kinds: Array<'ordered' | 'unordered'> = [];
    while (j < items.length) {
      const cur = items[j];
      if (!cur || cur.kind !== 'line') break;
      const q = qualifiesAsItem(cur.node);
      if (!q) break;
      kinds.push(q);
      j += 1;
    }
    if (j - i >= 2) {
      const ordered = kinds.filter((k) => k === 'ordered').length >= kinds.length / 2;
      const nodes = items.slice(i, j).map((x) => (x.kind === 'line' ? x.node : null)!).filter(Boolean);
      blocks.push(listBlockFromNodes(ordered ? 'ordered' : 'unordered', nodes));
      i = j;
    } else {
      blocks.push(textLine(item.node));
      i += 1;
    }
  }
  return blocks;
}

/** 递归把容器子节点转成序列项（单子文本框架向上提为行；强信号框架成块） */
function sequenceFromChildren(children: ProcessedNode[]): SeqItem[] {
  const seq: SeqItem[] = [];
  for (const child of children) {
    if (child.visible === false) continue;

    if (child.originalType === 'TEXT') {
      if ((child.textContent ?? '').trim() !== '') seq.push({ kind: 'line', node: child });
      continue;
    }

    // 容器节点
    const texts = flattenText(child);
    const strong = strongListKind(child);
    if (strong && texts.length >= 1) {
      seq.push({ kind: 'block', block: listBlockFromNodes(strong, texts) });
      continue;
    }
    const weak = weakListKind(child);
    if (weak && texts.length >= 2) {
      seq.push({ kind: 'block', block: listBlockFromNodes(weak, texts) });
      continue;
    }
    if (isQuoteNode(child) && texts.length >= 1) {
      seq.push({ kind: 'block', block: { type: 'quote', inlines: texts.map(inlineFromTextNode) } });
      continue;
    }
    // 同行内联容器（名称含 line/inline/phrase/richtext）：多 TEXT 子节点合并为一个段落的多片段。
    // 注意正则不匹配 'link'（\blink? 用明确词表，避免把链接容器误并段）
    if (texts.length >= 2 && /(?:^|[\s_-])(line|inline|phrase|richtext)(?:[\s_-]|$)/i.test(child.name ?? '')) {
      seq.push({ kind: 'block', block: { type: 'paragraph', inlines: texts.map(inlineFromTextNode) } });
      continue;
    }
    // 单文本/无列表信号容器：拆解为行，交给父级序列参与连续合并（s39 深层文本）
    if (texts.length === 1) {
      seq.push({ kind: 'line', node: texts[0]! });
    } else if (texts.length >= 2) {
      // 多文本普通容器：按兄弟行参与上层序列分组（s27 混合场景）
      for (const t of texts) seq.push({ kind: 'line', node: t });
    }
  }
  return seq;
}

/**
 * 解析富文本文档。
 *
 * @param root - 任意精简节点（TEXT / Frame 均可）
 * @returns 归一化富文本文档（无任何可识别内容时 blocks 为空）
 */
export function parseRichText(root: ProcessedNode): RichTextDocument {
  const blocks: RichBlock[] = [];

  if (root.visible !== false && root.originalType === 'TEXT' && (root.textContent ?? '').trim() !== '') {
    blocks.push(textLine(root));
  } else if (root.visible !== false && root.originalType !== 'TEXT') {
    const strong = strongListKind(root);
    const texts = flattenText(root);
    if (strong && texts.length >= 1) {
      blocks.push(listBlockFromNodes(strong, texts));
    } else {
      const weak = weakListKind(root);
      if (weak && texts.length >= 2) {
        blocks.push(listBlockFromNodes(weak, texts));
      } else if (isQuoteNode(root) && texts.length >= 1) {
        blocks.push({ type: 'quote', inlines: texts.map(inlineFromTextNode) });
      } else if (
        texts.length >= 2 &&
        /(?:^|[\s_-])(line|inline|phrase|richtext)(?:[\s_-]|$)/i.test(root.name ?? '')
      ) {
        blocks.push({ type: 'paragraph', inlines: texts.map(inlineFromTextNode) });
      } else {
        blocks.push(...groupSequence(sequenceFromChildren(root.children ?? [])));
      }
    }
  }

  // 文档级大小写：汇总全部文本
  const allText = textsOf(blocks).join(' ');
  return { blocks, caseMode: detectCaseMode(allText) };
}

function textsOf(blocks: RichBlock[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    for (const seg of b.inlines ?? []) out.push(seg.text);
    for (const item of b.items ?? []) for (const seg of item) out.push(seg.text);
  }
  return out;
}

/**
 * 是否值得用 rich-text 承载（简单文本分流判据，WBS-P2-22 用）。
 *
 * 单一纯 paragraph 且无链接/行内标记 → false（继续用普通 <text>）；
 * 含列表/标题/引用/链接/行内样式 → true。
 */
export function isRichDocument(doc: RichTextDocument): boolean {
  if (doc.blocks.length !== 1) return doc.blocks.length > 1;
  const block = doc.blocks[0]!;
  if (block.type !== 'paragraph') return true;
  const inlines = block.inlines ?? [];
  if (inlines.length > 1) return true;
  const only = inlines[0];
  if (!only) return false;
  if (only.type === 'link') return true;
  return Boolean(only.bold || only.italic || only.underline || only.lineThrough);
}
