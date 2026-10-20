// The phone deck's instruments: the joystick's maths and drawing, the powers wheel's geometry, the ship's
// place on screen, the DOCK key's feed, and the phone-layout test the title uses. DOM work runs against a
// tiny stand-in document: these pin what is WRITTEN (attributes, text, data flags), never what it looks like.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SPEED_RAMP } from '../src/ui/orrery/speedDial.js';
import { rampRgb, pullToRamp, dialDeg, createStick, STICK_UNITS } from '../src/systems/mobile/instrument.js';
import { sectorDeg, createWheel } from '../src/systems/mobile/wheel.js';
import { shipOnScreen, isPhoneLayout } from '../src/systems/mobile/model.js';
import { enhanceMobileTouch } from '../src/systems/mobile/bridge.js';
import { POWER_PAGES, icon } from '../src/systems/mobile/catalog.js';
import { MOBILE_CSS } from '../src/systems/mobile/styles.js';

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

test('short landscape flight receipts start below the HUD while portrait keeps its lower lane', () => {
  const shortLandscape = MOBILE_CSS.slice(MOBILE_CSS.indexOf('@media (max-height:500px) and (orientation:landscape) {'));
  const flightReceipt = /:root\[data-sf-mobile="1"\]\[data-sf-mobile-flight="1"\] #toasts\s*\{([^}]+)\}/.exec(shortLandscape)?.[1];
  assert.ok(flightReceipt, 'phone flight receipt placement is scoped to short landscape');
  assert.match(flightReceipt, /top:calc\(118px \+ var\(--sf-safe-top,0px\)\)!important/);
  assert.match(flightReceipt, /bottom:auto!important/);
  assert.match(MOBILE_CSS,
    /:root\[data-sf-mobile="1"\]\[data-sf-mobile-flight="1"\] #toasts \{[^}]*top:auto!important; bottom:calc\(max\(224px/,
    'portrait continues using the existing bottom-anchored receipt lane');
  assert.match(MOBILE_CSS, /:is\(#toasts,#toasts \*\)\s*\{\s*pointer-events:none!important/,
    'receipt placement retains touch-through');
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
import { readFileSync } from 'node:fs';
import esbuild from 'esbuild';
import { MOBILE_FLIGHT_LAYOUT_CSS as css } from '../src/ui/orrery/mobileFlightLayouts.js';

const hud = readFileSync(new URL('../src/ui/views/hudStyles.js', import.meta.url), 'utf8');
const portrait = css.slice(0, css.indexOf('@media (max-height:500px)'));
const landscape = css.slice(portrait.length, css.indexOf('@media (orientation:portrait)'));
const rule = (sheet, selector) => sheet.slice(sheet.indexOf(selector) + selector.length).match(/^\s*\{([^}]+)\}/)?.[1] || '';
const dock = rule(portrait, '#hud .sf-rightdock');
const radar = rule(portrait, '#hud .sf-radar-wrap');
const objective = rule(portrait, '#hud > .sf-leftcontext');
const rail = rule(landscape, '#race-tape[data-compact="true"]');

// These are authored placement contracts, NOT a browser measurement or visual acceptance.
// Pull numerical dimensions from the production rules so changing their geometry reruns the proof.
const radarWidth = Number(radar.match(/width:(\d+)px/)?.[1]);
const radarScale = Number(radar.match(/scale\(([^)]+)\)/)?.[1]);
const reserve = Number(objective.match(/100vw - (\d+)px/)?.[1]);
const unscale = Number(objective.match(/\* ([\d.]+)\)/)?.[1]);

