const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const windows=new Set();test.after(()=>{for(const root of windows)root.close();});
const factory=vm.runInThisContext('('+require('./helpers/builtin-source.cjs').readSource('weapp-page-meta.js')+')');
function fixture(){
 const browser=new JSDOM('<!doctype html><body></body>');windows.add(browser.window);const document=browser.window.document,dom={event(element,name){element.dispatchEvent(new browser.window.Event(name,{bubbles:true}));}},mount=document.createElement('section');document.body.append(mount);Object.defineProperties(mount,{clientHeight:{value:400,configurable:true},scrollHeight:{value:1600,configurable:true}});mount.scrollTop=0;document.documentElement.style.fontSize='17px';
 const frames=new Map(),events=[],messages=[];let sequence=0;
 const root={document,innerWidth:375,innerHeight:600,requestAnimationFrame(fn){frames.set(++sequence,fn);return sequence;},cancelAnimationFrame(id){frames.delete(id);}};
 const controller=factory(root,{mount,Error:Error,style:value=>value,live:()=>true,emit:(element,name,detail)=>events.push({element,name,detail}),send:value=>messages.push(value)});
 const node=(attrs={},nav={})=>{const element=document.createElement('div');mount.append(element);const child=document.createElement('div');element.append(child);return{tag:'page-meta',attrs,element,children:[{tag:'navigation-bar',attrs:nav,element:child,children:[]}]};};
 function frame(time){const current=[...frames.values()];frames.clear();for(const fn of current)fn(time);}
 return {controller,node,mount,root,dom,frames,frame,events,messages};
}
test('animated scroll cancels on hide, reports completion once and ignores nested scroll',()=>{
 const f=fixture(),meta=f.node({'scroll-top':'1000rpx','scroll-duration':100,'root-font-size':'24px'});
 f.controller.visibility(true);f.controller.update([meta]);assert.equal(f.frames.size,1);f.frame(0);f.frame(50);assert.equal(f.mount.scrollTop,250);
 f.controller.visibility(false);assert.equal(f.frames.size,0);f.frame(100);assert.equal(f.events.length,0);assert.equal(f.root.document.documentElement.style.fontSize,'17px');
 f.controller.visibility(true);f.controller.update([{...meta,attrs:{...meta.attrs,'scroll-top':'1200rpx'}}]);f.frame(200);f.frame(300);assert.equal(f.mount.scrollTop,600);assert.equal(f.events.filter(e=>e.name==='scrolldone').length,1);
 const nested=f.root.document.createElement('div');f.mount.append(nested);f.dom.event(nested,'scroll');assert.equal(f.events.filter(e=>e.name==='scroll').length,0);
 f.dom.event(f.mount,'scroll');assert.deepEqual(f.events.at(-1).detail,{scrollTop:600});f.controller.resize();assert.deepEqual(f.events.at(-1).detail,{size:{windowWidth:375,windowHeight:600}});
 f.controller.dispose();assert.equal(f.root.document.documentElement.style.fontSize,'17px');const length=f.events.length;f.dom.event(f.mount,'scroll');assert.equal(f.events.length,length);
});
test('hidden initial scroll waits for visibility and current geometry, and removal restores styles',()=>{
 const f=fixture();f.mount.style.color='red';f.mount.style.backgroundColor='#abcdef';const meta=f.node({'scroll-top':'10000px','scroll-duration':0,'page-style':'color: blue; padding: 10px;','root-font-size':'30px','background-color':'#123456'},{title:'A',loading:true});
 f.controller.update([meta]);assert.equal(f.frames.size,0);assert.equal(f.mount.scrollTop,0);assert.equal(f.root.document.documentElement.style.fontSize,'17px');f.controller.visibility(true);assert.equal(f.mount.scrollTop,1200);assert.equal(f.root.document.documentElement.style.fontSize,'30px');
 f.controller.update([]);assert.equal(f.mount.style.color,'red');assert.equal(f.mount.style.padding,'');assert.equal(f.mount.style.backgroundColor,'rgb(171, 205, 239)');assert.equal(f.root.document.documentElement.style.fontSize,'17px');assert.equal(f.messages.at(-1).navigation.loading,false);assert.equal(f.messages.at(-1).window.navigationBarTitleText,null);
});
test('invalid dynamic metadata is rejected before applying effects',()=>{
 for(const attrs of [{'scroll-top':'nope'},{'scroll-duration':-1},{'root-font-size':'url(x)'},{'background-color':'red'},{'page-orientation':'sideways'}]){const f=fixture();assert.throws(()=>f.controller.update([f.node(attrs)]));assert.equal(f.messages.length,0);assert.equal(f.mount.scrollTop,0);}
 for(const attrs of [{loading:'true'},{'front-color':'#fff'},{'color-animation-duration':-1},{'color-animation-timing-func':'bounce'}]){const f=fixture();assert.throws(()=>f.controller.update([f.node({},attrs)]));assert.equal(f.messages.length,0);}
});

test('page styles, host refresh colors and document root colors have independent ownership',()=>{
 const f=fixture(),html=f.root.document.documentElement,values=new Map([['background-color',{value:'#101010',priority:'important'}]]);
 Object.defineProperty(html,'style',{configurable:true,value:{getPropertyValue:name=>values.get(name)?.value||'',getPropertyPriority:name=>values.get(name)?.priority||'',setProperty(name,value,priority=''){values.set(name,{value,priority});}}});
 const first=f.node({'page-style':'background-color:#abcdef','background-color':'#222222','root-background-color':'#333333'});
 f.controller.visibility(true);f.controller.update([first]);assert.equal(f.mount.style.backgroundColor,'rgb(171, 205, 239)');assert.equal(html.style.getPropertyValue('background-color'),'#333333');assert.equal(f.messages.at(-1).window.backgroundColor,'#222222');
 const mount=f.root.document.createElement('section');f.root.document.body.append(mount);
 const second=factory(f.root,{mount,Error,style:value=>value,live:()=>true,emit(){},send(){}}),next=f.node({'root-background-color':'#444444'});
 second.update([next]);assert.equal(html.style.getPropertyValue('background-color'),'#333333');second.visibility(true);assert.equal(html.style.getPropertyValue('background-color'),'#444444');
 f.controller.update([{...first,attrs:{...first.attrs,'root-background-color':'#555555'}}]);assert.equal(html.style.getPropertyValue('background-color'),'#444444');
 second.visibility(false);assert.equal(html.style.getPropertyValue('background-color'),'#555555');f.controller.visibility(false);assert.equal(html.style.getPropertyValue('background-color'),'#101010');assert.equal(html.style.getPropertyPriority('background-color'),'important');
 second.visibility(true);f.controller.dispose();assert.equal(html.style.getPropertyValue('background-color'),'#444444');second.update([]);assert.equal(html.style.getPropertyValue('background-color'),'#101010');assert.equal(html.style.getPropertyPriority('background-color'),'important');second.dispose();
});
