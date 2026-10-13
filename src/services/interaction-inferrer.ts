/**
 * 交互逻辑推断服务 - Interaction Inferrer (v1.4.0)
 *
 * 基于节点名称、角色、原型交互（若可用）推断常见交互模式：
 * 1. 按钮点击：onClick 事件处理器占位
 * 2. 表单提交：onSubmit + 受控输入
 * 3. 弹窗开关：Dialog/Sheet open state
 * 4. Tab 切换：Tabs value state
 * 5. 下拉选择：Select value state
 * 6. Hover 效果：Tooltip/Popover 触发
 *
 * v1 仅输出交互建议注释和基础代码骨架，不生成完整业务逻辑
 *
 * @module
 */

import type { ProcessedNode } from '../types/nodes.js';

// ============ 类型定义 ============

/**
 * 交互类型
 */
export type InteractionType =
  | 'button-click'
  | 'form-submit'
  | 'form-validation'
  | 'dialog-toggle'
  | 'sheet-toggle'
  | 'tabs-switch'
  | 'select-change'
  | 'input-change'
  | 'checkbox-change'
  | 'switch-toggle'
  | 'hover-tooltip'
  | 'hover-popover'
  | 'link-navigation'
  | 'carousel-swipe'
  | 'accordion-toggle';

/**
 * 推断出的交互
 */
export interface InferredInteraction {
  /** Figma 节点 ID */
  nodeId: string;
  /** 节点名称 */
  nodeName: string;
  /** 交互类型 */
  type: InteractionType;
  /** 建议的状态变量名 */
  stateName?: string;
  /** 建议的事件处理器名 */
  handlerName?: string;
  /** 关联组件（如 Dialog → 对应 DialogContent 节点 ID） */
  relatedNodeId?: string;
  /** 置信度 0-1 */
  confidence: number;
  /** 代码注释建议 */
  codeHint: string;
}

/**
 * 交互推断报告
 */
export interface InteractionInferrerResult {
  /** 原始节点树（已附加交互信息） */
  node: ProcessedNode;
  /** 推断出的交互列表 */
  interactions: InferredInteraction[];
  /** 统计：交互数量 */
  interactionsCount: number;
  /** 需要的 React imports（useState 等） */
  requiredReactImports: string[];
  /** 代码中需要插入的 state 声明 */
  stateDeclarations: string[];
  /** 代码中需要插入的 handler 骨架 */
  handlerSkeletons: string[];
}

// ============ 交互推断类 ============

/**
 * 关键词列表 → 组合词边界正则（模块级记忆化，P3-12）。
 * 每个节点会做十几次关键词匹配，每次 3-12 个词；实时 new RegExp 在
 * 千节点页会产生数万次正则编译。关键词列表都是静态字面量，按 join 键
 * 缓存「整组交替」正则，匹配语义与逐词 `(^|[^a-z0-9])kw([^a-z0-9]|$)` 完全等价。
 */
const KEYWORD_REGEX_CACHE = new Map<string, RegExp>();

function getKeywordRegex(keywords: readonly string[]): RegExp {
  const key = keywords.join('\u0000');
  let cached = KEYWORD_REGEX_CACHE.get(key);
  if (!cached) {
    const alternation = keywords.map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    cached = new RegExp(`(?:^|[^a-z0-9])(?:${alternation})(?:[^a-z0-9]|$)`, 'i');
    KEYWORD_REGEX_CACHE.set(key, cached);
  }
  return cached;
}

/**
 * 交互推断器
 */
export class InteractionInferrer {
  /** 推断出的交互 */
  private _interactions: InferredInteraction[] = [];
  /** 需要的 React hooks */
  private _requiredReactImports = new Set<string>();
  /** State 声明 */
  private _stateDeclarations: string[] = [];
  /** Handler 骨架 */
  private _handlerSkeletons: string[] = [];
  /** 弹窗/Sheet 节点索引（节点名 → 节点 ID） */
  private _overlayNodes = new Map<string, string>();

