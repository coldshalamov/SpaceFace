// PB-HAND-A / SF-012 — swept-hull advisory for hand-flown slides.
//
// The packet: warn the pilot where a commanded combat slide will carry the hull, WITHOUT
// steering — "publish untargeted telemetry", advisory not autopilot. This suite drives the real
// owners (dead-player-flight-step harness style: flightV3.update on the rapier-dynamic backend)
// and pins the named behavior:
//   * a slide that sweeps along a hull produces the `flight:sweptHull` advisory with HONEST
//     geometry (closed-form contact time, surface gap, slide context), edge-latched so a held
//     face is not a per-tick alarm;
//   * normal flight (clear sky, flying away, NPC craft, menu-gated pilot) produces none;
//   * the advisory never touches the physics command — the same tick with and without a
//     contact commands byte-identical force/torque, because it only reports.

import test from 'node:test';
import assert from 'node:assert/strict';

import { computeSweptHullAdvisory, SWEPT_HULL_DEFAULTS } from '../src/core/flight/flightTelemetry.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';

const DT = 1 / 60;

// Known envelope so `canStopBeforeContact` is exact: a pure lateral stop at rot 0 is pure
// strafe authority (stop direction is straight down the right axis). The crippled helm makes
// flip-and-burn strictly worse than the direct stop, so stopDistanceWU pins to the direct
// solution (100 WU at 60 WU/s, 400 WU at 120) instead of whichever mode happened to win.
const PROFILE = {
  family: 'reaction', mainAccel: 40, reverseAccel: 22, strafeAccel: 18,
  maxYawRate: 0.5, yawAccel: 1,
};

function hull(overrides = {}) {
  return {
    id: 'h',
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 60 },          // starboard combat slide at rot 0
    rot: 0,
    angVel: 0,
    radius: 6,
    ...overrides,
  };
}

function rock(overrides = {}) {
  return {
    id: 'r',
    type: 'asteroid',
    alive: true,
    pos: { x: 0, z: 140 },
    vel: { x: 0, z: 0 },
    radius: 20,
    ...overrides,
  };
}

// ---- pure geometry (flightTelemetry owns the math) ---------------------------------------------

test('slide sweeping a hull ahead warns with closed-form contact geometry', () => {
  // Surface gap 140 - (6 + 20) = 114 WU at 60 WU/s -> contact in exactly 1.9 s, inside the 3 s
  // horizon. Lateral stop at rot 0 is pure strafe: 60^2 / (2*18) = 100 WU < 114 -> stoppable.
  const advisory = computeSweptHullAdvisory(hull(), PROFILE, [rock({ pos: { x: 0, z: 140 } })]);
  assert.equal(advisory.active, true);
  assert.equal(advisory.sliding, true, '60 WU/s pure lateral is unambiguously a slide');
  assert.equal(advisory.contactId, 'r');
  assert.equal(advisory.contactType, 'asteroid');
  assert.ok(Math.abs(advisory.timeToContactS - 1.9) < 1e-12, `contact time 1.9, got ${advisory.timeToContactS}`);
  assert.ok(Math.abs(advisory.contactDistance - 114) < 1e-12, 'surface gap is centers minus both radii');
  assert.ok(Math.abs(advisory.driftAngle - Math.PI / 2) < 1e-12, 'pure starboard slide drifts 90 degrees');
  assert.equal(advisory.canStopBeforeContact, true);
  assert.ok(Math.abs(advisory.stopDistanceWU - 100) < 1e-12, 'stop solution uses the real strafe envelope');
  assert.deepEqual(advisory.contactPoint, { x: 0, z: 140 }, 'static obstruction sits at its own position');
});

test('the same slide too fast to stop reports canStopBeforeContact false', () => {
  // 120 WU/s slide, same 114 WU gap: 120^2 / 36 = 400 WU of stop needed > 114 -> honest "no".
  const advisory = computeSweptHullAdvisory(hull({ vel: { x: 0, z: 120 } }), PROFILE, [rock()]);
  assert.equal(advisory.active, true);
  assert.equal(advisory.canStopBeforeContact, false);
  assert.ok(Math.abs(advisory.stopDistanceWU - 400) < 1e-12);
});

test('a parallel slide ALONG a hull warns without inventing a contact time', () => {
  // Rock 30 WU off the travel line: sumR 26 -> closest surface gap 4 WU (inside the 12 WU graze
  // band) but the rays never intersect. This is the slide-along-the-wall case the packet names.
  const advisory = computeSweptHullAdvisory(hull(), PROFILE, [rock({ pos: { x: 30, z: 120 } })]);
  assert.equal(advisory.active, true);
  assert.equal(advisory.timeToContactS, null, 'no intersection means no contact time, not zero');
  assert.ok(Math.abs(advisory.closestGapWU - 4) < 1e-12);
  assert.ok(Math.abs(advisory.closestTimeS - 2) < 1e-12, 'abeam at 120 WU / 60 WU/s = 2 s');
  assert.equal(advisory.canStopBeforeContact, true, 'no predicted contact: nothing to stop before');
});

