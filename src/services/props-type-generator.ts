/**
 * Component Properties → TS Props 推导服务（v1.4.18 新增，T10）
 *
 * 数据链路：
 * Figma REST 的 `componentPropertyDefinitions`（COMPONENT/COMPONENT_SET）或
 * `componentProperties`（INSTANCE，键名带 #nodeId 后缀）
 *   → {@link extractComponentProperties} 归一化为 ProcessedComponentProperty[]
 *   → {@link generateReactPropsInterface} / {@link generateVue3Props} 产出框架 Props 代码。
 *
 * 类型映射（spec AC-08）：
 * - TEXT          → string（有默认值则可选 + JSDoc @default）；
 * - BOOLEAN       → boolean；
 * - VARIANT       → 字符串字面量联合（无默认值时必填）；
 * - INSTANCE_SWAP → React.ReactNode / Vue Component。
 *
 * 无任何 Component Properties 时 React 返回空串，由调用方决定不输出 interface
 *（TR-10.3：禁止生成空 interface）。
 *
 * @module services/props-type-generator
 */

import type { FigmaComponentPropertyType, FigmaNode } from '../types.js';
import type { ProcessedComponentProperty } from '../types/nodes.js';

/**
 * 从原始节点提取并归一化 Component Properties。
 *
 * COMPONENT/COMPONENT_SET 使用 componentPropertyDefinitions（含变体全集）；
 * INSTANCE 使用 componentProperties 当前值（剥离 #nodeId 后缀）。
 *
 * @param node - Figma 原始节点
 * @returns 归一化属性列表（保序，propName 组件内唯一）；无属性返回空数组
 */
export function extractComponentProperties(node: Pick<FigmaNode, 'componentPropertyDefinitions' | 'componentProperties'>): ProcessedComponentProperty[] {
  const definitions = node.componentPropertyDefinitions;
  const instances = node.componentProperties;

  /** 已占用 propName（重名追加数字后缀） */
  const usedNames = new Set<string>();
  const reserveName = (base: string): string => {
    let name = base;
    let suffix = 2;
    while (usedNames.has(name)) {
      name = `${base}${suffix}`;
      suffix += 1;
    }
    usedNames.add(name);
    return name;
  };

  const result: ProcessedComponentProperty[] = [];

  if (definitions) {
    for (const [rawName, def] of Object.entries(definitions)) {
      // INSTANCE_SWAP 的空串表示「未指定交换目标」：属性保持可选且不产默认值；
      // VARIANT 的空串表示「无默认变体」：属性必填
      const hasDefault =
        def.type === 'INSTANCE_SWAP' ? def.defaultValue !== '' : !(def.type === 'VARIANT' && def.defaultValue === '');
      result.push({
        name: rawName,
        propName: reserveName(toPropName(rawName)),
        type: def.type,
        required: def.type === 'INSTANCE_SWAP' ? false : !hasDefault,
        defaultValue: hasDefault ? def.defaultValue : undefined,
        variantOptions: def.variantOptions ? [...def.variantOptions] : undefined,
        preferredComponentKeys: def.preferredValues?.map((v) => v.key),
      });
    }
    return result;
  }

  if (instances) {
    for (const [rawKey, prop] of Object.entries(instances)) {
      // INSTANCE 键形如 'Label#12:3'，剥离首个 '#' 起的后缀
      const rawName = rawKey.includes('#') ? rawKey.slice(0, rawKey.indexOf('#')) : rawKey;
      const hasValue = !(prop.type === 'VARIANT' && prop.value === '');
      result.push({
        name: rawName,
        propName: reserveName(toPropName(rawName)),
        type: prop.type,
        required: false,
        // INSTANCE_SWAP 的值是目标节点 id，无法在生成代码中还原为 ReactNode 默认值
        defaultValue: prop.type === 'INSTANCE_SWAP' ? undefined : hasValue ? prop.value : undefined,
        preferredComponentKeys: undefined,
      });
    }
  }

  return result;
}

/**
 * 生成 React Props interface 代码块。
 *
 * @param componentName - 组件名（PascalCase，用于 XProps 命名）
 * @param props - 归一化属性列表
 * @returns interface 代码块；props 为空时返回空字符串（TR-10.3）
 */
