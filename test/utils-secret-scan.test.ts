import { describe, expect, it } from 'vitest';

import { maskSecret, scanContent } from '../src/utils/secret-scan.js';

function syntheticFigmaToken(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-';
  let value = 'figd_';
  for (let index = 0; index < 48; index++) {
    value += alphabet[(index * 17 + 11) % alphabet.length];
  }
  return value;
}

describe('secret-scan', () => {
  it('拦截高熵 Figma Token，但不回显完整值', () => {
    const token = syntheticFigmaToken();
    const findings = scanContent(`const token = '${token}';`, 'src/example.ts');

    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe('figma-pat');
    expect(findings[0]?.masked).toBe(maskSecret(token));
    expect(findings[0]?.masked).not.toContain(token);
  });

  it('识别私钥头并报告行号', () => {
    const privateKeyHeader = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
    const findings = scanContent(`before\n${privateKeyHeader}\nbody\n`, 'keys/dev.pem.txt');

    expect(findings).toEqual([
      expect.objectContaining({ file: 'keys/dev.pem.txt', line: 2, kind: 'private-key' }),
    ]);
  });

  it('占位符和低熵测试样例不会误报', () => {
    const content = [
      'figd_xxxxx',
      `figd_${'a'.repeat(120)}`,
      'figd_test_token',
      ['figd_', 'your', 'token', 'here'].join('_'),
      'sk-example-placeholder',
    ].join('\n');

    expect(scanContent(content)).toEqual([]);
  });

  it('maskSecret 只保留短前缀和尾缀', () => {
    const sample = ['figd_', 'abcdefghijklmnopqrstuvwx'].join('');
    expect(maskSecret(sample)).toBe('figd_a***uvwx');
    expect(maskSecret('short')).toBe('***');
  });
});
