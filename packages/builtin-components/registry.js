"use strict";
function createBuiltinRegistry({Error:ErrorType=Error}={}){
 const definitions=new Map(),owners=new WeakMap();
 function register(name,definition,{replace=false}={}){
  if(typeof name!=='string'||!/^[a-z][a-z0-9-]*$/.test(name)||!definition||typeof definition.nodeName!=='string')throw new ErrorType('基础组件定义无效',{code:'INVALID_ARGUMENT'});
  if(definitions.has(name)&&!replace)throw new ErrorType('基础组件已注册：'+name,{code:'INVALID_ARGUMENT'});
  definitions.set(name,Object.freeze({...definition}));return api;
 }
 function definition(element,node){return owners.get(element)||definitions.get(node.tag);}
 const api={register,has:name=>definitions.has(name),names:()=>[...definitions.keys()],
  nodeName(name,custom=false){if(custom)return 'div';const item=definitions.get(name);if(!item)throw new ErrorType('尚未支持的组件 '+name,{code:'VIEW_RENDER'});return item.nodeName;},
  create(element,node){const item=definitions.get(node.tag);if(item){owners.set(element,item);item.create?.(element,node);}},
  created(element,node){definition(element,node)?.created?.(element,node);},
  patchAttributes(element,node,old){definition(element,node)?.attributes?.(element,node.attrs,old,node);},
  remove(element,node){const item=owners.get(element);owners.delete(element);item?.remove?.(element,node);}
 };
 return Object.freeze(api);
}
module.exports=createBuiltinRegistry;
