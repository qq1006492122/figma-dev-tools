/**
 * 微信小程序原生组件注册表与映射（WBS-P0-51）
 *
 * 纯数据 + 纯函数：从 Figma 节点的名称信号识别 scroll-view/swiper/picker/rich-text
 * 等原生组件，提供属性白名单过滤与嵌套合法性校验。生成器据此渲染，保证
 * "错误嵌套和无效属性不输出"。规则事实来自微信官方组件文档（每条记录含 docsUrl）。
 *
 * @module
 */

// ============ 类型 ============

export interface NativeMatchInput {
  id: string;
  name: string;
  originalType?: string;
  role?: string;
  clipsContent?: boolean;
  children?: unknown[];
}

export interface NativeAttrSpec {
  /** 属性名（kebab-case） */
  name: string;
  /** 值类型：boolean 仅允许 true/false；number 仅允许数字串；enum 取 allowedValues */
  type: 'boolean' | 'number' | 'string' | 'enum';
  /** type=enum 时的合法值 */
  allowedValues?: readonly string[];
}

export type NativeChildPolicy =
  | { kind: 'any' }
  | { kind: 'leaf'; reasonCode: string; message: string }
  | { kind: 'required-tag'; tag: string; reasonCode: string; message: string };

export interface NativeComponentSpec {
  tag: string;
  /** 名称信号（小写子串匹配，命中其一即识别） */
  nameSignals: readonly string[];
  /** 是否要求节点裁剪溢出作为附加条件（降低 scroll 误判） */
  requireClips?: boolean;
  /** 允许的属性白名单（不含 bind/catch 事件与 data-*，这些统一放行） */
  allowedAttrs: readonly NativeAttrSpec[];
  /** 直接子节点策略 */
  childPolicy: NativeChildPolicy;
  /** 官方文档 URL（可追溯） */
  docsUrl: string;
}

export interface NativeMatch {
  tag: string;
  signal: string;
}

export interface AttrSanitizeResult {
  attrs: Array<{ name: string; value: string }>;
  dropped: Array<{ name: string; value: string; code: string; message: string }>;
}

export interface NestingError {
  code: string;
  message: string;
}

// ============ 注册表 ============

const COMPONENT_DOCS = 'https://developers.weixin.qq.com/miniprogram/dev/component/';

export const NATIVE_COMPONENTS: readonly NativeComponentSpec[] = [
  {
    tag: 'scroll-view',
    nameSignals: ['scroll-view', 'scrollview', 'scroll view', 'horizontalscroll', 'verticalscroll'],
    requireClips: true,
    allowedAttrs: [
      { name: 'scroll-x', type: 'boolean' },
      { name: 'scroll-y', type: 'boolean' },
      { name: 'scroll-with-animation', type: 'boolean' },
      { name: 'enable-flex', type: 'boolean' },
      { name: 'enhanced', type: 'boolean' },
      { name: 'show-scrollbar', type: 'boolean' },
      { name: 'scroll-top', type: 'string' },
      { name: 'scroll-left', type: 'string' },
      { name: 'scroll-into-view', type: 'string' },
      { name: 'type', type: 'enum', allowedValues: ['list', 'nested'] },
    ],
    childPolicy: { kind: 'any' },
    docsUrl: `${COMPONENT_DOCS}scroll-view.html`,
  },
  {
    tag: 'swiper',
    nameSignals: ['swiper', 'carousel', 'slider'],
    allowedAttrs: [
      { name: 'indicator-dots', type: 'boolean' },
      { name: 'indicator-color', type: 'string' },
      { name: 'indicator-active-color', type: 'string' },
      { name: 'autoplay', type: 'boolean' },
      { name: 'current', type: 'number' },
      { name: 'interval', type: 'number' },
      { name: 'duration', type: 'number' },
      { name: 'circular', type: 'boolean' },
      { name: 'vertical', type: 'boolean' },
      { name: 'previous-margin', type: 'string' },
      { name: 'next-margin', type: 'string' },
      { name: 'display-multiple-items', type: 'number' },
    ],
    childPolicy: {
      kind: 'required-tag',
      tag: 'swiper-item',
      reasonCode: 'FDT-NATIVE-NESTING-SWIPER-CHILD',
      message: 'swiper 仅可放置 swiper-item 组件作为直接子节点',
    },
    docsUrl: `${COMPONENT_DOCS}swiper.html`,
  },
  {
    tag: 'swiper-item',
    nameSignals: ['swiper-item', 'slide-item', 'carousel-item'],
    allowedAttrs: [{ name: 'item-id', type: 'string' }],
    childPolicy: { kind: 'any' },
    docsUrl: `${COMPONENT_DOCS}swiper.html`,
  },
  {
    tag: 'picker',
    nameSignals: ['picker', 'select', 'dropdown'],
    allowedAttrs: [
      {
        name: 'mode',
        type: 'enum',
        allowedValues: ['selector', 'multiSelector', 'time', 'date', 'region'],
      },
      { name: 'disabled', type: 'boolean' },
      { name: 'range', type: 'string' },
      { name: 'range-key', type: 'string' },
      { name: 'value', type: 'string' },
      { name: 'start', type: 'string' },
      { name: 'end', type: 'string' },
      { name: 'fields', type: 'enum', allowedValues: ['year', 'month', 'day'] },
    ],
    childPolicy: { kind: 'any' },
    docsUrl: `${COMPONENT_DOCS}picker.html`,
  },
  {
    tag: 'rich-text',
    nameSignals: ['rich-text', 'rich text', 'richtext', 'html content', 'htmlcontent'],
    allowedAttrs: [
      { name: 'nodes', type: 'string' },
      { name: 'space', type: 'enum', allowedValues: ['ensp', 'emsp', 'nbsp'] },
    ],
    childPolicy: {
      kind: 'leaf',
      reasonCode: 'FDT-NATIVE-NESTING-RICH-TEXT-LEAF',
      message: 'rich-text 不接受子节点，内容只能通过 nodes 属性提供',
    },
    docsUrl: `${COMPONENT_DOCS}rich-text.html`,
  },
];

