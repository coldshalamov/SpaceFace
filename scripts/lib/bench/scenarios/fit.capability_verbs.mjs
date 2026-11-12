// PQ-142.00 — "capabilities, not percentages": four physical verbs, four before/after scenarios.
//
// Each verb the fit screen prints is a PREDICTION of a law the simulation runs. This scenario is
// where the prediction is put in front of the law and told to be wrong:
//
//   TOW CLASS      the real path is flown at two loads and the achieved acceleration is checked
//                  against force / mass — the arithmetic the tow class is solved from.
//   SLAM SURVIVAL  the live collision-consequence kernel is run one WU/s under and one WU/s over
//                  the predicted speed; the hull has to survive the first and be written off by
//                  the second.
//   LINE LOAD      a real rope is latched to a heavy anchor and swung, and SG-02's own measured
//                  tension is compared with the prediction the sentence is solved from.
//   FIELD DEPLOY   the live countermeasures system is asked to deploy, with and without the
//                  module. Without it there is no field: not a smaller one, none.
//
// Fixed seed, real authoritative runtime, rapier-dynamic. Nothing here integrates its own physics.

import { combat } from '../../../../src/systems/combat.js';
import { countermeasures } from '../../../../src/systems/countermeasures.js';
import { tetherGameplay } from '../../../../src/systems/tetherGameplay.js';
import {
  CAPABILITY_LAW,
  driveForceFor,
  shipCapabilityVerbs,
  slamSurvivalSpeedFor,
} from '../../../../src/systems/shipCapabilities.js';
import { getDerivedStats } from '../../../../src/systems/ships.js';
import { TERRAIN_CRUMPLE_LAW, resolveCollisionConsequence } from '../../../../src/combat/impulseKernel.js';
import { bootRealPath, writeRealPathInput } from '../realPath.mjs';

const HULL_ID = 'ship_kestrel';                 // the hull a new game actually flies
const FIELD_HULL_ID = 'ship_drifter';           // the smallest hull with an M utility slot for a dispenser
const ANCHOR_MASS = 240_000;                    // static, far past the massive-anchor floor
const LINE_LENGTH_WU = CAPABILITY_LAW.lineSwingRadiusWu;
const SWING_SPEED_WU = 130;                     // a real swing, comfortably inside the hull's band
const SETTLE_TICKS = 60;
const ACCEL_TICKS = 12;   // a fifth of a second from rest: the burst before any governor has an opinion

// The shipped starter fit, in canonical slot order for the Hitch:
// weapon S | shield S | engine M | cargo S | mining S | utility S | thruster S.
const STARTER_FIT = Object.freeze([
  'wpn_pulse_laser_s', 'mod_shield_booster_s', 'mod_engine_ion_m', null, 'mod_mining_laser_s', null, null,
]);
const FULL_HOLD_T = 200;                        // a Hitch hold filled with ore

// ship_drifter: weapon M x2 | shield M | engine M | cargo M x2 | mining M | utility M x2 | thruster M.
const FIELD_FIT_WITHOUT = Object.freeze([
  null, null, 'mod_shield_capacitor_m', 'mod_engine_fusion_m', null, null, null, null, null, null,
]);
const FIELD_FIT_WITH = Object.freeze([
  null, null, 'mod_shield_capacitor_m', 'mod_engine_fusion_m', null, null, null, 'mod_chaff_dispenser_m', null, null,
]);

// The line-load pair. The standard Massline's rating is far outside ordinary play by design, so the
// verb that can actually flip belongs to a fitted specialist head.
const SNARE_HULL_ID = 'ship_drifter';
const SNARE_FIT = Object.freeze([
  null, null, 'mod_shield_capacitor_m', 'mod_engine_fusion_m', null, null, null, 'mod_transverse_snare_m', null, null,
]);
const SNARE_HOLD_T = 200;

