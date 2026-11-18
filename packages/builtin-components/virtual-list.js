function createVirtualLists(root,options){
 'use strict';
 const records=new Map(),buffer=6;let closed=false,pending=null;
 const number=(value,fallback)=>Number.isFinite(Number(value))?Math.max(0,Number(value)):fallback;
 function changed(){if(closed||pending!==null)return;const run=()=>{pending=null;if(!closed)options.invalidate();};if(typeof root.requestAnimationFrame==='function')pending={frame:true,id:root.requestAnimationFrame(run)};else{pending={frame:false};Promise.resolve().then(run);}}
 function calculate(record){
  const viewport=Math.max(1,record.height),height=Math.max(1,record.itemHeight),visible=Math.ceil(viewport/height),total=record.length;
  record.top=Math.min(record.top,Math.max(0,total*height-viewport));
  const start=record.variable?0:Math.min(Math.max(0,Math.floor(record.top/height)-buffer),Math.max(0,total-visible-buffer)),end=record.variable?total:Math.min(total,start+visible+buffer*2);
  return{start,end,top:start*height,bottom:(total-end)*height,length:total,itemHeight:height};
 }
 function range(key,length,attrs={},findIndex,forced=[]){
  let record=records.get(key);if(!record){record={key,length:0,top:0,height:Math.max(1,number(root.innerHeight,640)),itemHeight:64,rows:[],variable:false,target:'',scrollValue:undefined};records.set(key,record);}
  record.length=length;
  if(attrs['scroll-top']!==undefined&&(record.scrollValue!==attrs['scroll-top']||forced.includes('scroll-top'))){record.top=number(attrs['scroll-top'],0);record.offset=record.top;record.scrollValue=attrs['scroll-top'];}
  const target=attrs['scroll-into-view']||'';
  if(target&&(target!==record.target||forced.includes('scroll-into-view'))){const index=findIndex?.(target);if(Number.isInteger(index)&&index>=0&&index<length){const alignment=attrs['scroll-into-view-alignment'];record.top=Math.max(0,index*record.itemHeight-(alignment==='center'?(record.height-record.itemHeight)/2:alignment==='end'?record.height-record.itemHeight:0));record.offset=record.top;}}
  record.target=target;record.range=calculate(record);return record.range;
 }
 function remove(key){const record=records.get(key);if(!record)return;record.element?.removeEventListener('scroll',record.scroll);record.resize?.disconnect();records.delete(key);}
 function attach(key,element,rows){
  const record=records.get(key);if(!record)return;record.rows=rows;
  if(record.element!==element){
   record.element?.removeEventListener('scroll',record.scroll);record.resize?.disconnect();record.element=element;
   record.scroll=()=>{record.top=number(element.scrollTop,0);const next=calculate(record);if(next.start!==record.range?.start||next.end!==record.range?.end)changed();};element.addEventListener('scroll',record.scroll,{passive:true});
   if(typeof root.ResizeObserver==='function'){record.resize=new root.ResizeObserver(()=>measure(record));record.resize.observe(element);}
  }
 }
 function measure(record){
  const element=record.element;if(closed||!element?.isConnected)return;
  const height=Math.max(1,number(element.clientHeight,0)||number(element.getBoundingClientRect?.().height,0)||record.height),sizes=record.rows.map(element=>number(element.getBoundingClientRect?.().height,0)||number(element.offsetHeight,0)).filter(size=>size>0);
  const itemHeight=sizes[0]||record.itemHeight,variable=sizes.some(size=>Math.abs(size-itemHeight)>1),dimensions=height!==record.height||Math.abs(itemHeight-record.itemHeight)>.5||variable!==record.variable;
  record.height=height;record.itemHeight=itemHeight;record.variable=variable;
  if(record.offset!==undefined){record.top=Math.min(record.offset,Math.max(0,record.length*itemHeight-height));element.scrollTop=record.top;record.offset=undefined;}else record.top=number(element.scrollTop,record.top);
  const next=calculate(record);if(dimensions||next.start!==record.range?.start||next.end!==record.range?.end)changed();
 }
 return Object.freeze({range,attach,remove,flush(){for(const record of records.values())measure(record);},dispose(){if(closed)return;closed=true;if(pending?.frame)root.cancelAnimationFrame?.(pending.id);pending=null;for(const key of [...records.keys()])remove(key);}});
}

module.exports = createVirtualLists;
