// src/data/precursorMachines.js — Verge-Layer machine ontology, directive grammar, protocol
// states, and structure registry (doc 07 machine layer + roadmap AE-090..109).
//
// Canon rules (doc 07): the creators stay off-frame and undefined; machines are rule-bound,
// not mystical quest-givers; their vocabulary is procedural ("TRANSIT AUTHORITY REVOKED",
// not riddles). The player's standing with them is a PROTOCOL STATE, never faction rep.
//
// Bridges to existing machinery: machines live under faction_verge_layers IFF (already in
// factions/vergelayers.js), and reveal flags write to state.story.verge (factionPresence +
// galaxyMap already read verge.revealed / verge.awake / verge.revocations).

import { ensureAlienEcologyState } from './alienEcologyState.js';

// ── Machine kinds (AE-093/094/095 + doc 07 §5 families) ───────────────────────────────────
// These are kinematic entities (type 'machine') — no combat AI. Their behavior is a narrow
// authored loop per kind; they never "lose" an encounter because they do not fight.
export const MACHINE_KINDS = Object.freeze({
  surveyor_prism: Object.freeze({
    id: 'surveyor_prism',
    name: 'Surveyor Prism',
    // Non-hostile geometry inspector (doc 07 §4): positions itself between the player and
    // the nearest anomaly, takes a slow sweep, ignores weapons fire entirely.
    radius: 12,
    speed: 26, turnRate: 0.6,
    orbitR: 140,          // stand-off radius while inspecting
    scanPeriodS: 14,      // seconds per sweep beat
    scannerSignalKind: 'anomaly',
    signature: 'machine',
  }),
  custodian: Object.freeze({
    id: 'custodian',
    name: 'Custodian',
    // Maintenance unit (doc 07 §5.1): patrols its structure, repairs surfaces, ignores the
    // player unless maintenance is obstructed.
    radius: 14,
    speed: 18, turnRate: 0.4,
    orbitR: 60,
    repairPeriodS: 9,     // periodic "repair flash" beat at a structure face
    scannerSignalKind: 'anomaly',
    signature: 'machine',
  }),
  auditor: Object.freeze({
    id: 'auditor',
    name: 'Gate Auditor',
    // Protocol evaluator (doc 07 §5.3): parks near a gate/route choke, interrogates any
    // approaching craft once (transponder interrogation = a range check + directive line).
    radius: 16,
    speed: 0,             // it does not chase — it waits where procedure puts it
    turnRate: 0.25,
    interrogateR: 800,
    scannerSignalKind: 'anomaly',
    signature: 'machine',
  }),
});

export function machineKindById(id) {
  return MACHINE_KINDS[id] || null;
}

// ── Directive grammar (AE-092, doc 07 §9) ────────────────────────────────────────────────
// A small vocabulary the player gradually learns to read. Each directive has a plain
// machine line and the resolution rule the runtime layer implements.
export const MACHINE_DIRECTIVES = Object.freeze({
  PRESENT:  Object.freeze({ line: 'PRESENT SPECIMEN.',        resolves: 'offer a flagged biological sample or artifact in range' }),
  VACATE:   Object.freeze({ line: 'VACATE THE VOLUME.',       resolves: 'leave the marked radius within the count window' }),
  HOLD:     Object.freeze({ line: 'HOLD POSITION.',           resolves: 'remain below drift threshold while the machine sweeps' }),
  WITNESS:  Object.freeze({ line: 'WITNESS THE EVENT.',       resolves: 'remain in range through the machine\'s procedure' }),
  RETURN:   Object.freeze({ line: 'RETURN THE OBJECT.',       resolves: 'restore a removed object to the structure volume' }),
  ISOLATE:  Object.freeze({ line: 'ISOLATE CONTAMINATED MATERIAL.', resolves: 'jettison or lock the flagged cargo' }),
  CLOSE:    Object.freeze({ line: 'ROUTE AUTHORITY CLOSED.',  resolves: 'the route is sealed until protocol state improves' }),
  OPEN:     Object.freeze({ line: 'ROUTE AUTHORITY GRANTED.', resolves: 'transit permitted' }),
  APPEAL:   Object.freeze({ line: 'PRESENT COUNTER-EVIDENCE.', resolves: 'show a record that contradicts the classification' }),
});

