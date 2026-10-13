/**
 * WBS-P2-22 rich-text nodes 构造与 XSS 防护测试
 *
 * 口径：
 *  - 输出微信 rich-text 组件要求的 nodes 结构（{ type:'node', name, attrs, children }
 *    与 { type:'text', text }），标签取官方支持子集；
 *  - 简单文本经 isRichDocument 分流，不进入 rich-text；
 *  - href 白名单（http/https/mailto/tel/相对路径/锚点），javascript:/data:/vbscript: 丢弃；
 *  - 不允许透传任意属性（无 onerror/onclick 注入面）；文本以数据节点承载（不拼 HTML 字符串）。
 */
import { describe, it, expect } from 'vitest';
import {
  buildRichTextNodes,
  safeRichHref,
  type WeappRichNode,
} from '../../../src/services/weapp-compat/rich-text-wxml.js';
import {
  parseRichText,
  isRichDocument,
  type RichBlock,
  type RichInline,
  type RichTextDocument,
} from '../../../src/services/weapp-compat/rich-text-model.js';
import type { ProcessedNode, ProcessedTextStyle } from '../../../src/types/nodes.js';

/** 构造块的小工具 */
function block(type: RichBlock['type'], extra: Partial<RichBlock> = {}): RichBlock {
  return { type, ...extra } as RichBlock;
}
function seg(partial: Partial<RichInline> & { text: string }): RichInline {
  return { type: 'text', ...partial };
}
function doc(blocks: RichBlock[]): RichTextDocument {
  return { blocks, caseMode: 'none' };
}

/** 找第一个指定 name 的节点（DFS） */
function findNode(nodes: WeappRichNode[], name: string): WeappRichNode | undefined {
  for (const n of nodes) {
    if (n.type === 'node') {
      if (n.name === name) return n;
      const hit = findNode(n.children ?? [], name);
      if (hit) return hit;
    }
  }
  return undefined;
}

describe('WBS-P2-22 官方节点子集构造', () => {
  it('段落：p > text 数据节点（不产生 HTML 字符串）', () => {
    const nodes = buildRichTextNodes(doc([block('paragraph', { inlines: [seg({ text: '你好' })] })]));
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ type: 'node', name: 'p' });
    expect(nodes[0]!.children?.[0]).toEqual({ type: 'text', text: '你好' });
  });

  it('标题层级 h1/h2/h3', () => {
    expect(buildRichTextNodes(doc([block('heading', { level: 1, inlines: [seg({ text: 'A' })] })]))[0]!.name).toBe('h1');
    expect(buildRichTextNodes(doc([block('heading', { level: 2, inlines: [seg({ text: 'B' })] })]))[0]!.name).toBe('h2');
    expect(buildRichTextNodes(doc([block('heading', { level: 3, inlines: [seg({ text: 'C' })] })]))[0]!.name).toBe('h3');
  });

  it('引用：blockquote', () => {
    const nodes = buildRichTextNodes(doc([block('quote', { inlines: [seg({ text: '名言' })] })]));
    expect(nodes[0]!.name).toBe('blockquote');
  });

  it('行内标记：strong/em/u/s 正确嵌套，可叠加', () => {
    const nodes = buildRichTextNodes(
      doc([
        block('paragraph', {
          inlines: [
            seg({ text: '粗', bold: true }),
            seg({ text: '斜', italic: true }),
            seg({ text: '划', lineThrough: true }),
            seg({ text: '下', underline: true }),
            seg({ text: '粗斜', bold: true, italic: true }),
          ],
        }),
      ]),
    );
    const children = nodes[0]!.children!;
    expect(children.map((c) => (c.type === 'node' ? c.name : c.type))).toEqual(['strong', 'em', 's', 'u', 'strong']);
    // 叠加标记：strong > em > text
    const strong = children[4]!;
    expect(strong.type).toBe('node');
    expect(strong.name).toBe('strong');
    expect(strong.children?.[0]!.type).toBe('node');
    expect((strong.children?.[0] as WeappRichNode).name).toBe('em');
  });

  it('无序列表：ul > li，有序列表：ol > li', () => {
    const ul = buildRichTextNodes(doc([block('unordered-list', { items: [[seg({ text: 'a' })], [seg({ text: 'b' })]] })]));
    expect(ul[0]!.name).toBe('ul');
    expect(ul[0]!.children).toHaveLength(2);
    expect(ul[0]!.children?.[0]!.name).toBe('li');

    const ol = buildRichTextNodes(doc([block('ordered-list', { items: [[seg({ text: '1' })]] })]));
    expect(ol[0]!.name).toBe('ol');
    expect(ol[0]!.children?.[0]!.name).toBe('li');
  });

  it('链接：a[href]，链接内文本为数据节点', () => {
    const nodes = buildRichTextNodes(
      doc([block('paragraph', { inlines: [seg({ type: 'link', text: '文档', href: 'https://example.com/docs' })] })]),
    );
    const a = findNode(nodes, 'a')!;
    expect(a.attrs).toEqual({ href: 'https://example.com/docs' });
    expect(a.children?.[0]).toEqual({ type: 'text', text: '文档' });
  });
});

