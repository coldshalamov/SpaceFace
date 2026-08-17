// Propulsion, graded against the ship the player ACTUALLY flies (atlas packet E-3).
//
// WHY THIS FILE EXISTS, stated plainly so it is not "consolidated" back into the fixtures later.
//
// `test/travel-drive.test.mjs` and `test/rcs-jet-mapping.test.mjs` are good tests, but every one of
// their cases is built from `PROPULSION_PROFILES[driveId]` plus a hand-written body — `mass: 20,
// inertia: 40, radius: 6`. Those numbers appear nowhere in shipped ship data. They are a fixture.
// A propulsion suite built entirely on a fixture can be 100% green while the ship the player boots
// into resolves to a different drive, a different mass and a different ceiling, and nothing in the
// repo would notice. That is the exact shape of the failure this program was created to stop:
// a gate that measures something adjacent to the product and reports it as the product.
//
// So this file starts from `NEW_GAME` and walks the REAL spawn chain:
//
//     NEW_GAME.shipId + NEW_GAME.fittedModules          (src/data/newGameDefaults.js)
//       -> makeShipEntitySpec(...)                      (src/systems/ships.js:443)
//         -> getDerivedStats(...)  => mass / radius / inertia / boost block
//       -> resolvePropulsionProfile(entity, state)      (src/core/flight/propulsionCatalog.js:265)
//       -> stepPropulsion(...)                          (src/core/flight/propulsionKernel.js:90)
//
// The body is assembled by `playerBody()` below with the SAME field precedence `bodySnapshot()`
// uses at `src/systems/flightV3.js:1143`, so what the kernel is handed here is what the kernel is
// handed in flight.
//
// MEASURED, not assumed (2026-08-08, this tree). Recorded so a drift is legible as a drift:
//   ship_kestrel + starter fittings -> drive_reaction_m, family reaction, combatSpeed 195,
//   travel ceiling 438.75 WU/s, mass 32, radius 14, inertia ~26.96.
// Note every one of those differs from the fixture. That is the point.
//
// WHICH SPEED NUMBER IS AUTHORITATIVE — traced, because two plausible ones disagree and the tests
// below would be measuring the wrong product if this were guessed:
//   * `derived.flightModel.maxSpeed` = 145.0 for the starter kestrel, and it rises with the fitted
//     engine module (ion 145 -> fusion 185.7 -> warp 217.4).
//   * `profile.combatSpeed` = 195, fixed by the resolved drive and unaffected by engine fittings.
// The clamp actually applied is the kernel's: `stepReaction` publishes
// `maxSpeed: finiteOrInfinity(profile.solverSpeedLimit)`, flightV3 forwards it verbatim through
// `writePhysicsControl` (`flightV3.js:261-266`) and `physicsAuthority.js:33` takes it as the
// velocity clamp. For `drive_reaction_m` that value is **Infinity**. So under flightV3 nothing
// clamps the player to 145: the operative authority is the assisted governor servoing toward
// `combatSpeed` (195), which is what the tests below assert against.
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO. It does not assert unbuilt product. The travel-drive
// axis has no production input owner (ledger W1-1/W1-2 "built, NOT wired") and the velocity tape
// does not exist (D5 Amendment 2). Tests that demand those would be red on a correct tree and would
// pressure someone into deleting them. Where a D5 promise is not kept by the shipped data, this
// file asserts the MECHANISM that would deliver it and the gap is reported as a finding instead.

import assert from 'node:assert/strict';
import test from 'node:test';

import { fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { SHIPS } from '../src/data/ships.js';
import {
  PLAYER_TRANSLATION_RESPONSIVENESS,
  PROPULSION_PROFILES,
  resolvePropulsionProfile,
} from '../src/core/flight/propulsionCatalog.js';
import {
  createPropulsionRuntime,
  resolveTravelCeiling,
  stepPropulsion,
  TRAVEL_CEILING_ABSOLUTE_WU_S,
} from '../src/core/flight/propulsionKernel.js';
import { estimateBrakingSolution } from '../src/core/flight/flightTelemetry.js';
import { FRAME_REBASE_THRESHOLD_WU } from '../src/core/coordinates.js';
import { TRAVEL_FLAGS } from '../src/data/featureFlags.js';

const DT = 1 / 60;

/** Run `fn` with the named travel flags forced, restoring whatever was there before. */
function withFlags(overrides, fn) {
  const previous = {};
  for (const key of Object.keys(overrides)) previous[key] = TRAVEL_FLAGS[key];
  Object.assign(TRAVEL_FLAGS, overrides);
  try {
    return fn();
  } finally {
    Object.assign(TRAVEL_FLAGS, previous);
  }
}

// --------------------------------------------------------------------------------------------
// The real spawn chain
// --------------------------------------------------------------------------------------------

/** Build the entity spec exactly as `bootstrapScene` (src/main.js:236-241) does for a new game. */
function spawnPlayerSpec(shipId = NEW_GAME.shipId, fittings = NEW_GAME.fittedModules || []) {
  return makeShipEntitySpec(shipId, {
    team: 0,
    factionId: 'faction_free',
    isPlayer: true,
    player: null,
    fittings,
    pos: { x: 0, z: 0 },
  });
}

function spawnPlayerEntity(shipId, fittings) {
  const spec = spawnPlayerSpec(shipId, fittings);
  return { ...spec, id: 1, alive: true, vel: { x: 0, z: 0 }, angVel: 0 };
}

/**
 * Assemble the kernel body with the SAME precedence as `bodySnapshot` (flightV3.js:1143):
 * mass from the physics body else the entity else the profile; inertia from the physics body else
 * `entity.flightModel.inertia` else derived; radius from the entity.
 */
function playerBody(entity, profile, overrides = {}) {
  const physicsBody = entity.physicsBody || {};
  const derived = entity.data && entity.data.derived && entity.data.derived.flightModel;
  return {
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    mass: positive(physicsBody.mass, positive(entity.mass, positive(profile.mass, 1))),
    inertia: positive(
      physicsBody.inertiaY,
      positive(entity.flightModel && entity.flightModel.inertia, positive(derived && derived.inertia, 1))
    ),
    radius: positive(entity.radius, positive(physicsBody.radius, 0)),
    ...overrides,
  };
}

function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function approxEqual(actual, expected, label) {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${label}: expected ${expected}, got ${actual}`,
  );
}

/** The real player ship, its real profile and its real body — the subject of every test below. */
function player(shipId, fittings) {
  const entity = spawnPlayerEntity(shipId, fittings);
  const profile = resolvePropulsionProfile(entity, { playerId: 1, player: {} });
  return { entity, profile, body: (o) => playerBody(entity, profile, o) };
}

/**
 * Linear acceleration as the SIM derives it. The kernel result publishes `force` / `torque`, not
 * acceleration — physics divides by mass and inertia. Reading the force back out the same way is
 * what makes this harness reproduce flight rather than approximate it, and it is why the real
 * ship's mass matters: a fixture mass would silently rescale every acceleration below.
 */
function accelOf(result, body) {
  return { x: result.force.x / body.mass, z: result.force.z / body.mass };
}

function angularAccelOf(result, body) {
  return result.torque.y / body.inertia;
}

/** Drive the real kernel for `ticks` fixed steps, integrating velocity like the sim does. */
function fly(profile, body, input, ticks = 1) {
  let runtime = createPropulsionRuntime(profile);
  const b = { ...body, pos: { ...body.pos }, vel: { ...body.vel } };
  let result = null;
  let travelDrive = input.travelDrive ? { ...input.travelDrive } : null;
  for (let i = 0; i < ticks; i += 1) {
    const tickInput = travelDrive ? { ...input, travelDrive } : input;
    result = stepPropulsion({ dt: DT, body: b, input: tickInput, profile, runtime, environment: {} });
    runtime = result.runtime;
    const accel = accelOf(result, b);
    b.vel.x += accel.x * DT;
    b.vel.z += accel.z * DT;
    b.pos.x += b.vel.x * DT;
    b.pos.z += b.vel.z * DT;
    b.angVel += angularAccelOf(result, b) * DT;
    b.rot += b.angVel * DT;
    // Carry the ramp exactly as the input owner is required to.
    if (travelDrive && result.telemetry && Number.isFinite(result.telemetry.travelCap)) {
      travelDrive = { ...travelDrive, cap: result.telemetry.travelCap };
    }
  }
  return { result, body: b, speed: Math.hypot(b.vel.x, b.vel.z) };
}

// --------------------------------------------------------------------------------------------
// 1. SPAWNED-SHIP AUTHORITY — is the thing under test the thing the player flies?
// --------------------------------------------------------------------------------------------

test('the default new game spawns a ship that resolves to a REAL catalogue drive', () => {
  const { entity, profile } = player();

  assert.equal(entity.data.defId, NEW_GAME.shipId, 'the spawn chain must honour NEW_GAME.shipId');
  assert.ok(profile && typeof profile === 'object', 'the player ship must resolve a propulsion profile');
  assert.ok(
    PROPULSION_PROFILES[profile.id],
    `the player's drive "${profile.id}" must be a real catalogue entry, not an ad-hoc object`
  );
  assert.ok(profile.combatSpeed > 0, 'the resolved drive must publish a positive governed speed');
});

