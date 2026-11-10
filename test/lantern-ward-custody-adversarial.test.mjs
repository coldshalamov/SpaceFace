import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createSimulation } from '../src/core/sim.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { world } from '../src/systems/world.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { lanternWardStatus } from '../src/systems/lanternWardWork.js';
import { LANTERN_WARD_RECORD_IDS as IDS, LANTERN_WARD_LAMP_SERIAL as SERIAL,
  lanternWardCanonicalAnchor } from '../src/data/lanternWardHardware.js';
import { captureEntityRecord, spawnSpecFromRecord } from '../src/world/worldRecords.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { runNewGameSimBoot } from '../src/core/newGameBoot.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { snapshotFeatureMaps, restoreFeatureMaps, applyFeatureConfigToMaps } from '../src/data/featureFlags.js';
import { lanternWardPoint } from '../src/data/lanternWardLayout.js';

const DT = 1 / 60, SECTOR = 'sector_helios_prime';

// Native authority fixtures, not evidence of an ordinary player flight or rendered route.
// The initial player/witness placement is explicit. Thereafter motion uses native forces,
// custody uses real attachments, and law uses the existing witnessed-incident authority.
async function theftFixture() {
  const seed = 7641, state = createGameState(seed);
  state.mode = 'flight'; state.world.currentSectorId = SECTOR;
  state.world.sectors[SECTOR] = { id: SECTOR, factionId: 'faction_scn', security: .9, tier: 0 };
  const recordOwner = { name: 'world', init(ctx) { this.state = ctx.state; }, upsertWorldRecord: world.upsertWorldRecord };
  const modules = { flightSlot: flightV3, physics, combat, npcJobsRuntime, spawnBudget,
    world: recordOwner, lawSecurity, cargo, economy };
  const sim = createSimulation({ state, seed,
    systems: PRODUCTION_INIT_ORDER.filter(id => modules[id]).map(id => modules[id]),
    updateOrder: PRODUCTION_UPDATE_ORDER.filter(id => modules[id]).map(id => modules[id]),
  });
  const player = sim.spawn({ type: 'ship', team: 0, alive: true, isPlayer: true,
    pos: { x: 1580, z: -520 }, vel: { x: 0, z: 0 }, radius: 12, mass: 100,
    hull: 100, hullMax: 100, flags: { persistent: true }, data: {} });
  state.playerId = player.id;
  sim.spawn({ type: 'station', team: 2, factionId: 'faction_scn', pos: { x: 1280, z: -420 }, radius: 42,
    data: { stationId: 'station_helios', dockRadius: 72, factionId: 'faction_scn' } });
  sim.spawn({ type: 'ship', team: 2, factionId: 'faction_scn', pos: { x: 1450, z: -450 },
    radius: 9, hull: 100, hullMax: 100,
    data: { worldRecordId: 'fixture:lantern-lamp-witness', ai: { lawful: true, archetype: 'patrol_lawman' } } });
  await sim.registry.get('physics').prepareBackend(state);
  const reports = [];
  sim.bus.on('law:reportIncidentReceipt', receipt => {
    if (receipt.reportId === 'lantern-ward:theft:lamp:01') reports.push(receipt);
  });
  const run = n => { for (let i = 0; i < n; i++) sim.step(); };
  const actor = role => state.entityList.find(e => e.alive !== false && e.data?.worldRecordId === IDS[role]);
  run(10);
  return { sim, state, player, reports, run, actor, owner: sim.registry.get('npcJobsRuntime') };
}

