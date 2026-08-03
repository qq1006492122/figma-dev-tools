# 🎨 Figma Dev Tools v1.3.1

> Figma → 任意前端框架 设计到代码一键转换 MCP 服务器

**打通 Figma 设计与前端研发的完整工具链**，支持设计 Tokens 智能提取、高保真组件生成（React/Vue/Svelte/HTML 等）、资源自动下载、跨编辑器 MCP 集成。专为 AI Agent 优化，解决 div soup、上下文爆炸、hex 写死、资源路径处理、Flex 布局变形、无障碍缺失、响应式适配等核心痛点。

---

## ✨ v1.3.1 重磅更新

| 新特性 | 说明 |
|--------|------|
| 🌍 **i18n 国际化** | 完整支持中文/英文双语界面，CLI 和 MCP 工具可切换语言 |
| ♿ **无障碍(a11y)增强** | 自动识别语义标签、添加 alt 文本、注入 ARIA 属性，确保生成代码符合 WCAG 标准 |
| 🔧 **Flex 布局自动修复** | 智能检测并修复图标变形、文本截断、溢出滚动等经典 Flex 问题，添加 `align-items: center`、`flex-shrink: 0` 等修复类 |
| 🎨 **设计系统对齐** | 自动匹配颜色变量、间距、字体、圆角、阴影，输出与项目设计系统一致的代码 |
| 📱 **响应式推断** | 根据设计稿尺寸智能推断设备类型，提供 sm/md/lg/xl 响应式前缀建议 |
| ✅ **设计规范检查 (Lint)** | 代码生成前预检设计稿质量，识别 Auto Layout 问题、图层命名、规范间距等，评分低于 80 分给出修复建议 |
| 🔐 **Token 安全存储** | 支持系统 Keychain/Credential Manager 安全存储 Figma Token，避免明文泄露 |
| 🧩 **SVG Sprite 生成** | 批量下载图标后自动合并为 SVG Sprite，生成 TypeScript 类型定义，减少 HTTP 请求 |
| 💅 **Prettier 自动格式化** | 生成代码自动使用 Prettier 格式化，保持代码风格一致 |
| 📖 **设计规范文档** | 新增 FIGMA-DESIGN-GUIDELINES.md，给设计师和 AI 的完整 Figma 设计规范指南 |

---

## ✨ 功能亮点

| 特性 | 说明 |
|------|------|
| 🔗 **16 个 MCP 工具** | 完整覆盖 URL 解析 → Token 提取 → 组件生成 → 资源下载全流程 |
| 🧠 **框架无关结构化数据** | 输出 id/name/role/type/size/layout/styles/text/asset/children JSON，支持 Vue/Svelte/HTML/Angular/Solid 等任意框架 |
| ⚛️ **React + Tailwind 一级支持** | 语义标签选择 + Tailwind 映射 + cn() 合并 + TODO 标记，一键生成高保真 TSX |
| 🔧 **Flex 布局自动修复** | v1.3.1 新增：智能修复图标变形、文本截断、溢出等 Flex 问题 |
| ♿ **无障碍增强** | v1.3.1 新增：自动添加语义标签、alt、ARIA 属性 |
| 🎨 **设计系统对齐** | v1.3.1 新增：自动匹配颜色/间距/字体/圆角/阴影变量 |
| 📱 **响应式推断** | v1.3.1 新增：智能推断断点，提供响应式前缀建议 |
| ✅ **设计规范预检** | v1.3.1 新增：生成代码前检查设计稿质量并给出修复建议 |
| 🧠 **智能层级精简** | 自动扁平化冗余 GROUP/FRAME，消除 ~60% 无意义嵌套 div |
| 📊 **渐进式上下文** | metadata 概览（~4KB）→ designContext 详情，避免上下文爆炸 |
| 🎯 **多级 Token 匹配** | codeSyntax.WEB → 精确 hex → CIE76 色差模糊 → @theme 扩展建议 |
| 🖼️ **资源自动管线** | 检测图片/SVG → 下载到 public/ → SVGO 优化 → 生成 publicCdnUrl() 引用 |
| 🧩 **SVG Sprite 生成** | v1.3.1 新增：批量图标合并为 Sprite，支持 CSS color 控制颜色 |
| 🌍 **i18n 国际化** | v1.3.1 新增：中英文双语支持，`figma-dev lang switch` 切换 |
| 🔐 **安全 Token 存储** | v1.3.1 新增：系统密钥链安全存储 Token |
| 💻 **CLI 命令行** | 支持脚本和 CI/CD 集成，无需 MCP 也可使用，新增 structured/lint/lang/token 命令 |
| 🔄 **10+ 编辑器支持** | Trae、VS Code、Cursor、Windsurf、Claude Desktop、Zed、Cline、Roo Code 一键安装 |
| 🚀 **零配置启动** | 支持 `npx -y figma-dev-tools --figma-api-key=xxx` 直接运行，无需提前安装配置 |

