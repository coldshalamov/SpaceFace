import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createCapitalBossEncounters, observeCapitalBody } from '../src/systems/capitalBossEncounters.js';
import { CAPITAL_BOSS_ENCOUNTERS } from '../src/data/encounters/capital-boss.js';
import { LAST_ARGUMENT } from '../src/data/lastArgument.js';
import { save as saveDefinition } from '../src/save/saveSystem.js';
import { world as worldDefinition } from '../src/systems/world.js';
import { captureEntityRecord, spawnSpecFromRecord, serializeRecordsBag, deserializeRecordsBag } from '../src/world/worldRecords.js';
import { isDetachedCapitalPlate } from '../src/combat/capitalPlatePersistence.js';
import { runNewGameSimBoot } from '../src/core/newGameBoot.js';

const SECTOR = 'sector_vesta_forge';
const json = value => JSON.parse(JSON.stringify(value));
function boot(encounterId = 'capital_boss_foreman', fightId = 'plate-proof') {
  const owner = createCapitalBossEncounters({
    observe(r, s) { return { boss: observeCapitalBody(s.entities.get(r.bossId)),
      target: observeCapitalBody(s.entities.get(r.targetId)), active: false, targets: [] }; },
    spawnWing() { return []; },
  });
  const world = Object.create(worldDefinition);
  const sim = createSimulation({ seed: 939, systems: [world, owner], updateOrder: [], helpers: { routeCombatDamage() {} } });
  const { state } = sim;
  state.mode = 'flight'; state.world.currentSectorId = SECTOR;
  const player = sim.spawn({ type: 'ship', pos: { x: 300, z: 0 }, radius: 8, mass: 24, hull: 200, hullMax: 200 });
  state.playerId = player.id;
  const boss = sim.spawn({ type: 'ship', pos: { x: 10, z: 20 }, vel: { x: 2, z: -3 },
    rot: 0.7, radius: 32, mass: 420, hull: 720, hullMax: 720, flags: { persistent: true },
    homeSectorId: SECTOR, data: {} });
  const fight = owner.start({ encounterId, fightId, bossId: boss.id, targetId: player.id });
  const save = Object.create(saveDefinition);
  Object.assign(save, { state, bus: sim.bus, registry: sim.registry, helpers: sim.helpers,
    _restoring: false, _restoreSequence: 0, _lastAutosaveAt: 0, _lastAutosavePlaytime: 0 });
  return { sim, state, owner, world: sim.registry.get('world'), save, boss, player, fight };
}
function slabs(h) { return h.state.entityList.filter(e => e.alive && isDetachedCapitalPlate(e)); }
function tearAll(h) {
  h.owner._shedPlatesForAct(h.fight, 4);
  // A few authored plates are rope-only, with no act-shed fallback.
  if (h.owner._platesLive(h.fight)) for (const rec of h.fight.plates) {
    if (rec.attached) h.owner._tearPlate(h.fight, h.boss, rec, h.owner._plateSpec(h.fight, rec.id));
  }
  return slabs(h);
}
function body(e) {
  return json({ mass: e.mass, radius: e.radius, collides: e.collides, physicsBody: e.physicsBody,
    pos: { x: e.pos.x, z: e.pos.z }, vel: { x: e.vel.x, z: e.vel.z }, rot: e.rot, angVel: e.angVel,
    hull: e.hull, hullMax: e.hullMax, capitalPlate: e.data.capitalPlate,
    identityKey: e.data.identityKey, fractureVisual: e.data.fractureVisual,
    fractureVictimRadius: e.data.fractureVictimRadius, label: e.data.label,
    loot: e.data.loot, pool: e.data.salvagePool, time: e.data.salvageTimeLeft, carry: e.data._carry });
}
function continueEntities(h, data) {
  // The same real save owners/order used by Continue, without renderer/title fixtures.
  h.save._clearEntities();
  h.state.world.records = deserializeRecordsBag(data.world.records);
  h.state.restoreEnvelopeRecordIds = new Set(data.entities.persistent.map(e => e.data?.worldRecordId).filter(Boolean));
  h.save._spawnPlayer(data.entities.player);
  h.world._rematerializeSectorRecords(SECTOR, {}, 'FULL', { restoreDurableRecords: true });
  const ids = new Map();
  for (let cursor = 0; cursor < data.entities.persistent.length;) cursor = h.save._spawnPersistentEntities(
    data.entities.persistent, ids, { startIndex: cursor, clearStale: cursor === 0 });
  delete h.state.restoreEnvelopeRecordIds;
  h.owner.restore(data.capitalBoss);
  h.fight = h.state.capitalBossEncounters.fights[h.fight.fightId];
  h.boss = h.state.entities.get(ids.get(String(h.boss.id)));
  return ids;
}

