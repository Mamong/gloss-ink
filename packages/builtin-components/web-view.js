function createWebViewRuntime(root, options) {
  'use strict';
  const records = new Map();
  let visible = false;
  function patch(element, node) {
    if (!records.has(element)) return;
    if (typeof node.attrs.src !== 'string' && node.attrs.src !== undefined) throw new options.Error('web-view.src需要字符串', {code: 'INVALID_ARGUMENT'});
    element.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:white;';
    element.setAttribute('aria-label', '网页');
    const value = {nodeId: node.viewNodeId, src: node.attrs.src || '', visible,
      id: String(node.attrs.id || ''), dataset: node.dataset,
      events: node.events.filter(event => ['message', 'load', 'error'].includes(event.name)).map(event=>({name:event.name,handler:event.handler}))};
    records.set(element, value);
    return options.request('webview.update', value);
  }
  return {
    create(element, tag) { if (tag === 'web-view') records.set(element, null); }, patch,
    remove(element) { const value = records.get(element); records.delete(element); if (value) return options.request('webview.remove', {nodeId: value.nodeId}); },
    visibility(value) { visible = value; },
    dispose() { records.clear(); }
  };
}
module.exports = createWebViewRuntime;
