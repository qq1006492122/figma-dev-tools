# Figma 设计规范 - figma-dev-tools 最佳还原指南

## 与其他工具的关系

### 本规范的目的

本文档旨在帮助设计师和 AI 设计工具按照统一规范创建 Figma 设计稿，确保 **figma-dev-tools** 能够完美地将设计还原为高质量的 React + Tailwind CSS 代码。遵循此规范可以：

- 大幅提升设计稿到代码的还原度
- 自动识别设计 Token（颜色、字号、间距等）
- 生成语义化、可维护的组件代码
- 支持响应式布局自动推断
- 自动添加无障碍（a11y）属性
- 避免常见的还原偏差问题

### 与 @figma/code-connect 的关系

**本工具与官方 @figma/code-connect 是互补关系，而非竞争关系：**

| 维度 | @figma/code-connect | figma-dev-tools 代码还原质量预检 |
|------|---------------------|----------------------------------|
| **适用场景** | 已有成熟设计系统的团队 | 新项目、从零生成代码 |
| **主要功能** | 已有组件 ↔ Figma 组件映射 | 代码生成前的质量检查 |
| **付费要求** | 需要 Organization/Enterprise 计划 | 完全免费 |
| **使用方式** | Figma Dev Mode 插件 | CLI / MCP 工具，无需插件 |
| **代码生成** | 显示现有生产代码 | 从零生成 React+Tailwind 代码 |

**可以同时使用：**
- 如果您的团队有成熟设计系统 + Figma 付费计划 → 使用 code-connect 映射组件，**同时**使用我们的工具做还原预检
- 如果是新项目/小团队/没有设计系统 → 我们的工具是唯一免费开箱即用的方案

---

## 简介

本文档旨在帮助设计师和 AI 设计工具按照统一规范创建 Figma 设计稿，确保 **figma-dev-tools** 能够完美地将设计还原为高质量的 React + Tailwind CSS 代码。遵循此规范可以：

- 大幅提升设计稿到代码的还原度
- 自动识别设计 Token（颜色、字号、间距等）
- 生成语义化、可维护的组件代码
- 支持响应式布局自动推断
- 自动添加无障碍（a11y）属性
- 避免常见的还原偏差问题

---

## 1. 基础规范

### 1.1 必须使用 Auto Layout（Flex 布局）

**核心原则**：优先使用 Auto Layout，仅在必要时使用绝对定位。

✅ **必须使用 Auto Layout 的场景**：
- 页面整体布局（Header、Main、Footer 排列）
- 卡片内元素排列（图片、标题、描述、按钮）
- 导航栏、列表、表单
- 按钮内部（图标 + 文字）
- 标签组、面包屑导航

❌ **仅允许绝对定位的场景**：
- 弹窗（Modal/Dialog）遮罩和容器
- 下拉菜单（Dropdown）
- 工具提示（Tooltip/Popover）
- 通知徽章（Badge 角标）
- 悬浮操作按钮（FAB）
- 轮播图指示器
- 复杂装饰元素（背景图形、粒子效果）

### 1.2 Frame 命名规范

使用有意义的名称，避免 Figma 默认命名：

✅ **推荐命名方式**：
- PascalCase：`Header`、`HeroSection`、`UserCard`、`PrimaryButton`
- kebab-case：`header-nav`、`card-list`、`search-input`
- 语义化命名：`Avatar`、`Breadcrumb`、`Pagination`、`Sidebar`

❌ **避免的命名**：
- `Frame 1`、`Frame 234`、`Group 56`
- `矩形`、`椭圆`、`文本 123`
- 无意义的缩写：`Cnt`、`Wrapper2`、`Tmp`

### 1.3 图层分组原则（v1.4.0 增强）

- **按功能区域分组**：将相关元素放在同一个 Frame 中
- **层级扁平化**：避免过深嵌套（建议不超过 10 层，v1.4.0 支持到 50 层硬限制）
- **删除空 Frame**：不要保留无内容的占位 Frame（v1.4.0 自动检测并跳过空容器）
- **合并相关图层**：同一组件的元素放在同一个 Frame 内
- **父子层级正确**：图标、文字、标签等子元素必须放入对应容器内部，不要平级放置
  - v1.4.0 新增智能层级修复：会基于坐标包含关系+命名语义自动检测错位子节点并修复
  - 高置信度（>90%面积包含+子元素关键词）自动移入，低置信度给出警告
