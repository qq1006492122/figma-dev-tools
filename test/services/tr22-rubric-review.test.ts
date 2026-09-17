/**
 * v1.4.19 TR-22.2 / TR-21.2 代表性 fixture 推断质量评审（rubric 1-5）
 *
 * 10 个代表性组件 fixture 同时覆盖：
 * - T21 四类：grid / icons / dark-mode / motion；
 * - T22 五类交互：form(提交+校验) / modal / carousel / tabs / accordion；
 * - T22 列表数据化与语义命名。
 *
 * 评分锚点（与 AC-14 一致）：
 * 5 = 主/次信号全中、零误报、建议可直接采纳；
 * 4 = 主信号全中，≤1 个次要缺失或 1 条边界误报；
 * 3 = 主信号部分正确；2 = 弱/多条误报；1 = 错误或无输出。
 *
 * 确定性计分：score = clamp(5 - 3×主信号缺失数 - 次信号缺失数 - 误报数, 1, 5)。
 * 综合分须 ≥4.0；评审表（含实际命中数）同步回填 tasks.md 作为证据。
 */
import { describe, expect, it } from 'vitest';

import { createInteractionInferrer } from '../../src/services/interaction-inferrer.js';
import { createSemanticInferrer } from '../../src/services/semantic-inferrer.js';
import { createSmartInferrer } from '../../src/services/smart-inferrer.js';
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
    id: `r-${idSeq}`,
    figmaId: partial.figmaId ?? `60:${idSeq}`,
    originalType: 'FRAME',
    role: 'container',
    visible: true,
    clipsContent: false,
    size: { width: 100, height: 40 },
    children: [],
    ...partial,
  };
}

/**
 * 文本节点夹具
 *
 * @param name - 节点名
 * @param textContent - 文本
 * @returns TEXT 节点
 */
function text(name: string, textContent: string): ProcessedNode {
  return makeNode({ name, originalType: 'TEXT', role: 'text', textContent, size: { width: 120, height: 18 } });
}

/** 单条智能建议期望 */
interface SmartExpectation {
  /** 类别 */
  category: 'grid' | 'icon' | 'dark-mode' | 'motion';
  /** utilityClass 应包含的片段（不给则只校验类别） */
  utilityIncludes?: string;
}

/** 单个 fixture 的评审期望 */
interface FixtureSpec {
  /** 评审编号 */
  id: string;
  /** 覆盖能力（T21/T22 标签） */
  covers: string;
  /** 组件树 */
  root: ProcessedNode;
  /** T21 主信号（缺失每个 -3） */
  smartPrimary: SmartExpectation[];
  /** 允许出现的 T21 类别（其余视为误报；主信号默认已允许） */
  smartAllowed: ReadonlyArray<SmartExpectation['category']>;
  /** T22 主交互类型（缺失每个 -3） */
  interactionPrimary: string[];
  /** 允许出现的交互类型（其余视为误报） */
  interactionAllowed: string[];
  /** 期望的列表数据结构数（缺失误报各计） */
  listCount: number;
  /** 期望出现的命名建议（次要，缺失 -1） */
  nameSuggestions: string[];
}

/**
 * 10 个代表性 fixture
 */
