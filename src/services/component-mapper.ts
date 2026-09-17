/**
 * 组件库智能映射服务 - Component Mapper
 *
 * 核心职责：
 * 1. 自动检测项目使用的 UI 组件库（shadcn/ui、Ant Design、Element Plus）
 * 2. 根据视觉特征匹配到对应组件
 * 3. 生成正确的 import 语句和使用示例
 *
 * v1.4.0 支持：
 * - shadcn/ui 基础组件映射（Button、Card、Input、Dialog 等）
 * - package.json 自动检测
 *
 * @module
 */

// ============ 依赖导入 ============

import fs from 'node:fs';
import path from 'node:path';

import { getI18n } from '../i18n/index.js';
import { getBuiltinDefsForLibrary } from './component-library-defs.js';

interface ComponentMatchFill {
  type?: string;
}

interface ComponentMatchNode {
  name?: string;
  characters?: string;
  originalType?: string;
  role?: string;
  children?: ComponentMatchNode[];
  fills?: ComponentMatchFill[];
}

// ============ 类型定义 ============

/**
 * 支持的组件库
 */
export type ComponentLibrary = 'shadcn-ui' | 'ant-design' | 'element-plus' | 'none';

/**
 * 组件匹配结果
 */
export interface ComponentMatch {
  /** 匹配到的组件名 */
  componentName: string;
  /** 组件库来源 */
  library: ComponentLibrary;
  /** import 路径 */
  importPath: string;
  /** 匹配置信度 0-1 */
  confidence: number;
  /** 建议的 props */
  suggestedProps?: Record<string, string | boolean>;
  /** 使用示例 */
  usageExample?: string;
}

/**
 * 组件检测结果
 */
export interface LibraryDetectionResult {
  /** 检测到的组件库 */
  library: ComponentLibrary;
  /** 检测依据 */
  reason: string;
  /** 检测到的组件库版本 */
  version?: string;
}

// ============ 自定义映射（v1.4.19 T19） ============

/** 项目自定义映射文件相对路径（<projectRoot>/.figma-dev/components.json） */
export const CUSTOM_MAPPING_FILE_RELATIVE = path.join('.figma-dev', 'components.json');

/**
 * components.json 中的单条自定义组件规则
 */
export interface CustomComponentRule {
  /** 目标库组件名 */
  name: string;
  /**
   * 适用组件库；省略时对当前检测到的任意库生效（库无关规则）。
   * 不允许填 'none'（schema 层与加载校验双重拒绝）。
   */
  library?: Exclude<ComponentLibrary, 'none'>;
  /** import 路径（包名或别名路径） */
  importPath: string;
  /** 节点名关键词（小写匹配） */
  keywords: readonly string[];
  /** 使用示例（覆盖内建示例） */
  usageExample?: string;
  /** 静态建议 props（直接透传，不做节点名推断） */
  suggestedProps?: Record<string, string | boolean>;
}

/** 自定义规则校验/解析的成功结果 */
interface CustomRulesOk {
  readonly ok: true;
  readonly rules: readonly CustomComponentRule[];
}

/** 自定义规则校验/解析的失败结果（detail 为可直接展示的语言无关细节） */
interface CustomRulesError {
  readonly ok: false;
  /** 失败细节（JSON 解析消息或字段路径），拼入 i18n 文案 */
  readonly detail: string;
}

// ============ 组件定义 ============

/**
 * shadcn/ui 组件特征映射
 */
