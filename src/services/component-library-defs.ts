/**
 * 内建 UI 组件库特征定义（v1.4.19 T19）
 *
 * - Ant Design（React，import 源 `antd`）：Button/Form/Input/Modal/Tabs 等常用组件；
 * - Element Plus（Vue，import 源 `element-plus`，模板中以 el-* 标签使用）。
 *
 * 与 component-mapper.ts 中 shadcn/ui 表结构对齐：关键词命中 + 视觉特征置信度加权。
 * shadcn 表保留在 mapper 文件内（历史原因且含专有 props 推断），本表只放新增两库。
 *
 * @module
 */

import type { ComponentLibrary } from './component-mapper.js';

/** 组件视觉特征（用于置信度加权，全部可选；与 shadcn 表同构） */
export interface BuiltinFeatureDef {
  /** 节点自身或子级含文本 */
  hasText?: boolean;
  /** 含图标子节点 */
  hasIcon?: boolean;
  /** 可交互（按钮/输入/开关等） */
  isInteractive?: boolean;
  /** 最少直接子节点数 */
  minChildren?: number;
  /** 最多直接子节点数 */
  maxChildren?: number;
  /** 圆角档位 */
  borderRadius?: 'sm' | 'md' | 'lg';
  /** 节点具有实色填充 */
  hasBackground?: boolean;
}

/** 内建组件定义（antd / element-plus 共用） */
export interface BuiltinComponentDef {
  /** 目标库组件名（antd 为导出名；element-plus 为 El* 组件名） */
  name: string;
  /** 所属组件库 */
  library: Exclude<ComponentLibrary, 'none' | 'shadcn-ui'>;
  /** import 来源包名（antd / element-plus） */
  importPath: string;
  /** 节点名关键词（小写匹配，包含中英文别名） */
  keywords: readonly string[];
  /** 视觉特征约束 */
  features: BuiltinFeatureDef;
  /** 使用示例（antd=JSX；element-plus=SFC 模板） */
  usageExample: string;
}

/**
 * Ant Design 常用组件映射
 *
 * 说明：Modal 对应 antd Modal；Form 以 Form + Form.Item 组合示例。
 */
