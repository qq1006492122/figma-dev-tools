/**
 * 微信小程序 WXSS 降级器（WBS-P0-41）
 *
 * 纯函数：输入 CSS 声明 + 目标渲染器（默认 skyline），依据 wxss-matrix 的官方
 * 限制备注决定 supported / degraded / unsupported / shorthand / unknown，并产出
 * 可写回 WXSS 的声明与结构化 warning。报告可追溯"原属性→处置→结果"。
 *
 * 规则只允许来自官方矩阵备注，不得在此自创行为限制。
 *
 * @module
 */

import { getWxssEntry, SELECTOR_RESTRICTIONS } from './wxss-matrix.js';

export type RenderTarget = 'skyline' | 'webview';

export interface DegradeDeclarationInput {
  property: string;
  value: string;
}

export interface DegradeContext {
  target?: RenderTarget;
  /** 当前声明所在节点标签（text-only 属性判定用） */
  tag?: string;
}

export type DegradeStatus = 'supported' | 'degraded' | 'unsupported' | 'shorthand' | 'unknown';

export interface DegradeWarning {
  code: string;
  message: string;
  property: string;
  originalValue: string;
  action: DegradeStatus;
}

export interface DegradeResult {
  property: string;
  originalValue: string;
  status: DegradeStatus;
  /** 可直接写回 WXSS 的声明（unsupported 时为空数组） */
  output: Array<{ property: string; value: string }>;
  warnings: DegradeWarning[];
}

/** 仅作用于 text 节点的属性（官方备注"仅作用于 text 节点"） */
const TEXT_ONLY_PROPERTIES = new Set([
  'text-overflow',
  'text-decoration-line',
  'text-decoration-style',
  'text-decoration-color',
]);

const warning = (
  code: string,
  message: string,
  property: string,
  originalValue: string,
  action: DegradeStatus,
): DegradeWarning => ({ code, message, property, originalValue, action });

/** 按顶层逗号拆多值（url() 等不含裸逗号），返回去空白后的第一段 */
function firstLayer(value: string): string {
  return value.split(',')[0]!.trim();
}

/** 统计 filter 值中的滤镜函数数量（drop-shadow/url 单独判定） */
function filterFunctionNames(value: string): string[] {
  const re = /([a-zA-Z-]+)\s*\(/g;
  const names: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) names.push(m[1]!.toLowerCase());
  return names;
}

/**
 * 降级单条声明。target='webview' 时不做属性级拦截（能力随系统 WebView）。
 */
