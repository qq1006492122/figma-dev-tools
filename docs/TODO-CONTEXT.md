# 代办事项上下文预压缩（2026-10-13）

> 用途：在后续继续优化 `代办事项.md`、ROADMAP 和实现工作时，提供低上下文成本的索引与执行约束。  
> 本文件不是替代 `代办事项.md`，而是把长文档压缩成“当前事实、执行边界、未决问题、下一轮入口”。

## 1. 当前事实基线

- 项目根：`C:\Users\farben\Desktop\workspace\sapce\figma_mcp\figma_mcp\figma-dev-tools`
- 目标版本：`1.4.20`
- 当前验证结果：
  - `npm run build`：通过；
  - `npm test`：74 个测试文件、1002 个测试通过；
  - `npm run check:consistency`：13/13 通过；
  - `npm pack --dry-run`：发布清单已核对，但真实干净安装、升级、卸载、回滚仍需测试。
- 当前工作树包含大量新增实现、测试、示例、文档和未跟踪脚本；不能把 ROADMAP 的 `✅完成` 一律视为“已验收”。

## 2. 必须遵守的优化约束

1. 每条正式任务必须包含：
   - 问题描述；
   - 影响与根因；
   - 目标方案；
   - 兜底方案；
   - 验收证据。
2. 不为了做而做。任务分为：
   - Must：安全、不可运行、数据丢失、发布阻断；
   - Should：真实提升成功率、便捷性、可维护性；
   - Explore：有潜力但缺少用户证据，不阻塞当前版本。
3. 任何“已完成”必须区分：
   - implemented；
   - tested；
   - accepted/QA。
4. 不以测试数量代替用户任务成功率。
5. 所有新增功能都要有异常、并发、安全、资源和生命周期测试。
6. 修改旧逻辑前先记录兼容性影响：MCP schema、CLI 参数、配置文件、缓存、输出命名、`publicCdnUrl()`、styleFormat。

## 3. 已确认的关键问题（P0）

### 3.1 安全与 Token

- 泄露的 Figma Token 必须撤销并重新生成。
- GUI、CLI、MCP 日志、错误对象、Agent trace 必须脱敏。
- MCP 不应继续接收明文 `accessToken`；优先使用 `tokenProfile` 或服务端 Token Store。
- GUI Token 传输要限制在安全本地边界，禁止持久化请求体。

### 3.2 GUI/Token 网络错误

- 当前 `ECONNREFUSED`、代理失败、TLS、超时会被误报为“Token 验证失败”。
- 必须区分 auth/network/proxy/timeout/TLS/rate-limit。
- `HTTP_PROXY/HTTPS_PROXY/NO_PROXY` 需要标准 matcher、连通性诊断和明确降级。
- 网络失败不能持久化为 Token `invalid`。

### 3.3 生成代码运行错误

- Ant Design Vue：`importName` 与 `<a-tag>` 标签不匹配。
- Svelte：`hidden` 语义反向，当前生成 `hidden={!expression}`。
- Weapp：CDN 资源只拼 URL，不上传、不验证。
- Weapp：旧 `node.asset.cdnUrl/localPath` 分支绕过资源状态机。
- Compare：单文件 `currentCode` 配对错误，输出 removed + added 而不是 changed diff。
- Watch：JSON 旁路合并未接入写盘链路。
- Watch：生成失败后仍提交 signature，导致同版本不再重试。

### 3.4 数据与运行安全

- Watch 写盘需要原子写、备份、路径/符号链接/junction 防护。
- JSON Pointer 要拒绝 `__proto__`、`constructor`、`prototype`。
- 任何资源必须有 resolved/unresolved 状态、manifest、hash 和可达性验证。
- Compare 的 LCS 大输入存在内存爆炸风险。
- FigmaClient Token 轮换修改共享 Axios headers，存在并发鉴权串号风险。

## 4. 竞争力 MVP（只做这些先形成闭环）

