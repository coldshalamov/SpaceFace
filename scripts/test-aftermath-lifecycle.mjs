// Current production owners by default; sparse staging must explicitly name omitted dependencies.
// node scripts/test-aftermath-lifecycle.mjs --combat-source baseline/src/systems/combat.js \
//   --damage-source /tmp/spaceface-ceres-furnace/src/combat/damage.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
function sourceArg(flag, relative) {
  const i = process.argv.indexOf(flag);
  return path.resolve(i >= 0 ? process.argv[i + 1] : path.join(root, relative));
}
const paths = {
  aftermath: sourceArg('--source', 'src/systems/aftermathWrecks.js'),
  damage: sourceArg('--damage-source', 'src/combat/damage.js'),
  combat: sourceArg('--combat-source', 'src/systems/combat.js'),
  cinder: sourceArg('--cinder-source', 'src/missions/cinderRoute.js'),
  mining: sourceArg('--mining-source', 'src/systems/mining.js'),
  coordinates: sourceArg('--coordinates-source', 'src/data/sectorCoordinates.js'),
};
const sources = Object.fromEntries(Object.entries(paths).map(([key, filename]) => {
  const content = fs.readFileSync(filename, 'utf8');
  console.log(JSON.stringify({ owner: key, filename, sha256: createHash('sha256').update(content).digest('hex') }));
  return [key, content];
}));
const stripModule = text => text.replace(/^import[\s\S]*?;\n/gm, '')
  .replace(/\bexport\s+(?=(const|function|class))/g, '')
  .replace(/export default aftermathWrecks;/, '');
