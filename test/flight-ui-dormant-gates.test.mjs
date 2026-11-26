// Flight UI dormant-presenter gates: presenters that early-return while inactive now expose
// wantsFrame()/isActive so the frame loop can skip the call itself, and the elapsed-time
// gates that collapsed to every presented frame at low FPS got a presented-frame bound.
// Run: node --test test/flight-ui-dormant-gates.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { mountPhysicsVenueHud } from '../src/ui/physicsVenues.js';
import { mountSpectrumOverlay } from '../src/render/spectrum/overlay.js';
import { mountTowjawPresentation } from '../src/features/towjaw/presentation.js';
import { createSectorLawPresenter } from '../src/ui/sectorLawPresenter.js';
import { createContactHailPrompt } from '../src/ui/contactHailPrompt.js';
import { createCommsRadial } from '../src/ui/commsRadial.js';
import { createComms } from '../src/ui/comms.js';
import { mountRacingHud } from '../src/ui/racingHud.js';

/** Minimal DOM used by the real presenters (same shape the comms presenter tests mount). */
function makeNode(tagName = 'div') {
  const node = {
    tagName: String(tagName).toUpperCase(),
    id: '',
    className: '',
    textContent: '',
    innerHTML: '',
    hidden: false,
    isConnected: true,
    children: [],
    parentNode: null,
    dataset: {},
    attributes: {},
    listeners: {},
    inert: false,
    disabled: false,
    style: { setProperty(name, value) { this[name] = value; } },
    get childNodes() { return this.children; },
    get firstChild() { return this.children[0] || null; },
    appendChild(child) {
      if (!child) return child;
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    insertBefore(child, ref) {
      child.parentNode = this;
      const i = ref ? this.children.indexOf(ref) : -1;
      if (i < 0) this.children.push(child); else this.children.splice(i, 0, child);
      return child;
    },
    append(...kids) { for (const kid of kids) this.appendChild(kid); },
    prepend(child) { return this.insertBefore(child, this.children[0] || null); },
    replaceChildren(...kids) {
      for (const kid of this.children) kid.parentNode = null;
      this.children = [];
      this.append(...kids);
    },
    after(...kids) {
      if (!this.parentNode) return;
      const i = this.parentNode.children.indexOf(this);
      for (const kid of kids) this.parentNode.insertBefore(kid, this.parentNode.children[i + 1] || null);
    },
    removeChild(child) {
      this.children = this.children.filter((entry) => entry !== child);
      child.parentNode = null;
      return child;
    },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === 'id') this.id = String(value);
      if (name === 'class') this.className = String(value);
      if (name === 'hidden') this.hidden = true;
    },
    getAttribute(name) { return this.attributes[name] ?? null; },
    removeAttribute(name) { delete this.attributes[name]; },
    hasAttribute(name) { return Object.hasOwn(this.attributes, name); },
    addEventListener(name, fn) { (this.listeners[name] = this.listeners[name] || []).push(fn); },
    removeEventListener(name, fn) {
      this.listeners[name] = (this.listeners[name] || []).filter((entry) => entry !== fn);
    },
    dispatchEvent(event) {
      for (const fn of this.listeners[event && event.type] || []) fn(event);
      return true;
    },
    insertAdjacentHTML(_where, html) { this.innerHTML = (this.innerHTML || '') + String(html); },
    querySelector() { return makeNode('div'); },
    querySelectorAll() { return []; },
    closest() { return null; },
    contains(descendant) {
      for (let node = descendant; node; node = node.parentNode) if (node === this) return true;
      return false;
    },
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    focus() {},
    blur() {},
    click() { for (const fn of this.listeners.click || []) fn({ target: this, detail: 0, preventDefault() {}, stopPropagation() {} }); },
  };
  node.classList = {
    add(...names) { node.className = [...node.className.split(/\s+/), ...names].filter(Boolean).join(' '); },
    remove(...names) { node.className = node.className.split(/\s+/).filter((n) => n && !names.includes(n)).join(' '); },
    toggle(name, force) {
      const has = node.className.split(/\s+/).includes(name);
      const want = force === undefined ? !has : !!force;
      if (want && !has) node.classList.add(name);
      if (!want && has) node.classList.remove(name);
      return want;
    },
    contains(name) { return node.className.split(/\s+/).includes(name); },
  };
  return node;
}

