/**
 * 资源路径/引用规划纯函数单元测试（T4 / TR-4.2）
 *
 * 核心：同一含图节点（固定 urlPath）在 5 类构建器 × 2 框架下的引用形态快照，
 * 快照一旦变化即视为资源契约变更，需人工确认。
 */
import { describe, it, expect } from 'vitest';

import {
  getAssetRootDir,
  resolveAssetPrefix,
  sanitizeAssetFileName,
  toAssetVarName,
  normalizeAssetUrlPath,
  planAssetReference,
  type BundlerKind,
} from '../../src/services/asset-paths.js';

describe('asset-paths：落位目录与前缀', () => {
  it('none/nextjs/remix 落 public；vite/webpack 落 src/assets', () => {
    expect(getAssetRootDir('none')).toBe('public');
    expect(getAssetRootDir('nextjs')).toBe('public');
    expect(getAssetRootDir('remix')).toBe('public');
    expect(getAssetRootDir('vite')).toBe('src/assets');
    expect(getAssetRootDir('webpack')).toBe('src/assets');
  });

  it('resolveAssetPrefix：显式前缀优先，否则 portal/<sanitized 场景名>', () => {
    expect(resolveAssetPrefix('custom/scene', 'ignored')).toBe('custom/scene');
    expect(resolveAssetPrefix(undefined, 'C Nexus Home')).toBe('portal/c_nexus_home');
    expect(resolveAssetPrefix('', 'Edu')).toBe('portal/edu');
  });

  it('sanitizeAssetFileName 规则与 1.4.17 下载器一致（小写/非法字符→下划线）', () => {
    expect(sanitizeAssetFileName('Hero Banner!@#.png')).toBe('hero_banner.png');
    expect(sanitizeAssetFileName('a/b:c?d')).toBe('a_b_c_d');
  });
});

describe('asset-paths：变量名生成', () => {
  it('toAssetVarName：文件名 → camelCase 带扩展后缀', () => {
    expect(toAssetVarName('/portal/edu/hero-banner.png')).toBe('heroBannerPng');
    expect(toAssetVarName('/x/icon.svg')).toBe('iconSvg');
    expect(toAssetVarName('/a/a.b.jpg')).toBe('aBJpg');
  });

  it('数字开头的文件名补 asset 前缀，保证是合法标识符', () => {
    expect(toAssetVarName('/p/1x.png')).toBe('asset1xPng');
  });
});

describe('asset-paths：urlPath 归一化', () => {
  it('裸路径原样返回', () => {
    expect(normalizeAssetUrlPath('/portal/edu/a.png')).toBe('/portal/edu/a.png');
  });

  it('已被 publicCdnUrl() 包裹的串提取内部路径（防止双重包裹）', () => {
    expect(normalizeAssetUrlPath("publicCdnUrl('/portal/edu/a.png')")).toBe('/portal/edu/a.png');
    expect(normalizeAssetUrlPath('publicCdnUrl("/x.png")')).toBe('/x.png');
  });
});

describe('asset-paths：TR-4.2 五构建器资源引用快照（同一含图节点）', () => {
  /** 同一含图节点下载后得到的资源根相对 URL（下载器 localPath 形态） */
  const URL_PATH = '/portal/edu/hero-banner.png';
  const VAR_NAME = 'heroBannerPng';
  const BUNDLERS: BundlerKind[] = ['none', 'nextjs', 'remix', 'vite', 'webpack'];

  for (const bundler of BUNDLERS) {
    it(`bundler = ${bundler}`, () => {
      expect(planAssetReference({ bundler, urlPath: URL_PATH, varName: VAR_NAME })).toMatchSnapshot();
    });
  }

  it('none 必须逐字节保持 1.4.17 形态：publicCdnUrl 表达式、零 import、public 落位', () => {
    const planned = planAssetReference({ bundler: 'none', urlPath: URL_PATH, varName: VAR_NAME });
    expect(planned).toEqual({
      kind: 'public-cdn',
      expression: "publicCdnUrl('/portal/edu/hero-banner.png')",
      imports: [],
      assetDir: 'public/portal/edu',
    });
  });

  it('next/remix 为 public 绝对路径字符串字面量，零 import', () => {
    for (const bundler of ['nextjs', 'remix'] as const) {
      const planned = planAssetReference({ bundler, urlPath: URL_PATH, varName: VAR_NAME });
      expect(planned.kind).toBe('public-absolute');
      expect(planned.expression).toBe("'/portal/edu/hero-banner.png'");
      expect(planned.imports).toEqual([]);
      expect(planned.assetDir).toBe('public/portal/edu');
    }
  });

  it('vite：ESM import 路径固定走 @/assets 别名（单引号），变量名即表达式', () => {
    const planned = planAssetReference({ bundler: 'vite', urlPath: URL_PATH, varName: VAR_NAME });
    expect(planned.kind).toBe('esm-import');
    expect(planned.expression).toBe('heroBannerPng');
    expect(planned.imports).toEqual([
      "import heroBannerPng from '@/assets/portal/edu/hero-banner.png';",
    ]);
    expect(planned.assetDir).toBe('src/assets/portal/edu');
  });

  it('webpack：require 表达式（单引号），零 import', () => {
    const planned = planAssetReference({ bundler: 'webpack', urlPath: URL_PATH, varName: VAR_NAME });
    expect(planned.kind).toBe('require');
    expect(planned.expression).toBe("require('@/assets/portal/edu/hero-banner.png')");
    expect(planned.imports).toEqual([]);
  });

  it('非法输入：urlPath 非 / 开头抛错（避免产出静默错误路径）', () => {
    expect(() =>
      planAssetReference({ bundler: 'vite', urlPath: 'portal/edu/a.png', varName: 'aPng' }),
    ).toThrow(/urlPath/);
  });

  it('非法输入：esm 场景 varName 非合法标识符抛错', () => {
    expect(() =>
      planAssetReference({ bundler: 'vite', urlPath: '/a.png', varName: '1bad-name' }),
    ).toThrow(/varName/);
  });
});