const killStart = sources.combat.indexOf('  kill(t, killerId, lethal = {}) {');
const killEnd = sources.combat.indexOf('\n  beginPlayerDefeat(', killStart);
assert(killStart >= 0 && killEnd > killStart, 'extract current combat.kill, never a copied fixture');
const killMethod = sources.combat.slice(killStart, killEnd).trim().replace(/,$/, '');
// Authored corridor coordinate owner is real source; unrelated frontier catalog is a
// declared empty adapter. These cases use Charon/Io/Vesta, not frontier membership.
const coordinateContext = { FRONTIER_ORIGINS: {}, FRONTIER_SECTOR_IDS: [] };
vm.createContext(coordinateContext);
vm.runInContext(`${stripModule(sources.coordinates)}\nthis.membership = sectorMembershipAtGlobal; this.local = globalToSectorLocalForSector;`, coordinateContext, { filename: paths.coordinates });
const routeContext = {};
vm.createContext(routeContext);
vm.runInContext(`${stripModule(sources.cinder)}\nthis.retention = cinderRetentionIds; this.victimMission = cinderVictimMission; this.observeMarker = observeCinderMarker; this.stamp = stampCinderWasp;`, routeContext, { filename: paths.cinder });
const miningStart = sources.mining.indexOf('  _onShipDestroyed(p) {');
const miningEnd = sources.mining.indexOf('\n  // Default salvage contents', miningStart);
assert(miningStart >= 0 && miningEnd > miningStart, 'extract actual mining consumer');
const miningMethod = sources.mining.slice(miningStart, miningEnd).trim().replace(/,$/, '');
const hash32 = (...args) => {
  let hash = 2166136261;
  for (const char of JSON.stringify(args)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash;
};

function harness() {
  const listeners = new Map(), events = [];
  const bus = {
    on(name, fn) { listeners.set(name, [...(listeners.get(name) || []), fn]); },
    off(name, fn) { listeners.set(name, (listeners.get(name) || []).filter(item => item !== fn)); },
    emit(name, payload) {
      events.push({ name, payload });
      for (const fn of listeners.get(name) || []) fn(payload);
    },
  };
  const state = {
    playerId: 1, meta: { seed: 4242 }, tick: 3, simTime: 0, combat: {}, player: {},
    world: { currentSectorId: 'sector_charon_expanse' }, entities: new Map(), entityList: [],
  };
  let nextId = 10;
  const helpers = {
    spawnEntity(spec) {
      const entity = { ...spec, id: nextId++, alive: true };
      state.entities.set(entity.id, entity); state.entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id); if (!entity) return;
      entity.alive = false; state.entities.delete(id);
      state.entityList = state.entityList.filter(e => e !== entity);
    },
  };
  const context = {
    SECTORS: [], hash32, syncEntitySectorMembership() {},
    deferSectorEnterMaterialization: () => false, deferredEnterNow: s => s.simTime,
    validateRunState: () => ({ ok: false }), salvagePoolFromManifest: () => ({}),
    peekPendingSlam: () => null, IMPACT_TEAROFF_LAW: {}, combatFlag: () => false,
    indexedTypeScan: s => s.entityList, zoneAt: () => null, zoneThreat: () => 0,
    globalToSectorLocalForSector: coordinateContext.local, sectorMembershipAtGlobal: coordinateContext.membership,
    wreckClassById: id => ({ id, label: id }),
    WRECK_COLLIDER_PROPORTIONS: {}, normalizeCausalAftermath: () => null,
    cinderRetentionIds: routeContext.retention,
    cinderVictimMission: routeContext.victimMission,
  };
  vm.createContext(context);
  vm.runInContext(`${stripModule(sources.aftermath)}\nthis.owner = aftermathWrecks;`, context, { filename: paths.aftermath });
  const owner = context.owner; owner.init({ state, bus, helpers });
  const miningAdapters = {
    consumePendingSlam: () => null, consumeLethalBlow: () => null, peekPendingSlam: () => null,
    consumePendingSlamIfFresh: () => null, overkillNoteForKill: () => null,
    spawnFracturePieces: () => null, victimVisualFor: () => null,
    WRECK_COLLIDER_PROPORTIONS: {}, SALVAGE_TIME_DEFAULT: 8,
  };
  vm.createContext(miningAdapters);
  const onShipDestroyed = vm.runInContext(`({${miningMethod}})._onShipDestroyed`, miningAdapters, { filename: paths.mining });
  const mining = { state, bus, helpers, registry: { get: name => name === 'aftermathWrecks' ? owner : null },
    _lootToPool: () => ({ cmdty_scrap_metal: 3 }), _onShipDestroyed: onShipDestroyed };
  bus.on('entity:killed', payload => mining._onShipDestroyed(payload));

  // No copied damage or kill code. These are unrelated simulation ports only; arithmetic,
  // alive transition, synchronous event order, marker ownership and persistence are production.
  const adapters = Object.fromEntries(['isCeresWorkfleetHardware', 'selectHitSubsystem',
    'syncCombatantBounds', 'damageSubsystem', 'appendCombatTrace', 'publishHitstunImpulse',
    'recordImpulseProvenance', 'signedHitSide', 'isHostileToPlayer', 'readPlayerFirstHitTruth',
    'writePlayerFirstHitTruth', 'wardScreenTarget', 'deliverPhysicalImpulseDetailed',
    'isEnvironmentalBody', 'isPhysicalMissionBody', 'resolvePhysicsBodySpec',
    'addEnvironmentHeat', 'crossfireDisciplineFor'].map(name => [name, () => null]));
  Object.assign(adapters, {
    ensureCombatant: () => ({ heat: 0, heatMax: 100, subsystems: {} }),
    difficultyDamageScale: () => 1, combatFlag: () => false, verbAcceptsType: () => true,
    GRAVITY_MARK_STATUS_ID: 'gravity_mark', swarmPilotHasActed: () => true,
    currentPlayerRewardIdentity: () => 'player-1', missionOwnsReward: () => false,
    runOwnsReward: () => false, massline2Flag: () => false,
    buildKillPresentationReceipt: () => ({}), killImpactorId: () => null,
    createVictimRewardRng: () => () => 0.5,
  });
  vm.createContext(adapters);
  vm.runInContext(`${stripModule(sources.damage)}\nthis.makeDamage = createDamageRouter;`, adapters, { filename: paths.damage });
  const kill = vm.runInContext(`({${killMethod}}).kill`, adapters, { filename: paths.combat });
  const combat = { state, bus, helpers, kill, rollLoot: () => ({ credits: 0, items: [] }) };
  const damage = adapters.makeDamage({ state, bus, helpers, catalog: { damageModel: {
    channelOrder: ['kinetic'], shieldMultipliers: {}, armorMultipliers: {}, hullMultipliers: {}, subsystemShare: 0,
  } } }, { schedule() {} }, { onKill: (target, killerId, lethal) => combat.kill(target, killerId, lethal) });
  const hit = (entity, amount) => damage({ attackerId: 1, targetId: entity.id,
    packet: { channels: { kinetic: amount }, flags: { allowAnyTarget: true, ignoreFriendlyFire: true } },
    origin: { kind: 'bomb', id: 'bomb_frag' } });
  function createWreck(data = {}, requireBody = true, stamp = true) {
    const victim = helpers.spawnEntity({ type: 'ship', hull: 1, hullMax: 1,
      pos: { x: 9000 + nextId, z: 28000 }, vel: { x: 0, z: 0 }, mass: 10, radius: 7,
      data: { defId: 'ship_wasp', name: 'Cinder Wasp', ...data } });
    const mission = [...(state.missions?.active || []), state.missions?.cinderRetry]
      .find(row => row?.params?.cinderTargetOwnerId === victim.data.missionId);
    if (mission && stamp) routeContext.stamp(mission, victim, victim.data.missionTargetSlot);
    const result = hit(victim, 1); assert.equal(result.ok, true);
    const marker = state.aftermathWrecks.bySector.sector_charon_expanse.find(m => m.victimId === victim.id);
    assert(marker); const wreck = state.entities.get(owner._spawned.get(marker.markerId));
    if (requireBody) assert(wreck, 'actual damage→combat.kill→aftermath pipeline produced the real hull');
    return { victim, marker, wreck };
  }
  function restore(snapshot = owner.serialize()) {
    state.entityList = []; state.entities.clear();
    owner.deserialize(snapshot); bus.emit('save:loaded', {});
    return state.entityList.filter(e => e.alive && e.type === 'wreck' && e.data?.markerId);
  }
  const count = name => events.filter(event => event.name === name).length;
  return { owner, state, bus, helpers, mining, events, hit, createWreck, restore, count };
}

