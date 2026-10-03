// Tabletop picture recipes (PB-PIC-A / PB-PIC-C — SF-215, SF-216, SF-217, SF-221, SF-222).
//
// How the world reads at the gameplay camera, expressed as pure presentation recipes:
// machine residual life, convoy working groups and per-sector layered sky identity.
// Each recipe is a pure function of REAL sim fields (site projection rows, traffic
// entity data, sector visual profiles) — no Math.random, no clock, no Three.js — so a
// paused revisit re-derives exactly the picture the fields say, and the focused tests
// drive the same policy the presentation owners consume.
//
// Ownership note: this file decides the read. The live render buses (authoredMotion,
// spaceBackground) and traffic labels remain their owners'; where a recipe is not yet
// wired into a live consumer that is a recorded residual of the owning row, not a
// parallel implementation.

import {
  estimatePhenomenonCoverage,
  resolveBackgroundComposition,
  resolveBackgroundPaintedSky,
  resolveBackgroundStructure,
  resolveSectorVisualProfile,
  skyPlateLuminance,
} from './sectorVisualProfiles.js';

// ---------------------------------------------------------------------------
// SF-215 — a quiet machine with visible residual life
// ---------------------------------------------------------------------------
//
// A site machine's on-screen motion must be derived from its real operating state,
// never a decorative ambient loop. The authoritative per-machine state lives in the
// site projection row (src/systems/asteroidSites.js `projection()` -> machines[]:
// { id, status: { state, limit, ratePerMin }, powerRatio }); the status vocabulary is
// produced by the production tick and stepContinuousRecipe:
//   running / throttled        — producing now (rate scaled by real power ratio)
//   building                   — fabricator mid-batch
//   completed                  — batch just finished; settle the motion home
//   backlogged / starved / stalled / limited — machine healthy, flow blocked by a real
//                                limit; coast down, start no new cycle
//   idle / no-power / no-network / no-geology — no residual life; settled
// The recipe is the readout contract: the same fields always yield the same motion, so
// pause/revisit restores the correct phase rather than a fresh random loop.

export const MACHINE_MOTION = Object.freeze({
  CYCLE: 'cycle',     // low-amplitude purposeful work at the real rate
  COAST: 'coast',     // settle current motion home; no new cycle
  SETTLED: 'settled', // at rest — no invented life
});

const MACHINE_CYCLE_STATES = Object.freeze(new Set(['running', 'throttled', 'building', 'limited']));
const MACHINE_COAST_STATES = Object.freeze(new Set(['backlogged', 'starved', 'stalled', 'completed']));

function clamp01(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
}

/**
 * Motion recipe for one site machine, from its real projection fields.
 *
 * @param {{ id?: string, status?: { state?: string, limit?: string|null }, powerRatio?: number }} row
 *   A `projection().machines[]` row (status defaults to idle exactly like the sim).
 * @returns {{ motion: string, rateScale: number, reason: string|null, sourceState: string }}
 */
export function machineWorkRecipe(row) {
  const status = (row && row.status) || {};
  const state = typeof status.state === 'string' && status.state ? status.state : 'idle';
  const limit = status.limit ?? null;
  const power = clamp01(row && row.powerRatio);
  const rateScale = MACHINE_CYCLE_STATES.has(state)
    ? (power ?? 1)
    : 0;
  let motion;
  if (MACHINE_CYCLE_STATES.has(state)) {
    motion = MACHINE_MOTION.CYCLE;
  } else if (MACHINE_COAST_STATES.has(state)) {
    motion = MACHINE_MOTION.COAST;
  } else {
    // Known settled states and any future unknown state land here: a machine the sim
    // does not report as working never reads as working.
    motion = MACHINE_MOTION.SETTLED;
  }
  return {
    motion,
    rateScale,
    // Name the real limiter so the readout can say why a quiet machine is quiet.
    reason: motion === MACHINE_MOTION.CYCLE ? null : (limit || state),
    sourceState: state,
  };
}

// ---------------------------------------------------------------------------
// SF-221 — a convoy readable as a working group
// ---------------------------------------------------------------------------
//
// One freight group must read as one working group without labels: hull variation and
// roles come from the real traffic fields (data.trafficRole — a faction-varied hull per
// role), the load is the real custody manifest (data.cargoManifest.lines), and the
// membership is the real itinerary (data.itinerary.kind === 'claim_convoy' with its
// convoyId, written by traffic when the leg manifests). Each member stays an
// independently physical body; this is a query over them, never a group mesh.

/** Formation slack that survives a turn: ~4 s of mule cruise at 26 WU/s. */
export const CONVOY_FORMATION_BAND_WU = 120;

export const CONVOY_FORMATION = Object.freeze({
  FORMED: 'formed',   // within one band — reads as one group
  STRUNG: 'strung',   // within two bands — same march, stretched by a turn
  SCATTERED: 'scattered', // beyond — no longer reads as one working group
});

const PROTECTOR_ROLES = Object.freeze(new Set(['escort', 'patrol', 'militia']));
const CARRIER_ROLES = Object.freeze(new Set(['hauler', 'ore_carrier', 'miner', 'tanker', 'mule']));

function convoyRoleKind(role) {
  if (PROTECTOR_ROLES.has(role)) return 'protector';
  if (CARRIER_ROLES.has(role)) return 'carrier';
  return 'support';
}

function manifestQty(data) {
  const manifest = data && data.cargoManifest;
  const lines = manifest && Array.isArray(manifest.lines) ? manifest.lines : [];
  let total = 0;
  for (const line of lines) {
    const qty = Number(line && line.qty);
    if (Number.isFinite(qty) && qty > 0) total += qty;
  }
  return total;
}

