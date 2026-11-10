// X3 — Adventure glass at the presenters. The policy tests are in adventure-glass.test.mjs;
// these drive the real presenters and read what they would actually draw in ordinary flight.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { setReceiptPresenter } from '../src/core/receiptPresenter.js';
import { admitReceipt } from '../src/ui/hudAttention.js';
import { attentionAdmits, isAdventureFlight } from '../src/ui/attentionGlass.js';
import { gyreHud } from '../src/ui/gyreHud.js';
import { masslineHud, releaseVerdictCopy } from '../src/ui/masslineHud.js';
import { createDiscoveryPlate } from '../src/ui/discoveryPlate.js';
import { createComms } from '../src/ui/comms.js';
import { mountOrreryCluster, readClusterModel } from '../src/ui/orrery/hudAdapter.js';
import { previewOrdnanceState } from '../src/ui/orrery/flightPreview.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';

/** A small DOM stub: enough for the presenters' own subtrees and their injected style sheets. */
function makeDom() {
  const make = (tagName = 'div') => {
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
      querySelector() { return make('div'); },
      querySelectorAll() { return []; },
      closest() { return null; },
      getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
      focus() {},
      click() { for (const fn of this.listeners.click || []) fn({ target: this, preventDefault() {}, stopPropagation() {} }); },
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
  };

  const head = make('head');
  const body = make('body');
  const html = make('html');
  const uiRoot = make('div');
  uiRoot.id = 'ui-root';
  const hud = make('div');
  hud.id = 'hud';
  body.appendChild(hud);
  body.appendChild(uiRoot);

  const doc = {
    head,
    body,
    documentElement: html,
    activeElement: body,
    createElement: make,
    createElementNS: (_namespace, tagName) => make(tagName),
    createDocumentFragment: () => make('fragment'),
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
  return doc;
}

function installDom() {
  const previous = globalThis.document;
  const previousRaf = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  const doc = makeDom();
  globalThis.document = doc;
  // The comms feed paints its arrival class on the next frame; the test reads the subtree, not
  // the transition, so a parked stub is enough and keeps the case synchronous.
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  return {
    doc,
    restore() {
      if (previous === undefined) delete globalThis.document; else globalThis.document = previous;
      if (previousRaf === undefined) delete globalThis.requestAnimationFrame;
      else globalThis.requestAnimationFrame = previousRaf;
      if (previousCancel === undefined) delete globalThis.cancelAnimationFrame;
      else globalThis.cancelAnimationFrame = previousCancel;
    },
  };
}

/** Every string a player would see: hidden subtrees (display/visibility/hidden/is-quiet) drop out. */
function visibleText(node, out = []) {
  if (!node) return out;
  if (node.hidden === true) return out;
  const style = node.style || {};
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return out;
  if (node.classList && node.classList.contains('is-quiet')) return out;
  if (typeof node.textContent === 'string' && node.textContent) out.push(node.textContent);
  for (const child of node.children || []) visibleText(child, out);
  return out;
}

function findAll(node, pred, out = []) {
  if (!node) return out;
  if (pred(node)) out.push(node);
  for (const child of node.children || []) findAll(child, pred, out);
  return out;
}

const adventure = (extra = {}) => ({
  mode: 'flight', run: null, ui: {}, simTime: 10, tick: 600, playerId: 1,
  player: { tether: { active: false } },
  entities: { get: () => null },
  ...extra,
});

test('Adventure flight: the Gyre becomes a plain HOLD/LAUNCH instrument, not a telemetry pill', () => {
  const t = installDom();
  const state = adventure({
    gyreSnare: {
      phase: 'holding', clumpMass: 38, strain01: 0.62, absorbs: 3,
      basinCount: 1, towCount: 0, tooHeavyCount: 0, fuseS: 5,
    },
  });
  const hud = Object.create(gyreHud);
  try {
    hud.init({ state });
    hud.update(1 / 60, state);
    const text = visibleText(hud._dom.root).join(' ');
    assert.match(text, /\bHOLD\b/, 'the held verb is named plainly');
    assert.match(text, /FUSE 5s/, 'the fuse countdown survives');
    assert.doesNotMatch(text, /GYRE|STRAIN|×4|38t|DMG|TOWING/);
    assert.equal(hud._dom.pill.style.display, 'flex', 'the Adventure instrument is mounted');
    // The mass and strain bars are telemetry; only the fuse bar is part of the plain read.
    assert.equal(hud._dom.massFill.style.display, 'none');
    assert.equal(hud._dom.fill.style.display, 'none');
    assert.notEqual(hud._dom.fuse.style.display, 'none');
  } finally {
    hud.destroy();
    t.restore();
  }
});

test('Adventure flight: LAUNCH and the ball TTL are the only flight read after a throw', () => {
  const t = installDom();
  const hud = Object.create(gyreHud);
  const state = adventure({
    gyreSnare: {
      phase: 'off', launchedId: 9, liveBalls: 1, ballTtlLeftS: 2.6,
      ballMass: 212, clumpMass: 212, absorbs: 4, strain01: 0.7,
    },
  });
  try {
    hud.init({ state });
    hud.update(1 / 60, state);
    assert.equal(hud._dom.pillText.textContent, 'LAUNCH · BALL 2s');
    state.gyreSnare = { phase: 'launching', ballMass: 212, clumpMass: 212, absorbs: 4, ballTtlLeftS: 2.6 };
    hud.update(2 / 60, state);
    assert.equal(hud._dom.pillText.textContent, 'LAUNCH · BALL 2s');
    assert.doesNotMatch(hud._dom.pillText.textContent, /GYRE|BOWL|×5|212t|DMG/);
  } finally {
    hud.destroy();
    t.restore();
  }
});

test('a live Swarm run keeps the Gyre telemetry pill', () => {
  const t = installDom();
  const hud = Object.create(gyreHud);
  const state = adventure({
    run: { kind: 'survival', phase: 'active', ruleset: 'swarm' },
    gyreSnare: {
      phase: 'holding', clumpMass: 38, strain01: 0.62, absorbs: 3,
      basinCount: 0, towCount: 0, tooHeavyCount: 0,
    },
  });
  try {
    hud.init({ state });
    hud.update(1 / 60, state);
    const text = visibleText(hud._dom.root).join(' ');
    assert.match(text, /GYRE/);
    assert.match(text, /STRAIN/);
    assert.match(text, /38t/);
  } finally {
    hud.destroy();
    t.restore();
  }
});

test('Adventure flight: the Cluster keeps the tether beam but drops the payload words', () => {
  const t = installDom();
  const state = previewOrdnanceState();
  const rock = {
    id: 77, alive: true, type: 'asteroid', pos: { x: 120, z: 60 }, vel: { x: 0, z: 0 },
    radius: 12, mass: 432, data: {},
  };
  state.entities.set(rock.id, rock);
  state.player.tether = { active: true, targetId: rock.id, phase: 'loaded', load: 0.62, strain: 0.45 };
  const player = state.entities.get(state.playerId);
  const root = t.doc.createElement('div');
  const mounted = mountOrreryCluster(root, state, {});
  try {
    mounted.update(state, player, true);
    const payload = findAll(root, (n) => /orr-cluster__payload/.test(n.className || ''))[0];
    assert.ok(payload, 'the payload readout node still exists');
    assert.equal(payload.classList.contains('is-quiet'), true, 'Adventure gates the payload readout');
    assert.equal(payload.children[1].getAttribute('aria-label'), '432 T',
      'the measured tonnage stays in the model/details, not on the glass');
    const text = visibleText(root).join(' ');
    assert.doesNotMatch(text, /on the line|432 T|STRAIN|Body/);
    // The line itself is an instrument: its pulse still draws.
    assert.ok(findAll(root, (n) => /orr-cluster__pulse/.test(n.className || '')).length > 0);

    // A map screen or a dock is not the Adventure flight glass: the same model keeps its words.
    assert.equal(readClusterModel({ ...state, ui: { mapOpen: true } }, player, { ordnance: {} }).quietTelemetry, false);
    assert.equal(readClusterModel({ ...state, ui: { docked: true } }, player, { ordnance: {} }).quietTelemetry, false);
  } finally {
    mounted.dispose();
    t.restore();
  }
});

test('Adventure flight: the release verdict is one plain word, not a telemetry sentence', () => {
  const t = installDom();
  const previousEnabled = MASSLINE2_FLAGS.enabled;
  MASSLINE2_FLAGS.enabled = true;
  const state = adventure({
    player: { tether: { active: false } },
    entities: new Map([[1, {
      id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, vel: { x: 40, z: 0 },
      rot: 0, radius: 8, mass: 200, data: { combat: {}, weapons: [] },
    }]]),
    massline2: {},
    masslineReleaseVerdict: {
      classification: 'clean', technique: 'swing', releasedAtApex: false,
      ride: { keptFraction: 0.84 }, targetId: null, untilSimTime: 20,
    },
  });
  const bus = createBus();
  const hud = Object.assign({}, masslineHud);
  try {
    hud.init({ state, bus, helpers: { worldToScreen: (p) => ({ x: p.x + 300, y: p.z + 200, onScreen: true }) } });
    hud.update(1 / 60, state);
    const preview = findAll(t.doc.getElementById('sf-ml2'), (n) => n.classList && n.classList.contains('ml2-preview'))[0];
    assert.ok(preview);
    assert.equal(preview.textContent, 'CLEAN', 'the grade is the whole Adventure read');
    assert.doesNotMatch(preview.textContent, /KEPT|84|·/);
    // Outside Adventure the authored grade + measured cause still reads in full.
    assert.equal(releaseVerdictCopy({ classification: 'clean', ride: { keptFraction: 0.84 } }), 'CLEAN · KEPT 84%');
  } finally {
    hud.destroy();
    MASSLINE2_FLAGS.enabled = previousEnabled;
    t.restore();
  }
});

test('Adventure flight: the acquisition bracket says a plain verdict, not mass telemetry', () => {
  const t = installDom();
  const previousEnabled = MASSLINE2_FLAGS.enabled;
  MASSLINE2_FLAGS.enabled = true;
  const player = {
    id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    rot: 0, radius: 8, mass: 200, data: { combat: {}, weapons: [] },
  };
  const heavy = {
    id: 77, alive: true, type: 'asteroid', pos: { x: 120, z: 60 }, vel: { x: 0, z: 0 },
    radius: 12, mass: 2000, physicsBody: { mass: 2000 }, data: {},
  };
  const state = adventure({
    player: { tether: { active: false } },
    entities: new Map([[player.id, player], [heavy.id, heavy]]),
    massline2: {},
    masslineAcquisition: { id: 'acq-1', selected: { targetId: heavy.id, status: 'ready' } },
  });
  const bus = createBus();
  const hud = Object.assign({}, masslineHud);
  try {
    hud.init({ state, bus, helpers: { worldToScreen: (p) => ({ x: p.x + 300, y: p.z + 200, onScreen: true }) } });
    hud.update(1 / 60, state);
    const bracket = findAll(t.doc.getElementById('sf-ml2'), (n) => n.classList && n.classList.contains('ml2-preview'))[0];
    assert.ok(bracket);
    assert.equal(bracket.textContent, 'TOO HEAVY', 'the bracket answers the swing question in plain words');
    assert.doesNotMatch(bracket.textContent, /MASS|BUDGE|2000/);
  } finally {
    hud.destroy();
    MASSLINE2_FLAGS.enabled = previousEnabled;
    t.restore();
  }
});

test('Adventure flight: a discovery plate tags its source, so the receipt lane refuses it', () => {
  const t = installDom();
  const state = adventure({
    input: {},
    player: { tether: { active: false } },
    entities: new Map([[1, { vel: { x: 0, z: 0 } }]]),
    world: { sectors: { belt: { name: 'Belt', pois: [{ id: 'vault', name: 'The Vault', type: 'site' }] } } },
  });
  const bus = createBus();
  const shown = [];
  const dispose = setReceiptPresenter((spec) => { shown.push(spec); return true; });
  const plate = createDiscoveryPlate({ bus, state });
  try {
    bus.emit('discovery:plateUnlocked', { sectorId: 'belt', poiId: 'vault' });
    plate.tick();
    assert.equal(shown.length, 1);
    assert.equal(shown[0].source, 'discovery');
    assert.equal(shown[0].channel, 'discovery');
    const flightReceipt = admitReceipt({
      text: shown[0].text, kind: shown[0].kind, channel: shown[0].channel, state,
    });
    assert.equal(flightReceipt.admit, false, 'the Adventure glass refuses the discovery prose');
    const stationState = { ...state, mode: 'station', ui: { docked: true } };
    assert.equal(admitReceipt({
      text: shown[0].text, kind: shown[0].kind, channel: shown[0].channel, state: stationState,
    }).admit, true, 'station keeps its own words');
  } finally {
    plate.destroy();
    dispose();
    t.restore();
  }
});

test('Adventure flight: the left-edge comms feed stays off; station still reads it', () => {
  const t = installDom();
  const bus = createBus();
  const state = adventure({ input: {}, settings: {}, nav: null, onboarding: null });
  const comms = createComms({ bus, state });
  try {
    bus.emit('comms:popup', { sender: 'CONVOY', text: 'Convoy needs escort.', category: 'chatter' });
    const feed = t.doc.getElementById('sf-comms');
    assert.ok(feed);
    assert.equal(feed.children.length, 0, 'no live feed entry in Adventure flight');

    state.mode = 'station';
    state.ui = { docked: true };
    bus.emit('comms:popup', { sender: 'CONVOY', text: 'Convoy needs escort.', category: 'chatter' });
    assert.equal(feed.children.length, 1, 'station keeps the narrative feed');
    assert.match(visibleText(feed).join(' '), /Convoy needs escort/);
  } finally {
    comms.destroy();
    t.restore();
  }
});

test('Adventure unknown sources and map-open flight do not filter or leak the wrong way', () => {
  const st = adventure();
  assert.equal(attentionAdmits(st, { source: 'rumor', text: 'A dockhand heard something.' }), false);
  assert.equal(attentionAdmits(st, { source: 'market', text: 'Ore is up two credits.' }), false);
  assert.equal(admitReceipt({ text: 'A rumor', kind: 'info', channel: 'rumor', state: st }).admit, false);

  const mapFlight = adventure({ ui: { mapOpen: true } });
  assert.equal(isAdventureFlight(mapFlight), false, 'the chart owns the screen');
  assert.equal(attentionAdmits(mapFlight, { source: 'rumor', text: 'A dockhand heard something.' }), true);
  assert.equal(admitReceipt({ text: 'Landmark charted', kind: 'landmark', state: mapFlight }).admit, true);

  const mapStack = adventure({ ui: { screenStack: ['galaxyMap'] } });
  assert.equal(isAdventureFlight(mapStack), false, 'the screen stack is the same map surface');
});