- **避免循环引用**：组件实例不要形成循环嵌套（v1.4.0 自动检测并打破循环引用）
- **避免冗余包裹**：不要连续创建多层只有一个子节点且无视觉属性的 Frame/GROUP（v1.4.0 lint 检测）

### 1.4 避免隐藏图层

- 不需要的元素**直接删除**，不要只是设置为隐藏（visibility: hidden）
- 不同状态使用 **Variant** 管理，而不是复制后隐藏
- 备选方案放在单独的页面或 Frame 中，并明确标注

### 1.5 使用 Components 组件

**重复使用的元素必须创建为 Component**：

| 组件类型 | 示例 |
|---------|------|
| 基础控件 | Button、Input、Checkbox、Radio、Switch |
| 数据展示 | Card、ListItem、Table、Avatar、Badge |
| 导航元素 | NavItem、Breadcrumb、Pagination、Tab |
| 反馈组件 | Alert、Toast、Modal、Spinner |
| 布局组件 | Container、Row、Col、Divider |

---

## 2. 布局规范

### 2.1 方向设置

明确设置 Auto Layout 的方向：
- **Horizontal（水平）**：导航栏、按钮组、卡片横排、图标+文字
- **Vertical（垂直）**：表单、列表、文章内容、卡片堆叠

### 2.2 间距规范

使用统一的间距尺度（**4px 基准网格**）：

| 像素值 | Tailwind 类名 | 用途示例 |
|-------|--------------|---------|
| 4px | `p-1`, `m-1`, `gap-1` | 图标与文字紧凑间距、细微调整 |
| 8px | `p-2`, `m-2`, `gap-2` | 表单元素间距、标签内边距 |
| 12px | `p-3`, `m-3`, `gap-3` | 卡片内小间距 |
| 16px | `p-4`, `m-4`, `gap-4` | 卡片内边距、段落间距 |
| 20px | `p-5`, `m-5`, `gap-5` | 区块间距 |
| 24px | `p-6`, `m-6`, `gap-6` | 区块大间距、卡片间距 |
| 32px | `p-8`, `m-8`, `gap-8` | 章节间距 |
| 40px | `p-10`, `m-10`, `gap-10` | 大区块间距 |
| 48px | `p-12`, `m-12`, `gap-12` | 页面大区块间距 |
| 64px | `p-16`, `m-16`, `gap-16` | Hero 区域间距 |

⚠️ **避免使用非规范间距**：不要随意设置 13px、17px、23px 等非 4px 倍数的值。

### 2.3 对齐设置

合理使用 alignment 属性：

- **左对齐（Left）**：大多数文本、列表项、表单标签
- **居中对齐（Center）**：标题、按钮文字、卡片标题
- **右对齐（Right）**：价格、数字、操作按钮
- **两端对齐**：导航栏两端（Logo 左，菜单右）
- **顶部对齐（Top）**：卡片内容顶部对齐
- **垂直居中（Center）**：按钮内部图标和文字、单行表单

### 2.4 Padding 设置

容器内边距必须**明确设置**，不要靠元素自然撑开：

```
按钮：padding: 12px 24px (py-3 px-6)
输入框：padding: 12px 16px (py-3 px-4)
卡片：padding: 20px 24px (p-5 p-6)
弹窗：padding: 24px (p-6)
```

### 2.5 Resizing 设置

正确设置 Hug / Fixed / Fill：

| 元素类型 | 宽度设置 | 高度设置 | 说明 |
|---------|---------|---------|------|
| 文本内容 | Hug contents | Hug contents | 文本根据内容自适应 |
| 按钮 | Hug contents | Fixed / Hug | 按钮宽度随文字变化 |
| 输入框 | Fill container | Fixed | 输入框宽度撑满容器 |
| 卡片容器 | Fill container / Fixed | Hug contents | 卡片宽度自适应或固定 |
| 图标 | Fixed | Fixed | 图标固定尺寸 |
| 图片 | Fixed / Fill | Fixed | 图片按需设置 |

### 2.6 Constraints 约束

响应式设计时正确设置 Constraints：

