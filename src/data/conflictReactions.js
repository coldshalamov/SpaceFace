// Pure authored reaction selection for SPEC3-32's "ecology speaks" contract.
//
// Factions remains the only war/territory writer. Callers pass its saved conflict:flip fact here;
// this module only selects and formats one existing flavor row without advancing shared RNG.

import { hash32 } from '../core/rng.js';
import { FACTION_META } from './factions.js';
import { SECTORS } from './sectors.js';
import { FLAVOR_PACKS } from './flavor/index.generated.js';

export const CONFLICT_REACTION_SURFACES = Object.freeze({
  SKER_GRAFFITI: 'sker_graffiti',
  HELIOS_AD: 'helios_ad',
  DMC_TALLY: 'dmc_tally',
  MTS_MANIFEST: 'mts_manifest',
  QUIET_WHISPER: 'quiet_whisper',
  VAEL_KEEL: 'vael_keel',
  FREE_DOCKLINE: 'free_dockline',
  CHOIR_LITANY: 'choir_litany',
});

// One authored reaction register per station-owning faction (PQ-170.00): the same saved
// conflict:flip fact reads in the local voice wherever the player docks. Graffiti surfaces ride
// the comms wall on dock; board surfaces ride the market's dockside notice.
const SURFACE_CONFIG = Object.freeze({
  [CONFLICT_REACTION_SURFACES.SKER_GRAFFITI]: Object.freeze({
    packId: 'graffiti',
    set: 'war_sker_mourning',
  }),
  [CONFLICT_REACTION_SURFACES.HELIOS_AD]: Object.freeze({
    packId: 'ad_board',
    set: 'war_helios_denial',
  }),
  [CONFLICT_REACTION_SURFACES.DMC_TALLY]: Object.freeze({
    packId: 'ad_board',
    set: 'war_dmc_tally',
  }),
  [CONFLICT_REACTION_SURFACES.MTS_MANIFEST]: Object.freeze({
    packId: 'ad_board',
    set: 'war_mts_manifest',
  }),
  [CONFLICT_REACTION_SURFACES.QUIET_WHISPER]: Object.freeze({
    packId: 'graffiti',
    set: 'war_quiet_whisper',
  }),
  [CONFLICT_REACTION_SURFACES.VAEL_KEEL]: Object.freeze({
    packId: 'graffiti',
    set: 'war_vael_keel',
  }),
  [CONFLICT_REACTION_SURFACES.FREE_DOCKLINE]: Object.freeze({
    packId: 'graffiti',
    set: 'war_free_dockline',
  }),
  [CONFLICT_REACTION_SURFACES.CHOIR_LITANY]: Object.freeze({
    packId: 'graffiti',
    set: 'war_choir_litany',
  }),
});

// Which faction's voice a station carries. Reach mourns on the Sker wall; the other seven
// station-holding factions answer a flip in their own register on their own docks.
const SURFACE_BY_FACTION = Object.freeze({
  faction_reach: CONFLICT_REACTION_SURFACES.SKER_GRAFFITI,
  faction_scn: CONFLICT_REACTION_SURFACES.HELIOS_AD,
  faction_dmc: CONFLICT_REACTION_SURFACES.DMC_TALLY,
  faction_mts: CONFLICT_REACTION_SURFACES.MTS_MANIFEST,
  faction_quiet: CONFLICT_REACTION_SURFACES.QUIET_WHISPER,
  faction_vael: CONFLICT_REACTION_SURFACES.VAEL_KEEL,
  faction_free: CONFLICT_REACTION_SURFACES.FREE_DOCKLINE,
  faction_choir: CONFLICT_REACTION_SURFACES.CHOIR_LITANY,
});

const STATION_FACTION_BY_ID = (() => {
  const map = new Map();
  for (const sector of SECTORS) {
    for (const station of sector.stations || []) {
      map.set(station.id, station.factionId || sector.factionId || null);
    }
  }
  return map;
})();

