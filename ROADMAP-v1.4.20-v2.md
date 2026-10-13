# figma-dev-tools v1.4.20 迭代计划（v2 修订版）

> v1 制定日期：2026-10-09　｜　v2 修订日期：2026-10-09
> 当前发布版本：**v1.4.19**（npm 已发布；工作区 package.json 已 bump 至 1.4.20）
> 目标版本：**v1.4.20**
> 版本定位：**微信小程序一级支持（差距补齐）+ Svelte 第三框架 + 同步体验工具**
> 预计周期：4-5 周，单版本发布；uni-app / Taro 降为 experimental，可顺延 v1.4.21

---

## 〇、v2 修订说明（相对 v1 的变更）

v1 存在三类问题：与代码现状脱节、数字口径自相矛盾、小程序方案遗漏"能否运行"的关键约束。v2 逐条修正：

| # | v1 问题 | v2 处理 |
|---|---|---|
| 1 | P0-1 按"从零新建微信小程序"规划 | 改为**差距补齐**：weapp 生成器、MCP 工具、CLI、示例、26 条测试均已存在，本章列出经代码核实的真实差距 |
| 2 | 工具数"现状 22 → 新增 8 → 30" | 现状实为 **23**（含已注册的 weapp）；本期承诺净增 **5** 个 → **28**；experimental 2 个若落地则 30 |
| 3 | 测试目标 550 / 600 并存，基线 493 无源 | 已实际执行 `npm test -- --reporter=dot`：**40 个测试文件、520 个测试全部通过**；本计划以 **520** 为冻结基线，目标统一为 **≥620（stretch 640）** |
| 4 | "10 套样式可用" | 统一为 **9 套新管线可插拔 + inline-styles（仅旧管线）+ css-variables（planned）** |
| 5 | 小程序只谈标签/单位，漏资源、SVG、WXSS 限制、验收度量 | 新增资源管线与包体积、SVG 策略、WXSS 能力矩阵、还原度可度量方案四节 |
| 6 | uni-app/Taro 挂 P0 承诺但验收只测单端 | 降为 **experimental（opt-in 开关）**，不阻塞发布，允许顺延 v1.4.21 |
| 7 | Watch 未处理 stdio 生命周期、写盘边界、陈旧缓存、preserve 语法 | 补充架构决策（写盘显式授权、缓存绕过、进程清理、JSON 无注释的 preserve 方案） |
| 8 | 排期 4-5 周装 13 项，且未说明人力容量 | 收敛 Committed/Stretch 边界；新增执行级 WBS、依赖、验收和切范围顺序。**4-5 周仅在 2 名开发等价投入（约 50 人日）时成立**，不足时必须在 Phase 1 前重排版本 |

> **v2.1 执行细节补强（2026-10-09，同日）**：不改变版本范围与成功指标，只补齐按 DoR 开工所缺的契约与口径——① 容量账重算，开发/QA 人日分列（见 4.2、4.7 汇总表）；② Watch 补齐 `outputDir` 等缺失参数、轮询额度估算与多会话并发/隔离语义（P1-2）；③ 补 asset manifest 字段 schema、目标基础库版本冻结规则、5 个新工具的 inputSchema/错误码/i18n 契约（附录 A）；④ WBS **42 → 44** 个任务（新增 WBS-P1-26 watch 多框架联调、WBS-P3-32 GUI/CHANGELOG，均为原方案已承诺但漏拆的工作，不构成范围扩大）。

---

## 一、现状审计基线（冻结于 2026-10-09 工作区代码）

> 以下全部数字可在当前工作区定位到出处，作为本期所有计数的唯一基线。

### 1.1 MCP 工具：实际注册 23 个

证据：`src/index.ts` 共 23 处 `server.registerTool(...)`；冒烟测试 `test/smoke/mcp-tools.smoke.test.ts#L27-L49` 显式枚举 23 个名称，注释明确"**快照即发布闸门**，新增工具需显式更新"。

| # | 工具名 | 标题（注册时声明） |
|---|---|---|
| 1 | `figma_parse_url` | 解析 Figma URL |
| 2 | `figma_get_file` | 获取 Figma 文件信息 |
| 3 | `figma_extract_tokens` | 提取设计 Tokens |
| 4 | `figma_generate_component` | 生成 React 组件代码（**旧管线**） |
| 5 | `figma_get_screenshot` | 获取节点截图 |
| 6 | `figma_generate_styles` | 生成样式配置文件 |
| 7 | `figma_sync_to_project` | 同步 Tokens 到本地项目 |
| 8 | `figma_validate_token` | 验证 Figma Access Token |
| 9 | `figma_get_metadata` | 获取设计节点元数据（概览） |
| 10 | `figma_get_design_context` | 获取精简设计上下文 |
| 11 | `figma_download_assets` | 下载设计资源到项目资源目录 |
| 12 | `figma_create_icon_sprite` | 生成 SVG Sprite |
| 13 | `figma_list_components` | 列出文件中的组件 |
| 14 | `figma_lint_design` | 代码还原质量预检 |
| 15 | `figma_generate_jsx` | 一键生成 React 组件（增强版） |
| 16 | `figma_generate_vue` | 一键生成 Vue 2/3 SFC |
| 17 | `figma_batch_generate` | 批量生成整页组件 |
| 18 | `figma_get_structured_data` | 框架无关结构化数据 |
| 19 | `figma_dev_fallback_status` | 查询付费墙兜底系统状态 |
| 20 | `figma_dev_fallback_capture` | 触发浏览器兜底截图 |
| 21 | `figma_verify_fidelity` | 还原度校验（像素 diff） |
| 22 | `figma_ocr_extract` | OCR 文本提取 |
| 23 | `figma_generate_weapp` | **微信小程序组件生成（已注册，能力待补齐，见 P0-1）** |

**文档与代码的出入（发布前必须修文档）：**

- README.md / SKILL.md 宣称"22 个工具"，且工具表包含 `figma_generate_animation`、`figma_extract_interaction`——二者**均未注册**（仅有 `animation-detector.ts`、`interaction-inferrer.ts` 服务，能力以增强报告形式内嵌于生成结果）。
- README 工具表漏列实际已注册的 `figma_dev_fallback_status`、`figma_dev_fallback_capture`、`figma_generate_weapp`。
- 处置决策：① 文档按 23 个重写工具表，animation/interaction 在"智能增强（非独立工具）"一节说明；② 本期每新增一个工具，必须同步更新冒烟测试枚举数组（快照会红）。

### 1.2 其他口径统一表

| 指标 | 代码事实（出处） | v1/旧文档说法 | **统一口径（本期以此为准）** |
|---|---|---|---|
| MCP 工具 | 23 个（index.ts / smoke 快照） | 22 | **23** |
| CLI | 22 个顶层命令、32 条 `.command()` 声明（`src/cli/index.ts`，含 lang/token/cache 子命令与隐藏 completion）；install/uninstall 为独立 `.mjs` 脚本 | README"20+"、速览"30+"、且列了不存在的 `init` 命令 | **22 个顶层命令（32 条命令声明）+ 2 个独立安装脚本**；删除文档中的 `init`（功能由 `wizard` 承担） |
| 样式方案 | 注册表 11 个描述符：9 个新管线 available（`STYLE_FORMATS_NEW_PIPELINE`）、inline-styles available 但仅 `STYLE_FORMATS_LEGACY_REACT`、css-variables 为 planned（`style-renderers/registry.ts`） | "10 套可用"、"2 套→10 套" | **9 套新管线可插拔 + 1 个旧管线专属（inline）+ 1 个 planned（css-variables）** |
| 框架矩阵 | React/Vue：tailwind/unocss/css-modules/less/sass 双支持；styled/emotion/vanilla-extract/panda 仅 React（`NEW_PIPELINE_FRAMEWORK_SUPPORT`） | 矩阵基本正确 | 沿用，Svelte/小程序新增列 |
| 编辑器 | 8 个（`editor-detector.ts`：trae/vscode/cursor/windsurf/claude-desktop/zed/cline/roo-code） | README"8+"、SKILL"10+" | **8 个**（"8+"仅在新增后才允许使用） |
| 测试 | **实跑 `npm test`：40 个文件、520 个测试全绿（2026-10-09）**；静态扫描为 462 个 `it/test` 声明，另有参数化/动态注册，故不再用静态声明数反推 Vitest 总数 | 基线 493、478、旧文 375 | **基线 520**；每次发布前必须保存 `vitest run` 汇总行，不再用 grep 估算 |
| 代码规模 | src 75 个 TS ≈ 40.0k 行；test 40 个 TS ≈ 8.5k 行 | v2 初稿写 test 44 个 ≈9.5k | **src 75 / 40.0k；test 40 / 8.5k**，仅作容量背景 |
| 版本号 | package.json = **1.4.20**；package-lock.json 根包及 `packages[""]` 仍为 **1.4.19**；README/SKILL/QUICKSTART 标题仍为 v1.4.19 | ROADMAP 称"当前 v1.4.19 已发布" | **package.json + package-lock.json + 文档 + CLI/MCP 输出统一 1.4.20**；锁文件漂移列为 WBS-G0 发布前修复项 |
| 一级框架 | React、Vue（有独立生成器）；weapp 工具已注册但不完整；Svelte 仅 structured_data | "双一级" | 现状 **2 个**；本期目标 **4 个**（+微信小程序、+Svelte） |

