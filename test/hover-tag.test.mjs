import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

import { placeHoverTag, setHoverTagPlacementMode } from '../src/ui/orrery/hoverTag.js';

beforeEach(() => setHoverTagPlacementMode('css'));

function stubTag(w, h, text = 'Rock') {
  return { hidden: true, style: {}, textContent: text, offsetWidth: w, offsetHeight: h };
}

// Resolve the emitted CSS lengths against the current border box. This small expression
// interpreter handles calc/min/max/clamp without executing generated JavaScript. It checks
// placement arithmetic here; the native pilot still owns browser CSS/image acceptance.
function cssLength(css, basis) {
  const tokens = css.match(/[a-z]+|\d*\.?\d+|[%()+,\-]/g);
  let i = 0;
  function sum() {
    let n = atom();
    while (tokens[i] === '+' || tokens[i] === '-') {
      const op = tokens[i++];
      const rhs = atom();
      n = op === '+' ? n + rhs : n - rhs;
    }
    return n;
  }
  function atom() {
    if (tokens[i] === '-') { i++; return -atom(); }
    const token = tokens[i++];
    if (/^[\d.]/.test(token)) {
      const unit = tokens[i++];
      assert.ok(unit === 'px' || unit === '%', `unsupported unit ${unit}`);
      return Number(token) * (unit === '%' ? basis / 100 : 1);
    }
    assert.ok(['calc', 'clamp', 'min', 'max'].includes(token), `unsupported function ${token}`);
    assert.equal(tokens[i++], '(');
    const args = [sum()];
    while (tokens[i] === ',') { i++; args.push(sum()); }
    assert.equal(tokens[i++], ')');
    if (token === 'calc') return args[0];
    if (token === 'clamp') return Math.max(args[0], Math.min(args[1], args[2]));
    return Math[token](...args);
  }
  const result = sum();
  assert.equal(i, tokens.length, `unparsed CSS in ${css}`);
  return result;
}

function tagPos(el) {
  const m = /translate3d\((-?[\d.]+)px,(-?[\d.]+)px,0\)/.exec(el.style.transform || '');
  if (m) return { px: Number(m[1]), py: Number(m[2]) };
  const css = el.style.transform.slice('translate3d('.length).split(') translate(')[0];
  let depth = 0, start = 0;
  const args = [];
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '(') depth++;
    if (css[i] === ')') depth--;
    if (css[i] === ',' && depth === 0) { args.push(css.slice(start, i)); start = i + 1; }
  }
  args.push(css.slice(start));
  assert.equal(args.length, 3);
  const w = Math.min(el.offsetWidth, parseFloat(el.style.maxWidth));
  return { px: cssLength(args[0], w), py: cssLength(args[1], el.offsetHeight) };
}

test('an initially hidden tag becomes visible at the requested point', () => {
  const el = stubTag(120, 40);
  placeHoverTag(el, 500, 300, 1000, 800);
  assert.equal(el.hidden, false);
  assert.deepEqual(tagPos(el), { px: 500, py: 300 });
});

test('placement clamps inside the viewport at every corner', () => {
  const el = stubTag(200, 60, 'A Very Long Object Name That Will Not Fit');
  const vw = 1000, vh = 800;
  const spots = [[2, 2], [vw - 2, 2], [2, vh - 2], [vw - 2, vh - 2], [vw / 2, vh / 2]];
  for (const [x, y] of spots) {
    el.hidden = true;
    placeHoverTag(el, x, y, vw, vh);
    const { px, py } = tagPos(el);
    const halfW = Math.min(el.offsetWidth, vw - 24) / 2;
    assert.ok(px - halfW >= 0 && px + halfW <= vw, `x=${x}: clamped inside, got px=${px}`);
    assert.ok(py - (el.offsetHeight + 14) >= -1 && py <= vh, `y=${y}: clamped inside, got py=${py}`);
  }
});

test('a long name caps width to the viewport minus margins', () => {
  const el = stubTag(1600, 40, 'An Extremely Long Proper Noun Ship Name Beyond Any Reason');
  placeHoverTag(el, 500, 300, 1000, 800);
  assert.equal(el.style.maxWidth, '976px', 'the tag never runs past the viewport edge');
  const { px } = tagPos(el);
  assert.ok(px + 488 <= 1000, 'right edge stays inside');
});