function installDom() {
  const previous = globalThis.document;
  const previousRaf = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  const head = makeNode('head');
  const body = makeNode('body');
  const html = makeNode('html');
  const uiRoot = makeNode('div');
  uiRoot.id = 'ui-root';
  body.appendChild(uiRoot);
  const doc = {
    head,
    body,
    documentElement: html,
    activeElement: body,
    createElement: makeNode,
    createElementNS: (_namespace, tagName) => makeNode(tagName),
    createDocumentFragment: () => makeNode('fragment'),
    getElementById(id) {
      const visit = (node) => {
        if (!node) return null;
        if (node.id === id) return node;
        for (const child of node.children || []) {
          const found = visit(child);
          if (found) return found;
        }
        return null;
      };
      return visit(head) || visit(body);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    removeEventListener() {},
  };
  uiRoot.ownerDocument = doc;
  body.ownerDocument = doc;
  head.ownerDocument = doc;
  globalThis.document = doc;
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  return {
    doc,
    uiRoot,
    restore() {
      if (previous === undefined) delete globalThis.document; else globalThis.document = previous;
      if (previousRaf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = previousRaf;
      if (previousCancel === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = previousCancel;
    },
  };
}

function flightState(extra = {}) {
  return {
    mode: 'flight',
    simTime: 0,
    tick: 0,
    playerId: 'player',
    entities: new Map([['player', { id: 'player', alive: true, pos: { x: 0, z: 0 }, team: 1, data: {} }]]),
    entityList: [],
    player: { targetId: null },
    ui: {},
    settings: { gameplay: {}, accessibility: {}, video: {}, ui: {} },
    input: { actions: {} },
    missions: { active: [] },
    world: { currentSectorId: 'helios' },
    nav: {},
    story: {},
    ...extra,
  };
}

test('physics venue HUD: wantsFrame sleeps dormant, lives through the one hide pass', () => {
  const dom = installDom();
  try {
    const state = flightState();
    const screens = { isOpen: () => false };
    const hud = mountPhysicsVenueHud({ root: dom.uiRoot, state, bus: createBus(), screens });
    assert.ok(hud && typeof hud.wantsFrame === 'function');
    assert.equal(hud.wantsFrame(), false, 'no venue: the presenter is dormant');
    state.physicsVenuePublic = { active: true, title: 'CAN SHOT', remainingSeconds: 30 };
    assert.equal(hud.wantsFrame(), true, 'a live venue wakes the presenter');
    hud.frame();
    const panel = dom.uiRoot.children.find((el) => el.id === 'physics-venue-instrument');
    assert.equal(panel.hidden, false);
    state.physicsVenuePublic = { active: false };
    assert.equal(hud.wantsFrame(), true, 'still shown: one more frame owes the hide pass');
    hud.frame();
    assert.equal(panel.hidden, true);
    assert.equal(hud.wantsFrame(), false, 'retired surfaces sleep again');
    // A screen opening over a live venue is the same contract.
    state.physicsVenuePublic = { active: true, title: 'CAN SHOT' };
    hud.frame();
    screens.isOpen = () => true;
    assert.equal(hud.wantsFrame(), true);
    hud.frame();
    assert.equal(panel.hidden, true);
    assert.equal(hud.wantsFrame(), false);
    hud.dispose();
  } finally { dom.restore(); }
});

test('spectrum overlay: wantsFrame tracks liveness, and the paint pass never lands twice in a row', () => {
  const dom = installDom();
  try {
    const state = flightState({
      spectrumPublic: { resolved: false, log: [{ bearingDeg: 45, observer: { x: 0, z: 0 } }], props: [] },
    });
    const overlay = mountSpectrumOverlay({
      root: dom.uiRoot,
      state,
      helpers: { worldToScreen: (w) => ({ x: w.x + 100, y: w.z + 100 }) },
      screens: { isOpen: () => false },
    });
    assert.equal(overlay.wantsFrame(), true, 'live scan geometry wants a frame');
    // Low-FPS regime: sim time advances past the 0.1 s gate on every presented frame.
    // The old gate repainted every frame; the pass counter must keep it to every other.
    let paints = 0;
    const path = dom.uiRoot.children[0].children[0];
    const original = path.setAttribute.bind(path);
    path.setAttribute = (name, value) => { if (name === 'd') paints += 1; return original(name, value); };
    for (let i = 0; i < 10; i += 1) { state.simTime += 0.2; overlay.frame(); }
    assert.ok(paints <= 6, `10 collapsed frames repainted ${paints} paths (want <= 6)`);
    assert.ok(paints >= 4, `the scanner still paints about half its frames (${paints})`);
    state.spectrumPublic = { resolved: true };
    assert.equal(overlay.wantsFrame(), true, 'the displayed svg is owed its hide pass');
    overlay.frame();
    assert.equal(dom.uiRoot.children[0].style.display, 'none');
    assert.equal(overlay.wantsFrame(), false, 'hidden svg sleeps');
    state.mode = 'station';
    assert.equal(overlay.wantsFrame(), false, 'outside flight there is no work at all');
    overlay.dispose();
  } finally { dom.restore(); }
});

test('towjaw mount: wantsFrame follows flight conditions plus one clear pass', () => {
  const dom = installDom();
  try {
    const ctx2d = new Proxy({}, { get: (target, prop) => target[prop] ?? (() => {}), set: (target, prop, v) => { target[prop] = v; return true; } });
    const doc2 = dom.doc;
    const origCreate = doc2.createElement;
    doc2.createElement = (tag) => {
      const node = origCreate(tag);
      if (tag === 'canvas') node.getContext = () => ctx2d;
      return node;
    };
    const state = flightState();
    const runtime = {
      getView: () => ({
        phase: 'assault',
        world: { boss: { id: 'boss', alive: true, pos: { x: 0, z: 0 }, radius: 20 }, debris: [], mechanisms: {} },
      }),
    };
    const overlay = mountTowjawPresentation({
      root: dom.uiRoot, state, bus: createBus(),
      helpers: { worldToScreen: () => ({ x: 10, y: 10, onScreen: true }) },
      runtime,
      document: doc2,
    });
    assert.ok(overlay, 'mount succeeded');
    assert.equal(overlay.wantsFrame(), true, 'in flight with a live boss the warning surface works');
    overlay.draw();
    assert.equal(overlay.wantsFrame(), true, 'the fight stays live');
    state.mode = 'station';
    assert.equal(overlay.wantsFrame(), true, 'paint may remain: one more draw owes the clear');
    overlay.draw();
    assert.equal(overlay.wantsFrame(), false, 'cleared canvas and caption sleep until flight');
    overlay.draw();
    assert.equal(overlay.wantsFrame(), false, 'a skipped-by-contract draw stays asleep');
    overlay.destroy();
  } finally { dom.restore(); }
});

test('sector law / hail / radial isActive mirrors exactly what their tick() consumes', () => {
  const dom = installDom();
  try {
    const bus = createBus();
    const state = flightState();
    const law = createSectorLawPresenter({ state, bus });
    assert.equal(law.isActive, false, 'a dormant law card is skippable');
    bus.emit('law:incidentResolved', { id: 'inc-1', status: 'resolved', outcome: 'disengaged' });
    assert.equal(law.isActive, true, 'a seated receipt is live');
    law.hide();
    assert.equal(law.isActive, false);

    const hail = createContactHailPrompt({ state, bus });
    // The stub querySelector cannot parse the innerHTML `hidden` attribute the real panel
    // carries, so normalize through the presenter's own hide pass first.
    hail.hide();
    assert.equal(hail.isActive, false);
    state.player.targetId = 'npc_1';
    bus.emit('contactHail:offer', { targetId: 'npc_1', requestId: 'r1', lines: ['SAY AGAIN'], actions: [], expiresAt: 9 });
    assert.equal(hail.isActive, true, 'a live offer is work');
    bus.emit('contactHail:handoff', {});
    assert.equal(hail.isActive, false, 'handoff retires the panel');

    const radial = createCommsRadial({ state, bus });
    assert.equal(radial.isActive, false, 'closed fan and deck sleep');
    radial.tick(); // never throws while dormant
    radial.destroy();
    hail.destroy();
    law.destroy();
  } finally { dom.restore(); }
});

test('comms.tick fans out only to live children; an active one still gets serviced', () => {
  const dom = installDom();
  try {
    const bus = createBus();
    const state = flightState();
    const comms = createComms({ bus, state });
    // The stub's querySelector cannot parse the innerHTML `hidden` the real panel carries:
    // normalize the hail surface through its own hide pass so isActive reads dormant.
    comms.contactHailPrompt.hide();
    const lawTick = comms.sectorLawPresenter.tick;
    const hailTick = comms.contactHailPrompt.tick;
    const radialTick = comms.commsRadial.tick;
    const wheelTick = comms.contextWheel.tick;
    let lawCalls = 0, hailCalls = 0, radialCalls = 0, wheelCalls = 0;
    comms.sectorLawPresenter.tick = () => { lawCalls += 1; return lawTick(); };
    comms.contactHailPrompt.tick = () => { hailCalls += 1; return hailTick(); };
    comms.commsRadial.tick = () => { radialCalls += 1; return radialTick(); };
    comms.contextWheel.tick = () => { wheelCalls += 1; return wheelTick(); };
    for (let i = 0; i < 5; i += 1) comms.tick();
    assert.equal(lawCalls, 0, 'dormant sector law never gets a call');
    assert.equal(hailCalls, 0, 'dormant contact hail never gets a call');
    assert.equal(radialCalls, 0, 'closed radial never gets a call');
    assert.equal(wheelCalls, 5, 'the context wheel still watches its hold-to-open flag every frame');
    // Wake the law card: the gate opens and the receipt expires through tick() as before.
    bus.emit('law:incidentResolved', { id: 'inc-9', status: 'resolved', outcome: 'disengaged' });
    comms.tick();
    assert.equal(lawCalls, 1, 'a live receipt is ticked');
    state.simTime += 60; // past the receipt TTL
    comms.tick();
    assert.equal(lawCalls, 2);
    assert.equal(comms.sectorLawPresenter.isActive, false, 'expired receipt retired itself');
    comms.tick();
    assert.equal(lawCalls, 2, 'retired card sleeps again');
    comms.destroy();
  } finally { dom.restore(); }
});

test('racing tape: the 10 Hz body never repaints on two consecutive presented frames', () => {
  const dom = installDom();
  try {
    const bus = createBus();
    const race = {
      id: 'm-race', status: 'active', type: 'race',
      params: { racingContractId: 'rc-1', nextGate: 1, raceElapsedS: 12, raceMode: 'time-trial' },
    };
    const state = flightState({ missions: { active: [race] } });
    const tape = mountRacingHud({ root: dom.uiRoot, state, bus, screens: { isOpen: () => false } });
    assert.ok(tape);
    const panel = dom.uiRoot.children.find((el) => el.id === 'race-tape');
    assert.ok(panel);
    const readings = panel.children.find((el) => String(el.className).includes('race-tape-readings'));
    const sub = readings.children.find((el) => String(el.className).includes('race-tape-stats'));
    let writes = 0;
    const desc = Object.getOwnPropertyDescriptor(sub, 'textContent') || {};
    let text = sub.textContent;
    Object.defineProperty(sub, 'textContent', {
      get: () => text,
      set: (v) => { writes += 1; text = v; },
      configurable: true,
    });
    // Collapsed regime: sim time jumps 0.2 s per presented frame — the old gate repainted all 10.
    for (let i = 0; i < 10; i += 1) { state.simTime += 0.2; tape.frame(state); }
    assert.ok(writes <= 6, `10 collapsed frames repainted the tape ${writes} times (want <= 6)`);
    assert.ok(writes >= 4, `the tape still repaints about half its frames (${writes})`);
    // The force-refresh paths still work: a restart event repaints on the very next frame.
    bus.emit('race:restarted', { racingContractId: 'rc-1' });
    state.simTime += 0.016;
    tape.frame(state);
    assert.ok(writes >= 5, 'a force-refresh paints on the next frame');
    tape.dispose();
  } finally { dom.restore(); }
});