export function machineDirectiveLine(id) {
  const d = MACHINE_DIRECTIVES[id];
  return d ? d.line : 'PROTOCOL UNRECOGNIZED.';
}

// ── Protocol state model (AE-091, doc 07 §10) ────────────────────────────────────────────
// Ordered ladder + terminal states. Stored on ae.machineProtocol (already persisted).
export const MACHINE_PROTOCOL_ORDER = Object.freeze([
  'unknown', 'observed', 'compliant', 'witnessed', 'exception',
]);
export const MACHINE_PROTOCOL_FAULTS = Object.freeze(['violation', 'revoked']);

/**
 * advanceMachineProtocol — apply a protocol event to ae.machineProtocol.
 * Events (authored): 'seen' (a machine acknowledged you), 'satisfied' (you obeyed a
 * directive), 'witnessed' (you held through a procedure), 'excepted' (one-time grant),
 * 'violated' (you broke a directive), 'revoked' (transit authority pulled).
 * Ladder never silently drops a fault state.
 */
export function advanceMachineProtocol(state, event) {
  const ae = ensureAlienEcologyState(state);
  const cur = ae.machineProtocol || 'unknown';
  const order = MACHINE_PROTOCOL_ORDER;
  const up = (to) => {
    const i = order.indexOf(cur);
    const j = order.indexOf(to);
    if (j > i) ae.machineProtocol = to;
    return ae.machineProtocol;
  };
  switch (event) {
    case 'seen':      return up('observed');
    case 'satisfied': return up(cur === 'observed' ? 'compliant' : cur);
    case 'witnessed': return up('witnessed');
    case 'excepted':  return up('exception');
    case 'violated':  ae.machineProtocol = 'violation'; return 'violation';
    case 'revoked':   ae.machineProtocol = 'revoked'; return 'revoked';
    default:          return cur;
  }
}

/** Numeric rank for gate checks — faults rank below unknown. */
export function machineProtocolRank(protocol) {
  const i = MACHINE_PROTOCOL_ORDER.indexOf(protocol);
  if (i >= 0) return i + 1;
  return MACHINE_PROTOCOL_FAULTS.includes(protocol) ? -1 : 0;
}

// ── Scanner language (AE-097) — a SECOND vocabulary ladder for signature 'machine' ───────
// The same reveal ladder, but the machine layer reads sterile and procedural.
const MACHINE_SCAN_TERMS = Object.freeze([
  'UNRESOLVED SIGNAL SOURCE',
  'NON-HUMAN EMITTER',
  'PREDECESSOR LATTICE — INSTRUMENT CLASS',
  'VERGE-LAYER CONSTRUCT',
]);

export function scannerMachineLabel(machineProtocol) {
  const rank = machineProtocolRank(machineProtocol);
  const tier = Math.max(0, Math.min(MACHINE_SCAN_TERMS.length - 1, rank));
  return MACHINE_SCAN_TERMS[tier];
}

// ── Suppression fields (AE-096) ──────────────────────────────────────────────────────────
// Volumes where shared-field coherence collapses: fauna inside lose relay coherence and
// scatter (the "dead pocket" / safe-corridor mechanic). Volumes live on machine sites below.
export function suppressionFieldAt(sectorId, x, z) {
  for (const site of machineSitesForSector(sectorId)) {
    if (!site.suppression) continue;
    const dx = x - site.center.x;
    const dz = z - site.center.z;
    if (dx * dx + dz * dz <= site.suppression.radius * site.suppression.radius) {
      return site;
    }
  }
  return null;
}

