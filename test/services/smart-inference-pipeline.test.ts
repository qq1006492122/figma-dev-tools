/**
 * v1.4.19 T21 智能推断管线集成（TR-21.1）
 *
 * 验证四类推断经增强器链接入 React TSX 与 Vue SFC 产物：
 * - 默认（skipEnhancements=false、无分项开关）：reports.smartInference 有建议且产物留注释痕迹；
 * - 四项全关：推断结果为空，产物中无任何推断注释（「关闭开关时产物无推断痕迹」）；
 * - skipEnhancements 总闸：根本不执行推断，reports.smartInference 缺省。
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { createCodeGenerator } from '../../src/services/code-generator.js';
import { createVueGenerator } from '../../src/services/vue-generator.js';
import type { FigmaClient } from '../../src/services/figma-client.js';
import { initI18nSync } from '../../src/i18n/index.js';
import type { DesignContext, ProcessedNode } from '../../src/types/nodes.js';

/** 无矢量/位图节点时生成器不触达 client（与 batch-generator 测试同款桩） */
const NULL_CLIENT = null as unknown as FigmaClient;

/** React 产物中的智能推断注释标记 */
const REACT_TRACE = 'Smart inference (v1.4.19';
/** Vue 产物中的智能推断注释标记 */
const VUE_TRACE = 'Smart inference hints (v1.4.19';

let seq = 0;

/**
 * 构造含四类推断触发点的组件树：
 * 根节点 sticky 命名（grid）+ Arrow Right 24×24（icon）+ Dark Mode 卡片（dark-mode）+ Hover 按钮（motion）。
 *
 * @returns ProcessedNode 树根
 */
function makeTree(): ProcessedNode {
  seq += 1;
  const leaf = (name: string, extra: Partial<ProcessedNode> = {}): ProcessedNode => ({
    id: `t21-${seq}-${name}`,
    figmaId: `30:${seq}-${name.length}`,
    name,
    originalType: 'FRAME',
    role: 'container',
    visible: true,
    clipsContent: false,
    size: { width: 80, height: 32 },
    children: [],
    ...extra,
  });
  return {
    id: `t21-root-${seq}`,
    figmaId: `30:${seq}`,
    name: 'Sticky Header Bar',
    originalType: 'FRAME',
    role: 'container',
    visible: true,
    clipsContent: false,
    size: { width: 1440, height: 96 },
    children: [
      leaf('Arrow Right', { size: { width: 24, height: 24 } }),
      leaf('Dark Mode Card', { size: { width: 200, height: 120 } }),
      leaf('Primary Button Hover'),
      leaf('Loading Spinner', { size: { width: 24, height: 24 } }),
    ],
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
    fileKey: 't21-fixture-key',
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

/** 全关开关 */
const ALL_OFF = { grid: false, icons: false, darkMode: false, motion: false } as const;

beforeEach(() => {
  initI18nSync();
});

describe('T21 React 生成器接入', () => {
  it('默认开启：四类建议进 reports 且 TSX 头注释留痕', async () => {
    const result = await createCodeGenerator(NULL_CLIENT).generateJsxFromContext(makeContext(makeTree()), {
      styleFormat: 'tailwind',
      bundler: 'none',
    });

    const smart = result.reports.smartInference;
    expect(smart).toBeDefined();
    expect(smart?.counts.grid).toBeGreaterThan(0);
    expect(smart?.counts.icon).toBeGreaterThan(0);
    expect(smart?.counts['dark-mode']).toBeGreaterThan(0);
    expect(smart?.counts.motion).toBeGreaterThan(0);
    expect(result.code).toContain(REACT_TRACE);
    // 建议性质：不改写显式样式（不注入 sticky/grid 类到 JSX className，仅注释中出现）
    expect(result.code).toContain('[grid]');
    expect(result.code).toContain('[icon]');
  });

  it('四项全关：建议为空，TSX 中无推断痕迹', async () => {
    const result = await createCodeGenerator(NULL_CLIENT).generateJsxFromContext(makeContext(makeTree()), {
      styleFormat: 'tailwind',
      bundler: 'none',
      inference: { ...ALL_OFF },
    });

    expect(result.reports.smartInference?.suggestions).toEqual([]);
    expect(result.code).not.toContain(REACT_TRACE);
    expect(result.code).not.toContain('Lucide');
    expect(result.code).not.toContain('dark:');
  });

  it('skipEnhancements 总闸：不执行推断，reports.smartInference 缺省', async () => {
    const result = await createCodeGenerator(NULL_CLIENT).generateJsxFromContext(makeContext(makeTree()), {
      styleFormat: 'tailwind',
      bundler: 'none',
      skipEnhancements: true,
    });

    expect(result.reports.smartInference).toBeUndefined();
    expect(result.code).not.toContain(REACT_TRACE);
  });
});

describe('T21 Vue 生成器接入（Vue3 script setup / Vue2 Options API）', () => {
  it('Vue3 默认开启：建议进 reports 且 SFC script 头注释留痕', async () => {
    const result = await createVueGenerator(NULL_CLIENT).generateFromContext(makeContext(makeTree()), {
      styleFormat: 'tailwind',
      bundler: 'none',
      vueVersion: 3,
    });

    expect(result.reports.smartInference?.suggestions.length).toBeGreaterThan(0);
    expect(result.code).toContain(VUE_TRACE);
    expect(result.code).toContain('lucide-vue-next');
    expect(result.code).toContain('<script setup lang="ts">');
  });

  it('Vue2 默认开启同样留痕；四项全关无痕迹', async () => {
    const enabled = await createVueGenerator(NULL_CLIENT).generateFromContext(makeContext(makeTree()), {
      styleFormat: 'tailwind',
      bundler: 'none',
      vueVersion: 2,
    });
    expect(enabled.code).toContain(VUE_TRACE);
    expect(enabled.code).toContain('defineComponent');

    const disabled = await createVueGenerator(NULL_CLIENT).generateFromContext(makeContext(makeTree()), {
      styleFormat: 'tailwind',
      bundler: 'none',
      vueVersion: 2,
      inference: { ...ALL_OFF },
    });
    expect(disabled.reports.smartInference?.suggestions).toEqual([]);
    expect(disabled.code).not.toContain(VUE_TRACE);
    expect(disabled.code).not.toContain('lucide-vue-next');
  });

  it('skipEnhancements 总闸：SFC 无推断注释且 reports 缺省', async () => {
    const result = await createVueGenerator(NULL_CLIENT).generateFromContext(makeContext(makeTree()), {
      styleFormat: 'tailwind',
      bundler: 'none',
      vueVersion: 3,
      skipEnhancements: true,
    });

    expect(result.reports.smartInference).toBeUndefined();
    expect(result.code).not.toContain(VUE_TRACE);
  });
});
