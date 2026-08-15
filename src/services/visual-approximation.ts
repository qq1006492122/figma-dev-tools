/**
 * 视觉近似模式服务 - Visual Approximation Service
 *
 * v1.4.4 新增：当 Figma REST API 因付费墙失败且 BrowserFallbackService 成功截图后，
 * 本服务将截图打包为结构化数据，供 AI Agent（具备 VLM 视觉理解能力）消费，
 * 生成近似代码骨架 + 待人工校对 TODO 清单。
 *
 * 设计理念：
 * - 不在 MCP 工具内部运行 VLM（避免重型依赖、避免与具体 VLM 厂商耦合）
 * - 仅做轻量图像元信息提取（尺寸、DPR、OS）+ 结构化打包
 * - 生成带有 TODO 标记的代码骨架，明确告知还原度预期（~70-80%）
 * - 输出 TODO 清单，引导用户人工校对关键失真点
 *
 * 输出消费方式：
 * 1. MCP 工具将 screenshotPath + 元信息返回给 AI Agent
 * 2. AI Agent 使用自身 VLM 能力读取截图，生成具体代码
 * 3. AI Agent 参考 TODO 清单提醒用户校对
 *
 * @module
 */

// ============ 依赖导入 ============

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { getI18n } from '../i18n/index.js';
import type { BrowserFallbackResult } from './browser-fallback.js';

// ============ 类型定义 ============

/**
 * 视觉近似模式配置选项
 */
export interface VisualApproximationOptions {
  /** 输出目录（近似代码骨架与 TODO 清单写入位置），默认与截图同目录 */
  outputDir: string;
  /** 是否将截图转为 base64 内联到结果中（便于 MCP 直接回传），默认 false */
  inlineScreenshot: boolean;
  /** 是否生成代码骨架文件，默认 true */
  generateSkeleton: boolean;
  /** 代码骨架的目标框架，默认 react */
  framework: 'react' | 'vue' | 'html';
  /** 是否在骨架中包含 TODO 注释清单，默认 true */
  includeTodoComments: boolean;
}

/**
 * 视觉近似模式结果
 */
export interface VisualApproximationResult {
  /** 截图文件绝对路径（供 AI Agent 读取） */
  screenshotPath: string;
  /** 截图 base64 数据（仅当 inlineScreenshot=true 时存在） */
  screenshotBase64?: string;
  /** 截图宽度（像素） */
  width: number;
  /** 截图高度（像素） */
  height: number;
  /** 使用的 devicePixelRatio */
  devicePixelRatio: number;
  /** Dev Mode CSS 属性（如抓取成功，作为还原参考） */
  devModeCss?: string;
  /** 探测到的操作系统 */
  os: 'windows' | 'macos' | 'linux' | 'unknown';
  /** 近似代码骨架文件路径（如已生成） */
  skeletonPath?: string;
  /** 近似代码骨架内容（字符串） */
  skeletonCode: string;
  /** TODO 清单文件路径（如已生成） */
  todoPath?: string;
  /** TODO 清单内容（Markdown 格式） */
  todoMarkdown: string;
  /** 近似模式横幅提示（用于代码顶部注释） */
  banner: string;
  /** 还原度预期（百分比，0-100） */
  expectedFidelity: number;
  /** 兜底过程中产生的警告信息 */
  warnings: string[];
  /** 截图时间戳 */
  capturedAt: number;
}

// ============ 常量定义 ============

/**
 * 默认配置
 */
const DEFAULT_OPTIONS: VisualApproximationOptions = {
  outputDir: '',
  inlineScreenshot: false,
  generateSkeleton: true,
  framework: 'react',
  includeTodoComments: true,
};

/**
 * 近似模式预期还原度（百分比）
 *
 * 来源：付费墙下仅能拿到截图 + Dev Mode CSS（如可访问），
 * 缺失节点树/精确尺寸/字体/颜色 token，故预期 70-80%。
 */
const EXPECTED_FIDELITY = 75;

/**
 * TODO 清单条目（v1.4.4 通用失真点）
 *
 * 这些是付费墙下截图还原最常见的失真点，
 * 用于引导用户重点校对。
 */
