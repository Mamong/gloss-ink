'use strict';
function createChildReconciler() {
  function plan(previous, next) {
    const keyed = new Map(previous.filter(node => node.key !== undefined).map(node => [node.key, node]));
    const stable = new Map(previous.filter(node => node.key === undefined && node.identity !== undefined).map(node => [node.identity, node]));
    const identity = node => node.key !== undefined ? 'key:' + node.key : node.identity !== undefined ? 'static:' + node.identity : null;
    const desired = new Set(next.filter(node => identity(node) !== null).map(node => identity(node) + '|' + node.tag));
    const removeFirst = previous.filter(node => identity(node) !== null && !desired.has(identity(node) + '|' + node.tag));
    const removed = new Set(removeFirst), used = new Set();
    const entries = next.map((node, index) => {
      const candidate = node.key !== undefined ? keyed.get(node.key) : node.identity !== undefined ? stable.get(node.identity) : previous[index]?.key === undefined ? previous[index] : undefined;
      const matched = candidate && !removed.has(candidate) && !used.has(candidate) && candidate.tag === node.tag ? candidate : undefined;
      if (matched) used.add(matched);
      return {node, previous: matched};
    });
    return {removeFirst, entries, removeLast: previous.filter(node => !used.has(node) && !removed.has(node))};
  }
  return {plan};
}
module.exports = createChildReconciler;