test('detached original lamp theft retains player custody and reports the actual finite lamp once', async () => {
  const h = await theftFixture();
  try {
    const lamp = h.actor('lamp'), cradle = h.actor('cradle'), generation = lamp.occupantGeneration;
    const attachments = h.sim.registry.get('combat').kernel.attachments;
    const line = attachments.create({ defId: 'tether_standard', ownerId: h.player.id, targetId: lamp.id,
      sourceWorld: { ...h.player.pos, y: 0 }, targetWorld: { ...lamp.pos, y: 0 } });
    assert.equal(line.ok, true, line.reason);
    h.run(2);
    assert.equal(h.reports.length, 0, 'a local hand-off must not create a theft report');
    const target = { x: 1320, z: -520 };
    for (let i = 0; i < 9000 && h.reports.length === 0; i++) {
      const p = h.player, dx = target.x - p.pos.x, dz = target.z - p.pos.z;
      const k = Math.min(8, Math.hypot(dx, dz) * .7) / Math.max(Math.hypot(dx, dz), 1e-9);
      queuePhysicsImpulse(p, { x: p.mass * Math.max(-.06, Math.min(.06, dx * k - p.vel.x)),
        z: p.mass * Math.max(-.06, Math.min(.06, dz * k - p.vel.z)) },
      { tick: h.state.tick, tag: 'bounded_player_lamp_tow' });
      attachments.reel(line.attachment.id, -7 * DT, 28); h.sim.step();
    }
    const snapshot = () => ({ tick: h.state.tick, pos: lamp.pos, generation: lamp.occupantGeneration,
      custody: lamp.data.lanternWardCustody, manifest: lamp.data.cargoManifest,
      history: lanternWardStatus(h.owner).history, reports: h.reports });
    console.log('LANTERN_DETACHED_LAMP_THEFT', JSON.stringify(snapshot()));
    assert.equal(h.reports.length, 1, JSON.stringify(snapshot()));
    assert.equal(h.reports[0].accepted, true);
    assert.equal(h.reports[0].validatedWitnessedTheft, true);
    assert.equal(h.reports[0].payloadStableId, IDS.lamp);
    assert.equal(h.reports[0].stationId, 'station_helios');
    assert.ok(h.reports[0].witnessCount >= 1);
    assert.equal(lanternWardStatus(h.owner).history.lampStolen, true);
    assert.equal(h.actor('lamp'), lamp); assert.equal(lamp.occupantGeneration, generation);
    assert.equal(h.actor('cradle'), cradle);
    assert.equal(lamp.data.cargoManifest.totalQty, 1);
    h.run(180);
    assert.equal(h.reports.length, 1, 'holding the same lamp cannot create another law incident');
    assert.equal(attachments.cut(line.attachment.id, h.player.id, 'player_released').ok, true);
    h.run(2);
    const rebound = attachments.create({ defId: 'tether_standard', ownerId: h.player.id, targetId: lamp.id,
      sourceWorld: { ...h.player.pos, y: 0 }, targetWorld: { ...lamp.pos, y: 0 } });
    assert.equal(rebound.ok, true, rebound.reason); h.run(180);
    assert.equal(h.reports.length, 1, 'release and reattach must not create a second incident for the same original');
    const balance = h.state.player.credits;
    for (const intentId of ['stolen-lamp-sale:first', 'stolen-lamp-sale:second']) {
      const sale = h.sim.registry.get('economy').execute('station_helios', 'cmdty_electronics', 'sell', 1, { intentId });
      assert.equal(sale.ok, false); assert.equal(sale.reason, 'no_cargo');
    }
    assert.equal(h.state.player.credits, balance);
    assert.equal(h.state.player.cargo.items.cmdty_electronics || 0, 0);
    assert.equal(h.actor('lamp'), lamp); assert.equal(lamp.occupantGeneration, generation);
    assert.equal(h.state.entityList.filter(e => e.alive !== false && e.data?.lanternWardSerial === SERIAL).length, 1);
    const record = captureEntityRecord(lamp, { sectorId: SECTOR, tick: h.state.tick, simTime: h.state.simTime });
    assert.equal(lamp.data.lanternWardCustody.holder, 'player', JSON.stringify(snapshot()));
    assert.equal(spawnSpecFromRecord(record).data.lanternWardCustody.holder, 'player');
    assert.equal(lamp.data.lanternWardSerial, SERIAL);
  } finally { h.sim.dispose(); }
});

