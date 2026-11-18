"use strict";
function createBrowserAttributes(options){
 const {root,Error:ErrorType=Error,textInputs={value:()=>false},string=value=>value==null?'':String(value),style=value=>string(value),classNames=value=>string(value),asset=()=>{throw new ErrorType('缺少资源解析接口',{code:'INVALID_ARGUMENT'});},remoteImages=new Map(),deferImage=()=>false,schedule=()=>{},live=()=>true,registry,canvasTransfer,accessibility,owner}=options;
 const environment={canvasTransfer};
  function attributes(element, old, node) {
    const next = node.attrs;accessibility?.validate(next);
    if(element.virtualRange){element.attrs=next;element.dataset=node.dataset;element.className='weapp-'+node.tag+(next.class?' '+classNames(next.class):'');return;}
    if(owner!==undefined)element.setAttribute('data-weapp-owner',owner);
    element.className = 'weapp-' + node.tag + (next.class ? ' ' + classNames(next.class) : '');
    for (let name of new Set([...Object.keys(old || {}), ...Object.keys(next)])) {
      if(node.tag==='web-view'&&name==='src')continue;
      const value = next[name];if(accessibility&&(name.startsWith('aria-')||name==='tabindex'))continue;if(node.tag==='picker'&&['mode','range','range-key','value','start','end','fields','disabled'].includes(name))continue; if (name === 'animation') continue; if (name === 'class' || Object.is(old?.[name], value) && !(name==='src'&&/^(?:(?:nowfile|nowsaved):|https:)\/\//.test(String(value))) && !node.forced?.includes(name)) continue;
      if(node.tag==='switch'&&name==='type'){if(!['switch','checkbox'].includes(value))throw new ErrorType('switch.type只支持switch/checkbox',{code:'INVALID_ARGUMENT'});element.setAttribute('data-weapp-switch-type',String(value));continue;}
      if(node.tag==='swiper-item'&&name==='skip-hidden-item-layout'){if(typeof value!=='boolean')throw new ErrorType('swiper-item.skip-hidden-item-layout需要boolean',{code:'INVALID_ARGUMENT'});element.setAttribute('data-now-skip-hidden',String(value));continue;}
      if(node.tag==='form'&&name==='report-submit-timeout'){const timeout=Number(value);if(!Number.isFinite(timeout)||timeout<0||timeout>60000)throw new ErrorType('form.report-submit-timeout需要0–60000数值',{code:'INVALID_ARGUMENT'});element.setAttribute('data-now-report-submit-timeout',String(timeout));continue;}
      if (name === 'style') { element.style.cssText=style(value,node.origin); continue; }
      if (node.tag === 'canvas') {
        if (name === 'disable-scroll') { if (typeof value !== 'boolean') throw new ErrorType('canvas.disable-scroll需要boolean', {code:'INVALID_ARGUMENT'}); element.style.touchAction = value === false ? 'auto' : 'none'; continue; }
        if (name === 'width' || name === 'height') { const size = Number(value); if (!Number.isInteger(size) || size < 1 || size > 4096) throw new ErrorType('canvas.' + name + '需要1–4096的整数', {code:'INVALID_ARGUMENT'}); if(!environment.canvasTransfer?.resize(element,name,size)){element.setAttribute(name, String(size));element[name]=size;} continue; }
        if (name === 'canvas-id') { if (value === undefined) element.removeAttribute('canvas-id'); else element.setAttribute('canvas-id', string(value)); continue; }
      }
      if(name==='lang'&&['button','input','textarea'].includes(node.tag)){if(typeof value!=='string'||value.length>35||/[\x00-\x1f\x7f]/.test(value))throw new ErrorType('lang需要最多35字符的字符串',{code:'INVALID_ARGUMENT'});element.lang=value;element.setAttribute('lang',value);continue;}
      if (name === 'value') { const desired = string(value); if(!textInputs.value(element,desired)&&element.value!==desired)element.value=desired; continue; }
      if (['hidden', 'disabled', 'checked'].includes(name)) { element[name] = !!value; continue; }
      if(['focus','auto-focus','cursor','selection-start','selection-end','cursor-color','placeholder-class','placeholder-style'].includes(name))continue;
      if(node.tag==='text'&&['selectable','user-select','space','decode','overflow','max-lines','select-on-gesture'].includes(name))continue;
      if (name === 'background-size'&&node.tag==='image'){element.style.backgroundSize=string(value);continue;}
      if (name === 'fade-in' && node.tag==='image') { if(typeof value!=='boolean') throw new ErrorType('image.fade-in需要boolean',{code:'INVALID_ARGUMENT'}); element.dataset.nowFadeIn=String(value); continue; }
      if (name === 'preload' && node.tag==='image') { if(typeof value!=='boolean') throw new ErrorType('image.preload需要boolean',{code:'INVALID_ARGUMENT'}); element.loading=value?'eager':'lazy'; continue; }
      if (name === 'forceHttps' && node.tag==='image') { if(typeof value!=='boolean') throw new ErrorType('image.forceHttps需要boolean',{code:'INVALID_ARGUMENT'}); continue; }
      if (name === 'webp' && node.tag==='image') { if(typeof value!=='boolean') throw new ErrorType('image.webp需要boolean',{code:'INVALID_ARGUMENT'}); continue; }
      if (name === 'show-menu-by-longpress' && node.tag==='image') { if(typeof value!=='boolean') throw new ErrorType('image.show-menu-by-longpress需要boolean'); element.dataset.nowImageMenu=String(value); continue; }
    if (node.tag === 'video') {
      if(name==='src'){
        const source=string(value);const url=asset(source,node.origin)||root.__nowImageResources?.get(source)||source;
        if(url&&element.getAttribute('src')!==url)element.setAttribute('src',url);if(!url&&element.getAttribute('src'))element.removeAttribute('src');continue;
      }
      if(['controls','autoplay','loop','muted','show-center-play-btn','show-fullscreen-btn','show-play-btn','show-progress','enable-progress-gesture'].includes(name)){element[name==='show-progress'?'controls':name]=!!value;continue;}
      if(name==='poster'){const url=asset(value,node.origin)||root.__nowImageResources?.get(String(value))||String(value||'');if(url)element.poster=url;continue;}
      if(name==='object-fit'){element.style.objectFit=String(value||'contain');continue;}
      if(name==='initial-time'){const time=Number(value);if(Number.isFinite(time)&&time>=0&&!Number.isNaN(element.duration))try{element.currentTime=time;}catch(_){}continue;}
    }
      if (name === 'src') {
        const source=String(value??'');element.decoding='async';
        if(next['lazy-load']&&/^(?:https:|nowfile:|nowsaved:)/.test(source)&&!remoteImages.get(source)?.data&&deferImage(element,source,()=>{if(live())schedule();}))continue;
        if(next.forceHttps&&/^http:\/\//i.test(source))throw new ErrorType('image.forceHttps拒绝http图片',{code:'INVALID_ARGUMENT'});
        const url=asset(value,node.origin),changed=element.weappImageRequest!==source;
        if(changed){
          element.weappImageRequest=source;element.weappImageGeneration=(element.weappImageGeneration||0)+1;element.weappImageErrorGeneration=null;
          if(element.weappImageReveal){element.removeEventListener('load',element.weappImageReveal);element.weappImageReveal=null;}
          element.style.opacity=next['fade-in']===false?'1':'0';
        }
        const generation=element.weappImageGeneration;
        if(url){
          if(element.getAttribute('src')!==url){
            let reveal;
            if(next['fade-in']!==false){
              if(element.weappImageReveal)element.removeEventListener('load',element.weappImageReveal);
              reveal=()=>{element.removeEventListener('load',reveal);if(element.weappImageReveal===reveal)element.weappImageReveal=null;if(element.weappImageGeneration!==generation)return;element.style.opacity='1';};
              element.weappImageReveal=reveal;element.addEventListener('load',reveal);
            }
            element.setAttribute('src',url);
            if(reveal&&element.complete&&element.naturalWidth)Promise.resolve().then(reveal);
          }else if(next['fade-in']!==false&&element.complete&&element.naturalWidth&&element.style.opacity==='0')element.style.opacity='1';
        }else{
          if(element.getAttribute('src'))element.removeAttribute('src');
          const failure=remoteImages.get(source)?.error?{message:remoteImages.get(source).error}:root.__nowImageResources?.error(source);
          if(failure&&element.weappImageErrorGeneration!==generation){
            element.weappImageErrorGeneration=generation;
            Promise.resolve().then(()=>{if(live()&&element.isConnected&&element.weappImageGeneration===generation)element.dispatchEvent(new root.CustomEvent('error',{detail:{errMsg:'image:fail '+failure.message}}));});
          }
        }
        continue;
      }
      if (['type', 'size', 'plain', 'loading'].includes(name) && node.tag === 'button') { element.setAttribute('data-weapp-' + name, string(value)); continue; }
      if (name === 'type' && node.tag === 'input') { element.type = ['digit', 'idcard'].includes(value) ? 'text' : value || 'text'; if (value === 'digit') element.setAttribute('inputmode', 'decimal'); continue; }
      if (name === 'password') { if (value) element.type = 'password'; else if (old?.password) element.type = string(next.type || 'text'); continue; }
      if (name === 'maxlength' && Number(value) < 0) { element.removeAttribute('maxlength'); continue; }
      if (name === 'confirm-type') { element.setAttribute('enterkeyhint', string(value)); continue; }
      if (name === 'hover-class' || name === 'mode' || name === 'auto-height' || name === 'color') continue;
      if (name === 'scroll-x' || name === 'scroll-y') { element.style[name === 'scroll-x' ? 'overflowX' : 'overflowY'] = value ? 'auto' : 'hidden'; continue; }
      if (name === 'scroll-top' || name === 'scroll-left') continue;
      if (name === 'lazy-load') { element.setAttribute('loading', value ? 'lazy' : 'eager'); continue; }
      if (value === undefined || value === null || value === false) element.removeAttribute(name);
      else element.setAttribute(name, typeof value === 'object' ? JSON.stringify(value) : string(value));
    }
    registry.patchAttributes(element,node,old);

  }
 return attributes;
}
module.exports=createBrowserAttributes;