const TODO_ITEMS_ZH: ReadonlyArray<string> = [
  '精确尺寸：截图尺寸可能受视口与缩放影响，请用 Figma 标尺工具核对宽度/高度/间距',
  '字体族与字重：截图无法获取字体文件信息，请确认 font-family / font-weight 是否与设计稿一致',
  '颜色 token：截图颜色可能受色彩管理影响，请用取色器核对 hex 值并匹配项目 design token',
  '富文本分段：截图无法识别同一段文字内的多段样式（局部加粗/变色），请检查 <span> 包裹',
  '渐变与阴影：复杂径向/角度渐变、多层投影在截图中易失真，请对照设计稿逐一核对',
  'mask 与 clip-path：圆角头像、异形裁切在截图中可能被拍平，请补充 mask-image / clip-path',
  '交互状态：hover/active/disabled 状态无法从静态截图推断，请补充交互样式',
  '响应式断点：截图仅为单一视口尺寸，请补充移动端/平板断点样式',
  '无障碍属性：alt/aria-label/role 无法从截图推断，请按语义补充',
  '图标资源：截图中的 SVG 图标无法直接提取矢量数据，请从 Figma 导出或用项目图标库替换',
];

const TODO_ITEMS_EN: ReadonlyArray<string> = [
  'Exact dimensions: screenshot size may be affected by viewport and zoom. Verify width/height/spacing with Figma ruler tool',
  'Font family and weight: screenshot cannot obtain font file info. Confirm font-family / font-weight matches the design',
  'Color tokens: screenshot colors may be affected by color management. Verify hex values with a color picker and match project design tokens',
  'Rich text segments: screenshot cannot detect multi-style text within a single line (local bold/color). Check <span> wrapping',
  'Gradients and shadows: complex radial/angular gradients, multi-layer shadows are easily distorted in screenshots. Verify one by one against the design',
  'Mask and clip-path: rounded avatars, irregular clipping may be flattened in screenshots. Add mask-image / clip-path',
  'Interaction states: hover/active/disabled states cannot be inferred from a static screenshot. Add interaction styles',
  'Responsive breakpoints: screenshot is a single viewport size only. Add mobile/tablet breakpoint styles',
  'Accessibility attributes: alt/aria-label/role cannot be inferred from screenshot. Add semantically',
  'Icon assets: SVG icons in screenshots cannot be extracted as vector data. Export from Figma or replace with project icon library',
];

// ============ VisualApproximationService 类 ============

/**
 * 视觉近似模式服务
 *
 * 将 BrowserFallbackService 的截图结果打包为结构化数据，
 * 生成近似代码骨架与 TODO 清单，供 AI Agent 消费。
 */
export class VisualApproximationService {
  /** 配置选项（已合并默认值） */
  private readonly _options: VisualApproximationOptions;

