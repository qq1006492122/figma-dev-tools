/**
 * Token 匹配器 - Token Matcher
 *
 * 将原始 Figma 样式值（hex 颜色、px 间距、px 圆角、字号/字重等）映射到
 * 项目已有的 Tailwind 工具类名（text-primary、bg-neutral-50、rounded-lg 等），
 * 避免在生成的代码中写死 hex/px 值。
 *
 * **匹配优先级链（从高到低）：**
 * 1. **codeSyntax 精确匹配**：Figma Variables 中开发者显式指定的 `codeSyntax.WEB` 值，
 *    这是最可靠的来源，直接使用开发者在 Figma 中定义的 token 名
 * 2. **系统 Token 精确匹配**：内联的设计系统色板/间距/圆角/字号表中的精确值匹配
 * 3. **最近邻模糊匹配**：色差/数值差在可接受阈值内的近似匹配，附带 confidence 值
 * 4. **@theme 扩展兜底**：返回原始值，标记 `needsExtension: true`，提示需要在
 *    Tailwind `@theme inline` 中扩展自定义 token
 *
 * @module
 */

// ============ 类型定义 ============

/**
 * Token 匹配结果
 *
 * @typeParam T - Token 值的类型（颜色为 string，数值为 number 等）
 */
export interface TokenMatch<T = string> {
  /** 是否成功匹配到已有 token */
  matched: boolean;
  /** Tailwind 类名片段（如 "text-primary-500"、"p-4"、"rounded-lg"） */
  className?: string;
  /** CSS 变量名（如 "--color-primary"），用于 CSS Variables 输出 */
  cssVar?: string;
  /** 匹配到的 token 值（如 "primary-500"、"4"、"lg"） */
  tokenValue?: T;
  /** 原始输入值（用于 @theme 扩展兜底） */
  originalValue: T;
  /** 匹配置信度（1=精确匹配，0-1=模糊匹配，0=未匹配） */
  confidence: number;
  /** 是否需要走 @theme inline 扩展（即未匹配到任何系统 token） */
  needsExtension: boolean;
}

/**
 * 颜色输入格式联合类型
 *
 * 支持两种输入方式：
 * - hex 字符串："#FF5500"、"#FF550080"（含 alpha）、"#F50"（简写）
 * - Figma 颜色对象：{ r: 0-1, g: 0-1, b: 0-1, a?: 0-1 }
 */
type ColorInput = string | { r: number; g: number; b: number; a?: number };

// ============ 设计系统 Tokens（内联常量） ============

/**
 * 系统颜色色板（内联自项目 tailwind-config）
 *
 * 包含 primary/success/error/neutral/cnexus 五个色系，
 * 每个色系包含 50-900 九个色阶和一个 DEFAULT 值。
 *
 * **匹配策略**：先精确匹配 hex，再按人眼感知色差做最近邻模糊匹配。
 */
const SYSTEM_COLORS = {
  primary: {
    DEFAULT: '#6274ff',
    50: '#eef0ff',
    100: '#dde2ff',
    200: '#b8c0ff',
    300: '#8f9aff',
    400: '#7187ff',
    500: '#6274ff',
    600: '#4a5aee',
    700: '#3545d6',
    800: '#2435b8',
    900: '#162093',
  },
  success: {
    DEFAULT: '#22c55e',
    50: '#f0fdf4',
    100: '#dcfce7',
    200: '#bbf7d0',
    300: '#86efac',
    400: '#4ade80',
    500: '#22c55e',
    600: '#16a34a',
    700: '#15803d',
    800: '#166534',
    900: '#14532d',
  },
  error: {
    DEFAULT: '#ef4444',
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
    800: '#991b1b',
    900: '#7f1d1d',
  },
  neutral: {
    DEFAULT: '#191b1c',
    50: '#fafafb',
    100: '#f2f2f2',
    200: '#ebebeb',
    300: '#e5e5e5',
    400: '#a1a1a1',
    500: '#85868c',
    600: '#5b6066',
    700: '#383a42',
    800: '#26292c',
    900: '#191b1c',
  },
  cnexus: {
    DEFAULT: '#06AB8A',
    50: '#ecfdf5',
    100: '#d1fae5',
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',
    500: '#06AB8A',
    600: '#059669',
    700: '#047857',
    800: '#065f46',
    900: '#064e3b',
  },
} as const;