test('real Foreman 85t/95t tears retain exact current bodies through repeated save/Continue seams', () => {
  const h = boot();
  try {
    const plates = tearAll(h);
    assert.deepEqual(plates.map(e => e.mass), [85, 95]);
    assert.equal(h.fight.plates.every(p => !p.attached), true);
    plates[0].pos.set(413, 0, -82); plates[0].vel.set(7, 0, -4);
    plates[0].rot = 1.2; plates[0].angVel = 0.21;
    plates[0].data.salvagePool.cmdty_scrap_metal = 1; plates[0].data.salvageTimeLeft = 3.25;
    const expected = plates.map(body);
    for (let repeat = 0; repeat < 3; repeat++) {
      const data = json(h.save.serializeData());
      const saved = data.entities.persistent.filter(isDetachedCapitalPlate);
      assert.equal(saved.length, 2, 'both original loose bodies are admitted by the save owner');
      assert.deepEqual(saved.map(body), expected);
      assert.equal(Object.values(data.world.records.byId).filter(r => r.extra?.capitalPlateSource).length, 2);
      continueEntities(h, data);
      assert.deepEqual(slabs(h).map(body), expected, 'current pool and pose never return to authored defaults');
      assert.equal(slabs(h).every(e => e.flags.persistent !== true), true, 'Continue does not pin sector salvage');
      const before = slabs(h).length;
      h.owner._shedPlatesForAct(h.fight, 4);
      assert.equal(slabs(h).length, before, 'the score never replays a tear');
      h.world._rematerializeSectorRecords(SECTOR, {}, 'FULL', { restoreDurableRecords: true });
      assert.equal(slabs(h).length, 2, 'the entity envelope and world row bind one source');
    }
  } finally { h.sim.dispose(); }
});

test('sector retirement retains exact plate recipe, remaining salvage, pose and one live carrier', () => {
  const h = boot();
  try {
    const plate = tearAll(h)[0];
    plate.data.salvagePool.cmdty_scrap_metal = 1;
    plate.data.salvageTimeLeft = 2.5; plate.data._carry = 0.75; plate.rot = 0.9; plate.angVel = -0.4;
    const expected = body(plate);
    h.world._captureSectorDurableRecords(SECTOR);
    const id = plate.data.worldRecordId;
    assert.ok(id);
    h.world._despawnEntitiesForSector(SECTOR); h.sim.bus.flush();
    assert.equal(slabs(h).length, 0, 'sector owner can retire both plates');
    assert.equal(h.state.world.records.byId[id].alive, true, 'retirement is not consumption');
    h.state.world.records = deserializeRecordsBag(json(serializeRecordsBag(h.state.world.records)));
    h.world._rematerializeSectorRecords(SECTOR, {}, 'FULL', { restoreDurableRecords: true });
    const resumed = slabs(h).find(e => e.data.worldRecordId === id);
    assert.deepEqual(body(resumed), expected);
    h.world._rematerializeSectorRecords(SECTOR, {}, 'FULL', { restoreDurableRecords: true });
    assert.equal(slabs(h).length, 2);
  } finally { h.sim.dispose(); }
});

test('lost and fully consumed plates never refill or rematerialize after Continue or sector return', () => {
  const h = boot();
  try {
    const [lost, consumed] = tearAll(h);
    h.world._captureSectorDurableRecords(SECTOR);
    const ids = [lost, consumed].map(e => e.data.worldRecordId);
    h.sim.helpers.removeEntity(lost.id, { immediate: true });
    const replacement = h.sim.spawn({ type: 'wreck', data: {}, mass: 3 });
    assert.equal(replacement.id, lost.id, 'queued destroy follows the old source, not the recycled id');
    consumed.data.salvagePool.cmdty_scrap_metal = 0; consumed.data._salvaged = true;
    h.sim.helpers.removeEntity(consumed.id, { immediate: true }); h.sim.bus.flush();
    assert.equal(ids.every(id => h.state.world.records.byId[id].outcome === 'destroyed'), true);
    const data = json(h.save.serializeData()); continueEntities(h, data);
    h.owner._shedPlatesForAct(h.fight, 4);
    h.world._rematerializeSectorRecords(SECTOR, {}, 'FULL', { restoreDurableRecords: true });
    assert.equal(slabs(h).length, 0);
  } finally { h.sim.dispose(); }
});

