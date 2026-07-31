# 🎨 Figma Dev Tools

> Figma → React + Tailwind CSS 设计到代码一键转换 MCP 服务器

**打通 Figma 设计与前端研发的完整工具链**，支持设计 Tokens 智能提取、高保真 React 组件生成、资源自动下载、跨编辑器 MCP 集成。专为 AI Agent 优化，解决 div soup、上下文爆炸、hex 写死、资源路径处理等核心痛点。

---

## ✨ 功能亮点

| 特性 | 说明 |
|------|------|
| 🔗 **13 个 MCP 工具** | 完整覆盖 URL 解析 → Token 提取 → 组件生成 → 资源下载全流程 |
| 🧠 **智能层级精简** | 自动扁平化冗余 GROUP/FRAME，消除 ~60% 无意义嵌套 div |
| 📊 **渐进式上下文** | metadata 概览（~4KB）→ designContext 详情，避免上下文爆炸 |
| 🎯 **多级 Token 匹配** | codeSyntax.WEB → 精确 hex → CIE76 色差模糊 → @theme 扩展建议 |
| ⚛️ **一键 JSX 生成** | 语义标签选择 + Tailwind 映射 + cn() 合并 + TODO 标记 |
| 🖼️ **资源自动管线** | 检测图片/SVG → 下载到 public/ → 生成 publicCdnUrl() 引用 |
| 💻 **CLI 命令行** | 支持脚本和 CI/CD 集成，无需 MCP 也可使用 |
| 🔄 **跨编辑器支持** | Trae、VS Code、Cursor、Windsurf、Claude Desktop 一键安装 |

---

## 🚀 一键安装

### 方式一：npx 一键安装（推荐）

```bash
# 在项目根目录执行，自动配置 MCP
npx figma-dev-tools install
```

安装脚本会自动：
- 检测已安装的 AI 编辑器（Trae/VS Code/Cursor/Windsurf/Claude Desktop）
- 下载/编译工具
- 配置对应编辑器的 MCP settings
- 生成 `.env.example` 模板

### 方式二：手动安装

```bash
# 1. 安装到项目
npm install figma-dev-tools --save-dev

# 2. 构建
cd node_modules/figma-dev-tools
npm run build

# 3. 配置 MCP（参考下方「MCP 配置」章节）
```

### 方式三：从本地源码安装

```bash
# 克隆或复制 figma-dev-tools 目录到项目中
cp -r figma-dev-tools/ your-project/tools/
cd your-project/tools/figma-dev-tools
npm install
npm run build
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

在 `figma-dev-tools/` 目录创建 `.env` 文件：

```env
FIGMA_ACCESS_TOKEN=your-figma-token-here
```

### 3. 第一个 Figma → 代码示例

在 AI 编辑器（如 Trae）中，直接对话：

```
帮我用 figma-dev-tools 还原这个 Figma 设计稿：
https://www.figma.com/design/xxxxx/MyProject?node-id=23-11032

场景名：landing-page
组件名：HeroSection
```

AI 将自动执行以下流程：
1. `figma_parse_url` 解析链接
2. `figma_get_metadata` 获取页面结构概览
3. `figma_get_screenshot` 获取视觉基准
4. `figma_generate_jsx` 一键生成 TSX 代码
5. `figma_download_assets` 下载图片资源

### CLI 快速体验

```bash
# 查看文件信息
npx figma-dev info "https://www.figma.com/design/xxxxx/MyProject?node-id=23-11032"

# 生成 React 组件
npx figma-dev jsx "https://www.figma.com/design/xxxxx/MyProject?node-id=23-11032" \
  --name HeroSection --scene landing-page

# 同步 Design Tokens
npx figma-dev sync "https://www.figma.com/design/xxxxx/MyProject" \
  --format oklch --output ./src/styles
