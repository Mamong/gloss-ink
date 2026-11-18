'use strict';
const path = require('node:path');
const {Worker, MessageChannel} = require('node:worker_threads');
const timeout = 10000;
function fixture(t, mode) {
  const {port1, port2} = new MessageChannel();
  const worker = new Worker(path.join(__dirname, 'component-worker-runtime.cjs'), {workerData: {mode, port: port2}, transferList: [port2]});
  const calls = new Map(), renders = [], renderWaiters = [], events = [];
  let nextId = 0, failure, closing = false;
  function fail(error) {
    if (failure) return;
    failure = error;
    for (const pending of calls.values()) {clearTimeout(pending.timer); pending.reject(error);}
    calls.clear();
    for (const pending of renderWaiters.splice(0)) {clearTimeout(pending.timer); pending.reject(error);}
  }
  worker.on('error', fail);
  worker.on('exit', code => {
    if (!closing) fail(Object.assign(new Error('Component Worker exited: ' + code), {code: 'WORKER_CLOSED'}));
  });
  port1.on('messageerror', fail);
  port1.on('message', message => {
    if (message.type === 'render') {
      const waiter = renderWaiters.shift();
      if (waiter) {clearTimeout(waiter.timer); waiter.resolve(message);} else renders.push(message);
    } else if (message.type === 'event') {
      events.push(message);
    } else if (message.type === 'result') {
      const pending = calls.get(message.id);
      if (!pending) return;
      calls.delete(message.id); clearTimeout(pending.timer);
      if (message.error) pending.reject(Object.assign(new Error(message.error.message), message.error));
      else pending.resolve(message.value);
    }
  });
  function call(method, value) {
    if (failure) return Promise.reject(failure);
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {calls.delete(id); reject(new Error('Component Worker RPC timed out: ' + method));}, timeout);
      calls.set(id, {resolve, reject, timer});
      try {port1.postMessage({id, method, value});} catch (error) {clearTimeout(timer); calls.delete(id); reject(error);}
    });
  }
  function nextRender() {
    if (renders.length) return Promise.resolve(renders.shift());
    if (failure) return Promise.reject(failure);
    return new Promise((resolve, reject) => {
      const pending = {resolve, reject};
      pending.timer = setTimeout(() => {
        renderWaiters.splice(renderWaiters.indexOf(pending), 1);
        reject(new Error('Component Worker did not publish a render'));
      }, timeout);
      renderWaiters.push(pending);
    });
  }
  async function close() {
    if (closing) return;
    closing = true;
    fail(Object.assign(new Error('Component Worker fixture closed'), {code: 'WORKER_CLOSED'}));
    port1.close(); await worker.terminate();
  }
  t.after(close);
  return {call, nextRender, renders, events, close,
    inspect: () => call('inspect'),
    ack: receipt => call('ack', {receiptId: receipt.receiptId}),
    request: (ownerId, method, value) => call('request', {version: 1, ownerId, method, ...(value === undefined ? {} : {value})}),
  };
}
module.exports = {fixture};
