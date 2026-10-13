# Changelog

本文件记录 figma-dev-tools 的用户可见变更（格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)）。

## 回填粒度约定（v1.4.20 起执行）

- **从 v1.4.20 开始按版本维护**；更早的版本不逐条回填，仅在文末「历史版本」一行概括，详细开发证据见 `audit-baseline.md` 与 `RELEASE.md`（含逐任务测试数、错误码、发布审计）。
- 条目按 `新增 / 变更 / 修复 / 安全` 分组；面向**用户可见行为**（工具、CLI、产物语义、错误码、依赖）。
- 纯内部重构、测试扩充、文档勘误不写入本文件（见 `audit-baseline.md`）。
- 版本号管理遵循「永不复用」铁律：发布失败也不复用该版本号，回滚走 `npm deprecate` + 补丁版本。

## [1.4.21] - 2026-10-14

### 修复

- 修复微信小程序主包体积核算的工程根口径：此前 `figma-dev weapp` 直接用「输出目录/组件名」核算，该目录通常不含 `app.json`，导致 1.5MB 预警 / 2MB 阻断阈值几乎永不生效；新增 `--project-root <dir>` 显式指定，并在未指定时从输出目录向上（≤6 层）自动探测含 `app.json` 的工程根，探测到后按全主包口径核算并在 CLI 打印实际核算根；含 symlink 的伪 app.json 不认作工程根。
- 修复 GUI 配置向导 `/api/config/complete` 只校验组件库白名单、不校验框架匹配的问题：`framework=react` + `componentLibrary=element-plus`（及 vue 配 shadcn-ui/antd 等跨框架组合）现在返回 400 与 `FDT-UI-LIB-FRAMEWORK-MISMATCH`，不写入 `figma-dev.config.json`（前端选择器本就限制，此为直接构造 API 请求的服务端兜底）。

### 文档

- 完善中英文 README 与 QUICKSTART（v1.4.20 的微信小程序、Svelte、Watch、代码对比、组件库直出等能力补充完整用法与示例）；同步全部用户文档版本号至 v1.4.21。

## [1.4.20 发布后补录]

> 下列条目在 v1.4.20 发布周期内开发完成并已随 v1.4.20 一并发布（2026-10-13 晚发布提交时已包含），因 CHANGELOG 当时保留在 Unreleased 段未改标题，v1.4.21 在此补录归档，功能归属仍为 1.4.20。

### 新增

- **组件库直接映射（保守模式）**：React 与 Vue 生成器新增 `--component-library` / `componentLibrary` 选项（CLI `jsx`/`vue`/`batch` 与 MCP `figma_generate_jsx`/`figma_generate_vue`/`figma_batch_generate` 同步），把高置信语义节点直接替换为组件库标签并聚合 import：
  - React：`shadcn-ui`（`@/components/ui/*` 子路径、`variant="default/outline/destructive"`、Dialog/Tabs/Card/Avatar 组合式骨架 import 与手工调整警告）与 `ant-design`（`antd` 单包聚合，危险按钮 `type="primary" danger`）。
  - Vue：`element-plus`（`el-*` 标签、`El*` 命名 import）与 `ant-design-vue`（`a-*` 标签）；Vue 2 Options API 自动补 `components` 注册，Tabs 激活态按库口径输出（antdv `default-active-key`，element-plus 仅提示 v-model 不臆造 ref）。
  - 默认 `none` 完全保持原生标签；`auto` 必须有真实依赖证据（package.json 的 antd/element-plus/ant-design-vue，或 shadcn 的 `components/ui` 目录与 components.json），无证据降级原生并给 warning；跨框架选择（如 React 传 element-plus）触网前显式报错（FDT-UI-LIB-FRAMEWORK-MISMATCH/UNKNOWN）。
  - 覆盖 Button/Card/Input/Dialog/Tabs/Avatar/Badge 七类，评分需 role+名称+结构中两类以上证据（门控 70/100），62 节点标注集上四库误替换为 0；Dialog/Tabs/Avatar 等组合式组件只替换容器标签并输出手工调整警告，不自动展开多层结构。
- **GUI 向导组件库选择器**：框架偏好步对 React/Vue 显示组件库 chip（React：自动检测/shadcn/ui/Ant Design/不使用；Vue：自动检测/Element Plus/Ant Design Vue/不使用），选择写入项目根目录 `figma-dev.config.json` 的 `componentLibrary`；CLI/MCP 未显式传参时读取该默认值，优先级为「显式参数 > 项目配置 > 不使用」；Svelte/微信小程序/HTML 不显示该选项，切换框架时跨框架取值自动回退自动检测。

