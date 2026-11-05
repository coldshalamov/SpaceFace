// Focused Book 4 runtime regression: Spine Break must be one real, mission-owned cargo spine
// and its live mission save must Continue without a second cast.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { save as saveProto } from '../src/save/saveSystem.js';
import { factionMeridian } from '../src/systems/faction_meridian.js';
import { economy as economyProto } from '../src/systems/economy.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { SECTORS } from '../src/data/sectors.js';
import { ensureCampaign47aState, recordBeatStep } from '../src/story/campaign47a/index.js';
import { spineBreakContainers, spineBreakOutcome } from '../src/missions/spineBreakWorksite.js';
import { createSimulation } from '../src/core/sim.js';
import { world } from '../src/systems/world.js';
import { physics } from '../src/core/physics.js';
import { writePhysicsControl } from '../src/core/physicsAuthority.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';

function createMissionHarness(seed = 9301) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 10;
  state.playerId = 1;
  state.player.credits = 5000;
  state.player.heat = 0;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 80, capMass: 200 };
  state.entities = new Map();
  const player = {
    id: 1, team: 'player', type: 'player', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    alive: true, flags: {}, data: {}, hull: 100, maxHull: 100,
  };
  state.entities.set(player.id, player);
  state.entityList = [player];
  state.world.currentSectorId = 'sector_tethys_junction';
  state.story = {
    beatIndex: 4, branch: 'traders', chainProgress: 0,
    flags: { elroy_outcome: 'force', embodied_route: 'book' },
  };
  ensureCampaign47aState(state);
  const intro = recordBeatStep(state, 'mission:accepted', {
    type: 'smuggling_run', storyTag: 'story.branch_intro', branch: 'traders', factionId: 'faction_mts',
  }, state.simTime);
  assert.equal(intro.ok, true, 'the selected-branch intro step is present before the operation posts');
  state.missions = { boards: {}, active: [], completedLog: [], receipts: [], nextId: 1, config: null };

  const bus = createBus();
  const economyGrants = [];
  const claimSettlements = [];
  bus.on('economy:grantCredits', (payload) => economyGrants.push({ ...payload }));
  bus.on('meridian:claimSettled', (payload) => claimSettlements.push(payload));
  let nextGeneration = 1;
  const helpers = {
    hash32,
    mulberry32,
    bumpGeneration: (count = 100) => { nextGeneration += count; },
    voice: { say: () => true },
    player: () => state.entities.get(state.playerId),
    spawnEntity(spec) {
      const requestedId = Number.isSafeInteger(spec?.id) && spec.id > 0 && !state.entities.has(spec.id)
        ? spec.id : null;
      let id = requestedId ?? (state.entities.size ? Math.max(...state.entities.keys()) + 1 : 1);
      while (state.entities.has(id)) id++;
      const entity = {
        id, alive: true, vel: { x: 0, z: 0 },
        flags: {}, data: {}, ...spec,
      };
      Object.defineProperty(entity, 'occupantGeneration', {
        value: nextGeneration++, writable: true, configurable: true, enumerable: false,
      });
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (!entity) return false;
      entity.alive = false;
      state.entities.delete(id);
      state.entityList = state.entityList.filter((row) => row !== entity);
      return true;
    },
  };
  const meridian = Object.assign({}, factionMeridian);
  meridian.init({ state, bus, helpers });
  const missions = Object.assign({}, missionsProto);
  const registry = { get: (name) => name === 'missions' ? missions
    : name === 'faction_meridian' ? meridian : null };
  const economy = Object.assign({}, economyProto);
  economy.init({ state, bus, helpers, registry });
  missions.init({ state, bus, helpers, registry });
  return { state, bus, helpers, missions, registry, meridian, economyGrants, claimSettlements };
}

function acceptSpineBreak(h) {
  const board = h.missions.ensureBoard('station_tethys');
  const offer = board.slots.find((row) => row?.storyTag === 'campaign47a:b4:operation');
  assert.ok(offer, `Book 4 traders operation not posted: ${JSON.stringify(board.slots.map((row) => ({ id: row.id, tag: row.storyTag, title: row.title })))}`);
  assert.equal(offer.type, 'escort');
  assert.equal(offer.params?.bookScene, 'spine_break');
  assert.equal(h.missions.acceptMission(offer.id), true);
  const mission = h.state.missions.active.find((row) => row.storyTag === 'campaign47a:b4:operation');
  assert.ok(mission, 'accepted Book 4 operation is active');
  return mission;
}

