---
name: "dev-workflow"
description: "figma-dev-tools 开发与发版规范：禁止 any 类型、每次改动后自检、发版前统一更新版本号并同步文档。开发/修改/优化/迭代/发版本项目时触发。"
---

# figma-dev-tools 开发与发版工作流

> 本 skill 约束本项目（figma-dev-tools）的日常开发、优化、迭代与发版流程，必须严格遵守。

## 0. 何时使用

对 `figma-dev-tools` 进行**开发、修改、优化、迭代、重构、发版**时，必读并遵守本规范。

## 1. 类型安全：禁止 any

项目 `tsconfig.json` 已开启 `strict` + `noImplicitAny` + `noUncheckedIndexedAccess`，因此：

- **禁止显式 `any`**：不得写 `any`、`as any`、`<any>`。
- **禁止隐式 any**：宽类型不能直接索引窄对象。典型错误：
  - `NodeJS.Platform`（含 `aix`/`android`/`freebsd` 等）不能直接索引 `{ win32?; darwin?; linux? }`。
  - 正确做法：先用窄联合类型收敛，参考 [editor-detector.ts](../../../src/services/editor-detector.ts) 中的 `EditorPlatform` 与 `getEditorPlatform()`。
- 新增代码必须显式标注类型，杜绝"元素隐式具有 any 类型"报错。

## 2. 每次改动后自检

每次开发/优化/迭代**完成后**，必须执行自检：

```bash
npm run build   # tsc 类型检查，必须 0 错误
npm test         # vitest，必须全部通过
```

- 修复所有 TS 诊断与测试失败后，才能进行下一步（提交/发版）。
- 若 `npx tsc` 因 PowerShell 执行策略报 `.ps1 cannot be loaded`，改用 `node node_modules/typescript/bin/tsc --noEmit` 绕过。

## 3. 版本号统一同步（发版前必做）

发版前，把**当前版本标识**统一更新为「新迭代版本号」。以下位置必须全部一致（用 `x.y.z` 指代新版本号）：

| 位置 | 具体字段 |
| --- | --- |
| `package.json` | `version` + `description` 中的 `vX.Y.Z` |
| `src/cli/index.ts` | `.version('x.y.z')` |
| `src/services/gui-server.ts` | `const VERSION = 'x.y.z'` |
| `gui/app.js` | `subtitle` / `footer` 中的 `vX.Y.Z`（中英文共 4 处） |
| `gui/index.html` | 含 `vX.Y.Z` 的文案（约 2 处） |
| `README.md` / `README.en-US.md` | 标题 `vX.Y.Z` |
| `QUICKSTART.md` / `QUICKSTART.en-US.md` | 标题 `vX.Y.Z` |
| `SKILL.md` | frontmatter `description` + 正文标题 |
| `DEVELOPMENT.md` | 标题 `vX.Y.Z` |

**注意**：changelog / 历史标注（如「v1.4.0 新增」「v1.4.4 新增」）属于历史记录，**保持不动**，只改「当前版本标识」。

## 4. 文档同步

每次更新后同步更新文档，保持「内容与实现一致 + 中英文双语同步」：

- `README.md` ⇄ `README.en-US.md`
- `QUICKSTART.md` ⇄ `QUICKSTART.en-US.md`
- 功能/命令/示例变更时，同步更新对应中英文 `.md` 文档。

## 5. README 语言切换链接（防 404）

语言切换链接**必须使用主仓库（Gitee）绝对 URL**，禁止相对链接（相对链接在 npm 等平台会 404）：

- 主仓库：`https://gitee.com/shanxi-youcha/figma-dev-tools`
- 格式：`{主仓库}/blob/master/{文档名}`

示例（README.md 中）：
```markdown
**[English](https://gitee.com/shanxi-youcha/figma-dev-tools/blob/master/README.en-US.md)** | **中文**
```