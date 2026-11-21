function createTextInputRuntime(root, options) {
  'use strict';
  const document=root.document,records=new Map(),entities={nbsp:'\u00a0',lt:'<',gt:'>',amp:'&',apos:"'",quot:'"',ensp:'\u2002',emsp:'\u2003'},spaces={ensp:'\u2002',emsp:'\u2003',nbsp:'\u00a0'};
  let next=0,visible=true,disposed=false,cssElement=null,cssText='';
  const fail=message=>{throw new options.Error(message,{code:'INVALID_ARGUMENT'});};
  function boolean(value,fallback=false){if(value===undefined||value===null)return fallback;if(typeof value!=='boolean')fail('文本/输入布尔属性需要boolean');return value;}
  function position(value){if(value===undefined||value===null)return -1;value=Number(value);if(!Number.isSafeInteger(value)||value< -1||value>1000000)fail('光标和选区需要-1或0–1000000整数');return value;}
  function live(record){return !disposed&&visible&&options.live(record.node)&&record.element.isConnected;}
  function declarations(value){if(value===undefined||value===null||value==='')return '';if(typeof value!=='string'||value.length>4096)fail('placeholder-style需要最多4096字符的字符串');const out=[];for(const part of value.split(';')){if(!part.trim())continue;const match=/^\s*([a-z-]+)\s*:\s*(.*?)\s*$/i.exec(part);if(!match||!['color','font-size','font-weight','line-height'].includes(match[1].toLowerCase()))fail('placeholder-style仅支持color/font-size/font-weight/line-height');const text=match[2];if(!text||!/^[#\w\s(),.%+*/!\-]+$/.test(text)||/\b(?:url|expression|attr)\s*\(/i.test(text))fail('placeholder-style值不在支持范围');let depth=0;for(const char of text){if(char==='(')depth++;if(char===')')depth--;if(depth<0)fail('placeholder-style括号不平衡');}if(depth)fail('placeholder-style括号不平衡');out.push(match[1].toLowerCase()+':'+text);}return options.style(out.join(';'));}
  function stylesheet(){const css=[...records.values()].filter(r=>r.css).map(r=>'[data-now-input="'+r.id+'"][data-now-input="'+r.id+'"]::placeholder{'+r.css+'}').join('\n');if(css===cssText)return;cssText=css;if(!css){cssElement?.remove();cssElement=null;return;}if(!cssElement){cssElement=document.createElement('style');cssElement.nonce=document.querySelector?.('style[nonce]')?.nonce||document.querySelector?.('script[nonce]')?.nonce||'';options.styleRoot.append(cssElement);}cssElement.textContent=css;}
  const focused=record=>document.activeElement===record.element||record.element.getRootNode?.().activeElement===record.element;
  let keyboardRecord,toolbar;const adjustments=new Map();
  function keyboardInfo(){const value=root.__nowNativeEnvironment;if(value)return {height:Math.max(0,Number(value.keyboardHeight)||0),duration:Math.max(0,Number(value.keyboardDuration)||0),top:Number.isFinite(value.keyboardTop)?value.keyboardTop:root.innerHeight-(Number(value.keyboardHeight)||0)};const viewport=root.visualViewport;return {height:viewport?Math.max(0,(root.innerHeight||0)-viewport.height-(viewport.offsetTop||0)):0,duration:0,top:viewport?viewport.height+(viewport.offsetTop||0):root.innerHeight};}
  function clearAdjustments(){for(const [element,properties]of adjustments)for(const [name,value]of Object.entries(properties))if(element.style[name]===value.applied)element.style[name]=value.base;adjustments.clear();toolbar?.remove();toolbar=null;}
  function rememberStyle(element,name,value){if(!adjustments.has(element))adjustments.set(element,{});const saved=adjustments.get(element);if(!Object.hasOwn(saved,name))saved[name]={base:element.style[name]||'',applied:value};else saved[name].applied=value;element.style[name]=value;}
  function confirm(record){if(!live(record)||record.composing)return;options.emit(record.element,'confirm',{value:record.element.value,cursor:record.element.selectionStart??String(record.element.value).length});if(!boolean(record.node.attrs['confirm-hold']))record.element.blur?.();}
  function cursorBottom(record,rect){
    if(record.tag!=='textarea'||record.node.attrs['adjust-keyboard-to']==='bottom')return rect.bottom;
    const css=root.getComputedStyle?.(record.element);if(!css)return rect.bottom;
    const mirror=document.createElement('div'),marker=document.createElement('span');
    mirror.style.cssText='position:fixed;left:-100000px;top:0;visibility:hidden;white-space:pre-wrap;overflow-wrap:break-word;pointer-events:none;';
    for(const name of ['font','lineHeight','letterSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','boxSizing','borderTopWidth','borderBottomWidth'])if(css[name])mirror.style[name]=css[name];mirror.style.width=rect.width+'px';
    const value=String(record.element.value),cursor=record.element.selectionStart??value.length;mirror.textContent=value.slice(0,cursor);marker.textContent=value[cursor]||'.';mirror.append(marker);document.body.append(mirror);
    const bottom=rect.top+(Number(marker.offsetTop)||0)+(Number(marker.offsetHeight)||parseFloat(css.lineHeight)||20)-(Number(record.element.scrollTop)||0);mirror.remove();return bottom;
  }
  function keyboardChanged(){
    const record=keyboardRecord;if(!record||!live(record)){clearAdjustments();return;}const info=keyboardInfo();
    if(record.keyboardHeight!==info.height){record.keyboardHeight=info.height;options.emit(record.element,'keyboardheightchange',{height:info.height,duration:info.duration});}
    clearAdjustments();if(!info.height||!focused(record))return;
    const attrs=record.node.attrs,accessory=options.accessoryHeight?.(record.element)||0,confirmBar=!accessory&&record.tag==='textarea'&&boolean(attrs['show-confirm-bar'],true);
    if(confirmBar){toolbar=document.createElement('div');toolbar.setAttribute('data-now-ui','keyboard-confirm');toolbar.style.cssText='position:fixed;left:0;right:0;z-index:2147483000;height:44px;display:flex;justify-content:flex-end;align-items:center;background:#f2f2f2;border-top:1px solid #ddd;';toolbar.style.top=Math.max(0,info.top-44)+'px';const button=document.createElement('button');button.textContent='完成';button.style.cssText='margin:0 12px;padding:6px 12px;color:#185b43;background:transparent;border:0;font:16px system-ui;';button.addEventListener('pointerdown',event=>event.preventDefault());button.addEventListener('click',()=>confirm(record));toolbar.append(button);document.body.append(toolbar);}
    if(!boolean(attrs['adjust-position'],true))return;
    const rect=record.element.getBoundingClientRect?.();if(!rect)return;const native=root.__nowNativeEnvironment;if(native?.keyboardWidth>0&&Number.isFinite(rect.right)&&(rect.right<=native.keyboardLeft||rect.left>=native.keyboardLeft+native.keyboardWidth))return;let delta=cursorBottom(record,rect)+Number(attrs['cursor-spacing']||0)-(info.top-accessory-(confirmBar?44:0));if(delta<=0)return;
    if(attrs.fixed===true){rememberStyle(record.element,'transform',(record.element.style.transform||'')+' translateY(-'+delta+'px)');return;}
    for(let parent=record.element.parentElement||record.element.getRootNode?.().host;parent&&delta>0;parent=parent.parentElement||parent.getRootNode?.().host){
      const css=root.getComputedStyle?.(parent);if(!/auto|scroll/.test(css?.overflowY||parent.style.overflowY||parent.style.overflow||''))continue;
      const padding=parseFloat(css?.paddingBottom)||0;rememberStyle(parent,'paddingBottom',(padding+info.height+accessory+(confirmBar?44:0)+Number(attrs['cursor-spacing']||0))+'px');
      const previous=Number(parent.scrollTop)||0;parent.scrollTop=Math.min(Math.max(0,parent.scrollHeight-parent.clientHeight),previous+delta);delta-=Math.max(0,parent.scrollTop-previous);
    }
  }
  function holdKeyboard(event){const record=keyboardRecord;if(!record||!live(record)||!focused(record)||record.node.attrs['hold-keyboard']!==true)return;for(let target=event.target;target;target=target.parentElement||target.host)if(target===record.element||['INPUT','TEXTAREA','SELECT'].includes(target.tagName)||target.isContentEditable)return;if(event.cancelable)event.preventDefault();}
  root.addEventListener?.('now-native-environment',keyboardChanged);root.visualViewport?.addEventListener?.('resize',keyboardChanged);document.addEventListener?.('pointerdown',holdKeyboard,true);
  function selection(record){const element=record.element;if(typeof element.selectionStart!=='number'||typeof element.selectionEnd!=='number')return null;return{selectionStart:element.selectionStart,selectionEnd:element.selectionEnd};}
  function emitSelection(record){if(!live(record)||!focused(record))return;const value=selection(record);if(!value)return;const signature=JSON.stringify(value);if(signature!==record.selection){record.selection=signature;options.emit(record.element,'selectionchange',value);}}
  function lineState(record){if(record.tag!=='textarea')return null;const element=record.element,computed=root.getComputedStyle?.(element),lineHeight=parseFloat(computed?.lineHeight)||0,padding=[computed?.paddingTop,computed?.paddingBottom].map(value=>parseFloat(value)||0).reduce((a,b)=>a+b,0),height=Number(element.scrollHeight)||0;return{height:Math.round(Number(element.clientHeight)||height),lineCount:lineHeight?Math.max(1,Math.round(Math.max(0,height-padding)/lineHeight)):1};}
  function emitLine(record){if(!record.lineEnabled)return;const value=lineState(record);if(!value)return;const signature=JSON.stringify(value);if(signature!==record.lines){record.lines=signature;options.emit(record.element,'linechange',value);}}
  function resize(record){
    if(record.tag!=='textarea'||!record.auto||!live(record)||record.resizing)return;
    record.resizing=true;
    const element=record.element,computed=root.getComputedStyle?.(element),saved=element.style.height,scroll=[];
    // Measuring with height:auto can temporarily collapse a scrolled ancestor.
    // Restore its position after the final height, allowing genuine shrinkage to clamp normally.
    for(let parent=element.parentElement||element.getRootNode?.().host;parent;parent=parent.parentElement||parent.getRootNode?.().host){
      if(parent.scrollTop||parent.scrollLeft)scroll.push([parent,parent.scrollTop,parent.scrollLeft]);
    }
    try{
      element.style.height='auto';
      const size=Number(element.scrollHeight);
      if(Number.isFinite(size)&&size>0){
        const number=name=>parseFloat(computed?.[name])||0;
        const height=computed?.boxSizing==='content-box'?size-number('paddingTop')-number('paddingBottom'):size+number('borderTopWidth')+number('borderBottomWidth');
        element.style.height=Math.max(0,height)+'px';
      }else element.style.height=saved||'';
    }finally{
      for(const[parent,top,left]of scroll){if(parent.scrollTop!==top)parent.scrollTop=top;if(parent.scrollLeft!==left)parent.scrollLeft=left;}
      record.resizing=false;
    }
  }
  function queue(record){if(record.queued)return;record.queued=true;Promise.resolve().then(()=>{record.queued=false;if(!records.has(record.element)||!live(record))return;resize(record);emitLine(record);emitSelection(record);});}
  function setSelection(record){const element=record.element;if(!live(record)||!focused(record)||record.composing)return;let start=record.start,end=record.end;if(start<0||end<0){start=record.cursor;end=start;}if(start<0)return;const length=String(element.value).length;start=Math.min(start,length);end=Math.max(start,Math.min(end,length));try{element.setSelectionRange?.(start,end);}catch(error){if(error.name!=='InvalidStateError')throw error;}queue(record);}
  function invalidate(record){options.invalidate(record.node);}
  function replace(record,result){if(!live(record))return;const value=typeof result==='string'?result:result.value,cursor=typeof result==='object'?result.cursor:undefined;const previous=selection(record),element=record.element;element.value=value;if(previous||cursor!==undefined){const end=cursor!==undefined?(cursor<0?value.length:Math.min(cursor,value.length)):Math.min(previous.selectionEnd,value.length),start=cursor!==undefined?end:Math.min(previous.selectionStart,end);try{element.setSelectionRange?.(start,end);}catch(error){if(error.name!=='InvalidStateError')throw error;}}queue(record);}
  function create(element,node){if(!['input','textarea'].includes(node.tag))return;if(node.tag==='textarea')element.rows=1;const record={element,node,tag:node.tag,id:String(options.scope)+'-'+(++next),cursor:-1,start:-1,end:-1,css:'',auto:false,composing:false,keyboardHeight:0,generation:0,listeners:[]};records.set(element,record);resizeObserver?.observe(element);element.setAttribute('data-now-input',record.id);const on=(type,fn)=>{element.addEventListener(type,fn,{capture:true});record.listeners.push([type,fn]);};
    on('input',()=>{invalidate(record);queue(record);});
    const composition=name=>options.emit(record.element,name,{value:element.value,cursor:typeof element.selectionStart==='number'?element.selectionStart:String(element.value).length});
    on('compositionstart',()=>{record.composing=true;invalidate(record);composition('keyboardcompositionstart');});
    on('compositionupdate',()=>{invalidate(record);composition('keyboardcompositionupdate');});
    on('compositionend',()=>{record.composing=false;invalidate(record);if(record.pending!==undefined){element.value=record.pending;record.pending=undefined;}composition('keyboardcompositionend');setSelection(record);queue(record);});
    on('focus',()=>{keyboardRecord=record;setSelection(record);queue(record);keyboardChanged();});on('blur',()=>{record.generation++;invalidate(record);clearAdjustments();});
    on('keydown',event=>{if(event.key!=='Enter'||event.isComposing||record.composing||record.tag==='textarea'&&['return','enter'].includes(record.node.attrs['confirm-type']??'return'))return;event.preventDefault();event.stopImmediatePropagation?.();confirm(record);});
    for(const type of ['select','keyup','pointerup'])on(type,()=>queue(record));
  }
  function queueFocus(record){if(record.focusQueued||!record.focusPending)return;record.focusQueued=true;const generation=record.generation;Promise.resolve().then(()=>{record.focusQueued=false;if(!records.has(record.element)||!record.focusPending)return;if(generation!==record.generation||!live(record)){if(live(record))queueFocus(record);return;}record.element.focus();record.focusPending=!focused(record);setSelection(record);queue(record);});}
  function patch(element,node,old){const record=records.get(element);if(!record)return;record.node=node;const attrs=node.attrs,forced=node.forced||[],value=attrs.value===undefined||attrs.value===null?'':String(attrs.value),changed=old?.attrs?.value!==attrs.value||forced.includes('value');
    record.cursor=position(attrs.cursor);record.start=position(attrs['selection-start']);record.end=position(attrs['selection-end']);record.auto=record.tag==='textarea'&&boolean(attrs['auto-height']);record.lineEnabled=record.tag==='textarea'&&(node.events||[]).some(event=>event.name==='linechange');
    for(const name of ['always-embed','confirm-hold','adjust-position','hold-keyboard','fixed','show-confirm-bar','disable-default-padding'])if(attrs[name]!==undefined)boolean(attrs[name]);
    if(attrs['cursor-spacing']!==undefined&&(!Number.isFinite(Number(attrs['cursor-spacing']))||Number(attrs['cursor-spacing'])<0||Number(attrs['cursor-spacing'])>1000))fail('cursor-spacing需要0–1000数值');
    if(attrs['adjust-keyboard-to']!==undefined&&!['cursor','bottom'].includes(attrs['adjust-keyboard-to']))fail('adjust-keyboard-to只支持cursor/bottom');
    for(const name of ['always-embed','confirm-hold','adjust-position','hold-keyboard','fixed','show-confirm-bar','disable-default-padding','cursor-spacing','adjust-keyboard-to'])if(attrs[name]!==undefined)element.dataset['now'+name.replace(/(^|-)([a-z])/g,(_a,_b,char)=>char.toUpperCase())]=String(attrs[name]);
    if(record.tag==='textarea'&&attrs['disable-default-padding']===true)element.style.padding='0';
    if(changed){invalidate(record);if(record.composing)record.pending=value;else if(element.value!==value)element.value=value;}
    record.css=declarations(attrs['placeholder-style']);const placeholder=attrs['placeholder-class']??(record.tag==='input'?'input-placeholder':'textarea-placeholder');if(typeof placeholder!=='string'||placeholder.length>512||/[\x00-\x1f\x7f]/.test(placeholder))fail('placeholder-class需要有效类名字符串');element.setAttribute('data-now-placeholder',options.classes(placeholder));element.style.caretColor=attrs['cursor-color']===undefined?'':String(attrs['cursor-color']);
    const confirm=attrs['confirm-type']??(record.tag==='textarea'?'return':'done');if(!['send','search','next','go','done',...(record.tag==='textarea'?['return','enter']:[])].includes(confirm))fail('confirm-type 无效');element.setAttribute('enterkeyhint',confirm==='return'?'enter':String(confirm));element.setAttribute('data-now-auto-height',String(record.auto));
    if(record.tag==='textarea'&&!record.auto&&old?.attrs?.['auto-height'])element.style.height=options.height(node);
    const focus=boolean(attrs.focus)||boolean(attrs['auto-focus']),focusChanged=!old||old.attrs.focus!==attrs.focus||old.attrs['auto-focus']!==attrs['auto-focus']||forced.includes('focus')||forced.includes('auto-focus');
    if(focusChanged){record.generation++;record.focusPending=focus;if(focus)queueFocus(record);else if(attrs.focus===false&&focused(record))element.blur?.();}
    if(['cursor','selection-start','selection-end'].some(key=>!old||old.attrs[key]!==attrs[key]||forced.includes(key)))setSelection(record);
    queue(record);stylesheet();if(keyboardRecord===record&&focused(record))Promise.resolve().then(keyboardChanged);
  }
  function decodeEntities(value){return value.replace(/&(#x[0-9a-f]+|#\d+|nbsp|lt|gt|amp|apos|quot|ensp|emsp);/gi,(whole,name)=>{const lower=name.toLowerCase();if(entities[lower])return entities[lower];const code=lower[1]==='x'?parseInt(lower.slice(2),16):Number(lower.slice(1));return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):whole;});}
  const textStyleRecords=new WeakMap();
  function textStyle(element,attrs,selectable,maxLines){
    const previous=textStyleRecords.get(element);
    if(previous&&previous.source===attrs.style)for(const key of Object.keys(previous.applied))if(element.style[key]===previous.applied[key])element.style[key]=previous.base[key];
    const applied={webkitUserSelect:selectable?'text':'none',userSelect:selectable?'text':'none'},base={};
    if(attrs.overflow==='visible')applied.overflow='visible';
    else if(attrs.overflow==='clip')applied.overflow='hidden';
    else if(attrs.overflow==='ellipsis')Object.assign(applied,{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'});
    else if(attrs.overflow==='fade')Object.assign(applied,{overflow:'hidden',maskImage:'linear-gradient(to bottom, #000 70%, transparent)',webkitMaskImage:'linear-gradient(to bottom, #000 70%, transparent)'});
    if(maxLines)Object.assign(applied,{display:'-webkit-box',webkitBoxOrient:'vertical',webkitLineClamp:String(maxLines),overflow:'hidden',whiteSpace:'normal'});
    for(const key of Object.keys(applied)){base[key]=element.style[key]||'';element.style[key]=applied[key];applied[key]=element.style[key];}
    textStyleRecords.set(element,{source:attrs.style,base,applied});
  }
  // Newlines belong to text content, independently of CSS white-space. Keep
  // generated siblings stable so an unrelated render cannot move live Ranges.
  const textFragments=new Map();
  function clearFragment(record){for(const node of record.extras)node.parentNode?.removeChild(node);}
  function presentText(element,value,seen){
    seen.add(element);const saved=textFragments.get(element),lines=value.split('\n'),parent=element.parentNode;
    const siblings=parent?[...parent.childNodes]:[],at=siblings.indexOf(element);
    if(saved&&saved.value===value&&saved.parent===parent&&saved.extras.every((node,index)=>siblings[at+index+1]===node)&&element.nodeValue===lines[0])return;
    if(saved)clearFragment(saved);textFragments.delete(element);
    if(element.nodeValue!==lines[0])element.nodeValue=lines[0];
    if(!parent||lines.length===1)return;
    const extras=[];let anchor=element;
    for(const line of lines.slice(1)){const br=document.createElement('br'),text=document.createTextNode(line),next=[...parent.childNodes][[...parent.childNodes].indexOf(anchor)+1]||null;parent.insertBefore(br,next);parent.insertBefore(text,next);extras.push(br,text);anchor=text;}
    textFragments.set(element,{value,parent,extras});
  }
  function text(nodes,context,seen){for(const node of nodes){let current=context;if(node.tag==='text'){const attrs=node.attrs,space=attrs.space??'';if(space!==''&&!Object.hasOwn(spaces,space))fail('text.space只支持ensp/emsp/nbsp');for(const name of ['selectable','user-select','decode','select-on-gesture'])if(attrs[name]!==undefined&&typeof attrs[name]!=='boolean')fail('text.'+name+'需要boolean');if(attrs.overflow!==undefined&&!['clip','fade','ellipsis','visible'].includes(attrs.overflow))fail('text.overflow无效');const maxLines=attrs['max-lines']===undefined?undefined:Number(attrs['max-lines']);if(maxLines!==undefined&&(!Number.isInteger(maxLines)||maxLines<1||maxLines>10000))fail('text.max-lines需要1–10000整数');current={decode:boolean(attrs.decode),space,selectable:attrs['user-select']===undefined&&attrs.selectable===undefined?!!context?.selectable:boolean(attrs['user-select'])||boolean(attrs.selectable)};const element=node.element;textStyle(element,attrs,current.selectable,maxLines);if(attrs['select-on-gesture']!==undefined)element.dataset.nowSelectGesture=String(attrs['select-on-gesture']);}if(node.tag==='#text'&&current){let value=node.text;if(current.decode)value=decodeEntities(value);if(current.space)value=value.replace(/ /g,spaces[current.space]);presentText(node.element,String(value),seen);}if(node.children)text(node.children,current,seen);}}
  function flush(nodes){if(nodes){const seen=new Set();text(nodes,null,seen);for(const [element,record]of textFragments)if(!seen.has(element)){clearFragment(record);textFragments.delete(element);}}for(const record of records.values()){if(!live(record)){record.generation++;invalidate(record);continue;}queueFocus(record);queue(record);}}
  function remove(element){const record=records.get(element);if(!record)return;if(keyboardRecord===record){clearAdjustments();keyboardRecord=null;}record.generation++;invalidate(record);resizeObserver?.unobserve(element);for(const[type,fn]of record.listeners)element.removeEventListener(type,fn,true);records.delete(element);stylesheet();}
  const changed=()=>{for(const record of records.values())queue(record);};
  const resizeObserver=typeof root.ResizeObserver==='function'?new root.ResizeObserver(changed):null;document.addEventListener?.('selectionchange',changed);root.addEventListener?.('resize',changed);
  return{create,patch,flush,remove,keyboard(){keyboardRecord=[...records.values()].find(record=>live(record)&&focused(record));keyboardChanged();},result(element,value){const record=records.get(element);if(record?.tag==='input'&&!record.composing)replace(record,value);},value(element,value){const record=records.get(element);if(!record)return false;if(record.composing)record.pending=value;else element.value=value;return true;},visibility(value){visible=value;if(!value){clearAdjustments();keyboardRecord=null;}if(!value)for(const record of records.values()){record.generation++;invalidate(record);}else flush();},dispose(){disposed=true;for(const record of textFragments.values())clearFragment(record);textFragments.clear();clearAdjustments();root.removeEventListener?.('now-native-environment',keyboardChanged);root.visualViewport?.removeEventListener?.('resize',keyboardChanged);document.removeEventListener?.('pointerdown',holdKeyboard,true);resizeObserver?.disconnect();for(const element of [...records.keys()])remove(element);cssElement?.remove();document.removeEventListener?.('selectionchange',changed);root.removeEventListener?.('resize',changed);}};
}

module.exports = createTextInputRuntime;
