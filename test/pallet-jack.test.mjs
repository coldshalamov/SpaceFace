import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner, createSg02CombatPhysicsPort } from '../src/core/sg02DynamicBodyOwner.js';
import { writePhysicsControl } from '../src/core/physicsAuthority.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { scalarHitToDamagePacket } from '../src/combat/damage.js';
import { palletJack, palletJackEncounter, palletJackPresentation } from '../src/systems/palletJack.js';
import { PALLET_JACK as C, PALLET_JACK_ENEMY as R, palletJackCargoEligible,
  palletJackForkContains, palletJackFlightModel } from '../src/data/palletJack.js';
import { palletJackPhysicalBody, PALLET_JACK_RADIUS } from '../src/data/palletJackBody.js';
import { palletJackDecision } from '../src/ai/palletJack.js';
import { pickupCustodyAllowsCollector, isPalletJackClampedPickup } from '../src/core/pickupCustody.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';

function actorSpec(pos = { x: 0, z: 0 }) {
  const body = palletJackPhysicalBody(), spec = makeShipEntitySpec(R.shipId, { team: 1, factionId: R.factionId, pos });
  return { ...spec, hull: R.hull, hullMax: R.hull, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0,
    physicsBody: body, radius: PALLET_JACK_RADIUS, mass: body.mass, weapons: [],
    flightModel: palletJackFlightModel(body, spec.flightModel), data: { ...spec.data, lootTableId: C.enemyId,
      authoredAssetId: C.assetId, combatProfileId: 'combat_profile_pallet_jack', weapons: [] } };
}
async function fixture({ cargoData = {}, begin = true } = {}) {
  const native = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  const ph = { name: 'physics', init(ctx) { this._sg02 = native; ctx.helpers.combatPhysics = createSg02CombatPhysicsPort(native); } };
  const sim = createSimulation({ seed: 79, systems: [ph, palletJack] }), s = sim.state;
  s.settings.gameplay.physicsBackend = 'rapier-dynamic'; s.mode = 'flight'; s.tick = 120; s.simTime = 2;
  s.world.currentSectorId = C.sectors[0];
  const helpers = sim.registry.ctx.helpers, origin = sectorGlobalOrigin(C.sectors[0]);
  const player = helpers.spawnEntity({ type: 'ship', pos: { x: origin.x + 60, z: origin.z + 90 }, radius: 4, mass: 40,
    hull: 500, hullMax: 500, physicsBody: { schemaVersion: 1, shape: 'ball', dynamic: true,
      radius: 4, mass: 40, inertiaY: 80 }, data: {} });
  player.isPlayer = true; s.playerId = player.id;
  const actor = helpers.spawnEntity(actorSpec(origin));
  const cargo = helpers.spawnEntity({ type: 'pickup', pos: { x: origin.x + 7, z: origin.z }, radius: 2, mass: 60,
    hull: 100, hullMax: 100, collides: true, physicsBody: { schemaVersion: 1, shape: 'ball', dynamic: true,
      radius: 2, mass: 60, inertiaY: 120 }, data: { kind: 'cargo', commodityId: 'cmdty_electronics', amount: 3,
        cargoIdentity: { ownerId: 'original-trader', ownerName: 'Original trader' }, ...cargoData } });
  native.syncFromEntities(s.entityList); native.step(1 / 60, s.tick);
  const system = sim.registry.get('palletJack');
  const row = begin ? system.begin(actor, cargo, 'fixture-pallet-jack') : null;
  if (begin) assert.ok(row, 'real ordinary cargo should bind');
  const tick = () => { s.tick++; s.simTime += 1 / 60;
    getCombatKernel(sim.registry.ctx).prePhysics(1 / 60);
    system.update(1 / 60, s); native.syncFromEntities(s.entityList); native.step(1 / 60, s.tick); };
  const until = (fn, cap = 250) => { let n = 0; while (!fn() && n++ < cap) tick();
    assert.ok(fn(), `finite owner failed to reach expected phase: ${row?.phase}`); };
  const close = () => { system.destroy(); sim.dispose(); native.dispose(); };
  return { sim, s, native, helpers, system, row, player, actor, cargo, origin, tick, until, close };
}

