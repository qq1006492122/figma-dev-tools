# figma-dev-tools v1.4.20 迭代计划

> 制定日期：2026-10-09
> 当前版本：**v1.4.19**（已发布）
> 目标版本：**v1.4.20**
> 版本定位：**小程序生态首发 + 体验打磨 + 第三框架补齐**
> 预计迭代周期：4-5 周
> 版本跨度：v1.4.20（单版本聚焦发布，不拆分子版本迭代）

---

## 一、版本背景与定位

### 1.1 v1.4.19 已完成的重大能力

v1.4.19 是一个**功能爆发式**的版本，相比 v1.4.13 新增了大量核心能力：

| 领域 | v1.4.13 → v1.4.19 新增 |
|------|----------------------|
| **MCP 工具** | 19 个 → **22 个**（新增 OCR / Vue生成 / 批量生成） |
| **样式方案** | 2 套 → **10 套可用 + 1 套前置（css-variables 架构准备，完整实现计划 v1.5.0）**（Tailwind / UnoCSS / CSS Modules / Styled / Emotion / Less / Sass / vanilla-extract / Panda / inline / css-variables 待 1.5.0） |
| **框架支持** | React 一级 + Vue 结构化 → **React / Vue 双一级**（Vue3 setup / Vue2 Options API） |
| **组件库映射** | 基础 shadcn/ui → **shadcn/ui + Ant Design + Element Plus + 自定义 components.json** |
| **生成模式** | 单组件 → **单组件 + 批量生成 + 语义区块拆分** |
| **智能推断** | Flex修复 + a11y + 响应式 → **T21 布局/图标/暗色/动效 + T22 表单/Modal/轮播/Tabs/手风琴/列表数据化/语义命名** |
| **TS 类型** | 无 → **Component Properties → TS Props 自动推导**（React interface + Vue defineProps） |
| **OCR** | 无 → **原生节点优先 + tesseract.js 兜底 + SSRF 防护** |
| **DTCG Tokens** | 无 → **W3C DTCG 标准输出 + 结构校验** |
| **测试覆盖** | 99 用例 → **493 用例**（单测 323 + 冒烟 68 + 性能） |
| **企业网络** | 无 → **自定义 CA 证书 + 构建器自动检测 + 资源路径自动修正** |
| **代码质量** | 基础 → **导入自动整理 + Prettier 格式化 + 幂等** |
| **安全加固** | 基础 → **SSRF 加固 + DNS rebinding 防护 + --update 双校验 + GUI Origin 白名单** |

### 1.2 v1.4.20 定位

**v1.4.20 = 小程序生态首发 + Svelte 第三框架 + 体验打磨**

选择这三个方向的原因：
1. **README 已官宣**：v1.4.19 README 明确写了"微信/uni-app/Taro 小程序计划于 v1.4.20 接入"，用户已有预期
2. **差异化护城河**：小程序是中国市场独有的蓝海，海外竞品（Builder.io / Anima / Locofy）完全不支持
3. **架构已经就绪**：style-renderers 可插拔架构 + structured_data 框架无关数据 + vue-generator 已有范式，小程序生成器可复用大量基础设施
4. **Svelte 是自然延伸**：React/Vue 已一级支持，Svelte 是第三大组件框架，补齐后覆盖度更完整
5. **v1.4.19 功能太多，需要一个"打磨版本"**：把 v1.4.18-19 新增能力的边缘 case 和体验问题收口

---

## 二、迭代优先级总览

### 2.1 优先级分层

| 优先级 | 分类 | 说明 | 数量 |
|--------|------|------|------|
| **P0** | 小程序生态 | 本版本旗舰特性，差异化护城河 | 3 项 |
| **P1** | 第三框架 + 体验 | Svelte 一级支持 + Watch 模式 + 代码对比 | 3 项 |
| **P2** | 功能完善 | 已有能力的增强和补全 | 4 项 |
| **P3** | 质量 + 技术债 | 测试增强 + 性能优化 + 重构 | 3 项 |

### 2.2 功能总览表