test('versioned plate recipes reject corruption instead of manufacturing generic salvage', () => {
  const h = boot();
  try {
    const plate = tearAll(h)[0];
    const record = captureEntityRecord(plate, { sectorId: SECTOR, seed: 939 });
    for (const mutate of [r => r.extra.capitalPlateSource.body.mass = 0,
      r => r.extra.capitalPlateSource.recordId = 'foreign',
      r => r.extra.capitalPlateSource.data.salvagePool.cmdty_scrap_metal = -1,
      r => r.extra.capitalPlateSource = null,
      r => { delete r.extra.capitalPlateSource; },
      r => r.extra.capitalPlateSource.data.salvageTimeLeft = -1,
      r => r.extra.capitalPlateSource.data.identityKey = 'capital_plate:other/stern_plate',
      r => r.extra.capitalPlateSource.data.capitalPlate.fightId = 'other',
      r => r.extra.capitalPlateSource.data._carry = -1,
      r => { r.enemyTypeId = 'dreadnought_boss'; r.isBoss = true; }]) {
      const corrupt = json(record); mutate(corrupt); assert.equal(spawnSpecFromRecord(corrupt), null);
    }
    assert.equal(spawnSpecFromRecord({ ...record, alive: false }), null);
    const ordinary = h.sim.spawn({ type: 'wreck', pos: { x: 0, z: 0 }, mass: 10, data: {} });
    assert.equal(h.save._serializeEntities().persistent.some(e => e.id === ordinary.id), false);
  } finally { h.sim.dispose(); }
});

for (const encounter of Object.values(CAPITAL_BOSS_ENCOUNTERS).filter(e => e.id !== LAST_ARGUMENT.scoreId && e.plates?.length)) {
  test(`${encounter.id}: shared plate snapshot preserves every authored body without refilling`, () => {
    const h = boot(encounter.id);
    try {
      const expected = tearAll(h).map(body);
      assert.equal(expected.length, encounter.plates.length);
      const data = json(h.save.serializeData()); continueEntities(h, data);
      assert.deepEqual(slabs(h).map(body), expected);
    } finally { h.sim.dispose(); }
  });
}

test('Swarm keeps transient arena plates and Last Argument retains its own plate lifecycle', () => {
  const h = boot('capital_boss_foreman', 'swarm:proof:w20');
  try {
    const expected = tearAll(h).map(body);
    assert.equal(expected.length, 2);
    assert.equal(slabs(h).every(e => e.homeSectorId == null), true);
    for (const plate of slabs(h)) assert.equal(captureEntityRecord(plate, { sectorId: SECTOR }), null);
    const data = json(h.save.serializeData()); continueEntities(h, data);
    assert.deepEqual(slabs(h).map(body), expected);
    h.owner.detach(h.fight.fightId);
    assert.equal(slabs(h).length, 2, 'wave detach does not steal surviving throw-mass from its arena');
    assert.equal(slabs(h).every(e => !e.flags.persistent), true);
  } finally { h.sim.dispose(); }
  const last = boot(LAST_ARGUMENT.scoreId);
  try { assert.equal(tearAll(last).length, 0); }
  finally { last.sim.dispose(); }
});

test('production New Game boot clears plates, world recipes and prior fight receipts', async () => {
  const h = boot();
  try {
    tearAll(h); h.world._captureSectorDurableRecords(SECTOR);
    await runNewGameSimBoot({ state: h.state, helpers: h.sim.helpers, bus: h.sim.bus,
      registry: h.sim.registry, opts: { seed: 940 } });
    assert.equal(slabs(h).length, 0);
    assert.equal(Object.values(h.state.world.records?.byId || {}).some(r => r.extra?.capitalPlateSource), false);
    assert.deepEqual(h.state.capitalBossEncounters.fights, {});
  } finally { h.sim.dispose(); }
});