const SHADCN_COMPONENTS: Array<{
  name: string;
  importPath: string;
  keywords: string[];
  features: {
    hasText?: boolean;
    hasIcon?: boolean;
    isInteractive?: boolean;
    minChildren?: number;
    maxChildren?: number;
    borderRadius?: 'sm' | 'md' | 'lg';
    hasBackground?: boolean;
  };
}> = [
  {
    name: 'Button',
    importPath: '@/components/ui/button',
    keywords: ['button', 'btn', '按钮'],
    features: { hasText: true, isInteractive: true, hasBackground: true },
  },
  {
    name: 'Card',
    importPath: '@/components/ui/card',
    keywords: ['card', '卡片'],
    features: { hasBackground: true, borderRadius: 'lg', minChildren: 1 },
  },
  {
    name: 'Input',
    importPath: '@/components/ui/input',
    keywords: ['input', '输入框', 'textfield', 'text field'],
    features: { isInteractive: true },
  },
  {
    name: 'Dialog',
    importPath: '@/components/ui/dialog',
    keywords: ['dialog', 'modal', '弹窗', '对话框'],
    features: { minChildren: 1 },
  },
  {
    name: 'Tabs',
    importPath: '@/components/ui/tabs',
    keywords: ['tabs', '标签页', '选项卡'],
    features: { minChildren: 2 },
  },
  {
    name: 'Badge',
    importPath: '@/components/ui/badge',
    keywords: ['badge', '徽章', '标签'],
    features: { hasText: true, hasBackground: true },
  },
  {
    name: 'Avatar',
    importPath: '@/components/ui/avatar',
    keywords: ['avatar', '头像'],
    features: {},
  },
  {
    name: 'Separator',
    importPath: '@/components/ui/separator',
    keywords: ['separator', 'divider', '分隔线'],
    features: {},
  },
  {
    name: 'Select',
    importPath: '@/components/ui/select',
    keywords: ['select', 'dropdown', 'picker', '下拉', '选择器'],
    features: { isInteractive: true, minChildren: 1 },
  },
  {
    name: 'Textarea',
    importPath: '@/components/ui/textarea',
    keywords: ['textarea', '多行输入', 'text area'],
    features: { isInteractive: true },
  },
  {
    name: 'Checkbox',
    importPath: '@/components/ui/checkbox',
    keywords: ['checkbox', 'check', '复选框'],
    features: { isInteractive: true },
  },
  {
    name: 'Switch',
    importPath: '@/components/ui/switch',
    keywords: ['switch', 'toggle', '开关'],
    features: { isInteractive: true },
  },
  {
    name: 'RadioGroup',
    importPath: '@/components/ui/radio-group',
    keywords: ['radio', '单选', 'radio group'],
    features: { isInteractive: true, minChildren: 2 },
  },
  {
    name: 'Label',
    importPath: '@/components/ui/label',
    keywords: ['label', '标签', 'field label'],
    features: { hasText: true },
  },
  {
    name: 'Slider',
    importPath: '@/components/ui/slider',
    keywords: ['slider', 'range', '滑块'],
    features: { isInteractive: true },
  },
  {
    name: 'Progress',
    importPath: '@/components/ui/progress',
    keywords: ['progress', '进度条', 'loading bar'],
    features: { hasBackground: true },
  },
  {
    name: 'Alert',
    importPath: '@/components/ui/alert',
    keywords: ['alert', 'warning', '提示', '警告'],
    features: { hasBackground: true, hasText: true, minChildren: 1 },
  },
  {
    name: 'Tooltip',
    importPath: '@/components/ui/tooltip',
    keywords: ['tooltip', '提示框'],
    features: { hasText: true },
  },
  {
    name: 'Popover',
    importPath: '@/components/ui/popover',
    keywords: ['popover', '气泡卡片'],
    features: { minChildren: 1 },
  },
  {
    name: 'DropdownMenu',
    importPath: '@/components/ui/dropdown-menu',
    keywords: ['dropdown menu', 'menu', '下拉菜单'],
    features: { minChildren: 1 },
  },
  {
    name: 'AlertDialog',
    importPath: '@/components/ui/alert-dialog',
    keywords: ['alert dialog', 'confirm', '确认弹窗'],
    features: { minChildren: 1 },
  },
  {
    name: 'Sheet',
    importPath: '@/components/ui/sheet',
    keywords: ['sheet', 'drawer', '抽屉', '侧边栏'],
    features: { minChildren: 1 },
  },
  {
    name: 'Skeleton',
    importPath: '@/components/ui/skeleton',
    keywords: ['skeleton', '骨架屏', 'loading'],
    features: { hasBackground: true },
  },
  {
    name: 'Accordion',
    importPath: '@/components/ui/accordion',
    keywords: ['accordion', 'collapse', '折叠面板'],
    features: { minChildren: 1 },
  },
  {
    name: 'Breadcrumb',
    importPath: '@/components/ui/breadcrumb',
    keywords: ['breadcrumb', '面包屑'],
    features: { hasText: true, minChildren: 2 },
  },
  {
    name: 'Pagination',
    importPath: '@/components/ui/pagination',
    keywords: ['pagination', '分页'],
    features: { hasText: true, minChildren: 2 },
  },
  {
    name: 'Toggle',
    importPath: '@/components/ui/toggle',
    keywords: ['toggle button', '切换按钮'],
    features: { isInteractive: true, hasText: true },
  },
];

