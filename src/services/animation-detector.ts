/**
 * 动画/动效检测服务 - Animation Detector
 *
 * **当前状态：基础框架，为后续版本提供扩展方向**
 *
 * Figma 动效还原实现方向：
 *
 * ### 1. Figma Prototype 交互检测（当前实现）
 * - 检测节点的 reactions/interactions 属性
 * - 识别过渡类型（DISSOLVE、SMART_ANIMATE、MOVE_IN、MOVE_OUT、PUSH、SLIDE）
 * - 识别缓动函数（EASE_IN、EASE_OUT、EASE_IN_OUT、SPRING、LINEAR）
 * - 输出 CSS transition/animation 建议
 *
 * ### 2. Smart Animate 还原（规划中）
 * - 分析起点和终点帧的布局差异
 * - 自动生成 Framer Motion variants
 * - 支持 position/opacity/scale/rotation/color 插值
 * - 导出为 useAnimation + motion 组件代码
 *
 * ### 3. 微交互动画（规划中）
 * - Hover 状态变化（hoverStyle）
 * - Pressed 状态
 * - Loading 动画（spinner、骨架屏）
 * - Lottie 导出支持
 *
 * ### 4. 滚动驱动动画（规划中）
 * - Parallax 视差
 * - Scroll-triggered reveal
 * - Viewport 进入动画
 *
 * @module
 */

import type { FigmaNode } from '../types.js';

// ============ 类型定义 ============

export type FigmaTransitionType =
  | 'DISSOLVE'
  | 'SMART_ANIMATE'
  | 'MOVE_IN'
  | 'MOVE_OUT'
  | 'PUSH'
  | 'SLIDE'
  | 'SCROLL_ANIMATE';

export type FigmaEasingType =
  | 'EASE_IN'
  | 'EASE_OUT'
  | 'EASE_IN_AND_OUT'
  | 'LINEAR'
  | 'SPRING'
  | 'CUSTOM_CUBIC_BEZIER';

export interface AnimationTransition {
  /** 过渡类型 */
  type: FigmaTransitionType;
  /** 持续时间（毫秒） */
  duration: number;
  /** 延迟（毫秒） */
  delay?: number;
  /** 缓动类型 */
  easing: FigmaEasingType;
  /** 自定义贝塞尔曲线 [x1, y1, x2, y2] */
  easingFunction?: [number, number, number, number];
  /** 方向（MOVE_IN/MOVE_OUT/PUSH/SLIDE 使用） */
  direction?: 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM';
  /** 是否匹配图层（SMART_ANIMATE） */
  matchLayers?: boolean;
}

export interface AnimationReaction {
  /** 触发动作 */
  trigger: 'ON_CLICK' | 'ON_HOVER' | 'ON_PRESS' | 'ON_DRAG' | 'AFTER_TIMEOUT' | 'MOUSE_ENTER' | 'MOUSE_LEAVE';
  /** 目标节点 ID */
  destinationId?: string;
  /** 目标节点名称 */
  destinationName?: string;
  /** 过渡动画 */
  transition?: AnimationTransition;
  /** 超时时间（AFTER_TIMEOUT） */
  timeout?: number;
}

export interface AnimationHints {
  /** 是否有交互动画 */
  hasInteractions: boolean;
  /** 检测到的交互列表 */
  reactions: AnimationReaction[];
  /** CSS transition 建议代码 */
  cssTransitionCode?: string;
  /** Framer Motion 建议代码 */
  framerMotionCode?: string;
  /** 是否使用 Smart Animate（需要手动配置） */
  usesSmartAnimate: boolean;
  /** 建议的动画属性 */
  animatedProperties: string[];
}

/**
 * CSS 缓动函数映射
 */
const EASING_TO_CSS: Record<FigmaEasingType, string> = {
  EASE_IN: 'cubic-bezier(0.4, 0, 1, 1)',
  EASE_OUT: 'cubic-bezier(0, 0, 0.2, 1)',
  EASE_IN_AND_OUT: 'cubic-bezier(0.4, 0, 0.2, 1)',
  LINEAR: 'linear',
  SPRING: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)', // 近似 spring
  CUSTOM_CUBIC_BEZIER: 'cubic-bezier(0.4, 0, 0.2, 1)',
};

