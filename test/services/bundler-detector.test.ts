/**
 * 构建器检测器单元测试（T4 / TR-4.1）
 *
 * 全部使用内存文件系统接缝，不触碰真实磁盘：
 * 1. 四类典型项目 fixture（Next.js / Remix / Vite / Webpack）识别
 * 2. 空项目 → none
 * 3. 多构建器共存时的确定性优先级（next > remix > vite > webpack）
 * 4. package.json 损坏时降级为配置文件检测，绝不抛异常
 * 5. 检测路径拼接与 reason 溯源
 */
import { describe, it, expect } from 'vitest';

import {
  detectBundler,
  type BundlerDetectorSeams,
  type BundlerKind,
} from '../../src/services/bundler-detector.js';

/** 内存文件系统 fixture 构造 */
function makeMemorySeams(files: Record<string, string>): BundlerDetectorSeams {
  const normalized = new Map<string, string>();
  for (const [key, value] of Object.entries(files)) {
    // 统一为 POSIX 风格绝对路径，匹配 path.join 在 projectRoot 下的拼接结果
    normalized.set(key.replace(/\\/g, '/'), value);
  }
  return {
    readTextFile: async (absPath: string) => normalized.get(absPath.replace(/\\/g, '/')),
    pathExists: async (absPath: string) => normalized.has(absPath.replace(/\\/g, '/')),
  };
}

/** 生成 package.json 内容 */
function pkg(json: {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}): string {
  return JSON.stringify(json);
}

