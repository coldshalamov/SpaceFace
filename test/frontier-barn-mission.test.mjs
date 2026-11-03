import test from 'node:test';
import assert from 'node:assert/strict';
import { frontierHomesteads } from '../src/systems/faction_frontier.js';
import { FRONTIER_MODULES, FRONTIER_FRAME } from '../src/data/factions/free.js';

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
