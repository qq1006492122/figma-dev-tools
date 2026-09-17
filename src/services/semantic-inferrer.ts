/**
 * 语义推断器 - Semantic Inferrer（v1.4.19 T22）
 *
 * 与 smart-inferrer 同为「只建议、不改写」的增强器，但聚焦语义层：
 *
 * 1. list-data：≥3 个等宽、同形态且含文本后代的重复子节点（卡片/列表行/商品格）
 *    → 建议 TS interface + mock 数组 + React `.map()` / Vue `v-for` 数据驱动示例；
 * 2. name：Frame 12 / Group 3 / 矩形 24 这类无语义命名，当节点具备语义角色或
 *    ASCII 文本标签时建议 PascalCase 名称（与 hierarchy-fixer 协同：纯布局包装层
 *    会被扁平化，不为其建议命名）。
 *
 * 全部输出均标注「示例/advisory」，不修改节点树，也不写入生成产物的可执行代码。
 *
 * @module
 */

import type { Framework } from '../types.js';
import type { ProcessedNode } from '../types/nodes.js';

/** 列表数据字段 */
export interface DataField {
  /** 字段名（camelCase ASCII） */
  readonly name: string;
  /** TS 类型（当前推断 string | number） */
  readonly tsType: 'string' | 'number';
  /** 取自设计稿的样例值（截断后） */
  readonly sample?: string;
}

/** 列表→数据结构建议 */
export interface DataStructureSuggestion {
  /** 固定类别 */
  readonly category: 'list-data';
  /** 列表容器节点 ID */
  readonly nodeId: string;
  /** 列表容器节点名 */
  readonly nodeName: string;
  /** 建议的子项组件名（PascalCase，如 ArticleCard） */
  readonly itemComponentName: string;
  /** 建议的 TS 接口名（如 ArticleCardItem） */
  readonly interfaceName: string;
  /** 重复子项数量 */
  readonly repeatedCount: number;
  /** 推断字段（含 id） */
  readonly fields: readonly DataField[];
  /** TS interface 代码（示例文本） */
  readonly interfaceCode: string;
  /** mock 数据代码（示例文本） */
  readonly mockCode: string;
  /** 框架对应的渲染示例（.map() 或 v-for） */
  readonly renderHint: string;
}

/** 语义命名建议 */
export interface NameSuggestion {
  /** 固定类别 */
  readonly category: 'name';
  /** 节点 ID */
  readonly nodeId: string;
  /** 当前节点名 */
  readonly nodeName: string;
  /** 建议名称（PascalCase ASCII） */
  readonly suggestedName: string;
  /** 建议理由（英文，写入注释） */
  readonly reason: string;
}

/** 语义推断结果 */
export interface SemanticInferenceResult {
  /** 列表数据建议 */
  readonly dataStructures: readonly DataStructureSuggestion[];
  /** 命名建议 */
  readonly nameSuggestions: readonly NameSuggestion[];
  /** 计数 */
  readonly counts: {
    readonly dataStructures: number;
    readonly nameSuggestions: number;
  };
}

/** 无语义的 Figma 默认命名（英文，允许尾号/copy） */
const GENERIC_NAME_EN =
  /^(frame|group|rectangle|ellipse|star|line|polygon|vector|component|instance|wrapper|container|div|span|block|node|layer)([\s_-]*\d+)?(\scopy\d*)?$/i;
/** 无语义的 Figma 默认命名（中文 + 尾号） */
const GENERIC_NAME_ZH = /^(矩形|椭圆|星形|直线|多边形|矢量|分组|群组|框架|组件|实例|容器|图层|节点)([\s\d_-]*|副本\d*)?$/;

/** 数值语义字段（命名命中即判 number） */
const NUMERIC_FIELD_PATTERN = /(^id$|price|amount|count|total|qty|quantity|stock|score|rank|数量|价格|金额|积分|排名)/i;

/** 命名时剥离的容器类噪声词 */
const CONTAINER_NOISE_WORDS = /^(list|lists|row|rows|grid|wrapper|container|wrap|group|groups|items|列表|容器|分组)$/i;

/** 列表判定的最小重复子项数 */
const MIN_REPEATED_CHILDREN = 3;
/** 等宽判定容差（px） */
const UNIFORM_WIDTH_TOLERANCE = 4;
/** 字段/样例最大收集数 */
const MAX_FIELDS = 6;
/** mock 行数 */
const MOCK_ROWS = 3;