export const scenario = {
  id: 'fit.capability_verbs',
  label: 'PQ-142.00 Capabilities, not percentages — four physical verbs, before and after',
  async run(seed) {
    const eventTrace = [];

    const tow = await measureTow(seed, eventTrace);
    const slam = measureSlam(eventTrace);
    const line = await measureLine(seed, eventTrace);
    const field = await measureField(seed, eventTrace);

    const bars = [
      {
        bar: 'PQ-142.00',
        label: 'tow class — a hold full of ore takes the tow verb away',
        value: tow.after.towMassT,
        unit: 't on the line (was ' + tow.before.towMassT + ' t)',
        met: tow.verbFlipped === true && tow.forceModelHolds === true,
        note: tow.note,
      },
      {
        bar: 'PQ-142.00',
        label: 'slam survival — the predicted speed is the speed the live kernel kills at',
        value: slam.before.speedWuPerS,
        unit: 'WU/s into rock (empty hull)',
        met: slam.predictionHolds === true && slam.verbFlipped === true,
        note: slam.note,
      },
      {
        bar: 'PQ-142.00',
        label: 'line load — SG-02’s measured tension matches the swing the sentence promises',
        value: line.predictedRatedSwingWuPerS,
        unit: 'WU/s rated swing',
        met: line.predictionHolds === true,
        note: line.note,
      },
      {
        bar: 'PQ-142.00',
        label: 'field deploy — without a launcher there is no field at all',
        value: field.after.deployed ? 1 : 0,
        unit: 'fields in the water (was ' + (field.before.deployed ? 1 : 0) + ')',
        met: field.verbFlipped === true,
        note: field.note,
      },
    ];

    return {
      eventTrace,
      metrics: { seed, tow, slam, line, field, bars },
    };
  },
};

// --- TOW CLASS -------------------------------------------------------------------------------

async function measureTow(seed, eventTrace) {
  const empty = await flyAccel(seed, 0);
  const loaded = await flyAccel(seed, FULL_HOLD_T);

  // The tow class is solved from force = acceleration x mass. The real path multiplies the player's
  // own translation feel by a constant (PLAYER_TRANSLATION_RESPONSIVENESS), so the honest test is
  // the RATIO: if the loaded hull's achieved acceleration falls by exactly the factor the published
  // force-over-mass predicts, the arithmetic the sentence rests on is the arithmetic the game runs.
  const measuredRatio = loaded.achievedAccel > 0 ? empty.achievedAccel / loaded.achievedAccel : Infinity;
  const predictedRatio = (empty.force / empty.massT) / (loaded.force / loaded.massT);
  const ratioError = relativeError(measuredRatio, predictedRatio);
  const forceModelHolds = ratioError <= 0.08;

  const verbFlipped = empty.verbs.tow.hullName != null && loaded.verbs.tow.hullName == null;

  eventTrace.push({
    tick: null, type: 'tow:before_after',
    before: empty.verbs.tow.verb, after: loaded.verbs.tow.verb,
  });

  return {
    before: { label: 'Hitch, starter fit, empty hold', massT: empty.massT, towMassT: empty.verbs.tow.massT, verb: empty.verbs.tow.verb, achievedAccel: empty.achievedAccel, predictedAccel: round(empty.force / empty.massT, 3) },
    after: { label: 'Hitch, starter fit, ' + FULL_HOLD_T + ' t of ore aboard', massT: loaded.massT, towMassT: loaded.verbs.tow.massT, verb: loaded.verbs.tow.verb, achievedAccel: loaded.achievedAccel, predictedAccel: round(loaded.force / loaded.massT, 3) },
    forceModelHolds,
    measuredAccelRatio: round(measuredRatio, 3),
    predictedAccelRatio: round(predictedRatio, 3),
    verbFlipped,
    note: `empty: "${empty.verbs.tow.verb}" at ${empty.massT} t, real-path accel ${empty.achievedAccel} vs force/mass `
      + `${round(empty.force / empty.massT, 2)}; loaded: "${loaded.verbs.tow.verb}" at ${loaded.massT} t, `
      + `${loaded.achievedAccel} vs ${round(loaded.force / loaded.massT, 2)}.`,
  };
}

async function flyAccel(seed, holdMassT) {
  const host = await bootRealPath({
    seed,
    systems: ['actions', 'flightV3', 'physics'],
    prepareState: ({ state }) => {
      const cargo = state.player.cargo || (state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 0, capMass: 0 });
      cargo.usedMass = holdMassT;
    },
    hulls: [{ hullId: HULL_ID, pos: { x: 0, z: 0 }, rot: 0, isPlayer: true, factionId: 'faction_free', fittings: STARTER_FIT.slice() }],
  });
  try {
    const player = host.player;
    const derived = getDerivedStats(HULL_ID, STARTER_FIT.slice(), host.state.player);
    host.step(SETTLE_TICKS, { before: ({ state }) => { writeRealPathInput(state, {}); } });
    const v0 = planarSpeed(player);
    const t0 = host.state.simTime;
    host.step(ACCEL_TICKS, { before: ({ state }) => { writeRealPathInput(state, { moveZ: 1 }); } });
    const v1 = planarSpeed(player);
    const dt = host.state.simTime - t0;
    return {
      massT: round(derived.operationalMass, 1),
      force: driveForceFor(derived),
      achievedAccel: round(dt > 0 ? (v1 - v0) / dt : 0, 3),
      verbs: shipCapabilityVerbs({ derived, fittings: STARTER_FIT.slice() }),
    };
  } finally {
    host.dispose();
  }
}

