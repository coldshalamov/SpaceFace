// src/data/alienEcologyState.js — owned state shape for state.world.alienEcology (doc 08).
// Lives under data/ per the registry convention: the shape is content-addressed, world.js
// owns serialization, and src/systems/alienEcology.js owns the behavior.

export const ALIEN_ECOLOGY_SCHEMA = 'spaceface.alienEcology.v1';

export function createAlienEcologyState() {
  return {
    schema: ALIEN_ECOLOGY_SCHEMA,
    // R axis (doc 01): scanner vocabulary tier 0–3, driven by authored reveal events.
    revelation: 0,
    // Verge-Layer posture toward the player (doc 12): one of ALIEN_MACHINE_PROTOCOLS.
    machineProtocol: 'unknown',
    // Scanner/encyclopedia taxonomy unlocks (doc 09 rewards).
    taxonomy: {},
    // Per-site aftermath records keyed by ALIEN_SITES siteId.
    sites: {},
    // AE-076 ship biofilm exposure (0..1) — accrues in contaminated space, decays in clean.
    exposure: 0,
    // AE-091/108/109 machine-layer state: what machines have granted the player.
    machineAccess: {},
    // Per-machine-site beat records keyed by MACHINE_SITES siteId.
    machineSites: {},
    // AE-074 map contamination knowledge — what the player has learned per sector.
    mapKnowledge: {},
    // AE-114/119 per-sector beat ledger (deep advisory + domain threshold fire once each).
    sectorFlags: {},
    // AE-117: Wren's field-recognition line lands once per save.
    wrenRecognized: false,
    // AE-138/139: per-faction custody tallies — { [factionId]: {refused, sold, sealed} }.
    factionConsequences: {},
    // AE-124: live heat lures — transient burn flags, dropped on save/load.
    lures: [],
    // Phase 27/29/31 — L-table evidence ledger + N-table setpiece once-flags.
    evidence: {},
    setpieces: {},
    // AE-296 — alien unique module grants issued this save (once-flags, moduleId -> time).
    uniqueGrants: {},
  };
}

export function ensureAlienEcologyState(state) {
  if (!state || typeof state !== 'object') return createAlienEcologyState();
  const world = state.world || (state.world = {});
  if (!world.alienEcology || typeof world.alienEcology !== 'object'
    || world.alienEcology.schema !== ALIEN_ECOLOGY_SCHEMA) {
    world.alienEcology = createAlienEcologyState();
  }
  const ae = world.alienEcology;
  if (!ae.sites || typeof ae.sites !== 'object') ae.sites = {};
  if (!ae.taxonomy || typeof ae.taxonomy !== 'object') ae.taxonomy = {};
  if (typeof ae.machineProtocol !== 'string') ae.machineProtocol = 'unknown';
  if (!Number.isFinite(ae.revelation)) ae.revelation = 0;
  if (!Number.isFinite(ae.exposure)) ae.exposure = 0;
  if (!ae.machineAccess || typeof ae.machineAccess !== 'object') ae.machineAccess = {};
  if (!ae.machineSites || typeof ae.machineSites !== 'object') ae.machineSites = {};
  if (!ae.mapKnowledge || typeof ae.mapKnowledge !== 'object') ae.mapKnowledge = {};
  if (!ae.sectorFlags || typeof ae.sectorFlags !== 'object') ae.sectorFlags = {};
  if (!ae.factionConsequences || typeof ae.factionConsequences !== 'object') ae.factionConsequences = {};
  if (!Array.isArray(ae.lures)) ae.lures = [];
  if (!ae.evidence || typeof ae.evidence !== 'object') ae.evidence = {};
  if (!ae.setpieces || typeof ae.setpieces !== 'object') ae.setpieces = {};
  if (!ae.uniqueGrants || typeof ae.uniqueGrants !== 'object') ae.uniqueGrants = {};
  ae.wrenRecognized = ae.wrenRecognized === true;
  return ae;
}
