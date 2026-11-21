function matchesViewport(attrs,width,height,ErrorType) {
 'use strict';
 const fail=message=>{throw new ErrorType(message,{code:'INVALID_ARGUMENT'});};
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<0||height<0)fail('match-media视口尺寸无效');
 let matches=true;
 for(const dimension of ['width','height']){
  const current=dimension==='width'?width:height,values={};
  for(const key of [dimension,'min-'+dimension,'max-'+dimension])if(attrs[key]!==undefined){const value=Number(attrs[key]);if(!['string','number'].includes(typeof attrs[key])||attrs[key]===''||!Number.isFinite(value)||value<0||value>1000000)fail('match-media尺寸需要0–1000000的像素数');if(value!==0)values[key]=value;}
  if(values['min-'+dimension]!==undefined&&values['max-'+dimension]!==undefined&&values['min-'+dimension]>values['max-'+dimension])fail('match-media最小尺寸不能超过最大尺寸');
  if(values[dimension]!==undefined&&current!==values[dimension]||values['min-'+dimension]!==undefined&&current<values['min-'+dimension]||values['max-'+dimension]!==undefined&&current>values['max-'+dimension])matches=false;
 }
 if(attrs.orientation!==undefined&&attrs.orientation!==''){if(!['portrait','landscape'].includes(attrs.orientation))fail('match-media.orientation仅支持portrait/landscape');if((width>height?'landscape':'portrait')!==attrs.orientation)matches=false;}
 return matches;
}

module.exports = matchesViewport;
