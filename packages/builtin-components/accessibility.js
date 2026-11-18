function createAccessibility(root, options) {
  'use strict';
  const handledKeys=new WeakSet();
  const relations={
    'aria-labelledby':['ariaLabelledByElements',false], 'aria-describedby':['ariaDescribedByElements',false],
    'aria-controls':['ariaControlsElements',false], 'aria-details':['ariaDetailsElements',false],
    'aria-errormessage':['ariaErrorMessageElements',false], 'aria-flowto':['ariaFlowToElements',false],
    'aria-owns':['ariaOwnsElements',false], 'aria-activedescendant':['ariaActiveDescendantElement',true]
  };
  const present=value=>value!==null&&value!==undefined;
  const fail=message=>{throw new options.Error(message,{code:'INVALID_ARGUMENT'});};
  function validate(attrs){
    for(const[name,value]of Object.entries(attrs)){
      if(!name.startsWith('aria-')||!present(value))continue;
      if(!['string','number','boolean'].includes(typeof value)||typeof value==='number'&&!Number.isFinite(value)||String(value).length>8192)fail(name+' 需要不超过8192字符的字符串、布尔值或有限数值');
      if(name==='aria-role'&&value!==false&&typeof value!=='string')fail('aria-role 需要字符串');
      if(relations[name]&&value!==false&&typeof value!=='string')fail(name+' 需要同一页面/组件内的ID字符串');
      if(relations[name]&&String(value).trim().split(/\s+/).length>64)fail(name+' 最多关联64个节点');
    }
  }
  function scope(settings){
    const records=new Map();let closed=false;
    const attributes=(element,name,value)=>{if(value===null)element.removeAttribute(name);else element.setAttribute(name,value);};
    function restore(record){
      for(const[element,table]of record.managed)for(const[name,state]of table)if(element.getAttribute(name)===state.last)attributes(element,name,state.before);
      for(const[element,names]of record.references)for(const name of names)releaseReference(record,element,name);
      record.managed.clear();record.references.clear();record.referenceStates.clear();
    }
    function manage(record,element,desired){
      let table=record.managed.get(element);if(!table&&!desired.size)return;if(!table){table=new Map();record.managed.set(element,table);}
      for(const[name,state]of table)if(!desired.has(name)){if(element.getAttribute(name)===state.last)attributes(element,name,state.before);table.delete(name);}
      for(const[name,value]of desired){const current=element.getAttribute(name);let state=table.get(name);if(!state){state={before:current,last:value};table.set(name,state);}else if(current!==state.last)state.before=current;attributes(element,name,value);state.last=value;}
    }
    function target(record){
      if(record.element.weappRange)return record.element.weappRange;
      if(record.tag==='editor')return record.element.querySelector?.('.weapp-editor-content')||Array.from(record.element.children||[]).find(node=>String(node.className||'').split(/\s+/).includes('weapp-editor-content'))||record.element;
      return record.element;
    }
    function clearReference(element,name){
      const[property,single]=relations[name];try{if(property in element)element[property]=single?null:[];}catch(_){}
      element.removeAttribute(name);
    }
    function treeRoot(element){
      if(element.getRootNode)return element.getRootNode();let node=element;while(node.parentNode||node.parentElement)node=node.parentNode||node.parentElement;return node===root.document.body?root.document:node;
    }
    function uniqueId(element,id){
      let count=0,match;const tree=treeRoot(element);
      function walk(node){if(node.getAttribute?.('id')===id){count++;match=node;}for(const child of Array.from(node.childNodes||node.children||[]))walk(child);}
      walk(tree===root.document?root.document.documentElement?.children?root.document.documentElement:root.document.body:tree);
      return count===1&&match===element;
    }
    const same=(a,b)=>Array.isArray(a)&&Array.isArray(b)?a.length===b.length&&a.every((item,i)=>item===b[i]):a===b;
    function referenceValue(element,name){const[property]=relations[name];let value;try{value=element[property];}catch(_){}return {attribute:element.getAttribute(name),property:Array.isArray(value)?[...value]:value};}
    function releaseReference(record,element,name){
      const state=record.referenceStates.get(element)?.get(name);if(!state)return;
      const current=referenceValue(element,name);
      if(current.attribute===state.last.attribute&&same(current.property,state.last.property)){
        clearReference(element,name);const[property]=relations[name];
        if(state.before.attribute!==null)element.setAttribute(name,state.before.attribute);
        else if(state.before.property!==undefined){try{element[property]=state.before.property;}catch(_){}}
      }
      record.referenceStates.get(element).delete(name);
    }
    function reference(record,name,index){
      const destination=record.target,current=referenceValue(destination,name);let table=record.referenceStates.get(destination);if(!table){table=new Map();record.referenceStates.set(destination,table);}let state=table.get(name);
      if(!state){state={before:current};table.set(name,state);}else if(current.attribute!==state.last.attribute||!same(current.property,state.last.property))state.before=current;
      applyReference(record,name,index);state.last=referenceValue(destination,name);
    }
    function applyReference(record,name,index){
      const value=record.attrs[name],destination=record.target,[property,single]=relations[name];
      const ids=present(value)&&value!==false?String(value).trim().split(/\s+/).filter(Boolean):[];
      const resolved=ids.map(id=>index.get(id)).filter(item=>item&&item!==false).map(item=>item.target);
      // Never let the browser resolve an ID against another page or component.
      clearReference(destination,name);
      if(!ids.length||resolved.length!==ids.length||single&&resolved.length!==1)return;
      const targets=[...new Set(resolved)];
      if(property in destination){try{destination[property]=single?targets[0]:targets;return;}catch(_){}}
      if(targets.every((element,i)=>treeRoot(element)===treeRoot(destination)&&uniqueId(element,ids[i])))destination.setAttribute(name,ids.join(' '));
    }
    function keyboard(record,event,up){
      const destination=record.target,attrs=record.attrs;
      if(closed||!settings.live()||!destination?.isConnected||event.defaultPrevented||event.isComposing||event.repeat||event.altKey||event.ctrlKey||event.metaKey)return;
      if((event.composedPath?.()[0]||event.target)!==destination)return;
      const role=String(attrs['aria-role']||'').trim().split(/\s+/)[0];
      if(!['button','link'].includes(role)||!present(attrs.tabindex)||['BUTTON','INPUT','TEXTAREA','SELECT','A'].includes(destination.tagName)||record.tag==='navigator')return;
      if(attrs.disabled===true||attrs['aria-disabled']===true||attrs['aria-disabled']==='true'){record.pressed=false;return;}
      const enter=event.key==='Enter',space=event.key===' '&&role==='button';if(!enter&&!space)return;
      event.preventDefault();handledKeys.add(event);
      if(!up&&enter)settings.activate(record.element,event);
      if(!up&&space)record.pressed=true;
      if(up&&space&&record.pressed){record.pressed=false;settings.activate(record.element,event);}
    }
    function bindTarget(record,destination){
      if(record.target!==destination){
        if(record.target){for(const[type,listener]of record.listeners)record.target.removeEventListener(type,listener,true);restore(record);}
        record.target=destination;record.pressed=false;record.listeners=[];
      }
      const role=String(record.attrs['aria-role']||'').trim().split(/\s+/)[0];
      const eligible=['button','link'].includes(role)&&present(record.attrs.tabindex)&&record.attrs.tabindex!==false&&!['BUTTON','INPUT','TEXTAREA','SELECT','A'].includes(destination.tagName)&&record.tag!=='navigator';
      if(!eligible&&record.listeners.length){for(const[type,listener]of record.listeners)destination.removeEventListener(type,listener,true);record.listeners=[];record.pressed=false;}
      if(eligible&&!record.listeners.length){
        record.listeners=[['keydown',event=>keyboard(record,event,false)],['keyup',event=>keyboard(record,event,true)],['blur',()=>{record.pressed=false;}]];
        for(const[type,listener]of record.listeners)destination.addEventListener(type,listener,true);
      }
    }
    function patch(element,node){
      if(closed||!element?.setAttribute||element.virtualRange)return;
      if(!present(node.attrs.id)&&!Object.keys(node.attrs).some(name=>name.startsWith('aria-')||name==='tabindex')){remove(element);return;}
      let record=records.get(element);
      if(!record){record={element,tag:node.tag,attrs:node.attrs,managed:new Map(),references:new Map(),referenceStates:new Map(),listeners:[]};records.set(element,record);}
      if(record.attrs?.['aria-role']!==node.attrs['aria-role']||record.attrs?.tabindex!==node.attrs.tabindex||record.attrs?.['aria-disabled']!==node.attrs['aria-disabled'])record.pressed=false;
      record.attrs=node.attrs;record.tag=node.tag;
    }
    function flush(){
      if(closed)return;const index=new Map();
      for(const record of records.values()){
        bindTarget(record,target(record));const id=record.attrs.id;
        if(present(id)&&String(id))index.set(String(id),index.has(String(id))?false:record);
        const desired=new Map(),attrs=record.attrs;
        for(const[name,value]of Object.entries(attrs)){
          if(name==='aria-role'){if(present(value)&&value!==false&&String(value).trim())desired.set('role',String(value).trim());continue;}
          if(name==='tabindex'){if(present(value)&&value!==false)desired.set(name,String(value));continue;}
          if(name.startsWith('aria-')&&!relations[name]&&present(value))desired.set(name,String(value));
        }
        // Reapply authored semantics after native controls update their own defaults.
        manage(record,record.target,desired);
        if(record.target!==record.element){const wrapper=new Map();if(desired.has('aria-hidden'))wrapper.set('aria-hidden',desired.get('aria-hidden'));manage(record,record.element,wrapper);}
        for(const[element,names]of record.references)for(const name of names)if(element!==record.target||!present(attrs[name]))releaseReference(record,element,name);
        const names=new Set(Object.keys(relations).filter(name=>present(attrs[name])));record.references.clear();if(names.size)record.references.set(record.target,names);
      }
      for(const record of records.values())for(const name of record.references.get(record.target)||[])reference(record,name,index);
    }
    function remove(element){
      const record=records.get(element);if(!record)return;
      for(const[type,listener]of record.listeners)record.target?.removeEventListener(type,listener,true);
      restore(record);records.delete(element);
    }
    function visibility(value){if(!value)for(const record of records.values())record.pressed=false;}
    function dispose(){for(const element of [...records.keys()])remove(element);closed=true;}
    return {patch,flush,remove,visibility,dispose};
  }
  return {validate,scope,handled:event=>handledKeys.has(event)};
}

module.exports = createAccessibility;
