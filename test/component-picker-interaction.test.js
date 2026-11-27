'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),create=require('../packages/builtin-components/picker');
async function fixture(t,attrs,width=375,theme,configure){const root=new JSDOM('<!doctype html><body></body>').window;root.innerWidth=width;configure?.(root);root.HTMLDialogElement.prototype.showModal=function(){this.open=true;};const element=root.document.createElement('div');root.document.body.append(element);if(theme)element.setAttribute('data-weui-theme',theme);const events=[],runtime=vm.runInNewContext('('+create.toString()+')')(root,{Error,live:()=>true,emit:(_el,name,detail)=>events.push({name,detail})});runtime.create(element,'picker');runtime.patch(element,{attrs});t.after(()=>{runtime.dispose();root.close();});element.click();await new Promise(setImmediate);return{root,element,events,runtime,dialog:()=>root.document.querySelector('dialog')};}
const pick=(f,column,index)=>f.dialog().querySelector('[data-now-picker-wheel="'+column+'"] [data-now-picker-option="'+index+'"]').click();
const confirm=f=>f.dialog().querySelector('[data-now-picker-confirm]').click();
test('small picker drafts cancel cleanly and unchanged confirmation does not emit change',async t=>{
 const f=await fixture(t,{range:['a','b','c'],value:0});assert.equal(f.dialog().getAttribute('data-now-picker-layout'),'sheet');assert.equal(f.dialog().querySelector('select').hidden,true);pick(f,0,1);assert.equal(f.runtime.value(f.element),0);f.dialog().dispatchEvent(new f.root.Event('cancel',{cancelable:true}));assert.equal(f.dialog(),null);assert.equal(f.runtime.value(f.element),0);assert.equal(f.events[0].name,'cancel');f.element.click();await new Promise(setImmediate);confirm(f);assert.equal(f.events.length,1);assert.equal(f.events[0].name,'cancel');
});
test('responsive layout keeps native controls on large screens and preserves a pending selection across resizing',async t=>{
 const f=await fixture(t,{range:['a','b'],value:0},900);assert.equal(f.dialog().getAttribute('data-now-picker-layout'),'dialog');assert.equal(f.dialog().querySelector('[data-now-picker-wheel]'),null);assert.equal(f.dialog().querySelector('select').hidden,false);f.dialog().querySelector('select').value='1';f.root.innerWidth=390;f.root.dispatchEvent(new f.root.Event('resize'));assert.equal(f.dialog().getAttribute('data-now-picker-layout'),'sheet');assert.equal(f.dialog().querySelector('[aria-selected=true]').textContent,'b');f.root.innerWidth=900;f.root.dispatchEvent(new f.root.Event('resize'));assert.equal(f.dialog().querySelector('select').value,'1');assert.equal(f.dialog().querySelector('select').hidden,false);confirm(f);assert.equal(f.events[0].detail.value,'1');
});
test('date wheels clamp a 31st day across month/year changes without losing the draft to native date sanitization',async t=>{
 const f=await fixture(t,{mode:'date',value:'2024-01-31',start:'2024-01-01',end:'2025-12-31'});pick(f,1,1);assert.equal(f.dialog().querySelector('input').value,'2024-02-29');pick(f,0,1);assert.equal(f.dialog().querySelector('input').value,'2025-02-28');confirm(f);assert.equal(f.events[0].detail.value,'2025-02-28');
});
test('time wheels respect both ends of a partial-hour range',async t=>{
 const f=await fixture(t,{mode:'time',value:'08:30',start:'08:30',end:'10:15'});assert.equal(f.dialog().querySelector('[data-now-picker-wheel="1"] [role=option]').textContent,'30');pick(f,0,2);assert.equal(f.dialog().querySelector('input').value,'10:15');assert.equal(f.dialog().querySelectorAll('[data-now-picker-wheel="1"] [role=option]').length,16);confirm(f);assert.equal(f.events[0].detail.value,'10:15');
});
test('confirmation settles a scroll that has not reached its debounce, while teardown cancels late wheel work',async t=>{
 const f=await fixture(t,{mode:'multiSelector',range:[['a','b','c'],['1','2']],value:[0,0]});const column=f.dialog().querySelector('[data-now-picker-wheel="0"]');column.scrollTop=96;column.dispatchEvent(new f.root.Event('scroll'));confirm(f);assert.equal(f.events[0].name,'columnchange');assert.equal(f.events[0].detail.value,2);assert.equal(f.events[1].name,'change');assert.deepEqual(Array.from(f.events[1].detail.value),[2,0]);f.element.click();await new Promise(setImmediate);const pending=f.dialog().querySelector('[data-now-picker-wheel="0"]');pending.scrollTop=0;pending.dispatchEvent(new f.root.Event('scroll'));f.runtime.dispose();await new Promise(resolve=>setTimeout(resolve,130));assert.equal(f.events.length,2);assert.equal(f.dialog(),null);
});