  /**
   * 分析节点树并推断交互
   */
  infer(root: ProcessedNode): InteractionInferrerResult {
    this._interactions = [];
    this._requiredReactImports.clear();
    this._stateDeclarations = [];
    this._handlerSkeletons = [];
    this._overlayNodes.clear();

    // 第一遍：收集弹窗/Sheet 等覆盖层节点
    this._collectOverlayNodes(root);

    // 第二遍：推断交互
    this._traverseAndInfer(root, null);

    return {
      node: root,
      interactions: this._interactions,
      interactionsCount: this._interactions.length,
      requiredReactImports: Array.from(this._requiredReactImports),
      stateDeclarations: this._stateDeclarations,
      handlerSkeletons: this._handlerSkeletons,
    };
  }

  /**
   * 检查名称是否包含关键词（作为独立词部分，避免子串误匹配）。
   * P3-12：整组关键词共用一个记忆化正则（getKeywordRegex），避免逐词编译。
   */
  private _nameContains(name: string, keywords: readonly string[]): boolean {
    return getKeywordRegex(keywords).test(name);
  }

  /**
   * 第一遍遍历：收集覆盖层节点
   */
  private _collectOverlayNodes(node: ProcessedNode): void {
    const name = (node.name || '').toLowerCase();

    if (this._nameContains(name, ['dialog', 'modal', '弹窗', '对话框'])) {
      this._overlayNodes.set('dialog', node.id);
    }
    if (this._nameContains(name, ['sheet', 'drawer', '抽屉'])) {
      this._overlayNodes.set('sheet', node.id);
    }
    if (this._nameContains(name, ['popover', '气泡'])) {
      this._overlayNodes.set('popover', node.id);
    }

    if (node.children) {
      for (const child of node.children) {
        this._collectOverlayNodes(child);
      }
    }
  }

  /**
   * 递归遍历节点推断交互
   */
  private _traverseAndInfer(node: ProcessedNode, parentFormId: string | null): void {
    const name = (node.name || '').toLowerCase();
    const role = node.role;
    const hasChildren = node.children && node.children.length > 0;

    // ============ 1. 检测表单（必须是有子节点的容器，避免误判普通文本） ============
    if (
      hasChildren &&
      this._nameContains(name, [
        'form',
        '表单',
        'login form',
        'signin form',
        'signup form',
        'register form',
        'search form',
        'search bar',
        '搜索框',
        '搜索栏',
        '登录',
        '注册',
      ])
    ) {
      parentFormId = node.id;
      this._inferFormSubmit(node);
    }

    // ============ 2. 按钮点击 ============
    if (role === 'button' || this._nameContains(name, ['button', 'btn', '按钮'])) {
      this._inferButtonClick(node, parentFormId);
    }

    // ============ 3. 输入框（role 是 input 或名称明确） ============
    if (
      role === 'input' ||
      this._nameContains(name, ['input', '输入框', 'textfield', 'text field', '搜索栏', 'search bar'])
    ) {
      this._inferInputChange(node, parentFormId);
    }

    // ============ 4. 复选框/开关 ============
    if (this._nameContains(name, ['checkbox', '复选框'])) {
      this._inferCheckboxChange(node);
    }
    if (this._nameContains(name, ['switch', 'toggle', '开关'])) {
      this._inferSwitchToggle(node);
    }

    // ============ 5. 下拉选择 ============
    if (this._nameContains(name, ['select', 'dropdown', 'picker', '下拉', '选择器'])) {
      this._inferSelectChange(node);
    }

    // ============ 6. Tabs（必须是容器） ============
    if (hasChildren && this._nameContains(name, ['tabs', 'tab bar', '标签页', '选项卡'])) {
      this._inferTabsSwitch(node);
    }

    // ============ 6b. v1.4.19 T22：轮播（Swiper/Carousel/Slider，必须是容器） ============
    if (
      hasChildren &&
      this._nameContains(name, ['carousel', 'swiper', 'slider', 'slideshow', '轮播', '走马灯', '幻灯片'])
    ) {
      this._inferCarouselSwipe(node);
    }

    // ============ 6c. v1.4.19 T22：手风琴/折叠面板（必须是容器；排除 item/header/content 子部件） ============
    if (
      hasChildren &&
      !this._nameContains(name, ['item', 'header', 'content', 'body', 'trigger', '条目', '子项'])
      && this._nameContains(name, ['accordion', 'collapse', 'collapsible', 'faq', '手风琴', '折叠面板'])
    ) {
      this._inferAccordionToggle(node);
    }

    // ============ 7. 链接导航 ============
    if (role === 'link' || this._nameContains(name, ['link', '链接'])) {
      this._inferLinkNavigation(node);
    }

    // ============ 8. 弹窗/Sheet 关闭按钮（仅明确命名的按钮，避免 x 单字符误判） ============
    if (role === 'button' && this._nameContains(name, ['close', '关闭', 'cancel', '取消'])) {
      this._inferOverlayClose(node);
    }

    // 递归子节点
    if (node.children) {
      for (const child of node.children) {
        this._traverseAndInfer(child, parentFormId);
      }
    }
  }

