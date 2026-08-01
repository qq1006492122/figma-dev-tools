#!/usr/bin/env node
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const args = process.argv.slice(2);
const apiKeyEq = args.find((a) => a.startsWith('--figma-api-key='));
if (apiKeyEq) process.env.FIGMA_ACCESS_TOKEN = apiKeyEq.split('=')[1];
else {
  const keyIdx = args.findIndex((a) => a === '--figma-api-key' || a === '--figma-api_key');
  if (keyIdx >= 0 && keyIdx + 1 < args.length) process.env.FIGMA_ACCESS_TOKEN = args[keyIdx + 1];
}
const distIndex = path.join(__dirname, 'dist', 'index.js');
if (fs.existsSync(distIndex)) {
  const proc = spawn(process.execPath, [distIndex], { stdio: 'inherit', env: process.env });
  proc.on('close', (code) => process.exit(code || 0));
} else {
  const tsxBin = path.join(__dirname, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
  if (fs.existsSync(tsxBin)) {
    const proc = spawn(tsxBin, [path.join(__dirname, 'src', 'index.ts')], { stdio: 'inherit', env: process.env });
    proc.on('close', (code) => process.exit(code || 0));
  } else {
    console.error('Error: Build not found.');
    process.exit(1);
  }
}
