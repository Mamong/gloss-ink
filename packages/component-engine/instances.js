'use strict';
const ComponentError = require('./error');
const createComponentSelector = require('./selectors');

function createInstanceRegistry(options) {
  'use strict';
  const {engine,execution:timers={run:(_owner,callback)=>callback(),dispose(){}},selector=createComponentSelector(),port:protocol,platform={},resolveComponent,usingComponents,metrics}=options;
  const records=new Map(),placements=new Map(),reconnecting=new Map();let sequence=0,nextCallback=0,linking=false;
  const copy=value=>protocol.snapshot(value);
  const fail=(code,message)=>{throw new ComponentError(message,{code});};
  const token=value=>typeof value==='string'&&/^[A-Za-z0-9:_-]{1,80}$/.test(value);
  const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  function record(id,cleanup=false){const value=records.get(id);if(!value||value.closing&&!cleanup)fail('PAGE_UNLOADED','组件或页面实例已销毁');return value;}
  function instance(value){return value.kind==='page'?value.page:value.controller?.instance;}
  function notify(value){const page=records.get(value.pageId);if(page&&!page.closing)page.page.change();}
  function descriptor(value){return copy({id:value.id,kind:value.kind,source:value.source,...(value.parentId?{parentId:value.parentId,formField:!!value.controller.formField,externalClasses:value.controller.externalClasses,options:value.controller.options,generics:value.generics||{}}: {})});}
  function registerPage(page,source){const id='i'+(++sequence);records.set(id,{id,kind:'page',source,pageId:id,page,children:new Set(),tree:new Map(),treeRevision:0,callbacks:new Map(),closing:false});platform.registerPage?.(page,id);return descriptor(record(id));}
  function owned(parent,id){const child=record(id);if(child.parentId!==parent.id)fail('INSTANCE_SCOPE','组件不属于当前模板实例');return child;}
  function create(parent,value){
    if(!plain(value)||!token(value.nodeId)||typeof value.source!=='string'||!Object.values({...usingComponents[parent.source],...parent.generics}).includes(value.source)||typeof value.key!=='string'||value.key.length>16384||!plain(value.attrs)||!plain(value.dataset))fail('INVALID_ARGUMENT','组件创建参数无效');
    const placement=parent.id+':'+value.nodeId;if(placements.has(placement))fail('INSTANCE_CONFLICT','节点已有组件实例');
    const attachment=reconnecting.get(parent.pageId);
    if(attachment){
      const existing=[...parent.children].map(id=>records.get(id)).find(item=>item&&!item.closing&&!attachment.claimed.has(item.id)&&item.source===value.source&&item.key===value.key);
      if(existing){
        existing.nodeId=value.nodeId;placements.set(placement,existing.id);attachment.claimed.add(existing.id);
        existing.controller.properties(value.attrs,value.dataset);return descriptor(existing);
      }
    }
    const generics={},available={...usingComponents[parent.source],...parent.generics};for(const[name,spec]of Object.entries(options.componentGenerics?.[value.source]||{})){const alias=value.attrs['generic:'+name],source=alias===undefined?spec.default:available[alias];if(!source)fail('INVALID_ARGUMENT','缺少有效的组件泛型 '+name);generics[name]=source;}
    const id='i'+(++sequence),item={id,kind:'component',generics,source:value.source,parentId:parent.id,pageId:parent.pageId,nodeId:value.nodeId,key:value.key,children:new Set(),tree:new Map(),treeRevision:0,connected:false,attached:false,links:new Map(),callbacks:new Map(),closing:false};
    records.set(id,item);parent.children.add(id);placements.set(placement,id);attachment?.claimed.add(id);
    try{
      item.controller=engine.create(resolveComponent(item.source),item.source,{query:()=>queryId(id),attached:()=>item.connected,linked(){item.attached=true;syncRelations();},relations:key=>(item.links.get(key)||[]).filter(id=>records.has(id)).map(id=>instance(records.get(id)))},value.attrs,value.dataset,
        (name,detail,settings)=>{const owner=records.get(parent.id);if(!item.closing&&owner&&!owner.closing)owner.view?.dispatch?.(copy({nodeId:item.nodeId,componentId:id,name,detail,settings}));},()=>notify(item));
      const expected=options.componentOptions?.[item.source];if(expected&&(!!expected.virtualHost!==item.controller.options.virtualHost||expected.styleIsolation!==item.controller.options.styleIsolation)){item.controller.destroy();fail('INVALID_ARGUMENT','definitionFilter不能改变静态组件结构或样式模式');}
      return descriptor(item);
    }catch(error){for(const child of [...item.children])destroy(child);records.delete(id);parent.children.delete(id);placements.delete(placement);throw error;}
  }
  function topology(owner,value){
    if(!plain(value)||!Number.isSafeInteger(value.revision)||value.revision<=owner.treeRevision||!Array.isArray(value.nodes)||value.nodes.length>protocol.limits.nodes)fail('INSTANCE_TREE','组件节点索引版本或大小无效');
    const next=new Map();
    for(const node of value.nodes){
      if(!plain(node)||!token(node.nodeId)||next.has(node.nodeId)||node.parentNodeId!==null&&!next.has(node.parentNodeId)||typeof node.tag!=='string'||typeof node.elementId!=='string'||!Array.isArray(node.classes)||node.classes.some(name=>typeof name!=='string'))fail('INSTANCE_TREE','组件节点索引无效');
      if(node.componentId!==undefined){const child=owned(owner,node.componentId);if(child.nodeId!==node.nodeId)fail('INSTANCE_SCOPE','组件与模板节点不匹配');}
      next.set(node.nodeId,node);
    }
    const moved=value.moved||[];
    if(!Array.isArray(moved)||moved.length>next.size||new Set(moved).size!==moved.length||moved.some(id=>!next.has(id)))fail('INSTANCE_TREE','移动节点索引无效');
    owner.tree=next;owner.treeRevision=value.revision;syncRelations(movedComponents(owner,moved));return {revision:value.revision};
  }
  function relationSource(source,key){const parts=key.startsWith('/')?[]:source.split('/').slice(0,-1);for(const part of key.split('/')){if(!part||part==='.')continue;if(part==='..'){if(!parts.length)return null;parts.pop();}else parts.push(part);}return parts.join('/');}
  function structuralParent(item){
    const owner=records.get(item.parentId);if(!owner)return null;let node=owner.tree.get(item.nodeId);while(node?.parentNodeId){node=owner.tree.get(node.parentNodeId);if(node?.componentId&&records.has(node.componentId))return records.get(node.componentId);}return owner.kind==='component'?owner:null;
  }
  function ancestors(item){const result=[],seen=new Set();for(let current=structuralParent(item);current&&!seen.has(current.id);current=structuralParent(current)){seen.add(current.id);result.push(current.id);}return result;}
  function componentOrder(){const values=[],seen=new Set();function walk(owner){for(const node of owner.tree.values())if(node.componentId&&!seen.has(node.componentId)){const item=records.get(node.componentId);if(item){seen.add(item.id);values.push(item);walk(item);}}}for(const item of records.values())if(item.kind==='page')walk(item);for(const item of records.values())if(item.kind==='component'&&!seen.has(item.id))values.push(item);return values;}
  function movedComponents(owner,roots){
    const result=[],indexes=new Map();
    function children(scope,parent){let index=indexes.get(scope.id);if(!index){index=new Map();for(const node of scope.tree.values()){if(!index.has(node.parentNodeId))index.set(node.parentNodeId,[]);index.get(node.parentNodeId).push(node.nodeId);}indexes.set(scope.id,index);}return index.get(parent)||[];}
    function walk(scope,id){const node=scope.tree.get(id);if(!node)return;for(const child of children(scope,id))walk(scope,child);const component=records.get(node.componentId);if(component){for(const child of children(component,null))walk(component,child);result.push(component.id);}}
    for(const id of roots)walk(owner,id);return result;
  }
  function syncRelations(moved=[]){
    if(reconnecting.size||linking)return;linking=true;try{
      const all=componentOrder(),byId=new Map(all.map(item=>[item.id,item])),previous=new Map(all.map(item=>[item.id,item.links])),next=new Map(),changes=[];
      const opposite={parent:'child',ancestor:'descendant'};
      const matches=(owner,key,relation,target)=>relation.target?target.controller.instance.hasBehavior(relation.target):target.source===relationSource(owner.source,key);
      for(const item of all)next.set(item.id,new Map(Object.keys(item.controller.relations).map(key=>[key,[]])));
      // Upward relations choose one nearest reciprocal ancestor; downward lists derive from those edges.
      for(const item of all)if(item.attached&&!item.closing)for(const [key,relation]of Object.entries(item.controller.relations)){
        if(!opposite[relation.type])continue;
        const path=ancestors(item),candidates=relation.type==='parent'?path.slice(0,1):path;
        for(const id of candidates){const target=byId.get(id);if(!target||!target.attached||target.closing||!matches(item,key,relation,target))continue;
          const keys=Object.entries(target.controller.relations).filter(([otherKey,other])=>other.type===opposite[relation.type]&&matches(target,otherKey,other,item)).map(([otherKey])=>otherKey);
          if(!keys.length)continue;next.get(item.id).get(key).push(id);
          for(const otherKey of keys){const list=next.get(id).get(otherKey);if(!list.includes(item.id))list.push(item.id);}break;
        }
      }
      for(const item of all)item.links=next.get(item.id);
      function pair(item,key,relation,id,hook,links){
        const target=byId.get(id);if(!target)return;
        for(const [otherKey,other]of Object.entries(target.controller.relations))if(other.type===opposite[relation.type]&&(links.get(id)?.get(otherKey)||[]).includes(item.id))changes.push({item:target,key:otherKey,hook,id:item.id});
        changes.push({item,key,hook,id});
      }
      for(const item of all)for(const [key,relation]of Object.entries(item.controller.relations))if(opposite[relation.type]){
        const before=previous.get(item.id).get(key)||[],after=item.links.get(key)||[];
        for(const id of before)if(!after.includes(id))pair(item,key,relation,id,'unlinked',previous);
        for(const id of after)if(!before.includes(id))pair(item,key,relation,id,'linked',next);
      }
      // Reordering does not change edge membership. Notify both ends only for actual moved subtrees.
      for(const id of moved){const item=byId.get(id);if(!item)continue;for(const [key,relation]of Object.entries(item.controller.relations))if(opposite[relation.type]){
        for(const target of item.links.get(key)||[])if((previous.get(id).get(key)||[]).includes(target))pair(item,key,relation,target,'linkChanged',next);
      }}
      for(const {item,key,hook,id}of changes){const target=records.get(id),callback=item.controller.relations[key]?.[hook];if(target&&callback)timers.run(item.controller.instance,()=>callback.call(item.controller.instance,target.controller.instance));}
    }finally{linking=false;}
  }
  function queryIds(owner,expression,all){
    const parts=selector.parse(expression),result=[];
    for(const node of owner.tree.values())if(node.componentId&&records.get(node.componentId)?.parentId===owner.id&&!records.get(node.componentId).closing&&selector.matchesNode(node,parts,owner.tree)){
      result.push(node.componentId);if(!all)break;
    }
    return result;
  }
  function selected(item){return item.controller?.exported?item.controller.exported():instance(item);}
  function select(id,expression,all){const owner=records.get(id);if(!owner||owner.closing)return all?[]:null;const ids=queryIds(owner,expression,all);return all?ids.map(id=>selected(record(id))):ids.length?selected(record(ids[0])):null;}
  function invoke(owner,value){
    if(!plain(value)||!plain(value.binding)||!plain(value.event))fail('INVALID_ARGUMENT','组件事件参数无效');
    const binding=value.binding,event=value.event;
    if(binding.handler==='@navigate'){
      if(!platform.navigate)fail('UNKNOWN_METHOD','当前环境不支持导航');
      return platform.navigate(binding.args,{id:owner.id,kind:owner.kind,source:owner.source,page:record(owner.pageId).page,live:()=>records.has(owner.id)&&!owner.closing});
    }
    const target=instance(owner),callback=Object.hasOwn(target,binding.handler)?target[binding.handler]:null;
    if(typeof callback!=='function')fail('INVALID_ARGUMENT','找不到事件处理函数：'+binding.handler);
    const result=timers.run(target,()=>callback.call(target,event));const normalize=value=>binding.name==='input'?protocol.inputResult(value):undefined;return result&&typeof result.then==='function'?Promise.resolve(result).then(normalize):normalize(result);
  }
  function connect(id,view){
    const item=record(id);if(item.view)fail('INSTANCE_CONFLICT','实例视图已经连接');item.view=view;
    if(item.kind==='component')item.controller.setView({
      render:()=>view.render(),markChanges:value=>view.markChanges(copy(value)),destroy:()=>view.destroy(),
      select:(expression,all)=>select(id,expression,all),pageLifetime:(name,value)=>lifetime(item,name,value)
    });
  }
  function lifetime(owner,name,value){if(!['show','hide','resize'].includes(name))fail('INVALID_ARGUMENT','页面生命周期无效');for(const id of [...owner.children]){const child=records.get(id);if(child&&!child.closing)child.controller.pageLifetime(name,value);}}
  function snapshot(id){const owner=record(id);return copy([...owner.children].map(id=>{const child=record(id);return {id:child.source,key:child.key,data:child.controller.snapshot(),children:snapshot(id)};}));}
  function restore(id,saved){
    const owner=record(id),values=copy(saved);if(!Array.isArray(values)||values.length>1000)fail('INVALID_ARGUMENT','组件快照无效');
    for(const id of [...owner.children]){const child=record(id),value=values.find(item=>item&&item.id===child.source&&item.key===child.key);if(value){child.controller.restore(value.data);restore(id,value.children||[]);}}
  }
  function destroy(id){
    const item=records.get(id);if(!item||item.closing)return;platform.release?.(id);if(item.kind==='page')reconnecting.delete(id);item.closing=true;let failure;
    try{syncRelations();}catch(error){failure=error;}
    try{if(item.kind==='component')item.controller?.destroy();else item.view?.destroy();}catch(error){failure=error;}
    finally{
      for(const child of [...item.children]){try{destroy(child);}catch(error){failure ||= error;}}
      if(item.parentId){records.get(item.parentId)?.children.delete(id);if(placements.get(item.parentId+':'+item.nodeId)===id)placements.delete(item.parentId+':'+item.nodeId);}
      item.tree.clear();item.callbacks.clear();records.delete(id);
    }
    if(failure)throw failure;
  }
  function request(input){
    const message=copy(input);if(metrics){metrics.instanceRequests=(metrics.instanceRequests||0)+1;metrics.instanceBytes=(metrics.instanceBytes||0)+JSON.stringify(message).length;metrics.instanceMethods??={};metrics.instanceMethods[message.method]=(metrics.instanceMethods[message.method]||0)+1;}
if(!plain(message)||message.version!==1||!token(message.ownerId)||typeof message.method!=='string')fail('INVALID_ARGUMENT','实例端口消息无效');
    const owner=record(message.ownerId,message.method==='component.destroy'),value=message.value;
    if(!['describe','data'].includes(message.method)&&!plain(value))fail('INVALID_ARGUMENT','实例端口需要参数对象');
    switch(message.method){
      case 'describe':return descriptor(owner);
      case 'data':return owner.kind==='component'?copy(owner.controller.snapshot()):copy(owner.page.data);
      case 'event':return invoke(owner,value);
      case 'callback.cancel':{if(!Array.isArray(value.ids))fail('INVALID_ARGUMENT','回调列表无效');for(const id of value.ids)owner.callbacks.delete(id);return {};}
      case 'callback':{const fn=owner.callbacks.get(value.id);if(!fn)fail('INSTANCE_CALLBACK','视图提交回调已失效');owner.callbacks.delete(value.id);timers.run(instance(owner),()=>fn.call(instance(owner)));return {};}
      case 'component.create':return create(owner,value);
      case 'component.properties':{const item=owned(owner,value.id);if(!plain(value.attrs)||!plain(value.dataset)||!Array.isArray(value.forced)||value.forced.some(name=>typeof name!=='string')||typeof value.key!=='string')fail('INVALID_ARGUMENT','组件属性参数无效');for(const[name,spec]of Object.entries(options.componentGenerics?.[item.source]||{})){const alias=value.attrs['generic:'+name],target=alias===undefined?spec.default:({...usingComponents[owner.source],...owner.generics})[alias];if(target!==item.generics[name])fail('INVALID_ARGUMENT','组件泛型不能动态重绑定');}item.controller.properties(value.attrs,value.dataset,value.forced);item.key=value.key;return descriptor(item);}
      case 'component.attach':{const item=owned(owner,value.id);if(typeof value.connected!=='boolean')fail('INVALID_ARGUMENT','组件连接状态无效');item.connected=value.connected;const receipt=ancestors(item).some(id=>!records.get(id)?.attached)?null:item.controller.attach();if(receipt&&!receipt.settled)return receipt.done.then(()=>({attached:item.connected&&item.attached}));return {attached:item.connected&&item.attached};}
      case 'component.move':{const item=owned(owner,value.id);item.controller.move();return {};}
      case 'component.destroy':{const item=owned(owner,value.id);destroy(item.id);return {};}
      case 'field.read':{const item=owned(owner,value.id);if(!item.controller.formField)return {formField:false};return copy({formField:true,id:item.id,name:item.controller.instance.properties.name,value:item.controller.instance.data.value});}
      case 'field.reset':{const item=owned(owner,value.id);if(!item.controller.formField)fail('INVALID_ARGUMENT','该组件不是表单字段');item.controller.instance.setData({value:value.value});return {};}
      case 'tree.commit':return topology(owner,value);
      case 'query':return copy(queryIds(owner,value.selector,!!value.all));
      case 'lifecycle':lifetime(owner,value.name,value.value);return {};
      default:if(platform.request)return platform.request({id:owner.id,kind:owner.kind,source:owner.source,page:record(owner.pageId).page,live:()=>records.has(owner.id)&&!owner.closing},message.method,value);fail('UNKNOWN_METHOD','未知实例端口方法');
    }
  }
  function pageRecords(id){const page=record(id);if(page.kind!=='page')fail('INSTANCE_SCOPE','视图重连仅支持页面根');return [...records.values()].filter(item=>item.pageId===id&&!item.closing);}
  function detach(id){pageRecords(id);record(id).viewDetached=true;return {};}
  function reconnect(id){
    const items=pageRecords(id);if(!record(id).viewDetached||reconnecting.has(id))fail('INSTANCE_CONFLICT','页面没有待重连视图');
    reconnecting.set(id,{claimed:new Set([id])});
    for(const item of items){item.treeRevision=0;item.tree=new Map();if(item.parentId)placements.delete(item.parentId+':'+item.nodeId);}
  }
  function connected(id){
    const attachment=reconnecting.get(id);if(!attachment)fail('INSTANCE_CONFLICT','页面重连尚未开始');
    try{for(const item of pageRecords(id))if(item.kind==='component'&&!attachment.claimed.has(item.id))destroy(item.id);}
    finally{reconnecting.delete(id);record(id).viewDetached=false;}
    syncRelations();return {};
  }
  const driver=Object.freeze({request,connect,detach,reconnect,connected});
  function queryId(id){
    if(!options.queryTools)fail('UNKNOWN_METHOD','当前环境不支持节点查询');
    const scope=value=>{if(!value||typeof value!=='object')fail('INSTANCE_SCOPE','节点查询作用域无效');for(const item of records.values())if(!item.closing&&instance(item)===value)return item.id;fail('INSTANCE_SCOPE','节点查询作用域无效');};
    return options.queryTools.create({scope:id,resolveScope:scope,live:id=>records.has(id)&&!records.get(id).closing,execute:(id,operations)=>{const view=record(id).view;if(!view?.query)fail('PAGE_NOT_READY','视图尚未挂载');return view.query(operations);}});
  }
  function query(target){if(!target||typeof target!=='object')fail('INSTANCE_SCOPE','节点查询作用域无效');for(const item of records.values())if(!item.closing&&instance(item)===target)return queryId(item.id);fail('INSTANCE_SCOPE','节点查询作用域无效');}
  // 画布命令式 API 需要同步拿到组件/页面挂载点；只在 iframe 视图侧存在，Worker 返回 null。
  function mount(target){if(!target||typeof target!=='object')return null;for(const item of records.values())if(!item.closing&&instance(item)===target)return item.view?.mount?.()||null;return null;}
  function scope(target){
    for(const item of records.values())if(!item.closing&&instance(item)===target)return {id:item.id,page:record(item.pageId).page,live:()=>records.has(item.id)&&!item.closing,view:()=>record(item.id).view};
    return null;
  }
  // DOM is confined to these local visual hooks. They are not part of the JSON instance port.
  const visual=Object.freeze({attachPage(id,node){platform.attachPage?.(record(record(id).pageId).page,node);},applyAnimation(id,node,value){platform.applyAnimation?.(record(record(id).pageId).page,node,value);},clearAnimation(id,node){const item=records.get(id),page=item&&records.get(item.pageId);if(page&&!page.closing)platform.clearAnimation?.(page.page,node);},changed(id){const item=records.get(id);if(item)notify(item);}});
  return Object.freeze({registerPage,driver,visual,query,select,mount,scope,snapshot,restore,destroy,callback(id,fn){if(fn===undefined)return;if(typeof fn!=='function')fail('INVALID_ARGUMENT','setData callback 必须为函数');const item=record(id);if(item.callbacks.size>=4096)fail('INSTANCE_LIMIT','等待视图回调过多');const token=++nextCallback;item.callbacks.set(token,fn);return token;},inspect(){return {instances:records.size,components:[...records.values()].filter(value=>value.kind==='component').length,placements:placements.size};}});
}

module.exports = createInstanceRegistry;