function formationVerdict(spreadWu) {
  if (spreadWu <= CONVOY_FORMATION_BAND_WU) return CONVOY_FORMATION.FORMED;
  if (spreadWu <= CONVOY_FORMATION_BAND_WU * 2) return CONVOY_FORMATION.STRUNG;
  return CONVOY_FORMATION.SCATTERED;
}

function groupReadout(members) {
  const carriers = members.filter((m) => m.roleKind === 'carrier');
  const protectors = members.filter((m) => m.roleKind === 'protector');
  const loaded = carriers.filter((m) => m.loaded);
  const parts = [];
  const carrierCount = carriers.length;
  const loadWord = loaded.length === 0 ? 'empty'
    : loaded.length === carrierCount ? 'loaded' : 'part-loaded';
  if (carrierCount > 0) {
    parts.push(`${carrierCount === 1 ? 'one' : carrierCount} ${loadWord} carrier${carrierCount === 1 ? '' : 's'}`);
  }
  if (protectors.length > 0) {
    parts.push(`under escort`);
  }
  const support = members.length - carriers.length - protectors.length;
  if (support > 0) parts.push(`${support} tender${support === 1 ? '' : 's'}`);
  return parts.length ? parts.join(' ') : 'no working read';
}

/**
 * Read a set of traffic bodies as working groups.
 *
 * @param {Array<{ id: string, x: number, z: number, data?: object }> | null} entities
 *   Live bodies; only real group membership joins (`data.itinerary.kind ===
 *   'claim_convoy'` + `convoyId`). Everything else is counted unassigned.
 * @returns {{ groups: Array<object>, unassigned: number }}
 *   Groups sorted by groupId; members sorted by id inside each group (deterministic).
 */
export function convoyWorkingGroups(entities, options = {}) {
  const band = Number.isFinite(options.bandWu) && options.bandWu > 0
    ? options.bandWu
    : CONVOY_FORMATION_BAND_WU;
  const byGroup = new Map();
  let unassigned = 0;
  for (const entity of Array.isArray(entities) ? entities : []) {
    if (!entity || entity.alive === false || !entity.id) continue;
    const data = entity.data || {};
    const itinerary = data.itinerary;
    const convoyId = itinerary && itinerary.kind === 'claim_convoy'
      ? (typeof itinerary.convoyId === 'string' ? itinerary.convoyId : '')
      : '';
    if (!convoyId) {
      unassigned += 1;
      continue;
    }
    const role = data.trafficRole || data.role || 'hauler';
    const qty = manifestQty(data);
    const member = {
      id: entity.id,
      x: Number.isFinite(entity.x) ? entity.x : 0,
      z: Number.isFinite(entity.z) ? entity.z : 0,
      role,
      roleKind: convoyRoleKind(role),
      loaded: qty > 0,
      qty,
    };
    const key = `claim-convoy:${convoyId}`;
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(member);
  }

  const groups = [];
  for (const [groupId, members] of byGroup) {
    members.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    let spread = 0;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const d = Math.hypot(members[i].x - members[j].x, members[i].z - members[j].z);
        if (Number.isFinite(d) && d > spread) spread = d;
      }
    }
    groups.push({
      groupId,
      members,
      spreadWu: spread,
      formation: members.length > 1 ? formationVerdict(spread) : CONVOY_FORMATION.FORMED,
      readout: groupReadout(members),
    });
  }
  groups.sort((a, b) => (a.groupId < b.groupId ? -1 : a.groupId > b.groupId ? 1 : 0));
  return { groups, unassigned };
}

// ---------------------------------------------------------------------------
// SF-222 — a layered sky that supports sector identity
// ---------------------------------------------------------------------------
//
// The per-sector sky decision is owned by src/data/sectorVisualProfiles.js (protected
// data). This recipe composes its public resolvers into the one far/mid/near read the
// picture contract wants, plus a stable identity key so a sector's sky can be proven
// distinct, total (all three layers resolve) and restrained (near cues never out-shout
// the far identity) without importing any render module.

/**
 * Layered sky identity for one sector (a `SECTORS[]` entry, a `{id}` stub, or a
 * resolved profile). Pure: the same sector always yields the same identity.
 */
export function sectorSkyIdentityRecipe(sector) {
  const profile = resolveSectorVisualProfile(sector);
  const paint = resolveBackgroundPaintedSky(profile);
  const structure = resolveBackgroundStructure(profile);
  const composition = resolveBackgroundComposition(profile);
  const farKind = paint ? 'painted_plate' : (profile.galaxyPlate === true ? 'galaxy' : 'void');
  return {
    sectorId: sector && sector.id ? sector.id : null,
    family: profile.id,
    far: {
      kind: farKind,
      plate: paint ? paint.plate : null,
      strength: paint ? paint.strength : 0,
      luminance: skyPlateLuminance(profile),
    },
    mid: {
      structureKind: structure.structureKind,
      starDensity: structure.starDensity,
      coverage: estimatePhenomenonCoverage(structure),
      l1Alpha: structure.l1Alpha,
      l2Alpha: structure.l2Alpha,
    },
    near: {
      landmarkBias: structure.landmarkBias,
      planetChance: composition.planetChance,
      wormholeChance: composition.wormholeChance,
      ringChance: composition.ringChance,
      hasSignatureHero: composition.signatureHero != null,
    },
    identityKey: [
      profile.id,
      farKind,
      paint ? paint.plate : '-',
      structure.structureKind,
      structure.landmarkBias,
      composition.signatureHero ? `hero:${composition.signatureHero.type}` : 'no-hero',
    ].join('|'),
  };
}
