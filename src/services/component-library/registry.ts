/**
 * 组件库注册表（WBS-P2-11）
 *
 * 4 个库 × 7 个组件（Button/Card/Input/Dialog/Tabs/Avatar/Badge）的形态登记：
 * - React：shadcn-ui（组合式 named import）、ant-design（单组件 named import）；
 * - Vue：element-plus（El 前缀，模板 el-*）、ant-design-vue（a-* kebab）。
 * 评分与 Prop 推导规则与具体库解耦（{@link COMPONENT_RULES}），
 * 库差异仅体现在 import/tag/subImports 与 Prop 值口径（{@link normalizePropValue}）。
 *
 * @module services/component-library/registry
 */

import type {
  ComponentLibraryDefinition,
  ComponentLibraryId,
  ComponentRule,
  MappableComponent,
  MappedProp,
  NodeMatchView,
} from './types.js';

// ============ 阈值（冻结，变更需同步 fixture 评测） ============

/** 保守模式替换门控分（满分 100：role 40 + 名称 35 + 结构 25） */
export const CONSERVATIVE_MATCH_THRESHOLD = 70;

// ============ 通用工具 ============

/** 短文本判定（按钮/标签文案） */
function isShortText(node: NodeMatchView, maxLen = 12): boolean {
  return !!node.text && node.text.trim().length > 0 && node.text.trim().length <= maxLen;
}

/** 危险/否定语义色（红/橙红） */
function isDangerHex(hex?: string): boolean {
  if (!hex) return false;
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(hex.toLowerCase());
  if (!m) return false;
  const r = parseInt(m[1] ?? '0', 16);
  const g = parseInt(m[2] ?? '0', 16);
  const b = parseInt(m[3] ?? '0', 16);
  return r > 180 && g < 110 && b < 110;
}

/** 近圆形：四角半径都接近最小边的一半 */
function isCircular(node: NodeMatchView): boolean {
  const w = node.width ?? 0;
  const h = node.height ?? 0;
  const r = node.minCornerRadius ?? 0;
  if (!w || !h) return false;
  return r >= Math.min(w, h) / 2 - 2;
}

/** 按钮尺寸档 */
function buttonSizeProp(node: NodeMatchView, component: MappableComponent): MappedProp | null {
  const h = node.height;
  if (!h) return null;
  let value: string;
  if (component === 'button' && h <= 28) value = 'small';
  else if (component === 'button' && h >= 44) value = 'large';
  else return null;
  return { name: 'size', value, reason: `button height ${h}px` };
}

// ============ 7 个组件的评分 + Prop 规则（库无关） ============

const COMPONENTS_IN_ORDER: readonly MappableComponent[] = [
  'button',
  'card',
  'input',
  'dialog',
  'tabs',
  'avatar',
  'badge',
];

/**
 * 按钮 variant Prop 推导（结构信号：填充/描边/危险色）。
 * 不同库的值口径由 {@link normalizePropValue} 二次映射。
 */
function buttonVariantProp(node: NodeMatchView): MappedProp {
  const canonical = isDangerHex(node.solidFillHex)
    ? 'danger'
    : node.hasSolidFill
      ? 'primary'
      : node.strokeOnly
        ? 'outline'
        : 'ghost';
  return {
    name: 'variant',
    value: canonical,
    reason: node.hasSolidFill
      ? `solid fill ${node.solidFillHex ?? ''}`.trim()
      : node.strokeOnly
        ? 'stroke-only button'
        : 'text/ghost button (no fill, no stroke)',
  };
}

