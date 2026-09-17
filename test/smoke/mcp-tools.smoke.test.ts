/**
 * MCP 接口冒烟测试（v1.4.18 起三层测试之「冒烟层」）
 *
 * 通过真实 stdio 子进程驱动生产入口 `dist/cli/index.js mcp`，
 * 验证最关键的发布契约：
 *
 * 1. initialize 握手成功，serverInfo 名称/版本与 package.json 一致；
 * 2. tools/list 返回的 22 个工具名与注册顺序形成快照基线
 *    （1.4.20 新增 figma_generate_weapp 后需显式更新为 23——快照即发布闸门）；
 * 3. 每个工具具备 description 与对象型 inputSchema；
 * 4. 非法入参以协议错误或 isError 返回且进程不崩溃；
 * 5. fixture 工厂可构造整页 / 双模式变量 / 20k+ 压测大树。
 *
 * 运行：`npm run test:smoke`（前置 `npm run build`）。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { McpTestHarness, type McpServerInfo, type McpToolDescriptor } from './mcp-harness.js';
import { countNodes, makeLargeTree } from '../fixtures/nodes.js';
import { makeButtonComponent, makeCardPage, makeVariablesLightDark } from '../fixtures/page.js';

/** v1.4.19 T20 基线的 22 个 MCP 工具（严格保持注册顺序） */
const BASELINE_TOOL_NAMES = [
  'figma_parse_url',
  'figma_get_file',
  'figma_extract_tokens',
  'figma_generate_component',
  'figma_get_screenshot',
  'figma_generate_styles',
  'figma_sync_to_project',
  'figma_validate_token',
  'figma_get_metadata',
  'figma_get_design_context',
  'figma_download_assets',
  'figma_create_icon_sprite',
  'figma_list_components',
  'figma_lint_design',
  'figma_generate_jsx',
  'figma_generate_vue',
  'figma_batch_generate',
  'figma_get_structured_data',
  'figma_dev_fallback_status',
  'figma_dev_fallback_capture',
  'figma_verify_fidelity',
  'figma_ocr_extract',
] as const;

/**
 * 从项目根读取 package.json 版本（test/smoke → 上两级）
 *
 * @returns version 字段
 */
