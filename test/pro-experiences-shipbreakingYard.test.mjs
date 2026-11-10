import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { applyFrameOrigin } from '../src/core/coordinates.js';
import { ships, makeShipEntitySpec } from '../src/systems/ships.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { combat } from '../src/systems/combat.js';
import { economy } from '../src/systems/economy.js';
import { cargo as cargoSystem } from '../src/systems/cargo.js';
import { mining } from '../src/systems/mining.js';
import { world } from '../src/systems/world.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { asteroidFormations } from '../src/systems/asteroidFormations.js';
import { scanner } from '../src/systems/scanner.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { serializeCombatState, restoreCombatState } from '../src/combat/persistence.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { shipbreakingYard } from '../src/features/shipbreakingYard/runtime.js';
import { SHIPBREAKING_LAYOUTS, SHIPBREAKING_YARD_SITE as SITE, createYardLayout } from '../src/features/shipbreakingYard/layouts.js';
import { yardBodyIdentity } from '../src/features/shipbreakingYard/physics.js';
import { createShipbreakingYardPresentation, SHIPBREAKING_DECISION_ID } from '../src/features/shipbreakingYard/presentation.js';
import { createShipbreakingYardAudio } from '../src/features/shipbreakingYard/audio.js';
import { normalizeYardState } from '../src/features/shipbreakingYard/model.js';
import { save } from '../src/save/saveSystem.js';
import { buildEncounterCatalog } from '../src/data/encounters/catalog.js';
import * as yardEncounter from '../src/data/encounters/8201-pro-yard.js';
import * as THREE from 'three';
import { createShipbreakingYardRenderer, YARD_CUE_COLORS } from '../src/features/shipbreakingYard/render.js';
import { createShipbreakingYardSystemEntries, SHIPBREAKING_YARD_CAPABILITIES,
  SHIPBREAKING_YARD_MAIN_TO_SIM_EVENTS } from '../src/features/shipbreakingYard/integration.js';
import { serializeShipbreakingYard, shipbreakingYardSavePlanEntry, serializeShipbreakingYardSteps,
  restoreShipbreakingYardSteps, afterContinueShipbreakingYard } from '../src/features/shipbreakingYard/save.js';
import { projectShipbreakingYardView, SHIPBREAKING_YARD_EVENT_BRIDGE_ADAPTERS } from '../src/features/shipbreakingYard/bridge.js';
import { createShipbreakingYardBrowser, presentShipbreakingYardFrame, releaseShipbreakingYardPresentation } from '../src/features/shipbreakingYard/browser.js';
import { EVENT_BRIDGE_ADAPTERS, projectBridgeEvent } from '../scripts/lib/simEventBridge.mjs';
import { sectorLocalToGlobalForSector, globalToSectorLocalForSector } from '../src/data/sectorCoordinates.js';
import { hullEnvelopeWu, proxyOuterRadiusWu } from '../src/data/collisionProxyManifests.js';
import { asteroidColliderRadius } from '../src/data/asteroidColliders.js';
import { forEachFieldRock } from '../src/world/livingWorldViews.js';
import { WORLD_SITE_MANIFESTS } from '../src/data/worldSiteManifests.js';

// Focused explicit production-owner composition. This is not a whole-game or visual verdict.
let previousFlags;
test.before(() => { previousFlags = snapshotFeatureMaps(); applyFeatureConfigToMaps(PRODUCTION_FEATURES); });
test.after(() => restoreFeatureMaps(previousFlags));
const DT = 1 / 60;
const copy = value => JSON.parse(JSON.stringify(value));
const sumMomentum = bodies => bodies.reduce((out, body) => ({ x: out.x + body.mass * body.vel.x, z: out.z + body.mass * body.vel.z }), { x: 0, z: 0 });
const okay = result => assert.equal(result?.ok, true, result?.reason || JSON.stringify(result));
function installYardBridgeAdapter() {
  const previous = new Map(Object.keys(SHIPBREAKING_YARD_EVENT_BRIDGE_ADAPTERS).map(key => [key, EVENT_BRIDGE_ADAPTERS[key]]));
  Object.assign(EVENT_BRIDGE_ADAPTERS, SHIPBREAKING_YARD_EVENT_BRIDGE_ADAPTERS);
  return () => { for (const [key, value] of previous) { if (value === undefined) delete EVENT_BRIDGE_ADAPTERS[key]; else EVENT_BRIDGE_ADAPTERS[key] = value; } };
}

async function fixture({ discover = true, seed = 8201, playerTow = false, collectors = false, worldOwner = false } = {}) {
  const sim = createSimulation({ seed, systems: [ships, economy, ...(worldOwner ? [world] : []), ...(collectors ? [cargoSystem, mining] : []), physics, combat, scanner, ...(playerTow ? [tetherGameplay] : []), shipbreakingYard] });
  const s = sim.state; s.mode = 'flight'; s.world.currentSectorId = SITE.sectorId;
  s.input.actions ||= {};
  s.settings.gameplay.physicsBackend = 'rapier-dynamic'; s.ui.docked = false; s.ui.screenStack = [];
  sim.registry.get('ships').newGame();
  const player = sim.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: s.player, pos: { x: 500, z: 580 }, fittings: [] }));
  s.playerId = player.id; sim.registry.get('economy').grantCredits(10_000, 'shipbreaking-fixture');
  const owner = sim.registry.get('shipbreakingYard'), native = sim.registry.get('physics'), kernel = getCombatKernel(owner.ctx);
  const offers = [], cues = [], receipts = [];
  sim.bus.on('shipbreakingYard:offer', row => offers.push(row));
  sim.bus.on('shipbreakingYard:cue', row => cues.push(row));
  sim.bus.on('shipbreakingYard:receipt', row => receipts.push(row));
  function tick(count = 1) {
    for (let i = 0; i < count; i++) {
      s.tick++; s.simTime = s.tick * DT;
      sim.registry.get('combat').update(DT, s);
      if (playerTow) sim.registry.get('tetherGameplay').update(DT, s);
      owner.update(DT, s);
      native.update(DT, s);
    }
  }
  async function admit() { assert.equal(await native.prepareBackend(s), true, 'real Rapier backend must admit originals'); native.update(DT, s); tick(3); }
  function job(id = 'lark') { return owner.getJob(id); }
  function body(id = 'engine', layout = 'lark') { return owner.physics.body(job(layout), id); }
  function near(entity) {
    assert.ok(entity, 'expected an original body');
    const offset = [[0, -70], [-70, 0], [0, 70], [70, 0], [-48, -48], [48, 48]].find(([x, z]) =>
      !s.entityList.some(other => other !== player && other.alive && Math.hypot(other.pos.x - entity.pos.x - x, other.pos.z - entity.pos.z - z) < other.radius + player.radius + 8));
    assert.ok(offset, 'fixture approach must not shove the wreck while positioning the pilot');
    player.pos.set(entity.pos.x + offset[0], 0, entity.pos.z + offset[1]); player.vel.copy(entity.vel); native.update(DT, s);
  }
  function accept(id = 'lark') { near(body(createYardLayout(id).modules[0].id, id)); return owner.accept(id, s.shipbreakingYard.revision); }
  function disconnect(id = 'engine-clamp', layout = 'lark') {
    const def = createYardLayout(layout).couplings.find(row => row.id === id); near(body(def.b, layout));
    return owner.disconnect(id, s.shipbreakingYard.revision, job(layout).id);
  }
  function receiver(entity) {
    const target = owner.receiver(); assert.ok(target?.pos, 'live receiver required');
    entity.pos.set(target.pos.x, 0, target.pos.z); entity.vel.set(0, 0, 0); entity.angVel = 0;
    player.pos.set(target.pos.x + 52, 0, target.pos.z); player.vel.set(0, 0, 0);
    native.update(DT, s); return target;
  }
  function tow(entity) {
    const result = kernel.attachments.create({ defId: 'attachment_massline', ownerId: player.id, targetId: entity.id, sourceWorld: player.pos, targetWorld: entity.pos });
    okay(result); return result.attachment;
  }
  function deliver(moduleId = 'engine', layout = 'lark') {
    const entity = body(moduleId, layout); receiver(entity); if (!owner.physics.towLine(entity)) tow(entity);
    return owner.deliver(moduleId, s.shipbreakingYard.revision, job(layout).id);
  }
  function close() { owner.destroy?.(); native._disableSg02DynamicAuthority?.(); sim.dispose(); }
  if (discover) { owner.discover({ anchor: { x: 500, z: 500 }, sectorId: SITE.sectorId }); await admit(); }
  return { sim, s, owner, player, native, kernel, offers, cues, receipts, tick, admit, job, body, near, accept, disconnect, receiver, tow, deliver, close };
}

