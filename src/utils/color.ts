/**
 * 颜色转换工具
 *
 * 处理 Figma 颜色格式（RGBA，各通道 0-1 浮点数）与前端常用颜色格式之间的转换，
 * 支持 Hex、RGB(A)、HSL(A)、OKLCH 等格式。
 *
 * 颜色空间转换说明：
 * - sRGB → Linear RGB：使用 gamma 校正逆函数
 * - Linear RGB → OKLab：使用 Björn Ottosson 的转换矩阵
 * - OKLab → OKLCH：柱坐标转换（直角坐标→极坐标）
 *
 * @see https://bottosson.github.io/posts/oklab/ OKLCH 颜色空间论文
 * @module
 */

import type { FigmaColor, ColorToken, RgbColor, OklchColor, ColorFormat, CssColorValue } from '../types.js';

/**
 * 将 0-255 范围的 RGB 通道值转换为两位十六进制字符串
 *
 * @internal
 * @param value - 通道值，自动四舍五入并夹紧到 [0, 255]
 * @returns 两位十六进制字符串（小写）
 */
function toHexChannel(value: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(value)));
  const hex = clamped.toString(16).toLowerCase();
  return hex.length === 1 ? `0${hex}` : hex;
}

/**
 * Figma RGBA 颜色转 Hex 字符串
 *
 * Figma API 返回的颜色通道值为 0-1 范围的浮点数，此函数将其转换为标准 Hex 格式。
 * 当 alpha 通道值小于 1 且 includeAlpha 为 true 时，输出 8 位 Hex（含 alpha 通道）。
 *
 * @param color - Figma 颜色对象（r,g,b,a 范围均为 0-1）
 * @param includeAlpha - 是否在 alpha < 1 时输出 8 位 Hex（含透明度），默认 false
 * @returns Hex 颜色字符串，小写格式（如 "#ff5500" 或 "#ff550080"）
 *
 * @example
 * ```typescript
 * figmaColorToHex({ r: 1, g: 0.33, b: 0, a: 1 }); // "#ff5400"
 * figmaColorToHex({ r: 1, g: 0, b: 0, a: 0.5 }, true); // "#ff000080"
 * ```
 *
 * 边界情况：
 * - alpha 值为 1 时即使 includeAlpha=true 也不输出 alpha 通道
 * - 所有通道值自动四舍五入到最近整数
 */
export function figmaColorToHex(color: FigmaColor, includeAlpha = false): CssColorValue {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const a = Math.round(color.a * 255);

  let hex = `#${toHexChannel(r)}${toHexChannel(g)}${toHexChannel(b)}`;
  if (includeAlpha && a < 255) {
    hex += toHexChannel(a);
  }
  return hex as CssColorValue;
}

/**
 * Figma RGBA 颜色转 RGB 对象（各通道 0-255）
 *
 * @param color - Figma 颜色对象（r,g,b,a 范围均为 0-1）
 * @returns RGB 颜色对象，通道值范围 0-255；当 alpha < 1 时包含 a 字段
 *
 * @example
 * ```typescript
 * figmaColorToRgb({ r: 1, g: 0, b: 0, a: 1 }); // { r: 255, g: 0, b: 255 }
 * figmaColorToRgb({ r: 1, g: 0, b: 0, a: 0.5 }); // { r: 255, g: 0, b: 0, a: 0.5 }
 * ```
 */
export function figmaColorToRgb(color: FigmaColor): RgbColor & { readonly a?: number } {
  return {
    r: Math.round(color.r * 255),
    g: Math.round(color.g * 255),
    b: Math.round(color.b * 255),
    ...(color.a < 1 ? { a: color.a } : {}),
  };
}

/**
 * Figma RGBA 颜色转 CSS RGB/RGBA 字符串
 *
 * 当 alpha = 1 时输出 rgb() 格式，alpha < 1 时输出 rgba() 格式。
 *
 * @param color - Figma 颜色对象
 * @returns CSS rgb() 或 rgba() 函数字符串
 *
 * @example
 * ```typescript
 * figmaColorToRgbString({ r: 1, g: 0, b: 0, a: 1 }); // "rgb(255, 0, 0)"
 * figmaColorToRgbString({ r: 1, g: 0, b: 0, a: 0.5 }); // "rgba(255, 0, 0, 0.50)"
 * ```
 */
