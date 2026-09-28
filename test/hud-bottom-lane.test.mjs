// Bottom-center lane contract — the three flight tell pills stop colliding.
//
// Player deficit: .sf-planet-pill (authored seat 142px) and .sf-field-pill (146px) are both
// centered in one bottom lane ~26px tall, so "STORM BAND — COMMIT WINDOW · HEAT 47%" rendered
// straight through "WELL READY 12s" (22px of 26px overlap) whenever any field was cooling, and
// the mass-seed pill (118px) grazed the planet pill. The contract in src/ui/hudLayout.js makes
// the lane one-way: the highest-priority voice keeps its authored seat, lower visible voices
// stack one LANE_SLOT_STEP above it, and a cooldown voice stays silent while a load-bearing
// voice occupies the lane.
//
// Proof shape: the pure negotiation is first pinned against the REAL pill metrics (today's
// overlap 22px -> 0 after negotiation), then the three HUDs are driven through their REAL
// update() in registry order under the shared fake document (test/physics-hud-dom-writes.test.mjs
// pattern), asserting the deficit words, the seat arithmetic, and the write-on-change discipline.
import assert from 'node:assert/strict';
import test from 'node:test';

import { fieldHud, FIELD_HUD_CSS } from '../src/ui/fieldHud.js';
import { massSeedHud, MASS_SEED_HUD_CSS } from '../src/ui/massSeedHud.js';
import { planetHud, PLANET_HUD_CSS } from '../src/ui/planetHud.js';
import {
  FIELD_LANE_BASE,
  LANE_GAP,
  LANE_PRIORITY,
  LANE_SLOT_STEP,
  MSEED_LANE_BASE,
  PLANET_LANE_BASE,
  claimBottomLaneSeat,
  negotiateBottomLaneSeat,
  releaseBottomLaneClaim,
  resetBottomLaneClaims,
} from '../src/ui/hudLayout.js';

function shown(pill) {
  return pill.style.display === 'flex'; // the sheets default to display:none; '' means never shown
}

function seat(pill) {
  const v = pill.style.bottom;
  return v === undefined ? '' : v; // the fake style object: unset keys read undefined
}

const PILL_HEIGHT = 26; // the real rendered pill height (planet rect 142-168px per the deficit)

function overlapPx(bottomA, bottomB) {
  return Math.max(0, Math.min(bottomA, bottomB) + PILL_HEIGHT - Math.max(bottomA, bottomB));
}

test('today: the authored seats collide — planet 142 and field 146 overlap by 22 of 26 px', () => {
  const overlap = overlapPx(PLANET_LANE_BASE, FIELD_LANE_BASE);
  assert.equal(overlap, 22, 'the deficit number, from the real metrics');
  assert.equal(overlapPx(PLANET_LANE_BASE, MSEED_LANE_BASE), 2, 'the mass-seed graze');
});

test('contract: a cooldown voice goes silent under a load-bearing voice; overlap 0', () => {
  resetBottomLaneClaims();
  const claims = [
    { id: 'planet', priority: LANE_PRIORITY.active, base: PLANET_LANE_BASE, tie: 0, at: 100 },
    { id: 'field', priority: LANE_PRIORITY.cooldown, base: FIELD_LANE_BASE, tie: 1, at: 100 },
  ];
  assert.deepEqual(negotiateBottomLaneSeat(claims, 'field', 100), { visible: false },
    'WELL READY 12s must not garble the planet readout');
  assert.deepEqual(negotiateBottomLaneSeat(claims, 'planet', 100),
    { visible: true, bottom: PLANET_LANE_BASE }, 'the band readout keeps its authored seat');
});

test('contract: co-visible load-bearing voices stack one slot up, clear glass between', () => {
  resetBottomLaneClaims();
  const claims = [
    { id: 'planet', priority: LANE_PRIORITY.active, base: PLANET_LANE_BASE, tie: 0, at: 100 },
    { id: 'field', priority: LANE_PRIORITY.active, base: FIELD_LANE_BASE, tie: 1, at: 100 },
  ];
  const planet = negotiateBottomLaneSeat(claims, 'planet', 100).bottom;
  const field = negotiateBottomLaneSeat(claims, 'field', 100).bottom;
  assert.equal(planet, PLANET_LANE_BASE);
  assert.equal(field, PLANET_LANE_BASE + LANE_SLOT_STEP);
  assert.equal(field - (planet + PILL_HEIGHT), LANE_GAP, 'stacked pills never touch');
  assert.equal(overlapPx(planet, field), 0);
});

