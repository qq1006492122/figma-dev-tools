/**
 * 微信小程序列表/条件结构推断器（WBS-P0-11）
 *
 * 纯函数层：输入 ProcessedNode 树，输出"数据驱动结构模型"，不产出 WXML/JS
 * （代码生成是 P0-12）。契约冻结于 ROADMAP-v1.4.20-v2.md P0-1.1：
 *
 *  - 列表：同 componentKey（高置信）或同名同构（中置信）且数量 ≥ 阈值（默认 3）
 *    的兄弟子节点 → wx:for 模型；裸 TEXT 碎片不参与，杜绝把任意相似节点误判为列表
 *  - 条件：tab/modal/tooltip 等名称信号与原型可见性默认只进"建议报告"；
 *    只有显式声明（用户确认）或打开 inference.conditions 才生成绑定，避免猜测业务状态
 *  - 嵌套：只沿重复组的"原型子节点"（组内第一个）向下递归，内层列表挂到外层
 *    item 的字段路径上（card.tagRow），item/index 别名全局唯一，避免作用域污染
 *  - block：承载控制指令的 <block> 禁止携带 class/style（assertBlockHasNoStyle）
 *
 * @module
 */

// ============ 输入类型（结构子集，便于单测构造） ============

export interface ProcessedNodeLike {
  id: string;
  figmaId?: string;
  name: string;
  originalType: string;
  role?: string;
  visible?: boolean;
  componentKey?: string;
  textContent?: string;
  size?: { width: number; height: number };
  children?: ProcessedNodeLike[];
}

// ============ 选项 ============

export interface WeappInferenceOptions {
  /** 列表自动推断开关（inference.list，默认 true；一键关闭） */
  list?: boolean;
  /** 条件自动绑定开关（inference.conditions，默认 false；保守优先） */
  conditions?: boolean;
  /** 成组最小重复数（默认 3） */
  minRepeated?: number;
}

// ============ 输出模型 ============

export interface ListTextField {
  name: string;
  sample: string;
}

export interface ListBinding {
  /** 本次推断内稳定唯一：l_0001 起 */
  id: string;
  kind: 'list';
  /** 承载重复子节点的容器 id */
  containerId: string;
  /** 命中重复的子节点 id（按设计稿顺序） */
  repeatedChildIds: string[];
  /** 占位 data 字段名（cardList）；wx:for="{{<dataPath>}}" 的根字段 */
  dataKey: string;
  /** wx:for 表达式路径：根列表=dataKey，嵌套=<外层 item 别名>.<dataKey> */
  dataPath: string;
  /** wx:for-item 别名（全局唯一，防嵌套作用域污染） */
  itemAlias: string;
  /** wx:for-index 别名（全局唯一） */
  indexAlias: string;
  /** wx:key（对象数组统一 id） */
  wxKey: 'id';
  /** 指令承载：元素自身；多兄弟包裹场景 P0-12 才会用 block */
  wrapper: 'element' | 'block';
  matchType: 'component-key' | 'homologous';
  confidence: 'high' | 'medium';
  /** 所属外层列表 id（null=根列表） */
  parentListId: string | null;
  /** 原型 item 的文本字段（不含内层列表子树） */
  fields: ListTextField[];
}

export type ConditionSignal =
  | 'name:tab'
  | 'name:modal'
  | 'name:tooltip'
  | 'name:drawer'
  | 'name:toast'
  | 'prototype-visibility';

export interface ConditionSuggestion {
  nodeId: string;
  signal: ConditionSignal;
  /** 建议的 data 字段（showConfirmModal） */
  suggestedDataKey: string;
  reason: string;
}

export interface ConditionBinding {
  nodeId: string;
  /** elif 链分组 id；独立条件为 null */
  groupId: string | null;
  branch: 'if' | 'elif' | 'else' | 'standalone';
  directive: 'wx:if' | 'wx:elif' | 'wx:else' | 'hidden';
  /** {{ }} 内部的原始表达式；wx:else 为 null */
  expression: string | null;
  wrapper: 'element' | 'block';
  /** explicit=用户显式声明；name-signal=开关打开后由名称信号生成 */
  source: 'explicit' | 'name-signal';
}