describe('WBS-P2-22 XSS 防护', () => {
  it('javascript: 协议的 href 被丢弃（a 退化为无 attrs）', () => {
    expect(safeRichHref('javascript:alert(1)')).toBeNull();
    const nodes = buildRichTextNodes(
      doc([block('paragraph', { inlines: [seg({ type: 'link', text: 'x', href: 'javascript:alert(1)' })] })]),
    );
    const a = findNode(nodes, 'a')!;
    expect(a.attrs).toBeUndefined();
  });

  it('data:/vbscript: 及大小写混淆协议拒绝', () => {
    expect(safeRichHref('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeRichHref('vbscript:msgbox(1)')).toBeNull();
    expect(safeRichHref('JaVaScRiPt:alert(1)')).toBeNull();
    expect(safeRichHref('  javascript:alert(1)  ')).toBeNull();
  });

  it('白名单协议保留：http/https/mailto/tel/相对路径/锚点', () => {
    expect(safeRichHref('https://a.com/x')).toBe('https://a.com/x');
    expect(safeRichHref('http://a.com')).toBe('http://a.com');
    expect(safeRichHref('mailto:a@b.com')).toBe('mailto:a@b.com');
    expect(safeRichHref('tel:+8613800000000')).toBe('tel:+8613800000000');
    expect(safeRichHref('/docs/guide')).toBe('/docs/guide');
    expect(safeRichHref('#section-1')).toBe('#section-1');
  });

  it('文本中的 <script> 标签以纯文本数据节点承载（不解析为元素）', () => {
    const payload = '<script>alert("xss")</script>';
    const nodes = buildRichTextNodes(doc([block('paragraph', { inlines: [seg({ text: payload })] })]));
    const leaf = nodes[0]!.children?.[0];
    expect(leaf).toEqual({ type: 'text', text: payload });
    expect(findNode(nodes, 'script')).toBeUndefined();
  });

  it('节点 attrs 只有 href 白名单，无法注入 onerror/onclick/style', () => {
    const evil = seg({ type: 'link', text: 'x', href: 'https://ok.com' }) as RichInline & {
      onerror?: string;
      onclick?: string;
    };
    (evil as any).onerror = 'alert(1)';
    const nodes = buildRichTextNodes(doc([block('paragraph', { inlines: [evil] })]));
    const a = findNode(nodes, 'a')!;
    expect(Object.keys(a.attrs ?? {})).toEqual(['href']);
  });
});

describe('WBS-P2-22 简单文本分流（不进入 rich-text）', () => {
  function textNode(text: string, textStyle?: Partial<ProcessedTextStyle>, role?: ProcessedNode['role']): ProcessedNode {
    return {
      id: 't',
      figmaId: 't',
      name: 'Text',
      originalType: 'TEXT',
      role: role ?? 'text',
      visible: true,
      textContent: text,
      textStyle: {
        fontFamily: 'sans',
        fontWeight: textStyle?.fontWeight ?? 400,
        fontSize: 14,
        lineHeightPx: 20,
        letterSpacing: 0,
        textAlignHorizontal: 'LEFT',
        textAlignVertical: 'TOP',
        ...textStyle,
      } as ProcessedTextStyle,
      size: { width: 80, height: 20 },
      children: [],
    } as ProcessedNode;
  }

  it('纯文本 → 非富文本文档（继续用 <text>）', () => {
    expect(isRichDocument(parseRichText(textNode('普通一句话')))).toBe(false);
  });

  it('粗体/链接/多块 → 富文本文档（用 <rich-text>）', () => {
    expect(isRichDocument(parseRichText(textNode('加粗', { fontWeight: 700 })))).toBe(true);
    expect(isRichDocument(parseRichText(textNode('链接', undefined, 'link')))).toBe(true);
  });
});