const fixtures: FixtureSpec[] = [
  {
    id: 'F1',
    covers: 'T21 grid（sticky 吸顶）',
    root: makeNode({ name: 'Sticky Header Bar', size: { width: 1440, height: 64 } }),
    smartPrimary: [{ category: 'grid', utilityIncludes: 'sticky top-0' }],
    smartAllowed: ['grid'],
    interactionPrimary: [],
    interactionAllowed: [],
    listCount: 0,
    nameSuggestions: [],
  },
  {
    id: 'F2',
    covers: 'T21 icons（Lucide 语义）',
    root: makeNode({
      name: 'Arrow Right',
      originalType: 'VECTOR',
      role: 'icon',
      size: { width: 24, height: 24 },
    }),
    smartPrimary: [{ category: 'icon', utilityIncludes: undefined }],
    smartAllowed: ['icon'],
    interactionPrimary: [],
    interactionAllowed: [],
    listCount: 0,
    nameSuggestions: [],
  },
  {
    id: 'F3',
    covers: 'T21 dark-mode（近黑表面 + 命名佐证）',
    root: makeNode({
      name: 'Card Background',
      size: { width: 320, height: 180 },
      fills: [{ type: 'solid', color: { r: 0.04, g: 0.05, b: 0.06, a: 1 } }],
    }),
    smartPrimary: [{ category: 'dark-mode', utilityIncludes: 'dark:bg-neutral-900' }],
    smartAllowed: ['dark-mode'],
    interactionPrimary: [],
    interactionAllowed: [],
    listCount: 0,
    nameSuggestions: [],
  },
  {
    id: 'F4',
    covers: 'T21 motion（hover + spinner 两态）',
    root: makeNode({
      name: 'State Variants',
      children: [
        makeNode({ name: 'Primary CTA Hover State', size: { width: 120, height: 40 } }),
        makeNode({ name: 'Loading Spinner', size: { width: 24, height: 24 } }),
      ],
    }),
    smartPrimary: [
      { category: 'motion', utilityIncludes: 'hover:' },
      { category: 'motion', utilityIncludes: 'animate-spin' },
    ],
    smartAllowed: ['motion'],
    interactionPrimary: [],
    interactionAllowed: [],
    listCount: 0,
    nameSuggestions: [],
  },
  {
    id: 'F5',
    covers: 'T22 form（提交 + 校验占位）',
    root: makeNode({
      name: 'Login Form',
      size: { width: 360, height: 240 },
      children: [
        makeNode({ name: 'Email Input', role: 'input', originalType: 'INSTANCE' }),
        makeNode({ name: 'Password Input', role: 'input', originalType: 'INSTANCE' }),
        makeNode({ name: 'Submit Button', role: 'button', originalType: 'COMPONENT' }),
      ],
    }),
    smartPrimary: [],
    smartAllowed: [],
    interactionPrimary: ['form-submit', 'form-validation'],
    interactionAllowed: ['form-submit', 'form-validation', 'input-change'],
    listCount: 0,
    nameSuggestions: [],
  },
  {
    id: 'F6',
    covers: 'T22 modal（open/close 联动）',
    root: makeNode({
      name: 'Modal Page',
      children: [
        makeNode({ name: 'Open Dialog Button', role: 'button', originalType: 'COMPONENT' }),
        makeNode({
          name: 'Modal Dialog',
          children: [
            makeNode({ name: 'Content Area' }),
            makeNode({ name: 'Close Button', role: 'button', originalType: 'COMPONENT' }),
          ],
        }),
      ],
    }),
    smartPrimary: [],
    smartAllowed: [],
    interactionPrimary: ['dialog-toggle'],
    interactionAllowed: ['dialog-toggle', 'button-click'],
    listCount: 0,
    nameSuggestions: [],
  },
  {
    id: 'F7',
    covers: 'T22 carousel（track/dots/arrows；箭头同时是 T21 icon 信号）',
    root: makeNode({
      name: 'Image Carousel',
      size: { width: 720, height: 320 },
      children: [
        makeNode({
          name: 'Slide Track',
          children: [
            makeNode({ name: 'Slide 1' }),
            makeNode({ name: 'Slide 2' }),
            makeNode({ name: 'Slide 3' }),
          ],
        }),
        makeNode({ name: 'Dots Indicator' }),
        makeNode({ name: 'Arrow Left', role: 'icon', originalType: 'VECTOR', size: { width: 24, height: 24 } }),
        makeNode({ name: 'Arrow Right', role: 'icon', originalType: 'VECTOR', size: { width: 24, height: 24 } }),
      ],
    }),
    smartPrimary: [{ category: 'icon' }],
    smartAllowed: ['icon'],
    interactionPrimary: ['carousel-swipe'],
    interactionAllowed: ['carousel-swipe'],
    listCount: 0,
    nameSuggestions: [],
  },
  {
    id: 'F8',
    covers: 'T22 tabs + 语义命名（generic Frame → SaveChangesButton）',
    root: makeNode({
      name: 'Settings Page',
      children: [
        makeNode({
          name: 'Tabs',
          size: { width: 420, height: 40 },
          children: [
            makeNode({ name: 'Tab 1', size: { width: 140, height: 40 } }),
            makeNode({ name: 'Tab 2', size: { width: 140, height: 40 } }),
            makeNode({ name: 'Tab 3', size: { width: 140, height: 40 } }),
          ],
        }),
        makeNode({
          name: 'Frame 12',
          role: 'button',
          originalType: 'COMPONENT',
          size: { width: 120, height: 40 },
          children: [text('Label', 'Save Changes')],
        }),
      ],
    }),
    smartPrimary: [],
    smartAllowed: [],
    interactionPrimary: ['tabs-switch'],
    // Frame 12 为 role=button 的 CTA，button-click 属角色正确信号
    interactionAllowed: ['tabs-switch', 'button-click'],
    listCount: 0,
    nameSuggestions: ['SaveChangesButton'],
  },
  {
    id: 'F9',
    covers: 'T22 accordion（3 子项，子部件不重复推断）',
    root: makeNode({
      name: 'FAQ Accordion',
      children: [1, 2, 3].map((i) =>
        makeNode({
          name: `Accordion Item ${i}`,
          children: [makeNode({ name: 'Item Header' }), makeNode({ name: 'Item Content' })],
        }),
      ),
    }),
    smartPrimary: [],
    smartAllowed: [],
    interactionPrimary: ['accordion-toggle'],
    interactionAllowed: ['accordion-toggle'],
    listCount: 0,
    nameSuggestions: [],
  },
  {
    id: 'F10',
    covers: 'T22 列表数据化（4 个等宽 Frame 序号子项）+ generic 命名',
    root: makeNode({
      name: 'Article Cards',
      size: { width: 1200, height: 200 },
      children: [1, 2, 3, 4].map((i) =>
        makeNode({
          name: `Frame ${20 + i}`,
          size: { width: 280, height: 180 },
          children: [text('Title', `Headline ${i}`), text('Price', '$199')],
        }),
      ),
    }),
    smartPrimary: [],
    smartAllowed: [],
    interactionPrimary: [],
    interactionAllowed: [],
    listCount: 1,
    nameSuggestions: ['Headline1', 'Headline2', 'Headline3', 'Headline4'],
  },
];

