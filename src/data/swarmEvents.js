// Swarm arena event tables — the semi-curated layer of the Crucible (SWARM_PROGRAM S4).
//
// Pure data + one deterministic pick. An event round lands every SWARM_EVENT_EVERY waves,
// skipping boss rounds (the boss room IS the event). The pick is seeded on (arenaId, wave, seed)
// so a replay, a ghost and a share code all see the same card.
//
// Event spend kinds, all through shipped seams — the director owns no new write path:
//   surge — a window where an installed environmental field runs hot (fields.updateExternal)
//   pulse — a temporary field registered for the window, unregistered on calm
//   mines — mines ride in on a bearing (mines:placeRequest, per-owner cap still applies)
//   supply — a salvage pod worth run credits, claimed off pickup:collected
//
// `install` specs are pre-placed by planArenaInstall at wave-plan time — the inevitability comes
// from placement: the lane the sluice floods, the mines' berth, the plate the storm rides.

import { isSwarmBossWave, swarmWaveOf } from './swarmMode.js';

export const SWARM_EVENT_SCHEMA_VERSION = 1;

/** Event rounds land on waves 5, 15, 25… — the odd multiples of five the boss round skips. */
export const SWARM_EVENT_EVERY = 5;

function event(def) { return Object.freeze(def); }

/** Every event card, keyed by id. `window: 0` events are a single spend, not a held room state. */
export const SWARM_EVENT_BY_ID = Object.freeze({

  // ── helios_core (the Foundry): shutters, furnace, loose plates — the room it already is ──
  shutter_storm: event({
    id: 'shutter_storm', name: 'Shutter storm', kind: 'surge', factor: 2.4, windupS: 5, windowS: 12,
    telegraph: 'SHUTTER STORM — the drag is about to run hot',
    install: {
      fields: [{ kind: 'well', bearing: 'spin', dist: 280, radius: 520, strength: 92, falloff: 1.25 }],
    },
  }),
  furnace_flare: event({
    id: 'furnace_flare', name: 'Furnace flare', kind: 'surge', factor: 2.2, windupS: 5, windowS: 10,
    telegraph: 'FURNACE FLARE — the middle is about to get meaner',
    install: {
      fields: [{ kind: 'repulsor', bearing: 'center', radius: 430, strength: 150, falloff: 1.55 }],
    },
  }),
  plate_drift: event({
    id: 'plate_drift', name: 'Plate drift', kind: 'surge', factor: 1.6, windupS: 4, windowS: 14,
    telegraph: 'PLATE DRIFT — cover is tearing loose',
    install: {
      cover: true,
      fields: [{ kind: 'well', bearing: 'spin', dist: 340, radius: 470, strength: 58, damping: 0.85, falloff: 1.15 }],
    },
  }),

  // ── lagrange_crucible: the pull and the sling ──
  well_swing: event({
    id: 'well_swing', name: 'Well swing', kind: 'pulse', windupS: 4, windowS: 9,
    telegraph: 'WELL SWING — a pull is walking the room',
    field: { kind: 'well', bearing: 'across', dist: 220, radius: 360, strength: 150, falloff: 1.2 },
  }),
  sling_gust: event({
    id: 'sling_gust', name: 'Sling gust', kind: 'surge', factor: 1.8, windupS: 4, windowS: 8,
    telegraph: 'SLING GUST — the slingshot is about to bite',
  }),

  // ── cinder_sluice: the lane and its undertow ──
  sluice_surge: event({
    id: 'sluice_surge', name: 'Sluice surge', kind: 'surge', factor: 2.0, windupS: 4, windowS: 10,
    telegraph: 'SLUICE SURGE — the lane is about to flood',
  }),
  undertow_snap: event({
    id: 'undertow_snap', name: 'Undertow snap', kind: 'pulse', windupS: 3, windowS: 6,
    telegraph: 'UNDERTOW — mind the deck',
    field: { kind: 'well', bearing: 'player', radius: 280, strength: 210, falloff: 1.0 },
  }),

  // ── cryo_drift: cold fronts and breaking plates ──
  freeze_front: event({
    id: 'freeze_front', name: 'Freeze front', kind: 'pulse', windupS: 4, windowS: 8,
    telegraph: 'FREEZE FRONT — a wall of cold is sweeping in',
    field: {
      kind: 'cone', bearing: 'lane', dist: 300, radius: 560, strength: 130,
      falloff: 1.1, halfAngleRad: 0.55, damping: 0.7,
    },
  }),
  plate_shatter: event({
    id: 'plate_shatter', name: 'Plate shatter', kind: 'surge', factor: 1.5, windupS: 4, windowS: 10,
    telegraph: 'PLATE SHATTER — the ice is about to give',
    install: {
      cover: true,
      fields: [{ kind: 'well', bearing: 'spin', dist: 340, radius: 470, strength: 58, damping: 0.85, falloff: 1.15 }],
    },
  }),

  // ── storm_lattice: the relay graph and the grid ──
  // The lattice's own fields are occupancy markers authored at strength 0 — a multiplier has
  // nothing to bite, so its signature cards are pulses: temporary fields for the window only.
  relay_arc: event({
    id: 'relay_arc', name: 'Relay arc', kind: 'pulse', windupS: 4, windowS: 9,
    telegraph: 'RELAY ARC — the lattice is about to energize',
    field: { kind: 'repulsor', bearing: 'spin', dist: 300, radius: 340, strength: 170, falloff: 1.2 },
  }),
  grid_surge: event({
    id: 'grid_surge', name: 'Grid surge', kind: 'pulse', windupS: 4, windowS: 12,
    telegraph: 'GRID SURGE — the whole room is hot',
    field: { kind: 'well', bearing: 'center', radius: 520, strength: 140, falloff: 1.15 },
  }),

  // ── shared cards — every arena can draw these ──
  mine_drift: event({
    id: 'mine_drift', name: 'Mine drift', kind: 'mines', count: 4, windupS: 5, windowS: 0,
    telegraph: 'MINE DRIFT — hazards riding a bearing',
  }),
  supply_drop: event({
    id: 'supply_drop', name: 'Supply pod', kind: 'supply', credits: 60, windupS: 6, windowS: 0,
    telegraph: 'SUPPLY POD — salvage riding in. Staying for it is a choice.',
  }),
});

