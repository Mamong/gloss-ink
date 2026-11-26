'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const browserFixtures = new Set();
test.after(() => {for (const root of browserFixtures) root.close();});
const create=vm.runInNewContext('('+require('./helpers/builtin-source.cjs').readSource('weapp-accessibility.js')+')');
class AppError extends Error{constructor(message,options){super(message);Object.assign(this,options);}}
function fixture(){const browser=new JSDOM('<!doctype html><body></body>'),document=browser.window.document,dom={event(element,name,options={}){const EventType=name.startsWith('key')?browser.window.KeyboardEvent:browser.window.Event;const event=new EventType(name,{bubbles:true,cancelable:true,...options});element.dispatchEvent(event);return event;}},root=browser.window,module=create(root,{Error:AppError}),events=[];let live=true;browserFixtures.add(root);const scope=module.scope({live:()=>live,activate:(element,event)=>events.push([element,event.key])});function element(tag='div',attrs={}){const node=document.createElement(tag);for(const[k,v]of Object.entries(attrs))node.setAttribute(k,v);document.body.append(node);return node;}return{document,dom,module,scope,element,events,hide:()=>{live=false;scope.visibility(false);}};}
function patch(f,element,attrs,tag='view'){f.scope.patch(element,{attrs,tag});f.scope.flush();}
test('ARIA aliases, false states, dynamic removal and framework defaults remain distinct',()=>{
 const f=fixture(),node=f.element();patch(f,node,{'aria-role':'button','aria-label':'播放','aria-pressed':false,'aria-hidden':false,'aria-busy':true,'aria-valuenow':0});
 assert.equal(node.getAttribute('role'),'button');assert.equal(node.getAttribute('aria-role'),null);assert.equal(node.getAttribute('aria-pressed'),'false');assert.equal(node.getAttribute('aria-hidden'),'false');assert.equal(node.getAttribute('aria-valuenow'),'0');assert.equal(node.getAttribute('tabindex'),null);
 patch(f,node,{});assert.equal(node.getAttribute('role'),null);assert.equal(node.getAttribute('aria-label'),null);assert.equal(node.getAttribute('aria-pressed'),null);
 const native=f.element('input',{role:'switch','aria-label':'default'});patch(f,native,{'aria-role':'checkbox','aria-label':'author'},'switch');native.setAttribute('role','switch');native.setAttribute('aria-label','updated default');f.scope.flush();assert.equal(native.getAttribute('role'),'checkbox');patch(f,native,{},'switch');assert.equal(native.getAttribute('role'),'switch');assert.equal(native.getAttribute('aria-label'),'updated default');
});
test('scoped element references reject another scope, ambiguity and removed targets',()=>{
 const f=fixture(),label=f.element('span',{id:'label'}),button=f.element('button'),foreign=f.element('span',{id:'foreign'});button.ariaLabelledByElements=[];
 f.scope.patch(label,{tag:'text',attrs:{id:'label'}});patch(f,button,{'aria-labelledby':'label','aria-label':'fallback'},'button');assert.equal(button.ariaLabelledByElements[0],label);
 patch(f,button,{'aria-labelledby':'foreign'},'button');assert.equal(button.ariaLabelledByElements.length,0);assert.equal(button.getAttribute('aria-labelledby'),null);
 const duplicate=f.element('span',{id:'label'});f.scope.patch(duplicate,{tag:'text',attrs:{id:'label'}});patch(f,button,{'aria-labelledby':'label'},'button');assert.equal(button.ariaLabelledByElements.length,0);f.scope.remove(duplicate);duplicate.remove();f.scope.flush();assert.equal(button.ariaLabelledByElements[0],label);
 f.scope.remove(label);label.remove();f.scope.flush();assert.equal(button.ariaLabelledByElements.length,0);assert.equal(foreign.getAttribute('id'),'foreign');
});
test('IDREF fallback is allowed only for unambiguous IDs within the same DOM tree',()=>{
 const f=fixture(),label=f.element('span',{id:'name'}),button=f.element('button');f.scope.patch(label,{tag:'text',attrs:{id:'name'}});patch(f,button,{'aria-labelledby':'name'},'button');assert.equal(button.getAttribute('aria-labelledby'),'name');
 const hiddenPageDuplicate=f.element('span',{id:'name'});f.scope.flush();assert.equal(button.getAttribute('aria-labelledby'),null);hiddenPageDuplicate.remove();f.scope.flush();assert.equal(button.getAttribute('aria-labelledby'),'name');
 const shadow=f.element('div').attachShadow({mode:'open'}),other=f.document.createElement('span');other.setAttribute('id','private');shadow.append(other);f.scope.patch(other,{tag:'text',attrs:{id:'private'}});patch(f,button,{'aria-controls':'private'},'button');assert.equal(button.getAttribute('aria-controls'),null);
});
test('composite controls receive the accessible name, state and tabindex on their actual input',()=>{
 const f=fixture(),slider=f.element(),range=f.element('input');slider.append(range);slider.weappRange=range;patch(f,slider,{'aria-label':'音量','aria-valuetext':'50%','aria-hidden':false,tabindex:-1},'slider');assert.equal(range.getAttribute('aria-label'),'音量');assert.equal(range.getAttribute('tabindex'),'-1');assert.equal(slider.getAttribute('aria-label'),null);assert.equal(slider.getAttribute('aria-hidden'),'false');patch(f,slider,{},'slider');assert.equal(range.getAttribute('aria-label'),null);assert.equal(range.getAttribute('tabindex'),null);
});
test('explicitly focusable custom buttons and links use correct keys without making all roles focusable',()=>{
 const f=fixture(),node=f.element();patch(f,node,{'aria-role':'button',tabindex:0});const key=(type,value,extra={})=>f.dom.event(node,type,{key:value,...extra});
 key('keydown','Enter');assert.equal(f.events.length,1);key('keyup','Enter');assert.equal(f.events.length,1);key('keydown',' ');assert.equal(f.events.length,1);key('keyup',' ');assert.equal(f.events.length,2);key('keydown','Enter',{repeat:true});key('keydown','Enter',{isComposing:true});assert.equal(f.events.length,2);
 key('keydown',' ');f.dom.event(node,'blur');key('keyup',' ');assert.equal(f.events.length,2);patch(f,node,{'aria-role':'link',tabindex:0});key('keydown',' ');key('keyup',' ');assert.equal(f.events.length,2);key('keydown','Enter');assert.equal(f.events.length,3);
 patch(f,node,{'aria-role':'button',tabindex:0,'aria-disabled':true});key('keydown','Enter');assert.equal(f.events.length,3);patch(f,node,{'aria-role':'button'});key('keydown','Enter');assert.equal(f.events.length,3);patch(f,node,{'aria-role':'button',tabindex:0});key('keydown',' ');f.hide();key('keyup',' ');key('keydown','Enter');assert.equal(f.events.length,3);f.scope.dispose();key('keydown','Enter');assert.equal(f.events.length,3);
});
test('native buttons are not assigned a duplicate keyboard action and malformed ARIA objects fail',()=>{
 const f=fixture(),button=f.element('button');patch(f,button,{'aria-role':'button',tabindex:0},'button');f.dom.event(button,'keydown',{key:'Enter'});assert.equal(f.events.length,0);
 for(const attrs of [{'aria-label':{}},{'aria-role':true},{'aria-controls':['id']},{'aria-valuenow':Infinity}])assert.throws(()=>f.module.validate(attrs),{code:'INVALID_ARGUMENT'});
});
test('removing an authored relation restores a composite control native default',()=>{
 const f=fixture(),native=f.element('div',{'aria-activedescendant':'native-item'}),label=f.element('span',{id:'author-item'});native.ariaActiveDescendantElement=null;f.scope.patch(label,{tag:'view',attrs:{id:'author-item'}});patch(f,native,{'aria-activedescendant':'author-item'});assert.equal(native.ariaActiveDescendantElement,label);patch(f,native,{});assert.equal(native.getAttribute('aria-activedescendant'),'native-item');
});
test('all eight ID reference mappings use scoped targets and clear reflected relations on removal',()=>{
 const mappings={'aria-labelledby':['ariaLabelledByElements',false],'aria-describedby':['ariaDescribedByElements',false],'aria-controls':['ariaControlsElements',false],'aria-details':['ariaDetailsElements',false],'aria-errormessage':['ariaErrorMessageElements',false],'aria-flowto':['ariaFlowToElements',false],'aria-owns':['ariaOwnsElements',false],'aria-activedescendant':['ariaActiveDescendantElement',true]};
 for(const[name,[property,single]]of Object.entries(mappings)){
  const f=fixture(),label=f.element('span',{id:'target'}),control=f.element();control[property]=single?null:[];f.scope.patch(label,{tag:'view',attrs:{id:'target'}});patch(f,control,{[name]:'target'});assert.equal(single?control[property]:control[property][0],label,name);patch(f,control,{});assert.equal(single?control[property]:control[property].length,single?null:0,name);
 }
});
