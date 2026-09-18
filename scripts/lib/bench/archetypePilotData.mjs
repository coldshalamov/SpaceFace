// scripts/lib/bench/archetypePilotData.mjs — pure data + scoring for the fit-archetype pilots.
//
// Split from archetypePilots.mjs so the identity contract (fits, signatures, scorer) stays
// importable WITHOUT the real-path runtime graph (tacticalAI/aiPorts pull half the app). The
// fast contract test and any UI surface can read this file; the runner imports both.

// The shared content seed and shape. Identical for every archetype — the proof is that the
// FIT, not the content, changes how a run plays.
export const ARCHETYPE_SEED = 20260918;
export const RAIDER_COUNT = 3;
export const TICK_BUDGET = 200 * 60; // a little over three sim minutes
export const RAIDER_ENEMY_TYPE_ID = 'corsair_raider';

const RAIDER_SPREAD = [
  { x: 420, z: -260 },
  { x: -380, z: 340 },
  { x: 120, z: 520 },
];
// The tow: a DYNAMIC heavy body the coupler can actually drag (spawned with dynamic:true), heavy
// enough to clear the flail gate with authority, inside the Drifter tug's tow class.
export const ANCHOR = { x: -420, z: -420, radius: 46, mass: 400 };
export const LATCH_RANGE = 320;
// Terrain: momentum kills need something to be killed AGAINST. Three big static rocks sit at
// the arena's edges — clear of the anchor-to-raider tow lanes, so a flail drag dies by combat,
// not by pathing into a wall.
export const TERRAIN = [
  { x: 520, z: 520, radius: 90, mass: 1_400_000 },
  { x: -520, z: 240, radius: 70, mass: 900_000 },
  { x: 300, z: -560, radius: 80, mass: 1_100_000 },
];

// The four identities. Every fitting id is purchasable on the default route once its tech is
// researched; the same hull (Drifter: weapon M x2 | shield M | engine M | cargo M x2 | mining M |
// utility M x2 | thruster M) carries all four so the diff is the FIT, never the frame.
//
// A signature row is a verb the identity's POLICY guarantees it will use — the acceptance scores
// completion × alive × signature rows present × pairwise profile distance.
export const ARCHETYPES = [
  {
    id: 'momentum_predator',
    label: 'Momentum Predator',
    hullId: 'ship_drifter',
    fittings: ['wpn_concussion_cannon_m', 'wpn_beam_laser_m', 'mod_shield_capacitor_m', 'mod_engine_fusion_m', null, null, null,
      'mod_elastic_whip_m', 'mod_swing_drive_m', null],
    signature: ['whipSnap', 'swingDash'],
    policyId: 'predator',
  },
  {
    id: 'control_specialist',
    label: 'Control Specialist',
    hullId: 'ship_drifter',
    fittings: ['wpn_beam_laser_m', 'wpn_concussion_cannon_m', 'mod_shield_capacitor_m', 'mod_engine_fusion_m', null, null, null,
      'mod_transverse_snare_m', 'mod_decoy_buoy_s', null],
    signature: ['snareDeployed', 'decoyDeployed'],
    policyId: 'control',
  },
  {
    id: 'precision_pilot',
    label: 'Precision Pilot',
    hullId: 'ship_drifter',
    fittings: ['wpn_beam_laser_m', 'wpn_railgun_m', 'mod_shield_capacitor_m', 'mod_engine_fusion_m', null, null, null,
      'mod_monofilament_sweep_m', 'mod_pds_servo_s', null],
    signature: ['shotsFired', 'lineCuts'],
    policyId: 'precision',
  },
  {
    id: 'salvage_industrial',
    label: 'Salvage Industrialist',
    hullId: 'ship_drifter',
    fittings: ['wpn_autocannon_m', null, 'mod_shield_capacitor_m', 'mod_engine_fusion_m', null, null, null,
      'mod_frame_coupler_m', 'mod_mass_flail_rig_m', null],
    signature: ['latches', 'towFlailHit'],
    policyId: 'industrial',
  },
];

export const RAIDER_FITTINGS = ['wpn_pulse_laser_s', null, 'mod_shield_capacitor_m', 'mod_engine_fusion_m', null, null, null, null, null, null];

export function archetypeById(id) {
  return ARCHETYPES.find((row) => row.id === id) || null;
}

// The acceptance scorer: completion × alive × signature rows present × profiles distinct.
//
// Distinctness is measured over the IDENTITY-DISTINCTIVE rows only. Shared plumbing rows
// (shotsFired — a beam publishes per tick — latches, kills) would drown the metric in volume
// every identity emits; the question the distance answers is "do these fits DO different
// things", not "do they do different amounts of the same thing".
const DISTINCTIVENESS_ROWS = [
  'whipSnap', 'whipImpact', 'swingDash',
  'snareDeployed', 'snareCaught', 'decoyDeployed',
  'pdsIntercept', 'towFlailHit', 'lineCuts',
];

export function scorePilotRuns(runs) {
  const problems = [];
  for (const run of runs) {
    if (!run.completed) problems.push(`${run.archetypeId}: did not finish the content (${run.raidersDown}/${RAIDER_COUNT} down in ${run.ticks} ticks)`);
    else if (!run.playerAlive) problems.push(`${run.archetypeId}: finished but died doing it`);
    for (const row of run.signature) {
      if (!(run.verbs[row] > 0)) problems.push(`${run.archetypeId}: signature verb "${row}" never fired (${JSON.stringify(run.verbs)})`);
    }
  }
  const profiles = runs.map((run) => {
    const slice = {};
    for (const row of DISTINCTIVENESS_ROWS) slice[row] = run.verbs[row] || 0;
    return normalize(slice);
  });
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const d = l1(profiles[i], profiles[j]);
      if (d < 1.0) problems.push(`${runs[i].archetypeId} vs ${runs[j].archetypeId}: verb profiles too alike (L1 ${d.toFixed(2)})`);
    }
  }
  return { ok: problems.length === 0, problems };
}

export function normalize(verbs) {
  const total = Object.values(verbs).reduce((a, b) => a + b, 0) || 1;
  const out = {};
  for (const [row, count] of Object.entries(verbs)) out[row] = count / total;
  return out;
}

export function l1(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let d = 0;
  for (const key of keys) d += Math.abs((a[key] || 0) - (b[key] || 0));
  return d;
}

export { RAIDER_SPREAD };