test('real player hand-off clears the crew clamp even with damaged lamp or missing operator', async t => {
  for (const interruption of ['damaged_lamp', 'missing_operator']) await t.test(interruption, async () => {
    const h = await theftFixture();
    try {
      const lamp = h.actor('lamp'), generation = lamp.occupantGeneration;
      const combatOwner = h.sim.registry.get('combat'), attachments = combatOwner.kernel.attachments;
      const target = interruption === 'damaged_lamp' ? lamp : h.actor('tug');
      assert.equal(combatOwner.onHit({ targetId: target.id, ownerId: h.player.id,
        damage: interruption === 'damaged_lamp' ? 65 : 10000, damageType: 'kinetic', pos: { ...target.pos } }).ok, true);
      const line = attachments.create({ defId: 'tether_standard', ownerId: h.player.id, targetId: lamp.id,
        sourceWorld: { ...h.player.pos, y: 0 }, targetWorld: { ...lamp.pos, y: 0 } });
      assert.equal(line.ok, true, line.reason); h.run(2);
      assert.equal(lanternWardStatus(h.owner).phase, interruption === 'damaged_lamp' ? 'damaged' : 'missing');
      assert.equal(lamp.data.lanternWardCustody.holder, 'player');
      assert.equal(lamp.data.cargoManifest.custody.holderId, 'player');
      assert.equal(lamp.data.lanternWardCustody.clamp, undefined);
      assert.equal(h.actor('lamp'), lamp); assert.equal(lamp.occupantGeneration, generation);
      assert.equal(h.reports.length, 0, 'local hand-off remains legal despite interruption');
      const activeCrewClamps = Object.values(h.state.combat.attachments.byId)
        .filter(row => row.state === 'active' && row.targetId === lamp.id && row.ownerId !== h.player.id);
      assert.deepEqual(activeCrewClamps, [], 'the job must release its real native clamp');
      const cradle = h.actor('cradle');
      assert.equal(cradle.data.lanternWardClamp01, 0, 'unloaded cradle must open even when work returns early');
      assert.equal(cradle.data.lanternWardCustody.loadSerial, undefined);
      assert.equal(cradle.data.lanternWardCustody.clamp, undefined);
      assert.equal(spawnSpecFromRecord(captureEntityRecord(lamp,
        { sectorId: SECTOR, tick: h.state.tick, simTime: h.state.simTime })).data.lanternWardCustody.holder, 'player');
    } finally { h.sim.dispose(); }
  });
});

async function productionFixture(seed) {
  const prior = snapshotFeatureMaps();
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed });
  applyFeatureConfigToMaps(runtime.config.features);
  const state = runtime.state, registry = { get: name => runtime.getSystem(name) };
  try {
    await runNewGameSimBoot({ state, helpers: runtime.getHelpers(), bus: runtime.bus, registry,
      opts: { seed }, awaitPhysicsPrep: true });
    state.mode = 'flight'; createTimeEffects(state).clear('runtime:loading'); runtime.bus.emit('game:started', {});
    const run = n => { for (let i = 0; i < n; i++) runtime.step(DT); };
    const actor = role => state.entityList.find(e => e.alive !== false && e.data?.worldRecordId === IDS[role]);
    const close = () => { runtime.dispose(); restoreFeatureMaps(prior); };
    run(10);
    return { runtime, state, registry, run, actor, close };
  } catch (error) { runtime.dispose(); restoreFeatureMaps(prior); throw error; }
}

