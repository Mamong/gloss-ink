'use strict';
const core = require('@tingtalk/component-engine');
const builtin = require('@tingtalk/builtin-components');
const dom = require('@tingtalk/component-backend-dom');
const createWxsRuntime = require('@tingtalk/template-compiler/runtime');
const templates = require('./dist/templates.cjs');
const componentStyles = require('./dist/styles.json');
const protocol = dom.createViewProtocol();
const detached = [];
const commits = [];
const definition = {
  properties: {title: String},
  data: {count: 0, text: ''},
  options: {multipleSlots: true},
  methods: {
    input(event) { this.setData({text: event.detail.value}); },
    increment() {
      this.setData({count: this.data.count + 1}, () => commits.push(this.data.count));
      this.triggerEvent('changed', {count: this.data.count});
    },
    submit(event) { this.triggerEvent('changed', {submitted: event.detail.value.entry}); }
  },
  lifetimes: {detached() { detached.push(this.id); }}
};
const catalogMode = new URLSearchParams(location.search).has('catalog');
const catalogFixture = require('./catalog-fixture.cjs');
const route = catalogMode ? 'catalog' : 'page';
let view;
const page = {
  data: {title: 'Independent', banner: true, output: '', rows: [{id: 'a', title: 'Alpha'}, {id: 'b', title: 'Beta'}], choices: ['First', 'Second'], choice: 0, editorText: '', scrollTop: 0, scrollInto: '', listRows: Array.from({length: 60}, (_, id) => ({id, label: 'Item ' + id})), markers: [{id: 1, longitude: 20, latitude: 10, label: 'One'}]},
  change() { view?.schedule(); },
  changed(event) { this.data.output = JSON.stringify(event.detail); view.markChanges({output: this.data.output}); view.schedule(); },
  picked(event) { this.data.choice = event.detail.value; view.markChanges({choice: this.data.choice}); view.schedule(); },
  edited(event) { this.data.editorText = event.detail.text; },
  markerTap(event) { this.selectedMarker = event.detail.markerId; },
  activate() { this.activations = (this.activations || 0) + 1; },
  reverse() { this.data.rows.reverse(); view.markChanges({rows: this.data.rows}); view.schedule(); }
};
if (catalogMode) {
  page.data = {...catalogFixture.data};
  page.events = [];
  page.catalogSubmit = event => {page.submitted = event.detail.value;};
  page.catalogReset = () => {page.resets = (page.resets || 0) + 1;};
  page.catalogInput = event => {page.typed = event.detail.value;};
  page.catalogMemo = event => {page.typedMemo = event.detail.value;};
  page.catalogChange = event => {page.events.push({id: event.target.id, detail: event.detail});};
}
const usingComponents = {page: {counter: 'counter'}, counter: {}, catalog: {}};
const hostMessages = [];
const browserPlatform = {request(owner, method, value) {
  if (method === 'page.meta') {
    hostMessages.push(value);
    const title = value.window?.navigationBarTitleText;
    if (title !== undefined) document.title = title ?? 'Independent component system';
    return {};
  }
  if (method === 'camera.host' && value.method === 'release') return {};
  throw new core.ComponentError('Standalone host service is unavailable: ' + method, {code: 'HOST_UNAVAILABLE'});
}};
const registry = core.createInstanceRegistry({platform: browserPlatform, engine: core.createComponentEngine(), port: protocol,
  usingComponents, resolveComponent: () => definition});
const descriptor = registry.registerPage(page, route);
const backend = dom.createDomBackend({root: window, Error: core.ComponentError, instances: registry.driver,
  visual: registry.visual, viewProtocol: protocol, customEvents: new WeakMap(), config: {
    templates, usingComponents, assets: {}, componentOptions: {}, externalStyleRules: {}, componentStyles,
    styleTokens: {page: 'page', counter: 'counter', catalog: 'catalog'}, advancedComponents: true,
    componentViews: dom.createComponentViews, logicalEvents: core.createLogicalEvents,
    projectionPlanner: core.createProjectionPlanner, childReconciler: core.createChildReconciler, templateEvaluator: core.createTemplateEvaluator, builtinComponents: builtin.createBrowserComponents,
    interactions: builtin.createWeappInteractions, textInput: builtin.createTextInputRuntime,
    formRuntime: builtin.createFormRuntime, selectorQuery: dom.createSelectorQueryTools,
    componentSelector: core.createComponentSelector,
    pickerRuntime: builtin.createPickerRuntime, editorRuntime: builtin.createEditorRuntime,
    nativeComponents: builtin.createNativeComponents, interactiveComponents: builtin.createInteractiveComponents,
    layerComponents: builtin.createLayerComponents, virtualList: builtin.createVirtualLists,
    cameraRuntime: builtin.createCameraRuntime, keyboardAccessory: builtin.createKeyboardAccessoryRuntime,
    pageMeta: builtin.createPageMeta, backToTop: builtin.createBackToTop, matchMedia: builtin.matchesViewport,
    videoRuntime: builtin.createVideoRuntime, mapRuntime: builtin.createMapRuntime, accessibility: builtin.createAccessibility, wxsRuntime: createWxsRuntime
  }});
view = backend(descriptor.id, route);
const first = view.show();
window.acceptance = {hostMessages, observations: catalogMode ? catalogFixture.observations : undefined, page, registry, descriptor, view, commits, detached, first,
  child: () => registry.select(descriptor.id, '#counter', false),
  update(patch) { Object.assign(page.data, patch); view.markChanges(patch); return view.render(); },
  destroy() { registry.destroy(descriptor.id); document.getElementById('weapp-root').replaceChildren(); }
};