test('three visible original assemblies have distinct extraction sequences and deterministic repeat conditions', async () => {
  const h = await fixture({ collectors: true });
  try {
    const hold = copy(h.s.player.cargo), credits = h.s.player.credits, collector = h.sim.registry.get('mining');
    const pickupReceipts = []; h.sim.bus.on('pickup:collected', row => pickupReceipts.push(row));
    assert.equal(SHIPBREAKING_LAYOUTS.length, 3);
    for (const layout of SHIPBREAKING_LAYOUTS) {
      const lot = h.job(layout.id); assert.equal(lot.status, 'offered');
      assert.ok(layout.modules.some(module => module.beginner));
      for (const module of layout.modules) {
        const original = h.body(module.id, layout.id); assert.ok(original);
        assert.equal(original.data.worldRecordId, yardBodyIdentity(lot.id, module.id));
        assert.equal(h.owner.physics.nativeReady(original), true);
        assert.equal(original.physicsBody.shape, 'compound', 'native collision follows the packaged asset proxy');
        assert.ok(original.physicsBody.collisionProxyManifest.id.includes(module.assetId));
        assert.deepEqual(original.data.salvagePool, {}, 'another salvage writer cannot sell this original twice');
        assert.equal(collector._collectPayload(original, h.player), false, 'the real payload collector refuses this physical original');
        const pickupAttempt = collector._collectPickupViaEvent(original, h.player);
        assert.equal(pickupAttempt.accepted, 0); assert.equal(pickupAttempt.legacyFullConsume, false);
        assert.equal(original.alive, true); assert.equal(h.s.entities.get(original.id), original,
          'the ordinary scoop seam cannot retire machinery as an empty pickup');
      }
      for (const coupling of layout.couplings) {
        const status = h.owner.physics.lineStatus(lot, coupling.id);
        assert.equal(status.connected, true, `${layout.id}/${coupling.id} is a real combat attachment`);
        assert.equal(status.admitted, true, `${layout.id}/${coupling.id} is a real native joint`);
      }
      assert.deepEqual(createYardLayout(layout.id, 7), createYardLayout(layout.id, 7));
      assert.notDeepEqual(createYardLayout(layout.id, 7), createYardLayout(layout.id, 8));
    }
    assert.equal(createYardLayout('bellwether').couplings.some(row => row.requiresClear.length), true);
    assert.ok(createYardLayout('vesper').hazard);
    assert.equal(h.s.entityList.filter(entity => entity.alive && entity.data?.shipbreakingModuleId).length, 16);
    assert.deepEqual(h.s.player.cargo, hold); assert.equal(h.s.player.credits, credits); assert.equal(pickupReceipts.length, 0);
  } finally { h.close(); }
});

test('inspect, refusal and cancel spend nothing; acceptance keeps the exact preview and cannot charge twice', async () => {
  const h = await fixture();
  try {
    const original = h.body(), before = h.s.player.credits;
    h.owner.offerCatalog(); h.owner.inspect('lark');
    h.owner.command({ actionId: 'leave', revision: h.s.shipbreakingYard.revision });
    assert.equal(h.s.player.credits, before);
    assert.equal(h.job().status, 'offered');
    const revision = h.s.shipbreakingYard.revision; okay(h.accept());
    assert.equal(h.body(), original, 'buying never replaces the inspected original');
    assert.equal(h.s.player.credits, before - createYardLayout('lark').fee);
    assert.equal(h.owner.accept('lark', revision).ok, false);
    assert.equal(h.owner.accept('lark', h.s.shipbreakingYard.revision).ok, false);
    assert.equal(h.s.player.credits, before - createYardLayout('lark').fee);
    h.sim.registry.get('economy').chargeCredits(h.s.player.credits, 'fixture-empty-wallet');
    assert.equal(h.accept('vesper').ok, false); assert.equal(h.job('vesper').status, 'offered');
  } finally { h.close(); }
});

test('native separation keeps body identity and momentum; a real Massline transmits player force', async () => {
  const h = await fixture();
  try {
    okay(h.accept()); const engine = h.body(), frame = h.body('frame'), identity = engine.data.worldRecordId;
    const bodies = createYardLayout('lark').modules.map(module => h.body(module.id));
    h.player.pos.set(engine.pos.x - 62, 0, engine.pos.z); h.player.vel.set(0, 0, 0); h.native.update(DT, h.s);
    h.tow(engine);
    queuePhysicsImpulse(h.player, { x: -h.player.mass * 7, z: 0 }, { tag: 'fixture-player-pull', tick: h.s.tick });
    h.tick(20);
    assert.equal(h.owner.physics.lineStatus(h.job(), 'engine-clamp').connected, true, 'a gentle pull loads the assembly without breaking it');
    const before = sumMomentum(bodies);
    const priorVelocities = bodies.map(body => ({ x: body.vel.x, z: body.vel.z }));
    okay(h.owner.disconnect('engine-clamp', h.s.shipbreakingYard.revision, h.job().id));
    assert.equal(h.body(), engine); assert.equal(engine.data.worldRecordId, identity);
    assert.equal(h.owner.physics.lineStatus(h.job(), 'engine-clamp').connected, false);
    const after = sumMomentum(bodies);
    assert.ok(Math.hypot(after.x - before.x, after.z - before.z) < 1e-6, 'structural release cannot invent net momentum');
    assert.deepEqual(bodies.map(body => ({ x: body.vel.x, z: body.vel.z })), priorVelocities, 'the separation event never teleports or rewrites velocities');
    assert.ok(Math.hypot(engine.vel.x, engine.vel.z) > .01, 'real tow force loaded the component');
    assert.ok(Math.hypot(frame.vel.x, frame.vel.z) > .001, 'the connected wreck answered the same pull');
    const initial = { x: engine.pos.x, z: engine.pos.z };
    queuePhysicsImpulse(h.player, { x: -h.player.mass * 14, z: 0 }, { tag: 'fixture-player-pull', tick: h.s.tick });
    h.tick(120);
    assert.ok(Math.hypot(engine.pos.x - initial.x, engine.pos.z - initial.z) > 1, 'native line actually moved the same salvage body');
    assert.equal(h.owner.physics.towLine(engine)?.state, 'active');
  } finally { h.close(); }
});

test('ordinary Massline cursor acquisition and the existing tether input latch the same yard original', async () => {
  const h = await fixture({ playerTow: true });
  try {
    okay(h.accept()); const original = h.body(), before = h.s.player.credits;
    h.near(original); h.s.input.aimWorld = { x: original.pos.x, z: original.pos.z }; h.s.input.aimIntentActive = true;
    const denied = []; h.sim.bus.on('tether:latchDenied', row => denied.push(row));
    h.s.input.actions.tetherFire = true; h.tick();
    assert.equal(h.s.masslineAcquisition?.selected?.targetId, original.id, 'the press consumes the current precise pointer candidate');
    h.s.input.actions.tetherFire = false; h.tick();
    assert.equal(h.s.player.tether?.targetId, original.id, JSON.stringify(denied));
    const line = h.owner.physics.towLine(original);
    assert.ok(line, 'the ordinary gameplay owner admitted a native line'); assert.equal(line.defId, 'tether_standard');
    assert.equal(h.body(), original); assert.equal(h.s.player.credits, before);
    h.s.input.actions.massline = { cut: true }; h.tick();
    assert.equal(h.owner.physics.towLine(original), null); assert.equal(h.body(), original);
    assert.equal(h.owner.physics.lineStatus(h.job(), 'engine-clamp').connected, true, 'cutting the player line leaves the structural clamp intact');
  } finally { h.close(); }
});

test('normal flight inputs tow the original from its berth to an intact paid delivery through real native physics', async () => {
  const sim = createSimulation({ seed: 1, systems: [ships, economy, flightV3, physics, combat, tetherGameplay, shipbreakingYard] });
  const s = sim.state, native = sim.registry.get('physics'), yard = sim.registry.get('shipbreakingYard');
  try {
    const anchor = { x: 500, z: 500 }, start = { x: 470, z: 500 };
    const receiver = { x: anchor.x + SITE.receiverOffset.x, z: anchor.z + SITE.receiverOffset.z };
    const range = Math.hypot(receiver.x - start.x, receiver.z - start.z);
    const dir = { x: (receiver.x - start.x) / range, z: (receiver.z - start.z) / range };
    const heading = Math.atan2(dir.z, dir.x), limit = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
    s.mode = 'flight'; s.world.currentSectorId = SITE.sectorId; s.settings.gameplay.physicsBackend = 'rapier-dynamic';
    s.ui.docked = false; s.ui.screenStack = []; sim.registry.get('ships').newGame();
    const player = sim.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: s.player,
      pos: { x: start.x + dir.x * 48, z: start.z + dir.z * 48 }, fittings: [] }));
    player.rot = heading; // Initial fixture heading, before native admission. No later body-pose writes.
    s.playerId = player.id; sim.registry.get('economy').grantCredits(1000, 'yard-native-pilot-fixture');
    s.input = { moveZ: 0, moveX: 0, turnIntent: 0, brake: false, boost: false,
      aimWorld: { ...start }, aimIntentActive: true, actions: {} };
    okay(yard.discover({ anchor })); assert.equal(await native.prepareBackend(s), true);
    for (let index = 0; index < 5; index++) sim.step(DT);
    const job = yard.getJob('lark'), original = yard.physics.body(job, 'engine');
    const identity = original.data.identityKey, id = original.id;
    okay(yard.accept('lark', s.shipbreakingYard.revision));
    s.input.aimWorld = { x: original.pos.x, z: original.pos.z }; s.input.actions.tetherFire = true;
    sim.step(DT); s.input.actions.tetherFire = false; sim.step(DT);
    assert.equal(yard.physics.towLine(original)?.defId, 'tether_standard');
    okay(yard.disconnect('engine-clamp', s.shipbreakingYard.revision, job.id));
    const begin = { x: original.pos.x, z: original.pos.z, hull: original.hull }, credits = s.player.credits;
    let delivered = false;
    for (let index = 0; index < 7200; index++) {
      const distance = Math.hypot(receiver.x - original.pos.x, receiver.z - original.pos.z);
      const forwardSpeed = player.vel.x * dir.x + player.vel.z * dir.z, goal = distance > 70 ? 9 : 4;
      const turn = Math.atan2(Math.sin(heading - player.rot), Math.cos(heading - player.rot));
      s.input.turnIntent = limit(turn * 1.2 - player.angVel * .4, -1, 1);
      s.input.moveZ = limit((goal - forwardSpeed) * .04, 0, .16);
      s.input.moveX = 0; s.input.brake = forwardSpeed > goal + 1; s.input.boost = false; s.input.aimIntentActive = false;
      sim.step(DT); // Every movement, steering, brake and line force goes through existing owners.
      assert.equal(original.id, id); assert.equal(original.data.identityKey, identity);
      if (yard.physics.deliveryGate(job, 'engine', yard.receiver()).ok) {
        assert.ok(Math.hypot(original.pos.x - begin.x, original.pos.z - begin.z) > 100);
        assert.ok(Math.hypot(original.vel.x, original.vel.z) <= SITE.receiverSpeed);
        assert.equal(original.hull, begin.hull, 'a careful flight preserves the actual machinery');
        okay(yard.deliver('engine', s.shipbreakingYard.revision, job.id)); delivered = true; break;
      }
      assert.ok(original.alive && yard.physics.towLine(original), 'the original and normal native line must survive the trip');
    }
    assert.equal(delivered, true, 'normal pilot inputs must reach a real delivery gate');
    assert.equal(job.modules.engine.status, 'delivered'); assert.equal(original.alive, false);
    assert.ok(s.player.credits > credits); const paid = s.player.credits;
    assert.equal(yard.deliver('engine', s.shipbreakingYard.revision, job.id).ok, false); assert.equal(s.player.credits, paid);
  } finally { yard.destroy(); native._disableSg02DynamicAuthority?.(); sim.dispose(); }
});

