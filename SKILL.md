---
name: "figma-dev-tools"
description: "Figma 设计到代码增强工具集 v1.1.0 - 14个MCP工具，智能层级解析、多级Token映射、资源自动下载、支持React+Tailwind高保真代码生成及Vue/Svelte/HTML等任意框架（通过框架无关结构化数据）。解决div soup、上下文爆炸、hex写死、资源路径处理等问题。支持Trae/VS Code/Cursor/Windsurf/Claude Desktop/Zed/Cline/Roo Code等10+编辑器。"
---

# Figma Dev Tools v1.1.0 - AI Agent 设计到代码增强管线

## 🎯 何时使用此 Skill（触发条件）

**必须**在以下场景激活：

| 触发场景 | 关键词 |
|---------|-------|
| 用户提供 Figma URL 要求生成/还原代码（React/Vue/Svelte/HTML 等任意框架） | "Figma链接"、"还原设计稿"、"生成组件"、"Vue组件"、"Svelte" |
| 需要高保真还原复杂 Figma 设计 | "1:1还原"、"像素级还原"、"高保真" |
| 需要提取设计 Tokens | "提取tokens"、"设计系统"、"同步颜色" |
| 需要下载 Figma 资源到项目 | "下载图片"、"导出图标"、"资源" |
| 官方 Figma MCP 返回数据过深/解析困难 | "层级太深"、"上下文太长"、"div太多" |
| 使用非 React 框架需要 Figma 转代码 | "Vue"、"Svelte"、"Angular"、"原生HTML"、"Solid" |

**不要**在以下场景使用：
- 纯 CSS/样式问题（不涉及 Figma）
- 纯逻辑代码（无设计稿输入）
- 简单的颜色/间距调整（已有 token 直接用）

---

## 🔴 绝对规则（违反即错误）

> 以下规则每条都对应历史高频 bug，**必须严格遵守**：

| # | 规则 | 正确 ✅ | 错误 ❌ |
|---|------|--------|--------|
| 1 | **禁止 next/image** | `<img src={publicCdnUrl(...)}>` | `<Image src={...} />` (next/image) |
| 2 | **禁止 next/link** | `<a href={...}>` | `<Link href={...}>` (next/link) |
| 3 | **禁止 'use client'** | （Vite SPA 不需要） | `'use client'` 指令 |
| 4 | **禁止写死 hex** | `bg-primary text-neutral-50` | `bg-[#1E40AF] text-[#F8FAFC]` |
| 5 | **className 必须用 cn()** | `className={cn('flex', className)}` | `className={\`flex ${className}\`}` |
| 6 | **图片必须用 publicCdnUrl()** | `src={publicCdnUrl('/portal/xxx.png')}` | `src="/portal/xxx.png"` 或硬编码URL |
| 7 | **禁止 emoji 图标** | SVG 图标通过 publicCdnUrl 引用 | 使用 ❌✅📌 等 emoji 代替图标 |
| 8 | **新色必须 @theme 扩展** | 在 CSS 中 `@theme inline { --color-xxx: ... }` | 直接写 `bg-[#new-color]` |
| 9 | **Token 安全** | .env 中配置，不提交 Git | 将 Token 硬编码在代码或配置里 |
| 10 | **非React框架用structured_data** | Vue/Svelte/HTML：先调用 `figma_get_structured_data` 获取JSON | 非React框架误用 `figma_generate_jsx` |

---

## 🚀 标准工作流（v1.1.0）

> **根据目标框架选择对应工作流，严格按步骤调用工具，不要跳步！**

### 工作流 A：React + Tailwind CSS（推荐，一级支持）

```
Step 1: figma_get_metadata     ← 高层概览（~4KB，了解结构）
   ↓
Step 2: figma_get_design_context ← 目标区块精简上下文
   ↓
Step 3: figma_get_screenshot   ← 视觉基准截图（2x）
   ↓
Step 4: figma_generate_jsx     ← 一键生成 TSX（整合全管线）
   ↓
Step 5: figma_download_assets  ← 下载图片/SVG资源
   ↓
Step 6: 人工微调               ← 处理TODO、复用组件、加交互
   ↓
Step 7: 高保真检查             ← 对照下方检查清单逐项验证
```

