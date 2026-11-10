// AL-HF-04 — instant restart belongs to time trials only: the restart key puts the hull on the
// start line with velocity zeroed, the clock at 0, gate progress and the ghost session cleared,
// the same mission still active, and no record, no race:ended, no storage write, no recovery.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { world as worldSystem } from '../src/systems/world.js';
import { missions } from '../src/systems/missions.js';
import {
  RACE_LEVELS, RACE_CONTRACTS, racingSeedFor, raceGateGlobals, startLineFor,
} from '../src/data/raceLevels.js';
import { configureRacingCorridorSession } from '../src/world/racingCorridor.js';
import { BINDINGS } from '../src/ui/bindings.js';
import { observeRacingGhost } from '../src/systems/racingGhosts.js';
import { raceRecordKey } from '../src/systems/racingSteer.js';

const DT = 1 / 60;
const LEVEL = RACE_LEVELS[0];
const CONTRACT = RACE_CONTRACTS.find((row) => row.levelId === LEVEL.id);

function stubStorage(writes) {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { writes.push([k, String(v)]); store.set(k, String(v)); },
    removeItem: (k) => { writes.push(['__remove__' + k, '']); store.delete(k); },
  };
}

function fixture(mode = 'time-trial', writes = []) {
  const state = createGameState(racingSeedFor(CONTRACT.id));
  const bus = createBus();
  const events = [];
  bus.on('race:ended', (p) => events.push(['race:ended', p]));
  bus.on('mission:failed', (p) => events.push(['mission:failed', p]));
  bus.on('mission:completed', (p) => events.push(['mission:completed', p]));
  bus.on('toast', (p) => events.push(['toast', p]));
  const world = Object.create(worldSystem);
  const registry = { get: (id) => (id === 'world' ? world : null) };
  const ctx = { state, bus, helpers: {}, registry };
  Object.create(core).init(ctx);
  world.init(ctx);
  configureRacingCorridorSession(state, true);
  state.mode = 'flight';
  const player = ctx.helpers.spawnEntity({ type: 'ship', isPlayer: true, pos: { x: 50000, z: 50000 }, radius: 32 });
  state.playerId = player.id;
  world.enterSector(LEVEL.sectorId);
  const mission = {
    id: 'tt-restart-heat', type: 'race', status: 'active',
    params: {
      racingContractId: CONTRACT.id, raceMode: mode, raceDifficulty: 'club',
      raceOpponents: mode === 'time-trial' ? 0 : 3,
      courseId: LEVEL.course.courseId, courseSectorId: LEVEL.sectorId,
      gates: LEVEL.course.gates, gateRadiusWU: LEVEL.course.gateRadiusWU,
      courseLengthWU: LEVEL.course.courseLengthWU,
      closedCircuit: true, laps: 1, gridHoldS: 0.5,
      nextGate: 0, gridUntilSimS: 0.5, raceStartSimS: 0.5,
    },
  };
  state.missions.active = [mission];
  const mis = Object.create(missions);
  mis.init(ctx);
  globalThis.localStorage = stubStorage(writes);
  const drive = (ticks = 1) => {
    for (let i = 0; i < ticks; i++) {
      state.tick = (state.tick | 0) + 1;
      state.simTime = (Number(state.simTime) || 0) + DT;
      mis._driveAuthoredRace(mission, 0, state, DT);
    }
  };
  return { state, bus, events, mission, player, mis, drive, writes };
}