test('receiver rejects attached, unheld and unsafe originals; one native tow produces one economic receipt', async () => {
  const h = await fixture();
  try {
    okay(h.accept()); const original = h.body();
    assert.equal(h.owner.deliver('engine', h.s.shipbreakingYard.revision, h.job().id).ok, false);
    okay(h.disconnect()); h.receiver(original);
    assert.equal(h.owner.deliver('engine', h.s.shipbreakingYard.revision, h.job().id).ok, false, 'no line means no custody');
    const line = h.tow(original), scale = h.owner.receiver();
    original.pos.x = scale.pos.x + scale.radius - original.radius;
    const protruding = h.owner.deliver('engine', h.s.shipbreakingYard.revision, h.job().id);
    assert.equal(protruding.ok, false); assert.equal(protruding.reason, 'bring_original_inside_receiver', 'the measured packaged hull protrudes beyond its nominal radius');
    original.pos.x = scale.pos.x; original.vel.set(20, 0, 0);
    assert.equal(h.owner.deliver('engine', h.s.shipbreakingYard.revision, h.job().id).ok, false, 'fast cargo is not accepted');
    original.vel.set(0, 0, 0);
    const liveJoint = h.sim.helpers.combatPhysics;
    assert.equal(liveJoint.cutAttachment({ attachmentId: line.id, physicsHandle: line.physicsHandle, reason: 'fixture-remove-native-only' }), true);
    assert.equal(line.state, 'active');
    assert.equal(h.owner.deliver('engine', h.s.shipbreakingYard.revision, h.job().id).ok, false, 'a stale JS attachment cannot impersonate a native joint');
    h.kernel.attachments.reconcilePhysics();
    const before = h.s.player.credits; let reentry = null;
    h.sim.bus.on('credits:changed', () => { reentry = h.owner.deliver('engine', h.s.shipbreakingYard.revision, h.job().id); });
    okay(h.owner.deliver('engine', h.s.shipbreakingYard.revision, h.job().id));
    assert.equal(reentry?.ok, false, 'credit event reentry cannot replay settlement');
    assert.ok(h.s.player.credits > before); assert.equal(h.job().modules.engine.status, 'delivered');
    assert.equal(h.body(), null); const paid = h.s.player.credits;
    assert.equal(h.owner.deliver('engine', h.s.shipbreakingYard.revision, h.job().id).ok, false);
    h.tick(10); assert.equal(h.body(), null); assert.equal(h.s.player.credits, paid);
  } finally { h.close(); }
});

test('real combat damage lowers intact value and a wreck with a lost module still pays for survivors', async () => {
  const h = await fixture();
  try {
    okay(h.accept()); const engine = h.body(), cargo = h.body('cargo');
    const hit = h.sim.registry.get('combat').onHit({ targetId: engine.id, ownerId: h.player.id, damage: 32, damageType: 'kinetic', pos: engine.pos, origin: { kind: 'weapon', id: 'fixture-impact' } });
    okay(hit); h.tick(); assert.ok(h.job().modules.engine.condition < 1);
    h.owner.physics.damage(h.job(), 'cargo', cargo.hullMax * 2, 'fixture-lost-cargo'); h.tick(2);
    assert.equal(h.job().modules.cargo.status, 'lost');
    okay(h.disconnect()); const before = h.s.player.credits; okay(h.deliver());
    const paid = h.s.player.credits - before; assert.ok(paid > 0); assert.ok(paid < createYardLayout('lark').modules.find(module => module.id === 'engine').value);
    assert.equal(h.body('cargo'), null);
  } finally { h.close(); }
});

test('ordinary projectile sweeps strike original machinery and lower its intact payout', async () => {
  const h = await fixture();
  try {
    okay(h.accept()); const engine = h.body(), before = engine.hull;
    const hits = [];
    h.sim.bus.on('projectile:hit', row => hits.push(row));
    const shot = h.sim.spawn({ type: 'projectile', ownerId: h.player.id, team: 2,
      pos: { x: engine.pos.x, z: engine.pos.z + 20 }, vel: { x: 0, z: 2400 },
      radius: 1, collides: true, data: { damage: 32, damageType: 'kinetic', ttl: 3,
        spawnPos: { x: engine.pos.x, z: engine.pos.z - 20 }, maxDistance: 240 } });
    shot.prevPos.set(engine.pos.x, 0, engine.pos.z - 20);
    h.native.sweepProjectiles(DT, h.s);
    assert.ok(hits.some(row => row.targetId === engine.id), 'the actual projectile owner must admit the payload target');
    assert.ok(engine.hull < before, 'a shot must damage the machinery through combat');
    h.owner.update(DT, h.s);
    assert.ok(h.job().modules.engine.condition < before / engine.hullMax);
  } finally { h.close(); }
});

test('promptDeck carries only current sim intents and clears decisions on save, dock and sector exit', () => {
  const bus = createBus(), actions = [], offered = []; let closed = 0;
  const adapter = createShipbreakingYardPresentation({ deckProvider: () => ({ offerDecision: row => { offered.push(row); return true; }, resolveDecision: id => { assert.equal(id, SHIPBREAKING_DECISION_ID); closed++; } }) });
  adapter.init({ state: { simTime: 0 }, bus });
  try {
    bus.on('shipbreakingYard:action', row => actions.push(row));
    const row = { revision: 12, title: 'Lark', jobId: 'yard:12', actions: [
      { id: 'accept', label: 'BUY · 80 CR', layoutId: 'lark' },
      { id: 'disconnect', label: 'OPEN CLAMP', couplingId: 'engine-clamp', moduleId: 'engine' },
      { id: 'blocked', label: 'UNAVAILABLE', disabled: true },
    ] };
    bus.emit('shipbreakingYard:offer', row); const prompt = offered.at(-1);
    assert.equal(prompt.onChoose('blocked'), false); assert.equal(prompt.onChoose('forged'), false); assert.equal(actions.length, 0);
    prompt.onChoose('accept'); assert.deepEqual(actions.at(-1), { actionId: 'accept', revision: 12, jobId: 'yard:12', layoutId: 'lark' });
    prompt.onChoose('disconnect'); assert.equal(actions.at(-1).couplingId, 'engine-clamp'); assert.equal(actions.at(-1).moduleId, 'engine');
    prompt.onChoose('leave'); assert.equal(actions.at(-1).actionId, 'leave');
    const before = closed; for (const event of ['save:restoring', 'dock:docked', 'sector:exit']) bus.emit(event);
    assert.equal(closed, before + 3);
    adapter.destroy(); const count = actions.length; bus.emit('shipbreakingYard:offer', row); assert.equal(actions.length, count);
  } finally { adapter.destroy(); bus.clear(); }
});

test('contextual audio reuses mixer cues, bounds strain spam, and resets after a fresh run', () => {
  const bus = createBus(), nextBus = createBus(), state = { simTime: 0 }, cues = [], nextCues = [], audio = createShipbreakingYardAudio();
  bus.claimPresentationDrain(); nextBus.claimPresentationDrain();
  bus.on('audio:cue', row => cues.push(row)); audio.init({ bus, state });
  nextBus.on('audio:cue', row => nextCues.push(row));
  try {
    for (const kind of ['discovered', 'strain', 'released', 'hazard', 'delivered']) bus.emit('shipbreakingYard:cue', { kind, pos: { x: 1, z: 2 } });
    assert.equal(cues.length, 5);
    bus.emit('shipbreakingYard:cue', { kind: 'strain' }); assert.equal(cues.length, 5);
    state.simTime = 3; bus.emit('shipbreakingYard:cue', { kind: 'strain' }); assert.equal(cues.length, 6);
    audio.newGame(); bus.emit('shipbreakingYard:cue', { kind: 'strain' }); assert.equal(cues.length, 7);
    audio.destroy(); bus.emit('shipbreakingYard:cue', { kind: 'released' }); assert.equal(cues.length, 7);
    audio.init({ bus: nextBus, state: { simTime: 0 } });
    bus.drainPresentationTail(); assert.equal(nextCues.length, 0, 'a previous run cannot voice a captured callback through the new mixer context');
    bus.emit('shipbreakingYard:cue', { kind: 'delivered' }); bus.drainPresentationTail(); assert.equal(nextCues.length, 0);
    nextBus.emit('shipbreakingYard:cue', { kind: 'strain' }); assert.equal(nextCues.length, 1, 'the new context has an independent cooldown');
    audio.destroy(); nextBus.drainPresentationTail(); assert.equal(nextCues.length, 1);
  } finally { audio.destroy(); bus.clear(); nextBus.clear(); }
});

