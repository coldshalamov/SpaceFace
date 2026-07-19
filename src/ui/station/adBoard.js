// src/ui/station/adBoard.js — dockside ad-board selection.
//
// Binds the authored `ad_board` flavor pack to the docked berth. This is the pack's
// presentation producer: before it existed, no production module imported ad_board, so the
// corpus never reached a player. Selection is a pure function of the station id — the same
// berth always posts the same wall, so the board reads as *this station's* notices rather
// than a rerolled ticker. No gameplay state is read or written.
import { FLAVOR_PACKS } from '../../data/flavor/index.generated.js';
import { stationIdentityFor } from './stationIdentity.js';

const ADS = (FLAVOR_PACKS.ad_board && FLAVOR_PACKS.ad_board.entries) || [];

// Sponsor brands post at their own house first. Station-branded sponsors outrank
// faction-branded ones; everything else rotates through the berth's seeded order.
const SPONSOR_AFFINITY = [
  { pattern: /^Helios /, stationId: 'station_helios' },
  { pattern: /^Tethys /, stationId: 'station_tethys' },
  { pattern: /^Concord /, factionId: 'faction_scn' },
  { pattern: /^(?:Meridian|MTS) /, factionId: 'faction_mts' },
  { pattern: /^DMC /, factionId: 'faction_dmc' },
  { pattern: /^Quiet /, factionId: 'faction_quiet' },
];

const DEFAULT_LIMIT = 4;
// House ads lead the board but never flood it — the wall stays a mixed station posting.
const LOCAL_CAP = 2;

function hashOrder(stationId, adId) {
  // FNV-1a over "station:ad" — stable across sessions, saves, and machines.
  const text = `${stationId}:${adId}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function affinityRank(ad, stationId, factionId) {
  for (const rule of SPONSOR_AFFINITY) {
    if (!rule.pattern.test(ad.sponsor || '')) continue;
    if (rule.stationId) return rule.stationId === stationId ? 2 : 0;
    if (rule.factionId) return rule.factionId === factionId ? 1 : 0;
  }
  return 0;
}

/**
 * Notices posted at this berth, sponsor-first, deterministic per station.
 * Fails closed: no real docked station means no board. Rows are the pack's own frozen
 * entries — copy is rendered verbatim, never rewritten in the UI layer.
 */
export function adBoardNoticesForStation(stationId, { limit = DEFAULT_LIMIT } = {}) {
  const identity = stationIdentityFor(stationId);
  if (!identity || !ADS.length || limit <= 0) return Object.freeze([]);
  const ranked = ADS.map((ad) => ({
    ad,
    rank: affinityRank(ad, stationId, identity.factionId),
    order: hashOrder(stationId, ad.id),
  })).sort((a, b) => (b.rank - a.rank) || (a.order - b.order) || a.ad.id.localeCompare(b.ad.id));
  const picked = [];
  let locals = 0;
  for (const row of ranked) {
    if (picked.length >= limit) break;
    if (row.rank > 0) {
      if (locals >= LOCAL_CAP) continue;
      locals++;
    }
    picked.push(row.ad);
  }
  return Object.freeze(picked.slice());
}

export default adBoardNoticesForStation;
