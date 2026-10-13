/**
 * WBS-P2-12 React 组件库接线端到端测试
 * shadcn-ui / ant-design：标签替换、Props 注入、import 形态、组合式子组件、
 * none 关闭、auto 按真实依赖检测、保守模式误替换为 0。
 */
import { describe, expect, it } from 'vitest';
import { createCodeGenerator } from '../../src/services/code-generator.js';
import type { FigmaClient } from '../../src/services/figma-client.js';
import type { DesignContext, ProcessedNode } from '../../src/types/nodes.js';

const NULL_CLIENT = null as unknown as FigmaClient;

function solid(hex: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)!;
  return [{ type: 'solid' as const, color: { r: parseInt(m[1], 16) / 255, g: parseInt(m[2], 16) / 255, b: parseInt(m[3], 16) / 255 } }];
}
function stroke() {
  return [{ color: { r: 0.82, g: 0.85, b: 0.9 }, weight: 1, align: 'INSIDE' as const }];
}
/** 文本子节点（Figma 中按钮文案是 FRAME 内的 TEXT 子节点） */
function textNode(id: string, text: string): ProcessedNode {
  return {
    id,
    figmaId: id,
    name: text,
    originalType: 'TEXT',
    role: 'text',
    visible: true,
    clipsContent: false,
    textContent: text,
  } as ProcessedNode;
}

function makeNode(partial: Partial<ProcessedNode> & { id: string; name: string; role: ProcessedNode['role'] }): ProcessedNode {
  return {
    figmaId: partial.id,
    originalType: 'FRAME',
    visible: true,
    clipsContent: false,
    ...partial,
  } as ProcessedNode;
}

function context(node: ProcessedNode): DesignContext {
  return {
    fileKey: 'f',
    node,
    colors: [],
    spacing: [],
    radii: [],
    shadows: [],
    assets: [],
    textNodes: [],
    componentsUsed: [],
  };
}

/** 含主按钮+描边按钮+输入框+卡片的小型页面节点树 */
function pageTree(): ProcessedNode {
  return makeNode({
    id: 'root',
    name: 'Page',
    role: 'container',
    size: { width: 375, height: 600 },
    children: [
      makeNode({ id: 'save', name: 'Save Button', role: 'button', size: { width: 96, height: 40 }, fills: solid('#1677ff'), children: [textNode('save-t', 'Save')] }),
      makeNode({ id: 'cancel', name: 'Cancel Button', role: 'button', size: { width: 96, height: 40 }, strokes: stroke(), children: [textNode('cancel-t', 'Cancel')] }),
      makeNode({ id: 'email', name: 'Email Input', role: 'input', size: { width: 260, height: 40 }, strokes: stroke() }),
      makeNode({
        id: 'card',
        name: 'Profile Card',
        role: 'card',
        size: { width: 320, height: 160 },
        cornerRadius: { topLeft: 12, topRight: 12, bottomRight: 12, bottomLeft: 12 },
        children: [makeNode({ id: 'card-body', name: 'body', role: 'container' })],
      }),
      makeNode({ id: 'plain', name: 'Wrapper', role: 'container', size: { width: 200, height: 80 } }),
    ],
  });
}

