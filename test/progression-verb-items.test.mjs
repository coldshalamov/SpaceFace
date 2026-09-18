// Focused proof for the six progression-vertical verb items. Each test asserts the VERB —
// a capability the fit gains and a state change the sim actually makes — not a percentage:
//
//   SWING DRIVE        a dash through a taut line leaves along the line's tangent, uprated,
//                      and publishes ship:swingDash; without the module the dash is straight.
//   MASS FLAIL RIG     a player contact while towing a real load carries tow_flail provenance
//                      and a mass-scaled multiplier; without a live tow the ram path is null.
//   POINT-DEFENSE      a fitted servo kills the nearest hostile projectile in its ring on
//                      cooldown and publishes pds:intercept; own-side rounds are never taken.
//   DECOY BUOY         the deploy re-baits a missile that was NOT aimed at the broadcaster —
//                      chaff only diverts missiles targeting you; the buoy eats any seeker.
//   LOOT MAGNET        free salvage inside derived.lootMagnetRange is pulled toward the hull
//                      through physics authority, custody untouched, one capture event per pod.
//   GRAVITY WELLHEAD   the deploy spawns a gravity_well whose armed life drags ships inward
//                      through physics authority (reason 'gravity_well') until it expires.
import assert from 'node:assert/strict';
import test from 'node:test';

import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { applyFeatureConfigToMaps, PRODUCTION_FEATURES } from '../src/data/featureFlags.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { countermeasures } from '../src/systems/countermeasures.js';
import { collisionConsequences, playerRamPlateImpact } from '../src/systems/collisionConsequences.js';
import { lootShards, LOOT_MAGNET_ACCEL } from '../src/systems/lootShards.js';
import { weapons } from '../src/systems/weapons.js';
import { WEAPONS } from '../src/data/weapons.js';

const DT = 1 / 60;

// The deployable verbs (mine/well tick, PDS pass) gate on production feature flags that the real
// runtime applies inside its step window; a bare node process reads the OFF defaults.
applyFeatureConfigToMaps(PRODUCTION_FEATURES);

function recordingBus() {
  const events = [];
  return {
    events,
    emit(type, payload) { events.push({ type, payload }); },
    on(type, fn) { (this._sub ||= new Map()).set(type, fn); },
    off() {},
  };
}

// --- SWING DRIVE -----------------------------------------------------------------------------

function dashRig(swingDrive) {
  const bus = recordingBus();
  const anchor = { id: 2, pos: { x: 0, z: 0 } };
  const player = {
    id: 1,
    rot: 0,                       // facing +x
    pos: { x: 110, z: 0 },        // 110 WU out on the line
    vel: { x: 0, z: 50 },         // already moving +z: the tangent the swing follows
    mass: 100,
    flags: {},
    boost: { energy: 100, max: 100, regenRate: 18, drainRate: 40, dashImpulse: 120, dashCost: 28, dashCooldown: 3 },
    data: { derived: { swingDrive } },
  };
  const state = {
    simTime: 0,
    tick: 0,
    player: { tether: { active: true, targetId: 2 } },
    entities: new Map([[anchor.id, anchor]]),
    ui: null,
  };
  const system = Object.create(flightV3);
  system.bus = bus;
  return { system, player, state, bus };
}

