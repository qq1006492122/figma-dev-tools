/**
 * UnoCSS 双管线端到端快照（v1.4.18，T8 / TR-8.1）
 *
 * React/Vue × wind/attributify 共 4 组快照，验证：
 * 1. wind 模式：原子类全部走 class（React cn() / Vue class 属性），与 tailwind 渲染同类名；
 * 2. attributify 模式：安全 token 以无值属性输出（React flex="" / Vue <div flex>），
 *    arbitrary/变体 token 回退保留在 class；
 * 3. 所有产物均无 Tailwind 专有指令残留（@apply / @tailwind / @config）；
 * 4. styleHints 随生成结果回传（仅建议，不落盘）。
 */
import { describe, expect, it } from 'vitest';

import { createCodeGenerator } from '../../src/services/code-generator.js';
import { createVueGenerator } from '../../src/services/vue-generator.js';
import type { FigmaClient } from '../../src/services/figma-client.js';
import type { DesignContext, ProcessedNode } from '../../src/types/nodes.js';

/**
 * 构造自动布局卡片节点：
 * - 纵向 flex + items-center，padding 16 → p-4（安全属性 token）
 * - itemSpacing 13（非标 spacing）→ gap-[13px]（arbitrary，必须留在 class）
 * - width 321（非标）→ w-[321px]（arbitrary，必须留在 class）
 * - 含一个 TEXT 子节点，覆盖文本节点的 attributify 输出路径
 */
function makeCardTree(): ProcessedNode {
  const title: ProcessedNode = {
    id: 'node-title',
    figmaId: '20:2',
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
    figmaId: '20:1',
    name: 'uno-card',
    originalType: 'FRAME',
    role: 'container',
    visible: true,
    clipsContent: false,
    size: { width: 321, height: 160 },
    layout: {
      mode: 'VERTICAL',
      primaryAxisAlign: 'MIN',
      counterAxisAlign: 'CENTER',
      primaryAxisSizing: 'AUTO',
      counterAxisSizing: 'AUTO',
      layoutWrap: 'NO_WRAP',
      itemSpacing: 13,
      counterAxisSpacing: 0,
      padding: { top: 16, right: 16, bottom: 16, left: 16 },
    },
    children: [title],
  };
}

/** 构造最小 DesignContext（生成器运行所需字段） */
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

/** 生成器仅在 SVG 内联渲染分支使用 client，本夹具无矢量/位图节点，不会触达 */
const NULL_CLIENT = null as unknown as FigmaClient;

/** Tailwind 专有指令黑名单：UnoCSS presetWind 产物只允许原子类，不允许这些指令 */
const TAILWIND_DIRECTIVE_PATTERNS = [/@apply/, /@tailwind/, /@config/, /@theme/] as const;

