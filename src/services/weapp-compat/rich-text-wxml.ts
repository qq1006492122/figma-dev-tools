/**
 * 微信 rich-text nodes 构造（WBS-P2-22）
 *
 * 把 WBS-P2-21 的富文本中间表示转换为 `<rich-text :nodes>` 接受的节点数组：
 * 节点元素 `{ type:'node', name, attrs?, children? }`，文本叶子
 * `{ type:'text', text }`。文本一律走数据叶子，**不拼接 HTML 字符串**，
 * 因此 <script> 等内容只会作为字面文本渲染，无解析注入面。
 *
 * XSS 口径：
 *  - 仅 `<a href>` 输出属性，且 href 经 {@link safeRichHref} 协议白名单过滤；
 *  - 白名单外协议（javascript:/data:/vbscript: 等）直接丢弃 href（保留可见文本）；
 *  - 其余任何属性（onerror/onclick/style/…）不存在输出通道。
 *
 * @module
 */

import type { RichBlock, RichInline, RichTextDocument } from './rich-text-model.js';

/** rich-text 节点（元素或文本叶子） */
export type WeappRichNode =
  | {
      type: 'node';
      name: string;
      attrs?: Record<string, string>;
      children?: WeappRichNode[];
    }
  | { type: 'text'; text: string };

/**
 * 富文本链接 href 白名单。
 *
 * 允许：http、https、mailto、tel、以 `/` 开头的站内相对路径、`#` 锚点；
 * 拒绝（返回 null）：javascript / data / vbscript 及任何未知协议。
 *
 * @param raw - 原始 href
 * @returns 安全 href；不合规返回 null（调用方不输出 href 属性）
 */
export function safeRichHref(raw: string | undefined): string | null {
  if (!raw) return null;
  const href = raw.trim();
  if (!href) return null;
  if (/^https?:\/\/[^\s]+$/i.test(href)) return href;
  if (/^mailto:[^\s]+$/i.test(href)) return href;
  if (/^tel:[^\s]+$/i.test(href)) return href;
  if (href.startsWith('/') || href.startsWith('#')) return href;
  // 显式拒绝危险协议（兜底：未知协议同样不放行）
  return null;
}

/** 单个行内片段 → 节点序列（标记按外→内嵌套） */
function inlineToNodes(seg: RichInline): WeappRichNode {
  let node: WeappRichNode = { type: 'text', text: seg.text };

  if (seg.type === 'link') {
    const attrs: Record<string, string> = {};
    const safe = safeRichHref(seg.href);
    if (safe) attrs.href = safe;
    const a: WeappRichNode =
      Object.keys(attrs).length > 0
        ? { type: 'node', name: 'a', attrs, children: [node] }
        : { type: 'node', name: 'a', children: [node] };
    node = a;
  }
  // 嵌套顺序：s/u/em/strong，由内向外包
  if (seg.lineThrough) node = { type: 'node', name: 's', children: [node] };
  if (seg.underline) node = { type: 'node', name: 'u', children: [node] };
  if (seg.italic) node = { type: 'node', name: 'em', children: [node] };
  if (seg.bold) node = { type: 'node', name: 'strong', children: [node] };
  return node;
}

/** 块 → 节点元素 */
function blockToNode(block: RichBlock): WeappRichNode {
  switch (block.type) {
    case 'heading': {
      const name = `h${Math.min(3, Math.max(1, block.level ?? 2))}`;
      return { type: 'node', name, children: (block.inlines ?? []).map(inlineToNodes) };
    }
    case 'quote':
      return { type: 'node', name: 'blockquote', children: (block.inlines ?? []).map(inlineToNodes) };
    case 'ordered-list':
    case 'unordered-list': {
      const name = block.type === 'ordered-list' ? 'ol' : 'ul';
      return {
        type: 'node',
        name,
        children: (block.items ?? []).map(
          (line): WeappRichNode => ({ type: 'node', name: 'li', children: line.map(inlineToNodes) }),
        ),
      };
    }
    case 'paragraph':
    default:
      return { type: 'node', name: 'p', children: (block.inlines ?? []).map(inlineToNodes) };
  }
}

/**
 * 构造 rich-text nodes 数组。
 *
 * @param doc - P2-21 富文本文档
 * @returns rich-text `nodes` 绑定值
 */
export function buildRichTextNodes(doc: RichTextDocument): WeappRichNode[] {
  return doc.blocks.map(blockToNode);
}
