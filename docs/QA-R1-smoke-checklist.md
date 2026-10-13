# WBS-R1 发布前冒烟清单与记录（v1.4.20）

> 对应 ROADMAP-v1.4.20-v2.md §4.6 WBS-R1（1.5 QA 日）。
> 规则：清单逐项必须有结果；失败项登记 issue 与阻塞判断；自动化项每次发布随 CI/脚本回归，人工项由 QA 执行后签字。

- 版本：figma-dev-tools **v1.4.20**
- 本轮记录日期：2026-10-13
- 环境：Windows / Node v24.21.0 / 微信基础库冻结基线 3.1.5
- 自动化证据：`test/perf/results/`（vitest-latest.json、test-reconciliation.json、ab-modes.json）

## 一、结果汇总

| # | 冒烟域 | 方式 | 结果 | 证据 / 位置 |
|---|--------|------|------|-------------|
| 1 | GUI 新选项（组件库选择器） | 自动化 + 浏览器实测 | ✅ 通过（含 3 个缺陷修复后复测） | test/smoke/r1-qa.smoke.test.ts；本文件 §3 |
| 2 | CLI 组件库闸门（React/Vue 回归） | 自动化子进程 | ✅ 通过 | r1-qa.smoke（2 例）；help 快照 6 命令 |
| 3 | MCP 工具注册/入参 | 自动化 | ✅ 通过 | test/smoke/mcp-tools.smoke.test.ts |
| 4 | React/Vue/Svelte/weapp 生成回归 | 全量单测 | ✅ 1055/1055（81 文件，0 失败；含 R1 QA 新增 14 例） | vitest-latest.json |
| 5 | Watch（核心逻辑 5 文件 43 例） | 自动化 | ✅ 通过 | test/services/watch/* |
| 6 | Compare（核心逻辑 15 例） | 自动化 | ✅ 通过 | test/services/compare-code.test.ts |
| 7 | 微信开发者工具（6 场景） | **人工** | ✅ 2026-10-12 已执行通过（上一轮记录） | scripts/weapp-demo-smoke.mjs（静态 15/15）；§4.1 |
| 8 | Svelte dev 目检 | **人工**+自动 | ✅ 2026-10-13 自动化部分通过（§4.2-B 三组合+no-ts 对真实稿生成，svelte/compiler 编译 4/4 OK，非法样式 1.4s 触网前失败）；**浏览器交互目检 §4.2-A 仍待 QA** | §4.2 |
| 9 | Watch 四框架实况 | **人工** | ⏳ 待 QA 执行 | §4.3 |
| 10 | Compare 可视化目检 | **人工** | ⏳ 待 QA 执行 | §4.4 |
| 11 | React/Vue 真实项目抽测 | **人工（建议）** | ✅ 2026-10-13 自动化通过（鸿溟平台真实稿：antd/element-plus/ant-design-vue auto、shadcn 显式、无依赖降级、antd 产物 tsc strict 0 错） | §4.5 |

**对账**：静态声明 878 例 / 实跑 1016 例（参数化展开 +138，预期方向），无「实跑 < 静态」异常文件。
**发布闸门**：check-release-consistency 13/13 通过，0 漂移。

## 二、自动化项说明（长期回归）

`npm run build && npm run test:smoke` 即覆盖第 1–3 项；`npm test` 覆盖第 4–6 项；`npm run test:reconcile` 输出对账 JSON。

R1 新增自动化（test/smoke/r1-qa.smoke.test.ts，10 例）：

- GUI 服务只绑定 **127.0.0.1**，不暴露局域网；
- `/api/status` 返回 `config.componentLibrary`；
- 首页版本号由服务端注入，无旧版本硬编码残留；
- 跨域 `Origin: http://evil.example.com` → **403**（白名单仅 localhost）；
- 编码目录穿越 `/%2e%2e/` 无法读出项目文件（403/404）；
- complete：react+shadcn-ui 落盘；非法库 `bootstrap-ui` 被白名单降级为 auto（**任意值不写盘**）；
- vue+element-plus 落盘；`none` 时配置省略 componentLibrary 字段；
- CLI 子进程：react 管线选 Vue 库 → `FDT-UI-LIB-FRAMEWORK-MISMATCH`、非 0 退出、10s 内失败（**不触网**）；未知库 → `FDT-UI-LIB-UNKNOWN`。

## 三、GUI 浏览器实测记录（2026-10-13）

直达 framework 步骤后逐项交互（Chrome DevTools 自动化）：

| 检查点 | 结果 |
|--------|------|
| React 显示 Auto detect / shadcn/ui / Ant Design / None，默认 Auto | ✅ |
| 点击 chip 选中态与 state 同步 | ✅ |
| 切到 Vue：选项变为 Auto / Element Plus / Ant Design Vue / None；跨框架已选值自动回退 Auto | ✅ |
| 切到 Svelte / 微信小程序 / HTML：选择器隐藏 | ✅ |
| 输出目录输入在框架切换重绘后不丢失 | ✅ |
| 中文 / 英文文案均正常（无裸 key） | ✅ |
| 完成配置 → figma-dev.config.json 写入 componentLibrary，/api/status 回读一致 | ✅ |
| 非法 componentLibrary 值被拦截（落盘为 auto） | ✅ |
| 控制台无业务报错 | ✅ |

## 四、人工项执行清单（QA 照做并回填结果）

### 4.1 微信开发者工具（上一轮已通过，回归时重跑）

1. GUI/CLI 生成 examples/weapp-demo；`node scripts/weapp-demo-smoke.mjs` 静态预检需 15/15。
2. 微信开发者工具导入项目（首次需手选测试号，touristappid 为交付口径）；基础库切 3.1.5。
3. 六场景：首屏 4 卡片、搜索过滤、仅看有货、空态、加购/售罄 Toast、Console 无业务报错。
4. 额外（本轮新增）：在 GUI 向导选「微信小程序」时确认组件库选择器不出现；生成产物 WXSS 仅类选择器/page 根选择器。

### 4.2 Svelte dev 目检

1. examples/svelte-demo 安装依赖并 `npm run dev`，页面无控制台错误；
2. CLI `figma-dev svelte <url> --style tailwind|unocss|css-modules` 三组合各生成一次，dev 编译通过；非法样式组合应在触网前被拒绝；
3. 输出为 Svelte 4 语法（export let / on:），runes 仅以注释建议出现。

#### 4.2-B 执行记录（2026-10-13，真实稿「确认上架」Frame 187:14660）

| 检查点 | 结果 |
|--------|------|
| tailwind / unocss(--attributify) / css-modules / --no-ts 四产物落盘 | ✅（修复 I-06 后；48.7–74.7KB） |
| svelte/compiler v4 真实编译 4/4 通过（TS 经 typescript 预处理） | ✅ |
| export let / on:click·input·change / keyed {#each} 标记 | ✅ 全部存在 |
| 代码区无 runes（$props/$state/$derived，注释除外） | ✅ |
| css-modules 组合为内联 scoped `<style>` | ✅ |
| `--style styled` 触网前拒绝（1.35s，exit 1，「样式方案不支持 svelte 框架」） | ✅ |
| 浏览器 dev 交互/HMR（步骤 1，§4.2-A） | ⏳ 待 QA 目检 |

### 4.3 Watch 四框架实况

对 react / vue / svelte / weapp 各启动一次 watch；触发一次设计变更（或轮询周期到达），确认：仅变更文件重写、安全写（临时文件+rename）无半写产物、去抖/轮询行为与日志正确；Ctrl+C 可正常退出。

### 4.4 Compare 可视化目检

对同一节点两个版本执行 compare：新增/删除/变更分类正确，像素差异图可打开查看；无网络时降级行为符合预期。

### 4.5 React/Vue 真实项目抽测（建议项）

在带真实 package.json 的项目中以 `--component-library auto` 生成：shadcn-ui / ant-design / element-plus / ant-design-vue 各一次，确认导入语句为最小可用骨架、无未使用 import；无依赖证据时自动降级原生标签（保守门控：误替换恒 0）。

#### 4.5 执行记录（2026-10-13，真实稿「鸿溟平台」+ 4 个临时 package.json 夹具项目）

| 场景（节点） | 结果 |
|--------------|------|
| react-antd 项目 auto（控件页按钮组件 0:53164「Buttons按钮/主按钮」） | ✅ `<Button>` + `import { Button } from 'antd'`（修复 I-08 后命中；此前 COMPONENT 节点 role=reusable-component 无法过闸） |
| react-antd auto（执行确认弹窗 0:34348） | ✅ `<Card>` + `import { Card } from 'antd'`；弹窗内节点命名泛化（Rectangle Copy 等）未达保守门控保持原生——符合「误替换 0」设计 |
| shadcn-ui 显式（0:53164） | ✅ `import { Button } from '@/components/ui/button'`，最小骨架无冗余 import |
| 无 UI 库依赖项目 auto | ✅ 保持原生 `<button>`，输出明确 warning「已降级为原生标签」，零组件库标签/import |
| vue-element 项目 auto（0:53164） | ✅ `<el-button>` + `import { ElButton } from 'element-plus'` |
| vue-antdv 项目 auto（0:53164） | ✅ `<a-button>` + `import { Button } from 'ant-design-vue'` |
| 跨框架误选（react 管线选 element-plus） | ✅ FDT-UI-LIB-FRAMEWORK-MISMATCH 触网前失败（r1-qa 冒烟例） |
| antd 产物真实 tsc strict 编译（antd 5.21 + @types/react 18 + @/* 路径） | ✅ exit 0（修复 I-09 后；此前 ButtonProps.color 联合类型冲突） |
| 观察项（非阻断 O-01） | 主按钮实色填充位于内部矩形子节点，根组件节点无 fill，antd/element/antdv 推出的 variant/type 偏保守（text/default 而非 primary）——属 Props 推导增强项，不影响标签/import 门控，列入后续版本 |

## 五、本轮发现的问题与阻塞判断

| Issue | 描述 | 处置 | 阻塞判断 |
|-------|------|------|----------|
| I-01 | GUI 组件库选择器引用的 framework.lib.\* 文案在中英 I18N 表缺失（会显示裸 key），chip 无点击绑定、无 CSS、框架切换不联动 | 已修复并补静态回归 3 例（gui-version.test.ts） | 不修复则阻塞发布；已闭环 |
| I-02 | 工作树存在 4 个 tsc 编译错误（findFileUpwards 未定义、桶导出缺失、batch 入参类型），构建不可用 | 已修复，tsc/build 通过 | 不修复则阻塞发布；已闭环 |
| I-03 | `/api/language` 在主目录配置文件不可写（本机策略 EPERM，`~/.figma-dev-tools/config.json`）时返回 500 | 已降级：内存切换生效即返回 200（persisted:false），语言仍随项目级 config 保存；CLI 显式 `lang set` 保留报错语义 | 非阻塞。同类环境下 token 持久化（token-store 同目录）也可能受系统策略影响，需在发布说明提示：杀软/受控目录拦截时改用 FIGMA_ACCESS_TOKEN 环境变量 |
| I-04 | test-reconcile 在 Windows 以 spawnSync 调 npx.cmd 报 EINVAL | 改为直接用当前 node 执行 node_modules/vitest/vitest.mjs | 非阻塞；已闭环 |
| I-05 | /favicon.ico 404（历史遗留，无实际图标资源） | 记录，未改 | 非阻塞、纯 cosmetic，可后续版本补图标 |
| I-06 | **CLI 全局 `-o,--output` 与 jsx/vue/svelte/weapp/component/lint/structured 七个子命令的 `--output` 同名冲突**：commander 将子命令的 --output 吞入父程序选项袋，子命令 opts.output 恒 undefined——`--output` 静默失效（代码只打到 stdout 不落盘），weapp 默认 './' 丢失 | 新增纯函数 src/cli/sub-output.ts 回收非默认全局值（5 例单测），7 命令 5 个 action 全部接线；真实生成复测落盘成功 | 阻断级（CLI 核心契约失效且静默）；已闭环 |
| I-07 | **列表非法标识符**：Figma 图层名为纯数字（本组容器叫「10」）时，共享结构推断器产出 dataPath/itemAlias=`10`，Svelte 生成 `{#each 10 as 10, 10Index}` 编译失败（WXML wx:for-item 同样非法） | weapp-structure-inferrer 增 safeIdentifier（数字开头加 list/item 前缀、保留字加前缀，5+1 例测试）；svelte/compiler 复测 4/4 OK | 阻断级（产物不可编译）；已闭环 |
| I-08 | **设计系统规范组件无法过组件库门控**：Figma COMPONENT/INSTANCE 精简后 role=reusable-component，Button 规则 roles 仅认 button，名称 35 分独木难支（实测「Buttons按钮/主按钮」组件零映射） | matcher 增 reusable-component 角色通道（组件类型元数据+名称关键词+每规则形态护栏，仅对 button 开放；tabs 等易被路径名污染的规则暂不开放），4 例含护栏反例测试；真实稿命中 `<Button>/<el-button>/<a-button>` | 功能正确性；已闭环。护栏保持「误替换恒 0」约束 |
| I-09 | **antd v5 产物 tsc strict 报错**：根节点映射为库组件后仍摊 `{...rest}`（React.HTMLAttributes 的 color:string 与 ButtonProps.color 窄联合冲突） | 库映射标签不再透传 rest（原生根标签保持透传）；真实 antd 5.21 + @types/react 18 项目 tsc exit 0 | 阻断真实项目可用性；已闭环 |
| I-10 | 生成代码头部版本号硬编码（React v1.4.4、Vue v1.4.0/v1.4.19），与当前版本漂移 | 新增 src/utils/version.ts 单一来源（package.json），3 处头部改用 getToolVersion()；11 个快照仅版本行差异，已更新 | 非阻断但违反版本号单一来源约束；已闭环 |
| O-01 | 主按钮 fill 在内部矩形子节点上，组件根节点无填充，variant/type 推导偏保守（text 而非 primary） | 记录，列入 v1.5 Props 推导增强（根节点聚合装饰子层填充信号） | 非阻断，不影响标签/import 门控 |

**结论：自动化域全部通过（1055/1055、冒烟 83/83、13/13、对账 916/1055 零异常、antd 真实 tsc strict 通过）；I-06~I-10 五个新发现缺陷已全部修复并补回归。剩余仅 §4.2-A（svelte-demo 浏览器目检）、§4.3（Watch 四框架实况）、§4.4（Compare 目检）三项人工签字——完成后 WBS-R1 移交 WBS-R2。**