### 工作流 B：Vue/Svelte/HTML/Angular/Solid 等任意框架（v1.1.0 新）

```
Step 1: figma_get_metadata        ← 高层概览（~4KB，了解结构）
   ↓
Step 2: figma_get_structured_data ← ⭐ 获取框架无关JSON结构
   ↓
Step 3: figma_get_screenshot      ← 视觉基准截图（2x）
   ↓
Step 4: figma_extract_tokens      ← 提取设计Tokens（可选）
   ↓
Step 5: 基于structuredContent生成对应框架代码
   ↓
Step 6: figma_download_assets     ← 下载图片/SVG资源（如需要）
   ↓
Step 7: 人工微调 + 还原度检查
```

---

## 工作流 A 详细步骤（React + Tailwind）

### Step 1: 获取高层结构概览

**工具**: `figma_get_metadata`

```typescript
// 调用参数
{
  figmaUrl: "https://www.figma.com/design/xxxxx/...?node-id=23-11032",
  depth: 1  // 默认1，仅看一层子区块，输出~4KB
}
```

**目的**：快速了解页面分区（header/hero/content/footer等），决定哪些子区块需要分别获取详情。**禁止**跳过此步直接拉取全量节点树（会导致上下文爆炸）。

**输出解读**：
- 查看 `children` 数组，了解有几个主要区块
- 超过 ~100 节点的区块需要拆分处理
- 记录每个子区块的 nodeId 用于 Step 2

### Step 2: 获取目标区块精简上下文

**工具**: `figma_get_design_context`

```typescript
{
  fileKey: "xxxxx",           // 从 Step 1 获取
  nodeId: "23-11050",         // 从 metadata.children 中选择目标子区块
  maxDepth: 6                 // 默认6，复杂区块可用8，简单区块用4
}
```

**服务端已自动完成的优化**：
- ✅ 单孩子无样式 GROUP 自动提升（消除冗余 div）
- ✅ wrapper/container 无视觉属性 FRAME 标记为 layout-only（不渲染）
- ✅ 不可见/零尺寸节点自动跳过
- ✅ 语义角色自动标注（button/card/image/text/icon/section）
- ✅ 颜色/间距/圆角/阴影 token 候选已列出
- ✅ 资源列表（图片/SVG）已收集

### Step 3: 获取视觉基准截图

**工具**: `figma_get_screenshot`

```typescript
{
  fileKey: "xxxxx",
  nodeId: "23-11050",
  scale: 2  // 2x高清，用于还原后比对
}
```

**关键**：此截图是还原度验证的唯一基准，必须获取。

### Step 4: 一键生成 React TSX

**工具**: `figma_generate_jsx`（v2.0 核心工具）

```typescript
{
  figmaUrl: "https://www.figma.com/design/xxxxx/...?node-id=23-11032",
  componentName: "HeroSection",  // PascalCase 组件名
  sceneName: "landing-page",     // kebab-case 场景名，用于资源路径
  maxDepth: 8
}
```

**生成代码已自动完成**：
- ✅ 语义标签选择（h1-h6/p/button/img/section，非全div）
- ✅ Tailwind 类名完整映射（flex/justify/padding/gap/rounded/shadow/text等）
- ✅ Token 命中：颜色用 `text-primary` 而非 `text-[#hex]`
- ✅ 图片占位：`publicCdnUrl('/<场景>/xxx.png')`
- ✅ layout-only 节点不渲染（消除div soup）
- ✅ className 使用 `cn()` 合并
- ✅ TODO 注释标记人工优化点
- ✅ TypeScript 类型完整

**输出的4类关键信息**：
1. `code` - 完整 TSX 代码
2. `extensionsNeeded` - 需要 `@theme` 扩展的 token 列表
3. `pendingAssets` - 需要下载的资源（nodeId、名称、类型）
4. `reusableComponents` - 可能可复用的 Figma Components 提示

