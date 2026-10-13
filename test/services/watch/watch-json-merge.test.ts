/**
 * WBS-P1-24 *.figma.json 旁路合并测试
 *
 * 口径：旁路文件按 JSON Pointer 记录用户字段；数组整体替换（不做元素级深合并）；
 * 解析失败 fail-open（保留生成/旧 JSON，报告冲突）。
 */
import { describe, it, expect } from 'vitest';
import { applyJsonOverrides, loadFigmaOverrides, type FigmaOverride } from '../../../src/services/watch/watch-json-merge.js';

describe('WBS-P1-24 JSON Pointer 旁路合并', () => {
  it('按指针覆盖对象字段（生成区其余字段不动）', () => {
    const generated = JSON.stringify({
      navigationBarTitleText: '生成标题',
      usingComponents: { a: '/a' },
      window: { background: '#fff' },
    });
    const overrides: FigmaOverride[] = [{ pointer: '/navigationBarTitleText', value: '用户标题' }];
    const result = applyJsonOverrides(generated, overrides);
    expect(result.ok).toBe(true);
    const merged = JSON.parse(result.json!);
    expect(merged.navigationBarTitleText).toBe('用户标题');
    expect(merged.usingComponents).toEqual({ a: '/a' });
  });

  it('支持嵌套指针与 ~0/~1 转义（键含 / 与 ~）', () => {
    const generated = JSON.stringify({ a: { 'b/c': 1, '~': 2 } });
    const r1 = applyJsonOverrides(generated, [{ pointer: '/a/b~1c', value: 9 }]);
    expect(JSON.parse(r1.json!).a['b/c']).toBe(9);
    const r2 = applyJsonOverrides(generated, [{ pointer: '/a/~0', value: 3 }]);
    expect(JSON.parse(r2.json!).a['~']).toBe(3);
  });

  it('数组整体替换，不做元素级深合并（避免脆弱合并）', () => {
    const generated = JSON.stringify({ pages: ['a', 'b'], nested: { list: [1, 2, 3] } });
    const result = applyJsonOverrides(generated, [{ pointer: '/pages', value: ['x'] }]);
    expect(JSON.parse(result.json!).pages).toEqual(['x']);
  });

  it('缺失父路径 → 创建中间对象', () => {
    const result = applyJsonOverrides('{}', [{ pointer: '/a/b/c', value: 1 }]);
    expect(JSON.parse(result.json!).a.b.c).toBe(1);
  });

  it('生成 JSON 非法 → fail-open（不产出合并结果，给 warning）', () => {
    const result = applyJsonOverrides('{ not json', [{ pointer: '/a', value: 1 }]);
    expect(result.ok).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.json).toBeNull();
  });

  it('loadFigmaOverrides：旁路 JSON 解析为指针数组；非法/非对象返回空+warning（fail-open）', () => {
    const good = loadFigmaOverrides(JSON.stringify({ '/a': 1, '/b/c': 'x' }));
    expect(good.ok).toBe(true);
    expect(good.overrides).toEqual([
      { pointer: '/a', value: 1 },
      { pointer: '/b/c', value: 'x' },
    ]);

    const bad = loadFigmaOverrides('not json');
    expect(bad.ok).toBe(false);
    expect(bad.overrides).toEqual([]);
  });

  it('非法空指针忽略并报告（根文档整体替换不允许）', () => {
    const result = applyJsonOverrides('{"a":1}', [{ pointer: '', value: null }]);
    expect(result.warnings.length).toBe(1);
    expect(JSON.parse(result.json!)).toEqual({ a: 1 });
  });
});