- 固定在左侧：`Left + Fix width`
- 固定在右侧：`Right + Fix width`
- 左右拉伸：`Left + Right + Scale`
- 居中显示：`Center`
- 底部固定：`Bottom + Fix height`

---

## 3. 颜色规范

### 3.1 使用 Variables / Styles

**禁止直接从色板选色**，必须使用 Figma Variables（颜色变量）或 Color Styles。

创建颜色变量的步骤：
1. 打开右侧面板 → Local variables
2. 创建 Color 类型变量
3. 按语义命名（不是按色值命名）

✅ **正确的颜色命名**：
```
primary
primary-hover
primary-active
secondary
success
warning
error
info
bg-primary
bg-secondary
bg-tertiary
text-primary
text-secondary
text-tertiary
text-inverse
border-default
border-light
border-dark
```

❌ **错误的颜色命名**：
```
red-500
#FF5733
蓝色
浅色
深一点的颜色
```

### 3.2 颜色语义化

| 语义 | 用途示例 |
|-----|---------|
| primary | 主按钮、主要操作、链接、品牌色 |
| secondary | 次要按钮、次要操作 |
| success | 成功状态、通过提示、正确反馈 |
| warning | 警告提示、需注意的操作 |
| error | 错误状态、危险操作、失败反馈 |
| bg-primary | 页面默认背景 |
| bg-secondary | 卡片、弹窗背景 |
| text-primary | 正文、标题文字 |
| text-secondary | 次要文字、描述信息 |
| border-default | 默认边框色 |

### 3.3 透明度使用规范

- 避免通过多层透明度叠加产生新颜色
- 如果需要浅色/深色变体，直接定义最终颜色值
- 透明度仅用于：
  - 遮罩层（modal overlay：0.5-0.7）
  - disabled 状态（0.4-0.6）
  - hover 效果轻微叠加（0.05-0.1）

### 3.4 对比度要求

严格遵循 WCAG AA 标准：

- **普通文本**：对比度 ≥ 4.5:1
- **大文本（18px+ 或 14px+ Bold）**：对比度 ≥ 3:1
- **可交互元素**：对比度 ≥ 3:1（非文本）

---

## 4. 文字规范

### 4.1 使用 Text Styles

定义统一的字号层级，使用 Text Styles 管理：

| 字号 | 字重 | 行高 | Tailwind 类名 | 用途 |
|-----|-----|------|--------------|------|
| 12px | 400/500 | 1.5 | `text-xs` | 辅助文字、标签、时间戳 |
| 14px | 400/500 | 1.5 | `text-sm` | 次要正文、表单文字 |
| 16px | 400 | 1.6 | `text-base` | 正文内容 |
| 18px | 500/600 | 1.5 | `text-lg` | 小标题、强调文字 |
| 20px | 600 | 1.4 | `text-xl` | 卡片标题 |
| 24px | 600/700 | 1.3 | `text-2xl` | 区块标题 |
| 30px | 700 | 1.2 | `text-3xl` | 页面标题 |
| 36px | 700 | 1.2 | `text-4xl` | Hero 大标题 |
| 48px | 700/800 | 1.1 | `text-5xl` | 展示类大标题 |

### 4.2 字重规范

只使用标准字重值：

| 字重名称 | 数值 | Tailwind 类名 | 用途 |
|---------|-----|--------------|------|
| Regular | 400 | `font-normal` | 正文、普通文本 |
| Medium | 500 | `font-medium` | 小标题、按钮文字、强调 |
| Semibold | 600 | `font-semibold` | 标题、重要文字 |
| Bold | 700 | `font-bold` | 大标题、强强调 |

### 4.3 行高设置

- **标题**：1.1 - 1.3（紧凑）
- **正文**：1.5 - 1.6（舒适阅读）
- **单行文本**：可使用固定像素行高（如按钮文字）
- **多行段落**：必须使用倍数行高，不要固定像素

### 4.4 文本截断处理

需要截断的文本必须明确设置：

1. 给文本容器设置 **Fixed width**
2. 在 Figma 中设置 **Max lines**（如 1 行、2 行、3 行）
3. 或勾选 **Truncate text** 选项

---

## 5. 图标和图片规范

### 5.1 图标规范

