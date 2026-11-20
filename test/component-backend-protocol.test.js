const test=require('node:test'),assert=require('node:assert/strict');
// Shared protocol behavior originally covered through the Now SDK facade.
const view=require('../packages/component-backend').createViewProtocol();
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function pair(mode='direct',overrides={}){
 const controls=[],events=[],queue=[],timers=new Map(),invocations=[],renders=[];let timer=0,logic,receiver;
 const dispatch=fn=>mode==='direct'?fn():queue.push(fn);
 const options={id:'v1',route:'pages/example',data:{count:0,nested:{title:'old'},removeMe:true},visible:true,setTimeout(fn){const id=++timer;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)};
 receiver=view.createReceiver({...options,render(data,forced,settings){renders.push({data,forced,settings});return overrides.render?.(data,forced,settings);},result:overrides.result,visibility:overrides.visibility,destroy:overrides.destroy,send(value){events.push(structuredClone(value));dispatch(()=>logic.receive(structuredClone(value)));}});
 logic=view.createLogic({...options,onError:overrides.onError||(()=>{}),invoke(binding,event){invocations.push({binding,event});return overrides.invoke?.(binding,event);},send(value){controls.push(structuredClone(value));dispatch(()=>receiver.receive(structuredClone(value)));}});
 return{logic,receiver,controls,events,timers,invocations,renders,flush(){let count=0;while(queue.length){if(++count>10000)throw Error('unexpected message loop');queue.shift()();}},queue};
}
for(const mode of ['direct','queued']){
 test(mode+' view driver snapshots data, applies root deltas and acknowledges ordered revisions',async()=>{
  const f=pair(mode);let receipt=f.logic.create();assert.equal(receipt.settled,mode==='direct');f.flush();await receipt.done;
  const next={count:1,nested:{title:'next'}};receipt=f.logic.update(next,['nested']);next.nested.title='mutated';f.flush();await receipt.done;
  assert.deepEqual(f.controls.at(-1).set,{count:1,nested:{title:'next'}});assert.deepEqual(f.controls.at(-1).remove,['removeMe']);assert.deepEqual(f.renders[0].data,{count:1,nested:{title:'next'}});
  assert.deepEqual(f.renders[0].forced,['nested']);assert.equal(f.logic.inspect().pending,0);assert.equal(f.receiver.inspect().revision,2);
  receipt=f.logic.visibility(false);f.flush();await receipt.done;assert.equal(f.receiver.isVisible(),false);
  f.logic.destroy();f.flush();assert.equal(f.receiver.inspect().closed,true);assert.equal(f.timers.size,0);
 });
 test(mode+' view driver routes by node identity and binding epoch and ignores stale or replayed events',async()=>{
  const f=pair(mode);f.logic.create();f.flush();const node=f.receiver.node(),target=f.receiver.node();
  f.receiver.bind(target,{id:'child',dataset:{value:2}},[]);f.receiver.bind(node,{id:'button',dataset:{value:1}},[{key:'tap:false:false',name:'tap',handler:'first'}]);f.flush();
  f.receiver.event(node,'tap:false:false',{targetNodeId:target,detail:{x:1},timeStamp:12});f.flush();assert.equal(f.invocations.length,1);assert.equal(f.invocations[0].binding.handler,'first');assert.equal(f.invocations[0].event.target.id,'child');
  const packet=f.events.find(value=>value.type==='event');assert.equal(f.logic.receive(packet),false);
  f.receiver.bind(node,{id:'button',dataset:{value:3}},[{key:'tap:false:false',name:'tap',handler:'second'}]);f.flush();assert.equal(f.logic.receive({...packet,eventId:999}),false);
  f.receiver.event(node,'tap:false:false',{detail:{},timeStamp:13});f.flush();assert.equal(f.invocations.at(-1).binding.handler,'second');assert.equal(f.invocations.at(-1).event.currentTarget.dataset.value,3);
  f.logic.visibility(false);f.flush();assert.equal(f.receiver.event(node,'tap:false:false'),false);
  f.logic.visibility(true);f.flush();f.receiver.remove(node);f.flush();assert.equal(f.logic.receive({...packet,eventId:1000}),false);f.logic.destroy();f.flush();
 });
}

