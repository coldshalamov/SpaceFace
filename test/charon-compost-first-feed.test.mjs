import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity, stampOccupantGeneration } from '../src/core/entity.js';
import { missions } from '../src/systems/missions.js';
import { combat } from '../src/systems/combat.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { createRookBooth } from '../src/systems/rookBooth.js';
import { understoryGardens } from '../src/systems/faction_understory.js';
import { cargo, addCargo, sellableCargoQuantity } from '../src/systems/cargo.js';
import { mining, persistTouchedResourceBody } from '../src/systems/mining.js';
import { lootShards } from '../src/systems/lootShards.js';
import { createCampaign47aState } from '../src/story/campaign47a/campaignSchema.js';
import { getBeatStepStatus } from '../src/story/campaign47a/index.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { rookPadPosition } from '../src/characters/rookRules.js';
import { UNDERSTORY_RECEIVER, receiverApproach, firstPlayerGardenGrowth } from '../src/data/understoryReceiver.js';
import { flightDestinationSurface, resolveFlightObjectiveCommand } from '../src/ui/hud.js';
import { isNodeSafeSystemId } from '../src/runtime/authoritativeSystemManifest.js';
import { embodiedMissionAt } from '../src/story/campaign47a/embodiedMissions.js';
import { syncFurnaceWorksite } from '../src/missions/furnaceWorksiteRuntime.js';
import { insertAsteroidFieldRock, promoteAsteroidFieldRock } from '../src/world/asteroidField.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { nestApproach } from '../src/data/nestVisit.js';
import { ASTEROIDS } from '../src/data/mining.js';
import { nearestMiningResourceFace } from '../src/missions/starterWorkday.js';

const SECTOR = 'sector_charon_expanse', IRON = 'cmdty_ore_iron';
const PAD = rookPadPosition();

