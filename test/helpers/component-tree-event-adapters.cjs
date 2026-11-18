'use strict';
function current(core){
 return function build(options={}){
  const tools=core.createLogicalEvents();
  const nodes={};function view(owner){return {owner,live:()=>true,parent:()=>owner==='host'?nodes.host:undefined,send(node,binding,_detail,target){binding.callback({currentTarget:node.attrs.id,target:target.attrs.id});}};}
  const page=view('page'),child=view('host');
  function node(label,eventView,parent){const value={tag:'view',attrs:{id:label},eventView,events:[],logicalParent:parent};nodes[label]=value;return value;}
  node('wrap',page);node('host',page,nodes.wrap);node('inner',child);node('leaf',child,nodes.inner);node('slot',child,nodes.inner);node('other',child);node('other-slot',child,nodes.other);node('projected',page,nodes.host).projectedParent=nodes.slot;node('projected-child',page,nodes.projected);
  // Physical virtual-host placement belongs to DOM integration; this adapter tests the logical boundary.
  return {removeSlot(){nodes.projected.projectedParent=null;},restoreSlot(){nodes.projected.projectedParent=nodes.slot;},reassignSlot(name){nodes.projected.projectedParent=name===(options.named?'head':'')?nodes.slot:name==='tail'?nodes['other-slot']:null;},listen(label,capture,callback,stop){nodes[label].events.push({name:'semantic',capture,handler:'semantic',callback,stop});},trigger(label,settings){tools.route(nodes[label],'semantic',{value:1},settings);},dispose(){}};
 };
}
module.exports={current};
