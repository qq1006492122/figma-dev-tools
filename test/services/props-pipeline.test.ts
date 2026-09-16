/**
 * Component Properties → Props 推导端到端测试（v1.4.18，T10 / TR-10.1、TR-10.3）
 *
 * React/Vue 生成器消费 ProcessedNode.componentProperties：
 * - 含四类混合属性的组件输出正确 props 类型（快照 + 断言）；
 * - 无属性节点不产生空 interface（React）/ 仅保留 class 契约（Vue）。
 */
import { describe, expect, it } from 'vitest';

import { createCodeGenerator } from '../../src/services/code-generator.js';
import { createVueGenerator } from '../../src/services/vue-generator.js';
import type { FigmaClient } from '../../src/services/figma-client.js';
import { extractComponentProperties } from '../../src/services/props-type-generator.js';
import type { FigmaNode } from '../../src/types.js';
import type { DesignContext, ProcessedNode } from '../../src/types/nodes.js';

/** 混合四类 Component Properties 的原始 COMPONENT（与 props-type-generator 单测同形态） */
function makeRawComponent(): FigmaNode {
  return {
    id: '10:1',
    name: 'ActionButton',
    type: 'COMPONENT',
    componentPropertyDefinitions: {
      Label: { type: 'TEXT', defaultValue: '确认操作' },
      Disabled: { type: 'BOOLEAN', defaultValue: false },
      Size: { type: 'VARIANT', defaultValue: 'medium', variantOptions: ['small', 'medium', 'large'] },
      'Leading Icon': {
        type: 'INSTANCE_SWAP',
        defaultValue: '',
        preferredValues: [{ type: 'COMPONENT', key: 'icon-key-1' }],
      },
    },
  };
}

/** 构造 ProcessedNode 根（组件属性挂在根节点，生成器从根推导 Props） */
function makeProcessedRoot(withProps: boolean): ProcessedNode {
  return {
    id: 'node-root-1',
    figmaId: '10:1',
    name: 'ActionButton',
    originalType: 'COMPONENT',
    role: 'container',
    visible: true,
    clipsContent: false,
    size: { width: 120, height: 40 },
    layout: {
      mode: 'HORIZONTAL',
      primaryAxisAlign: 'CENTER',
      counterAxisAlign: 'CENTER',
      primaryAxisSizing: 'FIXED',
      counterAxisSizing: 'FIXED',
      layoutWrap: 'NO_WRAP',
      itemSpacing: 0,
      counterAxisSpacing: 0,
      padding: { top: 8, right: 16, bottom: 8, left: 16 },
    },
    componentProperties: withProps ? extractComponentProperties(makeRawComponent()) : undefined,
    children: [],
  };
}

function makeContext(node: ProcessedNode): DesignContext {
  return {
    fileKey: 'test-file-key',
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

/** 本夹具无矢量/位图节点，不会触达 client */
const NULL_CLIENT = null as unknown as FigmaClient;

describe('T10 / TR-10.1 React 生成器 Props 端到端', () => {
  it('混合四类属性：interface + FC 泛型 + JSDoc，快照', async () => {
    const generator = createCodeGenerator(NULL_CLIENT);
    const result = await generator.generateJsxFromContext(makeContext(makeProcessedRoot(true)), {
      componentName: 'ActionButton',
      bundler: 'none',
      skipEnhancements: true,
    });

    expect(result.code).toMatchSnapshot();
    expect(result.code).toContain('export interface ActionButtonProps extends React.HTMLAttributes<HTMLElement> {');
    expect(result.code).toContain('label?: string;');
    expect(result.code).toContain('disabled?: boolean;');
    expect(result.code).toContain("size?: 'small' | 'medium' | 'large';");
    expect(result.code).toContain('leadingIcon?: React.ReactNode;');
    expect(result.code).toContain('@default "确认操作"');
    expect(result.code).toContain('React.FC<ActionButtonProps>');
  });

  it('TR-10.3 无属性节点：不生成空 interface，FC 内联 HTMLAttributes', async () => {
    const generator = createCodeGenerator(NULL_CLIENT);
    const result = await generator.generateJsxFromContext(makeContext(makeProcessedRoot(false)), {
      componentName: 'PlainCard',
      bundler: 'none',
      skipEnhancements: true,
    });
    expect(result.code).not.toContain('export interface');
    expect(result.code).toContain('React.FC<React.HTMLAttributes<HTMLElement>>');
  });
});

describe('T10 / TR-10.1 Vue 生成器 Props 端到端', () => {
  it('混合四类属性：interface Props + withDefaults + Component 类型导入，快照', async () => {
    const generator = createVueGenerator(NULL_CLIENT);
    const result = await generator.generateFromContext(makeContext(makeProcessedRoot(true)), {
      componentName: 'ActionButton',
      typescript: true,
      bundler: 'none',
      skipEnhancements: true,
    });

    expect(result.code).toMatchSnapshot();
    // import-organizer 会把语句级 `import type { Component }` 规范化为行内 `type Component`
    expect(result.code).toContain("type Component } from 'vue';");
    expect(result.code).toContain('interface Props {');
    expect(result.code).toContain('label?: string;');
    expect(result.code).toContain("size?: 'small' | 'medium' | 'large';");
    expect(result.code).toContain('leadingIcon?: Component;');
    expect(result.code).toContain("label: '确认操作'");
    expect(result.code).toContain('disabled: false');
  });

  it('TR-10.3 无属性节点：仅保留 class 契约，无业务属性与 Component 导入', async () => {
    const generator = createVueGenerator(NULL_CLIENT);
    const result = await generator.generateFromContext(makeContext(makeProcessedRoot(false)), {
      componentName: 'PlainCard',
      typescript: true,
      bundler: 'none',
      skipEnhancements: true,
    });
    expect(result.code).toContain('class?: string;');
    expect(result.code).not.toContain("import type { Component }");
    expect(result.code).not.toMatch(/label|leadingIcon/);
  });
});