// Public owner components, not a physics integrator or a rendered Continue acceptance.
function fixture(outcome = 'delivered') {
  const state = createGameState(47), bus = createBus();
  const creditIntents = []; bus.on('economy:grantCredits', event => creditIntents.push(structuredClone(event)));
  state.mode = 'flight'; state.run = { kind: 'adventure' };
  state.world.currentSectorId = 'sector_tethys_junction';
  state.story.beatIndex = 2; state.story.campaign47a = createCampaign47aState();
  state.onboarding = { active: false, finished: true };
  state.player.credits = 5000; state.player.heat = 0;
  state.player.cargo.capVolume = 120; state.player.cargo.capMass = 200;
  let next = 100;
  const helpers = {
    voice: { say: () => true },
    spawnEntity(spec) {
      const e = makeEntity({ ...spec, id: next++ }); stampOccupantGeneration(state, e);
      state.entities.set(e.id, e); state.entityList.push(e); return e;
    },
    removeEntity(id) {
      const e = state.entities.get(id); if (e) e.alive = false;
      state.entities.delete(id); state.entityList = state.entityList.filter(e => e.id !== id);
    },
    combatPhysics: { createAttachment: () => ({ id: next++ }), cutAttachment: () => true },
  };
  const player = helpers.spawnEntity({ type: 'ship', isPlayer: true, team: 1,
    pos: { ...PAD }, vel: { x: 0, z: 0 }, mass: 18, radius: 12, hull: 100,
    // A finite capable fit: the live underway law gives 33.75t tow capacity.
    data: { derived: { mass: 18, operationalMass: 18, propulsion: { mainAccel: 100 } } } });
  state.playerId = player.id;
  const owner = Object.create(missions), aftermath = Object.create(aftermathWrecks);
  const rook = createRookBooth(), gardenOwner = Object.create(understoryGardens);
  const cargoOwner = Object.create(cargo), loot = Object.create(lootShards), miningOwner = Object.create(mining);
  const systems = { missions: owner, aftermathWrecks: aftermath, rookBooth: rook,
    understoryGardens: gardenOwner, cargo: cargoOwner, lootShards: loot, mining: miningOwner };
  const registry = { get: name => systems[name] || null };
  for (const system of Object.values(systems)) system.init({ state, bus, helpers, registry });
  const board = owner.ensureBoard('station_tethys');
  const offer = board.slots.find(m => m.storyTag === 'campaign47a:b2:cinder'); assert.ok(offer);
  assert.equal(owner.acceptMission(offer.id), true);
  const m = state.missions.active.find(m => m.storyTag === offer.storyTag);
  state.world.currentSectorId = SECTOR; bus.emit('sector:enter', { sectorId: SECTOR });
  owner.spawnTargetsForSector(SECTOR);
  assert.equal(m.targetEntityIds.length, 3);
  const killer = Object.assign(Object.create(combat), { state, bus, helpers });
  for (const id of [...m.targetEntityIds]) killer.kill(state.entities.get(id), state.playerId);
  const hulls = m.params.cinderMarkedWrecks.map(row => aftermath._resolveBoundWreck(row.markerId));
  assert.equal(hulls.length, 3); assert.ok(hulls.every(Boolean));
  if (outcome === 'delivered') {
    hulls[0].pos = { ...PAD }; hulls[0].vel = { x: 0, z: 0 };
    rook.update(1 / 60, state);
    assert.equal(hulls[0].alive, false);
    assert.equal(m.params.cinderDeliveredMarkerId, hulls[0].data.markerId);
  } else {
    for (const hull of hulls) {
      // The kill producer receives the lethal hull state from damage.
      hull.hull = 0; killer.kill(hull, state.playerId);
    }
    owner.update(1 / 60, state);
    assert.equal(m.params.cinderDeliveredMarkerId, undefined);
  }
  assert.equal(m.status, 'completed');
  assert.deepEqual(getBeatStepStatus(state, 2).completed, ['cinder_board']);
  state.ui.trackedMissionId = null;
  gardenOwner.update(1 / 60, state);
  const garden = state.entityList.find(e => e.data?.gardenId === UNDERSTORY_RECEIVER.gardenId);
  assert.ok(garden); assert.equal(garden.data.gardenBiomass, 52);
  ensureCombatState(state);
  const service = createAttachmentService({ state, bus, helpers, catalog: createCombatCatalog() });
  function attach(body) {
    const previous = state.player.tether;
    if (previous?.attachmentId != null) service.cut(previous.attachmentId, player.id, 'test-change-load');
    const result = service.create({ defId: 'tether_standard', ownerId: player.id, targetId: body.id });
    assert.equal(result.ok, true, JSON.stringify(result));
    const a = result.attachment || service.get(result.attachmentId);
    state.player.tether = { active: true, targetId: body.id, attachmentId: a.id }; return a;
  }
  function read() { return owner._storyWaypointForBeat({ beat: 2 }); }
  function jettison(qty) {
    assert.equal(cargoOwner.jettison(IRON, qty), qty);
    const pod = [...state.entityList].reverse().find(e => e.alive && e.data?.jettisonedCargo);
    assert.ok(pod); return pod;
  }
  function feed(body) {
    attach(body); body.pos = { ...garden.pos }; body.vel = { x: 0, z: 0 };
    gardenOwner.update(1 / 60, state);
    assert.equal(body.alive, false);
  }
  function ironFace(overrides = {}) {
    return helpers.spawnEntity({ type: 'asteroid', pos: { x: garden.pos.x - 1200, z: garden.pos.z + 350 },
      mass: 100, radius: 30, hull: 100,
      data: { typeId: 'ast_metallic', oreHP: 320, oreHPMax: 320, yieldU: 32, sectorId: SECTOR }, ...overrides });
  }
  return { state, bus, owner, aftermath, rook, gardenOwner, cargoOwner, loot, player, m, hulls,
    helpers, service, garden, attach, read, jettison, feed, ironFace, registry, creditIntents, miningOwner };
}

function atGarden(route) {
  assert.deepEqual(route.pos, receiverApproach(), 'navigation stays at the safe west staging point');
  assert.equal(route.targetEntityId ?? null, null, 'never autopilot into the garden body');
}

function noRuntimeFeedPromises(route, ids) {
  assert.ok(!ids.includes(route.targetEntityId), 'unusable body must not be the proposed feed target');
}

