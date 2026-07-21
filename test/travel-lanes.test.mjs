// Travel lanes — physical lane infrastructure on the Helios → Tethys chord (ADR D8, packet W3-C).
//
// These tests drive the REAL system object, the REAL propulsion kernel and the REAL authored lane
// geometry. Nothing here reimplements the chord projection, the governor ramp or the encounter
// director, because a test that asserts against a parallel reimplementation proves only that two
// copies of a bug agree.
//
// THE DISCRIMINATING TEST in this file is `lane ceiling is idempotent under the input.js feedback
// loop`. `input.js:163` writes the kernel's published ceiling back onto the same drive block every
// tick, so a lane that multiplied the field it found there instead of a freshly resolved base would
// compound to the absolute bound within a couple of seconds and never come back down. That bug
// passes every other assertion in this file — the ship goes fast, the flag works, the ambush fires —
// and is only caught by feeding the published value back and checking the ceiling holds still.
//
// The second load-bearing test is `disruption spends velocity through the existing decay`: it pins
// that the lane writes ONE boolean and that the SHIPPED kernel decay is what slows the ship, rather
// than any deceleration logic of the lane's own.

import test from 'node:test';
import assert from 'node:assert/strict';

import { travelLanes, projectOntoLane, resolveLaneSegment, nextIntactBeacon } from '../src/systems/travelLanes.js';
import { LANE_HELIOS_TETHYS, buildLaneGeometry, LANE_BEACON_SPACING_WU } from '../src/data/travelLaneRoutes.js';
import { stepPropulsion, resolveTravelCeiling, TRAVEL_CEILING_ABSOLUTE_WU_S } from '../src/core/flight/propulsionKernel.js';
import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import { shouldSyncPhysicsBodyEntity } from '../src/core/physicsAuthority.js';
import { TRAVEL_FLAGS } from '../src/data/featureFlags.js';
import { sectorGlobalOrigin, sectorMembershipAtGlobal } from '../src/data/sectorCoordinates.js';

const GEOMETRY = buildLaneGeometry(LANE_HELIOS_TETHYS);

function makeBus() {
  const handlers = new Map();
  const events = [];
  return {
    events,
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
    },
    emit(name, payload) {
      events.push({ name, payload });
      for (const fn of handlers.get(name) || []) fn(payload);
    },
    of(name) { return events.filter((e) => e.name === name); },
  };
}

/** A state shaped like the real one at the seams travelLanes touches, and no wider. */
function makeState(pos, driveState = 'engaged') {
  const player = {
    id: 1,
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    mass: 1000,
    inertia: 1000,
    propulsion: { id: 'drive_reaction_m' },
  };
  return {
    playerId: 1,
    simTime: 100,
    entities: new Map([[1, player]]),
    player: {},
    input: { travelDrive: { state: driveState, cap: 0 } },
  };
}

/** Spawn/registry doubles that record rather than simulate. */
function makeHost(state, { director = null } = {}) {
  const bus = makeBus();
  const spawned = [];
  let nextId = 100;
  const helpers = {
    spawnEntity(spec) {
      const ent = { id: nextId++, ...spec, pos: { ...spec.pos } };
      spawned.push(ent);
      state.entities.set(ent.id, ent);
      return ent;
    },
  };
  const sys = Object.create(travelLanes);
  sys.init({
    state,
    bus,
    helpers,
    registry: { get: (name) => (name === 'encounterDirector' ? director : null) },
  });
  return { sys, bus, spawned };
}

/** A point exactly on the chord at `along` WU from the Helios end. */
function onChord(along) {
  return {
    x: GEOMETRY.from.x + GEOMETRY.axis.x * along,
    z: GEOMETRY.from.z + GEOMETRY.axis.z * along,
  };
}

function withFlag(value, fn) {
  const prior = TRAVEL_FLAGS.laneBoost;
  const priorBurn = TRAVEL_FLAGS.travelBurn;
  TRAVEL_FLAGS.laneBoost = value;
  TRAVEL_FLAGS.travelBurn = value;
  try { return fn(); } finally {
    TRAVEL_FLAGS.laneBoost = prior;
    TRAVEL_FLAGS.travelBurn = priorBurn;
  }
}