### 1.3 微信小程序已有能力盘点（P0-1 起点）

已完成（`src/services/weapp-generator.ts`，当前 830 行；MCP 工具 `src/index.ts#L3058`；CLI `weapp` 命令 `src/cli/index.ts#L1839`；示例 `examples/weapp-demo/`）：

- 标签映射 view/text/image/button/navigator；Page/Component 双模式 JS 模板
- px→rpx 换算（designWidth 默认 750，可切 px）；class 收集生成 WXSS
- 接入 flex-fixer、a11y-enhancer、design-system、XSS 转义、不可见节点跳过
- image 懒加载/mode、bindtap 占位与 warnings、组件名推断与清洗
- 26 条单测（标签/单位/四件套/双模式/安全/资源/嵌套/警告）

经代码 grep 核实的**真实差距**（即 P0-1 全部任务来源）：

1. 无 `wx:for` / `wx:if` / `wx:elif` / `block` 列表与条件渲染（v1 验收标准却要求它）
2. 图片输出为 `src=""` 空占位，**无小程序资源落位与引用策略**
3. 无 scroll-view / rich-text / swiper / picker 等高频原生组件映射
4. 无 TabBar/app.json/project.config.json 生成（v1 列为任务，尚未动工）
5. SVG 已走 `_tryRenderSvgAsImage` 并避免内联 SVG，但只生成 `<image src="">` 与 `pendingAssets`，**导出文件并未落位/形成可运行 URL**；现有 `image-cdn`/base64/iconfont 策略也未定义
6. 事件仅 bindtap 占位，缺 catchtap / bindinput 表单事件 / triggerEvent 组件通信
7. designWidth 写死默认 750，未从 Figma 帧宽度自动推断（375 宽帧会整体差 2 倍）
8. 还原度验收无法用现有 fidelity-verify（Playwright 渲染 HTML）度量 WXML

---

## 二、版本定位与范围

**v1.4.20 = 微信小程序一级支持（补齐到可用）+ Svelte 第三框架 + Watch/Compare 同步体验**

范围分级：

| 级别 | 内容 | 发布阻塞 |
|---|---|---|
| **Committed（10 个工作包）** | P0 小程序差距补齐（含资源管线/验收）、P1 Svelte、P1 Watch、P1 Compare、P2 组件库映射落地、P2 富文本（含小程序 rich-text）、P2 响应式骨架、P2 css-variables 前置、P3 性能（基线先行）、P3 测试+文档；由 WBS 中 44 个可领取任务交付 | 是 |
| **Stretch / Experimental（3 项）** | uni-app、Taro、Watch 节点级增量 | 否，可顺延 v1.4.21 |

差异化依据不变：小程序是海外 D2C 竞品空白市场；但"一级支持"必须由可运行性与验收手段支撑，因此 uni-app/Taro 不以 P0 承诺发布。

---

## 三、详细迭代计划

### P0-1：微信小程序一级支持（差距补齐）⭐

**目标：** 已注册的 `figma_generate_weapp` / `figma-dev weapp` 从"能出四件套文本"补齐到"产物可在微信开发者工具直接运行，且还原度可度量"。其中**可运行性闸门以 `figma-dev weapp --output` 的落盘产物为准**；MCP 按既有边界只返回代码 + asset manifest，不把“返回文本”误称为资源已经落位。

#### P0-1.1 列表与条件渲染（差距 1）

- 语义识别：批量重复子节点（同 componentKey / 同名同构 ≥3）→ `wx:for="{{items}}" wx:key="id"`；可选显式开关 `inference.list`
- 显隐语义（名称含 tab/modal/tooltip 或原型交互可见性）只作为候选信号；默认写入建议报告，只有显式 `inference.conditions` 命中或用户确认后才生成 `wx:if` / `hidden="{{...}}"`，避免猜测业务状态
- 数据列表由组件 `data.items` 等占位数组提供，WXML 统一使用 `wx:for="{{items}}"`，不再使用旧别名 `wx:for-items`
- `<block>` 只做无样式包裹；预览数据直接进入 Page/Component `data`，不生成 `node-_.json` 之类的临时私有文件
- 测试：列表识别、key 生成、嵌套循环、if/elif、block 无样式泄漏（≥10 例）

#### P0-1.2 资源管线与包体积（差距 2，本期新增重点）

产出《小程序资源策略》决策并实现：

- **资源状态先于代码输出**：每个资源必须处于 `local-resolved`、`cdn-resolved`、`base64-resolved` 或 `unresolved`；`unresolved` 不得伪装成可运行产物，必须输出 asset manifest + warning
- **三种落位模式**（MCP 参数 `assetMode: 'local' | 'cdn' | 'base64'`，默认 `local`；不再用模糊的“按项目检测”）：
  - `local`：CLI `--output` 落位 `images/<scene>/` 并写相对路径；MCP 文本模式只返回 manifest，提示需 CLI/人工落位
  - `cdn`：必须提供稳定的 `publicBaseUrl` 或已有永久 HTTPS URL。**Figma 导出 URL 是临时签名 URL，禁止直接当最终 CDN 地址**；下载后仍需用户上传，文档说明 downloadFile 合法域名
  - `base64`：仅允许小图标/小图（图标 <2KB 与 P0-1.3 一致、位图 <10KB，超限直接拒绝）；同一生成文件内 data URI 总大小 ≤50KB，且单文件硬上限 2000 行（初始阈值，统一放常量便于调整），任一超限对该资源回退 `unresolved` 而非截断输出
- **asset manifest 字段契约（WBS-P0-21 的开工输入，字段冻结后只许新增、不改语义）**：
  ```jsonc
  [{
    "id": "a_0001",                    // 本次生成内稳定唯一
    "figmaRef": { "nodeId": "12:3", "imageRef": null },
    "kind": "raster | svg",
    "state": "local-resolved | cdn-resolved | base64-resolved | unresolved",
    "reason": null,                    // 仅 unresolved：TEMP_SIGNED_URL | FETCH_FAILED |
                                       // SIZE_LIMIT | MISSING_PUBLIC_BASE_URL
    "localPath": null,                 // /images/<scene>/<hash12>-<safe-name>.<ext>
    "publicUrl": null,
    "sha256": null,                    // 资源字节 sha256，hex
    "bytes": 0, "mime": "image/png", "pixelRatio": 2, "scene": "default"
  }]
  ```
  去重键 = `sha256 + kind`（同一资源被多节点引用只落一份、WXML 共用同一路径）；路径规则 `/images/<scene>/<sha256 前 12 位>-<安全化原名>.<ext>`
- 扩展 `asset-paths.ts`：新增 weapp 形态（与 vite/webpack/next/remix 并列），`publicCdnUrl()` 不适用，生成器改用 `weappAssetPath()`
- 位图按明确 `pixelRatio: 1 | 2 | 3` 导出，不以 designWidth 单独决定倍率
- **包体积阈值作用于整个主包而非只算图片**：>1.5MB 预警、>2MB 阻断，输出 subpackages 建议但不自动改写工程。核算输入必须显式：CLI 新增 `--project-root <dir>`，目录含 app.json 时按注册页面统计主包 JS/WXML/WXSS/JSON/图片总字节；未提供工程（直接 `--output` 到空目录）时**只报告本次产物自身字节数并标注 warning"非全主包口径，阈值不生效"**，不得假装已核算整包。阻断语义：CLI 退出码 **2**（CI 可识别），MCP 返回 `isError` 结果 + 错误码 `FDT-WEAPP-BUNDLE-EXCEEDED`
- CLI/MCP 参数对齐：`figma-dev weapp` 新增 `--asset-mode <local|cdn|base64>`、`--icon-strategy <image-local|image-cdn|base64>`、`--public-base-url <url>`、`--pixel-ratio <1|2|3>`、`--project-root <dir>`；MCP 入参同名 camelCase；全部 flag 进 help 文本并走 i18n 双语快照
- 验收：三种模式与 4 种 state（含每个 reason 码）单测；manifest schema 校验与去重单测；禁止临时 Figma URL 快照；`--project-root` 存在/缺失两口径下阈值行为单测；bundle-detector 识别 app.json / project.config.json

#### P0-1.3 SVG / 图标策略（差距 5）

- 明确 WXML 不支持内联 SVG；提供三种 Committed 策略（参数 `iconStrategy`）+ 一种 Stretch：
  1. `image-local`（默认）：SVG 经现有导出器转成受控资源，落位后由 `<image>` 引用
  2. `image-cdn`：仅接受稳定 HTTPS 地址，临时 Figma URL 必须拒绝
  3. `base64`：小图标（<2KB）内联 data URI
  4. `iconfont` 列为 Stretch：网络字体受域名和加载时序影响，不作为一级支持验收项
- 保留 `SvgInlineRenderer` 只负责导出/栅格化，不再把 JSX/Vue 内联产物当作 WXML；补资源落位适配器和 `src` 生成
- 验收：默认策略产物可运行；临时 URL 拒绝；base64 大小限制；SVG 与 data URI 分支均通过 XSS 清洗

#### P0-1.4 WXSS 能力矩阵与降级（差距扩展）

在生成器内建**显式限制清单**（替代 v1 一句"自动降级"），逐项 warn 并在报告中输出。

