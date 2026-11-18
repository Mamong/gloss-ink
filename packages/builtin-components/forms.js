function createFormRuntime(root, ErrorType, settings) {
  const defaults = new WeakMap(), groups = new WeakMap(), eventDetails = new WeakMap(); let nextGroup = 0;
  const controls = new Set(['input','textarea','switch','slider','picker']), groupTags = new Set(['radio-group','checkbox-group']);
  const error = message => new ErrorType(message, {code:'INVALID_ARGUMENT', operation:'form'});
  function checkedItems(node) {
    const result = [];
    function walk(nodes) { for (const child of nodes || []) { if (groupTags.has(child.tag)) continue; if (child.tag === 'radio' || child.tag === 'checkbox') result.push(child); else walk(child.children); } }
    walk(node.children); return result;
  }
  function value(node) {
    if(node.tag==='picker')return settings.picker.value(node.element);
    if (node.tag === 'switch') return !!node.element.checked;
    if (node.tag === 'slider') return Number(node.element.value);
    if (groupTags.has(node.tag)) {
      const selected = checkedItems(node).filter(child => child.element.checked && !child.element.disabled);
      return node.tag === 'radio-group' ? String(selected[0]?.attrs.value ?? '') : selected.map(child => String(child.attrs.value ?? ''));
    }
    return String(node.element.value ?? '');
  }
  function sync(nodes) {
    for (const node of nodes) {
      const controller = settings.component(node.element);
      if (controls.has(node.tag) || node.tag === 'radio' || node.tag === 'checkbox') {
        if (!defaults.has(node.element)) defaults.set(node.element, {value:node.tag==='picker'?settings.picker.value(node.element):node.element.value,checked:!!node.element.checked});
      }
      if (controller?.formField && !defaults.has(node.element)) defaults.set(node.element, {custom: JSON.parse(JSON.stringify(controller.value))});
      if (node.tag === 'radio-group') {
        if (!groups.has(node.element)) groups.set(node.element, 'now-radio-' + settings.scope + '-' + (++nextGroup));
        for (const child of checkedItems(node)) child.element.name = groups.get(node.element);
      }
      sync(node.children || []);
    }
  }
  function collect(form, reset = false) {
    const result = Object.create(null);
    function assign(name, value) {
      if (name === undefined || name === '') return;
      if (typeof name !== 'string' || name.length > 128 || ['__proto__','prototype','constructor'].includes(name)) throw error('表单控件 name 无效');
      result[name] = value;
    }
    function walk(nodes) {
      for (const node of nodes || []) {
        if (node.tag === 'form') continue;
        const controller = settings.component(node.element), initial = defaults.get(node.element);
        if (reset && initial) {
          if(node.tag==='picker')settings.picker.reset(node.element);
          else if (controller?.formField) settings.resetField(controller.id,initial.custom);
          else { node.element.value = initial.value; node.element.checked = initial.checked; }
        }
        if (controller?.formField) { if (!reset && !node.attrs.disabled) assign(controller.name, JSON.parse(JSON.stringify(controller.value))); continue; }
        if (groupTags.has(node.tag)) { if (reset) walk(node.children); else assign(node.attrs.name,value(node)); continue; }
        if (controls.has(node.tag) && !reset && !node.element.disabled) assign(node.attrs.name,value(node));
        walk(node.children);
      }
    }
    walk(form.children);if(reset)settings.changed?.(); return result;
  }
  function detail(node, event) {
    if (node.tag === 'form' && ['submit','reset'].includes(event.type)) {
      event.preventDefault();
      if (eventDetails.has(event)) return eventDetails.get(event);
      if (event.type === 'submit' && node.attrs['report-submit'] !== undefined && node.attrs['report-submit'] !== false) throw new ErrorType('平台不提供微信 formId', {code:'UNKNOWN_METHOD',operation:'form.submit'});
      const result = event.type === 'submit' ? {value:collect(node)} : (collect(node,true),{}); eventDetails.set(event,result); return result;
    }
    if (groupTags.has(node.tag) || node.tag === 'slider') return {value:value(node)};
    return null;
  }
  function create(element, tag) {
    if (tag === 'form') for (const name of ['submit','reset']) element.addEventListener(name,event=>detail(settings.node(element),event));
    if (tag === 'button') element.addEventListener('click', event => {
      const node = settings.node(element), kind = node?.attrs['form-type'] ?? node?.attrs.formType; if (!kind) return;
      if (!['submit','reset'].includes(kind)) throw error('button.form-type 无效');
      event.preventDefault();
      Promise.resolve().then(() => {
        if (!settings.live() || !element.isConnected || element.disabled) return;
        let parent = element.parentElement;
        while (parent && parent !== settings.mount) { const form = settings.node(parent); if (form?.tag === 'form') { parent.dispatchEvent(new root.CustomEvent(kind,{bubbles:false,cancelable:true})); return; } parent = parent.parentElement; }
      });
    });
  }
  return {sync, detail, create};
}

module.exports = createFormRuntime;
