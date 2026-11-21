"use strict";
const createBuiltinCatalog=require('./catalog');
const createBuiltinRegistry=require('./registry');
const createBrowserAttributes=require('./attributes');
const patchProgress=require('./progress');
const createMediaFrames=require('./media-frames');
function createBrowserComponents(root,options={}){
 const {Error:ErrorType=Error,style=value=>String(value??''),emit:emitNative=()=>{},node:nodeFor=()=>undefined,interactive=()=>true}=options;
 const catalog=createBuiltinCatalog(),registry=createBuiltinRegistry({Error:ErrorType}),document=root.document;
 let applyAttributes;const mediaFrames=createMediaFrames(root,{...options,attributes:(...args)=>applyAttributes(...args)});
 function create(element,node){
    if(['canvas','video'].includes(node.tag)){mediaFrames.create(element,node);return;}
    if(node.tag==='image')element.addEventListener('contextmenu',event=>{if(nodeFor(element)?.attrs['show-menu-by-longpress']!==true)event.preventDefault();});
    if(node.tag==='image')element.addEventListener('load',()=>{if(!interactive(nodeFor(element)||node))element.weappDeferredLoad=element.getAttribute('src');},true);
    if (node.tag === 'slider') {
      const range = document.createElement('input'), output = document.createElement('output'); range.type = 'range'; range.value = '0'; range.style.cssText = 'flex:1;min-width:0;';
      const make=name=>{const node=document.createElement('div');node.className='weapp-slider-'+name;return node;};
      const wrapper=make('wrapper'),tap=make('tap'),track=make('track'),fill=make('fill'),thumb=make('thumb');
      track.setAttribute('aria-hidden','true');track.append(fill,thumb);tap.append(track,range);wrapper.append(tap,output);element.append(wrapper);
      element.weappRange=range;element.weappOutput=output;element.weappSlider={fill,thumb};
      const paint=()=>{const min=Number(range.min||0),max=Number(range.max||100),percent=Math.max(0,Math.min(100,(Number(range.value)-min)/(max-min)*100));range.style.background='linear-gradient(to right,var(--slider-active,#1aad19) '+percent+'%,var(--slider-background,#e9e9e9) '+percent+'%)';fill.style.width=percent+'%';thumb.style.left=percent+'%';output.textContent=range.value;};
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
      const type=next.type||'success';
const check='<path d="m6.7 12 3.5 3.5 7.2-7.2"/>',cross='<path d="m8.2 8.2 7.6 7.6m0-7.6-7.6 7.6"/>';
const circle='<circle cx="12" cy="12" r="10" stroke="none"/>';
const white=content=>'<g fill="none" stroke="white" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">'+content+'</g>';
const shapes={success:circle+white(check),success_no_circle:'<path fill="none" stroke="currentColor" stroke-width="1.8" d="m3.2 11.8 5.8 5.8L21.1 5.5"/>',info:circle+white('<path d="M12 10.3v6M12 7.3v.2"/>'),warn:circle+white('<path d="M12 6.5v7M12 16v.2"/>'),waiting:circle+white('<path d="M12 5.8v6.3l3.5 3.4"/>'),cancel:'<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.3"/><g fill="none" stroke="currentColor" stroke-width="1.1">'+cross+'</g>',download:circle+white('<path d="M12 5.5v12m-3.6-4 3.6 4 3.6-4"/>'),search:'<g fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="10.5" cy="10.5" r="6.3"/><path d="m15.2 15.2 5 5"/></g>',clear:circle+white(cross)};
const colors={success:'#07c160',success_no_circle:'#09bb07',info:'#10aeff',warn:'#fa5151',waiting:'#10aeff',cancel:'#fa5151',download:'#07c160',search:'#7f7f7f',clear:'#b2b2b2'};
      const glyph=document.createElement('span'),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      glyph.className='weapp-icon-glyph';Object.assign(glyph.style,{fontSize:size+'px',lineHeight:size+'px',color:next.color||colors[type]||'currentColor'});element.style.fontSize='0px';element.style.removeProperty('color');
      svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.innerHTML=shapes[type];glyph.append(svg);element.replaceChildren(glyph);element.setAttribute('role','img');element.setAttribute('aria-label',type);
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
      element.style.objectFit = {scaleToFill:'fill',aspectFit:'contain',aspectFill:'cover',widthFix:'fill',heightFix:'fill'}[mode]||'none';
      element.style.objectPosition=['scaleToFill','widthFix','heightFix'].includes(mode)?'0% 0%':['aspectFit','aspectFill'].includes(mode)?'50% 50%':mode;
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
      for(const key of ['--slider-active','--slider-background','--slider-block','--slider-size'])element.style.setProperty(key,range.style.getPropertyValue(key));
      element.weappOutput.style.width=String(range.max).length*.5+'em';element.weappOutput.hidden=!next['show-value'];element.weappOutput.textContent=element.value;
    }
 }
 const createTags=new Set(['image','slider','canvas','video']),createdTags=new Set(['navigator','button','switch','checkbox','radio']);
 const attributeTags=new Set(['scroll-view','progress','icon','input','textarea','switch','checkbox','radio','image','slider','canvas','video']);
 for(const [name,nodeName]of Object.entries(catalog.nodeNames))registry.register(name,{nodeName:['canvas','video'].includes(name)?'div':nodeName,...(createTags.has(name)?{create}:{}),...(createdTags.has(name)?{created}:{}),...(name==='progress'?{remove:element=>element.weappProgress?.release()}:{}),...(['canvas','video'].includes(name)?{remove:element=>mediaFrames.remove(element)}:{}),...(attributeTags.has(name)?{attributes}:{})});
 applyAttributes=createBrowserAttributes({...options,root,registry});
 return Object.freeze({...registry,attributes:(element,old,node)=>['canvas','video'].includes(node.tag)?mediaFrames.attributes(element,old,node):applyAttributes(element,old,node)});
}
module.exports=createBrowserComponents;
