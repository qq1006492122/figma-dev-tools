/**
 * 框架导入自动整理 - Framework Import Organizer（v1.4.18 新增，T5）
 *
 * 在 Prettier 格式化之前，对代码生成产物的 React/Vue 框架导入做**基于实际
 * 使用情况**的权威整理：
 *
 * 1. 缺失补齐：产物代码体使用了白名单内 hooks/API 但未导入 → 自动补上；
 * 2. 多余移除：导入了白名单成员但代码体未使用 → 剔除（未使用导入零容忍）；
 * 3. 去重合并：同一模块的多条 import（含多行花括号写法）合并为单行；
 * 4. 字母序排列、default/namespace/非白名单 named 安全保留；
 * 5. 全流程幂等：对自身输出再次整理结果逐字节不变。
 *
 * Vue 侧仅处理 SFC 的 `<script>` 区段：template 上的 `ref="..."` 是元素
 * 引用属性而非 `ref()` API，扫描 template 会造成误报；`defineProps`、
 * `defineEmits`、`withDefaults` 等是 `<script setup>` 编译器宏，无需也不允许
 * 从 'vue' 导入，因此不进入白名单。
 *
 * 纯函数、零 I/O、零第三方依赖，可在 Prettier 之前直接调用。
 *
 * @module
 */

// ============ 公共类型 ============

/** 支持自动整理的框架标识 */
export type FrameworkKind = 'react' | 'vue';

/** organizeFrameworkImports 选项 */
export interface OrganizeImportsOptions {
  /** 目标框架（决定模块名、白名单、default 导入策略） */
  framework: FrameworkKind;
}

// ============ 可扩展白名单 ============

/**
 * React Hooks 白名单（React 18）。
 *
 * 仅这些 named 成员会参与「使用检测 → 自动增删」；白名单外的 named 导入
 * （如 `type FC`）一律原样保留，避免误删用户/生成器的其他依赖。
 * 需要支持新 hooks 时直接扩展此数组（已冻结防运行时篡改）。
 */
export const REACT_HOOK_WHITELIST: readonly string[] = Object.freeze([
  'useState',
  'useEffect',
  'useRef',
  'useMemo',
  'useCallback',
  'useContext',
  'useReducer',
  'useLayoutEffect',
  'useImperativeHandle',
  'useDebugValue',
  'useId',
  'useTransition',
  'useDeferredValue',
  'useSyncExternalStore',
  'useInsertionEffect',
]);

/**
 * Vue 3 Composition API 白名单。
 *
 * 刻意不含 `<script setup>` 编译器宏：defineProps / defineEmits /
 * defineExpose / defineOptions / defineSlots / defineModel / withDefaults。
 */
export const VUE_API_WHITELIST: readonly string[] = Object.freeze([
  'ref',
  'shallowRef',
  'customRef',
  'triggerRef',
  'reactive',
  'readonly',
  'computed',
  'watch',
  'watchEffect',
  'watchPostEffect',
  'watchSyncEffect',
  'onBeforeMount',
  'onMounted',
  'onBeforeUpdate',
  'onUpdated',
  'onBeforeUnmount',
  'onUnmounted',
  'onErrorCaptured',
  'onActivated',
  'onDeactivated',
  'onServerPrefetch',
  'provide',
  'inject',
  'nextTick',
  'toRef',
  'toRefs',
  'unref',
  'isRef',
  'isReactive',
  'isReadonly',
  'isProxy',
  'defineAsyncComponent',
  'markRaw',
  'getCurrentInstance',
  'useSlots',
  'useAttrs',
  'useCssModule',
  'useCssVars',
]);

// ============ 内部规格 ============

/** 单框架整理规则 */
interface FrameworkSpec {
  /** 模块说明符（import ... from '<module>'） */
  module: 'react' | 'vue';
  /** named 成员使用检测白名单 */
  whitelist: readonly string[];
  /** 是否存在 default 导入概念（React 有，Vue 无） */
  supportsDefault: boolean;
  /** supportsDefault 时，代码体使用该裸标识符则补 default 导入 */
  defaultIdentifier: string | null;
}

/** 框架 → 规则映射 */
const FRAMEWORK_SPECS: Record<FrameworkKind, FrameworkSpec> = {
  react: {
    module: 'react',
    whitelist: REACT_HOOK_WHITELIST,
    supportsDefault: true,
    defaultIdentifier: 'React',
  },
  vue: {
    module: 'vue',
    whitelist: VUE_API_WHITELIST,
    supportsDefault: false,
    defaultIdentifier: null,
  },
};

