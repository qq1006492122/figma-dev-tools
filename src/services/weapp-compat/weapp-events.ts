/**
 * 微信小程序事件映射（WBS-P0-52）
 *
 * 纯函数：节点（tag/role/名称信号）→ 标准小程序事件绑定（bind/catch），
 * 生成全局唯一 handler 名、JS methods 骨架与自定义组件 triggerEvent，
 * 并按冻结基础库能力矩阵决定 aria 属性去留。
 *
 * @module
 */

// ============ 类型 ============

export type WeappEventName =
  | 'tap'
  | 'input'
  | 'change'
  | 'confirm'
  | 'submit'
  | 'scroll';

export interface EventContext {
  id: string;
  name: string;
  tag: string;
  role?: string;
  /** a11y 推断为按钮 */
  isButton?: boolean;
  /** 节点命中的原生组件名称信号（mask/overlay 等防冒泡判断用） */
  nameSignals?: string[];
}

export interface WeappEventBinding {
  /** 小程序事件名 */
  event: WeappEventName;
  /** 绑定种类：bind（冒泡）/ catch（拦截） */
  bindKind: 'bind' | 'catch';
  /** 完整属性名：bindtap / catchtap / bindinput ... */
  attr: string;
  /** 属性形式 bindtap=（冒号形式 bind:tap 等价，统一用无冒号） */
  bindAttr: string;
  /** 处理函数名（全局唯一） */
  handler: string;
  /** handler 中应读取的载荷提示（e.detail.value 等） */
  detailHint: string;
}

// ============ 组件 → 事件 ============

interface EventRule {
  event: WeappEventName;
  detailHint: string;
}

const TAG_EVENTS: Record<string, EventRule[]> = {
  button: [{ event: 'tap', detailHint: '' }],
  input: [{ event: 'input', detailHint: 'e.detail.value' }],
  textarea: [
    { event: 'input', detailHint: 'e.detail.value' },
    { event: 'confirm', detailHint: 'e.detail.value' },
  ],
  form: [{ event: 'submit', detailHint: 'e.detail.value' }],
  picker: [{ event: 'change', detailHint: 'e.detail.value' }],
  switch: [{ event: 'change', detailHint: 'e.detail.value' }],
  slider: [{ event: 'change', detailHint: 'e.detail.value' }],
  swiper: [{ event: 'change', detailHint: 'e.detail.current' }],
  'scroll-view': [{ event: 'scroll', detailHint: 'e.detail' }],
};

const CATCH_SIGNALS = ['mask', 'overlay', 'backdrop', 'scrim'];

function slugCamel(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
  if (words.length === 0) return '';
  return words[0] + words.slice(1).map((w) => w[0]!.toUpperCase() + w.slice(1)).join('');
}

const DEFAULT_HANDLERS: Record<WeappEventName, string> = {
  tap: 'handleTap',
  input: 'handleInput',
  change: 'handleChange',
  confirm: 'handleConfirm',
  submit: 'handleSubmit',
  scroll: 'handleScroll',
};

/** 无语义的通用节点名：命中时回退到事件默认 handler（handleTap 等） */
const GENERIC_NAMES = new Set([
  'button', 'btn', 'view', 'container', 'frame', 'group', 'card', 'item',
  'input', 'textarea', 'picker', 'form', 'swiper', 'text', 'label', 'icon',
]);

/**
 * 解析语义化 handler 名：on{NodeCamel}{Event}，并在 used 集合内全局唯一去重。
 * 无节点名时回退到事件默认名（handleTap 等），保持与旧产物兼容。
 */
export function resolveHandlerNames(
  nodeName: string,
  event: WeappEventName,
  used: Set<string>,
): string {
  const baseName = slugCamel(nodeName);
  const eventCap = event[0]!.toUpperCase() + event.slice(1);
  // tap 是最通用交互，处理器统一 handleTap（与既有产物兼容）；
  // 表单类 input/change/submit/confirm/scroll 才按节点名语义化。
  const semantic = event !== 'tap' && baseName && !GENERIC_NAMES.has(baseName);
  // 节点名已含事件后缀时不重复追加（Name Input + input → onNameInput）
  const endsWithEvent = baseName.endsWith(eventCap);
  const base = semantic
    ? `on${baseName[0]!.toUpperCase() + baseName.slice(1)}${endsWithEvent ? '' : eventCap}`
    : DEFAULT_HANDLERS[event]!;
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let i = 2;
  while (used.has(`${base}${i}`)) i++;
  const candidate = `${base}${i}`;
  used.add(candidate);
  return candidate;
}

