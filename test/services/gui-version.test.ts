import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { GUI_VERSION_TOKEN, injectGuiVersion, readGuiVersion } from '../../src/services/gui-server.js';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..');

describe('GUI 版本号单一来源', () => {
  it('readGuiVersion 与 package.json 一致', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8')) as { version?: unknown };
    expect(readGuiVersion()).toBe(pkg.version);
  });

  it('index.html 使用版本占位符且不再硬编码 v1.4.x', () => {
    const html = readFileSync(resolve(ROOT, 'gui/index.html'), 'utf-8');
    expect(html).toContain(`data-version="${GUI_VERSION_TOKEN}"`);
    expect(html).toContain(`配置向导 v${GUI_VERSION_TOKEN}`);
    expect(html).not.toMatch(/v1\.4\.\d+/);
  });

  it('app.js 从 data-version 和 /api/status 获取版本并支持中英模板', () => {
    const app = readFileSync(resolve(ROOT, 'gui/app.js'), 'utf-8');
    expect(app).toContain('this.version = document.documentElement.dataset.version');
    expect(app).toContain('this.version = data.version || this.version');
    expect(app).toContain("subtitle: '配置向导 v{version}'");
    expect(app).toContain("subtitle: 'Setup Wizard v{version}'");
    expect(app).not.toMatch(/v1\.4\.\d+/);
  });

  it('HTML 注入后版本号来自 package.json', () => {
    const html = readFileSync(resolve(ROOT, 'gui/index.html'), 'utf-8');
    const rendered = injectGuiVersion(html, readGuiVersion());
    expect(rendered).toContain(`data-version="${readGuiVersion()}"`);
    expect(rendered).not.toContain(GUI_VERSION_TOKEN);
  });
});

describe('P3-32 GUI 组件库选择器接线', () => {
  const appJs = readFileSync(resolve(ROOT, 'gui/app.js'), 'utf-8');
  const css = readFileSync(resolve(ROOT, 'gui/styles.css'), 'utf-8');

  it('中英文 I18N 表均提供 framework.lib.* 文案（缺失会渲染裸 key）', () => {
    // 两份语言表各出现一次 lib 块，且 7 个引用键各有落点
    expect(appJs.match(/lib: \{/g)).toHaveLength(2);
    expect(appJs).toContain("title: '组件库偏好（可选）'");
    expect(appJs).toContain("title: 'Component library (optional)'");
    for (const key of ['auto', 'none', 'shadcn', 'antd', 'element', 'antdv']) {
      expect(appJs).toContain(`framework.lib.${key}`);
    }
  });

  it('chip 选择器渲染、点击绑定、框架切换重绘联动均存在', () => {
    expect(appJs).toContain('renderComponentLibraryPicker()');
    expect(appJs).toContain("document.querySelectorAll('#component-library-picker .lib-chip')");
    expect(appJs).toContain('this.state.componentLibrary = value');
    // 切换框架后跨框架组件库值必须回退 auto
    expect(appJs).toContain("this.state.componentLibrary = 'auto'");
  });

  it('styles.css 提供 .lib-chip 默认/悬停/选中三态', () => {
    expect(css).toMatch(/\.lib-chip\s*\{/);
    expect(css).toMatch(/\.lib-chip:hover\s*\{/);
    expect(css).toMatch(/\.lib-chip\.selected\s*\{/);
  });
});
