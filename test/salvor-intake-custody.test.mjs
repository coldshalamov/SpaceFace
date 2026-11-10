import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { traffic } from '../src/systems/traffic.js';
import { economy } from '../src/systems/economy.js';
import { world } from '../src/systems/world.js';
import { lootShards, CIVILIAN_MANIFEST_PAYLOAD_TYPE } from '../src/systems/lootShards.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { save } from '../src/save/saveSystem.js';
import { SECTORS } from '../src/data/sectors.js';
import { insertFarActor, promoteFarActor } from '../src/world/farActorTable.js';
import { livingWorkStatusText } from '../src/data/contactHail.js';

const YARD = 'station_forge', SCRAP = 'cmdty_scrap_metal', ELEC = 'cmdty_salvage_electronics', FOOD = 'cmdty_food';
function fixture(t, { pool = { [SCRAP]: 5, [ELEC]: 2, [FOOD]: 3 }, beforeIntake } = {}) {
  const prior = { enabled: MASSLINE2_FLAGS.enabled, lootShards: MASSLINE2_FLAGS.lootShards };
  MASSLINE2_FLAGS.enabled = true; MASSLINE2_FLAGS.lootShards = true;
  const bus = createBus(); if (beforeIntake) bus.on('salvage:npcUnload', beforeIntake);
  const sim = createSimulation({ seed: 424219, bus,
    systems: [world, npcJobsRuntime, traffic, lootShards, economy, save], updateOrder: [] });
  t.after(() => { sim.dispose(); Object.assign(MASSLINE2_FLAGS, prior); });
  const state = sim.state; state.mode = 'flight'; state.settings.gameplay.physicsBackend = 'custom';
  state.world.currentSectorId = 'sector_vesta_forge';
  state.world.sectors = Object.fromEntries(SECTORS.map(s => [s.id, s]));
  state.playerId = sim.spawn({ type: 'ship', team: 0, pos: { x: -10000, z: -10000 }, hull: 100,
    radius: 6, flags: { persistent: true } }).id;
  sim.registry.get('world').enterSector('sector_vesta_forge');
  const yard = state.entityList.find(e => e.data?.stationId === YARD);
  const wreck = sim.spawn({ type: 'wreck', pos: { x: yard.pos.x + 300, z: yard.pos.z },
    radius: 9, hull: 100, flags: { persistent: true },
    data: { salvagePool: { ...pool }, salvageTimeLeft: 8, salvorNoticeAt: 0 } });
  const sys = sim.registry.get('traffic'), econ = sim.registry.get('economy'); econ.ensureMarket(YARD);
  sys.update(.25, state);
  const cutter = state.entityList.find(e => e.data?.generalSalvor
    && sim.helpers.npcJobs.get(e.data.jobId)?.job.payload.targetId === wreck.id);
  assert.ok(cutter);
  const entry = sim.helpers.npcJobs.get(cutter.data.jobId);
  cutter.pos = { x: wreck.pos.x - 20, z: wreck.pos.z }; cutter.vel = { x: 0, z: 0 };
  assert.equal(sys._onNpcJobWork({ jobId: entry.job.id, kind: 'salvor', completed: true, seq: 10,
    field: entry.job.route[1].id }), true);
  cutter.pos = { x: yard.pos.x + 60, z: yard.pos.z };
  entry.job.phase = 'unload'; entry.job.routeIndex = 0;
  const intent = { jobId: entry.job.id, kind: 'salvor', completed: true, seq: 11, destination: `yard:${YARD}` };
  const original = structuredClone(cutter.data.cargoManifest);
  const market = state.economy.markets[YARD];
  const stock = Object.fromEntries(Object.keys(pool).map(id => [id, market[id]?.stock]));
  return { sim, state, sys, econ, cutter, entry, yard, intent, original, market, stock,
    unload: () => sys._onNpcJobUnload(intent) };
}

