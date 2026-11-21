'use strict';
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = '// Generated from component-backend/rpx.js; regenerate with scripts/sync-rpx.cjs.\n' + fs.readFileSync(path.join(root, 'packages/component-backend/rpx.js'), 'utf8');
for (const name of ['component-backend-dom', 'builtin-components', 'stylesheet-compiler']) {
  const target = path.join(root, 'packages', name, 'rpx.js');
  if (process.argv.includes('--check')) {if (fs.readFileSync(target, 'utf8') !== source) throw Error('Stale rpx units: ' + name);}
  else fs.writeFileSync(target, source);
}
