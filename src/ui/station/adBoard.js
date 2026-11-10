// Dockside V2 ad-board presentation.
//
// Selection is derived from the run seed, berth identity, and a slow simulation-time bucket. The
// board never draws from shared simulation RNG or wall time, and rendering is signature-gated so
// ordinary station refreshes do not rewrite unchanged DOM.
//
// PULSE-SIGNS (build_map row 433): the billboard, the bay screen and the wire crawl all draw
// from one authored sign bank (data/stationSigns.js) that mixes the ad_board pack, news-wire
// items and faction propaganda — plus two live panels: a WANTED poster naming the player's own
// hull and callsign while heat is high, and feat headlines that name the pilot. Within one
// docking session nothing repeats: the deck is a seeded permutation and a small session record
// skips any slot already shown, so the rotation only ever advances into unseen copy.

import { hash32 } from '../../core/rng.js';
import {
  conflictReactionPackId,
  conflictReactionSurfaceForStation,
  selectConflictReaction,
} from '../../data/conflictReactions.js';
import { FLAVOR_PACKS } from '../../data/flavor/index.generated.js';
import {
  FEAT_HEADLINE_FORMAT,
  WANTED_POSTER_LINES,
  fillSignSlots,
  signsForSurface,
} from '../../data/stationSigns.js';
import { wantedTierFor } from '../../systems/heat.js';
import { deedLine } from '../../data/deedPhrases.js';
import { deedsFor } from '../../systems/deedRecord.js';
import { barPressureAt, festivalAt, rushHourAt, stationShiftAt } from '../../data/worldCalendar.js';
import { playerCallsign, playerHullName } from '../playerIdentity.js';
import { escapeHtml } from '../comms.js';

const ROTATION_SECONDS = 90;
const PACK = FLAVOR_PACKS.ad_board;
const MAX_FEAT_PANELS = 3;

if (!PACK || !Array.isArray(PACK.entries) || PACK.entries.length === 0) {
  throw new Error('Dockside ad board requires the authored ad_board flavor pack');
}
const STANDARD_ENTRIES = PACK.entries.filter((entry) => entry.reactsTo !== 'conflict_flip');

/**
 * Select one authored notice for a berth and simulation-time cycle.
 * Same inputs always select the same corpus row without advancing state.rng.
 */