test('destroyed original stays absent across sector departure and the production save/Continue path',
  { timeout: 90000 }, async () => {
  const h = await productionFixture(7642);
  try {
    const worldOwner = h.registry.get('world'), save = h.registry.get('save'), combatOwner = h.registry.get('combat');
    // Explicit native fixture placement via the actual world relocation authority. This is
    // not a claim that the player flew the route, docked or navigated the UI in this test.
    assert.equal(worldOwner.relocatePlayerInSector(lanternWardPoint(lanternWardCanonicalAnchor(), 'approach'),
      { reason: 'native_custody_fixture' }), true);
    h.run(30);
    const lamp = h.actor('lamp'), originalId = lamp.id, originalGeneration = lamp.occupantGeneration;
    assert.equal(lamp.data.lanternWardSerial, SERIAL);
    const credits = h.state.player.credits, errors = [];
    h.runtime.bus.on('save:error', event => errors.push(event));
    assert.equal(combatOwner.onHit({ targetId: lamp.id, ownerId: h.state.playerId,
      damage: 10000, damageType: 'kinetic', pos: { ...lamp.pos } }).ok, true);
    h.run(3);
    assert.equal(h.actor('lamp'), undefined);
    assert.equal(h.state.world.records.byId[IDS.lamp]?.outcome, 'destroyed');
    worldOwner.enterSector('sector_ceres_belt', { fromJump: true }); h.run(3);
    const envelope = JSON.parse(JSON.stringify(save.serialize('lantern-missing-original')));
    assert.equal(envelope.data.world.records.byId[IDS.lamp].outcome, 'destroyed');
    assert.equal(save.loadEnvelope(envelope, 'lantern-missing-original'), true, JSON.stringify(errors));
    h.state.mode = 'flight'; h.state.ui.screenStack = [];
    createTimeEffects(h.state).clear('runtime:loading');
    assert.equal(await h.registry.get('physics').prepareBackend(h.state), true);
    h.run(3); worldOwner.enterSector(SECTOR, { fromJump: true });
    assert.equal(worldOwner.relocatePlayerInSector(lanternWardPoint(lanternWardCanonicalAnchor(), 'approach'),
      { reason: 'native_custody_revisit' }), true);
    h.run(120);
    assert.equal(h.actor('lamp'), undefined, 'a lost finite original cannot be reminted on revisit');
    assert.equal(h.state.entityList.filter(e => e.alive !== false && e.data?.lanternWardSerial === SERIAL).length, 0);
    assert.equal(h.state.world.records.byId[IDS.lamp].outcome, 'destroyed');
    assert.equal(h.registry.get('npcJobsRuntime').lanternWardStatus().missingLamp, true);
    assert.equal(h.actor('receiver').data.lanternWardLit, false);
    assert.equal(h.state.missions.lanternWardReward?.status === 'settled', false);
    // A physical component never becomes trade stock. Both actual sale attempts are refused.
    const economy = h.registry.get('economy');
    for (const intentId of ['lamp-sale:first', 'lamp-sale:second']) {
      const result = economy.execute('station_helios', 'cmdty_electronics', 'sell', 1, { intentId });
      assert.equal(result.ok, false); assert.equal(result.reason, 'no_cargo');
    }
    assert.equal(h.state.player.credits, credits);
    assert.equal(h.state.player.cargo.items.cmdty_electronics || 0, 0);
    assert.deepEqual(errors.filter(event => !(event.autosave === true && event.slot === 'auto'
      && event.reason === 'superseded' && event.failure === 'superseded')), []);
    console.log('LANTERN_MISSING_ORIGINAL_CONTINUED', JSON.stringify({ originalId, originalGeneration,
      tick: h.state.tick, phase: h.registry.get('npcJobsRuntime').lanternWardStatus().phase,
      record: h.state.world.records.byId[IDS.lamp].outcome, credits: h.state.player.credits }));
  } finally { h.close(); }
});