// ============ 词法扫描工具 ============

/**
 * 一次性匹配注释与字符串字面量的 token 正则。
 *
 * 使用单个 alternation 从当前位置优先匹配，保证字符串内的 `//` 不会被
 * 误判为行注释（如 'http://...'）。匹配组依次为：块注释 / 行注释 /
 * 模板串 / 单引号串 / 双引号串。
 */
const COMMENT_OR_STRING_RE =
  /(\/\*[\s\S]*?\*\/)|(\/\/[^\n]*)|(`(?:\\.|[^`\\])*`)|('(?:\\.|[^'\\\n])*')|("(?:\\.|[^"\\\n])*")/g;

/**
 * 匹配任意 ES 模块 import 语句（覆盖多行花括号与 side-effect import）。
 *
 * named 块内不可能出现 `from '...'`，故非贪婪匹配到最近模块说明符是安全的。
 */
const ANY_IMPORT_RE =
  /^[ \t]*import\b[\s\S]*?from\s*['"][^'"]+['"][ \t]*;?[ \t]*(?:\r\n|\r|\n|$)|^[ \t]*import\s+['"][^'"]+['"][ \t]*;?[ \t]*(?:\r\n|\r|\n|$)/gm;

/**
 * 将注释与字符串替换为等长空白（保留换行），避免误报使用。
 *
 * @param code - 原始代码
 * @returns 仅保留代码结构、字面量内容被空白替换的等长字符串
 */
function blankCommentsAndStrings(code: string): string {
  return code.replace(COMMENT_OR_STRING_RE, (token) => token.replace(/[^\r\n]/g, ' '));
}

/**
 * 将所有 import 语句替换为等长空白（保留换行），使使用扫描不受
 * 其他模块同名导出（如 `import { useState } from './shims'`）干扰。
 *
 * @param code - 原始代码
 * @returns import 语句被空白替换后的等长字符串
 */
function blankImportStatements(code: string): string {
  return code.replace(ANY_IMPORT_RE, (token) => token.replace(/[^\r\n]/g, ' '));
}

/**
 * 转义正则特殊字符（白名单名理论上无特殊字符，防御性处理）。
 *
 * @param value - 待转义字符串
 * @returns 可安全嵌入 RegExp 的字符串
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 判断标识符在代码体中是否被**实际使用**。
 *
 * 前置负向 `[\w$.]` 同时排除：
 * - 标识符前后缀（如 `myUseState`）；
 * - 属性访问（如 `React.useState`，此时不应补 named 导入）。
 *
 * @param body - 已经过注释/字符串/import 空白化处理的代码体
 * @param name - 标识符名
 * @returns 是否存在至少一处真实使用
 */
function isIdentifierUsed(body: string, name: string): boolean {
  const re = new RegExp(`(?<![\\w$.])${escapeRegExp(name)}(?![\\w$])`, 'g');
  return re.test(body);
}

// ============ import 语句解析 ============

/** 单条目标模块 import 的解析结果 */
interface ParsedModuleImport {
  /** default 导入的本地名（如 React），无则 null */
  defaultName: string | null;
  /** namespace 导入的本地名（`import * as X`），无则 null */
  namespaceName: string | null;
  /** named 导入的原始片段（保留 `type ` 前缀与原有写法） */
  namedSpecifiers: string[];
}

/**
 * 从单条 import 语句文本中解析 default / namespace / named 三类成员。
 *
 * @param text - import 语句原文（可为多行花括号形态）
 * @returns 解析结果
 */
function parseModuleImport(text: string): ParsedModuleImport {
  let namespaceName: string | null = null;
  const namespaceMatch = text.match(/\*\s*as\s+([A-Za-z_$][\w$]*)/);
  if (namespaceMatch?.[1]) {
    namespaceName = namespaceMatch[1];
  }

  const namedSpecifiers: string[] = [];
  const namedMatch = text.match(/\{([\s\S]*?)\}/);
  // 语句级 `import type { ... }`：重建时给每个成员补 `type ` 前缀，
  // 避免被降级为值导入（specifierKey 会剥离该前缀用于比对/排序）
  const isStatementLevelType = /^\s*import\s+type\b/.test(text);
  if (namedMatch?.[1]) {
    for (const raw of namedMatch[1].split(',')) {
      const specifier = raw.trim();
      if (specifier.length > 0) {
        namedSpecifiers.push(isStatementLevelType && !specifier.startsWith('type ') ? `type ${specifier}` : specifier);
      }
    }
  }

  // default 检测：先移除 {} 块与 *as 子句，再剥离语句级 `import type`
  // 关键字（否则 `import type { X }` 的 type 会被误判为 default 导入），
  // 最后匹配 `import <Ident>(,| from)`
  let defaultName: string | null = null;
  const withoutNamed = text
    .replace(/\{[\s\S]*?\}/, '')
    .replace(/\*\s*as\s+[A-Za-z_$][\w$]*/, '')
    .replace(/^import\s+type\b/, 'import');
  const defaultMatch = withoutNamed.match(/import\s+([A-Za-z_$][\w$]*)\s*(?:,|\s+from\b)/);
  if (defaultMatch?.[1]) {
    defaultName = defaultMatch[1];
  }

  return { defaultName, namespaceName, namedSpecifiers };
}

/**
 * 去掉 named 片段上的 `type ` 前缀，取其裸标识符用于白名单比对与排序。
 *
 * @param specifier - 原始 named 片段（如 `type FC` 或 `useState as foo`）
 * @returns 用于排序/比对的键名
 */
function specifierKey(specifier: string): string {
  const withoutType = specifier.replace(/^type\s+/, '').trim();
  // `useState as foo` 形态以本地别名 foo 为准（实际代码中使用的是别名）
  const asMatch = withoutType.match(/\s+as\s+([A-Za-z_$][\w$]*)$/);
  return asMatch?.[1] ?? withoutType;
}

/** ASCII 升序比较（大写字母排在小写前） */
function compareAscii(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ============ 核心整理（作用于单个 TS/JS 代码段） ============

/**
 * 对单个代码段执行目标框架的 import 整理。
 *
 * @param code - TS/JS 代码段（React 为整文件；Vue 为单个 script 块内容）
 * @param spec - 框架规则
 * @returns 整理后的代码段
 */
function organizeSegment(code: string, spec: FrameworkSpec): string {
  // 1. 找出目标模块的全部 import 语句
  const targetImportRe = new RegExp(`import\\b[\\s\\S]*?from\\s*['"]${spec.module}['"][ \\t]*;?`, 'g');
  const found: Array<{ start: number; end: number; text: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = targetImportRe.exec(code)) !== null) {
    found.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
  }

  // 2. 汇总既有导入信息
  let defaultName: string | null = null;
  let namespaceName: string | null = null;
  /** named 裸键 → 原始片段（同键多写时优先保留 type 形态） */
  const namedByKey = new Map<string, string>();

  for (const item of found) {
    const parsed = parseModuleImport(item.text);
    if (parsed.defaultName && defaultName === null) {
      defaultName = parsed.defaultName;
    }
    if (parsed.namespaceName && namespaceName === null) {
      namespaceName = parsed.namespaceName;
    }
    for (const specifier of parsed.namedSpecifiers) {
      const key = specifierKey(specifier);
      const previous = namedByKey.get(key);
      if (!previous || (!previous.startsWith('type ') && specifier.startsWith('type '))) {
        namedByKey.set(key, specifier);
      }
    }
  }

  // 3. 摘除目标模块 import（按整行范围，含多行花括号块），记录最早锚点
  /** 被删除行范围（start/end 为含换行的半开区间） */
  const removedRanges: Array<{ start: number; end: number }> = [];
  for (const item of found) {
    const lineStart = code.lastIndexOf('\n', item.start) + 1;
    let lineEnd = code.indexOf('\n', item.end);
    if (lineEnd === -1) {
      lineEnd = code.length;
    } else {
      lineEnd += 1; // 连同行尾换行一并删除
    }
    removedRanges.push({ start: lineStart, end: lineEnd });
  }
  removedRanges.sort((a, b) => a.start - b.start);
  // 相邻被删行去重/合并（从后往前删除）
  let work = code;
  for (let i = removedRanges.length - 1; i >= 0; i--) {
    const range = removedRanges[i];
    if (range) {
      work = work.slice(0, range.start) + work.slice(range.end);
    }
  }
  const anchor = removedRanges[0]?.start ?? null;

  // 4. 基于「去注释/字符串/import」的代码体做使用扫描
  const scanBody = blankCommentsAndStrings(blankImportStatements(work));

  /** 最终保留的 named 片段（白名单按使用裁剪，非白名单原样保留） */
  const finalSpecifiers: string[] = [];
  for (const [key, raw] of namedByKey) {
    if (spec.whitelist.includes(key)) {
      if (isIdentifierUsed(scanBody, key)) {
        finalSpecifiers.push(raw);
      }
    } else {
      finalSpecifiers.push(raw);
    }
  }
  // 白名单中已使用但缺失的成员 → 补齐
  for (const name of spec.whitelist) {
    if (!namedByKey.has(name) && isIdentifierUsed(scanBody, name)) {
      finalSpecifiers.push(name);
    }
  }
  finalSpecifiers.sort((a, b) => compareAscii(specifierKey(a), specifierKey(b)));

  // 5. default 决策：既有显式 default 保留；无 default 且无 namespace 时，
  //    代码体使用 defaultIdentifier（如 React.FC）才补
  let keepDefault = defaultName !== null;
  if (
    !keepDefault &&
    namespaceName === null &&
    spec.supportsDefault &&
    spec.defaultIdentifier &&
    isIdentifierUsed(scanBody, spec.defaultIdentifier)
  ) {
    defaultName = spec.defaultIdentifier;
    keepDefault = true;
  }

  // 6. 组装规范语句（统一单引号；后续 Prettier 会按项目配置翻转引号风格）
  /** 待插入行（不含换行） */
  const linesToInsert: string[] = [];
  if (finalSpecifiers.length > 0) {
    const namedPart = `{ ${finalSpecifiers.join(', ')} }`;
    const prefix = keepDefault && defaultName ? `${defaultName}, ` : '';
    linesToInsert.push(`import ${prefix}${namedPart} from '${spec.module}';`);
  } else if (keepDefault && defaultName) {
    linesToInsert.push(`import ${defaultName} from '${spec.module}';`);
  }
  // namespace 与 named 不能共存于同一语句，namespace 行原样独立保留
  if (namespaceName !== null) {
    linesToInsert.unshift(`import * as ${namespaceName} from '${spec.module}';`);
  }

  // 7. 插入回代码：优先原最早 import 位置；否则首个其他 import 前；否则段首
  if (linesToInsert.length === 0) {
    return work;
  }
  const insertion = linesToInsert.join('\n') + '\n';
  if (anchor !== null) {
    return work.slice(0, anchor) + insertion + work.slice(anchor);
  }
  const otherImportMatch = /^[ \t]*import\b/m.exec(work);
  if (otherImportMatch) {
    const pos = otherImportMatch.index;
    return work.slice(0, pos) + insertion + work.slice(pos);
  }
  return insertion + work;
}