// ─── geometry: charted origin and destination, on the surveyor lattice ─────────────────────────────

test('lane is derived from the frozen sector origins, not a second copy of them', () => {
  assert.deepEqual(GEOMETRY.from, sectorGlobalOrigin('sector_helios_prime'));
  assert.deepEqual(GEOMETRY.to, sectorGlobalOrigin('sector_tethys_junction'));
  // Helios sits at the origin, so a lane that accidentally used sector-local coordinates would look
  // correct at the Helios end and wrong at Tethys — the exact blind spot that hid RC-1. Pin the far
  // end explicitly.
  assert.deepEqual(GEOMETRY.to, { x: 12288, z: 8192 });
});

test('beacons are spaced one quarter-lattice quantum apart, on the grid', () => {
  assert.ok(GEOMETRY.beacons.length >= 10, 'a real chain, not a token pair');
  for (let i = 1; i < GEOMETRY.beacons.length; i++) {
    const gap = GEOMETRY.beacons[i].alongWU - GEOMETRY.beacons[i - 1].alongWU;
    assert.equal(gap, LANE_BEACON_SPACING_WU, `beacon ${i} is off the lattice`);
  }
  // Every beacon lies on the chord to floating-point tolerance.
  for (const b of GEOMETRY.beacons) {
    assert.ok(projectOntoLane(GEOMETRY, b.pos).offAxisWU < 1e-6, 'beacon drifted off the chord');
  }
});

test('multiple acceleration segments, exactly one of them disrupted', () => {
  assert.ok(GEOMETRY.segments.length >= 5, 'multiple segments (acceptance item 2)');
  const dead = GEOMETRY.segments.filter((s) => s.disrupted);
  assert.equal(dead.length, 1, 'exactly one damaged segment (acceptance item 4)');
});

test('the dead segment sits unambiguously inside one Voronoi cell', () => {
  // If the dead segment straddled the bisector, sectorMembershipAtGlobal would be a coin flip and
  // requestAuthoredEncounter would intermittently reject with wrong_sector — a silent no-pirates bug.
  const dead = GEOMETRY.segments.find((s) => s.disrupted);
  const cell = sectorMembershipAtGlobal(dead.midpoint);
  assert.equal(cell, 'sector_helios_prime');
  const dHelios = Math.hypot(dead.midpoint.x, dead.midpoint.z);
  const dTethys = Math.hypot(dead.midpoint.x - 12288, dead.midpoint.z - 8192);
  assert.ok(dTethys - dHelios > 2000, 'dead segment is far from the bisector, so the cell is stable');
});

// ─── the boost ────────────────────────────────────────────────────────────────────────────────────

test('inside an intact segment the lane multiplies the drive ceiling and ramp', () => {
  withFlag(true, () => {
    const state = makeState(onChord(2048));
    const { sys } = makeHost(state);
    sys.update(1 / 60, state);
    const base = resolveTravelCeiling(resolvePropulsionProfile(state.entities.get(1), state));
    assert.equal(state.input.travelDrive.ceiling, base * LANE_HELIOS_TETHYS.ceilingMult);
    assert.equal(state.input.travelDrive.rampMult, LANE_HELIOS_TETHYS.rampMult);
    assert.equal(state.travelLanes.boosted, true);
    assert.equal(state.travelLanes.segmentState, 'intact');
  });
});

test('outside the corridor the multiplier is actively released, not merely skipped', () => {
  // The regression this guards: input.js feeds the published ceiling back every tick, so a lane that
  // simply stopped writing on exit would leave the boosted ceiling sticky forever.
  withFlag(true, () => {
    const inside = onChord(2048);
    const state = makeState(inside);
    const { sys } = makeHost(state);
    sys.update(1 / 60, state);
    const boosted = state.input.travelDrive.ceiling;

    // Step off the axis, beyond the tube radius.
    const player = state.entities.get(1);
    player.pos.x = inside.x - GEOMETRY.axis.z * (GEOMETRY.radiusWU + 200);
    player.pos.z = inside.z + GEOMETRY.axis.x * (GEOMETRY.radiusWU + 200);
    sys.update(1 / 60, state);

    const base = resolveTravelCeiling(resolvePropulsionProfile(player, state));
    assert.equal(state.travelLanes.inLane, false);
    assert.equal(state.travelLanes.boosted, false);
    assert.equal(state.input.travelDrive.ceiling, base, 'ceiling returned to the drive base');
    assert.equal(state.input.travelDrive.rampMult, 1);
    assert.ok(boosted > base, 'sanity: it really was boosted first');
  });
});

