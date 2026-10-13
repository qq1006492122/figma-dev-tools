/**
 * 微信小程序 WXSS 属性兼容矩阵（WBS-P0-41）
 *
 * 数据取证：微信官方「Skyline 渲染引擎 / 支持与差异 / WXSS 样式」页
 * 「属性支持」表（109 个样式属性），2026-10-10 浏览器实抓转录，备注为官方原文。
 * https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/skyline/wxss.html
 *
 * 口径说明：
 *  - 默认 WebView 渲染的 WXSS 能力约等于系统 WebView，官方未逐属性枚举；
 *    官方唯一逐属性清单出现在 Skyline 差异页，故本矩阵以 Skyline 为受限目标。
 *  - skyline='shorthand'：官方注明"简写属性，支持解析但以展开属性为准"
 *  - skyline='partial'：官方备注列出明确限制（降级器规则的唯一事实来源）
 *  - skyline='full'：官方列出支持格式且无限制备注
 *  - 未列入官方表的属性一律视为 'unknown'（不得假装支持）
 *
 * @module
 */

export const SKYLINE_WXSS_SOURCE_URL =
  'https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/skyline/wxss.html';
export const WXSS_SOURCE_URL =
  'https://developers.weixin.qq.com/miniprogram/dev/framework/view/wxss.html';

export type WxssSkylineSupport = 'full' | 'partial' | 'shorthand';

export interface WxssPropertyEntry {
  property: string;
  /** Skyline 支持等级 */
  skyline: WxssSkylineSupport;
  /** 官方"支持格式"原文（简写属性为空串） */
  formats: string;
  /** 官方"默认值"原文 */
  defaultValue: string;
  /** 官方"备注"原文（空串表示无限制说明） */
  note: string;
  /** 取证来源 URL */
  source: string;
}

type RawRow = [property: string, formats: string, defaultValue: string, note: string];

