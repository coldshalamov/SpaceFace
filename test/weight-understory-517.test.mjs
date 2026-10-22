// weight-understory-517 — W-UNDERSTORY (build_map §34.5 row 517, bible 02 §10).
//
// Proves the row's done-when on the real data and the runtime owner:
//   data/factions/understory.js   five persisted growth stages, Compost Run, Spore Head,
//                                 tide-pushback constants, gardener-skiff roster role
//   systems/faction_understory.js gardens eat loose mass and grow; a dead Understory hull
//                                 seeds a garden; a stage-4+ garden pushes the tide line;
//                                 the Compost Run closes on player-fed mass
//
// Run: node --test test/weight-understory-517.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import {
  understoryGardens,
  spawnGarden,
  stageForBiomass,
  understoryTidePushbackAt,
  ensureUnderstoryState,
} from '../src/systems/faction_understory.js';
import faction, {
  UNDERSTORY_GARDEN_STAGES,
  UNDERSTORY_GARDENS,
  UNDERSTORY_COMPOST_RUN,
  UNDERSTORY_SPORE_HEAD,
} from '../src/data/factions/understory.js';

const SEED = 4242;

function boot() {
  const bus = createBus();
  const sim = createSimulation({ seed: SEED, bus, systems: [understoryGardens] });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_charon_expanse';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 5000, z: 5000 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  return { sim, state, bus, player };
}

const wreck = (sim, x, z, mass, extra = {}) => sim.spawn({
  type: 'wreck', team: 2, pos: { x, z }, radius: 14, mass,
  hull: 10, hullMax: 10, collides: true, data: { ...(extra || {}) },
});

test('data: five persisted growth stages, monotonic mass floors and radii', () => {
  assert.equal(UNDERSTORY_GARDEN_STAGES.length, 5, 'gardens grow through five stages');
  for (let i = 0; i < UNDERSTORY_GARDEN_STAGES.length; i++) {
    const s = UNDERSTORY_GARDEN_STAGES[i];
    assert.equal(s.stage, i + 1);
    assert.ok(Number.isFinite(s.massFloor) && Number.isFinite(s.radius));
    if (i > 0) {
      assert.ok(s.massFloor > UNDERSTORY_GARDEN_STAGES[i - 1].massFloor, 'floors rise');
      assert.ok(s.radius > UNDERSTORY_GARDEN_STAGES[i - 1].radius, 'the reef visibly grows');
    }
  }
  assert.equal(UNDERSTORY_GARDENS.tidePushbackStage, 4, 'stage 4+ pushes the tide line');
  assert.ok(UNDERSTORY_COMPOST_RUN.targetMass > 0, 'the Compost Run has a mass target');
  assert.equal(faction.custom.flungMassFeedsGardens, true);
  assert.ok(faction.shipRoles.some((r) => r.role === 'gardener-skiff'), 'Gardener skiff is on the roster');
});

test('a garden eats loose mass in its ring and grows through the stages', () => {
  const { sim, state } = boot();
  try {
    const garden = spawnGarden(state, sim.helpers, { x: 0, z: 0, sectorId: 'sector_charon_expanse' });
    assert.equal(garden.data.gardenStage, 1);
    const u = ensureUnderstoryState(state);
    const rec = u.gardens[garden.data.gardenId];
    assert.ok(rec, 'the garden is persisted in the record');

    // One big wreck inside the ring: 100t * 0.6 yield = 60t — the stage-2 floor exactly.
    const prey = wreck(sim, 40, 0, 100);
    sim.step();
    assert.equal(prey.alive, false, 'the ring absorbed the wreck');
    assert.ok(rec.biomass >= 60, `biomass grew to ${rec.biomass}`);
    assert.equal(garden.data.gardenStage, 2, 'the garden reached stage 2');
    assert.equal(garden.radius, UNDERSTORY_GARDEN_STAGES[1].radius, 'radius follows the stage');

    // Feed to stage 4 (420t biomass = 700t fed at 0.6 yield).
    for (let i = 0; i < 4; i++) wreck(sim, 30 + i * 10, 10, 200);
    sim.step();
    assert.ok(garden.data.gardenStage >= 4, `stage ${garden.data.gardenStage} >= 4`);
    assert.equal(stageForBiomass(rec.biomass).stage, garden.data.gardenStage);
  } finally {
    sim.dispose();
  }
});

