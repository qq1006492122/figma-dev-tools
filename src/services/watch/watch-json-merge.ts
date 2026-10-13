/**
 * *.figma.json 旁路合并（WBS-P1-24）
 *
 * JSON 文件无法放注释标记，用户自定义字段以旁路 `<name>.figma.json` 保存，
 * 形如 `{ "/json/pointer": value }`。生成器写盘时把这些指针合并回生成 JSON：
 *  - 仅按指针赋值（缺失父路径自动创建）；
 *  - 数组**整体替换**，不做元素级深合并（决策 5）；
 *  - 生成 JSON 或旁路 JSON 解析失败一律 fail-open：不产出合并结果/空覆盖集，
 *    由写盘层保留旧文件并报告，绝不静默覆盖。
 *
 * @module
 */

export interface FigmaOverride {
  /** RFC 6901 风格 JSON Pointer（至少一级，空指针=根替换，拒绝） */
  pointer: string;
  value: unknown;
}

export interface OverrideLoadResult {
  ok: boolean;
  overrides: FigmaOverride[];
  warnings: string[];
}

/** 解析旁路文件文本（非法 JSON fail-open 为空覆盖集） */
export function loadFigmaOverrides(text: string): OverrideLoadResult {
  const warnings: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, overrides: [], warnings: ['figma.json 旁路文件不是合法 JSON，已忽略全部用户覆盖（fail-open）'] };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, overrides: [], warnings: ['figma.json 旁路必须是 { "/pointer": value } 对象，已忽略'] };
  }
  const overrides: FigmaOverride[] = Object.entries(parsed as Record<string, unknown>).map(([pointer, value]) => ({
    pointer,
    value,
  }));
  return { ok: true, overrides, warnings };
}

export interface MergeResult {
  ok: boolean;
  /** 合并后 JSON 文本；失败为 null（调用方保留旧文件） */
  json: string | null;
  applied: string[];
  warnings: string[];
}

/** 解码 pointer token（~1→/，~0→~） */
function decodeToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

/**
 * 把覆盖项合并进生成 JSON 文本。
 */
export function applyJsonOverrides(generatedJson: string, overrides: FigmaOverride[]): MergeResult {
  const warnings: string[] = [];
  const applied: string[] = [];

  let root: unknown;
  try {
    root = JSON.parse(generatedJson);
  } catch {
    return {
      ok: false,
      json: null,
      applied: [],
      warnings: ['生成内容不是合法 JSON，跳过旁路合并以保留旧文件（fail-open）'],
    };
  }
  if (typeof root !== 'object' || root === null) {
    root = {};
  }
  let target: Record<string, unknown> = root as Record<string, unknown>;

  for (const ov of overrides) {
    if (!ov.pointer.startsWith('/')) {
      warnings.push(`忽略非法 JSON Pointer（根替换不允许）：${JSON.stringify(ov.pointer)}`);
      continue;
    }
    const tokens = ov.pointer.slice(1).split('/').map(decodeToken);
    if (tokens.some((token) => token === '__proto__' || token === 'constructor' || token === 'prototype')) {
      warnings.push('忽略危险 JSON Pointer（禁止原型污染）：' + JSON.stringify(ov.pointer));
      continue;
    }
    // 逐级导航/创建中间对象；末端直接赋值（数组也整体替换）
    let cur: Record<string, unknown> = target;
    for (let i = 0; i < tokens.length - 1; i++) {
      const key = tokens[i]!;
      const next = cur[key];
      if (typeof next !== 'object' || next === null || Array.isArray(next)) {
        cur[key] = {};
      }
      cur = cur[key] as Record<string, unknown>;
    }
    cur[tokens[tokens.length - 1]!] = ov.value;
    applied.push(ov.pointer);
  }

  return { ok: true, json: JSON.stringify(target, null, 2), applied, warnings };
}
