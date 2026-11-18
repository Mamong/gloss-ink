'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const source = path.resolve(__dirname, '../packages');
const generator = require('../scripts/build-component-ports.cjs');
const {checkDeclarations} = require('../scripts/check-component-engine.js');
function temporary(t) {const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'component-backend-ports-')); t.after(() => fs.rmSync(directory, {recursive: true, force: true})); return directory;}

test('backend declarations typecheck alone with no engine, builtin, SDK, or external declaration packages installed', t => {
  const directory = temporary(t), backend = path.join(directory, 'backend');
  fs.cpSync(path.join(source, 'component-backend-dom'), backend, {recursive: true});
  const fixture = `import {DomBackendConfig, DomEventNode, createComponentViews, createSelectorQueryTools} from './backend';
  declare const config: DomBackendConfig;
  const events=createComponentViews(window,config.logicalEvents());
  const interactions=config.interactions(window,{Error,path:events.path,emit:(node,name,detail,original)=>events.route(node,name,detail,{},original)});
  declare const node: import('./backend').DomElementEventNode;
  interactions.create(node.element,node,'owner');
  const virtual:import('./backend').DomEventNode={tag:'virtual',attrs:{},element:events.range(),eventView:{live:()=>true,classes:String,
    send(source,binding,detail,target,original){source.viewNodeId;target.element;original.changedTouches?.[0]?.clientY;},special(){},detail:()=>({})}};
  events.bind(virtual.element,virtual);
  const editor=config.editorRuntime!(window,{Error,scope:'owner',live:()=>true,emit(){},asset:String,createContext:execute=>config.selectorQuery().editorContext(execute)});
  editor.execute('node','getContents');
  // @ts-expect-error controller assignments must honor both inputs and outputs
  config.pickerRuntime=config.editorRuntime;
  // @ts-expect-error an opaque object is not a complete event backend
  config.componentViews=()=>({});
  // @ts-expect-error factories take declared services rather than SDK objects
  config.textInput=(root,options:{sdk:object})=>{throw new Error();};
  // @ts-expect-error an unsettled submission needs an acknowledgement
  const receipt:import('./backend').Receipt={settled:false};
  const tools=createSelectorQueryTools();
  const canvas=tools.canvasContext(()=>document.createElement('canvas'));
  canvas.fillRect(0,0,10,10);
  // @ts-expect-error canvas operations are typed rather than an unknown catch-all
  canvas.fillRect('x',0,10,10);
  // @ts-expect-error query flags are typed
  tools.fields({size:'yes'});
  // @ts-expect-error results cannot disappear from a query factory
  config.selectorQuery=()=>({selector:String});
  `;
  fs.writeFileSync(path.join(directory, 'ports.ts'), fixture);
  fs.writeFileSync(path.join(directory, 'tsconfig.json'), JSON.stringify({compilerOptions: {strict: true, noEmit: true, target: 'ES2020', module: 'CommonJS', moduleResolution: 'node', lib: ['ES2020', 'DOM'], types: []}, files: ['ports.ts']}));
  const env = {...process.env}; delete env.NODE_PATH;
  try {execFileSync(process.execPath, [path.resolve(__dirname, '../node_modules/typescript/lib/tsc.js'), '--project', path.join(directory, 'tsconfig.json')], {cwd: directory, env, stdio: 'pipe'});} catch (error) {throw new Error(String(error.stdout || error.message));}
});

test('owner declaration changes invalidate bundled backend ports until they are regenerated', t => {
  const directory = temporary(t);
  for (const [owner] of generator.entries) {const target = path.join(directory, owner); fs.mkdirSync(path.dirname(target), {recursive: true}); fs.copyFileSync(path.join(source, owner), target);}
  generator.main({sourceRoot: directory}); generator.main({sourceRoot: directory, check: true});
  fs.appendFileSync(path.join(directory, 'builtin-components/index.d.ts'), '\nexport interface NewServicePort {ready: boolean}\n');
  assert.throws(() => generator.main({sourceRoot: directory, check: true}), /stale/);
  generator.main({sourceRoot: directory}); generator.main({sourceRoot: directory, check: true});
});

test('declaration closure checks reject external, escaping and unpackaged imports', t => {
  const directory = temporary(t), metadata = {files: ['index.d.ts', 'local.d.ts']};
  fs.writeFileSync(path.join(directory, 'local.d.ts'), 'export interface Local {value:string}\n');
  fs.writeFileSync(path.join(directory, 'index.d.ts'), "export type {Local} from './local';\n");
  checkDeclarations(directory, metadata);
  for (const [text, message] of [["import type {Sdk} from '@private/sdk';", /external/], ["import '@private/sdk';", /external/], ["export type Escaped=import('../outside').Value;", /escapes/], ["export type Missing=import('./unpacked').Value;", /unpackaged/]]) {
    fs.writeFileSync(path.join(directory, 'index.d.ts'), text);
    assert.throws(() => checkDeclarations(directory, metadata), message);
  }
});
