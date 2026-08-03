/**
 * 无障碍 (a11y) 自动增强服务
 *
 * 为生成的代码自动添加无障碍属性和语义化标签：
 * 1. 语义化标签选择：header/nav/main/section/article/aside/footer/button 而非全用 div
 * 2. 图片 alt 文本：根据节点名称智能生成，装饰性图片用 alt=""
 * 3. ARIA 属性：为交互元素添加 aria-label, aria-hidden, role
 * 4. 按钮识别：检测可点击元素，使用 <button> 而非 div + onClick
 * 5. 表单标签：检测输入框，关联 label
 *
 * @module
 */

import type { ProcessedNode, NodeSemanticRole } from '../types/nodes.js';
import { getI18n } from '../i18n/index.js';

// ============ 类型定义 ============

/**
 * 语义标签类型
 */
export type SemanticTag =
  | 'header'
  | 'nav'
  | 'main'
  | 'section'
  | 'article'
  | 'aside'
  | 'footer'
  | 'button'
  | 'a'
  | 'img'
  | 'ul'
  | 'ol'
  | 'li'
  | 'p'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'span'
  | 'div'
  | 'input'
  | 'label'
  | 'form'
  | 'hr';

/**
 * A11y 增强结果（附加到节点上）
 */
export interface A11yEnhancements {
  /** 推荐使用的语义标签 */
  semanticTag?: SemanticTag;
  /** alt 文本（图片节点） */
  altText?: string;
  /** 是否为装饰性图片（alt=""） */
  isDecorative?: boolean;
  /** aria-label 属性值 */
  ariaLabel?: string;
  /** aria-hidden */
  ariaHidden?: boolean;
  /** role 属性 */
  role?: string;
  /** 是否为按钮（需添加 type="button"） */
  isButton?: boolean;
  /** 是否需要 label 关联（表单元素） */
  needsLabel?: boolean;
  /** label 文本 */
  labelText?: string;
  /** 标签建议（type 属性） */
  inputType?: string;
}

/**
 * A11y 报告条目
 */
export interface A11yReportEntry {
  /** Figma 节点 ID */
  nodeId: string;
  /** 节点名称 */
  nodeName: string;
  /** 增强类型 */
  enhancement:
    | 'semantic-tag'
    | 'alt-text'
    | 'decorative-image'
    | 'aria-label'
    | 'aria-hidden'
    | 'role'
    | 'button-type'
    | 'form-label';
  /** 增强描述 */
  description: string;
  /** 原标签 → 新标签 */
  tagChange?: { from: string; to: string };
}

/**
 * A11y 增强结果
 */
export interface A11yEnhancerResult {
  /** 原始节点树（已就地修改） */
  node: ProcessedNode;
  /** 增强报告 */
  report: A11yReportEntry[];
  /** 统计：语义标签替换数量 */
  semanticTagsCount: number;
  /** 统计：图片检查数量 */
  imagesCheckedCount: number;
  /** 统计：按钮识别数量 */
  buttonsIdentifiedCount: number;
  /** 统计：表单标签数量 */
  formsLabeledCount: number;
  /** 统计：ARIA 属性添加数量 */
  ariaAddedCount: number;
  /** 总共增强的节点数量（report.length 的别名） */
  enhancementsCount: number;
  /** 需要手动检查的建议 */
  suggestions: string[];
}

// ============ A11yEnhancer 类 ============

/**
 * 无障碍增强器
 *
 * 遍历 ProcessedNode 树，为节点添加语义化标签和无障碍属性建议。
 * 通过节点上的 `_a11y` 扩展字段传递增强信息给代码生成器。
 */
export class A11yEnhancer {
  /** 增强报告 */
  private _report: A11yReportEntry[] = [];
  /** 建议列表 */
  private _suggestions: string[] = [];
  /** i18n 实例 */
  private _i18n = getI18n();

  /**
   * 对节点树应用 a11y 增强
   *
   * @param root - 根节点
   * @returns 增强结果
   */
  enhance(root: ProcessedNode): A11yEnhancerResult {
    this._report = [];
    this._suggestions = [];

    this._processNode(root, null, { depth: 0, isRoot: true });

    const stats = this._computeStats();

    return {
      node: root,
      report: this._report,
      suggestions: this._suggestions,
      enhancementsCount: this._report.length,
      ...stats,
    };
  }

