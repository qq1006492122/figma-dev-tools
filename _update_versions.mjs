import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Update src/index.ts
const indexPath = path.join(__dirname, 'src', 'index.ts');
let indexContent = fs.readFileSync(indexPath, 'utf8');
indexContent = indexContent.replace("version: '1.1.3'", "version: '1.1.4'");
fs.writeFileSync(indexPath, indexContent, 'utf8');
console.log('src/index.ts updated to version 1.1.4');

// Update README.md
const readmePath = path.join(__dirname, 'README.md');
let readmeContent = fs.readFileSync(readmePath, 'utf8');
// Replace all v1.1.3 instances with v1.1.4
readmeContent = readmeContent.replace(/v1\.1\.3/g, 'v1.1.4');
// Replace any remaining v1.1.2 instances with v1.1.4
readmeContent = readmeContent.replace(/v1\.1\.2/g, 'v1.1.4');
fs.writeFileSync(readmePath, readmeContent, 'utf8');
console.log('README.md updated to v1.1.4');
