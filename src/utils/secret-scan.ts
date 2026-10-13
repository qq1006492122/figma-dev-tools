import * as fs from 'node:fs';
import * as path from 'node:path';

export type SecretKind =
  | 'figma-pat'
  | 'github-token'
  | 'openai-api-key'
  | 'aws-access-key'
  | 'private-key';

export interface SecretFinding {
  file: string;
  line: number;
  kind: SecretKind;
  masked: string;
}

interface SecretRule {
  kind: SecretKind;
  pattern: RegExp;
  minEntropy?: number;
}

function shannonEntropy(value: string): number {
  if (!value) return 0;
  const counts = new Map<string, number>();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function isPlausibleSecret(value: string, minEntropy = 3): boolean {
  if (value.length < 20) return false;
  if (/^(x+|a+|0+)$/i.test(value)) return false;
  if (/(?:^|[_-])(?:your|here|example|placeholder|sample|test|xxxx)(?:[_-]|$)/i.test(value)) return false;
  return shannonEntropy(value) >= minEntropy;
}

const RULES: SecretRule[] = [
  {
    kind: 'figma-pat',
    pattern: /\bfigd_[A-Za-z0-9_-]{24,}\b/g,
    minEntropy: 3.1,
  },
  {
    kind: 'github-token',
    pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g,
    minEntropy: 3.1,
  },
  {
    kind: 'openai-api-key',
    pattern: /\bsk-[A-Za-z0-9_-]{24,}\b/g,
    minEntropy: 3.1,
  },
  {
    kind: 'aws-access-key',
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    minEntropy: 2.5,
  },
  {
    kind: 'private-key',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
];

export function maskSecret(value: string): string {
  if (value.length <= 12) return '***';
  return `${value.slice(0, 6)}***${value.slice(-4)}`;
}

export function scanContent(content: string, file = '<memory>'): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lineStarts = [0];
  for (let index = 0; index < content.length; index++) {
    if (content.charCodeAt(index) === 10) lineStarts.push(index + 1);
  }

  const lineForOffset = (offset: number): number => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const start = lineStarts[middle]!;
      const next = lineStarts[middle + 1] ?? Number.POSITIVE_INFINITY;
      if (offset < start) high = middle - 1;
      else if (offset >= next) low = middle + 1;
      else return middle + 1;
    }
    return lineStarts.length;
  };

  for (const rule of RULES) {
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const value = match[0];
      if (rule.minEntropy !== undefined && !isPlausibleSecret(value, rule.minEntropy)) continue;
      findings.push({
        file,
        line: lineForOffset(match.index),
        kind: rule.kind,
        masked: maskSecret(value),
      });
    }
  }

  return findings;
}

const SKIP_PARTS = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  'test-results',
  '.cache',
  '.idea',
  '.vscode',
]);
const SKIP_FILES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
]);
const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.txt',
  '.log',
  '.yml',
  '.yaml',
  '.toml',
  '.ini',
  '.env',
  '.html',
  '.css',
  '.scss',
  '.less',
  '.vue',
  '.svelte',
  '.wxml',
  '.wxss',
  '.sh',
  '.ps1',
  '.cmd',
  '.bat',
]);

function shouldScan(file: string): boolean {
  const base = path.basename(file);
  if (SKIP_FILES.has(base) || base.endsWith('.snap')) return false;
  const ext = path.extname(file).toLowerCase();
  return TEXT_EXTENSIONS.has(ext) || base === '.env' || /^\.env\..+/.test(base);
}

function walk(root: string, output: string[]): void {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_PARTS.has(entry.name)) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walk(full, output);
    } else if (entry.isFile() && shouldScan(full)) {
      output.push(full);
    }
  }
}

export function scanDirectory(root: string): SecretFinding[] {
  const files: string[] = [];
  walk(path.resolve(root), files);
  const findings: SecretFinding[] = [];
  for (const file of files.sort()) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('\0')) continue;
    findings.push(...scanContent(content, path.relative(root, file).split(path.sep).join('/')));
  }
  return findings;
}