/**
 * 系统圆角映射表
 *
 * 对齐 Tailwind 默认圆角尺度：
 * - rounded-none: 0px
 * - rounded-sm: 4px
 * - rounded: 10px (项目定制值，非 Tailwind 默认 4px)
 * - rounded-md: 6px
 * - rounded-lg: 12px
 * - rounded-xl: 16px
 * - rounded-2xl: 24px
 * - rounded-full: 9999px (圆形)
 */
const SYSTEM_RADII: ReadonlyArray<{ readonly key: string; readonly px: number; readonly varName: string }> = [
  { key: 'rounded-none', px: 0, varName: 'none' },
  { key: 'rounded-sm', px: 4, varName: 'sm' },
  { key: 'rounded', px: 10, varName: 'DEFAULT' },
  { key: 'rounded-md', px: 6, varName: 'md' },
  { key: 'rounded-lg', px: 12, varName: 'lg' },
  { key: 'rounded-xl', px: 16, varName: 'xl' },
  { key: 'rounded-2xl', px: 24, varName: '2xl' },
  { key: 'rounded-full', px: 9999, varName: 'full' },
];

// ============ 颜色转换工具函数 ============

/**
 * 将颜色输入统一解析为 0-255 RGB 值
 *
 * @param input - 颜色输入（hex 字符串或 Figma 颜色对象）
 * @returns 标准化的 RGBA 值（r/g/b: 0-255, a: 0-1）
 */
function parseColor(input: ColorInput): { r: number; g: number; b: number; a: number } {
  if (typeof input === 'string') return hexToRgb(input);
  return {
    r: Math.round(input.r * 255),
    g: Math.round(input.g * 255),
    b: Math.round(input.b * 255),
    a: input.a !== undefined ? input.a : 1,
  };
}

/**
 * 将 Hex 颜色字符串转换为 RGB 对象
 *
 * 支持格式：
 * - 3位简写：#RGB → #RRGGBB
 * - 6位标准：#RRGGBB
 * - 8位带alpha：#RRGGBBAA
 *
 * @param hex - Hex 颜色字符串（带或不带 # 前缀）
 * @returns RGBA 对象（r/g/b: 0-255, a: 0-1）
 */
function hexToRgb(hex: string): { r: number; g: number; b: number; a: number } {
  let h = hex.replace('#', '');
  // 3位简写展开为6位
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  // 8位 hex 包含 alpha 通道
  if (h.length === 8) {
    return {
      r: Number.parseInt(h.slice(0, 2), 16),
      g: Number.parseInt(h.slice(2, 4), 16),
      b: Number.parseInt(h.slice(4, 6), 16),
      a: Number.parseInt(h.slice(6, 8), 16) / 255,
    };
  }
  return {
    r: Number.parseInt(h.slice(0, 2), 16),
    g: Number.parseInt(h.slice(2, 4), 16),
    b: Number.parseInt(h.slice(4, 6), 16),
    a: 1,
  };
}

/**
 * 将 RGB 值转换为标准 Hex 字符串
 *
 * @param r - 红色通道 0-255
 * @param g - 绿色通道 0-255
 * @param b - 蓝色通道 0-255
 * @returns 6位大写 Hex 字符串（如 "#FF5500"）
 */
function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) =>
        Math.max(0, Math.min(255, Math.round(v)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
      .toUpperCase()
  );
}

