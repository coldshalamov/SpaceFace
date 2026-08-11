import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { ZONE_CERES_THROUGHLINE } from '../src/data/authoredPlaces.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { planZoneSpawns, zonesForSector } from '../src/data/sectorZones.js';
import { encounterDirector, planEncounters } from '../src/systems/encounterDirector.js';

const CERES = 'sector_ceres_belt';
const TETHYS = 'sector_tethys_junction';
const AMBUSH_ZONE = 'zone_ceres_ambush';
const AMBUSH_ID = 'ceres:activity:throughline-ambush';
const PHASE_KEY = 'ceresActivityAmbushPhase';
const RESTORE_KEY = 'ceresActivityAmbushRestore';

const THROUGHLINE_GLOBAL = sectorLocalToGlobalForSector(ZONE_CERES_THROUGHLINE.center, CERES);

function shipSpec(pos, data = {}, team = 2) {
  return {
    type: 'ship',
    team,
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    radius: 8,
    mass: 40,
    hull: 100,
    hullMax: 100,
    data,
  };
}

function originalActorState(entity) {
  return structuredClone({ ai: entity.data.ai, intent: entity.data.intent });
}

function bootCeres(options = {}) {
  const sim = createSimulation({ seed: options.seed ?? 47, systems: [encounterDirector] });
  const { state, bus, helpers } = sim;
  const director = sim.registry.get('encounterDirector');
  state.mode = 'flight';
  state.world.currentSectorId = CERES;

  const player = sim.spawn(shipSpec({ x: THROUGHLINE_GLOBAL.x + 220, z: THROUGHLINE_GLOBAL.z }, {
    intent: {},
    ai: {},
  }, 0));
  state.playerId = player.id;

  const cohort = [0, 1].map((index) => sim.spawn(shipSpec({
    x: THROUGHLINE_GLOBAL.x + 145 + index * 5,
    z: THROUGHLINE_GLOBAL.z + index * 3,
  }, {
    worldRecordId: `wr_ceres_ambush_${index}`,
    intent: index === 0 ? { fire: true, moveX: 0.25 } : { fire: true, moveZ: -0.5 },
    ai: {
      spawnContext: 'zone_hostile',
      zoneId: AMBUSH_ZONE,
      squadId: AMBUSH_ZONE,
      passive: false,
      roe: index === 0 ? 'weapons_free' : 'defensive',
      activity: {
        kind: 'attack_run',
        reason: `world_zone_hostile:${index}`,
        anchor: { x: THROUGHLINE_GLOBAL.x + 145, z: THROUGHLINE_GLOBAL.z },
      },
    },
  })));
  const originals = new Map(cohort.map((entity) => [entity.id, originalActorState(entity)]));

  const nearMisses = {
    wrongSquad: sim.spawn(shipSpec({ x: THROUGHLINE_GLOBAL.x + 140, z: THROUGHLINE_GLOBAL.z + 20 }, {
      worldRecordId: 'wr_wrong_squad',
      intent: { fire: true },
      ai: { zoneId: AMBUSH_ZONE, squadId: 'different_squad', passive: false, roe: 'weapons_free' },
    })),
    missingRecord: sim.spawn(shipSpec({ x: THROUGHLINE_GLOBAL.x + 142, z: THROUGHLINE_GLOBAL.z - 20 }, {
      intent: { fire: true },
      ai: { zoneId: AMBUSH_ZONE, squadId: AMBUSH_ZONE, passive: false, roe: 'weapons_free' },
    })),
    deadRecord: sim.spawn(shipSpec({ x: THROUGHLINE_GLOBAL.x + 144, z: THROUGHLINE_GLOBAL.z + 30 }, {
      worldRecordId: 'wr_dead_squad_member',
      intent: { fire: true },
      ai: { zoneId: AMBUSH_ZONE, squadId: AMBUSH_ZONE, passive: false, roe: 'weapons_free' },
    })),
  };
  nearMisses.deadRecord.alive = false;
  const nearMissOriginal = new Map(Object.values(nearMisses).map((entity) => [entity.id, originalActorState(entity)]));

  const calls = { spawn: 0, request: 0, release: 0, releaseSome: 0 };
  const spawnEntity = helpers.spawnEntity;
  helpers.spawnEntity = (spec) => {
    calls.spawn++;
    return spawnEntity(spec);
  };
  helpers.spawnBudget = {
    request() { calls.request++; return 0; },
    release() { calls.release++; },
    releaseSome() { calls.releaseSome++; },
  };

  const events = [];
  for (const name of ['encounter:telegraph', 'encounter:spawned', 'encounter:resolved']) {
    bus.on(name, (payload) => events.push({ name, payload }));
  }
  bus.emit('sector:enter', { sectorId: CERES });
  return {
    sim, state, bus, helpers, director, player, cohort, originals,
    nearMisses, nearMissOriginal, calls, events,
  };
}