/** 官方表 109 行转录（样式属性 | 支持格式 | 默认值 | 备注） */
const RAW_ROWS: readonly RawRow[] = [
  ['display', 'none / flex / block', 'flex', '默认值可通过配置改成 block'],
  ['position', 'relative / absolute / fixed', 'relative', 'fixed 在微信客户端 8.0.43 版本开始支持，只支持相对于窗口 viewport 定位，不支持 top / left / bottom / right 默认值 auto 解析，z-index 只作用在兄弟节点；sticky 可使用 sticky-header/sticky-section 替代'],
  ['overflow', 'hidden / visible', 'visible', 'scroll 不支持，只能通过 scroll-view 实现；不支持单独设置 overflow-x/y'],
  ['pointer-events', 'auto / none', 'auto', ''],
  ['box-sizing', 'border-box / content-box', 'border-box', ''],
  ['transform', 'none / <transform-function>', 'none', ''],
  ['transform-origin', 'left / center / right / top / bottom / <length>{1, 2}', '50% 50%', ''],
  ['z-index', '<float>', '0', '不支持层叠上下文，只对兄弟节点生效；不支持在 scroll-view 下的直接子节点上应用'],
  ['visibility', 'visible / hidden', 'visible', ''],
  ['color', '<color>', 'black', ''],
  ['opacity', '<float>', '1', ''],
  ['align-items', 'stretch / center / flex-start / flex-end / baseline', 'stretch', ''],
  ['align-self', 'auto / stretch / center / flex-start / flex-end / baseline', 'auto', ''],
  ['align-content', 'stretch / center / flex-start / flex-end / space-between / space-around', 'auto', ''],
  ['justify-content', 'center / flex-start / flex-end / space-between / space-around / space-evenly', 'flex-start', ''],
  ['flex-direction', 'row / row-reverse / column / column-reverse', 'column', ''],
  ['flex-wrap', 'nowrap / wrap / wrap-reverse', 'nowrap', ''],
  ['flex-grow', '<float>', '0', ''],
  ['flex-shrink', '<float>', '1', ''],
  ['flex-basis', '<length>', 'auto', ''],
  ['order', '<float>', '0', ''],
  ['gap', '<length>', '0', ''],
  ['flex', '', '', '简写属性，支持解析但以展开属性为准'],
  ['background-color', '<color>', 'transparent', ''],
  ['background-image', 'none / <image>', 'none', '不支持多张图片'],
  ['background-size', 'contain / cover / [<length> | auto]{1, 2}', 'auto', '完全支持 <bg-position>#，请参考 MDN'],
  ['background-position', 'left / center / right / top / bottom / <length>', '0 0', ''],
  ['background-repeat', 'repeat-x / repeat-y / repeat / no-repeat', 'repeat', ''],
  ['background', '', '', '简写属性，支持解析但以展开属性为准'],
  ['width', '<length>', 'auto', ''],
  ['height', '<length>', 'auto', ''],
  ['min-width', '<length>', 'auto', ''],
  ['min-height', '<length>', 'none', ''],
  ['max-width', '<length>', 'auto', ''],
  ['max-height', '<length>', 'none', ''],
  ['left', '<length>', 'auto', ''],
  ['right', '<length>', 'auto', ''],
  ['top', '<length>', 'auto', ''],
  ['bottom', '<length>', 'auto', ''],
  ['padding', '<length>{1,4}', '0 0 0 0', ''],
  ['padding-left', '<length>', '0', ''],
  ['padding-top', '<length>', '0', ''],
  ['padding-right', '<length>', '0', ''],
  ['padding-bottom', '<length>', '0', ''],
  ['margin', '<length>{1,4}', '0 0 0 0', ''],
  ['margin-left', '<length>', '0', ''],
  ['margin-top', '<length>', '0', ''],
  ['margin-right', '<length>', '0', ''],
  ['margin-bottom', '<length>', '0', ''],
  ['border-left-width', '<length>', '3', ''],
  ['border-left-style', '<border-style>', 'none', ''],
  ['border-left-color', '<color>', 'black', '默认值与 web 不同， web 默认值是 currentcolor'],
  ['border-top-width', '<length>', '3', ''],
  ['border-top-style', '<border-style>', 'none', ''],
  ['border-top-color', '<color>', 'black', '默认值与 web 不同， web 默认值是 currentcolor'],
  ['border-right-width', '<length>', '3', ''],
  ['border-right-style', '<border-style>', 'none', ''],
  ['border-right-color', '<color>', 'black', '默认值与 web 不同， web 默认值是 currentcolor'],
  ['border-bottom-width', '<length>', '3', ''],
  ['border-bottom-style', '<border-style>', 'none', ''],
  ['border-bottom-color', '<color>', 'black', '默认值与 web 不同， web 默认值是 currentcolor'],
  ['border-width', '', '', '简写属性，支持解析但以展开属性为准'],
  ['border-style', '', '', '简写属性，支持解析但以展开属性为准'],
  ['border-color', '', '', '简写属性，支持解析但以展开属性为准'],
  ['border-left', '', '', '简写属性，支持解析但以展开属性为准'],
  ['border-right', '', '', '简写属性，支持解析但以展开属性为准'],
  ['border-top', '', '', '简写属性，支持解析但以展开属性为准'],
  ['border-bottom', '', '', '简写属性，支持解析但以展开属性为准'],
  ['border', '', '', '简写属性，支持解析但以展开属性为准'],
  ['box-shadow', 'none / inset? && <length>{2,4} && <color>?', 'none', '不支持多个叠加'],
  ['border-top-left-radius', '<length>{1, 2}', '0', 'border-radius 非 0 时，四边的 border-width 可不一致，四边的 border-color 和 border-style 需一致'],
  ['border-top-right-radius', '<length>{1, 2}', '0', 'border-radius 非 0 时，四边的 border-width 可不一致，四边的 border-color 和 border-style 需一致'],
  ['border-bottom-left-radius', '<length>{1, 2}', '0', 'border-radius 非 0 时，四边的 border-width 可不一致，四边的 border-color 和 border-style 需一致'],
  ['border-bottom-right-radius', '<length>{1, 2}', '0', 'border-radius 非 0 时，四边的 border-width 可不一致，四边的 border-color 和 border-style 需一致'],
  ['border-radius', '', '', '简写属性，支持解析但以展开属性为准'],
  ['transition-property', 'none / all / transform / opacity 等', 'all', '基本都支持，暂不一一列举'],
  ['transition-duration', '<time>', '0', ''],
  ['transition-timing-function', '<timing-function>', '<timing-function>', ''],
  ['transition-delay', '<time>', '0', ''],
  ['transition', '', '', '简写属性，支持解析但以展开属性为准'],
  ['font', '', '', '简写属性，支持解析但以展开属性为准；不支持 caption / icon 等系统字体;'],
  ['font-size', '<length>', '16px', '不支持百分比；不支持 keyword (smaller..)'],
  ['line-height', 'normal / <number> / <length> / <percent>', 'normal', ''],
  ['text-align', 'left / center / right / justify / start / end', 'start', ''],
  ['font-weight', 'normal / bold / <float>', 'normal', ''],
  ['white-space', 'normal / nowrap', 'normal', ''],
  ['text-overflow', 'clip / ellipsis', 'clip', '仅作用于 text 节点'],
  ['word-break', 'normal / break-all', 'normal', ''],
  ['word-spacing', 'normal / <length>', 'normal', ''],
  ['letter-spacing', 'normal / <length>', 'normal', ''],
  ['font-family', 'serif / sans-serif / monospace / cursive / fantasy / <string>', '', ''],
  ['font-style', 'normal / italic', 'normal', ''],
  ['text-decoration-line', 'none / underline / overline / line-through', 'none', '仅作用于 text 节点'],
  ['text-decoration-style', 'solid / double / dotted / dashed / wavy', 'solid', '仅作用于 text 节点'],
  ['text-decoration-color', '<color>', 'black', '仅作用于 text 节点；默认值和 web 不同，web 默认值是 currentcolor'],
  ['text-decoration', '', '', '简写属性，支持解析但以展开属性为准；当前仅支持设置一种类型；暂不支持复合使用 text-decoration'],
  ['text-shadow', 'none / <color>? && <length>{2,3}', 'none', ''],
  ['backdrop-filter', 'none / [<filter-function>]', 'none', '不支持 multi function；不支持 drop-shadow；不支持 url；与 opacity 混合有问题；blur 某些情况表现不一致；'],
  ['filter', 'none / [<filter-function>]', 'none', '不支持 multi function；不支持 drop-shadow；不支持 url；'],
  ['mask-image', 'none / <image>', 'none', '不支持多张图片'],
  ['animation-delay', '<time>', '0', ''],
  ['animation-direction', 'normal / reverse / alternate / alternate-reverse', 'normal', ''],
  ['animation-duration', '<time>', '0', ''],
  ['animation-fill-mode', 'forwards / both', 'none', 'none 与 backwards 暂未支持，表现均为 forwards'],
  ['animation-iteration-count', 'infinite / <number>', '1', ''],
  ['animation-name', 'none / <custom-ident>', 'none', ''],
  ['animation-timing-function', '<timing-function>', '<timing-function>', ''],
  ['animation', '', '', '简写属性，支持解析但以展开属性为准'],
  ['will-change', 'auto / contents', 'auto', '声明绘制边界，优化渲染性能'],
];