**版本先行（WBS-P0-41 开工首日必须冻结）**：目标基础库最低版本建议 **3.0.0**，以微信官方"基础库版本分布"页核实（要求该版本覆盖率 ≥95%）后把确切版本号回填本节与能力矩阵；冻结前所有任务引用"冻结版本"占位，禁止口头使用"高版本"。Grid、CSS 变量、aria 属性去留一律以该冻结版本的官方能力文档为唯一判据。

**覆盖率分母（同一任务冻结）**：按 布局 / 盒模型 / 文本 / 颜色与背景 / 边框 / 变换 / 效果 七类，预先登记 **≥80 个样式属性**，每条记录 `{ cssProperty, wxssSupport: full|partial|none, minLibVersion, action: keep|degrade|drop, note }`；清单冻结后任何增删必须在覆盖率报告中留痕，排除项（none）可见但不进 P0-1.8 分母。

| 限制 | 处置 |
|---|---|
| 不支持 `*` 通配选择器 | 不生成，改为显式 class |
| 本地 background-image 禁用 | 优先改为 `<image>` + local 文件；否则转稳定 https/base64（与 P0-1.2 联动），不能留下本地 URL |
| 无 :hover / 伪元素支持有限 | 丢弃并 warn；交互态建议 `hover-class` |
| Grid 低于冻结版本不支持 | 降级 flex + 在报告输出冻结版本要求，不静默丢弃 |
| 滚动容器 | overflow 滚动场景输出 scroll-view（见 P0-1.5） |
| CSS 变量 | 按冻结版本门槛检测，默认不输出 var()，降级为字面值 |
| image 默认 320×240 | 所有 image 强制显式宽高（已有 mode，补齐尺寸） |
| 不支持的选择器组合（属性/兄弟选择器等） | warn + 降级类名 |

#### P0-1.5 原生组件与事件补齐（差距 3、6）

- 组件映射补：scroll-view（滚动区）、swiper（轮播，仅在 T21 轮播推断命中时建议）、rich-text（富文本，见 P2-2）、picker/switch/textarea/radio-group/checkbox-group（表单语义节点）、icon
- navigator：补 `open-type`（switchTab/reLaunch/navigate），TabBar 页路径给 switchTab 提示
- 事件：`bindtap` / `catchtap` / `bindinput` / `bindsubmit` / `bindchange`；自定义组件 JS 模板补 `properties/methods` 与 `triggerEvent`，wxml 用 `bind:customevent` 建议
- 验收：每类组件/事件至少 1 例快照；属性合法性按**基础库能力矩阵**判断，不笼统删除全部 `aria-*`：目标基础库支持的无障碍属性保留，确认为 web-only 的属性移出 WXML 并写入 a11y JSON 报告

#### P0-1.6 rpx 与 designWidth 自动推断（差距 7）

- 从目标帧绝对宽度推断：≈375 → designWidth 375（rpx = px×2）；≈750 → 750（×1）；其他值按 `rpx = px × 750 / frameWidth` 公式换算，参数仍可手动覆盖
- 同步检查帧内子元素尺寸是否按同一基准设计，不一致时 warn
- 验收：375/750/414 三档帧宽单测

#### P0-1.7 工程配置生成（差距 4，承诺收敛）

- 输出**建议片段**而非自动改写：页面 JSON（usingComponents/navigationBarTitleText）、app.json 页面注册行、project.config.json 最小字段（`appid` 占位 `touristappid`、`compileType: "miniprogram"`、`libVersion` = P0-1.4 冻结版本、`setting` 仅列必要项）；所有片段附带"粘贴位置"注释，但不修改用户工程
- **TabBar 仅输出配置建议**：TabBar 语义识别本身是新推断项（T21/T22 未覆盖），且 tabBar 图标仅接受本地路径与尺寸约束；本期不承诺自动生成，列入 v1.4.21 候选
- CLI `weapp --output` 支持四件套直接落盘 pages/components 目录（MCP 仍只返回文本，遵循"MCP 不写磁盘"）

#### P0-1.8 还原度验收度量（差距 8）

本项已作出明确取舍，不再保留“二选一”状态：

- **发布闸门采用方案 B（已决定，不再二选一）**：定义"WXSS 属性覆盖率"，分母仅取预先登记且冻结版本支持（full/partial）的属性映射，`none` 排除项必须在 fixture 报告中逐项列出（属性、节点、排除理由）；基础覆盖率 **≥85%**
- **6 张黄金截图评审规则（模板随 WBS-P0-81 产出）**：每张截图覆盖一类典型页面（建议：登录/列表/卡片详情/表单/营销长页/导航框架），按 5 个维度逐属性判定——尺寸与位置、布局、文本样式、颜色与效果、间距；**两名评审人独立打分**，覆盖率差值 >10 个百分点时由第三人复核该页；fixture 的来源与授权统一按 P3-2 的 fixtures/LICENSES.md 要求登记，黄金截图不允许使用未授权私有设计稿
- **方案 A 降为 Stretch**：`miniprogram-automator` 走 optionalDependencies，在 Windows/CI/无头环境稳定后才接入 pixel diff；未稳定前不得作为发布闸门
- 不再使用"像素 diff ≥85%"这种现有工具无法稳定对 WXML 执行的表述；成功指标只引用方案 B，方案 A 落地后另行增加而非替换

**P0-1 总验收：** `figma-dev weapp --output` 产物中基础组件（按钮/卡片/列表/表单/导航/滚动区）四件套正确；默认 local，cdn/base64 仅在资源已解析时可运行；MCP 输出含完整 asset manifest 且 unresolved 为 0 时才算资源闭环；375 与 750 宽帧换算正确；warnings 覆盖全部 WXSS 降级项；新增 ≥30 条测试；examples/weapp-demo 更新为含列表/表单/本地图片的完整页面，并附稳定 CDN 切换说明。

---

### P1-1：Svelte 一级支持（Committed）

- 新增 `services/svelte-generator.ts` + `figma_generate_svelte` 工具 + CLI `figma-dev svelte`
- 样式：tailwind / unocss / `css-modules` 兼容枚举；其中 `css-modules` 实际输出 Svelte scoped `<style>`，**不承诺 CSS Modules hash/composes 语义**，工具描述与文档必须写明；非法组合触网前报错
- 语法：`export let props`、`{#if}`/`{#each}`、`on:click`（Svelte 4 口径；Svelte 5 runes 模式仅给注释建议，不作为默认输出）
- 资源引用 Svelte 静态路径规范；Component Properties → props 推导复用 props-type-generator
- 验收：≥20 条单测；三套样式组合快照；batch_generate 扩展 `framework: 'svelte'`（与 CLI/MCP schema 同步，更新 smoke 快照）

### P1-2：Watch 模式 MCP 化（Committed，增量为 Stretch）

**先做的架构决策（写入 DEVELOPMENT.md）：**

1. **写盘边界**：MCP 工具默认**只返回生成结果不落盘**；落盘为显式 opt-in（参数 `write: true`），**此时 `outputDir` 必填**，路径必须通过 security.ts 越权校验（同资源下载目录约束）；`write: false`（默认）下若传 `outputDir` 直接返回参数错误 `FDT-WATCH-OUTPUT-WITHOUT-WRITE`，`write: true` 但缺 `outputDir` 返回 `FDT-WATCH-MISSING-OUTPUT`，不做隐式落盘
2. **stdio 生命周期**：watch 会话绑定 MCP 进程；实现 SIGTERM/disconnect 清理钩子；状态工具可查；编辑器重启后会话失效需重新 start（文档明示，不承诺持久化）
3. **陈旧缓存**：watch 链路显式使用 `cachePolicy: 'bypass'`，不能依赖 `'latest'` 键（`cache.ts#L569` 的 version 缺省与 TTL 会返回旧数据）；version 只用于变更比较，不作为默认缓存命中键
4. **变更检测两级化**：先用文件响应的 `lastModified` / `version` 粗筛（省 API 额度、避 429），确认变更后才拉节点树；**节点级 hash 增量列为 Stretch**，默认全量重写（与 v1 风险结论一致：全量更安全）
5. **用户修改保留**：
   - wxml/wxss/js/vue/svelte/tsx 使用各自注释语法的 `figma-dev:preserve:start/end` 区块；生成器解析旧文件做区块合并
   - **JSON 文件无注释**：改用旁路 `*.figma.json` 按明确 JSON Pointer 记录用户字段并合并，禁止在 .json 内打标记；数组整体视为用户区或生成区，不做脆弱的元素级深合并
   - 合并前用 Prettier 对新旧候选做 parser 级归一化；提取 preserve 时保留原注释位置。Prettier/parser 失败必须 fail-open 回退原文件并报告，不能静默覆盖
