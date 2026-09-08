/**
 * tesseract.js 可选依赖的类型声明
 *
 * tesseract.js 是 figma-dev-tools OCR 文本提取服务（OcrService）
 * 的可选依赖，用于对图片进行光学字符识别。
 *
 * 当用户未安装时，运行时通过动态 import() 优雅降级，
 * 但 TypeScript 编译期需要类型声明以避免 TS2307 错误。
 *
 * 安装真实依赖后（npm install tesseract.js），
 * 真实类型会覆盖此声明。
 *
 * @module
 */

declare module 'tesseract.js' {
  /**
   * OCR 识别结果中的单行/单块文本
   */
  export interface TesseractBlock {
    text: string;
    confidence: number;
    bbox: {
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    };
  }

  /**
   * OCR 识别输出的数据部分
   */
  export interface TesseractOutput {
    text: string;
    confidence: number;
    blocks?: TesseractBlock[];
    [key: string]: unknown;
  }

  /**
   * recognize() 的返回结果
   */
  export interface TesseractRecognizeResult {
    data: TesseractOutput;
    jobId?: string;
    [key: string]: unknown;
  }

  /**
   * recognize() 的可选参数
   */
  export interface TesseractRecognizeOptions {
    rectangle?: { left: number; top: number; width: number; height: number };
    [key: string]: unknown;
  }

  /**
   * setParameters() 支持的参数（宽松类型）
   */
  export interface TesseractParams {
    tessedit_ocr_engine_mode?: number;
    [key: string]: unknown;
  }

  /**
   * Tesseract Worker 实例
   */
  export interface TesseractWorker {
    /**
     * 识别图像中的文本
     *
     * @param image - 图片 Buffer / 文件路径 / canvas 等
     * @param options - 识别选项
     * @param output - 输出格式
     */
    recognize(
      image: Buffer | string | Uint8Array,
      options?: TesseractRecognizeOptions,
      output?: Record<string, boolean>,
    ): Promise<TesseractRecognizeResult>;

    /**
     * 设置识别参数（如 OCR 引擎模式）
     */
    setParameters(params: TesseractParams): Promise<unknown>;

    /**
     * 终止 Worker，释放资源
     */
    terminate(): Promise<unknown>;
  }

  /**
   * 创建 Tesseract Worker
   *
   * @param langs - 语言字符串，如 'eng' 或 'chi_sim+eng'
   * @param oem - OCR 引擎模式（1 = LSTM）
   * @param options - 其他选项
   */
  export function createWorker(
    langs?: string,
    oem?: number,
    options?: Record<string, unknown>,
  ): Promise<TesseractWorker>;
}