  /**
   * 推断表单提交
   */
  private _inferFormSubmit(node: ProcessedNode): void {
    this._requiredReactImports.add('useState');

    const formName = this._toCamelCase(node.name) || 'form';
    const stateName = `${formName}Data`;
    const handlerName = `handle${this._toPascalCase(node.name) || 'Form'}Submit`;

    // 避免重复state
    if (!this._stateDeclarations.some((s) => s.includes(`[${stateName},`))) {
      this._stateDeclarations.push(`  const [${stateName}, set${this._toPascalCase(stateName)}] = useState({});`);
    }
    // 避免重复handler
    if (!this._handlerSkeletons.some((h) => h.includes(handlerName))) {
      this._handlerSkeletons.push(
        `  const ${handlerName} = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: 实现表单提交逻辑
    console.log('${stateName}:', ${stateName});
  };`,
      );
    }

    this._interactions.push({
      nodeId: node.id,
      nodeName: node.name,
      type: 'form-submit',
      stateName,
      handlerName,
      confidence: 0.6,
      codeHint: `// TODO: 给 <form> 添加 onSubmit={${handlerName}}，为输入框添加 name 属性和 value/onChange`,
    });

    // v1.4.19 T22：表单校验占位（根据后代字段命名给出必填/格式/长度约束）
    this._inferFormValidation(node, stateName, handlerName);
  }

