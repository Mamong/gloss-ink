'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const source=path.resolve(__dirname,'../packages');
const core=require(path.join(source,'component-engine')),ui=require(path.join(source,'builtin-components')),dom=require(path.join(source,'component-backend-dom'));
const {createDom}=require('./helpers/dom.cjs');
function temporary(t){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'now-component-toolchain-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));return directory;}

test('the six modules load from isolated copies and compilers need no SDK or backend',t=>{
 const directory=temporary(t),modules=['component-engine','component-backend','component-backend-dom','builtin-components','template-compiler','stylesheet-compiler'];
 for(const name of modules)fs.cpSync(path.join(source,name),path.join(directory,name),{recursive:true});
 fs.mkdirSync(path.join(directory,'node_modules/@tingtalk'),{recursive:true});
 fs.symlinkSync(path.join(directory,'component-backend'),path.join(directory,'node_modules/@tingtalk/component-backend'),'dir');
 for(const name of ['acorn','postcss','postcss-selector-parser','postcss-value-parser','less']){let location=path.dirname(require.resolve(name));while(!fs.existsSync(path.join(location,'package.json'))||JSON.parse(fs.readFileSync(path.join(location,'package.json'),'utf8')).name!==name){const parent=path.dirname(location);if(parent===location)throw new Error('Package root missing: '+name);location=parent;}fs.mkdirSync(path.join(directory,'node_modules'),{recursive:true});fs.symlinkSync(location,path.join(directory,'node_modules',name),'dir');}
 const script=`
 const assert=require('node:assert/strict');
 const schema=require('./builtin-components').createBuiltinCatalog();
 const template=require('./template-compiler').createTemplateCompiler(schema),styles=require('./stylesheet-compiler').createStylesheetCompiler({tags:schema.tags});
 const diagnostics=[];const fail=(...value)=>diagnostics.push(value);
 const code=template.compile('<view><icon type="success"/></view>','page.wxml',fail);
 assert.equal(typeof code,'string');assert.ok(code.includes('icon'));
 const css=styles.compile(['page.wxss'],()=>'.badge { width: 20rpx; } icon { color: red; }',()=>'',fail,'[data-page]');
 assert.ok(css.includes('var(--weapp-rpx)'));assert.ok(css.includes('weapp-icon'));assert.equal(diagnostics.length,0);
 const fresh=require('./template-compiler').createTemplateCompiler({...schema,tags:['view']});
 fresh.compile('<icon/>','restricted.wxml',fail);assert.equal(diagnostics.some(row=>row[1]==='WXML_COMPONENT'),true);
 assert.equal(typeof require('./component-backend-dom').createDomBackend,'function');
 assert.equal(new (require('./component-engine').ComponentError)('test') instanceof Error,true);
 console.log('isolated modules passed');`;
 assert.match(execFileSync(process.execPath,['-e',script],{cwd:directory,env:{...process.env,NODE_PATH:''},encoding:'utf8'}),/isolated modules passed/);
});

test('slot planning preserves the newest owner when an obsolete slot releases a replaced record',()=>{
 const planner=core.createProjectionPlanner(),first={attrs:{name:'head'}},second={attrs:{name:'tail'}},key={};
 const previous={attrs:{slot:'head'},key},updated={attrs:{slot:'tail'},key},unmatched={attrs:{slot:'unknown'},key:{}};
 planner.prepare([updated,unmatched]);assert.equal(unmatched.projectedParent,null);
 const head=planner.assign(first,[updated,unmatched],[previous],node=>node.key);assert.deepEqual(head.assigned,[]);assert.deepEqual(head.released,[previous]);
 const tail=planner.assign(second,[updated,unmatched],[],node=>node.key);planner.link(second,tail.assigned);
 assert.equal(planner.release(previous,first,updated),false);assert.equal(updated.projectedParent,second);
 assert.equal(planner.release(updated,second),true);assert.equal(updated.projectedParent,null);
});

test('backend connection preserves submission receipts and rejects an unacknowledgeable render',async()=>{
 const receipt={settled:false,done:Promise.resolve()},backend={count:0,render(){this.count++;return receipt;}};
 const connection=core.createViewConnection(backend);assert.equal(connection.render(),receipt);assert.equal(backend.count,1);await receipt.done;
 assert.throws(()=>core.createViewConnection({render:()=>({settled:false})}).render(),error=>error instanceof core.ComponentError&&error.code==='VIEW_RENDER');
 assert.throws(()=>core.createViewConnection({}),{code:'VIEW_RENDER'});
});

test('replacing a built-in registration cannot change an existing element or its cleanup owner',()=>{
 const registry=ui.createBuiltinRegistry(),trace=[],old={},fresh={};
 const definition=name=>({nodeName:'span',attributes:()=>trace.push(name+'-patch'),remove:()=>trace.push(name+'-remove')});
 registry.register('icon',definition('old'));registry.create(old,{tag:'icon'});
 assert.throws(()=>registry.register('icon',definition('new')),/已注册/);
 registry.register('icon',definition('new'),{replace:true});registry.create(fresh,{tag:'icon'});
 registry.patchAttributes(old,{tag:'icon',attrs:{}});registry.patchAttributes(fresh,{tag:'icon',attrs:{}});
 registry.remove(old,{tag:'icon'});registry.remove(old,{tag:'icon'});registry.remove(fresh,{tag:'icon'});
 assert.deepEqual(trace,['old-patch','new-patch','old-remove','new-remove']);
 assert.throws(()=>registry.nodeName('unknown'),/尚未支持/);assert.equal(registry.nodeName('custom',true),'div');
});

test('the standalone browser builtins render icon and progress without an application SDK',()=>{
 const document=createDom();const components=ui.createBrowserComponents({document});
 const icon={tag:'icon',attrs:{type:'success',size:24,color:'red'},dataset:{}},element=document.createElement(components.nodeName(icon.tag));
 components.create(element,icon);components.created(element,icon);components.attributes(element,undefined,icon);
 assert.equal(element.textContent,'✓');assert.equal(element.style.fontSize,'24px');assert.equal(element.getAttribute('role'),'img');
 const progress={tag:'progress',attrs:{percent:42},dataset:{}},bar=document.createElement('div');
 components.create(bar,progress);components.attributes(bar,undefined,progress);assert.equal(bar.getAttribute('aria-valuenow'),'42');
});

test('template, core and DOM backend compose and update without receiving an SDK object',()=>{
 const document=createDom();const mount=document.createElement('main');mount.id='weapp-root';document.body.append(mount);
 const root={document,setTimeout,clearTimeout,addEventListener(){},removeEventListener(){}};
 const protocol=dom.createViewProtocol();
 const template=require(path.join(source,'template-compiler')).createTemplateCompiler(ui.createBuiltinCatalog());
 const errors=[],factory=vm.runInThisContext('('+template.compile('<view id="box"><icon id="status" type="{{type}}"/></view>','page.wxml',(...row)=>errors.push(row))+')');assert.deepEqual(errors,[]);
 const engine=core.createComponentEngine(),registry=core.createInstanceRegistry({engine,port:protocol,usingComponents:{page:{}},resolveComponent:()=>({})});
 const pageObject={data:{type:'success'},change(){}},page=registry.registerPage(pageObject,'page');
 const config={templates:{page:factory},usingComponents:{page:{}},assets:{},componentOptions:{},externalStyleRules:{},componentStyles:{},styleTokens:{page:'page'},
  componentViews:dom.createComponentViews,logicalEvents:core.createLogicalEvents,projectionPlanner:core.createProjectionPlanner,childReconciler:core.createChildReconciler,templateEvaluator:core.createTemplateEvaluator,builtinComponents:ui.createBrowserComponents,
  interactions:ui.createWeappInteractions,textInput:ui.createTextInputRuntime,formRuntime:ui.createFormRuntime,selectorQuery:dom.createSelectorQueryTools,componentSelector:core.createComponentSelector};
 const backend=dom.createDomBackend({root,config,Error:core.ComponentError,viewProtocol:protocol,instances:registry.driver,visual:registry.visual,customEvents:new WeakMap()});
 const view=backend(page.id,'page');view.show();
 assert.equal(document.getElementById('status').textContent,'✓');
 pageObject.data.type='warn';view.markChanges({type:'warn'});const receipt=view.render();assert.equal(receipt.settled,true);assert.equal(document.getElementById('status').textContent,'!');
 registry.destroy(page.id);assert.equal(registry.inspect().instances,0);
});

test('module declarations describe independently composable runtime and compiler interfaces',t=>{
 const directory=temporary(t),file=path.join(directory,'interfaces.ts');
 fs.writeFileSync(file,`import {createViewConnection} from ${JSON.stringify(path.join(source,'component-engine'))};
import {createBuiltinCatalog,createBrowserComponents} from ${JSON.stringify(path.join(source,'builtin-components'))};
import {createTemplateCompiler} from ${JSON.stringify(path.join(source,'template-compiler'))};
import {createStylesheetCompiler} from ${JSON.stringify(path.join(source,'stylesheet-compiler'))};
import {createDomBackend,DomBackendEnvironment} from ${JSON.stringify(path.join(source,'component-backend-dom'))};
const schema=createBuiltinCatalog();
const template=createTemplateCompiler(schema);
const code:string=template.compile('<icon/>','index.wxml',()=>{});
const styles=createStylesheetCompiler({tags:schema.tags});
const css:string=styles.compile(['index.wxss'],()=>'.x{}',()=>'',()=>{});
const components=createBrowserComponents({document});components.nodeName('icon');
const connection=createViewConnection({render:()=>({settled:false as const,done:Promise.resolve()})});connection.render();
declare const environment:DomBackendEnvironment;const backend=createDomBackend(environment);
// @ts-expect-error template compilation requires its explicit schema
createTemplateCompiler({tags:['icon']});
// @ts-expect-error an unsettled backend receipt requires an acknowledgement promise
createViewConnection({render:()=>({settled:false as const})});
`);
 const config=path.join(directory,'tsconfig.json');fs.writeFileSync(config,JSON.stringify({compilerOptions:{strict:true,noEmit:true,target:'ES2020',module:'CommonJS',moduleResolution:'node',lib:['ES2020','DOM'],types:[]},files:[file]}));
 try{execFileSync(process.execPath,[path.resolve(__dirname,'../node_modules/typescript/lib/tsc.js'),'--project',config],{stdio:'pipe'});}catch(error){throw new Error(String(error.stdout||error.message));}
});