test('contract: denial leads, every co-visible line readable, a fourth voice joins collision-free', () => {
  resetBottomLaneClaims();
  const claims = [
    { id: 'planet', priority: LANE_PRIORITY.active, base: PLANET_LANE_BASE, tie: 0, at: 100 },
    { id: 'field', priority: LANE_PRIORITY.denial, base: FIELD_LANE_BASE, tie: 1, at: 100 },
    { id: 'mseed', priority: LANE_PRIORITY.active, base: MSEED_LANE_BASE, tie: 2, at: 100 },
  ];
  const seats = ['planet', 'field', 'mseed'].map((id) => negotiateBottomLaneSeat(claims, id, 100).bottom);
  assert.deepEqual(seats, [FIELD_LANE_BASE + LANE_SLOT_STEP, FIELD_LANE_BASE, FIELD_LANE_BASE + 2 * LANE_SLOT_STEP],
    'denial keeps the authored seat; planet and seed stack above it');
  for (let a = 0; a < seats.length; a += 1) {
    for (let b = a + 1; b < seats.length; b += 1) assert.equal(overlapPx(seats[a], seats[b]), 0);
  }
  const fourth = negotiateBottomLaneSeat([...claims,
    { id: 'probe', priority: LANE_PRIORITY.active, base: 150, tie: 9, at: 100 }], 'probe', 100).bottom;
  assert.equal(fourth, FIELD_LANE_BASE + 3 * LANE_SLOT_STEP, 'the fourth voice takes the next slot');
  assert.equal(overlapPx(fourth, Math.min(...seats)), 0, 'no re-collision');
});

test('contract: two cooldown voices alone share the lane stacked, none hidden', () => {
  resetBottomLaneClaims();
  const claims = [
    { id: 'field', priority: LANE_PRIORITY.cooldown, base: FIELD_LANE_BASE, tie: 1, at: 100 },
    { id: 'mseed', priority: LANE_PRIORITY.cooldown, base: MSEED_LANE_BASE, tie: 2, at: 100 },
  ];
  const field = negotiateBottomLaneSeat(claims, 'field', 100).bottom;
  const mseed = negotiateBottomLaneSeat(claims, 'mseed', 100).bottom;
  assert.equal(overlapPx(field, mseed), 0);
  assert.equal(mseed, field + LANE_SLOT_STEP);
});

// ── Mounted: the three HUDs driven through their REAL update() in registry order ────────────

const NOW = 100;

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

function mount(proto, state) {
  const hud = Object.create(proto);
  hud.init({ state, helpers: {} });
  hud.update(1 / 60, state);
  return hud;
}

test('the deficit frame: STORM BAND commit + WELL READY 12s + live anchor, in one lane', () => {
  resetBottomLaneClaims();
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const document = fakeDocument();
  globalThis.document = document;
  globalThis.window = { innerWidth: 1440, innerHeight: 900 };
  try {
    const state = flightState({
      planet: { active: true, player: { region: 'danger', stage: 'commit', heat: 0.47, collectorOn: false } },
      fields: { active: [], cooldowns: { well: NOW + 12 }, lastDenial: null },
      massSeed: { phase: 'active', expireAt: NOW + 24, lockAt: NOW - 1 },
      player: { massSeed: { cooldownUntil: 0 } },
    });

    // Registry order: massSeedHud -> fieldHud -> planetHud (src/core/registry.js). The lane is
    // one-way claim-then-query, so a simultaneous first appearance settles on the next frame.
    const mseed = mount(massSeedHud, state);
    const field = mount(fieldHud, state);
    const planet = mount(planetHud, state);
    mseed.update(1 / 60, state);
    field.update(1 / 60, state);
    planet.update(1 / 60, state);

    assert.equal(shown(planet._dom.pill), true);
    assert.equal(planet._dom.pillText.textContent, 'STORM BAND — COMMIT WINDOW · HEAT 47%',
      'the planet readout is whole, not overprinted');
    assert.equal(seat(planet._dom.pill), '', 'planet keeps its authored 142px seat');
    assert.equal(shown(field._dom.pill), false,
      'the cooldown voice stays silent while the band readout occupies the lane');
    assert.equal(shown(mseed._dom.pill), true);
    assert.equal(seat(mseed._dom.pill), `${PLANET_LANE_BASE + LANE_SLOT_STEP}px`,
      'the live anchor yields its seat upward instead of grazing');

    const planetBottom = PLANET_LANE_BASE;
    const mseedBottom = parseInt(seat(mseed._dom.pill), 10);
    assert.equal(overlapPx(planetBottom, mseedBottom), 0, 'measured overlap after negotiation');

    // Settled lane: a stable frame rewrites nothing (write-on-change seat discipline).
    mseed.update(1 / 60, state);
    field.update(1 / 60, state);
    planet.update(1 / 60, state);
    const writes = trackStyleWrites([mseed._dom.pill, field._dom.pill, planet._dom.pill]);
    mseed.update(1 / 60, state);
    field.update(1 / 60, state);
    planet.update(1 / 60, state);
    assert.equal(writes.count(), 0, 'a settled lane costs zero DOM writes per frame');

    // Denial keeps its voice at the authored seat; the planet readout steps up, still whole.
    state.fields.lastDenial = { kind: 'well', at: NOW, reason: 'blocked' };
    mseed.update(1 / 60, state);
    field.update(1 / 60, state);
    planet.update(1 / 60, state);
    mseed.update(1 / 60, state);
    field.update(1 / 60, state);
    planet.update(1 / 60, state);
    assert.equal(field._dom.pill.style.display, 'flex');
    assert.equal(field._dom.pillText.textContent, 'WELL DENIED', 'the denial reason is never lost');
    assert.equal(seat(field._dom.pill), '', 'denial holds the authored 146px seat');
    assert.equal(seat(planet._dom.pill), `${FIELD_LANE_BASE + LANE_SLOT_STEP}px`);
    assert.equal(seat(mseed._dom.pill), `${FIELD_LANE_BASE + 2 * LANE_SLOT_STEP}px`);
    assert.equal(overlapPx(
      parseInt(seat(planet._dom.pill), 10),
      parseInt(seat(mseed._dom.pill), 10),
    ), 0);

    // The lane frees: the anchor retires, the band cools, the denial beat expires — the
    // cooldown voice returns to its authored seat, the seed to its tuned 118px.
    state.massSeed = { phase: 'idle' };
    state.planet.player = { region: null, stage: null, heat: 0, collectorOn: false };
    state.fields.lastDenial = { kind: 'well', at: NOW - 5, reason: 'blocked' };
    mseed.update(1 / 60, state);
    field.update(1 / 60, state);
    planet.update(1 / 60, state);
    mseed.update(1 / 60, state);
    field.update(1 / 60, state);
    planet.update(1 / 60, state);
    assert.equal(shown(planet._dom.pill), false, 'a cold hull hides the band pill');
    assert.equal(shown(mseed._dom.pill), false, 'a retired seed hides its pill');
    assert.equal(field._dom.pill.style.display, 'flex');
    assert.equal(field._dom.pillText.textContent, 'WELL READY 12s',
      'the cooldown readout shows the moment the lane is free');
    assert.equal(seat(field._dom.pill), '', 'cooldown alone keeps its authored 146px seat');
    assert.equal(seat(mseed._dom.pill), '', 'the seed settles back to its tuned 118px seat');

    for (const hud of [mseed, field, planet]) hud.destroy();
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window;
  }
});