  /**
   * 推断表单校验占位（v1.4.19 T22）
   *
   * 扫描表单后代的输入型节点命名，仅对可识别字段（email/phone/password/required）
   * 产出校验骨架；无识别字段时不输出，避免噪声。
   *
   * @param formNode - 表单容器节点
   * @param stateName - 表单数据 state 名
   * @param handlerName - 提交 handler 名（用于串联 validate 调用）
   */
  private _inferFormValidation(formNode: ProcessedNode, stateName: string, handlerName: string): void {
    const fields: Array<{ key: string; rule: string }> = [];
    const seen = new Set<string>();

    const visit = (candidate: ProcessedNode): void => {
      const candidateName = (candidate.name || '').toLowerCase();
      const isField =
        candidate.role === 'input' ||
        this._nameContains(candidateName, ['input', 'email', 'phone', 'password', '邮箱', '手机', '密码']);
      if (isField) {
        let key = '';
        let rule = "rules: [(v) => Boolean(v) || 'required']";
        if (this._nameContains(candidateName, ['email', '邮箱'])) {
          key = 'email';
          rule = "rules: [(v) => /.+@.+\\..+/.test(v) || 'invalid email']";
        } else if (this._nameContains(candidateName, ['phone', '手机'])) {
          key = 'phone';
          rule = "rules: [(v) => /^\\d{6,}$/.test(v) || 'invalid phone']";
        } else if (this._nameContains(candidateName, ['password', '密码'])) {
          key = 'password';
          rule = "rules: [(v) => (v?.length ?? 0) >= 8 || 'min 8 chars']";
        } else {
          key = this._toCamelCase(candidate.name) || 'field';
        }
        if (!seen.has(key)) {
          seen.add(key);
          fields.push({ key, rule });
        }
      }
      for (const child of candidate.children ?? []) visit(child);
    };
    for (const child of formNode.children ?? []) visit(child);

    if (fields.length === 0) return;

    const validateName = `validate${this._toPascalCase(formNode.name) || 'Form'}`;
    const fieldsLiteral = fields.map((field) => `      ${field.key}: { ${field.rule} },`).join('\n');
    if (!this._handlerSkeletons.some((skeleton) => skeleton.includes(validateName))) {
      this._handlerSkeletons.push(
        `  const ${validateName} = (): boolean => {
    // TODO（示例）: 接入 zod / react-hook-form / vuelidate 等校验库替换此占位
    const rules: Record<string, { rules: Array<(v: string) => boolean | string> }> = {
${fieldsLiteral}
    };
    return Object.entries(rules).every(([key, field]) => field.rules.every((rule) => rule(${stateName}[key] as string) === true));
  };`,
      );
    }

    this._interactions.push({
      nodeId: formNode.id,
      nodeName: formNode.name,
      type: 'form-validation',
      handlerName: validateName,
      relatedNodeId: formNode.id,
      confidence: 0.55,
      codeHint:
        `// TODO: 在 ${handlerName} 内先调用 if (!${validateName}()) return;（字段：${fields
          .map((field) => field.key)
          .join(', ')}；示例骨架，建议替换为 zod/react-hook-form 等校验库）`,
    });
  }

  /**
   * 推断按钮点击
   */
  private _inferButtonClick(node: ProcessedNode, parentFormId: string | null): void {
    const name = (node.name || '').toLowerCase();

    // 提交按钮（在表单内且名称包含 submit/ok/confirm/确认/提交/保存）
    const isSubmit =
      parentFormId !== null &&
      this._nameContains(name, ['submit', 'ok', 'confirm', '确认', '提交', '保存', 'save', 'search', '搜索']);

    if (isSubmit) {
      // 表单提交按钮，type="submit"
      this._interactions.push({
        nodeId: node.id,
        nodeName: node.name,
        type: 'form-submit',
        confidence: 0.7,
        codeHint: '// TODO: 添加 type="submit"',
      });
      return;
    }

    // 弹窗/Sheet 打开按钮：
    // 条件：名称明确包含 dialog/modal/sheet/drawer/弹窗/抽屉 等关键词，
    // 或者名称包含 open/add/new/create 且页面中确实存在对应的覆盖层节点
    const hasDialogKeyword = this._nameContains(name, ['dialog', 'modal', '弹窗', '对话框']);
    const hasSheetKeyword = this._nameContains(name, ['sheet', 'drawer', '抽屉']);
    const hasActionKeyword = this._nameContains(name, ['open', 'add', 'new', 'create', '新增', '创建', '打开']);

    let overlayType: 'dialog' | 'sheet' | null = null;
    let relatedNodeId: string | undefined;

    if (hasDialogKeyword || (hasActionKeyword && this._overlayNodes.has('dialog'))) {
      overlayType = 'dialog';
      relatedNodeId = this._overlayNodes.get('dialog');
    } else if (hasSheetKeyword || (hasActionKeyword && this._overlayNodes.has('sheet'))) {
      overlayType = 'sheet';
      relatedNodeId = this._overlayNodes.get('sheet');
    }

    if (overlayType && relatedNodeId) {
      this._requiredReactImports.add('useState');
      const stateName = `${overlayType}Open`;

      if (!this._stateDeclarations.some((s) => s.includes(stateName))) {
        this._stateDeclarations.push(`  const [${stateName}, set${this._toPascalCase(stateName)}] = useState(false);`);
      }

      this._interactions.push({
        nodeId: node.id,
        nodeName: node.name,
        type: overlayType === 'dialog' ? 'dialog-toggle' : 'sheet-toggle',
        stateName,
        relatedNodeId,
        confidence: 0.65,
        codeHint: `// TODO: 添加 onClick={() => set${this._toPascalCase(stateName)}(true)}，并给 ${overlayType} 添加 open={${stateName}} onOpenChange={set${this._toPascalCase(stateName)}}`,
      });
      return;
    }

    // 普通按钮
    const handlerName = `handle${this._toPascalCase(node.name) || 'Action'}Click`;
    // 避免重复添加同名 handler
    if (!this._handlerSkeletons.some((h) => h.includes(handlerName))) {
      this._handlerSkeletons.push(
        `  const ${handlerName} = () => {
    // TODO: 实现按钮点击逻辑
  };`,
      );
    }

    this._interactions.push({
      nodeId: node.id,
      nodeName: node.name,
      type: 'button-click',
      handlerName,
      confidence: 0.5,
      codeHint: `// TODO: 添加 onClick={${handlerName}}`,
    });
  }

