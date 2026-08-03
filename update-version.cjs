const fs = require('fs');
const path = require('path');

// Update src/index.ts
let idx = fs.readFileSync(path.join(__dirname, 'src/index.ts'), 'utf8');
idx = idx.replace(/version:\s*'1\.1\.0'/g, "version: '1.1.3'");
fs.writeFileSync(path.join(__dirname, 'src/index.ts'), idx);
console.log('src/index.ts updated to version 1.1.3');

// Verify package.json
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
console.log('package.json version:', pkg.version);