test('real cargo condition rejects protected sources, stale embargo and no-cargo introduction', async () => {
  const h = await fixture({ begin: false });
  try {
    for (const data of [{ missionId: 'quest' }, { persistenceOwner: 'salvage' }, { freightCustodyPod: {} },
      { salvorClaimedBy: 'foreman' }, { cargoManifest: { protected: true } }, { pickupEmbargoUntil: 10 }]) {
      assert.equal(palletJackCargoEligible({ ...h.cargo, data: { ...h.cargo.data, ...data } }, 2), false);
    }
    let spawned = 0, reason;
    h.cargo.data.missionId = 'quest';
    palletJackEncounter.fire({ abort(_live, why) { reason = why; }, spawnShips() { spawned++; return []; } }, {}, h.s);
    assert.equal(spawned, 0); assert.equal(reason, 'no_real_loose_cargo');
    assert.equal(h.system.serialize().introduced, false);
  } finally { h.close(); }
});

test('full target and grab warning; moved load misses, a later real body capture preserves mass/title', async () => {
  const h = await fixture();
  try {
    h.tick(); assert.equal(h.row.phase, 'target');
    h.until(() => h.row.phase === 'grab'); const start = h.s.tick;
    for (let i = 0; i < C.grabTicks - 1; i++) h.tick();
    assert.equal(h.row.clampId, null); assert.equal(h.native.attachments.size, 0);
    const record = h.native.records.get(h.cargo.id);
    record.body.setTranslation({ x: h.origin.x + 60, y: 0, z: h.origin.z }, true); h.cargo.pos.x = h.origin.x + 60;
    h.tick(); assert.equal(h.row.phase, 'approach'); assert.equal(h.row.clampId, null);
    record.body.setTranslation({ x: h.origin.x + 7, y: 0, z: h.origin.z }, true); record.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    h.cargo.pos.x = h.origin.x + 7; h.cargo.vel.x = 0;
    h.until(() => h.row.phase === 'escape');
    assert.ok(h.s.tick >= start + C.grabTicks);
    assert.ok(h.system._line()); assert.equal(h.native.attachments.size, 1);
    assert.equal(h.actor.mass + h.cargo.mass, 160);
    assert.equal(h.native.records.get(h.actor.id).body.mass(), 100);
    assert.ok(Math.abs(h.native.records.get(h.cargo.id).body.mass() - 60) < 1e-4);
    assert.deepEqual(h.cargo.data.cargoIdentity, { ownerId: 'original-trader', ownerName: 'Original trader' });
    assert.ok(palletJackForkContains(h.actor, h.cargo));
    assert.equal(h.s.entityList.filter(e => e.alive && e.data?.palletJackCargoId).length, 1);
  } finally { h.close(); }
});

test('contact cannot vacuum before windup or during actual native custody; stale flags alone do not claim a clamp', async () => {
  const h = await fixture();
  try {
    assert.equal(pickupCustodyAllowsCollector(h.cargo, h.actor, h.player.id), false);
    assert.equal(pickupCustodyAllowsCollector(h.cargo, h.player, h.player.id), true);
    h.until(() => h.row.phase === 'escape');
    assert.equal(isPalletJackClampedPickup(h.cargo), true);
    assert.equal(pickupCustodyAllowsCollector(h.cargo, h.player, h.player.id), false);
    const line = h.row.clampId;
    h.native.cutAttachment({ attachmentId: line });
    assert.equal(isPalletJackClampedPickup(h.cargo), false);
    assert.equal(pickupCustodyAllowsCollector(h.cargo, h.player, h.player.id), true);
    assert.equal(palletJackPresentation(h.s, h.actor).loaded, false);
  } finally { h.close(); }
});

