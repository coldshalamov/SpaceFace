import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { shouldAutoTriggerAuthoredUpgrade } from '../src/render/partsLibrary.js';
import {
  holdFirstFlightStreaming,
  isEntityAuthoredUpgradeRelevant,
  isEntityMeshExpected,
  isEntityRenderRelevant,
} from '../src/render/renderer.js';
import {
  admissionAnchorPos,
  authoredPrefetchRadius,
  glassCornerWu,
  residencyEvictRadius,
  residencyPrefetchRadius,
  timeToEnterRadiusSeconds,
  TABLE_AUTHORED_DECODE_SECONDS,
  TABLE_PROMOTE_HORIZON_SECONDS,
  TABLE_REFERENCE_SPEED_WU,
  TABLE_RESIDENCY_EVICT_SECONDS,
  TABLE_RESIDENCY_PREFETCH_SECONDS,
} from '../src/render/tabletopPolicy.js';
import { insertAsteroidFieldRock } from '../src/world/asteroidField.js';
import { insertFarActor, farActorTableRadius, tickFarActors } from '../src/world/farActorTable.js';
import {
  collectMeshPresentationEntities,
  requestDecodeRunwayPromote,
  resolveWorldPresentationEntity,
} from '../src/world/presentationSources.js';

function boot(seed = 77) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.meta.seed = seed;
  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: null };
  core.init(ctx);
  const player = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 0, z: 0 },
    radius: 8,
    mass: 12,
    hull: 100,
    hullMax: 100,
    collides: true,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  player.vel = { x: 0, z: 0 };
  player.maxSpeed = TABLE_REFERENCE_SPEED_WU;
  return { state, helpers, player };
}

test('evict stays farther than admit so a lip oscillation does not thrash', () => {
  assert.ok(TABLE_RESIDENCY_EVICT_SECONDS > TABLE_RESIDENCY_PREFETCH_SECONDS);
  assert.ok(residencyEvictRadius() > residencyPrefetchRadius());
  assert.equal(authoredPrefetchRadius(), TABLE_AUTHORED_DECODE_SECONDS * TABLE_REFERENCE_SPEED_WU);
});

test('decode runway sees an inbound far hull and can request promote', () => {
  const { state, helpers, player } = boot();
  const decodeR = authoredPrefetchRadius(TABLE_REFERENCE_SPEED_WU);
  const rec = insertFarActor(state, {
    id: 501,
    type: 'ship',
    pos: { x: decodeR * 0.7, z: 0 },
    vel: { x: -160, z: 0 },
    rot: 0,
    radius: 8,
    mass: 20,
    hull: 40,
    hullMax: 40,
    team: 1,
    data: { trafficRole: 'hauler', homeSectorId: 'sector_ceres_belt' },
    flags: {},
  });
  insertAsteroidFieldRock(state, {
    id: 777,
    pos: { x: 80, z: 0 },
    radius: 10,
    mass: 400,
    data: { typeId: 'ast_common_rock', oreHP: 40, oreHPMax: 40 },
  });

  assert.equal(resolveWorldPresentationEntity(state, rec.id), rec);
  assert.ok(collectMeshPresentationEntities(state).some((row) => row.id === rec.id));

  const inbound = {
    id: rec.id,
    type: 'ship',
    alive: true,
    farResident: true,
    pos: rec.pos,
    vel: rec.vel,
    radius: rec.radius,
  };
  const authoredState = {
    playerId: player.id,
    player: { targetId: null },
    entities: state.entities,
    camera: { zoom: 144, tilt: 60, fov: 50, aspect: 16 / 9 },
  };
  assert.equal(isEntityAuthoredUpgradeRelevant(inbound, authoredState), true,
    'an inbound hull inside the 4s decode runway must start authored work before glass');

  const missing = requestDecodeRunwayPromote(state, null);
  assert.equal(missing.helpersMissing, true);
  assert.ok(missing.farSeen >= 1);
  assert.equal(missing.farPromoted, 0);
  assert.ok(missing.rocksSeen >= 1);
  assert.equal(missing.rocksPromoted, 0, 'field rocks stay on the ledger; do not refill the combat list');

  const promoted = requestDecodeRunwayPromote(state, helpers);
  assert.equal(promoted.helpersMissing, false);
  assert.ok(promoted.farPromoted >= 1);
  assert.equal(promoted.rocksPromoted, 0);
  const live = state.entities.get(rec.id);
  assert.ok(live && live.alive !== false);
  assert.equal(resolveWorldPresentationEntity(state, rec.id), live);
});

