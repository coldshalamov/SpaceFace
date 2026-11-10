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
import { world } from '../src/systems/world.js';
import { addCargo } from '../src/systems/cargo.js';
import { queuePhysicsImpulse, writeOwnedPhysicsControl } from '../src/core/physicsAuthority.js';
import {
  stepLanternWard, serializeLanternWard, restoreLanternWard,
  lanternWardCompletionReceipt, lanternWardStatus, repairLanternWardLamp,
} from '../src/systems/lanternWardWork.js';
import {
  LANTERN_WARD_RECORD_IDS as IDS, LANTERN_WARD_LAMP_SERIAL as SERIAL,
  lanternWardHardwareSpec, captureLanternWardHardware,
} from '../src/data/lanternWardHardware.js';
import { LANTERN_WARD_BODY_CONTRACTS as C, lanternWardPoint } from '../src/data/lanternWardLayout.js';
import { lanternWardSceneryProxy } from '../src/world/lanternWardDressing.js';
import { captureEntityRecord, spawnSpecFromRecord } from '../src/world/worldRecords.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { snapshotFeatureMaps, restoreFeatureMaps, applyFeatureConfigToMaps } from '../src/data/featureFlags.js';
const DT = 1 / 60, SECTOR = 'sector_helios_prime', anchor = { x: 1680, z: -820 };

async function nativeHarness(seed = 47, restored = null, playerAt = { x: 1590, z: -520 }) {
  const state = createGameState(seed); state.mode = 'flight'; state.world.currentSectorId = SECTOR;
  const recordOwner = { name: 'world', init(ctx) { this.state = ctx.state; }, upsertWorldRecord: world.upsertWorldRecord };
  const modules = { flightSlot: flightV3, physics, combat, npcJobsRuntime, spawnBudget, world: recordOwner };
  const sim = createSimulation({ state, seed,
    systems: PRODUCTION_INIT_ORDER.filter(id => modules[id]).map(id => modules[id]),
    updateOrder: PRODUCTION_UPDATE_ORDER.filter(id => modules[id]).map(id => modules[id]),
  });
  const player = sim.spawn({ type: 'ship', team: 0, alive: true, isPlayer: true,
    pos: { ...playerAt }, vel: { x: 0, z: 0 }, radius: 12, mass: 100,
    hull: 100, hullMax: 100, flags: { persistent: true }, data: {} });
  state.playerId = player.id;
  if (restored) {
    state.simTime = restored.simTime;
    state.world.records = { byId: {} };
    for (const record of restored.records) {
      state.world.records.byId[record.recordId] = structuredClone(record);
      const spec = spawnSpecFromRecord(record);
      if (spec) sim.spawn(spec);
    }
  }
  for (const key of ['serviceCutNorth', 'serviceCutSouth']) {
    sim.spawn({ type: 'payload', alive: true, team: 2, pos: lanternWardPoint(anchor, key),
      vel: { x: 0, z: 0 }, radius: C.service_cheek.radius, mass: 1e6, hull: 1e6,
      collides: true, physicsBody: { schemaVersion: 1, dynamic: false,
        mass: 1e6, radius: C.service_cheek.radius, shape: 'compound', material: 'prop',
        collisionProxyManifest: lanternWardSceneryProxy('service_cheek') }, data: {} });
  }
  await sim.registry.get('physics').prepareBackend(state);
  const owner = sim.registry.get('npcJobsRuntime');
  if (restored) restoreLanternWard(owner, restored.ward);
  const events = [];
  sim.bus.on('lanternWard:serviceCommitted', e => events.push(e));
  const actor = role => state.entityList.find(e => e.alive && e.data?.worldRecordId === IDS[role]);
  const run = (n, each = null) => { for (let i = 0; i < n; i++) { each?.(i); sim.step(); } };
  run(10);
  return { sim, state, owner, player, events, actor, run };
}

