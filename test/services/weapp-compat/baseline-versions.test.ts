/**
 * 基础库版本冻结测试（WBS-P0-41）
 *
 * 数据取证：微信官方「基础库/版本分布」页（页面更新时间 2026-10-09），
 * 2026-10-10 浏览器实抓 40 个版本总体占比。
 * https://developers.weixin.qq.com/miniprogram/dev/framework/client-lib/version.html
 */
import { describe, it, expect } from 'vitest';

import {
  CLIENT_LIB_DISTRIBUTION,
  FROZEN_BASELINE,
  cumulativeCoverage,
  compareSemver,
} from '../../../src/services/weapp-compat/baseline-versions.js';

describe('P0-41 基础库版本冻结', () => {
  it('分布数据为官方实抓：40 个版本、按版本降序、占比合计约 100%', () => {
    expect(CLIENT_LIB_DISTRIBUTION.length).toBe(40);
    for (let i = 1; i < CLIENT_LIB_DISTRIBUTION.length; i++) {
      expect(compareSemver(CLIENT_LIB_DISTRIBUTION[i - 1]!.version, CLIENT_LIB_DISTRIBUTION[i]!.version)).toBeGreaterThan(0);
    }
    const total = CLIENT_LIB_DISTRIBUTION.reduce((s, x) => s + x.sharePct, 0);
    // 占比低于 0.01% 的版本官方已隐藏，合计允许略低于 100
    expect(total).toBeGreaterThan(99);
    expect(total).toBeLessThanOrEqual(100.5);
  });

  it('目标版本锁定为当前主版本 3.17.3（实抓总体占比 80.19%；3.17.4 仍灰度 0.15%）', () => {
    expect(FROZEN_BASELINE.target).toBe('3.17.3');
    const target = CLIENT_LIB_DISTRIBUTION.find((x) => x.version === '3.17.3')!;
    expect(target.sharePct).toBeCloseTo(80.19, 2);
  });

  it('兼容基线 3.1.5：累计覆盖率实算 99.03%（首个 ≥99% 的版本，再低收益 <0.2%）', () => {
    expect(FROZEN_BASELINE.minSupported).toBe('3.1.5');
    const coverage = cumulativeCoverage(CLIENT_LIB_DISTRIBUTION, '3.1.5');
    expect(coverage).toBeCloseTo(99.03, 1);
    expect(coverage).toBeGreaterThanOrEqual(99);
  });

  it('降一档到 3.0.2 覆盖率仅多 0.02 个百分点（佐证冻结点的经济性）', () => {
    const at315 = cumulativeCoverage(CLIENT_LIB_DISTRIBUTION, '3.1.5');
    const at302 = cumulativeCoverage(CLIENT_LIB_DISTRIBUTION, '3.0.2');
    expect(at302 - at315).toBeLessThan(0.2);
  });

  it('冻结元信息含官方来源 URL 与取证日期，可追溯', () => {
    expect(FROZEN_BASELINE.sourceUrl).toContain('client-lib/version.html');
    expect(FROZEN_BASELINE.pageUpdatedAt).toBe('2026-10-09');
    expect(FROZEN_BASELINE.capturedAt).toBe('2026-10-10');
  });
});

describe('compareSemver / cumulativeCoverage 边界', () => {
  it('semver 主/次/修订位正确比较', () => {
    expect(compareSemver('3.17.3', '3.17.4') < 0).toBe(true);
    expect(compareSemver('3.17.3', '3.16.3') > 0).toBe(true);
    expect(compareSemver('2.33.0', '10.0.0') < 0).toBe(true); // 不按字典序
    expect(compareSemver('3.1.5', '3.1.5') === 0).toBe(true);
  });

  it('cumulativeCoverage 只统计 ≥ 基线版本（旧版本排除）', () => {
    const dist = [
      { version: '3.2.0', sharePct: 10 },
      { version: '3.1.0', sharePct: 20 },
      { version: '3.0.0', sharePct: 70 },
    ];
    expect(cumulativeCoverage(dist, '3.1.0')).toBeCloseTo(30, 5);
  });
});
