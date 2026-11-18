'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {modes, load, observations} = require('./helpers/component-semantics.cjs');
const {verify, main, specs, references, reviewed} = require('../scripts/check-component-semantics.cjs');
const copy = value => JSON.parse(JSON.stringify(value));
for (const mode of modes) {
  const actual = observations(mode);
  for (const [suite, spec] of Object.entries(specs)) {
    test(mode + ' semantic scenario coverage: ' + suite, () => verify(actual[suite], references[suite], spec.decisions, reviewed[suite]));
    for (const name of Object.keys(references[suite].glass)) {
      test(mode + ' pinned ' + suite + ': ' + name, () => {
        if (Object.hasOwn(spec.decisions, name)) {
          assert.deepEqual(actual[suite][name], reviewed[suite][name]);
        } else {
          assert.deepEqual(references[suite].exparser[name], references[suite].glass[name]);
          assert.deepEqual(actual[suite][name], references[suite].glass[name]);
        }
      });
    }
  }
  test(mode + ' ready and callbacks wait for receipts; destruction cancels late completion', async () => {
    const trace = [], pending = [], engine = load(mode).createComponentEngine();
    const controller = engine.create({data: {value: 0}, lifetimes: {
      attached() {trace.push('attached');}, ready() {trace.push('ready');}, detached() {trace.push('detached');},
    }}, 'receipt-case', {attached: () => true}, {}, {}, () => {}, () => {});
    controller.setView({
      render() {let resolve; const done = new Promise(callback => {resolve = callback;}); pending.push(resolve); return {settled: false, done};},
      markChanges() {}, destroy() {trace.push('view-destroy');},
    });
    try {
      controller.attach(); assert.deepEqual(trace, ['attached']);
      pending.shift()(); await Promise.resolve(); assert.deepEqual(trace, ['attached', 'ready']);
      controller.instance.setData({value: 1}, () => trace.push('callback'));
      await Promise.resolve();
      assert.deepEqual(trace, ['attached', 'ready']);
      pending.shift()(); await Promise.resolve(); assert.deepEqual(trace, ['attached', 'ready', 'callback']);
      controller.instance.setData({value: 2}, () => trace.push('late-callback'));
      await Promise.resolve();
      controller.destroy(); pending.shift()(); await Promise.resolve();
      assert.deepEqual(trace, ['attached', 'ready', 'callback', 'view-destroy', 'detached']);
    } finally {controller.destroy();}
  });
  test(mode + ' destruction before first receipt suppresses ready', async () => {
    const trace = [], engine = load(mode).createComponentEngine();
    let resolve;
    const controller = engine.create({lifetimes: {ready() {trace.push('ready');}}}, 'late-ready', {attached: () => true}, {}, {}, () => {}, () => {});
    controller.setView({render: () => ({settled: false, done: new Promise(done => {resolve = done;})}), markChanges() {}, destroy() {}});
    controller.attach(); controller.destroy(); resolve(); await Promise.resolve();
    assert.deepEqual(trace, []);
  });
  test(mode + ' triggerEvent snapshots detail across the instance port', () => {
    const sent = [], engine = load(mode).createComponentEngine();
    const controller = engine.create({}, 'event-case', {attached: () => false}, {}, {}, (_name, detail) => sent.push(detail), () => {});
    try {
      const original = {nested: {value: 1}};
      controller.instance.triggerEvent('change', original, {bubbles: true, composed: true});
      original.nested.value = 9; assert.equal(sent[0].nested.value, 1);
      sent[0].nested.value = 3; assert.equal(original.nested.value, 9);
    } finally {controller.destroy();}
  });
}
const baseline = observations();
test('semantic gate rejects a changed observer trace', () => {
  const actual = copy(baseline.data); actual['initial-properties'].trace.reverse();
  assert.throws(() => verify(actual, references.data, specs.data.decisions, reviewed.data), /Current runtime differs/);
});
test('semantic gate also pins reviewed differences', () => {
  const actual = copy(baseline.data); actual['numeric-dot-path'].data.items = {0: {count: 2}};
  assert.throws(() => verify(actual, references.data, specs.data.decisions, reviewed.data), /Reviewed current behavior differs/);
  const extensions = copy(baseline.extensions); extensions['behavior-array-merge'] = {items: [9]};
  assert.throws(() => verify(extensions, references.extensions, specs.extensions.decisions, reviewed.extensions), /Reviewed current behavior differs/);
});
test('semantic gate rejects unreviewed upstream divergence', () => {
  const reference = copy(references.data); reference.exparser['initial-properties'].trace.reverse();
  assert.throws(() => verify(baseline.data, reference, specs.data.decisions, reviewed.data), /Upstream divergence/);
});
for (const mutation of ['missing', 'extra', 'renamed']) test('semantic gate rejects ' + mutation + ' scenarios', () => {
  const actual = copy(baseline.data);
  if (mutation !== 'extra') delete actual['initial-properties'];
  if (mutation !== 'missing') actual.unreviewed = {};
  assert.throws(() => verify(actual, references.data, specs.data.decisions, reviewed.data), /Current scenario set differs/);
});
test('semantic gate rejects mismatched reference scenario sets', () => {
  const reference = copy(references.data); delete reference.glass['initial-properties'];
  assert.throws(() => verify(baseline.data, reference, specs.data.decisions, reviewed.data), /Reference scenario sets differ/);
});
for (const mutation of ['missing expected', 'extra expected', 'orphan decision', 'missing reason', 'unknown policy']) {
  test('semantic gate rejects ' + mutation, () => {
    const decisions = copy(specs.data.decisions), expected = copy(reviewed.data);
    if (mutation === 'missing expected') delete expected['numeric-dot-path'];
    if (mutation === 'extra expected') expected.unreviewed = {};
    if (mutation === 'orphan decision') {decisions.unreviewed = decisions['numeric-dot-path']; expected.unreviewed = {};}
    if (mutation === 'missing reason') decisions['numeric-dot-path'].reason = ' ';
    if (mutation === 'unknown policy') decisions['numeric-dot-path'].policy = 'accept-any-output';
    assert.throws(() => verify(baseline.data, references.data, decisions, expected), /Reviewed difference set differs|Unused decision|Missing review reason|Unsupported policy/);
  });
}
test('semantic CLI rejects unsupported or incomplete options', () => {
  for (const args of [['--update'], ['--out'], ['--out', '--check'], ['--out', 'first', '--out', 'second']]) {
    assert.throws(() => main(args));
  }
});