// ============ ComponentMapper 类 ============

/**
 * 组件映射器
 */
export class ComponentMapper {
  /** 项目根目录 */
  private _projectRoot: string;
  /** 检测结果缓存 */
  private _detectionCache: LibraryDetectionResult | null = null;
  /** i18n（v1.4.19 T19 自定义配置错误双语） */
  private _i18n = getI18n();
  /** 自定义规则缓存：null=尚未加载；空数组=文件不存在或已降级 */
  private _customRules: readonly CustomComponentRule[] | null = null;
  /** 最近一次自定义配置加载错误（已按当前语言翻译）；无错误为 null */
  private _customConfigError: string | null = null;

  constructor(projectRoot: string = process.cwd()) {
    this._projectRoot = projectRoot;
  }

  /**
   * 检测项目使用的组件库
   */
  detectLibrary(): LibraryDetectionResult {
    if (this._detectionCache) return this._detectionCache;

    const pkgPath = path.join(this._projectRoot, 'package.json');

    if (!fs.existsSync(pkgPath)) {
      this._detectionCache = { library: 'none', reason: '未找到 package.json' };
      return this._detectionCache;
    }

    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      // 检测 shadcn/ui（通过 components.json 或依赖）
      const hasComponentsJson = fs.existsSync(path.join(this._projectRoot, 'components.json'));
      if (hasComponentsJson || deps['@radix-ui/react-dialog'] || deps['@shadcn/ui']) {
        this._detectionCache = {
          library: 'shadcn-ui',
          reason: hasComponentsJson ? '检测到 components.json 配置文件' : '检测到 Radix UI 依赖',
          version: deps['@radix-ui/react-dialog']?.replace('^', ''),
        };
        return this._detectionCache;
      }

      // 检测 Ant Design
      if (deps['antd'] || deps['ant-design']) {
        this._detectionCache = {
          library: 'ant-design',
          reason: '检测到 antd 依赖',
          version: deps['antd'] || deps['ant-design'],
        };
        return this._detectionCache;
      }

      // 检测 Element Plus
      if (deps['element-plus']) {
        this._detectionCache = {
          library: 'element-plus',
          reason: '检测到 element-plus 依赖',
          version: deps['element-plus'],
        };
        return this._detectionCache;
      }

      this._detectionCache = { library: 'none', reason: '未检测到已知组件库' };
      return this._detectionCache;
    } catch {
      this._detectionCache = { library: 'none', reason: 'package.json 解析失败' };
      return this._detectionCache;
    }
  }

  /**
   * 匹配单个节点到组件
   *
   * v1.4.19 T19：自定义 .figma-dev/components.json 规则优先于内建表；
   * 命中失败再按检测到的库查 shadcn/antd/element-plus 内建表。
   */
  matchComponent(node: ComponentMatchNode, library?: ComponentLibrary): ComponentMatch | null {
    const lib = library || this.detectLibrary().library;
    if (lib === 'none') return null;

    const nodeName = (node.name || '').toLowerCase();

    // 自定义规则优先（命中即返回，不回退内建）
    const customMatch = this._matchCustomRule(nodeName, lib);
    if (customMatch) return customMatch;

    if (lib === 'shadcn-ui') {
      return this._matchShadcnComponent(node, nodeName);
    }

    return this._matchBuiltinComponent(node, nodeName, lib);
  }

  /**
   * 批量匹配节点树中的组件
   */
  matchComponentsInTree(root: ComponentMatchNode, library?: ComponentLibrary): ComponentMatch[] {
    const matches: ComponentMatch[] = [];
    const lib = library || this.detectLibrary().library;

    const traverse = (node: ComponentMatchNode): void => {
      const match = this.matchComponent(node, lib);
      if (match) matches.push(match);
      if (node.children) {
        node.children.forEach(traverse);
      }
    };

    traverse(root);
    return matches;
  }

  /**
   * 获取指定库所有可用组件列表
   */
  getAvailableComponents(library: ComponentLibrary = 'shadcn-ui'): string[] {
    if (library === 'shadcn-ui') {
      return SHADCN_COMPONENTS.map((c) => c.name);
    }
    // v1.4.19 T19：antd / element-plus 内建表
    return getBuiltinDefsForLibrary(library).map((def) => def.name);
  }

  /**
   * 获取最近一次自定义映射配置的加载错误（v1.4.19 T19，TR-19.2）。
   *
   * 触发懒加载；文件不存在不算错误。错误消息已按当前 i18n 语言翻译。
   * 调用方（CLI/MCP/测试）可据此提示用户，但生成主流程永不因此中断。
   *
   * @returns 翻译后的错误消息；无错误/无文件时返回 null
   */
  getCustomConfigError(): string | null {
    this._loadCustomRules();
    return this._customConfigError;
  }

  /**
   * 懒加载并校验 .figma-dev/components.json（仅读一次，结果缓存）。
   *
   * @returns 自定义规则列表；文件不存在或非法时为空数组（降级）
   */
  private _loadCustomRules(): readonly CustomComponentRule[] {
    if (this._customRules !== null) return this._customRules;

    const file = path.join(this._projectRoot, CUSTOM_MAPPING_FILE_RELATIVE);
    if (!fs.existsSync(file)) {
      this._customRules = [];
      this._customConfigError = null;
      return this._customRules;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (error) {
      this._markCustomRulesFailed(error instanceof Error ? error.message : String(error));
      return this._customRules ?? [];
    }

    const result = parseCustomRules(parsed);
    if (!result.ok) {
      this._markCustomRulesFailed(result.detail);
      return this._customRules ?? [];
    }

    this._customRules = result.rules;
    this._customConfigError = null;
    return this._customRules;
  }

  /**
   * 记录自定义配置降级：空规则 + i18n 错误，并向 stderr 输出一次
   * （MCP stdio 下不污染协议通道；CLI 下用户直接可见）。
   *
   * @param detail - 语言无关的失败细节（JSON 解析消息/字段路径）
   */
  private _markCustomRulesFailed(detail: string): void {
    this._customRules = [];
    this._customConfigError = this._i18n.t('componentMapper.customConfigInvalid', detail) as string;
    console.error(this._customConfigError);
  }

  /**
   * 按自定义规则匹配节点（优先于一切内建表）。
   *
   * @param nodeName - 已小写化的节点名
   * @param library - 当前检测到的组件库
   * @returns 匹配结果；未命中返回 null
   */
  private _matchCustomRule(
    nodeName: string,
    library: Exclude<ComponentLibrary, 'none'>,
  ): ComponentMatch | null {
    const rules = this._loadCustomRules();
    for (const rule of rules) {
      // 规则限定了库但与当前库不一致则跳过；未限定库的规则库无关
      if (rule.library !== undefined && rule.library !== library) continue;
      const keywordMatch = rule.keywords.some((kw) => nodeName.includes(kw.toLowerCase()));
      if (!keywordMatch) continue;

      return {
        componentName: rule.name,
        library,
        importPath: rule.importPath,
        // 显式配置即高置信，但不超过 0.9（仍建议人工确认）
        confidence: 0.85,
        suggestedProps: rule.suggestedProps ? { ...rule.suggestedProps } : undefined,
        usageExample: rule.usageExample ?? `<${rule.name} />`,
      };
    }
    return null;
  }

  /**
   * antd / element-plus 内建表匹配（置信度模型与 shadcn 对齐）。
   *
   * @param node - 待匹配节点
   * @param nodeName - 已小写化的节点名
   * @param library - 目标库（ant-design | element-plus）
   * @returns 匹配结果；未命中返回 null
   */
  private _matchBuiltinComponent(
    node: ComponentMatchNode,
    nodeName: string,
    library: 'ant-design' | 'element-plus',
  ): ComponentMatch | null {
    for (const comp of getBuiltinDefsForLibrary(library)) {
      const keywordMatch = comp.keywords.some((kw) => nodeName.includes(kw.toLowerCase()));
      if (!keywordMatch) continue;

      // 与 shadcn 相同的特征置信度加权
      let confidence = 0.7;
      const features = comp.features;

      if (
        features.hasText &&
        (node.characters || node.children?.some((c) => c.originalType === 'TEXT' || c.role === 'text'))
      ) {
        confidence += 0.1;
      }
      if (features.isInteractive) {
        confidence += 0.1;
      }
      if (features.minChildren && node.children && node.children.length >= features.minChildren) {
        confidence += 0.05;
      }
      if (features.hasBackground && node.fills?.some((f) => f.type === 'SOLID')) {
        confidence += 0.05;
      }

      return {
        componentName: comp.name,
        library,
        importPath: comp.importPath,
        confidence: Math.min(1, confidence),
        suggestedProps: this._suggestLibraryProps(library, comp.name, node),
        usageExample: comp.usageExample,
      };
    }

    return null;
  }

  /**
   * 为 antd / element-plus 命中组件推断建议 props（按节点名关键词）。
   *
   * @param library - 组件库
   * @param componentName - 内建组件名
   * @param node - 命中节点
   * @returns props 键值（值仅 string/boolean）
   */
  private _suggestLibraryProps(
    library: 'ant-design' | 'element-plus',
    componentName: string,
    node: ComponentMatchNode,
  ): Record<string, string | boolean> {
    const props: Record<string, string | boolean> = {};
    const name = (node.name || '').toLowerCase();
    const isButton =
      componentName === 'Button' || componentName === 'ElButton';

    if (isButton) {
      if (library === 'ant-design') {
        if (name.includes('primary') || name.includes('主要')) props.type = 'primary';
        else if (name.includes('dashed') || name.includes('虚线')) props.type = 'dashed';
        else if (name.includes('link') || name.includes('链接')) props.type = 'link';
        else if (name.includes('text') || name.includes('文本')) props.type = 'text';
        else props.type = 'default';
        if (name.includes('danger') || name.includes('危险')) props.danger = true;
        if (name.includes('small') || name.includes('sm')) props.size = 'small';
        else if (name.includes('large') || name.includes('lg') || name.includes('大')) props.size = 'large';
      } else {
        if (name.includes('success') || name.includes('成功')) props.type = 'success';
        else if (name.includes('warning') || name.includes('警告')) props.type = 'warning';
        else if (name.includes('danger') || name.includes('危险')) props.type = 'danger';
        else if (name.includes('info') || name.includes('信息')) props.type = 'info';
        else if (name.includes('primary') || name.includes('主要')) props.type = 'primary';
        if (name.includes('plain') || name.includes('朴素')) props.plain = true;
        if (name.includes('round') || name.includes('圆角')) props.round = true;
        if (name.includes('small') || name.includes('sm')) props.size = 'small';
        else if (name.includes('large') || name.includes('lg') || name.includes('大')) props.size = 'large';
      }
      if (name.includes('disabled') || name.includes('禁用')) props.disabled = true;
      if (name.includes('loading') || name.includes('加载')) props.loading = true;
    }

    if (
      componentName === 'Input' ||
      componentName === 'ElInput' ||
      componentName === 'Textarea' ||
      componentName === 'ElInputTextarea' ||
      componentName === 'Select' ||
      componentName === 'ElSelect'
    ) {
      if (name.includes('disabled') || name.includes('禁用')) props.disabled = true;
      if (name.includes('error') || name.includes('invalid') || name.includes('错误')) {
        props['aria-invalid'] = true;
      }
    }

    if (componentName === 'Switch' || componentName === 'ElSwitch') {
      if (name.includes('checked') || name.includes('on') || name.includes('开')) props.checked = true;
      if (name.includes('disabled') || name.includes('禁用')) props.disabled = true;
    }

    return props;
  }

  /**
   * shadcn/ui 组件匹配
   */
  private _matchShadcnComponent(node: ComponentMatchNode, nodeName: string): ComponentMatch | null {
    for (const comp of SHADCN_COMPONENTS) {
      // 关键词匹配
      const keywordMatch = comp.keywords.some((kw) => nodeName.includes(kw.toLowerCase()));
      if (!keywordMatch) continue;

      // 简单特征验证
      let confidence = 0.7;
      const features = comp.features;

      if (
        features.hasText &&
        (node.characters || node.children?.some((c) => c.originalType === 'TEXT' || c.role === 'text'))
      ) {
        confidence += 0.1;
      }
      if (features.isInteractive) {
        confidence += 0.1;
      }
      if (features.minChildren && node.children && node.children.length >= features.minChildren) {
        confidence += 0.05;
      }
      if (features.hasBackground && node.fills?.some((f) => f.type === 'SOLID')) {
        confidence += 0.05;
      }

      return {
        componentName: comp.name,
        library: 'shadcn-ui',
        importPath: comp.importPath,
        confidence: Math.min(1, confidence),
        suggestedProps: this._getSuggestedProps(comp.name, node),
        usageExample: this._getUsageExample(comp.name),
      };
    }

    return null;
  }

  /**
   * 获取建议的 props
   */
  private _getSuggestedProps(componentName: string, node: ComponentMatchNode): Record<string, string | boolean> {
    const props: Record<string, string | boolean> = {};
    const name = (node.name || '').toLowerCase();

    switch (componentName) {
      case 'Button':
        if (name.includes('primary') || name.includes('主要')) props.variant = 'default';
        else if (name.includes('secondary') || name.includes('次要')) props.variant = 'secondary';
        else if (name.includes('outline') || name.includes('边框')) props.variant = 'outline';
        else if (name.includes('ghost')) props.variant = 'ghost';
        else if (name.includes('link')) props.variant = 'link';
        else if (name.includes('destructive') || name.includes('danger') || name.includes('危险'))
          props.variant = 'destructive';
        if (name.includes('disabled')) props.disabled = true;
        if (name.includes('small') || name.includes('sm')) props.size = 'sm';
        else if (name.includes('large') || name.includes('lg') || name.includes('大')) props.size = 'lg';
        break;
      case 'Badge':
        if (name.includes('success') || name.includes('成功')) props.variant = 'default';
        else if (name.includes('destructive') || name.includes('danger') || name.includes('错误'))
          props.variant = 'destructive';
        else if (name.includes('outline')) props.variant = 'outline';
        else if (name.includes('secondary')) props.variant = 'secondary';
        break;
      case 'Alert':
        if (name.includes('success')) props.variant = 'default';
        else if (name.includes('destructive') || name.includes('danger') || name.includes('error'))
          props.variant = 'destructive';
        else if (name.includes('warning') || name.includes('warn')) props.variant = 'default';
        break;
      case 'Input':
        if (name.includes('disabled')) props.disabled = true;
        if (name.includes('error') || name.includes('invalid')) props['aria-invalid'] = true;
        break;
      case 'Textarea':
        if (name.includes('disabled')) props.disabled = true;
        break;
      case 'Switch':
        if (name.includes('checked') || name.includes('on')) props.checked = true;
        if (name.includes('disabled')) props.disabled = true;
        break;
      case 'Checkbox':
        if (name.includes('checked') || name.includes('selected')) props.checked = true;
        if (name.includes('disabled')) props.disabled = true;
        break;
      case 'Progress':
        props.value = '60';
        break;
      case 'Avatar':
        break;
    }

    return props;
  }

  /**
   * 获取使用示例
   */
  private _getUsageExample(componentName: string): string {
    switch (componentName) {
      case 'Button':
        return '<Button variant="default">Click me</Button>';
      case 'Card':
        return '<Card><CardHeader><CardTitle>Title</CardTitle></CardHeader><CardContent>Content</CardContent></Card>';
      case 'Input':
        return '<Input placeholder="Enter..." />';
      case 'Textarea':
        return '<Textarea placeholder="Enter text..." />';
      case 'Badge':
        return '<Badge variant="default">Badge</Badge>';
      case 'Select':
        return '<Select><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger><SelectContent><SelectItem value="1">Option 1</SelectItem></SelectContent></Select>';
      case 'Checkbox':
        return '<Checkbox id="terms" />';
      case 'Switch':
        return '<Switch />';
      case 'Label':
        return '<Label htmlFor="email">Email</Label>';
      case 'Tabs':
        return '<Tabs defaultValue="tab1"><TabsList><TabsTrigger value="tab1">Tab 1</TabsTrigger><TabsTrigger value="tab2">Tab 2</TabsTrigger></TabsList><TabsContent value="tab1">Content</TabsContent></Tabs>';
      case 'Dialog':
        return '<Dialog><DialogTrigger>Open</DialogTrigger><DialogContent><DialogHeader><DialogTitle>Title</DialogTitle></DialogHeader></DialogContent></Dialog>';
      case 'Alert':
        return '<Alert><AlertTitle>Title</AlertTitle><AlertDescription>Description</AlertDescription></Alert>';
      case 'Avatar':
        return '<Avatar><AvatarImage src="avatar.jpg" /><AvatarFallback>U</AvatarFallback></Avatar>';
      case 'Separator':
        return '<Separator />';
      case 'Progress':
        return '<Progress value={60} />';
      case 'Slider':
        return '<Slider defaultValue={[50]} max={100} step={1} />';
      case 'Tooltip':
        return '<Tooltip><TooltipTrigger>Hover</TooltipTrigger><TooltipContent>Tooltip text</TooltipContent></Tooltip>';
      case 'Popover':
        return '<Popover><PopoverTrigger>Open</PopoverTrigger><PopoverContent>Content</PopoverContent></Popover>';
      case 'DropdownMenu':
        return '<DropdownMenu><DropdownMenuTrigger>Open</DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem>Item</DropdownMenuItem></DropdownMenuContent></DropdownMenu>';
      case 'AlertDialog':
        return '<AlertDialog><AlertDialogTrigger>Open</AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirm</AlertDialogTitle></AlertDialogHeader></AlertDialogContent></AlertDialog>';
      case 'Sheet':
        return '<Sheet><SheetTrigger>Open</SheetTrigger><SheetContent>Content</SheetContent></Sheet>';
      case 'Skeleton':
        return '<Skeleton className="h-4 w-[250px]" />';
      case 'Accordion':
        return '<Accordion type="single"><AccordionItem value="item-1"><AccordionTrigger>Question</AccordionTrigger><AccordionContent>Answer</AccordionContent></AccordionItem></Accordion>';
      case 'Breadcrumb':
        return '<Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbLink href="/">Home</BreadcrumbLink></BreadcrumbItem></BreadcrumbList></Breadcrumb>';
      case 'Pagination':
        return '<Pagination><PaginationContent><PaginationItem><PaginationPrevious href="#" /></PaginationItem><PaginationItem><PaginationLink href="#" isActive>1</PaginationLink></PaginationItem><PaginationItem><PaginationNext href="#" /></PaginationItem></PaginationContent></Pagination>';
      case 'Toggle':
        return '<Toggle>Toggle</Toggle>';
      case 'RadioGroup':
        return '<RadioGroup defaultValue="option-1"><div className="flex items-center space-x-2"><RadioGroupItem value="option-1" id="option-1" /><Label htmlFor="option-1">Option 1</Label></div></RadioGroup>';
      default:
        return `<${componentName} />`;
    }
  }
}