/**
 * 从名称提取 ASCII camelCase 词元（剥离 CJK 与符号）
 *
 * @param input - 原始节点名
 * @returns camelCase ASCII 标识；无 ASCII 词时返回 ''
 */
function toCamelAscii(input: string): string {
  return input
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => (index === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join('');
}

/**
 * camelCase → PascalCase
 *
 * @param camel - camelCase 标识
 * @returns PascalCase 标识
 */
function toPascal(camel: string): string {
  return camel ? camel.charAt(0).toUpperCase() + camel.slice(1) : '';
}

/**
 * 转义字符串字面量中的单引号与换行
 *
 * @param value - 原始值
 * @returns 可放入单引号字面量的文本
 */
function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\s+/g, ' ').trim().slice(0, 40)}'`;
}

/** 推断入参 */
export interface SemanticInferrerOptions {
  /** 目标框架（渲染示例按框架区分） */
  framework: Framework;
}

/**
 * 语义推断器（纯树分析、不触网、不改写节点）。
 * 通过工厂 {@link createSemanticInferrer} 创建，实例无状态可复用。
 */
export class SemanticInferrer {
  /**
   * 执行列表数据 + 语义命名推断
   *
   * @param root - 组件根节点
   * @param options - 框架选项
   * @returns 语义推断结果
   */
  infer(root: ProcessedNode, options: SemanticInferrerOptions): SemanticInferenceResult {
    const listCovered = new Set<string>();
    const dataStructures: DataStructureSuggestion[] = [];
    const nameSuggestions: NameSuggestion[] = [];
    const usedNames = new Map<string, number>();

    const visit = (node: ProcessedNode): void => {
      if (node.visible !== false && !listCovered.has(node.id)) {
        const list = this._detectRepeatedList(node, options.framework);
        if (list) {
          dataStructures.push(list);
          // 命中列表后其整棵子树不再重复识别嵌套列表（避免同一列表多层上报）
          this._collectIds(node, listCovered);
        }
      }
      const naming = this._suggestName(node);
      if (naming) {
        // 全树重名去重：重名追加 2/3 序号
        const seen = usedNames.get(naming.suggestedName) ?? 0;
        const next = seen + 1;
        usedNames.set(naming.suggestedName, next);
        const finalName = next === 1 ? naming.suggestedName : `${naming.suggestedName}${next}`;
        nameSuggestions.push({ ...naming, suggestedName: finalName });
      }
      for (const child of node.children ?? []) visit(child);
    };
    visit(root);

    return {
      dataStructures,
      nameSuggestions,
      counts: { dataStructures: dataStructures.length, nameSuggestions: nameSuggestions.length },
    };
  }

  /**
   * 收集子树全部 ID（含自身）
   *
   * @param node - 起始节点
   * @param bucket - 收集集合
   */
  private _collectIds(node: ProcessedNode, bucket: Set<string>): void {
    bucket.add(node.id);
    for (const child of node.children ?? []) this._collectIds(child, bucket);
  }

  /**
   * 判定重复列表并产出数据结构建议
   *
   * @param node - 候选容器
   * @param framework - 目标框架
   * @returns 建议或 undefined
   */
  private _detectRepeatedList(node: ProcessedNode, framework: Framework): DataStructureSuggestion | undefined {
    const children = (node.children ?? []).filter((child) => child.visible !== false);
    if (children.length < MIN_REPEATED_CHILDREN) return undefined;

    // 同形态：originalType 一致（或角色同组）、宽度差 ≤4px、每项至少一个文本后代
    const widths = children
      .map((child) => child.size?.width)
      .filter((width): width is number => typeof width === 'number');
    if (widths.length !== children.length) return undefined;
    const minWidth = Math.min(...widths);
    const maxWidth = Math.max(...widths);
    if (maxWidth - minWidth > UNIFORM_WIDTH_TOLERANCE) return undefined;

    const firstType = children[0]?.originalType;
    const sameType = children.every((child) => child.originalType === firstType);
    if (!sameType) return undefined;

    const textDescendantsPerChild = children.map((child) => this._firstTextNodes(child, MAX_FIELDS));
    if (textDescendantsPerChild.some((texts) => texts.length === 0)) return undefined;

    // 字段以第一个子项为模板（同构列表的字段集应一致）
    const fields = this._buildFields(textDescendantsPerChild[0]!);
    if (fields.length === 0) return undefined;

    const itemComponentName = this._itemComponentName(node, children[0]!);
    const interfaceName = `${itemComponentName}Item`;
    const interfaceCode = this._renderInterface(interfaceName, fields);
    const mockCode = this._renderMock(interfaceName, itemComponentName, fields, children.length);
    const renderHint = this._renderHint(framework, itemComponentName, interfaceName, fields);

    return {
      category: 'list-data',
      nodeId: node.figmaId,
      nodeName: node.name || node.figmaId,
      itemComponentName,
      interfaceName,
      repeatedCount: children.length,
      fields,
      interfaceCode,
      mockCode,
      renderHint,
    };
  }

