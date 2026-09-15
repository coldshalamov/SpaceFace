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
