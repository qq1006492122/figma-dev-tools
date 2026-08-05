# Figma Dev Tools 优化方向深度分析报告

> 分析日期：2026-08-03（v1.3.2 分析）
> 更新日期：2026-08-05（v1.4.0 状态更新）
> 当前版本：**v1.4.0**（已发布）
> 下一版本：v1.5.0+
> 优先级策略：P0(基础功能/兼容性) → P1(核心增强/多框架) → P2(中国生态/智能化) → P3(远期/生态)

---

## 目录

1. [v1.3.2 已实现功能清单](#1-v132-已实现功能清单)
2. [P0 - 基础功能/兼容性（最高优先级）](#2-p0---基础功能兼容性最高优先级)
3. [P1 - 核心增强（多框架兼容）](#3-p1---核心增强多框架兼容)
4. [P2 - 高级特性（中国生态 + 智能化）](#4-p2---高级特性中国生态--智能化)
5. [P3 - 远期（生态扩展 + 平台化）](#5-p3---远期生态扩展--平台化)
6. [竞品分析与差异化优势](#6-竞品分析与差异化优势)

---

## ✅ v1.4.0 已完成优化（2026-08-05 更新）

### P0 安全与稳定性
- ✅ **XSS 安全防护**：引入 `sanitize-html`，6个安全函数覆盖文本/属性/标识符/SVG全链路防护
- ✅ **三重边界保护**：硬深度≤50层/节点数≤20000/循环引用检测，防止栈溢出和内存耗尽
- ✅ **本地加密缓存**：AES-256-GCM 加密，LRU 淘汰+TTL 过期
- ✅ **Token 过期检测**：CLI 启动时静默检查有效性
- ✅ **请求重试机制**：网络错误指数退避重试

### P1 核心增强
- ✅ **智能层级修复**：hierarchy-fixer 基于坐标包含+命名语义自动修复父子层级错位
- ✅ **SVG 内联渲染**：矢量节点直接导出为优化内联 SVG，支持 currentColor
- ✅ **动画动效检测**：检测 Figma Prototype 交互，生成 CSS/Framer Motion 代码建议
- ✅ **Vue 3 SFC 支持**：`<script setup lang="ts">` 模板生成
- ✅ **UnoCSS 支持**：样式方案可选 Tailwind/UnoCSS
- ✅ **图片优化增强**：loading="lazy"、decoding="async"、width/height、fetchPriority
- ✅ **移动端 H5 适配建议**：安全区域、1px边框、触屏优化

### 工具链
- ✅ **CLI 默认深度 15**：支持深层嵌套设计稿
- ✅ **lint 层级检测**：嵌套过深/冗余包裹/空容器/循环引用
- ✅ **fast-deep-equal**：高性能对象深度比较（用于缓存和去重）

---

## 1. v1.3.2 已实现功能清单

### 1.1 针对小白用户（便捷性）

| 优化项 | 当前状态 | 说明 |
|--------|---------|------|
| **可视化配置向导** | ✅ (已实现) | `figma-dev gui` 启动本地 Web 配置面板（端口 54321），支持语言选择→Token配置+实时验证→编辑器检测一键安装→框架偏好 |
| **中文友好报错** | ✅ (已实现) | 错误码系统+完整中文错误信息，持续优化错误码覆盖范围 |
| **交互式 CLI** | ✅ (已实现) | `figma-dev wizard` 交互式命令，降低命令行学习成本 |
| **视频教程集成** | ✅ (已实现) | `figma-dev tutorial` 命令，CLI 中可打开教程链接 |
| **Shell 自动补全** | ✅ (已实现) | zsh/bash/powershell 自动补全，`figma-dev completion` 一键安装 |
| **一键截图还原对比** | ⏳ 待实现（P3） | 自动生成侧-by-side对比+差异热力图 |
| **预设模板库** | ⏳ 待实现（P2） | 内置 20+ 常见场景模板 |

### 1.2 针对重度前端开发者

| 优化项 | 当前状态 | 说明 |
|--------|---------|------|
| **Git 友好输出** | ✅ (已实现) | Prettier 自动格式化，生成代码自动遵循项目配置 |
| **CLI 补全** | ✅ (已实现) | zsh/bash/powershell 自动补全 |
| **Monorepo 深度集成** | ✅ (已实现) | 自动检测 pnpm-workspace，识别 packages/apps 目录结构 |
| **Watch 模式热更新** | ⏳ 待实现（P2） | `figma-dev watch` 监听 Figma 文件变化自动增量更新 |
| **批量生成能力** | ⏳ 待实现（P1） | 支持选择多个节点/整个页面批量生成组件 |
| **自定义代码模板** | ⏳ 待实现（P2） | `.figma-dev/templates/` 自定义模板 |
| **TS 类型自动生成** | ⏳ 待实现（P1） | 从 Figma Component Properties 生成完整 TypeScript 类型 |
| **Storybook 集成** | ⏳ 待实现（P2） | 自动生成 `.stories.tsx` 文件 |
| **增量更新** | ⏳ 待实现（P2） | 基于节点 ID 缓存，保留用户手动修改 |

---

### 1.3 安全性增强

#### Token 管理

| 优化项 | 当前状态 | 说明 |
|--------|---------|------|
| **Token 存储方式** | ✅ (已实现) | 系统 Keychain/Credential Manager + AES 加密文件双后端，Windows Credential Manager、macOS Keychain、Linux libsecret |
| **多 Token 支持** | ✅ (已实现) | `token set/get/list/delete/default` 命令，支持多账号切换 |
| **Token 掩码显示** | ✅ (已实现) | 所有日志输出中 Token 自动掩码为 `figd_*******` |
| **Token 权限最小化** | ⏳ 待实现（P0） | 配置向导明确提示只勾选 "File content (Read only)" |
| **Token 过期检测** | ⏳ 待实现（P0） | 定期验证有效性，提前7天提醒即将过期 |
| **环境变量注入安全** | ⏳ 待实现（P0） | 通过文件描述符传递而非命令行参数 |

#### 数据传输安全

| 优化项 | 当前状态 | 说明 |
|--------|---------|------|
| **HTTPS 强制** | ⏳ 待实现（P0） | 仅本地调试允许 HTTP |
| **请求签名验证** | ⏳ 待实现（P3） | 企业版 Figma 请求签名 |
| **代理支持** | ⏳ 待实现（P0） | 自动识别系统代理 HTTP_PROXY/HTTPS_PROXY |
| **SSL 证书校验** | ⏳ 待实现（P0） | 企业自签名证书支持 CA 证书路径配置 |
| **请求速率智能控制** | ⏳ 待实现（P0） | 根据 RateLimit headers 动态调整请求间隔 |
| **请求重试机制** | ⏳ 待实现（P0） | 网络超时/5xx 指数退避重试 |

#### 隐私保护

| 优化项 | 当前状态 | 说明 |
|--------|---------|------|
| **数据不上传** | ✅ (已实现) | 所有数据仅在本地处理，不上传到第三方服务器 |
| **本地数据缓存** | ⏳ 待实现（P0） | 可选 SQLite 加密缓存，支持一键清除 |
| **遥测可选** | ⏳ 待实现（P3） | 默认关闭，明确开关 |
| **敏感文件检测** | ⏳ 待实现（P0） | 检测 .env 是否在 .gitignore 中 |
| **日志脱敏** | ⏳ 待实现（P0） | 自动脱敏 Token、用户名、敏感内容 |

---

### 1.4 智能化提升

#### AI 辅助能力

| 优化项 | 当前状态 | 说明 |
|--------|---------|------|
| **响应式断点推断** | ✅ (已实现) | responsive-inferrer 实现，自动推断设备类型和响应式前缀 |
| **无障碍（a11y）自动修复** | ✅ (已实现) | a11y-enhancer 实现，语义化标签、alt 文本、ARIA 属性 |
| **设计规范自动识别（组件库）** | ⏳ 待实现（P1） | 识别 shadcn/ui、Ant Design 等组件库映射 |
| **组件命名智能推荐** | ⏳ 待实现（P2） | 基于内容/位置/功能智能命名 |
| **交互逻辑推断** | ⏳ 待实现（P2） | 推断表单/模态框/轮播等交互逻辑 |
| **图片优化建议** | ⏳ 待实现（P0） | srcset、sizes、loading="lazy"、WebP/AVIF建议 |
| **Props 智能推导** | ⏳ 待实现（P1） | 从 Component Properties 推导 Props 类型 |

#### 智能推断

| 优化项 | 当前状态 | 说明 |
|--------|---------|------|
| **布局模式识别（Flex）** | ✅ (已实现) | Auto Layout → Flex |
| **图标自动识别** | ⏳ 待实现（P2） | 识别图标节点→建议图标库 |
| **主题适配推断** | ⏳ 待实现（P2） | dark/light 模式→dark: 前缀 |
| **动画/过渡推断** | ⏳ 待实现（P2） | Prototype 交互→transition/hover/Framer Motion |
| **数据结构推断** | ⏳ 待实现（P2） | 列表组件→数据接口+.map()示例 |
| **布局模式识别增强（Grid/position）** | ⏳ 待实现（P2） | CSS Grid、fixed/sticky、absolute 推断 |
| **字体子集化建议** | ⏳ 待实现（P2） | Google Fonts subset 参数建议 |

#### 自动修复

| 优化项 | 当前状态 | 说明 |
|--------|---------|------|
| **Flex 布局常见问题自动修复** | ✅ (已实现) | flex-fixer.ts，图标变形、文本截断、溢出滚动修复 |
| **Tailwind 类名优化** | ✅ (已实现) | tailwind-merge + clsx 的 cn() 工具 |
| **导入自动整理** | ✅ (已实现) | code-formatter.ts，自动导入排序 |
| **代码问题静态检查** | ⏳ 待实现（P0） | TypeScript 类型检查集成 |
| **资源路径自动修正** | ⏳ 待实现（P0） | 检测 Vite/Webpack/Next.js 适配路径 |

---

### 1.5 框架支持

| 框架 | 当前状态 | 目标支持 | 关键特性 |
|------|---------|---------|---------|
| **React** | ✅ (已实现) v1.3.2 一级支持 | ✅ 保持并增强 | TSX、Tailwind、shadcn/ui 映射 |
| **Vue 3** | ⚠️ 仅结构化数据，无模板生成 | ⏳ P1 一级支持 | SFC 单文件组件、`<script setup>`、Nuxt 3 |
| **Vue 2** | ⚠️ 结构化数据 | ⏳ P1 支持 | Options API、Nuxt 2 兼容 |
| **Svelte/SvelteKit** | ⚠️ 结构化数据（figma_get_structured_data） | ⏳ P3 支持 | .svelte 单文件、响应式语法 |
| **Angular** | ⚠️ 结构化数据 | ⏳ P3 支持 | 组件、模块、NgClass/NgStyle |
| **SolidJS** | ⚠️ 结构化数据 | ⏳ P3 支持 | Solid 组件、SolidStart 适配 |
| **Qwik** | ⚠️ 结构化数据 | ⏳ P3 支持 | Qwik 组件、可恢复性 |
| **Astro** | ❌ 不支持 | ⏳ P3 支持 | .astro 组件、岛屿架构 |
| **Preact** | ❌ 不支持 | ⏳ P3 支持 | 轻量 React 兼容 |
| **Lit (Web Components)** | ❌ 不支持 | ⏳ P3 支持 | Lit 组件、Shadow DOM |
| **HTML 原生** | ✅ (已实现) 结构化数据支持 | ✅ 增强 | 纯 HTML/CSS/JS |

**MCP 工具规划：**
- P1: `figma_generate_vue` - 生成 Vue SFC
- P3: `figma_generate_svelte` / `figma_generate_angular` / `figma_generate_solid`
- P1: `figma_configure_framework` - 配置目标框架和风格

---

### 1.6 多端平台支持

| 平台 | 当前状态 | 目标支持 | 关键适配点 |
|------|---------|---------|---------|
| **Web (H5)** | ✅ (已实现) 支持 | ✅ 增强 | 响应式、触屏事件、性能优化 |
| **微信小程序** | ❌ 不支持 | ⏳ P2 一级支持 | WXML/WXSS/JS、rpx 单位、小程序组件映射 |
| **支付宝小程序** | ❌ 不支持 | ⏳ P2 支持 | axml/acss、my.* API |
| **抖音小程序** | ❌ 不支持 | ⏳ P2 支持 | ttml/ttss、抖音生态 |
| **百度小程序** | ❌ 不支持 | ⏳ P3 计划中 | swan 命名空间 |
| **uni-app** | ❌ 不支持 | ⏳ P2 一级支持 | Vue 语法 + 条件编译、pages.json |
| **Taro** | ❌ 不支持 | ⏳ P2 支持 | React/Vue 双语法、多端适配 |
| **React Native** | ❌ 不支持 | ⏳ P3 计划中 | StyleSheet、Expo 适配 |
| **Flutter** | ❌ 不支持 | ⏳ P3 远期规划 | Widget 树、Dart 代码 |

---

### 1.7 设备适配

| 设备类型 | 当前状态 | 目标支持 | 关键特性 |
|---------|---------|---------|---------|
| **移动端 H5** | ✅ (已实现) 设备类型推断+布局方向建议 | ⏳ P2 深度适配 | viewport、touch 事件、1px 边框、安全区域适配 |
| **平板/iPad** | ❌ 无特殊适配 | ⏳ P3 支持 | 分栏布局、横竖屏适配 |
| **桌面 Web** | ✅ (已实现) 默认支持 | ✅ 增强 | 大屏优化、鼠标交互 |
| **Electron** | ❌ 不支持 | ⏳ P3 支持 | Electron 进程模型、打包配置建议 |
| **Tauri** | ❌ 不支持 | ⏳ P3 支持 | Tauri 命令系统、Rust 后端 |
| **TV (大屏)** | ❌ 不支持 | ⏳ P3 计划中 | 焦点导航、遥控器交互 |

---

### 1.8 样式方案支持

| 样式方案 | 当前状态 | 目标支持 | 关键适配点 |
|---------|---------|---------|---------|
| **Tailwind CSS v4** | ✅ (已实现) 一级支持 | ✅ 保持领先 | @theme 配置、响应式前缀、暗色模式 |
| **Tailwind CSS v3** | ⚠️ v4 为主 | ⏳ P3 支持 | tailwind.config.js 传统配置 |
| **CSS Modules** | ⚠️ 占位，不完整 | ⏳ P1 完整支持 | .module.css、类名映射、composes |
| **UnoCSS** | ❌ 不支持 | ⏳ P1 一级支持 | 原子化 CSS、preset-wind、图标预设 |
| **Styled Components** | ❌ 不支持 | ⏳ P1 支持 | 模板字符串、ThemeProvider |
| **Emotion** | ❌ 不支持 | ⏳ P1 支持 | css prop、styled API |
| **vanilla-extract** | ❌ 不支持 | ⏳ P1 支持 | 类型安全样式、sprinkles |
| **Panda CSS** | ❌ 不支持 | ⏳ P1 支持 | 类型安全、cva 模式 |
| **CSS-in-JS (Linaria)** | ❌ 不支持 | ⏳ P3 计划中 | 零运行时 CSS-in-JS |
| **Less/Sass/SCSS** | ❌ 不支持 | ⏳ P1 支持 | 预处理器语法 |
| **Stylus** | ❌ 不支持 | ⏳ P3 计划中 | 类似 Sass |
| **原生 CSS (CSS Variables)** | ✅ (已实现) 支持 | ✅ 增强 | :root 变量、@layer、容器查询 |
| **Windi CSS** | ❌ 不支持 | ⏳ P3 不再推荐 | 历史项目兼容 |
| **Twind** | ❌ 不支持 | ⏳ P3 计划中 | Tailwind 运行时 |

---

## 2. P0 - 基础功能/兼容性（最高优先级）

**目标：夯实基础体验，解决稳定性、兼容性、安全性问题，让核心流程无懈可击**

### 2.1 网络与请求层完善

| 任务 | 验收标准 | 状态 |
|------|---------|------|
| **系统代理自动检测** | 自动识别 HTTP_PROXY/HTTPS_PROXY/NO_PROXY 环境变量，支持认证代理 | ✅ (已实现) |
| **请求速率智能控制** | 根据 X-RateLimit headers 动态调整请求间隔，临近限制时自动降速 | ✅ (已实现) |
| **HTTPS 强制** | 默认强制 HTTPS，仅 localhost/127.0.0.1 本地调试允许 HTTP | ✅ (已实现) |
| **SSL 证书校验增强** | 企业自签名证书支持（待补充 FIGMA_CA_CERT_PATH 配置） | ⏳ 部分实现 |
| **请求重试机制** | 网络超时/429/5xx 自动指数退避重试（最多3次），429 遵循 Retry-After | ✅ (已实现) |

### 2.2 安全性增强

| 任务 | 验收标准 | 状态 |
|------|---------|------|
| **Token 权限最小化引导** | 保存 Token 时自动验证有效性，错误消息明确提示 Read only 权限要求 | ✅ (已实现) |
| **Token 过期检测** | 24小时缓存验证周期，`getTokensNeedingValidation()` 检测需刷新的 Token | ✅ (已实现) |
| **敏感文件检测** | `figma-dev privacy` 命令自动检测 .gitignore 配置并给出建议 | ✅ (已实现) |
| **日志脱敏增强** | 提供 maskSensitiveData()/maskSensitiveObject() 工具函数：Token/邮箱/手机号/路径用户名 | ✅ (已实现) |
| **隐私承诺明确化** | `figma-dev privacy` 命令展示完整隐私承诺声明 | ✅ (已实现) |

### 2.3 本地缓存与性能

| 任务 | 验收标准 | 状态 |
|------|---------|------|
| **本地加密缓存** | AES-256-GCM 加密文件缓存（零依赖替代 SQLite），LRU 淘汰（100MB），TTL 过期，`figma-dev cache clear/status` | ✅ (已实现) |
| **缓存命中统计** | CLI `cache status` 显示条目数、大小、命中率、驱逐次数 | ✅ (已实现) |

### 2.4 React 代码生成质量优化

| 任务 | 验收标准 | 状态 |
|------|---------|------|
| **图片优化自动应用** | loading="lazy"/"eager" 智能选择、decoding="async"、width/height 防 CLS、fetchPriority、aria-hidden | ✅ (已实现) |
| **资源路径自动修正** | 检测 Vite/Webpack/Next.js/Remix，自动适配资源路径和导入方式 | ⏳ 待实现 |
| **导入自动整理增强** | 自动检测所需 React hooks（useState/useRef/useMemo/useCallback），按规范排序 | ⏳ 待实现 |
| **代码质量回归测试** | 建立测试用例集覆盖常见组件类型（按钮、卡片、表单、导航、列表、Hero区） | ⏳ 待实现 |

### 2.5 CLI 体验优化

| 任务 | 验收标准 | 状态 |
|------|---------|------|
| **命令输出一致性** | 所有 CLI 命令输出风格统一（chalk/boxen/ora），排版整齐 | ✅ (已实现) |
| **错误恢复建议** | 每个错误信息附带具体可操作的解决步骤（代理配置、Token 更新等） | ✅ (已实现) |
| **--help 完善** | 所有命令和子命令的 --help 信息完整，包含示例 | ⏳ 持续完善 |
| **新增命令** | `figma-dev cache status/clear`、`figma-dev privacy`、版本统一更新到 v1.4.0 | ✅ (已实现) |

---

## 3. P1 - 核心增强（多框架兼容）

**目标：从 React 单框架扩展到主流前端框架全覆盖，成为真正的框架无关设计转代码工具**

### 3.1 Vue 生态一级支持

| 任务 | 验收标准 |
|------|---------|
| **Vue 3 SFC 一级支持** | 新增 `figma_generate_vue` MCP工具 + `figma-dev vue <url>` CLI，生成完整 `.vue` 单文件：`<script setup lang="ts">` + Template + Tailwind/Unocss |
| **Vue 2 兼容支持** | Options API 写法，Nuxt 2 兼容，可配置切换 |
| **Vue 代码增强** | Flex修复/a11y/设计系统/响应式同样应用于 Vue 生成代码 |
| **Vue 特有语法适配** | class 绑定、v-if/v-for、:style、@click、defineProps/withDefaults |

### 3.2 主流样式方案支持

| 任务 | 验收标准 |
|------|---------|
| **UnoCSS 一级支持** | `--style unocss`，支持 preset-wind、preset-attributify、图标预设 |
| **CSS Modules 完整支持** | 生成 `.module.css`，类名映射，composes 组合 |
| **Styled Components 支持** | 模板字符串样式，ThemeProvider 集成，Props 传样式 |
| **Emotion 支持** | css prop、styled API、对象样式、Composition |
| **vanilla-extract / Panda CSS** | 类型安全样式方案支持 |
| **Less/Sass/SCSS** | 预处理器语法：变量、嵌套、mixin |
| **CLI 样式选项** | `figma-dev jsx/vue <url> --style tailwind-v4|unocss|css-modules|styled|emotion` |

### 3.3 组件库智能识别与映射

| 任务 | 验收标准 |
|------|---------|
| **shadcn/ui 识别映射** | 自动识别匹配 shadcn/ui 组件（Button/Card/Input/Dialog/Tabs），优先映射 import |
| **Ant Design / Element Plus 映射** | Ant Design、Element Plus 组件库识别与 API 适配 |
| **组件库自动检测** | 读取 package.json 推断项目使用的组件库 |
| **自定义组件映射** | `.figma-dev/components.json` 配置团队组件库映射规则 |

### 3.4 TypeScript 与批量生成

| 任务 | 验收标准 |
|------|---------|
| **TS 类型自动生成** | 从 Figma Component Properties 生成完整 TS 类型，包括 Variant 联合类型 |
| **Props 智能推导** | 文本→string prop、可见性→boolean prop、Variant→联合类型、实例交换→ReactNode |
| **Batch 批量生成** | `figma_batch_generate` MCP工具，多选节点/整页生成，自动建立组件依赖关系 |
| **页面级生成** | 自动拆分为 Header/Hero/Features/Footer 等区块组件 |

---

## 4. P2 - 高级特性（中国生态 + 智能化）

**目标：抓住中国市场蓝海，深化智能化能力，建立海外竞品无法复制的差异化优势**

### 4.1 中国小程序生态一级支持（核心差异化）

| 任务 | 验收标准 |
|------|---------|
| **微信小程序一级支持** | `figma_generate_weapp` + `figma-dev weapp <url>`，生成 WXML/WXSS/JS/JSON，div→view、img→image、px→rpx，TabBar/导航栏配置 |
| **支付宝/抖音小程序** | axml/acss/my.* API、ttml/ttss/tt.* API 适配 |
| **uni-app 一级支持** | Vue 语法 + 条件编译，pages.json、manifest.json 配置，多端输出 |
| **Taro 支持** | React/Vue 双语法生成 Taro 组件，多端适配配置 |
| **小程序样式限制处理** | 自动处理小程序不支持的 CSS 属性，给出适配建议 |

### 4.2 移动端 H5 深度适配

| 任务 | 验收标准 |
|------|---------|
| **安全区域适配** | 自动添加 env(safe-area-inset-*) 适配刘海屏/全面屏 |
| **1px 边框处理** | transform: scale() 或伪元素方案实现真正的 1px 边框 |
| **触屏事件优化** | touch-action: manipulation，消除 300ms 延迟，:active 状态优化 |
| **viewport 设置** | 自动生成正确的 viewport meta 标签代码 |

### 4.3 智能化推断升级

| 任务 | 验收标准 |
|------|---------|
| **交互逻辑推断** | form→表单提交+校验、modal→open/close state、carousel→轮播（swiper）、tabs→切换、accordion→折叠 |
| **数据结构推断** | 列表组件→TS数据接口+mock数据+.map()渲染示例 |
| **布局模式识别增强** | CSS Grid、fixed/sticky、absolute 参照物推断 |
| **图标自动识别** | 尺寸≤48x48、名称含icon→建议 Lucide/Iconify 或导出 SVG |
| **主题适配推断** | dark/light 变体识别→dark: 前缀类名 |
| **动画/过渡推断** | Prototype交互→Tailwind transition/hover 或 Framer Motion 代码 |
| **组件命名智能推荐** | 基于位置/功能智能命名，避免 Button1/Frame234 |

### 4.4 开发效率增强

| 任务 | 验收标准 |
|------|---------|
| **Watch 模式热更新** | `figma-dev watch <url>` 监听 Figma 变化，自动增量更新代码 |
| **增量更新机制** | 节点 ID 缓存 + `// figma-dev:start preserve` 标记区块保留用户修改 |
| **代码差异对比** | 重新生成时显示与上次代码的 diff |
| **Storybook 故事自动生成** | 自动生成 `.stories.tsx`，包含所有 Variants 示例 |
| **自定义代码模板** | `.figma-dev/templates/` 支持 EJS/Handlebars 自定义模板 |
| **预设模板库** | 内置 20+ 常见场景模板：登录/注册/列表/详情/表单/卡片/导航等 |

---

## 5. P3 - 远期（生态扩展 + 平台化）

**目标：构建完整生态，从工具升级为平台，覆盖更多端和场景**

### 5.1 更多框架支持

- Svelte/SvelteKit：.svelte 单文件、响应式语法、SvelteKit 适配
- Angular：组件、模块、NgClass/NgStyle、Angular Material
- SolidJS/SolidStart：Solid 组件、class/classList
- Qwik/Qwik City：可恢复性最佳实践
- Astro：.astro 组件、岛屿架构、多框架混合
- Preact：兼容 React 更轻量
- Lit (Web Components)：Shadow DOM 样式封装

### 5.2 更多端与平台

- 平板/iPad：分栏布局、横竖屏适配
- Electron：进程模型提示、ipc 通信建议、打包配置
- Tauri：命令系统、Rust 后端集成
- React Native：StyleSheet、View/Text/Image、Expo 适配
- Flutter：Widget 树、Dart 代码（远期规划）
- TV 端/大屏：焦点导航、遥控器交互、超大字体
- 百度小程序：swan 命名空间（视需求）

### 5.3 预览与验证

| 任务 | 验收标准 |
|------|---------|
| **实时预览服务器** | `figma-dev preview <url>` 启动本地预览，side-by-side 对比设计稿vs代码渲染 |
| **一键截图还原对比** | `figma_verify` 自动生成差异热力图，还原度评分 |
| **GUI 可视化编辑器增强** | 浏览器中实时预览、调整样式、编辑文本后重新生成 |

### 5.4 生态与平台化

| 任务 | 验收标准 |
|------|---------|
| **Figma Companion 插件** | 官方 Figma 插件，选择节点一键发送到 figma-dev-tools |
| **插件系统** | 插件 API，支持社区扩展：自定义生成器、组件映射、Lint规则 |
| **团队/企业特性** | 团队设计系统同步、权限管理、SSO、企业版 Figma 签名验证 |
| **CI/CD 集成** | GitHub Action/GitLab CI，自动检查设计稿与代码同步 |
| **设计 Token 双向同步** | 代码 Token 变更同步回 Figma Variables（双向同步） |
| **Tailwind CSS v3 兼容** | tailwind.config.js 传统配置方式支持 |
| **其他样式历史兼容** | Windi CSS、Twind、Stylus、Linaria（按需） |

---

## 6. 竞品分析与差异化优势

### 6.1 主流 Figma 转代码工具对比

| 工具 | 优点 | 缺点 | 我们可借鉴点 |
|------|------|------|------------|
| **Builder.io** | AI质量高、多框架、实时预览 | 付费、vendor lock-in、中文差 | 多框架代码生成架构、实时预览 |
| **Anima** | 高保真、交互支持、Figma插件体验好 | SaaS、代码质量参差、价格贵 | 高保真还原算法、Companion插件 |
| **Locofy.ai** | AI组件拆分、响应式自动生成 | 付费、依赖运行时、无小程序 | AI组件拆分、GitHub集成 |
| **Figma to Code (开源)** | 开源免费、轻量 | 功能简单、div soup、无AI | Figma插件内即时预览 |
| **Figma Dev Mode** | 原生集成、Variables支持好 | 仅代码片段、框架有限、付费 | Inspect体验、Variables深度集成 |

### 6.2 差异化优势（必须持续保持）

1. **MCP 原生 + AI Agent 优先**：最大差异化，专为 AI 编辑器设计
2. **本地优先，隐私安全**：所有处理本地完成，企业用户放心
3. **开源免费 MIT**：完全开源，可自托管定制
4. **渐进式上下文**：metadata → designContext → 完整数据，解决 AI 上下文爆炸
5. **节点层级智能精简**：消除 ~60% div soup
6. **零配置 npx 启动**：无需安装即可使用
7. **中国生态支持**：微信小程序/uni-app/Taro/支付宝/抖音小程序是海外竞品蓝海
8. **最广泛编辑器支持**：10+ AI 编辑器一键安装

### 6.3 需要快速补齐的短板（对应 P0/P1/P2）

1. **P0**: 网络代理/重试/限流等基础稳定性
2. **P1**: Vue 3 一等公民支持、UnoCSS/Styled Components、组件库识别
3. **P2**: 微信小程序/uni-app 中国生态、移动端 H5 深度适配、交互逻辑推断
4. **P3**: 实时预览、Figma Companion 插件

---

## 总结

figma-dev-tools v1.3.2 已经打下了非常好的基础，特别是在 **MCP 原生支持**、**渐进式上下文解决 AI 爆炸问题**、**节点层级精简**、**零配置启动**、**安全 Token 存储**、**i18n 国际化**、**a11y 无障碍增强**、**Flex 自动修复**、**响应式推断**、**设计系统自动化**、**GUI 可视化配置** 这几个方面有独特优势。

### v1.3.2 已完成的核心能力（30+ 特性）

1. **安全** - Token 安全存储（Keychain/加密文件）、多 Token 管理、掩码显示
2. **易用性** - GUI 可视化配置面板、交互式向导、i18n 中英双语、中文错误提示、8+ 编辑器一键安装、零配置启动、Shell补全、视频教程
3. **智能化** - 响应式推断、Flex 自动修复、a11y 无障碍增强、设计系统对齐、设计 Lint 检查、语义角色标注、层级精简
4. **代码质量** - React+Tailwind 一级支持、框架无关结构化数据、cn() 工具、Prettier 格式化、自动导入整理、组件列表查询
5. **资源处理** - SVG 优化、SVG Sprite 生成、资源自动下载管线、Design Tokens 提取
6. **CLI 完整** - 20+ CLI 命令覆盖全流程

### 接下来的优化优先级顺序

1. **P0 先夯实基础**：网络代理/重试/限流、安全增强（Token过期/敏感文件检测）、本地缓存、React 生成质量优化（图片优化/资源路径）
2. **P1 扩展多框架**：Vue 3 一级支持、UnoCSS/CSS Modules/Styled Components 样式方案、shadcn/ui等组件库识别映射、批量生成
3. **P2 建立差异化**：微信小程序/uni-app/Taro 中国生态、移动端 H5 深度适配（安全区域/1px边框）、交互逻辑/数据结构智能化推断、Watch模式/增量更新
4. **P3 构建生态**：Svelte/Angular/Solid 等更多框架、React Native、实时预览对比、Figma Companion 插件、插件系统、企业特性