| # | 功能模块 | 优先级 | 核心价值 | 工作量 |
|---|---------|--------|---------|--------|
| 1 | **微信小程序一级支持** ⭐ | P0 | 中国市场独家差异化，竞品空白 | 高 |
| 2 | **uni-app 支持** | P0 | Vue 语法 + 多端输出，覆盖更广 | 中 |
| 3 | **Taro 基础支持** | P0 | React/Vue 双语法，企业级常用 | 中 |
| 4 | **Svelte 一级支持** | P1 | 第三大组件框架，补齐覆盖度 | 中高 |
| 5 | **Watch 模式 MCP 化** | P1 | 设计稿改动自动同步，效率提升 | 中 |
| 6 | **代码差异对比工具** | P1 | 重新生成时看到 diff，辅助人工审查 | 中 |
| 7 | **组件库映射增强（React 集成深化）** | P2 | 从"建议"到"生成代码直接用组件库" | 中 |
| 8 | **富文本渲染增强** | P2 | 富文本还原度进一步提升 | 低 |
| 9 | **响应式推断深化** | P2 | 从"建议"到"生成响应式代码骨架" | 中 |
| 10 | **CSS Variables 样式方案（前置）** | P2 | 为 v1.5.0 打基础 | 中 |
| 11 | **大文件性能优化** | P3 | 复杂设计稿处理速度提升 | 中 |
| 12 | **测试覆盖率持续提升** | P3 | 质量保障，目标 550+ 用例 | 中 |
| 13 | **文档与示例全面更新** | P3 | 用户体验闭环 | 低 |

---

## 三、详细迭代计划

### P0 - 小程序生态（旗舰特性 ⭐）

#### P0-1：微信小程序一级支持

**目标：** 新增 `figma_generate_weapp` MCP 工具 + `figma-dev weapp` CLI，支持 Figma → 微信小程序原生代码（WXML / WXSS / JS / JSON）。

**技术方案：**

1. **小程序生成器（WeappGenerator）**
   - 复用 node-processor + design-context + structured_data 管线
   - 新建 `services/weapp-generator.ts`
   - 输出四件套：`.wxml` + `.wxss` + `.js` + `.json`
   - 支持组件化输出（Component 构造器）

2. **标签映射**
   | HTML / React | 微信小程序 | 说明 |
   |-------------|-----------|------|
   | `<div>` | `<view>` | 普通容器 |
   | `<span>` / `<p>` | `<text>` | 文本 |
   | `<img>` | `<image>` | 图片，支持 lazy-load |
   | `<button>` | `<button>` | 按钮 |
   | `<input>` | `<input>` | 输入框 |
   | `<nav>` / `<a>` | `<navigator>` | 导航链接 |
   | `<section>` | `<view>` | 区块容器 |
   | `<article>` / `<card>` | `<view>` | 卡片容器 |
   | `<hr>` | `<view class="divider">` | 分割线 |
   | `<ul>` / `<ol>` | `<block wx:for>` | 列表 |
   | `<li>` | `<view>` | 列表项 |

3. **样式映射**
   - 单位转换：px → rpx（默认 750rpx 设计稿基准）
   - 不支持的 CSS 属性自动降级并告警
   - 小程序样式限制检测与提示（rpx 为推荐单位；% 在部分场景可用；vw/vh 支持但兼容性需注意；calc() 支持有限）
   - class 命名转换：kebab-case 兼容（小程序支持）

4. **小程序特有配置**
   - `app.json` 页面注册建议
   - `project.config.json` 配置建议
   - TabBar 配置自动生成（如果检测到 TabBar 设计）
   - 页面导航栏配置（navigationBarTitleText 等）

5. **MCP 工具新增**
   - `figma_generate_weapp`
   - 参数：`figmaUrl` / `fileKey` / `nodeId` / `componentName` / `pagePath` / `designWidth(750)` / `unit(rpx|px)` / `inference`

6. **CLI 命令新增**
   - `figma-dev weapp <url> --name Xxx --output ./pages/xxx`

**验收标准：**
- 基础组件（按钮、卡片、列表、表单、导航）生成正确
- 样式还原度 ≥ 85%（像素 diff）
- 生成的代码可直接在微信开发者工具中运行
- 小程序特有 API（wx:for / wx:if / bindtap）正确使用
- 包含完整的 JSON 配置文件

---

#### P0-2：uni-app 支持

**目标：** 基于 Vue 生成器扩展，支持 uni-app 框架输出，可编译到多端（微信/支付宝/抖音/H5 等）。

**技术方案：**

1. **复用 Vue 生成器管线**
   - uni-app 基于 Vue 语法，大部分逻辑可复用 vue-generator
   - 新增 uni-app 特有适配层

