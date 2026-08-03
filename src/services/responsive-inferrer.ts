/**
 * 响应式断点智能推断服务
 *
 * 根据设计稿尺寸分析目标设备，生成响应式类建议：
 * 1. 分析设计稿宽度，推断目标设备（移动端 <768px, 平板 768-1024px, 桌面 >1024px）
 * 2. 为布局自动添加响应式前缀（sm:, md:, lg:, xl:）
 * 3. 移动端布局建议 flex-col，桌面端 flex-row
 * 4. 响应式字体大小建议
 * 5. 隐藏/显示元素的响应式类建议
 *
 * @module
 */

import type { DesignContext, ProcessedNode } from '../types/nodes.js';
import { getI18n } from '../i18n/index.js';

// ============ 类型定义 ============

/**
 * 设备类型
 */
export type DeviceType = 'mobile' | 'tablet' | 'desktop';

/**
 * Tailwind 断点定义
 */
export interface Breakpoint {
  /** 断点名称 */
  name: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** 最小宽度（px） */
  minWidth: number;
  /** 描述 */
  description: string;
}

/**
 * 响应式类建议
 */
export interface ResponsiveClassSuggestion {
  /** Figma 节点 ID */
  nodeId: string;
  /** 节点名称 */
  nodeName: string;
  /** 原始类名（无响应式前缀） */
  baseClasses: string;
  /** 建议的响应式类 */
  responsiveClasses: string;
  /** 建议说明 */
  reason: string;
}

/**
 * 布局方向建议
 */
export interface LayoutDirectionSuggestion {
  /** 目标断点 */
  breakpoint: string;
  /** 建议的布局方向 */
  direction: 'flex-row' | 'flex-col';
  /** 说明 */
  description: string;
}

/**
 * 字体大小响应式建议
 */
export interface FontSizeSuggestion {
  /** 基础字号（px） */
  basePx: number;
  /** 移动端字号 */
  mobile: string;
  /** 桌面端字号 */
  desktop: string;
  /** Tailwind 类建议 */
  tailwindClasses: string;
}

/**
 * 可见性建议
 */
export interface VisibilitySuggestion {
  /** 节点 ID */
  nodeId: string;
  /** 节点名称 */
  nodeName: string;
  /** 建议的可见性类 */
  visibilityClasses: string;
  /** 说明 */
  reason: string;
}

/**
 * 响应式建议条目
 */
export interface ResponsiveSuggestion {
  /** 建议类型 */
  type: 'layout' | 'font-size' | 'visibility' | 'class';
  /** 建议消息 */
  message: string;
}

/**
 * 响应式推断结果
 */
export interface ResponsiveResult {
  /** 推断的主要目标设备 */
  inferredDevice: DeviceType;
  /** 设计稿宽度 */
  designWidth: number;
  /** 推断的设计稿高度 */
  designHeight?: number;
  /** 断点配置建议 */
  breakpoints: Breakpoint[];
  /** 布局方向建议 */
  layoutSuggestions: LayoutDirectionSuggestion[];
  /** 响应式类建议 */
  classSuggestions: ResponsiveClassSuggestion[];
  /** 字号响应式建议 */
  fontSizeSuggestions: FontSizeSuggestion[];
  /** 可见性建议 */
  visibilitySuggestions: VisibilitySuggestion[];
  /** 总体建议文本 */
  recommendations: string[];
  /** 响应式建议列表 */
  suggestions: ResponsiveSuggestion[];
  /** 建议总数 */
  suggestionsCount: number;
}

// ============ 常量定义 ============

/**
 * Tailwind 默认断点（基于 min-width）
 */
const TAILWIND_BREAKPOINTS: Breakpoint[] = [
  { name: 'sm', minWidth: 640, description: '小屏幕（手机横屏）' },
  { name: 'md', minWidth: 768, description: '中等屏幕（平板）' },
  { name: 'lg', minWidth: 1024, description: '大屏幕（笔记本/桌面）' },
  { name: 'xl', minWidth: 1280, description: '超大屏幕（桌面）' },
  { name: '2xl', minWidth: 1536, description: '2K 大屏' },
];

/**
 * 移动端最大宽度
 */
const MOBILE_MAX_WIDTH = 767;

/**
 * 平板最大宽度
 */
const TABLET_MAX_WIDTH = 1023;

// ============ ResponsiveInferrer 类 ============

