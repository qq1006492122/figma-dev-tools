/**
 * WBS-P2-13 Vue 组件库接线端到端测试
 * element-plus（El* import / el-* kebab 标签）/ ant-design-vue（a-* kebab 标签）：
 * 标签替换、Props 模板属性、import 聚合、组合式子组件（ElTabPane/TabPane）、
 * Vue2 Options API 的 components 注册、none 关闭、auto 按真实依赖检测。
 */
import { describe, expect, it } from 'vitest';
import { createVueGenerator } from '../../src/services/vue-generator.js';
import type { FigmaClient } from '../../src/services/figma-client.js';
import type { DesignContext, ProcessedNode } from '../../src/types/nodes.js';
import { renderVuePropAttr } from '../../src/services/component-library/index.js';

const NULL_CLIENT = null as unknown as FigmaClient;

function solid(hex: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)!;
  return [{ type: 'solid' as const, color: { r: parseInt(m[1], 16) / 255, g: parseInt(m[2], 16) / 255, b: parseInt(m[3], 16) / 255 } }];
}
function stroke() {
  return [{ color: { r: 0.82, g: 0.85, b: 0.9 }, weight: 1, align: 'INSIDE' as const }];
}
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

function tabsTree(): ProcessedNode {
  return makeNode({
    id: 'tabs',
    name: 'Tabs',
    role: 'list',
    layout: { mode: 'HORIZONTAL' } as never,
    children: [
      makeNode({ id: 't1', name: 'tab1', textContent: 'A', size: { width: 80, height: 32 }, fills: solid('#1677ff') }),
      makeNode({ id: 't2', name: 'tab2', textContent: 'B', size: { width: 80, height: 32 } }),
    ],
  });
}

function dialogTree(): ProcessedNode {
  return makeNode({
    id: 'dlg',
    name: 'Confirm Modal',
    role: 'container',
    size: { width: 1440, height: 900 },
    children: [
      makeNode({ id: 'mask', name: 'Mask', size: { width: 1440, height: 900 }, fills: [{ type: 'solid', color: { r: 0, g: 0, b: 0 }, opacity: 0.45 }] }),
      makeNode({ id: 'panel', name: 'Panel', role: 'container', size: { width: 480, height: 320 }, cornerRadius: { topLeft: 12, topRight: 12, bottomRight: 12, bottomLeft: 12 } }),
    ],
  });
}