test('the player ship accelerates and stops 15% faster than its catalogue drive', () => {
  const { profile } = player();
  const catalog = PROPULSION_PROFILES.drive_reaction_m;
  const scale = PLAYER_TRANSLATION_RESPONSIVENESS;
  assert.equal(profile.id, catalog.id);
  assert.equal(profile.combatSpeed, catalog.combatSpeed,
    'top speed stays on the authored drive; only the time to get there and stop changes');
  assert.equal(profile.maxYawRate, catalog.maxYawRate, 'yaw ceiling is not part of the translation feel bump');
  approxEqual(profile.mainAccel, catalog.mainAccel * scale, 'player mainAccel');
  approxEqual(profile.reverseAccel, catalog.reverseAccel * scale, 'player reverseAccel');
  approxEqual(profile.strafeAccel, catalog.strafeAccel * scale, 'player strafeAccel');
  approxEqual(profile.assist.stopHorizonS, catalog.assist.stopHorizonS / scale, 'player stop horizon');

  const npc = resolvePropulsionProfile(
    { id: 99, isPlayer: false, driveId: 'drive_reaction_m' },
    { playerId: 1, player: {} },
  );
  assert.equal(npc.mainAccel, catalog.mainAccel, 'NPC translation stays on the catalogue drive');
  assert.equal(npc.reverseAccel, catalog.reverseAccel, 'NPC reverse stays on the catalogue drive');
});

test('spawned derived propulsion keeps the unbounded solver sentinel out of serializable state', () => {
  const { entity, profile, body } = player();

  assert.equal(Object.hasOwn(entity.propulsion, 'solverSpeedLimit'), false,
    'the top-level derived descriptor must not serialize the runtime Infinity sentinel');
  assert.equal(Object.hasOwn(entity.data.derived.propulsion, 'solverSpeedLimit'), false,
    'the authoritative derived-stat block must contain only finite numeric state');

  const secondRead = resolvePropulsionProfile(entity, { playerId: 1, player: {} });
  assert.strictEqual(secondRead, profile,
    'runtime hydration must be cached instead of allocating a profile every flight tick');
  assert.equal(profile.solverSpeedLimit, Infinity,
    'the hydrated runtime profile must preserve the reaction drive\'s unbounded solver contract');

  const { result } = fly(profile, body(), { assistMode: 'assisted', throttle: 0 });
  assert.equal(result.maxSpeed, Infinity,
    'removing the sentinel from serializable state must not install a physics speed clamp');
});

test("the kernel body carries the ship's DERIVED stats, not invented fixture numbers", () => {
  // Provenance, not inequality: assert each field traces to the derived-stat block the rest of the
  // game reads. A test that merely asserted "!== 20" would pass on a body built from thin air.
  const { entity, profile } = player();
  const body = playerBody(entity, profile);
  const derived = entity.data.derived;

  assert.equal(body.mass, entity.mass, 'kernel mass must be the spawned entity mass');
  assert.equal(body.mass, derived.mass, 'the spawned entity mass must come from derived stats');
  assert.equal(body.radius, entity.radius, 'kernel radius must be the spawned entity radius');
  assert.equal(body.radius, derived.radius, 'the spawned radius must come from derived stats');
  assert.equal(
    body.inertia,
    entity.flightModel.inertia,
    'kernel inertia must be the derived flight-model inertia'
  );
  for (const [field, value] of Object.entries({ mass: body.mass, inertia: body.inertia, radius: body.radius })) {
    assert.ok(Number.isFinite(value) && value > 0, `${field} must be finite and positive, got ${value}`);
  }
});

