/**
 * 小程序列表/条件结构推断器测试（WBS-P0-11）
 *
 * 契约：ROADMAP P0-1.1。
 *  - 重复组：同 componentKey / 同名同构 ≥3 → wx:for 模型（wx:key="id"）
 *  - 显隐语义默认只进建议报告；inference.conditions 打开或显式声明才生成条件绑定
 *  - 嵌套循环别名/数据路径不污染；block 承载指令时禁止任何样式属性
 * 纯函数、零 I/O。
 */
import { describe, it, expect } from 'vitest';

import {
  inferWeappStructure,
  assertBlockHasNoStyle,
  safeIdentifier,
  type ProcessedNodeLike,
  type ExplicitConditionInput,
} from '../../src/services/weapp-structure-inferrer.js';

// ============ fixtures ============

let seq = 0;
function n(partial: Partial<ProcessedNodeLike> & Pick<ProcessedNodeLike, 'name'>): ProcessedNodeLike {
  const id = partial.id ?? `n${++seq}`;
  return {
    id,
    figmaId: id,
    name: partial.name,
    originalType: partial.originalType ?? 'FRAME',
    role: partial.role ?? 'container',
    visible: partial.visible ?? true,
    size: partial.size ?? { width: 100, height: 40 },
    children: partial.children ?? [],
    ...partial,
  };
}
function frame(name: string, children: ProcessedNodeLike[] = [], extra: Partial<ProcessedNodeLike> = {}): ProcessedNodeLike {
  return n({ name, children, ...extra });
}
function text(name: string, content: string): ProcessedNodeLike {
  return n({ name, originalType: 'TEXT', role: 'text', textContent: content, size: { width: 50, height: 16 } });
}
function card(name: string, title: string, componentKey?: string): ProcessedNodeLike {
  return frame(name, [text('Title', title)], {
    originalType: componentKey ? 'INSTANCE' : 'FRAME',
    role: 'card',
    componentKey,
    size: { width: 120, height: 80 },
  });
}

// ============ 列表识别 ============

describe('P0-11 列表推断', () => {
  it('3 个相同 componentKey 实例 → 高置信列表，wx:key=id，绑定在元素上', () => {
    const root = frame('List', [
      card('Row', 'A', 'key-1'),
      card('Row', 'B', 'key-1'),
      card('Row', 'C', 'key-1'),
    ]);
    const r = inferWeappStructure(root);
    expect(r.lists).toHaveLength(1);
    const list = r.lists[0];
    expect(list.matchType).toBe('component-key');
    expect(list.confidence).toBe('high');
    expect(list.repeatedChildIds).toHaveLength(3);
    expect(list.wxKey).toBe('id');
    expect(list.wrapper).toBe('element');
    expect(list.dataKey).toBe('list');
  });

  it('仅 2 个相同 componentKey → 不判为列表（阈值防误判）', () => {
    const root = frame('List', [card('Row', 'A', 'key-1'), card('Row', 'B', 'key-1')]);
    expect(inferWeappStructure(root).lists).toHaveLength(0);
  });

  it('4 个同名同构（文本不同、尺寸略不同）FRAME → 中置信列表', () => {
    const root = frame('Card List', [
      frame('Card', [text('Title', 'A')], { size: { width: 120, height: 80 } }),
      frame('Card', [text('Title', 'B')], { size: { width: 121, height: 80 } }),
      frame('Card', [text('Title', 'C')], { size: { width: 120, height: 82 } }),
      frame('Card', [text('Title', 'D')], { size: { width: 120, height: 80 } }),
    ]);
    const r = inferWeappStructure(root);
    expect(r.lists).toHaveLength(1);
    expect(r.lists[0].matchType).toBe('homologous');
    expect(r.lists[0].confidence).toBe('medium');
    expect(r.lists[0].dataKey).toBe('cardList');
  });

  it('混合子节点（标题 + 3 卡片 + 按钮）：仅 3 个卡片入组，其它兄弟不参与', () => {
    const c1 = card('Card', 'A');
    const c2 = card('Card', 'B');
    const c3 = card('Card', 'C');
    const root = frame('Panel', [text('Header', '头部'), c1, c2, c3, frame('Button', [text('Label', '更多')])]);
    const r = inferWeappStructure(root);
    expect(r.lists).toHaveLength(1);
    expect(r.lists[0].repeatedChildIds).toEqual([c1.id, c2.id, c3.id]);
  });

  it('3 个同名但内部结构不同 → 不判为列表（同构是硬条件）', () => {
    const root = frame('List', [
      frame('Row', [text('T', 'A'), text('Sub', 'a')]),
      frame('Row', [text('T', 'B')]),
      frame('Row', [frame('Inner', [])]),
    ]);
    expect(inferWeappStructure(root).lists).toHaveLength(0);
  });

  it('3 个裸 TEXT 兄弟 → 不判为列表（保守：不把文本碎片误判成循环）', () => {
    const root = frame('Paragraphs', [text('Line', '一'), text('Line', '二'), text('Line', '三')]);
    expect(inferWeappStructure(root).lists).toHaveLength(0);
  });

  it('inference.list=false 一键关闭：不产生任何列表', () => {
    const root = frame('Card List', [card('Card', 'A', 'k'), card('Card', 'B', 'k'), card('Card', 'C', 'k')]);
    expect(inferWeappStructure(root, { list: false }).lists).toHaveLength(0);
  });

  it('minRepeated=2 时 2 个同构卡片即可识别', () => {
    const root = frame('Pair', [card('Card', 'A'), card('Card', 'B')]);
    expect(inferWeappStructure(root, { minRepeated: 2 }).lists).toHaveLength(1);
  });
});

