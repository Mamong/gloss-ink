'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
for(const mode of ['module','serialized'])test('navigator delegates owning page and plugin component scope in '+mode,()=>{
 const core=mode==='module'?require('../packages/component-engine'):vm.runInNewContext(require('../packages/component-engine/source')()),calls=[];
 const page={data:{}},registry=core.createInstanceRegistry({engine:core.createComponentEngine(),port:{snapshot:value=>JSON.parse(JSON.stringify(value)),inputResult:value=>value,limits:{nodes:12000}},usingComponents:{'application/page':{entry:'plugins/p/entry'}},resolveComponent:()=>({}),platform:{navigate(attrs,scope){calls.push({attrs,scope});return {accepted:scope.source};}}});
 const owner=registry.registerPage(page,'application/page');
 const child=registry.driver.request({version:1,ownerId:owner.id,method:'component.create',value:{source:'plugins/p/entry',nodeId:'n1',key:'entry',attrs:{},dataset:{}}});
 for(const entry of [owner,child]){
  const result=registry.driver.request({version:1,ownerId:entry.id,method:'event',value:{binding:{name:'tap',handler:'@navigate',args:{url:'plugin://p/detail'}},event:{type:'tap'}}});
  assert.equal(result.accepted,entry.source);assert.equal(calls.at(-1).scope.page,page);assert.equal(calls.at(-1).scope.kind,entry.kind);assert.equal(calls.at(-1).scope.live(),true);assert.equal(calls.at(-1).attrs.url,'plugin://p/detail');
 }
 registry.destroy(owner.id);assert.equal(calls[0].scope.live(),false);assert.equal(calls[1].scope.live(),false);
});