---

## 🚀 快速开始

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
- 检测已安装的 AI 编辑器（Trae/VS Code/Cursor/Windsurf/Claude Desktop/Zed/Cline/Roo Code）
- 自动检测包管理器（npm/pnpm/yarn/bun）
- 下载/编译工具
- 配置对应编辑器的 MCP settings（Zed 使用 mcp_servers 字段）
- 生成 `.env.example` 模板

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

## ⚡ 快速开始

### 1. 获取 Figma Access Token

1. 登录 [Figma](https://www.figma.com/)
2. 点击右上角头像 → **Settings** → **Account**
3. 找到 **Personal access tokens** → **Generate new token**
4. 输入名称，勾选 **File content (Read only)** 权限
5. 复制生成的 Token（⚠️ 只显示一次）

### 2. 配置 Token

**方式 A：安全存储（推荐 v1.3.1+）**

```bash
# 交互式保存 Token 到系统密钥链
figma-dev token set

# 或直接通过参数
figma-dev token set -t figd_your_token_here
```

**方式 B：通过命令行参数**

```bash
npx figma-dev-tools --figma-api-key=your-figma-token-here
# 或短参数
npx figma-dev-tools -t your-figma-token-here
```

**方式 C：通过 .env 文件**

在 `figma-dev-tools/` 目录创建 `.env` 文件：

```env
FIGMA_ACCESS_TOKEN=your-figma-token-here
```

**方式 D：MCP 配置 env**

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

**React + Tailwind（推荐，v1.3.1 增强版）：**

在 AI 编辑器（如 Trae）中，直接对话：

```
帮我用 figma-dev-tools 还原这个 Figma 设计稿：
https://www.figma.com/design/xxxxx/MyProject?node-id=23-11032

场景名：landing-page
组件名：HeroSection
```

AI 将自动执行以下增强流程（v1.3.1）：
1. `figma_lint_design` - 设计规范预检（可选，提示问题）
2. `figma_parse_url` 解析链接
3. `figma_get_metadata` 获取页面结构概览
4. `figma_get_screenshot` 获取视觉基准
5. `figma_generate_jsx` 一键生成 TSX 代码（含 Flex 修复、a11y 增强、设计系统对齐、响应式推断）
6. `figma_download_assets` 下载图片资源（SVGO 自动优化）

**其他框架（Vue/Svelte/HTML 等）：**

使用 `figma_get_structured_data` 工具获取框架无关的 JSON 结构：

```
帮我用 figma_get_structured_data 获取这个 Figma 节点的结构化数据，然后生成 Vue 组件：
https://www.figma.com/design/xxxxx/MyProject?node-id=23-11032
```

### CLI 快速体验

```bash
# 查看文件信息
npx figma-dev info "https://www.figma.com/design/xxxxx/MyProject?node-id=23-11032"

# 设计规范预检（v1.3.1 新）
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

# 语言设置（v1.3.1 新）
npx figma-dev lang switch  # 交互式切换中英文
npx figma-dev lang set zh-CN

# Token 安全管理（v1.3.1 新）
npx figma-dev token set     # 保存 Token 到密钥链
npx figma-dev token list    # 列出已保存 Token
```

---

## 🔧 MCP 工具参考

共 **16 个 MCP 工具**，按使用流程排列：

| # | 工具名称 | 功能 | 关键参数 | 版本 |
|---|---------|------|---------|------|
| 1 | `figma_parse_url` | 解析 Figma URL，提取 fileKey/nodeId | `url` | v1 |
| 2 | `figma_validate_token` | 验证 Figma Access Token 有效性 | `accessToken` | v1 |
| 3 | `figma_get_file` | 获取文件基本信息（页面列表、组件数） | `fileKey` / `figmaUrl` | v1 |
| 4 | `figma_list_components` | 列出文件中 Components/ComponentSets | `fileKey` | v2 |
| 5 | `figma_get_metadata` | **高层结构概览**（~4KB，避免上下文爆炸） | `fileKey/nodeId/depth` | v2 |
| 6 | `figma_get_design_context` | **精简设计上下文**（层级扁平+语义标注+资源列表） | `fileKey/nodeId/maxDepth` | v2 |
| 7 | `figma_get_screenshot` | 获取节点高清截图 | `fileKey/nodeId/scale` | v1 |
| 8 | `figma_get_structured_data` | **⭐ 框架无关结构化数据**（id/name/role/type/size/layout/styles/text/asset/children） | `fileKey/nodeId/maxDepth` | v1.1.0 |
| 9 | `figma_lint_design` | **⭐ v1.3.1 新：代码还原质量预检** | `fileKey/nodeId/maxDepth` | **v1.3.1** |
| 10 | `figma_generate_jsx` | **⭐ 一键生成 React+Tailwind TSX**（含 Flex 修复/a11y/设计系统/响应式） | `fileKey/nodeId/componentName/sceneName` | v1.3.1 增强 |
| 11 | `figma_generate_component` | 基础组件生成（旧版，推荐 generate_jsx） | `fileKey/nodeId/styleFormat` | v1 |
| 12 | `figma_download_assets` | **下载资源到 public/<场景>/ + SVGO 优化 + publicCdnUrl** | `fileKey/sceneName/assetNodeIds` | v2 |
| 13 | `figma_create_icon_sprite` | **⭐ v1.3.1 新：生成 SVG Sprite 雪碧图** | `svgDir/outputPath/typesPath` | **v1.3.1** |
| 14 | `figma_extract_tokens` | 提取设计 Tokens（Variables+Styles） | `fileKey/colorFormat` | v1 |
| 15 | `figma_generate_styles` | 生成 CSS Variables / Tailwind v4 @theme | `tokens/outputFormat` | v1 |
| 16 | `figma_sync_to_project` | 写入 tokens 到项目文件（自动备份） | `tokens/outputDir/format` | v1 |

### 工具详细参数

#### `figma_generate_jsx`（v1.3.1 增强版，最常用）

```typescript
{
  figmaUrl?: string;           // Figma 链接（可替代 fileKey+nodeId）
  fileKey?: string;            // Figma 文件 Key
  nodeId?: string;             // 目标节点 ID
  componentName?: string;      // 组件名（如 HeroSection）
  sceneName?: string;          // 场景名（用于资源路径，如 landing-page）
  maxDepth?: number;           // 遍历深度，默认 8
  skipEnhancements?: boolean;  // 是否跳过 v1.3.1 增强（Flex/a11y/设计系统/响应式）
  skipLintCheck?: boolean;     // 是否跳过设计规范检查提示
  accessToken?: string;        // 可选，优先用环境变量
}
```

**v1.3.1 增强输出：**
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

#### `figma_lint_design`（v1.3.1 新，代码还原质量预检）

```typescript
{
  figmaUrl?: string;           // Figma 链接
  fileKey?: string;            // Figma 文件 Key
  nodeId?: string;             // 目标节点 ID（可选，默认检查整个文件）
  maxDepth?: number;           // 最大检查深度，默认 8
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

#### `figma_create_icon_sprite`（v1.3.1 新，SVG Sprite 生成）

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
  maxDepth?: number;           // 遍历深度，默认 8（1-10）
  accessToken?: string;        // 可选，优先用环境变量
}
```

**输出内容：**
- 完整的框架无关 JSON 结构，每个节点包含：
  - `id` / `name` - 节点标识
  - `role` - 语义角色（button/card/image/text/icon/section 等）
  - `type` - Figma 节点类型（FRAME/TEXT/RECTANGLE/GROUP/INSTANCE 等）
  - `size` - { width, height }
  - `layout` - Flex 布局属性（display/flexDirection/justifyContent/alignItems/gap/padding 等）
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

# 传入 API Key
npx figma-dev-tools --figma-api-key=your-token <command>
npx figma-dev-tools -t your-token <command>

# 切换语言（v1.3.1 新）
npx figma-dev-tools -l zh-CN <command>
```

| 命令 | 功能 | 常用选项 | 版本 |
|------|------|---------|------|
| `figma-dev install` | 一键安装 MCP 配置到各编辑器 | - | v1 |
| `figma-dev validate <token>` | 验证 Token | - | v1 |
| `figma-dev lang` | **🌍 语言设置**（set/list/switch） | `set <lang>` / `switch` | **v1.3.1** |
| `figma-dev token` | **🔐 Token 安全管理**（set/get/list/delete/default） | `set -t <token>` | **v1.3.1** |
| `figma-dev info <url>` | 查看文件信息 | - | v1 |
| `figma-dev lint <url>` | **✅ 设计规范预检** | `--node <id>` `--depth <n>` `--format md/json` `--output <file>` | **v1.3.1** |
| `figma-dev metadata <url>` | 获取元数据概览 | `--depth <n>` | v2 |
| `figma-dev structured <url>` | **获取框架无关结构化数据** | `--node <id>` `--depth <n>` `--format pretty/json` `--output <file>` | v1.1.0 |
| `figma-dev jsx <url>` | **生成增强版 JSX 组件**（Flex/a11y/设计系统/响应式） | `--name <ComponentName>` `--scene <name>` `--depth <n>` `--skip-lint` | v1.3.1 |
| `figma-dev component <url>` | 生成基础组件 | `--name <name>` `--typescript` `--style tailwind` | v1 |
| `figma-dev assets <url>` | 下载资源（SVGO 优化） | `--scene <name>` `--nodes <id1,id2>` `--scale <n>` | v2 |
| `figma-dev sync <url>` | 同步 Tokens | `--format oklch` `--output <dir>` `--output-format all` | v1 |
| `figma-dev screenshot <url>` | 获取截图 | `--format png` `--scale 2` `--output <dir>` | v1 |
| `figma-dev tokens <url>` | 提取 Tokens | `--format oklch` | v1 |
| `figma-dev mcp` | 启动 MCP 服务器（stdio） | - | v1 |
| `figma-dev init` | 初始化配置（交互式向导） | - | v1.3.1 |

**CLI 示例：**

```bash
# 设计规范预检（v1.3.1 新）
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

# 生成 SVG Sprite（v1.3.1 新，需先下载图标）
# 通过 MCP 工具 figma_create_icon_sprite 调用

# 保存 Token 到系统密钥链（v1.3.1 新）
figma-dev token set -t figd_your_token_here

# 切换到中文界面（v1.3.1 新）
figma-dev lang set zh-CN
```

---

## 🖥️ 支持的编辑器（10+）

| 编辑器 | 一键安装 | 配置格式 | 手动配置路径 |
|--------|---------|---------|-------------|
| **Trae** | ✅ 自动检测安装 | mcpServers | 项目根目录 `.mcp.json` 或 User Settings |
| **VS Code** | ✅ 自动检测安装 | mcpServers | `.vscode/mcp.json` 或 User Settings JSON |
| **Cursor** | ✅ 自动检测安装 | mcpServers | `~/.cursor/mcp.json`（全局）或项目 `.cursor/mcp.json` |
| **Windsurf** | ✅ 自动检测安装 | mcpServers | `~/.codeium/windsurf/mcp_config.json` |
| **Claude Desktop** | ✅ 自动检测安装 | mcpServers | `~/Library/Application Support/Claude/claude_desktop_config.json`（macOS）<br>`%APPDATA%\Claude\claude_desktop_config.json`（Windows） |
| **Zed** | ✅ 自动检测安装 | **mcp_servers** | `~/.zed/settings.json` |
| **Cline** (VS Code/Cursor 插件) | ✅ 自动检测安装 | mcpServers | VS Code/Cursor 全局存储 `cline_mcp_settings.json` |
| **Roo Code** (VS Code/Cursor 插件) | ✅ 自动检测安装 | mcpServers | VS Code/Cursor 全局存储 `mcp_settings.json` |

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

> 💡 使用 `npx figma-dev-tools install` 会自动检测编辑器并填充正确路径，Zed 会自动使用 `mcp_servers` 字段。

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

# v1.3.1 新增：默认语言（zh-CN/en-US）
FIGMA_DEFAULT_LANG=zh-CN
```

### MCP 配置优先级

Token 读取优先级：
1. 命令行参数 `--figma-api-key` / `-t` / `--token`
2. 安全存储的默认 Token（v1.3.1 新，`figma-dev token set` 保存）
3. MCP 工具调用时传入的 `accessToken` 参数
4. MCP 配置中的 `env.FIGMA_ACCESS_TOKEN`
5. `.env` 文件中的 `FIGMA_ACCESS_TOKEN`
6. 系统环境变量 `FIGMA_ACCESS_TOKEN`

---

## 🏗️ 架构图

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           AI Editor (MCP Client)                         │
│  ┌──────┐ ┌───────┐ ┌───────┐ ┌────────┐ ┌───────┐ ┌─────┐ ┌──────┐   │
│  │ Trae │ │VS Code│ │Cursor │ │Windsurf│ │ Claude│ │ Zed │ │Cline │...│
│  └──┬───┘ └───┬───┘ └───┬───┘ └───┬────┘ └───┬───┘ └──┬──┘ └──┬───┘   │
└─────┼─────────┼─────────┼─────────┼──────────┼────────┼───────┼────────┘
      └─────────┴─────────┴─────────┴─────┬────┴────────┴───────┘
                                          │ stdio MCP
                                          ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    figma-dev-tools MCP Server v1.3.1                     │
│                    🌍 i18n | ♿ a11y | 🔧 Flex Fix | 📱 Responsive        │
│                                                                           │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────────────────────┐ │
│  │  figma-url  │───▶│figma-client  │───▶│       Figma REST API        │ │
│  │  解析器      │    │ API 客户端    │    │        (figma.com)          │ │
│  └─────────────┘    └──────┬───────┘    └─────────────────────────────┘ │
│                            │                                             │
│           ┌────────────────┼────────────────┐                           │
│           ▼                ▼                ▼                           │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐                  │
│  │node-processor│ │design-context│ │tokens-extractor│                  │
│  │ 节点精简     │ │ 渐进式上下文  │ │ Token 提取     │                  │
│  │ GROUP扁平化  │ │ metadata概览  │ │ Variables+Styles│                 │
│  │ 语义角色标注 │ │ context详情   │ │                │                  │
│  └──────┬──────┘  └──────┬───────┘  └───────┬───────┘                  │
│         │                │                   │                          │
│         └────────┬───────┴───────────┬───────┘                          │
│                  ▼                   ▼                                  │
│         ┌──────────────┐   ┌────────────────┐   ┌──────────────────┐  │
│         │token-matcher │   │tailwind-mapper │   │ design-linter    │  │
│         │多级Token匹配 │   │完整属性映射    │   │ ✅ 设计规范检查   │  │
│         │codeSyntax→   │   │flex/padding/   │   │ Auto Layout/命名  │  │
│         │精确→模糊匹配 │   │gap/shadow等    │   │ 间距/尺寸/无障碍  │  │
│         └──────┬───────┘   └───────┬────────┘   └────────┬─────────┘  │
│                │                   │                     │            │
│                └─────────┬─────────┘                     │            │
│                          ▼                               ▼            │
│                ┌──────────────────┐        ┌──────────────────────┐   │
│                │  code-generator  │───────▶│ v1.3.1 Enhancements │   │
│                │  React JSX生成   │        │ ┌──────────────────┐ │   │
│                │  语义标签+cn()    │        │ │ 🔧 flex-fixer    │ │   │
│                │  TODO标记        │        │ │ ♿ a11y-enhancer  │ │   │
│                │  Prettier格式化  │        │ │ 🎨 design-system │ │   │
│                └────────┬─────────┘        │ │ 📱 responsive    │ │   │
│                         │                  │ └──────────────────┘ │   │
│         ┌───────────────┴──────────────┐   └──────────────────────┘   │
│         ▼                              ▼                               ▼        │
│  ┌──────────────┐             ┌────────────────┐      ┌──────────────┐ ┌─────┐│
│  │asset-        │             │  file-writer   │      │  CLI 命令    │ │i18n ││
│  │downloader    │             │  文件写入       │      │ lint/lang/   │ │ zh/ ││
│  │图片/SVG下载  │             │  CSS/Tailwind/ │      │ token/jsx/   │ │ en  ││
│  │SVGO优化      │             │  JSON输出      │      │ structured/  │ └─────┘│
│  │publicCdnUrl()│             │  Prettier格式化│      │ sync/assets  │        │
│  └──────┬───────┘             └────────────────┘      └──────┬───────┘        │
│         │                                                   │                │
│         ▼                                                   ▼                │
│  ┌──────────────────┐                              ┌──────────────────┐      │
│  │svg-sprite-gen    │                              │  token-store     │      │
│  │SVG Sprite生成    │                              │  🔐 安全存储      │      │
│  │TS类型定义        │                              │  Keychain/凭据管  │      │
│  └──────────────────┘                              └──────────────────┘      │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 📋 项目结构

```
figma-dev-tools/
├── bin/
│   └── figma-dev.js           # CLI 入口
├── mcp-standalone.mjs         # 零配置 MCP 入口（v1.1.0 新）
├── src/
│   ├── index.ts               # MCP 服务器入口（v1.3.1 新增 lint/sprite 工具）
│   ├── types.ts               # TypeScript 类型定义
│   ├── i18n/                  # 🌍 v1.3.1 新：国际化
│   │   ├── index.ts           # i18n 核心
│   │   ├── zh-CN.ts           # 中文语言包
│   │   └── en-US.ts           # 英文语言包
│   ├── cli/
│   │   └── index.ts           # CLI 命令定义（v1.3.1 新增 lang/token/lint 命令）
│   ├── services/
│   │   ├── figma-client.ts    # Figma REST API 客户端
│   │   ├── node-processor.ts  # ⭐ 节点树精简 + 语义标注
│   │   ├── design-context.ts  # ⭐ 渐进式上下文服务
│   │   ├── structured-data.ts # ⭐ 框架无关结构化数据构建（v1.1.0 新）
│   │   ├── token-matcher.ts   # ⭐ 多级 Token 匹配
│   │   ├── tailwind-mapper.ts # ⭐ Tailwind 属性映射
│   │   ├── code-generator.ts  # ⭐ JSX 代码生成（v1.3.1 增强）
│   │   ├── flex-fixer.ts      # 🔧 v1.3.1 新：Flex 布局修复
│   │   ├── a11y-enhancer.ts   # ♿ v1.3.1 新：无障碍增强
│   │   ├── design-system.ts   # 🎨 v1.3.1 新：设计系统对齐
│   │   ├── responsive-inferrer.ts # 📱 v1.3.1 新：响应式推断
│   │   ├── design-linter.ts   # ✅ v1.3.1 新：设计规范检查
│   │   ├── code-formatter.ts  # 💅 v1.3.1 新：Prettier 代码格式化
│   │   ├── asset-downloader.ts# ⭐ 资源下载管线（SVGO 优化）
│   │   ├── svg-sprite-generator.ts # 🧩 v1.3.1 新：SVG Sprite 生成
│   │   ├── token-store.ts     # 🔐 v1.3.1 新：Token 安全存储
│   │   ├── tokens-extractor.ts# Tokens 提取
│   │   └── file-writer.ts     # 文件写入
│   ├── types/
│   │   └── nodes.ts           # 节点类型定义
│   └── utils/
│       ├── figma-url.ts       # URL 解析
│       ├── color.ts           # 颜色转换 + CIE76 色差
│       ├── cn.ts              # className 合并工具（tailwind-merge + clsx）
│       └── errors.ts          # 错误处理
├── dist/                      # 编译输出
├── install.mjs                # 一键安装脚本（v1.1.0 支持多包管理器/多编辑器）
├── uninstall.mjs              # 卸载脚本
├── .env.example               # 环境变量模板（v1.3.1 新增语言配置）
├── FIGMA-DESIGN-GUIDELINES.md # 📖 v1.3.1 新：Figma 设计规范指南
├── DEVELOPMENT.md             # 开发文档
├── OPTIMIZATION-ANALYSIS.md   # 优化分析
├── package.json               # v1.3.1
├── tsconfig.json
├── README.md                  # 本文件
├── LICENSE                    # MIT 许可证
└── SKILL.md                   # AI Agent 使用指南
```

---

## ❓ FAQ / 故障排除

### Q: MCP 服务器无法启动？

**检查：**
1. 是否已执行 `npm install && npm run build`（或 pnpm/yarn/bun 对应命令）
2. `dist/index.js` 文件是否存在
3. Node.js 版本 ≥ 20（`node -v` 检查）
4. MCP 配置中的路径是否正确（建议用绝对路径）
5. 零配置方式可直接用 `npx -y figma-dev-tools --figma-api-key=xxx`

### Q: API 请求返回 401 Unauthorized？

**解决：**
1. 检查 `FIGMA_ACCESS_TOKEN` 是否正确配置
2. 确认 Token 没有过期（重新生成一个试试）
3. 确认 Token 勾选了 **File content (Read only)** 权限
4. 确认你有权限访问该 Figma 文件（文件需对链接可见或你是协作者）
5. v1.3.1+ 可使用 `figma-dev token set` 安全存储，避免明文配置错误
6. 尝试通过 `--figma-api-key` 参数直接传入 Token

### Q: 生成的图标变成椭圆/变形了？

**解决（v1.3.1 自动修复）：**
- 这是 Flex 布局的经典问题：Flex 容器默认 `align-items: stretch` 会拉伸子元素
- v1.3.1 的 `figma_generate_jsx` 已自动检测并添加 `align-items: center` + `flex-shrink: 0` + 固定宽高修复
- 如果问题仍然存在，可调用 `figma_lint_design` 检查设计稿中 Auto Layout 的设置

### Q: 我用的是 Vue/Svelte/其他框架，不是 React？

**解决：**
使用 v1.1.0 新增的 `figma_get_structured_data` 工具，它输出框架无关的 JSON 结构，包含完整的节点层级、样式、文本、资源信息，你可以基于这个数据生成任意框架的代码。

CLI 也支持：
```bash
npx figma-dev structured "https://www.figma.com/design/xxx/yyy?node-id=23-11032" --format json
```

### Q: 生成的组件颜色/间距与设计稿不一致？

**解决：**
1. 确保 Figma 中使用了 **Variables** 定义颜色/间距，并设置了 `codeSyntax.WEB`
2. v1.3.1 的设计系统对齐功能会自动匹配颜色/间距/字体/圆角/阴影变量
3. 颜色格式推荐 `oklch`（Tailwind v4 原生支持），如遇问题切换为 `hex`
4. 未命中现有 token 的颜色会通过 `@theme inline` 扩展，不要直接写 `bg-[#hex]`
5. 检查生成代码中的 TODO 注释和设计系统建议报告
6. 生成前先调用 `figma_lint_design` 检查设计稿规范

### Q: 生成代码有很多冗余嵌套 div？

**解决：**
1. 使用 v2.0 的 `figma_generate_jsx` 而非旧版 `figma_generate_component`
2. UI 设计师应避免多层无意义 Group 嵌套（用 Frame 划分区域）
3. 调用 `figma_lint_design` 检查嵌套层级问题
4. 检查生成代码中标记为 layout-only 的节点是否被错误保留
5. 大区块建议拆分后逐块生成，避免单次处理过深节点树

### Q: 图片资源没有自动下载？

**解决：**
1. 必须调用 `figma_download_assets` 工具，传入 `generate_jsx` 输出的 `pendingAssets[].nodeId`
2. 确保 `sceneName` 参数已设置（资源会放到 `public/<场景名>/` 目录）
3. v1.3.1 下载时自动使用 SVGO 优化 SVG，移除冗余属性
4. 检查 Figma 中的图片节点是否有 IMAGE fill
5. 网络问题：Figma 图片 CDN 可能需要科学上网

### Q: 如何让生成的代码支持响应式？

**解决（v1.3.1 新功能）：**
1. v1.3.1 的 `figma_generate_jsx` 会自动推断响应式断点，在响应式建议报告中给出 sm/md/lg 前缀建议
2. 设计稿建议按移动端/桌面端分别设计，或使用 Auto Layout 约束
3. 根据响应式建议，手动调整类名添加响应式前缀（如 `md:flex-row`）

### Q: 生成的代码缺少无障碍属性？

**解决（v1.3.1 自动增强）：**
- v1.3.1 的 `figma_generate_jsx` 已自动添加：
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

- **React + Tailwind CSS**：一级支持（TSX 代码生成 + v1.3.1 全增强）
- **Vue 2/3 / Nuxt**：通过 `figma_get_structured_data` 获取结构化数据，AI 可生成 Vue SFC
- **Svelte / SvelteKit**：同上
- **Angular**：同上
- **SolidJS / Qwik**：同上
- **原生 HTML / CSS**：同上
- **Astro**：同上
- **Next.js**：支持，但注意不要用 `next/image`（用普通 `<img>` 或 `publicCdnUrl()`）
- **Vite + React**：推荐，与生成代码最匹配

### Q: Zed 编辑器配置不生效？

**解决：**
Zed 使用 `mcp_servers` 字段（下划线），不是 `mcpServers`（驼峰）。使用 `npx figma-dev-tools install` 会自动处理这个差异。

### Q: 如何切换界面语言？

**解决（v1.3.1 新）：**
```bash
# CLI 交互式切换
figma-dev lang switch

# 直接设置
figma-dev lang set zh-CN  # 中文
figma-dev lang set en-US  # English

# 或通过环境变量
FIGMA_DEFAULT_LANG=zh-CN
```

### Q: 如何安全存储 Figma Token？

**解决（v1.3.1 新）：**
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

参见 **[FIGMA-DESIGN-GUIDELINES.md](./FIGMA-DESIGN-GUIDELINES.md)**，这是给设计师和 AI 的完整 Figma 设计规范指南，包含：
- Auto Layout 使用规范
- 图层命名约定
- 4px/8px 网格系统
- 组件复用建议
- 无障碍设计要求
- 设计到代码的最佳实践

生成代码前建议先运行 `figma_lint_design` 检查设计稿质量。

---

## 🎯 与其他方案对比

### vs 官方 Figma MCP (Framelink)

| 特性 | Framelink (官方 Figma MCP) | figma-dev-tools v1.0 | figma-dev-tools v1.3.1 | figma-dev-tools v1.3.1 |
|------|---------------------------|---------------------|-----------------------|-----------------------|
| 设计上下文获取 | ✅ 全量拉取 | ✅ | ✅ **渐进式（~4KB 概览，防爆炸）** | ✅ |
| 节点截图 | ✅ | ✅ | ✅ | ✅ |
| 节点树精简 | ❌ | ❌ | ✅ **GROUP 扁平化，减少 ~60% div** | ✅ |
| 语义角色识别 | ❌ | ❌ | ✅ **button/card/image/text 自动识别** | ✅ |
| Design Tokens 提取 | ❌ | ✅ Variables+Styles | ✅ + codeSyntax.WEB 支持 | ✅ |
| 多级 Token 匹配 | ❌ | ❌ | ✅ **4级匹配策略** | ✅ |
| Tailwind v4 @theme | ❌ | ✅ | ✅ | ✅ |
| React 组件生成 | 基础 JSX | ✅ | ✅ **一键 JSX 整合全管线** | ✅ + **🔧 Flex/♿ a11y/🎨 DS/📱 响应式** |
| **框架无关结构化数据** | ❌ | ❌ | ✅ **⭐ v1.1.0 新增：Vue/Svelte/HTML 等** | ✅ |
| **设计规范预检 (Lint)** | ❌ | ❌ | ❌ | ✅ **⭐ v1.3.1 新增：评分+修复建议** |
| **Flex 布局自动修复** | ❌ | ❌ | ❌ | ✅ **⭐ v1.3.1：图标变形/文本截断** |
| **无障碍(a11y)增强** | ❌ | ❌ | ❌ | ✅ **⭐ v1.3.1：语义标签/alt/ARIA** |
| **设计系统对齐** | ❌ | ❌ | ❌ | ✅ **⭐ v1.3.1：颜色/间距/字体匹配** |
| **响应式推断** | ❌ | ❌ | ❌ | ✅ **⭐ v1.3.1：断点/前缀建议** |
| **SVG Sprite 生成** | ❌ | ❌ | ❌ | ✅ **⭐ v1.3.1：图标雪碧图** |
| **i18n 国际化** | ❌ | ❌ | ❌ | ✅ **⭐ v1.3.1：中英文双语** |
| **Token 安全存储** | ❌ | ❌ | ❌ | ✅ **⭐ v1.3.1：Keychain/凭据管** |
| **Prettier 自动格式化** | ❌ | ❌ | ❌ | ✅ **⭐ v1.3.1** |
| Auto Layout 完整映射 | ❌ | 基础 | ✅ **flex-wrap/align-self/gap 全覆盖** | ✅ + Flex 修复 |
| 资源自动下载 | ❌ | ❌ | ✅ **public/<场景>/ + publicCdnUrl()** | ✅ + SVGO 优化 |
| SVG 优化 | ❌ | ❌ | ❌ | ✅ **v1.3.1：SVGO 自动压缩** |
| 语义 HTML 标签 | ❌ 全 div | ❌ 全 div | ✅ **h1-h6/p/button/img/section** | ✅ + a11y 增强 |
| 直接写入项目文件 | ❌ | ✅ | ✅ | ✅ |
| CLI 命令行 | ❌ | ✅ | ✅ **+ structured 命令** | ✅ **+ lint/lang/token 命令** |
| **零配置 npx 启动** | ❌ | ❌ | ✅ **npx -y figma-dev-tools --figma-api-key=xxx** | ✅ |
| **包管理器自动检测** | ❌ | ❌ | ✅ **npm/pnpm/yarn/bun** | ✅ |
| **编辑器支持数量** | 2-3 个 | 5 个 | ✅ **10+（Trae/VS Code/Cursor/Windsurf/Claude/Zed/Cline/Roo）** | ✅ |
| 跨编辑器一键安装 | ❌ | ❌ | ✅ **npx 一键安装** | ✅ |
| 设计规范文档 | ❌ | ❌ | ❌ | ✅ **FIGMA-DESIGN-GUIDELINES.md** |
| 高保真检查清单 | ❌ | ❌ | ✅ **AI Agent 专用检查清单** | ✅ + lint 评分 |

---

## 📜 License

MIT © figma-dev-tools contributors