export function selectAdBoardNotice({ seed = 0, stationId = null, simTime = 0, conflictFlip = null } = {}) {
  const berth = stationId == null ? '' : String(stationId).trim();
  if (!berth) return null;
  const runSeed = Number.isFinite(Number(seed)) ? Number(seed) >>> 0 : 0;
  const cycle = Math.max(0, Math.floor((Number(simTime) || 0) / ROTATION_SECONDS));
  const surface = conflictReactionSurfaceForStation(berth);
  if (surface && conflictReactionPackId(surface) === PACK.id && conflictFlip) {
    const reaction = selectConflictReaction({ surface, seed: runSeed, flip: conflictFlip, cycle });
    if (reaction) {
      return {
        id: reaction.id,
        sponsor: String(reaction.sponsor || 'Helios Public Information'),
        text: reaction.text,
        packId: PACK.id,
        index: reaction.index,
        cycle,
        reaction: 'conflict_flip',
        factId: reaction.factId,
      };
    }
  }
  const index = hash32(runSeed, berth, cycle, 'v2-ad-board') % STANDARD_ENTRIES.length;
  const entry = STANDARD_ENTRIES[index];
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

/* ── PULSE-SIGNS: the multi-surface sign deck ─────────────────────────────────────────── */

// One docking session's display record. Reset whenever the berth or the dock tick changes —
// the deck never replays an id the station has already shown this stay. `picks` pins the panel
// committed to a (surface, cycle) so repeat renders in the same 90 s tick re-show the same
// entry instead of burning the deck. Ephemeral by design: presentation memory, not sim state.
let signSession = { key: null, dockT: 0, shown: new Set(), picks: new Map() };

function resetSignSession(key, dockT = 0) {
  if (signSession.key === key) return signSession;
  signSession = { key, dockT: dockT | 0, shown: new Set(), picks: new Map() };
  return signSession;
}

/**
 * A docking session is (berth, dock instant). The faction presence ledger records the last
 * confirmed dock's sim time; absent that record the current slow bucket still keys a stable
 * session for the stay. Returns { key, dockT } — dockT anchors the deck's first slot so the
 * live panels (warrant poster, feat headlines) are the first things the boards show on arrival.
 */
export function dockingSessionKey(state) {
  const stationId = state && state.ui && state.ui.dockedStationId;
  if (!stationId) return null;
  const lastDock = state && state.factionPresence && state.factionPresence.lastDock;
  const recordedT = lastDock && lastDock.stationId === stationId && Number.isFinite(lastDock.t)
    ? Math.floor(lastDock.t)
    : null;
  if (recordedT != null) return { key: `${stationId}@${recordedT}`, dockT: recordedT };
  // No dock instant on record (restored saves, bare fixtures): anchor the session to the
  // first render of this stay. The module record holds the anchor so the whole stay reads
  // one stable session; it is released only when the berth itself changes.
  if (typeof signSession.key === 'string' && signSession.key.startsWith(`${stationId}@`)) {
    return { key: signSession.key, dockT: signSession.dockT };
  }
  const t = Math.floor((state && state.simTime) || 0);
  return { key: `${stationId}@${t}`, dockT: t };
}

/** A warrant poster for the billboard while heat carries bounty-tier-or-higher charges. */
function wantedPosterEntries(state) {
  const heat = state && state.player && Number(state.player.heat);
  if (!Number.isFinite(heat)) return [];
  const tier = wantedTierFor(heat);
  if (tier !== 'bounty' && tier !== 'nets' && tier !== 'impound') return [];
  const slots = {
    callsign: playerCallsign(state),
    hull: playerHullName(state),
    tier,
  };
  return WANTED_POSTER_LINES.map((line) => ({
    id: line.id,
    sponsor: line.sponsor,
    text: fillSignSlots(line.text, slots),
    surface: 'billboard',
    dynamic: 'wanted',
  }));
}

/** Feat headlines: the loudest fresh deeds on the Record, named to the pilot. */
function featHeadlineEntries(state) {
  const pilot = playerCallsign(state);
  const deeds = deedsFor(state, { untoldOnly: true })
    .filter((deed) => deed && Number(deed.weight) >= 3)
    .slice(0, MAX_FEAT_PANELS);
  const out = [];
  for (const deed of deeds) {
    const body = deedLine(deed, { voice: 'neutral' });
    if (!body) continue;
    out.push({
      id: `feat_${deed.id}`,
      sponsor: 'Local Wire',
      text: fillSignSlots(FEAT_HEADLINE_FORMAT, { pilot, deed: body }),
      surface: 'crawl',
      dynamic: 'feat',
    });
  }
  return out;
}

/**
 * The full display order for a surface at this berth: dynamic panels first (warrant poster,
 * feat headlines), then the seeded permutation of the eligible static pool — ad-board notices,
 * bay ops copy, wire items and the berth faction's propaganda.
 */
function signDeckOrder(state, surface, sessionKey) {
  const stationId = state && state.ui && state.ui.dockedStationId;
  const seed = state && state.meta && Number(state.meta.seed);
  const station = stationForState(state, stationId);
  const factionId = station && station.factionId || null;
  const stationTypeId = station && station.stationTypeId || null;
  const dynamic = surface === 'billboard'
    ? wantedPosterEntries(state)
    : surface === 'crawl' ? featHeadlineEntries(state) : [];
  // The billboard keeps the authored ad_board corpus in the rotation — the board IS the ad
  // board — alongside the new billboard lines and the berth faction's propaganda.
  const corpus = surface === 'billboard'
    ? STANDARD_ENTRIES.map((entry) => ({
      id: entry.id, sponsor: entry.sponsor, text: entry.text, surface: 'billboard',
    }))
    : [];
  const staticPool = [...corpus, ...signsForSurface(surface, { factionId, stationTypeId })]
    .filter((entry) => !dynamic.some((d) => d.id === entry.id));
  // Seeded permutation of the static pool for this session — same session shuffles once.
  const permuted = staticPool
    .map((entry, index) => ({
      entry,
      order: hash32(seed >>> 0, sessionKey || stationId || 'berth', surface, index, 'v2-signs'),
    }))
    .sort((a, b) => a.order - b.order)
    .map((row) => row.entry);
  return [...dynamic, ...permuted];
}

// Resolve station metadata (faction, type) from the live entity or the sector table.
function stationForState(state, stationId) {
  if (!stationId) return null;
  const list = (state && state.entityIndex && state.entityIndex.stations)
    || (state && state.world && state.world.activeSector && state.world.activeSector.stations)
    || [];
  for (const st of list) {
    if (!st) continue;
    const id = st.data && st.data.stationId || st.stationId || st.id;
    if (id === stationId) {
      const data = st.data || st;
      return { factionId: data.factionId || null, stationTypeId: data.stationTypeId || null };
    }
  }
  return null;
}

/**
 * selectStationSign(state, surface) — one panel for billboard|bay|crawl at the docked berth.
 * Walks the deck to the first slot not shown this session: nothing repeats inside one stay.
 */
export function selectStationSign(state, surface) {
  const stationId = state && state.ui && state.ui.dockedStationId;
  if (!stationId) return null;
  const session = dockingSessionKey(state);
  const record = resetSignSession(session.key, session.dockT);
  const deck = signDeckOrder(state, surface, session.key);
  if (!deck.length) return null;
  const cycle = Math.max(0, Math.floor(((state && state.simTime) || 0) / ROTATION_SECONDS));
  // Re-show the panel already committed to this (surface, cycle): re-renders inside the same
  // rotation tick must not advance the deck.
  const pinned = record.picks.get(surface);
  if (pinned && pinned.cycle === cycle) {
    const still = deck.find((entry) => entry.id === pinned.id);
    if (still) {
      return {
        id: still.id,
        sponsor: String(still.sponsor || 'Station Commerce'),
        text: String(still.text),
        surface,
        dynamic: still.dynamic || null,
        cycle,
        sessionKey: session.key,
      };
    }
  }
  // Deck slot counts rotations since the dock instant: slot 0 is the arrival panel — the
  // warrant poster and feat headlines lead, the permuted corpus follows.
  const slot = Math.max(0, cycle - Math.max(0, Math.floor(session.dockT / ROTATION_SECONDS)));
  for (let step = 0; step < deck.length; step++) {
    const entry = deck[(slot + step) % deck.length];
    if (!entry || record.shown.has(entry.id)) continue;
    record.shown.add(entry.id);
    record.picks.set(surface, { cycle, id: entry.id });
    return {
      id: entry.id,
      sponsor: String(entry.sponsor || 'Station Commerce'),
      text: String(entry.text),
      surface,
      dynamic: entry.dynamic || null,
      cycle,
      sessionKey: session.key,
    };
  }
  return null; // the whole deck ran — a very long stay ends in a dark board, never a repeat
}

/** Render one sign into an aside element, signature-gated like the ad board. */
function renderSignElement(element, notice, label) {
  if (!element) return notice;
  const signature = notice
    ? `${notice.surface}|${notice.id}|${notice.sessionKey}|${notice.sponsor}|${notice.text}`
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
    `<span class="sx-adboard__k">${escapeHtml(label)}</span> · `
    + `<span class="sx-adboard__sponsor">${escapeHtml(notice.sponsor)}</span>`
    + `<p class="sx-adboard__text">${escapeHtml(notice.text)}</p>`;
  return notice;
}

const SIGN_LABELS = { billboard: 'Dockside notice', bay: 'Bay screen', crawl: 'Station wire' };

/* ── PULSE-TIME: berth lighting follows the world calendar ─────────────────────────── */
//
// The berth's lamps and veil answer the same clock the wire does: rush hours warm the bay,
// the third (off-watch) watch runs dim, a festival day warms the whole frame. Pure read of
// (stationId, simTime) → attributes; the DOM write is signature-gated so quiet ticks repaint
// nothing.

export function berthLightingFor(state) {
  const stationId = state && state.ui && state.ui.dockedStationId;
  if (!stationId) return null;
  const simTime = Number(state && state.simTime) || 0;
  const shift = stationShiftAt(stationId, simTime);
  const rush = rushHourAt(stationId, simTime);
  const festival = festivalAt(stationId, simTime);
  const pressure = barPressureAt(stationId, simTime);
  // The veil's tint: rush hours light up (crews in the bay), the third watch runs the
  // dim-floor setting, festivals warm everything a notch.
  const filters = [];
  if (rush.active) filters.push('saturate(1.3) brightness(1.07)');
  else if (shift.id === 'third') filters.push('brightness(0.9)');
  if (festival) filters.push('sepia(0.14) saturate(1.08)');
  return {
    stationId,
    watch: shift.id,
    watchName: shift.name,
    rush: rush.active ? rush.kind : null,
    festival: festival ? festival.id : null,
    pressure,
    filter: filters.join(' ') || 'none',
    lamp: rush.active ? 'rush' : festival ? 'festival' : 'watch',
  };
}

/** Stamp the calendar on the berth frame: data attributes + the veil's live tint. */
export function applyBerthLighting(element, state) {
  const doc = element && element.ownerDocument;
  const root = doc && typeof doc.querySelector === 'function'
    ? doc.querySelector('.sx-berth') || doc.documentElement : null;
  if (!root) return null;
  const lighting = berthLightingFor(state);
  if (!lighting) {
    if (root.dataset) delete root.dataset.watch;
    return null;
  }
  const signature = `${lighting.watch}|${lighting.rush || ''}|${lighting.festival || ''}|${lighting.filter}`;
  if (root.dataset && root.dataset.lightingSignature === signature) return lighting;
  if (root.dataset) {
    root.dataset.lightingSignature = signature;
    root.dataset.watch = lighting.watch;
    if (lighting.rush) root.dataset.rush = lighting.rush; else delete root.dataset.rush;
    if (lighting.festival) root.dataset.festival = lighting.festival; else delete root.dataset.festival;
  }
  const veil = doc.querySelector('.sxb-veil');
  if (veil && veil.style) veil.style.filter = lighting.filter === 'none' ? '' : lighting.filter;
  const lamp = doc.querySelector('.sxb-berth__lamp');
  if (lamp && lamp.style) {
    lamp.style.filter = lighting.lamp === 'rush' ? 'saturate(1.6) brightness(1.3)'
      : lighting.lamp === 'festival' ? 'hue-rotate(40deg) saturate(1.2)' : '';
  }
  return lighting;
}

/** Render the current notice into the Market screen's dedicated, non-live-region surface. */
export function renderAdBoardNotice(element, state) {
  if (!element) return null;
  // PULSE-SIGNS: the billboard deck (ad board + propaganda + warrant/feat panels) with the
  // session no-repeat guarantee; the legacy selector stays for conflict-flip precedence.
  const reaction = selectAdBoardNotice({
    seed: state && state.meta && state.meta.seed,
    stationId: state && state.ui && state.ui.dockedStationId,
    simTime: state && state.simTime,
    conflictFlip: state && state.story && state.story.conflictReaction
      && state.story.conflictReaction.latestFlip,
  });
  const notice = reaction && reaction.reaction === 'conflict_flip'
    ? reaction
    : selectStationSign(state, 'billboard') || reaction;
  // The bay screen lives in the shared station frame — fill it whenever the board repaints so
  // a tab switch still finds current session copy. Same deck guarantee, different pool.
  const doc = element.ownerDocument || null;
  const bayEl = doc && typeof doc.querySelector === 'function'
    ? doc.querySelector('[data-bay-screen]') : null;
  if (bayEl) renderSignElement(bayEl, selectStationSign(state, 'bay'), SIGN_LABELS.bay);
  const crawlEl = doc && typeof doc.querySelector === 'function'
    ? doc.querySelector('[data-sign-crawl]') : null;
  if (crawlEl) renderSignElement(crawlEl, selectStationSign(state, 'crawl'), SIGN_LABELS.crawl);
  // PULSE-TIME: the berth's lamps and veil follow the world calendar — same repaint cadence,
  // signature-gated so quiet ticks cost nothing.
  applyBerthLighting(element, state);
  return renderSignElement(element, notice, SIGN_LABELS.billboard);
}

export function adBoardDeckSize() {
  return PACK.entries.length;
}

export const AD_BOARD_PACK_ID = PACK.id;
export const AD_BOARD_ROTATION_SECONDS = ROTATION_SECONDS;
