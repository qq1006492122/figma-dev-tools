/**
 * 组件库映射类型定义（WBS-P2-11）
 *
 * 把高置信度的语义节点（Button/Card/Input/Dialog/Tabs/Avatar/Badge）
 * 映射为目标组件库的 import + 标签 + Props。保守模式（默认）下低于阈值
 * 的节点保持原生标签并给注释建议，误替换必须为 0。
 *
 * @module services/component-library/types
 */

import type { NodeSemanticRole, ProcessedNode } from '../../types/nodes.js';

/** 可映射的 7 个组件（ROADMAP P2-1 冻结清单） */
export type MappableComponent =
  | 'button'
  | 'card'
  | 'input'
  | 'dialog'
  | 'tabs'
  | 'avatar'
  | 'badge';

/** React 侧组件库 */
export type ReactComponentLibrary = 'shadcn-ui' | 'ant-design';
/** Vue 侧组件库 */
export type VueComponentLibrary = 'element-plus' | 'ant-design-vue';
/** 具体组件库 id */
export type ComponentLibraryId = ReactComponentLibrary | VueComponentLibrary;

/** 用户可选值（含 auto 自动检测与 none 关闭） */
export type ComponentLibraryChoice = 'auto' | 'none' | ComponentLibraryId;

/** 组件 Prop 推导结果 */
export interface MappedProp {
  /** 目标库的 prop 名（如 variant / type / size） */
  readonly name: string;
  /** 已按目标库口径规范化的值（如 'primary'） */
  readonly value: string;
  /** 推导依据（供报告展示，不写入代码注释以外的位置） */
  readonly reason: string;
}

/** 单节点的组件匹配结果 */
export interface ComponentMatch {
  /** 命中的组件库 */
  readonly library: ComponentLibraryId;
  /** 命中的语义组件 */
  readonly component: MappableComponent;
  /** import 名（如 Button / ElButton）；kebab 标签库也保留主组件名用于按需导入 */
  readonly importName: string;
  /** 模板标签名（Vue kebab 形态，如 el-button / a-button）；React 缺省用 importName */
  readonly tagName?: string;
  /** 模板实际使用的组件标识；Vue kebab 标签库使用 PascalCase alias */
  readonly templateName?: string;
  /** 置信度 0-100（仅 ≥ 门控阈值才会输出本结果） */
  readonly confidence: number;
  /** 命中依据（role/名称/结构信号） */
  readonly reasons: ReadonlyArray<string>;
  /** 推导出的 Props */
  readonly props: ReadonlyArray<MappedProp>;
  /**
   * shadcn/ui 等组合式组件需要同时导入的子组件（如
   * Dialog 需 DialogContent/DialogHeader/DialogTitle；Tabs 需 TabsList/TabsTrigger）。
   * antd/element 单组件库为空。
   */
  readonly subImports: ReadonlyArray<string>;
  /** 组合式库建议的子组件结构提示（人类可读，供报告，不自动展开多层 DOM） */
  readonly compositionAdvice?: ReadonlyArray<string>;
}

/** 名称关键词规则（小写子串匹配，中英双语） */
export interface NameKeywordRule {
  /** 命中即加名称分的关键词（小写） */
  readonly keywords: ReadonlyArray<string>;
}

/** 结构信号判定的输入（matcher 从 ProcessedNode 提取，规则只读该视图） */
export interface NodeMatchView {
  readonly id: string;
  readonly name: string;
  readonly role?: NodeSemanticRole;
  readonly width?: number;
  readonly height?: number;
  /** 文本内容（按钮/徽章等短文本） */
  readonly text?: string;
  /** 是否有纯色填充 */
  readonly hasSolidFill?: boolean;
  /** 主填充色 hex（小写） */
  readonly solidFillHex?: string;
  /** 是否仅有描边（无填充） */
  readonly strokeOnly?: boolean;
  /** 四角最小圆角半径 */
  readonly minCornerRadius?: number;
  /** 是否有投影 */
  readonly hasShadow?: boolean;
  /** 子节点数 */
  readonly childCount?: number;
  /** 是否图片填充 */
  readonly isImageFill?: boolean;
  /** 横向布局的等宽文本子项数量（tabs 信号） */
  readonly equalTextChildCount?: number;
  /** 强调态（选中）的等宽子项下标 */
  readonly activeTextChildIndex?: number;
  /** 原始节点（规则需要额外字段时兜底，matcher 不允许在规则里做 I/O） */
  readonly raw?: ProcessedNode;
}

/** 单个组件的映射规则（纯数据 + 评分函数） */
export interface ComponentRule {
  readonly component: MappableComponent;
  /** 名称关键词（小写子串） */
  readonly nameKeywords: ReadonlyArray<string>;
  /** 允许的语义角色（命中加 role 分） */
  readonly roles: ReadonlyArray<NodeSemanticRole>;
  /**
   * 结构信号评分：接收节点视图，返回 0-25 分与命中的理由。
   * 名称与角色分由 matcher 统一加（35/40），结构分由各组件规则自定义。
   */
  readonly structuralScore: (node: NodeMatchView) => { score: number; reasons: string[] };
  /**
   * 是否允许 Figma COMPONENT/INSTANCE 节点（精简后 role='reusable-component'）
   * 凭「组件类型元数据 + 名称关键词 + 形态护栏」获得角色分（WBS-R1 QA）。
   * 组件库中的规范组件（如「Buttons按钮/主按钮」）精简后不会被推成 role=button，
   * 但其 COMPONENT 类型本身即独立于名称的结构证据；护栏用于拒绝按钮组/规范画板等容器。
   */
  readonly reusableComponentRole?: boolean;
  /** reusable-component 角色通道的形态护栏（仅 reusableComponentRole=true 时生效） */
  readonly reusableGuard?: (node: NodeMatchView) => boolean;
  /** Prop 推导（纯函数，按目标库输出） */
  readonly deriveProps: (node: NodeMatchView) => MappedProp[];
}

/** 组件库定义 */
export interface ComponentLibraryDefinition {
  readonly id: ComponentLibraryId;
  readonly framework: 'react' | 'vue';
  /** package.json 中的依赖名（auto 检测依据） */
  readonly packageName: string;
  /** import 形态 */
  readonly importStyle: 'named' | 'kebab';
  /** 7 个组件的规则与库形态（import 名/标签名/子组件） */
  readonly components: Record<
    MappableComponent,
    {
      /** import 名（named：Button；kebab：ElButton 用于按需导入） */
      readonly importName: string;
      /** Vue 模板标签（el-button / a-button） */
      readonly tagName?: string;
  /** 模板实际使用的组件标识；Vue kebab 标签库使用 PascalCase alias */
  readonly templateName?: string;
      /** 组合式库需要随主组件导入的子组件（shadcn Dialog/Tabs/Card/Avatar） */
      readonly subImports?: ReadonlyArray<string>;
      /** 组合式库的结构建议 */
      readonly compositionAdvice?: ReadonlyArray<string>;
    }
  >;
}

/** 匹配评测统计（fixture 集回归用） */
export interface MatchStats {
  /** 标注为某组件的节点数 */
  readonly labeled: number;
  /** 正确命中组件（库由调用方指定，口径为组件类型正确） */
  readonly correctlyIdentified: number;
  /** 标注为「不应替换」却被替换的节点数（保守模式必须恒为 0） */
  readonly falseReplacements: number;
  /** 组件识别率 0-1 */
  readonly identificationRate: number;
  /** 标注带期望 props 的节点中，props 集合达到期望命中率（≥60% 的验收口径）的节点占比 */
  readonly propsNodePassRate: number;
}
