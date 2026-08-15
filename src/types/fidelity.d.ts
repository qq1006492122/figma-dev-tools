/**
 * pixelmatch 与 pngjs 可选依赖的类型声明
 *
 * 这两个库是 figma-dev-tools v1.4.4 还原度校验服务（FidelityVerifyService）
 * 的可选依赖，用于 PNG 解码与像素 diff。
 *
 * 当用户未安装时，运行时通过动态 import() 优雅降级，
 * 但 TypeScript 编译期需要类型声明以避免 TS2307 错误。
 *
 * 安装真实依赖后（npm install pixelmatch pngjs
 * && npm install -D @types/pixelmatch @types/pngjs），
 * 真实类型会覆盖此声明。
 *
 * @module
 */

declare module 'pixelmatch' {
  /**
   * pixelmatch 选项
   */
  export interface PixelmatchOptions {
    /** 颜色差异阈值（0-1），默认 0.1 */
    threshold?: number;
    /** 是否包含 alpha 通道比较，默认 true */
    includeAA?: boolean;
    /** Alpha 混合阈值（0-255），默认 128 */
    alpha?: number;
    /** 差异像素颜色 [R, G, B]，默认 [255, 0, 0] */
    diffColor?: [number, number, number];
    /** 差异像素颜色（img2 独有像素）[R, G, B]，默认 [0, 255, 0] */
    diffColorAlt?: [number, number, number];
    /** 差异掩码颜色 [R, G, B]，默认 [255, 255, 0] */
    diffMask?: boolean;
    /** 输出差异图是否为大块区域高亮，默认 false */
    aa?: number;
  }

  /**
   * 像素 diff 主函数
   *
   * @param img1 - 第一张图的像素数据（Uint8Array）
   * @param img2 - 第二张图的像素数据（Uint8Array）
   * @param output - 输出差异图数据（Uint8Array）
   * @param width - 图像宽度
   * @param height - 图像高度
   * @param options - 比较选项
   * @returns 差异像素数量
   */
  function pixelmatch(
    img1: Uint8Array,
    img2: Uint8Array,
    output: Uint8Array,
    width: number,
    height: number,
    options?: PixelmatchOptions,
  ): number;

  export default pixelmatch;
}

declare module 'pngjs' {
  /**
   * PNG 图像数据
   */
  export interface PNGData {
    /** 图像宽度 */
    width: number;
    /** 图像高度 */
    height: number;
    /** 像素数据（RGBA，每像素 4 字节） */
    data: Buffer;
  }

  /**
   * PNG 类（同步读取模式）
   */
  export const PNG: {
    /**
     * 同步解析 PNG Buffer
     *
     * @param buffer - PNG 文件 Buffer
     * @returns 解析后的图像数据
     */
    sync: {
      read(buffer: Buffer): PNGData;
      write(data: PNGData): Buffer;
    };
    /**
     * 构造新的 PNG 数据
     */
    new (options: { width: number; height: number }): PNGData & {
      data: Buffer;
    };
  };
}