function addDestinationStation(h, mission, pos = { x: 0, z: 0 }) {
  const sector = SECTORS.find((row) => row.id === mission.destSectorId);
  const station = sector?.stations?.find((row) => row.id === mission.destStationId);
  assert.ok(station, `destination station ${mission.destStationId} exists in ${mission.destSectorId}`);
  h.helpers.spawnEntity({ type: 'station', pos: { ...pos }, flags: { persistent: false },
    data: { stationId: mission.destStationId, dockRadius: 140 } });
}

function saveOwner(state, missions, registry, helpers = null) {
  return Object.assign({}, saveProto, {
    state,
    registry,
    helpers,
    _callDeserialize(name, data) {
      assert.equal(name, 'missions');
      missions.deserialize(data);
    },
  });
}

function bringLooseBoxToTail(h, mission) {
  const worksite = mission.params.spineBreakWorksite;
  const linked = spineBreakContainers(h.state, mission).filter((entity) => entity.data.spineLoose !== true
    && entity.data.spineId === worksite.spineId);
  const tail = linked.sort((a, b) => b.data.spineIndex - a.data.spineIndex)[0];
  const loose = spineBreakContainers(h.state, mission).find((entity) => entity.data.authoredLoose === true
    && entity.data.spineLoose === true);
  assert.ok(tail, 'the surviving spine has a physical tail to receive loose freight');
  assert.ok(loose, 'a mission-owned authored loose box remains physically recoverable');
  loose.pos.x = tail.pos.x - 20;
  loose.pos.z = tail.pos.z;
  loose.vel = { x: 0, z: 0 };
  h.meridian.update(1 / 60, h.state);
  assert.equal(loose.data.spineLoose, false, 'Meridian closes a real coupler at the live tail');
  assert.equal(loose.data.spineId, worksite.spineId, 'the physical box rejoins this mission spine');
  return loose;
}

test('native freight movement closes three real couplers before the mission handoff', async () => {
  const flags = snapshotFeatureMaps();
  applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  const sim = createSimulation({ seed: 9301, systems: [physics, factionMeridian, economyProto, missionsProto], updateOrder: [] });
  try {
    const { state, registry, bus } = sim;
    state.mode = 'flight';
    state.world.currentSectorId = 'sector_ceres_belt';
    state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    const player = sim.spawn({ type: 'ship', isPlayer: true, team: 0, pos: sectorGlobalOrigin('sector_ceres_belt'),
      vel: { x: 0, z: 0 }, radius: 8, mass: 100, hull: 100, hullMax: 100,
      data: { defId: 'ship_kestrel', fittings: [], weapons: [] } });
    state.playerId = player.id;
    state.story = { beatIndex: 4, branch: 'traders', flags: { embodied_route: 'book', elroy_outcome: 'force' } };
    ensureCampaign47aState(state);
    assert.equal(recordBeatStep(state, 'mission:accepted', { type: 'smuggling_run',
      storyTag: 'story.branch_intro', branch: 'traders', factionId: 'faction_mts' }, state.simTime).ok, true);
    const owner = registry.get('missions');
    const offer = owner.ensureBoard('station_tethys').slots.find(row => row?.storyTag === 'campaign47a:b4:operation');
    assert.ok(offer);
    assert.equal(owner.acceptMission(offer.id), true);
    const mission = state.missions.active.find(row => row.storyTag === 'campaign47a:b4:operation');
    owner.spawnTargetsForSector(mission.destSectorId);
    const native = registry.get('physics');
    const meridian = registry.get('faction_meridian');
    await native.prepareBackend(state);
    const step = () => { state.tick++; state.simTime += 1 / 60; native.update(1 / 60, state); meridian.update(1 / 60, state); };
    step();
    const grants = [];
    bus.on('economy:grantCredits', p => grants.push(p));
    // Admission applies forces through the real native physics membrane, standing in for
    // player towing. Meridian alone decides when a real loose box re-couples.
    for (let tick = 0; tick < 3600 && spineBreakOutcome(state, mission).recoupled < 3; tick++) {
      const live = spineBreakContainers(state, mission);
      const linked = live.filter(e => e.data.spineLoose !== true).sort((a, b) => b.data.spineIndex - a.data.spineIndex);
      const loose = live.find(e => e.data.authoredLoose === true && e.data.spineLoose === true);
      const tail = linked[0];
      if (loose && tail) {
        const dx = tail.pos.x - loose.pos.x, dz = tail.pos.z - loose.pos.z;
        const d = Math.hypot(dx, dz) || 1, speed = Math.min(15, d * 0.3);
        writePhysicsControl(loose, { source: 'spine-fixture-tow',
          force: { x: (dx / d * speed - loose.vel.x) * loose.mass * 2, y: 0,
            z: (dz / d * speed - loose.vel.z) * loose.mass * 2 },
          torque: { x: 0, y: 0, z: 0 }, maxSpeed: 15 });
      }
      step();
    }
    assert.equal(spineBreakOutcome(state, mission).recoupled, 3);
    bus.emit('dock:docked', { stationId: mission.destStationId });
    assert.equal(mission.status, 'active', 'the real tug has not reached a station yet');
    assert.equal(grants.length, 0);
    const tug = state.entities.get(mission._escorteeId);
    // Explicit station admission at the tug's current position; the mission owner observes arrival.
    sim.spawn({ type: 'station', pos: { ...tug.pos }, data: { stationId: mission.destStationId, dockRadius: 140 } });
    owner._steerEscortee(mission, state, 1 / 60);
    bus.emit('dock:docked', { stationId: mission.destStationId });
    assert.equal(mission.status, 'completed');
    assert.equal(state.story.beatIndex, 5, 'the completed operation advances the selected Book 4 door');
    assert.equal(grants.filter(row => row.reason === `mission:${mission.id}`).length, 1);
    bus.emit('dock:docked', { stationId: mission.destStationId });
    assert.equal(grants.filter(row => row.reason === `mission:${mission.id}`).length, 1);
  } finally {
    sim.dispose();
    restoreFeatureMaps(flags);
  }
});