  /**
   * 处理单个节点（递归）
   *
   * @param node - 当前节点
   * @param parent - 父节点
   * @param context - 遍历上下文
   */
  private _processNode(
    node: ProcessedNode,
    parent: ProcessedNode | null,
    context: { depth: number; isRoot: boolean },
  ): void {
    if (node.visible === false) {
      this._processChildren(node, context.depth);
      return;
    }

    const enhancements: A11yEnhancements = {};
    const _originalRole = node.role;

    // ============ 1. 语义标签推断 ============
    const semanticTag = this._inferSemanticTag(node, parent, context);
    if (semanticTag && semanticTag !== this._getDefaultTag(node.role)) {
      enhancements.semanticTag = semanticTag;
      this._report.push({
        nodeId: node.figmaId,
        nodeName: node.name,
        enhancement: 'semantic-tag',
        description: this._i18n.t('a11y.semanticReplacement', this._getDefaultTag(node.role), semanticTag) as string,
        tagChange: { from: this._getDefaultTag(node.role), to: semanticTag },
      });
    }

    // ============ 2. 图片 alt 文本处理 ============
    if (node.role === 'image' || (node.fills?.some((f) => f.type === 'image') ?? false)) {
      this._processImageAlt(node, enhancements);
    }

    // ============ 3. 图标节点处理 ============
    if (node.role === 'icon') {
      enhancements.ariaHidden = true;
      this._report.push({
        nodeId: node.figmaId,
        nodeName: node.name,
        enhancement: 'aria-hidden',
        description: '图标添加 aria-hidden="true"（建议搭配可见文本或 aria-label）',
      });
    }

    // ============ 4. 按钮识别增强 ============
    if (node.role === 'button' || this._looksLikeButton(node)) {
      enhancements.isButton = true;
      enhancements.semanticTag = enhancements.semanticTag || 'button';
      if (!enhancements.ariaLabel && this._needsAriaLabel(node)) {
        enhancements.ariaLabel = this._inferAriaLabel(node);
        if (enhancements.ariaLabel) {
          this._report.push({
            nodeId: node.figmaId,
            nodeName: node.name,
            enhancement: 'aria-label',
            description: `按钮添加 aria-label="${enhancements.ariaLabel}"`,
          });
        }
      }
      this._report.push({
        nodeId: node.figmaId,
        nodeName: node.name,
        enhancement: 'button-type',
        description: this._i18n.t('a11y.buttonTypeAdded') as string,
      });
    }

    // ============ 5. 链接识别 ============
    if (this._looksLikeLink(node)) {
      enhancements.semanticTag = enhancements.semanticTag || 'a';
      if (!enhancements.ariaLabel && this._needsAriaLabel(node)) {
        enhancements.ariaLabel = this._inferAriaLabel(node);
      }
    }

    // ============ 6. 表单输入处理 ============
    if (node.role === 'input' || this._looksLikeInput(node)) {
      enhancements.semanticTag = enhancements.semanticTag || 'input';
      enhancements.needsLabel = true;
      enhancements.inputType = this._inferInputType(node);
      enhancements.labelText = this._inferLabelText(node);
      this._report.push({
        nodeId: node.figmaId,
        nodeName: node.name,
        enhancement: 'form-label',
        description: `输入框建议关联 label（${enhancements.labelText || node.name}）`,
      });
    }

    // ============ 7. 纯装饰性元素处理 ============
    if (this._isDecorative(node)) {
      enhancements.ariaHidden = true;
    }

    // 应用增强到节点
    if (Object.keys(enhancements).length > 0) {
      node._a11y = enhancements;
    }

    // 处理根节点建议
    if (context.isRoot) {
      this._addRootSuggestions(node);
    }

    // 递归处理子节点
    this._processChildren(node, context.depth);
  }

