'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const builtin=require('../packages/builtin-components'),source=require('../packages/builtin-components/source'),{fixture}=require('./helpers/dom.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(t,{serialized=false,handler,live=()=>true}={}){
 const f=fixture(t),events=[],calls=[];const element=f.document.createElement('div');f.document.body.append(element);
 let node={tag:'functional-page-navigator',attrs:{name:'loginAndGetUserInfo',args:{lang:'en'}}};
 const create=serialized?vm.runInNewContext(source(),{Error,Promise,Set,Map,WeakMap,JSON}):builtin.createBrowserComponents;
 const registry=create(f.root,{live,interactive:()=>true,node:()=>node,emit:(element,name,detail)=>events.push({name,detail}),functionalPage:value=>{calls.push(value);return handler?handler(value):Promise.resolve({code:'test-provider-code',userInfo:{nickName:'Fixture'}});}});
 registry.create(element,node);registry.attributes(element,undefined,node);
 return {...f,element,events,calls,registry,node,patch:attrs=>{const old=node.attrs;node={...node,attrs};registry.attributes(element,old,node);},activate:()=>registry.activate(element,node)};
}
for(const serialized of [false,true])test('functional-page-navigator '+(serialized?'serialized':'module')+' forwards args and emits success once',async t=>{
 const f=setup(t,{serialized});f.activate();f.activate();assert.equal(f.calls.length,1);await tick();assert.equal(f.events.length,1);assert.equal(f.events[0].name,'success');assert.equal(f.events[0].detail.code,'test-provider-code');assert.equal(f.element.getAttribute('aria-busy'),null);assert.equal(f.element.getAttribute('role'),'button');assert.equal(f.element.getAttribute('tabindex'),'0');
});
for(const name of ['requestPayment','chooseAddress','chooseInvoice','chooseInvoiceTitle'])test('functional-page-navigator delegates '+name+' to the injected host',async t=>{
 const f=setup(t,{handler:async value=>({result:value.name})});f.patch({name,version:'trial',args:{opaque:'host-contract'}});f.activate();await tick();assert.deepEqual(f.calls,[{name,version:'trial',args:{opaque:'host-contract'}}]);assert.equal(f.events[0].detail.result,name);
});
for(const [code,event]of [['CANCELLED','cancel'],['USER_CANCEL','cancel'],['PERMISSION_DENIED','fail'],['FUNCTIONAL_PAGE_UNAVAILABLE','fail']])test('functional-page-navigator maps '+code+' to '+event,async t=>{
 const f=setup(t,{handler:()=>Promise.reject(Object.assign(Error('provider rejected'),{code}))});f.activate();await tick();assert.equal(f.events[0].name,event);assert.equal(f.events[0].detail.code,code);assert.equal(f.events.length,1);
});
test('functional-page-navigator rejects invalid attributes before calling the service',async t=>{
 const f=setup(t);for(const attrs of [{name:'unknown'},{name:'chooseAddress',version:'bad'},{name:'chooseAddress',args:[]},{name:'chooseAddress',args:'{}'},{name:'chooseAddress',args:{value:'x'.repeat(65536)}}]){f.patch(attrs);f.activate();await tick();assert.equal(f.events.at(-1).name,'fail');assert.equal(f.events.at(-1).detail.code,'INVALID_ARGUMENT');}assert.equal(f.calls.length,0);
});
test('functional-page-navigator drops late results after removal, timeout and hidden activation',async t=>{
 let resolve;const f=setup(t,{handler:()=>new Promise(done=>resolve=done)});f.activate();f.registry.remove(f.element,f.node);resolve({code:'late'});await tick();assert.deepEqual(f.events,[]);assert.equal(f.timers.size,0);
 const g=setup(t,{handler:()=>new Promise(done=>resolve=done)});g.activate();[...g.timers.values()][0]();await tick();assert.equal(g.events[0].detail.code,'TIMEOUT');resolve({code:'late'});await tick();assert.equal(g.events.length,1);
 const h=setup(t,{live:()=>false});h.activate();assert.equal(h.calls.length,0);
});
test('functional-page-navigator compiler shares schema for names, args, version and result events',()=>{
 const compiler=require('../packages/template-compiler').createTemplateCompiler(builtin.createBuiltinCatalog()),diagnostics=[];
 compiler.compile('<functional-page-navigator name="loginAndGetUserInfo" args="{{options}}" version="develop" bind:success="done" bind:fail="failed" bind:cancel="cancelled"><button>Authorize</button></functional-page-navigator>','sample.wxml',(...args)=>diagnostics.push(args));assert.deepEqual(diagnostics,[]);
});
