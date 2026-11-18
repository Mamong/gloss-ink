'use strict';
function cases(adapter){
 const results={},copy=value=>JSON.parse(JSON.stringify(value));
 function relation(name,options,setup,change){const tree=adapter.relation(options);try{setup(tree);const initial=tree.capture();if(change){change(tree);results[name]={initial,updated:tree.capture()};}else results[name]=initial;}finally{tree.dispose();}}
 const siblings=t=>{t.add('p','parent');for(const id of ['a','b','c'])t.add(id,'child','p');};
 relation('relation-parent-child',{},siblings);
 relation('relation-rotate',{},siblings,t=>t.move('c','p','a'));
 relation('relation-prepend',{},siblings,t=>t.add('x','child','p','a'));
 relation('relation-remove',{},siblings,t=>t.remove('a'));
 relation('relation-reparent',{},t=>{t.add('p','parent');t.add('q','parent');t.add('a','child','p');},t=>t.move('a','q'));
 relation('relation-nearest-ancestor',{ancestor:true},t=>{t.add('p','parent');t.add('q','parent','p');t.add('a','child','q');});
 relation('relation-ancestor-through-component',{ancestor:true},t=>{t.add('p','parent');t.add('middle','plain','p');t.add('a','child','middle');});
 relation('relation-parent-component-boundary',{},t=>{t.add('p','parent');t.add('middle','plain','p');t.add('a','child','middle');});
 relation('relation-missing-reciprocal',{unpaired:true},siblings);
 relation('relation-behavior-target',{trait:true},siblings,t=>t.move('c','p','a'));
 {
  const a=adapter.behavior({data:{nested:{a:1,shared:'a'}}}),b=adapter.behavior({data:{nested:{b:2,shared:'b'}}});
  results['behavior-object-merge']=copy(adapter.create({behaviors:[a,b],data:{nested:{own:3}}}).data);
 }
 {
  const a=adapter.behavior({data:{items:[1,2]}}),b=adapter.behavior({data:{items:[3]}});results['behavior-array-merge']=copy(adapter.create({behaviors:[a,b]}).data);
 }
 {
  const a=adapter.behavior({properties:{value:{type:Number,value:1}},methods:{choose(){return 'a';}}}),b=adapter.behavior({properties:{value:{type:Number,value:2}},methods:{choose(){return 'b';}}});
  const node=adapter.create({behaviors:[a,b],properties:{value:{type:Number,value:3}},methods:{choose(){return 'component';}}});
  results['behavior-property-method-precedence']={data:copy(node.data),method:node.choose()};
 }
 {
  const trace=[],base=adapter.behavior({lifetimes:{created(){trace.push('base');}}});
  const left=adapter.behavior({behaviors:[base],lifetimes:{created(){trace.push('left');}}}),right=adapter.behavior({behaviors:[base],lifetimes:{created(){trace.push('right');}}});
  const node=adapter.create({behaviors:[left,right],lifetimes:{created(){trace.push('component');}}});
  results['behavior-diamond']={trace,has:[node.hasBehavior(base),node.hasBehavior(left),node.hasBehavior(right)]};
 }
 {
  const trace=[],callback=()=>trace.push('same'),a=adapter.behavior({lifetimes:{created:callback},observers:{value:callback}}),b=adapter.behavior({lifetimes:{created:callback},observers:{value:callback}});
  const node=adapter.create({behaviors:[a,b],data:{value:0}});node.setData({value:1});results['behavior-shared-callback']=trace;
 }
 {
  const trace=[],a=adapter.behavior({observers:{value(value){trace.push(['a',value]);}}}),b=adapter.behavior({observers:{value(value){trace.push(['b',value]);}}});
  const node=adapter.create({behaviors:[a,b],data:{value:0},observers:{value(value){trace.push(['component',value]);}}});node.setData({value:2});results['behavior-observer-chain']=trace;
 }

 {
  const token=adapter.behavior({data:{nested:{count:1},items:[1]}}),a=adapter.create({behaviors:[token]}),b=adapter.create({behaviors:[token]});a.data.nested.count=9;a.data.items.push(2);results['behavior-instance-isolation']=copy(b.data);
 }
 for(const [name,options]of [['generic-default',{}],['generic-override',{override:true}],['generic-forward-default',{forward:true}],['generic-forward-override',{forward:true,override:true}]])results[name]=adapter.generic(options);
 return copy(results);
}
module.exports={cases};