test('swing drive: a dash on a taut line leaves along the tangent, uprated, and announces itself', () => {
  const { system, player, state, bus } = dashRig(true);
  const fired = system._triggerDash(player, player.boost, state);
  assert.equal(fired, true, 'the dash fires');
  const command = consumePhysicsCommand(player);
  assert.equal(command.impulses.length, 1);
  const impulse = command.impulses[0];
  // Tangent around an anchor at the origin from (110, 0) with +z momentum is (0, 1): the whole
  // impulse goes ACROSS the radius, none of it out along the facing (+x).
  assert.ok(Math.abs(impulse.x) < 1e-6, `no radial impulse (x=${impulse.x})`);
  assert.ok(impulse.z > 0, `impulse follows the +z tangent (z=${impulse.z})`);
  // Uprate: 120 * SWING_DRIVE_GAIN(1.35), mass-scaled to delta-v 120 * 1.35 on mass 100.
  assert.ok(Math.abs(Math.hypot(impulse.x, impulse.z) - 100 * 120 * 1.35) < 1e-3,
    `impulse magnitude is the uprated dash (${Math.hypot(impulse.x, impulse.z)})`);
  const kinds = bus.events.map((event) => event.type);
  assert.ok(kinds.includes('ship:swingDash'), 'ship:swingDash published');
  assert.ok(kinds.includes('ship:dash'), 'the ordinary dash event still publishes');
});

test('swing drive: without the module the same press is the ordinary straight dash', () => {
  const { system, player, state, bus } = dashRig(false);
  const fired = system._triggerDash(player, player.boost, state);
  assert.equal(fired, true);
  const command = consumePhysicsCommand(player);
  const impulse = command.impulses[0];
  assert.ok(impulse.x > 0, 'along the facing (+x)');
  assert.ok(Math.abs(impulse.z) < 1e-6, 'no sideways component');
  assert.equal(bus.events.some((event) => event.type === 'ship:swingDash'), false, 'no swing event');
});

// --- MASS FLAIL RIG --------------------------------------------------------------------------

test('mass flail: a contact while towing a heavy load strikes with the load, tow_flail provenance', () => {
  const state = {
    player: { tether: { active: true, targetId: 9 } },
    entities: new Map([[9, { id: 9, alive: true, mass: 500 }]]),
  };
  const player = { id: 1, data: { derived: { towFlail: true } } };
  const provenance = { actorId: 1, tag: 'direct_contact', appliedTick: 10 };
  const receipt = playerRamPlateImpact(player, 1, 10, provenance, state);
  assert.ok(receipt, 'the flail strike is recognized');
  assert.equal(receipt.provenance.tag, 'tow_flail');
  assert.equal(receipt.provenance.weaponId, 'mod_mass_flail_rig');
  // 500 t towed: 1 + (500 - 100) / 400 = 2.0x strike.
  assert.ok(Math.abs(receipt.damageMultiplier - 2) < 1e-9, `multiplier scales with the load (${receipt.damageMultiplier})`);
});

test('mass flail: no live tow, no flail — and the ram plate keeps its own law', () => {
  const bareState = { player: { tether: { active: false, targetId: null } }, entities: new Map() };
  const flail = { id: 1, data: { derived: { towFlail: true } } };
  const provenance = { actorId: 1, tag: 'direct_contact', appliedTick: 10 };
  assert.equal(playerRamPlateImpact(flail, 1, 10, provenance, bareState), null,
    'towing nothing is just a bump');
  const rammer = { id: 1, data: { derived: { ramDamageDealtMult: 1.8 } } };
  const ram = playerRamPlateImpact(rammer, 1, 10, provenance, bareState);
  assert.equal(ram.provenance.tag, 'ram_plate', 'the ram plate path is untouched');
  assert.ok(Math.abs(ram.damageMultiplier - 1.8) < 1e-9);
});

// --- POINT-DEFENSE SERVO ---------------------------------------------------------------------

function cmRig(fittings) {
  const bus = recordingBus();
  const ship = {
    id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 },
    data: { fittings },
  };
  const state = {
    mode: 'flight',
    tick: 0,
    simTime: 0,
    playerId: 1,
    player: {},
    input: {},
    entities: new Map([[1, ship]]),
    entityList: [ship],
    rng: () => 0.1,
  };
  const system = Object.create(countermeasures);
  system.init({ state, bus, helpers: {} });
  return { system, ship, state, bus };
}

