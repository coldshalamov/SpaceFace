import assert from 'node:assert/strict';
import test from 'node:test';

import GOLD_ASTEROID from '../src/data/encounters/357-rare-gold-asteroid.js';
import MERCHANT_PRINCE from '../src/data/encounters/358-rare-merchant-prince.js';
import GHOST_SHIP from '../src/data/encounters/359-rare-ghost-ship.js';
import DRIFTER_MIGRATION from '../src/data/encounters/360-rare-drifter-migration.js';
import DOUBLE_WRECK from '../src/data/encounters/361-rare-double-wreck.js';
import ACES_RENDEZVOUS from '../src/data/encounters/362-rare-aces-rendezvous.js';
import { ENCOUNTERS } from '../src/data/encounters/index.generated.js';
import {
  frontierRumorForEncounterPlan,
  normalizeFrontierRumorState,
} from '../src/data/frontierRumors.js';
import { SECTORS } from '../src/data/sectors.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { createSimulation } from '../src/core/sim.js';
import {
  encounterDirector,
  planEncounterShape,
  planEncounters,
} from '../src/systems/encounterDirector.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { world } from '../src/systems/world.js';

const RARES = Object.freeze([
  GOLD_ASTEROID,
  MERCHANT_PRINCE,
  GHOST_SHIP,
  DRIFTER_MIGRATION,
  DOUBLE_WRECK,
  ACES_RENDEZVOUS,
]);

test('the six Plan 28 entries are low-rate ordinary planner shapes with stable real-target rumors', () => {
  assert.deepEqual(RARES.map((shape) => shape.id), [
    'rare_gold_asteroid',
    'rare_merchant_prince',
    'rare_ghost_ship',
    'rare_drifter_migration',
    'rare_double_wreck',
    'rare_aces_rendezvous',
  ]);

  for (const shape of RARES) {
    assert.equal(ENCOUNTERS[shape.id], shape, `${shape.id} is in the browser/Electron static catalog`);
    assert.equal(shape.rare, true);
    assert.ok(shape.weight > 0 && shape.weight < 0.08, `${shape.id} keeps a genuinely low planner weight`);
    assert.ok(shape.cooldownS >= 86_400, `${shape.id} cannot be farmed during a normal run`);
    assert.equal(shape.script, 'selfRegistered');
    assert.ok(shape.rareRumor?.kind && shape.rareRumor?.text);

    const reachable = reachableZone(shape);
    assert.ok(reachable, `${shape.id} has a production world zone without an external/debug gate`);
    const itemA = planEncounterShape(shape, reachable.zone, reachable.sectorId, 3, 0, () => 0.37);
    const itemB = planEncounterShape(shape, reachable.zone, reachable.sectorId, 3, 0, () => 0.37);
    assert.deepEqual(itemA, itemB, `${shape.id} composition and anchor are deterministic`);

    const rumorA = frontierRumorForEncounterPlan({
      seed: 28_000_001,
      dayIndex: 3,
      sectorId: reachable.sectorId,
      item: itemA,
      shape,
    });
    const rumorB = frontierRumorForEncounterPlan({
      seed: 28_000_001,
      dayIndex: 3,
      sectorId: reachable.sectorId,
      item: itemB,
      shape,
    });
    assert.deepEqual(rumorA, rumorB, `${shape.id} rumor never consumes ambient RNG`);
    assert.equal(rumorA.targetId, itemA.encounterId);
    assert.equal(rumorA.targetShapeId, shape.id);
    const offset = Math.hypot(
      rumorA.bearingCenter.x - itemA.zoneCenter.x,
      rumorA.bearingCenter.z - itemA.zoneCenter.z,
    );
    assert.ok(offset > 0 && offset < rumorA.radius,
      `${shape.id} exposes an approximate ring which still contains its physical target`);

    const control = {
      ...shape,
      id: `control_${shape.id}`,
      rare: false,
      weight: 1,
      rareRumor: undefined,
    };
    let seeded = 0;
    const samples = 6_000;
    for (let seed = 0; seed < samples; seed++) {
      const plan = planEncounters(
        seed,
        reachable.sectorId,
        0,
        [reachable.zone],
        null,
        { [shape.id]: shape, [control.id]: control },
      );
      if (plan.some((row) => row.shapeId === shape.id)) seeded++;
    }
    const rate = seeded / samples;
    assert.ok(rate > 0.001 && rate < 0.05,
      `${shape.id} seed rate ${rate.toFixed(4)} stays uncommon but reachable`);
  }
});