/**
 * 过渡类型对应的 CSS 属性
 */
const TRANSITION_TO_PROPERTIES: Record<FigmaTransitionType, string[]> = {
  DISSOLVE: ['opacity'],
  SMART_ANIMATE: ['opacity', 'transform', 'background-color'],
  MOVE_IN: ['transform'],
  MOVE_OUT: ['transform', 'opacity'],
  PUSH: ['transform'],
  SLIDE: ['transform'],
  SCROLL_ANIMATE: ['transform', 'opacity'],
};

/**
 * 动画检测器
 *
 * 检测 Figma 节点中的交互动效并生成代码建议
 */
export class AnimationDetector {
  /**
   * 检测节点树中的交互动画
   *
   * @param rootNode - 根节点
   * @returns 动画提示和代码建议
   */
  detectAnimations(rootNode: FigmaNode): AnimationHints {
    const reactions: AnimationReaction[] = [];
    const animatedProperties = new Set<string>();
    let usesSmartAnimate = false;

    this._traverseForInteractions(rootNode, reactions, animatedProperties, (isSmart) => {
      if (isSmart) usesSmartAnimate = true;
    });

    const hasInteractions = reactions.length > 0;

    let cssTransitionCode: string | undefined;
    let framerMotionCode: string | undefined;

    if (hasInteractions) {
      cssTransitionCode = this._generateCssTransition(reactions, animatedProperties);
      framerMotionCode = this._generateFramerMotionHint(reactions);
    }

    return {
      hasInteractions,
      reactions,
      cssTransitionCode,
      framerMotionCode,
      usesSmartAnimate,
      animatedProperties: Array.from(animatedProperties),
    };
  }