function authoredPending(state) {
  return state.encounterDirector.pending.filter((item) => item && item.encounterId === AMBUSH_ID);
}

function assertWorldStateRestored(h, entity) {
  const expected = h.originals.get(entity.id);
  assert.deepEqual(entity.data.ai, expected.ai, 'world-owned AI state is restored exactly');
  assert.deepEqual(entity.data.intent, expected.intent, 'world-owned intent state is restored exactly');
  assert.equal(entity.data.despawnAt, undefined, 'adopted world actors never receive encounter despawn');
}

function crossAndFire(h) {
  const dir = h.state.encounterDirector;
  h.player.pos.x = THROUGHLINE_GLOBAL.x - 220;
  h.director.update(1 / 60, h.state);
  assert.equal(authoredPending(h.state).length, 1, 'one outer-to-outer swept crossing queues once');
  assert.deepEqual(dir.stats.ceresActivityAmbush, { phase: 'queued' });

  h.director.update(1, h.state);
  assert.equal(dir.live[AMBUSH_ID], undefined, 'normal pacing gap defers the authored item');
  assert.equal(authoredPending(h.state).length, 1);
  assert.ok(authoredPending(h.state)[0].dueAt > h.state.simTime);

  h.state.simTime = 31;
  dir.pressure.combat = 140;
  dir.lastMeaningfulAt = 0;
  dir.lastMajorAt = -1e9;
  dir.window = [];
  dir.cooldowns = {};
  h.director.update(1, h.state);
  const live = dir.live[AMBUSH_ID];
  assert.ok(live, 'the normal director pump fires after pacing becomes eligible');
  assert.equal(live.phase, 'offer');
  assert.deepEqual(live.ids, h.cohort.map((entity) => entity.id));
  return live;
}

test('Ceres durable ambush presence is clustered in the Throughline interaction band without RNG drift', () => {
  const values = [0.99, 0.2, 0.6, 0.25, 0.81, 0.8, 0.4, 0.75, 0.36];
  const run = (sectorId) => {
    let cursor = 0;
    const plan = planZoneSpawns(sectorId, 20, [2, 4], () => values[cursor++ % values.length]);
    return { plan, draws: cursor };
  };
  const compact = (plan) => plan.map((intent) => [
    intent.zoneId,
    intent.archetypeId,
    intent.level,
    intent.pos.x.toFixed(6),
    intent.pos.z.toFixed(6),
  ].join('|'));

  const ceres = run(CERES);
  assert.equal(ceres.draws, 23, 'Ceres keeps the pre-existing exact planner RNG draw count');
  assert.deepEqual(compact(ceres.plan), [
    'zone_ceres_refinery|patrol_lawman|4|-1049.185728|463.609752',
    'zone_ceres_refinery|patrol_lawman|3|-983.953908|612.698999',
    'zone_ceres_ambush|wasp_swarmer|3|3305.926691|-969.969113',
    'zone_ceres_derelict|wasp_swarmer|4|75.100496|-980.670741',
    'zone_ceres_derelict|wasp_swarmer|4|240.000000|-946.000000',
  ], 'full Ceres presence ordering/archetype/level sequence stays pinned; only ambush placement moves');

  const presence = zonesForSector(CERES).filter((zone) => zone.presence).map((zone) => ({
    id: zone.id,
    size: zone.presence.size,
    archetypes: zone.presence.archetypes,
  }));
  assert.deepEqual(presence, [
    { id: 'zone_ceres_refinery', size: [1, 2], archetypes: ['patrol_lawman'] },
    { id: AMBUSH_ZONE, size: [1, 2], archetypes: ['reaver_pirate', 'wasp_swarmer'] },
    { id: 'zone_ceres_derelict', size: [1, 2], archetypes: ['wasp_swarmer', 'reaver_pirate'] },
  ], 'presence sizes, archetype arrays, and zone order are unchanged');

  const cohort = ceres.plan.filter((intent) => intent.zoneId === AMBUSH_ZONE);
  assert.ok(cohort.length >= 1 && cohort.length <= 2);
  for (const intent of cohort) {
    const distance = Math.hypot(
      intent.pos.x - ZONE_CERES_THROUGHLINE.center.x,
      intent.pos.z - ZONE_CERES_THROUGHLINE.center.z,
    );
    assert.ok(distance >= 127 && distance <= 163, `Throughline distance ${distance}`);
  }

  const zone = zonesForSector(CERES).find((entry) => entry.id === AMBUSH_ZONE);
  assert.deepEqual(zone.center, { x: -400, z: -2400 }, 'macro zone geometry stays map-stable');
  assert.equal(zone.radius, 640);
  assert.deepEqual(zone.presence.spawnCenter, {
    x: ZONE_CERES_THROUGHLINE.center.x + 145,
    z: ZONE_CERES_THROUGHLINE.center.z,
  });
  assert.equal(zone.presence.clusterRadius, 18);

  const tethys = run(TETHYS);
  assert.equal(tethys.draws, 18, 'non-Ceres planner draw count remains byte-stable');
  assert.equal(JSON.stringify(compact(tethys.plan)), JSON.stringify([
    'zone_tethys_checkpoint|patrol_lawman|3|-554.392242|-1396.220516',
    'zone_tethys_checkpoint|patrol_lawman|4|-804.899504|-980.670741',
    'zone_tethys_checkpoint|patrol_lawman|4|-640.000000|-946.000000',
    'zone_tethys_blackmkt|reaver_pirate|3|-1380.000000|264.000000',
  ]), 'Tethys full plan bytes remain pinned across the presence-only Ceres change');
});

