# 测试/示例夹具授权与来源登记（WBS-P3-21）

本文件登记仓库内**测试夹具与示例二进制资源**的来源与授权，验收口径：
每个外部来源的 fixture 都有可核验条目；本仓库自产资源注明生成方式，禁止无登记素材入仓。

约定：
- 测试代码与夹具**不进入发布包**（`npm pack --dry-run` 白名单校验，`test/` 全量排除）；
  `examples/` 仅随包分发明确列出的演示工程，其资源授权见下。
- 仓库许可证：MIT（见根 `LICENSE`）；仓库自产内容统一以 MIT 授权。

## 1. 仓库自产：测试夹具（test/，全部为本项目作者编写）

| 路径 | 形态 | 来源 | 授权 |
| --- | --- | --- | --- |
| `test/fixtures/nodes.ts` | 合成 FigmaNode/ProcessedNode 构造器 | 本项目编写，无真实设计稿数据 | MIT |
| `test/fixtures/page.ts` | 合成页面上下文 | 本项目编写 | MIT |
| `test/fixtures/component-library/labeled-nodes.ts` | 62 节点组件库标注集（WBS-P2-11） | 本项目编写，手工标注的合成节点 | MIT |
| `test/perf/lib/fixture-tree.mjs` | 确定性 ~1000 节点性能合成页（mulberry32 seed=20261012） | 本项目编写，零网络/零外部素材 | MIT |
| 各 `*.test.ts` 内联 fixture（weapp 黄金 fixture、watch 会话、compare 代码段、合成 SVG 等） | 内联合成数据 | 本项目编写 | MIT |

## 2. 仓库自产：示例工程二进制（examples/，随演示工程分发）

| 路径 | 形态 | 来源/生成方式 | 授权 |
| --- | --- | --- | --- |
| `examples/weapp-demo/images/logo.png`（221B） | 纯色 PNG 占位 | 脚本生成的纯色块，无第三方版权内容 | MIT |
| `examples/weapp-demo/images/empty-state.png`（293B） | 纯色 PNG 占位 | 同上 | MIT |
| `examples/weapp-demo/images/goods/goods-1~4.png`（各约 589B） | 纯色 PNG 占位 | 同上 | MIT |
| `examples/svelte-demo/**` | Svelte4+Vite 最小工程源码（无二进制素材） | 本项目编写 | MIT |

重新生成纯色占位 PNG（PowerShell，任一 png）：

```powershell
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 750,750
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(255, 22, 119, 255))
$bmp.Save('placeholder.png', [System.Drawing.Imaging.ImageFormat]::Png)
```

## 3. 第三方依赖（node_modules，不入库）

- 所有运行/开发依赖经 npm registry 获取，许可证以各包 `package.json` 的 `license` 字段为准；
  发布包只含编译产物与 `package.json` 声明的 dependencies，不含依赖本体。
- OCR 能力（`ocr-service.ts`）的模型权重/可执行文件**不随仓库分发**，
  通过可选依赖在用户机器本地解析；该路径由 `test/helpers/optional-deps.ts` 打桩，
  测试不下载、不捆绑任何模型文件。
- 图标示例（smart inferrer 的 lucide 建议）仅输出**导入建议字符串**，
  不包含 lucide 图标的源码或二进制内容；用户需自行安装 `lucide-react`。

## 4. 禁止清单

- 真实 Figma 客户设计稿（含可识别品牌素材）不得作为夹具入库；
- 截图、字体、音视频等外部版权素材无显式授权条目的，不得入仓；
- 新增任何二进制/外部来源夹具，必须在本文件追加来源、授权与生成/下载方式。