/**
 * 匹配 SFC 首个 script 块（setup 或普通 script 均覆盖）。
 */
const SCRIPT_BLOCK_RE = /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/;

// ============ 公共入口 ============

/**
 * 整理代码产物中的 React/Vue 框架导入（幂等纯函数）。
 *
 * - `framework: 'react'`：处理整份 TS/JS（TSX）代码的 `'react'` 导入；
 * - `framework: 'vue'`：仅处理 SFC 的 `<script>` 区段，template 原样保留；
 *   无 script 块时原样返回。
 *
 * @param code - 生成器产物原文
 * @param options - framework 必选
 * @returns 整理后的代码（再经 Prettier 格式化）
 */
export function organizeFrameworkImports(code: string, options: OrganizeImportsOptions): string {
  const spec = FRAMEWORK_SPECS[options.framework];

  if (options.framework === 'vue') {
    const scriptMatch = SCRIPT_BLOCK_RE.exec(code);
    if (!scriptMatch || scriptMatch.index === undefined) {
      // template-only SFC：无需整理
      return code;
    }
    const openTag = scriptMatch[1];
    const body = scriptMatch[2];
    const closeTag = scriptMatch[3];
    if (openTag === undefined || body === undefined || closeTag === undefined) {
      return code;
    }
    const organizedBody = organizeSegment(body, spec);
    return code.slice(0, scriptMatch.index) + openTag + organizedBody + closeTag + code.slice(scriptMatch.index + scriptMatch[0].length);
  }

  return organizeSegment(code, spec);
}