export const COMPONENT_RULES: Readonly<Record<MappableComponent, ComponentRule>> = {
  button: {
    component: 'button',
    nameKeywords: ['button', 'btn', '按钮', '提交', '确定', '取消', '确认', '搜索', '登录', '注册'],
    roles: ['button'],
    // R1 QA：设计系统规范按钮（Figma COMPONENT/INSTANCE）精简后 role=reusable-component，
    // 凭组件类型元数据 + 名称关键词即可获得角色分；形态护栏排除按钮组/画板等容器
    reusableComponentRole: true,
    reusableGuard: (node) => {
      const h = node.height ?? 0;
      const w = node.width ?? 0;
      return h >= 24 && h <= 64 && w >= 24 && w <= 320 && (node.childCount ?? 0) <= 4;
    },
    structuralScore: (node) => {
      const reasons: string[] = [];
      let score = 0;
      const h = node.height ?? 0;
      if (isShortText(node)) {
        score += 12;
        reasons.push('contains short action text');
      }
      if (h >= 24 && h <= 64) {
        score += 7;
        reasons.push(`control-height ${h}px`);
      }
      if (node.hasSolidFill || node.strokeOnly) {
        score += 6;
        reasons.push(node.hasSolidFill ? 'solid fill' : 'outlined');
      }
      return { score, reasons };
    },
    deriveProps: (node) => {
      const props: MappedProp[] = [buttonVariantProp(node)];
      const size = buttonSizeProp(node, 'button');
      if (size) props.push(size);
      return props;
    },
  },

  card: {
    component: 'card',
    nameKeywords: ['card', '卡片', '面板', 'panel', 'tile'],
    roles: ['card'],
    structuralScore: (node) => {
      const reasons: string[] = [];
      let score = 0;
      if ((node.minCornerRadius ?? 0) >= 4) {
        score += 8;
        reasons.push(`rounded ${node.minCornerRadius}px`);
      }
      if (node.hasShadow) {
        score += 9;
        reasons.push('elevated shadow');
      }
      if ((node.childCount ?? 0) >= 2) {
        score += 8;
        reasons.push(`container with ${node.childCount} children`);
      }
      return { score, reasons };
    },
    deriveProps: () => [],
  },

  input: {
    component: 'input',
    nameKeywords: ['input', '输入', '搜索框', '文本框', 'search box', 'text field', 'textfield', '邮箱', '密码'],
    roles: ['input'],
    structuralScore: (node) => {
      const reasons: string[] = [];
      let score = 0;
      const h = node.height ?? 0;
      if (h >= 28 && h <= 64) {
        score += 15;
        reasons.push(`field-height ${h}px`);
      }
      if (node.strokeOnly || (node.minCornerRadius ?? 0) >= 4) {
        score += 10;
        reasons.push('outlined/rounded field');
      }
      return { score, reasons };
    },
    deriveProps: (node) => {
      const name = node.name.toLowerCase();
      if (name.includes('密码') || name.includes('password')) {
        return [{ name: 'type', value: 'password', reason: 'node name indicates password' }];
      }
      if (name.includes('邮箱') || name.includes('email')) {
        return [{ name: 'type', value: 'email', reason: 'node name indicates email' }];
      }
      if (name.includes('搜索') || name.includes('search')) {
        return [
          { name: 'type', value: 'search', reason: 'node name indicates search' },
          ...(node.text ? [{ name: 'placeholder', value: node.text.trim(), reason: 'gray hint text' }] : []),
        ];
      }
      return node.text
        ? [{ name: 'placeholder', value: node.text.trim(), reason: 'gray hint text in field' }]
        : [];
    },
  },

  dialog: {
    component: 'dialog',
    // 对话框必须有强名称信号（role 层没有 dialog，避免把普通容器误判）
    nameKeywords: ['dialog', 'modal', '弹窗', '对话框', '弹出层', 'drawer', '抽屉'],
    roles: [],
    // dialog 无 role 分，结构分上限 35（高于其他组件的 25）：
    // 名称(35) +「遮罩层+圆角面板」组合结构(35) = 70 才允许命中；
    // 仅名称相似的小节点（35+不足结构证据）保持原生标签。
    structuralScore: (node) => {
      const reasons: string[] = [];
      let score = 0;
      const w = node.width ?? 0;
      if (w >= 400) {
        score += 10;
        reasons.push(`overlay-width ${w}px`);
      }
      if ((node.childCount ?? 0) >= 2) {
        score += 8;
        reasons.push(`overlay composition (${node.childCount} children)`);
      }
      // 子节点中存在圆角面板（对话框面板）
      const roundedPanel = node.raw?.children?.some((c) => {
        const radii = [c.cornerRadius?.topLeft, c.cornerRadius?.topRight, c.cornerRadius?.bottomRight, c.cornerRadius?.bottomLeft]
          .filter((v): v is number => typeof v === 'number');
        return radii.length > 0 && Math.min(...radii) >= 6;
      });
      if (roundedPanel) {
        score += 12;
        reasons.push('rounded panel child');
      }
      // 遮罩层：半透明/深色填充的子节点
      const hasMask = node.raw?.children?.some((c) =>
        (c.fills ?? []).some((f) => f.type === 'solid' && (f.opacity ?? 1) < 0.8),
      );
      if (hasMask) {
        score += 5;
        reasons.push('semi-transparent mask child');
      }
      return { score, reasons };
    },
    deriveProps: () => [
      // open 属运行时状态，不臆造初始布尔值；由接入层在产物中给注释建议
    ],
  },

  tabs: {
    component: 'tabs',
    nameKeywords: ['tabs', 'tab ', 'tabbar', '标签页', '选项卡', '页签'],
    roles: ['list'],
    structuralScore: (node) => {
      const reasons: string[] = [];
      let score = 0;
      const n = node.equalTextChildCount ?? 0;
      if (n >= 2) {
        score += 18;
        reasons.push(`${n} equal-width text items`);
      }
      if (typeof node.activeTextChildIndex === 'number') {
        score += 7;
        reasons.push(`active item index ${node.activeTextChildIndex}`);
      }
      return { score, reasons };
    },
    deriveProps: (node) => {
      if (typeof node.activeTextChildIndex !== 'number') return [];
      return [
        {
          name: 'defaultValue',
          value: String(node.activeTextChildIndex),
          reason: `active/underlined tab index ${node.activeTextChildIndex}`,
        },
      ];
    },
  },

  avatar: {
    component: 'avatar',
    nameKeywords: ['avatar', '头像', 'user pic', 'profile image'],
    roles: ['avatar', 'image'],
    structuralScore: (node) => {
      const reasons: string[] = [];
      let score = 0;
      const w = node.width ?? 0;
      const h = node.height ?? 0;
      if (w >= 20 && w <= 120 && h >= 20 && h <= 120) {
        score += 10;
        reasons.push(`small ${w}x${h} media`);
      }
      if (isCircular(node)) {
        score += 11;
        reasons.push('circular shape');
      } else if ((node.minCornerRadius ?? 0) >= 4) {
        score += 5;
        reasons.push('rounded square avatar');
      }
      if (node.isImageFill) {
        score += 4;
        reasons.push('image fill');
      }
      return { score, reasons };
    },
    deriveProps: (node) => {
      const props: MappedProp[] = [];
      if (isCircular(node)) {
        props.push({ name: 'shape', value: 'circle', reason: 'corner radius ~ half of edge' });
      }
      const edge = Math.min(node.width ?? 0, node.height ?? 0);
      if (edge > 0 && edge <= 32) props.push({ name: 'size', value: 'small', reason: `edge ${edge}px` });
      else if (edge >= 56) props.push({ name: 'size', value: 'large', reason: `edge ${edge}px` });
      return props;
    },
  },

  badge: {
    component: 'badge',
    nameKeywords: ['badge', 'tag', '标签', '徽章', '徽标', 'chip', '计数'],
    roles: ['badge'],
    structuralScore: (node) => {
      const reasons: string[] = [];
      let score = 0;
      const w = node.width ?? 0;
      const h = node.height ?? 0;
      if (w > 0 && w <= 140 && h > 0 && h <= 48) {
        score += 11;
        reasons.push(`compact ${w}x${h} chip`);
      }
      if (isShortText(node, 8)) {
        score += 8;
        reasons.push('short label text');
      }
      if (node.hasSolidFill && (node.minCornerRadius ?? 0) >= 4) {
        score += 6;
        reasons.push('filled pill');
      }
      return { score, reasons };
    },
    deriveProps: (node) => {
      if (isDangerHex(node.solidFillHex)) {
        return [{ name: 'color', value: 'danger', reason: 'red solid fill' }];
      }
      if (node.hasSolidFill) {
        return [{ name: 'color', value: 'brand', reason: 'brand-color solid fill' }];
      }
      return [{ name: 'variant', value: 'soft', reason: 'neutral soft badge' }];
    },
  },
};

