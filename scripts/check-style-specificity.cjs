'use strict';
// Browser assertions cover cascade outcomes, not serialized selector strings.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const args=process.argv.slice(2),option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const output=path.resolve(option('--out','/tmp/gloss-style-specificity-results'));
const baseline=option('--baseline',null),sources=[{name:'corrected',root:path.resolve(__dirname,'../packages')},...(baseline?[{name:'baseline',root:path.resolve(baseline,'packages')}]:[])];
fs.mkdirSync(output,{recursive:true});
(async()=>{
 let browser,server;const report={startedAt:new Date().toISOString(),runs:[]};
 try{
  server=http.createServer((req,res)=>res.end('<!doctype html><meta charset="utf-8"><title>CSS cascade regression</title>'));
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined)});
  const page=await browser.newPage({viewport:{width:390,height:850}});await page.goto('http://127.0.0.1:'+server.address().port);
  for(const source of sources){
   const compiler=require(path.join(source.root,'stylesheet-compiler')).createStylesheetCompiler({tags:['view','text','button','input']}),diagnostics=[],run={name:source.name,cases:[]};
   const compile=(css,scope,settings={})=>compiler.compile(['page.wxss'],()=>css,()=>'',(...entry)=>diagnostics.push(entry),scope,[],settings);
   const render=async(css,body)=>page.setContent('<!doctype html><meta charset="utf-8"><style>'+css+'</style>'+body);
   const style=(selector,pseudo)=>page.locator(selector).evaluate((node,pseudo)=>{const s=getComputedStyle(node,pseudo||null);return {color:s.color,background:s.backgroundColor,fontSize:s.fontSize,fontWeight:s.fontWeight,width:s.width,height:s.height};},pseudo);
   async function check(name,fn){try{await fn();run.cases.push({name,passed:true});}catch(error){run.cases.push({name,passed:false,error:error.message});}}
   await check('Route scoping does not outrank a stronger authored selector',async()=>{
    await render('button.btn{color:blue}'+compile('.btn{color:red}','[data-weapp-route="a"]'),'<section class="weapp-page" data-weapp-route="a"><button class="btn" id="a">A</button></section>');assert.equal((await style('#a')).color,'rgb(0, 0, 255)');
   });
   await check('Mounted and hidden pages keep local styles separate',async()=>{
    await render(compile('.btn{color:red}','[data-weapp-route="a"]')+compile('.btn{color:blue}','[data-weapp-route="b"]'),'<section class="weapp-page" data-weapp-route="a" id="page-a"><button class="btn" id="a">A</button></section><section class="weapp-page" data-weapp-route="b" id="page-b"><button class="btn" id="b">B</button></section>');assert.equal((await style('#a')).color,'rgb(255, 0, 0)');assert.equal((await style('#b')).color,'rgb(0, 0, 255)');await page.locator('#page-a').evaluate(n=>n.hidden=true);await page.locator('#page-a').evaluate(n=>n.hidden=false);assert.equal((await style('#a')).color,'rgb(255, 0, 0)');
   });
   await check('Page global/local order and child inheritance remain intact',async()=>{
    const global=compile('page{font-size:18px;line-height:1.8;color:red}.label{font-size:21px}','[data-weapp-route="a"]'),local=compile('page{font-size:20px;color:blue}','[data-weapp-route="a"]');await render('.weapp-page{font-size:16px}'+global+local,'<section class="weapp-page" data-weapp-route="a" id="a"><span id="inherited">Text</span><span class="label" id="label">Label</span></section>');assert.equal((await style('#a')).fontSize,'20px');assert.equal((await style('#inherited')).color,'rgb(0, 0, 255)');assert.equal((await style('#label')).fontSize,'21px');
   });
   await check('Owner guards do not outrank a stronger selector',async()=>{
    await render('div.local{color:blue}'+compiler.owned('.local{color:red}','one'),'<div class="local" data-weapp-owner="one" id="a">A</div>');assert.equal((await style('#a')).color,'rgb(0, 0, 255)');
   });
   await check('Owner guards still separate instances and compound descendants',async()=>{
    await render(compiler.owned('.local > .child{color:red}','one'),'<div class="local" data-weapp-owner="one"><span class="child" data-weapp-owner="one" id="a">A</span><span class="child" data-weapp-owner="two" id="b">B</span></div><div class="local" data-weapp-owner="two"><span class="child" data-weapp-owner="two" id="c">C</span></div>');assert.equal((await style('#a')).color,'rgb(255, 0, 0)');assert.notEqual((await style('#b')).color,'rgb(255, 0, 0)');assert.notEqual((await style('#c')).color,'rgb(255, 0, 0)');
   });
   await check('Pseudo-elements keep their original cascade priority',async()=>{
    await render('div.local::before{content:"before";color:blue}'+compiler.owned('.local::before{color:red}','one'),'<div class="local" data-weapp-owner="one" id="a">A</div>');assert.equal((await style('#a','::before')).color,'rgb(0, 0, 255)');
   });
   await check('Functional pseudo-class priority is not amplified by owner guards',async()=>{
    await render('#root div.local{color:blue}'+compiler.owned('.local:is(.x,#never){color:red}','one'),'<section id="root"><div class="local x" data-weapp-owner="one" id="a">A</div></section>');assert.equal((await style('#a')).color,'rgb(0, 0, 255)');
   });
   await check('Keyframes remain local to their route',async()=>{
    const a=compile('.btn{animation:spin 1s}@keyframes spin{from{opacity:0}to{opacity:1}}','[data-weapp-route="a"]'),b=compile('.btn{animation:spin 1s}@keyframes spin{from{opacity:1}to{opacity:0}}','[data-weapp-route="b"]');const name=css=>/@keyframes\s+([^\s{]+)/.exec(css)[1];assert.notEqual(name(a),name(b));await render(a+b,'<section data-weapp-route="a"><button class="btn" id="a">A</button></section><section data-weapp-route="b"><button class="btn" id="b">B</button></section>');const names=await page.evaluate(()=>['a','b'].map(id=>getComputedStyle(document.getElementById(id)).animationName));assert.deepEqual(names,[name(a),name(b)]);
   });
   await check('Shadow DOM default/apply-shared/shared fixtures retain boundaries',async()=>{
    const shared=compiler.owned('.shared{color:red}','shared');await render(shared,'<section id="root"></section>');const values=await page.evaluate(css=>{const result={};for(const mode of ['isolated','apply-shared','shared']){const host=document.createElement('div'),shadow=host.attachShadow({mode:'open'});document.body.append(host);const style=document.createElement('style');style.textContent=mode==='isolated'?'.shared{color:blue}':css;const child=document.createElement('span');child.className='shared';child.dataset.weappOwner=mode==='isolated'?'own':'shared';shadow.append(style,child);result[mode]=getComputedStyle(child).color;}return result;},shared);assert.deepEqual(values,{isolated:'rgb(0, 0, 255)','apply-shared':'rgb(255, 0, 0)',shared:'rgb(255, 0, 0)'});
   });
   await check('Base button width beats a lone custom class without suppressing its height',async()=>{
    const base=fs.readFileSync(path.join(source.root,'builtin-components/styles.css'),'utf8');await render(base+compile('.custom{width:100%;height:44px;line-height:44px}','[data-weapp-route="a"]'),'<section class="weapp-page" data-weapp-route="a"><button class="weapp-button custom" id="a">自定义按钮</button></section>');assert.equal((await style('#a')).width,'184px');assert.equal((await style('#a')).height,'44px');await page.screenshot({path:path.join(output,source.name+'-button.png')});
   });
   run.diagnostics=diagnostics;run.passed=run.cases.every(c=>c.passed);report.runs.push(run);
  }
  assert.equal(report.runs[0].passed,true,'Corrected cascade regression failed');
  if(baseline)assert.ok(report.runs[1].cases.filter(c=>!c.passed).length>=4,'Baseline must reproduce the cascade bugs');
  report.passed=true;report.finishedAt=new Date().toISOString();console.log(JSON.stringify(report,null,2));
 }catch(error){report.passed=false;report.error=error.stack;console.error(error);process.exitCode=1;}
 finally{fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(report,null,2)+'\n');await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));}
})();
