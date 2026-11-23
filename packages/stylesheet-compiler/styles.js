'use strict';
const path = require('node:path').posix;
const {createHash} = require('node:crypto');
const postcss = require('postcss');
const selectors = require('postcss-selector-parser');
const values = require('postcss-value-parser');
const rpxUnits = require('./rpx')();
function createStylesheetCompiler({tags:tagNames=[]}={}){
const tags = new Set(tagNames);
const placeholderProperties=new Set(['color','font-size','font-weight','line-height']);
function placeholderClone(rule,name){
 const declaration=rule.nodes.filter(node=>node.type==='decl'&&placeholderProperties.has(node.prop.toLowerCase()));if(!declaration.length)return null;
 const attr=selectors.attribute({attribute:'data-now-placeholder',operator:'~=',value:name,quoteMark:'"'});attr.setValue(name,{quoteMark:'"'});
 return rule.clone({selector:attr.toString()+'::placeholder',nodes:declaration.map(node=>node.clone())});
}
function compile(entries, read, asset, diagnostic, scope, customTags = [], settings = {}) {
  const origins = new WeakMap();
  function load(file, ancestors = []) {
    if (ancestors.includes(file)) { diagnostic('error', 'WXSS_IMPORT_CYCLE', file, 0, '样式循环引用：' + [...ancestors, file].join(' → ')); return postcss.root(); }
    const source = read(file, true); if (source === null) return postcss.root();
    let root;
    try { root = postcss.parse(source, {from: file}); origins.set(root.source.input, file); }
    catch (error) { diagnostic('error', 'WXSS_SYNTAX', file, 0, error.reason || error.message); return postcss.root(); }
    root.walkAtRules('import', rule => {
      const nodes = values(rule.params).nodes.filter(node => node.type !== 'space' && node.type !== 'comment');
      const first = nodes[0];
      const request = first?.type === 'string' ? first.value : first?.type === 'function' && first.value === 'url' ? values.stringify(first.nodes).replace(/^['"]|['"]$/g, '') : null;
      if (!request || nodes.length !== 1 || /^(?:[a-z]+:|\/\/)/i.test(request)) { diagnostic('error', 'WXSS_IMPORT', file, rule.source.start.offset, '仅支持静态本地 @import，不支持媒体后缀或远程样式'); rule.remove(); return; }
      const target = request.startsWith('/') ? request.slice(1) : path.join(path.dirname(file), request);
      settings.onImport?.(file,target,rule.source.start.offset);
      rule.replaceWith(load(target, [...ancestors, file]).nodes);
    });
    if (ancestors.length) return root;
    const animations = new Map();
    const animationScope=scope||settings.keyframeScope;
    if (animationScope) root.walkAtRules(rule => {
      if (!/keyframes$/i.test(rule.name)) return;
      const parsed = values(rule.params), name = parsed.nodes.find(node => ['word', 'string'].includes(node.type));
      if (!name) return;
      const original = name.value, renamed = 'weapp_' + createHash('sha256').update(animationScope).digest('hex').slice(0, 12) + '_' + original;
      animations.set(original, renamed); name.value = renamed; rule.params = parsed.toString();
    });
    root.walkAtRules(rule => {
      if (rule.name.toLowerCase() === 'charset') { rule.remove(); return; }
      if (/rpx\b/i.test(rule.params)) diagnostic('error', 'WXSS_AT_RULE_RPX', file, rule.source.start.offset, '媒体查询等规则中的 rpx 暂不支持，请改用 px');
    });
    const placeholders=[];root.walkRules(rule=>{if(rule.parent.type==='atrule'&&/keyframes$/i.test(rule.parent.name))return;selectors(tree=>tree.each(selector=>{if(selector.nodes.length!==1||selector.nodes[0].type!=='class')return;const clone=placeholderClone(rule,selector.nodes[0].value);if(clone)placeholders.push([rule,clone]);})).processSync(rule.selector);});for(const[rule,clone]of placeholders)rule.after(clone);
    root.walkRules(rule => {
      if (rule.parent.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
      if(settings.virtualHost&&/:host(?:-context)?\b/.test(rule.selector))diagnostic('error','VIRTUAL_HOST_STYLE',file,rule.source.start.offset,'virtualHost没有可供:host选择的元素；请使用模板内的class');
      if(settings.sharing){let complex=false;selectors(tree=>tree.each(selector=>{const nodes=selector.nodes;if(nodes[0]?.type!=='class'||nodes.slice(1).some(node=>node.type!=='pseudo'||node.nodes?.length))complex=true;})).processSync(rule.selector);if(complex)diagnostic('warning','SHARED_STYLE_SELECTOR',file,rule.source.start.offset,'共享样式只导出简单类及无参数伪类；此复杂规则仍只作用于本模板');}
      try {
        rule.selector = selectors(tree => tree.walkTags(node => {
          if (node.value === 'page') node.replaceWith(selectors.className({value: 'weapp-page'}));
          else if (tags.has(node.value) || customTags.includes(node.value)) node.replaceWith(selectors.className({value: 'weapp-' + node.value}));
        })).processSync(rule.selector);
        if (scope) rule.selector = selectors(tree => tree.each(selector => {
          const page = selector.nodes.find(node => node.type === 'class' && node.value === 'weapp-page');
          // The route boundary must not make authored selectors more specific.
          // Keep the existing page-root selector when it is explicitly addressed.
          const prefix = selectors().astSync(':where(' + scope + ')').nodes[0].nodes;
          if (page) { for (const node of prefix) selector.insertBefore(page, node.clone()); }
          else { selector.prepend(selectors.combinator({value: ' '})); for (const node of [...prefix].reverse()) selector.prepend(node.clone()); }
        })).processSync(rule.selector);
      } catch (error) { diagnostic('error', 'WXSS_SELECTOR', file, rule.source.start.offset, error.message); }
    });
    if (settings.slots) root.walkRules(rule => {
      if (rule.selector.includes('::slotted(') || rule.parent.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
      const projected = [];
      selectors(tree => tree.each(selector => {
        const child = selector.clone(), nodes = child.nodes;
        let last = -1; nodes.forEach((node,index) => { if (node.type === 'combinator') last = index; });
        const leaf = nodes.slice(last + 1), target = leaf[0];
        if (last < 0 || target?.type !== 'class' || !/^weapp-(?:button|navigator|input|text|view)$/.test(target.value) || leaf.slice(1).some(node => node.type !== 'pseudo' || node.nodes?.length)) return;
        target.replaceWith(selectors().astSync('::slotted(.' + target.value + ')').nodes[0].nodes[0]); projected.push(child.toString());
      })).processSync(rule.selector);
      if (projected.length) rule.after(rule.clone({selector: projected.join(',')}));
    });
    root.walkDecls(declaration => {
      const tree = values(declaration.value);
      if (/^(?:-webkit-)?animation(?:-name)?$/i.test(declaration.prop)) tree.walk(node => { if (['word', 'string'].includes(node.type) && animations.has(node.value)) node.value = animations.get(node.value); });
      tree.walk(node => {
        if (node.type === 'function' && node.value.toLowerCase() === 'url') {
          const url = values.stringify(node.nodes).replace(/^['"]|['"]$/g, '');
          if (!url.startsWith('data:')) {
            const from = origins.get(declaration.source.input) || file;
            const data = asset(url, from, declaration.source.start.offset);
            node.nodes = [{type: 'string', quote: '"', value: data || ''}];
          }
          return false;
        }
        if (node.type === 'word' && /^-?(?:\d+(?:\.\d*)?|\.\d+)rpx$/i.test(node.value)) node.value = rpxUnits.css(parseFloat(node.value));
      });
      declaration.value = tree.toString();
    });
    if(settings.owner)return postcss.parse(owned(root.toString(),settings.owner));
    return root;
  }
  return entries.map(file => load(file).toString()).join('\n');
}
function externalRules(css,owner) {
  const root = postcss.parse(css), result = Object.create(null), frames = new Map();
  root.walkAtRules(rule => { if (/keyframes$/i.test(rule.name)) frames.set(rule.params.trim(), rule.toString()); });
  root.walkRules(rule => {
    if (rule.parent.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
    selectors(tree => tree.each(selector => {
      const nodes = selector.nodes;
      if (nodes[0]?.type !== 'class' || nodes.slice(1).some(node => node.type !== 'pseudo' || node.nodes?.length)) return;
      const name = nodes[0].value, clone = rule.clone({selector: selector.toString()}), used = [],placeholder=nodes.length===1?placeholderClone(rule,name):null;
      clone.walkDecls(declaration => { if (/animation(?:-name)?$/i.test(declaration.prop)) values(declaration.value).walk(node => { if (frames.has(node.value)) used.push(frames.get(node.value)); }); });
      let wrapper = clone;
      for (let parent = rule.parent; parent?.type === 'atrule'; parent = parent.parent) wrapper = parent.clone({nodes: [wrapper]});
      (result[name] ||= []).push(wrapper.toString(), ...used);if(placeholder){let extra=placeholder;for(let parent=rule.parent;parent?.type==='atrule';parent=parent.parent)extra=parent.clone({nodes:[extra]});result[name].push(extra.toString());}
    })).processSync(rule.selector);
  });
  if(owner)for(const key of Object.keys(result))result[key]=result[key].map(css=>owned(css,owner));
  return result;
}
function owned(css,owner){
 const root=postcss.parse(css);root.walkRules(rule=>{if(rule.parent.type==='atrule'&&/keyframes$/i.test(rule.parent.name))return;rule.selector=selectors(tree=>tree.each(selector=>{let compound=[];const flush=()=>{if(!compound.length)return;if(!compound.some(node=>node.type==='pseudo'&&/^::?host(?:-context)?$|^::slotted$/.test(node.value))){const attribute=selectors().astSync(':where([data-weapp-owner~="'+owner+'"])').nodes[0].nodes[0].clone();const pseudo=compound.find(node=>node.type==='pseudo'&&node.value.startsWith('::'));if(pseudo)selector.insertBefore(pseudo,attribute);else selector.insertAfter(compound.at(-1),attribute);}compound=[];};for(const node of [...selector.nodes]){if(node.type==='combinator')flush();else compound.push(node);}flush();})).processSync(rule.selector);});return root.toString();
}
return {compile, externalRules, owned};
}
module.exports = {createStylesheetCompiler};