6. 工具：`figma_watch_start` / `figma_watch_stop` / `figma_watch_status`（完整 inputSchema 见附录 A）。start 显式接收 `fileKey/nodeId/framework/styleFormat/vueVersion/pollIntervalMs/write/outputDir`，默认 `pollIntervalMs=5000`、`write=false`；`outputDir` 仅在 `write=true` 时必填（见决策 1）。stop/status 以 sessionId 幂等操作。框架支持 react/vue/svelte/weapp（复用各自生成器），但 **svelte/weapp 仅在对应生成器合入后才允许 start**，未就绪时返回 `FDT-WATCH-FRAMEWORK-UNAVAILABLE` 并指明依赖版本；联调任务为 WBS-P1-26
7. **轮询额度估算（写死为可审计常量，不允许凭感觉调间隔）**：粗筛端点固定 `GET /v1/files/:key?depth=1`（响应仅取 `lastModified` / `version`，不拉节点树）；单会话 5s 间隔 ≈ **720 请求/小时**。WBS-P1-22 开工时必须按目标套餐的 Figma 官方速率限制核算"每进程会话上限 × 720"的占用比例并记录在代码注释；命中 429 走指数退避（初始 10s、倍率 2、上限 2min），退避期间检测延迟指标如实扣除
8. **会话并发与隔离**：会话表只存 MCP 进程内存（`Map<sessionId, Session>`），进程退出即失效，不做磁盘持久化；每个 MCP 进程并发 watch 会话上限 **5 个**，超限 start 返回 `FDT-WATCH-TOO-MANY-SESSIONS`；同一 MCP 客户端对相同 `fileKey+nodeId+framework` 重复 start **返回已存在的 sessionId（幂等）**，不建立第二条轮询；不同 MCP 客户端（多编辑器/多窗口）会话互相隔离、各自计额度
9. 验收：≥12 条单测（含伪造时钟的轮询、stop 幂等、重复 start 幂等、超限拒绝、缓存失效、429 退避、preserve 合并、JSON 旁路合并）；10s 内检测变更的验收保留

### P1-3：代码差异对比（Committed）

- 新增 `figma_compare_code`：单文件入参支持 `currentCode` **或** `currentFilePath`；小程序/SFC 等多产物支持 `currentFiles: [{ path, code? }]`，一次返回文件级 diff，文件读取全部过路径校验
- diff 前对两侧代码做 Prettier 归一化，消除格式噪音；输出 unified diff + 结构化 changes + stats
- 与 Watch 联动但保持独立可用：watch 变更结果可选附带 diff；**接受/拒绝闭环不做 UI**，仅输出建议（落盘合并语义由 P1-2 preserve 承担）
- 依赖选择：格式化归一化直接复用仓库**已有运行时依赖** `prettier`（package.json `^3.4.2`，含 wxml/vue/svelte parser 能力验证列入 WBS-P1-32），不新增依赖；仅 diff 算法本体按零依赖轻量实现或成熟小型库评估，新增依赖必须给出 bundle 体积增量数字
- 验收：≥6 条单测（含格式化归一化、多文件、二进制/大文件拒绝、路径越权）；单文件 1000 行内 diff P95 <100ms，输入总大小设硬上限

### P2-1：组件库映射从"建议"到"直接生成"（Committed）

- React 的 `figma_generate_jsx` 新增 `componentLibrary: 'auto' | 'shadcn-ui' | 'ant-design' | 'none'`；Vue 新增 `'auto' | 'element-plus' | 'ant-design-vue' | 'none'`。`auto` 读取最近 package.json/workspace 依赖，必须看到真实依赖才命中，不能只按项目名猜
- 高置信度才替换（保守默认），未命中降级原生标签 + 注释；Props 映射 Button/Card/Input/Dialog/Tabs/Avatar/Badge
- Vue 侧：Element Plus / Ant Design Vue 同步落地到 vue-generator
- components.json 映射从 TODO 注释升级为真实 import；保持 cn() 风格；参数和匹配结果通过 `batch_generate` 透传，并同步 MCP schema/smoke 契约
- 验收：≥10 条测试；建立 **≥60 个标注节点** 的 fixture 集，识别率 ≥70% / Props ≥60%；分母、匹配阈值和误替换数写入测试报告，保守模式误替换必须为 0

### P2-2：富文本渲染增强（Committed，含小程序形态）

- 行内嵌套（加粗+变色+链接）、text-decoration、text-case（UPPER/lower/Title/SMALL_CAPS）、段落间距、列表/链接识别
- **小程序形态**：复杂富文本写入 JS data，WXML 输出 `<rich-text nodes="{{richNodes}}"></rich-text>`（nodes JSON 由生成器构造并经 XSS 清洗），简单文本仍走 `<text>`
- 验收：≥10 条边缘 case；web 与 weapp 双形态快照；建立 ≥50 段标注样本（授权登记见 P3-2），列表/链接识别率 ≥80% 且误识别率 ≤5%，双指标同一份报告输出

### P2-3：响应式推断从建议到骨架（Committed）

- 输出 md:/lg:（移动优先）或 sm:（桌面优先）类名骨架；模式覆盖列转行、字号、间距、栅格列数
- 参数 `inference.responsive` + `mobileFirst | desktopFirst`；仅输出骨架，不臆造断点外内容
- 安全区域：移动 H5 给 `env(safe-area-inset-*)`；小程序给 `wx.getSystemInfoSync` safe-area 建议片段
- 验收：移动帧/桌面帧 fixtures 各 ≥3 例

### P2-4：CSS Variables 前置（Committed，不转 available）

- 新增 renderer 骨架 + 命名规范（--color-*/--spacing-*）+ tokens 映射；注册表状态**保持 planned**，不进入生成枚举
- 本期完成后 v1.5.0 再实现 @layer/容器查询并转 available
- 验收：骨架单测；不影响现有 11 枚举的 smoke 契约

### Stretch（不阻塞发布）

> **决策时点与决策人（v2.1 补）**：以下三项默认不启动。uni-app / Taro 是否启动 = **Phase 2 结束日（第 3 周末）**由版本负责人按容量余量决策，结论写回本文件；automator 升发布闸门 = **Phase 3 中段（第 4 周中）前 CI 在 Windows + Linux 连续 3 个工作日稳定**，否则维持 optionalDependencies + 方案 B；节点级增量 = Phase 3 结束日评估。任何时点未达条件即明确顺延 v1.4.21，不用"再看看"悬挂。

- **uni-app（experimental）**：复用 vue-generator 加适配层；若落地，`figma_generate_uniapp` 带实验性标注，验收必须自己参数声明的平台一致——暴露 mp-alipay 就要测支付宝端，否则砍参数；pages.json/manifest.json 生成
- **Taro（experimental）**：纠正 v1 配置错误——`designRatio/deviceRatio` 在 `config/index.ts`，`app.config.ts` 仅运行时路由配置；资源走 import/require 而非 `@/assets` 字符串；React 优先，Vue 不承诺
- **Watch 节点级 hash 增量**：P1-2 第 4 条的 opt-in 增强
- **miniprogram-automator（方案 A）**：见 P0-1.8，Stretch 决策时点同上

### P3-1：大文件性能（基线先行）

- **第一步（必做）**：用现有 `test:perf` 建立 1000 节点基线（耗时/内存）并记录；固定环境、预热 1 次、运行 5 次取中位数，没有基线不宣称优化比例
- 有效优化项：Token 匹配结果记忆化（同值不重复 CIE76 计算）、hierarchy-fixer 坐标比较改空间索引、Figma API I/O 段受控并发（受 429 节流约束）
- 删除伪优化项："metadata 只处理第一层"已是现状；"数组 join 替代模板字符串"在现代 V8 无显著收益，不列入
- 验收：**Committed 为相对基线耗时 -20% 且内存增幅 ≤5%；-30% 为目标值/Stretch**；基准脚本进 CI 可选任务，未达目标时如实写结果，不阻塞其余功能

### P3-2：测试（数字统一）

| 模块 | 新增用例（静态 it/test 口径） |
|---|---|
| 小程序差距补齐（P0-1 合计） | ≥30 |
| Svelte 生成器 | ≥20 |
| Watch（含 preserve/JSON 旁路） | ≥12 |
| Compare（含多文件） | ≥6 |
| 组件库映射 | ≥10 |
| 富文本（含 rich-text） | ≥8 |
| 响应式骨架 | ≥6 |
| CSS Variables 骨架 | ≥4 |
| 性能回归用例 | ≥2 |
| 版本/工具表/发布脚本校验 | ≥4 |
| **合计新增** | **≥102** |

- 目标：实跑基线 **520 + 102 ≥ 622**，发布承诺写 **≥620（stretch 640）**；预留合并时删重空间，其他章节不再混用历史估算口径
- 新增功能覆盖率 ≥80%，口径固定为本次新增/修改源码的 **lines + branches**，通过 `vitest --coverage` 报告；纯类型、生成模板和外部 GUI 路径的排除项逐项列出
- 发布前保存 `vitest run` 的 `Test Files / Tests` 汇总行并回填本文件与 README
- 每新增 MCP 工具必须更新 `mcp-tools.smoke.test.ts` 名称枚举和 schema 快照（发布闸门）
- **fixture 授权（新增）**：本期所有新增 fixtures（黄金截图 6 张、标注节点 60 个、富文本 50 段、响应式样例等）必须在 `test/fixtures/LICENSES.md` 逐项登记来源与授权；只允许自制或 MIT / CC0 等可再分发授权的 Figma Community 文件，客户稿与私有设计稿一律不得入库
- 测试计数口径：上表"新增用例"为规划静态口径，发布承诺只认 `vitest run` 实跑数；WBS-P3-21 必须同时报告静态新增数与实跑增量，两者偏差 >10% 需解释（动态注册/参数化/删重）

### P3-3：文档、示例与配套改动（易漏项清单）

