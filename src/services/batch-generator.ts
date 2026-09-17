/**
 * 批量代码生成器 - Batch Code Generator（v1.4.19 T20）
 *
 * 区块拆分（block-splitter）之后的第二阶段：对每个区块复用单组件生成管线
 * （React CodeGenerator / Vue VueGenerator，保证批量与单个生成逐字节同构），
 * 再汇总为多文件产物：
 *
 * - 每个区块一个主文件（.tsx / .vue）+ 可选同名样式旁路文件（.module.css/.less/.scss/.css.ts）；
 * - index.ts barrel 统一 re-export 全部区块组件；
 * - 依赖图：barrel → 各区块主文件（barrel），主文件 → 旁路样式（sidecar）；
 * - 聚合待下载资源与跨区块警告。
 *
 * 框架 × 样式矩阵与单文件入口一致：非法组合在触达各区块生成器时由样式注册表
 * 显式拒绝（styled/emotion/vanilla-extract/panda 仅 React），批量层不另做降级。
 *
 * @module
 */

import { getI18n } from '../i18n/index.js';
import type { DesignContext } from '../types/nodes.js';
import type { Framework, SmartInferenceSwitches } from '../types.js';
import { CodeGenerator, createCodeGenerator } from './code-generator.js';
import { VueGenerator, createVueGenerator } from './vue-generator.js';
import type { FigmaClient } from './figma-client.js';
import type { BundlerKind } from './asset-paths.js';
import type { StyleFormat, UnocssMode } from './style-renderers/index.js';
import type { PageBlock } from './block-splitter.js';

/** 批量生成入参 */
export interface BatchGenerateOptions {
  /** 目标框架 */
  framework: Framework;
  /** Vue 大版本（仅 framework=vue 生效，默认 3） */
  vueVersion?: 2 | 3;
  /** 样式方案（11 值联合，矩阵闸门由各区块生成器执行） */
  styleFormat: StyleFormat;
  /** UnoCSS 模式（仅 unocss 生效） */
  unocssMode?: UnocssMode;
  /** 目标构建器（决定资源引用形态） */
  bundler?: BundlerKind;
  /** 是否跳过增强器链 */
  skipEnhancements?: boolean;
  /** v1.4.19 T21：智能推断分项开关（缺省全开，skipEnhancements 为总闸） */
  inference?: SmartInferenceSwitches;
  /** 组件名前缀（仅允许 ASCII 字母/数字/下划线，非法字符剔除） */
  componentNamePrefix?: string;
}

/** 批量产物中的单个文件 */
export interface BatchFile {
  /** 相对输出目录的文件名（POSIX 风格，可能含子目录，当前实现为扁平结构） */
  readonly fileName: string;
  /** 文件完整内容 */
  readonly content: string;
  /** 文件语言标识（供 MCP Markdown fence / CLI 日志使用） */
  readonly lang: 'ts' | 'tsx' | 'vue' | 'css' | 'less' | 'scss';
}

/** 区块元信息（报告/structuredContent 用） */
export interface BatchBlockMeta {
  /** 区块语义类型 */
  readonly kind: PageBlock['kind'];
  /** 组件名 */
  readonly componentName: string;
  /** 主文件名 */
  readonly fileName: string;
  /** Figma 原始节点名 */
  readonly sourceName: string;
  /** Figma 节点 ID */
  readonly nodeId: string;
}

/** 依赖图边 */
export interface BatchDependencyEdge {
  /** 依赖方文件名 */
  readonly from: string;
  /** 被依赖文件名 */
  readonly to: string;
  /** 依赖类型：barrel 再导出 / 样式旁路引用 */
  readonly kind: 'barrel' | 'sidecar';
}

/** 批量生成结果 */
export interface BatchGenResult {
  /** 全部文件（顺序：区块主文件与旁路交替，最后为 barrel） */
  readonly files: BatchFile[];
  /** 入口文件名（barrel） */
  readonly entryPoint: string;
  /** 区块元信息（自上而下顺序） */
  readonly blocks: BatchBlockMeta[];
  /** 依赖图边集合 */
  readonly edges: BatchDependencyEdge[];
  /** 聚合警告（区块生成 + 设计上下文，已去重） */
  readonly warnings: string[];
  /** 聚合待下载资源 */
  readonly pendingAssets: Array<{ nodeId: string; name: string; type: string }>;
  /** 实际目标框架 */
  readonly framework: Framework;
  /** 实际 Vue 大版本（仅 vue） */
  readonly vueVersion?: 2 | 3;
}

/** barrel 文件名 */
const BARREL_FILE_NAME = 'index.ts';

/**
 * 清洗组件名前缀（仅保留 ASCII 字母数字下划线，且首字符非数字）
 *
 * @param raw - 用户传入前缀
 * @returns 安全前缀（可能为空串）
 */
function sanitizePrefix(raw: string | undefined): string {
  if (!raw) return '';
  const cleaned = raw.replace(/[^A-Za-z0-9_]/g, '');
  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned;
}

/**
 * 批量代码生成器
 *
 * 通过工厂 {@link createBatchGenerator} 创建；内部持有 React/Vue 两套单文件生成器。
 */
export class BatchGenerator {
  private readonly _react: CodeGenerator;
  private readonly _vue: VueGenerator;

  constructor(react: CodeGenerator, vue: VueGenerator) {
    this._react = react;
    this._vue = vue;
  }

