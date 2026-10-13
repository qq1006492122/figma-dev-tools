# 微信小程序基础库版本冻结记录（WBS-P0-41）

> 冻结日期：**2026-10-10**
> 数据来源：微信官方文档 [基础库 / 版本分布](https://developers.weixin.qq.com/miniprogram/dev/framework/client-lib/version.html)
> 官方页面标注更新时间：**2026-10-09**
> 取证方式：浏览器实抓官方动态表格（40 个版本的总体占比），机读数据落盘于
> [`src/services/weapp-compat/baseline-versions.ts`](../../src/services/weapp-compat/baseline-versions.ts)，
> 覆盖率由 `cumulativeCoverage()` 纯函数计算并有单测锁定，任何数字可复算、可 diff。

## 冻结结论

| 项 | 版本 | 依据 |
|---|---|---|
| **目标版本（target / 推荐开发）** | **3.17.3** | 当前主版本，总体占比 **80.19%**（安卓 86.97% / iOS 85.81%）；3.17.4 仍在灰度（0.15%，安卓 8.0.76 / iOS 8.0.75） |
| **最低兼容版本（minSupported）** | **3.1.5** | 从最新版向下累计，**首个覆盖率 ≥ 99% 的版本：99.03%**；再降一档到 3.0.2 仅多覆盖 0.02 个百分点，工程收益 < 0.2% |
| 覆盖率阈值 | 99% | 兼容基线判定线 |

## 覆盖率累计（关键节点，实算）

| 最低版本 | 累计覆盖率 |
|---|---|
| ≥ 3.17.x（含灰度 3.17.4） | 87.80% |
| ≥ 3.16.3 | 90.72% |
| ≥ 3.15.3 | 93.87% |
| ≥ 3.10.3 | 96.35% |
| ≥ 3.8.12 | 97.95% |
| **≥ 3.1.5** | **99.03%（冻结点）** |
| ≥ 3.0.2 | 99.05% |

占比低于 0.01% 的版本官方已隐藏，故全部版本合计略低于 100%（数据文件实测合计 99.x%）。

## 配套冻结：WXSS 兼容口径

- 官方唯一逐属性的兼容清单出现在 **Skyline** 差异页，已转录 **109 个样式属性**到
  [`wxss-matrix.ts`](../../src/services/weapp-compat/wxss-matrix.ts)（≥80 验收线），
  每条含官方支持格式/默认值/备注原文与来源 URL：
  <https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/skyline/wxss.html>
- 默认 **WebView** 渲染：WXSS 能力随系统 WebView，官方未逐属性枚举，降级器不做属性级拦截。
- **Skyline** 渲染：降级器按矩阵备注执行 unsupported/degrade（见
  [`wxss-degrader.ts`](../../src/services/weapp-compat/wxss-degrader.ts)），规则事实只允许来自官方备注。
- 选择器限制来源（[通用 WXSS 文档](https://developers.weixin.qq.com/miniprogram/dev/framework/view/wxss.html)）：
  属性名选择器 `[attr]` 不生效；不支持带参数的伪类/伪元素；自定义组件内仅推荐 class 选择器。

## 重新基线流程（不得手改数字）

1. 浏览器打开官方分布页，记录页面"更新时间"；
2. 实抓全表（版本 + 总体占比）更新 `CLIENT_LIB_DISTRIBUTION`；
3. 用 `cumulativeCoverage()` 重新求首个 ≥99% 版本，更新 `FROZEN_BASELINE`；
4. 同步本文件与 `baseline-versions.test.ts` 的断言日期/数值，跑测试锁定。

## 截图存档说明

官方分布页为动态表格，本次取证已在浏览器会话中人工核验页面快照（标题"基础库版本分布"、
更新时间 2026 年 10 月 9 日、表头六列、3.17.3 行总体 80.19%）。受取证工具沙箱写盘限制，
截图二进制无法直接存入仓库；机读 JSON 数据（本仓 `.ts` 常量）比截图更可复核（可机算、可回归断言），
故以机读数据 + 本记录作为存档载体。
