/**
 * v1.4.19 T22 语义推断器测试（TR-22.1：列表数据 + 语义命名各 ≥1 fixture）
 *
 * 覆盖：
 * - list-data：≥3 等宽同构含文本子项 → interface + mock + React .map() / Vue v-for 示例；
 *   宽度不等 / 不足 3 项 / 无文本 → 不识别；命中后子树不重复嵌套识别；
 * - name：generic 名 + ASCII 文本标签/语义角色 → PascalCase 建议；
 *   CJK 无 ASCII 不臆造；纯布局包装层不建议；重名追加序号；
 * - formatSemanticComments：slash / jsdoc 两种前缀与空结果。
 */
import { describe, expect, it } from 'vitest';

import {
  createSemanticInferrer,
  formatSemanticComments,
} from '../../src/services/semantic-inferrer.js';
import type { ProcessedNode } from '../../src/types/nodes.js';

let idSeq = 0;

/**
 * 构造最小节点
 *
 * @param partial - 覆盖字段
 * @returns 合法 ProcessedNode
 */
function makeNode(partial: Partial<ProcessedNode> & { name: string }): ProcessedNode {
  idSeq += 1;
  return {
    id: `s-${idSeq}`,
    figmaId: partial.figmaId ?? `40:${idSeq}`,
    originalType: 'FRAME',
    role: 'container',
    visible: true,
    clipsContent: false,
    size: { width: 100, height: 100 },
    children: [],
    ...partial,
  };
}

/**
 * 文本节点快捷夹具
 *
 * @param name - 节点名
 * @param textContent - 文本内容
 * @returns TEXT 角色节点
 */
function textNode(name: string, textContent: string): ProcessedNode {
  return makeNode({ name, originalType: 'TEXT', role: 'text', textContent, size: { width: 80, height: 16 } });
}

describe('semantic-inferrer: 列表 → 数据结构（React）', () => {
  it('fixture：Article Cards 4 张等宽同构卡片 → ArticleCardItem + mock + .map()', () => {
    const card = (index: number): ProcessedNode =>
      makeNode({
        name: `Card ${index}`,
        size: { width: 280, height: 160 },
        children: [
          textNode('Title', 'Breaking news headline'),
          textNode('Price', '$199'),
          textNode('Meta', '2 hours ago'),
        ],
      });
    const root = makeNode({
      name: 'Article Cards',
      size: { width: 1200, height: 160 },
      children: [card(1), card(2), card(3), card(4)],
    });

    const result = createSemanticInferrer().infer(root, { framework: 'react' });
    expect(result.counts.dataStructures).toBe(1);
    const structure = result.dataStructures[0];
    expect(structure?.repeatedCount).toBe(4);
    expect(structure?.itemComponentName).toBe('ArticleCard');
    expect(structure?.interfaceName).toBe('ArticleCardItem');
    // 字段：id 前置；price 命中数值语义；字段名来自文本节点命名
    expect(structure?.fields.map((f) => f.name)).toEqual(['id', 'title', 'price', 'meta']);
    expect(structure?.fields.find((f) => f.name === 'price')?.tsType).toBe('number');
    expect(structure?.interfaceCode).toContain('interface ArticleCardItem {');
    expect(structure?.interfaceCode).toContain('title: string;');
    expect(structure?.mockCode).toContain('const articleCards: ArticleCardItem[] = [');
    expect(structure?.mockCode).toContain('id: 1');
    expect(structure?.renderHint).toContain('.map(');
    expect(structure?.renderHint).toContain('<ArticleCard key={item.id}');
  });

  it('fixture：Vue 框架 → v-for 渲染示例', () => {
    const row = (index: number): ProcessedNode =>
      makeNode({
        name: `Row ${index}`,
        size: { width: 320, height: 56 },
        children: [textNode('Name', 'Alice'), textNode('Email', 'a@example.com')],
      });
    const root = makeNode({ name: 'Users List', children: [row(1), row(2), row(3)] });

    const result = createSemanticInferrer().infer(root, { framework: 'vue' });
    const structure = result.dataStructures[0];
    expect(structure?.itemComponentName).toBe('UserCard');
    expect(structure?.renderHint).toContain('v-for="item in userCards"');
    expect(structure?.renderHint).toContain(':key="item.id"');
  });

  it('fixture：宽度差 >4px（参差布局）不识别为列表', () => {
    const root = makeNode({
      name: 'Mixed Layout',
      children: [
        makeNode({ size: { width: 280, height: 120 }, children: [textNode('T', 'A')] }),
        makeNode({ size: { width: 300, height: 120 }, children: [textNode('T', 'B')] }),
        makeNode({ size: { width: 280, height: 120 }, children: [textNode('T', 'C')] }),
      ],
    });
    expect(createSemanticInferrer().infer(root, { framework: 'react' }).counts.dataStructures).toBe(0);
  });

  it('fixture：仅 2 个重复子项不达阈值；无文本的图标排不识别', () => {
    const two = makeNode({
      name: 'Pair',
      children: [
        makeNode({ size: { width: 80, height: 80 }, children: [textNode('T', 'A')] }),
        makeNode({ size: { width: 80, height: 80 }, children: [textNode('T', 'B')] }),
      ],
    });
    expect(createSemanticInferrer().infer(two, { framework: 'react' }).counts.dataStructures).toBe(0);

    const iconRow = makeNode({
      name: 'Icon Row',
      children: [
        makeNode({ originalType: 'VECTOR', role: 'icon', size: { width: 24, height: 24 } }),
        makeNode({ originalType: 'VECTOR', role: 'icon', size: { width: 24, height: 24 } }),
        makeNode({ originalType: 'VECTOR', role: 'icon', size: { width: 24, height: 24 } }),
      ],
    });
    expect(createSemanticInferrer().infer(iconRow, { framework: 'react' }).counts.dataStructures).toBe(0);
  });

  it('fixture：列表卡片内部的等宽小元素不产生嵌套重复上报', () => {
    const card = (index: number): ProcessedNode =>
      makeNode({
        name: `Product Card ${index}`,
        size: { width: 240, height: 200 },
        children: [
          makeNode({
            name: 'Thumb Row',
            size: { width: 240, height: 24 },
            children: [
              makeNode({ originalType: 'VECTOR', role: 'icon', size: { width: 20, height: 20 } }),
              makeNode({ originalType: 'VECTOR', role: 'icon', size: { width: 20, height: 20 } }),
              makeNode({ originalType: 'VECTOR', role: 'icon', size: { width: 20, height: 20 } }),
            ],
          }),
          textNode('Title', `Product ${index}`),
        ],
      });
    const root = makeNode({ name: 'Grid', children: [card(1), card(2), card(3)] });

    const result = createSemanticInferrer().infer(root, { framework: 'react' });
    expect(result.dataStructures).toHaveLength(1);
    expect(result.dataStructures[0]?.repeatedCount).toBe(3);
  });
});

