/**
 * Flex 布局问题自动修复服务
 *
 * 检测并修复从 Figma 转换到 Tailwind 时常见的 Flex 布局问题：
 * 1. 图标/头像在 flex 中变形 → 添加 flex-shrink-0 + 固定尺寸
 * 2. 文本截断不生效 → 添加 min-w-0 truncate
 * 3. 溢出滚动问题 → 添加正确的 overflow 组合
 * 4. Flex 项目不收缩问题 → 添加 min-w-0
 * 5. 图片在 flex 中拉伸 → 添加 object-cover/object-contain
 *
 * @module
 */

import { getI18n } from '../i18n/index.js';
import type { ProcessedNode } from '../types/nodes.js';

// ============ 类型定义 ============

/**
 * Flex 修复报告条目
 */
export interface FlexFixEntry {
  /** Figma 节点 ID */
  nodeId: string;
  /** 节点名称 */
  nodeName: string;
  /** 问题类型 */
  issue: 'shrink' | 'truncate' | 'overflow' | 'min-width' | 'object-fit';
  /** 添加的 Tailwind 类名 */
  addedClasses: string[];
  /** 修复描述 */
  description: string;
}

/**
 * Flex 修复结果
 */
export interface FlexFixResult {
  /** 原始节点树（已就地修改） */
  node: ProcessedNode;
  /** 修复报告 */
  fixes: FlexFixEntry[];
  /** 统计：图标变形修复数量 */
  shrinkFixedCount: number;
  /** 统计：文本截断修复数量 */
  truncateFixedCount: number;
  /** 统计：溢出滚动修复数量 */
  overflowFixedCount: number;
  /** 统计：flex 项目收缩修复数量 */
  minWidthFixedCount: number;
  /** 统计：图片拉伸修复数量 */
  objectFitFixedCount: number;
  /** 总共修复的节点数量 */
  totalFixedNodes: number;
  /** 总共修复的节点数量（totalFixedNodes 的别名） */
  fixedCount: number;
}

// ============ FlexFixer 类 ============

/**
 * Flex 布局问题自动修复器
 *
 * 遍历 ProcessedNode 树，检测并修复常见的 Flex 布局问题。
 * 修复主要通过在节点上添加 `_flexFixes` 扩展字段标记需要添加的类名，
 * TailwindMapper 在生成 className 时会合并这些类。
 */
export class FlexFixer {
  /** 修复报告 */
  private _fixes: FlexFixEntry[] = [];
  /** i18n 实例 */
  private _i18n = getI18n();

  /**
   * 对节点树应用 Flex 修复
   *
   * @param root - 根节点（会递归遍历）
   * @returns 修复结果，包含修复报告和统计信息
   */
  applyFixes(root: ProcessedNode): FlexFixResult {
    this._fixes = [];
    this._processNode(root, null);

    const stats = this._computeStats();

    return {
      node: root,
      fixes: this._fixes,
      fixedCount: stats.totalFixedNodes,
      ...stats,
    };
  }

