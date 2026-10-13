/**
 * WBS-P2-11 组件库匹配器核心单测
 * 评分模型（role40+name35+结构25）、保守门控 70、4 库形态与 Prop 口径、auto 检测。
 */
import { describe, expect, it } from 'vitest';
import type { ProcessedNode } from '../../src/types/nodes.js';
import {
  CONSERVATIVE_MATCH_THRESHOLD,
  detectReactLibrary,
  detectVueLibrary,
  matchComponent,
  matchTree,
  resolveLibrary,
} from '../../src/services/component-library/index.js';
import { evaluateFixtureSet, fixtureLabeledCount } from '../../src/services/component-library/evaluate.js';
import { LABELED_NODES } from '../../test/fixtures/component-library/labeled-nodes.js';

/** 构造精简节点的测试辅助 */
function node(partial: Partial<ProcessedNode> & Pick<ProcessedNode, 'id' | 'name'>): ProcessedNode {
  return {
    originalType: 'FRAME',
    role: 'container',
    visible: true,
    clipsContent: false,
    figmaId: partial.id,
    ...partial,
  } as ProcessedNode;
}

const solid = (hex: string) => [{ type: 'solid' as const, color: hexToRgb(hex), opacity: 1 }];
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)!;
  return { r: parseInt(m[1], 16) / 255, g: parseInt(m[2], 16) / 255, b: parseInt(m[3], 16) / 255 };
}
const radius = (r: number) => ({ topLeft: r, topRight: r, bottomRight: r, bottomLeft: r });

describe('WBS-P2-11 评分与保守门控', () => {
  it('role+名称双证据的主按钮命中 Button（confidence≥70）', () => {
    const btn = node({
      id: 'b1',
      name: 'Primary Button',
      role: 'button',
      size: { width: 96, height: 40 },
      textContent: '确定',
      fills: solid('#07c160'),
    });
    const match = matchComponent(btn, 'ant-design');
    expect(match).not.toBeNull();
    expect(match!.component).toBe('button');
    expect(match!.confidence).toBeGreaterThanOrEqual(CONSERVATIVE_MATCH_THRESHOLD);
  });

  it('仅有 role 无名称/结构佐证（40 分）不替换——单一信号不达标', () => {
    const plain = node({ id: 'x', name: 'Group 123', role: 'button', size: { width: 200, height: 200 } });
    expect(matchComponent(plain, 'ant-design')).toBeNull();
  });

  it('仅结构像按钮但无 role/名称不替换（25 分封顶以下）', () => {
    const shape = node({ id: 'x', name: 'Rectangle 9', size: { width: 80, height: 36 }, textContent: '', fills: solid('#cccccc') });
    expect(matchComponent(shape, 'ant-design')).toBeNull();
  });

  it('强名称+结构但无 role 也不替换（dialog 必须名称强信号+结构，role 本就为空集时看总分）', () => {
    // dialog 规则无 role 分：名称35 + 结构最多25 = 60 < 70 → 保持原生（保守）
    const weakDialog = node({
      id: 'd1',
      name: 'Modal',
      size: { width: 420, height: 240 },
      children: [node({ id: 'd1a', name: 'overlay' }), node({ id: 'd1b', name: 'panel' })],
      cornerRadius: radius(12),
    });
    expect(matchComponent(weakDialog, 'ant-design')).toBeNull();
  });

  it('库为 null（none/auto 无证据）时任何节点都不替换', () => {
    const btn = node({ id: 'b', name: 'Button/Save', role: 'button', fills: solid('#1677ff') });
    expect(matchComponent(btn, null)).toBeNull();
  });
});

