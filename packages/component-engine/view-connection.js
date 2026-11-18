"use strict";
const ComponentError = require('./error');
function createViewConnection(backend) {
  if(!backend||typeof backend.render!=='function')throw new ComponentError('组件后端需要 render 接口',{code:'VIEW_RENDER'});
  const connection=Object.create(backend);
  connection.render=function(){
    const receipt=backend.render();
    if(receipt!=null&&(typeof receipt!=='object'||typeof receipt.settled!=='boolean'||!receipt.settled&&typeof receipt.done?.then!=='function'))throw new ComponentError('组件后端返回了无效的提交回执',{code:'VIEW_RENDER'});
    return receipt;
  };
  // Backend methods retain their original receiver and connection state.
  for(const key of ['markChanges','destroy','select','pageLifetime'])if(typeof backend[key]==='function')connection[key]=(...args)=>backend[key](...args);
  return connection;
}
module.exports = createViewConnection;