  /**
   * 逐区块生成并汇总多文件产物
   *
   * @param blocks - 区块列表（block-splitter 输出，自上而下顺序）
   * @param baseContext - 页面级 DesignContext（逐区块替换 node，tokens/资源清单共享）
   * @param options - 批量生成选项
   * @returns 多文件结果 + barrel + 依赖图
   * @throws 当 blocks 为空时抛 i18n 空选择错误（TR-20.2，调用方捕获后不触网直接报错）
   */
  async generate(
    blocks: readonly PageBlock[],
    baseContext: DesignContext,
    options: BatchGenerateOptions,
  ): Promise<BatchGenResult> {
    const i18n = getI18n();
    if (blocks.length === 0) {
      throw new Error(i18n.t('batchGenerate.emptySelection') as string);
    }

    const prefix = sanitizePrefix(options.componentNamePrefix);
    const isVue = options.framework === 'vue';

    const files: BatchFile[] = [];
    const blockMetas: BatchBlockMeta[] = [];
    const edges: BatchDependencyEdge[] = [];
    const warningsSet = new Set<string>();
    const assetsMap = new Map<string, { nodeId: string; name: string; type: string }>();

    for (const block of blocks) {
      const componentName = `${prefix}${block.componentName}`;
      // 逐区块上下文：仅替换根节点；token/资源/组件清单沿用页面级上下文只读数据
      const blockContext: DesignContext = { ...baseContext, node: block.node };

      if (isVue) {
        const vueResult = await this._vue.generateFromContext(blockContext, {
          componentName,
          usePublicCdn: true,
          bundler: options.bundler ?? 'none',
          styleFormat: options.styleFormat,
          unocssMode: options.unocssMode ?? 'wind',
          skipEnhancements: options.skipEnhancements ?? false,
          inference: options.inference,
          vueVersion: options.vueVersion ?? 3,
        });
        const mainFileName = `${componentName}.vue`;
        files.push({ fileName: mainFileName, content: vueResult.code, lang: 'vue' });
        blockMetas.push({
          kind: block.kind,
          componentName,
          fileName: mainFileName,
          sourceName: block.sourceName,
          nodeId: block.node.figmaId,
        });
        edges.push({ from: BARREL_FILE_NAME, to: mainFileName, kind: 'barrel' });
        if (vueResult.styleSidecar) {
          const sidecar = vueResult.styleSidecar;
          files.push({
            fileName: sidecar.fileName,
            content: sidecar.content,
            lang: sidecar.lang === 'less' ? 'less' : sidecar.lang === 'scss' ? 'scss' : 'css',
          });
          edges.push({ from: mainFileName, to: sidecar.fileName, kind: 'sidecar' });
        }
        for (const w of vueResult.warnings) warningsSet.add(w);
        for (const asset of vueResult.pendingAssets) assetsMap.set(asset.nodeId, asset);
      } else {
        const reactResult = await this._react.generateJsxFromContext(blockContext, {
          componentName,
          usePublicCdn: true,
          bundler: options.bundler ?? 'none',
          styleFormat: options.styleFormat,
          unocssMode: options.unocssMode ?? 'wind',
          skipEnhancements: options.skipEnhancements ?? false,
          inference: options.inference,
        });
        const mainFileName = `${componentName}.tsx`;
        files.push({ fileName: mainFileName, content: reactResult.code, lang: 'tsx' });
        blockMetas.push({
          kind: block.kind,
          componentName,
          fileName: mainFileName,
          sourceName: block.sourceName,
          nodeId: block.node.figmaId,
        });
        edges.push({ from: BARREL_FILE_NAME, to: mainFileName, kind: 'barrel' });
        if (reactResult.styleSidecar) {
          const sidecar = reactResult.styleSidecar;
          files.push({
            fileName: sidecar.fileName,
            content: sidecar.content,
            // vanilla-extract 旁路为 .module.css.ts，归 ts
            lang:
              sidecar.lang === 'less'
                ? 'less'
                : sidecar.lang === 'scss'
                  ? 'scss'
                  : sidecar.fileName.endsWith('.css.ts')
                    ? 'ts'
                    : 'css',
          });
          edges.push({ from: mainFileName, to: sidecar.fileName, kind: 'sidecar' });
        }
        for (const w of reactResult.warnings) warningsSet.add(w);
        for (const asset of reactResult.pendingAssets) assetsMap.set(asset.nodeId, asset);
      }
    }

    // barrel：统一 default 再导出（React 主文件含 default export；Vue SFC 经 vue shim 同样为 default）
    const barrelLines: string[] = [
      '/**',
      ' * AUTO-GENERATED by figma-dev-tools v1.4.19 (figma_batch_generate) — 请勿手工编辑。',
      ` * Framework: ${options.framework}${isVue ? ` (Vue ${options.vueVersion ?? 3})` : ''}, style: ${options.styleFormat}`,
      ` * Blocks: ${blockMetas.length}`,
      ' */',
    ];
    for (const meta of blockMetas) {
      const specifier = isVue ? meta.fileName : meta.componentName;
      barrelLines.push(`export { default as ${meta.componentName} } from './${specifier}';`);
    }
    files.push({ fileName: BARREL_FILE_NAME, content: `${barrelLines.join('\n')}\n`, lang: 'ts' });

    for (const w of baseContext.warnings ?? []) warningsSet.add(w);

    return {
      files,
      entryPoint: BARREL_FILE_NAME,
      blocks: blockMetas,
      edges,
      warnings: Array.from(warningsSet),
      pendingAssets: Array.from(assetsMap.values()),
      framework: options.framework,
      vueVersion: isVue ? (options.vueVersion ?? 3) : undefined,
    };
  }
}

/**
 * 创建批量生成器
 *
 * @param client - Figma 客户端（仅图片/SVG 内联分支使用）
 * @returns BatchGenerator 实例
 */
export function createBatchGenerator(client: FigmaClient): BatchGenerator {
  return new BatchGenerator(createCodeGenerator(client), createVueGenerator(client));
}
