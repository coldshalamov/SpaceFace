// The phone deck's instruments: the joystick's maths and drawing, the powers wheel's geometry, the ship's
// place on screen, the DOCK key's feed, and the phone-layout test the title uses. DOM work runs against a
// tiny stand-in document: these pin what is WRITTEN (attributes, text, data flags), never what it looks like.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SPEED_RAMP } from '../src/ui/orrery/speedDial.js';
import { rampRgb, pullToRamp, dialDeg, createStick, STICK_UNITS } from '../src/systems/mobile/instrument.js';
import { sectorDeg, createWheel } from '../src/systems/mobile/wheel.js';
import { shipOnScreen, isPhoneLayout } from '../src/systems/mobile/model.js';
import { enhanceMobileTouch } from '../src/systems/mobile/bridge.js';
import { POWER_PAGES, icon } from '../src/systems/mobile/catalog.js';
import { MOBILE_CSS } from '../src/systems/mobile/mobileCssSource.js';

class El {
  constructor(tag) {
    this.tag = tag; this.attrs = {}; this.children = []; this.dataset = {}; this.hidden = false;
    this.style = { props: {}, setProperty(k, v) { this.props[k] = String(v); } };
    this._classes = new Set(); this.textContent = ''; this.listeners = {}; this.parent = null;
    const set = this._classes;
    this.classList = { add: (...c) => c.forEach(x => set.add(x)), remove: (...c) => c.forEach(x => set.delete(x)), contains: c => set.has(c) };
  }
  set className(v) { this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); const s = this._classes; this.classList.contains = c => s.has(c); this.classList.add = (...c) => c.forEach(x => s.add(x)); this.classList.remove = (...c) => c.forEach(x => s.delete(x)); }
  get className() { return [...this._classes].join(' '); }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'class') this.className = v; }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  // a real element mirrors data-* attributes into dataset; the stand-in keeps the two in step
  removeAttribute(k) { delete this.attrs[k]; if (k.startsWith('data-')) delete this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())]; }
  appendChild(c) { c.parent = this; this.children.push(c); return c; }
  append(...cs) { cs.forEach(c => this.appendChild(c)); }
  replaceChildren(...cs) { this.children = []; cs.forEach(c => this.appendChild(c)); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  remove() {}
  set innerHTML(v) { this._html = v; }
  get innerHTML() { return this._html || ''; }
}
const fakeDoc = () => ({ createElement: t => new El(t), createElementNS: (_n, t) => new El(t) });
const findAll = (el, pred, out = []) => { if (pred(el)) out.push(el); el.children.forEach(c => findAll(c, pred, out)); return out; };
const byClass = (el, cls) => findAll(el, n => n._classes.has(cls) || (n.attrs.class || '').split(/\s+/).includes(cls));

