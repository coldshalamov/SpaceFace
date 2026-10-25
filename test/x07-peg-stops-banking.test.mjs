// X-07 (row 565): a pegged gauge stops BANKING — extraction stays full-rate, banked ore is never
// forfeited or decayed, and a clean release names itself CLEAN CUT. The owner ruling binds:
// no lockout, no slow radiators, no forfeit.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { mulberry32 } from '../src/core/rng.js';
import { SIM_DT } from '../src/core/sim.js';
import { ASTEROIDS, BEAMS } from '../src/data/mining.js';
import { BEAM_VENT_BAND_LO, mining as miningBase } from '../src/systems/mining.js';
import { miningHud } from '../src/ui/miningHud.js';
import { onboarding } from '../src/systems/onboarding.js';
import { hash32 } from '../src/core/rng.js';

const SEED = 4242;
const MK1 = BEAMS.find((b) => b.id === 'beam_mk1');

function bootBeam() {
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 6,
    flags: { docked: false },
    data: { miningBeam: { tierId: 'beam_mk1', directToCargo: false } },
  };
  const asteroid = {
    id: 2, type: 'asteroid', alive: true,
    pos: { x: 60, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8, mass: 400,
    hull: 140, hullMax: 140,
    data: { typeId: 'ast_common_rock', oreHP: 900, oreHPMax: 900, commodityId: 'cmdty_silicate' },
  };
  const state = {
    mode: 'flight', playerId: player.id, simTime: 0, tick: 0,
    meta: { seed: SEED }, rng: mulberry32(SEED),
    player: { cargo: { items: {}, capVolume: 500, capMass: 1000, usedVolume: 0, usedMass: 0 }, hints: {} },
    input: { aimAngle: 0, fireGroup: 0, actions: {} },
    entities: new Map([[player.id, player], [asteroid.id, asteroid]]),
    entityList: [player, asteroid],
    world: { currentSectorId: 'sector_test' },
    onboarding: { active: false, finished: true },
    settings: { gameplay: {} },
  };
  const bus = createBus();
  const ventBonus = [];
  const hints = [];
  bus.on('mining:ventBonus', (p) => ventBonus.push(p));
  bus.on('hud:firstUse', (p) => hints.push(p));
  let nextId = 10;
  const helpers = {
    hash32, mulberry32, voice: { say: () => true },
    spawnEntity(spec) {
      const e = { id: nextId++, alive: true, ...spec, data: spec.data || {} };
      state.entities.set(e.id, e); state.entityList.push(e); return e;
    },
  };
  const mining = { ...miningBase };
  mining.init({ state, bus, helpers, registry: { get: () => null } });
  onboarding.init({ state, bus, helpers, registry: { get: () => null } });
  return { state, bus, mining, player, asteroid, ventBonus, hints };
}

function step({ state, mining }, n = 1, fire = true) {
  for (let i = 0; i < n; i++) {
    state.input.fireGroup = fire ? 2 : 0;
    mining.update(SIM_DT, state);
    state.simTime += SIM_DT;
    state.tick += 1;
  }
}

function release({ state, mining }) {
  step({ state, mining }, 1, false);
}

test('X-07 the peg stops accrual but never shrinks the bank', () => {
  const h = bootBeam();
  const beam = h.player.data.miningBeam;
  step(h, 600);
  assert.ok(beam.heat >= beam.heatMax, 'beam pegs');
  const bankedAtPeg = h.mining._pulseOre;
  release(h);
  const bonusAtPeg = h.ventBonus.at(-1).qty;

  const h2 = bootBeam();
  const beam2 = h2.player.data.miningBeam;
  step(h2, 600);
  assert.ok(beam2.heat >= beam2.heatMax);
  step(h2, Math.round(10 / SIM_DT)); // hold 10 s pegged
  release(h2);
  const bonusAfterHold = h2.ventBonus.at(-1).qty;
  assert.ok(Math.abs(bonusAfterHold - bonusAtPeg) <= 1,
    `held peg pays the same bank (${bonusAfterHold} vs ${bonusAtPeg})`);
  assert.ok(h2.mining._pulseOre === 0 && h2.ventBonus.at(-1).pulseOreU <= bankedAtPeg + 0.5,
    'the bank never grew past what it held at the peg');
});