test('lane ceiling is idempotent under the input.js feedback loop', () => {
  // THE DISCRIMINATING TEST. input.js:163 writes the kernel's published ceiling back onto the drive
  // block each tick. Replay that feedback for 600 ticks and assert the ceiling does not creep.
  withFlag(true, () => {
    const state = makeState(onChord(2048));
    const { sys } = makeHost(state);
    const drive = state.input.travelDrive;
    const base = resolveTravelCeiling(resolvePropulsionProfile(state.entities.get(1), state));
    const expected = base * LANE_HELIOS_TETHYS.ceilingMult;

    for (let i = 0; i < 600; i++) {
      sys.update(1 / 60, state);
      // The feedback input.js performs, verbatim in effect: republish what the kernel published.
      const r = stepPropulsion({
        dt: 1 / 60,
        body: { pos: { x: 0, z: 0 }, vel: { x: 120, z: 0 }, rot: 0, angVel: 0, mass: 1000, inertia: 1000 },
        input: { throttle: 1, strafe: 0, turn: 0, assistMode: 'assisted', travelDrive: drive },
        profile: resolvePropulsionProfile(state.entities.get(1), state),
      });
      if (Number.isFinite(r.telemetry.travelCap)) drive.cap = r.telemetry.travelCap;
      if (Number.isFinite(r.telemetry.travelCeiling)) drive.ceiling = r.telemetry.travelCeiling;
    }
    assert.equal(drive.ceiling, expected, 'ceiling compounded through the feedback loop');
    assert.ok(expected < TRAVEL_CEILING_ABSOLUTE_WU_S, 'this drive is below the bound, so creep would be visible');
  });
});

test('the boost is a real speed gain through the shipped governor, not a teleport', () => {
  withFlag(true, () => {
    const profile = resolvePropulsionProfile({ propulsion: { id: 'drive_reaction_m' } }, {});
    const base = resolveTravelCeiling(profile);

    const ramp = (override) => {
      const drive = { state: 'engaged', cap: 0, ...override };
      let last = null;
      for (let i = 0; i < 900; i++) {
        const r = stepPropulsion({
          dt: 1 / 60,
          body: { pos: { x: 0, z: 0 }, vel: { x: 200, z: 0 }, rot: 0, angVel: 0, mass: 1000, inertia: 1000 },
          input: { throttle: 1, strafe: 0, turn: 0, assistMode: 'assisted', travelDrive: drive },
          profile,
        });
        last = r.telemetry;
        if (Number.isFinite(last.travelCap)) drive.cap = last.travelCap;
      }
      return last;
    };

    const plain = ramp({});
    const lane = ramp({ ceiling: base * LANE_HELIOS_TETHYS.ceilingMult, rampMult: LANE_HELIOS_TETHYS.rampMult });
    assert.ok(lane.travelCap > plain.travelCap + 100, `lane must materially lift the cap (${plain.travelCap} -> ${lane.travelCap})`);
    assert.ok(lane.travelCap <= TRAVEL_CEILING_ABSOLUTE_WU_S, 'never past the engineering bound');
  });
});

// ─── disruption, dropout and recovery ─────────────────────────────────────────────────────────────

test('a disrupted segment holds the LEVEL disruption flag input.js already reads', () => {
  withFlag(true, () => {
    const dead = GEOMETRY.segments.find((s) => s.disrupted);
    const state = makeState(dead.midpoint);
    const { sys } = makeHost(state);
    sys.update(1 / 60, state);

    // The level flag, not the one-shot: input.js clears `disruptRequest` every tick, so a one-shot
    // would let the cooldown expire under a player still sitting in the dead segment.
    assert.equal(state.player.travelDrive.disrupted, true);
    assert.equal(state.travelLanes.segmentState, 'disrupted');
    assert.equal(state.travelLanes.boosted, false, 'a dead segment grants no boost');
    assert.equal(state.travelLanes.disrupted, true);
  });
});

