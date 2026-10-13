// index.js
// figma-dev-tools 示例页交互（WBS-P0-82）：
//  - 图片列表 wx:for + 本地图片
//  - 搜索表单 bindsubmit / bindinput
//  - switch bindchange 过滤
//  - 条件块：空态 wx:if ↔ 列表 wx:else、库存标签 wx:if/wx:else
const GOODS_LIST = [
  { id: 'g1', name: '北欧风台灯', desc: '三档调光 · 无频闪护眼', price: '199', stock: 12, image: '/images/goods/goods-1.png' },
  { id: 'g2', name: '无线蓝牙耳机', desc: '主动降噪 · 30 小时续航', price: '399', stock: 8, image: '/images/goods/goods-2.png' },
  { id: 'g3', name: '便携保温杯', desc: '316 不锈钢 · 12 小时保温', price: '89', stock: 0, image: '/images/goods/goods-3.png' },
  { id: 'g4', name: '机械键盘', desc: '热插拔轴座 · RGB 背光', price: '499', stock: 3, image: '/images/goods/goods-4.png' },
];

Page({
  data: {
    keyword: '',
    inStockOnly: false,
    goodsList: GOODS_LIST,
    filteredList: GOODS_LIST,
  },

  onLoad() {
    console.log('weapp-demo 首页加载完成');
  },

  /** 输入框实时过滤（bindinput） */
  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
    this.applyFilter(e.detail.value, this.data.inStockOnly);
  },

  /** 表单提交（bindsubmit，从 e.detail.value 取具名表单控件） */
  onSearchSubmit(e) {
    const keyword = (e.detail.value.keyword || '').trim();
    this.setData({ keyword });
    this.applyFilter(keyword, this.data.inStockOnly);
    wx.showToast({ title: keyword ? `搜索：${keyword}` : '显示全部商品', icon: 'none' });
  },

  /** switch 切换（bindchange） */
  onStockToggle(e) {
    const inStockOnly = e.detail.value;
    this.setData({ inStockOnly });
    this.applyFilter(this.data.keyword, inStockOnly);
  },

  /** 重置筛选 */
  onReset() {
    this.setData({ keyword: '', inStockOnly: false });
    this.applyFilter('', false);
  },

  /** 加入购物车（bindtap + data-id 传参） */
  onAddTap(e) {
    const id = e.currentTarget.dataset.id;
    const goods = this.data.goodsList.find((g) => g.id === id);
    if (!goods || goods.stock <= 0) {
      wx.showToast({ title: '该商品已售罄', icon: 'none' });
      return;
    }
    wx.showToast({ title: `已加入：${goods.name}`, icon: 'success' });
  },

  /** 纯函数口径的过滤逻辑（仅 setData 触发渲染） */
  applyFilter(keyword, inStockOnly) {
    const kw = (keyword || '').trim().toLowerCase();
    const filteredList = this.data.goodsList.filter((g) => {
      const matchKeyword = !kw || g.name.toLowerCase().includes(kw) || g.desc.toLowerCase().includes(kw);
      const matchStock = !inStockOnly || g.stock > 0;
      return matchKeyword && matchStock;
    });
    this.setData({ filteredList });
  },
});