### 变更

- **本地生成性能优化**：TokenMatcher 六项查表记忆化、交互推断关键词正则按组合并编译、Prettier 配置按项目根缓存、语义标签选择缓存、import 扫描单趟化、层级修复 visited 路径增删代替集合拷贝、SVG 内联下载受控并发（6 路）。同机同夹具（998 节点）对照：React 生成中位数 373.88ms → 225.67ms（约 -39.6%），微信小程序 50.22ms → 28.32ms（约 -43.6%），weapp/React 耗时比 0.125x；生成产物字节数与优化前完全一致。

### 修复

- 修复 CLI 全局 `-o,--output`（token 目录）与 jsx/vue/svelte/weapp/component/lint/structured 子命令 `--output` 的同名冲突：commander 会把子命令的 `--output` 吞入父程序选项袋，导致**子命令 --output 静默失效**（代码只打印不落盘，weapp 默认目录丢失）；新增 `src/cli/sub-output.ts` 回收非默认全局值并在 7 个命令接线（WBS-R1 QA 实测发现，含 5 例单测）。
- 修复 Figma 图层名为纯数字/保留字（如图层叫「10」）时列表推断产出非法标识符：Svelte 输出 `{#each 10 as 10}` 编译失败、WXML `wx:for-item` 同样非法；新增 safeIdentifier 守卫（数字开头加 list/item 前缀、保留字加前缀），weapp 与 svelte 两条路径同时生效。
- 修复设计系统规范组件（Figma COMPONENT/INSTANCE，精简后 role=reusable-component）无法通过组件库保守门控：新增 reusable-component 角色通道（组件类型元数据 + 名称关键词 + 按规则形态护栏），当前仅对 Button 开放以防路径名污染造成误替换；真实稿已验证 antd / element-plus / ant-design-vue 标签与 import 正确。
- 修复映射为组件库组件的根节点透传 `{...rest}`（React.HTMLAttributes）导致 antd v5 等 tsc strict 报类型冲突（ButtonProps.color 窄联合）；库组件标签不再透传，真实 antd 5.21 + @types/react 18 项目 tsc 编译 0 错。
- 生成代码头部版本号改为从 package.json 动态读取（此前 React 头部硬编码 v1.4.4、Vue v1.4.0/v1.4.19）。
- 修复 GUI 配置向导首屏白屏：i18n 的 `t()` 对数组类文案（如欢迎页特性列表）调用字符串 `.replace` 抛错，且初始化未捕获导致除步骤条外内容与按钮全部不渲染；现非字符串文案原样返回，渲染失败时在页面内显式报错。
- 修复 GUI 框架步骤只显示 React/Vue 两张卡片：Vue 描述文案中的裸 `<script setup lang="ts">` 被浏览器解析为真实脚本元素，连带吞掉其后的 Svelte 4 / 微信小程序 / HTML 卡片；文案已转义，5 张卡片全部正常显示。
- 修复 GUI Token 输入框与 Tokens 输出目录输入框缺少可访问名称（label 关联）的问题。
- 修复 `examples/weapp-demo` 页面 WXSS 使用裸标签选择器（`.filter-switch switch`）触发「Some selectors are not allowed in component wxss」警告，改为类选择器。
- 修复 GUI 向导切换语言在用户主目录配置文件不可写（杀软/受控目录策略导致 EPERM）时整个请求返回 500 的问题：语言内存切换已生效，现降级为本次会话有效并返回 `persisted:false`，语言仍会随项目级 `figma-dev.config.json` 保存，向导不再被阻断。

### 新增（v1.5.0 前置骨架，当前版本不改变生成行为）

- CSS 变量样式方案冻结组件级命名规范（`--color-*`/`--spacing-*`/`--radius-*`/`--font-size-*`/`--font-weight-*`/`--line-height-*`/`--shadow-*`）与 tokens → `:root` 声明、值 → `var()` 映射纯函数；方案在注册表仍为 planned（计划 v1.5.0），不进入 CLI/MCP 枚举。
- 响应式推断骨架：mobile-first（`md:`）/desktop-first（`sm:`）断点类名建议，覆盖列转行、字号、间距、栅格列数四类模式；H5 输出 `env(safe-area-inset-*)`，微信小程序输出 `wx.getSystemInfoSync().safeArea` 建议片段。当前仅产出建议，不写入生成代码。

## [1.4.20] - 2026-10-10

### 新增