test('input replies only affect the latest live binding and events do not carry a method chosen by the view',async()=>{
 const results=[],releases=[];const f=pair('queued',{result:(id,value)=>results.push({id,value}),invoke:()=>new Promise(resolve=>releases.push(resolve))});
 f.logic.create();f.flush();const node=f.receiver.node();f.receiver.bind(node,{id:'input',dataset:{}},[{key:'input',name:'input',handler:'normalized'}]);f.flush();
 f.receiver.event(node,'input',{detail:{value:'first'}});f.receiver.event(node,'input',{detail:{value:'second'}});f.flush();
 assert.equal(f.events.filter(value=>value.type==='event').some(value=>Object.hasOwn(value,'handler')),false);
 releases[1]('SECOND');await tick();f.flush();releases[0]('FIRST');await tick();f.flush();assert.deepEqual(results,[{id:node,value:'SECOND'}]);
 f.receiver.event(node,'input',{detail:{value:'third'}});f.flush();f.receiver.bind(node,{id:'input',dataset:{}},[{key:'input',name:'input',handler:'replacement'}]);f.flush();releases[2]('OLD');await tick();f.flush();assert.equal(results.length,1);f.logic.destroy();f.flush();
});

test('renderer errors stop events until an explicit full reset and duplicate commits do not rerender',async()=>{
 let fail=true;const f=pair('direct',{render(){if(fail)throw Object.assign(new Error('render failed'),{code:'VIEW_RENDER'});}});f.logic.create();
 const receipt=f.logic.update({count:1});await assert.rejects(receipt.done,{code:'VIEW_RENDER'});assert.equal(f.logic.inspect().broken,true);assert.equal(f.receiver.inspect().broken,true);
 fail=false;const reset=f.logic.reset({count:2});await reset.done;assert.equal(f.receiver.inspect().data.count,2);assert.equal(f.renders.at(-1).settings.reset,true);assert.equal(f.logic.inspect().broken,false);
 const packet=f.controls.at(-1),count=f.renders.length;f.receiver.receive(packet);assert.equal(f.renders.length,count);f.logic.destroy();
});

test('lost revisions fail with a resync error and reset can bootstrap a lost create',async()=>{
 const f=pair('queued');const create=f.logic.create();f.queue.shift(); // deliberately lose create
 const changed=f.logic.update({count:1});f.flush();await assert.rejects(changed.done,{code:'VIEW_REVISION'});
 const reset=f.logic.reset({count:3});f.flush();await reset.done;assert.equal(f.receiver.inspect().data.count,3);assert.equal(f.receiver.inspect().revision,3);
 f.logic.destroy();f.flush();await assert.rejects(create.done,{code:'VIEW_RESET'});assert.equal(f.timers.size,0);
});

test('asynchronous renderer commits serialize and callbacks observe ack only after driver completion',async()=>{
 const releases=[],f=pair('queued',{render:()=>new Promise(resolve=>releases.push(resolve))});f.logic.create();f.flush();
 const a=f.logic.update({count:1}),b=f.logic.update({count:2});f.flush();assert.equal(releases.length,1);assert.equal(a.settled,false);assert.equal(b.settled,false);
 releases[0]();await tick();f.flush();await a.done;assert.equal(b.settled,false);assert.equal(releases.length,2);
 releases[1]();await tick();f.flush();await b.done;assert.equal(f.receiver.inspect().data.count,2);f.logic.destroy();f.flush();
});

test('destroy supersedes in-flight render, rejects pending receipts and ignores late acknowledgements',async()=>{
 let release,destroyed=0;const f=pair('queued',{render:()=>new Promise(resolve=>{release=resolve;}),destroy:()=>destroyed++});f.logic.create();f.flush();
 const receipt=f.logic.update({count:1});f.flush();f.logic.destroy();f.flush();await assert.rejects(receipt.done,{code:'PAGE_UNLOADED'});assert.equal(destroyed,1);release();await tick();f.flush();assert.equal(f.receiver.inspect().closed,true);assert.equal(f.logic.inspect().pending,0);assert.equal(f.timers.size,0);
});

test('view protocol rejects executable objects, prototype paths, oversized data and unknown versions',()=>{
 for(const value of [{get x(){throw Error('getter must not run');}},{x:undefined},{x:new Map()},JSON.parse('{"__proto__":{}}'),{x:Infinity}])assert.throws(()=>view.snapshot(value));
 assert.throws(()=>view.snapshot({x:'x'.repeat(view.limits.packetCharacters)}),{code:'VIEW_LIMIT'});
 const f=pair();f.logic.create();assert.equal(f.receiver.receive({protocol:'now-view-v2',type:'destroy',revision:2,viewId:'v1'}),false);
 assert.throws(()=>f.logic.update({x:1},['__proto__']),{code:'VIEW_PROTOCOL'});assert.equal(f.logic.inspect().revision,1);f.logic.destroy();
});

