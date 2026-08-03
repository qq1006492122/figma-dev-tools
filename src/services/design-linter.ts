/**
 * 代码还原质量检查服务
 *
 * 专注于检查 Figma 设计稿中会影响 AI 代码还原质量的问题，与官方 @figma/code-connect 互补：
 * - code-connect：用于已有设计系统组件 ↔ Figma 组件的映射（需要付费计划）
 * - 本工具：代码生成前的质量预检，专为从零生成 React+Tailwind 代码优化
 *
 * 检查项包括：
 * - Auto Layout 使用情况（直接影响 Flex 布局生成质量）
 * - 图层命名规范（影响代码语义化）
 * - 间距/尺寸/圆角是否符合 4px 网格（影响 Tailwind 类名匹配）
 * - 组件复用情况（影响代码复用性）
 * - 可交互元素尺寸（影响无障碍）
 * - 嵌套层级深度（影响代码可读性）
 * - 图标尺寸统一性（影响图标组件复用）
 *
 * @module
 */

import type { ProcessedNode } from '../types/nodes.js';

export type LintSeverity = 'error' | 'warning' | 'info';

export type LintCategory =
  | 'layout'
  | 'naming'
  | 'spacing'
  | 'component'
  | 'accessibility'
  | 'structure';

export interface LintIssue {
  severity: LintSeverity;
  category: LintCategory;
  nodeId?: string;
  nodeName?: string;
  message: string;
  suggestion?: string;
  impact?: string;
  fixSteps?: string[];
  autoFixable?: boolean;
}

export interface LintResult {
  score: number;
  totalNodes: number;
  issues: LintIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  categoryBreakdown: Record<string, number>;
  summary: string;
  markdownReport: string;
}

const SPACING_BASE = 4;
const MIN_INTERACTIVE_SIZE = 44;
const MAX_NESTING_DEPTH = 8;
const STANDARD_RADII = [0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 48, 64, 9999];

const MEANINGLESS_NAME_PATTERNS = [
  /^Frame\s*\d*$/i,
  /^Rectangle\s*\d*$/i,
  /^Ellipse\s*\d*$/i,
  /^Line\s*\d*$/i,
  /^Text\s*\d*$/i,
  /^Group\s*\d*$/i,
  /^Vector\s*\d*$/i,
  /^Polygon\s*\d*$/i,
  /^Star\s*\d*$/i,
  /^Boolean\s*\d*$/i,
  /^Slice\s*\d*$/i,
  /^Component\s*\d*$/i,
  /^Instance\s*\d*$/i,
  /^形状\s*\d*$/i,
  /^矩形\s*\d*$/i,
  /^椭圆\s*\d*$/i,
  /^文本\s*\d*$/i,
  /^线条\s*\d*$/i,
  /^矢量\s*\d*$/i,
  /^编组\s*\d*$/i,
  /^未命名\s*\d*$/i,
];

function isMeaninglessName(name: string): boolean {
  return MEANINGLESS_NAME_PATTERNS.some((pattern) => pattern.test(name.trim()));
}

function isAlignedToGrid(value: number, base: number = SPACING_BASE): boolean {
  return Math.abs(Math.round(value / base) * base - value) < 0.5;
}

function nearestGridValue(value: number, base: number = SPACING_BASE): number {
  return Math.round(value / base) * base;
}

function isStandardRadius(radius: number): boolean {
  return STANDARD_RADII.some((r) => Math.abs(r - radius) < 0.5) || radius >= 9999;
}

function nearestStandardRadius(radius: number): number {
  if (radius >= 9999) return 9999;
  let nearest: number = 0;
  let minDiff = Number.POSITIVE_INFINITY;
  for (const r of STANDARD_RADII) {
    const diff = Math.abs(radius - r);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = r;
    }
  }
  return nearest;
}

interface LintContext {
  issues: LintIssue[];
  totalNodes: number;
  nodeNames: Map<string, number>;
  iconSizes: Map<string, { width: number; height: number; count: number }>;
  componentCount: number;
}

export class DesignLinter {
  private ctx: LintContext;

  constructor() {
    this.ctx = {
      issues: [],
      totalNodes: 0,
      nodeNames: new Map(),
      iconSizes: new Map(),
      componentCount: 0,
    };
  }