test('every player-purchasable hull resolves its authored drive and engine tiers preserve its family', () => {
  // The starter hull is not the only ship the player flies. A hull that falls through to a default
  // profile would fly with someone else's numbers, silently.
  const driveMismatches = [];
  const engineTierIds = ['mod_engine_ion_m', 'mod_engine_fusion_m', 'mod_engine_warp_l'];
  for (const shipDef of SHIPS) {
    const { entity, profile } = player(shipDef.id, []);
    const topLevelDriveId = entity.propulsion && entity.propulsion.id;
    const derivedDriveId = entity.data && entity.data.derived
      && entity.data.derived.propulsion && entity.data.derived.propulsion.id;
    if (profile.id !== shipDef.driveId
        || topLevelDriveId !== shipDef.driveId
        || derivedDriveId !== shipDef.driveId) {
      driveMismatches.push({
        shipId: shipDef.id,
        authoredDriveId: shipDef.driveId,
        resolvedDriveId: profile.id,
        topLevelDriveId,
        derivedDriveId,
      });
    }
    assert.ok(
      PROPULSION_PROFILES[profile.id],
      `${shipDef.id}: resolved drive "${profile.id}" is not a catalogue entry`
    );
    const ceiling = resolveTravelCeiling(profile);
    assert.ok(
      Number.isFinite(ceiling) && ceiling > 0,
      `${shipDef.id}: travel ceiling must be finite and positive, got ${ceiling}`
    );
    assert.ok(
      ceiling <= TRAVEL_CEILING_ABSOLUTE_WU_S,
      `${shipDef.id}: ceiling ${ceiling} breaks the absolute engineering bound`
    );
    assert.ok(entity.mass > 0 && entity.radius > 0, `${shipDef.id}: must spawn with positive mass and radius`);

    for (const engineId of engineTierIds) {
      const fittings = fittingsFromDefaultModules(shipDef.id, [engineId]);
      if (!fittings.includes(engineId)) continue;
      const fittedProfile = player(shipDef.id, fittings).profile;
      assert.equal(fittedProfile.id, profile.id,
        `${shipDef.id}: ${engineId} must not rewrite the hull's drive identity`);
      assert.equal(fittedProfile.family, profile.family,
        `${shipDef.id}: ${engineId} must not rewrite the hull's propulsion family`);
    }
  }
  assert.deepEqual(driveMismatches, [], 'spawned hulls must resolve their authored SHIPS driveId');
});

test('the travel ceiling honours an authored per-drive override — the upgrade hook is live', () => {
  // D5 says the ceiling is "upgradeable by drive tier", and `resolveTravelCeiling` documents that
  // an authored `profile.travelCeiling` is the seam the upgrade hangs off. This asserts the SEAM
  // works. Whether any shipped module actually authors it is a separate question, reported as a
  // finding rather than pinned here — pinning an unbuilt promise makes a correct tree red.
  const { profile } = player();
  const base = resolveTravelCeiling(profile);
  const upgraded = resolveTravelCeiling({ ...profile, travelCeiling: base + 100 });
  assert.equal(upgraded, base + 100, 'an authored travelCeiling must win over the family derivation');
  const overreach = resolveTravelCeiling({ ...profile, travelCeiling: TRAVEL_CEILING_ABSOLUTE_WU_S * 4 });
  assert.equal(
    overreach,
    TRAVEL_CEILING_ABSOLUTE_WU_S,
    'an authored ceiling must still be clamped by the absolute engineering bound'
  );
});

test('fitted engine tiers raise Travel Burn V-MAX without changing ordinary propulsion', () => {
  // Atlas has an L engine bay and an unbounded reaction-drive solver, so all three production
  // engine tiers can express their full V-MAX multiplier through the real fitting helper. Capped
  // families still retain the multiplier in their derived descriptor, but the solver envelope wins.
  const shipId = 'ship_atlas';
  const profileFor = (engineId) => player(
    shipId,
    fittingsFromDefaultModules(shipId, [engineId]),
  ).profile;
  const ion = profileFor('mod_engine_ion_m');
  const fusion = profileFor('mod_engine_fusion_m');
  const warp = profileFor('mod_engine_warp_l');

  for (const field of ['id', 'family', 'combatSpeed', 'mainAccel', 'reverseAccel', 'strafeAccel']) {
    assert.equal(fusion[field], ion[field], `${field}: fusion must not rewrite ordinary flight`);
    assert.equal(warp[field], ion[field], `${field}: warp must not rewrite ordinary flight`);
  }

  const ionCeiling = resolveTravelCeiling(ion);
  const fusionCeiling = resolveTravelCeiling(fusion);
  const warpCeiling = resolveTravelCeiling(warp);
  assert.equal(fusionCeiling, Math.min(ionCeiling * 1.15, TRAVEL_CEILING_ABSOLUTE_WU_S));
  assert.equal(warpCeiling, Math.min(ionCeiling * 1.30, TRAVEL_CEILING_ABSOLUTE_WU_S));
  assert.ok(ionCeiling < fusionCeiling && fusionCeiling < warpCeiling,
    `engine progression must be legible in V-MAX (${ionCeiling} < ${fusionCeiling} < ${warpCeiling})`);

  const warpEntity = spawnPlayerEntity(
    shipId,
    fittingsFromDefaultModules(shipId, ['mod_engine_warp_l']),
  );
  const firstRead = resolvePropulsionProfile(warpEntity, { playerId: 1, player: {} });
  const secondRead = resolvePropulsionProfile(warpEntity, { playerId: 1, player: {} });
  assert.strictEqual(secondRead, firstRead,
    'the complete refit-derived profile must be reused instead of allocated on every flight read');

  const labRead = resolvePropulsionProfile(warpEntity, {
    playerId: 1,
    player: {},
    settings: { gameplay: { flightLabDrive: 'drive_field_sail_m' } },
  });
  assert.equal(labRead.id, 'drive_field_sail_m',
    'the explicit player-only flight-lab override must remain authoritative over derived fittings');
});

