/**
 * v1.4.19 T21 智能推断器测试（TR-21.1）
 *
 * 四类推断各覆盖 ≥2 个 fixture：
 * - grid：Auto Layout 换行容器 / 自由排版 2×2 矩阵 / sticky / fixed / absolute 参照物；
 * - icons：Lucide 语义命名（中英、React/Vue 分包）/ 通用矢量 → Iconify/内联 / 超尺寸不识别；
 * - dark-mode：dark 语义命名 / 近黑表面填充 / 无命名佐证不提示；
 * - motion：hover / spinner 两类状态语义。
 * 另验证：单项开关关闭只静默该类；全部关闭（或 skipEnhancements 等效路径）产物零推断痕迹。
 */
import { describe, expect, it } from 'vitest';

import {
  createSmartInferrer,
  formatSmartInferenceComments,
  type SmartInferenceResult,
} from '../../src/services/smart-inferrer.js';
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
    id: `n-${idSeq}`,
    figmaId: partial.figmaId ?? `20:${idSeq}`,
    originalType: 'FRAME',
    role: 'container',
    visible: true,
    clipsContent: false,
    size: { width: 100, height: 100 },
    children: [],
    ...partial,
  };
}

/**
 * 运行推断并返回建议（便捷断言夹具）
 *
 * @param root - 根节点
 * @param switches - 分项开关
 * @param framework - 目标框架
 * @returns 推断结果
 */
function run(
  root: ProcessedNode,
  switches?: { grid?: boolean; icons?: boolean; darkMode?: boolean; motion?: boolean },
  framework: 'react' | 'vue' = 'react',
): SmartInferenceResult {
  return createSmartInferrer().infer(root, { framework, switches });
}

/**
 * 按类别收集建议消息
 *
 * @param result - 推断结果
 * @param category - 类别
 * @returns 匹配的建议
 */
function ofCategory(result: SmartInferenceResult, category: string) {
  return result.suggestions.filter((suggestion) => suggestion.category === category);
}

describe('smart-inferrer: grid 布局推断', () => {
  it('fixture 1：Auto Layout WRAP 容器（首行 2 列）→ grid-cols-2 + gap', () => {
    const root = makeNode({
      name: 'Tag Wrap List',
      layout: {
        mode: 'HORIZONTAL',
        layoutWrap: 'WRAP',
        primaryAxisAlign: 'MIN',
        counterAxisAlign: 'MIN',
        primaryAxisSizing: 'FIXED',
        counterAxisSizing: 'AUTO',
        itemSpacing: 16,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
      },
      children: [
        makeNode({ name: 'Tag 1', position: { x: 0, y: 0 }, size: { width: 80, height: 32 } }),
        makeNode({ name: 'Tag 2', position: { x: 96, y: 0 }, size: { width: 80, height: 32 } }),
        makeNode({ name: 'Tag 3', position: { x: 0, y: 48 }, size: { width: 80, height: 32 } }),
        makeNode({ name: 'Tag 4', position: { x: 96, y: 48 }, size: { width: 80, height: 32 } }),
      ],
    });

    const result = run(root);
    const gridHints = ofCategory(result, 'grid');
    const wrapHint = gridHints.find((hint) => hint.message.includes('Wrapping auto-layout'));
    expect(wrapHint).toBeDefined();
    expect(wrapHint?.utilityClass).toContain('grid-cols-2');
    expect(wrapHint?.utilityClass).toContain('gap-4');
  });

  it('fixture 2：自由排版 2×2 等尺寸矩阵 → grid-cols-2 + gap-x/gap-y', () => {
    const root = makeNode({
      name: 'Free Matrix',
      // 无 layout 字段：模拟 Figma 自由排版
      children: [
        makeNode({ name: 'Cell A', position: { x: 0, y: 0 }, size: { width: 200, height: 120 } }),
        makeNode({ name: 'Cell B', position: { x: 224, y: 0 }, size: { width: 200, height: 120 } }),
        makeNode({ name: 'Cell C', position: { x: 0, y: 144 }, size: { width: 200, height: 120 } }),
        makeNode({ name: 'Cell D', position: { x: 224, y: 144 }, size: { width: 200, height: 120 } }),
      ],
    });

    const result = run(root);
    const matrixHint = ofCategory(result, 'grid').find((hint) => hint.message.includes('matrix'));
    expect(matrixHint).toBeDefined();
    expect(matrixHint?.utilityClass).toContain('grid-cols-2');
    expect(matrixHint?.utilityClass).toContain('gap-x-6');
    expect(matrixHint?.utilityClass).toContain('gap-y-6');
  });

  it('fixture 3：sticky/fixed/absolute 语义命名与 ABSOLUTE 定位 → 参照物建议', () => {
    const parent = makeNode({
      name: 'Hero Banner',
      children: [
        makeNode({ name: 'Sticky Nav Bar', position: { x: 0, y: 0 }, size: { width: 1440, height: 64 } }),
        makeNode({ name: 'Floating Action Button', position: { x: 1360, y: 600 }, size: { width: 48, height: 48 } }),
        makeNode({
          name: 'Discount Badge',
          position: { x: 120, y: 120 },
          size: { width: 40, height: 40 },
          layoutPositioning: 'ABSOLUTE',
        }),
      ],
    });

    const result = run(parent);
    const sticky = result.suggestions.find((s) => s.nodeName === 'Sticky Nav Bar');
    const fixed = result.suggestions.find((s) => s.nodeName === 'Floating Action Button');
    const absolute = result.suggestions.find((s) => s.nodeName === 'Discount Badge');
    expect(sticky?.utilityClass).toBe('sticky top-0 z-50');
    expect(fixed?.utilityClass).toBe('fixed z-50');
    expect(absolute?.message).toContain('"Hero Banner"');
    expect(absolute?.utilityClass).toBe('absolute');
  });
});

