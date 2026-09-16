/**
 * Tailwind/UnoCSS 原子类渲染器 - Atomic Style Renderer（v1.4.18 新增，T7）
 *
 * 将既有 TailwindMapper 适配为 StyleRenderer 接口：
 * - tailwind 与 unocss（preset-wind）原子类语法同源，v1.4.18 共用映射器，
 *   保证与 1.4.17 产物逐字节等价；
 * - UnoCSS attributify 由 unocss-renderer.ts 派生扩展（T8）。
 *
 * @module services/style-renderers/tailwind-renderer
 */

import { createTailwindMapper, type TailwindMapper, type TailwindMapperOptions } from '../tailwind-mapper.js';
import type { NodeStyleResult, StyleFormat, StyleHint, StyleRenderContext, StyleRenderer } from './types.js';
import type { ProcessedNode } from '../../types/nodes.js';

/**
 * 基于 TailwindMapper 的原子类渲染器（无 per-node 脏状态，可整树复用）。
 */
export class AtomicStyleRenderer implements StyleRenderer {
  readonly id: StyleFormat;
  /** 组件级配置建议（tailwind 为空；UnoCSS wind/attributify 由构造注入） */
  readonly hints: readonly StyleHint[];
  /** 内部原子类映射器（与 1.4.17 同一实现，保证等价） */
  private readonly _mapper: TailwindMapper;

  /**
   * @param id - tailwind | unocss
   * @param options - TailwindMapper 选项（默认开启 arbitrary values）
   * @param hints - 组件级配置建议（默认空数组）
   */
  constructor(
    id: Extract<StyleFormat, 'tailwind' | 'unocss'>,
    options?: TailwindMapperOptions,
    hints: readonly StyleHint[] = [],
  ) {
    this.id = id;
    this._mapper = createTailwindMapper(options ?? { allowArbitrary: true });
    this.hints = hints;
  }

  /** @inheritdoc */
  renderNode(node: ProcessedNode, _context?: StyleRenderContext): NodeStyleResult {
    const mapping = this._mapper.mapNode(node);
    return {
      className: mapping.className,
      inlineStyle: mapping.inlineStyle,
      warnings: mapping.warnings ?? [],
      extensionsNeeded: mapping.extensionsNeeded,
    };
  }
}
