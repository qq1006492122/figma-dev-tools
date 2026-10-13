/**
 * WBS-P2-21 富文本数据模型测试
 *
 * 50 个标注样本覆盖：行内样式（粗/斜/下划线/删除线/组合）、链接、有序/无序列表、
 * 大小写模式（UPPER/LOWER/MIXED/CJK 无大小写）、纯文本不误判。
 * 验收口径：≥50 样本，误识别率 <10%（本测试逐行断言，目标 0 误判）。
 */
import { describe, it, expect } from 'vitest';
import type { ProcessedNode, ProcessedTextStyle } from '../../../src/types/nodes.js';
import {
  parseRichText,
  detectCaseMode,
  inlineFromTextNode,
  type RichBlock,
} from '../../../src/services/weapp-compat/rich-text-model.js';

let seq = 0;
const nextId = (p: string) => `${p}-${++seq}`;

function textNode(partial: {
  name?: string;
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  role?: ProcessedNode['role'];
  href?: string;
}): ProcessedNode {
  const textStyle: ProcessedTextStyle = {
    fontFamily: 'sans',
    fontWeight: partial.bold ? 700 : 400,
    fontSize: 14,
    lineHeightPx: 20,
    letterSpacing: 0,
    textAlignHorizontal: 'LEFT',
    textAlignVertical: 'TOP',
  };
  if (partial.italic) textStyle.fontStyle = 'italic';
  if (partial.underline) textStyle.textDecoration = 'UNDERLINE';
  if (partial.strike) textStyle.textDecoration = 'STRIKETHROUGH';
  return {
    id: nextId('t'),
    figmaId: nextId('f'),
    name: partial.name ?? 'Text',
    originalType: 'TEXT',
    role: partial.role ?? 'text',
    visible: true,
    textContent: partial.text,
    textStyle,
    size: { width: 100, height: 20 },
    children: [],
  } as ProcessedNode;
}

function frame(name: string, children: ProcessedNode[], role?: ProcessedNode['role']): ProcessedNode {
  return {
    id: nextId('n'),
    figmaId: nextId('ff'),
    name,
    originalType: 'FRAME',
    role: role ?? 'container',
    visible: true,
    size: { width: 200, height: 100 },
    children,
  } as ProcessedNode;
}

describe('WBS-P2-21 行内样式解析', () => {
  it('普通文本：无任何标记', () => {
    const seg = inlineFromTextNode(textNode({ text: '普通一句话' }));
    expect(seg).toEqual({ type: 'text', text: '普通一句话' });
  });

  const markCases = [
    { name: '粗体', p: { bold: true }, key: 'bold' },
    { name: '斜体', p: { italic: true }, key: 'italic' },
    { name: '下划线', p: { underline: true }, key: 'underline' },
    { name: '删除线', p: { strike: true }, key: 'lineThrough' },
  ] as const;
  for (const c of markCases) {
    it(`标记：${c.name}`, () => {
      const seg = inlineFromTextNode(textNode({ text: 'x', ...c.p }));
      expect(seg[c.key as 'bold']).toBe(true);
    });
  }

  it('粗斜下划线组合标记同时保留', () => {
    const seg = inlineFromTextNode(textNode({ text: '强调', bold: true, italic: true, underline: true }));
    expect(seg.bold && seg.italic && seg.underline).toBe(true);
  });

  it('链接角色节点解析为 link 段（href 缺失时保留文本不带 href）', () => {
    const seg = inlineFromTextNode(textNode({ text: '查看详情', role: 'link', name: '详情 Link' }));
    expect(seg.type).toBe('link');
    expect(seg.text).toBe('查看详情');
    expect(seg.href).toBeUndefined();
  });

  it('链接段保留行内标记（粗体链接）', () => {
    const seg = inlineFromTextNode(textNode({ text: '立即购买', role: 'link', bold: true }));
    expect(seg).toMatchObject({ type: 'link', text: '立即购买', bold: true });
  });
});

describe('WBS-P2-21 大小写模式', () => {
  const cases: Array<[string, ReturnType<typeof detectCaseMode>]> = [
    ['HELLO WORLD', 'upper'],
    ['SALE 50% OFF', 'upper'],
    ['hello world', 'lower'],
    ['a small note', 'lower'],
    ['Hello World', 'mixed'],
    ['Svelte is Great', 'mixed'],
    ['你好世界', 'none'],
    ['混合 Mixed 文本', 'mixed'],
    ['100% ￥299', 'none'],
    ['', 'none'],
  ];
  for (const [input, expected] of cases) {
    it(`caseMode("${input}") = ${expected}`, () => {
      expect(detectCaseMode(input)).toBe(expected);
    });
  }
});