/**
 * 响应式断点推断器
 *
 * 分析设计稿尺寸和布局结构，生成响应式实现建议。
 */
export class ResponsiveInferrer {
  /** i18n 实例 */
  private _i18n = getI18n();

  /**
   * 分析设计上下文，生成响应式建议
   *
   * @param context - 设计上下文
   * @returns 响应式推断结果
   */
  infer(context: DesignContext): ResponsiveResult {
    const root = context.node;
    const width = root.size?.width || 0;
    const height = root.size?.height;

    // ============ 1. 推断目标设备 ============
    const device = this._inferDeviceType(width);

    // ============ 2. 分析布局方向 ============
    const layoutSuggestions = this._analyzeLayoutDirections(root, device);

    // ============ 3. 生成响应式类建议 ============
    const classSuggestions = this._generateClassSuggestions(root, device);

    // ============ 4. 字号响应式建议 ============
    const fontSizeSuggestions = this._generateFontSizeSuggestions(root, device);

    // ============ 5. 可见性建议 ============
    const visibilitySuggestions = this._analyzeVisibility(root);

    // ============ 6. 综合建议 ============
    const recommendations = this._generateRecommendations(device, width, root);

    // ============ 7. 生成结构化建议 ============
    const suggestions = this._generateStructuredSuggestions(
      device,
      layoutSuggestions,
      classSuggestions,
      fontSizeSuggestions,
      visibilitySuggestions,
    );

    return {
      inferredDevice: device,
      designWidth: width,
      designHeight: height,
      breakpoints: TAILWIND_BREAKPOINTS,
      layoutSuggestions,
      classSuggestions,
      fontSizeSuggestions,
      visibilitySuggestions,
      recommendations,
      suggestions,
      suggestionsCount: suggestions.length,
    };
  }

  /**
   * 根据宽度推断设备类型
   */
  private _inferDeviceType(width: number): DeviceType {
    if (width <= MOBILE_MAX_WIDTH) return 'mobile';
    if (width <= TABLET_MAX_WIDTH) return 'tablet';
    return 'desktop';
  }

