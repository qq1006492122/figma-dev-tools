# figma-dev-tools v1.4.18 开发指南

## 项目概述

figma-dev-tools 是一个 Figma 设计稿转代码的 MCP 工具，支持 React + Tailwind CSS
/ Vue +
UnoCSS 代码生成，提供 GUI 配置向导、XSS 安全防护、智能层级修复、SVG 内联渲染、动画检测等完整工具链。

## 环境要求

- Node.js >= 20
- pnpm >= 10.26.2（也支持 npm/yarn/bun）

## 常用命令

| 命令                 | 说明                     |
| -------------------- | ------------------------ |
| `npm install`        | 安装依赖                 |
| `npm run dev`        | 开发模式（监听文件变化） |
| `npm run build`      | TypeScript 编译          |
| `npm run cli`        | 运行 CLI 命令            |
| `npm test`           | 运行测试（含冒烟，v1.4.18 起三层体系） |
| `npm run test:watch` | 监听模式运行测试         |
| `npm run test:smoke` | 只跑发布级冒烟（`test/smoke/`，需先 build） |
| `npm run test:perf`  | 压测脚本（`test/perf/run-bench.mjs`，本机基线，无 CI 硬指标） |
| `npm start`          | 运行编译后的代码         |

### 三层测试体系（v1.4.18 建立）

| 层级 | 目录 | 内容 | 运行方式 |
| ---- | ---- | ---- | -------- |
| 单元测试 | `test/services/` 等 | 纯函数/服务级，夹具工厂 `test/fixtures/`（nodes.ts 含 makeLargeTree：branch=4/depth=7 = 21845 节点） | `npx vitest run <file>` |
| 冒烟测试 | `test/smoke/` | 发布级回归：MCP stdio harness（真实 `dist/index.js mcp`）、CLI 子进程 `--help` 双语言快照（29 帮助路径） | `npm run test:smoke`（先 `npm run build`） |
| 压测 | `test/perf/` | 大树/批处理性能基线脚本，仅出脚本与本机基线，不设 CI 硬门槛 | `npm run test:perf` |

- 快照首次不会自动写入，需 `npx vitest run <file> -u`，写入后必须人工 Read 审查 diff。
- v1.4.18 发布基线：单测 24 文件 323 用例；冒烟 4 文件 68 用例；默认聚合 27 文件 375 全绿。
- 工具数基线：`test/smoke/mcp-tools.smoke.test.ts` 的 `BASELINE_TOOL_NAMES` 是 20 个工具的**严格有序数组**，新增/改名工具必须同步更新（v1.4.19→22，v1.4.20→23）。

## 项目结构

