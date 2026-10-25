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