test('point-defense servo: kills the nearest hostile projectile in the ring, once per cooldown', () => {
  const { system, ship, state, bus } = cmRig(['mod_pds_servo_s']);
  const missile = { id: 77, type: 'projectile', alive: true, pos: { x: 200, z: 0 }, ownerId: 9, team: 1, data: { kind: 'missile' } };
  const slug = { id: 78, type: 'projectile', alive: true, pos: { x: 120, z: 0 }, ownerId: 9, team: 1, data: {} };
  state.entityList.push(missile, slug);
  system.update(DT, state);
  assert.equal(missile.alive, false, 'the missile (nearest by class) dies at the ring');
  assert.equal(slug.alive, true, 'one intercept per cooldown');
  assert.ok(bus.events.some((event) => event.type === 'pds:intercept' && event.payload.projectileId === 77));
  // On cooldown nothing else dies; after the cooldown the next shot is taken.
  system.update(DT, state);
  assert.equal(slug.alive, true, 'no second intercept while the servo cycles');
  ship.data.pds.cooldownT = 0;
  system.update(DT, state);
  assert.equal(slug.alive, false, 'the servo re-arms and takes the next shot');
});

test('point-defense servo: own-side rounds are never intercepted', () => {
  const { system, ship, state } = cmRig(['mod_pds_servo_s']);
  const friendly = { id: 79, type: 'projectile', alive: true, pos: { x: 50, z: 0 }, ownerId: 2, team: 0, data: {} };
  state.entityList.push(friendly);
  system.update(DT, state);
  assert.equal(friendly.alive, true);
  assert.equal(ship.data.pds.cooldownT, 0, 'the servo never even cycled');
});

// --- DECOY BUOY ------------------------------------------------------------------------------

test('decoy buoy: re-baits a seeker that was never aimed at the broadcaster', () => {
  const { system, ship, state, bus } = cmRig(['mod_decoy_buoy_s']);
  state.input.deployCountermeasure = true;
  system.update(DT, state);
  const deployed = bus.events.find((event) => event.type === 'countermeasure:deployed');
  assert.ok(deployed, 'the deploy publishes');
  assert.equal(deployed.payload.kind, 'decoy');
  // A missile chasing some OTHER ship crosses the buoy's water — the buoy takes it.
  const seeker = { id: 90, type: 'projectile', alive: true, pos: { x: 100, z: 0 }, ownerId: 9, team: 1, data: { kind: 'missile', targetId: 42 } };
  state.entityList.push(seeker);
  state.input.deployCountermeasure = false;
  system.update(DT, state);
  assert.equal(seeker.data.targetId, ship.data.cm.effect.decoyId, 'the seeker re-attacks the buoy');
  assert.equal(seeker.data.diverted, true);
});

// --- LOOT MAGNET -----------------------------------------------------------------------------

function lootRig(derived) {
  const bus = recordingBus();
  const pulls = [];
  const player = {
    id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 },
    data: { derived },
  };
  const pod = {
    id: 55, type: 'payload', alive: true, pos: { x: 300, z: 0 }, mass: 20,
    data: { payloadType: 'jettisoned_cargo' },
  };
  const state = {
    mode: 'flight',
    tick: 100,
    playerId: 1,
    player: {},
    entities: new Map([[1, player]]),
    entityList: [player, pod],
  };
  const helpers = {
    combatPhysics: {
      applyImpulse(record) { pulls.push(record); return true; },
    },
  };
  const system = Object.create(lootShards);
  system.init({ state, bus, helpers });
  return { system, state, pulls, pod, bus };
}