// ============ 库形态定义 ============

function shadcnComponents(): ComponentLibraryDefinition['components'] {
  return {
    button: { importName: 'Button' },
    card: {
      importName: 'Card',
      // 仅预置最小可用骨架（容器替换后这些子件必然要用）；
      // CardDescription/CardFooter 按需手工补充，避免产生未使用 import 噪声
      subImports: ['CardHeader', 'CardTitle', 'CardContent'],
      compositionAdvice: [
        'shadcn Card 是组合式：<Card><CardHeader><CardTitle/></CardHeader><CardContent/></Card>；需要描述/页脚时再补 CardDescription/CardFooter',
      ],
    },
    input: { importName: 'Input' },
    dialog: {
      importName: 'Dialog',
      // DialogContent/DialogTitle 为最小可运行骨架（Title 还是 a11y 必需）
      subImports: ['DialogContent', 'DialogTitle'],
      compositionAdvice: [
        'open/onOpenChange 为受控状态；标题放 DialogTitle（a11y 必需）；需要时再补 DialogHeader/DialogDescription/DialogFooter/DialogClose',
      ],
    },
    tabs: {
      importName: 'Tabs',
      subImports: ['TabsList', 'TabsTrigger'],
      compositionAdvice: ['每个页签一个 TabsTrigger + 对应 TabsContent（按需导入），value 为字符串'],
    },
    avatar: {
      importName: 'Avatar',
      subImports: ['AvatarImage', 'AvatarFallback'],
      compositionAdvice: ['AvatarImage 放 src，AvatarFallback 放加载/兜底首字母'],
    },
    badge: { importName: 'Badge' },
  };
}