test('native production order: a cleared cut carries the finite lamp and commits its receiver once', async () => {
  const h = await nativeHarness();
  let disposed = false;
  try {
    assert.equal(lanternWardStatus(h.owner).phase, 'blocked');
    assert.equal(h.actor('lamp').data.lanternWardSerial, SERIAL);
    const originalPart = h.actor('maintenance_part');
    assert.equal(h.actor('maintenance').data.cargoManifest.totalQty, 0, 'maintenance launch really starts empty');
    assert.equal(originalPart.data.lanternWardCustody.holder, 'source');
    assert.ok(Math.abs(h.actor('obstruction').rot - Math.PI / 2) < 1e-6);
    // Ordinary force moves the authored mast; no mission method or timer is set.
    const mast = h.actor('obstruction');
    const lineOwner = h.sim.registry.get('combat').kernel.attachments;
    const playerLine = lineOwner.create({ defId: 'tether_standard', ownerId: h.player.id, targetId: mast.id,
      sourceWorld: { ...h.player.pos, y: 0 }, targetWorld: { ...mast.pos, y: 0 } });
    assert.equal(playerLine.ok, true); h.run(1);
    assert.equal(lineOwner.cut(playerLine.attachment.id, h.player.id, 'player_released').ok, true);
    queuePhysicsImpulse(mast, { x: mast.mass * 20, z: mast.mass * 6 }, { tick: h.state.tick, tag: 'player_test_impulse' });
    let prior = '';
    for (let i = 0; i < 18000 && !h.events.length; i++) {
      h.sim.step();
      const phase = lanternWardStatus(h.owner).phase;
      if (phase !== prior) { prior = phase; console.log('LANTERN_NATIVE_PHASE', h.state.tick, phase); }
    }
    const status = lanternWardStatus(h.owner);
    console.log('LANTERN_NATIVE_RESULT', JSON.stringify({ status,
      bodies: Object.keys(IDS).map(role => ({ role, pos: h.actor(role)?.pos, vel: h.actor(role)?.vel,
        rot: h.actor(role)?.rot, phase: h.actor(role)?.data?.lanternWardPhase })),
      lines: Object.values(h.state.combat.attachments.byId).filter(a => a.state === 'active')
        .map(a => ({ id:a.id, owner:a.ownerId, target:a.targetId, rest:a.restLength, source:a.sourceAnchorLocal, dest:a.targetAnchorLocal })) }));
    assert.equal(status.phase, 'installed');
    assert.equal(h.events.length, 1);
    assert.equal(h.actor('lamp').data.lanternWardLit, true);
    assert.equal(h.actor('lamp').data.lanternWardCustody.holder, 'receiver');
    assert.equal(h.actor('lamp').data.cargoManifest.totalQty, 1);
    assert.equal(h.actor('cradle').data.lanternWardClamp01, 0);
    assert.equal(h.actor('maintenance_part'), originalPart, 'independent job moves its original source canister');
    assert.equal(originalPart.data.cargoManifest.totalQty, 1);
    assert.equal(originalPart.data.lanternWardCustody.holder, 'service_face');
    assert.equal(h.actor('maintenance').data.cargoManifest.totalQty, 0, 'carrier never duplicates the canister inventory');
    assert.equal(h.actor('service_face').data.lanternWardRepaired, true);
    const receipt = lanternWardCompletionReceipt(h.owner, h.events[0].receiptId);
    assert.equal(receipt.lampSerial, SERIAL); assert.equal(receipt.count, 1);
    assert.equal(receipt.playerHelped, true, 'actual player Massline involvement authenticates the helpful outcome');
    const generation = h.actor('lamp').occupantGeneration;
    h.actor('lamp').occupantGeneration++;
    assert.equal(lanternWardCompletionReceipt(h.owner, receipt.receiptId), null, 'mint cannot follow a recycled life');
    h.actor('lamp').occupantGeneration = generation;
    h.run(180);
    assert.equal(h.events.length, 1);
    assert.equal(h.state.entityList.filter(e => e.alive && e.data?.worldRecordId === IDS.lamp).length, 1);
    const saved = { ward: serializeLanternWard(h.owner), simTime: h.state.simTime,
      records: Object.keys(IDS).map(role => h.actor(role)).filter(Boolean)
        .map(e => captureEntityRecord(e, { sectorId: SECTOR, tick: h.state.tick, simTime: h.state.simTime })) };
    h.sim.dispose(); disposed = true;
    const continued = await nativeHarness(47, saved);
    try {
      continued.run(120);
      assert.equal(lanternWardStatus(continued.owner).phase, 'installed');
      assert.equal(continued.actor('lamp').data.lanternWardSerial, SERIAL);
      assert.equal(continued.actor('lamp').data.lanternWardLit, true);
      assert.equal(continued.actor('maintenance_part').data.lanternWardCustody.holder, 'service_face');
      assert.equal(continued.events.length, 0, 'native/record rematerialization never issues the service again');
      assert.equal(lanternWardCompletionReceipt(continued.owner, receipt.receiptId), null, 'restored history cannot mint a new reward');
      assert.equal(continued.state.entityList.filter(e => e.alive && e.data?.worldRecordId === IDS.lamp).length, 1);
    } finally { continued.sim.dispose(); }
  } finally { if (!disposed) h.sim.dispose(); }
});

