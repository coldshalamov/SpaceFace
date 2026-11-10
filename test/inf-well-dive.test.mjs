// inf-well-dive — the Diver elite commits THROUGH a room pull (the reserved commit-through
// slice of "enemies that use the environment", rotated against Coverseek's hold). A marked
// elite closing from range dives when a live well-kind field's disc genuinely pierces its
// line to the pilot: swarmElites stamps the bounded life-bound `swarmDive` record, flightV3
// bends the approach at the stamped well under a committed throttle floor with NO authority
// cut (guns stay on the pilot), and a landed hit, arrival at brawl range, the window lapse
// or a dried well restores the ordinary closing intent.
//
// Harness mirrors inf-coverseek / inf-current-rider: real flight + fields + elites owners,
// no renderer, no native physics requirement.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createRunState } from '../src/core/runState.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { MILL_ARENA_ID } from '../src/systems/asteroidMillArena.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import {
  SWARM_AFFIXES,
  swarmAffixFor,
} from '../src/data/swarmThreats.js';
import {
  livePullsOf,
  linePiercesPull,
  findDivePull,
} from '../src/systems/swarmDiveSeek.js';
import { fields } from '../src/systems/fields.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { swarmElites, affixHash } from '../src/systems/swarmElites.js';

const WELL = { id: 'dive-test-well', kind: 'well', center: { x: 100, z: 200 },
  radius: 130, strength: 400, damping: 0, falloff: 1, expireAt: Infinity };

function fixture(t) {
  const prior = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const sim = createSimulation({ seed: 1, systems: [flightV3, fields, swarmElites] });
  t.after(() => { sim.dispose(); FIELD_FLAGS.enabled = prior; });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 1 }),
    phase: 'active', wave: 30, arenaId: MILL_ARENA_ID };
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 100, hullMax: 100, radius: 10, mass: 20, collides: true, data: {} });
  state.playerId = player.id;
  // The elite closes from due "south" — nose bearing −π/2 at the pilot — with the well
  // piercing its line off to the +x side, so a commit must visibly bend the steering.
  const elite = sim.spawn({ type: 'ship', team: 1, pos: { x: 0, z: 400 }, vel: { x: 0, z: 0 },
    rot: -Math.PI / 2,
    hull: 100, hullMax: 100, radius: 10, mass: 20, thrust: 42, collides: true,
    physicsBody: { schemaVersion: 1, dynamic: true, radius: 10, mass: 20, inertiaY: 90, revision: 1 },
    data: { runCohort: 'survival', runRole: 'elite', runWave: 30, swarmAffix: 'diver',
      intent: { throttle: 0.2, strafe: 0, turn: 0, assistMode: 'newtonian' } } });
  const fieldOwner = sim.registry.get('fields');
  fieldOwner.registerExternal({ ...WELL });
  const elites = sim.registry.get('swarmElites');
  const flight = sim.registry.get('flight');
  return { sim, state, bus, player, elite, fieldOwner, elites, flight };
}

function commit(h, { scan = true } = {}) {
  h.elites._divers.add(h.elite);
  // Deterministic commit start: clear the hull-id phase stagger the way a mid-wave arrival
  // has already lived past it (the rider harness does the same for its stagger).
  h.elite.data.swarmDiveNextAt = 0;
  if (scan) h.elites._diveScanIn = 0;
  h.elites._divePass(h.state, h.state.run);
  return h.elite.data.swarmDive;
}

function command(h) {
  h.flight._stepCraft(h.elite, { throttle: 0.2, strafe: 0, turn: 0, assistMode: 'newtonian' },
    SIM_DT, h.state, false);
  return consumePhysicsCommand(h.elite)?.control;
}