test('ordinary encounter and approach both expose the persistent yard without buying or spawning a second lot', async () => {
  const h = await fixture({ discover: false });
  try {
    const station = h.sim.spawn({ type: 'station', team: 2, pos: { x: 0, z: 0 }, radius: 40, mass: 1e9, hull: 1e9,
      physicsBody: { schemaVersion: 1, dynamic: false, shape: 'ball', radius: 40, mass: 1e9 }, data: { stationId: SITE.stationId } });
    assert.ok(station);
    const catalog = buildEncounterCatalog([yardEncounter]); assert.ok(catalog.pro_shipbreaking_yard);
    const before = h.s.player.credits, resolved = [], aborted = [];
    const director = { registry: h.sim.registry, resolve: (live, result) => resolved.push(result), abort: (live, reason) => aborted.push(reason) };
    yardEncounter.runtime.fire(director, { id: 'fixture:yard' }, h.s);
    assert.deepEqual(resolved, ['discovered']); assert.deepEqual(aborted, []);
    assert.equal(h.s.shipbreakingYard.discovered, true); assert.equal(h.s.player.credits, before);
    const ids = Object.keys(h.s.shipbreakingYard.jobs);
    const anchor = h.s.shipbreakingYard.anchor; h.player.pos.set(anchor.x, 0, anchor.z + 120);
    await h.admit(); h.tick(); assert.ok(h.offers.some(offer => offer.kind === 'catalog'));
    yardEncounter.runtime.fire(director, { id: 'fixture:yard-repeat' }, h.s);
    assert.deepEqual(Object.keys(h.s.shipbreakingYard.jobs), ids); assert.equal(h.s.player.credits, before);
    h.owner.command({ actionId: 'leave', revision: h.s.shipbreakingYard.revision });
    const offers = h.offers.length; h.tick(30); assert.equal(h.offers.length, offers, 'leaving is respected while the player remains nearby');
  } finally { h.close(); }
});

test('actual Ceres approach and first station scan discover a clear native yard; marked courses keep manual flight', async () => {
  const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const local = position => globalToSectorLocalForSector(position, SITE.sectorId);
  const envelope = entity => Math.max(hullEnvelopeWu(entity) || entity.radius || 0,
    entity.type === 'asteroid' ? asteroidColliderRadius(entity.data?.typeId, entity.radius) : 0,
    entity.physicsBody?.collisionProxyManifest ? proxyOuterRadiusWu(entity.physicsBody.collisionProxyManifest, entity) : 0);
  for (const introduction of ['approach', 'station-scan']) {
    const sim = createSimulation({ seed: 1, systems: [ships, economy, world, asteroidSites, asteroidFormations, physics, combat, scanner, shipbreakingYard] });
    const s = sim.state, yard = sim.registry.get('shipbreakingYard'), native = sim.registry.get('physics');
    try {
      s.mode = 'flight'; s.settings.gameplay.physicsBackend = 'rapier-dynamic'; s.ui.docked = false; s.ui.screenStack = []; s.input.actions ||= {};
      sim.registry.get('ships').newGame();
      const player = sim.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: s.player,
        pos: sectorLocalToGlobalForSector({ x: -1850, z: 1188 }, SITE.sectorId), fittings: [] }));
      s.playerId = player.id;
      sim.registry.get('world').enterSector(SITE.sectorId, { continuous: true, noTeleport: true, placePlayer: false });
      const station = s.entityList.find(entity => entity.alive && entity.data?.stationId === SITE.stationId);
      assert.ok(station, 'the ordinary world owner creates the actual refinery');
      assert.equal(s.shipbreakingYard.discovered, false);
      const credits = s.player.credits, offers = []; sim.bus.on('shipbreakingYard:offer', offer => offers.push(offer));
      if (introduction === 'station-scan') {
        // Initial approach fixture, before native admission: scan from outside the refinery hull,
        // on its opposite side from the yard, without injecting discovery or an apron anchor.
        player.pos.set(station.pos.x + envelope(station) + 100, 0, station.pos.z);
        s.player.targetId = station.id; s.input.actions.scanPulse = true;
        sim.registry.get('scanner').update(DT, s);
        assert.equal(s.input.actions.scanPulse, false);
        assert.ok(offers.at(-1)?.actions.some(action => action.id === 'course'), 'the first refinery scan offers directions before the pilot reaches the apron');
      } else sim.step(DT);
      assert.equal(s.shipbreakingYard.discovered, true, `ordinary ${introduction} discovers without an injected anchor`);
      assert.equal(s.player.credits, credits, 'introduction is free');
      assert.equal(Object.values(s.shipbreakingYard.jobs).every(job => job.status === 'offered'), true);
      const originals = s.entityList.filter(entity => entity.alive && entity.type === 'payload' && entity.data?.persistenceOwner === 'shipbreakingYard');
      assert.equal(originals.length, 16);
      const poses = new Map(originals.map(entity => [entity.id, { x: entity.pos.x, z: entity.pos.z, hull: entity.hull }]));
      assert.equal(await native.prepareBackend(s), true);
      for (let tick = 0; tick < 120; tick++) sim.step(DT);
      assert.ok(s.world.asteroidField.rocks.some(rock => rock.alive !== false && rock.liveEntityId == null), 'the placement witness includes sleeping field rocks');
      const obstacles = s.entityList.filter(entity => entity.alive && entity.collides !== false && ['station', 'wreck'].includes(entity.type));
      forEachFieldRock(s, rock => { if (rock.collides !== false) obstacles.push(rock); });
      const reservations = WORLD_SITE_MANIFESTS.filter(site => site.sectorId === SITE.sectorId).map(site => ({
        pos: site.placement.pos, radius: Math.max(site.debug?.reservationEnvelope || 0, site.visualRoot?.visualRadius || 0),
      }));
      const receiver = yard.receiver();
      for (const body of [...originals, receiver]) {
        const radius = body === receiver ? receiver.radius : envelope(body);
        assert.ok(obstacles.every(obstacle => distance(body.pos, obstacle.pos) > radius + envelope(obstacle)), 'the entire original and scale clear both live and sleeping collision scenery');
        assert.ok(reservations.every(site => distance(body.pos, site.pos) > radius + site.radius), 'the work area respects complete authored-site reservations');
        const position = local(body.pos); assert.ok(Math.hypot(position.x, position.z) + radius < 4200, 'all work remains inside the sector');
      }
      for (const original of originals) {
        assert.equal(original.alive, true); assert.equal(original.hull, poses.get(original.id).hull);
        assert.ok(distance(original.pos, poses.get(original.id)) < .01, 'idle native assemblies do not drift into scenery');
      }
      const clamps = Object.values(s.shipbreakingYard.jobs).flatMap(job => Object.keys(job.couplings).map(id => yard.physics.lineStatus(job, id)));
      assert.equal(clamps.filter(line => line.connected && line.admitted).length, 15);
      const job = yard.getJob('lark'), original = yard.physics.body(job, 'engine');
      okay(yard.command({ actionId: 'locate', moduleId: 'engine', jobId: job.id, revision: s.shipbreakingYard.revision }));
      assert.equal(s.nav.waypoint.targetEntityId, original.id);
      assert.equal(s.nav.waypoint.stable.key, `record:${original.data.worldRecordId}`);
      assert.equal(s.nav.waypoint.stable.durable, true); assert.equal(s.nav.autopilot.active, false);
      okay(yard.command({ actionId: 'course', revision: s.shipbreakingYard.revision }));
      assert.deepEqual(s.nav.waypoint.pos, receiver.pos); assert.equal(s.nav.autopilot.active, false); assert.equal(s.nav.autoTravel, false);
    } finally { yard.destroy(); native._disableSg02DynamicAuthority?.(); sim.dispose(); }
  }
});

test('every catalog/module row and repeated disconnect verb reaches its own target through the real presentation adapter', async () => {
  const h = await fixture(); let prompt = null;
  const adapter = createShipbreakingYardPresentation({ deckProvider: () => ({ offerDecision: row => { prompt = row; return true; }, resolveDecision: () => { prompt = null; } }) });
  adapter.init(h.sim.registry.ctx);
  try {
    for (const layout of SHIPBREAKING_LAYOUTS) {
      h.owner.offerCatalog(); const catalog = prompt;
      assert.equal(new Set(catalog.choices.map(choice => choice.id)).size, catalog.choices.length);
      const choose = catalog.choices.find(choice => choice.label.startsWith(layout.title)); assert.ok(choose);
      catalog.onChoose(choose.id); assert.equal(h.owner._selectedJobId, h.job(layout.id).id);
      for (const module of layout.modules) {
        h.owner.inspect(layout.id); const inspection = prompt;
        const choice = inspection.choices.find(item => item.label.startsWith(module.label)); assert.ok(choice, module.label);
        inspection.onChoose(choice.id); assert.equal(h.owner._selectedModuleId, module.id);
      }
    }
    okay(h.accept()); h.owner.inspectPart('frame', h.job().id); const connections = prompt;
    const cargo = connections.choices.find(choice => /MAIL SADDLE/.test(choice.label)); assert.ok(cargo);
    connections.onChoose(cargo.id);
    assert.equal(h.job().couplings['cargo-clamp'].status, 'released');
    assert.equal(h.job().couplings['engine-clamp'].status, 'connected', 'the second choice did not dispatch the first clamp');
  } finally { adapter.destroy(); h.close(); }
});