test('native damaged original accepts exactly one procured electronics unit and resumes the real installation', async () => {
  const h = await nativeHarness(409, null, { x: 1805, z: -740 });
  try {
    const mast = h.actor('obstruction');
    queuePhysicsImpulse(mast, { x: mast.mass * 20, z: mast.mass * 6 }, { tick: h.state.tick });
    for (let i = 0; i < 12000 && lanternWardStatus(h.owner).phase !== 'connect'; i++) h.sim.step();
    assert.equal(lanternWardStatus(h.owner).phase, 'connect');
    const lamp = h.actor('lamp'), combatOwner = h.sim.registry.get('combat');
    assert.equal(combatOwner.onHit({ targetId: lamp.id, ownerId: h.player.id, damage: 65, damageType: 'kinetic', pos: { ...lamp.pos } }).ok, true);
    h.run(2); assert.equal(lanternWardStatus(h.owner).damaged, true);
    assert.equal(addCargo(h.state, 'cmdty_electronics', 1), 1);
    assert.equal(repairLanternWardLamp(h.owner, { ...h.actor('tug') }).ok, false, 'copied hail target cannot consume a part');
    assert.equal(h.state.player.cargo.items.cmdty_electronics, 1);
    assert.equal(repairLanternWardLamp(h.owner, h.actor('tug')).ok, true);
    assert.equal(h.state.player.cargo.items.cmdty_electronics || 0, 0);
    assert.equal(repairLanternWardLamp(h.owner, h.actor('tug')).ok, false);
    for (let i = 0; i < 6000 && !h.events.length; i++) h.sim.step();
    assert.equal(lanternWardStatus(h.owner).installed, true);
    assert.equal(h.actor('lamp'), lamp, 'repair never resurrects or replaces the original');
    const receipt = lanternWardCompletionReceipt(h.owner, h.events[0].receiptId);
    assert.equal(receipt.method, 'repaired_original'); assert.equal(receipt.recovered, true);
    assert.equal(h.events.length, 1);
  } finally { h.sim.dispose(); }
});