test('pure geometry: a pierced disc dives, a kissed rim or a behind-crossing does not', () => {
  const elite = { pos: { x: 0, z: 400 } };
  const player = { pos: { x: 0, z: 0 } };
  assert.equal(linePiercesPull(elite, player, WELL), true, 'the line dives through the disc');
  assert.equal(linePiercesPull(elite, player,
    { ...WELL, center: { x: 100, z: 200 }, radius: 60 }), false, 'a rim kiss is not a dive');
  // A crossing behind the shooter is not an approach through the pull.
  const behind = { ...WELL, center: { x: 100, z: 700 } };
  assert.equal(linePiercesPull(elite, player, behind), false);
  // Degenerate geometry refuses honestly.
  assert.equal(linePiercesPull(elite, player, { ...WELL, radius: 0 }), false);
  assert.equal(linePiercesPull(elite, player, null), false);
});

test('findDivePick picks the deepest pierce deterministically; livePullsOf filters and caps', () => {
  const elite = { pos: { x: 0, z: 400 } };
  const player = { pos: { x: 0, z: 0 } };
  const shallow = { id: 'shallow', kind: 'well', center: { x: 100, z: 200 }, radius: 130, expireAt: Infinity };
  const deep = { id: 'deep', kind: 'well', center: { x: 60, z: 200 }, radius: 200, expireAt: Infinity };
  assert.equal(findDivePull(elite, player, [shallow, deep]).fieldId, 'deep', 'the deeper pierce wins');
  const tieA = { id: 'a', kind: 'well', center: { x: 100, z: 200 }, radius: 130, expireAt: Infinity };
  const tieB = { id: 1, kind: 'well', center: { x: 100, z: 200 }, radius: 130, expireAt: Infinity };
  assert.equal(findDivePull(elite, player, [tieA, tieB]).fieldId, 1, 'ties break to the lower id');
  assert.equal(findDivePull(elite, player, []), null);

  const fieldsLike = { kernelList: () => [
    WELL,
    { id: 'shove', kind: 'repulsor', center: { x: 0, z: 0 }, radius: 500, expireAt: Infinity },
    { id: 'dry', kind: 'well', center: { x: 0, z: 0 }, radius: 500, expireAt: -1 },
    { id: 'ghost', kind: 'well', radius: 500, expireAt: Infinity },
    { id: 'flat', kind: 'well', center: { x: 0, z: 0 }, radius: 0, expireAt: Infinity },
  ] };
  const pulls = livePullsOf(fieldsLike, 0);
  assert.equal(pulls.length, 1, 'only the live well survives the read');
  assert.equal(livePullsOf(null, 0).length, 0);
  assert.equal(livePullsOf({}, 0).length, 0);
});

test('a pierced line commits, and the commit bends the approach through the pull', t => {
  const h = fixture(t);
  h.sim.step(SIM_DT); // run gates latched; the stamp pass has run once

  // Ordinary elite at throttle 0.2: closing thrust, no bend (turn intent is zero). The
  // physics command pool reuses one control object per body, so every magnitude the later
  // compares need is snapshotted at read time.
  const open = command(h);
  const openForce = Math.hypot(open.force.x, open.force.z);
  assert.ok(openForce > 0, 'no record, ordinary closing');
  assert.equal(Math.abs(open.torque.y) < 1e-6, true, 'no record, no steering bend');

  const dive = commit(h);
  assert.ok(dive, 'the pierced line is a verdict dive');
  assert.equal(dive.fieldId, WELL.id);
  assert.ok(dive.until > h.state.tick, 'the commit is windowed');

  const committed = command(h);
  assert.ok(Math.abs(committed.torque.y) > 1e-6, 'the commit turns onto the dive bearing');
  assert.ok(h.elite.data.swarmAffix === 'diver');

  // The bend reads the stamped well, not the chase line: mirror the pull across the approach
  // axis and the steering wheel turns the other way.
  const plusSide = Math.sign(committed.torque.y);
  h.fieldOwner.unregisterExternal(WELL.id);
  h.fieldOwner.registerExternal({ ...WELL, id: 'dive-test-well-mirror', center: { x: -100, z: 200 } });
  // The sweep notices the dried well and ends the commit (its cooldown laid); a fresh dive
  // through the mirrored pull starts clean.
  h.elites._diveScanIn = 0;
  h.elites._divePass(h.state, h.state.run);
  h.elite.data.swarmDiveNextAt = 0;
  h.elites._diveScanIn = 0;
  h.elites._divePass(h.state, h.state.run);
  assert.ok(h.elite.data.swarmDive, 'the mirrored line re-commits');
  const mirrored = command(h);
  assert.ok(Math.abs(mirrored.torque.y) > 1e-6, 'the mirrored commit still steers');
  assert.equal(Math.sign(mirrored.torque.y), -plusSide, 'the bend flips with the well side');

  // The throttle floor is the commit's thrust: with the pull sitting ON the closing axis the
  // bearing error is zero, so the only difference from the plain 0.2 intent is the floor.
  h.fieldOwner.unregisterExternal('dive-test-well-mirror');
  h.fieldOwner.registerExternal({ ...WELL, center: { x: 0, z: 200 } });
  h.elites._diveScanIn = 0;
  h.elites._divePass(h.state, h.state.run);
  h.elite.data.swarmDiveNextAt = 0;
  h.elites._diveScanIn = 0;
  h.elites._divePass(h.state, h.state.run);
  assert.ok(h.elite.data.swarmDive, 'the on-axis line re-commits');
  const floored = command(h);
  assert.ok(Math.abs(floored.torque.y) < 1e-6, 'an on-axis dive needs no wheel');
  assert.ok(Math.hypot(floored.force.x, floored.force.z)
    > openForce, 'the committed throttle floor out-thrusts the 0.2 intent');
});