describe('T8 / TR-8.1 React UnoCSS 双管线快照', () => {
  it('wind 模式：原子类走 className，快照', async () => {
    const generator = createCodeGenerator(NULL_CLIENT);
    const result = await generator.generateJsxFromContext(makeContext(makeCardTree()), {
      componentName: 'UnoCard',
      styleFormat: 'unocss',
      unocssMode: 'wind',
      bundler: 'none',
      skipEnhancements: true,
    });
    expect(result.code).toMatchSnapshot();
    // wind：根节点 cn() 包裹，含 flex 与 arbitrary gap/width；不出现属性化输出
    expect(result.code).toContain('className={cn(');
    expect(result.code).toContain('flex');
    expect(result.code).toContain('gap-[13px]');
    expect(result.code).toContain('w-[321px]');
    expect(result.code).not.toContain('flex=""');
  });

  it('attributify 模式：安全 token 属性化、arbitrary 留 class，快照', async () => {
    const generator = createCodeGenerator(NULL_CLIENT);
    const result = await generator.generateJsxFromContext(makeContext(makeCardTree()), {
      componentName: 'UnoCard',
      styleFormat: 'unocss',
      unocssMode: 'attributify',
      bundler: 'none',
      skipEnhancements: true,
    });
    expect(result.code).toMatchSnapshot();
    // 安全 token 以 JSX 无值属性（空串）输出
    expect(result.code).toContain('flex=""');
    expect(result.code).toContain('p-4=""');
    // arbitrary token 必须保留在 class
    expect(result.code).toContain('gap-[13px]');
    expect(result.code).toContain('w-[321px]');
    // 文件头有 attributify 说明注释
    expect(result.code).toContain('UnoCSS attributify mode');
  });

  it('两种模式均无 Tailwind 专有指令，且回传 styleHints', async () => {
    const generator = createCodeGenerator(NULL_CLIENT);
    for (const mode of ['wind', 'attributify'] as const) {
      const result = await generator.generateJsxFromContext(makeContext(makeCardTree()), {
        componentName: 'UnoCard',
        styleFormat: 'unocss',
        unocssMode: mode,
        bundler: 'none',
        skipEnhancements: true,
      });
      for (const pattern of TAILWIND_DIRECTIVE_PATTERNS) {
        expect(result.code).not.toMatch(pattern);
      }
      const hintText = result.styleHints.map((h) => h.code).join('\n');
      expect(hintText).toContain('presetWind');
      expect(hintText).toContain("virtual:uno.css");
      if (mode === 'attributify') {
        expect(hintText).toContain('presetAttributify');
      }
    }
  });
});

describe('T8 / TR-8.1 Vue UnoCSS 双管线快照', () => {
  it('wind 模式：原子类走 class 属性，快照', async () => {
    const generator = createVueGenerator(NULL_CLIENT);
    const result = await generator.generateFromContext(makeContext(makeCardTree()), {
      componentName: 'UnoCard',
      styleFormat: 'unocss',
      unocssMode: 'wind',
      bundler: 'none',
      skipEnhancements: true,
    });
    expect(result.code).toMatchSnapshot();
    // wind：模板只有 class，无属性化 token（根标签为语义标签 section）
    expect(result.code).toContain('class="');
    expect(result.code).toContain('flex');
    expect(result.code).toContain('gap-[13px]');
    expect(result.code).not.toMatch(/<section[^>]*\sflex(?:\s|=|>)/);
  });

  it('attributify 模式：安全 token 输出为无值模板属性，快照', async () => {
    const generator = createVueGenerator(NULL_CLIENT);
    const result = await generator.generateFromContext(makeContext(makeCardTree()), {
      componentName: 'UnoCard',
      styleFormat: 'unocss',
      unocssMode: 'attributify',
      bundler: 'none',
      skipEnhancements: true,
    });
    expect(result.code).toMatchSnapshot();
    // attributify：模板开标签上出现无值属性 flex / p-4（根标签为语义标签 section）
    expect(result.code).toMatch(/<section[^>]*\sflex(?:\s|>)/);
    expect(result.code).toMatch(/<section[^>]*\sp-4(?:\s|>)/);
    // arbitrary token 保留在 class
    expect(result.code).toContain('gap-[13px]');
    expect(result.code).toContain('w-[321px]');
    // 文本子节点同样走 attributify 输出（text 节点至少安全属性化其类名；不断言具体 token）
    expect(result.code).toContain('Card Title');
  });

  it('两种模式均无 Tailwind 专有指令，且回传 styleHints', async () => {
    const generator = createVueGenerator(NULL_CLIENT);
    for (const mode of ['wind', 'attributify'] as const) {
      const result = await generator.generateFromContext(makeContext(makeCardTree()), {
        componentName: 'UnoCard',
        styleFormat: 'unocss',
        unocssMode: mode,
        bundler: 'none',
        skipEnhancements: true,
      });
      for (const pattern of TAILWIND_DIRECTIVE_PATTERNS) {
        expect(result.code).not.toMatch(pattern);
      }
      const hintText = result.styleHints.map((h) => h.code).join('\n');
      expect(hintText).toContain('presetWind');
      expect(hintText).toContain("virtual:uno.css");
      if (mode === 'attributify') {
        expect(hintText).toContain('presetAttributify');
      }
    }
  });
});
