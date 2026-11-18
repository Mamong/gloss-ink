'use strict';
const path=require('node:path'),{execFileSync}=require('node:child_process'),postcss=require('postcss');
const version=require('less').version.join('.');
function createLessCompiler({read,exists,diagnostic,root,common,records=[]}){
 const cache=new Map();
 const offset=(source,line,column)=>{const lines=source.split('\n');return lines.slice(0,Math.max(0,line-1)).reduce((n,item)=>n+item.length+1,0)+Math.max(0,column);};
 function compile(output){
  if(cache.has(output)){const value=cache.get(output);for(const file of value.files)read(file,true);return value.css;}
  const entry=output.slice(0,-5)+'.less',content=read(entry);if(content===null)return null;
  const files=Object.create(null);files[entry]=content;
  const commonFile=common?.();let shared;
  if(commonFile&&commonFile!==entry){if(exists(commonFile)){shared=commonFile;files[shared]=read(shared);}else diagnostic('warning','LESS_COMMON_FILE_MISSING',entry,0,'配置的公共Less不存在，未注入：'+commonFile);}
  let result;const deadline=Date.now()+8000;
  for(let attempt=0;attempt<32;attempt++){
   if(Date.now()>=deadline){result={error:{message:'Less编译累计超过8秒',file:entry},pending:[]};break;}
   if(Object.keys(files).length>64||Object.values(files).reduce((n,text)=>n+Buffer.byteLength(text||''),0)>2*1024*1024){result={error:{message:'Less输入超过64个文件或2MiB',file:entry},pending:[]};break;}
   try{result=JSON.parse(execFileSync(process.execPath,['--max-old-space-size=128',path.join(__dirname,'less-worker.js')],{input:JSON.stringify({entry,files,...(shared?{common:shared}:{})}),encoding:'utf8',timeout:Math.max(1,Math.min(7500,deadline-Date.now())),killSignal:'SIGKILL',maxBuffer:8*1024*1024,stdio:['pipe','pipe','pipe']}));}
   catch(error){result={error:{message:error.code==='ETIMEDOUT'?'Less编译超过7.5秒':'Less编译器失败或输出超限',file:entry},pending:[]};}
   if(!result.error)break;
   let added=false;
   for(const candidates of result.pending||[]){
    const safe=candidates.filter(file=>typeof file==='string'&&!path.posix.isAbsolute(file)&&!file.split('/').includes('..')&&!/[\0\\]/.test(file));
    const selected=safe.find(file=>exists(file));
    if(selected&&!Object.hasOwn(files,selected)){const source=read(selected);if(source!==null){files[selected]=source;added=true;}}
    else if(!selected&&safe[0])read(safe[0]);
   }
   if(!added)break;
   if(attempt===31)result={error:{message:'Less导入超过32轮',file:entry},pending:[]};
  }
  if(result?.error||!result?.css&&result?.css!==''){
   const error=result?.error||{message:'Less导入层数超过32层',file:entry};const file=Object.hasOwn(files,error.file)?error.file:entry;
   diagnostic('error','LESS_COMPILE',file,offset(files[file]||'',Math.max(1,(error.line||1)-(shared&&file===entry?1:0)),error.column||0),error.message);
   cache.set(output,{css:null,files:Object.keys(files)});records.push({source:entry,expected:output,output,status:'failed',compiler:'less@'+version,imports:Object.keys(files).filter(file=>file!==entry)});return null;
  }
  let input;
  if(result.map){const map=JSON.parse(result.map);map.sourceRoot=root();input=new postcss.Input(result.css,{from:path.join(root(),output),map:{prev:map}});}
  const record={css:result.css,files:Object.keys(files),input,prefixLines:result.prefixLines||0,entry,sourceFiles:files};cache.set(output,record);
  records.push({source:entry,expected:output,output,status:'compiled',compiler:'less@'+version,imports:Object.keys(files).filter(file=>file!==entry)});return record.css;
 }
 function location(file,index){
  const value=cache.get(file);if(!value?.input)return null;
  const before=value.css.slice(0,index),line=before.split('\n').length,column=before.length-before.lastIndexOf('\n');
  const origin=value.input.origin(line,column);if(!origin?.file)return null;
  const original=path.relative(root(),origin.file).split(path.sep).join('/');if(!Object.hasOwn(value.sourceFiles,original))return null;
  const originalLine=Math.max(1,origin.line-(original===value.entry?value.prefixLines:0));
  return{file:original,offset:offset(value.sourceFiles[original],originalLine,origin.column-1)};
 }
 return{compile,location,records,generated:()=>[...cache.keys()]};
}
module.exports={createLessCompiler};
