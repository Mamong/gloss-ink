'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createDom}=require('./helpers/dom.cjs');
const source=process.env.PROGRESS_SOURCE_ROOT||require('node:path').resolve(__dirname,'../packages/builtin-components');
const patch=require(require('node:path').join(source,'progress'));
const {createBrowserComponents}=require(source);
function fixture(t,start=1){
 const document=createDom(),root=document.defaultView,frames=new Map(),timers=new Map(),events=[];let sequence=start,reduced=false;
 root.requestAnimationFrame=callback=>{const id=sequence++;frames.set(id,callback);return id;};root.cancelAnimationFrame=id=>frames.delete(id);
 root.setTimeout=(callback,delay)=>{const id=sequence++;timers.set(id,{callback,delay});return id;};root.clearTimeout=id=>timers.delete(id);
 root.matchMedia=()=>({matches:reduced});const element=document.createElement('div');document.body.append(element);
 const update=(attrs,live)=>patch(element,attrs,Error,(name,detail)=>events.push({name,...detail}),live);
 const frame=()=>{const entries=[...frames];frames.clear();for(const [,callback]of entries)callback();};
 const complete=()=>{const entries=[...timers];timers.clear();for(const [,timer]of entries)timer.callback();};
 t.after(()=>{patch.release?.(element);root.close();});
 return {document,root,element,frames,timers,events,update,frame,complete,reduce:()=>{reduced=true;}};
}
test('an initial backwards animation paints from zero and retains its first frame',t=>{
 const f=fixture(t);f.update({active:true,percent:70,duration:60});assert.equal(f.frames.size,1);assert.equal(f.element.weappProgress.fill.style.width,'0%');
 f.frame();assert.equal(f.element.weappProgress.fill.style.width,'70%');assert.equal(f.element.weappProgress.fill.style.transition,'width 60ms linear');assert.equal(f.timers.size,0);
});
test('zero duration paints immediately without an animation frame and completes once',t=>{
 const f=fixture(t);f.update({active:true,percent:100,duration:0});assert.equal(f.frames.size,0);assert.equal(f.element.weappProgress.fill.style.width,'100%');assert.equal([...f.timers.values()][0].delay,0);
 f.complete();f.update({active:true,percent:100,duration:0,'show-info':true});f.complete();assert.deepEqual(f.events,[{name:'activeend',percent:100}]);
});
test('updating the target replaces the pending frame and rejects a stale callback',t=>{
 const f=fixture(t);f.update({active:true,percent:100,duration:60});const stale=[...f.frames.values()][0];f.update({active:true,percent:40,duration:60});assert.equal(f.frames.size,1);stale();assert.equal(f.element.weappProgress.fill.style.width,'0%');
 f.frame();assert.equal(f.element.weappProgress.fill.style.width,'40%');assert.equal(f.timers.size,0);assert.deepEqual(f.events,[]);
});
test('color and info updates preserve pending frames and completion deadlines',t=>{
 const f=fixture(t),attrs={active:true,percent:100,duration:60};f.update(attrs);const id=[...f.frames.keys()][0];f.update({...attrs,activeColor:'#123456','show-info':true});assert.equal([...f.frames.keys()][0],id);
 f.frame();const timer=[...f.timers.keys()][0];assert.equal([...f.timers.values()][0].delay,60);f.update({...attrs,'font-size':20});assert.equal([...f.timers.keys()][0],timer);f.complete();assert.deepEqual(f.events,[{name:'activeend',percent:100}]);
});
test('a changed target cancels obsolete completion and subsequent inactive updates paint immediately',t=>{
 const f=fixture(t);f.update({active:true,percent:100,duration:60});f.frame();const stale=[...f.timers.values()][0].callback;
 f.update({active:false,percent:50});assert.equal(f.timers.size,0);assert.equal(f.frames.size,0);stale();assert.equal(f.element.weappProgress.fill.style.width,'50%');assert.deepEqual(f.events,[]);
});
test('forwards updates retain the previous target instead of resetting to zero',t=>{
 const f=fixture(t);f.update({percent:35});f.update({active:true,percent:80,'active-mode':'forwards',duration:60});assert.equal(f.frames.size,0);assert.equal(f.element.weappProgress.fill.style.width,'80%');assert.equal(f.element.weappProgress.fill.style.transition,'width 60ms linear');
 f.update({active:true,percent:20,'active-mode':'backwards',duration:60});assert.equal(f.element.weappProgress.fill.style.width,'0%');f.frame();assert.equal(f.element.weappProgress.fill.style.width,'20%');
});
test('reduced motion paints without a frame and uses a zero delay completion',t=>{
 const f=fixture(t);f.reduce();f.update({active:true,percent:100,duration:500});assert.equal(f.frames.size,0);assert.equal(f.element.weappProgress.fill.style.width,'100%');assert.equal(f.element.weappProgress.fill.style.transition,'none');assert.equal([...f.timers.values()][0].delay,0);f.complete();assert.equal(f.events.length,1);
});
test('hidden and inactive owners cannot receive completion events',t=>{
 const f=fixture(t);let live=true;f.update({active:true,percent:100,duration:60},()=>live);f.frame();live=false;f.complete();assert.deepEqual(f.events,[]);
 f.update({active:true,percent:50,duration:60});f.update({active:true,percent:100,duration:60,hidden:true});assert.equal(f.frames.size,0);assert.equal(f.timers.size,0);assert.equal(f.element.weappProgress.fill.style.width,'100%');
});
test('removing the builtin cancels its scheduled work, including already captured callbacks',t=>{
 const f=fixture(t),components=createBrowserComponents(f.root,{emit:(element,name,detail)=>f.events.push({name,...detail})});let node={tag:'progress',attrs:{active:true,percent:100,duration:60},dataset:{}};
 components.create(f.element,node);components.attributes(f.element,undefined,node);assert.equal(f.frames.size,1);const staleFrame=[...f.frames.values()][0];components.remove(f.element,node);assert.equal(f.frames.size,0);staleFrame();assert.equal(f.timers.size,0);assert.equal(f.element.weappProgress.fill.style.width,'0%');
 components.create(f.element,node);node={...node,attrs:{active:true,percent:100,duration:61}};components.attributes(f.element,undefined,node);f.frame();const staleTimer=[...f.timers.values()][0].callback;components.remove(f.element,node);assert.equal(f.timers.size,0);staleTimer();assert.deepEqual(f.events,[]);
});
test('layout defaults leave business inline styles intact on creation and updates',t=>{
 const f=fixture(t),components=createBrowserComponents(f.root);const first={tag:'progress',attrs:{style:'display:inline-flex;width:210px;gap:3px;align-items:flex-start',percent:50},dataset:{}};
 components.create(f.element,first);components.attributes(f.element,undefined,first);for(const [key,value]of Object.entries({display:'inline-flex',width:'210px',gap:'3px',alignItems:'flex-start'}))assert.equal(f.element.style[key],value);
 const next={...first,attrs:{...first.attrs,percent:80}};components.attributes(f.element,first.attrs,next);assert.equal(f.element.style.width,'210px');assert.equal(f.element.style.gap,'3px');
});
test('invalid updates leave the current scheduled animation and DOM intact',t=>{
 const f=fixture(t);f.update({active:true,percent:70,duration:60});const id=[...f.frames.keys()][0];
 for(const attrs of [{percent:101},{percent:-1},{duration:Infinity},{active:'yes'},{'active-mode':'other'},{activeColor:'red;display:none'}])assert.throws(()=>f.update(attrs));
 assert.equal([...f.frames.keys()][0],id);assert.equal(f.element.getAttribute('aria-valuenow'),'70');f.frame();assert.equal(f.element.weappProgress.fill.style.width,'70%');
});

test('a cancelled callback cannot erase the replacement frame handle',t=>{
 const f=fixture(t);f.update({active:true,percent:100,duration:60});const stale=[...f.frames.values()][0];f.update({active:true,percent:40,duration:60});const replacement=[...f.frames.keys()][0];stale();assert.equal(f.element.weappProgress.frame,replacement);patch.release(f.element);assert.equal(f.frames.size,0);
});

test('zero-valued scheduler handles are cancelled on release',t=>{
 const f=fixture(t,0);f.update({active:true,percent:80,duration:60});assert.equal(f.element.weappProgress.frame,0);patch.release(f.element);assert.equal(f.frames.size,0);
});