test('bounded authored drives retain engine-tier scaling beneath their solver envelope', () => {
  const shipId = 'ship_hornet';
  const profileFor = (engineId) => player(
    shipId,
    fittingsFromDefaultModules(shipId, [engineId]),
  ).profile;
  const ion = profileFor('mod_engine_ion_m');
  const fusion = profileFor('mod_engine_fusion_m');
  const warp = profileFor('mod_engine_warp_l');
  const withoutTravelCeiling = ({ travelCeiling: _travelCeiling, ...profile }) => profile;

  for (const profile of [ion, fusion, warp]) {
    assert.equal(profile.id, 'drive_gravimetric_s', 'Hornet engine tiers must preserve authored drive identity');
    assert.equal(profile.family, 'gravimetric', 'Hornet engine tiers must preserve gravimetric family behavior');
    assert.equal(
      resolveTravelCeiling(profile),
      Math.min(profile.travelCeiling, profile.solverSpeedLimit, TRAVEL_CEILING_ABSOLUTE_WU_S),
      'effective V-MAX must clamp the tier-scaled authored ceiling to the drive solver envelope',
    );
  }

  assert.deepEqual(withoutTravelCeiling(fusion), withoutTravelCeiling(ion),
    'fusion fitting must change only Hornet\'s tier-scaled travel ceiling');
  assert.deepEqual(withoutTravelCeiling(warp), withoutTravelCeiling(ion),
    'warp fitting must change only Hornet\'s tier-scaled travel ceiling');

  assert.ok(ion.travelCeiling < fusion.travelCeiling && fusion.travelCeiling < warp.travelCeiling,
    'the derived descriptor must retain each fitted engine tier multiplier before solver clamping');
  assert.ok(resolveTravelCeiling(ion) < resolveTravelCeiling(fusion),
    'the fusion tier must raise Hornet V-MAX until the gravimetric solver envelope is reached');
  assert.equal(resolveTravelCeiling(fusion), resolveTravelCeiling(warp),
    'higher tiers must not bypass Hornet\'s finite gravimetric solver envelope');
});

// --------------------------------------------------------------------------------------------
// 2. ASSISTED vs TRAVEL BURN — on the real ship
// --------------------------------------------------------------------------------------------

test('assisted flight governs the REAL player ship to throttle x combatSpeed', () => {
  const { profile, body } = player();
  const cap = profile.combatSpeed;
  // 30 s of full throttle from rest: the governor's terminal speed, integrated, not asserted from
  // the formula. An integration that never reaches its own cap is a governor bug.
  const { speed } = fly(profile, body(), { assistMode: 'assisted', throttle: 1 }, 1800);
  assert.ok(speed > cap * 0.95, `assisted full throttle should approach the governed cap (${speed} vs ${cap})`);
  assert.ok(speed <= cap * 1.02, `assisted full throttle must not blow past the governed cap (${speed} vs ${cap})`);
});

test('Travel Burn raises the REAL ship above its assisted cap, and only while engaged', () => {
  withFlags({ travelBurn: true, boostNeverBrakes: true }, () => {
    const { profile, body } = player();
    const cap = profile.combatSpeed;
    const ceiling = resolveTravelCeiling(profile);
    assert.ok(ceiling > cap, 'the travel ceiling must exceed the governed cap or the axis is pointless');

    const engaged = fly(
      profile,
      body(),
      { assistMode: 'assisted', throttle: 1, travelDrive: { state: 'engaged', cap: 0 } },
      3600
    );
    assert.ok(
      engaged.speed > cap * 1.5,
      `an engaged burn must carry the real ship well past its combat cap (${engaged.speed} vs cap ${cap})`
    );
    assert.ok(
      engaged.speed <= ceiling + 1e-6,
      `an engaged burn must never exceed the ceiling (${engaged.speed} vs ${ceiling})`
    );

    // The same run with the drive parked Off must stay governed. This is what makes the assertion
    // above evidence of the AXIS rather than evidence of a long integration.
    const off = fly(
      profile,
      body(),
      { assistMode: 'assisted', throttle: 1, travelDrive: { state: 'off', cap: 0 } },
      3600
    );
    assert.ok(off.speed <= cap * 1.02, `an Off drive must leave the governed cap intact (${off.speed})`);
  });
});

// --------------------------------------------------------------------------------------------
// 3. HELD BOOST, DASH AND RESOURCE ECONOMICS — on the real ship
// --------------------------------------------------------------------------------------------