### Step 5: 下载设计资源

**工具**: `figma_download_assets`

```typescript
{
  fileKey: "xxxxx",
  sceneName: "landing-page",                    // 与 Step4 一致
  assetNodeIds: ["23-11050", "23-11080"],      // 从 pendingAssets 提取
  scale: 2,
  svgFormat: "svg"  // 矢量优先，复杂位图可用 png
}
```

**资源规则**：
- 下载到 `public/<场景名>/` 目录
- 引用必须使用 `publicCdnUrl('/<场景名>/xxx.png')`
- 文件名自动清洗（小写、连字符、去特殊字符）
- 临时文件（node-*.png/json）不提交 Git

### Step 6: 人工微调（必须执行）

自动生成代码**不是终点**，必须人工处理以下事项：

1. **复用现有组件**：检查项目组件库，将生成代码中的基础元素替换为项目已有组件（Button、Card、Input 等）
2. **处理 TODO 注释**：代码中 `// TODO:` 标记了需要人工决策的点
3. **添加 @theme 扩展**：将 `extensionsNeeded` 中的 token 添加到样式文件：
   ```css
   @theme inline {
     --color-new-brand: oklch(72.32% 0.176 154.2);
     --spacing-custom: 18px;
   }
   ```
4. **添加交互逻辑**：状态管理、事件处理、数据绑定（AI不自动生成业务逻辑）
5. **修正 Flex 对齐**：圆形/固定尺寸元素确保父容器 `align-items: center`
6. **添加响应式**：生成代码基于 Figma 固定尺寸，响应式需手动添加

### Step 7: 高保真验证（每屏必须过）

对照下方「高保真还原检查清单」逐项检查。

---

## 工作流 B 详细步骤（Vue/Svelte/HTML 等任意框架）

### Step 1: 获取高层结构概览

同工作流 A Step 1，使用 `figma_get_metadata`。

### Step 2: 获取框架无关结构化数据（⭐ v1.1.0 核心）

**工具**: `figma_get_structured_data`

```typescript
{
  figmaUrl: "https://www.figma.com/design/xxxxx/...?node-id=23-11032",
  maxDepth: 8  // 默认8，最大10
}
```

**输出结构**（structuredContent 字段）：

每个节点包含以下字段，可直接遍历生成任意框架代码：

```typescript
interface StructuredNode {
  id: string;                    // 节点ID
  name: string;                  // 节点名称
  role: 'button' | 'card' | 'image' | 'text' | 'icon' | 'section' | 'container' | 'unknown';
  type: 'FRAME' | 'TEXT' | 'RECTANGLE' | 'GROUP' | 'INSTANCE' | 'VECTOR' | 'ELLIPSE' | 'LINE' | 'POLYGON' | 'STAR' | 'COMPONENT' | 'COMPONENT_SET';
  size?: { width: number; height: number };
  layout?: {
    display?: 'flex' | 'grid' | 'block' | 'none';
    flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
    justifyContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly';
    alignItems?: 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline';
    flexWrap?: 'nowrap' | 'wrap' | 'wrap-reverse';
    gap?: number | { row: number; column: number };
    padding?: { top: number; right: number; bottom: number; left: number };
    position?: 'relative' | 'absolute' | 'fixed' | 'sticky';
    overflow?: 'visible' | 'hidden' | 'scroll' | 'auto';
    alignSelf?: 'auto' | 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline';
  };
  styles?: {
    color?: string;                      // 文本颜色
    backgroundColor?: string;            // 背景色
    backgroundImage?: string;            // 背景图
    borderRadius?: number | { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number };
    border?: { width: number; color: string; style: string };
    boxShadow?: string;
    opacity?: number;
    fontSize?: number;
    fontWeight?: number;
    fontFamily?: string;
    lineHeight?: number | string;
    letterSpacing?: number;
    textAlign?: 'left' | 'center' | 'right' | 'justify';
    textDecoration?: 'none' | 'underline' | 'line-through';
  };
  text?: string;                          // 文本内容（仅TEXT节点）
  asset?: {                               // 资源信息（图片/矢量节点）
    type: 'image' | 'svg' | 'icon';
    format?: 'png' | 'jpg' | 'svg' | 'webp';
    url?: string;                         // 可直接下载的URL
  };
  children?: StructuredNode[];            // 子节点
}
```

