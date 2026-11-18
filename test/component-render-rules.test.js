'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const core = require('../packages/component-engine');
const source = require('../packages/component-engine/source');
const {createTemplateCompiler} = require('../packages/template-compiler');
const {createBuiltinCatalog} = require('../packages/builtin-components');
const compiler = createTemplateCompiler(createBuiltinCatalog());
function compile(text) {
  const diagnostics = [];
  const code = compiler.compile(text, 'rules.wxml', (...entry) => diagnostics.push(entry));
  assert.deepEqual(diagnostics, []);
  const lookup = (scope, name) => {for (; scope; scope = Object.getPrototypeOf(scope)) if (Object.hasOwn(scope, name)) return scope[name];};
  const read = (value, name) => value == null ? undefined : value[name];
  return vm.runInThisContext('(' + code + ')')(lookup, read, value => value == null ? '' : String(value));
}
function opaque(tag, identity, key) {
  return Object.freeze({tag, identity, key, get element() {throw new Error('Pure reconciliation read a physical element');}});
}
for (const [name, load] of [['CommonJS', () => core], ['embedded expression without DOM globals', () => vm.runInNewContext(source(), {}, {timeout: 2000})]]) {
  test(name + ': keyed reconciliation preserves survivors and removes obsolete identities first', () => {
    const {plan} = load().createChildReconciler();
    const header = opaque('view', '/header'), a = opaque('counter', undefined, 'a');
    const b = opaque('counter', undefined, 'b'), footer = opaque('text', '/footer');
    const previous = Object.freeze([header, a, b, footer]);
    const next = Object.freeze([opaque('view', '/header'), opaque('counter', undefined, 'b'), opaque('text', undefined, 'a'), opaque('counter', undefined, 'c')]);
    const result = plan(previous, next);
    assert.deepEqual(Array.from(result.removeFirst), [a, footer]);
    assert.deepEqual(Array.from(result.entries, entry => entry.previous), [header, b, undefined, undefined]);
    assert.equal(result.removeLast.length, 0);
    assert.equal(result.entries[1].node, next[1]);
    assert.deepEqual(Array.from(previous), [header, a, b, footer]);
  });
  test(name + ': ordinal fallback never steals a keyed node or matches one instance twice', () => {
    const {plan} = load().createChildReconciler();
    const anonymous = opaque('text'), keyed = opaque('text', undefined, 'a');
    const result = plan([anonymous, keyed], [opaque('text'), opaque('text'), opaque('text', undefined, 'a'), opaque('text', undefined, 'a')]);
    assert.deepEqual(Array.from(result.entries, entry => entry.previous), [anonymous, undefined, keyed, undefined]);
    assert.equal(result.removeFirst.length, 0);
    assert.equal(result.removeLast.length, 0);
    const dropped = plan([opaque('view')], []);
    assert.equal(dropped.removeFirst.length, 0);
    assert.equal(dropped.removeLast.length, 1);
    const obsolete = opaque('view', '/old');
    const anonymousReplacement = plan([obsolete], [opaque('view')]);
    assert.equal(anonymousReplacement.removeFirst[0], obsolete);
    assert.equal(anonymousReplacement.entries[0].previous, undefined);
  });
  test(name + ': compiled template references and conditions expand without inheriting caller scope', () => {
    const template = compile('<template name="summary"><view data-label="{{label}}">{{label}}/{{secret}}</view></template><template is="summary" data="{{label:title}}"/><text wx:if="{{show}}">shown</text><text wx:else>hidden</text>');
    const evaluator = load().createTemplateEvaluator(template);
    const first = evaluator.evaluate({title: 'One', secret: 'private', show: true});
    assert.equal(first.templateCalls, 1);
    assert.equal(first.nodes[0].dataset.label, 'One');
    assert.equal(first.nodes[0].children[0].text, 'One/');
    assert.equal(first.nodes[1].children[0].text, 'shown');
    const second = evaluator.evaluate({title: 'Two', show: false});
    assert.equal(second.templateCalls, 1);
    assert.equal(second.nodes[0].children[0].text, 'Two/');
    assert.equal(second.nodes[1].children[0].text, 'hidden');
  });
  test(name + ': loop identities distinguish value types and force only dependent attributes', () => {
    const template = compile('<view wx:for="{{rows}}" wx:key="id" id="{{item.label}}" data-fixed="constant">{{item.label}}</view>');
    const evaluator = load().createTemplateEvaluator(template);
    const rows = [{id: 1, label: 'number'}, {id: '1', label: 'string'}];
    const first = evaluator.evaluate({rows});
    assert.notEqual(first.nodes[0].key, first.nodes[1].key);
    assert.deepEqual(Array.from(first.nodes[0].forced), []);
    const second = evaluator.evaluate({rows: rows.slice().reverse()}, ['rows']);
    assert.equal(second.nodes[0].key, first.nodes[1].key);
    assert.equal(second.nodes[1].key, first.nodes[0].key);
    assert.deepEqual(Array.from(second.nodes[0].forced), ['id', 'data-fixed']);
    assert.equal(second.nodes[0].children[0].text, 'string');
    const objectLoop = load().createTemplateEvaluator(compile('<view wx:for="{{rows}}" wx:for-index="name" wx:key="__index__">{{name}}:{{item}}</view>'));
    assert.deepEqual(Array.from(objectLoop.evaluate({rows: {a: 4, b: 5}}).nodes, node => node.children[0].text), ['a:4', 'b:5']);
  });
  test(name + ': platform policies choose windows while expansion still validates off-window keys', () => {
    const template = compile('<view><text wx:for="{{rows}}" wx:key="id">{{item.label}}</text></view>');
    const before = {tag: 'spacer', identity: 'before'}, after = {tag: 'spacer', identity: 'after'};
    const evaluator = load().createTemplateEvaluator(template, {element: node => node.tag === 'view' ? {range: {start: 1, end: 2}, before: [before], after: [after]} : undefined});
    const rows = [{id: 'a', label: 'outside'}, {id: 'b', label: 'inside'}, {id: 'c', label: 'outside'}];
    const children = evaluator.evaluate({rows}).nodes[0].children;
    assert.equal(children[0], before); assert.equal(children[2], after);
    assert.equal(children[1].children[0].text, 'inside');
    assert.throws(() => evaluator.evaluate({rows: [rows[0], rows[1], rows[0]]}), /wx:key 重复/);
    const conditional = load().createTemplateEvaluator(compile('<view><text>content</text></view>'), {element: node => node.tag === 'view' ? {flatten: true, prefix: '/chosen'} : undefined});
    assert.equal(conditional.evaluate({}).nodes[0].identity, '/chosen/0');
    const skipped = load().createTemplateEvaluator(template, {element: () => ({skip: true})});
    assert.equal(skipped.evaluate({rows}).nodes.length, 0);
  });
  test(name + ': expansion limits and invalid data fail without poisoning the next evaluation', () => {
    const evaluator = load().createTemplateEvaluator(compile('<template name="recursive"><template is="recursive" data="{{value:value}}"/></template><template is="recursive" data="{{value:value}}"/>'));
    assert.throws(() => evaluator.evaluate({value: 1}), /模板展开超过限制/);
    const invalid = load().createTemplateEvaluator([{kind: 'template', owner: 'file', name: () => 'missing', data: () => ({})}]);
    assert.throws(() => invalid.evaluate({}), /模板未定义/);
    const loop = load().createTemplateEvaluator(compile('<view wx:for="{{rows}}" wx:key="id"/>'));
    assert.throws(() => loop.evaluate({rows: true}), /wx:for 需要数组或对象/);
    assert.throws(() => loop.evaluate({rows: [{id: 1}, {id: 1}]}), /wx:key 重复/);
    assert.equal(loop.evaluate({rows: [{id: 1}]}).nodes.length, 1);
  });
}
