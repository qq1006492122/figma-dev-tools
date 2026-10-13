/**
 * 组件库映射标注 fixture 集（WBS-P2-11）
 *
 * 62 个手工标注节点（42 正例覆盖 7 组件 + 20 负例），作为保守模式
 * 「识别率 ≥70% / Props 节点通过率 ≥60% / 误替换 = 0」的冻结回归基准。
 * 负例刻意覆盖高混淆形态（图标按钮、搜索外层容器、Tab 内容面板、圆形 logo、
 * 通知红点等），任何阈值/规则调整都必须重跑本集合并保持误替换为 0。
 */
import type { ProcessedNode } from '../../../src/types/nodes.js';
import type { LabeledNode } from '../../../src/services/component-library/evaluate.js';
import type { MappableComponent } from '../../../src/services/component-library/index.js';

type AnyNode = Partial<ProcessedNode> & { id: string; name: string };

function hex(hex6: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex6)!;
  return { r: parseInt(m[1], 16) / 255, g: parseInt(m[2], 16) / 255, b: parseInt(m[3], 16) / 255 };
}

function fill(hex6: string, opacity = 1) {
  return [{ type: 'solid' as const, color: hex(hex6), opacity }];
}
function imageFill() {
  return [{ type: 'image' as const, imageRef: 'img-ref' }];
}
function stroke(hex6 = '#d1d5db') {
  return [{ color: hex(hex6), weight: 1, align: 'INSIDE' as const }];
}
function rad(r: number) {
  return { topLeft: r, topRight: r, bottomRight: r, bottomLeft: r };
}
const shadow = [{ type: 'drop-shadow' as const }];
function n(p: AnyNode): ProcessedNode {
  return {
    originalType: 'FRAME',
    role: 'container',
    visible: true,
    clipsContent: false,
    figmaId: p.id,
    ...p,
  } as ProcessedNode;
}

/** 对话框覆盖层：宽 ≥400 + 遮罩（半透明）+ 圆角面板两个子节点 */
function dialogOverlay(id: string, name: string): ProcessedNode {
  return n({
    id,
    name,
    size: { width: 1440, height: 900 },
    children: [
      n({ id: `${id}-mask`, name: 'Mask', size: { width: 1440, height: 900 }, fills: fill('#000000', 0.45) }),
      n({
        id: `${id}-panel`,
        name: 'Modal Panel',
        size: { width: 480, height: 320 },
        cornerRadius: rad(12),
        fills: fill('#ffffff'),
      }),
    ],
  });
}

/** tabs：横向等宽文本子项，activeIndex 指定激活（实色填充）项下标 */
function tabsNode(id: string, name: string, labels: string[], activeIndex: number): ProcessedNode {
  return n({
    id,
    name,
    role: 'list',
    layout: { mode: 'horizontal' } as never,
    children: labels.map((label, i) =>
      n({
        id: `${id}-${i}`,
        name: `tab-${i}`,
        textContent: label,
        size: { width: 88, height: 34 },
        ...(i === activeIndex ? { fills: fill('#1677ff') } : {}),
      }),
    ),
  });
}

function L(id: string, node: ProcessedNode, expected: MappableComponent | null, expectedProps?: Record<string, string>): LabeledNode {
  return { id, node, expected, expectedProps };
}

