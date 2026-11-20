'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {isDeepStrictEqual} = require('node:util');
const {execFileSync} = require('node:child_process');
const repository = path.resolve(__dirname, '..');
require('./check-component-engine.js').check();
const target = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), 'ting-components-'));
if (fs.existsSync(target) && fs.readdirSync(target).length) throw new Error('Acceptance directory must be empty: ' + target);
fs.mkdirSync(target, {recursive: true});
const env = {...process.env, npm_config_cache: path.join(target, '.npm-cache'), npm_config_fetch_retries: '0', npm_config_fetch_timeout: '20000'};
delete env.NODE_PATH;
const run = (args, cwd = target) => execFileSync('npm', args, {cwd, env, stdio: 'inherit'});
for (const name of ['package.json', 'build.cjs', 'app.js', 'index.html', 'verify.cjs', 'verify-catalog.cjs', 'catalog-fixture.cjs', 'README.md', 'contracts.ts', 'package-lock.json']) {
  fs.copyFileSync(path.join(repository, 'examples/standalone', name), path.join(target, name));
}
const packages = path.join(target, 'packages');
fs.mkdirSync(packages);
for (const name of ['component-engine', 'builtin-components', 'component-backend', 'component-backend-dom', 'template-compiler', 'stylesheet-compiler']) {
  run(['pack', '--pack-destination', packages], path.join(repository, 'packages', name));
}
// Keep registry dependencies pinned while binding the local package entries to this build's tarballs.
const lockFile = path.join(target, 'package-lock.json');
const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
for (const name of ['component-engine', 'builtin-components', 'component-backend', 'component-backend-dom', 'template-compiler', 'stylesheet-compiler']) {
  const metadata = JSON.parse(fs.readFileSync(path.join(repository, 'packages', name, 'package.json'), 'utf8'));
  const entry = lock.packages['node_modules/' + metadata.name];
  if (!entry || entry.version !== metadata.version || !isDeepStrictEqual(entry.dependencies || {}, metadata.dependencies || {})) {
    throw new Error('Package dependencies changed; refresh the standalone lockfile: ' + metadata.name);
  }
  const tarball = path.join(packages, 'tingtalk-' + name + '-' + metadata.version + '.tgz');
  entry.integrity = 'sha512-' + crypto.createHash('sha512').update(fs.readFileSync(tarball)).digest('base64');
}
fs.writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n');
run(['ci', '--no-audit', '--no-fund']);
// Each module must physically resolve inside this clean application's node_modules.
for (const name of ['component-engine', 'builtin-components', 'component-backend', 'component-backend-dom', 'template-compiler', 'stylesheet-compiler', 'esbuild', 'playwright-core', 'typescript']) {
  const request = name.startsWith('component-') || ['builtin-components','template-compiler','stylesheet-compiler'].includes(name) ? '@tingtalk/' + name : name;
  const resolved = fs.realpathSync(require.resolve(request, {paths: [target]}));
  if (!resolved.startsWith(fs.realpathSync(path.join(target, 'node_modules')) + path.sep)) throw new Error('Dependency escaped isolated install: ' + resolved);
}
run(['run', 'typecheck']);
run(['run', 'build']);
run(['test']);
console.log('Independent application and evidence: ' + target);
