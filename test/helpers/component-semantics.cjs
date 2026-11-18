'use strict';
const vm=require('node:vm');
const core=require('../../packages/component-engine');
const source=require('../../packages/component-engine/source');
const dataCases=require('./component-semantic-cases.cjs').cases;
const extensionCases=require('./component-extension-cases.cjs').cases;
const treeCases=require('./component-tree-event-cases.cjs').cases;
const dataAdapter=require('./component-semantic-adapters.cjs').current;
const extensionAdapter=require('./component-extension-adapters.cjs').current;
const treeAdapter=require('./component-tree-event-adapters.cjs').current;
function load(mode='CommonJS') {
 if(mode==='CommonJS')return core;
 if(mode==='embedded')return vm.runInNewContext(source(),{}, {timeout:2000});
 throw new Error('Unknown component runtime mode: '+mode);
}
function observations(mode='CommonJS') {
 const runtime=load(mode),data=dataAdapter(runtime),extensions=extensionAdapter(runtime);
 try {
  return {data:dataCases(data.create),extensions:extensionCases(extensions),treeEvents:treeCases(treeAdapter(runtime))};
 }finally{data.dispose();extensions.dispose();}
}
module.exports={load,observations,modes:['CommonJS','embedded']};
