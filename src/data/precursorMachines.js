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

  // ── Phase 24 machine wave B (AE-232..AE-241, doc 07 I-table remainder) ──
  witness: Object.freeze({
    id: 'witness',
    name: 'Witness',
    // AE-232 (I05): has observed one site for millennia — zero motion; the WITNESS
    // directive inverts and asks the PLAYER to hold still through its procedure.
    radius: 18,
    speed: 0, turnRate: 0.15,
    observeR: 900,
    scannerSignalKind: 'anomaly',
    signature: 'machine',
  }),
  shepherd: Object.freeze({
    id: 'shepherd',
    name: 'Shepherd Engine',
    // AE-233 (I06): maintains a safe corridor through infected space — a moving
    // suppression field drifting a fixed patrol between its site anchors.
    radius: 30,
    speed: 22, turnRate: 0.35,
    patrolPeriodS: 120,
    suppressionRadius: 420, // moving dead-pocket; suppressionEntityAt reads this
    scannerSignalKind: 'anomaly',
    signature: 'machine',
  }),
  mason: Object.freeze({
    id: 'mason',
    name: 'Mason',
    // AE-234 (I07): repairs massive infrastructure — crossing its work path while it
    // welds earns a HOLD directive (it welds around you, not through you).
    radius: 26,
    speed: 10, turnRate: 0.3,
    orbitR: 220,
    weldPeriodS: 40,
    scannerSignalKind: 'anomaly',
    signature: 'machine',
  }),
  executor: Object.freeze({
    id: 'executor',
    name: 'Executor',
    // AE-235 (I08): rare enforcement machine — only activates while protocol reads
    // 'revoked'. The threat the grammar implies, made flesh.
    radius: 22,
    speed: 55, turnRate: 0.9,
    shadowR: 500,          // shadows the revoking hull at standoff — never rams
    quarantinePulseR: 600, // AE-270 (M09): scrubs biohazard within radius
    pulsePeriodS: 60,
    scannerSignalKind: 'anomaly',
    signature: 'machine',
  }),
  courier: Object.freeze({
    id: 'courier',
    name: 'Courier Frame',
    // AE-236 (I09): carries a protocol token between dead sites — intercepting it is the
    // only way to read site-to-site mail (L06 evidence source).
    radius: 10,
    speed: 90, turnRate: 1.2,
    routePeriodS: 90,
    scannerSignalKind: 'anomaly',
    signature: 'machine',
  }),
  conservator: Object.freeze({
    id: 'conservator',
    name: 'Conservator',
    // AE-237 (I10): preserves sealed samples — refuses OPEN. It will not release what it
    // keeps; approach earns a polite denial line.
    radius: 14,
    speed: 0, turnRate: 0.2,
    refuseR: 300,
    scannerSignalKind: 'anomaly',
    signature: 'machine',
  }),
  measure: Object.freeze({
    id: 'measure',
    name: 'Measure Engine',
    // AE-237 (I11): measures one impossible variable forever — its reading lands in
    // mapKnowledge as an instrument anomaly the first time you approach.
    radius: 12,
    speed: 0, turnRate: 0.1,
    readR: 500,
    scannerSignalKind: 'anomaly',
    signature: 'machine',
  }),
  boundary_walker: Object.freeze({
    id: 'boundary_walker',
    name: 'Boundary Walker',
    // AE-238 (I12): patrols an invisible quarantine line — crossing while it is watching
    // logs a violation (the moving exclusion, M08).
    radius: 16,
    speed: 40, turnRate: 0.5,
    patrolLen: 1600,
    watchR: 700,
    scannerSignalKind: 'anomaly',
    signature: 'machine',
  }),
  appeals_clerk: Object.freeze({
    id: 'appeals_clerk',
    name: 'Appeals Clerk',
    // AE-239 (I13): accepts counter-evidence — approach with an evidence row that
    // contradicts a site's classification and a revoked verdict flips.
    radius: 15,
    speed: 0, turnRate: 0.2,
    counterR: 400,
    scannerSignalKind: 'anomaly',
    signature: 'machine',
  }),
  debris_sorter: Object.freeze({
    id: 'debris_sorter',
    name: 'Debris Sorter',
    // AE-240 (I14): cleans battlefields — treats human wreckage as maintenance waste.
    // Drifts to kill markers and removes them on a delay: salvage timer pressure.
    radius: 20,
    speed: 30, turnRate: 0.4,
    sweepR: 2600,
    collectDelayS: 20,
    scannerSignalKind: 'anomaly',
    signature: 'machine',
  }),
  sleeping_jury: Object.freeze({
    id: 'sleeping_jury',
    name: 'Sleeping Jury',
    // AE-241 (I15): a cluster of inert frames that awakens when three protocol
    // conditions coincide (violation + witness mark + a revoked route in sector).
    radius: 34,
    speed: 0, turnRate: 0.2,
    wakeR: 1200,
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
    // A fault state (violation/revoked) is terminal: only 'excepted' or a fresh fault can
    // move it — a routine seen/satisfied/witnessed beat must never silently lift a verdict.
    if (MACHINE_PROTOCOL_FAULTS.includes(cur)) return cur;
    const i = order.indexOf(cur);
    const j = order.indexOf(to);
    if (j > i) ae.machineProtocol = to;
    return ae.machineProtocol;
  };
  switch (event) {
    case 'seen':      return up('observed');
    case 'satisfied': return up(cur === 'observed' ? 'compliant' : cur);
    case 'witnessed': return up('witnessed');
    // The one escape: an exception verdict supersedes even a revoked standing.
    case 'excepted':  ae.machineProtocol = 'exception'; return 'exception';
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
  // Rank 1 is 'unknown' — the first ladder rung is an unresolved signal, not a classification.
  const tier = Math.max(0, Math.min(MACHINE_SCAN_TERMS.length - 1, machineProtocolRank(machineProtocol) - 1));
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

  // ── Phase 11 deep-region machine work (AE-115) ───────────────────────────────────────
  sker_null_causeway: Object.freeze({
    siteId: 'sker_null_causeway',
    sectorId: 'sector_sker_haven',
    poiId: 'poi_sker_null_causeway',
    name: 'Null Causeway',
    kind: 'corridor',
    // AE-115: a machine-milled safe lane through the Haven pocket — a spine chain holding
    // a dead corridor inside the densest field the player can reach.
    center: Object.freeze({ x: 600, z: 1400 }),
    radius: 800,
    propRing: Object.freeze({ count: 6, radius: 700, propId: 'machine_spine', linear: true }),
    suppression: Object.freeze({ radius: 800 }),
    machines: Object.freeze([Object.freeze({ kind: 'custodian', dx: -80, dz: 40 })]),
    directive: 'HOLD',
    beat: 'The scope goes quiet inside a lane milled through the pocket. The custodian on the spine has been tending it since before the route had a name.',
    reveals: null,
  }),

  // ── Phase 25 structure wave B (AE-242..AE-249, doc 07 J-table remainder) ──
  veil_containment_ring: Object.freeze({
    siteId: 'veil_containment_ring',
    sectorId: 'sector_veil_nebula',
    poiId: 'poi_veil_containment_ring',
    name: 'Containment Ring',
    kind: 'containment',
    // AE-242 (J07): a ring of pylons sealing a growth mass that outgrew its quarantine.
    // N04 setpiece — the seal is partial: approach spawns a tendril bloom.
    center: Object.freeze({ x: -900, z: -1900 }),
    radius: 520,
    propRing: Object.freeze({ count: 5, radius: 400, propId: 'machine_pylon' }),
    machines: Object.freeze([Object.freeze({ kind: 'conservator', dx: 0, dz: 60 })]),
    suppression: Object.freeze({ radius: 300, inner: 180 }), // inner ring is NOT suppressed
    directive: 'VACATE',
    beat: 'A five-pylon seal holds something that stopped obeying the seal. The conservator inside it refuses the obvious request.',
    reveals: 'revealed',
    evidence: 'L05',
  }),
  charon_star_marker: Object.freeze({
    siteId: 'charon_star_marker',
    sectorId: 'sector_charon_expanse',
    poiId: 'poi_charon_star_marker',
    name: 'Star Marker',
    kind: 'beacon',
    // AE-243 (J08): a navigation reference older than the sector's human chart names.
    // Its reading is the K04 Inertial Datum source — approach mints the credential.
    center: Object.freeze({ x: -2200, z: -800 }),
    radius: 140,
    propRing: Object.freeze({ count: 1, radius: 0, propId: 'machine_marker' }),
    machines: Object.freeze([Object.freeze({ kind: 'measure', dx: 90, dz: -40 })]),
    directive: null,
    beat: 'The marker resolves as a fixed point the map has always quietly assumed. Its engine measures a variable your instruments do not have a name for.',
    reveals: null,
    evidence: 'L02',
  }),
  sker_quiet_dock: Object.freeze({
    siteId: 'sker_quiet_dock',
    sectorId: 'sector_sker_haven',
    poiId: 'poi_sker_quiet_dock',
    name: 'Quiet Dock',
    kind: 'dock',
    // AE-244 (J09): a dormant drydock whose berth is sized for nothing human-scale.
    center: Object.freeze({ x: -1600, z: 800 }),
    radius: 380,
    propRing: Object.freeze({ count: 4, radius: 300, propId: 'machine_dock_arm' }),
    machines: Object.freeze([Object.freeze({ kind: 'custodian', dx: 120, dz: -60 })]),
    directive: 'HOLD',
    beat: 'A drydock with berth rails for a hull four times your length. The dust inside is undisturbed — nothing has docked since it was built.',
    reveals: null,
    evidence: 'L07',
  }),
  io_listening_field: Object.freeze({
    siteId: 'io_listening_field',
    sectorId: 'sector_io_reach',
    poiId: 'poi_io_listening_field',
    name: 'Listening Field',
    kind: 'array',
    // AE-245 (J10): an array of spine-receivers pointed at the coreward dark.
    // O-table bark source: it repeats your comms back in pulse grammar (AE-244).
    center: Object.freeze({ x: 800, z: -1400 }),
    radius: 640,
    propRing: Object.freeze({ count: 7, radius: 540, propId: 'machine_spine', linear: true }),
    machines: Object.freeze([
      Object.freeze({ kind: 'witness', dx: 0, dz: 0 }),
      Object.freeze({ kind: 'courier', dx: -200, dz: 200 }),
    ]),
    directive: 'WITNESS',
    beat: 'Seven receivers face a point that is not on any human chart. One of them briefly tracks your transponder instead.',
    reveals: 'revealed',
    evidence: 'L01',
  }),
  pallas_empty_foundry: Object.freeze({
    siteId: 'pallas_empty_foundry',
    sectorId: 'sector_pallas_drift',
    poiId: 'poi_pallas_empty_foundry',
    name: 'Empty Foundry',
    kind: 'foundry',
    // AE-246 (J11): a construction frame building nothing — the plans were rescinded
    // mid-assembly. The mason still runs its weld cycle on air.
    center: Object.freeze({ x: 1200, z: 900 }),
    radius: 460,
    propRing: Object.freeze({ count: 6, radius: 340, propId: 'machine_gantry' }),
    machines: Object.freeze([Object.freeze({ kind: 'mason', dx: 0, dz: 0 })]),
    directive: 'HOLD',
    beat: 'Half-built ribwork hangs inside a gantry square. The mason welds to a schedule that was cancelled before your species learned radio.',
    reveals: null,
    evidence: 'L03',
  }),
  ashfall_the_line: Object.freeze({
    siteId: 'ashfall_the_line',
    sectorId: 'sector_ashfall_reach',
    poiId: 'poi_ashfall_the_line',
    name: 'The Line',
    kind: 'boundary',
    // AE-247 (J12): a surveyed quarantine boundary marked by a walker pair.
    // M08: crossing while watched logs a violation beat.
    center: Object.freeze({ x: -800, z: 1600 }),
    radius: 900,
    propRing: Object.freeze({ count: 8, radius: 700, propId: 'machine_spine', linear: true }),
    machines: Object.freeze([
      Object.freeze({ kind: 'boundary_walker', dx: -300, dz: 0 }),
      Object.freeze({ kind: 'boundary_walker', dx: 300, dz: 0 }),
    ]),
    directive: 'VACATE',
    beat: 'Two walkers patrol a line the map does not draw. Crossing it is not forbidden — it is recorded.',
    reveals: null,
    evidence: 'L08',
  }),
  charon_broken_shepherd: Object.freeze({
    siteId: 'charon_broken_shepherd',
    sectorId: 'sector_charon_expanse',
    poiId: 'poi_charon_broken_shepherd',
    name: 'Broken Shepherd',
    kind: 'crossover',
    // AE-248 (J13): a shepherd engine whose corridor failed — the growth entered through
    // the gap and now runs along its patrol. Machine vs infestation, live.
    center: Object.freeze({ x: 1000, z: 1900 }),
    radius: 700,
    propRing: Object.freeze({ count: 4, radius: 500, propId: 'machine_spine', linear: true }),
    machines: Object.freeze([Object.freeze({ kind: 'shepherd', dx: -200, dz: -200 })]),
    directive: null,
    beat: 'The shepherd still runs its corridor sweep. The growth grew around the patrol path — it stops sweeping where the filaments are thickest.',
    reveals: 'revealed',
    evidence: 'L09',
  }),
  veil_exception_chamber: Object.freeze({
    siteId: 'veil_exception_chamber',
    sectorId: 'sector_veil_nebula',
    poiId: 'poi_veil_exception_chamber',
    name: 'Exception Chamber',
    kind: 'chamber',
    // AE-249 (J15): the room where an appeal verdict was once issued. Sleeping jury at
    // its center; the appeals clerk processes counter-evidence at its threshold.
    // K09/K10 endgame credentials are minted here at protocol 'exception'.
    center: Object.freeze({ x: 1800, z: 1400 }),
    radius: 320,
    propRing: Object.freeze({ count: 6, radius: 240, propId: 'machine_plate' }),
    machines: Object.freeze([
      Object.freeze({ kind: 'sleeping_jury', dx: 0, dz: 0 }),
      Object.freeze({ kind: 'appeals_clerk', dx: -160, dz: 80 }),
      Object.freeze({ kind: 'executor', dx: 220, dz: -120 }),
    ]),
    suppression: Object.freeze({ radius: 240 }),
    directive: 'WITNESS',
    beat: 'A chamber that adjudicates by proximity. The jury is asleep. The clerk is not.',
    reveals: 'revealed',
    evidence: 'L10',
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