// Focused contract adversaries stage the actual cut/berth. Native unforced travel is separate.
test('partial industrial intake keeps unsupported original cargo and truthfully holds the worker', t => {
  const h = fixture(t);
  assert.equal(h.unload(), true);
  assert.deepEqual(h.cutter.data.cargoManifest.lines, [{ commodityId: FOOD, qty: 3 }]);
  assert.equal(h.cutter.data.cargoManifest.totalQty, 3);
  assert.match(livingWorkStatusText(h.cutter, { state: h.state }), /SALVAGE HELD · 3u ABOARD · NO YARD INTAKE/);
  assert.equal(h.cutter.data.cargoManifest.manifestId, h.original.manifestId);
  assert.equal(h.cutter.data.cargoManifest.salvageIntakeGeneration, 1);
  assert.equal(h.market[SCRAP].stock, h.stock[SCRAP] + 5);
  assert.equal(h.market[ELEC].stock, h.stock[ELEC] + 2);
  assert.equal(h.market[FOOD].stock, h.stock[FOOD]);
  h.sys._maintainGeneralSalvorJobs();
  assert.equal(h.entry.job.phase, 'unload');
  assert.equal(h.sys._salvorWorkTarget(h.entry, h.cutter).blocked, true);
  assert.equal(h.unload(), false, 'unsupported remainder cannot become another receipt');
  assert.equal(h.state.economy.appliedSalvageIntakeReceipts.length, 1);
});

test('settlement callback sees reduced custody and recursive exact replay adds no stock', t => {
  const h = fixture(t); let observed = 0;
  h.sim.bus.on('economy:salvageIntakeApplied', result => {
    observed++;
    assert.equal(h.cutter.data.cargoManifest.totalQty, 3);
    assert.equal(h.market[SCRAP].stock, h.stock[SCRAP] + 5);
    assert.equal(h.econ.applyNpcSalvageIntake({ ...result, lines: h.original.lines }).duplicate, true);
    assert.equal(h.unload(), false);
  });
  assert.equal(h.unload(), true); assert.equal(observed, 1);
  assert.equal(h.market[SCRAP].stock, h.stock[SCRAP] + 5);
  assert.equal(h.market[ELEC].stock, h.stock[ELEC] + 2);
});

test('kill from settlement notification spills only the unaccepted remainder', t => {
  const h = fixture(t);
  const existing = new Set(h.state.entityList.map(e => e.id));
  h.sim.bus.on('economy:salvageIntakeApplied', () => {
    h.cutter.alive = false;
    h.sim.bus.emit('entity:killed', { id: h.cutter.id, killerId: h.state.playerId,
      type: 'ship', pos: { ...h.cutter.pos }, targetHostileToPlayer: false });
  });
  assert.equal(h.unload(), true);
  const drops = h.state.entityList.filter(e => !existing.has(e.id) && e.alive !== false && e.data?.payloadType === CIVILIAN_MANIFEST_PAYLOAD_TYPE);
  assert.equal(drops.length, 1);
  assert.deepEqual(drops[0].data.salvagePool, { [FOOD]: 3 });
  assert.equal(h.market[SCRAP].stock, h.stock[SCRAP] + 5);
  assert.equal(h.market[ELEC].stock, h.stock[ELEC] + 2);
});

test('Continue captured inside settlement callback preserves reduced hold and one receipt', t => {
  const h = fixture(t); let envelope;
  h.sim.bus.on('economy:salvageIntakeApplied', () => {
    envelope = JSON.parse(JSON.stringify(h.sim.registry.get('save').serialize('intake-callback')));
    assert.equal(h.sim.registry.get('save').loadEnvelope(envelope, 'intake-callback'), true);
  });
  const wr = h.cutter.data.worldRecordId;
  assert.equal(h.unload(), true); assert.ok(envelope);
  const restored = h.state.entityList.find(e => e.data?.worldRecordId === wr);
  assert.ok(restored); assert.equal(restored.data.cargoManifest.totalQty, 3);
  const restoredStock = h.state.economy.markets[YARD][SCRAP].stock;
  const receipt = h.state.economy.appliedSalvageIntakeReceipts[0];
  assert.equal(h.econ.applyNpcSalvageIntake(receipt).duplicate, true);
  assert.equal(h.state.economy.markets[YARD][SCRAP].stock, restoredStock);
});

