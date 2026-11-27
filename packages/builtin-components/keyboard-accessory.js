function createKeyboardAccessoryRuntime(root, options) {
  'use strict';
  const document = root.document, owners = new Map(), records = new Map();
  let themeObserver=null;
  let visible = true, realmActive = true, watching = false, disposed = false, syncing = false, scheduled = false;
  const fail = message => { throw new options.Error(message, {code:'INVALID_ARGUMENT'}); };
  function active(element) { return document.activeElement === element || element.getRootNode?.().activeElement === element; }
  function geometry() {
    const native = root.__nowNativeEnvironment, viewport = root.visualViewport;
    const height = viewport?.scale > 1 && !native ? 0 : native ? Math.max(0, Number(native.keyboardHeight) || 0) : viewport ? Math.max(0, (root.innerHeight || 0) - viewport.height - (viewport.offsetTop || 0)) : 0;
    return {height, top: native && Number.isFinite(native.keyboardTop) ? native.keyboardTop : viewport && !native ? viewport.height + (viewport.offsetTop || 0) : Math.max(0, (root.innerHeight || 0) - height), left: native && Number.isFinite(native.keyboardLeft) ? Math.max(0,native.keyboardLeft) : viewport?.offsetLeft || 0, width: native?.keyboardWidth > 0 ? native.keyboardWidth : viewport?.width || root.innerWidth || document.documentElement?.clientWidth || 0};
  }
  function queue() {
    if (scheduled || disposed) return; scheduled = true;
    Promise.resolve().then(() => { scheduled = false; if (!disposed) flush(); });
  }
  function hide(owner) {
    if (owner.open) { try { owner.overlay.hidePopover?.(); } catch (_) {} owner.open = false; }
    if (owner.overlay) { owner.overlay.hidden = true; owner.overlay.remove(); }
    owner.pressed = false;
    const previous = owner.height; owner.height = 0; return previous !== 0;
  }
  function container(owner) {
    if (owner.overlay) return owner.overlay;
    const overlay = document.createElement('div'); owner.overlay = overlay;
    overlay.setAttribute('data-now-ui','keyboard-accessory'); overlay.setAttribute('role','toolbar'); overlay.setAttribute('aria-label','键盘辅助工具栏'); overlay.setAttribute('popover','manual'); overlay.hidden = true;
    Object.assign(overlay.style,{position:'fixed',inset:'auto',margin:'0',border:'0',padding:'0',minWidth:'0',maxWidth:'none',maxHeight:'200px',boxSizing:'border-box',overflowY:'auto',overflowX:'hidden',background:'transparent',color:'inherit',font:'inherit',zIndex:'2147483001'});
    const on = (name, listener, settings) => { overlay.addEventListener(name,listener,settings); owner.overlayListeners.push([name,listener,settings]); };
    on('pointerdown', event => {
      owner.pressed = true;
      let target = event.target, editable = false;
      for (; target && target !== overlay; target = target.parentElement) if (['INPUT','TEXTAREA','SELECT'].includes(target.tagName) || target.isContentEditable) editable = true;
      if (owner.node.attrs['hold-keyboard'] === true && !editable && event.cancelable) event.preventDefault();
    });
    on('click', () => { owner.pressed = false; queue(); });
    on('pointercancel', () => { owner.pressed = false; queue(); });
    return overlay;
  }
  function create(element, tag) {
    if (tag === 'input' || tag === 'textarea') owners.set(element,{element,tag,node:null,items:new Set(),parking:document.createElement('div'),height:0,open:false,listeners:[],overlayListeners:[]});
    if (tag === 'keyboard-accessory') { watch(); records.set(element,{element,owner:null,node:null}); element.hidden = true; }
  }
  function children(element, node) {
    const owner = owners.get(element); if (!owner || !node.children?.length) return null;
    owner.node = node; return owner.parking;
  }
  function patch(element, node) {
    const owner = owners.get(element); if (owner) owner.node = node;
    const record = records.get(element); if (!record) return;
    const parent = node.logicalParent;
    if (!parent || !['input','textarea'].includes(parent.tag) || !owners.has(parent.element)) fail('keyboard-accessory 必须直接位于 input 或 textarea 内');
    const next = owners.get(parent.element); next.node = parent;
    if (record.owner && record.owner !== next) record.owner.items.delete(record);
    record.owner = next; record.node = node; next.items.add(record);
    if (!next.listening) {
      next.listening = true;
      for (const type of ['focus','blur']) { const listener = () => queue(); next.element.addEventListener(type,listener); next.listeners.push([type,listener]); }
    }
    Object.assign(element.style,{maxHeight:'200px',boxSizing:'border-box',flexShrink:'0',overflowY:'auto'});
    resize?.observe(element);
  }
  const resize = typeof root.ResizeObserver === 'function' ? new root.ResizeObserver(queue) : null;
  function flush() {
    if (disposed || syncing) return; syncing = true; let changed = false;
    try {
      const info = geometry();
      for (const owner of owners.values()) {
        const items = [...owner.items].filter(record => !record.node?.attrs.hidden);
        const current = owner.overlay?.getRootNode?.().activeElement || document.activeElement;
        const focused = active(owner.element) || owner.overlay?.contains?.(current) || owner.pressed;
        const portrait = !(root.innerWidth > root.innerHeight);
        const allowed = visible && realmActive && portrait && info.height > 0 && owner.element.isConnected && owner.node && !owner.node.attrs.disabled && options.live(owner.node) && focused && items.length;
        if (!allowed) { changed = hide(owner) || changed; continue; }
        const overlay = container(owner), inherited = root.getComputedStyle?.(owner.element);
        let theme;for(let node=owner.element;node;node=node.parentElement||node.getRootNode?.().host){const value=node.getAttribute?.('data-weui-theme');if(value==='light'||value==='dark'){theme=value;break;}}if(theme&&overlay.getAttribute('data-weui-theme')!==theme)overlay.setAttribute('data-weui-theme',theme);else if(!theme&&overlay.getAttribute('data-weui-theme')!==null)overlay.removeAttribute('data-weui-theme');
        const themeScope=owner.element.getRootNode?.();if(themeScope?.host)themeObserver?.observe(themeScope,{attributes:true,subtree:true,attributeFilter:['data-weui-theme']});
        if (inherited) for (const name of ['fontFamily','fontSize','fontWeight','fontStyle','letterSpacing','color']) overlay.style[name] = inherited[name];
        let language = ''; for (let node = owner.element; node; node = node.parentElement || node.getRootNode?.().host) { const value = node.getAttribute?.('lang'); if (value !== null && value !== undefined) { language = value; break; } } overlay.lang = language;
        const scope = owner.element.getRootNode?.();
        const mount = scope?.host ? scope : options.mount;
        if (overlay.parentNode !== mount && overlay.parentElement !== mount) mount.append(overlay);
        for (const record of owner.items) {
          record.element.hidden = !!record.node?.attrs.hidden;
          if (record.element.parentElement !== overlay) overlay.append(record.element);
        }
        overlay.hidden = false;
        Object.assign(overlay.style,{left:info.left+'px',width:Math.max(0,info.width)+'px',top:'0px',height:'auto',maxHeight:'200px'});
        if (!owner.open && typeof overlay.showPopover === 'function') { try { overlay.showPopover(); owner.open = true; } catch (_) {} }
        const measured = Number(overlay.getBoundingClientRect?.().height) || items.reduce((height,record) => height + (Number(record.element.getBoundingClientRect?.().height) || parseFloat(root.getComputedStyle?.(record.element)?.height) || parseFloat(record.element.style.height) || 0),0);
        const height = Math.min(200, Math.max(0,measured));
        overlay.style.top = Math.max(0,info.top-height)+'px';
        if (owner.height !== height) { owner.height = height; changed = true; }
      }
    } finally { syncing = false; }
    if (changed) options.layout?.();
  }
  function remove(element) {
    const record = records.get(element);
    if (record) { resize?.unobserve(element); record.owner?.items.delete(record); records.delete(element); record.element.remove(); queue(); }
    const owner = owners.get(element);
    if (owner) {
      hide(owner);
      for (const [type,listener] of owner.listeners) owner.element.removeEventListener(type,listener);
      for (const [type,listener,settings] of owner.overlayListeners) owner.overlay?.removeEventListener(type,listener,settings);
      for (const record of owner.items) { record.element.hidden = true; owner.parking.append(record.element); }
      owner.items.clear(); owners.delete(element);
    }
    if (!records.size) unwatch();
  }
  const cancel = () => { for (const owner of owners.values()) owner.pressed = false; queue(); };
  const blur = event => { if (event.target !== root && event.target !== document) return; realmActive = false; cancel(); };
  const focus = event => { if (event.target !== root && event.target !== document) return; realmActive = true; queue(); };
  function watch() {
    if (watching) return; watching = true; realmActive = true;
    if(typeof root.MutationObserver==='function'&&document.documentElement){themeObserver=new root.MutationObserver(queue);themeObserver.observe(document.documentElement,{attributes:true,subtree:true,attributeFilter:['data-weui-theme']});}
    root.addEventListener?.('now-native-environment',queue); root.addEventListener?.('resize',queue); root.addEventListener?.('blur',blur); root.addEventListener?.('focus',focus);
    root.visualViewport?.addEventListener?.('resize',queue); root.visualViewport?.addEventListener?.('scroll',queue);
    document.addEventListener?.('pointerup',cancel); document.addEventListener?.('pointercancel',cancel);
  }
  function unwatch() {
    if (!watching) return; watching = false;
    themeObserver?.disconnect();themeObserver=null;
    root.removeEventListener?.('now-native-environment',queue); root.removeEventListener?.('resize',queue); root.removeEventListener?.('blur',blur); root.removeEventListener?.('focus',focus);
    root.visualViewport?.removeEventListener?.('resize',queue); root.visualViewport?.removeEventListener?.('scroll',queue);
    document.removeEventListener?.('pointerup',cancel); document.removeEventListener?.('pointercancel',cancel);
  }
  return {create,children,patch,flush,remove,height:element=>owners.get(element)?.height || 0,visibility(value) { visible = value; if (!value) for (const owner of owners.values()) hide(owner); else flush(); },dispose() {
    disposed = true; resize?.disconnect();
    unwatch();
    for (const element of [...records.keys(),...owners.keys()]) remove(element);
  }};
}

module.exports = createKeyboardAccessoryRuntime;
