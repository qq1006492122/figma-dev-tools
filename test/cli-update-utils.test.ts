import { describe, expect, it } from 'vitest';

import {
  canUseFallbackPackage,
  compareStableVersions,
  fetchLatestStableVersion,
  getUpdateExitCode,
  isValidStableVersion,
} from '../src/cli/update-utils.js';

describe('CLI update version policy', () => {
  it('accepts stable semver and rejects malformed or prerelease versions', () => {
    expect(isValidStableVersion('1.4.16')).toBe(true);
    expect(isValidStableVersion('1.4.16-beta.1')).toBe(false);
    expect(isValidStableVersion('latest')).toBe(false);
    expect(isValidStableVersion('1.4')).toBe(false);
  });

  it('only treats a strictly newer stable version as an update', () => {
    expect(compareStableVersions('1.4.16', '1.4.15')).toBe(1);
    expect(compareStableVersions('1.4.15', '1.4.16')).toBe(-1);
    expect(compareStableVersions('1.4.16', '1.4.16')).toBe(0);
  });
});

describe('CLI update result policy', () => {
  it('returns failure when installation or fallback did not complete', () => {
    expect(getUpdateExitCode({ installSucceeded: true, fallbackSucceeded: false })).toBe(0);
    expect(getUpdateExitCode({ installSucceeded: false, fallbackSucceeded: true })).toBe(0);
    expect(getUpdateExitCode({ installSucceeded: false, fallbackSucceeded: false })).toBe(1);
  });

  it('allows fallback only when the source package is the requested version', () => {
    expect(canUseFallbackPackage('1.4.16', '1.4.16')).toBe(true);
    expect(canUseFallbackPackage('1.4.15', '1.4.16')).toBe(false);
  });
});


describe('CLI registry retry policy', () => {
  it('retries transient registry failures and returns the stable version', async () => {
    let attempts = 0;
    const version = await fetchLatestStableVersion('figma-dev-tools', {
      registries: ['https://registry.example'],
      requestImpl: async () => {
        attempts += 1;
        if (attempts < 3) {
          const err = new Error('HTTP 503') as Error & { response?: { status: number } };
          err.response = { status: 503 };
          throw err;
        }
        return { version: '1.4.17' };
      },
      maxAttempts: 3,
      timeoutMs: 100,
    });
    expect(version).toBe('1.4.17');
    expect(attempts).toBe(3);
  });

  it('falls back to the next registry when the primary one fails', async () => {
    const triedUrls: string[] = [];
    const version = await fetchLatestStableVersion('figma-dev-tools', {
      registries: ['https://primary.example', 'https://mirror.example'],
      requestImpl: async (url) => {
        triedUrls.push(url);
        if (url.includes('primary.example')) {
          const err = new Error('HTTP 500') as Error & { response?: { status: number } };
          err.response = { status: 500 };
          throw err;
        }
        return { version: '1.4.18' };
      },
      maxAttempts: 1,
      timeoutMs: 100,
    });
    expect(version).toBe('1.4.18');
    expect(triedUrls).toContain('https://primary.example/figma-dev-tools/latest');
    expect(triedUrls).toContain('https://mirror.example/figma-dev-tools/latest');
  });
});
