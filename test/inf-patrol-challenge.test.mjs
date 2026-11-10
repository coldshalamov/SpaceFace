// inf-patrol-challenge — a patrol that acquires a wanted hull reacts BEFORE any scan cone or
// seeded hunter: it takes the law's challenge stamp (data.heatChallenge), the band names the
// sheet once per patrol per heat episode, and traffic flies the hull onto the standoff ring.
// The stamp is law's fact and traffic's flying: lawSecurity writes it, traffic only reads it;
// clean sheet, dead hull, incident responders, and stations are never challenged. The bookkeeping
// is session truth — a save/load clears it because entity ids re-bind.

import test from 'node:test';
import assert from 'node:assert/strict';

import { lawSecurity } from '../src/systems/lawSecurity.js';
import { traffic } from '../src/systems/traffic.js';
import { LAW_HEAT_CHALLENGE_COPY } from '../src/data/lawChallengeCopy.js';
import {
  LAW_HEAT_CHALLENGE_ACQUIRE_WU,
  LAW_HEAT_CHALLENGE_STANDOFF_WU,
} from '../src/systems/lawSecurity.js';

const SEED = 4242;

function makeBus() {
  const handlers = new Map();
  const log = [];
  return {
    emitLog: log,
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, []);
      handlers.get(evt).push(fn);
    },
    off(evt, fn) {
      const list = handlers.get(evt) || [];
      handlers.set(evt, list.filter((h) => h !== fn));
    },
    emit(evt, payload) {
      log.push({ evt, payload });
      for (const fn of handlers.get(evt) || []) fn(payload);
      return true;
    },
  };
}

function events(bus, name) {
  return bus.emitLog.filter((row) => row.evt === name);
}

function makeLaw(player = {}, playerId = 'player') {
  const entities = new Map();
  const state = {
    meta: { seed: SEED },
    simTime: 40,
    tick: 80,
    mode: 'flight',
    playerId,
    player: { heat: 0, credits: 5000, cargo: { items: {} }, ...player },
    world: { currentSectorId: 'sector_helios_prime' },
    entities,
    entityList: [],
  };
  const bus = makeBus();
  const law = Object.create(lawSecurity);
  law.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  return { state, bus, law, entities };
}

function add(run, entity) {
  run.entities.set(entity.id, entity);
  run.state.entityList.push(entity);
  return entity;
}

function patrolEntity(id = 'patrol', { x = 300, z = 0, security = false } = {}) {
  return {
    id, type: 'ship', alive: true, rot: 0, factionId: 'faction_scn',
    pos: { x, z: 0 },
    data: { ai: { lawful: true, spawnContext: 'patrol', ...(security ? { securityTargetId: 'player' } : {}) } },
  };
}

function challengeScene({ heat = 0.2, patrol = patrolEntity(), playerId = 'player' } = {}) {
  const run = makeLaw({ heat }, playerId);
  const player = add(run, {
    id: playerId, type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, data: {},
  });
  const hull = add(run, patrol);
  return { run, player, hull };
}

test('a clean sheet is never challenged', () => {
  const { run, hull } = challengeScene({ heat: 0 });
  run.law.update(1 / 60, run.state);
  assert.equal(hull.data.heatChallenge, undefined, 'no stamp on a clean hull');
  assert.equal(events(run.bus, 'law:heatChallenge').length, 0);
  assert.equal(events(run.bus, 'toast').length, 0);
});