test('solo output is unchanged: authored seat literals, forced-colors block, no inline override', () => {
  assert.match(FIELD_HUD_CSS, /bottom: 146px;/, 'field sheet keeps its authored seat literal');
  assert.match(PLANET_HUD_CSS, /bottom: 142px;/, 'planet sheet keeps its authored seat literal');
  assert.match(MASS_SEED_HUD_CSS, /bottom: 118px;/, 'mass-seed sheet keeps its authored seat literal');
  for (const css of [FIELD_HUD_CSS, PLANET_HUD_CSS, MASS_SEED_HUD_CSS]) {
    assert.match(css, /@media \(forced-colors: active\)/, 'forced-colors handling untouched');
  }

  resetBottomLaneClaims();
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const document = fakeDocument();
  globalThis.document = document;
  globalThis.window = { innerWidth: 1440, innerHeight: 900 };
  try {
    const solos = [
      { proto: fieldHud, state: flightState({ fields: { active: [{ kind: 'well', engaged: true, expireAt: NOW + 8 }], cooldowns: {}, lastDenial: null } }) },
      { proto: planetHud, state: flightState({ planet: { active: true, player: { region: 'skim', stage: null, heat: 0.2, collectorOn: false } } }) },
      { proto: massSeedHud, state: flightState({ massSeed: { phase: 'active', expireAt: NOW + 24, lockAt: NOW - 1 } }) },
    ];
    for (const { proto, state } of solos) {
      const hud = mount(proto, state);
      assert.equal(shown(hud._dom.pill), true);
      assert.equal(seat(hud._dom.pill), '', 'a solo pill paints from the sheet, not an override');
      hud.destroy();
    }
    resetBottomLaneClaims();
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window;
  }
});

test('lane bookkeeping: release clears the claim, stale claims expire by sim time', () => {
  resetBottomLaneClaims();
  claimBottomLaneSeat('planet', LANE_PRIORITY.active, PLANET_LANE_BASE, 100);
  releaseBottomLaneClaim('planet');
  const soloField = claimBottomLaneSeat('field', LANE_PRIORITY.cooldown, FIELD_LANE_BASE, 100);
  assert.deepEqual(soloField, { visible: true, bottom: FIELD_LANE_BASE },
    'a released claim no longer silences a cooldown voice');
  // The claim refreshes every frame in flight; one stale past the TTL no longer holds the lane.
  claimBottomLaneSeat('planet', LANE_PRIORITY.active, PLANET_LANE_BASE, 100);
  const later = claimBottomLaneSeat('field', LANE_PRIORITY.cooldown, FIELD_LANE_BASE, 100 + 2.5);
  assert.deepEqual(later, { visible: true, bottom: FIELD_LANE_BASE },
    'a claim past the TTL (sim seconds, pause-safe) expires');
  resetBottomLaneClaims();
});

function trackStyleWrites(nodes) {
  let calls = 0;
  for (const node of nodes) {
    node.style = new Proxy(node.style, {
      set(target, name, value) {
        calls += 1;
        target[name] = value;
        return true;
      },
    });
  }
  return { count: () => calls };
}

// The fake document from test/physics-hud-dom-writes.test.mjs: enough DOM for the guarded
// _ensureDom path — id lookup, appendChild, classList, setAttribute — and nothing more.
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
    getElementById,
  };
}
