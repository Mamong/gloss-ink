'use strict';
const {JSDOM} = require('jsdom');
function createDom() {return new JSDOM('<!doctype html><html><head></head><body></body></html>').window.document;}
function fixture(t) {
  const document = createDom(), root = document.defaultView, timers = new Map();
  let sequence = 0;
  root.setTimeout = callback => {const id = ++sequence; timers.set(id, callback); return id;};
  root.clearTimeout = id => timers.delete(id);
  t.after(() => {timers.clear(); root.close();});
  return {document, root, timers};
}
module.exports = {createDom, fixture};
