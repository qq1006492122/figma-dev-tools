# Figma Dev Tools v1.2.0 优化方向深度分析报告

> 分析日期：2026-08-03
> 当前版本：v1.2.0
> 目标版本：v1.2.0+

---

## 目录

1. [便捷性优化](#1-便捷性优化)
2. [安全性增强](#2-安全性增强)
3. [智能化提升](#3-智能化提升)
4. [全面性/多端兼容](#4-全面性多端兼容)
5. [竞品分析与借鉴](#5-竞品分析与借鉴)
6. [优先级路线图](#6-优先级路线图)

---

## 1. 便捷性优化

### 1.1 针对小白用户

| 优化项 | 当前状态 | 建议方案 | 收益 |
|--------|---------|---------|------|
| **可视化配置向导** | 仅 CLI 命令行，无 GUI | 增加 `figma-dev init --gui` 命令，启动本地 Web 配置面板（端口 54321），可视化输入 Token、选择框架、检测编辑器 | 降低首次使用门槛，减少 80% 配置问题 |
| **一键截图还原对比** | 需手动调用截图+JSX 生成 | 新增 `figma_verify` 工具，自动生成侧-by-side对比：设计截图 vs 生成代码渲染截图 + 差异热力图 | 小白可直观验证还原度，无需手动对比 |
| **中文友好报错** | ✅ 已完成：错误码系统+完整中文错误信息 | 持续优化错误码覆盖范围 | 减少用户查错时间 |
| **预设模板库** | 无模板 | 内置 20+ 常见场景模板：登录页、列表页、详情页、表单、卡片列表、导航栏等 | 小白可直接套用模板，无需从零开始 |
| **交互式 CLI** | ✅ 已完成：`figma-dev wizard` 交互式命令 | 持续优化向导体验 | 降低命令行学习成本 |
| **视频教程集成** | ✅ 已完成：`figma-dev tutorial` 命令 | CLI 中可打开B站/YouTube教程链接，文档内嵌视频二维码 | 新手快速上手 |

### 1.2 针对重度前端开发者

| 优化项 | 当前状态 | 建议方案 | 收益 |
|--------|---------|---------|------|
| **Watch 模式热更新** | 无热更新 | `figma-dev watch <url>` 监听 Figma 文件变化，自动增量更新代码和资源 | 设计稿改动自动同步，无需手动重新生成 |
| **批量生成能力** | 单节点生成 | 支持选择多个节点/整个页面批量生成组件，自动拆分并建立组件依赖关系 | 一次性生成整个页面/模块，提升 5-10x 效率 |
| **自定义代码模板** | 固定模板 | 支持 `.figma-dev/templates/` 目录下放自定义 EJS/Handlebars 模板，可覆盖默认生成逻辑 | 适配团队代码规范，无需二次修改 |
| **TS 类型自动生成** | 仅基础 Props | 自动从 Figma Component Properties 生成完整 TypeScript 类型定义，包括 Variant 类型联合 | 类型安全，减少手动写类型的工作量 |
| **Storybook 集成** | 无 | 自动生成 `.stories.tsx` 文件，包含所有 Variants 的示例，一键启动 Storybook 预览 | 组件文档自动生成，便于团队协作 |
| **Git 友好输出** | ✅ 已完成：Prettier 自动格式化 | 生成代码自动遵循项目 Prettier/ESLint 配置，自动检测并适配代码风格 | 代码直接可提交，无需手动格式化 |
| **增量更新** | 全量重新生成 | 基于节点 ID 缓存，仅重新生成变更部分，保留用户手动修改的代码（通过特殊标记区块） | 不覆盖用户自定义逻辑，支持迭代开发 |
| **CLI 补全** | ✅ 已完成：zsh/bash/powershell 自动补全 | `figma-dev completion` 一键安装 | 命令行效率提升 |
| **Monorepo 深度集成** | ✅ 已完成：自动检测 pnpm-workspace | 支持 Turborepo、Nx、Lerna 等 monorepo 工具，自动识别 packages/apps 目录结构 | 大型项目开箱即用 |

---

## 2. 安全性增强

### 2.1 Token 管理

| 优化项 | 当前状态 | 风险 | 建议方案 |
|--------|---------|------|---------|
| **Token 存储方式** | ✅ 已完成：系统 Keychain/Credential Manager + AES 加密文件双后端 | - | - Windows: 使用 Credential Manager<br>- macOS: 使用 Keychain<br>- Linux: 使用 libsecret/gnome-keyring<br>- 提供 `figma-dev token set/remove/get` 安全管理命令 |
| **Token 权限最小化** | 无引导，用户常给全权限 | 过度授权风险 | Token 配置向导明确提示只勾选 "File content (Read only)"，自动验证权限范围并警告 |
| **Token 过期检测** | 仅 API 返回 401 时才知道 | 工作中断 | 定期（每24小时）验证 Token 有效性，提前7天提醒即将过期 |
| **多 Token 支持** | ✅ 已完成：`token set/get/list/delete/default` 命令 | 团队协作不便 | 支持多账号/多 Token 配置，按项目/团队切换，类似 SSH config |
| **Token 掩码显示** | ✅ 已完成：日志中自动掩码 | 信息泄露 | 所有日志输出中 Token 自动掩码为 `figd_*******`，debug 模式也不显示完整 Token |
| **环境变量注入安全** | MCP env 明文 | 进程列表可见 | 敏感配置通过文件描述符传递而非命令行参数，避免 `ps aux` 可见 |

### 2.2 数据传输安全

| 优化项 | 当前状态 | 建议方案 |
|--------|---------|---------|
| **HTTPS 强制** | 默认 https，但允许自定义 API 端点为 http | 强制 HTTPS，仅本地调试（localhost/127.0.0.1）允许 HTTP |
| **请求签名验证** | 无 | 支持企业版 Figma 请求签名，防止请求篡改 |
| **代理支持** | 无系统代理检测 | 自动识别系统代理（HTTP_PROXY/HTTPS_PROXY），支持 `figma-dev config set proxy` 配置 |
| **SSL 证书校验** | 默认校验，但无跳过选项 | 企业自签名证书场景支持配置 CA 证书路径，不建议禁用校验 |
| **请求速率智能控制** | 简单节流 | 根据 Figma 返回的 RateLimit headers 动态调整请求间隔，避免 429 |

### 2.3 隐私保护

| 优化项 | 当前状态 | 建议方案 |
|--------|---------|---------|
| **本地数据缓存** | 无缓存 | 可选的本地缓存（SQLite），缓存设计稿数据，避免重复请求，缓存可加密，支持一键清除 |
| **数据不上传** | 当前纯本地，无数据上传 | 明确隐私承诺：所有数据仅在本地处理，不上传到任何第三方服务器（除 Figma API 外） |
| **遥测可选** | 无遥测 | 未来若添加遥测，默认关闭，明确告知收集内容，提供 `figma-dev telemetry on/off` 开关 |
| **敏感文件检测** | 无 | 自动检测并警告 .env 等敏感文件是否在 .gitignore 中，防止 Token 被提交 |
| **日志脱敏** | 无特殊处理 | 所有日志自动脱敏：Token、文件路径中的用户名、可能的敏感设计内容 |

---

## 3. 智能化提升

### 3.1 AI 辅助能力

| 优化项 | 当前状态 | 建议方案 | 收益 |
|--------|---------|---------|------|
| **设计规范自动识别** | 仅基于 Variables/Styles | 自动识别项目中已有的组件库（shadcn/ui、Ant Design、MUI、Chakra UI 等），优先映射到现有组件而非从头写 div | 生成代码更符合项目生态，减少 60% 自定义代码 |
| **组件命名智能推荐** | 简单 PascalCase 转换 | 基于节点内容、位置、功能智能命名：如 "Banner 区的主按钮" → `HeroPrimaryButton`，避免 Button1、Frame234 这类无意义名称 | 代码可读性大幅提升 |
| **交互逻辑推断** | 仅静态 UI | 基于组件名称和常见模式推断交互：<br>- 名称含 "form" → 添加表单提交逻辑<br>- 含 "modal" → 添加 open/close state<br>- 含 "carousel" → 添加轮播逻辑<br>输出时标记 "建议添加 XXX 逻辑" | 从纯 UI 到可交互组件的跨越 |
| **响应式断点推断** | ✅ 已完成：responsive-inferrer 实现 | 分析设计稿中的布局特征，自动推断响应式断点：<br>- 移动端布局（< 768px）自动添加 sm: 前缀<br>- 桌面端布局默认，lg: 调整<br>提供响应式预览建议 | 生成代码直接适配多端，无需手动调整 |
| **无障碍（a11y）自动修复** | ✅ 已完成：a11y-enhancer 实现 | 自动添加 ARIA 属性、alt 文本、语义标签、键盘导航支持，生成无障碍检查报告 | 符合 WCAG 标准，减少无障碍修复工作量 |
| **图片优化建议** | 仅下载原图 | 自动检测图片尺寸，建议 srcset、sizes、loading="lazy"、现代格式（WebP/AVIF），生成响应式图片代码 | 性能优化自动完成 |
| **Props 智能推导** | 仅基础 className/children | 基于 Figma Component Properties 自动推导 Props：<br>- 文本属性 → string prop<br>- 可见性切换 → boolean prop<br>- Variant 选项 → 联合类型<br>- 实例交换 → ReactNode prop | 组件 API 设计合理，开箱即用 |

### 3.2 智能推断

| 优化项 | 当前状态 | 建议方案 |
|--------|---------|---------|
| **布局模式识别** | 仅 Auto Layout → Flex | 识别网格布局（等宽/等高排列）→ CSS Grid；识别固定定位元素 → fixed/sticky；识别绝对定位元素 → absolute 并推断参照物 |
| **图标自动识别** | 仅 image 角色 | 识别节点是否为图标（尺寸 ≤ 48x48、名称含 icon/图标、矢量图形）→ 建议使用图标库（Lucide/Iconify/项目图标组件） |
| **主题适配推断** | 仅单一颜色 | 识别深色/浅色模式变体，自动生成 dark: 前缀类名，支持多主题切换逻辑 |
| **动画/过渡推断** | 无 | 识别 Figma Prototype 交互（悬停效果、页面过渡），建议添加对应的 Tailwind transition/hover 类或 Framer Motion 代码 |
| **数据结构推断** | 无 | 识别列表类组件（重复结构），推导数据类型接口和 mock 数据结构，生成 `.map()` 渲染逻辑示例 |
| **字体子集化建议** | 无 | 分析使用的字符集，建议 Google Fonts subset 参数，减少字体加载体积 |

### 3.3 自动修复

| 优化项 | 当前状态 | 建议方案 |
|--------|---------|---------|
| **Flex 布局常见问题自动修复** | ✅ 已完成：flex-fixer.ts 实现 | 自动检测并修复：<br>- 图标/头像在 flex 中变形 → 添加 `flex-shrink-0` + 固定尺寸<br>- 文本截断不生效 → 添加 `min-w-0 truncate`<br>- 溢出滚动问题 → 添加正确的 overflow 组合 |
| **Tailwind 类名优化** | ✅ 已完成：tailwind-merge + clsx 的 cn() 工具 | 自动优化类名顺序、移除重复类、合并冲突类、使用简写（如 `p-2 px-2` → `p-2`）|
| **导入自动整理** | ✅ 已完成：code-formatter.ts 实现 | 自动检测生成代码使用的 API，只导入需要的 hooks（useState/useRef 等），自动排序 imports |
| **代码问题静态检查** | 无 | 集成 TypeScript 类型检查，发现生成代码的类型错误并自动修复（如类型不匹配、缺少属性） |
| **资源路径自动修正** | 固定 publicCdnUrl | 检测项目资源引用方式（Vite/Webpack/Next.js 不同处理），自动适配正确的资源路径和导入方式 |

---

## 4. 全面性/多端兼容

### 4.1 框架支持

| 框架 | 当前状态 | 目标支持 | 关键特性 |
|------|---------|---------|---------|
| **React** | ✅ v1.2.0 一级支持 | ✅ 保持并增强 | TSX、Tailwind、shadcn/ui 映射、RSC（Server Components）支持 |
| **Vue 3** | ⚠️ 仅结构化数据，无模板生成 | ✅ 一级支持 | SFC 单文件组件、`<script setup>`、Tailwind/Unocss、Nuxt 3 优化 |
| **Vue 2** | ⚠️ 结构化数据 | ✅ 支持 | Options API、Nuxt 2 兼容 |
| **Svelte/SvelteKit** | ⚠️ 结构化数据（figma_get_structured_data） | ✅ 支持 | .svelte 单文件、响应式语法、SvelteKit 适配 |
| **Angular** | ⚠️ 结构化数据 | ✅ 支持 | 组件、模块、NgClass/NgStyle、Angular Material 映射 |
| **SolidJS** | ⚠️ 结构化数据 | ✅ 支持 | Solid 组件、class/classList、SolidStart 适配 |
| **Qwik** | ⚠️ 结构化数据 | ✅ 支持 | Qwik 组件、Qwik City、可恢复性最佳实践 |
| **Astro** | ❌ 不支持 | ✅ 支持 | .astro 组件、岛屿架构、多框架混合 |
| **Preact** | ❌ 不支持 | ✅ 支持 | 兼容 React 但更轻量，Preact CLI/Vite 适配 |
| **Lit (Web Components)** | ❌ 不支持 | ✅ 支持 | Lit 组件、Shadow DOM 样式封装 |
| **HTML 原生** | ✅ 结构化数据支持 | ✅ 增强 | 纯 HTML/CSS/JS，无框架依赖，快速原型 |

**新增 MCP 工具：**
- `figma_generate_vue` - 生成 Vue SFC
- `figma_generate_svelte` - 生成 Svelte 组件
- `figma_generate_angular` - 生成 Angular 组件
- `figma_generate_solid` - 生成 Solid 组件
- `figma_configure_framework` - 配置目标框架和风格

### 4.2 多端平台支持

| 平台 | 当前状态 | 目标支持 | 关键适配点 |
|------|---------|---------|---------|
| **Web (H5)** | ✅ 支持 | ✅ 增强 | 响应式、触屏事件、性能优化 |
| **微信小程序** | ❌ 不支持 | ✅ 一级支持 | WXML/WXSS/JS、rpx 单位、小程序组件映射（view/button/image/text）、TabBar/导航栏生成 |
| **支付宝小程序** | ❌ 不支持 | ✅ 支持 | axml/acss、my.* API、适配支付宝组件规范 |
| **抖音小程序** | ❌ 不支持 | ✅ 支持 | ttml/ttss、抖音特有 API、适配字节生态 |
| **百度小程序** | ❌ 不支持 | ⏳ 计划中 | swan 命名空间 |
| **uni-app** | ❌ 不支持 | ✅ 一级支持 | Vue 语法 + 条件编译、pages.json 配置、manifest.json、多端输出 |
| **Taro** | ❌ 不支持 | ✅ 支持 | React/Vue 双语法、Taro 组件、多端适配配置 |
| **React Native** | ❌ 不支持 | ⏳ 计划中 | StyleSheet、React Native 组件映射、Expo 适配 |
| **Flutter** | ❌ 不支持 | ⏳ 远期规划 | Widget 树、Dart 代码 |

**关键技术要点：**
- 单位转换：px → rpx（小程序）、px → dp（RN）、px → rem（Web）
- 组件映射：div → view（小程序）、img → image、span → text
- 样式限制：小程序不支持 * 选择器、部分 CSS 属性不支持
- 路由配置：自动生成小程序 pages.json、路由表

### 4.3 设备适配

| 设备类型 | 当前状态 | 目标支持 | 关键特性 |
|---------|---------|---------|---------|
| **移动端 H5** | ✅ 已完成：设备类型推断+布局方向建议 | ✅ 一级支持 | viewport 设置、touch 事件、1px 边框、安全区域适配（env(safe-area-inset-*)）、300ms 点击延迟处理 |
| **平板/iPad** | ❌ 无特殊适配 | ✅ 支持 | 分栏布局、横竖屏适配、UISplitViewController 风格布局 |
| **桌面 Web** | ✅ 默认支持 | ✅ 增强 | 大屏优化、宽屏布局、鼠标交互（hover/focus）、键盘快捷键导航 |
| **Electron** | ❌ 不支持 | ✅ 支持 | Electron 进程模型、ipc 通信、原生菜单、窗口事件、打包配置建议 |
| **Tauri** | ❌ 不支持 | ✅ 支持 | Tauri 命令系统、Rust 后端集成、更小打包体积 |
| **TV (大屏)** | ❌ 不支持 | ⏳ 计划中 | 焦点导航、遥控器交互、超大字体、横屏优化 |

### 4.4 样式方案支持

| 样式方案 | 当前状态 | 目标支持 | 关键适配点 |
|---------|---------|---------|---------|
| **Tailwind CSS v4** | ✅ 一级支持 | ✅ 保持领先 | @theme 配置、@apply、响应式前缀、暗色模式 |
| **Tailwind CSS v3** | ⚠️ v4 为主 | ✅ 支持 | tailwind.config.js、插件、传统配置方式 |
| **CSS Modules** | ⚠️ 占位，不完整 | ✅ 完整支持 | .module.css/module.scss、CSS Modules 类名映射、composes |
| **UnoCSS** | ❌ 不支持 | ✅ 一级支持 | 原子化 CSS、预设（preset-wind/preset-attributify）、图标预设集成、 shortcuts |
| **Styled Components** | ❌ 不支持 | ✅ 支持 | 模板字符串样式、ThemeProvider、Props 传样式、嵌套选择器 |
| **Emotion** | ❌ 不支持 | ✅ 支持 | css prop、styled API、对象样式、Composition |
| **vanilla-extract** | ❌ 不支持 | ✅ 支持 | 类型安全样式、sprinkles、recipes、零运行时 |
| **Panda CSS** | ❌ 不支持 | ✅ 支持 | 类型安全、cva 模式、预置配方 |
| **CSS-in-JS (Linaria)** | ❌ 不支持 | ⏳ 计划中 | 零运行时 CSS-in-JS |
| **Less/Sass/SCSS** | ❌ 不支持 | ✅ 支持 | 预处理器语法、变量、嵌套、mixin |
| **Stylus** | ❌ 不支持 | ⏳ 计划中 | 类似 Sass |
| **原生 CSS (CSS Variables)** | ✅ 支持 | ✅ 增强 | :root 变量、级联层（@layer）、容器查询 |
| **Windi CSS** | ❌ 不支持 | ⏳ 不再推荐 | 历史项目兼容 |
| **Twind** | ❌ 不支持 | ⏳ 计划中 | Tailwind 运行时 |

**新增 CLI 选项：**
```bash
figma-dev jsx <url> --style tailwind-v4   # 默认
figma-dev jsx <url> --style unocss
figma-dev jsx <url> --style css-modules
figma-dev jsx <url> --style styled-components
figma-dev jsx <url> --style emotion
figma-dev jsx <url> --style vanilla-extract
figma-dev jsx <url> --style panda-css
```

---

## 5. 竞品分析与借鉴

### 5.1 主流 Figma 转代码工具对比

| 工具 | 优点 | 缺点 | figma-dev-tools 可借鉴点 |
|------|------|------|----------------------|
| **Builder.io (Visual Copilot)** | 1. AI 代码生成质量高<br>2. 支持多框架（React/Vue/Svelte/Qwik/Angular）<br>3. 可与 Builder CMS 集成<br>4. 支持实时预览和编辑<br>5. 设计系统映射完善 | 1. 付费服务，免费额度有限<br>2. 依赖 Builder 生态，不够独立<br>3. 生成代码有 vendor lock-in<br>4. 对中文生态支持差<br>5. 需要联网使用 | ✅ 多框架代码生成架构（我们已有结构化数据，可扩展 code generator）<br>✅ 实时预览功能（集成到本地 dev server）<br>✅ 设计系统映射机制 |
| **Anima** | 1. 高保真还原度，支持复杂交互<br>2. 支持 React/Vue/HTML<br>3. 设计系统组件识别<br>4. 开发者友好的代码输出<br>5. Figma 插件体验好 | 1. 主要是 SaaS 服务，本地支持弱<br>2. 代码质量参差不齐，常需手动调整<br>3. 价格昂贵<br>4. 对 Tailwind 支持一般<br>5. 不支持 MCP/AI Agent 集成 | ✅ 高保真还原算法（交互原型识别）<br>✅ Figma 插件端体验（可做 Companion 插件）<br>✅ 组件识别与映射 UI |
| **Locofy.ai** | 1. AI 智能识别组件和布局<br>2. 支持 React/Next.js/Vue/HTML<br>3. 响应式自动生成<br>4. 提供 LocoAI 辅助调整<br>5. 代码可导出到 GitHub | 1. 付费产品<br>2. 生成代码依赖 Locofy 运行时<br>3. 自定义程度有限<br>4. 复杂组件仍需大量调整<br>5. 不支持中国小程序 | ✅ AI 组件拆分逻辑<br>✅ 响应式自动推断<br>✅ GitHub 集成直接 PR（可做类似功能） |
| **Figma to Code (开源)** | 1. 开源免费<br>2. 轻量，直接在 Figma 中运行<br>3. 支持 HTML/Tailwind/React | 1. 功能简单，无 token 提取<br>2. 代码质量一般，div soup 严重<br>3. 无资源下载<br>4. 不支持 AI Agent<br>5. 维护不活跃 | ✅ Figma 插件内即时预览<br>✅ 快速复制代码体验 |
| **Figma Dev Mode (官方)** | 1. 原生集成，体验流畅<br>2. 支持查看代码片段<br>3. Variables 支持好<br>4. 与 Figma 生态无缝衔接 | 1. 仅代码片段，不能生成完整组件<br>2. 框架支持有限（基础 HTML/CSS）<br>3. 无资源下载管线<br>4. 无 AI 辅助<br>5. 需要付费 Figma 计划 | ✅ 原生 Inspect 体验（对齐查看尺寸/间距的交互）<br>✅ Variables 深度集成<br>✅ 代码片段即时预览 |
| **Tailwind CSS Figma to Code** | 1. Tailwind 映射准确<br>2. 简单易用<br>3. 专注 Tailwind | 1. 只支持 Tailwind<br>2. 无组件生成<br>3. 功能单一 | ✅ Tailwind 类名映射精度（我们已有 CIE76，可继续优化） |
| **Clapy** | 1. 代码整洁度高<br>2. 支持 React/Vue/Angular<br>3. 组件拆分合理 | 1. 付费<br>2. 生成速度慢<br>3. 中文支持差 | ✅ 代码整洁度优化<br>✅ 组件拆分算法 |
| **Quest AI** | 1. AI 生成质量高<br>2. 支持 React/MUI<br>3. 可导出完整项目 | 1. 价格高<br>2. MUI 绑定，不灵活<br>3. 自定义困难 | ✅ MUI/Ant Design 等组件库映射 |
| **TeleportHQ** | 1. 低代码平台集成<br>2. 支持多框架<br>3. 可视化编辑器 | 1. 平台锁定<br>2. 学习曲线陡<br>3. 不如纯代码灵活 | ✅ 可视化编辑能力（作为可选 Web UI） |

### 5.2 差异化优势（figma-dev-tools 独有）

我们的核心优势需要保持并放大：

1. **✅ MCP 原生 + AI Agent 优先**：这是我们最大的差异化，竞品大多是 SaaS 或 Figma 插件，我们专为 AI 编辑器（Trae/Cursor/Claude/Windsurf）设计
2. **✅ 本地优先，隐私安全**：所有处理在本地完成，不依赖云服务，企业用户放心
3. **✅ 开源免费 MIT**：完全开源，可自托管，可定制
4. **✅ 渐进式上下文**：metadata → designContext → 完整数据，解决 AI 上下文爆炸问题，这是独特创新
5. **✅ 节点层级智能精简**：消除 ~60% div soup，竞品大多做不到
6. **✅ 零配置 npx 启动**：无需安装即可使用，体验极佳
7. **✅ 中国生态支持**：微信小程序/uni-app/Taro/支付宝小程序/抖音小程序，这是海外竞品完全不做的
8. **✅ 10+ 编辑器一键安装**：最广泛的编辑器支持（Zed、Cline、Roo Code 等）

### 5.3 需要快速补齐的短板

1. **Vue 等多框架一等公民支持**：目前只有 React 有完整代码生成，其他框架仅结构化数据。Builder.io/Locofy 都支持多框架
2. **实时预览能力**：生成后可直接在浏览器预览，无需复制粘贴到项目
3. **设计系统/组件库映射**：能识别项目已有的组件库（shadcn/ui 等）并复用，而非从头写
4. **响应式自动生成**：目前已有设备推断和布局建议，可进一步自动生成响应式类名
5. **Figma 插件 Companion**：提供官方 Figma 插件，在 Figma 内选择节点一键发送到 figma-dev-tools

---

## 6. 优先级路线图

### v1.2.0（当前版本）- 便捷性 + 智能化 + 安全

- [x] Token 安全存储（系统 Keychain/Credential Manager + AES 加密文件双后端）
- [ ] Vue 3 SFC 一级支持（未完成）
- [x] 交互式配置向导（figma-dev wizard 命令）
- [x] 响应式断点智能推断（已实现 responsive-inferrer）
- [ ] CSS Modules 完整支持（未完成）
- [x] 自动导入整理 + Prettier 格式化（code-formatter.ts 实现）
- [x] 中文友好错误提示（i18n 错误码系统，完整中文错误信息和解决方案）
- [x] 常见 Flex 问题自动修复（flex-fixer.ts 实现）
- [x] pnpm/bun/yarn 包管理器更好的检测（README 和安装脚本已支持）
- [x] Zed 编辑器配置优化（已支持 Zed、Cline、Roo Code 等 10+ 编辑器）
- [x] Shell 自动补全（zsh/bash/powershell，figma-dev completion 命令）
- [x] 教程命令（figma-dev tutorial）
- [x] 多 Token 管理（token set/get/list/delete/default 命令）
- [x] SVG 自动优化（SVGO 集成）
- [x] SVG Sprite 生成（figma_create_icon_sprite MCP 工具）
- [x] 框架无关结构化数据（figma_get_structured_data，适用于 Vue/Svelte/HTML 等）
- [x] Tailwind 类名智能合并（tailwind-merge + clsx 的 cn() 工具）
- [x] cn() 工具函数导出
- [x] 国际化 i18n（中/英双语，首次使用可选择语言，figma-dev lang 命令切换）
- [x] 无障碍（a11y）自动增强（语义化标签、alt 文本、ARIA 属性、按钮识别）
- [x] 语义化标签自动选择（header/nav/main/section/article/button 而非全用 div）
- [x] 图片智能 alt 文本生成（装饰性图片 alt=""）
- [x] 设计系统自动化（颜色变量提取、间距/字体/圆角/阴影系统对齐）
- [x] 颜色变量别名建议（--color-brand-primary 而非硬编码十六进制）
- [x] 设备类型推断（移动端/平板/桌面）
- [x] 移动端/桌面端布局方向建议（flex-col vs flex-row）
- [x] 错误码系统（TOKEN_INVALID、NETWORK_ERROR 等带解决方案）

### v1.3.0（下一个版本，规划中）- 多框架 + 多端

- [ ] UnoCSS 一级支持
- [ ] Styled Components / Emotion 支持
- [ ] 组件库智能识别（shadcn/ui、Ant Design、MUI）
- [ ] Vue 3 SFC 一级支持
- [ ] CSS Modules 完整支持
- [ ] 微信小程序支持（WXML/WXSS/rpx）
- [ ] uni-app 支持（Vue 语法 + 多端）
- [ ] Storybook 故事自动生成
- [ ] Watch 模式（设计稿变化自动更新）
- [ ] 本地 Web 配置面板
- [ ] Batch 批量生成多个组件

### v1.4.0（中长期，5-6个月）- 全面性 + 高级 AI

- [ ] Svelte/Angular/Solid/Qwik/Astro 支持
- [ ] 支付宝/抖音小程序支持
- [ ] Taro 支持
- [ ] vanilla-extract / Panda CSS 支持
- [ ] 交互逻辑推断（模态框/表单/轮播）
- [ ] 数据结构推断 + map 渲染示例
- [ ] Electron/Tauri 桌面应用适配
- [ ] 移动端 H5 深度适配（安全区域/触屏/1px）
- [ ] Figma Companion 插件（可选增强）
- [ ] 本地缓存（加密 SQLite）
- [ ] 代码差异对比 + 增量更新（不覆盖用户修改）

### v2.0.0（远期，7-12个月）- 生态 + 平台

- [ ] React Native / Flutter 支持
- [ ] 实时预览服务器（侧-by-side对比）
- [ ] 自定义代码模板系统
- [ ] 插件系统（社区扩展）
- [ ] GUI 可视化编辑器
- [ ] 团队/企业特性（权限管理、团队设计系统同步）
- [ ] CI/CD 集成（GitHub Action）
- [ ] 设计 Token 双向同步（代码 → Figma）
- [ ] TV 端/大屏适配
- [ ] 国际化（i18n）文本提取

---

## 总结

figma-dev-tools v1.2.0 已经打下了非常好的基础，特别是在 **MCP 原生支持**、**渐进式上下文解决 AI 爆炸问题**、**节点层级精简**、**零配置启动**、**安全 Token 存储**、**i18n 国际化**、**a11y 无障碍增强**、**Flex 自动修复**、**响应式推断**、**设计系统自动化** 这几个方面有独特优势。

v1.2.0 已完成的核心能力：
1. **🔐 安全** - Token 安全存储（Keychain/加密文件）、多 Token 管理
2. **🌍 国际化** - 中英双语、中文友好错误提示、错误码系统
3. **♿ 无障碍** - 语义化标签、alt 文本、ARIA 属性
4. **🔧 Flex 修复** - 常见布局问题自动解决
5. **📱 响应式** - 设备类型识别、布局方向建议、断点推断
6. **🎨 设计系统** - 颜色变量提取、Tailwind 系统对齐、cn() 工具函数
7. **⚡ 便捷性** - 交互式向导、Shell 补全、教程命令、Prettier 格式化
8. **🖼️ 资源处理** - SVG 自动优化、SVG Sprite 生成
9. **📦 多编辑器** - Zed/Cline/Roo Code 等 10+ 编辑器支持
10. **🔌 框架无关** - figma_get_structured_data 适用于任意框架

接下来的优化方向：
1. **优先保持差异化**：继续强化 AI Agent 友好性、本地隐私安全、开源免费
2. **快速补齐短板**：Vue 3 一级支持、UnoCSS/Styled Components 等样式方案、组件库识别、小程序支持
3. **抓住中国市场**：小程序/uni-app/Taro 是海外竞品不会做的，这是我们的蓝海
4. **持续智能化**：利用 AI 做更多自动推断和修复，从"生成代码"升级到"生成可直接上线的产品级代码"