1. README / README.en-US / SKILL / QUICKSTART：工具表改 23→28（若 experimental 落地则 30，并明确实际注册数）、删 animation/interaction 工具行并移入"智能增强"说明、CLI 删 `init`、编辑器统一 8、样式口径 9+1+1
2. SKILL.md 路由规则：补"小程序走 figma_generate_weapp、Svelte 走 figma_generate_svelte"，更新绝对规则 #10；experimental 工具的使用警示
3. CLI 配套：新增 `svelte` 命令（committed），`uniapp`/`taro` 随实验特性；全部帮助文本走 i18n 中英双语（v1.4.13 踩过 i18n 路径 bug，新增 key 必须双语补齐 + help 快照）
4. batch_generate 的 framework 枚举扩展（react/vue/svelte）+ smoke schema 契约同步
5. GUI 框架偏好页增加小程序/Svelte 选项；GUI 仍只监听 127.0.0.1 + Origin 白名单
6. examples/：更新 weapp-demo，新增 svelte-demo；新增《小程序开发指南》独立文档（含合法域名、包体积、开发者工具调试说明）
7. 新增 CHANGELOG.md（仓库当前不存在），决定历史版本回填粒度

---

## 四、执行级 WBS（任务领取、依赖与验收）

### 4.1 执行规则

- 单任务控制在 **0.5–2 个开发日**；超过 2 天必须继续拆分，不能以“功能完成”代替可验收产出。
- 每个任务必须同时定义：代码产出、测试产出、文档/契约产出、依赖和验收命令。仅改代码不计完成。
- **DoR（可开始）**：输入 schema/产物示例已定；依赖任务契约已合入；验收 fixture 已准备。
- **DoD（可完成）**：单测/快照通过；类型检查与构建通过；相关文档和 i18n 已同步；无新增未解释 warning；主任务验收场景通过。
- WBS 是执行清单，第三章是技术方案；二者冲突时先修改本章任务边界，再更新方案，避免“方案很全、没人能领”。

### 4.2 容量与切范围

| 项目 | 约束 |
|---|---|
| 排期成立条件 | **2 名开发 × 5 周（每人 25 工作日）= 50.0 个开发日上限**；另配 **0.5 QA（约 12.5 QA 日）**，WBS-R1 手工冒烟占 1.5 QA 日。WBS 开发负载实测 50.0 日（4.7 汇总表），**开发缓冲为 0**；4 周日历口径只有 40 开发日，天然装不下 |
| 第 1 天容量闸门 | 若不足上述投入（或只能给 4 周），立即重排：不能保留原日期继续承诺全部 Committed，按下方切序砍至容量内并同步修改第二章版本定位 |
| 单人/低容量建议切序 | 先切 WBS-P2-41 → P2-31/32 → P2-21/22 → P2-11/12/13 → P1-11/12/13/14；保留微信小程序、Watch/Compare、测试与发布闭环，并同步修改版本定位 |
| 执行中超时处理 | 缓冲为 0，任一任务超估当日登记阻塞；超时累计达 1 开发日即启动一次切序决策，**不顺延发布日、不挤占 P0/P1**（由版本负责人拍板，记录在案） |
| 已预降级 | uni-app、Taro、Watch 节点级增量、automator 闸门默认不启动（决策时点见第三章 Stretch 节）；Phase 1 未过可运行性闸门时 experimental 全部取消 |

### 4.3 WBS-G：基线与发布治理

| ID | 任务（含子步骤） | 产出 | 依赖 | 验收 | 估算 |
|---|---|---|---|---|---|
| WBS-G0 ✅完成 2026-10-13 | 冻结真实基线：保存 npm test 汇总；核对 23 工具、32 CLI 声明、11 样式描述符；同步 package-lock 版本 | `audit-baseline.md` 或 CI 检查脚本 | 无 | package.json/lock 均 1.4.20；测试基线 520 有可复核输出 | 1d |
| WBS-G1 ✅完成 2026-10-13 | 建立一致性脚本：版本号、工具表、CLI init、animation/interaction 假工具名 | `scripts/check-release-consistency.mjs` | WBS-G0 | 人为制造一处漂移时脚本非 0 退出 | 1.5d |
| WBS-G2 ✅完成 2026-10-13 | 发布包检查：npm pack --dry-run、依赖审计、回滚/弃用策略（pack 464 files/4.2MB，npm audit 0 漏洞；发布执行仍归 WBS-R2） | 发布清单结果 | WBS-G1、WBS-R1 | tarball 文件清单正确；rollback 文档不依赖“重新发布同版本” | 1d |

### 4.4 WBS-P0：微信小程序可运行闭环

| ID | 任务（含子步骤） | 产出 | 依赖 | 验收 | 估算 |
|---|---|---|---|---|---|
| WBS-P0-11 ✅完成 2026-10-10 | 列表/条件数据模型：重复组、wx:key、if/elif/else、block；定义 placeholder data schema | 推断器 + 类型 + fixtures | 无 | ≥10 例；默认推断可一键关闭；不把任意相似节点误判为列表 | 1.5d |
| WBS-P0-12 ✅完成 2026-10-10 | WXML/JS 代码生成：wx:for/wx:if/block 与 data 输出 | weapp-generator 补丁 + 快照 | WBS-P0-11 | 生成的 WXML/JS 可被开发者工具解析；嵌套循环无作用域污染 | 1.5d |
| WBS-P0-21 ✅完成 2026-10-09 | 资源状态机与 manifest：resolved/unresolved、hash 命名、去重 | `weapp-assets` 服务/类型 | 无 | unresolved 永不输出空 src；临时 Figma URL 有专门错误 | 1d |
| WBS-P0-22 ✅完成 2026-10-09 | local/cdn/base64 三模式与 CLI 落盘；稳定 CDN 校验 | assetMode 实现 | WBS-P0-21 | 三种模式快照；MCP 默认不写盘；CLI 相对路径正确 | 1.5d |
| WBS-P0-23 ✅完成 2026-10-10 | 主包体积核算、1.5/2MB 阈值、分包建议 | bundle 报告 | WBS-P0-22 | 阈值以全主包计；超限阻断并给 subpackages JSON 建议 | 1d |
| WBS-P0-31 ✅完成 2026-10-09 | SVG/image-local/image-cdn/base64 图标分支 | WXML 安全图标渲染 | WBS-P0-21 | SVG 不产生内联 `<svg>`；四类边界样例均有产物与 warning | 1d |
| WBS-P0-41 ✅完成 2026-10-10 | 首日冻结目标基础库版本（官方分布页截图存档）；登记 ≥80 属性映射清单；WXSS 降级器 | 版本冻结记录 + 属性清单 + rules + warnings/report | 无 | 每条限制至少正反 2 例；清单条目可追溯官方文档链接；报告可追溯原属性和降级结果 | 1.5d |
| WBS-P0-51 ✅完成 2026-10-10 | 原生组件映射：scroll-view/swiper/rich-text/picker 等 | 组件映射表 | WBS-P0-41 | 每组件快照；错误嵌套和无效属性不输出 | 1d |
| WBS-P0-52 ✅完成 2026-10-10 | 事件映射：bind/catch/input/change/submit、properties/methods/triggerEvent | Page/Component JS 模板 | WBS-P0-51 | 每事件至少 1 例；基础库能力矩阵决定 aria 属性去留 | 1d |
| WBS-P0-61 ✅完成 2026-10-09 | frameWidth→rpx 推断、参数覆盖、基准不一致 warning | design-width resolver | 无 | 375/414/750 + 手动覆盖快照 | 0.5d |
| WBS-P0-71 ✅完成 2026-10-10 | 页面 JSON、app.json/project.config.json 建议、CLI 四件套落盘 | 配置片段/落盘命令 | WBS-P0-22 | 自动工程改写为 0；路径越权拒绝；输出 JSON 可解析 | 1d |
| WBS-P0-81 ✅完成 2026-10-10 | 方案 B 还原度：映射属性清单、分母/排除项、覆盖率报告 | fidelity-wxss 指标 | WBS-P0-41 | 6 张黄金 fixture 覆盖率 ≥85%（实测 86/100/93.2/93.3/95.6/100）；排除项不进入分母但可见；评审模板随任务产出 | 1d |
| WBS-P0-82 ✅完成 2026-10-10 | weapp-demo 完整页面 + 微信开发者工具人工脚本 | demo/操作清单/截图 | WBS-P0-12/23/31/52/61/71/81 | 含图片列表、表单、条件块；local 默认可运行，cdn/base64 各有明确前置条件 | 1d |

### 4.5 WBS-P1：Svelte 与同步体验

