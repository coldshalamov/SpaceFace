// SEED-PC-01 — a hull the player is watching enters under an existing job-signature
// burn and leaves under the spine wake, at the pocket edge, never in place.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  traffic as trafficBase,
  stampTrafficWatchSignature,
  releaseExpiredTrafficWatch,
  TRAFFIC_WATCH_POCKET_WU,
  TRAFFIC_ARRIVAL_CUE_EMPTY,
  TRAFFIC_ARRIVAL_CUE_LOADED,
  TRAFFIC_DEPARTURE_CUE,
  TRAFFIC_ARRIVAL_CUE_HOLD_S,
} from '../src/systems/traffic.js';
import { resolveNpcJobSignaturePreferCue } from '../src/render/npcJobSignatureVfx.js';

const SEED = 4242;

function hull(pos, data) {
  return { pos: { x: pos.x, z: pos.z }, alive: true, data: { ...(data || {}) } };
}

test('seed 4242: a watched loaded spawn enters at the pocket edge under heavy burn', () => {
  const player = { pos: { x: 0, z: 0 }, alive: true };
  const ent = hull({ x: 12, z: 0 }, { cargoUnits: 4, trafficRole: 'hauler' });
  const stamped = stampTrafficWatchSignature(ent, player, {
    watching: true, exiting: false, seed: SEED, simTime: 10,
  });
  assert.equal(stamped.cue, TRAFFIC_ARRIVAL_CUE_LOADED);
  assert.equal(stamped.placedAtEdge, true);
  assert.equal(ent.data.ceresCausalCue, 'heavy_burn');
  const dist = Math.hypot(ent.pos.x, ent.pos.z);
  assert.ok(dist >= TRAFFIC_WATCH_POCKET_WU - 0.001, `popped inside the pocket at ${dist}`);
  const profile = resolveNpcJobSignaturePreferCue('hauler', 'hold', true, ent.data.ceresCausalCue);
  assert.equal(profile && profile.id, 'heavy_burn');
});

test('seed 4242: an empty watched spawn wears clean burn and an exit wears the spine wake', () => {
  const player = { pos: { x: 100, z: -40 }, alive: true };
  const arriving = hull({ x: 100, z: -40 }, { trafficRole: 'hauler' });
  const arrival = stampTrafficWatchSignature(arriving, player, {
    watching: true, exiting: false, seed: SEED, simTime: 3,
  });
  assert.equal(arrival.cue, TRAFFIC_ARRIVAL_CUE_EMPTY);
  assert.equal(arriving.data.ceresCausalCue, 'clean_burn');
  const arriveDist = Math.hypot(arriving.pos.x - 100, arriving.pos.z + 40);
  assert.ok(arriveDist >= TRAFFIC_WATCH_POCKET_WU - 0.001);

  const leaving = hull({ x: 110, z: -40 }, { trafficRole: 'hauler', ceresCausalCue: 'clean_burn' });
  const exit = stampTrafficWatchSignature(leaving, player, {
    watching: true, exiting: true, seed: SEED, simTime: 9,
  });
  assert.equal(exit.cue, TRAFFIC_DEPARTURE_CUE);
  assert.equal(leaving.data.ceresCausalCue, 'spine_wake');
  const leaveDist = Math.hypot(leaving.pos.x - 100, leaving.pos.z + 40);
  assert.ok(leaveDist >= TRAFFIC_WATCH_POCKET_WU - 0.001, `vanished inside at ${leaveDist}`);
  const profile = resolveNpcJobSignaturePreferCue('hauler', 'depart', false, leaving.data.ceresCausalCue);
  assert.equal(profile && profile.id, 'spine_wake');
  assert.equal(leaving.data.trafficWatchUntil, null);
});

test('seed 4242: an unwatched hull and an authored chain keep their place and cue', () => {
  const player = { pos: { x: 0, z: 0 }, alive: true };
  const quiet = hull({ x: 8, z: 8 }, { trafficRole: 'hauler' });
  const skipped = stampTrafficWatchSignature(quiet, player, {
    watching: false, exiting: false, seed: SEED, simTime: 1,
  });
  assert.equal(skipped.cue, null);
  assert.equal(skipped.placedAtEdge, false);
  assert.equal(quiet.pos.x, 8);
  assert.equal(quiet.data.ceresCausalCue, undefined);

  const chained = hull({ x: 5, z: 0 }, {
    trafficRole: 'hauler',
    ceresCausalEventId: 'ev_keep',
    ceresCausalCue: 'picking_the_bones',
  });
  stampTrafficWatchSignature(chained, player, {
    watching: true, exiting: true, seed: SEED, simTime: 1,
  });
  assert.equal(chained.data.ceresCausalCue, 'picking_the_bones');
  assert.ok(Math.hypot(chained.pos.x, chained.pos.z) >= TRAFFIC_WATCH_POCKET_WU - 0.001);
});

test('an arrival wake lets the job phase show again after its hold', () => {
  const ent = hull({ x: 0, z: 0 }, { trafficRole: 'hauler' });
  stampTrafficWatchSignature(ent, { pos: { x: 0, z: 0 } }, {
    watching: true, exiting: false, seed: SEED, simTime: 2,
  });
  assert.equal(releaseExpiredTrafficWatch(ent, 2 + TRAFFIC_ARRIVAL_CUE_HOLD_S - 0.1), false);
  assert.equal(ent.data.ceresCausalCue, 'clean_burn');
  assert.equal(releaseExpiredTrafficWatch(ent, 2 + TRAFFIC_ARRIVAL_CUE_HOLD_S), true);
  assert.equal(ent.data.ceresCausalCue, undefined);
});

test('seed 4242: the traffic owner stamps a watched spawn and a watched exit', () => {
  const state = {
    mode: 'flight',
    simTime: 20,
    meta: { seed: SEED },
    playerId: 1,
    entities: new Map(),
  };
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 }, data: {} };
  state.entities.set(1, player);
  const sys = Object.create(trafficBase);
  sys.state = state;

  const spawned = hull({ x: 15, z: 0 }, { trafficRole: 'hauler', cargoUnits: 2 });
  const arrival = sys._watchSpawnedTraffic(spawned);
  assert.equal(arrival.cue, TRAFFIC_ARRIVAL_CUE_LOADED);
  assert.ok(Math.hypot(spawned.pos.x, spawned.pos.z) >= TRAFFIC_WATCH_POCKET_WU - 0.001);

  const exiting = hull({ x: 20, z: 10 }, { trafficRole: 'patrol' });
  const departure = sys._watchExitingTraffic(exiting);
  assert.equal(departure.cue, TRAFFIC_DEPARTURE_CUE);
  assert.equal(exiting.data.ceresCausalCue, 'spine_wake');
  assert.ok(Math.hypot(exiting.pos.x, exiting.pos.z) >= TRAFFIC_WATCH_POCKET_WU - 0.001);
});