// --- SLAM SURVIVAL ---------------------------------------------------------------------------

function measureSlam(eventTrace) {
  const emptyDerived = getDerivedStats(HULL_ID, STARTER_FIT.slice(), { isPlayer: true, cargo: { usedMass: 0 } });
  const loadedDerived = getDerivedStats(HULL_ID, STARTER_FIT.slice(), { isPlayer: true, cargo: { usedMass: FULL_HOLD_T } });
  const empty = slamSurvivalSpeedFor(emptyDerived);
  const loaded = slamSurvivalSpeedFor(loadedDerived);

  const structure = emptyDerived.hullMax;
  const massT = emptyDerived.operationalMass;
  const under = liveCrumple(empty.speedWuPerS - 1, massT);
  const over = liveCrumple(empty.speedWuPerS + 1, massT);
  const predictionHolds = empty.unbreakable === false && under < structure && over >= structure;
  const verbFlipped = empty.unbreakable === false && loaded.unbreakable === true;

  eventTrace.push({
    tick: null, type: 'slam:before_after',
    predicted: round(empty.speedWuPerS, 1), structure, under: round(under, 1), over: round(over, 1),
  });

  return {
    before: { label: 'Hitch, starter fit, empty hold', massT: round(massT, 1), structure, speedWuPerS: round(empty.speedWuPerS, 0), unbreakable: empty.unbreakable },
    after: { label: 'Hitch, starter fit, ' + FULL_HOLD_T + ' t of ore aboard', massT: round(loadedDerived.operationalMass, 1), structure: loadedDerived.hullMax, speedWuPerS: round(loaded.speedWuPerS, 0), unbreakable: loaded.unbreakable },
    liveKernelUnder: round(under, 1),
    liveKernelOver: round(over, 1),
    crumpleThreshold: TERRAIN_CRUMPLE_LAW.threshold,
    predictionHolds,
    verbFlipped,
    note: `empty hull at ${round(massT, 1)} t: the live kernel does ${round(under, 1)} damage at `
      + `${round(empty.speedWuPerS - 1, 0)} WU/s and ${round(over, 1)} at ${round(empty.speedWuPerS + 1, 0)} WU/s `
      + `against ${structure} points of structure. Loaded to ${round(loadedDerived.operationalMass, 1)} t the law's `
      + 'own mass floor can no longer reach that structure at any speed, so the verb becomes "no rock can break this hull".',
  };
}

function liveCrumple(closingSpeed, massT) {
  const receipt = resolveCollisionConsequence({
    tick: 0,
    target: { id: 'fit', type: 'ship', mass: massT, alive: true },
    other: { id: 'rock', type: 'asteroid', mass: 1e6 },
    exchangedMomentum: massT * Math.max(1, closingSpeed),
    preSolveClosingSpeed: closingSpeed,
  });
  return receipt ? Number(receipt.impactDamage) || 0 : 0;
}

// --- LINE LOAD -------------------------------------------------------------------------------

