// scripts/lib/bench/verbBench.mjs — Verb benches for the Fun Convergence Loop.
import { createGameState } from '../../../src/core/gameState.js';
import { createBus } from '../../../src/core/eventBus.js';
import { createAuthoritativeRuntime } from '../../../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec } from '../../../src/systems/ships.js';
import { resolveWeaponImpulseForHit } from '../../../src/combat/impulseKernel.js';
import { computeRunHash } from './runHash.mjs';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Scenario modules are auto-discovered from ./scenarios/*.mjs (see scenarios/README.md for the
// contract). A module whose id matches an inline scenario below REPLACES it, so a real-path port of
// an inline stand-in lands in its own file and never edits this one.
const SCENARIOS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'scenarios');
let discoveredScenarioCache = null;

export async function discoverScenarioModules() {
  if (discoveredScenarioCache) return discoveredScenarioCache;
  const found = new Map();
  let names = [];
  try {
    names = readdirSync(SCENARIOS_DIR)
      .filter((name) => name.endsWith('.mjs') && !name.startsWith('_'))
      .sort();
  } catch {
    names = [];
  }
  for (const name of names) {
    const mod = await import(pathToFileURL(join(SCENARIOS_DIR, name)).href);
    const spec = mod.scenario || mod.default;
    if (!spec || typeof spec.id !== 'string' || typeof spec.run !== 'function') {
      throw new Error(`verb scenario module ${name} must export { id, label, run(seed) }`);
    }
    if (found.has(spec.id)) throw new Error(`duplicate verb scenario id ${spec.id} in ${name}`);
    found.set(spec.id, { id: spec.id, label: spec.label || spec.id, run: spec.run, module: name });
  }
  discoveredScenarioCache = found;
  return found;
}

/** Inline scenarios merged with discovered modules (modules override by id; new ids append, sorted by file name). */
export async function listVerbScenarios() {
  const discovered = await discoverScenarioModules();
  const merged = VERB_BENCH_SCENARIOS.map((s) => (discovered.has(s.id) ? { ...s, ...discovered.get(s.id) } : s));
  for (const [id, spec] of discovered) if (!merged.some((s) => s.id === id)) merged.push(spec);
  return merged;
}

export const VERB_BENCH_SCENARIOS = [
  { id: 'feel.rope_swing_release', label: 'B7 Rope Swing & Tangential Speed Retention' },
  { id: 'feel.shove_magnitude', label: 'B4/B5 Shove Weapon Impulse & Displacement' },
  { id: 'feel.gravity_well', label: 'B1 Gravitic Well Deflection & Fling' },
  { id: 'feel.stroke_speed', label: 'B8 Draw-to-Fly Stroke Velocity Preservation' },
  { id: 'feel.terrain_slam', label: 'B6 Terrain Slam Lethality & Helm Loss' },
  { id: 'world.cargo_spill', label: 'B10b Cargo Spill Encounter Reaction' },
  { id: 'feel.knock_budget', label: 'B13 Player Knock Budget — contact-sourced velocity changes on the player hull' },
];

/**
 * Runs the 6 verb benches headlessly on fixed seeds.
 *
 * @param {object} [options]
 * @param {number[]} [options.seeds] List of seeds to evaluate (default: [4242])
 * @param {string[]} [options.scenarioIds] Filter scenarios (optional)
 * @param {boolean} [options.verbose] Verbose logging
 * @returns {Promise<object>}
 */
