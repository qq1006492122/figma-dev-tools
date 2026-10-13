/**
 * 子命令 `--output` 与全局同名选项冲突的回收（WBS-R1 QA 发现）
 *
 * commander 中父程序定义了 `-o, --output <dir>`（token 同步目录，
 * 默认 ./src/styles/figma），而 component/lint/structured/jsx/vue/svelte/weapp
 * 子命令又各自定义了 `--output <file|dir>`。父子同名时，子命令后传入的
 * `--output` 会被解析进**父程序**选项袋（子命令 opts.output 恒为 undefined），
 * 导致「打印到屏幕而非写文件」的静默失效。
 *
 * 本纯函数在各子命令 action 内回收该值：
 * - 子命令自身取到值（commander 未来行为变化或短参数场景）→ 优先；
 * - 否则取父程序袋中的值，但跳过全局默认值（避免把 token 目录误当输出文件）；
 * - 都没有 → undefined，由调用方按各命令语义兜底（如 weapp 的 './'）。
 *
 * @module cli/sub-output
 */

/** 全局 --output 的默认值（与 program.option 声明保持单一来源） */
export const GLOBAL_OUTPUT_DEFAULT = './src/styles/figma';

/**
 * 解析子命令实际生效的输出路径。
 *
 * @param subOutput - 子命令 action 收到的 cmdOptions.output
 * @param globalOutput - program.opts().output（全局 token 目录）
 * @returns 生效的输出路径；均不可用时返回 undefined
 */
export function resolveSubcommandOutput(
  subOutput: string | undefined,
  globalOutput: string | undefined,
): string | undefined {
  if (typeof subOutput === 'string' && subOutput.length > 0) return subOutput;
  if (
    typeof globalOutput === 'string' &&
    globalOutput.length > 0 &&
    globalOutput !== GLOBAL_OUTPUT_DEFAULT
  ) {
    return globalOutput;
  }
  return undefined;
}