describe('TR-22.2 / TR-21.2：10 个代表性 fixture 推断评审', () => {
  it('每个 fixture 评分 ≥4，综合均分 ≥4.0', () => {
    const rows: Array<{
      id: string;
      score: number;
      smartHits: string;
      interactionHits: string;
      list: number;
      names: number;
      fps: number;
      detail: string;
    }> = [];

    for (const spec of fixtures) {
      const smart = createSmartInferrer().infer(spec.root, { framework: 'react', switches: {} });
      const interaction = createInteractionInferrer().infer(spec.root);
      const semantic = createSemanticInferrer().infer(spec.root, { framework: 'react' });

      // 主信号核验（T21）
      const missingSmart = spec.smartPrimary.filter((expected) => {
        const hit = smart.suggestions.find(
          (suggestion) =>
            suggestion.category === expected.category &&
            (expected.utilityIncludes === undefined ||
              (suggestion.utilityClass ?? '').includes(expected.utilityIncludes)),
        );
        return hit === undefined;
      }).length;
      const smartFp = smart.suggestions.filter(
        (suggestion) => !spec.smartAllowed.includes(suggestion.category),
      ).length;

      // 主信号核验（T22 交互）
      const emittedTypes = new Set(interaction.interactions.map((item) => item.type));
      const missingInteractions = spec.interactionPrimary.filter((type) => !emittedTypes.has(type)).length;
      const interactionFp = interaction.interactions.filter(
        (item) => !spec.interactionAllowed.includes(item.type),
      ).length;

      // 语义核验
      const listMiss = spec.listCount === 1 && semantic.dataStructures.length !== 1 ? 3 : 0;
      const listFp = spec.listCount === 0 ? semantic.dataStructures.length : 0;
      const emittedNames = new Set(semantic.nameSuggestions.map((item) => item.suggestedName));
      const missingNames = spec.nameSuggestions.filter((name) => !emittedNames.has(name)).length;
      const unexpectedNames = semantic.nameSuggestions
        .map((item) => item.suggestedName)
        .filter((name) => !spec.nameSuggestions.includes(name)).length;

      const primaryMissing = missingSmart + missingInteractions + (listMiss > 0 ? 1 : 0);
      const secondaryMissing = missingNames;
      const fps = smartFp + interactionFp + listFp + unexpectedNames;
      const score = Math.max(1, Math.min(5, 5 - 3 * primaryMissing - secondaryMissing - fps));

      rows.push({
        id: spec.id,
        score,
        smartHits: smart.suggestions.map((s) => s.category).join(',') || '-',
        interactionHits: Array.from(emittedTypes).join(',') || '-',
        list: semantic.dataStructures.length,
        names: semantic.nameSuggestions.length,
        fps,
        detail:
          [
            missingSmart > 0 ? `缺smart主信号×${missingSmart}` : '',
            missingInteractions > 0 ? `缺交互×${missingInteractions}` : '',
            listMiss > 0 ? '缺列表' : '',
            missingNames > 0 ? `缺命名×${missingNames}` : '',
            fps > 0 ? `误报×${fps}` : '',
          ]
            .filter(Boolean)
            .join('；') || '全中无误报',
      });

      expect(score, `${spec.id} ${spec.covers}`).toBeGreaterThanOrEqual(4);
    }

    const average = rows.reduce((sum, row) => sum + row.score, 0) / rows.length;
    // 评审表数据（回填 tasks.md TR-22.2 证据）
    console.log('\nTR review rows:\n' + JSON.stringify(rows, null, 2));
    expect(average).toBeGreaterThanOrEqual(4.0);
  });
});
