'use strict';
const ComponentError = require('./error');

function createComponentSelector(error = message => new ComponentError(message, {code: 'INVALID_ARGUMENT'})) {
  function parse(selector) {
    if (typeof selector !== 'string' || !selector.trim() || selector.length > 256 || /[^A-Za-z0-9_#.*>\s-]/.test(selector)) throw error('组件查询仅支持标签、id、class、后代及直接子级选择器');
    const source = selector.trim(), tokens = source.replace(/\s*>\s*/g, ' > ').split(/\s+/), parts = []; let relation = ' ';
    for (const token of tokens) {
      if (token === '>') { if (!parts.length || relation === '>') throw error('组件选择器无效'); relation = '>'; continue; }
      if (!/^(?:[A-Za-z][A-Za-z0-9_-]*|\*)?(?:[.#][A-Za-z0-9_-]+)*$/.test(token) || !token) throw error('组件选择器无效');
      const tag = /^(?:[A-Za-z][A-Za-z0-9_-]*|\*)/.exec(token)?.[0];
      const ids = [...token.matchAll(/#([A-Za-z0-9_-]+)/g)].map(match => match[1]);
      if (ids.length > 1) throw error('组件选择器无效');
      parts.push({tag, id: ids[0], classes: [...token.matchAll(/\.([A-Za-z0-9_-]+)/g)].map(match => match[1]), relation}); relation = ' ';
    }
    if (tokens.at(-1) === '>') throw error('组件选择器不能以 > 结束');
    return parts;
  }
  function matchesNode(node, parts, nodes) {
    const atom=(node,part)=>!!node&&(!part.tag||part.tag==='*'||part.tag===node.tag)&&(!part.id||node.elementId===part.id)&&part.classes.every(name=>node.classes.includes(name));
    let current=node,index=parts.length-1;if(!atom(current,parts[index]))return false;
    while(index>0){const direct=parts[index].relation==='>';index--;current=nodes.get(current.parentNodeId);if(direct){if(!atom(current,parts[index]))return false;}else{while(current&&!atom(current,parts[index]))current=nodes.get(current.parentNodeId);if(!current)return false;}}
    return true;
  }
  return {parse, matchesNode};
}

module.exports = createComponentSelector;