test('only the exact generic Ceres ambush row is suppressed and non-Ceres planning remains identical', () => {
  const h = bootCeres();
  const dir = h.state.encounterDirector;
  dir.pending.push(
    { encounterId: 'generic-exact', shapeId: 'ambush_snare', zoneId: AMBUSH_ZONE },
    { encounterId: 'authored-exact', shapeId: 'ambush_snare', zoneId: AMBUSH_ZONE, data: { ceresActivityAmbush: true } },
    { encounterId: 'other-zone', shapeId: 'ambush_snare', zoneId: 'zone_ceres_derelict' },
    { encounterId: 'other-shape', shapeId: 'pirate_toll', zoneId: AMBUSH_ZONE },
  );
  h.director._seedCeresActivityAmbush(CERES);
  assert.deepEqual(
    dir.pending.slice(-3).map((item) => item.encounterId),
    ['authored-exact', 'other-zone', 'other-shape'],
    'the exact generic row alone is removed',
  );

  const sim = createSimulation({ seed: 1403, systems: [encounterDirector] });
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = TETHYS;
  const director = sim.registry.get('encounterDirector');
  const expected = planEncounters(1403, TETHYS, 0, zonesForSector(TETHYS), sim.state)
    .map((item) => ({ ...item, sectorId: TETHYS, dueAt: item.delay, defers: 0 }));
  director._planSector(TETHYS);
  assert.deepEqual(sim.state.encounterDirector.pending, expected, 'non-Ceres planner output and ordering are untouched');
});

test('a queued physical crossing survives the ordinary day replan and still fires through the normal pump', () => {
  const h = bootCeres();
  h.player.pos.x = THROUGHLINE_GLOBAL.x - 220;
  h.director.update(1 / 60, h.state);
  const queued = authoredPending(h.state)[0];
  assert.ok(queued, 'crossing queues the authored item before the day boundary');

  h.state.simTime = 601;
  h.bus.emit('day:tick', {});
  const afterReplan = authoredPending(h.state);
  assert.deepEqual(afterReplan, [queued], 'day replan carries the exact queued item once');

  const dir = h.state.encounterDirector;
  dir.pressure.combat = 140;
  dir.lastMeaningfulAt = 0;
  dir.lastMajorAt = -1e9;
  dir.window = [];
  dir.cooldowns = {};
  h.director.update(1, h.state);
  assert.ok(dir.live[AMBUSH_ID], 'the preserved item reaches the ordinary paced fire path');
  assert.equal(authoredPending(h.state).length, 0);
  assert.equal(h.events.filter((entry) => entry.name === 'encounter:telegraph').length, 1);
});

