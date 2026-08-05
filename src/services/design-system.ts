/**
 * 设计系统分析服务
 *
 * 分析设计稿中使用的颜色、间距、圆角、阴影、字体等，生成设计 Token 建议：
 * 1. 提取主要颜色并建议标准化为 CSS 变量/Tailwind 主题色
 * 2. 分析间距使用频率，建议统一的 spacing scale
 * 3. 识别圆角值，建议统一的 radius scale
 * 4. 提取阴影样式，建议 shadow token
 * 5. 分析字体层级，建议 typography scale
 * 6. 生成 @theme inline 代码块，可直接复制到 Tailwind v4 配置
 *
 * @module
 */

import { getI18n } from '../i18n/index.js';
import type { DesignContext, ProcessedNode } from '../types/nodes.js';

// ============ 类型定义 ============

/**
 * 颜色建议
 */
export interface ColorSuggestion {
  /** 原始颜色值（hex） */
  original: string;
  /** 建议的 Token 名称 */
  suggestedName: string;
  /** 使用频次 */
  usageCount: number;
  /** 建议描述 */
  description: string;
}

/**
 * 间距 Token 建议
 */
export interface SpacingTokenSuggestion {
  /** 原始间距值（px） */
  originalValue: number;
  /** 建议的 Token 名称 */
  suggestedName: string;
  /** 使用频次 */
  usageCount: number;
}

/**
 * 圆角 Token 建议
 */
export interface RadiusTokenSuggestion {
  /** 原始圆角值（px） */
  originalValue: number;
  /** 建议的 Token 名称 */
  suggestedName: string;
  /** 使用频次 */
  usageCount: number;
}

/**
 * 字体层级建议
 */
export interface TypographySuggestion {
  /** 字号（px） */
  fontSize: number;
  /** 字重 */
  fontWeight: number;
  /** 建议的 Token 名称 */
  suggestedName: string;
  /** 使用频次 */
  usageCount: number;
  /** 行高（px，可选） */
  lineHeight?: number;
}

/**
 * 设计系统建议条目
 */
export interface DesignSystemSuggestion {
  /** 建议类型 */
  type: 'color' | 'spacing' | 'radius' | 'shadow' | 'typography';
  /** 建议消息 */
  message: string;
  /** 相关值 */
  value?: string;
}

/**
 * 设计系统分析结果
 */
export interface DesignSystemResult {
  /** 颜色建议 */
  colorSuggestions: ColorSuggestion[];
  /** 间距 Token 建议 */
  spacingTokens: SpacingTokenSuggestion[];
  /** 圆角 Token 建议 */
  radiusTokens: RadiusTokenSuggestion[];
  /** 字体层级建议 */
  typographySuggestions: TypographySuggestion[];
  /** 设计系统建议列表 */
  suggestions: DesignSystemSuggestion[];
  /** 分析摘要 */
  summary: {
    /** 分析的颜色数量 */
    colorsAnalyzed: number;
    /** 分析的间距数量 */
    spacingAnalyzed: number;
    /** 分析的字号数量 */
    fontsAnalyzed: number;
  };
  /** 生成的 @theme inline CSS 代码 */
  themeExtensions: string;
  /** 建议总数 */
  suggestionsCount: number;
}

// ============ 常量定义 ============

/**
 * 间距预设映射
 */
const SPACING_PRESET: Record<number, string> = {
  0: '0',
  1: 'px',
  2: '0.5',
  4: '1',
  6: '1.5',
  8: '2',
  10: '2.5',
  12: '3',
  14: '3.5',
  16: '4',
  20: '5',
  24: '6',
  28: '7',
  32: '8',
  40: '10',
  48: '12',
  56: '14',
  64: '16',
  80: '20',
  96: '24',
  112: '28',
  128: '32',
};

/**
 * 圆角预设映射
 */
const RADIUS_PRESET: Record<number, string> = {
  0: 'none',
  2: 'sm',
  4: 'DEFAULT',
  6: 'md',
  8: 'lg',
  12: 'xl',
  16: '2xl',
  24: '3xl',
};

// ============ DesignSystemAnalyzer 类 ============

/**
 * 设计系统分析器
 *
 * 遍历设计上下文中的节点，分析颜色、间距、圆角、字体等使用情况，
 * 生成标准化的 Token 建议和可直接使用的 Tailwind v4 @theme 代码。
 */
