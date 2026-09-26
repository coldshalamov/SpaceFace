// Codex / Journal screen (P1-9). Surfaces the ~30KB of authored narrative that was previously
// locked behind ephemeral comms popups (last 80 only, press C). A player can now BROWSE the story
// they've encountered — beats, comms, graffiti, figures, the ship's history — and re-read it any
// time. Discover-as-you-play: entries unlock as the player reaches them (state.story.beatIndex,
// seenComms, graffitiShown), so nothing is spoiled ahead of its beat. Unseen entries show a locked
// placeholder ("— not yet encountered —") rather than the content.
//
// AN ARCHIVE INSTRUMENT (design/frontend/ORRERY.md §6 Meta): the hang is one ladder read at two
// magnifications — the eight sections as graduations on a scale, the open section's entries on a rail
// its graduation fans out to, the Hand on the entry being read. The stage is that entry's plate: its
// produced art (a portrait, a crest, a discovery still) or its section's glyph in an aperture ringed by
// the section itself, one arc per entry; the lore rises under its title; a locked entry is cipher. The
// title band carries the archive's fill as dials. This file owns no stylesheet: the composition is
// src/ui/orrery/archiveLayouts.js and the drawings src/ui/orrery/archiveInstruments.js. Reads
// state.story + the pure-data narrative tables; never mutates sim state.

import { SHIP, COLD_START, REFS, FIGURES, COMMS, GRAFFITI, BEAT_CONTENT, ENDGAME_CHOICES, PERSISTENT_CARGO } from '../../data/narrative.js';
import { TETHYS_BLACK_MARKET_DISCOVERY } from '../../data/frontierRumors.js';
import { CANONICAL_PORTRAITS, PORTRAIT_ASSET_ROOT } from '../../data/portraits.js';
import { hullPosterUrl } from '../hullPosters.js';
import { explorationDiscoveryPlates, galaxyExplorationSummary } from '../../world/explorationJournal.js';
import { decorateEntityNode } from '../entityResolver.js';
import { MAP_FOCUS, openGalaxyMap } from '../mapAuthority.js';
import { createShipLedgerPanel } from '../shipLedgerPanel.js';
import { el, words, rows, hero, settle, cue } from '../kit/index.js';
import { injectDeckplate } from '../deckplate/index.js';
import { injectArchiveLayouts } from '../orrery/archiveLayouts.js';
import {
  archivePlateSvg, archiveGaugeSvg, archiveScramble, archiveHash, archiveWedgeSvg, archiveZoom, createLadderHand,
} from '../orrery/archiveInstruments.js';
import { decrypt, rollTo } from '../orrery/text.js';
import { reducedMotion } from '../orrery/motion.js';
import { syncScrollExtent } from '../orrery/scrollExtent.js';
import { dressLampKey } from '../orrery/lampKey.js';

/** Set a CSS custom property where the host supports it (test shims carry a plain style object). */
function setVar(node, name, value) {
  if (node && node.style && typeof node.style.setProperty === 'function') node.style.setProperty(name, value);
}
/** Stagger an arrival: each node rises a beat after the one before it. */
function staggerRise(nodes, { base = 0, step = 40, cls = '' } = {}) {
  let i = 0;
  for (const node of nodes) {
    if (!node) continue;
    if (cls && node.classList) node.classList.add(cls);
    setVar(node, '--orr-delay', (base + step * i) + 'ms');
    i += 1;
  }
}
/** The highest story phase the beats reach (the phase dial's full scale). */
const MAX_PHASE = BEAT_CONTENT.reduce((max, beat) => Math.max(max, Number(beat && beat.phase) || 0), 1);

/** Honest org → faction id only. Unknown orgs stay plain text — never invent a door. */
const FIGURE_FACTION = Object.freeze({
  vale: 'faction_scn',
  hale: 'faction_scn',
  warrant_orrin: 'faction_scn',
  filecleaver_dorin: 'faction_scn',
  voss: 'faction_dmc',
  dustwife_senna: 'faction_dmc',
  sker_vane: 'faction_reach',
  clerk_yune: 'faction_quiet',
  latch_child: 'faction_quiet',
  wraith_kell: 'faction_quiet',
  maera_vols: 'faction_quiet',
  coldburn_rey: 'faction_free',
  slate: 'faction_pitborn',
  elroy: 'faction_pitborn',
});

function getManager(ctx) {
  if (ctx && ctx.screenManager) return ctx.screenManager;
  if (ctx && ctx.screens && ctx.screens.pushScreen) return ctx.screens;
  const ui = ctx && ctx.registry && ctx.registry.get && ctx.registry.get('ui');
  if (ui && ui.screenManager) return ui.screenManager;
  if (ui && ui.manager) return ui.manager;
  return null;
}
function nav(ctx, method, arg) {
  const mgr = getManager(ctx);
  if (mgr && typeof mgr[method] === 'function') { mgr[method](arg); return; }
  ctx.bus.emit('ui:' + method, { id: arg });
}

const TABS = ['Story', 'Comms', 'Discoveries', 'Graffiti', 'Figures', 'Ship', 'Archive', 'Ledger'];

/** The live tab's one-line description under the title. */
const TAB_LINES = Object.freeze({
  Story: 'The eight beats, and what the endgame offers.',
  Comms: 'Every signal you have received, filed by kind.',
  Discoveries: 'Plates from the sites you have flown down to.',
  Graffiti: 'What was written on the walls you passed.',
  Figures: 'The people whose names keep turning up.',
  Ship: "The Tessera's sealed history, and what travels with you.",
  Archive: 'Recovered transmission stills from the Reach corridor.',
  Ledger: 'The pages the Tessera keeps for itself.',
});

// Signal Archive — the four authored intro cinematics, exposed as recovered transmission stills the
// player can replay. Posters (C-INTRO-0N.jpg) are clean full-bleed frames; clips are the 6s mp4s.
// Titles/captions are in the game's dry working-space voice (00_MASTER_TASTE §5). Exported so the
// bundle/reachability checks can prove every referenced media asset is shipped.
export const SIGNAL_ARCHIVE = Object.freeze([
  { id: '01', title: 'Gate Approach', poster: 'assets/cinematics/C-INTRO-01.jpg',
    video: 'assets/cinematics/C-INTRO-01_6s.mp4', caption: 'Inbound to a jump ring. The belt keeps its own traffic.' },
  { id: '02', title: 'Belt Runner', poster: 'assets/cinematics/C-INTRO-02.jpg',
    video: 'assets/cinematics/C-INTRO-02_6s.mp4', caption: 'A hauler works the drift. Masslines only.' },
  { id: '03', title: 'Anomaly Contact', poster: 'assets/cinematics/C-INTRO-03.jpg',
    video: 'assets/cinematics/C-INTRO-03_6s.mp4', caption: 'Violet core, live. Charted space ends here.' },
  { id: '04', title: 'Station Berth', poster: 'assets/cinematics/C-INTRO-04.jpg',
    video: 'assets/cinematics/C-INTRO-04_6s.mp4', caption: 'Docking wall ahead. Someone always logs the arrival.' },
]);

// Deep-link support: the main menu's "Signal Archive" entry sets a pending tab so codex opens on it.
let _requestedTab = null;
export function requestCodexTab(tab) { if (TABS.includes(tab)) _requestedTab = tab; }

// A discovery completion can request one exact, already-projected plate. This is UI-local by
// design: world discovery remains the durable record and Continue reconstructs the plate from it.
let _requestedDiscovery = null;

function normalizeDiscoveryTarget(target) {
  const sectorId = target && typeof target.sectorId === 'string' ? target.sectorId.trim() : '';
  const poiId = target && typeof target.poiId === 'string' ? target.poiId.trim() : '';
  return sectorId && poiId ? { sectorId, poiId } : null;
}

export function requestCodexDiscovery(target) {
  const normalized = normalizeDiscoveryTarget(target);
  if (!normalized) return false;
  _requestedDiscovery = normalized;
  return true;
}

export function clearCodexDiscoveryRequest() {
  _requestedDiscovery = null;
}

export function consumeCodexDiscoveryRequest(state) {
  const target = _requestedDiscovery;
  _requestedDiscovery = null;
  if (!target) return null;
  return explorationDiscoveryPlates(state).find((plate) => (
    plate.sectorId === target.sectorId && plate.poiId === target.poiId
  )) || null;
}

export function focusCodexDiscoveryEntry(entry) {
  if (!entry || typeof entry.focus !== 'function') return false;
  try {
    entry.focus({ preventScroll: true });
  } catch (_) {
    try { entry.focus(); } catch (_) { return false; }
  }
  return true;
}

export function tethysCodexReturnIntent(state, plate) {
  const discovery = TETHYS_BLACK_MARKET_DISCOVERY;
  if (!plate || plate.id !== `${discovery.sectorId}:${discovery.poiId}`
    || plate.sectorId !== discovery.sectorId || plate.poiId !== discovery.poiId) return null;
  const record = state && state.world && state.world.frontierRumors && state.world.frontierRumors.byId
    && state.world.frontierRumors.byId[discovery.rumorId];
  if (!record || record.phase !== 'contacted' || record.contactId !== discovery.contactId) return null;
  return {
    focus: MAP_FOCUS.SYSTEM,
    sectorId: discovery.sectorId,
    stationId: discovery.stationId,
    label: 'Tethys Trade Hub',
    source: 'codex:tethys-black-market-return',
  };
}

export function openTethysCodexReturn(ctx, plate) {
  const intent = tethysCodexReturnIntent(ctx && ctx.state, plate);
  return intent ? openGalaxyMap(ctx, intent) : false;
}
const COMMS_CATEGORIES = [
  ['Ambient', 'ambient'], ['Traps', 'traps'], ['Personal', 'personal'],
  ['Late Game', 'late'], ['Story', 'story'],
];
const FIGURE_ALWAYS = ['protagonist', 'kessler', 'hale', 'slate', 'quinn', 'voss'];
const FIGURE_GATED = { elroy: 2, mira: 4, rook: 4, vale: 3, kurtz: 6 };