2. **关键适配点**
   - 标签：`<div>` → `<view>`、`<img>` → `<image>`、`<span>` → `<text>`（同小程序）
   - 事件：`@click` → `@click`（uni-app 兼容），原生小程序事件用 `bind*` 但 uni-app 用 Vue 风格
   - 条件编译：`#ifdef MP-WEIXIN` / `#ifdef H5` 等
   - 资源路径：`@/static/xxx.png`（uni-app 静态资源规范）
   - uni-ui 组件库识别与映射

3. **配置文件生成**
   - `pages.json`：页面路由 + 全局样式 + TabBar
   - `manifest.json`：应用配置（多端）
   - `App.vue` + `main.js`：入口文件

4. **MCP 工具新增**
   - `figma_generate_uniapp`
   - 参数：`figmaUrl` / `fileKey` / `nodeId` / `componentName` / `pagePath` / `targetPlatform`（mp-weixin / h5 / mp-alipay 等）

**验收标准：**
- 生成的 uni-app 页面可在 H5 和微信小程序两端正常运行
- Vue 语法正确，uni-app API 使用规范
- pages.json / manifest.json 配置正确

---

#### P0-3：Taro 基础支持

**目标：** 支持 Taro 框架（React 语法优先，Vue 可选），面向企业级多端开发场景。

**技术方案：**

1. **复用 React 生成器管线**
   - Taro React 语法与 React 高度一致
   - 新增 Taro 特有适配层

2. **关键适配点**
   - 标签：`import { View, Text, Image, Button } from '@tarojs/components'`
   - 样式：px → rpx / px 单位切换
   - 生命周期：Taro 生命周期钩子（useReady / useDidShow 等建议）
   - 资源路径：`@/assets/xxx.png`
   - Taro UI 组件库识别与映射

3. **配置文件生成**
   - `app.config.ts`：全局配置
   - `index.config.ts`：页面配置
   - `project.config.json`：微信小程序项目配置

4. **MCP 工具新增**
   - `figma_generate_taro`
   - 参数：`figmaUrl` / `fileKey` / `nodeId` / `componentName` / `framework(react|vue)` / `designWidth`

**验收标准：**
- Taro React 组件生成正确，可编译通过
- @tarojs/components 组件导入正确
- 配置文件格式正确

---

### P1 - 第三框架 + 体验优化

#### P1-1：Svelte 一级支持

**目标：** 新增 `figma_generate_svelte` MCP 工具，Svelte 成为第三大一级支持框架。

**技术方案：**

1. **Svelte 生成器（SvelteGenerator）**
   - 复用 node-processor + design-context 管线
   - 新建 `services/svelte-generator.ts`
   - 输出 `.svelte` 单文件组件
   - 样式方案：Tailwind / UnoCSS / CSS Modules（与 Vue 对齐）

2. **Svelte 特有语法**
   - 响应式声明：`$: derivedValue = computedValue`
   - 事件：`on:click` / `on:input`
   - 循环：`{#each items as item}`
   - 条件：`{#if condition}`
   - Props：`export let propName`
   - `{#key}` / `{#await}` 等高级特性按需建议

3. **样式渲染器适配**
   - Tailwind / UnoCSS：直接 class 字符串（同 React/Vue）
   - CSS Modules：Svelte 原生 CSS（`<style>` 块，默认 scoped）
   - 样式写在 `<style>` 块中

4. **MCP 工具新增**
   - `figma_generate_svelte`
   - 参数：`figmaUrl` / `fileKey` / `nodeId` / `componentName` / `styleFormat` / `inference` / `typescript`

**验收标准：**
- 生成的 .svelte 文件语法正确
- 样式还原度与 React/Vue 相当
- 响应式语法符合 Svelte 规范
- Props 声明正确

---

#### P1-2：Watch 模式 MCP 化

**目标：** 将已有的 WatchMode 服务暴露为 MCP 工具，支持设计稿改动自动触发重新生成。

**当前状态：**
- ✅ `watch-mode.ts` 服务已存在（轮询模式）
- ❌ 未暴露为 MCP 工具
- ❌ 仅支持 React code-generator
- ❌ 无增量更新，每次全量重写

**增强方案：**

1. **MCP 工具新增**
   - `figma_watch_start`：启动监听
     - 参数：`figmaUrl` / `nodeIds` / `framework` / `styleFormat` / `outputDir` / `pollIntervalMs`
   - `figma_watch_stop`：停止监听
   - `figma_watch_status`：查询当前监听状态

2. **多框架支持**
   - 支持 React / Vue / Svelte / 小程序
   - 复用对应生成器