test('parley waits for actual native absence and emits one release; living thief preserves the load momentum', async () => {
  const h = await fixture();
  try {
    h.until(() => h.row.phase === 'escape'); h.actor.hull = 60;
    h.s.player.targetId = h.actor.id; h.tick(); assert.equal(h.row.phase, 'negotiating');
    const receipts = [], credits = h.s.player.credits; h.sim.bus.on('palletJack:released', p => receipts.push(p));
    const port = h.helpers.combatPhysics;
    h.helpers.combatPhysics = { ...port, cutAttachment() { return false; } };
    const choice = { incidentId: h.row.id, revision: h.row.revision };
    assert.deepEqual(h.system.demandDrop(choice), { ok: false, reason: 'native_release_pending' });
    assert.equal(receipts.length, 0); assert.equal(h.row.releaseDone, undefined);
    assert.equal(pickupCustodyAllowsCollector(h.cargo, h.player, h.player.id), false, 'requested cut still has native custody');
    const nativeLine = h.row.clampId; h.native.cutAttachment({ attachmentId: nativeLine });
    h.helpers.combatPhysics = port;
    h.cargo.vel.x = 4; const before = { ...h.cargo.vel };
    assert.equal(h.system.release('parley').ok, true);
    assert.equal(receipts.length, 1); assert.equal(h.actor.alive, true); assert.equal(h.cargo.alive, true);
    assert.deepEqual({ ...h.cargo.vel }, before); assert.equal(h.cargo.data.masslineLatched, undefined);
    assert.equal(h.system.release('parley').ok, false); assert.equal(receipts.length, 1);
    assert.equal(h.s.player.credits, credits, 'release has no currency writer');
  } finally { h.close(); }
});

test('Continue pending custody blocks consumption without calling the load clamped; failed rebind expires on the original', async () => {
  const h = await fixture();
  try {
    h.until(() => h.row.phase === 'escape');
    const saved = h.system.serialize(), ph = h.sim.registry.get('physics');
    ph._nativeRestoreDeferred = true; h.system.deserialize(saved); h.system.afterContinue();
    const pendingDeadline = h.system._row.incident.restoreDeadlineTick;
    h.system.afterContinue();
    assert.equal(h.system._row.incident.restoreDeadlineTick, pendingDeadline, 'the explicit Continue hook and save:loaded do not renew the same reservation');
    assert.equal(h.system._row.incident.phase, 'acquiring');
    assert.equal(palletJackPresentation(h.s, h.actor).loaded, false);
    assert.equal(isPalletJackClampedPickup(h.cargo), false);
    assert.equal(pickupCustodyAllowsCollector(h.cargo, h.player, h.player.id), false);
    assert.equal(h.cargo.data.masslineLatched, true);
    ph._nativeRestoreDeferred = false; h.tick();
    assert.equal(palletJackPresentation(h.s, h.actor).loaded, true);
    ph._nativeRestoreDeferred = true; h.system.deserialize(h.system.serialize()); h.system.afterContinue();
    for (let n = 0; n < 121; n++) h.tick();
    const r = h.system._row.incident;
    assert.equal(r.releaseDone, true); assert.equal(r.receipts.find(p => p.kind === 'release').reason, 'restore_unconfirmed');
    assert.equal(h.cargo.alive, true); assert.equal(h.cargo.data.masslineLatched, undefined);
    assert.equal(pickupCustodyAllowsCollector(h.cargo, h.player, h.player.id), true);
    assert.equal(h.s.entityList.filter(e => e.alive && e.data?.palletJackCargoId === r.targetCargoId).length, 1);
  } finally { h.close(); }
});

test('existing player MassLine remains active when sustained physical contest opens the thief clamp', async () => {
  const h = await fixture();
  try {
    h.until(() => h.row.phase === 'escape');
    const result = getCombatKernel(h.sim.registry.ctx).attachments.create({ defId: 'tether_standard',
      ownerId: h.player.id, targetId: h.cargo.id, sourceWorld: h.player.pos, targetWorld: h.cargo.pos });
    assert.equal(result.ok, true);
    // Pull through the real player line with the native physical force API; do not move the
    // cargo by assignment or invent a clamp break from the presence of a semantic line.
    for (let i = 0; i < 180 && !h.row.releaseDone; i++) {
      writePhysicsControl(h.player, { mode: 'controlled', force: { x: 0, y: 0, z: 4800 }, source: 'fixture-pilot' });
      h.tick();
    }
    assert.ok(h.row.releaseDone, JSON.stringify({ phase: h.row.phase, contested: h.row.contestedTicks,
      actor: h.actor.pos, cargo: h.cargo.pos, player: h.player.pos }));
    assert.equal(h.row.receipts.find(p => p.kind === 'release').reason, 'massline_contested');
    assert.equal(h.s.combat.attachments.byId[result.attachment.id].state, 'active');
    assert.ok(h.native.attachments.has(result.attachment.id));
    assert.equal(h.cargo.alive, true);
  } finally { h.close(); }
});