| ID | 任务（含子步骤） | 产出 | 依赖 | 验收 | 估算 |
|---|---|---|---|---|---|
| WBS-P1-11 ✅完成 | svelte-generator：模板、props、if/each、事件 | `svelte-generator.ts` | structured_data | 核心语法快照 25 例；Svelte 4 默认、5 runes 仅建议（编译器抓出 void 标签等 2 处真实缺陷已修） | 2d |
| WBS-P1-12 ✅完成 | 样式与资源适配：tailwind/unocss/css-modules 兼容形态 | 样式分支 | WBS-P1-11 + style registry | 非法组合 7 例触网前报错；css-modules 非 hash 语义写入描述并静态展开 composes | 1d |
| WBS-P1-13 ✅完成 | MCP/CLI/batch_generate/schema/i18n 接入 | `figma_generate_svelte` + `svelte` | WBS-P1-11 | smoke 工具清单 24、schema、中英 help 快照同步、闸门 13/13 | 1d |
| WBS-P1-14 ✅完成 | Svelte fixtures、示例与 dev 运行验证 | 35 专项测试 + svelte-demo | WBS-P1-12、WBS-P1-13 | svelte/compiler v4 三组合编译全绿；svelte-demo vite build 通过；dev 浏览器渲染待 QA | 1d |
| WBS-P1-21 ✅完成 | Watch 会话状态机与工具协议（5 会话/幂等/write-outputDir 互斥） | `watch/watch-store.ts` | 无 | 17 例：状态迁移/重复 start/stop 幂等/超限/互斥/跨 client 隔离 | 1d |
| WBS-P1-22 ✅完成 | depth=1 bypass 粗筛 + 429 退避（10s×2 封顶 120s）+ 720 req/h 额度注释 | `watch/watch-poller.ts` + `FigmaClient.probeFileMeta` | P1-21 | 伪时钟 5 例：退避窗口不探针/恢复/调度延迟 | 1.5d |
| WBS-P1-23 ✅完成 | write 路径校验 + 全量备份 + 三语注释 preserve 合并（fail-open） | `watch/watch-safe-writer.ts` | P1-22 | 8 例真实临时目录：越权 0 写入/备份可恢复/标记不配对保留旧文件 | 1.5d |
| WBS-P1-24 ✅完成 | JSON Pointer（~0/~1）旁路、数组整体替换、fail-open | `watch/watch-json-merge.ts` | P1-23 | 7 例：嵌套/转义/数组替换/非法 JSON 不覆盖 | 1d |
| WBS-P1-25 ✅完成 | SIGTERM/SIGINT/disposeAll 清理（无残留 timer） | `watch/watch-manager.ts` | P1-21 | 伪调度器验证多会话定时器全清；会话仅内存态 | 1d |
| WBS-P1-26 ✅完成 | react/vue/svelte/weapp 四框架适配 + 再生成编排 | `watch/watch-manager.ts`/`watch-regenerate.ts` | P1-25、P1-13、P0-12 | 6 例：四框架会话/变更触发再生成/unavailable 拒绝（当前四框架均就绪） | 0.5d |
| WBS-P1-31 ✅完成 | LCS unified diff（hunk+上下文）+ added/removed/changed/unchanged 契约 | `compare/compare-code.ts` + `figma_compare_code` | 无 | 行级 diff/多文件/1000 行 P95<100ms | 1d |
| WBS-P1-32 ✅完成 | Prettier 归一化（fail-open）+ 文件级行 stats | compare pipeline | P1-31 | 仅格式差异判 unchanged；parser 失败按原文 | 1d |
| WBS-P1-33 ✅完成 | 路径越权/512KB/二进制三重安全 + 多产物对比 | compare 适配 + MCP 工具 | P1-32、P1-23 | 越权拒绝/超限/NUL 嗅探；weapp 四件套按 basename 配对 | 0.5d |

### 4.6 WBS-P2：能力落地

| ID | 任务（含子步骤） | 产出 | 依赖 | 验收 | 估算 |
|---|---|---|---|---|---|
| WBS-P2-11 ✅完成 2026-10-12 | 组件库规则/Props/置信度模型与 60 节点标注集（新增 [component-library/](src/services/component-library/)：7 组件×4 库 registry、role40+名称35+结构25 评分、保守门控 70 单一信号绝不替换、62 节点标注 fixture 与评测器，4 库识别率 100%/Props 92-96%/误替换恒 0；26 例核心单测） | mapping registry | 无 | 阈值可复现；误替换统计可输出 | 1.5d |
| WBS-P2-12 ✅完成 2026-10-12 | React：shadcn/ui、Ant Design、components.json import（generateJsxFromContext 接线：kebab 标签替换+Props 注入、antd 单包聚合/shadcn @/components/ui 子路径分组+组合式骨架 import、文本叶子内联、auto 读 package.json/components.json 取证、跨框架选择 FDT-UI-LIB-* 显式报错；9 例端到端） | jsx-generator | WBS-P2-11 | 保守模式误替换 0；none 完全关闭 | 1.5d |
| WBS-P2-13 ✅完成 2026-10-12 | Vue：Element Plus、Ant Design Vue（vue-generator 接线：el-*/a-* kebab 标签、单包命名 import、renderVuePropAttr 模板属性口径——danger 布尔/antdv default-active-key/element v-model 不臆造、Vue2 Options API components 注册；CLI/MCP/batch --componentLibrary 全链路+zod 枚举冻结+中英 help 快照；15 例端到端+8 例项目探测） | vue-generator | WBS-P2-11 | 与 React 共用标注集口径；Vue 2/3 import 正确 | 1.5d |
| WBS-P2-21 ✅完成 | Web 富文本行内样式、链接、列表、大小写 | `weapp-compat/rich-text-model.ts`（70 测试/50 标注样本，误识别率 0） | 无 | ≥50 段样本；误识别率 <10% | 1.5d |
| WBS-P2-22 ✅完成 | WXML rich-text nodes 构造、XSS、简单 text 分流 | `weapp-compat/rich-text-wxml.ts`（13 例）+ 生成器接线 | WBS-P2-21、WBS-P0-51 | `nodes="{{richXxxNodes}}"` JS data 绑定；href 白名单拒绝 javascript:；文本走数据叶子无 JSX-like 输出 | 1d |
| WBS-P2-31 ✅完成 2026-10-12 | responsive 推断与骨架渲染（新增 [responsive-inferrer.ts](src/services/responsive/responsive-inferrer.ts)：mobile-first md:/desktop-first sm: 前缀冻结；列转行/字号/间距/栅格列数 4 类信号，宽子项卡片行（≥280px×3）与窄导航行区分；竖排窄内容零信号不臆造；buildResponsiveClasses 节点级 base/breakpoint 合并去重） | responsive inferrer | 无 | 移动/桌面 fixtures 各 3（共 13 例含 safe-area/组装）；无信号负例 | 1.5d |
| WBS-P2-32 ✅完成 2026-10-12 | safe-area H5（env(safe-area-inset-*) 四方向 CSS 声明）/小程序（wx.getSystemInfoSync().safeArea 差值 JS + WXML style 绑定建议）双形态 | 生成片段（纯函数） | WBS-P2-31 | 两形态片段断言；小程序片段不含 env() | 0.5d |
| WBS-P2-41 ✅完成 2026-10-12 | CSS Variables renderer 骨架（新增 [css-variables-renderer.ts](src/services/style-renderers/css-variables-renderer.ts)：7 分类前缀冻结 --color-/--spacing-/--radius-/--font-size-/--font-weight-/--line-height-/--shadow-；kebab 规范化、tokens→:root 块（分类固定序+同名 last-wins）、value→var() 映射；CssVariablesRenderer.renderNode 显式抛 planned 1.5.0）；注册表保持 planned、工厂不接线、枚举零变化 | renderer skeleton + 桶出口 | 无 | 15 例全绿；available=10/planned=1 契约不变；工厂对 css-variables 抛 not implemented | 1d |

### 4.7 WBS-P3/P-R：质量与发布

| ID | 任务（含子步骤） | 产出 | 依赖 | 验收 | 估算 |
|---|---|---|---|---|---|
| WBS-P3-11 ✅完成 2026-10-13 | 性能基线脚本与基准数据（同日采集 React 生成 1x 耗时，供"小程序 ≤1.5x"对比） | 1000 节点 baseline + React 基线 | 无 | 预热 1 次、5 次中位数、耗时/内存均记录；React/weapp 同机同 fixture | 1d |
| WBS-P3-12 ✅完成 2026-10-13 | 优化 Token 记忆化、空间索引、受控并发 | 优化 patch | WBS-P3-11 | ≥20% 提速、内存 ≤+5%；30% 为目标值。实测 React 373.88→225.67ms（**-39.6%**）、weapp 50.22→28.32ms（-43.6%）、weapp/react 0.125x（目标 ≤1.5x）、retained +0.2MB 内、产物字节一致 | 2d |
| WBS-P3-21 ✅完成 2026-10-13 | 各 WBS 测试汇总、回归、去重；fixtures/LICENSES.md 登记核对；静态新增 vs 实跑增量对账 | ≥620 全绿 | WBS-P0/P1/P2 全部 | 保存 Vitest 汇总；覆盖率口径通过；每个 fixture 有授权条目。实测 **1055/1055（81 文件）**，静态 916/实跑 1055 对账零异常 | 2d |
| WBS-P3-31 ✅完成 2026-10-13 | README/SKILL/QUICKSTART/小程序开发指南/示例/i18n key 与 help 快照 | 文档与示例 | WBS-P0-82、WBS-P1-14、WBS-P2-* | WBS-G1 一致性脚本全绿；中英 help 快照同步。实测一致性 **13/13** | 1.5d |
| WBS-P3-32 ✅完成 2026-10-13 | GUI 框架偏好页加小程序/Svelte 选项（仍只监听 127.0.0.1 + Origin 白名单）；新建 CHANGELOG.md 骨架并定历史回填粒度 | GUI 补丁 + CHANGELOG | WBS-P1-13、WBS-P0-82 | GUI 手工验证记录入 WBS-R1；CHANGELOG 存在（CI 不审内容）。另完成组件库 chip 选择器（react/vue，写入 figma-dev.config.json，浏览器实测 9 检查点全过） | 0.5d |
| WBS-R1 ⏳待验收 2026-10-13（自动化完成，人工项待 QA） | 手工冒烟（**QA 执行，计 QA 日**）：微信开发者工具、Svelte dev、Watch（4 框架）、Compare、GUI 新选项、React/Vue 回归 | 冒烟记录/截图 | WBS-P3-21、WBS-P3-32 | 清单逐项有结果；失败有 issue 和阻塞判断。清单与记录：docs/QA-R1-smoke-checklist.md；自动化 10 例入 test/smoke/r1-qa.smoke.test.ts；微信开发者工具 6 场景 2026-10-12 已过；§4.2–4.5 人工项待 QA 签字 | 1.5d（QA） |
| WBS-R2 | pack、Gitee Release、版本锁定、弃用/补丁回滚演练 | 发布包/Release | WBS-R1、WBS-G2 | 不运行会二次 bump 的 `npm version`；失败不复用同版本号 | 1d |

