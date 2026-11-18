function createPageMeta(root, options) {
  'use strict';
  const {mount}=options,document=root.document;
  const color=/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
  const windowFields={'background-text-style':'backgroundTextStyle','background-color':'backgroundColor','background-color-top':'backgroundColorTop','background-color-bottom':'backgroundColorBottom','root-background-color':'backgroundColorContent','page-orientation':'pageOrientation'};
  let meta,attrs={},navAttrs={},visible=false,disposed=false,pendingScroll,animation,rootFont,rootFontOwner=false;
  const savedStyles=new Map(),savedAttributes=new Map(['data-background-text-style','data-page-orientation'].map(name=>[name,mount.getAttribute(name)]));let styles=new Map();
  const fail=message=>{throw new options.Error(message,{code:'INVALID_ARGUMENT'});};
  function validate(nodes){
    const visit=(values,parent)=>{for(let index=0;index<values.length;index++){
      const node=values[index];
      if(node.tag==='page-meta'&&(parent||index!==0))fail('page-meta 必须是页面的第一个节点');
      if(node.tag==='navigation-bar'&&(parent?.tag!=='page-meta'||index!==0))fail('navigation-bar 必须是 page-meta 的第一个子节点');
      if(parent?.tag==='page-meta'&&node.tag!=='navigation-bar')fail('page-meta 只允许 navigation-bar 子节点');
      visit(node.children||[],node);
    }};visit(nodes,null);
  }
  function duration(value,otherwise){const number=value===undefined?otherwise:Number(value);if(!Number.isFinite(number)||number<0||number>60000)fail('动画时长需要0–60000毫秒');return number;}
  function font(value){
    if(value===undefined||value==='')return '';
    if(value==='system'){const size=Number(root.__nowNativeEnvironment?.fontSizeSetting);return (Number.isFinite(size)&&size>0?size:16)+'px';}
    if(typeof value!=='string'||!/^(?:\d+(?:\.\d+)?|\.\d+)(?:px|rpx|rem|em|%)$/.test(value))fail('字体大小需要有效的 CSS 长度或 system');
    // Resolve rpx exactly as other WXML styles. System uses the host's default text size.
    return options.style(value);
  }
  function declarations(value){
    if(value===undefined||value==='')return new Map();if(typeof value!=='string')fail('page-style 需要字符串');
    const result=new Map(),source=options.style(value);let start=0,depth=0,quote;
    for(let i=0;i<=source.length;i++){
      const char=source[i];if(quote){if(char==='\\')i++;else if(char===quote)quote=undefined;continue;}
      if(char==='"'||char==="'"){quote=char;continue;}if(char==='(')depth++;else if(char===')')depth--;
      if(i===source.length||char===';'&&!depth){const entry=source.slice(start,i),index=entry.indexOf(':');if(index>0){const name=entry.slice(0,index).trim();if(/^--[\w-]+$|^[a-z][a-z-]*$/i.test(name))result.set(name,entry.slice(index+1).trim());}start=i+1;}
    }return result;
  }
  const camel=name=>name.replace(/-([a-z])/g,(_,char)=>char.toUpperCase());
  const readStyle=name=>mount.style.getPropertyValue?mount.style.getPropertyValue(name):mount.style[camel(name)]||'';
  function writeStyle(name,value){if(mount.style.setProperty){const important=/\s*!important\s*$/i.test(value);mount.style.setProperty(name,important?value.replace(/\s*!important\s*$/i,''):value,important?'important':'');}else mount.style[camel(name)]=value;}
  function applyStyles(next){
    for(const name of styles.keys())if(!next.has(name)){writeStyle(name,savedStyles.get(name)||'');savedStyles.delete(name);}
    for(const [name,value]of next){if(!savedStyles.has(name))savedStyles.set(name,readStyle(name)+(mount.style.getPropertyPriority?.(name)==='important'?' !important':''));if(styles.get(name)!==value)writeStyle(name,value);}styles=next;
  }
  function applyRootFont(){
    const html=document.documentElement;if(!html?.style)return;
    if(visible&&attrs['root-font-size']){if(!rootFontOwner){rootFont=html.style.fontSize||'';rootFontOwner=true;}html.style.fontSize=font(attrs['root-font-size']);}
    else if(rootFontOwner){html.style.fontSize=rootFont;rootFontOwner=false;}
  }
  function cancelScroll(){if(animation){if(animation.frame)root.cancelAnimationFrame?.(animation.id);else root.clearTimeout(animation.id);animation=null;}}
  function emit(name,detail){if(meta&&visible&&options.live())options.emit(meta.element,name,detail);}
  function scrollPixels(value){
    if(value===undefined||value==='')return undefined;
    const match=/^(-?\d+(?:\.\d+)?)(px|rpx)?$/.exec(String(value));if(!match)fail('scroll-top 需要 px 或 rpx 长度');
    const pixels=Number(match[1])*(match[2]==='rpx'?(root.innerWidth||document.documentElement?.clientWidth||375)/750:1);
    if(!Number.isFinite(pixels)||Math.abs(pixels)>10000000)fail('scroll-top 超过支持范围');return Math.max(0,pixels);
  }
  function flush(){
    if(!pendingScroll||!visible||!options.live()||!(mount.clientHeight>0))return;
    const job=pendingScroll;pendingScroll=undefined;cancelScroll();
    const target=Math.min(job.top,Math.max(0,(mount.scrollHeight||0)-mount.clientHeight)),start=Number(mount.scrollTop)||0;
    const done=()=>{mount.scrollTop=target;animation=null;emit('scrolldone',{});};
    if(!job.duration||start===target){done();return;}
    const state={frame:typeof root.requestAnimationFrame==='function',start:undefined};animation=state;
    const next=()=>{state.id=state.frame?root.requestAnimationFrame(step):root.setTimeout(()=>step(Date.now()),16);};
    function step(time){if(animation!==state||!visible||!options.live())return;state.start??=time;const progress=Math.min(1,(time-state.start)/job.duration);mount.scrollTop=start+(target-start)*progress;if(progress>=1)done();else next();}next();
  }
  function update(nodes){
    const next=nodes[0]?.tag==='page-meta'?nodes[0]:undefined,a=next?.attrs||{},n=next?.children[0]?.attrs||{};
    const window={},navigation={};
    for(const [name,field]of Object.entries(windowFields)){
      const value=a[name];if(value!==undefined&&value!==''){
        if(name.includes('color')&&(typeof value!=='string'||!(name==='root-background-color'?/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i:color).test(value)))fail(name+' 需要十六进制颜色');
        if(name==='background-text-style'&&!['dark','light'].includes(value))fail('background-text-style 仅支持 dark/light');
        if(name==='page-orientation'&&!['auto','portrait','landscape'].includes(value))fail('page-orientation 无效');
      }
      if(value!==attrs[name])window[field]=value===undefined||value===''?null:field==='backgroundColorContent'&&value.length===4?'#'+[...value.slice(1)].map(char=>char+char).join(''):value;
    }
    for(const name of ['title','front-color','background-color']){
      const value=n[name];if(value!==undefined){if(name==='title'){if(typeof value!=='string'||value.length>100)fail('导航标题需要最多100字符');}
        else if(name==='front-color'?!['#ffffff','#000000'].includes(value):typeof value!=='string'||!color.test(value))fail('导航栏颜色无效');}
      if(value!==navAttrs[name])window[{title:'navigationBarTitleText','front-color':'navigationBarTextStyle','background-color':'navigationBarBackgroundColor'}[name]]=value===undefined?null:name==='front-color'?(value==='#ffffff'?'white':'black'):value;
    }
    if(n.loading!==undefined&&typeof n.loading!=='boolean')fail('navigation-bar.loading 需要布尔值');
    if(n.loading!==navAttrs.loading||!!next!==!!meta)navigation.loading=n.loading??false;
    const navDuration=duration(n['color-animation-duration'],0),timing=n['color-animation-timing-func']??'linear';
    if(!['linear','easeIn','easeOut','easeInOut'].includes(timing))fail('导航栏颜色动画方式无效');
    if(n['color-animation-duration']!==navAttrs['color-animation-duration'])navigation.duration=navDuration;
    if(n['color-animation-timing-func']!==navAttrs['color-animation-timing-func'])navigation.timingFunc=timing;
    const pageFont=font(a['page-font-size']);font(a['root-font-size']);
    const nextStyles=declarations(a['page-style']);if(pageFont)nextStyles.set('font-size',pageFont);
    if(a['root-background-color'])nextStyles.set('background-color',a['root-background-color']);else if(a['background-color'])nextStyles.set('background-color',a['background-color']);
    const top=scrollPixels(a['scroll-top']),scrollDuration=duration(a['scroll-duration'],300);
    if(a['scroll-top']!==attrs['scroll-top']){cancelScroll();pendingScroll=top===undefined?undefined:{top,duration:scrollDuration};}
    attrs={...a};navAttrs={...n};meta=next;
    if(next){next.element.hidden=false;next.element.style.display='contents';if(next.children[0]){next.children[0].element.hidden=true;next.children[0].element.style.display='none';}next.element.setAttribute('aria-hidden','true');}
    applyStyles(nextStyles);applyRootFont();
    if(Object.hasOwn(window,'backgroundTextStyle')&&a['background-text-style'])mount.setAttribute('data-background-text-style',a['background-text-style']);else if(Object.hasOwn(window,'backgroundTextStyle'))restoreAttribute('data-background-text-style');
    if(a['page-orientation'])mount.setAttribute('data-page-orientation',a['page-orientation']);else if(Object.hasOwn(window,'pageOrientation'))restoreAttribute('data-page-orientation');
    flush();
    if(Object.keys(window).length||Object.keys(navigation).length)return options.send({window,navigation});
  }
  const scrolled=event=>{if(event.target===mount)emit('scroll',{scrollTop:Math.max(0,Number(mount.scrollTop)||0)});};mount.addEventListener('scroll',scrolled,{passive:true});
  function visibility(value){visible=value;if(!value)cancelScroll();applyRootFont();if(value)flush();}
  function resize(){emit('resize',{size:{windowWidth:root.innerWidth||mount.clientWidth||0,windowHeight:root.innerHeight||mount.clientHeight||0}});}
  function restoreAttribute(name){const value=savedAttributes.get(name);if(value===null)mount.removeAttribute(name);else mount.setAttribute(name,value);}
  function nativeEnvironment(){
    if(disposed)return;
    if(attrs['page-font-size']==='system'){const next=new Map(styles);next.set('font-size',font('system'));applyStyles(next);}
    if(attrs['root-font-size']==='system')applyRootFont();
  }
  root.addEventListener?.('now-native-environment',nativeEnvironment);
  function dispose(){root.removeEventListener?.('now-native-environment',nativeEnvironment);disposed=true;visible=false;cancelScroll();pendingScroll=undefined;applyRootFont();applyStyles(new Map());mount.removeEventListener('scroll',scrolled);}
  return {validate,update,flush,resize,visibility,dispose};
}

module.exports = createPageMeta;
