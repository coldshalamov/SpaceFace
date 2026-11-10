// SFQ-B013 — a gravity-well fling, a concussion shove, an aft-dropped charge, and a hard
// bounce are earned speed. Assist and boost must not spend them. An ordinary above-cap
// coast with no launch tag still settles. Seed 4242. Fixed step 1/60, measured at 1 s.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { mulberry32 } from '../src/core/rng.js';
import { PROPULSION_PROFILES } from '../src/core/flight/propulsionCatalog.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { COLLISION_CONSEQUENCE_LIMITS, recordImpulseProvenance } from '../src/combat/impulseKernel.js';
import { flightV3 } from '../src/systems/flightV3.js';

const DT = 1 / 60;
const TICKS = 60;
const SEED = 4242;
// Reaction-S cruise is 210; boost raises that cap to 336. 270 sits above cruise, so hands-off
// assist has already let go, and below the boost cap, so holding boost brings the full settle
// back. That is the brake the earned-momentum tag is there to ease.
const LAUNCH_SPEED = 270;
const PLAYER_ID = 1;

const bus = createBus();
const state = {
  seed: SEED,
  rng: mulberry32(SEED),
  mode: 'flight',
  tick: 0,
  simTime: 0,
  playerId: PLAYER_ID,
  player: {},
  entities: new Map(),
  entityList: [],
  input: { moveX: 0, moveZ: 0, boost: true, brake: false, turnIntent: 0 },
  settings: {
    controls: { flightMode: 'assisted' },
    gameplay: { physicsBackend: 'rapier-dynamic' },
  },
};

flightV3.init({ state, bus });

function makePlayer() {
  return {
    id: PLAYER_ID,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: LAUNCH_SPEED, z: 0 },
    rot: 0,
    angVel: 0,
    mass: 18,
    radius: 8,
    flags: {},
    data: {},
    physicsBody: { mass: 18 },
    propulsion: PROPULSION_PROFILES.drive_reaction_s,
    boost: {
      energy: 800,
      max: 800,
      drainRate: 40,
      regenRate: 0,
      dashImpulse: 0,
      dashCost: 0,
      dashCd: 3,
      dashCdT: 0,
    },
  };
}

function speedOf(player) {
  return Math.hypot(player.vel.x, player.vel.z);
}

// One second of the live flight owner. The force it writes is what the physics step would
// integrate; this applies that force and nothing else.
function coastOneSecond(player, signal) {
  state.entities.set(PLAYER_ID, player);
  state.entityList[0] = player;
  state.playerId = PLAYER_ID;
  player.vel.x = LAUNCH_SPEED;
  player.vel.z = 0;
  player.pos.x = 0;
  player.pos.z = 0;
  player.rot = 0;
  if (signal) signal(player);
  for (let i = 0; i < TICKS; i += 1) {
    flightV3.update(DT, state);
    const command = consumePhysicsCommand(player);
    const force = command && command.control && command.control.force;
    assert.ok(force, 'flight must command the hull');
    const mass = player.physicsBody.mass;
    player.vel.x += (force.x / mass) * DT;
    player.vel.z += (force.z / mass) * DT;
    player.pos.x += player.vel.x * DT;
    player.pos.z += player.vel.z * DT;
    state.simTime += DT;
    state.tick += 1;
  }
  return speedOf(player);
}

function freshClock() {
  state.simTime += 10;
  state.tick = Math.round(state.simTime / DT);
}

test('ordinary above-cap speed with no launch tag still settles under boost', () => {
  freshClock();
  const settled = coastOneSecond(makePlayer(), null);
  assert.ok(settled < LAUNCH_SPEED - 12,
    `hands-off boost still brakes untagged overspeed (start ${LAUNCH_SPEED}, after 1s ${settled.toFixed(2)})`);
});

test('a gravity-well fling keeps the speed boost would have braked', () => {
  freshClock();
  const quiet = coastOneSecond(makePlayer(), null);
  freshClock();
  const kept = coastOneSecond(makePlayer(), () => {
    bus.emit('well:fling', {
      schemaVersion: 1,
      actorId: 4,
      wellId: 'field_well_1',
      sourceId: 'field_well_1',
      targetId: PLAYER_ID,
      victimId: PLAYER_ID,
      primed: true,
      tick: state.tick,
    });
  });
  assert.ok(kept > quiet + 10,
    `well fling after 1s should outrun the untagged settle (kept ${kept.toFixed(2)}, braked ${quiet.toFixed(2)})`);
  assert.ok(kept < LAUNCH_SPEED,
    `the tag eases the brake, it does not add speed (kept ${kept.toFixed(2)})`);
});

