'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const directory=path.resolve(__dirname,'../packages/component-engine');
const runtime=require(directory),source=require(path.join(directory,'source'));
const codec={snapshot:value=>JSON.parse(JSON.stringify(value)),inputResult:value=>typeof value==='string'?value:undefined,limits:{nodes:12000}};

function temporary(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'now-component-package-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}

test('the component package loads from an isolated directory with no SDK or installed dependencies',t=>{
 const dir=temporary(t);fs.cpSync(directory,path.join(dir,'engine'),{recursive:true});
 const output=execFileSync(process.execPath,['-e',`
   const {createComponentEngine,ComponentError}=require('./engine');
   const engine=createComponentEngine(),behavior=engine.Behavior({data:{value:1}});
   const controller=engine.create({behaviors:[behavior]},'counter',{attached:()=>false},{},{},()=>{},()=>{});
   controller.instance.setData({value:2});
   if(controller.instance.data.value!==2)throw new Error('Component did not update');
   try{controller.instance.setData({'bad..path':3});throw new Error('Accepted invalid path');}
   catch(error){if(!(error instanceof ComponentError)||!(error instanceof Error)||error.code!=='INVALID_ARGUMENT')throw error;}
   controller.destroy();console.log('standalone core passed');
 `],{cwd:dir,encoding:'utf8'});
 assert.match(output,/standalone core passed/);
});

for(const [name,load]of [['CommonJS',()=>runtime],['embedded browser expression',()=>vm.runInNewContext(source(),{}, {timeout:2000})]]){
 test(name+' registry preserves identities and callback cancellation without any platform services',()=>{
  const core=load(),engine=core.createComponentEngine();
  const registry=core.createInstanceRegistry({engine,port:codec,usingComponents:{page:{counter:'counter'}},resolveComponent:()=>({data:{value:0}})});
  const pageObject={data:{},change(){}},page=registry.registerPage(pageObject,'page');
  const command=(id,method,value)=>registry.driver.request({version:1,ownerId:id,method,...(value===undefined?{}:{value})});
  const create=node=>command(page.id,'component.create',{nodeId:node,source:'counter',key:'stable',attrs:{},dataset:{}});
  const commit=(node,id)=>command(page.id,'tree.commit',{revision:1,nodes:[{nodeId:node,parentNodeId:null,componentId:id,tag:'counter',elementId:'counter',classes:[]}]});
  const child=create('old');commit('old',child.id);
  const instance=registry.select(page.id,'#counter',false);instance.setData({value:4});
  let callbacks=0;const token=registry.callback(child.id,()=>callbacks++);
  registry.driver.detach(page.id);registry.driver.reconnect(page.id);
  const rebound=create('new');commit('new',rebound.id);registry.driver.connected(page.id);
  assert.equal(rebound.id,child.id);assert.equal(registry.select(page.id,'#counter',false),instance);
  assert.equal(instance.data.value,4);command(child.id,'callback',{id:token});assert.equal(callbacks,1);
  assert.throws(()=>command(child.id,'callback',{id:token}),error=>error instanceof core.ComponentError&&error.code==='INSTANCE_CALLBACK');
  registry.destroy(page.id);assert.equal(registry.inspect().instances,0);
  assert.throws(()=>command(child.id,'data'),error=>error instanceof core.ComponentError&&error.code==='PAGE_UNLOADED');
 });
}

test('business return values keep their identity, including promises and thenable objects',()=>{
 const engine=runtime.createComponentEngine();
 const promise=Promise.resolve(1),thenable={then(){}};
 const exported=Object.defineProperty({},Symbol.toStringTag,{get(){throw new Error('An opaque export was inspected');}});
 const custom=engine.create({behaviors:['wx://component-export'],export(){return exported;}},'custom',{attached:()=>false},{},{},()=>{},()=>{});
 assert.equal(custom.exported(),exported);custom.destroy();
 const controller=engine.create({methods:{promise(){return promise;},thenable(){return thenable;},then(){}}},'counter',{attached:()=>false},{},{},()=>{},()=>{});
 assert.equal(controller.instance.promise(),promise);assert.equal(controller.instance.thenable(),thenable);
 assert.equal(controller.exported(),controller.instance);controller.destroy();
});

test('standalone component declarations compile with no DOM or SDK types',t=>{
 const dir=temporary(t),file=path.join(dir,'example.ts');
 fs.writeFileSync(file,`import {createComponentEngine,createInstanceRegistry,ComponentError,InstancePortCodec} from ${JSON.stringify(directory)};
const engine=createComponentEngine();
const component=engine.create({data:{value:1}},'counter',{attached:()=>false},{},{},()=>{},()=>{});
component.instance.setData({value:2});component.destroy();
const codec:InstancePortCodec={snapshot:<T>(value:T):T=>JSON.parse(JSON.stringify(value)),inputResult:()=>undefined,limits:{nodes:12000}};
const registry=createInstanceRegistry({engine,port:codec,usingComponents:{page:{counter:'counter'}},resolveComponent:()=>({})});
const page=registry.registerPage({data:{},change(){}},'page');registry.destroy(page.id);
const error:Error=new ComponentError('failed',{code:'INVALID_ARGUMENT'});
// @ts-expect-error component patch values must be JSON
component.instance.setData({value:()=>{}});
// @ts-expect-error a registry needs its validated port codec
createInstanceRegistry({engine,usingComponents:{},resolveComponent:()=>({})});
`);
 const config=path.join(dir,'tsconfig.json');
 fs.writeFileSync(config,JSON.stringify({compilerOptions:{strict:true,noEmit:true,target:'ES2020',module:'CommonJS',moduleResolution:'node',lib:['ES2020'],types:[]},files:[file]}));
 try{execFileSync(process.execPath,[path.resolve(__dirname,'../node_modules/typescript/lib/tsc.js'),'--project',config],{stdio:'pipe'});}catch(error){throw new Error(String(error.stdout||error.message));}
});
