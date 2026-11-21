"use strict";
const createBuiltinCatalog=require('./catalog');
const createBuiltinRegistry=require('./registry');
const createBrowserAttributes=require('./attributes');
const patchProgress=require('./progress');
function createBrowserComponents(root,options={}){
 const {Error:ErrorType=Error,style=value=>String(value??''),emit:emitNative=()=>{},node:nodeFor=()=>undefined,interactive=()=>true}=options;
 const catalog=createBuiltinCatalog(),registry=createBuiltinRegistry({Error:ErrorType}),document=root.document;
 function create(element,node){
    if(node.tag==='image')element.addEventListener('contextmenu',event=>{if(nodeFor(element)?.attrs['show-menu-by-longpress']!==true)event.preventDefault();});
    if(node.tag==='image')element.addEventListener('load',()=>{if(!interactive(nodeFor(element)||node))element.weappDeferredLoad=element.getAttribute('src');},true);
    if (node.tag === 'slider') {
      const range = document.createElement('input'), output = document.createElement('output'); range.type = 'range'; range.value = '0'; range.style.cssText = 'flex:1;min-width:0;';
      element.append(range,output); element.weappRange = range; element.weappOutput = output;
      const paint=()=>{const min=Number(range.min||0),max=Number(range.max||100),percent=Math.max(0,Math.min(100,(Number(range.value)-min)/(max-min)*100));range.style.background='linear-gradient(to right,var(--slider-active,#1aad19) '+percent+'%,var(--slider-background,#e9e9e9) '+percent+'%)';output.textContent=range.value;};
      range.addEventListener('input',paint);range.addEventListener('change',paint);
      Object.defineProperty(element,'value',{get:()=>range.value,set:value=>{range.value=String(value);paint();}});
      Object.defineProperty(element,'disabled',{get:()=>range.disabled,set:value=>{range.disabled=value;}});
      range.addEventListener('input',()=>{output.textContent=range.value;});
    }
 }
 function created(element,node){
    if(node.tag==='navigator'){element.setAttribute('role','link');element.setAttribute('tabindex','0');}
    if(node.tag==='button')element.type='button';
    if (['switch','checkbox','radio'].includes(node.tag)) element.type = node.tag === 'radio' ? 'radio' : 'checkbox';
 }
 function attributes(element,next,old,node){
    if(node.tag==='scroll-view'){for(const [key,axis]of [['scroll-x','overflowX'],['scroll-y','overflowY']])if(next[key]!==undefined)element.style[axis]=next[key]?'auto':'hidden';}
    if(node.tag==='progress')patchProgress(element,next,ErrorType,(name,detail)=>emitNative(element,name,detail),()=>interactive(nodeFor(element)||node));
    if(node.tag==='icon'){
      const icons=catalog.icons;
      if(!Object.hasOwn(icons,next.type||'success'))throw new Error('尚未支持 icon.type：'+next.type);
      const size=next.size===undefined?23:Number(next.size);if(!Number.isFinite(size)||size<1||size>256)throw new Error('icon.size 无效');
      element.textContent=icons[next.type||'success'];element.style.fontSize=size+'px';element.style.color=next.color||'currentColor';element.setAttribute('role','img');element.setAttribute('aria-label',next.type||'success');
    }
    if(['input','textarea'].includes(node.tag)){const maximum=next.maxlength==null?140:Number(next.maxlength);if(!Number.isSafeInteger(maximum)||maximum<-1)throw new ErrorType('maxlength需要-1或非负整数',{code:'INVALID_ARGUMENT'});if(maximum===-1)element.removeAttribute('maxlength');else element.setAttribute('maxlength',String(maximum));}
    if(['switch','checkbox','radio'].includes(node.tag)){const color=next.color||({switch:next.type==='checkbox'?'#09bb07':'#07C160',checkbox:'#09BB07',radio:'#07c160'}[node.tag]);element.style.accentColor=color;element.style.setProperty?.('--weapp-control-color',color);if(node.tag==='switch')element.setAttribute('role','switch');}
    if (node.tag === 'input') {
      const type = next.password ? 'password' : ['digit', 'idcard'].includes(next.type) ? 'text' : next.type || 'text';
      if (element.type !== type) element.type = type;
      if (next.type !== 'digit') element.removeAttribute('inputmode');
    }
    if (node.tag === 'image') {
      if (old?.mode && old.mode !== next.mode) element.style.cssText=style(next.style,node.origin);
      element.style.webkitTouchCallout=next['show-menu-by-longpress']===true?'default':'none';
      const mode = next.mode || 'scaleToFill';
      element.style.objectFit = {scaleToFill: 'fill', aspectFit: 'contain', aspectFill: 'cover'}[mode] || 'none';
      if (mode === 'widthFix') element.style.height = 'auto'; else if (mode === 'heightFix') element.style.width = 'auto';
      else if (!['scaleToFill', 'aspectFit', 'aspectFill'].includes(mode)) element.style.objectPosition = mode;
    }
    if (node.tag === 'slider') {
      const min=Number(next.min??0),max=Number(next.max??100),step=Number(next.step??1);if(![min,max,step].every(Number.isFinite)||min>=max||step<=0||step>max-min)throw new ErrorType('slider范围/step无效',{code:'INVALID_ARGUMENT'});
      const range=element.weappRange;range.min=String(min);range.max=String(max);range.step=String(step);
      const raw=Number(element.value||0);if(!Number.isFinite(raw))throw new ErrorType('slider.value需要有限数',{code:'INVALID_ARGUMENT'});const clamped=Math.max(min,Math.min(max,raw));element.value=String(Math.min(max,min+Math.round((clamped-min)/step)*step));
      const size=Number(next['block-size']??28);if(!Number.isInteger(size)||size<12||size>28)throw new ErrorType('slider.block-size需12–28整数',{code:'INVALID_ARGUMENT'});
      const safe=value=>{if(typeof value!=='string'||value.length>128||/[;{}<>]/.test(value)||/url\s*\(/i.test(value))throw new ErrorType('slider颜色无效',{code:'INVALID_ARGUMENT'});return value;};
      range.style.setProperty?.('--slider-active',safe(next.activeColor??next['selected-color']??'#1aad19'));range.style.setProperty?.('--slider-background',safe(next.backgroundColor??next.color??'#e9e9e9'));range.style.setProperty?.('--slider-block',safe(next['block-color']??'#ffffff'));range.style.setProperty?.('--slider-size',size+'px');range.style.accentColor=safe(next.activeColor??next['selected-color']??'#1aad19');
      element.weappOutput.hidden=!next['show-value'];element.weappOutput.textContent=element.value;
    }
 }
 const createTags=new Set(['image','slider']),createdTags=new Set(['navigator','button','switch','checkbox','radio']);
 const attributeTags=new Set(['scroll-view','progress','icon','input','textarea','switch','checkbox','radio','image','slider']);
 for(const [name,nodeName]of Object.entries(catalog.nodeNames))registry.register(name,{nodeName,...(createTags.has(name)?{create}:{}),...(createdTags.has(name)?{created}:{}),...(name==='progress'?{remove:element=>element.weappProgress?.release()}:{}),...(attributeTags.has(name)?{attributes}:{})});
 return Object.freeze({...registry,attributes:createBrowserAttributes({...options,root,registry})});
}
module.exports=createBrowserComponents;