let passed = 0;
function test(name, body) { body(); passed++; console.log(`PASS ${name}`); }

test('actual damage and combat.kill retire the same bound hull once, before Continue', () => {
  const h = harness(), { marker, wreck } = h.createWreck();
  const order = [];
  h.bus.on('combat:damage', p => {
    if (p.targetId !== wreck.id) return;
    order.push('damage'); assert.equal(wreck.alive, true); assert.equal(wreck.hull, 0);
  });
  h.bus.on('aftermathWreck:retired', p => {
    order.push('retired'); assert.equal(p.markerId, marker.markerId); assert.equal(p.reason, 'destroyed');
    assert.equal(wreck.alive, false); assert.equal(h.state.entities.get(wreck.id), wreck);
  });
  h.bus.on('entity:killed', p => { if (p.id === wreck.id) order.push('killed-tail'); });
  assert.equal(h.hit(wreck, 1).ok, true);
  assert.deepEqual(order, ['damage', 'retired', 'killed-tail']);
  h.bus.emit('entity:killed', { id: wreck.id, type: 'wreck' });
  h.bus.emit('entity:destroyed', { id: wreck.id, type: 'wreck', entity: wreck });
  assert.equal(h.count('aftermathWreck:retired'), 1);
  assert.equal(h.count('aftermathWreck:completed'), 0);
  assert.equal(h.count('salvage:completed'), 0);
  assert.equal(h.count('economy:grantCredits'), 0);
  assert.equal(h.restore().length, 0);
  assert.equal(h.restore().length, 0);
});

test('real partial damage, full pose, motion and depleted salvage survive Continue twice', () => {
  const h = harness(), { wreck } = h.createWreck();
  assert.equal(h.hit(wreck, 0.75).ok, true);
  wreck.pos = { x: 9230, z: 28130 }; wreck.vel = { x: 4, z: -2 };
  wreck.rot = 0.4; wreck.pitch = 0.2; wreck.bank = -0.3; wreck.angVel = 0.5;
  wreck.data.salvagePool.cmdty_scrap_metal = 1;
  for (let i = 0; i < 2; i++) {
    const [returned] = h.restore(); assert(returned);
    assert.equal(returned.hull, 0.25); assert.equal(returned.hullMax, 1);
    assert.equal(returned.pos.x, 9230); assert.equal(returned.vel.z, -2);
    assert.equal(returned.rot, 0.4); assert.equal(returned.pitch, 0.2);
    assert.equal(returned.bank, -0.3); assert.equal(returned.angVel, 0.5);
    assert.equal(returned.data.salvagePool.cmdty_scrap_metal, 1);
  }
});

test('live spoof, cull, wrong generation and same-id impostor do not retire the marker', () => {
  for (const kind of ['alive', 'cull', 'wrong-payload-body', 'same-id-impostor']) {
    const h = harness(), { wreck, marker } = h.createWreck();
    let entity = wreck;
    if (kind === 'cull') {
      h.bus.emit('sector:exit', { sectorId: marker.sectorId });
      wreck.alive = false;
      h.bus.emit('entity:destroyed', { id: wreck.id, type: 'wreck', entity: wreck });
    } else {
      if (kind === 'wrong-payload-body') { wreck.hull = 0; wreck.alive = false; }
      if (kind === 'same-id-impostor') {
        entity = { ...wreck, alive: false, hull: 0, data: { ...wreck.data } };
        h.state.entities.set(wreck.id, entity);
      }
      h.bus.emit('entity:killed', { id: wreck.id, type: 'wreck',
        ...(kind === 'wrong-payload-body' ? { entity: { ...wreck } } : {}) });
    }
    assert.equal(h.count('aftermathWreck:retired'), 0, kind);
    assert.equal(h.state.aftermathWrecks.bySector[marker.sectorId].length, 1, kind);
    if (kind === 'alive' || kind === 'cull') assert.equal(h.restore().length, 1, kind);
  }
});