async function measureLine(seed, eventTrace) {
  const host = await bootRealPath({
    seed,
    systems: ['actions', 'flightV3', 'physics', combat, tetherGameplay],
    hulls: [{ hullId: HULL_ID, pos: { x: LINE_LENGTH_WU, z: 0 }, rot: 0, isPlayer: true, factionId: 'faction_free', fittings: STARTER_FIT.slice() }],
  });
  try {
    const player = host.player;
    const derived = getDerivedStats(HULL_ID, STARTER_FIT.slice(), host.state.player);
    const verbs = shipCapabilityVerbs({ derived, fittings: STARTER_FIT.slice() });
    const anchor = host.spawnObstacle({
      pos: { x: 0, z: 0 }, radius: 28, mass: ANCHOR_MASS, inertiaY: 80_000, hull: 4000, dynamic: false,
      data: { benchRealPath: 'capability-anchor' },
    });
    writeRealPathInput(host.state, {});
    host.step(1);

    const kernel = combatKernel(host);
    const attachments = kernel && kernel.attachments;
    const port = combatPhysics(host);
    if (!attachments || typeof attachments.create !== 'function') {
      return unmeasuredLine(verbs, 'combat attachment owner missing on this host');
    }

    player.flags = player.flags || {};
    player.flags.noInterp = true;
    player.pos.x = LINE_LENGTH_WU;
    player.pos.z = 0;
    if (player.prevPos) { player.prevPos.x = player.pos.x; player.prevPos.z = player.pos.z; }
    player.vel.x = 0;
    player.vel.z = 0;
    writeRealPathInput(host.state, {});
    host.step(1);

    const created = host.withFeatures(() => attachments.create({
      defId: 'tether_standard',
      ownerId: player.id,
      targetId: anchor.id,
      sourceWorld: { x: LINE_LENGTH_WU, y: 0, z: 0 },
      targetWorld: { x: 0, y: 0, z: 0 },
    }));
    if (!created || created.ok !== true || !created.attachment) {
      return unmeasuredLine(verbs, `attachment not created (${(created && created.reason) || 'create_failed'})`);
    }

    player.flags.noInterp = true;
    player.vel.x = 0;
    player.vel.z = SWING_SPEED_WU;
    writeRealPathInput(host.state, {});

    // The capture transient and the damping term both spike on the first taut tick, so the steady
    // swing — not the peak — is what m v^2 / r describes. Sample the settled second of the swing
    // and take its median tension against the tangential speed measured over the same window.
    const samples = [];
    host.step(180, {
      before: ({ state }) => { writeRealPathInput(state, {}); },
      after: ({ index }) => {
        if (index < 60) return;
        const attachment = attachments.get(created.attachment.id);
        const telemetry = port && typeof port.getAttachmentTelemetry === 'function'
          ? port.getAttachmentTelemetry({ attachmentId: created.attachment.id, physicsHandle: created.attachment.physicsHandle, tick: host.state.tick })
          : null;
        const tension = telemetry && Number.isFinite(telemetry.tension)
          ? telemetry.tension
          : (attachment && Number.isFinite(attachment.lastTension) ? attachment.lastTension : 0);
        if (tension > 0) samples.push({ tension, speed: planarSpeed(player) });
      },
    });

    if (!samples.length) return unmeasuredLine(verbs, 'the line never carried a measurable tension');
    samples.sort((a, b) => a.tension - b.tension);
    const mid = samples[Math.floor(samples.length / 2)];
    const steadyTension = mid.tension;
    const steadySpeed = mid.speed;

    // The sentence is solved from tension = m v^2 / r against the line's rated load. Predict the
    // tension at the speed the hull was ACTUALLY carrying when that tension was measured.
    const massT = Number(derived.operationalMass) || 1;
    const predictedTensionAtSwing = (massT * steadySpeed * steadySpeed) / LINE_LENGTH_WU;
    const tensionError = relativeError(steadyTension, predictedTensionAtSwing);
    const predictionHolds = steadyTension > 0 && tensionError <= 0.20;

    // The before/after pair uses the fit whose line has a REACHABLE rating: the standard Massline
    // is deliberately unbreakable in ordinary play (combatDefs turns automatic overload breaks off
    // for it), so the verb that flips is the specialist snare's — and what flips it is the hold.
    const snareEmpty = getDerivedStats(SNARE_HULL_ID, SNARE_FIT.slice(), { isPlayer: true, cargo: { usedMass: 0 } });
    const snareLoaded = getDerivedStats(SNARE_HULL_ID, SNARE_FIT.slice(), { isPlayer: true, cargo: { usedMass: SNARE_HOLD_T } });
    const snareEmptyVerbs = shipCapabilityVerbs({ derived: snareEmpty, fittings: SNARE_FIT.slice() });
    const snareLoadedVerbs = shipCapabilityVerbs({ derived: snareLoaded, fittings: SNARE_FIT.slice() });

    eventTrace.push({
      tick: host.state.tick | 0, type: 'line:tension_sampled',
      steadyTension: round(steadyTension, 1), predicted: round(predictedTensionAtSwing, 1),
      atSpeed: round(steadySpeed, 1),
    });

    return {
      modelCheck: {
        hullId: HULL_ID, massT: round(massT, 1), lineLengthWu: LINE_LENGTH_WU,
        swungAtWuPerS: SWING_SPEED_WU, steadySpeedWuPerS: round(steadySpeed, 1),
        measuredSteadyTension: round(steadyTension, 1),
        predictedTension: round(predictedTensionAtSwing, 1),
        relativeError: round(tensionError, 3),
      },
      before: { label: 'Drifter with a Transverse Snare, empty hold', massT: round(snareEmpty.operationalMass, 1), verb: snareEmptyVerbs.line.verb, ratedSwingWuPerS: snareEmptyVerbs.line.speedWuPerS },
      after: { label: 'Drifter with a Transverse Snare, ' + SNARE_HOLD_T + ' t of ore aboard', massT: round(snareLoaded.operationalMass, 1), verb: snareLoadedVerbs.line.verb, ratedSwingWuPerS: snareLoadedVerbs.line.speedWuPerS },
      predictedRatedSwingWuPerS: snareEmptyVerbs.line.speedWuPerS,
      predictionHolds,
      note: `a real ${LINE_LENGTH_WU} WU line around a static anchor, settled at `
        + `${round(steadySpeed, 1)} WU/s: SG-02 measured ${round(steadyTension, 1)} of tension where m v^2 / r `
        + `predicts ${round(predictedTensionAtSwing, 1)} (${round(tensionError * 100, 1)} % apart), so the sentence is `
        + `solved from the tension the game actually carries. On the snare line that rating is reachable: the rated `
        + `swing falls from ${snareEmptyVerbs.line.speedWuPerS} WU/s empty to ${snareLoadedVerbs.line.speedWuPerS} WU/s `
        + `with ${SNARE_HOLD_T} t aboard.`,
    };
  } finally {
    host.dispose();
  }
}