```

---

## 🔧 MCP 工具参考

共 **13 个 MCP 工具**，按使用流程排列：

| # | 工具名称 | 功能 | 关键参数 | 版本 |
|---|---------|------|---------|------|
| 1 | `figma_parse_url` | 解析 Figma URL，提取 fileKey/nodeId | `url` | v1 |
| 2 | `figma_validate_token` | 验证 Figma Access Token 有效性 | `accessToken` | v1 |
| 3 | `figma_get_file` | 获取文件基本信息（页面列表、组件数） | `fileKey` / `figmaUrl` | v1 |
| 4 | `figma_list_components` | 列出文件中 Components/ComponentSets | `fileKey` | v2 |
| 5 | `figma_get_metadata` | **高层结构概览**（~4KB，避免上下文爆炸） | `fileKey/nodeId/depth` | **v2 新** |
| 6 | `figma_get_design_context` | **精简设计上下文**（层级扁平+语义标注+资源列表） | `fileKey/nodeId/maxDepth` | **v2 新** |
| 7 | `figma_get_screenshot` | 获取节点高清截图 | `fileKey/nodeId/scale` | v1 |
| 8 | `figma_generate_jsx` | **一键生成 React+Tailwind TSX**（整合全管线） | `fileKey/nodeId/componentName/sceneName` | **v2 新** |
| 9 | `figma_generate_component` | 基础组件生成（旧版，推荐 generate_jsx） | `fileKey/nodeId/styleFormat` | v1 |
| 10 | `figma_download_assets` | **下载资源到 public/<场景>/ + publicCdnUrl** | `fileKey/sceneName/assetNodeIds` | **v2 新** |
| 11 | `figma_extract_tokens` | 提取设计 Tokens（Variables+Styles） | `fileKey/colorFormat` | v1 |
| 12 | `figma_generate_styles` | 生成 CSS Variables / Tailwind v4 @theme | `tokens/outputFormat` | v1 |
| 13 | `figma_sync_to_project` | 写入 tokens 到项目文件（自动备份） | `tokens/outputDir/format` | v1 |

### 工具详细参数

#### `figma_generate_jsx`（最常用）

```typescript
{
  figmaUrl?: string;           // Figma 链接（可替代 fileKey+nodeId）
  fileKey?: string;            // Figma 文件 Key
  nodeId?: string;             // 目标节点 ID
  componentName?: string;      // 组件名（如 HeroSection）
  sceneName?: string;          // 场景名（用于资源路径，如 landing-page）
  maxDepth?: number;           // 遍历深度，默认 8
  accessToken?: string;        // 可选，优先用环境变量
}
```

**输出内容：**
- 完整 React + TypeScript + Tailwind TSX 代码
- ⚠️ 需要 `@theme` 扩展的 token 列表
- 🖼️ 需要下载的资源列表（nodeId、名称、类型）
- 🧩 可复用组件提示
- 节点精简统计

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
```

| 命令 | 功能 | 常用选项 |
|------|------|---------|
| `figma-dev install` | 一键安装 MCP 配置到各编辑器 | - |
| `figma-dev validate <token>` | 验证 Token | - |
| `figma-dev info <url>` | 查看文件信息 | - |
| `figma-dev metadata <url>` | 获取元数据概览 | `--depth <n>` |
| `figma-dev jsx <url>` | 生成 JSX 组件（增强管线） | `--name <ComponentName>` `--scene <name>` `--depth <n>` |
| `figma-dev component <url>` | 生成基础组件 | `--name <name>` `--typescript` `--style tailwind` |
| `figma-dev assets <url>` | 下载资源 | `--scene <name>` `--nodes <id1,id2>` `--scale <n>` |
| `figma-dev sync <url>` | 同步 Tokens | `--format oklch` `--output <dir>` `--output-format all` |
| `figma-dev screenshot <url>` | 获取截图 | `--format png` `--scale 2` `--output <dir>` |
| `figma-dev tokens <url>` | 提取 Tokens | `--format oklch` |
| `figma-dev mcp` | 启动 MCP 服务器（stdio） | - |
| `figma-dev init` | 初始化配置 | - |

**CLI 示例：**

```bash
# 一键生成 Hero 区组件
figma-dev jsx "https://www.figma.com/design/xxx/yyy?node-id=23-11032" \
  --name HeroSection \
  --scene landing-page \
  --depth 8

# 批量下载资源
figma-dev assets "https://www.figma.com/design/xxx/yyy?node-id=23-11032" \
  --scene landing-page \
  --nodes "23-11032,23-11050,23-11080" \
  --scale 2
```

---

## 🖥️ 支持的编辑器

| 编辑器 | 一键安装 | 手动配置路径 |
|--------|---------|-------------|
| **Trae** | ✅ `npx figma-dev-tools install` | 项目根目录 `.mcp.json` |
| **VS Code** | ✅ 自动检测安装 | `.vscode/mcp.json` 或 User Settings JSON |
| **Cursor** | ✅ 自动检测安装 | `~/.cursor/mcp.json`（全局）或项目 `.cursor/mcp.json` |
| **Windsurf** | ✅ 自动检测安装 | `~/.codeium/windsurf/mcp_config.json` |
| **Claude Desktop** | ✅ 自动检测安装 | `~/Library/Application Support/Claude/claude_desktop_config.json`（macOS）<br>`%APPDATA%\Claude\claude_desktop_config.json`（Windows） |

### MCP 配置模板

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