test('wrong owner, wrong provenance and missing binding reject forged death', () => {
  for (const kind of ['owner', 'provenance', 'unbound']) {
    const h = harness(), { wreck, marker } = h.createWreck();
    wreck.hull = 0; wreck.alive = false;
    if (kind === 'owner') wreck.data.persistenceOwner = 'foreignOwner';
    if (kind === 'provenance') wreck.data.provenance.markerId = 'foreignMarker';
    if (kind === 'unbound') h.owner._spawned.delete(marker.markerId);
    h.bus.emit('entity:killed', { id: wreck.id, type: 'wreck' });
    assert.equal(h.count('aftermathWreck:retired'), 0, kind);
    assert.equal(h.state.aftermathWrecks.bySector[marker.sectorId].length, 1, kind);
  }
});

test('duplicate durable marker rows cannot recreate a killed hull', () => {
  const h = harness(), { marker, wreck } = h.createWreck();
  h.state.aftermathWrecks.bySector[marker.sectorId].push(JSON.parse(JSON.stringify(marker)));
  h.state.aftermathWrecks.bySector.other_sector = [{ ...JSON.parse(JSON.stringify(marker)), sectorId: 'other_sector' }];
  h.hit(wreck, 1);
  assert.equal(h.count('aftermathWreck:retired'), 1);
  assert.equal(Object.values(h.state.aftermathWrecks.bySector).flat().length, 0);
  assert.equal(h.restore().length, 0);
});

test('earlier malformed duplicate bucket cannot block a genuine canonical death', () => {
  const h = harness(), { marker, wreck } = h.createWreck();
  h.state.aftermathWrecks.bySector = {
    malformed_first: [{ ...JSON.parse(JSON.stringify(marker)), sectorId: 'not_this_bucket' }],
    [marker.sectorId]: [marker],
  };
  h.hit(wreck, 1);
  assert.equal(h.count('aftermathWreck:retired'), 1);
  assert.equal(Object.values(h.state.aftermathWrecks.bySector).flat().length, 0);
  assert.equal(h.restore().length, 0);
});

test('ordinary salvage stays its own once-only completed receipt, never a destroyed fact', () => {
  const h = harness(), { marker, wreck } = h.createWreck();
  const receipt = { wreckId: wreck.id, markerId: marker.markerId, loot: {} };
  h.bus.emit('salvage:completed', receipt); h.bus.emit('salvage:completed', receipt);
  assert.equal(h.count('aftermathWreck:completed'), 1);
  assert.equal(h.count('aftermathWreck:retired'), 0);
  wreck.alive = false; assert.equal(h.restore().length, 0);
});

test('one real salvage consumes duplicate canonical and malformed rows without another receipt or returned hull', () => {
  const h = harness(), { marker, wreck } = h.createWreck();
  h.state.aftermathWrecks.bySector = {
    malformed_first: [{ ...structuredClone(marker), sectorId: 'not_this_bucket' }],
    [marker.sectorId]: [marker, structuredClone(marker)],
    other_sector: [{ ...structuredClone(marker), sectorId: 'other_sector' }],
  };
  const receipt = { wreckId: wreck.id, markerId: marker.markerId, loot: {} };
  h.bus.emit('salvage:completed', receipt); h.bus.emit('salvage:completed', receipt);
  assert.equal(h.count('aftermathWreck:completed'), 1);
  assert.equal(h.count('aftermathWreck:retired'), 0);
  assert.equal(Object.values(h.state.aftermathWrecks.bySector).flat().length, 0);
  wreck.alive = false; assert.equal(h.restore().length, 0);
});

test('saved explicit zero is unavailable without fabricating kill, legacy absence stays one', () => {
  for (const hull of [0, -10, undefined]) {
    const h = harness(), { marker } = h.createWreck(); const saved = h.owner.serialize();
    const row = saved.bySector[marker.sectorId][0];
    if (hull === undefined) { delete row.wreckHull; delete row.wreckHullMax; }
    else { row.wreckHull = hull; row.wreckHullMax = 1; }
    const bodies = h.restore(saved);
    assert.equal(bodies.length, hull === undefined ? 1 : 0);
    if (bodies.length) assert.equal(bodies[0].hull, 1);
    assert.equal(h.count('aftermathWreck:retired'), 0);
    assert.equal(h.state.aftermathWrecks.bySector[marker.sectorId].length, 1);
  }
});

