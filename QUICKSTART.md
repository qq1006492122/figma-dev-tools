# ⚡ figma-dev-tools 快速上手指南 v1.4.5

> 中 / [English](QUICKSTART.en-US.md)
> 从安装到产出第一个 Figma → React/Vue 组件，约 5 分钟。本文由原 `INTEGRATION_GUIDE` / `QUICKSTART` / 落地速览合并简化而来，内容与 v1.4.5 实际实现一致。

---

## 一分钟理解它是什么

一个运行在 AI 编辑器（Trae / VS Code / Cursor / Windsurf / Claude Desktop / Zed / Cline / Roo Code 等 8+）底下的 **MCP Server** + **CLI** + **GUI 配置向导**。给它一个 Figma 链接，就能生成前端代码（React / Vue / HTML）、自动下载图片 / SVG、提取设计 Token。

---

## 一、安装（四选一，推荐第 1 种）

| 方式 | 命令 | 适合人群 |
|------|------|---------|
| **① GUI 可视化配置** ⭐ | `npx figma-dev-tools gui` | 小白，全程浏览器点选 |
| **② 零配置 npx** | `npx -y figma-dev-tools --figma-api-key=figd_xxx` | 只验一版，不落地安装 |
| **③ 一键安装脚本** | `npx figma-dev-tools install` | 长期使用，自动配置编辑器 MCP |
| **④ 项目依赖安装** | `npm i -D figma-dev-tools` | 只想在单个项目里用 |

若想全局可命令直接调用（任意目录 `figma-dev`），执行：

```bash
npm i -g figma-dev-tools
```

> 💡 `install` 脚本会自动检测已装编辑器（Trae/VS Code/Cursor/Windsurf/Claude Desktop/Zed/Cline/Roo Code 等 8+）并写入对应 MCP 配置；用 `GUI` 方式则可视化为你一键完成。

---

## 二、获取并配置 Figma Token

### 1. 获取 Token
1. 登录 [Figma](https://www.figma.com/)，右上角头像 → **Settings** → **Account**
2. 找到 **Personal access tokens** → **Generate new token**
3. 勾选 **File content (Read only)** 权限 → **Generate** → **立即复制**（只显示一次！）

### 2. 配置（任选一种）

**A. GUI 可视化（推荐）**
```bash
figma-dev gui
```
浏览器中输入 Token，自动实时校验并安全存储到系统密钥链。

**B. CLI 安全存储**
```bash
# 保存到系统密钥链/加密文件
figma-dev token set default -t figd_xxx
# 校验
figma-dev validate
```

**C. 环境变量 `.env`**
```env
FIGMA_ACCESS_TOKEN=figd_xxx
```

**D. MCP 配置 env（AI 编辑器内）**
```json
{
  "mcpServers": {
    "figma-dev-tools": {
      "command": "node",
      "args": ["<path>/figma-dev-tools/dist/index.js"],
      "env": { "FIGMA_ACCESS_TOKEN": "figd_xxx" }
    }
  }
}
```

3. ❗ 配置后**重启 AI 编辑器**，MCP 服务器才会加载新配置。
   ⚠️ 永远不要把 Token 提交进 Git，`.env` 要加入 `.gitignore`。

---

## 三、快速体验

### 方式 A：AI 编辑器内（MCP 工具自动化）

直接把 Figma 链接丢给 AI，例如：

```
用 figma-dev-tools 还原这段设计，组件名 HeroSection，场景名 landing-page
https://www.figma.com/design/{fileKey}/{name}?node-id={nodeId}
```

AI 会自动按标准管线执行：

```
figma_parse_url 解析链接
  → figma_get_metadata     页面结构概览（避免上下文爆炸）
  → figma_get_screenshot   视觉基准
  → figma_generate_jsx     生成组件（React/Vue + Tailwind）
  → figma_download_assets  下载图片/SVG 到 public/<场景>/
```

### 方式 B：CLI 命令行（不依赖 AI）

```bash
# ① 看文件结构
figma-dev info "<figma-url>"

# ② 高层概览
figma-dev metadata "<figma-url>"

# ③ 设计规范预检（可选）
figma-dev lint "<figma-url>"

# ④ 生成组件（React 默认；可用 --framework vue）
figma-dev jsx "<figma-url>" --name HeroSection --scene landing-page --framework react --style tailwind

# ⑤ 下载资源到 public/landing-page/
figma-dev assets "<figma-url>" --scene landing-page --scale 2

# ⑥ 同步设计 Tokens → Tailwind @theme CSS
figma-dev sync "<figma-url>" --format oklch --output ./src/styles/figma

# ⑦ 框架无关结构化 JSON（供 Vue/Svelte/HTML 等消费）
figma-dev structured "<figma-url>"
```

---

## 四、常用命令速查

| 命令 | 说明 |
|------|------|
| `figma-dev gui` | 启动可视化配置向导（浏览器） |
| `figma-dev wizard` / `figma-dev init --gui` | 交互式 CLI / GUI 向导 |
| `figma-dev install` / `uninstall` | 一键安装 / 卸载编辑器 MCP 配置 |
| `figma-dev validate` | 校验 Token |
| `figma-dev token set/get/list/delete/default` | Token 安全管理 |
| `figma-dev info <url>` / `metadata <url>` | 文件信息 / 高层概览 |
| `figma-dev lint <url>` | 代码还原质量预检 |
| `figma-dev jsx <url>` | 生成 React/Vue+Tailwind 组件 |
| `figma-dev structured <url>` | 输出框架无关 JSON 结构 |
| `figma-dev assets <url>` | 下载图片/SVG 到项目 |
| `figma-dev sync <url>` | 同步 Tokens → 主题 CSS |
| `figma-dev cache status/clear` | 查看 / 清理本地缓存 |
| `figma-dev lang set zh-CN|en-US` / `lang switch` | 切换中 / 英文界面 |
| `figma-dev tutorial` | 打开使用教程 |
| `figma-dev privacy` | 查看隐私说明 |

> 完整命令与参数见 `README.md` 的「CLI 命令参考」；本地调用 `figma-dev --help` 亦可查看。

---

## 五、骨架 / 文档导航

```txt
figma-dev-tools/
├── README.md / README.en-US.md      # 功能亮点 + 19 工具 + CLI 命令
├── SKILL.md                          # AI Agent 使用手册 + 高保真还原检查清单
├── QUICKSTART.md / QUICKSTART.en-US.md  # 本文（快速上手指南）
├── install.mjs / install.sh          # 一键安装脚本
├── bin/ + dist/                      # 可执行入口 + 编译产物
└── gui/                              # 配置向导前端
```

| 你想 | 看这里 |
|------|--------|
| 全部功能 / 19 个 MCP 工具 / CLI 命令 | `README.md` |
| AI 用法 & 高保真还原检查 | `SKILL.md` |
| 各编辑器 / 框架详细配置 | `README.md` → 支持编辑器 / 配置说明 |
| 设计 Token → Token 映射规范 | `FIGMA-DESIGN-GUIDELINES.md` |
| 竞品对比与迭代路线 | `OPTIMIZATION-ANALYSIS.md` |

---

*有问题？`figma-dev tutorial` 打开在线文档，或提交 Issue 到仓库 Gitee。*