test('all-lost Cinder routes to actual iron, free cargo returns home, real jettison mass grows the garden', () => {
  const h = fixture('all-lost');
  const face = h.ironFace();
  assert.equal(h.m.reward_cr, 0, 'all-lost route files clearance for no contract pay');
  assert.equal(h.creditIntents.length, 0);
  assert.equal(h.read().targetEntityId, face.id);
  // Extract through the ordinary mining owner into cargo, with the seed's real ore rolls.
  // The metallic definition caps each fixture face at 32u, not 17 guaranteed iron units.
  let cut = face;
  for (let faces = 0; faces < 4 && sellableCargoQuantity(h.state, IRON) < 17; faces += 1) {
    h.player.pos = { x: cut.pos.x - 100, z: cut.pos.z };
    assert.ok(h.miningOwner.applyMining(cut.id, 10000, 1, h.player.id) > 0);
    assert.equal(cut.data.oreHP, 0);
    if (sellableCargoQuantity(h.state, IRON) < 17) cut = h.ironFace();
  }
  assert.ok(sellableCargoQuantity(h.state, IRON) >= 17, 'actual seeded extraction supplied free iron');
  atGarden(h.read());
  const pod = h.jettison(17);
  assert.equal(h.loot.gardenFeedMass(pod), 13.600000000000001);
  assert.equal(pod.mass, 20, 'collider floor is not edible mass');
  h.feed(pod);
  assert.ok(Math.abs(h.garden.data.gardenBiomass - 60.16) < 1e-9);
  assert.equal(h.garden.data.gardenStage, 2);
  assert.deepEqual(h.read().pos, nestApproach());
});

test('owner refusal between reseed preflight and intake leaves the real load and destroyed site unchanged', () => {
  const h = fixture('all-lost');
  const killer = Object.assign(Object.create(combat), { state: h.state, bus: h.bus, helpers: h.helpers });
  h.garden.hull = 0; killer.kill(h.garden, h.player.id);
  h.player.data.derived.propulsion.mainAccel = 500;
  h.state.player.cargo.capVolume = 160;
  addCargo(h.state, IRON, 125);
  const pod = h.jettison(125);
  h.attach(pod); pod.pos = { ...h.garden.pos }; pod.vel = { x: 0, z: 0 };
  assert.equal(h.loot.gardenFeedMass(pod), 100, 'native preflight sees the actual cargo');
  const before = structuredClone(pod.data), creditCount = h.creditIntents.length;
  let attempted = 0, growths = 0;
  h.bus.on('understory:playerGrowth', () => { growths += 1; });
  // Deliberately exercise the documented preflight/commit race: the canonical material
  // owner refuses commit even though its earlier read was positive. No fake receipt.
  h.loot.consumeByGarden = () => { attempted += 1; return null; };
  h.gardenOwner.update(1 / 60, h.state);
  assert.equal(attempted, 1);
  assert.equal(pod.alive, true);
  assert.deepEqual(pod.data, before);
  assert.equal(h.state.understory.authoredReceiver.status, 'destroyed');
  assert.equal(h.state.entityList.some(e => e.alive && e.data?.gardenId === UNDERSTORY_RECEIVER.gardenId), false);
  assert.equal(growths, 0);
  assert.equal(h.creditIntents.length, creditCount);
  assert.deepEqual(getBeatStepStatus(h.state, 2).completed, ['cinder_board']);
});

test('actual partial paid-run credit survives destruction, regrowth and owner restoration; the 240t grant stays once-only', () => {
  const h = fixture(), hulls = h.hulls.filter(e => e.alive);
  addCargo(h.state, IRON, 5); h.feed(h.jettison(5));
  assert.equal(h.garden.data.compostFedMass, 4);
  const killer = Object.assign(Object.create(combat), { state: h.state, bus: h.bus, helpers: h.helpers });
  h.garden.hull = 0; killer.kill(h.garden, h.player.id);
  h.feed(hulls[0]);
  const regrown = h.state.entityList.find(e => e.alive && e.data?.gardenId === UNDERSTORY_RECEIVER.gardenId);
  assert.ok(regrown);
  assert.ok(Math.abs(regrown.data.gardenBiomass - 9.6) < 1e-9, 'regrowth has no initial52 subsidy');
  assert.equal(regrown.data.compostFedMass, 20, 'the earlier4t remains paid-run work after the16t reseed');
  const roundtrip = () => {
    const bodyData = structuredClone(regrown.data), saved = JSON.parse(JSON.stringify(h.gardenOwner.serialize()));
    h.gardenOwner.deserialize(saved); regrown.data = bodyData; h.bus.emit('save:loaded', {});
  };
  roundtrip(); h.feed(hulls[1]);
  assert.equal(regrown.data.compostFedMass, 36, 'owner restoration resumes partial credit, not a zero ledger');
  const payments = () => h.creditIntents.filter(event => event.reason === 'understory_compost_run');
  assert.equal(payments().length, 0);
  h.player.data.derived.propulsion.mainAccel = 500;
  h.state.player.cargo.capVolume = 400; h.state.player.cargo.capMass = 400;
  assert.equal(addCargo(h.state, IRON, 255), 255);
  h.feed(h.jettison(255)); // 204t actual contents brings prior36 to exactly240.
  assert.ok(Math.abs(regrown.data.compostFedMass - 240) < 1e-9);
  assert.equal(regrown.data.compostRunComplete, true);
  assert.equal(payments().length, 1);
  assert.ok(Math.abs(payments()[0].amount - 2880) < 1e-9);
  roundtrip(); addCargo(h.state, IRON, 1); h.feed(h.jettison(1));
  assert.equal(payments().length, 1, 'further real feeding after restore never remints the completed run');
});

