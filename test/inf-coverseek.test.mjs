// inf-coverseek — the Coverseek elite uses the room's rocks (the wave-4 orbit-strafe-cover
// slice). A marked elite at duel range holds behind any rock that blocks its fire line to the
// player: swarmElites writes the bounded `swarmCover` record, flightV3 cuts forward/reverse
// authority while it is live (yaw intact — the hull coasts its orbit), and a flank, a landed
// hit (the flush beat) or the window lapse restores the ordinary closing intent.
//
// The harness mirrors inf-current-rider.test.mjs: real flight + elites owners, no renderer,
// no native physics requirement.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createRunState } from '../src/core/runState.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { MILL_ARENA_ID } from '../src/systems/asteroidMillArena.js';
import {
  rockCoversLine,
  findCoverRock,
  coverRocksOf,
  isSwarmCoverLive,
  SWARM_COVER_WINDOW_TICKS,
} from '../src/systems/swarmCoverSeek.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { swarmElites } from '../src/systems/swarmElites.js';

test('pure geometry: a rock on the line covers, an off-line rock does not', () => {
  const elite = { pos: { x: 400, z: 0 } };
  const player = { pos: { x: 0, z: 0 } };
  const rock = { pos: { x: 200, z: 0 }, radius: 40 };
  assert.equal(rockCoversLine(elite, player, rock, 10), true);
  // Flanked: the line swung 300 wu sideways leaves the stone 120 wu off the line.
  const flanked = { pos: { x: 0, z: 300 } };
  assert.equal(rockCoversLine(elite, flanked, rock, 10), false);
  // A pebble cannot hide a hull.
  assert.equal(rockCoversLine(elite, player, { pos: { x: 200, z: 0 }, radius: 8 }, 10), false);
  // A rock behind the shooter is not cover.
  assert.equal(rockCoversLine(elite, player, { pos: { x: 700, z: 0 }, radius: 60 }, 10), false);
});

test('findCoverRock picks the best blocker deterministically', () => {
  const elite = { pos: { x: 400, z: 0 } };
  const player = { pos: { x: 0, z: 0 } };
  const near = { id: 'a', pos: { x: 210, z: 12 }, radius: 40, alive: true };
  const far = { id: 'b', pos: { x: 195, z: -4 }, radius: 90, alive: true };
  const found = findCoverRock(elite, player, [near, far], 10);
  assert.equal(found.rockId, 'b', 'the deeper cover wins');
  assert.equal(findCoverRock(elite, player, [], 10), null);
  const tieA = { id: 2, pos: { x: 200, z: 0 }, radius: 40, alive: true };
  const tieB = { id: 1, pos: { x: 200, z: 0 }, radius: 40, alive: true };
  assert.equal(findCoverRock(elite, player, [tieA, tieB], 10).rockId, 1, 'ties break to the lower id');
});

test('coverRocksOf reads the indexed lane, then the capped loose fallback', () => {
  const indexed = { entityIndex: { __spacefaceEntityIndexV1: true, ready: true,
    asteroids: [{ id: 'i1', type: 'asteroid' }] } };
  assert.equal(coverRocksOf(indexed).length, 1);
  const loose = { entityList: [
    { type: 'asteroid', alive: true }, { type: 'ship', alive: true }, { type: 'asteroid', alive: false },
  ] };
  assert.equal(coverRocksOf(loose).length, 1);
  assert.equal(coverRocksOf({}).length, 0);
});

test('isSwarmCoverLive is bound to the body life and the window', () => {
  const cover = { life: 3, rockId: 'r', until: 100 };
  assert.equal(isSwarmCoverLive(cover, { tick: 99, life: 3 }), true);
  assert.equal(isSwarmCoverLive(cover, { tick: 100, life: 3 }), false);
  assert.equal(isSwarmCoverLive(cover, { tick: 99, life: 4 }), false);
  assert.equal(isSwarmCoverLive(null, { tick: 0, life: 1 }), false);
});

