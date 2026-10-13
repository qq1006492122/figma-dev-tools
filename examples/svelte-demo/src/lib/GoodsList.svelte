<!--
  GoodsList.svelte — figma-dev-tools Svelte 4 产物风格的手工参考实现。

  对应 WBS-P1-1 的语法契约（与 figma_generate_svelte 输出同构）：
  - export let props（Svelte 4 props）
  - on:input / on:click 事件 + createEventDispatcher
  - {#each list as item, index (item.id)} keyed 列表
  - {#if} / {:else} 条件块
  - scoped <style>（对应 css-modules 组合的落地形态：非 hash/composes）
-->
<script>
  import { createEventDispatcher } from 'svelte';

  export let goods = [];
  export let keyword = '';
  export let inStockOnly = false;

  const dispatch = createEventDispatcher();

  $: filtered = goods.filter((g) => {
    const matchKeyword = !keyword || g.name.includes(keyword);
    const matchStock = !inStockOnly || g.stock > 0;
    return matchKeyword && matchStock;
  });

  const onKeywordInput = (event) => {
    dispatch('keyword', event.currentTarget.value);
  };

  const onStockToggle = (event) => {
    dispatch('toggle-stock', event.currentTarget.checked);
  };

  const onAdd = (goods) => {
    if (goods.stock <= 0) return;
    dispatch('add', goods);
  };
</script>

<div class="panel">
  <div class="search-row">
    <input
      class="search-input"
      placeholder="搜索商品名称"
      value={keyword}
      on:input={onKeywordInput}
    />
    <label class="stock-switch">
      <input type="checkbox" checked={inStockOnly} on:change={onStockToggle} />
      <span>仅看有货</span>
    </label>
  </div>

  <p class="result-count">共 {filtered.length} 件商品</p>

  {#each filtered as item, index (item.id)}
    <div class="card">
      <div class="thumb" style={`background-color: ${item.color}`}></div>
      <div class="info">
        <div class="name-row">
          <span class="name">{index + 1}. {item.name}</span>
          {#if item.stock > 0}
            <span class="tag tag--ok">有货</span>
          {:else}
            <span class="tag tag--out">已售罄</span>
          {/if}
        </div>
        <span class="desc">{item.desc}</span>
        <div class="bottom">
          <span class="price">¥{item.price}</span>
          <button class="add" on:click={() => onAdd(item)} disabled={item.stock <= 0}>
            加入购物车
          </button>
        </div>
      </div>
    </div>
  {:else}
    <div class="empty">
      <span class="empty-title">没有找到相关商品</span>
      <span class="empty-desc">换个关键词，或关闭「仅看有货」</span>
    </div>
  {/each}
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    max-width: 420px;
    margin: 0 auto;
    padding: 16px;
    background-color: #f6f7fa;
    box-sizing: border-box;
  }

  .search-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .search-input {
    flex: 1;
    height: 36px;
    padding: 0 12px;
    font-size: 14px;
    border: 0;
    border-radius: 18px;
    background-color: #fff;
  }

  .stock-switch {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    color: #4a4f59;
  }

  .result-count {
    margin: 0;
    font-size: 12px;
    color: #8a8f99;
  }

  .card {
    display: flex;
    flex-direction: row;
    gap: 12px;
    padding: 10px;
    background-color: #fff;
    border-radius: 10px;
  }

  .thumb {
    width: 84px;
    height: 84px;
    flex-shrink: 0;
    border-radius: 8px;
  }

  .info {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .name-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .name {
    font-size: 15px;
    font-weight: 600;
    color: #1a1a1a;
  }

  .tag {
    padding: 1px 6px;
    font-size: 10px;
    border-radius: 4px;
  }

  .tag--ok {
    color: #07c160;
    background-color: #e6f8ef;
  }

  .tag--out {
    color: #9aa0aa;
    background-color: #f0f1f5;
  }

  .desc {
    font-size: 12px;
    color: #8a8f99;
  }

  .bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .price {
    font-size: 17px;
    font-weight: 700;
    color: #e04536;
  }

  .add {
    font-size: 12px;
    color: #fff;
    background-color: #07c160;
    border: 0;
    border-radius: 14px;
    padding: 4px 12px;
  }

  .add:disabled {
    background-color: #b9bdc6;
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 48px 16px;
  }

  .empty-title {
    font-size: 15px;
    font-weight: 600;
    color: #4a4f59;
  }

  .empty-desc {
    font-size: 13px;
    color: #8a8f99;
  }
</style>
