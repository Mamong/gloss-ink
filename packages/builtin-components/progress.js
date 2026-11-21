'use strict';
function releaseProgress(element) {
 const state=element.weappProgress,window=element.ownerDocument.defaultView;
 if(!state)return;
 if(state.frame!==undefined){window?.cancelAnimationFrame?.(state.frame);state.frame=undefined;}
 if(state.endTimer!==undefined){window?.clearTimeout?.(state.endTimer);state.endTimer=undefined;}
 state.generation=(state.generation||0)+1;state.signature=undefined;
}
function patchProgress(element,attrs,ErrorType,emit,live=()=>true) {
 const fail=message=>{throw new ErrorType(message,{code:'INVALID_ARGUMENT'});};
 const number=(value,fallback,min,max)=>{const result=value===undefined?fallback:Number(value);if(!Number.isFinite(result)||result<min||result>max)fail('progress数值超出支持范围');return result;};
 const percent=number(attrs.percent,0,0,100),stroke=number(attrs['stroke-width'],6,1,100),size=number(attrs['font-size'],16,1,100);
 for(const key of ['show-info','active'])if(attrs[key]!==undefined&&typeof attrs[key]!=='boolean')fail('progress布尔属性需要boolean');
 const color=(value,fallback)=>{if(value===undefined)return fallback;if(typeof value!=='string'||value.length>128||/[;{}<>]/.test(value)||/url\s*\(/i.test(value))fail('progress颜色无效');return value;};
 const activeColor=color(attrs.activeColor??attrs.color,'#09bb07'),background=color(attrs.backgroundColor,'#ebebeb');
 const mode=attrs['active-mode']??'backwards';if(!['backwards','forwards'].includes(mode))fail('progress.active-mode仅支持backwards或forwards');
 const duration=number(attrs.duration,500,0,10000),window=element.ownerDocument.defaultView;
 if(!element.weappProgress){const document=element.ownerDocument,track=document.createElement('div'),fill=document.createElement('div'),info=document.createElement('span');track.append(fill);element.append(track,info);element.weappProgress={track,fill,info};}
 const state=element.weappProgress,{track,fill,info}=state;
 Object.assign(track.style,{flex:'1',height:stroke+'px',overflow:'hidden',backgroundColor:background});
 Object.assign(fill.style,{height:'100%',backgroundColor:activeColor});
 info.hidden=!attrs['show-info'];info.textContent=percent+'%';info.style.fontSize=size+'px';
 element.setAttribute('role','progressbar');element.setAttribute('aria-valuemin','0');element.setAttribute('aria-valuemax','100');element.setAttribute('aria-valuenow',String(percent));
 const active=!!attrs.active,reduced=!!window?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const signature=JSON.stringify([percent,active,mode,duration,reduced,!!attrs.hidden]);
 // A color or label update must not restart the animation or its completion.
 if(state.signature===signature)return;
 releaseProgress(element);state.signature=signature;
 const generation=state.generation,available=()=>element.isConnected&&!element.hidden&&live();
 const animate=active&&duration>0&&!reduced&&!attrs.hidden;
 const finish=delay=>{
  if(!active||percent<100||attrs.hidden)return;
  state.endTimer=window?.setTimeout?.(()=>{if(state.generation!==generation)return;state.endTimer=undefined;if(available())emit?.('activeend',{percent});},delay);
 };
 const paint=()=>{
  if(state.generation!==generation)return;state.frame=undefined;
  fill.style.transition=animate&&available()?'width '+duration+'ms linear':'none';
  fill.style.width=percent+'%';
  if(available())finish(animate?duration:0);
 };
 if(animate&&mode==='backwards'&&window?.requestAnimationFrame){
  fill.style.transition='none';fill.style.width='0%';void fill.offsetWidth;
  state.frame=window.requestAnimationFrame(paint);
 }else{
  fill.style.transition=animate?'width '+duration+'ms linear':'none';fill.style.width=percent+'%';
  finish(animate?duration:0);
 }
}
patchProgress.release=releaseProgress;
module.exports=patchProgress;
