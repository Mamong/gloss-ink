'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {threadId} = require('node:worker_threads');
const {fixture} = require('./helpers/component-worker.cjs');
const modes = ['CommonJS', 'embedded'];
const callbacks = state => state.trace.filter(event => event.type === 'callback').map(event => event.label);
const phases = state => state.trace.map(event => event.type);
const node = (descriptor, nodeId, elementId) => ({nodeId, parentNodeId: null, componentId: descriptor.id, tag: 'counter', elementId, classes: []});
async function create(f, pageId, nodeId, key = nodeId, attrs = {}) {
  const descriptor = await f.request(pageId, 'component.create', {nodeId, source: 'counter', key, attrs, dataset: {}});
  await f.call('connect', {id: descriptor.id});
  return descriptor;
}
async function attach(f, pageId, component) {
  const attaching = f.request(pageId, 'component.attach', {id: component.id, connected: true});
  const receipt = await f.nextRender();
  await f.ack(receipt); await attaching;
  return receipt;
}
async function setup(t, mode, {attached = true} = {}) {
  const f = fixture(t, mode), boot = await f.inspect(), pageId = boot.pageId;
  assert.notEqual(boot.threadId, threadId);
  const component = await create(f, pageId, 'first', 'stable');
  await f.request(pageId, 'tree.commit', {revision: 1, nodes: [node(component, 'first', 'counter')]});
  if (attached) await attach(f, pageId, component);
  return {f, pageId, component, boot};
}
for (const mode of modes) {
  const check = (name, fn) => test(mode + ' real Worker: ' + name, {timeout: 20000}, fn);
  check('ready waits for a receipt from the parent thread', async t => {
    const {f, pageId, component, boot} = await setup(t, mode, {attached: false});
    let completed = false;
    const attaching = f.request(pageId, 'component.attach', {id: component.id, connected: true}).then(result => {completed = true; return result;});
    const receipt = await f.nextRender(), before = await f.inspect();
    assert.equal(receipt.threadId, boot.threadId); assert.equal(completed, false);
    assert.deepEqual(phases(before), ['created', 'attached']);
    await f.ack(receipt); assert.deepEqual(await attaching, {attached: true});
    assert.deepEqual(phases(await f.inspect()), ['created', 'attached', 'ready']);
  });
  check('data and render payloads cross structured clone without sharing state', async t => {
    const {f, component} = await setup(t, mode);
    const changes = {nested: {value: 7}};
    const updating = f.call('update', {selector: '#counter', patches: [{changes, label: 'snapshot'}]});
    changes.nested.value = 99; await updating;
    const receipt = await f.nextRender(); assert.equal(receipt.data.nested.value, 7);
    receipt.data.nested.value = 100;
    assert.equal((await f.request(component.id, 'data')).nested.value, 7);
    const returned = await f.request(component.id, 'data'); returned.nested.value = 200;
    assert.equal((await f.request(component.id, 'data')).nested.value, 7);
    assert.deepEqual(callbacks(await f.inspect()), []);
    await f.ack(receipt); assert.deepEqual(callbacks(await f.inspect()), ['snapshot']);
  });
  check('same-turn updates coalesce into one render and preserve callback order', async t => {
    const {f, component} = await setup(t, mode);
    await f.call('update', {selector: '#counter', patches: [
      {changes: {value: 1}, label: 'first'}, {changes: {'nested.value': 2}, label: 'second'},
    ]});
    const receipt = await f.nextRender(), before = await f.inspect();
    assert.deepEqual(receipt.data, {value: 1, nested: {value: 2}});
    assert.equal(before.pending.length, 1); assert.equal(f.renders.length, 0);
    assert.deepEqual(callbacks(before), []);
    assert.equal((await f.request(component.id, 'data')).value, 1);
    await f.ack(receipt);
    const after = await f.inspect(); assert.deepEqual(callbacks(after), ['first', 'second']);
    assert.ok(after.trace.every(event => event.threadId !== threadId));
  });
  check('independent outstanding receipts release only their own callbacks', async t => {
    const {f} = await setup(t, mode);
    await f.call('update', {selector: '#counter', patches: [{changes: {value: 1}, label: 'first'}]});
    const first = await f.nextRender();
    await f.call('update', {selector: '#counter', patches: [{changes: {value: 2}, label: 'second'}]});
    const second = await f.nextRender();
    assert.equal((await f.inspect()).pending.length, 2);
    await f.ack(second); assert.deepEqual(callbacks(await f.inspect()), ['second']);
    await f.ack(first); assert.deepEqual(callbacks(await f.inspect()), ['second', 'first']);
    assert.deepEqual(await f.ack(first), {accepted: false});
    assert.deepEqual(callbacks(await f.inspect()), ['second', 'first']);
  });
  check('destroy before initial acknowledgment suppresses ready and cleans the backend', async t => {
    const {f, pageId, component} = await setup(t, mode, {attached: false});
    const attaching = f.request(pageId, 'component.attach', {id: component.id, connected: true});
    const rejected = assert.rejects(attaching, {code: 'PAGE_UNLOADED'});
    const receipt = await f.nextRender();
    await f.request(pageId, 'component.destroy', {id: component.id}); await rejected;
    const state = await f.inspect();
    assert.deepEqual(phases(state), ['created', 'attached', 'detached']);
    assert.deepEqual(state.destroyed, [component.id]); assert.deepEqual(state.pending, []);
    assert.deepEqual(await f.ack(receipt), {accepted: false});
    await assert.rejects(f.request(component.id, 'data'), {code: 'PAGE_UNLOADED'});
  });
  check('destroy cancels pending setData and callback tokens without late delivery', async t => {
    const {f, pageId, component} = await setup(t, mode);
    const token = await f.call('token', {id: component.id, label: 'pending-token'});
    await f.call('update', {selector: '#counter', patches: [{changes: {value: 1}, label: 'late'}]});
    const receipt = await f.nextRender();
    await f.request(pageId, 'component.destroy', {id: component.id});
    assert.deepEqual(await f.ack(receipt), {accepted: false});
    await assert.rejects(f.request(component.id, 'callback', {id: token}), {code: 'PAGE_UNLOADED'});
    const state = await f.inspect();
    assert.deepEqual(callbacks(state), []); assert.deepEqual(state.pending, []);
    assert.equal(state.trace.some(event => event.type === 'token'), false);
    assert.deepEqual(state.registry, {instances: 1, components: 0, placements: 0});
  });
  check('reconnect claims the same instance with a new node and preserves private identity', async t => {
    const {f, pageId, component} = await setup(t, mode);
    await f.call('remember', {key: 'counter', selector: '#counter'});
    const initial = await f.call('private', {selector: '#counter'});
    await f.call('update', {selector: '#counter', patches: [{changes: {value: 4}, label: 'before'}]});
    await f.ack(await f.nextRender());
    const token = await f.call('token', {id: component.id, label: 'retained'});
    await f.call('detach', {id: pageId}); await f.call('reconnect', {id: pageId});
    const rebound = await f.request(pageId, 'component.create', {nodeId: 'rebound', source: 'counter', key: 'stable', attrs: {}, dataset: {}});
    assert.equal(rebound.id, component.id);
    await f.request(pageId, 'tree.commit', {revision: 1, nodes: [node(rebound, 'rebound', 'counter')]});
    await f.call('connected', {id: pageId});
    assert.equal(await f.call('same', {key: 'counter', selector: '#counter'}), true);
    assert.deepEqual(await f.call('private', {selector: '#counter'}), initial);
    assert.equal((await f.request(component.id, 'data')).value, 4);
    await f.request(component.id, 'callback', {id: token});
    await assert.rejects(f.request(component.id, 'callback', {id: token}), {code: 'INSTANCE_CALLBACK'});
    assert.deepEqual(phases(await f.inspect()), ['created', 'attached', 'ready', 'callback', 'token']);
  });
  check('an in-flight callback survives a claimed reconnect and still waits for its receipt', async t => {
    const {f, pageId, component} = await setup(t, mode);
    await f.call('update', {selector: '#counter', patches: [{changes: {value: 8}, label: 'retained'}]});
    const receipt = await f.nextRender();
    await f.call('detach', {id: pageId}); await f.call('reconnect', {id: pageId});
    const rebound = await f.request(pageId, 'component.create', {nodeId: 'new', source: 'counter', key: 'stable', attrs: {}, dataset: {}});
    await f.request(pageId, 'tree.commit', {revision: 1, nodes: [node(rebound, 'new', 'counter')]});
    await f.call('connected', {id: pageId});
    assert.deepEqual(callbacks(await f.inspect()), []);
    assert.equal(rebound.id, component.id);
    await f.ack(receipt); assert.deepEqual(callbacks(await f.inspect()), ['retained']);
  });
  check('unclaimed components are pruned on connected and their receipts are cancelled', async t => {
    const {f, pageId, component} = await setup(t, mode);
    const other = await create(f, pageId, 'other', 'other-key');
    await f.request(pageId, 'tree.commit', {revision: 2, nodes: [node(component, 'first', 'counter'), node(other, 'other', 'other')]});
    await attach(f, pageId, other);
    await f.call('update', {selector: '#other', patches: [{changes: {value: 3}, label: 'pruned'}]});
    const receipt = await f.nextRender();
    const token = await f.call('token', {id: other.id, label: 'pruned-token'});
    await f.call('detach', {id: pageId}); await f.call('reconnect', {id: pageId});
    const retained = await f.request(pageId, 'component.create', {nodeId: 'retained', source: 'counter', key: 'stable', attrs: {}, dataset: {}});
    await f.request(pageId, 'tree.commit', {revision: 1, nodes: [node(retained, 'retained', 'counter')]});
    await f.call('connected', {id: pageId});
    assert.equal(retained.id, component.id);
    await assert.rejects(f.request(other.id, 'callback', {id: token}), {code: 'PAGE_UNLOADED'});
    assert.deepEqual(await f.ack(receipt), {accepted: false});
    const state = await f.inspect();
    assert.deepEqual(state.registry, {instances: 2, components: 1, placements: 1});
    assert.deepEqual(state.destroyed, [other.id]); assert.deepEqual(callbacks(state), []);
  });
  check('callback tokens are scoped, cancellable and single use', async t => {
    const {f, pageId, component} = await setup(t, mode);
    const token = await f.call('token', {id: component.id, label: 'once'});
    await assert.rejects(f.request(pageId, 'callback', {id: token}), {code: 'INSTANCE_CALLBACK'});
    await f.request(component.id, 'callback', {id: token});
    await assert.rejects(f.request(component.id, 'callback', {id: token}), {code: 'INSTANCE_CALLBACK'});
    const cancelled = await f.call('token', {id: component.id, label: 'cancelled'});
    await f.request(component.id, 'callback.cancel', {ids: [cancelled]});
    await assert.rejects(f.request(component.id, 'callback', {id: cancelled}), {code: 'INSTANCE_CALLBACK'});
    assert.deepEqual((await f.inspect()).trace.filter(event => event.type === 'token').map(event => event.label), ['once']);
  });
  check('stale topology revisions and malformed protocol commands retain error codes', async t => {
    const {f, pageId, component} = await setup(t, mode);
    await assert.rejects(f.request(pageId, 'tree.commit', {revision: 1, nodes: []}), {code: 'INSTANCE_TREE'});
    await assert.rejects(f.call('request', {version: 2, ownerId: pageId, method: 'data'}), {code: 'INVALID_ARGUMENT'});
    await assert.rejects(f.request(pageId, 'unsupported', {}), {code: 'UNKNOWN_METHOD'});
    assert.deepEqual(await f.request(pageId, 'query', {selector: '#counter', all: true}), [component.id]);
    assert.deepEqual((await f.inspect()).registry, {instances: 2, components: 1, placements: 1});
  });
  check('triggerEvent crosses the Worker port with isolated detail and the owner scope', async t => {
    const {f, pageId, component} = await setup(t, mode);
    const event = {detail: {nested: {value: 4}}};
    const invoking = f.request(component.id, 'event', {binding: {handler: 'emit', name: 'tap'}, event});
    event.detail.nested.value = 9; await invoking; await f.inspect();
    assert.equal(f.events.length, 1);
    assert.equal(f.events[0].ownerId, pageId); assert.equal(f.events[0].event.componentId, component.id);
    assert.deepEqual(f.events[0].event.detail, {nested: {value: 4}});
    assert.deepEqual(f.events[0].event.settings, {bubbles: true, composed: true});
  });
  check('snapshot restoration restores component data through a deferred backend render', async t => {
    const {f, pageId, component} = await setup(t, mode);
    const snapshot = await f.call('snapshot', {id: pageId});
    await f.call('update', {selector: '#counter', patches: [{changes: {value: 9}, label: 'changed'}]});
    await f.ack(await f.nextRender());
    await f.call('restore', {id: pageId, snapshot});
    const receipt = await f.nextRender();
    assert.equal(receipt.data.value, 0); assert.equal((await f.request(component.id, 'data')).value, 0);
    await f.ack(receipt); assert.deepEqual((await f.inspect()).pending, []);
  });
  check('page teardown cancels pending work and releases every instance and placement', async t => {
    const {f, component} = await setup(t, mode);
    await f.call('update', {selector: '#counter', patches: [{changes: {value: 10}, label: 'unloaded'}]});
    const receipt = await f.nextRender();
    const state = await f.call('shutdown');
    assert.deepEqual(state.registry, {instances: 0, components: 0, placements: 0});
    assert.deepEqual(state.pending, []); assert.deepEqual(callbacks(state), []);
    assert.equal(state.destroyed.filter(id => id === component.id).length, 1);
    assert.deepEqual(await f.ack(receipt), {accepted: false});
    await assert.rejects(f.request(component.id, 'data'), {code: 'PAGE_UNLOADED'});
  });
}
