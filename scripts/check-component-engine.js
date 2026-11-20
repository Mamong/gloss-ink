'use strict';
const fs=require('node:fs'),path=require('node:path'),acorn=require('acorn');
function walk(node,visit){if(!node||typeof node!=='object')return;visit(node);for(const value of Object.values(node))if(Array.isArray(value))value.forEach(item=>walk(item,visit));else if(value&&typeof value==='object')walk(value,visit);}
function checkDeclarations(directory,metadata){
 const canonical=file=>file.split(path.sep).join('/');
 const files=new Set(metadata.files.map(canonical));
 for(const file of metadata.files){
  if(!file.endsWith('.d.ts'))continue;
  const full=path.join(directory,file),text=fs.readFileSync(full,'utf8');
  const imports=[...text.matchAll(/\bfrom\s*['"]([^'"]+)['"]|\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)|\bimport\s*['"]([^'"]+)['"]/g)];
  for(const match of imports){
   const request=match[1]||match[2]||match[3];
   if(!request.startsWith('.'))throw new Error('Component declaration has an external dependency: '+file+' -> '+request);
   const resolved=path.resolve(path.dirname(full),request),relative=path.relative(directory,resolved);
   if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('Component declaration escapes its package: '+file+' -> '+request);
   const candidates=[relative,relative+'.d.ts',path.join(relative,'index.d.ts')];
   if(!candidates.some(target=>files.has(canonical(target))&&fs.existsSync(path.join(directory,target))))throw new Error('Component declaration imports an unpackaged file: '+file+' -> '+request);
  }
 }
}
function check(){
 require('./build-component-ports.cjs').main({check:true});
 const sourceRoot=path.resolve(__dirname,'../packages');
 const modules=['component-engine','component-backend','component-backend-dom','builtin-components','template-compiler','stylesheet-compiler'];
 for(const name of modules){
  const directory=path.join(sourceRoot,name),metadata=require(path.join(directory,'package.json'));
  if(!metadata.name.startsWith('@tingtalk/'))throw new Error('Component package identity changed: '+name);
  const dependencies={...metadata.dependencies,...metadata.peerDependencies};
  const backendDependency=name==='component-backend-dom'?'@tingtalk/component-backend':undefined;
  if(!name.endsWith('-compiler')&&Object.keys(dependencies).some(request=>request!==backendDependency||dependencies[request]!==require(path.join(sourceRoot,'component-backend/package.json')).version))throw new Error('Runtime component modules must not import SDK or external packages: '+name);
  checkDeclarations(directory,metadata);
  for(const file of metadata.files){
   const full=path.join(directory,file);if(!fs.existsSync(full))throw new Error('Missing component package file: '+name+'/'+file);
   if(!file.endsWith('.js'))continue;
   const source=fs.readFileSync(full,'utf8');
   walk(acorn.parse(source,{ecmaVersion:'latest'}),node=>{
    if(node.type==='MemberExpression'&&node.object.type==='Identifier'){
     const object=node.object.name;
     const property=node.computed?node.property.value:node.property.name;
     if(name==='builtin-components'&&['webkit','messageHandlers'].includes(property))throw new Error('Builtin controller contains a native bridge: '+file);
     if(['sdk','NowApp'].includes(object))throw new Error('Component module depends on SDK: '+name+'/'+file);
     if(['component-engine','component-backend'].includes(name)&&['window','document'].includes(object))throw new Error('Component core depends on DOM: '+file);
    }
    if(node.type!=='CallExpression'||node.callee.type!=='Identifier'||node.callee.name!=='require')return;
    const request=node.arguments[0]?.value;
    if(typeof request!=='string')throw new Error('Dynamic component dependency: '+name+'/'+file);
    if(request.startsWith('.')){if(!request.startsWith('./')||path.relative(directory,path.resolve(path.dirname(full),request)).startsWith('..'))throw new Error('Component module imports outside its package: '+name+'/'+file+' -> '+request);}
    else if(!(request===backendDependency&&dependencies[request])&&(!name.endsWith('-compiler')||!request.startsWith('node:')&&!dependencies[request]))throw new Error('Undeclared component dependency: '+name+'/'+file+' -> '+request);
   });
  }
 }
 return require(path.join(sourceRoot,'component-engine/package.json'));
}
function main(){check();console.log('Component core, generic/DOM backends, builtins and compiler dependency checks passed');}
if(require.main===module)try{main();}catch(error){console.error(error.message);process.exitCode=1;}
module.exports={check,main,checkDeclarations};