test('world rumor ownership persists the exact seeded target and telegraph resolves that chain', () => {
  const route = boot(28_100_001);
  try {
    const reachable = reachableZone(GOLD_ASTEROID);
    route.state.world.currentSectorId = reachable.sectorId;
    const item = planEncounterShape(GOLD_ASTEROID, reachable.zone, reachable.sectorId, 2, 0, () => 0.41);
    const rumor = frontierRumorForEncounterPlan({
      seed: route.state.meta.seed,
      dayIndex: 2,
      sectorId: reachable.sectorId,
      item,
      shape: GOLD_ASTEROID,
    });

    route.bus.emit('frontierRumor:planned', rumor);
    const owned = route.state.world.frontierRumors.byId[rumor.id];
    assert.equal(owned.phase, 'rumored');
    assert.equal(owned.targetId, item.encounterId);
    assert.equal(owned.targetShapeId, GOLD_ASTEROID.id);

    const jsonRoundTrip = normalizeFrontierRumorState(JSON.parse(JSON.stringify(
      route.state.world.frontierRumors,
    )));
    assert.deepEqual(jsonRoundTrip.byId[rumor.id], owned,
      'the save codec retains the exact event identity and approximate-only search geometry');

    const result = request(route, GOLD_ASTEROID, item.encounterId, {
      sectorId: reachable.sectorId,
      anchor: item.zoneCenter,
      zoneType: reachable.zone.type,
    });
    assert.equal(result.ok, true);
    assert.equal(route.state.world.frontierRumors.byId[rumor.id].phase, 'resolved');
    assert.equal(route.state.world.frontierRumors.byId[rumor.id].resolution, 'rare_contact');
    assert.ok(route.state.world.frontierRumors.receipts.some((row) => (
      row.type === 'resolved' && row.rumorId === rumor.id
    )));
  } finally {
    route.sim.dispose();
  }
});

test('gold asteroid is mineable, contested, and exposes a physical 48-unit jackpot core', () => {
  const route = boot();
  try {
    request(route, GOLD_ASTEROID, 'rare-route:gold');
    const live = liveFor(route, 'rare-route:gold');
    const rock = route.state.entities.get(live.data.rockId);
    assert.equal(rock.type, 'asteroid');
    assert.equal(rock.data.typeId, 'ast_metallic');
    assert.equal(rock.data.tint, '#d7a91e');
    assert.equal(rock.data.oreHP, 760);
    assert.equal(roleEntities(route, live, 'gold_claimant').length, 2);
    assert.ok(roleEntities(route, live, 'gold_claimant').every((entity) => entity.team === 1));

    rock.alive = false;
    route.bus.emit('asteroid:destroyed', { id: rock.id, typeId: rock.data.typeId, pos: { ...rock.pos } });
    const core = entitiesByRareRole(route, 'gold_jackpot_core')[0];
    assert.ok(core && core.type === 'pickup');
    assert.equal(core.data.kind, 'cargo');
    assert.equal(core.data.commodityId, 'cmdty_ore_goldium');
    assert.equal(core.data.amount, 48);
    assert.equal(resolution(route, 'rare-route:gold').outcome, 'jackpot_core_exposed');
    const savedOutcome = route.state.story.flags.rareSpawns.completed[GOLD_ASTEROID.id];
    assert.deepEqual(JSON.parse(JSON.stringify(savedOutcome)), savedOutcome);
    assert.deepEqual(Object.keys(savedOutcome).sort(), [
      'at', 'encounterId', 'outcome', 'sectorId', 'tick', 'zoneId',
    ], 'durable rare history never serializes live entity ids or references');
  } finally {
    route.sim.dispose();
  }
});

