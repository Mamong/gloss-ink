'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const {JSDOM} = require('jsdom');
const create = vm.runInThisContext('(' + require('./helpers/builtin-source.cjs').readSource('weapp-keyboard-accessory.js') + ')');
async function tick() { await Promise.resolve(); await Promise.resolve(); }
function fixture(t) {
  const dom = new JSDOM('<body><main></main></body>', {pretendToBeVisual:true}); t.after(() => dom.window.close());
  const root = dom.window; root.innerWidth=375; root.innerHeight=800; const document = root.document, mount = document.querySelector('main'), observers = [];
  class ResizeObserver { constructor(fn) { this.fn=fn; this.items=new Set(); observers.push(this); } observe(node){this.items.add(node);} unobserve(node){this.items.delete(node);} disconnect(){this.items.clear();} }
  root.ResizeObserver = ResizeObserver; root.__nowNativeEnvironment = {keyboardHeight:0,keyboardTop:800};
  let layouts = 0, live = true;
  const runtime = create(root, {Error:class extends Error {constructor(message,settings){super(message);Object.assign(this,settings);}}, mount, live:()=>live, layout:()=>layouts++});
  t.after(() => runtime.dispose());
  function input(tag='textarea', attrs={'hold-keyboard':true}, target=mount) {
    const element=document.createElement(tag);target.append(element);const node={tag,element,attrs,children:[]};runtime.create(element,tag);runtime.patch(element,node);return node;
  }
  function accessory(owner,height=50,attrs={}) {
    const element=document.createElement('div'),node={tag:'keyboard-accessory',element,attrs,logicalParent:owner,children:[]};
    element.style.height=height+'px';element.getBoundingClientRect=()=>({height:Math.min(200,height)});owner.children.push(node);
    runtime.create(element,'keyboard-accessory');runtime.children(owner.element,owner).append(element);runtime.patch(element,node);return node;
  }
  async function keyboard(height=300, top=500, extra={}) { root.__nowNativeEnvironment={keyboardHeight:height,keyboardTop:top,...extra};root.dispatchEvent(new root.CustomEvent('now-native-environment'));await tick(); }
  return {root,document,mount,runtime,input,accessory,keyboard,observers,get layouts(){return layouts;},setLive(value){live=value;}};
}
test('toolbar follows only its focused input and keyboard geometry without becoming textarea text', async t => {
  const f=fixture(t),owner=f.input(),bar=f.accessory(owner);bar.element.textContent='toolbar';owner.element.value='text';
  f.runtime.flush();assert.equal(bar.element.isConnected,false);assert.equal(owner.element.textContent,'');
  owner.element.focus();await tick();assert.equal(bar.element.isConnected,false);
  await f.keyboard();const overlay=bar.element.parentElement;
  assert.equal(overlay.getAttribute('data-now-ui'),'keyboard-accessory');assert.equal(overlay.style.top,'450px');assert.equal(f.runtime.height(owner.element),50);assert.equal(owner.element.value,'text');
  await f.keyboard(0,800);assert.equal(overlay.hidden,true);assert.equal(overlay.isConnected,false);assert.equal(f.runtime.height(owner.element),0);
});
test('focus switching selects the matching toolbar and hidden or disabled owners do not show it', async t => {
  const f=fixture(t),a=f.input('input'),b=f.input('textarea'),first=f.accessory(a),second=f.accessory(b,60);
  a.element.focus();await f.keyboard();assert.equal(first.element.isConnected,true);assert.equal(second.element.isConnected,false);
  b.element.focus();await tick();assert.equal(first.element.isConnected,false);assert.equal(second.element.isConnected,true);
  b.attrs.disabled=true;f.runtime.patch(b.element,b);f.runtime.flush();assert.equal(second.element.isConnected,false);
  b.attrs.disabled=false;f.setLive(false);f.runtime.flush();assert.equal(second.element.isConnected,false);
});
test('height is capped at 200px and floating keyboard coordinates constrain the toolbar', async t => {
  const f=fixture(t),owner=f.input(),bar=f.accessory(owner,400);owner.element.focus();
  await f.keyboard(200,400,{keyboardLeft:100,keyboardWidth:320});const overlay=bar.element.parentElement;
  assert.equal(overlay.style.left,'100px');assert.equal(overlay.style.width,'320px');assert.equal(overlay.style.top,'200px');assert.equal(overlay.style.maxHeight,'200px');assert.equal(bar.element.style.maxHeight,'200px');assert.equal(f.runtime.height(owner.element),200);
});
test('hold-keyboard toolbar clicks preserve focus and deliver normal child events', async t => {
  const f=fixture(t),owner=f.input(),bar=f.accessory(owner),button=f.document.createElement('button');bar.element.append(button);owner.element.focus();await f.keyboard();
  let clicked=0;button.addEventListener('click',()=>clicked++);
  const down=new f.root.MouseEvent('pointerdown',{bubbles:true,cancelable:true});button.dispatchEvent(down);assert.equal(down.defaultPrevented,true);
  button.click();await tick();assert.equal(clicked,1);assert.equal(f.document.activeElement,owner.element);assert.equal(bar.element.isConnected,true);
});
test('page visibility, conditional removal and resize release and restore toolbar state', async t => {
  const f=fixture(t),owner=f.input(),bar=f.accessory(owner);owner.element.focus();await f.keyboard();const original=bar.element;
  f.runtime.visibility(false);assert.equal(bar.element.isConnected,false);f.runtime.visibility(true);assert.equal(bar.element,original);assert.equal(bar.element.isConnected,true);
  f.runtime.remove(bar.element);assert.equal(f.observers[0].items.size,0);await tick();assert.equal(f.runtime.height(owner.element),0);
  const next=f.accessory(owner,80);f.runtime.flush();assert.equal(next.element.parentElement.style.top,'420px');
  f.runtime.remove(owner.element);owner.element.remove();assert.equal(next.element.isConnected,false);assert.equal(f.observers[0].items.size,1);
  f.runtime.remove(next.element);assert.equal(f.observers[0].items.size,0);
});
test('Web visualViewport resize and pan update the toolbar while zoom and hardware keyboard keep it hidden', async t => {
  const f=fixture(t),owner=f.input('input'),bar=f.accessory(owner,40);delete f.root.__nowNativeEnvironment;
  const viewport=new f.root.EventTarget();Object.assign(viewport,{height:800,offsetTop:0,offsetLeft:0,width:375,scale:1});
  // Recreate with a viewport supplied before subscriptions are installed.
  f.runtime.dispose();f.root.visualViewport=viewport;
  const runtime=create(f.root,{Error,mount:f.mount,live:()=>true});t.after(()=>runtime.dispose());runtime.create(owner.element,'input');runtime.patch(owner.element,owner);runtime.create(bar.element,'keyboard-accessory');runtime.children(owner.element,owner).append(bar.element);runtime.patch(bar.element,bar);
  Object.defineProperty(f.root,'innerHeight',{value:800,configurable:true});owner.element.focus();await tick();assert.equal(bar.element.isConnected,false);
  viewport.height=500;viewport.offsetTop=20;viewport.dispatchEvent(new f.root.Event('resize'));await tick();assert.equal(bar.element.parentElement.style.top,'480px');
  viewport.offsetTop=40;viewport.dispatchEvent(new f.root.Event('scroll'));await tick();assert.equal(bar.element.parentElement.style.top,'500px');
  viewport.scale=2;viewport.dispatchEvent(new f.root.Event('resize'));await tick();assert.equal(bar.element.isConnected,false);
});
test('component Shadow DOM retains scoped styles and detects its real focused input', async t => {
  const f=fixture(t),host=f.document.createElement('div');f.mount.append(host);const shadow=host.attachShadow({mode:'open'}),owner=f.input('input',{},shadow),bar=f.accessory(owner);
  owner.element.focus();await f.keyboard();assert.equal(f.document.activeElement,host);assert.equal(shadow.activeElement,owner.element);assert.equal(bar.element.getRootNode(),shadow);
});
test('invalid nesting fails and disposal removes listeners, observers and overlays', async t => {
  const f=fixture(t),owner=f.input(),bar=f.accessory(owner);owner.element.focus();await f.keyboard();
  const invalid=f.document.createElement('div');f.runtime.create(invalid,'keyboard-accessory');assert.throws(()=>f.runtime.patch(invalid,{attrs:{},logicalParent:{tag:'view',element:f.mount}}),{code:'INVALID_ARGUMENT'});
  f.runtime.dispose();assert.equal(bar.element.isConnected,false);assert.equal(f.observers[0].items.size,0);
  await f.keyboard();assert.equal(f.mount.querySelector('[data-now-ui="keyboard-accessory"]'),null);
});
test('losing the view window hides the toolbar even while the input remains active', async t => {
  const f=fixture(t),owner=f.input(),bar=f.accessory(owner);owner.element.focus();await f.keyboard();
  f.root.dispatchEvent(new f.root.Event('blur'));await tick();assert.equal(bar.element.isConnected,false);assert.equal(f.runtime.height(owner.element),0);
  f.root.dispatchEvent(new f.root.Event('focus'));await tick();assert.equal(bar.element.isConnected,true);
});
test('recreating the last accessory starts fresh after an unwatched window focus change', async t => {
  const f=fixture(t),owner=f.input(),bar=f.accessory(owner);owner.element.focus();await f.keyboard();
  f.root.dispatchEvent(new f.root.Event('blur'));await tick();f.runtime.remove(bar.element);await tick();
  f.root.dispatchEvent(new f.root.Event('focus'));
  const next=f.accessory(owner);f.runtime.flush();assert.equal(next.element.isConnected,true);
});

test('an open keyboard accessory follows its owner theme while keeping content and focus',async t=>{
 const f=fixture(t);f.document.documentElement.setAttribute('data-weui-theme','light');f.mount.setAttribute('data-weui-theme','dark');const owner=f.input(),bar=f.accessory(owner);owner.element.style.color='rgb(20, 30, 40)';owner.element.value='preserve';owner.element.focus();await f.keyboard();const overlay=bar.element.parentElement;
 assert.equal(overlay.getAttribute('data-weui-theme'),'dark');assert.equal(overlay.style.color,'rgb(20, 30, 40)');
 f.mount.setAttribute('data-weui-theme','light');await new Promise(setImmediate);assert.equal(bar.element.parentElement,overlay);assert.equal(overlay.getAttribute('data-weui-theme'),'light');assert.equal(owner.element.value,'preserve');assert.equal(f.document.activeElement,owner.element);assert.equal(overlay.style.color,'rgb(20, 30, 40)');
 f.runtime.dispose();assert.equal(overlay.isConnected,false);
});
