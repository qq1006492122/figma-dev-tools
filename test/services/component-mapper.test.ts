/**
 * v1.4.19 T19 组件库映射深化 + 自定义 components.json（TR-19.1 / TR-19.2）
 *
 * - 内建三库命中：shadcn-ui / ant-design / element-plus 各 ≥1 用例；
 * - 自定义 .figma-dev/components.json 命中 + 优先于内建；
 * - 非法 JSON / 非法结构：i18n 错误可见、降级内建映射、匹配主流程不中断；
 * - zh-CN/en-US 双键均存在且注入细节。
 *
 * 每个用例使用独立临时项目目录（package.json 驱动 detectLibrary），afterEach 清理。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  CUSTOM_MAPPING_FILE_RELATIVE,
  ComponentMapper,
  createComponentMapper,
} from '../../src/services/component-mapper.js';
import { I18n, getI18n, initI18nSync } from '../../src/i18n/index.js';

/** matchComponent 入参节点类型（经实例方法推导，避免导出内部结构） */
type MatchNode = Parameters<ComponentMapper['matchComponent']>[0];

/** 临时项目根目录（每个用例独立） */
let projectRoot: string;

/**
 * 创建临时项目并写入 package.json
 *
 * @param dependencies - dependencies + devDependencies 合并写入
 */
function makeProject(dependencies: Record<string, string>): void {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fdt-mapper-'));
  fs.writeFileSync(
    path.join(projectRoot, 'package.json'),
    JSON.stringify({ name: 'mapper-fixture', version: '0.0.0', dependencies }),
    'utf-8',
  );
}

/**
 * 写入 .figma-dev/components.json
 *
 * @param content - 文件原文（故意不做 JSON.stringify 以支持非法 JSON 用例）
 */
function writeCustomConfig(content: string): void {
  fs.mkdirSync(path.join(projectRoot, '.figma-dev'), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, CUSTOM_MAPPING_FILE_RELATIVE), content, 'utf-8');
}

/**
 * 构造交互节点（含文本子节点 + 实色填充，吃满特征置信度）
 *
 * @param name - 节点名
 * @param childCount - 直接子节点数（除文本外补空容器）
 * @returns 匹配器可消费的节点结构
 */
function makeNode(name: string, childCount = 0): MatchNode {
  const children: NonNullable<MatchNode['children']> = [
    { name: 'label', originalType: 'TEXT', role: 'text', children: [] },
  ];
  for (let i = 0; i < childCount; i += 1) {
    children.push({ name: `child-${i}`, children: [] });
  }
  return {
    name,
    originalType: 'FRAME',
    role: 'container',
    fills: [{ type: 'SOLID' }],
    children,
  };
}

beforeEach(() => {
  initI18nSync();
});

