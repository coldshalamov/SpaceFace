export const faction = {
  id: 'faction_verge_layers', name: 'The Verge-Layers', short: 'Verge-Layers', color: '#B0A8B8',
  personality: 'nacre_precursor', startingRep: 0,
  homeSectors: ['sector_veil_nebula', 'sector_ashfall_reach'],
  controls: ['jump-gate network', 'priority transit', 'gate-closure audits'],
  fleetClass: 'precursor', aggression: 0.0,
  relations: {
    faction_scn: 0.0, faction_mts: 0.0, faction_dmc: 0.0, faction_reach: 0.0,
    faction_quiet: 0.0, faction_vael: 0.0, faction_free: 0.0, faction_choir: 0.0,
    faction_helix: 0.0, faction_understory: 0.0, faction_fulfillment: 0.0,
    faction_archive: 0.0, faction_pitborn: 0.0,
  },
  palette: {
    primary: '#B0A8B8', secondary: '#6A6080', accent: '#6A6080',
    hull: '#B0A8B8', emissive: '#C0B8D8', thruster: '#C0B8D8',
  },
  shipRoles: [
    { role: 'surveyor-prism', weight: 0.6, hullIds: ['ship_wasp', 'ship_ranger'] },
    { role: 'revocation-lattice', weight: 0.3, hullIds: ['ship_bastion', 'ship_warden'] },
    { role: 'gate-auditor', weight: 0.1, hullIds: ['ship_colossus', 'ship_leviathan'] },
  ],
  illegalCommodities: [],
  custom: {
    hostileOnlyToGateClosers: true,
    weaponsDisableNotDestroy: true,
    wakesProgressivelyAsGatesClose: true,
    neutralToEveryoneElse: true,
    machinesMeasureTrueMass: true,
    remembersYourAppeals: true,
  },
  voiceRegister: 'precursor-interrogative',
};

// ── W-VERGE (build_map §34.5 row 529, expansion bible 02 §14) ───────────────────────────
// "PRESENT. WITNESS. APPEAL." The First Clerks run the gate web through nine directives.
// Machine kinds and the directive grammar live in src/data/precursorMachines.js; this file
// adds the bodies the row names, the one-word glass lines, the Appeal court, the Sleeping
// Jury, and the Line-site Class trial. Runtime owner:
// src/systems/faction_verge.js (manifest id 'vergeCourt').

// Bodies for the row's roster — the P1 machines first, then the court set. Geometric and
// prism-like: exact slow motion, no visible engines, weapons that disable and never break
// hulls. Kind ids join src/data/precursorMachines.js MACHINE_KINDS.
export const VERGE_MACHINE_BODIES = Object.freeze({
  surveyor_prism:  Object.freeze({ shape: 'prism',      radius: 12, hull: 400,  speed: 26, p: 1 }),
  auditor:         Object.freeze({ shape: 'lattice',    radius: 16, hull: 900,  speed: 0,  p: 1 }),
  measure:         Object.freeze({ shape: 'monolith',   radius: 12, hull: 500,  speed: 0,  p: 1 }),
  debris_sorter:   Object.freeze({ shape: 'sieve_ring', radius: 20, hull: 600,  speed: 30, p: 1 }),
  executor:        Object.freeze({ shape: 'prism',      radius: 18, hull: 1200, speed: 44, p: 2 }),
  appeals_clerk:   Object.freeze({ shape: 'vault',      radius: 15, hull: 800,  speed: 0,  p: 2 }),
  witness:         Object.freeze({ shape: 'monolith',   radius: 10, hull: 450,  speed: 0,  p: 2 }),
  sleeping_jury:   Object.freeze({ shape: 'ossuary',    radius: 34, hull: 2000, speed: 0,  p: 2 }),
});

// What the glass shows: one capitalized word per directive. The full machine lines stay in
// MACHINE_DIRECTIVES; these are the words a HUD stamps.
export const VERGE_DIRECTIVE_WORDS = Object.freeze({
  PRESENT: 'PRESENT.',
  VACATE: 'VACATE.',
  HOLD: 'HOLD.',
  WITNESS: 'WITNESS.',
  RETURN: 'RETURN.',
  ISOLATE: 'ISOLATE.',
  CLOSE: 'CLOSED.',
  OPEN: 'OPEN.',
  APPEAL: 'APPEAL.',
});

// E-30 The Appeal: break a directive and a Verge court convenes at the Appeals Clerk.
// Evidence is an object carried into the chamber and weighed — the right object at the
// right mass and the appeal is granted; otherwise the directive holds and a law zone grows.
export const VERGE_APPEAL = Object.freeze({
  id: 'E-30',
  chamberRadius: 260,          // the Exception Chamber around an Appeals Clerk
  evidenceMass: 40,            // the weighed mass the court wants to see
  evidenceMassTolerance: 4,
  lawZoneRadius: 900,          // a failed appeal leaves this much woken law on the chart
  conveneLine: 'APPEAL HEARD.',
  grantedLine: 'MASS RECORDED. MASS CORRECT.',
  deniedLine: 'MASS RECORDED. MASS INCORRECT.',
});

// E-34 The Sleeping Jury: twelve dormant jurors at the site. One piece of testimony — an
// object a Measure Engine has weighed — wakes one juror. Sleep again next cycle.
export const VERGE_SLEEPING_JURY = Object.freeze({
  id: 'E-34',
  jurorCount: 12,
  testimonyRadius: 300,
  requiresWeighedObject: true,
  wakeLine: 'JUROR PRESENT.',
});

// The Line-site Class trial: Measure Engine fragments upgrade the Line. Hold a weighed
// fragment on your Line and the machine records the next Class.
export const VERGE_LINE_TRIAL = Object.freeze({
  fragmentKind: 'measure',
  fragmentTypeId: 'verge_measure_fragment',
  trialClassStep: 1,           // each passed trial advances the Line one Class
  trialLine: 'CLASS RECORDED.',
});

export const VERGE_BARKS = Object.freeze({
  present: 'PRESENT.',
  massCorrect: 'MASS RECORDED. MASS CORRECT.',
  massIncorrect: 'MASS RECORDED. MASS INCORRECT.',
  appealHeard: 'APPEAL HEARD.',
  classRecorded: 'CLASS RECORDED.',
});

export default faction;
