/**
 * v1.4.19 T22 语义推断管线集成（TR-22.1）
 *
 * 验证列表数据化与语义命名经增强器链接入 React TSX 与 Vue SFC 产物：
 * - 默认（skipEnhancements=false）：reports.semantic 有建议且产物头注释留痕，
 *   React 注释含 interface 与 .map() 示例，Vue 注释含 v-for 示例；
 * - skipEnhancements 总闸：不执行语义推断，reports.semantic 缺省、产物无痕迹。
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { createCodeGenerator } from '../../src/services/code-generator.js';
import { createVueGenerator } from '../../src/services/vue-generator.js';
import type { FigmaClient } from '../../src/services/figma-client.js';
import { initI18nSync } from '../../src/i18n/index.js';
import type { DesignContext, ProcessedNode } from '../../src/types/nodes.js';

/** 无矢量/位图节点时生成器不触达 client */
const NULL_CLIENT = null as unknown as FigmaClient;

/** React 产物中的列表数据注释标记 */
const LIST_TRACE = 'Data-driven structure hints (v1.4.19';
/** React/Vue 产物中的语义命名注释标记 */
const NAME_TRACE = 'Semantic name suggestions (v1.4.19';

let seq = 0;

/**
 * 构造文本节点夹具
 *
 * @param name - 节点名
 * @param textContent - 文本内容
 * @returns TEXT ProcessedNode
 */
function text(name: string, textContent: string): ProcessedNode {
  seq += 1;
  return {
    id: `t22-text-${seq}`,
    figmaId: `50:${seq}`,
    name,
    originalType: 'TEXT',
    role: 'text',
    visible: true,
    clipsContent: false,
    size: { width: 200, height: 20 },
    textContent,
    children: [],
  };
}

/**
 * 构造含语义触发点的组件树：
 * 外层页面包含 Article Cards（3 张等宽卡片，Title/Price）与 Frame 序号命名的 Book Now 按钮。
 *
 * @returns ProcessedNode 树根
 */
function makeTree(): ProcessedNode {
  seq += 1;
  const card = (index: number): ProcessedNode => ({
    id: `t22-card-${seq}-${index}`,
    figmaId: `50:${seq}${index}`,
    name: `Card ${index}`,
    originalType: 'FRAME',
    role: 'container',
    visible: true,
    clipsContent: false,
    size: { width: 260, height: 140 },
    children: [text('Title', `Headline ${index}`), text('Price', '$199')],
  });
  const list: ProcessedNode = {
    id: `t22-list-${seq}`,
    figmaId: `50:${seq}8`,
    name: 'Article Cards',
    originalType: 'FRAME',
    role: 'container',
    visible: true,
    clipsContent: false,
    size: { width: 900, height: 160 },
    children: [card(1), card(2), card(3)],
  };
  const cta: ProcessedNode = {
    id: `t22-cta-${seq}`,
    figmaId: `50:${seq}9`,
    name: 'Frame 7',
    originalType: 'COMPONENT',
    role: 'button',
    visible: true,
    clipsContent: false,
    size: { width: 120, height: 40 },
    children: [text('CTA Label', 'Book Now')],
  };
  return {
    id: `t22-root-${seq}`,
    figmaId: `50:${seq}`,
    name: 'Article Page',
    originalType: 'FRAME',
    role: 'container',
    visible: true,
    clipsContent: false,
    size: { width: 900, height: 220 },
    children: [list, cta],
  };
}

/**
 * 构造最小 DesignContext
 *
 * @param root - 树根
 * @returns DesignContext
 */
function makeContext(root: ProcessedNode): DesignContext {
  return {
    fileKey: 't22-fixture-key',
    node: root,
    colors: [],
    spacing: [],
    radii: [],
    shadows: [],
    assets: [],
    textNodes: [],
    componentsUsed: [],
  };
}

beforeEach(() => {
  initI18nSync();
});

describe('T22 React 生成器接入', () => {
  it('默认开启：列表/命名建议进 reports，TSX 头注释含 interface + .map() 示例', async () => {
    const result = await createCodeGenerator(NULL_CLIENT).generateJsxFromContext(makeContext(makeTree()), {
      styleFormat: 'tailwind',
      bundler: 'none',
    });

    const semantic = result.reports.semantic;
    expect(semantic).toBeDefined();
    expect(semantic?.counts.dataStructures).toBe(1);
    expect(semantic?.dataStructures[0]?.interfaceName).toBe('ArticleCardItem');
    expect(semantic?.counts.nameSuggestions).toBeGreaterThan(0);
    expect(
      semantic?.nameSuggestions.some((suggestion) => suggestion.suggestedName === 'BookNowButton'),
    ).toBe(true);

    expect(result.code).toContain(LIST_TRACE);
    expect(result.code).toContain(NAME_TRACE);
    expect(result.code).toContain('interface ArticleCardItem');
    expect(result.code).toContain('.map(');
    // 示例代码不得作为可执行产物写入：仅出现在 JSDoc 注释行（以 ` *` 前缀）
    const mapLine = result.code.split('\n').find((line) => line.includes('.map('));
    expect(mapLine?.trimStart().startsWith('*')).toBe(true);
  });

  it('skipEnhancements 总闸：reports.semantic 缺省且 TSX 无痕', async () => {
    const result = await createCodeGenerator(NULL_CLIENT).generateJsxFromContext(makeContext(makeTree()), {
      styleFormat: 'tailwind',
      bundler: 'none',
      skipEnhancements: true,
    });

    expect(result.reports.semantic).toBeUndefined();
    expect(result.code).not.toContain(LIST_TRACE);
    expect(result.code).not.toContain(NAME_TRACE);
  });
});

describe('T22 Vue 生成器接入（Vue3 setup / Vue2 Options API）', () => {
  it('Vue3：reports.semantic 有建议，SFC script 注释含 v-for 示例', async () => {
    const result = await createVueGenerator(NULL_CLIENT).generateFromContext(makeContext(makeTree()), {
      styleFormat: 'tailwind',
      bundler: 'none',
      vueVersion: 3,
    });

    expect(result.reports.semantic?.counts.dataStructures).toBe(1);
    expect(result.code).toContain(LIST_TRACE);
    expect(result.code).toContain(NAME_TRACE);
    expect(result.code).toContain('v-for="item in articleCards"');
    expect(result.code).toContain('<script setup lang="ts">');
  });

  it('Vue2 Options API：同样在脚本注释留痕；skipEnhancements 缺省', async () => {
    const enabled = await createVueGenerator(NULL_CLIENT).generateFromContext(makeContext(makeTree()), {
      styleFormat: 'tailwind',
      bundler: 'none',
      vueVersion: 2,
    });
    expect(enabled.code).toContain(LIST_TRACE);
    expect(enabled.code).toContain('defineComponent');

    const disabled = await createVueGenerator(NULL_CLIENT).generateFromContext(makeContext(makeTree()), {
      styleFormat: 'tailwind',
      bundler: 'none',
      vueVersion: 2,
      skipEnhancements: true,
    });
    expect(disabled.reports.semantic).toBeUndefined();
    expect(disabled.code).not.toContain(LIST_TRACE);
    expect(disabled.code).not.toContain(NAME_TRACE);
  });
});
