/**
 * formatCode × 框架导入整理串联测试（v1.4.18，T5）
 *
 * 验证整理发生在 Prettier 之前：产物经 prettier 规范化后 import 仍正确，
 * 且 organizeImports:false 可关闭该行为。projectRoot 使用隔离临时目录，
 * 避免命中仓库自身的 Prettier 配置。
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { formatCode } from '../../src/services/code-formatter.js';

describe('T5 formatCode 串联框架导入整理', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'figma-format-imports-'));
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('React 产物：缺失 hooks 经整理+Prettier 后输出排序 import', async () => {
    const code = `export const C = () => {
const a = useState(0);
const b = useEffect(() => {}, []);
return <div>{String(a[0])}{String(b)}</div>;
};
`;
    const out = await formatCode(code, { filePath: 'C.tsx', projectRoot });
    expect(out).toContain("import { useEffect, useState } from 'react';");
    // Prettier 已介入（换行/缩进规范化）
    expect(out).toMatch(/\n\s{2}const a = useState\(0\);/);
    // 幂等：再格式化一次保持稳定
    const twice = await formatCode(out, { filePath: 'C.tsx', projectRoot });
    expect(twice).toBe(out);
  });

  it('React 产物：未使用的 hooks 在格式化阶段被移除', async () => {
    const code = `import React, { useState, useEffect } from 'react';

export const C: React.FC = () => <div>hello</div>;
`;
    const out = await formatCode(code, { filePath: 'C.tsx', projectRoot });
    expect(out.split('\n')[0]).toBe("import React from 'react';");
  });

  it('Vue 产物：script 内使用 ref 自动补 import，template 的 ref 属性不干扰', async () => {
    const code = `<template><input ref="email" /><span>{{ n }}</span></template>
<script setup lang="ts">
const n = ref(1);
</script>`;
    const out = await formatCode(code, { filePath: 'C.vue', projectRoot });
    expect(out).toContain("import { ref } from 'vue';");
    expect(out).toContain('ref="email"');
  });

  it('organizeImports:false 时保留未使用 import（显式关闭整理）', async () => {
    const code = `import React, { useState } from 'react';

export const C: React.FC = () => <div>x</div>;
`;
    const out = await formatCode(code, { filePath: 'C.tsx', projectRoot, organizeImports: false });
    expect(out).toContain('useState');
  });
});
