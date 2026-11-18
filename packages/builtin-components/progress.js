'use strict';
function patchProgress(element,attrs,ErrorType,emit) {
 'use strict';
 const fail=message=>{throw new ErrorType(message,{code:'INVALID_ARGUMENT'});};
 const number=(value,fallback,min,max)=>{const result=value===undefined?fallback:Number(value);if(!Number.isFinite(result)||result<min||result>max)fail('progress数值超出支持范围');return result;};
 const percent=number(attrs.percent,0,0,100),stroke=number(attrs['stroke-width'],6,1,100),size=number(attrs['font-size'],16,1,100);
 for(const key of ['show-info','active'])if(attrs[key]!==undefined&&typeof attrs[key]!=='boolean')fail('progress布尔属性需要boolean');
 const color=(value,fallback)=>{if(value===undefined)return fallback;if(typeof value!=='string'||value.length>128||/[;{}<>]/.test(value)||/url\s*\(/i.test(value))fail('progress颜色无效');return value;};
 const active=color(attrs.activeColor??attrs.color,'#09bb07'),background=color(attrs.backgroundColor,'#ebebeb');const mode=attrs['active-mode']===undefined?'backwards':attrs['active-mode'];if(!['backwards','forwards'].includes(mode))fail('progress.active-mode仅支持backwards或forwards');const duration=number(attrs.duration,500,0,10000);
 if(!element.weappProgress){const document=element.ownerDocument,track=document.createElement('div'),fill=document.createElement('div'),info=document.createElement('span');track.append(fill);element.append(track,info);element.weappProgress={track,fill,info};}
 const state=element.weappProgress,{track,fill,info}=state;
 Object.assign(element.style,{display:'flex',alignItems:'center',gap:'8px',width:'100%'});
 Object.assign(track.style,{flex:'1',height:stroke+'px',overflow:'hidden',backgroundColor:background});
 Object.assign(fill.style,{height:'100%',backgroundColor:active,transition:attrs.active?'width '+duration+'ms linear':'none'});
 const window=element.ownerDocument.defaultView;
 if(attrs.active&&mode==='backwards'&&(!state.painted||state.frame)&&window?.requestAnimationFrame&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
   fill.style.width='0%';state.target=percent;
   if(!state.frame)state.frame=window.requestAnimationFrame(()=>{state.frame=null;if(element.isConnected){void fill.offsetWidth;fill.style.width=state.target+'%';}});
 }else{state.target=percent;fill.style.width=percent+'%';}
 if(state.frame) { window?.cancelAnimationFrame?.(state.frame); state.frame=null; } if(state.endTimer!==undefined)window?.clearTimeout?.(state.endTimer); state.painted=true;state.lastPercent=percent;if(attrs.active&&percent>=100){state.endTimer=window?.setTimeout?.(()=>{state.endTimer=undefined;emit?.('activeend',{percent});},duration);}
 info.hidden=!attrs['show-info'];info.textContent=percent+'%';info.style.fontSize=size+'px';
 element.setAttribute('role','progressbar');element.setAttribute('aria-valuemin','0');element.setAttribute('aria-valuemax','100');element.setAttribute('aria-valuenow',String(percent));
}

module.exports=patchProgress;