test('an acquiring patrol takes the stamp and names the sheet exactly once', () => {
  const { run, hull } = challengeScene({ heat: 0.2 }); // level 1 → SCAN tier
  const { law, bus, state } = run;

  law.update(1 / 60, state);
  const stamp = hull.data.heatChallenge;
  assert.ok(stamp, 'the patrol carries the law challenge stamp');
  assert.equal(stamp.tier, 'scan');
  assert.equal(standoffOf(stamp), LAW_HEAT_CHALLENGE_STANDOFF_WU);

  const challenges = events(bus, 'law:heatChallenge');
  assert.equal(challenges.length, 1, 'one challenge hail');
  assert.equal(challenges[0].payload.patrolId, 'patrol');
  assert.equal(challenges[0].payload.tier, 'scan');
  assert.equal(challenges[0].payload.line, LAW_HEAT_CHALLENGE_COPY.scan.hail,
    'the band line is the authored bank line for the tier');
  assert.equal(events(bus, 'comms:log').filter(({ payload }) => payload.text === LAW_HEAT_CHALLENGE_COPY.scan.hail).length, 1,
    'the existing visible comms owner receives the authored patrol hail');
  assert.equal(events(bus, 'toast').length, 1, 'one law toast accompanies the hail');

  // Same episode, hull already stamped: the watch never hails twice.
  for (let i = 0; i < 5; i++) { state.tick += 30; law.update(1 / 60, state); }
  assert.equal(events(bus, 'law:heatChallenge').length, 1, 'no repeat hail inside one episode');
  assert.equal(events(bus, 'toast').length, 1);
});

test('a tier change is a new episode: the stamp re-names the sheet', () => {
  const { run, hull } = challengeScene({ heat: 0.2 });
  const { law, bus, state } = run;
  law.update(1 / 60, state);
  assert.equal(hull.data.heatChallenge.tier, 'scan');
  assert.equal(events(bus, 'law:heatChallenge').length, 1);

  state.player.heat = 0.4; // level 2 → BOUNTY tier
  state.tick += 30;
  law.update(1 / 60, state);
  const challenges = events(bus, 'law:heatChallenge');
  assert.equal(challenges.length, 2, 'the new sheet is named once');
  assert.equal(challenges[1].payload.tier, 'bounty');
  assert.equal(challenges[1].payload.line, LAW_HEAT_CHALLENGE_COPY.bounty.hail);
  assert.equal(hull.data.heatChallenge.tier, 'bounty');
});

test('clearing the sheet releases every challenged patrol', () => {
  const { run, hull } = challengeScene({ heat: 0.2 });
  const { law, state } = run;
  law.update(1 / 60, state);
  assert.ok(hull.data.heatChallenge);

  state.player.heat = 0;
  state.tick += 30;
  law.update(1 / 60, state);
  assert.equal(hull.data.heatChallenge, undefined, 'the stamp falls with the sheet');
  assert.deepEqual(state.lawSecurity.heatChallenges, {});
});

test('real numeric patrol ids survive the next watch and release with the sheet', () => {
  const { run, hull } = challengeScene({ playerId: 1, patrol: patrolEntity(2) });
  hull.occupantGeneration = 17;
  run.law.update(1 / 60, run.state);
  const stamp = hull.data.heatChallenge;
  run.state.tick += 1;
  run.law.update(1 / 60, run.state);
  assert.equal(run.state.lawSecurity.heatChallenges[2], stamp, 'the numeric Map occupant stays tracked');
  run.state.player.heat = 0;
  run.state.tick += 30;
  run.law.update(1 / 60, run.state);
  assert.equal(hull.data.heatChallenge, undefined, 'clear releases the exact numeric occupant');
});

test('a released near-ring patrol returns its borrowed brake before its ordinary orbit', () => {
  const { run, hull } = challengeScene({ patrol: patrolEntity('patrol', { x: 220 }) });
  const controller = Object.create(traffic);
  run.law.update(1 / 60, run.state);
  controller._stepHeatChallenge(hull, run.state);
  assert.equal(hull.data.intent.brake, true, 'the challenge holds the ring');
  run.law._releaseAllHeatChallenges(run.state, 'sheet_clear');
  assert.equal(hull.data.heatChallenge, undefined);
  assert.equal(controller._stepHeatChallenge(hull, run.state), false, 'the released override yields');
  controller._stepOrbit(hull, { orbitPhase: 0 }, [{ pos: { x: 1000, z: 0 } }], 1 / 60);
  assert.equal(hull.data.intent.moveZ, 1, 'normal traffic commands its orbit');
  assert.notEqual(hull.data.intent.brake, true, 'the released challenge does not keep braking the orbit');
});

