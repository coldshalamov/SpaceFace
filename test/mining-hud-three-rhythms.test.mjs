// INF lane — the mining beam's three skill rhythms are readable at the gameplay camera.
//
// Player deficit: holding the mining beam on a rock runs three skill checks and showed none of
// them — the HUD heat row reads the GUNS while the beam's own vent band (release inside it for
// up to +75% ore) stayed invisible; the cracked rock's rich-core window (3.5 s, release at
// mid-charge for +3-8) had zero visual; off-seam beam time pays 35% and nothing said where the
// seam is. src/ui/miningHud.js mirrors the seams mining.js ALREADY emits onto one world-anchored
// instrument at the beam contact. No sim change; this test drives the REAL module through the
// REAL event bus under the shared fake document (test/physics-hud-dom-writes.test.mjs pattern,
// extended with createElementNS for the SVG dial).
//
// The numbers, so the test pins the rhythm and not just the wiring:
//   vent band   — heat climbs at 22/s toward a 100-point gauge; the band opens at 62%, i.e.
//                 0.62 * 100 / 22 ≈ 2.82 s of beam-on time. Releasing inside pays up to +75%.
//   rich core   — window open 3.5 s; sweet spot centered at mid-charge (1.75 s in), tier
//                 half-width 6%..11% of progress = ±0.21 s..±0.385 s around the middle.
//   seam        — off-seam beam time pays 35% of the ore (SEAM_YIELD_OFF); the word flips per
//                 mining:tick while the beam tracks the rock.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import {
  HEAT_VISIBLE_MIN_PCT,
  MINING_HUD_CSS,
  RICH_CORE_DURATION_S,
  RICH_CORE_SWEET_CENTER,
  SEAM_WORD_OFF,
  SEAM_WORD_ON,
  SEAM_YIELD_OFF,
  VENT_BAND_LO,
  VENT_TIME_TO_BAND_S,
  miningHud,
  resolveHeatArc,
  resolveRichCoreCue,
  richCoreWindow,
  seamWordFor,
} from '../src/ui/miningHud.js';

const NOW = 100;

// ── the published numbers ──────────────────────────────────────────────────────────────────────

test('the rhythms are the sim\u2019s published numbers: 62% band at ~2.82 s, 3.5 s core, \u00b16% window', () => {
  assert.equal(VENT_BAND_LO, 0.62);
  assert.ok(Math.abs(VENT_TIME_TO_BAND_S - 2.82) < 0.01,
    `0.62 * 100 heat / 22 per s = ${VENT_TIME_TO_BAND_S.toFixed(2)} s to the band`);
  assert.equal(RICH_CORE_DURATION_S, 3.5);
  assert.equal(RICH_CORE_SWEET_CENTER, 0.5, 'the sweet spot is mid-charge — 1.75 s in');
  assert.equal(HEAT_VISIBLE_MIN_PCT, 0.05, 'a cold tool renders nothing');
  assert.equal(SEAM_YIELD_OFF, 0.35, 'off-seam pays 35% — the reason the word exists');
  // Tier window 0.12 (tightest, hi tier) → ±6% of progress = ±0.21 s around 1.75 s.
  const tight = richCoreWindow(0.12);
  assert.deepEqual(tight, { lo: 0.44, hi: 0.56 });
  assert.ok(Math.abs((tight.hi - tight.lo) * RICH_CORE_DURATION_S / 2 - 0.21) < 1e-9);
  // Loosest tier 0.22 → ±11% = ±0.385 s.
  const loose = richCoreWindow(0.22);
  assert.deepEqual(loose, { lo: 0.39, hi: 0.61 });
  assert.ok(Math.abs((loose.hi - loose.lo) * RICH_CORE_DURATION_S / 2 - 0.385) < 1e-9);
});

// ── pure state functions ───────────────────────────────────────────────────────────────────────

test('heat arc: renders in the vent band, hides below 5%', () => {
  const vent = resolveHeatArc({ pct: 0.7, band: 'vent' });
  assert.equal(vent.visible, true);
  assert.equal(vent.ventBand, true, 'the release cue lights inside the band');
  assert.equal(resolveHeatArc({ pct: 0.7, band: 'warm' }).ventBand, true,
    'the band edge is the percentage, not the label');
  assert.equal(resolveHeatArc({ pct: 0.5, band: 'warm' }).ventBand, false);
  const cold = resolveHeatArc({ pct: 0.03, band: 'cold' });
  assert.equal(cold.visible, false, 'under 5% the arc shows nothing');
  assert.equal(resolveHeatArc({ pct: 0.6199, band: 'warm' }).ventBand, false,
    'just under the band edge stays off-cue');
});

