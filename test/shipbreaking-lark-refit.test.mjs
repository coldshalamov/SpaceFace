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
import { createShipbreakingYardPresentation, shipbreakingDecisionSpec, SHIPBREAKING_DECISION_ID } from '../src/features/shipbreakingYard/presentation.js';
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

test('explicit next-lot request exposes a light sorting motor and actual pilot inputs tow it to one paid handover', async () => {
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
    okay(yard.accept('lark', s.shipbreakingYard.revision));
    okay(yard.forfeit(yard.getJob('lark').id, s.shipbreakingYard.revision));
    okay(yard.command({ actionId: 'next-lot', layoutId: 'lark', revision: s.shipbreakingYard.revision }));
    for (let index = 0; index < 5; index++) sim.step(DT);
    const job = yard.getJob('lark'), original = yard.physics.body(job, 'engine');
    assert.ok(job.variant >= 6 && job.variant <= 11);
    assert.equal(original.mass, 18);
    assert.equal(original.physicsBody.mass, 18);
    assert.ok(Math.abs(native._sg02.records.get(original.id).body.mass() - 18) < .001);
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
    console.log(JSON.stringify({ refitNativeSeconds: s.simTime, movedOriginal: id, mass: 18, receipt: job.modules.engine.receipt }));
    assert.equal(job.modules.engine.status, 'delivered'); assert.equal(original.alive, false);
    assert.ok(s.player.credits > credits); const paid = s.player.credits;
    assert.equal(yard.deliver('engine', s.shipbreakingYard.revision, job.id).ok, false); assert.equal(s.player.credits, paid);
  } finally { yard.destroy(); native._disableSg02DynamicAuthority?.(); sim.dispose(); }
});


test('legacy paid lots retain exact layouts while new refits survive the actual ledger snapshot', async () => {
  const h = await fixture();
  try {
    okay(h.accept()); const legacy = copy(h.s.shipbreakingYard), oldId = h.job().id;
    const oldLayout = createYardLayout('lark', h.job().variant);
    okay(h.owner.forfeit(oldId, h.s.shipbreakingYard.revision));
    okay(h.owner.command({ actionId: 'next-lot', layoutId: 'lark', revision: h.s.shipbreakingYard.revision }));
    await h.admit(); okay(h.accept());
    const refit = h.job(), raw = h.owner.serialize();
    const restored = normalizeYardState(JSON.parse(JSON.stringify(raw)), h.s.meta.seed);
    assert.equal(restored.jobs[refit.id].variant, refit.variant);
    assert.equal(createYardLayout('lark', restored.jobs[refit.id].variant).modules.find(m => m.id === 'engine').mass, 18);
    const kept = normalizeYardState(legacy, h.s.meta.seed);
    assert.deepEqual(createYardLayout('lark', kept.jobs[oldId].variant), oldLayout);
    assert.equal(oldLayout.modules.find(m => m.id === 'engine').mass, 65);
    assert.equal(createYardLayout('lark', refit.variant).modules.find(m => m.id === 'frame').mass, 240);
    const before = h.s.player.credits;
    assert.equal(h.owner.nextLot('lark', h.s.shipbreakingYard.revision).ok, false);
    assert.equal(h.s.player.credits, before);
    assert.equal(h.owner.getJob('lark').id, refit.id);
  } finally { h.close(); }
});

test('ordinary inspection deck requests the refit once; later cycles return to original loads without touching a paid lot', async () => {
  const h = await fixture();
  try {
    okay(h.accept()); okay(h.owner.forfeit(h.job().id, h.s.shipbreakingYard.revision));
    okay(h.owner.inspect('lark'));
    const offer = h.offers.at(-1), selected = shipbreakingDecisionSpec(offer, p => okay(h.owner.command(p)));
    assert.ok(selected.choices.some(c => c.id === 'next-lot'));
    selected.onChoose('next-lot'); await h.admit();
    const refitId = h.job().id, variant = h.job().variant;
    assert.ok(variant >= 6); assert.equal(h.s.shipbreakingYard.cycles.lark, 1);
    assert.equal(h.owner.command({actionId: 'next-lot', layoutId: 'lark', revision: offer.revision}).ok, false);
    assert.equal(h.job().id, refitId);
    okay(h.accept()); okay(h.owner.forfeit(refitId, h.s.shipbreakingYard.revision));
    okay(h.owner.nextLot('lark', h.s.shipbreakingYard.revision)); await h.admit();
    assert.ok(h.job().variant < 6); assert.equal(h.body().mass, 65);
    assert.equal(h.s.shipbreakingYard.cycles.lark, 2);
    assert.deepEqual(createYardLayout('lark', variant), createYardLayout('lark', variant));
  } finally { h.close(); }
});

test('fresh native yard hydration preserves a paid refit, its released motor and settled cassette receipt', async () => {
  const first = await fixture(); let second;
  try {
    okay(first.accept()); okay(first.owner.forfeit(first.job().id, first.s.shipbreakingYard.revision));
    okay(first.owner.nextLot('lark', first.s.shipbreakingYard.revision)); await first.admit(); okay(first.accept());
    okay(first.disconnect()); okay(first.disconnect('cargo-clamp')); okay(first.deliver('cargo'));
    const data = {}; [...serializeShipbreakingYardSteps({ state: first.s, registry: first.sim.registry }, data)];
    second = await fixture({ discover: false });
    const restore = { state: second.s, registry: second.sim.registry };
    [...restoreShipbreakingYardSteps(restore, JSON.parse(JSON.stringify(data)))];
    afterContinueShipbreakingYard(restore); await second.admit();
    assert.equal(second.job().id, first.job().id); assert.equal(second.job().paidCr, 80);
    assert.equal(second.body().mass, 18);
    assert.ok(Math.abs(second.native._sg02.records.get(second.body().id).body.mass() - 18) < .001);
    assert.equal(second.job().modules.engine.status, 'free');
    assert.equal(second.body('cargo'), null);
    const credits = second.s.player.credits;
    assert.equal(second.owner.deliver('cargo', second.s.shipbreakingYard.revision, second.job().id).ok, false);
    assert.equal(second.s.player.credits, credits);
  } finally { second?.close(); first.close(); }
});
