import test from 'node:test';
import assert from 'node:assert/strict';
import { frontierHomesteads } from '../src/systems/faction_frontier.js';
import { FRONTIER_MODULES, FRONTIER_FRAME } from '../src/data/factions/free.js';
import { createSimulation } from '../src/core/sim.js';
import { world } from '../src/systems/world.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { economy as economyProto } from '../src/systems/economy.js';
import { save as saveProto } from '../src/save/saveSystem.js';
import { ensureCampaign47aState, recordBeatStep } from '../src/story/campaign47a/index.js';
import { physics } from '../src/core/physics.js';
import { writePhysicsControl } from '../src/core/physicsAuthority.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';

function makeHarness({ simTime = 0, seedOrdinary = false, terminalOrdinary = false } = {}) {
  const events = [];
  const listeners = new Map();
  let nextId = 100;
  let nextGen = 10;
  const state = {
    simTime, tick: 50,
    world: { currentSectorId: 'sector_io_reach' },
    missions: { active: [] },
    entities: new Map(), entityList: [],
    frontier: { homesteads: [], supplyRuns: [], sites: {} },
  };
  const bus = {
    on(name, fn) {
      const rows = listeners.get(name) || [];
      rows.push(fn); listeners.set(name, rows);
      return () => { const live = listeners.get(name) || []; listeners.set(name, live.filter((x) => x !== fn)); };
    },
    emit(name, payload) {
      events.push({ name, payload });
      for (const fn of listeners.get(name) || []) fn(payload);
    },
  };
  const helpers = {
    spawnEntity(spec) {
      const ent = {
        id: nextId++, alive: true, occupantGeneration: nextGen++, vel: { x: 0, z: 0 },
        ...spec, pos: { ...spec.pos }, data: structuredClone(spec.data || {}),
      };
      state.entities.set(ent.id, ent); state.entityList.push(ent); return ent;
    },
    removeEntity(id) {
      const e = state.entities.get(id);
      if (!e) return false;
      e.alive = false; state.entities.delete(id);
      state.entityList = state.entityList.filter((row) => row !== e);
      return true;
    },
    hash32: (...args) => args.join('|').length,
    mulberry32: (seed) => { let n = seed; return () => ((n = (n + 0x6D2B79F5) | 0) >>> 0) / 4294967296; },
  };
  const owner = { ...frontierHomesteads };
  owner.init({ state, bus, helpers });
  if (seedOrdinary) {
    owner._tickSiteSeeding(state);
    const ordinary = state.entityList.find((e) => e.data?.homesteadFrame === true);
    if (terminalOrdinary) {
      ordinary.data.homestead = true;
      ordinary.data.homesteadRaised = true;
      ordinary.data.barnDone = true;
    }
  }
  return { state, bus, helpers, owner, events };
}

function mission(id = 'm_barn_1') {
  return {
    id, status: 'active', type: 'tow_recovery', storyTag: 'campaign47a:b4:operation',
    params: { bookScene: 'barn_raising', frontierBarnRaisingVersion: 1 },
  };
}

function accept(h, m = mission()) {
  h.state.missions.active.push(m);
  h.bus.emit('mission:accepted', { missionId: m.id, type: m.type, storyTag: m.storyTag });
  return m;
}

function attemptFrame(h, m) {
  const attempt = h.state.frontier.barnAttempt;
  assert.equal(attempt.missionId, m.id);
  return h.state.entities.get(attempt.frameId);
}

function modulesFor(h, m) {
  return h.state.entityList.filter((e) => e.alive !== false && e.data?.frontierMissionId === m.id
    && typeof e.data?.homesteadModule === 'string');
}