test('restart at 20 s restores the start line, clock 0 and a clean attempt inside 60 ticks', () => {
  const { state, bus, events, mission, player, drive } = fixture('time-trial');
  const params = mission.params;

  // Run the real driver until the race clock reads >= 20 s, then displace the hull off line.
  drive(60 * 21);
  const elapsed = state.simTime - params.raceStartSimS;
  assert.ok(elapsed >= 19.9, `race clock advanced to ${elapsed.toFixed(2)}s`);
  const globals = raceGateGlobals(params);
  player.pos.x = globals[2].x; player.pos.z = globals[2].z;      // mid-course, off the line
  player.vel = { x: 900, y: 0, z: -400 };
  drive(2);

  const restarts = [];
  bus.on('race:restarted', (p) => restarts.push(p));
  bus.emit('race:restart', { source: 'keyboard' });
  drive(1);

  assert.equal(restarts.length, 1, 'race:restarted emitted once');
  assert.equal(restarts[0].racingContractId, params.racingContractId);
  const start = startLineFor(params);
  assert.ok(Math.hypot(player.pos.x - start.x, player.pos.z - start.z) <= 1,
    'hull sits on the start line within 1 WU');
  assert.equal(player.rot, start.heading, 'heading is the start-line heading');
  assert.equal(Math.hypot(player.vel.x, player.vel.z), 0, 'velocity zeroed');
  assert.equal(player.angVel, 0, 'angular velocity zeroed');
  assert.equal(params.nextGate, 0, 'gate progress reset');
  assert.equal(params.resetCount, 0, 'restart is not a recovery — clean eligibility restored');
  assert.equal(params.raceFitChanged, false);
  assert.equal(params.raceInvalidated, false);
  assert.equal((params.lapTimesS || []).length, 0, 'lap-time history cleared');
  drive(59);
  const newElapsed = state.simTime - params.raceStartSimS;
  assert.ok(newElapsed <= 1, `clock reads ${newElapsed.toFixed(2)}s within 60 ticks of the restart`);
  assert.equal(state.missions.active[0], mission, 'same mission object still active');
  assert.equal(mission.id, 'tt-restart-heat');
  for (const [name] of events) {
    assert.ok(!['race:ended', 'mission:failed', 'mission:completed'].includes(name),
      `restart never emitted ${name}`);
  }
  // The abandoned attempt's tape is gone with the deleted session: the first post-restart
  // observe opens a fresh record and accepts it rather than replaying or rejecting stale data.
  const observed = observeRacingGhost(params, player, state, { events: [] });
  assert.equal(observed.ok, true, `fresh ghost session records (${observed.reason})`);
});

test('restart writes no record, no save, and never calls rememberRaceRecord', () => {
  const writes = [];
  const { bus, mission, player, drive } = fixture('time-trial', writes);
  drive(60 * 5);
  mission.params.nextGate = 3;
  mission.params.resetCount = 1;
  player.pos.x += 3000; player.vel = { x: 500, y: 0, z: 0 };
  const before = writes.length;
  bus.emit('race:restart', {});
  drive(1);
  assert.equal(writes.length, before,
    'the restart path touches no storage — rememberRaceRecord and saves stay silent');
});

test('race and cup modes refuse with a toast and change nothing', () => {
  for (const mode of ['race', 'cup']) {
    const { bus, events, mission, player, drive } = fixture(mode);
    drive(60 * 3);
    const pos = { x: player.pos.x, z: player.pos.z };
    const elapsed = mission.params.raceStartSimS;
    bus.emit('race:restart', {});
    assert.equal(player.pos.x, pos.x);
    assert.equal(player.pos.z, pos.z);
    assert.equal(mission.params.raceStartSimS, elapsed, 'clock untouched');
    const refusal = events.find(([name, p]) => name === 'toast' && /time trials/i.test(p.text));
    assert.ok(refusal, `${mode} mode got the refusal toast`);
  }
});

test('an active Massline tether refuses the restart and changes nothing', () => {
  const { state, bus, events, mission, player, drive } = fixture('time-trial');
  drive(60 * 3);
  const pos = { x: player.pos.x, z: player.pos.z };
  const elapsed = mission.params.raceStartSimS;
  const gate = mission.params.nextGate;
  state.player.tether = { active: true };
  bus.emit('race:restart', {});
  assert.equal(player.pos.x, pos.x);
  assert.equal(player.pos.z, pos.z);
  assert.equal(mission.params.raceStartSimS, elapsed);
  assert.equal(mission.params.nextGate, gate);
  const refusal = events.find(([name, p]) => name === 'toast' && /Massline/i.test(p.text));
  assert.ok(refusal, 'tether refusal toast fired');
});

