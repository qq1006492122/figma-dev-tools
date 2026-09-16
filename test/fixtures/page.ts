/**
 * 整页 / Variables 复合测试夹具
 *
 * 在 {@link nodes.ts} 原子工厂之上，构造贴近真实设计稿的复合结构：
 * - {@link makeCardPage}：CANVAS + 应用栏 + 卡片列表（含 INSTANCE、富文本、渐变与阴影）；
 * - {@link makeButtonComponent}：带 Component Properties 的按钮组件树；
 * - {@link makeVariablesLightDark}：双模式（Light/Dark）变量集合；
 * - 大树直接复用 {@link makeLargeTree}（压测 20k 节点场景）。
 *
 * @packageDocumentation
 */
import type { FigmaVariable, FigmaVariablesResponse } from '../../src/types.js';
import {
  makeAutoLayoutFrame,
  makeComponent,
  makeDropShadow,
  makeFrame,
  makeHexColor,
  makeInstance,
  makeLinearGradient,
  makeRect,
  makeSolidPaint,
  makeText,
  makeTextStyle,
  type ComponentPropertyDefinition,
  type ComponentPropertyValue,
  type TestFigmaNode,
} from './nodes.js';

// ============================================================
// 复合节点页面
// ============================================================

/**
 * 构造一张按钮主组件（含布尔/文本/变体三类 Component Property 定义）
 *
 * @returns COMPONENT 节点
 */
export function makeButtonComponent(): TestFigmaNode {
  const definitions: Record<string, ComponentPropertyDefinition> = {
    'State=Variant': { type: 'VARIANT', defaultValue: 'Default', variantOptions: ['Default', 'Hover', 'Disabled'] },
    Label: { type: 'TEXT', defaultValue: 'Button' },
    Disabled: { type: 'BOOLEAN', defaultValue: false },
  };
  const label = makeText('label', 'Button', makeTextStyle({ fontFamily: 'Inter', fontWeight: 600, fontSize: 16 }), {
    fills: [makeSolidPaint('#FFFFFF')],
  });
  const bg = makeRect('bg', { fill: '#2563EB', cornerRadius: 8, width: 120, height: 40, overrides: { id: 'btn:bg' } });
  return makeComponent('Button/State=Default', [bg, label], definitions, {
    id: 'btn:component',
    layoutMode: 'HORIZONTAL',
    primaryAxisAlignItems: 'CENTER',
    counterAxisAlignItems: 'CENTER',
    absoluteBoundingBox: { x: 0, y: 0, width: 120, height: 40 },
  });
}

/**
 * 构造按钮 INSTANCE（带属性当前值）
 *
 * @param label 实例文本
 * @param disabled 是否禁用
 * @returns INSTANCE 节点
 */
export function makeButtonInstance(label: string, disabled = false): TestFigmaNode {
  const values: Record<string, ComponentPropertyValue> = {
    'State=Variant': { type: 'VARIANT', value: disabled ? 'Disabled' : 'Default' },
    Label: { type: 'TEXT', value: label },
    Disabled: { type: 'BOOLEAN', value: disabled },
  };
  return makeInstance(`Button/${label}`, 'btn:component', values, {
    id: `instance:${label}`,
    absoluteBoundingBox: { x: 0, y: 0, width: 120, height: 40 },
  });
}

/**
 * 构造单张信息卡片
 *
 * @param title 卡片标题
 * @param body 卡片正文
 * @param index 卡片序号（影响渐变与 ID，保证可区分）
 * @returns 卡片 FRAME 节点
 */
function makeInfoCard(title: string, body: string, index: number): TestFigmaNode {
  const cover = makeRect('cover', {
    overrides: {
      id: `card:${index}:cover`,
      fills: [makeLinearGradient([
        { position: 0, hex: '#6366F1' },
        { position: 1, hex: '#A855F7' },
      ])],
      absoluteBoundingBox: { x: 0, y: 0, width: 320, height: 120 },
    },
  });
  const titleNode = makeText('title', title, { fontWeight: 600, fontSize: 18 }, {
    id: `card:${index}:title`,
    fills: [makeSolidPaint('#111827')],
  });
  const bodyNode = makeText('body', body, { fontSize: 14 }, {
    id: `card:${index}:body`,
    fills: [makeSolidPaint('#6B7280')],
  });
  const action = makeButtonInstance(`查看详情 ${index + 1}`);
  return makeAutoLayoutFrame(`card-${index + 1}`, {
    children: [cover, titleNode, bodyNode, action],
    gap: 12,
    padding: 16,
    overrides: {
      id: `card:${index}`,
      fills: [makeSolidPaint('#FFFFFF')],
      cornerRadius: 12,
      effects: [makeDropShadow({ alpha: 0.12, offsetY: 2, blur: 12 })],
      absoluteBoundingBox: { x: 0, y: index * 220, width: 320, height: 200 },
    },
  });
}