test('measured size is cached until text or viewport changes', () => {
  setHoverTagPlacementMode('measured');
  const el = stubTag(100, 40);
  placeHoverTag(el, 500, 300, 1000, 800);
  assert.equal(el.__woiSize.w, 100);
  el.offsetWidth = 400;
  placeHoverTag(el, 510, 300, 1000, 800);
  assert.equal(el.__woiSize.w, 100, 'same text + viewport skips the layout read');
  el.textContent = 'Different Subject Name';
  placeHoverTag(el, 510, 300, 1000, 800);
  assert.equal(el.__woiSize.w, 400, 'new text re-measures');
});

test('CSS placement never reads content or dimensions and skips unchanged style writes', () => {
  let writes = 0;
  const style = new Proxy({}, { set(target, key, value) { writes++; target[key] = value; return true; } });
  const el = { hidden: true, style, dataset: { bars: '1' } };
  for (const key of ['offsetWidth', 'offsetHeight', 'textContent']) {
    Object.defineProperty(el, key, { get() { throw new Error(`synchronous read: ${key}`); } });
  }
  placeHoverTag(el, 12, 20, 1000, 800);
  assert.equal(writes, 2, 'one max-width and one transform write');
  for (let i = 0; i < 100; i++) placeHoverTag(el, 12, 20, 1000, 800);
  assert.equal(writes, 2, 'unchanged pointer/viewport needs no style writes despite changing content');
  el.dataset.bars = '0';
  placeHoverTag(el, 12, 20, 500, 300);
  assert.equal(writes, 4, 'resize updates the width and position without measuring');
});

test('CSS clamp follows current content dimensions without waiting for another placement', () => {
  const el = stubTag(100, 40);
  placeHoverTag(el, 980, 2, 1000, 800);
  const transform = el.style.transform;
  assert.deepEqual(tagPos(el), { px: 944, py: 58 });
  el.offsetWidth = 400;
  el.offsetHeight = 100;
  el.textContent = 'Changed range or wrapped hint';
  assert.deepEqual(tagPos(el), { px: 794, py: 118 });
  placeHoverTag(el, 980, 2, 1000, 800);
  assert.equal(el.style.transform, transform, 'the browser resolves percentages against the new box');
});

test('CSS placement matches measured clamping for edges, resizes and oversized tags', () => {
  for (const [vw, vh] of [[1000, 800], [360, 640], [100, 80]]) {
    for (const [w, h] of [[4, 20], [120, 40], [320, 100], [1600, 900]]) {
      for (const [x, y] of [[-100, -100], [2, 2], [vw / 2, vh / 2], [vw - 2, vh - 2], [vw + 100, vh + 100]]) {
        const el = stubTag(w, h);
        setHoverTagPlacementMode('css');
        placeHoverTag(el, x, y, vw, vh);
        const css = tagPos(el);
        setHoverTagPlacementMode('measured');
        // The stub's width reflects CSS max-width, just as offsetWidth would in a browser.
        el.offsetWidth = Math.min(w, parseFloat(el.style.maxWidth));
        placeHoverTag(el, x, y, vw, vh);
        assert.deepEqual(css, tagPos(el), `viewport ${vw}x${vh}, box ${w}x${h}, point ${x},${y}`);
      }
    }
  }
});

test('comparison modes reject typos and can switch on an already-visible tag', () => {
  assert.throws(() => setHoverTagPlacementMode('typo'), /placement mode/i);
  const el = stubTag(200, 60);
  for (const mode of ['measured', 'css', 'measured', 'css']) {
    assert.equal(setHoverTagPlacementMode(mode), mode);
    placeHoverTag(el, 2, 2, 1000, 800);
    assert.deepEqual(tagPos(el), { px: 106, py: 78 });
  }
});

import { hoverTagVitals } from '../src/ui/orrery/hoverTag.js';

test('vitals report only the layers a body actually has, clamped to 0..1', () => {
  assert.equal(hoverTagVitals(null), null);
  assert.equal(hoverTagVitals({ type: 'asteroid' }), null, 'a rock carries no hull stat');
  const v = hoverTagVitals({ hull: 30, hullMax: 60, shield: 90, shieldMax: 60, armorHp: 0, armorMax: 0 });
  assert.deepEqual(v, { shield: 1, armor: null, hull: 0.5 });
});
