import { describe, expect, it } from 'vitest';

import { createHierarchyFixer } from '../../src/services/hierarchy-fixer.js';
import type { FigmaNode } from '../../src/types.js';

describe('HierarchyFixer logic traps', () => {
  it('深层节点树在硬上限处停止，不发生栈溢出', () => {
    const root: any = { id: 'n0', name: 'root', type: 'FRAME', children: [] };
    let cursor = root;
    for (let index = 1; index < 1000; index++) {
      const child = { id: `n${index}`, name: `node-${index}`, type: 'FRAME', children: [] };
      cursor.children.push(child);
      cursor = child;
    }

    const fixer = createHierarchyFixer({ maxDepth: 5 });
    const issues = fixer.detectIssues(root as unknown as FigmaNode);
    expect(issues.some((issue) => issue.type === 'nested_too_deep')).toBe(true);
  });

  it('无 ID 的自环节点不会造成无限递归或无限包裹扫描', () => {
    const root: any = { name: 'root', type: 'FRAME', children: [] };
    root.children.push(root);

    const fixer = createHierarchyFixer({ maxDepth: 3, autoFix: true });
    const result = fixer.fix(root as unknown as FigmaNode);
    expect(result.issues.some((issue) => issue.type === 'nested_too_deep')).toBe(true);
  });
});
