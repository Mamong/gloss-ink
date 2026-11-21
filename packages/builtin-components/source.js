'use strict';
const runtime={...require('./index'),createMediaFrames:require('./media-frames')};
// Only the registry/attribute implementation is needed by this browser factory closure.
const names=['createBuiltinCatalog','createBuiltinRegistry','patchProgress','createBrowserAttributes','createMediaFrames','createFunctionalPageNavigator','createBrowserComponents'];
module.exports=()=>'(function(){'+names.map(name=>'const '+name+'=('+runtime[name].toString()+');').join('\n')+'return createBrowserComponents;})()';