  /**
   * 推断输入框变化
   */
  private _inferInputChange(node: ProcessedNode, parentFormId: string | null): void {
    const fieldName = this._toCamelCase(node.name) || 'inputValue';

    if (parentFormId) {
      // 在表单内，受控组件
      this._interactions.push({
        nodeId: node.id,
        nodeName: node.name,
        type: 'input-change',
        stateName: fieldName,
        confidence: 0.55,
        codeHint: `// TODO: 添加 name="${fieldName}" value={formData.${fieldName}} onChange={handleInputChange}`,
      });
    } else {
      // 独立输入框，避免重复state
      this._requiredReactImports.add('useState');
      const stateDecl = `  const [${fieldName}, set${this._toPascalCase(fieldName)}] = useState('');`;
      if (!this._stateDeclarations.some((s) => s.includes(`[${fieldName},`))) {
        this._stateDeclarations.push(stateDecl);
      }

      this._interactions.push({
        nodeId: node.id,
        nodeName: node.name,
        type: 'input-change',
        stateName: fieldName,
        confidence: 0.55,
        codeHint: `// TODO: 添加 value={${fieldName}} onChange={(e) => set${this._toPascalCase(fieldName)}(e.target.value)}`,
      });
    }
  }

  /**
   * 推断复选框变化
   */
  private _inferCheckboxChange(node: ProcessedNode): void {
    this._requiredReactImports.add('useState');
    const stateName = this._toCamelCase(node.name) || 'checked';
    const stateDecl = `  const [${stateName}, set${this._toPascalCase(stateName)}] = useState(false);`;
    if (!this._stateDeclarations.some((s) => s.includes(`[${stateName},`))) {
      this._stateDeclarations.push(stateDecl);
    }

    this._interactions.push({
      nodeId: node.id,
      nodeName: node.name,
      type: 'checkbox-change',
      stateName,
      confidence: 0.6,
      codeHint: `// TODO: 添加 checked={${stateName}} onCheckedChange={set${this._toPascalCase(stateName)}}`,
    });
  }

  /**
   * 推断开关切换
   */
  private _inferSwitchToggle(node: ProcessedNode): void {
    this._requiredReactImports.add('useState');
    const stateName = this._toCamelCase(node.name) || 'enabled';
    const stateDecl = `  const [${stateName}, set${this._toPascalCase(stateName)}] = useState(false);`;
    if (!this._stateDeclarations.some((s) => s.includes(`[${stateName},`))) {
      this._stateDeclarations.push(stateDecl);
    }

    this._interactions.push({
      nodeId: node.id,
      nodeName: node.name,
      type: 'switch-toggle',
      stateName,
      confidence: 0.6,
      codeHint: `// TODO: 添加 checked={${stateName}} onCheckedChange={set${this._toPascalCase(stateName)}}`,
    });
  }

