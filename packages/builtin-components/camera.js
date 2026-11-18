function createCameraRuntime(root, options) {
  'use strict';
  const records=new Map();let closed=false,visible=true;
  const fail=(code,message)=>new options.Error(message,{code});
  const report=(record,name,detail)=>{if(!closed&&records.has(record.element)&&record.element.isConnected)options.emit(record.element,name,detail);};
  const active=record=>visible&&!closed&&options.live(record.element)&&!record.element.hidden&&record.element.isConnected;
  function stop(record,notify=true){
    record.epoch++;record.opening=false;root.clearTimeout(record.timer);const id=record.id;record.id=null;record.image.removeAttribute('src');if(id)void Promise.resolve().then(()=>options.host('close',{id})).catch(()=>{});else void Promise.resolve().then(()=>options.host('release',{})).catch(()=>{});if(id&&notify)report(record,'stop',{});
  }
  async function preview(record,epoch){
    if(!active(record)||epoch!==record.epoch||!record.id)return;
    try{const value=await options.host('frame',{id:record.id,raw:false});if(epoch!==record.epoch||!active(record))return;record.image.src=value.preview;record.image.setAttribute('src',value.preview);record.timer=root.setTimeout(()=>preview(record,epoch),250);}
    catch(error){if(epoch!==record.epoch)return;stop(record);report(record,'error',{errMsg:error.message,code:error.code||'CAMERA_FAILED'});}
  }
  async function open(record){
    if(!active(record)||record.id||record.opening)return;record.opening=true;const epoch=++record.epoch;
    try{const value=await options.host('open',{position:record.props['device-position']||'back',resolution:record.props.resolution||'medium',mode:record.props.mode||'normal',flash:record.props.flash||'auto'});if(epoch!==record.epoch||!active(record)){if(epoch===record.epoch)record.opening=false;void Promise.resolve().then(()=>options.host('close',{id:value.id})).catch(()=>{});return;}record.id=value.id;record.opening=false;report(record,'initdone',{maxZoom:value.maxZoom});void preview(record,epoch);}
    catch(error){if(epoch!==record.epoch)return;record.opening=false;if(error.code==='PAGE_NOT_READY'&&active(record)){record.timer=root.setTimeout(()=>open(record),50);return;}record.failed=true;report(record,'error',{errMsg:error.message,code:error.code||'CAMERA_FAILED'});}
  }
  function create(element,tag){if(tag!=='camera')return;if(records.size)throw fail('CAMERA_LIMIT','同一页面或组件作用域只能有一个camera');const image=root.document.createElement('img');image.alt='';image.setAttribute('aria-hidden','true');image.style.cssText='display:block;width:100%;height:100%;object-fit:cover;';element.append(image);records.set(element,{element,image,props:{},epoch:0,opening:false,id:null});}
  function patch(element,node){const record=records.get(element);if(!record)return;const p=node.attrs;
    for(const[name,values]of Object.entries({mode:['normal','scanCode'],resolution:['low','medium','high'],'device-position':['front','back'],flash:['auto','on','off','torch'],'frame-size':['small','medium','large']}))if(p[name]!==undefined&&!values.includes(p[name]))throw fail('INVALID_ARGUMENT','camera.'+name+' 无效');
    const changed=['device-position','flash'].some(name=>record.props[name]!==p[name]);
    if(record.initial&&['mode','resolution'].some(name=>record.initial[name]!==p[name]))throw fail('INVALID_OPERATION','camera.mode/resolution 不支持动态修改');
    record.initial??={mode:p.mode,resolution:p.resolution};record.props={...p};if(changed&&(record.id||record.opening)){stop(record);record.failed=false;}if(!record.failed)void open(record);
  }
  function flush(){for(const record of records.values()){if(!active(record)){if(record.id||record.opening)stop(record);}else if(!record.failed)void open(record);}}
  function visibility(value){visible=value;if(!value)for(const record of records.values()){stop(record);record.failed=false;}else flush();}
  async function execute(method,value){const record=[...records.values()][0];if(!record)throw fail('CAMERA_NOT_FOUND','当前作用域没有camera组件');if(!active(record)||!record.id)throw fail('CAMERA_NOT_READY','相机尚未就绪或页面已隐藏');if(method==='frame'){if(record.props['frame-size']===undefined)throw fail('INVALID_OPERATION','onCameraFrame 需要指定camera.frame-size');return options.host('frame',{id:record.id,raw:true,size:record.props['frame-size']});}return options.host(method,{id:record.id,...value});}
  function remove(element){const record=records.get(element);if(record){stop(record,false);record.image.remove();records.delete(element);}}
  return {create,patch,flush,visibility,execute,remove,dispose(){closed=true;for(const element of [...records.keys()])remove(element);}};
}

module.exports = createCameraRuntime;