  /**
   * 处理单个节点（递归）
   *
   * @param node - 当前节点
   * @param parent - 父节点
   */
  private _processNode(node: ProcessedNode, parent: ProcessedNode | null): void {
    if (node.visible === false) {
      this._processChildren(node);
      return;
    }

    const classesToAdd: string[] = [];
    const fixes: Array<Omit<FlexFixEntry, 'nodeId' | 'nodeName'>> = [];

    if (this._isIconOrAvatar(node) && this._isInFlexContainer(parent)) {
      const isFixedSize = this._hasFixedSize(node);
      if (!this._hasFlexShrink0(node)) {
        classesToAdd.push('flex-shrink-0');
        fixes.push({
          issue: 'shrink',
          addedClasses: ['flex-shrink-0'],
          description: this._i18n.t('flexFixer.shrinkFixed') as string,
        });
      }
      if (!isFixedSize && node.size) {
        const w = node.size.width;
        const h = node.size.height;
        if (w === h && [16, 20, 24, 32, 40, 48, 64].includes(w)) {
          const sizeClass = this._getSizeClass(w);
          if (sizeClass && !this._hasClass(node, sizeClass)) {
            classesToAdd.push(sizeClass);
            fixes.push({
              issue: 'shrink',
              addedClasses: [sizeClass],
              description: this._i18n.t('flexFixer.shrinkFixed') as string,
            });
          }
        }
      }
    }

    if ((node.role === 'text' || node.originalType === 'TEXT') && this._isInFlexContainer(parent)) {
      if (node.textContent && node.textContent.length > 3) {
        if (!this._hasMinW0(node) && !this._hasClass(node, 'truncate')) {
          classesToAdd.push('min-w-0');
          fixes.push({
            issue: 'min-width',
            addedClasses: ['min-w-0'],
            description: this._i18n.t('flexFixer.minWidthFixed') as string,
          });
        }
      }
    }

    if (node.clipsContent && this._isScrollingContainer(node)) {
      if (!this._hasOverflowClass(node)) {
        const overflowClass = this._inferOverflowClass(node);
        if (overflowClass) {
          classesToAdd.push(overflowClass);
          fixes.push({
            issue: 'overflow',
            addedClasses: [overflowClass],
            description: this._i18n.t('flexFixer.overflowFixed') as string,
          });
        }
      }
    }

    if (parent?.layout?.mode && parent.layout.mode !== 'NONE' && node.layout?.primaryAxisSizing === 'AUTO') {
      if (!this._hasMinW0(node) && this._mightOverflow(node)) {
        classesToAdd.push('min-w-0');
        fixes.push({
          issue: 'min-width',
          addedClasses: ['min-w-0'],
          description: this._i18n.t('flexFixer.minWidthFixed') as string,
        });
      }
    }

    if (node.role === 'image' || node.originalType === 'RECTANGLE') {
      const hasImageFill = node.fills?.some((f) => f.type === 'image');
      if (hasImageFill || node.asset) {
        if (!this._hasObjectFit(node)) {
          classesToAdd.push('object-cover');
          fixes.push({
            issue: 'object-fit',
            addedClasses: ['object-cover'],
            description: this._i18n.t('flexFixer.objectFitFixed') as string,
          });
        }
      }
    }

    if (classesToAdd.length > 0) {
      const existingFixes = (node._flexFixes as string[]) || [];
      node._flexFixes = [...new Set([...existingFixes, ...classesToAdd])];

      for (const fix of fixes) {
        this._fixes.push({
          nodeId: node.figmaId,
          nodeName: node.name,
          ...fix,
        });
      }
    }

    this._processChildren(node);
  }

