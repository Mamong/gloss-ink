'use strict';
// A bounded child process compiles only the text snapshot supplied by the importer.
const fs=require('node:fs'),path=require('node:path').posix,less=require('less');
const virtual='/__now_less__/';
function compile(input){
 const pending=new Map(),loaded=new Set();
 class SnapshotFiles extends less.FileManager {
  supports(){return true;}
  supportsSync(){return true;}
  loadFile(request,currentDirectory,_options,_environment,callback){const result=this.loadFileSync(request,currentDirectory);if(callback){if(result.filename)callback(null,result);else callback(result);return;}return result.filename?Promise.resolve(result):Promise.reject(result);}
  loadFileSync(request,currentDirectory){
   const denied=message=>({type:'File',message});
   if(typeof request!=='string'||/^(?:[a-z]+:|\/\/)/i.test(request)||/[?#\0\\]/.test(request))return denied('Less仅支持项目内静态样式导入');
   let target=path.normalize(request.startsWith(virtual)?request:request.startsWith('/')?virtual+request.slice(1):path.join(currentDirectory||virtual,request));
   if(!target.startsWith(virtual))return denied('Less导入路径不能超出项目');
   target=target.slice(virtual.length);
   const candidates=path.extname(target)?[target]:[target+'.less',target+'.wxss',target+'.css'];
   if(candidates.some(file=>!['.less','.wxss','.css'].includes(path.extname(file))))return denied('Less仅能导入less/wxss/css文件');
   const found=candidates.find(file=>Object.hasOwn(input.files,file));
   if(found){loaded.add(found);return{contents:input.files[found],filename:virtual+found};}
   pending.set(target,candidates);return denied('找不到Less导入：'+request);
  }
 }
 let result,error,called=false;
 const source=(input.common&&input.common!==input.entry?'@import (reference) '+JSON.stringify(virtual+input.common)+';\n':'')+input.files[input.entry];
 // Less can otherwise report plugin/JavaScript failures without the imported
 // source filename. Reject these constructs while the snapshot map is known.
 for(const [file,text] of Object.entries(input.files)){
  const plugin=text.match(/@plugin\s+(?:\([^)]*\)\s*)?(['\"])/);
  if(plugin)return{error:{message:'禁止Less插件',file,line:text.slice(0,plugin.index).split('\n').length,column:plugin.index-(text.lastIndexOf('\n',plugin.index-1)+1)},pending:[],loaded:[...loaded]};
  const javascript=text.match(/`[^`]*`/);
  if(javascript)return{error:{message:'禁止Less JavaScript',file,line:text.slice(0,javascript.index).split('\n').length,column:javascript.index-(text.lastIndexOf('\n',javascript.index-1)+1)},pending:[],loaded:[...loaded]};
 }
 less.render(source,{filename:virtual+input.entry,syncImport:true,javascriptEnabled:false,disablePluginRule:true,math:'parens-division',rewriteUrls:'all',sourceMap:{outputSourceFiles:true,sourceMapBasepath:virtual,sourceMapOutputFilename:'generated.css'},plugins:[{install(_less,manager){manager.addFileManager(new SnapshotFiles());manager.Loader={loadPluginSync(){return{type:'File',message:'禁止Less插件'};},loadPlugin(){return Promise.reject(new Error('禁止Less插件'));},evalPlugin(){throw new Error('禁止Less插件');}};}}]},(failure,output)=>{called=true;error=failure;result=output;});
 if(!called)throw Error('Less编译器未同步完成');
 if(error)return{error:{message:error.message||String(error),file:typeof error.filename==='string'?error.filename.replace(virtual,''):input.entry,line:error.line||1,column:error.column||0},pending:[...pending.values()],loaded:[...loaded]};
 if(result.css.length>2*1024*1024)throw Error('Less输出超过2MiB');
 return{css:result.css.replace(/\n?\/\*# sourceMappingURL=[^*]*\*\//g,''),map:result.map,loaded:[...loaded],prefixLines:input.common&&input.common!==input.entry?1:0};
}
if(require.main===module){try{const input=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(compile(input)));}catch(error){process.stdout.write(JSON.stringify({error:{message:error.message||String(error)},pending:[]}));}}
