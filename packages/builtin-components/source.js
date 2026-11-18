'use strict';
const runtime=require('./index');
// Only the registry/attribute implementation is needed by this browser factory closure.
const names=['createBuiltinCatalog','createBuiltinRegistry','patchProgress','createBrowserAttributes','createBrowserComponents'];
module.exports=()=>'(function(){'+names.map(name=>'const '+name+'=('+runtime[name].toString()+');').join('\n')+'return createBrowserComponents;})()';