describe('smart-inferrer: icons 图标识别', () => {
  it('fixture 1：24×24 arrow-right → Lucide ArrowRight（React/Vue 分包建议）', () => {
    const icon = makeNode({ name: 'Arrow Right', size: { width: 24, height: 24 } });

    const reactResult = run(icon);
    const reactHint = ofCategory(reactResult, 'icon')[0];
    expect(reactHint).toBeDefined();
    expect(reactHint?.message).toContain('Lucide "ArrowRight"');
    expect(reactHint?.codeHint).toContain("lucide-react");
    expect(reactHint?.codeHint).toContain('className="w-6 h-6"');

    const vueResult = run(icon, undefined, 'vue');
    const vueHint = ofCategory(vueResult, 'icon')[0];
    expect(vueHint?.codeHint).toContain('lucide-vue-next');
    expect(vueHint?.codeHint).toContain('class="w-6 h-6"');
  });

  it('fixture 2：中文命名「关闭」+ 20×20 → Lucide X；含文本后代的小节点不识别', () => {
    const closeIcon = makeNode({ name: '关闭按钮图标', size: { width: 20, height: 20 } });
    const closeResult = run(closeIcon);
    expect(ofCategory(closeResult, 'icon')[0]?.message).toContain('Lucide "X"');

    // 徽标（小容器内含 TEXT）不是纯图标
    const badge = makeNode({
      name: 'New Badge',
      size: { width: 40, height: 20 },
      children: [
        makeNode({
          name: 'badge-text',
          originalType: 'TEXT',
          role: 'text',
          size: { width: 30, height: 14 },
          textContent: 'NEW',
        }),
      ],
    });
    expect(ofCategory(run(badge), 'icon')).toHaveLength(0);
  });

  it('fixture 3：小型 VECTOR 无语义命名 → Iconify/内联 SVG 通用建议；>48px 不识别', () => {
    const vector = makeNode({
      name: 'custom-decoration',
      originalType: 'VECTOR',
      size: { width: 16, height: 16 },
    });
    const vectorHint = ofCategory(run(vector), 'icon')[0];
    expect(vectorHint?.message).toContain('Iconify');
    expect(vectorHint?.codeHint).toContain('aria-hidden="true"');

    const bigShape = makeNode({ name: 'Search Illustration', size: { width: 120, height: 120 } });
    expect(ofCategory(run(bigShape), 'icon')).toHaveLength(0);
  });
});

describe('smart-inferrer: dark-mode 深色模式', () => {
  it('fixture 1：dark/light 语义命名 → dark: 前缀策略', () => {
    const darkCard = makeNode({ name: 'Dark Mode Card' });
    const darkHint = ofCategory(run(darkCard), 'dark-mode')[0];
    expect(darkHint?.message).toContain('Dark-variant naming');
    expect(darkHint?.utilityClass).toBe('dark:');

    const lightCard = makeNode({ name: 'Light theme surface' });
    expect(ofCategory(run(lightCard), 'dark-mode')[0]?.message).toContain('Light-variant naming');
  });

  it('fixture 2：近黑实色 + 表面命名 → 深色表面提示；无表面命名不提示', () => {
    const darkSurface = makeNode({
      name: 'Card Background',
      fills: [{ type: 'solid', color: { r: 0.04, g: 0.05, b: 0.06, a: 1 } }],
    });
    const surfaceHint = ofCategory(run(darkSurface), 'dark-mode')[0];
    expect(surfaceHint?.message).toContain('Near-black solid surface');
    expect(surfaceHint?.utilityClass).toBe('dark:bg-neutral-900');

    // 黑色但命名与表面无关（如描边/图标），避免误报
    const blackIcon = makeNode({
      name: 'Logo Mark',
      fills: [{ type: 'solid', color: { r: 0, g: 0, b: 0, a: 1 } }],
    });
    expect(ofCategory(run(blackIcon), 'dark-mode')).toHaveLength(0);
  });
});

