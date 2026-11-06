import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { cargo, addCargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { traffic } from '../src/systems/traffic.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { advance } from '../src/systems/npcJobs.js';
import { world } from '../src/systems/world.js';
import { save } from '../src/save/saveSystem.js';
import { installBreakwaterSpurSaveAdapter, serializeBreakwaterSpurState,
  deserializeBreakwaterSpurState } from '../src/features/breakwaterSpur/persistence.js';

const sectorId = 'sector_ceres_belt', siteId = 'site_breakwater_spur';
const commodityId = 'cmdty_salvage_electronics';
const clone = value => JSON.parse(JSON.stringify(value));

// Initialized fixtures, not flight/feature acceptance: real job, cargo, traffic, economy,
// world/save serializers and Rapier attachment owners perform every accepted operation.
async function boot(kind = 'defended_unload', withSave = false) {
  const native = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  const combat = { name: 'combat', init(ctx) {
    ensureCombatState(ctx.state);
    this.kernel = { attachments: createAttachmentService({ ...ctx,
      catalog: createCombatCatalog(), helpers: { ...ctx.helpers, combatPhysics: native } }) };
  } };
  const sim = createSimulation({ seed: 47, systems: [
    { ...world, update() {} }, { ...traffic, update() {} }, cargo, economy, npcJobsRuntime,
    { name: 'physics', _sg02: native, _sg02CombatPhysics: native }, combat, ...(withSave ? [save] : []),
  ] });
  const { state, registry } = sim;
  state.mode = 'flight'; state.world.currentSectorId = sectorId;
  const player = sim.spawn({ type: 'ship', hull: 100, radius: 3, mass: 5, pos: { x: -12, z: 0 } });
  state.playerId = player.id;
  const receiver = sim.spawn({ type: kind === 'consignment' ? 'station' : 'wreck',
    hull: 1000, radius: 8, mass: 1000, pos: { x: 0, z: 0 },
    physicsBody: { dynamic: false, mass: 1000, colliders: [{ kind: 'ball', radius: 8 }] },
    data: kind === 'consignment' ? { stationId: 'station_beltout', dockRadius: 90 }
      : { siteId, siteRole: 'freight_receiver' } });
  const worldRecordId = `breakwater:${siteId}:${kind}_1`;
  const source = sim.spawn({ type: kind !== 'defended_unload' ? 'wreck' : 'ship',
    hull: 100, radius: 3, mass: 18, pos: { x: 12, z: 0 },
    physicsBody: { dynamic: true, mass: 18, colliders: [{ kind: 'ball', radius: 3 }] },
    data: { worldRecordId, persistenceOwner: kind !== 'defended_unload' ? 'breakwaterSpur' : 'worldRecords', homeSectorId: sectorId } });
  const manifestId = `breakwater:${kind}:${worldRecordId}`;
  const manifest = { manifestId, lotId: manifestId,
    destinationId: kind === 'consignment' ? 'station_beltout' : siteId,
    lines: [{ commodityId, qty: 7 }], totalQty: 7, custody: { holderId: worldRecordId } };
  const owner = registry.get('traffic'), econ = registry.get('economy'), c = registry.get('cargo');
  owner._setTrafficManifest(source, null, manifest);
  const original = { entityId: source.id, generation: source.occupantGeneration, worldRecordId,
    phase: 'approach', purpose: kind, kind, status: 'in_transit' };
  let jobId;
  if (kind === 'defended_unload') {
    jobId = registry.get('npcJobsRuntime').assign(source, { kind: 'hauler', sectorId,
      route: [{ id: 'origin', pos: source.pos }, { id: 'dest:' + siteId, pos: { x: receiver.pos.x, z: receiver.pos.z - 38 } }],
      speed: 20, commissionS: .1, departS: .1, loadS: .1, approachS: .1, unloadS: 2 });
    original.jobId = jobId;
    const job = state.npcJobs.byId[jobId].job;
    // Advance the real deterministic job kernel to unload; never emit fake acceptance.
    for (let i = 0; i < 100 && job.phase !== 'unload'; i++) advance(job, .1);
    assert.equal(job.phase, 'unload');
  }
  state.world.breakwaterSpur = { charter: kind === 'consignment' ? 'bonded' : 'cooperative',
    commission: { status: 'paid' }, phase: 'operating',
    looseLoad: kind !== 'defended_unload' ? original : null,
    bonded: { bond: { status: 'posted' }, job: { status: 'open' } },
    coop: { jobs: { defend: { status: 'scheduled', haulerJobId: jobId }, supply: { status: 'open' }, scrap: { status: 'open' } }, stock: { repair: 0, fuel: 0 } },
    freight: { hauler: kind === 'defended_unload' ? original : null } };
  native.syncFromEntities([player, receiver, source]);
  const attachments = registry.get('combat').kernel.attachments;
  const request = { kind, entityId: source.id, worldRecordId, generation: source.occupantGeneration,
    receiverId: receiver.id, receiverGeneration: receiver.occupantGeneration, ...(jobId ? { jobId } : {}) };
  econ.ensureMarket('station_beltout');
  const releaseSave = withSave ? installBreakwaterSpurSaveAdapter(registry.get('save'), {
    serialize: () => serializeBreakwaterSpurState(state),
    deserialize: raw => deserializeBreakwaterSpurState(state, raw),
  }) : () => {};
  return { sim, state, native, owner, econ, c, source, receiver, player, original, manifest, request, attachments,
    receive() {
      const link = attachments.create({ defId: 'tether_standard', ownerId: player.id, targetId: source.id });
      assert.equal(link.ok, true, link.reason);
      const result = attachments.rebind(link.attachment.id, player.id,
        { defId: 'attachment_salvage_clamp', ownerId: receiver.id, targetId: source.id, controllerId: null });
      assert.equal(result.ok, true, result.reason);
      return result.attachment;
    },
    close() { releaseSave(); sim.dispose(); native.dispose(); },
  };
}

test('supply accepts only its opening cooperative original at a real native spur receiver, once', async () => {
  const t = await boot('supply'); try {
    assert.equal(t.c.acceptBreakwaterFreight(t.request).ok, false, 'proximity cannot receive the cartridge');
    t.receive();
    const job = t.state.world.breakwaterSpur.coop.jobs.supply;
    job.status = 'done';
    assert.equal(t.c.acceptBreakwaterFreight(t.request).ok, false);
    job.status = 'open';
    const stock = clone(t.state.world.breakwaterSpur.coop.stock), wallet = t.state.player.credits;
    let captured;
    t.sim.bus.on('cargo:breakwaterFreightAccepted', () => {
      assert.equal(t.source.data.cargoManifest.totalQty, 0);
      captured = clone(t.econ.serialize());
      assert.equal(t.c.acceptBreakwaterFreight(t.request).ok, false);
    });
    const result = t.c.acceptBreakwaterFreight(t.request);
    assert.equal(result.ok, true, result.reason);
    assert.equal(result.receipt.receiptId, 'breakwater-cargo:supply');
    assert.equal(result.receipt.destinationId, siteId);
    t.econ.deserialize(captured);
    t.owner._setTrafficManifest(t.source, null, t.manifest);
    assert.equal(t.c.acceptBreakwaterFreight(t.request).reason, 'already_accepted');
    assert.equal(t.c.getBreakwaterFreightReceipt('supply').qty, 7);
    assert.deepEqual(t.state.world.breakwaterSpur.coop.stock, stock, 'feature owns stock settlement');
    assert.equal(t.state.player.credits, wallet, 'economy owns the 160 CR award');
  } finally { t.close(); }
});

for (const kind of ['consignment', 'supply', 'defended_unload']) {
  test(`current persistence owner is authenticated for ${kind}`, async () => {
    const t = await boot(kind); try {
      if (kind !== 'defended_unload') t.receive();
      t.source.data.persistenceOwner = kind === 'defended_unload' ? 'breakwaterSpur' : 'worldRecords';
      assert.equal(t.c.acceptBreakwaterFreight(t.request).ok, false);
      t.source.data.persistenceOwner = kind === 'defended_unload' ? 'worldRecords' : 'breakwaterSpur';
      assert.equal(t.c.acceptBreakwaterFreight(t.request).ok, true);
    } finally { t.close(); }
  });
}

function readyCommission(t) {
  const row = t.state.world.breakwaterSpur;
  row.commission = { status: 'none', paidAt: null };
  row.phase = 'ready'; row.charter = 'none';
  row.sockets = { drive: { status: 'seated' }, drum: { status: 'seated' } };
  return row;
}

test('fixed commission atomically draws both materials and accepts feature stock before one reentrant Save', async () => {
  const t = await boot('defended_unload', true); try {
    const row = readyCommission(t), hold = t.state.player.cargo;
    addCargo(t.state, 'cmdty_scrap_metal', 4);
    addCargo(t.state, commodityId, 1);
    const beforeMass = hold.usedMass, beforeVolume = hold.usedVolume;
    let captured, events = 0;
    const unsub = t.sim.bus.on('cargo:changed', () => {
      events++;
      assert.equal(hold.items.cmdty_scrap_metal || 0, 0);
      assert.equal(hold.items[commodityId] || 0, 0);
      assert.equal(row.commission.status, 'paid');
      assert.deepEqual(row.coop.stock, { repair: 10, fuel: 8 });
      assert.equal(t.c.acceptBreakwaterMaterials('commission').ok, false);
      const payload = t.sim.registry.get('save').serializeData();
      captured = clone({ economy: payload.economy, feature: payload.world.breakwaterSpur, cargo: payload.cargo });
    });
    const result = t.c.acceptBreakwaterMaterials('commission');
    assert.equal(result.ok, true, result.reason);
    assert.equal(events, 1);
    assert.ok(hold.usedMass < beforeMass && hold.usedVolume < beforeVolume);
    assert.equal(captured.feature.commission.status, 'paid');
    assert.equal(captured.cargo.items[commodityId] || 0, 0);
    unsub();
    t.econ.deserialize(captured.economy);
    row.commission.status = 'none';
    addCargo(t.state, 'cmdty_scrap_metal', 4);
    addCargo(t.state, commodityId, 1);
    const before = clone(hold);
    assert.equal(t.c.acceptBreakwaterMaterials('commission').reason, 'already_accepted');
    assert.deepEqual(hold, before, 'stale feature state cannot draw the recipe again');
  } finally { t.close(); }
});

test('fixed commission refuses a short or sealed second ingredient without drawing the first', async () => {
  const t = await boot(); try {
    readyCommission(t);
    addCargo(t.state, 'cmdty_scrap_metal', 4);
    const hold = t.state.player.cargo, before = clone(hold);
    let events = 0;
    const unsub = t.sim.bus.on('cargo:changed', () => events++);
    assert.equal(t.c.acceptBreakwaterMaterials('commission').ok, false);
    assert.deepEqual(hold, before);
    assert.equal(events, 0);
    unsub();
    addCargo(t.state, commodityId, 1);
    t.state.fixtureSealed = [commodityId];
    const sealed = clone(hold);
    assert.equal(t.c.acceptBreakwaterMaterials('commission').ok, false);
    assert.deepEqual(hold, sealed);
  } finally { t.close(); }
});

test('fixed scrap job commits acceptance, pending payment and capped stock before its one cargo notification', async () => {
  const t = await boot(); try {
    addCargo(t.state, 'cmdty_scrap_metal', 8);
    const row = t.state.world.breakwaterSpur, wallet = t.state.player.credits;
    row.coop.stock.repair = 55;
    let events = 0;
    t.sim.bus.on('cargo:changed', () => {
      events++;
      assert.equal(row.coop.jobs.scrap.status, 'accepted');
      assert.deepEqual(row.pendingPayouts.scrap, { sourceId: 'breakwater:coop:scrap' });
      assert.equal(row.coop.stock.repair, 60);
      assert.equal(t.state.player.cargo.items.cmdty_scrap_metal || 0, 0);
      assert.equal(t.c.acceptBreakwaterMaterials('scrap').ok, false);
    });
    assert.equal(t.c.acceptBreakwaterMaterials('scrap').ok, true);
    assert.equal(events, 1);
    assert.equal(t.state.player.credits, wallet);
    assert.equal(t.c.acceptBreakwaterMaterials('arbitrary').ok, false);
  } finally { t.close(); }
});

test('empty unload intent cannot consume cargo, publish a receipt, pay or stock the feature', async () => {
  const t = await boot(); try {
    const wallet = t.state.player.credits;
    t.sim.bus.emit('npcjobs:unload', {});
    assert.equal(t.c.getBreakwaterFreightReceipt('defended_unload'), null);
    assert.equal(t.c.acceptBreakwaterFreight({ kind: 'defended_unload' }).ok, false);
    t.owner._setTrafficManifest(t.source, null, { ...t.manifest, lines: [], totalQty: 0 });
    assert.equal(t.c.acceptBreakwaterFreight(t.request).ok, false);
    assert.equal(t.state.player.credits, wallet);
    assert.deepEqual(t.state.world.breakwaterSpur.coop.stock, { repair: 0, fuel: 0 });
  } finally { t.close(); }
});

test('scheduled physical hauler consumes exactly its carried lot before publication and survives economy Save/Continue', async () => {
  const t = await boot(); try {
    const wallet = t.state.player.credits;
    let captured, events = 0;
    t.sim.bus.on('cargo:breakwaterFreightAccepted', () => {
      events++;
      assert.equal(t.source.data.cargoManifest.totalQty, 0);
      assert.equal(t.c.acceptBreakwaterFreight(t.request).ok, false);
      captured = { economy: clone(t.econ.serialize()), world: clone(t.sim.registry.get('world').serialize()) };
    });
    const result = t.c.acceptBreakwaterFreight(t.request);
    assert.equal(result.ok, true, result.reason);
    assert.equal(result.receipt.qty, 7);
    assert.equal(result.receipt.worldRecordId, t.request.worldRecordId);
    assert.equal(events, 1);
    assert.equal(captured.world.records.byId[t.request.worldRecordId].cargoManifest.totalQty, 0);
    t.econ.deserialize(captured.economy);
    t.owner._setTrafficManifest(t.source, null, t.manifest); // stale restored source cannot pay twice
    assert.equal(t.c.acceptBreakwaterFreight(t.request).reason, 'already_accepted');
    assert.equal(t.c.getBreakwaterFreightReceipt('defended_unload').qty, 7);
    assert.equal(t.state.player.credits, wallet);
  } finally { t.close(); }
});

test('sealed consignment needs actual receiver joint; stock and source commit before economy observers', async () => {
  const t = await boot('consignment'); try {
    assert.equal(t.c.acceptBreakwaterFreight(t.request).ok, false, 'distance alone cannot accept');
    const line = t.receive();
    const market = t.state.economy.markets.station_beltout[commodityId], before = market.stock;
    let observed = 0;
    t.sim.bus.on('economy:freightAccepted', () => {
      observed++;
      assert.equal(t.source.data.cargoManifest.totalQty, 0);
      assert.equal(t.c.getBreakwaterFreightReceipt('consignment').qty, 7);
      assert.equal(t.c.acceptBreakwaterFreight(t.request).ok, false);
      const saved = clone(t.econ.serialize());
      assert.ok(saved.committedIntents['breakwater-cargo:consignment']);
    });
    const result = t.c.acceptBreakwaterFreight(t.request);
    assert.equal(result.ok, true, result.reason);
    assert.equal(observed, 1);
    assert.equal(market.stock, before + 7);
    assert.equal(line.ownerId, t.receiver.id);
    assert.equal(t.source.alive, true, 'same original remains physically held');
    assert.equal(t.c.acceptBreakwaterFreight(t.request).ok, false);
    assert.equal(market.stock, before + 7);
  } finally { t.close(); }
});

for (const cause of ['generation', 'world-id', 'duplicate', 'dead', 'phase', 'job', 'destination',
  'manifest-owner', 'manifest-id', 'nonfinite', 'conflicting-receipt', 'tracked-lot', 'native-missing', 'receiver-life', 'terminal-record']) {
  test(`hauler refuses ${cause} without spending its real lot`, async () => {
    const t = await boot(); try {
      if (cause === 'generation') t.request.generation++;
      if (cause === 'world-id') t.request.worldRecordId += ':forged';
      if (cause === 'duplicate') t.sim.spawn({ type: 'wreck', data: { worldRecordId: t.request.worldRecordId } });
      if (cause === 'dead') t.source.alive = false;
      if (cause === 'phase') t.state.npcJobs.byId[t.request.jobId].job.phase = 'load';
      if (cause === 'job') t.request.jobId = 'job:forged';
      if (cause === 'destination') t.manifest.destinationId = 'elsewhere';
      if (cause === 'manifest-owner') t.manifest.custody.holderId = 'another-original';
      if (cause === 'manifest-id') t.manifest.manifestId = 'forged';
      if (cause === 'nonfinite') t.source.vel.x = Infinity;
      if (cause === 'conflicting-receipt') (t.state.economy.committedIntents ||= {})['breakwater-cargo:defended_unload'] = { receipt: { worldRecordId: 'foreign' } };
      if (cause === 'native-missing') t.native.records.delete(t.source.id);
      if (cause === 'receiver-life') t.request.receiverGeneration++;
      if (cause === 'terminal-record') t.state.world.records.byId[t.request.worldRecordId].alive = false;
      if (cause === 'tracked-lot') t.state.traffic.freighters.push({ id: t.source.id,
        worldRecordId: t.request.worldRecordId, manifest: { ...t.manifest, totalQty: 99 } });
      assert.equal(t.c.acceptBreakwaterFreight(t.request).ok, false, cause);
      assert.equal(t.source.data.cargoManifest.totalQty, 7);
    } finally { t.close(); }
  });
}

test('forged/stale native receiving joints and foreign extra lines refuse a sealed consignment', async () => {
  const t = await boot('consignment'); try {
    const line = t.receive();
    const generation = line.targetGeneration;
    line.targetGeneration++;
    assert.equal(t.c.acceptBreakwaterFreight(t.request).ok, false);
    line.targetGeneration = generation;
    const nativeLine = t.native.attachments.get(line.id);
    t.native.attachments.delete(line.id);
    assert.equal(t.c.acceptBreakwaterFreight(t.request).ok, false);
    t.native.attachments.set(line.id, nativeLine);
    t.state.combat.attachments.byId.foreign = { ...line, id: 'foreign', ownerId: t.player.id };
    assert.equal(t.c.acceptBreakwaterFreight(t.request).ok, false);
    assert.equal(t.source.data.cargoManifest.totalQty, 7);
  } finally { t.close(); }
});

for (const cause of ['market-refused', 'setter-refused', 'economy-conflict', 'bond-closed']) {
  test(`sealed transfer keeps its original lot when ${cause}`, async () => {
    const t = await boot('consignment'); try {
      t.receive();
      const market = t.state.economy.markets.station_beltout[commodityId], before = market.stock;
      if (cause === 'market-refused') delete t.state.economy.markets.station_beltout[commodityId];
      if (cause === 'setter-refused') t.owner._setTrafficManifest = () => false;
      if (cause === 'economy-conflict') (t.state.economy.committedIntents ||= {})['freight:breakwater-cargo:consignment'] = {
        receipt: { receiptId: 'breakwater-cargo:consignment', stationId: 'station_beltout', commodityId, qty: 7 } };
      if (cause === 'bond-closed') t.state.world.breakwaterSpur.bonded.bond.status = 'forfeited';
      assert.equal(t.c.acceptBreakwaterFreight(t.request).ok, false);
      assert.equal(t.source.data.cargoManifest.totalQty, 7);
      assert.equal(t.c.getBreakwaterFreightReceipt('consignment'), null);
      assert.equal(market.stock, before);
    } finally { t.close(); }
  });
}