  lint(nodes: ProcessedNode | ProcessedNode[]): LintResult {
    this.ctx = {
      issues: [],
      totalNodes: 0,
      nodeNames: new Map(),
      iconSizes: new Map(),
      componentCount: 0,
    };

    const nodesArray = Array.isArray(nodes) ? nodes : [nodes];
    for (const node of nodesArray) {
      this.traverseNode(node, 0, null);
    }

    this.checkIconConsistency();

    return this.buildResult();
  }

  private traverseNode(node: ProcessedNode, depth: number, parent: ProcessedNode | null): void {
    this.ctx.totalNodes++;

    this.checkNodeNaming(node);
    this.checkLayout(node, parent, depth);
    this.checkSpacing(node);
    this.checkSizes(node);
    this.checkCornerRadius(node);
    this.checkComponents(node);
    this.checkInteractableSize(node);
    this.checkNestingDepth(node, depth);
    this.collectIconSizes(node);

    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        this.traverseNode(child, depth + 1, node);
      }
    }
  }

  private addIssue(issue: LintIssue): void {
    this.ctx.issues.push(issue);
  }

  private checkNodeNaming(node: ProcessedNode): void {
    const name = node.name?.trim();
    if (!name) return;

    if (isMeaninglessName(name)) {
      this.addIssue({
        severity: 'warning',
        category: 'naming',
        nodeId: node.figmaId || node.id,
        nodeName: name,
        message: `图层名称"${name}"是默认名称，缺乏语义`,
        suggestion: `请将图层重命名为有意义的名称，例如"Header"、"PrimaryButton"、"UserAvatar"等`,
        impact: '默认名称会导致生成的代码使用无意义的变量名/类名，降低代码可读性和可维护性，AI 无法准确推断元素语义。',
        fixSteps: [
          '1. 在 Figma 图层面板中双击该图层名称',
          '2. 输入语义化名称（如 Header、PrimaryButton、UserAvatar）',
          '3. 使用 PascalCase 或 kebab-case 风格保持一致性'
        ],
        autoFixable: false,
      });
    }

    const key = `${name}-${node.originalType}`;
    this.ctx.nodeNames.set(key, (this.ctx.nodeNames.get(key) || 0) + 1);
  }

  private checkLayout(node: ProcessedNode, _parent: ProcessedNode | null, _depth: number): void {
    if (node.originalType === 'FRAME' || node.originalType === 'COMPONENT' || node.originalType === 'INSTANCE') {
      if (!node.layout || node.layout.mode === 'NONE') {
        if (node.children && node.children.length > 0) {
          this.addIssue({
            severity: 'warning',
            category: 'layout',
            nodeId: node.figmaId || node.id,
            nodeName: node.name,
            message: `框架"${node.name}"使用了绝对定位而非 Auto Layout`,
            suggestion: '建议使用 Auto Layout（自动布局），这是生成高质量 Flex 代码的关键',
            impact: '绝对定位元素会导致生成代码使用 position: absolute，难以实现响应式适配，子元素位置无法自动调整，在不同屏幕尺寸下容易错位。',
            fixSteps: [
              '1. 选中该 Frame 图层',
              '2. 在右侧属性面板点击 "Auto Layout"（或按 Shift+A）',
              '3. 根据布局方向选择 Horizontal（水平）或 Vertical（垂直）',
              '4. 使用 gap 属性设置子元素间距',
              '5. 设置 padding 控制内边距'
            ],
            autoFixable: false,
          });
        }
      }
    }
  }

  private checkSpacing(node: ProcessedNode): void {
    if (!node.layout) return;

    const { padding, itemSpacing } = node.layout;

    const spacingValues: Array<{ name: string; value: number }> = [
      { name: '内边距(上)', value: padding.top },
      { name: '内边距(右)', value: padding.right },
      { name: '内边距(下)', value: padding.bottom },
      { name: '内边距(左)', value: padding.left },
    ];

    if (itemSpacing !== undefined && itemSpacing > 0) {
      spacingValues.push({ name: '子项间距', value: itemSpacing });
    }

    if (node.layout.counterAxisSpacing !== undefined && node.layout.counterAxisSpacing > 0) {
      spacingValues.push({ name: '交叉轴间距', value: node.layout.counterAxisSpacing });
    }

    for (const { name, value } of spacingValues) {
      if (value > 0 && !isAlignedToGrid(value)) {
        const nearest = nearestGridValue(value);
        this.addIssue({
          severity: 'info',
          category: 'spacing',
          nodeId: node.figmaId || node.id,
          nodeName: node.name,
          message: `节点"${node.name}"的${name}为 ${value}px，不符合 4px 网格系统`,
          suggestion: `建议调整为 ${nearest}px（最近的 4px 网格值）`,
          impact: '非 4px 倍数的间距无法匹配 Tailwind 默认 spacing scale，会生成任意值的 inline style 或自定义 padding/margin，降低代码一致性。',
          fixSteps: [
            `1. 选中该图层，在右侧 Auto Layout 面板找到${name}`,
            `2. 将数值修改为 ${nearest}px`,
            '3. 确保所有间距都使用 4/8/12/16/20/24/32px 等规范值'
          ],
          autoFixable: true,
        });
      }
    }
  }

  private checkSizes(node: ProcessedNode): void {
    if (!node.size) return;

    const { width, height } = node.size;

    if (width > 0 && !isAlignedToGrid(width)) {
      const nearest = nearestGridValue(width);
      this.addIssue({
        severity: 'info',
        category: 'spacing',
        nodeId: node.figmaId || node.id,
        nodeName: node.name,
        message: `节点"${node.name}"的宽度为 ${Math.round(width)}px，不符合 4px 网格系统`,
        suggestion: `建议调整为 ${nearest}px（最近的 4px 网格值）`,
        impact: `不规则宽度无法匹配 Tailwind 的 w-* 尺寸类，会生成任意 w-[${Math.round(width)}px] 值，影响设计系统一致性。`,
        fixSteps: [
          '1. 选中该图层',
          '2. 在右侧面板找到 W（宽度）属性',
          `3. 将数值修改为 ${nearest}px`
        ],
        autoFixable: true,
      });
    }

    if (height > 0 && !isAlignedToGrid(height)) {
      const nearest = nearestGridValue(height);
      this.addIssue({
        severity: 'info',
        category: 'spacing',
        nodeId: node.figmaId || node.id,
        nodeName: node.name,
        message: `节点"${node.name}"的高度为 ${Math.round(height)}px，不符合 4px 网格系统`,
        suggestion: `建议调整为 ${nearest}px（最近的 4px 网格值）`,
        impact: `不规则高度无法匹配 Tailwind 的 h-* 尺寸类，会生成任意 h-[${Math.round(height)}px] 值，影响设计系统一致性。`,
        fixSteps: [
          '1. 选中该图层',
          '2. 在右侧面板找到 H（高度）属性',
          `3. 将数值修改为 ${nearest}px`
        ],
        autoFixable: true,
      });
    }

    if (node.absolutePosition) {
      const { left, top, right, bottom } = node.absolutePosition;
      const positions = [
        { name: 'left', value: left },
        { name: 'top', value: top },
        { name: 'right', value: right },
        { name: 'bottom', value: bottom },
      ];
      for (const { name, value } of positions) {
        if (value !== undefined && !isAlignedToGrid(value)) {
          const nearest = nearestGridValue(value);
          this.addIssue({
            severity: 'info',
            category: 'spacing',
            nodeId: node.figmaId || node.id,
            nodeName: node.name,
            message: `节点"${node.name}"的绝对定位 ${name} 为 ${value}px，不符合 4px 网格系统`,
            suggestion: `建议调整为 ${nearest}px`,
            impact: '绝对定位坐标的不规则值会导致生成的代码使用非标准 left/top 值，增加维护难度。',
            fixSteps: [
              `1. 选中该绝对定位图层`,
              `2. 在右侧面板找到 ${name} 属性`,
              `3. 将数值修改为 ${nearest}px`,
              '4. 优先考虑使用 Auto Layout 替代绝对定位'
            ],
            autoFixable: true,
          });
        }
      }
    }
  }

  private checkCornerRadius(node: ProcessedNode): void {
    if (!node.cornerRadius) return;

    const radii = [
      { name: '左上角', value: node.cornerRadius.topLeft },
      { name: '右上角', value: node.cornerRadius.topRight },
      { name: '右下角', value: node.cornerRadius.bottomRight },
      { name: '左下角', value: node.cornerRadius.bottomLeft },
    ];

    for (const { name, value } of radii) {
      if (value > 0 && !isStandardRadius(value)) {
        const nearest = nearestStandardRadius(value);
        const nearestText = nearest >= 9999 ? '9999px (全圆角)' : `${nearest}px`;
        this.addIssue({
          severity: 'info',
          category: 'spacing',
          nodeId: node.figmaId || node.id,
          nodeName: node.name,
          message: `节点"${node.name}"的${name}圆角为 ${Math.round(value)}px，不是标准圆角值`,
          suggestion: `建议使用标准圆角值：${nearestText}（2px/4px/6px/8px/12px/16px/20px/24px/32px/48px 或全圆角）`,
          impact: `非标准圆角无法匹配 Tailwind 的 rounded-* 类名，会生成任意 rounded-[${Math.round(value)}px] 值，增加自定义 CSS 需求。`,
          fixSteps: [
            '1. 选中该图层',
            '2. 在右侧面板找到 Corner radius 属性',
            `3. 将${name}圆角修改为 ${nearestText}`,
            '4. 如需统一圆角，点击"Independent corners"取消独立角设置'
          ],
          autoFixable: true,
        });
      }
    }
  }

  private checkComponents(node: ProcessedNode): void {
    if (node.originalType === 'COMPONENT' || node.originalType === 'COMPONENT_SET') {
      this.ctx.componentCount++;
    }
  }

  private checkInteractableSize(node: ProcessedNode): void {
    const interactiveRoles = ['button', 'link', 'input'];
    if (!interactiveRoles.includes(node.role)) return;

    if (!node.size) return;

    const { width, height } = node.size;
    const minDimension = Math.min(width, height);

    if (minDimension > 0 && minDimension < MIN_INTERACTIVE_SIZE) {
      this.addIssue({
        severity: 'warning',
        category: 'accessibility',
        nodeId: node.figmaId || node.id,
        nodeName: node.name,
        message: `可交互元素"${node.name}"尺寸过小（${Math.round(width)}×${Math.round(height)}px）`,
        suggestion: `根据 WCAG 无障碍指南，可点击/可触摸元素的最小尺寸应为 ${MIN_INTERACTIVE_SIZE}×${MIN_INTERACTIVE_SIZE}px`,
        impact: '过小的点击区域会导致移动端用户难以点击，生成的代码无障碍性差，影响用户体验。',
        fixSteps: [
          '1. 选中该可交互元素（按钮/链接/输入框）',
          '2. 检查是否使用了 Auto Layout',
          `3. 增加 padding 或最小尺寸，确保宽高至少 ${MIN_INTERACTIVE_SIZE}px`,
          '4. 图标按钮建议保持 44×44px 的点击热区'
        ],
        autoFixable: false,
      });
    }
  }

  private checkNestingDepth(node: ProcessedNode, depth: number): void {
    if (depth > MAX_NESTING_DEPTH) {
      this.addIssue({
        severity: 'warning',
        category: 'structure',
        nodeId: node.figmaId || node.id,
        nodeName: node.name,
        message: `节点嵌套层级过深（第 ${depth} 层）`,
        suggestion: `建议将嵌套层级控制在 ${MAX_NESTING_DEPTH} 层以内，使用更扁平的结构`,
        impact: '过深的嵌套会导致生成的 JSX 代码有大量嵌套 div，造成"div soup"问题，代码可读性差、性能下降、维护困难。',
        fixSteps: [
          '1. 审查该节点的父级结构',
          '2. 删除无意义的空 Frame 包裹层',
          '3. 将相关元素编组为 Component 复用',
          '4. 使用 Auto Layout 减少不必要的嵌套',
          `5. 保持层级不超过 ${MAX_NESTING_DEPTH} 层`
        ],
        autoFixable: false,
      });
    }
  }

  private collectIconSizes(node: ProcessedNode): void {
    if (node.role !== 'icon' || !node.size) return;

    const { width, height } = node.size;
    if (width <= 0 || height <= 0) return;

    const sizeKey = `${Math.round(width)}x${Math.round(height)}`;
    const existing = this.ctx.iconSizes.get(sizeKey);
    if (existing) {
      existing.count++;
    } else {
      this.ctx.iconSizes.set(sizeKey, { width: Math.round(width), height: Math.round(height), count: 1 });
    }
  }

  private checkIconConsistency(): void {
    if (this.ctx.iconSizes.size <= 1) return;

    const sizes = Array.from(this.ctx.iconSizes.entries())
      .map(([key, data]) => Object.assign({ key }, data))
      .sort((a, b) => b.count - a.count);

    const mostCommonSize = sizes[0];
    if (!mostCommonSize) return;

    const inconsistentSizes = sizes.slice(1).filter((s) => s.count >= 1);

    if (inconsistentSizes.length > 0) {
      const sizeList = inconsistentSizes.map((s) => `${s.width}×${s.height}px (${s.count}个)`).join('、');
      this.addIssue({
        severity: 'info',
        category: 'structure',
        message: `图标尺寸不统一，检测到多种尺寸：${sizeList}`,
        suggestion: `建议统一图标尺寸为 ${mostCommonSize.width}×${mostCommonSize.height}px（使用最多的尺寸）`,
        impact: '图标尺寸不统一会导致生成代码时无法复用同一个图标组件类名，需要为不同尺寸图标编写不同样式，增加代码冗余。',
        fixSteps: [
          `1. 确定统一的图标尺寸标准（推荐 ${mostCommonSize.width}×${mostCommonSize.height}px）`,
          '2. 选中所有非标准尺寸的图标',
          '3. 使用 Scale 工具（K 键）等比缩放至标准尺寸',
          '4. 建议使用标准尺寸：16×16px、20×20px、24×24px、32×32px'
        ],
        autoFixable: false,
      });
    }
  }

  private calculateScore(): number {
    let score = 100;

    const errorWeight = 8;
    const warningWeight = 4;
    const infoWeight = 1;

    const errorCount = this.ctx.issues.filter((i) => i.severity === 'error').length;
    const warningCount = this.ctx.issues.filter((i) => i.severity === 'warning').length;
    const infoCount = this.ctx.issues.filter((i) => i.severity === 'info').length;

    score -= errorCount * errorWeight;
    score -= warningCount * warningWeight;
    score -= infoCount * infoWeight;

    if (this.ctx.componentCount === 0 && this.ctx.totalNodes > 20) {
      score -= 15;
    }

    const layoutIssues = this.ctx.issues.filter((i) => i.category === 'layout').length;
    if (layoutIssues > 3) {
      score -= 5;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private getScoreEmoji(score: number): string {
    if (score >= 90) return '🎉';
    if (score >= 75) return '✅';
    if (score >= 60) return '⚠️';
    if (score >= 40) return '🔶';
    return '❌';
  }

  private getScoreRating(score: number): string {
    if (score >= 90) return '优秀';
    if (score >= 80) return '良好';
    if (score >= 60) return '可接受';
    if (score >= 40) return '较差';
    return '急需改进';
  }

  private getCategoryBreakdown(): Record<string, number> {
    const breakdown: Record<string, number> = {
      layout: 0,
      naming: 0,
      spacing: 0,
      component: 0,
      accessibility: 0,
      structure: 0,
    };

    for (const issue of this.ctx.issues) {
      breakdown[issue.category] = (breakdown[issue.category] || 0) + 1;
    }

    return breakdown;
  }

  private generateMarkdownReport(result: Omit<LintResult, 'markdownReport'>): string {
    const lines: string[] = [];
    const emoji = this.getScoreEmoji(result.score);
    const rating = this.getScoreRating(result.score);

    lines.push(`# 代码还原质量预检报告`);
    lines.push('');
    lines.push(`> **本检查专注于代码还原质量，与 Figma Code Connect 互补。**`);
    lines.push(`> 如需映射已有设计系统组件，请使用官方 @figma/code-connect（需 Organization/Enterprise 付费计划）。`);
    lines.push(`> 本工具专为从零生成 React+Tailwind 代码优化，免费且无需插件。`);
    lines.push('');
    lines.push(`## ${emoji} 代码还原质量评分: ${result.score}/100 (${rating})`);
    lines.push('');

    if (result.score >= 80) {
      lines.push(`✅ **评分良好**：设计稿质量较高，可以直接生成代码，还原效果预期良好。`);
    } else {
      lines.push(`⚠️ **建议修复**：评分低于 80 分，建议先修复以下问题再生成代码，以获得最佳还原效果。`);
    }
    lines.push('');

    lines.push(`| 指标 | 数值 |`);
    lines.push(`|------|------|`);
    lines.push(`| 检查节点总数 | ${result.totalNodes} |`);
    lines.push(`| 严重问题 (error) | ${result.errorCount} |`);
    lines.push(`| 警告 (warning) | ${result.warningCount} |`);
    lines.push(`| 优化建议 (info) | ${result.infoCount} |`);
    lines.push(`| 问题总数 | ${result.issues.length} |`);
    lines.push('');

    if (result.issues.length === 0) {
      lines.push(`## ✅ 恭喜！`);
      lines.push('');
      lines.push(`设计稿完美符合代码还原规范，可以生成高质量的 React+Tailwind 代码！`);
      lines.push('');
      return lines.join('\n');
    }

    lines.push(`## 📊 问题分类统计`);
    lines.push('');

    const categoryNames: Record<LintCategory, string> = {
      layout: '布局（Auto Layout）',
      naming: '命名',
      spacing: '间距/尺寸/圆角',
      component: '组件',
      accessibility: '无障碍',
      structure: '结构',
    };

    lines.push(`| 分类 | 问题数 | 对代码还原的影响 |`);
    lines.push(`|------|--------|------------------|`);
    for (const [category, count] of Object.entries(result.categoryBreakdown)) {
      if (count > 0) {
        let impact = '';
        switch (category as LintCategory) {
          case 'layout':
            impact = '无法生成 Flex 布局，响应式困难';
            break;
          case 'naming':
            impact = '代码语义化差，变量名无意义';
            break;
          case 'spacing':
            impact = '无法匹配 Tailwind 类名，产生自定义值';
            break;
          case 'component':
            impact = '代码复用性差，冗余代码多';
            break;
          case 'accessibility':
            impact = '可访问性差，点击区域过小';
            break;
          case 'structure':
            impact = 'div 嵌套过深，代码难维护';
            break;
          default:
            impact = '影响代码质量';
        }
        lines.push(`| ${categoryNames[category as LintCategory] || category} | ${count} | ${impact} |`);
      }
    }
    lines.push('');

    const issuesBySeverity = {
      error: result.issues.filter((i) => i.severity === 'error'),
      warning: result.issues.filter((i) => i.severity === 'warning'),
      info: result.issues.filter((i) => i.severity === 'info'),
    };

    if (issuesBySeverity.error.length > 0) {
      lines.push(`## ❌ 严重问题 (${issuesBySeverity.error.length})`);
      lines.push('');
      lines.push(`这些问题会严重影响代码还原质量，必须修复：`);
      lines.push('');
      for (const issue of issuesBySeverity.error) {
        lines.push(`### ${issue.nodeName || '未知节点'}`);
        lines.push('');
        lines.push(`- **问题**: ${issue.message}`);
        if (issue.impact) {
          lines.push(`- **对代码生成的影响**: ${issue.impact}`);
        }
        if (issue.suggestion) {
          lines.push(`- **建议**: ${issue.suggestion}`);
        }
        if (issue.fixSteps && issue.fixSteps.length > 0) {
          lines.push(`- **修复步骤**:`);
          for (const step of issue.fixSteps) {
            lines.push(`  ${step}`);
          }
        }
        lines.push('');
      }
    }

    if (issuesBySeverity.warning.length > 0) {
      lines.push(`## ⚠️ 警告 (${issuesBySeverity.warning.length})`);
      lines.push('');
      lines.push(`这些问题会影响代码质量，建议修复：`);
      lines.push('');
      for (const issue of issuesBySeverity.warning) {
        lines.push(`### ${issue.nodeName || '未知节点'}`);
        lines.push('');
        lines.push(`- **问题**: ${issue.message}`);
        if (issue.impact) {
          lines.push(`- **对代码生成的影响**: ${issue.impact}`);
        }
        if (issue.suggestion) {
          lines.push(`- **建议**: ${issue.suggestion}`);
        }
        if (issue.fixSteps && issue.fixSteps.length > 0) {
          lines.push(`- **修复步骤**:`);
          for (const step of issue.fixSteps) {
            lines.push(`  ${step}`);
          }
        }
        lines.push('');
      }
    }

    if (issuesBySeverity.info.length > 0) {
      lines.push(`## ℹ️ 优化建议 (${issuesBySeverity.info.length})`);
      lines.push('');
      lines.push(`这些优化项可以让生成的代码更加规范：`);
      lines.push('');
      for (const issue of issuesBySeverity.info) {
        lines.push(`- **${issue.nodeName || '未知节点'}**: ${issue.message}`);
        if (issue.impact) {
          lines.push(`  - 影响: ${issue.impact}`);
        }
        if (issue.fixSteps && issue.fixSteps.length > 0) {
          lines.push(`  - 快速修复: ${issue.fixSteps[issue.fixSteps.length - 1]}`);
        }
        lines.push('');
      }
    }

    lines.push(`## 🎯 修复优先级建议`);
    lines.push('');
    lines.push(`1. **优先修复布局问题**：Auto Layout 是生成 Flex 代码的基础，对还原质量影响最大`);
    lines.push(`2. **其次处理命名和组件复用**：影响代码语义化和可维护性`);
    lines.push(`3. **然后调整间距尺寸**：确保能匹配 Tailwind 默认类名`);
    lines.push(`4. **最后优化无障碍和结构**：提升用户体验和代码质量`);
    lines.push('');

    lines.push(`## 📚 参考规范`);
    lines.push('');
    lines.push(`详细的设计规范请参考: **FIGMA-DESIGN-GUIDELINES.md**`);
    lines.push('');
    lines.push(`核心规范要点：`);
    lines.push(`- 所有布局优先使用 Auto Layout（Flex 思路）`);
    lines.push(`- 间距、尺寸使用 4px 网格：4/8/12/16/20/24/32px 等`);
    lines.push(`- 圆角使用标准值：2/4/6/8/12/16px 或全圆角`);
    lines.push(`- 图层使用语义化命名，避免默认名称`);
    lines.push(`- 重复元素创建为 Component`);
    lines.push(`- 保持图标尺寸统一（16/20/24/32px）`);
    lines.push(`- 控制嵌套层级不超过 ${MAX_NESTING_DEPTH} 层`);
    lines.push(`- 可交互元素最小尺寸 ${MIN_INTERACTIVE_SIZE}×${MIN_INTERACTIVE_SIZE}px`);
    lines.push('');

    return lines.join('\n');
  }

  private buildResult(): LintResult {
    const score = this.calculateScore();
    const errorCount = this.ctx.issues.filter((i) => i.severity === 'error').length;
    const warningCount = this.ctx.issues.filter((i) => i.severity === 'warning').length;
    const infoCount = this.ctx.issues.filter((i) => i.severity === 'info').length;
    const categoryBreakdown = this.getCategoryBreakdown();

    const rating = this.getScoreRating(score);
    let summary = `代码还原质量预检完成：评分 ${score}/100 (${rating})，`;
    summary += `共检查 ${this.ctx.totalNodes} 个节点，发现 ${this.ctx.issues.length} 个问题（${errorCount} 个严重问题，${warningCount} 个警告，${infoCount} 个优化建议）`;
    if (score < 80) {
      summary += '。建议先修复问题再生成代码，以获得最佳还原效果。';
    }

    const resultWithoutReport: Omit<LintResult, 'markdownReport'> = {
      score,
      totalNodes: this.ctx.totalNodes,
      issues: this.ctx.issues,
      errorCount,
      warningCount,
      infoCount,
      categoryBreakdown,
      summary,
    };

    const markdownReport = this.generateMarkdownReport(resultWithoutReport);

    return {
      ...resultWithoutReport,
      markdownReport,
    };
  }
}

export function createDesignLinter(): DesignLinter {
  return new DesignLinter();
}