3. **变更检测优化**
   - 当前：文件级 lastModified 轮询
   - 增强：节点级变更检测（对比节点 hash）
   - 只重新生成变更的节点（增量生成）

4. **用户修改保留**
   - 生成代码标记 `// figma-dev:start preserve` / `// figma-dev:end preserve`
   - 标记内的代码在重新生成时保留

**验收标准：**
- 启动 watch 后，Figma 文件修改能在 10 秒内检测到并重新生成
- 增量更新：未变更节点不重写文件
- 用户手动修改的 preserve 区块在重新生成时保留

---

#### P1-3：代码差异对比工具

**目标：** 重新生成组件时，显示与当前代码的 diff，帮助开发者了解变更点。

**技术方案：**

1. **MCP 工具新增**
   - `figma_compare_code`
   - 参数：
     - `figmaUrl` / `fileKey` / `nodeId`
     - `currentCode`：当前项目中的代码
     - `framework` / `styleFormat`
   - 输出：
     - `diff`：unified diff 格式字符串
     - `changes`：变更点列表（新增/删除/修改）
     - `stats`：变更统计（行数、节点数）

2. **实现方式**
   - 重新生成最新代码
   - 使用 diff 算法（自实现或引入 diff 库，控制体积）与当前代码对比
   - 输出结构化的变更信息，便于 AI Agent 解读

3. **与 Watch 模式联动**
   - Watch 模式检测到变更后，自动附带 diff 信息
   - 开发者可快速判断是否接受变更

**验收标准：**
- 能正确输出两个版本代码的差异
- 结构化输出清晰，AI Agent 可直接解读
- 性能：diff 计算 < 100ms（1000 行代码以内）

---

### P2 - 功能完善

#### P2-1：组件库映射增强（React 集成深化）

**目标：** 组件库映射从"建议/提示"升级为"生成代码直接使用组件库组件"。

**当前状态：**
- ✅ shadcn/ui / Ant Design / Element Plus 映射规则已定义
- ✅ 自定义 components.json 配置已支持
- ⚠️ 但 code-generator 中仅输出 TODO 注释提示，未实际替换为组件库代码

**增强方案：**

1. **代码生成集成**
   - `figma_generate_jsx` 新增参数 `componentLibrary: 'auto' | 'shadcn-ui' | 'ant-design' | 'element-plus' | 'none'`
   - 默认为 `'auto'`：读取项目 package.json 自动检测
   - 匹配成功的节点，直接生成组件库 import 和使用代码
   - 未匹配的降级为原生 HTML + 提示

2. **Props 映射深化**
   - Button：variant / size / disabled → 对应组件库 props
   - Card：title / description / footer → 对应 props 或 slot
   - Input：type / placeholder / disabled → 对应 props
   - Dialog / Modal：open / onOpenChange → 对应 props
   - Tabs：value / onValueChange / items → 对应 props

3. **组件库特定优化**
   - shadcn/ui：使用 `cn()` 合并 className，与现有风格一致
   - Ant Design：`import { Button } from 'antd'`，样式按需加载提示
   - Element Plus：`import { ElButton } from 'element-plus'`

4. **Vue 组件库映射**
   - Element Plus / Ant Design Vue 映射
   - Vue 生成器同步支持

**验收标准：**
- shadcn/ui 项目中，常见组件（Button/Card/Input/Dialog/Tabs/Avatar/Badge）自动识别率 ≥ 70%
- 生成代码直接 import 组件库组件，语法正确
- Props 映射准确率 ≥ 60%
- 可通过 componentLibrary 参数控制开关

---

#### P2-2：富文本渲染增强

**目标：** 富文本还原度从当前的"能用"提升到"精致"。

**增强点：**
1. **行内嵌套支持**：加粗 + 变色 + 链接等组合样式正确嵌套
2. **文本装饰**：underline / line-through 正确映射
3. **文本大小写**：text-case 映射（UPPER / lower / Title / SMALL_CAPS）
4. **段落间距**：多段文本的段间距正确处理
5. **列表识别**：有序/无序列表自动识别为 `<ul>/<ol>` + `<li>`
6. **链接识别**：带下划线 + 蓝色的文本识别为链接

**验收标准：**
- 组合样式（加粗+斜体+变色）正确渲染
- 文本装饰和大小写映射正确
- 列表自动识别准确率 ≥ 80%

---

#### P2-3：响应式推断深化

**目标：** 从"给出响应式建议注释"升级为"生成响应式代码骨架"。