// ── Structure + machine site registry (AE-100..108) ──────────────────────────────────────
// Each site is a dressing + behavior bundle: structures spawn as `machine_*` place props
// (partsLibrary fallback builders), machines as kinematic 'machine' entities.
//   kind:          visual family — 'pylon_ring' | 'monolith' | 'ossuary' | 'vault' |
//                  'corridor' | 'gate_underlayer' | 'maintenance'
//   center/radius: sector-local placement
//   machines:      machine entities to spawn (kind + local offset)
//   suppression:   optional AE-096 field {radius}
//   directive:     the grammar line it speaks on first approach (protocol beat)
//   reveal:        story.verge flag set on first close scan ('revealed')
//   revokedRoute:  for the revoked route site — the route it administratively seals
export const MACHINE_SITES = Object.freeze({
  charon_pylon_field: Object.freeze({
    siteId: 'charon_pylon_field',
    sectorId: 'sector_charon_expanse',
    poiId: 'poi_charon_pylon_field',
    name: 'Quarantine Pylon Field',
    kind: 'pylon_ring',
    center: Object.freeze({ x: 2400, z: 600 }),
    radius: 480,
    // AE-100: three pylons forming an exclusion triangle over the nursery's approach lane.
    propRing: Object.freeze({ count: 3, radius: 320, propId: 'machine_pylon' }),
    suppression: Object.freeze({ radius: 360 }),
    directive: 'VACATE',
    beat: 'The insects scatter. Whatever built this still considers the lane closed.',
    reveals: 'revealed',
  }),
  veil_survey_monolith: Object.freeze({
    siteId: 'veil_survey_monolith',
    sectorId: 'sector_veil_nebula',
    poiId: 'poi_veil_survey_monolith',
    name: 'Survey Monolith',
    kind: 'monolith',
    center: Object.freeze({ x: -1400, z: 600 }),
    radius: 120,
    propRing: Object.freeze({ count: 1, radius: 0, propId: 'machine_monolith' }),
    machines: Object.freeze([Object.freeze({ kind: 'surveyor_prism', dx: 80, dz: -60 })]),
    directive: 'HOLD',
    beat: 'The monolith maps the sector without acknowledging you. The prism adjusts its sweep to include your hull.',
    reveals: 'revealed',
  }),
  veil_null_corridor: Object.freeze({
    siteId: 'veil_null_corridor',
    sectorId: 'sector_veil_nebula',
    poiId: 'poi_veil_null_corridor',
    name: 'Null Corridor',
    kind: 'corridor',
    // AE-102: a safe lane through the nebula's contamination — a line of spine props.
    center: Object.freeze({ x: 300, z: -900 }),
    radius: 900,
    propRing: Object.freeze({ count: 5, radius: 700, propId: 'machine_spine', linear: true }),
    suppression: Object.freeze({ radius: 900 }),
    directive: null,
    beat: 'Contacts drop off your scope inside an invisible lane. The corridor reads sterile — deliberately.',
    reveals: null,
  }),
  ashfall_gate_underlayer: Object.freeze({
    siteId: 'ashfall_gate_underlayer',
    sectorId: 'sector_ashfall_reach',
    poiId: 'poi_ashfall_gate_underlayer',
    name: 'Gate Underlayer',
    kind: 'gate_underlayer',
    // AE-103: ancient geometry beneath human retrofit on the Ashfall boss-arena approach.
    center: Object.freeze({ x: 1600, z: -1600 }),
    radius: 300,
    propRing: Object.freeze({ count: 4, radius: 220, propId: 'machine_plate' }),
    machines: Object.freeze([Object.freeze({ kind: 'custodian', dx: 40, dz: 30 })]),
    directive: 'WITNESS',
    beat: 'Maintenance arms work the gate\'s original geometry — the human gantries are scaffolding on something much older.',
    reveals: 'revealed',
  }),
  ashfall_machine_ossuary: Object.freeze({
    siteId: 'ashfall_machine_ossuary',
    sectorId: 'sector_ashfall_reach',
    poiId: 'poi_ashfall_ossuary',
    name: 'Machine Ossuary',
    kind: 'ossuary',
    // AE-104: inactive machines racked in storage rows — humans read it as a graveyard.
    center: Object.freeze({ x: -2000, z: -1200 }),
    radius: 600,
    propRing: Object.freeze({ count: 14, radius: 420, propId: 'machine_husk', rows: 7 }),
    directive: null,
    beat: 'Hundreds of dormant frames arranged in perfect rank order. None of them are broken — they are stored.',
    reveals: null,
  }),
  ashfall_black_vault: Object.freeze({
    siteId: 'ashfall_black_vault',
    sectorId: 'sector_ashfall_reach',
    poiId: 'poi_ashfall_black_vault',
    name: 'Black Vault',
    kind: 'vault',
    // AE-105: sealed containment. Not a loot room — the point is that it stays shut.
    center: Object.freeze({ x: 2200, z: 2000 }),
    radius: 90,
    propRing: Object.freeze({ count: 1, radius: 0, propId: 'machine_vault' }),
    suppression: Object.freeze({ radius: 240 }),
    directive: 'VACATE',
    beat: 'The vault answers your scan with a thermal signature and nothing else. Something in it is still cold.',
    reveals: null,
  }),
  ashfall_maintenance_scene: Object.freeze({
    siteId: 'ashfall_maintenance_scene',
    sectorId: 'sector_ashfall_reach',
    poiId: 'poi_ashfall_maintenance',
    name: 'Active Maintenance',
    kind: 'maintenance',
    // AE-106: a Custodian actively repairing a pylon — machine labor in real time.
    center: Object.freeze({ x: 600, z: -2200 }),
    radius: 200,
    propRing: Object.freeze({ count: 1, radius: 0, propId: 'machine_pylon' }),
    machines: Object.freeze([
      Object.freeze({ kind: 'custodian', dx: 60, dz: 40 }),
      Object.freeze({ kind: 'surveyor_prism', dx: -120, dz: 80 }),
    ]),
    directive: 'WITNESS',
    beat: 'A working machine does repairs at geological patience. It registered you hours ago and does not care.',
    reveals: 'revealed',
  }),
  veil_revoked_gate: Object.freeze({
    siteId: 'veil_revoked_gate',
    sectorId: 'sector_veil_nebula',
    poiId: 'poi_veil_revoked_gate',
    name: 'Revoked Transit',
    kind: 'revoked_route',
    // AE-108: an intact gate whose authority is administratively pulled. The auditor here
    // evaluates approach protocol state — it is not broken, it is closed.
    center: Object.freeze({ x: 2100, z: -1600 }),
    radius: 260,
    propRing: Object.freeze({ count: 1, radius: 0, propId: 'machine_gate_ring' }),
    machines: Object.freeze([Object.freeze({ kind: 'auditor', dx: -140, dz: 0 })]),
    directive: 'CLOSE',
    revokedRoute: 'wormhole', // evaluates machine protocol before transit authorization
    beat: 'TRANSIT AUTHORITY REVOKED. BIOLOGICAL CONDITION UNRESOLVED. APPEAL WINDOW CLOSED.',
    reveals: 'revealed',
  }),
});

export function machineSitesForSector(sectorId) {
  return Object.values(MACHINE_SITES).filter((site) => site.sectorId === sectorId);
}

/** First machine-site close-approach sets story.verge.revealed (AE-090/091 bridge). */
export function machineRevealsVerge(state) {
  const story = state && state.story;
  if (!story || typeof story !== 'object') return false;
  const verge = story.verge || (story.verge = {});
  if (verge.revealed) return false;
  verge.revealed = true;
  return true;
}

// AE-109 — Witness Mark: a machine-recorded status; once earned, other machines skip
// interrogation. Persisted as ae.machineAccess.witnessMark.
export function grantWitnessMark(state, source) {
  const ae = ensureAlienEcologyState(state);
  if (!ae.machineAccess || typeof ae.machineAccess !== 'object') ae.machineAccess = {};
  if (ae.machineAccess.witnessMark) return false;
  ae.machineAccess.witnessMark = { grantedAt: Number(state && state.simTime) || 0, source: source || null };
  advanceMachineProtocol(state, 'witnessed');
  return true;
}

export function hasWitnessMark(state) {
  const ae = state && state.world && state.world.alienEcology;
  return !!(ae && ae.machineAccess && ae.machineAccess.witnessMark);
}
