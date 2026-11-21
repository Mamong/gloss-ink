function createLayerComponents(root, options) {
  'use strict';
  const document=root.document,records=new Map(),locks=createLayerComponents.locks||(createLayerComponents.locks=new WeakMap());const stacks=createLayerComponents.stacks||(createLayerComponents.stacks=new WeakMap());let visible=true,disposed=false,sequence=0,portalAnchor;
  function stack(){let value=stacks.get(options.page);if(!value){value=[];stacks.set(options.page,value);}return value;}
  function unstack(record){const values=stack(),index=values.indexOf(record);if(index>=0)values.splice(index,1);}
  const fail=message=>{throw new options.Error(message,{code:'INVALID_ARGUMENT'});};
  const live=record=>!disposed&&visible&&options.live()&&record.element.isConnected;
  const emit=(record,name)=>{if(live(record))options.emit(record.element,name,{});};
  const bool=(value,fallback)=>{if(value===undefined)return fallback;if(typeof value!=='boolean')fail('弹层布尔属性需要boolean');return value;};
  function cancelTimer(record){if(record.timer!==undefined)root.clearTimeout(record.timer);record.timer=undefined;record.animation?.cancel?.();record.animation=null;record.generation++;}
  function lock(record){if(record.locked)return;const page=options.page;let state=locks.get(page);if(!state){state={count:0,overflow:page.style.overflow||''};locks.set(page,state);}state.count++;page.style.overflow='hidden';record.locked=true;}
  function unlock(record){if(!record.locked)return;record.locked=false;const page=options.page,state=locks.get(page);if(state&&!--state.count){page.style.overflow=state.overflow;locks.delete(page);}}
  function restoreFocus(record){const target=record.focus,top=stack().at(-1);if(top&&!top.element.contains?.(target)){record.focus=null;return;}record.focus=null;if(target?.isConnected&&!target.closest?.('[inert]')&&target.focus)try{target.focus({preventScroll:true});}catch(_) {}}
  function closeNative(record){if(record.tag==='page-container'){if(record.element.open)record.element.close?.();record.element.removeAttribute('open');unlock(record);unstack(record);}else if(record.popover){try{record.element.hidePopover?.();}catch(_){}record.popover=false;}record.element.hidden=true;}
  function finish(record,opening){const generation=record.generation;const done=()=>{record.timer=undefined;if(disposed||generation!==record.generation)return;if(opening){record.phase='shown';emit(record,'afterenter');}else{record.phase='closed';emit(record,'afterleave');closeNative(record);restoreFocus(record);}};if(record.duration)record.timer=root.setTimeout(done,record.duration);else done();}
  function transition(record,opening){
    if(opening){if(record.phase==='shown'||record.phase==='entering'||!live(record))return;cancelTimer(record);record.focus=record.resumeFocus?.isConnected?record.resumeFocus:document.activeElement;record.resumeFocus=null;while(record.focus?.shadowRoot?.activeElement)record.focus=record.focus.shadowRoot.activeElement;record.phase='entering';record.element.hidden=false;emit(record,'beforeenter');
      if(record.element.showModal){try{record.element.showModal();}catch(_){record.phase='closed';record.element.hidden=true;return;}}else record.element.setAttribute('open','');record.element.focus?.({preventScroll:true});lock(record);unstack(record);stack().push(record);record.element.style.opacity='1';if(record.duration&&record.element.animate&&!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches)record.animation=record.element.animate([{opacity:0},{opacity:1}],{duration:record.duration,easing:'ease-out'});emit(record,'enter');finish(record,true);
    }else{if(['closed','leaving'].includes(record.phase))return;cancelTimer(record);record.phase='leaving';emit(record,'beforeleave');record.element.style.opacity='0';if(record.duration&&record.element.animate&&!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches)record.animation=record.element.animate([{opacity:1},{opacity:0}],{duration:record.duration,easing:'ease-in'});emit(record,'leave');finish(record,false);}
  }
  function dismiss(record,overlay){if(record.phase==='closed'||record.phase==='leaving')return;if(overlay)emit(record,'clickoverlay');record.dismissed=true;transition(record,false);}
  function declarations(value,kind){if(value===undefined||value==='')return '';if(typeof value!=='string'||value.length>2048)fail('弹层样式无效');const allowed=kind==='overlay'?new Set(['background','background-color','opacity','filter','backdrop-filter']):new Set(['width','height','min-width','min-height','max-width','max-height','background','background-color','color','border-radius','padding']);for(const part of value.split(';')){if(!part.trim())continue;const match=/^\s*([a-z-]+)\s*:\s*([^{}<>]+)\s*$/i.exec(part);if(!match||!allowed.has(match[1].toLowerCase())||/url\s*\(|expression\s*\(|@/i.test(match[2]))fail('弹层样式包含不支持的声明');}return options.style(value);}
  function decorate(record){const e=record.element,p=record.props,position=p.position||'bottom';
    const inset={top:'0 auto auto 0',bottom:'auto auto 0 0',right:'0 0 auto auto',center:'50% auto auto 50%'}[position];
    Object.assign(e.style,{position:'fixed',inset,margin:'0',border:'0',padding:'0',boxSizing:'border-box',maxWidth:'100%',maxHeight:'100%',overflow:'hidden',width:position==='right'?'100%':position==='center'?'min(90%, 32rem)':'100%',height:position==='right'?'100%':'auto',transform:position==='center'?'translate(-50%,-50%)':'none',transition:root.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'none':'opacity '+record.duration+'ms ease',borderRadius:p.round?({bottom:'20px 20px 0 0',top:'0 0 20px 20px',right:'20px 0 0 20px'})[position]||'20px':'0',backgroundColor:'var(--weapp-layer-background, #fff)',color:'inherit'});
    const custom=declarations(p['custom-style'],'panel');if(custom)e.style.cssText+=';'+custom;
    const overlay=declarations(p['overlay-style'],'overlay');record.sheet.textContent='[data-now-page-container="'+record.id+'"]::backdrop{background:'+(p.overlay===false?'transparent':'rgba(0,0,0,.7)')+';'+(p.overlay===false?'':overlay)+'}';
    let theme;for(let parent=e.parentElement;parent;parent=parent.parentElement||parent.getRootNode?.().host){theme=parent.getAttribute?.('data-weui-theme');if(theme)break;}theme ||= options.theme?.();
    if(theme==='dark'){if(!/background/.test(custom))e.style.backgroundColor='#252527';if(!/(?:^|;)\s*color\s*:/.test(custom))e.style.color='#ededed';}
  }
  function create(element,tag){if(!['root-portal','page-container'].includes(tag))return;const record={element,tag,id:String(options.scope||'layer')+'-'+(++sequence),props:{},phase:'closed',generation:0,listeners:[]};records.set(element,record);const on=(name,fn)=>{element.addEventListener(name,fn);record.listeners.push([name,fn]);};
    if(tag==='root-portal'){element.setAttribute('popover','manual');return;}
    element.hidden=true;element.setAttribute('data-now-page-container',record.id);element.setAttribute('aria-label','页面弹层');element.setAttribute('tabindex','-1');record.sheet=document.createElement('style');record.sheet.nonce=document.querySelector?.('style[nonce]')?.nonce||'';options.styleRoot.append(record.sheet);
    on('cancel',event=>{event.preventDefault();dismiss(record,false);});
    on('click',event=>{if(event.target!==element||record.props.overlay===false)return;const r=element.getBoundingClientRect?.();if(!r||event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dismiss(record,true);});
    on('keydown',event=>{if(event.key==='Escape'){event.preventDefault();dismiss(record,false);}});
    on('pointerdown',event=>{if(record.props['close-on-slide-down']&&event.button===0&&!(element.scrollTop||0))record.slide={x:event.clientX,y:event.clientY};});
    on('pointerup',event=>{const start=record.slide;record.slide=null;if(start&&event.clientY-start.y>80&&Math.abs(event.clientX-start.x)<50)dismiss(record,false);});
    on('pointercancel',()=>{record.slide=null;});
  }
  function patch(element,node,old){const record=records.get(element);if(!record)return;record.props=node.attrs;
    if(record.tag==='root-portal'){record.enabled=bool(node.attrs.enable,true);return;}
    const p=node.attrs;record.show=bool(p.show,false);if(!record.show)record.resumeFocus=null;bool(p.round,false);bool(p.overlay,true);bool(p['close-on-slide-down'],false);if(p.position!==undefined&&!['top','bottom','right','center'].includes(p.position))fail('page-container.position无效');record.duration=p.duration===undefined?300:Number(p.duration);if(!Number.isFinite(record.duration)||record.duration<0||record.duration>5000)fail('page-container.duration需要0–5000毫秒');
    if(!old||old.attrs.show!==p.show||node.forced?.includes('show'))record.dismissed=false;decorate(record);
  }
  function flush(){for(const record of records.values()){
    if(record.tag==='root-portal'){
      if(!record.element.isConnected)continue;
      if(!visible){if(record.popover)try{record.element.hidePopover?.();}catch(_){}record.popover=false;record.element.hidden=true;continue;}
      record.element.hidden=false;
      if(record.enabled){record.element.setAttribute('popover','manual');Object.assign(record.element.style,{position:'absolute',inset:'auto',top:'0px',left:'0',margin:'0',border:'0',padding:'0',width:'100%',height:'auto',maxWidth:'none',maxHeight:'none',overflow:'visible',background:'transparent',pointerEvents:'none'});if(!record.popover&&record.element.showPopover)try{record.element.showPopover();record.popover=true;}catch(_){}record.element.setAttribute('data-now-portal-active','true');
        // A flow anchor follows page content even when the page fills the viewport.
        if(!portalAnchor){portalAnchor=document.createElement('div');portalAnchor.className='weapp-root-portal-anchor';portalAnchor.setAttribute('aria-hidden','true');portalAnchor.style.cssText='display:block;position:static;width:0;height:0;margin:0;padding:0;border:0;overflow:hidden;pointer-events:none;';}
        const page=options.page;if(page.childNodes[page.childNodes.length-1]!==portalAnchor)page.append(portalAnchor);
        record.element.style.top=((portalAnchor.getBoundingClientRect?.().top||0)+(root.scrollY||0))+'px';}
      else{if(record.popover)try{record.element.hidePopover?.();}catch(_){}record.popover=false;record.element.removeAttribute('popover');record.element.removeAttribute('data-now-portal-active');for(const key of ['position','inset','top','left','margin','border','padding','width','height','maxWidth','maxHeight','overflow','background','pointerEvents'])record.element.style[key]='';if(record.props.style)record.element.style.cssText=options.style(record.props.style);}
    }else if(live(record))transition(record,record.show&&!record.dismissed);
  }}
  const observer=typeof root.ResizeObserver==='function'?new root.ResizeObserver(()=>{if(!disposed)flush();}):null;observer?.observe(options.page);
  function remove(element){const record=records.get(element);if(!record)return;cancelTimer(record);closeNative(record);restoreFocus(record);record.sheet?.remove();for(const[name,fn]of record.listeners)element.removeEventListener(name,fn);records.delete(element);if(![...records.values()].some(item=>item.tag==='root-portal')){portalAnchor?.remove();portalAnchor=null;}}
  return{create,patch,flush,remove,back(){const record=stack().at(-1);if(!record||!live(record))return false;if(record.phase!=='leaving')dismiss(record,false);return true;},visibility(value){visible=value;if(!value)for(const record of records.values()){cancelTimer(record);record.resumeFocus=record.focus||record.resumeFocus;closeNative(record);record.phase='closed';record.slide=null;record.focus=null;}else flush();},dispose(){disposed=true;observer?.disconnect();portalAnchor?.remove();portalAnchor=null;for(const element of [...records.keys()])remove(element);}};
}

module.exports = createLayerComponents;
