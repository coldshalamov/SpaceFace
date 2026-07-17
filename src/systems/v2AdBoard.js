// Depth Program V2 — dockside ad-board producer.
//
// Pure selection over the authored ad_board flavor pack. Presentation lives on the station Market
// instrument; this module never invents copy, never touches economy state, and never uses Math.random.

import { hash32 } from '../core/rng.js';
import { FLAVOR_PACKS } from '../data/flavor/index.generated.js';

const PACK = FLAVOR_PACKS.ad_board;
if (!PACK || !Array.isArray(PACK.entries) || PACK.entries.length === 0) {
  throw new Error('V2 ad-board producer requires FLAVOR_PACKS.ad_board with authored entries');
}

/**
 * Select a dockside commerce notice for the current berth.
 * Deterministic: same (seed, stationId) always yields the same row.
 *
 * @param {{ seed?: number, stationId?: string|null, simTime?: number }} [opts]
 * @returns {{ id: string, sponsor: string, text: string, packId: string, index: number }|null}
 */
export function selectAdBoardNotice(opts = {}) {
  const stationId = opts.stationId != null ? String(opts.stationId) : '';
  if (!stationId) return null;
  const seed = Number.isFinite(Number(opts.seed)) ? Number(opts.seed) >>> 0 : 0;
  // Slow sim-clock rotation keeps the board feeling alive without wall-time or Math.random.
  const cycle = Math.max(0, Math.floor((Number(opts.simTime) || 0) / 90));
  const index = hash32(seed, stationId, cycle, 'v2-ad-board') % PACK.entries.length;
  const entry = PACK.entries[index];
  if (!entry || !entry.text) return null;
  return {
    id: String(entry.id || `ad_${index}`),
    sponsor: String(entry.sponsor || 'Station Commerce'),
    text: String(entry.text),
    packId: PACK.id,
    index,
  };
}

/** Authored deck size (for tests / capture audits). */
export function adBoardDeckSize() {
  return PACK.entries.length;
}

export const AD_BOARD_PACK_ID = PACK.id;