> 💡 使用 `npx figma-dev-tools install` 会自动填充正确路径。

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
```

### MCP 配置优先级

Token 读取优先级：
1. MCP 工具调用时传入的 `accessToken` 参数
2. MCP 配置中的 `env.FIGMA_ACCESS_TOKEN`
3. `.env` 文件中的 `FIGMA_ACCESS_TOKEN`
4. 系统环境变量 `FIGMA_ACCESS_TOKEN`

---

## 🏗️ 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      AI Editor (MCP Client)                 │
│  ┌──────┐  ┌───────┐  ┌───────┐  ┌─────────┐  ┌────────┐  │
│  │ Trae │  │VS Code│  │Cursor │  │Windsurf │  │ Claude │  │
│  └──┬───┘  └───┬───┘  └───┬───┘  └────┬────┘  └───┬────┘  │
└─────┼──────────┼──────────┼───────────┼───────────┼────────┘
      │          │          │           │           │
      └──────────┴──────────┴─────┬─────┴───────────┘
                                  │ stdio MCP
                                  ▼
┌─────────────────────────────────────────────────────────────┐
│                   figma-dev-tools MCP Server                │
│                                                              │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │  figma-url  │───▶│figma-client  │───▶│ Figma REST API│  │
│  │  解析器      │    │ API 客户端    │    │  (figma.com)  │  │
│  └─────────────┘    └──────┬───────┘    └───────────────┘  │
│                            │                                │
│           ┌────────────────┼────────────────┐              │
│           ▼                ▼                ▼              │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐    │
│  │node-processor│ │design-context│ │tokens-extractor│   │
│  │ 节点精简     │ │ 渐进式上下文  │ │ Token 提取     │    │
│  │ GROUP扁平化  │ │ metadata概览  │ │ Variables+Styles│  │
│  │ 语义角色标注 │ │ context详情   │ │                │    │
│  └──────┬──────┘  └──────┬───────┘  └───────┬───────┘    │
│         │                │                   │            │
│         └────────┬───────┴───────────┬───────┘            │
│                  ▼                   ▼                    │
│         ┌──────────────┐   ┌────────────────┐            │
│         │token-matcher │   │tailwind-mapper │            │
│         │多级Token匹配 │   │完整属性映射    │            │
│         │codeSyntax→   │   │flex/padding/   │            │
│         │精确→模糊匹配 │   │gap/shadow等    │            │
│         └──────┬───────┘   └───────┬────────┘            │
│                │                   │                      │
│                └─────────┬─────────┘                      │
│                          ▼                                │
│                ┌──────────────────┐                       │
│                │  code-generator  │                       │
│                │  JSX 代码生成     │                       │
│                │  语义标签+cn()    │                       │
│                │  TODO标记        │                       │
│                └────────┬─────────┘                       │
│                         │                                 │
│         ┌───────────────┴──────────────┐                 │
│         ▼                              ▼                 │
│  ┌──────────────┐             ┌────────────────┐         │
│  │asset-        │             │  file-writer   │         │
│  │downloader    │             │  文件写入       │         │
│  │图片/SVG下载  │             │  CSS/Tailwind/ │         │
│  │publicCdnUrl()│             │  JSON输出      │         │
│  └──────────────┘             └────────────────┘         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 项目结构

```
figma-dev-tools/
├── bin/
│   └── figma-dev.js           # CLI 入口
├── src/
│   ├── index.ts               # MCP 服务器入口
│   ├── types.ts               # TypeScript 类型定义
│   ├── cli/
│   │   └── index.ts           # CLI 命令定义
│   ├── services/
│   │   ├── figma-client.ts    # Figma REST API 客户端
│   │   ├── node-processor.ts  # ⭐ 节点树精简 + 语义标注
│   │   ├── design-context.ts  # ⭐ 渐进式上下文服务
│   │   ├── token-matcher.ts   # ⭐ 多级 Token 匹配
│   │   ├── tailwind-mapper.ts # ⭐ Tailwind 属性映射
│   │   ├── code-generator.ts  # ⭐ JSX 代码生成
│   │   ├── asset-downloader.ts# ⭐ 资源下载管线
│   │   ├── tokens-extractor.ts# Tokens 提取
│   │   └── file-writer.ts     # 文件写入
│   ├── types/
│   │   └── nodes.ts           # 节点类型定义
│   └── utils/
│       ├── figma-url.ts       # URL 解析
│       ├── color.ts           # 颜色转换 + CIE76 色差
│       └── cn.ts              # className 合并工具
├── dist/                      # 编译输出
├── install.mjs                # 一键安装脚本
├── uninstall.mjs              # 卸载脚本
├── .env.example               # 环境变量模板
├── package.json
├── tsconfig.json
├── README.md                  # 本文件
└── SKILL.md                   # AI Agent 使用指南
```

---

## ❓ FAQ / 故障排除

### Q: MCP 服务器无法启动？

**检查：**
1. 是否已执行 `npm install && npm run build`
2. `dist/index.js` 文件是否存在
3. Node.js 版本 ≥ 20（`node -v` 检查）
4. MCP 配置中的路径是否正确（建议用绝对路径）

### Q: API 请求返回 401 Unauthorized？

**解决：**
1. 检查 `FIGMA_ACCESS_TOKEN` 是否正确配置
2. 确认 Token 没有过期（重新生成一个试试）
3. 确认 Token 勾选了 **File content (Read only)** 权限
4. 确认你有权限访问该 Figma 文件（文件需对链接可见或你是协作者）

### Q: 生成的组件颜色/间距与设计稿不一致？

**解决：**
1. 确保 Figma 中使用了 **Variables** 定义颜色/间距，并设置了 `codeSyntax.WEB`
2. 颜色格式推荐 `oklch`（Tailwind v4 原生支持），如遇问题切换为 `hex`
3. 未命中现有 token 的颜色会通过 `@theme inline` 扩展，不要直接写 `bg-[#hex]`
4. 检查生成代码中的 TODO 注释，可能有需要人工处理的 token

### Q: 生成代码有很多冗余嵌套 div？

**解决：**
1. 使用 v2.0 的 `figma_generate_jsx` 而非旧版 `figma_generate_component`
2. UI 设计师应避免多层无意义 Group 嵌套（用 Frame 划分区域）
3. 检查生成代码中标记为 layout-only 的节点是否被错误保留
4. 大区块建议拆分后逐块生成，避免单次处理过深节点树

### Q: 图片资源没有自动下载？

**解决：**
1. 必须调用 `figma_download_assets` 工具，传入 `generate_jsx` 输出的 `pendingAssets[].nodeId`
2. 确保 `sceneName` 参数已设置（资源会放到 `public/<场景名>/` 目录）
3. 检查 Figma 中的图片节点是否有 IMAGE fill
4. 网络问题：Figma 图片 CDN 可能需要科学上网

### Q: 圆形元素变成椭圆？

这是 Flex 布局的经典问题：
- Flex 容器默认 `align-items: stretch` 会拉伸子元素
- 解决：父容器添加 `align-items: center`，子元素设置 `flex-shrink: 0` + 固定宽高

### Q: API 请求频率限制？

- Figma API 有速率限制（约 60 请求/分钟）
- 批量下载资源时工具内部已自动节流
- 大文件建议拆分处理，避免短时间大量请求

### Q: 支持哪些前端框架？

- **React + Tailwind CSS**：一级支持（TSX 代码生成）
- **Vue**：可提取 Tokens 和截图，组件代码需手动调整
- **Next.js**：支持，但注意不要用 `next/image`（用普通 `<img>` 或 `publicCdnUrl()`）
- **Vite + React**：推荐，与生成代码最匹配

---

## 🎯 与官方 Figma MCP 对比

| 特性 | 官方 Figma MCP | figma-dev-tools v1 | figma-dev-tools v2 |
|------|---------------|-------------------|-------------------|
| 设计上下文获取 | ✅ 全量拉取 | ✅ | ✅ **渐进式（~4KB 概览，防爆炸）** |
| 节点截图 | ✅ | ✅ | ✅ |
| 节点树精简 | ❌ | ❌ | ✅ **GROUP 扁平化，减少 ~60% div** |
| 语义角色识别 | ❌ | ❌ | ✅ **button/card/image/text 自动识别** |
| Design Tokens 提取 | ❌ | ✅ Variables+Styles | ✅ + codeSyntax.WEB 支持 |
| 多级 Token 匹配 | ❌ | ❌ | ✅ **4级匹配策略** |
| Tailwind v4 @theme | ❌ | ✅ | ✅ |
| React 组件生成 | 基础 JSX | ✅ | ✅ **一键 JSX 整合全管线** |
| Auto Layout 完整映射 | ❌ | 基础 | ✅ **flex-wrap/align-self/gap 全覆盖** |
| 资源自动下载 | ❌ | ❌ | ✅ **public/<场景>/ + publicCdnUrl()** |
| 语义 HTML 标签 | ❌ 全 div | ❌ 全 div | ✅ **h1-h6/p/button/img/section** |
| 直接写入项目文件 | ❌ | ✅ | ✅ |
| CLI 命令行 | ❌ | ✅ | ✅ |
| 跨编辑器一键安装 | ❌ | ❌ | ✅ **npx 一键安装** |
| 高保真检查清单 | ❌ | ❌ | ✅ **AI Agent 专用检查清单** |

---

## 📜 License

MIT © figma-dev-tools contributors
