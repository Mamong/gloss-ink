'use strict';
const acorn=require('acorn'),path=require('node:path');
const blocked=new Set(['__proto__','prototype','constructor','caller','callee','arguments']);
const globals=new Set(['module','exports','require','undefined','NaN','Infinity','Math','JSON','Object','Array','Number','String','Boolean','parseInt','parseFloat','isNaN','isFinite']);
const builtins={Math:new Set(['PI','E','abs','ceil','floor','round','max','min','pow','sqrt','log','exp','sin','cos','tan','asin','acos','atan','atan2']),JSON:new Set(['parse','stringify']),Object:new Set(['keys']),Array:new Set(['isArray'])};
const types=new Set(['Program','BlockStatement','VariableDeclaration','VariableDeclarator','FunctionDeclaration','FunctionExpression','Identifier','Literal','ExpressionStatement','ReturnStatement','IfStatement','ForStatement','ForInStatement','WhileStatement','DoWhileStatement','BreakStatement','ContinueStatement','EmptyStatement','CallExpression','MemberExpression','ArrayExpression','ObjectExpression','Property','BinaryExpression','LogicalExpression','UnaryExpression','ConditionalExpression','AssignmentExpression','UpdateExpression','SequenceExpression','SwitchStatement','SwitchCase']);
function createCompiler(read,diagnostic,onReference){
 const modules=Object.create(null),active=new Set(),scopes=Object.create(null);let total=0;
 function issue(code,file,offset,message){diagnostic('error',code,file,offset,message);}
 function resolve(from,request,offset,root=false){
  if(typeof request!=='string'||!request||request.includes('{{')||/[\\\0?#]/.test(request)||/^(?:[a-z]+:|\/\/)/i.test(request)||!request.endsWith('.wxs')||!root&&!/^\.\.?\//.test(request)){issue('WXS_MODULE_PATH',from,offset,'WXS引用需要静态、项目内的 .wxs 路径；require仅支持相对路径');return null;}
  const target=path.posix.normalize(request.startsWith('/')?request.slice(1):path.posix.join(path.posix.dirname(from),request));
  if(target.startsWith('../')||target==='..'){issue('WXS_MODULE_PATH',from,offset,'WXS路径不能离开项目');return null;}onReference?.(from,target,offset);return target;
 }
 function module(id,source,file=id,base=0){
  if(active.has(id)){issue('WXS_MODULE_CYCLE',file,base,'WXS模块引用循环：'+id);return;}
  if(Object.hasOwn(modules,id))return;
  const bytes=Buffer.byteLength(source);if(bytes>65536||total+bytes>262144||Object.keys(modules).length>=64){issue('WXS_MODULE_LIMIT',file,base,'WXS限制为64个模块、单个64KiB、合计256KiB');return;}total+=bytes;
  let ast;try{ast=acorn.parse(source,{ecmaVersion:5,allowReturnOutsideFunction:false});}catch(error){issue('WXS_SYNTAX',file,base+(error.pos||0),'WXS常用子集使用ES5语法：'+error.message);return;}
  const dependencies=Object.create(null),record={file,base,ast:null,dependencies};modules[id]=record;active.add(id);
  function bindings(node,names,nesting=0){
   if(!node)return;if(nesting>128){issue('WXS_MODULE_LIMIT',file,base+node.start,'WXS绑定扫描嵌套超过128层');return;}
   if(node.type==='FunctionDeclaration'){names.add(node.id.name);return;}
   if(node.type==='FunctionExpression')return;
   if(node.type==='VariableDeclarator'&&node.id.type==='Identifier')names.add(node.id.name);
   for(const [key,value]of Object.entries(node))if(key!=='id'){
    if(Array.isArray(value)){for(const child of value)if(child?.type)bindings(child,names,nesting+1);}
    else if(value?.type)bindings(value,names,nesting+1);
   }
  }
  let nodes=0,nesting=0;
  function walk(node,parent,scope,control={loop:0,switch:0,fn:false}){
   if(!node)return null;nesting++;if(++nodes>32768||nesting>128){issue('WXS_MODULE_LIMIT',file,base+node.start,'WXS语法树节点或嵌套超限');nesting--;return {type:'Literal',value:null,start:node.start};}
   if(!types.has(node.type)||node.type==='Literal'&&node.regex||node.type==='Property'&&(node.kind!=='init'||node.method)||node.type==='VariableDeclaration'&&node.kind!=='var'||node.type==='UnaryExpression'&&node.operator==='delete'||node.type==='BinaryExpression'&&['in','instanceof'].includes(node.operator)||node.label){issue('WXS_UNSUPPORTED',file,base+node.start,'尚未支持WXS语法 '+node.type+(node.operator?' '+node.operator:''));nesting--;return {type:'Literal',value:null,start:node.start};}
   if(['Program','FunctionDeclaration','FunctionExpression'].includes(node.type)){
    const names=new Set();bindings(node.type==='Program'?node:node.body,names);if(node.type!=='Program'){for(const param of node.params){if(param.type!=='Identifier')issue('WXS_UNSUPPORTED',file,base+param.start,'WXS参数仅支持标识符');else names.add(param.name);}if(node.id)names.add(node.id.name);}
    for(const name of names)if(['module','exports','require'].includes(name))issue('WXS_BINDING',file,base+node.start,'WXS不支持重定义 '+name);
    scope={names,parent:scope};if(node.type!=='Program')control={loop:0,switch:0,fn:true};
   }
   if(node.type==='Identifier'){
    const name=node.name,property=parent?.type==='MemberExpression'&&parent.property===node&&!parent.computed||parent?.type==='Property'&&parent.key===node;
    if(blocked.has(name))issue('WXS_MEMBER',file,base+node.start,'禁止访问WXS成员 '+name);
    else if(!property){let owner=scope;while(owner&&!owner.names.has(name))owner=owner.parent;if(!owner&&!globals.has(name))issue('WXS_GLOBAL',file,base+node.start,'WXS不提供全局标识符 '+name);}
   }
   if(node.type==='Literal'&&typeof node.value==='number'&&!Number.isFinite(node.value))issue('WXS_LITERAL',file,base+node.start,'WXS不接受非有限数值字面量');
   if(node.type==='MemberExpression'&&node.object.type==='Identifier'&&Object.hasOwn(builtins,node.object.name)){
    let owner=scope;while(owner&&!owner.names.has(node.object.name))owner=owner.parent;
    const name=node.computed?(node.property.type==='Literal'?String(node.property.value):null):node.property.name;
    if(!owner&&name!==null&&!builtins[node.object.name].has(name))issue('WXS_BUILTIN',file,base+node.start,'WXS内建未实现：'+node.object.name+'.'+name);
   }
   if(node.type==='MemberExpression'&&node.computed&&node.property.type==='Literal'&&blocked.has(String(node.property.value)))issue('WXS_MEMBER',file,base+node.property.start,'禁止访问WXS成员 '+node.property.value);
   if(node.type==='Property'&&blocked.has(String(node.key.name??node.key.value)))issue('WXS_MEMBER',file,base+node.key.start,'禁止声明WXS成员');
   if(node.type==='CallExpression'&&node.callee.type==='Identifier'&&node.callee.name==='require'){
    if(node.arguments.length!==1||node.arguments[0].type!=='Literal'||typeof node.arguments[0].value!=='string')issue('WXS_REQUIRE',file,base+node.start,'WXS require必须使用一个静态字符串参数');
    else{const request=node.arguments[0].value,target=resolve(file,request,base+node.start);if(target){dependencies[request]=target;const text=read(target);if(text!==null)module(target,text);}}
   }
   const next={...control};if(['ForStatement','ForInStatement','WhileStatement','DoWhileStatement'].includes(node.type))next.loop++;if(node.type==='SwitchStatement')next.switch++;
   if(node.type==='BreakStatement'&&!control.loop&&!control.switch||node.type==='ContinueStatement'&&!control.loop)issue('WXS_UNSUPPORTED',file,base+node.start,'WXS跳转位置无效');
   const result={type:node.type,start:node.start};
   for(const [key,value]of Object.entries(node)){if(['type','start','end','raw','loc'].includes(key))continue;if(Array.isArray(value))result[key]=value.map(item=>item?.type?walk(item,node,scope,next):item);else result[key]=value?.type?walk(value,node,scope,next):value;}
   nesting--;return result;
  }
  record.ast=walk(ast,null,null);active.delete(id);
 }
 function declaration(file,node){
  const name=node.attrs.module?.value,src=node.attrs.src?.value;
  if(typeof name!=='string'||!/^[A-Za-z_$][\w$]*$/.test(name)||blocked.has(name)||Object.keys(node.attrs).some(key=>!['module','src'].includes(key))){issue('WXS_DECLARATION',file,node.offset,'wxs需要有效module名及可选静态src');return;}
  const table=scopes[file]||(scopes[file]=Object.create(null));if(Object.hasOwn(table,name)){issue('WXS_DECLARATION',file,node.offset,'重复WXS module：'+name);return;}
  if(src!==undefined){if((node.raw||'').trim()){issue('WXS_DECLARATION',file,node.offset,'外部WXS声明不能同时包含内联代码');return;}const target=resolve(file,src,node.attrs.src.offset,true);if(target){table[name]=target;const source=read(target);if(source!==null)module(target,source);else issue('WXS_MODULE_MISSING',file,node.attrs.src.offset,'WXS外部模块不存在或读取器未配置');}}
  else{const id=file+'#wxs:'+name;table[name]=id;module(id,node.raw||'',file,node.bodyOffset||node.offset);}
 }
 return{declaration,scopes,bundle:()=>({modules,scopes}),has:()=>Object.keys(modules).length>0};
}
module.exports={createCompiler};
