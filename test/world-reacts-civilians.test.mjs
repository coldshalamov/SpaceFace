/**
 * PQ-138.02 — "The civilian hauler panics."
 *
 * Traffic consumes production combat:damage / law:incidentOpened. Ambient hulls flee or hold;
 * live jobs suspend and resume through npcJobsRuntime. Combatants are not uninvolved civilians.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { traffic } from '../src/systems/traffic.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { NPC_JOB_KIND, NPC_JOB_PHASE } from '../src/systems/npcJobs.js';

const DT = 1 / 60;
const VISION = 'The civilian hauler panics.';

function eventBus() {
  const listeners = new Map();
  const log = [];
  return {
    log,
    on(event, handler) {
      const handlers = listeners.get(event) || [];
      handlers.push(handler);
      listeners.set(event, handlers);
    },
    off(event, handler) {
      listeners.set(event, (listeners.get(event) || []).filter((candidate) => candidate !== handler));
    },
    emit(event, payload) {
      log.push({ event, payload });
      for (const handler of listeners.get(event) || []) handler(payload);
    },
  };
}

function wrapDelta(a, b) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function haulerJobSpec() {
  return {
    kind: NPC_JOB_KIND.HAULER,
    sectorId: 'sector_helios_prime',
    route: [
      { id: 'origin', pos: { x: 0, z: 0 } },
      { id: 'dest', pos: { x: 500, z: 0 } },
    ],
    speed: 40,
    commissionS: 1,
    departS: 1,
    approachS: 1,
    loadS: 1,
    unloadS: 1,
    payload: { commodity: 'ore', units: 10 },
  };
}

function minerJobSpec() {
  return {
    kind: NPC_JOB_KIND.MINER,
    sectorId: 'sector_helios_prime',
    route: [
      { id: 'home', pos: { x: 0, z: 0 } },
      { id: 'field', pos: { x: 240, z: 0 } },
    ],
    speed: 30,
    commissionS: 1,
    departS: 1,
    approachS: 1,
    workS: 4,
    loadS: 1,
    unloadS: 1,
  };
}

function makeWorld(opts = {}) {
  const role = opts.role || 'hauler';
  const player = {
    id: 1, type: 'ship', alive: true, isPlayer: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, data: {},
  };
  const stationA = {
    id: 10, type: 'station', alive: true,
    pos: { x: 500, z: 0 }, data: { stationId: 'station_a', name: 'A' },
  };
  const stationB = {
    id: 11, type: 'station', alive: true,
    pos: { x: -500, z: 0 }, data: { stationId: 'station_b', name: 'B' },
  };
  const rock = {
    id: 30, type: 'asteroid', alive: true,
    pos: { x: 240, z: 0 }, data: { typeId: 'ast_common_rock' },
  };
  const hull = {
    id: 20, type: 'ship', alive: true, team: 2,
    pos: { x: opts.x || 0, z: opts.z || 0 },
    vel: { x: opts.vx || 0, z: opts.vz || 0 },
    rot: opts.rot || 0,
    data: {
      trafficRole: role,
      role,
      worldRecordId: opts.worldRecordId || null,
      intent: {
        moveX: 0, moveZ: 1, boost: false, fire: false, fireGroup: null,
        aimAngle: Number.isFinite(opts.aim) ? opts.aim : 0,
      },
    },
  };
  const rec = {
    id: hull.id,
    role,
    targetId: opts.targetId != null
      ? opts.targetId
      : (role === 'miner' || role === 'surveyor' ? rock.id : stationA.id),
    waitT: 0,
    nextTradeT: 8,
    dockSeq: 0,
    carrying: !!opts.carrying,
    manifest: { lines: [], totalQty: 0 },
  };
  const state = {
    meta: { seed: 4242 },
    seed: 4242,
    tick: 600,
    simTime: 10,
    mode: 'flight',
    playerId: player.id,
    player: { credits: 0 },
    world: { currentSectorId: 'sector_helios_prime', sectors: {} },
    entities: new Map([
      [player.id, player], [stationA.id, stationA], [stationB.id, stationB],
      [rock.id, rock], [hull.id, hull],
    ]),
    entityList: [player, stationA, stationB, rock, hull],
    traffic: {
      freighters: [rec],
      appliedArrivalIds: [],
      appliedLossIds: [],
      appliedMinerWorkIds: [],
    },
  };
  return { state, player, stationA, stationB, rock, hull, rec };
}

function boot(world, withJobs = false) {
  const helpers = {};
  const bus = eventBus();
  const jobs = withJobs ? Object.assign({}, npcJobsRuntime) : null;
  const sys = Object.assign({}, traffic);
  if (jobs) jobs.init({ state: world.state, bus, helpers, registry: null });
  sys.init({ state: world.state, bus, helpers, registry: null });
  return { bus, sys, jobs, helpers };
}

function stepTraffic(sys, state, n = 1) {
  for (let i = 0; i < n; i++) {
    state.tick = (state.tick | 0) + 1;
    state.simTime = (Number(state.simTime) || 0) + DT;
    sys.update(DT, state);
  }
}

function stepBoth(sys, jobs, state, n = 1) {
  for (let i = 0; i < n; i++) {
    state.tick = (state.tick | 0) + 1;
    state.simTime = (Number(state.simTime) || 0) + DT;
    jobs.update(DT, state);
    sys.update(DT, state);
  }
}

function productionDamage(ids, at, extra = {}) {
  return {
    targetId: ids.targetId,
    attackerId: ids.shooterId,
    amount: extra.applied != null ? extra.applied : 12,
    rawTotal: extra.applied != null ? extra.applied : 12,
    applied: extra.applied != null ? extra.applied : 12,
    type: 'energy',
    pos: { x: at.x, z: at.z },
  };
}

function productionIncident(ids) {
  return {
    id: 'law:test-incident',
    stationId: 'station_a',
    factionId: 'faction_scn',
    attackerId: ids.shooterId,
    victimId: ids.targetId,
    cause: 'hostile_fire',
    status: 'distress',
    outcome: null,
    responderIds: [],
    startedAt: 10,
  };
}

function spawnHostiles(world, at, teams = { shooter: 2, target: 2 }) {
  const shooter = {
    id: 99, type: 'ship', alive: true, team: teams.shooter,
    pos: { x: at.x, z: at.z }, vel: { x: 0, z: 0 }, data: {},
  };
  const target = {
    id: 98, type: 'ship', alive: true, team: teams.target,
    pos: { x: at.x + 40, z: at.z + 20 }, vel: { x: 0, z: 0 }, data: {},
  };
  world.state.entities.set(shooter.id, shooter);
  world.state.entities.set(target.id, target);
  world.state.entityList.push(shooter, target);
  return { shooter, target };
}

function firefight(bus, at, ids = { shooterId: 99, targetId: 98 }, extra = {}) {
  bus.emit('combat:damage', productionDamage(ids, at, extra));
}

test('a hauler inside the radius changes course — "The civilian hauler panics."', () => {
  const world = makeWorld({ role: 'hauler', aim: 0 });
  const { bus, sys } = boot(world);
  spawnHostiles(world, { x: 80, z: 40 });
  const beforeAim = world.hull.data.intent.aimAngle;
  const beforeTarget = world.rec.targetId;
  firefight(bus, { x: 80, z: 40 });
  stepTraffic(sys, world.state, 3);
  const intent = world.hull.data.intent;
  const headingChange = wrapDelta(intent.aimAngle, beforeAim);
  const rerouted = world.rec.targetId !== beforeTarget;
  assert.ok(
    headingChange > 0.2 || rerouted,
    `${VISION} A hauler inside 300 WU of gunfire must turn more than ~0.2 rad or pick a new destination; heading Δ=${headingChange.toFixed(3)} target ${beforeTarget}→${world.rec.targetId}`,
  );
  assert.equal(intent.moveZ, 1, `${VISION} the hauler runs, it does not heave-to`);
  assert.equal(intent.boost, true, `${VISION} an empty hauler boosts away from the gunfire`);
});

test('a hauler outside the radius does not panic — "The civilian hauler panics."', () => {
  const world = makeWorld({ role: 'hauler', aim: 0 });
  const { bus, sys } = boot(world);
  spawnHostiles(world, { x: 0, z: 400 });
  const beforeAim = world.hull.data.intent.aimAngle;
  const beforeTarget = world.rec.targetId;
  firefight(bus, { x: 0, z: 400 });
  stepTraffic(sys, world.state, 3);
  assert.ok(
    wrapDelta(world.hull.data.intent.aimAngle, beforeAim) <= 0.2,
    `${VISION} A hauler 400 WU from gunfire must not panic-turn; heading Δ=${wrapDelta(world.hull.data.intent.aimAngle, beforeAim).toFixed(3)}`,
  );
  assert.equal(world.rec.targetId, beforeTarget, `${VISION} a far hauler keeps its destination`);
});

test('zero-applied damage is ignored — "The civilian hauler panics."', () => {
  const world = makeWorld({ role: 'hauler', aim: 0 });
  const { bus, sys } = boot(world);
  spawnHostiles(world, { x: 80, z: 40 });
  const beforeAim = world.hull.data.intent.aimAngle;
  const beforeTarget = world.rec.targetId;
  firefight(bus, { x: 80, z: 40 }, { shooterId: 99, targetId: 98 }, { applied: 0 });
  stepTraffic(sys, world.state, 3);
  assert.ok(
    wrapDelta(world.hull.data.intent.aimAngle, beforeAim) <= 0.2,
    `${VISION} applied=0 is not a hit`,
  );
  assert.equal(world.rec.targetId, beforeTarget, `${VISION} zero-applied damage must not reroute traffic`);
});

test('combat:fire alone does not panic traffic — "The civilian hauler panics."', () => {
  const world = makeWorld({ role: 'hauler', aim: 0 });
  const { bus, sys } = boot(world);
  spawnHostiles(world, { x: 80, z: 40 });
  const beforeAim = world.hull.data.intent.aimAngle;
  const beforeTarget = world.rec.targetId;
  bus.emit('combat:fire', {
    id: 99, shooterId: 99, attackerId: 99, targetId: 98,
    pos: { x: 80, z: 40 }, weaponId: 'wpn_pulse',
  });
  stepTraffic(sys, world.state, 3);
  assert.equal(world.rec.targetId, beforeTarget, `${VISION} empty-space / mining fire must not panic traffic`);
  assert.ok(wrapDelta(world.hull.data.intent.aimAngle, beforeAim) <= 0.2);
});

test('an incident without pos still panics from attacker/victim entities — "The civilian hauler panics."', () => {
  const world = makeWorld({ role: 'hauler', aim: 0 });
  const { bus, sys } = boot(world);
  spawnHostiles(world, { x: 80, z: 40 });
  const beforeAim = world.hull.data.intent.aimAngle;
  const beforeTarget = world.rec.targetId;
  bus.emit('law:incidentOpened', productionIncident({ shooterId: 99, targetId: 98 }));
  stepTraffic(sys, world.state, 3);
  const headingChange = wrapDelta(world.hull.data.intent.aimAngle, beforeAim);
  assert.ok(
    headingChange > 0.2 || world.rec.targetId !== beforeTarget,
    `${VISION} a public incident has IDs, not pos; traffic must resolve the fight from the combatants`,
  );
});

test('attacker and victim are not treated as uninvolved civilians — "The civilian hauler panics."', () => {
  const world = makeWorld({ role: 'hauler', aim: 0 });
  const { bus, sys } = boot(world);
  spawnHostiles(world, { x: 80, z: 40 });
  const beforeAim = world.hull.data.intent.aimAngle;
  const beforeTarget = world.rec.targetId;
  const frozen = { ...world.hull.data.intent };
  firefight(bus, { x: 80, z: 40 }, { shooterId: 99, targetId: world.hull.id });
  stepTraffic(sys, world.state, 3);
  assert.deepEqual(
    world.hull.data.intent,
    frozen,
    `${VISION} the victim of the hit is a combatant, not an uninvolved civilian`,
  );
  assert.equal(world.rec.targetId, beforeTarget);
  assert.equal(world.hull.data.intent.aimAngle, beforeAim);
});

test('a miner holds instead of fleeing — "The civilian hauler panics."', () => {
  const world = makeWorld({ role: 'miner', aim: 0 });
  const { bus, sys } = boot(world);
  spawnHostiles(world, { x: 60, z: 20 });
  const beforeTarget = world.rec.targetId;
  firefight(bus, { x: 60, z: 20 });
  stepTraffic(sys, world.state, 3);
  const intent = world.hull.data.intent;
  assert.equal(intent.moveZ, 0, `${VISION} a miner next to a gun battle holds; it does not fly into it`);
  assert.equal(intent.boost, false, `${VISION} a holding miner does not boost`);
  assert.equal(intent.brake, true, `${VISION} a holding miner brakes rather than coast through the fight`);
  assert.equal(world.rec.targetId, beforeTarget, `${VISION} a holding miner keeps its rock; it does not flee-reroute`);
  assert.equal(world.rec.carrying, false, `${VISION} holding is not a pickup`);
});

test('a towing hull keeps its tow — "The civilian hauler panics."', () => {
  const world = makeWorld({ role: 'miner', carrying: true, aim: 0, targetId: 10 });
  const { bus, sys } = boot(world);
  spawnHostiles(world, { x: 70, z: 10 });
  firefight(bus, { x: 70, z: 10 });
  stepTraffic(sys, world.state, 3);
  assert.equal(world.rec.carrying, true, `${VISION} a hull that is towing does not drop its load to run`);
  assert.equal(world.hull.data.intent.moveZ, 1, `${VISION} the towing hull leaves with the load`);
  assert.equal(world.hull.data.intent.boost, false, `${VISION} a loaded hull leaves more slowly — no boost`);
});

test('the alarm decays back to the ordinary route — "The civilian hauler panics."', () => {
  const world = makeWorld({ role: 'hauler', aim: 0 });
  const { bus, sys } = boot(world);
  spawnHostiles(world, { x: 80, z: 40 });
  const homeTarget = world.rec.targetId;
  firefight(bus, { x: 80, z: 40 });
  stepTraffic(sys, world.state, 3);
  assert.ok(
    world.hull.data.intent.boost === true || world.rec.targetId !== homeTarget,
    `${VISION} the hauler must be on the alarmed branch before the scare can fade`,
  );
  world.state.simTime += 6;
  stepTraffic(sys, world.state, 4);
  assert.equal(world.hull.data.intent.brake, false, `${VISION} after a handful of seconds with no gunfire the scare lifts`);
  assert.equal(
    world.rec.targetId,
    homeTarget,
    `${VISION} the hauler returns to its ordinary destination when the alarm fades`,
  );
});

test('the response is deterministic on a fixed seed — "The civilian hauler panics."', () => {
  function once() {
    const world = makeWorld({ role: 'hauler', aim: 0 });
    const { bus, sys } = boot(world);
    spawnHostiles(world, { x: 80, z: 40 });
    firefight(bus, { x: 80, z: 40 });
    stepTraffic(sys, world.state, 5);
    return {
      aim: world.hull.data.intent.aimAngle,
      boost: world.hull.data.intent.boost,
      moveZ: world.hull.data.intent.moveZ,
      targetId: world.rec.targetId,
    };
  }
  assert.deepEqual(once(), once(), `${VISION} the same seed and the same shots must produce the same course`);
});

test('a live job is interrupted and later resumed — "The civilian hauler panics."', () => {
  const world = makeWorld({ role: 'hauler', aim: 1.1, worldRecordId: 'rec-job-hauler' });
  world.hull.data.intent = {
    moveX: 0, moveZ: 0.4, boost: false, fire: false, fireGroup: null, aimAngle: 1.1, brake: false,
  };
  const { bus, sys, jobs, helpers } = boot(world, true);
  const jobId = helpers.npcJobs.assign(world.hull, haulerJobSpec());
  assert.equal(jobId, 'job:rec-job-hauler');
  spawnHostiles(world, { x: 80, z: 40 });
  stepBoth(sys, jobs, world.state, 1);
  firefight(bus, { x: 80, z: 40 });
  jobs.update(DT, world.state);
  const afterJobs = { ...world.hull.data.intent };
  sys.update(DT, world.state);
  assert.deepEqual(
    world.hull.data.intent,
    afterJobs,
    `${VISION} traffic must not write intent for a hull that carries a jobId`,
  );
  const entry = helpers.npcJobs.get(jobId);
  assert.equal(entry.job.phase, NPC_JOB_PHASE.FLEE, `${VISION} the job owner suspends into flee`);
  stepBoth(sys, jobs, world.state, 2);
  const intent = world.hull.data.intent;
  assert.equal(intent.moveZ, 1, `${VISION} the job hull runs after the job owner writes flee`);
  assert.equal(intent.boost, true, `${VISION} an empty job hauler boosts away`);
  world.state.simTime += 6;
  stepBoth(sys, jobs, world.state, 4);
  const resumed = helpers.npcJobs.get(jobId);
  assert.notEqual(resumed.job.phase, NPC_JOB_PHASE.FLEE, `${VISION} the job resumes its prior route when the scare lifts`);
});

test('a job miner holds through the job owner — "The civilian hauler panics."', () => {
  const world = makeWorld({ role: 'miner', aim: 0, worldRecordId: 'rec-job-miner' });
  const { bus, sys, jobs, helpers } = boot(world, true);
  const jobId = helpers.npcJobs.assign(world.hull, minerJobSpec());
  spawnHostiles(world, { x: 60, z: 20 });
  firefight(bus, { x: 60, z: 20 });
  stepBoth(sys, jobs, world.state, 3);
  const entry = helpers.npcJobs.get(jobId);
  assert.equal(entry.job.phase, NPC_JOB_PHASE.FLEE);
  const intent = world.hull.data.intent;
  assert.equal(intent.moveZ, 0, `${VISION} a working miner holds rather than bolting`);
  assert.equal(intent.boost, false);
  assert.equal(intent.brake, true);
});

test('a towing job hull keeps its tow and leaves slowly — "The civilian hauler panics."', () => {
  const world = makeWorld({
    role: 'hauler', carrying: true, aim: 0, worldRecordId: 'rec-job-tow',
  });
  const { bus, sys, jobs, helpers } = boot(world, true);
  helpers.npcJobs.assign(world.hull, haulerJobSpec());
  spawnHostiles(world, { x: 70, z: 10 });
  firefight(bus, { x: 70, z: 10 });
  stepBoth(sys, jobs, world.state, 3);
  assert.equal(world.rec.carrying, true, `${VISION} interrupt must not drop the tow`);
  assert.equal(world.hull.data.intent.moveZ, 1);
  assert.equal(world.hull.data.intent.boost, false, `${VISION} a loaded job hull leaves slowly`);
});