test('unsupported remainder survives far shelving, saved-shelf Continue, and promotion', t => {
  const h = fixture(t); assert.equal(h.unload(), true);
  const expected = structuredClone(h.cutter.data.cargoManifest), wr = h.cutter.data.worldRecordId;
  let row = insertFarActor(h.state, h.cutter, h.state.simTime, h.sim.helpers); assert.ok(row);
  h.sim.helpers.removeEntity(h.cutter.id, { immediate: true, reason: 'virtualize' });
  h.sim.bus.emit('world:farActorShelved', { id: row.id, type: row.type, jobId: row.jobId,
    trafficRole: row.trafficRole, homeSectorId: row.homeSectorId }); h.sim.bus.flush();
  const saveOwner = h.sim.registry.get('save');
  assert.equal(saveOwner.loadEnvelope(JSON.parse(JSON.stringify(saveOwner.serialize('partial-far'))), 'partial-far'), true);
  row = h.state.world.farActors.rows.find(r => r.data?.worldRecordId === wr); assert.ok(row);
  const restored = promoteFarActor(h.state, row.id, h.sim.helpers); assert.ok(restored);
  h.sim.bus.emit('world:farActorRestored', { id: restored.id, type: row.type, jobId: row.jobId,
    trafficRole: row.trafficRole, entity: restored }); h.sim.bus.flush();
  assert.deepEqual(restored.data.cargoManifest, expected);
  assert.deepEqual(h.state.traffic.freighters.find(r => r.id === restored.id).manifest, expected);
});

test('legacy settled scrap/full hold recovery debits only original receipt then admits electronics once', t => {
  const h = fixture(t, { pool: { [SCRAP]: 5, [ELEC]: 2 } });
  const id = `salvage-intake:${h.cutter.data.worldRecordId}:${h.original.salvageSeq}:${h.original.manifestId}`;
  h.state.economy.appliedSalvageIntakeReceipts = [{ intakeId: id, yardId: YARD,
    manifestId: h.original.manifestId, lotId: h.original.lotId, scrapQty: 5, lines: h.original.lines }];
  assert.equal(h.unload(), true);
  assert.deepEqual(h.cutter.data.cargoManifest.lines, [{ commodityId: ELEC, qty: 2 }]);
  assert.equal(h.market[SCRAP].stock, h.stock[SCRAP], 'legacy settled scrap is never reapplied');
  h.sys._maintainGeneralSalvorJobs();
  assert.equal(h.cutter.data.cargoManifest.salvageIntakeHeld, undefined);
  assert.equal(h.unload(), true);
  assert.equal(h.cutter.data.cargoManifest.totalQty, 0);
  assert.equal(h.market[ELEC].stock, h.stock[ELEC] + 2);
  assert.equal(h.state.economy.appliedSalvageIntakeReceipts.length, 2);
});

test('preceding listener replacing or corrupting physical custody aborts all settlement', t => {
  for (const replace of [false, true]) {
    let h;
    h = fixture(t, { beforeIntake: () => {
      if (replace) h.cutter.data.cargoManifest = structuredClone(h.original);
      else h.cutter.data.cargoManifest.totalQty = 999;
    } });
    assert.equal(h.unload(), false);
    assert.equal(h.market[SCRAP].stock, h.stock[SCRAP]);
    assert.equal(h.market[ELEC].stock, h.stock[ELEC]);
    assert.equal(h.state.economy.appliedSalvageIntakeReceipts?.length || 0, 0);
  }
});

test('malformed acknowledgement cannot clear custody', t => {
  for (const change of [r => { r.qty++; }, r => { r.acceptedLines[0].qty = 999; },
    r => { r.acceptedLines.push({ ...r.acceptedLines[0] }); }, r => { r.manifestId = 'other'; }]) {
    const h = fixture(t);
    h.econ.applyNpcSalvageIntake = p => {
      const r = { ok: true, intakeId: p.intakeId, yardId: p.yardId, manifestId: p.manifestId,
        lotId: p.lotId, qty: 5, acceptedLines: [{ commodityId: SCRAP, qty: 5 }] };
      change(r); assert.equal(p.commitCustody(r), false); return r;
    };
    assert.equal(h.unload(), false);
    assert.deepEqual(h.cutter.data.cargoManifest, h.original);
  }
});