describe('WBS-R1 reusable-component 角色通道（设计系统规范组件）', () => {
  it('COMPONENT 形态的规范按钮（路径名含 Buttons按钮/主按钮，控件尺寸）命中 Button', () => {
    const designButton = node({
      id: 'rb1',
      name: '1.通用/1.Buttons按钮/主按钮/亮色/默认',
      role: 'reusable-component',
      originalType: 'COMPONENT',
      size: { width: 74, height: 32 },
      children: [
        node({ id: 'rb1-bg', name: '矩形', size: { width: 74, height: 32 } }),
        node({ id: 'rb1-t', name: '主按钮', role: 'text', textContent: '主按钮' }),
      ],
    });
    const match = matchComponent(designButton, 'ant-design');
    expect(match).not.toBeNull();
    expect(match!.component).toBe('button');
    expect(match!.confidence).toBeGreaterThanOrEqual(CONSERVATIVE_MATCH_THRESHOLD);
  });

  it('同名组件尺寸超护栏（按钮组/规范画板）→ 不给角色分，保持原生', () => {
    const board = node({
      id: 'rb2',
      name: '1.通用/1.Buttons按钮/按钮规范画板',
      role: 'reusable-component',
      originalType: 'COMPONENT',
      size: { width: 900, height: 400 },
      children: Array.from({ length: 8 }, (_, i) => node({ id: `rb2-${i}`, name: '子按钮', size: { width: 80, height: 32 } })),
    });
    expect(matchComponent(board, 'ant-design')).toBeNull();
  });

  it('reusable-component 但名称无按钮关键词 → 单一组件元数据信号不替换', () => {
    const unnamed = node({
      id: 'rb3',
      name: 'Rectangle Copy',
      role: 'reusable-component',
      originalType: 'COMPONENT',
      size: { width: 74, height: 32 },
      children: [node({ id: 'rb3-t', name: '文本', role: 'text', textContent: '新建应用' })],
    });
    expect(matchComponent(unnamed, 'ant-design')).toBeNull();
  });

  it('非按钮组件规则（如 card）未开放 reusable 通道 → 规范命名 COMPONENT 也不凭空命中', () => {
    const cardLike = node({
      id: 'rb4',
      name: '2.导航/1.Tabs标签页/亮色/常用-可选',
      role: 'reusable-component',
      originalType: 'COMPONENT',
      size: { width: 64, height: 32 },
    });
    expect(matchComponent(cardLike, 'ant-design')).toBeNull();
  });
});

describe('WBS-P2-11 七类组件识别', () => {
  const cases: Array<{ label: string; node: ProcessedNode; component: string }> = [
    ['button', node({ id: 'b', name: 'Button/Primary', role: 'button', size: { width: 88, height: 40 }, textContent: '提交', fills: solid('#1677ff') }), 'button'],
    ['card', node({ id: 'c', name: 'Product Card', role: 'card', size: { width: 320, height: 200 }, cornerRadius: radius(16), effects: [{ type: 'drop-shadow' } as never], children: [node({ id: 'c1', name: 'img' }), node({ id: 'c2', name: 'body' })] }), 'card'],
    ['input', node({ id: 'i', name: 'Search Input', role: 'input', size: { width: 240, height: 40 }, cornerRadius: radius(8), strokes: [{ color: hexToRgb('#d9d9d9'), weight: 1, align: 'INSIDE' }] }), 'input'],
    ['avatar', node({ id: 'a', name: 'User Avatar', role: 'avatar', size: { width: 40, height: 40 }, cornerRadius: radius(20), fills: [{ type: 'image', imageRef: 'x' }] }), 'avatar'],
    ['badge', node({ id: 'bd', name: 'New Badge', role: 'badge', size: { width: 56, height: 24 }, textContent: 'NEW', cornerRadius: radius(12), fills: solid('#e04536') }), 'badge'],
  ];
  for (const [label, nodeArg, component] of cases) {
    it(`识别 ${label}`, () => {
      expect(matchComponent(nodeArg, 'ant-design')?.component).toBe(component);
    });
  }

  it('tabs：tabs 名称 + 等宽文本子项 + 激活项下标', () => {
    const tabs = node({
      id: 't',
      name: 'Tabs',
      role: 'list',
      layout: { mode: 'HORIZONTAL' },
      children: [
        node({ id: 't1', name: 'tab1', textContent: '概览', size: { width: 80, height: 32 }, fills: solid('#1677ff') }),
        node({ id: 't2', name: 'tab2', textContent: '设置', size: { width: 82, height: 32 } }),
      ],
    });
    const match = matchComponent(tabs, 'ant-design');
    expect(match?.component).toBe('tabs');
    expect(match?.props.find((p) => p.name === 'defaultValue')?.value).toBe('0');
  });
});

