// src/data/tare.js — TARE / WG-2, the weighing robot on the dead scale deck (W-SHIFT
// row 506, 03 §4.3). Dione Lane is a customs lane — "customs reads, then the convoy
// leaves" — and its decommissioned scale still works because the robot never left it.
// Bring it a body of an exact mass and it reads the truth aloud; hit the requested
// mass inside its tolerance and it pays one weighed Measure Engine fragment — the
// same `verge_measure_fragment` + `weighedMass` contract the Line-site Class trial in
// src/systems/faction_verge.js already consumes, so TARE's payment is the trial's key.
export const TARE = Object.freeze({
  sectorId: 'sector_dione_lane',
  // The dead scale deck off the Dione Exchange apron (station_dione 920,280 — the old
  // weigh bay sits down-lane of the live berths).
  post: Object.freeze({ x: 620, z: 40 }),
  // The plate: a body counts as "on the scale" inside this radius.
  deckRadius: 160,
  // It only weighs what is actually ON the plate — a body screaming through is a flyby,
  // not a delivery. The latch is a rest threshold, same honesty the depot latch uses.
  settleSpeed: 6,
  // The ladder: four requested masses spanning the throwable range — shards and
  // debris at the bottom, small rocks and wreck bodies at the top (belt rock runs
  // 200 + size·40 through sectorPhysical; salvage bodies run 14–90).
  targets: Object.freeze([15, 45, 90, 240]),
  // "Exact" to the robot means honest inside ten percent — tight enough you must
  // hunt for it, wide enough a real debris field answers.
  toleranceRatio: 0.10,
  // The payment: one weighed fragment per passed step. TARE is a weighing machine —
  // it stamps its own payment, which is exactly what the trial demands.
  fragmentMass: 12,
  fragmentSpawnOffset: 40,
  stepFlag: 'tare_step',
  paidFlag: 'tare_paid',
  masteryFlag: 'tare_mastery',
  goneFlag: 'tare_gone',
  sender: 'TARE / WG-2',
  callsign: 'WG-2',
  // Voice: the Line's caps register (02 §Measure Engines) — the robot IS their kin.
  // Canon payoff line: "Tare set. Bring me something true."
  tareSet: 'TARE SET. BRING ME SOMETHING TRUE.',
  massTrue: 'MASS RECORDED: {mass} — TRUE.',
  massCorrect: 'MASS CORRECT. FRAGMENT PAID.',
  massIncorrect: 'MASS RECORDED. MASS INCORRECT.',
  nextTarget: 'TARE SET. BRING ME MASS: {target}.',
  masteryLine: 'FOUR MASSES TRUE. THE LINE KNOWS YOUR NAME.',
  goneLine: 'SCALE DUTY ENDED. THE LANE WEIGHS ITSELF NOW.',
});
