'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const source = path.resolve(__dirname, '../packages');
const entries = [
  ['component-backend/index.d.ts', 'component-backend-dom/ports/backend.d.ts'],
  ['component-engine/index.d.ts', 'component-backend-dom/ports/engine.d.ts'],
  ['builtin-components/index.d.ts', 'component-backend-dom/ports/builtin.d.ts'],
  ['template-compiler/runtime.d.ts', 'component-backend-dom/ports/wxs.d.ts'],
];
function main({check = false, sourceRoot = source} = {}) {
  for (const [owner, target] of entries) {
    const input = fs.readFileSync(path.join(sourceRoot, owner), 'utf8').replace(/\r\n/g, '\n');
    // Owner declarations are currently self-contained. Fail rather than emit unresolved imports.
    if (/\b(?:import\s*(?:\(|type\b|[{'"*])|from\s*['"])/.test(input)) throw new Error('Port owner gained declaration imports; extend the local declaration closure: ' + owner);
    const hash = crypto.createHash('sha256').update(input).digest('hex');
    const output = '// Generated from ' + owner + '; SHA-256 ' + hash + '\n// Regenerate with npm run types:component-ports\n' + input;
    const destination = path.join(sourceRoot, target);
    if (check) {
      if (!fs.existsSync(destination) || fs.readFileSync(destination, 'utf8').replace(/\r\n/g, '\n') !== output) throw new Error('Backend port declarations are stale: ' + target);
    } else {fs.mkdirSync(path.dirname(destination), {recursive: true}); fs.writeFileSync(destination, output);}
  }
}
if (require.main === module) try {main({check: process.argv.includes('--check')});} catch (error) {console.error(error.message); process.exitCode = 1;}
module.exports = {main, entries};
