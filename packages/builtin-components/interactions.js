function createWeappInteractions(root, options) {
  'use strict';
  const records = new Map(), processed = new WeakSet(), hovering = new Set();
  const defaults = {view: ['none', 50, 400], button: ['button-hover', 20, 70], navigator: ['navigator-hover', 50, 600]};
  const now = () => root.performance?.now?.() ?? Date.now();
  let active = null, suppressed = null, listening = false;
  const invalid = message => { throw new options.Error(message, {code: 'INVALID_ARGUMENT'}); };
  function number(value, fallback) {
    if (value === undefined) return fallback;
    value = Number(value);
    if (!Number.isSafeInteger(value) || value < 0 || value > 60000) invalid('hover 时间需要 0–60000 毫秒整数');
    return value;
  }
  function settings(node) {
    const attrs = node.attrs, fallback = defaults[node.tag] || ['none', 50, 400];
    const name = attrs['hover-class'] === undefined ? fallback[0] : attrs['hover-class'];
    if (typeof name !== 'string' || name.length > 512 || (/[\x00-\x1f\x7f]/.test(name)||name.split(/\s+/).filter(Boolean).length>32)) invalid('hover-class 需要有效的类名列表或 none');
    const stop = attrs['hover-stop-propagation'] ?? false;
    if (typeof stop !== 'boolean') invalid('hover-stop-propagation 需要布尔值');
    const resolved=name==='none'?'':(node.eventView?.classes?.(name)??name);
    return {names: [...new Set(resolved.split(/\s+/).filter(Boolean))], start: number(attrs['hover-start-time'], fallback[1]), stay: number(attrs['hover-stay-time'], fallback[2]), stop};
  }
  function live(node) {
    if (!node?.element?.isConnected) return false;
    for (const parent of options.path(node)) {
      if (!parent.eventView?.live() || parent.attrs?.hidden || parent.attrs?.disabled || parent.element?.hidden || parent.element?.inert || parent.element?.style?.display==='none' || parent.element?.style?.visibility==='hidden') return false;
    }
    for (let element = node.element; element; element = element.parentElement || element.getRootNode?.().host || element.host) {
      if (element.hidden || element.inert || element.disabled || element.style?.display === 'none' || element.style?.visibility === 'hidden') return false;
    }
    return true;
  }
  function paint(record) {
    if (!record.highlighted) return;
    for (const name of record.settings.names) record.element.classList.add(name);
  }
  function clearHover(record) {
    hovering.delete(record);
    for (const key of ['startTimer', 'endTimer']) {
      if (record[key] !== undefined) root.clearTimeout(record[key]);
      record[key] = undefined;
    }
    for (const name of record.applied || []) if (!record.base.has(name)) record.element.classList.remove(name);
    record.highlighted = false;
    record.applied = [];
  }
  function hover(record) {
    clearHover(record);
    if (!record.settings.names.length) return;
    hovering.add(record);
    const show = () => {
      record.startTimer = undefined;
      if (!active?.hovered.includes(record) || !live(record.node)) return;
      record.highlighted = true;
      record.applied = record.settings.names.slice();
      paint(record);
    };
    if (record.settings.start === 0) show();
    else record.startTimer = root.setTimeout(show, record.settings.start);
  }
  function leaveHover(record, cancelled) {
    if (record.startTimer !== undefined) root.clearTimeout(record.startTimer);
    record.startTimer = undefined;
    if (!record.highlighted || cancelled || !live(record.node)) { clearHover(record); return; }
    record.endTimer = root.setTimeout(() => clearHover(record), record.settings.stay);
  }
  function source(event) {
    let element = event.composedPath?.()[0] || event.target;
    while (element && !records.has(element)) element = element.parentElement || element.getRootNode?.().host || element.host;
    return records.get(element);
  }
  function touch(event, end = false) {
    const point = (end ? event.changedTouches?.[0] : event.touches?.[0]) || event;
    return {identifier: point.identifier ?? event.pointerId ?? 0, clientX: point.clientX || 0, clientY: point.clientY || 0,
      pageX: point.pageX ?? point.clientX ?? 0, pageY: point.pageY ?? point.clientY ?? 0, force: point.force ?? event.pressure ?? 0};
  }
  function original(gesture, ended) {
    return {timeStamp: gesture.timeStamp + Math.max(0, now() - gesture.started), touches: ended ? [] : [{...gesture.point}], changedTouches: [{...gesture.point}]};
  }
  function cancel() {
    const gesture = active;
    if (!gesture) return;
    active = null;
    root.clearTimeout(gesture.timer);
    for (const record of gesture.hovered) leaveHover(record, true);
    // A cancelled gesture must never produce a delayed activation after a long press.
    suppressed = {node: gesture.node, until: now() + 800};
  }
  function start(record, event) {
    if (!record || !live(record.node) || event.button !== undefined && event.button !== 0) return;
    if (event.touches?.length > 1 || event.isPrimary === false) { cancel(); return; }
    const kind = event.type.startsWith('touch') ? 'touch' : 'pointer';
    if (active) {
      if (active.kind === 'pointer' && kind === 'touch') return;
      if (active.kind === kind && (event.pointerId ?? 0) === active.id) return;
      cancel(); return;
    }
    suppressed = null;
    const gesture = {node: record.node, kind, id: event.pointerId ?? 0, started: now(), timeStamp: event.timeStamp ?? now(), point: touch(event), hovered: [], longpress: false};
    gesture.x = gesture.point.clientX; gesture.y = gesture.point.clientY;
    active = gesture;
    for (const node of options.path(record.node)) {
      const item = records.get(node.element);
      if (!item) continue;
      gesture.hovered.push(item); hover(item);
      if (item.settings.stop) break;
    }
    gesture.timer = root.setTimeout(() => press(gesture), 350);
  }
  function press(gesture) {
    if (active !== gesture || !live(gesture.node)) { if (active === gesture) cancel(); return; }
    if (gesture.attempted) return;
    gesture.attempted = true;
    gesture.longpress = options.emit(gesture.node, 'longpress', {x: gesture.point.clientX, y: gesture.point.clientY}, original(gesture, false));
    if (gesture.longpress) suppressed = {node: gesture.node, until: Infinity};
  }
  function move(event) {
    if (!active) return;
    if (event.touches?.length > 1) { cancel(); return; }
    const kind = event.type.startsWith('touch') ? 'touch' : 'pointer';
    if (kind !== active.kind || kind === 'pointer' && (event.pointerId ?? 0) !== active.id) return;
    if (!live(active.node)) { cancel(); return; }
    active.point = touch(event);
    if (Math.hypot(active.point.clientX - active.x, active.point.clientY - active.y) > 10) cancel();
  }
  function end(event) {
    const gesture = active;
    if (!gesture) return;
    const kind = event.type.startsWith('touch') ? 'touch' : 'pointer';
    if (kind !== gesture.kind || kind === 'pointer' && (event.pointerId ?? 0) !== gesture.id) return;
    if (!live(gesture.node) || event.touches?.length) { cancel(); return; }
    gesture.point = touch(event, true);
    if (Math.hypot(gesture.point.clientX - gesture.x, gesture.point.clientY - gesture.y) > 10) { cancel(); return; }
    if(now()-gesture.started>=350&&!gesture.attempted)press(gesture);
    if(active!==gesture)return;
    active = null; root.clearTimeout(gesture.timer);
    for (const record of gesture.hovered) leaveHover(record, false);
    if (now() - gesture.started >= 350) options.emit(gesture.node, 'longtap', {x: gesture.point.clientX, y: gesture.point.clientY}, original(gesture, true));
    if (gesture.longpress) suppressed = {node: gesture.node, until: now() + 800};
  }
  function click(event) {
    if (!suppressed || event.detail === 0) return;
    if (now() > suppressed.until) { suppressed = null; return; }
    const node = source(event)?.node;
    if (!node || !options.path(node).includes(suppressed.node) && !options.path(suppressed.node).includes(node)) return;
    suppressed = null;
    event.preventDefault(); event.stopImmediatePropagation();
  }
  function handle(event) {
    if (processed.has(event)) return;
    processed.add(event);
    if (event.type === 'click') { click(event); return; }
    if(event.type==='blur'&&event.target&&event.target!==root&&event.target!==root.document)return;
    if (['pointercancel', 'touchcancel', 'lostpointercapture', 'blur'].includes(event.type)) { cancel(); return; }
    if (['pointerdown', 'touchstart'].includes(event.type)) start(source(event), event);
    else if (['pointermove', 'touchmove'].includes(event.type)) move(event);
    else if (['pointerup', 'touchend'].includes(event.type)) end(event);
  }
  const types = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture', 'touchstart', 'touchmove', 'touchend', 'touchcancel', 'click'];
  const globalTypes = ['pointermove', 'pointerup', 'pointercancel', 'touchmove', 'touchend', 'touchcancel', 'blur'];
  function create(element, node, owner) {
    if (element.virtualRange || records.has(element)) return;
    records.set(element, {element, node, owner, settings: settings(node), base: new Set(), applied: []});
    for (const type of types) element.addEventListener(type, handle, {capture: true, passive: false});
    if (!listening) { listening = true; for (const type of globalTypes) root.addEventListener?.(type, handle, {capture: true, passive: false}); }
  }
  function patch(element, node) {
    const record = records.get(element); if (!record) return;
    const next = settings(node), changed = JSON.stringify(next) !== JSON.stringify(record.settings);
    if (changed) { if (active?.hovered.includes(record)) cancel(); clearHover(record); }
    record.node = node; record.settings = next; record.base = new Set((element.className || '').split(/\s+/).filter(Boolean));
    // Existing logical nodes are replaced on render. Keep the current gesture attached to the live node.
    if (active?.node.element === element) active.node = node;
    if (suppressed?.node.element === element) suppressed.node = node;
    if ((active?.node===node||active?.hovered.includes(record)||hovering.has(record))&&!live(node)) { if (active?.node === node || active?.hovered.includes(record)) cancel(); clearHover(record); }
    else paint(record);
  }
  function flush() {
    if (active && !live(active.node)) cancel();
    for (const record of hovering) if (!live(record.node)) clearHover(record);
    if (suppressed && now()>suppressed.until) suppressed = null;
  }
  function remove(element) {
    const record = records.get(element); if (!record) return;
    if (active?.node.element === element || active?.hovered.includes(record)) cancel();
    if (suppressed?.node.element === element) suppressed = null;
    clearHover(record); records.delete(element);
    for (const type of types) element.removeEventListener(type, handle, true);
    if (!records.size && listening) { listening = false; for (const type of globalTypes) root.removeEventListener?.(type, handle, true); }
  }
  return {create, patch, flush, remove, cancelOwner(owner) { if (active && records.get(active.node.element)?.owner === owner) cancel(); for (const record of records.values()) if (record.owner === owner) clearHover(record); }, disposeOwner(owner) { for (const record of [...records.values()]) if (record.owner === owner) remove(record.element); }, live};
}

module.exports = createWeappInteractions;