```
figma-dev-tools/
├── bin/                    # CLI 入口
│   └── figma-dev.js
├── src/
│   ├── index.ts           # MCP 服务器入口（20 个 MCP 工具）
│   ├── cli/               # CLI 命令实现
│   │   └── index.ts
│   ├── i18n/              # 国际化（zh-CN/en-US）
│   │   ├── index.ts
│   │   ├── zh-CN.ts
│   │   └── en-US.ts
│   ├── services/          # 核心服务（v1.4.0 新增标注）
│   │   ├── figma-client.ts      # Figma API 客户端（v1.4.0：getImages自动分批，URL长度保护）
│   │   ├── node-processor.ts    # 节点处理（v1.4.0：层级修复+三重边界保护）
│   │   ├── tailwind-mapper.ts   # Figma → Tailwind 映射
│   │   ├── code-generator.ts    # React 代码生成（v1.4.0：XSS防护+import分组排序+交互推断+语义标签+Props泛型）
│   │   ├── vue-generator.ts     # Vue 3 SFC 代码生成（v1.4.0：XSS防护+SVG内联渲染集成）
│   │   ├── code-formatter.ts    # Prettier 格式化
│   │   ├── flex-fixer.ts        # Flex 布局自动修复
│   │   ├── a11y-enhancer.ts     # 无障碍增强
│   │   ├── design-system.ts     # 设计系统自动化
│   │   ├── responsive-inferrer.ts # 响应式推断+H5适配建议
│   │   ├── design-linter.ts     # 设计规范检查（v1.4.0：层级问题检测）
│   │   ├── asset-downloader.ts  # 资源下载
│   │   ├── svg-inline-renderer.ts # v1.4.0：SVG内联渲染+svgo优化+currentColor+LRU缓存+XSS清理
│   │   ├── svg-sprite-generator.ts # SVG Sprite
│   │   ├── animation-detector.ts # v1.4.0新增：动画动效检测（基础框架）
│   │   ├── hierarchy-fixer.ts   # v1.4.0新增：智能层级修复
│   │   ├── component-mapper.ts  # v1.4.0新增：组件库映射（shadcn/ui等检测）
│   │   ├── interaction-inferrer.ts # v1.4.0新增：交互逻辑推断（按钮/表单/Tab/弹窗等状态自动推断）
│   │   ├── watch-mode.ts        # v1.4.0新增：Watch 模式（轮询 Figma 变更自动重新生成代码）
│   │   ├── cache.ts             # v1.4.0新增：AES加密本地缓存
│   │   ├── gui-server.ts        # GUI配置向导服务器
│   │   ├── token-store.ts       # Token 安全存储
│   │   ├── tokens-extractor.ts  # Token 提取
│   │   ├── token-matcher.ts     # Token 匹配
│   │   ├── design-context.ts    # 设计上下文（v1.4.0：添加fileKey字段支持SVG渲染）
│   │   ├── file-writer.ts       # 文件写入（v1.4.18：writeDtcgTokens，build→validate→写盘）
│   │   ├── props-type-generator.ts # v1.4.18新增：Component Properties→React interface/Vue3 Props
│   │   ├── dtcg-token-formatter.ts # v1.4.18新增：W3C DTCG Tokens 构建/序列化/结构校验（纯函数零依赖）
│   │   ├── import-organizer.ts  # v1.4.18新增：import 语句级整理（react/vue 双解析，幂等）
│   │   ├── bundler-detector.ts  # v1.4.18新增：Vite/Webpack/Next.js/Remix 构建器检测
│   │   ├── asset-paths.ts       # v1.4.18新增：五形态资源落位路径修正
│   │   ├── ca-aware-downloader.ts # v1.4.18新增：自定义 CA 感知下载（FIGMA_CA_CERT_PATH）
│   │   ├── tls-agent.ts         # v1.4.18新增：PEM 校验 + 额外 CA 的 https.Agent
│   │   └── style-renderers/     # v1.4.18新增：样式方案可插拔架构
│   │       ├── types.ts         #   StyleRenderer 接口 / StyleSidecarFile / 格式联合类型
│   │       ├── registry.ts      #   11 描述符注册表、assertStyleFormatSupported、help 文本
│   │       ├── factory.ts       #   createStyleRenderer(format,{framework,unocssMode})
│   │       ├── tailwind-renderer.ts
│   │       ├── unocss-renderer.ts # preset-wind + Attributify 归因渲染器
│   │       ├── css-modules-renderer.ts # 声明提取/共享类/碰撞去重/composes/sidecar
│   │       └── index.ts         #   桶文件
│   ├── types/             # TypeScript 类型定义
│   │   └── nodes.ts
│   ├── utils/             # 工具函数（v1.4.0 新增标注）
│   │   ├── cn.ts                # className 合并
│   │   ├── color.ts             # 颜色处理
│   │   ├── errors.ts            # 错误码系统
│   │   ├── figma-url.ts         # Figma URL解析
│   │   └── security.ts          # v1.4.0新增：XSS安全防护工具
│   └── types.ts           # Figma API 类型
├── dist/                  # TypeScript 编译输出
├── test/                  # 测试（v1.4.18 三层体系）
│   ├── services/          # 单元测试（样式管线/DTCG/Props/CA/资源落位等）
│   ├── fixtures/          # 夹具数据（nodes.ts：makeLargeTree 等；page.ts）
│   ├── helpers/           # 测试辅助（optional-deps 等）
│   ├── smoke/             # 冒烟（mcp-harness stdio、mcp-tools、cli、cli-help 双语言快照）
│   └── perf/              # 压测脚本（run-bench.mjs，本机基线，v1.4.20 落地）
├── install.mjs            # 安装脚本
├── uninstall.mjs          # 卸载脚本
├── mcp-standalone.mjs     # MCP 独立运行脚本
├── FIGMA-DESIGN-GUIDELINES.md # 设计规范文档
├── OPTIMIZATION-ANALYSIS.md   # 优化分析
├── SKILL.md               # Skill 说明文档
├── README.md              # 项目说明
├── LICENSE                # 许可证
├── mcp-config.schema.json # MCP 配置 Schema
├── .env.example           # 环境变量示例
├── tsconfig.json          # TypeScript 配置
└── package.json
```

## ⚠️ 开发注意事项

### 1. 临时文件清理

- **任务执行完成后必须删除临时脚本文件**，包括但不限于：
  - 以 `fix-` 开头的修复脚本
  - 以 `verify-` 开头的验证脚本
  - 以 `release-` 开头的发布脚本
  - 以 `_` 开头的临时文件
  - `test-*.txt` 等测试文件