test('native module movement raises the accepted Frontier job and pays through economy once', async () => {
  const flags = snapshotFeatureMaps();
  applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  const sim = createSimulation({ seed: 47, systems: [physics, frontierHomesteads, economyProto, missionsProto], updateOrder: [] });
  try {
    const { state, registry, bus } = sim;
    state.mode = 'flight';
    state.world.currentSectorId = 'sector_io_reach';
    state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    const player = sim.spawn({ type: 'ship', isPlayer: true, team: 0, pos: sectorGlobalOrigin('sector_io_reach'),
      vel: { x: 0, z: 0 }, radius: 8, mass: 100, hull: 100, hullMax: 100,
      data: { defId: 'ship_kestrel', fittings: [], weapons: [] } });
    state.playerId = player.id;
    state.story = { beatIndex: 4, branch: 'free', flags: { embodied_route: 'book', elroy_outcome: 'force' } };
    ensureCampaign47aState(state);
    assert.equal(recordBeatStep(state, 'mission:accepted', { type: 'smuggling_run',
      storyTag: 'story.branch_intro', branch: 'free', factionId: 'faction_free' }, state.simTime).ok, true);
    const owner = registry.get('missions');
    const offer = owner.ensureBoard('station_helios').slots.find(row => row?.storyTag === 'campaign47a:b4:operation');
    assert.ok(offer);
    assert.equal(owner.acceptMission(offer.id), true);
    const mission = state.missions.active.find(row => row.storyTag === 'campaign47a:b4:operation');
    const frontier = registry.get('frontierHomesteads');
    frontier.update(1 / 60, state);
    const frame = state.entities.get(state.frontier.barnAttempt.frameId);
    const modules = FRONTIER_MODULES.map(m => state.entities.get(state.frontier.barnAttempt.moduleIds[m.id]));
    const native = registry.get('physics');
    await native.prepareBackend(state);
    const creditsBefore = state.player.credits;
    const grants = [];
    bus.on('economy:grantCredits', p => grants.push(p));
    // Fixture forces enter the actual native physics membrane; no pose or success state is written.
    // They stand in for the player's tow/push, which is checked on the ordinary route separately.
    for (let tick = 0; tick < 1800 && mission.status === 'active'; tick++) {
      for (const body of modules) {
        if (body.data.snapped) continue;
        const dx = frame.pos.x - body.pos.x, dz = frame.pos.z - body.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        const speed = Math.min(45, d * 0.7);
        writePhysicsControl(body, { source: 'frontier-fixture-push',
          force: { x: (dx / d * speed - body.vel.x) * body.mass * 3, y: 0,
            z: (dz / d * speed - body.vel.z) * body.mass * 3 },
          torque: { x: 0, y: 0, z: 0 }, maxSpeed: 45 });
      }
      state.tick++;
      state.simTime += 1 / 60;
      native.update(1 / 60, state);
      frontier.update(1 / 60, state);
    }
    assert.equal(mission.status, 'completed', JSON.stringify({ progress: mission.objectiveProgress,
      frame: frame.pos, modules: modules.map(e => ({ kind: e.data.homesteadModule, pos: e.pos,
        vel: e.vel, snapped: e.data.snapped, alive: e.alive })), native: native._diag }));
    assert.equal(state.frontier.barnAttempt.status, 'completed');
    assert.equal(state.frontier.homesteads.filter(row => row.frontierMissionId === mission.id && !row.partial).length, 1);
    assert.equal(grants.filter(row => row.reason === `mission:${mission.id}`).length, 1);
    assert.ok(state.player.credits > creditsBefore);
    frontier.update(1 / 60, state);
    assert.equal(grants.filter(row => row.reason === `mission:${mission.id}`).length, 1);
  } finally {
    sim.dispose();
    restoreFeatureMaps(flags);
  }
});

