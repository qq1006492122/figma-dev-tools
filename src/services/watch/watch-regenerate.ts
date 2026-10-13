/**
 * Watch 变更后的重新生成处理器（WBS-P1-22 第二级 + WBS-P1-26）
 *
 * 粗筛确认变更后才执行本处理：拉节点树 → 按框架生成器产出文件 →
 * write=true 时经安全写盘器落盘（含备份 + preserve）；write=false 仅在内存保留最近产物。
 *
 * @module
 */

import { createDesignContextService } from '../design-context.js';
import { createCodeGenerator } from '../code-generator.js';
import { createVueGenerator } from '../vue-generator.js';
import { createSvelteGenerator } from '../svelte-generator.js';
import { createWeappGenerator } from '../weapp-generator.js';
import { writeGeneratedFiles, type PreserveLang, type WriteResult } from './watch-safe-writer.js';
import { sanitizeIdentifier } from '../../utils/security.js';
import type { FigmaClient } from '../figma-client.js';
import type { WatchSession } from './watch-store.js';

export interface GeneratedWatchFile {
  path: string;
  content: string;
  lang: PreserveLang;
}

export interface RegenerationResult {
  files: GeneratedWatchFile[];
  writeResult?: WriteResult;
  written: boolean;
}

function componentNameFrom(nodeName: string | undefined): string {
  return sanitizeIdentifier(nodeName || '') || 'WatchedComponent';
}

/**
 * 重新生成一个 watch 会话对应的产物。
 *
 * @param session - watch 会话
 * @param client - 会话启动时绑定的 FigmaClient（不重新走 token 解析）
 * @param maxDepth - 节点树深度
 */
export async function regenerateWatchSession(
  session: WatchSession,
  client: FigmaClient,
  maxDepth = 15,
): Promise<RegenerationResult> {
  const ctxService = createDesignContextService(client);
  const ctx = await ctxService.getDesignContext(session.fileKey, session.nodeId, maxDepth);
  // 显式指定（compare 的 componentName 参数）优先于节点名推导
  const componentName = session.componentName || componentNameFrom(ctx.node.name);
  const styleFormat = (session.styleFormat as 'tailwind' | 'unocss' | 'css-modules') ?? 'tailwind';

  let files: GeneratedWatchFile[];

  if (session.framework === 'react') {
    const r = await createCodeGenerator(client).generateJsxFromContext(ctx, {
      componentName,
      styleFormat: styleFormat as never,
    });
    files = [{ path: `${componentName}.tsx`, content: r.code, lang: 'tsx' }];
  } else if (session.framework === 'vue') {
    const r = await createVueGenerator(client).generateFromContext(ctx, {
      componentName,
      styleFormat: styleFormat as never,
      vueVersion: session.vueVersion ?? 3,
    });
    files = [{ path: `${componentName}.vue`, content: r.code, lang: 'vue' }];
    if (r.styleSidecar) {
      files.push({
        path: r.styleSidecar.fileName,
        content: r.styleSidecar.content,
        lang: (r.styleSidecar.lang === 'scss' ? 'scss' : r.styleSidecar.lang === 'less' ? 'less' : 'css') as PreserveLang,
      });
    }
  } else if (session.framework === 'svelte') {
    const r = await createSvelteGenerator(client).generateFromContext(ctx, {
      componentName,
      styleFormat,
    });
    files = [{ path: `${componentName}.svelte`, content: r.code, lang: 'svelte' }];
  } else {
    const r = await createWeappGenerator(client).generateFromContext(ctx, { componentName, isPage: true });
    files = [
      { path: `${componentName}.wxml`, content: r.wxml, lang: 'wxml' },
      { path: `${componentName}.wxss`, content: r.wxss, lang: 'wxss' },
      { path: `${componentName}.js`, content: r.js, lang: 'js' },
      { path: `${componentName}.json`, content: r.json, lang: 'json' },
    ];
  }

  if (session.write && session.outputDir) {
    const writeResult = await writeGeneratedFiles({
      root: session.outputDir,
      files: files.map((f) => ({ path: f.path, content: f.content, lang: f.lang })),
    });
    return { files, writeResult, written: true };
  }
  return { files, written: false };
}
