/**
 * 轻量级类名合并工具
 *
 * 独立实现的 cn() 函数，用于条件性地拼接 CSS 类名。
 * 自动过滤 falsy 值（false、null、undefined、0、''），
 * 支持嵌套数组递归展开。
 *
 * 设计为零外部依赖，不依赖 clsx 或 tailwind-merge，
 * 保持 skill 包的轻量性。
 *
 * @module
 */

/**
 * 可传入 cn() 的类名值类型
 *
 * 支持：
 * - 字符串：直接作为类名
 * - 数字：转为字符串作为类名
 * - false/null/undefined：被过滤掉
 * - 嵌套数组：递归展开处理
 *
 * 注意：不支持对象形式（如 { 'class-name': condition }），
 * 如需条件类名请使用 && 或三元表达式。
 */
export type ClassValue = string | number | null | undefined | false | readonly ClassValue[];

/**
 * 合并 CSS 类名
 *
 * 将多个类名参数合并为以空格分隔的单个字符串，
 * 自动过滤所有 falsy 值，并支持数组递归嵌套。
 *
 * @param inputs - 任意数量的类名参数
 * @returns 合并后的类名字符串
 *
 * @example
 * ```typescript
 * cn('flex', 'items-center');
 * // "flex items-center"
 *
 * cn('flex', false && 'hidden', undefined, null, 'p-4');
 * // "flex p-4"
 *
 * cn('text-sm', isActive && 'font-bold', ['px-2', 'py-1']);
 * // isActive=true:  "text-sm font-bold px-2 py-1"
 * // isActive=false: "text-sm px-2 py-1"
 * ```
 *
 * 边界情况：
 * - 空参数或全 falsy 值返回空字符串
 * - 数字会被转为字符串（如 cn(1) → "1"）
 * - 嵌套数组会被递归展开
 * - 不做类名去重（如有需要请自行保证类名不冲突）
 */
export function cn(...inputs: ClassValue[]): string {
  const output: string[] = [];
  for (const value of inputs) {
    if (!value) continue;
    if (typeof value === 'string' || typeof value === 'number') {
      output.push(String(value));
    } else if (Array.isArray(value)) {
      const nestedResult = cn(...value);
      if (nestedResult) {
        output.push(nestedResult);
      }
    }
  }
  return output.join(' ');
}
