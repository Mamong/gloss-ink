'use strict';
// The host supplies the operation. This controller owns activation and result
// events only; it never fabricates identity, payment or address results.
function createFunctionalPageNavigator(root, options = {}) {
  const records = new WeakMap();
  const names = new Set(['loginAndGetUserInfo', 'requestPayment', 'chooseAddress', 'chooseInvoice', 'chooseInvoiceTitle']);
  const versions = new Set(['release', 'trial', 'develop']);
  const live = record => records.get(record.element) === record && options.live?.() !== false && options.interactive?.(options.node?.(record.element) || record.node) !== false;
  function send(record, name, detail) { if (live(record)) options.emit?.(record.element, name, detail); }
  function invalid(message) { throw Object.assign(new Error(message), {code: 'INVALID_ARGUMENT'}); }
  function input(attrs) {
    const name = attrs.name, version = attrs.version === undefined ? 'release' : attrs.version;
    if (!names.has(name)) invalid('functional-page-navigator.name 无效');
    if (!versions.has(version)) invalid('functional-page-navigator.version 需要 release、trial 或 develop');
    const args = attrs.args === undefined || attrs.args === '' ? {} : attrs.args;
    if (!args || typeof args !== 'object' || Array.isArray(args)) invalid('functional-page-navigator.args 需要对象');
    const encoded = JSON.stringify(args);
    if (encoded.length > 65536) invalid('functional-page-navigator.args 超过 64 KiB');
    return {name, version, args: JSON.parse(encoded)};
  }
  function create(element, node) {
    records.set(element, {element, node, busy: false, revision: 0});
    element.setAttribute('role', 'button'); element.setAttribute('tabindex', '0');
  }
  function attributes(element, next, old, node) {
    const record = records.get(element); if (record) record.node = node;
  }
  function activate(element) {
    const record = records.get(element);
    if (!record || record.busy || !live(record)) return;
    record.busy = true; element.setAttribute('aria-busy', 'true');
    const revision = ++record.revision;
    let timer;
    function finish(name, detail) {
      if (record.revision !== revision || !record.busy) return;
      root.clearTimeout(timer); record.busy = false; element.removeAttribute('aria-busy');
      send(record, name, detail);
    }
    try {
      const value = input(record.node.attrs);
      if (typeof options.functionalPage !== 'function') throw Object.assign(new Error('当前宿主没有功能页服务'), {code: 'FUNCTIONAL_PAGE_UNAVAILABLE'});
      timer = root.setTimeout(() => finish('fail', {errMsg: 'functional-page-navigator:fail timeout', code: 'TIMEOUT'}), 65000);
      Promise.resolve(options.functionalPage(value)).then(result => {
        if (!result || typeof result !== 'object' || Array.isArray(result)) throw Object.assign(new Error('功能页返回值无效'), {code: 'INVALID_RESPONSE'});
        finish('success', result);
      }).catch(error => finish(error?.code === 'CANCELLED' || error?.code === 'USER_CANCEL' ? 'cancel' : 'fail', {errMsg: 'functional-page-navigator:fail ' + (error?.message || 'operation failed'), code: error?.code || 'FUNCTIONAL_PAGE_FAILED'}));
    } catch (error) { finish('fail', {errMsg: 'functional-page-navigator:fail ' + error.message, code: error.code || 'INVALID_ARGUMENT'}); }
    record.cancel = () => { ++record.revision; record.busy = false; root.clearTimeout(timer); };
  }
  function remove(element) { const record = records.get(element); record?.cancel?.(); records.delete(element); }
  return {create, attributes, activate, remove};
}
module.exports = createFunctionalPageNavigator;
