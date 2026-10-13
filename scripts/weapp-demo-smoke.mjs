// 微信开发者工具冒烟 —— 静态预检（不依赖 DevTools GUI）
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve('examples/weapp-demo');
const results = [];
const check = (name, fn) => {
  try { fn(); results.push(['PASS', name]); }
  catch (e) { results.push(['FAIL', `${name} — ${e.message}`]); }
};
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));

// 1) JSON 可解析
for (const f of ['app.json', 'project.config.json', 'sitemap.json', 'pages/index/index.json']) {
  check(`JSON 可解析：${f}`, () => JSON.parse(read(f)));
}

// 2) JS 语法（node --check）
for (const f of ['app.js', 'pages/index/index.js']) {
  check(`JS 语法：${f}`, () => execFileSync(process.execPath, ['--check', path.join(root, f)]));
}

// 3) PNG 解码（magic bytes，递归 images/）
function walkPngs(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkPngs(full));
    else if (e.name.endsWith('.png')) out.push(full);
  }
  return out;
}
const images = walkPngs(path.join(root, 'images'));
check(`内置 PNG ${images.length} 张 magic bytes`, () => {
  for (const f of images) {
    const b = fs.readFileSync(f);
    if (!(b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)) throw new Error(path.basename(f));
  }
});

// 4) app.json 注册页文件齐全
const appJson = JSON.parse(read('app.json'));
check(`app.json pages（${appJson.pages.join(',')}）四件套/首页文件存在`, () => {
  for (const p of appJson.pages) {
    for (const ext of ['.wxml', '.wxss', '.js', '.json']) {
      if (!exists(p + ext)) throw new Error(`缺 ${p}${ext}`);
    }
  }
});

// 5) project.config.json 冻结基线
const proj = JSON.parse(read('project.config.json'));
check('libVersion=3.1.5（冻结基线）', () => {
  if (proj.libVersion !== '3.1.5') throw new Error(`实际 ${proj.libVersion}`);
});
check('compileType=miniprogram / appid 合法（仓库占位 touristappid 或 IDE 测试号）', () => {
  if (proj.compileType !== 'miniprogram') throw new Error('compileType');
  if (proj.appid !== 'touristappid' && !/^wx[0-9a-f]{16}$/.test(proj.appid)) {
    throw new Error(`非法 appid：${proj.appid}`);
  }
});

// 6) WXML 标签配对 + 指令合法
const VOID = new Set(['input', 'image', 'br', 'hr', 'import', 'include', 'wxs']);
function parseWxml(src) {
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)\/?>/g;
  const stack = [];
  let m;
  while ((m = re.exec(src))) {
    const whole = m[0];
    if (whole.startsWith('<!--')) continue;
    const tag = m[1];
    if (VOID.has(tag)) continue;
    if (whole.startsWith('</')) {
      const top = stack.pop();
      if (top !== tag) throw new Error(`闭合不匹配：</${tag}> 栈顶=${top ?? '空'}`);
    } else if (!whole.endsWith('/>')) {
      stack.push(tag);
    }
  }
  if (stack.length) throw new Error(`未闭合：${stack.join(',')}`);
}
const wxml = read('pages/index/index.wxml');
check('WXML 标签开闭配对', () => parseWxml(wxml));
check('WXML 关键能力存在（wx:for/wx:if/事件/form/组件）', () => {
  // navigator 不在单页 demo 设计内（由生成器单测覆盖），此处只核对本页承诺的列表/表单/条件块
  for (const token of ['wx:for', 'wx:if', 'wx:else', 'bindsubmit', 'bindinput', 'bindchange', 'bindtap', '<form', '<switch']) {
    if (!wxml.includes(token)) throw new Error(`缺 ${token}`);
  }
});

// 7) WXSS 大括号配对
const pageWxss = read('pages/index/index.wxss');
const appWxss = read('app.wxss');
const wxss = pageWxss + appWxss;
check('WXSS 大括号配对', () => {
  const open = (wxss.match(/{/g) ?? []).length;
  const close = (wxss.match(/}/g) ?? []).length;
  if (open !== close) throw new Error(`${open} != ${close}`);
});

// 7.1) 页面/组件 WXSS 选择器合规：小程序页面与组件 wxss 不允许标签/ID/属性
//      选择器（DevTools 输出 “Some selectors are not allowed in component
//      wxss”）。app.wxss 全局样式允许标签选择器；page 根选择器官方支持。
const ALLOWED_TAG_ATOMS = new Set(['page']);
check('页面 WXSS 选择器合规（无标签/ID/属性选择器）', () => {
  const noComments = pageWxss.replace(/\/\*[\s\S]*?\*\//g, '');
  const parts = noComments.split('{');
  for (let i = 0; i < parts.length - 1; i++) {
    const head = i === 0 ? parts[0] : parts[i].split('}').pop();
    for (const raw of head.split(',')) {
      const sel = raw.trim();
      if (!sel || sel.startsWith('@')) continue;
      if (sel.includes('#')) throw new Error(`ID 选择器：${sel}`);
      if (sel.includes('[')) throw new Error(`属性选择器：${sel}`);
      const core = sel.replace(/::?[\w-]+(\([^)]*\))?/g, ' ');
      for (const atom of core.split(/[\s>+~]+/).filter(Boolean)) {
        if (!atom.startsWith('.') && !ALLOWED_TAG_ATOMS.has(atom)) {
          throw new Error(`标签/非法选择器：${sel}`);
        }
      }
    }
  }
});

// 8) JS 关键交互处理函数存在
const idxJs = read('pages/index/index.js');
check('页面 JS 交互函数齐全（过滤/列表/事件/条件数据）', () => {
  for (const fn of ['onSearchSubmit', 'onKeywordInput', 'onStockToggle', 'onReset', 'onAddTap']) {
    if (!idxJs.includes(fn)) throw new Error(`缺 ${fn}`);
  }
  for (const d of ['goodsList', 'keyword', 'inStockOnly', 'filteredList']) {
    if (!idxJs.includes(d)) throw new Error(`缺 data ${d}`);
  }
});

// 输出
let pass = 0;
for (const [s, msg] of results) {
  console.log(`${s === 'PASS' ? '✅' : '❌'} ${msg}`);
  if (s === 'PASS') pass++;
}
console.log(`\n${pass}/${results.length} 静态预检通过`);
process.exit(results.some(([s]) => s === 'FAIL') ? 1 : 0);
