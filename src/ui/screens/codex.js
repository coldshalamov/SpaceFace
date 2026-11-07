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
import { writtenEndingArchive } from '../../story/endings/index.js';
import { TETHYS_BLACK_MARKET_DISCOVERY } from '../../data/frontierRumors.js';
import { CANONICAL_PORTRAITS, PORTRAIT_ASSET_ROOT } from '../../data/portraits.js';
import { hullPosterUrl } from '../hullPosters.js';
import { explorationDiscoveryPlates, galaxyExplorationSummary } from '../../world/explorationJournal.js';
import { lossesFor } from '../../systems/lossLedger.js';
import { discoveryKnowledge } from '../sim/discoveryKnowledge.js';
import { codexPagesView } from '../sim/codexPages.js';
import { decorateEntityNode } from '../entityResolver.js';
import { MAP_FOCUS, openGalaxyMap } from '../mapAuthority.js';
import { createShipLedgerPanel } from '../shipLedgerPanel.js';
import { el, words, rows, hero, settle, cue } from '../kit/index.js';
import { injectDeckplate } from '../deckplate/index.js';
import { injectArchiveLayouts } from '../orrery/archiveLayouts.js';
import { deferScreenCssReady } from '../orrery/cssSidecar.js';
import { injectCodexLayouts } from '../orrery/codexLayouts.js';
import {
  archivePlateSvg, archiveBladeSvg, archiveHoverSvg, archiveDialAngle, archiveDialIndex, archiveScramble, archiveHash,
  archiveWedgeSvg, archiveZoom, createLadderHand,
} from '../orrery/archiveInstruments.js';
import { decrypt, rollTo } from '../orrery/text.js';
import { reducedMotion, createSpring } from '../orrery/motion.js';
import { syncScrollExtent } from '../orrery/scrollExtent.js';
import { dressLampKey } from '../orrery/lampKey.js';
import { uniqueWreckById } from '../../data/uniqueWrecks.js';
import { knownAces, stanceForRecord, rememberedBarkFor } from '../../data/namedAces.js';
import { FACTION_LABELS } from '../../data/encounterIdentity.js';
import { logbookEntries } from '../../chronicler/logbook.js';
import { logbookStill } from '../logbookMedia.js';
import { JOURNEY_ACTS, journeyActLabel } from '../../data/journeyActs.js';
import { localizeText } from '../../localization/sourceText.js';
import {
  abutmentChalkRows,
  alignmentRows,
  bargainLightRows,
  baySevenRows,
  blindRows,
  buoyKeepingRows,
  chainLetterRows,
  checkpointCatRows,
  cockpitManifestRows,
  coldFourRows,
  concordFormRows,
  constellationRows,
  customsCoinRows,
  decodedSuhlClauses,
  dockChoirRows,
  dustScriptRows,
  galleryAccessionRows,
  halfConversationRows,
  helixVerseRows,
  humAtSkerRows,
  incident7741ShelfRows,
  jumpLogRows,
  jukeboxRows,
  kitchenRows,
  latchTidyRows,
  longGameRows,
  longSentenceRows,
  mastPrefersYouRows,
  miraFixesRows,
  mooringGuestRows,
  morrowHundredRows,
  panelNineRows,
  paperPlaneRows,
  pourAnnouncementRows,
  quietReceiptRows,
  queueMiracleRows,
  ransomBuoyRows,
  reFlockedRows,
  rockCrossingRows,
  shelterAdvisoryRows,
  starMarkerRows,
  stakeBookmarkRows,
  stillEyeRows,
  surveyorMapRows,
  namesForTheDead,
  photographRows,
  plinthRows,
  quietCountRows,
  refund47aRows,
  rimTitheRows,
  shaftSevenTallyRows,
  slingChimeRows,
  tallyRows,
  tideLedgerRows,
  twoCreditTruthRows,
  twoPinsRows,
  vanishingFieldRows,
  vergeGateReceiptRows,
  volsLastLogRows,
  voidCrateRows,
} from '../../data/discoveryPresentation.js';
import { hash32 } from '../../core/rng.js';
import { recordSectionModel } from './codexRecord.js';
import {
  CODEX_TABS as TABS,
  takeRequestedCodexDiscovery,
  takeRequestedCodexTab,
} from '../codexRequests.js';
export { clearCodexDiscoveryRequest, requestCodexDiscovery, requestCodexTab } from '../codexRequests.js';

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
/** Honest org → faction id only. Unknown orgs stay plain text - never invent a door. */
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

/** The live tab's one-line description under the title. */
const TAB_LINES = Object.freeze({
  Story: 'The eight beats, and what the endgame offers.',
  Comms: 'Every signal you have received, filed by kind.',
  Discoveries: 'Plates from the sites you have flown down to.',
  World: 'Wrecks you resolved, captains who remember, what is still held, and the stories told.',
  Graffiti: 'What was written on the walls you passed.',
  Figures: 'The people whose names keep turning up.',
  Ship: "The Tessera's sealed history, and what travels with you.",
  Archive: 'Recovered transmission stills from the Reach corridor.',
  Catalog: 'Cargo, hulls, fittings, flags, systems, and what lives between them — filed as you earn them.',
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
  { id: 'VZ', title: 'Corridor Visualizer', poster: 'assets/cinematics/intro-visualizer.jpg',
    video: 'assets/cinematics/intro-visualizer.mp4',
    caption: 'The boot relay, full length. Helmet, wreck field, courier burn, the ring at threshold.' },
]);