test('equivalent reordered cargo keys and harmless line metadata preserve exact custody', t => {
  const h = fixture(t);
  h.cutter.data.cargoManifest.lines = h.cutter.data.cargoManifest.lines.map(line => ({ qty: line.qty, commodityId: line.commodityId, seal: 'original' }));
  assert.equal(h.unload(), true);
  assert.deepEqual(h.cutter.data.cargoManifest.lines, [{ qty: 3, commodityId: FOOD, seal: 'original' }]);
});

test('same worker and repeated WORK sequence on a different finite source are different lots', t => {
  const h = fixture(t, { pool: { [SCRAP]: 5, [ELEC]: 2 } });
  assert.equal(h.unload(), true);
  const firstReceipt = structuredClone(h.state.economy.appliedSalvageIntakeReceipts[0]);
  const wr = h.cutter.data.worldRecordId;
  h.sim.helpers.npcJobs.release(h.entry.job.id);
  const next = h.sim.spawn({ type: 'wreck', pos: { x: h.yard.pos.x + 300, z: h.yard.pos.z },
    radius: 9, hull: 100, flags: { persistent: true }, data: { salvagePool: { [SCRAP]: 3 }, salvageTimeLeft: 8, salvorNoticeAt: 0 } });
  h.sim.step(.25); // advance the ordinary per-tick discovery cache, not cargo or receipt state
  h.sys._dispatchGeneralSalvors(h.state.world.currentSectorId);
  const cutter = h.state.entityList.find(e => e.alive !== false && e.data?.worldRecordId === wr);
  const entry = h.sim.helpers.npcJobs.get(cutter.data.jobId);
  assert.equal(entry.job.payload.targetId, next.id);
  cutter.pos = { x: next.pos.x - 20, z: next.pos.z }; cutter.vel = { x: 0, z: 0 };
  assert.equal(h.sys._onNpcJobWork({ jobId: entry.job.id, kind: 'salvor', completed: true, seq: 10, field: entry.job.route[1].id }), true);
  assert.deepEqual(next.data.salvagePool, {});
  assert.equal(cutter.data.cargoManifest.totalQty, 3);
  assert.notEqual(cutter.data.cargoManifest.manifestId, firstReceipt.manifestId);
  cutter.pos = { x: h.yard.pos.x + 60, z: h.yard.pos.z };
  assert.equal(h.sys._onNpcJobUnload({ ...h.intent, jobId: entry.job.id }), true);
  assert.equal(h.market[SCRAP].stock, h.stock[SCRAP] + 8);
  assert.equal(h.econ.applyNpcSalvageIntake(firstReceipt).duplicate, true);
  assert.equal(h.market[SCRAP].stock, h.stock[SCRAP] + 8);
});


test('Continue and replay of the same consumed source cannot cut or credit it again', t => {
  const h = fixture(t, { pool: { [SCRAP]: 5, [ELEC]: 2 } });
  const wr = h.cutter.data.worldRecordId, jobId = h.entry.job.id, field = h.entry.job.route[1].id;
  const saveOwner = h.sim.registry.get('save');
  assert.equal(saveOwner.loadEnvelope(JSON.parse(JSON.stringify(saveOwner.serialize('same-cut'))), 'same-cut'), true);
  h.state.settings.gameplay.physicsBackend = 'custom';
  const restored = h.state.entityList.find(e => e.alive !== false && e.data?.worldRecordId === wr);
  assert.ok(restored);
  const original = structuredClone(restored.data.cargoManifest);
  assert.equal(h.sys._onNpcJobWork({ jobId, kind: 'salvor', completed: true, seq: 10, field }), true);
  assert.deepEqual(restored.data.cargoManifest, original, 'replay only acknowledges already carried custody');
  const yard = h.state.entityList.find(e => e.data?.stationId === YARD);
  restored.pos = { x: yard.pos.x + 60, z: yard.pos.z }; restored.vel = { x: 0, z: 0 };
  assert.equal(h.sys._onNpcJobUnload(h.intent), true);
  const stock = h.state.economy.markets[YARD][SCRAP].stock;
  assert.equal(h.sys._onNpcJobWork({ jobId, kind: 'salvor', completed: true, seq: 10, field }), false);
  assert.equal(restored.data.cargoManifest.totalQty, 0);
  assert.equal(h.state.economy.markets[YARD][SCRAP].stock, stock);
});