test('RC-4 on the real player ship: held boost above the cap never commands reverse', () => {
  withFlags({ boostNeverBrakes: true }, () => {
    const { profile, body } = player();
    const overspeed = profile.combatSpeed * positive(profile.boostSpeedMult, 1.55) * 1.4;
    const { result } = fly(profile, body({ vel: { x: overspeed, z: 0 } }), {
      assistMode: 'assisted',
      throttle: 1,
      boost: true,
    });
    assert.ok(
      result.telemetry.manualLocal.forward >= 0,
      `held boost commanded reverse thrust on the player's own ship (${result.telemetry.manualLocal.forward})`
    );
  });
});

test('held boost raises the real ship’s terminal speed rather than lowering it', () => {
  // The player-visible form of RC-4: the outcome, not the commanded acceleration. If boost ever
  // makes the ship slower again, this fails regardless of how the governor is refactored.
  withFlags({ boostNeverBrakes: true }, () => {
    const { profile, body } = player();
    const plain = fly(profile, body(), { assistMode: 'assisted', throttle: 1 }, 1800);
    const boosted = fly(profile, body(), { assistMode: 'assisted', throttle: 1, boost: true }, 1800);
    assert.ok(
      boosted.speed > plain.speed,
      `held boost must not be a brake: boosted ${boosted.speed} vs unboosted ${plain.speed}`
    );
  });
});

test('the real ship spawns with a funded, bounded boost/dash pool', () => {
  // Economics on the SHIPPED numbers. A dash that costs nothing, or a pool that cannot fund a
  // single dash, is a broken verb no kernel test would catch.
  const { entity } = player();
  const boost = entity.boost;
  assert.ok(boost && Number.isFinite(boost.max) && boost.max > 0, 'the player ship must spawn a boost pool');
  assert.equal(boost.energy, boost.max, 'a fresh ship must spawn with a full pool');
  assert.ok(boost.drainRate > 0, 'held boost must actually cost energy');
  assert.ok(boost.regenRate > 0, 'the pool must refill or boost is single-use');
  assert.ok(boost.dashImpulse > 0, 'dash must inject a real impulse');
  assert.ok(boost.dashCd > 0, 'dash must be rate limited');
  assert.ok(
    boost.max / boost.drainRate > 1,
    `the pool must fund more than a second of boost (${boost.max / boost.drainRate}s)`
  );
});

test('propulsion resource demand on the real ship is finite, non-negative and load-bearing', () => {
  const { profile, body } = player();
  const idle = fly(profile, body(), { assistMode: 'assisted', throttle: 0 });
  const burn = fly(profile, body(), { assistMode: 'assisted', throttle: 1 });
  // `resourceDelta` is the shipped shape and its SIGNS are part of the contract: energy and fuel
  // are spends (<= 0), heat is a gain (>= 0). A sign flip here would silently refuel the ship.
  for (const [label, run] of [['idle', idle], ['full throttle', burn]]) {
    const delta = run.result.resourceDelta;
    assert.ok(delta && typeof delta === 'object', `${label}: the kernel must publish a resourceDelta`);
    assert.ok(Number.isFinite(delta.energy) && delta.energy <= 0, `${label}: energy must be a finite spend, got ${delta.energy}`);
    assert.ok(Number.isFinite(delta.fuel) && delta.fuel <= 0, `${label}: fuel must be a finite spend, got ${delta.fuel}`);
    assert.ok(Number.isFinite(delta.heat) && delta.heat >= 0, `${label}: heat must be a finite gain, got ${delta.heat}`);
  }
  const spend = -burn.result.resourceDelta.energy - burn.result.resourceDelta.fuel + burn.result.resourceDelta.heat;
  assert.ok(spend > 0, 'accelerating the real ship must cost SOMETHING — a free drive has no economics');
  // Boost must be dearer than coasting, or the pool is decorative.
  const boosted = fly(profile, body(), { assistMode: 'assisted', throttle: 1, boost: true });
  assert.ok(
    boosted.result.resourceDelta.heat >= burn.result.resourceDelta.heat,
    'a boosted burn must not run cooler than an unboosted one'
  );
});

// --------------------------------------------------------------------------------------------
// 4. BRAKING AND OVERSHOOT — overshoot must remain POSSIBLE
// --------------------------------------------------------------------------------------------
//
// D5 and D9.8 are explicit: auto-brake in manual burn is rejected, and overshoot must be possible.
// A suite that proves the player always stops in time would be asserting the wrong product, so the
// pin below is deliberately the opposite shape: it proves the ship CAN sail past.