describe('bundler-detector：构建器检测（TR-4.1）', () => {
  const ROOT = '/virtual/project';

  it('fixture 1：依赖含 next → nextjs', async () => {
    const seams = makeMemorySeams({
      [`${ROOT}/package.json`]: pkg({ dependencies: { next: '14.2.5', react: '18.3.1' } }),
    });
    const result = await detectBundler(ROOT, seams);
    expect(result.kind).toBe('nextjs');
    expect(result.reason).toContain('next');
  });

  it('fixture 2：依赖含 @remix-run/react → remix', async () => {
    const seams = makeMemorySeams({
      [`${ROOT}/package.json`]: pkg({ dependencies: { '@remix-run/react': '2.9.2' } }),
    });
    const result = await detectBundler(ROOT, seams);
    expect(result.kind).toBe('remix');
    expect(result.reason).toContain('@remix-run/react');
  });

  it('fixture 2b：存在 remix.config.js 但无依赖 → remix', async () => {
    const seams = makeMemorySeams({
      [`${ROOT}/package.json`]: pkg({ dependencies: { react: '18.3.1' } }),
      [`${ROOT}/remix.config.js`]: 'module.exports = {};',
    });
    const result = await detectBundler(ROOT, seams);
    expect(result.kind).toBe('remix');
    expect(result.reason).toContain('remix.config');
  });

  it('fixture 3：devDependencies 含 vite → vite', async () => {
    const seams = makeMemorySeams({
      [`${ROOT}/package.json`]: pkg({ devDependencies: { vite: '5.0.0' } }),
    });
    const result = await detectBundler(ROOT, seams);
    expect(result.kind).toBe('vite');
    expect(result.reason).toContain('vite');
  });

  it('fixture 3b：仅有 vite.config.ts 配置文件 → vite', async () => {
    const seams = makeMemorySeams({
      [`${ROOT}/package.json`]: pkg({ devDependencies: { typescript: '5.4.0' } }),
      [`${ROOT}/vite.config.ts`]: 'export default {};',
    });
    const result = await detectBundler(ROOT, seams);
    expect(result.kind).toBe('vite');
    expect(result.reason).toContain('vite.config');
  });

  it('fixture 4：仅有 webpack.config.js 配置文件 → webpack', async () => {
    const seams = makeMemorySeams({
      [`${ROOT}/package.json`]: pkg({ devDependencies: { 'webpack-cli': '5.1.4' } }),
      [`${ROOT}/webpack.config.js`]: 'module.exports = {};',
    });
    const result = await detectBundler(ROOT, seams);
    expect(result.kind).toBe('webpack');
    expect(result.reason).toContain('webpack');
  });

  it('fixture 4b：devDependencies 含 webpack（无配置文件）→ webpack', async () => {
    const seams = makeMemorySeams({
      [`${ROOT}/package.json`]: pkg({ devDependencies: { webpack: '5.91.0' } }),
    });
    const result = await detectBundler(ROOT, seams);
    expect(result.kind).toBe('webpack');
  });

  it('空项目（无 package.json 无配置）→ none，不抛异常', async () => {
    const result = await detectBundler(ROOT, makeMemorySeams({}));
    expect(result.kind).toBe('none');
    expect(result.reason).toBeTruthy();
  });

  it('package.json 为损坏 JSON 时降级到配置文件检测（vite.config.mts 仍可识别）', async () => {
    const seams = makeMemorySeams({
      [`${ROOT}/package.json`]: '{ "dependencies": { "vite": "5.0.0" ,, broken }',
      [`${ROOT}/vite.config.mts`]: 'export default {};',
    });
    const result = await detectBundler(ROOT, seams);
    expect(result.kind).toBe('vite');
  });

  it('优先级：next + @remix-run/react + vite + webpack 共存 → nextjs', async () => {
    const seams = makeMemorySeams({
      [`${ROOT}/package.json`]: pkg({
        dependencies: { next: '14.0.0', '@remix-run/react': '2.0.0' },
        devDependencies: { vite: '5.0.0', webpack: '5.0.0' },
      }),
      [`${ROOT}/vite.config.ts`]: '',
      [`${ROOT}/webpack.config.js`]: '',
    });
    expect((await detectBundler(ROOT, seams)).kind).toBe('nextjs');
  });

  it('优先级：remix + vite 共存（Remix 官方 vite 模板）→ remix', async () => {
    const seams = makeMemorySeams({
      [`${ROOT}/package.json`]: pkg({
        dependencies: { '@remix-run/react': '2.9.0' },
        devDependencies: { vite: '5.4.0', '@remix-run/dev': '2.9.0' },
      }),
      [`${ROOT}/vite.config.ts`]: '',
    });
    expect((await detectBundler(ROOT, seams)).kind).toBe('remix');
  });

  it('优先级：vite + webpack 共存 → vite', async () => {
    const seams = makeMemorySeams({
      [`${ROOT}/package.json`]: pkg({ devDependencies: { vite: '5.0.0', webpack: '5.0.0' } }),
    });
    expect((await detectBundler(ROOT, seams)).kind).toBe('vite');
  });

  it('peerDependencies 中的 next 也可识别（monorepo 场景）', async () => {
    const seams = makeMemorySeams({
      [`${ROOT}/package.json`]: pkg({ peerDependencies: { next: '>=13' } }),
    });
    expect((await detectBundler(ROOT, seams)).kind).toBe('nextjs');
  });

  it('检测过程读取的路径必须位于 projectRoot 下（接缝可观测）', async () => {
    const readPaths: string[] = [];
    const seams: BundlerDetectorSeams = {
      readTextFile: async (p) => {
        readPaths.push(p);
        return p.replace(/\\/g, '/').endsWith('package.json') ? pkg({ dependencies: { vite: '5.0.0' } }) : undefined;
      },
      pathExists: async () => false,
    };
    const result = await detectBundler(ROOT, seams);
    expect(result.kind).toBe('vite');
    expect(readPaths.some((p) => p.replace(/\\/g, '/') === `${ROOT}/package.json`)).toBe(true);
  });

  it('BundlerKind 联合类型仅包含约定的 5 个值', () => {
    const kinds: BundlerKind[] = ['vite', 'webpack', 'nextjs', 'remix', 'none'];
    expect(kinds).toHaveLength(5);
  });
});