test('a mesh already on the lip is kept when the live body is shelved', () => {
  const prefetch = residencyPrefetchRadius();
  const evict = residencyEvictRadius();
  const player = {
    id: 1, type: 'ship', alive: true, isPlayer: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    maxSpeed: 160, radius: 8, data: {},
  };
  const entities = new Map([[1, player]]);
  const state = {
    mode: 'flight',
    playerId: 1,
    player: { targetId: null },
    entities,
    entityList: [player],
    world: {},
    camera: { zoom: 144, tilt: 60, fov: 50, aspect: 16 / 9 },
    settings: { video: { fov: 50 } },
  };
  const rec = insertFarActor(state, {
    id: 44,
    type: 'ship',
    pos: { x: (prefetch + evict) * 0.5, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    mass: 20,
    hull: 40,
    hullMax: 40,
    team: 1,
    data: {},
    flags: {},
  });
  assert.equal(isEntityRenderRelevant(rec, state, evict), true,
    'existing lip resident stays until the evict radius, not the admit radius');
  assert.equal(isEntityRenderRelevant(rec, state, prefetch), false,
    'a new create does not start in the hysteresis band');
});

test('a promoted inbound hull stays render-relevant when the last activity frame omitted it', () => {
  const player = {
    id: 1, type: 'ship', alive: true, isPlayer: true,
    pos: { x: -13945, z: 9019 }, vel: { x: 0, z: 0 },
    maxSpeed: 160, radius: 8, data: {},
  };
  const inbound = {
    id: 313, type: 'ship', alive: true,
    pos: { x: -13525, z: 9019 }, vel: { x: 0, z: 0 },
    radius: 8, data: {},
  };
  const state = {
    mode: 'flight',
    playerId: 1,
    player: { targetId: null },
    entities: new Map([[1, player], [313, inbound]]),
    entityList: [player, inbound],
    world: { frameOrigin: { x: 0, z: 0 } },
    camera: {
      zoom: 144, tilt: 60, fov: 50, aspect: 16 / 9,
      // Leftover chase look-at after a relocate. Decode must not wait for it.
      focus: { x: 80, z: 40 },
    },
    settings: { video: { fov: 50 } },
    render: {
      activityFrame: {
        complete: true,
        renderGlassIds: new Set([1]),
        renderRunwayIds: new Set(),
      },
    },
  };
  assert.equal(isEntityRenderRelevant(inbound, state), true,
    'promote must still queue a mesh on the 420 WU decode runway');
  assert.equal(isEntityAuthoredUpgradeRelevant(inbound, state), true,
    'a parked inbound hull still starts authored work on the decode circle');
  const beyond = {
    id: 314, type: 'ship', alive: true, pos: { x: 4000, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, data: {},
    activity: { presentationTier: 'R2_METADATA' },
  };
  state.entities.set(314, beyond);
  state.entityList.push(beyond);
  assert.equal(isEntityRenderRelevant(beyond, state), false,
    'a far omitted hull stays out of the mesh queue');
});

test('flight first-render does not compose an ordinary on-glass hull', () => {
  const scene = { name: 'main' };
  const npc = { id: 9, type: 'ship', alive: true, mesh: { visible: true } };
  const liveState = {
    mode: 'flight',
    render: { scene, camera: null },
    player: { targetId: null },
  };
  assert.equal(shouldAutoTriggerAuthoredUpgrade(npc, scene, liveState), false);
  liveState.player.targetId = 9;
  assert.equal(shouldAutoTriggerAuthoredUpgrade(npc, scene, liveState), true);
});

test('time-to-glass solves entry for movers and rejects non-approachers', () => {
  assert.equal(timeToEnterRadiusSeconds(10, 0, 0, 0, 100, 5), 0, 'already inside enters now');
  assert.ok(
    Math.abs(timeToEnterRadiusSeconds(600, 0, -100, 0, 100, 10) - 5) < 1e-6,
    'a 100 WU/s approach onto a 100 WU radius from 600 away enters at t=5',
  );
  assert.equal(
    timeToEnterRadiusSeconds(600, 0, 100, 0, 100, 10), Infinity,
    'a receding contact never enters',
  );
  assert.equal(
    timeToEnterRadiusSeconds(600, 0, 0, 0, 100, 10), Infinity,
    'no relative motion never enters',
  );
  assert.equal(
    timeToEnterRadiusSeconds(600, 600, -100, 0, 100, 10), Infinity,
    'a crossing track that misses the disc never enters',
  );
  assert.equal(
    timeToEnterRadiusSeconds(600, 0, -50, 0, 100, 5), Infinity,
    'the horizon cuts off an arrival that lands too late',
  );
  assert.ok(
    Math.abs(timeToEnterRadiusSeconds(600, 0, -50, 0, 100, 11) - 10) < 1e-6,
    'the same arrival inside a wider horizon returns its entry time',
  );
  assert.equal(
    timeToEnterRadiusSeconds(600, 0, -100, 0, 100, 0), Infinity,
    'a zero horizon admits only what is already inside',
  );
});

test('admission anchor follows the near focus and falls back after a relocate', () => {
  const out = {};
  const flying = {
    camera: { focus: { x: 40, z: 0 } },
    world: { frameOrigin: { x: 0, z: 0 } },
  };
  admissionAnchorPos(flying, { x: 0, z: 0 }, 160, out);
  assert.deepEqual(out, { x: 40, z: 0 }, 'under velocity lead the glass sits at the focus');
  const relocated = {
    camera: { focus: { x: 8000, z: 0 } },
    world: { frameOrigin: { x: 0, z: 0 } },
  };
  admissionAnchorPos(relocated, { x: 0, z: 0 }, 160, out);
  assert.deepEqual(out, { x: 0, z: 0 }, 'a focus trailing a relocate must not admit 8k away');
});

function makeFlightState(playerVel = { x: 0, z: 0 }) {
  const player = {
    id: 1, type: 'ship', alive: true, isPlayer: true,
    pos: { x: 0, z: 0 }, vel: playerVel, maxSpeed: 160, radius: 8, data: {},
  };
  return {
    mode: 'flight',
    playerId: 1,
    player: { targetId: null },
    entities: new Map([[1, player]]),
    entityList: [player],
    world: { frameOrigin: { x: 0, z: 0 } },
    camera: { zoom: 144, tilt: 60, fov: 50, aspect: 16 / 9 },
    settings: { video: { fov: 50 } },
  };
}

test('a fast inbound hull beyond the decode disc is render-relevant on approach time', () => {
  const state = makeFlightState();
  const inbound = {
    id: 700, type: 'ship', alive: true,
    pos: { x: 2200, z: 0 }, vel: { x: -400, z: 0 }, radius: 8, data: {},
  };
  const receding = {
    id: 701, type: 'ship', alive: true,
    pos: { x: 2200, z: 0 }, vel: { x: 400, z: 0 }, radius: 8, data: {},
  };
  const parked = {
    id: 702, type: 'ship', alive: true,
    pos: { x: 2200, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, data: {},
  };
  assert.equal(isEntityRenderRelevant(inbound, state), true,
    'a hull reaching the glass inside the promote horizon queues its build now');
  assert.equal(isEntityRenderRelevant(receding, state), false,
    'a hull leaving the table earns no runway');
  assert.equal(isEntityRenderRelevant(parked, state), false,
    'a stationary hull outside every radius stays asleep');
  assert.equal(isEntityAuthoredUpgradeRelevant(inbound, state), true,
    'the authored decode starts on closing speed, not on the static circle');
  assert.equal(isEntityAuthoredUpgradeRelevant(receding, state), false);
  assert.equal(isEntityAuthoredUpgradeRelevant(parked, state), false);
});

test('player motion leans the residency oval forward and lets the trailing edge sleep', () => {
  const state = makeFlightState({ x: 300, z: 0 });
  const rockAhead = {
    id: 710, type: 'asteroid', alive: true, fieldResident: true,
    pos: { x: 900, z: 0 }, vel: { x: 0, z: 0 }, radius: 10, data: {},
  };
  const rockBehind = {
    id: 711, type: 'asteroid', alive: true, fieldResident: true,
    pos: { x: -900, z: 0 }, vel: { x: 0, z: 0 }, radius: 10, data: {},
  };
  assert.equal(isEntityRenderRelevant(rockAhead, state), true,
    'a rock the player is flying into is collected before the static disc admits it');
  assert.equal(isEntityRenderRelevant(rockBehind, state), false,
    'a rock the player is leaving behind never gets built');
});

test('a fast inbound row gets its mesh from the ledger; it does not thrash the live set', () => {
  const { state, helpers } = boot();
  const enter = farActorTableRadius(state).enter;
  const inboundRow = insertFarActor(state, {
    id: 601,
    type: 'ship',
    pos: { x: enter + 900, z: 0 },
    vel: { x: -500, z: 0 },
    rot: 0,
    radius: 8,
    mass: 20,
    hull: 40,
    hullMax: 40,
    team: 1,
    data: { trafficRole: 'raider', homeSectorId: 'sector_ceres_belt' },
    flags: {},
  }, 0);

  // Presentation admits the row on closing speed while it stays shelved: no
  // promote->re-shelve churn and no early body in the live set.
  const inbound = {
    id: inboundRow.id,
    type: 'ship',
    alive: true,
    farResident: true,
    lastExactT: inboundRow.lastExactT,
    pos: inboundRow.pos,
    vel: inboundRow.vel,
    radius: inboundRow.radius,
    data: {},
  };
  const authoredState = {
    playerId: state.playerId,
    player: { targetId: null },
    entities: state.entities,
    camera: { zoom: 144, tilt: 60, fov: 50, aspect: 16 / 9 },
  };
  assert.equal(isEntityRenderRelevant(inbound, authoredState), true,
    'a hull reaching the glass inside the promote horizon queues its build now');
  assert.equal(isEntityAuthoredUpgradeRelevant(inbound, authoredState), true,
    'the authored GLB decode starts on closing speed, before the disc admits it');
  assert.ok(collectMeshPresentationEntities(state).some((row) => row.id === 601),
    'the presentation collect surfaces the inbound row for decode+build');

  const ticked = tickFarActors(state, helpers, null);
  assert.equal(ticked.restored, 0,
    'sim promote stays on the disc — the ledger mesh covers the early window');
  assert.equal(ticked.shelved, 0, 'nothing was spawned, so nothing can be re-shelved');
  assert.equal(state.entities.get(601) == null, true, 'the live set is untouched');

  const promoted = requestDecodeRunwayPromote(state, helpers);
  assert.equal(promoted.farPromoted, 0,
    'the render-side safety net also stays on the disc');
});

test('a fast inbound row shelved long ago still admits on its extrapolated position', () => {
  const { state } = boot();
  const enter = farActorTableRadius(state).enter;
  // Shelved 4 s ago at enter+3400 heading in at 500 WU/s: ballistic-now position
  // is enter+1400 — still beyond the disc, but inside the promote horizon.
  const row = insertFarActor(state, {
    id: 606,
    type: 'ship',
    pos: { x: enter + 3400, z: 0 },
    vel: { x: -500, z: 0 },
    rot: 0,
    radius: 8,
    mass: 20,
    hull: 40,
    hullMax: 40,
    team: 1,
    data: { trafficRole: 'raider', homeSectorId: 'sector_ceres_belt' },
    flags: {},
  }, 0);
  state.simTime = 4;
  const stalePosed = {
    id: row.id,
    type: 'ship',
    alive: true,
    farResident: true,
    lastExactT: row.lastExactT,
    pos: row.pos,
    vel: row.vel,
    radius: row.radius,
    data: {},
  };
  const authoredState = {
    playerId: state.playerId,
    player: { targetId: null },
    entities: state.entities,
    camera: { zoom: 144, tilt: 60, fov: 50, aspect: 16 / 9 },
    simTime: 4,
  };
  assert.equal(isEntityRenderRelevant(stalePosed, authoredState), true,
    'the shelf-time position would be 3400 WU out; the real position is already inside the window');
  assert.equal(isEntityAuthoredUpgradeRelevant(stalePosed, authoredState), true);
});

test('mesh collect leans forward on approach vectors only', () => {
  const { state, player } = boot();
  player.vel = { x: 200, z: 0 };
  insertFarActor(state, {
    id: 604,
    type: 'ship',
    pos: { x: 2100, z: 0 },
    vel: { x: -400, z: 0 },
    rot: 0,
    radius: 8,
    mass: 20,
    hull: 40,
    hullMax: 40,
    team: 1,
    data: { trafficRole: 'raider', homeSectorId: 'sector_ceres_belt' },
    flags: {},
  }, 0);
  insertFarActor(state, {
    id: 605,
    type: 'ship',
    pos: { x: -2100, z: 0 },
    vel: { x: -400, z: 0 },
    rot: 0,
    radius: 8,
    mass: 20,
    hull: 40,
    hullMax: 40,
    team: 1,
    data: { trafficRole: 'hauler', homeSectorId: 'sector_ceres_belt' },
    flags: {},
  }, 0);
  const rows = collectMeshPresentationEntities(state);
  assert.ok(rows.some((row) => row.id === 604),
    'a closing far row beyond the static radius still enters the presentation set');
  assert.ok(!rows.some((row) => row.id === 605),
    'a row falling behind the direction of flight stays uncollected');
});

test('first-flight hold still owes a mesh to an inbound prefetch contact', () => {
  const player = {
    id: 1, type: 'ship', alive: true, isPlayer: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, maxSpeed: 160, radius: 8, data: {},
  };
  const inbound = {
    id: 88, type: 'ship', alive: true,
    pos: { x: 400, z: 0 }, vel: { x: -200, z: 0 }, radius: 8, data: {},
  };
  const parkedFar = {
    id: 89, type: 'ship', alive: true,
    pos: { x: 800, z: 0 }, vel: { x: 0, z: 0 }, radius: 8,
    activity: { presentationTier: 'R1_RUNWAY' }, data: {},
  };
  const state = {
    mode: 'flight',
    playerId: 1,
    simTime: 8,
    player: { targetId: null },
    entities: new Map([[1, player], [88, inbound], [89, parkedFar]]),
    entityList: [player, inbound, parkedFar],
    world: { frameOrigin: { x: 0, z: 0 } },
    camera: { zoom: 144, tilt: 60, fov: 50, aspect: 16 / 9 },
    settings: { video: { fov: 50 } },
    render: {
      firstFlightResidencyHoldUntil: 20,
      activityFrame: {
        complete: true,
        renderGlassIds: new Set([1]),
        renderRunwayIds: new Set([89]),
      },
    },
  };
  assert.equal(holdFirstFlightStreaming(state), true);
  assert.equal(isEntityMeshExpected(inbound, state), true,
    'TABLE_RESIDENCY_PREFETCH_SECONDS approach must build under the hold');
  assert.equal(isEntityMeshExpected(parkedFar, state), false,
    'a parked far runway row stays deferred — no whole-tier thrash');
});