/** 跨行匹配开标签内是否含某属性 */
function hasOpeningTag(code: string, tag: string, attr: string): boolean {
  return new RegExp(`<${tag}[\\s\\S]*?${attr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(code);
}
/** 文案是否为某组件标签的直接文本子节点（Prettier 折行容忍；被 <p>/<span> 包裹则不匹配） */
function hasDirectTextChild(code: string, tag: string, text: string): boolean {
  return new RegExp(`<${tag}[\\s\\S]*?>\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*<\\/${tag}>`).test(code);
}

describe('WBS-P2-13 element-plus 接线', () => {
  it('按钮/输入框/卡片替换为 el-* 标签并聚合 import，容器保持 div', async () => {
    const { code } = await createVueGenerator(NULL_CLIENT).generateFromContext(context(pageTree()), {
      componentName: 'SignupForm',
      componentLibrary: 'element-plus',
      skipEnhancements: true,
    });
    expect(code).toContain('<el-button');
    expect(code).toContain('<el-input');
    expect(code).toContain('<el-card');
    expect(code).toMatch(/import \{ ElButton, ElInput, ElCard \} from 'element-plus';/);
    expect(hasOpeningTag(code, 'el-button', 'type="primary"')).toBe(true);
    expect(hasOpeningTag(code, 'el-button', 'type="default"')).toBe(true);
    // el-button 的 type 是 variant 口径，不注入原生 type=button
    expect(code).not.toContain('type="button"');
    expect(hasDirectTextChild(code, 'el-button', 'Save')).toBe(true);
    // el-input 自闭合且带 email 类型
    expect(hasOpeningTag(code, 'el-input', 'type="email"')).toBe(true);
    expect(code).toMatch(/<el-input[\s\S]*?\/>/);
    // 未命中容器保持原生
    expect(code).toContain('<div');
  });

  it('危险按钮输出 type="danger"，不输出 antd 风格裸 danger 属性', async () => {
    const { code } = await createVueGenerator(NULL_CLIENT).generateFromContext(
      context(makeNode({ id: 'd', name: 'Delete Button', role: 'button', size: { width: 96, height: 40 }, fills: solid('#f56c6c'), children: [textNode('d-t', 'Delete')] })),
      { componentName: 'DangerZone', componentLibrary: 'element-plus', skipEnhancements: true },
    );
    expect(hasOpeningTag(code, 'el-button', 'type="danger"')).toBe(true);
    expect(hasOpeningTag(code, 'el-button', 'type="primary"')).toBe(false);
    // 不允许 antd 风格的裸 danger 布尔属性（type="danger" 中的 danger 不算）
    expect(code).not.toMatch(/\sdanger(?=[\s/>])/);
    expect(hasDirectTextChild(code, 'el-button', 'Delete')).toBe(true);
  });

  it('Tabs 替换为 el-tabs、导入 ElTabPane 并给手工调整警告；v-model 受控不臆造属性', async () => {
    const { code, warnings } = await createVueGenerator(NULL_CLIENT).generateFromContext(context(tabsTree()), {
      componentName: 'TabView',
      componentLibrary: 'element-plus',
      skipEnhancements: true,
    });
    expect(code).toContain('<el-tabs');
    expect(code).toMatch(/import \{[^}]*ElTabPane[^}]*\} from 'element-plus';/);
    // element-plus 只有 v-model 受控，不输出 default-active 静态属性
    expect(code).not.toContain('default-active');
    expect(warnings.some((w) => w.includes('el-tabs') && w.includes('手工调整'))).toBe(true);
  });

  it('Dialog 替换为 el-dialog 并给受控/结构警告', async () => {
    const { code, warnings } = await createVueGenerator(NULL_CLIENT).generateFromContext(context(dialogTree()), {
      componentName: 'ConfirmDialog',
      componentLibrary: 'element-plus',
      skipEnhancements: true,
    });
    expect(code).toContain('<el-dialog');
    expect(warnings.some((w) => w.includes('el-dialog') && w.includes('手工调整'))).toBe(true);
  });
});

describe('WBS-P2-13 ant-design-vue 接线', () => {
  it('按钮/输入框/卡片替换为 a-* 标签，import 自 ant-design-vue 单包', async () => {
    const { code } = await createVueGenerator(NULL_CLIENT).generateFromContext(context(pageTree()), {
      componentName: 'SignupForm',
      componentLibrary: 'ant-design-vue',
      skipEnhancements: true,
    });
    expect(code).toContain('<AButton');
    expect(code).toContain('<AInput');
    expect(code).toContain('<ACard');
    expect(code).toMatch(/import \{ AButton, AInput, ACard \} from 'ant-design-vue';/);
    expect(hasOpeningTag(code, 'AButton', 'type="primary"')).toBe(true);
    expect(hasDirectTextChild(code, 'AButton', 'Cancel')).toBe(true);
  });

  it('危险按钮输出 type="primary" + 裸 danger 属性', async () => {
    const { code } = await createVueGenerator(NULL_CLIENT).generateFromContext(
      context(makeNode({ id: 'd', name: 'Delete Button', role: 'button', size: { width: 96, height: 40 }, fills: solid('#e04536'), children: [textNode('d-t', 'Delete')] })),
      { componentName: 'DangerZone', componentLibrary: 'ant-design-vue', skipEnhancements: true },
    );
    expect(hasOpeningTag(code, 'AButton', 'type="primary"')).toBe(true);
    expect(hasOpeningTag(code, 'AButton', 'danger')).toBe(true);
  });

  it('Tabs 替换为 a-tabs、导入 TabPane，激活态走非受控 default-active-key', async () => {
    const { code, warnings } = await createVueGenerator(NULL_CLIENT).generateFromContext(context(tabsTree()), {
      componentName: 'TabView',
      componentLibrary: 'ant-design-vue',
      skipEnhancements: true,
    });
    expect(code).toContain('<ATabs');
    expect(code).toMatch(/import \{[^}]*TabPane[^}]*\} from 'ant-design-vue';/);
    expect(hasOpeningTag(code, 'ATabs', 'default-active-key="0"')).toBe(true);
    expect(warnings.some((w) => w.includes('ATabs') && w.includes('手工调整'))).toBe(true);
  });
});

describe('WBS-P2-13 门控与 auto 检测', () => {
  it('componentLibrary=none（默认）全部保持原生标签、无组件库 import', async () => {
    const { code } = await createVueGenerator(NULL_CLIENT).generateFromContext(context(pageTree()), {
      componentName: 'PlainForm',
      skipEnhancements: true,
    });
    expect(code).not.toContain('element-plus');
    expect(code).not.toContain('ant-design-vue');
    expect(code).toContain('<button');
    expect(code).toContain('<input');
  });

  it('auto + package.json 含 element-plus → 命中；无依赖 → 降级原生并给 warning', async () => {
    const gen = createVueGenerator(NULL_CLIENT);
    const hit = await gen.generateFromContext(context(pageTree()), {
      componentName: 'AutoForm',
      componentLibrary: 'auto',
      projectPackageJson: { dependencies: { 'element-plus': '^2.4.0' } },
      skipEnhancements: true,
    });
    expect(hit.code).toMatch(/from 'element-plus'/);

    const miss = await gen.generateFromContext(context(pageTree()), {
      componentName: 'AutoForm2',
      componentLibrary: 'auto',
      projectPackageJson: { dependencies: { vue: '^3' } },
      skipEnhancements: true,
    });
    expect(miss.code).not.toContain('element-plus');
    expect(miss.warnings.some((w) => w.includes('componentLibrary=auto'))).toBe(true);
  });

  it('auto + package.json 含 ant-design-vue → 命中', async () => {
    const { code } = await createVueGenerator(NULL_CLIENT).generateFromContext(context(pageTree()), {
      componentName: 'AvForm',
      componentLibrary: 'auto',
      projectPackageJson: { dependencies: { 'ant-design-vue': '^4.0.0' } },
      skipEnhancements: true,
    });
    expect(code).toMatch(/from 'ant-design-vue'/);
  });

  it('显式指定库不做依赖拦截（package.json 无该依赖也输出 import）', async () => {
    const { code } = await createVueGenerator(NULL_CLIENT).generateFromContext(context(pageTree()), {
      componentName: 'ExplicitForm',
      componentLibrary: 'element-plus',
      projectPackageJson: { dependencies: {} },
      skipEnhancements: true,
    });
    expect(code).toMatch(/from 'element-plus'/);
  });

  it('跨框架选择（Vue 生成器传 React 库）显式报错，不静默降级', async () => {
    await expect(
      createVueGenerator(NULL_CLIENT).generateFromContext(context(pageTree()), {
        // 类型联合允许该值，框架错配由运行时显式拦截（与样式方案矩阵一致）
        componentLibrary: 'ant-design',
        skipEnhancements: true,
      }),
    ).rejects.toThrow(/FDT-UI-LIB-FRAMEWORK-MISMATCH/);
  });
});

describe('WBS-P2-13 Vue2 Options API 注册', () => {
  it('vueVersion=2：import 之外额外输出 components: { ElButton, ... } 注册', async () => {
    const { code } = await createVueGenerator(NULL_CLIENT).generateFromContext(context(pageTree()), {
      componentName: 'LegacyForm',
      componentLibrary: 'element-plus',
      vueVersion: 2,
      skipEnhancements: true,
    });
    expect(code).toMatch(/import \{ ElButton, ElInput, ElCard \} from 'element-plus';/);
    expect(code).toMatch(/components: \{ ElButton, ElInput, ElCard \}/);
    // 模板标签仍然替换
    expect(code).toContain('<el-button');
  });
});

describe('WBS-P2-13 renderVuePropAttr 纯函数口径', () => {
  it('枚举/字符串 prop → 静态 kebab 属性；布尔 → 裸属性', () => {
    expect(renderVuePropAttr('element-plus', 'button', { name: 'type', value: 'primary', reason: '' })).toBe('type="primary"');
    expect(renderVuePropAttr('ant-design-vue', 'button', { name: 'danger', value: 'true', reason: '' })).toBe('danger');
    expect(renderVuePropAttr('element-plus', 'input', { name: 'placeholder', value: '搜索', reason: '' })).toBe('placeholder="搜索"');
  });

  it('tabs 激活态：antdv 输出 default-active-key；element-plus 返回 null（v-model 手工绑定）', () => {
    const prop = { name: 'defaultValue', value: '0', reason: '' };
    expect(renderVuePropAttr('ant-design-vue', 'tabs', prop)).toBe('default-active-key="0"');
    expect(renderVuePropAttr('element-plus', 'tabs', prop)).toBeNull();
  });
});
