function createSelectorQueryTools() {
  const invalid=message=>{throw Object.assign(new Error(message),{code:'INVALID_ARGUMENT'});};
  function selector(value){
    if(typeof value!=='string'||!value.trim()||value.length>256||/[^A-Za-z0-9_#.*>\s-]/.test(value))invalid('查询仅支持标签、id、class、后代和直接子级选择器');
    const tokens=value.trim().replace(/\s*>\s*/g,' > ').trim().split(/\s+/);let previous='>';
    for(const token of tokens){if(token==='>'){if(previous==='>')invalid('选择器连接符无效');}else if(!token||!/^(?:[A-Za-z][A-Za-z0-9_-]*|\*)?(?:[.#][A-Za-z0-9_-]+)*$/.test(token)||(token.match(/#/g)||[]).length>1)invalid('选择器字段无效');previous=token;}if(previous==='>')invalid('选择器不能以连接符结尾');return value.trim();
  }
  // fields.node / fields.context 依赖真实 canvas 元素与上下文对象；video 仍不渲染。
  function fields(value){
    if(!value||typeof value!=='object'||Array.isArray(value))invalid('查询字段无效或未实现');
    const allowed=['id','dataset','rect','size','scrollOffset','computedStyle','properties','node','context'],accepted={};
    for(const [key,setting] of Object.entries(value)){
      if(!allowed.includes(key))invalid('查询字段无效或未实现');
      accepted[key]=setting;
    }
    for(const key of ['id','dataset','rect','size','scrollOffset','node','context'])if(accepted[key]!==undefined&&typeof accepted[key]!=='boolean')invalid('查询字段需为布尔值');
    if(accepted.computedStyle!==undefined&&(!Array.isArray(accepted.computedStyle)||accepted.computedStyle.length>64||accepted.computedStyle.some(name=>typeof name!=='string'||!/^(?:--)?[-a-z0-9]{1,64}$/.test(name)||['constructor','prototype'].includes(name))))invalid('computedStyle需为最多64个CSS属性');
    if(accepted.properties!==undefined&&(!Array.isArray(accepted.properties)||!accepted.properties.length||accepted.properties.length>64||accepted.properties.some(name=>typeof name!=='string'||!/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(name)||['constructor','prototype','__proto__'].includes(name))))invalid('properties需为1–64个属性名');
    return {...accepted,...(accepted.computedStyle?{computedStyle:accepted.computedStyle.slice()}: {}),...(accepted.properties?{properties:accepted.properties.slice()}: {})};
  }
  // EditorContext methods are callback based in WeChat, including across the worker boundary.
  function editorContext(execute, report) {
    const context = {};
    function invoke(method, settings = {}) {
      if (!settings || typeof settings !== 'object' || Array.isArray(settings)) invalid(method + ' 参数需要对象');
      const callbacks = {};
      for (const name of ['success', 'fail', 'complete']) {
        if (settings[name] !== undefined && typeof settings[name] !== 'function') invalid(name + ' 需要函数');
        callbacks[name] = settings[name];
      }
      const value = Object.fromEntries(Object.entries(settings).filter(([name]) => !['success', 'fail', 'complete'].includes(name)));
      const call = (callback, result) => { try { const pending = callback?.(result); if (pending?.then) pending.catch(error => report?.(error)); } catch (error) { report?.(error); } };
      Promise.resolve().then(() => execute(method, value)).then(result => {
        const response = {...result, errMsg: method + ':ok'};
        call(callbacks.success, response); call(callbacks.complete, response);
      }, error => {
        const response = {errMsg: method + ':fail ' + error.message, errCode: error.code || 'INVALID_ARGUMENT'};
        call(callbacks.fail, response); call(callbacks.complete, response);
        if (!callbacks.fail && !callbacks.complete) report?.(error);
      });
    }
    for (const name of ['insertDivider', 'insertImage', 'insertText', 'setContents', 'getContents', 'clear', 'removeFormat', 'undo', 'redo', 'getHistoryState', 'blur', 'scrollIntoView', 'getSelectionText', 'insertCustomBlock', 'getSelection', 'setSelection', 'getBounds', 'deleteText']) context[name] = settings => invoke(name, settings);
    context.format = (name, value) => invoke('format', {name, value});
    return Object.freeze(context);
  }
  function create(options){let scope=options.scope,queue=[];const check=fn=>{if(fn!==undefined&&typeof fn!=='function')invalid('查询回调必须为函数');};
    const query={in(target){if(!options.resolveScope)invalid('当前环境不支持in作用域');scope=options.resolveScope(target);return query;},select:value=>nodes(selector(value),false,false),selectAll:value=>nodes(selector(value),true,false),selectViewport:()=>nodes(null,false,true),exec(callback){check(callback);const batch=queue;queue=[];const target=scope;if(!batch.length){const work=Promise.resolve([]).then(result=>{if(!options.live(target))throw Object.assign(new Error('页面或组件已销毁'),{code:'PAGE_UNLOADED'});if(callback)callback(result);return result;});work.catch(()=>{});return work;}
      const promise=Promise.resolve().then(()=>{if(!options.live(target))throw Object.assign(new Error('页面或组件已销毁'),{code:'PAGE_UNLOADED'});return options.execute(target,batch.map(({callback,...value})=>value));}).then(result=>{if(!options.live(target))throw Object.assign(new Error('页面或组件已销毁'),{code:'PAGE_UNLOADED'});for(let index=0;index<batch.length;index++)invoke(batch[index].callback,result[index]);invoke(callback,result);return result;});promise.catch(error=>options.report?.(error));return promise;
    }};
    function invoke(fn,value){if(!fn)return;try{const result=fn(value);if(result?.then)Promise.resolve(result).catch(error=>options.report?.(error));}catch(error){options.report?.(error);}}
    function nodes(value,all,viewport){const add=(settings,callback)=>{check(callback);if(queue.length>=64)invalid('单次节点查询最多64项');queue.push({selector:value,all,viewport,fields:fields(settings),callback});return query;};return Object.freeze({boundingClientRect:callback=>add({id:true,dataset:true,rect:true,size:true},callback),scrollOffset:callback=>add({id:true,dataset:true,scrollOffset:true},callback),context:callback=>add({context:true},callback),fields:(settings,callback)=>add(settings,callback),node:callback=>{check(callback);if(queue.length>=64)invalid('单次节点查询最多64项');queue.push({selector:value,all:false,viewport:false,node:true,callback});return query;}});}
    return Object.freeze(query);
  }
  // Canvas node handle: the same object is returned for the same element, width/height stay writable like WeChat.
  const canvasNodes=new WeakMap();
  // 应用自己设置 canvas 节点尺寸后不再由框架按 DPR 接管位图。
  function markManual(element){try{if(element)element.weappCanvasManual=true;}catch(_){}}
  function canvasNode(root,element,options={}){
    if(!element)return null;element=element.weappCanvas||element;
    const name=String(element.tagName||element.nodeName||'').toUpperCase();
    if(name!=='CANVAS')return null;
    const cached=canvasNodes.get(element);if(cached)return cached;
    let context;
    const raf=callback=>{if(typeof root.requestAnimationFrame==='function')return root.requestAnimationFrame(callback);return root.setTimeout(()=>callback(Date.now()),16);};
    const node={
      get width(){return Number(element.width)||0;},
      set width(value){const size=Number(value);if(!Number.isFinite(size)||size<0||size>4096)invalid('canvas.width需要0–4096数值');element.width=Math.round(size);markManual(element);},
      get height(){return Number(element.height)||0;},
      set height(value){const size=Number(value);if(!Number.isFinite(size)||size<0||size>4096)invalid('canvas.height需要0–4096数值');element.height=Math.round(size);markManual(element);},
      getContext(type,settings){
        if(type!=='2d')invalid('canvas.getContext 仅支持 2d');
        if(!context){
          const native=element.getContext?.('2d',settings);
          if(!native)throw Object.assign(new Error('当前环境不支持 canvas 2D 上下文'),{code:'UNKNOWN_METHOD'});
          const methods=new Map();
          context=new Proxy(native,{get(target,name){
            if(name==='canvas')return node;
            const value=Reflect.get(target,name,target);if(typeof value!=='function')return value;
            if(!methods.has(name))methods.set(name,(...args)=>{if(name==='drawImage'||name==='createPattern')args[0]=args[0]?.__nowElement||args[0]?._native||args[0];return Reflect.apply(value,target,args);});
            return methods.get(name);
          },set:(target,name,value)=>Reflect.set(target,name,value,target)});
        }
        return context;
      },
      createImage:()=>canvasImage(root,options.imageSource),
      requestAnimationFrame:raf,
      cancelAnimationFrame:id=>{if(typeof root.cancelAnimationFrame==='function')root.cancelAnimationFrame(id);else root.clearTimeout(id);},
      toDataURL(type,quality){if(typeof element.toDataURL!=='function')throw Object.assign(new Error('当前环境不支持 canvas.toDataURL'),{code:'UNKNOWN_METHOD'});return element.toDataURL(type,quality);}
    };
    Object.defineProperty(node,'__nowElement',{value:element});
    canvasNodes.set(element,node);
    return node;
  }
  // Keep the native Image object so CanvasRenderingContext2D accepts it directly.
  function canvasImage(root,resolveSource){
    if(typeof root.Image!=='function')throw Object.assign(new Error('当前环境不支持 Canvas.createImage'),{code:'UNKNOWN_METHOD'});
    const image=new root.Image();let source='',version=0,prototype=image,descriptor;
    while(prototype&&!descriptor){descriptor=Object.getOwnPropertyDescriptor(prototype,'src');prototype=Object.getPrototypeOf(prototype);}
    if(!descriptor?.set)throw Object.assign(new Error('当前环境不支持 Canvas 图片来源'),{code:'UNKNOWN_METHOD'});
    image.crossOrigin='anonymous';
    Object.defineProperty(image,'src',{configurable:true,get:()=>source,set(value){
      if(typeof value!=='string'||value.length>8*1024*1024)invalid('Canvas 图片 src 需要有效路径');
      source=value;const current=++version;
      // Clear the previous load immediately; a late resolver must not replace a newer src.
      if(typeof image.removeAttribute==='function')image.removeAttribute('src');else descriptor.set.call(image,'');
      if(!value)return;
      Promise.resolve().then(()=>resolveSource?resolveSource(value):value).then(url=>{
        if(current!==version)return;
        if(typeof url!=='string'||!url)invalid('Canvas 图片路径无法解析');
        descriptor.set.call(image,url);
      }).catch(error=>{if(current===version&&typeof image.onerror==='function')image.onerror(error);});
    }});
    return image;
  }
  // 旧版命令式 CanvasContext（wx.createCanvasContext / fields({context})）。
  // 动作先入队，draw() 时回放到真实 2D 上下文；draw 后队列清空，reserve=false 先清空画布。
  const canvasError=(message,code)=>Object.assign(new Error(message),{code});
  function canvasElement(value){value=value?.weappCanvas||value;const name=String(value?.tagName||value?.nodeName||'').toUpperCase();return name==='CANVAS'?value:null;}
  function canvasNumber(name,value,min,max){if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>10000000||(min!==undefined&&value<min)||(max!==undefined&&value>max))invalid(name+'需要有效数值');return value;}
  function canvasColor(name,value){if(typeof value!=='string'||!value.trim()||value.length>256||/[\x00-\x1f\x7f]/.test(value))invalid(name+'需要颜色字符串');return value;}
  function canvasText(value){if(typeof value!=='string'&&typeof value!=='number')invalid('文本需要字符串或数字');const text=String(value);if(text.length>10000)invalid('文本最多10000字符');return text;}
  const canvasGradients=new WeakSet(),canvasPatterns=new WeakSet();
  function canvasGradient(kind,args){const value={kind,args,stops:[],addColorStop(offset,color){canvasNumber('addColorStop.offset',offset,0,1);canvasColor('addColorStop.color',color);value.stops.push([offset,color]);}};canvasGradients.add(value);return Object.freeze(value);}
  function canvasStyleValue(name,value){if(typeof value==='string')return canvasColor(name,value);if(canvasGradients.has(value)||canvasPatterns.has(value))return value;invalid(name+'需要颜色字符串、渐变或图案');}
  async function canvasStyle(value,ctx,load){
    if(typeof value==='string')return value;
    const wireGradient=value&&value.__nowCanvasGradient;
    if(canvasGradients.has(value)||wireGradient){const source=wireGradient||value;const gradient=source.kind==='linear'?ctx.createLinearGradient(...source.args):ctx.createRadialGradient(source.args[0],source.args[1],0,source.args[0],source.args[1],source.args[2]);for(const[offset,color]of source.stops)gradient.addColorStop(offset,color);return gradient;}
    const wirePattern=value&&value.__nowCanvasPattern;
    if(canvasPatterns.has(value)||wirePattern){const source=wirePattern||value;const pattern=ctx.createPattern(await load(source.image),source.repetition);if(!pattern)throw canvasError('画布图案创建失败','IMAGE_UNSUPPORTED');return pattern;}
    invalid('样式需要颜色字符串、渐变或图案');
  }
  function canvasImageLoader(element,options){const cache=new Map();return async source=>{
    if(source&&typeof source==='object'&&(source.tagName||source.nodeName||typeof source.width==='number'))return source;
    if(typeof source!=='string'||!source||source.length>2048)invalid('drawImage 需要图片路径或图像对象');
    if(cache.has(source))return cache.get(source);
    const task=(async()=>{let url=source;if(typeof options.imageSource==='function')url=await options.imageSource(source);if(url&&typeof url==='object')return url;if(typeof url!=='string'||!url)throw canvasError('画布图片无法解析：'+source,'IMAGE_UNSUPPORTED');if(!/^(?:data:|blob:|https?:)/i.test(url))throw canvasError('画布图片地址不受支持：'+source,'INVALID_ARGUMENT');const view=element.ownerDocument?.defaultView||globalThis;if(typeof view.Image!=='function')throw canvasError('当前环境不支持图片加载','UNKNOWN_METHOD');const image=new view.Image();if(/^https?:/i.test(url))image.crossOrigin='anonymous';await new Promise((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(canvasError('画布图片加载失败：'+source,'IMAGE_LOAD_FAILED'));image.src=url;});return image;})();
    cache.set(source,task);return task;};}
  async function applyCanvas(ctx,batch,element,options={}){
    const load=canvasImageLoader(element,options);
    // DPR 放大后基础变换为 scale(dpr)：不受 CTM 影响的参数（阴影）与替换矩阵的 setTransform 需要自己换算。
    const dpr=Number(options.dpr)||1,scaled=value=>dpr===1?value:value*dpr;
    let family;
    const fontFamily=()=>{
      if(family===undefined)family=typeof options.fontFamily==='string'&&options.fontFamily?options.fontFamily:canvasFontFamily(element,options.measureView);
      return family;
    };
    for(const {name,args} of batch){
      switch(name){
        case 'setFillStyle':ctx.fillStyle=await canvasStyle(args[0],ctx,load);break;
        case 'setStrokeStyle':ctx.strokeStyle=await canvasStyle(args[0],ctx,load);break;
        case 'setShadow':ctx.shadowOffsetX=scaled(args[0]);ctx.shadowOffsetY=scaled(args[1]);ctx.shadowBlur=scaled(args[2]);ctx.shadowColor=args[3];break;
        case 'setGlobalAlpha':ctx.globalAlpha=args[0];break;
        case 'setLineWidth':ctx.lineWidth=args[0];break;
        case 'setLineCap':ctx.lineCap=args[0];break;
        case 'setLineJoin':ctx.lineJoin=args[0];break;
        case 'setMiterLimit':ctx.miterLimit=args[0];break;
        case 'setLineDash':if(typeof ctx.setLineDash==='function')ctx.setLineDash(args[0]);if(args[1]!==undefined)ctx.lineDashOffset=args[1];break;
        case 'setLineDashOffset':ctx.lineDashOffset=args[0];break;
        case 'setFontSize':ctx.font=args[0]+'px '+fontFamily();break;
        case 'setTextAlign':ctx.textAlign=args[0];break;
        case 'setTextBaseline':ctx.textBaseline=args[0]==='normal'?'alphabetic':args[0];break;
        case 'setGlobalCompositeOperation':ctx.globalCompositeOperation=args[0];break;
        case 'save':ctx.save();break;
        case 'restore':ctx.restore();break;
        case 'translate':ctx.translate(args[0],args[1]);break;
        case 'rotate':ctx.rotate(args[0]);break;
        case 'scale':ctx.scale(args[0],args[1]);break;
        case 'transform':ctx.transform(...args);break;
        case 'setTransform':ctx.setTransform(scaled(args[0]),scaled(args[1]),scaled(args[2]),scaled(args[3]),scaled(args[4]),scaled(args[5]));break;
        case 'beginPath':ctx.beginPath();break;
        case 'closePath':ctx.closePath();break;
        case 'moveTo':ctx.moveTo(args[0],args[1]);break;
        case 'lineTo':ctx.lineTo(args[0],args[1]);break;
        case 'arc':args.length===6?ctx.arc(args[0],args[1],args[2],args[3],args[4],args[5]):ctx.arc(args[0],args[1],args[2],args[3],args[4]);break;
        case 'arcTo':ctx.arcTo(args[0],args[1],args[2],args[3],args[4]);break;
        case 'quadraticCurveTo':ctx.quadraticCurveTo(args[0],args[1],args[2],args[3]);break;
        case 'bezierCurveTo':ctx.bezierCurveTo(args[0],args[1],args[2],args[3],args[4],args[5]);break;
        case 'rect':ctx.rect(args[0],args[1],args[2],args[3]);break;
        case 'clip':ctx.clip();break;
        case 'fill':ctx.fill();break;
        case 'stroke':ctx.stroke();break;
        case 'fillRect':ctx.fillRect(args[0],args[1],args[2],args[3]);break;
        case 'strokeRect':ctx.strokeRect(args[0],args[1],args[2],args[3]);break;
        case 'clearRect':ctx.clearRect(args[0],args[1],args[2],args[3]);break;
        case 'fillText':ctx.fillText(...args);break;
        case 'strokeText':ctx.strokeText(...args);break;
        case 'drawImage':ctx.drawImage(await load(args[0]),...args.slice(1));break;
        default:throw canvasError('未知画布命令 '+name,'UNKNOWN_METHOD');
      }
    }
  }
  // 旧版命令式画布的位图与坐标系（设计见 docs/weapp/canvas-dpr-2026-11）：
  // 逻辑像素 = CSS 布局盒，位图 = 逻辑 × 有效 DPR；应用自己接管位图时退回 1:1 设备像素。
  const CANVAS_MAX_SIDE=4096,CANVAS_MAX_PIXELS=16777216;
  function canvasSurface(element,root){element=element?.weappCanvas||element;
    const bitmapWidth=Number(element?.width)||0,bitmapHeight=Number(element?.height)||0;
    const plain={managed:false,dpr:1,logicalWidth:bitmapWidth,logicalHeight:bitmapHeight,deviceWidth:bitmapWidth,deviceHeight:bitmapHeight};
    if(String(element?.tagName||element?.nodeName||'').toUpperCase()!=='CANVAS')return plain;
    if(element.weappCanvasManual===true)return plain;
    let logicalWidth=0,logicalHeight=0;
    try{let rect=typeof element.getBoundingClientRect==='function'?element.getBoundingClientRect():null;if((!rect?.width||!rect?.height)&&element.weappCanvasHost)rect=element.weappCanvasHost.getBoundingClientRect?.()||rect;logicalWidth=Math.round(Number(rect?.width)||0);logicalHeight=Math.round(Number(rect?.height)||0);}catch(_){}
    // 取不到布局尺寸（假 DOM、未布局、隐藏）时不放大，保持 1:1。
    if(logicalWidth<1||logicalHeight<1)return plain;
    // 没有 CSS 尺寸时画布布局跟着 width/height 属性走：布局等于我们写过的位图时，逻辑尺寸沿用它，否则会每次放大翻倍。
    const previousDevice=element.weappCanvasDevice,previousLogical=element.weappCanvasLogical;
    if(previousDevice&&previousLogical&&logicalWidth===Number(previousDevice.width)&&logicalHeight===Number(previousDevice.height)&&Number(previousLogical.width)>=1&&Number(previousLogical.height)>=1){
      logicalWidth=Number(previousLogical.width);logicalHeight=Number(previousLogical.height);
    }
    let ratio=Math.round(Number(root?.devicePixelRatio)||1)||1;
    ratio=Math.max(1,Math.min(3,ratio));
    // 位图上限只降低倍率，不报错：应用并没有请求放大。
    ratio=Math.min(ratio,Math.floor(CANVAS_MAX_SIDE/logicalWidth),Math.floor(CANVAS_MAX_SIDE/logicalHeight));
    if(logicalWidth*logicalHeight*ratio*ratio>CANVAS_MAX_PIXELS)ratio=Math.floor(Math.sqrt(CANVAS_MAX_PIXELS/(logicalWidth*logicalHeight)));
    ratio=Math.max(1,Math.min(3,ratio));
    const deviceWidth=logicalWidth*ratio,deviceHeight=logicalHeight*ratio;
    const square=bitmapWidth===logicalWidth&&bitmapHeight===logicalHeight;
    // 框架自己上一次写入的位图也算“框架管理”，布局尺寸变化时允许重建。
    const previous=element.weappCanvasDevice;
    const ours=(bitmapWidth===deviceWidth&&bitmapHeight===deviceHeight)||(Number(previous?.width)===bitmapWidth&&Number(previous?.height)===bitmapHeight);
    if(!square&&!ours){
      // 应用自己选了分辨率（例如 width=400 + style:200px）：视为手动管理，避免尺寸碰巧相等时来回切换。
      try{element.weappCanvasManual=true;}catch(_){}
      return plain;
    }
    return {managed:true,dpr:ratio,logicalWidth,logicalHeight,deviceWidth,deviceHeight};
  }
  // 文字字体族取自画布的 CSS font-family（微信旧版画布同样只让 setFontSize 改字号）。
  function canvasFontFamily(element,root){
    try{
      const view=root||element?.ownerDocument?.defaultView;
      const family=view?.getComputedStyle?.(element)?.fontFamily;
      if(typeof family==='string'&&family.trim()&&family.length<=200&&!/[\x00-\x1f\x7f;{}]/.test(family))return family.trim();
    }catch(_){}
    return 'sans-serif';
  }
  // 重建位图并建立基础变换；返回本次回放使用的 dpr。dpr=1 且位图未变时不触碰任何状态。
  function snapshotCanvas(element){
    const width=Number(element.width)||0,height=Number(element.height)||0;
    if(width<1||height<1)return null;
    try{
      const scratch=element.ownerDocument?.createElement?.('canvas');
      if(!scratch||typeof scratch.getContext!=='function')return null;
      scratch.width=width;scratch.height=height;
      const scratch2d=scratch.getContext('2d');
      if(!scratch2d||typeof scratch2d.drawImage!=='function')return null;
      scratch2d.drawImage(element,0,0);
      return scratch;
    }catch(_){return null;}
  }
  function prepareCanvas(element,ctx,surface,reserve){
    if(!surface?.managed){
      // 1:1 位图（应用自己管理或取不到布局尺寸）：保持 3.82.0 的清屏语义。
      if(!reserve){
        if(typeof ctx.save==='function')ctx.save();
        if(typeof ctx.setTransform==='function')ctx.setTransform(1,0,0,1,0,0);
        ctx.clearRect(0,0,Number(element.width)||0,Number(element.height)||0);
        if(typeof ctx.restore==='function')ctx.restore();
      }
      return 1;
    }
    if((Number(element.width)||0)!==surface.deviceWidth||(Number(element.height)||0)!==surface.deviceHeight){
      // reserve=true 时先备份旧位图，重建后按逻辑尺寸回绘，避免尺寸/倍率变化直接清空内容。
      const preserved=reserve?snapshotCanvas(element):null;
      element.width=surface.deviceWidth;element.height=surface.deviceHeight;
      // 重新分配位图会清空内容与上下文状态，基础变换需要重建。
      try{element.weappCanvasBase=0;element.weappCanvasDevice={width:surface.deviceWidth,height:surface.deviceHeight};element.weappCanvasLogical={width:surface.logicalWidth,height:surface.logicalHeight};}catch(_){}
      if(preserved){
        try{if(typeof ctx.setTransform==='function')ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(preserved,0,0,preserved.width,preserved.height,0,0,surface.deviceWidth,surface.deviceHeight);}catch(_){}
      }
    }
    if(!reserve){
      if(typeof ctx.save==='function')ctx.save();
      if(typeof ctx.setTransform==='function')ctx.setTransform(1,0,0,1,0,0);
      ctx.clearRect(0,0,surface.deviceWidth,surface.deviceHeight);
      if(typeof ctx.restore==='function')ctx.restore();
    }
    if(surface.dpr>1&&Number(element.weappCanvasBase)!==surface.dpr){
      if(typeof ctx.setTransform==='function')ctx.setTransform(surface.dpr,0,0,surface.dpr,0,0);
      try{element.weappCanvasBase=surface.dpr;}catch(_){}
    }
    return surface.dpr;
  }
  // 像素/导出区域：对外是逻辑像素，同时给出设备像素矩形。
  function canvasPixelRect(value,surface,limitDevicePixels=true){
    const width=surface.logicalWidth,height=surface.logicalHeight;
    const x=value.x??0,y=value.y??0;
    const regionWidth=value.width??width-x,regionHeight=value.height??height-y;
    for(const [name,size,min] of [['x',x,0],['y',y,0],['width',regionWidth,1],['height',regionHeight,1]])if(!Number.isInteger(size)||size<min)throw canvasError('画布区域 '+name+' 需要'+(min===0?'非负':'正')+'整数','INVALID_ARGUMENT');
    if(x+regionWidth>width||y+regionHeight>height)throw canvasError('画布区域超出画布范围','INVALID_ARGUMENT');
    if(regionWidth*regionHeight>CANVAS_MAX_PIXELS)throw canvasError('画布区域最多16M像素','IMAGE_TOO_LARGE');
    const dpr=surface.managed?surface.dpr:1;
    const deviceWidth=regionWidth*dpr,deviceHeight=regionHeight*dpr;
    // 像素读写会按设备像素分配缓冲区，放大后的设备区域单独限流。
    if(limitDevicePixels&&deviceWidth*deviceHeight>CANVAS_MAX_PIXELS)throw canvasError('DPR 放大后画布区域超过16M设备像素','IMAGE_TOO_LARGE');
    return {x,y,width:regionWidth,height:regionHeight,dpr,deviceX:x*dpr,deviceY:y*dpr,deviceWidth,deviceHeight};
  }
  function canvasContext(resolve,options={}){
    if(typeof resolve!=='function'&&typeof options.remote!=='function')invalid('画布解析器无效');
    let actions=[],drawing=Promise.resolve(),fontSize=10,measureContext,fontReady=null;
    let family=typeof options.initialFontFamily==='string'&&options.initialFontFamily.trim()?options.initialFontFamily.trim():undefined;
    // iframe 取画布的 CSS font-family；Worker 由视图侧解析一次（同步接口先按 sans-serif 估算）。
    // 远程字体族只请求一次；创建上下文时就预热，draw() 会等它结束，之后测量与回放字体一致。
    const requestFont=()=>{
      if(!options.remote||typeof options.remoteFont!=='function')return null;
      if(!fontReady)fontReady=new Promise(resolve=>resolve(options.remoteFont())).then(value=>{if(typeof value==='string'&&value.trim())family=value.trim();return family||'sans-serif';}).catch(()=>family||'sans-serif');
      return fontReady;
    };
    requestFont();
    const fontFamily=()=>{
      if(options.remote)return family||'sans-serif';
      if(family===undefined){try{family=canvasFontFamily(canvas(),options.measureView);}catch(_){family='sans-serif';}}
      return family;
    };
    const push=(name,args)=>{if(actions.length>=10000)throw canvasError('画布动作过多，请先调用 draw()','LIMIT_EXCEEDED');actions.push({name,args});};
    const wireValue=value=>{
      if(canvasGradients.has(value))return {__nowCanvasGradient:{kind:value.kind,args:value.args.slice(),stops:value.stops.map(stop=>stop.slice())}};
      if(canvasPatterns.has(value))return {__nowCanvasPattern:{image:value.image,repetition:value.repetition}};
      return value;
    };
    const wireActions=batch=>batch.map(action=>({name:action.name,args:action.args.map(wireValue)}));
    const canvas=()=>{const element=canvasElement(resolve());if(!element)throw canvasError('未找到对应的 canvas 画布','NODE_NOT_FOUND');return element;};
    const context2d=element=>{if(typeof element.getContext!=='function')throw canvasError('当前环境不支持 canvas 2D 上下文','UNKNOWN_METHOD');const ctx=element.getContext('2d');if(!ctx)throw canvasError('当前环境不支持 canvas 2D 上下文','UNKNOWN_METHOD');return ctx;};
    const context={
      setFillStyle:value=>push('setFillStyle',[canvasStyleValue('setFillStyle',value)]),
      setStrokeStyle:value=>push('setStrokeStyle',[canvasStyleValue('setStrokeStyle',value)]),
      setShadow:(offsetX,offsetY,blur,color)=>push('setShadow',[canvasNumber('setShadow.offsetX',offsetX),canvasNumber('setShadow.offsetY',offsetY),canvasNumber('setShadow.blur',blur,0),canvasColor('setShadow.color',color)]),
      setGlobalAlpha:alpha=>push('setGlobalAlpha',[canvasNumber('setGlobalAlpha',alpha,0,1)]),
      setLineWidth:width=>push('setLineWidth',[canvasNumber('setLineWidth',width,0)]),
      setLineCap:cap=>{if(!['butt','round','square'].includes(cap))invalid('setLineCap 仅支持 butt/round/square');push('setLineCap',[cap]);},
      setLineJoin:join=>{if(!['bevel','round','miter'].includes(join))invalid('setLineJoin 仅支持 bevel/round/miter');push('setLineJoin',[join]);},
      setMiterLimit:limit=>push('setMiterLimit',[canvasNumber('setMiterLimit',limit,0)]),
      setLineDash:(pattern,offset)=>{if(!Array.isArray(pattern)||pattern.length>64||pattern.some(value=>typeof value!=='number'||!Number.isFinite(value)||value<0||value>10000))invalid('setLineDash.pattern 需要最多64个非负数');if(offset!==undefined)canvasNumber('setLineDash.offset',offset,0);push('setLineDash',offset===undefined?[pattern.slice()]:[pattern.slice(),offset]);},
      setLineDashOffset:offset=>push('setLineDashOffset',[canvasNumber('setLineDashOffset',offset)]),
      setFontSize:size=>{canvasNumber('setFontSize',size,0,1000);fontSize=size;push('setFontSize',[size]);if(!options.remote){try{context2d(canvas()).font=size+'px '+fontFamily();}catch(_){}}},
      setTextAlign:align=>{if(!['left','center','right','start','end'].includes(align))invalid('setTextAlign 仅支持 left/center/right/start/end');push('setTextAlign',[align]);},
      setTextBaseline:baseline=>{if(!['top','bottom','middle','normal','alphabetic','ideographic','hanging'].includes(baseline))invalid('setTextBaseline 取值无效');push('setTextBaseline',[baseline]);},
      setGlobalCompositeOperation:type=>{if(typeof type!=='string'||!/^[a-z-]{1,64}$/.test(type))invalid('setGlobalCompositeOperation 需要操作名');push('setGlobalCompositeOperation',[type]);},
      save:()=>push('save',[]),restore:()=>push('restore',[]),
      translate:(x,y)=>push('translate',[canvasNumber('translate.x',x),canvasNumber('translate.y',y)]),
      rotate:angle=>push('rotate',[canvasNumber('rotate.angle',angle)]),
      scale:(x,y)=>push('scale',[canvasNumber('scale.x',x),canvasNumber('scale.y',y)]),
      transform:(a,b,c,d,e,f)=>push('transform',[canvasNumber('transform.a',a),canvasNumber('transform.b',b),canvasNumber('transform.c',c),canvasNumber('transform.d',d),canvasNumber('transform.e',e),canvasNumber('transform.f',f)]),
      setTransform:(a,b,c,d,e,f)=>push('setTransform',[canvasNumber('setTransform.a',a),canvasNumber('setTransform.b',b),canvasNumber('setTransform.c',c),canvasNumber('setTransform.d',d),canvasNumber('setTransform.e',e),canvasNumber('setTransform.f',f)]),
      beginPath:()=>push('beginPath',[]),closePath:()=>push('closePath',[]),
      moveTo:(x,y)=>push('moveTo',[canvasNumber('moveTo.x',x),canvasNumber('moveTo.y',y)]),
      lineTo:(x,y)=>push('lineTo',[canvasNumber('lineTo.x',x),canvasNumber('lineTo.y',y)]),
      arc:(x,y,radius,startAngle,endAngle,counterclockwise)=>{canvasNumber('arc.x',x);canvasNumber('arc.y',y);canvasNumber('arc.radius',radius,0);canvasNumber('arc.startAngle',startAngle);canvasNumber('arc.endAngle',endAngle);if(counterclockwise!==undefined&&typeof counterclockwise!=='boolean')invalid('arc.counterclockwise 需要布尔值');push('arc',counterclockwise===undefined?[x,y,radius,startAngle,endAngle]:[x,y,radius,startAngle,endAngle,counterclockwise]);},
      arcTo:(x1,y1,x2,y2,radius)=>{for(const[field,value]of Object.entries({x1,y1,x2,y2}))canvasNumber('arcTo.'+field,value);canvasNumber('arcTo.radius',radius,0);push('arcTo',[x1,y1,x2,y2,radius]);},
      quadraticCurveTo:(cpx,cpy,x,y)=>{for(const[field,value]of Object.entries({cpx,cpy,x,y}))canvasNumber('quadraticCurveTo.'+field,value);push('quadraticCurveTo',[cpx,cpy,x,y]);},
      bezierCurveTo:(cp1x,cp1y,cp2x,cp2y,x,y)=>{for(const[field,value]of Object.entries({cp1x,cp1y,cp2x,cp2y,x,y}))canvasNumber('bezierCurveTo.'+field,value);push('bezierCurveTo',[cp1x,cp1y,cp2x,cp2y,x,y]);},
      rect:(x,y,width,height)=>{for(const[field,value]of Object.entries({x,y,width,height}))canvasNumber('rect.'+field,value);push('rect',[x,y,width,height]);},
      clip:()=>push('clip',[]),fill:()=>push('fill',[]),stroke:()=>push('stroke',[]),
      fillRect:(x,y,width,height)=>{for(const[field,value]of Object.entries({x,y,width,height}))canvasNumber('fillRect.'+field,value);push('fillRect',[x,y,width,height]);},
      strokeRect:(x,y,width,height)=>{for(const[field,value]of Object.entries({x,y,width,height}))canvasNumber('strokeRect.'+field,value);push('strokeRect',[x,y,width,height]);},
      clearRect:(x,y,width,height)=>{for(const[field,value]of Object.entries({x,y,width,height}))canvasNumber('clearRect.'+field,value);push('clearRect',[x,y,width,height]);},
      fillText:(text,x,y,maxWidth)=>{const value=canvasText(text);canvasNumber('fillText.x',x);canvasNumber('fillText.y',y);if(maxWidth!==undefined)canvasNumber('fillText.maxWidth',maxWidth,0);push('fillText',maxWidth===undefined?[value,x,y]:[value,x,y,maxWidth]);},
      strokeText:(text,x,y,maxWidth)=>{const value=canvasText(text);canvasNumber('strokeText.x',x);canvasNumber('strokeText.y',y);if(maxWidth!==undefined)canvasNumber('strokeText.maxWidth',maxWidth,0);push('strokeText',maxWidth===undefined?[value,x,y]:[value,x,y,maxWidth]);},
      measureText(text){
        const value=canvasText(text);
        if(options.remote){
          const view=options.measureView||globalThis;
          if(typeof view.OffscreenCanvas==='function'){
            if(!measureContext){measureContext=new view.OffscreenCanvas(1,1).getContext('2d');}
            if(measureContext){measureContext.font=fontSize+'px '+fontFamily();return {width:Number(measureContext.measureText(value).width)||0};}
          }
          return {width:Math.round(value.length*fontSize*0.6)};
        }
        const element=canvas(),ctx=context2d(element);
        try{ctx.font=fontSize+'px '+fontFamily();}catch(_){}
        const metrics=ctx.measureText(value);return {width:Number(metrics?.width)||0};
      },
      drawImage(...args){if(![3,5,9].includes(args.length))invalid('drawImage 需要 3、5 或 9 个参数');if(typeof args[0]!=='string'&&!(args[0]&&typeof args[0]==='object'))invalid('drawImage.image 需要图片路径或图像对象');if(options.remote&&typeof args[0]!=='string')invalid('Worker 画布 drawImage 只支持图片路径');for(const value of args.slice(1))canvasNumber('drawImage',value);push('drawImage',args);},
      createLinearGradient:(x0,y0,x1,y1)=>{for(const[field,value]of Object.entries({x0,y0,x1,y1}))canvasNumber('createLinearGradient.'+field,value);return canvasGradient('linear',[x0,y0,x1,y1]);},
      createCircularGradient:(x,y,radius)=>{canvasNumber('createCircularGradient.x',x);canvasNumber('createCircularGradient.y',y);canvasNumber('createCircularGradient.radius',radius,0);return canvasGradient('circular',[x,y,radius]);},
      createPattern(image,repetition){if(typeof image!=='string'&&!(image&&typeof image==='object'))invalid('createPattern.image 需要图片路径或图像对象');if(options.remote&&typeof image!=='string')invalid('Worker 画布 createPattern 只支持图片路径');if(!['repeat','repeat-x','repeat-y','no-repeat'].includes(repetition))invalid('createPattern.repetition 仅支持 repeat/repeat-x/repeat-y/no-repeat');const value={image,repetition};canvasPatterns.add(value);return Object.freeze(value);},
      draw(reserve,callback){
        if(typeof reserve==='function'){callback=reserve;reserve=false;}
        if(reserve===undefined)reserve=false;
        if(typeof reserve!=='boolean')invalid('draw.reserve 需要布尔值');
        if(callback!==undefined&&typeof callback!=='function')invalid('draw 回调必须为函数');
        const work=drawing.then(async()=>{
          const batch=actions;actions=[];
          try{
            if(options.remote){const ready=requestFont();if(ready)await ready;await options.remote({canvasId:options.canvasId,actions:wireActions(batch),reserve});}
            else{
              const element=canvas(),ctx=context2d(element);
              const surface=canvasSurface(element,options.measureView||element.ownerDocument?.defaultView||globalThis);
              const dpr=prepareCanvas(element,ctx,surface,reserve);
              await applyCanvas(ctx,batch,element,Object.assign({},options,{dpr}));
            }
          }catch(error){actions=batch.concat(actions);throw error;}
        });
        drawing=work.catch(()=>{});
        if(callback){work.then(()=>callback({errMsg:'drawCanvas:ok'}),error=>callback({errMsg:'drawCanvas:fail '+(error.message||error)}));return;}
        return work;
      }
    };
    return Object.freeze(context);
  }
  // 与微信一致：页面级选择器只在页面 light DOM 内匹配，不进入自定义组件（组件内容用 in(component) 或组件内查询）。
  function queryAll(container,selector){
    try{return Array.from(container.querySelectorAll(selector));}catch(_){invalid('selector语法无效');}
  }
  function measure(root,mount,operations,select,metadata,viewport,options){
    if(!mount)throw Object.assign(new Error('页面视图尚未挂载'),{code:'PAGE_NOT_READY'});if(!Array.isArray(operations)||operations.length>64)invalid('节点查询批次无效');
    return operations.map(operation=>{if(operation.node){const selected=select?select(selector(operation.selector)):queryAll(mount,selector(operation.selector));if(selected.length>1000)invalid('查询节点超过1000个');const element=selected[0];if(!element)return null;if(canvasElement(element))return {node:options?.nodeMarker?options.nodeMarker(element):canvasNode(root,element,options)};return element.weappScrollContext||null;}const settings=fields(operation.fields);if(typeof operation.all!=='boolean'||typeof operation.viewport!=='boolean')invalid('查询参数无效');
      const selected=operation.viewport?[viewport||mount]:(select?select(selector(operation.selector)):queryAll(mount,selector(operation.selector)));if(selected.length>1000)invalid('查询节点超过1000个');
      const results=selected.map(node=>{const result={};if(settings.id)result.id=operation.viewport?'':String(node.id||node.getAttribute?.('id')||'');if(settings.dataset){result.dataset={};const meta=metadata?metadata(node).dataset:null,source=meta&&Object.keys(meta).length?meta:(node.dataset||{});for(const[key,value]of Object.entries(source)){if(['__proto__','constructor','prototype'].includes(key))continue;try{result.dataset[key]=JSON.parse(value);}catch(_){result.dataset[key]=String(value);}}}
        if(settings.rect||settings.size){const rect=operation.viewport?{left:0,top:0,right:root.innerWidth||0,bottom:root.innerHeight||0,width:root.innerWidth||0,height:root.innerHeight||0}:node.getBoundingClientRect();for(const name of [...(settings.rect?['left','top','right','bottom']:[]),...(settings.size?['width','height']:[])])result[name]=Number.isFinite(rect[name])?rect[name]:0;}
        if(settings.scrollOffset){result.scrollLeft=Number(node.scrollLeft)||0;result.scrollTop=Number(node.scrollTop)||0;result.scrollWidth=Number(node.scrollWidth)||0;result.scrollHeight=Number(node.scrollHeight)||0;}
        if(settings.computedStyle?.length){if(!root.getComputedStyle)throw Object.assign(new Error('当前环境不支持样式查询'),{code:'UNKNOWN_METHOD'});const style=root.getComputedStyle(node);for(const name of settings.computedStyle)result[name]=String(style.getPropertyValue(name));}
        // 自定义组件属性按渲染层的 attribute 读取：绑定后的数字仍以字符串返回，未声明的属性返回 null。
        if(settings.properties?.length)for(const name of settings.properties){const raw=node.getAttribute?.(name);result[name]=raw===null||raw===undefined?null:String(raw);}
        if(settings.node)result.node=canvasElement(node)?(options?.nodeMarker?options.nodeMarker(node):canvasNode(root,node,options)):null;
        if(settings.context){const canvasId=String(node.getAttribute?.('canvas-id')||'');result.context=node.weappEditorContext?(options?.editorMarker?options.editorMarker(node):node.weappEditorContext):options?.contextMarker?(canvasId?{__nowCanvasId:canvasId}:null):(canvasElement(node)?canvasContext(()=>node,Object.assign({},options,{measureView:root})):null);}
        return result;});return operation.all?results:results[0]??null;
    });
  }
  return Object.freeze({create,editorContext,measure,selector,fields,canvasContext,applyCanvas,canvasSurface,prepareCanvas,canvasPixelRect,canvasFontFamily,queryAll});
}

module.exports = createSelectorQueryTools;