// ============ placeholder data schema ============

describe('P0-11 placeholder data schema', () => {
  it('根列表产出 data.<key> 占位数组：行 id 稳定、文本字段按相对结构映射真实内容', () => {
    const root = frame('Card List', [
      frame('Card', [text('Title', '标题A')]),
      frame('Card', [text('Title', '标题B')]),
      frame('Card', [text('Title', '标题C')]),
    ]);
    const r = inferWeappStructure(root);
    const data = r.placeholderData as Record<string, Array<Record<string, string>>>;
    expect(data.cardList).toHaveLength(3);
    expect(data.cardList[0]).toEqual({ id: 'item-0', title: '标题A' });
    expect(data.cardList[2]).toEqual({ id: 'item-2', title: '标题C' });
    // wx:for 使用的 dataKey 与 schema 一致
    expect(r.lists[0].dataKey).toBe('cardList');
  });
});

// ============ 嵌套循环 ============

describe('P0-11 嵌套循环', () => {
  it('卡片内标签行：内层列表挂到外层 item 字段上，别名全局唯一、数据路径不污染', () => {
    const makeCardWithTags = (suffix: string) =>
      frame('Card', [
        text('Title', `卡${suffix}`),
        frame('Tag Row', [
          frame('Tag', [text('Label', `${suffix}-1`)]),
          frame('Tag', [text('Label', `${suffix}-2`)]),
          frame('Tag', [text('Label', `${suffix}-3`)]),
        ]),
      ]);
    const root = frame('Card List', [makeCardWithTags('A'), makeCardWithTags('B'), makeCardWithTags('C')]);

    const r = inferWeappStructure(root);
    expect(r.lists).toHaveLength(2); // 外层 1 个 + 内层原型 1 个（不随 3 个卡片重复展开）

    const outer = r.lists.find((l) => l.parentListId === null)!;
    const inner = r.lists.find((l) => l.parentListId === outer.id)!;
    expect(inner).toBeDefined();
    expect(outer.dataPath).toBe('cardList');
    expect(inner.dataPath).toBe(`${outer.itemAlias}.tagRow`);

    const aliases = r.lists.map((l) => l.itemAlias);
    expect(new Set(aliases).size).toBe(aliases.length); // 别名无碰撞
    expect(outer.itemAlias).not.toBe(inner.itemAlias);

    const data = r.placeholderData as Record<string, any[]>;
    expect(data.cardList).toHaveLength(3);
    expect(data.cardList[0].title).toBe('卡A');
    expect(data.cardList[0].tagRow).toHaveLength(3);
    expect(data.cardList[0].tagRow[0]).toEqual({ id: 'item-0', label: 'A-1' });
    expect(data.cardList[2].tagRow[2]).toEqual({ id: 'item-2', label: 'C-3' });
  });
});

// ============ 条件渲染 ============

