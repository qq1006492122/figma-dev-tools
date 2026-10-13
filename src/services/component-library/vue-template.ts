/**
 * Vue 模板组件属性序列化（WBS-P2-13）
 *
 * 把 matcher 产出的 {@link MappedProp} 转成 Vue 模板属性片段。
 * 评分/Prop 推导与 React 共用同一套模型，Vue 侧差异只体现在模板语法：
 *
 * - 枚举/字符串 prop（type/size/shape/placeholder…）→ 静态属性 `type="primary"`；
 * - 布尔 prop（ant-design-vue 的 danger）→ 裸属性 `danger`
 *   （组件侧声明为 Boolean 时，模板裸属性等价 true）；
 * - Tabs 激活态是运行时状态：ant-design-vue 支持非受控 `default-active-key`；
 *   element-plus 只有 `v-model` 受控，禁止臆造 ref，返回 null 并由组合式警告覆盖。
 *
 * 纯函数、零 I/O。
 *
 * @module services/component-library/vue-template
 */

import { escapeAttribute, sanitizeText } from '../../utils/security.js';
import type { ComponentLibraryId, MappedProp, MappableComponent } from './types.js';

/** camelCase → kebab-case（模板属性名保险；当前库 prop 名基本为单词） */
function kebabCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

/**
 * 把单个组件 prop 渲染为 Vue 模板属性片段。
 *
 * @returns 模板属性（如 `type="primary"` / `danger`）；该 prop 无法静态输出时返回 null
 */
export function renderVuePropAttr(
  library: ComponentLibraryId,
  component: MappableComponent,
  prop: MappedProp,
): string | null {
  // Tabs：antdv 给非受控初值；element-plus 必须 v-model 绑定（不生成，交手工警告）
  if (component === 'tabs' && prop.name === 'defaultValue') {
    if (library === 'ant-design-vue') {
      return `default-active-key="${escapeAttribute(prop.value)}"`;
    }
    return null;
  }
  // 布尔 prop：裸属性
  if (prop.value === 'true') return prop.name;
  // 文本来源的 placeholder 先清理再转义，防 XSS
  const value = prop.name === 'placeholder' ? escapeAttribute(sanitizeText(prop.value)) : escapeAttribute(prop.value);
  return `${kebabCase(prop.name)}="${value}"`;
}
