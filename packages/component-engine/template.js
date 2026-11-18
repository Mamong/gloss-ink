'use strict';
function createTemplateEvaluator(template, options = {}) {
  const string = value => value === null || value === undefined ? '' : String(value);
  const pathRead = (value, path) => String(path).split('.').reduce((current, key) => current == null ? undefined : current[key], value);
  function evaluate(data, changedRoots = []) {
    const roots = new Set(changedRoots);
    let templateCalls = 0;
    function expand(nodes, scope, prefix = '', force = false, range) {
      const result = [];
      for (let index = 0; index < nodes.length; index++) {
        const node = nodes[index], path = prefix + '/' + index;
        if (node.kind === 'template') {
          const name = String(node.name(scope)), table = template.templates?.[node.owner];
          const definition = table && Object.hasOwn(table, name) ? table[name] : null;
          if (!definition) throw new Error('模板未定义：' + name);
          if (++templateCalls > 1000) throw new Error('模板展开超过限制');
          const values = node.data(scope);
          if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('模板 data 必须为对象');
          result.push(...expand(definition, Object.assign(Object.create(null), values), path + '/template:' + name, force));
        } else if (node.kind === 'if') {
          const branch = node.branches.find(branch => !branch.test || branch.test(scope));
          if (branch) result.push(...expand(branch.nodes, scope, path, force));
        } else if (node.kind === 'for') {
          const list = node.value(scope);
          if (list === undefined || list === null) continue;
          if (!Array.isArray(list) && typeof list !== 'object') throw new Error('wx:for 需要数组或对象');
          const entries = Array.isArray(list) ? list.map((item, index) => [index, item]) : Object.entries(list), keys = new Set();
          let ordinal = 0;
          for (const [index, item] of entries) {
            const nested = Object.create(scope); nested[node.item] = item; nested[node.index] = index;
            const key = node.key === '*this' ? item : node.key === '__index__' ? index : node.key ? pathRead(item, node.key) : index;
            const identity = node.id + ':' + typeof key + ':' + string(key);
            if (keys.has(identity)) throw new Error('wx:key 重复：' + string(key));
            keys.add(identity);
            const position = ordinal++;
            if (range && (position < range.start || position >= range.end)) continue;
            const children = expand(node.nodes, nested, path + '/' + identity, force || (node.value.dependencies || []).some(name => roots.has(name)));
            children.forEach((child, childIndex) => { child.key = path + '/' + identity + '/' + (child.key ?? childIndex); });
            result.push(...children);
          }
        } else if (node.kind === 'block') result.push(...expand(node.nodes, scope, path, force));
        else if (node.kind === 'text') result.push({tag: '#text', identity: path, text: string(node.value(scope))});
        else {
          const attrs = Object.fromEntries(Object.entries(node.attrs).map(([name, value]) => [name, value(scope)]));
          const forced = Object.entries(node.attrs).filter(([, value]) => force || (value.dependencies || []).some(name => roots.has(name))).map(([name]) => name);
          // Platforms may select visibility or a layout window without owning expansion rules.
          const policy = options.element?.(node, {attrs, forced, scope, path, force}) || {};
          if (policy.skip) continue;
          const childPath = policy.prefix ?? path;
          if (policy.flatten) { result.push(...expand(node.nodes, scope, childPath, force)); continue; }
          const dataset = Object.create(null);
          for (const [name, value] of Object.entries(attrs)) if (name.startsWith('data-') && value !== undefined) dataset[name.slice(5).replace(/-([a-z])/g, (_whole, letter) => letter.toUpperCase())] = value;
          const children = [...(policy.before || []), ...expand(node.nodes, scope, childPath, force, policy.range), ...(policy.after || [])];
          result.push({forced, identity: path, tag: node.tag, origin: node.origin, attrs, dataset,
            events: node.events.map(event => ({...event, handler: string(event.value(scope))})), children, ...(policy.metadata || {})});
        }
      }
      return result;
    }
    return {nodes: expand(template, Object.assign(Object.create(null), data)), templateCalls};
  }
  return {evaluate};
}
module.exports = createTemplateEvaluator;