test('restored body rebinds exact lifetime and can genuinely die after Continue', () => {
  const h = harness(); h.createWreck(); const [returned] = h.restore();
  assert(returned); h.hit(returned, 1);
  assert.equal(h.count('aftermathWreck:retired'), 1); assert.equal(h.restore().length, 0);
});

function attachCinderRoute(h) {
  const mission = { id: 'cinder-1', storyTag: 'campaign47a:b2:cinder', status: 'active',
    completedTargetSlots: [], params: { cinderRouteVersion: 1, cinderTargetOwnerId: 'cinder-1',
      cinderIssuedSlots: [], cinderMarkedWrecks: [] } };
  h.state.missions = { active: [mission] };
  h.bus.on('aftermathWreck:recorded', payload => routeContext.observeMarker({ state: h.state }, payload));
  return mission;
}

test('three genuine Cinder references survive ordinary cap pressure, save and retry', () => {
  const h = harness(), mission = attachCinderRoute(h), ids = [];
  for (let slot = 0; slot < 3; slot++) {
    mission.params.cinderIssuedSlots.push(slot);
    ids.push(h.createWreck({ missionId: mission.id, missionTargetSlot: slot }).marker.markerId);
  }
  for (let i = 0; i < 14; i++) h.createWreck();
  let records = h.state.aftermathWrecks.bySector.sector_charon_expanse;
  assert.equal(records.length, 8);
  for (const id of ids) assert(records.some(row => row.markerId === id));
  const snapshot = h.owner.serialize();
  mission.status = 'suspended'; h.state.missions = { active: [], cinderRetry: mission };
  const bodies = h.restore(snapshot); assert.equal(bodies.length, 6);
  for (const id of ids) {
    const body = bodies.find(row => row.data.markerId === id); assert(body);
    assert.equal(body.data.missionPinned, undefined); assert.equal(body.data.missionId, undefined);
    assert.equal(body.data.persistenceOwner, 'aftermathWrecks');
  }
  assert.equal(h.count('aftermathWreck:retired'), 0);
});

test('eight protected records plus three Cinder records retain only six live hulls; producer and mining both defer', () => {
  const h = harness();
  for (let i = 0; i < 8; i++) h.createWreck().marker.pinWreck = true;
  assert.equal(h.restore().length, 6);
  const mission = attachCinderRoute(h), ids = [];
  for (let slot = 0; slot < 3; slot++) {
    mission.params.cinderIssuedSlots.push(slot);
    const result = h.createWreck({ missionId: mission.id, missionTargetSlot: slot }, false);
    ids.push(result.marker.markerId); assert.equal(result.wreck, undefined);
    const plan = h.owner.immediateWreckPlan({ id: result.victim.id, type: 'ship', killerId: 1, pos: result.victim.pos });
    assert.equal(plan.deferred, true); assert.equal(plan.spec, null);
    const liveBodies = h.state.entityList.filter(e => e.alive && e.type === 'wreck');
    assert.equal(liveBodies.length, 6, 'mining did not create an anonymous fallback or shard');
  }
  const snapshot = h.owner.serialize();
  assert.equal(snapshot.bySector.sector_charon_expanse.length, 11, 'bounded existing protected overflow +3 metadata records');
  assert.equal(h.restore(snapshot).length, 6);
  for (const id of ids) assert(h.state.aftermathWrecks.bySector.sector_charon_expanse.some(m => m.markerId === id));
  assert.equal(h.count('aftermathWreck:retired'), 0); assert.equal(h.count('economy:grantCredits'), 0);
  // Free five genuine protected recovery hulls through their normal consumption owner.
  for (const body of h.state.entityList.filter(e => e.alive && e.type === 'wreck' && e.data.missionPinned).slice(0, 5)) {
    h.bus.emit('salvage:completed', { wreckId: body.id, markerId: body.data.markerId, loot: {} }); body.alive = false;
  }
  h.bus.emit('sector:enter', { sectorId: 'sector_charon_expanse' });
  const routeBodies = h.state.entityList.filter(e => e.alive && ids.includes(e.data?.markerId));
  assert.equal(routeBodies.length, 3, 'same real hulls materialize when capacity frees');
  for (const body of routeBodies) assert.equal(body.data.missionPinned, undefined);
});