  /**
   * 取子树内前 N 个文本节点（先序）
   *
   * @param node - 起始节点
   * @param limit - 最大数量
   * @returns 文本节点数组
   */
  private _firstTextNodes(node: ProcessedNode, limit: number): ProcessedNode[] {
    const result: ProcessedNode[] = [];
    const walk = (candidate: ProcessedNode): void => {
      if (result.length >= limit) return;
      if (candidate.role === 'text' || candidate.originalType === 'TEXT') {
        result.push(candidate);
      }
      for (const child of candidate.children ?? []) walk(child);
    };
    walk(node);
    return result;
  }

  /**
   * 以模板子项的文本节点构建字段列表（前置 id，名称去重）
   *
   * @param textNodes - 模板子项内的文本节点
   * @returns 字段列表
   */
  private _buildFields(textNodes: ProcessedNode[]): DataField[] {
    const fields: DataField[] = [{ name: 'id', tsType: 'number' }];
    const usedNames = new Set<string>(['id']);
    const positionalFallback = ['title', 'subtitle', 'meta', 'caption', 'body', 'footer'];

    textNodes.forEach((textNode, index) => {
      const sample = (textNode.textContent ?? '').replace(/\s+/g, ' ').trim();
      let name = toCamelAscii(textNode.name || '');
      if (!name || usedNames.has(name)) {
        const fromSample = toCamelAscii(sample);
        if (fromSample && !usedNames.has(fromSample) && fromSample.length <= 24) {
          name = fromSample;
        } else {
          name = positionalFallback[index] ?? `text${index + 1}`;
        }
      }
      let unique = name;
      let suffix = 2;
      while (usedNames.has(unique)) {
        unique = `${name}${suffix}`;
        suffix += 1;
      }
      usedNames.add(unique);
      const numericByName = NUMERIC_FIELD_PATTERN.test(unique);
      const numericBySample = sample !== '' && /^[¥$€£]?\s?[\d,]+(\.\d+)?$/.test(sample);
      fields.push({
        name: unique,
        tsType: numericByName || numericBySample ? 'number' : 'string',
        sample: sample.slice(0, 40) || undefined,
      });
    });

    return fields;
  }