1. 安全可信：Token、脱敏、错误分类；
2. 能运行：React/Vue/Svelte/Weapp build/run；
3. 资源真实闭环：下载、hash、落盘、manifest、可达性；
4. 不丢用户代码：preserve、JSON override、备份、原子写；
5. 增量同步：变更检测、失败重试、节点级增量；
6. 可维护产物：组件拆分、manifest、source map、依赖图；
7. Agent 便捷：`figma_generate_plan` + `figma_generate` 统一路由；
8. 真实数据：20 个固定样例的可运行产物率、资源成功率、P50/P95。

Explore 类功能暂不阻塞当前版本：AI 可解释报告、多方案对比、完整三方 merge UI、深度 CI、全量 monorepo、企业审计、公开仪表盘、复杂视觉 AI。

## 5. 测试策略摘要

必须按以下层级执行，并保存结果：

- L1 静态检查：TS、lint、secret scan、依赖声明；
- L2 单元：状态机、边界、模板、资源、错误分类；
- L3 契约：MCP schema、工具枚举、错误码、CLI help、GUI API；
- L4 冒烟：23+ MCP 工具、CLI、GUI、核心生成链；
- L5 集成/真实运行：build/compile、资源、Watch、Compare；
- L6 故障/安全：断网、坏代理、超时、取消、路径穿越、原型污染、Token 泄露；
- L7 性能：100/1000/5000 节点、P50/P95、内存、API 数量、缓存命中；
- L8 人工 QA：微信开发者工具、GUI、真实项目、视觉/键盘/读屏/多语言。

必须重点覆盖：

- 并发、竞态、AbortSignal、timer/socket/browser 清理；
- 死循环、无限递归、未处理 Promise；
- 幽灵依赖、宿主工具、全局缓存、代理和环境变量污染；
- 安装、升级、卸载、回滚、离线和迁移；
- Mutation/Fuzz、覆盖率缺口、flaky rate；
- 真实组件库/构建工具/小程序设备矩阵；
- 用户 Journey，而不是只有单工具测试。

## 6. 未决问题与下一轮入口

### 未决问题

- `ROADMAP-v1.4.20-v2.md` 仍存在测试基线历史数字、旧 package-lock 状态和 WBS 完成状态混用。
- `代办事项.md` 当前是问题/机会清单，不是执行状态表；仍需转换为 Epic/Story/owner/status。
- `figma_generate_plan`、manifest、source map、组件依赖图应合并为一个“生成计划/产物映射”工作。
- 可运行产物率需要固定样例、判定规则、人工验收规则和统计脚本。
- 竞品比较需要版本、日期、样例、环境、证据链接和失败样本。
- 代码行号会漂移，后续索引应以文件 + 函数名 + 锚点为主。

### 下一轮建议入口

1. 将 `代办事项.md` 转成 Epic/Story 状态表；
2. 先写 P0 失败测试，再实现最小修复；
3. 建立 20 个真实/标注样例的可运行产物率基线；
4. 将 P0/P1 分成 Must/Should，Explore 不进入当前排期；
5. 更新 ROADMAP 与 TODO 的状态语义；
6. 完成后再做统一全量测试和 QA 验收。

## 7. 快速定位索引

- GUI Token：`src/services/gui-server.ts`、`gui/app.js`
- FigmaClient：`src/services/figma-client.ts`
- TokenStore：`src/services/token-store.ts`
- Weapp 资源：`src/services/weapp-assets.ts`、`weapp-asset-pipeline.ts`、`weapp-asset-writer.ts`
- Weapp 生成：`src/services/weapp-generator.ts`
- Svelte：`src/services/svelte-generator.ts`
- Vue/组件库：`src/services/vue-generator.ts`、`src/services/component-library/`
- Compare：`src/services/compare/compare-code.ts`、`src/index.ts`
- Watch：`src/services/watch/`
- Fidelity：`src/services/weapp-compat/fidelity-wxss.ts`
- 响应式：`src/services/responsive/responsive-inferrer.ts`
- QA 清单：`docs/QA-R1-smoke-checklist.md`
- 性能结果：`test/perf/results/`