export const COMPONENT_LIBRARIES: Readonly<Record<ComponentLibraryId, ComponentLibraryDefinition>> = {
  'shadcn-ui': {
    id: 'shadcn-ui',
    framework: 'react',
    packageName: '@/components/ui',
    importStyle: 'named',
    components: shadcnComponents(),
  },
  'ant-design': {
    id: 'ant-design',
    framework: 'react',
    packageName: 'antd',
    importStyle: 'named',
    components: {
      button: { importName: 'Button' },
      card: { importName: 'Card' },
      input: { importName: 'Input' },
      dialog: { importName: 'Modal', compositionAdvice: ['antd 用 Modal，open 受控；title 传标题'] },
      tabs: { importName: 'Tabs', compositionAdvice: ['antd Tabs.Items 或 items 属性；activeKey 受控'] },
      avatar: { importName: 'Avatar' },
      badge: { importName: 'Badge' },
    },
  },
  'element-plus': {
    id: 'element-plus',
    framework: 'vue',
    packageName: 'element-plus',
    importStyle: 'kebab',
    components: {
      button: { importName: 'ElButton', tagName: 'el-button' },
      card: { importName: 'ElCard', tagName: 'el-card' },
      input: { importName: 'ElInput', tagName: 'el-input' },
      dialog: { importName: 'ElDialog', tagName: 'el-dialog', compositionAdvice: ['v-model 控制显隐；title 传标题'] },
      tabs: {
        importName: 'ElTabs',
        tagName: 'el-tabs',
        subImports: ['ElTabPane'],
        compositionAdvice: ['el-tabs 内嵌 el-tab-pane（label/name）'],
      },
      avatar: { importName: 'ElAvatar', tagName: 'el-avatar' },
      badge: {
        importName: 'ElBadge',
        tagName: 'el-badge',
        compositionAdvice: ['el-badge 是包裹型（value/slot），纯标签场景考虑 el-tag'],
      },
    },
  },
  'ant-design-vue': {
    id: 'ant-design-vue',
    framework: 'vue',
    packageName: 'ant-design-vue',
    importStyle: 'kebab',
    components: {
      button: { importName: 'Button', tagName: 'a-button', templateName: 'AButton' },
      card: { importName: 'Card', tagName: 'a-card', templateName: 'ACard' },
      input: { importName: 'Input', tagName: 'a-input', templateName: 'AInput' },
      dialog: { importName: 'Modal', tagName: 'a-modal', templateName: 'AModal', compositionAdvice: ['open 受控；title 传标题'] },
      tabs: {
        importName: 'Tabs',
        tagName: 'a-tabs',
        templateName: 'ATabs',
        subImports: ['TabPane'],
        compositionAdvice: ['a-tabs 内嵌 a-tab-pane（tab/key）'],
      },
      avatar: { importName: 'Avatar', tagName: 'a-avatar', templateName: 'AAvatar' },
      badge: { importName: 'Badge', tagName: 'a-badge', templateName: 'ABadge' },
    },
  },
};

// ============ Prop 值口径映射（canonical → 库值） ============

/**
 * 把规则产出的 canonical prop 值映射到具体库口径。
 * 未登记的 name/value 原样返回（如 defaultValue 索引、placeholder 文本）。
 */
export function normalizePropValue(
  library: ComponentLibraryId,
  component: MappableComponent,
  name: string,
  value: string,
): string {
  if (name === 'variant' && component === 'button') {
    const map: Partial<Record<ComponentLibraryId, Record<string, string>>> = {
      // shadcn：destructive 变体
      'shadcn-ui': { primary: 'default', outline: 'outline', ghost: 'ghost', danger: 'destructive' },
      // antd / ant-design-vue：危险按钮 = type=primary + danger 布尔（见 needsDangerFlag）
      'ant-design': { primary: 'primary', outline: 'default', ghost: 'text', danger: 'primary' },
      'ant-design-vue': { primary: 'primary', outline: 'default', ghost: 'text', danger: 'primary' },
      // element-plus：type=danger 即可
      'element-plus': { primary: 'primary', outline: 'default', ghost: 'text', danger: 'danger' },
    };
    return map[library]?.[value] ?? value;
  }
  if (name === 'color' && component === 'badge') {
    if (library === 'element-plus' && value === 'brand') return 'primary';
    if (library === 'shadcn-ui') return value === 'danger' ? 'destructive' : 'default';
  }
  return value;
}

/** antd 危险按钮需要额外的 danger 布尔 prop（element 用 type=danger，shadcn 用 destructive variant） */
export function needsDangerFlag(library: ComponentLibraryId, component: MappableComponent, canonicalVariant: string): boolean {
  return (
    component === 'button' &&
    canonicalVariant === 'danger' &&
    (library === 'ant-design' || library === 'ant-design-vue')
  );
}

/** 全部规则（供 matcher 按序评估） */
export const ALL_COMPONENT_RULES: readonly ComponentRule[] = COMPONENTS_IN_ORDER.map((c) => COMPONENT_RULES[c]);