/**
 * 节点 → 事件绑定。无交互语义返回空数组。
 * @param usedHandlerNames 跨节点共享的 handler 名集合（保证全组件唯一）
 */
export function eventsForNode(
  ctx: EventContext,
  usedHandlerNames: Set<string> = new Set(),
): WeappEventBinding[] {
  const rules: EventRule[] = [];
  for (const rule of TAG_EVENTS[ctx.tag] ?? []) rules.push(rule);

  // view 等容器：按钮语义才绑 tap
  if (ctx.tag !== 'button' && (ctx.role === 'button' || ctx.isButton)) {
    rules.push({ event: 'tap', detailHint: '' });
  }

  if (rules.length === 0) return [];

  const signals = (ctx.nameSignals ?? []).map((s) => s.toLowerCase());
  const lowerName = ctx.name.toLowerCase();
  const isCatchLayer =
    CATCH_SIGNALS.some((s) => signals.includes(s) || lowerName.includes(s));

  return rules.map((rule) => {
    const isTap = rule.event === 'tap';
    const bindKind: 'bind' | 'catch' = isTap && isCatchLayer ? 'catch' : 'bind';
    const handler = resolveHandlerNames(ctx.name, rule.event, usedHandlerNames);
    const attr = `${bindKind}${rule.event}`;
    return {
      event: rule.event,
      bindKind,
      attr,
      bindAttr: attr,
      handler,
      detailHint: rule.detailHint,
    };
  });
}

// ============ aria 能力矩阵（冻结基线 3.1.5） ============

/** 支持 aria-label 的宿主标签（基础内容/交互组件） */
const ARIA_LABEL_TAGS = new Set(['view', 'text', 'button', 'image', 'input', 'textarea', 'navigator']);
/** 支持 role 的宿主标签 */
const ROLE_TAGS = new Set(['view', 'text', 'button', 'image', 'navigator']);

/**
 * 按冻结基础库能力矩阵决定 aria/role 属性是否应输出到该标签。
 * 非 aria 属性不在此矩阵范围（返回 true，由其它白名单处理）。
 */
export function ariaAttrAllowed(tag: string, attrName: string): boolean {
  const attr = attrName.toLowerCase();
  if (!attr.startsWith('aria-') && attr !== 'role') return true;
  if (attr === 'role') return ROLE_TAGS.has(tag);
  if (attr === 'aria-label') return ARIA_LABEL_TAGS.has(tag);
  // 其它 aria-* 属性保守不自动注入
  return false;
}

// ============ JS methods 汇总 ============

export interface HandlerInput {
  tag: string;
  handler: string;
  event: WeappEventName;
  detailHint: string;
}

export interface MethodsOptions {
  isCustomComponent: boolean;
}

export interface MethodsReport {
  handlerNames: string[];
  /** methods 内部函数骨架文本（缩进 4 空格，供 Page/Component 模板插入） */
  methodsCode: string;
}

/**
 * 由收集到的 handler 生成 JS 方法骨架。
 * 自定义组件内用 this.triggerEvent 向父级抛事件；Page 直接读取 detail。
 */
export function collectJsMethods(
  handlers: HandlerInput[],
  options: MethodsOptions,
): MethodsReport {
  // 同名 handler 去重（多个节点可能共用一个处理函数）
  const unique = new Map<string, HandlerInput>();
  for (const h of handlers) {
    if (!unique.has(h.handler)) unique.set(h.handler, h);
  }
  const ordered = [...unique.values()];
  const blocks = ordered.map((h) => {
    const lines: string[] = [];
    lines.push(`    ${h.handler}(e) {`);
    if (h.detailHint) {
      lines.push(`      const value = ${h.detailHint};`);
      if (options.isCustomComponent) {
        lines.push(`      this.triggerEvent('${h.event}', { value });`);
      } else {
        lines.push(`      // TODO: 处理 ${h.event}（${h.detailHint}）`);
      }
    } else if (options.isCustomComponent) {
      lines.push(`      this.triggerEvent('${h.event}', e.detail);`);
    } else {
      lines.push(`      // TODO: 实现 ${h.handler}`);
    }
    lines.push('    },');
    return lines.join('\n');
  });
  return {
    handlerNames: ordered.map((h) => h.handler),
    methodsCode: blocks.join('\n'),
  };
}