const ANT_DESIGN_COMPONENTS: readonly BuiltinComponentDef[] = [
  {
    name: 'Button',
    library: 'ant-design',
    importPath: 'antd',
    keywords: ['button', 'btn', '按钮'],
    features: { hasText: true, isInteractive: true, hasBackground: true },
    usageExample: '<Button type="primary">确定</Button>',
  },
  {
    name: 'Input',
    library: 'ant-design',
    importPath: 'antd',
    keywords: ['input', '输入框', 'textfield', 'text field', '文本框'],
    features: { isInteractive: true },
    usageExample: '<Input placeholder="请输入" />',
  },
  {
    name: 'Textarea',
    library: 'ant-design',
    importPath: 'antd',
    keywords: ['textarea', '多行输入', 'text area'],
    features: { isInteractive: true },
    usageExample: '<Input.TextArea placeholder="请输入多行内容" rows={4} />',
  },
  {
    name: 'Select',
    library: 'ant-design',
    importPath: 'antd',
    keywords: ['select', 'dropdown', 'picker', '下拉', '选择器'],
    features: { isInteractive: true, minChildren: 1 },
    usageExample: '<Select placeholder="请选择" options={[{ value: "a", label: "选项 A" }]} />',
  },
  {
    name: 'Form',
    library: 'ant-design',
    importPath: 'antd',
    keywords: ['form', '表单'],
    features: { minChildren: 1 },
    usageExample:
      '<Form layout="vertical"><Form.Item label="名称" name="name"><Input /></Form.Item></Form>',
  },
  {
    name: 'Modal',
    library: 'ant-design',
    importPath: 'antd',
    keywords: ['modal', 'dialog', '弹窗', '对话框', '模态框'],
    features: { minChildren: 1 },
    usageExample:
      '<Modal title="确认操作" open={open} onOk={handleOk} onCancel={handleCancel}>内容</Modal>',
  },
  {
    name: 'Tabs',
    library: 'ant-design',
    importPath: 'antd',
    keywords: ['tabs', 'tab bar', '标签页', '选项卡'],
    features: { minChildren: 2 },
    usageExample:
      '<Tabs items={[{ key: "1", label: "标签 1", children: "内容 1" }, { key: "2", label: "标签 2", children: "内容 2" }]} />',
  },
  {
    name: 'Checkbox',
    library: 'ant-design',
    importPath: 'antd',
    keywords: ['checkbox', 'check', '复选框'],
    features: { isInteractive: true },
    usageExample: '<Checkbox>同意协议</Checkbox>',
  },
  {
    name: 'Switch',
    library: 'ant-design',
    importPath: 'antd',
    keywords: ['switch', 'toggle', '开关'],
    features: { isInteractive: true },
    usageExample: '<Switch defaultChecked />',
  },
  {
    name: 'RadioGroup',
    library: 'ant-design',
    importPath: 'antd',
    keywords: ['radio', '单选', 'radio group'],
    features: { isInteractive: true, minChildren: 2 },
    usageExample:
      '<Radio.Group options={[{ value: "a", label: "选项 A" }, { value: "b", label: "选项 B" }]} />',
  },
  {
    name: 'Card',
    library: 'ant-design',
    importPath: 'antd',
    keywords: ['card', '卡片'],
    features: { hasBackground: true, minChildren: 1 },
    usageExample: '<Card title="卡片标题"><p>卡片内容</p></Card>',
  },
  {
    name: 'Table',
    library: 'ant-design',
    importPath: 'antd',
    keywords: ['table', 'data table', '表格', '数据表'],
    features: { hasBackground: true, minChildren: 1 },
    usageExample: '<Table columns={columns} dataSource={data} rowKey="id" />',
  },
  {
    name: 'Tag',
    library: 'ant-design',
    importPath: 'antd',
    keywords: ['tag', 'badge', '标签', '标记'],
    features: { hasText: true, hasBackground: true },
    usageExample: '<Tag color="blue">标签</Tag>',
  },
  {
    name: 'DatePicker',
    library: 'ant-design',
    importPath: 'antd',
    keywords: ['date picker', 'datepicker', 'calendar', '日期选择', '日期'],
    features: { isInteractive: true },
    usageExample: '<DatePicker />',
  },
  {
    name: 'Tooltip',
    library: 'ant-design',
    importPath: 'antd',
    keywords: ['tooltip', '提示框'],
    features: { hasText: true },
    usageExample: '<Tooltip title="提示文本"><span>悬停我</span></Tooltip>',
  },
];

/**
 * Element Plus 常用组件映射（Vue SFC 模板以 el-* 使用）
 *
 * 说明：Modal 语义对应 ElDialog；Form 以 el-form + el-form-item 组合示例。
 */