export function degradeDeclaration(
  input: DegradeDeclarationInput,
  context: DegradeContext = {},
): DegradeResult {
  const { property, value: rawValue } = input;
  const value = rawValue.trim();
  const target: RenderTarget = context.target ?? 'skyline';
  const base: DegradeResult = {
    property,
    originalValue: rawValue,
    status: 'supported',
    output: [],
    warnings: [],
  };
  const keep = (status: DegradeStatus, outValue: string = value): DegradeResult => ({
    ...base,
    status,
    output: [{ property, value: outValue }],
  });
  const fail = (code: string, message: string): DegradeResult => ({
    ...base,
    status: 'unsupported',
    output: [],
    warnings: [warning(code, message, property, rawValue, 'unsupported')],
  });
  const downgrade = (code: string, message: string, outValue: string): DegradeResult => ({
    ...base,
    status: 'degraded',
    output: [{ property, value: outValue }],
    warnings: [warning(code, message, property, rawValue, 'degraded')],
  });

  // WebView：不做 Skyline 属性级拦截
  if (target === 'webview') return keep('supported');

  // overflow-x/y 官方属性表无独立行，限制记载于 overflow 备注（任何值均不支持）
  if (property === 'overflow-x' || property === 'overflow-y') {
    return fail('FDT-WXSS-OVERFLOW-SINGLE-AXIS', 'Skyline 不支持单独设置 overflow-x/overflow-y（滚动请用 scroll-view）');
  }

  const entry = getWxssEntry(property);
  if (!entry) {
    // 官方表外：保留值但标记 unknown，绝不假装支持
    return {
      ...keep('unknown'),
      warnings: [
        warning(
          'FDT-WXSS-PROPERTY-UNKNOWN',
          `属性 ${property} 不在 Skyline 官方支持清单内，未做兼容性保证`,
          property,
          rawValue,
          'unknown',
        ),
      ],
    };
  }

  if (entry.skyline === 'shorthand') {
    // 官方"支持解析但以展开属性为准"——保留，不丢样式
    return keep('shorthand');
  }

  // —— 以下为官方备注明确的限制（逐条对应矩阵 note）——

  if (property === 'overflow') {
    if (value === 'scroll') {
      return fail('FDT-WXSS-OVERFLOW-SCROLL', 'Skyline 不支持 overflow:scroll，请改用 scroll-view 组件');
    }
    return keep('supported');
  }
  if (property === 'position') {
    if (value === 'sticky') {
      return fail('FDT-WXSS-POSITION-STICKY', 'Skyline 不支持 position:sticky，请用 sticky-header/sticky-section 替代');
    }
    return keep('supported');
  }
  if (property === 'background-image' || property === 'mask-image') {
    if (value !== 'none' && value.includes(',')) {
      const code = property === 'background-image' ? 'FDT-WXSS-BG-MULTI' : 'FDT-WXSS-MASK-MULTI';
      return downgrade(code, `Skyline 的 ${property} 不支持多张图片，仅保留第一层`, firstLayer(value));
    }
    return keep('supported');
  }
  if (property === 'box-shadow') {
    if (value !== 'none' && value.includes(',')) {
      return downgrade('FDT-WXSS-SHADOW-MULTI', 'Skyline 的 box-shadow 不支持多个叠加，仅保留第一个', firstLayer(value));
    }
    return keep('supported');
  }
  if (property === 'filter' || property === 'backdrop-filter') {
    if (value !== 'none' && value !== '') {
      const names = filterFunctionNames(value);
      const hasUrl = /url\s*\(/i.test(value);
      const hasDropShadow = names.includes('drop-shadow');
      const multiFn = names.length > 1;
      if (hasUrl || hasDropShadow || multiFn) {
        const reason = hasUrl
          ? '不支持 url()'
          : hasDropShadow
            ? '不支持 drop-shadow'
            : '不支持多个 filter 函数叠加';
        return fail('FDT-WXSS-FILTER-LIMIT', `Skyline 的 ${property} ${reason}`);
      }
    }
    return keep('supported');
  }
  if (property === 'font-size') {
    if (value.endsWith('%') || /^(xx-small|x-small|small|medium|large|x-large|xx-large|smaller|larger)$/.test(value)) {
      return fail('FDT-WXSS-FONT-SIZE', 'Skyline 的 font-size 不支持百分比与 CSS keyword，请使用 rpx/px 长度');
    }
    return keep('supported');
  }
  if (TEXT_ONLY_PROPERTIES.has(property)) {
    if (context.tag && context.tag !== 'text') {
      return fail('FDT-WXSS-TEXT-ONLY', `${property} 仅作用于 text 节点，不能用于 <${context.tag}>`);
    }
    return keep('supported');
  }
  if (property === 'animation-fill-mode') {
    if (value === 'none' || value === 'backwards') {
      return downgrade(
        'FDT-WXSS-ANIMATION-FILL-MODE',
        'Skyline 未支持 none/backwards（实际表现均为 forwards），改写为 forwards',
        'forwards',
      );
    }
    return keep('supported');
  }
  if (property === 'display') {
    if (value === 'inline' || value === 'inline-block') {
      return downgrade(
        'FDT-WXSS-DISPLAY-INLINE',
        'Skyline 不支持 inline 布局；inline-block 仅可在 text 组件嵌套结构中使用',
        value,
      );
    }
    return keep('supported');
  }

  // full/partial 但无对应规则触发：放行
  return keep('supported');
}

export interface DegradeStylesheetReport {
  /** 可写回 WXSS 的声明（unsupported 已剔除，degraded 已改写） */
  outputs: Array<{ property: string; value: string }>;
  warnings: DegradeWarning[];
  /** 被剔除的不支持声明（原属性/原值，可追溯） */
  dropped: Array<{ property: string; value: string }>;
}

/** 批量降级：按输入顺序产出可写回声明，warnings/dropped 完整可追溯 */
export function degradeStylesheet(
  declarations: DegradeDeclarationInput[],
  context: DegradeContext = {},
): DegradeStylesheetReport {
  const outputs: DegradeStylesheetReport['outputs'] = [];
  const warnings: DegradeWarning[] = [];
  const dropped: DegradeStylesheetReport['dropped'] = [];
  for (const decl of declarations) {
    const r = degradeDeclaration(decl, context);
    outputs.push(...r.output);
    warnings.push(...r.warnings);
    if (r.status === 'unsupported') dropped.push({ property: decl.property, value: decl.value });
  }
  return { outputs, warnings, dropped };
}

/**
 * 选择器校验：属性选择器与带参伪类/伪元素在 WXSS 不生效（官方通用 WXSS 页）。
 */
export function checkSelector(selector: string): { ok: boolean; warnings: DegradeWarning[] } {
  const warnings: DegradeWarning[] = [];
  for (const rule of SELECTOR_RESTRICTIONS) {
    if (rule.pattern.test(selector)) {
      warnings.push({
        code: rule.code,
        message: rule.message,
        property: selector,
        originalValue: selector,
        action: 'unsupported',
      });
    }
  }
  return { ok: warnings.length === 0, warnings };
}