export interface ExplicitConditionInput {
  nodeId: string;
  /** 同组节点形成 if/elif/else 链（须为同一父级的兄弟） */
  groupId?: string;
  /** {{ }} 内表达式；isElse 时必须省略 */
  expression?: string;
  /** 标记为链尾 else 分支 */
  isElse?: boolean;
  /** 独立条件可用 hidden（默认 wx:if） */
  directive?: 'wx:if' | 'hidden';
}

export interface InferenceWarning {
  code: string;
  message: string;
}

export interface WeappStructureInference {
  lists: ListBinding[];
  conditionSuggestions: ConditionSuggestion[];
  conditions: ConditionBinding[];
  /** Page/Component data 占位（不写临时私有 json 文件） */
  placeholderData: Record<string, unknown>;
  warnings: InferenceWarning[];
}

// ============ 名称工具 ============

const SUFFIX_WORDS = ['list', 'row', 'group', 'container', 'items', 'wrapper', 'collection'];

function asciiWords(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

function slugCamel(name: string): string {
  const words = asciiWords(name).map((w) => w.toLowerCase());
  if (words.length === 0 || !words[0]) return '';
  return words[0] + words.slice(1).map((w) => w[0]!.toUpperCase() + w.slice(1)).join('');
}

function pascal(name: string): string {
  return asciiWords(name)
    .map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}

function singularAlias(name: string): string {
  const words = asciiWords(name).map((w) => w.toLowerCase());
  const kept = words.filter((w) => !SUFFIX_WORDS.includes(w));
  if (kept.length === 0 || !kept[0]) return 'item';
  return kept[0] + kept.slice(1).map((w) => w[0]!.toUpperCase() + w.slice(1)).join('');
}

/**
 * JS 保留字（列表 dataKey/别名会直接进入 Svelte `{#each}` 别名、
 * WXML wx:for-item 与 Page data 键名，均须为合法标识符）
 */
const RESERVED_IDENTS = new Set([
  'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
  'delete', 'do', 'else', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if',
  'import', 'in', 'instanceof', 'let', 'new', 'null', 'return', 'super', 'switch', 'this',
  'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
]);

/**
 * 把命名工具的产物收敛为合法 JS 标识符：
 * 剥离前导数字/非法字符；数字开头（Figma 图层可能直接叫「10」）或空值时加语义前缀；
 * 撞保留字时前缀首字母大写拼接。
 *
 * @param base - slugCamel/singularAlias 的原始产物
 * @param prefix - 需要前缀时使用（dataKey 用 'list'，item 别名用 'item'）
 */
export function safeIdentifier(base: string, prefix: string): string {
  const cleaned = base.replace(/[^A-Za-z0-9_$]/g, '');
  const candidate = cleaned.length > 0 ? cleaned : prefix;
  // 数字开头（如图层名「10」）→ 保留数字尾缀并加语义前缀：list10 / item10
  if (!/^[A-Za-z_$]/.test(candidate)) return `${prefix}${candidate}`;
  if (RESERVED_IDENTS.has(candidate)) return `${prefix}${candidate[0]!.toUpperCase()}${candidate.slice(1)}`;
  return candidate;
}

// ============ 结构指纹（不含名称/尺寸/文本，仅类型-角色树） ============

function structureSignature(node: ProcessedNodeLike): string {
  const self = `${node.originalType}:${node.role ?? ''}`;
  const kids = (node.children ?? []).map(structureSignature).join(',');
  return `${self}(${kids})`;
}

// ============ 主入口 ============

interface InternalCtx {
  lists: ListBinding[];
  suggestions: ConditionSuggestion[];
  warnings: InferenceWarning[];
  seqList: number;
  usedDataKeys: Set<string>;
  usedAliases: Set<string>;
  byId: Map<string, ProcessedNodeLike>;
  parent: Map<string, string | null>;
  dfsOrder: Map<string, number>;
  listMin: number;
}

export function inferWeappStructure(
  root: ProcessedNodeLike,
  options: WeappInferenceOptions = {},
  explicitConditions: ExplicitConditionInput[] = [],
): WeappStructureInference {
  const listEnabled = options.list !== false;
  const conditionsEnabled = options.conditions === true;
  const minRepeated = options.minRepeated ?? 3;

  const ctx: InternalCtx = {
    lists: [],
    suggestions: [],
    warnings: [],
    seqList: 0,
    usedDataKeys: new Set(),
    usedAliases: new Set(),
    byId: new Map(),
    parent: new Map(),
    dfsOrder: new Map(),
    listMin: minRepeated,
  };

  // 建索引
  let order = 0;
  const indexTree = (node: ProcessedNodeLike, p: string | null) => {
    ctx.byId.set(node.id, node);
    ctx.parent.set(node.id, p);
    ctx.dfsOrder.set(node.id, order++);
    for (const c of node.children ?? []) indexTree(c, node.id);
  };
  indexTree(root, null);

  // 1) 列表（递归时只下钻原型子节点）
  if (listEnabled) {
    detectLists(ctx, root, null);
  }

  // 2) 条件建议（始终收集）
  collectSuggestions(ctx, root);

  // 3) 条件绑定
  const conditions: ConditionBinding[] = [];
  const boundSignalNodeIds = new Set<string>();
  if (conditionsEnabled) {
    for (const s of ctx.suggestions) {
      if (boundSignalNodeIds.has(s.nodeId)) continue;
      boundSignalNodeIds.add(s.nodeId);
      conditions.push({
        nodeId: s.nodeId,
        groupId: null,
        branch: 'standalone',
        directive: 'hidden',
        expression: `!${s.suggestedDataKey}`,
        wrapper: 'element',
        source: 'name-signal',
      });
    }
  }
  conditions.push(...resolveExplicitConditions(ctx, explicitConditions));

  // 4) placeholder data
  const placeholderData: Record<string, unknown> = {};
  for (const list of ctx.lists.filter((l) => l.parentListId === null)) {
    const childNodes = list.repeatedChildIds.map((id) => ctx.byId.get(id)!);
    placeholderData[list.dataKey] = buildRows(ctx, list, childNodes);
  }
  for (const c of conditions) {
    if (c.source === 'name-signal' && c.directive === 'hidden') {
      const key = c.expression!.replace(/^!/, '');
      placeholderData[key] = true; // 默认可见，交由业务改写
    }
  }

  return {
    lists: ctx.lists,
    conditionSuggestions: ctx.suggestions,
    conditions,
    placeholderData,
    warnings: ctx.warnings,
  };
}

// ============ 列表检测 ============

interface DetectedGroup {
  matchType: 'component-key' | 'homologous';
  members: ProcessedNodeLike[];
}

function detectGroups(ctx: InternalCtx, container: ProcessedNodeLike): DetectedGroup[] {
  const children = container.children ?? [];
  const groups: DetectedGroup[] = [];

  // 同 componentKey（非空）
  const byKey = new Map<string, ProcessedNodeLike[]>();
  for (const c of children) {
    if (c.componentKey) {
      const arr = byKey.get(c.componentKey) ?? [];
      arr.push(c);
      byKey.set(c.componentKey, arr);
    }
  }
  for (const arr of byKey.values()) {
    if (arr.length >= ctx.listMin) {
      groups.push({ matchType: 'component-key', members: [...arr].sort(byOrder(ctx)) });
    }
  }
  const claimed = new Set(groups.flatMap((g) => g.members.map((m) => m.id)));

  // 同名同构（排除裸 TEXT、排除已入组节点）
  const byShape = new Map<string, ProcessedNodeLike[]>();
  for (const c of children) {
    if (claimed.has(c.id) || c.originalType === 'TEXT') continue;
    const key = `${c.name} ${structureSignature(c)}`;
    const arr = byShape.get(key) ?? [];
    arr.push(c);
    byShape.set(key, arr);
  }
  for (const arr of byShape.values()) {
    if (arr.length >= ctx.listMin) {
      groups.push({ matchType: 'homologous', members: [...arr].sort(byOrder(ctx)) });
      arr.forEach((m) => claimed.add(m.id));
    }
  }

  return groups.sort(
    (a, b) => ctx.dfsOrder.get(a.members[0]!.id)! - ctx.dfsOrder.get(b.members[0]!.id)!,
  );
}

function byOrder(ctx: InternalCtx) {
  return (a: ProcessedNodeLike, b: ProcessedNodeLike) =>
    ctx.dfsOrder.get(a.id)! - ctx.dfsOrder.get(b.id)!;
}

function detectLists(
  ctx: InternalCtx,
  node: ProcessedNodeLike,
  parentList: ListBinding | null,
): void {
  const children = node.children ?? [];
  const groups = detectGroups(ctx, node);

  // 先建绑定（组→其父列表为当前 parentList），保证同层多组各归各的父级
  const listByGroup = new Map<DetectedGroup, ListBinding>();
  for (const group of groups) {
    const list = createListBinding(ctx, node, group, parentList);
    ctx.lists.push(list);
    listByGroup.set(group, list);
  }

  // 下钻：非组成员按当前 parentList 递归；组成员只递归第一个（原型），父级换成自己的组
  for (const c of children) {
    const owningGroup = groups.find((g) => g.members.some((m) => m.id === c.id));
    if (owningGroup && owningGroup.members[0]!.id === c.id) {
      detectLists(ctx, c, listByGroup.get(owningGroup)!);
    } else if (!owningGroup) {
      detectLists(ctx, c, parentList);
    }
  }
}

function unique(set: Set<string>, base: string): string {
  if (!set.has(base)) {
    set.add(base);
    return base;
  }
  let i = 2;
  while (set.has(`${base}${i}`)) i++;
  set.add(`${base}${i}`);
  return `${base}${i}`;
}

function createListBinding(
  ctx: InternalCtx,
  container: ProcessedNodeLike,
  group: DetectedGroup,
  parentList: ListBinding | null,
): ListBinding {
  const id = `l_${String(++ctx.seqList).padStart(4, '0')}`;
  // 容器名为纯数字/保留字（图层直接叫「10」）时也要产出合法 JS 标识符，
  // 否则 Svelte {#each} 与 WXML wx:for-item 会生成非法代码（编译失败）
  const baseKey = safeIdentifier(slugCamel(container.name), 'list');
  const dataKey = unique(ctx.usedDataKeys, baseKey);
  const aliasBase = safeIdentifier(singularAlias(container.name), 'item');
  const itemAlias = unique(ctx.usedAliases, aliasBase);
  const indexAlias = unique(ctx.usedAliases, `${aliasBase}Index`);

  const fields = collectTextFields(group.members[0]!, new Set());

  return {
    id,
    kind: 'list',
    containerId: container.id,
    repeatedChildIds: group.members.map((m) => m.id),
    dataKey,
    dataPath: parentList ? `${parentList.itemAlias}.${dataKey}` : dataKey,
    itemAlias,
    indexAlias,
    wxKey: 'id',
    wrapper: 'element',
    matchType: group.matchType,
    confidence: group.matchType === 'component-key' ? 'high' : 'medium',
    parentListId: parentList ? parentList.id : null,
    fields,
  };
}

// ============ 文本字段提取（可跳过若干子树） ============

function collectTextFields(
  prototype: ProcessedNodeLike,
  skipSubtrees: Set<string>,
): ListTextField[] {
  const fields: ListTextField[] = [];
  const used = new Set<string>();
  let fallback = 0;
  const walk = (node: ProcessedNodeLike) => {
    if (skipSubtrees.has(node.id)) return;
    if (node.originalType === 'TEXT') {
      let name = slugCamel(node.name);
      if (!name) name = `text${++fallback}`;
      if (used.has(name)) name = `${name}${++fallback}`;
      used.add(name);
      fields.push({ name, sample: node.textContent ?? '' });
      return;
    }
    for (const c of node.children ?? []) walk(c);
  };
  walk(prototype);
  return fields;
}

// ============ placeholder 行数据 ============

function buildRows(
  ctx: InternalCtx,
  list: ListBinding,
  itemRoots: ProcessedNodeLike[],
): Array<Record<string, unknown>> {
  if (itemRoots.length === 0) return [];
  // 该列表原型内嵌套的列表（container=原型卡片内的 Tag Row 容器）
  const childLists = ctx.lists.filter((l) => l.parentListId === list.id);
  const nestedContainers = childLists.map((cl) => {
    const cNode = ctx.byId.get(cl.containerId)!;
    return { list: cl, name: cNode.name, sig: structureSignature(cNode) };
  });
  const skipIds = new Set(nestedContainers.map((x) => x.list.containerId));
  const fieldDefs = collectTextFields(itemRoots[0]!, skipIds);

  return itemRoots.map((itemRoot, i) => {
    const row: Record<string, unknown> = { id: `item-${i}` };
    // 文本字段：按 DFS 顺序与原型对齐（跳过嵌套列表子树）
    const texts: string[] = [];
    const readTexts = (node: ProcessedNodeLike) => {
      if (skipIds.has(node.id)) return;
      if (node.originalType === 'TEXT') {
        texts.push(node.textContent ?? '');
        return;
      }
      for (const c of node.children ?? []) readTexts(c);
    };
    readTexts(itemRoot);
    fieldDefs.forEach((f, idx) => {
      row[f.name] = texts[idx] ?? '';
    });

    // 嵌套列表：在本 item 内按"同名同构"找对应容器
    for (const nc of nestedContainers) {
      let matched: ProcessedNodeLike | null = null;
      const find = (node: ProcessedNodeLike): void => {
        if (matched) return;
        if (node.id !== itemRoot.id && node.name === nc.name && structureSignature(node) === nc.sig) {
          matched = node;
          return;
        }
        for (const c of node.children ?? []) find(c);
      };
      find(itemRoot);
      // 在该 item 内重新检测同型重复组（跨 item 结构一致，结果与原型一致）
      const members = matched
        ? detectGroups(ctx, matched)
            .filter((g) => g.matchType === nc.list.matchType)
            .flatMap((g) => g.members)
        : [];
      row[nc.list.dataKey] = buildRows(ctx, nc.list, members);
    }
    return row;
  });
}

// ============ 条件建议 ============

const NAME_SIGNALS: Array<{ re: RegExp; signal: ConditionSignal; reason: string }> = [
  { re: /modal|dialog/i, signal: 'name:modal', reason: '名称含 modal/dialog，疑似弹层显隐' },
  { re: /tooltip|popover/i, signal: 'name:tooltip', reason: '名称含 tooltip/popover，疑似气泡显隐' },
  { re: /drawer/i, signal: 'name:drawer', reason: '名称含 drawer，疑似抽屉显隐' },
  { re: /toast/i, signal: 'name:toast', reason: '名称含 toast，疑似轻提示显隐' },
  { re: /(^|[^a-z])tab([^a-z]|$)/i, signal: 'name:tab', reason: '名称含 tab，疑似页签切换显隐' },
];

function collectSuggestions(ctx: InternalCtx, root: ProcessedNodeLike): void {
  const walk = (node: ProcessedNodeLike) => {
    for (const { re, signal, reason } of NAME_SIGNALS) {
      if (re.test(node.name)) {
        ctx.suggestions.push({
          nodeId: node.id,
          signal,
          suggestedDataKey: `show${pascal(node.name) || 'Block'}`,
          reason,
        });
        break; // 一个节点只取第一个命中的名称信号
      }
    }
    if (node.visible === false) {
      ctx.suggestions.push({
        nodeId: node.id,
        signal: 'prototype-visibility',
        suggestedDataKey: `show${pascal(node.name) || 'Block'}`,
        reason: '原型中该节点不可见，疑似受状态控制的显隐节点',
      });
    }
    for (const c of node.children ?? []) walk(c);
  };
  walk(root);
}

// ============ 显式条件 ============

function resolveExplicitConditions(
  ctx: InternalCtx,
  inputs: ExplicitConditionInput[],
): ConditionBinding[] {
  const out: ConditionBinding[] = [];

  // 分组
  const groups = new Map<string, ExplicitConditionInput[]>();
  const standalone: ExplicitConditionInput[] = [];
  for (const input of inputs) {
    if (input.groupId) {
      const arr = groups.get(input.groupId) ?? [];
      arr.push(input);
      groups.set(input.groupId, arr);
    } else {
      standalone.push(input);
    }
  }

  for (const input of standalone) {
    const node = ctx.byId.get(input.nodeId);
    if (!node) {
      ctx.warnings.push({ code: 'FDT-INFER-COND-NODE-NOT-FOUND', message: `显式条件节点不存在: ${input.nodeId}` });
      continue;
    }
    const directive = input.directive === 'hidden' ? 'hidden' : 'wx:if';
    if (typeof input.expression !== 'string' || input.expression.trim() === '') {
      ctx.warnings.push({
        code: 'FDT-INFER-COND-EXPR-REQUIRED',
        message: `节点 ${input.nodeId} 的显式条件缺少表达式`,
      });
      continue;
    }
    out.push({
      nodeId: input.nodeId,
      groupId: null,
      branch: 'standalone',
      directive,
      expression: input.expression,
      wrapper: 'element',
      source: 'explicit',
    });
  }

  for (const [groupId, members] of groups) {
    const resolved = members.filter((m) => {
      if (!ctx.byId.has(m.nodeId)) {
        ctx.warnings.push({
          code: 'FDT-INFER-COND-NODE-NOT-FOUND',
          message: `显式条件节点不存在: ${m.nodeId}`,
        });
        return false;
      }
      return true;
    });
    if (resolved.length === 0) continue;

    // 同一父级校验
    const parents = new Set(resolved.map((m) => ctx.parent.get(m.nodeId) ?? null));
    if (parents.size !== 1) {
      ctx.warnings.push({
        code: 'FDT-INFER-COND-GROUP-PARENT',
        message: `条件组 ${groupId} 的节点不在同一父级，拒绝组成 elif 链`,
      });
      continue;
    }

    const ordered = [...resolved].sort(
      (a, b) => ctx.dfsOrder.get(a.nodeId)! - ctx.dfsOrder.get(b.nodeId)!,
    );
    const elseMembers = ordered.filter((m) => m.isElse);
    if (elseMembers.length > 1) {
      ctx.warnings.push({
        code: 'FDT-INFER-COND-DUP-ELSE',
        message: `条件组 ${groupId} 存在多个 else 分支`,
      });
      continue;
    }
    const elseMember = elseMembers[0];
    if (elseMember && typeof elseMember.expression === 'string' && elseMember.expression.trim() !== '') {
      ctx.warnings.push({
        code: 'FDT-INFER-COND-ELSE-EXPRESSION',
        message: `条件组 ${groupId} 的 else 分支不允许带表达式`,
      });
      continue;
    }
    const branches = ordered.filter((m) => m !== elseMember);
    if (branches.some((m) => typeof m.expression !== 'string' || m.expression.trim() === '')) {
      ctx.warnings.push({
        code: 'FDT-INFER-COND-EXPR-REQUIRED',
        message: `条件组 ${groupId} 的 if/elif 分支缺少表达式`,
      });
      continue;
    }

    branches.forEach((m, idx) => {
      out.push({
        nodeId: m.nodeId,
        groupId,
        branch: idx === 0 ? 'if' : 'elif',
        directive: idx === 0 ? 'wx:if' : 'wx:elif',
        expression: m.expression!,
        wrapper: 'element',
        source: 'explicit',
      });
    });
    if (elseMember) {
      out.push({
        nodeId: elseMember.nodeId,
        groupId,
        branch: 'else',
        directive: 'wx:else',
        expression: null,
        wrapper: 'element',
        source: 'explicit',
      });
    }
  }

  return out;
}

// ============ block 安全 ============

/**
 * <block> 只是无样式的逻辑包裹：承载 wx:if/wx:for 等指令时一旦携带 class/style
 * 即视为样式泄漏，立即抛错（P0-12 生成 block 前强制调用）。
 */
export function assertBlockHasNoStyle(attrs: Record<string, string | null | undefined>): void {
  if (attrs.class || attrs.style) {
    throw new Error('<block> 仅可承载控制指令，禁止携带 class/style（样式泄漏）');
  }
}