**预览摘要包含**：语义角色、节点类型、尺寸、总节点数、颜色数、资源数、文本节点数。

### Step 3: 获取视觉基准截图

同工作流 A Step 3，使用 `figma_get_screenshot` 获取2x高清截图作为还原基准。

### Step 4: 提取设计 Tokens（可选）

**工具**: `figma_extract_tokens`

```typescript
{
  figmaUrl: "https://www.figma.com/design/xxxxx/...",
  colorFormat: "hex"  // Vue/Svelte 场景建议用 hex，或根据框架特性选择
}
```

提取的 tokens 可用于生成对应框架的主题文件（如 Vue 的 CSS Variables、Svelte 的 CSS custom properties 等）。

### Step 5: 生成对应框架代码

基于 `structuredContent` 的 JSON 数据，遍历节点树生成对应框架的组件代码：

**Vue 3 SFC 示例**：
```vue
<template>
  <section class="hero-section" :style="containerStyle">
    <h1 class="hero-title">{{ node.text }}</h1>
    <img :src="heroImageUrl" class="hero-image" />
    <button class="cta-button">{{ ctaText }}</button>
  </section>
</template>
```

**Svelte 示例**：
```svelte
<section class="hero-section" style={containerStyle}>
  <h1 class="hero-title">{node.text}</h1>
  <img src={heroImageUrl} class="hero-image" />
  <button class="cta-button">{ctaText}</button>
</section>
```

**原生 HTML/CSS 示例**：
```html
<section class="hero-section" style="...">
  <h1 class="hero-title">标题文本</h1>
  <img src="/images/hero.png" class="hero-image" />
  <button class="cta-button">CTA按钮</button>
</section>
```

**代码生成原则**：
- 根据 `role` 字段选择语义标签：
  - `button` → `<button>`
  - `text` → 根据 fontSize 选择 h1-h6/p/span
  - `image` → `<img>`
  - `card` → `<article>` 或 `<div>`
  - `section` → `<section>`
  - `icon` → SVG 或 `<img>`
- 根据 `layout` 字段映射对应样式（Flex 布局属性）
- 根据 `styles` 字段映射颜色、字体、圆角、阴影等
- 图片资源使用对应框架的资源引用方式
- 颜色优先使用提取的 tokens，新色通过对应框架的样式扩展方案处理

### Step 6: 下载设计资源（如需要）

同工作流 A Step 5，使用 `figma_download_assets` 下载图片/SVG资源。注意：非 React 项目的资源路径引用请使用对应框架的标准方式（如 Vue 的 `@/assets/`、Svelte 的静态资源路径等）。

### Step 7: 人工微调 + 还原度检查

参考工作流 A 的 Step 6 和下方检查清单，注意适配对应框架的最佳实践。

---

## ✅ 高保真还原检查清单

> 每个组件/页面实现后**必须逐项打勾**，未通过项必须修复。

### 工具调用正确性
- [ ] **调用顺序正确**：React: metadata → design_context → screenshot → generate_jsx → download_assets；其他框架: metadata → structured_data → screenshot → (tokens) → 生成代码
- [ ] **非React框架未误用generate_jsx**：Vue/Svelte/HTML 使用 `figma_get_structured_data`
- [ ] **未使用旧版工具**：React 用 `figma_generate_jsx` 而非 `figma_generate_component`
- [ ] **maxDepth 合理**：大区块拆分处理，单次 maxDepth 不超过 8（structured_data 不超过10）