  /**
   * 推导子项组件名：优先容器名（去 list/grid 等噪声词、去复数 s），退回首子项名
   *
   * @param container - 列表容器
   * @param firstChild - 首个重复子项
   * @returns PascalCase 组件名
   */
  private _itemComponentName(container: ProcessedNode, firstChild: ProcessedNode): string {
    const words = (container.name || '')
      .replace(/[^a-zA-Z0-9]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .filter((word) => !CONTAINER_NOISE_WORDS.test(word));
    let pascal = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join('');
    // 复数剥离（Articles → Article，Cards → Card；保留 ss 结尾如 Address）
    if (pascal.endsWith('s') && !pascal.endsWith('ss') && pascal.length > 3) {
      pascal = pascal.slice(0, -1);
    }
    if (!pascal) {
      pascal = toPascal(toCamelAscii(firstChild.name || '')) || 'ListItem';
    }
    if (pascal === 'ListItem') return 'ListItem';
    return /Card|Row|Item|Cell|Tile|Entry$/.test(pascal) ? pascal : `${pascal}Card`;
  }

  /**
   * 渲染 TS interface 文本
   *
   * @param interfaceName - 接口名
   * @param fields - 字段列表
   * @returns interface 代码
   */
  private _renderInterface(interfaceName: string, fields: readonly DataField[]): string {
    const lines = [`interface ${interfaceName} {`];
    for (const field of fields) {
      lines.push(`  ${field.name}: ${field.tsType};`);
    }
    lines.push('}');
    return lines.join('\n');
  }

  /**
   * 渲染 mock 数组文本（三行；字符串取设计稿样例，数值给顺序样例）
   *
   * @param interfaceName - 接口名
   * @param itemComponentName - 子项组件名（推导变量名）
   * @param fields - 字段列表
   * @param childCount - 设计稿子项数（用于提示，不影响行数）
   * @returns mock 代码
   */
  private _renderMock(
    interfaceName: string,
    itemComponentName: string,
    fields: readonly DataField[],
    childCount: number,
  ): string {
    const variableName = `${itemComponentName.charAt(0).toLowerCase()}${itemComponentName.slice(1)}s`;
    const lines = [`// 示例 mock（设计稿含 ${childCount} 个重复子项；接入时替换为接口数据）`];
    lines.push(`const ${variableName}: ${interfaceName}[] = [`);
    for (let row = 0; row < MOCK_ROWS; row += 1) {
      const assignment = fields
        .map((field) => {
          if (field.name === 'id') return `id: ${row + 1}`;
          if (field.tsType === 'number') {
            const numericSample = Number.parseFloat((field.sample ?? '').replace(/[^\d.]/g, ''));
            return Number.isFinite(numericSample) ? `${field.name}: ${numericSample + row}` : `${field.name}: ${row}`;
          }
          const base = field.sample && field.sample !== '' ? field.sample : `${field.name} sample`;
          return `${field.name}: ${quote(row === 0 ? base : `${base} ${row + 1}`)}`;
        })
        .join(', ');
      lines.push(`  { ${assignment} },`);
    }
    lines.push('];');
    return lines.join('\n');
  }

  /**
   * 渲染框架对应的列表渲染示例
   *
   * @param framework - react | vue
   * @param itemComponentName - 子项组件名
   * @param interfaceName - 接口名（注释中引用）
   * @param fields - 字段列表
   * @returns 示例代码文本
   */
  private _renderHint(
    framework: Framework,
    itemComponentName: string,
    interfaceName: string,
    fields: readonly DataField[],
  ): string {
    const variableName = `${itemComponentName.charAt(0).toLowerCase()}${itemComponentName.slice(1)}s`;
    const propFields = fields.filter((field) => field.name !== 'id').slice(0, 4);
    if (framework === 'vue') {
      const bindings = propFields.map((field) => `:${field.name}="item.${field.name}"`).join(' ');
      return [
        `// 示例：将 ${itemComponentName} 的 ${interfaceName} 静态重复子树替换为 v-for（示例代码，未自动应用）`,
        `<${itemComponentName} v-for="item in ${variableName}" :key="item.id" ${bindings} />`,
      ].join('\n');
    }
    const props = propFields.map((field) => `${field.name}={item.${field.name}}`).join(' ');
    return [
      `// 示例：将 ${itemComponentName} 的 ${interfaceName} 静态重复子树替换为 .map()（示例代码，未自动应用）`,
      `{${variableName}.map((item) => (`,
      `  <${itemComponentName} key={item.id} ${props} />`,
      '))}',
    ].join('\n');
  }

  /**
   * 为无语义命名节点建议 PascalCase 名称
   *
   * 仅当节点具备语义角色或可用的 ASCII 文本标签时建议；
   * 纯布局包装层（hierarchy-fixer 会扁平化）不报。
   *
   * @param node - 节点
   * @returns 命名建议或 undefined
   */
  private _suggestName(node: ProcessedNode): NameSuggestion | undefined {
    const current = (node.name || '').trim();
    if (!GENERIC_NAME_EN.test(current) && !GENERIC_NAME_ZH.test(current)) return undefined;

    const labelNode = this._firstTextNodes(node, 1)[0];
    const label = (labelNode?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const labelBase = toPascal(toCamelAscii(label).slice(0, 24));

    const suffixByRole: Partial<Record<ProcessedNode['role'], string>> = {
      button: 'Button',
      link: 'Link',
      image: 'Image',
      icon: 'Icon',
      input: 'Field',
      avatar: 'Avatar',
      badge: 'Badge',
      card: 'Card',
    };
    const roleSuffix = suffixByRole[node.role];

    // 信号 1：ASCII 文本标签（如 "Submit Order" 按钮）→ SubmitOrderButton
    if (labelBase) {
      const suggested = roleSuffix && !labelBase.endsWith(roleSuffix) ? `${labelBase}${roleSuffix}` : labelBase;
      if (this._isMeaningfullyDifferent(current, suggested)) {
        return {
          category: 'name',
          nodeId: node.figmaId,
          nodeName: current,
          suggestedName: suggested,
          reason: `generic Figma name; derived from its text label "${label}"${node.role !== 'container' ? ` (role: ${node.role})` : ''}`,
        };
      }
    }

    // 信号 2：无语义文本但角色明确（图片/头像/图标/输入框）→ 角色名 + 位置性兜底需外部上下文，
    // 此处仅在图标名本身具语义时建议（如后代 VECTOR 节点名 arrow-right）
    if (node.role === 'icon' || node.originalType === 'VECTOR') {
      const semanticDescendant = this._findSemanticDescendantName(node);
      if (semanticDescendant) {
        const suggested = semanticDescendant.endsWith('Icon') ? semanticDescendant : `${semanticDescendant}Icon`;
        if (this._isMeaningfullyDifferent(current, suggested)) {
          return {
            category: 'name',
            nodeId: node.figmaId,
            nodeName: current,
            suggestedName: suggested,
            reason: 'generic vector name; derived from semantic descendant node name',
          };
        }
      }
    }

    // 信号 3：无文本的按钮/输入框等可交互角色，无标签来源时不臆造
    return undefined;
  }

  /**
   * 在后代中寻找具语义的 ASCII 图标命名词（非 generic）
   *
   * @param node - 起始节点
   * @returns PascalCase 名称或 undefined
   */
  private _findSemanticDescendantName(node: ProcessedNode): string | undefined {
    for (const child of node.children ?? []) {
      const childName = (child.name || '').trim();
      if (childName && !GENERIC_NAME_EN.test(childName) && !GENERIC_NAME_ZH.test(childName)) {
        const pascal = toPascal(toCamelAscii(childName));
        if (pascal) return pascal;
      }
      const deeper = this._findSemanticDescendantName(child);
      if (deeper) return deeper;
    }
    return undefined;
  }

  /**
   * 建议名是否与现名有实质区别（忽略大小写与非字母数字）
   *
   * @param current - 现名
   * @param suggested - 建议名
   * @returns 有区别为 true
   */
  private _isMeaningfullyDifferent(current: string, suggested: string): boolean {
    const normalize = (value: string) => value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    return normalize(current) !== normalize(suggested);
  }
}

/**
 * 创建语义推断器
 *
 * @returns SemanticInferrer 实例（无状态，可跨次复用）
 */
export function createSemanticInferrer(): SemanticInferrer {
  return new SemanticInferrer();
}

/**
 * 将语义推断渲染为产物注释行。
 *
 * @param result - 语义推断结果
 * @param style - 'slash' 生成 `//` 行（Vue script）；'jsdoc' 生成 ` *` 行（React JSDoc 头）
 * @returns 注释行数组；无建议时为空数组
 */
export function formatSemanticComments(
  result: SemanticInferenceResult,
  style: 'slash' | 'jsdoc',
): string[] {
  if (result.dataStructures.length === 0 && result.nameSuggestions.length === 0) return [];

  const slashLines: string[] = [];
  if (result.dataStructures.length > 0) {
    slashLines.push('// 📐 Data-driven structure hints (v1.4.19, examples only — not applied automatically):');
    for (const structure of result.dataStructures.slice(0, 3)) {
      slashLines.push(
        `//   [list-data] ${structure.nodeName}: ${structure.repeatedCount} uniform children → ${structure.interfaceName} + mock + ${structure.itemComponentName} list render`,
      );
      for (const codeLine of structure.interfaceCode.split('\n')) slashLines.push(`//     ${codeLine}`);
      for (const codeLine of structure.mockCode.split('\n')) slashLines.push(`//     ${codeLine}`);
      for (const codeLine of structure.renderHint.split('\n')) slashLines.push(`//     ${codeLine}`);
    }
  }
  if (result.nameSuggestions.length > 0) {
    slashLines.push('// 🏷 Semantic name suggestions (v1.4.19, advisory only):');
    for (const suggestion of result.nameSuggestions.slice(0, 8)) {
      slashLines.push(`//   "${suggestion.nodeName}" → ${suggestion.suggestedName} (${suggestion.reason})`);
    }
    if (result.nameSuggestions.length > 8) {
      slashLines.push(`//   ...and ${result.nameSuggestions.length - 8} more (see result.reports.semantic)`);
    }
  }

  if (style === 'slash') return slashLines;
  // JSDoc 风格：行首 //（含可选空格）替换为 ` *`
  return slashLines.map((line) => line.replace(/^\/\/ ?/, ' * '));
}
