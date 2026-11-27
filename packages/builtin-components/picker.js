function createPickerRuntime(root, options) {
  'use strict';
  const document=root.document,records=new Map(),regionData=options.regionData||[];let active=null,visible=true,disposed=false;
  const fail=message=>{throw new options.Error(message,{code:'INVALID_ARGUMENT'});};
  const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
  const validKey=key=>typeof key==='string'&&key.length<=128&&!['__proto__','prototype','constructor'].includes(key);
  function index(value){if(value===undefined)return 0;if(typeof value==='string'&&!/^\d+$/.test(value)||!['string','number'].includes(typeof value))fail('picker.value需要非负整数');value=Number(value);if(!Number.isSafeInteger(value)||value<0)fail('picker.value需要非负整数');return value;}
  function date(value,fields){
    if(typeof value!=='string')fail('picker日期需要YYYY、YYYY-MM或YYYY-MM-DD字符串');
    const match=/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value);if(!match)fail('picker日期格式无效');
    const year=Number(match[1]),month=Number(match[2]||1),day=Number(match[3]||1),leap=year%4===0&&(year%100!==0||year%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
    if(year<1||month<1||month>12||day<1||day>days[month-1]||fields==='day'&&!match[3]||fields==='month'&&!match[2])fail('picker日期或精度无效');
    return value.slice(0,fields==='year'?4:fields==='month'?7:10);
  }
  function time(value){if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))fail('picker时间需要HH:mm（00:00–23:59）');return value;}
  function normalize(attrs){
    const mode=attrs.mode===undefined?'selector':attrs.mode;if(!['selector','multiSelector','date','time','region'].includes(mode))fail('picker.mode仅支持selector、multiSelector、date、time和region');
    const disabled=attrs.disabled===undefined?false:attrs.disabled;if(typeof disabled!=='boolean')fail('picker.disabled需要布尔值');
    if(mode==='region'){
      const level=attrs.level===undefined?'region':attrs.level;if(!['province','city','district','region'].includes(level))fail('picker.level无效');
      const custom=attrs['custom-item']===undefined?null:attrs['custom-item'];if(custom!==null&&(typeof custom!=='string'||!custom||custom.length>64))fail('region.custom-item需要1–64字符字符串');
      const value=attrs.value===undefined?[]:attrs.value;if(!Array.isArray(value)||value.length>3||value.some(item=>typeof item!=='string'))fail('region.value需要名称数组');
      const find=(items,name)=>Math.max(0,items.findIndex(item=>item.name===name)),pick=(items,name)=>custom!==null&&name===custom?-1:items.length?find(items,name):custom!==null?-1:0;
      const p=pick(regionData,value[0]),cities=p>=0?(regionData[p]?.children||[]):[],c=pick(cities,value[1]),districts=c>=0?(cities[c]?.children||[]):[],d=pick(districts,value[2]),count=level==='province'?1:level==='city'?2:3,columns=[regionData.map(item=>item.name)];
      if(count>1)columns.push(cities.map(item=>item.name));
      if(count>2)columns.push(districts.map(item=>item.name));
      return{mode,level,count,columns,custom,value:[p,c,d].slice(0,count),disabled:disabled||(custom===null?!columns.every(column=>column.length):!regionData.length)};
    }
    if(mode==='selector'||mode==='multiSelector'){
      if(attrs.fields!==undefined||attrs.start!==undefined||attrs.end!==undefined)fail('选项选择器不接受fields/start/end');
      const range=attrs.range===undefined?[]:attrs.range,key=attrs['range-key'];
      if(!Array.isArray(range)||key!==undefined&&(!validKey(key)||!key))fail('picker.range需要数组，range-key需要有效字段名');
      let characters=0;
      const labels=items=>{if(!Array.isArray(items)||items.length>1000)fail('picker每列最多1000项');return items.map(item=>{let value=item;if(item&&typeof item==='object'){if(Array.isArray(item)||!key||!own(item,key))fail('对象range需要存在的range-key');value=item[key];}if(!['string','number'].includes(typeof value)||typeof value==='number'&&!Number.isFinite(value))fail('picker选项需要字符串、有限数或range-key对象');const label=String(value);characters+=label.length;if(label.length>512||characters>32768)fail('picker选项文字超过支持范围');return label;});};
      if(mode==='selector'){const list=labels(range);return{mode,disabled:disabled||!list.length,labels:list,value:list.length?Math.min(index(attrs.value),list.length-1):0};}
      if(range.length>16)fail('picker.multiSelector最多16列');
      const columns=range.map(labels),value=attrs.value===undefined?[]:attrs.value;
      if(!Array.isArray(value)||value.length>columns.length)fail('multiSelector.value需要不超过列数的索引数组');
      return{mode,disabled:disabled||!columns.length||columns.some(column=>!column.length),columns,value:columns.map((column,i)=>Math.min(index(value[i]),Math.max(0,column.length-1)))};
    }
    if(attrs.range!==undefined||attrs['range-key']!==undefined)fail('日期/时间选择器不接受range/range-key');
    if(mode==='time'){
      if(attrs.fields!==undefined)fail('time模式不接受fields');const min=time(attrs.start===undefined?'00:00':attrs.start),max=time(attrs.end===undefined?'23:59':attrs.end);if(min>max)fail('picker.start不能晚于end，不支持跨午夜范围');const value=attrs.value===undefined||attrs.value===''?'':time(attrs.value);return{mode,disabled,min,max,defaultValue:min,value:value===''?'':value<min?min:value>max?max:value};
    }
    const fields=attrs.fields===undefined?'day':attrs.fields;if(!['year','month','day'].includes(fields))fail('picker.fields仅支持year、month和day');
    const min=date(attrs.start===undefined?'1970-01-01':attrs.start,fields),max=date(attrs.end===undefined?'2999-12-31':attrs.end,fields);if(min>max)fail('picker.start不能晚于end');
    const now=new Date(),today=String(now.getFullYear()).padStart(4,'0')+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0'),value=attrs.value===undefined?date(today,fields):attrs.value===''?'':date(attrs.value,fields),current=date(today,fields);
    return{mode,fields,disabled,min,max,defaultValue:current<min?min:current>max?max:current,value:value===''?'':value<min?min:value>max?max:value};
  }
  function available(record){if(disposed||!visible||!options.live()||!record.element.isConnected||record.model.disabled)return false;for(let node=record.element;node;node=node.parentElement||node.host){if(node.hidden||node.inert)return false;}return true;}
  const copy=value=>Array.isArray(value)?value.slice():value;
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const columnLabels=(model,column)=>model.custom?[model.custom,...model.columns[column]]:model.columns[column];
  const publicValue=record=>record.model.mode==='region'?record.value.map((value,i)=>value===-1?record.model.custom:record.model.columns[i][value]||''):copy(record.value);
  function paintValue(record){const text=['multiSelector','region'].includes(record.model.mode)?record.value.map((value,i)=>value===-1&&record.model.custom?record.model.custom:record.model.columns[i][value]||'').join('，'):record.model.mode==='selector'?(record.model.labels[record.value]||''):String(record.value);record.element.setAttribute('aria-valuetext',text);}
  function close(notify=false,restoreFocus=true){const current=active;if(!current)return;active=null;current.closed=true;current.themeObserver?.disconnect();clearWheels(current);root.removeEventListener?.('resize',current.resize);root.removeEventListener?.('now-native-environment',current.resize);current.dialog.remove();current.record.element.setAttribute('aria-expanded','false');if(restoreFocus&&current.focus?.isConnected&&available(current.record)&&!current.focus.hidden&&!current.focus.inert)current.focus.focus?.();if(notify&&available(current.record))options.emit(current.record.element,'cancel',{});}
  function renderMulti(current){
    const {record,input}=current;
    while(current.inputs.length>record.model.columns.length){current.inputs.pop().parentElement.remove();}
    record.model.columns.forEach((_labels,column)=>{const labels=columnLabels(record.model,column);
      let select=current.inputs[column];
      if(!select){const label=document.createElement('label');label.textContent='第'+(column+1)+'列';select=document.createElement('select');select.setAttribute('data-now-picker-input','');select.setAttribute('data-now-picker-column',String(column));select.setAttribute('aria-label','第'+(column+1)+'列');Object.assign(select.style,{display:'block',width:'100%',minWidth:'0',minHeight:'44px',fontSize:'16px',padding:'8px',margin:'6px 0 12px',boxSizing:'border-box',colorScheme:current.dialog.style.colorScheme});label.append(select);input.append(label);current.inputs.push(select);
        const change=()=>{if(active!==current||!available(record))return;const selected=index(select.value),value=record.model.custom?selected-1:selected;if(value < -1||value>=record.model.columns[column].length||current.draft[column]===value)return;current.draft[column]=value;if(record.model.mode==='region'&&column<record.model.count-1){const cities=current.draft[0]>=0?(regionData[current.draft[0]]?.children||[]):[];const next=(column===0?cities:current.draft[1]>=0?(cities[current.draft[1]]?.children||[]):[]).map(item=>item.name);record.model.columns[column+1]=next;current.draft[column+1]=next.length?Math.min(current.draft[column+1]>=0?current.draft[column+1]:0,next.length-1):-1;if(column===0&&record.model.count>2){const districts=current.draft[1]>=0?(cities[current.draft[1]]?.children||[]):[];record.model.columns[2]=districts.map(item=>item.name);current.draft[2]=record.model.columns[2].length?Math.min(current.draft[2]>=0?current.draft[2]:0,record.model.columns[2].length-1):-1;}renderMulti(current);}options.emit(record.element,'columnchange',{column,value:selected});renderWheels(current);};select.pickerChange=change;select.addEventListener('change',change);
      }
      const signature=JSON.stringify(labels);
      if(select.pickerLabels!==signature){select.replaceChildren(...labels.map((text,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=text;return option;}));select.pickerLabels=signature;}
      select.value=String(current.draft[column]+(record.model.custom?1:0));
    });
    renderWheels(current);
  }
  // Native controls keep canonical values and validation; compact views expose scrollable lists.
  function wheelModel(current) {
    const {record}=current,model=record.model;
    if(model.mode==='selector')return [{labels:model.labels,index:Number(current.input.value)||0,control:current.input}];
    if(['multiSelector','region'].includes(model.mode))return current.inputs.map(control=>({labels:[...control.children].map(option=>option.textContent),index:Number(control.value)||0,control}));
    const clock=model.mode==='time',separator=clock?':':'-',count=clock?2:model.fields==='year'?1:model.fields==='month'?2:3;
    const parts=current.pendingParts||String(current.input.value||model.defaultValue).split(separator).map(Number),min=model.min.split(separator).map(Number),max=model.max.split(separator).map(Number),columns=[];
    current.pendingParts=null;
    for(let column=0;column<count;column++){
      let low=clock?0:column===0?min[0]:1,high=clock?(column===0?23:59):column===0?max[0]:column===1?12:new Date(parts[0],parts[1],0).getDate();
      if(parts.slice(0,column).every((value,i)=>value===min[i]))low=Math.max(low,min[column]);
      if(parts.slice(0,column).every((value,i)=>value===max[i]))high=Math.min(high,max[column]);
      parts[column]=Math.min(high,Math.max(low,Number.isFinite(parts[column])?parts[column]:low));
      const values=Array.from({length:high-low+1},(_,i)=>i+low),labels=values.map(value=>clock?String(value).padStart(2,'0'):column===0?value+'年':String(value).padStart(2,'0')+(column===1?'月':'日'));
      columns.push({labels,index:parts[column]-low,values});
    }
    current.parts=parts;current.input.value=parts.slice(0,count).map((value,i)=>String(value).padStart(!clock&&i===0?4:2,'0')).join(separator);return columns;
  }
  function chooseWheel(current,column,index){
    if(active!==current||!available(current.record))return;
    const model=current.wheelColumns[column];if(!model||!model.labels.length)return;index=Math.min(model.labels.length-1,Math.max(0,index));
    if(model.control){model.control.value=String(index);model.control.pickerChange?.();}
    else{current.parts[column]=model.values[index];current.pendingParts=current.parts.slice();}
    renderWheels(current);
  }
  function settleWheel(current,wheel){
    root.clearTimeout(wheel.timer);wheel.timer=null;
    if(active!==current||current.wheels[wheel.column]!==wheel||!wheel.items.length)return;
    const index=Math.min(wheel.items.length-1,Math.max(0,Math.round((wheel.element.scrollTop||0)/48)));
    if(index!==wheel.index)chooseWheel(current,wheel.column,index);else wheel.element.scrollTop=wheel.index*48;
  }
  function clearWheels(current){for(const wheel of current.wheels||[])root.clearTimeout(wheel.timer);current.wheels=[];}
  function renderWheels(current){
    if(!current.body||active!==current)return;
    const columns=wheelModel(current);current.wheelColumns=columns;
    while(current.wheels.length>columns.length){const wheel=current.wheels.pop();root.clearTimeout(wheel.timer);wheel.element.remove();}
    columns.forEach((model,column)=>{
      let wheel=current.wheels[column];
      if(!wheel){
        const element=document.createElement('div');element.className='weapp-picker-wheel';element.setAttribute('data-now-picker-wheel',String(column));element.setAttribute('role','listbox');element.setAttribute('aria-label','第'+(column+1)+'列');element.tabIndex=0;
        Object.assign(element.style,{flex:'1',minWidth:'0',height:'240px',overflowY:'auto',padding:'96px 0',boxSizing:'border-box',scrollSnapType:'y mandatory',overscrollBehavior:'contain',scrollbarWidth:'none',outlineOffset:'-2px'});
        wheel={element,column,items:[],index:0,signature:null,timer:null};current.wheels.push(wheel);current.body.insertBefore(element,current.mask);
        element.addEventListener('scroll',()=>{if(active!==current||current.wheels[wheel.column]!==wheel)return;root.clearTimeout(wheel.timer);wheel.timer=root.setTimeout(()=>settleWheel(current,wheel),100);});
        element.addEventListener('click',event=>{let item=event.target;while(item&&item!==element&&item.getAttribute?.('data-now-picker-option')===null)item=item.parentElement;if(item&&item!==element)chooseWheel(current,column,Number(item.getAttribute('data-now-picker-option')));});
        element.addEventListener('keydown',event=>{const delta={ArrowUp:-1,ArrowDown:1,PageUp:-5,PageDown:5};if(event.key==='Enter'){event.preventDefault();current.confirm.click();return;}if(event.key===' '){event.preventDefault();return;}if(!own(delta,event.key)&&!['Home','End'].includes(event.key))return;event.preventDefault();chooseWheel(current,column,event.key==='Home'?0:event.key==='End'?wheel.items.length-1:wheel.index+delta[event.key]);});
      }
      const signature=JSON.stringify(model.labels);
      if(wheel.signature!==signature){
        root.clearTimeout(wheel.timer);wheel.signature=signature;wheel.items=model.labels.map((label,index)=>{const item=document.createElement('div');item.id='now-picker-'+column+'-'+index;item.setAttribute('role','option');item.setAttribute('data-now-picker-option',String(index));item.textContent=label;Object.assign(item.style,{height:'48px',lineHeight:'48px',fontSize:'11px',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis',textAlign:'center',scrollSnapAlign:'center',cursor:'pointer',color:current.dark?'#ededed':'rgba(0,0,0,.9)'});return item;});wheel.element.replaceChildren(...wheel.items);
      }
      wheel.index=Math.min(Math.max(0,model.index),Math.max(0,wheel.items.length-1));
      wheel.items.forEach((item,index)=>item.setAttribute('aria-selected',String(index===wheel.index)));wheel.element.setAttribute('aria-activedescendant',wheel.items[wheel.index]?.id||'');wheel.element.scrollTop=wheel.index*48;
    });
  }
  function present(current){
    const compact=(root.innerWidth||document.documentElement?.clientWidth||375)<640;
    if(current.compact){ const inset=root.__nowNativeEnvironment?.safeAreaInsets?.bottom ?? root.__nowNativeEnvironment?.safeAreaBottom; current.dialog.style.paddingBottom=Number.isFinite(inset)?Math.max(0,inset)+'px':'var(--weapp-safe-area-bottom, env(safe-area-inset-bottom, 0px))'; }
    if(current.presented&&current.compact===compact)return;
    const {dialog,heading,label,status,cancel,confirm,input}=current;
    if(current.presented){clearWheels(current);current.body=null;for(const [name,element]of Object.entries({dialog,heading,label,status,cancel,confirm,input})){element.style.cssText=current.original[name];element.hidden=name==='heading'?false:name==='status'?!!current.statusHidden:false;}dialog.replaceChildren(heading,label,status,cancel,confirm);}
    current.presented=true;current.compact=compact;dialog.setAttribute('data-now-picker-layout',compact?'sheet':'dialog');
    if(compact){
      Object.assign(dialog.style,{position:'fixed',inset:'auto 0 0',margin:'0',width:'100%',maxWidth:'none',maxHeight:'min(100dvh, 28rem)',padding:'0 0 var(--weapp-safe-area-bottom, env(safe-area-inset-bottom, 0px))',border:'0',borderRadius:'0',fontFamily:'-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", sans-serif',overflow:'hidden',boxSizing:'border-box'});
      const header=document.createElement('div');header.setAttribute('data-now-picker-header','');Object.assign(header.style,{display:'flex',alignItems:'center',padding:'16px',position:'relative',fontSize:'17px',lineHeight:'1.4'});
      heading.hidden=!current.record.model.header || root.__nowNativeEnvironment?.platform!=='android';Object.assign(heading.style,{margin:'0',fontSize:'17px',fontWeight:'400',textAlign:'center',maxWidth:'60%',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'});
      for(const button of [cancel,confirm])Object.assign(button.style,{display:'block',flex:'1',minHeight:'0',height:'auto',padding:'0',margin:'0',border:'0',borderRadius:'0',background:'transparent',font:'inherit',position:'relative',boxSizing:'border-box'});
      cancel.style.textAlign='left';cancel.style.color='var(--weapp-picker-muted,rgba(0,0,0,.5))';confirm.style.textAlign='right';confirm.style.color='#07c160';header.append(cancel,heading,confirm);
      label.hidden=true;label.style.display='none';input.hidden=true;input.style.display='none';status.hidden=!status.textContent;Object.assign(status.style,{margin:'0',padding:'8px 16px',fontSize:'14px'});
      const body=document.createElement('div');body.setAttribute('data-now-picker-body','');Object.assign(body.style,{display:'flex',height:'240px',position:'relative',overflow:'hidden',userSelect:'none'});current.body=body;
      const mask=document.createElement('div'),indicator=document.createElement('div'),rgb='var(--weapp-picker-sheet-rgb,255,255,255)';mask.setAttribute('aria-hidden','true');Object.assign(mask.style,{position:'absolute',inset:'0',pointerEvents:'none',zIndex:'1',backgroundImage:'linear-gradient(rgba('+rgb+',.95),rgba('+rgb+',.6)),linear-gradient(0deg,rgba('+rgb+',.95),rgba('+rgb+',.6))',backgroundPosition:'top,bottom',backgroundSize:'100% 92px',backgroundRepeat:'no-repeat'});current.mask=mask;
      indicator.setAttribute('aria-hidden','true');indicator.setAttribute('data-now-picker-indicator','');Object.assign(indicator.style,{position:'absolute',left:'0',right:'0',top:'92px',height:'56px',boxSizing:'border-box',pointerEvents:'none',zIndex:'1'});body.append(mask,indicator);
      const style=document.createElement('style');style.textContent='@keyframes now-picker-slide{from{transform:translateY(100%)}}@keyframes now-picker-fade{from{opacity:0}}dialog[data-now-picker-layout="sheet"]{animation:now-picker-slide .3s ease forwards}dialog[data-now-picker-layout="sheet"]::backdrop{background:rgba(0,0,0,.6);animation:now-picker-fade .3s ease forwards}dialog[data-now-picker-layout="sheet"] [data-now-picker-header]::after{content:"";position:absolute;left:0;right:0;bottom:0;border-bottom:1px solid rgba(0,0,0,.1);transform:scaleY(.5);transform-origin:0 100%}dialog[data-now-picker-layout="sheet"] [data-now-picker-header] button::before{content:"";position:absolute;inset:-16px 0;}dialog[data-now-picker-layout="sheet"] [data-now-picker-indicator]::before,dialog[data-now-picker-layout="sheet"] [data-now-picker-indicator]::after{content:"";position:absolute;left:0;right:0;height:1px;transform:scaleY(.5)}dialog[data-now-picker-layout="sheet"] [data-now-picker-indicator]::before{top:0;border-top:1px solid rgba(0,0,0,.1);transform-origin:0 0}dialog[data-now-picker-layout="sheet"] [data-now-picker-indicator]::after{bottom:0;border-bottom:1px solid rgba(0,0,0,.1);transform-origin:0 100%}.weapp-picker-wheel::-webkit-scrollbar{display:none}.weapp-picker-wheel:focus-visible{outline:2px solid #1677ff}@media(prefers-reduced-motion:reduce){dialog[data-now-picker-layout="sheet"],dialog[data-now-picker-layout="sheet"]::backdrop{animation:none}}';dialog.replaceChildren(style,header,label,status,body);const inset=root.__nowNativeEnvironment?.safeAreaInsets?.bottom ?? root.__nowNativeEnvironment?.safeAreaBottom;if(Number.isFinite(inset))dialog.style.paddingBottom=Math.max(0,inset)+'px';if(root.__nowNativeEnvironment?.reducedMotion)dialog.style.animation='none';renderWheels(current);
    }
    if(dialog.isConnected)(current.compact?current.wheels[0]?.element:current.inputs[0]||input)?.focus?.();
  }
  function accepted(record,input){if(record.model.mode==='region'){if(!Array.isArray(input)||input.length!==record.model.count)fail('地区选择列已变化');return input.map((value,i)=>{const position=index(value)-(record.model.custom?1:0);if(position < -1||position>=record.model.columns[i].length)fail('所选项目已经不存在');return position===-1?record.model.custom:record.model.columns[i][position];});}if(record.model.mode==='multiSelector'){if(!Array.isArray(input)||input.length!==record.model.columns.length)fail('选择列已变化');return input.map((value,i)=>{value=index(value);if(value>=record.model.columns[i].length)fail('所选项目已经不存在');return value;});}if(record.model.mode==='selector'){const value=index(input);if(value>=record.model.labels.length)fail('所选项目已经不存在');return value;}const value=record.model.mode==='time'?time(input):date(input,record.model.fields);if(value<record.model.min||value>record.model.max)fail('选择结果超出start/end范围');return value;}
  function open(record,event){
    if(event?.defaultPrevented||event?.type==='keydown'&&!['Enter',' '].includes(event.key)||!available(record))return;
    if(event?.type==='keydown')event.preventDefault();if(active){if(active.record===record)return;close(false);}
    const dialog=document.createElement('dialog');if(typeof dialog.showModal!=='function')throw new options.Error('当前浏览器不支持picker弹窗',{code:'UNKNOWN_METHOD'});
    dialog.setAttribute('data-now-picker','');dialog.setAttribute('aria-label','选择'+(['selector','multiSelector','region'].includes(record.model.mode)?'选项':record.model.mode==='time'?'时间':'日期'));Object.assign(dialog.style,{padding:'20px',border:'1px solid #ddd',borderRadius:'16px',maxWidth:'min(28rem,90vw)',boxSizing:'border-box'});
    const readTheme=()=>{for(let node=record.element;node;node=node.parentElement||node.getRootNode?.().host||node.host){const value=node.getAttribute?.('data-weui-theme');if(value==='dark'||value==='light')return value;}return 'light';};const theme=readTheme();
    const dark=theme==='dark';dialog.setAttribute('data-now-picker-theme',theme);dialog.setAttribute('data-weui-theme',theme);Object.assign(dialog.style,{width:'min(28rem,calc(100vw - 32px))',maxWidth:'calc(100vw - 32px)',maxHeight:'calc(100dvh - 32px)',overflow:'auto',background:'var(--weapp-picker-background,#ffffff)',color:'var(--weapp-picker-foreground,#222222)',borderColor:'var(--weapp-picker-border,#d1d1d1)',colorScheme:theme});
    const heading=document.createElement('h3'),label=document.createElement('label'),input=document.createElement(['multiSelector','region'].includes(record.model.mode)?'div':record.model.mode==='selector'?'select':'input'),status=document.createElement('p'),cancel=document.createElement('button'),confirm=document.createElement('button');
    heading.textContent=record.model.header||(['selector','multiSelector'].includes(record.model.mode)?'选择选项':record.model.mode==='time'?'选择时间':'选择日期');label.textContent=heading.textContent;label.append(input);input.setAttribute('data-now-picker-input','');input.setAttribute('aria-label',heading.textContent);status.setAttribute('role','alert');cancel.type='button';cancel.textContent='取消';confirm.type='button';confirm.textContent='确定';confirm.setAttribute('data-now-picker-confirm','');
    Object.assign(input.style,{display:'block',width:'100%',minWidth:'0',fontSize:'16px',padding:'8px',margin:'12px 0',boxSizing:'border-box'});
    Object.assign(heading.style,{margin:'0 0 16px',fontSize:'20px'});Object.assign(label.style,{display:'block'});Object.assign(input.style,{minHeight:'44px',background:'var(--weapp-picker-input-background,#fff)',color:'var(--weapp-picker-foreground,#222)',border:'1px solid '+('var(--weapp-picker-input-border,#aaa)'),borderRadius:'8px',colorScheme:theme});
    for(const button of [cancel,confirm])Object.assign(button.style,{display:'inline-flex',alignItems:'center',justifyContent:'center',minHeight:'44px',padding:'8px 16px',fontSize:'16px',borderRadius:'8px',border:'1px solid '+('var(--weapp-picker-input-border,#aaa)'),background:'var(--weapp-picker-button-background,#f5f5f5)',color:'var(--weapp-picker-foreground,#222)',margin:'4px 8px 0 0'});Object.assign(confirm.style,{background:'#07a650',color:'#fff',borderColor:'#07a650'});
    if(record.model.mode==='selector'){record.model.labels.forEach((value,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=value;input.append(option);});}
    else if(!['multiSelector','region'].includes(record.model.mode)){input.type=record.model.mode==='time'?'time':record.model.fields==='year'?'number':record.model.fields==='month'?'month':'date';input.min=record.model.min;input.max=record.model.max;if(record.model.fields==='year')input.step='1';}
    input.value=String(record.value===''?record.model.defaultValue:record.value);input.required=true;dialog.append(heading,label,status,cancel,confirm);
    const current={record,dialog,input,closed:false,focus:document.activeElement,signature:record.signature,inputs:[],draft:copy(record.value),openValue:publicValue(record),heading,label,status,cancel,confirm,dark,wheels:[],body:null,original:Object.fromEntries(Object.entries({dialog,heading,label,status,cancel,confirm,input}).map(([name,node])=>[name,node.style.cssText]))};active=current;if(['multiSelector','region'].includes(record.model.mode)){Object.assign(input.style,{border:'0',padding:'0'});renderMulti(current);}record.element.setAttribute('aria-expanded','true');
    const dismiss=event=>{event?.preventDefault();if(active===current)close(true);};dialog.addEventListener('click',event=>{if(!current.compact||event.target!==dialog)return;const box=dialog.getBoundingClientRect?.();if(box&&(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom))dismiss(event);});cancel.addEventListener('click',dismiss);dialog.addEventListener('cancel',dismiss);dialog.addEventListener('close',()=>{if(active===current)close(true);});
    confirm.addEventListener('click',()=>{if(active!==current||current.closed)return;if(!available(record)||current.signature!==record.signature){close(false);return;}if(current.compact)for(let i=0;i<current.wheels.length;i++)settleWheel(current,current.wheels[i]);let value;try{value=accepted(record,['multiSelector','region'].includes(record.model.mode)?current.inputs.map(select=>select.value):input.value);}catch(error){status.textContent=error.message;status.hidden=false;input.setAttribute('aria-invalid','true');return;}
      const changed=!same(value,current.openValue);record.value=record.model.mode==='region'?current.draft.slice():copy(value);paintValue(record);close(false);if(changed&&available(record))options.emit(record.element,'change',{value:record.model.mode==='selector'?String(value):copy(value)});
    });
    current.syncTheme=()=>{if(active!==current||current.closed)return;const value=readTheme(),changed=current.dark!==(value==='dark');current.dark=value==='dark';for(const name of ['data-now-picker-theme','data-weui-theme'])if(dialog.getAttribute(name)!==value)dialog.setAttribute(name,value);dialog.style.colorScheme=value;input.style.colorScheme=value;if(changed)for(const wheel of current.wheels)for(const item of wheel.items)item.style.color=current.dark?'#ededed':'rgba(0,0,0,.9)';};
    if(typeof root.MutationObserver==='function'&&document.documentElement){current.themeObserver=new root.MutationObserver(current.syncTheme);const settings={attributes:true,subtree:true,attributeFilter:['data-weui-theme']};current.themeObserver.observe(document.documentElement,settings);for(let element=record.element;element;){const scope=element.getRootNode?.();if(!scope?.host)break;current.themeObserver.observe(scope,settings);element=scope.host;}}
    current.resize=()=>{if(active===current){present(current);current.syncTheme();}};root.addEventListener?.('resize',current.resize);root.addEventListener?.('now-native-environment',current.resize);present(current);
    try{document.body.append(dialog);dialog.showModal();renderWheels(current);current.syncTheme();(current.compact?current.wheels[0]?.element:current.inputs[0]||input)?.focus?.();}catch(error){close(false);throw error;}
  }
  function create(element,tag){if(tag!=='picker')return;const record={element,model:{mode:'selector',labels:[],value:0,disabled:true},value:0,signature:null,initial:undefined};const click=event=>{Promise.resolve().then(()=>{if(records.get(element)===record)open(record,event);}).catch(error=>options.report?.(error));},keyboard=event=>{if(!event.defaultPrevented&&['Enter',' '].includes(event.key)){event.preventDefault();click({type:'click'});}};record.click=click;record.keyboard=keyboard;records.set(element,record);element.addEventListener('click',click);element.addEventListener('keydown',keyboard);element.setAttribute('role','button');element.setAttribute('aria-haspopup','dialog');element.setAttribute('aria-expanded','false');}
  function patch(element,node){
    const record=records.get(element);if(!record)return;
    const previous=record.model,model=normalize(node.attrs);const header=node.attrs['header-text'];if(header!==undefined&&(typeof header!=='string'||!header||header.length>128||/[\x00-\x1f\x7f]/.test(header)))fail('picker.header-text需要1–128字符字符串');if(header!==undefined)model.header=header;const signature=JSON.stringify(model),changed=signature!==record.signature,forced=node.forced?.includes('value');record.model=model;
    const current=active?.record===record?active:null;
    if(current){
      if(['multiSelector','region'].includes(model.mode)&&model.mode===previous.mode&&available(record)){
        current.draft=model.columns.map((column,i)=>Math.min(forced||!same(model.value[i],previous.value[i])?model.value[i]:(current.draft[i]??model.value[i]),Math.max(0,column.length-1)));
        current.signature=signature;renderMulti(current);
      }else if(changed||forced||!available(record))close(false);
    }
    if(changed||forced)record.value=copy(model.value);record.signature=signature;
    if(record.initial===undefined||record.initialMode!==model.mode||record.initialFields!==model.fields){record.initial=copy(record.value);record.initialMode=model.mode;record.initialFields=model.fields;}
    element.disabled=model.disabled;element.setAttribute('aria-disabled',String(model.disabled));if(node.attrs.tabindex===undefined)element.setAttribute('tabindex',model.disabled?'-1':'0');paintValue(record);
  }
  function reset(element){const record=records.get(element);if(!record)return;if(active?.record===record)close(false);if(record.model.mode==='region'){let items=regionData;record.value=[];for(let i=0;i<record.model.count;i++){record.model.columns[i]=items.map(item=>item.name);const initial=record.initial[i],position=(initial===-1||!items.length)&&record.model.custom?-1:Math.min(Math.max(0,initial||0),Math.max(0,items.length-1));record.value.push(position);items=position>=0?items[position]?.children||[]:[];}paintValue(record);return;}record.value=['multiSelector','region'].includes(record.model.mode)?record.model.columns.map((column,i)=>{const initial=record.initial[i];if(initial===-1)return record.model.custom?-1:0;return Math.min(initial??0,Math.max(0,column.length-1));}):record.model.mode==='selector'?Math.min(record.initial,Math.max(0,record.model.labels.length-1)):record.initial===''?'':record.initial<record.model.min?record.model.min:record.initial>record.model.max?record.model.max:record.initial;paintValue(record);}
  function remove(element){const record=records.get(element);if(!record)return;if(active?.record===record)close(false,false);element.removeEventListener('click',record.click);element.removeEventListener('keydown',record.keyboard);records.delete(element);}
  return{create,patch,reset,flush(){if(active&&!available(active.record))close(false);},value:element=>{const record=records.get(element);return record?publicValue(record):undefined;},remove,ownsEvent:(tag,name)=>tag==='picker'&&['change','cancel','columnchange'].includes(name),visibility(value){visible=value;if(!value)close(false);},dispose(){disposed=true;close(false);for(const element of [...records.keys()])remove(element);}};
}

module.exports = createPickerRuntime;