test('native alternative: a player Massline carries the loaded cradle around the still-blocked cut', async () => {
  const h = await nativeHarness(918, null, { x: 1710, z: -520 });
  try {
    const cradle = h.actor('cradle'), lamp = h.actor('lamp'), mast = h.actor('obstruction');
    const mastContacts = [];
    h.sim.bus.on('physics:impact', p => { if (mastContacts.length < 8 && (p.aId === mast.id || p.bId === mast.id))
      mastContacts.push({ tick:h.state.tick, impulse:p.impulse,
        a:h.state.entities.get(p.aId)?.data?.name || p.aId, b:h.state.entities.get(p.bId)?.data?.name || p.bId }); });
    const service = h.sim.registry.get('combat').kernel.attachments;
    const tow = service.create({ defId: 'tether_standard', ownerId: h.player.id, targetId: cradle.id,
      sourceWorld: { ...h.player.pos, y: 0 }, targetWorld: { ...cradle.pos, y: 0 } });
    assert.equal(tow.ok, true);
    const points = [{ x: 1710, z: -520 }, { x: 1865, z: -520 }, { x: 1865, z: -600 }];
    let leg = 0, released = false, mastMoved = false;
    for (let i = 0; i < 18000 && !h.events.length; i++) {
      const target = released ? { x: 1965, z: -500 } : points[leg], p = h.player;
      const dx = target.x - p.pos.x, dz = target.z - p.pos.z, d = Math.hypot(dx, dz);
      const desired = Math.min(8, d * .7), k = desired / Math.max(d, 1e-9);
      // Native impulses model bounded player thrust; only SG-02 changes pose.
      const dvx = Math.max(-.05, Math.min(.05, dx * k - p.vel.x));
      const dvz = Math.max(-.05, Math.min(.05, dz * k - p.vel.z));
      queuePhysicsImpulse(p, { x: p.mass * dvx, z: p.mass * dvz }, { tick: h.state.tick, tag: 'player_thrust_fixture' });
      if (!released) service.reel(tow.attachment.id, -10 * DT, 28);
      if (d < 5 && leg < points.length - 1 && Math.hypot(cradle.pos.x - p.pos.x, cradle.pos.z - p.pos.z) < 36) leg++;
      if (!released && leg === points.length - 1 && d < 5 && cradle.pos.x > 1810 && cradle.pos.z < -555) {
        assert.equal(service.cut(tow.attachment.id, h.player.id, 'player_handoff').ok, true);
        released = true;
      }
      h.sim.step();
      if (!mastMoved && Math.hypot(mast.pos.x - 1775, mast.pos.z + 650) > .15) {
        mastMoved = true; console.log('LANTERN_CARRY_MAST_FIRST', JSON.stringify({ tick:h.state.tick, leg,
          phase:lanternWardStatus(h.owner).phase, mast:{pos:mast.pos,vel:mast.vel}, tug:h.actor('tug')?.pos,
          cradle:cradle.pos, player:h.player.pos,
          lines: Object.values(h.state.combat.attachments.byId).filter(a=>a.state==='active').map(a=>({owner:a.ownerId,target:a.targetId,rest:a.restLength})) }));
      }
    }
    console.log('LANTERN_CARRY_RESULT', JSON.stringify({ status: lanternWardStatus(h.owner),
      player: h.player.pos, cradle: cradle.pos, lamp: lamp.pos, tug: h.actor('tug')?.pos, mast: mast.pos, mastContacts }));
    assert.equal(lanternWardStatus(h.owner).installed, true);
    assert.ok(Math.hypot(mast.pos.x - 1775, mast.pos.z + 650) < 2, 'the other physical solution leaves the original blockage in place');
    assert.equal(lanternWardStatus(h.owner).history.playerCarried, true);
    assert.equal(h.actor('lamp'), lamp);
    assert.equal(lanternWardCompletionReceipt(h.owner, h.events[0].receiptId).method, 'physical_carry');
    for (let i = 0; i < 9000 && Math.hypot(h.actor('tug').pos.x - 1670, h.actor('tug').pos.z + 622) > 4; i++) h.sim.step();
    assert.ok(Math.hypot(h.actor('tug').pos.x - 1670, h.actor('tug').pos.z + 622) < 4, 'empty service launch returns along the still-clear freight rim');
    assert.ok(Math.hypot(mast.pos.x - 1775, mast.pos.z + 650) < 2, 'the return does not plow through the original obstruction');
    assert.equal(h.events.length, 1);
  } finally { h.sim.dispose(); }
});