test('Merchant Prince exposes both a live guard job and the physical heist manifests', () => {
  const guarded = boot(28_200_001);
  try {
    request(guarded, MERCHANT_PRINCE, 'rare-route:prince-guard');
    const live = liveFor(guarded, 'rare-route:prince-guard');
    assert.equal(roleEntities(guarded, live, 'merchant_prince').length, 1);
    assert.equal(roleEntities(guarded, live, 'prince_guard').length, 3);
    guarded.bus.emit('encounter:choose', { encounterId: live.id, choiceId: 'guard' });
    assert.equal(live.phase, 'guarding');
    assert.equal(live.data.raiderIds.length, 3);
    for (const id of live.data.raiderIds.slice()) killEntity(guarded, id);
    assert.equal(resolution(guarded, live.id).outcome, 'prince_guarded');
    assert.ok(guarded.grants.some((row) => row.amount === 14_000));
  } finally {
    guarded.sim.dispose();
  }

  const robbed = boot(28_200_002);
  try {
    request(robbed, MERCHANT_PRINCE, 'rare-route:prince-rob');
    const live = liveFor(robbed, 'rare-route:prince-rob');
    robbed.bus.emit('encounter:choose', { encounterId: live.id, choiceId: 'rob' });
    assert.ok(roleEntities(robbed, live, 'prince_guard').every((entity) => entity.team === 1));
    killEntity(robbed, live.data.merchantId);
    const manifests = [
      ...entitiesByRareRole(robbed, 'prince_luxury_manifest'),
      ...entitiesByRareRole(robbed, 'prince_art_manifest'),
    ];
    assert.equal(manifests.length, 2);
    assert.deepEqual(manifests.map((entity) => entity.data.commodityId).sort(), [
      'cmdty_art',
      'cmdty_luxury_goods',
    ]);
    assert.equal(resolution(robbed, live.id).outcome, 'prince_robbed');
  } finally {
    robbed.sim.dispose();
  }
});

test('ghost ship and Double Wreck carry real salvage pools and durable black-box evidence', () => {
  const ghost = boot(28_300_001);
  try {
    request(ghost, GHOST_SHIP, 'rare-route:ghost');
    const live = liveFor(ghost, 'rare-route:ghost');
    const wreck = ghost.state.entities.get(live.data.wreckId);
    assert.equal(wreck.type, 'wreck');
    assert.equal(wreck.data.coldDerelict, true);
    assert.equal(wreck.data.hailResponse, 'static_loopback');
    assert.equal(wreck.data.salvagePool.cmdty_exotic_xenium, 1);
    ghost.bus.emit('encounter:choose', { encounterId: live.id, choiceId: 'hail' });
    wreck.alive = false;
    ghost.bus.emit('entity:destroyed', { id: wreck.id, type: 'wreck' });
    assert.equal(resolution(ghost, live.id).outcome, 'black_box_recovered');
    assert.ok(ghost.state.story.persistentCargo.includes(`rare_black_box:ghost:${live.id}`));
  } finally {
    ghost.sim.dispose();
  }

  const paired = boot(28_300_002);
  try {
    request(paired, DOUBLE_WRECK, 'rare-route:double');
    const live = liveFor(paired, 'rare-route:double');
    const wrecks = live.data.wreckIds.map((id) => paired.state.entities.get(id));
    assert.equal(wrecks.length, 2);
    assert.ok(wrecks.every((wreck) => wreck.type === 'wreck' && wreck.data.lockedPair === true));
    assert.equal(wrecks[0].data.doubleWreckPartnerId, wrecks[1].id);
    assert.equal(wrecks[1].data.doubleWreckPartnerId, wrecks[0].id);
    assert.deepEqual(wrecks[0].vel, wrecks[1].vel, 'the touching bodies retain one shared drift');
    paired.bus.emit('encounter:choose', { encounterId: live.id, choiceId: 'read' });
    for (const wreck of wrecks) {
      wreck.alive = false;
      paired.bus.emit('entity:destroyed', { id: wreck.id, type: 'wreck' });
    }
    assert.equal(resolution(paired, live.id).outcome, 'both_manifests_recovered');
    assert.ok(paired.state.story.persistentCargo.includes(`rare_black_box:double-a:${live.id}`));
    assert.ok(paired.state.story.persistentCargo.includes(`rare_black_box:double-b:${live.id}`));
  } finally {
    paired.sim.dispose();
  }
});

