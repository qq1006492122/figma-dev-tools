# 🎨 Figma Dev Tools v1.4.20

> Figma → 任意前端框架 设计到代码一键转换 MCP 服务器

**[English](https://gitee.com/shanxi-youcha/figma-dev-tools/blob/master/README.en-US.md)** | **中文**

**打通 Figma 设计与前端研发的完整工具链**，支持 🖥️ GUI 可视化配置向导、设计 Tokens 智能提取、高保真组件生成（React/Vue/Svelte/HTML 等）、资源自动下载、跨编辑器 MCP 集成。专为 AI Agent 优化，解决 div soup、上下文爆炸、hex 写死、资源路径处理、Flex 布局变形、无障碍缺失、响应式适配、**付费墙兜底**等核心痛点。

---

## ✨ v1.4.4 付费墙兜底 + 高保真还原 + 性能优化

| 优化项 | 说明 | 类别 |
| --- | --- | --- |
| 🧱 **付费墙浏览器兜底** | `BrowserFallbackService`：API 付费墙失败时自动 Playwright 截图保底 | 还原 |
| 🤖 **视觉近似模式** | `VisualApproximationService`：截图喂 VLM 生成近似代码骨架（~75%）+ TODO 清单 | 还原 |
| 🎯 **还原度评分** | `figma_verify_fidelity`：Figma 截图 vs 代码截图像素 diff + 量化评分 | 还原 |
| 📏 **DPR/屏幕尺寸感知** | 截图按 1x/2x/3x 输出，匹配不同渲染差异 | 还原 |
| 📐 **绝对定位还原** | 修复 `layoutMode=NONE` 节点浮动元素旋转/偏移丢失 | 还原 |
| 🎨 **渐变/多重阴影/内阴影** | 修复渐变填充、多重阴影、内阴影降级为纯色 | 还原 |
| ✂️ **mask/clip-path** | 修复圆角头像、异形裁切失真 | 还原 |
| ➖ **strokeDash 虚线** | 修复虚线/点线边框变实线 | 还原 |
| 🔤 **富文本多段样式** | 修复 `styleOverrideTable` 未解析导致样式单一 | 还原 |
| 🌍 **i18n 错误信息** | 硬编码中文改为 i18n key，按 GUI 语言输出 | 还原 |
| 🚀 **浏览器实例池** | `BrowserPool` 复用实例，跳过 1-3s 启动，空闲 60s 回收 | 性能 |
| 💾 **截图缓存** | `ScreenshotCache`：LRU + TTL，重复请求秒级返回 | 性能 |
| ⏱️ **分级超时** | 导航/渲染/截图分别 20s/10s/5s，精准定位超时阶段 | 性能 |
| 🧠 **混合智能等待** | `domcontentloaded` + 画布可见 + 网络空闲，解决 SPA 问题 | 性能 |
| 🔁 **指数退避重试** | 网络/超时自动重试（2 次，500ms 指数退避） | 性能 |
| 🔥 **预热机制** | `warmup()` 启动时预启动浏览器，消除首次延迟 | 性能 |

---

## 📜 版本历史

| 版本 | 主题 | 要点 |
| --- | --- | --- |
| **v1.4.19** | 多样式 × React/Vue + 批量生成 + 智能推断 | 9 套样式可插拔；`figma_generate_vue` Vue SFC 一级入口；`figma_batch_generate` 语义区块拆分；T19 自定义组件库映射；T21/T22 智能推断建议（Grid/图标/暗色/动效 + 交互骨架/数据驱动/语义命名） |
| **v1.4.18** | 多样式管线 + TS Props + DTCG + 企业适配 | 样式注册表（Tailwind/UnoCSS/CSS Modules）；Component Properties → TS Props；W3C DTCG Tokens；`FIGMA_CA_CERT_PATH` 企业 CA；构建器自动检测资源落位；import 自动整理；`--help` 双语示例 |
| **v1.4.17** | 安全加固 + 版本发布 | npm 版本锁定 + tgz 双重校验；GUI 127.0.0.1 + Origin 白名单；升级临时目录 try/finally 清理 |
| **v1.4.16** | 版本占位发布 | 代码与 v1.4.15 一致 |
| **v1.4.15** | `--update` EBUSY 加固 | Windows Git Bash 统一 `npm.cmd`/`cmd.exe`；robocopy `/MIR` 改 `/E`；`execFileSync` 补 `shell: true` |
| **v1.4.14** | OCR 文本提取 | `figma_ocr_extract`：原生 JSON 优先 + tesseract.js OCR 兜底（chi_sim+eng）；SSRF 防护 |
| **v1.4.13** | 回归加固 | `getErrorInfo` null 防御归一化；smoke 回归用例 ×4 |
| **v1.4.12** | EBUSY 兜底 + robocopy | robocopy 退出码 <8 视为成功；Windows cp 改 `copy /Y`；npm pack tgz 覆盖 |
| **v1.4.11** | i18n 路径修复 + Token 交互 | i18n 路径错误修复；`FIGMA_ACCESS_TOKEN` 环境变量；password→input 降级 |
| **v1.4.10** | 版本号统一 + figd_ Token | 修复 figd_ 认证（X-Figma-Token 头）；版本号统一从 package.json 读取 |
| **v1.4.9** | figd_ Token 认证 | 修复 figd_ 类型 Token 必须用 X-Figma-Token 头 |
| **v1.4.8** | EBUSY 兼容 | `--update` 自动 robocopy 回退；CLI 文档补全 |
| **v1.4.7** | Token 验证优化 | 失败显示具体原因（401/403/429）；错误消息全面国际化 |
| **v1.4.4** | 付费墙兜底 + 性能优化 | 浏览器兜底截图、视觉近似、还原度评分、实例池/缓存/分级超时 |
| **v1.4.3** | 稳定性与安全 | GUI 请求体防护、循环引用检测、递归深度保护、缓存一致性 |
| **v1.4.1** | 代码质量 | 零 any 类型、oxlint 零警告 |
| **v1.4.0** | 重磅更新 | XSS 防护、智能层级修复、SVG 内联、动画检测、本地加密缓存、评分算法优化、H5 适配、Token 安全存储 |
| **v1.3.x** | 基础能力建设 | GUI 可视化配置、i18n、无障碍增强、Flex 修复、设计系统对齐、响应式推断、设计规范检查 |

---

## ✨ 功能亮点

| 特性 | 说明 | 版本 |
| --- | --- | --- |
| 🖥️ **GUI 可视化配置向导** | 浏览器图形界面：欢迎页→语言→Token 验证→编辑器检测一键安装→框架偏好→完成 | **v1.3.0** |
| 🔗 **23 个 MCP 工具** | URL 解析 → Token 提取 → 组件生成 → 资源下载 → 付费墙兜底 → 还原度校验全流程 | v1.4.20（npm latest v1.4.19 为 22 个） |
| 🧠 **框架无关结构化数据** | 输出 id/name/role/type/size/layout/styles/text/asset/children JSON，支持任意框架 | v1.1.0 |
| ⚛️ **React + Tailwind 一级支持** | 语义标签 + Tailwind 映射 + `cn()` 合并 + TODO 标记，一键生成高保真 TSX | v1.3.2 |
| 🔧 **Flex 布局自动修复** | 智能修复图标变形、文本截断、溢出等 Flex 问题 | v1.3.2 |
| ♿ **无障碍增强** | 自动添加语义标签、alt、ARIA 属性 | v1.3.2 |
| 🎨 **设计系统对齐** | 自动匹配颜色/间距/字体/圆角/阴影变量 | v1.3.2 |
| 📱 **响应式推断** | 智能推断断点，提供响应式前缀建议 | v1.3.2 |
| ✅ **设计规范预检** | 生成代码前检查设计稿质量并给出修复建议 | v1.3.2 |
| 🧠 **智能层级精简** | 自动扁平化冗余 GROUP/FRAME，消除 ~60% 无意义嵌套 | v1 |
| 📊 **渐进式上下文** | metadata 概览（~4KB）→ designContext 详情，避免上下文爆炸 | v1.2 |
| 🎯 **多级 Token 匹配** | codeSyntax.WEB → 精确 hex → CIE76 色差模糊 → @theme 扩展建议 | v1 |
| 🖼️ **资源自动管线** | 检测图片/SVG → 下载到 public/ → SVGO 优化 → 生成 `publicCdnUrl()` 引用 | v1.2 |
| 🧩 **SVG Sprite 生成** | 批量图标合并为 Sprite，支持 CSS color 控制颜色 | v1.3.2 |
| 🌍 **i18n 国际化** | 中英文双语，`figma-dev lang switch` 切换 | v1.3.2 |
| 🔐 **安全 Token 存储** | 系统密钥链安全存储 Token | v1.3.2 |
| 💻 **CLI 命令行** | 22 个顶层命令（32 条命令声明）支持脚本和 CI/CD 集成 | v1 (gui v1.3.0) |
| 🔄 **8 个编辑器支持** | Trae/VS Code/Cursor/Windsurf/Claude Desktop/Zed/Cline/Roo Code 一键安装 | v1 (gui v1.3.0) |
| 🚀 **零配置启动** | `npx -y figma-dev-tools --figma-api-key=xxx` 直接运行 | v1.2 |
| 🔍 **OCR 文本提取** | 原生 JSON 优先（零依赖 100% 准确）+ tesseract.js OCR 兜底（中英文、SSRF 防护） | **v1.4.14** |
| 🎴 **样式方案可插拔** | 注册表架构；React/Vue 均支持 Tailwind/UnoCSS/CSS Modules（含 `*.module.css` 旁路） | **v1.4.18** |
| 🧩 **Component Properties → TS Props** | 自动读取 Figma 组件属性，React 生成 `Props interface`，Vue3 生成 `defineProps` + `withDefaults` | **v1.4.18** |
| 🪙 **W3C DTCG Tokens** | 支持标准 DTCG（`$type`/`$value`）JSON，全类型映射 + 内置结构校验 | **v1.4.18** |
| 🏢 **企业网络适配** | `FIGMA_CA_CERT_PATH` 自定义 CA 根证书；构建器自动检测资源落位 | **v1.4.18** |
| 📐 **导入自动整理** | Prettier 前自动整理 import（补齐/移除未用/幂等） | **v1.4.18** |
| 🎻 **多样式 × React/Vue** | 9 套样式可插拔（Tailwind/UnoCSS/CSS Modules/styled/emotion/less/sass/vanilla-extract/panda） | **v1.4.19** |
| 📦 **批量生成 + 语义区块拆分** | `figma_batch_generate` 按语义区域拆块生成 + barrel 索引 | **v1.4.19** |
| 🧠 **智能推断（仅建议）** | Grid/图标/暗色/动效 + 交互骨架 + 数据驱动示例 + 语义命名，`skipEnhancements` 一键关闭 | **v1.4.19** |
| 📱 **微信小程序生成（开发版）** | Figma → WXML/WXSS/JS/JSON 四件套，view/text/image 标签映射、px→rpx 适配；能力持续补齐中 | **v1.4.20** |

---

## 🚀 快速开始

> 📚 详细指南见 **[QUICKSTART.md](https://gitee.com/shanxi-youcha/figma-dev-tools/blob/master/QUICKSTART.md)**（中文）/ **[QUICKSTART.en-US.md](https://gitee.com/shanxi-youcha/figma-dev-tools/blob/master/QUICKSTART.en-US.md)**（英文）。

### 三步上手

**① 启动 GUI 配置（推荐 ⭐）**

```bash
npx figma-dev-tools gui
```

浏览器自动打开，按引导完成：语言选择 → Token 配置（自动验证）→ 编辑器检测一键安装 → 框架偏好 → 完成。

**② 或零配置 npx 直接运行**

```bash
npx -y figma-dev-tools --figma-api-key=your-figma-token-here
```

**③ 或一键安装（长期使用）**

```bash
npx figma-dev-tools install   # 自动检测 8 个编辑器并配置 MCP
```

### 获取 Figma Token

1. 登录 [Figma](https://www.figma.com/) → 右上角头像 → **Settings** → **Account**
2. **Personal access tokens** → **Generate new token** → 勾选 **File content (Read only)**
3. 复制 Token（⚠️ 只显示一次）

> Token 可通过 GUI 界面输入（推荐）、`figma-dev token set` 安全存储、`--figma-api-key` 参数、`.env` 文件或 MCP env 配置传入。详见 [QUICKSTART.md](https://gitee.com/shanxi-youcha/figma-dev-tools/blob/master/QUICKSTART.md)。

### 第一个示例

在 AI 编辑器中直接对话：

```
帮我用 figma-dev-tools 还原这个 Figma 设计稿：
https://www.figma.com/design/xxxxx/MyProject?node-id=23-11032
场景名：landing-page  组件名：HeroSection
```

AI 将自动执行：`figma_lint_design` → `figma_parse_url` → `figma_get_metadata` → `figma_get_screenshot` → `figma_generate_jsx` → `figma_download_assets`。

### CLI 快速体验

```bash
figma-dev gui                    # GUI 配置面板
figma-dev info "<figma-url>"     # 查看文件信息
figma-dev lint "<figma-url>"     # 设计规范预检
figma-dev jsx "<figma-url>" --name HeroSection --scene landing-page
figma-dev vue "<figma-url>" --name HeroSection --vue-version 3
figma-dev svelte "<figma-url>" --name HeroCard --style tailwind   # Svelte 4（tailwind/unocss/css-modules）
figma-dev batch "<figma-url>" --prefix Landing --framework react
figma-dev structured "<figma-url>" --format json --output ./data.json
figma-dev sync "<figma-url>" --format oklch --output ./src/styles
figma-dev token set              # 安全存储 Token
figma-dev lang switch            # 切换中英文
```

---

## 🔧 MCP 工具参考

共 **23 个 MCP 工具**（v1.4.20 开发版代码实测，以冒烟测试枚举为发布闸门；npm latest v1.4.19 为前 22 个，不含 `figma_generate_weapp`），按使用流程排列：

| # | 工具名称 | 功能 | 关键参数 | 版本 |
| --- | --- | --- | --- | --- |
| 1 | `figma_parse_url` | 解析 Figma URL，提取 fileKey/nodeId | `url` | v1 |
| 2 | `figma_validate_token` | 验证 Figma Token 有效性 | `tokenProfile` | v1 |
| 3 | `figma_get_file` | 获取文件基本信息（页面列表、组件数） | `fileKey` / `figmaUrl` | v1 |
| 4 | `figma_list_components` | 列出 Components/ComponentSets | `fileKey` | v1.2 |
| 5 | `figma_get_metadata` | 高层结构概览（~4KB，避免上下文爆炸） | `fileKey/nodeId/depth` | v1.2 |
| 6 | `figma_get_design_context` | 精简设计上下文（层级扁平+语义标注） | `fileKey/nodeId/maxDepth` | v1.2 |
| 7 | `figma_get_screenshot` | 获取节点高清截图 | `fileKey/nodeId/scale` | v1 |
| 8 | `figma_get_structured_data` | ⭐ 框架无关结构化 JSON | `fileKey/nodeId/maxDepth` | v1.1.0 |
| 9 | `figma_lint_design` | 设计规范预检 | `fileKey/nodeId/maxDepth` | **v1.3.2** |
| 10 | `figma_generate_jsx` | ⭐ 一键生成 React TSX（9 套样式、TS Props、智能推断、组件库直接映射） | `fileKey/nodeId/componentName/styleFormat/componentLibrary/inference` | v1.4.19 |
| 11 | `figma_generate_component` | 基础组件生成（旧版，推荐 generate_jsx） | `fileKey/nodeId/styleFormat` | v1 |
| 12 | `figma_generate_vue` | ⭐ Vue SFC 生成（Vue3 setup / Vue2 Options、组件库直接映射） | `fileKey/nodeId/componentName/vueVersion/styleFormat/componentLibrary` | **v1.4.19** |
| 13 | `figma_generate_svelte` | ⭐ Svelte 4 SFC 生成（export let/on:事件/{#if}/{#each}；样式限 tailwind/unocss/css-modules） | `fileKey/nodeId/componentName/typescript/styleFormat/inference` | **v1.4.20** |
| 14 | `figma_batch_generate` | ⭐ 整页批量生成（语义区块拆分 + barrel，react/vue/svelte） | `nodeId/framework/styleFormat/componentLibrary/componentNamePrefix` | **v1.4.19** |
| 15 | `figma_watch_start` | 🔄 启动 Watch（5s bypass 粗筛→变更自动再生成；write+outputDir 才落盘） | `fileKey/nodeId/framework/pollIntervalMs/write/outputDir` | **v1.4.20** |
| 16 | `figma_watch_stop` | 停止 Watch 会话（幂等，清理定时器） | `sessionId` | **v1.4.20** |
| 17 | `figma_watch_status` | 查询 Watch 会话（不传 sessionId 列出全部，上限 5） | `sessionId` | **v1.4.20** |
| 18 | `figma_compare_code` | 现状代码 vs Figma 最新生成 unified diff（Prettier 归一化/512KB/越权拒绝） | `framework/currentCode|currentFilePath|currentFiles/figmaUrl` | **v1.4.20** |
| 19 | `figma_generate_weapp` | 📱 微信小程序四件套 WXML/WXSS/JS/JSON（开发版，能力补齐中） | `fileKey/nodeId/componentName/designWidth/unit/isPage` | **v1.4.20** |
| 20 | `figma_extract_tokens` | 提取设计 Tokens（颜色/间距/字体） | `fileKey/nodeId/colorFormat/spacingUnit` | v1 |
| 21 | `figma_generate_styles` | 生成样式文件（CSS/Tailwind/JSON/DTCG） | `fileKey/outputFormat` | v1.4.18 |
| 22 | `figma_sync_to_project` | 同步 Tokens 到项目文件 | `fileKey/format/output` | v1.4.18 |
| 23 | `figma_download_assets` | 下载图片/SVG 资源（SVGO 优化） | `fileKey/sceneName/assetNodeIds/scale` | v1 |
| 24 | `figma_create_icon_sprite` | 生成 SVG Sprite + TS 类型 | `svgDir/outputPath/prefix` | **v1.3.2** |
| 25 | `figma_dev_fallback_status` | 查询付费墙兜底系统状态（Playwright 可用性/配置） | 无 | **v1.4.4** |
| 26 | `figma_dev_fallback_capture` | 触发浏览器兜底截图（付费墙失败时保底） | `figmaUrl/devicePixelRatio/framework` | **v1.4.4** |
| 27 | `figma_verify_fidelity` | 还原度校验（像素 diff + 评分） | `fileKey/nodeId` | **v1.4.4** |
| 28 | `figma_ocr_extract` | OCR 文本提取（JSON 优先 + tesseract.js 兜底） | `fileKey/nodeId/figmaUrl` | **v1.4.14** |

> 说明：动画/动效检测与交互逻辑提取**不是独立 MCP 工具**，由 `animation-detector.ts`、`interaction-inferrer.ts` 在代码生成管线内自动运行，结论以增强报告/注释形式随生成结果返回。

### 常用工具简要参数

<details>
<summary><b><code>figma_generate_jsx</code></b>（v1.4.19 增强版，最常用）</summary>

```typescript
{
  figmaUrl?: string;           // Figma 链接（可替代 fileKey+nodeId）
  fileKey?: string;
  nodeId?: string;
  componentName?: string;      // 组件名（如 HeroSection）
  sceneName?: string;          // 场景名（用于资源路径）
  maxDepth?: number;           // 默认 15（1-30）
  styleFormat?: 'tailwind' | 'unocss' | 'css-modules' | 'styled'
              | 'emotion' | 'less' | 'sass'
              | 'vanilla-extract' | 'panda';
  unocssAttributify?: boolean; // UnoCSS 归因模式，仅 styleFormat=unocss
  componentLibrary?: 'auto' | 'none' | 'shadcn-ui' | 'ant-design';
                               // v1.4.20：语义节点直接替换为库组件；auto 按依赖检测
  typescript?: boolean;        // 默认 true
  inference?: {                // 智能推断四项分项开关（默认全开）
    grid?: boolean;
    icons?: boolean;
    darkMode?: boolean;
    motion?: boolean;
  };
  skipEnhancements?: boolean;  // 跳过全部增强
  skipLintCheck?: boolean;
  tokenProfile?: string;
}
```
</details>

<details>
<summary><b><code>figma_generate_vue</code></b>（v1.4.19 新，Vue SFC 一级入口）</summary>

```typescript
{
  figmaUrl?: string;  fileKey?: string;  nodeId?: string;
  componentName?: string;  sceneName?: string;
  vueVersion?: 2 | 3;                     // 默认 3：script setup；2：Options API
  styleFormat?: 'tailwind' | 'unocss' | 'css-modules' | 'less' | 'sass';
  componentLibrary?: 'auto' | 'none' | 'element-plus' | 'ant-design-vue';
                                          // v1.4.20：语义节点直接替换为库组件
  unocssAttributify?: boolean;  typescript?: boolean;  // 默认 true
  inference?: { grid?: boolean; icons?: boolean; darkMode?: boolean; motion?: boolean };
  skipEnhancements?: boolean;  skipLintCheck?: boolean;
}
```
</details>

<details>
<summary><b><code>figma_batch_generate</code></b>（v1.4.19 新，整页批量生成）</summary>

```typescript
{
  figmaUrl?: string;  fileKey?: string;
  nodeId: string;              // 页面/大 Frame 根节点（必填）
  nodeIds?: string[];          // 显式区块 ID；省略=自动拆分
  componentNamePrefix?: string;// 如 'Landing' → LandingHeader/LandingHero
  framework?: 'react' | 'vue' | 'svelte'; // 默认 react
  vueVersion?: 2 | 3;  styleFormat?: string;
  componentLibrary?: 'auto' | 'none' | 'shadcn-ui' | 'ant-design'
                   | 'element-plus' | 'ant-design-vue'; // 按 framework 校验，跨框架触网前报错
  unocssAttributify?: boolean;
  inference?: { grid?: boolean; icons?: boolean; darkMode?: boolean; motion?: boolean };
  skipEnhancements?: boolean;
}
```
</details>

> 💡 其余工具的完整参数说明见 [QUICKSTART.md](https://gitee.com/shanxi-youcha/figma-dev-tools/blob/master/QUICKSTART.md) 或 [SKILL.md](https://gitee.com/shanxi-youcha/figma-dev-tools/blob/master/SKILL.md)。

### 自定义组件库映射（v1.4.19）

在项目根放置 `.figma-dev/components.json`（draft-07 schema），可按 Figma 节点名/组件 key 指定导入的库组件（如 shadcn/ui、Ant Design、Element Plus）与 props 透传规则。详见 [QUICKSTART.md](https://gitee.com/shanxi-youcha/figma-dev-tools/blob/master/QUICKSTART.md)。

### 组件库直接生成（v1.4.20，WBS-P2-11/12/13）

`jsx`/`vue`/`batch` 命令与 MCP 三工具新增 `componentLibrary`（CLI：`--component-library`），把语义节点**直接替换**为库组件标签与 import，不再只给建议：

| 取值 | 适用框架 | 标签形态 |
| --- | --- | --- |
| `shadcn-ui` | React | `@/components/ui/*` 子路径 import（含 Dialog/Tabs 组合骨架） |
| `ant-design` | React | `antd` 单包聚合，危险按钮追加 `danger` |
| `element-plus` | Vue | `el-*` kebab 标签单包 import，Vue2 Options API 自动补 components |
| `ant-design-vue` | Vue | `a-*` kebab 标签，Tabs 非受控 `default-active-key` |

- `auto`（默认）/`none`：`auto` 按项目真实依赖（package.json 三类 deps + shadcn 的 components/ui 目录/components.json）检测，无证据降级为原生标签并给出 warning；
- 保守门控：节点需 role+名称两类证据（置信度 ≥70/100），误替换恒为 0；Dialog/Tabs/Avatar 仅替换容器标签并输出手工调整警告，不自动展开多层 DOM；
- 跨框架/非法值在**触网前**报错（`FDT-UI-LIB-FRAMEWORK-MISMATCH` / `FDT-UI-LIB-UNKNOWN`）；Svelte 管线不适用该参数。

```bash
figma-dev jsx "<url>" --component-library shadcn-ui
figma-dev vue "<url>" --component-library element-plus
figma-dev batch "<url>" --framework vue --component-library auto
```

### 🧭 框架 × 样式支持矩阵（v1.4.19）

| 样式方案（styleFormat） | React | Vue 3 | Vue 2 | 说明 |
| --- | --- | --- | --- | --- |
| Tailwind（默认） | ✅ | ✅ | ✅ | tailwind-v4 映射；React 经 `cn()` 合流 |
| UnoCSS（`unocss`） | ✅ | ✅ | ✅ | `unocssAttributify` 可开归因模式 |
| CSS Modules（`css-modules`） | ✅ | ✅ | ✅ | 旁路 `*.module.css`；语义类名、`composes` 复用 |
| Styled Components（`styled`） | ✅ | — | — | 模板字符串 + ThemeProvider 占位 |
| Emotion（`emotion`） | ✅ | — | — | `css` prop / `css()` 对象样式 |
| Less（`less`） | ✅ | ✅ | ✅ | 变量/嵌套/mixin；旁路 `.less` |
| Sass/SCSS（`sass`） | ✅ | ✅ | ✅ | 变量/嵌套/mixin；旁路 `.scss` |
| vanilla-extract | ✅ | — | — | 类型安全零运行时 `.css.ts` |
| Panda CSS（`panda`） | ✅ | — | — | `css()` 对象 + cva/recipe |
| inline-styles | ✅¹ | — | — | 仅旧管线 `figma_generate_component` |
| CSS 变量（`css-variables`） | 🔜 | 🔜 | 🔜 | 计划 v1.5.0 |

> ¹ 仅旧管线支持。不支持的组合会在触网前经 zod/注册表双重校验返回可读错误。微信小程序 `figma_generate_weapp` 已在 v1.4.20 开发版提供（WXML/WXSS/JS/JSON，能力持续补齐）；uni-app/Taro 计划后续版本 experimental 接入。

---

## 💻 CLI 命令参考

```bash
npm install -g figma-dev-tools
figma-dev <command> [options]
# 或 npx 直接运行
npx figma-dev-tools <command> [options]
```

| 命令 | 功能 | 常用选项 | 版本 |
| --- | --- | --- | --- |
| `gui` | 🖥️ GUI 可视化配置面板 | `--port <n>` | **v1.3.0** |
| `install` | 一键安装 MCP 配置到各编辑器 | - | v1 |
| `uninstall` | 卸载已安装的 MCP 配置 | - | v1 |
| `validate` | 验证 Token | - | v1 |
| `wizard` | 交互式配置向导 | `--gui` | v1.3.0 |
| `lang` | 🌍 语言设置（set/list/switch） | `set <lang>` / `switch` | **v1.3.2** |
| `token` | 🔐 Token 安全管理 | `set -t <token>` / `list` / `delete` | **v1.3.2** |
| `info` | 查看文件信息 | - | v1 |
| `lint` | ✅ 设计规范预检 | `--depth <n>` `--format md/json` | **v1.3.2** |
| `metadata` | 获取元数据概览 | `--depth <n>` | v1.1.0 |
| `structured` | 框架无关结构化数据 | `--depth <n>` `--format pretty/json` `--output <file>` | v1.1.0 |
| `jsx` | ⭐ 生成 React TSX（9 套样式、TS Props、智能推断、组件库直接映射） | `--name` `--scene` `--style <9 套>` `--component-library <auto/none/shadcn-ui/ant-design>` `--no-smart-*` | **v1.4.19** |
| `vue` | ⭐ 生成 Vue SFC | `--vue-version 2\|3` `--style` `--component-library <auto/none/element-plus/ant-design-vue>` `--no-smart-*` | **v1.4.19** |
| `batch` | ⭐ 整页批量生成 | `--prefix` `--framework react\|vue\|svelte` `--component-library` `--out <dir>` | **v1.4.19** |
| `weapp` | 📱 微信小程序四件套（开发版） | `--name` `--output` `--design-width` `--unit rpx\|px` `--page` | **v1.4.20** |
| `component` | 基础组件生成（旧版，推荐 jsx/vue） | `--name` `--style` | v1 |
| `assets` | 下载资源（SVGO 优化，按构建器落位） | `--scene` `--scale <n>` `--bundler auto\|vite\|webpack\|nextjs\|remix` | **v1.4.18** |
| `sync` | 同步 Tokens（含 DTCG） | `--format oklch` `--output-format css\|tailwind\|json\|dtcg\|all` | **v1.4.18** |
| `screenshot` | 获取截图 | `--scale 2` `--download <dir>` | v1 |
| `mcp` | 启动 MCP 服务器（stdio 模式） | - | v1 |
| `--update` | 自动升级到最新版本 | - | v1.4.8 |
| `-v` / `--ver` | 显示版本号 | - | v1.4.8 |

### CLI 核心示例

```bash
# 🖥️ GUI 配置面板
figma-dev gui

# ⚛️ 生成 React + Tailwind 组件
figma-dev jsx "https://www.figma.com/design/xxx/yyy?node-id=23-11032" \
  --name HeroSection --scene landing-page

# 🟢 生成 Vue3 SFC（UnoCSS 归因模式）
figma-dev vue "https://www.figma.com/design/xxx/yyy?node-id=23-11032" \
  --name HeroSection --vue-version 3 --style unocss --attributify

# 🧩 直接映射为 shadcn/ui 组件（auto 也可按当前项目依赖自动判定）
figma-dev jsx "https://www.figma.com/design/xxx/yyy?node-id=23-11032" \
  --name SignupForm --component-library shadcn-ui

# 📦 整页批量生成（语义区块拆分）
figma-dev batch "https://www.figma.com/design/xxx/yyy" \
  --prefix Landing --framework react --out ./src/components

# 🧠 关闭部分智能推断
figma-dev jsx "<figma-url>" --name HeroSection --no-smart-dark --no-smart-motion

# 🪙 同步 W3C DTCG Tokens
figma-dev sync "<figma-url>" --output-format dtcg

# 🏢 企业内网自定义 CA
$env:FIGMA_CA_CERT_PATH="C:\certs\corporate-root-ca.pem"   # PowerShell
export FIGMA_CA_CERT_PATH=/etc/ssl/corp-ca.pem              # bash/zsh

# 📊 获取结构化数据（JSON 输出到文件）
figma-dev structured "<figma-url>" --format json --output ./data.json

# 🖼️ 批量下载资源
figma-dev assets "<figma-url>" --scene landing-page --nodes "23-11032,23-11050" --scale 2

# 🔐 Token 与语言
figma-dev token set -t figd_your_token_here
figma-dev lang set zh-CN
figma-dev -l en-US sync --help   # 英文帮助示例
```

---

## 🖥️ 支持的编辑器（8 个）

| 编辑器 | 一键安装 | GUI 自动检测 | 配置格式 | 手动配置路径 |
| --- | --- | --- | --- | --- |
| **Trae** | ✅ | ✅ | mcpServers | `.mcp.json` 或 User Settings |
| **VS Code** | ✅ | ✅ | mcpServers | `.vscode/mcp.json` 或 User Settings |
| **Cursor** | ✅ | ✅ | mcpServers | `~/.cursor/mcp.json` 或项目 `.cursor/mcp.json` |
| **Windsurf** | ✅ | ✅ | mcpServers | `~/.codeium/windsurf/mcp_config.json` |
| **Claude Desktop** | ✅ | ✅ | mcpServers | `%APPDATA%\Claude\claude_desktop_config.json`（Win） |
| **Zed** | ✅ | ✅ | **mcp_servers** | `~/.zed/settings.json` |
| **Cline** | ✅ | ✅ | mcpServers | `cline_mcp_settings.json` |
| **Roo Code** | ✅ | ✅ | mcpServers | `mcp_settings.json` |

> 💡 运行 `figma-dev gui` 可自动检测已安装编辑器并一键配置。

### MCP 配置模板

```json
{
  "mcpServers": {
    "figma-dev-tools": {
      "command": "npx",
      "args": ["-y", "figma-dev-tools", "--figma-api-key=figd_your_token_here"]
    }
  }
}
```

> Zed 需将 `mcpServers` 改为 `mcp_servers`。详见 [QUICKSTART.md](https://gitee.com/shanxi-youcha/figma-dev-tools/blob/master/QUICKSTART.md)。

---

## ⚙️ 配置说明

### 环境变量（.env）

```env
FIGMA_ACCESS_TOKEN=your-figma-token-here     # 必需：Figma Token
FIGMA_OAUTH_TOKEN=                           # 可选：OAuth Token（企业版）
FIGMA_API_BASE=https://api.figma.com        # 可选：自定义 API 端点
FIGMA_DEFAULT_SCALE=2                        # 可选：默认导出倍率（1-4）
FIGMA_DEFAULT_COLOR_FORMAT=oklch             # 可选：默认颜色格式
FIGMA_ASSETS_BASE_DIR=public                 # 可选：资源输出目录
FIGMA_CDN_PREFIX=/                           # 可选：CDN 前缀
FIGMA_DEFAULT_LANG=zh-CN                     # 可选：默认语言（zh-CN/en-US）
FIGMA_GUI_PORT=54321                         # 可选：GUI 端口
FIGMA_CA_CERT_PATH=/path/to/ca.pem          # 可选：企业自定义 CA 证书
```

### Token 读取优先级

1. 命令行参数 `--figma-api-key` / `-t` / `--token`
2. GUI 界面配置并保存的 Token
3. 安全存储默认 Token（`figma-dev token set`）
4. MCP 工具调用时 `tokenProfile` 参数
5. MCP 配置 `env.FIGMA_ACCESS_TOKEN`
6. `.env` 文件 `FIGMA_ACCESS_TOKEN`
7. 系统环境变量 `FIGMA_ACCESS_TOKEN`

---

## 🏗️ 架构图

```
┌──────────────────────────────────────────────────────────────┐
│                        用户界面层                              │
│  ┌──────────────┐  ┌───────────────────────────────────────┐ │
│  │  💻 CLI 终端  │  │  🖥️ GUI 可视化配置面板 (v1.3.0)       │ │
│  │  22 个顶层命令 │  │  欢迎页→语言→Token→编辑器→框架→完成   │ │
│  └──────┬───────┘  └──────────────────┬────────────────────┘ │
└─────────┼─────────────────────────────┼──────────────────────┘
          └─────────────┬───────────────┘
                        │ stdio (MCP) / HTTP (GUI)
                        ▼
┌──────────────────────────────────────────────────────────────┐
│              figma-dev-tools MCP Server v1.4.19               │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │  figma-url  │→│ figma-client │→│ node-processor        │ │
│  │  URL 解析    │  │ REST API+缓存 │  │ 层级精简+语义标注     │ │
│  └─────────────┘  └──────────────┘  └──────────────────────┘ │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │code-gen     │  │style-renderer│  │ 付费墙兜底 (v1.4.4)   │ │
│  │JSX/Vue 生成  │  │9 套样式注册表 │  │ BrowserPool+Cache    │ │
│  └─────────────┘  └──────────────┘  └──────────────────────┘ │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │token-store  │  │ i18n 中英双语 │  │ GUI 服务器 (v1.3.0)   │ │
│  │🔐 安全存储   │  │ zh-CN/en-US  │  │ 静态资源+Express     │ │
│  └─────────────┘  └──────────────┘  └──────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

---

## 📋 项目结构

```
figma-dev-tools/
├── bin/figma-dev.js           # CLI 入口
├── mcp-standalone.mjs         # 零配置 MCP 入口
├── gui/                       # GUI 可视化配置面板
│   ├── index.html / app.js / styles.css
├── src/
│   ├── index.ts               # MCP 服务器入口
│   ├── types.ts               # 类型定义
│   ├── i18n/                  # 国际化（zh-CN/en-US）
│   ├── cli/index.ts           # CLI 命令定义
│   ├── services/
│   │   ├── figma-client.ts    # Figma REST API 客户端 + 加密缓存
│   │   ├── node-processor.ts  # 节点树精简 + 语义标注 + 层级修复
│   │   ├── design-context.ts  # 渐进式上下文服务
│   │   ├── token-matcher.ts   # 多级 Token 匹配
│   │   ├── tailwind-mapper.ts # Tailwind 属性映射
│   │   ├── code-generator.ts  # JSX 代码生成
│   │   ├── vue-generator.ts   # Vue SFC 代码生成
│   │   ├── style-renderers/   # v1.4.19：9 套样式注册表
│   │   ├── flex-fixer.ts      # Flex 布局修复
│   │   ├── a11y-enhancer.ts   # 无障碍增强
│   │   ├── design-system.ts   # 设计系统对齐
│   │   ├── responsive-inferrer.ts # 响应式推断
│   │   ├── design-linter.ts   # 设计规范检查
│   │   ├── browser-fallback.ts # 付费墙浏览器兜底 (v1.4.4)
│   │   ├── screenshot-cache.ts # 截图缓存 (v1.4.4)
│   │   ├── ocr-service.ts     # OCR 文本提取 (v1.4.14)
│   │   ├── asset-downloader.ts # 资源下载（SVGO 优化）
│   │   ├── svg-sprite-generator.ts # SVG Sprite 生成
│   │   ├── token-store.ts     # Token 安全存储
│   │   ├── tokens-extractor.ts # Tokens 提取
│   │   ├── code-formatter.ts  # Prettier 代码格式化
│   │   └── file-writer.ts     # 文件写入
│   └── utils/                 # 工具函数（URL 解析、颜色转换、安全防护等）
├── dist/                      # 编译输出
├── .env.example               # 环境变量模板
├── FIGMA-DESIGN-GUIDELINES.md # Figma 设计规范指南
├── QUICKSTART.md              # 快速开始指南
├── SKILL.md                   # AI Agent 使用指南
└── LICENSE                    # MIT 许可证
```

---

## ❓ FAQ

| 问题 | 解决方案 |
| --- | --- |
| **小白不会配置？** | 运行 `npx figma-dev-tools gui`，浏览器引导完成全部配置 |
| **GUI 如何自定义端口？** | `figma-dev gui --port 3000` 或 `FIGMA_GUI_PORT=3000 figma-dev gui` |
| **MCP 服务器无法启动？** | 检查 `npm install && npm run build`；Node.js ≥ 20；建议用 `npx -y figma-dev-tools` 零配置 |
| **API 返回 401？** | 检查 Token 是否正确/过期/有权限；GUI 界面可实时验证；`figma-dev token set` 安全存储 |
| **图标变形？** | v1.3.2 自动修复 Flex `align-items: stretch`；仍异常可用 `figma_lint_design` 检查 |
| **非 React 框架？** | Vue 用 `figma_generate_vue`，Svelte 4 用 `figma_generate_svelte`（样式限 tailwind/unocss/css-modules）；HTML/Angular/Solid 用 `figma_get_structured_data` 获取框架无关 JSON |
| **颜色/间距不一致？** | 确保 Figma 使用 Variables + `codeSyntax.WEB`；推荐 `oklch` 格式 |
| **上下文太长？** | 先用 `figma_get_metadata`（~4KB 概览），再用 `figma_get_design_context` 详情 |
| **资源路径不对？** | v1.4.18 自动检测 Vite/Webpack/Next.js/Remix；可 `--bundler` 手动指定 |

---

## 🆚 竞品对比

### vs 商业工具

| 对比维度 | figma-dev-tools | Anima | Locofy | Builder.io | Overlay |
| --- | --- | --- | --- | --- | --- |
| **价格** | **免费开源**（MIT） | $49/mo+ | $39/mo+ | $99/mo+ | $30/mo+ |
| **MCP 协议** | ✅ 完整 23 工具 | ❌ | ❌ | ❌ | ❌ |
| **GUI 配置** | ✅ v1.3.0 | ✅ | ✅ | ✅ | ✅ |
| **多框架** | ✅ React/Vue/微信小程序/HTML 等（Svelte 计划 v1.4.20） | ✅ | ✅ | ✅ | ✅ |
| **Flex 修复** | ✅ v1.3.2 | 部分 | 部分 | 部分 | ❌ |
| **a11y 增强** | ✅ v1.3.2 | ❌ | ❌ | ❌ | ❌ |
| **还原度校验** | ✅ v1.4.4（像素 diff） | ❌ | ❌ | ❌ | ❌ |
| **付费墙兜底** | ✅ v1.4.4 | N/A | N/A | N/A | N/A |
| **CLI** | ✅ 22 个顶层命令 | ✅ | ❌ | ❌ | ❌ |
| **i18n** | ✅ 中英文双语 | ✅ | 需确认 | 需确认 | 需确认 |

### vs 开源 / 官方工具

| 对比维度 | figma-dev-tools | @figma/code-connect | Framelink Figma MCP | figma-mcp（社区） |
| --- | --- | --- | --- | --- |
| **定位** | 开源 MCP 工具链 | 官方组件映射 | 开源 MCP（8k+ stars） | 开源 MCP |
| **价格** | **免费开源** | 免费（需 Dev 席位） | 免费开源 | 免费开源 |
| **代码生成** | ✅ 一键 TSX/Vue | ❌ 仅组件映射 | ❌ 仅提供数据 | ❌ 仅提供数据 |
| **GUI 配置** | ✅ v1.3.0 | ❌ | ❌ | ❌ |
| **Token 提取** | ✅ | ✅ | ❌ | ❌ |
| **Flex 修复** | ✅ v1.3.2 | ❌ | ❌ | 部分 |
| **a11y 增强** | ✅ v1.3.2 | ❌ | ❌ | ❌ |
| **还原度校验** | ✅ v1.4.4 | ❌ | ❌ | ❌ |
| **付费墙兜底** | ✅ v1.4.4 | N/A | ❌ | ❌ |
| **CLI** | ✅ 22 个顶层命令 | ✅ | ✅ | ✅ | ✅ |
| **i18n** | ✅ v1.3.2 | ❌ | ❌ | ❌ |
| **SVG Sprite** | ✅ v1.3.2 | ❌ | ❌ | ❌ |

### 差异化优势

- **付费墙兜底**：独有的 `BrowserFallbackService`，API 付费墙失败时自动 Playwright 截图保底
- **还原度校验闭环**：`figma_verify_fidelity` 像素 diff + 差异热力图 + 量化评分（0-100%）
- **框架无关结构化数据**：`figma_get_structured_data` 输出标准 JSON，支持任意框架
- **开源 + 免费 + 全功能**：MIT 许可，无需付费席位即可使用全部 23 个 MCP 工具

---

## 📜 License

MIT © figma-dev-tools contributors