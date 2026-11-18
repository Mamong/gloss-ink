import * as core from '@tingtalk/component-engine';
import * as builtin from '@tingtalk/builtin-components';
import * as dom from '@tingtalk/component-backend-dom';
import createWxsRuntime = require('@tingtalk/template-compiler/runtime');
import {createTemplateCompiler} from '@tingtalk/template-compiler';
import {createStylesheetCompiler} from '@tingtalk/stylesheet-compiler';

const schema = builtin.createBuiltinCatalog();
createTemplateCompiler(schema).compile('<view/>', 'page.wxml', () => {});
createStylesheetCompiler({tags: schema.tags});
const protocol = dom.createViewProtocol();
const registry = core.createInstanceRegistry({engine: core.createComponentEngine(), port: protocol,
  usingComponents: {page: {}}, resolveComponent: () => ({})});
const config: dom.DomBackendConfig = {
  templates: {page: () => []}, usingComponents: {page: {}}, assets: {}, componentOptions: {},
  componentStyles: {}, styleTokens: {page: 'page'}, externalStyleRules: {},
  componentViews: dom.createComponentViews, logicalEvents: core.createLogicalEvents,
  projectionPlanner: core.createProjectionPlanner, childReconciler: core.createChildReconciler, templateEvaluator: core.createTemplateEvaluator, builtinComponents: builtin.createBrowserComponents,
  interactions: builtin.createWeappInteractions, textInput: builtin.createTextInputRuntime,
  formRuntime: builtin.createFormRuntime, selectorQuery: dom.createSelectorQueryTools,
  componentSelector: core.createComponentSelector,
  pickerRuntime: builtin.createPickerRuntime, editorRuntime: builtin.createEditorRuntime,
  nativeComponents: builtin.createNativeComponents, interactiveComponents: builtin.createInteractiveComponents,
  layerComponents: builtin.createLayerComponents, virtualList: builtin.createVirtualLists,
  webViewRuntime: builtin.createWebViewRuntime, cameraRuntime: builtin.createCameraRuntime, keyboardAccessory: builtin.createKeyboardAccessoryRuntime,
  pageMeta: builtin.createPageMeta, backToTop: builtin.createBackToTop, matchMedia: builtin.matchesViewport,
  videoRuntime: builtin.createVideoRuntime, mapRuntime: builtin.createMapRuntime, accessibility: builtin.createAccessibility, wxsRuntime: createWxsRuntime
};
const backend = dom.createDomBackend({root: window, config, instances: registry.driver,
  visual: registry.visual, viewProtocol: protocol});
const view = backend('p1', 'page');
view.schedule(1);
// @ts-expect-error scheduling accepts a registry token, not a function
view.schedule(() => {});
// @ts-expect-error a DOM backend needs explicit compiled templates and services
const invalid: dom.DomBackendConfig = {};
// @ts-expect-error component mappings contain source IDs
config.usingComponents = {page: {counter: 42}};
// @ts-expect-error a placement requires a concrete mount
backend('p1', 'page', {visible: true});

const previous = [{tag: 'view', identity: '/a', value: 1}] as const;
const plan = core.createChildReconciler().plan(previous, previous);
const retained: number | undefined = plan.entries[0].previous?.value;
const evaluator = core.createTemplateEvaluator([{kind: 'text', value: () => 'independent'}]);
const expanded: core.ExpandedNode[] = evaluator.evaluate({}).nodes;
// @ts-expect-error platform policies must return an explicit policy object
core.createTemplateEvaluator([], {element: () => false});
// @ts-expect-error compiled templates use a known node kind
core.createTemplateEvaluator([{kind: 'unknown'}]);

const nativeController = builtin.createNativeComponents(window, {Error, live: () => true, emit() {}, asset: value => value, find: () => undefined});
nativeController.visibility(false); nativeController.dispose();
const editor = builtin.createEditorRuntime(window, {Error, scope: 'example', live: () => true, emit() {}, asset: value => value, createContext: execute => ({execute})});
editor.execute('node', 'getContents'); editor.dispose();
// @ts-expect-error resources must resolve to strings
builtin.createNativeComponents(window, {Error, live: () => true, emit() {}, asset: () => 42, find: () => undefined});
// @ts-expect-error a camera requires an explicit host authority
builtin.createCameraRuntime(window, {Error, live: () => true, emit() {}});
// @ts-expect-error editor operations have a defined command set
editor.execute('node', 'privateSdkMethod');
const viewport: boolean = builtin.matchesViewport({'min-width': 0}, 320, 640, Error);

const eventTools = dom.createComponentViews(window, core.createLogicalEvents());
const routedInteractions = config.interactions(window, {Error, path: eventTools.path,
  emit(node, name, detail, original) { return eventTools.route(node, name, detail, {}, original); }});