- 使用 **SVG 矢量图形**，不要使用位图图标
- 图标尺寸统一为 **正方形**（width = height）
- 推荐尺寸：16px / 20px / 24px / 32px / 48px
- **v1.4.0 支持 SVG 内联渲染**：VECTOR/BOOLEAN_OPERATION/STAR/LINE 等矢量节点会被直接导出为优化后的内联 SVG，支持 currentColor 通过 CSS color 控制颜色，无需下载为位图
- 图标命名建议包含 `icon`/`ic-` 关键词，便于工具识别（v1.4.0 层级修复利用命名语义）

| 尺寸 | 用途 | Tailwind 类名 |
|-----|------|--------------|
| 16px | 小图标、内联图标、标签图标 | `w-4 h-4` |
| 20px | 表单图标、导航小图标 | `w-5 h-5` |
| 24px | 默认图标尺寸、按钮图标 | `w-6 h-6` |
| 32px | 大图标、功能入口图标 | `w-8 h-8` |
| 48px | 空状态图标、结果页图标 | `w-12 h-12` |

### 5.2 图标与文字对齐

- 图标和文字并列时，图标设置为 Fixed 尺寸（对应 flex-shrink: 0）
- 图标和文字的对齐方式为 **Center（垂直居中）**
- 图标和文字的间距统一为：4px（紧凑）或 8px（常规）

### 5.3 图片规范

**图片尺寸设置**：
- 明确设置图片的 width 和 height
- 头像类图片：使用圆形（corner-radius = 50%）+ Aspect Ratio 1:1
- 缩略图：统一比例（1:1、4:3、16:9）
- 横幅图：16:9 或 21:9 比例

**填充方式（Fill）**：
- **Cover**：覆盖填充（推荐，用于头像、缩略图）
- **Contain**：包含填充（用于 Logo、产品图）
- **Stretch**：拉伸填充（避免使用，会导致图片变形）

---

## 6. 组件规范

### 6.1 按钮（Button）

**必须是 Auto Layout Frame**，结构示例：
```
Button [Horizontal, gap=8px, padding=12px 24px, radius=8px]
├── Icon [20x20px] （可选）
└── Label [Text]
```

**Variant 状态设置**：
- Default：默认状态
- Hover：悬停状态
- Active / Pressed：按下状态
- Disabled：禁用状态
- Loading：加载中状态

**尺寸规范**：

| 尺寸 | 高度 | Padding | 字号 | 用途 |
|-----|-----|---------|-----|------|
| Large | 48px | 16px 32px | 16px | 页面主按钮 |
| Medium | 40px | 12px 24px | 14px | 默认按钮 |
| Small | 32px | 8px 16px | 14px | 卡片内、表格内按钮 |

### 6.2 输入框（Input）

**结构**：
```
Input [Horizontal, gap=8px, padding=12px 16px, height=48px, radius=8px, border=1px]
├── Leading Icon [20x20px] （可选）
├── Text Placeholder
└── Trailing Icon [20x20px] （可选）
```

**必须定义的属性**：
- 高度（40px / 44px / 48px）
- 边框颜色、宽度、圆角
- 背景色
- Focus 状态样式（边框变色、外发光）
- Error 状态样式（红色边框、错误提示）
- Disabled 状态样式

### 6.3 卡片（Card）

**规范值**：
- 圆角：8px（sm）/ 12px（md）/ 16px（lg）
- 阴影：shadow-sm / shadow-md / shadow-lg / shadow-xl
- 内边距：16px / 20px / 24px

---

## 7. 响应式设计提示

### 7.1 明确标注目标设备

在设计稿旁标注当前画布对应的设备类型：
- 📱 Mobile：<768px
- 📱 Tablet：768px - 1024px
- 💻 Desktop：>1024px

### 7.2 关键断点参考

| 断点名称 | 像素范围 | Tailwind 前缀 |
|---------|---------|--------------|
| （默认）Mobile | 0 - 767px | 无前缀 |
| sm | 640px+ | `sm:` |
| md | 768px+ | `md:` |
| lg | 1024px+ | `lg:` |
| xl | 1280px+ | `xl:` |
| 2xl | 1536px+ | `2xl:` |

### 7.3 移动端布局要点

- 多使用 **Vertical 纵向堆叠**（flex-col）
- 按钮宽度 Fill container（撑满屏幕）
- 卡片间距缩小（16px 或 20px）
- 使用底部导航代替顶部横向导航
- 汉堡菜单（☰）收纳导航项

