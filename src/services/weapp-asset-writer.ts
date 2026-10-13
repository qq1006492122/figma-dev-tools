/**
 * 小程序 local 资产物理落盘（WBS-P0-22 CLI 层）
 *
 * 职责单一：把 manifest 中 local-resolved 的 canonical 条目，按其 localPath
 * 写入 projectRoot 之下。核心安全不变量——任何解析后逃逸出 projectRoot 的路径
 * 一律拒绝（纵深防御；正常 localPath 已由 weappAssetPath 的 slugify 保证安全）。
 *
 * @module
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  type WeappAssetManifestEntry,
} from './weapp-assets.js';
import type { FetchedAssetBytes } from './weapp-asset-pipeline.js';

/** 资源目标路径解析后越出 projectRoot（路径穿越） */
export class WeappAssetPathTraversalError extends Error {
  constructor(readonly targetPath: string, readonly projectRoot: string) {
    super(`拒绝写入项目根目录之外的资源路径: ${targetPath} (root: ${projectRoot})`);
    this.name = 'WeappAssetPathTraversalError';
  }
}

export interface WriteWeappLocalAssetsParams {
  projectRoot: string;
  /** 生成器输出的 manifest canonical 条目（toManifestJSON 结果） */
  entries: WeappAssetManifestEntry[];
  /** processWeappAssets 返回的 downloaded（sha256 → 字节） */
  bytes: Map<string, FetchedAssetBytes>;
}

export interface WeappAssetWriteResult {
  /** 实际写入文件（相对 projectRoot，平台分隔符） */
  written: string[];
}

/**
 * 写入全部 local-resolved 资源。sha 已在状态机层去重，故每个物理文件只写一次；
 * 重复调用幂等（覆盖写相同字节）。
 */
export async function writeWeappLocalAssets(
  params: WriteWeappLocalAssetsParams,
): Promise<WeappAssetWriteResult> {
  const root = path.resolve(params.projectRoot);
  const written: string[] = [];

  for (const entry of params.entries) {
    if (entry.state !== 'local-resolved' || !entry.localPath || !entry.sha256) continue;

    const fetched = params.bytes.get(entry.sha256);
    if (!fetched) {
      throw new Error(
        `local-resolved 资产 ${entry.id} 缺少已下载 bytes（sha256=${entry.sha256}）；拒绝静默丢图`,
      );
    }

    // localPath 是"项目内逻辑绝对路径"（/images/...），去掉前导分隔符后作为 root 的子路径解析
    const rel = entry.localPath.replace(/^[/\\]+/, '');
    const target = path.resolve(root, rel);
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new WeappAssetPathTraversalError(target, root);
    }

    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, fetched.bytes);
    written.push(path.relative(root, target));
  }

  return { written };
}