test('real mission-owned CR-FEED lots are never garden feed or silent mission material destruction', () => {
  const h = fixture('all-lost');
  // Use the authored contract definition and its actual finite body producer. The fixture
  // initializes this accepted mission; it does not claim a second full Books0–1 playthrough.
  const row = embodiedMissionAt(1).bookContracts.find(r => r.storyTag === 'campaign47a:b1:infested');
  const m = { ...structuredClone(row), id: 'native-furnace-producer-proof', status: 'active',
    objectiveProgress: 0, objectiveTarget: 4, targetEntityIds: [] };
  h.state.missions.active.push(m); h.state.world.currentSectorId = m.destSectorId;
  syncFurnaceWorksite(h.owner, m);
  const lot = m.params.furnaceLots[0], body = h.state.entities.get(lot.entityId);
  assert.ok(body); assert.equal(body.data.persistenceOwner, 'missionFurnaceWorksite');
  assert.equal(body.flags.missionPinned, true);
  h.state.world.currentSectorId = SECTOR; body.pos = { x: h.player.pos.x + 40, z: h.player.pos.z };
  h.attach(body);
  assert.equal(h.gardenOwner.gardenFeedMass(body), null);
  assert.doesNotMatch(h.read().reason, /40t valid feed on your Line/);
  body.pos = { ...h.garden.pos };
  const lotBefore = structuredClone(lot);
  h.gardenOwner.update(1 / 60, h.state);
  assert.equal(body.alive, true);
  assert.deepEqual(lot, lotBefore);
  assert.equal(h.garden.data.gardenBiomass, 52);
  assert.deepEqual(getBeatStepStatus(h.state, 2).completed, ['cinder_board']);
});

test('native field promotion with an active resource ledger cannot be eaten behind that owner', () => {
  const h = fixture('all-lost');
  const rec = insertAsteroidFieldRock(h.state, { pos: { x: h.player.pos.x + 450, z: h.player.pos.z + 220 },
    radius: 10, mass: 18, hull: 320, hullMax: 320, homeSectorId: SECTOR,
    data: { typeId: 'ast_metallic', oreHP: 320, oreHPMax: 320, yieldU: 32,
      fieldId: 'f_charon_2', asteroidSlotId: 'first-feed-field-proof', sectorId: SECTOR } });
  const body = promoteAsteroidFieldRock(h.state, rec.id, h.helpers, 'tether');
  assert.ok(body, 'actual field owner promotes the finite rock');
  const stored = persistTouchedResourceBody(h.state, body);
  assert.ok(stored, 'actual resource owner captures the field-backed body');
  assert.equal(body.data.resourceBodyId, stored.recordId);
  h.attach(body);
  assert.equal(h.gardenOwner.gardenFeedMass(body), null);
  body.pos = { ...h.garden.pos };
  const before = structuredClone(stored);
  h.gardenOwner.update(1 / 60, h.state);
  assert.equal(body.alive, true);
  assert.deepEqual(stored, before);
  assert.equal(h.garden.data.gardenBiomass, 52);
});