test('the existing scanner pulse reopens the selected original and nearby fallback without a new input owner', async () => {
  const h = await fixture();
  try {
    h.near(h.body('engine')); h.s.player.targetId = h.body('engine').id;
    let scanResult; h.sim.bus.on('scan:completed', result => { scanResult = result; });
    h.s.input.actions.scanPulse = true; h.sim.registry.get('scanner').update(DT, h.s);
    assert.equal(scanResult.targetId, null, 'ordinary scanner emits its real untargeted result');
    assert.equal(h.owner._selectedModuleId, 'engine'); assert.equal(h.offers.at(-1).moduleId, 'engine');
    assert.equal(h.s.input.actions.scanPulse, false, 'the existing scanner consumed the original input action');
    h.owner.close(); h.s.player.targetId = null; h.s.player.tether = null;
    h.player.pos.set(h.body('engine').pos.x - 35, 0, h.body('engine').pos.z); h.s.simTime += 9;
    h.s.input.actions.scanPulse = true; h.sim.registry.get('scanner').update(DT, h.s);
    assert.equal(h.owner._selectedModuleId, 'engine');
  } finally { h.close(); }
});

test('leave, return, abandon-cancel and explicit abandonment retain payment and partial receipts; next lot has new identity', async () => {
  const h = await fixture();
  try {
    okay(h.accept()); okay(h.disconnect()); okay(h.deliver());
    const jobId = h.job().id, paid = h.s.player.credits, recovered = h.job().recoveredCr;
    okay(h.owner.command({ actionId: 'abandon', revision: h.s.shipbreakingYard.revision, jobId }));
    assert.equal(h.offers.at(-1).kind, 'confirm-abandon');
    okay(h.owner.command({ actionId: 'cancel', revision: h.s.shipbreakingYard.revision, jobId }));
    assert.equal(h.job().status, 'working'); assert.equal(h.s.player.credits, paid);
    okay(h.owner.park(jobId, h.s.shipbreakingYard.revision)); assert.equal(h.job().status, 'parked');
    h.sim.bus.emit('sector:exit', { sectorId: SITE.sectorId }); h.s.world.currentSectorId = 'sector_helios_prime';
    h.tick(); assert.equal(h.owner.resume(jobId, h.s.shipbreakingYard.revision).ok, false);
    assert.equal(h.s.entityList.filter(entity => entity.alive && entity.data?.shipbreakingModuleId).length, 0);
    h.s.world.currentSectorId = SITE.sectorId; h.sim.bus.emit('sector:enter', { sectorId: SITE.sectorId }); await h.admit();
    assert.equal(h.body('engine'), null); assert.equal(h.job().recoveredCr, recovered);
    okay(h.owner.resume(jobId, h.s.shipbreakingYard.revision)); assert.equal(h.s.player.credits, paid);
    assert.equal(h.owner.nextLot('lark', h.s.shipbreakingYard.revision).ok, false, 'unfinished work cannot duplicate a paid wreck');
    const frameId = h.body('frame').data.worldRecordId;
    okay(h.owner.forfeit(jobId, h.s.shipbreakingYard.revision)); assert.equal(h.job().status, 'abandoned'); assert.equal(h.s.player.credits, paid);
    okay(h.owner.nextLot('lark', h.s.shipbreakingYard.revision)); await h.admit();
    assert.equal(h.job().status, 'offered'); assert.notEqual(h.job().id, jobId); assert.notEqual(h.body('frame').data.worldRecordId, frameId);
    assert.equal(h.s.player.credits, paid, 'bringing the next lot to the berth is not a purchase');
    okay(h.accept()); assert.equal(h.s.player.credits, paid - createYardLayout('lark').fee);
  } finally { h.close(); }
});

test('full Lark recovery closes the finite ticket and repeat play varies condition without resurrecting delivered originals', async () => {
  const h = await fixture();
  try {
    okay(h.accept()); const oldId = h.job().id, variant = h.job().variant;
    for (const coupling of createYardLayout('lark').couplings) okay(h.disconnect(coupling.id));
    for (const module of createYardLayout('lark').modules) okay(h.deliver(module.id));
    assert.equal(h.job().status, 'complete'); assert.equal(h.s.shipbreakingYard.stats.deliveredParts, 4);
    const credits = h.s.player.credits; h.tick(30); assert.equal(h.s.player.credits, credits);
    assert.equal(h.s.entityList.filter(entity => entity.alive && entity.data?.shipbreakingJobId === oldId).length, 0);
    okay(h.owner.nextLot('lark', h.s.shipbreakingYard.revision)); await h.admit();
    assert.notEqual(h.job().variant, variant); assert.equal(h.job().paidCr, 0);
    assert.equal(h.s.shipbreakingYard.history.at(-1).id, oldId);
    assert.equal(h.s.entityList.some(entity => entity.alive && entity.data?.shipbreakingJobId === oldId), false);
  } finally { h.close(); }
});

test('cold JSON restoration keeps broken decisions, damage, paid claims and receipts without charging or paying again', async () => {
  const first = await fixture(); let second;
  try {
    okay(first.accept()); okay(first.disconnect()); okay(first.deliver()); okay(first.disconnect('cargo-clamp'));
    first.owner.physics.damage(first.job(), 'cargo', 18, 'fixture-scar'); first.tick();
    const cargo = first.body('cargo'); cargo.pos.x -= 45; cargo.vel.set(.3, 0, -.2); first.native.update(DT, first.s);
    first.near(cargo); const towId = first.tow(cargo).id;
    okay(first.owner.park(first.job().id, first.s.shipbreakingYard.revision));
    const saved = copy(first.owner.serialize()), balance = first.s.player.credits;
    const jobId = first.job().id, originalId = cargo.data.worldRecordId, condition = first.job().modules.cargo.condition;
    const economySave = copy(first.sim.registry.get('economy').serialize());
    const entitiesSave = copy(save._serializeEntities.call({ state: first.s }));
    const combatSave = copy(serializeCombatState(first.s)), attachmentIds = Object.keys(combatSave.attachments.byId).sort();
    assert.ok(attachmentIds.includes(towId));
    second = await fixture({ discover: false });
    second.sim.registry.get('economy').deserialize(economySave);
    // The existing save envelope owns the wallet; reproduce that scalar restore through its writer.
    second.sim.registry.get('economy').chargeCredits(second.s.player.credits, 'fixture-wallet-restore');
    second.sim.registry.get('economy').grantCredits(balance, 'fixture-wallet-restore');
    second.owner.deserialize(saved);
    const entityRemap = new Map([['player', second.player.id], [String(entitiesSave.player.id), second.player.id]]);
    const restoreOwner = { state: second.s, helpers: second.sim.helpers };
    save._applySavedPose.call(restoreOwner, entitiesSave.player);
    for (let index = 0; index < entitiesSave.persistent.length;) {
      const next = save._spawnPersistentEntities.call(restoreOwner, entitiesSave.persistent, entityRemap,
        { startIndex: index, clearStale: index === 0, limit: 32 });
      assert.ok(next > index); index = next;
    }
    const combatRestore = restoreCombatState(second.s, combatSave, ref => ref.kind === 'player' ? second.player.id
      : ref.kind === 'persistent' ? entityRemap.get(String(ref.saveId)) ?? null : null);
    assert.equal(combatRestore.restoredAttachments, attachmentIds.length);
    second.owner.afterContinue(); await second.admit();
    assert.equal(second.job().id, jobId); assert.equal(second.job().paidCr, first.job().paidCr);
    assert.equal(second.job().modules.engine.status, 'delivered'); assert.equal(second.body('engine'), null);
    assert.equal(second.job().couplings['cargo-clamp'].status, 'released'); assert.equal(second.job().modules.cargo.status, 'free');
    assert.equal(second.body('cargo').data.worldRecordId, originalId); assert.ok(second.body('cargo').data.identityKey);
    assert.ok(Math.abs(second.job().modules.cargo.condition - condition) < 1e-8);
    assert.equal(second.owner.physics.lineStatus(second.job(), 'cargo-clamp').connected, false);
    assert.equal(second.owner.physics.lineStatus(second.job(), 'spar-clamp').admitted, true);
    assert.equal(second.owner.physics.towLine(second.body('cargo'))?.id, towId, 'the same persisted player tow is natively re-admitted');
    for (let index = 0; index < 150; index++) second.owner._materialize();
    assert.deepEqual(Object.values(second.s.combat.attachments.byId).filter(line => line.state === 'active').map(line => line.id).sort(), attachmentIds,
      'repeated materialization adopts restored clamps instead of duplicating native custody');
    assert.equal(second.s.entityList.filter(entity => entity.alive && entity.data?.shipbreakingModuleId).length, 15);
    for (const layout of SHIPBREAKING_LAYOUTS) for (const coupling of layout.couplings) {
      const job = second.job(layout.id);
      if (job.couplings[coupling.id].status === 'connected') assert.equal(second.owner.physics.lineStatus(job, coupling.id).admitted, true);
    }
    assert.equal(second.s.player.credits, balance);
    okay(second.owner.resume(jobId, second.s.shipbreakingYard.revision)); assert.equal(second.s.player.credits, balance);
    assert.equal(second.owner.deliver('engine', second.s.shipbreakingYard.revision, jobId).ok, false);
    okay(second.deliver('cargo')); const paid = second.s.player.credits;
    const savedAgain = copy(second.owner.serialize()); second.sim.bus.emit('save:restoring');
    second.owner.deserialize(savedAgain); second.owner.afterContinue(); await second.admit();
    assert.equal(second.body('engine'), null); assert.equal(second.body('cargo'), null); assert.equal(second.s.player.credits, paid);
  } finally { second?.close(); first.close(); }
});