test('flying away from the same hull never warns — behind-vector contacts are filtered', () => {
  const advisory = computeSweptHullAdvisory(hull({ vel: { x: 0, z: -60 } }), PROFILE, [rock()]);
  assert.equal(advisory.active, false);
  assert.equal(advisory.contactId, null);
});

test('the earliest meaningful obstruction wins, and hits outrank grazers', () => {
  const near = rock({ id: 'near', pos: { x: 0, z: 86 } });   // contact at 1.0 s
  const far = rock({ id: 'far', pos: { x: 0, z: 206 } });    // contact at 3.0 s (horizon edge)
  const behind = rock({ id: 'behind', pos: { x: 0, z: -90 } });
  const advisory = computeSweptHullAdvisory(hull(), PROFILE, [far, behind, near]);
  assert.equal(advisory.contactId, 'near');
  assert.ok(Math.abs(advisory.timeToContactS - 1) < 1e-12);

  // A grazer very close by must not beat a real hit further out: hits rank by contact time.
  const grazer = rock({ id: 'grazer', pos: { x: 30, z: 60 } });      // gap 4 WU, no intersection
  const headOn = rock({ id: 'headon', pos: { x: 0, z: 146 } });      // contact at 2.0 s
  const pickHit = computeSweptHullAdvisory(hull(), PROFILE, [grazer, headOn]);
  assert.equal(pickHit.contactId, 'headon');
  assert.equal(pickHit.timeToContactS, 2);
});

test('already-overlapping geometry reports contact now, and clear sky stays silent', () => {
  const overlapping = computeSweptHullAdvisory(hull(), PROFILE, [rock({ pos: { x: 0, z: 10 } })]);
  assert.equal(overlapping.active, true);
  assert.equal(overlapping.timeToContactS, 0, 'hull surfaces already inside each other: contact is now');

  const clear = computeSweptHullAdvisory(hull(), PROFILE, []);
  assert.equal(clear.active, false);
  assert.equal(clear.contactPoint, null);
  assert.equal(clear.horizonS, undefined, 'the advisory is data, not options echo');
});

// ---- live flightV3 publication -----------------------------------------------------------------

function makeState({ player, entityList, ui }) {
  return {
    playerId: player.id,
    mode: 'flight',
    tick: 0,
    simTime: 0,
    entities: new Map(entityList.map((e) => [e.id, e])),
    entityList,
    settings: { gameplay: { physicsBackend: 'rapier-dynamic' } },
    input: { moveX: 0, moveZ: 0, turnIntent: 0, boost: false, brake: false, actions: {} },
    ui: ui || { screenStack: [] },
    player: {},
  };
}

function makeSystem(state, emissions) {
  const sys = Object.create(flightV3);
  sys.state = state;
  sys.bus = {
    emit(type, payload) { emissions.push({ type, payload }); },
    on() { return () => {}; },
  };
  sys._diag = {};
  sys._warnedBackend = true;
  return sys;
}

function runTicks(sys, state, ticks) {
  for (let i = 0; i < ticks; i++) {
    state.simTime += DT;
    state.tick += 1;
    sys.update(DT, state);
  }
}

test('a hand-flown slide sweeping a hull publishes exactly the advisory, edge-latched, honest', () => {
  const player = hull({ id: 'p', flags: { docked: false, boosting: false } });
  const asteroid = rock({ id: 'r', pos: { x: 0, z: 146 } });   // gap 120 WU -> contact at 2.0 s
  const state = makeState({ player, entityList: [player, asteroid] });
  const emissions = [];
  const sys = makeSystem(state, emissions);

  runTicks(sys, state, 44);   // 44 ticks = 0.733 s: one activation edge, cooldown not yet reached
  const swept = emissions.filter((e) => e.type === 'flight:sweptHull');
  assert.equal(swept.length, 1, `activation edge emits once, not per tick (got ${swept.length})`);

  const payload = swept[0].payload;
  assert.equal(payload.shipId, 'p');
  assert.equal(payload.active, true);
  assert.equal(payload.sliding, true);
  assert.equal(payload.contactId, 'r');
  assert.equal(payload.contactType, 'asteroid');
  assert.equal(payload.timeToContactS, 2, 'gap 120 at 60 WU/s is exactly 2.000 s');
  assert.equal(payload.contactDistance, 120);
  assert.equal(payload.canStopBeforeContact, true);
  assert.ok(Math.abs(payload.driftAngle - Math.PI / 2) < 1e-12);

  // The bounded advisory state rides the player frame each tick for poll consumers (HUD), the
  // same seam autopilot/orbitAssist telemetry already uses.
  assert.equal(player._flightFrame.sweptHull.active, true);
  assert.equal(player._flightFrame.sweptHull.timeToContactS, 2);

  // Held face: re-emits only after the simTime cooldown (0.75 s), so tick 45 fires exactly once.
  runTicks(sys, state, 2);
  assert.equal(emissions.filter((e) => e.type === 'flight:sweptHull').length, 2,
    'held advisory re-emits on the cooldown, never per tick');
});

