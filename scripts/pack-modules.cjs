'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
require('./check-component-engine.js').check();
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.argv[2] || path.join(root, 'artifacts/packages'));
fs.mkdirSync(output, {recursive: true});
const manifest = {};
for (const name of ['component-engine', 'builtin-components', 'component-backend-dom', 'template-compiler', 'stylesheet-compiler']) {
  const [pack] = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', output], {
    cwd: path.join(root, 'packages', name), encoding: 'utf8'
  }));
  const data = fs.readFileSync(path.join(output, pack.filename));
  manifest[pack.name] = {version: pack.version, filename: pack.filename, bytes: data.length,
    sha256: crypto.createHash('sha256').update(data).digest('hex'), integrity: pack.integrity,
    files: pack.files.map(file => file.path)};
}
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Five independent npm packages and SHA-256 manifest: ' + output);
