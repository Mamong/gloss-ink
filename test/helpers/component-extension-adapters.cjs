'use strict';
function current(core){
 const engine=core.createComponentEngine(),controllers=[];
 const port={snapshot:value=>JSON.parse(JSON.stringify(value)),inputResult:value=>typeof value==='string'?value:undefined,limits:{nodes:12000}};
 return {
  behavior:definition=>engine.Behavior(definition),
  create(definition){const controller=engine.create(definition,'extension/component',{attached:()=>false},{},{},()=>{},()=>{});controllers.push(controller);return controller.instance;},
  generic({override=false,forward=false}={}){
   const aliases={holder:'generic/holder',red:'generic/red',blue:'generic/blue'},defs={'generic/holder':{},'generic/bridge':{},'generic/red':{data:{kind:'red'}},'generic/blue':{data:{kind:'blue'}}};
   const registry=core.createInstanceRegistry({engine,port,usingComponents:{'generic/page':aliases,'generic/holder':{bridge:'generic/bridge'}},componentGenerics:{'generic/holder':{item:{default:'generic/red'}},'generic/bridge':{item:{}}},resolveComponent:source=>defs[source]});
   const page=registry.registerPage({data:{},change(){}},'generic/page');
   const create=(ownerId,nodeId,source,attrs={})=>registry.driver.request({version:1,ownerId,method:'component.create',value:{nodeId,key:nodeId,source,attrs,dataset:{}}});
   try{let host=create(page.id,'n1','generic/holder',override?{'generic:item':'blue'}:{});if(forward)host=create(host.id,'n2','generic/bridge',{'generic:item':'item'});const leaf=create(host.id,'n3',host.generics.item);return registry.driver.request({version:1,ownerId:leaf.id,method:'data'}).kind;}finally{registry.destroy(page.id);}
  },
  relation(options={}){
   const trace=[],definitions={},records=new Map(),tree=new Map();let revision=0,sequence=0;
   const parentTrait=engine.Behavior({}),childTrait=engine.Behavior({});
   const parentKey=options.trait?'children':'./child',childKey=options.trait?'parent':'./parent';
   const hooks=key=>Object.fromEntries(['linked','linkChanged','unlinked'].map(hook=>[hook,function(target){trace.push([hook,this.id,target.id]);}]));
   definitions['extension/parent']={behaviors:[parentTrait],relations:{[parentKey]:{type:options.ancestor?'descendant':'child',...(options.trait?{target:childTrait}:{}),...hooks(parentKey)}}};
   definitions['extension/child']={behaviors:[childTrait],relations:options.unpaired?{}:{[childKey]:{type:options.ancestor?'ancestor':'parent',...(options.trait?{target:parentTrait}:{}),...hooks(childKey)}}};
   definitions['extension/plain']={};
   const aliases={parent:'extension/parent',child:'extension/child',plain:'extension/plain'};
   const registry=core.createInstanceRegistry({engine,port,usingComponents:{'extension/page':aliases},resolveComponent:source=>definitions[source]});
   const page=registry.registerPage({data:{},change(){},setView(){}},'extension/page');
   registry.driver.connect(page.id,{destroy(){}});
   const request=(method,value)=>registry.driver.request({version:1,ownerId:page.id,method,value});
   function commit(moved=[]){const nodes=[];function walk(parentId){for(const [label,node]of tree)if(node.parent===parentId){nodes.push({nodeId:node.nodeId,parentNodeId:parentId?tree.get(parentId).nodeId:null,tag:node.kind,componentId:node.id,elementId:label,classes:[]});walk(label);}}walk(null);request('tree.commit',{revision:++revision,nodes,moved});}
   return {
    add(label,kind,parent=null,before=null){
     const nodeId='n'+(++sequence),d=request('component.create',{nodeId,source:aliases[kind],key:label,attrs:{id:label},dataset:{}});
     registry.driver.connect(d.id,{render:()=>({settled:true}),markChanges(){},destroy(){}});
     const record={id:d.id,nodeId,kind,parent};records.set(label,record);tree.set(label,record);
     if(before){const entries=[...tree];tree.clear();for(const[k,v]of entries){if(k===before)tree.set(label,record);if(k!==label)tree.set(k,v);}}
     commit();request('component.attach',{id:d.id,connected:true});
    },
    move(label,parent,before=null){const record=tree.get(label);record.parent=parent;tree.delete(label);const entries=[...tree];tree.clear();for(const[k,v]of entries){if(k===before)tree.set(label,record);tree.set(k,v);}if(!tree.has(label))tree.set(label,record);request('component.move',{id:record.id});commit([record.nodeId]);},
    remove(label){const record=tree.get(label);request('component.destroy',{id:record.id});tree.delete(label);commit();},
    capture(){return {trace:trace.splice(0),nodes:Object.fromEntries([...tree].filter(([,node])=>node.kind!=='plain'&&!(options.unpaired&&node.kind==='child')).map(([label,node])=>[label,registry.select(page.id,'#'+label,false).getRelationNodes(node.kind==='parent'?parentKey:childKey).map(target=>target.id)]))};},
    dispose(){registry.destroy(page.id);}
   };
  },dispose(){for(const controller of controllers)controller.destroy();}
 };
}
module.exports={current};
