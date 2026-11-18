'use strict';
// Use the public engine factory; no SDK, iframe fixture or platform error adapter.
function current(core) {
 const engine=core.createComponentEngine(),controllers=[];
 return {
  create(definition,attrs) {
   const controller=engine.create(definition,'components/semantic-case',{attached:()=>false},attrs,{},()=>{},()=>{});
   controllers.push(controller);
   return controller.instance;
  },
  dispose(){for(const controller of controllers)controller.destroy();}
 };
}
module.exports={current};
