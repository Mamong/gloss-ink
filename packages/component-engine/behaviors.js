'use strict';
function createBehaviorEngine(clone, error) {
  const registry = new WeakMap(), metadata = new WeakMap(), cache = new WeakMap();
  const hooks = ['created','attached','ready','moved','detached'];
  const componentFields = ['properties','data','methods','lifetimes',...hooks,'observers','pageLifetimes','options','externalClasses','relations','behaviors','export'];
  const behaviorFields = ['properties','data','methods','lifetimes',...hooks,'observers','pageLifetimes','relations','behaviors','definitionFilter'];
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function validate(value, fields) {
    if (!object(value) || Object.keys(value).some(key => !fields.includes(key))) throw error('Behavior/Component 包含未支持的配置');
    if (value.behaviors !== undefined && !Array.isArray(value.behaviors)) throw error('behaviors 必须为数组');
    for (const field of ['properties','data','methods','lifetimes','observers','pageLifetimes','options','relations']) if (value[field] !== undefined && !object(value[field])) throw error(field + ' 必须为对象');
    for (const name of Object.keys(value.lifetimes || {})) if (!hooks.includes(name)) throw error('不支持的 Behavior 生命周期：' + name);
    for (const name of Object.keys(value.pageLifetimes || {})) if (!['show','hide','resize'].includes(name)) throw error('不支持的 pageLifetimes：' + name);
  }
  function definitionCopy(value,seen=new Map()){
    if(!value||typeof value!=='object'||registry.has(value)||Object.prototype.toString.call(value)==='[object RegExp]')return value;
    if(seen.has(value))throw error('组件定义不能循环引用');const out=Array.isArray(value)?[]:{};seen.set(value,out);for(const[key,item]of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(key))throw error('组件定义字段无效');out[key]=definitionCopy(item,seen);}seen.delete(value);return out;
  }
  function filter(token,fields,depth=0){
    if(depth>32)throw error('Behavior definitionFilter依赖过深');if(typeof token==='string')return;
    const definition=registry.get(token);if(!definition)throw error('definitionFilter需要Behavior引用');
    const children=(definition.behaviors||[]).map(child=>value=>filter(child,value,depth+1));
    if(definition.definitionFilter!==undefined){if(typeof definition.definitionFilter!=='function')throw error('definitionFilter必须为函数');const result=definition.definitionFilter(fields,children);if(result?.then)throw error('definitionFilter必须同步完成');}
    else for(const child of children)child(fields);
  }
  function applyFilters(value){const working=definitionCopy(value),tokens=(value.behaviors||[]).slice();for(const token of tokens)filter(token,working);if((working.behaviors||[]).length!==tokens.length||tokens.some((token,index)=>working.behaviors[index]!==token))throw error('definitionFilter不能动态改变behaviors依赖');return working;}
  function define(value) { validate(value, behaviorFields);const working=applyFilters(value);validate(working,behaviorFields);const token=Object.freeze({});registry.set(token,working);return token; }
  function mergeData(target, value) {
    for (const [key, item] of Object.entries(clone(value))) {
      if (object(item) && object(target[key])) mergeData(target[key], item); else target[key] = item;
    }
  }
  function chain(callbacks) {
    return function (...args) { for (const callback of callbacks) { const result = callback.apply(this, args); if (result?.then) Promise.resolve(result).catch(failure => { throw failure; }); } };
  }
  function normalize(value) {
    if (cache.has(value)) return cache.get(value);
    const original=value;value=applyFilters(value);validate(value,componentFields);
    const list = [], seen = new Set(), active = new Set(); let formField = false,componentExport=false;
    function visit(token, depth) {
      if (depth > 32 || seen.size > 256) throw error('Behavior 依赖超过限制');
      if (active.has(token)) throw error('Behavior 依赖循环');
      if (seen.has(token)) return;
      if (typeof token === 'string') {
        if(token==='wx://component-export'){seen.add(token);componentExport=true;return;}
        if (token !== 'wx://form-field') throw error('尚未支持内置 Behavior：' + token);
        seen.add(token); formField = true; list.push({properties: {name: String, value: null}}); return;
      }
      if (!object(token) || !registry.has(token)) throw error('behaviors 必须引用 Behavior() 返回值');
      active.add(token); const definition = registry.get(token); validate(definition, behaviorFields);
      for (const dependency of definition.behaviors || []) visit(dependency, depth + 1);
      active.delete(token); seen.add(token); list.push(definition);
    }
    for (const token of value.behaviors || []) visit(token, 0);
    list.push(value);
    const result = {properties: {}, data: {}, methods: {}, lifetimes: {}, observers: {}, pageLifetimes: {}};
    const life = {}, observers = {}, pageLife = {};
    for (const definition of list) {
      Object.assign(result.properties, definition.properties || {}); mergeData(result.data, definition.data || {}); Object.assign(result.methods, definition.methods || {});
      for (const name of hooks) {
        const callback = definition.lifetimes?.[name] ?? definition[name];
        if (callback !== undefined) { if (typeof callback !== 'function') throw error('生命周期必须为函数'); (life[name] ||= []).push(callback); }
      }
      for (const [name, callback] of Object.entries(definition.observers || {})) { if (typeof callback !== 'function') throw error('observer 必须为函数'); (observers[name] ||= []).push(callback); }
      for (const [name, callback] of Object.entries(definition.pageLifetimes || {})) { if (typeof callback !== 'function') throw error('pageLifetimes 必须为函数'); (pageLife[name] ||= []).push(callback); }
    }
    for (const [name, callbacks] of Object.entries(life)) result.lifetimes[name] = chain(callbacks);
    for (const [name, callbacks] of Object.entries(observers)) result.observers[name] = chain(callbacks);
    for (const [name, callbacks] of Object.entries(pageLife)) result.pageLifetimes[name] = chain(callbacks);
    result.relations={};for(const definition of list)Object.assign(result.relations,definition.relations||{});
    if (value.options !== undefined) result.options = value.options;
    if (value.externalClasses !== undefined) result.externalClasses = value.externalClasses;
    if(value.export!==undefined){if(typeof value.export!=='function')throw error('组件export必须为函数');result.export=value.export;}
    metadata.set(result, {tokens: seen, formField,componentExport}); cache.set(original, result); return result;
  }
  return {define, normalize,isBehavior:value=>registry.has(value), metadata: value => metadata.get(value)};
}

module.exports = createBehaviorEngine;
