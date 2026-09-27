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
  return ae;
}
