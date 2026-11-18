'use strict';
const ComponentError = require('./error');

function createDataTools() {
  const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
  function error(message, code = 'INVALID_ARGUMENT') { return new ComponentError(message, {code}); }
  function clone(value) {
    const seen = new Set();
    function visit(value, depth) {
      if (depth > 64) throw error('组件数据嵌套过深');
      if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
      if (!value || typeof value !== 'object' || seen.has(value)) throw error('组件数据必须为无循环的 JSON 数据');
      seen.add(value);
      let result;
      if (Array.isArray(value)) result = Array.from(value, child => visit(child, depth + 1));
      else {
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== null && (Object.getPrototypeOf(prototype) !== null || prototype.constructor?.name !== 'Object')) throw error('组件数据只支持普通对象');
        result = {};
        for (const key of Object.keys(value)) { if (forbidden.has(key)) throw error('组件数据不允许原型字段'); result[key] = visit(value[key], depth + 1); }
      }
      seen.delete(value); return result;
    }
    const result = visit(value, 0); if (JSON.stringify(result).length > 524288) throw error('组件数据超过 512K 字符'); return result;
  }
  const pathParts = key => key.replace(/\[(\d+)\]/g, '.$1').split('.');
  function patch(data, changes) {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw error('setData 需要 JSON 对象');
    const next = clone(data), values = clone(changes);
    for (const key of Object.keys(values)) {
      if (!/^[^.[\]]+(?:(?:\.[^.[\]]+)|(?:\[(?:0|[1-9]\d*)\]))*$/.test(key)) throw error('setData 路径无效');
      const parts = pathParts(key); if (parts.some(key => forbidden.has(key))) throw error('不允许原型路径');
      let cursor = next;
      parts.forEach((part, index) => {
        if (/^\d+$/.test(part) && Number(part) > 32768) throw error('数组索引过大');
        if (Array.isArray(cursor)) { if (!/^\d+$/.test(part)) throw error('数组需要数字索引'); while (cursor.length < Number(part)) cursor.push(null); }
        if (index === parts.length - 1) cursor[part] = values[key];
        else { if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = /^\d+$/.test(parts[index + 1]) ? [] : {}; cursor = cursor[part]; }
      });
    }
    return clone(next);
  }
  return {clone, patch, pathParts, error, forbidden};
}

module.exports = createDataTools;
