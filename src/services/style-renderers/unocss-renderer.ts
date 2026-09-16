/**
 * UnoCSS 渲染器（v1.4.18 新增，T8）
 *
 * 在 T7 原子类适配层之上补齐 UnoCSS 一级支持：
 * - preset-wind：与 Tailwind 映射同源（AtomicStyleRenderer，产物一致）；
 * - preset-attributify：把可安全属性化的原子类提升为元素属性，
 *   arbitrary 值/变体/负值/修饰符等非法属性名 token 保留在 class；
 * - 组件级配置建议（hints）：uno.config 预设、virtual:uno.css 入口、
 *   presetIcons 可选建议，React 额外提供 JSX 属性 TS shim。
 *
 * 仅生成字符串与建议，不依赖、不安装 unocss 到用户项目（NFR-08）。
 *
 * @module services/style-renderers/unocss-renderer
 */

import { cn } from '../../utils/cn.js';
import type { NodeStyleResult, StyleHint } from './types.js';
import { AtomicStyleRenderer } from './tailwind-renderer.js';
import type { Framework } from '../../types.js';

/**
 * 可安全提升为 HTML/JSX 属性名的 UnoCSS utility token 形态。
 *
 * 允许：字母开头，仅含字母/数字/连字符（flex、items-center、gap-x-4）。
 * 刻意排除：变体前缀 `hover:`、arbitrary `w-[200px]`、负值 `-ml-2`、
 * 斜杠修饰 `w-1/2`、小数点 `h-6.5`、important 后缀 `!`、括号与逗号等。
 */
export const UNOCSS_ATTRIBUTIFY_SAFE_RE = /^[a-zA-Z][a-zA-Z0-9-]*$/;

/** attributify 分区结果 */
export interface AttributifyPartition {
  /** 可提升为属性的 token（保持出现顺序、去重） */
  readonly attributeNames: string[];
  /** 必须保留在 class 的 token（保持出现顺序、去重） */
  readonly fallbackClassName: string;
}

/**
 * 将原子类字符串分区为「属性 token」与「class 回退 token」。
 *
 * @param className - 空格分隔的原子类字符串
 * @returns 分区结果
 */
export function partitionAttributifyTokens(className: string): AttributifyPartition {
  /** 属性 token（保序去重） */
  const attributeNames: string[] = [];
  /** class 回退 token（保序去重） */
  const fallbackTokens: string[] = [];
  for (const rawToken of className.split(/\s+/)) {
    const token = rawToken.trim();
    if (token.length === 0) continue;
    if (UNOCSS_ATTRIBUTIFY_SAFE_RE.test(token)) {
      if (!attributeNames.includes(token)) attributeNames.push(token);
    } else if (!fallbackTokens.includes(token)) {
      fallbackTokens.push(token);
    }
  }
  return { attributeNames, fallbackClassName: fallbackTokens.join(' ') };
}

/**
 * 把 flex 修复等追加类按当前渲染模式合流进节点样式结果。
 *
 * - 非 attributify 结果（attributes 缺省）：经典 cn 类名合并，与 1.4.17 形态一致；
 * - attributify 结果：全量 token 经 cn 归一后重新分区（去重/冲突收敛一致）。
 *
 * @param style - 渲染器产出的节点样式
 * @param extraTokens - 追加类（如 flex-fixer 注入）
 * @returns 合流后的新节点样式（不改写入参）
 */
export function mergeStyleWithExtraTokens(
  style: NodeStyleResult,
  extraTokens: readonly string[],
): NodeStyleResult {
  if (style.attributes === undefined) {
    return { ...style, className: cn(style.className, ...extraTokens) };
  }
  /** 现有属性 token 与 class、追加 token 一并交给 cn 做冲突收敛后重新分区 */
  const attributeTokens = style.attributes.map((attr) => attr.name);
  const merged = cn(...[...attributeTokens, style.className, ...extraTokens].filter((v) => v.length > 0));
  const partition = partitionAttributifyTokens(merged);
  return {
    ...style,
    className: partition.fallbackClassName,
    attributes: partition.attributeNames.map((name) => ({ name, value: '' })),
  };
}

/** UnoCSS 入口引入建议 */
const ENTRY_IMPORT_HINT: StyleHint = {
  title: 'entry import (add once)',
  code: "// Import the virtual module in your app entry (main.ts/main.js):\nimport 'virtual:uno.css';",
};

/** presetIcons 可选建议 */
const ICONS_HINT: StyleHint = {
  title: 'icons preset (optional)',
  code: [
    '// npm i -D @iconify-json/<collection>  (e.g. @iconify-json-mdi)',
    'import { presetIcons } from \'unocss\';',
    '// presets: [presetWind(), presetIcons({ scale: 1.2, warn: true })]',
    '// usage: <span class="i-mdi-home" /> or attributify <span i-mdi-home />',
  ].join('\n'),
};

/**
 * 生成 UnoCSS 配置建议片段。
 *
 * @param mode - wind | attributify
 * @param framework - 目标框架（react 时追加 JSX 属性 TS shim）
 * @returns 建议片段列表
 */
export function buildUnocssHints(mode: 'wind' | 'attributify', framework: Framework): readonly StyleHint[] {
  /** 基础预设（wind 与 attributify 都需要 presetWind） */
  const configHint: StyleHint =
    mode === 'attributify'
      ? {
          title: 'uno.config.ts (example)',
          code: [
            "import { defineConfig, presetAttributify, presetWind } from 'unocss';",
            '',
            'export default defineConfig({',
            '  presets: [',
            '    presetWind(), // Tailwind/Windi-compatible utilities',
            '    presetAttributify(), // <div flex items-center /> syntax',
            '  ],',
            '});',
          ].join('\n'),
        }
      : {
          title: 'uno.config.ts (example)',
          code: [
            "import { defineConfig, presetWind } from 'unocss';",
            '',
            'export default defineConfig({',
            '  presets: [',
            '    presetWind(), // Tailwind/Windi-compatible utilities',
            '  ],',
            '});',
          ].join('\n'),
        };

  /** 建议集合（配置 → 入口 → 图标 → React shim） */
  const hints: StyleHint[] = [configHint, ENTRY_IMPORT_HINT, ICONS_HINT];

  if (mode === 'attributify' && framework === 'react') {
    hints.push({
      title: 'attributify in TSX (type shim)',
      code: [
        '// Utility attributes (flex, items-center, ...) are unknown to React types.',
        '// Requires @unocss/preset-attributify; add this once per project (e.g. src/env.d.ts):',
        "declare module 'react' {",
        '  interface HTMLAttributes {',
        '    [key: string]: boolean | string | undefined;',
        '  }',
        '}',
      ].join('\n'),
    });
  }

  return hints;
}

/**
 * UnoCSS attributify 模式渲染器。
 *
 * 与 wind 模式共用同一 TailwindMapper（类名映射零分歧），
 * 仅在产出层做 class→属性分区；无 per-node 脏状态。
 */
export class UnocssAttributifyRenderer extends AtomicStyleRenderer {
  /**
   * @param framework - 目标框架（决定 hints 是否含 React TS shim）
   */
  constructor(framework: Framework) {
    super('unocss', { allowArbitrary: true }, buildUnocssHints('attributify', framework));
  }

  /** @inheritdoc */
  override renderNode(node: Parameters<AtomicStyleRenderer['renderNode']>[0]): NodeStyleResult {
    const base = super.renderNode(node);
    const partition = partitionAttributifyTokens(base.className);
    return {
      ...base,
      className: partition.fallbackClassName,
      attributes: partition.attributeNames.map((name) => ({ name, value: '' })),
    };
  }
}