### 7.4 桌面端布局要点

- 使用 **Horizontal 横向排列**（flex-row）
- 使用 Grid 布局或 Flex + gap 排列卡片
- 最大内容宽度限制（max-width: 1200px / 1400px）
- 侧边栏 + 主内容区的经典布局
- 横向导航栏完整展示所有菜单项

---

## 8. 无障碍（a11y）设计建议

### 8.1 可交互元素尺寸

所有可点击/可交互元素的**最小尺寸 ≥ 44×44px**：
- 按钮：最小高度 44px
- 图标按钮：44×44px
- 链接：行高足够，可点击区域 ≥ 44px
- 复选框/单选框：视觉尺寸可以小，但热区要 ≥ 44px

### 8.2 对比度要求

- 普通文本：≥ 4.5:1
- 大文本/非文本元素：≥ 3:1

### 8.3 语义化标注

在 Figma 图层名称或 Description 字段标注无障碍信息：

- 图标按钮：标注 `aria-label="关闭"`
- 图片：在 Description 中写 alt 文本
- 表单字段：关联 Label 文本
- 区域地标：Header、Nav、Main、Aside、Footer

### 8.4 状态提示

- 不仅仅依靠颜色区分状态（如错误状态同时使用图标+颜色+文字）
- Focus 状态要有明显的视觉指示（边框、外发光）
- 错误信息紧邻对应字段，明确关联

---

## 9. 常见错误避免

### ❌ 错误做法

1. **大量绝对定位**：手动摆放每个元素的 x/y 坐标，不用 Auto Layout
2. **Frame 嵌套过深**：超过 8 层无意义嵌套
3. **空 Frame 包裹**：多余的无样式 Frame 增加层级
4. **用 Group 代替 Frame**：Group 不支持 Auto Layout、Padding、Resizing
5. **手动输入间距**：用空格键、方向键手动拉开距离，不用 gap
6. **随意尺寸**：使用 137px、253px 等无规律的非规范尺寸
7. **直接选色**：不使用 Variables/Styles，直接从色板选色
8. **图层命名混乱**：大量 Frame 1、矩形、文本默认名称
9. **隐藏多余图层**：不用的元素只是隐藏，不删除
10. **重复元素不建组件**：每次都重新画按钮、卡片
11. **文字不设样式**：每个文本框单独设置字号字重
12. **图标尺寸混乱**：同一页面出现 18px、21px、23px 等各种尺寸

### ✅ 正确做法

1. **优先 Auto Layout**：所有布局优先使用 Flex 思路
2. **4px/8px 基准**：所有间距、尺寸使用 4px 网格整数倍
3. **语义化命名**：每个 Frame、Component 都有清晰名称
4. **组件化思维**：重复元素创建 Component + Variant
5. **使用 Variables/Styles**：颜色、字体统一管理
6. **层级扁平化**：能不嵌套就不嵌套
7. **删除冗余元素**：不用的直接删除，不同状态用 Variant
8. **图标统一尺寸**：使用规范的 16/20/24/32/48px
9. **圆角规范值**：4/6/8/12/16px，不要随意值
10. **响应式思维**：设计时考虑不同屏幕尺寸的表现

---

## 10. AI 设计提示词

给 Figma AI 插件（Galileo、Magician、Figma AI、Locofy 等）使用的提示词模板：