test('X-07 pegged extraction keeps full rate', () => {
  const h = bootBeam();
  const ast = h.asteroid;
  step(h, 60);
  const hpA = ast.data.oreHP;
  step(h, 10);
  const hpB = ast.data.oreHP;
  const prePegDelta = (hpA - hpB) / 10;
  step(h, 600);
  assert.ok(h.player.data.miningBeam.heat >= h.player.data.miningBeam.heatMax);
  const hpC = ast.data.oreHP;
  step(h, 10);
  const peggedDelta = (hpC - ast.data.oreHP) / 10;
  assert.ok(peggedDelta > 0, 'pegged beam still extracts');
  assert.ok(Math.abs(peggedDelta - prePegDelta) / prePegDelta < 0.05,
    `pegged rate (${peggedDelta}/t) equals pre-peg rate (${prePegDelta}/t)`);
});

test('X-07 clean is 0.85 depth with zero pegged seconds', () => {
  // Clean: release just past band top, never pegged.
  const h = bootBeam();
  const beam = h.player.data.miningBeam;
  for (let i = 0; i < 600 && !(beam.heat >= beam.heatMax * 0.95); i++) step(h, 1);
  assert.ok(beam.heat >= beam.heatMax * 0.95, 'the hold reaches 95% heat');
  release(h);
  const vb = h.ventBonus.at(-1);
  assert.equal(vb.clean, true, 'a top-of-band unpegged release is clean');
  assert.ok(vb.depth >= 0.85);
  assert.equal(vb.peggedS, 0);

  // Pegged one tick: not clean, peggedS recorded.
  const h2 = bootBeam();
  step(h2, 600);
  assert.ok(h2.player.data.miningBeam.heat >= h2.player.data.miningBeam.heatMax);
  step(h2, 1);
  release(h2);
  const vb2 = h2.ventBonus.at(-1);
  assert.equal(vb2.clean, false);
  assert.ok(vb2.peggedS > 0);

  // Shallow release: not clean.
  const h3 = bootBeam();
  const beam3 = h3.player.data.miningBeam;
  const target3 = beam3.heatMax * (BEAM_VENT_BAND_LO + 0.05);
  for (let i = 0; i < 600 && !(beam3.heat >= target3); i++) step(h3, 1);
  release(h3);
  const vb3 = h3.ventBonus.at(-1);
  assert.ok(vb3, 'a band release still pays');
  assert.equal(vb3.clean, false);
});

// X-07 review 3: the player outcome itself. A rhythm pulse on a common rock banks ~1.3 u, so a
// per-vent floor paid nothing and holding the peg out-earned the rhythm. The fraction carries.
test('X-07 on a common rock the rhythm out-earns holding the peg (plan ~+65% vs ~+26%)', () => {
  function mineOut(style) {
    const h = bootBeam();
    h.asteroid.data.oreHP = 320; h.asteroid.data.oreHPMax = 320; h.asteroid.hull = 320; h.asteroid.hullMax = 320;
    const beam = h.player.data.miningBeam;
    let base = 0; let bonus = 0; let on = true;
    h.bus.on('mining:yield', (p) => { if (p.ventBonus) bonus += p.qty; else base += p.qty || 0; });
    for (let i = 0; i < 60 * 120 && h.asteroid.data.oreHP > 0; i++) {
      if (style === 'rhythm') {
        const pct = beam.heat / beam.heatMax;
        if (on && pct >= 0.95) on = false; else if (!on && pct <= 0.6) on = true;
      }
      step(h, 1, on);
    }
    release(h);
    return { base, bonus, vents: h.ventBonus.length };
  }
  const hold = mineOut('hold');
  const rhythm = mineOut('rhythm');
  assert.equal(hold.base, rhythm.base, 'the base yield is the same rock either way');
  const holdPct = hold.bonus / hold.base;
  const rhythmPct = rhythm.bonus / rhythm.base;
  assert.ok(rhythmPct >= 0.5, `rhythm pays about +65% (${(rhythmPct * 100).toFixed(0)}%)`);
  assert.ok(holdPct <= 0.3, `a pegged hold pays about +26% or less (${(holdPct * 100).toFixed(0)}%)`);
  assert.ok(rhythm.bonus >= hold.bonus * 2, `rhythm ${rhythm.bonus} u vs hold ${hold.bonus} u`);
  assert.ok(rhythm.vents >= 5, 'most rhythm pulses cash a vent the player sees');
});

