#!/usr/bin/env node
/**
 * check-release-consistency.mjs — 发布一致性闸门（ROADMAP v1.4.20-v2 · WBS-G1）
 *
 * 扫描范围（与 ROADMAP 第六章发布检查清单对应）：
 *   1. 版本号：package.json / package-lock.json（根包 + packages[""]）/ package.json description / 全部文档标题
 *   2. 工具表：src/index.ts 注册数、smoke 枚举（BASELINE_TOOL_NAMES）、中文 README 工具表三者一致
 *   3. CLI：.command() 声明数
 *   4. 禁用口径：假工具名（figma_generate_animation / figma_extract_interaction）、
 *      不存在的 `init` 命令、编辑器 8+/10+、CLI 20+、MCP 工具 22 等历史漂移写法
 *   5. 样式描述符数量（9 available 新管线 + inline-styles + css-variables planned = 11）
 *
 * 用法：node scripts/check-release-consistency.mjs（或 npm run check:consistency）
 * 验收：人为制造一处漂移时本脚本必须以非 0 退出。
 * 版本推进时：只改下方 EXPECTED，不改检查逻辑。
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** ── 单一事实来源：每次发版前更新这里 ── */
const EXPECTED = {
  version: '1.4.20',
  toolCount: 28, // server.registerTool 实际注册数（WBS-P1-2 watch×3 + P1-3 compare + P1-1 svelte）
  cliDeclarations: 33, // src/cli/index.ts 中 .command( 声明总数（WBS-P1-1 +svelte；watch/compare 仅 MCP）
  styleDescriptors: 11, // registry.ts 中 status: 'available'|'planned' 描述符数
};

const DOCS = ['README.md', 'README.en-US.md', 'SKILL.md', 'QUICKSTART.md', 'QUICKSTART.en-US.md'];

const FAKE_TOOL_NAMES = ['figma_generate_animation', 'figma_extract_interaction'];

/** 文档中一旦出现即视为漂移的写法（历史事故清单，见 ROADMAP 1.2 口径表） */
const BANNED_DOC_PATTERNS = [
  { re: /figma_generate_animation|figma_extract_interaction/, why: '未注册的假工具名（动画/交互检测是管线内增强，非独立工具）' },
  { re: /figma-dev\s+init|`init`/, why: '不存在的 CLI init 命令（该功能由 wizard 承担）' },
  { re: /(8\+|10\+)\s*(个\s*)?(编辑器|editors)/i, why: '编辑器数量口径应为 8 个（editor-detector 实际 8 个）' },
  { re: /Roo Code[^\n]*\b(8\+|10\+)\b/, why: '编辑器列表不得使用 8+/10+ 口径，应为 8 个' },
  { re: /20\+\s*个?\s*(CLI\s*)?(顶层\s*)?命令|20\+\s*commands/i, why: 'CLI 口径应为 22 个顶层命令（32 条声明）' },
  { re: /22\s*个\s*MCP\s*工具|22\s+(MCP\s+)?tools\b/i, why: 'MCP 工具数口径应为 23；历史版本对比必须写明 “npm latest v1.4.19 为 22 个”' },
];

const results = [];
function record(name, failures) {
  results.push({ name, failures });
}
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const countMatches = (text, re) => (text.match(re) || []).length;

/** ── 1. 版本号 ── */
{
  const pkg = JSON.parse(read('package.json'));
  record('package.json version', pkg.version === EXPECTED.version ? [] : [`实际 ${pkg.version}，期望 ${EXPECTED.version}`]);

  const lock = JSON.parse(read('package-lock.json'));
  const lockFails = [];
  if (lock.version !== EXPECTED.version) lockFails.push(`lock 根包 version=${lock.version}`);
  const inner = lock.packages && lock.packages[''];
  if (!inner || inner.version !== EXPECTED.version) lockFails.push(`lock packages[""].version=${inner && inner.version}`);
  record('package-lock.json 两处 version', lockFails);

  const desc = String(pkg.description || '');
  const descVers = [...new Set([...desc.matchAll(/v?1\.4\.\d+/g)].map((m) => m[0].replace(/^v/, '')))];
  const descFails = [];
  if (!descVers.includes(EXPECTED.version)) descFails.push(`description 未包含 ${EXPECTED.version}`);
  const stale = descVers.filter((v) => v !== EXPECTED.version);
  if (stale.length) descFails.push(`description 含旧版本号: ${stale.join(', ')}`);
  record('package.json description 版本口径', descFails);
}

