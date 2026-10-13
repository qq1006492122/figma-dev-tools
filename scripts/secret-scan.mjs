import path from 'node:path';

import { scanDirectory } from '../dist/utils/secret-scan.js';

const root = path.resolve(process.argv[2] ?? process.cwd());
const findings = scanDirectory(root);

if (findings.length === 0) {
  console.log(`Secret scan passed: no plausible secrets found in ${root}`);
  process.exit(0);
}

console.error(`Secret scan failed: ${findings.length} finding(s)`);
for (const finding of findings) {
  console.error(`${finding.file}:${finding.line} [${finding.kind}] ${finding.masked}`);
}
process.exit(1);
