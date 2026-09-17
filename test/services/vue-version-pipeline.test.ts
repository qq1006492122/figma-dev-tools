/**
 * v1.4.19 T18 Vue 版本矩阵（TR-18.2）
 *
 * 同一棵「操作卡片」夹具 × Vue2/Vue3 × 增强开关，锁定 SFC 脚本形态契约：
 *
 * - vueVersion=2（TS）：Options API 骨架（defineComponent/name/props/data/computed/methods），
 *   VARIANT 经 PropType 联合收窄，INSTANCE_SWAP 经 PropType<Component> 收窄；
 * - vueVersion=2（JS）：export default 对象字面量，VARIANT 以运行时 validator 白名单兜底，
 *   全文件不出现 TS 类型注解；
 * - vueVersion=3（TS）：<script setup lang="ts"> + interface Props 形态不回退；
 * - 增强开关开/关两版本各一份快照，reports 非空字段随产物透出。
 *
 * 模板/样式链路与 v1.4.18 完全一致，本文件只锁定脚本块与 vueVersion 元信息。
 */
import { describe, expect, it } from 'vitest';

import { createVueGenerator } from '../../src/services/vue-generator.js';
import type { VueGenerator } from '../../src/services/vue-generator.js';
import type { FigmaClient } from '../../src/services/figma-client.js';
import type { DesignContext, ProcessedComponentProperty, ProcessedNode } from '../../src/types/nodes.js';

/** 覆盖四分类的 Component Properties 夹具（TEXT/BOOLEAN/VARIANT/INSTANCE_SWAP） */
const COMPONENT_PROPERTIES: readonly ProcessedComponentProperty[] = [
  {
    name: 'Label',
    propName: 'label',
    type: 'TEXT',
    required: false,
    defaultValue: 'Confirm',
  },
  {
    name: 'Disabled',
    propName: 'disabled',
    type: 'BOOLEAN',
    required: false,
    defaultValue: false,
  },
  {
    name: 'Size',
    propName: 'size',
    type: 'VARIANT',
    required: false,
    defaultValue: 'medium',
    variantOptions: ['small', 'medium', 'large'],
  },
  {
    name: 'Leading Icon',
    propName: 'leadingIcon',
    type: 'INSTANCE_SWAP',
    required: true,
    preferredComponentKeys: ['ICON:1'],
  },
];

/** 简单垂直卡片：根挂四分类 props，含一个文本子节点（保证模板非空） */
function makeCardTree(): ProcessedNode {
  const title: ProcessedNode = {
    id: 'node-title',
    figmaId: '31:2',
    name: 'title',
    originalType: 'TEXT',
    role: 'text',
    visible: true,
    clipsContent: false,
    size: { width: 200, height: 24 },
    textContent: 'Card Title',
    children: [],
  };

  return {
    id: 'node-card',
    figmaId: '31:1',
    name: 'prop-card',
    originalType: 'FRAME',
    role: 'container',
    visible: true,
    clipsContent: false,
    size: { width: 320, height: 160 },
    layout: {
      mode: 'VERTICAL',
      primaryAxisAlign: 'MIN',
      counterAxisAlign: 'MIN',
      primaryAxisSizing: 'AUTO',
      counterAxisSizing: 'AUTO',
      layoutWrap: 'NO_WRAP',
      itemSpacing: 12,
      counterAxisSpacing: 0,
      padding: { top: 16, right: 16, bottom: 16, left: 16 },
    },
    componentProperties: [...COMPONENT_PROPERTIES],
    children: [title],
  };
}

/** 构造最小 DesignContext（生成器运行所需字段） */
function makeContext(): DesignContext {
  return {
    fileKey: 'test-file-key',
    node: makeCardTree(),
    colors: [],
    spacing: [],
    radii: [],
    shadows: [],
    assets: [],
    textNodes: [],
    componentsUsed: [],
  };
}

/** 生成器仅在 SVG 内联渲染分支使用 client，本夹具无矢量/位图节点，不会触达 */
const NULL_CLIENT = null as unknown as FigmaClient;

/** Promise/方法返回值类型解包（测试内联类型工具，零 any） */
type Awaited<T> = T extends Promise<infer U> ? U : T;
/** Vue 生成结果类型（经实例方法推导，避免手写接口漂移） */
type VueResult = Awaited<ReturnType<VueGenerator['generateFromContext']>>;

/** Vue 生成统一入口（tailwind 默认样式，本文件只关注脚本块） */
async function generateVue(
  vueVersion: 2 | 3,
  options: { typescript: boolean; skipEnhancements: boolean },
): Promise<VueResult> {
  const generator = createVueGenerator(NULL_CLIENT);
  return generator.generateFromContext(makeContext(), {
    componentName: 'PropCard',
    bundler: 'none',
    vueVersion,
    typescript: options.typescript,
    skipEnhancements: options.skipEnhancements,
  });
}