test('missing acknowledgements time out with bounded pending work and terminal destroy clears timers',async()=>{
 const f=pair('queued'),receipts=[];
 for(let index=0;index<view.limits.pending;index++)receipts.push(index===0?f.logic.create():f.logic.update({count:index}));
 assert.throws(()=>f.logic.update({count:99}),{code:'VIEW_LIMIT'});for(const timer of [...f.timers.values()])timer();
 await Promise.all(receipts.map(receipt=>assert.rejects(receipt.done,{code:'VIEW_TIMEOUT'})));assert.equal(f.logic.inspect().broken,true);f.logic.destroy();f.flush();
});

test('event failures are reported once and emit serializable errors without method execution on wrong instances',()=>{
 let reports=0;const f=pair('direct',{invoke(){throw Object.assign(new Error('business failed'),{code:'APP_ERROR'});},onError(){reports++;}});f.logic.create();const node=f.receiver.node();
 f.receiver.bind(node,{id:'button',dataset:{}},[{key:'tap',name:'tap',handler:'method'}]);
 assert.equal(f.logic.receive({protocol:view.protocol,viewId:'other',type:'ack',revision:1,ok:true}),false);
 f.receiver.event(node,'tap',{detail:1});assert.equal(reports,1);assert.equal(f.invocations.length,1);const result=f.controls.find(packet=>packet.type==='event-result');assert.equal(result.ok,false);assert.deepEqual(result.error,{code:'APP_ERROR',message:'business failed'});f.logic.destroy();
});

test('reset discards delayed bindings and events from before the new full-state revision',async()=>{
 const f=pair('queued');f.logic.create();f.flush();const node=f.receiver.node();f.receiver.bind(node,{id:'old',dataset:{}},[{key:'tap',name:'tap',handler:'oldHandler'}]);f.flush();
 f.receiver.event(node,'tap');f.flush();const binding=f.events.find(packet=>packet.type==='bind'),event=f.events.find(packet=>packet.type==='event');assert.equal(f.invocations.length,1);
 const receipt=f.logic.reset({count:9});assert.equal(f.logic.receive(binding),false);assert.equal(f.logic.receive({...event,eventId:999}),false);f.flush();await receipt.done;
 assert.equal(f.logic.receive({...binding,epoch:999}),false);assert.equal(f.logic.receive({...event,eventId:1000,epoch:999}),false);assert.equal(f.invocations.length,1);f.logic.destroy();f.flush();
});

test('input epoch invalidation rejects an outstanding return without retiring its live handler binding',async()=>{
 const results=[];let release;const f=pair('direct',{invoke:()=>new Promise(resolve=>{release=resolve;}),result:(node,value)=>results.push(value)});f.logic.create();f.logic.visibility(true);const node=f.receiver.node();f.receiver.bind(node,{id:'input',dataset:{}},[{key:'input',name:'input',handler:'transform'}]);f.receiver.event(node,'input',{detail:{value:'first'}});f.receiver.invalidateInput(node);release('STALE');await tick();assert.deepEqual(results,[]);f.receiver.event(node,'input',{detail:{value:'second'}});release('CURRENT');await tick();assert.deepEqual(results,['CURRENT']);f.logic.destroy();
});

test('input object replacements preserve cursor and reject stale or malformed replies',async()=>{
 const results=[],releases=[],f=pair('queued',{result:(id,value)=>results.push({id,value}),invoke:()=>new Promise(resolve=>releases.push(resolve))});f.logic.create();f.flush();const node=f.receiver.node();f.receiver.bind(node,{id:'input',dataset:{}},[{key:'input',name:'input',handler:'replace'}]);f.flush();f.receiver.event(node,'input',{detail:{value:'old'}});f.receiver.event(node,'input',{detail:{value:'new'}});f.flush();releases[1]({value:'NEW',cursor:1});await tick();f.flush();releases[0]({value:'OLD',cursor:0});await tick();f.flush();assert.deepEqual(results,[{id:node,value:{value:'NEW',cursor:1}}]);
 for(const value of [{value:3},{value:'bad',cursor:-2},{value:'bad',cursor:1.5},{value:'bad',extra:true}])assert.equal(view.inputResult(value),undefined);
 let touched=false;const getter={get value(){touched=true;return'bad';}};assert.equal(view.inputResult(getter),undefined);assert.equal(touched,false);f.logic.destroy();f.flush();
});
