'use strict';
// Every public catalog tag has an explicit browser observation. Structural tags
// are checked through their children because they do not own a physical node.
const nodes = {
  'web-view': 'div', camera: 'div', 'keyboard-accessory': 'div', editor: 'div', 'editor-portal': 'div',
  'page-meta': 'div', 'navigation-bar': 'div', view: 'div', text: 'span',
  button: 'button', input: 'input', textarea: 'textarea', image: 'img',
  'scroll-view': 'div', label: 'label', switch: 'input', checkbox: 'input',
  navigator: 'div', form: 'form', radio: 'input', 'radio-group': 'div',
  'checkbox-group': 'div', slider: 'div', picker: 'div', swiper: 'div',
  'swiper-item': 'div', 'rich-text': 'div', icon: 'span', progress: 'div',
  'picker-view': 'div', 'picker-view-column': 'div', 'movable-area': 'div',
  'movable-view': 'div', selection: 'div', 'page-container': 'dialog',
  'root-portal': 'div', canvas: 'canvas', video: 'video', map: 'div'
};
const observations = Object.fromEntries(Object.entries(nodes).map(([tag, nodeName]) =>
  [tag, {selector: '#catalog-' + tag, nodeName, physical: true}]));
observations.block = {selector: '#catalog-block-child', nodeName: 'span', physical: false};
observations['match-media'] = {selector: '#catalog-match-child', nodeName: 'span', physical: false};
let template = `<page-meta id="catalog-page-meta" wx:if="{{catalogEnabled}}" root-font-size="{{fontSize}}px"><navigation-bar id="catalog-navigation-bar" title="Catalog {{phase}}"/></page-meta>
<block wx:if="{{catalogEnabled}}">
  <view id="catalog-view"><text id="catalog-text">Catalog {{phase}}</text></view>
  <block><text id="catalog-block-child">Block {{phase}}</text></block>
  <match-media id="catalog-match-media" min-width="{{minimumWidth}}"><text id="catalog-match-child">Matched {{phase}}</text></match-media>
  <form id="catalog-form" bind:submit="catalogSubmit" bind:reset="catalogReset">
    <input id="catalog-input" name="entry" value="{{entry}}" bind:input="catalogInput"><keyboard-accessory id="catalog-keyboard-accessory"><text>Accessory {{phase}}</text></keyboard-accessory></input>
    <textarea id="catalog-textarea" name="memo" value="{{memo}}" bind:input="catalogMemo"/>
    <label id="catalog-label" for="catalog-switch">Toggle</label><switch id="catalog-switch" name="toggle" checked="{{checked}}" bind:change="catalogChange"/>
    <checkbox-group id="catalog-checkbox-group" name="checks" bind:change="catalogChange"><checkbox id="catalog-checkbox" value="check" checked="{{checked}}"/></checkbox-group>
    <radio-group id="catalog-radio-group" name="radio" bind:change="catalogChange"><radio id="catalog-radio" value="radio" checked="{{checked}}"/></radio-group>
    <slider id="catalog-slider" name="amount" value="{{amount}}" min="0" max="100" show-value bind:change="catalogChange"/>
    <button id="catalog-button" form-type="submit">Submit {{phase}}</button><button id="catalog-reset" form-type="reset">Reset</button>
  </form>
  <image id="catalog-image" alt="Image {{phase}}"/>
  <scroll-view id="catalog-scroll-view" scroll-y style="height:60px"><text>Scroll {{phase}}</text></scroll-view>
  <navigator id="catalog-navigator" url="/catalog-target">Navigate {{phase}}</navigator>
  <picker id="catalog-picker" range="{{choices}}" value="{{choice}}"><text>Choice {{choice}}</text></picker>
  <swiper id="catalog-swiper" current="{{choice}}" duration="0" style="height:60px"><swiper-item id="catalog-swiper-item"><text>First {{phase}}</text></swiper-item><swiper-item><text>Second {{phase}}</text></swiper-item></swiper>
  <rich-text id="catalog-rich-text" nodes="{{richText}}"/>
  <icon id="catalog-icon" type="{{icon}}"/><progress id="catalog-progress" percent="{{amount}}" show-info/>
  <picker-view id="catalog-picker-view" value="{{wheel}}" style="height:100px"><picker-view-column id="catalog-picker-view-column"><view>First</view><view>Second</view></picker-view-column></picker-view>
  <movable-area id="catalog-movable-area" style="height:80px;width:200px"><movable-view id="catalog-movable-view" direction="all" x="{{position}}" y="{{position}}" style="height:30px;width:30px">Move</movable-view></movable-area>
  <selection id="catalog-selection"><text selectable>Selection {{phase}}</text></selection>
  <page-container id="catalog-page-container" show="{{modal}}" duration="0"><text>Modal {{phase}}</text></page-container>
  <root-portal id="catalog-root-portal" enable="{{portal}}"><text>Portal {{phase}}</text></root-portal>
  <canvas id="catalog-canvas" type="2d" width="{{canvasSize}}" height="{{canvasSize}}"/>
  <video id="catalog-video" controls="{{controls}}"/>
  <map id="catalog-map" longitude="{{longitude}}" latitude="{{latitude}}"/>
  <editor id="catalog-editor" placeholder="Editor {{phase}}" style="height:60px"><editor-portal id="catalog-editor-portal" key="catalog-block"><text>Editor portal {{phase}}</text></editor-portal></editor>
  <web-view id="catalog-web-view" hidden src="{{webViewUrl}}"/>
  <camera id="catalog-camera" hidden device-position="{{cameraPosition}}"/>
</block>`;
// Exercise common attribute updates on every physical tag as well as each
// control's own state. Extra fixture elements are intentionally not catalog rows.
template = template.replace(/(<[a-z-]+ id="catalog-([a-z-]+)")/g, (all, prefix, tag) =>
  nodes[tag] ? prefix + ' class="phase-{{phase}}"' : all);
module.exports = {template, observations, data: {
  catalogEnabled: true, phase: 'initial', minimumWidth: 0, fontSize: 16,
  entry: 'initial entry', memo: 'initial memo', checked: false, amount: 20,
  choices: ['First', 'Second'], choice: 0, richText: '<b>Initial rich text</b>',
  icon: 'success', wheel: [0], position: 0, modal: false, portal: false,
  webViewUrl: 'https://example.invalid/initial', canvasSize: 40, controls: true, longitude: 20, latitude: 10, cameraPosition: 'back'
}};