/**
 * 构造整页设计稿：CANVAS > 应用栏 + 卡片列表
 *
 * @param options cardCount 卡片数量
 * @returns CANVAS 节点（可直接作为 get_file 的 document 子节点使用）
 */
export function makeCardPage(options: { readonly cardCount?: number } = {}): TestFigmaNode {
  const { cardCount = 3 } = options;
  const appBar = makeAutoLayoutFrame('app-bar', {
    mode: 'HORIZONTAL',
    gap: 12,
    counterAlign: 'CENTER',
    padding: 16,
    children: [
      makeText('app-title', 'Dashboard', { fontWeight: 700, fontSize: 20 }, { fills: [makeSolidPaint('#111827')] }),
      makeButtonInstance('新建'),
    ],
    overrides: {
      id: 'page:app-bar',
      fills: [makeSolidPaint('#F9FAFB')],
      absoluteBoundingBox: { x: 0, y: 0, width: 360, height: 72 },
    },
  });
  const cards = Array.from({ length: cardCount }, (_unused, index) => makeInfoCard('卡片标题', '这是卡片正文描述文本。', index));
  const list = makeAutoLayoutFrame('card-list', {
    children: cards,
    gap: 16,
    padding: 16,
    overrides: { id: 'page:card-list' },
  });
  return makeFrame('Canvas/Page-1', [appBar, list], {
    id: 'page:canvas',
    type: 'CANVAS',
    background: [makeSolidPaint('#F3F4F6')],
    backgroundColor: makeHexColor('#F3F4F6'),
    absoluteBoundingBox: { x: 0, y: 0, width: 360, height: 72 + cardCount * 220 },
  });
}

// ============================================================
// Variables 夹具
// ============================================================

/** Light 模式 ID */
export const MODE_LIGHT = 'mode-light';
/** Dark 模式 ID */
export const MODE_DARK = 'mode-dark';

/**
 * 构造 Light/Dark 双模式变量集合
 *
 * 覆盖三种 resolvedType：COLOR（双模式差异）、FLOAT、STRING，
 * 供 Tokens 提取与 DTCG 输出（T11）测试使用。
 *
 * @returns 符合 FigmaVariablesResponse.meta 形状的数据
 */
export function makeVariablesLightDark(): FigmaVariablesResponse['meta'] {
  const collectionId = 'collection:color';
  /** 构造 COLOR 双模式变量的简写 */
  function colorVar(
    id: string,
    name: string,
    light: string,
    dark: string,
  ): { readonly id: string; readonly raw: import('../../src/types.js').FigmaVariable } {
    return {
      id,
      raw: {
        id,
        name,
        key: `var-key-${id}`,
        variableCollectionId: collectionId,
        resolvedType: 'COLOR',
        valuesByMode: { [MODE_LIGHT]: makeHexColor(light), [MODE_DARK]: makeHexColor(dark) },
      },
    };
  }
  const primary = colorVar('var:color-primary', 'color/primary', '#2563EB', '#60A5FA');
  const background = colorVar('var:color-bg', 'color/background', '#FFFFFF', '#111827');
  const radius: import('../../src/types.js').FigmaVariable = {
    id: 'var:radius-md',
    name: 'radius/md',
    key: 'var-key-radius-md',
    variableCollectionId: collectionId,
    resolvedType: 'FLOAT',
    valuesByMode: { [MODE_LIGHT]: 8, [MODE_DARK]: 8 },
  };
  const fontFamily: import('../../src/types.js').FigmaVariable = {
    id: 'var:font-family',
    name: 'font/family',
    key: 'var-key-font-family',
    variableCollectionId: collectionId,
    resolvedType: 'STRING',
    valuesByMode: { [MODE_LIGHT]: 'Inter', [MODE_DARK]: 'Inter' },
  };
  const variables = [primary.raw, background.raw, radius, fontFamily];
  return {
    variableCollections: {
      [collectionId]: {
        id: collectionId,
        name: 'Primitives',
        key: 'collection-key-primitives',
        modes: [
          { modeId: MODE_LIGHT, name: 'Light' },
          { modeId: MODE_DARK, name: 'Dark' },
        ],
        defaultModeId: MODE_LIGHT,
        remote: false,
        variableIds: variables.map((v) => v.id),
      },
    },
    variables: Object.fromEntries(variables.map((v) => [v.id, v])),
  };
}