test('real quiet-cache producer remains edible with its open owner record and after session restore forgets the return', () => {
  for (const orphan of [false, true]) {
    const h = fixture('all-lost');
    const rec = h.gardenOwner._spawnDrop(h.state, h.state.understory, {
      kind: 'stash', gardenId: h.garden.data.gardenId, sectorId: SECTOR,
      anchor: { x: h.garden.pos.x, z: h.garden.pos.z, radius: h.garden.radius },
    });
    const body = h.state.entities.get(rec.entityId); assert.ok(body);
    body.pos = { x: h.player.pos.x + 40, z: h.player.pos.z };
    if (orphan) {
      const saved = JSON.parse(JSON.stringify(h.gardenOwner.serialize()));
      h.gardenOwner.deserialize(saved); h.bus.emit('save:loaded', {});
      h.gardenOwner.update(1 / 60, h.state);
      assert.equal(body.data.understoryResolved, true, 'existing orphan handling resolves the forgotten envelope');
    }
    assert.equal(h.gardenOwner.gardenFeedMass(body), body.mass);
    h.attach(body); atGarden(h.read());
    const before = h.creditIntents.length;
    h.feed(body);
    assert.equal(h.garden.data.gardenFedMass, 12);
    assert.equal(h.garden.data.compostFedMass, 12);
    if (orphan) assert.equal(h.creditIntents.length, before, 'orphan remains an ordinary meal, never a reminted envelope');
    else {
      assert.equal(rec.state, 'returned');
      assert.equal(h.creditIntents.length, before + 1, 'native quiet return settles exactly once');
    }
    const settledCount = h.creditIntents.length;
    h.gardenOwner.update(1 / 60, h.state);
    assert.equal(h.creditIntents.length, settledCount, 'a stale consumed cache never replays its envelope');
    assert.equal(h.garden.data.compostFedMass, 12);
  }
});

test('missing or invalid restored partial-run stamps never invent prior credit when real new feed arrives', () => {
  for (const stamp of [undefined, -4, NaN, Infinity, '20', { fedMass: 20 }]) {
    const h = fixture('all-lost');
    const saved = JSON.parse(JSON.stringify(h.gardenOwner.serialize()));
    h.gardenOwner.deserialize(saved); h.bus.emit('save:loaded', {});
    if (stamp === undefined) delete h.garden.data.compostFedMass;
    else h.garden.data.compostFedMass = stamp;
    assert.equal(h.state.understory.compost[h.garden.data.gardenId], undefined);
    addCargo(h.state, IRON, 5); h.feed(h.jettison(5));
    assert.equal(h.garden.data.compostFedMass, 4, `invalid stamp ${String(stamp)} cannot become earned credit`);
    assert.equal(h.garden.data.gardenFedByPlayer, 4);
    assert.notEqual(h.garden.data.compostRunComplete, true);
    assert.equal(h.creditIntents.filter(event => event.reason === 'understory_compost_run').length, 0);
  }
});