export function generateReactPropsInterface(componentName: string, props: readonly ProcessedComponentProperty[]): string {
  if (props.length === 0) return '';

  const lines: string[] = [];
  lines.push(`export interface ${componentName}Props extends React.HTMLAttributes<HTMLElement> {`);
  for (const prop of props) {
    lines.push(...toJsDocLines(prop).map((line) => `  ${line}`));
    lines.push(`  ${prop.propName}${prop.required ? '' : '?'}: ${toReactType(prop)};`);
  }
  lines.push('}');
  return lines.join('\n');
}

/** Vue3 Props 生成结果 */
export interface GeneratedVue3Props {
  /** TS 模式的 `interface Props {...}` 块（含 class 契约）；非 TS 模式为空串 */
  readonly interfaceBlock: string;
  /** TS 模式的 withDefaults 入参对象行（不含 withDefaults 包装）；无默认值时为空串 */
  readonly withDefaultsEntries: readonly string[];
  /** 非 TS 模式的运行时 defineProps 对象成员行；TS 模式为空串 */
  readonly runtimeEntries: readonly string[];
  /** 是否需要 `import type { Component } from 'vue'`（存在 INSTANCE_SWAP 时） */
  readonly needsComponentImport: boolean;
}

/**
 * 生成 Vue3 Props 声明片段（script setup 内）。
 *
 * @param props - 归一化属性列表
 * @param options - typescript 决定输出类型声明还是运行时声明
 * @returns interface/withDefaults/runtime 片段
 */
export function generateVue3Props(
  props: readonly ProcessedComponentProperty[],
  options: { typescript: boolean },
): GeneratedVue3Props {
  const needsComponentImport = props.some((prop) => prop.type === 'INSTANCE_SWAP');

  if (!options.typescript) {
    const runtimeEntries: string[] = [];
    for (const prop of props) {
      const runtimeType =
        prop.type === 'BOOLEAN' ? 'Boolean' : prop.type === 'INSTANCE_SWAP' ? 'Object' : 'String';
      const defaultPart =
        prop.defaultValue === undefined
          ? ''
          : prop.type === 'BOOLEAN'
            ? `, default: ${String(prop.defaultValue)}`
            : `, default: ${JSON.stringify(prop.defaultValue)}`;
      runtimeEntries.push(`${prop.propName}: { type: ${runtimeType}${defaultPart} },`);
    }
    return { interfaceBlock: '', withDefaultsEntries: [], runtimeEntries, needsComponentImport };
  }

  const interfaceLines: string[] = ['interface Props {', '  /** 透传的根节点 class */', '  class?: string;'];
  const defaultsEntries: string[] = ["class: ''"];

  for (const prop of props) {
    interfaceLines.push(...toJsDocLines(prop).map((line) => `  ${line}`));
    interfaceLines.push(`  ${prop.propName}${prop.required ? '' : '?'}: ${toVue3Type(prop)};`);
    if (prop.defaultValue !== undefined && prop.type !== 'INSTANCE_SWAP') {
      defaultsEntries.push(
        prop.type === 'BOOLEAN'
          ? `${prop.propName}: ${String(prop.defaultValue)}`
          : `${prop.propName}: ${toTsStringLiteral(String(prop.defaultValue))}`,
      );
    }
  }
  interfaceLines.push('}');

  return {
    interfaceBlock: interfaceLines.join('\n'),
    withDefaultsEntries: defaultsEntries,
    runtimeEntries: [],
    needsComponentImport,
  };
}

// ============ 内部工具 ============

/**
 * Figma 属性名 → 合法 camelCase TS 标识符。
 *
 * - 剥离 INSTANCE 的 `#id` 后缀（调用方已剥离，此处防御）；
 * - 非字母数字切词后 camelCase；
 * - 数字开头加 `prop` 前缀；无有效字符回退 `prop`。
 *
 * @param rawName - Figma 原始属性名
 * @returns 合法 camelCase 标识符
 */