describe('smart-inferrer: motion 交互动效', () => {
  it('fixture 1：hover/pressed 状态层 → transition + 变体类建议', () => {
    const hover = makeNode({ name: 'Primary Button Hover' });
    const hoverHint = ofCategory(run(hover), 'motion')[0];
    expect(hoverHint?.utilityClass).toContain('transition-colors');
    expect(hoverHint?.utilityClass).toContain('hover:');

    const pressed = makeNode({ name: 'Primary Button Pressed State' });
    const pressedHint = ofCategory(run(pressed), 'motion')[0];
    expect(pressedHint?.utilityClass).toContain('active:');
    expect(pressedHint?.utilityClass).toContain('duration-150');
  });

  it('fixture 2：spinner/通用 animate 语义 → animate-spin / transition 建议', () => {
    const spinner = makeNode({ name: 'Loading Spinner', size: { width: 24, height: 24 } });
    expect(ofCategory(run(spinner), 'motion')[0]?.utilityClass).toBe('animate-spin');

    const banner = makeNode({ name: 'Carousel animation layer' });
    const bannerHint = ofCategory(run(banner), 'motion')[0];
    expect(bannerHint?.utilityClass).toContain('transition duration-200');
  });
});

describe('smart-inferrer: 开关与留痕', () => {
  it('单项关闭：icons=false 仅静默图标，其余类别照常', () => {
    const root = makeNode({
      name: 'Dark Card',
      children: [
        makeNode({ name: 'Arrow Right', size: { width: 24, height: 24 } }),
        makeNode({ name: 'Loading Spinner', size: { width: 24, height: 24 } }),
      ],
    });
    const result = run(root, { icons: false });
    expect(result.enabled.icons).toBe(false);
    expect(ofCategory(result, 'icon')).toHaveLength(0);
    expect(ofCategory(result, 'dark-mode').length).toBeGreaterThan(0);
    expect(ofCategory(result, 'motion').length).toBeGreaterThan(0);
  });

  it('全部关闭：建议为空、enabled 全 false、注释零痕迹（TR-21.1）', () => {
    const root = makeNode({
      name: 'Dark Mode Panel',
      children: [
        makeNode({
          name: 'Free Matrix',
          children: [
            makeNode({ name: 'A', position: { x: 0, y: 0 }, size: { width: 100, height: 100 } }),
            makeNode({ name: 'B', position: { x: 116, y: 0 }, size: { width: 100, height: 100 } }),
            makeNode({ name: 'C', position: { x: 0, y: 116 }, size: { width: 100, height: 100 } }),
            makeNode({ name: 'D', position: { x: 116, y: 116 }, size: { width: 100, height: 100 } }),
          ],
        }),
        makeNode({ name: 'Arrow Right', size: { width: 24, height: 24 } }),
        makeNode({ name: 'Button Hover' }),
      ],
    });
    const result = run(root, { grid: false, icons: false, darkMode: false, motion: false });
    expect(result.suggestions).toHaveLength(0);
    expect(result.enabled).toEqual({ grid: false, icons: false, darkMode: false, motion: false });
    expect(formatSmartInferenceComments(result)).toEqual([]);
  });

  it('缺省开关四项全开且计数自洽', () => {
    const root = makeNode({ name: 'Sticky Header' });
    const result = run(root);
    expect(result.enabled).toEqual({ grid: true, icons: true, darkMode: true, motion: true });
    const total = Object.values(result.counts).reduce((sum, value) => sum + value, 0);
    expect(total).toBe(result.suggestions.length);
  });
});

describe('formatSmartInferenceComments', () => {
  it('无建议返回空数组；有建议输出带版本头与类别前缀的注释行', () => {
    const empty = run(makeNode({ name: 'Plain Frame' }), {
      grid: false,
      icons: false,
      darkMode: false,
      motion: false,
    });
    expect(formatSmartInferenceComments(empty)).toEqual([]);

    const hinted = run(makeNode({ name: 'Sticky Header' }));
    const lines = formatSmartInferenceComments(hinted);
    expect(lines[0]).toContain('Smart inference hints (v1.4.19');
    expect(lines.some((line) => line.includes('[grid]') && line.includes('sticky top-0 z-50'))).toBe(true);
  });
});
