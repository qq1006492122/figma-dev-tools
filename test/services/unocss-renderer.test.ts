/**
 * UnoCSS 渲染器测试（v1.4.18，T8 / TR-8.1 基础层）
 *
 * 覆盖：
 * 1. attributify token 分区纯函数（安全属性名 vs 必须保留 class 的 token）；
 * 2. UnocssAttributifyRenderer 对真实 mapper 产物的属性化拆分；
 * 3. uno.config / presetIcons / React TS shim 配置建议（hints）。
 *
 * React/Vue 生成器端到端快照见 unocss-pipeline.test.ts。
 */
import { describe, expect, it } from 'vitest';

import {
  mergeStyleWithExtraTokens,
  partitionAttributifyTokens,
  UNOCSS_ATTRIBUTIFY_SAFE_RE,
  createStyleRenderer,
} from '../../src/services/style-renderers/index.js';
import type { ProcessedNode } from '../../src/types/nodes.js';

/** 构造一个自动布局节点（纵向、居中、13px 非标间距 → 产出 flex/flex-col/items-center 与 gap-[13px]） */
function makeAutoLayoutNode(): ProcessedNode {
  return {
    id: 'node-box',
    figmaId: '20:1',
    name: 'box',
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
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
    children: [],
  };
}

describe('T8 partitionAttributifyTokens：原子类 → 属性化分区', () => {
  it('纯安全 token 全部属性化，class 回退为空', () => {
    const result = partitionAttributifyTokens('flex items-center gap-4 p-4');
    expect(result.attributeNames).toEqual(['flex', 'items-center', 'gap-4', 'p-4']);
    expect(result.fallbackClassName).toBe('');
  });

  it('arbitrary 值 token 保留在 class 且顺序不变', () => {
    const result = partitionAttributifyTokens('flex bg-[#ffffff] gap-[12px] p-4');
    expect(result.attributeNames).toEqual(['flex', 'p-4']);
    expect(result.fallbackClassName).toBe('bg-[#ffffff] gap-[12px]');
  });

  it('变体冒号、负值、斜杠修饰、important 后缀均不可属性化', () => {
    const result = partitionAttributifyTokens('hover:bg-black -ml-2 w-1/2 text-red-500! p-4');
    expect(result.attributeNames).toEqual(['p-4']);
    expect(result.fallbackClassName).toBe('hover:bg-black -ml-2 w-1/2 text-red-500!');
  });

  it('空字符串与多余空白安全处理', () => {
    expect(partitionAttributifyTokens('')).toEqual({ attributeNames: [], fallbackClassName: '' });
    expect(partitionAttributifyTokens('  flex   flex  ')).toEqual({
      attributeNames: ['flex'],
      fallbackClassName: '',
    });
  });

  it('安全正则不接受数字/连字符开头及点号 token', () => {
    expect(UNOCSS_ATTRIBUTIFY_SAFE_RE.test('flex')).toBe(true);
    expect(UNOCSS_ATTRIBUTIFY_SAFE_RE.test('items-center')).toBe(true);
    expect(UNOCSS_ATTRIBUTIFY_SAFE_RE.test('1flex')).toBe(false);
    expect(UNOCSS_ATTRIBUTIFY_SAFE_RE.test('-ml-2')).toBe(false);
    expect(UNOCSS_ATTRIBUTIFY_SAFE_RE.test('h-6.5')).toBe(false);
  });
});

describe('T8 mergeStyleWithExtraTokens：flex 修复类按当前模式合流', () => {
  it('非 attributify 结果（无 attributes 字段）走经典类名合并，保持字符串形态', () => {
    const merged = mergeStyleWithExtraTokens(
      { className: 'flex p-4', warnings: [], extensionsNeeded: [] },
      ['min-h-0'],
    );
    expect(merged.attributes).toBeUndefined();
    expect(merged.className).toBe('flex p-4 min-h-0');
  });

  it('attributify 结果：安全修复 token 入属性并去重，arbitrary 修复入回退 class', () => {
    const merged = mergeStyleWithExtraTokens(
      {
        className: 'gap-[12px]',
        warnings: [],
        extensionsNeeded: [],
        attributes: [
          { name: 'flex', value: '' },
          { name: 'p-4', value: '' },
        ],
      },
      ['flex', 'min-h-0', 'w-[200px]'],
    );
    // 属性集合正确即可（twMerge 不保证输出顺序与输入一致）
    expect([...(merged.attributes?.map((a) => a.name) ?? [])].sort()).toEqual(
      ['flex', 'min-h-0', 'p-4'].sort(),
    );
    // 无重复属性
    const names = merged.attributes?.map((a) => a.name) ?? [];
    expect(new Set(names).size).toBe(names.length);
    expect(merged.className).toBe('gap-[12px] w-[200px]');
  });
});

describe('T8 createStyleRenderer：UnoCSS wind/attributify 实例', () => {
  it('wind 模式（默认）renderNode 不产出 attributes，与 tailwind 渲染器类名一致', () => {
    const node = makeAutoLayoutNode();
    const wind = createStyleRenderer('unocss', { framework: 'react' });
    const result = wind.renderNode(node);
    expect(result.attributes).toBeUndefined();
    expect(result.className).toContain('flex');
    expect(result.className).toContain('gap-[13px]');
  });

  it('attributify 模式 renderNode 将安全类拆为属性、arbitrary 留在 class', () => {
    const node = makeAutoLayoutNode();
    const renderer = createStyleRenderer('unocss', { framework: 'react', unocssMode: 'attributify' });
    const result = renderer.renderNode(node);
    const names = result.attributes?.map((a) => a.name) ?? [];
    expect(names).toContain('flex');
    expect(names).toContain('items-center');
    // 属性值统一空字符串（React 未知布尔属性在不同版本行为不一，空串最稳）
    for (const attr of result.attributes ?? []) {
      expect(attr.value).toBe('');
    }
    expect(result.className).toContain('gap-[13px]');
  });

  it('hints：wind 含 presetWind 与 virtual:uno.css；attributify 追加 presetAttributify', () => {
    const wind = createStyleRenderer('unocss', { framework: 'vue' });
    const attr = createStyleRenderer('unocss', { framework: 'vue', unocssMode: 'attributify' });
    const windText = wind.hints?.map((h) => h.code).join('\n') ?? '';
    const attrText = attr.hints?.map((h) => h.code).join('\n') ?? '';
    expect(windText).toContain('presetWind');
    expect(windText).toContain("virtual:uno.css");
    expect(attrText).toContain('presetAttributify');
  });

  it('hints：attributify 的 React TS shim 仅在 framework=react 出现；图标预设建议始终附带', () => {
    const reactHints = createStyleRenderer('unocss', { framework: 'react', unocssMode: 'attributify' })
      .hints?.map((h) => h.code)
      .join('\n');
    const vueHints = createStyleRenderer('unocss', { framework: 'vue', unocssMode: 'attributify' })
      .hints?.map((h) => h.code)
      .join('\n');
    expect(reactHints).toContain('preset-attributify');
    expect(vueHints ?? '').not.toContain('preset-attributify');
    expect(reactHints).toContain('presetIcons');
    expect(vueHints).toContain('presetIcons');
  });

  it('tailwind 渲染器不提供 UnoCSS hints', () => {
    const tailwind = createStyleRenderer('tailwind', { framework: 'react', unocssMode: 'attributify' });
    expect(tailwind.hints).toEqual([]);
  });
});