describe('semantic-inferrer: 语义命名', () => {
  it('fixture：Frame 12 + 按钮角色 + 文本 Submit Order → SubmitOrderButton', () => {
    const root = makeNode({
      name: 'Frame 12',
      role: 'button',
      originalType: 'COMPONENT',
      children: [textNode('Label', 'Submit Order')],
    });
    const result = createSemanticInferrer().infer(root, { framework: 'react' });
    expect(result.nameSuggestions).toHaveLength(1);
    expect(result.nameSuggestions[0]?.suggestedName).toBe('SubmitOrderButton');
    expect(result.nameSuggestions[0]?.reason).toContain('Submit Order');
  });

  it('fixture：矩形 24（CJK generic）+ 仅中文文本 → 不臆造英文名', () => {
    const root = makeNode({
      name: '矩形 24',
      children: [textNode('文案', '立即下单')],
    });
    expect(createSemanticInferrer().infer(root, { framework: 'react' }).counts.nameSuggestions).toBe(0);
  });

  it('fixture：无语义信号的纯布局包装层不建议命名（与 hierarchy-fixer 协同）', () => {
    const root = makeNode({
      name: 'Group 3',
      children: [makeNode({ name: 'Spacer A' }), makeNode({ name: 'Spacer B' })],
    });
    expect(createSemanticInferrer().infer(root, { framework: 'react' }).counts.nameSuggestions).toBe(0);
  });

  it('fixture：两个相同标签的 generic 按钮 → 重名追加 2 序号', () => {
    const root = makeNode({
      name: 'Page',
      children: [
        makeNode({
          name: 'Frame 1',
          role: 'button',
          originalType: 'COMPONENT',
          children: [textNode('Label', 'Read More')],
        }),
        makeNode({
          name: 'Group 8',
          role: 'button',
          originalType: 'COMPONENT',
          children: [textNode('Label', 'Read More')],
        }),
      ],
    });
    const names = createSemanticInferrer().infer(root, { framework: 'react' }).nameSuggestions.map((s) => s.suggestedName);
    expect(names).toEqual(['ReadMoreButton', 'ReadMoreButton2']);
  });

  it('fixture：generic 矢量组 + 语义命名后代 arrow right → ArrowRightIcon；已有语义名不建议', () => {
    const root = makeNode({
      name: 'Vector 2',
      role: 'icon',
      originalType: 'FRAME',
      children: [makeNode({ name: 'arrow right', originalType: 'VECTOR', role: 'icon', size: { width: 24, height: 24 } })],
    });
    const result = createSemanticInferrer().infer(root, { framework: 'react' });
    expect(result.nameSuggestions.some((s) => s.suggestedName === 'ArrowRightIcon')).toBe(true);

    const alreadyNamed = makeNode({
      name: 'SubmitOrderButton',
      role: 'button',
      children: [textNode('Label', 'Submit Order')],
    });
    expect(createSemanticInferrer().infer(alreadyNamed, { framework: 'react' }).counts.nameSuggestions).toBe(0);
  });
});

describe('semantic-inferrer: formatSemanticComments', () => {
  it('slash 与 jsdoc 前缀正确；无建议返回空数组', () => {
    const empty = createSemanticInferrer().infer(makeNode({ name: 'Empty' }), { framework: 'react' });
    expect(formatSemanticComments(empty, 'slash')).toEqual([]);
    expect(formatSemanticComments(empty, 'jsdoc')).toEqual([]);

    const root = makeNode({
      name: 'Article Cards',
      children: [
        makeNode({ size: { width: 200, height: 120 }, children: [textNode('Title', 'One')] }),
        makeNode({ size: { width: 200, height: 120 }, children: [textNode('Title', 'Two')] }),
        makeNode({ size: { width: 200, height: 120 }, children: [textNode('Title', 'Three')] }),
      ],
    });
    const result = createSemanticInferrer().infer(root, { framework: 'react' });
    const slash = formatSemanticComments(result, 'slash');
    const jsdoc = formatSemanticComments(result, 'jsdoc');
    expect(slash[0]).toContain('Data-driven structure hints');
    expect(slash.every((line) => line.startsWith('//'))).toBe(true);
    expect(jsdoc.some((line) => line.startsWith(' *'))).toBe(true);
    expect(jsdoc.some((line) => line.includes('interface ArticleCardItem'))).toBe(true);
  });
});