### 框架规范
- [ ] **无 Next.js 特性**（React项目）：无 `next/image`、`next/link`、`'use client'`
- [ ] **className 使用 cn()**（React项目）：没有字符串拼接 className
- [ ] **import 排序正确**：builtin → external → internal → parent → sibling，组间空行
- [ ] **TypeScript 完整**：无 `any`，类型定义完整
- [ ] **对应框架语法正确**：Vue 用 SFC 语法、Svelte 用正确的响应式声明等

### 样式还原
- [ ] **Token 命中**：无写死 `bg-[#hex]`/`text-[#hex]`，新色通过对应框架的主题扩展
- [ ] **Flex 布局正确**：父容器 `align-items` 正确，圆形/固定尺寸子元素设 `flex-shrink: 0`
- [ ] **容器裁剪**：SVG/图片/流线容器有 `overflow: hidden`
- [ ] **无冗余 div**：layout-only 节点未生成多余包裹层
- [ ] **语义标签**：标题 h1-h6、段落 p、按钮 button、图片 img，非全 div
- [ ] **文字颜色精确**：从 Figma fills 提取（如半透明文字 `rgba(0,0,0,0.65)`），非默认纯黑
- [ ] **圆角/阴影精确**：使用 Figma 中的精确值或对应 token
- [ ] **间距精确**：padding/gap 与 Figma 一致，不凭感觉写

### 资源处理
- [ ] **图片已下载**：所有图片/SVG 已通过 `figma_download_assets` 下载
- [ ] **图片引用正确**：React 用 `publicCdnUrl()`，其他框架用对应标准路径
- [ ] **图标为 SVG**：全部使用 SVG，无 emoji 替代
- [ ] **图标尺寸精确**：严格匹配 Figma 尺寸（如步骤图标 26×26px、子卡片图标 28×28px）
- [ ] **Mac 交通灯样式**（如适用）：内联样式固定 10×10px、色值 #ff5f57/#ffbd2e/#28c840、间距 6px、`align-items: center`

### 组件复用
- [ ] **检查公共组件**：已检查项目公共组件库，可复用的已替换
- [ ] **无重复造轮子**：Button、Card、Nav 等基础组件复用已有实现

### 质量检查
- [ ] **样式优先级**：关键样式冲突处用内联 style 或 `!important` 保证还原度
- [ ] **无控制台报错**：浏览器控制台无 error/warning
- [ ] **类型检查通过**：TypeScript 0 error
- [ ] **Lint 通过**：ESLint 0 error
- [ ] **视觉比对一致**：实现截图与 Figma `get_screenshot` 基准对比无明显差异
- [ ] **Git 整洁**：临时文件（node-*.png/json、scripts/figma/node-*/）未提交

---

## ⚠️ 常见陷阱速查表

| 问题现象 | 根因 | 解决方案 |
|---------|------|---------|
| 圆形/交通灯/图标变成椭圆 | Flex 容器默认 `align-items: stretch` 拉伸子元素 | 父容器加 `align-items: center`；子元素加 `flex-shrink: 0` + 固定宽高 |
| SVG/流线/波浪线超出容器 | 容器未设 `overflow: hidden` | 外层容器添加 `overflow: hidden` |
| 出现多余滚动条/偏移 | 代码生成器自动添加的中间包裹层 | 手动删除不必要的包裹 div（检查 layout-only 节点） |
| 样式被全局样式覆盖 | 通用类名冲突（如 `.light`、`.icon`、`.card`） | 关键组件用内联样式隔离或 BEM 命名，必要时 `!important` |
| 图标显示为 emoji ❌✅ | 内容配置使用了 emoji 或设计稿中图标是文本 | 全部改用 SVG 图标文件，通过对应框架资源方式引用 |
| 导出图片缺少上层叠加效果 | 单独导出底层节点，未选包含覆盖层的父容器 | 在 Figma 中选择包含所有叠加层的**父 Frame/Group**，不要单独选底层 |
| 桑基图/流线/复杂图形还原差 | 这类图形无法用 div+CSS 还原 | 用内联 SVG 手写 path；容器 `overflow: hidden`；文字颜色 `rgba(0,0,0,0.65)` |
| 生成代码有多余 wrapper div | layout-only 节点被错误保留，或 GROUP 未扁平化 | 检查并手动删除冗余层；确保使用正确工具 |
| 颜色看起来偏色/不对 | oklch 色彩空间在某些浏览器渲染差异，或透明度丢失 | 尝试切换 `colorFormat: "hex"`；检查 fills 中的 opacity 属性 |
| 图片加载 404 | 路径错误或未用正确引用方式 | 确认资源已下载；React 用 `publicCdnUrl()`，其他框架用对应路径方式 |
| 大区块生成时间超长/截断 | 节点数过多（>100），单次深度太大 | 拆分为多个子区块分别处理 |
| Vue/Svelte 项目误用 generate_jsx | 工具选择错误 | 使用 `figma_get_structured_data` 获取框架无关JSON，再生成对应框架代码 |