test('release keeps a pre-existing brake and never alters another intent or occupant', () => {
  for (const change of ['preexisting', 'intent', 'generation', 'job']) {
    const { run, hull } = challengeScene({ playerId: 1, patrol: patrolEntity(2, { x: 220 }) });
    const controller = Object.create(traffic);
    hull.occupantGeneration = 17;
    hull.data.intent = { brake: change === 'preexisting' };
    run.law.update(1 / 60, run.state);
    controller._stepHeatChallenge(hull, run.state);
    run.law._releaseAllHeatChallenges(run.state, 'sheet_clear');
    if (change === 'intent') hull.data.intent = { brake: true };
    if (change === 'generation') hull.occupantGeneration = 18;
    if (change === 'job') hull.data.jobId = 'foreign-control';
    controller._stepHeatChallenge(hull, run.state);
    assert.equal(hull.data.intent.brake, true, `${change}: foreign/pre-existing brake is preserved`);
  }
});

test('a replacement numeric occupant cannot inherit the original patrol challenge', () => {
  const { run, hull } = challengeScene({ playerId: 1, patrol: patrolEntity(2) });
  hull.occupantGeneration = 17;
  run.law.update(1 / 60, run.state);
  const stamp = hull.data.heatChallenge;
  const replacement = { ...hull, occupantGeneration: 18, data: { ...hull.data, intent: { brake: true } } };
  run.entities.set(2, replacement);
  run.state.entityList[run.state.entityList.indexOf(hull)] = replacement;
  run.law._releaseAllHeatChallenges(run.state, 'sheet_clear');
  assert.equal(replacement.data.heatChallenge, stamp, 'release does not clear metadata on another life');
  assert.equal(traffic._stepHeatChallenge(replacement, run.state), false, 'the old stamp cannot steer the new life');
  assert.deepEqual(replacement.data.intent, { brake: true });
});

test('a patrol that leaves the release ring falls back after the hold window', () => {
  const { run, hull } = challengeScene({ heat: 0.2 });
  const { law, state } = run;
  law.update(1 / 60, state);
  assert.ok(hull.data.heatChallenge);

  // Fly away beyond the release ring (2x acquire): the stamp survives the first watch…
  hull.pos.x = LAW_HEAT_CHALLENGE_ACQUIRE_WU * 3;
  state.tick += 30;
  law.update(1 / 60, state);
  assert.ok(hull.data.heatChallenge, 'one watch outside the ring does not drop the stamp');

  // …and falls after LAW_HEAT_CHALLENGE_RELEASE_S of continuous distance.
  state.simTime += 7;
  state.tick += 30;
  law.update(1 / 60, state);
  assert.equal(hull.data.heatChallenge, undefined, 'the release window lands the hull back on its route');
});

test('incident responders, stations, and dead hulls are never challenged', () => {
  const run = makeLaw({ heat: 0.2 });
  const player = add(run, {
    id: 'player', type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {},
  });
  const responder = add(run, patrolEntity('responder', { security: true }));
  const station = add(run, {
    id: 'station', type: 'station', alive: true, factionId: 'faction_scn',
    pos: { x: 10, z: 0 }, data: { ai: { lawful: true } },
  });
  const dead = add(run, { ...patrolEntity('dead'), alive: false });
  run.law.update(1 / 60, run.state);
  assert.equal(responder.data.heatChallenge, undefined, 'a dispatch hull answers to its incident');
  assert.equal(station.data.heatChallenge, undefined, 'a station is never a challenged patrol');
  assert.equal(dead.data.heatChallenge, undefined);
  assert.equal(events(run.bus, 'law:heatChallenge').length, 0);
});

test('an open custody hold takes the moment: no challenge while surrender stands', () => {
  const run = makeLaw({ heat: 0.65 }); // nets tier — the surrender range
  const player = add(run, {
    id: 'player', type: 'ship', alive: true, pos: { x: 40, z: 5000 }, vel: { x: 0, z: 0 }, data: {},
  });
  add(run, {
    id: 'patrol', type: 'ship', alive: true, rot: 0, factionId: 'faction_scn',
    pos: { x: 0, z: 5000 }, data: { ai: { lawful: true } },
  });
  run.law.update(1 / 60, run.state);
  assert.equal(run.state.lawSecurity.playerSurrender.phase, 'holding', 'custody opened');
  assert.equal(events(run.bus, 'law:heatChallenge').length, 0,
    'the custody cone owns the moment, not the route challenge');
});