test('the braking solution tells the truth about the real ship’s stopping distance', () => {
  const { profile, body } = player();
  const cruising = body({ vel: { x: profile.combatSpeed, z: 0 } });
  const solution = estimateBrakingSolution(cruising, profile);

  assert.ok(solution.directDistance > 0, 'a moving ship must report a positive stopping distance');
  for (const key of ['directDistance', 'directTimeS', 'speed']) {
    assert.ok(Number.isFinite(solution[key]), `${key} must be finite, got ${solution[key]}`);
  }
  assert.ok(
    ['direct-counterthrust', 'flip-and-burn'].includes(solution.bestMode),
    `a moving ship must choose a real braking mode, got ${solution.bestMode}`
  );
  assert.ok(
    Number.isFinite(solution.projectedStop.x) && Number.isFinite(solution.projectedStop.z),
    'projectedStop must be a finite world position — the HUD arc is drawn from it'
  );

  // Faster costs more room. This is what makes the stopping arc informative rather than decorative.
  const faster = estimateBrakingSolution(body({ vel: { x: profile.combatSpeed * 2, z: 0 } }), profile);
  assert.ok(
    faster.directDistance > solution.directDistance,
    'stopping distance must grow with speed or the arc is lying'
  );
});

test('OVERSHOOT REMAINS POSSIBLE: ignoring BRAKE NOW in a manual burn sails past the arrival radius', () => {
  // This is a product requirement, asserted as a requirement. If a future change makes the ship
  // stop by itself in a manual KERNEL burn, this test SHOULD fail — do not "fix" it by relaxing it.
  //
  // SCOPE, stated so nobody trusts coverage that is not here: this exercises the kernel only.
  // Auto-arrival would most plausibly be added at the flightV3 / input-owner layer (where the
  // route follower's auto-brake already lives), and this test never runs that layer. It pins that
  // the KERNEL contains no auto-arrival, not that the whole stack contains none. A full-stack
  // overshoot guard needs a harness that drives flightV3 with a destination, which does not exist.
  withFlags({ travelBurn: true, boostNeverBrakes: true }, () => {
    const { profile, body } = player();
    const ceiling = resolveTravelCeiling(profile);
    const arrivalRadius = 250; // a generous station approach envelope

    // Spend 60 s burning toward +x, then place the destination exactly where the braking solution
    // says the ship can no longer stop, and keep flying — the pilot ignoring the cue.
    const cruise = fly(
      profile,
      body(),
      { assistMode: 'assisted', throttle: 1, travelDrive: { state: 'engaged', cap: 0 } },
      3600
    );
    assert.ok(cruise.speed > profile.combatSpeed, 'set-up: the burn must actually be carrying speed');
    assert.ok(cruise.speed <= ceiling + 1e-6, 'set-up: the burn must stay under the ceiling');

    const solution = estimateBrakingSolution(cruise.body, profile);
    // The destination sits INSIDE the stopping distance: braking now cannot prevent arrival
    // overshoot. This is the "too late" regime the BRAKE NOW cue exists to warn about.
    const destination = { x: cruise.body.pos.x + solution.directDistance * 0.5, z: 0 };

    // The pilot ignores the cue and holds throttle.
    const continued = fly(
      profile,
      { ...cruise.body },
      { assistMode: 'assisted', throttle: 1, travelDrive: { state: 'engaged', cap: cruise.result.telemetry.travelCap } },
      1200
    );
    const missDistance = Math.hypot(continued.body.pos.x - destination.x, continued.body.pos.z - destination.z);
    assert.ok(
      continued.body.pos.x > destination.x + arrivalRadius,
      'the ship must be able to sail past its destination — auto-arrival in manual burn is rejected product'
    );
    assert.ok(missDistance > arrivalRadius, `overshoot must leave the arrival envelope (missed by ${missDistance})`);
  });
});

test('a manual full brake still stops the real ship in a bounded time', () => {
  // The counterweight to the test above: overshoot is possible because braking is the PLAYER's
  // job, not because braking is broken.
  const { profile, body } = player();
  const start = body({ vel: { x: profile.combatSpeed, z: 0 } });
  const braked = fly(profile, start, { assistMode: 'assisted', throttle: 0, brake: true }, 1800);
  assert.ok(
    braked.speed < profile.combatSpeed * 0.05,
    `30 s of full brake must very nearly stop the ship (left ${braked.speed} WU/s)`
  );
});

// --------------------------------------------------------------------------------------------
// 5. NUMERICAL STABILITY AT EXTREME SPEED
// --------------------------------------------------------------------------------------------

