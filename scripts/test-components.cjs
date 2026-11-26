'use strict';
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const groups = require('./component-test-suites.json');
const root = path.resolve(__dirname, '..');
function main(args = process.argv.slice(2)) {
  const [group, ...options] = args;
  if (!Object.hasOwn(groups, group)) throw new Error('Unknown Gloss Ink test group: ' + group);
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=2', ...options, ...groups[group].map(file => path.join(root, 'test', file))], {cwd: root, stdio: 'inherit'});
  if (result.error) throw result.error;
  return result.status ?? 1;
}
if (require.main === module) process.exitCode = main();
module.exports = {groups, main};
