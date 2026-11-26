'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),ui=require('../packages/builtin-components');
const createLogicalEvents=require('../packages/component-engine/events');
const serialized=factory=>vm.runInNewContext('('+factory.toString()+')');
function environment(t){const root=new JSDOM('<!doctype html><html><body></body></html>').window;t.after(()=>root.close());return root;}
test('serialized selection clips selectable leaves and reports the whole multiline range',t=>{
 const root=environment(t),document=root.document,element=document.createElement('div');
 element.innerHTML='<span class="weapp-text" style="user-select:text">Alpha</span><span class="weapp-text" style="user-select:none">Blocked</span><div>raw</div><span class="weapp-rich-text" style="user-select:text">Beta</span>';
 document.body.append(element);const events=[];let live=true;
 const runtime=vm.runInNewContext('('+require('./helpers/builtin-source.cjs').readSource('weapp-interactive-components.js')+')')(root,{Error,live:()=>live,emit:(_element,name,detail)=>events.push({name,detail})});runtime.create(element,'selection');runtime.patch(element,{attrs:{'disable-context-menu':true}},null);
 root.Range.prototype.getBoundingClientRect=()=>({x:2,y:3,width:150,height:48});root.Range.prototype.getClientRects=()=>[{x:2,y:3,width:70,height:16}];
 const range=document.createRange();range.setStart(element.firstChild.firstChild,2);range.setEnd(element.lastChild.firstChild,3);root.getSelection().addRange(range);document.dispatchEvent(new root.Event('selectionchange'));
 assert.equal(events[0].detail.selectedString,'phaBet');assert.equal(events[0].detail.firstRangeRect.height,48);document.dispatchEvent(new root.Event('selectionchange'));assert.equal(events.length,2);
 const menu=new root.MouseEvent('contextmenu',{cancelable:true});element.dispatchEvent(menu);assert.equal(menu.defaultPrevented,true);
 live=false;root.getSelection().removeAllRanges();document.dispatchEvent(new root.Event('selectionchange'));assert.equal(events.length,2);live=true;document.dispatchEvent(new root.Event('selectionchange'));assert.equal(events[2].detail.isCollapsed,true);
 runtime.dispose();root.getSelection().addRange(range);document.dispatchEvent(new root.Event('selectionchange'));assert.equal(events.length,3);
});
test('selection preserves business display and single editor native text',t=>{
 const root=environment(t),document=root.document,element=document.createElement('div');element.innerHTML='<div class="weapp-editor">Editor text</div>';element.style.display='flex';document.body.append(element);const events=[];
 const runtime=vm.runInNewContext('('+require('./helpers/builtin-source.cjs').readSource('weapp-interactive-components.js')+')')(root,{Error,live:()=>true,emit:(_element,_name,detail)=>events.push(detail)});runtime.create(element,'selection');runtime.patch(element,{attrs:{style:'display:flex'}},null);assert.equal(element.style.display,'flex');
 const range=document.createRange();range.selectNodeContents(element.firstChild);root.getSelection().addRange(range);document.dispatchEvent(new root.Event('selectionchange'));assert.equal(events[0].selectedString,'Editor text');runtime.dispose();
});
test('serialized portal isolates native editing events and releases all guards',t=>{
 const root=environment(t),document=root.document,parent=document.createElement('div'),portal=document.createElement('div'),control=document.createElement('input');portal.append(control);parent.append(portal);document.body.append(parent);
 const runtime=serialized(ui.createEditorRuntime)(root,{Error,live:()=>true,emit(){}});runtime.create(portal,'editor-portal');const outside=[],inside=[];
 for(const name of ['input','beforeinput','paste','compositionstart','compositionupdate','compositionend','keydown','click']){parent.addEventListener(name,()=>outside.push(name));control.addEventListener(name,()=>inside.push(name));control.dispatchEvent(new root.Event(name,{bubbles:true}));}
 assert.equal(inside.length,8);assert.deepEqual(outside,['click']);runtime.remove(portal);control.dispatchEvent(new root.Event('input',{bubbles:true}));assert.deepEqual(outside,['click','input']);
 const second=document.createElement('div');parent.append(second);runtime.create(second,'editor-portal');runtime.dispose();second.dispatchEvent(new root.Event('paste',{bubbles:true}));assert.equal(outside.at(-1),'paste');
});
for(const name of ['input','change','confirm','focus','blur','tap'])test('logical portal event boundary for '+name,()=>{
 const delivered=[],view={live:()=>true,parent:()=>null,send:node=>delivered.push(node.id)},make=(id,tag,logicalParent)=>({id,tag,logicalParent,eventView:view,events:[{name,handler:'record',capture:false},{name,handler:'record',capture:true}]});
 const editor=make('editor','editor',null),portal=make('portal','editor-portal',editor),card=make('card','view',portal),control=make('control','input',card);portal.projectedParent=editor;
 const events=serialized(createLogicalEvents)();events.route(control,name,{}, {composed:true,bubbles:true,capturePhase:true});
 const path=name==='tap'?['editor','portal','card','control','control','card','portal','editor']:['portal','card','control','control','card','portal'];assert.deepEqual(delivered,path);assert.equal(portal.projectedParent,editor);
 delivered.length=0;portal.events[1].stop=true;events.route(control,name,{}, {composed:true,bubbles:true,capturePhase:true});assert.equal(delivered.at(-1),'portal');assert.equal(delivered.includes('control'),false);
});