test('rich core: open \u2192 charging on sim time \u2192 resolved latch \u2192 gone', () => {
  const window = richCoreWindow(0.12);
  const core = {
    window, durationS: 3.5, openedAt: NOW, expiresAt: NOW + 3.5,
    charging: false, chargeStartedAt: null, resolved: null, resolvedAt: 0, finalProgress: 0,
  };
  let cue = resolveRichCoreCue(core, NOW + 0.5);
  assert.deepEqual(cue, { visible: true, state: 'open', progress: 0, window },
    'window open, beam not yet charging');
  core.charging = true;
  core.chargeStartedAt = NOW + 0.5;
  cue = resolveRichCoreCue(core, NOW + 0.5 + 0.875); // quarter second-beat: 0.25 progress
  assert.equal(cue.state, 'charging');
  assert.ok(Math.abs(cue.progress - 0.25) < 1e-9);
  cue = resolveRichCoreCue(core, NOW + 0.5 + 1.75); // mid-charge at 2.25 s after exposure
  assert.ok(Math.abs(cue.progress - 0.5) < 1e-9, 'the middle of the charge IS the sweet spot');
  assert.ok(cue.progress >= window.lo && cue.progress <= window.hi);
  core.resolved = 'fizzle';
  core.resolvedAt = NOW + 3;
  core.finalProgress = 0.1;
  assert.equal(resolveRichCoreCue(core, NOW + 3.5).state, 'fizzle', 'the miss stays readable a beat');
  assert.equal(resolveRichCoreCue(core, NOW + 3 + 1.21).visible, false, 'then the ring retires');
  const stale = { ...core, resolved: null, expiresAt: NOW - 10 };
  assert.equal(resolveRichCoreCue(stale, NOW).visible, false,
    'an unresolvable core self-heals off the instrument (the sim owns the real fizzle)');
});

test('seam word flips with the tick, shape-first', () => {
  assert.equal(seamWordFor(true), SEAM_WORD_ON);
  assert.equal(seamWordFor(false), SEAM_WORD_OFF);
  assert.equal(SEAM_WORD_ON, 'ON SEAM');
  assert.equal(SEAM_WORD_OFF, 'OFF SEAM');
});

// ── mounted: the real module driven through the real bus under the fake document ───────────────

function fakeDocument() {
  const roots = [];
  const makeNode = (tagName) => {
    const node = {
      tagName,
      id: '',
      className: '',
      children: [],
      parentNode: null,
      isConnected: true,
      textContent: '',
      attributes: {},
      style: { display: '' },
      appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
      },
      removeChild(child) {
        this.children = this.children.filter((entry) => entry !== child);
        child.parentNode = null;
      },
      setAttribute(name, value) {
        this.attributes[name] = String(value);
        if (name === 'class') this.className = String(value);
        if (name === 'id') this.id = String(value);
      },
    };
    node.classList = {
      contains(name) { return node.className.split(/\s+/).includes(name); },
      add(name) { if (!this.contains(name)) node.className = `${node.className} ${name}`.trim(); },
      remove(name) {
        node.className = node.className.split(/\s+/)
          .filter((entry) => entry && entry !== name).join(' ');
      },
      toggle(name, force) {
        const enabled = force === undefined ? !this.contains(name) : !!force;
        if (enabled) this.add(name); else this.remove(name);
        return enabled;
      },
    };
    return node;
  };
  const body = makeNode('body');
  const head = makeNode('head');
  const hud = makeNode('div');
  hud.id = 'hud';
  body.appendChild(hud);
  roots.push(head, body);
  const getElementById = (id) => {
    const visit = (node) => {
      if (node.id === id) return node;
      for (const child of node.children) {
        const found = visit(child);
        if (found) return found;
      }
      return null;
    };
    for (const root of roots) {
      const found = visit(root);
      if (found) return found;
    }
    return null;
  };
  return {
    body,
    head,
    documentElement: { clientWidth: 1440, clientHeight: 900 },
    createElement: makeNode,
    // the mining dial is SVG geometry (ORRERY: lines of light, never boxes)
    createElementNS: (ns, tag) => makeNode(`svg:${tag}`),
    getElementById,
  };
}

function flightState(extra = {}) {
  return {
    mode: 'flight',
    ui: { docked: false },
    simTime: NOW,
    settings: { video: { motionReduce: false }, accessibility: {} },
    playerId: 'player',
    entities: new Map(),
    ...extra,
  };
}

function mountInstrument(state) {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = fakeDocument();
  globalThis.window = { innerWidth: 1440, innerHeight: 900 };
  const bus = createBus();
  const hud = Object.create(miningHud);
  hud.init({
    state,
    bus,
    helpers: {
      worldToScreen: (v) => ({ x: 700 + (v.x || 0) * 2, y: 300, onScreen: true }),
    },
  });
  hud.update(1 / 60, state);
  return {
    bus,
    hud,
    state,
    mark: hud._dom.mark,
    dom: hud._dom,
    cleanup() {
      hud.destroy();
      if (previousDocument === undefined) delete globalThis.document;
      else globalThis.document = previousDocument;
      if (previousWindow === undefined) delete globalThis.window;
    },
  };
}