const ELEMENT_PLUS_COMPONENTS: readonly BuiltinComponentDef[] = [
  {
    name: 'ElButton',
    library: 'element-plus',
    importPath: 'element-plus',
    keywords: ['button', 'btn', '按钮'],
    features: { hasText: true, isInteractive: true, hasBackground: true },
    usageExample: '<el-button type="primary">确定</el-button>',
  },
  {
    name: 'ElInput',
    library: 'element-plus',
    importPath: 'element-plus',
    keywords: ['input', '输入框', 'textfield', 'text field', '文本框'],
    features: { isInteractive: true },
    usageExample: '<el-input v-model="value" placeholder="请输入" />',
  },
  {
    name: 'ElInputTextarea',
    library: 'element-plus',
    importPath: 'element-plus',
    keywords: ['textarea', '多行输入', 'text area'],
    features: { isInteractive: true },
    usageExample: '<el-input v-model="value" type="textarea" :rows="4" />',
  },
  {
    name: 'ElSelect',
    library: 'element-plus',
    importPath: 'element-plus',
    keywords: ['select', 'dropdown', 'picker', '下拉', '选择器'],
    features: { isInteractive: true, minChildren: 1 },
    usageExample:
      '<el-select v-model="value" placeholder="请选择"><el-option label="选项 A" value="a" /></el-select>',
  },
  {
    name: 'ElForm',
    library: 'element-plus',
    importPath: 'element-plus',
    keywords: ['form', '表单'],
    features: { minChildren: 1 },
    usageExample:
      '<el-form :model="form"><el-form-item label="名称"><el-input v-model="form.name" /></el-form-item></el-form>',
  },
  {
    name: 'ElDialog',
    library: 'element-plus',
    importPath: 'element-plus',
    keywords: ['modal', 'dialog', '弹窗', '对话框', '模态框'],
    features: { minChildren: 1 },
    usageExample:
      '<el-dialog v-model="visible" title="确认操作"><span>内容</span><template #footer><el-button @click="visible = false">取消</el-button></template></el-dialog>',
  },
  {
    name: 'ElTabs',
    library: 'element-plus',
    importPath: 'element-plus',
    keywords: ['tabs', 'tab bar', '标签页', '选项卡'],
    features: { minChildren: 2 },
    usageExample:
      '<el-tabs v-model="active"><el-tab-pane label="标签 1" name="1">内容 1</el-tab-pane><el-tab-pane label="标签 2" name="2">内容 2</el-tab-pane></el-tabs>',
  },
  {
    name: 'ElCheckbox',
    library: 'element-plus',
    importPath: 'element-plus',
    keywords: ['checkbox', 'check', '复选框'],
    features: { isInteractive: true },
    usageExample: '<el-checkbox v-model="checked">同意协议</el-checkbox>',
  },
  {
    name: 'ElSwitch',
    library: 'element-plus',
    importPath: 'element-plus',
    keywords: ['switch', 'toggle', '开关'],
    features: { isInteractive: true },
    usageExample: '<el-switch v-model="checked" />',
  },
  {
    name: 'ElRadioGroup',
    library: 'element-plus',
    importPath: 'element-plus',
    keywords: ['radio', '单选', 'radio group'],
    features: { isInteractive: true, minChildren: 2 },
    usageExample:
      '<el-radio-group v-model="pick"><el-radio value="a">选项 A</el-radio><el-radio value="b">选项 B</el-radio></el-radio-group>',
  },
  {
    name: 'ElCard',
    library: 'element-plus',
    importPath: 'element-plus',
    keywords: ['card', '卡片'],
    features: { hasBackground: true, minChildren: 1 },
    usageExample: '<el-card><template #header>卡片标题</template><p>卡片内容</p></el-card>',
  },
  {
    name: 'ElTable',
    library: 'element-plus',
    importPath: 'element-plus',
    keywords: ['table', 'data table', '表格', '数据表'],
    features: { hasBackground: true, minChildren: 1 },
    usageExample: '<el-table :data="tableData"><el-table-column prop="name" label="名称" /></el-table>',
  },
  {
    name: 'ElTag',
    library: 'element-plus',
    importPath: 'element-plus',
    keywords: ['tag', '标签', '标记'],
    features: { hasText: true, hasBackground: true },
    usageExample: '<el-tag type="primary">标签</el-tag>',
  },
  {
    name: 'ElDatePicker',
    library: 'element-plus',
    importPath: 'element-plus',
    keywords: ['date picker', 'datepicker', 'calendar', '日期选择', '日期'],
    features: { isInteractive: true },
    usageExample: '<el-date-picker v-model="date" type="date" />',
  },
  {
    name: 'ElTooltip',
    library: 'element-plus',
    importPath: 'element-plus',
    keywords: ['tooltip', '提示框'],
    features: { hasText: true },
    usageExample: '<el-tooltip content="提示文本"><span>悬停我</span></el-tooltip>',
  },
];

/** 全部内建新增组件定义（antd + element-plus） */
export const BUILTIN_COMPONENT_DEFS: readonly BuiltinComponentDef[] = [
  ...ANT_DESIGN_COMPONENTS,
  ...ELEMENT_PLUS_COMPONENTS,
];

/**
 * 按库取内建设计表（供 mapper 查表）
 *
 * @param library - 目标组件库
 * @returns 该库的组件定义；未知库返回空表
 */
export function getBuiltinDefsForLibrary(
  library: ComponentLibrary,
): readonly BuiltinComponentDef[] {
  if (library === 'ant-design') return ANT_DESIGN_COMPONENTS;
  if (library === 'element-plus') return ELEMENT_PLUS_COMPONENTS;
  return [];
}
