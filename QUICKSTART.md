# ⚡ figma-dev-tools 快速上手指南 v1.4.20

> 中 / [English](https://gitee.com/shanxi-youcha/figma-dev-tools/blob/master/QUICKSTART.en-US.md)
> 从安装到产出第一个 Figma → React/Vue 组件，约 5 分钟。

---

## 一分钟理解它是什么

**MCP Server** + **CLI** + **GUI 配置向导**，运行在 AI 编辑器（Trae / VS Code / Cursor / Windsurf / Claude Desktop / Zed / Cline / Roo Code 等 8 个）下。给它一个 Figma 链接，即可生成前端代码（React / Vue / HTML）、下载图片/SVG、提取设计 Token。

---

## 一、安装（四选一，推荐 ①）

| 方式 | 命令 | 适合人群 |
|------|------|---------|
| **① GUI 向导** ⭐ | `npx figma-dev-tools gui` | 小白，浏览器点选完成 |
| **② 零配置 npx** | `npx -y figma-dev-tools --figma-api-key=figd_xxx` | 临时体验 |
| **③ 一键安装** | `npx figma-dev-tools install` | 长期使用，自动配置编辑器 MCP |
| **④ 项目依赖** | `npm i -D figma-dev-tools` | 仅单个项目使用 |

> 全局可用（任意目录 `figma-dev`）：`npm i -g figma-dev-tools`

---

## 二、获取并配置 Figma Token

### 获取
登录 [Figma](https://www.figma.com/) → 右上角头像 → **Settings** → **Account** → **Personal access tokens** → **Generate new token** → 勾选 **File content (Read only)** → **Generate** → **立即复制**（仅显示一次）

### 配置（任选一种）

**A. GUI（推荐）**
```bash
figma-dev gui
```

**B. CLI 安全存储**
```bash
figma-dev token set default -t figd_xxx
figma-dev validate
```

**C. 环境变量**
```env
FIGMA_ACCESS_TOKEN=figd_xxx
```

**D. 高级：MCP 配置注入**
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

> ❗ 配置后**重启 AI 编辑器**。⚠️ Token 不要提交进 Git，`.env` 加入 `.gitignore`。

---

## 三、快速体验

### 方式 A：AI 编辑器内（MCP 自动化）

把 Figma 链接丢给 AI，例如：

```
用 figma-dev-tools 还原这段设计，组件名 HeroSection，场景名 landing-page
https://www.figma.com/design/{fileKey}/{name}?node-id={nodeId}
```

AI 自动执行：`figma_parse_url` → `figma_get_metadata` → `figma_get_screenshot` → `figma_generate_jsx` → `figma_download_assets`

### 方式 B：CLI 命令行

```bash
# ① 查看文件结构
figma-dev info "<figma-url>"

# ② 生成组件（--framework vue 生成 Vue3；--style tailwind|unocss|css-modules）
figma-dev jsx "<figma-url>" --name HeroSection --scene landing-page --style tailwind

# ②b. 直接映射为项目组件库（v1.4.20；auto 按依赖自动检测，也可显式指定）
#    React: shadcn-ui | ant-design    Vue: element-plus | ant-design-vue
figma-dev jsx "<figma-url>" --name SignupForm --component-library auto
figma-dev vue "<figma-url>" --name UserCard --component-library element-plus

# ③ 下载资源（按构建器自动落位 public/ 或 src/assets/）
figma-dev assets "<figma-url>" --scene landing-page --scale 2

# ④ 同步设计 Tokens（支持 --output-format dtcg 输出 W3C DTCG 标准）
figma-dev sync "<figma-url>" --format oklch --output ./src/styles/figma

# ⑤ 输出框架无关 JSON（供 Vue/Svelte/HTML 等消费）
figma-dev structured "<figma-url>"
```

---

## 四、命令速查

| 命令 | 说明 |
|------|------|
| `figma-dev gui` | 可视化配置向导 |
| `figma-dev install` / `uninstall` | 一键安装/卸载编辑器 MCP 配置 |
| `figma-dev validate` | 校验 Token |
| `figma-dev token set/get/list/delete` | Token 管理 |
| `figma-dev info <url>` / `metadata <url>` | 文件信息 / 高层概览 |
| `figma-dev lint <url>` | 设计还原质量预检 |
| `figma-dev jsx <url>` | 生成 React/Vue 组件 |
| `figma-dev assets <url>` | 下载图片/SVG |
| `figma-dev sync <url>` | 同步 Tokens → 主题 CSS / DTCG JSON |
| `figma-dev structured <url>` | 输出框架无关 JSON |

> 完整命令见 `README.md` 或 `figma-dev --help`。

---

## 五、文档导航

| 你想 | 看这里 |
|------|--------|
| 全部功能 / MCP 工具 / CLI 命令 | `README.md` |
| AI 用法 & 高保真还原检查 | `SKILL.md` |
| 各编辑器/框架配置 | `README.md` → 配置说明 |
| 设计 Token 映射规范 | `FIGMA-DESIGN-GUIDELINES.md` |

---
*有问题？提交 Issue 到仓库 Gitee。*