describe('WBS-P2-11 Prop 推导与四库口径', () => {
  it('antd 主按钮：type=primary；危险按钮 type=primary + danger=true', () => {
    const primary = matchComponent(node({ id: 'p', name: 'Button', role: 'button', fills: solid('#1677ff') }), 'ant-design')!;
    expect(primary.props.find((p) => p.name === 'type')?.value).toBe('primary');
    const danger = matchComponent(node({ id: 'd', name: 'Delete Button', role: 'button', fills: solid('#e04536') }), 'ant-design')!;
    expect(danger.props.find((p) => p.name === 'type')?.value).toBe('primary');
    expect(danger.props.find((p) => p.name === 'danger')?.value).toBe('true');
  });

  it('shadcn 按钮：variant=default/destructive/outline/ghost，named import 无 tagName', () => {
    const primary = matchComponent(node({ id: 's', name: 'Button', role: 'button', fills: solid('#111827') }), 'shadcn-ui')!;
    expect(primary.importName).toBe('Button');
    expect(primary.tagName).toBeUndefined();
    expect(primary.props.find((p) => p.name === 'variant')?.value).toBe('default');
    const danger = matchComponent(node({ id: 'sd', name: 'Button', role: 'button', fills: solid('#dc2626') }), 'shadcn-ui')!;
    expect(danger.props.find((p) => p.name === 'variant')?.value).toBe('destructive');
    const outline = matchComponent(node({ id: 'so', name: 'Button', role: 'button', strokes: [{ color: hexToRgb('#d1d5db'), weight: 1, align: 'INSIDE' }] }), 'shadcn-ui')!;
    expect(outline.props.find((p) => p.name === 'variant')?.value).toBe('outline');
  });

  it('element-plus：el-button 标签 + type=danger；组合式子组件（el-tab-pane）', () => {
    const danger = matchComponent(node({ id: 'ed', name: 'Button', role: 'button', fills: solid('#f56c6c') }), 'element-plus')!;
    expect(danger.tagName).toBe('el-button');
    expect(danger.props.find((p) => p.name === 'type')?.value).toBe('danger');
    const tabs = matchComponent(
      node({ id: 'et', name: 'Tabs', role: 'list', layout: { mode: 'HORIZONTAL' }, children: [node({ id: '1', name: 'a', textContent: 'A', size: { width: 60, height: 30 }, fills: solid('#409eff') }), node({ id: '2', name: 'b', textContent: 'B', size: { width: 60, height: 30 } })] }),
      'element-plus',
    )!;
    expect(tagsOf(tabs.subImports)).toContain('ElTabPane');
  });

  it('ant-design-vue：a-* kebab 标签', () => {
    const btn = matchComponent(node({ id: 'avb', name: 'OK Button', role: 'button', fills: solid('#1677ff') }), 'ant-design-vue')!;
    expect(btn.tagName).toBe('a-button');
    expect(btn.importName).toBe('Button');
  });

  it('shadcn Dialog/Tabs/Card/Avatar 带组合式子组件导入', () => {
    const card = matchComponent(node({ id: 'sc', name: 'Card', role: 'card', cornerRadius: radius(8), effects: [{ type: 'drop-shadow' } as never], children: [node({ id: '1', name: 'h' }), node({ id: '2', name: 'b' })] }), 'shadcn-ui')!;
    expect(card.subImports).toContain('CardContent');
    const avatar = matchComponent(node({ id: 'sa', name: 'Avatar', role: 'avatar', size: { width: 32, height: 32 }, cornerRadius: radius(16), fills: [{ type: 'image', imageRef: 'y' }] }), 'shadcn-ui')!;
    expect(avatar.subImports).toContain('AvatarImage');
    expect(avatar.subImports).toContain('AvatarFallback');
  });

  it('密码/邮箱/搜索 Input 的 type prop', () => {
    expect(matchComponent(node({ id: 'pw', name: 'Password Input', role: 'input', size: { width: 200, height: 40 } }), 'ant-design')!.props.find((p) => p.name === 'type')?.value).toBe('password');
    expect(matchComponent(node({ id: 'em', name: 'Email 输入', role: 'input', size: { width: 200, height: 40 } }), 'ant-design')!.props.find((p) => p.name === 'type')?.value).toBe('email');
    expect(matchComponent(node({ id: 'se', name: '搜索框', role: 'input', size: { width: 200, height: 40 }, textContent: '搜索商品' }), 'ant-design')!.props.find((p) => p.name === 'type')?.value).toBe('search');
  });

  it('按钮 size：高 ≤28 small，≥44 large', () => {
    const small = matchComponent(node({ id: 'sm', name: 'Button', role: 'button', size: { width: 60, height: 26 } }), 'ant-design')!;
    expect(small.props.find((p) => p.name === 'size')?.value).toBe('small');
    const large = matchComponent(node({ id: 'lg', name: 'Button', role: 'button', size: { width: 120, height: 48 } }), 'ant-design')!;
    expect(large.props.find((p) => p.name === 'size')?.value).toBe('large');
  });
});

