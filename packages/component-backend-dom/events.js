'use strict';
function createComponentViews(root, logicalEvents) {
 'use strict';
 const document=root.document,owners=new WeakMap(),processed=new WeakSet();let guard;
 const parent=node=>node?.parentNode||node?.parentElement;
 const children=node=>Array.from(node?.childNodes||node?.children||[]);
 function physical(element){if(!element?.virtualRange)return [element];const list=children(parent(element.start)),first=list.indexOf(element.start),last=list.indexOf(element.end);return first>=0&&last>=first?list.slice(first,last+1):[element.start,element.end];}
 function range(){
  const stage=document.createDocumentFragment?.()||document.createElement('now-detached-range');
  const start=document.createComment('now:start'),end=document.createComment('now:end');stage.append(start,end);
  const value={virtualRange:true,start,end,stage,className:'',dataset:{},attrs:{},hidden:false,inert:false,
   get childNodes(){return physical(value).slice(1,-1);},get children(){return value.childNodes.filter(node=>node.nodeType===1||node.tagName);},get isConnected(){return !!start.isConnected;},get parentElement(){return start.parentElement;},get parentNode(){return parent(start);},
   insertBefore(node,reference){return parent(start).insertBefore(node,reference||end);},append(...nodes){for(const node of nodes)value.insertBefore(node,null);},contains(node){return physical(value).some(item=>item===node||item.contains?.(node));},remove(){for(const node of physical(value))node.remove();},getRootNode(){return start.getRootNode?.()||document;}
  };return value;
 }
 function move(element,target,reference){const nodes=physical(element);if(nodes.includes(reference))return;for(const node of nodes)target.insertBefore(node,reference);}
 function after(target,element){const nodes=physical(element),list=children(target);return list[list.indexOf(nodes.at(-1))+1]||null;}
 function markProjection(node,token,enabled){for(const element of physical(node.element)){if(!element?.setAttribute)continue;const tokens=new Set((element.getAttribute('data-weapp-projection')||'').split(/\s+/).filter(Boolean));if(enabled)tokens.add(token);else tokens.delete(token);if(tokens.size)element.setAttribute('data-weapp-projection',[...tokens].join(' '));else element.removeAttribute('data-weapp-projection');}}
 function css(value,id,virtual=false){value=String(value||'').replaceAll('__NOW_OWNER__',id);if(virtual)value=value.replace(/::slotted\(([^()]+)\)/g,(_whole,selector)=>selector+'[data-weapp-projection~="'+id+'"]');return value;}
 const sheets=new Map(),targets=new WeakMap();
 function adoptedStyle(target,text){
  if(!text||typeof root.CSSStyleSheet!=='function'||!Array.isArray(target.adoptedStyleSheets))return null;
  let entry=sheets.get(text);
  if(!entry){try{const sheet=new root.CSSStyleSheet();sheet.replaceSync(text);entry={sheet,references:0};}catch(_){return null;}sheets.set(text,entry);}
  let counts=targets.get(target);if(!counts){counts=new Map();targets.set(target,counts);}
  const previous=counts.get(entry.sheet)||0;
  try{if(!previous)target.adoptedStyleSheets=[...target.adoptedStyleSheets,entry.sheet];}catch(_){if(!entry.references)sheets.delete(text);return null;}
  counts.set(entry.sheet,previous+1);entry.references++;let removed=false;
  return{get textContent(){return text;},remove(){if(removed)return;removed=true;const count=counts.get(entry.sheet)-1;if(count)counts.set(entry.sheet,count);else{counts.delete(entry.sheet);target.adoptedStyleSheets=target.adoptedStyleSheets.filter(sheet=>sheet!==entry.sheet);}if(!--entry.references)sheets.delete(text);}};
 }
 function style(target,value,id,virtual=false){const text=css(value,id,virtual),shared=adoptedStyle(target,text);if(shared)return shared;const element=document.createElement('style');element.nonce=document.querySelector?.('style[nonce]')?.nonce||document.querySelector?.('script[nonce]')?.nonce||'';element.textContent=text;target.append(element);return element;}
 function merge(...tables){const out={};for(const table of tables)for(const [name,rules]of Object.entries(table||{}))(out[name]||=[]).push(...rules);return out;}
 const ancestors=(...args)=>logicalEvents.path(...args);
 const key=binding=>logicalEvents.key(binding);
 function route(source,name,detail,settings={},original={}){
  const continued=logicalEvents.route(source,name,detail,settings,original);
  if(continued&&!original.defaultPrevented){if(name==='tap'&&source.tag==='button'&&source.attrs['open-type']==='share')source.eventView.special(source,'@share',original);if(name==='tap'&&source.tag==='button'&&source.attrs['open-type']==='send'&&original.isTrusted===true)source.eventView.special(source,'@send',original);if(name==='tap'&&source.tag==='navigator')source.eventView.special(source,'@navigate',original);if(name==='tap'){const functional=ancestors(source).find(node=>node.tag==='functional-page-navigator');if(functional&&(!guard||guard(functional,original)))functional.eventView.special(functional,'@functional',original);}}
  return continued;
 }
 function native(event){if(processed.has(event))return;processed.add(event);let element=event.composedPath?.()[0]||event.target;while(element&&!owners.has(element))element=element.parentElement||element.host;const source=owners.get(element);if(!source||!source.eventView.live()||guard&&!guard(source,event))return;
  const type=event.type.startsWith('weapp:')?event.type.slice(6):({click:'tap',keydown:'confirm',input:source.tag==='slider'?'changing':'input'}[event.type]||event.type);
  if(type==='confirm'&&source.tag==='textarea'&&['return','enter'].includes(source.attrs['confirm-type']??'return'))return;
  if(event.type==='keydown'&&source.tag==='functional-page-navigator'&&['Enter',' '].includes(event.key)){event.preventDefault?.();if(!event.repeat)source.eventView.special(source,'@functional',event);return;}
  if(type==='confirm'&&event.key!=='Enter'){if(source.tag==='navigator'&&event.key===' '){event.preventDefault?.();source.eventView.special(source,'@navigate',event);}return;}
  const detail=event.type.startsWith('weapp:')?event.detail:source.eventView.detail(source,event,type);
  route(source,type,detail,{bubbles:true,composed:true,capturePhase:true},event);
  if(event.type==='keydown'&&source.tag==='navigator'&&event.key==='Enter'&&!event.defaultPrevented){event.preventDefault?.();source.eventView.special(source,'@navigate',event);}
 }
 function bind(element,node){owners.set(element,node);if(element.virtualRange||element.__nowLogicalEvents)return;element.__nowLogicalEvents=true;
  for(const type of ['click','input','change','focus','blur','keydown','touchstart','touchmove','touchend','touchcancel','touchforcechange','submit','reset','load','error',...(node.tag==='video'?['play','pause','ended','timeupdate','loadedmetadata','waiting','progress','seeking','seeked','durationchange','fullscreenchange']:[]),...(node.tag==='map'?['markertap','callouttap','controltap','regionchange','poitap','labeltap','anchorpointtap','updated']:[])])element.addEventListener(type,native);
  for(const binding of node.events||[])element.addEventListener('weapp:'+binding.name,native);
 }
 return {range,physical,move,after,markProjection,css,style,merge,bind,route,path:ancestors,key,setGuard(value){guard=value;}};
}

module.exports = createComponentViews;