declare const node: dom.DomElementEventNode;
routedInteractions.create(document.createElement('div'), node, 'owner');
const textController = config.textInput<dom.DomEventNode>(window, {Error, scope: 'owner', styleRoot: document.head,
  style: String, classes: String, live: candidate => routedInteractions.live(candidate), emit() {},
  invalidate(candidate) {candidate.viewNodeId;}, height: () => ''});
textController.patch(node.element, node);
const queryTools = config.selectorQuery();
const connectedEditor = config.editorRuntime!(window, {Error, scope: 'owner', live: () => true, emit() {},
  asset: value => value, createContext: execute => queryTools.editorContext(execute)});
connectedEditor.dispose();
// @ts-expect-error editor and picker require different service options and return ports
config.pickerRuntime = builtin.createEditorRuntime;
// @ts-expect-error a runtime must expose its submission-independent lifecycle and operations
config.videoRuntime = () => ({});
// @ts-expect-error logical routing requires key and route as well as path
config.logicalEvents = () => ({path: () => []});
// @ts-expect-error physical event tools require their complete backend port
config.componentViews = () => ({});
// @ts-expect-error query factories must provide the defined query and editor ports
config.selectorQuery = () => ({});
// @ts-expect-error templates return known compiled node kinds
config.templates = {page: () => [{kind: 'missing'}]};
// @ts-expect-error WXS runtimes must provide bounded value/call/reset/inspection ports
config.wxsRuntime = () => ({});
// @ts-expect-error region data is explicit named entries rather than strings
config.regionData = ['wrong'];
// @ts-expect-error editor context operations use their defined command set
queryTools.editorContext((command: 'privateSdkMethod') => ({}));
// @ts-expect-error selectors require string values
queryTools.selector(42);

// @ts-expect-error factory inputs are service ports rather than an SDK object
config.textInput = (root, options: {sdk: object}) => {throw new Error();};
// @ts-expect-error controller factories still require an asynchronous host response port
config.cameraRuntime!(window, {Error, live: () => true, emit() {}, host: () => 42});
const drawing = queryTools.canvasContext(() => document.createElement('canvas'));
drawing.setFontSize(12); drawing.fillText('typed', 0, 12);
// @ts-expect-error drawing operations retain their numeric argument contract
drawing.setFontSize('large');
// @ts-expect-error an absent local resolver requires a remote execution port
queryTools.canvasContext(null);
const batch = queryTools.create({scope: 'owner', live: () => true, execute: () => []});
batch.select('#entry').fields({id: true, computedStyle: ['color']}).exec();
// @ts-expect-error query field flags are booleans
batch.select('#entry').fields({rect: 'yes'});

// @ts-expect-error view operations use the controller's command set
view.video('privateSdkMethod');
// @ts-expect-error view queries use structured operations rather than arbitrary values
view.query('selector');
const logicOnly = protocol.createLogic({id: 'logic', route: 'page', data: {}, send() {}});
logicOnly.destroy();
// @ts-expect-error render hooks return completion rather than arbitrary scalar values
protocol.connect({id: 'view', route: 'page', data: {}, render: () => 42});

const pageResources: dom.DomBackendConfig = {...config, pageResources: {acquire(entry) {entry.template.toUpperCase(); return () => {};}}, pageEntries: {page: {route: 'page', template: 'page', styles: 'page'}}};
// @ts-expect-error a page resource lease requires the entries supplied to it
const missingEntries: dom.DomBackendConfig = {...config, pageResources: {acquire: () => () => {}}};
// @ts-expect-error resource entries reference route, template and stylesheet identities
const incompleteEntries: dom.DomBackendConfig = {...config, pageEntries: {page: {route: 'page'}}};

const browserComponents = config.builtinComponents(window, {node: () => node, interactive: candidate => routedInteractions.live(candidate)});
browserComponents.attributes(node.element, undefined, node);
queryTools.measure(window, document.body, [{selector: null, viewport: true, all: false, fields: {size: true}}]);
// @ts-expect-error measurement queries provide fields or explicitly request a node
view.query([{selector: '#entry', viewport: false, all: false}]);
// @ts-expect-error viewport queries use a null selector
view.query([{selector: '#entry', viewport: true, all: false, fields: {size: true}}]);

// @ts-expect-error compiled event bindings explicitly distinguish capture from bubble delivery
config.templates = {page: () => [{kind: 'element', tag: 'view', attrs: {}, events: [{name: 'tap', value: () => 'handle'}], nodes: []}]};

const range = eventTools.range();
const virtualNode: dom.DomEventNode = {tag: 'virtual-host', attrs: {}, element: range,
  eventView: {live: () => true, classes: String, send(source, binding, detail, target, original) {source.viewNodeId; target.element; original.touches?.[0]?.clientX;}, special() {}, detail: () => ({})},
  children: [{tag: '#text', text: 'projected text', element: document.createTextNode('projected text')}]};
eventTools.bind(range, virtualNode);
const virtualPath: dom.DomEventNode[] = eventTools.path(virtualNode);