test('exact hardware captures native payload recipe and rejects an impostor or malformed record', () => {
  for (const role of ['cradle', 'lamp', 'receiver', 'obstruction', 'service_face', 'maintenance_part']) {
    const e = { id: 9, occupantGeneration: 12, ...lanternWardHardwareSpec(role) };
    e.pos.x += 17; e.vel.x = 2; e.rot += .2; e.hull -= 1;
    const record = captureEntityRecord(e, { sectorId: SECTOR, tick: 20 });
    const spec = spawnSpecFromRecord(record);
    assert.equal(spec.type, 'payload'); assert.deepEqual(spec.pos, e.pos);
    assert.deepEqual(spec.vel, e.vel); assert.equal(spec.hull, e.hull);
    assert.deepEqual(spec.physicsBody.collisionProxyManifest, e.physicsBody.collisionProxyManifest);
    for (const edit of [r => r.type = 'ship', r => r.itinerary.lanternWard.role = 'lamp-impostor',
      r => r.alive = false, r => r.hull = 0, r => r.rot = NaN]) {
      const bad = structuredClone(record); edit(bad); assert.equal(spawnSpecFromRecord(bad), null);
    }
    const impostor = { ...e, data: { ...e.data, worldRecordId: 'some-other-body' } };
    assert.equal(captureLanternWardHardware(impostor), null);
  }
});

test('uninvited commuter uses its specific berth approach and waits for the actual slow service launch', async () => {
  const h = await nativeHarness(321);
  try {
    let observedStoppedYield = false;
    h.run(2400, () => {
      const w = serializeLanternWard(h.owner), ferry = h.actor('commuter');
      if (w.commuterWaitS > 5 && ferry.data.lanternWardYielding
          && Math.hypot(ferry.vel.x, ferry.vel.z) < 1) observedStoppedYield = true;
    });
    assert.equal(observedStoppedYield, true, 'normal first watch physically stops and yields without mission acceptance');
    assert.equal(lanternWardStatus(h.owner).phase, 'blocked');
    assert.equal(h.events.length, 0);
    assert.notDeepEqual({ x: h.actor('maintenance_part').pos.x, z: h.actor('maintenance_part').pos.z },
      { x: 1640, z: -618 }, 'independent physical pickup and delivery continue during the wait');
    h.run(2400);
    assert.equal(h.actor('service_face').data.lanternWardRepaired, true, 'its finite repair finishes independently');
    assert.ok(lanternWardStatus(h.owner).history.departures >= 1,
      'after yielding, the real outside approach admits a berth arrival, dwell and departure while the lamp stays blocked');
    assert.equal(lanternWardStatus(h.owner).phase, 'blocked');
  } finally { h.sim.dispose(); }
});

test('a mast moved only halfway out still blocks the loaded swept route', async () => {
  const h = await nativeHarness(7621);
  try {
    const mast = h.actor('obstruction'), cradle = h.actor('cradle');
    queuePhysicsImpulse(mast, { x: mast.mass * 12, z: 0 }, { tick: h.state.tick, tag: 'partial_clearance_fixture' });
    h.run(240);
    queuePhysicsImpulse(mast, { x: -mast.mass * mast.vel.x, z: -mast.mass * mast.vel.z }, { tick: h.state.tick });
    h.run(120);
    assert.ok(mast.pos.x > 1815 && mast.pos.x < 1835, 'the real mast has passed the old single-point gate');
    assert.equal(lanternWardStatus(h.owner).blocked, true, 'the receiver court still needs the rig width');
    assert.equal(h.events.length, 0);
    assert.ok(Math.hypot(cradle.pos.x - 1710, cradle.pos.z + 650) < 2, 'crew waits with its actual loaded platform');
  } finally { h.sim.dispose(); }
});

test('removing the installed original bearing stops household work until that physical part returns', async () => {
  const h = await nativeHarness(7622);
  try {
    for (let i = 0; i < 6000 && !h.actor('service_face').data.lanternWardRepaired; i++) h.sim.step();
    const face = h.actor('service_face'), part = h.actor('maintenance_part');
    assert.equal(face.data.lanternWardRepaired, true);
    const service = h.sim.registry.get('combat').kernel.attachments;
    const held = service.create({ defId: 'tether_standard', ownerId: h.player.id, targetId: part.id,
      sourceWorld: { ...h.player.pos, y: 0 }, targetWorld: { ...part.pos, y: 0 } });
    assert.equal(held.ok, true);
    h.run(2);
    assert.equal(face.data.lanternWardRepaired, false);
    assert.equal(part.data.lanternWardCustody.holder, 'loose');
    assert.equal(part.data.cargoManifest.custody.holderId, 'loose');
    for (let i = 0; i < 1200; i++) {
      service.reel(held.attachment.id, -5 * DT, 25); h.sim.step();
    }
    assert.ok(Math.hypot(part.pos.x - face.pos.x, part.pos.z - face.pos.z) > 25);
    assert.equal(face.data.lanternWardWorkerPresent, false, 'history does not animate a repair with missing hardware');
    assert.equal(face.data.lanternWardRepaired, false);
    assert.equal(h.actor('maintenance_part'), part);
    assert.equal(lanternWardStatus(h.owner).history.maintenanceServices, 1, 'the earlier repair remains remembered');
    assert.equal(h.state.entityList.filter(e => e.alive && e.data?.worldRecordId === IDS.maintenance_part).length, 1);
  } finally { h.sim.dispose(); }
});

