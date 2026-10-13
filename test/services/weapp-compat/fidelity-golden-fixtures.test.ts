/**
 * 6 张黄金 fixture 的 WXSS 还原度闸门（WBS-P0-81 方案 B）
 *
 * 每张 fixture 对应 ROADMAP P0-1.8 冻结的一类典型页面：
 *  1. login        登录
 *  2. list         列表（含图片列表，wx:for 折叠）
 *  3. card-detail  卡片详情
 *  4. form         表单
 *  5. marketing    营销长页（含多阴影排除项）
 *  6. nav-frame    导航框架（scroll-view + 底部导航）
 *
 * fixture 全部为仓库内手工构造的合成节点树（无外部设计稿授权问题，
 * 授权登记口径见 docs/weapp-baseline/fidelity-review-template.md）。
 *
 * 发布闸门：每页覆盖率 ≥ 85%；排除项（图片填充/多阴影/折叠成员等）
 * 必须在报告中逐项可见但不进分母。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DesignContext, ProcessedNode } from '../../../src/types/nodes.js';
import { WeappGenerator } from '../../../src/services/weapp-generator.js';

const mockFigmaClient = {
  getFile: vi.fn(),
  getNode: vi.fn(),
  getImage: vi.fn(),
  getSvg: vi.fn(),
  getImages: vi.fn().mockResolvedValue({ images: {} }),
  downloadImage: vi.fn().mockResolvedValue(Buffer.alloc(0)),
} as any;

function ctx(root: ProcessedNode): DesignContext {
  return {
    fileKey: 'golden-fixtures',
    nodeId: root.figmaId,
    node: root,
    componentsUsed: [],
    styles: [],
    warnings: [],
    metadata: { name: root.name, lastModified: '' },
  };
}

// —— 构造工具 ——

const solid = (r: number, g: number, b: number, a = 1): ProcessedNode['fills'] => [
  { type: 'solid', color: { r, g, b, a }, opacity: 1, visible: true, blendMode: 'NORMAL' },
];

const imageFill = (): ProcessedNode['fills'] =>
  [{ type: 'image', imageRef: 'golden', scaleMode: 'FILL', visible: true }] as ProcessedNode['fills'];

function frame(
  id: string,
  name: string,
  children: ProcessedNode[],
  opts: Partial<ProcessedNode> = {},
): ProcessedNode {
  return {
    id,
    figmaId: id,
    name,
    originalType: 'FRAME',
    role: 'container',
    visible: true,
    clipsContent: false,
    size: { width: 375, height: 200 },
    children,
    ...opts,
  } as ProcessedNode;
}

function text(
  id: string,
  content: string,
  width: number,
  height: number,
  opts: Partial<ProcessedNode> = {},
): ProcessedNode {
  return frame(id, content, [], {
    originalType: 'TEXT',
    role: 'text',
    textContent: content,
    size: { width, height },
    textStyle: { fontFamily: 'sans-serif', fontWeight: 400, fontSize: 14 },
    ...opts,
  });
}

function imageNode(
  id: string,
  name: string,
  width: number,
  height: number,
  localPath: string,
  opts: Partial<ProcessedNode> = {},
): ProcessedNode {
  return frame(id, name, [], {
    originalType: 'RECTANGLE',
    role: 'image',
    size: { width, height },
    fills: imageFill(),
    asset: { localPath, cdnUrl: '', type: 'image' },
    ...opts,
  });
}

function button(id: string, label: string, width: number, opts: Partial<ProcessedNode> = {}): ProcessedNode {
  return frame(id, `${label} Button`, [
    text(`${id}-label`, label, width - 32, 22, {
      size: { width: width - 32, height: 22 },
      fills: solid(1, 1, 1),
      textStyle: { fontFamily: 'sans-serif', fontWeight: 500, fontSize: 16, textAlignHorizontal: 'CENTER' },
    }),
  ], {
    role: 'button',
    size: { width, height: 48 },
    layout: {
      mode: 'HORIZONTAL', primaryAxisAlign: 'CENTER', counterAxisAlign: 'CENTER',
      primaryAxisSizing: 'FIXED', counterAxisSizing: 'FIXED', layoutWrap: 'NO_WRAP',
      itemSpacing: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
    fills: solid(0.027, 0.757, 0.376),
    cornerRadius: 8,
    ...opts,
  });
}

function fieldInput(id: string, name: string): ProcessedNode {
  return frame(id, name, [], {
    role: 'input',
    size: { width: 311, height: 48 },
    fills: solid(1, 1, 1),
    cornerRadius: 8,
  });
}

const vLayout = (
  gap: number,
  padding = { top: 0, right: 0, bottom: 0, left: 0 },
  primary: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN' = 'MIN',
  counter: 'MIN' | 'CENTER' | 'MAX' = 'MIN',
): ProcessedNode['layout'] => ({
  mode: 'VERTICAL',
  primaryAxisAlign: primary,
  counterAxisAlign: counter,
  primaryAxisSizing: 'FIXED',
  counterAxisSizing: 'FIXED',
  layoutWrap: 'NO_WRAP',
  itemSpacing: gap,
  padding,
});
const hLayout = (
  gap: number,
  padding = { top: 0, right: 0, bottom: 0, left: 0 },
  primary: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN' = 'MIN',
  counter: 'MIN' | 'CENTER' | 'MAX' = 'CENTER',
): ProcessedNode['layout'] => ({
  mode: 'HORIZONTAL',
  primaryAxisAlign: primary,
  counterAxisAlign: counter,
  primaryAxisSizing: 'FIXED',
  counterAxisSizing: 'FIXED',
  layoutWrap: 'NO_WRAP',
  itemSpacing: gap,
  padding,
});

// —— 6 张黄金页面 ——

function loginPage(): ProcessedNode {
  return frame('login', 'Login Page', [
    imageNode('login-logo', 'Login Logo', 96, 96, '/images/login/logo.png'),
    text('login-title', '欢迎登录', 200, 34, {
      size: { width: 200, height: 34 },
      textStyle: { fontFamily: 'sans-serif', fontWeight: 700, fontSize: 24 },
    }),
    text('login-sub', '请使用账号密码登录', 180, 20, {
      size: { width: 180, height: 20 },
      fills: solid(0.4, 0.4, 0.4),
      textStyle: { fontFamily: 'sans-serif', fontWeight: 400, fontSize: 14 },
    }),
    fieldInput('login-account', 'Account Input'),
    fieldInput('login-password', 'Password Input'),
    button('login-submit', '登录', 311),
    text('login-forgot', '忘记密码？', 100, 18, {
      size: { width: 100, height: 18 },
      fills: solid(0.2, 0.45, 0.9),
      textStyle: { fontFamily: 'sans-serif', fontWeight: 400, fontSize: 13 },
    }),
  ], {
    size: { width: 375, height: 667 },
    layout: vLayout(24, { top: 64, right: 32, bottom: 32, left: 32 }, 'MIN', 'CENTER'),
    fills: solid(0.969, 0.973, 0.98),
  });
}

function messageRow(i: number): ProcessedNode {
  return frame(`msg-row-${i}`, 'Message Row', [
    imageNode(`msg-avatar-${i}`, 'Avatar', 48, 48, `/images/list/avatar-${i}.png`, { cornerRadius: 8 }),
    frame(`msg-texts-${i}`, 'Message Texts', [
      text(`msg-name-${i}`, `联系人 ${i}`, 260, 22, {
        size: { width: 260, height: 22 },
        textStyle: { fontFamily: 'sans-serif', fontWeight: 600, fontSize: 15 },
      }),
      text(`msg-preview-${i}`, '这是一条消息内容预览', 260, 20, {
        size: { width: 260, height: 20 },
        fills: solid(0.45, 0.45, 0.45),
        textStyle: { fontFamily: 'sans-serif', fontWeight: 400, fontSize: 13 },
      }),
    ], {
      size: { width: 263, height: 48 },
      layout: vLayout(6),
    }),
  ], {
    size: { width: 343, height: 72 },
    layout: hLayout(12, { top: 12, right: 12, bottom: 12, left: 12 }),
    fills: solid(1, 1, 1),
    cornerRadius: 8,
  });
}

function listPage(): ProcessedNode {
  return frame('list', 'List Page', [
    frame('list-header', 'List Header', [
      text('list-title', '消息列表', 200, 28, {
        size: { width: 200, height: 28 },
        textStyle: { fontFamily: 'sans-serif', fontWeight: 600, fontSize: 20 },
      }),
    ], {
      size: { width: 375, height: 56 },
      layout: hLayout(0, { top: 14, right: 16, bottom: 14, left: 16 }),
      fills: solid(1, 1, 1),
    }),
    frame('list-scroll', 'Message Scroll View', [
      messageRow(1),
      messageRow(2),
      messageRow(3),
      messageRow(4),
    ], {
      clipsContent: true,
      size: { width: 375, height: 664 },
      layout: vLayout(12, { top: 16, right: 16, bottom: 16, left: 16 }),
      fills: solid(0.969, 0.973, 0.98),
    }),
  ], {
    size: { width: 375, height: 720 },
    layout: vLayout(0),
  });
}

function cardDetailPage(): ProcessedNode {
  return frame('card-detail', 'Card Detail Page', [
    imageNode('detail-cover', 'Detail Cover', 375, 280, '/images/detail/cover.png'),
    frame('detail-content', 'Detail Content', [
      text('detail-title', '极简北欧风台灯', 343, 32, {
        size: { width: 343, height: 32 },
        textStyle: { fontFamily: 'sans-serif', fontWeight: 700, fontSize: 22 },
      }),
      frame('detail-price-row', 'Price Row', [
        text('detail-price', '¥199', 100, 30, {
          size: { width: 100, height: 30 },
          fills: solid(0.86, 0.15, 0.15),
          textStyle: { fontFamily: 'sans-serif', fontWeight: 700, fontSize: 20 },
        }),
        text('detail-price-origin', '¥299', 60, 20, {
          size: { width: 60, height: 20 },
          fills: solid(0.55, 0.55, 0.55),
          textStyle: { fontFamily: 'sans-serif', fontWeight: 400, fontSize: 13 },
        }),
      ], { size: { width: 343, height: 30 }, layout: hLayout(8), }),
      frame('detail-tags', 'Tags Row', [
        text('detail-tag-1', '包邮', 52, 24, {
          size: { width: 52, height: 24 },
          fills: solid(0.9, 0.96, 0.92),
          cornerRadius: 4,
          textStyle: { fontFamily: 'sans-serif', fontWeight: 400, fontSize: 12, textAlignHorizontal: 'CENTER' },
        }),
        text('detail-tag-2', '7天无理由', 88, 24, {
          size: { width: 88, height: 24 },
          fills: solid(0.9, 0.96, 0.92),
          cornerRadius: 4,
          textStyle: { fontFamily: 'sans-serif', fontWeight: 400, fontSize: 12, textAlignHorizontal: 'CENTER' },
        }),
        text('detail-tag-3', '正品保障', 68, 24, {
          size: { width: 68, height: 24 },
          fills: solid(0.9, 0.96, 0.92),
          cornerRadius: 4,
          textStyle: { fontFamily: 'sans-serif', fontWeight: 400, fontSize: 12, textAlignHorizontal: 'CENTER' },
        }),
      ], { size: { width: 343, height: 24 }, layout: hLayout(8) }),
      text('detail-desc', '三档调光，无频闪护眼光源，金属灯臂多角度可调。', 343, 44, {
        size: { width: 343, height: 44 },
        fills: solid(0.3, 0.3, 0.3),
        textStyle: { fontFamily: 'sans-serif', fontWeight: 400, fontSize: 14, lineHeightPx: 22 },
      }),
      frame('detail-buy-card', 'Buy Card', [
        button('detail-buy', '立即购买', 311),
      ], {
        size: { width: 343, height: 80 },
        layout: vLayout(0, { top: 16, right: 16, bottom: 16, left: 16 }, 'CENTER', 'CENTER'),
        fills: solid(1, 1, 1),
        cornerRadius: 12,
        effects: [
          { type: 'drop', x: 0, y: 4, blur: 16, spread: 0, color: { r: 0, g: 0, b: 0, a: 0.08 } },
        ] as ProcessedNode['effects'],
      }),
    ], {
      size: { width: 375, height: 532 },
      layout: vLayout(16, { top: 16, right: 16, bottom: 16, left: 16 }),
    }),
  ], {
    size: { width: 375, height: 812 },
    layout: vLayout(0),
    fills: solid(0.969, 0.973, 0.98),
  });
}

function formPage(): ProcessedNode {
  const field = (id: string, label: string, inputId: string): ProcessedNode =>
    frame(id, `${label} Field Row`, [
      text(`${id}-label`, label, 80, 20, {
        size: { width: 80, height: 20 },
        textStyle: { fontFamily: 'sans-serif', fontWeight: 400, fontSize: 15 },
      }),
      fieldInput(inputId, `${label} Input`),
    ], {
      size: { width: 311, height: 48 },
      layout: hLayout(12),
    });

  return frame('form', 'Feedback Form Page', [
    text('form-title', '意见反馈', 200, 28, {
      size: { width: 200, height: 28 },
      textStyle: { fontFamily: 'sans-serif', fontWeight: 700, fontSize: 20 },
    }),
    field('form-row-name', '姓名', 'form-name-input'),
    field('form-row-phone', '手机号', 'form-phone-input'),
    field('form-row-city', '城市', 'form-city-input'),
    field('form-row-remark', '备注', 'form-remark-input'),
    frame('form-agree', 'Agree Row', [
      frame('form-checkbox', 'Checkbox', [], {
        size: { width: 20, height: 20 },
        fills: solid(1, 1, 1),
        cornerRadius: 4,
      }),
      text('form-agree-text', '我已阅读并同意《用户协议》', 260, 20, {
        size: { width: 260, height: 20 },
        fills: solid(0.35, 0.35, 0.35),
        textStyle: { fontFamily: 'sans-serif', fontWeight: 400, fontSize: 13 },
      }),
    ], { size: { width: 311, height: 20 }, layout: hLayout(8) }),
    button('form-submit', '提交反馈', 311),
  ], {
    size: { width: 375, height: 667 },
    layout: vLayout(20, { top: 48, right: 32, bottom: 32, left: 32 }),
    fills: solid(0.969, 0.973, 0.98),
  });
}

function marketingPage(): ProcessedNode {
  const feature = (
    id: string,
    name: string,
    title: string,
    desc: string,
    withBadge = false,
  ): ProcessedNode =>
    frame(id, name, [
      imageNode(`${id}-icon`, `${name} Icon`, 40, 40, `/images/marketing/${id}.png`, { cornerRadius: 8 }),
      frame(`${id}-texts`, `${name} Texts`, [
        text(`${id}-title`, title, 267, 22, {
          size: { width: 267, height: 22 },
          textStyle: { fontFamily: 'sans-serif', fontWeight: 600, fontSize: 15 },
        }),
        text(`${id}-desc`, desc, 267, 20, {
          size: { width: 267, height: 20 },
          fills: solid(0.45, 0.45, 0.45),
          textStyle: { fontFamily: 'sans-serif', fontWeight: 400, fontSize: 13 },
        }),
        ...(withBadge
          ? [
              text(`${id}-badge`, '限时领取', 80, 20, {
                size: { width: 80, height: 20 },
                fills: solid(0.86, 0.15, 0.15),
                textStyle: { fontFamily: 'sans-serif', fontWeight: 500, fontSize: 12, textAlignHorizontal: 'CENTER' },
              }),
            ]
          : []),
      ], {
        size: { width: 287, height: withBadge ? 62 : 48 },
        layout: vLayout(4),
      }),
    ], {
      size: { width: 343, height: withBadge ? 86 : 64 },
      layout: hLayout(16, { top: 12, right: 12, bottom: 12, left: 12 }),
      fills: solid(1, 1, 1),
      cornerRadius: 12,
    });

  return frame('marketing', 'Marketing Long Page', [
    frame('marketing-hero-card', 'Hero Card', [
      imageNode('marketing-hero-img', 'Hero Banner', 311, 180, '/images/marketing/hero.png', {
        cornerRadius: 12,
      }),
    ], {
      size: { width: 343, height: 204 },
      layout: vLayout(0, { top: 12, right: 16, bottom: 12, left: 16 }),
      fills: solid(1, 1, 1),
      cornerRadius: 12,
      // 多阴影叠加：明确排除项（不进分母，报告可见）
      effects: [
        { type: 'drop', x: 0, y: 2, blur: 8, spread: 0, color: { r: 0, g: 0, b: 0, a: 0.12 } },
        { type: 'drop', x: 0, y: 8, blur: 24, spread: 0, color: { r: 0, g: 0, b: 0, a: 0.08 } },
      ] as ProcessedNode['effects'],
    }),
    text('marketing-headline', '双11 全球好物节', 343, 40, {
      size: { width: 343, height: 40 },
      textStyle: { fontFamily: 'sans-serif', fontWeight: 800, fontSize: 28 },
    }),
    text('marketing-subhead', '跨店满 300 减 50，上不封顶', 343, 24, {
      size: { width: 343, height: 24 },
      fills: solid(0.86, 0.15, 0.15),
      textStyle: { fontFamily: 'sans-serif', fontWeight: 500, fontSize: 16 },
    }),
    feature('mkt-feature-logistic', 'Logistic Feature Card', '极速发货', '下单后 24 小时内发出'),
    feature('mkt-feature-quality', 'Quality Feature Card', '品质保障', '品牌授权，假一赔十'),
    feature('mkt-feature-coupon', 'Coupon Feature Card', '领券立减', '点击领取 50 元优惠券', true),
    frame('marketing-countdown', 'Countdown Banner', [
      text('marketing-countdown-text', '距结束 23:59:59', 311, 26, {
        size: { width: 311, height: 26 },
        fills: solid(1, 1, 1),
        textStyle: { fontFamily: 'sans-serif', fontWeight: 700, fontSize: 18, textAlignHorizontal: 'CENTER' },
      }),
    ], {
      size: { width: 343, height: 58 },
      layout: vLayout(0, { top: 16, right: 16, bottom: 16, left: 16 }, 'CENTER', 'CENTER'),
      fills: solid(0.12, 0.12, 0.16),
      cornerRadius: 12,
    }),
    button('marketing-cta', '立即抢购', 343, {
      size: { width: 343, height: 52 },
      effects: [{ type: 'drop', x: 0, y: 6, blur: 12, spread: 0, color: { r: 0.027, g: 0.5, b: 0.2, a: 0.35 } }] as ProcessedNode['effects'],
    }),
  ], {
    size: { width: 375, height: 1200 },
    layout: vLayout(20, { top: 16, right: 16, bottom: 32, left: 16 }),
    fills: solid(0.969, 0.973, 0.98),
  });
}

function navFramePage(): ProcessedNode {
  const section = (id: string, name: string, title: string, line: string): ProcessedNode =>
    frame(id, name, [
      text(`${id}-title`, title, 311, 24, {
        size: { width: 311, height: 24 },
        textStyle: { fontFamily: 'sans-serif', fontWeight: 600, fontSize: 17 },
      }),
      text(`${id}-line`, line, 311, 20, {
        size: { width: 311, height: 20 },
        fills: solid(0.45, 0.45, 0.45),
        textStyle: { fontFamily: 'sans-serif', fontWeight: 400, fontSize: 13 },
      }),
    ], {
      size: { width: 343, height: 72 },
      layout: vLayout(8, { top: 16, right: 16, bottom: 16, left: 16 }),
      fills: solid(1, 1, 1),
      cornerRadius: 12,
    });

  const tabEntry = (id: string, name: string, icon: string, label: string): ProcessedNode =>
    frame(id, name, [
      imageNode(`${id}-icon`, `${name} Icon`, 24, 24, `/images/nav/${icon}.png`),
      text(`${id}-label`, label, 56, 16, {
        size: { width: 56, height: 16 },
        textStyle: { fontFamily: 'sans-serif', fontWeight: 400, fontSize: 11, textAlignHorizontal: 'CENTER' },
      }),
    ], {
      size: { width: 72, height: 48 },
      layout: vLayout(4, { top: 6, right: 8, bottom: 6, left: 8 }, 'MIN', 'CENTER'),
    });

  return frame('nav-frame', 'Navigation Frame Page', [
    frame('nav-topbar', 'Top Navigation Bar', [
      text('nav-back', '‹', 24, 28, {
        size: { width: 24, height: 28 },
        textStyle: { fontFamily: 'sans-serif', fontWeight: 400, fontSize: 24 },
      }),
      text('nav-title', '首页', 120, 24, {
        size: { width: 120, height: 24 },
        textStyle: { fontFamily: 'sans-serif', fontWeight: 600, fontSize: 17, textAlignHorizontal: 'CENTER' },
      }),
      text('nav-more', '•••', 24, 24, {
        size: { width: 24, height: 24 },
        textStyle: { fontFamily: 'sans-serif', fontWeight: 700, fontSize: 18, textAlignHorizontal: 'CENTER' },
      }),
    ], {
      size: { width: 375, height: 56 },
      layout: hLayout(0, { top: 16, right: 16, bottom: 12, left: 16 }, 'SPACE_BETWEEN', 'CENTER'),
      fills: solid(1, 1, 1),
    }),
    frame('nav-body', 'Body Scroll View', [
      section('nav-section-a', 'Notice Section Card', '今日推荐', '为你精选的好物与内容'),
      section('nav-section-b', 'Activity Section Card', '热门活动', '限时秒杀进行中，先到先得'),
    ], {
      clipsContent: true,
      size: { width: 375, height: 535 },
      layout: vLayout(12, { top: 12, right: 16, bottom: 12, left: 16 }),
      fills: solid(0.969, 0.973, 0.98),
    }),
    frame('nav-tabbar', 'Bottom Navigation Bar', [
      tabEntry('nav-tab-home', 'Home Tab Entry', 'home', '首页'),
      tabEntry('nav-tab-mine', 'Mine Tab Entry', 'mine', '我的'),
    ], {
      size: { width: 375, height: 76 },
      layout: hLayout(0, { top: 10, right: 16, bottom: 10, left: 16 }, 'SPACE_AROUND', 'CENTER'),
      fills: solid(1, 1, 1),
    }),
  ], {
    size: { width: 375, height: 667 },
    layout: vLayout(0),
  });
}

// —— 闸门 ——

const GOLDEN_PAGES: Array<{ key: string; cn: string; build: () => ProcessedNode }> = [
  { key: 'login', cn: '登录', build: loginPage },
  { key: 'list', cn: '列表', build: listPage },
  { key: 'card-detail', cn: '卡片详情', build: cardDetailPage },
  { key: 'form', cn: '表单', build: formPage },
  { key: 'marketing', cn: '营销长页', build: marketingPage },
  { key: 'nav-frame', cn: '导航框架', build: navFramePage },
];

describe('P0-81 六张黄金 fixture：WXSS 还原度闸门 ≥85%', () => {
  let generator: WeappGenerator;

  beforeEach(() => {
    generator = new WeappGenerator(mockFigmaClient);
    vi.clearAllMocks();
    mockFigmaClient.getImages.mockResolvedValue({ images: {} });
  });

  for (const page of GOLDEN_PAGES) {
    it(`[${page.cn}] ${page.key} 覆盖率 ≥0.85，排除项在报告中可见`, async () => {
      const result = await generator.generateFromContext(ctx(page.build()), {
        componentName: `Golden_${page.key}`,
        isPage: true,
      });
      const f = result.fidelity;
      // 证据输出（vitest 默认不显示，失败时可追溯）
      console.log(
        `[golden:${page.key}] rate=${(f.rate * 100).toFixed(1)}% matched=${f.matched}/${f.total} ` +
          `missing=[${f.missing.join(',')}] excluded=${f.excluded
            .map((e) => e.property)
            .join(',')}`,
      );
      expect(f.total).toBeGreaterThan(0);
      expect(f.rate).toBeGreaterThanOrEqual(0.85);
    });
  }

  it('[列表] 重复行折叠为 wx:for，3 个非原型成员登记 list-folded-member', async () => {
    const result = await generator.generateFromContext(ctx(listPage()), {
      componentName: 'Golden_list_struct',
      isPage: true,
    });
    expect(result.wxml).toContain('wx:for=');
    const folded = result.fidelity.excluded.filter((e) => e.property === 'list-folded-member');
    expect(folded.length).toBe(3);
  });

  it('[营销长页] 多阴影叠加登记 box-shadow:multi，图片填充登记 fill:image，均不进分母', async () => {
    const result = await generator.generateFromContext(ctx(marketingPage()), {
      componentName: 'Golden_marketing_excl',
      isPage: true,
    });
    const props = result.fidelity.excluded.map((e) => e.property);
    expect(props).toContain('box-shadow:multi');
    expect(props).toContain('fill:image');
    expect(result.fidelity.missing).not.toContain('box-shadow');
  });

  it('[全部] 每页至少覆盖尺寸/布局/文本三类承诺属性（fixture 有效性自检）', async () => {
    for (const page of GOLDEN_PAGES) {
      const result = await generator.generateFromContext(ctx(page.build()), {
        componentName: `Golden_${page.key}_props`,
        isPage: true,
      });
      const wxss = result.wxss;
      expect(wxss).toContain('width:', `[${page.key}] 缺尺寸类声明`);
      expect(wxss).toMatch(/flex-direction|display:\s*flex/, `[${page.key}] 缺布局类声明`);
      expect(wxss).toContain('font-size:', `[${page.key}] 缺文本类声明`);
    }
  });
});
