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
   */
  matchComponent(node: ComponentMatchNode, library?: ComponentLibrary): ComponentMatch | null {
    const lib = library || this.detectLibrary().library;
    if (lib === 'none') return null;

    const nodeName = (node.name || '').toLowerCase();

    if (lib === 'shadcn-ui') {
      return this._matchShadcnComponent(node, nodeName);
    }

    // 其他组件库基础匹配（后续扩展）
    return null;
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
    return [];
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

// ============ 工厂函数 ============

/**
 * 创建组件映射器实例
 */
export function createComponentMapper(projectRoot?: string): ComponentMapper {
  return new ComponentMapper(projectRoot);
}