test('loot magnet: free salvage inside the ring drifts to the hull, custody untouched', () => {
  const { system, state, pulls, pod, bus } = lootRig({ lootMagnetRange: 420 });
  system.update(DT, state);
  assert.equal(pulls.length, 1, 'one pull this tick');
  assert.equal(pulls[0].reason, 'loot_magnet');
  assert.ok(pulls[0].impulse.x < 0, 'the pull is toward the hull at the origin');
  // Bounded law: accel 26 at ring centre scaled by (1 - 300/420), times mass 20, times dt.
  const expected = 20 * LOOT_MAGNET_ACCEL * (1 - 300 / 420) * DT;
  assert.ok(Math.abs(pulls[0].impulse.x + expected) < 1e-9, `the pull follows the published law (${pulls[0].impulse.x} vs -${expected})`);
  assert.ok(bus.events.some((event) => event.type === 'loot:magnetCaptured'), 'the capture is announced');
  system.update(DT, state);
  const captures = bus.events.filter((event) => event.type === 'loot:magnetCaptured');
  assert.equal(captures.length, 1, 'one capture event per ring entry, not per tick');
  assert.equal(pod.data.caughtByNet, undefined, 'custody is not granted here');
});

test('loot magnet: outside the ring nothing is pulled', () => {
  const { system, state, pulls } = lootRig({ lootMagnetRange: 200 });
  system.update(DT, state);
  assert.equal(pulls.length, 0);
});

// --- GRAVITY WELLHEAD ------------------------------------------------------------------------

function wellRig() {
  const bus = recordingBus();
  const spawned = [];
  const pulls = [];
  const ship = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, data: { fittings: [] } };
  const victim = { id: 20, type: 'ship', alive: true, pos: { x: 150, z: 0 }, mass: 80, data: {} };
  const state = {
    mode: 'flight',
    tick: 10,
    simTime: 5,
    playerId: 1,
    player: {},
    input: {},
    entities: new Map([[1, ship], [20, victim]]),
    entityList: [ship, victim],
  };
  const system = Object.create(weapons);
  system.bus = bus;
  system.helpers = {
    spawnEntity(spec) { spawned.push(spec); return { id: 5, type: 'vectormine', alive: true, pos: spec.pos, data: spec.data }; },
    combatPhysics: { applyImpulse(record) { pulls.push(record); return true; } },
    getEntity() { return null; },
  };
  return { system, state, spawned, pulls, victim, bus };
}

test('gravity wellhead: the deploy arms a well whose armed life drags ships inward', () => {
  const { system, state, spawned, pulls, victim } = wellRig();
  const def = WEAPONS.find((row) => row.id === 'wpn_gravity_well_m');
  assert.ok(def, 'the wellhead is catalog gear');
  const w = { defId: 'wpn_gravity_well_m', slotIndex: 0 };
  system._spawnVectorMine(state.entities.get(1), w, def, state);
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].data.kind, 'gravity_well', 'the well payload is authored, not a mine');
  assert.equal(spawned[0].data.kind === 'gravity_well', true);
  const mine = { id: 5, type: 'vectormine', alive: true, pos: { x: spawned[0].pos.x, z: spawned[0].pos.z }, data: spawned[0].data };
  state.entityList.push(mine);
  // Not armed yet: no pull.
  system._tickVectorMines(DT, state);
  assert.equal(pulls.length, 0, 'no pull while arming');
  // Arm it, then feel the pull. The arming tick itself continues (no pull), the next tick drags.
  state.simTime += 2;
  system._tickVectorMines(DT, state);
  assert.equal(mine.data.armed, true);
  system._tickVectorMines(DT, state);
  assert.ok(pulls.length >= 1, 'the armed well pulls');
  const record = pulls[0];
  assert.equal(record.reason, 'gravity_well');
  // The victim sits at +x of the well: the pull points toward the well (negative x).
  assert.ok(record.impulse.x < 0, `the pull drags the ship toward the well (${record.impulse.x})`);
  // Uniform acceleration: impulse ∝ body mass at the same distance.
  assert.ok(Math.abs(record.impulse.x) > 0);
  // It expires on schedule (no detonation, no proximity trigger).
  mine.data.dieAt = state.simTime;
  const detonated = [];
  system._detonateVectorMine = () => detonated.push(1);
  system._tickVectorMines(DT, state);
  assert.equal(mine.alive, false, 'the well expires');
  assert.equal(detonated.length, 0, 'a well never detonates');
});
