/**
 * 小程序原生组件映射测试（WBS-P0-51）
 *
 * 验收：scroll-view/swiper/rich-text/picker 等每组件快照；错误嵌套与无效属性不输出。
 * 纯函数、零 I/O；匹配/白名单/嵌套规则事实来自微信官方组件文档（每条记录带来源 URL）。
 */
import { describe, it, expect } from 'vitest';

import {
  matchNativeComponent,
  sanitizeNativeAttrs,
  validateNativeNesting,
  getNativeComponent,
  NATIVE_COMPONENT_TAGS,
  type NativeMatchInput,
} from '../../../src/services/weapp-compat/native-components.js';

function node(partial: Partial<NativeMatchInput> & Pick<NativeMatchInput, 'name'>): NativeMatchInput {
  return {
    id: partial.id ?? 'n1',
    name: partial.name,
    originalType: partial.originalType ?? 'FRAME',
    role: partial.role ?? 'container',
    clipsContent: partial.clipsContent ?? false,
    children: partial.children ?? [],
  };
}

describe('P0-51 注册表完整性', () => {
  it('覆盖 scroll-view / swiper / swiper-item / picker / rich-text，且每条有官方来源', () => {
    for (const tag of ['scroll-view', 'swiper', 'swiper-item', 'picker', 'rich-text']) {
      const c = getNativeComponent(tag);
      expect(c).toBeTruthy();
      expect(c!.docsUrl).toContain('developers.weixin.qq.com');
      expect(c!.allowedAttrs.length).toBeGreaterThan(0);
    }
    expect(NATIVE_COMPONENT_TAGS).toContain('scroll-view');
    expect(NATIVE_COMPONENT_TAGS.length).toBeGreaterThanOrEqual(5);
  });
});

describe('P0-51 名称信号匹配', () => {
  it('Scroll View / 名称含 scroll 且裁剪溢出 → scroll-view', () => {
    expect(matchNativeComponent(node({ name: 'Scroll View', clipsContent: true }))?.tag).toBe('scroll-view');
    expect(matchNativeComponent(node({ name: 'HorizontalScroll', clipsContent: true }))?.tag).toBe('scroll-view');
  });

  it('Swiper / Carousel / Slider Banner → swiper', () => {
    expect(matchNativeComponent(node({ name: 'Banner Swiper' }))?.tag).toBe('swiper');
    expect(matchNativeComponent(node({ name: 'Image Carousel' }))?.tag).toBe('swiper');
  });

  it('Picker / Select / Dropdown → picker', () => {
    expect(matchNativeComponent(node({ name: 'City Picker' }))?.tag).toBe('picker');
    expect(matchNativeComponent(node({ name: 'Status Select' }))?.tag).toBe('picker');
    expect(matchNativeComponent(node({ name: 'Dropdown Menu' }))?.tag).toBe('picker');
  });

  it('Rich Text / HTML Content → rich-text', () => {
    expect(matchNativeComponent(node({ name: 'Article Rich Text' }))?.tag).toBe('rich-text');
    expect(matchNativeComponent(node({ name: 'HTML Content' }))?.tag).toBe('rich-text');
  });

  it('普通 Frame / 卡片 / 列表容器不匹配（防误判）', () => {
    expect(matchNativeComponent(node({ name: 'Card List' }))).toBeNull();
    expect(matchNativeComponent(node({ name: 'Header' }))).toBeNull();
    // 仅含 "scroll" 子串但语义不符的单词不误伤：'scrolled-list' 仍含 scroll，故按关键词匹配是预期；
    // 但 'list' 单独绝不能命中
    expect(matchNativeComponent(node({ name: 'List' }))).toBeNull();
  });
});

describe('P0-51 属性白名单（无效属性不输出）', () => {
  it('scroll-view 白名单属性保留，非法属性剔除并给可追溯 warning', () => {
    const r = sanitizeNativeAttrs('scroll-view', {
      'scroll-y': 'true',
      'scroll-with-animation': 'true',
      'onclick': 'x',
      'data-id': 'keep', // data-* 全局允许
      'innerHTML': 'y',
    });
    const keys = r.attrs.map((a) => a.name);
    expect(keys).toContain('scroll-y');
    expect(keys).toContain('scroll-with-animation');
    expect(keys).toContain('data-id');
    expect(keys).not.toContain('onclick');
    expect(keys).not.toContain('innerHTML');
    expect(r.dropped.map((d) => d.name).sort()).toEqual(['innerHTML', 'onclick']);
    expect(r.dropped[0]!.code).toBe('FDT-NATIVE-ATTR-NOT-ALLOWED');
  });

  it('swiper 非法布尔值（indicator-dots=maybe）剔除', () => {
    const r = sanitizeNativeAttrs('swiper', {
      'indicator-dots': 'maybe',
      autoplay: 'true',
      interval: '3000',
    });
    expect(r.attrs.map((a) => a.name)).toEqual(['autoplay', 'interval']);
    expect(r.dropped[0]!.name).toBe('indicator-dots');
  });

  it('picker mode 仅允许官方枚举，非法值剔除', () => {
    const ok = sanitizeNativeAttrs('picker', { mode: 'selector' });
    expect(ok.attrs.map((a) => a.name)).toEqual(['mode']);
    const bad = sanitizeNativeAttrs('picker', { mode: 'fancy' });
    expect(bad.attrs).toHaveLength(0);
    expect(bad.dropped[0]!.code).toBe('FDT-NATIVE-ATTR-BAD-VALUE');
  });

  it('非原生组件不做白名单处理（返回原属性）', () => {
    const r = sanitizeNativeAttrs('view', { class: 'x', anything: '1' });
    expect(r.attrs.map((a) => a.name)).toEqual(['class', 'anything']);
    expect(r.dropped).toHaveLength(0);
  });
});

describe('P0-51 嵌套校验（错误嵌套不输出）', () => {
  it('swiper 的直接子节点必须是 swiper-item，否则报错', () => {
    expect(validateNativeNesting('swiper', 'swiper-item')).toHaveLength(0);
    const errs = validateNativeNesting('swiper', 'view');
    expect(errs[0]!.code).toBe('FDT-NATIVE-NESTING-SWIPER-CHILD');
  });

  it('rich-text 不允许任何子节点（内容只能走 nodes）', () => {
    expect(validateNativeNesting('rich-text', 'text')[0]!.code).toBe('FDT-NATIVE-NESTING-RICH-TEXT-LEAF');
    expect(validateNativeNesting('rich-text', 'view')[0]!.code).toBe('FDT-NATIVE-NESTING-RICH-TEXT-LEAF');
  });

  it('scroll-view 允许普通子节点；但同方向嵌套 scroll-view 警告', () => {
    expect(validateNativeNesting('scroll-view', 'view')).toHaveLength(0);
    expect(validateNativeNesting('scroll-view', 'button')).toHaveLength(0);
    // 同方向嵌套（默认无法确定方向，交给生成器按属性判）；纯函数提供显式 API
    expect(
      validateNativeNesting('scroll-view', 'scroll-view', {
        parentAttrs: { 'scroll-y': 'true' },
        childAttrs: { 'scroll-y': 'true' },
      })[0]!.code,
    ).toBe('FDT-NATIVE-NESTING-SCROLL-SAME-AXIS');
  });

  it('非原生父级一律放行', () => {
    expect(validateNativeNesting('view', 'scroll-view')).toHaveLength(0);
    expect(validateNativeNesting(null, 'swiper')).toHaveLength(0);
  });
});
