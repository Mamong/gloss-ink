'use strict';
function createVideoRuntime(root, options) {
  const overlays=new Map();let disposed=false,visible=true;
  function videoElement(videoId){
    const found=options.find(videoId);
    if(!found)throw new options.Error('未找到对应的 video 组件',{code:'VIDEO_NOT_FOUND'});return found;
  }
  function video(method,value={}){
    if(disposed)throw new options.Error('视频控制器已销毁',{code:'PAGE_UNLOADED'});
    const host=videoElement(value.videoId),element=host.weappVideo||host,fail=(code,message)=>{throw new options.Error(message,{code})};
    if(!visible||!options.live(host))fail('PAGE_NOT_READY','视频所属页面尚未就绪');
    if(method==='play'){const result=element.play?.();return result&&typeof result.then==='function'?result.then(()=>({})).catch(()=>fail('VIDEO_PLAY_FAILED','视频播放失败')):{};}
    if(method==='pause'){element.pause?.();return{};}
    if(method==='stop'){element.pause?.();try{element.currentTime=0;}catch(_){}return{};}
    if(method==='seek'){const position=Number(value.position);if(!Number.isFinite(position)||position<0)fail('INVALID_ARGUMENT','position 需要非负数');try{element.currentTime=position;}catch(_){fail('VIDEO_SEEK_FAILED','视频尚未加载或不支持跳转');}return{};}
    if(method==='playbackRate'){const rate=Number(value.rate);if(!Number.isFinite(rate)||rate<0.5||rate>2)fail('INVALID_ARGUMENT','rate 需要 0.5–2');try{element.playbackRate=rate;}catch(_){fail('VIDEO_FAILED','无法设置播放倍速');}return{};}
    if(method==='requestFullScreen'){if(typeof host.requestFullscreen!=='function')fail('UNKNOWN_METHOD','当前环境不支持视频全屏');const result=host.requestFullscreen();return result&&typeof result.then==='function'?result.then(()=>({})):{};}
    if(method==='exitFullScreen'){if(typeof root.document?.exitFullscreen!=='function')fail('UNKNOWN_METHOD','当前环境不支持退出视频全屏');const result=root.document.exitFullscreen();return result&&typeof result.then==='function'?result.then(()=>({})):{};}
    if(method==='sendDanmu'){const danmu=value.danmu;if(!danmu||typeof danmu!=='object'||typeof danmu.text!=='string'||!danmu.text.trim()||danmu.text.length>128)fail('INVALID_ARGUMENT','danmu.text 需要1–128字符');const item=root.document.createElement('span');item.textContent=danmu.text;Object.assign(item.style,{position:'absolute',top:Math.max(0,Math.min(90,Number(danmu.top)||0))+'%',left:'100%',color:typeof danmu.color==='string'?danmu.color:'#ffffff',textShadow:'0 1px 3px #000',whiteSpace:'nowrap',pointerEvents:'none',zIndex:'2'});element.parentElement?.append(item);const duration=Math.max(1000,Math.min(15000,Number(danmu.duration)||5000));item.animate?.([{transform:'translateX(0)'},{transform:'translateX(-'+Math.max(120,(element.clientWidth||320)+item.offsetWidth)+'px)'}],{duration,fill:'forwards'});const timer=root.setTimeout(()=>{item.remove();overlays.delete(item);},duration);overlays.set(item,{element,timer});return{};}
    if(method==='showStatusBar'){if(host.weappVideoControls)host.weappVideoControls(true);else element.controls=true;return{};}if(method==='hideStatusBar'){if(host.weappVideoControls)host.weappVideoControls(false);else element.controls=false;return{};}
    if(method==='enableAutoRotation'){if(typeof value.enable!=='boolean')fail('INVALID_ARGUMENT','enable 需要布尔值');return{};}
    fail('UNKNOWN_METHOD','未知视频操作');
  }
  function detail(v,name){v=v.weappVideo||v;const base={currentTime:Number(v.currentTime)||0,duration:Number(v.duration)||0};if(name==='loadedmetadata'||name==='durationchange')return{...base,width:v.videoWidth||0,height:v.videoHeight||0};if(name==='timeupdate'||name==='progress'||name==='seeking'||name==='seeked')return base;return base;}
  function remove(element){element=element?.weappVideo||element;for(const [item,record] of overlays)if(record.element===element){root.clearTimeout(record.timer);item.remove();overlays.delete(item);}}
  return {execute:video,detail,remove,visibility(value){visible=value;if(!value)for(const {element} of [...overlays.values()])remove(element);},dispose(){if(disposed)return;disposed=true;for(const {element} of [...overlays.values()])remove(element);}};
}
module.exports = createVideoRuntime;
