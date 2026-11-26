'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),ui=require('../packages/builtin-components');
const serialized=factory=>vm.runInNewContext('('+factory.toString()+')');
function environment(t){const root=new JSDOM('<!doctype html><html><body></body></html>').window;t.after(()=>root.close());return root;}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('serialized map keeps business shell styles during context updates and releases its simulation layer',t=>{
 const root=environment(t),element=root.document.createElement('div');root.document.body.append(element);element.style.cssText='position:static;overflow:visible;background:orange;width:231px;height:117px';const style=element.style.cssText;
 const node={attrs:{longitude:20,latitude:10,scale:12,markers:[{id:1,longitude:20,latitude:10}]}};const events=[];const runtime=serialized(ui.createMapRuntime)(root,{Error,find:()=>element,node:()=>node,live:()=>true,emit:(_el,name)=>events.push(name)});
 runtime.patch(element,node);assert.equal(element.style.cssText,style);const layer=element.__nowMapLayer;assert.ok(layer.querySelector('[data-marker-id="1"]'));assert.equal(layer.style.overflow,'hidden');assert.equal(layer.hidden,false);
 runtime.execute('moveToLocation',{mapId:'map',longitude:21,latitude:11});assert.equal(element.style.cssText,style);assert.equal(runtime.execute('getCenterLocation',{mapId:'map'}).longitude,21);assert.ok(events.includes('regionchange'));
 runtime.execute('addMarkers',{mapId:'map',markers:[{id:2,longitude:20,latitude:10}]});assert.ok(layer.querySelector('[data-marker-id="2"]'));assert.equal(element.style.cssText,style);runtime.dispose();assert.equal(layer.isConnected,false);assert.equal(element.__nowMapLayer,undefined);
});
test('serialized web-view preserves styles, delegates metadata and applies node/page visibility',t=>{
 const root=environment(t),element=root.document.createElement('div');root.document.body.append(element);element.style.cssText='position:relative;width:231px;height:117px;background:orange';const style=element.style.cssText,calls=[];
 const runtime=serialized(ui.createWebViewRuntime)(root,{Error,request:(method,value)=>calls.push({method,value})});runtime.create(element,'web-view');assert.equal(element.children.length,1);assert.equal(element.firstChild.className,'weapp-web-view-placeholder');runtime.visibility(true);
 const node={attrs:{src:'https://example.invalid',id:'target'},viewNodeId:'node',dataset:{key:'value'},events:[{name:'load',handler:'load'},{name:'tap',handler:'tap'}]};runtime.patch(element,node);assert.equal(element.style.cssText,style);assert.equal(calls.at(-1).value.visible,true);assert.equal(calls.at(-1).value.events.length,1);assert.equal(element.querySelector('iframe'),null);
 runtime.patch(element,{...node,attrs:{...node.attrs,hidden:true}});assert.equal(calls.at(-1).value.visible,false);runtime.visibility(false);runtime.patch(element,{...node,attrs:{...node.attrs,src:''}});assert.equal(calls.at(-1).value.visible,false);assert.equal(calls.at(-1).value.src,'');runtime.remove(element);assert.equal(calls.at(-1).method,'webview.remove');runtime.dispose();
});
test('serialized camera marks successful previews and restores fallback after hide/disposal',async t=>{
 const root=environment(t),element=root.document.createElement('div');root.document.body.append(element);element.style.cssText='width:231px;height:117px;background:orange';const style=element.style.cssText,calls=[];let sequence=0;
 const runtime=serialized(ui.createCameraRuntime)(root,{Error,live:()=>true,emit(){},async host(method,value){calls.push({method,value});if(method==='open')return{id:'camera-'+(++sequence),maxZoom:2};if(method==='frame')return{preview:'data:image/png;base64,iVBORw0KGgo='};return{};}});t.after(()=>runtime.dispose());runtime.create(element,'camera');assert.equal(element.hasAttribute('data-now-camera-ready'),false);runtime.patch(element,{attrs:{}});await settle();assert.equal(element.getAttribute('data-now-camera-ready'),'true');assert.match(element.firstChild.getAttribute('src'),/^data:image/);assert.equal(element.style.cssText,style);
 element.hidden=true;runtime.flush();await settle();assert.equal(element.hasAttribute('data-now-camera-ready'),false);assert.equal(element.firstChild.hasAttribute('src'),false);assert.ok(calls.some(call=>call.method==='close'));
 element.hidden=false;runtime.flush();await settle();assert.equal(element.getAttribute('data-now-camera-ready'),'true');runtime.dispose();assert.equal(element.hasAttribute('data-now-camera-ready'),false);assert.equal(element.children.length,0);assert.equal(element.style.cssText,style);
});
test('failed camera opening leaves the transparent fallback and reports the host error',async t=>{
 const root=environment(t),element=root.document.createElement('div');root.document.body.append(element);const events=[];const runtime=serialized(ui.createCameraRuntime)(root,{Error,live:()=>true,emit:(_el,name,detail)=>events.push({name,detail}),host:()=>Promise.reject(Object.assign(Error('unavailable'),{code:'CAMERA_UNAVAILABLE'}))});runtime.create(element,'camera');runtime.patch(element,{attrs:{}});await settle();assert.equal(element.hasAttribute('data-now-camera-ready'),false);assert.equal(events[0].name,'error');assert.equal(events[0].detail.code,'CAMERA_UNAVAILABLE');runtime.dispose();
});