**增强方案：**
1. **断点推断**
   - 根据设计稿尺寸推断设备类型（移动端 / 平板 / 桌面）
   - 移动端设计稿 → 建议 `md:` / `lg:` 桌面端增强
   - 桌面端设计稿 → 建议 `sm:` / `md:` 移动端适配

2. **常见响应式模式自动生成**
   - Flex 列转行：移动端 column，桌面端 row → `flex-col md:flex-row`
   - 字体缩放：移动端小字号，桌面端大字号 → `text-base md:text-lg`
   - 间距缩放：`p-4 md:p-6`
   - 网格列数变化：`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`

3. **安全区域适配**（移动端 H5）
   - 自动添加 `env(safe-area-inset-*)` 适配
   - 顶部导航 / 底部 TabBar 自动处理安全区域

4. **参数控制**
   - `inference.responsive` 开关
   - 可选：`mobileFirst` / `desktopFirst` 策略

**验收标准：**
- 移动端设计稿生成的代码包含桌面端增强的 md:/lg: 前缀
- 桌面端设计稿生成的代码包含移动端适配的 sm: 前缀
- 常见布局模式（列转行、网格变化）自动识别并生成对应类名

---

#### P2-4：CSS Variables 样式方案（前置工作）

**目标：** 为 v1.5.0 的 css-variables 完整支持打基础。

**工作内容：**
1. 新增 css-variables renderer 骨架
2. CSS 变量命名规范定义（--color-primary / --spacing-4 等）
3. 与 Design Tokens 的映射关系打通
4. 基础样式映射测试

**说明：** 完整的 css-variables 方案（含 CSS @layer、容器查询等高级特性）留到 v1.5.0，v1.4.20 只做前置准备。

---

### P3 - 质量 + 技术债

#### P3-1：大文件性能优化

**目标：** 大设计稿（1000+ 节点）处理速度提升 30%+。

**优化方向：**
1. **节点处理并行化**：同级节点可并行处理
2. **Token 匹配缓存**：相同样式值的匹配结果缓存
3. **大节点懒处理**：metadata 层只处理第一层，深层按需懒加载
4. **层级修复算法优化**：空间索引替代 O(n²) 坐标比较
5. **字符串拼接优化**：使用数组 join 替代模板字符串累加（大组件场景）

**验收标准：**
- 1000 节点设计稿处理时间从基准减少 30%+
- 内存占用不增加

---

#### P3-2：测试覆盖率持续提升

**目标：** 从 493 用例 → 550+ 用例，重点覆盖新增功能和边缘场景。

**新增测试重点：**
1. 小程序生成器单元测试（30+ 用例）
2. Svelte 生成器单元测试（20+ 用例）
3. Watch 模式测试（10+ 用例）
4. 组件库映射集成测试（10+ 用例）
5. 富文本渲染边缘 case（10+ 用例）
6. 异常输入鲁棒性测试（10+ 用例）

**验收标准：**
- 总测试用例数 ≥ 550
- 新增功能测试覆盖率 ≥ 80%
- 全部测试通过

---

#### P3-3：文档与示例全面更新

**内容：**
1. README 更新：小程序 / Svelte / Watch 模式 / 代码对比 等新功能介绍
2. SKILL.md 更新：新增小程序工作流、Svelte 工作流
3. QUICKSTART 更新：新功能快速上手
4. 新增示例：小程序生成示例、Svelte 生成示例、批量生成示例
5. 小程序开发指南文档（独立文档）

---

## 四、版本发布计划

### 4.1 开发阶段划分

```
Phase 1：小程序核心（第 1-2 周）
├── 微信小程序生成器 + MCP 工具
├── uni-app 适配
└── Taro 基础支持

Phase 2：第三框架 + 体验（第 2-3 周）
├── Svelte 生成器 + MCP 工具
├── Watch 模式 MCP 化
└── 代码差异对比工具

Phase 3：功能完善 + 打磨（第 3-4 周）
├── 组件库映射集成深化
├── 富文本增强
├── 响应式推断深化
└── CSS Variables 前置工作

Phase 4：质量 + 发布（第 4-5 周）
├── 性能优化
├── 测试补齐
├── 文档更新
├── 全量回归测试
└── v1.4.20 正式发布 🎉
```

### 4.2 发布检查清单

