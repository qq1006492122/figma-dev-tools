/**
 * CSS Modules 渲染器（v1.4.18 新增，T9）
 *
 * 设计取舍：
 * - 与原子类（Tailwind/UnoCSS）不同，CSS Modules 走「语义类名 + 原生 CSS 声明」：
 *   每个 ProcessedNode 经 {@link extractCssDeclarations} 映射为确定性排序的原生声明，
 *   类名由节点名 kebab 化得到（button-primary 等），框架侧分别引用 `styles.x` / `$style.x`；
 * - 非标像素值无需 arbitrary 语法，直接输出 width: 321px 等原生 CSS；
 * - 每组件一个实例，聚合本组件全部类声明，结束时经 buildSidecar 产出同名 `.module.css`；
 * - 复用策略：相同声明签名的多个节点共享同一类名（零重复）；
 *   严格子集关系的类经 `composes: base;` 复用，仅输出增量声明；
 * - 渐变/图片填充等无法逐像素表达的内容不臆造映射，产出人工复核警告。
 *
 * @module services/style-renderers/css-modules-renderer
 */

import { figmaColorToHex } from '../../utils/color.js';
import type { ProcessedNode } from '../../types/nodes.js';
import type { NodeStyleResult, StyleSidecarFile } from './types.js';

/** 单条 CSS 声明（属性名, 属性值），属性顺序即输出顺序 */
export type CssDeclaration = readonly [property: string, value: string];

/** 注册表内部条目：一个语义类及其声明集合 */
interface ModuleClassEntry {
  /** 本地类名（kebab-case，模块内唯一） */
  readonly name: string;
  /** 规范化排序后的声明 */
  readonly declarations: readonly CssDeclaration[];
  /** 注册顺序（输出与 composes 平局判定用） */
  readonly order: number;
}

/**
 * 声明规范化的属性输出顺序（自上而下）。
 *
 * 布局 → 盒模型尺寸 → 圆角 → 颜色 → 文本 → 描边 → 可见性/变换，
 * 保证同一样式的签名稳定，composes 子集比对可靠。
 */
const DECLARATION_ORDER = [
  'display',
  'flex-direction',
  'justify-content',
  'align-items',
  'flex-wrap',
  'flex-grow',
  'align-self',
  'gap',
  'padding',
  'width',
  'height',
  'border-radius',
  'background-color',
  'color',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-decoration',
  'text-transform',
  'border',
  'opacity',
  'overflow',
  'transform',
] as const;

/**
 * 将 ProcessedNode 映射为原生 CSS 声明数组。
 *
 * 支持范围：flex 自动布局（方向/对齐/换行/gap/padding/flex-grow/align-self）、
 * 尺寸（遵循 Auto Layout sizing mode）、圆角、纯色填充（容器背景/文本前景）、
 * 描边简写、核心文本排版、透明度/裁剪/旋转。
 * 不支持：渐变/图片填充与多层阴影（由调用方据警告提示人工补充）。
 *
 * @param node - 精简节点
 * @returns 规范化排序后的 CSS 声明（可能为空数组）
 */