test('X-07 the CLEAN CUT word holds for 1.2 s then the seam word returns', () => {
  const hud = Object.create(miningHud);
  hud.init({ state: {}, helpers: {}, bus: null });
  hud._dom = { word: { textContent: '' }, mark: { classList: { toggle() {} } } };
  hud._onVentBonus({ clean: true });
  assert.equal(hud._dom.word.textContent, 'CLEAN CUT');
  assert.ok(hud._cleanWordUntil > 0);
  // A vent without clean leaves the slot alone.
  hud._dom.word.textContent = 'ON SEAM';
  hud._onVentBonus({ clean: false, peggedS: 2 });
  assert.equal(hud._dom.word.textContent, 'ON SEAM');
});

test('X-07 the two vent lessons each speak once and stay silent on the rail', () => {
  const h = bootBeam();
  h.bus.emit('mining:ventBonus', { clean: true, peggedS: 0 });
  assert.equal(h.hints.filter((e) => e.verbId === 'miningCleanCut').length, 1);
  h.bus.emit('mining:ventBonus', { clean: true, peggedS: 0 });
  assert.equal(h.hints.filter((e) => e.verbId === 'miningCleanCut').length, 1, 'once only');
  h.bus.emit('mining:ventBonus', { clean: false, peggedS: 2 });
  assert.equal(h.hints.filter((e) => e.verbId === 'miningPegged').length, 1);
  h.bus.emit('mining:ventBonus', { clean: false, peggedS: 0.5 });
  assert.equal(h.hints.filter((e) => e.verbId === 'miningPegged').length, 1, 'sub-second peg does not teach');

  const rail = bootBeam();
  rail.state.onboarding = { active: true, finished: false };
  rail.bus.emit('mining:ventBonus', { clean: true, peggedS: 0 });
  assert.equal(rail.hints.length, 0, 'the rail owns the voice');
});

// X-07 review: the vent cashes on the RELEASE edge — the sim emits ventBonus then mining:stop in
// the same tick — so the word must keep the instrument up by itself or nobody ever sees it.
function x07FakeDocument() {
  const makeNode = (tagName) => {
    const node = {
      tagName, id: '', className: '', children: [], parentNode: null, isConnected: true,
      textContent: '', attributes: {}, style: { display: '' },
      appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
      removeChild(child) { this.children = this.children.filter((c) => c !== child); child.parentNode = null; },
      setAttribute(name, value) {
        this.attributes[name] = String(value);
        if (name === 'class') this.className = String(value);
        if (name === 'id') this.id = String(value);
      },
    };
    node.classList = {
      contains(n) { return node.className.split(/\s+/).includes(n); },
      add(n) { if (!this.contains(n)) node.className = `${node.className} ${n}`.trim(); },
      remove(n) { node.className = node.className.split(/\s+/).filter((c) => c && c !== n).join(' '); },
      toggle(n, force) { const on = force === undefined ? !this.contains(n) : !!force; if (on) this.add(n); else this.remove(n); return on; },
    };
    return node;
  };
  const head = makeNode('head');
  const body = makeNode('body');
  const hud = makeNode('div'); hud.id = 'hud'; body.appendChild(hud);
  const find = (node, id) => {
    if (node.id === id) return node;
    for (const c of node.children) { const f = find(c, id); if (f) return f; }
    return null;
  };
  return {
    head, body, documentElement: { clientWidth: 1440, clientHeight: 900 },
    createElement: makeNode, createElementNS: (ns, tag) => makeNode(`svg:${tag}`),
    getElementById: (id) => find(head, id) || find(body, id),
  };
}

