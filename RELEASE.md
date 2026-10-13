# RELEASE.md — 发布、回滚与弃用策略（WBS-G2）

> 适用：figma-dev-tools v1.4.20 起的所有 npm 发布。
> 原则：**版本号一旦发布永不复用**；回滚首选 `npm deprecate`，不做"重新发布同版本"。

## 1. 发布前置检查（全部满足才允许 publish）

| # | 检查 | 方式 | 依据 |
|---|---|---|---|
| 1 | package.json / lock 两处版本一致 | `npm run check:consistency`（13 项全绿，exit 0） | WBS-G1 |
| 2 | 测试全绿且 ≥ 基线 520 | `npm.cmd test -- --reporter=dot` | WBS-G0 |
| 3 | 依赖审计 0 漏洞（生产依赖） | 见下方"审计命令（本机已踩坑）" | ROADMAP 成功指标 |
| 4 | 手工冒烟通过 | WBS-R1 清单（微信开发者工具 / Svelte dev / Watch / Compare / GUI / React/Vue 回归） | WBS-R1 |
| 5 | tarball 清单正确 | `npm.cmd run build` → `npm.cmd pack --dry-run`，核对：无 test/src/scripts/ROADMAP/node_modules；bin、install/uninstall、schema、双语文档、LICENSE 齐全 | WBS-G2 |

## 2. 发布流程（WBS-R2 执行）

```powershell
npm.cmd run build                                  # prepublishOnly 也会触发
npm.cmd pack --dry-run                             # 核对清单（见上表 #5）
npm.cmd publish --registry=https://registry.npmjs.org/  # 发布 1.4.20
git tag v1.4.20 ; git push origin v1.4.20          # 打 tag（Gitee Release 引用）
```

- **发布前先登录官方 registry**：`npm.cmd login --registry=https://registry.npmjs.org/`；当前机器默认 registry 为 `https://registry.npmmirror.com`，不能直接用默认 `npm publish`。`npm.cmd whoami --registry=https://registry.npmjs.org/` 当前为 ENEEDAUTH。
- **禁止在发布流程中再运行 `npm version`**（会二次 bump，1.4.19→1.4.20 已发生过一次）；版本变更只能手工改 package.json + `npm.cmd install --package-lock-only`。
- 发布失败/中断后：**修复后以下一个未占用的版本号重发**（如 1.4.20 失败 → 1.4.21），即使 1.4.20 "看起来没发出去"——若已出现在 registry，则绝不可复用；未出现在 registry 才可重试同号（用 `npm view figma-dev-tools versions` 确认）。

## 3. 回滚决策树（按严重度）

### 3.1 缺陷可控（默认路径）
```powershell
npm.cmd deprecate figma-dev-tools@1.4.20 "存在 <一句话缺陷>，请升级 >=1.4.21；详见 <issue 链接>"
```
- 首选，**不撤版本、不删除 tarball**；已安装用户仍可运行，安装器会看到弃用警告。
- 随后正常发布补丁版 1.4.21（走第 1 节全流程）。

### 3.2 致命缺陷（数据损坏 / 安全漏洞 / 安装即坏）
1. 立即 `npm deprecate`（同上，消息注明"请勿使用"）；
2. 以递增版本号发布修复版（哪怕只隔几分钟）；
3. 仅当发布时间 <72h 且确认下载量≈0 时，才允许 `npm.cmd unpublish figma-dev-tools@<ver>` 做辅助清理——**unpublish 不能替代 deprecate + 补丁**（npm 官方同样建议保留版本号位）。

### 3.3 版本号纪律
- 任何已出现在 registry 的版本号永久占用；补丁、重发一律顺延。
- `dist-tag` 可用于把 `latest` 指回上一个稳定版：`npm.cmd dist-tag add figma-dev-tools@1.4.19 latest`（仅在 1.4.20 完全不可用时，且须同步发补丁）。

## 4. 弃用策略（功能级 / 版本级）