// ============ 自定义配置校验（v1.4.19 T19） ============

/** 可在 components.json 中声明的组件库集合（不含 none） */
const CUSTOM_RULE_LIBRARIES: readonly string[] = ['shadcn-ui', 'ant-design', 'element-plus'];

/**
 * 运行时类型守卫：值为普通对象（非数组、非 null）
 *
 * @param value - 任意值
 * @returns 是否为 Record<string, unknown>
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 校验并解析 components.json 内容（不依赖 ajv；结构化校验与
 * components.schema.json 保持同步）。
 *
 * 任一 entry 非法即整体失败（TR-19.2：调用方降级为空规则并给 i18n 提示）。
 *
 * @param parsed - JSON.parse 后的未知值
 * @returns 成功携带规则；失败携带字段级 detail
 */
function parseCustomRules(parsed: unknown): CustomRulesOk | CustomRulesError {
  if (!isRecord(parsed) || !Array.isArray(parsed.components)) {
    return {
      ok: false,
      detail: 'root must be an object with a "components" array',
    };
  }

  const rules: CustomComponentRule[] = [];
  const entries: readonly unknown[] = parsed.components;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const where = `components[${index}]`;

    if (!isRecord(entry)) {
      return { ok: false, detail: `${where} must be an object` };
    }
    if (typeof entry.name !== 'string' || entry.name.trim() === '') {
      return { ok: false, detail: `${where}.name must be a non-empty string` };
    }
    if (typeof entry.importPath !== 'string' || entry.importPath.trim() === '') {
      return { ok: false, detail: `${where}.importPath must be a non-empty string` };
    }
    if (
      !Array.isArray(entry.keywords) ||
      entry.keywords.length === 0 ||
      !entry.keywords.every((kw) => typeof kw === 'string' && kw.trim() !== '')
    ) {
      return {
        ok: false,
        detail: `${where}.keywords must be a non-empty array of non-empty strings`,
      };
    }
    if (
      entry.library !== undefined &&
      (typeof entry.library !== 'string' || !CUSTOM_RULE_LIBRARIES.includes(entry.library))
    ) {
      return {
        ok: false,
        detail: `${where}.library must be one of ${CUSTOM_RULE_LIBRARIES.join(', ')}`,
      };
    }
    if (entry.usageExample !== undefined && typeof entry.usageExample !== 'string') {
      return { ok: false, detail: `${where}.usageExample must be a string` };
    }

    let suggestedProps: Record<string, string | boolean> | undefined;
    if (entry.suggestedProps !== undefined) {
      if (!isRecord(entry.suggestedProps)) {
        return { ok: false, detail: `${where}.suggestedProps must be an object` };
      }
      for (const [key, value] of Object.entries(entry.suggestedProps)) {
        if (typeof value !== 'string' && typeof value !== 'boolean') {
          return {
            ok: false,
            detail: `${where}.suggestedProps.${key} must be a string or boolean`,
          };
        }
      }
      suggestedProps = { ...(entry.suggestedProps as Record<string, string | boolean>) };
    }

    rules.push({
      name: entry.name,
      importPath: entry.importPath,
      keywords: (entry.keywords as string[]).map((kw) => kw.toLowerCase()),
      library: entry.library as CustomComponentRule['library'],
      usageExample: typeof entry.usageExample === 'string' ? entry.usageExample : undefined,
      suggestedProps,
    });
  }

  return { ok: true, rules };
}

// ============ 工厂函数 ============

/**
 * 创建组件映射器实例
 */
export function createComponentMapper(projectRoot?: string): ComponentMapper {
  return new ComponentMapper(projectRoot);
}