test('a concussion shove keeps the speed boost would have braked', () => {
  freshClock();
  const quiet = coastOneSecond(makePlayer(), (player) => {
    recordImpulseProvenance(player, {
      tag: 'starter_pulse_plink',
      actorId: 9,
      weaponId: 'wpn_pulse_s',
      appliedTick: state.tick,
      magnitude: 84,
    });
  });
  freshClock();
  const kept = coastOneSecond(makePlayer(), (player) => {
    recordImpulseProvenance(player, {
      tag: 'concussion_slug',
      actorId: 9,
      weaponId: 'wpn_concussion_cannon_m',
      appliedTick: state.tick,
      magnitude: 920,
    });
  });
  assert.ok(quiet < LAUNCH_SPEED - 12,
    `a pulse plink is not a launch; boost still settles it (after 1s ${quiet.toFixed(2)})`);
  assert.ok(kept > quiet + 10,
    `concussion shove after 1s should outrun the untagged settle (kept ${kept.toFixed(2)}, braked ${quiet.toFixed(2)})`);
});

test('an aft-dropped charge keeps the speed boost would have braked', () => {
  freshClock();
  const quiet = coastOneSecond(makePlayer(), () => {
    bus.emit('charge:detonated', {
      pos: { x: 0, z: 0 },
      hits: [99],
      radius: 40,
      shoves: [],
      ownerId: PLAYER_ID,
      trigger: 'manual',
      hostId: null,
    });
  });
  freshClock();
  const kept = coastOneSecond(makePlayer(), () => {
    bus.emit('charge:detonated', {
      pos: { x: -12, z: 0 },
      hits: [PLAYER_ID],
      radius: 40,
      shoves: [],
      ownerId: PLAYER_ID,
      trigger: 'manual',
      hostId: null,
    });
  });
  assert.ok(quiet < LAUNCH_SPEED - 12,
    `a charge that misses the hull is not a launch (after 1s ${quiet.toFixed(2)})`);
  assert.ok(kept > quiet + 10,
    `aft-drop shove after 1s should outrun the untagged settle (kept ${kept.toFixed(2)}, braked ${quiet.toFixed(2)})`);
});

test('a gravity well pull on the hull keeps the speed boost would have braked', () => {
  freshClock();
  const kept = coastOneSecond(makePlayer(), (player) => {
    recordImpulseProvenance(player, {
      tag: 'field_well',
      actorId: 4,
      weaponId: 'field_well_1',
      appliedTick: state.tick,
      magnitude: 400,
    });
  });
  freshClock();
  const quiet = coastOneSecond(makePlayer(), null);
  assert.ok(kept > quiet + 10,
    `well pull after 1s should outrun the untagged settle (kept ${kept.toFixed(2)}, braked ${quiet.toFixed(2)})`);
});

test('a hard bounce keeps the speed boost would have braked', () => {
  freshClock();
  // Above the soft-damage line, below the slam line: it is not a hard bounce.
  const scrape = COLLISION_CONSEQUENCE_LIMITS.damageDeltaV + 1;
  const hard = COLLISION_CONSEQUENCE_LIMITS.tumbleDeltaV + 14;
  const quiet = coastOneSecond(makePlayer(), () => {
    bus.emit('physics:impact', {
      playerInvolved: true,
      preSolveClosingSpeed: scrape,
      aId: PLAYER_ID,
      bId: 3,
      tick: state.tick,
    });
  });
  freshClock();
  const kept = coastOneSecond(makePlayer(), () => {
    bus.emit('physics:impact', {
      playerInvolved: true,
      preSolveClosingSpeed: hard,
      aId: PLAYER_ID,
      bId: 3,
      tick: state.tick,
    });
  });
  assert.ok(quiet < LAUNCH_SPEED - 12,
    `a soft scrape is not a hard bounce (closing ${scrape}, after 1s ${quiet.toFixed(2)})`);
  assert.ok(kept > quiet + 10,
    `hard bounce after 1s should outrun the untagged settle (kept ${kept.toFixed(2)}, braked ${quiet.toFixed(2)})`);
});

test('a well fling aimed at someone else does not protect the player', () => {
  freshClock();
  const quiet = coastOneSecond(makePlayer(), null);
  freshClock();
  const other = coastOneSecond(makePlayer(), () => {
    bus.emit('well:fling', {
      schemaVersion: 1,
      actorId: 4,
      wellId: 'field_well_1',
      sourceId: 'field_well_1',
      targetId: 44,
      victimId: 44,
      primed: true,
      tick: state.tick,
    });
  });
  assert.ok(Math.abs(other - quiet) < 0.05,
    `another hull's fling must leave the player's settle alone (other ${other.toFixed(2)}, quiet ${quiet.toFixed(2)})`);
});
