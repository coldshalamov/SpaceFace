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
import { normalizeYardState, freshYardState, createYardJob } from '../src/features/shipbreakingYard/model.js';
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
import { yardSortingShiftCloseout } from '../src/features/shipbreakingYard/guidance.js';

test('two original sorting loads lead to a paid stopping point, not a compulsory heavy tow', async () => {
  const f = await fixture();
  try {
    okay(f.accept()); const job = f.job(), paid = job.paidCr;
    const deliverCommand = id => {
      const entity = f.body(id); f.receiver(entity); f.tow(entity);
      return f.owner.command({ actionId: 'deliver', moduleId: id, jobId: job.id, revision: f.s.shipbreakingYard.revision });
    };
    okay(f.disconnect()); okay(deliverCommand('engine'));
    let offer = f.offers.at(-1);
    assert.equal(offer.title, 'LARK · SORTING REFIT · WORK TICKET');
    assert.equal(offer.actions[0].moduleId, 'cargo');
    assert.doesNotMatch(offer.detail, /Sorting shift settled/);
    okay(f.disconnect('cargo-clamp')); okay(deliverCommand('cargo'));
    offer = f.offers.at(-1);
    assert.match(offer.detail, /Sorting shift settled/);
    assert.match(offer.detail, new RegExp(`${job.recoveredCr} cr against your ${paid} cr claim`));
    assert.match(offer.detail, /240 mass/); assert.match(offer.detail, /80 mass/);
    assert.equal(offer.actions[0].id, 'park');
    assert.equal(offer.actions.filter(a => a.id === 'park').length, 1);
    assert.deepEqual(offer.actions.filter(a => a.id === 'inspect-part').map(a => a.moduleId), ['frame', 'spar']);
    assert.equal(job.status, 'working'); assert.equal(f.s.shipbreakingYard.stats.completedJobs, 0);
    const credits = f.s.player.credits, earned = job.recoveredCr;
    okay(f.owner.command({actionId:'park', jobId:job.id, revision:f.s.shipbreakingYard.revision}));
    assert.equal(job.status, 'parked'); assert.equal(job.recoveredCr, earned); assert.equal(f.s.player.credits, credits);
    const restored = copy(job), layout = createYardLayout('lark', job.variant);
    assert.ok(yardSortingShiftCloseout(restored, layout), 'receipt-only closeout survives serialization without a new flag');
    okay(f.owner.resume(job.id, f.s.shipbreakingYard.revision));
    okay(f.owner.workTicket(job.id)); assert.match(f.offers.at(-1).detail, /Sorting shift settled/);
    assert.equal(f.s.player.credits, credits);
    okay(f.owner.inspectPart('spar', job.id));
    assert.ok(f.offers.at(-1).actions.some(a => a.id === 'disconnect'), 'heavier work remains available');
    const revision = f.s.shipbreakingYard.revision;
    assert.equal(f.owner.command({actionId:'deliver', moduleId:'cargo',jobId:job.id,revision}).ok, false);
    assert.equal(f.s.player.credits, credits);
  } finally { f.close(); }
});

test('closeout never equates lost parts, foreign receipts or historical heavy claims with a paid sorting shift', () => {
  const layout = createYardLayout('lark', 6), row = freshYardState(); row.anchor = {x:0,z:0};
  const job = createYardJob(row, 'lark'); job.status = 'working'; job.paidCr = 80;
  for (const id of ['engine','cargo']) Object.assign(job.modules[id], {status:'delivered',receipt:{jobId:job.id,moduleId:id,credits:50}});
  assert.ok(yardSortingShiftCloseout(job, layout));
  assert.equal(yardSortingShiftCloseout(job, createYardLayout('lark',0)), null);
  job.modules.cargo.status = 'lost'; assert.equal(yardSortingShiftCloseout(job,layout),null);
  job.modules.cargo.status = 'delivered'; job.modules.cargo.receipt.jobId = 'other'; assert.equal(yardSortingShiftCloseout(job,layout),null);
  job.modules.cargo.receipt.jobId = job.id; job.status = 'abandoned'; assert.equal(yardSortingShiftCloseout(job,layout),null);
});
