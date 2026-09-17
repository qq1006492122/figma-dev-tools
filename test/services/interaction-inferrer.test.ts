/**
 * v1.4.19 T22 交互推断器测试（TR-22.1：五类交互 + 表单校验各 ≥1 fixture）
 *
 * 覆盖：
 * - form-submit / form-validation（email + password 校验骨架，无识别字段时不报校验）；
 * - dialog-toggle（modal open/close 联动，沿用既有覆盖层索引）；
 * - carousel-swipe（索引 state、dots/arrows 提示、track 内多屏计数）；
 * - tabs-switch（既有类型回归）；
 * - accordion-toggle（openItems state、子部件 item 不重复推断）；
 * - 普通 button-click 回归。
 */
import { describe, expect, it } from 'vitest';

import { createInteractionInferrer } from '../../src/services/interaction-inferrer.js';
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
    figmaId: partial.figmaId ?? `30:${idSeq}`,
    originalType: 'FRAME',
    role: 'container',
    visible: true,
    clipsContent: false,
    size: { width: 120, height: 40 },
    children: [],
    ...partial,
  };
}

/**
 * 便捷：取某类型的全部推断交互
 *
 * @param root - 根节点
 * @param type - 交互类型
 * @returns 匹配的交互
 */
function inferOfType(root: ProcessedNode, type: string) {
  return createInteractionInferrer()
    .infer(root)
    .interactions.filter((interaction) => interaction.type === type);
}

describe('interaction-inferrer: form 提交 + 校验占位（T22）', () => {
  it('fixture：Login Form 含 Email/Password 输入 → form-submit 且追加 form-validation 骨架', () => {
    const root = makeNode({
      name: 'Login Form',
      children: [
        makeNode({ name: 'Email Input', role: 'input', originalType: 'INSTANCE' }),
        makeNode({ name: 'Password Input', role: 'input', originalType: 'INSTANCE' }),
        makeNode({ name: 'Submit Button', role: 'button', originalType: 'COMPONENT' }),
      ],
    });

    const result = createInteractionInferrer().infer(root);
    expect(result.interactions.some((i) => i.type === 'form-submit')).toBe(true);
    const validation = result.interactions.find((i) => i.type === 'form-validation');
    expect(validation).toBeDefined();
    expect(validation?.handlerName).toBe('validateLoginForm');
    expect(validation?.codeHint).toContain('validateLoginForm');
    // 校验骨架包含 email 格式与 password 长度占位规则
    const skeleton = result.handlerSkeletons.find((s) => s.includes('validateLoginForm')) ?? '';
    expect(skeleton).toContain('invalid email');
    expect(skeleton).toContain('min 8 chars');
    expect(skeleton).toContain('loginFormData');
  });

  it('fixture：无识别字段的表单不输出校验占位（防噪声）', () => {
    const root = makeNode({
      name: 'Simple Form',
      children: [makeNode({ name: 'Submit Button', role: 'button', originalType: 'COMPONENT' })],
    });

    const result = createInteractionInferrer().infer(root);
    expect(result.interactions.some((i) => i.type === 'form-submit')).toBe(true);
    expect(result.interactions.some((i) => i.type === 'form-validation')).toBe(false);
    expect(result.handlerSkeletons.some((s) => s.includes('validate'))).toBe(false);
  });

  it('fixture：中文手机输入框 → phone 正则占位', () => {
    const root = makeNode({
      name: '注册表单',
      children: [makeNode({ name: '手机号输入框', role: 'input', originalType: 'INSTANCE' })],
    });

    const result = createInteractionInferrer().infer(root);
    const validation = result.interactions.find((i) => i.type === 'form-validation');
    expect(validation).toBeDefined();
    const skeleton = result.handlerSkeletons.find((s) => s.includes('phone')) ?? '';
    expect(skeleton).toContain('invalid phone');
  });
});

describe('interaction-inferrer: modal open/close（既有能力回归）', () => {
  it('fixture：Open Dialog 按钮 + Modal Dialog 覆盖层 + Close 按钮 → dialog-toggle', () => {
    const root = makeNode({
      name: 'Page',
      children: [
        makeNode({ name: 'Open Dialog Button', role: 'button', originalType: 'COMPONENT' }),
        makeNode({
          name: 'Modal Dialog',
          children: [
            makeNode({ name: 'Content Area' }),
            makeNode({ name: 'Close Button', role: 'button', originalType: 'COMPONENT' }),
          ],
        }),
      ],
    });

    const toggles = inferOfType(root, 'dialog-toggle');
    expect(toggles.length).toBeGreaterThanOrEqual(1);
    // open 按钮应与 dialog 节点联动（relatedNodeId 指向 Modal Dialog）
    const dialogNode = root.children?.find((child) => child.name === 'Modal Dialog');
    expect(toggles.some((t) => t.relatedNodeId === dialogNode?.id)).toBe(true);
  });
});

