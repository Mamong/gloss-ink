'use strict';
// Test-only logic worker. The renderer is an explicit deferred-receipt backend.
const {workerData, threadId, isMainThread} = require('node:worker_threads');
const vm = require('node:vm');
if (isMainThread) throw new Error('Component worker fixture must run in a real Worker');
const port = workerData.port;
const core = workerData.mode === 'embedded'
  ? vm.runInNewContext(require('../../packages/component-engine/source')(), {}, {timeout: 2000})
  : require('../../packages/component-engine');
const engine = core.createComponentEngine();
const trace = [], destroyed = [], pending = new Map(), remembered = new Map();
let serial = 0, nextReceipt = 0, changes = 0;
const record = (type, instance, label) => trace.push({type, serial: instance?._serial, label, threadId});
const codec = {snapshot: value => JSON.parse(JSON.stringify(value)), inputResult: value => typeof value === 'string' ? value : undefined, limits: {nodes: 12000}};
const registry = core.createInstanceRegistry({
  engine, port: codec, usingComponents: {page: {counter: 'counter'}},
  resolveComponent: () => ({
    data: {value: 0, nested: {value: 1}},
    methods: {emit(event) {this.triggerEvent('change', event.detail, {bubbles: true, composed: true});}},
    lifetimes: {
      created() {this._serial = ++serial; record('created', this);},
      attached() {record('attached', this);}, ready() {record('ready', this);}, detached() {record('detached', this);},
    },
    pageLifetimes: {hide() {record('hide', this);}, show() {record('show', this);}},
  }),
});
const page = registry.registerPage({data: {}, change() {changes++;}}, 'page');
const request = (ownerId, method, value) => registry.driver.request({version: 1, ownerId, method, ...(value === undefined ? {} : {value})});
function backend(ownerId) {
  return {
    ownerId,
    render() {
      if (this.ownerId !== ownerId) throw new Error('Backend receiver was lost');
      const receiptId = ++nextReceipt;
      let resolve, reject;
      const done = new Promise((yes, no) => {resolve = yes; reject = no;});
      pending.set(receiptId, {ownerId, resolve, reject});
      port.postMessage({type: 'render', receiptId, ownerId, data: request(ownerId, 'data'), threadId});
      return {settled: false, done};
    },
    markChanges() {if (this.ownerId !== ownerId) throw new Error('Backend receiver was lost');},
    dispatch(event) {port.postMessage({type: 'event', ownerId, event, threadId});},
    destroy() {
      if (this.ownerId !== ownerId) throw new Error('Backend receiver was lost');
      destroyed.push(ownerId);
      // Resource cancellation belongs to this injected backend, not to a built-in transport.
      for (const [id, receipt] of pending) if (receipt.ownerId === ownerId) {
        pending.delete(id);
        receipt.reject(new core.ComponentError('Test backend disposed', {code: 'PAGE_UNLOADED'}));
      }
    },
  };
}
registry.driver.connect(page.id, backend(page.id));
function selected(selector) {
  const instance = registry.select(page.id, selector, false);
  if (!instance) throw new core.ComponentError('Test selection is empty', {code: 'INSTANCE_SCOPE'});
  return instance;
}
function inspect() {
  return {pageId: page.id, threadId, mode: workerData.mode, changes,
    registry: registry.inspect(), trace, destroyed,
    pending: [...pending].map(([receiptId, value]) => ({receiptId, ownerId: value.ownerId})),
  };
}
async function handle(method, value = {}) {
  switch (method) {
    case 'request': return registry.driver.request(value);
    case 'connect': registry.driver.connect(value.id, backend(value.id)); return {};
    case 'update':
      for (const patch of value.patches) {
        const instance = selected(value.selector);
        instance.setData(patch.changes, function () {record('callback', this, patch.label);});
      }
      return {};
    case 'private': return {serial: selected(value.selector)._serial};
    case 'remember': remembered.set(value.key, selected(value.selector)); return {};
    case 'same': return remembered.get(value.key) === selected(value.selector);
    case 'token': return registry.callback(value.id, function () {record('token', this, value.label);});
    case 'detach': return registry.driver.detach(value.id);
    case 'reconnect': registry.driver.reconnect(value.id); return {};
    case 'connected': return registry.driver.connected(value.id);
    case 'snapshot': return registry.snapshot(value.id);
    case 'restore': registry.restore(value.id, value.snapshot); return {};
    case 'ack': {
      const receipt = pending.get(value.receiptId);
      if (!receipt) return {accepted: false};
      pending.delete(value.receiptId); receipt.resolve(); return {accepted: true};
    }
    case 'destroy': registry.destroy(value.id); return {};
    case 'inspect': return inspect();
    case 'shutdown': registry.destroy(page.id); remembered.clear(); return inspect();
    default: throw new core.ComponentError('Unknown test worker method', {code: 'UNKNOWN_METHOD'});
  }
}
port.on('message', message => {
  // Calls must interleave: an attach RPC can await a receipt acknowledged by a later RPC.
  Promise.resolve().then(() => handle(message.method, message.value)).then(
    value => port.postMessage({type: 'result', id: message.id, value}),
    error => port.postMessage({type: 'result', id: message.id, error: {name: error.name, message: error.message, code: error.code}}),
  );
});