test('quiet-cache exceptions reject bare tags, copied active rows, stale generations, duplicate orphans and foreign owners', () => {
  for (const variant of ['bare-tag', 'copied-active', 'stale-generation', 'duplicate-orphan', 'foreign-owner']) {
    const h = fixture('all-lost');
    const rec = h.gardenOwner._spawnDrop(h.state, h.state.understory, {
      kind: 'stash', gardenId: h.garden.data.gardenId, sectorId: SECTOR,
      anchor: { x: h.garden.pos.x, z: h.garden.pos.z, radius: h.garden.radius },
    });
    const original = h.state.entities.get(rec.entityId);
    let body = original;
    if (variant === 'bare-tag') {
      body = h.helpers.spawnEntity({ type: 'payload', mass: 18, radius: 10, hull: 50, hullMax: 50,
        pos: { ...h.player.pos }, flags: { persistent: true },
        data: { understoryDrop: true, understoryCacheId: 'drop:999999', cacheKind: 'stash' } });
    } else if (variant === 'copied-active') {
      body = h.helpers.spawnEntity({ type: original.type, mass: original.mass, radius: original.radius,
        hull: original.hull, hullMax: original.hullMax, pos: { x: original.pos.x, z: original.pos.z },
        flags: structuredClone(original.flags), data: structuredClone(original.data) });
    } else if (variant === 'stale-generation') {
      stampOccupantGeneration(h.state, body);
      // The actual allocator changes identity only on occupancy; force a different token
      // to model a stale cache row after occupant replacement, not a real earned return.
      body.occupantGeneration = `${rec.gen}:replaced`;
    } else if (variant === 'duplicate-orphan') {
      const saved = JSON.parse(JSON.stringify(h.gardenOwner.serialize()));
      h.gardenOwner.deserialize(saved); h.bus.emit('save:loaded', {});
      h.gardenOwner.update(1 / 60, h.state);
      assert.equal(original.data.understoryResolved, true);
      h.helpers.spawnEntity({ type: original.type, mass: original.mass, radius: original.radius,
        hull: original.hull, hullMax: original.hullMax, pos: { x: original.pos.x, z: original.pos.z },
        flags: structuredClone(original.flags), data: structuredClone(original.data) });
    } else {
      body.data.persistenceOwner = 'foreign-custody-owner';
    }
    body.pos = { x: h.player.pos.x + 40, z: h.player.pos.z };
    h.attach(body);
    assert.equal(h.gardenOwner.gardenFeedMass(body), null, variant);
    body.pos = { ...h.garden.pos };
    const grantCount = h.creditIntents.length;
    h.gardenOwner.update(1 / 60, h.state); h.gardenOwner.update(1 / 60, h.state);
    assert.equal(body.alive, true, `${variant}: refusal does not remove the load`);
    assert.equal(h.garden.data.gardenBiomass, 52, variant);
    assert.equal(h.creditIntents.length, grantCount, `${variant}: no cache or compost grant`);
    assert.deepEqual(getBeatStepStatus(h.state, 2).completed, ['cinder_board']);
  }
});


test('generic meals refuse canonical custody markers without authorized retirement', () => {
  for (const key of ['markerId', 'physicalCustodyOnly', 'orchardId', 'alienSiteId', 'arenaShardOf', 'reefMineId', 'reefMine']) {
    const h = fixture('all-lost');
    const body = h.helpers.spawnEntity({ type: 'wreck', pos: { ...h.garden.pos }, radius: 10,
      mass: 16, hull: 20, data: { [key]: 'owned', thrownBy: h.player.id } });
    const before = structuredClone(body.data), credits = h.creditIntents.length;
    assert.equal(h.gardenOwner.gardenFeedMass(body), null, key);
    h.gardenOwner.update(1 / 60, h.state);
    assert.equal(body.alive, true, key);
    assert.deepEqual(body.data, before, key);
    assert.equal(h.garden.data.gardenBiomass, 52, key);
    assert.equal(h.creditIntents.length, credits, key);
  }
});


test('absent player identity cannot credit ambient feed; numeric zero and delayed throws remain valid', () => {
  for (const missing of [null, undefined]) {
    for (const data of [{}, { thrownBy: 'player' }, { lastThrowerId: missing }]) {
      const h = fixture('all-lost'); h.state.playerId = missing;
      const body = h.helpers.spawnEntity({ type: 'wreck', pos: { ...h.garden.pos }, radius: 10,
        mass: 240, hull: 20, data });
      // Even a stale player tether cannot authenticate a delivery without a player identity.
      h.state.player.tether = { active: true, targetId: body.id };
      const credits = h.creditIntents.length;
      assert.equal(h.gardenOwner._playerHandled(h.state, body), false);
      h.gardenOwner.update(1 / 60, h.state);
      assert.equal(body.alive, true);
      assert.equal(h.garden.data.gardenBiomass, 52);
      assert.equal(h.garden.data.compostFedMass, 0);
      assert.equal(h.creditIntents.length, credits);
      assert.deepEqual(getBeatStepStatus(h.state, 2).completed, ['cinder_board']);
    }
  }
  for (const id of [0, 100]) {
    const h = fixture('all-lost'); h.state.playerId = id;
    h.state.entities.delete(h.player.id); h.state.player.tether = null;
    const body = h.helpers.spawnEntity({ type: 'wreck', pos: { ...h.garden.pos }, radius: 10,
      mass: 16, hull: 20, data: { lastThrowerId: id } });
    assert.equal(h.gardenOwner._playerHandled(h.state, body), true);
    h.gardenOwner.update(1 / 60, h.state);
    assert.equal(body.alive, false);
    assert.equal(h.garden.data.compostFedMass, 16);
    assert.equal(h.garden.data.gardenBiomass, 61.6);
  }
});