test('disruption spends velocity through the EXISTING decay, with no new braking logic', () => {
  // D8's confiscation-free slowdown. The lane contributes one boolean; the kernel's own decay branch
  // does the deceleration and reports it as earned momentum being spent.
  withFlag(true, () => {
    const profile = resolvePropulsionProfile({ propulsion: { id: 'drive_reaction_m' } }, {});
    const base = resolveTravelCeiling(profile);
    const drive = { state: 'engaged', cap: base * LANE_HELIOS_TETHYS.ceilingMult, ceiling: base * LANE_HELIOS_TETHYS.ceilingMult };

    const step = (d) => stepPropulsion({
      dt: 1 / 60,
      body: { pos: { x: 0, z: 0 }, vel: { x: 900, z: 0 }, rot: 0, angVel: 0, mass: 1000, inertia: 1000 },
      input: { throttle: 1, strafe: 0, turn: 0, assistMode: 'assisted', travelDrive: d },
      profile,
    }).telemetry;

    const engaged = step(drive);
    assert.ok(engaged.travelCap > base, 'engaged in-lane cap is lifted');

    // Disruption forces the latch to cooldown (input.js). That is the ONLY change.
    const cooled = { ...drive, state: 'cooldown' };
    const first = step(cooled);
    assert.ok(first.travelCap < engaged.travelCap, 'cap decays once the drive is knocked out');
    assert.equal(first.governor.physicsEarned, true, 'the slowdown is earned-momentum SPENDING, not confiscation');

    // And it keeps decaying rather than snapping to the governed cap.
    let cap = first.travelCap;
    for (let i = 0; i < 120; i++) {
      const t = step({ ...cooled, cap });
      assert.ok(t.travelCap <= cap + 1e-9, 'cap is monotonically non-increasing while disrupted');
      cap = t.travelCap;
    }
    assert.ok(cap < engaged.travelCap * 0.7, 'a real, gradual slowdown');
  });
});

test('the ambush is placed at the dead beacon, in the beacon\'s own Voronoi sector', () => {
  withFlag(true, () => {
    const dead = GEOMETRY.segments.find((s) => s.disrupted);
    const state = makeState(dead.midpoint);
    const calls = [];
    const director = {
      requestAuthoredEncounter(p) { calls.push(p); return { ok: true, encounterId: p.encounterId }; },
    };
    const { sys, bus } = makeHost(state, { director });
    sys.update(1 / 60, state);

    assert.equal(calls.length, 1, 'the existing director places the pirates');
    const call = calls[0];
    assert.equal(call.shapeId, 'ambush_snare');
    assert.equal(call.zoneType, 'ambush_lane');
    assert.equal(call.sectorId, sectorMembershipAtGlobal(dead.midpoint), 'sector comes from the beacon, not the lane origin');
    assert.equal(call.force, true);
    assert.deepEqual(call.anchor, { x: dead.midpoint.x, z: dead.midpoint.z }, 'at the disruption point');
    assert.equal(bus.of('lane:disrupted').length, 1);

    // Idempotent: a second tick in the same dead segment must not double-spawn.
    sys.update(1 / 60, state);
    assert.equal(calls.length, 1, 'stable encounter id prevents a re-request');
  });
});

test('a rejected ambush request is retried, never latched as done', () => {
  // requestAuthoredEncounter returns wrong_sector while the player is still crossing into the cell.
  // Latching on failure would mean the ambush silently never happens.
  withFlag(true, () => {
    const dead = GEOMETRY.segments.find((s) => s.disrupted);
    const state = makeState(dead.midpoint);
    let attempts = 0;
    const director = {
      requestAuthoredEncounter() {
        attempts += 1;
        return attempts === 1 ? { ok: false, reason: 'wrong_sector' } : { ok: true, encounterId: 'x' };
      },
    };
    const { sys } = makeHost(state, { director });
    sys.update(1 / 60, state);
    sys.update(1 / 60, state);
    assert.equal(attempts, 2, 'a rejection is retried on the next tick');
    sys.update(1 / 60, state);
    assert.equal(attempts, 2, 'and latches once it succeeds');
  });
});

