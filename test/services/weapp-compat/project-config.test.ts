/**
 * 小程序工程配置建议与安全落盘测试（WBS-P0-71）
 *
 * 验收：自动工程改写为 0（不覆盖已有 app.json/project.config.json，只出建议）；
 * 路径越权拒绝；输出 JSON 可解析。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  buildAppJsonSuggestion,
  buildProjectConfigSuggestion,
  resolveSafeOutputPath,
  writeSuggestionSafely,
  FROZEN_LIB_VERSION,
} from '../../../src/services/weapp-compat/project-config.js';

describe('P0-71 app.json 建议（不自动改写工程）', () => {
  it('空工程：生成含 pages 注册的最小 app.json，JSON 可解析', () => {
    const s = buildAppJsonSuggestion(null, ['pages/index/index']);
    expect(s.alreadyExisted).toBe(false);
    const parsed = JSON.parse(s.jsonText);
    expect(parsed.pages).toEqual(['pages/index/index']);
    expect(parsed.window).toBeTruthy();
  });

  it('已有 app.json：合并去重新页面、保留既有字段，标记 alreadyExisted（不覆盖）', () => {
    const existing = {
      pages: ['pages/index/index'],
      window: { navigationBarTitleText: '已有' },
      subPackages: [{ root: 'pkgA', pages: ['detail/detail'] }],
    };
    const s = buildAppJsonSuggestion(existing, ['pages/me/me', 'pages/index/index']);
    expect(s.alreadyExisted).toBe(true);
    const parsed = JSON.parse(s.jsonText);
    expect(parsed.pages).toEqual(['pages/index/index', 'pages/me/me']);
    expect(parsed.subPackages).toEqual([{ root: 'pkgA', pages: ['detail/detail'] }]);
    expect(parsed.window.navigationBarTitleText).toBe('已有');
  });
});

describe('P0-71 project.config.json 建议（含冻结基础库）', () => {
  it('生成可解析配置，libVersion 取自冻结基线 3.1.5', () => {
    const s = buildProjectConfigSuggestion(null, { appid: 'touristappid', projectName: 'demo' });
    const parsed = JSON.parse(s.jsonText);
    expect(parsed.libVersion).toBe(FROZEN_LIB_VERSION);
    expect(FROZEN_LIB_VERSION).toBe('3.1.5');
    expect(parsed.appid).toBe('touristappid');
    expect(parsed.setting).toBeTruthy();
  });

  it('已有配置：保留 appid 等字段，仅补 libVersion', () => {
    const s = buildProjectConfigSuggestion({ appid: 'wx123', setting: { es6: false } }, {});
    const parsed = JSON.parse(s.jsonText);
    expect(parsed.appid).toBe('wx123');
    expect(parsed.libVersion).toBe('3.1.5');
    expect(parsed.setting.es6).toBe(false);
  });
});

describe('P0-71 路径越权防护', () => {
  it('resolveSafeOutputPath 拒绝跳出 projectRoot 的 ../ 路径', () => {
    const root = mkdtempSync(join(tmpdir(), 'fdt-safe-'));
    try {
      expect(resolveSafeOutputPath(root, 'pages/index/index.js').resolved).toBe(
        resolve(root, 'pages/index/index.js'),
      );
      const evil = resolveSafeOutputPath(root, '../../etc/passwd');
      expect(evil.resolved).toBeNull();
      expect(evil.error!.code).toBe('FDT-WEAPP-PATH-TRAVERSAL');
      // 绝对路径注入同样拒绝
      const absTarget = resolve(root, '..', 'evil.json');
      expect(resolveSafeOutputPath(root, absTarget).resolved).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('P0-71 安全落盘（真实目录，零自动改写）', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'fdt-proj-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('建议文件写入 *.suggestion.json，绝不覆盖同名工程文件', () => {
    mkdirSync(join(root), { recursive: true });
    // 预存一个用户 app.json
    writeFileSync(join(root, 'app.json'), JSON.stringify({ pages: ['keep/keep'] }));
    const s = buildAppJsonSuggestion(null, ['pages/new/new']);
    const result = writeSuggestionSafely(root, 'app.json', s.jsonText);
    expect(result.written).toBe(true);
    // 建议落在 app.suggestion.json
    expect(existsSync(join(root, 'app.suggestion.json'))).toBe(true);
    expect(existsSync(join(root, 'app.json'))).toBe(true);
    // 原 app.json 原样未动
    expect(JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')).pages).toEqual(['keep/keep']);
    // 建议内容可解析
    expect(JSON.parse(readFileSync(join(root, 'app.suggestion.json'), 'utf8')).pages).toEqual(['pages/new/new']);
  });

  it('越权路径拒绝写盘并返回结构化错误', () => {
    const result = writeSuggestionSafely(root, '../../evil.json', '{}');
    expect(result.written).toBe(false);
    expect(result.error!.code).toBe('FDT-WEAPP-PATH-TRAVERSAL');
  });
});