export function figmaColorToRgbString(color: FigmaColor): CssColorValue {
  const { r, g, b } = figmaColorToRgb(color);
  if (color.a < 1) {
    return `rgba(${r}, ${g}, ${b}, ${color.a.toFixed(2)})` as CssColorValue;
  }
  return `rgb(${r}, ${g}, ${b})` as CssColorValue;
}

/**
 * sRGB 通道值转线性光值
 *
 * sRGB 使用 gamma 校正，需要先转换为线性光值才能进行正确的颜色空间计算。
 * 公式：
 * - 当 C ≤ 0.04045: C_linear = C / 12.92
 * - 当 C > 0.04045: C_linear = ((C + 0.055) / 1.055) ^ 2.4
 *
 * @internal
 * @param channel - sRGB 通道值，范围 0-1
 * @returns 线性光通道值
 */
function srgbToLinear(channel: number): number {
  return channel >= 0.04045 ? Math.pow((channel + 0.055) / 1.055, 2.4) : channel / 12.92;
}

/**
 * RGB 颜色（0-255）转 OKLCH 颜色
 *
 * 转换步骤：
 * 1. 将 0-255 的 RGB 值归一化到 0-1
 * 2. sRGB → Linear RGB（gamma 校正逆变换）
 * 3. Linear RGB → OKLab（使用 Björn Ottosson 转换矩阵）
 * 4. OKLab → OKLCH（L 不变，C = sqrt(a²+b²)，H = atan2(b,a)）
 *
 * @param r - 红色通道，范围 0-255
 * @param g - 绿色通道，范围 0-255
 * @param b - 蓝色通道，范围 0-255
 * @returns OKLCH 颜色对象：
 *   - l: 亮度，范围 0-1（保留 3 位小数）
 *   - c: 色度，约 0-0.4（保留 3 位小数）
 *   - h: 色相角，范围 0-360（保留 1 位小数）
 *
 * @example
 * ```typescript
 * rgbToOklch(255, 0, 0); // { l: 0.628, c: 0.258, h: 29.2 } （约）
 * ```
 */
export function rgbToOklch(r: number, g: number, b: number): OklchColor {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const rl = srgbToLinear(rn);
  const gl = srgbToLinear(gn);
  const bl = srgbToLinear(bn);

  const l_ = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl;
  const m_ = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl;
  const s_ = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl;

  const lCubeRoot = Math.cbrt(l_);
  const mCubeRoot = Math.cbrt(m_);
  const sCubeRoot = Math.cbrt(s_);

  const L = 0.2104542553 * lCubeRoot + 0.793617785 * mCubeRoot - 0.0040720468 * sCubeRoot;
  const a = 1.9779984951 * lCubeRoot - 2.428592205 * mCubeRoot + 0.4505937099 * sCubeRoot;
  const bOk = 0.0259040371 * lCubeRoot + 0.7827717662 * mCubeRoot - 0.808675766 * sCubeRoot;

  const C = Math.sqrt(a * a + bOk * bOk);
  let H = (Math.atan2(bOk, a) * 180) / Math.PI;
  if (H < 0) H += 360;

  return {
    l: Math.round(L * 1000) / 1000,
    c: Math.round(C * 1000) / 1000,
    h: Math.round(H * 10) / 10,
  };
}

/**
 * Figma RGBA 颜色转 CSS OKLCH 字符串
 *
 * OKLCH 是一种感知均匀的颜色空间，适合用于设计系统，
 * 是 Tailwind CSS v4 推荐的颜色格式。
 *
 * 输出格式：
 * - 不透明：oklch(L% C H)
 * - 透明：oklch(L% C H / A%)
 *
 * @param color - Figma 颜色对象
 * @returns CSS oklch() 函数字符串
 *
 * @example
 * ```typescript
 * figmaColorToOklchString({ r: 1, g: 0, b: 0, a: 1 });
 * // "oklch(62.8% 0.258 29.2)"
 * figmaColorToOklchString({ r: 1, g: 0, b: 0, a: 0.5 });
 * // "oklch(62.8% 0.258 29.2 / 50%)"
 * ```
 */
