function createViewProtocol() {
  'use strict';
  const protocol = 'now-view-v1', version = 1;
  const limits = Object.freeze({dataCharacters: 524288, packetCharacters: 1048576, eventCharacters: 131072, nodes: 12000, pending: 64, timeout: 5000});
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const token = value => typeof value === 'string' && /^[A-Za-z0-9:_-]{1,80}$/.test(value);
  const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
  function error(code, message) { return Object.assign(new Error(message), {code}); }
  function inputResult(value) {
    if(typeof value==='string')return value;
    if(!object(value)||Object.keys(value).some(key=>!['value','cursor'].includes(key)))return undefined;
    const text=Object.getOwnPropertyDescriptor(value,'value'),cursor=Object.getOwnPropertyDescriptor(value,'cursor');
    if(!text||!Object.hasOwn(text,'value')||typeof text.value!=='string'||cursor&&(!Object.hasOwn(cursor,'value')||!Number.isSafeInteger(cursor.value)||cursor.value< -1||cursor.value>1000000))return undefined;
    return {value:text.value,...(cursor?{cursor:cursor.value}:{})};
  }
  function snapshot(value, maximum = limits.packetCharacters) {
    const seen = new Set();
    function visit(value, depth) {
      if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
      if (!value || typeof value !== 'object' || depth > 64 || seen.has(value)) throw error('VIEW_PROTOCOL', '视图消息只能包含有限深度的 JSON 数据');
      const proto = Object.getPrototypeOf(value);
      if (!Array.isArray(value) && proto !== null && Object.getPrototypeOf(proto) !== null) throw error('VIEW_PROTOCOL', '视图消息不允许类实例或 DOM');
      if (Object.getOwnPropertySymbols(value).some(key => Object.getOwnPropertyDescriptor(value,key).enumerable)) throw error('VIEW_PROTOCOL', '视图消息不允许 Symbol');
      seen.add(value); const result = Array.isArray(value) ? [] : Object.create(null), keys = Object.keys(value);
      if (Array.isArray(value) && (keys.length !== value.length || keys.some((key,index) => key !== String(index)))) throw error('VIEW_PROTOCOL', '视图数组不允许空位或额外属性');
      for (const key of keys) {
        const item = Object.getOwnPropertyDescriptor(value,key);
        if (forbidden.has(key) || !Object.hasOwn(item,'value')) throw error('VIEW_PROTOCOL', '视图消息不允许原型字段或访问器');
        result[key] = visit(item.value, depth + 1);
      }
      seen.delete(value); return result;
    }
    const text = JSON.stringify(visit(value,0));
    if (text.length > maximum) throw error('VIEW_LIMIT', '视图消息超过大小限制');
    return JSON.parse(text);
  }
  function data(value) { const result = snapshot(value, limits.dataCharacters); if (!object(result)) throw error('VIEW_PROTOCOL', '视图数据必须为 JSON 对象'); return result; }
  function fields(value, names) { if (!object(value) || Object.keys(value).some(key => !names.includes(key))) throw error('VIEW_PROTOCOL', '视图消息字段无效'); }
  function control(input) {
    const value = snapshot(input);
    const names={create:['route','kind','parentId','data','visible'],update:['set','remove','forced'],reset:['route','kind','parentId','data','visible','forced'],visibility:['visible'],destroy:[]};
    fields(value,['protocol','viewId','type','revision',...(names[value.type]||[])]);
    if (value.protocol !== protocol || !token(value.viewId) || !Number.isSafeInteger(value.revision) || value.revision < 1 || !['create','update','reset','visibility','destroy'].includes(value.type)) throw error('VIEW_PROTOCOL','视图控制消息无效');
    if (['create','reset'].includes(value.type)) value.data = data(value.data);
    if (['create','reset'].includes(value.type) && (typeof value.route !== 'string' || !value.route || value.route.length > 2048 || !['page','component'].includes(value.kind) || value.parentId !== undefined && !token(value.parentId) || typeof value.visible !== 'boolean')) throw error('VIEW_PROTOCOL','视图实例信息无效');
    if (value.type === 'visibility' && typeof value.visible !== 'boolean') throw error('VIEW_PROTOCOL','视图可见性无效');
    if (value.type === 'update') {
      value.set = data(value.set);
      if (!Array.isArray(value.remove) || value.remove.some(key => typeof key !== 'string' || forbidden.has(key)) || new Set(value.remove).size !== value.remove.length || value.remove.some(key => Object.hasOwn(value.set,key))) throw error('VIEW_PROTOCOL','视图删除字段无效');
    }
    if (['update','reset'].includes(value.type) && (!Array.isArray(value.forced) || value.forced.some(key => typeof key !== 'string' || forbidden.has(key)) || new Set(value.forced).size !== value.forced.length)) throw error('VIEW_PROTOCOL','视图强制更新字段无效');
    return value;
  }
  function deferred(revision) {
    let resolve, reject, settled = false, failure;
    const done = new Promise((yes,no) => { resolve=yes; reject=no; }); done.catch(() => {});
    return {revision, done, get settled(){return settled;}, get error(){return failure;}, finish(value){if(!settled){settled=true;resolve(value);}}, fail(value){if(!settled){settled=true;failure=value;reject(value);}}};
  }
  function createLogic(options) {
    if (!token(options.id)) throw error('VIEW_PROTOCOL','视图 ID 无效');
    const pending = new Map(), nodes = new Map();
    const later = options.setTimeout || setTimeout, clear = options.clearTimeout || clearTimeout;
    let current = data(options.data || {}), revision = 0, closed = false, visible = !!options.visible, lastEvent = 0, broken = false, bindingFloor = 1;
    function post(value) { options.send(snapshot({...value,protocol,viewId:options.id})); }
    function commit(type, extra) {
      if (closed) throw error('PAGE_UNLOADED','视图实例已销毁');
      if (pending.size >= limits.pending) throw error('VIEW_LIMIT','视图等待项过多');
      const next = revision + 1, packet = control({...extra,protocol,viewId:options.id,type,revision:next});
      const receipt = deferred(next); revision = next;
      const timer = later(() => { const item=pending.get(next); if(!item)return;pending.delete(next);clear(timer);broken=true;nodes.clear();receipt.fail(error('VIEW_TIMEOUT','等待视图提交超时')); },limits.timeout);
      pending.set(next,{receipt,timer});
      try { options.send(snapshot(packet)); } catch (failure) { clear(timer);pending.delete(next);broken=true;nodes.clear();receipt.fail(failure); }
      return receipt;
    }
    function receive(input) {
      let value; try { value=snapshot(input,limits.eventCharacters); } catch (_) { return false; }
      if (closed || value.protocol !== protocol || value.viewId !== options.id) return false;
      if (value.type === 'ack') {
        const item=pending.get(value.revision); if(!item || typeof value.ok !== 'boolean')return false;
        pending.delete(value.revision);clear(item.timer);
        if(value.ok)item.receipt.finish(value.revision);else {broken=true;nodes.clear();item.receipt.fail(error(value.error?.code||'VIEW_RENDER',value.error?.message||'视图提交失败'));}
        return true;
      }
      if (!Number.isSafeInteger(value.revision) || value.revision < bindingFloor || value.revision > revision || broken) return false;
      if(value.type === 'bind') {
        if(!token(value.nodeId)||!Number.isSafeInteger(value.epoch)||value.epoch<1||!object(value.metadata)||typeof value.metadata.id!=='string'||!object(value.metadata.dataset)||!Array.isArray(value.bindings)||value.bindings.length>64)return false;
        const old=nodes.get(value.nodeId);if(old&&(old.revision>value.revision||old.epoch>value.epoch))return false;
        if(!old&&nodes.size>=limits.nodes)return false;
        const keys=new Set();
        for(const binding of value.bindings){if(!object(binding)||typeof binding.key!=='string'||typeof binding.handler!=='string'||typeof binding.name!=='string'||keys.has(binding.key))return false;keys.add(binding.key);}
        nodes.set(value.nodeId,{revision:value.revision,epoch:value.epoch,metadata:value.metadata,bindings:value.bindings});return true;
      }
      if(value.type === 'unbind') {const node=nodes.get(value.nodeId);if(node&&node.epoch===value.epoch)nodes.delete(value.nodeId);return true;}
      if(value.type !== 'event' || !visible || !Number.isSafeInteger(value.eventId)||value.eventId<=lastEvent)return false;
      const node=nodes.get(value.nodeId), binding=node?.bindings.find(item=>item.key===value.key);
      const target=value.targetNodeId===undefined?null:nodes.get(value.targetNodeId);
      if(!node||!binding||node.epoch!==value.epoch||value.targetNodeId!==undefined&&(!target||target.epoch!==value.targetEpoch))return false;
      if(!Array.isArray(value.touches)||!Array.isArray(value.changedTouches)||!Number.isFinite(value.timeStamp))return false;
      lastEvent=value.eventId;
      const event={type:binding.name,timeStamp:value.timeStamp,target:target?snapshot(target.metadata):{id:'',dataset:{}},currentTarget:snapshot(node.metadata),detail:value.detail,touches:value.touches,changedTouches:value.changedTouches};
      function finish(result,failure){
        if(closed)return;
        post({type:'event-result',revision:value.revision,eventId:value.eventId,nodeId:value.nodeId,epoch:value.epoch,ok:!failure,...(failure?{error:{code:failure.code||'APP_ERROR',message:failure.message||String(failure)}}:binding.name==='input'&&inputResult(result)!==undefined?{value:inputResult(result)}:{})});
        if(failure&&options.onError)options.onError(failure);
      }
      let result;
      try {result=options.invoke(snapshot(binding),snapshot(event));}
      catch(failure){finish(undefined,failure);return true;}
      if(result&&typeof result.then==='function')Promise.resolve(result).then(value=>finish(value),failure=>finish(undefined,failure));else finish(result);
      return true;
    }
    return Object.freeze({id:options.id,receive,
      create(){return commit('create',{route:options.route,kind:options.kind||'page',...(options.parentId?{parentId:options.parentId}:{}),data:current,visible});},
      update(value,forced=[]){const next=data(value),set=Object.create(null),remove=Object.keys(current).filter(key=>!Object.hasOwn(next,key));for(const key of Object.keys(next))if(!Object.hasOwn(current,key)||JSON.stringify(current[key])!==JSON.stringify(next[key]))set[key]=next[key];const receipt=commit('update',{set,remove,forced:[...new Set(forced)]});current=next;return receipt;},
      reset(value=current){const next=data(value);for(const item of pending.values()){clear(item.timer);item.receipt.fail(error('VIEW_RESET','视图重同步取代旧提交'));}pending.clear();bindingFloor=revision+1;broken=false;nodes.clear();const receipt=commit('reset',{route:options.route,kind:options.kind||'page',...(options.parentId?{parentId:options.parentId}:{}),visible,data:next,forced:Object.keys(next)});current=next;return receipt;},
      visibility(value){if(typeof value!=='boolean')throw error('VIEW_PROTOCOL','可见性必须为布尔值');const receipt=commit('visibility',{visible:value});visible=value;return receipt;},
      destroy(){if(closed)return;closed=true;visible=false;nodes.clear();for(const item of pending.values()){clear(item.timer);item.receipt.fail(error('PAGE_UNLOADED','视图已销毁'));}pending.clear();try{post({type:'destroy',revision:++revision});}catch(_){}},
      inspect(){return {id:options.id,revision,closed,visible,broken,pending:pending.size,nodes:nodes.size,data:snapshot(current)};}
    });
  }
  function createReceiver(options) {
    if(!token(options.id))throw error('VIEW_PROTOCOL','视图 ID 无效');
    const nodes=new Map();let current={},revision=0,rendering=0,created=false,closed=false,visible=false,broken=false,nextNode=0,nextEpoch=0,nextEvent=0,lastPacket='';
    function post(value){options.send(snapshot({...value,protocol,viewId:options.id}));}
    function ack(value, failure){post({type:'ack',revision:value.revision,ok:!failure,...(failure?{error:{code:failure.code||'VIEW_RENDER',message:failure.message||String(failure)}}:{})});}
    const queue=[];
    function apply(value){
      if(closed)return false;
      const encoded=JSON.stringify(value);
      if(value.revision===revision&&encoded===lastPacket){ack(value);return true;}
      if(value.revision<=revision||value.type!=='reset'&&value.revision!==revision+1||broken&&value.type!=='reset') {ack(value,error('VIEW_REVISION','视图版本不连续，需要完整重同步'));return false;}
      if(value.type==='create'&&created||!['create','reset'].includes(value.type)&&!created){ack(value,error('VIEW_PROTOCOL','视图生命周期顺序无效'));return false;}
      let next=current;
      function drain(){while(!closed&&!rendering&&queue.length)apply(queue.shift());}
      function finish(failure){
        if(closed||rendering!==value.revision)return;
        if(failure){rendering=0;broken=true;nodes.clear();ack(value,failure);}
        else {if(value.type==='create'||value.type==='reset'){created=true;visible=value.visible;}if(value.type==='visibility'){visible=value.visible;options.visibility?.(visible);}current=next;revision=value.revision;lastPacket=encoded;broken=false;rendering=0;ack(value);}
        drain();
      }
      try{
        if(value.type==='create'||value.type==='reset')next=data(value.data);
        if(value.type==='update'){next={...current,...value.set};for(const key of value.remove)delete next[key];next=data(next);}
        rendering=value.revision;
        if(value.type==='reset')nodes.clear();
        const result=['update','reset'].includes(value.type)?options.render(snapshot(next),value.forced,{reset:value.type==='reset',revision:value.revision}):undefined;
        if(result&&typeof result.then==='function')Promise.resolve(result).then(()=>finish(),failure=>finish(failure));else finish();
        return true;
      }catch(failure){if(!rendering)rendering=value.revision;finish(failure);return false;}
    }
    function receive(input){
      let value;try{value=snapshot(input);}catch(_){return false;}
      if(value.protocol!==protocol||value.viewId!==options.id)return false;
      if(value.type==='event-result'){
        const node=nodes.get(value.nodeId);
        if(closed||!visible||!node||node.epoch!==value.epoch||node.lastInput!==value.eventId)return false;
        if(value.ok&&inputResult(value.value)!==undefined&&options.result)options.result(value.nodeId,inputResult(value.value));
        return true;
      }
      try{value=control(value);}catch(failure){if(Number.isSafeInteger(value.revision))ack(value,failure);return false;}
      if(closed)return false;
      if(value.type==='destroy'){
        if(value.revision<=revision)return false;
        closed=true;visible=false;queue.length=0;nodes.clear();current={};options.destroy?.();return true;
      }
      if(rendering){if(queue.length>=limits.pending){ack(value,error('VIEW_LIMIT','视图提交队列已满'));return false;}queue.push(value);return true;}
      return apply(value);
    }
    return Object.freeze({id:options.id,receive,isVisible:()=>visible,
      node(){if(closed||nodes.size>=limits.nodes)throw error('VIEW_LIMIT','视图节点超过限制');const id='n'+(++nextNode);nodes.set(id,{epoch:0,signature:null,lastInput:0});return id;},
      bind(nodeId,metadata,bindings){const node=nodes.get(nodeId);if(!node||closed)return;const descriptor=snapshot({metadata,bindings},limits.eventCharacters),signature=JSON.stringify(descriptor);if(signature===node.signature)return;node.signature=signature;node.epoch=++nextEpoch;node.bindings=descriptor.bindings;node.metadata=descriptor.metadata;post({type:'bind',revision:rendering||revision,nodeId,epoch:node.epoch,...descriptor});},
      invalidateInput(nodeId){const node=nodes.get(nodeId);if(node)node.lastInput=0;},
      remove(nodeId){const node=nodes.get(nodeId);if(!node)return;nodes.delete(nodeId);if(!closed)post({type:'unbind',revision:rendering||revision,nodeId,epoch:node.epoch});},
      event(nodeId,key,input={}){const node=nodes.get(nodeId);if(closed||!visible||!node?.epoch)return false;const binding=node.bindings.find(item=>item.key===key);if(!binding)return false;const eventId=++nextEvent;if(binding.name==='input')node.lastInput=eventId;const target=nodes.get(input.targetNodeId);post({type:'event',revision:rendering||revision,nodeId,epoch:node.epoch,eventId,key,...(target?.epoch?{targetNodeId:input.targetNodeId,targetEpoch:target.epoch}:{}),detail:Object.hasOwn(input,'detail')?input.detail:{},touches:input.touches||[],changedTouches:input.changedTouches||[],timeStamp:Number.isFinite(input.timeStamp)?input.timeStamp:0});return true;},
      inspect(){return {id:options.id,revision,closed,visible,broken,nodes:nodes.size,data:snapshot(current)};}
    });
  }
  function connect(options){let logic;const receiver=createReceiver({...options,send:value=>logic.receive(value)});logic=createLogic({...options,send:value=>receiver.receive(value)});const receipt=logic.create();if(receipt.error)throw receipt.error;return Object.freeze({logic,receiver});}
  return Object.freeze({version,protocol,limits,snapshot,inputResult,createLogic,createReceiver,connect});
}

module.exports = createViewProtocol;