test('normal flight — clear sky — publishes no advisory and reports an inactive one', () => {
  const player = hull({ id: 'p', flags: { docked: false, boosting: false } });
  const state = makeState({ player, entityList: [player] });
  const emissions = [];
  const sys = makeSystem(state, emissions);

  runTicks(sys, state, 30);
  assert.equal(emissions.filter((e) => e.type === 'flight:sweptHull').length, 0);
  assert.equal(player._flightFrame.sweptHull.active, false);
  assert.equal(player._flightFrame.sweptHull.sliding, true, 'slide context is still honest telemetry');
});

test('the advisory is published, not steered: physics commands are identical with and without the hull', () => {
  const buildAndRun = (rockPos) => {
    const player = hull({ id: 'p', flags: { docked: false, boosting: false } });
    const asteroid = rockPos ? rock({ id: 'r', pos: rockPos }) : null;
    const state = makeState({ player, entityList: asteroid ? [player, asteroid] : [player] });
    const sys = makeSystem(state, []);
    const commands = [];
    for (let i = 0; i < 10; i++) {
      state.simTime += DT;
      state.tick += 1;
      sys.update(DT, state);
      const command = consumePhysicsCommand(player);
      commands.push(command && command.control ? {
        mode: command.control.mode,
        force: { ...command.control.force },
        torque: { ...command.control.torque },
        authority: { ...command.control.authority },
        maxSpeed: command.control.maxSpeed,
        source: command.control.source,
      } : null);
    }
    return commands;
  };

  const withRock = buildAndRun({ x: 0, z: 146 });
  const withoutRock = buildAndRun(null);
  assert.deepEqual(withRock, withoutRock,
    'the same slide must command the same physics whether or not an advisory fired');
});

test('gates: a menu-gated pilot and NPC craft never publish; the player is the only subject', () => {
  // Controls blocked (menu open): the pilot cannot act on a warning, so none is published.
  const parkedPlayer = hull({ id: 'p', flags: { docked: false, boosting: false } });
  const asteroid = rock({ id: 'r', pos: { x: 0, z: 146 } });
  const menuState = makeState({
    player: parkedPlayer,
    entityList: [parkedPlayer, asteroid],
    ui: { screenStack: ['inventory'] },
  });
  const menuEmissions = [];
  runTicks(makeSystem(menuState, menuEmissions), menuState, 10);
  assert.equal(menuEmissions.filter((e) => e.type === 'flight:sweptHull').length, 0,
    'no advisory while controls are blocked');

  // NPC-only motion (player docked): the advisory is hand-flight instrumentation, never AI.
  const dockedPlayer = hull({ id: 'p', flags: { docked: true, boosting: false }, vel: { x: 0, z: 0 } });
  const npc = hull({
    id: 'npc',
    flags: { docked: false, boosting: false },
    data: { intent: { moveX: 0, moveZ: 0, turnIntent: 0 } },
  });
  const npcState = makeState({ player: dockedPlayer, entityList: [dockedPlayer, npc, asteroid] });
  const npcEmissions = [];
  runTicks(makeSystem(npcState, npcEmissions), npcState, 10);
  assert.equal(npcEmissions.filter((e) => e.type === 'flight:sweptHull').length, 0,
    'NPCs never publish the swept-hull advisory');
});

test('defaults are the published tuning, and the horizon bounds the advisory', () => {
  assert.equal(SWEPT_HULL_DEFAULTS.horizonS, 3);
  assert.equal(SWEPT_HULL_DEFAULTS.grazeGapWU, 12);
  assert.equal(SWEPT_HULL_DEFAULTS.slideMinLateralWU, 6);
  // Same geometry as the first test but a 1 s horizon: contact at 1.9 s is outside it.
  const advisory = computeSweptHullAdvisory(hull(), PROFILE, [rock()], { horizonS: 1 });
  assert.equal(advisory.active, false);
});