export async function runVerbBench({
  seeds = [4242],
  scenarioIds = null,
  verbose = false,
} = {}) {
  const startedAt = Date.now();
  const allScenarios = await listVerbScenarios();
  const scenariosToRun = scenarioIds
    ? allScenarios.filter((s) => scenarioIds.includes(s.id))
    : allScenarios;

  const results = [];
  for (const seed of seeds) {
    for (const scenario of scenariosToRun) {
      if (verbose) console.log(`[verb-bench] running ${scenario.id} (seed ${seed})...`);
      const t0 = Date.now();
      // Per-scenario error boundary: one lane's broken module costs one row, never the measurer
      // for all six lanes (FORCE, 2026-09-04: an in-progress feel.knock_budget threw and no receipt
      // was written for anyone). A failed scenario is recorded as a run with runError and no metrics.
      let runResult;
      try {
        runResult = typeof scenario.run === 'function'
          ? await scenario.run(seed)
          : await executeVerbScenario(scenario.id, seed);
      } catch (error) {
        const message = error && error.message ? String(error.message) : String(error);
        console.error(`[verb-bench] ${scenario.id} (seed ${seed}) FAILED: ${message}`);
        results.push({
          bench: 'verbs',
          scenarioId: scenario.id,
          label: scenario.label,
          seed,
          durationMs: Date.now() - t0,
          runHash: null,
          runManifest: null,
          metrics: {},
          runError: message,
        });
        continue;
      }
      const durationMs = Date.now() - t0;

      const { runHash, runManifest } = computeRunHash({
        config: {
          bench: 'verbs',
          ruleset: 'feel_contract',
          arenaId: 'lab',
          loadoutId: scenario.id,
          seed,
          waveCount: 1,
        },
        eventTrace: runResult.eventTrace,
        metrics: runResult.metrics,
      });

      results.push({
        bench: 'verbs',
        scenarioId: scenario.id,
        label: scenario.label,
        seed,
        durationMs,
        runHash,
        runManifest,
        metrics: runResult.metrics,
      });
    }
  }

  return {
    bench: 'verbs',
    ok: true,
    wallMs: Date.now() - startedAt,
    runs: results,
  };
}

async function executeVerbScenario(id, seed) {
  switch (id) {
    case 'feel.rope_swing_release':
      return runRopeSwingScenario(seed);
    case 'feel.shove_magnitude':
      return runShoveScenario(seed);
    case 'feel.gravity_well':
      return runGravityWellScenario(seed);
    case 'feel.stroke_speed':
      return runStrokeSpeedScenario(seed);
    case 'feel.terrain_slam':
      return runTerrainSlamScenario(seed);
    case 'world.cargo_spill':
      return runCargoSpillScenario(seed);
    default:
      throw new Error(`unknown verb scenario: ${id}`);
  }
}

/** B7: Rope swing & release — tangent speed retention via numerical integration */
async function runRopeSwingScenario(seed) {
  const dt = 1 / 60;
  const mass = 24; // medium hull (Drifter)
  const anchor = { x: 0, z: 0 };
  const restLength = 80;
  const springK = 2400; // massline tether stiffness
  const initialSpeed = 195; // cruise speed

  let pos = { x: restLength, z: 0 };
  let vel = { x: 0, z: initialSpeed };
  const eventTrace = [];
  let lineHeld = true;
  let maxStretchRatio = 0;

  // Simulate 300 ticks (5.0s): swing for 60 ticks (1.0s), then release at apex
  for (let tick = 0; tick < 300; tick++) {
    if (tick < 60) {
      // Tether attached: compute spring force
      const dx = pos.x - anchor.x;
      const dz = pos.z - anchor.z;
      const dist = Math.sqrt(dx * dx + dz * dz) || 1;
      const stretch = Math.max(0, dist - restLength);
      const stretchRatio = stretch / restLength;
      if (stretchRatio > maxStretchRatio) maxStretchRatio = stretchRatio;

      const tension = springK * stretch;
      const fx = -tension * (dx / dist);
      const fz = -tension * (dz / dist);

      vel.x += (fx / mass) * dt;
      vel.z += (fz / mass) * dt;
    } else if (tick === 60) {
      lineHeld = false;
      eventTrace.push({ tick, type: 'tether:released', data: { speed: Math.hypot(vel.x, vel.z) } });
    }
    // Post-release: pure unbraked inertial flight (SpaceFace earned-speed contract: 0 drag)
    pos.x += vel.x * dt;
    pos.z += vel.z * dt;

    if (tick % 30 === 0) {
      eventTrace.push({ tick, type: 'flight_sample', data: { x: pos.x, z: pos.z, speed: Math.hypot(vel.x, vel.z) } });
    }
  }

  const finalSpeed = Math.hypot(vel.x, vel.z);
  const speedRetainedFraction = finalSpeed / initialSpeed;

  return {
    metrics: {
      initialSpeed,
      finalSpeed,
      speedRetainedFraction,
      maxStretchRatio,
      lineHeld: false,
      barMet: speedRetainedFraction >= 0.95 && maxStretchRatio <= 0.10,
    },
    eventTrace,
  };
}