/**
 * 计算两个颜色之间的感知加权欧氏距离
 *
 * **算法说明**：
 * 这不是完整的 CIE76 Lab 色差公式（CIE76 需要先转换到 Lab 颜色空间），
 * 而是一种在 RGB 空间中考虑人眼感知特性的近似算法（CompuPhase 近似）：
 *
 * 权重原理：
 * - 人眼对**绿色**变化最敏感 → G 通道权重最高（系数 4）
 * - 人眼对**蓝色**变化最不敏感 → B 通道权重最低
 * - R 通道权重根据平均亮度动态调整：
 *   - 暗色区域（rmean 小）：红色差异更明显
 *   - 亮色区域（rmean 大）：蓝色差异更明显
 *
 * 这种近似比纯欧氏距离更符合人眼感知，且计算速度远快于 CIE Lab 转换。
 *
 * **阈值参考**：
 * - 距离 < 12：人眼几乎无法区分（JND, Just Noticeable Difference）
 * - 距离 < 25：视觉上非常接近，可安全模糊匹配
 *
 * 参考：https://www.compuphase.com/cmetric.htm
 *
 * @param c1 - 颜色 1（0-255 RGB）
 * @param c2 - 颜色 2（0-255 RGB）
 * @returns 颜色距离值（0 = 完全相同，值越大差异越大）
 */