test('accepted Book 4 Frontier attempt survives public Save and Continue', async () => {
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
  const sim = createSimulation({ seed: 47, systems: [world, physics, frontierHomesteads, economyProto, missionsProto, saveProto], updateOrder: [] });
  try {
    const { state, registry } = sim;
    state.mode = 'flight';
    state.world.currentSectorId = 'sector_io_reach';
    state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    const player = sim.spawn({ type: 'ship', isPlayer: true, team: 0, pos: sectorGlobalOrigin('sector_io_reach'),
      vel: { x: 0, z: 0 }, radius: 8, mass: 100, hull: 100, hullMax: 100,
      data: { defId: 'ship_kestrel', fittings: [], weapons: [] } });
    state.playerId = player.id;
    // Explicit admission: the prior branch introduction has already been accepted.
    state.story = { beatIndex: 4, branch: 'free', flags: { embodied_route: 'book', elroy_outcome: 'force' } };
    ensureCampaign47aState(state);
    assert.equal(recordBeatStep(state, 'mission:accepted', { type: 'smuggling_run',
      storyTag: 'story.branch_intro', branch: 'free', factionId: 'faction_free' }, state.simTime).ok, true);
    const missions = registry.get('missions');
    const offer = missions.ensureBoard('station_helios').slots.find(row => row?.storyTag === 'campaign47a:b4:operation');
    assert.ok(offer);
    assert.equal(missions.acceptMission(offer.id), true);
    registry.get('frontierHomesteads').update(1 / 60, state);
    const mission = state.missions.active.find(row => row.storyTag === 'campaign47a:b4:operation');
    const attempt = state.frontier.barnAttempt;
    assert.equal(attempt.status, 'active');
    assert.equal(Object.keys(attempt.moduleIds).length, 6);
    const frameBefore = state.entities.get(attempt.frameId);
    const first = state.entities.get(attempt.moduleIds.habitat);
    const native = registry.get('physics');
    await native.prepareBackend(state);
    for (let tick = 0; tick < 900 && !first.data.snapped; tick++) {
      const dx = frameBefore.pos.x - first.pos.x, dz = frameBefore.pos.z - first.pos.z;
      const d = Math.hypot(dx, dz) || 1, speed = Math.min(45, d * 0.7);
      writePhysicsControl(first, { source: 'frontier-fixture-push',
        force: { x: (dx / d * speed - first.vel.x) * first.mass * 3, y: 0,
          z: (dz / d * speed - first.vel.z) * first.mass * 3 },
        torque: { x: 0, y: 0, z: 0 }, maxSpeed: 45 });
      state.tick++;
      state.simTime += 1 / 60;
      native.update(1 / 60, state);
      registry.get('frontierHomesteads').update(1 / 60, state);
    }
    assert.equal(first.data.snapped, true, 'native force delivered a real module before Save');
    const saveOwner = registry.get('save');
    assert.equal(await Promise.resolve(saveOwner.save('quick')), true);
    assert.equal(await Promise.resolve(saveOwner.load('quick')), true);
    const restoredMission = state.missions.active.find(row => row.id === mission.id);
    const restoredAttempt = state.frontier.barnAttempt;
    assert.equal(restoredMission?.status, 'active', JSON.stringify({ restoredAttempt,
      active: state.missions.active.map(row => ({ id: row.id, status: row.status })),
      frames: state.entityList.filter(e => e.data?.frontierMissionId === mission.id)
        .map(e => ({ id: e.id, kind: e.data.homesteadModule || 'frame', site: e.data.frontierSite })) }));
    assert.equal(restoredAttempt.status, 'active');
    const frame = state.entities.get(restoredAttempt.frameId);
    assert.equal(frame?.data.frontierMissionId, mission.id);
    assert.equal(frame?.occupantGeneration, restoredAttempt.frameGen);
    for (const module of FRONTIER_MODULES) {
      const body = state.entities.get(restoredAttempt.moduleIds[module.id]);
      assert.equal(body?.data.homesteadModule, module.id);
      assert.equal(body?.occupantGeneration, restoredAttempt.moduleGens[module.id]);
    }
    const restoredFirst = state.entities.get(restoredAttempt.moduleIds.habitat);
    assert.equal(restoredFirst.data.snapped, true);
    assert.equal(restoredFirst.data.snappedFrameId, frame.id);
    assert.equal(frame.data.slots.habitat, restoredFirst.id);
    registry.get('frontierHomesteads').update(1 / 60, state);
    assert.equal(frame.data.slots.habitat, restoredFirst.id, 'the restored slot remains bound on the next owner tick');
  } finally {
    sim.dispose();
    restoreFeatureMaps(flags);
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});

test('public Continue preserves completed independent and mission steads and their ownership', async () => {
  const previousStorage = globalThis.localStorage, flags = snapshotFeatureMaps();
  applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(String(key)) ?? null,
    setItem: (key, value) => values.set(String(key), String(value)),
    removeItem: key => values.delete(String(key)),
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
  const sim = createSimulation({ seed: 47, systems: [world, physics, frontierHomesteads, economyProto, missionsProto, saveProto], updateOrder: [] });
  try {
    const { state, registry } = sim;
    state.mode = 'flight';
    state.world.currentSectorId = 'sector_io_reach';
    state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    const frontier = registry.get('frontierHomesteads'), native = registry.get('physics');
    frontier._tickSiteSeeding(state);
    const independent = state.entityList.find(e => e.data?.homesteadFrame && !e.data.frontierMissionId);
    assert.ok(independent);
    // Fixture admission at the existing worksite makes its physics bodies active.
    const player = sim.spawn({ type: 'ship', isPlayer: true, team: 0, pos: { ...independent.pos },
      vel: { x: 0, z: 0 }, radius: 8, mass: 100, hull: 100, hullMax: 100,
      data: { defId: 'ship_kestrel', fittings: [], weapons: [] } });
    state.playerId = player.id;
    await native.prepareBackend(state);
    // Explicit native-force fixture. The real Frontier owner snaps and welds both kits.
    const raise = frame => {
      const modules = state.entityList.filter(e => e.alive !== false && e.data?.frontierSite === frame.data.frontierSite
        && typeof e.data?.homesteadModule === 'string');
      assert.equal(modules.length, 6);
      for (let tick = 0; tick < 2400 && !frame.data.homestead; tick++) {
        for (const body of modules) {
          if (body.data.snapped) continue;
          const dx = frame.pos.x - body.pos.x, dz = frame.pos.z - body.pos.z;
          const d = Math.hypot(dx, dz) || 1, speed = Math.min(45, d * 0.7);
          writePhysicsControl(body, { source: 'frontier-fixture-push',
            force: { x: (dx / d * speed - body.vel.x) * body.mass * 3, y: 0,
              z: (dz / d * speed - body.vel.z) * body.mass * 3 },
            torque: { x: 0, y: 0, z: 0 }, maxSpeed: 45 });
        }
        state.tick++; state.simTime += 1 / 60;
        native.update(1 / 60, state);
        frontier.update(1 / 60, state);
      }
      assert.equal(frame.data.homestead, true, JSON.stringify({ frame: frame.pos,
        slots: frame.data.slots, modules: modules.map(e => ({ pos: e.pos, vel: e.vel, snapped: e.data.snapped })),
        native: native._diag }));
    };
    raise(independent);
    const independentSite = independent.data.frontierSite;
    const independentRec = state.frontier.homesteads.find(r => r.entityId === independent.id);
    state.story = { beatIndex: 4, branch: 'free', flags: { embodied_route: 'book', elroy_outcome: 'force' } };
    ensureCampaign47aState(state);
    assert.equal(recordBeatStep(state, 'mission:accepted', { type: 'smuggling_run',
      storyTag: 'story.branch_intro', branch: 'free', factionId: 'faction_free' }, state.simTime).ok, true);
    const missions = registry.get('missions');
    const offer = missions.ensureBoard('station_helios').slots.find(row => row?.storyTag === 'campaign47a:b4:operation');
    assert.ok(offer);
    assert.equal(missions.acceptMission(offer.id), true);
    frontier.update(1 / 60, state);
    const attempt = state.frontier.barnAttempt, frame = state.entities.get(attempt.frameId);
    raise(frame);
    assert.equal(attempt.status, 'completed');
    const missionId = attempt.missionId;
    const oldIndependentId = independent.id, oldMissionId = frame.id;
    // Explicit saved ledger fixture: verify dependent ownership remaps, not just the frame.
    state.frontier.supplyRuns.push({ homesteadId: oldIndependentId, askedAt: state.simTime });
    state.frontier.leads.push({ id: 'fixture-lead', kind: 'hungry', state: 'open', steadId: oldIndependentId,
      expiresAt: state.simTime + 200 });
    state.frontier.calls.push({ id: 'fixture-call', state: 'open', steadId: oldMissionId, expiresAt: state.simTime + 200 });
    state.frontier.debts.push({ id: 'fixture-debt', state: 'open', debtorId: oldIndependentId,
      creditorId: oldMissionId, expiresAt: state.simTime + 200 });
    const raider = sim.spawn({ type: 'ship', pos: { x: independent.pos.x + 200, z: independent.pos.z },
      vel: { x: 0, z: 0 }, hull: 10, flags: { persistent: true },
      data: { frontierRaider: true, raidSteadId: oldIndependentId } });
    const saver = registry.get('save');
    assert.equal(await Promise.resolve(saver.save('quick')), true);
    assert.equal(await Promise.resolve(saver.load('quick')), true);
    const liveIndependent = state.entityList.find(e => e.alive !== false && e.data?.homestead === true
      && e.data?.frontierSite === independentSite);
    const liveMission = state.entityList.find(e => e.alive !== false && e.data?.homestead === true
      && e.data?.frontierMissionId === missionId);
    const independentAfter = state.frontier.homesteads.find(r => r.name === independentRec.name);
    const missionAfter = state.frontier.homesteads.find(r => r.frontierMissionId === missionId);
    assert.ok(liveIndependent && liveMission && independentAfter && missionAfter);
    assert.notEqual(liveIndependent.id, oldIndependentId, 'sector regeneration forced a real ID remap');
    assert.equal(frontier._steadEnt(state, independentAfter), liveIndependent);
    assert.equal(frontier._steadEnt(state, missionAfter), liveMission);
    assert.equal(state.frontier.barnAttempt.frameId, liveMission.id);
    for (const currentFrame of [liveIndependent, liveMission]) {
      for (const [kind, id] of Object.entries(currentFrame.data.slots)) {
        const body = state.entities.get(id);
        assert.equal(body?.data.homesteadModule, kind);
        assert.equal(body?.data.snappedFrameId, currentFrame.id);
        assert.equal(body?.data.snappedFrameGen, currentFrame.occupantGeneration);
      }
      assert.equal(Object.keys(currentFrame.data.slots).length, 6);
    }
    assert.equal(state.frontier.supplyRuns.find(r => r.homesteadId === liveIndependent.id)?.homesteadId, liveIndependent.id);
    assert.equal(state.frontier.leads.find(r => r.id === 'fixture-lead')?.steadId, liveIndependent.id);
    assert.equal(state.frontier.calls.find(r => r.id === 'fixture-call')?.steadId, liveMission.id);
    assert.equal(state.frontier.debts.find(r => r.id === 'fixture-debt')?.debtorId, liveIndependent.id);
    assert.equal(state.frontier.debts.find(r => r.id === 'fixture-debt')?.creditorId, liveMission.id);
    const restoredRaider = state.entities.get(state.sessionEntityIdRemap.get(String(raider.id)));
    assert.equal(restoredRaider?.data.raidSteadId, liveIndependent.id);
    frontier.update(1 / 60, state);
    assert.equal(independentAfter.gone, false);
    assert.equal(missionAfter.gone, false);
  } finally {
    sim.dispose(); restoreFeatureMaps(flags);
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});

test('first Io visit reuses the one live Frontier frame and six module pods', () => {
  const h = makeHarness();
  const m = accept(h);
  h.owner.update(0.016, h.state);

  const attempt = h.state.frontier.barnAttempt;
  const frame = attemptFrame(h, m);
  assert.equal(attempt.status, 'active');
  assert.equal(h.state.entityList.filter((e) => e.alive !== false && e.data?.homesteadFrame === true).length, 1);
  assert.equal(modulesFor(h, m).length, FRONTIER_MODULES.length);
  assert.equal(h.state.entityList.filter((e) => e.alive !== false && typeof e.data?.homesteadModule === 'string').length,
    FRONTIER_MODULES.length);
  assert.equal(frame.data.frontierSite, h.state.frontier.sites.sector_io_reach && frame.data.frontierSite);
});

test('an existing unfinished Frontier site is adopted without duplicating its frame or pods', () => {
  const h = makeHarness({ seedOrdinary: true });
  const beforeFrame = h.state.entityList.find((e) => e.data?.homesteadFrame === true);
  const beforeIds = h.state.entityList.filter((e) => e.data?.homesteadModule).map((e) => e.id);
  const m = accept(h);
  h.owner.update(0.016, h.state);
  assert.equal(attemptFrame(h, m).id, beforeFrame.id);
  assert.equal(h.state.entityList.filter((e) => e.alive !== false && e.data?.homesteadFrame === true).length, 1);
  assert.deepEqual(modulesFor(h, m).map((e) => e.id).sort(), beforeIds.sort());
});

test('a completed homestead is preserved and a fresh bounded owner attempt is planted beside it', () => {
  const h = makeHarness({ seedOrdinary: true, terminalOrdinary: true });
  const old = h.state.entityList.find((e) => e.data?.homesteadFrame === true);
  const oldFrameData = structuredClone(old.data);
  const oldCount = h.state.entityList.filter((e) => e.data?.homesteadModule).length;
  const m = accept(h);
  h.owner.update(0.016, h.state);
  const fresh = attemptFrame(h, m);
  assert.notEqual(fresh.id, old.id);
  assert.equal(old.alive, true);
  for (const [key, value] of Object.entries(oldFrameData)) assert.deepEqual(old.data[key], value,
    `the existing raised site's ${key} stays untouched`);
  assert.equal(old.data.frontierMissionId, undefined);
  assert.equal(h.state.entityList.filter((e) => e.alive !== false && e.data?.homesteadFrame === true).length, 2);
  assert.equal(modulesFor(h, m).length, FRONTIER_MODULES.length);
  assert.equal(h.state.entityList.filter((e) => e.alive !== false && e.data?.homesteadModule).length,
    oldCount + FRONTIER_MODULES.length);
});

test('tagged frames reject wrong kinds and cross-site modules but keep the six canonical pods', () => {
  const h = makeHarness(); const m = accept(h); h.owner.update(0.016, h.state);
  const frame = attemptFrame(h, m);
  const impostor = h.helpers.spawnEntity({ type: 'payload', pos: { x: frame.pos.x, z: frame.pos.z },
    radius: 10, mass: 20, data: { homesteadModule: 'old-habitat', frontierSite: 'site:another:5' } });
  h.owner._tickRaising(h.state, 0);
  assert.deepEqual(Object.keys(frame.data.slots || {}), []);
  assert.equal(impostor.data.snapped, undefined);

  const actualHabitat = modulesFor(h, m).find((e) => e.data.homesteadModule === 'habitat');
  actualHabitat.pos = { x: frame.pos.x + FRONTIER_FRAME.snapRange + 50, z: frame.pos.z };
  const duplicate = h.helpers.spawnEntity({ type: 'payload', pos: { x: frame.pos.x + 10, z: frame.pos.z },
    radius: 10, mass: 20, data: { homesteadModule: 'habitat', frontierSite: frame.data.frontierSite,
      frontierMissionId: m.id } });
  h.owner._tickRaising(h.state, 0);
  assert.equal(frame.data.slots.habitat, undefined, 'same-tag duplicate cannot replace the expected module ID');
  assert.equal(duplicate.data.snapped, undefined);

  for (const body of modulesFor(h, m)) body.pos = { x: frame.pos.x + 10, z: frame.pos.z };
  h.owner._tickRaising(h.state, 0);
  assert.equal(Object.keys(frame.data.slots).length, FRONTIER_MODULES.length);
  assert.equal(new Set(Object.keys(frame.data.slots)).size, FRONTIER_MODULES.length);
});

test('partial E-21 timeout damages but retries; missing module restocks only once per 90 seconds', () => {
  const h = makeHarness(); const m = accept(h); h.owner.update(0.016, h.state);
  const frame = attemptFrame(h, m);
  const bodies = modulesFor(h, m);
  for (const body of bodies.slice(0, 5)) body.pos = { x: frame.pos.x + 10, z: frame.pos.z };
  h.owner._tickRaising(h.state, 0);
  const initialDeadline = frame.data.raiseDeadline;
  h.state.simTime = initialDeadline;
  h.owner._tickRaising(h.state, 0);
  assert.equal(frame.data.barnDone, undefined);
  assert.equal(h.state.frontier.homesteads.length, 0);
  assert.equal(h.events.filter((e) => e.name === 'frontier:barnPartial').length, 0);
  assert.equal(h.events.filter((e) => e.name === 'frontier:barnRetry').length, 1);
  assert.equal(frame.data.raiseDeadline, initialDeadline + 240);

  bodies[5].alive = false; h.state.entities.delete(bodies[5].id);
  h.state.simTime = initialDeadline + 1;
  h.owner.update(0, h.state);
  const afterFirstRestock = modulesFor(h, m).length;
  assert.equal(afterFirstRestock, FRONTIER_MODULES.length - 1, 'lost module observes the 90 second delay');
  h.state.simTime += 89;
  h.owner.update(0, h.state);
  assert.equal(modulesFor(h, m).length, FRONTIER_MODULES.length - 1);
  h.state.simTime += 1;
  h.owner.update(0, h.state);
  assert.equal(modulesFor(h, m).length, FRONTIER_MODULES.length);
  const afterDueRestock = modulesFor(h, m).length;
  h.owner.update(0, h.state);
  assert.equal(modulesFor(h, m).length, afterDueRestock, 'the deadline latch prevents per-tick refill');
  assert.equal(h.state.frontier.barnAttempt.nextRestockAt, h.state.simTime + 90);
});

test('six-slot timeout resets the owner weld pass without minting another kit', () => {
  const h = makeHarness(); const m = accept(h); h.owner.update(0.016, h.state);
  const frame = attemptFrame(h, m); const bodies = modulesFor(h, m);
  for (const body of bodies) body.pos = { x: frame.pos.x + 10, z: frame.pos.z };
  h.owner._tickRaising(h.state, 0);
  const deadline = frame.data.raiseDeadline;
  const entityCount = h.state.entityList.length;
  h.state.simTime = deadline;
  h.owner._tickRaising(h.state, 0);
  assert.equal(frame.data.barnDone, undefined);
  assert.equal(frame.data.weldT, 0);
  assert.equal(frame.data.raiseDeadline, deadline + 240);
  assert.equal(h.state.entityList.length, entityCount, 'no duplicate modules or imaginary welder bodies');
  assert.equal(h.events.filter((e) => e.name === 'frontier:homesteadRaised').length, 0);
  h.owner._tickRaising(h.state, 12);
  assert.equal(h.events.filter((e) => e.name === 'frontier:homesteadRaised').length, 1);
  const attempt = h.state.frontier.barnAttempt;
  const rec = h.state.frontier.homesteads[0];
  const receipt = {
    version: 1, missionId: m.id, siteId: attempt.siteId, frameId: frame.id,
    frameGen: frame.occupantGeneration, moduleIds: { ...attempt.moduleIds },
  };
  h.bus.emit('mission:completed', { missionId: m.id, frontierReceipt: receipt });
  assert.equal(attempt.status, 'completed', 'the actual raised receipt closes the owner attempt');
  h.owner.update(0, h.state);
  assert.equal(attempt.status, 'completed', 'the next Frontier tick cannot retire the completed site');
  assert.equal(rec.partial, false);
});

test('a missing pod on first spawn waits 90 seconds and the exact restocked ID owns the slot', () => {
  const h = makeHarness();
  const originalSpawn = h.helpers.spawnEntity;
  let failOnce = true;
  h.helpers.spawnEntity = (spec) => {
    if (failOnce && spec.data?.homesteadModule === 'solar') { failOnce = false; return null; }
    return originalSpawn(spec);
  };
  const m = accept(h);
  h.owner.update(0, h.state);
  const attempt = h.state.frontier.barnAttempt;
  const frame = attemptFrame(h, m);
  assert.equal(modulesFor(h, m).length, FRONTIER_MODULES.length - 1);
  assert.equal(attempt.nextRestockAt, 90);
  h.state.simTime = 89; h.owner.update(0, h.state);
  assert.equal(modulesFor(h, m).length, FRONTIER_MODULES.length - 1);
  h.state.simTime = 90; h.owner.update(0, h.state);
  assert.equal(modulesFor(h, m).length, FRONTIER_MODULES.length);
  const expected = h.state.entities.get(attempt.moduleIds.solar);
  assert.ok(expected && expected.data.frontierMissionId === m.id);
  const reusedId = expected.id;
  const imposter = { ...expected, id: reusedId, occupantGeneration: expected.occupantGeneration + 999,
    alive: true, pos: { x: frame.pos.x + 10, z: frame.pos.z }, data: { ...expected.data } };
  h.state.entities.set(reusedId, imposter);
  h.state.entityList = h.state.entityList.map((e) => e === expected ? imposter : e);
  h.owner.update(0, h.state);
  assert.notEqual(attempt.moduleIds.solar, reusedId, 'same ID with a new generation cannot retain the receipt bond');
  assert.equal(frame.data.slots.solar, undefined);
});

test('abort/reaccept retires the incomplete tagged attempt before planting one replacement', () => {
  const h = makeHarness(); const first = accept(h); h.owner.update(0.016, h.state);
  const oldIds = h.state.entityList.filter((e) => e.data?.frontierMissionId === first.id).map((e) => e.id);
  first.status = 'failed'; h.bus.emit('mission:failed', { missionId: first.id, reason: 'abandoned' });
  assert.equal(h.state.frontier.barnAttempt.status, 'retired');
  assert.equal(h.state.entityList.some((e) => oldIds.includes(e.id) && e.alive !== false), false);
  h.state.missions.active = [];
  const second = accept(h, mission('m_barn_2'));
  h.owner.update(0.016, h.state);
  assert.equal(h.state.frontier.barnAttempt.missionId, second.id);
  assert.equal(h.state.entityList.filter((e) => e.alive !== false && e.data?.frontierMissionId === second.id
    && e.data?.homesteadFrame === true).length, 1);
  assert.equal(modulesFor(h, second).length, FRONTIER_MODULES.length);
});

test('aborting an adopted unfinished site releases its mission tag but keeps the same open-world work', () => {
  const h = makeHarness({ seedOrdinary: true });
  const frame = h.state.entityList.find((e) => e.data?.homesteadFrame === true);
  const bodies = h.state.entityList.filter((e) => e.data?.homesteadModule);
  for (const body of bodies.slice(0, 2)) body.pos = { x: frame.pos.x + 10, z: frame.pos.z };
  h.owner._tickRaising(h.state, 0);
  const originalSlots = structuredClone(frame.data.slots);
  const originalModuleIds = bodies.map((body) => body.id).sort();
  assert.equal(Object.keys(originalSlots).length, 2);

  const first = accept(h);
  h.owner.update(0, h.state);
  assert.equal(h.state.frontier.barnAttempt.adoptedSite, true);
  assert.equal(h.state.frontier.barnAttempt.frameId, frame.id);
  first.status = 'failed';
  h.bus.emit('mission:failed', { missionId: first.id, reason: 'abandoned' });

  assert.equal(h.state.frontier.barnAttempt.status, 'retired');
  assert.equal(frame.alive, true);
  assert.equal(frame.data.frontierMissionId, undefined, 'the frame returns to ordinary Frontier ownership');
  assert.deepEqual(frame.data.slots, originalSlots, 'snapped progress is retained');
  assert.deepEqual(h.state.entityList.filter((e) => e.alive !== false && e.data?.homesteadModule)
    .map((e) => e.id).sort(), originalModuleIds, 'the original six pods remain without duplication');
  assert.ok(bodies.slice(0, 2).every((body) => body.data.snapped === true));
  assert.ok(bodies.every((body) => body.data.frontierMissionId === undefined));

  h.state.missions.active = [];
  const second = accept(h, mission('m_barn_adopted_retry'));
  h.owner.update(0, h.state);
  assert.equal(h.state.frontier.barnAttempt.frameId, frame.id, 'reaccept can bind the same unfinished site');
  assert.equal(Object.keys(frame.data.slots).length, 2);
  assert.equal(h.state.entityList.filter((e) => e.alive !== false && e.data?.homesteadFrame === true).length, 1);
  assert.equal(modulesFor(h, second).length, FRONTIER_MODULES.length);
});

test('Continue rebinds the saved frame generation; same-id replacement outside restore is rejected', () => {
  const h = makeHarness(); const m = accept(h); h.owner.update(0.016, h.state);
  const attempt = h.state.frontier.barnAttempt; const frame = attemptFrame(h, m);
  const oldGen = frame.occupantGeneration;
  attempt.frameGen = oldGen - 1;
  h.owner._restoredFromSave = true; h.owner._afterRestore();
  assert.equal(attempt.frameGen, oldGen, 'tag-matched Continue rebinds the new live generation');
  frame.occupantGeneration = oldGen + 1;
  h.owner.update(0.016, h.state);
  assert.equal(attempt.status, 'lost', 'a recycled same-ID occupant cannot be adopted on an ordinary tick');
  assert.equal(h.events.filter((e) => e.name === 'frontier:missionAttemptLost').length, 1);
});
