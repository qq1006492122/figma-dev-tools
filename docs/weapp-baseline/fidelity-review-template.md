# 黄金页面 WXSS 还原度评审模板（WBS-P0-81 方案 B）

> 用途：对 6 张黄金页面执行**人工视觉评审**的记录模板。机器闸门（属性覆盖率 ≥85%）由
> [test/services/weapp-compat/fidelity-golden-fixtures.test.ts](../../test/services/weapp-compat/fidelity-golden-fixtures.test.ts)
> 自动执行；本模板记录两名评审人的逐维度打分与排除项核对，二者共同构成 P0-1.8 的发布证据。
>
> 冻结规则来源：ROADMAP-v1.4.20-v2.md §P0-1.8。冻结后任何映射清单增删须在本文档留痕。

## 1. 指标口径（方案 B）

- **分母 total**：节点树中本方案承诺可还原视觉属性的出现条数，清单单一来源为
  [weapp-visual-style.ts](../../src/services/weapp-compat/weapp-visual-style.ts)
  的 `SUPPORTED_VISUAL_PROPERTIES`（尺寸/布局/圆角/纯色/透明度/单阴影/文本共 20 个属性）。
- **分子 matched**：生成 WXSS 中对应属性的声明条数，按属性 `min(期望, 生成)` 配对，
  单条声明不得重复抵扣多个节点。
- **排除项 excluded**：不承诺由静态 WXSS 还原的特征，**不进分母但必须逐项可见**：

  | property | 含义 | 处置归属 |
  |---|---|---|
  | `fill:image` | 图片填充 | 资源管线渲染为 `<image>` |
  | `box-shadow:multi` | 多阴影叠加 | Skyline 降级器/人工，仅承诺单阴影 |
  | `component-instance` | 自定义组件实例 | 静态 WXSS 不还原其内部 |
  | `list-folded-member` | wx:for 非原型成员 | 样式由原型 class 在运行时承载 |
  | `invisible-node` | 不可见且无结构指令的子树 | 生成器不输出 |

- **机器闸门**：每页 `rate ≥ 0.85`；`missing` 列出缺口属性，作为人工评审重点。
- 方案 A（miniprogram-automator 像素 diff）为 Stretch，未稳定前不得替换本闸门。

## 2. 六张黄金页面

| # | key | 页面类型 | 覆盖重点 |
|---|---|---|---|
| 1 | `login` | 登录 | 居中表单、输入框、主行动按钮、文本层级 |
| 2 | `list` | 列表 | 图片列表、`wx:for` 折叠、scroll-view |
| 3 | `card-detail` | 卡片详情 | 封面图、价格/标签、单阴影卡片、长文本 |
| 4 | `form` | 表单 | 标签-输入行、多行表单、勾选行、提交按钮 |
| 5 | `marketing` | 营销长页 | 多区块长页面、多阴影排除项、倒计时横幅、CTA |
| 6 | `nav-frame` | 导航框架 | 顶部导航、滚动正文、底部导航位（TabBar 仅建议） |

**当前机器闸门实测（2026-10-10）**：

| key | rate | matched/total | 主要 missing |
|---|---|---|---|
| login | 86.0% | 43/50 | 按钮内文本被拍平为纯文本，标签文本样式未单独生成 |
| list | 100% | 57/57 | — |
| card-detail | 93.2% | 96/103 | 同上（按钮标签） |
| form | 93.3% | 98/105 | 同上 |
| marketing | 95.6% | 153/160 | 同上 |
| nav-frame | 100% | 115/115 | — |

已知缺口（按钮标签）在每页 `missing` 中稳定可见，列入后续迭代候选，不在本期自动修复范围。

## 3. 评审规则

1. **两名评审人独立打分，禁止串评**；评审人 A/B 使用不同颜色或分别提交本表副本。
2. 每页按以下 5 个维度逐属性判定（命中承诺清单且渲染正确=1；缺失/错误=0；
   属排除项=E 不计分）：
   - D1 尺寸与位置（width/height）
   - D2 布局（display/flex-direction/flex-wrap/justify/align/gap/padding）
   - D3 文本样式（font-size/font-weight/line-height/letter-spacing/text-align/color）
   - D4 颜色与效果（background-color/border-radius/opacity/box-shadow）
   - D5 间距（gap/padding，随自动布局字段核对 rpx 换算）
3. **分歧复核**：两人页面总分差值 > 10 个百分点时，由第三人复核该页并给出终裁分。
4. 排除项必须看到"渲染正确的替代承载"（如 `fill:image` 对应 `<image>` 实际显示），
   否则判为缺失而非排除。
5. 375 宽帧统一按 `rpx = px × 2` 核对尺寸；750 宽帧按 1:1。

## 4. 逐页记录表（每页复制一份）

```
页面：[login | list | card-detail | form | marketing | nav-frame]
评审人：A / B（圈选）   日期：____   基础库版本：3.1.5（冻结兼容基线）
渲染器：webview / skyline（圈选）   设备模拟：____

| 维度 | 承诺条数 | 命中 | 缺失/错误明细（节点名 + 属性 + 期望 vs 实际） |
|---|---|---|---|
| D1 尺寸与位置 |  |  |  |
| D2 布局 |  |  |  |
| D3 文本样式 |  |  |  |
| D4 颜色与效果 |  |  |  |
| D5 间距 |  |  |  |
| 合计 |  |  | 人工得分 = 命中/承诺 = ____% |

排除项现场核对：
- [ ] fill:image：每个图片填充均有可见 <image> 承载
- [ ] box-shadow:multi：多阴影节点已见降级 warning 或人工标注
- [ ] list-folded-member：列表运行时由 wx:for 展开，行样式与原型一致
- [ ] invisible-node / component-instance：页面上无意外消失的可见内容

机器率：____%（MCP structuredContent.fidelity.rate / CLI 摘要）
差值 >10pp 复核人：____ 终裁分：____
结论：通过 / 有条件通过（列整改项）/ 不通过
```

## 5. 截图与授权登记

- 6 张黄金 **fixture 节点树**为仓库内手工构造的合成数据（无任何外部设计稿内容），
  定义于 golden fixture 测试文件，不涉及第三方授权。
- 真机/模拟器**评审截图**存放约定：`docs/weapp-baseline/screenshots/<日期>-<key>-<评审人>.png`，
  截图不得包含未获授权的私有设计稿；如未来引入真实 Figma 稿，必须先按
  ROADMAP P3-2 的 fixtures/LICENSES.md 要求登记来源与授权，未登记不得进入黄金集。
- 截图建议：整页 1 张 + 每个失分项局部放大 1 张，命名与第 4 节记录一一对应。