test('a save/load clears the challenge bookkeeping with the stale hull ids', () => {
  const { run, hull } = challengeScene({ heat: 0.2 });
  const { law, state } = run;
  law.update(1 / 60, state);
  assert.ok(hull.data.heatChallenge);
  assert.ok(state.lawSecurity.heatChallenges.patrol);

  law.deserialize(law.serialize());
  assert.equal(state.lawSecurity.heatChallenges, undefined,
    'stamps name live hull ids; ids re-bind on load, so the watch re-derives');
  assert.equal(hull.data.heatChallenge, undefined, 'restore also releases the live same-life stamp');
});

test('cold native SaveSystem Continue releases only its own borrowed brake through the next orbit', async () => {
  const [{ createSimulation, SIM_DT }, { physics }, { save }, { makeShipEntitySpec }] = await Promise.all([
    import('../src/core/sim.js'), import('../src/core/physics.js'),
    import('../src/save/saveSystem.js'), import('../src/systems/ships.js'),
  ]);
  for (const variant of ['borrowed', 'preexisting', 'new-intent']) {
    const first = createSimulation({ seed: SEED, systems: [physics, traffic, lawSecurity, save] });
    const fresh = createSimulation({ seed: SEED, systems: [physics, traffic, lawSecurity, save] });
    try {
      first.state.mode = 'flight'; first.state.run = { kind: 'adventure' };
      first.state.world.currentSectorId = 'sector_helios_prime'; first.state.player.heat = 0.2;
      const player = first.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, team: 0, pos: { x: 0, z: 0 } }));
      first.state.playerId = player.id;
      const hull = first.spawn(makeShipEntitySpec('ship_kestrel', { team: 2, pos: { x: 220, z: 0 },
        ai: { lawful: true, passive: true, spawnContext: 'patrol' } }));
      hull.flags.persistent = true; hull.data.callsign = 'Cold Watch';
      hull.data.intent = { brake: variant === 'preexisting', moveZ: 0 };
      assert.equal(await first.registry.get('physics').prepareBackend(first.state), true);
      first.step(SIM_DT);
      const stamp = hull.data.heatChallenge;
      assert.ok(stamp);
      first.registry.get('traffic')._stepHeatChallenge(hull, first.state);
      assert.equal(hull.data.intent.brake, true, 'the saved brake is held by the actual challenge controller');
      if (variant === 'new-intent') hull.data.intent = { brake: true, moveZ: 0 };
      const envelope = JSON.parse(JSON.stringify(first.registry.get('save').serialize('patrol-cold-continue')));
      assert.ok(envelope.data.entities.persistent.find(e => e.data?.callsign === 'Cold Watch')?.data.heatChallenge,
        'the real generic entity serializer carries the session stamp');
      assert.equal(await fresh.registry.get('physics').prepareBackend(fresh.state), true);
      assert.equal(fresh.registry.get('save').loadEnvelope(envelope, 'patrol-cold-continue'), true);
      const restored = [...fresh.state.entities.values()].find(e => e.data?.callsign === 'Cold Watch');
      assert.ok(restored); assert.notEqual(restored, hull);
      const native = fresh.registry.get('physics')._sg02.records.get(restored.id);
      assert.equal(native?.entity, restored);
      assert.equal(native.body.isValid(), true); assert.ok(native.colliders.length > 0);
      assert.equal(restored.data.heatChallenge, undefined, 'the cloned old-session stamp is discarded on Continue');
      if (variant === 'new-intent') assert.deepEqual(restored.data.intent, { brake: true, moveZ: 0 },
        'a replacement intent is preserved exactly through restore');
      fresh.step(SIM_DT); fresh.step(SIM_DT);
      const next = restored.data.heatChallenge;
      assert.ok(next, 'the actual law watch can acquire the restored native patrol');
      assert.notEqual(next, stamp);
      assert.equal(next.patrolId, restored.id);
      assert.equal(next.patrolGeneration, restored.occupantGeneration);
      assert.equal(fresh.state.lawSecurity.heatChallenges[restored.id], next, 'the new life is tracked, not orphaned');
      const controller = fresh.registry.get('traffic');
      controller._stepHeatChallenge(restored, fresh.state);
      fresh.registry.get('lawSecurity')._onSaveLoaded();
      assert.equal(restored.data.heatChallenge, next, 'a repeated lifecycle notification keeps a currently owned live stamp');
      fresh.state.player.heat = 0;
      fresh.step(SIM_DT);
      assert.equal(restored.data.heatChallenge, undefined);
      assert.equal(controller._stepHeatChallenge(restored, fresh.state), false, 'the released controller yields');
      controller._stepOrbit(restored, { orbitPhase: 0 }, [{ pos: { x: 1000, z: 0 } }], SIM_DT);
      assert.equal(restored.data.intent.moveZ, 1, 'the actual normal orbit commands forward movement');
      assert.equal(restored.data.intent.brake, variant !== 'borrowed',
        `${variant}: only a feature-owned brake is removed after Continue and sheet clear`);
      assert.equal(restored.data.intent.heatChallengeBrakeBorrow, undefined, 'the completed borrow leaves no live marker');
    } finally {
      first.registry.get('physics')._sg02?.dispose(); first.dispose();
      fresh.registry.get('physics')._sg02?.dispose(); fresh.dispose();
    }
  }
});

