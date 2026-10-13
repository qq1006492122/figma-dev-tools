/**
 * 微信小程序工程配置建议与安全落盘（WBS-P0-71）
 *
 * 原则（ROADMAP）：
 *  - 自动工程改写为 0：绝不覆盖用户已有的 app.json / project.config.json；
 *    配置只以 `*.suggestion.json` 形式落盘并打印，由人工合并。
 *  - 路径越权拒绝：所有写出路径必须解析后仍位于 projectRoot 之内。
 *  - 输出 JSON 必须可解析（JSON.stringify，2 空格）。
 *
 * @module
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve, relative, sep } from 'node:path';
import { FROZEN_BASELINE } from './baseline-versions.js';

/** 冻结基础库版本（P0-41）：建议写入 project.config.json libVersion */
export const FROZEN_LIB_VERSION = FROZEN_BASELINE.minSupported;

export const PATH_TRAVERSAL_CODE = 'FDT-WEAPP-PATH-TRAVERSAL';

export interface JsonSuggestion {
  /** 目标工程文件名（app.json / project.config.json） */
  targetFile: string;
  /** 序列化后的建议 JSON（可解析） */
  jsonText: string;
  /** 目标工程文件是否已存在（已存在→只建议不覆盖） */
  alreadyExisted: boolean;
}

/**
 * 合并生成 app.json 建议：保留既有全部字段，pages 数组追加并去重。
 * existing=null 表示空工程，生成最小可运行配置。
 */
export function buildAppJsonSuggestion(
  existing: Record<string, unknown> | null,
  addPages: string[],
): JsonSuggestion {
  const base: Record<string, unknown> = existing
    ? JSON.parse(JSON.stringify(existing))
    : {
        pages: [],
        window: {
          navigationBarBackgroundColor: '#ffffff',
          navigationBarTextStyle: 'black',
          navigationBarTitleText: '',
          backgroundColor: '#ffffff',
        },
      };

  const pages = Array.isArray(base.pages) ? [...(base.pages as string[])] : [];
  for (const p of addPages) {
    if (!pages.includes(p)) pages.push(p);
  }
  base.pages = pages;

  return {
    targetFile: 'app.json',
    jsonText: JSON.stringify(base, null, 2),
    alreadyExisted: existing !== null,
  };
}

/**
 * 合并生成 project.config.json 建议：补冻结 libVersion，保留既有设置。
 */
export function buildProjectConfigSuggestion(
  existing: Record<string, unknown> | null,
  defaults: { appid?: string; projectName?: string } = {},
): JsonSuggestion {
  const base: Record<string, unknown> = existing
    ? JSON.parse(JSON.stringify(existing))
    : {
        appid: defaults.appid ?? 'touristappid',
        projectname: defaults.projectName ?? 'weapp-project',
        setting: {
          es6: true,
          minified: true,
          postcss: true,
          urlCheck: true,
        },
        compileType: 'miniprogram',
      };

  base.libVersion = FROZEN_LIB_VERSION;

  return {
    targetFile: 'project.config.json',
    jsonText: JSON.stringify(base, null, 2),
    alreadyExisted: existing !== null,
  };
}

// ============ 路径越权防护 ============

export interface SafePathResult {
  /** 解析后的安全绝对路径；越权时为 null */
  resolved: string | null;
  error?: { code: string; message: string };
}

/** 判断 target 解析后是否仍在 root 之内（含 root 本身） */
export function resolveSafeOutputPath(root: string, target: string): SafePathResult {
  if (isAbsolute(target)) {
    return {
      resolved: null,
      error: { code: PATH_TRAVERSAL_CODE, message: `拒绝绝对路径写入：${target}` },
    };
  }
  const rootResolved = resolve(root);
  const targetResolved = resolve(rootResolved, target);
  const rel = relative(rootResolved, targetResolved);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    return {
      resolved: null,
      error: {
        code: PATH_TRAVERSAL_CODE,
        message: `路径越权：${target} 解析后位于工程根 ${rootResolved} 之外`,
      },
    };
  }
  return { resolved: targetResolved };
}

export interface SafeWriteResult {
  written: boolean;
  /** 实际写入路径（建议文件） */
  path?: string;
  error?: { code: string; message: string };
}

/**
 * 把"建议"安全写到 <baseName>.suggestion.json（而非覆盖 <baseName>），
 * 保证自动工程改写为 0；写出前做越权校验。
 */
export function writeSuggestionSafely(projectRoot: string, targetFile: string, jsonText: string): SafeWriteResult {
  // app.json → app.suggestion.json；project.config.json → project.config.suggestion.json
  const dot = targetFile.lastIndexOf('.');
  const suggestionName = dot > 0 ? `${targetFile.slice(0, dot)}.suggestion${targetFile.slice(dot)}` : `${targetFile}.suggestion`;
  const safe = resolveSafeOutputPath(projectRoot, suggestionName);
  if (!safe.resolved) return { written: false, error: safe.error };

  // 绝不写入真实工程文件名（双保险）
  if (safe.resolved.endsWith(`${sep}${targetFile}`)) {
    return {
      written: false,
      error: { code: PATH_TRAVERSAL_CODE, message: `禁止直接改写工程文件 ${targetFile}` },
    };
  }

  mkdirSync(dirname(safe.resolved), { recursive: true });
  writeFileSync(safe.resolved, jsonText, 'utf8');
  return { written: true, path: safe.resolved };
}

/** 读取工程内 JSON 文件（不存在返回 null；损坏抛错由调用方决定） */
export function readProjectJson(projectRoot: string, file: string): Record<string, unknown> | null {
  const safe = resolveSafeOutputPath(projectRoot, file);
  if (!safe.resolved || !existsSync(safe.resolved)) return null;
  return JSON.parse(readFileSync(safe.resolved, 'utf8')) as Record<string, unknown>;
}
