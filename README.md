# 🎨 Figma Dev Tools v1.4.10

> Figma → 任意前端框架 设计到代码一键转换 MCP 服务器

**[English](https://gitee.com/shanxi-youcha/figma-dev-tools/blob/master/README.en-US.md)** | **中文**

**打通 Figma 设计与前端研发的完整工具链**，支持 🖥️
GUI 可视化配置向导、设计 Tokens 智能提取、高保真组件生成（React/Vue/Svelte/HTML 等）、资源自动下载、跨编辑器 MCP 集成。专为 AI
Agent 优化，解决 div
soup、上下文爆炸、hex 写死、资源路径处理、Flex 布局变形、无障碍缺失、响应式适配、**付费墙兜底**等核心痛点。

---

## ✨ v1.4.4 付费墙兜底 + 高保真还原 + 性能优化

### 核心兜底与还原

| 优化项                          | 说明                                                                                                                          | 版本       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 🧱 **付费墙浏览器兜底**         | 新增 `BrowserFallbackService`：当 Figma REST API 因付费墙/权限失败时，自动启动 Playwright 无头浏览器加载设计稿页面并截图保底 | **v1.4.4** |
| 🤖 **视觉近似模式**             | 新增 `VisualApproximationService`：当节点 JSON 无法获取时，将截图喂给 VLM 生成近似代码骨架，明确标注"近似模式 ~75%" + TODO 清单 | **v1.4.4** |
| 📏 **DPR/屏幕尺寸感知**        | 截图按用户实际 `devicePixelRatio` 输出 1x/2x/3x，匹配不同操作系统渲染差异                                                       | **v1.4.4** |
| 🎯 **还原度评分工具**          | 新增 `figma_verify_fidelity` MCP 工具：Figma 截图 vs 生成代码截图像素 diff，输出量化相似度                                    | **v1.4.4** |
| 📐 **绝对定位还原**             | 修复 `layoutMode=NONE` 节点丢失 `relativeTransform`，浮动元素旋转/偏移正确映射                                                | **v1.4.4** |
| 🎨 **渐变/多重阴影/inner shadow** | 修复线性/径向渐变填充、多重阴影、内阴影还原丢失，全部降级为纯色的问题                                                          | **v1.4.4** |
| ✂️ **mask/clip-path 还原**     | 修复圆角头像、异形裁切失真，映射为 `overflow:hidden` + `border-radius` 或 `clip-path`                                          | **v1.4.4** |
| ➖ **strokeDash 虚线/点线**     | 修复虚线、点线边框全部变成实线的问题                                                                                          | **v1.4.4** |
| 🔤 **富文本多段样式**           | 修复 `styleOverrideTable` 未解析导致整段文本用相同样式的问题                                                                   | **v1.4.4** |
| 🌍 **i18n 错误信息国际化**      | `figma-client.ts` 中硬编码中文错误信息全部改为 i18n key 引用，按 GUI 选定语言（zh-CN/en-US）输出，默认中文                      | **v1.4.4** |

### 性能优化（v1.4.4 新增）

| 优化项                          | 说明                                                                                                                          | 版本       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 🚀 **浏览器实例池**             | 新增 `BrowserPool`：维护可复用的 Playwright 浏览器实例，后续截图跳过 1-3 秒启动阶段，空闲 60 秒自动回收                       | **v1.4.4** |
| 💾 **截图缓存**                  | 新增 `ScreenshotCache`：基于 `url+nodeId+dpr` 缓存截图结果，LRU 淘汰 + TTL 过期，重复请求秒级返回                              | **v1.4.4** |
| ⏱️ **分级超时**                 | 导航/渲染/截图分别配置超时（默认 20s/10s/5s），精准定位超时阶段                                                                | **v1.4.4** |
| 🧠 **混合智能等待策略**         | `domcontentloaded` + 画布元素可见 + 网络空闲检测，解决 Figma SPA `networkidle` 始终无法达到的问题                                  | **v1.4.4** |
| 🔁 **指数退避重试**             | 网络错误、超时错误自动重试（默认 2 次，初始延迟 500ms，指数退避），参数错误不重试                                              | **v1.4.4** |
| 🔥 **预热机制**                 | `warmup()` 在服务启动时预启动浏览器实例，消除首次调用延迟                                                                      | **v1.4.4** |
| 📊 **性能指标埋点**              | `getPerformanceStats()` 暴露浏览器池和截图缓存的统计信息（命中率/实例数/使用次数）                                              | **v1.4.4** |
| 🐛 **逻辑黑洞修复**             | 修复 9 处逻辑黑洞：截图 selector 不一致、尺寸硬编码、devModeCss 注入风险、fidelityScore 未 clamp、依赖检查顺序等                  | **v1.4.4** |
| 🧪 **测试覆盖**                 | 新增 35 个测试用例（BrowserPool + ScreenshotCache + 性能优化配置），总计 95 个测试全部通过                                      | **v1.4.4** |

### 性能对比（v1.4.4 优化前后）

| 场景                  | 优化前     | 优化后         | 提升      |
| --------------------- | ---------- | -------------- | --------- |
| 后续截图（同会话）    | 5-8 秒     | 1-2 秒         | **3-4x**  |
| 重复请求（缓存命中）  | 5-8 秒     | <100ms         | **50x+**  |
| 网络抖动恢复          | 直接失败   | 自动重试       | **可用性提升** |

### 性能优化配置（可选，向后兼容）

```typescript
// 通过 BrowserFallbackService 配置
const service = new BrowserFallbackService({
  navigationTimeout: 20000,    // 导航超时（毫秒）
  renderTimeout: 10000,        // 渲染等待超时（毫秒）
  screenshotTimeout: 5000,     // 截图操作超时（毫秒）
  waitStrategy: 'hybrid',      // 等待策略：hybrid/conservative/aggressive
  maxRetries: 2,               // 最大重试次数
  retryBaseDelay: 500,         // 重试初始延迟（毫秒）
  enableScreenshotCache: true, // 启用截图缓存
  screenshotCacheTtl: 3600000, // 缓存有效期（毫秒，默认 1 小时）
  browserIdleTimeout: 60000,   // 浏览器空闲超时（毫秒，默认 60 秒）
});
```

## 📜 版本历史汇总

| 版本    | 主题                    | 核心内容                                                                                                   |
| ------- | ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| v1.4.10 | 版本号统一 + figd_ Token 认证修复 | 修复 figd_ 类型 Token 认证（X-Figma-Token 头），CLI/GUI 版本号统一从 package.json 读取，所有文档版本号同步更新 |
| v1.4.9  | figd_ Token 认证修复       | 修复 figd_ 类型 Token 必须使用 X-Figma-Token 请求头而非 Authorization 的兼容性问题，Token 验证全面通过 |
| v1.4.8  | --update EBUSY 兼容 + 文档   | --update 自动检测 EBUSY 并 robocopy 回退、CLI 文档补全（-v/--ver/--update）、修复重复图标、错误详情展示 |
| v1.4.7  | Token 验证优化 + i18n   | Token 验证失败显示具体原因（HTTP 401/403/429）、GUI 错误详情展示、CLI 错误捕获增强、错误消息全面国际化       |
| v1.4.4  | 付费墙兜底 + 性能优化   | 浏览器兜底截图、视觉近似模式、还原度评分、性能优化（实例池/缓存/分级超时）                                 |
| v1.4.3  | 稳定性与安全加固        | GUI 请求体防护、循环引用检测、递归深度保护、缓存一致性                                                      |
| v1.4.1  | 代码质量优化            | 零 any 类型、oxlint 零警告、代码规范统一                                                                    |
| v1.4.0  | 重磅更新                | XSS 安全防护、智能层级修复、SVG 内联渲染、动画检测、本地加密缓存、评分算法优化、H5 适配、Token 安全存储     |
| v1.3.x  | 基础能力建设            | GUI 可视化配置、i18n 国际化、无障碍增强、Flex 修复、设计系统对齐、响应式推断、设计规范检查                  |

---

## ✨ 功能亮点

| 特性                             | 说明                                                                                                              | 版本            |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------- |
| 🖥️ **GUI 可视化配置向导**        | 浏览器图形界面配置，欢迎页→语言选择→Token配置+实时验证→编辑器检测一键安装→框架偏好选择→完成页，小白零门槛         | **v1.3.0**      |
| 🔗 **19 个 MCP 工具**            | 完整覆盖 URL 解析 → Token 提取 → 组件生成 → 资源下载 → 付费墙兜底 → 还原度校验全流程                              | v1.4.4          |
| 🧠 **框架无关结构化数据**        | 输出 id/name/role/type/size/layout/styles/text/asset/children JSON，支持 Vue/Svelte/HTML/Angular/Solid 等任意框架 | v1.1.0          |
| ⚛️ **React + Tailwind 一级支持** | 语义标签选择 + Tailwind 映射 + cn() 合并 + TODO 标记，一键生成高保真 TSX                                          | v1.3.2          |
| 🔧 **Flex 布局自动修复**         | 智能修复图标变形、文本截断、溢出等 Flex 问题                                                                      | v1.3.2          |
| ♿ **无障碍增强**                | 自动添加语义标签、alt、ARIA 属性                                                                                  | v1.3.2          |
| 🎨 **设计系统对齐**              | 自动匹配颜色/间距/字体/圆角/阴影变量                                                                              | v1.3.2          |
| 📱 **响应式推断**                | 智能推断断点，提供响应式前缀建议                                                                                  | v1.3.2          |
| ✅ **设计规范预检**              | 生成代码前检查设计稿质量并给出修复建议                                                                            | v1.3.2          |
| 🧠 **智能层级精简**              | 自动扁平化冗余 GROUP/FRAME，消除 ~60% 无意义嵌套 div                                                              | v1              |
| 📊 **渐进式上下文**              | metadata 概览（~4KB）→ designContext 详情，避免上下文爆炸                                                         | v1.2             |
| 🎯 **多级 Token 匹配**           | codeSyntax.WEB → 精确 hex → CIE76 色差模糊 → @theme 扩展建议                                                      | v1              |
| 🖼️ **资源自动管线**              | 检测图片/SVG → 下载到 public/ → SVGO 优化 → 生成 publicCdnUrl() 引用                                              | v1.2             |
| 🧩 **SVG Sprite 生成**           | 批量图标合并为 Sprite，支持 CSS color 控制颜色                                                                    | v1.3.2          |
| 🌍 **i18n 国际化**               | 中英文双语支持，`figma-dev lang switch` 切换                                                                      | v1.3.2          |
| 🔐 **安全 Token 存储**           | 系统密钥链安全存储 Token                                                                                          | v1.3.2          |
| 💻 **CLI 命令行**                | 支持脚本和 CI/CD 集成，无需 MCP 也可使用，新增 gui/structured/lint/lang/token 命令                                | v1 (gui v1.3.0) |
| 🔄 **8+ 编辑器支持**            | Trae、VS Code、Cursor、Windsurf、Claude Desktop、Zed、Cline、Roo Code 一键安装（GUI 自动检测）                     | v1 (gui v1.3.0) |
| 🚀 **零配置启动**                | 支持 `npx -y figma-dev-tools --figma-api-key=xxx` 直接运行，无需提前安装配置                                      | v1.2            |

---

## 🚀 快速开始

> 📚 想要一份精简、与版本同步的速成指南？见 **[QUICKSTART.md](QUICKSTART.md)**（中文）/ **[QUICKSTART.en-US.md](QUICKSTART.en-US.md)**（英文）。以下为详细说明。

### 方式零：GUI 可视化配置（小白推荐 ⭐）

**无需记忆任何命令**，通过浏览器图形界面完成全部配置：

```bash
# 直接启动 GUI 配置面板
npx figma-dev-tools gui

# 或全局安装后
figma-dev gui
```

启动后会自动打开浏览器（默认端口
**54321**，被占用自动尝试 54322/54323），按照引导步骤操作：

1. **欢迎页面** - 了解 figma-dev-tools 功能
2. **语言选择** - 中文/English 双语切换
3. **Token 配置** - 输入 Figma Token，实时验证有效性
4. **编辑器检测** - 自动检测 8+ 已安装编辑器，勾选后一键安装 MCP 配置
5. **框架偏好** - 选择常用框架（React/Vue/HTML）
6. **完成页面** - 配置成功，提供使用教程链接

> 💡 也可以通过向导命令启动 GUI 模式：
>
> ```bash
> figma-dev wizard --gui
> figma-dev init --gui
> ```

---

### 方式一：零配置 npx 直接运行（最快）

无需安装，一行命令启动 MCP 服务器：

```bash
# 直接通过 npx 运行，传入 API Key
npx -y figma-dev-tools --figma-api-key=your-figma-token-here
```

在编辑器 MCP 配置中使用：

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

### 方式二：一键安装（推荐长期使用）

```bash
# npm
npx figma-dev-tools install

# pnpm
pnpm dlx figma-dev-tools install

# yarn
yarn dlx figma-dev-tools install

# bun
bunx figma-dev-tools install
```

安装脚本会自动：

- 检测已安装的 AI 编辑器（Trae/VS Code/Cursor/Windsurf/Claude
  Desktop/Zed/Cline/Roo Code 等 8+）
- 自动检测包管理器（npm/pnpm/yarn/bun）
- 下载/编译工具
- 配置对应编辑器的 MCP settings（Zed 使用 mcp_servers 字段）
- 生成 `.env.example` 模板

> 💡 **更简单的方式**：运行 `figma-dev gui`
> 使用图形界面一键检测并安装编辑器配置。

### 方式三：项目依赖安装

```bash
# npm
npm install figma-dev-tools --save-dev

# pnpm
pnpm add figma-dev-tools -D

# yarn
yarn add figma-dev-tools --dev

# bun
bun add figma-dev-tools -d
```

### 方式四：从本地源码安装

```bash
# 克隆或复制 figma-dev-tools 目录到项目中
cp -r figma-dev-tools/ your-project/tools/
cd your-project/tools/figma-dev-tools
npm install   # 或 pnpm install / yarn install / bun install
npm run build # 或 pnpm build / yarn build / bun run build
```

---

### 1. 获取 Figma Access Token

1. 登录 [Figma](https://www.figma.com/)
2. 点击右上角头像 → **Settings** → **Account**
3. 找到 **Personal access tokens** → **Generate new token**
4. 输入名称，勾选 **File content (Read only)** 权限
5. 复制生成的 Token（⚠️ 只显示一次）

> 💡 使用 GUI 配置时，在浏览器界面直接粘贴 Token 即可自动验证并保存。

### 2. 配置 Token

**方式 A：GUI 可视化配置（推荐 v1.3.0+）**

```bash
figma-dev gui
```

在浏览器界面中输入 Token，实时验证有效性后自动安全存储。

**方式 B：安全存储（推荐 v1.3.2+）**

```bash
# 交互式保存 Token 到系统密钥链
figma-dev token set

# 或直接通过参数
figma-dev token set -t figd_your_token_here
```

**方式 C：通过命令行参数**

```bash
npx figma-dev-tools --figma-api-key=your-figma-token-here
# 或短参数
npx figma-dev-tools -t your-figma-token-here
```

**方式 D：通过 .env 文件**

在 `figma-dev-tools/` 目录创建 `.env` 文件：

```env
FIGMA_ACCESS_TOKEN=your-figma-token-here
```

**方式 E：MCP 配置 env**

在编辑器 MCP 配置中添加：

```json
{
  "mcpServers": {
    "figma-dev-tools": {
      "command": "node",
      "args": ["<path>/dist/index.js"],
      "env": {
        "FIGMA_ACCESS_TOKEN": "your-figma-token-here"
      }
    }
  }
}
```

### 3. 第一个 Figma → 代码示例

**React + Tailwind（推荐，v1.4.0 增强版）：**

在 AI 编辑器（如 Trae）中，直接对话：

```
帮我用 figma-dev-tools 还原这个 Figma 设计稿：
https://www.figma.com/design/xxxxx/MyProject?node-id=23-11032

场景名：landing-page
组件名：HeroSection
```

AI 将自动执行以下增强流程（v1.3.2）：

1. `figma_lint_design` - 设计规范预检（可选，提示问题）
2. `figma_parse_url` 解析链接
3. `figma_get_metadata` 获取页面结构概览
4. `figma_get_screenshot` 获取视觉基准
5. `figma_generate_jsx`
   一键生成 TSX 代码（含 Flex 修复、a11y 增强、设计系统对齐、响应式推断）
6. `figma_download_assets` 下载图片资源（SVGO 自动优化）

**其他框架（Vue/Svelte/HTML 等）：**

使用 `figma_get_structured_data` 工具获取框架无关的 JSON 结构：

```
帮我用 figma_get_structured_data 获取这个 Figma 节点的结构化数据，然后生成 Vue 组件：
https://www.figma.com/design/xxxxx/MyProject?node-id=23-11032
```

### CLI 快速体验

```bash
# 🖥️ 启动 GUI 可视化配置面板（v1.3.0 新，小白推荐）
npx figma-dev-tools gui

# 查看文件信息
npx figma-dev info "https://www.figma.com/design/xxxxx/MyProject?node-id=23-11032"

# 设计规范预检（v1.3.2 新）
npx figma-dev lint "https://www.figma.com/design/xxxxx/MyProject?node-id=23-11032"

# 生成 React 组件（增强版）
npx figma-dev jsx "https://www.figma.com/design/xxxxx/MyProject?node-id=23-11032" \
  --name HeroSection --scene landing-page

# 获取框架无关结构化数据（v1.1.0 新）
npx figma-dev structured "https://www.figma.com/design/xxxxx/MyProject?node-id=23-11032" \
  --format json --output ./hero-structured.json

# 同步 Design Tokens
npx figma-dev sync "https://www.figma.com/design/xxxxx/MyProject" \
  --format oklch --output ./src/styles

# 语言设置（v1.3.2 新）
npx figma-dev lang switch  # 交互式切换中英文
npx figma-dev lang set zh-CN

# Token 安全管理（v1.3.2 新）
npx figma-dev token set     # 保存 Token 到密钥链
npx figma-dev token list    # 列出已保存 Token
```

---

## 🔧 MCP 工具参考

共 **19 个 MCP 工具**，按使用流程排列：

| #   | 工具名称                    | 功能                                                                                  | 关键参数                                 | 版本        |
| --- | --------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------- | ----------- |
| 1   | `figma_parse_url`           | 解析 Figma URL，提取 fileKey/nodeId                                                   | `url`                                    | v1          |
| 2   | `figma_validate_token`      | 验证 Figma Access Token 有效性                                                        | `accessToken`                            | v1          |
| 3   | `figma_get_file`            | 获取文件基本信息（页面列表、组件数）                                                  | `fileKey` / `figmaUrl`                   | v1          |
| 4   | `figma_list_components`     | 列出文件中 Components/ComponentSets                                                   | `fileKey`                                | v1.2         |
| 5   | `figma_get_metadata`        | **高层结构概览**（~4KB，避免上下文爆炸）                                              | `fileKey/nodeId/depth`                   | v1.2         |
| 6   | `figma_get_design_context`  | **精简设计上下文**（层级扁平+语义标注+资源列表）                                      | `fileKey/nodeId/maxDepth`                | v1.2         |
| 7   | `figma_get_screenshot`      | 获取节点高清截图                                                                      | `fileKey/nodeId/scale`                   | v1          |
| 8   | `figma_get_structured_data` | **⭐ 框架无关结构化数据**（id/name/role/type/size/layout/styles/text/asset/children） | `fileKey/nodeId/maxDepth`                | v1.1.0      |
| 9   | `figma_lint_design`         | **⭐ v1.3.2 新：代码还原质量预检**                                                    | `fileKey/nodeId/maxDepth`                | **v1.3.2**  |
| 10  | `figma_generate_jsx`        | **⭐ 一键生成 React/Vue+Tailwind TSX**（含 Flex 修复/a11y/设计系统/响应式，v1.4.0 新增 Vue 3/UnoCSS） | `fileKey/nodeId/componentName/sceneName` | v1.4.0 增强 |
| 11  | `figma_generate_component`  | 基础组件生成（旧版，推荐 generate_jsx）                                               | `fileKey/nodeId/styleFormat`             | v1          |
| 12  | `figma_download_assets`     | **下载资源到 public/<场景>/ + SVGO 优化 + publicCdnUrl**                              | `fileKey/sceneName/assetNodeIds`         | v1.2         |
| 13  | `figma_create_icon_sprite`  | **⭐ v1.3.2 新：生成 SVG Sprite 雪碧图**                                              | `svgDir/outputPath/typesPath`            | **v1.3.2**  |
| 14  | `figma_extract_tokens`      | 提取设计 Tokens（Variables+Styles）                                                   | `fileKey/colorFormat`                    | v1          |
| 15  | `figma_generate_styles`     | 生成 CSS Variables / Tailwind v4 @theme                                               | `tokens/outputFormat`                    | v1          |
| 16  | `figma_sync_to_project`     | 写入 tokens 到项目文件（自动备份）                                                    | `tokens/outputDir/format`                | v1          |
| 17  | `figma_dev_fallback_status` | **⭐ v1.4.4 新：查询付费墙兜底系统状态**（Playwright 可用性、配置、兜底优先级）       | 无                                       | **v1.4.4**  |
| 18  | `figma_dev_fallback_capture`| **⭐ v1.4.4 新：触发浏览器兜底截图**（付费墙时截图 + Dev Mode CSS + 视觉近似模式）    | `figmaUrl/devicePixelRatio/framework`    | **v1.4.4**  |
| 19  | `figma_verify_fidelity`     | **⭐ v1.4.4 新：还原度校验**（像素 diff + 差异热力图 + 量化评分 0-100%）              | `figmaUrl/codeContent/threshold`         | **v1.4.4**  |

### 工具详细参数

#### `figma_generate_jsx`（v1.4.0 增强版，最常用）

```typescript
{
  figmaUrl?: string;           // Figma 链接（可替代 fileKey+nodeId）
  fileKey?: string;            // Figma 文件 Key
  nodeId?: string;             // 目标节点 ID
  componentName?: string;      // 组件名（如 HeroSection）
  sceneName?: string;          // 场景名（用于资源路径，如 landing-page）
  maxDepth?: number;           // 节点树最大遍历深度，默认 15（1-30）
  framework?: 'react' | 'vue'; // 目标框架，默认 react（v1.4.0 新增 vue）
  styleFormat?: 'tailwind' | 'unocss'; // 样式方案，默认 tailwind（v1.4.0 新增 unocss）
  skipEnhancements?: boolean;  // 是否跳过 v1.2.0 增强（Flex/a11y/设计系统/响应式）
  skipLintCheck?: boolean;     // 是否跳过设计规范检查提示
  accessToken?: string;        // 可选，优先用环境变量
}
```

**v1.4.0 增强输出：**

- 完整 React + TypeScript + Tailwind TSX 代码（Prettier 格式化）
- 🔧 **Flex 修复报告**：列出自动修复的布局问题（图标变形、文本截断等）
- ♿ **无障碍增强报告**：语义标签、alt 文本、ARIA 属性添加情况
- 🎨 **设计系统建议**：颜色/间距/圆角/阴影变量匹配建议
- 📱 **响应式建议**：断点推断、sm/md/lg 前缀建议
- ⚠️ 需要 `@theme` 扩展的 token 列表
- 🖼️ 需要下载的资源列表（nodeId、名称、类型）
- 🧩 可复用组件提示
- 节点精简统计
- ✅ 设计规范评分提示（低于 80 分建议先修复）

#### `figma_lint_design`（v1.3.2 新，代码还原质量预检）

```typescript
{
  figmaUrl?: string;           // Figma 链接
  fileKey?: string;            // Figma 文件 Key
  nodeId?: string;             // 目标节点 ID（可选，默认检查整个文件）
  maxDepth?: number;           // 最大检查深度，默认 15（1-30）
  accessToken?: string;        // 可选
}
```

**检查项：**

- Auto Layout 使用规范
- 图层命名规范性
- 间距/尺寸/圆角是否使用 4px/8px 网格
- 组件复用情况
- 无障碍最小点击尺寸（48×48px）
- 嵌套层级深度
- 文本样式一致性
- 颜色使用规范

**输出：**

- 0-100 分质量评分
- 错误/警告/提示分类统计
- 按类别细分的问题清单
- 具体修复建议
- 参见：`FIGMA-DESIGN-GUIDELINES.md`

#### `figma_create_icon_sprite`（v1.3.2 新，SVG Sprite 生成）

```typescript
{
  svgDir: string;              // 包含 SVG 文件的目录
  outputPath: string;          // sprite.svg 输出路径
  typesPath?: string;          // 可选，TypeScript 类型文件路径
  prefix?: string;             // symbol id 前缀，默认 "icon-"
  removeFill?: boolean;        // 是否移除 fill 以便 CSS color 控制，默认 true
}
```

#### `figma_get_structured_data`（v1.1.0 新，多框架支持）

```typescript
{
  figmaUrl?: string;           // Figma 链接（可替代 fileKey+nodeId）
  fileKey?: string;            // Figma 文件 Key
  nodeId: string;              // 目标节点 ID（必需）
  maxDepth?: number;           // 最大节点树深度，默认 15（1-30）
  accessToken?: string;        // 可选，优先用环境变量
}
```

**输出内容：**

- 完整的框架无关 JSON 结构，每个节点包含：
  - `id` / `name` - 节点标识
  - `role` - 语义角色（button/card/image/text/icon/section 等）
  - `type` - Figma 节点类型（FRAME/TEXT/RECTANGLE/GROUP/INSTANCE 等）
  - `size` - { width, height }
  - `layout` -
    Flex 布局属性（display/flexDirection/justifyContent/alignItems/gap/padding 等）
  - `styles` - 样式属性（color/backgroundColor/borderRadius/shadow/fontSize/fontWeight 等）
  - `text` - 文本内容（仅 TEXT 节点）
  - `asset` - 资源信息（图片节点：类型、格式、下载 URL）
  - `children` - 子节点数组
- 预览摘要：语义角色、节点类型、尺寸、总节点数、颜色数、资源数、文本节点数
- `structuredContent` - 完整结构化节点树，可直接遍历生成任意框架代码

**适用框架：**

- ✅ React / Next.js / Remix（配合 generate_jsx 更佳）
- ✅ Vue 2/3 / Nuxt
- ✅ Svelte / SvelteKit
- ✅ 原生 HTML / CSS
- ✅ Angular
- ✅ SolidJS
- ✅ Qwik
- ✅ Astro
- ✅ 任意前端框架

#### `figma_download_assets`

```typescript
{
  figmaUrl?: string;
  fileKey: string;
  sceneName: string;           // 对应 public/<场景>/ 目录
  assetNodeIds: string[];      // 从 generate_jsx 获取的 nodeId 列表
  projectRoot?: string;        // 项目根目录，默认自动检测
  scale?: number;              // 导出倍率 1-4，默认 2
  svgFormat?: 'svg' | 'png';   // 矢量格式，默认 svg
  optimizeSvg?: boolean;       // 使用 SVGO 优化 SVG，默认 true
}
```

#### `figma_extract_tokens`

```typescript
{
  figmaUrl?: string;
  fileKey: string;
  nodeId?: string;             // 可选，仅提取该节点下的 tokens
  colorFormat?: 'hex' | 'rgb' | 'oklch' | 'hsl';  // 默认 oklch（Tailwind v4 推荐）
  spacingUnit?: 'px' | 'rem';  // 默认 px
  tokenPrefix?: string;        // Token 名称前缀
}
```

---

## 💻 CLI 命令参考

```bash
# 全局安装后使用
npm install -g figma-dev-tools
figma-dev <command> [options]

# 或 npx 直接运行
npx figma-dev-tools <command> [options]

# 🖥️ v1.3.0 新：启动 GUI 可视化配置面板
npx figma-dev-tools gui

# 传入 API Key
npx figma-dev-tools --figma-api-key=your-token <command>
npx figma-dev-tools -t your-token <command>

# 切换语言（v1.3.2 新）
npx figma-dev-tools -l zh-CN <command>
```

| 命令                         | 功能                                                 | 常用选项                                                              | 版本       |
| ---------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------- | ---------- |
| `figma-dev gui`              | **🖥️ 启动 GUI 可视化配置面板**                       | `--port <n>` 指定端口（默认 54321）                                   | **v1.3.0** |
| `figma-dev install`          | 一键安装 MCP 配置到各编辑器                          | -                                                                     | v1         |
| `figma-dev uninstall`        | 卸载已安装的 MCP 配置                               | -                                                                     | v1         |
| `figma-dev validate <token>` | 验证 Token                                           | -                                                                     | v1         |
| `figma-dev wizard`           | 交互式配置向导                                       | `--gui` 启动 GUI 模式                                                 | v1.3.0     |
| `figma-dev init`             | 初始化配置（交互式向导）                             | `--gui` 启动 GUI 模式                                                 | v1.3.0     |
| `figma-dev lang`             | **🌍 语言设置**（set/list/switch）                   | `set <lang>` / `switch`                                               | **v1.3.2** |
| `figma-dev token`            | **🔐 Token 安全管理**（set/get/list/delete/default） | `set -t <token>`                                                      | **v1.3.2** |
| `figma-dev info <url>`       | 查看文件信息                                         | -                                                                     | v1         |
| `figma-dev lint <url>`       | **✅ 设计规范预检**                                  | `--node <id>` `--depth <n>` `--format md/json` `--output <file>`      | **v1.3.2** |
| `figma-dev metadata <url>`   | 获取元数据概览                                       | `--node <id>` `--depth <n>`                                           | v1.1.0      |
| `figma-dev structured <url>` | **获取框架无关结构化数据**                           | `--node <id>` `--depth <n>` `--format pretty/json` `--output <file>`  | v1.1.0     |
| `figma-dev jsx <url>`        | **生成增强版 JSX/Vue 组件**（Flex/a11y/设计系统/响应式，v1.4.0 新增 Vue 3/UnoCSS） | `--name <ComponentName>` `--scene <name>` `--depth <n>` `--framework react|vue` `--style tailwind|unocss` `--skip-lint` `--inline-svg` | v1.4.0     |
| `figma-dev component <url>`  | 生成基础组件                                         | `--name <name>` `--node <id>` `--js` `--style tailwind` `--no-children` `--output <dir>` | v1         |
| `figma-dev assets <url>`     | 下载资源（SVGO 优化）                                | `--node <id>` `--nodes <id1,id2>` `--scene <name>` `--scale <n>` `--svg-format svg|png` `--project-root <dir>` | v1.1.0      |
| `figma-dev sync <url>`       | 同步 Tokens                                          | `--node <id>` `--format oklch` `--spacing-unit px|rem` `--prefix <name>` `--output-format all` `--file-name <name>` | v1         |
| `figma-dev screenshot <url>` | 获取截图                                             | `--node <id>` `--format png` `--scale 2` `--download <dir>`            | v1         |
| `figma-dev mcp`              | 启动 MCP 服务器（stdio）                             | -                                                                     | v1         |
| `figma-dev tutorial`         | 查看教程文档（别名 `help`，自动打开浏览器）           | `--no-browser`                                                        | v1.3.0     |
| `figma-dev cache`            | **📦 缓存管理**（status/clear）                       | `status` / `clear -f`                                                 | v1.4.0     |
| `figma-dev privacy`          | **🔒 隐私声明**（查看数据安全承诺 + .gitignore 检查）  | -                                                                     | v1.4.0     |
| `figma-dev -v` / `--ver`    | **📌 查看当前版本号**                                | -                                                                     | **v1.4.8** |
| `figma-dev --update`        | **🔄 检查并更新到最新版本**（自动处理 EBUSY 文件占用） | -                                                                     | **v1.4.8** |

**CLI 示例：**

```bash
# 🖥️ 启动 GUI 可视化配置面板（v1.3.0 新，小白推荐）
figma-dev gui

# 指定端口启动 GUI
figma-dev gui --port 3000

# 通过向导命令启动 GUI 模式
figma-dev wizard --gui
figma-dev init --gui

# 📌 查看当前版本号（v1.4.8 新增）
figma-dev -v

# 🔄 检查并更新到最新版本（v1.4.8 新增，自动处理 EBUSY 文件占用）
figma-dev --update

# 设计规范预检（v1.3.2 新）
figma-dev lint "https://www.figma.com/design/xxx/yyy?node-id=23-11032"

# 一键生成 Hero 区 React 组件（增强版）
figma-dev jsx "https://www.figma.com/design/xxx/yyy?node-id=23-11032" \
  --name HeroSection \
  --scene landing-page \
  --depth 8

# 获取框架无关结构化数据（JSON 格式输出到文件）
figma-dev structured "https://www.figma.com/design/xxx/yyy?node-id=23-11032" \
  --depth 8 \
  --format json \
  --output ./hero-data.json

# 批量下载资源（自动 SVGO 优化）
figma-dev assets "https://www.figma.com/design/xxx/yyy?node-id=23-11032" \
  --scene landing-page \
  --nodes "23-11032,23-11050,23-11080" \
  --scale 2

# 生成 SVG Sprite（v1.3.2 新，需先下载图标）
# 通过 MCP 工具 figma_create_icon_sprite 调用

# 保存 Token 到系统密钥链（v1.3.2 新）
figma-dev token set -t figd_your_token_here

# 切换到中文界面（v1.3.2 新）
figma-dev lang set zh-CN
```

---

## 🖥️ 支持的编辑器（8+）

| 编辑器                             | 一键安装        | GUI 自动检测 | 配置格式        | 手动配置路径                                                                                                                           |
| ---------------------------------- | --------------- | ------------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Trae**                           | ✅ 自动检测安装 | ✅           | mcpServers      | 项目根目录 `.mcp.json` 或 User Settings                                                                                                |
| **VS Code**                        | ✅ 自动检测安装 | ✅           | mcpServers      | `.vscode/mcp.json` 或 User Settings JSON                                                                                               |
| **Cursor**                         | ✅ 自动检测安装 | ✅           | mcpServers      | `~/.cursor/mcp.json`（全局）或项目 `.cursor/mcp.json`                                                                                  |
| **Windsurf**                       | ✅ 自动检测安装 | ✅           | mcpServers      | `~/.codeium/windsurf/mcp_config.json`                                                                                                  |
| **Claude Desktop**                 | ✅ 自动检测安装 | ✅           | mcpServers      | `~/Library/Application Support/Claude/claude_desktop_config.json`（macOS）<br>`%APPDATA%\Claude\claude_desktop_config.json`（Windows） |
| **Zed**                            | ✅ 自动检测安装 | ✅           | **mcp_servers** | `~/.zed/settings.json`                                                                                                                 |
| **Cline**（VS Code/Cursor 插件）    | ✅ 自动检测安装 | ✅           | mcpServers      | VS Code/Cursor 全局存储 `cline_mcp_settings.json`                                                                                      |
| **Roo Code**（VS Code/Cursor 插件） | ✅ 自动检测安装 | ✅           | mcpServers      | VS Code/Cursor 全局存储 `mcp_settings.json`                                                                                            |

> 💡 **最简单的配置方式**：运行 `figma-dev gui`
> 启动图形界面，**自动检测你电脑上已安装的所有编辑器**，勾选需要配置的编辑器后一键完成安装，无需手动查找配置文件路径。

### MCP 配置模板

**标准格式（Trae/VS Code/Cursor/Windsurf/Claude Desktop/Cline/Roo Code）：**

```json
{
  "mcpServers": {
    "figma-dev-tools": {
      "command": "node",
      "args": ["<path-to-figma-dev-tools>/dist/index.js"],
      "env": {
        "FIGMA_ACCESS_TOKEN": "your-figma-token-here"
      }
    }
  }
}
```

**Zed 格式（注意字段名是 mcp_servers）：**

```json
{
  "mcp_servers": {
    "figma-dev-tools": {
      "command": "node",
      "args": ["<path-to-figma-dev-tools>/dist/index.js"],
      "env": {
        "FIGMA_ACCESS_TOKEN": "your-figma-token-here"
      }
    }
  }
}
```

**零配置 npx 方式（无需本地安装）：**

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

> 💡 使用 `npx figma-dev-tools install` 或 **`figma-dev gui`**
> 会自动检测编辑器并填充正确路径，Zed 会自动使用 `mcp_servers` 字段。

---

## ⚙️ 配置说明

### 环境变量（.env）

复制 `.env.example` 为 `.env` 并填写：

```env
# 必需：Figma Personal Access Token
# 获取地址：https://www.figma.com/developers/api#access-tokens
FIGMA_ACCESS_TOKEN=your-figma-token-here

# 可选：Figma OAuth Token（企业版使用）
FIGMA_OAUTH_TOKEN=

# 可选：自定义 Figma API 端点（企业代理）
FIGMA_API_BASE=https://api.figma.com

# 可选：默认导出倍率（1-4，默认 2）
FIGMA_DEFAULT_SCALE=2

# 可选：默认颜色格式（hex/rgb/oklch/hsl，默认 oklch）
FIGMA_DEFAULT_COLOR_FORMAT=oklch

# 可选：资源输出基础目录（默认 public）
FIGMA_ASSETS_BASE_DIR=public

# 可选：资源 CDN 前缀（默认 /）
FIGMA_CDN_PREFIX=/

# v1.3.2 新增：默认语言（zh-CN/en-US）
FIGMA_DEFAULT_LANG=zh-CN

# v1.3.0 新增：GUI 默认端口（默认 54321）
FIGMA_GUI_PORT=54321
```

### MCP 配置优先级

Token 读取优先级：

1. 命令行参数 `--figma-api-key` / `-t` / `--token`
2. GUI 界面配置并保存的 Token（v1.3.0 新，自动存入安全存储）
3. 安全存储的默认 Token（v1.3.2 新，`figma-dev token set` 保存）
4. MCP 工具调用时传入的 `accessToken` 参数
5. MCP 配置中的 `env.FIGMA_ACCESS_TOKEN`
6. `.env` 文件中的 `FIGMA_ACCESS_TOKEN`
7. 系统环境变量 `FIGMA_ACCESS_TOKEN`

---

## 🏗️ 架构图

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                         用户界面层                                                 │
│  ┌──────────────┐  ┌──────────────────────────────────────────────────────────┐  │
│  │  💻 CLI 终端  │  │  🖥️ GUI 可视化配置面板 (v1.3.0)                           │  │
│  │  命令行交互   │  │  ┌──────┐ ┌──────┐ ┌───────┐ ┌────────┐ ┌──────────┐   │  │
│  │              │  │  │欢迎页│→│语言选│→│Token配│→│编辑器检│→│ 完成页    │   │  │
│  │              │  │  │      │ │择    │ │置验证 │ │测一键装│ │ 教程链接  │   │  │
│  └──────┬───────┘  │  └──────┘ └──────┘ └───────┘ └────────┘ └──────────┘   │  │
│         │          └──────────────────────────┬─────────────────────────────┘  │
│         │                                     │ 端口 54321/54322/54323          │
└─────────┼─────────────────────────────────────┼────────────────────────────────┘
          │                                     │
          └─────────────────┬───────────────────┘
                            │ HTTP (GUI) / stdio (MCP)
                            ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                      figma-dev-tools MCP Server v1.4.10                           │
│     🖥️ GUI | 🌍 i18n | ♿ a11y | 🔧 Flex Fix | 📱 Responsive | 🔒 XSS | 🗂️ Hierarchy │
│                                                                                   │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────────────────────────────┐ │
│  │  figma-url  │───▶│figma-client  │───▶│           Figma REST API            │ │
│  │  解析器      │    │ API 客户端    │    │            (figma.com)              │ │
│  └─────────────┘    └──────┬───────┘    └─────────────────────────────────────┘ │
│                            │ 🔒 AES-256-GCM 本地加密缓存                         │
│           ┌────────────────┼────────────────┐                                   │
│           ▼                ▼                ▼                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐                          │
│  │node-processor│ │design-context│ │tokens-extractor│                          │
│  │ 节点精简     │ │ 渐进式上下文  │ │ Token 提取     │                          │
│  │ GROUP扁平化  │ │ metadata概览  │ │ Variables+Styles│                         │
│  │ 🗂️层级自动修复│ │ context详情   │ │                │                          │
│  │ 语义角色标注 │ │              │ │                │                          │
│  └──────┬──────┘  └──────┬───────┘  └───────┬───────┘                          │
│         │                │                   │                                  │
│         └────────┬───────┴───────────┬───────┘                                  │
│                  ▼                   ▼                                          │
│         ┌──────────────┐   ┌────────────────┐   ┌──────────────────┐          │
│         │token-matcher │   │tailwind-mapper │   │ design-linter    │          │
│         │多级Token匹配 │   │完整属性映射    │   │ ✅ 设计规范检查   │          │
│         │codeSyntax→   │   │flex/padding/   │   │ Auto Layout/命名  │          │
│         │精确→模糊匹配 │   │gap/shadow等    │   │ 间距/尺寸/无障碍  │          │
│         │              │   │               │   │ 🗂️父子层级错位检测│          │
│         └──────┬───────┘   └───────┬────────┘   └────────┬─────────┘          │
│                │                   │                     │                    │
│                └─────────┬─────────┘                     │                    │
│                          ▼                               ▼                    │
│                ┌──────────────────┐        ┌──────────────────────┐           │
│                │  code-generator  │───────▶│ v1.4.0 Enhancements │           │
│                │  React JSX生成   │        │ ┌──────────────────┐ │           │
│                │  语义标签+cn()    │        │ │ 🔧 flex-fixer    │ │           │
│                │  TODO标记        │        │ │ ♿ a11y-enhancer  │ │           │
│                │  🔒 XSS全链路防护 │        │ │ 🎨 design-system │ │           │
│                │  Prettier格式化  │        │ │ 📱 responsive    │ │           │
│                └────────┬─────────┘        │ │ 🎨 svg-inline    │ │           │
│         ┌───────────────┴──────────────┐   │ │ ✨ animation     │ │           │
│         ▼               ▼              ▼   │ └──────────────────┘ │           │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐              │           │
│  │asset-        │ │ vue-generator│ │ svg-inline   │              │           │
│  │downloader    │ │ Vue SFC生成  │ │ renderer     │              │           │
│  │图片/SVG下载  │ │              │ │ 矢量→内联SVG │              │           │
│  │SVGO优化      │ └──────────────┘ │ svgo优化     │              │           │
│  │publicCdnUrl()│                  └──────────────┘              │           │
│  └──────┬───────┘                                                │           │
│         │                                                        │           │
│         └──────────────┬─────────────────────────────────────────┘           │
│                        ▼                                                      │
│              ┌────────────────┐      ┌──────────────┐  ┌─────┐              │
│              │  file-writer   │      │  CLI 命令    │  │i18n │              │
│              │  文件写入       │      │ gui/lint/    │  │ zh/ │              │
│              │  CSS/Tailwind/ │      │ lang/token/  │  │ en  │              │
│              │  JSON/TSX/Vue  │      │ jsx/structur │  └─────┘              │
│              │  Prettier格式化│      │ ed/sync/asset│                       │
│              └────────┬───────┘      └──────┬───────┘                       │
│                       │                   │                                 │
│                       ▼                   ▼                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────────┐ │
│  │svg-sprite-gen    │  │  token-store     │  │ 🖥️ GUI 服务器 (v1.3.0)       │ │
│  │SVG Sprite生成    │  │  🔐 安全存储      │  │ ┌───────┐ ┌───────┐ ┌──────┐ │ │
│  │TS类型定义        │  │  Keychain/凭据管  │  │ │index  │ │ app   │ │style │ │ │
│  └──────────────────┘  └──────────────────┘  │ │.html  │ │.js    │ │.css  │ │ │
│                                              │ └───────┘ └───────┘ └──────┘ │ │
│                                              │ 静态资源 + Express 服务        │ │
│                                              └──────────────────────────────┘ │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## 📋 项目结构

```
figma-dev-tools/
├── bin/
│   └── figma-dev.js           # CLI 入口（v1.3.0 新增 gui 命令）
├── mcp-standalone.mjs         # 零配置 MCP 入口（v1.1.0 新）
├── gui/                       # 🖥️ v1.3.0 新：GUI 可视化配置面板
│   ├── index.html             # GUI 主页面
│   ├── app.js                 # 前端交互逻辑
│   └── styles.css             # GUI 样式
├── src/
│   ├── index.ts               # MCP 服务器入口（v1.4.0 新增 svg-inline/hierarchy/cache）
│   ├── types.ts               # TypeScript 类型定义
│   ├── i18n/                  # 🌍 v1.3.2 新：国际化
│   │   ├── index.ts           # i18n 核心
│   │   ├── zh-CN.ts           # 中文语言包
│   │   └── en-US.ts           # 英文语言包
│   ├── cli/
│   │   └── index.ts           # CLI 命令定义
│   ├── services/
│   │   ├── figma-client.ts    # Figma REST API 客户端（含本地加密缓存）
│   │   ├── node-processor.ts  # ⭐ 节点树精简 + 语义标注 + 🗂️层级自动修复
│   │   ├── design-context.ts  # ⭐ 渐进式上下文服务
│   │   ├── token-matcher.ts   # ⭐ 多级 Token 匹配
│   │   ├── tailwind-mapper.ts # ⭐ Tailwind 属性映射
│   │   ├── code-generator.ts  # ⭐ JSX 代码生成（v1.4.0：XSS防护+import分组排序+交互推断+语义标签）
│   │   ├── vue-generator.ts   # 🟢 v1.4.0：Vue SFC 代码生成
│   │   ├── flex-fixer.ts      # 🔧 Flex 布局修复
│   │   ├── a11y-enhancer.ts   # ♿ 无障碍增强
│   │   ├── design-system.ts   # 🎨 设计系统对齐
│   │   ├── responsive-inferrer.ts # 📱 响应式推断
│   │   ├── design-linter.ts   # ✅ 设计规范检查（含🗂️层级错位检测）
│   │   ├── hierarchy-fixer.ts # 🗂️ v1.4.0：智能层级修复（父子错位自动修复）
│   │   ├── svg-inline-renderer.ts # 🎨 v1.4.0：SVG内联渲染（svgo优化+LRU缓存）
│   │   ├── animation-detector.ts  # ✨ v1.4.0：动效检测（基础框架，预留扩展）
│   │   ├── component-mapper.ts    # 🧩 v1.4.0：组件库映射（shadcn/ui等检测提示）
│   │   ├── interaction-inferrer.ts # 🤖 v1.4.0：交互逻辑推断（按钮/表单/Tab/弹窗状态自动推断）
│   │   ├── watch-mode.ts     # 👁️ v1.4.0：Watch模式（轮询Figma变更自动重生成代码）
│   │   ├── cache.ts           # ⚡ v1.4.0：AES-256-GCM本地加密缓存（LRU+TTL）
│   │   ├── code-formatter.ts  # 💅 Prettier 代码格式化
│   │   ├── asset-downloader.ts# ⭐ 资源下载管线（SVGO 优化）
│   │   ├── svg-sprite-generator.ts # 🧩 SVG Sprite 生成
│   │   ├── token-store.ts     # 🔐 Token 安全存储
│   │   ├── tokens-extractor.ts# Tokens 提取
│   │   └── file-writer.ts     # 文件写入
│   ├── types/
│   │   └── nodes.ts           # 节点类型定义
│   └── utils/
│       ├── figma-url.ts       # URL 解析
│       ├── color.ts           # 颜色转换 + CIE76 色差
│       ├── cn.ts              # className 合并工具（tailwind-merge + clsx）
│       ├── security.ts        # 🔒 v1.4.0：XSS安全防护（6个安全函数）
│       └── errors.ts          # 错误处理
├── dist/                      # 编译输出
├── .env.example               # 环境变量模板
├── FIGMA-DESIGN-GUIDELINES.md # 📖 Figma 设计规范指南
├── DEVELOPMENT.md             # 开发文档
├── OPTIMIZATION-ANALYSIS.md   # 优化分析
├── package.json               # v1.4.0
├── tsconfig.json
├── README.md                  # 本文件
├── LICENSE                    # MIT 许可证
└── SKILL.md                   # AI Agent 使用指南
```

---

## ❓ FAQ / 故障排除

### Q: 我是小白，第一次使用不知道怎么配置？

**解决（v1.3.0 新功能 - 最简单方式）：**
直接运行 GUI 可视化配置向导，无需记忆任何命令：

```bash
npx figma-dev-tools gui
```

浏览器会自动打开配置界面，按照引导步骤点击即可：

1. 选择中文语言
2. 粘贴你的 Figma Token（自动验证）
3. 勾选要配置的编辑器（自动检测已安装的）
4. 点击一键安装，完成！

### Q: 如何启动 GUI 图形界面配置？

**解决（v1.3.0 新）：** 有三种方式启动 GUI：

```bash
# 方式一：直接启动 gui 命令（推荐）
figma-dev gui
# 或 npx figma-dev-tools gui

# 方式二：向导命令加 --gui 参数
figma-dev wizard --gui

# 方式三：初始化命令加 --gui 参数
figma-dev init --gui
```

- 默认端口：**54321**
- 如果 54321 被占用，自动尝试 54322、54323
- 启动后自动打开默认浏览器
- 支持中英文切换
- Token 输入实时验证有效性
- 自动检测 8+ 种编辑器并一键安装配置

### Q: GUI 可以自定义端口吗？

**解决（v1.3.0 新）：**

```bash
# 指定端口启动
figma-dev gui --port 3000

# 或通过环境变量
FIGMA_GUI_PORT=3000 figma-dev gui
```

### Q: MCP 服务器无法启动？

**检查：**

1. 是否已执行 `npm install && npm run build`（或 pnpm/yarn/bun 对应命令）
2. `dist/index.js` 文件是否存在
3. Node.js 版本 ≥ 20（`node -v` 检查）
4. MCP 配置中的路径是否正确（建议用绝对路径）
5. 零配置方式可直接用 `npx -y figma-dev-tools --figma-api-key=xxx`
6. **推荐先用 GUI 配置**：`figma-dev gui`，自动帮你完成所有配置

### Q: API 请求返回 401 Unauthorized？

**解决：**

1. 检查 `FIGMA_ACCESS_TOKEN` 是否正确配置
2. 确认 Token 没有过期（重新生成一个试试）
3. 确认 Token 勾选了 **File content (Read only)** 权限
4. 确认你有权限访问该 Figma 文件（文件需对链接可见或你是协作者）
5. v1.3.0+ 可使用 **GUI 界面**输入 Token，实时验证有效性
6. v1.3.2+ 可使用 `figma-dev token set` 安全存储，避免明文配置错误
7. 尝试通过 `--figma-api-key` 参数直接传入 Token

### Q: 生成的图标变成椭圆/变形了？

**解决（v1.3.2 自动修复）：**

- 这是 Flex 布局的经典问题：Flex 容器默认 `align-items: stretch` 会拉伸子元素
- v1.3.2 的 `figma_generate_jsx` 已自动检测并添加 `align-items: center` +
  `flex-shrink: 0` + 固定宽高修复
- 如果问题仍然存在，可调用 `figma_lint_design` 检查设计稿中 Auto Layout 的设置

### Q: 我用的是 Vue/Svelte/其他框架，不是 React？

**解决：** 使用 v1.1.0 新增的 `figma_get_structured_data`
工具，它输出框架无关的 JSON 结构，包含完整的节点层级、样式、文本、资源信息，你可以基于这个数据生成任意框架的代码。

CLI 也支持：

```bash
npx figma-dev structured "https://www.figma.com/design/xxx/yyy?node-id=23-11032" --format json
```

> 💡 在 GUI 配置的"框架偏好"步骤中可以选择你常用的框架。

### Q: 生成的组件颜色/间距与设计稿不一致？

**解决：**

1. 确保 Figma 中使用了 **Variables** 定义颜色/间距，并设置了 `codeSyntax.WEB`
2. v1.3.2 的设计系统对齐功能会自动匹配颜色/间距/字体/圆角/阴影变量
3. 颜色格式推荐 `oklch`（Tailwind v4 原生支持），如遇问题切换为 `hex`
4. 未命中现有 token 的颜色会通过 `@theme inline` 扩展，不要直接写 `bg-[#hex]`
5. 检查生成代码中的 TODO 注释和设计系统建议报告
6. 生成前先调用 `figma_lint_design` 检查设计稿规范

### Q: 生成代码有很多冗余嵌套 div？

**解决：**

1. 使用 v1.4.0 的 `figma_generate_jsx` 而非旧版 `figma_generate_component`
2. UI 设计师应避免多层无意义 Group 嵌套（用 Frame 划分区域）
3. 调用 `figma_lint_design` 检查嵌套层级问题
4. 检查生成代码中标记为 layout-only 的节点是否被错误保留
5. 大区块建议拆分后逐块生成，避免单次处理过深节点树

### Q: 图片资源没有自动下载？

**解决：**

1. 必须调用 `figma_download_assets` 工具，传入 `generate_jsx` 输出的
   `pendingAssets[].nodeId`
2. 确保 `sceneName` 参数已设置（资源会放到 `public/<场景名>/` 目录）
3. v1.3.2 下载时自动使用 SVGO 优化 SVG，移除冗余属性
4. 检查 Figma 中的图片节点是否有 IMAGE fill
5. 网络问题：Figma 图片 CDN 可能需要科学上网

### Q: 如何让生成的代码支持响应式？

**解决（v1.3.2 新功能）：**

1. v1.3.2 的 `figma_generate_jsx`
   会自动推断响应式断点，在响应式建议报告中给出 sm/md/lg 前缀建议
2. 设计稿建议按移动端/桌面端分别设计，或使用 Auto Layout 约束
3. 根据响应式建议，手动调整类名添加响应式前缀（如 `md:flex-row`）

### Q: 生成的代码缺少无障碍属性？

**解决（v1.3.2 自动增强）：**

- v1.3.2 的 `figma_generate_jsx` 已自动添加：
  - 语义化 HTML 标签（`<button>` 而非 `<div onClick>`、`<h1>-<h6>` 等）
  - 图片 alt 文本
  - ARIA 标签和角色
  - 无障碍最小点击尺寸提示
- 无障碍增强报告会列出所有添加的增强项
- 调用 `figma_lint_design` 检查设计稿中的无障碍问题

### Q: API 请求频率限制？

- Figma API 有速率限制（约 60 请求/分钟）
- 批量下载资源时工具内部已自动节流
- 大文件建议拆分处理，避免短时间大量请求

### Q: 支持哪些前端框架？

- **React + Tailwind CSS**：一级支持（TSX 代码生成 + v1.3.2 全增强）
- **Vue 2/3 / Nuxt**：通过 `figma_get_structured_data`
  获取结构化数据，AI 可生成 Vue SFC
- **Svelte / SvelteKit**：同上
- **Angular**：同上
- **SolidJS / Qwik**：同上
- **原生 HTML / CSS**：同上
- **Astro**：同上
- **Next.js**：支持，但注意不要用 `next/image`（用普通 `<img>` 或
  `publicCdnUrl()`）
- **Vite + React**：推荐，与生成代码最匹配

> 💡 在 GUI 配置向导中可以选择你的框架偏好。

### Q: Zed 编辑器配置不生效？

**解决：** Zed 使用 `mcp_servers` 字段（下划线），不是 `mcpServers`（驼峰）。

- 使用 **`figma-dev gui`** 图形界面一键配置，自动处理 Zed 的字段差异
- 或使用 `npx figma-dev-tools install` 也会自动处理这个差异

### Q: 如何切换界面语言？

**解决（v1.3.2 新）：**

```bash
# CLI 交互式切换
figma-dev lang switch

# 直接设置
figma-dev lang set zh-CN  # 中文
figma-dev lang set en-US  # English

# 或通过环境变量
FIGMA_DEFAULT_LANG=zh-CN
```

> 💡 在 GUI 配置界面的第二步也可以直接选择语言。

### Q: 如何安全存储 Figma Token？

**解决（v1.3.0+ 推荐）：**

- **最简单**：运行
  `figma-dev gui`，在 GUI 界面输入 Token，自动验证并存入安全存储
- **命令行方式**（v1.3.2 新）：

```bash
# 交互式保存（推荐，会验证 Token）
figma-dev token set

# 直接保存
figma-dev token set -t figd_your_token_here

# 列出已保存 Token
figma-dev token list

# 查看 Token（掩码显示）
figma-dev token get

# 设置默认 Token
figma-dev token default work
```

Token 会保存在系统安全存储中：

- macOS: Keychain
- Windows: Credential Manager
- Linux: libsecret（如不可用则回退到加密文件）

---

## 📖 设计规范

参见
**[FIGMA-DESIGN-GUIDELINES.md](./FIGMA-DESIGN-GUIDELINES.md)**，这是给设计师和 AI 的完整 Figma 设计规范指南，包含：

- Auto Layout 使用规范
- 图层命名约定
- 4px/8px 网格系统
- 组件复用建议
- 无障碍设计要求
- 设计到代码的最佳实践

生成代码前建议先运行 `figma_lint_design` 检查设计稿质量。

---

## 🎯 与其他方案对比

> 以下对比基于 2025-2026 年公开信息整理，仅反映 figma-dev-tools v1.4.4 与各方案的能力差异，不代表对方全部能力。标注"需确认"表示公开资料未明确说明。

### vs 商业 SaaS 方案

| 对比维度                | figma-dev-tools v1.4.4              | Builder.io              | Anima                | Locofy                 | Seal（网易海豹 D2C）     |
| ----------------------- | ----------------------------------- | ----------------------- | -------------------- | ---------------------- | ------------------------ |
| **定位**                | 开源 MCP 工具链                     | 商业 SaaS + AI 平台     | 商业 SaaS            | 商业 SaaS              | 企业内部工具 / Figma 插件 |
| **价格**                | **免费开源**（MIT）                 | 免费增值（Pro $24/mo+） | 免费增值（$20/mo+）  | 免费增值（$29/mo+）    | 免费（需注册）           |
| **MCP 协议支持**        | ✅                                  | ✅                      | ✅                   | ✅                     | ❌                       |
| **GUI 可视化配置**      | ✅ v1.3.0（浏览器图形界面）         | ✅（Fusion 画布）       | ✅（AI Playground）  | ✅（Figma 插件）       | ✅（Figma 插件）         |
| **React 代码生成**      | ✅ TSX + Tailwind                   | ✅                      | ✅                   | ✅                     | ✅                       |
| **Vue 代码生成**        | ✅ v1.4.0（Vue 3 SFC + UnoCSS）     | ✅                      | ✅                   | ✅                     | ✅                       |
| **框架无关结构化数据**  | ✅ v1.1.0（JSON 输出）              | ❌                      | ❌                   | ❌                     | ❌                       |
| **设计 Tokens 提取**    | ✅ Variables + Styles               | ✅                      | 需确认               | ✅                     | 需确认                   |
| **Flex 布局自动修复**   | ✅ v1.3.2（图标变形/文本截断）       | 部分（自动响应式）      | ✅                   | ✅                     | ✅（自动布局还原）       |
| **无障碍（a11y）增强**  | ✅ v1.3.2（语义标签/alt/ARIA）       | ✅（Review agents）     | 需确认               | ✅（Agent Mode）       | 需确认                   |
| **资源自动下载**        | ✅ publicCdnUrl + SVGO              | ✅                      | ✅                   | ✅                     | 需确认                   |
| **还原度校验（像素 diff）** | ✅ v1.4.4（pixelmatch + 热力图） | ❌                      | ❌                   | 需确认（"pixel-perfect"宣传） | 部分（设计稿检查） |
| **付费墙兜底（截图保底）** | ✅ v1.4.4（Playwright + 视觉近似） | ❌                      | ❌                   | ❌                     | ❌                       |
| **多编辑器集成**        | ✅ 8+（GUI 自动检测一键安装）       | ✅（VS Code/Cursor）    | ✅（Frontier 扩展）  | ✅（Cursor/Windsurf 等） | ❌                       |
| **CLI 命令行**          | ✅ 20+ 命令                         | ✅（Visual Copilot CLI） | 需确认               | 需确认                 | ❌                       |
| **i18n 国际化**         | ✅ v1.3.2（中英文双语）             | ✅                      | 需确认               | ✅（Agent Mode 指令）  | 需确认                   |
| **Token 安全存储**      | ✅ v1.3.2（系统密钥链）             | ✅                      | 需确认               | 需确认                 | 需确认                   |

### vs 开源 / 官方工具

| 对比维度                | figma-dev-tools v1.4.4              | @figma/code-connect           | Framelink Figma MCP            | figma-mcp（社区）     | Design Lint AI            |
| ----------------------- | ----------------------------------- | ----------------------------- | ------------------------------ | --------------------- | ------------------------- |
| **定位**                | 开源 MCP 工具链                     | Figma 官方组件映射            | 开源 MCP（8k+ stars）          | 开源 MCP（多个项目）  | Figma 插件                |
| **价格**                | **免费开源**（MIT）                 | 免费（需 Dev/Full 席位）      | 免费开源（MIT）                | 免费开源              | 免费增值（Pro $19/mo+）  |
| **MCP 协议支持**        | ✅                                  | ✅（与官方 MCP 集成）         | ✅                             | ✅                    | ❌                        |
| **GUI 可视化配置**      | ✅ v1.3.0                           | ✅（Code Connect UI 公测）    | ❌（配置文件驱动）             | ❌                    | ✅（Figma 插件）          |
| **代码生成**            | ✅ 一键 TSX/Vue                     | ❌（仅组件映射，非 D2C）      | ❌（仅提供数据，由 AI 生成）   | ❌（仅提供数据）      | N/A（非代码生成工具）     |
| **设计 Tokens 提取**    | ✅                                  | ✅（variables + code syntax） | ❌                             | ❌                    | ✅（Token validation）   |
| **Flex 布局自动修复**   | ✅ v1.3.2                           | ❌                             | ❌                             | 部分（Auto-Layout 配置） | ❌                      |
| **无障碍（a11y）增强**  | ✅ v1.3.2                           | ❌                             | ❌                             | ❌                    | ✅（WCAG 检查）           |
| **资源自动下载**        | ✅                                  | ❌                             | ✅（download_figma_images）   | ✅                    | ❌                        |
| **还原度校验（像素 diff）** | ✅ v1.4.4                       | ❌                             | ❌                             | ❌                    | ❌                        |
| **付费墙兜底（截图保底）** | ✅ v1.4.4                        | N/A（官方功能不涉及付费墙）   | ❌                             | ❌                    | ❌                        |
| **多编辑器集成**        | ✅ 8+（GUI 自动检测）               | ✅（VS Code/Cursor/Android Studio 等） | ✅（所有 MCP 客户端）   | ✅（所有 MCP 客户端） | ❌                        |
| **CLI 命令行**          | ✅ 20+ 命令                         | ✅（`figma connect` CLI）     | ✅（npx 启动）                 | ✅                    | ❌（Team API）            |
| **i18n 国际化**         | ✅ v1.3.2                           | ❌                             | ❌                             | ❌                    | ❌                        |
| **SVG Sprite 生成**     | ✅ v1.3.2                           | ❌                             | ❌                             | ❌                    | ❌                        |

### 差异化优势

- **付费墙兜底**：figma-dev-tools v1.4.4 独有的 `BrowserFallbackService`，当 Figma REST API 因付费墙失败时自动启动 Playwright 截图保底，竞品中无一提供类似机制
- **还原度校验闭环**：`figma_verify_fidelity` 提供像素 diff + 差异热力图 + 量化评分（0-100%），其他工具多停留在"pixel-perfect"宣传，无自动化校验
- **框架无关结构化数据**：`figma_get_structured_data` 输出标准 JSON，支持任意框架，商业 SaaS 多锁定特定框架
- **开源 + 免费 + 全功能**：MIT 许可，无需付费席位即可使用全部 19 个 MCP 工具

---

## 📜 License

MIT © figma-dev-tools contributors
