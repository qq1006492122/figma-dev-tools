/**
 * 小程序事件映射测试（WBS-P0-52）
 *
 * 验收：bind/catch/input/change/submit 每事件至少 1 例；
 * 基础库能力矩阵决定 aria 属性去留。纯函数零 I/O。
 */
import { describe, it, expect } from 'vitest';

import {
  eventsForNode,
  resolveHandlerNames,
  ariaAttrAllowed,
  collectJsMethods,
  type EventContext,
} from '../../../src/services/weapp-compat/weapp-events.js';

function ctx(partial: Partial<EventContext>): EventContext {
  return {
    id: partial.id ?? 'n1',
    name: partial.name ?? 'Button',
    tag: partial.tag ?? 'button',
    role: partial.role,
    isButton: partial.isButton,
    nameSignals: partial.nameSignals ?? [],
  };
}

describe('P0-52 组件 → 事件映射', () => {
  it('button / role=button / a11y.isButton → bindtap(handleTap)', () => {
    expect(eventsForNode(ctx({ tag: 'button' })).map((e) => e.bindAttr)).toContain('bindtap');
    expect(eventsForNode(ctx({ tag: 'view', role: 'button' })).map((e) => e.attr)).toContain('bindtap');
    expect(eventsForNode(ctx({ tag: 'view', isButton: true }))[0]!.handler).toBe('handleTap');
  });

  it('input → bindinput；textarea → bindinput + bindconfirm', () => {
    expect(eventsForNode(ctx({ tag: 'input', name: 'Name Input' })).map((e) => e.attr)).toContain('bindinput');
    const ta = eventsForNode(ctx({ tag: 'textarea', name: 'Remark Textarea' })).map((e) => e.attr);
    expect(ta).toContain('bindinput');
    expect(ta).toContain('bindconfirm');
  });

  it('picker → bindchange；swiper → bindchange；form → bindsubmit；scroll-view → bindscroll', () => {
    expect(eventsForNode(ctx({ tag: 'picker' }))[0]).toMatchObject({ attr: 'bindchange', event: 'change' });
    expect(eventsForNode(ctx({ tag: 'swiper' }))[0]).toMatchObject({ attr: 'bindchange', event: 'change' });
    expect(eventsForNode(ctx({ tag: 'form' }))[0]).toMatchObject({ attr: 'bindsubmit', event: 'submit' });
    expect(eventsForNode(ctx({ tag: 'scroll-view' })).map((e) => e.attr)).toContain('bindscroll');
  });

  it('catch：名称含 mask/overlay/backdrop 的可点击层 → catchtap（阻止冒泡），普通按钮用 bindtap', () => {
    const mask = eventsForNode(ctx({ tag: 'view', name: 'Modal Mask', isButton: true, nameSignals: ['mask'] }));
    expect(mask[0]!.attr).toBe('catchtap');
    expect(mask[0]!.bindKind).toBe('catch');
    const btn = eventsForNode(ctx({ tag: 'view', name: 'Confirm Button', isButton: true }));
    expect(btn[0]!.attr).toBe('bindtap');
  });

  it('无交互语义的普通 view/text 不产生任何事件', () => {
    expect(eventsForNode(ctx({ tag: 'view', name: 'Card' }))).toHaveLength(0);
    expect(eventsForNode(ctx({ tag: 'text', name: 'Title' }))).toHaveLength(0);
  });

  it('handler 名按节点语义生成且全局唯一去重', () => {
    const used = new Set<string>();
    const a = resolveHandlerNames('City Picker', 'change', used);
    const b = resolveHandlerNames('City Picker', 'change', used); // 同名第二个
    expect(a).toBe('onCityPickerChange');
    expect(b).toBe('onCityPickerChange2');
    // 无名称时回退到事件默认名
    expect(resolveHandlerNames('', 'tap', new Set())).toBe('handleTap');
  });
});

describe('P0-52 基础库能力矩阵 → aria 去留', () => {
  it('view/button/text/image 保留 aria-label（冻结基线 3.1.5 支持）', () => {
    for (const tag of ['view', 'button', 'text', 'image']) {
      expect(ariaAttrAllowed(tag, 'aria-label')).toBe(true);
    }
  });

  it('rich-text 内容由 nodes 渲染，宿主不接收 aria-label；自定义组件标签不放 role', () => {
    expect(ariaAttrAllowed('rich-text', 'aria-label')).toBe(false);
    expect(ariaAttrAllowed('custom-card', 'role')).toBe(false);
    expect(ariaAttrAllowed('view', 'role')).toBe(true);
  });

  it('非 aria 属性不受该矩阵约束（一律 true）', () => {
    expect(ariaAttrAllowed('rich-text', 'class')).toBe(true);
    expect(ariaAttrAllowed('picker', 'bindchange')).toBe(true);
  });
});

describe('P0-52 JS methods/properties/triggerEvent 汇总', () => {
  it('收集所有 handler 并生成方法骨架；triggerEvent 仅用于自定义组件', () => {
    const report = collectJsMethods(
      [
        { tag: 'button', handler: 'handleTap', event: 'tap', detailHint: '' },
        { tag: 'input', handler: 'onNameInput', event: 'input', detailHint: 'e.detail.value' },
        { tag: 'picker', handler: 'onCityPickerChange', event: 'change', detailHint: 'e.detail.value' },
      ],
      { isCustomComponent: false },
    );
    expect(report.handlerNames.sort()).toEqual(['handleTap', 'onCityPickerChange', 'onNameInput'].sort());
    const code = report.methodsCode;
    expect(code).toContain('handleTap(e)');
    expect(code).toContain('onNameInput(e)');
    expect(code).toContain('e.detail.value');
    expect(code).not.toContain('triggerEvent'); // Page 不触发自定义事件
  });

  it('自定义组件（isCustomComponent=true）：交互 handler 内用 this.triggerEvent', () => {
    const report = collectJsMethods(
      [{ tag: 'button', handler: 'handleTap', event: 'tap', detailHint: '' }],
      { isCustomComponent: true },
    );
    expect(report.methodsCode).toContain("this.triggerEvent('tap'");
  });

  it('form submit handler 提示 e.detail.value 表单数据', () => {
    const report = collectJsMethods(
      [{ tag: 'form', handler: 'onSearchSubmit', event: 'submit', detailHint: 'e.detail.value' }],
      { isCustomComponent: false },
    );
    expect(report.methodsCode).toContain('onSearchSubmit(e)');
    expect(report.methodsCode).toContain('e.detail.value');
  });
});