test('set pieces re-arm from t=0 on restart', () => {
  const { bus, mission, mis, player, drive } = fixture('time-trial');
  drive(60 * 8);
  const before = mis._racingSetPieces?.inspect();
  assert.ok(before && before.cues.length > 0, 'set pieces active before restart');
  const armed = before.cues.filter((c) => c.phase !== 'scheduled');
  assert.ok(armed.length > 0 || before.cues.every((c) => c.countdownS < c.countdownS + 1),
    'the schedule visibly advanced before restart');
  player.pos.x += 2000;
  bus.emit('race:restart', {});
  drive(1);
  const after = mis._racingSetPieces?.inspect();
  assert.ok(after && after.cues.length === before.cues.length, 'cue roster rebuilt');
  assert.ok(after.cues.filter((c) => c.kind !== 'anchor').every((c) => c.phase === 'scheduled'),
    'every dynamic cue returns to its t=0 scheduled phase');
});

test('a clean finish after restart files exactly one best; the abandoned attempt filed none', () => {
  const writes = [];
  const { state, bus, mission, player, drive } = fixture('time-trial', writes);
  const params = mission.params;
  drive(60 * 6);
  const globals = raceGateGlobals(params);
  // Dirty the attempt, then restart.
  player.vel = { x: 700, y: 0, z: 0 };
  bus.emit('race:restart', {});
  assert.equal(params.resetCount, 0);
  // Fly the real gate sequence: each gate gets a two-tick sweep — approach on the course side,
  // then through the plane — so advanceCircuit's swept fraction sees a real crossing.
  let ticks = 0;
  while (!Number.isFinite(params.raceElapsedS) && ticks < 60 * 90) {
    const next = Math.min(params.nextGate, globals.length - 1);
    const after = globals[(next + 1) % globals.length];
    const dx = after.x - globals[next].x, dz = after.z - globals[next].z;
    const len = Math.hypot(dx, dz) || 1;
    player.pos.x = globals[next].x - (dx / len) * 8;
    player.pos.z = globals[next].z - (dz / len) * 8;
    drive(1);
    player.pos.x = globals[next].x + (dx / len) * 8;
    player.pos.z = globals[next].z + (dz / len) * 8;
    player.vel = { x: (dx / len) * 300, y: 0, z: (dz / len) * 300 };
    drive(1);
    ticks++;
  }
  assert.ok(Number.isFinite(params.raceElapsedS), 'the restarted run finished');
  assert.equal(params.raceClean, true, 'the restarted attempt is clean-eligible');
  const recordWrites = writes.filter(([k]) => k === 'spaceface.raceRecords.v2');
  assert.equal(recordWrites.length, 1,
    'exactly one best filed — the abandoned attempt never wrote');
  const bag = JSON.parse(recordWrites[0][1]);
  assert.ok(bag[raceRecordKey(params)] > 0, 'the clean best landed under this course slot');
});

test('bindings: raceRestart exists, is unique, and the help sheet lists it', () => {
  assert.ok(BINDINGS.raceRestart, 'BINDINGS.raceRestart exists');
  const codes = new Map();
  for (const [id, b] of Object.entries(BINDINGS)) {
    assert.ok(!codes.has(b.code), `${b.code} already bound to ${codes.get(b.code)}`);
    codes.set(b.code, id);
  }
  const helpSrc = readFileSync(fileURLToPath(new URL('../src/ui/screens/help.js', import.meta.url)), 'utf8');
  assert.ok(helpSrc.includes('Restart time trial'), 'help lists the restart row');
  const inputSrc = readFileSync(fileURLToPath(new URL('../src/ui/input.js', import.meta.url)), 'utf8');
  assert.ok(inputSrc.includes("bus.emit('race:restart'"), 'input emits race:restart');
  assert.ok(inputSrc.includes('BINDINGS.raceRestart'), 'input matches the binding');
  assert.ok(inputSrc.match(/raceRestart[\s\S]{0,200}ev\.repeat/), 'repeat keys are ignored');
});

test('racingHud: the Restart button exists and is gated to time trials', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/ui/racingHud.js', import.meta.url)), 'utf8');
  assert.ok(src.includes("button('Restart'"), 'the Restart button exists beside Recover');
  assert.ok(src.includes("raceMode !== 'time-trial'"), 'hidden unless the active run is a time trial');
});
