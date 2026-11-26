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
function fixture(t, {remote = false, intercept, nested = false, pageTemplate} = {}) {
  const browser = new JSDOM('<main id="weapp-root"></main>'), root = browser.window;
  root.scrollTo = () => {};
  const templates = {};
  for (const [route, template] of Object.entries({
    page: pageTemplate ?? '<view><bench wx:if="{{present}}" id="child" value="{{value}}"/><text id="echo">{{echo}}</text></view>',
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
    calls.push({ownerId: message.ownerId, method: message.method, value: message.value});
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
  return {root, view, update, lifetimes, registry, calls, page, pageObject, backend, commits: () => calls.filter(x => x.method === 'tree.commit'), attaches: () => calls.filter(x => x.method === 'component.attach')};
}
for (const remote of [false, true]) {
  const mode = remote ? 'asynchronous remote port' : 'synchronous local port';
  test(mode + ' reuses acknowledged topology while refreshing data and child text', async t => {
    const f = fixture(t, {remote}); await finish(f.view.show());
    const count = f.commits().length; assert.ok(count >= 2);
    await f.update({echo: 'changed'}); await f.update({value: 8});
    assert.equal(f.commits().length, count);
    assert.ok(f.calls.filter(x => x.method === 'component.properties').length >= 2);
    assert.equal(f.root.document.querySelector('#echo').textContent, 'changed');
    assert.equal(f.root.document.querySelector('#child').shadowRoot.querySelector('.child-value').textContent, '8');
    assert.deepEqual(f.lifetimes, ['child:attached', 'child:ready']);
  });
  test(mode + ' commits ID and class changes and preserves component selectors', async t => {
    const f = fixture(t, {remote, pageTemplate: '<view><bench id="{{nodeId}}" class="{{classes}}" value="{{value}}"/></view>'});
    Object.assign(f.pageObject.data, {nodeId: 'before', classes: 'a'}); await finish(f.view.show());
    const child = f.registry.select(f.page.id, '#before', false), count = f.commits().length;
    await f.update({nodeId: 'after', classes: 'b c'});
    assert.equal(f.commits().length, count + 1);
    assert.equal(f.registry.select(f.page.id, '#before', false), null);
    assert.equal(f.registry.select(f.page.id, '.b.c', false), child);
    await f.update({value: 9}); assert.equal(f.commits().length, count + 1);
  });
  for (const acknowledgment of ['missing', 'wrong revision']) {
    test(mode + ' retries a topology with ' + acknowledgment + ' acknowledgment', async t => {
      const f = fixture(t, {remote, pageTemplate: '<text>{{echo}}</text>', intercept(message, run) {
        const reply = run(); return message.method === 'tree.commit' && message.value.revision === 1 ? (acknowledgment === 'missing' ? {} : {revision: 999}) : reply;
      }});
      await finish(f.view.show()); assert.equal(f.commits().length, 1);
      await f.update({echo: 'retry'}); assert.equal(f.commits().length, 2);
      await f.update({echo: 'cached'}); assert.equal(f.commits().length, 2);
      assert.deepEqual(f.commits().map(x => x.value.revision), [1, 2]);
    });
  }
  test(mode + ' commits conditional destruction and replacement component identity', async t => {
    const f = fixture(t, {remote}); await finish(f.view.show());
    const first = f.registry.select(f.page.id, '#child', false), count = f.commits().length;
    await f.update({present: false}); assert.equal(f.registry.select(f.page.id, '#child', false), null);
    await f.update({present: true}); assert.notEqual(f.registry.select(f.page.id, '#child', false), first);
    assert.ok(f.commits().length >= count + 3);
    assert.deepEqual(f.lifetimes, ['child:attached', 'child:ready', 'child:detached', 'child:attached', 'child:ready']);
  });
  test(mode + ' preserves a move notification when physical order repairs to the same topology', async t => {
    const f = fixture(t, {remote, pageTemplate: '<view><text id="a">{{echo}}</text><text id="b">B</text></view>'});
    await finish(f.view.show()); const before = f.commits()[0].value.nodes;
    const a = f.root.document.querySelector('#a'), b = f.root.document.querySelector('#b'); a.parentNode.insertBefore(b, a);
    await f.update({echo: 'repair'});
    assert.equal(f.commits().length, 2); assert.deepEqual(f.commits()[1].value.nodes, before);
    assert.ok(f.commits()[1].value.moved.length > 0);
    await f.update({echo: 'steady'}); assert.equal(f.commits().length, 2);
  });
}
test('pending tree acknowledgments retain the parent receipt and ready lifecycle', async t => {
  let release, started;
  const began = new Promise(resolve => {started = resolve;});
  const f = fixture(t, {remote: true, intercept(message, run) {
    if (message.method !== 'tree.commit' || message.value.revision !== 1 || release) return run();
    started(); return new Promise(resolve => {release = () => resolve(run());});
  }});
  const receipt = f.view.show(); let settled = false; receipt.done.then(() => {settled = true;});
  await began; assert.equal(settled, false); assert.deepEqual(f.lifetimes, []);
  release(); await finish(receipt); assert.equal(settled, true);
  assert.deepEqual(f.lifetimes, ['child:attached', 'child:ready']);
});
test('a newly created view sends topology even for an empty tree', async t => {
  const f = fixture(t, {remote: true, pageTemplate: ''});
  // Use a node-free conditional tree so the first empty topology must be acknowledged.
  f.pageObject.data.present = false;
  await finish(f.view.show()); const before = f.commits().length;
  await finish(f.view.destroy());
  const page = f.registry.registerPage({data: {present: false}}, 'page'), replacement = f.backend(page.id, 'page');
  t.after(async () => {await finish(replacement.destroy()); f.registry.destroy(page.id);});
  await finish(replacement.show()); assert.ok(f.commits().length > before);
  assert.equal(f.commits().filter(x => x.ownerId === page.id)[0].value.revision, 1);
});
test('setData callback observes updated child DOM when topology is reused', async t => {
  const f = fixture(t, {remote: true}); await finish(f.view.show()); const before = f.commits().length;
  const child = f.registry.select(f.page.id, '#child', false);
  const observed = await new Promise(resolve => child.setData({value: 42}, () => resolve(f.root.document.querySelector('#child').shadowRoot.querySelector('.child-value').textContent)));
  assert.equal(observed, '42'); assert.equal(f.commits().length, before);
});
test('nested child renders preserve properties and attached ordering with cached trees', async t => {
  const f = fixture(t, {remote: true, nested: true}); await finish(f.view.show()); const before = f.commits().length;
  await f.update({value: 4}); await f.update({echo: 'again'});
  assert.equal(f.commits().length, before);
  assert.ok(f.lifetimes.indexOf('child:attached') < f.lifetimes.indexOf('leaf:attached'));
  assert.equal(f.lifetimes.filter(x => x === 'leaf:ready').length, 1);
});