- **微信小程序一级支持**：新增 MCP 工具 `figma_generate_weapp` 与 CLI `figma-dev weapp`，输出 WXML/WXSS/JS/JSON 四件套（rpx 单位、375/750 designWidth 推断、列表 wx:for / 条件 wx:if / 事件 bind·catch / 原生组件 scroll-view·swiper·picker·rich-text）。
- **Svelte 4 一级支持**：新增 MCP 工具 `figma_generate_svelte` 与 CLI `figma-dev svelte`；`figma_batch_generate --framework svelte` 同步支持。默认 Svelte 4 语法（`export let` props、`on:click/input/submit`、`{#each}`、`{#if}`），Svelte 5 runes 仅在注释中给迁移建议。
- **Watch 模式（MCP）**：新增 `figma_watch_start` / `figma_watch_stop` / `figma_watch_status`。以 cache bypass 粗筛文件 lastModified/version（默认 5s），变更后自动重新生成；429 指数退避（10s 起、×2、封顶 2min）；单客户端会话上限 5 个，会话仅存于 MCP 进程内存。
  - 写盘为显式 opt-in：`write=true` 必须提供 `outputDir`；落盘前自动备份到 `.figma-dev-backup/<时间戳>/`，并保留 `figma-dev:preserve:start/end` 用户区块；JSON 用户字段经 `<name>.figma.json` 旁路按 JSON Pointer 合并。
- **代码差异对比**：新增 `figma_compare_code`，现状代码（文本/项目路径/多产物）与 Figma 最新生成结果对比，输出 unified diff + 行级统计；对比前默认 Prettier 归一化。
- **WXSS 还原度报告（方案 B）**：`figma_generate_weapp` 返回属性覆盖率（20 个承诺属性），CLI 与 MCP 均展示。
- **主包体积核算**：`--project-root` / `projectRoot` 下按 app.json 递归统计主包/分包，>1.5MB 预警、>2MB 阻断（CLI 退出码 2），并给图片资源分包建议。
- **工程配置建议**：CLI 落盘生成 `app.suggestion.json` / `project.config.suggestion.json`，永不自动改写工程文件。
- **示例工程**：`examples/weapp-demo`（图片列表+表单+条件块可运行页面）、`examples/svelte-demo`（Svelte 4 + Vite 最小工程）。

### 变更

- 样式渲染：Svelte 的 `css-modules` 落地为编译器 scoped `<style>`，**不承诺 CSS Modules 的 hash/composes 语义**（composes 会被静态展开）；Svelte 仅允许 `tailwind/unocss/css-modules`，其余样式触网前报错。
- MCP 工具总数 23 → **28**；CLI 命令 32 → **33**（新增 `svelte`）。
- `Framework` 类型与 `figma_batch_generate.framework` 枚举扩展为 `react/vue/svelte`；样式框架矩阵登记 Svelte 三组合。
- GUI 配置向导框架选项新增 **Svelte 4** 与**微信小程序**。

### 修复

- 修复生成器同层节点 class 计数器因上下文浅拷贝不跨兄弟递增、导致同层样式被末位节点覆盖的问题（由 WXSS 覆盖率闸门暴露）。
- 修复 Svelte 生成产物中 void 元素（`<input>` 等）未自闭合、空 children 导致非法闭合标签的问题（由 svelte/compiler 门禁暴露）。
- 修复 Figma 文本样式模块的 FigmaColor 导入与 solid fill 窄化类型错误。

### 安全

- Watch 写盘路径全部经越权校验（拒绝绝对路径与 `../` 穿越）；会话生命周期绑定 MCP 进程，SIGTERM/disconnect 清理全部定时器。
- `figma_compare_code`：路径越权拒绝（FDT-COMPARE-PATH-TRAVERSAL）、总输入 512KB 上限、NUL 字节二进制嗅探拒绝。
- 微信 rich-text nodes 的 href 走协议白名单（http/https/mailto/tel/相对/锚点），拒绝 `javascript:`/`data:`/`vbscript:`；文本一律走数据叶子，不拼 HTML 字符串。

## 历史版本（≤1.4.19）

v1.4.19 及更早版本的逐条变更不在本文件回填；需查证请参阅：

- npm 发布记录：<https://www.npmjs.com/package/figma-dev-tools?activeTab=versions>
- 仓库开发审计：`audit-baseline.md`（逐任务测试数/错误码/闸门结果）
- 发布与回滚策略：`RELEASE.md`

[Unreleased]: https://gitee.com/shanxi-youcha/figma-dev-tools/compare/v1.4.20...HEAD
[1.4.20]: https://gitee.com/shanxi-youcha/figma-dev-tools/releases/tag/v1.4.20