### Mac 窗口交通灯标准组件（React，可直接复用）

```tsx
function TrafficLights() {
  const dotStyle: React.CSSProperties = {
    width: 10,
    height: 10,
    borderRadius: '50%',
    display: 'block',
    flexShrink: 0,
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      <span style={{ ...dotStyle, background: '#ff5f57' }} />
      <span style={{ ...dotStyle, background: '#ffbd2e' }} />
      <span style={{ ...dotStyle, background: '#28c840' }} />
    </div>
  );
}
```

---

## 🔧 MCP 工具快速参考（14个）

> 调用参数格式：直接以 JSON 对象传入，无需额外包装。

### 核心工作流工具

**React 专用（v1.0+）：**

| 工具 | 一句话用途 | 最小调用示例 |
|------|----------|-------------|
| `figma_get_metadata` | 高层概览，了解页面分区 | `{ figmaUrl: "..." }` |
| `figma_get_design_context` | 精简节点树+token+资源 | `{ figmaUrl: "...", maxDepth: 6 }` |
| `figma_get_screenshot` | 获取视觉基准图 | `{ figmaUrl: "...", scale: 2 }` |
| `figma_generate_jsx` | ⭐ 一键生成React TSX | `{ figmaUrl: "...", componentName: "Xxx", sceneName: "xxx" }` |
| `figma_download_assets` | 下载图片/SVG到public | `{ fileKey: "...", sceneName: "xxx", assetNodeIds: ["..."] }` |

**多框架支持（v1.1.0 新）：**

| 工具 | 一句话用途 | 最小调用示例 |
|------|----------|-------------|
| `figma_get_structured_data` | ⭐ 框架无关JSON结构（Vue/Svelte/HTML等） | `{ figmaUrl: "...", maxDepth: 8 }` |

### 辅助工具

| 工具 | 用途 | 调用示例 |
|------|------|---------|
| `figma_parse_url` | 解析URL得fileKey/nodeId | `{ url: "https://www.figma.com/design/xxx/...?node-id=1-2" }` |
| `figma_validate_token` | 验证Token有效性 | `{ accessToken: "figd_xxx" }` |
| `figma_get_file` | 获取文件页面列表 | `{ figmaUrl: "..." }` |
| `figma_list_components` | 列出文件中可复用组件 | `{ fileKey: "xxx" }` |
| `figma_extract_tokens` | 提取全量设计Tokens | `{ figmaUrl: "...", colorFormat: "oklch" }` |
| `figma_generate_styles` | 生成CSS/Tailwind主题 | `{ tokens: {...}, outputFormat: "tailwind-v4" }` |
| `figma_sync_to_project` | 写入tokens到项目文件 | `{ tokens: {...}, outputDir: "/abs/path/to/styles" }` |
| `figma_generate_component` | ⚠️ 旧版组件生成（不推荐，React用generate_jsx） | `{ figmaUrl: "...", styleFormat: "tailwind" }` |

---

## 📐 节点精简规则（内部逻辑，供调试参考）

如果生成的代码仍有冗余div，对照以下规则检查Figma源文件：

