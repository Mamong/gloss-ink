'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {buildSync} = require('esbuild');
const {createBuiltinCatalog} = require('@tingtalk/builtin-components');
const {createTemplateCompiler} = require('@tingtalk/template-compiler');
const {createStylesheetCompiler} = require('@tingtalk/stylesheet-compiler');
const directory = __dirname;
const schema = createBuiltinCatalog();
const templates = createTemplateCompiler(schema);
const styles = createStylesheetCompiler({tags: schema.tags});
const catalogFixture = require('./catalog-fixture.cjs');
const assert = require('node:assert/strict');
assert.deepEqual(Object.keys(catalogFixture.observations).sort(), [...schema.tags].sort(), 'Catalog fixture must cover every public tag');
const fixtureTags = new Set([...catalogFixture.template.matchAll(/<([a-z][a-z-]*)\b/g)].map(match => match[1]));
assert.deepEqual([...fixtureTags].sort(), [...schema.tags].sort(), 'Every catalog row must be compiled from WXML');
const diagnostics = [];
const diagnostic = (...entry) => diagnostics.push(entry);
const sources = {
  page: `<wxs module="format">module.exports.label=function(value){return value.toUpperCase();};</wxs>
    <text id="wxs-label">{{format.label(title)}}</text>
    <template name="summary"><text id="summary">Template {{caption}}</text></template>
    <template is="summary" data="{{caption:title}}"/>
    <view wx:if="{{banner}}" id="banner" style="position:absolute">Conditional banner</view>
    <button id="activation" bind:tap="activate">Native activation</button>
    <view id="page-label" class="label">Parent {{title}}</view>
    <counter id="counter" title="{{title}}" bind:changed="changed">
      <text id="named" slot="heading">Named {{title}}</text><text id="default">Default content</text>
    </counter>
    <view id="rows"><counter wx:for="{{rows}}" wx:key="id" id="row-{{item.id}}" title="{{item.title}}"/></view>
    <picker id="choice" range="{{choices}}" value="{{choice}}" bind:change="picked"><text>Pick {{choice}}</text></picker>
    <editor id="rich-editor" placeholder="Independent editor" bind:input="edited" style="height:80px;display:block"/>
    <scroll-view id="virtual" type="list" scroll-y enhanced scroll-top="{{scrollTop}}" scroll-into-view="{{scrollInto}}" style="height:120px;display:block">
      <view wx:for="{{listRows}}" wx:key="id" id="virtual-item-{{item.id}}" style="height:24px;display:block">{{item.label}}</view>
    </scroll-view>
    <map id="demo-map" longitude="{{20}}" latitude="{{10}}" markers="{{markers}}" bind:markertap="markerTap" style="height:100px;display:block"/>
    <video id="demo-video" controls style="height:80px;width:240px"/>
    <button id="reverse" bind:tap="reverse">Reverse rows</button><text id="output">{{output}}</text>`,
  catalog: catalogFixture.template,
  counter: `<view id="child-label" class="label">Child {{title}} / {{count}}</view>
    <slot name="heading"/><slot/>
    <form bind:submit="submit"><input id="entry" name="entry" value="{{text}}" bind:input="input"/>
    <button id="increment" bind:tap="increment">Increment</button><button id="submit" form-type="submit">Submit</button></form>`
};
const factories = Object.entries(sources).map(([name, source]) =>
  JSON.stringify(name) + ':(' + templates.compile(source, name + '.wxml', diagnostic, {components: ['counter'], component: name === 'counter'}) + ')');
const baseCss = fs.readFileSync(require.resolve('@tingtalk/builtin-components/styles.css'), 'utf8');
const css = styles.compile(['counter.wxss'], () => '.label { color: rgb(17, 99, 155); font-weight: 700; }', () => '', diagnostic);
if (diagnostics.some(entry => entry[0] === 'error')) throw new Error(JSON.stringify(diagnostics));
fs.mkdirSync(path.join(directory, 'dist'), {recursive: true});
fs.writeFileSync(path.join(directory, 'dist/templates.cjs'), 'module.exports={' + factories.join(',') + '};\n');
fs.writeFileSync(path.join(directory, 'dist/styles.json'), JSON.stringify({counter: baseCss + '\n' + css}));
buildSync({entryPoints: [path.join(directory, 'app.js')], outfile: path.join(directory, 'dist/app.js'), bundle: true, platform: 'browser', sourcemap: true});
fs.writeFileSync(path.join(directory, 'dist/components.css'), baseCss);
fs.copyFileSync(path.join(directory, 'index.html'), path.join(directory, 'dist/index.html'));
console.log('Compiled templates, stylesheet and browser app using installed packages');
