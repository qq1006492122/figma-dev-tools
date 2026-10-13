# 微信小程序示例项目（WBS-P0-82）

figma-dev-tools 小程序生成能力的**人工验证工程**。该页面为手工编写的完整页面，
覆盖生成器承诺的全部典型结构：**图片列表（wx:for）、表单（form bindsubmit /
input bindinput / switch bindchange）、条件块（wx:if / wx:else）、本地图片资源**。

## 1. 在微信开发者工具中打开（local 模式，零外网依赖）

1. 打开「微信开发者工具」，选择「导入项目」。
2. 目录选择本文件夹（`examples/weapp-demo`）。
3. AppID 选择「测试号」（`project.config.json` 中为 `touristappid` 占位）。
4. 基础库版本选择 **3.1.5 或以上**（冻结兼容基线，见
   [docs/weapp-baseline/client-lib-baseline.md](../../docs/weapp-baseline/client-lib-baseline.md)）。
5. 编译后应直接看到首页：顶部绿色 logo、搜索框、4 件商品的图片列表。

`images/` 下的图片为仓库内置的本地占位图（合计约 3 KB），**默认 local 模式无需任何
网络配置即可运行**。

## 2. 页面功能对照

| 区块 | 小程序能力 | 触发处理 |
|---|---|---|
| 头部 logo | 本地 `<image>` | — |
| 搜索框 | `form bindsubmit` + `input bindinput` | `onSearchSubmit` / `onKeywordInput` |
| 仅看有货 | `switch bindchange` | `onStockToggle` |
| 商品列表 | `wx:for` + `wx:key="id"`，本地图片 | 数据 `filteredList` |
| 库存标签 | `wx:if` / `wx:else` 条件块 | `item.stock > 0` |
| 加购按钮 | `bindtap` + `data-id` | `onAddTap`（售罄商品给提示） |
| 空态 | 与列表互斥的 `wx:if` / `wx:else` | 过滤结果为 0 时展示 |

## 3. 资源三种模式的前置条件与切换

生成器位图模式 `--asset-mode` 与图标策略 `--icon-strategy` 的对照（本 demo 始终以
local 模式运行；以下说明用于验证生成产物接入）：

| 模式 | 前置条件 | 适用场景 | 不满足时的表现 |
|---|---|---|---|
| `local`（默认） | 无；CLI 落盘到 `--output/images/`，路径 `/images/<scene>/<sha12>-<name>.<ext>` | 开发者工具本地编译 | — |
| `cdn` | ① 必须提供 `--public-base-url <https-url>`（**稳定** HTTPS 基址，自己的 CDN/对象存储）；② 先把 `images/` 同步到该基址；③ 开发者工具需勾选/配置对应合法域名 | 上线包瘦身、资源独立缓存 | 缺基址 → 资源标记 `MISSING_PUBLIC_BASE_URL`，`<image>` 移除 src；**临时 Figma 签名 URL 一律拒绝**（`TEMP_SIGNED_URL`） |
| `base64` | 仅小图标/小图：单文件 ≤ 2KB（图标，超限按策略回退）、位图去重后累计 ≤ 50KB | 图标内联、零网络请求 | 超限 → `SIZE_LIMIT`，该资源移除 src 并给 warning |

CLI 切换示例（`--output` 即小程序工程根；产物会直接写入其 `images/` 与四件套目录）：

```bash
# local（默认，与本 demo 一致）
figma-dev weapp <figma-url> -n <nodeId> --name GoodsList --page --output ./examples/weapp-demo

# CDN：先把 images/ 发布到稳定基址，再生成引用
figma-dev weapp <figma-url> -n <nodeId> --name GoodsList --page \
  --asset-mode cdn --public-base-url https://cdn.example.com/weapp-assets/ \
  --output ./examples/weapp-demo

# base64（小图内联）
figma-dev weapp <figma-url> -n <nodeId> --name IconBadge \
  --asset-mode base64 --icon-strategy base64 --output ./examples/weapp-demo
```

> 工程文件（`app.json` / `project.config.json`）**永不被自动改写**，落盘后只生成
> `*.suggestion.json` 建议片段，需人工合并。

## 4. 人工验证脚本（逐项执行并记录）

1. **编译启动**：导入后编译，Console 输出 `weapp-demo 首页加载完成`，无红色报错。
2. **列表渲染**：4 张商品卡片完整显示，图片为彩色方块而非裂图；卡片信息为
   台灯/耳机/保温杯（售罄）/键盘。
3. **表单输入**：输入「台灯」→ 列表实时只剩 1 张卡片；点键盘搜索/「搜索」按钮 →
   Toast 显示 `搜索：台灯`。
4. **switch 过滤**：打开「仅看有货」→ 保温杯卡片消失（其 stock=0），计数变为 3；
   与关键词组合验证交集过滤。
5. **条件块空态**：输入不存在的词如 `zzz` → 出现空态图片与「没有找到相关商品」；
   点「清空筛选条件」→ 恢复 4 张卡片。
6. **事件**：点有货商品「加入购物车」→ success Toast；点售罄保温杯 →「该商品已售罄」。
7. **包体积**：整包仅源码 + 约 3KB 图片，远低于 1.5MB 预警线（生成器 CLI 会打印
   主包核算结果，超过 2MB 退出码 2）。
8. **还原度**（可选，接真实 Figma 稿时）：观察 CLI 输出的
   `📊 WXSS 还原度覆盖率` 与 MCP `structuredContent.fidelity`，按
   [评审模板](../../docs/weapp-baseline/fidelity-review-template.md)记录。

## 5. 截图 checklist（人工评审证据）

截图建议存入 `docs/weapp-baseline/screenshots/`，命名 `<日期>-<场景>.png`：

- [ ] `01-initial`：首屏完整（头部 + 搜索 + 4 卡片，图片全部加载）
- [ ] `02-search-filter`：搜索「台灯」后的单卡片结果
- [ ] `03-stock-filter`：仅看有货开启状态（计数=3，无售罄卡片）
- [ ] `04-empty-state`：空态条件块（空态图 + 文案 + 按钮）
- [ ] `05-add-toast`：加购成功 / 售罄提示 Toast
- [ ] `06-console`：Console 无报错截图

视觉逐维度核对（与黄金评审 5 维度一致）：D1 尺寸与位置、D2 布局、D3 文本样式、
D4 颜色与效果、D5 间距。

## 6. 项目结构

```
weapp-demo/
├── app.js / app.json / app.wxss   # 小程序入口与全局配置（仅注册 pages/index）
├── project.config.json            # libVersion=3.1.5，appid 测试号占位
├── sitemap.json
├── images/                        # local 模式本地资源（仓库内置占位 PNG）
│   ├── logo.png
│   ├── empty-state.png
│   └── goods/goods-1..4.png
└── pages/index/                   # 列表 + 表单 + 条件块完整页面（四件套）
```
