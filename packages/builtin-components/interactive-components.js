const createRpxUnits = require('./rpx');
function createInteractiveComponents(root, options) {
  'use strict';
  const rpxUnits = createRpxUnits();
  const document = root.document, records = new Map();
  let visible = true, disposed = false;
  const fail = message => { throw new options.Error(message, {code: 'INVALID_ARGUMENT'}); };
  const number = (value, fallback, min = -1000000, max = 1000000) => {
    const result = value === undefined ? fallback : Number(value);
    if (!Number.isFinite(result) || result < min || result > max) fail('交互组件数值超出支持范围');
    return result;
  };
  const bool = (value, fallback = false) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'boolean') fail('交互组件布尔属性需要boolean');
    return value;
  };
  const live = record => !disposed && visible && options.live() && record.element.isConnected;
  const emit = (record, name, detail) => { if (live(record)&&!(record.tag==='picker-view'&&['change','pickstart','pickend'].includes(name)&&record.element.getBoundingClientRect?.().height===0)) options.emit(record.element, name, detail); };
  function listen(record, target, name, handler, settings, owner) {
    target.addEventListener?.(name, handler, settings);
    record.listeners.push([target, name, handler, settings, owner]);
  }
  function clear(record) {
    if (record.timer !== undefined) root.clearTimeout(record.timer);
    record.timer = undefined; record.gesture = null;record.picking=false;record.held?.clear();
  }
  function dimension(element, key, fallback) {
    return element[key === 'width' ? 'clientWidth' : 'clientHeight'] || parseFloat(root.getComputedStyle?.(element)?.[key]) || parseFloat(element.style[key]) || fallback;
  }
  function selected(record, index, value, source) {
    const column = record.columns[index];
    if (!column || !column.items.length) return;
    value = Math.max(0, Math.min(column.items.length - 1, Math.round(value)));
    if (record.value[index] === value) return;
    record.value[index] = value;
    paintColumns(record);
    emit(record, 'change', {value: record.value.slice(), source});
  }
  function paintColumns(record) {
    for (let index = 0; index < record.columns.length; index++) {
      const column = record.columns[index], value = record.value[index];
      column.element.setAttribute('aria-activedescendant', column.items[value]?.id || '');
      column.items.forEach((item, position) => {
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', String(position === value));
      });
    }
  }
  function wheelStyles(value) {
    if(value===undefined||value==='')return '';
    if(typeof value!=='string'||value.length>4096)fail('picker-view样式需要最多4096字符字符串');
    const allowed=new Set(['height','background','background-color','background-image','opacity','border','border-top','border-bottom','border-color','border-width','border-style','border-radius','box-shadow','color']);
    for(const part of value.split(';')){if(!part.trim())continue;const match=/^\s*([a-z-]+)\s*:\s*(.+?)\s*$/i.exec(part);if(!match||!allowed.has(match[1].toLowerCase())||/[{}<>\\@]/.test(match[2])||/url\s*\(|expression\s*\(|!important/i.test(match[2]))fail('picker-view样式包含不支持的声明');}
    return options.style?options.style(value):value.replace(/(\d+(?:\.\d+)?)rpx\b/g,(_,n)=>rpxUnits.css(Number(n)));
  }
  function wheelClass(value){if(value===undefined)return '';if(typeof value!=='string'||value.length>512||/[\x00-\x1f\x7f]/.test(value))fail('picker-view类名需要有效字符串');return options.classes?options.classes(value):value;}
  function wheelCommit(record){
    const next=record.columns.map(column=>Math.max(0,Math.min(Math.max(0,column.items.length-1),Math.round((column.element.scrollTop||0)/record.size))));
    if(next.some((value,index)=>value!==record.value[index])){record.value=next;paintColumns(record);emit(record,'change',{value:next.slice(),source:'scroll'});}
  }
  function wheelStart(record){if(!record.picking){record.picking=true;emit(record,'pickstart',{});}}
  function wheelSettle(record){
    if(record.timer!==undefined)root.clearTimeout(record.timer);
    record.timer=root.setTimeout(()=>{record.timer=undefined;if(!live(record)||record.held.size)return;wheelCommit(record);if(record.picking){record.picking=false;emit(record,'pickend',{});}},100);
  }
  function picker(record, node, old) {
    const attrs = node.attrs, children = node.children || [];
    if (children.some(child => child.tag !== 'picker-view-column') || children.length > 16) fail('picker-view需要最多16个picker-view-column');
    if (attrs.value !== undefined && (!Array.isArray(attrs.value) || attrs.value.length > 16 || attrs.value.some(v => !Number.isInteger(v) || v < 0))) fail('picker-view.value需要非负整数数组');
    const indicator=wheelStyles(attrs['indicator-style']),mask=wheelStyles(attrs['mask-style']),indicatorClass=wheelClass(attrs['indicator-class']),maskClass=wheelClass(attrs['mask-class']);
    bool(attrs['immediate-change']);
    const source=attrs['indicator-style']||'',match=/(?:^|;)\s*height\s*:\s*(\d+(?:\.\d+)?)(px|rpx)\s*(?:;|$)/i.exec(source);
    if(/(?:^|;)\s*height\s*:/i.test(source)&&!match)fail('picker-view指示器height需要px/rpx长度');
    const size=number(match?(match[2].toLowerCase()==='rpx'?rpxUnits.pixels(Number(match[1]),root.innerWidth||document.documentElement?.clientWidth||750):Number(match[1])):undefined,34,12,200),height=record.element.isConnected&&record.element.getBoundingClientRect?record.element.getBoundingClientRect().height:dimension(record.element,'height',200);
    record.held ||= new Set();
    record.size = size;
    record.element.style.setProperty?.('--weapp-picker-row-height', size + 'px');
    record.element.setAttribute('role', 'group');
    record.element.setAttribute('aria-label', '多列选择器');
    if(old&&(JSON.stringify(old.attrs.value)!==JSON.stringify(attrs.value)||node.forced?.includes('value')))clear(record);
    record.value ||= [];
    const previous = record.columns || [];
    for(const element of [...record.bound])if(!children.some(child=>child.element===element)){record.bound.delete(element);record.held.delete(element);for(const binding of record.listeners.filter(item=>item[0]===element||item[4]===element))binding[0].removeEventListener?.(binding[1],binding[2],binding[3]);record.listeners=record.listeners.filter(item=>item[0]!==element&&item[4]!==element);}
    record.columns = children.map((child, index) => {
      const element = child.element, items = (child.children || []).map(item => item.element);
      if (items.length > 2000) fail('选择器单列最多2000项');
      const before = previous[index], changed = !before || before.element !== element || before.items.length !== items.length || before.items.some((item, i) => item !== items[i]);
      const controlled = !old || JSON.stringify(old.attrs.value) !== JSON.stringify(attrs.value) || node.forced?.includes('value');
      const raw = controlled ? attrs.value?.[index] ?? 0 : record.value[index] ?? 0;
      record.value[index] = Math.max(0, Math.min(Math.max(0, items.length - 1), raw));
      if(!controlled&&before&&before.items.length!==items.length&&record.value[index]!==raw)record.clampPending=true;
      Object.assign(element.style, {flex: '1 1 0', minWidth: '0', overflowY: 'auto', overflowX: 'hidden', height: '100%', boxSizing: 'border-box', paddingTop: Math.max(0, (height - size) / 2) + 'px', paddingBottom: Math.max(0, (height - size) / 2) + 'px', scrollSnapType: 'y mandatory', overscrollBehavior: 'contain'});
      element.setAttribute('role', 'listbox'); element.setAttribute('tabindex', '0'); element.setAttribute('aria-label', '第' + (index + 1) + '列');
      items.forEach((item, position) => {
        Object.assign(item.style, {height: size + 'px', minHeight: size + 'px', flex: 'none', scrollSnapAlign: 'center', overflow: 'hidden'});
        item.id ||= 'weapp-wheel-' + record.id + '-' + index + '-' + position;
      });
      if (!record.bound.has(element)) {
        record.bound.add(element);
        listen(record, element, 'keydown', event => {
          if (!live(record)) return;
          const currentIndex = record.columns.findIndex(column => column.element === element);
          if (currentIndex < 0) return;
          const keys = {ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5};
          if (!Object.hasOwn(keys, event.key) && !['Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const last = record.columns[currentIndex].items.length - 1;
          selected(record, currentIndex, event.key === 'Home' ? 0 : event.key === 'End' ? last : record.value[currentIndex] + keys[event.key], 'keyboard');
          record.columns[currentIndex].expected=record.value[currentIndex]*record.size;element.scrollTop=record.columns[currentIndex].expected;
        });
        listen(record, element, 'click', event => {
          if (!live(record)) return;
          const currentIndex = record.columns.findIndex(column => column.element === element);
          if (currentIndex < 0) return;
          const position = record.columns[currentIndex].items.findIndex(item => item === event.target || item.contains?.(event.target));
          if (position < 0) return;
          selected(record, currentIndex, position, 'tap'); record.columns[currentIndex].expected=record.value[currentIndex]*record.size;element.scrollTop=record.columns[currentIndex].expected;
        });
        for(const type of ['pointerdown','touchstart'])listen(record,element,type,()=>{if(!live(record))return;record.held.add(element);});
        const release=()=>{if(!record.held.delete(element)||!live(record))return;if(record.props['immediate-change'])wheelCommit(record);wheelSettle(record);};
        for(const type of ['pointerup','pointercancel','touchend','touchcancel']){listen(record,root,type,release,undefined,element);listen(record,element,type,release);}
        listen(record, element, 'scroll', () => {
          if(!live(record))return;
          const column=record.columns.find(column=>column.element===element);
          if(column&&column.expected!==undefined&&Math.abs(element.scrollTop-column.expected)<1){column.expected=undefined;return;}
          if(column)column.expected=undefined;
          wheelStart(record);wheelSettle(record);
        });
      }
      const column={element,items,expected:before?.expected};
      if(changed||controlled||record.height!==height||record.oldSize!==size){column.expected=record.value[index]*size;element.scrollTop=column.expected;}
      return column;
    });
    record.value.length = record.columns.length; record.height = height; record.oldSize = size;
    paintColumns(record);
    const layers=record.layers||[];record.layers=[];
    const owner=record.element.getAttribute('data-weapp-owner');
    for(let index=0;index<record.columns.length;index++){
      const column=record.columns[index].element;
      column.style.paddingTop=column.style.paddingBottom=Math.max(0,(height-size)/2)+'px';
      for(const [offset,type,source,classes]of [[0,'mask',mask,maskClass],[1,'indicator',indicator,indicatorClass]]){
        const layer=layers[index*2+offset]||document.createElement('div');
        layer.className='weapp-picker-view-'+type+(classes?' '+classes:'');layer.setAttribute('aria-hidden','true');layer.style.cssText=source;
        Object.assign(layer.style,{display:'block',position:'absolute',pointerEvents:'none',left:(index*100/record.columns.length)+'%',right:'auto',width:(100/record.columns.length)+'%',top:type==='mask'?'0px':(height-size)/2+'px',bottom:'auto',height:(type==='mask'?height:size)+'px',transform:'none'});
        if(type==='mask'){
          layer.style.backgroundSize='100% '+Math.max(0,(height-size)/2)+'px';
          if(!attrs['mask-style']){layer.style.backgroundImage='linear-gradient(var(--weapp-picker-mask-color,rgba(255,255,255,.95)),var(--weapp-picker-mask-edge,rgba(255,255,255,.6))),linear-gradient(0deg,var(--weapp-picker-mask-color,rgba(255,255,255,.95)),var(--weapp-picker-mask-edge,rgba(255,255,255,.6)))';layer.style.backgroundRepeat='no-repeat';layer.style.backgroundPosition='top, bottom';}
        }else layer.style.boxSizing='content-box';
        if(owner!==null)layer.setAttribute('data-weapp-owner',owner);
        record.element.append(layer);record.layers.push(layer);
      }
    }
    for(const layer of layers)if(!record.layers.includes(layer))layer.remove();

  }

  function bounds(record, x, y, loose = false) {
    const element = record.element, area = element.parentElement;
    if (!area || !area.className?.split(/\s+/).includes('weapp-movable-area')) fail('movable-view必须是movable-area直接子项');
    const css=root.getComputedStyle?.(area)||{},padding=key=>parseFloat(css[key])||0;
    const width = dimension(area, 'width', 10)-padding('paddingLeft')-padding('paddingRight'), height = dimension(area, 'height', 10)-padding('paddingTop')-padding('paddingBottom');
    const ew = (element.offsetWidth||dimension(element,'width',10)) * record.scale, eh = (element.offsetHeight||dimension(element,'height',10)) * record.scale;
    const clamp = (value, size, item) => Math.max(loose ? -item : Math.min(0, size - item), Math.min(loose ? size : Math.max(0, size - item), value));
    return [clamp(x, width, ew), clamp(y, height, eh)];
  }
  function position(record, x, y, source, loose = false) {
    [x, y] = bounds(record, x, y, loose);
    const changed = x !== record.x || y !== record.y;
    record.x = x; record.y = y;
    record.element.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + record.scale + ')';
    record.element.setAttribute('aria-label', '可移动区域，位置 ' + Math.round(x) + ', ' + Math.round(y) + '，缩放 ' + record.scale);
    if (changed) emit(record, 'change', {x, y, source});
  }
  function zoom(record, value, source) {
    if (!record.props.scale) return;
    const next = Math.max(record.minScale, Math.min(record.maxScale, value));
    if (next === record.scale) return;
    record.scale = next; position(record, record.x, record.y, source);
    emit(record, 'scale', {x: record.x, y: record.y, scale: next});
  }
  function movable(record, node, old) {
    const p = node.attrs, previousScale=record.scale;
    for (const key of ['disabled', 'out-of-bounds', 'inertia', 'scale', 'animation']) bool(p[key]);
    if (p.direction !== undefined && !['all', 'horizontal', 'vertical', 'none'].includes(p.direction)) fail('movable-view.direction无效');
    record.minScale = number(p['scale-min'], 0.5, 0.1, 10); record.maxScale = number(p['scale-max'], 10, 0.1, 10);
    if (record.minScale > record.maxScale) fail('缩放最小值不能超过最大值');
    number(p.damping, 20, 1, 1000); number(p.friction, 2, 0.1, 100);
    if (!old || old.attrs['scale-value'] !== p['scale-value'] || node.forced?.includes('scale-value')) record.scale = p.scale ? Math.max(record.minScale, Math.min(record.maxScale, number(p['scale-value'], 1, 0.1, 10))) : 1;
    const x = !old || old.attrs.x !== p.x || node.forced?.includes('x') ? number(p.x, 0) : record.x;
    const y = !old || old.attrs.y !== p.y || node.forced?.includes('y') ? number(p.y, 0) : record.y;
    Object.assign(record.element.style, {transition:p.animation===false||root.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'none':'transform 150ms ease-out',position: 'absolute', left: '0', top: '0', transformOrigin: '0 0', touchAction: p.direction === 'horizontal' ? 'pan-y' : p.direction === 'vertical' ? 'pan-x' : 'none', userSelect: 'none'});
    record.element.setAttribute('tabindex', p.disabled ? '-1' : '0'); record.element.setAttribute('role', 'group');
    if(live(record)&&record.element.parentElement?.getClientRects?.().length!==0)position(record,x,y,'');else record.pendingPosition={x,y};
    if(record.element.parentElement)observer?.observe(record.element.parentElement);
    if(old&&previousScale!==record.scale)emit(record,'scale',{x:record.x,y:record.y,scale:record.scale});
  }
  function moveGesture(record, event, phase) {
    if (!live(record) || record.props.disabled) return;
    record.processed ||= new WeakSet();if(record.processed.has(event))return;record.processed.add(event);
    if (event.type.startsWith('pointer') && event.pointerType === 'touch') return;
    const touches = event.touches || [], point = touches[0] || event.changedTouches?.[0] || event;
    if (phase === 'start') {
      if (event.button > 0 || event.isPrimary === false) return;
      clear(record);record.element.style.transition='none';
      record.gesture = {x: point.clientX, y: point.clientY, startX: record.x, startY: record.y, lastX: record.x, lastY: record.y, vx: 0, vy: 0};
      if (record.props.scale && touches.length === 2) { record.gesture.distance = Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY); record.gesture.scale = record.scale; }
      if (event.type === 'pointerdown') try { record.element.setPointerCapture?.(event.pointerId); } catch (_) {}
      return;
    }
    const start = record.gesture; if (!start) return;
    if (phase === 'move') {
      if (start.distance && touches.length === 2) { event.preventDefault(); zoom(record, start.scale * Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY) / start.distance, 'touch'); return; }
      const direction = record.props.direction || 'none'; if (direction === 'none') return;
      event.preventDefault();
      const x = ['all', 'horizontal'].includes(direction) ? start.startX + point.clientX - start.x : record.x;
      const y = ['all', 'vertical'].includes(direction) ? start.startY + point.clientY - start.y : record.y;
      position(record, x, y, 'touch', !!record.props['out-of-bounds']);
      start.vx = record.x - start.lastX; start.vy = record.y - start.lastY; start.lastX = record.x; start.lastY = record.y;
      return;
    }
    // Rebase after a pinch so the remaining finger continues from the current position.
    if (phase === 'end' && event.type === 'touchend' && touches.length) {
      record.gesture = {x: point.clientX, y: point.clientY, startX: record.x, startY: record.y, lastX: record.x, lastY: record.y, vx: 0, vy: 0};
      return;
    }
    record.gesture = null;record.element.style.transition=record.props.animation===false||root.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'none':'transform '+Math.min(500,2000/number(record.props.damping,20,1,1000))+'ms ease-out';
    position(record, record.x, record.y, phase === 'cancel' ? '' : 'out-of-bounds');
    if (phase === 'end' && record.props.inertia && !root.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      let vx = start.vx, vy = start.vy, count = 0;
      const step = () => {
        if (!live(record) || record.props.disabled || ++count > 50 || Math.abs(vx) + Math.abs(vy) < 0.5) return;
        vx *= 1 / (1 + number(record.props.friction, 2, 0.1, 100) / 10); vy *= 1 / (1 + number(record.props.friction, 2, 0.1, 100) / 10);
        const x = record.x, y = record.y; position(record, x + vx, y + vy, 'friction');
        if (x !== record.x || y !== record.y) record.timer = root.setTimeout(step, 16);
      };
      record.timer = root.setTimeout(step, 16);
    }
  }
  function selectedText(element, range, selection) {
    if (element.children.length === 1 && element.firstElementChild?.classList?.contains?.('weapp-editor')) return String(selection.toString());
    if (!document.createTreeWalker || !root.NodeFilter || !root.Range) return String(selection.toString());
    const walker = document.createTreeWalker(element, root.NodeFilter.SHOW_TEXT), parts = [];
    let node;
    while ((node = walker.nextNode())) {
      const target = node.parentElement?.closest('.weapp-text,.weapp-rich-text');
      if (!target || root.getComputedStyle(target).userSelect !== 'text' || !range.intersectsNode(node)) continue;
      const leaf = document.createRange(), part = range.cloneRange();
      leaf.selectNodeContents(node);
      if (range.compareBoundaryPoints(root.Range.START_TO_START, leaf) < 0) part.setStart(node, 0);
      if (range.compareBoundaryPoints(root.Range.END_TO_END, leaf) > 0) part.setEnd(node, node.nodeValue.length);
      parts.push(part.toString());
    }
    return parts.join('');
  }
  function selectionChanged(record) {
    if (!live(record)) return;
    const selected = document.getSelection?.() || root.getSelection?.();
    const inside = selected && record.element.contains(selected.anchorNode) && record.element.contains(selected.focusNode);
    if (!inside || selected.isCollapsed || !selected.rangeCount) {
      if (record.selectionActive) { record.selectionActive = false; record.signature = null; emit(record, 'selectionchange', {isCollapsed: true, selectedString: '', firstRangeRect: {x: 0, y: 0, width: 0, height: 0}}); }
      return;
    }
    const range = selected.getRangeAt(0), text = selectedText(record.element, range, selected); if (text.length > 65536) return;
    const box = range.getBoundingClientRect?.() || range.getClientRects?.()[0];
    const rect = {}; for (const key of ['x', 'y', 'width', 'height', 'top', 'right', 'bottom', 'left']) rect[key] = Number.isFinite(box?.[key]) ? box[key] : 0;
    const detail = {isCollapsed: false, selectedString: text, firstRangeRect: rect}, signature = JSON.stringify(detail);
    if (signature !== record.signature) { record.selectionActive = true; record.signature = signature; emit(record, 'selectionchange', detail); }
  }
  let sequence = 0;
  function create(element, tag) {
    if (!['picker-view', 'movable-view', 'movable-area', 'selection'].includes(tag)) return;
    const record = {id: ++sequence, element, tag, props: {}, listeners: [], bound: new Set(), x: 0, y: 0, scale: 1}; records.set(element, record);
    if(tag==='movable-area')for(const [name,phase]of [['touchstart','start'],['touchmove','move'],['touchend','end'],['touchcancel','cancel']])listen(record,element,name,event=>{if(!record.props['scale-area'])return;const child=[...records.values()].find(item=>item.tag==='movable-view'&&item.element.parentElement===element&&item.props.scale);if(child&&((event.touches?.length||0)>=2||child.gesture?.distance))moveGesture(child,event,phase);},{passive:false});
    if (tag === 'movable-view') {
      for (const [event, phase] of [['pointerdown', 'start'], ['pointermove', 'move'], ['pointerup', 'end'], ['pointercancel', 'cancel'], ['touchstart', 'start'], ['touchmove', 'move'], ['touchend', 'end'], ['touchcancel', 'cancel']]) listen(record, element, event, e => moveGesture(record, e, phase), {passive: false});
      listen(record, element, 'keydown', event => {
        if (!live(record) || record.props.disabled || event.target !== element) return;
        if (record.props.scale && ['+', '=', '-'].includes(event.key)) { event.preventDefault(); zoom(record, record.scale + (event.key === '-' ? -0.1 : 0.1), ''); return; }
        const direction = record.props.direction || 'none', delta = {ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10]}[event.key];
        if (!delta || direction === 'none') return;
        event.preventDefault(); position(record, record.x + (direction === 'vertical' ? 0 : delta[0]), record.y + (direction === 'horizontal' ? 0 : delta[1]), '');
      });
    }
    if (tag === 'selection') {
      listen(record, document, 'selectionchange', () => selectionChanged(record));
      listen(record, element, 'contextmenu', event => { if (record.props['disable-context-menu']) event.preventDefault(); });
    }
  }
  function patch(element, node, old) {
    const record = records.get(element); if (!record) return;
    record.props = node.attrs; record.node = node; record.old = old;
    if (record.tag === 'picker-view') {picker(record, node, old);if(!live(record)||element.getClientRects?.().length===0)record.needsInitial=true;}
    if (record.tag === 'movable-area') { bool(node.attrs['scale-area']); element.style.position = 'relative'; }
    if (record.tag === 'movable-view') movable(record, node, old);
    if (record.tag === 'selection') { bool(node.attrs['disable-context-menu']); }
  }
  function remove(element) {
    const record = records.get(element); if (!record) return;
    clear(record);record.clampPending=false;record.layers?.forEach(element=>element.remove());
    for (const [target, event, handler, settings] of record.listeners) target.removeEventListener?.(event, handler, settings);
    records.delete(element);observer?.disconnect();for(const item of records.values())if(item.tag==='movable-view'&&item.element.parentElement)observer?.observe(item.element.parentElement);
  }
  const resize = () => {
    for (const record of records.values()) if (live(record)) {
      if (record.tag === 'movable-view') position(record, record.x, record.y, '');
      if (record.tag === 'picker-view' && record.node) picker(record, record.node, record.node);
    }
  };
  const observer=typeof root.ResizeObserver==='function'?new root.ResizeObserver(resize):null;
  root.addEventListener?.('resize', resize);
  return {create, patch, remove, ownsEvent: (tag, name) => ['picker-view', 'movable-view'].includes(tag) && ['change', 'scale','pickstart','pickend'].includes(name) || tag === 'selection' && name === 'selectionchange', flush() {for(const record of records.values()){if(record.tag==='movable-view'&&record.pendingPosition&&live(record)&&record.element.parentElement?.getClientRects?.().length!==0){const {x,y}=record.pendingPosition;record.pendingPosition=null;position(record,x,y,'');}if(record.tag==='picker-view'&&record.needsInitial&&live(record)&&record.element.getClientRects?.().length!==0){picker(record,record.node,record.node);record.columns.forEach((column,index)=>{column.element.scrollTop=record.value[index]*record.size;});record.needsInitial=false;}}for(const record of records.values()){if(record.clampPending){record.clampPending=false;emit(record,'change',{value:record.value.slice()});}}}, visibility(value) { visible = value; if (!value) for (const record of records.values()) clear(record); }, dispose() { disposed = true;observer?.disconnect(); root.removeEventListener?.('resize', resize); for (const element of [...records.keys()]) remove(element); }};
}

module.exports = createInteractiveComponents;
