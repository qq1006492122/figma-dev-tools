/**
 * 样式渲染器契约 - Style Renderer Contracts（v1.4.18 新增，T7）
 *
 * 「框架 × 样式 × 平台」正交矩阵中的「样式」维度公共接口。
 * 各样式方案（Tailwind/UnoCSS/CSS Modules/Styled Components…）以注册表
 * 描述符登记能力元数据，以 StyleRenderer 实现节点级样式渲染。
 *
 * @module services/style-renderers/types
 */

import type { Framework, StyleFormat } from '../../types.js';
import type { ProcessedNode } from '../../types/nodes.js';

// 从核心类型重导出，保证样式子系统只依赖本目录入口
export type { Framework, StyleFormat };

/** 支持的界面语言（与 i18n 语言码一致） */
export type StyleLanguage = 'zh-CN' | 'en-US';

/** 渲染器落地状态：available=当前版本可用；planned=已登记待后续版本启用 */
export type StyleRendererStatus = 'available' | 'planned';

/** 样式方案描述符（注册表元数据，CLI/MCP/文档单一数据源） */
export interface StyleRendererDescriptor {
  /** 样式方案标识（StyleFormat 联合成员） */
  readonly id: StyleFormat;
  /** 中英显示名 */
  readonly labels: Readonly<Record<StyleLanguage, string>>;
  /** 中英一句话简介（用于 help 与错误提示） */
  readonly descriptions: Readonly<Record<StyleLanguage, string>>;
  /** 落地状态 */
  readonly status: StyleRendererStatus;
  /** planned 状态下的计划启用版本（如 '1.4.19'），available 时必须缺省 */
  readonly plannedVersion?: string;
}

/** 需要在配置层扩展的 token 提示（与 TailwindMapping.extensionsNeeded 同构） */
export interface StyleExtensionNeeded {
  /** 扩展类型分类（color/spacing/radius/shadow/font-size/font-weight） */
  type: string;
  /** 建议的 token 名称 */
  suggestedName: string;
  /** 原始 Figma 值 */
  originalValue: string;
}

/** 单节点样式渲染结果（框架无关中间表示） */
export interface NodeStyleResult {
  /** 写入 class/className 属性的原子类或模块类名字符串 */
  className: string;
  /**
   * attributify 模式下可提升为元素属性的原子类（v1.4.18 T8）。
   * 缺省 = 当前渲染器不做属性化（tailwind/unocss-wind）；
   * 空数组 = 属性化模式但本节点无安全 token；
   * 仅含合法属性名的 token 会出现在这里，其余留在 className。
   * 值统一空字符串（React 未知布尔属性跨版本行为不一致，空串最稳）。
   */
  attributes?: ReadonlyArray<{ readonly name: string; readonly value: string }>;
  /** 无法用类名表达时的内联样式兜底（写入 style 属性） */
  inlineStyle?: Record<string, string | number>;
  /** 无法完整映射时的人工复核提示 */
  warnings: string[];
  /** 需要在配置层（@theme/tailwind.config/uno.config）扩展的 token 列表 */
  extensionsNeeded: StyleExtensionNeeded[];
}

/**
 * 配置建议片段（组件级，随生成结果返回给 CLI/MCP 展示；不写入用户项目）。
 * 文案为语言中立的技术代码（配置即代码），title 为简短英文技术标题。
 */
export interface StyleHint {
  /** 建议标题（如 'uno.config.ts (example)'） */
  readonly title: string;
  /** 代码/配置片段正文 */
  readonly code: string;
}

/** 节点渲染上下文（T9 起承载 componentName 等用于模块类名派生） */
export interface StyleRenderContext {
  /** 目标框架 */
  framework: Framework;
  /** 当前组件名（CSS Modules 等场景使用） */
  componentName?: string;
}

/**
 * 组件级旁路文件（v1.4.18 T9）：与主组件同名的配套样式文件等。
 *
 * 生成器只负责描述文件，由 CLI 决定是否落盘（--output 时写同目录），
 * MCP 场景作为文本随结果返回，工具自身不擅写用户项目目录。
 */
export interface StyleSidecarFile {
  /** 文件名（不含目录，约定与组件同目录，如 'Card.module.css'） */
  readonly fileName: string;
  /** 文件完整内容 */
  readonly content: string;
}

/**
 * 样式渲染器接口：把单个 ProcessedNode 的样式描述渲染为框架无关结果。
 *
 * 实现方必须保持无 per-node 脏状态（同一渲染器实例可服务一棵组件树）；
 * 允许持有「每组件一次」的聚合状态（如 T9 CSS Modules 收集类声明），
 * 该状态在生成结束通过 buildSidecar 输出，渲染器实例本身每组件新建。
 */
export interface StyleRenderer {
  /** 样式方案标识 */
  readonly id: StyleFormat;
  /**
   * 组件级配置建议（v1.4.18 T8）：如 uno.config 预设、virtual:uno.css 引入位置、
   * React attributify 的 TS shim。无建议的渲染器（tailwind）返回空数组。
   */
  readonly hints?: readonly StyleHint[];
  /**
   * 渲染单节点样式
   *
   * @param node - 精简节点
   * @param context - 渲染上下文（可选）
   * @returns 节点样式结果
   */
  renderNode(node: ProcessedNode, context?: StyleRenderContext): NodeStyleResult;
  /**
   * 组件树渲染结束后产出旁路文件（v1.4.18 T9，可选）。
   *
   * @param componentName - 当前组件名（用于同名文件命名）
   * @returns 旁路文件描述；无聚合产物时返回 undefined
   */
  buildSidecar?(componentName: string): StyleSidecarFile | undefined;
}