test('scroll events queued by a removed wheel cannot change the new layout draft',async t=>{
 const f=await fixture(t,{range:['a','b','c'],value:0});const stale=f.dialog().querySelector('[data-now-picker-wheel]');pick(f,0,2);f.root.innerWidth=900;f.root.dispatchEvent(new f.root.Event('resize'));f.dialog().querySelector('select').value='1';f.root.innerWidth=390;f.root.dispatchEvent(new f.root.Event('resize'));stale.scrollTop=0;stale.dispatchEvent(new f.root.Event('scroll'));await new Promise(resolve=>setTimeout(resolve,130));assert.equal(f.dialog().querySelector('[aria-selected=true]').textContent,'b');confirm(f);assert.equal(f.events[0].detail.value,'1');
});

test('picker portal preserves local light and dark theme scopes on its body-mounted dialog',async t=>{
 for(const width of [375,900])for(const theme of ['light','dark']){
  const f=await fixture(t,{range:['a','b'],value:0},width,theme),dialog=f.dialog();
  assert.equal(dialog.parentElement,f.root.document.body);
  assert.equal(f.root.document.body.getAttribute('data-weui-theme'),null);
  assert.equal(dialog.getAttribute('data-now-picker-theme'),theme);
  assert.equal(dialog.getAttribute('data-weui-theme'),theme);
 }
});

test('an open picker follows its owning theme without losing the draft or focus',async t=>{
 const f=await fixture(t,{range:['a','b'],value:0},375,'dark');pick(f,0,1);const dialog=f.dialog(),focused=f.root.document.activeElement;
 f.element.setAttribute('data-weui-theme','light');await new Promise(setImmediate);
 assert.equal(f.dialog(),dialog);assert.equal(dialog.getAttribute('data-weui-theme'),'light');assert.equal(dialog.style.colorScheme,'light');assert.equal(dialog.querySelector('[aria-selected=true]').textContent,'b');assert.equal(f.root.document.activeElement,focused);assert.equal(f.events.length,0);
 f.root.document.documentElement.setAttribute('data-weui-theme','dark');await new Promise(setImmediate);assert.equal(dialog.getAttribute('data-weui-theme'),'light');
 f.root.innerWidth=900;f.root.dispatchEvent(new f.root.Event('resize'));assert.equal(dialog.style.colorScheme,'light');assert.equal(dialog.querySelector('select').value,'1');
 f.element.removeAttribute('data-weui-theme');await new Promise(setImmediate);assert.equal(dialog.getAttribute('data-weui-theme'),'dark');assert.equal(dialog.querySelector('select').style.colorScheme,'dark');
});
test('picker theme observers are released when dialogs close or the runtime is disposed',async t=>{
 let disconnected=0,created=0;const f=await fixture(t,{range:['a','b'],value:0},375,'dark',root=>{const Original=root.MutationObserver;root.MutationObserver=class extends Original{constructor(callback){super(callback);created++;}disconnect(){disconnected++;super.disconnect();}};});
 assert.equal(created,1);f.dialog().dispatchEvent(new f.root.Event('cancel',{cancelable:true}));assert.equal(disconnected,1);
 f.element.click();await new Promise(setImmediate);assert.equal(created,2);f.runtime.dispose();assert.equal(disconnected,2);f.element.setAttribute('data-weui-theme','light');await new Promise(setImmediate);assert.equal(f.dialog(),null);
});
