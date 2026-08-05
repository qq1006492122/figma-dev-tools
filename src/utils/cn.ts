/**
 * 类名合并工具 - Class Name Utility
 *
 * 基于 clsx + tailwind-merge 的智能类名合并函数，专门为 Tailwind CSS 设计：
 * - 自动过滤 falsy 值（false、null、undefined、0、''）
 * - 支持嵌套数组递归展开
 * - 使用 tailwind-merge 智能解决 Tailwind 类名冲突（如 p-2 px-4 → px-4 py-2）
 * - 支持对象形式条件类名（{ 'class-name': condition }）
 *
 * @module
 */

import { clsx, type ClassValue as ClsxClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * 可传入 cn() 的类名值类型
 *
 * 支持：
 * - 字符串：直接作为类名
 * - 数字：转为字符串作为类名
 * - false/null/undefined：被过滤掉
 * - 嵌套数组：递归展开处理
 * - 对象：key 为类名，value 为布尔值控制是否包含
 */
export type ClassValue = ClsxClassValue;

/**
 * 合并 CSS 类名（支持 Tailwind 类名智能去重/冲突解决）
 *
 * 将多个类名参数合并为以空格分隔的单个字符串，
 * 自动过滤所有 falsy 值，支持数组/对象递归展开，
 * 并通过 tailwind-merge 智能解决 Tailwind 类名冲突。
 *
 * @param inputs - 任意数量的类名参数（字符串、数字、对象、数组、falsy 值）
 * @returns 合并并处理冲突后的类名字符串
 *
 * @example
 * ```typescript
 * // 基础用法
 * cn('flex', 'items-center');
 *
 * // Tailwind 冲突自动解决（后面的类名覆盖前面的冲突类名）
 * cn('p-2', 'px-4');          // → "py-2 px-4"
 * cn('text-red-500', 'text-blue-500');  // → "text-blue-500"
 *
 * // 条件类名
 * cn('text-sm', isActive && 'font-bold', { 'opacity-50': isDisabled });
 * ```
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
