// Generated from component-backend/rpx.js; regenerate with scripts/sync-rpx.cjs.
'use strict';
// Layout CSS pixels, independent of device pixel ratio. Zero has no minimum.
function createRpxUnits() {
  function css(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new TypeError('rpx must be finite');
    if (number === 0) return '0px';
    const magnitude = 'max(1px, round(down, calc(var(--weapp-rpx) * ' + Math.abs(number) + '), 1px))';
    return number < 0 ? 'calc(-1 * ' + magnitude + ')' : magnitude;
  }
  function pixels(value, viewportWidth) {
    const number = Number(value), width = Number(viewportWidth);
    if (!Number.isFinite(number) || !Number.isFinite(width) || width < 0) throw new TypeError('rpx and viewport width must be finite');
    return number === 0 ? 0 : Math.sign(number) * Math.max(1, Math.floor(Math.abs(number) * width / 750));
  }
  // Accept legacy compiler output at adapter boundaries; skip literals and URLs.
  // css() reverses the operands, making normalization idempotent.
  function rewrite(value) {
    const source = String(value ?? '');
    const token = /^calc\(\s*(-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*\*\s*var\(\s*--weapp-rpx\s*\)\s*\)/i;
    let output = '', index = 0;
    while (index < source.length) {
      const character = source[index];
      if (character === '"' || character === "'") {
        const quote = character, start = index++;
        while (index < source.length) {const next = source[index++]; if (next === '\\') index++; else if (next === quote) break;}
        output += source.slice(start, index); continue;
      }
      if (source.startsWith('/*', index)) {
        const end = source.indexOf('*/', index + 2), next = end < 0 ? source.length : end + 2;
        output += source.slice(index, next); index = next; continue;
      }
      if ((index === 0 || !/[\w-]/.test(source[index - 1])) && /^url\s*\(/i.test(source.slice(index))) {
        const start = index; index += /^url\s*\(/i.exec(source.slice(index))[0].length;
        let depth = 1, quote = null;
        while (index < source.length && depth) {
          const next = source[index++];
          if (next === '\\') {index++; continue;}
          if (quote) {if (next === quote) quote = null; continue;}
          if (next === '"' || next === "'") quote = next;
          else if (next === '(') depth++; else if (next === ')') depth--;
        }
        output += source.slice(start, index); continue;
      }
      const match = (index === 0 || !/[\w-]/.test(source[index - 1])) && token.exec(source.slice(index));
      if (match && Number.isFinite(Number(match[1]))) {output += css(match[1]); index += match[0].length; continue;}
      output += character; index++;
    }
    return output;
  }
  return Object.freeze({policy: 'layout-pixel-v1', css, pixels, rewrite});
}
module.exports = createRpxUnits;
