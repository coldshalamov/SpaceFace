// D134. Seed 4242. When an entity id returns to the pool, combat locks, nav
// pointers, the mining target, the flyby focus, the bridle ends, and other
// hulls' owner/target ids drop it. The next occupant does not inherit them.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { missions } from '../src/systems/missions.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';

const SEED = 4242;

test('seed 4242 a recycled id drops every bare pointer that named it', () => {
  const sim = createSimulation({ seed: SEED, systems: [] });
  try {
    assert.equal(sim.state.meta.seed, SEED);
    const victim = sim.spawn({ type: 'ship', pos: { x: 20, z: 0 } });
    const watcher = sim.spawn({ type: 'ship', pos: { x: 40, z: 0 }, data: { combat: { targetId: victim.id, lockTarget: victim.id } } });
    watcher.ownerId = victim.id;
    const id = victim.id;
    sim.state.player.targetId = id;
    sim.state.player.miningTargetId = id;
    sim.state.player.flybyFocus = { targetId: id };
    sim.state.nav = {
      waypoint: { targetEntityId: id },
      autopilot: { targetEntityId: id },
    };
    sim.state.masslineBridle = { sourceId: id, targetId: id };

    victim.alive = false;
    sim.step(SIM_DT);

    assert.equal(sim.state.player.targetId, null);
    assert.equal(sim.state.player.miningTargetId, null);
    assert.equal(sim.state.player.flybyFocus.targetId, null);
    assert.equal(sim.state.nav.waypoint.targetEntityId, null);
    assert.equal(sim.state.nav.autopilot.targetEntityId, null);
    assert.equal(sim.state.masslineBridle.sourceId, null);
    assert.equal(sim.state.masslineBridle.targetId, null);
    assert.equal(watcher.data.combat.targetId, null);
    assert.equal(watcher.data.combat.lockTarget, null);
    assert.equal(watcher.ownerId, null);

    const heir = sim.spawn({ type: 'ship', pos: { x: 21, z: 0 } });
    assert.equal(heir.id, id);
    assert.equal(sim.state.player.targetId, null);
    assert.equal(sim.state.nav.waypoint.targetEntityId, null);
    assert.equal(watcher.data.combat.targetId, null);
  } finally {
    sim.dispose();
  }
});

test('seed 4242 a flushed destroy keeps the corpse when the id has a new occupant', () => {
  const corpse = { id: 4, alive: false, type: 'wreck', data: { physicalRole: 'slag_core' }, pos: { x: 1, z: 2 } };
  const heir = { id: 4, alive: true, type: 'ship', data: {}, pos: { x: 9, z: 9 } };
  const state = {
    meta: { seed: SEED },
    simTime: 10,
    tick: 60,
    playerId: 1,
    player: { credits: 0, cargo: { items: {} }, factionRep: {} },
    entities: new Map([[4, heir]]),
    entityList: [heir],
    world: { currentSectorId: 'sector_helios_prime' },
    missions: { active: [], offers: [], completed: [], failed: [], trackedId: null, boards: {} },
    story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 },
    factions: {},
    ui: { docked: false, dockedStationId: null, trackedMissionId: null },
    nav: {},
    settings: { gameplay: { tutorialHints: false } },
  };
  const bus = { on() { return () => {}; }, off() {}, emit() {} };
  const system = { ...missions };
  system.init({
    state,
    bus,
    helpers: { hash32, mulberry32, voice: { say: () => true } },
    registry: { get: () => null },
  });
  state.missions.completedLog = state.missions.completedLog || [];
  state.missions.receipts = state.missions.receipts || [];
  const mission = {
    id: 'tow-4242',
    status: 'active',
    type: 'tow_recovery',
    targetEntityIds: [4],
    params: {},
    factionId: null,
    collateral_cr: 0,
  };
  state.missions.active.push(mission);
  system._onPhysicalEntityDestroyed({ id: 4, entity: corpse, pos: corpse.pos });
  assert.equal(mission.status, 'failed');
});

test('seed 4242 a cleared bridle source cancels the setup even if the id is alive again', () => {
  const host = Object.create(tetherGameplay);
  host.bus = { emit() {} };
  host._bridleSetup = {
    sourceId: 9,
    sectorId: 'sector_helios_prime',
    expiresAt: 1e9,
  };
  host._bridleActive = null;
  const heir = { id: 9, alive: true };
  const state = {
    entities: new Map([[9, heir]]),
    world: { currentSectorId: 'sector_helios_prime' },
    masslineBridle: { sourceId: null },
    simTime: 10,
  };
  host._reconcileTwinBridle({ get() { return null; } }, state, { id: 1 }, 10);
  assert.equal(host._bridleSetup, null);
});
