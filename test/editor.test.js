'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {JSDOM} = require('jsdom');
const tools = vm.runInNewContext('(' + require('./helpers/builtin-source.cjs').readSource('selector-query.js') + ')()');
const createEditor = vm.runInNewContext('(' + require('./helpers/builtin-source.cjs').readSource('weapp-editor.js') + ')');
const plain = value => JSON.parse(JSON.stringify(value));
function fixture(t, props = {}) {
  const dom = new JSDOM('<body><section id="editor"></section></body>', {pretendToBeVisual: true});
  t.after(() => dom.window.close());
  const root = dom.window, element = root.document.getElementById('editor'), events = [], errors = [];
  const runtime = createEditor(root, {scope: 'test', Error: class extends Error { constructor(message, settings) { super(message); Object.assign(this, settings); } }, live: () => true, emit: (_node, name, detail) => events.push({name, detail: plain(detail)}), asset: src => src.startsWith('nowfile:') ? 'https://host.test/image.png' : src, createContext: execute => tools.editorContext(execute, error => errors.push(error))});
  runtime.create(element, 'editor');
  const node = {tag: 'editor', element, attrs: props}; runtime.patch(element, node); runtime.identify(element, 1); runtime.flush();
  const context = element.weappEditorContext, body = element.firstChild;
  const call = (name, settings = {}) => new Promise((resolve, reject) => context[name]({...settings, success: value => resolve(plain(value)), fail: reject}));
  t.after(() => runtime.dispose());
  return {dom, root, runtime, element, body, events, errors, context, call, node};
}
test('EditorContext queries return the same handle and fire ready only once', async t => {
  const f = fixture(t); f.runtime.flush();
  const result = tools.measure(f.root, f.root.document.body, [{selector: '#editor', all: false, viewport: false, fields: {context: true}}]);
  assert.equal(result[0].context, f.context);
  assert.deepEqual(f.events.map(event => event.name), ['ready']);
  let operations;
  const q = tools.create({scope: 1, live: () => true, execute: (_scope, values) => { operations = values; return [{context: f.context}]; }});
  assert.equal((await q.select('#editor').context().exec())[0].context, f.context);
  assert.equal(operations[0].fields.context, true);
});
test('content Delta wins over HTML, roundtrips embeds, and callbacks run success before complete', async t => {
  const f = fixture(t), callbacks = [];
  await new Promise(resolve => f.context.setContents({delta: {ops: [{insert: 'hello', attributes: {bold: true}}, {insert: '\n'}]}, html: '<p>ignored</p>', success: value => callbacks.push(value.errMsg), complete: value => { callbacks.push(value.errMsg); resolve(); }}));
  const result = await f.call('getContents');
  assert.equal(result.text, 'hello\n'); assert.match(result.html, /font-weight:bold/);
  assert.deepEqual(result.delta.ops[0], {insert: 'hello', attributes: {bold: true}});
  assert.deepEqual(callbacks, ['setContents:ok', 'setContents:ok']);
  const returned = await f.call('getContents'); returned.delta.ops[0].insert = 'mutated'; assert.equal((await f.call('getContents')).text, 'hello\n');
});
test('HTML imports strip executable markup and retain block and inline styles', async t => {
  const f = fixture(t);
  await f.call('setContents', {html: '<div id="x" class="bad" onclick="bad()"><b>Hello</b><img src="javascript:alert(1)" onerror="bad()"><script>bad()</script></div><p style="text-align:center"><i>world</i></p>'});
  const result = await f.call('getContents');
  assert.equal(result.text, 'Hello\nworld\n'); assert.doesNotMatch(result.html, /script|onclick|onerror|javascript|class=/i);
  assert.match(result.html, /text-align:center/); assert.match(result.html, /font-style:italic/);
});
test('selection replacement, range deletion, history and format changes preserve document positions', async t => {
  const f = fixture(t); await f.call('setContents', {delta: {ops: [{insert: 'abcdef\n'}]}});
  await f.call('setSelection', {index: 1, length: 3}); assert.equal((await f.call('getSelectionText')).text, 'bcd');
  await f.call('insertText', {text: 'XY'}); assert.equal((await f.call('getContents')).text, 'aXYef\n');
  assert.deepEqual((await f.call('getSelection')).range, {index: 3, length: 0});
  assert.equal((await f.call('getHistoryState')).canUndo, true);
  await f.call('undo'); assert.equal((await f.call('getContents')).text, 'abcdef\n');
  await f.call('redo'); assert.equal((await f.call('getContents')).text, 'aXYef\n');
  await f.call('deleteText', {index: 1, length: 2}); assert.equal((await f.call('getContents')).text, 'aef\n');
  await f.call('setSelection', {index: 0, length: 1}); f.context.format('bold'); await f.call('getContents');
  assert.match((await f.call('getContents')).html, /font-weight:bold/);
  assert.ok(f.events.some(event => event.name === 'statuschange' && event.detail.bold));
  await f.call('removeFormat'); assert.doesNotMatch((await f.call('getContents')).html, /font-weight/);
  await f.call('blur'); assert.equal((await f.call('getSelectionText')).text, '');
});
test('image handles stay in Delta while displayed images use resolved URLs', async t => {
  const f = fixture(t);
  await f.call('insertImage', {src: 'nowfile://test/image.png', width: '120px', height: '50%', data: {id: 7}, nowrap: true});
  const result = await f.call('getContents');
  assert.equal(result.delta.ops[0].insert.image, 'nowfile://test/image.png');
  assert.equal(result.delta.ops[0].attributes['data-local'], 'nowfile://test/image.png');
  assert.equal(f.body.querySelector('img').getAttribute('src'), 'https://host.test/image.png');
  assert.match(result.html, /data-custom="id=7"/);
});
test('portal content mounts in its embed, survives repaint and restores from stored Delta', async t => {
  const f = fixture(t), inserted = await f.call('insertCustomBlock', {nowrap: true});
  const portal = f.root.document.createElement('div'); f.element.append(portal);
  f.runtime.create(portal, 'editor-portal'); portal.innerHTML = '<button>counter 1</button>';
  f.runtime.patch(portal, {tag: 'editor-portal', attrs: {key: inserted.blockId}, logicalParent: f.node}); f.runtime.flush();
  const button = portal.firstChild;
  assert.equal(portal.parentElement.getAttribute('data-custom-block'), inserted.blockId); assert.equal(portal.hidden, false);
  const snapshot = (await f.call('getContents')).delta;
  assert.equal(snapshot.ops[0].insert.customBlock.blockId, inserted.blockId);
  await f.call('setContents', {delta: snapshot}); assert.equal(portal.firstChild, button); assert.equal(portal.hidden, false);
  await f.call('clear'); assert.equal(portal.hidden, true);
  await f.call('undo'); assert.equal(portal.hidden, false); assert.equal(portal.firstChild, button);
  f.runtime.remove(portal); portal.remove(); assert.doesNotMatch((await f.call('getContents')).html, /counter 1/);
});
test('native typing emits once, preserves browser selection and defers composition until commit', async t => {
  const f = fixture(t); f.body.focus(); f.events.length = 0;
  f.body.dispatchEvent(new f.root.CompositionEvent('compositionstart', {bubbles: true}));
  f.body.innerHTML = '<p>中</p>'; f.body.dispatchEvent(new f.root.InputEvent('input', {bubbles: true}));
  assert.equal(f.events.length, 0);
  f.body.dispatchEvent(new f.root.CompositionEvent('compositionend', {bubbles: true}));
  assert.equal(f.events.filter(event => event.name === 'input').length, 1);
  assert.equal((await f.call('getContents')).text, '中\n');
});
test('read-only edits and invalid arguments fail through fail and complete callbacks', async t => {
  const f = fixture(t, {'read-only': true});
  await f.call('setContents', {delta: {ops: [{insert: 'loaded\n'}]}});
  await assert.rejects(f.call('insertText', {text: 'blocked'}), value => value.errCode === 'INVALID_ARGUMENT');
  assert.equal(f.body.getAttribute('contenteditable'), 'false');
  const callbacks = [];
  await new Promise(resolve => f.context.setSelection({index: -1, fail: value => callbacks.push(value.errMsg), complete: value => { callbacks.push(value.errMsg); resolve(); }}));
  assert.equal(callbacks.length, 2); assert.match(callbacks[0], /^setSelection:fail/);
  assert.throws(() => f.context.clear({success: true}), {code: 'INVALID_ARGUMENT'});
});
test('disposed contexts fail without invoking stale callbacks or retaining editor DOM', async t => {
  const f = fixture(t); f.runtime.remove(f.element);
  await assert.rejects(f.call('getContents'), value => value.errCode === 'PAGE_UNLOADED');
  assert.equal(f.element.weappEditorContext, undefined); assert.equal(f.errors.length, 0);
});
test('collapsed formats apply to subsequent typing and enable-formats blocks disabled shortcuts', async t => {
  const f = fixture(t, {'enable-formats': ['bold']});
  await f.call('setSelection', {index: 0}); f.context.format('bold'); await f.call('getContents');
  const input = new f.root.InputEvent('beforeinput', {inputType: 'insertText', data: 'A', bubbles: true, cancelable: true});
  f.body.dispatchEvent(input); assert.equal(input.defaultPrevented, true);
  assert.equal((await f.call('getContents')).delta.ops[0].attributes.bold, true);
  f.body.dispatchEvent(new f.root.KeyboardEvent('keydown', {key: 'i', ctrlKey: true, bubbles: true, cancelable: true}));
  assert.equal(f.events.some(event => event.name === 'statuschange' && event.detail.italic), false);
});
test('image controls use initialization flags, resize the image and remove it through editor history', async t => {
  const f = fixture(t, {'show-img-toolbar': true, 'show-img-size': true, 'show-img-resize': true});
  await f.call('insertImage', {src: 'nowfile://test/image.png', nowrap: true});
  f.body.querySelector('img').click();
  const toolbar = f.element.querySelector('.weapp-editor-image-tools'); assert.equal(toolbar.hidden, false);
  const width = toolbar.querySelector('input'); width.value = '60'; width.dispatchEvent(new f.root.Event('input', {bubbles: true}));
  assert.equal((await f.call('getContents')).delta.ops[0].attributes.width, '60%');
  f.body.append(f.root.document.createTextNode('typed')); f.body.dispatchEvent(new f.root.InputEvent('input', {bubbles: true}));
  assert.equal((await f.call('getContents')).delta.ops[0].insert.image, 'nowfile://test/image.png');
  toolbar.querySelector('button').click(); assert.equal(f.body.querySelector('img'), null);
  await f.call('undo'); assert.ok(f.body.querySelector('img'));
  f.node.attrs = {}; f.runtime.patch(f.element, f.node); assert.equal(f.element.querySelector('.weapp-editor-image-tools'), toolbar);
});
test('disabled confirmation hold blurs on Enter while page hide prevents input and ready is not repeated', async t => {
  const f = fixture(t, {'confirm-hold': false}); f.body.focus();
  const event = new f.root.KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true});
  f.body.dispatchEvent(event); assert.equal(event.defaultPrevented, true); assert.notEqual(f.root.document.activeElement, f.body);
  const count = f.events.length; f.runtime.visibility(false); f.body.innerHTML = '<p>hidden</p>'; f.body.dispatchEvent(new f.root.InputEvent('input', {bubbles: true}));
  assert.equal(f.events.length, count); assert.equal((await f.call('getContents')).text, '\n');
  f.runtime.visibility(true); f.runtime.flush(); assert.equal(f.events.filter(event => event.name === 'ready').length, 1);
});
test('portal inputs retain their own paste and keyboard behavior without editing the document', async t => {
  const f = fixture(t), inserted = await f.call('insertCustomBlock', {nowrap: true});
  const portal = f.root.document.createElement('div'); f.element.append(portal); f.runtime.create(portal, 'editor-portal');
  const input = f.root.document.createElement('input'); portal.append(input);
  f.runtime.patch(portal, {attrs: {key: inserted.blockId}, logicalParent: f.node}); f.runtime.flush();
  f.context.format('bold'); await f.call('getContents'); input.focus();
  const before = (await f.call('getContents')).delta;
  for (const event of [new f.root.InputEvent('beforeinput', {inputType:'insertText',data:'local',bubbles:true,cancelable:true}), new f.root.Event('paste', {bubbles:true,cancelable:true}), new f.root.KeyboardEvent('keydown', {key:'z',ctrlKey:true,bubbles:true,cancelable:true})]) {
    input.dispatchEvent(event); assert.equal(event.defaultPrevented, false);
  }
  assert.deepEqual((await f.call('getContents')).delta, before);
});
test('empty paragraphs and trailing blank lines keep exact Delta selection indices', async t => {
  const f = fixture(t); await f.call('setContents', {delta: {ops: [{insert: 'a\n\nb\n\n'}]}});
  for (let index = 0; index < 6; index++) {
    await f.call('setSelection', {index});
    assert.deepEqual((await f.call('getSelection')).range, {index, length: 0}, 'caret at ' + index);
  }
  await f.call('setSelection', {index: 2}); await f.call('insertText', {text: 'blank'});
  assert.equal((await f.call('getContents')).text, 'a\nblank\nb\n\n');
});
test('changing API selection inherits the new text format and resetting content clears pending styles', async t => {
  const f = fixture(t);
  await f.call('setContents', {delta: {ops: [{insert: 'bold', attributes: {bold: true}}, {insert: ' plain\n'}]}});
  await f.call('setSelection', {index: 1});
  await f.call('insertText', {text:'B'});
  // Context insertions inherit the style at the explicit selection.
  const first = await f.call('getContents'); assert.match(first.text, /B/); assert.equal(first.delta.ops[0].attributes.bold, true);
  await f.call('setSelection', {index: first.text.length - 1});
  f.context.format('italic'); await f.call('getContents');
  await f.call('setContents', {delta:{ops:[{insert:'reset\n'}]}});
  await f.call('insertText', {text:'clean'});
  assert.equal((await f.call('getContents')).delta.ops[0].attributes, undefined);
});
test('unrelated view flushes do not replace a live IME selection', async t => {
  const f = fixture(t); await f.call('setSelection', {index: 0});
  f.body.dispatchEvent(new f.root.CompositionEvent('compositionstart', {bubbles:true}));
  f.body.innerHTML = '<p>正在输入</p>';
  const text = f.body.firstChild.firstChild, range = f.root.document.createRange(); range.setStart(text, 4); range.collapse(true);
  const selection = f.root.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  f.runtime.prepare(f.element); f.runtime.flush();
  assert.equal(selection.anchorNode, text); assert.equal(selection.anchorOffset, 4);
  f.body.dispatchEvent(new f.root.CompositionEvent('compositionend', {bubbles:true}));
  assert.equal((await f.call('getContents')).text, '正在输入\n');
});
test('formatting a whole line does not include the next paragraph at the selection boundary', async t => {
  const f = fixture(t); await f.call('setContents', {delta:{ops:[{insert:'a\nb\n'}]}});
  await f.call('setSelection', {index:0,length:2}); f.context.format('align', 'center');
  const content = await f.call('getContents');
  assert.deepEqual(content.delta.ops, [{insert:'a'}, {insert:'\n',attributes:{align:'center'}}, {insert:'b\n'}]);
});
test('style toggles remove equivalent imported CSS while retaining other text decorations', async t => {
  const f = fixture(t);
  await f.call('setContents', {html:'<p><span style="font-weight:700;font-style:italic;text-decoration:underline line-through">styled</span></p>'});
  await f.call('setSelection', {index:0,length:6});
  f.context.format('bold'); f.context.format('italic'); f.context.format('underline');
  const content = await f.call('getContents');
  assert.doesNotMatch(content.html, /font-weight|font-style|underline/); assert.match(content.html, /line-through/);
});
test('two editors in one view attach identical portal keys to their own document', async t => {
  const f = fixture(t), second = f.root.document.createElement('section'); second.id = 'second'; f.root.document.body.append(second);
  f.runtime.create(second, 'editor'); const secondNode = {tag:'editor',element:second,attrs:{}}; f.runtime.patch(second, secondNode); f.runtime.identify(second, 2);
  const callSecond = (method, settings={}) => new Promise((resolve,reject) => second.weappEditorContext[method]({...settings,success:resolve,fail:reject}));
  const delta = {ops:[{insert:{custom:'shared'}},{insert:'\n'}]};
  await f.call('setContents', {delta}); await callSecond('setContents', {delta});
  const controls = [];
  for (const owner of [f.node, secondNode]) {
    const portal = f.root.document.createElement('div'); owner.element.append(portal); f.runtime.create(portal, 'editor-portal');
    const control = f.root.document.createElement('input'); portal.append(control); controls.push(control);
    f.runtime.patch(portal, {attrs:{key:'shared'},logicalParent:owner});
  }
  f.runtime.flush();
  assert.equal(f.body.contains(controls[0]), true); assert.equal(f.body.contains(controls[1]), false);
  assert.equal(second.firstChild.contains(controls[1]), true);
  await f.call('clear'); assert.equal(controls[0].parentElement.hidden, true); assert.equal(controls[1].parentElement.hidden, false);
  assert.deepEqual(plain((await callSecond('getContents')).delta), {ops:[{insert:{customBlock:{blockId:'shared',editorId:1}}},{insert:'\n'}]});
});
test('collapsed style toggles force plain typing and survive a subsequent block format', async t => {
  const f = fixture(t);
  await f.call('setContents', {delta:{ops:[{insert:'bold',attributes:{bold:true}},{insert:'\n'}]}});
  await f.call('setSelection', {index:1}); f.context.format('bold'); await f.call('getContents');
  const event = new f.root.InputEvent('beforeinput', {inputType:'insertText',data:'P',bubbles:true,cancelable:true}); f.body.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.ok((await f.call('getContents')).delta.ops.some(op => op.insert === 'P' && op.attributes === undefined));
  await f.call('setContents', {delta:{ops:[{insert:'\n'}]}}); await f.call('setSelection', {index:0});
  f.context.format('bold'); f.context.format('align','center'); await f.call('getContents');
  f.body.dispatchEvent(new f.root.InputEvent('beforeinput', {inputType:'insertText',data:'B',bubbles:true,cancelable:true}));
  const result = await f.call('getContents'); assert.equal(result.delta.ops[0].attributes.bold, true);
  assert.equal(result.delta.ops.at(-1).attributes.align, 'center');
});