test('front fork subsystem is actual existing damage authority; thief loss never duplicates the original cargo', async () => {
  const h = await fixture();
  try {
    h.until(() => h.row.phase === 'escape');
    const packet = scalarHitToDamagePacket({ damage: 90, damageType: 'kinetic', pos: { x: h.actor.pos.x + 7, z: h.actor.pos.z + 7 } });
    getCombatKernel(h.sim.registry.ctx).routeDamage({ attackerId: h.player.id, targetId: h.actor.id, packet });
    h.tick(); assert.equal(h.s.combat.entities[h.actor.id].capabilities.transport_clamp, false);
    assert.equal(h.row.releaseDone, true); assert.equal(h.cargo.alive, true);
    h.helpers.removeEntity(h.actor.id); h.native.syncFromEntities(h.s.entityList);
    const saved = h.system.serialize(); h.system.deserialize(saved); h.system.afterContinue(); h.tick();
    assert.equal(h.row.actorDestroyed, true);
    assert.equal(h.s.entityList.filter(e => e.alive && e.data?.palletJackCargoId).length, 1);
    assert.equal(h.s.entityList.filter(e => e.alive && e.data?.palletJackActorId).length, 0);
  } finally { h.close(); }
});

test('same provenance crosses a real boundary and repeated source restore waits for native custody', async () => {
  const h = await fixture();
  try {
    h.until(() => h.row.phase === 'escape');
    const end = sectorGlobalOrigin(h.row.routeEndpointId), a = h.native.records.get(h.actor.id), c = h.native.records.get(h.cargo.id);
    a.body.setTranslation({ x: end.x, y: 0, z: end.z }, true);
    c.body.setTranslation({ x: end.x + 7, y: 0, z: end.z }, true);
    h.actor.pos = { ...end }; h.cargo.pos = { x: end.x + 7, z: end.z };
    h.tick(); assert.equal(h.row.phase, 'escaped');
    const id = h.row.targetCargoId, envelope = h.system.serialize();
    h.system.deserialize(envelope); h.system.afterContinue(); h.tick();
    assert.equal(h.system._row.incident.targetCargoId, id);
    assert.equal(h.s.entityList.filter(e => e.alive && e.data?.palletJackCargoId === id).length, 1);
    assert.equal(palletJackPresentation(h.s, h.actor).loaded, true);
    h.system.deserialize(h.system.serialize()); h.system.afterContinue(); h.tick();
    assert.equal(h.s.entityList.filter(e => e.alive && e.data?.palletJackCargoId === id).length, 1);
    h.native._simTick = h.s.tick - 3;
    assert.equal(palletJackPresentation(h.s, h.actor).nativeBodyReady, false);
    assert.equal(palletJackPresentation(h.s, h.actor).loaded, false);
  } finally { h.close(); }
});

test('the existing flight intent owns motion and an obstruction drops instead of clipping', async () => {
  const h = await fixture();
  try {
    h.until(() => h.row.phase === 'escape');
    const intent = palletJackDecision({ entityId: h.actor.id, maneuver: { kind: 'intercept' }, fire: true }, h.s);
    assert.equal(intent.fire, false); assert.equal(intent.maneuver.enemyMindOwned, true);
    assert.equal(intent.maneuver.speedLimit, 35);
    const p = h.row.routeEndpoint, dx = p.x - h.actor.pos.x, dz = p.z - h.actor.pos.z, l = Math.hypot(dx, dz);
    h.helpers.spawnEntity({ type: 'station', pos: { x: h.actor.pos.x + dx / l * 65, z: h.actor.pos.z + dz / l * 65 },
      radius: 25, mass: 10000, hull: 500, physicsBody: { schemaVersion: 1, shape: 'ball', dynamic: false,
        radius: 25, mass: 10000 }, data: {} });
    h.tick(); assert.equal(h.row.releaseDone, true);
    assert.equal(h.row.receipts.find(p => p.kind === 'release').reason, 'exit_blocked');
    assert.equal(h.cargo.alive, true);
  } finally { h.close(); }
});
