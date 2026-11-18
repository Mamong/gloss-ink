'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ui = require('../packages/builtin-components');
const {ComponentError} = require('../packages/component-engine');
const {fixture} = require('./helpers/dom.cjs');

test('the standalone back-to-top controller publishes through an explicit port without reading a native bridge', async () => {
  const states = [];
  const root = {document: {}, get webkit() {throw new Error('Builtin controller accessed native WebKit bridge');}};
  const controller = ui.createBackToTop(root, {publish: state => states.push(state)});
  controller.visibility(true); await Promise.resolve();
  assert.equal(states.length, 1); assert.equal(states[0].enabled, false);
  controller.visibility(false);
  assert.equal(states.at(-1).epoch, 2);
});

test('packaged video controller cancels owned overlay timers on removal, visibility changes and disposal', t => {
  const f = fixture(t);
  const element = f.document.createElement('video'); f.document.body.append(element);
  const controller = ui.createVideoRuntime(f.root, {Error: ComponentError, find: () => element, live: () => true});
  const initialTimers = f.timers.size;
  const send = text => controller.execute('sendDanmu', {videoId: 'player', danmu: {text, duration: 15000}});
  send('removed'); assert.equal(f.timers.size, initialTimers + 1);
  const removed = [...f.document.querySelectorAll('span')].find(node => node.textContent === 'removed');
  controller.remove(element); assert.equal(removed.isConnected, false); assert.equal(f.timers.size, initialTimers);
  send('hidden'); const hidden = [...f.document.querySelectorAll('span')].find(node => node.textContent === 'hidden');
  controller.visibility(false); assert.equal(hidden.isConnected, false); assert.equal(f.timers.size, initialTimers);
  assert.throws(() => send('blocked'), error => error.code === 'PAGE_NOT_READY');
  controller.visibility(true); send('disposed'); const disposed = [...f.document.querySelectorAll('span')].find(node => node.textContent === 'disposed');
  controller.dispose(); controller.dispose(); assert.equal(disposed.isConnected, false); assert.equal(f.timers.size, initialTimers);
  assert.throws(() => controller.execute('pause', {videoId: 'player'}), error => error.code === 'PAGE_UNLOADED');
});

test('packaged map controller owns its rendered state and releases it before rejecting retained operations', t => {
  const f = fixture(t);
  const element = f.document.createElement('div'); f.document.body.append(element);
  const node = {tag: 'map', element, attrs: {latitude: 10, longitude: 20, markers: [{id: 1, latitude: 10, longitude: 20}]}};
  const controller = ui.createMapRuntime(f.root, {Error: ComponentError, find: () => element, node: () => node, live: () => true, emit() {}});
  controller.patch(element, node);
  const layer = element.__nowMapLayer;
  assert.equal(layer.isConnected, true);
  assert.deepEqual(controller.execute('getCenterLocation', {mapId: 'map'}), {latitude: 10, longitude: 20});
  controller.dispose(); controller.dispose();
  assert.equal(layer.isConnected, false); assert.equal(element.__nowMapLayer, undefined); assert.equal(element.__nowMapState, undefined);
  assert.throws(() => controller.execute('getCenterLocation', {mapId: 'map'}), error => error.code === 'PAGE_UNLOADED');
});
