// Dockside V2 ad-board presentation.
//
// Selection is derived from the run seed, berth identity, and a slow simulation-time bucket. The
// board never draws from shared simulation RNG or wall time, and rendering is signature-gated so
// ordinary station refreshes do not rewrite unchanged DOM.

import { hash32 } from '../../core/rng.js';
import { FLAVOR_PACKS } from '../../data/flavor/index.generated.js';
import { escapeHtml } from '../comms.js';

const ROTATION_SECONDS = 90;
const PACK = FLAVOR_PACKS.ad_board;

if (!PACK || !Array.isArray(PACK.entries) || PACK.entries.length === 0) {
  throw new Error('Dockside ad board requires the authored ad_board flavor pack');
}

/**
 * Select one authored notice for a berth and simulation-time cycle.
 * Same inputs always select the same corpus row without advancing state.rng.
 */
export function selectAdBoardNotice({ seed = 0, stationId = null, simTime = 0 } = {}) {
  const berth = stationId == null ? '' : String(stationId).trim();
  if (!berth) return null;
  const runSeed = Number.isFinite(Number(seed)) ? Number(seed) >>> 0 : 0;
  const cycle = Math.max(0, Math.floor((Number(simTime) || 0) / ROTATION_SECONDS));
  const index = hash32(runSeed, berth, cycle, 'v2-ad-board') % PACK.entries.length;
  const entry = PACK.entries[index];
  if (!entry || !entry.text) return null;
  return {
    id: String(entry.id || `ad_${index}`),
    sponsor: String(entry.sponsor || 'Station Commerce'),
    text: String(entry.text),
    packId: PACK.id,
    index,
    cycle,
  };
}

/** Render the current notice into the Market screen's dedicated, non-live-region surface. */
export function renderAdBoardNotice(element, state) {
  if (!element) return null;
  const notice = selectAdBoardNotice({
    seed: state && state.meta && state.meta.seed,
    stationId: state && state.ui && state.ui.dockedStationId,
    simTime: state && state.simTime,
  });
  const signature = notice
    ? `${notice.packId}|${notice.id}|${notice.cycle}|${notice.sponsor}|${notice.text}`
    : 'none';
  if (element.dataset && element.dataset.renderSignature === signature) return notice;
  if (element.dataset) element.dataset.renderSignature = signature;

  if (!notice) {
    element.hidden = true;
    element.innerHTML = '';
    return null;
  }

  element.hidden = false;
  if (element.dataset) element.dataset.adId = notice.id;
  element.innerHTML =
    '<span class="sx-adboard__k">Dockside notice</span>'
    + `<span class="sx-adboard__sponsor">${escapeHtml(notice.sponsor)}</span>`
    + `<p class="sx-adboard__text">${escapeHtml(notice.text)}</p>`;
  return notice;
}

export function adBoardDeckSize() {
  return PACK.entries.length;
}

export const AD_BOARD_PACK_ID = PACK.id;
export const AD_BOARD_ROTATION_SECONDS = ROTATION_SECONDS;