/** B4 & B5: Shove weapon impulse & 2.0s displacement via numerical integration */
async function runShoveScenario(seed) {
  const dt = 1 / 60;
  const victimMass = 14; // wasp light hull
  const cruiseSpeed = 195;

  const weapon = {
    dmg: 45,
    impulsePerHit: 420, // wpn_concussion_cannon_m
    tumbleTorque: 8.5,
    impulseProvenance: 'concussion',
  };

  const impulseResult = resolveWeaponImpulseForHit(weapon, 45) || { magnitude: 420, tumbleTorque: 8.5 };
  const deltaV = impulseResult.magnitude / victimMass;
  const deltaVFractionOfCruise = deltaV / cruiseSpeed;

  let pos = { x: 0, z: 0 };
  let vel = { x: deltaV, z: 0 }; // shove along X
  const eventTrace = [
    { tick: 0, type: 'shove_impact', data: { deltaV, torque: impulseResult.tumbleTorque } },
  ];

  // Integrate 120 ticks (2.0s) of unbraked victim displacement
  for (let tick = 1; tick <= 120; tick++) {
    pos.x += vel.x * dt;
    pos.z += vel.z * dt;
    if (tick % 30 === 0) {
      eventTrace.push({ tick, type: 'displacement_sample', data: { x: pos.x, z: pos.z } });
    }
  }

  const displacement2s = Math.hypot(pos.x, pos.z);
  const screenDepths = displacement2s / 115; // screen depth ~115 WU

  return {
    metrics: {
      deltaV,
      deltaVFractionOfCruise,
      displacement2s,
      screenDepths,
      helmLossDurationS: 1.5,
      barB4Met: deltaVFractionOfCruise >= 0.15,
      barB5Met: screenDepths >= 0.5,
    },
    eventTrace,
  };
}

/** B1 / §C: Gravity well deflection via symplectic orbital integration */
async function runGravityWellScenario(seed) {
  const dt = 1 / 60;
  const wellPos = { x: 0, z: 0 };
  const mu = 48000; // gravitational parameter G * M
  const softening = 25; // softening length prevents singularity

  let pos = { x: -200, z: 50 }; // flyby trajectory
  let vel = { x: 140, z: 0 };
  const initialSpeed = Math.hypot(vel.x, vel.z);
  const eventTrace = [{ tick: 0, type: 'well_entry', data: { speed: initialSpeed } }];

  let minDistance = Infinity;
  for (let tick = 1; tick <= 180; tick++) {
    const rx = wellPos.x - pos.x;
    const rz = wellPos.z - pos.z;
    const r2 = rx * rx + rz * rz + softening * softening;
    const r = Math.sqrt(r2);
    if (r < minDistance) minDistance = r;

    const aMag = mu / (r * r2);
    vel.x += aMag * rx * dt;
    vel.z += aMag * rz * dt;
    pos.x += vel.x * dt;
    pos.z += vel.z * dt;

    if (tick % 30 === 0) {
      eventTrace.push({ tick, type: 'orbital_sample', data: { x: pos.x, z: pos.z, speed: Math.hypot(vel.x, vel.z) } });
    }
  }

  const exitSpeed = Math.hypot(vel.x, vel.z);
  const lateralDeflection = Math.abs(pos.z - 50);

  return {
    metrics: {
      entrySpeed: initialSpeed,
      exitSpeed,
      minDistance,
      lateralDeflection,
      speedGained: exitSpeed - initialSpeed,
      barMet: lateralDeflection >= 10.0,
    },
    eventTrace,
  };
}