export function extractCssDeclarations(node: ProcessedNode): CssDeclaration[] {
  /** 以属性名为键收集，同名属性后者覆盖（每个属性本函数只产出一次） */
  const declMap = new Map<string, string>();
  const set = (property: string, value: string | undefined): void => {
    if (value !== undefined && value !== '') declMap.set(property, value);
  };

  const layout = node.layout;

  // ============ 1. Flex 自动布局 ============
  if (layout && layout.mode !== 'NONE') {
    set('display', 'flex');
    set('flex-direction', layout.mode === 'HORIZONTAL' ? 'row' : 'column');

    // 主轴对齐
    switch (layout.primaryAxisAlign) {
      case 'CENTER':
        set('justify-content', 'center');
        break;
      case 'MAX':
        set('justify-content', 'flex-end');
        break;
      case 'SPACE_BETWEEN':
        set('justify-content', 'space-between');
        break;
      case 'MIN':
      default:
        set('justify-content', 'flex-start');
    }

    // 交叉轴对齐
    switch (layout.counterAxisAlign) {
      case 'CENTER':
        set('align-items', 'center');
        break;
      case 'MAX':
        set('align-items', 'flex-end');
        break;
      case 'BASELINE':
        set('align-items', 'baseline');
        break;
      case 'MIN':
      default:
        set('align-items', 'flex-start');
    }

    if (layout.layoutWrap === 'WRAP') set('flex-wrap', 'wrap');
    if (layout.itemSpacing > 0) set('gap', `${layout.itemSpacing}px`);

    // 内边距：四边相等 → 单值；上下/左右相等 → 双值；否则四值
    const { top, right, bottom, left } = layout.padding;
    if (top === right && right === bottom && bottom === left) {
      if (top !== 0) set('padding', `${top}px`);
    } else if (top === bottom && right === left) {
      set('padding', `${top}px ${right}px`);
    } else {
      set('padding', `${top}px ${right}px ${bottom}px ${left}px`);
    }
  }

  // ============ 2. 子项布局属性 ============
  if (node.flexGrow !== undefined && node.flexGrow > 0) {
    set('flex-grow', String(node.flexGrow));
  }
  if (node.alignSelf) {
    switch (node.alignSelf) {
      case 'CENTER':
        set('align-self', 'center');
        break;
      case 'MAX':
        set('align-self', 'flex-end');
        break;
      case 'STRETCH':
        set('align-self', 'stretch');
        break;
      case 'MIN':
      default:
        set('align-self', 'flex-start');
    }
  }

  // ============ 3. 尺寸（规则与 TailwindMapper 一致：尊重 sizing mode） ============
  if (node.size) {
    const isHorizontal = layout?.mode === 'HORIZONTAL';
    const isVertical = layout?.mode === 'VERTICAL';
    const shouldSetWidth =
      !isHorizontal || layout?.primaryAxisSizing === 'FIXED' || layout?.counterAxisSizing === 'FIXED';
    const shouldSetHeight =
      !isVertical || layout?.primaryAxisSizing === 'FIXED' || layout?.counterAxisSizing === 'FIXED';
    if (!layout) {
      set('width', `${node.size.width}px`);
      set('height', `${node.size.height}px`);
    } else {
      if (shouldSetWidth) set('width', `${node.size.width}px`);
      if (shouldSetHeight) set('height', `${node.size.height}px`);
    }
  }

  // ============ 4. 圆角 ============
  if (node.cornerRadius) {
    const { topLeft, topRight, bottomRight, bottomLeft, uniform } = node.cornerRadius;
    if (uniform || (topLeft === topRight && topRight === bottomRight && bottomRight === bottomLeft)) {
      if (topLeft > 0.5) set('border-radius', `${topLeft}px`);
    } else {
      set('border-radius', `${topLeft}px ${topRight}px ${bottomRight}px ${bottomLeft}px`);
    }
  }

  // ============ 5. 描边（仅第一层；虚线 → dashed/dotted） ============
  const stroke = node.strokes?.[0];
  if (stroke && stroke.weight > 0) {
    const dash = stroke.dashPattern?.[0];
    const gap = stroke.dashPattern?.[1];
    const style =
      dash !== undefined && gap !== undefined && dash === gap ? 'dashed' : dash !== undefined ? 'dotted' : 'solid';
    set('border', `${stroke.weight}px ${style} ${figmaColorToHex(stroke.color, true)}`);
  }

  // ============ 6. 填充：取最顶层纯色（fills 倒序）；文本节点 → color ============
  const isTextNode = node.role === 'text' || node.originalType === 'TEXT';
  if (node.fills && node.fills.length > 0) {
    for (let i = node.fills.length - 1; i >= 0; i--) {
      const fill = node.fills[i];
      if (!fill) continue;
      if (fill.type === 'solid') {
        set(isTextNode ? 'color' : 'background-color', figmaColorToHex(fill.color, true));
        break;
      }
      // 首个（最顶层）非纯色填充由渲染器层产出警告，这里不做猜测映射
      break;
    }
  }

  // ============ 7. 文本排版 ============
  if (isTextNode && node.textStyle) {
    const ts = node.textStyle;
    if (ts.fontSize !== undefined) set('font-size', `${ts.fontSize}px`);
    if (ts.fontWeight !== undefined) set('font-weight', String(ts.fontWeight));
    if (ts.lineHeightPx !== undefined) set('line-height', `${Math.round(ts.lineHeightPx)}px`);
    if (ts.letterSpacing !== undefined && Math.abs(ts.letterSpacing) > 0.05) {
      set('letter-spacing', `${ts.letterSpacing}px`);
    }
    switch (ts.textAlignHorizontal) {
      case 'CENTER':
        set('text-align', 'center');
        break;
      case 'RIGHT':
        set('text-align', 'right');
        break;
      case 'JUSTIFIED':
        set('text-align', 'justify');
        break;
      case 'LEFT':
        set('text-align', 'left');
        break;
      default:
        break;
    }
    if (ts.textDecoration === 'UNDERLINE') set('text-decoration', 'underline');
    if (ts.textDecoration === 'STRIKETHROUGH') set('text-decoration', 'line-through');
    switch (ts.textCase) {
      case 'UPPER':
        set('text-transform', 'uppercase');
        break;
      case 'LOWER':
        set('text-transform', 'lowercase');
        break;
      case 'TITLE':
        set('text-transform', 'capitalize');
        break;
      default:
        break;
    }
  }

  // ============ 8. 可见性/裁剪/旋转 ============
  if (node.opacity !== undefined && node.opacity < 1 && node.opacity >= 0) {
    set('opacity', Number(node.opacity.toFixed(3)).toString());
  }
  if (node.clipsContent) set('overflow', 'hidden');
  if (node.rotation !== undefined && Math.abs(node.rotation) > 0.1) {
    set('transform', `rotate(${node.rotation}deg)`);
  }

  // 按规范顺序输出
  const orderIndex = new Map<string, number>(DECLARATION_ORDER.map((prop, index) => [prop, index]));
  return Array.from(declMap.entries())
    .map(([property, value]) => [property, value] as CssDeclaration)
    .sort((a, b) => (orderIndex.get(a[0]) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(b[0]) ?? Number.MAX_SAFE_INTEGER));
}