test('a saturated burn on the real ship stays finite and never tunnels its own hull', () => {
  withFlags({ travelBurn: true, boostNeverBrakes: true }, () => {
    const { entity, profile, body } = player();
    const ceiling = resolveTravelCeiling(profile);
    const hullRadius = entity.radius;

    let runtime = createPropulsionRuntime(profile);
    const b = body();
    let drive = { state: 'engaged', cap: 0 };
    let maxStep = 0;

    for (let i = 0; i < 7200; i += 1) { // 2 simulated minutes
      const result = stepPropulsion({
        dt: DT,
        body: b,
        input: { assistMode: 'assisted', throttle: 1, boost: true, travelDrive: drive },
        profile,
        runtime,
        environment: {},
      });
      runtime = result.runtime;
      const accel = accelOf(result, b);
      assert.ok(
        Number.isFinite(accel.x) && Number.isFinite(accel.z),
        `tick ${i}: acceleration went non-finite`
      );
      assert.ok(Number.isFinite(angularAccelOf(result, b)), `tick ${i}: angular acceleration went non-finite`);
      b.vel.x += accel.x * DT;
      b.vel.z += accel.z * DT;
      const step = Math.hypot(b.vel.x, b.vel.z) * DT;
      maxStep = Math.max(maxStep, step);
      b.pos.x += b.vel.x * DT;
      b.pos.z += b.vel.z * DT;
      assert.ok(Number.isFinite(b.vel.x) && Number.isFinite(b.vel.z), `tick ${i}: velocity went non-finite`);
      assert.ok(Number.isFinite(b.pos.x) && Number.isFinite(b.pos.z), `tick ${i}: position went non-finite`);
      if (result.telemetry && Number.isFinite(result.telemetry.travelCap)) {
        drive = { ...drive, cap: result.telemetry.travelCap };
      }
    }

    const finalSpeed = Math.hypot(b.vel.x, b.vel.z);
    // Boost raises the cap multiplicatively on top of the burn cap, so the reachable speed can
    // exceed the burn ceiling. The bound that actually matters is the ENGINEERING one.
    assert.ok(
      finalSpeed <= TRAVEL_CEILING_ABSOLUTE_WU_S * positive(profile.boostSpeedMult, 1.55) + 1,
      `saturated burn+boost reached ${finalSpeed} WU/s — outside the engineering envelope`
    );
    assert.ok(
      maxStep < hullRadius,
      `per-tick displacement ${maxStep.toFixed(3)} WU reached the hull radius ${hullRadius} WU — collision can tunnel`
    );
    assert.ok(
      maxStep < FRAME_REBASE_THRESHOLD_WU / 64,
      `per-tick displacement ${maxStep.toFixed(3)} WU is not comfortably under the rebase threshold ${FRAME_REBASE_THRESHOLD_WU}`
    );
    assert.ok(ceiling > 0, 'set-up: the ceiling must exist');
  });
});

test('the kernel refuses to produce NaN from hostile state on the real ship', () => {
  // Not "does the game do this" — "if it ever did, does the ship survive it". A single NaN in
  // velocity propagates to position, to the camera and to every map readout in one tick.
  const { profile, body } = player();
  const hostile = [
    { label: 'NaN velocity', overrides: { vel: { x: NaN, z: 0 } } },
    { label: 'Infinite velocity', overrides: { vel: { x: Infinity, z: -Infinity } } },
    { label: 'NaN rotation', overrides: { rot: NaN } },
    { label: 'huge velocity', overrides: { vel: { x: 1e9, z: 1e9 } } },
    { label: 'NaN angular velocity', overrides: { angVel: NaN } },
  ];
  for (const { label, overrides } of hostile) {
    for (const input of [
      { assistMode: 'assisted', throttle: 1 },
      { assistMode: 'assisted', throttle: 1, boost: true },
      { assistMode: 'assisted', throttle: 0, brake: true },
      { assistMode: 'newtonian', throttle: 1, turn: 1 },
    ]) {
      const b = body(overrides);
      const { result } = fly(profile, b, input);
      // Assert on FORCE and TORQUE, the quantities the kernel actually hands to physics. A NaN
      // that only shows up after division by mass is still a NaN in the ship's trajectory.
      assert.ok(
        Number.isFinite(result.force.x) && Number.isFinite(result.force.z),
        `${label} + ${JSON.stringify(input)}: force escaped as non-finite`
      );
      assert.ok(
        Number.isFinite(result.torque.y),
        `${label} + ${JSON.stringify(input)}: torque escaped as non-finite`
      );
      assert.ok(
        Number.isFinite(result.telemetry.acceleration.x) && Number.isFinite(result.telemetry.acceleration.z),
        `${label} + ${JSON.stringify(input)}: published telemetry acceleration escaped as non-finite`
      );
    }
  }
});