test('X-07 the CLEAN CUT word is visible across the release edge, then retires cleanly', () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  globalThis.document = x07FakeDocument();
  globalThis.window = { innerWidth: 1440, innerHeight: 900 };
  const bus = createBus();
  const state = {
    mode: 'flight', ui: { docked: false }, simTime: 50, playerId: 'player',
    settings: { video: { motionReduce: false }, accessibility: {} }, entities: new Map(),
  };
  const hud = Object.create(miningHud);
  hud.init({ state, bus, helpers: { worldToScreen: (v) => ({ x: 700 + (v.x || 0), y: 300, onScreen: true }) } });
  try {
    hud.update(1 / 60, state);
    const { mark, word } = hud._dom;
    const classes = () => mark.className.split(/\s+/).filter(Boolean);
    bus.emit('mining:start', { minerId: 'player', targetId: 'ast', verb: 'mine', position: { x: 40, z: 0 } });
    bus.emit('mining:heatChanged', { minerId: 'player', heat: 96, heatMax: 100, pct: 0.96, band: 'vent' });
    bus.emit('mining:tick', { contactPos: { x: 40, z: 0 }, seamHit: false, yieldMult: 0.35, sourceEntityId: 'player' });
    hud.update(1 / 60, state);
    assert.equal(word.textContent, 'OFF SEAM');

    // Release edge, sim order: ventBonus, then stop.
    state.simTime += 1 / 60;
    bus.emit('mining:ventBonus', { minerId: 'player', clean: true, peggedS: 0, depth: 0.9, qty: 3 });
    bus.emit('mining:stop', { minerId: 'player', targetId: 'ast', position: null });
    hud.update(1 / 60, state);
    assert.equal(mark.style.display, 'block', 'the beam is off but the word keeps the mark up');
    assert.equal(word.textContent, 'CLEAN CUT');
    assert.ok(classes().includes('mining-seam-on'), 'the word slot is lit (existing seam class)');
    assert.ok(!classes().includes('mining-vent'), 'the heat arc retired with the beam');

    state.simTime += 1.0;
    hud.update(1 / 60, state);
    assert.equal(word.textContent, 'CLEAN CUT', 'still within its 1.2 s');

    state.simTime += 0.25;
    hud.update(1 / 60, state);
    assert.equal(mark.style.display, 'none', 'the beat ends — instrument gone, beam still off');
    assert.equal(hud._cleanWordUntil, 0);
    assert.ok(!classes().includes('mining-seam-on') && !classes().includes('mining-seam-off'),
      'no seam class survives the hide');

    // A fresh heat-only engagement shows no stale word.
    bus.emit('mining:start', { minerId: 'player', targetId: 'ast2', verb: 'mine', position: { x: 20, z: 0 } });
    bus.emit('mining:heatChanged', { minerId: 'player', heat: 30, heatMax: 100, pct: 0.3, band: 'warm' });
    hud.update(1 / 60, state);
    assert.equal(mark.style.display, 'block');
    assert.ok(!classes().includes('mining-seam-on') && !classes().includes('mining-seam-off'),
      'no stale CLEAN CUT on the next beam');
  } finally {
    hud.destroy();
    if (prevDoc === undefined) delete globalThis.document; else globalThis.document = prevDoc;
    if (prevWin === undefined) delete globalThis.window; else globalThis.window = prevWin;
  }
});