test('inside the grip the steering hands back to the closing intent', t => {
  const h = fixture(t);
  h.sim.step(SIM_DT);
  commit(h);
  // Drop the hull into the well's grip: the pull now owns the approach's shape.
  h.elite.pos.x = WELL.center.x;
  h.elite.pos.z = WELL.center.z;
  const gripped = command(h);
  assert.equal(Math.abs(gripped.torque.y) < 1e-6, true, 'inside the grip the AI keeps its own helm');
});

test('a landed hit breaks the commit once; arrival, expiry and a dried well end it', t => {
  const h = fixture(t);
  h.sim.step(SIM_DT);
  assert.ok(commit(h), 'committed for the end-condition walk');

  const before = h.elite.data.swarmDiveNextAt;
  h.bus.emit('combat:damage', { targetId: h.elite.id, applied: 0 });
  assert.ok(h.elite.data.swarmDive, 'a refused receipt cannot break the commit');
  assert.equal(h.elite.data.swarmDiveNextAt, before, 'the refused receipt set no cooldown');
  h.bus.emit('combat:damage', { targetId: h.elite.id, applied: 5 });
  assert.equal(h.elite.data.swarmDive, undefined, 'the hit breaks the commit');
  const cooldown = h.elite.data.swarmDiveNextAt;
  assert.ok(cooldown > h.state.tick, 'the cooldown counts from the commit end');
  h.bus.emit('combat:damage', { targetId: h.elite.id, applied: 5 });
  assert.equal(h.elite.data.swarmDiveNextAt, cooldown, 'a duplicate cannot end the commit twice');

  // While cooling down, the same pierced line refuses a fresh commit.
  h.elites._diveScanIn = 0;
  h.elites._divePass(h.state, h.state.run);
  assert.equal(h.elite.data.swarmDive, undefined, 'the break window refuses a fresh commit');

  // Arrival: a hull inside the brawl band ends its dive without a hit.
  h.elite.data.swarmDiveNextAt = 0;
  h.elites._divers.add(h.elite);
  h.elite.pos.x = 0; h.elite.pos.z = 150;
  h.elites._diveScanIn = 0;
  h.elites._divePass(h.state, h.state.run);
  assert.equal(h.elite.data.swarmDive, undefined, 'from brawl range the band gate refuses');
  assert.equal(h.elite.data.swarmDiveNextAt, 0, 'the band refusal laid no cooldown');

  h.elites._divers.add(h.elite);
  h.elite.pos.x = 0; h.elite.pos.z = 400;
  h.elites._diveScanIn = 0;
  h.elites._divePass(h.state, h.state.run);
  assert.ok(h.elite.data.swarmDive, 'back in the band, the line re-commits');
  h.elite.pos.x = 0; h.elite.pos.z = 150;
  h.elites._divePass(h.state, h.state.run);
  assert.equal(h.elite.data.swarmDive, undefined, 'the hull arrived — the dive is done');

  // Expiry: the window lapses even if nothing else moved.
  h.elite.pos.x = 0; h.elite.pos.z = 400;
  h.elite.data.swarmDiveNextAt = 0;
  h.elites._divers.add(h.elite);
  h.elites._diveScanIn = 0;
  h.elites._divePass(h.state, h.state.run);
  assert.ok(h.elite.data.swarmDive);
  h.state.tick += 361;
  h.elites._divePass(h.state, h.state.run);
  assert.equal(h.elite.data.swarmDive, undefined, 'an expired window lapses on the next pass');

  // A dried well: the sweep revalidates the recorded field by id.
  h.elite.data.swarmDiveNextAt = 0;
  h.elites._divers.add(h.elite);
  h.elites._diveScanIn = 0;
  h.elites._divePass(h.state, h.state.run);
  assert.ok(h.elite.data.swarmDive);
  h.fieldOwner.unregisterExternal(WELL.id);
  h.elites._diveScanIn = 0;
  h.elites._divePass(h.state, h.state.run);
  assert.equal(h.elite.data.swarmDive, undefined, 'a dried pull cannot own a bearing');
});