**WBS 汇总（v2.1 重算，开发/QA 分列）：**

| 分组 | 任务数 | 开发日 | QA 日 | 说明 |
|---|---|---|---|---|
| WBS-G（治理） | 3 | 3.5 | — | G0/G1/G2 |
| WBS-P0（小程序闭环） | 13 | 14.5 | — | P0-11…P0-82 |
| WBS-P1（Svelte/Watch/Compare） | 13 | 14.0 | — | 原 12 个 13.5d + 新增 P1-26 0.5d |
| WBS-P2（能力落地） | 8 | 10.0 | — | |
| WBS-P3（质量/文档） | 5 | 7.0 | — | P3-31 拆为 31（1.5d）+ 32（0.5d），总量不变 |
| WBS-R2（发布执行） | 1 | 1.0 | — | 开发执行 |
| WBS-R1（手工冒烟） | 1 | — | 1.5 | **QA 执行，不占开发日** |
| **合计** | **44** | **50.0** | **1.5** | |

- 对账结论：开发负载 **50.0 人日** = 2 名开发 × 5 周（25 工作日）容量上限，缓冲为 **0**；WBS-R1 移交 QA 后不再混在 51 开发日里（v2 的 51 是把 QA 冒烟算成开发日且未含 P1-26/P3-32 拆账所致）。
- 缓冲策略：任何任务超时**不顺延日历**，立即按 4.2 预设切序砍范围；4 周口径（仅 40 开发日）在第 1 天容量闸门即触发重排，不得带着 50.0 负载承诺 4 周交付。
- 估算不含跨人 review/联调会议；该部分默认在每个任务的 0.5–2d 内自行消化，若实际占用导致偏差，同样按切序处理。
- 执行状态只允许 `未开始 / 进行中 / 待验收 / 完成 / 阻塞`，阻塞必须写明依赖任务 ID，不用百分比表示进度。

## 五、排期（4-5 周，容量假设）

```
Phase 1（第 1-2 周）微信小程序补齐
├── P0-1.1 列表/条件渲染      ├── P0-1.2 资源管线/包体积
├── P0-1.3 SVG 策略           ├── P0-1.4 WXSS 降级矩阵
├── P0-1.5 组件/事件补齐       ├── P0-1.6 designWidth 推断
└── P0-1.8 验收度量（方案 B 发布闸门；automator 仅 Stretch）
（P0-1.7 配置建议贯穿，碎片时间完成）

Phase 2（第 2-3 周）第三框架 + 同步体验
├── P1-1 Svelte（含 CLI/batch 枚举）
├── P1-2 Watch（先落架构决策与全量模式）
└── P1-3 Compare

Phase 3（第 3-4 周）功能打磨
├── P2-1 组件库映射落地   ├── P2-2 富文本（含 rich-text）
├── P2-3 响应式骨架       ├── P2-4 css-variables 骨架
└── Stretch：uni-app / Taro experimental（人力富余才启动，默认顺延 1.4.21）

Phase 4（第 4-5 周）质量与发布
├── P3-1 性能基线+优化    ├── P3-2 测试 ≥620
├── P3-3 文档/示例/i18n/GUI 配套
├── 全量回归 + 数字冻结   └── 发布
```

里程碑闸门：Phase 1 结束时 weapp 产物必须能在微信开发者工具跑通含图片的列表页，否则 Phase 3 的 experimental 全部取消、人力回补小程序。

---

## 六、发布检查清单（v2 修正）

- [ ] 功能测试：所有新功能对应单测；用例总数 ≥620（以 vitest run 实际计数为准并回填文档）
- [ ] `npm run build` / `tsc --noEmit` 0 错误；`npm run test`、`npm run test:smoke` 全绿
- [ ] **工具清单闸门**：`mcp-tools.smoke.test.ts` 枚举 = 实际注册数（28 或 30），README/SKILL 工具表与之一致；animation/interaction 不再以工具名出现
- [ ] **版本号一致性闸门**：package.json、package-lock.json（根包与 `packages[""]`）、README（中英）、SKILL、QUICKSTART、MCP title/description、CLI 输出全部 = 1.4.20（脚本扫描）；package 已提前 bump 时**禁止再运行会二次递增的 `npm version`**，用 `npm install --package-lock-only` 同步锁文件后校验
- [ ] 数字口径：CLI 22 顶层/32 声明、编辑器 8、样式 9+1+1、一级框架 4
- [ ] 手动冒烟（无法进 CI 的 GUI 工具）：微信开发者工具运行（local 默认；cdn/base64 分别验证前置条件）、Svelte dev 运行、Watch preserve 合并、Compare 多文件输出、React/Vue 回归
- [ ] experimental 特性：工具描述带实验性标注、文档有免责声明、开关默认关闭
- [ ] 文档与示例：README/SKILL/QUICKSTART、小程序开发指南、weapp-demo/svelte-demo、CHANGELOG.md
- [ ] `npm audit` 0 漏洞；现有 optionalDependencies 缺省时降级路径有测试；若 Stretch 的 automator 已落地，再增加其 optional 缺省降级测试
- [ ] 发布：确认版本已为 1.4.20 → `npm pack --dry-run` → Git tag v1.4.20 → `npm publish` → **Gitee** Release（仓库仅托管 Gitee；如无 GitHub 镜像则删除"GitHub Release"项）
- [ ] 回滚：首选 `npm deprecate` + 发布修复 patch，禁止把“删除 tag/重新发布同版本”当常规回滚；仅误发/安全事故才评估 unpublish，并记录 72h 政策、同名版本 24h 不可重发风险、MCP 用户版本锁定说明

---

## 七、风险与应对（v2 更新）

| 风险 | 概率 | 应对 |
|---|---|---|
| 小程序合法域名/包体积导致产物"能生成不能跑" | 中 | local 默认 + cdn/base64 显式前置条件 + 全主包阈值拦截；Phase 1 闸门卡可运行性 |
| miniprogram-automator 在 CI/无头环境不稳定 | 中 | 方案 B（WXSS 覆盖率+人工评审模板）保底；automator 走 optionalDependencies |
| Watch 写盘覆盖用户代码 | 中 | 默认不写盘；全量重写为默认，增量 opt-in；preserve 合并 + 生成前备份；路径越权校验 |
| Svelte 4/5 语法口径分歧 | 中 | 默认 Svelte 4 语法，5 runes 仅注释建议；工具描述写明 |
| 4-5 周仍超期 | 中 | uni-app/Taro/节点级增量已预先降级；Phase 1 闸门再砍 Phase 3 stretch |
| 工具数膨胀致 Agent 选错（23→28/30） | 中 | SKILL 路由规则同步更新；v1.5.0 评估收敛为统一 `figma_generate` + framework 参数 |
| 组件库映射误替换致代码不可用 | 低 | 保守模式默认、高置信才替换、可一键 `none` 关闭 |
| 性能优化比例无基线不可证 | 低 | Phase 4 先建 5 次中位数基线；Committed 只承诺 -20%，-30% 保留为目标值 |

---

## 八、成功指标（v2 统一）

**功能**
- 微信小程序：按已冻结映射清单计算的基础组件 WXSS 属性覆盖率 ≥85%（排除项逐项披露）；产物可在微信开发者工具直接运行。automator pixel diff 只在稳定后作为附加指标
- Svelte：语法正确（Svelte 4 口径）；**样式还原量化线 = 在 React/Svelte 共享 fixture 集上，样式属性命中率不低于 React 管线同集结果的 90%**（WBS-P1-14 用同一批 fixtures 出对比报告）
- 组件库映射：标注 fixtures 上识别率 ≥70%、Props ≥60%
- Watch：变更检测 ≤10s；preserve 区块 0 误删、JSON 冲突 0 静默覆盖、路径越权 0 写入

**质量**
- 测试用例 ≥620（stretch 640；实跑基线 520 + 新增 ≥102），新增/修改源码 lines+branches 覆盖率 ≥80%
- **回归 bug 率**：统一定义 = 发布后 30 天内 Gitee issue 标记 `regression` 的工单数 ÷ 本版本变更任务数；v1.4.19 同期基线由**版本负责人在 Phase 1 结束前补采**，补采不到则本期只登记绝对值、不写"不高于 v1.4.19"的对比结论
- 富文本：列表/链接识别率 ≥80% 且**误识别率 ≤5%**（50 段标注样本上双指标一起报）
- npm audit 0 漏洞；文档/代码/快照三处数字一致

