'use strict';
// Application-authored observations only. Adapters supply the engine and initial-property operation.
function cases(create){
  const results={};
  function observation(name,makeDefinition,initial,action){
    const trace=[],definition=makeDefinition(trace),instance=create(definition,initial);
    action?.(instance,trace);results[name]={trace,data:JSON.parse(JSON.stringify(instance.data))};
  }
  const observed=trace=>({properties:{value:{type:Number,value:0,observer(value,old){trace.push(['property',value,old]);}}},data:{other:0},created(){trace.push(['created',this.data.value]);},observers:{value(value){trace.push(['data',value]);},'value, other'(value,other){trace.push(['multi',value,other]);}}});
  observation('initial-properties',observed,{value:7});
  observation('same-value-data-observer',observed,{value:7},(instance,trace)=>{trace.length=0;instance.setData({value:7});});
  observation('batched-field-observer',observed,{value:7},(instance,trace)=>{trace.length=0;instance.setData({value:8,other:2});});
  const nested=trace=>({data:{items:[{count:0}]},observers:{'items[0].count'(value){trace.push(['nested',value]);},'items.**'(value){trace.push(['subtree',JSON.parse(JSON.stringify(value))]);}}});
  observation('bracket-nested-observer',nested,{},instance=>instance.setData({'items[0].count':2}));
  observation('numeric-dot-path',nested,{},instance=>instance.setData({'items.0.count':2}));
  observation('observer-cascade',trace=>({properties:{value:{type:Number,value:0,observer(value,old){trace.push(['property',value,old]);}}},data:{twice:0},observers:{value(value){trace.push(['data',value]);this.setData({twice:value*2});},twice(value){trace.push(['twice',value]);}}}),{value:3});
  // The first instance must not contaminate a second instance's array/object defaults.
  const definition={properties:{object:{type:Object,value:{count:0}},array:{type:Array,value:[]}},data:{local:{count:0}}};
  const first=create(definition,{});first.data.object.count=9;first.data.array.push(9);first.data.local.count=9;
  const second=create(definition,{});results['instance-default-isolation']={trace:[],data:JSON.parse(JSON.stringify(second.data))};
  return results;
}
module.exports={cases};