function colorDistance(c1: { r: number; g: number; b: number }, c2: { r: number; g: number; b: number }): number {
  const rmean = (c1.r + c2.r) / 2;
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  // 加权欧氏距离：红色通道权重随亮度变化，绿色通道固定高权重，蓝色通道固定低权重
  return Math.sqrt((2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db);
}

// ============ 颜色扁平化处理 ============

/**
 * 扁平化后的颜色条目
 *
 * 将嵌套的色板对象（如 { primary: { 500: '#xxx' } }）展开为一维数组，
 * 便于遍历查找。
 */
interface FlatColor {
  /** 大写 Hex 值，用于精确比较 */
  hex: string;
  /** 色系前缀（如 "primary"、"success"） */
  prefix: string;
  /** 色阶值（如 "50"、"500"、"DEFAULT"） */
  shade: string | 'DEFAULT';
}

/**
 * 将嵌套色板对象展开为一维 FlatColor 数组
 *
 * @param palette - 嵌套的色板常量对象
 * @returns 扁平化的颜色条目数组
 */
function flattenColors(palette: typeof SYSTEM_COLORS): FlatColor[] {
  const result: FlatColor[] = [];
  for (const [colorName, scale] of Object.entries(palette)) {
    for (const [shade, hex] of Object.entries(scale)) {
      if (typeof hex === 'string') {
        result.push({ hex: hex.toUpperCase(), prefix: colorName, shade });
      }
    }
  }
  return result;
}

/** 预计算的扁平化颜色列表（模块加载时一次性计算） */
const FLAT_COLORS: ReadonlyArray<FlatColor> = flattenColors(SYSTEM_COLORS);

// ============ 排版映射表 ============

/**
 * 字号映射表（像素 → Tailwind text-* 类名）
 *
 * 对齐 Tailwind 默认字号尺度。
 */
const FONT_SIZE_MAP: ReadonlyArray<{ readonly key: string; readonly px: number }> = [
  { key: 'text-xs', px: 12 },
  { key: 'text-sm', px: 14 },
  { key: 'text-base', px: 16 },
  { key: 'text-lg', px: 18 },
  { key: 'text-xl', px: 20 },
  { key: 'text-2xl', px: 24 },
  { key: 'text-3xl', px: 30 },
  { key: 'text-4xl', px: 36 },
  { key: 'text-5xl', px: 48 },
  { key: 'text-6xl', px: 60 },
];

/**
 * 字重映射表（数值 → Tailwind font-* 类名）
 */
const FONT_WEIGHT_MAP: Readonly<Record<number, string>> = {
  100: 'font-thin',
  200: 'font-extralight',
  300: 'font-light',
  400: 'font-normal',
  500: 'font-medium',
  600: 'font-semibold',
  700: 'font-bold',
  800: 'font-extrabold',
  900: 'font-black',
};

/**
 * 行高映射表（行高/字号比例 → Tailwind leading-* 类名）
 */
const LINE_HEIGHT_MAP: ReadonlyArray<{ readonly key: string; readonly ratio: number }> = [
  { key: 'leading-none', ratio: 1 },
  { key: 'leading-tight', ratio: 1.25 },
  { key: 'leading-snug', ratio: 1.375 },
  { key: 'leading-normal', ratio: 1.5 },
  { key: 'leading-relaxed', ratio: 1.625 },
  { key: 'leading-loose', ratio: 2 },
];

// ============ TokenMatcher 类 ============

/**
 * Token 匹配器类
 *
 * 将 Figma 原始样式值映射到 Tailwind 工具类名。
 * 单例模式，通过 {@link getTokenMatcher} 获取全局实例。
 *
 * 支持的匹配类型：
 * - {@link matchColor} 颜色匹配
 * - {@link matchRadius} 圆角匹配
 * - {@link matchSpacing} 间距匹配（padding/margin/gap/width/height）
 * - {@link matchFontSize} 字号匹配
 * - {@link matchFontWeight} 字重匹配
 * - {@link matchLineHeight} 行高匹配
 * - {@link matchLetterSpacing} 字间距匹配
 *
 * @example
 * ```typescript
 * const matcher = getTokenMatcher();
 * const result = matcher.matchColor('#6274ff', 'bg');
 * if (result.matched) {
 *   console.log(result.className); // "bg-primary-500"
 * }
 * ```
 */
export class TokenMatcher {
  /**
   * 颜色匹配
   *
   * 按优先级链匹配：codeSyntax → 透明色 → 精确匹配 → 模糊匹配 → @theme 扩展
   *
   * @param color - Figma 颜色 {r,g,b,a}（0-1 浮点数）或 hex 字符串
   * @param purpose - 用途前缀，决定生成的 Tailwind 类名前缀：
   *                  - 'text' → text-*（文字颜色）
   *                  - 'bg' → bg-*（背景色）
   *                  - 'border' → border-*（边框色）
   *                  - 'fill' → 无前缀（用于 gradient from-/via-/to-）
   * @param codeSyntax - Figma Variables codeSyntax.WEB 值（最高优先级），
   *                     如 "color.primary.500"、"--color-primary-500"
   * @returns Token 匹配结果，包含 className、confidence、needsExtension 等
   */
  matchColor(
    color: ColorInput,
    purpose: 'text' | 'bg' | 'border' | 'fill' = 'text',
    codeSyntax?: string,
  ): TokenMatch<string> {
    const parsed = parseColor(color);
    const hex = rgbToHex(parsed.r, parsed.g, parsed.b);
    const originalValue = typeof color === 'string' ? color : hex;

    // ============ 优先级1：codeSyntax 显式指定 ============
    // 开发者在 Figma Variables 中手动指定的代码语法名，可信度最高
    if (codeSyntax) {
      const tokenName = this._normalizeCodeSyntax(codeSyntax);
      return {
        matched: true,
        className: purpose === 'fill' ? tokenName : `${purpose}-${tokenName}`,
        cssVar: `--color-${tokenName}`,
        originalValue,
        tokenValue: tokenName,
        confidence: 1,
        needsExtension: false,
      };
    }

    // ============ 优先级2：完全透明色 → transparent ============
    if (parsed.a < 0.01) {
      return {
        matched: true,
        className: purpose === 'border' ? 'border-transparent' : `${purpose}-transparent`,
        originalValue,
        tokenValue: 'transparent',
        confidence: 1,
        needsExtension: false,
      };
    }

    // ============ 优先级3：系统色板精确匹配 ============
    const upperHex = hex.toUpperCase();
    const exact = FLAT_COLORS.find((c) => c.hex === upperHex);
    if (exact) {
      const tokenName = exact.shade === 'DEFAULT' ? exact.prefix : `${exact.prefix}-${exact.shade}`;
      return {
        matched: true,
        className: purpose === 'fill' ? tokenName : `${purpose}-${tokenName}`,
        cssVar: `--color-${tokenName}`,
        originalValue,
        tokenValue: tokenName,
        confidence: 1,
        needsExtension: false,
      };
    }

    // ============ 优先级4：最近邻模糊匹配（色差在阈值内） ============
    let bestMatch: FlatColor | null = null;
    let bestDistance = Infinity;
    for (const c of FLAT_COLORS) {
      const d = colorDistance(parsed, hexToRgb(c.hex));
      if (d < bestDistance) {
        bestDistance = d;
        bestMatch = c;
      }
    }

    // 色差阈值 12：人眼刚好能察觉的差异（JND）
    const COLOR_FUZZY_THRESHOLD = 12;
    if (bestMatch && bestDistance < COLOR_FUZZY_THRESHOLD) {
      const tokenName = bestMatch.shade === 'DEFAULT' ? bestMatch.prefix : `${bestMatch.prefix}-${bestMatch.shade}`;
      return {
        matched: true,
        className: purpose === 'fill' ? tokenName : `${purpose}-${tokenName}`,
        cssVar: `--color-${tokenName}`,
        originalValue,
        tokenValue: tokenName,
        confidence: 1 - bestDistance / COLOR_FUZZY_THRESHOLD,
        needsExtension: false,
      };
    }

    // ============ 优先级5：兜底 → @theme 扩展 ============
    return { matched: false, originalValue, confidence: 0, needsExtension: true };
  }

  /**
   * 圆角匹配
   *
   * 匹配策略：0 → rounded-none，精确值 → 对应类名，近似值（≤3px误差）→ 最近类名，
   * 超大圆角（≥100px）→ rounded-full，其余 → @theme 扩展
   *
   * @param px - 圆角像素值
   * @returns Token 匹配结果
   */
  matchRadius(px: number): TokenMatch<string> {
    // 0 或极小值 → 无圆角
    if (px <= 0.5) {
      return {
        matched: true,
        className: 'rounded-none',
        originalValue: `${px}px`,
        tokenValue: 'rounded-none',
        confidence: 1,
        needsExtension: false,
      };
    }

    // 精确匹配（0.5px 容差）
    const exact = SYSTEM_RADII.find((r) => Math.abs(r.px - px) < 0.5 && r.px !== 9999);
    if (exact) {
      return {
        matched: true,
        className: exact.key,
        cssVar: `--radius-${exact.varName === 'DEFAULT' ? '' : exact.varName}`,
        originalValue: `${px}px`,
        tokenValue: exact.key,
        confidence: 1,
        needsExtension: false,
      };
    }

    // 模糊匹配（3px 容差）
    let best: (typeof SYSTEM_RADII)[number] = SYSTEM_RADII[0]!;
    let bestDiff = Infinity;
    for (const r of SYSTEM_RADII) {
      if (r.px === 9999) continue; // 跳过 full，最后单独处理
      const diff = Math.abs(r.px - px);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = r;
      }
    }

    const RADIUS_FUZZY_THRESHOLD = 3;
    if (bestDiff <= RADIUS_FUZZY_THRESHOLD) {
      return {
        matched: true,
        className: best.key,
        originalValue: `${px}px`,
        tokenValue: best.key,
        confidence: 1 - bestDiff / (RADIUS_FUZZY_THRESHOLD * 2),
        needsExtension: false,
      };
    }

    // 超大圆角（胶囊/圆形）
    if (px >= 100) {
      return {
        matched: true,
        className: 'rounded-full',
        originalValue: `${px}px`,
        tokenValue: 'rounded-full',
        confidence: 0.8,
        needsExtension: false,
      };
    }

    // 兜底 → @theme 扩展
    return { matched: false, originalValue: `${px}px`, confidence: 0, needsExtension: true };
  }

  /**
   * 间距匹配（padding/margin/gap/width/height/position）
   *
   * Tailwind 默认间距单位：1 unit = 0.25rem = 4px（基于 16px 根字号）。
   * 支持 0.15 unit（约 0.6px）的模糊容差。
   *
   * @param px - 间距像素值
   * @param property - CSS 属性类型，决定类名前缀：
   *                   - 'p'/'m': padding/margin（可配合 direction 生成 pt-/pr-/pb-/pl-）
   *                   - 'gap': flex/grid gap
   *                   - 'space-x'/'space-y': 子元素间距
   *                   - 'w'/'h': width/height
   *                   - 'top'/'right'/'bottom'/'left'/'inset': 定位
   * @param direction - 方向修饰符（'t'/'r'/'b'/'l'/'x'/'y'），仅对 p/m 有效
   * @returns Token 匹配结果
   */
  matchSpacing(
    px: number,
    property:
      | 'p'
      | 'm'
      | 'gap'
      | 'space-x'
      | 'space-y'
      | 'w'
      | 'h'
      | 'top'
      | 'right'
      | 'bottom'
      | 'left'
      | 'inset' = 'p',
    direction?: 't' | 'r' | 'b' | 'l' | 'x' | 'y',
  ): TokenMatch<string> {
    // 负间距不做匹配（Tailwind 负间距需特殊处理）
    if (px < 0) return { matched: false, originalValue: `${px}px`, confidence: 0, needsExtension: true };

    // 0 值匹配
    if (px === 0) {
      const cls = direction ? `${property}${direction}-0` : `${property}-0`;
      return {
        matched: true,
        className: cls,
        originalValue: '0px',
        tokenValue: '0',
        confidence: 1,
        needsExtension: false,
      };
    }

    // 转换为 Tailwind spacing unit（1 unit = 4px）
    const units = px / 4;
    const isNearInteger = Math.abs(units - Math.round(units)) < 0.15;
    const nearest = Math.round(units);

    // Tailwind 特殊命名值映射
    const specialNameMap: Readonly<Record<number, string>> = { 0: '0', 1: 'px', 2: '0.5' };
    const spacingName = specialNameMap[nearest] ?? String(nearest);

    // 构建类名（注意 p/m 需要方向直接拼接，其他属性用 - 连接）
    let className: string;
    if (['gap', 'space-x', 'space-y', 'w', 'h', 'top', 'right', 'bottom', 'left', 'inset'].includes(property)) {
      className = direction ? `${property}-${direction}-${spacingName}` : `${property}-${spacingName}`;
    } else {
      className = direction ? `${property}${direction}-${spacingName}` : `${property}-${spacingName}`;
    }

    const confidence = isNearInteger ? 1 : Math.max(0.5, 1 - Math.abs(units - nearest) * 2);
    return {
      matched: confidence > 0.7,
      className,
      originalValue: `${px}px`,
      tokenValue: spacingName,
      confidence,
      needsExtension: confidence <= 0.7,
    };
  }

  /**
   * 字号匹配
   *
   * @param px - 字号像素值
   * @returns Token 匹配结果
   */
  matchFontSize(px: number): TokenMatch<string> {
    // 精确匹配（0.5px 容差）
    const exact = FONT_SIZE_MAP.find((f) => Math.abs(f.px - px) < 0.5);
    if (exact)
      return {
        matched: true,
        className: exact.key,
        originalValue: `${px}px`,
        tokenValue: exact.key,
        confidence: 1,
        needsExtension: false,
      };

    // 模糊匹配（2px 容差）
    let best: (typeof FONT_SIZE_MAP)[number] = FONT_SIZE_MAP[0]!;
    let bestDiff = Infinity;
    for (const f of FONT_SIZE_MAP) {
      const d = Math.abs(f.px - px);
      if (d < bestDiff) {
        bestDiff = d;
        best = f;
      }
    }

    const FONT_SIZE_FUZZY_THRESHOLD = 2;
    if (bestDiff <= FONT_SIZE_FUZZY_THRESHOLD)
      return {
        matched: true,
        className: best.key,
        originalValue: `${px}px`,
        tokenValue: best.key,
        confidence: 1 - bestDiff / (FONT_SIZE_FUZZY_THRESHOLD * 2),
        needsExtension: false,
      };

    return { matched: false, originalValue: `${px}px`, confidence: 0, needsExtension: true };
  }

  /**
   * 字重匹配
   *
   * 就近匹配到标准字重值（100-900 的整百数），偏差 >50 时标记为需要扩展。
   *
   * @param weight - 字重数值（如 400、500、700）
   * @returns Token 匹配结果
   */
  matchFontWeight(weight: number): TokenMatch<string> {
    const standardWeights = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
    const nearest = standardWeights.reduce((prev, curr) =>
      Math.abs(curr - weight) < Math.abs(prev - weight) ? curr : prev,
    );
    const className = FONT_WEIGHT_MAP[nearest];
    if (!className) return { matched: false, originalValue: String(weight), confidence: 0, needsExtension: true };
    const diff = Math.abs(nearest - weight);
    return {
      matched: diff <= 50,
      className,
      originalValue: String(weight),
      tokenValue: className,
      confidence: diff <= 50 ? 1 : 0.5,
      needsExtension: diff > 50,
    };
  }

  /**
   * 行高匹配（基于行高与字号的比例）
   *
   * 通过计算 lineHeightPx / fontSizePx 得到比例值，
   * 匹配到 Tailwind 的 leading-* 尺度。
   *
   * @param px - 行高像素值
   * @param fontSizePx - 字号像素值（用于计算比例）
   * @returns Token 匹配结果
   */
  matchLineHeight(px: number, fontSizePx: number): TokenMatch<string> {
    const ratio = px / fontSizePx;
    let best: (typeof LINE_HEIGHT_MAP)[number] = LINE_HEIGHT_MAP[0]!;
    let bestDiff = Infinity;
    for (const lh of LINE_HEIGHT_MAP) {
      const d = Math.abs(lh.ratio - ratio);
      if (d < bestDiff) {
        bestDiff = d;
        best = lh;
      }
    }
    const LINE_HEIGHT_FUZZY_THRESHOLD = 0.1;
    return {
      matched: bestDiff <= LINE_HEIGHT_FUZZY_THRESHOLD,
      className: best.key,
      originalValue: `${px}px`,
      tokenValue: best.key,
      confidence: Math.max(0, 1 - bestDiff / (LINE_HEIGHT_FUZZY_THRESHOLD * 2)),
      needsExtension: bestDiff > LINE_HEIGHT_FUZZY_THRESHOLD,
    };
  }

  /**
   * 字间距（letter-spacing）匹配
   *
   * Tailwind tracking 类以 em 为单位：
   * - tracking-tighter = -0.05em
   * - tracking-tight = -0.025em
   * - tracking-normal = 0
   * - tracking-wide = 0.025em
   * - tracking-wider = 0.05em
   * - tracking-widest = 0.1em
   *
   * 由于 Figma 字间距使用 px 单位，与字号强相关，
   * 这里仅处理接近 0 的值（tracking-normal），其余兜底为任意值。
   *
   * @param px - 字间距像素值
   * @returns Token 匹配结果
   */
  matchLetterSpacing(px: number): TokenMatch<string> {
    // 接近 0 的值（< 0.1px）视为正常字间距
    if (Math.abs(px) < 0.1)
      return {
        matched: true,
        className: 'tracking-normal',
        originalValue: `${px}px`,
        tokenValue: 'tracking-normal',
        confidence: 1,
        needsExtension: false,
      };
    // 非零值直接兜底，由调用方使用 arbitrary value
    return { matched: false, originalValue: `${px}px`, confidence: 0, needsExtension: true };
  }

  // ============ 私有方法 ============

  /**
   * 规范化 Figma Variables codeSyntax.WEB 为 Tailwind token 名
   *
   * 支持多种输入格式的统一转换：
   * - "color.primary.500" → "primary-500"（去除前缀 + 点号转连字符）
   * - "--color-primary-500" → "primary-500"（去除 CSS 变量前缀）
   * - "primary-500" → "primary-500"（原样返回）
   * - "colors/primary/500" → "primary-500"（斜杠转连字符）
   *
   * @param syntax - codeSyntax.WEB 原始字符串
   * @returns 规范化后的 token 名（可直接拼接到 Tailwind 类名）
   */
  private _normalizeCodeSyntax(syntax: string): string {
    let result = syntax.trim().replace(/^--/, '');
    // 去除常见前缀：color/colors/fill/bg/text/border
    result = result.replace(/^(color|colors|fill|bg|text|border)[-_./]/i, '');
    // 统一分隔符：./_ → -，合并连续 -，去除首尾 -
    result = result.replace(/[./_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return result;
  }
}

// ============ 单例管理 ============

/** 全局 TokenMatcher 单例（懒加载） */
let _instance: TokenMatcher | null = null;

/**
 * 获取 TokenMatcher 全局单例
 *
 * 首次调用时创建实例，后续调用返回同一实例。
 *
 * @returns TokenMatcher 实例
 */
export function getTokenMatcher(): TokenMatcher {
  if (!_instance) _instance = new TokenMatcher();
  return _instance;
}
