"use strict";
module.exports = Object.freeze({
  createTemplateEvaluator: require('./template'),
  createChildReconciler: require('./reconciliation'),
  createLogicalEvents: require('./events'),
  createProjectionPlanner: require('./projection'),
  createViewConnection: require('./view-connection'),
  ComponentError: require('./error'),
  createDataTools: require('./data'),
  createBehaviorEngine: require('./behaviors'),
  createComponentSelector: require('./selectors'),
  createComponentEngine: require('./components'),
  createInstanceRegistry: require('./instances'),
});
