# ⚡ figma-dev-tools 快速上手指南 v1.4.21

> 中 / [English](https://gitee.com/shanxi-youcha/figma-dev-tools/blob/master/QUICKSTART.en-US.md)
> 从安装到产出第一个 Figma → React/Vue/Svelte/微信小程序组件，约 5 分钟。

---

## 一分钟理解它是什么

**MCP Server** + **CLI** + **GUI 配置向导**，运行在 AI 编辑器（Trae / VS Code / Cursor / Windsurf / Claude Desktop / Zed / Cline / Roo Code 等 8 个）下。给它一个 Figma 链接，即可生成前端代码（React / Vue / Svelte / 微信小程序 / HTML）、下载图片/SVG、提取设计 Token，并可监听设计稿变更自动再生成。

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

# ⑥ 生成 Svelte 4 组件（--style 仅支持 tailwind|unocss|css-modules；--no-ts 输出纯 JS）
figma-dev svelte "<figma-url>" --name GoodsCard --style tailwind --output ./src/lib/GoodsCard.svelte

# ⑦ 生成微信小程序四件套（WXML/WXSS/JS/JSON；默认 rpx，自动推断 design-width）
figma-dev weapp "<figma-url>" --name GoodsList --page --output ./miniprogram/pages
#    资源模式：--asset-mode local（默认）| cdn（需稳定托管基址）| base64
#    主包体积核算会从输出目录向上自动寻找含 app.json 的工程根（也可 --project-root 显式指定）
```

> `--output <文件或目录>` 把产物直接写到磁盘（jsx/vue/svelte 写文件，weapp 写工程目录）；不传则只打印到终端。

### 方式 C：监听设计稿变更（Watch，MCP 工具）

在 AI 编辑器内让 Agent 调用 watch 工具，Figma 侧一改稿即自动重新生成：

```
figma_watch_start：figmaUrl + framework（react/vue/svelte/weapp）
  · write=true + outputDir 时自动落盘（旧文件先备份到 .figma-dev-backup/，
    代码 preserve 区块与 *.figma.json 用户字段自动保留）
  · 默认 5 秒轮询，429 自动指数退避（10s 起，封顶 2min）
figma_watch_status：查看 changeCount / 最近产物 / 错误
figma_watch_stop：停止（编辑器断开连接时也会自动清理全部监听）
```

### 方式 D：对比现状代码与最新设计（Compare，MCP 工具）

`figma_compare_code` 把你本地改过的代码与 Figma 最新生成结果做 unified diff：
支持直接贴 `currentCode`（按框架扩展名自动配对，如 `Card.tsx` ↔ 现状代码）、给项目路径或 weapp 四件套；默认先做 Prettier 归一化消除格式噪音，`normalize=false` 可关闭。

---

## 四、命令速查

| 命令 / 工具 | 说明 |
|------|------|
| `figma-dev gui` | 可视化配置向导（含框架/组件库偏好选择） |
| `figma-dev install` / `uninstall` | 一键安装/卸载编辑器 MCP 配置 |
| `figma-dev validate` | 校验 Token |
| `figma-dev token set/get/list/delete` | Token 管理 |
| `figma-dev info <url>` / `metadata <url>` | 文件信息 / 高层概览 |
| `figma-dev lint <url>` | 设计还原质量预检 |
| `figma-dev jsx <url>` | 生成 React TSX（`--component-library auto/shadcn-ui/ant-design`） |
| `figma-dev vue <url>` | 生成 Vue 3 SFC（`--vue-version 2` 出 Options API；`--component-library element-plus/ant-design-vue`） |
| `figma-dev svelte <url>` | 生成 Svelte 4 组件（tailwind/unocss/css-modules） |
| `figma-dev weapp <url>` | 生成微信小程序四件套（`--page`、`--asset-mode`、`--renderer webview/skyline`） |
| `figma-dev batch <url>` | 整页批量生成（`--framework react/vue/svelte`） |
| `figma-dev assets <url>` | 下载图片/SVG |
| `figma-dev sync <url>` | 同步 Tokens → 主题 CSS / DTCG JSON |
| `figma-dev structured <url>` | 输出框架无关 JSON |
| MCP `figma_watch_start/stop/status` | 监听设计稿变更自动再生成（仅 MCP） |
| MCP `figma_compare_code` | 现状代码 vs Figma 最新产物 unified diff（仅 MCP） |

> 完整命令见 `README.md` 或 `figma-dev <command> --help`。

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