test('recovery points at the next intact beacon ahead', () => {
  withFlag(true, () => {
    const dead = GEOMETRY.segments.find((s) => s.disrupted);
    const state = makeState(dead.midpoint);
    const { sys } = makeHost(state);
    sys.update(1 / 60, state);

    const recovery = state.travelLanes.recoveryBeaconIndex;
    assert.ok(Number.isInteger(recovery), 'a physical recovery target is published');
    assert.ok(recovery > dead.index, 'it is ahead of the dropout, not behind it');
    const expected = nextIntactBeacon(GEOMETRY, dead.midpoint ? dead.a.alongWU : 0);
    assert.ok(expected, 'the helper resolves a beacon');

    // Reaching it clears the hold — recovery is physical, not a menu action.
    const player = state.entities.get(1);
    const target = GEOMETRY.beacons[recovery];
    player.pos.x = target.pos.x;
    player.pos.z = target.pos.z;
    sys.update(1 / 60, state);
    assert.equal(state.player.travelDrive.disrupted, false, 'the drive is released at the intact beacon');
    assert.equal(state.travelLanes.segmentState, 'intact');
  });
});

// ─── infrastructure, traffic and performance ──────────────────────────────────────────────────────

test('beacons lazily materialize near the player and stay bounded', () => {
  withFlag(true, () => {
    const state = makeState(onChord(2048));
    const { sys, spawned } = makeHost(state);
    // Far from the chain, nothing materializes.
    const player = state.entities.get(1);
    player.pos.x = 500000; player.pos.z = 500000;
    for (let i = 0; i < 30; i++) sys.update(1 / 60, state);
    assert.equal(spawned.filter((e) => e.type === 'beacon').length, 0, 'no eager chain spawn');

    // Near the chain, beacons appear — one per tick, never bursting.
    const near = onChord(2048);
    player.pos.x = near.x; player.pos.z = near.z;
    for (let i = 0; i < 60; i++) sys.update(1 / 60, state);
    const beacons = spawned.filter((e) => e.type === 'beacon');
    assert.ok(beacons.length > 0, 'beacons materialize when the player arrives');
    assert.ok(beacons.length <= 20, 'hard cap respected');
    // Only those genuinely in range.
    for (const b of beacons) {
      assert.ok(Math.hypot(b.pos.x - near.x, b.pos.z - near.z) <= 3200 + 1, 'spawned out of range');
    }
  });
});

test('a dead beacon is physically marked before the drive ever drops', () => {
  withFlag(true, () => {
    const dead = GEOMETRY.segments.find((s) => s.disrupted);
    const state = makeState(dead.a.pos);
    const { sys, spawned } = makeHost(state);
    for (let i = 0; i < 60; i++) sys.update(1 / 60, state);
    const marked = spawned.filter((e) => e.type === 'beacon' && e.data.laneBeaconDead);
    assert.ok(marked.length > 0, 'the pilot can read the failure in the world, not only in the HUD');
    assert.match(marked[0].data.scanLabel, /OFFLINE/);
  });
});

test('lane traffic uses the same route, at constant entity cost', () => {
  withFlag(true, () => {
    const state = makeState(onChord(4096));
    const { sys, spawned } = makeHost(state);
    for (let i = 0; i < 200; i++) { state.simTime += 1 / 60; sys.update(1 / 60, state); }
    const traffic = spawned.filter((e) => e.data && e.data.parentType === 'lane_traffic');
    assert.ok(traffic.length > 0, 'traffic uses the lane (acceptance item 3)');
    assert.ok(traffic.length <= 6, 'roster is fixed — density cannot grow without bound');

    // Every hauler stays on the chord: it is using the lane, not merely near it.
    for (const t of traffic) {
      const ent = state.entities.get(t.id);
      assert.ok(projectOntoLane(GEOMETRY, ent.pos).offAxisWU < 1e-6, 'traffic drifted off the lane');
      assert.equal(ent.collides, false, 'closed-form lane decoration must not advertise collision');
      assert.equal(ent.physicsBody, false, 'closed-form lane decoration must opt out of SG-02 bodies');
      assert.equal(shouldSyncPhysicsBodyEntity(ent), false,
        'a scripted lane hauler must not leave a fixed collider behind its moving visual');
    }

    // Acceptance item 9 — performance under expected traffic density.
    //
    // The invariant is BOUNDED, then CONSTANT: the roster warms up lazily as haulers travel into
    // range (which is the point of lazy spawning), and once saturated it never churns. Asserting
    // "constant from the first tick" would have been wrong — an earlier draft of this test did, and
    // it failed against correct code because two haulers were still approaching.
    const hardBound = 1 /* player */ + 20 /* BEACON_MAX_ACTIVE */ + 6 /* TRAFFIC_COUNT */;
    for (let i = 0; i < 4000; i++) {
      state.simTime += 1 / 60;
      sys.update(1 / 60, state);
      assert.ok(state.entities.size <= hardBound, `entity count broke its bound at tick ${i}`);
    }
    const saturated = state.entities.size;
    for (let i = 0; i < 4000; i++) { state.simTime += 1 / 60; sys.update(1 / 60, state); }
    assert.equal(state.entities.size, saturated, 'no spawn/despawn churn once the roster is warm');
    assert.equal(
      spawned.filter((e) => e.data && e.data.parentType === 'lane_traffic').length, 6,
      'the roster saturates at exactly its fixed size and never re-spawns',
    );
  });
});

