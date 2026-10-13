/**
 * WBS-P2-12/13 项目侧证据发现单测
 * package.json 向上查找/三类依赖解析、shadcn components/ui 目录与 components.json 别名。
 * 通过 seams 注入内存文件系统，零真实磁盘访问。
 */
import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { detectReactLibrary, detectVueLibrary } from '../../src/services/component-library/index.js';
import { loadProjectLibraryHints } from '../../src/services/component-library/project-discovery.js';

/** 内存文件系统：path → 文本内容 */
function memoryFs(files: Record<string, string>) {
  const norm = Object.fromEntries(Object.entries(files).map(([k, v]) => [path.resolve(k), v]));
  return {
    readTextFile: async (p: string): Promise<string | undefined> => norm[path.resolve(p)],
    existsSync: (p: string): boolean => path.resolve(p) in norm,
  };
}

const ROOT = path.resolve('/virtual-proj');
const PKG_PATH = path.join(ROOT, 'package.json');
const SRC_DIR = path.join(ROOT, 'src');

describe('WBS-P2-12/13 loadProjectLibraryHints', () => {
  it('向上查找到最近的 package.json 并保留三类依赖视图', async () => {
    const pkg = JSON.stringify({
      dependencies: { antd: '^5.0.0' },
      devDependencies: { 'ant-design-vue': '^4.0.0' },
      peerDependencies: { 'element-plus': '^2.4.0' },
    });
    const hints = await loadProjectLibraryHints(SRC_DIR, memoryFs({ [PKG_PATH]: pkg }));
    expect(hints.pkg?.dependencies?.antd).toBe('^5.0.0');
    expect(detectReactLibrary(hints.pkg)).toBe('ant-design');
    // element-plus 在 peerDependencies 也算真实证据
    expect(detectVueLibrary(hints.pkg)).toBe('element-plus');
  });

  it('无 package.json 时 pkg=null、ui 谓词恒 false，不抛错', async () => {
    const hints = await loadProjectLibraryHints(SRC_DIR, memoryFs({}));
    expect(hints.pkg).toBeNull();
    expect(hints.uiComponentExists('button')).toBe(false);
  });

  it('损坏的 package.json 静默降级为 pkg=null', async () => {
    const hints = await loadProjectLibraryHints(SRC_DIR, memoryFs({ [PKG_PATH]: '{ not json' }));
    expect(hints.pkg).toBeNull();
  });

  it('默认约定目录：src/components/ui/button.tsx 存在 → shadcn 命中', async () => {
    const hints = await loadProjectLibraryHints(
      SRC_DIR,
      memoryFs({
        [PKG_PATH]: JSON.stringify({ dependencies: {} }),
        [path.join(ROOT, 'src/components/ui/button.tsx')]: 'export const Button = () => null',
      }),
    );
    expect(hints.uiComponentExists('button')).toBe(true);
    expect(hints.uiComponentExists('card')).toBe(false);
    // detect 优先级：shadcn 目录证据优先于 antd
    expect(
      detectReactLibrary({ dependencies: { antd: '^5' } }, { uiComponentExists: hints.uiComponentExists }),
    ).toBe('shadcn-ui');
  });

  it('根目录布局 components/ui/*.jsx 同样命中', async () => {
    const hints = await loadProjectLibraryHints(
      ROOT,
      memoryFs({
        [PKG_PATH]: JSON.stringify({}),
        [path.join(ROOT, 'components/ui/input.jsx')]: '',
      }),
    );
    expect(hints.uiComponentExists('input')).toBe(true);
  });

  it('components.json aliases.ui 自定义路径优先（@/ 映射 src/ 与根双候选）', async () => {
    const hints = await loadProjectLibraryHints(
      ROOT,
      memoryFs({
        [PKG_PATH]: JSON.stringify({}),
        [path.join(ROOT, 'components.json')]: JSON.stringify({
          aliases: { ui: '@/shared/ui', components: '@/components' },
        }),
        [path.join(ROOT, 'src/shared/ui/card.tsx')]: '',
      }),
    );
    expect(hints.uiComponentExists('card')).toBe(true);
    expect(hints.uiComponentExists('button')).toBe(false);
  });

  it('旧版 resolvedPaths.ui 布局兼容', async () => {
    const hints = await loadProjectLibraryHints(
      ROOT,
      memoryFs({
        [PKG_PATH]: JSON.stringify({}),
        [path.join(ROOT, 'components.json')]: JSON.stringify({
          resolvedPaths: { ui: 'app/ui' },
        }),
        [path.join(ROOT, 'app/ui/badge.tsx')]: '',
      }),
    );
    expect(hints.uiComponentExists('badge')).toBe(true);
  });

  it('损坏的 components.json 回退默认约定目录', async () => {
    const hints = await loadProjectLibraryHints(
      ROOT,
      memoryFs({
        [PKG_PATH]: JSON.stringify({}),
        [path.join(ROOT, 'components.json')]: '{ broken',
        [path.join(ROOT, 'src/components/ui/tabs.tsx')]: '',
      }),
    );
    expect(hints.uiComponentExists('tabs')).toBe(true);
  });
});
