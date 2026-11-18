'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {modes, observations} = require('../test/helpers/component-semantics.cjs');
const directory = path.resolve(__dirname, '../test/fixtures/component-semantics');
const lock = require(path.join(directory, 'references.json'));
const reviewed = require(path.join(directory, 'reviewed-differences.json'));
const specs = {
  data: {file: 'reference-traces.json', decisions: lock.decisions},
  extensions: {file: 'reference-extension-traces.json', decisions: lock.extensionDecisions},
  treeEvents: {file: 'reference-tree-event-traces.json', decisions: lock.treeEventDecisions},
};
const references = Object.fromEntries(Object.entries(specs).map(([name, spec]) => [name, require(path.join(directory, spec.file))]));
const keys = value => Object.keys(value).sort();
function verify(actual, reference, decisions = {}, expectedDifferences = {}) {
  assert.deepEqual(keys(reference.exparser), keys(reference.glass), 'Reference scenario sets differ');
  assert.deepEqual(keys(actual), keys(reference.glass), 'Current scenario set differs');
  assert.deepEqual(keys(decisions), keys(expectedDifferences), 'Reviewed difference set differs');
  const agreed = [], differences = [];
  for (const name of keys(actual)) {
    if (Object.hasOwn(decisions, name)) {
      const decision = decisions[name];
      assert.equal(decision.policy, 'keep-current-explicit-difference', 'Unsupported policy: ' + name);
      assert.ok(typeof decision.reason === 'string' && decision.reason.trim(), 'Missing review reason: ' + name);
      assert.deepEqual(actual[name], expectedDifferences[name], 'Reviewed current behavior differs: ' + name);
      differences.push({case: name, reason: decision.reason});
    } else {
      assert.deepEqual(reference.exparser[name], reference.glass[name], 'Upstream divergence needs explicit review: ' + name);
      assert.deepEqual(actual[name], reference.glass[name], 'Current runtime differs: ' + name);
      agreed.push(name);
    }
  }
  for (const name of keys(decisions)) assert.ok(Object.hasOwn(actual, name), 'Unused decision: ' + name);
  return {agreed, differences};
}
function check(mode) {
  const actual = observations(mode);
  return Object.fromEntries(Object.entries(specs).map(([name, spec]) => [name, verify(actual[name], references[name], spec.decisions, reviewed[name])]));
}
function main(args = process.argv.slice(2)) {
  let out;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--check') continue;
    assert.equal(args[index], '--out', 'Unknown argument: ' + args[index]);
    assert.ok(!out && args[index + 1] && !args[index + 1].startsWith('--'), 'Provide one --out path');
    out = path.resolve(args[++index]);
  }
  const results = Object.fromEntries(modes.map(mode => [mode, check(mode)]));
  const suites = results[modes[0]];
  const scenarioCount = Object.values(suites).reduce((total, suite) => total + suite.agreed.length + suite.differences.length, 0);
  const differenceCount = Object.values(suites).reduce((total, suite) => total + suite.differences.length, 0);
  const result = {
    format: 'gloss-ink-component-semantics-v1', mode: 'offline-captured-references',
    referenceCaptureDate: lock.capturedOn, executedReferenceEngines: false,
    versions: Object.fromEntries(Object.entries(lock.engines).map(([name, engine]) => [name, engine.version])),
    scenarioCount, differenceCount, runtimeModes: results,
  };
  if (out) {
    fs.mkdirSync(path.dirname(out), {recursive: true});
    fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  }
  console.log(`Component semantics: ${scenarioCount} scenarios per runtime, ${scenarioCount - differenceCount} agreed, ${differenceCount} reviewed differences; ${modes.join(' / ')} passed`);
  return result;
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stack); process.exitCode = 1; }
}
module.exports = {verify, check, main, specs, references, reviewed};