function toPropName(rawName: string): string {
  const base = rawName.includes('#') ? rawName.slice(0, rawName.indexOf('#')) : rawName;
  const words = base.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (words.length === 0) return 'prop';
  const camel = words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index === 0) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
  if (/^[0-9]/.test(camel)) return `prop${camel}`;
  return camel;
}

/**
 * 净化嵌入 JSDoc 注释的自由文本（v1.4.18 安全加固）。
 *
 * 属性显示名 / 默认值 / 可交换 key 均来自 Figma 文件作者可控的任意字符串，
 * 必须防止 `*/` 提前闭合块注释进而向生成的 .tsx/.vue 注入代码，同时折叠
 * 换行与其它控制字符，避免注释结构被破坏。
 *
 * @param text - 原始文本
 * @returns 可安全放入 `/** ... *\/` 内的单行文本
 */
function sanitizeForJsDoc(text: string): string {
  return text
    .replace(/\*\//g, '* /')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim();
}

/**
 * 单属性的 JSDoc 行（含起止符）。
 *
 * @param prop - 归一化属性
 * @returns `/** ... *\/` 行数组（不含外层缩进）
 */
function toJsDocLines(prop: ProcessedComponentProperty): string[] {
  const typeLabel: Record<FigmaComponentPropertyType, string> = {
    TEXT: 'TEXT 文本属性',
    BOOLEAN: 'BOOLEAN 开关属性',
    VARIANT: 'VARIANT 变体属性',
    INSTANCE_SWAP: 'INSTANCE_SWAP 可交换组件',
  };
  const lines = [`/** ${sanitizeForJsDoc(prop.name)} —— Figma ${typeLabel[prop.type]}`];
  if (prop.defaultValue !== undefined) {
    const rendered = prop.type === 'BOOLEAN' ? String(prop.defaultValue) : JSON.stringify(prop.defaultValue);
    lines[0] += `。@default ${sanitizeForJsDoc(rendered)}`;
  }
  if (prop.type === 'INSTANCE_SWAP' && prop.preferredComponentKeys && prop.preferredComponentKeys.length > 0) {
    lines[0] += `。可交换 key：${sanitizeForJsDoc(prop.preferredComponentKeys.join(', '))}`;
  }
  lines[0] += ' */';
  return lines;
}

/**
 * 属性的 React TS 类型表达式。
 *
 * @param prop - 归一化属性
 * @returns 类型表达式
 */
function toReactType(prop: ProcessedComponentProperty): string {
  switch (prop.type) {
    case 'TEXT':
      return 'string';
    case 'BOOLEAN':
      return 'boolean';
    case 'VARIANT':
      return toVariantUnion(prop);
    case 'INSTANCE_SWAP':
      return 'React.ReactNode';
  }
}

/**
 * 属性的 Vue3 TS 类型表达式。
 *
 * @param prop - 归一化属性
 * @returns 类型表达式
 */
function toVue3Type(prop: ProcessedComponentProperty): string {
  switch (prop.type) {
    case 'TEXT':
      return 'string';
    case 'BOOLEAN':
      return 'boolean';
    case 'VARIANT':
      return toVariantUnion(prop);
    case 'INSTANCE_SWAP':
      return 'Component';
  }
}

/**
 * VARIANT → 字符串字面量联合；实例场景缺 variantOptions 时收窄为当前值单字面量。
 *
 * 单引号风格与仓库 prettier singleQuote 配置一致。
 *
 * @param prop - 归一化 VARIANT 属性
 * @returns 如 `'small' | 'medium' | 'large'`
 */
function toVariantUnion(prop: ProcessedComponentProperty): string {
  const options =
    prop.variantOptions && prop.variantOptions.length > 0
      ? prop.variantOptions
      : typeof prop.defaultValue === 'string'
        ? [prop.defaultValue]
        : [];
  return options.map((option) => toTsStringLiteral(option)).join(' | ') || 'string';
}

/**
 * 生成单引号 TS 字符串字面量（转义反斜杠与单引号）。
 *
 * @param value - 原始字符串
 * @returns 如 `'medium'`
 */
function toTsStringLiteral(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