- [ ] 所有新功能有对应单元测试
- [ ] `npm run build` 0 错误
- [ ] `npm run test` 全部通过（550+ 用例）
- [ ] `tsc --noEmit` 0 错误
- [ ] 手动冒烟测试：
  - [ ] 微信小程序生成 + 运行验证
  - [ ] uni-app 生成 + H5/小程序双端验证
  - [ ] Svelte 生成 + 运行验证
  - [ ] Watch 模式功能验证
  - [ ] 代码差异对比验证
  - [ ] React/Vue 回归测试
- [ ] 文档版本号同步更新
- [ ] README / SKILL / QUICKSTART 全部更新
- [ ] CHANGELOG 编写
- [ ] `npm audit` 0 漏洞
- [ ] `npm version` 版本号更新
- [ ] Git tag `v1.4.20` 创建并推送
- [ ] `npm publish` 发布成功
- [ ] GitHub Release 创建
- [ ] Gitee Release 同步
- [ ] 回滚方案确认（npm unpublish 72h 内可用）

---

## 五、风险与应对

| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|---------|
| 小程序样式限制比预期多，还原度不达预期 | 用户体验下降 | 中 | 先做核心组件（view/text/image/button），复杂样式降级并给出明确提示；提供小程序样式限制检测报告 |
| Svelte 语法细节多，生成质量不稳定 | 开发者信任度下降 | 中 | 初期标记为 beta，收集反馈迭代；优先保证核心语法正确 |
| Watch 模式增量更新容易引入 bug | 代码被错误覆盖 | 中 | 默认关闭增量模式（全量重写更安全），增量更新作为 opt-in 功能；生成前自动备份 |
| 小程序三端（微信/uni-app/Taro）工作量超预期 | 版本延期 | 中 | 优先保证微信小程序一级体验，uni-app 和 Taro 可适度缩减 scope（如只做核心功能） |
| 组件库映射准确率不达预期 | 生成代码质量下降 | 低 | 提供保守模式（只高置信度匹配）+ 激进模式选项；不匹配的安全降级为原生 HTML |
| npm 发布失败（token 过期/权限/包名冲突） | 版本无法交付 | 低 | 提前验证 npm token 有效性；发布前 dry-run 测试；准备 unpublish 应急方案 |

---

## 六、成功指标

### 6.1 功能指标
- 微信小程序：基础组件还原度 ≥ 85%，生成代码可直接运行
- uni-app：H5 + 微信小程序双端正常运行
- Svelte：生成语法正确，样式还原度与 React/Vue 相当
- 组件库映射：shadcn/ui 识别率 ≥ 70%，Props 准确率 ≥ 60%
- Watch 模式：变更检测延迟 ≤ 10s，增量更新正确

### 6.2 质量指标
- 总测试用例：≥ 600
- 新增功能测试覆盖率：≥ 80%
- 回归 bug 率：与 v1.4.19 持平或更低
- `npm audit`：0 漏洞

### 6.3 性能指标
- 大文件（1000+ 节点）处理速度：提升 30%+
- 小程序生成耗时：与 React 生成相当（不超过 1.5x）

### 6.4 差异化指标
- **独家支持微信小程序/uni-app/Taro**：开源 MCP D2C 工具中唯一
- 样式方案数量：**10 套可用（继续领先）+ css-variables 前置架构就绪**
- MCP 工具数量：**30 个**（新增 8 个：weapp / uniapp / taro / svelte / watch_start / watch_stop / watch_status / compare_code）
- 一级支持框架：**5 个**（React / Vue / Svelte / 微信小程序 / uni-app），基础支持：Taro

---

## 七、v1.5.0 展望

v1.4.20 完成后，v1.5.0 可以向以下方向演进：

1. **CSS Variables 完整支持**：纯 CSS 变量方案，零运行时
2. **Figma Dev Mode 深度集成**：使用 Figma Dev Mode API 获取更精确的代码数据
3. **实时预览画布**：浏览器中 side-by-side 对比设计稿与代码渲染
4. **Figma Companion 插件**：Figma 内选择节点一键发送到编辑器
5. **AI 组件智能拆分**：基于视觉特征和语义自动拆分子组件
6. **设计 Token 双向同步**：代码变更同步回 Figma Variables
7. **Angular / SolidJS 一级支持**：继续扩展框架矩阵
8. **CI/CD 集成**：GitHub Action / GitLab CI 自动检查设计稿与代码同步

---

*本计划为 v1.4.20 的迭代蓝图，核心方向是**小程序生态首发**（中国市场差异化护城河），配合 **Svelte 第三框架** 和 **体验打磨**，打造更全面的 Figma → 代码工具链。具体实现时可根据实际情况调整优先级和范围。*