- **版本级**：见 3.1；deprecate 消息格式 = 中文一句话缺陷/原因 + 升级指引 + issue 链接，≤120 字符。
- **功能级**（如未来弃用某 CLI 命令/工具）：提前一个 minor 版本在 README 顶部公告 + 运行时 warn，再在下一个 minor 真正 `npm deprecate` 对应版本区间。
- Gitee Release 说明中必须包含弃用公告；SKILL.md 同步。

## 5. 本次 G2 检查记录（2026-10-13）

- `npm pack --dry-run` / `npm publish --dry-run --registry=https://registry.npmjs.org/`：**figma-dev-tools-1.4.20.tgz**，464 文件 / 1.0 MB / 解包 4.2 MB；清单扫描 **0 可疑文件**（无 test/src/scripts/ROADMAP/audit-baseline/node_modules），必备项齐全（bin/figma-dev.js、install.mjs、uninstall.mjs、mcp-standalone.mjs、mcp-config.schema.json、components.schema.json、双语 README/QUICKSTART、SKILL、FIGMA-DESIGN-GUIDELINES、LICENSE、gui ×3、dist 全量）。已修复 package.json `bin` 路径 `./bin/...` → `bin/...`，否则 npm publish 会删除两个 CLI 命令；干净目录安装后 `figma-dev`/`figma-dev-tools` 均输出 1.4.20。
- 依赖审计：~~本机未完成~~ **2026-10-09 已修复并跑通，0 漏洞**。根因：Node/npm 不读 Windows 系统代理（WinINET `localhost:15236`），直连 npmjs 的 Cloudflare IP 必 ETIMEDOUT（PowerShell 走系统代理故正常）。修复升级 6 个包（均在 semver 内，package.json 声明未动）：@modelcontextprotocol/sdk 1.29.0→1.32.1（HIGH，OAuth 凭据 GHSA-6qxp-vccf-f47h）、axios→1.20.0（HIGH ×6）、proxy-addr→2.0.8（critical）、ip-address→10.7.3、fast-uri→3.1.8、source-map-js→1.2.2；升级后 build 零错误、520/520 全绿。
  - 遗留（不阻塞发布）：devDependency `@vitest/mocker` 1 项 moderate（GHSA-82fw-gwwq-j7x9），修复需 vitest/vite 大版本升级（`--force`），单独排期；生产口径 `--omit=dev` 为 0。
  - Windows 注意：audit fix 时若遇 `EBUSY .sdk-xxxxx` 是编辑器文件锁，确认版本已落盘后删除残留空目录即可。
- 前置依赖：WBS-R1（手工冒烟）尚未执行 → 第 1 节 #4 未打勾前不得 publish。

### 审计命令（本机已踩坑）

npmmirror 镜像无 audit 端点；Node 又不读系统代理，必须显式传代理（端口以本机代理软件为准）：

```powershell
npm.cmd audit --omit=dev --registry=https://registry.npmjs.org `
  --proxy=http://localhost:15236 --https-proxy=http://localhost:15236
