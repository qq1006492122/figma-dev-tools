#!/usr/bin/env node
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');

const [, , ...args] = process.argv;
const command = args[0];

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

function c(color, text) {
  return colors[color] + text + colors.reset;
}

function runNodeScript(scriptPath, scriptArgs) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [scriptPath, ...scriptArgs], {
      cwd: packageRoot,
      stdio: 'inherit',
      env: process.env,
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Process exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}

async function runCli() {
  const distCli = path.join(packageRoot, 'dist', 'cli', 'index.js');
  const hasDist = fs.existsSync(distCli);
  const isInstallOrUninstall = command === 'install' || command === 'uninstall';

  if (isInstallOrUninstall) {
    const scriptName = command === 'install' ? 'install.mjs' : 'uninstall.mjs';
    const scriptPath = path.join(packageRoot, scriptName);
    if (!fs.existsSync(scriptPath)) {
      console.error(c('red', `Error: ${scriptName} not found`));
      process.exit(1);
    }
    try {
      await runNodeScript(scriptPath, args.slice(1));
    } catch (err) {
      console.error(c('red', `${command} failed: ${err.message}`));
      process.exit(1);
    }
    return;
  }

  if (args.includes('help') || args.includes('--help') || args.includes('-h') || args.length === 0) {
    printHelp();
    return;
  }

  if (args.includes('--version') || args.includes('-V')) {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf-8'));
    console.log(pkg.version);
    return;
  }

  if (hasDist) {
    try {
      await runNodeScript(distCli, args);
    } catch (_err) {
      process.exit(1);
    }
  } else {
    const tsxBin = path.join(packageRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
    const srcCli = path.join(packageRoot, 'src', 'cli', 'index.ts');

    if (fs.existsSync(tsxBin) && fs.existsSync(srcCli)) {
      console.error(c('yellow', 'Running with tsx (not compiled)...'));
      const proc = spawn(tsxBin, [srcCli, ...args], {
        cwd: packageRoot,
        stdio: 'inherit',
        env: process.env,
      });
      proc.on('close', (code) => process.exit(code || 0));
      proc.on('error', (err) => {
        console.error(c('red', `Failed to run CLI: ${err.message}`));
        console.error(c('dim', 'Try running: npm run build'));
        process.exit(1);
      });
    } else {
      console.error(c('red', 'Error: Compiled CLI not found.'));
      console.error(c('yellow', 'Please run: npm install && npm run build'));
      console.error(c('dim', `  Expected: ${distCli}`));
      process.exit(1);
    }
  }
}

function printHelp() {
  const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf-8'));
  console.log(`
${c('cyan', c('bold', 'Figma Dev Tools'))} ${c('dim', 'v' + pkg.version)}

${c('bold', 'Usage:')}
  figma-dev <command> [options]
  npx figma-dev-tools <command> [options]

${c('bold', 'Setup Commands:')}
  install               Install MCP server config for detected AI editors
  uninstall             Remove MCP server config from AI editors
  init                  Initialize project configuration

${c('bold', 'Core Commands:')}
  validate              Validate Figma Access Token
  info <url>            Get Figma file information
  sync <url>            Sync design tokens to local project
  component <url>       Generate React component code
  jsx <url>             One-click React+Tailwind TSX generation (enhanced)
  metadata <url>        Get high-level design structure overview
  screenshot <url>      Get node screenshot
  assets <url>          Download design assets to public/portal/<scene>/

${c('bold', 'MCP Server:')}
  mcp                   Start MCP server (stdio mode)

${c('bold', 'Options:')}
  -t, --token <token>   Figma Access Token
  -o, --output <dir>    Output directory (default: ./src/styles/figma)
  -h, --help            Show this help message
  -V, --version         Show version number

${c('bold', 'Examples:')}
  ${c('dim', '# Install MCP for all detected editors')}
  figma-dev install

  ${c('dim', '# Validate your token')}
  figma-dev validate -t your_token_here

  ${c('dim', '# Sync tokens from a Figma file')}
  figma-dev sync https://www.figma.com/design/FILE_KEY/Name?node-id=1-2

  ${c('dim', '# Generate JSX for a node')}
  figma-dev jsx https://www.figma.com/design/FILE_KEY/Name?node-id=1-2 --scene homepage

${c('dim', 'Get your Figma token: https://www.figma.com/developers/api#access-tokens')}
`);
}

runCli().catch((err) => {
  console.error(c('red', `Fatal error: ${err.message}`));
  console.error(err.stack);
  process.exit(1);
});
