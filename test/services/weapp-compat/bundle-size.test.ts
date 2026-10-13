/**
 * 小程序主包体积核算测试（WBS-P0-23）
 *
 * 契约（ROADMAP P0-1.2）：阈值作用于整个主包；>1.5MB 预警、>2MB 阻断；
 * 阻断错误码 FDT-WEAPP-BUNDLE-EXCEEDED 且 CLI 退出码 2；无 app.json 的裸目录
 * 只报自身字节并标注"非全主包口径，阈值不生效"；给出 subpackages 建议。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  measureMainPackage,
  MB,
  WARN_BYTES,
  BLOCK_BYTES,
  type BundleFileInput,
} from '../../../src/services/weapp-compat/bundle-size.js';

function makeFiles(root: string, entries: Array<[string, number | string]>): void {
  for (const [rel, content] of entries) {
    const abs = join(root, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    if (typeof content === 'number') {
      writeFileSync(abs, Buffer.alloc(content));
    } else {
      writeFileSync(abs, content);
    }
  }
}

/** 按全主包口径核算内联文件（阈值生效） */
function measure(files: BundleFileInput[]) {
  return measureMainPackage({ files, assumeFullProject: true });
}

describe('P0-23 阈值常量', () => {
  it('1.5MB 预警、2MB 阻断（字节口径）', () => {
    expect(WARN_BYTES).toBe(1.5 * MB);
    expect(BLOCK_BYTES).toBe(2 * MB);
    expect(MB).toBe(1024 * 1024);
  });
});

describe('P0-23 内联输入核算（不依赖磁盘）', () => {
  function run(files: BundleFileInput[]) {
    return measureMainPackage({ files });
  }

  it('低于 1.5MB：ok，无 warning/阻断', () => {
    const r = run([{ path: 'app.js', bytes: 100 * 1024, inMainPackage: true }]);
    expect(r.status).toBe('ok');
    expect(r.blocked).toBe(false);
    expect(r.totalBytes).toBe(100 * 1024);
    expect(r.isFullProject).toBe(false);
    expect(r.scopeWarning).toContain('非全主包');
    expect(r.subpackageSuggestions).toEqual([]);
  });

  it('1.5~2MB：warn 状态但不阻断', () => {
    const r = measure([{ path: 'big.js', bytes: WARN_BYTES + 1, inMainPackage: true }]);
    expect(r.status).toBe('warn');
    expect(r.blocked).toBe(false);
    expect(r.warnings[0]!.code).toBe('FDT-WEAPP-BUNDLE-WARN');
  });

  it('超过 2MB：blocked，错误码 FDT-WEAPP-BUNDLE-EXCEEDED', () => {
    const r = measure([{ path: 'huge.png', bytes: BLOCK_BYTES + 1, inMainPackage: true }]);
    expect(r.status).toBe('blocked');
    expect(r.blocked).toBe(true);
    expect(r.errorCode).toBe('FDT-WEAPP-BUNDLE-EXCEEDED');
    expect(r.exitCode).toBe(2);
  });

  it('只统计主包文件：分包 root 下字节不计入 total', () => {
    const r = measure([
      { path: 'app.js', bytes: BLOCK_BYTES, inMainPackage: true },
      { path: 'pkgA/a.js', bytes: BLOCK_BYTES, inMainPackage: false, subPackage: 'pkgA' },
    ]);
    // 主包仍超（app.js 自身即超），但 total 不含分包
    expect(r.totalBytes).toBe(BLOCK_BYTES);
    expect(r.subPackageBytes).toEqual({ pkgA: BLOCK_BYTES });
  });

  it('按大小给出 subpackages 外移建议（最大的可外移主包文件优先）', () => {
    const r = measure([
      { path: 'images/a.png', bytes: 900 * 1024, inMainPackage: true },
      { path: 'images/b.png', bytes: 800 * 1024, inMainPackage: true },
      { path: 'app.js', bytes: 10 * 1024, inMainPackage: true },
    ]);
    // 总 1.66MB → warn，建议把大图移到分包
    expect(r.status).toBe('warn');
    expect(r.subpackageSuggestions.length).toBeGreaterThan(0);
    expect(r.subpackageSuggestions[0]!.path).toBe('images/a.png');
    expect(r.subpackageSuggestions[0]!.bytes).toBe(900 * 1024);
    // 建议外移量足以把主包压回预警线以下
    const suggestedMove = r.subpackageSuggestions.reduce((s, x) => s + x.bytes, 0);
    expect(r.totalBytes - suggestedMove).toBeLessThanOrEqual(WARN_BYTES);
  });

  it('代码文件（.js/.wxml/.wxss/.json/.wxs）不建议外移（会破坏主包页面）', () => {
    const r = measure([
      { path: 'pages/index/index.js', bytes: 900 * 1024, inMainPackage: true },
      { path: 'vendor.js', bytes: 900 * 1024, inMainPackage: true },
    ]);
    expect(r.subpackageSuggestions.every((s) => !/\.(js|wxml|wxss|json|wxs)$/.test(s.path))).toBe(true);
  });
});

describe('P0-23 真实工程扫描（app.json 决定全主包口径）', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'fdt-bundle-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('含 app.json：全主包口径，pages 与根资源计入、subPackages root 排除', () => {
    makeFiles(root, [
      ['app.json', JSON.stringify({ pages: ['pages/index/index', 'pages/me/me'], subPackages: [{ root: 'pkgA', pages: ['detail/detail'] }] })],
      ['app.js', 100],
      ['app.wxss', 50],
      ['pages/index/index.js', 200],
      ['pages/index/index.wxml', 300],
      ['images/logo.png', 400],
      ['pkgA/detail/detail.js', 5000], // 分包，不计主包
      ['pkgA/big.png', 7000],
      ['node_modules/x/index.js', 9999], // 依赖不进小程序包
    ]);
    const r = measureMainPackage({ projectRoot: root });
    expect(r.isFullProject).toBe(true);
    expect(r.scopeWarning).toBe('');
    // 100+50+200+300+400 = 1050
    expect(r.totalBytes).toBe(1050);
    expect(r.subPackageBytes).toEqual({ pkgA: 12000 });
    expect(r.files.some((f) => f.path.includes('node_modules'))).toBe(false);
  });

  it('app.json 损坏：返回结构化错误而非抛异常', () => {
    makeFiles(root, [['app.json', '{ not valid json']]);
    const r = measureMainPackage({ projectRoot: root });
    expect(r.status).toBe('error');
    expect(r.warnings[0]!.code).toBe('FDT-WEAPP-APPJSON-INVALID');
  });

  it('空目录（无 app.json）：非全主包口径，阈值不生效', () => {
    makeFiles(root, [['comp.wxml', 200], ['comp.js', 300]]);
    const r = measureMainPackage({ projectRoot: root });
    expect(r.isFullProject).toBe(false);
    expect(r.status).toBe('ok'); // 阈值不生效，即便数值超也不阻断
    expect(r.totalBytes).toBe(500);
    expect(r.scopeWarning).toContain('非全主包');
  });

  it('超大图片使全主包 >2MB：blocked + 退出码 2', () => {
    makeFiles(root, [
      ['app.json', JSON.stringify({ pages: ['pages/index/index'] })],
      ['pages/index/index.js', 100],
      ['images/hero.png', BLOCK_BYTES + 10],
    ]);
    const r = measureMainPackage({ projectRoot: root });
    expect(r.status).toBe('blocked');
    expect(r.exitCode).toBe(2);
    expect(r.errorCode).toBe('FDT-WEAPP-BUNDLE-EXCEEDED');
  });
});
