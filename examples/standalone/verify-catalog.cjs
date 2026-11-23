'use strict';
const assert = require('node:assert/strict');
module.exports = async function verifyCatalog(browser, origin) {
  const page = await browser.newPage({viewport: {width: 720, height: 900}});
  const errors = [], checks = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.cspViolations = [];
    document.addEventListener('securitypolicyviolation', event => window.cspViolations.push(event.violatedDirective));
    // Explicit host geometry exercises the real controller without claiming a
    // desktop Chrome session has a physical software keyboard.
    window.__nowNativeEnvironment = {keyboardHeight: 200, keyboardTop: 600, keyboardWidth: 720};
  });
  try {
    await page.goto(origin + '/?catalog');
    try {await page.waitForFunction(() => window.acceptance?.view.isIdle());}
    catch (error) {throw new Error('Catalog startup failed: ' + JSON.stringify(errors), {cause: error});}
    assert.deepEqual(errors, []);
    // An unmounted portal lives outside the document; mount it before querying.
    const mountPortal = () => page.evaluate(() => new Promise((resolve, reject) => {
      document.querySelector('#catalog-editor').weappEditorContext.setContents({
        delta: {ops: [{insert: {custom: 'catalog-block'}}, {insert: '\n'}]}, success: resolve, fail: reject
      });
    }));
    await mountPortal();
    await page.locator('#catalog-input').focus();
    await page.waitForFunction(() => !!document.querySelector('#catalog-keyboard-accessory'));
    const snapshot = () => page.evaluate(() => Object.fromEntries(Object.entries(acceptance.observations).map(([tag, observation]) => {
      const element = document.querySelector(observation.selector);
      return [tag, element && {nodeName: element.localName, phase: element.classList.contains('phase-' + acceptance.page.data.phase), text: element.textContent}];
    })));
    const expected = await page.evaluate(() => acceptance.observations);
    const initial = await snapshot();
    assert.deepEqual(await page.evaluate(() => ({count: acceptance.webViews.size, src: [...acceptance.webViews.values()][0]?.src, placeholderSrc: document.querySelector('#catalog-web-view').getAttribute('src')})), {count: 1, src: 'https://example.invalid/initial', placeholderSrc: null});
    await page.evaluate(async () => {await acceptance.update({webViewUrl: 'https://example.invalid/updated'}).done;});
    assert.equal(await page.evaluate(() => [...acceptance.webViews.values()][0]?.src), 'https://example.invalid/updated');
    for (const [tag, observation] of Object.entries(expected)) {
      assert.ok(initial[tag], tag + ' creates its declared observation');
      assert.equal(initial[tag].nodeName, observation.nodeName, tag + ' native node');
      if (observation.physical) assert.equal(initial[tag].phase, true, tag + ' initial common attributes');
    }
    assert.equal(await page.locator('#catalog-block').count(), 0);
    checks.push('all 42 public tags compile and create with explicit physical or structural observations');
    const functional=page.locator('#catalog-functional-page-navigator');
    await functional.locator('button').click();await page.waitForFunction(()=>acceptance.page.functionalEvent?.outcome==='success');
    assert.deepEqual(await page.evaluate(()=>acceptance.functionalRequests[0]),{source:'catalog',name:'loginAndGetUserInfo',version:'release',args:{lang:'en'}});
    assert.equal(await page.evaluate(()=>acceptance.page.functionalEvent.detail.proof),'standalone-injected-service');
    await page.evaluate(async()=>{acceptance.page.functionalEvent=null;await acceptance.update({functionalOutcome:'cancel',functionalVersion:'trial',functionalArgs:{lang:'zh_CN'}}).done;});
    await functional.focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>acceptance.page.functionalEvent?.outcome==='cancel');
    assert.equal(await page.evaluate(()=>acceptance.functionalRequests[1].version),'trial');
    await page.evaluate(async()=>{acceptance.page.functionalEvent=null;await acceptance.update({functionalOutcome:'fail'}).done;});
    await functional.locator('button').click();await page.waitForFunction(()=>acceptance.page.functionalEvent?.outcome==='fail');
    assert.equal(await page.evaluate(()=>acceptance.page.functionalEvent.detail.code),'HOST_UNAVAILABLE');
    await page.locator('#catalog-input').focus();await page.waitForFunction(()=>!!document.querySelector('#catalog-keyboard-accessory'));
    checks.push('functional-page-navigator uses the real controller for mouse and keyboard activation, forwarded arguments and success/cancel/fail service outcomes');

    await page.evaluate(() => {window.catalogNodes = Object.fromEntries(Object.entries(acceptance.observations).map(([tag, item]) => [tag, document.querySelector(item.selector)]));});
    await page.evaluate(async () => {
      const receipt = acceptance.update({phase: 'updated', fontSize: 18, entry: 'updated entry', memo: 'updated memo', checked: true, amount: 65, choice: 1,
        richText: '<i>Updated rich text</i>', icon: 'info', wheel: [1], position: 10, canvasSize: 60, controls: false, longitude: 23, latitude: 11, cameraPosition: 'front'});
      await receipt?.done;
    });
    const updated = await snapshot();
    const identities = await page.evaluate(() => Object.fromEntries(Object.entries(acceptance.observations).map(([tag, item]) => [tag, document.querySelector(item.selector) === catalogNodes[tag]])));
    for (const [tag, observation] of Object.entries(expected)) {
      assert.ok(updated[tag], tag + ' survives update');
      assert.equal(identities[tag], true, tag + ' preserves node identity');
      if (observation.physical) assert.equal(updated[tag].phase, true, tag + ' patches common attributes');
      else assert.ok(updated[tag].text.includes('updated'), tag + ' expands updated child');
    }
    assert.deepEqual(await page.evaluate(() => ({input: document.querySelector('#catalog-input').value, memo: document.querySelector('#catalog-textarea').value,
      toggle: document.querySelector('#catalog-switch').checked, checkbox: document.querySelector('#catalog-checkbox').checked, radio: document.querySelector('#catalog-radio').checked,
      slider: document.querySelector('#catalog-slider').value, image: document.querySelector('#catalog-image').alt, richText: document.querySelector('#catalog-rich-text').textContent,
      video: document.querySelector('#catalog-video .weapp-video-bar').hidden, rootFont: document.documentElement.style.fontSize,
      center: acceptance.view.map('getCenterLocation', {mapId: 'catalog-map'})})), {
      input: 'updated entry', memo: 'updated memo', toggle: true, checkbox: true, radio: true, slider: '65', image: 'Image updated', richText: 'Updated rich text',
      video: true, rootFont: '18px', center: {longitude: 23, latitude: 11}
    });
    assert.equal(await page.title(), 'Catalog updated');
    assert.equal(await page.evaluate(() => acceptance.hostMessages.at(-1).window.navigationBarTitleText), 'Catalog updated');
    checks.push('all 42 tags update without replacing observations and native control state follows authored properties');
    const canvasPixel = await page.evaluate(async () => {
      const [{node}] = await acceptance.view.query([{selector: '#catalog-canvas', all: false, viewport: false, node: true}]);
      const context = node.getContext('2d');
      context.fillStyle = 'rgb(12, 34, 56)'; context.fillRect(0, 0, 4, 4);
      return [...context.getImageData(1, 1, 1, 1).data];
    });
    assert.deepEqual(canvasPixel, [12, 34, 56, 255]);
    checks.push('packaged Canvas selector node exposes a working native 2D context');
    await page.locator('#catalog-input').fill('native entry');
    await page.locator('#catalog-textarea').fill('native memo');
    await page.locator('#catalog-label').click();
    await page.waitForFunction(() => acceptance.page.typed === 'native entry' && acceptance.page.typedMemo === 'native memo' && acceptance.page.events.some(event => event.id === 'catalog-switch' && event.detail.value === false));
    await page.locator('#catalog-button').click();
    await page.waitForFunction(() => !!acceptance.page.submitted);
    assert.deepEqual(await page.evaluate(() => acceptance.page.submitted), {entry: 'native entry', memo: 'native memo', toggle: false, checks: ['check'], radio: 'radio', amount: 65});
    await page.locator('#catalog-reset').click();
    await page.waitForFunction(() => acceptance.page.resets === 1);
    checks.push('native textarea label switch checkbox radio slider and form submit/reset compose through installed controllers');
    await page.evaluate(async () => {await acceptance.update({modal: true, portal: true}).done;});
    assert.deepEqual(await page.evaluate(() => ({modal: document.querySelector('#catalog-page-container').open, portal: document.querySelector('#catalog-root-portal').matches(':popover-open'), locked: document.querySelector('.weapp-page').style.overflow})), {modal: true, portal: true, locked: 'hidden'});
    await page.evaluate(async () => {await acceptance.update({modal: false, portal: false, minimumWidth: innerWidth + 1}).done;});
    assert.equal(await page.locator('#catalog-match-child').count(), 0);
    assert.deepEqual(await page.evaluate(() => ({modal: document.querySelector('#catalog-page-container').open, portal: document.querySelector('#catalog-root-portal').matches(':popover-open'), locked: document.querySelector('.weapp-page').style.overflow})), {modal: false, portal: false, locked: ''});
    await page.setViewportSize({width: 1600, height: 900});
    await page.waitForFunction(() => !!document.querySelector('#catalog-match-child') && acceptance.view.isIdle());
    checks.push('page-container and root-portal release top-layer locks and match-media responds to actual viewport resize');
    // Remove while layers are open: cleanup must also handle active resources.
    await page.evaluate(async () => {await acceptance.update({modal: true, portal: true}).done;});
    await page.evaluate(async () => {
      window.oldCatalogEditor = document.querySelector('#catalog-editor').weappEditorContext;
      await acceptance.update({catalogEnabled: false}).done;
    });
    const removed = await page.evaluate(() => ({connected: Object.entries(catalogNodes).filter(([, node]) => node.isConnected).map(([tag]) => tag),
      remaining: Object.keys(acceptance.observations).filter(tag => document.querySelector(acceptance.observations[tag].selector)),
      locked: document.querySelector('.weapp-page').style.overflow, font: document.documentElement.style.fontSize,
      editor: !!catalogNodes.editor.weappEditorContext, map: !!catalogNodes.map.__nowMapState,
      scroll: window.__nowScrollContexts?.size || 0, cameraImages: catalogNodes.camera.querySelectorAll('img').length,
      topLayers: document.querySelectorAll(':modal, :popover-open').length}));
    assert.deepEqual(removed, {connected: [], remaining: [], locked: '', font: '', editor: false, map: false, scroll: 0, cameraImages: 0, topLayers: 0});
    assert.equal(await page.evaluate(() => acceptance.webViews.size), 0);
    assert.equal(await page.title(), 'Independent component system');
    assert.equal(await page.evaluate(() => new Promise(resolve => oldCatalogEditor.getContents({fail: value => resolve(value.errCode)}))), 'PAGE_UNLOADED');
    checks.push('all 42 observations detach and active layers editor map scroll camera and page metadata release resources');
    await page.evaluate(async () => {await acceptance.update({catalogEnabled: true, modal: false, portal: false, minimumWidth: 0, phase: 'recreated'}).done;});
    await page.setViewportSize({width:720,height:900});await mountPortal();
    await page.locator('#catalog-input').focus();
    await page.waitForFunction(() => !!document.querySelector('#catalog-keyboard-accessory'));
    const recreated = await snapshot();
    assert.equal(await page.evaluate(() => acceptance.webViews.size), 1);
    const fresh = await page.evaluate(() => Object.fromEntries(Object.entries(acceptance.observations).map(([tag, item]) => [tag, document.querySelector(item.selector) !== catalogNodes[tag]])));
    for (const [tag, observation] of Object.entries(expected)) {
      assert.ok(recreated[tag], tag + ' recreates after removal');
      assert.equal(fresh[tag], true, tag + ' receives a fresh native node');
      if (observation.physical) assert.equal(recreated[tag].phase, true, tag + ' reinitializes attributes');
    }
    await page.evaluate(() => acceptance.destroy());
    assert.deepEqual(await page.evaluate(() => ({instances: acceptance.registry.inspect(), children: document.querySelector('#weapp-root').childElementCount,
      font: document.documentElement.style.fontSize, scroll: window.__nowScrollContexts?.size || 0, layers: document.querySelectorAll(':modal, :popover-open').length})), {
      instances: {instances: 0, components: 0, placements: 0}, children: 0, font: '', scroll: 0, layers: 0
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(await page.evaluate(() => cspViolations), []);
    assert.equal(await page.evaluate(() => acceptance.webViews.size), 0);
    checks.push('web-view uses the real controller and awaits injected host requests across update removal and recreation');
    checks.push('all 42 tags recreate and page destruction releases registry resources under the original CSP');
    return {checks, tags: Object.keys(expected), coverage: Object.fromEntries(Object.entries(expected).map(([tag, observation]) => [tag, {...observation, stages: ['create', 'update', 'remove', 'recreate']} ])), limitations: ['functional-page-navigator delegates to an explicitly injected test service; no real identity/payment/address/invoice provider', 'web-view stays hidden and delegates to an injected service probe; no iframe native container navigation bridge or remote page is tested', 'camera remains hidden; no host capture or permissions', 'video properties only; no media decoding', 'keyboard uses injected host geometry; no physical soft keyboard; editor portal mounted in a custom block; no native IME', 'no navigation or external asset requests']};
  } finally {await page.close();}
};
