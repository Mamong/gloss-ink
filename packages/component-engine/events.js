'use strict';
function createLogicalEvents() {
 // Local events follow the declaring tree; null marks an unmatched projection and ends the composed path.
 function ancestors(source,composed=true){const path=[],seen=new Set();for(let current=source;current&&!seen.has(current);){seen.add(current);path.push(current);if(composed&&current.projectedParent===null)break;const next=(composed?current.projectedParent:null)||current.logicalParent||current.eventView.parent?.();if(!composed&&next&&next.eventView!==current.eventView)break;current=next;}return path;}
 function key(binding){return binding.name+':'+binding.capture+':'+binding.stop+(binding.mut?':mut':'');}
 function route(source,name,detail,settings={},original={}){
  const path=ancestors(source,!!settings.composed);
  let stopped=false,mutated=false;
  const deliver=(node,capture)=>{if(stopped||!node.eventView.live())return;for(const binding of node.events||[]){if(binding.name!==name||binding.capture!==capture||!binding.handler||binding.mut&&mutated)continue;const target=source.eventView===node.eventView?source:path.find(item=>item.eventView===node.eventView)||node;node.eventView.send(node,binding,detail,target,original);settings.onHandle?.();if(binding.mut)mutated=true;if(binding.stop){stopped=true;original.stopPropagation?.();if(name==='touchmove')original.preventDefault?.();break;}}};
  if(settings.capturePhase)for(const node of [...path].reverse())deliver(node,true);
  for(const node of settings.bubbles?path:[source])deliver(node,false);
  return !stopped;
 }
 return {path:ancestors,key,route};
}
module.exports = createLogicalEvents;