test('the authored crossing ignores only minSectorTier and remains fail-closed on non-tier gates', () => {
  const h = bootCeres();
  const gated = {
    id: 'ambush_snare',
    gates: { minSectorTier: 99, requiredTech: 'tech_test_gate' },
  };
  h.state.player.researchedNodes = [];
  assert.equal(
    h.director._gatesPass(gated, h.state, { ignoreMinSectorTier: true }),
    false,
    'a missing required technology still blocks the exact authored eligibility mode',
  );
  h.state.player.researchedNodes = ['tech_test_gate'];
  assert.equal(
    h.director._gatesPass(gated, h.state, { ignoreMinSectorTier: true }),
    true,
    'only the tier mismatch is ignored once every other gate passes',
  );
});

test('high-speed band crossing is paced once, adopts the durable cohort, springs, and restores on escape', () => {
  const h = bootCeres();
  for (const entity of h.cohort) {
    assert.equal(entity.data.ai.passive, true);
    assert.equal(entity.data.ai.roe, 'hold_fire');
    assert.equal(entity.data.intent.fire, false);
    assert.equal(entity.data.ai[PHASE_KEY], 'armed');
    assert.ok(entity.data.ai[RESTORE_KEY]);
  }
  for (const entity of Object.values(h.nearMisses)) {
    assert.deepEqual(originalActorState(entity), h.nearMissOriginal.get(entity.id), 'non-cohort actor is untouched');
  }

  const live = crossAndFire(h);
  assert.deepEqual(h.calls, { spawn: 0, request: 0, release: 0, releaseSome: 0 });
  assert.deepEqual(h.state.encounterDirector.active, {}, 'adopted actors never enter the director budget ledger');
  assert.equal(h.events.filter((row) => row.name === 'encounter:telegraph').length, 1);
  assert.equal(h.events.filter((row) => row.name === 'encounter:spawned').length, 1);
  for (const entity of h.cohort) {
    assert.equal(entity.data.ai.activity.targetId, null, 'offer actors have no combat target');
  }

  h.player.pos.x = THROUGHLINE_GLOBAL.x + 145;
  h.player.pos.z = THROUGHLINE_GLOBAL.z;
  h.state.simTime = live.data.springAt + 0.01;
  h.director.update(1, h.state);
  assert.equal(live.phase, 'conflict');
  for (const entity of h.cohort) {
    assert.equal(entity.data.ai.passive, false);
    assert.equal(entity.data.ai[PHASE_KEY], 'conflict');
    assert.equal(entity.data.ai.activity.kind, 'attack_run');
    assert.equal(entity.data.ai.roe, 'weapons_free');
    assert.equal(entity.data.ai.activity.targetId, h.player.id, 'every adopted actor targets the live player');
  }

  h.player.pos.x = THROUGHLINE_GLOBAL.x + 5000;
  h.state.simTime += 1;
  h.director.update(1, h.state);
  assert.equal(h.state.encounterDirector.live[AMBUSH_ID], undefined);
  assert.deepEqual(h.state.encounterDirector.stats.ceresActivityAmbush, { phase: 'done', outcome: 'escaped' });
  for (const entity of h.cohort) assertWorldStateRestored(h, entity);
  assert.deepEqual(h.calls, { spawn: 0, request: 0, release: 0, releaseSome: 0 });
});