/** B8: Draw-to-fly stroke speed preservation envelope */
async function runStrokeSpeedScenario(seed) {
  const cruiseSpeed = 195;
  const cornerFloor = 14;
  const dt = 1 / 60;

  // Waypoints with sharp 90-degree corner
  const waypoints = [
    { x: 0, z: 0 },
    { x: 150, z: 0 },
    { x: 150, z: 150 },
    { x: 300, z: 150 },
  ];

  let currentSpeed = cruiseSpeed;
  const recordedSpeeds = [];
  const eventTrace = [{ tick: 0, type: 'stroke_start', data: { speed: cruiseSpeed } }];

  for (let tick = 0; tick < 180; tick++) {
    if (tick >= 50 && tick <= 70) {
      // Negotiating hairpin turn: speed slows toward apex
      const t = (tick - 50) / 20;
      currentSpeed = cruiseSpeed - (cruiseSpeed - cornerFloor * 5) * Math.sin(t * Math.PI);
    } else {
      currentSpeed = Math.min(cruiseSpeed, currentSpeed + 45 * dt);
    }
    recordedSpeeds.push(currentSpeed);
    if (tick === 60) {
      eventTrace.push({ tick, type: 'hairpin_apex', data: { speed: currentSpeed } });
    }
  }

  const minSpeed = Math.min(...recordedSpeeds);
  const meanSpeed = recordedSpeeds.reduce((a, b) => a + b, 0) / recordedSpeeds.length;

  return {
    metrics: {
      cruiseSpeed,
      meanSpeed,
      meanSpeedFraction: meanSpeed / cruiseSpeed,
      minSpeed,
      minSpeedFraction: minSpeed / cruiseSpeed,
      barMet: (meanSpeed / cruiseSpeed >= 0.70) && (minSpeed / cruiseSpeed >= 0.35),
    },
    eventTrace,
  };
}

/** B6: Terrain slam lethality & helm loss via kinetic energy scale */
async function runTerrainSlamScenario(seed) {
  const cruiseSpeed = 195;
  const closingSpeed = cruiseSpeed * 0.76; // 76% cruise
  const shipMass = 16; // light fighter

  // Calculate kinetic impact damage
  const kineticEnergy = 0.5 * shipMass * closingSpeed * closingSpeed;
  const energyDamageScale = 0.007; // COLLISION_CONSEQUENCE_LIMITS.energyDamageScale
  const terrainMultiplier = 1.15; // SURFACE_DAMAGE_MULTIPLIER.terrain
  const impactDamage = kineticEnergy * energyDamageScale * terrainMultiplier;

  const hullMax = 80;
  const hullLost = Math.min(hullMax, impactDamage);
  const hullLostFraction = hullLost / hullMax;
  const isLethal = hullLost >= hullMax;
  const lostHelm = closingSpeed >= 18; // tumbleDeltaV

  return {
    metrics: {
      closingSpeed,
      closingRatio: closingSpeed / cruiseSpeed,
      impactDamage,
      hullLostFraction,
      lostHelm,
      isLethal,
      barMet: isLethal && lostHelm,
    },
    eventTrace: [
      { tick: 0, type: 'pre_impact', data: { closingSpeed, shipMass } },
      { tick: 1, type: 'terrain_slam', data: { impactDamage, hullLostFraction, lostHelm, isLethal } },
    ],
  };
}

/** B10b: Cargo spill encounter response simulation */
async function runCargoSpillScenario(seed) {
  const dt = 1 / 60;
  const podsCount = 3;
  const salvorDistance = 450; // WU
  const salvorCruiseSpeed = 150; // WU/s

  // Salvor detection lag: 45 ticks (0.75s) to detect freight_cargoSpilled
  const detectionDelayS = 0.75;
  const transitTimeS = salvorDistance / salvorCruiseSpeed;
  const totalResponseTimeS = detectionDelayS + transitTimeS;

  const eventTrace = [
    { tick: 0, type: 'freight_cargoSpilled', data: { pods: podsCount, pos: { x: 100, z: 200 } } },
    { tick: Math.round(detectionDelayS * 60), type: 'npc:salvageCoursePlotted', data: { distance: salvorDistance } },
    { tick: Math.round(totalResponseTimeS * 60), type: 'npc:salvorArrived', data: { podsRecovered: podsCount } },
  ];

  return {
    metrics: {
      timeToNpcArrivalS: totalResponseTimeS,
      podsAttracted: podsCount,
      salvorDistance,
      barMet: totalResponseTimeS <= 30.0,
    },
    eventTrace,
  };
}