test('accepted Spine Break survives the public Save and Continue owner', async () => {
  const previousStorage = globalThis.localStorage;
  const flags = snapshotFeatureMaps();
  applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(String(key)) ?? null,
    setItem: (key, value) => values.set(String(key), String(value)),
    removeItem: key => values.delete(String(key)),
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
  const sim = createSimulation({ seed: 9301, systems: [world, physics, factionMeridian, economyProto, missionsProto, saveProto], updateOrder: [] });
  try {
    const { state, registry, bus } = sim;
    state.mode = 'flight';
    state.world.currentSectorId = 'sector_ceres_belt';
    state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    registry.get('world').enterSector('sector_ceres_belt', { placePlayer: false });
    const destination = registry.get('missions')._liveStation('station_ceres');
    assert.ok(destination, 'the actual destination station is materialized');
    // Scene admission places the pilot at the destination before the convoy is spawned;
    // mission steering has not yet recorded the tug's arrival.
    const player = sim.spawn({ type: 'ship', isPlayer: true, team: 0, pos: { ...destination.pos },
      vel: { x: 0, z: 0 }, radius: 8, mass: 100, hull: 100, hullMax: 100,
      data: { defId: 'ship_kestrel', fittings: [], weapons: [] } });
    state.playerId = player.id;
    // Explicit admission: the prior traders introduction is accepted before the board opens.
    state.story = { beatIndex: 4, branch: 'traders', flags: { embodied_route: 'book', elroy_outcome: 'force' } };
    ensureCampaign47aState(state);
    assert.equal(recordBeatStep(state, 'mission:accepted', { type: 'smuggling_run',
      storyTag: 'story.branch_intro', branch: 'traders', factionId: 'faction_mts' }, state.simTime).ok, true);
    const owner = registry.get('missions');
    const offer = owner.ensureBoard('station_tethys').slots.find(row => row?.storyTag === 'campaign47a:b4:operation');
    assert.ok(offer);
    assert.equal(owner.acceptMission(offer.id), true);
    const mission = state.missions.active.find(row => row.storyTag === 'campaign47a:b4:operation');
    owner.spawnTargetsForSector(mission.destSectorId);
    const oldSite = mission.params.spineBreakWorksite;
    assert.equal(oldSite.containers.length, 6);
    const native = registry.get('physics'), meridian = registry.get('faction_meridian');
    await native.prepareBackend(state);
    const step = () => { state.tick++; state.simTime += 1 / 60; native.update(1 / 60, state); meridian.update(1 / 60, state); };
    step();
    // Explicit force fixture: native physics moves the original boxes; Meridian couples them.
    for (let tick = 0; tick < 3600 && spineBreakOutcome(state, mission).recoupled < 3; tick++) {
      const live = spineBreakContainers(state, mission);
      const tail = live.filter(e => e.data.spineLoose !== true).sort((a, b) => b.data.spineIndex - a.data.spineIndex)[0];
      const loose = live.find(e => e.data.authoredLoose === true && e.data.spineLoose === true);
      if (tail && loose) {
        const dx = tail.pos.x - loose.pos.x, dz = tail.pos.z - loose.pos.z;
        const d = Math.hypot(dx, dz) || 1, speed = Math.min(15, d * 0.3);
        writePhysicsControl(loose, { source: 'spine-fixture-tow',
          force: { x: (dx / d * speed - loose.vel.x) * loose.mass * 2, y: 0,
            z: (dz / d * speed - loose.vel.z) * loose.mass * 2 },
          torque: { x: 0, y: 0, z: 0 }, maxSpeed: 15 });
      }
      step();
    }
    owner._refreshSpineBreakProgress(mission);
    assert.equal(mission.objectiveProgress, 3, 'save occurs after three real couplers and before arrival');
    assert.equal(mission._escorteeArrived, false);
    const identities = spineBreakContainers(state, mission).map(e => e.data.spineBreakIdentity).sort();
    const saveOwner = registry.get('save');
    assert.equal(await Promise.resolve(saveOwner.save('quick')), true);
    assert.equal(await Promise.resolve(saveOwner.load('quick')), true);
    const continued = state.missions.active.find(row => row.id === mission.id);
    assert.equal(continued?.status, 'active');
    const tug = state.entities.get(continued._escorteeId);
    assert.equal(tug?.data.spineBreakTugIdentity, continued.params.spineBreakWorksite.tugIdentity);
    assert.equal(spineBreakContainers(state, continued).length, 6);
    assert.equal(state.entityList.filter(e => e.alive !== false && e.data?.spineBreakTug === true).length, 1);
    assert.equal(state.entityList.filter(e => e.alive !== false && e.data?.spineBreakContainer === true).length, 6);
    for (let n = 0; n < 3; n++) owner._ensureMissionTargets(continued);
    assert.deepEqual(spineBreakContainers(state, continued).map(e => e.data.spineBreakIdentity).sort(), identities);
    assert.equal(state.entityList.filter(e => e.alive !== false && e.data?.spineBreakTug === true).length, 1);
    assert.equal(continued.params.spineBreakWorksite.retries, 0);
    const grants = [];
    bus.on('economy:grantCredits', p => grants.push(p));
    owner._steerEscortee(continued, state, 1 / 60);
    assert.equal(owner._escorteeArrivedOk(continued), true, JSON.stringify({ tug: tug.pos,
      station: owner._liveStation(continued.destStationId)?.pos, arrived: continued._escorteeArrived,
      outcome: spineBreakOutcome(state, continued) }));
    assert.equal(spineBreakOutcome(state, continued).recoupled, 3,
      JSON.stringify({ tug: tug.pos, outcome: spineBreakOutcome(state, continued),
        boxes: spineBreakContainers(state, continued).map(e => ({ pos: e.pos, vel: e.vel, loose: e.data.spineLoose,
          index: e.data.spineIndex, tier: e.activity?.simTier })), native: native._diag }));
    bus.emit('dock:docked', { stationId: continued.destStationId });
    assert.equal(continued.status, 'completed');
    assert.equal(grants.filter(row => row.reason === `mission:${continued.id}`).length, 1);
    bus.emit('dock:docked', { stationId: continued.destStationId });
    assert.equal(grants.filter(row => row.reason === `mission:${continued.id}`).length, 1);
  } finally {
    sim.dispose();
    restoreFeatureMaps(flags);
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});

test('the selected Spine Break operation is one physical mission cast across Save/Continue', () => {
  const h = createMissionHarness();
  const mission = acceptSpineBreak(h);
  addDestinationStation(h, mission);
  h.state.world.currentSectorId = mission.destSectorId;
  h.missions.spawnTargetsForSector(mission.destSectorId);

  const tug = h.state.entities.get(mission._escorteeId);
  assert.ok(tug, 'the actual escort mission has one live lead');
  assert.equal(h.state.entityList.filter((entity) => entity.alive !== false
    && entity.data?.escortee === 'lead' && String(entity.data?.missionTag) === String(mission.id)).length, 1,
  'the physical worksite must reuse the mission convoy lead');
  const containers = h.state.entityList.filter((entity) => entity.alive !== false
    && entity.data?.spineBreakContainer === true && String(entity.data?.missionTag) === String(mission.id));
  assert.equal(containers.length, 6, 'one cast must include the six promised physical containers');
  assert.equal(h.state.meridian.convoys.length, 0, 'mission-owned train is not registered as an ambient convoy');
  assert.equal(mission.objectiveTarget, 3, 'the runtime objective is three physically re-coupled boxes');

  // The Meridian owner must perform the real coupler snap, keep the mission cargo outside the
  // generic claims ledger, and steer linked boxes through queued physics impulses rather than
  // editing their positions. An unrelated ambient spill still receives its ordinary claim.
  const linked = containers.filter((entity) => entity.data.authoredLoose !== true);
  assert.equal(linked.length, 2);
  linked[0].pos.x += 8; // a small real gap requires correction but stays inside the coupler stretch
  const beforeFollow = structuredClone(linked[0].pos);
  tug.vel = { x: 12, z: 0 };
  tug.rot = 0;
  h.meridian.update(1 / 60, h.state);
  assert.equal(spineBreakOutcome(h.state, mission).status, 'pending');
  assert.equal(spineBreakOutcome(h.state, mission).possible, 4,
    'four boxes remain recouplable after the Meridian owner clears their live spineId on snap');
  assert.ok(spineBreakOutcome(h.state, mission).liveCount >= 6);
  const followCommand = consumePhysicsCommand(linked[0]);
  assert.ok(followCommand?.impulses?.length, 'linked cargo follows the tug through the physics command owner');
  assert.deepEqual(linked[0].pos, beforeFollow, 'the coupler owner never teleports an attached box');
  assert.equal(h.state.meridian.claims.some((claim) => containers.some((box) => box.id === claim.boxId)), false,
    'mission cargo cannot create generic recovery claims or duplicate payouts');
  assert.equal(h.missions._onSpineBreakCargoCollected({ pickupId: containers[2].id,
    acceptedAmount: 0, rejectedAmount: 6 }), undefined,
  'a refused scoop does not file a stolen manifest loss');
  assert.deepEqual(mission.params.spineBreakWorksite.stolenIndices, [],
    'a full hold cannot consume the operation retry or reduce the recoupling goal');
  const ambient = h.helpers.spawnEntity({ type: 'payload', pos: { x: 9000, z: 9000 },
    flags: { persistent: true }, data: { spineLoose: true, cargoValueCr: 2100, lostFromSpineId: 'ambient-spine' } });
  const ambientLead = h.helpers.spawnEntity({ type: 'ship', factionId: 'faction_mts',
    pos: { x: 9600, z: 9000 }, vel: { x: 0, z: 0 }, flags: { persistent: true },
    data: { spineId: 'ambient-spine', spineIndex: 0 } });
  h.helpers.spawnEntity({ type: 'payload', pos: { x: 9554, z: 9000 }, vel: { x: 0, z: 0 },
    flags: { persistent: true }, data: { spineId: 'ambient-spine', spineIndex: 1, spineLoose: false } });
  h.state.simTime += 1 / 60;
  h.meridian.update(1 / 60, h.state);
  assert.ok(h.state.meridian.claims.some((claim) => claim.boxId === ambient.id),
    'ordinary ambient loose freight retains the existing recovery-claim behavior');
  assert.equal(h.claimSettlements.filter((row) => row.boxId === ambient.id).length, 0,
    'ambient loose freight does not settle before it reaches its live train');
  const ambientTail = h.state.entityList.find((entity) => entity.data?.spineId === 'ambient-spine'
    && entity.data?.spineIndex === 1);
  ambient.pos.x = ambientTail.pos.x - 20;
  ambient.pos.z = ambientTail.pos.z;
  h.state.simTime += 1 / 60;
  h.meridian.update(1 / 60, h.state);
  assert.equal(ambient.data.spineLoose, false, 'ambient loose freight re-couples through the same Meridian law');
  assert.equal(h.claimSettlements.filter((row) => row.boxId === ambient.id).length, 1,
    'ambient freight keeps its ordinary one-time recovery payment on recoupling');
  h.state.simTime += 1 / 60;
  h.meridian.update(1 / 60, h.state);
  assert.equal(h.claimSettlements.filter((row) => row.boxId === ambient.id).length, 1,
    'repeated ambient ticks cannot duplicate the recovery payout');

  bringLooseBoxToTail(h, mission);
  bringLooseBoxToTail(h, mission);
  assert.equal(spineBreakOutcome(h.state, mission).recoupled, 2,
    'two loose boxes count only after Meridian physically closes their couplers');
  assert.equal(spineBreakOutcome(h.state, mission).status, 'pending');

  // Exercise the production mission owner’s save projection and SaveSystem’s persistent-body
  // projection, then follow Continue’s order: restore bodies, deserialize missions, and adopt
  // or rematerialize target bodies in the restored sector.
  const beforeLoadIds = new Set([tug.id, ...containers.map((entity) => entity.id)]);
  const save = saveOwner(h.state, h.missions, h.registry, h.helpers);
  const missionSnapshot = structuredClone(save._callSerialize('missions'));
  const entitySnapshot = structuredClone(save._serializeEntities());
  assert.equal(entitySnapshot.persistent.filter((entity) => entity.data?.spineBreakContainer === true).length, 6,
    'all mission cargo must ride the real persistent-entity save lane');
  assert.equal(missionSnapshot.active.find((row) => row.id === mission.id)
    ?.params?.spineBreakWorksite?.containers?.length, 6,
  'the live attempt identity manifest is durable alongside the mission row');
  const savedTug = entitySnapshot.persistent.find((entity) => entity.data?.spineBreakTug === true);
  const savedTugGeneration = missionSnapshot.active.find((row) => row.id === mission.id)
    ?.params?.spineBreakWorksite?.tugGeneration;
  assert.ok(savedTug, 'the reused mission tug rides the persistent-entity save lane');
  assert.equal(Object.hasOwn(savedTug, 'occupantGeneration'), false,
    'SaveSystem intentionally strips transient occupant generations from serialized entities');

  const continued = createMissionHarness(9302);
  continued.state.world.currentSectorId = mission.destSectorId;
  // Sector regeneration can leave transient occupants in saved numeric slots. Force the real
  // persistent restore lane to assign fresh ids as well as fresh occupant generations.
  for (const id of [...beforeLoadIds].sort((a, b) => a - b)) {
    continued.helpers.spawnEntity({ id, type: 'asteroid', pos: { x: 90000 + id, z: 90000 },
      flags: { persistent: false }, data: { unrelatedRestoreBlocker: true } });
  }
  continued.helpers.bumpGeneration(10000);
  const continuedSave = saveOwner(continued.state, continued.missions, continued.registry, continued.helpers);
  continued.bus.emit('save:restoring', { slot: 'test' });
  continuedSave._spawnPersistentEntities(entitySnapshot.persistent);
  continuedSave._restoreEntityIdAllocator(entitySnapshot);
  continuedSave._restoreMissions(missionSnapshot);
  continued.missions.spawnTargetsForSector(mission.destSectorId);
  const continuedMission = continued.state.missions.active.find((row) => row.id === mission.id);
  assert.ok(continuedMission, 'the same operation remains active after Continue');
  const continuedContainers = continued.state.entityList.filter((entity) => entity.alive !== false
    && entity.data?.spineBreakContainer === true && String(entity.data?.missionTag) === String(mission.id));
  const continuedLeads = continued.state.entityList.filter((entity) => entity.alive !== false
    && entity.data?.escortee === 'lead' && String(entity.data?.missionTag) === String(mission.id));
  assert.equal(continuedContainers.length, 6, 'Continue adopts the saved cargo instead of duplicating it');
  assert.equal(continuedLeads.length, 1, 'Continue restores exactly the existing convoy lead');
  assert.notEqual(continuedLeads[0].id, savedTug.id,
    'a recycled saved tug id is rebound from its durable mission identity');
  assert.notEqual(continuedLeads[0].occupantGeneration, savedTugGeneration,
  'Continue assigns a fresh live generation and the mission owner safely rebinds it');
  assert.equal(continuedMission._escorteeId, continuedLeads[0].id,
    'Continue reconnects the escort objective to the restored tug, not the blocker');
  assert.equal(continuedMission.params.spineBreakWorksite.containers.length, 6,
    'the rebound identity manifest keeps all six restored boxes');
  const savedBlocker = continued.state.entities.get(savedTug.id);
  assert.equal(continued.missions._escorteeArrivedOk({ ...continuedMission, _escorteeId: savedBlocker.id,
    _escorteeArrived: true }), false,
  'a different occupant recycled into the original tug id cannot satisfy dock arrival');
  continued.meridian.update(1 / 60, continued.state);
  assert.equal(continued.state.meridian.claims.some((claim) => continuedContainers.some((box) => box.id === claim.boxId)), false,
    'Continue does not revive generic recovery claims for mission-owned boxes');
  continued.bus.emit('save:loaded', { slot: 'test' });
  assert.equal(continued.missions._spineBreakSaveRestorePending, false,
    'the generation-rebind window closes after Continue completes');
  assert.equal(spineBreakOutcome(continued.state, continuedMission).recoupled, 2,
    'actual Continue preserves the two physically completed couplers');

  const beforeCredit = continued.state.player.credits;
  const grantsBeforeDock = continued.economyGrants.length;
  bringLooseBoxToTail(continued, continuedMission);
  assert.equal(spineBreakOutcome(continued.state, continuedMission).status, 'spine_recoupled',
    'three live Meridian couplers satisfy the authored operation');
  continued.bus.emit('dock:docked', { stationId: continuedMission.destStationId });
  assert.equal(continuedMission.status, 'active', 'three couplers alone cannot settle without a live berth arrival');
  assert.equal(continued.economyGrants.length, grantsBeforeDock);
  // Explicit fixture admission: place the live station at the restored tug's initial pose.
  // The production escort owner, not the fixture, must recognize its arrival.
  addDestinationStation(continued, continuedMission, continuedLeads[0].pos);
  continued.missions._steerEscortee(continuedMission, continued.state, 1 / 60);
  assert.equal(continued.missions._escorteeArrivedOk(continuedMission), true);
  continued.bus.emit('dock:docked', { stationId: continuedMission.destStationId });
  assert.equal(continuedMission.status, 'completed', 'the dock pays only after all three couplers and exact tug arrival');
  assert.ok(continued.state.player.credits > beforeCredit, 'the mission reward settles once after physical completion');
  assert.equal(continued.economyGrants.length, grantsBeforeDock + 1,
    'exactly one mission grant is issued after the third verified coupler');
  const paidCredits = continued.state.player.credits;
  continued.bus.emit('dock:docked', { stationId: continuedMission.destStationId });
  assert.equal(continued.state.player.credits, paidCredits, 'a repeated dock cannot duplicate the mission or Meridian payout');
  assert.equal(continued.economyGrants.length, grantsBeforeDock + 1,
    'the completed operation cannot emit a duplicate mission payout');
  assert.equal(continued.state.meridian.claims.some((claim) => continuedContainers.some((box) => box.id === claim.boxId)), false,
    'recoupled mission freight never leaves a generic recovery claim behind');
});

test('Spine Break rejects recycled box identities and grants exactly one whole-worksite retry', () => {
  const h = createMissionHarness(9311);
  const mission = acceptSpineBreak(h);
  h.state.world.currentSectorId = mission.destSectorId;
  h.missions.spawnTargetsForSector(mission.destSectorId);
  const worksite = mission.params.spineBreakWorksite;
  const original = worksite.containers.find((row) => row.index === 2);
  const stale = h.state.entities.get(original.id);
  assert.ok(stale);
  const replacementSpec = { ...stale, data: { ...stale.data, spineBreakIdentity: 'recycled-slot' } };
  h.helpers.removeEntity(stale.id);
  const recycled = h.helpers.spawnEntity({ ...replacementSpec, id: original.id, type: 'payload' });
  assert.equal(recycled.id, original.id, 'the harness reuses the exact numeric entity id');
  assert.notEqual(recycled.occupantGeneration, original.generation,
    'recycled ids receive a different live occupant generation');
  h.missions._adoptSpineBreakContainers(mission);
  assert.equal(h.state.entities.has(original.id), false,
    'a recycled numeric id with the wrong durable slot identity is retired, not adopted');
  assert.ok(!worksite.containers.some((row) => row.index === 2),
    'the saved manifest never launders a recycled slot into a new generation');
  assert.equal(worksite.retries, 0, 'stale identity cleanup is not treated as a second mission attempt');

  const tug = h.state.entities.get(worksite.tugId);
  const forged = { ...tug, occupantGeneration: tug.occupantGeneration + 1 };
  h.missions._onEntityDestroyed({ id: tug.id, entity: forged, reason: 'stale_destroy_report' });
  assert.equal(worksite.retries, 0, 'a stale destroy report cannot consume the one retry');
  h.missions._onEntityDestroyed({ id: tug.id, entity: tug, reason: 'real_tug_loss' });
  assert.equal(worksite.retries, 1, 'the first real lead loss gets exactly one complete retry');
  assert.equal(worksite.attempt, 2);
  h.missions.spawnTargetsForSector(mission.destSectorId);
  const replacementBoxes = h.state.entityList.filter((entity) => entity.alive !== false
    && entity.data?.spineBreakContainer === true
    && entity.data?.spineBreakAttempt === 2 && String(entity.data?.spineBreakMissionId) === String(mission.id));
  assert.equal(replacementBoxes.length, 6, 'the single retry receives one fresh six-box cast');
  const replacementTug = h.state.entities.get(mission._escorteeId);
  h.missions._onEntityDestroyed({ id: replacementTug.id, entity: replacementTug, reason: 'second_tug_loss' });
  assert.equal(worksite.retries, 1, 'a second real lead loss cannot grant another retry');
  assert.equal(mission.status, 'failed', 'after the one retry, losing the replacement fails the job');
});

test('a missing bound tug uses the one bounded retry instead of spawning stray leads', () => {
  const h = createMissionHarness(9314);
  const mission = acceptSpineBreak(h);
  h.state.world.currentSectorId = mission.destSectorId;
  h.missions.spawnTargetsForSector(mission.destSectorId);
  const firstId = mission._escorteeId;
  h.helpers.removeEntity(firstId);
  h.missions._ensureMissionTargets(mission);
  assert.equal(mission.params.spineBreakWorksite.retries, 1);
  h.missions._ensureMissionTargets(mission);
  const replacement = h.state.entities.get(mission._escorteeId);
  assert.ok(replacement?.data?.spineBreakTug);
  for (let n = 0; n < 3; n++) h.missions._ensureMissionTargets(mission);
  assert.equal(h.state.entityList.filter(e => e.alive !== false && e.data?.escortee === 'lead').length, 1);
  h.helpers.removeEntity(replacement.id);
  h.missions._ensureMissionTargets(mission);
  assert.equal(mission.status, 'failed', 'a second missing lead cannot create a second retry');
});

test('a recycled tug identity takes the bounded loss path and cannot mint unbound leads', () => {
  const h = createMissionHarness(9315);
  const mission = acceptSpineBreak(h);
  h.state.world.currentSectorId = mission.destSectorId;
  h.missions.spawnTargetsForSector(mission.destSectorId);
  const old = h.state.entities.get(mission._escorteeId);
  const recycled = { ...old, data: { ...old.data, spineBreakTugIdentity: 'wrong-tug' } };
  h.helpers.removeEntity(old.id);
  h.helpers.spawnEntity({ ...recycled, id: old.id });
  h.missions._ensureMissionTargets(mission);
  assert.equal(mission.params.spineBreakWorksite.retries, 1);
  h.missions._ensureMissionTargets(mission);
  for (let n = 0; n < 3; n++) h.missions._ensureMissionTargets(mission);
  const leads = h.state.entityList.filter(e => e.alive !== false && e.data?.spineBreakTug === true
    && e.data?.spineBreakTugIdentity === mission.params.spineBreakWorksite.tugIdentity);
  assert.equal(leads.length, 1);
  assert.equal(leads[0].data.spineBreakTugIdentity, mission.params.spineBreakWorksite.tugIdentity);
  assert.equal(h.state.entities.get(old.id)?.data.spineBreakTugIdentity, 'wrong-tug',
    'the untrusted recycled occupant is not removed as if it were the saved tug');
});
