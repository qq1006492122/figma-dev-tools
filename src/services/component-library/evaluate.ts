/**
 * 标注 fixture 评测器（WBS-P2-11）
 *
 * 对 ≥60 个人工标注节点跑保守模式匹配，输出验收三指标：
 * - identificationRate：正例中组件类型被正确识别的比例（验收 ≥70%）；
 * - propsNodePassRate：带期望 props 的正例节点中，全部期望 prop 命中的比例（验收 ≥60%）；
 * - falseReplacements：标注为「不应替换」却被替换的节点数（保守模式必须恒为 0）。
 *
 * @module services/component-library/evaluate
 */

import type { ProcessedNode } from '../../types/nodes.js';
import { matchComponent } from './matcher.js';
import { needsDangerFlag, normalizePropValue } from './registry.js';
import type { ComponentLibraryId, MappableComponent, MatchStats } from './types.js';

/** 单个标注节点 */
export interface LabeledNode {
  /** 标注 id（评测报告定位用） */
  readonly id: string;
  /** 输入节点 */
  readonly node: ProcessedNode;
  /** 期望命中的语义组件；null = 负例（必须保持原生标签） */
  readonly expected: MappableComponent | null;
  /**
   * 期望 props（canonical 口径：variant/type/size/shape/color/defaultValue/placeholder）。
   * 评测时按目标库 normalizePropValue 转换比较。
   */
  readonly expectedProps?: Readonly<Record<string, string>>;
}

/** fixture 标注节点总数 */
export function fixtureLabeledCount(fixtures: readonly LabeledNode[]): number {
  return fixtures.length;
}

/** 评测单个节点的 props 期望是否全部命中 */
function propsHit(
  match: NonNullable<ReturnType<typeof matchComponent>>,
  component: MappableComponent,
  expected: Record<string, string>,
  library: ComponentLibraryId,
): boolean {
  for (const [canonicalName, canonicalValue] of Object.entries(expected)) {
    // variant 在 antd/element/vue 侧落为 type prop
    const propName =
      canonicalName === 'variant' && library !== 'shadcn-ui' ? 'type' : canonicalName;
    const want = normalizePropValue(library, component, canonicalName, canonicalValue);
    const got = match.props.find((p) => p.name === propName)?.value;
    if (got !== want) return false;
    // antd/antdv 危险主按钮还必须有 danger=true
    if (
      canonicalName === 'variant' &&
      canonicalValue === 'danger' &&
      needsDangerFlag(library, component, 'danger') &&
      !match.props.some((p) => p.name === 'danger' && p.value === 'true')
    ) {
      return false;
    }
  }
  return true;
}

/**
 * 对整套标注 fixture 跑评测。
 */
export function evaluateFixtureSet(
  fixtures: readonly LabeledNode[],
  library: ComponentLibraryId,
): MatchStats {
  let positive = 0;
  let correctlyIdentified = 0;
  let falseReplacements = 0;
  let propsNodes = 0;
  let propsPassed = 0;

  const failures: Array<{ id: string; expected: string | null; got: string | null }> = [];

  for (const labeled of fixtures) {
    const match = matchComponent(labeled.node, library);
    if (labeled.expected === null) {
      if (match) {
        falseReplacements += 1;
        failures.push({ id: labeled.id, expected: null, got: `${match.component}(${match.confidence})` });
      }
      continue;
    }

    positive += 1;
    if (match?.component === labeled.expected) {
      correctlyIdentified += 1;
      if (labeled.expectedProps && Object.keys(labeled.expectedProps).length > 0) {
        propsNodes += 1;
        if (propsHit(match, labeled.expected, labeled.expectedProps, library)) {
          propsPassed += 1;
        } else {
          failures.push({ id: labeled.id, expected: `${labeled.expected}+props`, got: match.props.map((p) => `${p.name}=${p.value}`).join(',') });
        }
      }
    } else {
      failures.push({ id: labeled.id, expected: labeled.expected, got: match ? `${match.component}(${match.confidence})` : null });
    }
  }

  return {
    labeled: fixtures.length,
    correctlyIdentified,
    falseReplacements,
    identificationRate: positive > 0 ? correctlyIdentified / positive : 1,
    propsNodePassRate: propsNodes > 0 ? propsPassed / propsNodes : 1,
  };
}
