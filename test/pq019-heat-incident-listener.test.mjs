// PQ-019B seam (b) — the heat owner consumes a validated law incident exactly once.
//
// The claim under test: heat is raised for a heist by the LAW's decision, through heat's own private
// mutation path, exactly once — across duplicate deliveries, replays, and a save reload. No mission
// writes heat, because the only door into heat is a receipt a mission cannot sign.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { COMBAT_FLAGS, MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { heat, INCIDENT_HEAT, heatLevelFor, THRESHOLD as WANTED_THRESHOLD } from '../src/systems/heat.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { combat, makeEnemySpawnSpec } from '../src/systems/combat.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { lootShards } from '../src/systems/lootShards.js';
import {
  captureEntityRecord,
  createEmptyRecordsBag,
  deserializeRecordsBag,
  serializeRecordsBag,
  spawnSpecFromRecord,
  upsertRecord,
} from '../src/world/worldRecords.js';

const SEED = 19019;
const SECTOR = 'sector_tethys_junction';
const THEFT_POS = Object.freeze({ x: 240, z: 0 });

function boot() {
  const sim = createSimulation({ seed: SEED, systems: [lawSecurity, heat] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  if (!state.world.sectors) state.world.sectors = {};
  state.world.sectors[SECTOR] = { id: SECTOR, factionId: 'faction_scn', security: 0.9, tier: 0 };
  state.player.heat = 0;

  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 250, z: 10 }, hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;
  sim.spawn({
    type: 'station', team: 2, factionId: 'faction_scn', pos: { x: 0, z: 0 }, radius: 42,
    data: { stationId: 'station_tethys_customs', dockRadius: 72, factionId: 'faction_scn' },
  });

  const changes = [];
  bus.on('heat:changed', (p) => changes.push(p));
  return {
    sim, state, bus, player, changes,
    law: sim.registry.get('lawSecurity'),
    heat: sim.registry.get('heat'),
  };
}

function report(overrides = {}) {
  return {
    reportId: 'heist:receipt:xyz:lawIncident',
    kind: 'payload_theft',
    offenderStableId: 'player',
    payloadStableId: 'pq019a_cargo_capsule',
    causalTick: 120,
    pos: { ...THEFT_POS },
    ...overrides,
  };
}

function bootCombat(systems = [combat, heat]) {
  const sim = createSimulation({ seed: SEED, systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.player.heat = 0;
  const player = sim.spawn({
    type: 'ship', team: 0, factionId: 'faction_free', pos: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;
  const damageEvents = [];
  const killedEvents = [];
  const lootDrops = [];
  bus.on('combat:damage', (payload) => damageEvents.push(payload));
  bus.on('entity:killed', (payload) => killedEvents.push(payload));
  bus.on('loot:drop', (payload) => lootDrops.push(payload));
  return { sim, state, bus, player, damageEvents, killedEvents, lootDrops, combat: sim.registry.get('combat') };
}

function withLootShardsEnabled(fn) {
  const prior = { enabled: MASSLINE2_FLAGS.enabled, lootShards: MASSLINE2_FLAGS.lootShards };
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.lootShards = true;
  try { return fn(); }
  finally {
    MASSLINE2_FLAGS.enabled = prior.enabled;
    MASSLINE2_FLAGS.lootShards = prior.lootShards;
  }
}

function shardDropsOf(run) {
  return run.lootDrops.filter((drop) => (
    Array.isArray(drop.items) && drop.items.length > 0
      && drop.items.every((item) => item && item.commodityId)
  ));
}

function playerHit(run, target, damage) {
  return run.combat.onHit({
    targetId: target.id,
    ownerId: run.player.id,
    damage,
    damageType: 'kinetic',
    pos: { x: target.pos.x, z: target.pos.z },
    weaponId: 'wpn_pulse_laser_s',
  });
}

function lethalPlayerHit(run, target) {
  return playerHit(run, target, 1000);
}

function resolveCustomCraftContact(run, a, b) {
  const dx = b.pos.x - a.pos.x;
  const dz = b.pos.z - a.pos.z;
  const dist = Math.hypot(dx, dz);
  return run.sim.registry.get('physics').resolvePair(a, b, dist, dx, dz, run.bus, run.state);
}

function rematerializeThroughSavedWorldRecord(run, entity, recordId) {
  entity.homeSectorId = SECTOR;
  entity.data = entity.data || {};
  entity.data.worldRecordId = recordId;
  entity.data.homeSectorId = SECTOR;
  entity.data.sectorId = SECTOR;
  entity.data.durable = true;
  const bag = createEmptyRecordsBag();
  const captured = captureEntityRecord(entity, {
    seed: run.state.meta.seed,
    sectorId: SECTOR,
    tick: run.state.tick,
  });
  assert.ok(captured, 'live victim produces a durable world record');
  upsertRecord(bag, captured);
  const saved = JSON.parse(JSON.stringify(serializeRecordsBag(bag)));
  const loaded = deserializeRecordsBag(saved);
  const spec = spawnSpecFromRecord(loaded.byId[captured.recordId]);
  assert.ok(spec, 'serialized world record rematerializes a live victim');
  entity.alive = false;
  return run.sim.spawn(spec);
}

test('a law-accepted incident raises heat once, through heat own mutation path', () => {
  const { state, law, changes } = boot();
  assert.equal(state.player.heat, 0);

  // Reporting to LAW is the only action the mission takes. The bus does the rest.
  const receipt = law.reportIncident(report());
  assert.equal(receipt.accepted, true);

  assert.equal(state.player.heat, INCIDENT_HEAT.byKind.payload_theft);
  assert.ok(heatLevelFor(state.player.heat) > 0, 'the player is now WANTED');
  assert.equal(changes.length, 1);
  assert.match(changes[0].reason, /law incident/);
  assert.equal(state.player.heatZone.active, true, 'the search zone follows from heat own logic');
});

test('duplicate deliveries of the same receipt never double-apply', () => {
  const { state, bus, law } = boot();
  const receipt = law.reportIncident(report());
  const after = state.player.heat;

  for (let i = 0; i < 5; i++) bus.emit('law:reportIncidentReceipt', receipt);
  // ...and a duplicate REPORT, which law answers with the same receipt, re-enters the same listener.
  for (let i = 0; i < 3; i++) law.reportIncident(report());

  assert.equal(state.player.heat, after, 'heat moved exactly once');
  assert.equal(Object.keys(state.player.heatIncidentsApplied).length, 1);
});

test('a direct second call returns already_applied rather than raising again', () => {
  const { state, law, heat: heatSys } = boot();
  const receipt = law.reportIncident(report());
  const after = state.player.heat;
  const again = heatSys.applyIncidentReceipt(receipt);
  assert.equal(again.applied, false);
  assert.equal(again.reason, 'already_applied');
  assert.equal(again.delta, 0);
  assert.equal(state.player.heat, after);
});

test('two DIFFERENT validated incidents each apply once', () => {
  const { state, law } = boot();
  law.reportIncident(report({ reportId: 'r1' }));
  const first = state.player.heat;
  law.reportIncident(report({ reportId: 'r2', causalTick: 140 }));
  assert.ok(state.player.heat > first, 'a genuinely different crime still counts');
  assert.equal(Object.keys(state.player.heatIncidentsApplied).length, 2);
});

test('a denial applies no heat and records nothing', () => {
  const { state, law, changes } = boot();
  const denial = law.reportIncident(report({ pos: { x: 90000, z: 90000 } }));
  assert.equal(denial.accepted, false);
  assert.equal(state.player.heat, 0);
  assert.equal(changes.length, 0);
  assert.equal(state.player.heatIncidentsApplied, undefined,
    'no ledger key may materialize for a crime the law refused');
});

test('heat refuses anything that is not a law-signed accepted receipt', () => {
  const { state, heat: heatSys } = boot();
  const signed = {
    accepted: true, source: 'lawSecurity', validatedWitnessedTheft: true,
    incidentReceiptId: 'law:incident:real', kind: 'payload_theft',
  };
  const forgeries = [
    [null, 'no_receipt'],
    ['law:incident:real', 'no_receipt'],
    [{ ...signed, accepted: false }, 'not_law_validated'],
    [{ ...signed, source: 'missions' }, 'not_law_validated'],
    [{ ...signed, source: undefined }, 'not_law_validated'],
    [{ ...signed, validatedWitnessedTheft: false }, 'not_witnessed'],
    [{ ...signed, incidentReceiptId: '' }, 'invalid_receipt_id'],
    [{ ...signed, incidentReceiptId: 42 }, 'invalid_receipt_id'],
  ];
  for (const [payload, reason] of forgeries) {
    const out = heatSys.applyIncidentReceipt(payload);
    assert.equal(out.applied, false, JSON.stringify(payload));
    assert.equal(out.reason, reason, JSON.stringify(payload));
  }
  assert.equal(state.player.heat, 0);
  assert.equal(state.player.heatIncidentsApplied, undefined);
});

test('an unpriced but validated incident kind still raises the fallback, never nothing', () => {
  const { state, law } = boot();
  const receipt = law.reportIncident(report({ kind: 'some_future_crime' }));
  assert.equal(receipt.accepted, true);
  assert.equal(state.player.heat, INCIDENT_HEAT.fallback);
  assert.equal(INCIDENT_HEAT.byKind.some_future_crime, undefined, 'deliberately unpriced');
});

test('the applied ledger survives a save reload, so a replayed receipt is still refused', () => {
  const { state, law } = boot();
  const receipt = law.reportIncident(report());
  const heatAfter = state.player.heat;

  // The save owner serializes state.player wholesale (clonePlain minus cargo), so a JSON round-trip
  // of the player record is a faithful stand-in for the real save boundary.
  const savedPlayer = JSON.parse(JSON.stringify(state.player));
  assert.deepEqual(Object.keys(savedPlayer.heatIncidentsApplied), [receipt.incidentReceiptId]);

  const reloaded = boot();
  reloaded.state.player.heat = savedPlayer.heat;
  reloaded.state.player.heatIncidentsApplied = savedPlayer.heatIncidentsApplied;

  const replay = reloaded.heat.applyIncidentReceipt(receipt);
  assert.equal(replay.applied, false);
  assert.equal(replay.reason, 'already_applied');
  assert.equal(reloaded.state.player.heat, heatAfter, 'reload + retry must not double-charge');
});

test('all accepted incident ids remain spent beyond 32 receipts and across reload', () => {
  const run = boot();
  const receipts = Array.from({ length: 33 }, (_, index) => ({
    accepted: true,
    source: 'lawSecurity',
    validatedWitnessedTheft: true,
    incidentReceiptId: `law:incident:retained:${index}`,
    kind: 'payload_theft',
  }));
  for (const receipt of receipts) {
    assert.equal(run.heat.applyIncidentReceipt(receipt).applied, true);
  }
  assert.equal(Object.keys(run.state.player.heatIncidentsApplied).length, 33,
    'exactly-once history cannot evict the oldest durable receipt');

  const savedPlayer = JSON.parse(JSON.stringify(run.state.player));
  const reloaded = boot();
  reloaded.state.player.heat = savedPlayer.heat;
  reloaded.state.player.heatIncidentsApplied = savedPlayer.heatIncidentsApplied;
  const replay = reloaded.heat.applyIncidentReceipt(receipts[0]);

  assert.equal(replay.applied, false);
  assert.equal(replay.reason, 'already_applied');
  assert.equal(Object.keys(reloaded.state.player.heatIncidentsApplied).length, 33);
  run.sim.dispose();
  reloaded.sim.dispose();
});

test('the incident path does not disturb heat existing sources or decay', () => {
  const { sim, state, law } = boot();
  law.reportIncident(report());
  const raised = state.player.heat;
  assert.ok(raised > 0);

  // Escape the search zone: heat's own decay must still run untouched.
  const player = state.entities.get(state.playerId);
  player.pos.x = state.player.heatZone.center.x + state.player.heatZone.radius + 5000;
  for (let i = 0; i < 400; i++) sim.step();
  assert.ok(state.player.heat < raised, 'the escape path still lowers heat');

  // ...and the spent incident is still spent: decaying to clean does not re-arm the crime.
  const receipt = law.reportIncident(report());
  const before = state.player.heat;
  assert.equal(receipt.accepted, true);
  assert.equal(state.player.heat, before);
});

test('killing a clean generic ship immediately crosses WANTED', () => {
  const { state, bus, changes } = boot();

  // This is the exact class combat emits for civilian traffic without an authored shipClass.
  bus.emit('entity:killed', {
    id: 404,
    killerId: state.playerId,
    type: 'ship',
    victimClass: 'ship',
    factionId: 'faction_free',
    factionLawful: false,
  });

  assert.ok(state.player.heat >= WANTED_THRESHOLD,
    `clean hauler kill heat ${state.player.heat} must cross WANTED ${WANTED_THRESHOLD}`);
  assert.ok(heatLevelFor(state.player.heat) > 0);
  assert.equal(state.player.heatZone.active, true);
  assert.equal(changes.length, 1, 'threshold crossing emits one immediate HUD update');
  assert.match(changes[0].reason, /piracy kill \(ship\)/);
});

test('authored civilian hull classes each cross WANTED when clean', () => {
  for (const victimClass of ['frigate', 'hauler', 'freighter']) {
    const { sim, state, bus } = boot();
    bus.emit('entity:killed', {
      id: `civilian-${victimClass}`,
      killerId: state.playerId,
      type: 'ship',
      victimClass,
      factionId: 'faction_free',
      factionLawful: false,
      targetHostileToPlayer: false,
    });

    assert.ok(state.player.heat >= WANTED_THRESHOLD,
      `clean ${victimClass} kill heat ${state.player.heat} must cross WANTED ${WANTED_THRESHOLD}`);
    sim.dispose();
  }
});

test('generic ship pricing does not criminalize a hostile-faction kill', () => {
  const { state, bus } = boot();
  state.factions.faction_reach = { aggro: true };

  bus.emit('entity:killed', {
    id: 405,
    killerId: state.playerId,
    type: 'ship',
    victimClass: 'ship',
    factionId: 'faction_reach',
    factionLawful: false,
  });

  assert.equal(state.player.heat, 0, 'legitimate hostile combat remains heat-free');
});

test('production-order combat keeps encounter kills heat-free and eligible for hostile shards', () => withLootShardsEnabled(() => {
  const run = bootCombat([lawSecurity, combat, lootShards, heat]);
  run.state.factions.faction_reach = { rep: -50, aggro: false };
  const wasp = run.sim.spawn({
    type: 'ship', team: 1, factionId: 'faction_reach', pos: { x: 80, z: 0 },
    hull: 20, hullMax: 20, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0,
    data: {
      shipClass: 'fighter',
      encounter: { owner: 'encounterDirector' },
      ai: { lawful: false, spawnContext: 'encounter' },
    },
  });

  lethalPlayerHit(run, wasp);

  assert.equal(run.damageEvents.length, 1);
  assert.equal(run.damageEvents[0].targetHostileToPlayer, true,
    'combat:damage publishes scanner canonical hostility');
  assert.equal(run.killedEvents.length, 1);
  assert.equal(run.killedEvents[0].targetHostileToPlayer, true,
    'entity:killed preserves the same canonical hostility');
  assert.equal(run.state.player.heat, 0,
    'authorized encounter defense is not piracy even before faction-wide aggro');
  assert.equal(shardDropsOf(run).length, 1,
    'the explicit hostile receipt preserves the earned shard burst');
  run.sim.dispose();
}));

test('production-order clean authored trader kill becomes WANTED and earns no hostile shards', () => withLootShardsEnabled(() => {
  const run = bootCombat([lawSecurity, combat, lootShards, heat]);
  run.state.factions.faction_free = { rep: 40, aggro: false };
  const trader = run.sim.spawn(makeEnemySpawnSpec('mule_trader', 1, { x: 80, z: 0 }, {
    startedTick: run.state.tick,
  }));

  assert.equal(trader.data.ai.archetype, 'fleeing_trader');
  assert.equal(trader.data.shipClass, 'frigate', 'exercise the authored civilian hull class');
  lethalPlayerHit(run, trader);

  assert.equal(run.damageEvents.length, 1);
  assert.equal(run.damageEvents[0].targetHostileToPlayer, false,
    'the authored trader is clean before the damage consequence listeners run');
  assert.equal(trader.data.ai.retaliationTargetId, run.player.id,
    'lawSecurity still grants the surviving victim self-defense authority');
  assert.equal(run.killedEvents.length, 1);
  assert.equal(run.killedEvents[0].targetHostileToPlayer, false,
    'the lethal receipt preserves pre-retaliation canonical hostility');
  assert.equal(run.killedEvents[0].victimClass, 'frigate');
  assert.ok(run.state.player.heat >= WANTED_THRESHOLD,
    `clean authored trader kill heat ${run.state.player.heat} must cross WANTED ${WANTED_THRESHOLD}`);
  assert.equal(shardDropsOf(run).length, 0,
    'a clean victim cannot become a hostile reward source by retaliating synchronously');
  run.sim.dispose();
}));

test('player-initiated craft contact routes through combat into clean-civilian WANTED', (t) => withLootShardsEnabled(() => {
  const previous = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  t.after(() => { COMBAT_FLAGS.weaponImpulseConsequences = previous; });
  const run = bootCombat([lawSecurity, physics, combat, lootShards, heat, collisionConsequences]);
  run.state.factions.faction_free = { rep: 40, aggro: false };
  Object.assign(run.player, {
    pos: { x: -8, z: 0 }, vel: { x: 120, z: 0 }, radius: 10, mass: 20,
  });
  const trader = run.sim.spawn(makeEnemySpawnSpec('mule_trader', 1, { x: 8, z: 0 }, {
    startedTick: run.state.tick,
  }));
  Object.assign(trader, {
    pos: { x: 8, z: 0 }, vel: { x: 0, z: 0 }, radius: 10, mass: 20,
    hull: 1, hullMax: 1, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0,
  });

  resolveCustomCraftContact(run, run.player, trader);

  assert.equal(run.damageEvents.length, 1, 'physical contact reaches the sole combat damage owner');
  assert.equal(run.damageEvents[0].attackerId, run.player.id);
  assert.equal(run.damageEvents[0].targetHostileToPlayer, false,
    'clean truth is sampled before synchronous retaliation');
  assert.equal(run.killedEvents.length, 1);
  assert.equal(run.killedEvents[0].killerId, run.player.id);
  assert.ok(run.state.player.heat >= WANTED_THRESHOLD,
    `clean civilian ram heat ${run.state.player.heat} must cross WANTED ${WANTED_THRESHOLD}`);
  assert.equal(shardDropsOf(run).length, 0, 'civilian contact death cannot mint hostile rewards');
  assert.equal(run.player.hull, 200, 'player collision hull immunity remains intact');
  run.sim.dispose();
}));

test('an NPC striking a stationary player never assigns player legal causality', (t) => withLootShardsEnabled(() => {
  const previous = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  t.after(() => { COMBAT_FLAGS.weaponImpulseConsequences = previous; });
  const run = bootCombat([lawSecurity, physics, combat, lootShards, heat, collisionConsequences]);
  run.state.factions.faction_free = { rep: 40, aggro: false };
  Object.assign(run.player, {
    pos: { x: -8, z: 0 }, vel: { x: 0, z: 0 }, radius: 10, mass: 20,
  });
  run.player.data = run.player.data || {};
  run.player.data.derived = { ...(run.player.data.derived || {}), ramDamageDealtMult: 1.8 };
  const trader = run.sim.spawn(makeEnemySpawnSpec('mule_trader', 1, { x: 8, z: 0 }, {
    startedTick: run.state.tick,
  }));
  Object.assign(trader, {
    pos: { x: 8, z: 0 }, vel: { x: -120, z: 0 }, radius: 10, mass: 20,
    hull: 1, hullMax: 1, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0,
  });

  resolveCustomCraftContact(run, run.player, trader);

  assert.equal(run.damageEvents.length, 1);
  assert.equal(run.damageEvents[0].attackerId, trader.id,
    'pre-contact closing contribution, not player involvement or a fitted plate, owns the hit');
  assert.equal(run.killedEvents[0]?.killerId, trader.id);
  assert.equal(run.state.player.heat, 0, 'NPC-caused contact cannot make a stationary player WANTED');
  assert.equal(shardDropsOf(run).length, 0, 'NPC-caused contact cannot enter the player reward fountain');
  assert.equal(run.player.hull, 200, 'player collision hull immunity remains intact');
  run.sim.dispose();
}));

test('production-order multi-hit trader kill preserves first-hit clean provenance', () => withLootShardsEnabled(() => {
  const run = bootCombat([lawSecurity, combat, lootShards, heat]);
  run.state.factions.faction_free = { rep: 40, aggro: false };
  const trader = run.sim.spawn(makeEnemySpawnSpec('mule_trader', 1, { x: 80, z: 0 }, {
    startedTick: run.state.tick,
  }));

  playerHit(run, trader, 1);
  assert.equal(run.damageEvents[0].targetHostileToPlayer, false);
  assert.equal(trader.data.ai.retaliationTargetId, run.player.id,
    'the first clean hit grants self-defense authority');

  // Exercise the real failure boundary: the sub-WANTED hit chip clears on the next heat update,
  // while retaliation remains live before world capture, JSON save, and entity rematerialization.
  run.sim.step();
  assert.equal(run.state.player.heat, 0);
  const rematerialized = rematerializeThroughSavedWorldRecord(
    run,
    trader,
    'wr_test_clean_mule_trader',
  );
  assert.notEqual(rematerialized.id, trader.id);
  assert.equal(rematerialized.data.ai.retaliationTargetId, run.player.id);
  lethalPlayerHit(run, rematerialized);

  assert.deepEqual(run.damageEvents.map((event) => event.targetHostileToPlayer), [false, false],
    'later hits reuse the first accepted player-hit truth instead of retaliation-derived hostility');
  assert.equal(run.killedEvents[0].targetHostileToPlayer, false);
  assert.ok(run.state.player.heat >= WANTED_THRESHOLD,
    `multi-hit clean trader kill heat ${run.state.player.heat} must cross WANTED ${WANTED_THRESHOLD}`);
  assert.equal(shardDropsOf(run).length, 0,
    'self-defense retaliation cannot turn a clean multi-hit victim into a shard reward');
  run.sim.dispose();
}));

test('production-order multi-hit hostile keeps first-hit reward eligibility', () => withLootShardsEnabled(() => {
  const run = bootCombat([lawSecurity, combat, lootShards, heat]);
  const hostile = run.sim.spawn({
    type: 'ship', team: 1, factionId: 'faction_reach', pos: { x: 80, z: 0 },
    hull: 20, hullMax: 20, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0,
    data: {
      shipClass: 'fighter',
      encounter: { owner: 'encounterDirector' },
      ai: { lawful: false, spawnContext: 'encounter' },
    },
  });

  playerHit(run, hostile, 1);
  assert.equal(run.damageEvents[0].targetHostileToPlayer, true);
  run.sim.step();
  const rematerialized = rematerializeThroughSavedWorldRecord(
    run,
    hostile,
    'wr_test_hostile_fighter',
  );
  assert.notEqual(rematerialized.id, hostile.id);
  lethalPlayerHit(run, rematerialized);

  assert.deepEqual(run.damageEvents.map((event) => event.targetHostileToPlayer), [true, true],
    'retaliation bookkeeping cannot erase genuine first-hit hostility');
  assert.equal(run.killedEvents[0].targetHostileToPlayer, true);
  assert.equal(run.state.player.heat, 0);
  assert.equal(shardDropsOf(run).length, 1,
    'a genuine hostile-at-first-hit remains eligible for its shard burst');
  run.sim.dispose();
}));

test('player provenance recomputes for a replacement player identity on the same live victim', () => {
  const run = bootCombat([lawSecurity, combat, heat]);
  const trader = run.sim.spawn(makeEnemySpawnSpec('mule_trader', 1, { x: 80, z: 0 }, {
    startedTick: run.state.tick,
  }));

  playerHit(run, trader, 1);
  assert.equal(run.damageEvents[0].targetHostileToPlayer, false);

  const replacementPlayer = run.sim.spawn({
    type: 'ship', team: 0, factionId: 'faction_free', pos: { x: 0, z: 20 },
    hull: 200, hullMax: 200, radius: 8,
  });
  run.state.playerId = replacementPlayer.id;
  trader.data.encounter = { owner: 'replacement-player-control' };
  run.combat.onHit({
    targetId: trader.id,
    ownerId: replacementPlayer.id,
    damage: 1,
    damageType: 'kinetic',
    pos: { x: trader.pos.x, z: trader.pos.z },
    weaponId: 'wpn_pulse_laser_s',
  });

  assert.deepEqual(run.damageEvents.map((event) => event.targetHostileToPlayer), [false, true],
    'a new player identity recomputes truth instead of inheriting the prior player record');
  run.sim.dispose();
});

test('durable provenance does not leak into a changed-seed New Game identity', () => {
  const run = bootCombat([lawSecurity, combat, heat]);
  const trader = run.sim.spawn(makeEnemySpawnSpec('mule_trader', 1, { x: 80, z: 0 }, {
    startedTick: run.state.tick,
  }));

  playerHit(run, trader, 1);
  assert.equal(run.damageEvents[0].targetHostileToPlayer, false);
  assert.ok(trader.data.ai.playerFirstHitTruth, 'first run writes the durable AI receipt');

  const nextSeed = SEED + 1;
  run.state.meta.seed = nextSeed;
  run.bus.emit('game:newGame', { seed: nextSeed });
  trader.data.encounter = { owner: 'new-run-hostile-control' };
  playerHit(run, trader, 1);

  assert.deepEqual(run.damageEvents.map((event) => event.targetHostileToPlayer), [false, true],
    'the new run identity recomputes truth instead of accepting a stale durable receipt');
  run.sim.dispose();
});

test('non-player damage never seeds player legal or reward provenance', () => {
  const run = bootCombat();
  const npc = run.sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_scn', pos: { x: 40, z: 0 },
    hull: 100, hullMax: 100,
  });
  const trader = run.sim.spawn(makeEnemySpawnSpec('mule_trader', 1, { x: 80, z: 0 }, {
    startedTick: run.state.tick,
  }));

  run.combat.onHit({
    targetId: trader.id,
    ownerId: npc.id,
    damage: 1,
    damageType: 'kinetic',
    pos: { x: trader.pos.x, z: trader.pos.z },
    weaponId: 'wpn_pulse_laser_s',
  });
  trader.data.encounter = { owner: 'player-hostile-after-npc-hit' };
  playerHit(run, trader, 1);

  assert.deepEqual(run.damageEvents.map((event) => event.targetHostileToPlayer), [false, true],
    'the first player hit reads current truth even when an NPC damaged the object first');
  run.sim.dispose();
});

test('production combat marks a neutral generic ship clean and its kill crosses WANTED', () => {
  const run = bootCombat();
  run.state.factions.faction_free = { rep: 40, aggro: false };
  const neutral = run.sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_free', pos: { x: 80, z: 0 },
    hull: 20, hullMax: 20, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0,
    data: {},
  });

  lethalPlayerHit(run, neutral);

  assert.equal(run.damageEvents[0].targetHostileToPlayer, false);
  assert.equal(run.killedEvents[0].targetHostileToPlayer, false);
  assert.ok(run.state.player.heat >= WANTED_THRESHOLD,
    `neutral generic kill heat ${run.state.player.heat} must cross WANTED ${WANTED_THRESHOLD}`);
  assert.ok(heatLevelFor(run.state.player.heat) > 0);
  run.sim.dispose();
});

test('same heat instance resets burst and emit clocks across New Game and load rewinds', () => {
  const { state, bus, changes } = boot();
  const hit = () => bus.emit('combat:damage', {
    attackerId: state.playerId,
    targetId: 404,
    factionId: 'faction_free',
    factionLawful: false,
    targetHostileToPlayer: false,
    applied: 1,
  });

  const rewindAndHit = (event, oldTime) => {
    state.simTime = oldTime;
    for (let i = 0; i < 5; i++) hit();
    bus.emit('heat:clear', { reason: `${event} fixture reset` });
    state.simTime = 0;
    const changesBeforeRewind = changes.length;
    bus.emit(event, {});
    hit();
    assert.equal(state.player.heat, 0.012,
      `${event} must not inherit a capped burst from future simTime`);
    assert.equal(changes.length, changesBeforeRewind + 1,
      `${event} must not throttle a new-run HUD update behind the old clock`);
  };

  rewindAndHit('game:started', 100);
  rewindAndHit('save:loaded', 200);
});

test('faction de-escalation is heat-neutral while authored escalation remains active', () => {
  const { state, bus } = boot();

  bus.emit('faction:aggro', { factionId: 'faction_reach', isAggro: false });
  assert.equal(state.player.heat, 0, 'leaving aggro cannot create WANTED heat');

  bus.emit('faction:aggro', { factionId: 'faction_reach' });
  assert.equal(state.player.heat, 0.2, 'legacy authored escalation without isAggro still raises heat');
});