test('mobile geometry is owned once and imported into the production HUD stylesheet', () => {
  assert.match(hud, /import \{ MOBILE_FLIGHT_LAYOUT_CSS \} from '\.\.\/orrery\/mobileFlightLayouts\.js'/);
  assert.match(hud, /\$\{MOBILE_FLIGHT_LAYOUT_CSS\}/);
  assert.doesNotMatch(hud, /right: calc\(90px \+ var\(--sf-safe-right, 0px\)\) !important/);
  assert.doesNotMatch(MOBILE_CSS, /\[data-sf-mobile-flight="1"\] #hud \.sf-(?:rightdock|radar-wrap)\s*\{/);
  assert.doesNotMatch(MOBILE_CSS, /#race-tape\[data-compact="true"\]\s*\{/);
  assert.match(css, /@media \(max-width:959px\), \(max-height:599px\)/);
  for (const line of css.split('\n').filter(line => line.includes('#hud') || line.includes('#race-tape'))) {
    assert.ok(line.includes('[data-sf-mobile="1"][data-sf-mobile-flight="1"]'), line);
  }
});

test('the entire radar retains its readability scale without scaling its parent twice', () => {
  assert.equal(radarScale, .75);
  assert.equal(radarWidth * radarScale, 153);
  assert.match(dock, /transform:none!important/);
  assert.match(dock, /align-items:flex-end/);
  assert.match(dock, /overflow:visible!important/);
  assert.match(radar, /position:relative!important/);
  assert.match(radar, /transform-origin:top right!important/);
  assert.match(radar, /flex-shrink:0/);
  assert.doesNotMatch(css.replace(/[^{}]*\.mf-edge-art \{ display:none; \}/, ''), /display:none|visibility:hidden|opacity:0|overflow:hidden/);
});

for (const [width, height, safeLeft, safeRight] of [[390,664,0,0],[390,844,0,0],[320,568,0,0],[360,640,0,0],[390,844,16,16]]) {
  test(`portrait ${width}x${height}, insets ${safeLeft}/${safeRight}: wrapped objective clears radar horizontally`, () => {
    const radarLeft = width - 12 - safeRight - radarWidth * radarScale;
    const objectiveWidth = Math.min(250, (width - reserve - safeLeft - safeRight) * unscale) * .75;
    const objectiveRight = 14 + safeLeft + objectiveWidth;
    assert.ok(objectiveWidth >= 100, 'narrow objective remains a readable wrapping column');
    assert.ok(radarLeft - objectiveRight >= 12.99, `${radarLeft} must clear ${objectiveRight}`);
    assert.match(objective, /--sf-safe-left/);
    assert.match(objective, /--sf-safe-right/);
    assert.match(dock, /196px \+ var\(--sf-safe-top/);
  });
}

for (const [width,height,safeLeft,safeRight] of [[844,390,0,0],[667,375,0,0],[568,320,0,0],[844,390,44,44]]) {
  test(`landscape ${width}x${height}: camera rail clears vitals, Pause and radar`, () => {
    const right = width - Number(rail.match(/right:calc\((\d+)px/)?.[1]) - safeRight;
    const left = right - Number(rail.match(/width:(\d+)px/)?.[1]);
    const top = Number(rail.match(/top:calc\((\d+)px/)?.[1]);
    const radarTop = Number(rule(landscape, '#hud .sf-rightdock').match(/top:calc\((\d+)px/)?.[1]);
    assert.ok(left >= 14 + safeLeft + 176 + 12, 'status strip remains separate');
    assert.ok(right <= width - 12 - safeRight - 52 - 12, 'Pause remains separate');
    assert.ok(right - left >= 180, 'two 44px-high keys have room for their labels');
    assert.ok(top + 44 + 12 + 12 <= radarTop, 'touch row and padding clear the compass');
  });
}

test('production layout CSS parses, and keeps compact buttons thumb-sized and authored races intact', async () => {
  await esbuild.transform(css, { loader:'css' });
  assert.match(MOBILE_CSS, /#race-tape \.race-tape-actions \.k-word \{ min-height:44px/);
  assert.match(MOBILE_CSS, /#race-tape\[data-compact="false"\]/);
  assert.doesNotMatch(css, /data-compact="false"/);
});


test('expanded radar preserves its authored envelope and double-range interaction', () => {
  const expanded = rule(portrait, '#hud .sf-radar-wrap.sf-radar-wrap--expanded');
  const expandedWidth = Number(expanded.match(/width:(\d+)px/)?.[1]);
  const authored = hud.match(/sf-radar-wrap--expanded \{[^}]*width:(\d+)px/);
  assert.equal(expandedWidth, Number(authored?.[1]));
  assert.equal(expandedWidth * radarScale, 268.5);
  assert.ok(expandedWidth > radarWidth, 'do not collapse the enlarged tactical instrument');
  const source = readFileSync(new URL('../src/ui/radar.js', import.meta.url), 'utf8');
  assert.match(source, /setExpanded\(!expanded\)/);
  assert.match(source, /expanded \? baseRange \* 2 : baseRange/);
  assert.match(source, /ev.clientX - rect.left/);
  // This deliberately does not claim non-overlap for the expanded tactical overlay.
});

test('law/contact cards retain natural flow above radar at their existing usable widths', () => {
  assert.match(hud, /\.sf-rightdock \{[^}]*display:flex; flex-direction:column/s);
  assert.match(hud, /\.sf-rightdock > \* \{ flex:0 0 auto; width:100%/);
  assert.match(dock, /width:min\(236px,58vw\)!important/);
  assert.match(rule(landscape, '#hud .sf-rightdock'), /width:min\(236px,32vw\)!important/);
  assert.match(dock, /max-height:none!important; overflow:visible!important/);
  assert.doesNotMatch(css, /#sf-sector-law|\.sf-overview|\.sf-target/);
});


test('portrait receipts reserve the actual radar caption lane for both handedness settings', () => {
  const receiptCss = css.slice(css.indexOf('@media (orientation:portrait)')).split('#toasts,')[1];
  assert.match(receiptCss, /\[data-sf-mobile-lefty="1"\] #toasts/);
  assert.match(receiptCss, /left:calc\(14px \+ var\(--sf-safe-left,0px\)\)!important; right:auto!important/);
  assert.match(receiptCss, /max\(166px,var\(--mf-cluster-w,196px\) \* \.25\)/);
  assert.doesNotMatch(receiptCss, /overflow|white-space|text-overflow|display:none|opacity/);
  for (const width of [320,360,390]) for (const cluster of [196,240,320]) {
    const left=14, receiptWidth=width-26-Math.max(166,cluster*.25);
    const radarLeft=width-12-radarWidth*radarScale;
    assert.ok(receiptWidth>=128, 'retain a wrapping text lane at the narrow supported floor');
    assert.ok(radarLeft-(left+receiptWidth)>=13, 'receipt cannot cross the radar caption');
  }
  assert.match(MOBILE_CSS, /#toasts,#toasts \*/);
});


test('portrait Powers keeps its 44px target and horizontal label beside actual scaled Pause', () => {
  const sheet = css.slice(css.indexOf('@media (orientation:portrait)'));
  const edge = rule(sheet, '#sf-touch-overlay .mf-edge');
  const word = rule(sheet, '#sf-touch-overlay .mf-edge-word');
  assert.match(edge, /top:calc\(14px \+ var\(--sf-safe-top,0px\)\); bottom:auto; left:auto/);
  assert.match(edge, /20px \+ max\(44px,52px \* var\(--mf-scale\)\)/);
  assert.match(edge, /width:68px; height:44px; min-width:44px; min-height:44px/);
  assert.match(word, /writing-mode:horizontal-tb; transform:none/);
  assert.ok(68>=63+4, 'actual CI English label span (~63px) fits inside the target without shrinking its font');
  assert.match(sheet, /\.mf-edge::before \{ content:none; \}/);
  assert.match(sheet, /\.mf-edge-art \{ display:none; \}/);
  assert.match(sheet, /\.mf-speed \{ flex-wrap:wrap; row-gap:2px/);
  assert.doesNotMatch(landscape, /mf-edge|mf-status|mf-speed/);
  // Source geometry only: real frame review is still required. A left-hand override has lower
  // specificity than these root-qualified rules, so handedness cannot return the side handle.
  for (const [w,h,inset] of [[320,568,0],[320,568,16],[390,664,0],[390,844,16]]) {
    for (const scale of [.8,1,1.6]) for (const lefty of [false,true]) {
      const pauseWidth = Math.max(44,52*scale);
      const pauseLeft = w-12-inset-pauseWidth;
      const powersRight = w-20-inset-pauseWidth, powersLeft=powersRight-68;
      const statusWidth=Math.min(176,w-114-pauseWidth-2*inset);
      assert.ok(pauseLeft-powersRight>=7.99, `${w}/${h}/${scale}/${lefty}: Pause gap`);
      assert.ok(powersLeft-(14+inset+statusWidth)>=11.99, 'status gap');
      assert.ok(statusWidth-62-8>=20.79, 'existing labels retain visible meter bars even at maximum scale and safe insets');
      assert.ok(14+44+12<=70, 'Powers clears the camera row, therefore lower radar and actions');
    }
  }
  assert.match(MOBILE_CSS, /button:focus-visible \{ outline:2px/);
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