  /**
   * 构造函数
   *
   * @param options - 配置选项（部分提供时合并默认值）
   */
  constructor(options: Partial<VisualApproximationOptions> = {}) {
    this._options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * 从浏览器兜底结果生成近似模式输出
   *
   * 流程：
   * 1. 读取截图文件（可选转 base64）
   * 2. 生成近似代码骨架（带 TODO 注释 + 横幅）
   * 3. 生成 TODO 清单 Markdown
   * 4. 写入文件（如启用）
   *
   * @param fallbackResult - BrowserFallbackService 的截图结果
   * @returns 视觉近似模式结果
   */
  async generateApproximation(
    fallbackResult: BrowserFallbackResult,
  ): Promise<VisualApproximationResult> {
    const i18n = getI18n();
    const labels = i18n.t('cli.errors.labels') as {
      approximateModeBanner: string;
      approximateTodoTitle: string;
    };
    const isZh = i18n.getLanguage() === 'zh-CN';
    const warnings = [...fallbackResult.warnings];

    // ============ 1. 读取截图（可选 base64） ============
    let screenshotBase64: string | undefined;
    if (this._options.inlineScreenshot) {
      try {
        const buffer = await fs.readFile(fallbackResult.screenshotPath);
        screenshotBase64 = `data:image/png;base64,${buffer.toString('base64')}`;
      } catch (error) {
        warnings.push(
          `截图转 base64 失败: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // ============ 2. 生成近似代码骨架 ============
    const banner = labels.approximateModeBanner;
    const skeletonCode = this._generateSkeleton(fallbackResult, banner);

    // ============ 3. 生成 TODO 清单 ============
    const todoMarkdown = this._generateTodoMarkdown(labels.approximateTodoTitle, isZh);

    // ============ 4. 写入文件 ============
    const outputDir = this._options.outputDir || path.dirname(fallbackResult.screenshotPath);
    let skeletonPath: string | undefined;
    let todoPath: string | undefined;

    if (this._options.generateSkeleton) {
      const ext = this._getSkeletonExtension();
      skeletonPath = path.join(
        outputDir,
        `figma-approximate-${fallbackResult.capturedAt}.${ext}`,
      );
      try {
        await fs.mkdir(outputDir, { recursive: true });
        await fs.writeFile(skeletonPath, skeletonCode, 'utf8');
      } catch (error) {
        warnings.push(
          `写入代码骨架文件失败: ${error instanceof Error ? error.message : String(error)}`,
        );
        skeletonPath = undefined;
      }
    }

    todoPath = path.join(outputDir, `figma-approximate-todo-${fallbackResult.capturedAt}.md`);
    try {
      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(todoPath, todoMarkdown, 'utf8');
    } catch (error) {
      warnings.push(
        `写入 TODO 清单文件失败: ${error instanceof Error ? error.message : String(error)}`,
      );
      todoPath = undefined;
    }

    return {
      screenshotPath: fallbackResult.screenshotPath,
      screenshotBase64,
      width: fallbackResult.width,
      height: fallbackResult.height,
      devicePixelRatio: fallbackResult.devicePixelRatio,
      devModeCss: fallbackResult.devModeCss,
      os: fallbackResult.os,
      skeletonPath,
      skeletonCode,
      todoPath,
      todoMarkdown,
      banner,
      expectedFidelity: EXPECTED_FIDELITY,
      warnings,
      capturedAt: fallbackResult.capturedAt,
    };
  }

  /**
   * 生成近似代码骨架
   *
   * 骨架结构：
   * - 顶部横幅注释（标注近似模式 + 还原度预期）
   * - 容器组件（尺寸取自截图）
   * - TODO 注释块（列出待校对项）
   * - 占位 JSX 结构
   *
   * @param fallbackResult - 浏览器兜底结果
   * @param banner - 横幅提示文本
   * @returns 代码骨架字符串
   */
  private _generateSkeleton(
    fallbackResult: BrowserFallbackResult,
    banner: string,
  ): string {
    const i18n = getI18n();
    const isZh = i18n.getLanguage() === 'zh-CN';
    const todoItems = isZh ? TODO_ITEMS_ZH : TODO_ITEMS_EN;

    // 尺寸取自截图（CSS 像素，需除以 DPR 得到逻辑像素）
    // 边界场景：DPR 为 0 或负数时会导致除零得到 Infinity/NaN，需兜底为默认值
    const safeDpr = fallbackResult.devicePixelRatio > 0 ? fallbackResult.devicePixelRatio : 2;
    // 边界场景：width/height 为 0 时生成 width:0px 无意义，需兜底为默认视口尺寸
    const rawWidth = Math.round(fallbackResult.width / safeDpr);
    const rawHeight = Math.round(fallbackResult.height / safeDpr);
    const cssWidth = rawWidth > 0 ? rawWidth : 1920;
    const cssHeight = rawHeight > 0 ? rawHeight : 1080;

    const todoComment = this._options.includeTodoComments
      ? this._formatTodoComment(todoItems)
      : '';

    const devModeCssComment = fallbackResult.devModeCss
      ? `\n// ${isZh ? 'Dev Mode CSS 参考（如已抓取）' : 'Dev Mode CSS reference (if captured)'}:\n// ${this._escapeForLineComment(fallbackResult.devModeCss)}\n`
      : '';

    if (this._options.framework === 'vue') {
      return this._generateVueSkeleton(
        banner,
        todoComment,
        devModeCssComment,
        cssWidth,
        cssHeight,
        fallbackResult,
        isZh,
      );
    }

    if (this._options.framework === 'html') {
      return this._generateHtmlSkeleton(
        banner,
        todoComment,
        devModeCssComment,
        cssWidth,
        cssHeight,
        isZh,
      );
    }

    // 默认 React
    return this._generateReactSkeleton(
      banner,
      todoComment,
      devModeCssComment,
      cssWidth,
      cssHeight,
      fallbackResult,
      isZh,
    );
  }

  /**
   * 转义 devModeCss 以安全嵌入行注释
   *
   * 修复安全漏洞：devModeCss 内容若含星号-斜杠、`-->` 或 `\n` 等字符，
   * 会提前终止块注释，导致骨架代码结构被破坏或注入恶意代码。
   * 这里按行拆分，每行前加 `// ` 前缀，并转义行内的 `\r` 与连续 `\n`，
   * 保证内容只能作为单行注释文本，不会破坏外层结构。
   *
   * @param raw - 原始 devModeCss 字符串
   * @returns 转义后的字符串（多行已加 // 前缀）
   */
  private _escapeForLineComment(raw: string): string {
    // 统一换行符为 \n，按行处理
    return raw
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => {
        // 移除可能存在的块注释终止符（防止 // xxx */ 仍能终结外层块注释）
        // 仅保留行内可见字符，移除控制字符
        return line
          .replace(/\*\//g, '*\\/')
          .replace(/-->/g, '-\\->')
          .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); // 控制字符
      })
      .join('\n// ');
  }

  /**
   * 格式化 TODO 注释块
   *
   * @param items - TODO 条目数组
   * @returns 注释块字符串
   */
  private _formatTodoComment(items: ReadonlyArray<string>): string {
    const lines = items.map((item, index) => ` *   ${index + 1}. ${item}`);
    return ['/**', ' * TODO 待人工校对项：', ...lines, ' */'].join('\n');
  }

  /**
   * 生成 React 骨架
   */
  private _generateReactSkeleton(
    banner: string,
    todoComment: string,
    devModeCssComment: string,
    cssWidth: number,
    cssHeight: number,
    fallbackResult: BrowserFallbackResult,
    isZh: boolean,
  ): string {
    const componentName = 'ApproximateDesign';
    const placeholderHint = isZh ? '此处由 AI Agent 根据截图填充' : 'Filled by AI Agent based on screenshot';

    return `/**
 * ${banner}
 *
 * ${isZh ? '截图路径' : 'Screenshot path'}: ${fallbackResult.screenshotPath}
 * ${isZh ? '逻辑尺寸' : 'Logical size'}: ${cssWidth}x${cssHeight}px (DPR=${fallbackResult.devicePixelRatio}, OS=${fallbackResult.os})
 * ${isZh ? '预期还原度' : 'Expected fidelity'}: ~${EXPECTED_FIDELITY}%
 */
${todoComment}
${devModeCssComment}

import * as React from 'react';

/**
 * ${componentName} - ${isZh ? '近似模式生成的组件（需人工校对）' : 'Approximate mode generated component (needs manual review)'}
 *
 * ${isZh ? '使用方法：参考截图' : 'Usage: refer to screenshot'} ${fallbackResult.screenshotPath}
 * ${isZh ? '使用 VLM 能力补全具体 DOM 结构与样式' : 'use VLM capability to fill in specific DOM structure and styles'}
 */
export const ${componentName}: React.FC = () => {
  return (
    <div
      style={{
        width: '${cssWidth}px',
        minHeight: '${cssHeight}px',
        // TODO: ${isZh ? '替换为实际样式' : 'replace with actual styles'}
      }}
      data-approximate-mode
      data-fidelity="${EXPECTED_FIDELITY}"
    >
      {/* ${placeholderHint} */}
      {/* ${isZh ? '建议：根据截图识别顶部导航 / 主内容区 / 侧栏 / 底部，分块还原' : 'Suggestion: identify top nav / main content / sidebar / footer from screenshot, restore block by block'} */}
    </div>
  );
};

export default ${componentName};
`;
  }

  /**
   * 生成 Vue 骨架
   */
  private _generateVueSkeleton(
    banner: string,
    todoComment: string,
    devModeCssComment: string,
    cssWidth: number,
    cssHeight: number,
    _fallbackResult: BrowserFallbackResult,
    isZh: boolean,
  ): string {
    const placeholderHint = isZh ? '此处由 AI Agent 根据截图填充' : 'Filled by AI Agent based on screenshot';

    return `<!--
  ${banner}
-->
<!--
${todoComment.replace(/^\s*\/\*\*?/, '').replace(/\s*\*\/$/, '').replace(/^ \* /gm, '  ')}
-->
${devModeCssComment ? `<!--${devModeCssComment.replace(/\n\/\//g, '\n')}-->` : ''}

<template>
  <div
    class="approximate-design"
    :style="{ width: '${cssWidth}px', minHeight: '${cssHeight}px' }"
    data-approximate-mode
    :data-fidelity="${EXPECTED_FIDELITY}"
  >
    <!-- ${placeholderHint} -->
    <!-- ${isZh ? '建议：根据截图识别顶部导航 / 主内容区 / 侧栏 / 底部，分块还原' : 'Suggestion: identify top nav / main content / sidebar / footer from screenshot, restore block by block'} -->
  </div>
</template>

<script setup lang="ts">
// ${isZh ? '近似模式生成的组件（需人工校对）' : 'Approximate mode generated component (needs manual review)'}
</script>

<style scoped>
.approximate-design {
  /* TODO: ${isZh ? '替换为实际样式' : 'replace with actual styles'} */
}
</style>
`;
  }

  /**
   * 生成 HTML 骨架
   */
  private _generateHtmlSkeleton(
    banner: string,
    todoComment: string,
    devModeCssComment: string,
    cssWidth: number,
    cssHeight: number,
    isZh: boolean,
  ): string {
    const placeholderHint = isZh ? '此处由 AI Agent 根据截图填充' : 'Filled by AI Agent based on screenshot';

    return `<!DOCTYPE html>
<html lang="${isZh ? 'zh-CN' : 'en'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${isZh ? '近似模式生成页面（需人工校对）' : 'Approximate Mode Generated Page (needs manual review)'}</title>
  <!--
  ${banner}
  -->
  <!--
${todoComment.replace(/^\s*\/\*\*?/, '').replace(/\s*\*\/$/, '').replace(/^ \* /gm, '  ')}
  -->
  ${devModeCssComment ? `<!--${devModeCssComment.replace(/\n\/\//g, '\n')}-->` : ''}
  <style>
    .approximate-design {
      width: ${cssWidth}px;
      min-height: ${cssHeight}px;
      /* TODO: ${isZh ? '替换为实际样式' : 'replace with actual styles'} */
    }
  </style>
</head>
<body>
  <div
    class="approximate-design"
    data-approximate-mode
    data-fidelity="${EXPECTED_FIDELITY}"
  >
    <!-- ${placeholderHint} -->
    <!-- ${isZh ? '建议：根据截图识别顶部导航 / 主内容区 / 侧栏 / 底部，分块还原' : 'Suggestion: identify top nav / main content / sidebar / footer from screenshot, restore block by block'} -->
  </div>
</body>
</html>
`;
  }

  /**
   * 获取骨架文件扩展名
   *
   * @returns 扩展名（不含点）
   */
  private _getSkeletonExtension(): string {
    switch (this._options.framework) {
      case 'react':
        return 'tsx';
      case 'vue':
        return 'vue';
      case 'html':
        return 'html';
      default:
        return 'tsx';
    }
  }

  /**
   * 生成 TODO 清单 Markdown
   *
   * @param title - 清单标题
   * @param isZh - 是否中文
   * @returns Markdown 字符串
   */
  private _generateTodoMarkdown(title: string, isZh: boolean): string {
    const items = isZh ? TODO_ITEMS_ZH : TODO_ITEMS_EN;
    const lines = items.map((item) => `- [ ] ${item}`);
    const header = isZh
      ? `# ${title}\n\n> 预期还原度 ~${EXPECTED_FIDELITY}%，以下为常见失真点，请逐一核对\n`
      : `# ${title}\n\n> Expected fidelity ~${EXPECTED_FIDELITY}%, the following are common distortion points, please verify one by one\n`;
    return `${header}\n${lines.join('\n')}\n`;
  }

  /**
   * 获取当前配置
   *
   * @returns 配置选项的只读副本
   */
  getOptions(): Readonly<VisualApproximationOptions> {
    return { ...this._options };
  }

  /**
   * 更新配置
   *
   * @param options - 要更新的配置项
   */
  updateOptions(options: Partial<VisualApproximationOptions>): void {
    Object.assign(this._options, options);
  }
}

// ============ 单例管理 ============

let visualApproximationInstance: VisualApproximationService | null = null;

/**
 * 获取 VisualApproximationService 单例
 *
 * @param options - 首次创建时的配置选项
 * @returns VisualApproximationService 实例
 */
export function getVisualApproximationService(
  options?: Partial<VisualApproximationOptions>,
): VisualApproximationService {
  if (!visualApproximationInstance) {
    visualApproximationInstance = new VisualApproximationService(options);
  }
  return visualApproximationInstance;
}

/**
 * 重置 VisualApproximationService 单例（主要用于测试）
 */
export function resetVisualApproximationService(): void {
  visualApproximationInstance = null;
}
