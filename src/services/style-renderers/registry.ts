/**
 * 样式渲染器注册表 - Style Renderer Registry（v1.4.18 新增，T7）
 *
 * 全部样式方案（spec FR-05 共 11 项）的**单一数据源**：
 * CLI 选项、MCP zod schema、help 文案、管线支持矩阵与"暂不支持"错误
 * 均由本注册表派生，新增方案只需在此登记并实现 StyleRenderer。
 *
 * 状态矩阵（v1.4.19）：
 * - available：tailwind（双管线）、unocss（preset-wind 兼容原子类，T8 深化）、
 *   css-modules（T9 起增强新管线完整支持：同名 .module.css + styles.x/$style.x + composes；
 *   legacy React 管线保持占位契约不变）、inline-styles（legacy React 管线）；
 * - v1.4.19 起增强新管线新增：styled / emotion（React 专属）、less / sass（React+Vue）、
 *   vanilla-extract / panda（React 专属，成熟度见 README 支持矩阵）；
 * - planned v1.5.0：css-variables（组件级渲染；tokens 提取的 CSS 变量输出已存在）。
 *
 * @module services/style-renderers/registry
 */

import { I18n } from '../../i18n/index.js';
import type { Framework, StyleFormat, StyleLanguage, StyleRendererDescriptor } from './types.js';

// ============ 错误类型 ============

/**
 * 不被支持的样式方案错误。
 *
 * 触发场景：①传入非 11 枚举的未知值；②选择了 planned 方案；
 * ③方案虽已可用但当前生成管线不支持（如 inline-styles 进入增强新管线）。
 */
export class UnsupportedStyleFormatError extends Error {
  /** 用户传入的原始样式值 */
  readonly format: string;

  /**
   * @param format - 原始样式值
   * @param message - 经 i18n 渲染的错误消息
   */
  constructor(format: string, message: string) {
    super(message);
    this.name = 'UnsupportedStyleFormatError';
    this.format = format;
  }
}

// ============ 注册表数据 ============

/**
 * 全量描述符表（顺序即 CLI/MCP/文档对外展示顺序，变更属破坏性约定需走版本说明）
 */
const REGISTRY_DATA: readonly StyleRendererDescriptor[] = [
  {
    id: 'tailwind',
    labels: { 'zh-CN': 'Tailwind CSS', 'en-US': 'Tailwind CSS' },
    descriptions: {
      'zh-CN': '原子类 className，设计 token 智能匹配与 @theme 扩展提示',
      'en-US': 'Atomic className output with design-token matching and @theme hints',
    },
    status: 'available',
  },
  {
    id: 'unocss',
    labels: { 'zh-CN': 'UnoCSS', 'en-US': 'UnoCSS' },
    descriptions: {
      'zh-CN': 'preset-wind 原子类（v1.4.18 与 Tailwind 映射共用，T8 起支持 attributify/图标预设）',
      'en-US': 'preset-wind atomic classes (shares Tailwind mapping in v1.4.18; attributify/icon presets from T8)',
    },
    status: 'available',
  },
  {
    id: 'css-modules',
    labels: { 'zh-CN': 'CSS Modules', 'en-US': 'CSS Modules' },
    descriptions: {
      'zh-CN': '同名 .module.css 旁路文件 + styles.x/$style.x 映射，重复样式经 composes 复用（T9 增强管线）',
      'en-US': 'Co-located .module.css sidecar with styles.x/$style.x mapping and composes reuse (T9 enhanced pipeline)',
    },
    status: 'available',
  },
  {
    id: 'styled',
    labels: { 'zh-CN': 'Styled Components', 'en-US': 'Styled Components' },
    descriptions: {
      'zh-CN': '模板字符串 styled 组件 + ThemeProvider 占位（v1.4.19 起，仅 React）',
      'en-US': 'Tagged-template styled components with ThemeProvider placeholder (v1.4.19, React only)',
    },
    status: 'available',
  },
  {
    id: 'emotion',
    labels: { 'zh-CN': 'Emotion', 'en-US': 'Emotion' },
    descriptions: {
      'zh-CN': 'css prop / css() 对象样式常量（v1.4.19 起，仅 React）',
      'en-US': 'css prop / css() object-style constants (v1.4.19, React only)',
    },
    status: 'available',
  },
  {
    id: 'less',
    labels: { 'zh-CN': 'Less', 'en-US': 'Less' },
    descriptions: {
      'zh-CN': 'Less 变量、嵌套与 mixin 拆分（v1.4.19 起，React/Vue）',
      'en-US': 'Less variables, nesting and mixins (v1.4.19, React/Vue)',
    },
    status: 'available',
  },
  {
    id: 'sass',
    labels: { 'zh-CN': 'Sass/SCSS', 'en-US': 'Sass/SCSS' },
    descriptions: {
      'zh-CN': 'Sass(SCSS) 变量、嵌套与 mixin 拆分（v1.4.19 起，React/Vue）',
      'en-US': 'Sass(SCSS) variables, nesting and mixins (v1.4.19, React/Vue)',
    },
    status: 'available',
  },
  {
    id: 'vanilla-extract',
    labels: { 'zh-CN': 'vanilla-extract', 'en-US': 'vanilla-extract' },
    descriptions: {
      'zh-CN': '类型安全 style() 零运行时 .css.ts 模块（v1.4.19 起，仅 React）',
      'en-US': 'Type-safe zero-runtime style() .css.ts modules (v1.4.19, React only)',
    },
    status: 'available',
  },
  {
    id: 'panda',
    labels: { 'zh-CN': 'Panda CSS', 'en-US': 'Panda CSS' },
    descriptions: {
      'zh-CN': 'css() 对象样式常量 + cva/recipe 建议（v1.4.19 起，仅 React）',
      'en-US': 'css() object-style constants + cva/recipe hints (v1.4.19, React only)',
    },
    status: 'available',
  },
  {
    id: 'inline-styles',
    labels: { 'zh-CN': '内联样式', 'en-US': 'Inline styles' },
    descriptions: {
      'zh-CN': 'style={{}} 对象内联（legacy React 管线）',
      'en-US': 'style={{}} inline objects (legacy React pipeline)',
    },
    status: 'available',
  },
  {
    id: 'css-variables',
    labels: { 'zh-CN': 'CSS 变量组件样式', 'en-US': 'CSS variables component styles' },
    descriptions: {
      'zh-CN': '组件级 var(--token) 样式（tokens 提取的 :root 变量输出已可用，组件渲染规划中）',
      'en-US': 'Component-level var(--token) styles (:root token extraction already available; rendering planned)',
    },
    status: 'planned',
    plannedVersion: '1.5.0',
  },
];