export class DesignSystemAnalyzer {
  /** i18n 实例 */
  private _i18n = getI18n();

  /**
   * 分析设计上下文，生成设计系统建议
   *
   * @param context - 设计上下文
   * @returns 设计系统分析结果
   */
  analyze(context: DesignContext): DesignSystemResult {
    const colorFrequency = new Map<string, number>();
    const spacingFrequency = new Map<number, number>();
    const radiusFrequency = new Map<number, number>();
    const fontFrequency = new Map<string, number>();

    // ============ 1. 遍历节点收集统计数据 ============
    this._collectStats(context.node, colorFrequency, spacingFrequency, radiusFrequency, fontFrequency);

    // ============ 2. 生成颜色建议 ============
    const colorSuggestions = this._generateColorSuggestions(colorFrequency);

    // ============ 3. 生成间距 Token 建议 ============
    const spacingTokens = this._generateSpacingSuggestions(spacingFrequency);

    // ============ 4. 生成圆角 Token 建议 ============
    const radiusTokens = this._generateRadiusSuggestions(radiusFrequency);

    // ============ 5. 生成字体层级建议 ============
    const typographySuggestions = this._generateTypographySuggestions(fontFrequency);

    // ============ 6. 生成建议列表 ============
    const suggestions = this._generateSuggestions(colorSuggestions, spacingTokens, radiusTokens, typographySuggestions);

    // ============ 7. 生成 @theme inline 代码 ============
    const themeExtensions = this._generateThemeExtensions(colorSuggestions, spacingTokens, radiusTokens);

    return {
      colorSuggestions,
      spacingTokens,
      radiusTokens,
      typographySuggestions,
      suggestions,
      summary: {
        colorsAnalyzed: colorFrequency.size,
        spacingAnalyzed: spacingFrequency.size,
        fontsAnalyzed: fontFrequency.size,
      },
      themeExtensions,
      suggestionsCount: suggestions.length,
    };
  }

  /**
   * 递归收集节点统计数据
   */
  private _collectStats(
    node: ProcessedNode,
    colors: Map<string, number>,
    spacings: Map<number, number>,
    radii: Map<number, number>,
    fonts: Map<string, number>,
  ): void {
    if (node.visible === false) {
      if (node.children)
        (node.children as ProcessedNode[]).forEach((c) => this._collectStats(c, colors, spacings, radii, fonts));
      return;
    }

    // 收集填充颜色
    if (node.fills) {
      for (const fill of node.fills) {
        if (fill.type === 'solid' && fill.color) {
          const hex = this._colorToHex(fill.color);
          if (hex && !this._isTransparent(fill.color)) {
            colors.set(hex, (colors.get(hex) || 0) + 1);
          }
        }
      }
    }

    // 收集描边颜色
    if (node.strokes) {
      for (const stroke of node.strokes) {
        if (stroke.color) {
          const hex = this._colorToHex(stroke.color);
          if (hex && !this._isTransparent(stroke.color)) {
            colors.set(hex, (colors.get(hex) || 0) + 1);
          }
        }
      }
    }

    // 收集间距（padding 和 gap）
    if (node.layout) {
      const padding = node.layout.padding;
      if (padding) {
        for (const p of [padding.top, padding.right, padding.bottom, padding.left]) {
          if (p > 0) spacings.set(p, (spacings.get(p) || 0) + 1);
        }
      }
      if (node.layout.itemSpacing > 0) {
        spacings.set(node.layout.itemSpacing, (spacings.get(node.layout.itemSpacing) || 0) + 1);
      }
    }

    // 收集圆角
    if (node.cornerRadius) {
      const r = node.cornerRadius;
      if (r.uniform) {
        if (r.topLeft > 0) radii.set(r.topLeft, (radii.get(r.topLeft) || 0) + 1);
      } else {
        for (const rv of [r.topLeft, r.topRight, r.bottomRight, r.bottomLeft]) {
          if (rv > 0) radii.set(rv, (radii.get(rv) || 0) + 1);
        }
      }
    }

    // 收集字体信息
    if (node.textStyle) {
      const key = `${node.textStyle.fontSize}-${node.textStyle.fontWeight}`;
      fonts.set(key, (fonts.get(key) || 0) + 1);
    }

    // 递归子节点
    if (node.children) {
      for (const child of node.children as ProcessedNode[]) {
        this._collectStats(child, colors, spacings, radii, fonts);
      }
    }
  }