test('settlement releases record-only overflow priority without inventing terminal facts', () => {
  const h = harness(); for (let i = 0; i < 8; i++) h.createWreck().marker.pinWreck = true;
  h.restore(); const mission = attachCinderRoute(h);
  for (let slot = 0; slot < 3; slot++) {
    mission.params.cinderIssuedSlots.push(slot);
    h.createWreck({ missionId: mission.id, missionTargetSlot: slot }, false);
  }
  assert.equal(h.owner.serialize().bySector.sector_charon_expanse.length, 11);
  mission.status = 'completed';
  assert.equal(h.owner.serialize().bySector.sector_charon_expanse.length, 8);
  assert.equal(h.count('aftermathWreck:retired'), 0); assert.equal(h.count('aftermathWreck:completed'), 0);
});

test('real victim provenance survives normalization and suspended restored target identity joins without optional fields', () => {
  const h = harness(), mission = attachCinderRoute(h);
  mission.params.cinderIssuedSlots = [0]; mission.status = 'suspended';
  h.state.missions = { active: [], cinderRetry: mission };
  const { marker, victim } = h.createWreck({ missionId: mission.id, identityKey: `mission:${mission.id}:0` }, true, false);
  assert.equal(victim.data.missionTargetSlot, undefined);
  assert.equal(victim.data.missionStoryTag, undefined);
  assert.equal(marker.victimMission.id, mission.id); assert.equal(marker.victimMission.slot, 0);
  assert.equal(marker.victimMission.storyTag, mission.storyTag); assert.equal(marker.victimMission.version, 1);
  const snapshot = h.owner.serialize(); h.restore(snapshot);
  const returned = h.state.aftermathWrecks.bySector[marker.sectorId][0];
  assert.deepEqual(JSON.parse(JSON.stringify(returned.victimMission)), JSON.parse(JSON.stringify(marker.victimMission)));
  for (const data of [{ missionId: 'other', identityKey: `mission:${mission.id}:0` },
    { missionId: mission.id, identityKey: `mission:${mission.id}:2` }]) {
    assert.equal(routeContext.victimMission(h.state, { data }), null, 'foreign/unissued identity has no route provenance');
  }
});

function corruptedRetentionSnapshot(h, routeCount = 1, copiesPerRoute = 1, sectorCount = routeCount) {
  const base = h.createWreck().marker, bySector = {}, missions = [];
  for (let j = 0; j < routeCount; j++) {
    const id = `snapshot-route-${j}`;
    missions.push({ id, status: 'active', storyTag: 'campaign47a:b2:cinder', params: {
      cinderRouteVersion: 1, cinderTargetOwnerId: id, cinderIssuedSlots: [0, 1, 2],
      cinderMarkedWrecks: Array.from({ length: 3 }, (_, slot) => ({ slot, markerId: `${id}:${slot}` })),
    } });
  }
  for (let sector = 0; sector < sectorCount; sector++) {
    const sectorId = `sector-corrupt-${sector}`, mission = missions[sector % routeCount];
    const rows = Array.from({ length: 8 }, (_, i) => ({ ...structuredClone(base),
      markerId: `protected-${sector}-${i}`, sectorId, pinWreck: true }));
    for (const ref of mission.params.cinderMarkedWrecks) {
      for (let i = 0; i < copiesPerRoute; i++) rows.push({ ...structuredClone(base), sectorId,
        markerId: ref.markerId, victimMission: { id: mission.id, slot: ref.slot,
          storyTag: mission.storyTag, version: 1 } });
    }
    bySector[sectorId] = rows;
  }
  h.state.missions = { active: missions };
  return { bySector, missions };
}

test('one global worksite, not three overflow rows per sector or active mission, survives serialization', () => {
  const h = harness(), { bySector } = corruptedRetentionSnapshot(h, 2);
  h.owner.deserialize({ bySector });
  for (let i = 0; i < 2; i++) {
    const snapshot = h.owner.serialize(), rows = Object.values(snapshot.bySector).flat();
    assert.equal(rows.filter(row => !row.pinWreck).length, 3);
    assert.equal(rows.length, 19); h.owner.deserialize(snapshot);
  }
});

