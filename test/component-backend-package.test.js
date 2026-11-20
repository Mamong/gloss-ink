'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'generic-component-backend-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  return directory;
}

test('generic backend runs alone without DOM, SDK, engine, or installed dependencies', t => {
  const directory = temporary(t);
  fs.cpSync(path.join(root, 'packages/component-backend'), path.join(directory, 'backend'), {recursive: true});
  const result = execFileSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    assert.equal(typeof document, 'undefined');
    assert.equal(typeof window, 'undefined');
    const protocol = require('./backend').createViewProtocol();
    let finish;
    const connection = protocol.connect({id:'isolated',route:'page',visible:true,data:{count:0},
      render(){return new Promise(resolve => {finish=resolve;});}});
    const receipt = connection.logic.update({count:1});
    assert.equal(receipt.settled, false);
    finish();
    receipt.done.then(() => {
      assert.equal(connection.receiver.inspect().data.count, 1);
      connection.logic.destroy();
      console.log('isolated backend passed');
    });
  `], {cwd: directory, encoding: 'utf8', env: {...process.env, NODE_PATH: ''}});
  assert.match(result, /isolated backend passed/);
});

test('DOM compatibility exports resolve the single generic protocol implementation', () => {
  const generic = require('../packages/component-backend');
  const dom = require('../packages/component-backend-dom');
  assert.equal(dom.createViewProtocol, generic.createViewProtocol);
  assert.equal(require('../packages/component-backend-dom/protocol'), generic.createViewProtocol);
});

test('generic backend declarations compile with ES2020 alone and accept object or numeric timers', t => {
  const directory = temporary(t);
  fs.cpSync(path.join(root, 'packages/component-backend'), path.join(directory, 'backend'), {recursive: true});
  fs.cpSync(path.join(root, 'packages/component-engine'), path.join(directory, 'engine'), {recursive: true});
  fs.writeFileSync(path.join(directory, 'contracts.ts'), `
    import {createViewProtocol, ProtocolOptions, Receipt} from './backend';
    import {RenderBackend, createViewConnection} from './engine';
    const protocol = createViewProtocol();
    const timer = {cancelled: false};
    const options: ProtocolOptions = {id:'generic',route:'page',data:{},render:()=>Promise.resolve(),
      setTimeout:(callback,ms)=>timer,clearTimeout:(handle:typeof timer)=>{handle.cancelled=true;}};
    const native: RenderBackend = {render:()=>protocol.connect(options).logic.update({count:1})};
    createViewConnection(native).render();
    const numeric: ProtocolOptions = {...options,setTimeout:()=>1,clearTimeout:(handle:number)=>{}};
    protocol.connect(numeric);
    const pending: Receipt = {settled:false,done:Promise.resolve()};
    // @ts-expect-error pending submissions require an acknowledgement promise
    const invalid: Receipt = {settled:false};
    // @ts-expect-error the generic package must not require or expose browser globals
    const browser: Document = document;
  `);
  fs.writeFileSync(path.join(directory, 'tsconfig.json'), JSON.stringify({compilerOptions: {
    strict:true,noEmit:true,target:'ES2020',module:'CommonJS',moduleResolution:'node',lib:['ES2020'],types:[]
  },files:['contracts.ts']}));
  try {execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/lib/tsc.js'), '-p', directory], {cwd:directory,stdio:'pipe'});}
  catch (error) {throw new Error(String(error.stdout || error.message));}
});