  /**
   * 推断下拉选择变化
   */
  private _inferSelectChange(node: ProcessedNode): void {
    this._requiredReactImports.add('useState');
    const stateName = this._toCamelCase(node.name) || 'selectedValue';
    const stateDecl = `  const [${stateName}, set${this._toPascalCase(stateName)}] = useState('');`;
    if (!this._stateDeclarations.some((s) => s.includes(`[${stateName},`))) {
      this._stateDeclarations.push(stateDecl);
    }

    this._interactions.push({
      nodeId: node.id,
      nodeName: node.name,
      type: 'select-change',
      stateName,
      confidence: 0.6,
      codeHint: `// TODO: 添加 value={${stateName}} onValueChange={set${this._toPascalCase(stateName)}}`,
    });
  }

  /**
   * 推断 Tabs 切换（stateName 基于节点名，避免多 Tabs 冲突）
   */
  private _inferTabsSwitch(node: ProcessedNode): void {
    this._requiredReactImports.add('useState');
    // 基于节点名生成stateName，避免硬编码activeTab导致多Tabs冲突
    const nodeCamel = this._toCamelCase(node.name);
    const stateName = nodeCamel && nodeCamel !== 'tabs' ? `${nodeCamel}ActiveTab` : 'activeTab';
    const stateDecl = `  const [${stateName}, set${this._toPascalCase(stateName)}] = useState('tab1');`;
    if (!this._stateDeclarations.some((s) => s.includes(`[${stateName},`))) {
      this._stateDeclarations.push(stateDecl);
    }

    this._interactions.push({
      nodeId: node.id,
      nodeName: node.name,
      type: 'tabs-switch',
      stateName,
      confidence: 0.7,
      codeHint: `// TODO: 添加 value={${stateName}} onValueChange={set${this._toPascalCase(stateName)}} defaultValue 改为 value`,
    });
  }

  /**
   * 推断轮播切换（v1.4.19 T22）
   *
   * 产出当前索引 state 与 prev/next（或 Swiper/Embla 接入）提示；
   * 子节点含 dots/pagination/箭头命名时在 codeHint 中补充联动说明。
   *
   * @param node - 轮播容器节点
   */
  private _inferCarouselSwipe(node: ProcessedNode): void {
    this._requiredReactImports.add('useState');
    const nodeCamel = this._toCamelCase(node.name);
    const stateName = nodeCamel && nodeCamel !== 'carousel' ? `${nodeCamel}Index` : 'carouselIndex';
    const stateDecl = `  const [${stateName}, set${this._toPascalCase(stateName)}] = useState(0);`;
    if (!this._stateDeclarations.some((s) => s.includes(`[${stateName},`))) {
      this._stateDeclarations.push(stateDecl);
    }

    // 屏数：优先取 track/slides 包装层内的子项数，否则按直接子节点计
    const trackChild = (node.children ?? []).find((child) =>
      this._nameContains((child.name || '').toLowerCase(), ['track', 'slides', 'viewport', '轨道']),
    );
    const slideCount = (trackChild?.children ?? node.children ?? []).filter(
      (child) => child.visible !== false,
    ).length;
    const hasDots = (node.children ?? []).some((child) =>
      this._nameContains((child.name || '').toLowerCase(), ['dots', 'pagination', 'indicator', '指示点', '分页器']),
    );
    const hasArrows = (node.children ?? []).some((child) =>
      this._nameContains((child.name || '').toLowerCase(), ['arrow', 'prev', 'next', 'chevron', '上一', '下一']),
    );
    const extras = [
      hasArrows ? '上一张/下一张按钮绑定 setIndex((i) => Math.max/Min(...))' : '',
      hasDots ? '指示点（dots）以 index === current 高亮并可点击跳转' : '',
    ]
      .filter(Boolean)
      .join('；');

    this._interactions.push({
      nodeId: node.id,
      nodeName: node.name,
      type: 'carousel-swipe',
      stateName,
      confidence: 0.65,
      codeHint:
        `// TODO: 用 ${stateName} 驱动轨道位移（共 ${slideCount} 屏，示例：` +
        `style={{ transform: 'translateX(-' + ${stateName} * 100 + '%)' }}）；` +
        `复杂手势/循环建议接入 Swiper/Embla${extras ? `；${extras}` : ''}`,
    });
  }