/** id → descriptor 快速索引 */
const DESCRIPTOR_MAP: ReadonlyMap<StyleFormat, StyleRendererDescriptor> = new Map(
  REGISTRY_DATA.map((descriptor) => [descriptor.id, descriptor]),
);

// ============ 管线支持矩阵（二次校验，与注册表状态正交） ============

/**
 * 增强新管线（figma_generate_jsx / figma_generate_vue，React 与 Vue 同源）
 * 支持的样式集合。
 *
 * v1.4.18：tailwind/unocss/css-modules；
 * v1.4.19（T14–T17）：追加 styled/emotion/less/sass/vanilla-extract/panda；
 * 其中 styled/emotion/vanilla-extract/panda 仅 React，框架矩阵见
 * {@link NEW_PIPELINE_FRAMEWORK_SUPPORT}，由 {@link assertStyleFormatSupported} 二次拦截。
 * as const 保留字面量元组类型，供 CLI 泛型校验窄化与 zod 枚举复用。
 */
export const STYLE_FORMATS_NEW_PIPELINE = [
  'tailwind',
  'unocss',
  'css-modules',
  'styled',
  'emotion',
  'less',
  'sass',
  'vanilla-extract',
  'panda',
] as const satisfies readonly StyleFormat[];

/**
 * 增强新管线各样式方案支持的框架矩阵（v1.4.19 T14–T17）。
 * 未列入的方案默认 React+Vue 双支持（防御性缺省仅对未登记方案生效）。
 */
export const NEW_PIPELINE_FRAMEWORK_SUPPORT: Readonly<Record<StyleFormat, readonly Framework[]>> = {
  // v1.4.20 WBS-P1-12：Svelte 一级支持 tailwind / unocss / css-modules 三组合
  // （css-modules 在 Svelte 侧落地为 scoped <style>，不承诺 hash/composes）
  tailwind: ['react', 'vue', 'svelte'],
  unocss: ['react', 'vue', 'svelte'],
  'css-modules': ['react', 'vue', 'svelte'],
  styled: ['react'],
  emotion: ['react'],
  less: ['react', 'vue'],
  sass: ['react', 'vue'],
  'vanilla-extract': ['react'],
  panda: ['react'],
  'inline-styles': ['react'],
  'css-variables': ['react', 'vue'],
};

/**
 * legacy React 管线（figma_generate_component）支持的样式集合（保持 1.4.17 契约）。
 */
export const STYLE_FORMATS_LEGACY_REACT = [
  'tailwind',
  'css-modules',
  'inline-styles',
] as const satisfies readonly StyleFormat[];

// ============ 查询函数 ============

/** 全量样式方案标识（顺序稳定，供 zod enum / CLI choices / 文档使用） */
export const ALL_STYLE_FORMATS: readonly StyleFormat[] = REGISTRY_DATA.map((d) => d.id);

/**
 * 取样式方案描述符
 *
 * @param id - 样式方案标识
 * @returns 描述符（注册表为完备表，11 值必然命中）
 */