describe('TR-18.2 Vue2 Options API（TS，关闭增强）', () => {
  it('defineComponent 骨架 + PropType 联合/Component 收窄 + 固定 data/computed/methods，快照', async () => {
    const result = await generateVue(2, { typescript: true, skipEnhancements: true });
    expect(result.vueVersion).toBe(2);
    expect(result.code).toMatchSnapshot();

    // Options API 骨架五件套（prettier 将模板管线的 computed 导入与本块 vue 导入合并排序）
    expect(result.code).toContain(
      "import { type Component, type PropType, computed, defineComponent } from 'vue';",
    );
    expect(result.code).toContain('export default defineComponent({');
    expect(result.code).toContain("  name: 'PropCard',");
    expect(result.code).toContain('  data() {');
    expect(result.code).toContain('  computed: {');
    expect(result.code).toContain('  methods: {');
    // class 透传契约与 Vue3 保持一致
    expect(result.code).toContain("    class: { type: String, default: '' },");
    // TEXT/BOOLEAN 构造器声明 + 默认值
    expect(result.code).toContain("label: { type: String, default: 'Confirm' },");
    expect(result.code).toContain('disabled: { type: Boolean, default: false },');
    // VARIANT：TS 下 PropType 字面量联合（顺序与 variantOptions 一致；默认值仍由 Figma 变体承载，不写运行时 default）
    expect(result.code).toContain("size: { type: String as PropType<'small' | 'medium' | 'large'> },");
    // INSTANCE_SWAP：PropType<Component>，required
    expect(result.code).toContain(
      'leadingIcon: { type: Object as PropType<Component>, required: true },',
    );
    // 头注释标注 Vue 2 管线
    expect(result.code).toContain('(Vue 2 Options API)');
    // 模板与 script setup 形态均不应串味
    expect(result.code).toContain('<template>');
    expect(result.code).not.toContain('<script setup');
  });
});

describe('TR-18.2 Vue2 Options API（JS，关闭增强）', () => {
  it('export default 对象 + validator 白名单，全文件无 TS 注解，快照', async () => {
    const result = await generateVue(2, { typescript: false, skipEnhancements: true });
    expect(result.vueVersion).toBe(2);
    expect(result.code).toMatchSnapshot();

    // JS 模式：无 lang="ts"、无 defineComponent/PropType/Component
    expect(result.code).toContain('<script>');
    expect(result.code).not.toContain('lang="ts"');
    expect(result.code).toContain('export default {');
    expect(result.code).not.toContain('defineComponent');
    expect(result.code).not.toContain('PropType');
    // VARIANT 降级为 String + 运行时 validator 白名单（单行，prettier 不折行）
    expect(result.code).toContain(
      "size: { type: String, validator: (value) => ['small', 'medium', 'large'].includes(value) },",
    );
    // INSTANCE_SWAP 降级为 Object（无泛型）
    expect(result.code).toContain('leadingIcon: { type: Object, required: true },');
    // 骨架仍完整
    expect(result.code).toContain('  data() {');
    expect(result.code).toContain('  methods: {');
    expect(result.code).toContain('};');
  });
});

describe('TR-18.2 Vue3 script setup（TS，关闭增强）不回退', () => {
  it('<script setup lang="ts"> + interface Props，无 Options API 骨架，快照', async () => {
    const result = await generateVue(3, { typescript: true, skipEnhancements: true });
    expect(result.vueVersion).toBe(3);
    expect(result.code).toMatchSnapshot();

    expect(result.code).toContain('<script setup lang="ts">');
    expect(result.code).toContain('interface Props {');
    // Vue3 模板中的 props 引用形态
    expect(result.code).toContain('withDefaults(defineProps<Props>()');
    // 不得回退为 Options API
    expect(result.code).not.toContain('defineComponent');
    expect(result.code).not.toContain('  data() {');
    expect(result.code).not.toContain('  methods: {');
    // INSTANCE_SWAP 触发的 Component 类型导入（prettier 内联 type 形态）
    expect(result.code).toContain("import { type Component } from 'vue';");
  });
});

describe('TR-18.2 增强开关开启（Vue2/Vue3 各一）', () => {
  it('Vue2 开启增强：脚本骨架不变，reports 透出非空报告项，快照', async () => {
    const result = await generateVue(2, { typescript: true, skipEnhancements: false });
    expect(result.vueVersion).toBe(2);
    expect(result.code).toMatchSnapshot();

    // 增强链不改变 Options API 骨架契约
    expect(result.code).toContain('export default defineComponent({');
    expect(result.code).toContain('  methods: {');
    expect(result.code).toContain('<template>');
    // 增强报告对象存在且至少透出一个报告分区
    expect(result.reports).toBeDefined();
    expect(Object.keys(result.reports ?? {}).length).toBeGreaterThan(0);
  });

  it('Vue3 开启增强：script setup 形态不变，reports 透出非空报告项，快照', async () => {
    const result = await generateVue(3, { typescript: true, skipEnhancements: false });
    expect(result.vueVersion).toBe(3);
    expect(result.code).toMatchSnapshot();

    expect(result.code).toContain('<script setup lang="ts">');
    expect(result.code).not.toContain('defineComponent');
    expect(result.code).toContain('<template>');
    expect(result.reports).toBeDefined();
    expect(Object.keys(result.reports ?? {}).length).toBeGreaterThan(0);
  });
});