// Beat titles (kept here, not in narrative data, because BEAT_CONTENT[].hint is the in-world
// "Captain's Log" voice — this is the neutral chapter label for the codex index).
const BEAT_TITLES = [
  'B0 — Cold Start',
  'B1 — Honest Work',
  'B2 — First Blood',
  'B3 — Bigger Boat',
  'B4 — Pick a Side',
  'B5 — Proving Ground',
  'B6 — Empire Seed',
  'B7 — The Deep Reach',
];

const FIGURE_DOSSIERS = {
  protagonist: {
    body: 'Wren, current pilot of the Tessera. Concord Registry still lists the operator as UNKNOWN; the ship knows better than the paperwork.',
  },
  kessler: {
    body: 'Cargo registrar tied to the 47-A weight variance. If a manifest changes mass, his initials usually survive the transfer.',
    note: 'Signal phrases: weight, variance, seal, prior haul.',
  },
  hale: {
    body: 'Gate 3 customs officer. Hale does not need to open a sealed hold; he only needs to file the second fine correctly.',
    note: 'Signal phrases: REF 44-C, inspection, no flags, cleared.',
  },
  slate: {
    body: 'Shipyard welder. His repairs look official because they are signed official, which is not the same as safe.',
    note: 'Signal phrases: weld, berth, seam, next gate.',
  },
  quinn: {
    body: 'Outpost bar proprietor. Rates stay posted, management keeps changing, and the drawer always closes on the same count.',
    note: 'Signal phrases: same rates, under new management, no questions.',
  },
  voss: {
    body: 'Drift claim recorder. Exhausted claims have a way of becoming fresh again for the crew that files second.',
    note: 'Signal phrases: claim, vein, exhaustion notice, cutter.',
  },
  elroy: {
    body: 'Pit Engineering maintenance worker attached to the recycler report. The bounty paperwork called him hostile; the ledger says why that mattered.',
  },
  mira: {
    body: 'Bourse freight seal clerk. When the verification database agrees with the cargo seal, the seal becomes the story everyone else must use.',
  },
  rook: {
    body: 'Bounty broker. A clean tag is useful because it can be billed twice before anyone asks which target was real.',
  },
  vale: {
    body: 'Concord administrator. Vale appears through forwarded paperwork, authorization codes, and systems that make refusal more expensive than compliance.',
  },
  kurtz: {
    body: 'The Ashfall figure. His station is less a confession than a ledger that kept running after everyone else left.',
  },
};

function safeStory(ctx) {
  return (ctx.state && ctx.state.story) || { beatIndex: 0, seenComms: {}, graffitiShown: {}, endgameChoice: null, flags: {} };
}

function storyBeatIndex(story = {}) {
  const beat = Math.floor(Number(story.beatIndex) || 0);
  return Math.max(0, Math.min(BEAT_CONTENT.length - 1, beat));
}

export function commUnlocked(entry, story, beat, categoryKey) {
  const seen = story && story.seenComms || {};
  if (!entry) return false;
  if (seen[entry.id]) return true;
  if (seen['trap_' + entry.id]) return true;
  if (categoryKey === 'traps') return false;
  const b = entry.beat != null ? entry.beat : 0;
  return b <= beat;
}

function countEncounteredGraffiti(story = {}) {
  const shown = story.graffitiShown || {};
  let count = 1; // The previous crew's bulkhead mark is always present on the ship.
  for (const [key, seen] of Object.entries(shown)) {
    if (!seen) continue;
    const line = key.includes(':') ? key.slice(key.indexOf(':') + 1) : key;
    if (line) count++;
  }
  return count;
}

export function codexProgressSummary(story = {}, state = null) {
  const beat = storyBeatIndex(story);
  let commsTotal = COLD_START.length;
  let commsUnlocked = COLD_START.length;
  for (const [, key] of COMMS_CATEGORIES) {
    const entries = Array.isArray(COMMS[key]) ? COMMS[key] : [];
    commsTotal += entries.length;
    commsUnlocked += entries.filter((entry) => commUnlocked(entry, story, beat, key)).length;
  }
  const figureTotal = FIGURE_ALWAYS.length + Object.keys(FIGURE_GATED).length;
  const figureUnlocked = FIGURE_ALWAYS.length + Object.values(FIGURE_GATED).filter((unlockBeat) => beat >= unlockBeat).length;
  const graffitiTotal = Object.keys(GRAFFITI).length;
  const graffitiUnlocked = Math.min(graffitiTotal, countEncounteredGraffiti(story));
  const storyUnlocked = Math.min(BEAT_CONTENT.length, beat + 1);
  const endgameUnlocked = beat >= 7 ? ENDGAME_CHOICES.length : 0;
  const phase = BEAT_CONTENT[beat] && BEAT_CONTENT[beat].phase || 1;
  const items = [
    { key: 'Story', value: storyUnlocked + '/' + BEAT_CONTENT.length + ' beats' },
    { key: 'Comms', value: commsUnlocked + '/' + commsTotal + ' unlocked' },
    { key: 'Figures', value: figureUnlocked + '/' + figureTotal + ' known' },
    { key: 'Graffiti', value: graffitiUnlocked + '/' + graffitiTotal + ' encountered' },
    { key: 'Endgame', value: endgameUnlocked + '/' + ENDGAME_CHOICES.length + ' revealed' },
    { key: 'Phase', value: 'Phase ' + phase },
  ];
  if (state) {
    const gal = galaxyExplorationSummary(state);
    items.push({ key: 'Survey', value: gal.overallPercent + '% (' + gal.foundPois + '/' + gal.totalPois + ' sites)' });
  }
  return {
    beat,
    phase,
    note: 'Locked counts mean future entries are intentionally hidden until story progress, encounter flags, or conditional signal triggers reveal them.',
    items,
  };
}

