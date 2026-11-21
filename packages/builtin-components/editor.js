function createEditorRuntime(root, options) {
  'use strict';
  const document = root.document, records = new Map(), portals = new Map();
  const clone = value => JSON.parse(JSON.stringify(value));
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const fail = message => { throw new options.Error(message, {code: 'INVALID_ARGUMENT'}); };
  const inline = ['bold', 'italic', 'underline', 'strike', 'ins', 'script', 'color', 'backgroundColor', 'font', 'fontSize', 'fontStyle', 'fontVariant', 'fontWeight', 'fontFamily', 'letterSpacing', 'textDecoration', 'link'];
  const block = ['header', 'align', 'direction', 'indent', 'list', 'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'lineHeight', 'textIndent', 'wordWrap', 'wordBreak', 'whiteSpace'];
  const formats = new Set([...inline, ...block]);
  let visible = true, disposed = false, sequence = 0, listening = false;
  function safeStyle(value) { if (typeof value !== 'string' || value.length > 256 || /[;{}<>]|url\s*\(|expression\s*\(/i.test(value)) fail('编辑器样式值无效'); return value; }
  function source(value) {
    if (typeof value !== 'string' || !value || value.length > 2e6 || /[\u0000-\u0020]/.test(value) || /^(?:javascript|vbscript|data(?!:image\/(?:png|jpeg|gif|webp);base64,)):/i.test(value)) fail('编辑器图片或链接地址无效');
    // Package resources and opaque file handles are resolved by the same asset authority as <image>.
    if (/^[a-z][\w+.-]*:/i.test(value) && !/^(?:https?:|data:image\/(?:png|jpeg|gif|webp);base64,|nowfile:|nowsaved:|wxfile:|cloud:)/i.test(value)) fail('编辑器不支持此地址协议');
    return value;
  }
  function attributes(value = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('delta.attributes 需要对象');
    const result = {};
    for (const [name, setting] of Object.entries(value)) {
      if (setting === false || setting === null || setting === undefined) continue;
      if (['alt', 'width', 'height', 'extClass', 'data-custom', 'data-local'].includes(name)) {
        if (typeof setting !== 'string' || setting.length > 4096) fail('图片属性无效'); result[name] = setting;
      } else if (formats.has(name)) {
        if (typeof setting !== 'string' && typeof setting !== 'boolean' && typeof setting !== 'number') fail('编辑器格式无效');
        if (typeof setting === 'number' && !Number.isFinite(setting)) fail('编辑器格式数值无效');
        result[name] = typeof setting === 'string' ? name === 'link' ? source(setting) : safeStyle(setting) : setting;
      }
    }
    return result;
  }
  function normalize(delta, editorId = 0) {
    if (!delta || !Array.isArray(delta.ops) || delta.ops.length > 100000) fail('delta 需要 ops 数组');
    const units = [];
    for (const op of delta.ops) {
      if (!op || typeof op !== 'object' || Object.keys(op).some(key => !['insert', 'attributes'].includes(key))) fail('内容 delta 仅支持 insert');
      const attrs = attributes(op.attributes);
      if (typeof op.insert === 'string') for (let i = 0; i < op.insert.length; i++) units.push({insert: op.insert[i], attributes: attrs});
      else if (op.insert && typeof op.insert === 'object' && Object.keys(op.insert).length === 1) {
        const [kind, value] = Object.entries(op.insert)[0];
        if (kind === 'image') source(value);
        else if (kind === 'custom' || kind === 'customBlock') {
          const block = kind === 'custom' ? {blockId: value, editorId} : value;
          if (!block || typeof block !== 'object' || Array.isArray(block) || Object.keys(block).some(key => !['blockId','editorId'].includes(key)) || typeof block.blockId !== 'string' || !/^[\w-]{1,128}$/.test(block.blockId) || block.editorId !== undefined && (!Number.isSafeInteger(block.editorId) || block.editorId < 0)) fail('自定义区块标识或编辑器归属无效');
          units.push({insert: {customBlock: {blockId: block.blockId, editorId: block.editorId ?? editorId}}, attributes: attrs}); continue;
        }
        else if (kind !== 'divider' || value !== true) fail('不支持的 delta 嵌入内容');
        units.push({insert: clone(op.insert), attributes: attrs});
      } else fail('delta.insert 无效');
      if (units.length > 200000) fail('编辑器内容过长');
    }
    if (units.at(-1)?.insert !== '\n') units.push({insert: '\n', attributes: {}});
    return units;
  }
  function delta(units) {
    const ops = [];
    for (const unit of units) {
      const last = ops.at(-1), attrs = unit.attributes || {};
      if (typeof unit.insert === 'string' && typeof last?.insert === 'string' && equal(last.attributes || {}, attrs)) last.insert += unit.insert;
      else ops.push({insert: clone(unit.insert), ...(Object.keys(attrs).length ? {attributes: clone(attrs)} : {})});
    }
    return {ops};
  }
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const cssName = name => name.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
  function styleAttributes(attrs, line) {
    const styles = {};
    for (const [name, value] of Object.entries(attrs)) if ((line ? block : inline).includes(name)) {
      if (name === 'align') styles.textAlign = value;
      else if (name === 'indent') styles.paddingLeft = Math.max(0, Number(value) || 0) * 3 + 'em';
      else if (!['header', 'list', 'script', 'link', 'bold', 'italic', 'underline', 'strike', 'ins'].includes(name)) styles[name] = value;
    }
    if (!line) {
      if (attrs.bold) styles.fontWeight = 'bold'; if (attrs.italic) styles.fontStyle = 'italic';
      const decorations = [attrs.underline || attrs.ins ? 'underline' : '', attrs.strike ? 'line-through' : ''].filter(Boolean);
      if (decorations.length) styles.textDecoration = decorations.join(' ');
      if (attrs.script) { styles.verticalAlign = attrs.script === 'sub' ? 'sub' : 'super'; styles.fontSize = 'smaller'; }
    }
    return Object.entries(styles).map(([name, value]) => cssName(name) + ':' + value).join(';');
  }
  function markup(units) {
    let html = '', line = '';
    for (const op of delta(units).ops) {
      const attrs = op.attributes || {};
      if (typeof op.insert === 'string') {
        const parts = op.insert.split('\n');
        for (let i = 0; i < parts.length; i++) {
          let content = escape(parts[i]), style = styleAttributes(attrs, false);
          if (content && style) content = '<span style="' + escape(style) + '">' + content + '</span>';
          if (content && attrs.link) content = '<a href="' + escape(attrs.link) + '">' + content + '</a>';
          line += content;
          if (i < parts.length - 1) {
            const tag = attrs.header ? 'h' + Math.min(6, Math.max(1, Number(String(attrs.header).replace(/^h/i, '')) || 1)) : attrs.list ? 'li' : 'p';
            const style = styleAttributes(attrs, true), item = '<' + tag + (style ? ' style="' + escape(style) + '"' : '') + '>' + (line || '<br>') + '</' + tag + '>';
            html += attrs.list ? '<' + (attrs.list === 'ordered' ? 'ol' : 'ul') + ' data-list="' + escape(attrs.list) + '">' + item + '</' + (attrs.list === 'ordered' ? 'ol' : 'ul') + '>' : item;
            line = '';
          }
        }
      } else if (op.insert.image) {
        line += '<img src="' + escape(op.insert.image) + '"' + Object.entries(attrs).filter(([key]) => ['alt', 'width', 'height', 'data-custom', 'data-local'].includes(key)).map(([key, value]) => ' ' + key + '="' + escape(value) + '"').join('') + (attrs.extClass ? ' class="' + escape(attrs.extClass) + '"' : '') + '>';
      } else if (op.insert.customBlock) line += '<span data-custom-block="' + escape(op.insert.customBlock.blockId) + '" data-editor-id="' + op.insert.customBlock.editorId + '" contenteditable="false"></span>';
      else line += '<hr>';
    }
    return html;
  }
  function parse(container, editorId = 0) {
    const units = [];
    const add = (insert, attrs) => { for (let i = 0; i < insert.length; i++) units.push({insert: insert[i], attributes: {...attrs}}); };
    function walk(node, inherited = {}, lineAttrs = {}) {
      if (node.nodeType === 3) { add(node.nodeValue || '', inherited); return; }
      const tag = String(node.tagName || '').toLowerCase();
      if (['script', 'style', 'iframe', 'object', 'svg', 'math', 'template'].includes(tag)) return;
      const attrs = {...inherited}, lines = {...lineAttrs};
      const custom = node.getAttribute?.('data-custom-block');
      if (custom) { units.push({insert: {customBlock: {blockId: custom, editorId: Number(node.getAttribute('data-editor-id') ?? editorId)}}, attributes: {}}); return; }
      for (const [names, name] of [[['strong', 'b'], 'bold'], [['em', 'i'], 'italic'], [['u', 'ins'], 'underline'], [['s', 'del'], 'strike']]) if (names.includes(tag)) attrs[name] = true;
      if (tag === 'sub' || tag === 'sup') attrs.script = tag === 'sub' ? 'sub' : 'super';
      if (tag === 'a' && node.getAttribute('href')) { try { attrs.link = source(node.getAttribute('href')); } catch (_) {} }
      if (/^h[1-6]$/.test(tag)) lines.header = Number(tag[1]);
      if (tag === 'ol' || tag === 'ul') lines.list = node.getAttribute?.('data-list') || (tag === 'ol' ? 'ordered' : 'bullet');
      // CSP may leave inline style attributes unapplied. Parse only the whitelisted values via CSSOM.
      const styles = document.createElement('span').style;
      if (styles) styles.cssText = node.getAttribute?.('style') || '';
      if (styles?.fontWeight === 'bold' || Number(styles?.fontWeight) >= 600) attrs.bold = true;
      if (styles?.fontStyle === 'italic') attrs.italic = true;
      if (styles?.textDecoration?.includes('underline')) attrs.underline = true;
      if (styles?.textDecoration?.includes('line-through')) attrs.strike = true;
      if (styles) for (const name of formats) {
        const key = name === 'align' ? 'textAlign' : name;
        const value = styles[key];
        if (value && typeof value === 'string' && !['bold', 'italic', 'underline', 'strike', 'ins', 'header', 'list', 'script', 'link', 'indent'].includes(name)) {
          try { (block.includes(name) ? lines : attrs)[name] = safeStyle(value); } catch (_) {}
        }
      }
      if (tag === 'img') {
        try { const a = {}; for (const name of ['alt', 'width', 'height', 'data-custom', 'data-local']) if (node.getAttribute(name)) a[name] = node.getAttribute(name); units.push({insert: {image: source(node.getAttribute('data-editor-source') || node.getAttribute('src'))}, attributes: a}); } catch (_) {}
        return;
      }
      if (tag === 'hr') { units.push({insert: {divider: true}, attributes: {}}); return; }
      if (tag === 'br') { add('\n', lines); return; }
      if (['p', 'div', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag) && node !== container && units.length && units.at(-1).insert !== '\n') add('\n', lines);
      const start = units.length;
      for (const child of Array.from(node.childNodes || [])) walk(child, attrs, lines);
      if (['p', 'div', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag) && node !== container) {
        if (units.length === start || units.at(-1)?.insert !== '\n') add('\n', lines);
        else units.at(-1).attributes = {...units.at(-1).attributes, ...lines};
      }
    }
    walk(container);
    return normalize(delta(units));
  }
  function htmlContents(html, editorId = 0) {
    if (typeof html !== 'string' || html.length > 2e6) fail('html 需要字符串');
    // Template contents are inert: importing HTML must not start image requests before host resolution.
    const container = document.createElement('template'); container.innerHTML = html;
    const spaces=node=>{for(const child of node.childNodes||[]){if(child.nodeType===3)child.nodeValue=child.nodeValue.replace(/ /g,'\u00a0');else spaces(child);}};spaces(container.content||container);
    return parse(container.content || container, editorId);
  }
  const live = record => !disposed && records.has(record.element) && record.element.isConnected;
  const emit = (record, name, detail) => { if (live(record) && visible && options.live()) options.emit(record.element, name, detail); };
  function contents(record) { return {html: markup(record.units), text: record.units.map(unit => typeof unit.insert === 'string' ? unit.insert : '').join(''), delta: delta(record.units)}; }
  function park(record) { for (const portal of portals.values()) if (portal.owner === record) { portal.element.hidden = true; record.parking.append(portal.element); } }
  function attach(record) {
    for (const portal of portals.values()) {
      if (portal.owner !== record) continue;
      const slot = record.body.querySelector?.('[data-custom-block="' + portal.key + '"]');
      if (slot && Number(slot.getAttribute('data-editor-id')) === record.editorId) { portal.element.hidden = false; if (portal.element.parentElement !== slot) slot.append(portal.element); }
      else { portal.element.hidden = true; record.parking.append(portal.element); }
    }
  }
  function images(record) {
    return Array.from(record.body.querySelectorAll?.('img') || []).filter(image => {
      for (let parent = image.parentElement; parent && parent !== record.body; parent = parent.parentElement) if (parent.getAttribute?.('data-custom-block')) return false;
      return true;
    });
  }
  function imageTools(record) {
    const tools = record.imageTools, index = record.imageIndex, unit = record.units[index];
    if (!tools) return;
    tools.hidden = record.props['read-only'] || !unit?.insert?.image;
    if (tools.hidden) return;
    const attrs = unit.attributes, image = images(record)[record.units.slice(0, index).filter(unit => unit.insert?.image).length];
    record.imageSize.textContent = (attrs.width || image?.naturalWidth || 0) + ' × ' + (attrs.height || image?.naturalHeight || 0);
  }
  function createImageTools(record) {
    const flags = record.initial;
    if (!flags['show-img-size'] && !flags['show-img-toolbar'] && !flags['show-img-resize']) return;
    const toolbar = document.createElement('div'); toolbar.className = 'weapp-editor-image-tools'; toolbar.hidden = true; toolbar.setAttribute('contenteditable', 'false');
    const size = document.createElement('output'); size.hidden = !flags['show-img-size']; toolbar.append(size); record.imageSize = size;
    const control = (tag, label) => { const element = document.createElement(tag); element.setAttribute('aria-label', label); element.addEventListener('pointerdown', event => event.preventDefault()); toolbar.append(element); return element; };
    if (flags['show-img-toolbar']) {
      const remove = control('button', '删除图片'); remove.type = 'button'; remove.textContent = '删除图片';
      remove.addEventListener('click', event => { event.stopPropagation(); if (record.props['read-only']) return; const index = record.imageIndex; record.imageIndex = undefined; execute(record, 'deleteText', {index, length: 1}); imageTools(record); });
    }
    if (flags['show-img-resize']) {
      const width = control('input', '图片宽度百分比'); width.type = 'range'; width.min = '10'; width.max = '100'; width.value = '100';
      width.addEventListener('input', event => { event.stopPropagation(); if (record.props['read-only']) return; const next = clone(record.units); if (!next[record.imageIndex]?.insert?.image) return; next[record.imageIndex].attributes.width = width.value + '%'; changed(record, next, {...record.range}); imageTools(record); });
    }
    record.imageTools = toolbar; record.element.append(toolbar);
  }
  function paint(record) {
    // Resolve URLs before creating live elements so remote images never bypass the host.
    const sources = record.units.filter(unit => unit.insert?.image).map(unit => unit.insert.image); let imageIndex = 0;
    const html = markup(record.units).replace(/<img src="[^"]*"/g, () => { const original = sources[imageIndex++]; return '<img data-editor-source="' + escape(original) + '" src="' + escape(options.asset(original) || '') + '"'; });
    park(record); record.body.innerHTML = html.replace(/ style="/g, ' data-editor-style="');
    for (const node of Array.from(record.body.querySelectorAll?.('[data-editor-style]') || [])) { node.style.cssText = node.getAttribute('data-editor-style'); node.removeAttribute('data-editor-style'); }
    record.body.setAttribute('data-empty', String(record.units.length === 1));
    attach(record); imageTools(record);
  }
  function checkpoint(record) { return {delta: delta(record.units), range: {...record.range}}; }
  function remember(record) { record.undo.push(checkpoint(record)); if (record.undo.length > 100) record.undo.shift(); record.redo = []; }
  function changed(record, units, range, history = true, notify = true) {
    if (equal(delta(units), delta(record.units))) { if (range) { record.range = range; inherit(record); restoreSelection(record); } return; }
    const normalized = normalize(delta(units));
    for (const unit of normalized) if (unit.insert?.image) options.asset(unit.insert.image);
    if (history) remember(record);
    record.units = normalized; if (range) record.range = range;
    record.range.index = Math.min(record.range.index, record.units.length - 1);
    record.range.length = Math.min(record.range.length, record.units.length - 1 - record.range.index);
    inherit(record); paint(record); restoreSelection(record); if(notify)emit(record, 'input', contents(record));
  }
  // Browser selections use UTF-16 offsets, as do Delta indices. Embeds occupy one unit.
  function positions(record) {
    const entries = [], spans = new WeakMap(); let offset = 0, newline = true;
    const blockNode = node => /^(?:P|DIV|LI|BLOCKQUOTE|H[1-6])$/.test(node.tagName);
    function lineBreak(node, at) { entries.push({node, offset, length: 1, line: true, point: [node, at]}); offset++; newline = true; }
    function walk(node) {
      const children = Array.from(node.childNodes || []), isBlock = node !== record.body && blockNode(node);
      if (isBlock && !newline) lineBreak(node.parentNode, Array.from(node.parentNode.childNodes).indexOf(node));
      const start = offset;
      if (node.nodeType === 3) {
        const text = node.nodeValue || ''; entries.push({node, offset, length: text.length}); offset += text.length;
        if (text.length) newline = text.endsWith('\n');
      } else if (node !== record.body && (node.getAttribute?.('data-custom-block') || ['IMG', 'HR'].includes(node.tagName))) {
        entries.push({node, offset, length: 1, embed: true}); offset++; newline = false;
      } else if (node.tagName === 'BR') {
        // A sole <br> is the browser's placeholder for an empty paragraph.
        if (!blockNode(node.parentNode) || node.parentNode.childNodes.length !== 1) lineBreak(node.parentNode, Array.from(node.parentNode.childNodes).indexOf(node));
      } else for (const child of children) walk(child);
      const contentEnd = offset;
      if (isBlock && (offset === start || !newline)) lineBreak(node, children.length === 1 && children[0].tagName === 'BR' ? 0 : children.length);
      spans.set(node, {start, contentEnd, end: offset});
    }
    walk(record.body); return {entries, spans};
  }
  function selection(record) { return record.body.getRootNode?.().getSelection?.() || root.getSelection?.(); }
  function inherit(record) {
    record.pendingFormat = false;
    const {index, length} = record.range, at = index + (length || !index ? 0 : -1);
    const attrs = record.units[at]?.attributes || {}, line = record.units.slice(index).find(unit => unit.insert === '\n')?.attributes || {};
    record.active = Object.fromEntries([...inline, ...block].filter(name => (block.includes(name) ? line : attrs)[name] !== undefined).map(name => [name, (block.includes(name) ? line : attrs)[name]]));
  }
  function readSelection(record) {
    if (!record.focused || record.composing) return;
    const selected = selection(record); if (!selected?.rangeCount) return;
    const range = selected.getRangeAt(0); if (!record.body.contains(range.startContainer) || !record.body.contains(range.endContainer)) return;
    for (const boundary of [range.startContainer, range.endContainer]) for (let node = boundary; node && node !== record.body; node = node.parentNode || node.parentElement) if (node.getAttribute?.('data-custom-block')) return;
    const {spans} = positions(record);
    const index = (node, at) => {
      const span = spans.get(node); if (!span) return 0;
      if (node.nodeType === 3) return span.start + Math.min((node.nodeValue || '').length, at);
      const child = node.childNodes?.[at]; return child ? spans.get(child)?.start ?? span.contentEnd : span.contentEnd;
    };
    const start = Math.min(index(range.startContainer, range.startOffset), record.units.length - 1), end = Math.min(index(range.endContainer, range.endOffset), record.units.length - 1);
    const next = {index: start, length: Math.max(0, end - start)};
    if (!equal(next, record.range)) { record.range = next; inherit(record); }
  }
  function nativeRange(record, value) {
    if (!document.createRange) return null;
    const {entries} = positions(record), range = document.createRange();
    function point(index) {
      const entry = entries.find(item => item.offset === index) || entries.find(item => !item.line && index >= item.offset && index <= item.offset + item.length);
      if (!entry) return [record.body, record.body.childNodes.length];
      if (entry.line) return entry.point;
      if (entry.embed) return [entry.node.parentNode, Array.from(entry.node.parentNode.childNodes).indexOf(entry.node) + (index > entry.offset ? 1 : 0)];
      return [entry.node, Math.min(entry.length, index - entry.offset)];
    }
    range.setStart(...point(value.index)); range.setEnd(...point(value.index + value.length)); return range;
  }
  function restoreSelection(record) {
    if (!record.focused || record.composing) return;
    const range = nativeRange(record, record.range), selected = selection(record);
    if (range && selected) { selected.removeAllRanges(); selected.addRange(range); }
  }
  function bounds(record, range) {
    const rect = nativeRange(record, range)?.getBoundingClientRect?.() || record.body.getBoundingClientRect?.() || {};
    return Object.fromEntries(['left', 'top', 'right', 'bottom', 'width', 'height'].map(name => [name, Number(rect[name]) || 0]));
  }
  function selectionChanged() {
    for (const record of records.values()) {
      if (!record.focused || record.composing || !live(record)) continue;
      const previous = {...record.range}; readSelection(record);
      if (equal(previous, record.range)) continue;
      inherit(record);
      emit(record, 'statuschange', {...record.active});
    }
  }
  function rangeArgument(record, value) {
    const index = value.index, length = value.length === undefined ? 0 : value.length;
    if (!Number.isSafeInteger(index) || !Number.isSafeInteger(length) || index < 0 || length < 0 || index + length > record.units.length - 1) fail('选区超出编辑器内容范围');
    return {index, length};
  }
  function insert(record, units) {
    readSelection(record); const {index, length} = record.range;
    const next = record.units.slice(); next.splice(index, length, ...units);
    changed(record, next, {index: index + units.length, length: 0});
  }
  function format(record, name, value) {
    if (!formats.has(name)) fail('不支持的编辑器格式 ' + name);
    if (['bold', 'italic', 'underline'].includes(name) && record.props['enable-formats'] && !record.props['enable-formats'].includes(name)) return;
    readSelection(record);
    const normalized = attributes({[name]: value === undefined ? true : value});
    const {index, length} = record.range, active = length ? record.units[index]?.attributes || {} : record.active;
    const setting = active[name] === normalized[name] || value === false || value === null ? undefined : normalized[name];
    function apply(attrs) {
      if (setting !== undefined) { attrs[name] = setting; return; }
      delete attrs[name];
      if (name === 'bold' && (attrs.fontWeight === 'bold' || Number(attrs.fontWeight) >= 600)) delete attrs.fontWeight;
      if (name === 'italic' && attrs.fontStyle === 'italic') delete attrs.fontStyle;
      if (['underline', 'strike', 'ins'].includes(name) && attrs.textDecoration) {
        const token = name === 'strike' ? 'line-through' : 'underline';
        const remaining = String(attrs.textDecoration).split(/\s+/).filter(value => value !== token).join(' ');
        if (remaining) attrs.textDecoration = remaining; else delete attrs.textDecoration;
      }
    }
    record.active = {...active}; apply(record.active);
    const next = clone(record.units);
    let start = index, end = index + length;
    if (block.includes(name)) { if (length) end--; while (start > 0 && next[start - 1].insert !== '\n') start--; while (end < next.length && next[end].insert !== '\n') end++; end++; }
    for (let i = start; i < Math.min(end, next.length); i++) {
      if (block.includes(name) && next[i].insert !== '\n') continue;
      apply(next[i].attributes);
    }
    const pending = record.active;
    if (!equal(delta(next), delta(record.units))) changed(record, next, {...record.range});
    if (!length) { record.active = pending; record.pendingFormat = true; }
    emit(record, 'statuschange', {...record.active});
  }
  function execute(record, method, value = {}) {
    if (!live(record)) throw new options.Error('编辑器已销毁', {code: 'PAGE_UNLOADED'});
    if (['format', 'clear', 'insertText', 'insertImage', 'insertDivider', 'insertCustomBlock', 'deleteText', 'removeFormat', 'undo', 'redo'].includes(method) && record.props['read-only']) fail('编辑器为只读');
    if (method === 'format') { format(record, value.name, value.value); return {}; }
    if (method === 'getContents') return contents(record);
    if (method === 'setContents') { const units = value.delta !== undefined ? normalize(value.delta, record.editorId) : htmlContents(value.html === undefined ? '' : value.html, record.editorId); changed(record, units, {index: 0, length: 0}, false, false); record.undo = []; record.redo = []; return {}; }
    if (method === 'clear') { changed(record, normalize({ops: []}), {index: 0, length: 0}); return {}; }
    if (method === 'insertText') { if (typeof value.text !== 'string' || value.text.length > 200000) fail('insertText.text 需要字符串'); insert(record, value.text.split('').map(insert => ({insert, attributes: {...record.active}}))); return {}; }
    if (method === 'insertImage') {
      source(value.src); const attrs = {};
      for (const key of ['alt', 'width', 'height', 'extClass']) if (value[key] !== undefined) { if (typeof value[key] !== 'string') fail('图片属性需要字符串'); attrs[key] = value[key]; }
      for (const key of ['width', 'height']) if (attrs[key] && !/^\d+(?:\.\d+)?(?:px|%)?$/.test(attrs[key])) fail('图片尺寸无效');
      if (value.data !== undefined) { if (!value.data || typeof value.data !== 'object' || Array.isArray(value.data)) fail('图片 data 需要对象'); attrs['data-custom'] = Object.entries(value.data).map(([key, item]) => key + '=' + item).join(';'); }
      if (/^(?:nowfile|wxfile):/.test(value.src)) attrs['data-local'] = value.src;
      if (value.nowrap !== undefined && typeof value.nowrap !== 'boolean') fail('nowrap 需要布尔值');
      insert(record, [{insert: {image: value.src}, attributes: attributes(attrs)}, ...(value.nowrap ? [] : [{insert: '\n', attributes: {}}])]); return {};
    }
    if (method === 'insertDivider') { insert(record, [{insert: {divider: true}, attributes: {}}, {insert: '\n', attributes: {}}]); return {}; }
    if (method === 'insertCustomBlock') {
      if (value.nowrap !== undefined && typeof value.nowrap !== 'boolean') fail('nowrap 需要布尔值');
      let blockId; do { blockId = 'now-block-' + options.scope + '-' + (++sequence); } while (record.units.some(unit => unit.insert?.customBlock?.blockId === blockId));
      insert(record, [{insert: {customBlock: {blockId, editorId: record.editorId}}, attributes: {}}, ...(value.nowrap ? [] : [{insert: '\n', attributes: {}}])]); return {blockId};
    }
    if (method === 'deleteText') { const range = rangeArgument(record, value), next = record.units.slice(); next.splice(range.index, range.length); changed(record, next, {index: range.index, length: 0}); return {}; }
    if (method === 'setSelection') { record.range = rangeArgument(record, value); inherit(record); record.body.focus?.(); record.focused = true; restoreSelection(record); return {}; }
    if (method === 'getBounds') return {bounds: bounds(record, rangeArgument(record, value))};
    if (method === 'getSelection') { readSelection(record); return {range: {...record.range}, bounds: bounds(record, record.range)}; }
    if (method === 'getSelectionText') { readSelection(record); return {text: record.focused ? record.units.slice(record.range.index, record.range.index + record.range.length).map(unit => typeof unit.insert === 'string' ? unit.insert : '').join('') : ''}; }
    if (method === 'getHistoryState') return {canUndo: record.undo.length > 0, canRedo: record.redo.length > 0};
    if (method === 'undo' || method === 'redo') { const from = record[method], target = record[method === 'undo' ? 'redo' : 'undo']; const previous = from.pop(); if (previous) { target.push(checkpoint(record)); changed(record, normalize(previous.delta), previous.range, false); } return {}; }
    if (method === 'removeFormat') { readSelection(record); const next = clone(record.units); for (let i = record.range.index; i < record.range.index + record.range.length; i++) for (const name of formats) delete next[i].attributes[name]; changed(record, next, {...record.range}); record.active = {}; record.pendingFormat = !record.range.length; emit(record, 'statuschange', {}); return {}; }
    if (method === 'blur') { record.body.blur?.(); record.focused = false; return {}; }
    if (method === 'scrollIntoView') { const range = nativeRange(record, record.range); const node = range?.startContainer; (node?.parentElement || record.body).scrollIntoView?.({block: 'nearest'}); return {}; }
    fail('不支持的编辑器方法');
  }
  function create(element, tag) {
    if (tag === 'editor-portal') {
      const names = ['input', 'beforeinput', 'paste', 'compositionstart', 'compositionupdate', 'compositionend', 'keydown'];
      const stop = event => event.stopPropagation();
      for (const name of names) element.addEventListener(name, stop);
      portals.set(element, {element, key: '', owner: null, names, stop});
      element.hidden = true; element.setAttribute('contenteditable', 'false'); return;
    }
    if (tag !== 'editor') return;
    const body = document.createElement('div'); body.className = 'weapp-editor-content ql-editor'; element.append(body);
    const ids = createEditorRuntime.editorIds || (createEditorRuntime.editorIds = new WeakMap());
    let state = ids.get(document); if (!state) { state = {next: 0}; ids.set(document, state); }
    const record = {element, body, editorId: state.next++, parking: document.createDocumentFragment?.() || document.createElement('div'), props: {}, units: normalize({ops: []}), range: {index: 0, length: 0}, active: {}, undo: [], redo: [], listeners: [], focused: false, ready: false};
    records.set(element, record);
    if (!listening) { document.addEventListener?.('selectionchange', selectionChanged); listening = true; }
    element.weappEditorContext = options.createContext((method, value) => execute(record, method, value));
    function on(name, callback) {
      const listener = event => {
        // Portal controls own their input, paste, composition and keyboard behavior.
        for (let node = event.target; node && node !== body; node = node.parentNode || node.parentElement) if (node.getAttribute?.('data-custom-block')) return;
        callback(event);
      };
      body.addEventListener(name, listener); record.listeners.push([name, listener]);
    }
    on('input', event => {
      event.stopPropagation(); if (!visible || !options.live() || record.props['read-only'] || record.composing) return;
      const units = parse(body, record.editorId);
      // Preserve native selection and IME state; painting on each keystroke resets both.
      if (!equal(delta(units), delta(record.units))) { remember(record); record.units = units; readSelection(record); body.setAttribute('data-empty', String(units.length === 1)); emit(record, 'input', contents(record)); }
    });
    on('beforeinput', event => {
      if (record.props['read-only']) { event.preventDefault(); return; }
      readSelection(record);
      if (!record.composing && event.inputType === 'insertText' && event.data && (record.pendingFormat || Object.keys(record.active).length)) { event.preventDefault(); execute(record, 'insertText', {text: event.data}); }
    });
    on('click', event => {
      const image = event.target, all = images(record), imageIndex = all.indexOf(image);
      if (imageIndex >= 0) { record.imageIndex = record.units.map((unit, index) => unit.insert?.image ? index : -1).filter(index => index >= 0)[imageIndex]; imageTools(record); }
      else if (!record.imageTools?.contains(event.target)) { record.imageIndex = undefined; imageTools(record); }
    });
    on('compositionstart' , () => { record.composing = true; });
    on('compositionend', () => { record.composing = false; body.dispatchEvent(new root.Event('input', {bubbles: true})); });
    on('focus', event => { event.stopPropagation(); record.focused = true; emit(record, 'focus', contents(record)); });
    on('blur', event => { event.stopPropagation(); readSelection(record); record.focused = false; emit(record, 'blur', contents(record)); });
    on('keydown', event => {
      if (record.props['read-only']) return;
      if (event.key === 'Enter' && record.props['confirm-hold'] === false && !event.isComposing) { event.preventDefault(); execute(record, 'blur'); }
      if ((event.ctrlKey || event.metaKey) && ['b', 'i', 'u'].includes(event.key.toLowerCase())) { event.preventDefault(); execute(record, 'format', {name: {b:'bold', i:'italic', u:'underline'}[event.key.toLowerCase()]}); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); execute(record, event.shiftKey ? 'redo' : 'undo'); }
    });
    on('paste', event => { if (record.props['read-only']) return; event.preventDefault(); execute(record, 'insertText', {text: event.clipboardData?.getData('text/plain') || ''}); });
    paint(record);
  }
  function patch(element, node) {
    const record = records.get(element);
    if (record) {
      const props = node.attrs;
      for (const key of ['read-only', 'show-img-size', 'show-img-toolbar', 'show-img-resize', 'confirm-hold']) if (props[key] !== undefined && typeof props[key] !== 'boolean') fail('editor.' + key + ' 需要布尔值');
      if (props['enable-formats'] !== undefined && (!Array.isArray(props['enable-formats']) || props['enable-formats'].some(name => typeof name !== 'string'))) fail('enable-formats 需要字符串数组');
      record.props = props;
      if (!record.initial) { record.initial = {...props}; createImageTools(record); }
      imageTools(record);
      record.body.setAttribute('contenteditable', String(!props['read-only'])); record.body.setAttribute('role', 'textbox'); record.body.setAttribute('aria-multiline', 'true'); record.body.setAttribute('aria-readonly', String(!!props['read-only'])); record.body.setAttribute('data-placeholder', String(props.placeholder || '')); record.body.setAttribute('aria-label', String(props.placeholder || '富文本编辑器')); record.body.setAttribute('enterkeyhint', props.enterkeyhint || 'enter');
    }
    const portal = portals.get(element);
    if (portal) {
      if (typeof node.attrs.key !== 'string' || !/^[\w-]{1,128}$/.test(node.attrs.key)) fail('editor-portal.key 需要区块标识');
      portal.key = node.attrs.key;
      let parent = node.logicalParent; while (parent && parent.tag !== 'editor') parent = parent.logicalParent;
      portal.owner = records.get(parent?.element);
      if (!portal.owner) fail('editor-portal 必须位于 editor 内');
      for (const other of portals.values()) if (other !== portal && other.owner === portal.owner && other.key === portal.key) fail('editor-portal.key 不能重复');
    }
  }
  function flush() {
    for (const record of records.values()) {
      attach(record); restoreSelection(record);
      if (!record.ready && live(record) && visible && options.live()) { record.ready = true; emit(record, 'ready', {}); }
      // Asset resolution may complete after the editor's content commit.
      for (const image of images(record)) {
        const original = image.getAttribute('data-editor-source');
        if (original) { const resolved = options.asset(original); if (resolved && image.getAttribute('src') !== resolved) image.setAttribute('src', resolved); }
      }
    }
  }
  function remove(element) {
    const record = records.get(element);
    if (record) { for (const [name, listener] of record.listeners) record.body.removeEventListener(name, listener); record.imageTools?.remove();records.delete(element); delete element.weappEditorContext; }
    const portal = portals.get(element);
    if (portal) for (const name of portal.names) element.removeEventListener(name, portal.stop);
    portals.delete(element);
    if (listening && !records.size) { document.removeEventListener?.('selectionchange', selectionChanged); listening = false; }
  }
  return {create, patch, flush, remove, prepare(element) { const record = records.get(element); if (record) readSelection(record); }, execute(nodeId, method, value) { const record = [...records.values()].find(record => record.nodeId === nodeId); if (!record) throw new options.Error('编辑器已销毁', {code: 'PAGE_UNLOADED'}); return execute(record, method, value); }, identify(element, nodeId) { const record = records.get(element); if (record) record.nodeId = nodeId; }, visibility(value) { visible = value; if (!value) for (const record of records.values()) { record.body.blur?.(); record.focused = false; } }, dispose() { for (const element of records.keys()) remove(element); for (const element of portals.keys()) remove(element); document.removeEventListener?.('selectionchange', selectionChanged); disposed = true; }};
}

module.exports = createEditorRuntime;