// ── traffic reads the fact: the challenged patrol flies the ring ─────────────────────────────

function trafficState(playerPos = { x: 0, z: 0 }) {
  const entities = new Map();
  const state = {
    playerId: 'player',
    entities,
  };
  entities.set('player', { id: 'player', type: 'ship', alive: true, pos: playerPos });
  return state;
}

function challengedHull(at = { x: 2000, z: 0 }) {
  const e = {
    id: 'patrol', type: 'ship', alive: true, rot: 0, pos: { ...at },
    data: { heatChallenge: { patrolId: 'patrol', patrolGeneration: null, episodeId: 1, tier: 'scan', since: 0, standoffWu: LAW_HEAT_CHALLENGE_STANDOFF_WU } },
  };
  e.data.intent = { moveX: 0, moveZ: 1, boost: true, fire: false, brake: false, aimAngle: 0 };
  return e;
}

test('traffic closes onto the standoff ring and then holds it, nose on the hull', () => {
  const far = challengedHull({ x: 2000, z: 0 });
  assert.equal(traffic._stepHeatChallenge(far, trafficState()), true);
  assert.equal(far.data.intent.moveZ, 0.45, 'closing the ring is station-keeping speed, never a ramming burn');
  assert.equal(far.data.intent.boost, false);
  assert.equal(far.data.intent.aimAngle, Math.atan2(0, -2000), 'nose toward the wanted hull');

  const near = challengedHull({ x: LAW_HEAT_CHALLENGE_STANDOFF_WU, z: 0 });
  assert.equal(traffic._stepHeatChallenge(near, trafficState()), true);
  assert.equal(near.data.intent.moveZ, 0, 'on the ring the patrol holds position');
  assert.equal(near.data.intent.brake, true, 'engines cut on the ring — the stop is the pressure');
  assert.equal(near.data.intent.aimAngle, Math.atan2(0, -LAW_HEAT_CHALLENGE_STANDOFF_WU));
});

test('traffic hands the hull back when the wanted hull is gone or no stamp is carried', () => {
  const hull = challengedHull();
  delete hull.data.heatChallenge;
  assert.equal(traffic._stepHeatChallenge(hull, trafficState()), false,
    'no stamp, no challenge — the ordinary route dispatch takes over');

  const stamped = challengedHull();
  const state = trafficState();
  state.entities.get('player').alive = false;
  assert.equal(traffic._stepHeatChallenge(stamped, state), false,
    'a dead wanted hull cannot hold a ring');
});

function standoffOf(stamp) {
  return Math.round(Number(stamp.standoffWu));
}