- 以下是项目必需的脚本文件，**不要删除**：
  - `install.mjs` - 安装脚本
  - `uninstall.mjs` - 卸载脚本
  - `mcp-standalone.mjs` - MCP 独立运行脚本

### 2. 代码规范

- **禁止使用 `any` 类型**，使用 `unknown` 或具体类型替代
- 未使用的变量/参数以下划线 `_` 开头
- 使用 TypeScript 严格模式
- 优先使用 `import type` 导入类型
- 字符串模板使用反引号 `` ` ``，不是单引号 `'`
- 避免在 map 中使用对象 spread，使用 Object.assign 或直接赋值
- 避免冗余的条件判断（如 `x > 0 && x > 20` 只需要 `x > 20`）

### 3. Lint 规则

提交前必须通过 lint 和类型检查：

```bash
npm run build     # 确保 TypeScript 编译通过
npm test          # 确保测试通过
```

### 4. 国际化 (i18n)

- 所有用户可见文本必须通过 i18n 系统
- 新增文本需要同时更新 zh-CN.ts 和 en-US.ts
- 带参数的翻译使用函数形式，参考现有 colorAlias 等示例

### 5. 版本号管理

- 版本号唯一真源是 package.json（package-lock.json 根条目同步）
- 不要在代码中硬编码版本号：CLI/GUI 与 MCP 握手版本（src/index.ts 的 McpServer.version）均在运行时从 package.json 读取
- 发布版本时同步更新 package.json version/description、package-lock.json 及 README×2/QUICKSTART×2/SKILL.md/DEVELOPMENT.md 中的版本号与版本历史

### 6. Git 提交规范

使用 Conventional Commits：

- `feat:` 新功能
- `fix:` 修复
- `docs:` 文档
- `refactor:` 重构
- `chore:` 构建/工具
- `test:` 测试

### 7. 发布流程

1. 确保所有检查通过：
   ```bash
   npm run build
   npm test                 # 含冒烟；或分层执行：npx vitest run + npm run test:smoke
   npm audit --omit=dev     # 0 漏洞
   npm pack --dry-run       # 确认清单无 test/、.trae/、specs/、src/ 等白名单外内容
   ```
2. 确认版本号正确（package.json / package-lock.json / 8 份文档版本历史一致）
3. 确认没有临时文件
4. git add/commit/push
5. npm publish --access public（发布动作需人工确认，不得自动执行）

## MCP 工具列表（v1.4.18：20 个，注册顺序以冒烟基线为准）

| # | 工具名 | 说明 |
| - | ------ | ---- |
| 1 | figma_parse_url | 解析 Figma URL 得到 fileKey/nodeId |
| 2 | figma_get_file | 获取 Figma 文件信息 |
| 3 | figma_extract_tokens | 提取设计 Tokens（Variables+Styles） |
| 4 | figma_generate_component | 生成 React 组件（旧版管线兼容） |
| 5 | figma_get_screenshot | 获取节点截图 |
| 6 | figma_generate_styles | Tokens → CSS Variables / Tailwind v4 / JSON / **DTCG（v1.4.18）** |
| 7 | figma_sync_to_project | Tokens 落盘到项目（css/tailwind/json/**dtcg**/all，自动备份） |
| 8 | figma_validate_token | 校验 Figma Token |
| 9 | figma_get_metadata | 高层结构概览（渐进式上下文） |
| 10 | figma_get_design_context | 精简设计上下文详情 |
| 11 | figma_download_assets | 下载图片/SVG（SVGO；v1.4.18 按构建器落位） |
| 12 | figma_create_icon_sprite | 生成 SVG Sprite |
| 13 | figma_list_components | 列出文件 Components/ComponentSets |
| 14 | figma_lint_design | 代码还原质量预检 |
| 15 | figma_generate_jsx | 生成 React/Vue 组件（推荐；v1.4.18 多样式 + TS Props） |
| 16 | figma_get_structured_data | 框架无关结构化数据 |
| 17 | figma_dev_fallback_status | 付费墙兜底服务状态 |
| 18 | figma_dev_fallback_capture | 浏览器兜底截图 |
| 19 | figma_verify_fidelity | 还原度像素 diff 校验 |
| 20 | figma_ocr_extract | OCR 文本提取（原生 JSON + tesseract.js 兜底） |

> 规划：v1.4.19 增至 22 个（figma_generate_vue、figma_batch_generate）；v1.4.20 增至 23 个（figma_generate_weapp）。
> 该名单的唯一真源是 `test/smoke/mcp-tools.smoke.test.ts` 的 `BASELINE_TOOL_NAMES`（严格有序，含数量断言），改动必须同步。