/** 跨行匹配开标签内是否含某属性 */
function hasOpeningTag(code: string, tag: string, attr: string): boolean {
  return new RegExp(`<${tag}[\\s\\S]*?${attr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(code);
}

/**
 * 文案是否为某组件标签的直接文本子节点（Prettier 会因 className/data 属性超长把文案折到下一行，
 * 故允许标签与文案间有空白；若文案被 <p>/<span> 等包裹则不匹配）。
 */
function hasDirectTextChild(code: string, tag: string, text: string): boolean {
  return new RegExp(`<${tag}[\\s\\S]*?>\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*<\\/${tag}>`).test(code);
}

describe('WBS-P2-12 ant-design 接线', () => {
  it('按钮/输入框/卡片替换为 antd 组件并聚合 import，容器保持 div', async () => {
    const gen = createCodeGenerator(NULL_CLIENT);
    const { code } = await gen.generateJsxFromContext(context(pageTree()), {
      componentName: 'SignupForm',
      componentLibrary: 'ant-design',
      skipEnhancements: true,
    });
    // 三个组件聚合到 antd 单包（集合插入序：Button→Input→Card）
    expect(code).toContain('Button');
    expect(code).toContain('Input');
    expect(code).toContain('Card');
    expect(code).toMatch(/import \{[^}]*\} from ['"]antd['"];/);
    expect(hasOpeningTag(code, 'Button', 'type="primary"')).toBe(true);
    expect(hasOpeningTag(code, 'Button', 'type="default"')).toBe(true);
    // antd 按钮不注入原生 type="button"，且文案保留为 children
    expect(code).not.toContain('type="button"');
    expect(code).toContain('<Button');
    // 文案是 Button 的直接文本子节点（Prettier 允许折行），不能被 <p>/<span> 包裹
    expect(hasDirectTextChild(code, 'Button', 'Save')).toBe(true);
    // antd Input 自闭合
    expect(hasOpeningTag(code, 'Input', 'type="email"')).toBe(true);
    expect(code).toMatch(/<Input[\s\S]*?\/>/);
    expect(code).toContain('<Card');
    // 未命中的普通容器保持原生
    expect(code).toContain('<div');
  });

  it('危险按钮输出 type=primary + danger 且文案保留', async () => {
    const gen = createCodeGenerator(NULL_CLIENT);
    const { code } = await gen.generateJsxFromContext(
      context(makeNode({ id: 'd', name: 'Delete Button', role: 'button', size: { width: 96, height: 40 }, fills: solid('#e04536'), children: [textNode('d-t', 'Delete')] })),
      { componentName: 'DangerZone', componentLibrary: 'ant-design', skipEnhancements: true },
    );
    expect(hasOpeningTag(code, 'Button', 'danger')).toBe(true);
    expect(hasOpeningTag(code, 'Button', 'type="primary"')).toBe(true);
    expect(hasDirectTextChild(code, 'Button', 'Delete')).toBe(true);
  });

  it('Tabs 替换标签并给结构手工调整警告', async () => {
    const tree = makeNode({
      id: 'tabs',
      name: 'Tabs',
      role: 'list',
      layout: { mode: 'HORIZONTAL' } as never,
      children: [
        makeNode({ id: 't1', name: 'tab1', textContent: 'A', size: { width: 80, height: 32 }, fills: solid('#1677ff') }),
        makeNode({ id: 't2', name: 'tab2', textContent: 'B', size: { width: 80, height: 32 } }),
      ],
    });
    const gen = createCodeGenerator(NULL_CLIENT);
    const result = await gen.generateJsxFromContext(context(tree), {
      componentName: 'TabView',
      componentLibrary: 'ant-design',
      skipEnhancements: true,
    });
    expect(result.code).toContain('<Tabs');
    expect(result.warnings.some((w) => w.includes('Tabs') && w.includes('手工调整'))).toBe(true);
  });
});

describe('WBS-P2-12 shadcn-ui 接线', () => {
  it('按 @/components/ui 子路径分组 import，variant 口径为 default/outline', async () => {
    const gen = createCodeGenerator(NULL_CLIENT);
    const { code } = await gen.generateJsxFromContext(context(pageTree()), {
      componentName: 'SignupForm',
      componentLibrary: 'shadcn-ui',
      skipEnhancements: true,
    });
    expect(code).toMatch(/import \{ Button \} from ['"]@\/components\/ui\/button['"];/);
    expect(code).toMatch(/import \{ Input \} from ['"]@\/components\/ui\/input['"];/);
    expect(code).toMatch(/import \{ Card[^}]*\} from ['"]@\/components\/ui\/card['"];/);
    expect(hasOpeningTag(code, 'Button', 'variant="default"')).toBe(true);
    expect(hasOpeningTag(code, 'Button', 'variant="outline"')).toBe(true);
    expect(code).not.toContain('type="primary"');
  });

  it('Dialog 组合式子组件 import 与结构建议', async () => {
    const tree = makeNode({
      id: 'dlg',
      name: 'Confirm Modal',
      role: 'container',
      size: { width: 1440, height: 900 },
      children: [
        makeNode({ id: 'mask', name: 'Mask', size: { width: 1440, height: 900 }, fills: [{ type: 'solid', color: { r: 0, g: 0, b: 0 }, opacity: 0.45 }] }),
        makeNode({ id: 'panel', name: 'Panel', role: 'container', size: { width: 480, height: 320 }, cornerRadius: { topLeft: 12, topRight: 12, bottomRight: 12, bottomLeft: 12 } }),
      ],
    });
    const gen = createCodeGenerator(NULL_CLIENT);
    const { code, warnings } = await gen.generateJsxFromContext(context(tree), {
      componentName: 'ConfirmDialog',
      componentLibrary: 'shadcn-ui',
      skipEnhancements: true,
    });
    expect(code).toContain('import { Dialog,');
    expect(code).toContain('DialogContent');
    expect(code).toContain('DialogTitle');
    expect(warnings.some((w) => w.includes('手工调整'))).toBe(true);
  });
});

describe('WBS-P2-12 门控与 auto 检测', () => {
  it('componentLibrary=none（默认）全部保持原生标签、无组件库 import', async () => {
    const gen = createCodeGenerator(NULL_CLIENT);
    const { code } = await gen.generateJsxFromContext(context(pageTree()), {
      componentName: 'PlainForm',
      skipEnhancements: true,
    });
    expect(code).not.toContain('from "antd"');
    expect(code).toContain('<button');
    expect(code).toContain('<input');
  });

  it('auto + package.json 含 antd → 命中；无依赖 → 降级原生并给 warning', async () => {
    const gen = createCodeGenerator(NULL_CLIENT);
    const hit = await gen.generateJsxFromContext(context(pageTree()), {
      componentName: 'AutoForm',
      componentLibrary: 'auto',
      projectPackageJson: { dependencies: { antd: '^5.0.0' } },
      skipEnhancements: true,
    });
    expect(hit.code).toMatch(/from ['"]antd['"]/);

    const miss = await gen.generateJsxFromContext(context(pageTree()), {
      componentName: 'AutoForm2',
      componentLibrary: 'auto',
      projectPackageJson: { dependencies: { react: '^18' } },
      skipEnhancements: true,
    });
    expect(miss.code).not.toContain('from "antd"');
    expect(miss.warnings.some((w) => w.includes('componentLibrary=auto'))).toBe(true);
  });

  it('auto + shadcn uiComponentExists 谓词命中', async () => {
    const gen = createCodeGenerator(NULL_CLIENT);
    const { code } = await gen.generateJsxFromContext(context(pageTree()), {
      componentName: 'ShadForm',
      componentLibrary: 'auto',
      projectPackageJson: {},
      uiComponentExists: (c) => c === 'button',
      skipEnhancements: true,
    });
    expect(code).toMatch(/@\/components\/ui\/button/);
  });

  it('显式指定库不做依赖拦截（即便 package.json 无该依赖也输出 import）', async () => {
    const gen = createCodeGenerator(NULL_CLIENT);
    const { code } = await gen.generateJsxFromContext(context(pageTree()), {
      componentName: 'ExplicitForm',
      componentLibrary: 'ant-design',
      projectPackageJson: { dependencies: {} },
      skipEnhancements: true,
    });
    expect(code).toMatch(/from ['"]antd['"]/);
  });
});
