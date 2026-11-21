const createRpxUnits = require('./rpx');
'use strict';
function createDomBackend(environment) {
  'use strict';
  const rpxUnits = createRpxUnits();
  const {root,Error:ErrorType=Error,trackCommit,config,customEvents,viewProtocol,instances,visual,metrics}=environment;
  let formScope=0,nextView=0;
  const accessibility=config.accessibility?.(root,{Error:ErrorType});
  const eventTools=config.componentViews(root,config.logicalEvents()),componentTools=config.advancedComponents?eventTools:null;
  const interactions=config.interactions(root,{Error:ErrorType,path:eventTools.path,emit(node,name,detail,original){let handled=false;eventTools.route(node,name,detail,{bubbles:true,composed:true,capturePhase:true,onHandle(){handled=true;}},original);return handled;}});
  eventTools.setGuard((node,event)=>interactions.live(node)&&!accessibility?.handled(event));
  function drive(iterator) {
    function step(method, value) {
      for (;;) {
        const result = iterator[method](value);
        if (result.done) return result.value;
        if (result.value && typeof result.value.then === 'function') return Promise.resolve(result.value).then(value => step('next', value), error => step('throw', error));
        method = 'next'; value = result.value;
      }
    }
    return step('next');
  }

  // One observer per view realm; only nearby images enter the shared network queue.
  const lazyImages=new Map();let lazyObserver;
  function forgetImage(element){if(!lazyImages.has(element))return;lazyObserver?.unobserve(element);lazyImages.delete(element);if(!lazyImages.size){lazyObserver?.disconnect();lazyObserver=null;}}
  function deferImage(element,source,ready){
    if(typeof root.IntersectionObserver!=='function')return false;
    const existing=lazyImages.get(element);if(existing?.source===source)return !existing.ready;
    if(!lazyObserver)lazyObserver=new root.IntersectionObserver(entries=>{for(const entry of entries){const image=lazyImages.get(entry.target);if(!image||!entry.isIntersecting||image.ready)continue;image.ready=true;lazyObserver.unobserve(entry.target);image.render();}},{rootMargin:'200px'});
    lazyImages.set(element,{source,ready:false,render:ready});lazyObserver.observe(element);return true;
  }
  function createView(instanceId, route, placement) {
  const document = root.document, mount = placement?.mount || document.createElement('section');
  if (!placement) {
    mount.className = 'weapp-page'; mount.setAttribute('data-weapp-route', route);
    document.getElementById('weapp-root').append(mount); visual.attachPage(instanceId,mount);
  }
  const releasePageStyle=!placement&&config.pageResources?config.pageResources.acquire(config.pageEntries[route]):null;
  const usingMap={...config.usingComponents[route],...placement?.generics};
  const virtual=!!placement?.virtual,pageRoute=placement?.pageRoute||route,styleRoot=placement?.styleRoot||document.head||document.body,ownedStyles=[];
  if(componentTools&&!placement)mount.setAttribute('data-weapp-owner',config.styleTokens[route]+' '+instanceId);
  if(componentTools&&!placement){const shared=Object.values(config.sharedStyleRules||{}).flat().join('\n');if(shared)ownedStyles.push(componentTools.style(styleRoot,shared,config.styleTokens[route]));}
  const queryTools=config.selectorQuery();
  const components = new Map(), pendingRoots = new Set(), viewElements = new Map();
  let renderRoots = new Set(), renderedData = {}, childCommits = [];
  let externalClasses = {}, inheritedRules = {},projectedNodes=[],slotNodes=new Map();
  const request=(method,value)=>instances.request({version:1,ownerId:instanceId,method,...(value===undefined?{}:{value})});
  let treeRevision=0,pendingRelationMoves=[],confirmedTree=null;
  const elements = new WeakMap();
  const webViewControls=config.webViewRuntime?.(root,{Error:ErrorType,request});
  const cameraControls=config.cameraRuntime?.(root,{Error:ErrorType,live:element=>!disposed&&!mount.hidden&&!mount.inert&&port.receiver.isVisible()&&interactions.live(elements.get(element)),host:(method,value)=>request('camera.host',{method,value}),emit:emitNative});
  const findControl=(tag,id)=>[...viewElements.values()].find(element=>{const node=elements.get(element);return node?.tag===tag&&String(node.attrs?.id||'')===String(id)&&element.isConnected;});
  const videoControls=config.videoRuntime?.(root,{Error:ErrorType,find:id=>findControl('video',id),live:element=>interactions.live(elements.get(element))});
  const mapControls=config.mapRuntime?.(root,{Error:ErrorType,find:id=>findControl('map',id),node:element=>elements.get(element),live:element=>interactions.live(elements.get(element)),emit:emitNative});
  function controlMissing(name){throw new ErrorType(name+' 组件控制器未配置',{code:'UNKNOWN_METHOD'});}
  const video=(method,value)=>videoControls?videoControls.execute(method,value):controlMissing('video');
  const map=(method,value)=>mapControls?mapControls.execute(method,value):controlMissing('map');
  const pickerControls=config.pickerRuntime?.(root,{regionData:config.regionData,Error:ErrorType,live:()=>!disposed&&!mount.hidden&&!mount.inert&&port.receiver.isVisible(),emit:emitNative,report:error=>{if(typeof root.reportError==='function')root.reportError(error);else root.setTimeout(()=>{throw error;},0);}});
  const forms = config.formRuntime(root, ErrorType, {picker:pickerControls,changed:()=>textInputs.flush(),scope: ++formScope, mount, live: () => !disposed, node: element => elements.get(element), component:element=>{const component=components.get(element);return component?request('field.read',{id:component.instanceId}):null;},resetField:(id,value)=>request('field.reset',{id,value})});
  let previous = [], scheduled = false, disposed = false, callbacks = [], scroll = [0, 0], dirty = false;
  const a11y=accessibility?.scope({live:()=>!disposed&&!mount.hidden&&!mount.inert&&port.receiver.isVisible(),activate(element,event){const node=elements.get(element);if(node&&interactions.live(node))eventTools.route(node,'tap',{}, {bubbles:true,composed:true,capturePhase:true},event);}});
  const remoteImages=new Map();
  const virtualLists=config.virtualList?.(root,{invalidate:()=>{if(!disposed)schedule();}});
  const string = value => value === null || value === undefined ? '' : String(value);
  function read(value, key) { return value !== null && value !== undefined && Object.hasOwn(Object(value), key) ? Object(value)[key] : undefined; }
  function lookup(scope, key) { for (; scope; scope = Object.getPrototypeOf(scope)) if (Object.hasOwn(scope, key)) return scope[key]; }
  const backToTop=config.backToTop?.(root);
  const nativeControls=config.nativeComponents?.(root,{backToTop,Error:ErrorType,live:()=>!disposed&&!mount.hidden&&!mount.inert&&port.receiver.isVisible(),emit:emitNative,asset,find:id=>[...viewElements.values()].find(element=>!element.virtualRange&&(element.id===id||element.getAttribute?.('id')===id)),imageStatus:url=>{const entry=remoteImages.get(url);if(!entry)return{pending:true};if(entry.error)return{error:entry.error};if(entry.data)return{ready:true};return{pending:true};}});
  const interactiveControls=config.interactiveComponents?.(root,{Error:ErrorType,style,classes:classNames,live:()=>!disposed&&!mount.hidden&&!mount.inert&&port.receiver.isVisible(),emit:emitNative});
  const layerControls=config.layerComponents?.(root,{scope:instanceId,Error:ErrorType,page:placement?.pageMount||mount,styleRoot,style,live:()=>!disposed&&!mount.hidden&&!mount.inert&&port.receiver.isVisible(),emit:emitNative,theme:()=>renderedData.theme});
  const editorControls=config.editorRuntime?.(root,{Error:ErrorType,scope:instanceId,live:()=>!disposed&&!mount.hidden&&!mount.inert&&port.receiver.isVisible(),emit:emitNative,asset,createContext:execute=>queryTools.editorContext(execute,error=>{if(root.reportError)root.reportError(error);else root.setTimeout(()=>{throw error;},0);})});
  const keyboardAccessories=config.keyboardAccessory?.(root,{Error:ErrorType,mount,live:node=>!disposed&&!mount.hidden&&!mount.inert&&port.receiver.isVisible()&&interactions.live(node),layout:()=>textInputs.keyboard()});
  const textInputs=config.textInput(root,{Error:ErrorType,scope:instanceId,styleRoot,style,classes:classNames,accessoryHeight:element=>keyboardAccessories?.height(element)||0,live:node=>interactions.live(node),emit:emitNative,invalidate:node=>port.receiver.invalidateInput(node.viewNodeId),height:node=>{const match=/(?:^|;)\s*height\s*:\s*([^;]+)/i.exec(style(node.attrs.style,node.origin));return match?match[1]:'';}});
  const pageMeta=placement?undefined:config.pageMeta?.(root,{mount,Error:ErrorType,style,emit:emitNative,send:value=>request('page.meta',value),live:()=>!disposed&&!mount.hidden&&!mount.inert&&port.receiver.isVisible()});
  const projection=config.projectionPlanner();
  const builtins=config.builtinComponents(root,{functionalPage:value=>request('functional.open',value),Error:ErrorType,textInputs,style,classNames,string,asset,remoteImages,deferImage,schedule,live:()=>!disposed,node:element=>elements.get(element),interactive:node=>interactions.live(node),emit:emitNative,canvasTransfer:environment.canvasTransfer,accessibility,owner:componentTools?(placement?'':config.styleTokens[route]+' ')+instanceId:undefined});
  const attributes=builtins.attributes;
  const template = config.templates[route](lookup, read, string, config.wxsRuntime);
  function normalizedPath(path) {
    const output = [];
    for (const part of path.split('/')) { if (!part || part === '.') continue; if (part === '..') { if (!output.length) return null; output.pop(); } else output.push(part); }
    return output.join('/');
  }
  function remoteImage(url){
    if(remoteImages.has(url))return remoteImages.get(url).data||'';
    if(remoteImages.size>=16)throw new Error('每个视图最多16张远程图片');
    const origin=/^https:\/\/[^/?#]+/.exec(url)?.[0];
    if(!origin||origin.includes('@')||url.includes('#')||!config.remoteImageOrigins?.includes(origin)){remoteImages.set(url,{error:'远程图片来源未声明'});return '';}
    const entry={};remoteImages.set(url,entry);
    Promise.resolve(request('image.load',{url})).then(result=>{if(!disposed){entry.data=result.data;schedule();}},error=>{if(!disposed){entry.error=error.message||'远程图片加载失败';schedule();}});return '';
  }
  function asset(value,from=route) {
    const url = string(value); if(/^https:\/\//i.test(url))return remoteImage(url); if(/^(?:nowfile|nowsaved):\/\/[0-9a-f]{48}$/.test(url))return root.__nowImageResources?.get(url)||''; if (/^blob:/i.test(url)) return url; if (!url || url.startsWith('data:')) return url;
    if (/^(?:[a-z]+:|\/\/)/i.test(url)) throw new Error('不支持外部图片：' + url);
    const pluginRoot=(config.pluginRoots||[]).find(directory=>from.startsWith(directory+'/'));
    const name = normalizedPath(url.startsWith('/') ? (pluginRoot?pluginRoot+'/':'')+url.slice(1) : from.slice(0,from.lastIndexOf('/')+1)+url);
    if (!name || !Object.hasOwn(config.assets, name)) throw new Error('图片不在导入资源中：' + url);
    return config.assets[name];
  }
  function canvasImageSource(value){
    if(typeof value!=='string'||!value)return value;
    if(/^(?:data:|blob:|https?:)/i.test(value))return value;
    if(/^(?:nowfile|nowsaved):\/\//.test(value)){
      const resources=root.__nowImageResources;
      if(!resources)throw new ErrorType('当前环境不支持画布文件图片',{code:'UNKNOWN_METHOD'});
      const ready=resources.get(value);if(ready)return ready;
      const failure=resources.error(value);if(failure)throw new ErrorType(failure.message,{code:failure.code||'IMAGE_UNSUPPORTED'});
      return new Promise((resolve,reject)=>{const timer=root.setTimeout(()=>{off();reject(new ErrorType('画布图片加载超时',{code:'API_TIMEOUT'}));},10000);const off=resources.subscribe(()=>{const url=resources.get(value);if(url){root.clearTimeout(timer);off();resolve(url);return;}const error=resources.error(value);if(error){root.clearTimeout(timer);off();reject(new ErrorType(error.message,{code:error.code||'IMAGE_UNSUPPORTED'}));}});});
    }
    try{return asset(value);}catch(error){throw new ErrorType(error.message,{code:'INVALID_ARGUMENT'});}
  }
  function style(value,from=route) {
    let source = string(value).replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi, (whole, quoted, single, plain) => 'url("' + asset(quoted ?? single ?? plain.trim(),from) + '")');
    let result = '', quote = null;
    for (let index = 0; index < source.length;) {
      const character = source[index];
      if (quote) { result += character; index++; if (character === '\\') result += source[index++] || ''; else if (character === quote) quote = null; continue; }
      if (character === '"' || character === "'") { quote = character; result += character; index++; continue; }
      const match = /^(-?(?:\d+(?:\.\d*)?|\.\d+))rpx\b/i.exec(source.slice(index));
      if (match) { result += rpxUnits.css(Number(match[1])); index += match[0].length; }
      else { result += character; index++; }
    }
    return rpxUnits.rewrite(result);
  }
  const reconciler=config.childReconciler();
  const evaluator=config.templateEvaluator(template,{element(node,{attrs,scope,path,forced}){
    if(placement&&['page-meta','navigation-bar'].includes(node.tag))throw new ErrorType('页面配置节点只能用于页面根',{code:'INVALID_ARGUMENT'});
    // Keep the matched block box; an excluded subtree still follows the existing removal lifecycle.
    if(node.tag==='match-media')return config.matchMedia(attrs,root.innerWidth??document.documentElement?.clientWidth??0,root.innerHeight??document.documentElement?.clientHeight??0,ErrorType)?{}:{skip:true};
    const loop=node.tag==='scroll-view'&&attrs.type==='list'&&attrs['scroll-y']&&node.nodes.length===1&&node.nodes[0].kind==='for'?node.nodes[0]:null;
    if(!loop||!virtualLists)return;
    const items=loop.value(scope);if(!Array.isArray(items))return;
    const range=virtualLists.range(path,items.length,attrs,target=>items.findIndex((item,index)=>{const nested=Object.create(scope);nested[loop.item]=item;nested[loop.index]=index;return loop.nodes.some(child=>child.attrs?.id?.(nested)===target);}),forced);
    if(!range)return;
    const spacer=(part,height)=>({tag:'view',origin:node.origin,identity:path+'/virtual-'+part,attrs:{style:'height:'+height+'px;flex-shrink:0;pointer-events:none','aria-hidden':'true','data-now-virtual-spacer':part},dataset:{nowVirtualSpacer:part},events:[],children:[],forced:[],virtualSpacer:true});
    return {range,before:[spacer('top',range.top)],after:[spacer('bottom',range.bottom)],metadata:{virtualList:path}};
  }});
  const port = viewProtocol.connect({id:'v'+(++nextView),route,kind:placement?'component':'page',...(placement?.parentId?{parentId:placement.parentId}:{}),data:request('data'),visible:!!placement?.visible,
    setTimeout:root.setTimeout.bind(root),clearTimeout:root.clearTimeout.bind(root),
    render(value,forced,settings){renderedData=value;renderRoots=new Set(forced);return drive((function*(){if(settings.reset){for(const node of previous){yield* drop(node);node.element.remove();}previous=[];components.clear();}return yield* renderDOM();})());},
    result(nodeId,value){const element=viewElements.get(nodeId);if(element?.isConnected)textInputs.result(element,value);},
    invoke:(binding,event)=>request('event',{binding,event}),
    onError(error){throw error;}
  });
  instances.connect(instanceId,{query,camera:(method,value)=>cameraControls.execute(method,value),video:(method,value)=>video(method,value),map:(method,value)=>map(method,value),mount:()=>mount,
    render:()=>render(),markChanges:value=>markChanges(value),destroy:()=>destroy(),
    dispatch(value){const element=viewElements.get(value.nodeId);if(!element||disposed)return;eventTools.route(elements.get(element),value.name,value.detail,value.settings);}
  });
  const eventView={classes:classNames,parent:()=>placement?.eventParent?.(),live:()=>!disposed&&!mount.hidden&&!mount.inert&&port.receiver.isVisible(),
    send(node,binding,detail,target,original){if(binding.name==='change'&&original.type==='change'&&['checkbox-group','radio-group'].includes(node.tag))detail=forms.detail(node,original);const touches=items=>Array.from(items||[],item=>Object.fromEntries(Object.entries({identifier:item.identifier,pageX:item.pageX,pageY:item.pageY,clientX:item.clientX,clientY:item.clientY,x:item.clientX,y:item.clientY,force:item.force||0}).filter(([,value])=>value!==undefined)));port.receiver.event(node.viewNodeId,eventTools.key(binding),{targetNodeId:target.viewNodeId,detail,timeStamp:original.timeStamp,touches:touches(original.touches),changedTouches:touches(original.changedTouches)});},
    special(node,key,original){if(key==='@functional'){builtins.activate?.(node.element,node);return;}if(key==='@share'||key==='@send'){root.document.dispatchEvent(new root.CustomEvent(key==='@send'?'now-app-send':'now-app-share',{detail:{target:{id:string(node.attrs.id),dataset:node.dataset},...(key==='@send'?{activation:original}:{})}}));return;}port.receiver.event(node.viewNodeId,key,{targetNodeId:node.viewNodeId,detail:{},timeStamp:original.timeStamp});},
    detail(node,original,name){const element=node.element;if(forms.detail(node,original))return forms.detail(node,original);if(['input','confirm','focus','blur'].includes(name))return{value:element.value,cursor:element.selectionStart??string(element.value).length,...(name==='focus'?{height:Number(root.__nowNativeEnvironment?.keyboardHeight)||0}:{})};if(name==='change')return{value:['switch','checkbox','radio'].includes(node.tag)?element.checked:element.value};if(node.tag==='image'&&name==='load')return{width:element.naturalWidth||0,height:element.naturalHeight||0};if(node.tag==='image'&&name==='error')return{errMsg:original.detail?.errMsg||'image:fail unable to load'};if(node.tag==='video')return videoControls?.detail(element,name)||{};if(name==='tap')return{x:original.clientX||0,y:original.clientY||0};return{};}
  };
  function emitNative(element,name,detail){if(disposed)return;const node=elements.get(element);if(!node||!interactions.live(node))return;eventTools.route(node,name,detail,{bubbles:false,composed:false,capturePhase:false});}
  function bind(element,node){
    const bindings=node.events.map(event=>({key:eventTools.key(event),name:event.name,handler:event.handler}));

    if(node.tag==='navigator')bindings.push({key:'@navigate',name:'tap',handler:'@navigate',args:Object.fromEntries(Object.entries(node.attrs).filter(([,value])=>value!==undefined))});
    port.receiver.bind(node.viewNodeId,{id:string(node.attrs.id),dataset:node.dataset},bindings);
    eventTools.bind(element,node);
  }
  function create(node) {
    if(componentTools&&(virtual&&node.tag==='slot'||config.componentOptions?.[usingMap[node.tag]]?.virtualHost))return componentTools.range();
    if (node.tag === '#text') return document.createTextNode(node.text);
    const tag = builtins.nodeName(node.tag,Object.hasOwn(usingMap,node.tag));
    // Unknown WXML tags must fail loudly: createElement(undefined) throws an opaque toUpperCase error later.
    if(!tag)throw new ErrorType('尚未支持的组件 '+node.tag,{code:'VIEW_RENDER'});
    const element = document.createElement(tag);
    builtins.create(element,node);
    interactions.create(element,node,instanceId);
    webViewControls?.create(element,node.tag);cameraControls?.create(element,node.tag);keyboardAccessories?.create(element,node.tag);editorControls?.create(element,node.tag);textInputs.create(element,node);forms.create(element,node.tag);pickerControls?.create(element,node.tag);nativeControls?.create(element,node.tag);interactiveControls?.create(element,node.tag);layerControls?.create(element,node.tag);
    builtins.created(element,node);
    return element;
  }
  function* patch(element, old, next) {
    if (next.tag === '#text') { if (old?.text !== next.text) element.nodeValue = next.text; return; }
    next.eventView=eventView;elements.set(element, next); attributes(element, old?.attrs, next);a11y?.patch(element,next); bind(element, next);interactions.patch(element,next);textInputs.patch(element,next,old);
    if(next.tag==='web-view'){const pending=webViewControls.patch(element,next);if(pending?.then)yield pending;return;}
    if(next.tag==='camera'){cameraControls.patch(element,next);return;}
    if(next.tag==='video'){return;}
    if(next.tag==='map'){if(!mapControls)controlMissing('map');mapControls.patch(element,next);return;}
    if (next.tag!=='movable-view'&&!element.virtualRange&&(Object.hasOwn(next.attrs, 'animation') || old?.attrs && Object.hasOwn(old.attrs, 'animation'))) visual.applyAnimation(instanceId,element,next.attrs.animation);
    const map = usingMap;
    if (Object.hasOwn(map, next.tag)) {
      let record = components.get(element);
      if (!record) {
        const id = map[next.tag];
        const attrs=Object.fromEntries(Object.entries(next.attrs).filter(([,value])=>value!==undefined));
        const descriptor=yield request('component.create',{source:id,nodeId:next.viewNodeId,key:next.identity,attrs,dataset:next.dataset});
        const isVirtual=!!descriptor.options?.virtualHost;if(isVirtual!==!!element.virtualRange)throw new Error('组件结构选项与静态声明不一致');
        const shadow=isVirtual?styleRoot:element.attachShadow({mode:'open'}),container=isVirtual?element:document.createElement('div');
        let css,externalStyle,sharedStyle;
        if(componentTools){sharedStyle=componentTools.style(shadow,'',descriptor.id,isVirtual);css=componentTools.style(shadow,isVirtual?config.componentScopedStyles[id]:config.componentStyles[id],descriptor.id,isVirtual);externalStyle=componentTools.style(shadow,'',descriptor.id,isVirtual);}
        else{css=document.createElement('style');externalStyle=document.createElement('style');css.nonce=document.querySelector?.('style[nonce]')?.nonce||document.querySelector?.('script[nonce]')?.nonce||'';externalStyle.nonce=css.nonce;css.textContent=config.componentStyles[id];shadow.append(css,externalStyle);}
        if(!isVirtual){container.className='weapp-component-root';shadow.append(container);}
        const parking=isVirtual?componentTools.range():element;if(isVirtual)parking.projection=true;
        record={id,instanceId:descriptor.id,identity:next.identity,externalClasses:descriptor.externalClasses,element,virtual:isVirtual,parking,styles:[sharedStyle,css,externalStyle].filter(Boolean),view:createView(descriptor.id,id,{mount:container,pageMount:placement?.pageMount||mount,generics:descriptor.generics,virtual:isVirtual,styleRoot:shadow,externalStyle,sharedStyle,pageRoute,parking,eventParent:()=>elements.get(element),parentId:port.logic.id,visible:port.receiver.isVisible()})};
        components.set(element,record);visual.changed(instanceId);
      } else {
        if(!environment.remote&&metrics?.localRenderExperiment===true){
          const attrsChanged=JSON.stringify(old?.attrs||{})!==JSON.stringify(next.attrs||{});
          const projection=!!(old?.children?.length||next.children.length),external=!!record.externalClasses.length,pending=!record.view.isIdle();
          metrics.localRenderCandidates=(metrics.localRenderCandidates||0)+1;
          if(attrsChanged)metrics.localRenderBlockedAttrs=(metrics.localRenderBlockedAttrs||0)+1;
          if(projection)metrics.localRenderBlockedProjection=(metrics.localRenderBlockedProjection||0)+1;
          if(external)metrics.localRenderBlockedExternal=(metrics.localRenderBlockedExternal||0)+1;
          if(pending)metrics.localRenderBlockedPending=(metrics.localRenderBlockedPending||0)+1;
          if(next.forced?.length)metrics.localRenderBlockedForced=(metrics.localRenderBlockedForced||0)+1;
          // Projected nodes need refreshed logical/event ownership; pending receipts must still be awaited.
          if(!attrsChanged&&!projection&&!external&&!next.forced?.length&&record.identity===next.identity&&!pending){
            metrics.localRenderSkips=(metrics.localRenderSkips||0)+1;return;
          }
        }
        yield request('component.properties',{id:record.instanceId,attrs:Object.fromEntries(Object.entries(next.attrs).filter(([,value])=>value!==undefined)),dataset:next.dataset,forced:next.forced,key:next.identity});
      }
      const classes = {}, rules = {}, available = {...(config.externalStyleRules[route] || {}), ...inheritedRules};
      for (const name of record.externalClasses) {
        const raw = next.attrs[name] === undefined ? '' : next.attrs[name];
        if (typeof raw !== 'string' || raw.length > 512) throw new Error('外部样式类需要有效字符串');
        classes[name] = classNames(raw).split(/\s+/).filter(Boolean);
        if (classes[name].length > 16 || classes[name].some(token => !/^[A-Za-z_-][A-Za-z0-9_-]*$/.test(token))) throw new Error('外部样式类名无效');
        for (const token of classes[name]) if (available[token]) rules[token] = available[token];
      }
      record.view.setExternal(classes, rules);
      record.identity = next.identity;
      yield* patchChildren(record.parking,old?.children||[],next.children,next);record.view.project(next.children);
      const receipt=record.view.render();if(metrics)metrics.componentRenders=(metrics.componentRenders||0)+1;if(receipt&&!receipt.settled)childCommits.push(receipt.done);
      return;
    }
    if(next.tag==='slot'){
      const {assigned,released}=projection.assign(next,projectedNodes,old?._assigned||[],node=>node.element);slotNodes.set(next.viewNodeId,{node:next,assigned});
      for(const node of released)releaseProjection(node,old);
      next._assigned=assigned;projection.link(next,assigned);for(const node of assigned)eventTools.markProjection(node,instanceId,true);
      if(virtual){
        if(assigned.length){for(const node of old?.children||[]){yield* drop(node);node.element.remove();}next.children=[];for(const node of assigned)componentTools.move(node.element,element,null);return;}
      }
    }
    editorControls?.prepare(element);
    yield* patchChildren(keyboardAccessories?.children(element,next)||nativeControls?.children?.(element)||element, old?.children || [], next.children,next);
    if(next.virtualList)virtualLists.attach(next.virtualList,nativeControls?.children?.(element)||element,next.children.filter(child=>!child.virtualSpacer).map(child=>child.element));
    keyboardAccessories?.patch(element,next);editorControls?.patch(element,next);editorControls?.identify(element,next.viewNodeId);nativeControls?.patch(element,next,old);interactiveControls?.patch(element,next,old);layerControls?.patch(element,next,old);pickerControls?.patch(element,next);if(next.tag==='scroll-view'&&element.weappScrollContext){root.__nowScrollContexts??=new Map();root.__nowScrollContexts.set(next.viewNodeId,element.weappScrollContext);}
  }
  function* drop(node) {
    if(node.virtualList)virtualLists?.remove(node.virtualList);
    if(node.element){builtins.remove(node.element,node);environment.canvasTransfer?.remove(node.element.weappCanvas||node.element);forgetImage(node.element);}
    videoControls?.remove(node.element);mapControls?.remove(node.element);const webViewRemoval=webViewControls?.remove(node.element);if(webViewRemoval?.then)yield webViewRemoval;cameraControls?.remove(node.element);a11y?.remove(node.element);keyboardAccessories?.remove(node.element);editorControls?.remove(node.element);textInputs.remove(node.element);interactions.remove(node.element);pickerControls?.remove(node.element);nativeControls?.remove(node.element);interactiveControls?.remove(node.element);layerControls?.remove(node.element);root.__nowScrollContexts?.delete(node.viewNodeId);port.receiver.remove(node.viewNodeId);viewElements.delete(node.viewNodeId);
    const ownedComponent=components.get(node.element);if(ownedComponent){const receipt=ownedComponent.view.project([]);if(receipt?.done)yield receipt.done;}
    if(node.tag==='slot'){slotNodes.delete(node.viewNodeId);for(const projected of node._assigned||[])releaseProjection(projected,node);}
    for (const child of node.children || []) yield* drop(child);
    if (node.element?.style) visual.clearAnimation(instanceId,node.element);
    const record = components.get(node.element); if (record) { components.delete(node.element); yield request('component.destroy',{id:record.instanceId});for(const style of record.styles||[])style.remove();visual.changed(instanceId); }
  }
  function* notifyMoved(node){
    // Light children and shadow children precede their containing component.
    for(const child of node.children||[])yield* notifyMoved(child);
    const record=components.get(node.element);
    if(record){
      const receipt=record.view.moved();if(receipt?.done)yield receipt.done;else if(receipt?.then)yield receipt;
      yield request('component.move',{id:record.instanceId});
    }
  }
  function moved(){return drive((function*(){for(const node of previous)yield* notifyMoved(node);})());}
  function* patchChildren(parent, old, next,logicalParent=null) {
    const plan=reconciler.plan(old,next),removed=new Set(plan.removeFirst);
    // Remove obsolete siblings before moving surviving nodes, preserving native click activation.
    for(const node of plan.removeFirst){yield* drop(node);node.element.remove();}
    let cursor=componentTools?parent.childNodes[0]||null:null;
    const projectedOrder=parent.projection?old.filter(node=>!removed.has(node)).map(node=>node.element):null;
    for (let index = 0; index < next.length; index++) {
      const {node,previous:candidate}=plan.entries[index],match=!!candidate;
      node.logicalParent=logicalParent;
      if (match) { node.projectedParent=candidate.projectedParent;node.element = candidate.element;node.viewNodeId=candidate.viewNodeId; } else {node.viewNodeId=node.tag==='#text'?undefined:port.receiver.node();node.element=create(node);}
      if(node.viewNodeId)viewElements.set(node.viewNodeId,node.element);
      yield* patch(node.element, match ? candidate : null, node);
      let moved=false;
      if(node.tag==='keyboard-accessory'){if(!match)parent.append(node.element);}
      else if(logicalParent?.tag==='editor'&&node.tag==='editor-portal'){if(!match)parent.append(node.element);}
      else if(componentTools&&parent.projection){
        // Physical projection is applied by the receiving slot; track declaration order here.
        if(projectedOrder[index]!==node.element){const previousIndex=projectedOrder.indexOf(node.element);if(previousIndex>=0)projectedOrder.splice(previousIndex,1);projectedOrder.splice(index,0,node.element);moved=!!match;}
        if(!match)componentTools.move(node.element,parent,null);
      }
      else if(componentTools){if(cursor!==componentTools.physical(node.element)[0]){componentTools.move(node.element,parent,cursor);moved=true;}cursor=componentTools.after(parent,node.element);}
      else{const reference=parent.childNodes[index]||null;if(reference!==node.element){parent.insertBefore(node.element,reference);moved=true;}}
      if(match&&moved){if(node.viewNodeId)pendingRelationMoves.push(node.viewNodeId);yield* notifyMoved(node);}
    }
    for (const node of plan.removeLast) { yield* drop(node); node.element.remove(); }
  }
  function* renderDOM() {
    if (disposed) return;
    childCommits=[];template.wxs?.reset();
    const {nodes:next,templateCalls}=evaluator.evaluate(renderedData,renderRoots);if(metrics){metrics.viewRenders=(metrics.viewRenders||0)+1;metrics.viewNodes=(metrics.viewNodes||0)+next.length;metrics.templateCalls=(metrics.templateCalls||0)+templateCalls;}
    if(placement&&next.some(node=>['page-meta','navigation-bar'].includes(node.tag)))throw new ErrorType('页面配置节点只能用于页面根',{code:'INVALID_ARGUMENT'});pageMeta?.validate(next);yield* patchChildren(mount, previous, next); previous = next;const metaCommit=pageMeta?.update(next);if(metaCommit?.then)yield metaCommit;textInputs.flush(previous);keyboardAccessories?.flush();editorControls?.flush();nativeControls?.flush();interactiveControls?.flush();layerControls?.flush();refreshControls();a11y?.flush();cameraControls?.flush();
    yield* commitTree();
    for(const record of components.values()){
      const connected=record.element.isConnected;
      // Only a successful logical attach can establish the connected cache.
      // Unattached ancestors and disconnected DOM must still be retried.
      if(connected&&record.confirmedConnected===true)continue;
      const reply=yield request('component.attach',{id:record.instanceId,connected});
      record.confirmedConnected=connected&&reply?.attached===true;
    }
    forms.sync(previous);
    if(childCommits.length)return Promise.all(childCommits).then(()=>virtualLists?.flush());
    virtualLists?.flush();
  }
  function render(){
    if(disposed)return;
    const forced=[...pendingRoots];pendingRoots.clear();dirty=false;
    const receipt=port.logic.update(request('data'),forced);trackCommit?.(receipt.done);if(receipt.error)throw receipt.error;return receipt;
  }
  function schedule(callback) {
    if(callback!==undefined&&(!Number.isSafeInteger(callback)||callback<1))throw new Error('视图回调令牌无效');
    if(callback)callbacks.push(callback);if(scheduled)return;scheduled=true;
    Promise.resolve().then(()=>{scheduled=false;if(disposed)return;const ready=callbacks;callbacks=[];let receipt;try{receipt=render();}catch(error){request('callback.cancel',{ids:ready});throw error;}const finish=()=>{if(!disposed)ready.forEach(callback=>request('callback',{id:callback}));};if(receipt&&!receipt.settled)receipt.done.then(finish,error=>{if(!disposed){request('callback.cancel',{ids:ready});throw error;}});else finish();});
  }
  function* commitTree(){
    const nodes=[];
    function walk(values,parentNodeId){for(const node of values){if(node.viewNodeId){const component=components.get(node.element);nodes.push({nodeId:node.viewNodeId,parentNodeId,tag:node.tag,elementId:string(node.attrs.id),classes:node.element.className.split(/\s+/).filter(Boolean),...(component?{componentId:component.instanceId}:{})});walk(node.children||[],node.viewNodeId);}else walk(node.children||[],parentNodeId);}}
    walk(previous,null);
    const snapshot=JSON.stringify(nodes),moved=pendingRelationMoves.filter(id=>nodes.some(node=>node.nodeId===id));pendingRelationMoves=[];
    // Reuse only an acknowledged topology. Movement still carries relation hooks,
    // even when the final logical node list is unchanged.
    if(snapshot===confirmedTree&&!moved.length)return;
    if(metrics){metrics.treeCommits=(metrics.treeCommits||0)+1;metrics.treeNodes=(metrics.treeNodes||0)+nodes.length;metrics.treeBytes=(metrics.treeBytes||0)+snapshot.length;}
    confirmedTree=null;
    const revision=++treeRevision,reply=yield request('tree.commit',{revision,nodes,moved});
    if(reply?.revision===revision)confirmedTree=snapshot;
  }
  function pageLifetime(name,value){if(environment.remote)return {};return request('lifecycle',{name,...(value===undefined?{}:{value})});}
  function markChanges(patch) { dirty=true;Object.keys(patch).forEach(path => pendingRoots.add(path.split(/[.\[]/)[0])); }
  function classNames(value) { return string(value).split(/\s+/).flatMap(name => Object.hasOwn(externalClasses, name) ? externalClasses[name] : [name]).filter(Boolean).join(' '); }
  function releaseProjection(node,slot){
    const current=projectedNodes.find(next=>next.element===node.element)||node;
    // A newer slot patch may already own this element; an old slot must not clear it.
    if(!projection.release(node,slot,current))return;
    eventTools.markProjection(current,instanceId,false);
    if(virtual)componentTools.move(current.element,placement.parking,null);
  }
  function project(nodes){const keep=new Set(nodes.map(node=>node.element));for(const record of slotNodes.values())for(const node of record.assigned)if(!keep.has(node.element))releaseProjection(node,record.node);projection.prepare(nodes);projectedNodes=nodes;slotNodes.clear();}
  function setExternal(classes, rules) { externalClasses = classes; inheritedRules = rules; const css = [...new Set(Object.values(rules).flat())].join('\n'); if (placement?.externalStyle && placement.externalStyle.textContent !== css) placement.externalStyle.textContent = componentTools?componentTools.css(css,instanceId,virtual):css; }
  function refreshControls(){interactions.flush();pickerControls?.flush();for(const record of components.values())record.view.refreshControls();}
  function visibility(value){webViewControls?.visibility(value);videoControls?.visibility(value);cameraControls?.visibility(value);a11y?.visibility(value);if(!placement)backToTop?.visibility(value);environment.canvasTransfer?.visibility(instanceId,value);pageMeta?.visibility(value);keyboardAccessories?.visibility(value);editorControls?.visibility(value);textInputs.visibility(value);if(!value)interactions.cancelOwner(instanceId);pickerControls?.visibility(value);nativeControls?.visibility(value);interactiveControls?.visibility(value);layerControls?.visibility(value);const receipt=port.logic.visibility(value);keyboardAccessories?.flush();editorControls?.flush();if(receipt.error)throw receipt.error;for(const record of components.values())record.view.visibility(value);}
  function refreshCamera(){cameraControls?.flush();for(const record of components.values())record.view.refreshCamera?.();}
  const interactive=()=>{if(!disposed){refreshCamera();pageMeta?.flush();textInputs.flush();keyboardAccessories?.flush();editorControls?.flush();nativeControls?.flush();interactiveControls?.flush();layerControls?.flush();for(const element of viewElements.values())if(element.weappDeferredLoad&&element.weappDeferredLoad===element.getAttribute?.('src')&&element.complete&&element.naturalWidth){element.weappDeferredLoad=null;emitNative(element,'load',{width:element.naturalWidth,height:element.naturalHeight});}}};const interactiveTarget=mount.virtualRange?placement?.parking||document:mount;interactiveTarget.addEventListener?.('now-page-interactive',interactive);
  const resized=()=>{if(!disposed){pageMeta?.resize();schedule();}};root.addEventListener?.('resize',resized);
  const releaseImages=root.__nowImageResources?.subscribe(()=>{if(!disposed)schedule();});
  function destroy(){if(disposed)return;webViewControls?.dispose();videoControls?.dispose();mapControls?.dispose();cameraControls?.dispose();a11y?.dispose();pageMeta?.dispose();virtualLists?.dispose();for(const entry of remoteImages.values())entry.task?.abort?.();remoteImages.clear();root.removeEventListener?.('resize',resized);interactiveTarget.removeEventListener?.('now-page-interactive',interactive);keyboardAccessories?.dispose();editorControls?.dispose();textInputs.dispose();interactions.disposeOwner(instanceId);project([]);pickerControls?.dispose();nativeControls?.dispose();interactiveControls?.dispose();layerControls?.dispose();disposed=true;releasePageStyle?.();for(const style of ownedStyles)style.remove();releaseImages?.();callbacks=[];port.logic.destroy();return drive((function*(){for(const node of previous)yield* drop(node);components.clear();viewElements.clear();})());}
  async function query(operations){
    const receipt=render();if(receipt&&!receipt.settled)await receipt.done;if(disposed)throw new ErrorType('视图已销毁',{code:'PAGE_UNLOADED'});
    const tools=queryTools,selector=config.componentSelector(message=>new ErrorType(message,{code:'INVALID_ARGUMENT'}));
    const nodes=new Map();function walk(values,parent){for(const node of values){if(!node.element||node.tag==='#text')continue;nodes.set(node.viewNodeId,{nodeId:node.viewNodeId,parentNodeId:parent,tag:node.tag,elementId:String(node.attrs?.id||''),classes:(node.element.className||'').split(/\s+/).filter(Boolean),element:node.element});walk(node.children||[],node.viewNodeId);}}walk(previous,null);
    let viewport=mount;for(let parent=mount;parent;parent=parent.parentElement||parent.getRootNode?.().host||parent.host){if((parent.className||'').split(/\s+/).includes('weapp-page')){viewport=parent;break;}}
    return tools.measure(root,mount,operations,value=>{const parts=selector.parse(value);return [...nodes.values()].filter(node=>!node.element.virtualRange&&selector.matchesNode(node,parts,nodes)).map(node=>node.element);},element=>{const attrs=elements.get(element)?.attrs||{},dataset={};for(const[key,value]of Object.entries(attrs))if(key.startsWith('data-')&&value!==undefined)dataset[key.slice(5).replace(/-([a-z])/g,(_match,char)=>char.toUpperCase())]=JSON.stringify(value);return{dataset};},viewport,{imageSource:canvasImageSource,contextMarker:environment.remote,...(environment.remote?{editorMarker:element=>({__nowEditorContext:{ownerId:instanceId,nodeId:elements.get(element).viewNodeId}})}:{}),...(environment.remote?{nodeMarker:element=>({__nowCanvasNode:{ownerId:instanceId,nodeId:elements.get(element).viewNodeId,width:Number((element.weappCanvas||element).width)||300,height:Number((element.weappCanvas||element).height)||150}})}:{})});
  }
  if(componentTools&&placement?.sharedStyle){const isolation=config.componentOptions?.[route]?.styleIsolation||'isolated';if(isolation!=='isolated')placement.sharedStyle.textContent=componentTools.css(Object.values(componentTools.merge(config.externalStyleRules[pageRoute],config.sharedStyleRules)).flat().join('\n'),instanceId,virtual);}
  const api={refreshCamera,camera:(method,value)=>cameraControls.execute(method,value),video:(method,value)=>video(method,value),map:(method,value)=>map(method,value),isIdle:()=>!disposed&&!dirty&&!scheduled&&!port.logic.inspect().pending&&[...components.values()].every(record=>record.view.isIdle()),editor:(nodeId,method,value)=>editorControls.execute(nodeId,method,value),canvasNode:nodeId=>{const found=viewElements.get(nodeId),element=found?.weappCanvas||found;if(disposed||!element||String(element.tagName).toUpperCase()!=='CANVAS')throw new ErrorType('画布节点已销毁',{code:'PAGE_UNLOADED'});return element;},back:()=>layerControls?.back()||false,project,query,render,schedule,pageLifetime,markChanges,setExternal,visibility,refreshControls,moved,
    show(){mount.hidden=false;visibility(true);const receipt=render();pageLifetime('show');if(root.scrollTo)root.scrollTo(scroll[0],scroll[1]);return receipt;},
    hide(){visibility(false);pageLifetime('hide');scroll=[root.scrollX||0,root.scrollY||0];},
    destroy
  };
  return environment.wrap ? environment.wrap(instanceId,api) : api;
  }
  return createView;
}

module.exports=createDomBackend;