test('a recycled numeric entity id cannot inherit the finite lamp, even with copied public tags', async () => {
  const h = await nativeHarness(811);
  try {
    const original = h.actor('lamp'), beforeCount = h.state.entityList.length;
    const impostor = { ...original, occupantGeneration: original.occupantGeneration + 1,
      pos: { x: 1830, z: -695 }, data: structuredClone(original.data) };
    h.state.entities.set(original.id, impostor);
    h.state.entityList[h.state.entityList.indexOf(original)] = impostor;
    h.state.tick++;
    stepLanternWard(h.owner, DT);
    assert.equal(lanternWardStatus(h.owner).phase, 'missing');
    assert.equal(h.state.entityList.length, beforeCount, 'no fallback spawn of an original');
    assert.equal(h.events.length, 0);
    assert.equal(impostor.data.lanternWardLit, false);
    assert.equal(lanternWardCompletionReceipt(h.owner, 'lantern-ward:venn-family-lamp:service:01'), null);
  } finally { h.sim.dispose(); }
});

test('missing/damaged originals stay missing/damaged across a durable recipe and work restore', async () => {
  const h = await nativeHarness(92);
  try {
    const lamp = h.actor('lamp'); lamp.hull = 20;
    h.run(2);
    assert.equal(lanternWardStatus(h.owner).damaged, true);
    const snapshot = serializeLanternWard(h.owner);
    const record = captureEntityRecord(lamp, { sectorId: SECTOR, tick: h.state.tick });
    assert.equal(spawnSpecFromRecord(record).hull, 20);
    assert.equal(spawnSpecFromRecord(record).data.lanternWardLit, false);
    restoreLanternWard(h.owner, snapshot);
    h.run(2);
    assert.equal(lanternWardStatus(h.owner).damaged, true);
    assert.equal(repairLanternWardLamp(h.owner).ok, false, 'unattended repair/cargo absence cannot heal');
    assert.equal(lamp.hull, 20);
    h.state.entities.delete(lamp.id);
    h.state.entityList.splice(h.state.entityList.indexOf(lamp), 1);
    const count = h.state.entityList.length;
    h.state.tick++; stepLanternWard(h.owner, DT);
    assert.equal(lanternWardStatus(h.owner).phase, 'missing');
    assert.equal(h.state.entityList.length, count);
    assert.equal(h.events.length, 0);
  } finally { h.sim.dispose(); }
});

test('pause, duplicate tick, malformed state and fabricated receipt cannot advance or pay', async () => {
  const h = await nativeHarness(93);
  try {
    const before = serializeLanternWard(h.owner);
    stepLanternWard(h.owner, 1000);
    assert.deepEqual(serializeLanternWard(h.owner), before, 'duplicate tick stays inert');
    h.state.mode = 'docked'; h.state.tick++;
    stepLanternWard(h.owner, DT);
    assert.deepEqual(serializeLanternWard(h.owner), before, 'non-flight clock stays inert');
    h.state.mode = 'flight';
    restoreLanternWard(h.owner, { version: 1, initialized: true, history: { installations: 1 },
      firstCompletionReceipt: { receiptId: 'lantern-ward:venn-family-lamp:service:01',
        committed: true, lampSerial: 'borrowed-id', receiverRecordId: IDS.receiver } });
    assert.equal(lanternWardCompletionReceipt(h.owner, 'lantern-ward:venn-family-lamp:service:01'), null);
    const repaired = serializeLanternWard(h.owner);
    assert.equal(repaired.objects.lamp.spawned, true, 'malformed missing row never remints');
    assert.equal(repaired.firstCompletionReceipt, null);
    assert.equal(h.events.length, 0);
  } finally { h.sim.dispose(); }
});