export function figmaColorToOklchString(color: FigmaColor): CssColorValue {
  const rgb = figmaColorToRgb(color);
  const oklch = rgbToOklch(rgb.r, rgb.g, rgb.b);
  if (color.a < 1) {
    return `oklch(${(oklch.l * 100).toFixed(1)}% ${oklch.c.toFixed(3)} ${oklch.h.toFixed(1)} / ${(color.a * 100).toFixed(0)}%)` as CssColorValue;
  }
  return `oklch(${(oklch.l * 100).toFixed(1)}% ${oklch.c.toFixed(3)} ${oklch.h.toFixed(1)})` as CssColorValue;
}

/**
 * Hex 颜色字符串转 RGB 对象
 *
 * 支持 3 位（#RGB）、6 位（#RRGGBB）、8 位（#RRGGBBAA）Hex 格式，
 * # 前缀可选。
 *
 * @param hex - Hex 颜色字符串
 * @returns RGB 颜色对象，解析失败返回 null；包含 alpha 通道时返回 a 字段
 *
 * @example
 * ```typescript
 * hexToRgb('#FF0000'); // { r: 255, g: 0, b: 0 }
 * hexToRgb('#FF000080'); // { r: 255, g: 0, b: 0, a: 0.50... }
 * hexToRgb('invalid'); // null
 * ```
 */
export function hexToRgb(hex: string): (RgbColor & { readonly a?: number }) | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(hex);
  if (!result) return null;

  return {
    r: Number.parseInt(result[1] as string, 16),
    g: Number.parseInt(result[2] as string, 16),
    b: Number.parseInt(result[3] as string, 16),
    ...(result[4] ? { a: Number.parseInt(result[4], 16) / 255 } : {}),
  };
}

/**
 * RGB 颜色（0-255）转 Hex 字符串
 *
 * @param r - 红色通道，范围 0-255（自动夹紧）
 * @param g - 绿色通道，范围 0-255（自动夹紧）
 * @param b - 蓝色通道，范围 0-255（自动夹紧）
 * @returns 6 位小写 Hex 字符串（不含 alpha）
 *
 * @example
 * ```typescript
 * rgbToHex(255, 0, 0); // "#ff0000"
 * rgbToHex(300, -10, 0); // "#ff0000" （自动夹紧）
 * ```
 */
export function rgbToHex(r: number, g: number, b: number): CssColorValue {
  return `#${toHexChannel(r)}${toHexChannel(g)}${toHexChannel(b)}` as CssColorValue;
}

/**
 * Figma RGBA 颜色转 CSS HSL/HSLA 字符串
 *
 * 通过 RGB 中转计算 HSL 值。
 * 当 alpha = 1 时输出 hsl() 格式，alpha < 1 时输出 hsla() 格式。
 *
 * @internal
 * @param color - Figma 颜色对象
 * @returns CSS hsl() 或 hsla() 函数字符串
 */
function figmaColorToHslString(color: FigmaColor): CssColorValue {
  const rgb = figmaColorToRgb(color);
  const rn = rgb.r / 255;
  const gn = rgb.g / 255;
  const bn = rgb.b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
        break;
      case gn:
        h = ((bn - rn) / d + 2) / 6;
        break;
      case bn:
        h = ((rn - gn) / d + 4) / 6;
        break;
    }
  }

  const hue = Math.round(h * 360);
  const saturation = Math.round(s * 100);
  const lightness = Math.round(l * 100);

  if (color.a < 1) {
    return `hsla(${hue}, ${saturation}%, ${lightness}%, ${color.a.toFixed(2)})` as CssColorValue;
  }
  return `hsl(${hue}, ${saturation}%, ${lightness}%)` as CssColorValue;
}