test('traffic position is closed-form, so it survives save/load with nothing persisted', () => {
  // Acceptance item 8. The lane stores nothing: same simTime + same player position ⇒ same world.
  withFlag(true, () => {
    const a = makeState(onChord(4096));
    const hostA = makeHost(a);
    for (let i = 0; i < 100; i++) { a.simTime += 1 / 60; hostA.sys.update(1 / 60, a); }
    const trafficA = hostA.spawned.filter((e) => e.data.parentType === 'lane_traffic')
      .map((e) => ({ i: e.data.laneTrafficIndex, ...a.entities.get(e.id).pos }));

    // A "reload": a brand new system and state at the same clock and position, nothing carried over.
    const b = makeState(onChord(4096));
    b.simTime = a.simTime;
    const hostB = makeHost(b);
    hostB.sys.update(1 / 60, b);
    const trafficB = hostB.spawned.filter((e) => e.data.parentType === 'lane_traffic')
      .map((e) => ({ i: e.data.laneTrafficIndex, ...b.entities.get(e.id).pos }));

    assert.ok(trafficA.length > 0 && trafficB.length === trafficA.length);
    for (const rec of trafficB) {
      const match = trafficA.find((t) => t.i === rec.i);
      assert.ok(Math.abs(match.x - rec.x) < 1e-6 && Math.abs(match.z - rec.z) < 1e-6,
        `hauler ${rec.i} did not reproduce after reload`);
    }
  });
});

test('lane status reproduces exactly from position alone (save/load at every stage)', () => {
  withFlag(true, () => {
    const stages = [
      onChord(2048),                                        // transiting an intact segment
      GEOMETRY.segments.find((s) => s.disrupted).midpoint,   // dropped out at the dead segment
      GEOMETRY.beacons[GEOMETRY.beacons.length - 2].pos,     // recovered further along
    ];
    for (const pos of stages) {
      const first = makeState(pos);
      const h1 = makeHost(first);
      h1.sys.update(1 / 60, first);

      const reloaded = makeState(pos);
      const h2 = makeHost(reloaded);
      h2.sys.update(1 / 60, reloaded);

      assert.deepEqual(reloaded.travelLanes, first.travelLanes,
        `lane readout diverged after reload at ${JSON.stringify(pos)}`);
    }
  });
});

// ─── contracts, flag safety and determinism ───────────────────────────────────────────────────────

