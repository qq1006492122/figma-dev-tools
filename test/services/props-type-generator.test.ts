/**
 * Component Properties → TS Props 推导测试（v1.4.18，T10 / TR-10.1、TR-10.3）
 *
 * 覆盖：
 * 1. extractComponentProperties：COMPONENT 定义（四类属性/默认值/variantOptions）
 *    与 INSTANCE 覆盖值（#id 后缀剥离）→ 规范化属性列表；
 * 2. 标识符清洗（空格转 camelCase、数字开头转义、重名去重）；
 * 3. generateReactPropsInterface：TEXT→string、BOOLEAN→boolean、
 *    VARIANT→字面量联合、INSTANCE_SWAP→React.ReactNode；无属性返回空串（TR-10.3）；
 * 4. generateVue3Props：interface Props + withDefaults，INSTANCE_SWAP→Component 类型导入标记。
 */
import { describe, expect, it } from 'vitest';

import type { FigmaNode } from '../../src/types.js';
import {
  extractComponentProperties,
  generateReactPropsInterface,
  generateVue3Props,
} from '../../src/services/props-type-generator.js';

/** 混合四类 Component Properties 的 COMPONENT 原始节点（Figma REST 形态） */
function makeComponentNode(): FigmaNode {
  return {
    id: '10:1',
    name: 'Button/Primary',
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

/** INSTANCE 节点：属性名带 #nodeId 后缀，值来自覆盖（componentProperties） */
function makeInstanceNode(): FigmaNode {
  return {
    id: '11:2',
    name: 'Button/Primary',
    type: 'INSTANCE',
    componentId: '10:1',
    componentProperties: {
      'Label#11:2': { type: 'TEXT', value: '立即提交' },
      'Disabled#11:2': { type: 'BOOLEAN', value: true },
      'Size#11:2': { type: 'VARIANT', value: 'large' },
      'Leading Icon#11:2': { type: 'INSTANCE_SWAP', value: 'icon:2' },
    },
  };
}

describe('T10 extractComponentProperties：原始节点 → 规范化属性', () => {
  it('COMPONENT：四类属性类型/默认值/variantOptions 完整提取且保序', () => {
    const props = extractComponentProperties(makeComponentNode());
    expect(props.map((p) => p.name)).toEqual(['Label', 'Disabled', 'Size', 'Leading Icon']);
    expect(props.map((p) => p.propName)).toEqual(['label', 'disabled', 'size', 'leadingIcon']);

    const [label, disabled, size, icon] = props;
    expect(label?.type).toBe('TEXT');
    expect(label?.required).toBe(false);
    expect(label?.defaultValue).toBe('确认操作');

    expect(disabled?.type).toBe('BOOLEAN');
    expect(disabled?.defaultValue).toBe(false);

    expect(size?.type).toBe('VARIANT');
    expect(size?.required).toBe(false);
    expect(size?.defaultValue).toBe('medium');
    expect(size?.variantOptions).toEqual(['small', 'medium', 'large']);

    expect(icon?.type).toBe('INSTANCE_SWAP');
    expect(icon?.required).toBe(false);
    expect(icon?.preferredComponentKeys).toEqual(['icon-key-1']);
  });

  it('INSTANCE：剥离 #nodeId 后缀，取 componentProperties 当前值作为默认值', () => {
    const props = extractComponentProperties(makeInstanceNode());
    expect(props.map((p) => p.propName)).toEqual(['label', 'disabled', 'size', 'leadingIcon']);
    expect(props[0]?.defaultValue).toBe('立即提交');
    expect(props[1]?.defaultValue).toBe(true);
    // INSTANCE 覆盖不带 variantOptions（联合类型无法从实例值恢复，由 VARIANT 当前值收窄为字面量）
    expect(props[2]?.variantOptions).toBeUndefined();
    expect(props[2]?.defaultValue).toBe('large');
  });

  it('无任何 Component Properties 的普通节点返回空数组（TR-10.3）', () => {
    const plain: FigmaNode = { id: '1:1', name: 'frame', type: 'FRAME' };
    expect(extractComponentProperties(plain)).toEqual([]);
  });

  it('标识符清洗：空格/连字符转 camelCase、数字开头加 prop 前缀、重名加后缀', () => {
    const node = {
      id: '1:1',
      name: 'Weird',
      type: 'COMPONENT',
      componentPropertyDefinitions: {
        'Button Label': { type: 'TEXT', defaultValue: 'a' },
        'button-label': { type: 'TEXT', defaultValue: 'b' },
        '2fast': { type: 'BOOLEAN', defaultValue: false },
        'show!@#': { type: 'BOOLEAN', defaultValue: false },
      },
    } as unknown as FigmaNode;
    const props = extractComponentProperties(node);
    expect(props.map((p) => p.propName)).toEqual(['buttonLabel', 'buttonLabel2', 'prop2fast', 'show']);
  });

  it('含引号/反斜杠的文本默认值被安全转义', () => {
    const node = {
      id: '1:1',
      name: 'Quote',
      type: 'COMPONENT',
      componentPropertyDefinitions: {
        Label: { type: 'TEXT', defaultValue: "it's \"fine\"" },
      },
    } as unknown as FigmaNode;
    const [label] = extractComponentProperties(node);
    expect(label?.defaultValue).toBe("it's \"fine\"");
    const iface = generateReactPropsInterface('QuoteCard', extractComponentProperties(node));
    expect(iface).toContain(`@default "it's \\"fine\\""`);
  });
});

describe('T10 generateReactPropsInterface：React interface 生成', () => {
  it('四类属性输出正确 TS 类型 + JSDoc，extends HTMLAttributes', () => {
    const iface = generateReactPropsInterface('ActionButton', extractComponentProperties(makeComponentNode()));
    expect(iface).toContain('export interface ActionButtonProps extends React.HTMLAttributes<HTMLElement> {');
    expect(iface).toMatch(/\/\*\*.*Label.*TEXT.*@default "确认操作".*\*\/\s*label\?: string;/s);
    expect(iface).toMatch(/disabled\?: boolean;/);
    expect(iface).toContain("size?: 'small' | 'medium' | 'large';");
    expect(iface).toContain('leadingIcon?: React.ReactNode;');
    // 无默认值的 VARIANT 应为必填（本 fixture 有默认，反向用例见下）
    expect(iface).not.toContain('size: ');
  });

  it('VARIANT 无默认值时输出必填字面量联合', () => {
    const props = extractComponentProperties({
      id: '1:1',
      name: 'Tag',
      type: 'COMPONENT',
      componentPropertyDefinitions: {
        Tone: { type: 'VARIANT', defaultValue: '' as unknown as string, variantOptions: ['info', 'warn'] },
      },
    } as unknown as FigmaNode);
    const iface = generateReactPropsInterface('Tag', props);
    expect(iface).toContain("tone: 'info' | 'warn';");
  });

  it('无属性返回空字符串（TR-10.3：不生成空 interface）', () => {
    expect(generateReactPropsInterface('Plain', [])).toBe('');
  });
});

describe('T10 generateVue3Props：Vue3 defineProps 类型块', () => {
  it('TS 模式：interface Props（含 class）+ withDefaults 原始默认值，INSTANCE_SWAP 标 Component 导入', () => {
    const result = generateVue3Props(extractComponentProperties(makeComponentNode()), { typescript: true });
    expect(result.interfaceBlock).toContain('interface Props {');
    expect(result.interfaceBlock).toContain('class?: string;');
    expect(result.interfaceBlock).toContain('label?: string;');
    expect(result.interfaceBlock).toContain('disabled?: boolean;');
    expect(result.interfaceBlock).toContain("size?: 'small' | 'medium' | 'large';");
    expect(result.interfaceBlock).toContain('leadingIcon?: Component;');
    expect(result.needsComponentImport).toBe(true);

    const defaults = result.withDefaultsEntries.join('\n');
    expect(defaults).toContain("class: ''");
    expect(defaults).toContain("label: '确认操作'");
    expect(defaults).toContain('disabled: false');
    expect(defaults).toContain("size: 'medium'");
    // INSTANCE_SWAP 无默认值，不进 withDefaults
    expect(defaults).not.toContain('leadingIcon');
  });

  it('非 TS 模式：输出运行时 props 声明（String/Boolean/Object）', () => {
    const result = generateVue3Props(extractComponentProperties(makeComponentNode()), { typescript: false });
    const runtime = result.runtimeEntries.join('\n');
    expect(runtime).toContain('label: { type: String');
    expect(runtime).toContain('disabled: { type: Boolean');
    expect(runtime).toContain('size: { type: String');
    expect(runtime).toContain('leadingIcon: { type: Object');
    expect(result.interfaceBlock).toBe('');
  });

  it('无 Figma 属性时 TS 模式保持最小 class 契约（TR-10.3：不生成业务属性）', () => {
    const result = generateVue3Props([], { typescript: true });
    expect(result.interfaceBlock).toContain('class?: string;');
    expect(result.interfaceBlock).not.toMatch(/label|size/);
    expect(result.needsComponentImport).toBe(false);
  });
});

describe('T12 安全回归：JSDoc 注释闭合注入净化（Figma 属性名/默认值不可信）', () => {
  /** 构造含恶意属性名/默认值的组件节点 */
  function makeMaliciousNode(): FigmaNode {
    return {
      id: '20:1',
      name: 'Button/Evil',
      type: 'COMPONENT',
      componentPropertyDefinitions: {
        // 尝试闭合 JSDoc 后注入语句：evil */ injected(); /*
        ['evil */ injected(); /*']: { type: 'TEXT', defaultValue: 'x */ payload(); /*' },
        // 换行 + 控制字符也不能破坏注释结构
        ['line\nbreak']: { type: 'BOOLEAN', defaultValue: true },
      },
    };
  }

  it('React：JSDoc 内不出现可闭合注释的 */ 序列，注入语句不落入 interface 代码区', () => {
    const props = extractComponentProperties(makeMaliciousNode());
    const output = generateReactPropsInterface('EvilButton', props);

    // 每个 /** 必须恰好遇到一个收尾 */（注释数量成对），且注入语句不与代码同级出现
    const comments = output.match(/\/\*\*[\s\S]*?\*\//g) ?? [];
    expect(comments.length).toBeGreaterThan(0);
    for (const comment of comments) {
      const inner = comment.slice(3, -2);
      expect(inner).not.toContain('*/');
    }
    // 净化后的注入语句只能以中和形态出现在注释内部
    expect(output).toContain('* / injected();');
    expect(output).toContain('* / payload();');
    // 真正的标识符仍由 toPropName 白名单化
    expect(output).toMatch(/evilInjected\??: string/);
  });

  it('Vue3：interface Props 的 JSDoc 同样被净化，withDefaults 字面量经转义', () => {
    const result = generateVue3Props(extractComponentProperties(makeMaliciousNode()), { typescript: true });
    const comments = result.interfaceBlock.match(/\/\*\*[\s\S]*?\*\//g) ?? [];
    expect(comments.length).toBeGreaterThan(0);
    for (const comment of comments) {
      expect(comment.slice(3, -2)).not.toContain('*/');
    }
    expect(result.interfaceBlock).toContain('* / injected();');
    // 换行被折叠，不产生跨注释行
    expect(result.interfaceBlock).not.toContain('\nbreak');
  });
});