test('malformed delivery receipts fail closed and pooled-id substitutes cannot impersonate a missing original', async () => {
  const h = await fixture();
  try {
    okay(h.accept()); const saved = copy(h.owner.serialize()), jobId = h.job().id;
    saved.jobs[jobId].modules.engine.status = 'delivered';
    saved.jobs[jobId].modules.engine.receipt = { id: 'forged', credits: 999999 };
    const safe = normalizeYardState(saved, 8201);
    assert.equal(safe.jobs[jobId].modules.engine.status, 'lost'); assert.equal(safe.jobs[jobId].modules.engine.receipt, null);
    const original = h.body(), data = copy(original.data);
    h.sim.helpers.removeEntity(original.id); h.tick(); assert.equal(h.job().modules.engine.status, 'lost');
    const impostor = h.sim.spawn({ type: 'payload', pos: h.owner.receiver().pos, mass: 65, radius: 8, hull: 100, hullMax: 100,
      physicsBody: { schemaVersion: 1, shape: 'ball', dynamic: true, mass: 65, radius: 8 }, data });
    h.tick(); assert.equal(h.body(), null); assert.notEqual(impostor.occupantGeneration, original.occupantGeneration);
    assert.equal(h.owner.deliver('engine', h.s.shipbreakingYard.revision, jobId).ok, false);
  } finally { h.close(); }
});

test('an original destroyed inside the real spawn callback becomes a loss instead of a retryable replacement', async () => {
  const h = await fixture({ discover: false });
  try {
    let spawned = 0;
    h.sim.bus.on('entity:spawned', ({ entity }) => {
      if (entity?.data?.shipbreakingModuleId !== 'engine') return;
      spawned++; h.sim.helpers.removeEntity(entity.id, { immediate: true });
    });
    okay(h.owner.discover({ anchor: { x: 500, z: 500 } })); await h.admit();
    assert.equal(h.job().modules.engine.status, 'lost'); assert.equal(h.body(), null);
    h.owner.discover(); h.tick(30);
    assert.equal(spawned, 1, 'hydration cannot mint another life after synchronous destruction');
    assert.equal(h.job().modules.engine.status, 'lost'); assert.equal(h.body(), null);
  } finally { h.close(); }
});

test('a synchronous native-cut save preserves the separation across a cold restore', async () => {
  const first = await fixture(); let second;
  try {
    okay(first.accept()); let snapshot;
    const stop = first.sim.bus.on('tether:broken', event => {
      if (event.reason === 'shipbreaking_disconnect') snapshot = copy(first.owner.serialize());
    });
    okay(first.disconnect()); stop();
    const jobId = first.job().id;
    assert.ok(snapshot, 'the save came from the actual combat cut callback');
    assert.notEqual(snapshot.jobs[jobId].couplings['engine-clamp'].status, 'connected');
    assert.equal(snapshot.jobs[jobId].modules.engine.status, 'free');
    second = await fixture({ discover: false });
    second.owner.deserialize(snapshot); second.owner.afterContinue(); await second.admit();
    assert.equal(second.owner.physics.lineStatus(second.job(), 'engine-clamp').connected, false);
    assert.equal(second.owner.physics.lineStatus(second.job(), 'spar-clamp').admitted, true);
    assert.equal(second.job().modules.engine.status, 'free');
    assert.equal(second.body().data.worldRecordId, first.body().data.worldRecordId);
  } finally { second?.close(); first.close(); }
});

test('a save inside actual sector-shelving cuts preserves uncut fittings for cold restoration', async () => {
  for (const releasedEngine of [false, true]) {
    const first = await fixture({ worldOwner: true }); let second;
    try {
      okay(first.accept()); if (releasedEngine) okay(first.disconnect());
      const balance = first.s.player.credits, identities = new Map(), snapshots = [];
      const wasReleased = (job, id) => releasedEngine && job.layoutId === 'lark' && id === 'engine-clamp';
      for (const layout of SHIPBREAKING_LAYOUTS) for (const module of layout.modules) {
        identities.set(`${layout.id}:${module.id}`, first.body(module.id, layout.id).data.worldRecordId);
      }
      const stop = first.sim.bus.on('tether:broken', event => {
        if (event.reason === 'shipbreaking_sector_shelve') snapshots.push(copy(first.owner.serialize()));
      });
      first.sim.registry.get('world').enterSector('sector_helios_prime', { continuous: true, noTeleport: true, placePlayer: false });
      stop();
      assert.equal(first.s.world.currentSectorId, 'sector_helios_prime');
      assert.equal(snapshots.length, releasedEngine ? 14 : 15, 'every actual clamp retirement exercised synchronous save reentry');
      for (const snapshot of [...snapshots, first.owner.serialize()]) {
        for (const job of Object.values(snapshot.jobs)) {
          for (const [id, coupling] of Object.entries(job.couplings)) assert.equal(coupling.status, wasReleased(job, id) ? 'released' : 'connected',
            'shelving preserves genuine earlier decisions without turning native lifecycle cuts into player breaks');
          for (const [id, module] of Object.entries(job.modules)) assert.equal(module.status,
            releasedEngine && job.layoutId === 'lark' && id === 'engine' ? 'free' : 'attached', 'temporarily retired originals are not lost or newly separated');
        }
      }
      assert.equal(first.s.player.credits, balance); assert.equal(first.job().status, 'parked');
      assert.equal(first.s.entityList.filter(entity => entity.alive && entity.data?.shipbreakingModuleId).length, 0);
      second = await fixture({ discover: false });
      second.owner.deserialize(snapshots.at(-1)); second.owner.afterContinue(); await second.admit();
      assert.equal(second.job().paidCr, createYardLayout('lark').fee);
      for (const layout of SHIPBREAKING_LAYOUTS) {
        const job = second.job(layout.id);
        for (const module of layout.modules) assert.equal(second.body(module.id, layout.id).data.worldRecordId, identities.get(`${layout.id}:${module.id}`));
        for (const coupling of layout.couplings) {
          assert.equal(job.couplings[coupling.id].status, wasReleased(job, coupling.id) ? 'released' : 'connected');
          assert.equal(second.owner.physics.lineStatus(job, coupling.id).admitted, !wasReleased(job, coupling.id), 'only uncut original fittings are restored as native joints');
        }
      }
      assert.equal(second.s.entityList.filter(entity => entity.alive && entity.data?.shipbreakingModuleId).length, 16);
    } finally { second?.close(); first.close(); }
  }
});

test('a credit-callback save retires its terminal persistent original through the real save entity restore owner', async () => {
  const first = await fixture(); let second;
  try {
    okay(first.accept()); okay(first.disconnect()); const original = first.body(), identity = original.data.worldRecordId;
    const economyOwner = first.sim.registry.get('economy'), commodityId = createYardLayout('lark').modules.find(module => module.id === 'engine').commodityId;
    economyOwner.ensureMarket(SITE.stationId); const stock = first.s.economy.markets[SITE.stationId][commodityId].stock;
    let interrupted;
    const stop = first.sim.bus.on('credits:changed', () => {
      if (first.job().modules.engine.status !== 'delivered') return;
      interrupted = { yard: copy(first.owner.serialize()), entities: copy(save._serializeEntities.call({ state: first.s })),
        economy: copy(economyOwner.serialize()), credits: first.s.player.credits };
    });
    okay(first.deliver()); stop();
    assert.ok(interrupted.entities.persistent.some(entity => entity.data?.worldRecordId === identity), 'the actual save owner captured the paid original before retirement');
    assert.equal(interrupted.yard.jobs[first.job().id].modules.engine.status, 'delivered');
    assert.equal(interrupted.economy.markets[SITE.stationId].find(row => row[0] === commodityId)[1], stock + 1,
      'the synchronous credit-boundary save includes the single stock delivery');
    second = await fixture({ discover: false });
    second.sim.registry.get('economy').deserialize(interrupted.economy);
    second.sim.registry.get('economy').chargeCredits(second.s.player.credits, 'fixture-wallet-restore');
    second.sim.registry.get('economy').grantCredits(interrupted.credits, 'fixture-wallet-restore');
    second.owner.deserialize(interrupted.yard);
    const saved = interrupted.entities.persistent, saveOwner = { state: second.s, helpers: second.sim.helpers };
    for (let index = 0; index < saved.length;) {
      const next = save._spawnPersistentEntities.call(saveOwner, saved, new Map(), { startIndex: index, clearStale: index === 0, limit: 32 });
      assert.ok(next > index, 'the real restore owner must make forward progress'); index = next;
    }
    assert.ok(second.s.entityList.some(entity => entity.alive && entity.data?.worldRecordId === identity));
    second.owner.afterContinue(); await second.admit();
    assert.equal(second.s.entityList.some(entity => entity.alive && entity.data?.worldRecordId === identity), false);
    assert.equal(second.body(), null); assert.equal(second.job().modules.engine.status, 'delivered');
    const balance = second.s.player.credits;
    assert.equal(second.owner.deliver('engine', second.s.shipbreakingYard.revision, second.job().id).ok, false);
    second.tick(10); assert.equal(second.s.player.credits, balance);
    assert.equal(second.s.economy.markets[SITE.stationId][commodityId].stock, stock + 1);
    assert.equal(second.s.entityList.filter(entity => entity.alive && entity.data?.shipbreakingModuleId).length, 15);
  } finally { second?.close(); first.close(); }
});

