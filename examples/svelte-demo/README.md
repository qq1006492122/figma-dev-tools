# Svelte Demo（WBS-P1-14 人工验证工程）

`figma_generate_svelte` 产物风格的最小可运行 Svelte 4 + Vite 工程，用于 WBS-R1 冒烟中的
**Svelte dev** 项人工验证。

## 运行

```bash
cd examples/svelte-demo
npm install
npm run dev      # 打开 Vite 输出的本地地址（默认 http://localhost:5173）
```

也可 `npm run build` 做一次生产构建确认无编译错误。

## 页面内容（与生成器语法契约一一对应）

- [src/lib/GoodsList.svelte](src/lib/GoodsList.svelte)
  - `export let` props、`createEventDispatcher` 向外抛事件
  - `on:input` / `on:change` / `on:click`
  - keyed `{#each filtered as item, index (item.id)}` + `{:else}` 空态
  - `{#if item.stock > 0}{:else}{/if}` 库存标签
  - scoped `<style>`（对应生成器 css-modules 组合的落地形态——**Svelte 编译器局部作用域，非 CSS Modules hash/composes**）
- [src/App.svelte](src/App.svelte)：props 透传与事件转发

## 与生成工具的关系

本工程的组件为**同构手工参考实现**；接真实 Figma 稿时，用 MCP `figma_generate_svelte`
或 CLI `figma-dev svelte` 生成真实组件后替换：

```bash
# tailwind（项目需自行配置 Tailwind/UnoCSS，原子类才会生效）
figma-dev svelte "<figma-url>" -n <nodeId> --name GoodsList --style tailwind

# unocss attributify
figma-dev svelte "<figma-url>" -n <nodeId> --name GoodsList --style unocss --attributify

# css-modules（产物为内联 scoped <style>，无 .module.css 旁路）
figma-dev svelte "<figma-url>" -n <nodeId> --name GoodsList --style css-modules

# 纯 JS（无 lang="ts"）
figma-dev svelte "<figma-url>" -n <nodeId> --name GoodsList --no-ts
```

样式仅支持 `tailwind / unocss / css-modules`；styled/emotion/less/sass 等会在触网前报错。
Svelte 5 runes 仅在产物注释中给迁移建议，默认输出 Svelte 4 语法。

## 机内验证（CI）

仓库根目录的 `test/services/svelte-compile.test.ts` 使用 `svelte/compiler`（TS 经
typescript 预处理）编译本工程全部 SFC 及三种样式组合的生成产物，无需 npm install 本目录。