/** ── 2. MCP 工具一致性 ── */
{
  const indexTs = read('src/index.ts');
  const regCount = countMatches(indexTs, /server\.registerTool\(/g);
  record('src/index.ts registerTool 数', regCount === EXPECTED.toolCount ? [] : [`实际 ${regCount}，期望 ${EXPECTED.toolCount}`]);

  const smokeSrc = read(path.join('test', 'smoke', 'mcp-tools.smoke.test.ts'));
  const m = smokeSrc.match(/BASELINE_TOOL_NAMES\s*=\s*\[([\s\S]*?)\]\s*as const/);
  const smokeFails = [];
  let smokeNames = [];
  if (!m) {
    smokeFails.push('未找到 BASELINE_TOOL_NAMES 枚举数组');
  } else {
    smokeNames = [...m[1].matchAll(/'(figma_[a-z_]+)'/g)].map((x) => x[1]);
    if (smokeNames.length !== EXPECTED.toolCount) smokeFails.push(`枚举 ${smokeNames.length} 个，期望 ${EXPECTED.toolCount}`);
    if (new Set(smokeNames).size !== smokeNames.length) smokeFails.push('枚举中存在重复工具名');
    const fakes = smokeNames.filter((n) => FAKE_TOOL_NAMES.includes(n));
    if (fakes.length) smokeFails.push(`枚举包含未注册的假工具名: ${fakes.join(', ')}`);
  }
  record('smoke 枚举（发布闸门）', smokeFails);

  const readme = read('README.md');
  const readmeNames = new Set([...readme.matchAll(/figma_[a-z_]+/g)].map((x) => x[0]));
  const missing = smokeNames.filter((n) => !readmeNames.has(n));
  record('中文 README 工具表覆盖', missing.length ? [`缺少工具行: ${missing.join(', ')}`] : []);
}

/** ── 3. CLI 声明数 ── */
{
  const cliTs = read(path.join('src', 'cli', 'index.ts'));
  const n = countMatches(cliTs, /\.command\(/g);
  record('src/cli/index.ts .command( 声明数', n === EXPECTED.cliDeclarations ? [] : [`实际 ${n}，期望 ${EXPECTED.cliDeclarations}`]);
}

/** ── 4. 样式描述符 ── */
{
  const registry = read(path.join('src', 'services', 'style-renderers', 'registry.ts'));
  const n = countMatches(registry, /status: '(?:available|planned)'/g);
  record('registry.ts 样式描述符数', n === EXPECTED.styleDescriptors ? [] : [`实际 ${n}，期望 ${EXPECTED.styleDescriptors}`]);
}

/** ── 5. 文档：版本可见性 + 禁用口径 ── */
{
  const versionRe = new RegExp(EXPECTED.version.replaceAll('.', '\\.'));
  for (const doc of DOCS) {
    const abs = path.join(ROOT, doc);
    if (!existsSync(abs)) {
      record(`文档 ${doc}`, ['文件不存在']);
      continue;
    }
    const text = read(doc);
    const fails = [];
    if (!versionRe.test(text)) fails.push('未包含当前版本号 ' + EXPECTED.version);
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const { re, why } of BANNED_DOC_PATTERNS) {
        if (re.test(line)) fails.push(`L${i + 1}: ${why} → ${line.trim().slice(0, 90)}`);
      }
    });
    record(`文档 ${doc}`, fails);
  }
}

/** ── 输出与退出码 ── */
let failed = 0;
for (const { name, failures } of results) {
  if (failures.length === 0) {
    console.log(`[PASS] ${name}`);
  } else {
    failed += failures.length;
    console.log(`[FAIL] ${name}`);
    for (const f of failures) console.log(`       - ${f}`);
  }
}
const total = results.length;
console.log(`\n一致性检查：${total - (failed > 0 ? results.filter((r) => r.failures.length).length : 0)}/${total} 项通过，${failed} 处漂移`);
process.exit(failed > 0 ? 1 : 0);
