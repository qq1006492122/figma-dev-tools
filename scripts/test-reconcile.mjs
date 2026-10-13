#!/usr/bin/env node
/**
 * WBS-P3-21 静态新增 vs 实跑增量对账：
 *
 * 1. 静态扫描 test 目录下全部 .test.ts 中声明的 it/test 用例（含 .each 链头 1 个）；
 *    参数化（.each([...])）与 for 循环生成的用例在运行时会展开为多个，
 *    故「实跑 ≥ 静态」是允许且预期的方向；反向（实跑 < 静态）才算异常。
 * 2. 与 vitest JSON reporter 结果（需先 vitest --reporter=json --outputFile=...
 *    或本脚本自动调用）对账：文件数、用例数、失败数、TODO 数。
 * 3. 按领域分组汇总（weapp/watch/compare/component-library 等）。
 *
 * 用法：node scripts/test-reconcile.mjs [vitest-json 路径]
 *      不传 JSON 路径时自动执行一次完整 vitest --reporter=json。
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_DIR = path.join(ROOT, 'test');

/** 递归收集 .test.ts（statSync 判类型，兼容旧版 Node） */
function walkTestFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walkTestFiles(p));
    else if (st.isFile() && name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

/** 静态声明计数（保守：只数 it(/test( 直接调用与 .each 链头；跳过注释行） */
function countStaticCases(file) {
  const lines = readFileSync(file, 'utf-8').split(/\r?\n/);
  let cases = 0;
  let inBlockComment = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('/*')) inBlockComment = true;
    if (inBlockComment) {
      if (line.includes('*/')) inBlockComment = false;
      continue;
    }
    if (line.startsWith('//')) continue;
    // 直接用例 + 参数化链头（行首允许空白/await 等前缀；覆盖本仓库全部声明形态）
    if (/^\s*(?:await\s+)?(?:it|test)(?:\.each\s*\([^)]*\))?\s*\(/.test(line)) cases++;
  }
  return cases;
}

/** 领域归类（按路径关键词；未命中归入 misc） */
function domainOf(rel) {
  const rules = [
    ['weapp', /weapp/],
    ['watch', /watch/],
    ['compare', /compare/],
    ['component-library', /component-library/],
    ['svelte', /svelte/],
    ['style-renderers', /(style-renderer|css-|unocss|tailwind|new-style|new-pipeline|css-modules)/],
    ['responsive', /responsive/],
    ['asset', /asset|downloader|ca-aware/],
    ['smoke', /[\\/]smoke[\\/]/],
    ['inference', /(interaction|smart|semantic|props-type)/],
  ];
  for (const [name, re] of rules) if (re.test(rel.replace(/\\/g, '/'))) return name;
  return 'misc';
}

// 1) 静态扫描
const files = walkTestFiles(TEST_DIR);
const staticByFile = files.map((f) => ({
  file: path.relative(ROOT, f).replace(/\\/g, '/'),
  staticCases: countStaticCases(f),
}));
const staticTotal = staticByFile.reduce((s, x) => s + x.staticCases, 0);

// 2) 实跑结果（vitest JSON 的 name 为绝对路径，统一归一化为仓库内相对正斜杠路径）
const norm = (p) => p.replace(/\\/g, '/').replace(/.*\/figma-dev-tools\//, '');
let jsonPath = process.argv[2];
if (!jsonPath) {
  jsonPath = path.join(ROOT, 'test/perf/results/vitest-latest.json');
  mkdirSync(path.dirname(jsonPath), { recursive: true });
  console.log('[reconcile] 未提供 JSON，自动执行 vitest（全量，约 3-4 分钟）...');
  // 直接以当前 node 执行仓库内 vitest 入口：跨平台且规避 Windows 上
  // spawnSync('npx.cmd') 无 shell 时 EINVAL 的问题，也不引入 shell 注入面
  const vitestEntry = path.join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');
  execFileSync(
    process.execPath,
    [vitestEntry, 'run', '--reporter=json', `--outputFile=${jsonPath}`],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'], env: process.env },
  );
}
const report = JSON.parse(readFileSync(path.resolve(jsonPath), 'utf-8'));
const actualTotal = report.numTotalTests;
const actualByFile = new Map();
for (const tr of report.testResults) {
  actualByFile.set(norm(tr.name), tr.assertionResults?.length ?? 0);
}

// 3) 对账：逐文件实跑 vs 静态
const perFile = staticByFile.map((s) => {
  const actual = actualByFile.get(s.file) ?? 0;
  return { ...s, actualCases: actual, delta: actual - s.staticCases, anomaly: actual < s.staticCases };
});
const anomalies = perFile.filter((x) => x.anomaly);

// 4) 领域汇总（用实际执行数）
const domain = {};
for (const tr of report.testResults) {
  const d = domainOf(norm(tr.name));
  domain[d] ??= { files: 0, tests: 0 };
  domain[d].files++;
  domain[d].tests += tr.assertionResults?.length ?? 0;
}

const result = {
  recordedAt: new Date().toISOString(),
  staticDeclaredCases: staticTotal,
  actualExecutedTests: actualTotal,
  fileCount: report.testResults.length,
  passed: report.numPassedTests,
  failed: report.numFailedTests,
  todo: report.numTodoTests ?? 0,
  parameterizedExpansion: actualTotal - staticTotal,
  anomalies,
  domain: Object.fromEntries(Object.entries(domain).sort(([a], [b]) => a.localeCompare(b))),
};

console.log(`静态声明用例: ${staticTotal}  实跑用例: ${actualTotal}（参数化/循环展开 +${actualTotal - staticTotal}）`);
console.log(`文件: ${result.fileCount}  通过: ${result.passed}  失败: ${result.failed}  TODO: ${result.todo}`);
console.log('领域分布:');
for (const [d, v] of Object.entries(result.domain)) console.log(`  ${d.padEnd(20)} ${String(v.files).padStart(3)} 文件  ${String(v.tests).padStart(4)} 用例`);
if (anomalies.length) {
  console.warn(`\n⚠️ ${anomalies.length} 个文件实跑用例少于静态声明（可能有用例被跳过/条件跳过）:`);
  for (const a of anomalies) console.warn(`  ${a.file}: static ${a.staticCases} > actual ${a.actualCases}`);
  process.exitCode = 1;
} else {
  console.log('\n✅ 对账通过：无实跑少于静态的异常文件（参数化展开为预期增量）');
}

const outDir = path.join(ROOT, 'test/perf/results');
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'test-reconciliation.json'), JSON.stringify(result, null, 2) + '\n');
console.log('[reconcile] 明细已写入 test/perf/results/test-reconciliation.json');