test('save plan and paced steps preserve the same owner snapshot, while old saves restore an untouched yard', async () => {
  const first = await fixture(); let restored, oldSave;
  try {
    okay(first.accept()); okay(first.disconnect()); okay(first.deliver());
    const saveOwner = { state: first.s, registry: first.sim.registry }, [key, read] = shipbreakingYardSavePlanEntry(saveOwner);
    assert.equal(key, 'shipbreakingYard'); const planned = read(), data = {};
    assert.deepEqual([...serializeShipbreakingYardSteps(saveOwner, data)], ['serialize:shipbreakingYard']);
    assert.deepEqual(data[key], planned); assert.deepEqual(serializeShipbreakingYard(saveOwner), planned);
    assert.deepEqual(serializeShipbreakingYard({ state: first.s }), planned, 'the absent-registry fallback keeps the normalized ledger only');
    planned.jobs[first.job().id].modules.cargo.condition = 0;
    assert.ok(first.job().modules.cargo.condition > 0, 'save snapshots cannot alias authoritative records');
    restored = await fixture({ discover: false }); const restoreOwner = { state: restored.s, registry: restored.sim.registry };
    assert.deepEqual([...restoreShipbreakingYardSteps(restoreOwner, data)], ['shipbreaking-yard-restored']);
    assert.equal(restored.owner.readModel().visible, false, 'hydration stays suspended during native restore');
    afterContinueShipbreakingYard(restoreOwner); await restored.admit();
    assert.equal(restored.job().modules.engine.status, 'delivered'); assert.equal(restored.body(), null);
    assert.equal(restored.owner.physics.lineStatus(restored.job(), 'cargo-clamp').admitted, true);
    oldSave = await fixture({ discover: false }); const oldOwner = { state: oldSave.s, registry: oldSave.sim.registry };
    [...restoreShipbreakingYardSteps(oldOwner, {})]; afterContinueShipbreakingYard(oldOwner);
    assert.equal(oldSave.s.shipbreakingYard.discovered, false); assert.deepEqual(oldSave.s.shipbreakingYard.jobs, {});
    const entries = createShipbreakingYardSystemEntries(), other = createShipbreakingYardSystemEntries();
    assert.equal(entries[0][0], 'shipbreakingYard'); assert.notEqual(entries[0][1], other[0][1]);
    assert.equal(SHIPBREAKING_YARD_CAPABILITIES.shipbreakingYard.nodeSafe, true);
    assert.equal(SHIPBREAKING_YARD_CAPABILITIES.shipbreakingYardBrowser.nodeSafe, false);
    assert.deepEqual(SHIPBREAKING_YARD_MAIN_TO_SIM_EVENTS, ['shipbreakingYard:action']);
  } finally { oldSave?.close(); restored?.close(); first.close(); }
});

test('the actual worker event projector preserves bounded yard views and ordinary decision intents', async () => {
  const h = await fixture(), restoreAdapter = installYardBridgeAdapter();
  try {
    const raw = h.owner.readModel(), event = projectBridgeEvent('shipbreakingYard:view', raw);
    assert.equal(event.dropped, false); assert.equal(event.reason, 'adapter');
    assert.deepEqual(structuredClone(event.flat), event.flat);
    assert.equal(event.flat.jobs.length, 3); assert.equal(event.flat.jobs.reduce((n, job) => n + job.modules.length, 0), 16);
    assert.deepEqual(event.flat.jobs[0].modules[1].pos, raw.jobs[0].modules[1].pos);
    h.owner.offerCatalog(); const offer = projectBridgeEvent('shipbreakingYard:offer', h.offers.at(-1));
    assert.equal(offer.dropped, false); assert.equal(offer.flat.actions[2].layoutId, 'vesper');
    const command = { actionId: 'disconnect', revision: h.s.shipbreakingYard.revision, jobId: h.job().id, couplingId: 'engine-clamp' };
    assert.deepEqual(projectBridgeEvent('shipbreakingYard:action', command).flat, command);
    const hostile = { ...copy(raw), native: h.native, ledger: h.s.shipbreakingYard, callback() {},
      jobs: Array.from({ length: 80 }, () => ({ ...copy(raw.jobs[0]), title: 'x'.repeat(2000),
        modules: Array.from({ length: 80 }, () => ({ ...copy(raw.jobs[0].modules[0]), label: 'x'.repeat(2000), condition: Infinity, pos: { x: NaN, z: 0 }, privateMap: new Map() })),
        couplings: Array.from({ length: 80 }, () => ({ ...copy(raw.jobs[0].couplings[0]), reason: 'x'.repeat(2000) })),
      })) };
    const bounded = projectShipbreakingYardView(hostile);
    assert.equal(bounded.jobs.length, 3);
    for (const job of bounded.jobs) {
      assert.equal(job.modules.length, 6); assert.equal(job.couplings.length, 6); assert.ok(job.title.length <= 160);
      for (const module of job.modules) { assert.equal(module.pos, null); assert.equal(module.condition, 0); assert.ok(module.label.length <= 160); assert.equal('privateMap' in module, false); }
      assert.ok(job.couplings.every(link => link.reason.length <= 320));
    }
    assert.equal('native' in bounded, false); assert.equal('ledger' in bounded, false); assert.equal('callback' in bounded, false);
    assert.deepEqual(structuredClone(bounded), bounded);
    assert.deepEqual(projectShipbreakingYardView({ ...hostile, visible: false }).jobs, []);
  } finally { restoreAdapter(); h.close(); }
});

test('browser registry forks isolate main and projected-view presentation, audio and GPU lifecycle', async () => {
  const h = await fixture(), restoreAdapter = installYardBridgeAdapter(); const sims = [];
  const offered = [], deck = { offerDecision: row => { offered.push(row); return true; }, resolveDecision: () => true };
  const template = createShipbreakingYardBrowser({ deckProvider: () => deck });
  try {
    const makePanel = () => {
      const sim = createSimulation({ systems: [template] }); sims.push(sim);
      const s = sim.state; s.mode = 'flight'; s.world.currentSectorId = SITE.sectorId; s.render.scene = new THREE.Group();
      // Main read-model entities carry the same public identity/pose fields as the worker journal.
      for (const entity of h.s.entityList.filter(row => row.alive && row.data?.shipbreakingModuleId)) {
        sim.spawn({ id: entity.id, type: entity.type, pos: { x: entity.pos.x, z: entity.pos.z },
          radius: entity.radius, physicsBody: false, data: copy(entity.data) });
      }
      return { sim, s, owner: sim.registry.get('shipbreakingYardBrowser'), actions: [], audio: [] };
    };
    const main = makePanel(), worker = makePanel();
    for (const panel of [main, worker]) {
      panel.sim.bus.on('shipbreakingYard:action', row => panel.actions.push(row));
      panel.sim.bus.on('audio:cue', row => panel.audio.push(row));
    }
    const view = h.owner.readModel(); main.s.shipbreakingYardView = view;
    worker.sim.bus.emit('shipbreakingYard:view', projectBridgeEvent('shipbreakingYard:view', view).flat);
    assert.equal(presentShipbreakingYardFrame(main.s), true); assert.equal(presentShipbreakingYardFrame(worker.s), true);
    const mainMesh = main.s.render.scene.children[0], workerMesh = worker.s.render.scene.children[0];
    assert.notEqual(mainMesh, workerMesh); assert.ok(mainMesh.geometry.drawRange.count > 100);
    assert.equal(workerMesh.geometry.drawRange.count, mainMesh.geometry.drawRange.count);
    h.owner.offerCatalog(); const offer = h.offers.at(-1);
    main.sim.bus.emit('shipbreakingYard:offer', offer); offered.at(-1).onChoose('inspect:1');
    worker.sim.bus.emit('shipbreakingYard:offer', projectBridgeEvent('shipbreakingYard:offer', offer).flat); offered.at(-1).onChoose('inspect:2');
    assert.equal(main.actions.at(-1).layoutId, 'bellwether'); assert.equal(worker.actions.at(-1).layoutId, 'vesper');
    assert.equal(main.actions.length, 1); assert.equal(worker.actions.length, 1);
    for (const panel of [main, worker]) { panel.sim.bus.emit('shipbreakingYard:cue', { kind: 'strain' }); panel.sim.bus.emit('shipbreakingYard:cue', { kind: 'strain' }); }
    assert.equal(main.audio.length, 1); assert.equal(worker.audio.length, 1);
    main.sim.bus.emit('sector:exit'); presentShipbreakingYardFrame(main.s); presentShipbreakingYardFrame(worker.s);
    assert.equal(mainMesh.visible, false); assert.equal(workerMesh.visible, true, 'resetting one registry cannot hide another');
    assert.equal(releaseShipbreakingYardPresentation(worker.s), true); assert.equal(worker.s.render.scene.children.length, 0);
    assert.equal(presentShipbreakingYardFrame(worker.s), true); assert.equal(worker.s.render.scene.children.length, 1);
    worker.sim.bus.emit('save:restoring'); presentShipbreakingYardFrame(worker.s);
    assert.equal(worker.s.render.scene.children[0].visible, false);
    main.owner.destroy(); const count = offered.length;
    main.sim.bus.emit('shipbreakingYard:offer', offer); assert.equal(offered.length, count);
    assert.equal(presentShipbreakingYardFrame(main.s), false); assert.equal(main.s.render.scene.children.length, 0);
    worker.sim.bus.emit('shipbreakingYard:offer', offer); assert.equal(offered.length, count + 1);
    worker.owner.destroy(); assert.equal(worker.s.render.scene.children.length, 0);
    assert.equal(presentShipbreakingYardFrame(worker.s), false); assert.equal(releaseShipbreakingYardPresentation(worker.s), false);
  } finally { for (const sim of sims) sim.dispose(); restoreAdapter(); h.close(); }
});