test('Drifter migration is a seven-hull inertial spectacle and the rendezvous fields two named bounties', () => {
  const migration = boot(28_400_001);
  try {
    request(migration, DRIFTER_MIGRATION, 'rare-route:migration');
    const live = liveFor(migration, 'rare-route:migration');
    const migrants = roleEntities(migration, live, 'drifter_migrant');
    assert.equal(migrants.length, 7);
    assert.ok(migrants.every((entity) => entity.data.defId === 'ship_drifter'));
    assert.ok(migrants.every((entity) => entity.vel.x >= 18 && entity.data.intent.assistMode === 'newtonian'));
    migration.state.simTime = live.data.completeAt;
    migration.sim.registry.get('encounterDirector').update(1, migration.state);
    assert.equal(resolution(migration, live.id).outcome, 'shoal_crossed');
  } finally {
    migration.sim.dispose();
  }

  const aces = boot(28_400_002);
  try {
    request(aces, ACES_RENDEZVOUS, 'rare-route:aces');
    const live = liveFor(aces, 'rare-route:aces');
    const ships = roleEntities(aces, live, 'rendezvous_ace');
    assert.equal(ships.length, 2);
    assert.equal(new Set(ships.map((ship) => ship.data.namedAceId)).size, 2);
    assert.ok(ships.every((ship) => ship.data.bountyCr >= 6_500));
    aces.bus.emit('encounter:choose', { encounterId: live.id, choiceId: 'interrupt' });
    assert.ok(ships.every((ship) => ship.team === 1 && ship.data.ai.passive === false));
    for (const ship of ships) killEntity(aces, ship.id);
    assert.equal(resolution(aces, live.id).outcome, 'double_bounty');
    assert.deepEqual(new Set(aces.namedDefeated.map((row) => row.aceId)), new Set(live.data.aceIds));
  } finally {
    aces.sim.dispose();
  }
});

function reachableZone(shape) {
  for (const sector of SECTORS) {
    const zone = zonesForSector(sector.id).find((candidate) => shape.zoneTypes.includes(candidate.type));
    if (zone) return { sectorId: sector.id, zone };
  }
  return null;
}

function boot(seed = 28_000_028) {
  const sim = createSimulation({
    seed,
    systems: [world, encounterDirector],
    updateOrder: [world, encounterDirector],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_ceres_belt';
  const player = sim.spawn(makeShipEntitySpec('ship_kestrel', {
    team: 0,
    factionId: 'faction_free',
    isPlayer: true,
    player: state.player,
    pos: { x: 0, z: 0 },
  }));
  state.playerId = player.id;
  const resolved = [];
  const grants = [];
  const namedDefeated = [];
  bus.on('encounter:resolved', (payload) => resolved.push(structuredClone(payload)));
  bus.on('economy:grantCredits', (payload) => grants.push(structuredClone(payload)));
  bus.on('namedAce:defeated', (payload) => namedDefeated.push(structuredClone(payload)));
  return { sim, state, bus, player, resolved, grants, namedDefeated };
}

function request(route, shape, encounterId, options = {}) {
  const sectorId = options.sectorId || route.state.world.currentSectorId;
  route.state.world.currentSectorId = sectorId;
  const director = route.sim.registry.get('encounterDirector');
  const result = director.requestAuthoredEncounter({
    shapeId: shape.id,
    encounterId,
    sectorId,
    anchor: options.anchor || { x: 320, z: -180 },
    zoneType: options.zoneType || shape.zoneTypes[0],
    zoneRadius: 520,
    force: true,
  });
  assert.equal(result.ok, true, `${shape.id} request failed: ${JSON.stringify(result)}`);
  return result;
}

function liveFor(route, encounterId) {
  const live = route.state.encounterDirector.live[encounterId];
  assert.ok(live, `missing live encounter ${encounterId}`);
  return live;
}

function roleEntities(route, live, role) {
  return live.ids
    .filter((id) => live.roles[id] === role)
    .map((id) => route.state.entities.get(id))
    .filter((entity) => entity && entity.alive !== false);
}

function entitiesByRareRole(route, role) {
  return route.state.entityList.filter((entity) => (
    entity && entity.alive !== false && entity.data && entity.data.rareSpawnRole === role
  ));
}

function killEntity(route, id) {
  const entity = route.state.entities.get(id);
  assert.ok(entity, `missing entity ${id}`);
  entity.alive = false;
  route.bus.emit('entity:killed', {
    id,
    type: entity.type,
    killerId: route.player.id,
    pos: entity.pos && { ...entity.pos },
  });
  route.bus.emit('entity:destroyed', { id, type: entity.type, killerId: route.player.id });
}

function resolution(route, encounterId) {
  const receipt = route.resolved.find((row) => row.encounterId === encounterId);
  assert.ok(receipt, `missing resolution for ${encounterId}`);
  return receipt;
}