const FACTION_BY_ID = new Map(FACTION_META.map((faction) => [faction.id, faction]));
const SECTOR_BY_ID = new Map(SECTORS.map((sector) => [sector.id, sector]));
const EMPTY_ENTRIES = Object.freeze([]);
const ENTRIES_BY_SURFACE = Object.freeze(Object.fromEntries(
  Object.entries(SURFACE_CONFIG).map(([surface, config]) => {
    const pack = FLAVOR_PACKS[config.packId];
    const entries = pack && Array.isArray(pack.entries)
      ? pack.entries.filter((entry) => (
        entry && entry.set === config.set && entry.reactsTo === 'conflict_flip'
      ))
      : [];
    return [surface, Object.freeze(entries)];
  }),
));

export function conflictReactionSurfaceForStation(stationId) {
  const factionId = STATION_FACTION_BY_ID.get(stationId);
  return factionId ? SURFACE_BY_FACTION[factionId] || null : null;
}

/** The flavor pack that physically renders a surface — 'graffiti' walls vs 'ad_board' notices. */
export function conflictReactionPackId(surface) {
  const config = SURFACE_CONFIG[surface];
  return config ? config.packId : null;
}

export function conflictReactionEntries(surface) {
  return ENTRIES_BY_SURFACE[surface] || EMPTY_ENTRIES;
}

export function conflictReactionVariantCount() {
  return Object.keys(SURFACE_CONFIG).reduce(
    (total, surface) => total + conflictReactionEntries(surface).length,
    0,
  );
}

export function normalizeConflictFlipFact(input) {
  if (!input || typeof input !== 'object') return null;
  const pairKey = cleanString(input.pairKey);
  const sectorId = cleanString(input.sectorId);
  const newOwner = cleanString(input.newOwner);
  if (!pairKey || !sectorId || !newOwner) return null;
  const pairMembers = pairKey.split(':').filter(Boolean);
  if (pairMembers.length !== 2 || !pairMembers.includes(newOwner)) return null;
  const sequence = Math.max(1, Math.floor(Number(input.sequence) || 1));
  const t = Math.max(0, Number(input.t) || 0);
  return Object.freeze({
    id: `${sequence}:${pairKey}:${sectorId}:${newOwner}`,
    sequence,
    pairKey,
    sectorId,
    newOwner,
    t,
  });
}

export function selectConflictReaction({ surface, seed = 0, flip, cycle = 0 } = {}) {
  const fact = normalizeConflictFlipFact(flip);
  const config = SURFACE_CONFIG[surface];
  const entries = conflictReactionEntries(surface);
  if (!fact || !config || entries.length === 0) return null;
  const stableCycle = Math.max(0, Math.floor(Number(cycle) || 0));
  const index = hash32(
    Number.isFinite(Number(seed)) ? Number(seed) >>> 0 : 0,
    fact.id,
    surface,
    stableCycle,
    'conflict-reaction',
  ) % entries.length;
  const entry = entries[index];
  const [firstFaction, secondFaction] = fact.pairKey.split(':');
  const loserId = fact.newOwner === firstFaction ? secondFaction : firstFaction;
  const tokens = {
    sector: sectorLabel(fact.sectorId),
    winner: factionLabel(fact.newOwner),
    loser: factionLabel(loserId),
  };
  return Object.freeze({
    ...entry,
    text: fillTokens(entry.text, tokens),
    packId: config.packId,
    surface,
    index,
    factId: fact.id,
  });
}

function fillTokens(text, tokens) {
  return String(text || '').replace(/\{(sector|winner|loser)\}/g, (_match, key) => tokens[key]);
}