/**
 * 将 Figma 颜色转换为指定格式的 CSS 颜色字符串
 *
 * @param color - Figma 颜色对象
 * @param format - 目标颜色格式，默认为 'hex'
 * @returns CSS 颜色字符串
 *
 * @example
 * ```typescript
 * const red = { r: 1, g: 0, b: 0, a: 1 };
 * convertFigmaColor(red, 'hex');    // "#ff0000"
 * convertFigmaColor(red, 'rgb');    // "rgb(255, 0, 0)"
 * convertFigmaColor(red, 'oklch');  // "oklch(62.8% 0.258 29.2)"
 * convertFigmaColor(red, 'hsl');    // "hsl(0, 100%, 50%)"
 * ```
 */
export function convertFigmaColor(color: FigmaColor, format: ColorFormat = 'hex'): CssColorValue {
  switch (format) {
    case 'hex':
      return figmaColorToHex(color);
    case 'rgb':
      return figmaColorToRgbString(color);
    case 'oklch':
      return figmaColorToOklchString(color);
    case 'hsl':
      return figmaColorToHslString(color);
    default:
      return figmaColorToHex(color);
  }
}

/**
 * 规范化颜色 Token 名称
 *
 * 将 Figma 中的命名（如 "color/primary/500"、"Primary 500"）
 * 转换为 CSS 变量友好的 kebab-case 命名。
 *
 * 处理规则：
 * 1. 将路径分隔符（/、\）替换为连字符
 * 2. 将空白字符替换为连字符
 * 3. 移除非字母数字和连字符的字符
 * 4. 合并连续的连字符
 * 5. 去除首尾连字符
 * 6. 转为小写
 * 7. 如提供 prefix 则添加前缀
 *
 * @param name - Figma 原始颜色名称
 * @param prefix - Token 名称前缀（可选）
 * @returns 规范化后的 CSS 变量友好名称
 *
 * @example
 * ```typescript
 * normalizeColorName('color/primary/500'); // "color-primary-500"
 * normalizeColorName('Primary 500', 'color'); // "color-primary-500"
 * normalizeColorName('Brand/Primary--Hover'); // "brand-primary-hover"
 * ```
 */
export function normalizeColorName(name: string, prefix?: string): string {
  let normalized = name
    .replace(/[/\\]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  if (prefix) {
    normalized = `${prefix}-${normalized}`;
  }

  return normalized;
}

/**
 * 从 Figma 颜色创建标准化的颜色 Token
 *
 * @param figmaName - Figma 中的颜色名称
 * @param color - Figma 颜色对象
 * @param format - 输出颜色格式，默认 'hex'
 * @param prefix - Token 名称前缀
 * @param description - Token 描述
 * @param codeSyntax - 平台代码语法提示
 * @returns 完整的 ColorToken 对象
 *
 * @example
 * ```typescript
 * const token = createColorToken('Primary/500', { r: 0.2, g: 0.4, b: 0.8, a: 1 }, 'oklch', 'color');
 * // {
 * //   name: "color-primary-500",
 * //   value: "oklch(53.2% 0.209 264.1)",
 * //   valueRgb: { r: 51, g: 102, b: 204 },
 * //   valueOklch: { l: 0.532, c: 0.209, h: 264.1 },
 * //   figmaName: "Primary/500"
 * // }
 * ```
 */
export function createColorToken(
  figmaName: string,
  color: FigmaColor,
  format: ColorFormat = 'hex',
  prefix?: string,
  description?: string,
  codeSyntax?: string,
): ColorToken {
  const rgb = figmaColorToRgb(color);
  const oklch = rgbToOklch(rgb.r, rgb.g, rgb.b);

  return {
    name: normalizeColorName(figmaName, prefix),
    value: convertFigmaColor(color, format),
    valueRgb: { r: rgb.r, g: rgb.g, b: rgb.b },
    valueOklch: oklch,
    opacity: color.a < 1 ? color.a : undefined,
    description,
    figmaName,
    codeSyntax,
  };
}