export function consumeCodexDiscoveryRequest(state) {
  const target = takeRequestedCodexDiscovery();
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

function surveyedLossId(entry) {
  const id = entry && typeof entry.id === 'string' ? entry.id : '';
  return id.startsWith('survey:') ? id.slice('survey:'.length) : '';
}

/** The name the ledger filed for this hull. A coordinate is not a name. */
function ledgerDisplayTitle(loss) {
  if (!loss || typeof loss !== 'object') return '';
  for (const value of [loss.victimCallsign, loss.victimName, loss.title]) {
    if (typeof value !== 'string') continue;
    const clean = value.replace(/\s+/g, ' ').trim();
    if (clean) return clean;
  }
  return '';
}

function titleForSurveyedLoss(state, entry) {
  const lossId = surveyedLossId(entry);
  if (!lossId) return '';
  const inSector = entry && entry.sectorId ? lossesFor(state, entry.sectorId) : [];
  let loss = inSector.find((row) => row && row.lossId === lossId) || null;
  if (!loss) {
    const all = state && state.lossLedger && Array.isArray(state.lossLedger.entries)
      ? state.lossLedger.entries : [];
    loss = all.find((row) => row && row.lossId === lossId) || null;
  }
  return ledgerDisplayTitle(loss);
}

export function surveyedLossCodexLine(state) {
  const titles = [];
  let count = 0;
  for (const entry of discoveryKnowledge(state).entries) {
    if (!entry || entry.tier !== 'survey') continue;
    count += 1;
    const title = titleForSurveyedLoss(state, entry);
    if (title) titles.push(title);
  }
  if (count <= 0) return '';
  const named = titles.length ? ': ' + titles.join(', ') : '';
  if (count === 1) return 'One loss identified' + named;
  return count + ' losses identified' + named;
}

/** Discoveries survey sentence. Counts only — never a place. */
export function confirmedRumorCodexLine(state) {
  let count = 0;
  for (const entry of discoveryKnowledge(state).entries) {
    if (entry && entry.tier === 'resolved' && entry.source === 'frontierRumor') count += 1;
  }
  if (count <= 0) return '';
  if (count === 1) return 'One rumor confirmed';
  return count + ' rumors confirmed';
}

export function surveyStatusBody(state) {
  const base = 'Fly close to unresolved signals and triangulate them to chart the frontier.';
  const extra = [surveyedLossCodexLine(state), confirmedRumorCodexLine(state)].filter(Boolean);
  return extra.length ? base + ' ' + extra.join('. ') + '.' : base;
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
  const items = [
    { key: 'Story', value: storyUnlocked + '/' + BEAT_CONTENT.length + ' beats' },
    { key: 'Comms', value: commsUnlocked + '/' + commsTotal + ' unlocked' },
    { key: 'Figures', value: figureUnlocked + '/' + figureTotal + ' known' },
    { key: 'Graffiti', value: graffitiUnlocked + '/' + graffitiTotal + ' encountered' },
    { key: 'Endgame', value: endgameUnlocked + '/' + ENDGAME_CHOICES.length + ' revealed' },
  ];
  if (state) {
    const gal = galaxyExplorationSummary(state);
    const surveyed = surveyedLossCodexLine(state);
    const confirmed = confirmedRumorCodexLine(state);
    const surveyValue = gal.overallPercent + '% (' + gal.foundPois + '/' + gal.totalPois + ' sites)'
      + (surveyed ? ' · ' + surveyed : '')
      + (confirmed ? ' · ' + confirmed : '');
    items.push({ key: 'Survey', value: surveyValue });
  }
  return {
    beat,
    note: 'Locked entries are hidden on purpose until you reach them in the story.',
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
function makeEntry({ id, name, sub = '', title = null, meta = null, body = '', note = '', noteBad = false, signal = false, locked = false, image = null, mark = '', art = null }) {
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
    image: typeof image === 'string' && image ? image : null, art, requested: false,
  };
}

// ── World tab derivation (FB-037) ──────────────────────────────────────────────
// Pure and read-only: four already-saved bags shaped into entry specs for makeEntry.
// "Do not compute in the UI" is honored by keeping all of it in this one pure function;
// the render path adds nothing but DOM. No coordinates are ever printed — a bearing the
// player bought is a name and a state, never a map.

const WRECK_PHASE_META = Object.freeze({
  rumored: 'Bearing heard',
  fixed: 'Position fixed',
  decision: 'Decision pending',
  salvaged: 'Resolved',
});
const WRECK_PHASE_BODY = Object.freeze({
  rumored: 'A bearing was heard. The hull itself is unsurveyed.',
  fixed: 'Its position is fixed. The wreck has not been read.',
  decision: 'The hull was read. A decision still waits aboard.',
  salvaged: 'The site was worked. What was decided there is on record.',
});
const ACE_STANCE_META = Object.freeze({
  hunts: 'Holds a grudge',
  fears: 'Fears your return',
  offers_work: 'Remembers the debt',
});
const CHAIN_OUTCOME_VERB = Object.freeze({
  destroyed: 'destroyed',
  surrendered_secured: 'surrendered — secured',
  surrendered_escaped: 'surrendered — escaped',
  surrendered_lost: 'surrendered — lost',
  disengaged: 'disengaged',
  recovered: 'recovered',
  abandoned: 'abandoned',
  repelled: 'repelled',
  raided: 'raided',
  witnessed_only: 'witnessed',
});
const CODEX_PLATE_ROOT = 'assets/ui/generated/codex/';
const CODEX_ENTRY_ROOT = CODEX_PLATE_ROOT + 'entries/';
const CODEX_WRECK_ART = Object.freeze({
  wreck_isc_vigilant: 'wreck-isc-vigilant',
  wreck_dmc_ironsong: 'wreck-dmc-ironsong',
  wreck_isc_lighthouse: 'wreck-isc-lighthouse',
  wreck_lanebreaker_pale_coil: 'wreck-lanebreaker-pale-coil',
  wreck_choir_bell_aegis: 'wreck-choir-bell-aegis',
  wreck_gravhand_tideline: 'wreck-gravhand-tideline',
  wreck_nestbreaker: 'wreck-nestbreaker',
  wreck_deepsurvey: 'wreck-deepsurvey',
  wreck_smokesong: 'wreck-smokesong',
  wreck_choir_tender: 'wreck-choir-tender',
  wreck_mts_silver_draft: 'wreck-mts-silver-draft',
  wreck_choir_cassandra: 'wreck-choir-cassandra',
  wreck_mts_quadrille: 'wreck-mts-quadrille',
  wreck_isc_double_entry: 'wreck-isc-double-entry',
  wreck_dmc_first_notch: 'wreck-dmc-first-notch',
  wreck_mts_regular: 'wreck-mts-regular',
  wreck_dmc_refinery_tender: 'wreck-ceres-refinery-tender',
});
const CODEX_CARGO_ART = Object.freeze({
  cmdty_47a_assay_sample: 'cargo-47a-assay-sample',
  cmdty_unclassified_composite: 'cargo-unclassified-composite',
  depth_vols_black_box: 'cargo-vols-black-box',
  depth_vols_letter: 'cargo-vols-letter',
  cmdty_personal_ledger: 'cargo-personal-ledger',
  cmdty_navigational_data: 'cargo-navigational-data',
});
const CODEX_CHARACTER_ART = Object.freeze({
  protagonist: 'character-wren',
  vale: 'character-vale',
  elroy: 'character-elroy',
  kurtz: 'character-kurtz',
});

function codexEntryArt(key) {
  return key ? { src: CODEX_ENTRY_ROOT + key + '.webp', kind: 'plate' } : null;
}

function codexWreckArt(wreckId) {
  return codexEntryArt(CODEX_WRECK_ART[wreckId]);
}

// ── special-500 batch 12 (codex family) ────────────────────────────────────────
// The World tab's receipt sections: each renders one pure read from
// data/discoveryPresentation.js, keyed to durable state the live owners already keep
// (director receipts, the Morrow launches counter, calendar day, the memory records).
// Empty until earned; the empty lines name the gate, never the payoff.

const WORLD_ROW_COPY = Object.freeze({
  buoy: Object.freeze({
    sub: 'Channel note', open: 'The buoy said it into a retired channel, on schedule, to nobody in particular. '
      + 'Out here that is what keeping looks like.',
    sealed: 'This line stays between the buoy and whoever it was asked to keep answering for. '
      + 'The network has no column for it.',
    note: 'Retired channel buoy — Listening Field, Io Reach.',
  }),
  chalk: Object.freeze({
    sub: 'Chalk line', open: 'Chalk on stone, in weigh-slip handwriting. The clamp records every hull the weather does not.',
    sealed: 'Whoever keeps the chalk current, the roster does not name. The line stays written anyway.',
    note: 'Tethys Junction weigh clamp — abutment stone.',
  }),
  refund: Object.freeze({
    sub: 'Scale 4 filing', open: 'The release went out in full, with interest, under a signature that has been dormant '
      + 'longer than the contract has been open. Then the desk re-filed it. Nothing else about the campaign changed. That is the point.',
    sealed: 'The desk sealed nothing here. It simply re-filed it, which is worse.',
    note: 'Kessler, Scale 4, Helios Prime — Contract 47-A.',
  }),
  vols: Object.freeze({
    sub: 'Log entry', open: 'A calm voice, recorded for whoever inherited the hull. You are whoever inherited the hull.',
    sealed: 'The apology stays as recorded. The plate behind the third bulkhead stays where she left it.',
    note: 'Scorched crew-pod, unmarked drift box — Helios Prime.',
  }),
  tidy: Object.freeze({
    sub: 'Tidy receipt', open: 'Nothing was taken. Something was kept. The automaton files its work under maintenance; '
      + 'the drawing says otherwise.',
    sealed: 'The registry stamp is the only line the Quiet will confirm. Origin lapsed; workmanship current.',
    note: 'Aftermath wreck, left intact one full day, no jettison.',
  }),
  sentence: Object.freeze({
    sub: 'Transmission line', open: 'One pulse, one character. The transmission is not a loop and has never been one; '
      + 'this page keeps whatever the beacon has spelled so far.',
    sealed: 'The ending is still pulses away. The beacon does not mind. Neither should you.',
    note: 'Pre-Collapse beacon, past the Tether Memorial — Charon Expanse.',
  }),
  tally: Object.freeze({
    sub: 'Tally plate', open: 'Nine returned of eleven. The half-tonne filed as moisture closed the paperwork '
      + 'and opened this page.',
    sealed: 'Chalk this size is not filed. It is left where the next crew will read it.',
    note: 'Shaft 7 stake, Ceres Belt — re-chalked tally plate.',
  }),
  morrow: Object.freeze({
    sub: 'Departure tally', open: 'The machine counts departures and arrivals in one column and says the number '
      + 'out loud only when it is worth saying.',
    sealed: 'The count is the machine\'s own. Even this page only borrows it.',
    note: 'MORROW / R-07 — momentum-rescue machine, Helios Prime.',
  }),
  cat: Object.freeze({
    sub: 'Checkpoint paperwork', open: 'Officially logged as equipment, morale. The examiner denies this in writing; '
      + 'the denial is posted where the drone can be seen next to it.',
    sealed: 'The denial is the only line the examiner will countersign. The drone does not read.',
    note: 'Concord scan ring, Checkpoint Niner — Helios Prime.',
  }),
  jump: Object.freeze({
    sub: 'Registry line', open: 'The registry line slips in under the arrival chime, once, quieter than the chime. '
      + 'The mass knew.',
    sealed: 'The private counter is never shown. That is not a lock; it is a promise.',
    note: 'Lanes registry — jump attribution, first arrival of the save.',
  }),
  accession: Object.freeze({
    sub: 'Collection record', open: 'The weld-beads were rearranged, not added. The collection does not alter exhibits; '
      + 'it accessioned this one that way.',
    sealed: 'Accession paperwork is forever. That is the entire administrative point of it.',
    note: 'Gallery Rock, Vesta Forge — permanent collection.',
  }),
  longGame: Object.freeze({
    sub: 'Table note', open: 'Power cold, one light on, one piece moved per visit. The notation sheet is the only '
      + 'testimony either player ever gave.',
    sealed: 'Both hands the same. The page seals that line because the game does.',
    note: 'Derelict pair nose-to-nose — Veil Nebula murk.',
  }),
  alignment: Object.freeze({
    sub: 'Frame note', open: 'Four seconds a year when the frame composes itself: giant, ring-edge, comet tail, '
      + 'and a sun-glint on your own hull. Whether or not anyone is looking.',
    sealed: 'The frame keeps whether or not it was captured. That is what alignment means.',
    note: 'Helios Prime — annual alignment, day 16.',
  }),
});

// ── special-500 batch 13 (codex family) ────────────────────────────────────────
// The World-row copy for the fourteen batch-13 receipt sections. Same shape as the
// batch-12 table above: one sub line, an open-line voice, a sealed-line voice, and a
// note naming where in the world the page was earned.

const WORLD_ROW_COPY_13 = Object.freeze({
  plinth: Object.freeze({
    sub: 'Memorial line', open: 'One stored line, in a maintenance clerk\'s voice, kept for whoever scanned '
      + 'the dark plinth after watching a hull die here. It does not cheer. It counts.',
    sealed: 'The clerk kept the line short so it would fit a single lamp. It has fit for years.',
    note: 'Candle Fleet memorial, twenty-fifth plinth — Helios Prime.',
  }),
  cockpit: Object.freeze({
    sub: 'Manifest line', open: 'One more line every session, items being added, not recovered. Somebody out '
      + 'there is still packing for a pilot who is not awake to argue about it.',
    sealed: 'The last line stays sealed because the status is redacted, and the redaction is the point.',
    note: 'The Preserved Cockpit — Charon Expanse. Do not wake.',
  }),
  kitchen: Object.freeze({
    sub: 'Galley PA', open: 'The vent breathed once — a real, thermal event — and the PA took the order in a '
      + 'voice warm as the hull. The kitchen is open. The kitchen has always been open.',
    sealed: 'Nothing in the galley is sealed. That is what open means, and it has always meant it.',
    note: 'The Warm Freighter — Charon Expanse. Tab good at any Charon dock.',
  }),
  photograph: Object.freeze({
    sub: 'Audit note', open: 'The file never resolved, year after year, because a file is not a place. Stand '
      + 'in the right spot with the salvaged communicator and it resolves all at once.',
    sealed: 'The Helix Directorate has waited years for someone to stand there. It does not say so. The '
      + 'page does.',
    note: 'The B8 manifest\'s unresolvable point — Veil Nebula.',
  }),
  crate: Object.freeze({
    sub: 'Stasis receipt', open: 'The scanner says 0.0. The massline says heavy. One of them is lying about '
      + 'the rock, and the crate inside it is not talking.',
    sealed: 'The answer stays withheld. The Verge-Layers wrote the lid, and the lid is not taking questions.',
    note: 'The Scale Zero Rock — Nereid Shoal deep field. One unit, discontinued.',
  }),
  quiet: Object.freeze({
    sub: 'Board amendment', open: 'The board amended itself mid-scan and owned the count out loud: it has '
      + 'been counting you the whole time. The Quiet respect a fellow bookkeeper.',
    sealed: 'Nothing on this page is sealed. That is the Quiet\'s idea of a compliment.',
    note: 'The Listening Field board — Io Reach. Forty-two observed.',
  }),
  chime: Object.freeze({
    sub: 'Band note', open: 'Cross the sling band fast and tangential and mass becomes audible: one harmonic, '
      + 'every hull singing the same note at the same place on the curve.',
    sealed: 'The band keeps no secrets. It keeps a note, and it keeps it lawlike.',
    note: 'The Anvil sling band, r 1040–1450 — Tethys Junction.',
  }),
  dust: Object.freeze({
    sub: 'Wake script', open: 'The calm patches hold wakes for hours, and someone has been writing there at '
      + 'the same honest fade rate as everything else. Yours will last exactly as long as anyone\'s.',
    sealed: 'The daily line\'s signature is a pilot everyone thought died. The dust keeps it fresh anyway.',
    note: 'The calm dust sea, Murmur Buoy patch — Veil Nebula.',
  }),
  rim: Object.freeze({
    sub: 'Tally plate', open: 'Your offerings, squared to the dark in a neat row, under a fresh plate. Nobody '
      + 'ever takes. You kept giving anyway. That is what got noticed.',
    sealed: 'The signature is a single glyph — the Watcher\'s own. The page seals the one line the rim signed.',
    note: 'The Watcher\'s Tithe rim — Triton Wake.',
  }),
  tide: Object.freeze({
    sub: 'Odometer reading', open: 'A mechanical odometer, sun-bleached, counting tides nobody watches with '
      + 'a correctness nobody checks. Someone winds it. The sector pretends not to know.',
    sealed: 'The winder stays sealed because nobody has ever been seen winding it, and the page does not '
      + 'pretend to be the first.',
    note: 'The debris tide\'s transponder gate — Orcus Shadow. Cycle 4,110.',
  }),
  jukebox: Object.freeze({
    sub: 'Track note', open: 'The Pale Holiday mix cuts and something plays: slow, wrong-temperature, no '
      + 'recipe in the catalog matches. The room listens all the way through.',
    sealed: 'Nothing here is sealed. Nobody loaded that, and nobody ever will, and the page says so on '
      + 'schedule, once a year.',
    note: 'The bar, Pale Holiday, day 33 — the game\'s one unexplained audio artifact.',
  }),
  constellation: Object.freeze({
    sub: 'Frame note', open: 'At third watch, from one marked bearing, the welding drones read as a '
      + 'constellation\'s dots. On inspection they are just following the weld schedule. Both things are true.',
    sealed: 'The plate is signed where it always was. The page leaves the sky where the plate puts it.',
    note: 'The construction frame off the abandoned colony — Charon Expanse, third watch.',
  }),
  tally: Object.freeze({
    sub: 'Survey mark', open: 'One rock per field, painted 500, forty strokes under it. It rings one note of '
      + 'a ten-note scale. Somebody spent a decade painting an instrument.',
    sealed: 'The scale seals itself at ten notes heard — the belt was left tuned, and now it is played.',
    note: 'THE TALLY — one painted rock per field, every sector.',
  }),
  coin: Object.freeze({
    sub: 'Customs stamp', open: 'One hull, two liens, settled honestly, and the stamp comes down on a coin '
      + 'that is legal nowhere and valid everywhere — because customs watched you earn it.',
    sealed: 'Spent coins stay on the wall. Customs polishes around it; the callsign stays legible.',
    note: 'Dione customs hall — the Dione Lane dispute, settled both ways.',
  }),
});

// ── special-500 batch 14 (codex family) ────────────────────────────────────────
// The World-row copy for the fourteen batch-14 receipt sections. Same shape as the
// batch-12 and batch-13 tables: one sub line, an open-line voice, a sealed-line voice,
// and a note naming where in the world the page was earned.

const WORLD_ROW_COPY_14 = Object.freeze({
  seal: Object.freeze({
    sub: 'Relay receipt', open: 'The receipt names the commodity and the amount; the archive keeps only what it can '
      + 'verify — and the one thing it can verify is the seal. One character off your own hull registration.',
    sealed: 'The line items stay sealed because the Quiet does not share its ledger. The seal dispute is public.',
    note: 'Unaddressed relay — sixty seconds after quiet business closes.',
  }),
  miracle: Object.freeze({
    sub: 'Fulfillment filing', open: 'A delivery with zero seconds of buffer, filed as a statistical miracle. The '
      + 'queue is emotional about this and declines to elaborate.',
    sealed: 'The classification is one-time by rule: MIRACLE WILL NOT BE REPEATED. The queue does not do encores.',
    note: 'FULFILLMENT — the delivery desk, any sector.',
  }),
  form: Object.freeze({
    sub: 'Records filing', open: 'Your patterns, filed as a form. The number is assigned by receipt day; the citation '
      + 'is automatic.',
    sealed: 'The header variant stays queued until the next Concord letter carries it. Bureaucracy is patient; '
      + 'it is also literal.',
    note: 'CONCORD RECORDS — reciprocal filing, any sector.',
  }),
  verse: Object.freeze({
    sub: 'Fine receipt', open: 'The footer verse runs on every tenth payment, by unwritten rule. Nobody wrote it; '
      + 'nobody has been able to remove it.',
    sealed: 'Removal is queued. The queue has been consulted. The verse remains.',
    note: 'HELIX DIRECTORATE — the tenth fine, any sector.',
  }),
  rollcall: Object.freeze({
    sub: 'PA transcript', open: 'A shift-change roll call for a crew that has not assembled in years, faithful down '
      + 'to the pause where the last name should be.',
    sealed: 'The pause is not damage. The audio is 100% faithful. That is the whole finding.',
    note: 'Cold Drill Four — the Vesta cold line, deep-night watch.',
  }),
  blind: Object.freeze({
    sub: 'Overheard discipline', open: 'Target descriptions, shift changes, known habits — all in crisp argot, all '
      + 'audible, none of it about you. They are professionals mid-job.',
    sealed: 'The plan stays what you make of it. The takedown runs on schedule either way.',
    note: 'A hunter stakeout — the Bounty Wrecks field, Sker Haven.',
  }),
  crossing: Object.freeze({
    sub: 'Wire posting', open: 'Posted one day ahead, kept to the minute: a forty-meter iron on the Scar lane, survey '
      + 'lamps blinking in file, a bored tender skiff hanging back.',
    sealed: 'The wire has never been wrong. That is not a promise; it is a record.',
    note: 'The Scar lane — Kepler Scar / Ashfall Reach, day 16, second bell.',
  }),
  pour: Object.freeze({
    sub: 'Forge wire', open: '"Pour in thirty. Channel is hot. Give the spine room." The apron floods dim on schedule '
      + 'and the floor stands down to watch-light.',
    sealed: 'The lead is exactly thirty seconds. The pour runs the window the announcement ends on.',
    note: 'The Vesta Forge spine — day 9, the pour\u2019s lead-in.',
  }),
  ransom: Object.freeze({
    sub: 'Buoy roll', open: 'Names, unpaid tithes, interest accrued — dry, official, updated while you listen. One '
      + 'entry matches a callsign your log carries.',
    sealed: 'The buoy does not editorialize. It does not have to.',
    note: 'The tag lane\u2019s roadside buoy — Pallas Drift.',
  }),
  choir: Object.freeze({
    sub: 'Apron texture', open: 'Overlapping approach calls, berth assignments, one voice always slightly behind the '
      + 'others. It ducks under anything urgent and fills the rest.',
    sealed: 'The choir keeps no secrets. The choir is made of work.',
    note: 'The Helios apron approach — inside 250 WU at rush.',
  }),
  chain: Object.freeze({
    sub: 'Enclosed text', open: 'The letter denies itself in writing: not a chain letter, do not forward it, '
      + 'forwarding is how it moves. You have not read this.',
    sealed: 'The log line stays sealed because the letter will not stay in it. LOG CORRECTED, says the log.',
    note: '[NO SENDER] — after quiet business, any sector.',
  }),
  bay: Object.freeze({
    sub: 'Station wire', open: '"UNATTENDED CARGO, BAY 7. CLAIM OR IT DRILLS." The regulars will tell you bay 7 has '
      + 'been empty for nine years — which is why the wire uses it.',
    sealed: 'Nothing in bay 7 has ever contradicted the wire. The regulars take that as proof.',
    note: 'station_helios, bay 7 — the weekly notice.',
  }),
  mira: Object.freeze({
    sub: 'Freight line', open: 'The manifest was always correct. You misread it. The correction was filed one hour '
      + 'before the misreading happened. You checked.',
    sealed: 'The audit queue keeps what Mira touches sealed. That is what write access means.',
    note: 'Bourse Freight — untraceable, dated retroactively.',
  }),
  advisory: Object.freeze({
    sub: 'Station broadcast', open: '"Surge until second bell. Apron lights doubled, berths half price." Weather, '
      + 'touching the price of a berth through one honest sentence.',
    sealed: 'The fee cut is real; the storm decides how long it lasts. The page reads the season, not the promise.',
    note: 'Station advisories — any sector with an active surge.',
  }),
});

// ── special-500 batch 14b (codex family) ────────────────────────────────────────
// The World-row copy for the fourteen batch-14b receipt sections. Same shape as the
// batch-12, 13 and 14 tables: one sub line, an open-line voice, a sealed-line voice,
// and a note naming where in the world the page was earned.

const WORLD_ROW_COPY_B = Object.freeze({
  moor: Object.freeze({
    sub: 'Guest book line', open: 'Handwriting, one hull per line. The most recent entry is always half-finished — '
      + 'the book does not finish a departure nobody made.',
    sealed: 'The finished line reads BETWEEN: EVERYTHING. The book has kept that ending for every hull that ever left.',
    note: 'The pilgrim mooring — Helios Prime. Settle, and the book makes room.',
  }),
  bookmark: Object.freeze({
    sub: 'Archive filing', open: 'A ribbon, tied by a grip that copies sealed things for a living. The page it marks '
      + 'names your unsealed work — filed as the drone\'s own recommendations.',
    sealed: 'The count rides AR-3\'s log, not the page. The ribbon stays tied either way.',
    note: 'The Reader\'s Stake — Charon Expanse. Two copied pages earn the knot.',
  }),
  truth: Object.freeze({
    sub: 'Bar tab line', open: 'A drink bought for exactly two credits, by a hand that has watched the scale hear '
      + 'tiredness in the tonnage for decades.',
    sealed: 'The nudge is one-time: above band, +2%. The advice was mechanically real, which at this bar counts as a miracle.',
    note: 'The miners\u2019 corner — Belt Outpost. Three tired loads in a row buys the lesson.',
  }),
  bargain: Object.freeze({
    sub: 'Lamp decode', open: 'One small green lamp, vent spine, shadow side, lit only on Ring Fair. The blink pattern '
      + 'is authored data and the decode is the tag lane\u2019s roll.',
    sealed: 'The neighbors all know the lamp. The neighbors all pretend the lamp is a lamp.',
    note: 'The Den\u2019s vent spine — Pallas Drift, Ring Fair, day 13.',
  }),
  plane: Object.freeze({
    sub: 'Witness note', open: 'A folded hull plate with a lamp on it, on a computed arc, burning to a silver flash in '
      + 'the heat wash. Nothing glides in vacuum.',
    sealed: 'The wire never mentions it. The question is the whole page: who folds these?',
    note: 'The Helios pod bay — day 21, one window a year, twenty seconds.',
  }),
  hum: Object.freeze({
    sub: 'Listening note', open: 'Hold still and the machinery composes: cranes, pumps, welders, all in tune, from '
      + 'exactly this bearing.',
    sealed: 'Move, and it degrades back into machinery. It was always the same machinery. You are what changed.',
    note: 'Off the Sker market — the 80 WU zone, thrust under five percent, thirty seconds.',
  }),
  flock: Object.freeze({
    sub: 'Herd receipt', open: 'The rigs detach, piece by piece, and gather the fresh wreckage into a quiet orbit. The '
      + 'one working PA loops softer each cycle.',
    sealed: 'COUNTED. COUNTED. COUNTED. The count is correct; the page keeps it at that.',
    note: 'The Broken Shepherd — Charon Expanse, inside 600 WU.',
  }),
  eye: Object.freeze({
    sub: 'Season filing', open: 'A calm pocket the storm flows around: lightning stops, drag vanishes, debris hangs '
      + 'glittering. Heat cools at the out-of-band rate inside.',
    sealed: 'The eye steps one band-width per season. The pilots who track it share the season math, never the coordinates.',
    note: 'The Anvil band — Tethys Junction. The calendar keeps the count.',
  }),
  panel: Object.freeze({
    sub: 'Composition read', open: 'The scan returns too specific: SLURRY, REFINED, BATCH R3-CARRIER. CONTAINER: '
      + 'R3-CARRIER GRID, PANEL 9.',
    sealed: 'Panel 9 left the warehouse as a container, not cargo. The middle chapter rides the Bay 7 thread flags when they land.',
    note: 'The Slurry Relic — Charon Expanse. Scan it with slurry fresh in the sampling log.',
  }),
  mast: Object.freeze({
    sub: 'Edited playback', open: 'Three hails inside a minute and the mast edits: every filler word removed, content '
      + 'preserved. THE MAST PREFERS YOU.',
    sealed: 'The preference is permanent, and the mast has never explained it. The band notices before the wire does.',
    note: 'The Quiet Mast — Io Reach. The channel learns economy.',
  }),
  pins: Object.freeze({
    sub: 'Paired reading', open: 'Same stake design, same paint batch, same era — one incident from two ends. Read both '
      + 'and the texts complete each other.',
    sealed: 'The middle is the part neither pin carries: the part everyone remembers and no one wrote down.',
    note: 'Both ash pins — Helios Prime and the Pallas leg of Ceres.',
  }),
  sextant: Object.freeze({
    sub: 'Bearing note', open: 'Two bearings by two watches, intersecting at one fixed point — above nothing, where '
      + 'nothing is charted. It is a sextant, and it has been aimed this whole time.',
    sealed: 'The point is flown: a single preserved cockpit beacon. A grave. Left as found.',
    note: 'The Star Marker — Charon Expanse. One scan per watch; the page keeps the watch you are in.',
  }),
  field: Object.freeze({
    sub: 'Count note', open: 'The field is measurably smaller every time you count it, and the missing rocks stand '
      + 'elsewhere in a neat survey-painted row, facing away from everything.',
    sealed: 'The count is exact. The arrangement is exact. The reason is absent.',
    note: 'The vanishing field — Nyx March. Count it twice; the finding holds.',
  }),
  chart: Object.freeze({
    sub: 'Chart table read', open: 'Every star replaced by a hand-cut tally mark, one circled — position for position, '
      + 'a real body no chart row names.',
    sealed: 'The surveyor died before filing it, or after, or because of it. The map does not say. The map is only a map.',
    note: 'The drifting survey wreck — Sedna Dark. The dark the Verge-Layers asked about first keeps the table lit.',
  }),
});

/** One read's rows shaped for makeEntry: label:value names, per-section body copy. A value
 * too long for the ladder (the Long Sentence transcript) prints whole in the body instead. */
function special500RowEntries(rows, prefix, copy) {
  return rows.map((row) => {
    const long = String(row.value).length > 64;
    const voice = row.sealed ? copy.sealed : copy.open;
    return {
      id: `world:${prefix}:${row.label}`,
      name: long ? `${row.label}: ${String(row.value).slice(0, 61).trimEnd()}…` : `${row.label}: ${row.value}`,
      sub: row.sealed ? 'SEALED' : copy.sub,
      body: long ? `${row.value}\n\n${voice}` : voice,
      note: copy.note,
      art: codexEntryArt('chronicler-story'),
    };
  });
}

function codexFactionArt(factionId) {
  const faction = String(factionId || '').replace(/^faction_/, '');
  return /^[a-z0-9_]+$/.test(faction)
    ? { src: 'assets/ui/generated/crests/faction_' + faction + '.webp', kind: 'crest' }
    : null;
}

/**
 * @returns {{wrecks: object[], aces: object[], chains: object[], stories: object[]}}
 * Entry specs per section, in stable order (wreck id, roster order, chain order, story rank).
 */
export function worldCodexEntries(state) {
  const groups = { wrecks: [], aces: [], chains: [], stories: [] };
  const player = state && state.player || {};

  // Unique wrecks — state and last decision. Location never prints, whatever the phase.
  const bearings = player.uniqueWrecks && player.uniqueWrecks.bearings;
  if (bearings && typeof bearings === 'object') {
    for (const wreckId of Object.keys(bearings).sort()) {
      const rec = bearings[wreckId];
      if (!rec || typeof rec !== 'object') continue;
      const def = uniqueWreckById(wreckId);
      const choice = def && rec.choiceId
        ? (((def.decision && def.decision.choices) || [])).find((c) => c && c.id === rec.choiceId)
        : null;
      const phase = WRECK_PHASE_META[rec.phase] ? rec.phase : 'rumored';
      const body = [WRECK_PHASE_BODY[phase]];
      if (choice && choice.label) body.push(`Last decision: ${choice.label}.`);
      groups.wrecks.push({
        id: `world:wreck:${wreckId}`,
        art: codexWreckArt(wreckId),
        name: rec.name || (def && def.name) || wreckId,
        sub: 'Unique wreck',
        meta: WRECK_PHASE_META[phase],
        body: body.join('\n'),
        note: choice && choice.receiptTitle ? `Receipt: ${choice.receiptTitle}.` : '',
      });
    }
  }

  // Named captains — the remembered-bark line, seeded exactly like the owner's voice.
  const memory = state && state.aceMemory;
  if (memory && typeof memory === 'object') {
    const seed = state && state.meta && Number.isFinite(state.meta.seed) ? state.meta.seed >>> 0 : 0;
    for (const ace of knownAces()) {
      const rec = memory[ace.id];
      if (!rec || rec.encountered !== true) continue;
      const stance = stanceForRecord(rec);
      if (!ACE_STANCE_META[stance.stance]) continue;
      const line = rememberedBarkFor(ace, rec, stance, hash32(seed, ace.id, 'codex-world'));
      if (!line) continue;
      groups.aces.push({
        id: `world:ace:${ace.id}`,
        art: codexFactionArt(ace.factionId) || codexEntryArt('codex-record'),
        name: ace.name,
        sub: 'Named captain',
        meta: ACE_STANCE_META[stance.stance],
        body: line,
      });
    }
  }

  // Provenance chains — what is still held against you, and the closing verb when it settled.
  const chains = state && state.provenance && Array.isArray(state.provenance.chains)
    ? state.provenance.chains : [];
  for (const chain of chains) {
    if (!chain || !Array.isArray(chain.nodes) || !chain.nodes.length) continue;
    const nodes = chain.nodes;
    const factionId = (nodes.find((n) => n && n.factionId) || {}).factionId || null;
    const faction = factionId && FACTION_LABELS[factionId] || null;
    const act = nodes.find((n) => n && n.k === 'act' && n.text)
      || nodes.find((n) => n && n.text) || null;
    const open = chain.open === true;
    const held = [];
    if (open) {
      if (chain.bountyPending === true) held.push('a bounty still stands');
      if (chain.amendsActive === true) held.push('amends are still owed');
      if (!held.length) held.push(faction ? `${faction} still holds it` : 'it is still held');
    }
    const verb = CHAIN_OUTCOME_VERB[chain.outcome] || (open ? 'open' : 'closed');
    groups.chains.push({
      id: `world:chain:${chain.id || groups.chains.length}`,
      art: codexFactionArt(factionId) || codexEntryArt('codex-record'),
      name: act && act.text ? act.text : (faction ? `${faction} — an incident chain` : 'An incident chain'),
      sub: 'Provenance',
      meta: open ? 'Held against you' : 'Settled',
      body: held.length ? `Held against you: ${held.join('; ')}.` : '',
      note: `Closing verb: ${verb}.`,
    });
  }

  // The pilot's logbook follows time, preserving the Chronicler's evidence and house voice.
  const stories = state && state.chronicler && Array.isArray(state.chronicler.stories)
    ? state.chronicler.stories : [];
  if (stories.length) {
    for (const view of logbookEntries(state, { opening: false })) {
      const still = logbookStill(state, view);
      groups.stories.push({
        id: `world:story:${view.id}:r${view.revision}`,
        art: still ? { src: still, kind: 'still' } : codexEntryArt('chronicler-story'),
        name: view.title || 'A recorded story',
        sub: 'Pilot’s logbook',
        meta: view.kind || 'record',
        body: view.body,
        note: `Cited ${view.id}:r${view.revision}.`,
      });
    }
  }
  return groups;
}

/** Take the reader's chrome (filed-under line, plate, turn) off an entry, leaving its own words. */
function undressEntry(entry) {
  if (!entry || !entry.article || typeof entry.article.querySelectorAll !== 'function') return;
  for (const node of [...entry.article.querySelectorAll(':scope > .cx-chrome')]) node.remove();
}

/** Produced or canonical art for a figure: a dedicated codex scene, canonical portrait, or crest. */
function figureArt(figureKey) {
  if (!figureKey) return null;
  const codexCharacter = CODEX_CHARACTER_ART[figureKey];
  if (codexCharacter) return codexEntryArt(codexCharacter);
  const portrait = CANONICAL_PORTRAITS[figureKey];
  if (portrait) return { src: PORTRAIT_ASSET_ROOT + portrait, kind: 'photo' };
  const faction = FIGURE_FACTION[figureKey];
  if (faction) return { src: 'assets/ui/generated/crests/' + faction + '.webp', kind: 'crest' };
  return null;
}

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * The codex's produced plates (assets/ui/generated/codex/, manifest beside them): one per story
 * beat, plus a distinct ending plate for each endgame choice.
 */
function codexPlate(entry) {
  const id = String(entry && entry.id || '');
  const beat = /^beat:(\d+)$/.exec(id);
  if (beat && Number(beat[1]) <= 7) return CODEX_PLATE_ROOT + 'beat' + beat[1] + '.webp';
  const ending = /^endgame:([A-E])$/.exec(id);
  if (ending) return CODEX_ENTRY_ROOT + 'ending-' + ending[1].toLowerCase() + '.webp';
  return null;
}

/**
 * Produced art for a comms entry: the station that sent it (its establishing art), where the sender
 * names one; the signal stills otherwise (a jump ring, the lane every relay speaks across).
 */
const STATION_ART_ROOT = 'assets/ui/generated/stations/';
const SENDER_STATIONS = Object.freeze([
  [/HELIOS/, 'station_helios'], [/CUSTOMS|GATE 3/, 'station_customs'], [/DRIFT MINERS/, 'station_drift'],
  [/OUTPOST 9|BAR COMMS/, 'station_beltout'], [/VEIL/, 'station_veil'], [/CRIMSON REACH|ASHFALL/, 'station_reach'],
  [/CINDER/, 'station_rhea_cinder'], [/BOURSE|MERIDIAN|TRADING POST|EXCHANGE/, 'station_tethys'],
  [/CONCORD|VALE|ADMIN|REGISTRY|PATROL|ALA/, 'station_coalition'], [/HOLLOW/, 'station_hyperion_claim'],
  [/HELIX/, 'station_kepler_scar'], [/FRONTIER/, 'station_sker'],
]);
const SIGNAL_STILLS = Object.freeze({
  relay: 'assets/cinematics/C-INTRO-01.jpg',
  wall: 'assets/cinematics/C-INTRO-04.jpg',
  anomaly: 'assets/cinematics/C-INTRO-03.jpg',
});
function senderArt(sender) {
  const s = String(sender || '').toUpperCase();
  for (const [re, station] of SENDER_STATIONS) if (re.test(s)) return STATION_ART_ROOT + station + '.webp';
  return SIGNAL_STILLS.relay;
}

/** A host that can draw SVG and measure (the checks mount on minimal documents). */
function richDom() {
  return typeof document !== 'undefined' && typeof document.createElementNS === 'function';
}

/** The ship you fly from above (the Ledger's plate: the hull the ledger is kept aboard). */
function flownHullTop(state) {
  const player = state && state.player;
  const owned = player && Array.isArray(player.ownedShips) ? player.ownedShips : [];
  const ship = owned[Number(player && player.activeShipIndex) || 0] || owned[0] || null;
  return ship && ship.defId ? hullPosterUrl(ship.defId, 'top') : null;
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
    const markCssReady = deferScreenCssReady(rootEl, injectArchiveLayouts());
    injectCodexLayouts();
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
        const ro = new ResizeObserver(() => { this._alignReading(); this._drawWedge(); this._placeHand(true); });
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
    rootEl.appendChild(foot);

    // The plate: the entry's art in an aperture ringed by every entry of the open section. The ring
    // is the archive's dial — drag round it (or turn it with the wheel or the arrow keys) and the
    // pages turn under the Hand, an amber blade across the ring.
    const plateHost = el('div', 'cx-plate-host');
    plateHost.hidden = true;
    const plate = el('div', 'cx-plate');
    plate.setAttribute('role', 'slider');
    plate.setAttribute('aria-label', 'Turn the archive');
    plate.tabIndex = 0;
    const aperture = el('div', 'cx-plate__art');
    const rings = el('div', 'cx-plate__rings');
    const blade = el('div', 'cx-plate__blade');
    blade.innerHTML = archiveBladeSvg();
    const hover = el('div', 'cx-plate__hover');
    plate.appendChild(aperture);
    plate.appendChild(rings);
    plate.appendChild(hover);
    plate.appendChild(blade);
    const caption = el('div', 'cx-plate__caption');
    caption.hidden = true;
    caption.setAttribute('aria-hidden', 'true');
    plateHost.appendChild(plate);
    plate.appendChild(caption);
    rootEl.appendChild(plateHost);
    const arm = typeof blade.querySelector === 'function' ? blade.querySelector('.cx-blade__arm') : null;
    this._dial = { host: plateHost, plate, aperture, rings, blade, hover, arm, caption, angle: 0 };
    this._dial.spring = createSpring({ value: 0, preset: 'swing', onUpdate: (deg) => {
      this._dial.angle = deg;
      if (arm && arm.style) arm.style.transform = 'rotate(' + deg.toFixed(2) + 'deg)';
    } });
    this._tape = plate;
    this._bindDial(plate);
    this._bindTilt(plate);
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
    // The story owner emits the filed ending's manuscript when it is written (and on archive
    // open); the Archive tab reads it straight from state on the next render.
    this._unsubs.push(ctx.bus.on('endgame:archive', refreshIfVisible));

    this._render(ctx);
    markCssReady();
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
    this._logbookOff?.();
    this._logbookOff = ctx?.bus?.on?.('logbook:stillReady', () => {
      if (this._visible && this._activeTab === 'World' && this._body) this._render(ctx);
    });
    // Consume both requests once. A valid plate is more specific than a tab request; a stale plate
    // fails closed and leaves the ordinary requested tab available.
    const requestedTab = takeRequestedCodexTab();
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
    // the type settles once the faces load: the Hand and the fan are measured again then
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { this._alignReading(); this._placeHand(true); this._drawWedge(); }).catch(() => {});
    }
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
    this._logbookOff?.(); this._logbookOff = null;
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
      this._filterLedger();
      this._paintLedgerPlate();
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
    // Every tab keeps the instrument: the unlock dials and the search stay (the Ledger's search
    // reads its own rows, since the ledger is the station's panel, not a set of entries).
    const isLedger = this._activeTab === 'Ledger';
    this._searchWrap.hidden = false;
    this._status.hidden = false;
    if (this._search && this._search.value !== this._query) this._search.value = this._query;
    this._renderStatus(ctx);
    switch (this._activeTab) {
      case 'Story':    this._renderStory(ctx); break;
      case 'Comms':    this._renderComms(ctx); break;
      case 'Discoveries': this._renderDiscoveries(ctx); break;
      case 'World':    this._renderWorld(ctx); break;
      case 'Graffiti': this._renderGraffiti(ctx); break;
      case 'Figures':  this._renderFigures(ctx); break;
      case 'Ship':     this._renderShip(ctx); break;
      case 'Archive':  this._renderArchive(ctx); break;
      case 'Catalog':  this._renderCatalog(ctx); break;
      case 'Ledger':   this._renderLedger(ctx); break;
    }
    // What was locked the last time this section was drawn and is open now decrypts in place.
    if (!this._lockedByTab) this._lockedByTab = {};
    const before = this._lockedByTab[this._activeTab];
    const lockedNow = new Set(this._entries.filter((entry) => entry.locked).map((entry) => entry.id));
    this._lockedByTab[this._activeTab] = lockedNow;
    const opened = before ? this._entries.filter((entry) => !entry.locked && before.has(entry.id)) : [];
    if (!isLedger) this._applySearchFilter();
    else { this._list = null; this._placeHand(); this._renderTape([]); this._filterLedger(); this._paintLedgerPlate(); }
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
      if (this._dial && this._dial.plate && this._dial.plate.classList) {
        const plate = this._dial.plate;
        plate.classList.add('is-unlocking');
        setTimeout(() => { if (plate.classList) plate.classList.remove('is-unlocking'); }, 1800);
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
   * The dial's entries: every entry of the open section (after the search) round the ring, a long
   * graduation where each sub-section starts. The ring itself is drawn when an entry is shown.
   */
  _renderTape(sections) {
    const list = sections.flatMap((section) => section.entries);
    this._tapeEntries = list;
    const starts = [];
    let first = 0;
    for (const section of sections) {
      if (!section.entries.length) continue;
      starts.push(first);
      first += section.entries.length;
    }
    this._tapeStarts = starts;
    if (!list.length && this._dial) { this._dial.host.hidden = true; if (this._codexRoot) this._codexRoot.dataset.plate = 'off'; }
  },

  /** Seat the dial's slider reading, and the Hand, on the entry being read. */
  _syncTape({ instant = false } = {}) {
    const dial = this._dial;
    const list = this._tapeEntries || [];
    if (!dial || !list.length) return;
    const cur = this._currentEntry();
    const i = Math.max(0, list.indexOf(cur));
    const plate = dial.plate;
    plate.setAttribute('aria-valuemin', '1');
    plate.setAttribute('aria-valuemax', String(list.length));
    plate.setAttribute('aria-valuenow', String(i + 1));
    plate.setAttribute('aria-valuetext', cur ? (cur.locked ? 'Locked entry' : cur.name) + ', ' + (i + 1) + ' of ' + list.length : '');
    if (this._dragging) return;
    this._swingBlade(archiveDialAngle(i, list.length), { instant });
  },

  /** Swing the blade to `deg` the short way round (the spring keeps its own unwound angle). */
  _swingBlade(deg, { instant = false } = {}) {
    const dial = this._dial;
    if (!dial || !dial.spring) return;
    const now = dial.spring.target;
    let target = deg;
    while (target - now > 180) target -= 360;
    while (target - now < -180) target += 360;
    dial.spring.set(target, { instant: instant || !this._bladeShown });
    this._bladeShown = true;
  },

  /** The name of the entry under the pointer, under the plate (its cipher when it is locked). */
  _hoverTape(i) {
    const dial = this._dial;
    if (!dial) return;
    const list = this._tapeEntries || [];
    const entry = i >= 0 ? list[i] : null;
    if (!entry) { dial.caption.hidden = true; dial.hover.innerHTML = ''; dial.plate.classList.remove('is-pointing'); this._hoverI = -1; return; }
    if (i === this._hoverI && !dial.caption.hidden) return;
    this._hoverI = i;
    const lit = archiveHoverSvg(i, list.length);
    dial.hover.innerHTML = lit.svg;
    dial.plate.classList.add('is-pointing');
    dial.caption.hidden = false;
    dial.caption.classList.toggle('is-right', lit.side === 'right');
    if (dial.caption.style) {
      dial.caption.style.left = (lit.x * 100).toFixed(2) + '%';
      dial.caption.style.top = (lit.y * 100).toFixed(2) + '%';
    }
    dial.caption.textContent = '';
    dial.caption.appendChild(el('span', 'cx-plate__caption-at', pad2(i + 1) + ' / ' + pad2(list.length)));
    if (entry.locked) {
      // the same cipher the ladder shows for this entry
      const parts = lockedNameParts(entry.id, entry.name);
      const name = el('span', 'cx-plate__caption-name is-locked');
      if (parts.code) name.appendChild(el('span', 'cx-code', parts.code));
      name.appendChild(el('span', 'cx-cipher', parts.cipher));
      dial.caption.appendChild(name);
    } else {
      dial.caption.appendChild(el('span', 'cx-plate__caption-name', entry.name));
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

  _bindDial(plate) {
    if (!plate || typeof plate.addEventListener !== 'function') return;
    // the pointer's bearing from the plate's centre (0 = up, clockwise) and its reach (0 centre .. 1 rim)
    const bearing = (ev) => {
      if (typeof plate.getBoundingClientRect !== 'function') return null;
      const r = plate.getBoundingClientRect();
      if (!(r.width > 0)) return null;
      const dx = ev.clientX - (r.left + r.width / 2);
      const dy = ev.clientY - (r.top + r.height / 2);
      const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
      return { deg: (deg + 360) % 360, reach: Math.hypot(dx, dy) / (r.width / 2) };
    };
    let pending = -1;
    let frame = 0;
    const later = globalThis.requestAnimationFrame || ((fn) => setTimeout(fn, 16));
    const commit = () => { frame = 0; if (pending < 0) return; const i = pending; pending = -1; this._scrubTo(i); };
    const queue = (i) => { if (i < 0) return; pending = i; if (!frame) frame = later(commit); };
    const finish = () => {
      if (!this._dragging) return;
      this._dragging = false;
      this._scrubbing = false;
      plate.classList.remove('is-dragging');
      this._hoverTape(-1);
      // the page the drag stopped on arrives properly, and the Hand settles on its arc
      const entry = this._currentEntry();
      if (entry) { this._shownId = null; this._showEntry(entry); this._placeHand(); }
      this._syncTape();
    };
    plate.addEventListener('pointerdown', (ev) => {
      if (ev.button != null && ev.button !== 0) return;
      const b = bearing(ev);
      const n = (this._tapeEntries || []).length;
      if (!b || !n) return;
      this._dragging = true;
      this._scrubbing = true;
      plate.classList.add('is-dragging');
      try { plate.setPointerCapture(ev.pointerId); } catch (_) { /* synthetic pointer */ }
      try { plate.focus({ preventScroll: true }); } catch (_) { /* no focus in this host */ }
      this._swingBlade(b.deg);
      const i = archiveDialIndex(b.deg, n);
      this._hoverTape(i);
      queue(i);
      if (typeof ev.preventDefault === 'function') ev.preventDefault();
    });
    plate.addEventListener('pointermove', (ev) => {
      const b = bearing(ev);
      const n = (this._tapeEntries || []).length;
      if (!b || !n) return;
      const i = archiveDialIndex(b.deg, n);
      if (this._dragging) {
        // the blade rides the pointer round the ring; the page follows it arc by arc
        this._swingBlade(b.deg);
        this._hoverTape(i);
        queue(i);
        return;
      }
      // over the ring (not the art), the entry under the pointer names itself
      this._hoverTape(b.reach > 0.72 && b.reach < 1.02 ? i : -1);
      plate.classList.toggle('is-over-ring', b.reach > 0.72 && b.reach < 1.02);
    });
    plate.addEventListener('pointerup', finish);
    plate.addEventListener('pointercancel', finish);
    plate.addEventListener('lostpointercapture', finish);
    plate.addEventListener('pointerleave', () => { if (!this._dragging) { this._hoverTape(-1); plate.classList.remove('is-over-ring'); } });
    plate.addEventListener('keydown', (ev) => {
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
    plate.addEventListener('wheel', (ev) => {
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
      const plate = this._dial && this._dial.plate;
      if (!plate || !plate.style || typeof plate.getBoundingClientRect !== 'function') return;
      const r = plate.getBoundingClientRect();
      const inside = last && r.width > 0 && last.x >= r.left && last.x <= r.right && last.y >= r.top && last.y <= r.bottom;
      if (!inside || reducedMotion() || this._dragging) {
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
    if (!this._hand) this._hand = createLadderHand(this._index, { className: 'orr-arc-hand orr-arc-hand--bone', nodeY: 15 });
    const row = this._list && typeof this._list.querySelector === 'function'
      ? this._list.querySelector('.k-row[aria-selected="true"]') : null;
    this._keepRowClear(row);
    this._hand.moveTo(row, { instant });
  },

  /** The chosen rung stands clear of the ladder's fold (its fade) rather than half under it. */
  _keepRowClear(row) {
    const box = this._index;
    if (!row || !box || typeof box.getBoundingClientRect !== 'function' || typeof row.getBoundingClientRect !== 'function') return;
    if (!(Number(box.scrollHeight) > Number(box.clientHeight) + 2)) return;
    const b = box.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    if (!(r.height > 0)) return;
    const z = archiveZoom(box, b);
    const top = (r.top - b.top) / z;
    const bottom = (r.bottom - b.top) / z;
    const limit = Number(box.clientHeight) - 40;
    let shift = 0;
    if (bottom > limit) shift = bottom - limit;
    else if (top < 4) shift = top - 4;
    if (!shift) return;
    box.scrollTop = Math.max(0, (Number(box.scrollTop) || 0) + shift);
    this._drawWedge();
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
    const v = ladder.getBoundingClientRect();
    // the fan opens onto the sub-section being read (its heading down to its last entry), not the whole list
    let l = list.getBoundingClientRect();
    const focusId = this._focusByTab && this._focusByTab[this._activeTab];
    const section = focusId && this._sectionOf ? this._sectionOf.get(focusId) : null;
    if (section && section.entries.length) {
      const rows = [...list.querySelectorAll('.k-row[data-id]')];
      const ids = new Set(section.entries.map((entry) => entry.id));
      const own = rows.filter((row) => ids.has(row.dataset.id));
      if (own.length) {
        const head = own[0].previousElementSibling && own[0].previousElementSibling.classList.contains('k-row--static') ? own[0].previousElementSibling : own[0];
        const a = head.getBoundingClientRect();
        const b = own[own.length - 1].getBoundingClientRect();
        l = { left: l.left, top: a.top, bottom: b.bottom };
      }
    }
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

  // Signal Archive — every recovered signal an entry on the dial (its still in the aperture); PLAY
  // runs the clip through the UI system's shared cinematic player (ui.playCinematic).
  _renderArchive(ctx) {
    // FB-129 — the written ending is part of the ship's own record. Once the story owner files it
    // (state.story.writtenFinale), the Archive carries the manuscript itself: the transmission
    // that played, then the epilogue — cited back to its receipt. Read-only; the story owner
    // remains the only writer.
    const archive = writtenEndingArchive(
      ctx && ctx.state && ctx.state.story ? ctx.state.story.writtenFinale : null,
    );
    if (archive) {
      const body = archive.transmission
        .map((b) => `${b.sender}: ${b.text}`)
        .join('\n');
      const epilogue = (archive.epilogue || []).join('\n');
      this._section('Filed Ending', [makeEntry({
        id: 'endgame:filed',
        art: codexEntryArt('ending-' + String(archive.choiceId || '').toLowerCase()),
        name: archive.title,
        sub: 'Filed ending',
        title: archive.title,
        meta: `${archive.subtitle ? archive.subtitle + ' · ' : ''}filed under ${archive.receiptId}`,
        body: body || archive.subtitle || '',
        note: epilogue || 'The record stands.',
        signal: true,
      })]);
    }
    // Each recovered signal is an entry: its still in the aperture, its log as the reading, and
    // PLAY, the tab's one Lamp Key, under it (the clip runs through the UI's shared player).
    const entries = SIGNAL_ARCHIVE.map((c) => {
      const entry = makeEntry({
        id: 'signal:' + c.id,
        name: c.id + ' · ' + c.title,
        sub: 'Recovered signal',
        title: c.title,
        meta: 'Recovered signal ' + c.id + ' · Reach corridor',
        body: c.caption,
        image: c.poster,
      });
      const play = el('button', 'k-word k-word--emph cx-play', 'Play');
      play.type = 'button';
      play.dataset.action = 'play:' + c.id;
      play.setAttribute('aria-label', 'Play signal ' + c.id + ': ' + c.title);
      play.addEventListener('click', () => { cue('confirm'); this._playCinematic(c.video, c.title); });
      try { dressLampKey(play); } catch (_) { /* a host without SVG keeps the word */ }
      // Keep the primary action ahead of the scrollable caption on short screens.
      entry.article.insertBefore(play, entry.measure);
      return entry;
    });
    this._section('Recovered Signals', entries);
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

  /** The Ledger's search: its rows are the station panel's, filtered by their own words. */
  _filterLedger() {
    const panel = this._ledgerPanel && this._ledgerPanel.el;
    if (!panel || typeof panel.querySelectorAll !== 'function') return;
    const query = normalizeSearch(this._query);
    for (const row of panel.querySelectorAll('.st-ledger-entry')) row.hidden = !!query && !normalizeSearch(row.textContent).includes(query);
  },

  /**
   * The Ledger on the plate: the hull the ledger is kept aboard stands in the aperture (dim while the
   * ledger is empty), one ring of bone, and the ledger's count as the engraving. No blade: the
   * ledger is read in the column beside it, page by page, not turned on the ring.
   */
  _paintLedgerPlate() {
    const dial = this._dial;
    if (!dial || !dial.host) return;
    const model = this._ledgerPanel && this._ledgerPanel.model;
    const total = model ? Math.max(0, Number(model.total) || 0) : 0;
    dial.host.hidden = false;
    if (this._codexRoot) this._codexRoot.dataset.plate = 'on';
    const src = flownHullTop(this._ctx && this._ctx.state);
    const aperture = dial.aperture;
    aperture.className = 'cx-plate__art is-hull is-ledger' + (total ? ' is-filled' : '') + (src ? '' : ' is-empty');
    const img = aperture.querySelector && aperture.querySelector('img');
    if (src && (!img || img.getAttribute('src') !== src)) {
      aperture.textContent = '';
      const pic = el('img');
      pic.alt = '';
      pic.decoding = 'async';
      pic.src = src;
      aperture.appendChild(pic);
    } else if (!src) aperture.textContent = '';
    dial.rings.innerHTML = archivePlateSvg({
      entries: [total ? 'read' : 'locked'],
      current: -1,
      top: "Codex · The ship's ledger",
      bottom: total ? total + (total === 1 ? ' entry' : ' entries') + ' filed' : 'Ledger empty',
    });
    if (dial.hover) dial.hover.innerHTML = '';
    if (dial.caption) dial.caption.hidden = true;
    const plate = dial.plate;
    plate.classList.add('is-ledger');
    plate.tabIndex = -1;
    plate.setAttribute('aria-disabled', 'true');
    plate.setAttribute('aria-valuetext', total ? "Ship's ledger, " + total + ' entries' : "Ship's ledger, empty");
    this._alignReading();
  },

  /**
   * World tab (FB-037) — the world you changed, read from the four saved bags the other tabs
   * never open: unique-wreck dispositions, named-ace memories, provenance chains still held,
   * and the chronicler's ranked stories. worldCodexEntries is the pure derivation (read-only;
   * no new state, no location leaks for unread wrecks); this render only maps it through
   * makeEntry like every other tab.
   */
  _renderWorld(ctx) {
    const groups = worldCodexEntries(ctx && ctx.state);
    const toEntries = (specs) => specs.map((spec) => makeEntry(spec));
    this._section('Unique Wrecks', toEntries(groups.wrecks), 'No unique wreck bears your record yet.');
    this._section('Captains', toEntries(groups.aces), 'No captain remembers you by name.');
    this._section('Held Against You', toEntries(groups.chains), 'Nothing is held against you.');
    const journal = groups.stories.length ? groups.stories : logbookEntries(ctx?.state).map(entry => ({
      id: 'world:logbook:opening', name: entry.title, sub: 'Pilot’s logbook', body: entry.body,
      art: codexEntryArt('chronicler-story'),
    }));
    this._section('Pilot’s logbook', toEntries(journal));
    this._section('Suhl’s Clauses', toEntries(decodedSuhlClauses(ctx?.state).map(row => ({
      id: `world:clause:${row.index}`, name: `Clause ${row.index + 1}`, sub: 'Accepted comparison',
      body: row.text, note: `Comparison ${row.incidentId}.`, art: codexEntryArt('chronicler-story'),
    }))), 'An accepted machine appeal earns a decoded clause. The transcript stays sealed until then.');
    this._section('Names for the Dead', toEntries(namesForTheDead(ctx?.state).map(row => ({
      id: `world:dead:${row.id}`, name: row.name, sub: row.place, body: row.body,
      note: `Recorded at ${Math.floor(row.at / 60)}:${String(Math.floor(row.at % 60)).padStart(2, '0')}. Cited ${row.citation}.`,
      art: codexEntryArt('chronicler-story'),
    }))), 'No named loss is recorded. This page never fills the silence with invented people.');
    this._section('The Sealed Side', toEntries(incident7741ShelfRows(ctx?.state).map(row => ({
      id: `world:incident7741:${row.label}`, name: `${row.label}: ${row.value}`,
      sub: row.sealed ? 'SEALED' : 'On the board',
      body: row.sealed
        ? 'The shelf sealed this line and left the seal intact. Whatever was filed here stays filed.'
        : 'The one line the shelf left open. It is either an oversight or the entire point.',
      note: 'Incident 7741 — evidence shelf, Listening Field re-scan.',
      art: codexEntryArt('chronicler-story'),
    }))), 'The Listening Field has not shown you its sealed side yet. It takes a second reading.');
    this._section('Gate Receipt', toEntries(vergeGateReceiptRows(ctx?.state).map(row => ({
      id: `world:verge-receipt:${row.label}`, name: `${row.label}: ${row.value}`,
      sub: row.sealed ? 'CLOSED' : 'Filed',
      body: row.sealed
        ? 'The ring stays closed either way. The receipt was always the prize.'
        : 'The gate filed this line against your hull, in the interrogative register the Verge-Layers never drop.',
      art: codexEntryArt('chronicler-story'),
    }))), 'No gate has weighed you yet. The dark the Verge-Layers asked about first keeps its receipts.');
    // ── special-500 batch 12 (codex family) ──
    const rowEntries = (rows, prefix, copy) => toEntries(special500RowEntries(rows, prefix, copy));
    this._section('The Retired Channel',
      rowEntries([
        ...buoyKeepingRows(ctx?.state),
        ...halfConversationRows(ctx?.state),
      ], 'buoy', WORLD_ROW_COPY.buoy),
      'The retired channel buoy has not answered you yet. The standard response out here is no registry at all.');
    this._section('Weigh-Clamp Chalk',
      rowEntries(abutmentChalkRows(ctx?.state), 'chalk', WORLD_ROW_COPY.chalk),
      'The abutment has not weighed you yet. Idle at the clamp and it will make you a line regardless.');
    this._section('Contract 47-A',
      rowEntries(refund47aRows(ctx?.state), 'refund', WORLD_ROW_COPY.refund),
      'Scale 4 has not processed your 47-A paperwork yet. The withheld line stays withheld.');
    this._section('Vols\u2019s Last Log',
      rowEntries(volsLastLogRows(ctx?.state), 'vols', WORLD_ROW_COPY.vols),
      'No pod has caught your light yet. The charts do not mention one, and they mean it.');
    this._section('The Tidied Wreck',
      rowEntries(latchTidyRows(ctx?.state), 'tidy', WORLD_ROW_COPY.tidy),
      'No wreck you left intact has come back tidied yet. Keep the cargo, leave the hull alone, give it a day.');
    this._section('The Long Sentence',
      rowEntries(longSentenceRows(ctx?.state), 'sentence', WORLD_ROW_COPY.sentence),
      'The beacon past the Tether Memorial has not started spelling for you yet. Each pulse is one character, and it has time.');
    this._section('Shaft 7 Tally',
      rowEntries(shaftSevenTallyRows(ctx?.state), 'tally', WORLD_ROW_COPY.tally),
      'The stake\u2019s tally plate reads only chalk and weather so far.');
    this._section('Morrow\u2019s Tally',
      rowEntries(morrowHundredRows(ctx?.state), 'morrow', WORLD_ROW_COPY.morrow),
      'Morrow\u2019s departure count is its own business. It has not reached a number worth saying aloud yet.');
    this._section('Checkpoint Niner',
      rowEntries(checkpointCatRows(ctx?.state), 'cat', WORLD_ROW_COPY.cat),
      'No drone has adopted a checkpoint in your presence. The examiner denies everything anyway, in writing.');
    this._section('Jump Log',
      rowEntries(jumpLogRows(ctx?.state), 'jump', WORLD_ROW_COPY.jump),
      'No jump has been logged under your name yet. The lanes are patient.');
    this._section('Accession No. 1',
      rowEntries(galleryAccessionRows(ctx?.state), 'accession', WORLD_ROW_COPY.accession),
      'Nothing you have scanned has been accessioned yet. The collection is waiting for its first exhibit.');
    this._section('The Long Game',
      rowEntries(longGameRows(ctx?.state), 'long-game', WORLD_ROW_COPY.longGame),
      'The game in the murk is not yours and has not shown itself. It has been resumed every few cycles for eleven years.');
    this._section('Alignment, Day 16',
      rowEntries(alignmentRows(ctx?.state), 'alignment', WORLD_ROW_COPY.alignment),
      'No alignment has composed itself around your hull yet. Once a year, four seconds — the calendar knows the day.');
    // ── special-500 batch 13 (codex family) ──
    this._section('The Twenty-Fifth Plinth',
      rowEntries(plinthRows(ctx?.state), 'plinth', WORLD_ROW_COPY_13.plinth),
      'The twenty-fifth plinth is still dark. It answers one scan, and only after a death has been witnessed in this sector.');
    this._section('Do Not Wake',
      rowEntries(cockpitManifestRows(ctx?.state), 'cockpit', WORLD_ROW_COPY_13.cockpit),
      'The preserved cockpit has not been scanned yet. Its manifest is not finished, and that is the point.');
    this._section('The Kitchen Is Open',
      rowEntries(kitchenRows(ctx?.state), 'kitchen', WORLD_ROW_COPY_13.kitchen),
      'The warm freighter has not taken an order yet. Fly hungry through Charon and mind the vent.');
    this._section('The Photograph',
      rowEntries(photographRows(ctx?.state), 'photograph', WORLD_ROW_COPY_13.photograph),
      'The B8 file still does not resolve. Bring the salvaged communicator and stand in the file\u2019s one wrong place.');
    this._section('Void Stasis Crate',
      rowEntries(voidCrateRows(ctx?.state), 'crate', WORLD_ROW_COPY_13.crate),
      'No rock has scanned 0.0 yet. The massline will disagree with the scanner when you find it.');
    this._section('The Quiet Count',
      rowEntries(quietCountRows(ctx?.state), 'quiet', WORLD_ROW_COPY_13.quiet),
      'The field has not amended its board yet. It counts hulls; it has been counting you.');
    this._section('Mass Made Audible',
      rowEntries(slingChimeRows(ctx?.state), 'chime', WORLD_ROW_COPY_13.chime),
      'The sling band has not sung for you yet. Cross the Anvil band fast and tangential, and listen.');
    this._section('The Dust Script',
      rowEntries(dustScriptRows(ctx?.state), 'dust', WORLD_ROW_COPY_13.dust),
      'The calm dust has shown you no script yet. The Murmur Buoy\u2019s patch keeps the best entries.');
    this._section('The Rim Notices',
      rowEntries(rimTitheRows(ctx?.state), 'rim', WORLD_ROW_COPY_13.rim),
      'The rim has not noticed you yet. It notices leaving, not visiting.');
    this._section('Cycle 4,110',
      rowEntries(tideLedgerRows(ctx?.state), 'tide', WORLD_ROW_COPY_13.tide),
      'You have not sat through a full tide cycle at the gate. The odometer does not mind waiting; it is good at it.');
    this._section('Nobody Loaded That',
      rowEntries(jukeboxRows(ctx?.state), 'jukebox', WORLD_ROW_COPY_13.jukebox),
      'The Pale Holiday has not cut the bar\u2019s mix for you yet. Day 33, one play per sitting, no recipe.');
    this._section('The Sky We Came From',
      rowEntries(constellationRows(ctx?.state), 'constellation', WORLD_ROW_COPY_13.constellation),
      'The night frame has not welded its pattern for you yet. Third watch, from the marked bearing, or not at all.');
    this._section('The Tally',
      rowEntries(tallyRows(ctx?.state), 'tally', WORLD_ROW_COPY_13.tally),
      'No painted rock has rung for you yet. One per field, and the paint is a survey mark, not a joke.');
    this._section('The Coin',
      rowEntries(customsCoinRows(ctx?.state), 'coin', WORLD_ROW_COPY_13.coin),
      'Customs has not stamped your coin yet. Settle both liens on the Dione dispute, honestly, and it is legal nowhere and valid everywhere.');
    // ── special-500 batch 14 (codex family) ──
    this._section('The Off-By-One Seal',
      rowEntries(quietReceiptRows(ctx?.state), 'seal', WORLD_ROW_COPY_14.seal),
      'The Quiet has not filed you yet. Business first; the relay does not do introductions.');
    this._section('The Queue Files An Emotion',
      rowEntries(queueMiracleRows(ctx?.state), 'miracle', WORLD_ROW_COPY_14.miracle),
      'No delivery of yours has landed on a zero buffer yet. The queue does not classify luck as a miracle twice.');
    this._section('You Are Now Citable',
      rowEntries(concordFormRows(ctx?.state), 'form', WORLD_ROW_COPY_14.form),
      'Concord Records has not filed you back yet. Keep filing; the pattern is the point.');
    this._section('The Queued Verse',
      rowEntries(helixVerseRows(ctx?.state), 'verse', WORLD_ROW_COPY_14.verse),
      'No tenth fine has crossed the desk yet. The verse is unauthorized, and it has been for years.');
    this._section('Good Watch',
      rowEntries(coldFourRows(ctx?.state), 'rollcall', WORLD_ROW_COPY_14.rollcall),
      'The derelict drill has not taken your proximity for an audience yet. Fly the cold line at deep night.');
    this._section('The Blind',
      rowEntries(blindRows(ctx?.state), 'blind', WORLD_ROW_COPY_14.blind),
      'No stakeout has drifted under your hull yet. Stay quiet near the Bounty Wrecks field and the band does the talking.');
    this._section('The Crossing',
      rowEntries(rockCrossingRows(ctx?.state), 'crossing', WORLD_ROW_COPY_14.crossing),
      'The Scar lane\u2019s wire posts its crossings one day ahead. The rock keeps the appointment; the wire has never been wrong.');
    this._section('Pour In Thirty',
      rowEntries(pourAnnouncementRows(ctx?.state), 'pour', WORLD_ROW_COPY_14.pour),
      'The forge wire has not called a pour in thirty for you yet. Day 9, before the window — give the spine room regardless.');
    this._section('Captains Of Interest',
      rowEntries(ransomBuoyRows(ctx?.state), 'ransom', WORLD_ROW_COPY_14.ransom),
      'The ransom buoy has not read you the roll yet. The tag lane\u2019s bookkeeping is official and ceaseless.');
    this._section('The Dock Choir',
      rowEntries(dockChoirRows(ctx?.state), 'choir', WORLD_ROW_COPY_14.choir),
      'The Helios apron has not raised its choir for you yet. Inside the approach, listen for the voice that is always slightly behind.');
    this._section('Not A Chain Letter',
      rowEntries(chainLetterRows(ctx?.state), 'chain', WORLD_ROW_COPY_14.chain),
      'No Quiet business has flagged you for the letter yet. You have not read this.');
    this._section('Bay Seven',
      rowEntries(baySevenRows(ctx?.state), 'bay', WORLD_ROW_COPY_14.bay),
      'The wire has not posted bay 7 for you yet. Nothing in bay 7 has ever contradicted the wire.');
    this._section('Dated One Hour Early',
      rowEntries(miraFixesRows(ctx?.state), 'mira', WORLD_ROW_COPY_14.mira),
      'No manifest of yours has corrected itself yet. When it does, the correction was always already filed.');
    this._section('Shelter Advisory',
      rowEntries(shelterAdvisoryRows(ctx?.state), 'advisory', WORLD_ROW_COPY_14.advisory),
      'No surge has been posted for your sector yet. When the wire raises the advisory, the aprons will brighten first.');
    // ── special-500 batch 14b (codex family) ──
    this._section('Between',
      rowEntries(mooringGuestRows(ctx?.state), 'moor', WORLD_ROW_COPY_B.moor),
      'The mooring\u2019s guest book has not taken your hull yet. Settle at the mooring, low and slow, and the book makes room.');
    this._section('The Recommendations',
      rowEntries(stakeBookmarkRows(ctx?.state), 'bookmark', WORLD_ROW_COPY_B.bookmark),
      'AR-3 has not bookmarked your work yet. Two copied pages earn the ribbon; the knot is the Archive\u2019s own.');
    this._section('Two-Credit Truth',
      rowEntries(twoCreditTruthRows(ctx?.state), 'truth', WORLD_ROW_COPY_B.truth),
      'The miners\u2019 corner has not bought you a drink yet. It takes three tired loads in a row for the scale to say so.');
    this._section('The Bargain Light',
      rowEntries(bargainLightRows(ctx?.state), 'bargain', WORLD_ROW_COPY_B.bargain),
      'The Den\u2019s vent spine is dark until Ring Fair. Day 13; the neighbors will not point it out.');
    this._section('Who Folds These',
      rowEntries(paperPlaneRows(ctx?.state), 'plane', WORLD_ROW_COPY_B.plane),
      'The pod bay has not thrown anything today. Day 21, one window, and the wire never mentions it.');
    this._section('The Hum',
      rowEntries(humAtSkerRows(ctx?.state), 'hum', WORLD_ROW_COPY_B.hum),
      'You have not held the bearing yet. Inside the zone, thrust under five percent, thirty seconds — then listen.');
    this._section('Re-Flocked',
      rowEntries(reFlockedRows(ctx?.state), 'flock', WORLD_ROW_COPY_B.flock),
      'No hull has broken near the Broken Shepherd in your presence. The rigs wait either way.');
    this._section('The Still Eye',
      rowEntries(stillEyeRows(ctx?.state), 'eye', WORLD_ROW_COPY_B.eye),
      'The Anvil has not shown you its calm pocket yet. Enter the band and watch for the circle where nothing moves.');
    this._section('Panel Nine',
      rowEntries(panelNineRows(ctx?.state), 'panel', WORLD_ROW_COPY_B.panel),
      'The Slurry Relic has not given up its container yet. Scan it with slurry fresh in your sampling log.');
    this._section('The Mast Prefers You',
      rowEntries(mastPrefersYouRows(ctx?.state), 'mast', WORLD_ROW_COPY_B.mast),
      'The mast has not edited you yet. Three hails inside a minute near it, and the channel learns economy.');
    this._section('The Two Pins',
      rowEntries(twoPinsRows(ctx?.state), 'pins', WORLD_ROW_COPY_B.pins),
      'You have not stood at both ash pins yet. One burned down in Helios; one stands on the Pallas leg of Ceres.');
    this._section('The Sextant',
      rowEntries(starMarkerRows(ctx?.state), 'sextant', WORLD_ROW_COPY_B.sextant),
      'The marker has not taken your two watches yet. Scan it by one phase, then by another, and cross the bearings.');
    this._section('The Audit Trail',
      rowEntries(vanishingFieldRows(ctx?.state), 'field', WORLD_ROW_COPY_B.field),
      'You have not counted the field twice yet. It will be smaller. That is the finding.');
    this._section('The Surveyor\u2019s Last Map',
      rowEntries(surveyorMapRows(ctx?.state), 'chart', WORLD_ROW_COPY_B.chart),
      'The survey wreck\u2019s chart table has not shown you its tallies yet. The dark the Verge-Layers asked about first keeps it lit.');
  },

  _renderDiscoveries(ctx) {
    const state = ctx && ctx.state;
    const gal = galaxyExplorationSummary(state);
    // The survey as the first entry: three hero numbers with a word each, then the one sentence.
    const survey = makeEntry({
      art: { src: SIGNAL_STILLS.anomaly, kind: 'still' },
      id: 'survey',
      name: 'Survey status',
      sub: gal.overallPercent + '% · ' + gal.foundPois + '/' + gal.totalPois + ' sites',
      title: 'Galaxy Cartography & Survey Status',
      meta: 'Survey',
      body: surveyStatusBody(state),
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
      const wreckMatch = /^(?:unique_wreck|wreck):(wreck_[a-z0-9_]+)$/.exec(String(plate.id || ''));
      const wreckArt = wreckMatch && codexWreckArt(wreckMatch[1]);
      const entry = makeEntry({
        art: wreckArt || { src: SIGNAL_STILLS.anomaly, kind: 'still' },
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
      const m = value.match(/^(\S+)\s*(.*)$/);
      if (m) { figure = m[1]; words = (item.key + ' ' + m[2].replace(/[()]/g, '')).trim(); }
      // The reading: "6/11" is six of eleven, "0%" a share.
      let num = figure;
      let of = '';
      let frac = 0;
      const ratio = /^(\d+)\/(\d+)$/.exec(figure);
      const pct = /^(\d+(?:\.\d+)?)%$/.exec(figure);
      if (ratio) { num = ratio[1]; of = '/' + ratio[2]; frac = Number(ratio[2]) > 0 ? Number(ratio[1]) / Number(ratio[2]) : 0; }
      else if (pct) { num = pct[1]; of = '%'; frac = Number(pct[1]) / 100; }
      const cell = el('div', 'cx-index__item');
      cell.dataset.key = item.key.toLowerCase();
      // STATION_STANDARD §4: a catalogue count is a bar + figure, not one dial per section —
      // arcs are for hero gauges. The fraction drives the bar as --cx-p; the figure stays tabular.
      const meter = el('span', 'cx-index__bar');
      meter.setAttribute('aria-hidden', 'true');
      meter.style.setProperty('--cx-p', frac.toFixed(3));
      cell.appendChild(meter);
      // the reading is labelled by its section's name; the rest of the sentence is read, not shown
      const shortWord = item.key;
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
    this._renderTape(sections);
    if (focus) this._showEntry(focus);
    else { this._body.innerHTML = ''; this._shownId = null; }
    this._placeHand();
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
    this._drawWedge();
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
    const filed = el('p', 'cx-chrome cx-reader__filed', [this._activeTab, sectionName].filter(Boolean).join(' · '));
    article.prepend(filed);
    // the entry's place in the open section, as a reading: a thin, large numeral over its title
    const list = this._tapeEntries || [];
    const place = list.indexOf(entry);
    if (place >= 0) {
      const num = el('p', 'cx-chrome cx-reader__num');
      num.setAttribute('aria-hidden', 'true');
      num.appendChild(el('span', 'cx-reader__num-n', pad2(place + 1)));
      num.appendChild(el('span', 'cx-reader__num-of', '/ ' + pad2(list.length)));
      article.insertBefore(num, filed);
    }
    this._paintPlate(entry, fresh);
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

  /**
   * The dial for the entry being read: its art in the aperture (dimmed and blurred behind its cipher
   * when it is locked), the ring of the open section with this entry's arc lit, the engraving.
   */
  _paintPlate(entry, fresh = false) {
    const dial = this._dial;
    if (!dial) return;
    const list = this._tapeEntries || [];
    const at = list.indexOf(entry);
    if (at < 0) { dial.host.hidden = true; if (this._codexRoot) this._codexRoot.dataset.plate = 'off'; return; }
    dial.host.hidden = false;
    if (this._codexRoot) this._codexRoot.dataset.plate = 'on';
    if (dial.plate.classList.contains('is-ledger')) {
      dial.plate.classList.remove('is-ledger');
      dial.plate.tabIndex = 0;
      dial.plate.removeAttribute('aria-disabled');
    }
    if (!this._readIds) this._readIds = new Set();
    if (!entry.locked) this._readIds.add(entry.id);
    const section = this._sectionOf && this._sectionOf.get(entry.id);
    const sectionName = section ? sectionTitle(section.label) : '';
    const art = this._artFor(entry);
    const aperture = dial.aperture;
    aperture.className = 'cx-plate__art' + (art ? ' is-' + art.kind : ' is-empty') + (entry.locked ? ' is-locked' : '');
    const img = aperture.querySelector && aperture.querySelector('img');
    if (art) {
      if (!img || img.getAttribute('src') !== art.src) {
        aperture.textContent = '';
        const pic = el('img');
        pic.alt = '';
        pic.decoding = 'async';
        pic.addEventListener('error', () => { pic.remove(); aperture.className = 'cx-plate__art is-empty'; }, { once: true });
        pic.src = art.src;
        aperture.appendChild(pic);
      }
    } else aperture.textContent = '';
    const parts = entry.locked ? lockedNameParts(entry.id, entry.name) : null;
    // The ring engraving holds ~32 tracked caps characters on its arc (bench: GRAFFITI · BULKHEAD —
    // THE PREVIOUS CREW clipped at both ends); a longer section drops its " — subtitle" tail first,
    // then the line is cut on a word boundary rather than painted past the arc.
    let engraveTop = ['Codex', this._activeTab, sectionName].filter(Boolean).join(' · ');
    if (engraveTop.length > 32 && sectionName) {
      engraveTop = ['Codex', this._activeTab, sectionName.split(' — ')[0].trim()].filter(Boolean).join(' · ');
      if (engraveTop.length > 32) {
        const cut = engraveTop.slice(0, 29);
        engraveTop = cut.slice(0, cut.lastIndexOf(' ')).trimEnd() + '…';
      }
    }
    dial.rings.innerHTML = archivePlateSvg({
      entries: list.map((candidate) => (candidate.locked ? 'locked' : (this._readIds.has(candidate.id) ? 'read' : 'open'))),
      current: at,
      starts: this._tapeStarts || [],
      top: engraveTop,
      bottom: 'Entry ' + pad2(at + 1) + ' of ' + pad2(list.length),
      locked: entry.locked,
      cipher: parts ? (parts.cipher + '  ·  ').repeat(6) : '',
    });
    this._alignReading();
    dial.plate.classList.toggle('is-fresh', !!fresh);
    if (fresh) {
      // replay the arrival (the ring draws, the art opens) on a fresh page
      dial.plate.classList.remove('is-arriving');
      if (typeof dial.plate.getBoundingClientRect === 'function') dial.plate.getBoundingClientRect();
      dial.plate.classList.add('is-arriving');
    }
    this._syncTape();
  },

  /**
   * The reading, the section scale and the entries' rail all stand on the plate's foot: the gap
   * between the stage's bottom and the plate's is measured and handed to the sheet.
   */
  _alignReading() {
    const root = this._codexRoot;
    const host = this._dial && this._dial.host;
    const stage = this._body;
    if (!root || !host || !stage || typeof stage.getBoundingClientRect !== 'function') return;
    if (host.hidden) { if (root.style && typeof root.style.removeProperty === 'function') root.style.removeProperty('--cx-foot-gap'); return; }
    const s = stage.getBoundingClientRect();
    const p = host.getBoundingClientRect();
    if (!(s.height > 0) || !(p.height > 0)) return;
    const z = archiveZoom(stage, s);
    const gap = Math.max(0, Math.round((s.bottom - p.bottom) / z));
    if (root.style && typeof root.style.setProperty === 'function') root.style.setProperty('--cx-foot-gap', gap + 'px');
  },

  /** The produced art an entry stands in the aperture (locked entries show theirs dimmed, blurred). */
  _artFor(entry) {
    const id = String(entry.id || '');
    const figureKey = id.startsWith('figure:') ? id.slice(7) : '';
    if (entry.image) return { src: entry.image, kind: 'photo' };
    const figure = figureArt(figureKey);
    if (figure) return figure;
    const plate = codexPlate(entry);
    if (plate) return { src: plate, kind: 'plate' };
    if (entry.art) return entry.art;
    if (this._activeTab === 'Ship') {
      const hull = flownHullRender(this._ctx && this._ctx.state);
      if (hull) return { src: hull, kind: 'hull' };
    }
    return null;
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
    const turn = entry.article.querySelector && entry.article.querySelector(':scope > .cx-reader__turn');
    if (turn) this._body.appendChild(turn);
    this._watchReadEnd(entry.article, fresh);
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

  /**
   * A reading longer than the column scrolls inside itself: its rail shows where the view sits and
   * its foot fades until the last line is in view (the page turn stays put below it).
   */
  _watchReadEnd(article, fresh = false) {
    if (!article || typeof article.addEventListener !== 'function' || !richDom()) return;
    if (fresh) article.scrollTop = 0;
    const atEnd = () => {
      const end = (Number(article.scrollTop) || 0) + (Number(article.clientHeight) || 0) >= (Number(article.scrollHeight) || 0) - 2;
      article.classList.toggle('is-at-end', end);
    };
    if (!article.__cxReadEnd) {
      article.__cxReadEnd = true;
      article.addEventListener('scroll', atEnd, { passive: true });
    }
    try { syncScrollExtent(article); } catch (_) { /* layout-free host */ }
    atEnd();
  },

  // The 8-beat spine. Beats up to the player's current beatIndex are readable; future beats show
  // only their title with a locked hint (no spoiler of the in-world voice).
  _renderStory(ctx) {
    const s = safeStory(ctx);
    const beat = storyBeatIndex(s);
    // W1 Journey: the eight beats file under the four canon acts. The act row carries the act's
    // goal, verb and one line; the beat rows carry only their own words, never a Phase column.
    for (const act of JOURNEY_ACTS) {
      const entries = [makeEntry({
        id: 'act:' + act.num,
        name: localizeText(act.title),
        sub: localizeText(act.verb),
        meta: 'Act ' + act.num,
        body: localizeText(act.goal) + '\n' + localizeText(act.line),
        signal: act.beats.includes(beat),
      })];
      for (const i of act.beats) {
        const content = BEAT_CONTENT[i];
        if (!content) continue;
        const reached = i <= beat;
        entries.push(makeEntry({
          id: 'beat:' + i,
          name: BEAT_TITLES[i] || ('Beat ' + i),
          sub: reached ? (i === beat ? 'Current beat' : 'Reached') : 'Locked',
          body: reached ? content.hint : '— not yet encountered —',
          locked: !reached,
        }));
      }
      this._section(localizeText(journeyActLabel(act)), entries);
    }

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
      art: { src: senderArt(c.sender), kind: 'station' },
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
        this._section(sectionLabel, [], key === 'traps' ? '— none found yet —' : '— nothing encountered yet —');
        continue;
      }
      this._section(sectionLabel, visible.map((c) => makeEntry({
        art: { src: senderArt(c.sender), kind: 'station' },
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

    const hullRender = flownHullRender(ctx && ctx.state);
    this._section('Bulkhead — The Previous Crew', [makeEntry({
      art: hullRender ? { src: hullRender, kind: 'hull' } : { src: SIGNAL_STILLS.wall, kind: 'still' },
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
      const stationArt = /^station_[a-z0-9_]+$/.test(where) ? STATION_ART_ROOT + where + '.webp' : SIGNAL_STILLS.wall;
      encountered.push(makeEntry({ id: 'graffiti:' + key, name: line, sub: where, meta: where, art: { src: stationArt, kind: 'station' } }));
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
    this._renderRecord(ctx);
  },

  // The Record (THE WORLD REMEMBERS): the newest deeds the world has on file, under one standing
  // strip. recordSectionModel is the pure read; no deeds is one empty line, never a thrown error.
  _renderRecord(ctx) {
    const model = recordSectionModel(ctx && ctx.state);
    if (model.empty) { this._section('The Record', [], model.emptyLine); return; }
    const entry = makeEntry({
      id: 'record:deeds',
      art: codexEntryArt('codex-record'),
      name: 'The Record',
      sub: model.total + (model.total === 1 ? ' deed' : ' deeds'),
      meta: model.standing.map((s) => s.text).join(' \u00b7 '),
    });
    const list = el('ul', 'k-rows');
    list.style.setProperty('--k-row-cols', 'minmax(0, 1fr) minmax(0, 2fr)');
    for (const row of model.rows) {
      const li = el('li', 'k-row k-row--static');
      li.appendChild(el('span', 'k-caps', row.ago + ' \u00b7 ' + row.label));
      const line = el('span', 'k-row__name', row.line);
      if (row.told) line.appendChild(el('span', 'k-caps', ' \u00b7 told'));
      li.appendChild(line);
      list.appendChild(li);
    }
    entry.measure.appendChild(list);
    this._section('The Record', [entry]);
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
      art: codexEntryArt('reference-codes'),
      name: 'Reference Codes',
      sub: REFS.CONTRACT_47A + ' · ' + REFS.REF_44C,
      meta: 'Administrative reference codes',
      body: REFS.CONTRACT_47A + ' — your opening flight assignment in Helios System.\n' +
        REFS.REF_44C + ' — Concord regulatory reference code.',
    })]);

    this._section('Personal Effects', PERSISTENT_CARGO.map((p) => makeEntry({
      id: 'effect:' + p.id,
      art: codexEntryArt(CODEX_CARGO_ART[p.id]),
      name: p.name,
      sub: p.mass + ' t · unsellable',
      meta: p.mass + ' t · unsellable',
      note: p.note,
    })));
  },

  // Catalog tab (PULSE-CODEX): the in-world reference — every commodity, hull, module, weapon,
  // faction, sector, species, and figure as a page that unseals on discovery. codexPagesView is the
  // pure gated read; locked pages render cipher and their honest "how to earn it" line as the note.
  _renderCatalog(ctx) {
    const view = codexPagesView(ctx && ctx.state);
    for (const section of view.sections) {
      const entries = section.pages.map((page) => page.unlocked
        ? makeEntry({
          id: 'catalog:' + section.id + ':' + page.id,
          name: page.name,
          sub: page.tag || section.title,
          meta: page.tag || section.title,
          body: page.body,
        })
        : makeEntry({
          id: 'catalog:' + section.id + ':' + page.id,
          name: page.name,
          sub: 'Not yet filed',
          meta: 'Not yet filed',
          locked: true,
          note: page.hint,
        }));
      this._section(
        section.title + ' (' + section.unlocked + '/' + section.total + ')',
        entries,
        section.line,
      );
    }
  },
};
