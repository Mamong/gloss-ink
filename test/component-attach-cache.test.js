'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {JSDOM} = require('jsdom');
const core = require('../packages/component-engine');
const ui = require('../packages/builtin-components');
const dom = require('../packages/component-backend-dom');
const compiler = require('../packages/template-compiler').createTemplateCompiler(ui.createBuiltinCatalog());
const finish = receipt => receipt?.done || Promise.resolve();
function fixture(t, {remote = false, intercept, nested = false} = {}) {
  const browser = new JSDOM('<main id="weapp-root"></main>'), root = browser.window;
  root.scrollTo = () => {};
  const templates = {};
  for (const [route, template] of Object.entries({
    page: '<view><bench wx:if="{{present}}" id="child" value="{{value}}"/><text id="echo">{{echo}}</text></view>',
    child: '<view><text class="child-value">{{value}}</text>' + (nested ? '<leaf/>' : '') + '</view>',
    leaf: '<text>Leaf</text>'
  })) {
    templates[route] = vm.runInThisContext('(' + compiler.compile(template, route + '.wxml', (...row) => {throw Error(JSON.stringify(row));}, {components: ['bench', 'leaf'], component: route !== 'page'}) + ')');
  }
  const calls = [], lifetimes = [];
  const protocol = dom.createViewProtocol();
  const engine = core.createComponentEngine();
  const registry = core.createInstanceRegistry({engine, port: protocol, usingComponents: {page: {bench: 'child'}, child: {leaf: 'leaf'}, leaf: {}}, resolveComponent: source => ({
    properties: {value: {type: Number, value: 0}},
    lifetimes: {attached() {lifetimes.push(source + ':attached');}, ready() {lifetimes.push(source + ':ready');}, detached() {lifetimes.push(source + ':detached');}}
  })});
  const pageObject = {data: {present: true, value: 1, echo: 'first'}, change() {}};
  const page = registry.registerPage(pageObject, 'page');
  const instances = {connect: registry.driver.connect, request(message) {
    if (message.method === 'data') return registry.driver.request(message);
    calls.push({method: message.method, value: message.value});
    const invoke = () => {
      const run = () => {try {return registry.driver.request(message);} catch (error) {if (message.method === 'component.destroy' && error.code === 'PAGE_UNLOADED') return {}; throw error;}};
      return intercept ? intercept(message, run) : run();
    };
    return remote ? Promise.resolve().then(invoke) : invoke();
  }};
  const config = {templates, usingComponents: {page: {bench: 'child'}, child: {leaf: 'leaf'}, leaf: {}}, assets: {}, componentOptions: {}, externalStyleRules: {}, componentStyles: {child: '', leaf: ''}, styleTokens: {page: 'page', child: 'child', leaf: 'leaf'},
    componentViews: dom.createComponentViews, logicalEvents: core.createLogicalEvents, projectionPlanner: core.createProjectionPlanner, childReconciler: core.createChildReconciler, templateEvaluator: core.createTemplateEvaluator, builtinComponents: ui.createBrowserComponents,
    interactions: ui.createWeappInteractions, textInput: ui.createTextInputRuntime, formRuntime: ui.createFormRuntime, selectorQuery: dom.createSelectorQueryTools, componentSelector: core.createComponentSelector};
  const backend = dom.createDomBackend({root, config, remote, Error: core.ComponentError, viewProtocol: protocol, instances, visual: registry.visual, customEvents: new WeakMap()});
  const view = backend(page.id, 'page');
  const update = async changes => {Object.assign(pageObject.data, changes); view.markChanges(changes); await finish(view.render());};
  t.after(async () => {await finish(view.destroy()); registry.destroy(page.id); await new Promise(resolve => setImmediate(resolve)); root.close();});
  return {root, view, update, lifetimes, registry, calls, attaches: () => calls.filter(x => x.method === 'component.attach')};
}
for (const remote of [false, true]) {
  const mode = remote ? 'asynchronous remote port' : 'synchronous local port';
  test(mode + ' skips confirmed connected attachments while preserving properties, rendering and lifetimes', async t => {
    const f = fixture(t, {remote}); await finish(f.view.show());
    assert.equal(f.attaches().length, 1);
    for (let i = 0; i < 3; i++) await f.update({echo: 'next-' + i});
    await f.update({value: 7});
    assert.equal(f.attaches().length, 1);
    assert.ok(f.calls.filter(x => x.method === 'component.properties').length >= 4);
    assert.equal(f.root.document.getElementById('child').shadowRoot.querySelector('.child-value').textContent, '7');
    assert.deepEqual(f.lifetimes, ['child:attached', 'child:ready']);
  });
  test(mode + ' retries an unconfirmed logical attachment before caching success', async t => {
    let first = true;
    const f = fixture(t, {remote, intercept(message, run) {if (message.method === 'component.attach' && first) {first = false; return {attached: false};} return run();}});
    await finish(f.view.show()); assert.deepEqual(f.lifetimes, []);
    await f.update({echo: 'retry'}); assert.equal(f.attaches().length, 2);
    await f.update({echo: 'cached'}); assert.equal(f.attaches().length, 2);
    assert.deepEqual(f.lifetimes, ['child:attached', 'child:ready']);
  });
  test(mode + ' reports disconnection and reconnection even after a cached attachment', async t => {
    const f = fixture(t, {remote}); await finish(f.view.show());
    const page = f.root.document.querySelector('.weapp-page'); page.remove();
    await f.update({echo: 'detached'});
    f.root.document.getElementById('weapp-root').append(page);
    await f.update({echo: 'reconnected'}); await f.update({echo: 'steady'});
    assert.deepEqual(f.attaches().map(x => x.value.connected), [true, false, true]);
    assert.deepEqual(f.lifetimes, ['child:attached', 'child:ready']);
  });
}
test('an unresolved attachment still holds the parent render receipt', async t => {
  let release, started;
  const began = new Promise(resolve => {started = resolve;});
  const f = fixture(t, {remote: true, intercept(message, run) {
    if (message.method !== 'component.attach') return run();
    started(); return new Promise(resolve => {release = () => resolve(run());});
  }});
  const receipt = f.view.show(); let done = false;
  receipt.done.then(() => {done = true;});
  await began; assert.equal(done, false); assert.deepEqual(f.lifetimes, []);
  release(); await finish(receipt); assert.equal(done, true);
  await f.update({echo: 'after receipt'}); assert.equal(f.attaches().length, 1);
});
test('a new component instance must attach again after conditional destruction', async t => {
  const f = fixture(t, {remote: true}); await finish(f.view.show());
  const first = f.attaches()[0].value.id;
  await f.update({present: false}); await f.update({present: true});
  assert.equal(f.attaches().length, 2); assert.notEqual(f.attaches()[1].value.id, first);
  assert.deepEqual(f.lifetimes, ['child:attached', 'child:ready', 'child:detached', 'child:attached', 'child:ready']);
});
test('nested children preserve ancestor-first lifetimes and retain confirmed state', async t => {
  const f = fixture(t, {remote: true, nested: true}); await finish(f.view.show());
  assert.equal(f.lifetimes.filter(x => x === 'child:attached').length, 1);
  assert.equal(f.lifetimes.filter(x => x === 'leaf:attached').length, 1);
  const count = f.attaches().length;
  assert.ok(count >= 2);
  assert.ok(f.lifetimes.indexOf('child:attached') < f.lifetimes.indexOf('leaf:attached'), JSON.stringify(f.lifetimes));
  await f.update({echo: 'stable'}); await f.update({echo: 'stable again'});
  assert.equal(f.attaches().length, count);
});