test('a stage-4+ garden pushes the local tide line (row 520 contract)', () => {
  const { sim, state } = boot();
  try {
    const sector = 'sector_eunomia_gulf';
    const garden = spawnGarden(state, sim.helpers, { x: 0, z: 0, sectorId: sector, biomass: 900 });
    assert.equal(garden.data.gardenStage, 5, 'the reef stage tops the ladder');
    sim.step();
    const push = understoryTidePushbackAt(state, sector);
    assert.ok(push >= UNDERSTORY_GARDENS.tidePushbackPerGarden, `pushback ${push}`);
    assert.equal(ensureUnderstoryState(state).tidePushback[sector], push,
      'the persisted tide record agrees with the reader');
    // A young garden elsewhere pushes nothing.
    spawnGarden(state, sim.helpers, { x: 900, z: 900, sectorId: 'sector_charon_expanse' });
    sim.step();
    assert.equal(understoryTidePushbackAt(state, 'sector_charon_expanse'), 0);
  } finally {
    sim.dispose();
  }
});

test('sporeBloomOnDeath: a dead Understory hull seeds a stage-1 garden where it falls', () => {
  const { sim, state, bus } = boot();
  try {
    const hull = sim.spawn({
      type: 'ship', team: 1, factionId: 'faction_understory',
      pos: { x: 300, z: -200 }, radius: 10, mass: 30, hull: 1, hullMax: 1, collides: true,
      data: { sectorId: 'sector_charon_expanse' },
    });
    bus.emit('entity:killed', { id: hull.id, type: 'ship', pos: { ...hull.pos } });
    const gardens = state.entityList.filter((e) => e.data?.understoryGarden === true);
    assert.equal(gardens.length, 1, 'one garden seeded on the death spot');
    assert.equal(gardens[0].data.gardenStage, 1);
    assert.ok(Math.hypot(gardens[0].pos.x - 300, gardens[0].pos.z - -200) < 1);
  } finally {
    sim.dispose();
  }
});

test('the Compost Run (E-26): player-fed mass accrues and closes the run', () => {
  const { sim, state, bus, player } = boot();
  try {
    const garden = spawnGarden(state, sim.helpers, { x: 0, z: 0, sectorId: 'sector_charon_expanse' });
    const events = [];
    bus.on('understory:compostRunComplete', (p) => events.push(p));
    const run = ensureUnderstoryState(state).compost;

    // The player flings wreck after wreck into the ring (thrownBy stamps the credit).
    let fed = 0;
    while (fed < UNDERSTORY_COMPOST_RUN.targetMass) {
      const prey = wreck(sim, 20, 0, 60, { thrownBy: player.id });
      sim.step();
      assert.equal(prey.alive, false);
      fed += 60;
    }
    assert.equal(events.length, 1, 'the run closed exactly once');
    const rec = run[garden.data.gardenId];
    assert.equal(rec.complete, true);
    assert.ok(rec.fedMass >= UNDERSTORY_COMPOST_RUN.targetMass);
    const g = ensureUnderstoryState(state).gardens[garden.data.gardenId];
    assert.ok(g.fedByPlayer >= UNDERSTORY_COMPOST_RUN.targetMass, 'the garden records who fed it');

    // Stranger-fed mass does not credit the player.
    const stranger = wreck(sim, 20, 0, 60, { thrownBy: 'npc_9' });
    sim.step();
    assert.equal(events.length, 1, 'no second completion');
  } finally {
    sim.dispose();
  }
});

test('Spore Head: a held mass grows a rot-skin after the authored hold time', () => {
  const { sim, state, player } = boot();
  try {
    player.data = { ...(player.data || {}), lineHeadId: UNDERSTORY_SPORE_HEAD.id };
    const rock = sim.spawn({
      type: 'asteroid', team: 2, pos: { x: player.pos.x + 40, z: player.pos.z },
      radius: 10, mass: 50, hull: 100, hullMax: 100, collides: true, data: {},
    });
    state.player.tether = { active: true, targetId: rock.id };
    const growTicks = Math.ceil(UNDERSTORY_SPORE_HEAD.growS * 60);
    sim.runTicks(growTicks - 1);
    assert.notEqual(rock.data.sporeSkin, true, 'still bare inside the hold window');
    sim.step();
    assert.equal(rock.data.sporeSkin, true, 'the rot-skin took');
    assert.equal(rock.data.sticksOnImpact, true, 'it sticks on impact');
    assert.ok(rock.data.restitutionMult < 1, 'it goes soft — low bounce');
  } finally {
    sim.dispose();
  }
});