```
请按照 figma-dev-tools 最佳实践规范设计 [页面/组件描述]：

【布局要求】
1. 全程使用 Auto Layout（Flexbox），仅弹窗/下拉菜单/浮层使用绝对定位
2. 所有间距使用 4px 基准：4/8/12/16/20/24/32/40/48/64px 等规范值
3. 所有尺寸使用 4px 倍数，避免随意数值
4. 圆角使用规范值：4/6/8/12/16px
5. 方向明确设置 Horizontal 或 Vertical，使用 gap 控制间距

【设计 Token】
6. 使用 Figma Variables 管理颜色，用语义化命名：primary/secondary/success/warning/error/bg-*/text-*/border-*
7. 使用 Text Styles 定义字号层级：12/14/16/18/20/24/30/36/48px
8. 字重只使用 Regular(400)/Medium(500)/Semibold(600)/Bold(700)

【组件要求】
9. 重复元素（按钮、卡片、输入框等）必须创建为 Component
10. 按钮等交互组件创建 Variant：Default/Hover/Active/Disabled/Loading
11. 图标统一尺寸：16/20/24px（正方形），使用 SVG 矢量图形
12. 图标与文字间距统一 8px，垂直居中对齐

【无障碍】
13. 所有可交互元素尺寸 ≥ 44×44px（触控友好）
14. 文字和背景对比度 ≥ 4.5:1（WCAG AA 标准）
15. 用语义化图层名称：Header/HeroSection/FeatureCard/UserAvatar 等

【其他】
16. 保持层级扁平，嵌套不超过 6 层
17. 不使用隐藏图层来管理状态，使用 Variant
18. Padding 明确设置，不要靠元素撑开容器
19. Resizing 正确设置：文本 Hug、按钮 Hug、容器 Fill
```

---

## 附录：Tailwind 类名映射参考

### 间距映射

| Figma 值 | Tailwind 类名 | Figma 值 | Tailwind 类名 |
|---------|--------------|---------|--------------|
| 0px | `0` | 48px | `12` |
| 2px | `0.5` | 56px | `14` |
| 4px | `1` | 64px | `16` |
| 6px | `1.5` | 80px | `20` |
| 8px | `2` | 96px | `24` |
| 12px | `3` | 112px | `28` |
| 16px | `4` | 128px | `32` |
| 20px | `5` | 160px | `40` |
| 24px | `6` | 192px | `48` |
| 32px | `8` | 256px | `64` |
| 40px | `10` | 320px | `80` |

### 字号映射

| Figma 字号 | 行高建议 | Tailwind 类名 |
|-----------|---------|--------------|
| 12px | 1.5 | `text-xs` |
| 14px | 1.5 | `text-sm` |
| 16px | 1.6 | `text-base` |
| 18px | 1.5 | `text-lg` |
| 20px | 1.4 | `text-xl` |
| 24px | 1.3 | `text-2xl` |
| 30px | 1.2 | `text-3xl` |
| 36px | 1.2 | `text-4xl` |
| 48px | 1.1 | `text-5xl` |
| 60px | 1.1 | `text-6xl` |

### 圆角映射

| Figma 值 | Tailwind 类名 |
|---------|--------------|
| 0px | `rounded-none` |
| 2px | `rounded-sm` |
| 4px | `rounded` |
| 6px | `rounded-md` |
| 8px | `rounded-lg` |
| 12px | `rounded-xl` |
| 16px | `rounded-2xl` |
| 24px | `rounded-3xl` |
| 999px / 50% | `rounded-full` |

### 阴影映射

| Figma 阴影 | Tailwind 类名 |
|-----------|--------------|
| sm | `shadow-sm` |
| md | `shadow-md` |
| lg | `shadow-lg` |
| xl | `shadow-xl` |
| 2xl | `shadow-2xl` |

### 字重映射

| Figma 字重 | Tailwind 类名 |
|-----------|--------------|
| 400 (Regular) | `font-normal` |
| 500 (Medium) | `font-medium` |
| 600 (Semibold) | `font-semibold` |
| 700 (Bold) | `font-bold` |

---

## 设计检查清单

提交设计稿前，请对照此清单检查：

- [ ] 所有布局使用 Auto Layout（浮层除外）
- [ ] 间距/尺寸都是 4px 的整数倍
- [ ] 图层名称语义化（无 Frame 1、矩形等）
- [ ] 颜色使用 Variables/Styles 管理
- [ ] 文字使用 Text Styles 管理
- [ ] 重复元素创建为 Component
- [ ] 组件设置了必要的 Variant 状态
- [ ] 图标尺寸规范（16/20/24/32/48px 正方形）
- [ ] 圆角使用规范值（4/6/8/12/16px）
- [ ] 没有无意义的隐藏图层
- [ ] 没有过深的嵌套（≤ 6 层）
- [ ] Padding 明确设置
- [ ] Resizing 正确配置
- [ ] 可交互元素 ≥ 44×44px
- [ ] 文字对比度达标
- [ ] 标注了目标设备类型（Mobile/Tablet/Desktop）

---

**遵循以上规范，figma-dev-tools 将能完美还原您的设计！** 🎨✨
