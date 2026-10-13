#!/usr/bin/env node
/**
 * P3-11 性能基准入口（ROADMAP WBS-P3-11 冻结口径）：
 *
 *   node --expose-gc test/perf/run-bench.mjs --label baseline
 *   node --expose-gc test/perf/run-bench.mjs --label optimized --compare test/perf/results/baseline.json
 *
 * - 同一棵确定性 ~1000 节点合成页面（test/perf/lib/fixture-tree.mjs）；
 * - React（1x 基准）与微信小程序（≤1.5x 目标）同机、同夹具、同预热次数；
 * - 预热 1 次 + 正式 5 次，耗时取中位数；内存取 GC 后堆增量中位数与 RSS；
 * - 结果写 test/perf/results/<label>.json（基准数据入库，供优化前后同机对比）。
 *
 * 基准只测「精简 DesignContext → 代码产物」的本地生成阶段，
 * 不含 Figma 网络/精简节点（那部分受网络与文件 API 抖动支配，不可重复）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as path from 'node:path';
import * as os from 'node:os';

import { buildPerfFixture } from './lib/fixture-tree.mjs';
import { formatRow, measure } from './lib/measure.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

function parseArgs(argv) {
  const args = { label: 'run', nodes: 1000, runs: 5, warmup: 1 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = ['nodes', 'runs', 'warmup'].includes(key) ? Number(next) : next;
        i++;
      }
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

const distReact = path.join(ROOT, 'dist/services/code-generator.js');
const distWeapp = path.join(ROOT, 'dist/services/weapp-generator.js');
if (!existsSync(distReact) || !existsSync(distWeapp)) {
  console.error('[perf] 未找到 dist 产物，请先执行 npm run build');
  process.exit(1);
}

const { createCodeGenerator } = await import(pathToFileURL(distReact).href);
const { createWeappGenerator } = await import(pathToFileURL(distWeapp).href);

const NULL_CLIENT = null;

console.log(`[perf] 构造 ${args.nodes} 节点确定性夹具...`);
const fixture = buildPerfFixture({ targetNodes: args.nodes });
console.log(`[perf] 实际节点数: ${fixture.count}`);

// 每次迭代新建生成器，模拟 CLI 一次性进程语义；模块级单例（TokenMatcher/Prettier）缓存保留
const runReact = () =>
  createCodeGenerator(NULL_CLIENT).generateJsxFromContext(fixture.context, {
    componentName: 'PerfPage',
    skipEnhancements: false,
  });
const runWeapp = () =>
  createWeappGenerator(NULL_CLIENT).generateFromContext(fixture.context, {
    componentName: 'PerfPage',
    isPage: true,
  });

console.log(`[perf] React 生成（预热 ${args.warmup} + 正式 ${args.runs}）...`);
const react = await measure(runReact, { warmup: args.warmup, runs: args.runs });
console.log(formatRow('react', react));

console.log(`[perf] 微信小程序生成（预热 ${args.warmup} + 正式 ${args.runs}）...`);
const weapp = await measure(runWeapp, { warmup: args.warmup, runs: args.runs });
console.log(formatRow('weapp', weapp));

const ratio = weapp.durationMs.median / react.durationMs.median;
console.log(`[perf] weapp/react 耗时比: ${ratio.toFixed(3)}x（目标 ≤1.5x）`);

const result = {
  label: args.label,
  recordedAt: new Date().toISOString(),
  env: {
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    os: `${os.type()} ${os.release()}`,
    cpu: os.cpus()[0]?.model ?? 'unknown',
    cores: os.cpus().length,
    memTotalGB: Math.round((os.totalmem() / 1024 / 1024 / 1024) * 10) / 10,
  },
  fixture: { targetNodes: args.nodes, actualNodes: fixture.count, seed: 20261012 },
  config: { warmup: args.warmup, runs: args.runs, gcAvailable: react.gcAvailable },
  react,
  weapp,
  weappReactRatio: Math.round(ratio * 1000) / 1000,
};

const resultsDir = path.join(HERE, 'results');
mkdirSync(resultsDir, { recursive: true });
const outPath = args.out
  ? path.resolve(args.out)
  : path.join(resultsDir, `${args.label}.json`);
writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n', 'utf-8');
console.log(`[perf] 结果已写入 ${path.relative(ROOT, outPath)}`);

// ============ 可选：与基线对比（P3-12 优化前后同机对照） ============
if (args.compare) {
  const baselinePath = path.resolve(args.compare);
  if (!existsSync(baselinePath)) {
    console.error(`[perf] 对比基线不存在: ${baselinePath}`);
    process.exit(1);
  }
  const base = JSON.parse(readFileSync(baselinePath, 'utf-8'));
  const pct = (now, old) => Math.round(((now - old) / old) * 1000) / 10;
  const rows = [
    ['react median', react.durationMs.median, base.react.durationMs.median],
    ['weapp median', weapp.durationMs.median, base.weapp.durationMs.median],
  ];
  console.log('\n[perf] 对比基线（负数=提速）:');
  for (const [name, now, old] of rows) {
    const d = pct(now, old);
    console.log(`  ${name.padEnd(14)} ${old}ms → ${now}ms  (${d >= 0 ? '+' : ''}${d}%)`);
  }
  if (base.env.node !== result.env.node || base.env.cpu !== result.env.cpu) {
    console.warn('  ⚠️ 基线与本次机器/Node 版本不同，跨机对比仅供参考');
  }
}