const dashOf = (node) => node.attributes['stroke-dasharray'];
const classesOf = (node) => node.className.split(/\s+/).filter(Boolean);

test('the three rhythms render at the beam contact, from the seams mining already emits', () => {
  const rock = { id: 'ast_1', alive: true, pos: { x: 120, z: 0 } };
  const state = flightState();
  state.entities.set('ast_1', rock);
  const t = mountInstrument(state);
  try {
    // Beam engages: nothing renders yet (cold tool, no tick — contextual instrument).
    t.bus.emit('mining:start', { minerId: 'player', targetId: 'ast_1', verb: 'mine', position: { x: 120, z: 0 } });
    t.state.simTime = NOW + 0.1;
    t.hud.update(1 / 60, t.state);
    assert.equal(t.mark.style.display, 'none', 'a cold beam with no signal shows nothing');

    // (i) heat: past 5% the arc renders; past 62% the vent band lights.
    t.bus.emit('mining:heatChanged', { minerId: 'player', heat: 70, heatMax: 100, pct: 0.7, band: 'vent' });
    t.hud.update(1 / 60, t.state);
    assert.equal(t.mark.style.display, 'block');
    assert.equal(dashOf(t.dom.heat), '70.0 100', 'the arc IS the percentage (pathLength 100)');
    assert.ok(classesOf(t.mark).includes('mining-vent'), 'the band is lit — release cue');
    assert.ok(dashOf(t.dom.heatBloom), 'bloom stroke rides the fill (geometry, not a filter)');

    // The band edge comes from the event, and 2.82 s of beam-on time is exactly how it was crossed.
    assert.ok(Math.abs(0.62 - VENT_BAND_LO) < 1e-9);

    // (iii) seam word flips on mining:tick.seamHit at the contact point.
    t.bus.emit('mining:tick', { contactPos: { x: 118, z: 2 }, oreType: 'cmdty_silicate', seamHit: true, yieldMult: 1, sourceEntityId: 'player' });
    t.hud.update(1 / 60, t.state);
    assert.equal(t.dom.word.textContent, 'ON SEAM');
    assert.ok(classesOf(t.mark).includes('mining-seam-on'));
    t.bus.emit('mining:tick', { contactPos: { x: 118, z: 2 }, oreType: 'cmdty_silicate', seamHit: false, yieldMult: SEAM_YIELD_OFF, sourceEntityId: 'player' });
    t.hud.update(1 / 60, t.state);
    assert.equal(t.dom.word.textContent, 'OFF SEAM');
    assert.ok(classesOf(t.mark).includes('mining-seam-off'));

    // Drone heat never renders — the instrument reads the PLAYER's beam.
    t.bus.emit('mining:heatChanged', { minerId: 'drone_7', heat: 99, heatMax: 100, pct: 0.99, band: 'vent' });
    t.hud.update(1 / 60, t.state);
    assert.equal(dashOf(t.dom.heat), '70.0 100', 'a drone beam never overwrites the player\u2019s arc');

    // (ii) rich core: the rock cracks, the window opens, the charge ring marks the sweet spot.
    t.state.simTime = NOW + 4;
    t.bus.emit('mining:richCoreExposed', {
      asteroidId: 'ast_1', commodityId: 'cmdty_core', multiplier: 5,
      windowPct: 0.12, durationS: 3.5, minerId: 'player',
    });
    t.state.simTime = NOW + 4.5; // charge starts 0.5 s into the 3.5 s window
    t.bus.emit('mining:richCoreChargeStart', { asteroidId: 'ast_1' });
    t.state.simTime = NOW + 4.5 + 0.875; // quarter charged
    t.hud.update(1 / 60, t.state);
    assert.ok(classesOf(t.mark).includes('mining-core'), 'the core ring is on the dial');
    assert.ok(classesOf(t.mark).includes('mining-core-charging'));
    const windowD = t.dom.coreWindow.attributes.d;
    assert.ok(typeof windowD === 'string' && windowD.length > 0, 'the sweet spot window is marked');
    assert.ok(Math.abs(parseFloat(dashOf(t.dom.coreFill)) - 25) < 0.1,
      'the charge fill is the sim-time progress (0.875 s of 3.5 s)');

    // Release outside the window: the sim emits mining:stop FIRST and resolves the core in the
    // same tick (release edge), so the miss must still read for its beat — then the whole
    // instrument retires: the depth bar, no beam, no instrument.
    t.state.simTime = NOW + 5.5;
    t.bus.emit('mining:stop', { minerId: 'player', targetId: 'ast_1', position: null });
    t.bus.emit('mining:richCoreFizzle', { asteroidId: 'ast_1', commodityId: 'cmdty_core' });
    t.hud.update(1 / 60, t.state);
    assert.ok(classesOf(t.mark).includes('mining-core-fizzle'),
      'the miss survives the stop edge that precedes it');
    assert.equal(dashOf(t.dom.heat), '0 100', 'the heat arc retires with the beam');
    t.state.simTime = NOW + 5.5 + 1.25; // past the 1.2 s resolution latch
    t.hud.update(1 / 60, t.state);
    assert.equal(t.mark.style.display, 'none', 'the beat ends — instrument gone, beam still off');

    // A fresh engagement re-arms everything from nothing (no stale vent word, no ghost ring).
    t.state.simTime = NOW + 10;
    t.bus.emit('mining:start', { minerId: 'player', targetId: 'ast_2', verb: 'mine', position: { x: 40, z: 0 } });
    t.bus.emit('mining:heatChanged', { minerId: 'player', heat: 30, heatMax: 100, pct: 0.3, band: 'warm' });
    t.hud.update(1 / 60, t.state);
    assert.equal(t.mark.style.display, 'block');
    assert.equal(dashOf(t.dom.heat), '30.0 100');
    assert.ok(!classesOf(t.mark).includes('mining-vent'), 'warm beam, band unlit');
    assert.ok(!classesOf(t.mark).includes('mining-core'), 'no ghost core ring');
    assert.ok(!classesOf(t.mark).includes('mining-seam-on') && !classesOf(t.mark).includes('mining-seam-off'),
      'no stale seam word');
  } finally {
    t.cleanup();
  }
});

