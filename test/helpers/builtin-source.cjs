'use strict';
const units = require('../../packages/component-backend').createRpxUnits;
const ui = require('../../packages/builtin-components');
const factories = {
  'weapp-interactive-components.js': ui.createInteractiveComponents,
  'weapp-editor.js': ui.createEditorRuntime,
  'weapp-page-meta.js': ui.createPageMeta,
  'weapp-keyboard-accessory.js': ui.createKeyboardAccessoryRuntime,
  'weapp-virtual-list.js': ui.createVirtualLists,
  'weapp-accessibility.js': ui.createAccessibility,
  'selector-query.js': require('../../packages/component-backend-dom').createSelectorQueryTools
};
function readSource(name) {
  const factory = factories[name];
  if (!factory) throw new Error('Unknown builtin test source: ' + name);
  return '(function(){const createRpxUnits=(' + units.toString() + ');return (' + factory.toString() + ');})()';
}
module.exports = {readSource};
