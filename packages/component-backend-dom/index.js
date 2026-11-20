'use strict';
module.exports = Object.freeze({
  // DOM factories use an injected protocol; load the compatibility entry only when requested.
  get createViewProtocol() {return require('./protocol');},
  createSelectorQueryTools: require('./selector-query'),
  createDomBackend: require('./driver'),
  createComponentViews: require('./events')
});