test('Continue resumes conflict against the current player using only live durable members', () => {
  const h = bootCeres();
  const sprung = crossAndFire(h);
  h.player.pos.x = THROUGHLINE_GLOBAL.x + 145;
  h.player.pos.z = THROUGHLINE_GLOBAL.z;
  h.state.simTime = sprung.data.springAt + 0.01;
  h.director.update(1, h.state);
  assert.equal(sprung.phase, 'conflict');

  const continuousLive = h.state.encounterDirector.live[AMBUSH_ID];
  h.bus.emit('sector:exit', { sectorId: CERES, continuous: true, noTeleport: true });
  h.bus.emit('sector:enter', { sectorId: CERES, continuous: true, noTeleport: true });
  assert.equal(
    h.state.encounterDirector.live[AMBUSH_ID],
    continuousLive,
    'continuous handoff preserves the active encounter and world-owned cohort',
  );
  const retired = h.cohort[1];
  retired.alive = false;
  const priorPlayerId = h.player.id;
  const replacementPlayer = h.sim.spawn(shipSpec({
    x: h.player.pos.x,
    z: h.player.pos.z,
  }, { intent: {}, ai: {} }, 0));
  h.state.playerId = replacementPlayer.id;
  h.player = replacementPlayer;
  h.calls.spawn = 0;
  const entityCount = h.state.entityList.length;

  h.bus.emit('save:loaded', {});
  let live = h.state.encounterDirector.live[AMBUSH_ID];
  assert.ok(live, 'revealed one-shot truth resumes after Continue');
  assert.equal(live.phase, 'conflict');
  assert.deepEqual(live.ids, [h.cohort[0].id], 'dead durable members are neither adopted nor replaced');
  assert.notEqual(h.player.id, priorPlayerId, 'Continue fixture installs a different live player identity');
  assert.equal(
    h.cohort[0].data.ai.activity.targetId,
    h.player.id,
    'conflict resume rebinds the surviving actor to the current player',
  );
  assert.equal(h.state.entityList.length, entityCount);
  assert.equal(h.calls.spawn, 0);
  assert.equal(h.calls.request, 0);

  h.bus.emit('save:loaded', {});
  live = h.state.encounterDirector.live[AMBUSH_ID];
  assert.deepEqual(live.ids, [h.cohort[0].id], 'repeated Continue stays single-instance');
  h.bus.emit('sector:exit', { sectorId: CERES, continuous: false, noTeleport: false });
  assert.equal(h.state.encounterDirector.live[AMBUSH_ID], undefined);
  assertWorldStateRestored(h, h.cohort[0]);
  assert.equal(retired.data.despawnAt, undefined);
  assert.deepEqual(h.state.encounterDirector.stats.ceresActivityAmbush, {
    phase: 'done', outcome: 'aborted:sector_exit',
  });

  h.state.world.currentSectorId = CERES;
  h.bus.emit('sector:enter', { sectorId: CERES });
  h.player.pos.x = THROUGHLINE_GLOBAL.x + 220;
  h.director.update(1 / 60, h.state);
  h.player.pos.x = THROUGHLINE_GLOBAL.x - 220;
  h.director.update(1 / 60, h.state);
  assert.equal(authoredPending(h.state).length, 0, 'completed one-shot truth never rearms on reentry');
  assert.equal(h.state.encounterDirector.live[AMBUSH_ID], undefined);
  assert.equal(h.state.entityList.length, entityCount);
  assert.deepEqual(h.calls, { spawn: 0, request: 0, release: 0, releaseSome: 0 });
});

test('Continue defers Ceres ambush seeding until the incoming director phase is authoritative', () => {
  const h = bootCeres();
  const dirBeforeRestore = h.state.encounterDirector;
  dirBeforeRestore.stats.ceresActivityAmbush = { phase: 'done', outcome: 'outgoing_timeline' };

  const incomingRestoreSnapshots = new Map();
  for (const entity of h.cohort) {
    entity.data.ai[PHASE_KEY] = 'offer';
    incomingRestoreSnapshots.set(entity.id, structuredClone(entity.data.ai[RESTORE_KEY]));
  }

  // Production restore order: save:restoring -> world.enterSector/sector:enter -> install the
  // serialized director bag -> save:loaded. The outgoing `done` phase must not clear the incoming
  // actors' saved offer markers during the early sector event.
  h.bus.emit('save:restoring', { slot: 'quality-conflict' });
  h.bus.emit('sector:enter', { sectorId: CERES });
  assert.equal(h.state.encounterDirector, dirBeforeRestore, 'early restore entry does not replace the outgoing bag');
  assert.equal(authoredPending(h.state).length, 0, 'early restore entry does not plan or seed transients');
  for (const entity of h.cohort) {
    assert.equal(entity.data.ai[PHASE_KEY], 'offer', 'incoming phase marker survives the stale outgoing phase');
    assert.deepEqual(
      entity.data.ai[RESTORE_KEY],
      incomingRestoreSnapshots.get(entity.id),
      'incoming world-owner restore snapshot is not overwritten or cleared',
    );
  }

  h.state.encounterDirector = {
    named: {},
    receipts: [],
    cooldowns: {},
    stats: { ceresActivityAmbush: { phase: 'revealed' } },
  };
  h.bus.emit('save:loaded', { slot: 'quality-conflict' });

  const resumed = h.state.encounterDirector.live[AMBUSH_ID];
  assert.ok(resumed, 'saved revealed phase resumes after the incoming bag is installed');
  assert.equal(resumed.phase, 'offer');
  assert.deepEqual(resumed.ids, h.cohort.map((entity) => entity.id));
  assert.deepEqual(h.state.encounterDirector.stats.ceresActivityAmbush, { phase: 'revealed' });
  assert.equal(Object.keys(h.state.encounterDirector.live).length, 1, 'Continue creates one transient live record');
  assert.deepEqual(h.calls, { spawn: 0, request: 0, release: 0, releaseSome: 0 });
});