export const LABELED_NODES: readonly LabeledNode[] = [
  // ============ Button 正例 8 ============
  L('btn-1', n({ id: 'btn-1', name: 'Primary Button', role: 'button', size: { width: 96, height: 40 }, textContent: 'Submit', fills: fill('#1677ff') }), 'button', { variant: 'primary' }),
  L('btn-2', n({ id: 'btn-2', name: '提交按钮', role: 'button', size: { width: 88, height: 40 }, textContent: '提交', fills: fill('#07c160') }), 'button', { variant: 'primary' }),
  L('btn-3', n({ id: 'btn-3', name: 'Cancel Button', role: 'button', size: { width: 88, height: 40 }, textContent: 'Cancel', strokes: stroke() }), 'button', { variant: 'outline' }),
  L('btn-4', n({ id: 'btn-4', name: 'Text Button', role: 'button', size: { width: 72, height: 36 }, textContent: 'More' }), 'button', { variant: 'ghost' }),
  L('btn-5', n({ id: 'btn-5', name: 'Delete Button', role: 'button', size: { width: 96, height: 40 }, textContent: 'Delete', fills: fill('#e04536') }), 'button', { variant: 'danger' }),
  L('btn-6', n({ id: 'btn-6', name: 'Small btn', role: 'button', size: { width: 56, height: 26 }, textContent: 'Edit', fills: fill('#1677ff') }), 'button', { variant: 'primary', size: 'small' }),
  L('btn-7', n({ id: 'btn-7', name: 'Large Button', role: 'button', size: { width: 140, height: 48 }, textContent: 'Get Started', fills: fill('#1677ff') }), 'button', { variant: 'primary', size: 'large' }),
  L('btn-8', n({ id: 'btn-8', name: '确认按钮', role: 'button', size: { width: 88, height: 40 }, textContent: '确认', fills: fill('#1677ff') }), 'button', { variant: 'primary' }),

  // ============ Card 正例 6 ============
  L('card-1', n({ id: 'card-1', name: 'Product Card', role: 'card', size: { width: 320, height: 220 }, cornerRadius: rad(16), effects: shadow, children: [n({ id: 'card-1a', name: 'image' }), n({ id: 'card-1b', name: 'body' })] }), 'card'),
  L('card-2', n({ id: 'card-2', name: 'User Card', role: 'card', size: { width: 280, height: 120 }, cornerRadius: rad(12), effects: shadow, children: [n({ id: 'card-2a', name: 'avatar' }), n({ id: 'card-2b', name: 'info' })] }), 'card'),
  L('card-3', n({ id: 'card-3', name: 'Card - Settings', role: 'card', size: { width: 420, height: 260 }, cornerRadius: rad(8), children: [n({ id: 'card-3a', name: 'list' }), n({ id: 'card-3b', name: 'list2' }), n({ id: 'card-3c', name: 'list3' })] }), 'card'),
  L('card-4', n({ id: 'card-4', name: '卡片-订单详情', role: 'card', size: { width: 360, height: 300 }, cornerRadius: rad(12), effects: shadow, children: [n({ id: 'card-4a', name: 'head' }), n({ id: 'card-4b', name: 'rows' })] }), 'card'),
  L('card-5', n({ id: 'card-5', name: 'Stats Panel', role: 'card', size: { width: 240, height: 140 }, cornerRadius: rad(10), effects: shadow, children: [n({ id: 'card-5a', name: 'num' }), n({ id: 'card-5b', name: 'label' })] }), 'card'),
  L('card-6', n({ id: 'card-6', name: 'Category Tile', role: 'card', size: { width: 180, height: 180 }, cornerRadius: rad(12), children: [n({ id: 'card-6a', name: 'icon' }), n({ id: 'card-6b', name: 'caption' })] }), 'card'),

  // ============ Input 正例 6 ============
  L('input-1', n({ id: 'input-1', name: 'Search Input', role: 'input', size: { width: 260, height: 40 }, cornerRadius: rad(8), strokes: stroke() }), 'input', { type: 'search' }),
  L('input-2', n({ id: 'input-2', name: 'Password Input', role: 'input', size: { width: 260, height: 40 }, cornerRadius: rad(6), strokes: stroke() }), 'input', { type: 'password' }),
  L('input-3', n({ id: 'input-3', name: 'Email Input', role: 'input', size: { width: 260, height: 40 }, cornerRadius: rad(6), strokes: stroke() }), 'input', { type: 'email' }),
  L('input-4', n({ id: 'input-4', name: '搜索框', role: 'input', size: { width: 240, height: 36 }, textContent: '搜索商品', cornerRadius: rad(18) }), 'input', { type: 'search' }),
  L('input-5', n({ id: 'input-5', name: '文本框-备注', role: 'input', size: { width: 320, height: 80 }, cornerRadius: rad(8), strokes: stroke() }), 'input'),
  L('input-6', n({ id: 'input-6', name: 'User Name Text Field', role: 'input', size: { width: 240, height: 40 }, cornerRadius: rad(6), strokes: stroke() }), 'input'),

  // ============ Dialog 正例 5 ============
  L('dialog-1', dialogOverlay('dialog-1', 'Confirmation Modal'), 'dialog'),
  L('dialog-2', dialogOverlay('dialog-2', 'Settings Dialog'), 'dialog'),
  L('dialog-3', dialogOverlay('dialog-3', '弹窗-支付确认'), 'dialog'),
  L('dialog-4', dialogOverlay('dialog-4', 'Delete 对话框'), 'dialog'),
  L('dialog-5', dialogOverlay('dialog-5', 'Navigation Drawer'), 'dialog'),

  // ============ Tabs 正例 5 ============
  L('tabs-1', tabsNode('tabs-1', 'Tabs', ['Overview', 'Detail'], 0), 'tabs', { defaultValue: '0' }),
  L('tabs-2', tabsNode('tabs-2', 'Tab Navigation', ['Home', 'Products', 'About'], 1), 'tabs', { defaultValue: '1' }),
  L('tabs-3', tabsNode('tabs-3', '标签页-订单', ['全部', '待付款', '已完成'], 2), 'tabs', { defaultValue: '2' }),
  L('tabs-4', tabsNode('tabs-4', '选项卡', ['基本信息', '高级设置'], 0), 'tabs'),
  L('tabs-5', tabsNode('tabs-5', 'TabBar', ['首页', '分类', '购物车', '我的'], 0), 'tabs'),

  // ============ Avatar 正例 6 ============
  L('avatar-1', n({ id: 'avatar-1', name: 'User Avatar', role: 'avatar', size: { width: 40, height: 40 }, cornerRadius: rad(20), fills: imageFill() }), 'avatar', { shape: 'circle' }),
  L('avatar-2', n({ id: 'avatar-2', name: 'Avatar Small', role: 'avatar', size: { width: 28, height: 28 }, cornerRadius: rad(14), fills: fill('#9ca3af') }), 'avatar', { shape: 'circle', size: 'small' }),
  L('avatar-3', n({ id: 'avatar-3', name: 'Avatar Large', role: 'avatar', size: { width: 64, height: 64 }, cornerRadius: rad(32), fills: imageFill() }), 'avatar', { shape: 'circle', size: 'large' }),
  L('avatar-4', n({ id: 'avatar-4', name: '头像-客服', role: 'avatar', size: { width: 44, height: 44 }, cornerRadius: rad(22), fills: fill('#6366f1') }), 'avatar', { shape: 'circle' }),
  L('avatar-5', n({ id: 'avatar-5', name: 'Profile Image', role: 'image', size: { width: 48, height: 48 }, cornerRadius: rad(8), fills: imageFill() }), 'avatar'),
  L('avatar-6', n({ id: 'avatar-6', name: 'Avatar', role: 'avatar', size: { width: 36, height: 36 }, cornerRadius: rad(18), fills: imageFill() }), 'avatar', { shape: 'circle' }),

  // ============ Badge 正例 6 ============
  L('badge-1', n({ id: 'badge-1', name: 'New Badge', role: 'badge', size: { width: 56, height: 24 }, textContent: 'NEW', cornerRadius: rad(12), fills: fill('#e04536') }), 'badge', { color: 'danger' }),
  L('badge-2', n({ id: 'badge-2', name: 'Official 徽章', role: 'badge', size: { width: 64, height: 24 }, textContent: '官方', cornerRadius: rad(12), fills: fill('#1677ff') }), 'badge', { color: 'brand' }),
  L('badge-3', n({ id: 'badge-3', name: 'Tag-推荐', role: 'badge', size: { width: 52, height: 26 }, textContent: '推荐', cornerRadius: rad(6), strokes: stroke('#1677ff') }), 'badge', { variant: 'soft' }),
  L('badge-4', n({ id: 'badge-4', name: 'VIP Badge', role: 'badge', size: { width: 48, height: 24 }, textContent: 'VIP', cornerRadius: rad(12), fills: fill('#f59e0b') }), 'badge'),
  L('badge-5', n({ id: 'badge-5', name: '标签-限时', role: 'badge', size: { width: 60, height: 22 }, textContent: '限时', cornerRadius: rad(11), fills: fill('#dc2626') }), 'badge', { color: 'danger' }),
  L('badge-6', n({ id: 'badge-6', name: 'Filter Chip', role: 'badge', size: { width: 72, height: 28 }, textContent: '价格', cornerRadius: rad(14), fills: fill('#e5e7eb') }), 'badge', { variant: 'soft' }),

  // ============ 负例 20（保守模式误替换必须为 0） ============
  L('neg-1', n({ id: 'neg-1', name: 'Hero Title', role: 'text', size: { width: 400, height: 56 }, textContent: 'Welcome back' }), null),
  L('neg-2', n({ id: 'neg-2', name: 'Wrapper Group', role: 'container', size: { width: 600, height: 400 }, children: [n({ id: 'neg-2a', name: 'a' })] }), null),
  L('neg-3', n({ id: 'neg-3', name: 'icon-star', role: 'icon', size: { width: 20, height: 20 } }), null),
  L('neg-4', n({ id: 'neg-4', name: 'Divider Line', role: 'divider', size: { width: 320, height: 1 } }), null),
  L('neg-5', n({ id: 'neg-5', name: 'Notification Dot', size: { width: 8, height: 8 }, cornerRadius: rad(4), fills: fill('#e04536') }), null),
  L('neg-6', n({ id: 'neg-6', name: 'Logo', role: 'image', size: { width: 40, height: 40 }, cornerRadius: rad(20), fills: imageFill() }), null),
  L('neg-7', n({ id: 'neg-7', name: 'Learn more', role: 'link', size: { width: 90, height: 20 }, textContent: 'Learn more' }), null),
  L('neg-8', n({ id: 'neg-8', name: 'Navigation', role: 'list', children: [n({ id: 'neg-8a', name: 'nav1' })] }), null),
  L('neg-9', n({ id: 'neg-9', name: 'Page Section', role: 'section', size: { width: 800, height: 600 } }), null),
  L('neg-10', n({ id: 'neg-10', name: 'Icon Button', size: { width: 32, height: 32 }, cornerRadius: rad(8) }), null),
  L('neg-11', n({ id: 'neg-11', name: 'Toggle Switch', size: { width: 44, height: 24 }, cornerRadius: rad(12), fills: fill('#1677ff') }), null),
  L('neg-12', n({ id: 'neg-12', name: 'Checkbox', size: { width: 16, height: 16 }, cornerRadius: rad(4), strokes: stroke() }), null),
  L('neg-13', n({ id: 'neg-13', name: 'Unread Red Dot', role: 'container', size: { width: 10, height: 10 }, cornerRadius: rad(5), fills: fill('#ef4444') }), null),
  L('neg-14', n({ id: 'neg-14', name: 'Table Row', size: { width: 720, height: 48 }, children: [n({ id: 'neg-14a', name: 'cell1' }), n({ id: 'neg-14b', name: 'cell2' })] }), null),
  L('neg-15', n({ id: 'neg-15', name: 'Breadcrumb', size: { width: 240, height: 20 }, children: [n({ id: 'neg-15a', name: 'crumb' })] }), null),
  L('neg-16', n({ id: 'neg-16', name: 'Search Box Wrapper', size: { width: 320, height: 72 }, cornerRadius: rad(10), strokes: stroke(), children: [n({ id: 'neg-16a', name: 'field' })] }), null),
  L('neg-17', n({ id: 'neg-17', name: 'Banner Image', role: 'image', size: { width: 1200, height: 320 }, fills: imageFill() }), null),
  L('neg-18', n({ id: 'neg-18', name: 'Panel Content', size: { width: 480, height: 280 }, children: [n({ id: 'neg-18a', name: 'paragraph' })] }), null),
  L('neg-19', n({ id: 'neg-19', name: 'OK', role: 'button', size: { width: 64, height: 36 }, textContent: 'OK', fills: fill('#1677ff') }), null),
  L('neg-20', n({ id: 'neg-20', name: 'Search Icon', role: 'icon', size: { width: 16, height: 16 } }), null),
];