/** 声明集合的稳定签名（属性:值 以 | 连接） */
function declarationsSignature(declarations: readonly CssDeclaration[]): string {
  return declarations.map(([prop, value]) => `${prop}:${value}`).join('|');
}

/** 声明集合的键集合（composes 子集比对用） */
function declarationKeySet(declarations: readonly CssDeclaration[]): Set<string> {
  return new Set(declarations.map(([prop, value]) => `${prop}:${value}`));
}

/**
 * 节点名 → 合法 CSS 类名片段（kebab-case）。
 *
 * 中文等非 ASCII 字符被剥离；结果为空或数字开头时回退到 figmaId 派生。
 *
 * @param node - 精简节点
 * @returns 合法类名片段（可能为空字符串）
 */
function nodeNameToClass(node: ProcessedNode): string {
  const fromName = (node.name || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  if (fromName) return /^[a-z]/.test(fromName) ? fromName : `n-${fromName}`;
  const fromId = (node.figmaId || node.id || 'element')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return /^[a-z]/.test(fromId) ? fromId : `el-${fromId || 'node'}`;
}

/**
 * CSS Modules 渲染器（每组件一个实例）。
 *
 * renderNode 为每个有样式的节点注册/复用一个语义类；
 * buildSidecar 输出同名 `.module.css`，含 composes 复用关系。
 */
export class CssModulesRenderer {
  /** 样式方案标识 */
  readonly id = 'css-modules' as const;
  /** CSS Modules 无需配置建议 */
  readonly hints: readonly never[] = [];

  /** 声明签名 → 已注册类条目（相同样式复用） */
  private readonly _bySignature = new Map<string, ModuleClassEntry>();
  /** 全部类条目（注册顺序） */
  private readonly _entries: ModuleClassEntry[] = [];
  /** 已占用类名（同名不同样式加数字后缀） */
  private readonly _usedNames = new Set<string>();
  /** 注册顺序计数器 */
  private _order = 0;

  /**
   * 渲染单节点：返回框架无关的本地类名（不含 styles./$style. 前缀）。
   *
   * @param node - 精简节点
   * @returns 节点样式结果（className 为模块本地类名；空字符串表示无样式可映射）
   */
  renderNode(node: ProcessedNode): NodeStyleResult {
    const declarations = extractCssDeclarations(node);
    const warnings: string[] = [];

    // 渐变/图片填充提示（无法在不臆造的前提下落为普通背景声明；节点名由生成器层统一添加）
    if (node.fills) {
      for (const fill of node.fills) {
        if (fill.type === 'image') {
          warnings.push('图片填充无法映射为 CSS Modules 声明，请改用 <img> 或手工补充 background-image');
        } else if (fill.type !== 'solid') {
          warnings.push('渐变填充无法精确映射为 CSS Modules 声明，请人工补充 background: linear/radial-gradient(...)');
        }
      }
    }

    if (declarations.length === 0) {
      return { className: '', warnings, extensionsNeeded: [] };
    }

    const signature = declarationsSignature(declarations);
    const existing = this._bySignature.get(signature);
    if (existing) {
      return { className: existing.name, warnings, extensionsNeeded: [] };
    }

    const baseName = nodeNameToClass(node);
    let name = baseName;
    let suffix = 2;
    while (this._usedNames.has(name)) {
      name = `${baseName}-${suffix}`;
      suffix += 1;
    }

    const entry: ModuleClassEntry = { name, declarations, order: this._order++ };
    this._usedNames.add(name);
    this._bySignature.set(signature, entry);
    this._entries.push(entry);

    return { className: name, warnings, extensionsNeeded: [] };
  }

  /**
   * 查找目标类的最大严格子集基类（composes 目标）。
   *
   * @param target - 待输出的类
   * @returns 最大子集条目；平局取注册顺序最早者；无严格子集返回 undefined
   */
  private _findComposeBase(target: ModuleClassEntry): ModuleClassEntry | undefined {
    const targetKeys = declarationKeySet(target.declarations);
    let best: ModuleClassEntry | undefined;
    for (const candidate of this._entries) {
      if (candidate.name === target.name) continue;
      const candidateKeys = declarationKeySet(candidate.declarations);
      if (candidateKeys.size >= targetKeys.size) continue;
      let isSubset = true;
      for (const key of candidateKeys) {
        if (!targetKeys.has(key)) {
          isSubset = false;
          break;
        }
      }
      if (!isSubset) continue;
      if (!best || candidateKeys.size > declarationKeySet(best.declarations).size) {
        best = candidate;
      }
    }
    return best;
  }

  /**
   * 组件树渲染结束后生成同名 `.module.css` 内容。
   *
   * @param componentName - 当前组件名（PascalCase，文件名转 `${componentName}.module.css`）
   * @returns 旁路文件描述；无任何注册类时返回 undefined
   */
  buildSidecar(componentName: string): StyleSidecarFile | undefined {
    if (this._entries.length === 0) return undefined;

    const lines: string[] = [
      `/* ${componentName}.module.css - Auto-generated by figma-dev-tools v1.4.18 (CSS Modules) */`,
      '/* 语义类名 + 原生声明；重复样式经 composes 复用，可安全手工调整 */',
      '',
    ];

    for (const entry of this._entries) {
      const base = this._findComposeBase(entry);
      const baseKeys = base ? declarationKeySet(base.declarations) : new Set<string>();
      const ownDeclarations = entry.declarations.filter(
        ([prop, value]) => !baseKeys.has(`${prop}:${value}`),
      );

      lines.push(`.${entry.name} {`);
      if (base) {
        lines.push(`  composes: ${base.name};`);
      }
      for (const [prop, value] of ownDeclarations) {
        lines.push(`  ${prop}: ${value};`);
      }
      lines.push('}');
      lines.push('');
    }

    return {
      fileName: `${componentName}.module.css`,
      content: lines.join('\n'),
    };
  }
}
