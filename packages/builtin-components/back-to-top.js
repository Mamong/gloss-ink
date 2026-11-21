function createBackToTop(root, options) {
  'use strict';
  options=options||{};
  if(root.__nowBackToTop)return root.__nowBackToTop;
  const records=new Map(),document=root.document;
  let visible=false,epoch=0,sequence=0,lastInteraction,queued=false,listening=false,observer,mutations,lastSent,force=false;
  const parent=node=>node?.parentElement||node?.getRootNode?.().host||node?.host;
  const style=node=>root.getComputedStyle?.(node)||node.style||{};
  function geometry(element){
    const width=Number(root.innerWidth)||document.documentElement?.clientWidth||0,height=Number(root.innerHeight)||document.documentElement?.clientHeight||0;
    if(!(width>0&&height>0))return;
    const rect=element.getBoundingClientRect?.();if(!rect)return;
    let left=Math.max(0,rect.left),right=Math.min(width,rect.right),top=Math.max(0,rect.top),bottom=Math.min(height,rect.bottom);
    for(let node=element;node;node=parent(node)){
      const css=style(node);
      if(node.hidden||node.inert||css.display==='none'||css.visibility==='hidden'||css.visibility==='collapse'||String(css.opacity)==='0')return;
      if(node!==element&&node.getBoundingClientRect){const box=node.getBoundingClientRect();if(/hidden|clip|scroll|auto/.test(css.overflowY||css.overflow||'')){top=Math.max(top,box.top);bottom=Math.min(bottom,box.bottom);}if(/hidden|clip|scroll|auto/.test(css.overflowX||css.overflow||'')){left=Math.max(left,box.left);right=Math.min(right,box.right);}}
    }
    if(!(right>left&&bottom>top))return;
    return {rect,height:bottom-top,area:(right-left)*(bottom-top),viewport:height};
  }
  function candidates(){
    if(!visible)return [];
    const result=[];
    for(const [element,record]of records){const props=record.props();if(!element.isConnected||!record.live()||props['scroll-y']!==true||props['enable-back-to-top']===false||!(element.scrollHeight>element.clientHeight))continue;const box=geometry(element);if(!box)continue;if(props['enable-back-to-top']!==true&&!(box.height>box.viewport*0.9))continue;result.push({element,record,box,explicit:props['enable-back-to-top']===true});}
    return result;
  }
  function physics(){
    if(!visible)return [];
    const result=[];
    for(const [element,record]of records){const props=record.props();if(!element.isConnected||!record.live()||props.enhanced!==true||!props['scroll-y']&&!props['scroll-x'])continue;const box=geometry(element);if(!box)continue;let depth=0;for(let node=parent(element);node;node=parent(node))if(records.has(node))depth++;
      result.push({key:record.order,fast:props['fast-deceleration']===true,x:box.rect.left,y:box.rect.top,width:box.rect.right-box.rect.left,height:box.rect.bottom-box.rect.top,contentWidth:Number(element.scrollWidth)||Number(element.clientWidth)||box.rect.width,contentHeight:Number(element.scrollHeight)||Number(element.clientHeight)||box.rect.height,depth});}
    return result.sort((a,b)=>b.depth-a.depth).slice(0,128);
  }
  function publish(){
    queued=false;const enabled=candidates().length>0,value={enabled,epoch,physics:physics(),viewport:{width:Number(root.innerWidth)||document.documentElement?.clientWidth||0}};
    if(force||!lastSent||lastSent.enabled!==enabled||lastSent.epoch!==epoch||JSON.stringify(lastSent.physics)!==JSON.stringify(value.physics)||lastSent.viewport.width!==value.viewport.width){lastSent=value;force=false;options.publish?.(value);}
  }
  function refresh(forced=false){if(forced===true)force=true;if(queued)return;queued=true;Promise.resolve().then(publish);}
  function interact(event){const path=event.composedPath?.();if(path){const hit=path.find(node=>records.has(node));if(hit){lastInteraction=hit;refresh(true);}return;}for(let node=event.target;node;node=parent(node))if(records.has(node)){lastInteraction=node;refresh(true);break;}}
  function request(requestEpoch){
    if(requestEpoch!==epoch)return false;
    const values=candidates().filter(value=>(Number(value.element.scrollTop)||0)>0);
    values.sort((a,b)=>(b.element===lastInteraction)-(a.element===lastInteraction)||Number(b.explicit)-Number(a.explicit)||b.box.area-a.box.area||a.record.order-b.record.order);
    const target=values[0]?.element;if(!target)return false;
    const reduced=root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if(typeof target.scrollTo==='function')target.scrollTo({top:0,left:Number(target.scrollLeft)||0,behavior:reduced?'instant':'smooth'});else target.scrollTop=0;
    refresh();return true;
  }
  const received=event=>request(event.detail?.epoch);
  function start(){if(listening)return;listening=true;root.addEventListener?.('now-scroll-to-top',received);root.addEventListener?.('resize',refresh);root.addEventListener?.('now-native-environment',refresh);for(const name of ['pointerdown','touchstart','wheel','focusin'])document.addEventListener?.(name,interact,{capture:true,passive:true});if(root.ResizeObserver)observer=new root.ResizeObserver(()=>refresh());if(root.MutationObserver){mutations=new root.MutationObserver(()=>refresh());mutations.observe(document,{subtree:true,attributes:true,attributeFilter:['hidden','inert','style','class','open']});}}
  function stop(){if(!listening)return;listening=false;root.removeEventListener?.('now-scroll-to-top',received);root.removeEventListener?.('resize',refresh);root.removeEventListener?.('now-native-environment',refresh);for(const name of ['pointerdown','touchstart','wheel','focusin'])document.removeEventListener?.(name,interact,true);observer?.disconnect();observer=undefined;mutations?.disconnect();mutations=undefined;lastInteraction=undefined;}
  const api={register(element,record){start();records.set(element,{...record,order:++sequence});observer?.observe(element);refresh(true);},remove(element){observer?.unobserve(element);records.delete(element);if(lastInteraction===element)lastInteraction=undefined;if(!records.size){epoch++;stop();}refresh();},refresh,visibility(value){if(visible!==value){visible=value;epoch++;publish();}refresh();},request,inspect:()=>({epoch,visible,count:records.size,eligible:candidates().map(value=>value.element)})};
  root.__nowBackToTop=api;return api;
}

module.exports = createBackToTop;