test('duplicate retained identities across rows and sectors cannot multiply the three-record overflow', () => {
  const h = harness(), { bySector } = corruptedRetentionSnapshot(h, 1, 25, 5);
  const originalSector = Object.keys(bySector)[0];
  bySector.malformed_first = [{ ...structuredClone(bySector[originalSector][8]), sectorId: 'wrong_bucket' }];
  const malformed = bySector.malformed_first; delete bySector.malformed_first;
  h.owner.deserialize({ bySector: { malformed_first: malformed, ...bySector } });
  for (let i = 0; i < 2; i++) {
    const snapshot = h.owner.serialize(), ordinary = Object.values(snapshot.bySector).flat().filter(row => !row.pinWreck);
    assert.equal(ordinary.length, 3);
    assert.equal(new Set(ordinary.map(row => row.markerId)).size, 3);
    for (const [sectorId, rows] of Object.entries(snapshot.bySector)) {
      for (const row of rows.filter(row => !row.pinWreck)) assert.equal(row.sectorId, sectorId);
    }
    h.owner.deserialize(snapshot);
  }
  // Same repair at admission, not only on Continue.
  const bag = h.state.aftermathWrecks.bySector;
  const retainedRows = Object.values(bag).flat().filter(row => !row.pinWreck);
  bag.extra_bucket = retainedRows.map(row => ({ ...structuredClone(row), sectorId: 'extra_bucket' }));
  h.createWreck();
  const retainedIds = new Set(retainedRows.map(row => row.markerId));
  assert.equal(Object.values(bag).flat().filter(row => retainedIds.has(row.markerId)).length, 3);
});

test('invalid route evidence and cross-mission marker references never gain overflow priority', () => {
  for (const invalid of ['invalid-evidence', 'foreign-provenance', 'missing-provenance']) {
    const h = harness(), { bySector, missions } = corruptedRetentionSnapshot(h);
    if (invalid === 'invalid-evidence') missions[0].params.cinderEvidenceInvalid = true;
    else for (const row of Object.values(bySector).flat().filter(row => !row.pinWreck)) {
      if (invalid === 'foreign-provenance') row.victimMission.id = 'other-route';
      else delete row.victimMission;
    }
    h.owner.deserialize({ bySector });
    assert.equal(Object.values(h.owner.serialize().bySector).flat().filter(row => !row.pinWreck).length, 0, invalid);
    assert.equal(h.count('aftermathWreck:retired'), 0);
  }
});

test('mining legacy null/no-plan/nondeferred behavior remains physical and only true defers', () => {
  for (const plan of [null, {}, { deferred: false }, { deferred: 'true' }, { deferred: true }]) {
    const h = harness(); h.mining.registry = { get: () => ({ immediateWreckPlan: () => plan }) };
    const result = h.mining._onShipDestroyed({ id: 99, type: 'ship', pos: { x: 1, z: 2 } });
    if (plan?.deferred === true) { assert.equal(result, null); assert.equal(h.state.entityList.length, 0); }
    else { assert.equal(result.type, 'wreck'); assert.equal(h.state.entityList.length, 1); }
  }
});

test('carried real hull crosses sectors, survives Continue there, and keeps original incident retirement authority', () => {
  const h = harness(), mission = attachCinderRoute(h); mission.params.cinderIssuedSlots = [0];
  const { marker, wreck } = h.createWreck({ missionId: mission.id, missionTargetSlot: 0 });
  h.hit(wreck, 0.75); wreck.pos = { x: 20480, z: 20480 };
  wreck.vel = { x: 3, z: -2 }; wreck.pitch = 0.25; wreck.bank = -0.3;
  wreck.data.salvagePool = { cmdty_scrap_metal: 1 };
  h.bus.emit('sector:exit', { sectorId: 'sector_charon_expanse', continuous: true });
  assert.equal(h.state.world.currentSectorId, 'sector_charon_expanse', 'exit precedes current-sector update');
  assert.equal(wreck.homeSectorId, 'sector_io_reach');
  assert.equal(wreck.data.homeSectorId, 'sector_io_reach');
  assert.equal(h.owner._resolveBoundWreck(marker.markerId), wreck, 'carry did not lose exact live binding');
  assert.equal(marker.sectorId, 'sector_charon_expanse');
  assert.equal(wreck.data.provenance.sectorId, 'sector_charon_expanse');
  h.state.world.currentSectorId = 'sector_io_reach';
  h.bus.emit('sector:enter', { sectorId: 'sector_io_reach' });
  assert.equal(h.state.entityList.filter(e => e.alive && e.data?.markerId === marker.markerId).length, 1);
  for (let i = 0; i < 2; i++) {
    const [returned] = h.restore(); assert(returned);
    assert.equal(returned.homeSectorId, 'sector_io_reach'); assert.equal(returned.hull, 0.25);
    assert.equal(returned.pos.x, 20480); assert.equal(returned.vel.z, -2);
    assert.equal(returned.pitch, 0.25); assert.equal(returned.bank, -0.3);
    assert.equal(returned.data.salvagePool.cmdty_scrap_metal, 1);
    assert.equal(returned.data.provenance.sectorId, 'sector_charon_expanse');
    h.bus.emit('sector:enter', { sectorId: 'sector_charon_expanse' });
    assert.equal(h.state.entityList.filter(e => e.alive && e.data?.markerId === marker.markerId).length, 1);
  }
  const body = h.state.entities.get(h.owner._spawned.get(marker.markerId)); h.hit(body, 0.25);
  assert.equal(h.count('aftermathWreck:retired'), 1); assert.equal(h.restore().length, 0);
});

