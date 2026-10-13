// WBS-R1 weapp-demo 自动化冒烟（miniprogram-automator 版）
//
// 前置条件：
//   1. 微信开发者工具已登录，设置 → 安全设置 → 服务端口已开启；
//   2. examples/weapp-demo 已以「测试号」在 IDE 导入过一次（CLI 不接受 tourist/空 AppID）；
//   3. 已安装官方自动化 SDK（仅运行时需要，不写入 package.json）：
//        npm i miniprogram-automator --no-save
//   4. IDE 已开启自动化端口（保持该命令不退出，模拟器编译完成后端口才会监听）：
//        <DevTools>/cli.bat auto --project <abs examples/weapp-demo> --auto-port 9420 --trust-project
//      注意：lite 模式模拟器窗口不可最小化/被完全遮挡（Chromium 遮挡节流会挂起渲染）。
//
// 运行：node scripts/weapp-demo-automator.mjs [wsPort]
//   wsPort 默认 9420（与 --auto-port 一致；端口被占时 IDE 会顺延，传实际端口即可）
//
// 覆盖 README 第 4/5 节：首屏/搜索/仅看有货/空态/Toast/Console 无报错，并逐场景截图。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import automator from 'miniprogram-automator';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const SHOT_DIR = process.env.WEAPP_SHOT_DIR
  || path.join(repoRoot, 'docs', 'weapp-baseline', 'screenshots', 'automator');
const port = process.argv[2] || process.env.AUTO_PORT || '9420';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = '2026-10-12';

const logs = [];
const errors = [];

let mp;
try {
  process.stdout.write(`trying ws://127.0.0.1:${port} ... `);
  mp = await automator.connect({ wsEndpoint: `ws://127.0.0.1:${port}` });
  console.log('CONNECTED');
} catch (e) {
  console.error('CONNECT_FAIL:', e.message);
  process.exit(2);
}

mp.on('console', (t) => logs.push(t));
mp.on('exception', (e) => errors.push(e));

const assert = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} - ${msg}`);
  if (!cond) errors.push(new Error(msg));
};
const shot = async (name) => {
  await mp.screenshot({ path: path.join(SHOT_DIR, `${stamp}-${name}.png`) });
  console.log(`shot ${name}`);
};

try {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await mp.reLaunch('/pages/index/index');
  const page = await mp.currentPage();
  await page.waitFor(async () => (await page.data('filteredList')).length === 4, 15000);

  // 1. 首屏：4 卡片
  const d1 = await page.data();
  assert(d1.filteredList.length === 4, `首屏 4 件商品（实际 ${d1.filteredList.length}）`);
  assert((await page.$$('.goods-card')).length === 4, 'DOM 4 张 goods-card');
  assert((await page.$$('.goods-image')).length === 4, '4 张商品 image 节点');
  await shot('01-initial');

  // 2. 搜索「台灯」-> 1 卡片 + 提交 Toast
  await (await page.$('.search-input')).input('台灯');
  await page.waitFor(async () => (await page.data('filteredList')).length === 1, 8000);
  const d2 = await page.data();
  assert(d2.filteredList.length === 1 && d2.filteredList[0].name === '北欧风台灯', '搜索「台灯」过滤为 1 张台灯卡片');
  await shot('02-search-filter');
  await page.callMethod('onSearchSubmit', { detail: { value: { keyword: '台灯' } } });
  await sleep(400);
  await shot('05b-search-toast');

  // 3. 仅看有货 -> 3 卡片
  await page.callMethod('onReset');
  await sleep(300);
  await page.callMethod('onStockToggle', { detail: { value: true } });
  await page.waitFor(async () => (await page.data('filteredList')).length === 3, 8000);
  const d3 = await page.data();
  assert(d3.filteredList.length === 3, `仅看有货 3 件（实际 ${d3.filteredList.length}）`);
  assert(d3.inStockOnly === true, 'inStockOnly 状态为 true');
  assert(d3.filteredList.every((g) => g.stock > 0), '过滤结果全部 stock>0');
  await shot('03-stock-filter');

  // 4. 空态 zzz -> 清空恢复
  await page.callMethod('onReset');
  await sleep(200);
  await (await page.$('.search-input')).input('zzz');
  await page.waitFor('.empty-state', 8000);
  const d4 = await page.data();
  assert(d4.filteredList.length === 0, '关键词 zzz 结果为 0');
  assert(!!(await page.$('.empty-state')), '空态 .empty-state 渲染');
  assert(!!(await page.$('.empty-image')), '空态图片 .empty-image 存在');
  await shot('04-empty-state');
  await (await page.$('.empty-btn')).tap();
  await page.waitFor(async () => (await page.data('filteredList')).length === 4, 8000);
  assert((await page.data('filteredList')).length === 4, '清空筛选条件恢复 4 卡片');

  // 5. 加购成功 / 售罄 Toast
  await (await page.$$('.add-btn'))[0].tap();
  await sleep(450);
  await shot('05-add-toast');
  await page.callMethod('onAddTap', { currentTarget: { dataset: { id: 'g3' } } });
  await sleep(450);
  await shot('05c-soldout-toast');

  // 6. Console 校验
  assert(logs.some((t) => JSON.stringify(t).includes('weapp-demo')), 'Console 输出 weapp-demo 首页加载完成');
  const badLevels = logs.filter((t) => t && (t.type === 'error' || t.type === 'warning'));
  console.log(`console 消息总数=${logs.length}，error/warning=${badLevels.length}`);
  assert(errors.length === 0, `运行期无 exception（实际 ${errors.length}）`);
  assert(badLevels.length === 0, `Console 无 error/warning（实际 ${badLevels.length}）`);

  fs.writeFileSync(
    path.join(repoRoot, 'docs', 'weapp-baseline', 'screenshots', 'automator', 'console-report.json'),
    JSON.stringify({ time: new Date().toISOString(), consoleCount: logs.length, badLevelCount: badLevels.length, exceptions: errors.map(String()), logs }, null, 2),
  );
  const ok = errors.length === 0 && badLevels.length === 0;
  console.log('RESULT ' + (ok ? 'PASS' : 'FAIL'));
  process.exitCode = ok ? 0 : 1;
} catch (e) {
  console.error('SMOKE_RUN_ERROR', e && e.stack ? e.stack : e);
  process.exitCode = 3;
} finally {
  mp.disconnect();
}