function normalizeSearch(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** A cipher the width of a short name, for an entry whose very name is still unknown ("???"). */
function unknownNameCipher(id) {
  const h = archiveHash(id);
  const first = 'x'.repeat(4 + (h % 4));
  const second = 'x'.repeat(5 + ((h >>> 3) % 4));
  return archiveScramble(first + ' ' + second, id);
}

/** A locked beat keeps its number in the clear ("B3 — "); the words after it are cipher. */
function lockedNameParts(id, name) {
  const text = String(name == null ? '' : name);
  if (!/[A-Za-z]{2}/.test(text)) return { code: '', cipher: unknownNameCipher(id) };
  const m = /^(B\d+\s+—\s+)(.*)$/.exec(text);
  return m ? { code: m[1], cipher: archiveScramble(m[2], id) } : { code: '', cipher: archiveScramble(text, id) };
}

/** Fill a name node for a locked entry: the real words for assistive tech, cipher for the eye. */
function writeLockedName(node, id, name, suffix = '') {
  if (!node) return;
  node.textContent = '';
  node.appendChild(el('span', 'cx-sr', String(name) + suffix));
  const parts = lockedNameParts(id, name);
  const shown = el('span');
  shown.setAttribute('aria-hidden', 'true');
  if (parts.code) shown.appendChild(el('span', 'cx-code', parts.code));
  shown.appendChild(el('span', 'cx-cipher', parts.cipher));
  node.appendChild(shown);
}

/** The lore a locked entry will hold, as a block of cipher (decorative; the words say "not yet"). */
const CIPHER_FILLER = 'the record exists and is sealed until the archive has a reason to open it for this pilot';

/**
 * One codex entry: a name for the ladder, and the article the stage shows when the entry is being
 * read. The article keeps `.sf-codex-entry` as an inert hook; inside it the title, the meta line,
 * the body as sentences inside a measure, the note as the emphasised sentence under a hairline.
 * `signal` marks the filed endgame choice; `image` is produced art the plate stands in its aperture.
 */
function makeEntry({ id, name, sub = '', title = null, meta = null, body = '', note = '', noteBad = false, signal = false, locked = false, image = null, mark = '' }) {
  const article = el('article', 'sf-codex-entry' + (locked ? ' is-locked' : ''));
  const heading = el('h2', 'k-display k-t-title');
  const titleText = title != null ? title : name;
  const titleSpan = el('span', signal ? 'cx-filed' : (locked ? 'k-38' : ''), titleText);
  heading.appendChild(titleSpan);
  if (locked) writeLockedName(titleSpan, id, titleText);
  article.appendChild(heading);
  if (meta != null && meta !== '') {
    const metaEl = el('p', 'cx-reader__meta');
    if (typeof meta === 'string') metaEl.textContent = meta;
    else metaEl.appendChild(meta);
    article.appendChild(metaEl);
  }
  const measure = el('div', 'k-measure');
  if (locked) {
    const block = el('p', 'cx-cipher-block', archiveScramble(CIPHER_FILLER, id));
    block.setAttribute('aria-hidden', 'true');
    measure.appendChild(block);
  }
  for (const para of String(body || '').split('\n')) {
    if (para.trim()) measure.appendChild(el('p', 'k-sentence' + (locked ? ' k-38' : ''), para));
  }
  if (note) {
    if (measure.childNodes.length) measure.appendChild(el('hr', 'k-rule'));
    measure.appendChild(el('p', 'k-sentence k-sentence--emph' + (noteBad ? ' k-bad' : ''), note));
  }
  article.appendChild(measure);
  return {
    id, name, sub, signal, locked, article, measure, mark, heading, titleSpan, titleText,
    image: typeof image === 'string' && image ? image : null, requested: false,
  };
}

/** Take the reader's chrome (filed-under line, plate, turn) off an entry, leaving its own words. */
function undressEntry(entry) {
  if (!entry || !entry.article || typeof entry.article.querySelectorAll !== 'function') return;
  for (const node of [...entry.article.querySelectorAll(':scope > .cx-chrome')]) node.remove();
}

/** The glyph a tab's entries stand in the plate when they carry no produced art. */
const TAB_GLYPHS = Object.freeze({
  Story: 'story',
  Comms: 'comms',
  Discoveries: 'discoveries',
  Graffiti: 'graffiti',
  Figures: 'figures',
  Ship: 'ship',
});

/** Produced art for a figure: the canonical portrait, else the faction's generated crest. */
function figureArt(figureKey) {
  if (!figureKey) return null;
  const portrait = CANONICAL_PORTRAITS[figureKey];
  if (portrait) return { src: PORTRAIT_ASSET_ROOT + portrait, kind: 'photo' };
  const faction = FIGURE_FACTION[figureKey];
  if (faction) return { src: 'assets/ui/generated/crests/' + faction + '.webp', kind: 'crest' };
  return null;
}

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * The codex's produced plates (assets/ui/generated/codex/, manifest beside them): one per story beat;
 * the endgame's choices stand in the last beat's plate (they are offered at the Deep Reach).
 */
const CODEX_PLATE_ROOT = 'assets/ui/generated/codex/';
function codexPlate(entry) {
  const id = String(entry && entry.id || '');
  const beat = /^beat:(\d+)$/.exec(id);
  if (beat && Number(beat[1]) <= 7) return CODEX_PLATE_ROOT + 'beat' + beat[1] + '.webp';
  if (id.startsWith('endgame:')) return CODEX_PLATE_ROOT + 'beat7.webp';
  return null;
}

/** The ship you fly, as its produced render: the Tessera's pages stand the hull it is today. */
function flownHullRender(state) {
  const player = state && state.player;
  const owned = player && Array.isArray(player.ownedShips) ? player.ownedShips : [];
  const ship = owned[Number(player && player.activeShipIndex) || 0] || owned[0] || null;
  return ship && ship.defId ? hullPosterUrl(ship.defId, 'hero') : null;
}

/** "Comms (25/45)" -> "Comms": a section's label without its running count. */
function sectionTitle(label) {
  return String(label || '').replace(/\s*\(\d+\/\d+\)\s*$/, '');
}

export const codexScreen = {
  id: 'codex',
  _activeTab: 'Story',
  _query: '',

  mount(rootEl, ctx) {

    injectDeckplate();
    injectArchiveLayouts();
    // A fresh mount opens on the first section with no search (a deep link still picks its tab in
    // onShow); a hidden-and-shown codex keeps the page the player left it on.
    this._activeTab = 'Story';
    this._query = '';
    this._shownId = null;
    if (this._hand) { try { this._hand.dispose(); } catch (_) { /* detached */ } }
    this._hand = null;
    rootEl.innerHTML = '';
    rootEl.classList.remove('panel', 'sf-menu', 'sf-menu-wide', 'sf-codex');
    rootEl.classList.add('k-screen', 'of-codex', 'orr-archive');
    this._codexRoot = rootEl;
    rootEl.dataset.kReady = '0';
    delete rootEl.dataset.stamp;
    rootEl.setAttribute('aria-label', 'Codex');

    // Title: "Codex" and the live tab's one line; the archive's fill as dials beside them.
    const title = el('header', 'k-title');
    const heading = el('h1', 'k-display k-t-title', 'Codex');
    title.appendChild(heading);
    const tabLine = el('p', 'k-t-emph k-62', TAB_LINES[this._activeTab] || '');
    title.appendChild(tabLine);
    const statusWrap = el('div');
    statusWrap.setAttribute('aria-label', 'Codex unlock status');
    title.appendChild(statusWrap);
    rootEl.appendChild(title);
    this._tabLine = tabLine;
    this._status = statusWrap;

    // The stage: the focused entry (or the Signal Archive row, or the Ledger panel).
    const stage = el('div', 'k-stage k-stage--scroll');
    stage.id = 'sf-codex-stage';
    stage.setAttribute('role', 'tabpanel');

    // The hang: the search over one ladder — the eight sections as a scale, the open one's entries
    // on a rail beside it.
    const hang = el('div', 'k-hang');
    const searchWrap = el('div', 'cx-search');
    // `k-input` restates the search field in kit clothes; `sf-codex-search` is the inert hook.
    const search = el('input', 'k-input sf-codex-search');
    search.type = 'search';
    search.placeholder = 'Search Codex';
    search.setAttribute('aria-label', 'Search Codex');
    search.value = this._query;
    search.addEventListener('input', () => {
      this._query = search.value || '';
      this._render(ctx);
    });
    searchWrap.appendChild(search);
    hang.appendChild(searchWrap);
    this._search = search;
    this._searchWrap = searchWrap;

    // `dom.words` owns the arrow-key roving (up and down the scale); the list is the tablist and
    // each word a tab (`.sf-tabbar` / `.sf-tab` kept as hooks — the ledger route harness clicks them
    // by text). A pad's left/right still turns the tabs over (src/ui/input.js).
    const bar = words(TABS.map((t) => ({ action: t, label: t, current: t === this._activeTab })), {
      row: false, size: 'emph', ariaLabel: 'Codex sections',
      onPick: (t) => { this._activeTab = t; this._render(ctx); },
    });
    bar.classList.add('sf-tabbar');
    bar.setAttribute('role', 'tablist');
    bar.setAttribute('aria-orientation', 'vertical');
    this._tabBtns = {};
    for (const b of bar.querySelectorAll('.k-word')) {
      const t = b.dataset.action;
      b.classList.add('sf-tab');
      b.id = 'sf-codex-tab-' + t.toLowerCase();
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', stage.id);
      b.parentElement.setAttribute('role', 'presentation');
      this._tabBtns[t] = b;
    }
    hang.appendChild(bar);

    const index = el('div', 'cx-ladder');
    hang.appendChild(index);
    // The fan from the open section's graduation to its entries' rail (drawn after layout).
    const wedge = el('div', 'cx-wedge');
    wedge.setAttribute('aria-hidden', 'true');
    hang.appendChild(wedge);
    rootEl.appendChild(hang);
    rootEl.appendChild(stage);
    this._index = index;
    this._wedge = wedge;
    this._hangEl = hang;
    this._body = stage;
    if (typeof index.addEventListener === 'function') {
      index.addEventListener('scroll', () => this._drawWedge(), { passive: true });
    }
    if (typeof ResizeObserver === 'function') {
      try {
        const ro = new ResizeObserver(() => { this._drawWedge(); this._placeHand(true); });
        ro.observe(hang);
      } catch (_) { /* no observer, no resize */ }
    }

    // Foot: one way back, and the archive's tape — every entry of the open section as a tick you
    // scrub through with the pointer (or the arrow keys once it has focus); locked ticks read as
    // cipher under the cursor.
    const foot = el('footer', 'k-foot');
    const close = el('button', 'k-word k-word--emph sf-back', 'Close');
    close.type = 'button'; close.dataset.action = 'close';
    close.addEventListener('click', () => { cue('confirm'); nav(ctx, 'popScreen'); });
    foot.appendChild(close);
    const tape = el('div', 'cx-tape');
    tape.setAttribute('role', 'slider');
    tape.setAttribute('aria-label', 'Scrub the archive');
    tape.setAttribute('aria-orientation', 'horizontal');
    tape.tabIndex = 0;
    tape.hidden = true;
    foot.appendChild(tape);
    this._tape = tape;
    this._bindTape(tape);
    rootEl.appendChild(foot);

    // The plate leans toward the pointer (a Tilt Plate), a sheen crossing its art.
    this._bindTilt(stage);
    if (!this._platesWarm && typeof Image === 'function') {
      this._platesWarm = [];
      for (let i = 0; i <= 7; i += 1) {
        const warm = new Image();
        warm.decoding = 'async';
        warm.src = CODEX_PLATE_ROOT + 'beat' + i + '.webp';
        this._platesWarm.push(warm);
      }
    }

    this._regions = { title, hang, stage, foot };
    this._focusByTab = {};
    this._ctx = ctx;
    this._visible = false;
    this._unsubs = [];
    const refreshIfVisible = () => { if (this._visible && this._body) this._render(this._ctx); };
    this._unsubs.push(ctx.bus.on('story:beatAdvanced', refreshIfVisible));
    this._unsubs.push(ctx.bus.on('comms:popup', refreshIfVisible));
    this._unsubs.push(ctx.bus.on('graffiti:show', refreshIfVisible));
    this._unsubs.push(ctx.bus.on('discovery:plateUnlocked', refreshIfVisible));

    this._render(ctx);
    rootEl.dataset.kReady = '1';
  },

  refresh(ctx, options) {
    this._ctx = ctx;
    // Live updates arrive on the bus listeners (story:beatAdvanced, comms:popup, graffiti:show,
    // discovery:plateUnlocked); the shell's ~3 Hz periodic pass only reset the reader's scroll.
    if (options && options.periodic) return;
    if (this._body) this._render(ctx);
  },
  onShow(ctx) {
    this._ctx = ctx;
    this._visible = true;
    // Consume both requests once. A valid plate is more specific than a tab request; a stale plate
    // fails closed and leaves the ordinary requested tab available.
    const requestedTab = _requestedTab;
    _requestedTab = null;
    const requestedPlate = consumeCodexDiscoveryRequest(ctx && ctx.state);
    this._requestedDiscoveryId = requestedPlate ? requestedPlate.id : null;
    if (requestedPlate) {
      this._activeTab = 'Discoveries';
      this._query = '';
    } else if (requestedTab) {
      this._activeTab = requestedTab;
    }
    if ((requestedPlate || requestedTab) && this._body) this._render(ctx);
    // screenManager refreshes immediately after onShow. Keep the requested identity through that
    // pass so its explicit in-screen focus wins, then discard the UI-only request.
    if (requestedPlate) {
      const requestedId = requestedPlate.id;
      const clearRequested = () => {
        if (this._requestedDiscoveryId === requestedId) this._requestedDiscoveryId = null;
      };
      if (typeof queueMicrotask === 'function') queueMicrotask(clearRequested);
      else Promise.resolve().then(clearRequested);
    }
    // The Ledger panel owns local page-cursor/evidence-detail state; an explicit show may refresh it.
    if (this._activeTab === 'Ledger' && this._ledgerPanel) { try { this._ledgerPanel.onShow(); } catch (_) {} }
    // The cut and the settle (sheet §7). The kit's settle needs a real frame clock; the discovery
    // return test calls onShow without a mounted screen.
    this._shownId = null;
    this._arrive();
    if (this._regions && typeof requestAnimationFrame === 'function') {
      try {
        cue('open');
        settle(this._regions.title, { from: 'top', state: 'codex:open' });
        settle(this._regions.hang, { from: 'left', state: 'codex:open' });
        settle(this._regions.stage, { from: 'right', state: 'codex:open' });
        settle(this._regions.foot, { from: 'bottom', state: 'codex:open' });
      } catch (_) { /* motion is cosmetic */ }
    }
  },
  onHide() {
    this._visible = false;
    try { cue('close'); } catch (_) {}
    // Release the ledger's image request when the codex hides; no rebuild happens here.
    if (this._ledgerPanel) { try { this._ledgerPanel.onHide(); } catch (_) {} }
  },

  _syncTabs() {
    for (const t of TABS) {
      const b = this._tabBtns && this._tabBtns[t];
      if (!b) continue;
      const active = t === this._activeTab;
      b.setAttribute('aria-current', String(active));
      b.setAttribute('aria-selected', String(active));
      b.tabIndex = active ? 0 : -1;
    }
    if (this._tabLine) this._tabLine.textContent = TAB_LINES[this._activeTab] || '';
  },

  _render(ctx) {
    if (!this._body) return;
    // The Ledger tab owns its own page cursor and evidence-detail subtree. An unrelated refresh
    // (story/comms/graffiti event) must not tear that local state down: if the Ledger panel is
    // already mounted on the stage, only refresh the tab words and return.
    if (this._activeTab === 'Ledger' && this._ledgerPanel && this._ledgerPanel.el
        && this._ledgerPanel.el.parentNode === this._body) {
      this._syncTabs();
      return;
    }
    // Leaving the Ledger tab: destroy its panel so no listener or image lingers off-tab.
    if (this._activeTab !== 'Ledger' && this._ledgerPanel) {
      try { this._ledgerPanel.destroy(); } catch (_) {}
      this._ledgerPanel = null;
    }
    this._body.innerHTML = '';
    this._index.innerHTML = '';
    this._sections = [];
    this._entries = [];
    this._syncTabs();
    // The open tab rides on the root so the sheet can set the entry pane's emblem for its kind.
    if (this._codexRoot && this._codexRoot.dataset) this._codexRoot.dataset.tab = String(this._activeTab || '').toLowerCase();
    // Archive + Ledger are media/panel surfaces, not searchable narrative — hide the chrome.
    const isChromeLess = this._activeTab === 'Archive' || this._activeTab === 'Ledger';
    this._searchWrap.hidden = isChromeLess;
    this._status.hidden = isChromeLess;
    if (this._search && !isChromeLess && this._search.value !== this._query) this._search.value = this._query;
    if (!isChromeLess) this._renderStatus(ctx);
    switch (this._activeTab) {
      case 'Story':    this._renderStory(ctx); break;
      case 'Comms':    this._renderComms(ctx); break;
      case 'Discoveries': this._renderDiscoveries(ctx); break;
      case 'Graffiti': this._renderGraffiti(ctx); break;
      case 'Figures':  this._renderFigures(ctx); break;
      case 'Ship':     this._renderShip(ctx); break;
      case 'Archive':  this._renderArchive(ctx); break;
      case 'Ledger':   this._renderLedger(ctx); break;
    }
    // What was locked the last time this section was drawn and is open now decrypts in place.
    if (!this._lockedByTab) this._lockedByTab = {};
    const before = this._lockedByTab[this._activeTab];
    const lockedNow = new Set(this._entries.filter((entry) => entry.locked).map((entry) => entry.id));
    this._lockedByTab[this._activeTab] = lockedNow;
    const opened = before ? this._entries.filter((entry) => !entry.locked && before.has(entry.id)) : [];
    if (!isChromeLess) this._applySearchFilter();
    else { this._list = null; this._placeHand(); this._renderTape([]); }
    this._drawWedge();
    if (opened.length) this._announceUnlocked(opened);
  },

  /** Entries that have just unlocked: their names decrypt from cipher to words, their ticks flare. */
  _announceUnlocked(entries) {
    for (const entry of entries) {
      const row = this._list && typeof this._list.querySelector === 'function'
        ? [...this._list.querySelectorAll('.k-row[data-id]')].find((candidate) => candidate.dataset.id === entry.id) : null;
      const name = row && row.querySelector('.k-row__name');
      if (name) decrypt(name, entry.name, { duration: 900 });
      if (row && row.classList) {
        row.classList.add('is-unlocking');
        setTimeout(() => { if (row.classList) row.classList.remove('is-unlocking'); }, 1800);
      }
      const tick = this._tape && typeof this._tape.querySelector === 'function'
        ? [...this._tape.querySelectorAll('.cx-tape__tick')].find((node) => node.dataset.id === entry.id) : null;
      if (tick && tick.classList) {
        tick.classList.add('is-unlocking');
        setTimeout(() => { if (tick.classList) tick.classList.remove('is-unlocking'); }, 1800);
      }
      if (entry.id === this._shownId && entry.titleSpan) decrypt(entry.titleSpan, entry.titleText, { duration: 900 });
    }
  },

  /** The entry being read in the open section, if any. */
  _currentEntry() {
    const id = this._focusByTab && this._focusByTab[this._activeTab];
    return (this._tapeEntries || []).find((entry) => entry.id === id) || null;
  },

  /**
   * The tape: one tick per entry of the open section (after the search), a long tick and a name at
   * each section's first entry, the cursor on the entry being read. Built with the DOM (no markup
   * strings), positions as fractions of the tape so no layout is needed to draw it.
   */
  _renderTape(sections) {
    const tape = this._tape;
    if (!tape) return;
    const list = sections.flatMap((section) => section.entries);
    this._tapeEntries = list;
    tape.innerHTML = '';
    tape.hidden = list.length < 2;
    if (list.length < 2) return;
    const n = list.length;
    const at = (i) => ((i + 0.5) / n) * 100;
    const place = (node, pct) => { if (node.style) node.style.left = pct.toFixed(3) + '%'; return node; };
    tape.appendChild(el('span', 'cx-tape__rule'));
    // the stretches of the archive the player has opened are lit bands on the rule; locked ones stay dark
    for (let a = 0; a < n;) {
      if (list[a].locked) { a += 1; continue; }
      let b = a;
      while (b + 1 < n && !list[b + 1].locked) b += 1;
      const band = place(el('span', 'cx-tape__lit'), (a / n) * 100);
      if (band.style) band.style.width = (((b - a + 1) / n) * 100).toFixed(3) + '%';
      tape.appendChild(band);
      a = b + 1;
    }
    const width = typeof tape.getBoundingClientRect === 'function' ? tape.getBoundingClientRect().width : 0;
    // section names on the tape: the larger sections claim their place first, none overlaps another
    const starts = [];
    let first = 0;
    for (const section of sections) {
      if (!section.entries.length) continue;
      starts.push({ name: sectionTitle(section.label), i: first, size: section.entries.length });
      first += section.entries.length;
    }
    const claimed = [];
    for (const s of [...starts].sort((a, b) => b.size - a.size || a.i - b.i)) {
      const len = s.name.length * 7.4 + 12;
      const tick = (at(s.i) / 100) * width;
      // a name that would run off the tape's end reads leftward from its tick instead
      const toLeft = width > 0 && tick + len > width;
      const x0 = toLeft ? tick - len : tick;
      const x1 = toLeft ? tick : tick + len;
      if (width && claimed.some(([a, b]) => x0 < b && x1 > a)) continue;
      claimed.push([x0, x1]);
      tape.appendChild(place(el('span', 'cx-tape__sec' + (toLeft ? ' is-end' : ''), s.name), at(s.i)));
    }
    let i = 0;
    for (const section of sections) {
      if (!section.entries.length) continue;
      section.entries.forEach((entry, k) => {
        const tick = place(el('span', 'cx-tape__tick' + (entry.locked ? ' is-locked' : '') + (k === 0 ? ' is-major' : '')), at(i));
        tick.dataset.i = String(i);
        tick.dataset.id = entry.id;
        tape.appendChild(tick);
        if (n <= 14 || (i + 1) % 5 === 0 || i === 0) tape.appendChild(place(el('span', 'cx-tape__num' + (entry.locked ? ' is-locked' : ''), pad2(i + 1)), at(i)));
        i += 1;
      });
    }
    const cursor = el('span', 'cx-tape__cursor');
    cursor.appendChild(el('i', 'cx-tape__cursor-pip'));
    tape.appendChild(cursor);
    const hover = el('span', 'cx-tape__hover');
    hover.hidden = true;
    hover.appendChild(el('span', 'cx-tape__hover-name'));
    tape.appendChild(hover);
    this._syncTape();
  },

  /** Seat the tape's cursor and its slider reading on the entry being read. */
  _syncTape() {
    const tape = this._tape;
    const list = this._tapeEntries || [];
    if (!tape || list.length < 2) return;
    const cur = this._currentEntry();
    const i = Math.max(0, list.indexOf(cur));
    const cursor = tape.querySelector('.cx-tape__cursor');
    if (cursor && cursor.style) cursor.style.left = (((i + 0.5) / list.length) * 100).toFixed(3) + '%';
    for (const tick of tape.querySelectorAll('.cx-tape__tick')) {
      if (tick.classList && typeof tick.classList.toggle === 'function') tick.classList.toggle('is-now', tick.dataset.i === String(i));
    }
    tape.setAttribute('aria-valuemin', '1');
    tape.setAttribute('aria-valuemax', String(list.length));
    tape.setAttribute('aria-valuenow', String(i + 1));
    tape.setAttribute('aria-valuetext', cur ? (cur.locked ? 'Locked entry' : cur.name) + ', ' + (i + 1) + ' of ' + list.length : '');
  },

  /** Point at tick `i` under the pointer: its name floats over it (cipher when it is locked). */
  _hoverTape(i) {
    const tape = this._tape;
    const hover = tape && tape.querySelector('.cx-tape__hover');
    if (!hover) return;
    const list = this._tapeEntries || [];
    const entry = i >= 0 ? list[i] : null;
    for (const tick of tape.querySelectorAll('.cx-tape__tick.is-hover')) tick.classList.remove('is-hover');
    if (!entry) { hover.hidden = true; this._hoverI = -1; return; }
    if (i === this._hoverI && !hover.hidden) return;
    this._hoverI = i;
    const tick = tape.querySelector('.cx-tape__tick[data-i="' + i + '"]');
    if (tick) tick.classList.add('is-hover');
    const name = hover.querySelector('.cx-tape__hover-name');
    hover.hidden = false;
    hover.classList.toggle('is-locked', !!entry.locked);
    const pct = ((i + 0.5) / list.length) * 100;
    if (hover.style) {
      hover.style.left = pct.toFixed(3) + '%';
      hover.style.setProperty('--cx-hover-shift', pct < 12 ? '0%' : pct > 88 ? '-100%' : '-50%');
    }
    // a locked entry's cipher shuffles each time the cursor lands on it: the archive trying the lock
    if (name) {
      if (entry.locked) {
        const parts = lockedNameParts(entry.id + ':' + (this._hoverTry = (this._hoverTry || 0) + 1), entry.name);
        name.textContent = parts.code + parts.cipher;
      } else name.textContent = entry.name;
    }
  },

  /** Turn the page to tape entry `i` (a live scrub keeps the page quiet until the pointer lets go). */
  _scrubTo(i) {
    const list = this._tapeEntries || [];
    const entry = list[Math.max(0, Math.min(list.length - 1, i))];
    if (!entry) return;
    if (entry.id !== (this._focusByTab && this._focusByTab[this._activeTab])) {
      cue('move');
      this._focus(entry.id);
    }
  },

  _bindTape(tape) {
    if (!tape || typeof tape.addEventListener !== 'function') return;
    const indexAt = (clientX) => {
      const list = this._tapeEntries || [];
      if (!list.length || typeof tape.getBoundingClientRect !== 'function') return -1;
      const r = tape.getBoundingClientRect();
      const t = (clientX - r.left) / Math.max(1, r.width);
      return Math.max(0, Math.min(list.length - 1, Math.floor(t * list.length)));
    };
    let pending = -1;
    let frame = 0;
    const later = globalThis.requestAnimationFrame || ((fn) => setTimeout(fn, 16));
    const commit = () => { frame = 0; if (pending < 0) return; const i = pending; pending = -1; this._scrubTo(i); };
    const queue = (i) => { if (i < 0) return; pending = i; if (!frame) frame = later(commit); };
    const finish = () => {
      if (!this._scrubbing) return;
      this._scrubbing = false;
      tape.classList.remove('is-scrubbing');
      // the page the scrub stopped on arrives properly: its plate draws, its title decrypts
      const entry = this._currentEntry();
      if (entry) { this._shownId = null; this._showEntry(entry); this._placeHand(); }
    };
    tape.addEventListener('pointerdown', (ev) => {
      if (ev.button != null && ev.button !== 0) return;
      this._scrubbing = true;
      tape.classList.add('is-scrubbing');
      try { tape.setPointerCapture(ev.pointerId); } catch (_) { /* synthetic pointer */ }
      try { tape.focus({ preventScroll: true }); } catch (_) { /* no focus in this host */ }
      queue(indexAt(ev.clientX));
      this._hoverTape(indexAt(ev.clientX));
      if (typeof ev.preventDefault === 'function') ev.preventDefault();
    });
    tape.addEventListener('pointermove', (ev) => {
      const i = indexAt(ev.clientX);
      this._hoverTape(i);
      if (this._scrubbing) queue(i);
    });
    tape.addEventListener('pointerup', finish);
    tape.addEventListener('pointercancel', finish);
    tape.addEventListener('lostpointercapture', finish);
    tape.addEventListener('pointerleave', () => { if (!this._scrubbing) this._hoverTape(-1); });
    tape.addEventListener('keydown', (ev) => {
      const list = this._tapeEntries || [];
      if (!list.length) return;
      const i = Math.max(0, list.indexOf(this._currentEntry()));
      let next = i;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') next = i + 1;
      else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') next = i - 1;
      else if (ev.key === 'PageDown') next = i + 5;
      else if (ev.key === 'PageUp') next = i - 5;
      else if (ev.key === 'Home') next = 0;
      else if (ev.key === 'End') next = list.length - 1;
      else return;
      ev.preventDefault();
      this._scrubTo(Math.max(0, Math.min(list.length - 1, next)));
    });
    tape.addEventListener('wheel', (ev) => {
      const list = this._tapeEntries || [];
      if (!list.length || !ev.deltaY) return;
      ev.preventDefault();
      const i = Math.max(0, list.indexOf(this._currentEntry()));
      this._scrubTo(Math.max(0, Math.min(list.length - 1, i + (ev.deltaY > 0 ? 1 : -1))));
    }, { passive: false });
  },

  /** The plate leans toward the pointer and a sheen crosses its art (still under reduced motion). */
  _bindTilt(stage) {
    if (!stage || typeof stage.addEventListener !== 'function') return;
    let frame = 0;
    let last = null;
    const later = globalThis.requestAnimationFrame || ((fn) => setTimeout(fn, 16));
    const apply = () => {
      frame = 0;
      const plate = this._body && typeof this._body.querySelector === 'function' ? this._body.querySelector('.cx-reader__plate') : null;
      if (!plate || !plate.style || typeof plate.getBoundingClientRect !== 'function') return;
      const r = plate.getBoundingClientRect();
      const inside = last && r.width > 0 && last.x >= r.left && last.x <= r.right && last.y >= r.top && last.y <= r.bottom;
      if (!inside || reducedMotion()) {
        plate.style.setProperty('--cx-tilt-x', '0deg');
        plate.style.setProperty('--cx-tilt-y', '0deg');
        plate.classList.remove('is-lit');
        return;
      }
      const nx = ((last.x - r.left) / r.width) * 2 - 1;
      const ny = ((last.y - r.top) / r.height) * 2 - 1;
      plate.style.setProperty('--cx-tilt-x', (-ny * 6).toFixed(2) + 'deg');
      plate.style.setProperty('--cx-tilt-y', (nx * 6).toFixed(2) + 'deg');
      plate.style.setProperty('--cx-sheen-x', ((nx + 1) * 50).toFixed(1) + '%');
      plate.style.setProperty('--cx-sheen-y', ((ny + 1) * 50).toFixed(1) + '%');
      plate.classList.add('is-lit');
    };
    stage.addEventListener('pointermove', (ev) => { last = { x: ev.clientX, y: ev.clientY }; if (!frame) frame = later(apply); });
    stage.addEventListener('pointerleave', () => { last = null; if (!frame) frame = later(apply); });
  },

  /**
   * Arrival (ORRERY §3.5): the dials fill, the sections tick in down the scale, and the next entry
   * shown draws its plate. A class on the root for a moment, so a later render never replays it.
   */
  _arrive() {
    const root = this._codexRoot;
    if (!root || !root.classList) return;
    root.classList.remove('cx-arrive');
    if (typeof root.getBoundingClientRect === 'function') root.getBoundingClientRect();
    root.classList.add('cx-arrive');
    if (this._arriveTimer) clearTimeout(this._arriveTimer);
    this._arriveTimer = setTimeout(() => { root.classList.remove('cx-arrive'); this._arriveTimer = 0; }, 1600);
  },

  /** The Hand swings to the entry being read (or stands down when the open section has none). */
  _placeHand(instant = false) {
    if (!this._index) return;
    if (!this._hand) this._hand = createLadderHand(this._index);
    const row = this._list && typeof this._list.querySelector === 'function'
      ? this._list.querySelector('.k-row[aria-selected="true"]') : null;
    this._hand.moveTo(row, { instant });
  },

  /**
   * The fan of light from the open section's graduation (on the scale's right edge) to the top and
   * foot of its entries' rail, as far as the rail is in view.
   */
  _drawWedge() {
    const wedge = this._wedge;
    const hang = this._hangEl;
    if (!wedge || !hang || typeof hang.getBoundingClientRect !== 'function') return;
    const tab = this._tabBtns && this._tabBtns[this._activeTab];
    const list = this._list;
    const ladder = this._index;
    if (!tab || !list || !ladder || !list.isConnected || typeof list.getBoundingClientRect !== 'function') { wedge.innerHTML = ''; return; }
    const h = hang.getBoundingClientRect();
    const t = tab.getBoundingClientRect();
    const l = list.getBoundingClientRect();
    const v = ladder.getBoundingClientRect();
    const bar = tab.closest ? tab.closest('.sf-tabbar') : null;
    // screen pixels to the hang's own (a 1440p screen zooms the whole codex)
    const z = archiveZoom(hang, h);
    const x0 = ((bar ? bar.getBoundingClientRect().right : t.right) - h.left) / z - 0.75;
    const y0 = (t.top + t.height / 2 - h.top) / z;
    const x1 = (l.left - h.left) / z + 7.75;
    const top = (Math.max(l.top, v.top) - h.top) / z;
    const bottom = (Math.min(l.bottom, v.bottom - 18 * z) - h.top) / z;
    if (!(h.width > 0) || !(bottom > top + 4)) { wedge.innerHTML = ''; return; }
    wedge.innerHTML = archiveWedgeSvg({ w: h.width / z, h: h.height / z, x0, y0, x1, top, bottom });
  },

  /** A tab's section: a caps label, its entries (each a row in the index), or one empty line. */
  _section(label, entries, empty = '') {
    this._sections.push({ label, entries, empty });
    for (const entry of entries) this._entries.push(entry);
  },

  // Signal Archive — the posters as a row of stills 200 px tall, each with its title, its caption
  // and Play as a fine word; Play runs the 6s clip through the UI system's shared cinematic player
  // (ui.playCinematic). No new modal machinery; reuses the existing player.
  _renderArchive() {
    const article = el('article', 'sf-codex-entry cx-archive');
    const heading = el('h2', 'k-display k-t-title', 'Signal Archive');
    article.appendChild(heading);
    const count = el('p', 'cx-reader__meta', SIGNAL_ARCHIVE.length + ' recovered signals');
    article.appendChild(count);
    article.appendChild(el('p', 'k-sentence', 'Recovered transmission stills from the Reach corridor. Select a signal to replay its clip.'));
    const row = el('ul', 'k-words k-words--row fh-cluster');
    row.setAttribute('aria-label', 'Signal Archive');
    for (const c of SIGNAL_ARCHIVE) {
      const item = el('li');
      const still = el('button', 'cx-still');
      still.type = 'button';
      still.setAttribute('aria-label', 'Play signal ' + c.id + ': ' + c.title);
      const img = el('img');
      img.src = c.poster;
      img.alt = c.title;
      still.appendChild(img);
      still.addEventListener('click', () => { cue('confirm'); this._playCinematic(c.video, c.title); });
      item.appendChild(still);
      item.appendChild(el('div', 'cx-still__name', c.id + ' · ' + c.title));
      item.appendChild(el('div', 'k-t-fine fh-fine', c.caption));
      const play = el('button', 'k-word k-word--fine', 'Play');
      play.type = 'button';
      play.dataset.action = 'play:' + c.id;
      play.setAttribute('aria-label', 'Play signal ' + c.id + ': ' + c.title);
      play.addEventListener('click', () => { cue('confirm'); this._playCinematic(c.video, c.title); });
      const verb = el('div');
      verb.appendChild(play);
      item.appendChild(verb);
      row.appendChild(item);
    }
    article.appendChild(row);
    this._body.appendChild(article);
  },

  _playCinematic(video, title) {
    const ctx = this._ctx;
    const ui = ctx && ctx.registry && ctx.registry.get && ctx.registry.get('ui');
    if (ui && typeof ui.playCinematic === 'function') { ui.playCinematic(video, title); return; }
    if (typeof window !== 'undefined' && typeof window.playSpaceFaceCinematic === 'function') {
      window.playSpaceFaceCinematic(video, title);
    }
  },

  // Ledger — the Ship's Ledger panel (the SAME factory the station mounts). No codex subscription
  // is added for it: the panel owns no subscriptions, and the skip-rerender guard in _render keeps
  // unrelated story/comms/graffiti refreshes from rebuilding it while it is the active tab.
  _renderLedger(ctx) {
    if (!this._ledgerPanel) {
      this._ledgerPanel = createShipLedgerPanel(ctx || this._ctx, { hostId: 'codex', headingLevel: 2 });
    }
    this._body.appendChild(this._ledgerPanel.el);
    this._ledgerPanel.onShow();
  },

  _renderDiscoveries(ctx) {
    const state = ctx && ctx.state;
    const gal = galaxyExplorationSummary(state);
    // The survey as the first entry: three hero numbers with a word each, then the one sentence.
    const survey = makeEntry({
      id: 'survey',
      name: 'Survey status',
      sub: gal.overallPercent + '% · ' + gal.foundPois + '/' + gal.totalPois + ' sites',
      title: 'Galaxy Cartography & Survey Status',
      meta: 'Survey',
      body: 'Fly close to unresolved signatures or perform deep triangulations to expand known frontier cartography.',
    });
    survey.article.setAttribute('aria-label', 'Survey and cartography summary');
    const heroes = el('div', 'k-words k-words--row');
    heroes.appendChild(hero(gal.overallPercent + '%', 'survey completion · ' + gal.foundPois + '/' + gal.totalPois + ' sites'));
    heroes.appendChild(hero(gal.exploredSectors + ' / ' + gal.totalSectors, 'explored sectors'));
    heroes.appendChild(hero(String(gal.trophies), 'recovered artifacts'));
    survey.article.insertBefore(heroes, survey.measure);
    this._section('Survey', [survey]);

    const plates = explorationDiscoveryPlates(state);
    if (!plates.length) {
      this._section('Exploration Plates', [], 'No physical discoveries logged yet. Earn a fix, then fly down the source.');
      return;
    }
    const entries = [];
    for (const plate of plates) {
      const cut = String(plate.meta || '').indexOf(' · ');
      const sectorName = cut >= 0 ? plate.meta.slice(0, cut) : plate.meta;
      const sectorRest = cut >= 0 ? plate.meta.slice(cut) : '';
      let meta = plate.meta || '';
      if (plate.sectorId && sectorName) {
        // The sector as an entity link (the resolver adds data-entity).
        meta = el('span');
        const linked = el('span', null, sectorName);
        decorateEntityNode(linked, 'sector:' + plate.sectorId);
        meta.appendChild(linked);
        if (sectorRest) meta.appendChild(document.createTextNode(sectorRest));
      }
      const entry = makeEntry({
        id: 'plate:' + plate.id,
        name: plate.title,
        sub: sectorName || '',
        meta,
        body: plate.body,
        note: plate.note,
        // A plate image, when the world record carries one, sits at the top of the stage.
        image: typeof plate.image === 'string' ? plate.image : null,
      });
      entry.article.dataset.codexDiscoveryId = plate.id;
      if (plate.id === this._requestedDiscoveryId) {
        entry.requested = true;
        this._focusByTab.Discoveries = entry.id;
      }
      if (tethysCodexReturnIntent(state, plate)) {
        const returnToTethys = el('button', 'k-word k-word--emph', 'Show Tethys Trade Hub');
        returnToTethys.type = 'button';
        returnToTethys.dataset.action = 'tethys-return';
        returnToTethys.setAttribute('aria-label', 'Show Tethys Trade Hub on the map');
        // the entry's one call to act: the codex's Lamp Key while it stands
        try { dressLampKey(returnToTethys); } catch (_) { /* a host without SVG keeps the word */ }
        returnToTethys.addEventListener('click', () => { cue('confirm'); openTethysCodexReturn(ctx, plate); });
        entry.article.appendChild(returnToTethys);
      }
      entries.push(entry);
    }
    this._section('Exploration Plates', entries);
  },

  // The archive's catalogue: what has been filed in each section, one reading per section (the
  // numeral in phosphor, its words etched beneath). Why locked counts are low stays in the
  // accessible description, not on the page.
  _renderStatus(ctx) {
    const summary = codexProgressSummary(safeStory(ctx), ctx && ctx.state);
    const box = this._status;
    // The catalogue is redrawn only when a count changes, so its numerals roll once per change.
    const signature = summary.items.map((item) => item.key + '=' + item.value).join('|');
    if (box.dataset && box.dataset.sig === signature && box.firstChild) return;
    if (box.dataset) box.dataset.sig = signature;
    box.innerHTML = '';
    box.classList.add('cx-index');
    const cap = el('p', 'cx-index__cap', 'Codex Unlock Status');
    box.appendChild(cap);
    const list = el('dl', 'cx-index__list');
    let i = 0;
    for (const item of summary.items) {
      const value = String(item.value);
      let figure = value;
      let words = item.key;
      if (item.key === 'Phase') {
        figure = value.replace(/^Phase\s*/, '');
        words = 'Story phase';
      } else {
        const m = value.match(/^(\S+)\s*(.*)$/);
        if (m) { figure = m[1]; words = (item.key + ' ' + m[2].replace(/[()]/g, '')).trim(); }
      }
      // The reading: "6/11" is six of eleven, "0%" a share, a phase one of MAX_PHASE.
      let num = figure;
      let of = '';
      let frac = 0;
      let count = 0;
      const ratio = /^(\d+)\/(\d+)$/.exec(figure);
      const pct = /^(\d+(?:\.\d+)?)%$/.exec(figure);
      if (ratio) { num = ratio[1]; of = '/' + ratio[2]; frac = Number(ratio[2]) > 0 ? Number(ratio[1]) / Number(ratio[2]) : 0; count = Number(ratio[2]); }
      else if (pct) { num = pct[1]; of = '%'; frac = Number(pct[1]) / 100; }
      else if (item.key === 'Phase' && /^\d+$/.test(figure)) { of = '/' + MAX_PHASE; frac = Number(figure) / MAX_PHASE; count = MAX_PHASE; }
      const cell = el('div', 'cx-index__item');
      cell.dataset.key = item.key.toLowerCase();
      const dial = el('span', 'cx-index__dial');
      dial.setAttribute('aria-hidden', 'true');
      dial.innerHTML = archiveGaugeSvg(frac, { count });
      cell.appendChild(dial);
      // the dial is labelled by its section's name; the rest of the sentence is read, not shown
      const shortWord = item.key === 'Phase' ? 'Phase' : item.key;
      const dt = el('dt', 'cx-index__w', shortWord);
      const rest = words.toLowerCase().startsWith(shortWord.toLowerCase()) ? words.slice(shortWord.length) : ' ' + words;
      if (rest.trim()) dt.appendChild(el('span', 'cx-sr', rest));
      cell.appendChild(dt);
      const dd = el('dd', 'cx-index__n');
      const numeral = el('span', 'cx-index__num', num);
      if (/^\d+$/.test(num)) rollTo(numeral, Number(num));
      dd.appendChild(numeral);
      if (of) dd.appendChild(el('span', 'cx-index__of', of));
      cell.appendChild(dd);
      setVar(cell, '--orr-delay', (120 + 50 * i) + 'ms');
      i += 1;
      list.appendChild(cell);
    }
    box.appendChild(list);
    const note = el('p', 'cx-index__note', summary.note);
    note.id = 'sf-codex-index-note';
    box.appendChild(note);
    box.setAttribute('aria-describedby', note.id);
  },

  // The ladder: a long graduation per section and a rung per entry that matches the search (the
  // whole entry text, not only its name), then the entry being read on the stage. Locked future
  // content is never built, so it can never match.
  _applySearchFilter() {
    if (!this._index || !this._body) return;
    // Search reads each entry's own words: the page chrome on the shown entry comes off first and
    // goes back on when the focused entry is shown again below.
    for (const entry of this._entries || []) undressEntry(entry);
    const query = normalizeSearch(this._query);
    const sections = this._sections.map((section) => ({
      ...section,
      entries: query
        ? section.entries.filter((entry) => normalizeSearch(entry.article.textContent).includes(query))
        : section.entries,
    }));
    const visible = sections.flatMap((section) => section.entries);
    this._visibleEntries = visible;
    this._sectionOf = new Map();
    for (const section of sections) for (const entry of section.entries) this._sectionOf.set(entry.id, section);
    this._index.innerHTML = '';
    this._list = null;
    if (query && !visible.length) {
      this._index.appendChild(el('p', 'k-empty', 'No matching unlocked entries.'));
      this._body.innerHTML = '';
      this._shownId = null;
      this._placeHand();
      this._renderTape([]);
      return;
    }
    const remembered = this._focusByTab[this._activeTab];
    const focus = visible.find((entry) => entry.id === remembered) || visible[0] || null;
    if (focus) this._focusByTab[this._activeTab] = focus.id;

    const list = rows(visible.map((entry) => ({
      id: entry.id, name: entry.name, sub: entry.sub, num: '', selected: focus && entry.id === focus.id,
    })), { ariaLabel: this._activeTab + ' entries', onPick: (id) => this._focus(id) });
    // A filed name for the endgame choice, cipher for a locked entry (its real words stay for
    // assistive tech): nested spans, since the row's own name rule outranks the colour classes.
    for (const row of list.querySelectorAll('.k-row')) {
      const entry = visible.find((candidate) => candidate.id === row.dataset.id);
      if (!entry || (!entry.signal && !entry.locked)) continue;
      const name = row.querySelector('.k-row__name');
      if (!name) continue;
      if (entry.locked) { writeLockedName(name, entry.id, entry.name, entry.sub ? ' · ' + entry.sub : ''); continue; }
      name.textContent = '';
      name.appendChild(el('span', 'cx-filed', entry.name));
    }
    // Interleave the section rows. Rows are reused (the roving keeps them); a header or an empty
    // line is a static row the arrow keys skip. A section every row of which is hidden by the
    // search loses its header, as today.
    const byId = new Map();
    for (const row of list.querySelectorAll('.k-row')) byId.set(row.dataset.id, row);
    list.innerHTML = '';
    for (const section of sections) {
      if (query && !section.entries.length) continue;
      const header = el('li', 'k-row k-row--static');
      header.setAttribute('role', 'presentation');
      header.appendChild(el('span', 'k-caps', sectionTitle(section.label)));
      // a section's running count ("12/19") is a reading beside its name
      const count = /\((\d+\/\d+)\)\s*$/.exec(String(section.label || ''));
      if (count) header.appendChild(el('span', 'cx-count', count[1]));
      list.appendChild(header);
      if (!section.entries.length) {
        const empty = el('li', 'k-row k-row--static');
        empty.setAttribute('role', 'presentation');
        empty.appendChild(el('span', 'k-38', section.empty || '— nothing encountered yet —'));
        list.appendChild(empty);
        continue;
      }
      for (const entry of section.entries) list.appendChild(byId.get(entry.id));
    }
    // The stage follows keyboard focus, not only a click: arrowing down the rows turns the pages.
    list.addEventListener('focusin', (event) => {
      const row = event.target && event.target.closest ? event.target.closest('.k-row[data-id]') : null;
      if (row && row.dataset.id !== this._focusByTab[this._activeTab]) this._focus(row.dataset.id);
    });
    this._index.appendChild(list);
    this._list = list;
    syncScrollExtent(this._index);
    if (focus) this._showEntry(focus);
    else { this._body.innerHTML = ''; this._shownId = null; }
    this._placeHand();
    this._renderTape(sections);
  },

  _focus(id) {
    const entry = (this._entries || []).find((candidate) => candidate.id === id);
    if (!entry) return;
    this._focusByTab[this._activeTab] = id;
    if (this._list) {
      for (const row of this._list.querySelectorAll('.k-row[data-id]')) {
        const on = row.dataset.id === id;
        row.setAttribute('aria-selected', String(on));
        // A turn of the page keeps its rung in view on the ladder.
        if (on && typeof row.scrollIntoView === 'function') {
          try { row.scrollIntoView({ block: 'nearest' }); } catch (_) { /* layout-free host */ }
        }
      }
    }
    this._showEntry(entry);
    this._placeHand();
    this._syncTape();
  },

  /**
   * The reading page: where the entry is filed and its place in the section, its plate, and a turn
   * to the neighbouring entries. Chrome nodes carry .cx-chrome so search reads only the entry's own
   * words; they are rebuilt each time the entry is shown.
   */
  _dressEntry(entry, fresh = false) {
    const article = entry.article;
    undressEntry(entry);
    const visible = this._visibleEntries || [];
    const section = this._sectionOf && this._sectionOf.get(entry.id);
    const inSection = section ? section.entries.filter((candidate) => visible.includes(candidate)) : [entry];
    const at = inSection.indexOf(entry);
    const sectionName = section ? sectionTitle(section.label) : '';
    const filed = el('p', 'cx-chrome cx-reader__filed',
      [this._activeTab, sectionName, inSection.length > 1 ? (at + 1) + ' of ' + inSection.length : '']
        .filter(Boolean).join(' · '));
    article.prepend(filed);
    // The plate: produced art where the entry has it (a discovery still, a figure's portrait or its
    // faction's crest), else the section's glyph; ringed by the section, one arc per entry.
    const figureKey = String(entry.id).startsWith('figure:') ? entry.id.slice(7) : '';
    const plateSrc = codexPlate(entry);
    const hullSrc = this._activeTab === 'Ship' ? flownHullRender(this._ctx && this._ctx.state) : null;
    const art = entry.locked ? null
      : (entry.image ? { src: entry.image, kind: 'photo' }
        : (figureArt(figureKey) || (plateSrc ? { src: plateSrc, kind: 'plate' } : null) || (hullSrc ? { src: hullSrc, kind: 'hull' } : null)));
    const plate = el('div', 'cx-chrome cx-reader__plate' + (fresh ? ' is-fresh' : ''));
    plate.setAttribute('aria-hidden', 'true');
    const kind = art ? ' is-' + art.kind : ' is-glyph';
    const aperture = el('div', 'cx-plate__art' + kind);
    plate.appendChild(aperture);
    const rings = (glyph) => {
      const svgHost = el('div', 'cx-plate__rings');
      svgHost.innerHTML = archivePlateSvg({
        segments: inSection.map((candidate) => (candidate.locked ? 'locked' : 'open')),
        current: at,
        top: ['Codex', this._activeTab, sectionName].filter(Boolean).join(' · '),
        bottom: 'Entry ' + pad2(at + 1) + ' of ' + pad2(Math.max(1, inSection.length)),
        glyph,
        locked: entry.locked,
      });
      return svgHost.firstChild;
    };
    const glyphName = entry.locked ? 'locked' : (TAB_GLYPHS[this._activeTab] || 'story');
    let drawn = rings(art ? '' : glyphName);
    if (drawn) plate.appendChild(drawn);
    if (art) {
      const img = el('img');
      img.alt = '';
      img.decoding = 'async';
      // art that fails to load gives its aperture back to the section's glyph
      img.addEventListener('error', () => {
        img.remove();
        aperture.className = 'cx-plate__art is-glyph';
        const again = rings(glyphName);
        if (again && drawn && drawn.parentNode === plate) { plate.replaceChild(again, drawn); drawn = again; }
      }, { once: true });
      img.src = art.src;
      aperture.appendChild(img);
    }
    article.insertBefore(plate, filed.nextSibling);
    const index = visible.indexOf(entry);
    if (visible.length > 1) {
      const turn = el('nav', 'cx-chrome cx-reader__turn');
      turn.setAttribute('aria-label', 'Turn the page');
      const prev = visible[index - 1] || null;
      const next = visible[index + 1] || null;
      const word = (label, target, dir) => {
        const b = el('button', 'k-word cx-reader__turn-key cx-reader__turn-key--' + dir, label);
        b.type = 'button';
        b.dataset.action = 'turn:' + dir;
        if (target) {
          b.setAttribute('aria-label', (dir === 'prev' ? 'Previous entry: ' : 'Next entry: ') + target.name);
          b.addEventListener('click', () => { cue('move'); this._focus(target.id); });
        } else {
          b.setAttribute('aria-disabled', 'true');
        }
        return b;
      };
      turn.appendChild(word('Previous', prev, 'prev'));
      turn.appendChild(el('span', 'cx-reader__turn-at', pad2(index + 1) + ' / ' + pad2(visible.length)));
      turn.appendChild(word('Next', next, 'next'));
      article.appendChild(turn);
    }
  },

  _showEntry(entry) {
    // A new entry arrives: its plate draws, its title decrypts, its lore rises line by line. A
    // re-render of the same entry (a search keystroke, a bus refresh) keeps it still.
    // A scrub flips pages quietly (no decrypt, no rise) until the pointer lets go.
    const fresh = entry.id !== this._shownId && !this._scrubbing;
    this._shownId = entry.id;
    this._body.innerHTML = '';
    this._dressEntry(entry, fresh);
    this._body.appendChild(entry.article);
    if (fresh) {
      if (typeof this._body.scrollTo === 'function') { try { this._body.scrollTo(0, 0); } catch (_) { /* layout-free host */ } }
      if (!entry.locked && entry.titleSpan && !entry.signal) decrypt(entry.titleSpan, entry.titleText, { duration: 300 });
      const lines = [];
      if (entry.measure && entry.measure.children) for (const child of entry.measure.children) lines.push(child);
      for (const node of [entry.article.querySelector && entry.article.querySelector(':scope > .cx-reader__meta')]) if (node) lines.unshift(node);
      for (const node of lines) if (node.classList) node.classList.remove('cx-rise');
      if (entry.article.getBoundingClientRect) entry.article.getBoundingClientRect();
      staggerRise(lines, { base: 90, step: 70, cls: 'cx-rise' });
    }
    if (entry.requested) {
      entry.article.tabIndex = -1;
      focusCodexDiscoveryEntry(entry.article);
    }
  },

  // The 8-beat spine. Beats up to the player's current beatIndex are readable; future beats show
  // only their title with a locked hint (no spoiler of the in-world voice).
  _renderStory(ctx) {
    const s = safeStory(ctx);
    const beat = storyBeatIndex(s);
    const beats = BEAT_CONTENT.map((content, i) => {
      const reached = i <= beat;
      const phase = reached ? ('Phase ' + content.phase + (i === beat ? ' · Current beat' : '')) : 'Locked';
      return makeEntry({
        id: 'beat:' + i,
        name: BEAT_TITLES[i] || ('Beat ' + i),
        sub: phase,
        meta: phase,
        body: reached ? content.hint : '— not yet encountered —',
        locked: !reached,
      });
    });
    this._section('The Eight Beats', beats);

    // Endgame: the 5 choices. Unlock only after the player has chosen (state.story.endgameChoice),
    // OR reached B7 (so they can see what's on offer). Before B7: locked entirely.
    if (beat >= 7) {
      this._section('Endgame', ENDGAME_CHOICES.map((c) => {
        const chosen = s.endgameChoice === c.id;
        return makeEntry({
          id: 'endgame:' + c.id,
          name: (chosen ? '✓ ' : '') + 'Choice ' + c.id + ' — ' + c.title,
          sub: c.kind + (chosen ? ' · YOUR CHOICE' : ''),
          meta: c.kind + (chosen ? ' · YOUR CHOICE' : ''),
          body: c.summary,
          note: c.hiddenCost ? 'Hidden cost: ' + c.hiddenCost : '',
          noteBad: true,
          signal: chosen,
        });
      }));
    } else {
      this._section('Endgame', [], 'The endgame has not revealed itself yet.');
    }
  },

  // Comms catalog. COMMS is { ambient:[...], traps:[...], personal:[...], late:[...], story:[...] }
  // — category-keyed arrays. An entry is readable if it's in seenComms (fired once and stuck) OR
  // it's a non-trap line from a beat the player has reached. Conditional trap warnings unlock only
  // when the story system persists a seen flag, so Codex browsing does not leak unseen ambushes.
  // Author notes are included — they enrich a re-read without spoiling future beats (a future-beat
  // note references a beat the player hasn't hit, but the entry itself is gated out, so the note never shows early).
  _renderComms(ctx) {
    const s = safeStory(ctx);
    const beat = storyBeatIndex(s);

    // Cold start lines (B0 — always seen once a new game has begun).
    this._section('Cold Start', COLD_START.map((c) => makeEntry({
      id: 'comm:' + c.id,
      name: c.sender,
      sub: c.category,
      meta: c.category,
      body: c.text,
      note: c.note || '',
    })));

    // The full COMMS catalog, gated by seen-or-beat-reached. COMMS category keys → display labels.
    for (const [label, key] of COMMS_CATEGORIES) {
      const entries = Array.isArray(COMMS[key]) ? COMMS[key] : [];
      if (!entries.length) continue;
      const visible = entries.filter((c) => {
        // Ambient lines from a reached beat are fair game (they cycle in normal play); beat-gated
        // personal/late/story lines unlock at their beat even if the once-flag hasn't stuck yet.
        return commUnlocked(c, s, beat, key);
      });
      const sectionLabel = label + ' (' + visible.length + '/' + entries.length + ')';
      if (!visible.length) {
        this._section(sectionLabel, [], key === 'traps' ? '— no conditional signals encountered yet —' : '— nothing encountered yet —');
        continue;
      }
      this._section(sectionLabel, visible.map((c) => makeEntry({
        id: 'comm:' + key + ':' + c.id,
        name: c.sender || c.id,
        sub: key.replace(/s$/, ''),
        meta: key.replace(/s$/, ''),
        body: c.text,
        note: c.note || '',
      })));
    }
  },

  // Graffiti the player has seen (state.story.graffitiShown is keyed by where:line). Plus the
  // ever-present gang markings on the bulkhead (there from B0). The line itself is the title.
  _renderGraffiti(ctx) {
    const s = safeStory(ctx);
    const shown = s.graffitiShown || {};
    const beat = storyBeatIndex(s);

    this._section('Bulkhead — The Previous Crew', [makeEntry({
      id: 'graffiti:bulkhead',
      name: GRAFFITI.GANG_DIDNT_MAKE_IT,
      sub: 'Bulkhead',
      meta: 'Bulkhead',
      note: "The gang left their mark when they took the Tessera. It's still there. Never coming off.",
    })]);

    const encountered = [];
    for (const [key, _seen] of Object.entries(shown)) {
      // key is "where:line" — pull the line text after the first colon.
      const line = key.includes(':') ? key.slice(key.indexOf(':') + 1) : key;
      if (!line) continue;
      const where = key.includes(':') ? key.slice(0, key.indexOf(':')) : '?';
      encountered.push(makeEntry({ id: 'graffiti:' + key, name: line, sub: where, meta: where }));
    }
    this._section('Encountered', encountered,
      beat > 0 ? 'No location graffiti encountered yet.' : '— nothing encountered yet —');
  },

  // Named figures. The protagonist + figures whose org/role is public lore are always shown; others
  // unlock when the player has reached the beat where they appear.
  _renderFigures(ctx) {
    const s = safeStory(ctx);
    const beat = storyBeatIndex(s);
    const entries = [];
    const renderFig = (key) => {
      const f = FIGURES[key];
      if (!f) return;
      let meta = null;
      if (f.org || f.role) {
        meta = el('span');
        if (f.org) {
          const org = el('span', null, f.org);
          if (FIGURE_FACTION[key]) decorateEntityNode(org, 'faction:' + FIGURE_FACTION[key]);
          meta.appendChild(org);
        }
        if (f.role) {
          if (f.org) meta.appendChild(document.createTextNode(' · '));
          meta.appendChild(document.createTextNode(f.role));
        }
      }
      const dossier = FIGURE_DOSSIERS[key];
      entries.push(makeEntry({
        id: 'figure:' + key,
        name: f.name,
        sub: [f.org, f.role].filter(Boolean).join(' · '),
        meta,
        body: dossier && dossier.body || '',
        note: dossier && dossier.note || '',
      }));
    };
    for (const k of FIGURE_ALWAYS) renderFig(k);
    for (const [k, unlockBeat] of Object.entries(FIGURE_GATED)) {
      if (beat >= unlockBeat) renderFig(k);
      else {
        entries.push(makeEntry({
          id: 'figure:' + k,
          name: '???',
          sub: 'Not yet encountered',
          meta: 'Not yet encountered',
          locked: true,
        }));
      }
    }
    this._section('Named Figures', entries);
  },

  // The Tessera's sealed history + persistent cargo (the "personal effects" that travel with you).
  // Always visible — it's the player's own ship. The registry facts are static hairline rows.
  _renderShip(ctx) {
    const ship = makeEntry({
      id: 'ship',
      name: SHIP.name + ' / ' + SHIP.registration,
      sub: 'Sealed history',
      meta: 'Sealed history',
    });
    const facts = el('ul', 'k-rows');
    facts.style.setProperty('--k-row-cols', 'minmax(0, 1fr) minmax(0, 2fr)');
    const pairs = [
      ['Incident', SHIP.incident + ' (' + SHIP.incidentRef + ')'],
      ['Previous operator', SHIP.previousOperator],
      ['Crew status', SHIP.crewStatus],
      ['Impounded', SHIP.impoundMonths + ' months'],
      ['Acquired via', SHIP.friend.callsign + ' — ' + SHIP.friend.debt],
    ];
    for (const [k, v] of pairs) {
      const row = el('li', 'k-row k-row--static');
      row.appendChild(el('span', null, k));
      row.appendChild(el('span', 'k-row__name', v));
      facts.appendChild(row);
    }
    ship.measure.appendChild(facts);
    this._section('The Tessera', [ship]);

    this._section('Reference Codes', [makeEntry({
      id: 'refs',
      name: 'Reference Codes',
      sub: REFS.CONTRACT_47A + ' · ' + REFS.REF_44C,
      meta: 'Two codes that keep coming back',
      body: REFS.CONTRACT_47A + ' — your first contract. Payment withheld forever.\n' +
        REFS.REF_44C + ' — the administrative code that governs everything inconvenient.',
    })]);

    this._section('Personal Effects', PERSISTENT_CARGO.map((p) => makeEntry({
      id: 'effect:' + p.id,
      name: p.name,
      sub: p.mass + ' t · unsellable',
      meta: p.mass + ' t · unsellable',
      note: p.note,
    })));
  },
};