test('only informational receipts compact in touch flight; critical copy and touch-through stay intact', () => {
  const prefix = ':root[data-sf-mobile="1"][data-sf-mobile-flight="1"] #toasts';
  const rule = selector => MOBILE_CSS.slice(MOBILE_CSS.indexOf(selector) + selector.length).match(/^\s*\{([^}]+)\}/)?.[1];
  const row = rule(prefix + ' .sf-toast--info');
  const text = rule(prefix + ' .sf-toast--info .sf-toast__text');
  assert.ok(row && text, 'both phone flight flags scope the compaction to info receipts');
  assert.match(row, /box-sizing:border-box/);
  assert.match(row, /width:100%/);
  assert.match(text, /min-width:0/);
  assert.match(text, /white-space:nowrap/);
  assert.match(text, /overflow:hidden/);
  assert.match(text, /text-overflow:ellipsis/);
  for (const kind of ['error', 'danger', 'warn', 'success', 'credits']) {
    assert.equal(rule(prefix + ` .sf-toast--${kind} .sf-toast__text`), undefined,
      `${kind} receipts retain full wrapping`);
  }
  assert.match(MOBILE_CSS, /:is\(#toasts,#toasts \*\)\s*\{\s*pointer-events:none!important/);
});

test('mobile stylesheet comments do not swallow or corrupt following rules', () => {
  const css = MOBILE_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /\/\*|\*\//, 'all comment delimiters are paired');
  assert.match(css, /:root\[data-sf-mobile="1"\]\[data-sf-mobile-flight="1"\] #toasts \.sf-toast--info\s*\{/,
    'the informational receipt rule remains a standalone selector after comments are removed');
});

test('flight receipts occupy their own touch-through lane in both orientations', () => {
  const lanes = MOBILE_CSS.slice(MOBILE_CSS.indexOf('/* Mobile flight lanes:'));
  const portrait = MOBILE_CSS.match(/:root\[data-sf-mobile="1"\]\[data-sf-mobile-flight="1"\] #toasts \{([^}]+)\}/)?.[1];
  const landscape = lanes.match(/#toasts \{([^}]+)\}/)?.[1];
  assert.match(portrait || '', /left:calc\(14px \+ var\(--sf-safe-left,0px\)\); top:auto; bottom:calc\(max\(224px/,
    'portrait keeps its authored bottom-up fallback lane');
  assert.match(landscape || '', /top:calc\(118px \+ var\(--sf-safe-top,0px\)\); bottom:auto;/,
    'short landscape keeps its authored below-HUD fallback lane');
  for (const lane of [portrait || '', landscape || '']) {
    assert.doesNotMatch(lane, /(?:left|right|top|bottom|width|max-width):[^;]*!important/,
      'live inline placement by the HUD owner can override the fallback geometry');
  }
  assert.match(MOBILE_CSS, /:is\(#toasts,#toasts \*\)\s*\{\s*pointer-events:none!important/);
  assert.equal(readFileSync(new URL('../styles/mobile.generated.css', import.meta.url), 'utf8'), MOBILE_CSS,
    'the generated mobile sidecar ships the same fallback CSS as its source');
  assert.doesNotMatch(lanes, /#toasts \{[^}]*overflow:hidden/,
    'critical receipts must not be clipped to make a layout test pass');
});

function withDoc(fn) {
  const prev = globalThis.document; const doc = fakeDoc(); globalThis.document = doc;
  try { return fn(doc); } finally { globalThis.document = prev; }
}

test('the stick colour is the flight dial speed ramp, and never warms toward amber or red past the first reading', () => {
  assert.deepEqual(rampRgb(0), SPEED_RAMP[0][1]);
  assert.deepEqual(rampRgb(1), SPEED_RAMP[SPEED_RAMP.length - 1][1]);
  assert.deepEqual(rampRgb(NaN), SPEED_RAMP[0][1]);
  for (let t = 0.1; t <= 1.0001; t += 0.05) { const [r, , b] = rampRgb(t); assert.ok(b >= r, `t=${t.toFixed(2)} drifted warm: r${r} b${b}`); }
});

test('a pull maps onto the ramp: the push below the ring, boost territory beyond it, clamped at the end', () => {
  assert.equal(pullToRamp(0), 0); assert.equal(pullToRamp(-3), 0); assert.equal(pullToRamp(NaN), 0);
  assert.ok(Math.abs(pullToRamp(1) - 0.6) < 1e-9, 'the ring is the reference gate');
  assert.equal(pullToRamp(5), 1);
  let last = -1;
  for (let raw = 0; raw <= 1.5; raw += 0.05) { const t = pullToRamp(raw); assert.ok(t >= last); last = t; }
});

test('dial degrees run 0 at the top, clockwise', () => {
  assert.equal(dialDeg(0, -1), 0); assert.equal(dialDeg(1, 0), 90);
  assert.equal(Math.abs(dialDeg(0, 1)), 180); assert.equal(dialDeg(-1, 0), -90);
});

test('the boost ring is drawn exactly where the model latches boost', () => {
  assert.equal(STICK_UNITS.BOOST_R, 138);
  assert.equal(STICK_UNITS.R, 100);
});

test('wheel sectors fan counter-clockwise from the top for the right hand and mirror for the left', () => {
  assert.equal(sectorDeg(0, 'right'), -15); assert.equal(sectorDeg(5, 'right'), -165);
  assert.equal(sectorDeg(0, 'left'), 15); assert.equal(sectorDeg(5, 'left'), 165);
});

test('every power stays on the wheel when a bank gains a seventh choice', () => withDoc(doc => {
  const wheel = createWheel(doc, { pages: POWER_PAGES, icon, onUse() {}, onPage() {} });
  wheel.open({ cx: 370, cy: 360, radius: 140, side: 'right' }, 0, false);
  const [nodes] = byClass(wheel.root, 'mf-nodes');
  assert.equal(nodes.children.length, 7);
  for (const node of nodes.children) assert.ok(Number.parseFloat(node.style.left) < 370, 'all choices open inward');
  assert.equal(sectorDeg(6, 'right', 7), -180 * 6.5 / 7);
  wheel.open({ cx: 195, cy: 358, radius: 122, side: 'right', span: 360 }, 0, true);
  for (const node of nodes.children) {
    const x = Number.parseFloat(node.style.left), y = Number.parseFloat(node.style.top);
    assert.ok(x >= 40 && x <= 350 && y >= 230 && y <= 490, `portrait choice ${x},${y} fits`);
  }
}));

test('the stick instrument draws the Hand on the very first frame and follows the pull', () => withDoc(doc => {
  const stick = createStick(doc);
  const pointer = { ox: 100, oy: 300, x: 130, y: 260, radius: 70, boost: false };
  stick.show(pointer, {});
  const [armHot] = byClass(stick.root, 'mf-arm-hot');
  assert.ok(Number.isFinite(Number(armHot.attrs.x2)) && Number.isFinite(Number(armHot.attrs.y2)), 'first-frame NaN guard');
  assert.ok(Number(armHot.attrs.x2) > 0 && Number(armHot.attrs.y2) < 0, 'up and to the right');
  const [lit] = byClass(stick.root, 'mf-lit');
  assert.match(lit.attrs.d, /^M /, 'a thrust arc is drawn');
  assert.equal(stick.root.dataset.boost, '0');
  assert.match(stick.root.style.props['--mf-tint'], /^\d+ \d+ \d+$/);
  assert.equal(stick.root.hidden, false);
}));

test('boost and brake change the readout word and the data flags, and a settled frame writes nothing new', () => withDoc(doc => {
  const stick = createStick(doc);
  const base = { ox: 100, oy: 300, x: 100, y: 300, radius: 70, boost: false };
  stick.show({ ...base, x: 100, y: 190, boost: true }, {});
  const [num] = byClass(stick.root, 'mf-num');
  assert.equal(num.textContent, 'BOOST'); assert.equal(stick.root.dataset.boost, '1');
  stick.update({ ...base }, { brake: true });
  assert.equal(num.textContent, 'BRAKE'); assert.equal(stick.root.dataset.brake, '1');
  stick.update({ ...base, x: 150 }, {});
  assert.equal(num.textContent, String(Math.round(num.textContent)), 'back to a thrust percentage');
  const tint = stick.root.style.props['--mf-tint'];
  stick.update({ ...base, x: 150 }, {});
  assert.equal(stick.root.style.props['--mf-tint'], tint);
}));

test('a flick leaves a streak and the instrument leaves on its own; a new contact cancels the leave', () => withDoc(doc => {
  const stick = createStick(doc);
  stick.show({ ox: 100, oy: 300, x: 160, y: 300, radius: 70, boost: false }, {});
  stick.release({ flick: true });
  assert.equal(stick.leaving, true); assert.equal(stick.root.dataset.flick, '1');
  stick.show({ ox: 40, oy: 400, x: 40, y: 400, radius: 70, boost: false }, {});
  assert.equal(stick.leaving, false); assert.equal(stick.root.dataset.flick, undefined);
  stick.release({ immediate: true });
  assert.equal(stick.root.hidden, true);
}));

test('the wheel opens on a bank, swings its Hand to a choice, and says what the choice is', () => withDoc(doc => {
  const picks = [];
  const wheel = createWheel(doc, { pages: POWER_PAGES, icon, onUse: p => picks.push(p.id), onPage() {} });
  wheel.open({ cx: 380, cy: 400, radius: 150, side: 'right' }, 2, false);
  assert.equal(wheel.root.hidden, false); assert.equal(wheel.page, 2);
  const [nodes] = byClass(wheel.root, 'mf-nodes');
  assert.equal(nodes.children.length, 6);
  wheel.select(3);
  assert.equal(nodes.children[3].dataset.selected, '1'); assert.equal(nodes.children[0].dataset.selected, '0');
  const [name] = byClass(wheel.root, 'mf-pick-name');
  assert.equal(name.textContent, POWER_PAGES[2].powers[3].label);
  nodes.children[1].listeners.click[0]();
  assert.deepEqual(picks, [POWER_PAGES[2].powers[1].id]);
  wheel.select(-1);
  assert.equal(name.textContent, POWER_PAGES[2].name);
  wheel.close(); assert.equal(wheel.root.hidden, true);
}));

test('the ship\'s place and nose on screen come from the camera, with no allocation per call', () => {
  const worldToScreen = p => ({ x: 100 + p.x * 2, y: 200 + p.z * 2 });
  const a = shipOnScreen({ worldToScreen }, { pos: { x: 10, z: 5 }, rot: 0 });
  assert.equal(a.x, 120); assert.equal(a.y, 210); assert.ok(Math.abs(a.headingDeg - 90) < 1e-6, 'nose along +x is screen right');
  const b = shipOnScreen({ worldToScreen }, { pos: { x: 0, z: 0 }, rot: Math.PI / 2 });
  assert.ok(Math.abs(Math.abs(b.headingDeg) - 180) < 1e-6, 'nose along +z is screen down');
  assert.equal(shipOnScreen(null, { pos: { x: 0, z: 0 }, rot: 0 }), null);
  assert.equal(shipOnScreen({ worldToScreen }, { pos: { x: 0, z: 0 }, rot: NaN }), null);
  assert.equal(shipOnScreen({ worldToScreen: () => ({ x: 5, y: 5 }) }, { pos: { x: 0, z: 0 }, rot: 0 }), null, 'a degenerate projection has no heading');
});

test('a phone layout is the deck on a short side under tablet width', () => {
  const doc = flag => ({ documentElement: { dataset: flag ? { sfMobile: '1' } : {} } });
  assert.equal(isPhoneLayout(doc(true), { innerWidth: 390, innerHeight: 844 }), true);
  assert.equal(isPhoneLayout(doc(true), { innerWidth: 844, innerHeight: 390 }), true);
  assert.equal(isPhoneLayout(doc(true), { innerWidth: 1024, innerHeight: 768 }), false);
  assert.equal(isPhoneLayout(doc(false), { innerWidth: 390, innerHeight: 844 }), false);
});

test('the DOCK key follows dock:range, Pause > Help opens the guide, and both let go of the bus when touch is turned off', () => {
  const handlers = {}; let unsubscribed = 0; const seen = [];
  const bus = { emit() {}, on(type, fn) { handlers[type] = fn; return () => { unsubscribed += 1; }; } };
  const state = { tick: 1, mode: 'flight', playerId: 1, player: { alive: true }, settings: { controls: { touch: {} } }, input: {}, ui: { screenStack: [] }, entities: new Map() };
  const doc = { body: { classList: { contains: () => false } }, documentElement: { dataset: {} } };
  const win = { innerWidth: 390, innerHeight: 844, navigator: { maxTouchPoints: 5 }, matchMedia: () => ({ matches: true }) };
  const touch = { active: false, axes: {}, actions: {}, _btnHeld: {}, _btnPulse: {}, _clearTouchState() {}, tick() {}, isConnected() { return this.active; } };
  enhanceMobileTouch(touch, { state, bus }, { win, doc, mountView: () => ({ root: {}, render() {}, applyConfig() {}, cancelAll() {}, destroy() {}, setDockReady: v => seen.push(v), openGuide: () => seen.push('guide') }) });
  touch.autoDetect();
  assert.equal(typeof handlers['dock:range'], 'function');
  handlers['dock:range']({ inRange: true }); handlers['dock:range']({ inRange: false }); handlers['dock:range']({});
  assert.deepEqual(seen, [true, false, false]);
  assert.equal(typeof handlers['touch:guide'], 'function');
  handlers['touch:guide']();
  assert.deepEqual(seen.slice(-1), ['guide']);
  touch.setEnabled(false);
  assert.equal(unsubscribed, 2);
});

// Ordinary-flight collision contracts run in the existing mobile-readiness unit gate.
import esbuild from 'esbuild';
import { MOBILE_FLIGHT_LAYOUT_CSS as css } from '../src/ui/orrery/mobileFlightLayouts.js';
import { HUD_CSS } from '../src/ui/views/hudStyles.js';

function parseAuthoredCss(source) {
  const cssText = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const parseRange = (start, end, media = []) => {
    let cursor = start;
    while (cursor < end) {
      while (/\s/.test(cssText[cursor] || '')) cursor++;
      const open = cssText.indexOf('{', cursor);
      if (open < 0 || open >= end) return;
      const header = cssText.slice(cursor, open).trim();
      let depth = 1, close = open + 1;
      while (close < end && depth > 0) {
        if (cssText[close] === '{') depth++;
        else if (cssText[close] === '}') depth--;
        close++;
      }
      if (depth !== 0) throw new Error(`Unclosed CSS rule: ${header}`);
      if (header.startsWith('@media')) parseRange(open + 1, close - 1, [...media, header.slice(6).trim()]);
      else {
        const declarations = Object.create(null);
        for (const declaration of cssText.slice(open + 1, close - 1).split(';')) {
          const colon = declaration.indexOf(':');
          if (colon >= 0) declarations[declaration.slice(0, colon).trim()] = declaration.slice(colon + 1).trim();
        }
        rules.push({ selectors: header.split(',').map((selector) => selector.trim()), declarations, media });
      }
      cursor = close;
    }
  };
  parseRange(0, cssText.length);
  return rules;
}
const authoredRules = parseAuthoredCss(css);
const screenRules = parseAuthoredCss(MOBILE_CSS);
const flightScope = '[data-sf-mobile="1"][data-sf-mobile-flight="1"]';
function mobileRule(suffix, sourceRules = authoredRules, condition = 'max-width:959px') {
  return sourceRules.find((rule) => rule.selectors.some((selector) =>
    selector.includes(flightScope) && selector.endsWith(suffix))
    && (condition === null || (condition ? rule.media.some((media) => media.includes(condition)) : rule.media.length === 0))) || null;
}
const value = (rule, property) => rule?.declarations[property] || '';
const px = (input) => Number(input.match(/-?\d+(?:\.\d+)?px/)?.[0].replace('px', ''));
const dock = mobileRule('#hud .sf-rightdock');
const railBase = mobileRule('#race-tape[data-compact="true"]');
const compactFace = mobileRule('#hud .sf-radar-wrap:not(.sf-radar-wrap--expanded) .sf-radar');
const objective = mobileRule('#hud > .sf-leftcontext');
const expandedFace = mobileRule('#hud .sf-radar-wrap--expanded .sf-radar canvas');
const landscapeDock = mobileRule('#hud .sf-rightdock', authoredRules, 'max-height:500px');
const landscapeRail = mobileRule('#race-tape[data-compact="true"]', authoredRules, 'max-height:500px');
const portraitReceipt = mobileRule('#toasts', screenRules, null);
const sectorLaw = mobileRule('#ui-root > #sf-sector-law', authoredRules, null);
const powers = mobileRule('#sf-touch-overlay .mf-edge', authoredRules, 'orientation:portrait');
const powersWord = mobileRule('#sf-touch-overlay .mf-edge-word', authoredRules, 'orientation:portrait');

test('the authored mobile flight stylesheet parses and is composed into HUD CSS', async () => {
  await esbuild.transform(css, { loader: 'css' });
  assert.ok(HUD_CSS.includes(css), 'the runtime stylesheet uses the exact mobile flight owner output');
  for (const [name, rule] of Object.entries({ dock, compactFace, objective, expandedFace, landscapeDock, landscapeRail, portraitReceipt, powers, powersWord, sectorLaw })) {
    assert.ok(rule, `${name} has a rule active for its mobile flight condition`);
  }
  assert.equal(px(value(compactFace, 'width')), 116, 'the current phone radar face keeps its authored 116px diameter');
  assert.equal(px(value(expandedFace, 'width')), 290, 'expanded radar retains its full tactical face');
  assert.equal(px(value(powers, 'min-height')), 44, 'Powers keeps a thumb-sized target');
  assert.equal(value(powersWord, 'writing-mode'), 'horizontal-tb', 'Powers label stays readable horizontally');
});

test('portrait objective and receipt text lanes clear the current radar dock at supported widths', () => {
  const dockWidth = px(value(dock, 'width'));
  const dockRight = px(value(dock, 'right'));
  const objectiveMax = px(value(objective, 'width'));
  const objectiveInset = px(value(objective, 'left'));
  const objectiveReserve = Number(value(objective, 'width').match(/100vw - (\d+)px/)?.[1]);
  const receiptWidthMax = Number(value(portraitReceipt, 'width').match(/min\((\d+)px/)?.[1]);
  const receiptInset = px(value(portraitReceipt, 'left'));
  const thumbFloor = Number(value(portraitReceipt, 'width').match(/max\((\d+)px/)?.[1]);
  const thumbFactor = Number(value(portraitReceipt, 'width').match(/\* ([\d.]+)\)/)?.[1]);
  for (const [width, safeLeft, safeRight, cluster] of [
    [390,0,0,196], [390,16,16,240], [360,0,0,320], [320,0,0,196], [320,16,16,320],
  ]) {
    const objectiveWidth = Math.min(objectiveMax, width - objectiveReserve - safeLeft - safeRight);
    const objectiveRight = objectiveInset + safeLeft + objectiveWidth;
    const radarLeft = width - dockRight - safeRight - dockWidth;
    const receiptWidth = Math.min(receiptWidthMax, width - 26 - Math.max(thumbFloor, cluster * thumbFactor) - safeLeft - safeRight);
    assert.ok(objectiveWidth >= 100, `${width}px objective retains a readable wrapping column`);
    assert.ok(radarLeft - objectiveRight >= 8, `${width}px objective clears the 148px radar dock`);
    assert.ok(receiptWidth >= 128, `${width}px receipt retains a wrapping text lane (got ${receiptWidth})`);
  }
  assert.equal(value(portraitReceipt, 'right'), 'auto');
  assert.doesNotMatch(value(portraitReceipt, 'overflow-y'), /hidden/);
});

test('landscape camera and Circuits rail remains visible between status and Pause', () => {
  const dockWidth = px(value(dock, 'width'));
  const dockRight = px(value(landscapeDock, 'right'));
  const dockTop = px(value(landscapeDock, 'top'));
  const railTop = px(value(landscapeRail, 'top'));
  const railOffset = px(value(landscapeRail, 'left'));
  const railWidth = px(value(railBase, 'width'));
  for (const [width, height, safeLeft, safeRight] of [[844,390,0,0],[667,375,0,0],[568,320,0,0],[844,390,44,44]]) {
    const dockLeft = width - dockRight - safeRight - dockWidth;
    const left = dockLeft + railOffset - width + safeLeft + safeRight;
    const right = left + railWidth;
    const top = dockTop + railTop;
    const statusRight = 14 + safeLeft + 150;
    const pauseLeft = width - 12 - safeRight - 52;
    assert.ok(left >= statusRight + 4, `${width}px rail clears status`);
    assert.ok(right <= pauseLeft - 12, `${width}px rail clears Pause`);
    assert.ok(left >= 0 && top >= 0 && top + 44 <= height, `${width}x${height} rail stays inside the viewport with 44px controls`);
  }
});

test('mobile dock and compact controls keep their authored flow and touch target sizing', () => {
  assert.equal(px(value(dock, 'width')), 148);
  assert.equal(value(dock, 'align-items'), 'flex-end');
  assert.equal(value(dock, 'overflow'), 'visible!important');
  assert.equal(value(sectorLaw, 'position'), 'fixed !important');
  assert.match(MOBILE_CSS, /#race-tape \.race-tape-actions \.k-word \{ min-height:44px/);
  assert.match(MOBILE_CSS, /#race-tape\[data-compact="false"\]/);
});

test('portrait Powers keeps its target, label, and touch-through receipt policy', () => {
  assert.equal(value(powers, 'width'), '68px');
  assert.equal(value(powers, 'min-height'), '44px');
  assert.match(value(powersWord, 'writing-mode'), /horizontal-tb/);
  assert.match(MOBILE_CSS, /#toasts,#toasts \*/);
  assert.doesNotMatch(value(portraitReceipt, 'overflow-y'), /hidden/);
});
test('portrait Powers restyling preserves its existing accessible tap, swipe, dismiss and edge gestures', () => {
  const view=readFileSync(new URL('../src/systems/mobile/view.js',import.meta.url),'utf8');
  assert.match(view, /class="mf-edge" aria-label="Powers: swipe inward to select, or tap to open"/);
  assert.match(view, /<span class="mf-edge-word">Powers<\/span>/);
  assert.match(view, /aria-hidden="true" focusable="false"/);
  assert.match(view, /edge\.setAttribute\('aria-expanded', 'true'\)/);
  assert.match(view, /edge\.setAttribute\('aria-expanded', 'false'\)/);
  assert.match(view, /listen\(edge, 'click'/);
  assert.match(view, /e\.code === 'Escape'.*closeWheel\(\)/);
  assert.match(view, /else if \(!ended\.moved\) \{ pinned = true; openWheel\(\); \}/);
  assert.match(view, /magnet === 'wheel' \|\| inEdgeZone\(e\.clientX, e\.clientY\)/);
  assert.ok(view.indexOf('target.closest?.(NO_FLY_SELECTOR)')<view.indexOf("magnet === 'wheel'"), 'radar is excluded before the intentional edge gesture');
});