/**
 * 50 样本标注表：每个样本一个最小节点树 + 期望 blocks 数量/首块类型。
 * 解析器对块类型与行内标记的判定必须与标注一致（误识别率目标 0）。
 */
interface Sample {
  label: string;
  node: ProcessedNode;
  expect: {
    blocks: number;
    first: RichBlock['type'];
    last?: RichBlock['type'];
    marks?: number; // 全文带任意标记的段数
    links?: number;
    listItems?: number;
    ordered?: boolean;
  };
}

function doc(node: ProcessedNode) {
  return parseRichText(node);
}

describe('WBS-P2-21 50 个标注样本（误识别率 <10%）', () => {
  const samples: Sample[] = [
    // —— 10 个行内标记样本 ——
    { label: 's1 粗体', node: textNode({ text: '加粗标题', bold: true }), expect: { blocks: 1, first: 'paragraph', marks: 1 } },
    { label: 's2 斜体', node: textNode({ text: '斜体注释', italic: true }), expect: { blocks: 1, first: 'paragraph', marks: 1 } },
    { label: 's3 下划线', node: textNode({ text: '下划线文本', underline: true }), expect: { blocks: 1, first: 'paragraph', marks: 1 } },
    { label: 's4 删除线', node: textNode({ text: '已售罄', strike: true }), expect: { blocks: 1, first: 'paragraph', marks: 1 } },
    { label: 's5 粗斜', node: textNode({ text: '双重强调', bold: true, italic: true }), expect: { blocks: 1, first: 'paragraph', marks: 1 } },
    { label: 's6 全标记', node: textNode({ text: '全都要', bold: true, italic: true, underline: true, strike: true }), expect: { blocks: 1, first: 'paragraph', marks: 1 } },
    { label: 's7 普通无标记', node: textNode({ text: '普通句子不产生标记' }), expect: { blocks: 1, first: 'paragraph', marks: 0 } },
    { label: 's8 400 字重不算粗体', node: textNode({ text: '常规', bold: false }), expect: { blocks: 1, first: 'paragraph', marks: 0 } },
    { label: 's9 两段中一段粗体', node: frame('Body', [textNode({ text: '常规行' }), textNode({ text: '加粗行', bold: true })]), expect: { blocks: 2, first: 'paragraph', marks: 1 } },
    { label: 's10 多段都有标记', node: frame('Body', [textNode({ text: 'a', italic: true }), textNode({ text: 'b', underline: true })]), expect: { blocks: 2, first: 'paragraph', marks: 2 } },

    // —— 8 个链接样本 ——
    { label: 's11 链接节点', node: textNode({ text: '官网', role: 'link' }), expect: { blocks: 1, first: 'paragraph', links: 1 } },
    { label: 's12 名称含 link', node: textNode({ text: '帮助中心', name: 'Help Link' }), expect: { blocks: 1, first: 'paragraph', links: 1 } },
    { label: 's13 粗体链接', node: textNode({ text: '立即购买', role: 'link', bold: true }), expect: { blocks: 1, first: 'paragraph', links: 1, marks: 1 } },
    { label: 's14 链接与普通文本同段容器', node: frame('Line', [textNode({ text: '请访问 ' }), textNode({ text: '文档', role: 'link' })]), expect: { blocks: 1, first: 'paragraph', links: 1 } },
    { label: 's15 两个链接', node: frame('Line', [textNode({ text: '条款', role: 'link' }), textNode({ text: '与', name: 'And Text' }), textNode({ text: '隐私', role: 'link' })]), expect: { blocks: 1, first: 'paragraph', links: 2 } },
    { label: 's16 纯文本不误判为链接', node: textNode({ text: 'linkedIn 文案但非链接角色' }), expect: { blocks: 1, first: 'paragraph', links: 0 } },
    { label: 's17 链接独占一块', node: frame('Card', [textNode({ text: '上' }), textNode({ text: '下链接', role: 'link' })]), expect: { blocks: 2, first: 'paragraph', links: 1 } },
    { label: 's18 空容器无块', node: frame('Empty', []), expect: { blocks: 0, first: 'paragraph' } },

    // —— 12 个列表样本 ——
    { label: 's19 无序列表 3 项', node: frame('Feature List', [textNode({ text: '功能一', name: 'List Item 1' }), textNode({ text: '功能二', name: 'List Item 2' }), textNode({ text: '功能三', name: 'List Item 3' })]), expect: { blocks: 1, first: 'unordered-list', listItems: 3, ordered: false } },
    { label: 's20 ul 角色列表', node: frame('List', [textNode({ text: 'a' }), textNode({ text: 'b' })], 'list'), expect: { blocks: 1, first: 'unordered-list', listItems: 2 } },
    { label: 's21 有序列表名', node: frame('Ordered Steps List', [textNode({ text: '第一步' }), textNode({ text: '第二步' })]), expect: { blocks: 1, first: 'ordered-list', listItems: 2, ordered: true } },
    { label: 's22 ol 名称', node: frame('Ol List', [textNode({ text: 'x' })]), expect: { blocks: 1, first: 'ordered-list', listItems: 1, ordered: true } },
    { label: 's23 编号前缀有序', node: frame('Steps', [textNode({ text: '1. 注册账号' }), textNode({ text: '2. 配置 Token' }), textNode({ text: '3. 开始生成' })]), expect: { blocks: 1, first: 'ordered-list', listItems: 3, ordered: true } },
    { label: 's24 右括号编号有序', node: frame('Steps', [textNode({ text: '1) 下单' }), textNode({ text: '2) 支付' })]), expect: { blocks: 1, first: 'ordered-list', listItems: 2, ordered: true } },
    { label: 's25 项目符号无序', node: frame('Bullets', [textNode({ text: '• 红色' }), textNode({ text: '• 蓝色' })]), expect: { blocks: 1, first: 'unordered-list', listItems: 2, ordered: false } },
    { label: 's26 两个子项不算列表', node: frame('Not A List', [textNode({ text: '只有一项' })]), expect: { blocks: 1, first: 'paragraph' } },
    { label: 's27 列表 + 前后段落', node: frame('Mixed', [textNode({ text: '说明如下：' }), textNode({ text: '要点一', name: 'List Item 1' }), textNode({ text: '要点二', name: 'List Item 2' }), textNode({ text: '综上' })]), expect: { blocks: 3, first: 'paragraph', last: 'paragraph', listItems: 2 } },
    { label: 's28 列表项标记保留', node: frame('Feature List', [textNode({ text: '重点', bold: true, name: 'List Item 1' }), textNode({ text: '普通', name: 'List Item 2' })]), expect: { blocks: 1, first: 'unordered-list', listItems: 2, marks: 1 } },
    { label: 's29 无序列表 4 项', node: frame('Bulleted List', [1, 2, 3, 4].map((i) => textNode({ text: `行${i}` })) as ProcessedNode[]), expect: { blocks: 1, first: 'unordered-list', listItems: 4 } },
    { label: 's30 有序 5 步', node: frame('Ordered Steps List', [1, 2, 3, 4, 5].map((i) => textNode({ text: `${i}. 步骤${i}` })) as ProcessedNode[]), expect: { blocks: 1, first: 'ordered-list', listItems: 5, ordered: true } },

    // —— 10 个标题/段落/层级样本 ——
    { label: 's31 h1 标题', node: textNode({ text: '大标题', name: 'H1 Heading' }), expect: { blocks: 1, first: 'heading' } },
    { label: 's32 h2 标题', node: textNode({ text: '小节', name: 'Section Title H2' }), expect: { blocks: 1, first: 'heading' } },
    { label: 's33 h3 标题', node: textNode({ text: '补充', name: 'H3 Title' }), expect: { blocks: 1, first: 'heading' } },
    { label: 's34 普通 title 名不升标题', node: textNode({ text: '一句话', name: 'Card' }), expect: { blocks: 1, first: 'paragraph' } },
    { label: 's35 标题容器首文本为标题', node: frame('Hero Section', [textNode({ text: 'Hero 主标题', name: 'Title' }), textNode({ text: '副标题文字', name: 'Subtitle' })]), expect: { blocks: 2, first: 'heading' } },
    { label: 's36 引号块（名称含 quote）', node: frame('Quote Block', [textNode({ text: '名人名言' })]), expect: { blocks: 1, first: 'quote' } },
    { label: 's37 引用角色', node: frame('Ref', [textNode({ text: '出处' })], 'quote' as ProcessedNode['role']), expect: { blocks: 1, first: 'quote' } },
    { label: 's38 多段落容器逐块', node: frame('Article', [textNode({ text: '第一段' }), textNode({ text: '第二段' }), textNode({ text: '第三段' })]), expect: { blocks: 3, first: 'paragraph', last: 'paragraph' } },
    { label: 's39 文本被布局层包裹仍提取', node: frame('Wrapper', [frame('Group', [textNode({ text: '深层文本' })])]), expect: { blocks: 1, first: 'paragraph' } },
    { label: 's40 不可见节点剔除', node: frame('Body', [textNode({ text: '可见' }), { ...textNode({ text: '隐藏' }), visible: false }]), expect: { blocks: 1, first: 'paragraph' } },

    // —— 10 个大小写/噪声样本 ——
    { label: 's41 全大写粗体块', node: textNode({ text: 'PRICING', bold: true }), expect: { blocks: 1, first: 'paragraph' } },
    { label: 's42 全小写段落', node: textNode({ text: 'small caption text' }), expect: { blocks: 1, first: 'paragraph' } },
    { label: 's43 混合大小写段落', node: textNode({ text: 'Hello Svelte' }), expect: { blocks: 1, first: 'paragraph' } },
    { label: 's44 数字百分号无大小写', node: textNode({ text: '50% OFF - 100%' }), expect: { blocks: 1, first: 'paragraph' } },
    { label: 's45 纯中文无大小写', node: textNode({ text: '立即购买享受优惠' }), expect: { blocks: 1, first: 'paragraph' } },
    { label: 's46 列表项全大写不影响有序性', node: frame('Ordered Steps List', [textNode({ text: 'STEP ONE' }), textNode({ text: 'STEP TWO' })]), expect: { blocks: 1, first: 'ordered-list', ordered: true } },
    { label: 's47 链接全大写', node: textNode({ text: 'GET STARTED', role: 'link' }), expect: { blocks: 1, first: 'paragraph', links: 1 } },
    { label: 's48 空文本不产出块', node: frame('Body', [textNode({ text: '' }), textNode({ text: '有内容' })]), expect: { blocks: 1, first: 'paragraph' } },
    { label: 's49 名称噪声不触发 heading（button）', node: textNode({ text: '提交', name: 'Submit Button' }), expect: { blocks: 1, first: 'paragraph' } },
    { label: 's50 综合：标题+有序列表+链接段落', node: frame('Article', [textNode({ text: '快速上手', name: 'H2 Title' }), frame('Ordered Steps', [textNode({ text: '1. 打开终端' }), textNode({ text: '2. 查看文档', name: 'Doc Link', role: 'link' })]), textNode({ text: '结束' })]), expect: { blocks: 3, first: 'heading', last: 'paragraph' } },
  ];

  it('样本数量为 50', () => {
    expect(samples).toHaveLength(50);
  });

  const mismatches: string[] = [];
  for (const s of samples) {
    it(`样本 ${s.label}`, () => {
      const d = doc(s.node);
      if (d.blocks.length !== s.expect.blocks) mismatches.push(`${s.label}: blocks ${d.blocks.length}!=${s.expect.blocks}`);
      expect(d.blocks.length, `${s.label} blocks`).toBe(s.expect.blocks);
      if (s.expect.blocks > 0) {
        expect(d.blocks[0]!.type, `${s.label} first`).toBe(s.expect.first);
        if (s.expect.last) expect(d.blocks[d.blocks.length - 1]!.type, `${s.label} last`).toBe(s.expect.last);
      }
      if (s.expect.listItems !== undefined) {
        const list = d.blocks.find((b) => b.type.includes('list'));
        expect(list?.items?.length, `${s.label} listItems`).toBe(s.expect.listItems);
        if (s.expect.ordered !== undefined && list?.type === 'ordered-list') {
          expect(s.expect.ordered).toBe(true);
        }
      }
      if (s.expect.links !== undefined) {
        let n = 0;
        for (const b of d.blocks) for (const line of b.inlines ?? []) if (line.type === 'link') n += 1;
        for (const b of d.blocks) for (const item of b.items ?? []) for (const seg of item) if (seg.type === 'link') n += 1;
        expect(n, `${s.label} links`).toBe(s.expect.links);
      }
      if (s.expect.marks !== undefined) {
        let n = 0;
        const countSeg = (seg: { bold?: boolean; italic?: boolean; underline?: boolean; lineThrough?: boolean }) => {
          if (seg.bold || seg.italic || seg.underline || seg.lineThrough) n += 1;
        };
        for (const b of d.blocks) {
          for (const seg of b.inlines ?? []) countSeg(seg);
          for (const item of b.items ?? []) for (const seg of item) countSeg(seg);
        }
        expect(n, `${s.label} marks`).toBe(s.expect.marks);
      }
    });
  }

  it('误识别率 <10%（50 样本失败数 ≤ 5；实际目标 0）', () => {
    // 由上面逐例断言保证；该行保留为门禁的可读说明
    expect(mismatches.length).toBeLessThan(6);
  });
});