  /**
   * 处理子节点
   */
  private _processChildren(node: ProcessedNode, parentDepth: number): void {
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        this._processNode(child, node, { depth: parentDepth + 1, isRoot: false });
      }
    }
  }

  /**
   * 统计增强数量
   */
  private _computeStats(): Pick<
    A11yEnhancerResult,
    'semanticTagsCount' | 'imagesCheckedCount' | 'buttonsIdentifiedCount' | 'formsLabeledCount' | 'ariaAddedCount'
  > {
    let semantic = 0;
    let images = 0;
    let buttons = 0;
    let forms = 0;
    let aria = 0;

    for (const entry of this._report) {
      switch (entry.enhancement) {
        case 'semantic-tag':
          semantic++;
          break;
        case 'alt-text':
        case 'decorative-image':
          images++;
          break;
        case 'button-type':
          buttons++;
          break;
        case 'form-label':
          forms++;
          break;
        case 'aria-label':
        case 'aria-hidden':
        case 'role':
          aria++;
          break;
      }
    }

    return {
      semanticTagsCount: semantic,
      imagesCheckedCount: images,
      buttonsIdentifiedCount: buttons,
      formsLabeledCount: forms,
      ariaAddedCount: aria,
    };
  }

  // ============ 语义标签推断 ============

  /**
   * 获取 role 默认标签
   */
  private _getDefaultTag(role: NodeSemanticRole): string {
    const defaults: Record<NodeSemanticRole, string> = {
      container: 'div',
      text: 'p',
      button: 'button',
      image: 'img',
      icon: 'span',
      card: 'div',
      input: 'input',
      link: 'a',
      avatar: 'div',
      badge: 'span',
      divider: 'hr',
      steps: 'div',
      'traffic-light': 'div',
      list: 'ul',
      'list-item': 'li',
      section: 'section',
      'reusable-component': 'div',
      'layout-only': 'div',
    };
    return defaults[role] || 'div';
  }

  /**
   * 推断语义标签
   */
  private _inferSemanticTag(
    node: ProcessedNode,
    parent: ProcessedNode | null,
    context: { depth: number; isRoot: boolean },
  ): SemanticTag | null {
    const name = node.name.toLowerCase();

    // 如果已经有明确的 role（非 container），保持现有映射但根据名称优化
    if (node.role !== 'container' && node.role !== 'layout-only') {
      return this._enhanceExistingRole(node, parent);
    }

    // ============ 根据节点名和位置推断 landmark 标签 ============

    // 根节点或顶级容器
    if (context.isRoot || context.depth === 0) {
      if (name.includes('header') || name.includes('顶部') || name.includes('导航栏') || name.includes('navbar')) {
        return 'header';
      }
      if (name.includes('footer') || name.includes('底部') || name.includes('页脚')) {
        return 'footer';
      }
      if (name.includes('nav') || name.includes('menu') || name.includes('导航') || name.includes('菜单')) {
        return 'nav';
      }
      if (name.includes('main') || name.includes('content') || name.includes('主要') || name.includes('内容')) {
        return 'main';
      }
      if (name.includes('sidebar') || name.includes('aside') || name.includes('侧边栏')) {
        return 'aside';
      }
      if (name.includes('section') || name.includes('区块') || name.includes('板块')) {
        return 'section';
      }
    }

    // 子容器根据名称推断
    if (name.includes('header') && !parent?.name.toLowerCase().includes('header')) {
      return 'header';
    }
    if (name.includes('footer') && !parent?.name.toLowerCase().includes('footer')) {
      return 'footer';
    }
    if (name.includes('nav') && context.depth > 0) {
      return 'nav';
    }
    if (name.includes('article') || name.includes('post') || name.includes('文章')) {
      return 'article';
    }
    if (name.includes('section') || (name.match(/^[a-z]+[-_]?section$/) && context.depth <= 2)) {
      return 'section';
    }
    if (name.includes('list') && node.children && node.children.length > 0) {
      return node.children.every((c) => c.role === 'list-item' || c.name.toLowerCase().includes('item')) ? 'ul' : null;
    }
    if (name.includes('form') || name.includes('表单')) {
      return 'form';
    }

    // 按钮检测
    if (this._looksLikeButton(node)) {
      return 'button';
    }

    // 链接检测
    if (this._looksLikeLink(node)) {
      return 'a';
    }

    // 输入框检测
    if (this._looksLikeInput(node)) {
      return 'input';
    }

    return null;
  }

  /**
   * 基于已有 role 增强标签选择
   */
  private _enhanceExistingRole(node: ProcessedNode, _parent: ProcessedNode | null): SemanticTag | null {
    const name = node.name.toLowerCase();

    switch (node.role) {
      case 'text': {
        // 根据节点名进一步优化标题层级
        const size = node.textStyle?.fontSize;
        if (name.includes('title') || name.includes('heading') || name.includes('标题')) {
          if (size && size >= 36) return 'h1';
          if (size && size >= 28) return 'h2';
          if (size && size >= 24) return 'h3';
          return 'h2';
        }
        if (name.includes('subtitle') || name.includes('副标题')) {
          return 'h3';
        }
        if (name.includes('label')) {
          return 'label';
        }
        // 保持原有的字号推断逻辑（由 code-generator 处理）
        return null;
      }
      case 'section':
        return 'section';
      case 'card':
        if (name.includes('article') || name.includes('post')) {
          return 'article';
        }
        return null;
      case 'button':
        return 'button';
      case 'link':
        return 'a';
      case 'image':
        return 'img';
      case 'list':
        return name.includes('ordered') || name.includes('ol') ? 'ol' : 'ul';
      case 'divider':
        return 'hr';
      default:
        return null;
    }
  }

  // ============ 图片 alt 处理 ============

  /**
   * 处理图片 alt 文本
   */
  private _processImageAlt(node: ProcessedNode, enhancements: A11yEnhancements): void {
    const name = node.name.toLowerCase();

    // 装饰性图片判断：背景图、分隔线、纯装饰图形
    if (
      name.includes('bg') ||
      name.includes('background') ||
      name.includes('decorat') ||
      name.includes('ornament') ||
      name.includes('divider') ||
      name.includes('line') ||
      name.includes('背景') ||
      name.includes('装饰') ||
      name.includes('分割')
    ) {
      enhancements.isDecorative = true;
      enhancements.altText = '';
      this._report.push({
        nodeId: node.figmaId,
        nodeName: node.name,
        enhancement: 'decorative-image',
        description: this._i18n.t('a11y.decorativeImage') as string,
      });
    } else {
      // 根据节点名生成有意义的 alt
      const alt = this._generateAltText(node);
      enhancements.altText = alt;
      this._report.push({
        nodeId: node.figmaId,
        nodeName: node.name,
        enhancement: 'alt-text',
        description: `图片添加 alt="${alt}"`,
      });
    }
  }

  /**
   * 生成 alt 文本
   */
  private _generateAltText(node: ProcessedNode): string {
    const name = node.name
      .replace(/[_-]/g, ' ')
      .replace(/^(img|image|icon|pic|photo|picture)\s*/i, '')
      .trim();

    // 如果名称是图标或头像
    if (node.role === 'icon' || name.toLowerCase().includes('icon')) {
      return `${name} 图标`;
    }
    if (node.role === 'avatar' || name.toLowerCase().includes('avatar')) {
      return `${name} 头像`;
    }
    if (name.toLowerCase().includes('logo')) {
      return `${name} Logo`;
    }

    return name || '图片';
  }

  // ============ 按钮/链接/输入检测 ============

  /**
   * 判断是否看起来像按钮
   */
  private _looksLikeButton(node: ProcessedNode): boolean {
    if (node.role === 'button') return true;
    const name = node.name.toLowerCase();
    return (
      name.includes('button') ||
      name.includes('btn') ||
      name.includes('cta') ||
      name.includes('submit') ||
      name.includes('confirm') ||
      name.includes('cancel') ||
      name.includes('按钮') ||
      name.includes('提交') ||
      name.includes('确认') ||
      name.includes('取消')
    );
  }

  /**
   * 判断是否看起来像链接
   */
  private _looksLikeLink(node: ProcessedNode): boolean {
    if (node.role === 'link') return true;
    const name = node.name.toLowerCase();
    return (
      name.includes('link') ||
      name.includes('href') ||
      name.includes('url') ||
      name.includes('learn more') ||
      name.includes('read more') ||
      name.includes('链接') ||
      name.includes('查看更多')
    );
  }

  /**
   * 判断是否看起来像输入框
   */
  private _looksLikeInput(node: ProcessedNode): boolean {
    if (node.role === 'input') return true;
    const name = node.name.toLowerCase();
    return (
      name.includes('input') ||
      name.includes('textfield') ||
      name.includes('textarea') ||
      name.includes('search') ||
      name.includes('email') ||
      name.includes('password') ||
      name.includes('输入') ||
      name.includes('搜索')
    );
  }

  /**
   * 推断 input type
   */
  private _inferInputType(node: ProcessedNode): string {
    const name = node.name.toLowerCase();
    if (name.includes('search')) return 'search';
    if (name.includes('email') || name.includes('邮件')) return 'email';
    if (name.includes('password') || name.includes('密码')) return 'password';
    if (name.includes('tel') || name.includes('phone') || name.includes('手机')) return 'tel';
    if (name.includes('url') || name.includes('网址')) return 'url';
    if (name.includes('number') || name.includes('数字')) return 'number';
    if (name.includes('textarea')) return 'textarea';
    return 'text';
  }

  /**
   * 推断 label 文本
   */
  private _inferLabelText(node: ProcessedNode): string {
    return node.name
      .replace(/[_-]/g, ' ')
      .replace(/^(input|textfield|search|email|password|textarea)\s*/i, '')
      .trim() || '输入框';
  }

  /**
   * 判断是否需要 aria-label
   */
  private _needsAriaLabel(node: ProcessedNode): boolean {
    // 没有文本内容的按钮/链接需要 aria-label
    const hasTextChild = node.children?.some(
      (c) => c.role === 'text' || c.originalType === 'TEXT' || c.textContent,
    );
    return !hasTextChild && !node.textContent;
  }

  /**
   * 推断 aria-label
   */
  private _inferAriaLabel(node: ProcessedNode): string {
    const name = node.name
      .replace(/[_-]/g, ' ')
      .replace(/^(btn|button|link|icon)\s*/i, '')
      .trim();
    return name || node.role;
  }

  /**
   * 判断是否为纯装饰性元素
   */
  private _isDecorative(node: ProcessedNode): boolean {
    const name = node.name.toLowerCase();
    return (
      name.includes('decoration') ||
      name.includes('ornament') ||
      name.includes('pattern') ||
      name.includes('shape') ||
      name.includes('装饰') ||
      name.includes('图形')
    );
  }

  // ============ 根节点建议 ============

  /**
   * 为根节点添加全局 a11y 建议
   */
  private _addRootSuggestions(root: ProcessedNode): void {
    this._suggestions.push('建议在页面顶层添加 <html lang="zh-CN"> 语言属性');
    this._suggestions.push('建议添加跳过导航链接（Skip to content）');

    if (!this._hasLandmark(root, 'main')) {
      this._suggestions.push('建议为主要内容区域使用 <main> 标签');
    }
    if (!this._hasLandmark(root, 'nav')) {
      this._suggestions.push('建议为导航区域使用 <nav> 标签');
    }

    // 检查颜色对比度（简化提示）
    this._suggestions.push('建议检查文本与背景的颜色对比度（WCAG AA: 4.5:1）');
    this._suggestions.push('建议确保所有交互元素可通过键盘 Tab 键访问');
  }

  /**
   * 检查是否包含指定 landmark
   */
  private _hasLandmark(node: ProcessedNode, tag: string): boolean {
    const name = node.name.toLowerCase();
    if (
      (tag === 'main' && (name.includes('main') || name.includes('content'))) ||
      (tag === 'nav' && (name.includes('nav') || name.includes('menu'))) ||
      (tag === 'header' && name.includes('header')) ||
      (tag === 'footer' && name.includes('footer'))
    ) {
      return true;
    }
    return node.children?.some((c) => this._hasLandmark(c, tag)) ?? false;
  }
}

// ============ 工厂函数 ============

/**
 * 创建 A11yEnhancer 实例
 *
 * @returns A11yEnhancer 实例
 */
export function createA11yEnhancer(): A11yEnhancer {
  return new A11yEnhancer();
}

/**
 * 便捷函数：直接对节点树应用 a11y 增强
 *
 * @param node - 根节点
 * @returns 增强结果
 */
export function enhanceA11y(node: ProcessedNode): A11yEnhancerResult {
  const enhancer = createA11yEnhancer();
  return enhancer.enhance(node);
}