test('a stale life cannot commit or bend, and non-law rooms never stamp the law rows', t => {
  const h = fixture(t);
  h.sim.step(SIM_DT);
  const life = h.elite.occupantGeneration;
  commit(h);
  assert.ok(h.elite.data.swarmDive);
  h.elite.occupantGeneration = life + 1;
  const stale = command(h);
  assert.equal(Math.abs(stale.torque.y) < 1e-6, true, 'a stale life cannot hold the bend');
  h.elites._divePass(h.state, h.state.run);
  assert.equal(h.elite.data.swarmDive, undefined, 'the life-bound record drops');
  h.elite.occupantGeneration = life;

  // Vocabulary: Diver sits before Rider, and a room without a law rolls short of both.
  const riderIndex = SWARM_AFFIXES.findIndex((row) => row.id === 'rider');
  const diverIndex = SWARM_AFFIXES.findIndex((row) => row.id === 'diver');
  assert.ok(diverIndex >= 0, 'the diver row exists');
  assert.equal(diverIndex, riderIndex - 1, 'Diver sits directly before the law-gated Rider');
  let ordinal = 0;
  while (swarmAffixFor(affixHash(1, 30, ordinal)) !== 'diver') ordinal++;
  const make = (arenaId) => {
    const body = { id: 900, alive: true, pos: { x: 0, z: 0 },
      data: { runCohort: 'survival', runRole: 'elite', runWave: 30 } };
    h.elites._affixOrdinal = ordinal;
    h.elites._stampAffix(h.state, { ...h.state.run, arenaId }, body, 21);
    return body.data.swarmAffix;
  };
  assert.equal(make(MILL_ARENA_ID), 'diver', 'a law room can stamp the dive');
  for (let i = 0; i < 48; i++) {
    const picked = make('helios_core');
    assert.notEqual(picked, 'diver', 'a room without a law never stamps the dive');
    assert.notEqual(picked, 'rider', 'a room without a law never stamps the ride');
  }
});

test('leaving active combat clears the commit and its cooldown', t => {
  const h = fixture(t);
  h.sim.step(SIM_DT);
  commit(h);
  assert.ok(h.elite.data.swarmDive);
  h.state.run.phase = 'draft';
  h.elites.update(SIM_DT);
  assert.equal(h.elite.data.swarmDive, undefined);
  assert.equal(h.elite.data.swarmDiveNextAt, undefined, 'the old run cannot keep its cooldown');
});
