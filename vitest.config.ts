/**
 * Vitest 测试配置
 *
 * 配置测试环境、覆盖率收集与文件匹配规则。
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 测试环境：Node.js（服务端代码无需 DOM）
    environment: 'node',
    // 测试文件匹配模式
    include: ['test/**/*.test.ts'],
    // 排除构建产物与依赖
    exclude: ['dist/**', 'node_modules/**'],
    // 超时设置：30 秒（部分测试涉及文件 I/O）
    testTimeout: 30000,
    // 钩子超时：10 秒
    hookTimeout: 10000,
    // 覆盖率配置
    coverage: {
      provider: 'v8',
      include: ['src/services/browser-fallback.ts', 'src/services/visual-approximation.ts', 'src/services/fidelity-verify.ts'],
      exclude: ['test/**', 'dist/**', 'node_modules/**'],
    },
  },
});