const COMPONENT_BY_TAG: ReadonlyMap<string, NativeComponentSpec> = new Map(
  NATIVE_COMPONENTS.map((c) => [c.tag, c]),
);

export const NATIVE_COMPONENT_TAGS: readonly string[] = NATIVE_COMPONENTS.map((c) => c.tag);

export function getNativeComponent(tag: string): NativeComponentSpec | undefined {
  return COMPONENT_BY_TAG.get(tag);
}

// ============ 名称匹配 ============

export function matchNativeComponent(node: NativeMatchInput): NativeMatch | null {
  const haystack = (node.name ?? '').toLowerCase();
  for (const spec of NATIVE_COMPONENTS) {
    for (const signal of spec.nameSignals) {
      if (haystack.includes(signal)) {
        if (spec.requireClips && !node.clipsContent) continue;
        return { tag: spec.tag, signal };
      }
    }
  }
  return null;
}

// ============ 属性白名单 ============

const EVENT_ATTR_RE = /^(bind|catch|capture-bind|capture-catch):?[a-zA-Z]/;

function isGlobalAllowedAttr(name: string): boolean {
  // 事件绑定与 data-* 自定义数据对所有原生组件放行
  return EVENT_ATTR_RE.test(name) || name.startsWith('data-') || name === 'id' || name === 'class' || name === 'style';
}

function valueValid(spec: NativeAttrSpec, value: string): boolean {
  switch (spec.type) {
    case 'boolean':
      return value === 'true' || value === 'false';
    case 'number':
      return value.trim() !== '' && Number.isFinite(Number(value));
    case 'enum':
      return (spec.allowedValues ?? []).includes(value);
    case 'string':
      return true;
  }
}

/**
 * 按组件白名单过滤属性：非法属性名/非法枚举值一律剔除并给结构化原因，
 * 保证"无效属性不输出"。非原生组件原样返回。
 */
export function sanitizeNativeAttrs(tag: string, attrs: Record<string, string>): AttrSanitizeResult {
  const spec = COMPONENT_BY_TAG.get(tag);
  if (!spec) {
    return {
      attrs: Object.entries(attrs).map(([name, value]) => ({ name, value })),
      dropped: [],
    };
  }
  const kept: AttrSanitizeResult['attrs'] = [];
  const dropped: AttrSanitizeResult['dropped'] = [];
  for (const [name, value] of Object.entries(attrs)) {
    if (isGlobalAllowedAttr(name)) {
      kept.push({ name, value });
      continue;
    }
    const attrSpec = spec.allowedAttrs.find((a) => a.name === name);
    if (!attrSpec) {
      dropped.push({
        name,
        value,
        code: 'FDT-NATIVE-ATTR-NOT-ALLOWED',
        message: `${tag} 不支持属性 ${name}（不在官方属性白名单内）`,
      });
      continue;
    }
    if (!valueValid(attrSpec, value)) {
      dropped.push({
        name,
        value,
        code: 'FDT-NATIVE-ATTR-BAD-VALUE',
        message: `${tag} 的属性 ${name} 取值 "${value}" 非法`,
      });
      continue;
    }
    kept.push({ name, value });
  }
  return { attrs: kept, dropped };
}

// ============ 嵌套校验 ============

export interface NestingContext {
  parentAttrs?: Record<string, string>;
  childAttrs?: Record<string, string>;
}

/**
 * 校验"原生父组件 → 直接子组件"的嵌套合法性。parent 为 null/非原生时放行。
 */
export function validateNativeNesting(
  parentTag: string | null,
  childTag: string,
  context: NestingContext = {},
): NestingError[] {
  if (!parentTag) return [];
  const parent = COMPONENT_BY_TAG.get(parentTag);
  if (!parent) return [];

  const errors: NestingError[] = [];

  if (parent.childPolicy.kind === 'required-tag' && childTag !== parent.childPolicy.tag) {
    errors.push({ code: parent.childPolicy.reasonCode, message: parent.childPolicy.message });
  }
  if (parent.childPolicy.kind === 'leaf') {
    errors.push({ code: parent.childPolicy.reasonCode, message: parent.childPolicy.message });
  }

  // scroll-view 同方向嵌套（需双方属性判定）
  if (parentTag === 'scroll-view' && childTag === 'scroll-view') {
    const p = context.parentAttrs ?? {};
    const c = context.childAttrs ?? {};
    const sameY = p['scroll-y'] === 'true' && c['scroll-y'] !== 'false';
    const sameX = p['scroll-x'] === 'true' && c['scroll-x'] !== 'false';
    if (sameY || sameX) {
      errors.push({
        code: 'FDT-NATIVE-NESTING-SCROLL-SAME-AXIS',
        message: 'scroll-view 不应同方向嵌套（内外层滚动冲突），请改用单方向滚动区',
      });
    }
  }

  return errors;
}