test('a live neighboring-sector hull keeps its lifetime proof on membership exit, then can genuinely die', () => {
  const h = harness(), { marker, wreck } = h.createWreck();
  h.bus.emit('sector:exit', { sectorId: marker.sectorId, continuous: true });
  assert.equal(h.owner._resolveBoundWreck(marker.markerId), wreck);
  h.hit(wreck, 1); assert.equal(h.count('aftermathWreck:retired'), 1);
  assert.equal(h.restore().length, 0);
});

test('leaving a hull behind restores it only at its physical residence, never beside the player', () => {
  const h = harness(), { marker, wreck } = h.createWreck();
  h.bus.emit('sector:exit', { sectorId: marker.sectorId, continuous: true });
  h.helpers.removeEntity(wreck.id);
  h.state.world.currentSectorId = 'sector_io_reach';
  assert.equal(h.restore().length, 0);
  h.state.world.currentSectorId = 'sector_charon_expanse';
  h.bus.emit('sector:enter', { sectorId: 'sector_charon_expanse' });
  assert.equal(h.state.entityList.filter(e => e.alive && e.data?.markerId === marker.markerId).length, 1);
  assert.equal(h.count('aftermathWreck:retired'), 0);
});

test('physical destination grouping enforces the same six-body cap across incident buckets', () => {
  const h = harness();
  const carried = [];
  for (let i = 0; i < 6; i++) {
    const result = h.createWreck(); result.marker.pinWreck = true;
    result.wreck.pos = { x: 20480 + i, z: 20480 }; carried.push(result);
  }
  h.bus.emit('sector:exit', { sectorId: 'sector_charon_expanse', continuous: true });
  h.state.world.currentSectorId = 'sector_io_reach';
  const liveBefore = h.state.entityList.filter(e => e.alive && e.type === 'wreck').length;
  const mission = attachCinderRoute(h); mission.params.cinderIssuedSlots = [0];
  // Temporarily use the production death event directly for an Io resident target;
  // createWreck's assertion intentionally names its ordinary Charon fixture bucket.
  const victim = h.helpers.spawnEntity({ type: 'ship', hull: 1, hullMax: 1,
    pos: { x: 20480, z: 20480 }, vel: { x: 0, z: 0 }, radius: 7, mass: 10, data: { missionId: mission.id, missionTargetSlot: 0 } });
  routeContext.stamp(mission, victim, 0); h.hit(victim, 1);
  const routeMarker = h.state.aftermathWrecks.bySector.sector_io_reach.find(row => row.victimId === victim.id);
  assert(routeMarker); assert.equal(h.owner._spawned.has(routeMarker.markerId), false);
  assert.equal(h.state.entityList.filter(e => e.alive && e.type === 'wreck').length, liveBefore, 'no extra anonymous fallback');
  assert.equal(h.state.entityList.filter(e => e.alive && e.data?.markerId).length, 6);
  assert.equal(h.restore().length, 6);
  assert.equal(h.state.entityList.some(e => e.alive && e.data?.markerId === routeMarker.markerId), false);
  assert.equal(h.state.aftermathWrecks.bySector.sector_charon_expanse.length, 6);
  assert.equal(h.count('aftermathWreck:retired'), 0);
});

if (process.argv.includes('--probe-cross-sector')) {
  const h = harness(), mission = attachCinderRoute(h); mission.params.cinderIssuedSlots = [0];
  const { marker, wreck } = h.createWreck({ missionId: mission.id, missionTargetSlot: 0 });
  wreck.pos = { x: 20480, z: 20480 }; // exact authored Io global origin, 5 * 4096 on both axes
  h.state.world.currentSectorId = 'sector_io_reach';
  const snapshot = h.owner.serialize();
  const bodies = h.restore(snapshot);
  console.log(JSON.stringify({ probe: 'physical-hull-carried-Charon-to-Io-Continue-in-Io',
    markerId: marker.markerId, currentSectorId: h.state.world.currentSectorId,
    savedIncidentSector: snapshot.bySector[marker.sectorId][0].sectorId,
    savedPos: snapshot.bySector[marker.sectorId][0].pos,
    bodiesAtDestination: bodies.length, savedMarkerCount: Object.values(snapshot.bySector).flat().length }));
}

console.log(`PASS ${passed} production-owner groups. Declared dependency adapters; no full native graph/browser/physics acceptance claim.`);