  /**
   * 递归处理子节点
   *
   * @param node - 父节点
   */
  private _processChildren(node: ProcessedNode): void {
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        this._processNode(child, node);
      }
    }
  }

  /**
   * 统计修复数量
   */
  private _computeStats(): Pick<
    FlexFixResult,
    | 'shrinkFixedCount'
    | 'truncateFixedCount'
    | 'overflowFixedCount'
    | 'minWidthFixedCount'
    | 'objectFitFixedCount'
    | 'totalFixedNodes'
  > {
    let shrink = 0;
    let truncate = 0;
    let overflow = 0;
    let minWidth = 0;
    let objectFit = 0;
    const fixedNodeIds = new Set<string>();

    for (const fix of this._fixes) {
      fixedNodeIds.add(fix.nodeId);
      switch (fix.issue) {
        case 'shrink':
          shrink++;
          break;
        case 'truncate':
          truncate++;
          break;
        case 'overflow':
          overflow++;
          break;
        case 'min-width':
          minWidth++;
          break;
        case 'object-fit':
          objectFit++;
          break;
      }
    }

    return {
      shrinkFixedCount: shrink,
      truncateFixedCount: truncate,
      overflowFixedCount: overflow,
      minWidthFixedCount: minWidth,
      objectFitFixedCount: objectFit,
      totalFixedNodes: fixedNodeIds.size,
    };
  }

  // ============ 节点检测辅助方法 ============

  /**
   * 判断节点是否为图标或头像
   */
  private _isIconOrAvatar(node: ProcessedNode): boolean {
    if (node.role === 'icon' || node.role === 'avatar') return true;
    const name = node.name.toLowerCase();
    return (
      name.includes('icon') ||
      name.includes('avatar') ||
      name.includes('logo') ||
      name.includes('图标') ||
      name.includes('头像')
    );
  }

  /**
   * 判断父元素是否为 flex 容器
   */
  private _isInFlexContainer(parent: ProcessedNode | null): boolean {
    if (!parent) return false;
    return parent.layout?.mode === 'HORIZONTAL' || parent.layout?.mode === 'VERTICAL';
  }

  /**
   * 判断节点是否有固定尺寸
   */
  private _hasFixedSize(node: ProcessedNode): boolean {
    if (!node.size) return false;
    return node.layout?.primaryAxisSizing === 'FIXED' && node.layout?.counterAxisSizing === 'FIXED';
  }

  /**
   * 判断节点是否已有 flex-shrink-0
   */
  private _hasFlexShrink0(node: ProcessedNode): boolean {
    const existing = (node._flexFixes as string[]) || [];
    return existing.includes('flex-shrink-0');
  }

  /**
   * 判断节点是否已有 min-w-0
   */
  private _hasMinW0(node: ProcessedNode): boolean {
    const existing = (node._flexFixes as string[]) || [];
    return existing.includes('min-w-0');
  }

  /**
   * 判断节点是否已有指定类名（简化检测）
   */
  private _hasClass(node: ProcessedNode, cls: string): boolean {
    const existing = (node._flexFixes as string[]) || [];
    return existing.includes(cls);
  }

  /**
   * 判断节点是否已有 overflow 类
   */
  private _hasOverflowClass(node: ProcessedNode): boolean {
    const existing = (node._flexFixes as string[]) || [];
    return existing.some((c) => c.startsWith('overflow'));
  }

  /**
   * 判断节点是否已有 object-fit 类
   */
  private _hasObjectFit(node: ProcessedNode): boolean {
    const existing = (node._flexFixes as string[]) || [];
    return existing.some((c) => c.startsWith('object-'));
  }

  /**
   * 判断节点是否是滚动容器
   */
  private _isScrollingContainer(node: ProcessedNode): boolean {
    const name = node.name.toLowerCase();
    return (
      name.includes('scroll') ||
      name.includes('list') ||
      name.includes('container') ||
      name.includes('滚动') ||
      name.includes('列表')
    );
  }

  /**
   * 推断正确的 overflow 类
   */
  private _inferOverflowClass(node: ProcessedNode): string | null {
    if (!node.layout) return 'overflow-hidden';

    if (node.layout.mode === 'VERTICAL' && node.children && node.children.length > 3) {
      return 'overflow-y-auto';
    }
    if (node.layout.mode === 'HORIZONTAL') {
      return 'overflow-x-auto overflow-y-hidden';
    }
    return 'overflow-hidden';
  }

  /**
   * 判断节点是否可能溢出
   */
  private _mightOverflow(node: ProcessedNode): boolean {
    if (node.role === 'text' || node.originalType === 'TEXT') {
      return (node.textContent?.length || 0) > 10;
    }
    return (node.children?.length || 0) > 0;
  }

  /**
   * 获取尺寸对应的 Tailwind 类名
   */
  private _getSizeClass(px: number): string | null {
    const sizeMap: Record<number, string> = {
      4: 'w-1 h-1',
      6: 'w-1.5 h-1.5',
      8: 'w-2 h-2',
      10: 'w-2.5 h-2.5',
      12: 'w-3 h-3',
      14: 'w-3.5 h-3.5',
      16: 'w-4 h-4',
      20: 'w-5 h-5',
      24: 'w-6 h-6',
      28: 'w-7 h-7',
      32: 'w-8 h-8',
      40: 'w-10 h-10',
      48: 'w-12 h-12',
      56: 'w-14 h-14',
      64: 'w-16 h-16',
    };
    return sizeMap[px] || null;
  }
}

// ============ 工厂函数 ============

/**
 * 创建 FlexFixer 实例
 *
 * @returns FlexFixer 实例
 */
export function createFlexFixer(): FlexFixer {
  return new FlexFixer();
}

/**
 * 便捷函数：直接对节点树应用 Flex 修复
 *
 * @param node - 根节点
 * @returns 修复结果
 */
export function applyFlexFixes(node: ProcessedNode): FlexFixResult {
  const fixer = createFlexFixer();
  return fixer.applyFixes(node);
}