describe('P0-11 条件语义（默认保守）', () => {
  it('名称含 modal 默认只进建议报告：不生成绑定、不写 data', () => {
    const root = frame('Screen', [frame('Confirm Modal', [text('Body', '确认吗？')])]);
    const r = inferWeappStructure(root);
    expect(r.conditionSuggestions).toHaveLength(1);
    expect(r.conditionSuggestions[0].signal).toBe('name:modal');
    expect(r.conditionSuggestions[0].suggestedDataKey).toBe('showConfirmModal');
    expect(r.conditions).toHaveLength(0);
    expect('showConfirmModal' in r.placeholderData).toBe(false);
  });

  it('visible=false 节点产生 prototype-visibility 建议（仍不自动绑定）', () => {
    const root = frame('Screen', [frame('Banner', [], { visible: false })]);
    const r = inferWeappStructure(root);
    expect(r.conditionSuggestions.some((s) => s.signal === 'prototype-visibility')).toBe(true);
    expect(r.conditions).toHaveLength(0);
  });

  it('inference.conditions=true：名称信号绑定 hidden="{{!showXxx}}"，占位 data 默认可见', () => {
    const root = frame('Screen', [frame('Confirm Modal', [])]);
    const r = inferWeappStructure(root, { conditions: true });
    expect(r.conditions).toHaveLength(1);
    const binding = r.conditions[0];
    expect(binding.directive).toBe('hidden');
    expect(binding.branch).toBe('standalone');
    expect(binding.expression).toBe('!showConfirmModal');
    expect(binding.source).toBe('name-signal');
    expect(r.placeholderData.showConfirmModal).toBe(true);
  });

  it('显式 if/elif/else 链（用户确认）即使 conditions=false 也生效，按节点顺序排分支', () => {
    const tab1 = frame('Tab Home', []);
    const tab2 = frame('Tab Profile', []);
    const tab3 = frame('Tab Empty', []);
    const root = frame('Tabs', [tab1, tab2, tab3]);
    const explicit: ExplicitConditionInput[] = [
      { nodeId: tab1.id, groupId: 'tabs', expression: "activeTab === 'home'" },
      { nodeId: tab2.id, groupId: 'tabs', expression: "activeTab === 'profile'" },
      { nodeId: tab3.id, groupId: 'tabs', isElse: true },
    ];
    const r = inferWeappStructure(root, { list: false }, explicit);
    expect(r.conditions.map((c) => c.branch)).toEqual(['if', 'elif', 'else']);
    expect(r.conditions.map((c) => c.directive)).toEqual(['wx:if', 'wx:elif', 'wx:else']);
    expect(r.conditions[2].expression).toBeNull();
  });

  it('显式条件引用不存在节点 → warning 且不生成绑定', () => {
    const r = inferWeappStructure(frame('Screen', []), { list: false }, [{ nodeId: 'ghost', expression: 'x' }]);
    expect(r.conditions).toHaveLength(0);
    expect(r.warnings.some((w) => w.code === 'FDT-INFER-COND-NODE-NOT-FOUND')).toBe(true);
  });

  it('同组节点不在同一父级 → warning，拒绝拼成 elif 链（避免作用域错乱）', () => {
    const a = frame('Tab A', []);
    const inner = frame('Inner', [frame('Tab B', [])]);
    const root = frame('Screen', [frame('Wrap', [a]), inner]);
    const b = (inner.children![0] as ProcessedNodeLike);
    const r = inferWeappStructure(root, { list: false }, [
      { nodeId: a.id, groupId: 'g', expression: 'x===1' },
      { nodeId: b.id, groupId: 'g', isElse: true },
    ]);
    expect(r.conditions).toHaveLength(0);
    expect(r.warnings.some((w) => w.code === 'FDT-INFER-COND-GROUP-PARENT')).toBe(true);
  });
});

// ============ block 无样式泄漏 ============

describe('P0-11 block 安全', () => {
  it('assertBlockHasNoStyle：只含控制指令通过；出现 class/style 立即抛错', () => {
    expect(() => assertBlockHasNoStyle({ 'wx:if': 'x', 'wx:for': '{{items}}' })).not.toThrow();
    expect(() => assertBlockHasNoStyle({ 'wx:if': 'x', class: 'card' })).toThrow(/block/i);
    expect(() => assertBlockHasNoStyle({ style: 'color:red' })).toThrow(/block/i);
  });
});

// ============ 标识符安全（R1 QA：图层名「10」导致 Svelte/WXML 非法标识符） ============

describe('safeIdentifier 列表标识符守卫', () => {
  const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

  it('纯数字名称 → 加语义前缀并保留数字尾缀', () => {
    expect(safeIdentifier('10', 'list')).toBe('list10');
    expect(safeIdentifier('10', 'item')).toBe('item10');
  });

  it('正常驼峰名称保持不变', () => {
    expect(safeIdentifier('cardList', 'list')).toBe('cardList');
    expect(safeIdentifier('card', 'item')).toBe('card');
  });

  it('空/纯符号 → 使用前缀兜底', () => {
    expect(safeIdentifier('', 'list')).toBe('list');
    expect(safeIdentifier('---', 'item')).toBe('item');
  });

  it('JS 保留字 → 前缀拼接', () => {
    expect(safeIdentifier('class', 'item')).toBe('itemClass');
    expect(safeIdentifier('for', 'list')).toBe('listFor');
  });

  it('同名同构重复组且容器名为「10」时，dataPath/别名/索引均为合法标识符（端到端回归）', () => {
    const root = frame('10', [
      frame('10', [], { size: { width: 10, height: 10 } }),
      frame('10', [], { size: { width: 10, height: 10 } }),
      frame('10', [], { size: { width: 10, height: 10 } }),
    ]);
    const r = inferWeappStructure(root);
    expect(r.lists).toHaveLength(1);
    const list = r.lists[0]!;
    expect(list.dataPath).toMatch(IDENT);
    expect(list.itemAlias).toMatch(IDENT);
    expect(list.indexAlias).toMatch(IDENT);
    expect(list.dataPath).not.toMatch(/^\d/);
    expect(list.itemAlias).not.toMatch(/^\d/);
    // 占位数据键名同样合法
    for (const key of Object.keys(r.placeholderData)) expect(key).toMatch(IDENT);
  });
});