function unmeasuredLine(verbs, reason) {
  return {
    before: { verb: verbs.line.verb, ratedSwingWuPerS: verbs.line.speedWuPerS },
    after: null,
    predictedRatedSwingWuPerS: verbs.line.speedWuPerS,
    predictionHolds: false,
    unmeasured: true,
    note: `line load UNMEASURED on the real path: ${reason}`,
  };
}

// --- FIELD DEPLOY ----------------------------------------------------------------------------

async function measureField(seed, eventTrace) {
  const without = await tryDeploy(seed, FIELD_FIT_WITHOUT.slice());
  const withKit = await tryDeploy(seed, FIELD_FIT_WITH.slice());
  const verbFlipped = without.deployed === false && withKit.deployed === true;
  eventTrace.push({ tick: null, type: 'field:before_after', before: without.verb, after: withKit.verb });
  return {
    before: { label: 'Drifter, no launcher', ...without },
    after: { label: 'Drifter, chaff dispenser fitted', ...withKit },
    verbFlipped,
    note: `without a launcher the live countermeasures system refuses the deploy and no field event reaches the bus `
      + `(${without.events} events); with the dispenser fitted it publishes ${withKit.events} — `
      + `"${withKit.verb}".`,
  };
}

async function tryDeploy(seed, fittings) {
  const host = await bootRealPath({
    seed,
    systems: ['actions', 'flightV3', 'physics', combat, countermeasures],
    hulls: [{ hullId: FIELD_HULL_ID, pos: { x: 0, z: 0 }, rot: 0, isPlayer: true, factionId: 'faction_free', fittings }],
  });
  try {
    const player = host.player;
    const derived = getDerivedStats(FIELD_HULL_ID, fittings, host.state.player);
    const verbs = shipCapabilityVerbs({ derived, fittings });
    let events = 0;
    host.bus.on('countermeasure:deployed', () => { events += 1; });
    host.step(2, { before: ({ state }) => { writeRealPathInput(state, {}); } });
    const system = host.runtime.getSystem('countermeasures');
    const deployed = host.withFeatures(() => system._tryDeploy(player)) === true;
    host.step(1, { before: ({ state }) => { writeRealPathInput(state, {}); } });
    return { deployed, events, verb: verbs.field.verb, radiusWu: verbs.field.radiusWu, durationS: verbs.field.durationS };
  } finally {
    host.dispose();
  }
}

// --- shared ----------------------------------------------------------------------------------

function combatKernel(host) {
  const actions = host.runtime.getSystem('actions');
  if (actions && actions.kernel) return actions.kernel;
  const combatSys = host.runtime.getSystem('combat');
  return combatSys && combatSys.kernel ? combatSys.kernel : null;
}

function combatPhysics(host) {
  const helpers = host.runtime.getHelpers && host.runtime.getHelpers();
  if (helpers && helpers.combatPhysics) return helpers.combatPhysics;
  const physicsSys = host.runtime.getSystem('physics');
  return physicsSys && physicsSys._sg02CombatPhysics ? physicsSys._sg02CombatPhysics : null;
}

function planarSpeed(entity) {
  const vel = entity && entity.vel;
  return Math.hypot((vel && vel.x) || 0, (vel && vel.z) || 0);
}

function relativeError(measured, predicted) {
  const m = Number(measured);
  const p = Number(predicted);
  if (!Number.isFinite(m) || !Number.isFinite(p) || Math.abs(p) < 1e-9) return Infinity;
  return Math.abs(m - p) / Math.abs(p);
}

function round(value, digits) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