test('full Adventure geography keeps the untouched original operation coherent with ordinary traffic and colliders', async () => {
  const flags = snapshotFeatureMaps();
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 7402 });
  applyFeatureConfigToMaps(runtime.config.features);
  try {
    const s = runtime.state, ships = runtime.getSystem('ships'), worldOwner = runtime.getSystem('world');
    s.mode = 'flight'; s.ui.screenStack = [];
    ships.newGame();
    const pilot = runtime.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: s.player, team: 0, pos: { x: 0, z: 0 } }));
    s.playerId = pilot.id; worldOwner.enterSector(SECTOR);
    worldOwner.relocatePlayerInSector({ x: 1680, z: -500, heading: -Math.PI / 2 }, { reason: 'lantern-native-arrival-fixture' });
    assert.equal(await runtime.getSystem('physics').prepareBackend(s), true);
    const contacts = [];
    runtime.bus.on('physics:impact', p => {
      const a = s.entities.get(p.aId), b = s.entities.get(p.bId);
      if (contacts.length < 24 && (a?.data?.lanternWardRole || b?.data?.lanternWardRole)) {
        contacts.push({ tick: s.tick, impulse: p.impulse, a: a?.data?.name || a?.data?.worldRecordId || a?.type,
          b: b?.data?.name || b?.data?.worldRecordId || b?.type });
      }
    });
    for (let i = 0; i < 6000; i++) runtime.step(DT);
    const find = role => s.entityList.filter(e => e.alive && e.data?.worldRecordId === IDS[role]);
    const cradle = find('cradle')[0], lamp = find('lamp')[0], tug = find('tug')[0];
    const status = runtime.getSystem('npcJobsRuntime').lanternWardStatus();
    console.log('LANTERN_FULL_ADVENTURE', JSON.stringify({ simTime: s.simTime, status,
      cradle: cradle && { pos: cradle.pos, vel: cradle.vel }, lamp: lamp && { pos: lamp.pos, vel: lamp.vel },
      tug: tug && { pos: tug.pos, vel: tug.vel },
      maintenance: find('maintenance').map(e => ({ pos:e.pos, vel:e.vel, rot:e.rot, job:e.data.jobId, carrying:e.data.lanternWardCarrying })),
      part: find('maintenance_part').map(e => ({ pos:e.pos, vel:e.vel, rot:e.rot, custody:e.data.lanternWardCustody })),
      lines: Object.values(s.combat.attachments.byId).filter(a => a.state === 'active').map(a => ({ owner:a.ownerId, target:a.targetId, rest:a.restLength, mode:a.controlMode })),
      contacts }));
    assert.equal(find('cradle').length, 1); assert.equal(find('lamp').length, 1); assert.equal(find('tug').length, 1);
    assert.equal(lamp.data.lanternWardSerial, SERIAL);
    assert.ok(Math.hypot(cradle.pos.x - 1710, cradle.pos.z + 650) < 180, 'ordinary background life cannot abandon the original loaded cradle');
    assert.equal(status.history.playerCleared, false, 'ordinary ambient interactions never impersonate player help');
    assert.equal(status.history.cradleStolen, false);
    assert.ok(status.history.departures >= 1, 'the ordinary commuter reaches and leaves its actual berth without player help');
    assert.equal(status.history.maintenanceServices, 1, 'the source bearing reaches its actual service face in ordinary geography');
    assert.equal(find('maintenance_part')[0].data.lanternWardCustody.holder, 'service_face');
    assert.equal(find('service_face')[0].data.lanternWardRepaired, true);
  } finally { runtime.dispose(); restoreFeatureMaps(flags); }
});