  /**
   * 推断手风琴展开状态（v1.4.19 T22）
   *
   * @param node - 手风琴容器节点
   */
  private _inferAccordionToggle(node: ProcessedNode): void {
    this._requiredReactImports.add('useState');
    const nodeCamel = this._toCamelCase(node.name);
    const stateName = nodeCamel && !['accordion', 'collapse', 'faq'].includes(nodeCamel) ? `${nodeCamel}OpenItems` : 'openItems';
    const stateDecl = `  const [${stateName}, set${this._toPascalCase(stateName)}] = useState<string[]>([]);`;
    if (!this._stateDeclarations.some((s) => s.includes(`[${stateName},`))) {
      this._stateDeclarations.push(stateDecl);
    }

    const itemCount = (node.children ?? []).filter((child) => child.visible !== false).length;
    this._interactions.push({
      nodeId: node.id,
      nodeName: node.name,
      type: 'accordion-toggle',
      stateName,
      confidence: 0.65,
      codeHint:
        `// TODO: 每项 header 可点击切换 ${stateName}（${itemCount} 项；单开模式在切换时替换数组，多开用 includes/filter 增删），` +
        "内容区以条件渲染展开并补 aria-expanded/aria-controls，箭头随状态 rotate-180",
    });
  }

  /**
   * 推断链接导航
   */
  private _inferLinkNavigation(node: ProcessedNode): void {
    this._interactions.push({
      nodeId: node.id,
      nodeName: node.name,
      type: 'link-navigation',
      confidence: 0.5,
      codeHint: '// TODO: 添加 href="/target-path"，使用项目路由方案（React Router/TanStack Router 等）',
    });
  }

  /**
   * 推断覆盖层关闭
   */
  private _inferOverlayClose(node: ProcessedNode): void {
    const dialogOpen = this._overlayNodes.has('dialog');
    const sheetOpen = this._overlayNodes.has('sheet');

    if (dialogOpen) {
      this._interactions.push({
        nodeId: node.id,
        nodeName: node.name,
        type: 'dialog-toggle',
        relatedNodeId: this._overlayNodes.get('dialog'),
        confidence: 0.5,
        codeHint: '// TODO: 关闭按钮通常由 Dialog 组件自动提供；若自定义，添加 onClick={() => setDialogOpen(false)}',
      });
    } else if (sheetOpen) {
      this._interactions.push({
        nodeId: node.id,
        nodeName: node.name,
        type: 'sheet-toggle',
        relatedNodeId: this._overlayNodes.get('sheet'),
        confidence: 0.5,
        codeHint: '// TODO: 关闭按钮通常由 Sheet 组件自动提供；若自定义，添加 onClick={() => setSheetOpen(false)}',
      });
    }
  }

  // ============ 工具方法 ============

  /**
   * 转为 camelCase
   */
  private _toCamelCase(str: string): string {
    return str
      .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map((word, i) => {
        if (i === 0) return word.toLowerCase();
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join('')
      .replace(/[\u4e00-\u9fa5]/g, ''); // 移除中文字符用于变量名
  }

  /**
   * 转为 PascalCase
   */
  private _toPascalCase(str: string): string {
    const camel = this._toCamelCase(str);
    return camel ? camel.charAt(0).toUpperCase() + camel.slice(1) : '';
  }
}

// ============ 工厂函数 ============

/**
 * 创建交互推断器实例
 */
export function createInteractionInferrer(): InteractionInferrer {
  return new InteractionInferrer();
}