describe('WBS-P2-11 matchTree 批量收集', () => {
  it('递归收集全部匹配且带 nodeId', () => {
    const tree = node({
      id: 'root',
      name: 'Frame',
      children: [
        node({ id: 'b1', name: 'Button', role: 'button', fills: solid('#1677ff') }),
        node({ id: 'box', name: 'Group', children: [node({ id: 'b2', name: 'Cancel Button', role: 'button' })] }),
      ],
    });
    const matches = matchTree(tree, 'ant-design');
    expect(matches.map((m) => m.nodeId).sort()).toEqual(['b1', 'b2']);
  });
});

describe('WBS-P2-11 auto 检测（真实依赖证据）', () => {
  it('React：dependencies 有 antd → ant-design', () => {
    expect(detectReactLibrary({ dependencies: { antd: '^5.0.0' } })).toBe('ant-design');
  });
  it('React：shadcn 目录谓词命中 → shadcn-ui', () => {
    expect(detectReactLibrary({}, { uiComponentExists: (c) => c === 'button' })).toBe('shadcn-ui');
  });
  it('React：无依赖无目录 → null（禁止猜测）', () => {
    expect(detectReactLibrary({ dependencies: { react: '^18' } })).toBeNull();
  });
  it('Vue：element-plus 优先于 ant-design-vue', () => {
    expect(detectVueLibrary({ dependencies: { 'element-plus': '^2.8.0', 'ant-design-vue': '^4.0.0' } })).toBe('element-plus');
    expect(detectVueLibrary({ dependencies: { 'ant-design-vue': '^4.0.0' } })).toBe('ant-design-vue');
    expect(detectVueLibrary({ dependencies: { vue: '^3' } })).toBeNull();
  });
  it('resolveLibrary：none/auto/显式三态', () => {
    expect(resolveLibrary('react', 'none', { dependencies: { antd: '^5' } })).toBeNull();
    expect(resolveLibrary('react', 'auto', { dependencies: { antd: '^5' } })).toBe('ant-design');
    expect(resolveLibrary('react', 'shadcn-ui', null)).toBe('shadcn-ui');
    expect(resolveLibrary('vue', 'auto', { dependencies: { vue: '^3' } })).toBeNull();
  });
});

describe('WBS-P2-11 60+ 标注 fixture 集评测', () => {
  it('fixture 规模 ≥60', () => {
    expect(fixtureLabeledCount(LABELED_NODES)).toBeGreaterThanOrEqual(60);
  });

  it('识别率 ≥70%、Props 节点通过率 ≥60%、保守模式误替换为 0（4 库同口径）', () => {
    for (const library of ['ant-design', 'shadcn-ui', 'element-plus', 'ant-design-vue'] as const) {
      const stats = evaluateFixtureSet(LABELED_NODES, library);
      expect(stats.falseReplacements, `${library} false replacements`).toBe(0);
      expect(stats.identificationRate, `${library} identification`).toBeGreaterThanOrEqual(0.7);
      expect(stats.propsNodePassRate, `${library} props node pass`).toBeGreaterThanOrEqual(0.6);
    }
  });
});

function tagsOf(list: readonly string[]): string[] {
  return [...list];
}