# 等价写法：先设 $env:HTTPS_PROXY / $env:HTTP_PROXY 再执行 npm audit
```

CI 环境（Linux/无系统代理、可直连 npmjs）直接 `npm audit --omit=dev` 即可；CI 步骤建议把 registry 固定为官方源。

## 6. WBS-R1 手工冒烟记录（2026-10-10 首次执行，部分通过——发布闸门 #4 暂不满足）

> WBS-R1 定义为 QA 人工冒烟（1.5 QA 日），本次先执行所有**机内可自动化**的子项并留证；
> 依赖未发布功能（P1-2 Watch / P1-3 Compare / P3-32 GUI 选项）与需人工 GUI 操作的子项
> 明确标注阻塞与责任任务，不以自动化结果冒充 QA 结论。

| # | 清单项 | 本次结果 | 证据 / 阻塞判断 |
|---|---|---|---|
| 1 | 自动化冒烟层（CLI dist 入口契约、无参/未知命令不挂死、中英 `--help` 聚合快照、MCP 23 工具枚举） | ✅ 通过 | `npx vitest run test/smoke`：4 文件 73 测试全绿（145s），前置已 `npm run build` |
| 2 | GUI 配置向导（仅 127.0.0.1 + Origin 白名单） | ✅ 服务可用；版本显示问题已定位修复（2026-10-10），余 2 项装饰性发现 | **v1.4.13 根因**：54321 上运行的是全局安装 `figma-dev-tools@1.4.19`（`C:\nvm4w\nodejs\node_modules`）的**陈旧 GUI 进程**，其 gui/index.html 硬编码 `v1.4.13` 且 gui-server 无版本注入（注入机制 `{{FIGMA_DEV_TOOLS_VERSION}}` 为本分支 1.4.20 新增）。处理：结束旧进程（PID 29148），本地构建启动后页面副标题/页脚/data-version/api 四处均 1.4.20（截图确认）；全局需在非沙箱终端 `npm i -g .`（1.4.20 发布后 `npm i -g figma-dev-tools@latest`）。残留：favicon 404（装饰性）、tailwind CDN 生产警告——随 **WBS-P3-32** 处理 |
| 3 | GUI 框架下拉含小程序/Svelte 选项 | ✅ 通过（2026-10-12 浏览器走查） | 本地构建 v1.4.20（127.0.0.1:54321）Chrome DevTools 自动走查 6 步向导：语言中英切换、Token、编辑器检测（实测 6 个已装）、**框架 5 卡片 React/Vue/Svelte 4/微信小程序/HTML 全部渲染**、选择微信小程序后 /api/config/complete 持久化（/api/status 复核 framework=weapp）、完成页。走查抓出并修复 2 个阻断级真实缺陷 + 1 个 a11y 问题，详见第 6.3 节 |
| 4 | 微信开发者工具跑 weapp-demo（图片列表/表单/条件块） | ✅ 通过（2026-10-12 人工执行） | 微信开发者工具 2.02.2610092 + 基础库 3.1.5：编译启动、4 卡片列表、搜索过滤、仅看有货、空态条件块、加购/售罄 Toast、Console 无报错 6 场景人工逐项通过；冒烟中修复 1 个真实缺陷（页面 WXSS 裸标签选择器警告）。详见第 6.2 节 |
| 5 | React/Vue 真实 Figma 生成回归 | ⛔ 待 QA 人工 | 需真实设计稿与网络交互判定（QA 日职责）；机内回归由自动化覆盖：vue-version-pipeline、props-pipeline、new-pipeline-matrix、css-modules/unocss 等管线测试全绿（712/712） |
| 6 | Svelte dev 冒烟 | 🔄 机内部分通过，浏览器渲染待 QA | WBS-P1-1 已完成：① `test/services/svelte-compile.test.ts`（7 例）以真实 svelte/compiler v4.2.0 编译 tailwind/unocss-wind/unocss-attributify/css-modules 四组合 + TS/JS + if/hidden 产物，全绿（TS 经 typescript 预处理）；② `examples/svelte-demo` 执行 `npm install && npm run build`（Vite 5 + @sveltejs/vite-plugin-svelte 3）成功：31 模块，CSS/JS 产物正常。浏览器 `npm run dev` 交互渲染仍由 QA 按 svelte-demo README 执行 |
| 7 | Watch（4 框架） | 🔄 机内全绿，真实 Figma 轮询/落盘待 QA | WBS-P1-21~26 已完成：43 例单测（会话/退避/备份/preserve/JSON 旁路/生命周期/四框架）；MCP 三件套可调用。真机验证点：start 后改 Figma 稿 10s 内触发再生成、write=true 落盘+备份+preserve 保留、429 退避 |
| 8 | Compare | 🔄 机内通过，真实 Figma 对比待 QA | WBS-P1-3 已完成：`figma_compare_code`（unified diff/Prettier 归一化/512KB/越权/二进制），15 例单测全绿；真实设计稿端到端对比随 QA 回归执行 |

**结论（2026-10-12 更新）**：8 项中 #1/#2/#3/#4 完全通过（#3 浏览器走查抓出 2 个阻断缺陷并修复，见 6.3）；#6/#7/#8 机内自动化部分通过（代码与单测/编译/构建均绿），浏览器与真机交互部分待 QA；#5 本身定义为人工 QA 项（真实 Figma React/Vue 回归）。
**发布前置检查 #4 仍不打勾**：GUI 走查与微信开发者工具冒烟均已闭环，但完整 1.5 QA 日冒烟尚余 Svelte dev 浏览器交互、Watch/Compare 真机轮询与真实 Figma React/Vue 回归，需 QA 按 ROADMAP 4.8 节口径补齐截图，失败项开 issue 并给阻塞判断。

### 6.1 Svelte 冒烟回填（2026-10-10，WBS-P1-1 完成后）

| 子项 | 结果 | 证据 |
|---|---|---|
| 生成 .svelte 经 svelte/compiler 编译（tailwind/unocss-wind/unocss-attributify/css-modules + TS/JS + if/hidden） | ✅ 通过 | `svelte-compile.test.ts` 7/7；编译器额外抓出 2 个生成器真实缺陷并已修复：① `_renderChildren` 空数组 truthy 致 leaf 节点带闭合标签；② input 等 void 元素未自闭合（ParseError） |
| svelte-demo 工程 SFC 编译（CI 不装依赖） | ✅ 通过 | 同测试扫描 `examples/svelte-demo/src/**/*.svelte` 全部编译通过 |
| svelte-demo `vite build` | ✅ 通过 | npm install（svelte 4.2 / vite 5.4 / plugin-svelte 3.1）后构建：31 模块，index.css 2.02kB、index.js 10.47kB |
| svelte-demo `npm run dev` 浏览器交互渲染 | ⛔ 待 QA 人工 | 操作脚本见 examples/svelte-demo/README.md（搜索过滤/有货开关/加购事件/空态） |

### 6.2 微信开发者工具冒烟回填（2026-10-12，WBS-R1 #4 闭环）

环境：微信开发者工具 **2.02.2610092 Nightly**（Windows，Electron 36 布局，CLI 入口为
`resources/app.asar.unpacked/js/common/cli/index.js` 经 `ELECTRON_RUN_AS_NODE=1` 调起；
安装目录 `cli.bat` 若为 0 字节系 NSIS 静默安装异常截断所致，用上述入口可绕过）；
基础库 **3.1.5**（冻结基线）；项目首次导入在 GUI 选「测试号」（测试号 AppID 仅写入本地
`project.config.json`，收尾已恢复仓库口径 `touristappid`；CLI 不接受 tourist/空 AppID）。

| 子项（README 第 4/5 节 6 场景） | 结果 | 证据 |
|---|---|---|
| 0. 静态预检 | ✅ 15/15 | `node scripts/weapp-demo-smoke.mjs`：JSON/JS/PNG/3.1.5/标签配对/选择器合规/交互函数 |
| 1. 编译启动 + 首屏 4 卡片（wx:for + 本地图片） | ✅ 通过 | Console：`WeChatLib: 3.1.5`、`Figma Dev Tools 小程序示例启动`、`weapp-demo 首页加载完成`，无红色报错；4 张商品卡片完整 |
| 2. 搜索表单（bindinput 实时过滤 + bindsubmit Toast） | ✅ 通过 | 输入「台灯」实时剩 1 张卡片；提交 Toast `搜索：台灯` |
| 3. switch「仅看有货」（bindchange + 交集过滤） | ✅ 通过 | 保温杯（stock=0）卡片消失，计数 3；与关键词交集过滤正确 |
| 4. 空态条件块（wx:if/wx:else） | ✅ 通过 | 输入「zzz」出空态图+文案；点「清空筛选条件」恢复 4 张 |
| 5. 加购事件（bindtap + data-id + 售罄拦截） | ✅ 通过 | 有货商品 success Toast；保温杯提示「该商品已售罄」 |
| 6. Console 无报错 | ✅ 通过 | 修复选择器警告后无业务 error/warning（DOMNodeRemoved/preload/LazyCodeLoading 为 DevTools 框架自身输出） |

冒烟中发现并修复的真实缺陷：

1. **页面 WXSS 裸标签选择器**：`pages/index/index.wxss` 的 `.filter-switch switch`
   触发 `Some selectors are not allowed in component wxss`（index.wxss:91）→ 改为类选择器
   `.filter-switch__switch`，WXML 同步挂载 class（页面/组件 wxss 只允许类选择器；
   app.wxss 全局样式中的标签选择器与官方 `page` 根选择器不受限）。
2. **静态预检防回归**：`scripts/weapp-demo-smoke.mjs` 新增「页面 WXSS 选择器合规」检查
   （禁标签/ID/属性选择器，白名单 `page`，仅扫页面 wxss 不误报 app.wxss），14 项→**15 项**。

自动化通道结论：`cli auto --auto-port` 在本环境无法闭环——lite 模式模拟器窗口渲染器
初始化后停滞（IDE 日志：插件清单 TLS 拉取失败 `Client network socket disconnected`，
`s1|RENDERER_PROJECT` 后续不连接，automator 9420 端口不监听；遍历本机全部 DevTools 监听
端口均无 automator 握手）。该限制属 Nightly 版本 + 网络环境，不阻塞人工冒烟结论；
后续 QA 环境网络可访问腾讯服务时可用
[scripts/weapp-demo-automator.mjs](scripts/weapp-demo-automator.mjs)（miniprogram-automator，
头部注释含完整前置条件，6 场景自动操作+截图）复跑自动化取证。

### 6.3 GUI 配置向导浏览器走查回填（2026-10-12，WBS-R1 #3 闭环）

环境：本地 `npm run build` 后 `node dist/cli/index.js gui`（127.0.0.1:54321，仅本机监听），
Chrome DevTools MCP 自动驱动；走查前 /api/status 版本 1.4.20。

走查路径与结果：欢迎页 → 语言（中/英切换均生效，/api/language 持久化）→ Token（校验态门禁）
→ 编辑器（实测检测到 6 个：Trae/VS Code/Cline/Roo Code/Claude Desktop/Zed；Cursor/Windsurf 未检测到，
显示下载引导）→ 框架（5 卡片）→ 选择「微信小程序」→ /api/config/complete → /api/status 复核
`framework=weapp` 持久化成功 → 完成页命令引导。测试后已恢复 framework=react。

走查抓出并修复的真实缺陷（此前 #3 从未被真正点击过，两缺陷均使向导不可用/选项不可见）：

1. **向导首屏白屏（阻断）**：`gui/app.js` 的 `t()` 对解析值无条件 `.replace()`，而
   `welcome.features` 是数组，渲染首步即抛 `value.replace is not a function`；init 无 catch，
   除步骤条外内容区/按钮全空。修复：t() 对非字符串文案原样返回；init 包 try/catch，渲染失败时
   在内容区显式展示错误（不再静默白屏）。
2. **框架卡片只显示 2 张（阻断 P3-32 验收）**：`framework.vueDesc` 中英双语含裸
   `<script setup lang="ts">`，经 innerHTML 被解析为真实 script 元素，浏览器 RAWTEXT 状态机
   吞掉其后的 Svelte/微信小程序/HTML 三张卡片。修复：文案转义为
   `&lt;script setup lang=&quot;ts&quot;&gt;`，5 张卡片（react/vue/svelte/weapp/html）全部渲染。
3. **a11y**：token 输入框补 `aria-label`，Tokens 输出目录 label 补 `for="output-dir"`
   （DevTools 原先报 No label associated with a form field ×2）。

顺带更新：欢迎页特性文案「React/Vue/HTML」→「React / Vue / Svelte / 微信小程序」（中英）。
非阻断遗留：① tailwind CDN 生产环境警告与 ② favicon 404（2026-10-10 已登记，随 P3-32 后续处理）；
③ 编辑器卡片黄色 pending 徽章文案与 Install 按钮重复（轻微 UX 噪音）。
注：沙箱内启动 GUI 时 /api/language 等写用户目录的接口报 EPERM 500 属沙箱限制，真实终端启动无此问题。