/** The signature cards each arena can draw — its own name for its own tricks. */
export const SWARM_EVENT_TABLES = Object.freeze({
  helios_core: Object.freeze(['shutter_storm', 'furnace_flare', 'plate_drift']),
  lagrange_crucible: Object.freeze(['well_swing', 'sling_gust']),
  cinder_sluice: Object.freeze(['sluice_surge', 'undertow_snap']),
  cryo_drift: Object.freeze(['freeze_front', 'plate_shatter']),
  storm_lattice: Object.freeze(['relay_arc', 'grid_surge']),
});

/** Cards every room can draw — hazards and salvage are not the arena's law. */
export const SWARM_SHARED_EVENTS = Object.freeze(['mine_drift', 'supply_drop']);

/** The pool a wave draws from: the arena's signatures first, then the shared cards. */
export function swarmEventPool(arenaId) {
  const own = (arenaId && SWARM_EVENT_TABLES[arenaId]) || [];
  return own.concat(SWARM_SHARED_EVENTS);
}

/**
 * Is this wave an event round at all — deterministic on wave alone, before the seeded pick.
 * Boss rounds always carry the boss room instead.
 */
export function isSwarmEventWave(wave) {
  const w = swarmWaveOf(wave);
  return w % SWARM_EVENT_EVERY === 0 && !isSwarmBossWave(w);
}

/**
 * The card a wave draws. Deterministic: same (arenaId, wave, seed) → same event, so a ghost
 * replay and a share code see the same room do the same thing. Returns the frozen def or null.
 */
export function swarmEventFor({ arenaId, wave, seed } = {}) {
  const w = swarmWaveOf(wave);
  if (!isSwarmEventWave(w)) return null;
  const own = (arenaId && SWARM_EVENT_TABLES[arenaId]) || [];
  if (own.length === 0 && SWARM_SHARED_EVENTS.length === 0) return null;
  // Same mixing idiom as arenaStreamSeed — a label-salted uint32, not Math.random.
  const label = `swarm-event-v1|${arenaId || 'arena'}|w${w}`;
  let h = ((Number(seed) >>> 0) || 1) ^ 0x9e3779b9;
  for (let i = 0; i < label.length; i++) {
    h = Math.imul(h ^ label.charCodeAt(i), 0x01000193);
  }
  h = (h ^ Math.imul(w, 0x85ebca6b)) >>> 0;
  // mulberry32 — two seeded draws: WHICH pool first (signatures lead 70/30 over shared cards,
  // so the arena's own tricks stay the headline), then which card inside it.
  let a = h || 1;
  const draw = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pool = draw() < 0.7 && own.length > 0 ? own : SWARM_SHARED_EVENTS;
  const pick = draw();
  const id = pool[Math.min(pool.length - 1, Math.floor(pick * pool.length))];
  return SWARM_EVENT_BY_ID[id] || null;
}

/** Validate the tables — run by the data test, not at import. */
export function validateSwarmEvents() {
  const issues = [];
  for (const [id, def] of Object.entries(SWARM_EVENT_BY_ID)) {
    if (def.id !== id) issues.push(`${id}: def.id mismatch`);
    if (!['surge', 'pulse', 'mines', 'supply'].includes(def.kind)) {
      issues.push(`${id}: unknown kind ${def.kind}`);
    }
    if (typeof def.name !== 'string' || !def.name) issues.push(`${id}: no display name`);
    if (typeof def.telegraph !== 'string' || !def.telegraph) issues.push(`${id}: no telegraph`);
    if (def.kind === 'pulse' && !def.field) issues.push(`${id}: pulse without field spec`);
    if (def.kind === 'surge' && !(def.factor > 0)) issues.push(`${id}: surge without factor`);
    if (def.kind === 'mines' && !(def.count >= 1)) issues.push(`${id}: mines without count`);
    if (def.kind === 'supply' && !(def.credits > 0)) issues.push(`${id}: supply without credits`);
  }
  for (const [arenaId, table] of Object.entries(SWARM_EVENT_TABLES)) {
    for (const id of table) {
      if (!SWARM_EVENT_BY_ID[id]) issues.push(`${arenaId}: table names unknown event ${id}`);
    }
  }
  return issues;
}
