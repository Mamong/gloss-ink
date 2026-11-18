"use strict";
function createProjectionPlanner() {
  function assign(slot, nodes, previous = [], identity = value => value) {
    const name=String(slot.attrs?.name||''),assigned=nodes.filter(node=>String(node.attrs?.slot||'')===name);
    const retained=new Set(assigned.map(identity));
    return {assigned,released:previous.filter(node=>!retained.has(identity(node)))};
  }
  function link(slot,nodes){for(const node of nodes)node.projectedParent=slot;}
  function release(node,slot,current=node){
    if(current.projectedParent&&current.projectedParent!==slot)return false;
    node.projectedParent=null;current.projectedParent=null;return true;
  }
  function prepare(nodes){for(const node of nodes)node.projectedParent=null;}
  return {assign,link,release,prepare};
}
module.exports = createProjectionPlanner;
