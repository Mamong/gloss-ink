'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const builtin = require('../packages/builtin-components');
const {ComponentError} = require('../packages/component-engine');
const {createTemplateCompiler} = require('../packages/template-compiler');
const {fixture} = require('./helpers/dom.cjs');
function setup(t, request = () => ({})) {
  const f = fixture(t), calls = [];
  const root = {document:f.document,get webkit() {throw new Error('Read native bridge');}, get NowApp() {throw new Error('Read SDK');}};
  const controller = builtin.createWebViewRuntime(root, {Error: ComponentError, request(method, value) {calls.push({method, value}); return request(method, value);}});
  const element = f.document.createElement('div');
  controller.create(element, 'web-view');
  t.after(() => controller.dispose());
  const node = {viewNodeId: 'node-1', tag: 'web-view', attrs: {id: 'browser', src: 'https://example.invalid/page'}, dataset: {item: 1}, events: [{name: 'message', handler: 'messages'}, {name: 'load', handler: 'loaded'}, {name: 'error', handler: 'failed'}, {name: 'tap', handler: 'tap'}]};
  return {...f, controller, calls, element, node};
}
test('web-view delegates its host request and pending result through the public factory', async t => {
  let resolve;
  const pending = new Promise(done => {resolve = done;});
  const {controller, element, node, calls} = setup(t, () => pending);
  const result = controller.patch(element, node); assert.equal(result, pending);
  assert.deepEqual(calls, [{method: 'webview.update', value: {nodeId: 'node-1', src: 'https://example.invalid/page', visible: false, id: 'browser', dataset: {item: 1}, events: [{name: 'message', handler: 'messages'}, {name: 'load', handler: 'loaded'}, {name: 'error', handler: 'failed'}]}}]);
  assert.equal(element.getAttribute('aria-label'), '网页'); assert.equal(element.querySelector('.weapp-web-view-placeholder')?.getAttribute('aria-hidden'), 'true');
  resolve({created: true}); assert.deepEqual(await result, {created: true});
});
test('web-view visibility is carried by later patches without a host visibility RPC', t => {
  const {controller, element, node, calls} = setup(t);
  controller.visibility(true); assert.equal(calls.length, 0);
  controller.patch(element, node); assert.equal(calls[0].value.visible, true);
  controller.visibility(false); controller.patch(element, node);
  assert.equal(calls[1].value.visible, false);
});
test('web-view empty src is explicit and invalid src cannot reach the host', t => {
  const {controller, element, node, calls} = setup(t);
  delete node.attrs.src; controller.patch(element, node); assert.equal(calls[0].value.src, '');
  for (const src of [1, null, {}, []]) {
    node.attrs.src = src; assert.throws(() => controller.patch(element, node), {code: 'INVALID_ARGUMENT'});
  }
  assert.equal(calls.length, 1);
});
test('web-view removal releases only the registered element once', t => {
  const {controller, element, node, calls, document} = setup(t);
  const other = document.createElement('div'); controller.create(other, 'view');
  controller.patch(other, node); controller.remove(other); assert.equal(calls.length, 0);
  controller.patch(element, node); controller.remove(element); controller.remove(element);
  assert.deepEqual(calls.map(call => call.method), ['webview.update', 'webview.remove']);
  assert.deepEqual(calls[1].value, {nodeId: 'node-1'});
});
test('web-view removal before first patch and disposal do not fabricate host removals', t => {
  const {controller, element, node, calls} = setup(t);
  controller.remove(element); assert.equal(calls.length, 0);
  controller.create(element, 'web-view'); controller.patch(element, node);
  controller.dispose(); controller.dispose(); controller.patch(element, node); controller.remove(element);
  assert.equal(calls.length, 1);
});
test('web-view preserves scoped node IDs and replacement src requests', t => {
  const {controller, element, node, calls} = setup(t);
  node.viewNodeId = 'component-scope:node-1'; controller.patch(element, node);
  node.attrs.src = 'https://example.invalid/replaced'; controller.patch(element, node);
  assert.deepEqual(calls.map(call => [call.value.nodeId, call.value.src]), [['component-scope:node-1', 'https://example.invalid/page'], ['component-scope:node-1', 'https://example.invalid/replaced']]);
});
test('web-view src is not passed through the browser image asset resolver', t => {
  const f = fixture(t), element = f.document.createElement('div');
  const components = builtin.createBrowserComponents({document: f.document, Error: ComponentError, asset() {throw new Error('Resolved web-view as an image');}});
  components.attributes(element, undefined, {tag: 'web-view', attrs: {src: 'https://example.invalid/page', id: 'browser', hidden: true}, dataset: {}});
  assert.equal(element.hasAttribute('src'), false); assert.equal(element.id, 'browser'); assert.equal(element.hidden, true);
});
test('public template compiler accepts web-view src and its three delegated events', () => {
  const schema = builtin.createBuiltinCatalog(), diagnostics = [];
  assert.ok(schema.tags.includes('web-view')); assert.deepEqual(schema.properties['web-view'], ['src']);
  const result = createTemplateCompiler(schema).compile('<web-view src="{{url}}" bindload="loaded" binderror="failed" bindmessage="messages"/>', 'page.wxml', (...entry) => diagnostics.push(entry));
  assert.equal(typeof result, 'string'); assert.deepEqual(diagnostics, []);
});
test('public template compiler rejects web-view child content', () => {
  const compiler = createTemplateCompiler(builtin.createBuiltinCatalog());
  for (const source of ['<web-view><view/></web-view>', '<web-view>content</web-view>']) {
    const diagnostics = []; compiler.compile(source, 'page.wxml', (...entry) => diagnostics.push(entry));
    assert.ok(diagnostics.some(entry => entry[1] === 'WXML_WEB_VIEW'));
  }
});