test('the lane publishes one stable contract for Atlas and Navigation consumers', () => {
  withFlag(true, () => {
    const state = makeState(onChord(2048));
    const { sys, bus } = makeHost(state);
    sys.update(1 / 60, state);
    const status = state.travelLanes;
    for (const key of ['schema', 'laneId', 'inLane', 'progress', 'segmentIndex', 'segmentCount',
      'segmentState', 'disrupted', 'boosted', 'driveState', 'beaconCount']) {
      assert.ok(key in status, `contract is missing ${key}`);
    }
    assert.equal(status.schema, 'travel_lane_v1');
    assert.equal(bus.of('nav:laneStatus').length, 1, 'published on entry');

    // Emitted on CHANGE, not per tick — a per-tick nav event would drown the trace.
    sys.update(1 / 60, state);
    sys.update(1 / 60, state);
    assert.equal(bus.of('nav:laneStatus').length, 1, 'no per-tick spam');

    const dead = GEOMETRY.segments.find((s) => s.disrupted);
    const player = state.entities.get(1);
    player.pos.x = dead.midpoint.x; player.pos.z = dead.midpoint.z;
    sys.update(1 / 60, state);
    assert.equal(bus.of('nav:laneStatus').length, 2, 'republished when the segment state changes');
  });
});

test('flag off is a strict no-op: no writes, no spawns, no events', () => {
  withFlag(false, () => {
    const state = makeState(onChord(2048));
    const { sys, bus, spawned } = makeHost(state);
    const before = JSON.stringify(state.input.travelDrive);
    for (let i = 0; i < 50; i++) sys.update(1 / 60, state);
    assert.equal(JSON.stringify(state.input.travelDrive), before, 'drive block untouched');
    assert.equal(state.travelLanes, undefined, 'no readout subtree created');
    assert.deepEqual(state.player, {}, 'no disruption field created');
    assert.equal(spawned.length, 0, 'nothing spawned');
    assert.equal(bus.events.length, 0, 'nothing emitted');
  });
});

test('the lane never writes player position or velocity — it is not a teleport', () => {
  withFlag(true, () => {
    const dead = GEOMETRY.segments.find((s) => s.disrupted);
    for (const pos of [onChord(2048), dead.midpoint, onChord(12000)]) {
      const state = makeState(pos);
      const { sys } = makeHost(state);
      const player = state.entities.get(1);
      const p0 = { ...player.pos };
      const v0 = { ...player.vel };
      for (let i = 0; i < 50; i++) { state.simTime += 1 / 60; sys.update(1 / 60, state); }
      assert.deepEqual(player.pos, p0, 'player position moved — D9.8 forbids warp-as-default');
      assert.deepEqual(player.vel, v0, 'player velocity written — the lane shapes the cap, nothing else');
    }
  });
});

test('the lane touches only the fields it declares it owns', () => {
  withFlag(true, () => {
    const state = makeState(onChord(2048));
    const { sys } = makeHost(state);
    sys.update(1 / 60, state);
    // `cap` is the carried ramp state of the input<->kernel round trip. A lane that wrote it would
    // be a second owner of the ramp and the drive would stutter.
    assert.equal(state.input.travelDrive.cap, 0, 'carried ramp state must not be written by the lane');
    assert.equal(state.input.travelDrive.state, 'engaged', 'latch state is the input owner\'s');
  });
});

test('identical inputs produce byte-identical output (replay determinism)', () => {
  // Behavioural, deliberately NOT a source grep for Math.random/Date.now. An earlier draft of this
  // test did grep the source and FAILED — by matching the words "Math.random" inside this file's own
  // header comment explaining that it uses neither. That is the ledger's G-4 defect class in
  // miniature: a source-text assertion reports on prose rather than on behaviour. Replaying the
  // system and comparing results proves the actual property and cannot be fooled by a comment.
  const replay = () => {
    const state = makeState(onChord(2048));
    const { sys, bus, spawned } = makeHost(state);
    const frames = [];
    for (let i = 0; i < 300; i++) {
      state.simTime += 1 / 60;
      sys.update(1 / 60, state);
      frames.push(JSON.stringify(state.travelLanes));
    }
    return {
      frames,
      drive: JSON.stringify(state.input.travelDrive),
      spawns: spawned.map((e) => `${e.type}@${e.pos.x.toFixed(6)},${e.pos.z.toFixed(6)}`),
      events: bus.events.map((e) => e.name),
    };
  };
  const a = replay();
  const b = replay();
  assert.deepEqual(b.frames, a.frames, 'per-tick readout diverged between identical runs');
  assert.equal(b.drive, a.drive, 'drive modifier diverged between identical runs');
  assert.deepEqual(b.spawns, a.spawns, 'spawn positions diverged between identical runs');
  assert.deepEqual(b.events, a.events, 'event sequence diverged between identical runs');
});
