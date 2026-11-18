'use strict';
const acorn = require('acorn');
const path = require('node:path');
const wxsCompiler = require('./wxs');
function createTemplateCompiler(builtinCatalog){
const tags = new Set(builtinCatalog.tags),events=new Set(builtinCatalog.events),common=new Set(builtinCatalog.common),properties=builtinCatalog.properties;
const blocked = new Set(['__proto__', 'prototype', 'constructor']);
const literal = value => JSON.stringify(value).replace(/[\u2028\u2029]/g, char => '\\u' + char.charCodeAt(0).toString(16));
function decode(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, entity) => {
    const names = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"};
    if (entity[0] !== '#') return names[entity.toLowerCase()] || whole;
    const point = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : '\ufffd';
  });
}
function expressionEnd(source, start) {
  let quote, escaped = false, depth = 0;
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (quote) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === quote) quote = null; continue; }
    if ('"\'`'.includes(char)) quote = char;
    else if (!depth && source.startsWith('}}', index)) return index;
    else if (char === '{') depth++; else if (char === '}') depth--;
  }
  return -1;
}
function parse(source, file, diagnostic) {
  const roots = [], stack = [{tag: '', children: roots}]; let index = 0, count = 0;
  function error(offset, message) { diagnostic('error', 'WXML_SYNTAX', file, offset, message); }
  while (index < source.length) {
    if (++count > 20000 || stack.length > 128) { error(index, 'WXML 超过节点或嵌套限制'); break; }
    if (source.startsWith('<!--', index)) { const end = source.indexOf('-->', index + 4); if (end < 0) { error(index, '注释未闭合'); break; } index = end + 3; continue; }
    if (source[index] !== '<') {
      const start = index;
      while (index < source.length && source[index] !== '<') {
        if (source.startsWith('{{', index)) { const end = expressionEnd(source, index + 2); if (end < 0) { error(index, '表达式未闭合'); index = source.length; break; } index = end + 2; }
        else index++;
      }
      const value = source.slice(start, index); if (value.trim()) stack.at(-1).children.push({text: value, offset: start});
      continue;
    }
    const start = index;
    const closing = /^<\/([A-Za-z][\w:-]*)\s*>/.exec(source.slice(index));
    if (closing) {
      index += closing[0].length;
      if (stack.length === 1 || stack.at(-1).tag !== closing[1]) error(start, '结束标签不匹配：' + closing[1]); else stack.pop();
      continue;
    }
    const opening = /^<([A-Za-z][\w:-]*)/.exec(source.slice(index));
    if (!opening) { error(index, '无效标签'); index++; continue; }
    index += opening[0].length;
    const node = {tag: opening[1], attrs: {}, children: [], offset: start}; let selfClosing = false;
    while (index < source.length) {
      while (/\s/.test(source[index] || '') && index < source.length) index++;
      if (source.startsWith('/>', index)) { selfClosing = true; index += 2; break; }
      if (source[index] === '>') { index++; break; }
      const attribute = /^([A-Za-z_$][\w:$.-]*)/.exec(source.slice(index));
      if (!attribute) { error(index, '无效属性'); index++; continue; }
      const offset = index, name = attribute[1]; index += name.length;
      while (/\s/.test(source[index] || '') && index < source.length) index++;
      let value = true, valueOffset = index;
      if (source[index] === '=') {
        index++; while (/\s/.test(source[index] || '') && index < source.length) index++;
        const quote = source[index];
        if (quote === '"' || quote === "'") {
          valueOffset = ++index; const end = source.indexOf(quote, index);
          if (end < 0) { error(offset, '属性引号未闭合'); index = source.length; break; }
          value = source.slice(index, end); index = end + 1;
        } else {
          const match = /^[^\s>]+/.exec(source.slice(index)); valueOffset = index;
          if (!match) { error(offset, '缺少属性值'); break; }
          value = match[0].replace(/\/$/, ''); index += value.length;
        }
      }
      if (Object.hasOwn(node.attrs, name)) error(offset, '重复属性 ' + name);
      node.attrs[name] = {value, offset, valueOffset};
    }
    if(node.tag==='wxs'&&!selfClosing){
      node.bodyOffset=index;const closing=/<\/wxs\s*>/g;closing.lastIndex=index;const match=closing.exec(source);
      if(!match){error(start,'wxs标签未闭合');node.raw=source.slice(index);index=source.length;}else{node.raw=source.slice(index,match.index);index=closing.lastIndex;}
      selfClosing=true;
    }
    stack.at(-1).children.push(node);
    if (!selfClosing) stack.push(node);
  }
  for (const node of stack.slice(1)) error(node.offset, '标签未闭合：' + node.tag);
  return roots;
}
function documents(source,file,diagnostic,settings={}) {
  const cache=new Map(),active=new Set(),wxs=settings.wxs||wxsCompiler.createCompiler(settings.read||(()=>null),diagnostic);
  function visit(file,source){
    if(active.has(file)){diagnostic('error','WXML_IMPORT_CYCLE',file,0,'模板引用循环');return null;}if(cache.has(file))return cache.get(file);
    if(cache.size>=128){diagnostic('error','WXML_IMPORT_LIMIT',file,0,'模板文件超过 128 个');return null;}
    active.add(file);const doc={file,nodes:parse(source,file,diagnostic),definitions:new Map(),imports:[]};cache.set(file,doc);
    function annotate(nodes){for(const node of nodes){node.file=file;annotate(node.children||[]);}}annotate(doc.nodes);
    function reference(node){const attr=node.attrs.src;if(!attr||typeof attr.value!=='string'||attr.value.includes('{{')||/^(?:[a-z]+:|\/\/)/i.test(attr.value)||/[\\\0?#]/.test(attr.value)){diagnostic('error','WXML_IMPORT_PATH',file,node.offset,'模板引用需要静态的项目内 WXML 路径');return null;}const target=path.posix.normalize(attr.value.startsWith('/')?attr.value.slice(1):path.posix.join(path.posix.dirname(file),attr.value));if(target.startsWith('../')||!target.endsWith('.wxml')){diagnostic('error','WXML_IMPORT_PATH',file,attr.offset,'模板路径必须位于项目内且为 .wxml');return null;}if(!settings.read){diagnostic('error','WXML_IMPORT_PATH',file,attr.offset,'模板读取器未配置');return null;}const text=settings.read(target);return text===null?null:visit(target,text);}
    function expand(nodes,top){const result=[];for(const node of nodes){
      if(node.tag==='wxs'){if(!top)diagnostic('error','WXS_DECLARATION',file,node.offset,'当前WXS声明仅支持WXML顶层');else wxs.declaration(file,node);continue;}
      if(node.tag==='import'){if(!top||Object.keys(node.attrs).some(key=>key!=='src'))diagnostic('error','WXML_IMPORT',file,node.offset,'import 仅支持顶层静态 src');const target=reference(node);if(target)doc.imports.push(target);continue;}
      if(node.tag==='include'){if(Object.keys(node.attrs).some(key=>key!=='src'))diagnostic('error','WXML_IMPORT',file,node.offset,'include 仅支持静态 src');const target=reference(node);if(target){if(wxs.scopes[target.file]&&Object.keys(wxs.scopes[target.file]).length)diagnostic('error','WXS_INCLUDE_SCOPE',file,node.offset,'当前include不支持包含WXS声明的文件；请使用import/template或在当前文档声明模块');result.push(...target.nodes);}continue;}
      if(node.tag==='template'&&node.attrs.name){const name=node.attrs.name.value;if(!top||typeof name!=='string'||!/^[A-Za-z_][\w-]*$/.test(name)||doc.definitions.has(name))diagnostic('error','WXML_TEMPLATE_NAME',file,node.offset,'模板名无效或重复');else doc.definitions.set(name,{...node,children:expand(node.children,false)});continue;}
      result.push({...node,...(node.children?{children:expand(node.children,false)}:{})});
    }return result;}
    doc.nodes=expand(doc.nodes,true);active.delete(file);settings.onDocument?.(file,[...doc.nodes,...[...doc.definitions.values()].flatMap(node=>node.children)]);return doc;
  }
  const entry=visit(file,source);return {entry,all:[...cache.values()],wxs};
}
function compile(source, file, diagnostic, settings = {}) {
  let sequence = 0,currentFile=file;
  const loaded=documents(source,file,diagnostic,settings);
  function placement(nodes,parent){for(let index=0;index<nodes.length;index++){
    const node=nodes[index];
    if(node.tag==='page-meta'&&(settings.component||parent||index!==0))diagnostic('error','WXML_PAGE_META_POSITION',node.file||file,node.offset,'page-meta 必须是页面的第一个节点');
    if(node.tag==='navigation-bar'&&(parent?.tag!=='page-meta'||index!==0))diagnostic('error','WXML_PAGE_META_POSITION',node.file||file,node.offset,'navigation-bar 必须是 page-meta 的第一个子节点');
    if(parent?.tag==='page-meta'&&node.tag!=='navigation-bar')diagnostic('error','WXML_PAGE_META_CHILD',node.file||file,node.offset,'page-meta 只允许 navigation-bar 子节点');
    if(node.tag!=='template')placement(node.children||[],node);
  }}placement(loaded.entry?.nodes||[],null);
  const identifiers = name => /^[A-Za-z_$][\w$]*$/.test(name) && !blocked.has(name);
  function issue(code, offset, message) { diagnostic('error', code, currentFile, offset, message); }
  function wxsPath(node){
    if(node.type==='Identifier'&&Object.hasOwn(loaded.wxs.scopes[currentFile]||{},node.name))return{name:node.name,path:[]};
    if(node.type==='MemberExpression'){const owner=wxsPath(node.object);if(owner)return {...owner,path:[...owner.path,node.computed?node.property:{type:'Literal',value:node.property.name,start:node.property.start}]};}
    return null;
  }
  function wxsArgs(owner,offset){for(const item of owner.path)if(item.type==='Literal'&&blocked.has(String(item.value)))issue('WXS_MEMBER',offset+(item.start||0),'禁止访问WXS成员 '+item.value);return literal(currentFile)+','+literal(owner.name)+',['+owner.path.map(item=>emit(item,offset)).join(',')+']';}
  function emit(node, offset) {
    if (!node) return 'undefined';
    const owner=wxsPath(node);if(owner)return 'wxs.value('+wxsArgs(owner,offset)+')';
    switch (node.type) {
      case 'Literal': if (node.regex || typeof node.value === 'bigint') break; return literal(node.value);
      case 'Identifier': return node.name === 'undefined' ? 'undefined' : 'lookup(scope,' + literal(node.name) + ')';
      case 'MemberExpression': return 'read(' + emit(node.object, offset) + ',' + (node.computed ? emit(node.property, offset) : literal(node.property.name)) + ')';
      case 'CallExpression': {const owner=wxsPath(node.callee);if(owner&&!node.arguments.some(arg=>arg.type==='SpreadElement'))return 'wxs.call('+wxsArgs(owner,offset)+',['+node.arguments.map(arg=>emit(arg,offset)).join(',')+'])';break;}
      case 'ChainExpression': return emit(node.expression, offset);
      case 'BinaryExpression': if (['in', 'instanceof'].includes(node.operator)) break; return '(' + emit(node.left, offset) + node.operator + emit(node.right, offset) + ')';
      case 'LogicalExpression': return '(' + emit(node.left, offset) + node.operator + emit(node.right, offset) + ')';
      case 'UnaryExpression': if (!['!', '+', '-', '~', 'typeof', 'void'].includes(node.operator)) break; return '(' + node.operator + ' ' + emit(node.argument, offset) + ')';
      case 'ConditionalExpression': return '(' + emit(node.test, offset) + '?' + emit(node.consequent, offset) + ':' + emit(node.alternate, offset) + ')';
      case 'ArrayExpression': if (node.elements.some(item => !item || item.type === 'SpreadElement')) break; return '[' + node.elements.map(item => emit(item, offset)).join(',') + ']';
      case 'ObjectExpression':
        if (node.properties.some(item => item.type !== 'SpreadElement' && (item.type !== 'Property' || item.method || item.kind !== 'init' || item.computed))) break;
        return '({' + node.properties.map(item => item.type==='SpreadElement'?'...'+emit(item.argument,offset):'[' + literal(item.key.name ?? item.key.value) + ']:' + emit(item.value, offset)).join(',') + '})';
      case 'TemplateLiteral': return '(' + node.quasis.map((part, index) => literal(part.value.cooked) + (node.expressions[index] ? '+String(' + emit(node.expressions[index], offset) + ')' : '')).join('+') + ')';
    }
    issue('WXML_EXPRESSION_UNSUPPORTED', offset + node.start, '不支持表达式 ' + node.type + '；仅允许调用当前文档已声明的WXS模块函数，不执行Page函数或赋值'); return 'undefined';
  }
  function expr(value, offset) {
    try {
      const node = acorn.parseExpressionAt(value, 0, {ecmaVersion: 'latest'});
      if (value.slice(node.end).trim()) throw new Error('表达式包含多余内容');
      return emit(node, offset);
    } catch (error) { issue('WXML_EXPRESSION', offset + (error.pos || 0), error.message); return 'undefined'; }
  }
  function rawValue(attribute, raw = false, preserveEntities=false) {
    if (attribute.value === true) return 'scope=>true';
    const input = attribute.value, parts = []; let start = 0;
    while (start < input.length) {
      const opening = input.indexOf('{{', start);
      if (opening < 0) { parts.push({text: preserveEntities?input.slice(start):decode(input.slice(start))}); break; }
      if (opening > start) parts.push({text: preserveEntities?input.slice(start,opening):decode(input.slice(start, opening))});
      const end = expressionEnd(input, opening + 2);
      if (end < 0) { issue('WXML_EXPRESSION', attribute.valueOffset + opening, '表达式未闭合'); break; }
      parts.push({code: expr(decode(input.slice(opening + 2, end)), attribute.valueOffset + opening + 2)}); start = end + 2;
    }
    if (parts.length === 1 && parts[0].code) return 'scope=>' + parts[0].code;
    if (raw && parts.some(part => part.code)) issue('WXML_DIRECTIVE', attribute.offset, '此指令需要单个 {{表达式}}');
    return 'scope=>' + (parts.length ? '[' + parts.map(part => part.code ? 'string(' + part.code + ')' : literal(part.text)).join(',') + '].join("")' : '""');
  }
  function value(attribute, raw, preserveEntities=false) {
    const compiled = rawValue(attribute, raw, preserveEntities), dependencies = [...compiled.matchAll(/lookup\(scope,("(?:\\.|[^"\\])*")\)/g)].map(match => JSON.parse(match[1]));
    return 'Object.assign(' + compiled + ',{dependencies:' + literal([...new Set(dependencies)]) + '})';
  }
  function strip(node, keys) { return {...node, attrs: Object.fromEntries(Object.entries(node.attrs).filter(([key]) => !keys.includes(key)))}; }
  function list(nodes) {
    const result = [];
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index];currentFile=node.file||file;
      if (node.tag && node.attrs['wx:if'] && !node.attrs['wx:for']) {
        const branches = ['{test:' + value(node.attrs['wx:if'], true) + ',nodes:[' + single(strip(node, ['wx:if'])) + ']}'];
        while (nodes[index + 1]?.attrs?.['wx:elif'] || nodes[index + 1]?.attrs?.['wx:else']) {
          const next = nodes[++index], condition = next.attrs['wx:elif'];
          branches.push('{test:' + (condition ? value(condition, true) : 'null') + ',nodes:[' + single(strip(next, ['wx:elif', 'wx:else'])) + ']}');
          if (!condition) break;
        }
        result.push('{kind:"if",branches:[' + branches.join(',') + ']}');
      } else if (node.attrs?.['wx:else'] || node.attrs?.['wx:elif']) issue('WXML_CONDITION', node.offset, 'wx:elif/wx:else 必须紧随 wx:if');
      else result.push(single(node));
    }
    return result.join(',');
  }
  function single(node) {
    currentFile=node.file||file;
    if (Object.hasOwn(node, 'text')) return '{kind:"text",value:' + value({value: node.text, valueOffset: node.offset, offset: node.offset},false,true) + '}';
    const attrs = node.attrs, id = 'n' + (++sequence);
    if (attrs['wx:for']) {
      const item = attrs['wx:for-item']?.value ?? 'item', index = attrs['wx:for-index']?.value ?? 'index';let key = attrs['wx:key']?.value ?? null;
      if (!identifiers(item) || !identifiers(index) || item === index) issue('WXML_FOR', node.offset, '循环变量名无效或重复');
      if (key && /^\s*{{[\s\S]*}}\s*$/.test(key)){const expression=key.replace(/^\s*{{|}}\s*$/g,'').trim();key=expression===index?'__index__':expression.startsWith(item+'.')?expression.slice(item.length+1):expression;}
      if (key !== null && key !== '*this' && key !== '__index__' && !/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(key)) issue('WXML_KEY', node.offset, 'wx:key 需要字段名、点路径、动态循环索引或 *this');
      return '{kind:"for",id:' + literal(id) + ',value:' + value(attrs['wx:for'], true) + ',item:' + literal(item) + ',index:' + literal(index) + ',key:' + literal(key) + ',nodes:[' + single(strip(node, ['wx:for', 'wx:for-item', 'wx:for-index', 'wx:key'])) + ']}';
    }
    if (attrs['wx:if']) return '{kind:"if",branches:[{test:' + value(attrs['wx:if'], true) + ',nodes:[' + single(strip(node, ['wx:if'])) + ']}]}';
    if(node.tag==='template'){
      if(!attrs.is||Object.keys(attrs).some(key=>!['is','data'].includes(key)))issue('WXML_TEMPLATE',''+node.offset,'template 调用仅支持 is/data 和条件循环');
      if(attrs.is&&typeof attrs.is.value==='string'&&!attrs.is.value.includes('{{')){const doc=loaded.all.find(doc=>doc.file===(node.file||file));if(doc&&!doc.definitions.has(attrs.is.value)&&!doc.imports.some(value=>value.definitions.has(attrs.is.value)))issue('WXML_TEMPLATE_MISSING',node.offset,'模板未定义或未直接导入：'+attrs.is.value);}
      let data='scope=>({})';
      if(attrs.data){const raw=attrs.data.value,match=typeof raw==='string'&&/^\s*{{([\s\S]*)}}\s*$/.exec(raw);if(!match)issue('WXML_TEMPLATE_DATA',attrs.data.offset,'template.data 需要单个对象表达式');else data='scope=>'+expr('{'+match[1]+'}',attrs.data.valueOffset);}
      return '{kind:"template",owner:'+literal(node.file||file)+',name:'+(attrs.is?value(attrs.is,true):'scope=>""')+',data:'+data+'}';
    }
    if (!tags.has(node.tag) && !(settings.components || []).includes(node.tag) && !(settings.component && node.tag === 'slot')) issue('WXML_COMPONENT', node.offset, '尚未支持组件 '+node.tag+'；迁移建议：检查当前页面/组件JSON的usingComponents声明，或改用平台已实现的组件。');
    if(node.tag==='camera'&&node.children.some(child=>!Object.hasOwn(child,'text')||child.text.trim()))issue('WXML_CAMERA',node.offset,'camera暂不支持子节点或覆盖层，请使用外部布局');
    if(node.tag==='rich-text'&&node.children.length)issue('WXML_COMPONENT',node.offset,'rich-text请通过nodes提供内容');
    if(node.tag==='slot'&&Object.keys(attrs).some(key=>!['name','slot'].includes(key)))issue('WXML_SLOT',node.offset,'slot 仅支持 name 和用于转发的 slot');
    const attributes = [], handlers = [];
    for (const [name, attr] of Object.entries(attrs)) {
      const event = /^(?:(capture)-(bind|catch):|(bind|catch|mut-bind):?)([A-Za-z][\w-]*)$/.exec(name);
      if (event) {
        if(event[3]==='mut-bind'&&!name.startsWith('mut-bind:'))issue('WXML_EVENT',attr.offset,'mut-bind需要mut-bind:事件名语法');
        if (!(node.tag==='camera'&&event[4]==='error') && !(node.tag==='page-meta'&&['resize','scrolldone'].includes(event[4])) && !(node.tag==='image'&&['load','error'].includes(event[4])) && !(node.tag==='picker'&&(event[4]==='cancel'||event[4]==='columnchange'&&(attrs.mode?.value==='multiSelector'||String(attrs.mode?.value||'').includes('{{')))) && !events.has(event[4]) && !(settings.customEvents || []).includes(event[4]) && !(settings.components || []).includes(node.tag)){const hint={opensetting:'迁移到NowApp.permissions.has和宿主设置流程。',getuserinfo:'迁移到NowApp.getUserProfile或NowApp.chat.getContext。'}[event[4]];issue('WXML_EVENT',attr.offset,'尚未支持事件 '+event[4]+(hint?'；迁移建议：'+hint:''));}
        handlers.push('{name:' + literal(event[4]) + ',capture:' + !!event[1] + ',stop:' + ((event[2] || event[3]) === 'catch') + ',mut:'+(event[3]==='mut-bind')+',value:' + value(attr) + '}');
      } else {
        if (!(settings.components || []).includes(node.tag) && !common.has(name) && !(properties[node.tag] || []).includes(name) && !/^(?:data-|aria-)[\w-]+$/.test(name)) issue('WXML_ATTRIBUTE', attr.offset, '尚未支持 ' + node.tag + '.' + name);
        if(['hover-start-time','hover-stay-time'].includes(name)&&typeof attr.value==='string'&&!attr.value.includes('{{')&&(!/^\d+$/.test(attr.value)||Number(attr.value)>60000))issue('WXML_HOVER',attr.offset,'hover时间需要0–60000毫秒整数');
        if(node.tag==='text'&&name==='space'&&typeof attr.value==='string'&&!attr.value.includes('{{')&&!['ensp','emsp','nbsp'].includes(attr.value))issue('WXML_TEXT',attr.offset,'text.space只支持ensp/emsp/nbsp');
        if(node.tag==='picker'&&typeof attr.value==='string'&&!attr.value.includes('{{')){if(name==='mode'&&!['selector','multiSelector','date','time','region'].includes(attr.value))issue('WXML_PICKER',attr.offset,'picker.mode仅支持selector/multiSelector/date/time/region');if(name==='fields'&&!['year','month','day'].includes(attr.value))issue('WXML_PICKER',attr.offset,'picker.fields仅支持year/month/day');if(name==='range-key'&&(!attr.value||['__proto__','prototype','constructor'].includes(attr.value)))issue('WXML_PICKER',attr.offset,'picker.range-key字段无效');}
        if(node.tag==='icon'&&name==='type'&&typeof attr.value==='string'&&!attr.value.includes('{{')&&!Object.hasOwn(builtinCatalog.icons,attr.value))issue('WXML_ICON',attr.offset,'尚未支持 icon.type：'+attr.value);
        if (node.tag === 'button' && ['form-type','formType'].includes(name) && !['submit','reset'].includes(attr.value) && !String(attr.value).includes('{{')) issue('WXML_FORM', attr.offset, 'form-type 仅支持 submit/reset');
        if (node.tag === 'form' && name === 'report-submit' && attr.value !== '{{false}}' && !String(attr.value).includes('{{')) issue('WXML_FORM', attr.offset, '平台不提供微信 formId，report-submit 需省略或为 {{false}}');
        if (node.tag === 'button' && name === 'open-type' && !['share','send'].includes(attr.value)){const hint={opensetting:'迁移到NowApp.permissions.has和宿主设置流程。',getuserinfo:'迁移到NowApp.getUserProfile或NowApp.chat.getContext。'}[String(attr.value)];issue('WXML_BUTTON',attr.offset,'目前只支持 button.open-type=share 或 send'+(hint?'；迁移建议：'+hint:''));}
        if (node.tag === 'navigator' && typeof attr.value === 'string' && !attr.value.includes('{{') && (name === 'open-type' && !['navigate', 'redirect', 'switchTab', 'reLaunch', 'navigateBack'].includes(attr.value) || name === 'target' && attr.value !== 'self')) issue('WXML_NAVIGATOR', attr.offset, '尚未支持 navigator.' + name + '=' + attr.value);
        if (name === 'style' && typeof attr.value === 'string' && attr.value.includes('{{')) diagnostic('warning', 'DYNAMIC_STYLE', currentFile, attr.offset, '动态样式与图片路径请在预览中验证');
        attributes.push(literal(name) + ':' + value(attr));
      }
    }
    if (node.tag === 'block' && (attributes.length || handlers.length)) issue('WXML_BLOCK', node.offset, 'block 仅支持条件和循环指令');
    return '{kind:' + literal(node.tag === 'block' ? 'block' : 'element') + ',tag:' + literal(node.tag) + ',origin:'+literal(node.file||file)+',attrs:{' + attributes.join(',') + '},events:[' + handlers.join(',') + '],nodes:[' + list(node.children) + ']}';
  }
  settings.onWxs?.(loaded.wxs.bundle());
  const definitions=[];for(const doc of loaded.all)for(const [name,node]of doc.definitions)definitions.push(literal(doc.file+'#'+name)+':['+list(node.children)+']');
  const tables=loaded.all.map(doc=>{const names=new Map();for(const imported of doc.imports)for(const name of imported.definitions.keys())names.set(name,imported.file+'#'+name);for(const name of doc.definitions.keys())names.set(name,doc.file+'#'+name);return literal(doc.file)+':{'+[...names].map(([name,key])=>'['+literal(name)+']:definitions['+literal(key)+']').join(',')+'}';});
  return 'function(lookup,read,string,createWxs){'+(loaded.wxs.has()?'const wxs=createWxs('+literal(loaded.wxs.bundle())+');':'')+'const definitions={'+definitions.join(',')+'},tables={'+tables.join(',')+'};const nodes=['+list(loaded.entry?.nodes||[])+'];nodes.templates=tables;'+(loaded.wxs.has()?'nodes.wxs=wxs;':'')+'return nodes;}';
}
return {compile, parse, documents, tags, literal};
}
module.exports = {createTemplateCompiler};