test('a covered elite holds, a flank or a hit flushes it, and the drive follows the record', t => {
  const sim = createSimulation({ seed: 1, systems: [flightV3, swarmElites] });
  t.after(() => sim.dispose());
  const { state, bus } = sim;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 1 }),
    phase: 'active', wave: 5, arenaId: MILL_ARENA_ID };
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 100, hullMax: 100, radius: 10, mass: 20, collides: true,
    data: { intent: { throttle: 0, strafe: 0, turn: 0, assistMode: 'newtonian' } } });
  state.playerId = player.id;
  const elite = sim.spawn({ type: 'ship', team: 1, pos: { x: 400, z: 0 }, vel: { x: 0, z: 0 },
    hull: 100, hullMax: 100, radius: 10, mass: 20, thrust: 42, collides: true,
    physicsBody: { schemaVersion: 1, dynamic: true, radius: 10, mass: 20, inertiaY: 90, revision: 1 },
    data: { runCohort: 'survival', runRole: 'elite', runWave: 5, swarmAffix: 'cover',
      intent: { throttle: 1, strafe: 0, turn: 0, assistMode: 'newtonian' } } });
  const rock = sim.spawn({ type: 'asteroid', pos: { x: 200, z: 0 }, vel: { x: 0, z: 0 },
    radius: 40, mass: 36000, collides: true });
  const elites = sim.registry.get('swarmElites');
  const flight = sim.registry.get('flight');

  const command = () => {
    flight._stepCraft(elite, { throttle: 1, strafe: 0, turn: 0.5, assistMode: 'newtonian' },
      SIM_DT, state, false);
    return consumePhysicsCommand(elite)?.control;
  };

  // Ordinary elite: closing thrust is live.
  const open = command();
  assert.ok(Math.hypot(open.force.x, open.force.z) > 0, 'no record, no cut');

  sim.step(SIM_DT); // run gates latched; the stamp pass has run once
  elites._coverSeekers.add(elite);
  elites._coverPass(state, state.run);
  assert.ok(elite.data.swarmCover, 'the rock on the line is verdict cover');
  assert.equal(elite.data.swarmCover.rockId, rock.id);

  const held = command();
  assert.equal(Math.hypot(held.force.x, held.force.z), 0, 'live cover cuts forward/reverse');
  assert.notEqual(held.torque.y, 0, 'yaw authority stays with the intent');
  assert.ok(isSwarmCoverLive(elite.data.swarmCover, { tick: state.tick, life: elite.occupantGeneration ?? null }));

  // The flank: swing the player off the line and rescan.
  player.pos.z = 300;
  elites._coverScanIn = 0;
  elites._coverPass(state, state.run);
  assert.equal(elite.data.swarmCover, undefined, 'the flanked line has no verdict');
  const flushed = command();
  assert.ok(Math.hypot(flushed.force.x, flushed.force.z) > 0, 'flanked, the elite closes again');
  player.pos.z = 0;
  elites._coverScanIn = 0;
  elites._coverPass(state, state.run);
  assert.ok(elite.data.swarmCover, 'the realigned line re-covers');

  // The flush beat: a landed hit brawls before it seeks again.
  bus.emit('combat:damage', { targetId: elite.id, applied: 5 });
  assert.equal(elite.data.swarmCover, undefined, 'the hit breaks the hold');
  assert.ok(elite.data.swarmCoverBreakUntil > state.tick);
  elites._coverScanIn = 0;
  elites._coverPass(state, state.run);
  assert.equal(elite.data.swarmCover, undefined, 'the break window refuses a fresh verdict');
  const brawl = command();
  assert.ok(Math.hypot(brawl.force.x, brawl.force.z) > 0, 'flushed elite brawls, not hides');

  // The break window lapses: the same rock re-covers once the flush has had its beat.
  state.tick += 241;
  elites._coverScanIn = 0;
  elites._coverPass(state, state.run);
  assert.ok(elite.data.swarmCover, 'after the break window the line re-covers');

  // The window lapses: the record is not immortal even if the rock never moved.
  state.tick += SWARM_COVER_WINDOW_TICKS + 1;
  elites._coverPass(state, state.run);
  assert.equal(elite.data.swarmCover, undefined, 'an expired window lapses on the next pass');
});

test('the range band gates the seek: brawlers and far closers never hold', t => {
  const sim = createSimulation({ seed: 1, systems: [flightV3, swarmElites] });
  t.after(() => sim.dispose());
  const { state } = sim;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 1 }),
    phase: 'active', wave: 5, arenaId: MILL_ARENA_ID };
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 100, hullMax: 100, radius: 10, mass: 20, collides: true, data: {} });
  state.playerId = player.id;
  sim.spawn({ type: 'asteroid', pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 },
    radius: 40, mass: 36000, collides: true });
  const close = sim.spawn({ type: 'ship', team: 1, pos: { x: 120, z: 0 }, vel: { x: 0, z: 0 },
    hull: 100, hullMax: 100, radius: 10, mass: 20, collides: true,
    data: { runCohort: 'survival', runRole: 'elite', runWave: 5, swarmAffix: 'cover', data: {} } });
  close.data.intent = { throttle: 1, strafe: 0, turn: 0, assistMode: 'newtonian' };
  const far = sim.spawn({ type: 'ship', team: 1, pos: { x: 900, z: 0 }, vel: { x: 0, z: 0 },
    hull: 100, hullMax: 100, radius: 10, mass: 20, collides: true,
    data: { runCohort: 'survival', runRole: 'elite', runWave: 5, swarmAffix: 'cover' } });
  far.data.intent = { throttle: 1, strafe: 0, turn: 0, assistMode: 'newtonian' };
  const elites = sim.registry.get('swarmElites');
  elites._coverSeekers.add(close);
  elites._coverSeekers.add(far);
  sim.step(SIM_DT);
  elites._coverScanIn = 0;
  elites._coverPass(state, state.run);
  assert.equal(close.data.swarmCover, undefined, 'inside the band it brawls');
  assert.equal(far.data.swarmCover, undefined, 'outside the band it closes');
});
