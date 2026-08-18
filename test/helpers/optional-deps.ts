/**
 * 测试公共工具：可选依赖安装状态探测
 *
 * playwright / pixelmatch / pngjs 等是 optionalDependencies，
 * 测试环境可能已安装也可能未安装，相关断言必须基于真实安装状态
 * 动态判断，而非硬编码假设。
 */

/**
 * 探测可选依赖模块是否已安装（能否被动态 import）
 *
 * @param name 模块名，如 'playwright'、'pixelmatch'
 * @returns 已安装返回 true；未安装或导入失败返回 false
 */
export async function isModuleResolvable(name: string): Promise<boolean> {
  try {
    await import(name);
    return true;
  } catch {
    return false;
  }
}

/**
 * 探测多个可选依赖是否全部已安装
 *
 * @param names 模块名列表
 * @returns 全部已安装返回 true；任一未安装返回 false
 */
export async function areModulesResolvable(names: string[]): Promise<boolean> {
  const results = await Promise.all(names.map((name) => isModuleResolvable(name)));
  return results.every(Boolean);
}