test('a real market purchase repairs the same damaged lamp and settles the real mission once',
  { timeout: 180000 }, async () => {
  const h = await productionFixture(7643);
  try {
    const worldOwner = h.registry.get('world'), economy = h.registry.get('economy');
    const commits = [], grants = [];
    h.runtime.bus.on('lanternWard:serviceCommitted', event => commits.push(event));
    h.runtime.bus.on('economy:grantCredits', event => { if (event.reason === 'lw_helios_empty_plinth') grants.push(event); });
    // Procure through the real seeded market transaction. Direct sector entry and the
    // authoritative transaction port are fixture setup, not public docking/UI evidence.
    worldOwner.enterSector('sector_tethys_junction', { fromJump: true });
    const quote = economy.quote('station_tethys', 'cmdty_electronics', 'buy', 1);
    assert.equal(quote.ok, true, JSON.stringify(quote));
    const beforePurchase = h.state.player.credits, intentId = 'lantern-legitimate-repair-part:01';
    const purchased = economy.execute('station_tethys', 'cmdty_electronics', 'buy', 1,
      { intentId, requireFullQuantity: true, expectedTotal: quote.total });
    assert.equal(purchased.ok, true, JSON.stringify(purchased)); assert.equal(purchased.qty, 1);
    assert.equal(h.state.player.cargo.items.cmdty_electronics, 1);
    assert.equal(beforePurchase - h.state.player.credits, purchased.total);
    const postPurchase = h.state.player.credits;
    const duplicate = economy.execute('station_tethys', 'cmdty_electronics', 'buy', 1, { intentId });
    assert.equal(duplicate.duplicate, true);
    assert.equal(h.state.player.cargo.items.cmdty_electronics, 1);
    assert.equal(h.state.player.credits, postPurchase);
    worldOwner.enterSector(SECTOR, { fromJump: true });
    const receiver = lanternWardPoint(lanternWardCanonicalAnchor(), 'receiver');
    assert.equal(worldOwner.relocatePlayerInSector({ x: receiver.x - 25, z: receiver.z - 45 },
      { reason: 'native_procurement_fixture' }), true);
    h.run(30);
    const lamp = h.actor('lamp'), generation = lamp.occupantGeneration, mast = h.actor('obstruction');
    const owner = h.registry.get('npcJobsRuntime'), combatOwner = h.registry.get('combat');
    queuePhysicsImpulse(mast, { x: mast.mass * 20, z: mast.mass * 6 },
      { tick: h.state.tick, tag: 'native_fixture_physical_cut_clearance' });
    for (let i = 0; i < 12000 && owner.lanternWardStatus().phase !== 'connect'; i++) h.runtime.step(DT);
    assert.equal(owner.lanternWardStatus().phase, 'connect', JSON.stringify(owner.lanternWardStatus()));
    assert.equal(combatOwner.onHit({ targetId: lamp.id, ownerId: h.state.playerId,
      damage: 65, damageType: 'kinetic', pos: { ...lamp.pos } }).ok, true);
    h.run(2); assert.equal(owner.lanternWardStatus().phase, 'damaged');
    // Attend at repair time. An initial placement is not a promise to remain beside a
    // working route throughout transit; this fixture does not automate ordinary flight.
    assert.equal(worldOwner.relocatePlayerInSector({ x: lamp.pos.x - 25, z: lamp.pos.z - 45 },
      { reason: 'native_attended_repair_fixture' }), true);
    h.run(1);
    assert.equal(owner.lanternWardRepair({ ...h.actor('tug') }).ok, false, 'copied operator cannot consume legitimate stock');
    assert.equal(h.state.player.cargo.items.cmdty_electronics, 1);
    const repair = owner.lanternWardRepair(h.actor('tug'));
    assert.equal(repair.ok, true, JSON.stringify({ repair, lamp: lamp.pos, tug: h.actor('tug').pos,
      player: h.state.entities.get(h.state.playerId)?.pos }));
    assert.equal(h.state.player.cargo.items.cmdty_electronics || 0, 0);
    assert.equal(lamp.hull, lamp.hullMax);
    assert.equal(owner.lanternWardRepair(h.actor('tug')).ok, false);
    for (let i = 0; i < 6000 && commits.length === 0; i++) h.runtime.step(DT);
    assert.equal(commits.length, 1, JSON.stringify(owner.lanternWardStatus()));
    assert.equal(owner.lanternWardStatus().installed, true);
    assert.equal(h.actor('lamp'), lamp); assert.equal(lamp.occupantGeneration, generation);
    assert.equal(lamp.data.lanternWardSerial, SERIAL); assert.equal(lamp.data.cargoManifest.totalQty, 1);
    assert.equal(lamp.data.lanternWardCustody.holder, 'receiver');
    assert.equal(lamp.data.lanternWardLit, true);
    assert.equal(owner.lanternWardReceipt(commits[0].receiptId).method, 'repaired_original');
    assert.equal(h.state.missions.lanternWardReward.status, 'settled');
    assert.equal(h.state.missions.lanternWardReward.credited, 180);
    assert.deepEqual(grants.map(event => event.amount), [180]);
    assert.equal(h.state.player.credits, postPurchase + 180);
    h.runtime.bus.emit('lanternWard:serviceCommitted', commits[0]);
    h.runtime.bus.emit('lanternWard:serviceCommitted', commits[0]);
    assert.equal(grants.length, 1); assert.equal(h.state.player.credits, postPurchase + 180);
    console.log('LANTERN_LEGITIMATE_PROCUREMENT', JSON.stringify({ tick: h.state.tick,
      purchase: purchased, sameOriginalGeneration: generation, repair, credits: h.state.player.credits,
      reward: h.state.missions.lanternWardReward }));
  } finally { h.close(); }
});