afterEach(() => {
  if (projectRoot && fs.existsSync(projectRoot)) {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

describe('TR-19.1 内建组件库命中', () => {
  it('shadcn/ui：primary button 命中 Button 且建议 variant=default', () => {
    // 根 components.json 是 shadcn 检测信号（注意与 .figma-dev/components.json 不冲突）
    makeProject({ '@radix-ui/react-dialog': '^1.0.0' });
    fs.writeFileSync(path.join(projectRoot, 'components.json'), JSON.stringify({ style: 'default' }), 'utf-8');
    const mapper = createComponentMapper(projectRoot);

    expect(mapper.detectLibrary().library).toBe('shadcn-ui');
    const match = mapper.matchComponent(makeNode('Primary Button / 主要按钮'));
    expect(match).not.toBeNull();
    expect(match?.componentName).toBe('Button');
    expect(match?.library).toBe('shadcn-ui');
    expect(match?.importPath).toBe('@/components/ui/button');
    expect(match?.suggestedProps?.variant).toBe('default');
  });

  it('ant-design：Button/Input/Modal/Tabs 命中 antd 包并给出 JSX 示例', () => {
    makeProject({ antd: '^5.12.0' });
    const mapper = createComponentMapper(projectRoot);

    expect(mapper.detectLibrary().library).toBe('ant-design');

    const button = mapper.matchComponent(makeNode('Primary Button 主要按钮'));
    expect(button?.componentName).toBe('Button');
    expect(button?.importPath).toBe('antd');
    expect(button?.suggestedProps?.type).toBe('primary');
    expect(button?.usageExample).toContain('<Button');

    const input = mapper.matchComponent(makeNode('Search Input 搜索输入框'));
    expect(input?.componentName).toBe('Input');

    const modal = mapper.matchComponent(makeNode('Confirm Modal 确认弹窗', 2));
    expect(modal?.componentName).toBe('Modal');
    expect(modal?.usageExample).toContain('<Modal');

    const tabs = mapper.matchComponent(makeNode('Settings Tabs 设置标签页', 2));
    expect(tabs?.componentName).toBe('Tabs');

    // 组件清单包含规格要求的五个常用组件
    const names = mapper.getAvailableComponents('ant-design');
    for (const required of ['Button', 'Form', 'Input', 'Modal', 'Tabs']) {
      expect(names).toContain(required);
    }
  });

  it('element-plus：中文节点名命中 ElButton/ElInput/ElDialog/ElTabs，示例为模板语法', () => {
    makeProject({ 'element-plus': '^2.6.0' });
    const mapper = createComponentMapper(projectRoot);

    expect(mapper.detectLibrary().library).toBe('element-plus');

    const button = mapper.matchComponent(makeNode('主要按钮 Primary Button'));
    expect(button?.componentName).toBe('ElButton');
    expect(button?.importPath).toBe('element-plus');
    expect(button?.suggestedProps?.type).toBe('primary');
    expect(button?.usageExample).toContain('<el-button');

    const input = mapper.matchComponent(makeNode('搜索输入框 Search Input'));
    expect(input?.componentName).toBe('ElInput');
    expect(input?.usageExample).toContain('v-model');

    // Modal 语义对应 ElDialog
    const dialog = mapper.matchComponent(makeNode('确认弹窗 Confirm Modal', 2));
    expect(dialog?.componentName).toBe('ElDialog');
    expect(dialog?.usageExample).toContain('<el-dialog');

    const tabs = mapper.matchComponent(makeNode('设置标签页 Settings Tabs', 2));
    expect(tabs?.componentName).toBe('ElTabs');

    const names = mapper.getAvailableComponents('element-plus');
    for (const required of ['ElButton', 'ElForm', 'ElInput', 'ElDialog', 'ElTabs']) {
      expect(names).toContain(required);
    }
  });

  it('antd 危险/小号按钮推断 danger 与 size 建议', () => {
    makeProject({ antd: '^5.12.0' });
    const mapper = createComponentMapper(projectRoot);

    const dangerSmall = mapper.matchComponent(makeNode('Danger Small Button 危险小号按钮'));
    expect(dangerSmall?.suggestedProps?.danger).toBe(true);
    expect(dangerSmall?.suggestedProps?.size).toBe('small');
  });
});

describe('TR-19.1 自定义 components.json 命中与优先序', () => {
  it('自定义规则命中：组件名/import/静态 props/示例全部采用配置值', () => {
    makeProject({ antd: '^5.12.0' });
    writeCustomConfig(
      JSON.stringify({
        version: 1,
        components: [
          {
            name: 'PromoButton',
            library: 'ant-design',
            importPath: '@/components/marketing/PromoButton',
            keywords: ['promo', '立即购买'],
            usageExample: '<PromoButton campaign="618" />',
            suggestedProps: { type: 'primary', danger: true },
          },
        ],
      }),
    );
    const mapper = createComponentMapper(projectRoot);

    const match = mapper.matchComponent(makeNode('promo-cta / 立即购买按钮'));
    expect(match).not.toBeNull();
    expect(match?.componentName).toBe('PromoButton');
    expect(match?.importPath).toBe('@/components/marketing/PromoButton');
    expect(match?.suggestedProps).toEqual({ type: 'primary', danger: true });
    expect(match?.usageExample).toBe('<PromoButton campaign="618" />');
    expect(match?.confidence).toBe(0.85);
    expect(mapper.getCustomConfigError()).toBeNull();
  });

  it('优先序：自定义规则抢占内建关键词（button 不再回落 antd Button）', () => {
    makeProject({ antd: '^5.12.0' });
    writeCustomConfig(
      JSON.stringify({
        version: 1,
        components: [
          {
            name: 'BrandButton',
            library: 'ant-design',
            importPath: '@/components/BrandButton',
            keywords: ['button', '按钮'],
          },
        ],
      }),
    );
    const mapper = createComponentMapper(projectRoot);

    const match = mapper.matchComponent(makeNode('Primary Button'));
    expect(match?.componentName).toBe('BrandButton');
    expect(match?.importPath).toBe('@/components/BrandButton');
  });

  it('library 省略的规则为库无关规则：对检测到的任意库生效', () => {
    makeProject({ 'element-plus': '^2.6.0' });
    writeCustomConfig(
      JSON.stringify({
        version: 1,
        components: [
          {
            name: 'MagicWidget',
            importPath: '@/components/MagicWidget',
            keywords: ['magic-widget'],
          },
        ],
      }),
    );
    const mapper = createComponentMapper(projectRoot);

    const match = mapper.matchComponent(makeNode('magic-widget 容器'));
    expect(match?.componentName).toBe('MagicWidget');
    // 规则未限定库时，结果归到当前检测到的库
    expect(match?.library).toBe('element-plus');
  });

  it('规则限定其他库时不误伤：element-plus 项目不命中 antd 专属规则', () => {
    makeProject({ 'element-plus': '^2.6.0' });
    writeCustomConfig(
      JSON.stringify({
        version: 1,
        components: [
          {
            name: 'AntOnly',
            library: 'ant-design',
            importPath: 'antd',
            keywords: ['cross-lib-marker'],
          },
        ],
      }),
    );
    const mapper = createComponentMapper(projectRoot);

    expect(mapper.matchComponent(makeNode('cross-lib-marker'))).toBeNull();
  });
});

describe('TR-19.2 非法 components.json：i18n 错误 + 降级不中断', () => {
  it('JSON 语法错误：错误消息双语键可格式化，匹配回落内建', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    makeProject({ antd: '^5.12.0' });
    writeCustomConfig('{ "components": [ // 非法 JSON 注释');
    const mapper = createComponentMapper(projectRoot);

    // 触发加载并拿到当前语言（zh-CN）错误
    const zhError = mapper.getCustomConfigError();
    expect(zhError).toContain('.figma-dev/components.json');
    expect(zhError).toContain('格式无效');
    expect(consoleErrorSpy).toHaveBeenCalled();

    // 主流程不中断：树匹配仍返回内建结果
    const matches = mapper.matchComponentsInTree({
      name: 'Primary Button',
      fills: [{ type: 'SOLID' }],
      children: [{ name: 'text', originalType: 'TEXT', children: [] }],
    });
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]?.componentName).toBe('Button');
    consoleErrorSpy.mockRestore();
  });

  it('结构非法（缺必填字段）：错误细节指出问题字段，规则整体降级', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    makeProject({ antd: '^5.12.0' });
    writeCustomConfig(
      JSON.stringify({
        version: 1,
        components: [{ name: 'Broken', importPath: '@/x/Broken' }],
      }),
    );
    const mapper = createComponentMapper(projectRoot);

    const error = mapper.getCustomConfigError();
    expect(error).toContain('keywords');
    // 降级：自定义 Broken 不生效，普通节点回退内建
    expect(mapper.matchComponent(makeNode('broken-sample'))).toBeNull();
    expect(mapper.matchComponent(makeNode('Primary Button'))?.componentName).toBe('Button');
    vi.restoreAllMocks();
  });

  it('zh-CN 与 en-US 错误键均定义、可格式化且文本不同', () => {
    const detail = 'components[0].name must be a non-empty string';
    const zh = getI18n().t('componentMapper.customConfigInvalid', detail) as string;
    const en = new I18n('en-US').t('componentMapper.customConfigInvalid', detail) as string;

    expect(zh).not.toBe('componentMapper.customConfigInvalid');
    expect(en).not.toBe('componentMapper.customConfigInvalid');
    expect(zh).toContain(detail);
    expect(en).toContain(detail);
    expect(zh).not.toBe(en);
    expect(en.toLowerCase()).toContain('components.json');
  });

  it('无自定义文件时不报错（正常项目零噪声）', () => {
    makeProject({ antd: '^5.12.0' });
    const mapper = createComponentMapper(projectRoot);
    expect(mapper.getCustomConfigError()).toBeNull();
  });
});