test('hidden below 5%, docked/mode gates, settled frames write nothing', () => {
  const state = flightState();
  const t = mountInstrument(state);
  try {
    t.bus.emit('mining:start', { minerId: 'player', targetId: 'ast_1', verb: 'mine', position: { x: 10, z: 0 } });
    t.bus.emit('mining:heatChanged', { minerId: 'player', heat: 3, heatMax: 100, pct: 0.03, band: 'cold' });
    t.state.simTime = NOW + 0.1;
    t.hud.update(1 / 60, t.state);
    assert.equal(t.mark.style.display, 'none', 'heat under 5% — the arc is a contextual instrument');

    t.bus.emit('mining:heatChanged', { minerId: 'player', heat: 10, heatMax: 100, pct: 0.1, band: 'warm' });
    t.hud.update(1 / 60, t.state);
    assert.equal(t.mark.style.display, 'block');
    assert.ok(!classesOf(t.mark).includes('mining-vent'));

    // The dial rides the contact via helpers.worldToScreen (massSeedHud pattern).
    t.bus.emit('mining:tick', { contactPos: { x: 50, z: 12 }, oreType: 'ore', seamHit: true, yieldMult: 1, sourceEntityId: 'player' });
    t.hud.update(1 / 60, t.state);
    assert.equal(t.mark.style.transform, 'translate3d(800px, 300px, 0)', 'anchored at the beam contact');

    // Docking freezes the world: the instrument hides.
    t.state.ui.docked = true;
    t.hud.update(1 / 60, t.state);
    assert.equal(t.mark.style.display, 'none');
    t.state.ui.docked = false;
    t.hud.update(1 / 60, t.state);
    assert.equal(t.mark.style.display, 'block');

    // A settled frame is free: write-on-change discipline (flight HUD budget).
    t.mark.style = new Proxy(t.mark.style, {
      set(target, name, value) {
        target[name] = value;
        writes += 1;
        return true;
      },
    });
    let writes = 0;
    t.state.simTime = NOW + 0.2;
    t.bus.emit('mining:tick', { contactPos: { x: 50, z: 12 }, oreType: 'ore', seamHit: true, yieldMult: 1, sourceEntityId: 'player' });
    t.hud.update(1 / 60, t.state);
    assert.equal(writes, 0, 'same contact, same word, same heat: zero DOM writes');
  } finally {
    t.cleanup();
  }
});

test('the sheet is self-injected, token-painted, reduced-motion gated', () => {
  assert.match(MINING_HUD_CSS, /@media \(forced-colors: active\)/, 'forced-colors handled');
  assert.match(MINING_HUD_CSS, /mining-reduced-motion/, 'reduced motion is a hard gate');
  assert.match(MINING_HUD_CSS, /--dp-lamp/, 'the amber accent is the deckplate lamp token');
  assert.match(MINING_HUD_CSS, /--dp-danger/, 'fizzle reads through the danger token');
  assert.match(MINING_HUD_CSS, /--dp-line-faint/, 'rest light is warm bone, never blue');
  assert.doesNotMatch(MINING_HUD_CSS, /backdrop-filter/, 'no glass over live flight');
  assert.doesNotMatch(MINING_HUD_CSS, /filter:/, 'bloom is geometry, not a live filter');
});