test('a charged Vesper enforces service order, vents through native impulses and remains a recoverable original', async () => {
  const h = await fixture();
  try {
    okay(h.accept('vesper')); const job = h.job('vesper'), reactor = h.body('reactor', 'vesper');
    assert.equal(h.disconnect('coolant-return', 'vesper').ok, false, 'hot service return warns before destructive work');
    h.near(reactor); const hull = reactor.hull, identity = reactor.data.worldRecordId;
    const beforePickups = h.s.entityList.filter(entity => entity.type === 'pickup').length;
    okay(h.owner.vent('reactor', h.s.shipbreakingYard.revision, job.id)); h.tick(6);
    assert.equal(job.hazard.vented, true); assert.equal(reactor.data.worldRecordId, identity); assert.equal(reactor.hull, hull);
    assert.equal(h.s.entityList.filter(entity => entity.type === 'pickup').length, beforePickups, 'venting cannot mint an extra salvage source');
    assert.equal(h.owner.vent('reactor', h.s.shipbreakingYard.revision, job.id).ok, false);
    okay(h.disconnect('coolant-return', 'vesper'));
    assert.equal(h.disconnect('shield-mount', 'vesper').ok, false, 'coolant original must physically clear the extraction lane');
    const coolant = h.body('coolant', 'vesper'); h.receiver(coolant); h.tow(coolant);
    okay(h.owner.deliver('coolant', h.s.shipbreakingYard.revision, job.id));
    okay(h.disconnect('shield-mount', 'vesper')); okay(h.disconnect('reactor-brace', 'vesper')); okay(h.disconnect('reactor-bed', 'vesper'));
    okay(h.deliver('reactor', 'vesper')); assert.equal(job.modules.reactor.status, 'delivered');
    okay(h.disconnect('recorder-clamp', 'vesper')); okay(h.disconnect('array-saddle', 'vesper'));
    for (const id of ['shield', 'recorder', 'array', 'frame']) okay(h.deliver(id, 'vesper'));
    assert.equal(job.status, 'complete'); assert.equal(job.hazard.burst, false);
  } finally { h.close(); }
});

test('Bellwether opens by clearing its real cassette and pressure bottle before extracting the valuable pump', async () => {
  const h = await fixture();
  try {
    okay(h.accept('bellwether')); const job = h.job('bellwether');
    assert.equal(h.disconnect('pump-collar', 'bellwether').ok, false);
    assert.equal(h.disconnect('cage-crossbrace', 'bellwether').ok, false);
    okay(h.disconnect('cargo-saddle', 'bellwether')); okay(h.disconnect('cage-crossbrace', 'bellwether'));
    assert.equal(h.disconnect('pump-collar', 'bellwether').ok, false, 'released cassette still physically obstructs the lane');
    okay(h.deliver('cargo', 'bellwether')); okay(h.disconnect('pump-collar', 'bellwether'));
    assert.equal(h.disconnect('pump-return', 'bellwether').ok, false);
    okay(h.disconnect('tank-mount', 'bellwether')); okay(h.disconnect('pump-return', 'bellwether'));
    okay(h.deliver('pump', 'bellwether')); okay(h.disconnect('drive-mount', 'bellwether'));
    for (const id of ['frame', 'brace', 'drive', 'tank']) okay(h.deliver(id, 'bellwether'));
    assert.equal(job.status, 'complete'); assert.ok(job.recoveredCr > job.paidCr);
  } finally { h.close(); }
});

test('a native overload tears a hot return, causes one pressure event, and preserves previously recovered partial pay', async () => {
  const h = await fixture();
  try {
    okay(h.accept('vesper')); const job = h.job('vesper');
    okay(h.disconnect('recorder-clamp', 'vesper')); okay(h.disconnect('array-saddle', 'vesper'));
    okay(h.deliver('recorder', 'vesper')); const partial = h.s.player.credits, recovered = job.recoveredCr;
    const coolant = h.body('coolant', 'vesper');
    queuePhysicsImpulse(coolant, { x: coolant.mass * 70, z: 0 }, { tag: 'fixture-native-load', tick: h.s.tick });
    h.tick(180);
    assert.equal(job.hazard.burst, true, 'native spring overload actually tore the live assembly');
    assert.equal(h.cues.filter(cue => cue.kind === 'hazard').length, 1);
    assert.equal(h.s.player.credits, partial); assert.equal(job.recoveredCr, recovered);
    assert.equal(job.modules.recorder.status, 'delivered'); assert.equal(h.body('recorder', 'vesper'), null);
    assert.ok(Object.values(job.modules).some(part => part.status !== 'delivered' && part.condition < .9), 'pressure damages actual remaining machinery');
    h.tick(30); assert.equal(h.cues.filter(cue => cue.kind === 'hazard').length, 1);
    h.near(h.body('array', 'vesper')); okay(h.owner.park(job.id, h.s.shipbreakingYard.revision));
    assert.equal(h.s.player.credits, partial); assert.equal(job.status, 'parked');
  } finally { h.close(); }
});

test('render adapter consumes read model without simulation writes and bounds geometry under reduced motion/flash', async () => {
  const h = await fixture(); const scene = new THREE.Group(), renderer = createShipbreakingYardRenderer({ scene });
  try {
    h.s.settings.accessibility = { reducedMotion: true, reducedFlash: true };
    const snapshot = copy(h.owner.serialize()); h.owner._publish();
    renderer.update(h.s); assert.equal(scene.children.length, 1);
    assert.equal(renderer.root.isMesh, true); assert.ok(renderer.root.geometry.drawRange.count > 0);
    assert.ok(renderer.root.geometry.drawRange.count <= 4096);
    assert.equal([...renderer.root.geometry.attributes.position.array].every(Number.isFinite), true);
    const first = [...renderer.root.geometry.attributes.position.array];
    const rgb = renderer.root.geometry.attributes.color.array, receiver = h.owner.receiver(), receiverRadii = [];
    for (let index = 0; index < renderer.root.geometry.drawRange.count; index++) {
      if (YARD_CUE_COLORS.receiver.every((channel, axis) => Math.abs(rgb[index * 3 + axis] - channel) < 1e-6)) {
        receiverRadii.push(Math.hypot(first[index * 3] - receiver.pos.x, first[index * 3 + 2] - receiver.pos.z));
      }
    }
    assert.ok(receiverRadii.length > 0, 'the physical receiving boundary is visibly marked');
    assert.ok(receiverRadii.every(radius => radius <= receiver.radius), 'every visible threshold stroke stays inside the actual circular delivery gate');
    assert.ok(Math.max(...receiverRadii) > receiver.radius - 1, 'the outer strokes identify the actual usable threshold');
    renderer.update(h.s); assert.deepEqual([...renderer.root.geometry.attributes.position.array], first, 'stationary cues do not flash or animate');
    assert.deepEqual(h.owner.serialize(), snapshot);
    const count = renderer.root.geometry.drawRange.count;
    applyFrameOrigin(h.s, { x: 4096, z: 8192 });
    const original = h.body(); original.mesh = new THREE.Object3D();
    original.mesh.position.set(original.pos.x - 4096, 0, original.pos.z - 8192);
    renderer.update(h.s); const rebased = renderer.root.geometry.attributes.position.array;
    assert.equal(renderer.root.geometry.drawRange.count, count);
    for (let index = 0; index < count; index++) {
      assert.ok(Math.abs(rebased[index * 3] - (first[index * 3] - 4096)) < .002, 'all cues share the actual frame-local X coordinate membrane');
      assert.ok(Math.abs(rebased[index * 3 + 2] - (first[index * 3 + 2] - 8192)) < .002, 'all cues share the actual frame-local Z coordinate membrane');
    }
    original.mesh = null; applyFrameOrigin(h.s, { x: 0, z: 0 });
    h.s.world.currentSectorId = 'sector_fixture_elsewhere'; renderer.update(h.s);
    assert.equal(renderer.root.visible, false); assert.equal(renderer.root.geometry.drawRange.count, 0);
    h.s.world.currentSectorId = SITE.sectorId; h.s.mode = 'docked'; renderer.update(h.s);
    assert.equal(renderer.root.visible, false);
    h.s.mode = 'flight'; renderer.update(h.s); assert.equal(renderer.root.visible, true);
    renderer.reset(); assert.equal(renderer.root.visible, false); assert.equal(renderer.root.geometry.drawRange.count, 0);
    renderer.dispose(); renderer.dispose(); assert.equal(scene.children.length, 0);
  } finally { renderer.dispose(); h.close(); }
});
