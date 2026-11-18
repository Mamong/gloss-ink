'use strict';
const createDataTools = require('./data');
const createViewConnection = require('./view-connection');
const createBehaviorEngine = require('./behaviors');

function createComponentEngine({execution: timers = {run: (_owner, callback) => callback(), dispose() {}}} = {}) {
  let count = 0;
  const {clone, patch, pathParts, error, forbidden} = createDataTools();
  const behaviorEngine = createBehaviorEngine(clone, error);
  function create(definition, source, connection, attrs, metadata, dispatch, notify) {
    definition = behaviorEngine.normalize(definition);
    const behavior = behaviorEngine.metadata(definition);
    if (count >= 1000) throw error('同时存在的组件超过 1000 个');
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) throw error('Component 需要配置对象');
    const allowed = ['properties','data','methods','lifetimes','created','attached','ready','moved','detached','export','observers','pageLifetimes','options','externalClasses','relations'];
    if (Object.keys(definition).some(key => !allowed.includes(key))) throw error('组件包含未支持的配置');
    for (const key of ['properties','data','methods','lifetimes','observers','pageLifetimes','options','relations']) if (definition[key] !== undefined && (!definition[key] || typeof definition[key] !== 'object' || Array.isArray(definition[key]))) throw error('组件 ' + key + ' 必须为对象');
    for (const [key,value] of Object.entries(definition.options || {})) if (!['styleIsolation','multipleSlots','virtualHost','addGlobalClass','pureDataPattern'].includes(key) || (key==='pureDataPattern'?Object.prototype.toString.call(value)!=='[object RegExp]':key === 'styleIsolation' ? !['isolated','apply-shared','shared'].includes(value) : typeof value!=='boolean')) throw error('尚未支持组件选项 ' + key);
    if (Object.keys(definition.lifetimes || {}).some(key => !['created','attached','ready','moved','detached'].includes(key)) || Object.keys(definition.pageLifetimes || {}).some(key => !['show','hide','resize'].includes(key))) throw error('尚未支持组件生命周期');
    if (definition.externalClasses !== undefined && (!Array.isArray(definition.externalClasses) || definition.externalClasses.length > 16 || definition.externalClasses.some(name => typeof name !== 'string' || !/^[a-z][a-z0-9-]*$/.test(name)) || new Set(definition.externalClasses).size !== definition.externalClasses.length)) throw error('externalClasses 需要唯一的类名数组');
    const schema = definition.properties || {}, defaults = {}, specifications = {};
    const builtinTypes=[String,Number,Boolean,Object,Array];
    const canonicalType=type=>typeof type==='function'?builtinTypes.find(candidate=>Function.prototype.toString.call(candidate)===Function.prototype.toString.call(type))||type:type;
    const primitive = type => type === String ? '' : type === Number ? 0 : type === Boolean ? false : type === Array ? [] : null;
    for (const [name, raw] of Object.entries(schema)) {
      if (!/^[A-Za-z_$][\w$]*$/.test(name) || forbidden.has(name)) throw error('组件属性名无效');
      const input = raw && typeof raw === 'object' ? raw : {type: raw};
      const spec={...input,type:canonicalType(input.type),...(Array.isArray(input.optionalTypes)?{optionalTypes:input.optionalTypes.map(canonicalType)}:{})};
      if (Object.keys(spec).some(key => !['type', 'value', 'observer','optionalTypes'].includes(key)) || ![String, Number, Boolean, Object, Array, null, undefined].includes(spec.type)) throw error('尚未支持组件属性类型或配置：' + name);
      if(spec.optionalTypes!==undefined&&(!Array.isArray(spec.optionalTypes)||spec.optionalTypes.length>8||spec.optionalTypes.some(type=>![String,Number,Boolean,Object,Array,null].includes(type))))throw error('optionalTypes需要受支持的类型数组');
      specifications[name] = spec; defaults[name] = spec.value === undefined ? primitive(spec.type) : clone(spec.value);
    }
    let disposed = false, attached = false, scheduled = false, callbacks = [], depth = 0, view;
    const instance = {data: {...clone(definition.data || {}), ...clone(defaults)}, properties: clone(defaults), id: attrs.id || '', dataset: clone(metadata || {}), is: source};
    if(connection.query)instance.createSelectorQuery=()=>connection.query();
    const pattern=definition.options?.pureDataPattern,purePattern=pattern?new RegExp(pattern.source,pattern.flags.replace(/[gy]/g,'')):null;
    const pure=name=>!!purePattern?.test(name);const renderable=data=>Object.fromEntries(Object.entries(data).filter(([name])=>!pure(name)));
    let renderData=clone(renderable(instance.data));
    for (const [name, method] of Object.entries(definition.methods || {})) {
      if (forbidden.has(name) || Object.hasOwn(instance, name) || ['setData', 'triggerEvent', 'selectComponent', 'selectAllComponents', 'hasBehavior','getRelationNodes','createSelectorQuery'].includes(name) || typeof method !== 'function') throw error('组件方法无效或覆盖保留字段：' + name);
      instance[name] = function (...args) { return timers.run(instance, () => method.apply(this, args)); };
    }
    const read = path => pathParts(path.replace(/\.\*\*$/, '')).reduce((value, key) => value?.[key], instance.data);
    function observers(changed, previousProperties) {
      if (++depth > 32) { depth--; throw error('组件 observer 更新循环过深'); }
      try {
        for (const [pattern, callback] of Object.entries(definition.observers || {})) {
          const paths = pattern.split(',').map(value => value.trim());
          const matches = paths.some(path => path === '**' || changed.some(key => { const plain = path.replace(/\.\*\*$/, ''); return key === plain || key.startsWith(plain + '.') || key.startsWith(plain + '[') || plain.startsWith(key + '.') || plain.startsWith(key + '['); }));
          if (matches) { if (typeof callback !== 'function') throw error('observers 必须为函数'); timers.run(instance, () => callback.apply(instance, paths.map(path => path === '**' ? instance.data : read(path)))); }
        }
        if (previousProperties) for (const [name, spec] of Object.entries(specifications)) {
          if (JSON.stringify(previousProperties[name]) === JSON.stringify(instance.properties[name])) continue;
          const callback = typeof spec.observer === 'string' ? instance[spec.observer] : spec.observer;
          if (spec.observer !== undefined && typeof callback !== 'function') throw error('属性 observer 必须为方法名或函数');
          if (callback) timers.run(instance, () => callback.call(instance, clone(instance.properties[name]), clone(previousProperties[name]),pathParts(changed.find(key=>pathParts(key)[0]===name)||name).map(key=>/^\d+$/.test(key)?Number(key):key)));
        }
      } finally { depth--; }
    }
    function schedule(callback) {
      if (callback) callbacks.push(callback);
      if (scheduled) return; scheduled = true;
      Promise.resolve().then(() => { scheduled = false; if (disposed || !attached) return; const ready=callbacks;callbacks=[];const receipt=view.render();const finish=()=>{if(!disposed)ready.forEach(callback=>callback.call(instance));};if(receipt&&!receipt.settled)receipt.done.then(finish,failure=>{if(!disposed&&failure.code!=='PAGE_UNLOADED')throw failure;});else finish(); });
    }
    const relations=definition.relations||{};
    for(const [key,relation]of Object.entries(relations)){if(relation?.target!==undefined&&!behaviorEngine.isBehavior(relation.target))throw error('relations.target必须引用Behavior');if(!key||!relation||typeof relation!=='object'||Array.isArray(relation)||!['parent','child','ancestor','descendant'].includes(relation.type)||Object.keys(relation).some(name=>!['type','target','linked','unlinked','linkChanged'].includes(name))||['linked','unlinked','linkChanged'].some(name=>relation[name]!==undefined&&typeof relation[name]!=='function'))throw error('relations 仅支持路径关系及 linked/unlinked/linkChanged');}
    instance.getRelationNodes=key=>disposed?[]:connection.relations?.(key)||[];
    instance.hasBehavior = token => behavior.tokens.has(token);
    instance.selectComponent = selector => disposed ? null : view?.select(selector, false) ?? null;
    instance.selectAllComponents = selector => disposed ? [] : view?.select(selector, true) || [];
    instance.setData = function (changes, callback) {
      if (disposed) throw error('组件已销毁', 'PAGE_UNLOADED');
      if (callback !== undefined && typeof callback !== 'function') throw error('setData callback 必须为函数');
      const values=clone(changes),visibleChanges=Object.fromEntries(Object.entries(values).filter(([key])=>!pure(pathParts(key)[0]))),next=patch(renderData,visibleChanges),previous=clone(instance.properties);patch({},Object.fromEntries(Object.entries(values).filter(([key])=>pure(pathParts(key)[0]))));
      for(const [key,value]of Object.entries(values)){const parts=pathParts(key);let target=instance.data;for(let index=0;index<parts.length-1;index++){const name=parts[index];if(!target[name]||typeof target[name]!=='object')target[name]=/^\d+$/.test(parts[index+1])?[]:{};target=target[name];}target[parts.at(-1)]=value;}
      renderData=next;for(const name of Object.keys(schema))instance.properties[name]=clone(instance.data[name]);
      notify(); view?.markChanges(visibleChanges); schedule(callback); observers(Object.keys(changes), previous);
    };
    instance.triggerEvent = function (name, detail = {}, settings = {}) {
      if (disposed) throw error('组件已销毁', 'PAGE_UNLOADED');
      if (typeof name !== 'string' || !/^[A-Za-z][\w-]*$/.test(name) || !settings || typeof settings !== 'object' || Array.isArray(settings) || Object.keys(settings).some(key => !['bubbles', 'composed', 'capturePhase'].includes(key) || typeof settings[key] !== 'boolean')) throw error('triggerEvent 参数无效');
      dispatch(name, clone(detail), settings);
    };
    function lifecycle(name) {
      const callback = definition.lifetimes?.[name] ?? definition[name];
      if (callback !== undefined && typeof callback !== 'function') throw error('组件生命周期必须为函数：' + name);
      const value = callback ? timers.run(instance, () => callback.call(instance)) : undefined; if (value?.then) Promise.resolve(value).catch(failure => { throw failure; });
    }
    lifecycle('created');
    const bindings = Object.create(null);
    function properties(attrs, dataset, forced = []) {
      const previous = clone(instance.properties), changed = [];
      for (const [name, spec] of Object.entries(specifications)) {
        const key = name.replace(/[A-Z]/g, value => '-' + value.toLowerCase());
        let value = Object.hasOwn(attrs, name) ? attrs[name] : Object.hasOwn(attrs, key) ? attrs[key] : defaults[name];
        const matches=type=>type===null||type===undefined||type===String&&typeof value==='string'||type===Number&&typeof value==='number'&&Number.isFinite(value)||type===Boolean&&typeof value==='boolean'||type===Array&&Array.isArray(value)||type===Object&&value!==null&&typeof value==='object'&&!Array.isArray(value);
        if(![spec.type,...(spec.optionalTypes||[])].some(matches)){
          if(spec.type===String&&value!==null&&value!==undefined)value=String(value);
          if(spec.type===Number)value=Number(value);if(spec.type===Boolean)value=!!value;
          if(spec.type===Array&&!Array.isArray(value))throw error('属性 '+name+' 需要数组');
          if(spec.type===Object&&value!==null&&(typeof value!=='object'||Array.isArray(value)))throw error('属性 '+name+' 需要对象');
        }
        value = clone(value === undefined ? null : value);
        if (Object.hasOwn(bindings, name) && JSON.stringify(bindings[name]) === JSON.stringify(value) && !forced.includes(name) && !forced.includes(key)) continue;
        bindings[name] = clone(value);
        if (JSON.stringify(instance.properties[name]) !== JSON.stringify(value)) { instance.properties[name] = value; instance.data[name]=clone(value);if(!pure(name))renderData[name]=clone(value);changed.push(name); }
      }
      instance.id = attrs.id || ''; instance.dataset = clone(dataset || {});
      if (changed.length) { notify(); view?.markChanges(Object.fromEntries(changed.map(name => [name, instance.data[name]]))); schedule(); observers(changed, previous); }
    }
    properties(attrs, metadata);
    count++;
    return {instance, properties, relations,exported(){if(!behavior.componentExport||!definition.export)return instance;const value=timers.run(instance,()=>definition.export.call(instance));if(value?.then)throw error('组件export必须同步返回');return value===undefined?instance:value;},move(){if(attached&&!disposed)lifecycle('moved');}, options:{virtualHost:definition.options?.virtualHost===true,styleIsolation:definition.options?.styleIsolation||(definition.options?.addGlobalClass?'apply-shared':'isolated')}, formField: behavior.formField, externalClasses: definition.externalClasses || [], snapshot() { return clone(renderData); }, restore(value) { const data = clone(value); if (!data || typeof data !== 'object' || Array.isArray(data)) throw error('组件快照无效'); const privateData={};for(const [key,value]of Object.entries(instance.data)){if(pure(key)){privateData[key]=value;continue;}try{clone(value);}catch(_){privateData[key]=value;}}renderData=clone(data);instance.data={...data,...privateData};for (const name of Object.keys(schema)) { if (Object.hasOwn(data, name)) instance.properties[name] = clone(data[name]); else instance.data[name] = clone(instance.properties[name]); } view.render(); }, setView(value) { view = createViewConnection(value); }, attach() { if (attached || disposed || !connection.attached()) return; attached = true; lifecycle('attached');connection.linked?.();const receipt=view.render();const ready=()=>{if(!disposed)lifecycle('ready');};if(receipt&&!receipt.settled)receipt.done.then(ready,error=>{if(!disposed)throw error;});else ready(); return receipt; },
      pageLifetime(name, value) { if (disposed) return; const callback = definition.pageLifetimes?.[name]; if (callback) timers.run(instance, () => callback.call(instance, value)); view?.pageLifetime(name, value); },
      destroy() { if (disposed) return; disposed = true; count--; callbacks = []; timers.dispose(instance); view?.destroy(); if (attached) lifecycle('detached'); }};
  }
  return {create, Behavior: behaviorEngine.define};
}

module.exports = createComponentEngine;