export function getStyleDescriptor(id: StyleFormat): StyleRendererDescriptor {
  const descriptor = DESCRIPTOR_MAP.get(id);
  if (!descriptor) {
    // 联合类型保证不可达，防御性兜底
    throw new Error(`Style renderer descriptor not found: ${id}`);
  }
  return descriptor;
}

/**
 * 按落地状态列出样式方案
 *
 * @param status - available | planned
 * @returns 该状态下的方案标识数组（注册表顺序）
 */
export function listStyleFormatsByStatus(status: StyleRendererDescriptor['status']): StyleFormat[] {
  return REGISTRY_DATA.filter((d) => d.status === status).map((d) => d.id);
}

/**
 * 将标识数组格式化为人类可读的「id（显示名）」列表
 *
 * @param formats - 方案标识数组
 * @param language - 语言
 * @returns 如 `tailwind（Tailwind CSS）、unocss（UnoCSS）`
 */
function formatChoices(formats: readonly string[], language: StyleLanguage): string {
  const separator = language === 'zh-CN' ? '、' : ', ';
  return formats
    .map((id) => {
      const descriptor = DESCRIPTOR_MAP.get(id as StyleFormat);
      return descriptor ? `${id} (${descriptor.labels[language]})` : id;
    })
    .join(separator);
}

/**
 * 校验样式方案在指定管线可用，否则抛双语 UnsupportedStyleFormatError。
 *
 * 四类失败：
 * 1. 值不在 11 枚举内 → unknownStyleFormat；
 * 2. 值为 planned 方案 → styleFormatPlanned（含计划版本）；
 * 3. 方案已可用但不在该管线集合 → styleFormatNotInPipeline；
 * 4. 方案在管线内但不支持目标框架（v1.4.19：styled/emotion/vanilla-extract/panda 仅 React）
 *    → styleFormatFrameworkUnsupported（显式拒绝，不静默降级）。
 *
 * @param format - 用户传入的原始值
 * @param supportedInPipeline - 该管线支持的集合
 * @param language - 错误语言（默认 en-US）
 * @param framework - 目标框架（传入时追加框架矩阵校验）
 * @returns 校验通过的 StyleFormat
 */
export function assertStyleFormatSupported(
  format: string,
  supportedInPipeline: readonly StyleFormat[],
  language: StyleLanguage = 'en-US',
  framework?: Framework,
): StyleFormat {
  const i18n = new I18n(language);
  const supportedText = supportedInPipeline.join(', ');

  const descriptor = DESCRIPTOR_MAP.get(format as StyleFormat);
  if (!descriptor) {
    throw new UnsupportedStyleFormatError(
      format,
      i18n.t('cli.errors.labels.unknownStyleFormat', format, ALL_STYLE_FORMATS.join(', ')) as string,
    );
  }

  if (supportedInPipeline.includes(descriptor.id)) {
    // v1.4.19（T14–T17）：框架矩阵二次校验（React 专属方案在 Vue 侧显式报错）
    if (framework && !NEW_PIPELINE_FRAMEWORK_SUPPORT[descriptor.id].includes(framework)) {
      throw new UnsupportedStyleFormatError(
        format,
        i18n.t(
          'cli.errors.labels.styleFormatFrameworkUnsupported',
          format,
          framework,
          NEW_PIPELINE_FRAMEWORK_SUPPORT[descriptor.id].join(', '),
        ) as string,
      );
    }
    return descriptor.id;
  }

  if (descriptor.status === 'planned') {
    throw new UnsupportedStyleFormatError(
      format,
      i18n.t(
        'cli.errors.labels.styleFormatPlanned',
        format,
        descriptor.plannedVersion ?? '1.5.0',
        supportedText,
      ) as string,
    );
  }

  throw new UnsupportedStyleFormatError(
    format,
    i18n.t('cli.errors.labels.styleFormatNotInPipeline', format, supportedText) as string,
  );
}

/**
 * 生成 CLI --style 选项的完整中英帮助串（可用/计划分组）
 *
 * @param language - 语言
 * @returns 多行可读的帮助文本（单行字符串，内含分号分组）
 */
export function buildStyleFormatHelp(language: StyleLanguage): string {
  const available = listStyleFormatsByStatus('available');
  const planned = listStyleFormatsByStatus('planned');
  if (language === 'zh-CN') {
    const plannedText = planned
      .map((id) => {
        const d = getStyleDescriptor(id);
        return `${id}（v${d.plannedVersion ?? 'TBD'}）`;
      })
      .join('、');
    return `样式方案（默认 tailwind）。可用：${formatChoices(available, language)}；计划中：${plannedText}`;
  }
  const plannedText = planned
    .map((id) => {
      const d = getStyleDescriptor(id);
      return `${id} (v${d.plannedVersion ?? 'TBD'})`;
    })
    .join(', ');
  return `Style format (default: tailwind). Available: ${formatChoices(available, language)}; Planned: ${plannedText}`;
}
