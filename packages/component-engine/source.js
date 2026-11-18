"use strict";
// Build-time serialization only. The emitted runtime needs no module loader or eval.
const runtime = require('./index');
module.exports = function source() {
  return '(function(){"use strict";\n' + Object.entries(runtime).map(([name,value]) => 'const '+name+' = ('+value.toString()+');').join('\n') +
    '\nreturn Object.freeze({'+Object.keys(runtime).join(',')+'});})()';
};