function classify(formats: string, note: string): WxssSkylineSupport {
  if (formats === '' && note.includes('简写属性')) return 'shorthand';
  if (note !== '') return 'partial';
  return 'full';
}

/** 属性名 → 矩阵条目 */
export const WXSS_MATRIX: ReadonlyMap<string, WxssPropertyEntry> = new Map(
  RAW_ROWS.map(([property, formats, defaultValue, note]) => [
    property,
    { property, skyline: classify(formats, note), formats, defaultValue, note, source: SKYLINE_WXSS_SOURCE_URL },
  ]),
);

export function getWxssEntry(property: string): WxssPropertyEntry | null {
  return WXSS_MATRIX.get(property) ?? null;
}

export function listWxssEntriesBySupport(support: WxssSkylineSupport): WxssPropertyEntry[] {
  return [...WXSS_MATRIX.values()].filter((e) => e.skyline === support);
}

/**
 * WXSS 选择器限制（官方 WXSS 通用页 + Skyline 选择器表）：
 *  - 属性名选择器 [attr] 不生效
 *  - 不支持带参数的伪类/伪元素选择器
 *  - 自定义组件 WXSS 不允许标签/id/属性选择器（仅 class）
 */
export const SELECTOR_RESTRICTIONS = [
  {
    pattern: /\[[^\]]+\]/,
    code: 'FDT-WXSS-SELECTOR-ATTR',
    message: 'WXSS 不支持属性名选择器 [attr]',
    source: WXSS_SOURCE_URL,
  },
  {
    pattern: /::?[a-zA-Z-]+\([^)]*\)/,
    code: 'FDT-WXSS-SELECTOR-PSEUDO-ARGS',
    message: 'WXSS 不支持带参数的伪类/伪元素选择器',
    source: WXSS_SOURCE_URL,
  },
] as const;