| 规则 | 处理方式 |
|------|---------|
| 单孩子 GROUP 且无 fills/strokes/effects/cornerRadius | 提升孩子节点，GROUP 不输出 |
| 单孩子 FRAME 命名为 wrapper/container/inner 且无视觉属性 | 标记为 layout-only，不渲染为 div |
| 不可见节点（visible: false）或 opacity: 0 | 跳过 |
| 零尺寸节点（width=0 或 height=0）且无绝对定位子元素 | 跳过 |
| COMPONENT/INSTANCE 节点 | 标记为 reusable-component，提示复用现有组件 |
| 名称含 button/btn/按钮 | 标记 role=button → 渲染为 `<button>` |
| 名称含 card/卡片 | 标记 role=card → `<article>` 或 `<div role="card">` |
| 含 IMAGE fill 或名称含 image/img | 标记 role=image → `<img>` |
| TEXT 节点 | 根据字号自动选 h1-h6/p/span |

---

## 🎨 Token 匹配优先级

颜色/间距/圆角匹配按以下顺序查找，越靠前置信度越高：

1. **codeSyntax.WEB**（100%）：Figma Variables 中显式定义的 web 代码名，UI 需配合设置
2. **精确值匹配**：与项目现有 token 的 hex/px 值完全一致
3. **CIE76 色差模糊匹配**：颜色空间距离计算，找最接近的现有 token（阈值内）
4. **@theme 扩展建议**：未命中时输出建议 token 名和原始值，需人工添加到对应框架的主题系统

---

## 📁 资源落位规范（通用）

```
your-project/
├── public/                     # React/Next.js 项目
│   └── <场景名>/               # 如 landing-page、dashboard、about
│       ├── hero.png
│       └── icon-arrow.svg
├── src/
│   ├── assets/                 # Vue/Svelte 项目常用
│   │   └── <场景名>/
│   ├── components/
│   │   └── <场景名>/           # 场景私有组件
│   │       └── HeroSection.tsx / HeroSection.vue / HeroSection.svelte
│   └── styles/
│       └── figma-theme.css     # @theme 扩展 / CSS Variables
```

**React 引用方式**：
```tsx
import { publicCdnUrl } from '@/lib/utils';

<img src={publicCdnUrl('/landing-page/hero.png')} alt="Hero" />
```

**Vue 引用方式**：
```vue
<template>
  <img src="@/assets/landing-page/hero.png" alt="Hero" />
</template>
```

**Svelte 引用方式**：
```svelte
<img src="/assets/landing-page/hero.png" alt="Hero" />
```

---

## 🖥️ 支持的编辑器（10+）

| 编辑器 | 配置格式 | 说明 |
|--------|---------|------|
| **Trae** | mcpServers | 自动检测安装 |
| **VS Code** | mcpServers | 自动检测安装 |
| **Cursor** | mcpServers | 自动检测安装 |
| **Windsurf** | mcpServers | 自动检测安装 |
| **Claude Desktop** | mcpServers | 自动检测安装 |
| **Zed** | **mcp_servers** | 注意字段名是下划线，自动处理 |
| **Cline** (VS Code/Cursor 插件) | mcpServers | 自动检测安装 |
| **Roo Code** (VS Code/Cursor 插件) | mcpServers | 自动检测安装 |

零配置方式：在任意编辑器 MCP 配置中添加：
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

---

## 📝 注意事项

1. **Token 安全**：Figma Access Token 不要提交到 Git，.env 和 .mcp.json 中的 token 确保在 .gitignore 中
2. **API 限流**：Figma API 有频率限制，工具内部已自动节流，但仍建议拆分大区块避免瞬时大量请求
3. **人工审查必需**：自动生成代码是起点不是终点，必须经过人工审查和微调
4. **响应式缺失**：生成代码基于 Figma 固定尺寸，响应式样式必须手动添加
5. **临时文件清理**：node-*.png/json、scripts/figma/node-*/ 等临时导出文件不提交 Git
6. **网络要求**：Figma API 和图片 CDN 需要能访问 figma.com（国内可能需要代理）
7. **框架选择正确**：React 项目用 generate_jsx，其他框架务必用 get_structured_data
