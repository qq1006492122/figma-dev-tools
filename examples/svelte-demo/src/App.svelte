<script>
  import GoodsList from './lib/GoodsList.svelte';

  let keyword = '';
  let inStockOnly = false;

  const goods = [
    { id: 'g1', name: '北欧风台灯', desc: '三档调光 · 无频闪护眼', price: 199, stock: 12, color: '#ff7a68' },
    { id: 'g2', name: '无线蓝牙耳机', desc: '主动降噪 · 30 小时续航', price: 399, stock: 8, color: '#5e9eff' },
    { id: 'g3', name: '便携保温杯', desc: '316 不锈钢 · 12 小时保温', price: 89, stock: 0, color: '#ffc44f' },
    { id: 'g4', name: '机械键盘', desc: '热插拔轴座 · RGB 背光', price: 499, stock: 3, color: '#5ad4b0' },
  ];

  const onKeyword = (event) => {
    keyword = event.detail;
  };

  const onToggleStock = (event) => {
    inStockOnly = event.detail;
  };

  const onAdd = (event) => {
    console.log('add to cart:', event.detail);
  };
</script>

<main>
  <h1>figma-dev-tools · Svelte 4 演示</h1>
  <p class="subtitle">export let props · on:event · keyed each · if/else · scoped style</p>
  <GoodsList
    {goods}
    {keyword}
    {inStockOnly}
    on:keyword={onKeyword}
    on:toggle-stock={onToggleStock}
    on:add={onAdd}
  />
</main>

<style>
  main {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    padding: 24px 0 48px;
    text-align: center;
  }

  h1 {
    margin: 0;
    font-size: 22px;
    color: #1a1a1a;
  }

  .subtitle {
    margin: 6px 0 20px;
    font-size: 12px;
    color: #8a8f99;
  }
</style>