describe('interaction-inferrer: carousel 轮播（T22）', () => {
  it('fixture：Image Carousel 含 track（3 slides）+ Dots + 箭头 → carouselIndex state 且提示联动', () => {
    const root = makeNode({
      name: 'Image Carousel',
      children: [
        makeNode({
          name: 'Slide Track',
          children: [
            makeNode({ name: 'Slide 1' }),
            makeNode({ name: 'Slide 2' }),
            makeNode({ name: 'Slide 3' }),
          ],
        }),
        makeNode({ name: 'Dots Indicator' }),
        makeNode({ name: 'Arrow Left', role: 'icon', originalType: 'VECTOR' }),
        makeNode({ name: 'Arrow Right', role: 'icon', originalType: 'VECTOR' }),
      ],
    });

    const result = createInteractionInferrer().infer(root);
    const carousels = result.interactions.filter((i) => i.type === 'carousel-swipe');
    expect(carousels).toHaveLength(1);
    expect(carousels[0]?.stateName).toBe('imageCarouselIndex');
    expect(result.stateDeclarations.some((s) => s.includes('imageCarouselIndex'))).toBe(true);
    expect(carousels[0]?.codeHint).toContain('3 屏');
    expect(carousels[0]?.codeHint).toContain('Swiper');
    expect(carousels[0]?.codeHint).toContain('指示点');
    expect(carousels[0]?.codeHint).toContain('上一张/下一张');
    // Slide 子节点不得被识别为独立轮播（slider 词边界不匹配 slide）
    expect(result.interactions.filter((i) => i.type === 'carousel-swipe')).toHaveLength(1);
  });
});

describe('interaction-inferrer: tabs 标签页（既有类型回归）', () => {
  it('fixture：Tabs 容器 3 标签 → tabs-switch 且声明 state', () => {
    const root = makeNode({
      name: 'Tabs',
      children: [makeNode({ name: 'Tab 1' }), makeNode({ name: 'Tab 2' }), makeNode({ name: 'Tab 3' })],
    });

    const tabs = inferOfType(root, 'tabs-switch');
    expect(tabs).toHaveLength(1);
    expect(createInteractionInferrer().infer(root).stateDeclarations.length).toBeGreaterThan(0);
  });
});

describe('interaction-inferrer: accordion 手风琴（T22）', () => {
  it('fixture：FAQ Accordion 3 子项（命名含 item/header）→ 仅 1 条 accordion-toggle + openItems', () => {
    const root = makeNode({
      name: 'FAQ Accordion',
      children: [
        makeNode({
          name: 'Accordion Item 1',
          children: [makeNode({ name: 'Item Header' }), makeNode({ name: 'Item Content' })],
        }),
        makeNode({
          name: 'Accordion Item 2',
          children: [makeNode({ name: 'Item Header' }), makeNode({ name: 'Item Content' })],
        }),
        makeNode({
          name: 'Accordion Item 3',
          children: [makeNode({ name: 'Item Header' }), makeNode({ name: 'Item Content' })],
        }),
      ],
    });

    const result = createInteractionInferrer().infer(root);
    const accordions = result.interactions.filter((i) => i.type === 'accordion-toggle');
    expect(accordions).toHaveLength(1);
    expect(accordions[0]?.stateName).toBe('faqAccordionOpenItems');
    expect(accordions[0]?.codeHint).toContain('3 项');
    expect(accordions[0]?.codeHint).toContain('aria-expanded');
    expect(result.stateDeclarations.some((s) => s.includes('faqAccordionOpenItems'))).toBe(true);
  });

  it('fixture：中文折叠面板同样识别，折叠条目本身不触发', () => {
    const root = makeNode({
      name: '折叠面板',
      children: [
        makeNode({ name: '折叠条目 1', children: [makeNode({ name: '内容' })] }),
        makeNode({ name: '折叠条目 2', children: [makeNode({ name: '内容' })] }),
      ],
    });

    const accordions = inferOfType(root, 'accordion-toggle');
    expect(accordions).toHaveLength(1);
  });
});

describe('interaction-inferrer: 普通按钮回归', () => {
  it('fixture：无语义命名的 CTA 按钮 → button-click 且不产生多余 state', () => {
    const root = makeNode({
      name: 'Hero',
      children: [makeNode({ name: 'Get Started', role: 'button', originalType: 'COMPONENT' })],
    });

    const result = createInteractionInferrer().infer(root);
    expect(result.interactions.some((i) => i.type === 'button-click')).toBe(true);
    expect(result.interactions.some((i) => i.type === 'form-submit')).toBe(false);
    expect(result.stateDeclarations).toHaveLength(0);
  });
});
