/**
 * P3-11 性能基准：确定性 1000 节点合成页面夹具（零网络、零随机源不稳定）。
 *
 * 形态模拟真实电商页：顶部导航 + N 个商品分区（标题 + 一行 K 张卡片，
 * 卡片含图片/标题/描述/按钮/徽章）+ 表单区 + Tabs + 页脚。
 * 颜色/尺寸取自小调色板（真实页面 token 高度重复），约 10% 注入调色板外
 * 任意值，保证「精确命中 + 任意值兜底」两条热路径都被压到。
 *
 * 纯 ESM、零外部依赖、零 dist 依赖，Node 直接执行。
 */

/** mulberry32 确定性伪随机（同 seed 逐字节同树，跨机/跨次可复现） */
function createRng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** #rrggbb 调色板（与 token-matcher 系统色板部分重合，部分为任意色） */
const PALETTE = [
  '#1677ff', '#409eff', '#07c160', '#f56c6c', '#ffffff', '#f5f5f5',
  '#d1d9e6', '#1f2937', '#6b7280', '#f59e0b', '#e04536', '#eef2ff',
];
/** 调色板外任意色（任意值兜底路径） */
const OFF_PALETTE = ['#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

const COMMON_W = [80, 96, 120, 160, 200, 240, 320, 343];
const COMMON_H = [24, 32, 40, 48, 80, 120, 160];

/** 卡片投影（典型 shadow-md 口径：y4 blur8 低透明黑） */
const CARD_SHADOW = {
  type: 'drop',
  x: 0,
  y: 4,
  blur: 8,
  spread: 0,
  color: { r: 0, g: 0, b: 0, a: 0.12 },
};

function hexToRgbFill(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return {
    type: 'solid',
    color: {
      r: parseInt(m[1], 16) / 255,
      g: parseInt(m[2], 16) / 255,
      b: parseInt(m[3], 16) / 255,
    },
  };
}

let seq = 0;
function nid() {
  return `n${(seq++).toString(36)}`;
}

/**
 * 构造合成页面节点树。
 *
 * @param {object} opts
 * @param {number} [opts.targetNodes=1000] - 期望节点规模（按卡片粒度逼近，返回实际计数）
 * @param {number} [opts.seed=20261012]
 * @returns {{ root: object, count: number, context: object }}
 */
export function buildPerfFixture({ targetNodes = 1000, seed = 20261012 } = {}) {
  seq = 0;
  const rng = createRng(seed);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const pickHex = () => (rng() < 0.1 ? pick(OFF_PALETTE) : pick(PALETTE));

  const text = (t, size = 14) => ({
    id: nid(),
    figmaId: nid(),
    name: t,
    originalType: 'TEXT',
    role: 'text',
    visible: true,
    clipsContent: false,
    textContent: t,
    size: { width: Math.max(40, t.length * size * 0.62), height: size * 1.5 },
    textStyle: { fontSize: size, fontWeight: rng() < 0.2 ? 600 : 400, lineHeightPx: size * 1.5 },
    fills: [hexToRgbFill(rng() < 0.08 ? pick(OFF_PALETTE) : '#1f2937')],
  });

  const frame = (name, role, children, extra = {}) => ({
    id: nid(),
    figmaId: nid(),
    name,
    originalType: 'FRAME',
    role,
    visible: true,
    clipsContent: false,
    size: extra.size ?? { width: 320, height: 80 },
    children,
    ...extra,
  });

  /** 单张商品卡（6 节点：卡框/图/标题/描述/按钮+按钮文案/徽章） */
  const card = (i) => {
    const badge = frame(
      rng() < 0.5 ? 'New Badge' : 'Tag Badge',
      'badge',
      [text(i % 3 === 0 ? 'HOT' : 'NEW', 10)],
      {
        size: { width: 48, height: 20 },
        cornerRadius: { topLeft: 10, topRight: 10, bottomRight: 10, bottomLeft: 10 },
        fills: [hexToRgbFill(pickHex())],
      },
    );
    const img = {
      id: nid(),
      figmaId: nid(),
      name: 'product image',
      originalType: 'RECTANGLE',
      role: 'image',
      visible: true,
      clipsContent: false,
      size: { width: 140, height: 96 },
      cornerRadius: { topLeft: 8, topRight: 8, bottomRight: 8, bottomLeft: 8 },
    };
    const title = text(rng() < 0.5 ? '商品标题' : 'Product Title', 14);
    const desc = text('描述文案一行', 12);
    const btnLabel = text(i % 2 === 0 ? '立即购买' : 'Add to Cart', 12);
    const btn = frame('Buy Button', 'button', [btnLabel], {
      size: { width: 96, height: 36 },
      cornerRadius: { topLeft: 6, topRight: 6, bottomRight: 6, bottomLeft: 6 },
      fills: [hexToRgbFill(rng() < 0.12 ? '#e04536' : '#1677ff')],
      layout: { mode: 'HORIZONTAL', padding: { top: 8, right: 12, bottom: 8, left: 12 }, itemSpacing: 0 },
    });
    return frame('Product Card', 'card', [badge, img, title, desc, btn], {
      size: { width: 160, height: 220 },
      cornerRadius: { topLeft: 12, topRight: 12, bottomRight: 12, bottomLeft: 12 },
      effects: [CARD_SHADOW],
      layout: { mode: 'VERTICAL', padding: { top: 12, right: 12, bottom: 12, left: 12 }, itemSpacing: 8 },
    });
  };

  /** 顶部导航（logo + 5 导航项） */
  const header = () => {
    const logo = text('Brand', 18);
    logo.textStyle.fontWeight = 700;
    const navs = ['Home', 'Products', 'Pricing', 'Docs', 'About'].map((label) =>
      frame(`${label} Button`, 'button', [text(label, 12)], {
        size: { width: 72, height: 32 },
        strokes: [{ color: { r: 0.82, g: 0.85, b: 0.9 }, weight: 1, align: 'INSIDE' }],
        layout: { mode: 'HORIZONTAL', padding: { top: 6, right: 10, bottom: 6, left: 10 }, itemSpacing: 0 },
      }),
    );
    return frame('Header Nav', 'container', [logo, ...navs], {
      size: { width: 375, height: 56 },
      layout: { mode: 'HORIZONTAL', padding: { top: 12, right: 16, bottom: 12, left: 16 }, itemSpacing: 12 },
    });
  };

  /** 表单区：4 个 label+input + 提交按钮 */
  const formSection = () => {
    const fields = ['Name Input', 'Email Input', 'Password Input', 'Search Input'].map((label) =>
      frame(label, 'input', [], {
        size: { width: 260, height: 40 },
        strokes: [{ color: { r: 0.82, g: 0.85, b: 0.9 }, weight: 1, align: 'INSIDE' }],
        cornerRadius: { topLeft: 8, topRight: 8, bottomRight: 8, bottomLeft: 8 },
      }),
    );
    const submit = frame('Submit Button', 'button', [text('提交', 14)], {
      size: { width: 120, height: 40 },
      fills: [hexToRgbFill('#07c160')],
      cornerRadius: { topLeft: 8, topRight: 8, bottomRight: 8, bottomLeft: 8 },
    });
    return frame('Signup Form', 'container', [...fields.map((f, i) =>
      frame(`Field ${i + 1}`, 'container', [text(f.name, 12), f], {
        size: { width: 260, height: 64 },
        layout: { mode: 'VERTICAL', padding: { top: 4, right: 0, bottom: 4, left: 0 }, itemSpacing: 4 },
      }),
    ), submit], {
      size: { width: 343, height: 340 },
      layout: { mode: 'VERTICAL', padding: { top: 16, right: 16, bottom: 16, left: 16 }, itemSpacing: 12 },
    });
  };

  /** Tabs（等宽文本项，激活项有填充） */
  const tabs = () => {
    const items = ['概览', '规格', '评价'].map((label, i) =>
      frame(`tab${i + 1}`, 'list-item', [text(label, 12)], {
        size: { width: 80, height: 32 },
        ...(i === 0 ? { fills: [hexToRgbFill('#1677ff')] } : {}),
      }),
    );
    return frame('Product Tabs', 'list', items, {
      size: { width: 343, height: 40 },
      layout: { mode: 'HORIZONTAL', padding: { top: 4, right: 0, bottom: 4, left: 0 }, itemSpacing: 0 },
    });
  };

  /** 页脚：3 列文本链接 */
  const footer = () => {
    const cols = [
      ['About', 'Careers', 'Contact'],
      ['Terms', 'Privacy', 'License'],
      ['Docs', 'Status', 'Blog'],
    ].map((links) =>
      frame('Footer Column', 'container', links.map((l) => text(l, 12)), {
        size: { width: 100, height: 96 },
        layout: { mode: 'VERTICAL', padding: { top: 8, right: 8, bottom: 8, left: 8 }, itemSpacing: 6 },
      }),
    );
    return frame('Site Footer', 'container', cols, {
      size: { width: 375, height: 120 },
      layout: { mode: 'HORIZONTAL', padding: { top: 16, right: 16, bottom: 16, left: 16 }, itemSpacing: 8 },
    });
  };

  // 单卡片子树 6 节点，一行 2 卡 + 行框 + 分区标题/框 ≈ 16 节点/分区；
  // 固定尾部（表单区/tabs/页脚）约 40 节点，按目标数反推分区数
  const FIXED_TAIL_BUDGET = 40;
  const children = [header()];
  let count = countNodes(children[0]);
  let sectionIdx = 0;
  while (count < targetNodes - FIXED_TAIL_BUDGET) {
    const cardsPerRow = 2;
    const cardsArr = [card(sectionIdx * 2), card(sectionIdx * 2 + 1)];
    const row = frame('Card Row', 'container', cardsArr, {
      size: { width: 343, height: 236 },
      layout: { mode: 'HORIZONTAL', padding: { top: 0, right: 16, bottom: 0, left: 16 }, itemSpacing: 12 },
    });
    const section = frame(`Section ${sectionIdx + 1}`, 'section', [
      text(`Section Heading ${sectionIdx + 1}`, 20),
      row,
    ], {
      size: { width: 375, height: 290 },
      layout: { mode: 'VERTICAL', padding: { top: 16, right: 0, bottom: 16, left: 0 }, itemSpacing: 8 },
    });
    children.push(section);
    count += countNodes(section);
    sectionIdx++;
    if (sectionIdx > 500) break; // 安全阀
  }
  children.push(formSection(), tabs(), footer());

  const root = frame('Perf Page 1000', 'container', children, {
    size: { width: 375, height: 4000 },
    layout: { mode: 'VERTICAL', padding: { top: 0, right: 0, bottom: 0, left: 0 }, itemSpacing: 0 },
  });
  count = countNodes(root);

  // 给容器随机注入常见尺寸（width/height 热路径）
  const injectSizes = (n) => {
    if (!n.size && n.role === 'container') {
      n.size = { width: pick(COMMON_W), height: pick(COMMON_H) };
    }
    for (const c of n.children ?? []) injectSizes(c);
  };
  injectSizes(root);

  const context = {
    fileKey: 'perf-fixture',
    node: root,
    colors: [],
    spacing: [],
    radii: [],
    shadows: [],
    assets: [],
    textNodes: [],
    componentsUsed: [],
  };
  return { root, count, context };
}

function countNodes(n) {
  let c = 1;
  for (const child of n.children ?? []) c += countNodes(child);
  return c;
}
