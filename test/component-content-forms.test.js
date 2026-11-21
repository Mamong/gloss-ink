'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),ui=require('../packages/builtin-components');
const serialized=factory=>vm.runInNewContext('('+factory.toString()+')');
function environment(t){const root=new JSDOM('<!doctype html><html><body></body></html>').window;t.after(()=>root.close());return root;}
function textRuntime(root){return serialized(ui.createTextInputRuntime)(root,{Error,scope:'test',styleRoot:root.document.head,style:v=>v,classes:v=>v,live:()=>true,emit(){},invalidate(){},height:()=>''});}
test('serialized text decodes quotes once and keeps explicit breaks independent of CSS whitespace',t=>{
 const root=environment(t),runtime=textRuntime(root),host=root.document.createElement('span'),element=root.document.createTextNode('');host.append(element);root.document.body.append(host);
 const text={tag:'#text',text:'&amp;quot; &quot;\nnext',element},node={tag:'text',attrs:{decode:true},element:host,children:[text]};runtime.flush([node]);
 assert.equal(element.nodeValue,'&quot; "');assert.deepEqual([...host.childNodes].map(n=>n.nodeName),['#text','BR','#text']);assert.equal(host.lastChild.nodeValue,'next');
 text.text='one\n\ntwo';runtime.flush([node]);assert.equal(host.querySelectorAll('br').length,2);text.text='single';runtime.flush([node]);assert.equal(host.childNodes.length,1);runtime.dispose();
});
test('an unrelated text flush preserves live selection endpoints and releases generated siblings',t=>{
 const root=environment(t),runtime=textRuntime(root),host=root.document.createElement('span'),element=root.document.createTextNode('');host.append(element);root.document.body.append(host);const text={tag:'#text',text:'first\nsecond',element},node={tag:'text',attrs:{selectable:true},element:host,children:[text]};runtime.flush([node]);
 const tail=host.lastChild,range=root.document.createRange();range.setStart(tail,1);range.setEnd(tail,4);root.getSelection().addRange(range);runtime.flush([node]);assert.equal(root.getSelection().toString(),'eco');assert.equal(host.lastChild,tail);runtime.flush([]);assert.equal(host.childNodes.length,1);runtime.dispose();
});
test('textarea uses one intrinsic row before auto-height measurement',t=>{
 const root=environment(t),runtime=textRuntime(root),element=root.document.createElement('textarea');root.document.body.append(element);runtime.create(element,{tag:'textarea',attrs:{},element});assert.equal(element.rows,1);runtime.dispose();
});
test('serialized rich-text wraps sanitized content without replacing inline business margins',t=>{
 const root=environment(t),runtime=serialized(ui.createNativeComponents)(root,{Error,live:()=>true,emit(){},asset:v=>v}),element=root.document.createElement('span');root.document.body.append(element);runtime.create(element,'rich-text');runtime.patch(element,{attrs:{nodes:'<p style="margin:5px">safe</p><script>bad</script>'}});
 assert.equal(element.firstChild.className,'weapp-rich-text-root');assert.equal(element.querySelector('p').style.margin,'5px');assert.equal(element.querySelector('script'),null);assert.equal(element.textContent,'safe');runtime.dispose();
});
test('serialized form includes disabled text and selected group items and clears text/choices on reset',t=>{
 const root=environment(t),document=root.document,form=document.createElement('form');document.body.append(form);let changes=0;const runtime=serialized(ui.createFormRuntime)(root,Error,{component:()=>null,picker:{value:()=>0,reset(){}},changed:()=>changes++,scope:'test'});
 const make=(tag,attrs,element=document.createElement(tag==='input'?'input':'div'),children=[])=>({tag,attrs,element,children});
 const input=document.createElement('input');input.value='initial';input.disabled=true;form.append(input);const choice=document.createElement('input');choice.type='checkbox';choice.checked=true;choice.disabled=true;form.append(choice);
 const leaf=make('checkbox',{value:'a'},choice),group=make('checkbox-group',{name:'flags'},undefined,[leaf]),field=make('input',{name:'locked'},input),node=make('form',{},form,[field,group]);runtime.sync([node]);
 const value=runtime.detail(node,new root.Event('submit',{cancelable:true})).value;assert.equal(value.locked,'initial');assert.deepEqual(Array.from(value.flags),['a']);assert.deepEqual(Array.from(runtime.detail(group,{type:'change'}).value),['a']);runtime.detail(node,new root.Event('reset',{cancelable:true}));assert.equal(input.value,'');assert.equal(choice.checked,false);assert.equal(changes,1);
});
test('form reset preserves nested form and custom controller ownership boundaries',t=>{
 const root=environment(t),document=root.document,outer=document.createElement('form'),inner=document.createElement('form'),field=document.createElement('input'),custom=document.createElement('div');field.value='nested';inner.append(field);outer.append(inner,custom);document.body.append(outer);const reset=[];const controller={formField:true,id:'custom',name:'custom',value:{count:2}};
 const runtime=serialized(ui.createFormRuntime)(root,Error,{component:element=>element===custom?controller:null,picker:{value:()=>0,reset(){}},resetField:(...args)=>reset.push(args),scope:'test'}),nodes={tag:'form',attrs:{},element:outer,children:[{tag:'form',attrs:{},element:inner,children:[{tag:'input',attrs:{name:'nested'},element:field,children:[]}]},{tag:'custom',attrs:{},element:custom,children:[]}]};runtime.sync([nodes]);runtime.detail(nodes,new root.Event('reset',{cancelable:true}));assert.equal(field.value,'nested');assert.equal(reset.length,1);assert.equal(reset[0][0],'custom');
});