**性能**
- 1000 节点设计稿相对 Phase 4 基线耗时 **Committed -20% / 目标 -30%**，内存增幅 ≤5%
- 小程序生成耗时 ≤ React 生成 1.5x

**规模（统一口径后的真实数字）**
- MCP 工具：**23 → 28**（committed：`figma_generate_svelte` / `figma_watch_start` / `figma_watch_stop` / `figma_watch_status` / `figma_compare_code`）；`figma_generate_uniapp` / `figma_generate_taro` 落地则 30
- 一级框架：2 → **4**（React / Vue / 微信小程序 / Svelte）；uni-app/Taro 标 experimental 不计入
- 样式：9 套新管线可插拔维持不变，css-variables 骨架就绪（仍 planned）

**采纳度（新增，发布后 30 天采集）**
- npm 周下载量、生成类工具报错率、Watch 周活跃会话数；当前均无历史基线，发布时只登记起点值，不设增长目标；作为 v1.5.0 取舍依据
- "开源唯一支持小程序的 MCP D2C 工具"类宣传语发布前重新核验竞品

**度量治理（v2.1 补：责任人与采集时点）**

| 指标组 | 责任人 | 采集/冻结时点 |
|---|---|---|
| 基础库版本、≥80 属性清单、6 黄金截图 WXSS 覆盖率 | P0 负责人 + 2 名评审人 | 版本冻结于 WBS-P0-41 首日；覆盖率于 Phase 1 闸门 |
| 测试 ≥620、覆盖率 ≥80%、数字一致性 | 值班开发（WBS-P3-21） | RC 候选日，保存 vitest 汇总行回填 |
| 性能 -20%、React/weapp 1.5x | P3 负责人 | 基线在 Phase 4 首日（WBS-P3-11），结论在 RC |
| 回归 bug 率 v1.4.19 基线 | 版本负责人 | Phase 1 结束前补采，采不到按"只登记"处理 |
| 采纳度三项 | 版本负责人 | 发布后第 30 天 |
| 竞品宣传核验 | P3-31 执行人 | 发布前 3 天内重新检索，留链接截图 |

任何指标在时点拿不到数据，允许标"无基线/未采集"，**禁止用估算值充当实测值**。

---

## 九、v1.5.0 展望（不变项 + 新增）

1. CSS Variables 完整支持（@layer、容器查询，转 available）
2. 统一 `figma_generate` 入口 + framework 参数，收敛工具数量
3. uni-app / Taro 从 experimental 转一级（视反馈）
4. TabBar 自动识别与配置生成
5. Figma Dev Mode API 深度集成、实时 side-by-side 预览画布、Companion 插件
6. Token 双向同步回 Figma Variables、CI/CD 设计-代码同步检查、Angular/SolidJS 一级支持

---

## 附录 A：新工具 inputSchema 与错误码契约（v2.1 开工冻结稿）

> 本附录是 WBS-P0-21 / P1-13 / P1-21 / P1-31 的 DoR 输入。字段**名称冻结**：允许新增可选字段；删字段或改语义必须同步更新 smoke schema 快照并在工具 description 注明。所有入参经 zod 校验，非法入参返回 MCP 标准错误（`isError: true` + 错误码），错误文案走 i18n，不允许把英文异常直接抛给用户。

### A.1 通用约定

- 定位符：沿用现有工具——`figmaUrl` 或 `fileKey + nodeId` 二选一（复用 parse_url 归一化），由 zod superRefine 做互斥校验
- `inference` / `skipEnhancements` / `maxDepth` 等增强开关直接复用 generate_jsx 的现有 schema，不造同义字段
- 错误码结构：`FDT-<DOMAIN>-<KEBAB-CODE>`，`DOMAIN ∈ WEAPP | ASSET | SVELTE | WATCH | COMPARE`。首批冻结码：

| 域 | 错误码 | 触发语义 |
|---|---|---|
| WEAPP | `BUNDLE-EXCEEDED` | 主包 >2MB 阻断（CLI 退出码 2） |
| WEAPP | `LIBVERSION-TOO-LOW` | 工程基础库低于冻结版本且用到门槛能力 |
| ASSET | `TEMP-SIGNED-URL` / `FETCH-FAILED` / `SIZE-LIMIT` / `MISSING-PUBLIC-BASE-URL` | 与 manifest `unresolved.reason` 一一同名 |
| WATCH | `MISSING-OUTPUT` / `OUTPUT-WITHOUT-WRITE` / `TOO-MANY-SESSIONS` / `FRAMEWORK-UNAVAILABLE` / `SESSION-NOT-FOUND` | 见 P1-2 决策 1/6/8 |
| COMPARE | `PATH-TRAVERSAL` / `INPUT-TOO-LARGE` / `BINARY-UNSUPPORTED` | 越权 / 超 512KB / 二进制内容 |

- i18n key 规范：`errors.<domain-lower>.<code>.title` 与 `.detail`（例：`errors.watch.missing-output.title`），zh-CN / en-US 必须同 PR 提交；CLI 每个新增 flag 同步进 help 快照测试（v1.4.13 i18n 路径 bug 的既有教训）

### A.2 `figma_generate_svelte`

```ts
z.object({
  figmaUrl: z.string().optional(),       // ┐
  fileKey: z.string().optional(),        // ├ 定位三字段按通用约定互斥
  nodeId: z.string().optional(),         // ┘
  componentName: z.string().min(1),
  styleFormat: z.enum(['tailwind', 'unocss', 'css-modules']),
  // css-modules 在 Svelte 形态 = scoped <style>，不承诺 hash/composes（description 必须写明）
  inference: inferenceSchema.optional(),
  skipEnhancements: z.boolean().optional(),
  maxDepth: z.number().int().min(1).max(15).default(8),
});
```

### A.3 Watch 三件套

```ts
const watchStartInput = z.object({
  fileKey: z.string().min(1),
  nodeId: z.string().min(1),
  framework: z.enum(['react', 'vue', 'svelte', 'weapp']),
  styleFormat: z.string().optional(),        // 按 framework 复用现有枚举二次校验
  vueVersion: z.union([z.literal(2), z.literal(3)]).optional(),
  pollIntervalMs: z.number().int().min(3000).max(60000).default(5000),
  write: z.boolean().default(false),
  outputDir: z.string().optional(),          // 仅 write=true 时必填
}).superRefine((v, ctx) => {
  if (v.write && !v.outputDir)        ctx.addIssue({ code: 'custom', message: 'FDT-WATCH-MISSING-OUTPUT' });
  if (!v.write && v.outputDir)        ctx.addIssue({ code: 'custom', message: 'FDT-WATCH-OUTPUT-WITHOUT-WRITE' });
});
// 成功返回：{ sessionId, state: 'running', pollIntervalMs, write, framework, startedAt, lastChangedAt? }
// 同 client 对同 fileKey+nodeId+framework 重复 start：幂等返回已存在会话，不新建轮询

const watchStopInput   = z.object({ sessionId: z.string().min(1) });
// 幂等：会话不存在或已停止都返回 { sessionId, state: 'stopped' }，不作为错误

const watchStatusInput = z.object({ sessionId: z.string().optional() });
// 省略 sessionId = 列出当前 client 自己的会话；传未知 id 才返回 SESSION-NOT-FOUND
```

### A.4 `figma_compare_code`

```ts
z.object({
  framework: z.enum(['react', 'vue', 'svelte', 'weapp']).default('react'),
  // 现状侧三选一：单文件文本 / 单文件路径 / 多产物（weapp 必须此项且 4 个 path）
  currentCode: z.string().optional(),
  currentFilePath: z.string().optional(),
  currentFiles: z.array(z.object({ path: z.string(), code: z.string().optional() })).max(8).optional(),
  // 生成侧：figmaUrl 定位 + 与该框架生成器相同的可选参数；二选一互斥由 superRefine 校验
  figmaUrl: z.string().optional(),
  styleFormat: z.string().optional(),
  inference: inferenceSchema.optional(),
}).superRefine(/* 单文件 vs 多文件互斥；currentFilePath/currentFiles.path 过 security.ts；
                  输入总字节 > 512KB → INPUT-TOO-LARGE；嗅探到二进制 → BINARY-UNSUPPORTED */);
// 返回：{ summary: { files, added, removed, changed },
//         files: [{ path, status: 'added'|'removed'|'changed'|'unchanged', unifiedDiff, stats }] }
```

### A.5 asset manifest

字段 schema 以 P0-1.2 的 jsonc 定义为准（`id/figmaRef/kind/state/reason/localPath/publicUrl/sha256/bytes/mime/pixelRatio/scene`）；`reason` 枚举与 A.1 的 `ASSET` 错误码同名一一对应，MCP 返回的 warnings 数组中每条必须同时给 `code`、`assetId` 与 i18n 文案。

---

*v2 核心调整：一切计数以 2026-10-09 代码审计为基线；微信小程序按"差距补齐 + 能运行 + 可度量"实施；uni-app/Taro 不再以 P0 承诺；Watch/Compare 先定架构边界再做功能。*

*v2.1 补强：开发/QA 容量账分列重算（50.0 + 1.5 人日，44 任务）；Watch 补 outputDir 互斥、轮询额度与并发隔离；新增 asset manifest schema、基础库冻结规则、附录 A 工具契约；范围与成功指标数值不变。*