  /**
   * 分析布局方向
   */
  private _analyzeLayoutDirections(
    root: ProcessedNode,
    device: DeviceType,
  ): LayoutDirectionSuggestion[] {
    const suggestions: LayoutDirectionSuggestion[] = [];

    const traverse = (node: ProcessedNode): void => {
      if (node.visible === false) {
        if (node.children) node.children.forEach(traverse);
        return;
      }

      if (node.layout?.mode === 'HORIZONTAL' && node.children && node.children.length >= 2) {
        const hasImportantChildren = node.children.some(
          (c) => c.role === 'text' || c.originalType === 'TEXT' || c.children?.length,
        );

        if (hasImportantChildren) {
          if (device !== 'mobile') {
            suggestions.push({
              breakpoint: 'base (mobile)',
              direction: 'flex-col',
              description: `节点 "${node.name}" 在移动端建议改为垂直布局`,
            });
            suggestions.push({
              breakpoint: 'md+',
              direction: 'flex-row',
              description: `节点 "${node.name}" 在 md 断点及以上保持水平布局`,
            });
          } else {
            suggestions.push({
              breakpoint: 'base',
              direction: 'flex-col',
              description: `节点 "${node.name}" 建议使用垂直布局（移动端设计稿）`,
            });
          }
        }
      }

      if (node.children) {
        node.children.forEach(traverse);
      }
    };

    traverse(root);

    const seen = new Set<string>();
    return suggestions.filter((s) => {
      const key = `${s.breakpoint}-${s.direction}-${s.description}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * 生成响应式类建议
   */
  private _generateClassSuggestions(
    root: ProcessedNode,
    device: DeviceType,
  ): ResponsiveClassSuggestion[] {
    const suggestions: ResponsiveClassSuggestion[] = [];

    const traverse = (node: ProcessedNode): void => {
      if (node.visible === false) {
        if (node.children) node.children.forEach(traverse);
        return;
      }

      if (node.layout) {
        const padding = node.layout.padding;
        const hasLargePadding =
          padding && (padding.top > 24 || padding.right > 24 || padding.bottom > 24 || padding.left > 24);
        const hasLargeGap = node.layout.itemSpacing > 24;

        if ((hasLargePadding || hasLargeGap) && device === 'desktop') {
          suggestions.push({
            nodeId: node.figmaId,
            nodeName: node.name,
            baseClasses: 'p-8 gap-8',
            responsiveClasses: 'p-4 gap-4 md:p-6 md:gap-6 lg:p-8 lg:gap-8',
            reason: '大间距在移动端需要缩小',
          });
        }
      }

      if (node.children) {
        node.children.forEach(traverse);
      }
    };

    traverse(root);
    return suggestions;
  }

  /**
   * 生成字号响应式建议
   */
  private _generateFontSizeSuggestions(
    root: ProcessedNode,
    device: DeviceType,
  ): FontSizeSuggestion[] {
    const sizeMap = new Map<number, number>();

    const traverse = (node: ProcessedNode): void => {
      if (node.textStyle?.fontSize) {
        const size = node.textStyle.fontSize;
        sizeMap.set(size, (sizeMap.get(size) || 0) + 1);
      }
      if (node.children) {
        node.children.forEach(traverse);
      }
    };

    traverse(root);

    const suggestions: FontSizeSuggestion[] = [];

    for (const [px, _count] of sizeMap.entries()) {
      if (px >= 24 && device === 'desktop') {
        let mobilePx = px;
        if (px >= 48) mobilePx = 30;
        else if (px >= 36) mobilePx = 24;
        else if (px >= 30) mobilePx = 20;
        else if (px >= 24) mobilePx = 18;

        const mobileClass = this._getFontSizeClass(mobilePx);
        const desktopClass = this._getFontSizeClass(px);

        suggestions.push({
          basePx: px,
          mobile: mobileClass,
          desktop: desktopClass,
          tailwindClasses: `${mobileClass} md:${desktopClass}`,
        });
      }
    }

    return suggestions;
  }

  /**
   * 分析可见性（查找可能需要在不同设备隐藏的元素）
   */
  private _analyzeVisibility(root: ProcessedNode): VisibilitySuggestion[] {
    const suggestions: VisibilitySuggestion[] = [];

    const traverse = (node: ProcessedNode, parent: ProcessedNode | null): void => {
      if (node.visible === false) {
        if (node.children) node.children.forEach((c) => traverse(c, node));
        return;
      }

      const name = node.name.toLowerCase();

      if (
        parent &&
        (name.includes('decoration') ||
          name.includes('ornament') ||
          name.includes('bg') ||
          name.includes('装饰') ||
          name.includes('背景'))
      ) {
        suggestions.push({
          nodeId: node.figmaId,
          nodeName: node.name,
          visibilityClasses: 'hidden md:block',
          reason: '装饰性元素可在移动端隐藏以节省空间',
        });
      }

      if (name.includes('sidebar') || name.includes('aside') || name.includes('侧边栏')) {
        suggestions.push({
          nodeId: node.figmaId,
          nodeName: node.name,
          visibilityClasses: 'hidden lg:block (移动端建议用 Drawer 组件)',
          reason: '侧边栏在移动端建议改为抽屉式交互',
        });
      }

      if (node.children) {
        node.children.forEach((c) => traverse(c, node));
      }
    };

    traverse(root, null);
    return suggestions;
  }

  /**
   * 生成综合建议
   */
  private _generateRecommendations(
    device: DeviceType,
    width: number,
    root: ProcessedNode,
  ): string[] {
    const recommendations: string[] = [];
    const msg = this._i18n.getMessages() as Record<string, Record<string, string>>;
    const responsiveMsg = msg.responsive || {};

    recommendations.push(`📱 ${responsiveMsg.inferredDevice || '推断设备'}: ${this._getDeviceName(device)} (${width}px)`);
    recommendations.push('');

    if (device === 'desktop') {
      recommendations.push('💡 桌面端设计稿响应式建议：');
      recommendations.push('  - 基础样式按移动端优先（mobile-first）编写');
      recommendations.push('  - 使用 sm: (640px+) / md: (768px+) / lg: (1024px+) 前缀渐进增强');
      recommendations.push(`  - ${responsiveMsg.mobileFlexCol || '移动端建议使用垂直布局（flex-col）'}`);
      recommendations.push(`  - ${responsiveMsg.desktopFlexRow || '桌面端保持水平布局（flex-row）'}`);
      recommendations.push('  - 大标题字号建议响应式缩小');
      recommendations.push('  - 装饰性元素可考虑在移动端隐藏（hidden md:block）');
    } else if (device === 'mobile') {
      recommendations.push('💡 移动端设计稿响应式建议：');
      recommendations.push('  - 保持垂直布局（flex-col）');
      recommendations.push('  - 在 md: 断点（768px+）适配平板和桌面');
      recommendations.push('  - 可考虑为大屏幕添加更宽松的间距');
    } else {
      recommendations.push('💡 平板设计稿响应式建议：');
      recommendations.push('  - 基础样式适配平板');
      recommendations.push('  - sm: 调整为移动端样式');
      recommendations.push('  - lg: 调整为桌面端样式');
    }

    const columnCount = this._countTopLevelColumns(root);
    if (columnCount >= 2 && device === 'desktop') {
      recommendations.push('');
      recommendations.push(`  - 检测到 ${columnCount} 列布局，建议移动端改为单列堆叠`);
    }

    return recommendations;
  }

  /**
   * 生成结构化建议列表
   */
  private _generateStructuredSuggestions(
    _device: DeviceType,
    layoutSuggestions: LayoutDirectionSuggestion[],
    classSuggestions: ResponsiveClassSuggestion[],
    fontSizeSuggestions: FontSizeSuggestion[],
    visibilitySuggestions: VisibilitySuggestion[],
  ): ResponsiveSuggestion[] {
    const suggestions: ResponsiveSuggestion[] = [];

    for (const ls of layoutSuggestions.slice(0, 5)) {
      suggestions.push({
        type: 'layout',
        message: ls.description,
      });
    }

    for (const cs of classSuggestions.slice(0, 5)) {
      suggestions.push({
        type: 'class',
        message: cs.reason + `: ${cs.responsiveClasses}`,
      });
    }

    for (const fs of fontSizeSuggestions.slice(0, 5)) {
      suggestions.push({
        type: 'font-size',
        message: `${fs.basePx}px 字号建议响应式调整: ${fs.tailwindClasses}`,
      });
    }

    for (const vs of visibilitySuggestions.slice(0, 5)) {
      suggestions.push({
        type: 'visibility',
        message: vs.reason + `: ${vs.visibilityClasses}`,
      });
    }

    return suggestions;
  }

  /**
   * 统计顶层列数
   */
  private _countTopLevelColumns(root: ProcessedNode): number {
    if (!root.children || root.children.length === 0) return 0;
    if (root.layout?.mode === 'HORIZONTAL') {
      return root.children.filter((c) => c.visible !== false).length;
    }
    const firstHorizontal = root.children.find((c) => c.layout?.mode === 'HORIZONTAL');
    if (firstHorizontal?.children) {
      return firstHorizontal.children.filter((c) => c.visible !== false).length;
    }
    return 0;
  }

  /**
   * 获取设备名称
   */
  private _getDeviceName(device: DeviceType): string {
    const msg = this._i18n.getMessages() as Record<string, Record<string, string>>;
    const responsiveMsg = msg.responsive || {};
    switch (device) {
      case 'mobile':
        return responsiveMsg.mobile || '移动端';
      case 'tablet':
        return responsiveMsg.tablet || '平板';
      case 'desktop':
        return responsiveMsg.desktop || '桌面端';
    }
  }

  /**
   * 根据像素获取 Tailwind 字号类
   */
  private _getFontSizeClass(px: number): string {
    const sizeMap: Record<number, string> = {
      12: 'text-xs',
      14: 'text-sm',
      16: 'text-base',
      18: 'text-lg',
      20: 'text-xl',
      24: 'text-2xl',
      30: 'text-3xl',
      36: 'text-4xl',
      48: 'text-5xl',
      60: 'text-6xl',
      72: 'text-7xl',
    };
    return sizeMap[px] || `text-[${px}px]`;
  }
}

// ============ 工厂函数 ============

/**
 * 创建响应式推断器实例
 *
 * @returns ResponsiveInferrer 实例
 */
export function createResponsiveInferrer(): ResponsiveInferrer {
  return new ResponsiveInferrer();
}

/**
 * 便捷函数：直接分析设计上下文生成响应式建议
 *
 * @param context - 设计上下文
 * @returns 响应式推断结果
 */
export function inferResponsive(context: DesignContext): ResponsiveResult {
  const inferrer = createResponsiveInferrer();
  return inferrer.infer(context);
}
