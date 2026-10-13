/**
 * 工具版本号单一来源（WBS-R1：消除生成代码头部硬编码版本漂移）。
 *
 * 从 package.json 读取（dist/services 与 dist/cli 下均为 ../../package.json）；
 * 读取失败回退 unknown，绝不硬编码具体版本——避免发版后生成产物头部继续打印旧版本。
 *
 * @module utils/version
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let cached: string | undefined;

export function getToolVersion(): string {
  if (cached !== undefined) return cached;
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(fs.readFileSync(path.resolve(here, '../../package.json'), 'utf-8')) as {
      version?: string;
    };
    cached = typeof pkg.version === 'string' && pkg.version.length > 0 ? pkg.version : 'unknown';
  } catch {
    cached = 'unknown';
  }
  return cached;
}