// ── PQ-170.01 — station growth and depot dependency copy ─────────────────────────────────────────
// Pure authored lines. claims.js fills the tokens and publishes them; nothing here touches state
// or the shared RNG. Station growth speaks in the station-owning faction's register (resolved
// station→faction through SECTORS exactly like the flip surfaces above). The depot rotation is
// always Concord: the lawful patrol_beat shape flies the Concord flag in every sector, so a stocked
// depot in lawless space is Concord reach the player is provisioning.
const STATION_GROWTH_VOICE = Object.freeze({
  faction_scn: Object.freeze({ prefix: 'CONCORD DESK', suffix: 'Logged under your route file.' }),
  faction_dmc: Object.freeze({ prefix: 'DRIFT SHIFT BOARD', suffix: 'Rock crews say the credit is yours.' }),
  faction_mts: Object.freeze({ prefix: 'MERIDIAN MANIFEST', suffix: 'Your lane is a line item now.' }),
  faction_free: Object.freeze({ prefix: 'FRONTIER DOCKLINE', suffix: 'Nobody ordered it. You built it.' }),
  faction_quiet: Object.freeze({ prefix: 'QUIET WHISPER', suffix: 'Never on a manifest. Still there.' }),
  faction_reach: Object.freeze({ prefix: 'SKER WALL', suffix: 'Reach remembers who fed the docks.' }),
  faction_vael: Object.freeze({ prefix: 'VAEL KEEL', suffix: 'The hull grew where you kept touching it.' }),
  faction_choir: Object.freeze({ prefix: 'CHOIR LITANY', suffix: 'Sung into the roster of what you carried.' }),
});
const DEFAULT_GROWTH_VOICE = Object.freeze({ prefix: 'DOCK NOTICE', suffix: 'Built on your throughput.' });

export const DEPOT_PATROL_LINES = Object.freeze({
  posted: 'CONCORD: {depot} lane provisioned — patrol rotation posted on your depot.',
  withdrawn: 'CONCORD: {depot} stores are dry — patrol rotation withdrawn.',
  cold: 'CONCORD: {depot} has gone cold — patrol rotation withdrawn.',
  raided: 'CONCORD: {depot} is under repair — patrol rotation withdrawn.',
  decommissioned: 'CONCORD: {depot} is no longer a relay — patrol rotation withdrawn.',
});

/** Which faction's voice a station carries (null for stations SECTORS does not author). */
export function stationFactionIdFor(stationId) {
  return STATION_FACTION_BY_ID.get(stationId) || null;
}

/**
 * One dock-notice line for a station module the player's throughput built. `line` is the rung's
 * authored sentence from STATION_GROWTH_LADDERS; this wraps it in the local register.
 */
export function stationGrowthReaction({ stationId, stationName, factionId, moduleName, throughputU, line } = {}) {
  const owner = factionId || stationFactionIdFor(stationId) || null;
  const voice = STATION_GROWTH_VOICE[owner] || DEFAULT_GROWTH_VOICE;
  const tokens = {
    station: String(stationName || humanizeId(stationId) || 'the station'),
    module: String(moduleName || 'a new module'),
    units: String(Math.max(0, Math.floor(Number(throughputU) || 0))),
  };
  const body = fillGrowthTokens(line || '{station} gains {module} — {units}u of your freight built it.', tokens);
  return Object.freeze({
    factionId: owner,
    prefix: voice.prefix,
    text: `${voice.prefix}: ${body}`,
    dockLine: `${body} ${voice.suffix}`,
  });
}

/** Concord's voice for the depot patrol rotation. `kind` is a DEPOT_PATROL_LINES key. */
export function depotPatrolLine(kind, tokens = {}) {
  const template = DEPOT_PATROL_LINES[kind] || DEPOT_PATROL_LINES.withdrawn;
  return fillGrowthTokens(template, { depot: String(tokens.depot || 'your depot') });
}

function fillGrowthTokens(text, tokens) {
  return String(text || '').replace(/\{(station|module|units|depot)\}/g, (_match, key) => (
    tokens[key] != null ? tokens[key] : ''
  ));
}

function factionLabel(id) {
  const faction = FACTION_BY_ID.get(id);
  return String(faction && (faction.short || faction.name) || humanizeId(id)).toUpperCase();
}

function sectorLabel(id) {
  const sector = SECTOR_BY_ID.get(id);
  return String(sector && sector.name || humanizeId(id)).toUpperCase();
}

function humanizeId(value) {
  return String(value || 'UNKNOWN').replace(/^(?:sector|faction)_/, '').replace(/_/g, ' ');
}

function cleanString(value) {
  const text = value == null ? '' : String(value).trim();
  return text || null;
}
