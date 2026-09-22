import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { mulberry32 } from '../src/core/rng.js';
import { SIM_DT } from '../src/core/sim.js';
import { ASTEROIDS, BEAMS } from '../src/data/mining.js';
import {
  BEAM_VENT_BAND_LO,
  SEAM_SPEED_OFF,
  mining as miningBase,
} from '../src/systems/mining.js';

// Owner ruling 2026-09-21: the starter beam's peg-lockout was the bug. Holding the beam on a rock
// must keep extracting for as long as the rock lasts; the heat gauge may still pay a vent bonus
// for a good release, but pegging must never shut the tool off, slow the radiators, or forfeit
// stored ore. These tests drive the live mining system through its real update() route on seed
// 4242 and prove a continuous hold runs one common rock to empty through a pegged gauge.

const SEED = 4242;
const MK1 = BEAMS.find((b) => b.id === 'beam_mk1');
const COMMON = ASTEROIDS.find((a) => a.id === 'ast_common_rock');

function bootBeam() {
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 6,
    flags: { docked: false },
    data: { miningBeam: { tierId: 'beam_mk1', directToCargo: false } },
  };
  const asteroid = {
    id: 2,
    type: 'asteroid',
    alive: true,
    pos: { x: 60, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    mass: 400,
    hull: 140,
    hullMax: 140,
    data: { typeId: 'ast_common_rock', oreHP: 140, oreHPMax: 140, commodityId: 'cmdty_silicate' },
  };
  const state = {
    mode: 'flight',
    playerId: player.id,
    simTime: 0,
    tick: 0,
    meta: { seed: SEED },
    rng: mulberry32(SEED),
    player: { cargo: { items: {}, capVolume: 500, capMass: 1000, usedVolume: 0, usedMass: 0 } },
    input: { aimAngle: 0, fireGroup: 0, actions: {} },
    entities: new Map([[player.id, player], [asteroid.id, asteroid]]),
    entityList: [player, asteroid],
    world: { currentSectorId: 'sector_test' },
  };
  const bus = createBus();
  const events = { overheated: [], ventReady: [], ventBonus: [], yield: [], stop: [] };
  bus.on('mining:overheated', (p) => events.overheated.push(p));
  bus.on('mining:ventReady', (p) => events.ventReady.push(p));
  bus.on('mining:ventBonus', (p) => events.ventBonus.push(p));
  bus.on('mining:yield', (p) => events.yield.push(p));
  bus.on('mining:stop', (p) => events.stop.push(p));
  let nextId = 10;
  const helpers = {
    spawnEntity(spec) {
      const entity = { id: nextId++, alive: true, ...spec, data: spec.data || {} };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const mining = { ...miningBase };
  mining.init({ state, bus, helpers, registry: { get: () => null } });
  return { state, bus, mining, player, asteroid, events };
}

function holdUntil({ state, mining }, cond, maxTicks) {
  // Holds the trigger across whole update() ticks and stops the moment cond() reads true — the
  // beam is still held on return, so the caller owns the release edge.
  for (let i = 0; i < maxTicks; i++) {
    state.input.fireGroup = 2;
    mining.update(SIM_DT, state);
    state.simTime += SIM_DT;
    state.tick += 1;
    if (cond()) return i + 1;
  }
  return maxTicks;
}

test('a continuous beam on one common rock runs it to empty through a pegged gauge (seed 4242)', () => {
  const { state, bus, mining, player, asteroid, events } = bootBeam();
  try {
    const beam = player.data.miningBeam;
    state.input.fireGroup = 2;

    // Uninterrupted worst case: every single tick lands off-seam (SEAM_SPEED_OFF). The legacy
    // lockout cost peg-to-reset at the penalized radiator rate — seconds of dead beam — which
    // cannot fit in this budget's 2-tick slack.
    const perTickHp = MK1.dps * SEAM_SPEED_OFF * SIM_DT;
    const budget = Math.ceil(asteroid.data.oreHPMax / perTickHp) + 2;

    let peggedTick = -1;
    let depletedTick = -1;
    let prevOreHp = Infinity;
    let peggedTicks = 0;
    for (let tick = 1; tick <= budget; tick++) {
      mining.update(SIM_DT, state);
      state.simTime += SIM_DT;
      state.tick += 1;
      if (peggedTick < 0 && beam.heat >= beam.heatMax) peggedTick = tick;
      if (peggedTick > 0 && asteroid.alive) {
        assert.ok(asteroid.data.oreHP < prevOreHp,
          `extraction must continue every tick while the gauge is pegged (tick ${tick})`);
        peggedTicks++;
      }
      prevOreHp = asteroid.data.oreHP;
      if (!asteroid.alive) { depletedTick = tick; break; }
    }

    assert.ok(peggedTick > 0, 'the gauge must peg during the continuous hold (the old lockout trigger)');
    assert.ok(depletedTick > 0, 'the rock must run to empty under one continuous hold');
    assert.ok(depletedTick <= budget,
      `depletion must take no more than the uninterrupted off-seam time (${depletedTick} ticks > budget ${budget})`);
    assert.ok(peggedTicks > 30,
      `the beam must keep biting well past the peg (only ${peggedTicks} pegged ticks)`);
    assert.equal(asteroid.data.oreHP, 0, 'the rock empties exactly');
    assert.equal(asteroid.data.respawnAt != null, true, 'the emptied rock leaves the live field');
    assert.equal(events.overheated.length, 0, 'pegging must never emit a lockout event');
    assert.equal(events.stop.length, 0, 'the beam must never cut out while the player holds it');

    // One more held tick: the dead rock releases the lock cleanly (exactly one stop edge), and the
    // hold's yield reached the normal ore path.
    mining.update(SIM_DT, state);
    assert.equal(events.stop.length, 1, 'the only stop edge is the one the emptied rock causes');
    const yieldU = events.yield.reduce((sum, p) => sum + (p.qty || 0), 0);
    assert.ok(yieldU >= 3, `a run-to-empty hold must pay real ore (got ${yieldU}u)`);
  } finally {
    bus.clear();
  }
});

test('pegging forfeits nothing: a release at the peg pays the bonus and radiators run at full rate', () => {
  const { state, bus, mining, player, asteroid, events } = bootBeam();
  try {
    const beam = player.data.miningBeam;
    state.input.fireGroup = 2;
    holdUntil({ state, mining }, () => beam.heat >= beam.heatMax, 600);

    assert.ok(beam.heat >= beam.heatMax, 'the hold must reach the peg');
    assert.ok(asteroid.alive, 'the rock outlasts the peg (4.5s to peg vs ~8s+ to empty)');
    assert.equal(events.overheated.length, 0, 'no lockout event at the peg');
    assert.equal(events.stop.length, 0, 'the peg must not cut the beam');

    // Release at the peg: the amber band is deepest here, so the stored pulse pays out in full.
    state.input.fireGroup = 0;
    mining.update(SIM_DT, state);
    assert.equal(events.stop.length, 1, 'the release edge fires exactly once');
    assert.equal(events.ventBonus.length, 1, 'a peg release is still a deep-band release: bonus pays');
    assert.ok(events.ventBonus[0].qty >= 2,
      `no forfeit: the whole stored pulse pays (got ${events.ventBonus[0].qty}u)`);
    assert.equal(events.ventBonus[0].depth, 1);

    // Radiators dump at the full tier rate — no saturated slow-down multiplier after a peg.
    assert.ok(Math.abs(beam.heat - (beam.heatMax - MK1.coolRate * SIM_DT)) < 1e-9,
      `cooling must run at the full coolRate after a peg (got ${beam.heat})`);
  } finally {
    bus.clear();
  }
});

test('releasing inside the amber band still pays the vent bonus', () => {
  const { state, bus, mining, player, events } = bootBeam();
  try {
    const beam = player.data.miningBeam;
    const bandTarget = BEAM_VENT_BAND_LO + (1 - BEAM_VENT_BAND_LO) * 0.87; // deep in the band, not pegged
    state.input.fireGroup = 2;
    holdUntil({ state, mining }, () => beam.heat / beam.heatMax >= bandTarget, 600);

    const pct = beam.heat / beam.heatMax;
    assert.ok(pct >= BEAM_VENT_BAND_LO && pct < 1, 'the hold reaches the amber band without pegging');
    assert.equal(events.overheated.length, 0);
    assert.equal(events.ventReady.length, 1, 'the band announces itself exactly once on the way up');

    state.input.fireGroup = 0;
    mining.update(SIM_DT, state);
    assert.equal(events.ventBonus.length, 1, 'a band release pays the bonus');
    assert.ok(events.ventBonus[0].qty >= 1, `bonus ore is real (got ${events.ventBonus[0].qty}u)`);
    assert.ok(events.ventBonus[0].depth > 0.8, `the bonus scales with band depth (got ${events.ventBonus[0].depth})`);
  } finally {
    bus.clear();
  }
});