function readPackageVersion(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pkgPath = path.resolve(here, '..', '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: unknown };
  if (typeof pkg.version !== 'string') {
    throw new Error('package.json 缺少 version 字段');
  }
  return pkg.version;
}

describe('MCP 冒烟：真实 stdio 子进程接口契约', () => {
  /** 已握手的测试线束 */
  let harness: McpTestHarness;
  /** initialize 返回的服务信息 */
  let serverInfo: McpServerInfo;
  /** tools/list 全量结果 */
  let tools: readonly McpToolDescriptor[];

  beforeAll(async () => {
    harness = new McpTestHarness();
    serverInfo = await harness.start();
    tools = await harness.listTools();
  }, 30000);

  afterAll(async () => {
    await harness?.close();
  });

  it('initialize 返回服务名 figma-dev-tools，版本与 package.json 一致', () => {
    expect(serverInfo.name).toBe('figma-dev-tools');
    expect(serverInfo.version).toBe(readPackageVersion());
  });

  it('tools/list 返回 22 个工具，名称与注册顺序匹配 v1.4.19 T20 基线快照', () => {
    expect(tools).toHaveLength(BASELINE_TOOL_NAMES.length);
    expect(tools.map((tool) => tool.name)).toEqual([...BASELINE_TOOL_NAMES]);
  });

  it('工具名无重复', () => {
    const names = tools.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('每个工具都有非空 description 与对象型 inputSchema', () => {
    for (const tool of tools) {
      expect(typeof tool.description, `${tool.name} 缺少 description`).toBe('string');
      expect(tool.description?.trim().length, `${tool.name} description 为空`).toBeGreaterThan(0);
      expect(tool.inputSchema, `${tool.name} 缺少 inputSchema`).not.toBeNull();
      expect(typeof tool.inputSchema, `${tool.name} inputSchema 非对象`).toBe('object');
    }
  });

  it('非法 URL 调用 figma_parse_url 返回错误反馈且 MCP 进程不崩溃', async () => {
    let reportedError = false;
    try {
      const result = await harness.callTool('figma_parse_url', { url: 'not-a-figma-url' });
      // SDK 模型 A：协议成功、工具级错误
      reportedError = result.isError === true;
    } catch {
      // SDK 模型 B：JSON-RPC 错误——同样属于合规的错误反馈
      reportedError = true;
    }
    expect(reportedError).toBe(true);
    // 进程仍可正常响应后续请求
    const stillAlive = await harness.listTools();
    expect(stillAlive).toHaveLength(BASELINE_TOOL_NAMES.length);
  });

  // ============ v1.4.18 T7：样式注册表单一数据源接线 ============

  it('figma_generate_jsx 的 styleFormat 枚举暴露注册表全部 11 个方案', () => {
    const jsxTool = tools.find((tool) => tool.name === 'figma_generate_jsx');
    expect(jsxTool).toBeDefined();
    const schema = jsxTool?.inputSchema as { properties?: Record<string, { enum?: unknown[] }> };
    expect(schema.properties?.styleFormat?.enum).toEqual([
      'tailwind',
      'unocss',
      'css-modules',
      'styled',
      'emotion',
      'less',
      'sass',
      'vanilla-extract',
      'panda',
      'inline-styles',
      'css-variables',
    ]);
  });

  it('figma_generate_component 的 styleFormat 枚举保持 legacy 三值契约', () => {
    const componentTool = tools.find((tool) => tool.name === 'figma_generate_component');
    expect(componentTool).toBeDefined();
    const schema = componentTool?.inputSchema as { properties?: Record<string, { enum?: unknown[] }> };
    expect(schema.properties?.styleFormat?.enum).toEqual(['tailwind', 'css-modules', 'inline-styles']);
  });

  // ============ v1.4.18 T8：UnoCSS attributify 开关经 MCP schema 可见（TR-8.2） ============

  it('figma_generate_jsx 暴露 unocssAttributify 布尔参数（默认 false）', () => {
    const jsxTool = tools.find((tool) => tool.name === 'figma_generate_jsx');
    expect(jsxTool).toBeDefined();
    const schema = jsxTool?.inputSchema as {
      properties?: Record<string, { type?: string; default?: unknown }>;
    };
    expect(schema.properties?.unocssAttributify?.type).toBe('boolean');
    expect(schema.properties?.unocssAttributify?.default).toBe(false);
  });

  // ============ v1.4.19 T18：figma_generate_vue 一级工具的 schema 契约 ============

  it('figma_generate_vue 暴露 vueVersion 参数（枚举 2|3，默认 3）且不暴露 framework', () => {
    const vueTool = tools.find((tool) => tool.name === 'figma_generate_vue');
    expect(vueTool).toBeDefined();
    const schema = vueTool?.inputSchema as {
      properties?: Record<string, { type?: string; enum?: unknown[]; default?: unknown }>;
    };
    // zod union 两个数字字面量经 zod-to-json-schema 折叠为 number + enum
    expect(schema.properties?.vueVersion?.type).toBe('number');
    expect(schema.properties?.vueVersion?.enum).toEqual([2, 3]);
    expect(schema.properties?.vueVersion?.default).toBe(3);
    // Vue 一级工具固定 framework=vue，不允许调用方传入 React 专属组合
    expect(schema.properties?.framework).toBeUndefined();
    // 与 jsx 相同的样式注册表单一数据源（11 方案全暴露，触网前再做框架矩阵闸门）
    expect(schema.properties?.styleFormat?.enum).toEqual([
      'tailwind',
      'unocss',
      'css-modules',
      'styled',
      'emotion',
      'less',
      'sass',
      'vanilla-extract',
      'panda',
      'inline-styles',
      'css-variables',
    ]);
  });

  // ============ v1.4.19 T20：figma_batch_generate 批量工具的 schema 契约 ============

  it('figma_batch_generate 暴露 nodeIds 数组/framework/vueVersion，且样式 11 枚举一致', () => {
    const batchTool = tools.find((tool) => tool.name === 'figma_batch_generate');
    expect(batchTool).toBeDefined();
    const schema = batchTool?.inputSchema as {
      properties?: Record<string, { type?: string; enum?: unknown[]; default?: unknown; items?: unknown }>;
    };
    // nodeId 为整页根节点（必填 string），nodeIds 为显式区块数组（可选）
    expect(schema.properties?.nodeId?.type).toBe('string');
    expect(schema.properties?.nodeIds?.type).toBe('array');
    expect(schema.properties?.nodeIds?.items).toEqual({ type: 'string' });
    // 框架可切换，默认 react；vueVersion 与 figma_generate_vue 同形（number+enum）
    expect(schema.properties?.framework?.enum).toEqual(['react', 'vue']);
    expect(schema.properties?.framework?.default).toBe('react');
    expect(schema.properties?.vueVersion?.enum).toEqual([2, 3]);
    expect(schema.properties?.vueVersion?.default).toBe(3);
    // 组件名前缀与样式矩阵透传
    expect(schema.properties?.componentNamePrefix?.type).toBe('string');
    expect(schema.properties?.styleFormat?.enum).toHaveLength(11);
  });

  // ============ v1.4.19 T21：智能推断分项开关 inference 三工具对称暴露 ============

  it('figma_generate_jsx / figma_generate_vue / figma_batch_generate 均暴露 inference{grid,icons,darkMode,motion}', () => {
    for (const toolName of ['figma_generate_jsx', 'figma_generate_vue', 'figma_batch_generate']) {
      const tool = tools.find((candidate) => candidate.name === toolName);
      expect(tool, toolName).toBeDefined();
      const schema = tool?.inputSchema as {
        properties?: Record<string, { type?: string; properties?: Record<string, { type?: string }> }>;
      };
      const inference = schema.properties?.inference;
      expect(inference?.type, `${toolName}.inference.type`).toBe('object');
      const subKeys = Object.keys(inference?.properties ?? {}).sort();
      expect(subKeys, `${toolName}.inference keys`).toEqual(['darkMode', 'grid', 'icons', 'motion']);
      for (const key of subKeys) {
        expect(inference?.properties?.[key]?.type, `${toolName}.inference.${key}`).toBe('boolean');
      }
    }
  });

  // ============ v1.4.18 T11：W3C DTCG Tokens 经 MCP schema 可见（TR-11.1） ============

  it('figma_generate_styles / figma_sync_to_project 的格式枚举均包含 dtcg', async () => {
    const stylesTool = tools.find((tool) => tool.name === 'figma_generate_styles');
    const syncTool = tools.find((tool) => tool.name === 'figma_sync_to_project');
    expect(stylesTool).toBeDefined();
    expect(syncTool).toBeDefined();

    const stylesSchema = stylesTool?.inputSchema as {
      properties?: Record<string, { enum?: unknown[] }>;
    };
    const syncSchema = syncTool?.inputSchema as {
      properties?: Record<string, { enum?: unknown[] }>;
    };

    expect(stylesSchema.properties?.outputFormat?.enum).toEqual([
      'css-variables',
      'tailwind-v4',
      'json',
      'dtcg',
    ]);
    expect(syncSchema.properties?.format?.enum).toEqual([
      'css',
      'tailwind',
      'json',
      'dtcg',
      'all',
    ]);

    // 端到端：dtcg 转换纯本地执行（不触网），输出为 $type/$value 标准 JSON
    const result = await harness.callTool('figma_generate_styles', {
      outputFormat: 'dtcg',
      tokens: {
        colors: { primary: { name: 'primary', value: '#1677ff' } },
        spacing: {},
        radius: {},
        shadows: {},
        typography: {},
        metadata: { source: 'figma', fileKey: 'smoke', generatedAt: '2026-05-01T00:00:00.000Z' },
      },
    });
    expect(result.isError).toBeFalsy();
    const text = result.content?.[0]?.text;
    expect(typeof text).toBe('string');
    const payload = text as string;
    expect(payload).toContain('"$type": "color"');
    expect(payload).toContain('"$value": "#1677ff"');
  });

  it('figma_generate_jsx framework=vue 选择 React 专属 styled 时业务报错（TR-14.1 框架矩阵，不触网、不静默降级）', async () => {
    // v1.4.19：styled 已在 React 可用，但 Vue 不支持；校验必须在触网前抛出双语框架错误
    const result = await harness.callTool('figma_generate_jsx', {
      fileKey: 'fake-key',
      nodeId: '1:1',
      styleFormat: 'styled',
      framework: 'vue',
    });
    expect(result.isError).toBe(true);
    const text = result.content?.[0]?.text;
    expect(typeof text).toBe('string');
    const message = text as string;
    // 中英消息均含方案 id、目标框架与支持框架
    expect(message).toContain('styled');
    expect(message).toContain('vue');
    expect(message).toContain('react');
    // 必须在网络请求前拦截：不得出现 Figma API 令牌错误
    expect(message).not.toContain('TOKEN_INVALID');
  });

  it('figma_generate_jsx 传入未知样式方案时被输入校验拦截（zod 枚举护栏，不进入业务逻辑）', async () => {
    // 注意：本版 SDK 将 InvalidParams 的 McpError 归一为 isError 工具结果（而非 JSON-RPC 错误）
    const result = await harness.callTool('figma_generate_jsx', {
      fileKey: 'fake-key',
      nodeId: '1:1',
      styleFormat: 'tailwind-extreme',
    });
    expect(result.isError).toBe(true);
    const text = result.content?.[0]?.text;
    expect(typeof text).toBe('string');
    const message = text as string;
    expect(message).toContain('Input validation error');
    expect(message).toContain('tailwind-extreme');
  });
});

describe('MCP 冒烟：测试夹具工厂自检', () => {
  it('整页夹具包含 CANVAS、应用栏、卡片与按钮 INSTANCE', () => {
    const page = makeCardPage({ cardCount: 3 });
    expect(page.type).toBe('CANVAS');
    expect(page.children).toBeDefined();
    // 每页结构：app-bar + card-list（card-list 内 3 张卡片）
    expect(page.children).toHaveLength(2);
    const instances: string[] = [];
    const walk = (node: ReturnType<typeof makeCardPage>): void => {
      if (node.type === 'INSTANCE') {
        instances.push(node.name);
      }
      for (const child of node.children ?? []) {
        walk(child);
      }
    };
    walk(page);
    // app-bar 1 个按钮 + 每张卡片 1 个按钮 = 4
    expect(instances).toHaveLength(4);
  });

  it('按钮组件夹具携带 3 个 Component Property 定义', () => {
    const button = makeButtonComponent();
    expect(button.type).toBe('COMPONENT');
    expect(button.componentPropertyDefinitions).toBeDefined();
    expect(Object.keys(button.componentPropertyDefinitions ?? {})).toHaveLength(3);
  });

  it('双模式变量夹具覆盖 COLOR/FLOAT/STRING 且 Light/Dark 颜色不同', () => {
    const meta = makeVariablesLightDark();
    const variables = Object.values(meta.variables);
    expect(variables).toHaveLength(4);
    const primary = meta.variables['var:color-primary'];
    expect(primary).toBeDefined();
    expect(primary?.resolvedType).toBe('COLOR');
    const lightColor = primary?.valuesByMode['mode-light'];
    const darkColor = primary?.valuesByMode['mode-dark'];
    expect(lightColor).not.toEqual(darkColor);
  });

  it('压测大树夹具节点数 ≥ 20000（4 叉 7 层分支 = 8 层 21845 节点）', () => {
    const tree = makeLargeTree({ branch: 4, depth: 7 });
    expect(countNodes(tree)).toBe(21845);
    expect(countNodes(tree)).toBeGreaterThanOrEqual(20000);
  });
});
