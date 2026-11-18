'use strict';
// The same application-authored tree/listener operations run in each adapter.
function cases(build){
 const results={};
 function event(name,source,settings,options={}){
  const tree=build(options),trace=[];
  for(const label of ['wrap','host','inner','slot','other','other-slot','leaf','projected','projected-child'])for(const capture of [true,false]){
   tree.listen(label,capture,record=>trace.push([capture?'capture':'bubble',record.currentTarget,record.target]),options.stop===label&&options.stopCapture===capture);
  }
  if(options.reassigned)tree.reassignSlot('tail');if(options.unmatched)tree.reassignSlot('missing');if(options.removeSlot)tree.removeSlot();if(options.restoreSlot)tree.restoreSlot();if(options.restore)tree.reassignSlot(options.named?'head':'');
  tree.trigger(source,settings);results[name]={trace};tree.dispose();
 }
 event('internal-local-bubble','leaf',{bubbles:true});
 event('internal-composed-retarget','leaf',{bubbles:true,composed:true});
 event('internal-capture-and-bubble','leaf',{bubbles:true,composed:true,capturePhase:true});
 event('capture-without-bubbling','leaf',{capturePhase:true,composed:true});
 event('target-only-default','leaf',{});
 event('slotted-local-owner-path','projected',{bubbles:true});
 event('slotted-composed-slot-path','projected',{bubbles:true,composed:true});
 event('slotted-capture-retarget','projected',{bubbles:true,composed:true,capturePhase:true});
 event('named-slot-local-owner','projected',{bubbles:true},{named:true});
 event('named-slot-composed','projected',{bubbles:true,composed:true},{named:true});
 event('virtual-host-local-owner','projected',{bubbles:true},{virtual:true});
 event('virtual-host-composed-retarget','leaf',{bubbles:true,composed:true,capturePhase:true},{virtual:true});
 event('catch-internal-bubble','leaf',{bubbles:true,composed:true,capturePhase:true},{stop:'inner',stopCapture:false});
 event('catch-ancestor-capture','leaf',{bubbles:true,composed:true,capturePhase:true},{stop:'wrap',stopCapture:true});
 event('catch-projected-capture','projected',{bubbles:true,composed:true,capturePhase:true},{stop:'slot',stopCapture:true});
 event('slot-reassignment-alternate-path','projected',{bubbles:true,composed:true,capturePhase:true},{named:true,reassigned:true});
 event('slot-reassignment-restored-path','projected',{bubbles:true,composed:true,capturePhase:true},{named:true,reassigned:true,restore:true});
 event('unmatched-local-owner','projected',{bubbles:true},{unmatched:true});
 event('unmatched-composed-isolated','projected',{bubbles:true,composed:true,capturePhase:true},{unmatched:true});
 event('unmatched-capture-isolated','projected',{composed:true,capturePhase:true},{unmatched:true});
 event('unmatched-descendant-composed','projected-child',{bubbles:true,composed:true,capturePhase:true},{unmatched:true});
 event('unmatched-descendant-local','projected-child',{bubbles:true},{unmatched:true});
 event('virtual-unmatched-composed','projected',{bubbles:true,composed:true,capturePhase:true},{virtual:true,unmatched:true});
 event('virtual-unmatched-local','projected',{bubbles:true},{virtual:true,unmatched:true});
 event('slot-removal-local','projected',{bubbles:true},{removeSlot:true});
 event('slot-removal-composed','projected',{bubbles:true,composed:true,capturePhase:true},{removeSlot:true});
 event('slot-restoration-composed','projected',{bubbles:true,composed:true,capturePhase:true},{removeSlot:true,restoreSlot:true});
 return results;
}
module.exports={cases};
