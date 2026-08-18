# figma-dev-tools v1.4.10 开发指南

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
| `npm test`           | 运行测试                 |
| `npm run test:watch` | 监听模式运行测试         |
| `npm start`          | 运行编译后的代码         |

## 项目结构

```
figma-dev-tools/
├── bin/                    # CLI 入口
│   └── figma-dev.js
├── src/
│   ├── index.ts           # MCP 服务器入口（19 个 MCP 工具）
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
│   │   └── file-writer.ts       # 文件写入
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

- 版本号在 package.json、src/cli/index.ts、src/index.ts 三处保持一致
- 不要在代码中硬编码版本号，从 package.json 读取或统一常量

### 6. Git 提交规范

使用 Conventional Commits：

- `feat:` 新功能
- `fix:` 修复
- `docs:` 文档
- `refactor:` 重构
- `chore:` 构建/工具
- `test:` 测试

### 7. 发布流程

1. 确保所有检查通过：`npm run build && npm test`
2. 确认版本号正确
3. 确认没有临时文件
4. git add/commit/push
5. npm publish --access public

## MCP 工具列表（19 个）

| 工具名                        | 说明                                    |
| ----------------------------- | --------------------------------------- |
| figma_parse_url               | 解析 Figma URL 得到 fileKey/nodeId      |
| figma_get_file                | 获取 Figma 文件信息                     |
| figma_get_node                | 获取节点信息                            |
| figma_get_metadata            | 获取节点元数据概览（渐进式上下文）      |
| figma_get_design_context      | 获取节点设计上下文详情                  |
| figma_get_structured_data     | 获取框架无关结构化数据                  |
| figma_lint_design             | 代码还原质量预检                        |
| figma_generate_jsx            | 生成增强版 JSX/Vue 组件（推荐）         |
| figma_generate_component      | 生成 React 组件（旧版兼容）             |
| figma_download_assets         | 下载图片/SVG 资源（SVGO 优化）          |
| figma_create_icon_sprite      | 生成 SVG Sprite                         |
| figma_get_screenshot          | 获取节点截图                            |
| figma_sync_tokens             | 同步设计 Tokens 到项目文件              |
| figma_dev_fallback_status     | 检测付费墙兜底服务可用性（v1.4.4 新增） |
| figma_dev_fallback_capture    | 浏览器兜底截图（v1.4.4 新增）           |
| figma_verify_fidelity         | 还原度像素 diff 校验（v1.4.4 新增）     |
| figma_get_cache_status        | 缓存状态查询（v1.4.4 新增）             |
| figma_clear_cache             | 清除缓存（v1.4.4 新增）                 |
| figma_get_i18n_status         | i18n 状态查询（v1.4.4 新增）            |
