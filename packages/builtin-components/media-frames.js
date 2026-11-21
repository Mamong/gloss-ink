'use strict';
function createMediaFrames(root,options={}){
 const document=root.document,records=new Map();
 const fail=message=>{throw new (options.Error||Error)(message,{code:'INVALID_ARGUMENT'});};
 const live=record=>!record.removed&&record.host.isConnected&&!record.host.hidden&&(!options.live||options.live())&&(!options.interactive||options.interactive(options.node?.(record.host)||record.node));
 const format=time=>{time=Number.isFinite(time)?time:0;return String(Math.floor(time/60)).padStart(2,'0')+':'+String(Math.floor(time%60)).padStart(2,'0');};
 function repaint(record){
  if(record.tag==='canvas')return;
  const {host,media}=record,attrs=record.attrs||{},cover=!!attrs.src&&attrs['show-center-play-btn']!==false&&!record.hasPlayed,controls=record.controlsOverride??attrs.controls!==false;
  record.bar.hidden=!controls||cover;record.top.hidden=!controls||cover;record.cover.hidden=!cover;record.poster.hidden=!attrs.poster||record.hasPlayed;record.poster.style.objectFit=attrs['object-fit']||'contain';
  record.current.textContent=format(media.currentTime);record.duration.textContent=format(media.duration);record.coverDuration.textContent=format(media.duration);record.progress.setAttribute('aria-valuenow',String(Number(media.currentTime)||0));record.progress.setAttribute('aria-valuemax',String(Number.isFinite(media.duration)?media.duration:0));host.dataset.playing=String(!media.paused);
 }
 function create(host,node){
  const media=document.createElement(node.tag),record={host,media,tag:node.tag,node,listeners:[]};records.set(host,record);media.className='weapp-'+node.tag+'-plane';
  if(node.tag==='canvas'){
   host.weappCanvas=media;media.weappCanvasHost=host;for(const name of ['width','height'])Object.defineProperty(host,name,{configurable:true,get:()=>media[name],set:value=>{media[name]=value;}});
   for(const name of ['getContext','toDataURL'])if(typeof media[name]==='function')host[name]=(...args)=>media[name](...args);
   host.append(media);return;
  }
  host.weappVideo=media;host.weappVideoControls=value=>{record.controlsOverride=value;repaint(record);};media.playsInline=true;media.controls=false;media.setAttribute('tabindex','0');media.setAttribute('aria-label','视频，按空格播放或暂停');
  const on=(element,name,handler)=>{element.addEventListener(name,handler);record.listeners.push([element,name,handler]);};
  const part=(name,parent=host)=>{const element=document.createElement('div');element.className='weapp-video-'+name;parent.append(element);return element;};
  const container=part('container');container.append(media);const mask=part('empty-mask',container);mask.style.pointerEvents='none';record.poster=document.createElement('img');record.poster.className='weapp-video-poster';mask.append(record.poster);record.cover=part('cover',container);
  const play=part('cover-button',record.cover);play.setAttribute('role','button');play.setAttribute('tabindex','0');play.setAttribute('aria-label','播放视频');
  const start=()=>{if(!live(record))return;try{media.play()?.catch?.(()=>{});}catch(_){}};
  on(play,'click',start);on(play,'keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();start();}});
  const toggle=()=>{if(!live(record))return;if(media.paused)start();else media.pause();};on(media,'click',toggle);on(media,'keydown',event=>{if(event.key===' '||event.key==='Enter'){event.preventDefault();toggle();}});
  record.coverDuration=document.createElement('p');record.coverDuration.className='weapp-video-cover-duration';record.cover.append(record.coverDuration);record.top=part('top-bar',container);part('background-button',record.top).setAttribute('aria-hidden','true');record.bar=part('bar',container);const controls=part('controls',record.bar),wrapper=part('progress-wrapper',controls);
  record.current=part('current-time',wrapper);record.progress=part('progress-container',wrapper);record.progress.setAttribute('role','slider');record.progress.setAttribute('tabindex','0');record.progress.setAttribute('aria-label','播放进度');record.progress.setAttribute('aria-valuemin','0');const track=part('progress',record.progress);part('ball',track);record.duration=part('duration',wrapper);
  on(record.progress,'keydown',event=>{if(live(record)&&['ArrowLeft','ArrowRight'].includes(event.key)&&Number.isFinite(media.duration)){event.preventDefault();media.currentTime=Math.max(0,Math.min(media.duration,media.currentTime+(event.key==='ArrowRight'?1:-1)));}});
  on(record.progress,'click',event=>{if(!live(record)||!Number.isFinite(media.duration))return;const box=record.progress.getBoundingClientRect();if(box.width>0)media.currentTime=Math.max(0,Math.min(media.duration,(event.clientX-box.x)/box.width*media.duration));});
  const fullscreen=part('fullscreen',controls);fullscreen.setAttribute('role','button');fullscreen.setAttribute('tabindex','0');fullscreen.setAttribute('aria-label','全屏');const full=()=>{if(live(record))host.requestFullscreen?.()?.catch?.(()=>{});};on(fullscreen,'click',full);on(fullscreen,'keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();full();}});
  for(const name of ['play','pause','ended','timeupdate','loadedmetadata','durationchange','seeking','seeked','error'])on(media,name,event=>{
   if(record.removed)return;event.stopPropagation();if(name==='play')record.hasPlayed=true;
   if(name==='loadedmetadata'&&record.initialTime!==undefined){try{media.currentTime=record.initialTime;}catch(_){}record.initialTime=undefined;}
   repaint(record);if(live(record))options.emit?.(host,name,{currentTime:Number(media.currentTime)||0,duration:Number.isFinite(media.duration)?media.duration:0,width:media.videoWidth||0,height:media.videoHeight||0});
  });
 }
 function attributes(host,old,node){
  const record=records.get(host),attrs=node.attrs;record.node=node;
  const common=Object.fromEntries(Object.entries(attrs).filter(([name])=>['id','class','style','hidden'].includes(name)||name.startsWith('data-')||name.startsWith('aria-')));
  options.attributes(host,old,{...node,tag:'view',attrs:common});host.className='weapp-'+node.tag+(attrs.class?' '+(options.classNames?options.classNames(attrs.class):String(attrs.class)):'');record.attrs=attrs;
  if(node.tag==='canvas'){
   if(attrs['disable-scroll']!==undefined&&typeof attrs['disable-scroll']!=='boolean')fail('canvas.disable-scroll需要boolean');host.style.touchAction=attrs['disable-scroll']?'none':'auto';
   for(const name of ['width','height'])if(attrs[name]!==undefined){const size=Number(attrs[name]);if(!Number.isInteger(size)||size<1||size>4096)fail('canvas.'+name+'需要1–4096的整数');if(!options.canvasTransfer?.resize(record.media,name,size)){record.media.setAttribute(name,String(size));record.media[name]=size;}host.setAttribute(name,String(size));}
   if(attrs.type!==undefined)host.setAttribute('type',String(attrs.type));else host.removeAttribute('type');
   if(attrs['canvas-id']!==undefined)host.setAttribute('canvas-id',String(attrs['canvas-id']));else host.removeAttribute('canvas-id');return;
  }
  for(const name of ['muted','loop','autoplay','controls','show-center-play-btn'])if(attrs[name]!==undefined&&typeof attrs[name]!=='boolean')fail('video.'+name+'需要boolean');
  const media=record.media;for(const name of ['muted','loop','autoplay'])media[name]=!!attrs[name];
  const fit=attrs['object-fit']||'contain';if(!['contain','fill','cover'].includes(fit))fail('video.object-fit无效');media.style.objectFit=fit;
  const asset=value=>value?(options.asset?.(value,node.origin)||root.__nowImageResources?.get?.(String(value))||String(value)):'';
  const poster=asset(attrs.poster);if(record.poster.getAttribute('src')!==poster){if(poster)record.poster.setAttribute('src',poster);else record.poster.removeAttribute('src');}
  const src=asset(attrs.src);if(media.getAttribute('src')!==src){record.hasPlayed=false;if(src)media.setAttribute('src',src);else if(media.hasAttribute('src')){media.removeAttribute('src');media.load?.();}}
  if(attrs['initial-time']!==undefined&&(!old||old['initial-time']!==attrs['initial-time'])){const time=Number(attrs['initial-time']);if(!Number.isFinite(time)||time<0)fail('video.initial-time需要非负数');record.initialTime=time;if(Number.isFinite(media.duration)){try{media.currentTime=time;record.initialTime=undefined;}catch(_){}}}
  repaint(record);
 }
 function remove(host){const record=records.get(host);if(!record)return;record.removed=true;for(const [element,name,listener]of record.listeners)element.removeEventListener(name,listener);if(record.tag==='video'){try{record.media.pause?.();record.media.removeAttribute('src');record.media.load?.();}catch(_){}delete host.weappVideoControls;}records.delete(host);}
 return {create,attributes,remove};
}
module.exports=createMediaFrames;
