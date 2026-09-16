/**
 * React/Vue 框架导入自动整理测试（v1.4.18，T5）
 *
 * 契约：
 * - React：按最终产物实际使用情况增删 'react' named hooks（白名单可扩展），
 *   保留 default/namespace 与非白名单 named，字母序去重，多写合并。
 * - Vue：仅扫描 <script> 区段（template 的 ref="..." 属性不得误判），
 *   编译器宏（defineProps 等）永不加入 import。
 * - 二次整理结果必须与首次逐字节一致（幂等）。
 */
import { describe, expect, it } from 'vitest';

import {
  organizeFrameworkImports,
  REACT_HOOK_WHITELIST,
  VUE_API_WHITELIST,
} from '../../src/services/import-organizer.js';

/**
 * 幂等断言助手：连续整理两次结果必须相同
 *
 * @param code - 输入代码
 * @param framework - react | vue
 * @returns 首次整理结果（供后续断言）
 */
function expectIdempotent(code: string, framework: 'react' | 'vue'): string {
  const first = organizeFrameworkImports(code, { framework });
  const second = organizeFrameworkImports(first, { framework });
  expect(second).toBe(first);
  return first;
}

describe('T5 React hooks 导入整理', () => {
  it('白名单覆盖常用 hooks 且可扩展（数组只读导出）', () => {
    expect(REACT_HOOK_WHITELIST).toContain('useState');
    expect(REACT_HOOK_WHITELIST).toContain('useEffect');
    expect(REACT_HOOK_WHITELIST.length).toBeGreaterThanOrEqual(10);
    expect(Object.isFrozen(REACT_HOOK_WHITELIST)).toBe(true);
  });

  it('缺失补齐：无 react import 但使用了 hooks → 插入字母序 named import', () => {
    const code = `const x = useState(0);
const y = useEffect(() => {});
`;
    const out = expectIdempotent(code, 'react');
    expect(out).toContain("import { useEffect, useState } from 'react';");
    // 插入在文件首部
    expect(out.indexOf('import')).toBe(0);
  });

  it('缺失补齐：存在其他 import 时插到首个 import 之前', () => {
    const code = `import { foo } from './foo';

const x = useRef(null);
`;
    const out = organizeFrameworkImports(code, { framework: 'react' });
    const lines = out.split('\n');
    expect(lines[0]).toBe("import { useRef } from 'react';");
    expect(lines[1]).toBe("import { foo } from './foo';");
  });

  it('多余移除：导入未使用的 hooks → 从 named 中剔除，保留 default React', () => {
    const code = `import React, { useState, useEffect } from 'react';

export const C: React.FC = () => <div />;
`;
    const out = expectIdempotent(code, 'react');
    expect(out).toContain("import React from 'react';");
    expect(out).not.toContain('useState');
    expect(out).not.toContain('useEffect');
  });

  it('全部 named 均未使用且无 default 价值时删除整行（无 default 形态）', () => {
    const code = `import { useState } from 'react';

export const x = 1;
`;
    const out = expectIdempotent(code, 'react');
    expect(out).not.toMatch(/from ['"]react['"]/);
    expect(out.trim().startsWith('export')).toBe(true);
  });

  it('已正确：default + 排序 named 保持不变（幂等快照）', () => {
    const code = `import React, { useEffect, useState } from 'react';

export const C: React.FC = () => {
  useEffect(() => {}, []);
  return useState(0)[0];
};
`;
    const out = expectIdempotent(code, 'react');
    expect(out.split('\n')[0]).toBe("import React, { useEffect, useState } from 'react';");
  });

  it('多个 react import 合并、去重并按字母序排列', () => {
    const code = `import React from 'react';
import { useState } from 'react';
import { useEffect, useState } from 'react';

const a = useState(0);
const b = useEffect(() => {});
`;
    const out = expectIdempotent(code, 'react');
    const reactLines = out.split('\n').filter((l) => /from ['"]react['"]/.test(l));
    expect(reactLines).toHaveLength(1);
    expect(reactLines[0]).toBe("import React, { useEffect, useState } from 'react';");
  });

  it('支持多行花括号 import 解析', () => {
    const code = `import React, {
  useState,
  useEffect,
} from 'react';

const a = useState(0);
`;
    const out = expectIdempotent(code, 'react');
    expect(out).toContain("import React, { useState } from 'react';");
    expect(out).not.toContain('useEffect');
  });

  it('字符串与注释中出现的 hooks 名称不视为使用', () => {
    const code = `// 这里提到 useState 但不是调用
const s = 'useEffect 字符串';
const t = \`useMemo 模板串\`;
/* useRef 块注释 */
`;
    const out = organizeFrameworkImports(code, { framework: 'react' });
    expect(out).not.toMatch(/from ['"]react['"]/);
  });

  it('React.useState 成员访问不产生 named 导入', () => {
    const code = `const a = React.useState(0);
`;
    const out = organizeFrameworkImports(code, { framework: 'react' });
    expect(out).toContain("import React from 'react';");
    expect(out).not.toContain('{ useState }');
  });

  it('无 default 但代码体使用 React 标识符 → 补 default import', () => {
    const code = `const x: React.ReactNode = null;
`;
    const out = expectIdempotent(code, 'react');
    expect(out.split('\n')[0]).toBe("import React from 'react';");
  });

  it('namespace import 保留，所需 hooks 另起 named 行', () => {
    const code = `import * as React from 'react';

const a = React.useState(0);
const b = useEffect(() => {});
`;
    const out = expectIdempotent(code, 'react');
    expect(out).toContain("import * as React from 'react';");
    expect(out).toContain("import { useEffect } from 'react';");
  });

  it('非白名单 named（含 type 成员）原样保留，与白名单合并后字母序', () => {
    const code = `import { type FC, useState } from 'react';

const C: FC = () => useState(0)[0];
`;
    const out = expectIdempotent(code, 'react');
    // type FC 非白名单但被保留；useState 被实际使用
    expect(out).toMatch(/import \{ type FC, useState \} from 'react';|import \{ useState, type FC \} from 'react';/);
  });
});

describe('T5 Vue API 导入整理（仅 <script> 区段）', () => {
  it('Vue 白名单为只读数组且不含编译器宏', () => {
    expect(VUE_API_WHITELIST).toContain('ref');
    expect(VUE_API_WHITELIST).toContain('computed');
    expect(Object.isFrozen(VUE_API_WHITELIST)).toBe(true);
    for (const macro of ['defineProps', 'defineEmits', 'withDefaults', 'defineExpose']) {
      expect(VUE_API_WHITELIST).not.toContain(macro);
    }
  });

  it('缺失补齐：script 使用 ref/computed → 插入字母序 import', () => {
    const code = `<template><div>{{ b }}</div></template>

<script setup lang="ts">
const a = ref(1);
const b = computed(() => a.value + 1);
</script>`;
    const out = expectIdempotent(code, 'vue');
    expect(out).toContain("import { computed, ref } from 'vue';");
    // import 位于 script 开标签之后
    expect(out.indexOf("from 'vue'")).toBeGreaterThan(out.indexOf('<script'));
  });

  it('template 中的 ref="..." 属性不得被计为使用（多余移除）', () => {
    const code = `<template><input ref="email" /></template>

<script setup lang="ts">
import { ref } from 'vue';
</script>`;
    const out = expectIdempotent(code, 'vue');
    expect(out).not.toMatch(/from ['"]vue['"]/);
    // template 原样保留
    expect(out).toContain('ref="email"');
  });

  it('已正确：排序 import 保持不变（幂等）', () => {
    const code = `<script setup lang="ts">
import { computed, ref } from 'vue';

const a = ref(1);
const b = computed(() => a.value);
</script>`;
    expect(expectIdempotent(code, 'vue')).toBe(code);
  });

  it('编译器宏 defineProps/withDefaults 使用时不产生 vue import', () => {
    const code = `<script setup lang="ts">
const props = defineProps<{ title: string }>();
const d = withDefaults(defineProps<{ x?: number }>(), { x: 0 });
void props; void d;
</script>`;
    const out = organizeFrameworkImports(code, { framework: 'vue' });
    expect(out).not.toMatch(/from ['"]vue['"]/);
  });

  it('语句级 import type { Component } 保持类型导入语义，type 不被误判为 default（T10 回归）', () => {
    const code = `<script setup lang="ts">
import type { Component } from 'vue';

const icon: Component | null = null;
void icon;
</script>`;
    const out = organizeFrameworkImports(code, { framework: 'vue' });
    // 历史缺陷：曾被重建为非法的 `import type, { Component } from 'vue';`
    expect(out).not.toContain('import type,');
    expect(out).toMatch(/import \{ type Component \} from 'vue';/);
    // 二次整理必须幂等
    expect(organizeFrameworkImports(out, { framework: 'vue' })).toBe(out);
  });

  it('无 script 块时原样返回（template-only SFC）', () => {
    const code = `<template><div>hello</div></template>`;
    expect(organizeFrameworkImports(code, { framework: 'vue' })).toBe(code);
  });

  it('script 内注释与字符串中的 API 名不视为使用', () => {
    const code = `<script setup lang="ts">
// ref 注释
const s = 'computed 字符串';
</script>`;
    expect(organizeFrameworkImports(code, { framework: 'vue' })).not.toMatch(/from ['"]vue['"]/);
  });

  it('多个 vue import 合并去重排序，插入位置保持在原首个 import 处', () => {
    const code = `<script setup lang="ts">
// 组件说明
import { ref } from 'vue';
import { computed, ref } from 'vue';

const a = ref(1);
const b = computed(() => a.value);
</script>`;
    const out = expectIdempotent(code, 'vue');
    const vueLines = out.split('\n').filter((l) => /from ['"]vue['"]/.test(l));
    expect(vueLines).toHaveLength(1);
    expect(vueLines[0]).toBe("import { computed, ref } from 'vue';");
    // 组件说明注释仍在 import 之前
    expect(out.indexOf('// 组件说明')).toBeLessThan(out.indexOf("from 'vue'"));
  });
});
