/**
 * 微信小程序基础库版本冻结（WBS-P0-41）
 *
 * 数据取证：官方「基础库 / 版本分布」页（动态表格），2026-10-10 浏览器实抓，
 * 页面标注更新时间 2026-10-09。任何数字不得手改——更新基线必须重新抓取并同步测试。
 *
 * - target（推荐开发版本）：当前主版本 3.17.3（总体占比 80.19%；3.17.4 灰度 0.15%）
 * - minSupported（兼容基线）：首个累计覆盖率 ≥99% 的版本 3.1.5（99.03%）
 *
 * @module
 */

export interface ClientLibShare {
  /** 基础库语义化版本（major.minor.patch） */
  version: string;
  /** 总体用户占比（百分比，0-100） */
  sharePct: number;
}

/** 官方版本分布（总体占比列，按版本降序；占比低于 0.01% 的版本官方已隐藏） */
export const CLIENT_LIB_DISTRIBUTION: readonly ClientLibShare[] = [
  { version: '3.17.4', sharePct: 0.15 },
  { version: '3.17.3', sharePct: 80.19 },
  { version: '3.17.2', sharePct: 7.34 },
  { version: '3.17.1', sharePct: 0.07 },
  { version: '3.17.0', sharePct: 0.05 },
  { version: '3.16.3', sharePct: 2.88 },
  { version: '3.16.2', sharePct: 0.02 },
  { version: '3.16.1', sharePct: 0.01 },
  { version: '3.16.0', sharePct: 0.01 },
  { version: '3.15.3', sharePct: 3.12 },
  { version: '3.15.2', sharePct: 0.03 },
  { version: '3.14.3', sharePct: 0.35 },
  { version: '3.13.2', sharePct: 0.58 },
  { version: '3.12.1', sharePct: 0.43 },
  { version: '3.11.3', sharePct: 0.46 },
  { version: '3.10.3', sharePct: 0.66 },
  { version: '3.9.3', sharePct: 0.35 },
  { version: '3.8.12', sharePct: 1.25 },
  { version: '3.8.10', sharePct: 0.04 },
  { version: '3.7.12', sharePct: 0.26 },
  { version: '3.6.6', sharePct: 0.2 },
  { version: '3.5.8', sharePct: 0.16 },
  { version: '3.4.10', sharePct: 0.1 },
  { version: '3.3.5', sharePct: 0.15 },
  { version: '3.2.5', sharePct: 0.03 },
  { version: '3.1.5', sharePct: 0.14 },
  { version: '3.0.2', sharePct: 0.02 },
  { version: '2.33.0', sharePct: 0.03 },
  { version: '2.32.3', sharePct: 0.02 },
  { version: '2.31.1', sharePct: 0.01 },
  { version: '2.30.4', sharePct: 0.02 },
  { version: '2.29.2', sharePct: 0.02 },
  { version: '2.28.1', sharePct: 0.01 },
  { version: '2.27.3', sharePct: 0.77 },
  { version: '2.26.2', sharePct: 0.01 },
  { version: '2.25.4', sharePct: 0.02 },
  { version: '2.24.7', sharePct: 0.02 },
  { version: '2.24.4', sharePct: 0.01 },
  { version: '2.23.4', sharePct: 0.01 },
  { version: '2.21.4', sharePct: 0.01 },
];

export interface FrozenClientLibBaseline {
  /** 推荐开发（目标）基础库版本 */
  target: string;
  /** 最低兼容基础库版本（累计覆盖率首个 ≥99% 的版本） */
  minSupported: string;
  /** minSupported 处的累计覆盖率（百分比） */
  coverageAtMin: number;
  /** 兼容判定阈值 */
  coverageThresholdPct: number;
  /** 官方分布页 URL */
  sourceUrl: string;
  /** 官方页面标注的更新时间（YYYY-MM-DD） */
  pageUpdatedAt: string;
  /** 本次实抓取证日期（YYYY-MM-DD） */
  capturedAt: string;
}

export const FROZEN_BASELINE: FrozenClientLibBaseline = {
  target: '3.17.3',
  minSupported: '3.1.5',
  coverageAtMin: cumulativeCoverage(CLIENT_LIB_DISTRIBUTION, '3.1.5'),
  coverageThresholdPct: 99,
  sourceUrl: 'https://developers.weixin.qq.com/miniprogram/dev/framework/client-lib/version.html',
  pageUpdatedAt: '2026-10-09',
  capturedAt: '2026-10-10',
};

/** 语义化版本比较：a>b→1，a<b→-1，相等→0（按数值位比较，不按字典序） */
export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((x) => Number.parseInt(x, 10));
  const pb = b.split('.').map((x) => Number.parseInt(x, 10));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da > db ? 1 : -1;
  }
  return 0;
}

/**
 * 累计覆盖率：所有 ≥ minVersion 的版本占比之和（百分比）。
 * 入参可为任意顺序；非法版本号按 0 处理。
 */
export function cumulativeCoverage(
  distribution: readonly ClientLibShare[],
  minVersion: string,
): number {
  let sum = 0;
  for (const item of distribution) {
    if (compareSemver(item.version, minVersion) >= 0) sum += item.sharePct;
  }
  // 浮点四舍五入到 2 位小数，规避二进制误差
  return Math.round(sum * 100) / 100;
}