  /**
   * 将颜色对象转换为 hex 字符串
   */
  private _colorToHex(color: { r: number; g: number; b: number; a?: number }): string | null {
    const r = Math.round((color.r ?? 0) * 255);
    const g = Math.round((color.g ?? 0) * 255);
    const b = Math.round((color.b ?? 0) * 255);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  /**
   * 判断颜色是否接近透明
   */
  private _isTransparent(color: { a?: number }): boolean {
    return (color.a ?? 1) < 0.1;
  }

  /**
   * 生成颜色建议
   */
  private _generateColorSuggestions(colorFreq: Map<string, number>): ColorSuggestion[] {
    const sorted = Array.from(colorFreq.entries()).sort((a, b) => b[1] - a[1]);
    const suggestions: ColorSuggestion[] = [];

    const _nameMap: Record<string, string> = {};
    let neutralIdx = 0;
    let primaryIdx = 0;
    let accentIdx = 0;

    for (const [hex, count] of sorted) {
      let name: string;
      const r = Number.parseInt(hex.slice(1, 3), 16);
      const g = Number.parseInt(hex.slice(3, 5), 16);
      const b = Number.parseInt(hex.slice(5, 7), 16);

      if (r === g && g === b) {
        if (r > 240) name = 'background';
        else if (r > 200) name = 'surface';
        else if (r > 150) name = `neutral-${300 + neutralIdx * 100}`;
        else if (r > 100) name = `neutral-${500 + neutralIdx * 100}`;
        else if (r > 50) name = `neutral-${700 + neutralIdx * 100}`;
        else name = 'foreground';
        neutralIdx++;
      } else {
        const max = Math.max(r, g, b);
        if (r === max) {
          name = primaryIdx === 0 ? 'primary' : `accent-${accentIdx++}`;
          primaryIdx++;
        } else if (g === max) {
          name = `success-${500}`;
        } else {
          name = `accent-${accentIdx++}`;
        }
      }

      suggestions.push({
        original: hex,
        suggestedName: name,
        usageCount: count,
        description: `颜色 ${hex} 被使用 ${count} 次`,
      });
    }

    return suggestions.slice(0, 15);
  }

  /**
   * 生成间距建议
   */
  private _generateSpacingSuggestions(spacingFreq: Map<number, number>): SpacingTokenSuggestion[] {
    const sorted = Array.from(spacingFreq.entries()).sort((a, b) => b[1] - a[1]);
    return sorted.slice(0, 10).map(([value, count]) => ({
      originalValue: value,
      suggestedName: SPACING_PRESET[value] || `[${value}px]`,
      usageCount: count,
    }));
  }

  /**
   * 生成圆角建议
   */
  private _generateRadiusSuggestions(radiusFreq: Map<number, number>): RadiusTokenSuggestion[] {
    const sorted = Array.from(radiusFreq.entries()).sort((a, b) => b[1] - a[1]);
    return sorted.slice(0, 6).map(([value, count]) => ({
      originalValue: value,
      suggestedName: RADIUS_PRESET[value] || `[${value}px]`,
      usageCount: count,
    }));
  }

  /**
   * 生成字体层级建议
   */
  private _generateTypographySuggestions(fontFreq: Map<string, number>): TypographySuggestion[] {
    const sorted = Array.from(fontFreq.entries()).sort((a, b) => b[1] - a[1]);
    const suggestions: TypographySuggestion[] = [];

    const sizeNames: Record<number, string> = {
      12: 'xs',
      14: 'sm',
      16: 'base',
      18: 'lg',
      20: 'xl',
      24: '2xl',
      30: '3xl',
      36: '4xl',
      48: '5xl',
      60: '6xl',
      72: '7xl',
    };

    for (const [key, count] of sorted.slice(0, 8)) {
      const parts = key.split('-').map(Number);
      const fontSize = parts[0] ?? 16;
      const fontWeight = parts[1] ?? 400;
      if (!Number.isFinite(fontSize) || !Number.isFinite(fontWeight)) continue;
      const sizeName = sizeNames[fontSize] || `[${fontSize}px]`;
      const weightClass = fontWeight >= 700 ? ' font-bold' : fontWeight >= 600 ? ' font-semibold' : '';
      suggestions.push({
        fontSize,
        fontWeight,
        suggestedName: `text-${sizeName}${weightClass}`,
        usageCount: count,
      });
    }

    return suggestions;
  }

  /**
   * 生成建议列表
   */
  private _generateSuggestions(
    colors: ColorSuggestion[],
    spacings: SpacingTokenSuggestion[],
    radii: RadiusTokenSuggestion[],
    typography: TypographySuggestion[],
  ): DesignSystemSuggestion[] {
    const suggestions: DesignSystemSuggestion[] = [];
    const msg = this._i18n.getMessages() as Record<string, Record<string, string | ((...args: unknown[]) => string)>>;
    const dsMsg = msg.designSystem || {};

    if (colors.length > 0) {
      suggestions.push({
        type: 'color',
        message:
          typeof dsMsg.colorSuggestions === 'function'
            ? dsMsg.colorSuggestions(colors.length)
            : `检测到 ${colors.length} 种主要颜色，建议统一为 CSS 变量`,
      });
    }

    if (spacings.length > 0) {
      suggestions.push({
        type: 'spacing',
        message:
          typeof dsMsg.spacingSuggestions === 'function'
            ? dsMsg.spacingSuggestions(spacings.length)
            : `检测到 ${spacings.length} 种常用间距，建议纳入 spacing scale`,
      });
    }

    if (radii.length > 0) {
      suggestions.push({
        type: 'radius',
        message:
          typeof dsMsg.radiusSuggestions === 'function'
            ? dsMsg.radiusSuggestions(radii.length)
            : `检测到 ${radii.length} 种圆角值，建议统一为 rounded 系列`,
      });
    }

    if (typography.length > 0) {
      suggestions.push({
        type: 'typography',
        message:
          typeof dsMsg.typographySuggestions === 'function'
            ? dsMsg.typographySuggestions(typography.length)
            : `检测到 ${typography.length} 种字体层级，建议统一字号比例`,
      });
    }

    return suggestions;
  }

  /**
   * 生成 @theme inline CSS 代码
   */
  private _generateThemeExtensions(
    colors: ColorSuggestion[],
    spacings: SpacingTokenSuggestion[],
    radii: RadiusTokenSuggestion[],
  ): string {
    const lines: string[] = ['@theme inline {'];

    // 颜色变量
    for (const color of colors.slice(0, 10)) {
      if (!color.suggestedName.includes('[') && !color.suggestedName.startsWith('[')) {
        lines.push(`  --color-${color.suggestedName}: ${color.original};`);
      }
    }

    // 间距变量（非预设值才需要扩展）
    const presetSpacings = new Set(Object.keys(SPACING_PRESET).map(Number));
    for (const sp of spacings.slice(0, 8)) {
      if (!presetSpacings.has(sp.originalValue) && !sp.suggestedName.includes('[')) {
        lines.push(`  --spacing-${sp.suggestedName}: ${sp.originalValue}px;`);
      } else if (sp.suggestedName.startsWith('[')) {
        // 任意值建议用一个有意义的名称
        lines.push(`  --spacing-${Math.round(sp.originalValue)}: ${sp.originalValue}px;`);
      }
    }

    // 圆角变量（非预设值才需要扩展）
    const presetRadii = new Set(Object.keys(RADIUS_PRESET).map(Number));
    for (const rad of radii.slice(0, 6)) {
      if (!presetRadii.has(rad.originalValue) && !rad.suggestedName.includes('[')) {
        lines.push(`  --radius-${rad.suggestedName}: ${rad.originalValue}px;`);
      } else if (rad.suggestedName.startsWith('[')) {
        lines.push(`  --radius-${Math.round(rad.originalValue)}: ${rad.originalValue}px;`);
      }
    }

    lines.push('}');
    return lines.join('\n');
  }
}

// ============ 工厂函数 ============

/**
 * 创建设计系统分析器实例
 *
 * @returns DesignSystemAnalyzer 实例
 */
export function createDesignSystemAnalyzer(): DesignSystemAnalyzer {
  return new DesignSystemAnalyzer();
}

/**
 * 便捷函数：直接分析设计上下文生成设计系统建议
 *
 * @param context - 设计上下文
 * @returns 设计系统分析结果
 */
export function analyzeDesignSystem(context: DesignContext): DesignSystemResult {
  const analyzer = createDesignSystemAnalyzer();
  return analyzer.analyze(context);
}