  /**
   * 递归遍历节点查找交互
   */
  private _traverseForInteractions(
    node: FigmaNode,
    reactions: AnimationReaction[],
    animatedProps: Set<string>,
    onSmartAnimate: (isSmart: boolean) => void,
  ): void {
    // 检测 reactions（Figma prototype 交互）
    const reactionsAny = node as unknown as { reactions?: unknown[]; interactions?: unknown[] };
    const nodeReactions = reactionsAny.reactions || reactionsAny.interactions;

    if (Array.isArray(nodeReactions)) {
      for (const reaction of nodeReactions) {
        const parsed = this._parseReaction(reaction as Record<string, unknown>, animatedProps, onSmartAnimate);
        if (parsed) {
          reactions.push(parsed);
        }
      }
    }

    // 递归子节点
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        this._traverseForInteractions(child, reactions, animatedProps, onSmartAnimate);
      }
    }
  }

  /**
   * 解析单个交互 reaction
   */
  private _parseReaction(
    reaction: Record<string, unknown>,
    animatedProps: Set<string>,
    onSmartAnimate: (isSmart: boolean) => void,
  ): AnimationReaction | null {
    const triggerObj = reaction.trigger as Record<string, unknown> | undefined;
    const actionObj = reaction.action as Record<string, unknown> | undefined;
    const trigger = (triggerObj?.type || actionObj?.type) as string | undefined;
    if (!trigger) return null;

    const action = actionObj;
    const transition = action?.transition as Record<string, unknown> | undefined;

    const result: AnimationReaction = {
      trigger: this._mapTriggerType(trigger),
    };

    // 解析目标导航
    if (action?.destinationId) {
      result.destinationId = action.destinationId as string;
    }
    if (action?.destinationName) {
      result.destinationName = action.destinationName as string;
    }

    // 解析超时
    if (trigger === 'AFTER_TIMEOUT' && typeof action?.timeout === 'number') {
      result.timeout = action.timeout;
    }

    // 解析过渡动画
    if (transition) {
      const parsed = this._parseTransition(transition, animatedProps, onSmartAnimate);
      if (parsed) {
        result.transition = parsed;
      }
    }

    return result;
  }

  /**
   * 映射 trigger 类型
   */
  private _mapTriggerType(trigger: string): AnimationReaction['trigger'] {
    const map: Record<string, AnimationReaction['trigger']> = {
      ON_CLICK: 'ON_CLICK',
      ON_PRESS: 'ON_PRESS',
      ON_HOVER: 'ON_HOVER',
      ON_DRAG: 'ON_DRAG',
      AFTER_TIMEOUT: 'AFTER_TIMEOUT',
      MOUSE_ENTER: 'MOUSE_ENTER',
      MOUSE_LEAVE: 'MOUSE_LEAVE',
    };
    return map[trigger] || 'ON_CLICK';
  }

  /**
   * 解析过渡配置
   */
  private _parseTransition(
    transition: Record<string, unknown>,
    animatedProps: Set<string>,
    onSmartAnimate: (isSmart: boolean) => void,
  ): AnimationTransition | null {
    const type = transition.type as FigmaTransitionType | undefined;
    if (!type) return null;

    // 记录动画属性
    const props = TRANSITION_TO_PROPERTIES[type] || [];
    props.forEach((p) => animatedProps.add(p));

    if (type === 'SMART_ANIMATE') {
      onSmartAnimate(true);
    }

    const result: AnimationTransition = {
      type,
      duration: typeof transition.duration === 'number' ? transition.duration : 300,
      easing: (transition.easing as FigmaEasingType) || 'EASE_OUT',
    };

    if (typeof transition.delay === 'number') {
      result.delay = transition.delay;
    }

    if (transition.direction) {
      result.direction = transition.direction as AnimationTransition['direction'];
    }

    if (transition.matchLayers !== undefined) {
      result.matchLayers = transition.matchLayers as boolean;
    }

    // 自定义贝塞尔曲线
    if (transition.easingFunctionCubicBezier) {
      const bezier = transition.easingFunctionCubicBezier as Record<string, number>;
      result.easing = 'CUSTOM_CUBIC_BEZIER';
      result.easingFunction = [bezier.x1 || 0.4, bezier.y1 || 0, bezier.x2 || 0.2, bezier.y2 || 1];
    }

    return result;
  }

  /**
   * 生成 CSS transition 代码建议
   */
  private _generateCssTransition(
    reactions: AnimationReaction[],
    animatedProps: Set<string>,
  ): string {
    // 取第一个非空 transition 作为示例
    const firstTransition = reactions.find((r) => r.transition)?.transition;
    if (!firstTransition) return '';

    const duration = firstTransition.duration;
    const easing = firstTransition.easingFunction
      ? `cubic-bezier(${firstTransition.easingFunction.join(', ')})`
      : EASING_TO_CSS[firstTransition.easing];
    const delay = firstTransition.delay || 0;
    const properties = Array.from(animatedProps).join(', ');

    return `${indent(3)}/* CSS Transition 建议（根据 Figma Prototype 检测） */
${indent(3)}.animated-element {
${indent(4)}transition: ${properties} ${duration}ms ${easing}${delay ? ` ${delay}ms` : ''};
${indent(4) /* hover/active 状态需要手动补充 */}
${indent(3)}}`;
  }

  /**
   * 生成 Framer Motion 代码建议
   */
  private _generateFramerMotionHint(reactions: AnimationReaction[]): string {
    const hasHover = reactions.some((r) => r.trigger === 'ON_HOVER' || r.trigger === 'MOUSE_ENTER');
    const hasClick = reactions.some((r) => r.trigger === 'ON_CLICK' || r.trigger === 'ON_PRESS');

    const lines: string[] = [];
    lines.push('// Framer Motion 建议（根据 Figma 交互检测）');
    lines.push('import { motion } from "framer-motion";');
    lines.push('');

    if (hasHover || hasClick) {
      lines.push('// 建议使用 whileHover/whileTap');
      lines.push('<motion.div');
      lines.push('  initial={{ opacity: 1 }}');
      if (hasHover) {
        lines.push('  whileHover={{ scale: 1.02, opacity: 0.9 }}');
      }
      if (hasClick) {
        lines.push('  whileTap={{ scale: 0.98 }}');
      }
      lines.push('  transition={{ duration: 0.2, ease: "easeOut" }}');
      lines.push('/>');
    } else {
      lines.push('// 检测到页面导航过渡，建议使用 AnimatePresence');
      lines.push('import { AnimatePresence, motion } from "framer-motion";');
    }

    return lines.join('\n');
  }
}

/**
 * 简单缩进工具
 */
function indent(level: number): string {
  return '  '.repeat(level);
}

/**
 * 创建动画检测器实例
 */
export function createAnimationDetector(): AnimationDetector {
  return new AnimationDetector();
}
