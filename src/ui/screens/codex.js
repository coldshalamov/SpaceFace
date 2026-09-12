// Codex / Journal screen (P1-9). Surfaces the ~30KB of authored narrative that was previously
// locked behind ephemeral comms popups (last 80 only, press C). A player can now BROWSE the story
// they've encountered — beats, comms, graffiti, figures, the ship's history — and re-read it any
// time. Discover-as-you-play: entries unlock as the player reaches them (state.story.beatIndex,
// seenComms, graffitiShown), so nothing is spoiled ahead of its beat. Unseen entries show a locked
// placeholder ("— not yet encountered —") rather than the content.
//
// Field Hardware BENCH: stencil title, legend tab keys, engraved index, the focused entry on a
// paper plate. Archive stills are imaged tiles. Built from the produced kit (assets/ui/kit);
// this file owns no stylesheet. The hang holds the search, the eight section keys and the index
// of entry names; the stage holds the one focused entry. Reads state.story + the pure-data
// narrative tables; never mutates sim state.

import { SHIP, COLD_START, REFS, FIGURES, COMMS, GRAFFITI, BEAT_CONTENT, ENDGAME_CHOICES, PERSISTENT_CARGO } from '../../data/narrative.js';
import { TETHYS_BLACK_MARKET_DISCOVERY } from '../../data/frontierRumors.js';
import { explorationDiscoveryPlates, galaxyExplorationSummary } from '../../world/explorationJournal.js';
import { decorateEntityNode } from '../entityResolver.js';
import { MAP_FOCUS, openGalaxyMap } from '../mapAuthority.js';
import { createShipLedgerPanel } from '../shipLedgerPanel.js';
import { el, words, rows, hero, settle, cue } from '../kit/index.js';

const FH_KEY = {
  primary: { file: 'key.primary', width: '18px', minW: '132px', minH: '44px', pad: '0 16px', font: '16px' },
  legend: { file: 'key.legend', width: '14px', minW: '72px', minH: '32px', pad: '0 10px', font: '12px' },
  small: { file: 'key.small', width: '12px', minW: '72px', minH: '28px', pad: '0 8px', font: '12px' },
};
function fhUrl(rel) {
  try { return new URL('../../../assets/ui/kit/assets/' + rel, import.meta.url).href; }
  catch { return 'assets/ui/kit/assets/' + rel; }
}
function forcedColorsActive() {
  return typeof matchMedia === 'function' && matchMedia('(forced-colors: active)').matches;
}
function pin(node, props) {
  if (!node || !node.style || typeof node.style.setProperty !== 'function') return node;
  for (const name of Object.keys(props)) node.style.setProperty(name, props[name], 'important');
  return node;
}
function paintMarking(node) {
  if (!node) return node;
  if (node.classList && typeof node.classList.add === 'function') node.classList.add('fh-title');
  return pin(node, {
    'font-family': 'var(--fh-face-display)',
    'font-variation-settings': "'wght' 900, 'wdth' 125",
    'letter-spacing': 'var(--fh-track-display)',
    'text-transform': 'uppercase',
    'line-height': '0.9',
    color: 'var(--fh-text)',
  });
}
function paintLegend(node, lit = false) {
  if (!node) return node;
  if (node.classList && typeof node.classList.add === 'function') node.classList.add('fh-legend');
  if (typeof node.setAttribute === 'function' && !node.getAttribute('data-fh-lit')) {
    node.setAttribute('data-fh-lit', lit ? 'on' : 'off');
  }
  return pin(node, {
    'font-family': 'var(--fh-face-display)',
    'font-variation-settings': "'wght' 600, 'wdth' 62",
    'letter-spacing': 'var(--fh-track-legend)',
    'text-transform': 'uppercase',
    'font-size': 'var(--fh-size-fine)',
    color: lit ? 'var(--fh-legend-lit, var(--fh-legend))' : 'var(--fh-legend-rest, var(--fh-legend))',
    margin: '0',
  });
}
function paintPlate(node, variant = 'sunk', extra = {}) {
  if (!node) return node;
  const file = variant === 'paper' ? 'plate.bench.paper.png'
    : variant === 'edge' ? 'plate.edge.small.png'
    : 'plate.bench.sunk.png';
  const width = variant === 'edge' ? '16px' : '24px';
  if (node.classList && typeof node.classList.add === 'function') {
    node.classList.add('fh-plate', variant === 'paper' ? 'fh-plate--paper'
      : variant === 'edge' ? 'fh-plate--edge' : 'fh-plate--sunk');
  }
  if (forcedColorsActive()) {
    return pin(node, {
      'border-image-source': 'none', 'border-width': '1px', 'border-style': 'solid',
      background: 'transparent', ...extra,
    });
  }
  return pin(node, {
    'border-style': 'solid',
    'border-width': width,
    'border-image-source': 'url("' + fhUrl('plates/' + file) + '")',
    'border-image-slice': (variant === 'edge' ? '16' : '24') + ' fill',
    'border-image-repeat': 'stretch',
    'border-image-width': width,
    background: 'transparent',
    'box-sizing': 'border-box',
    padding: '10px 14px',
    ...(variant === 'paper' ? { color: '#22201C' } : {}),
    ...extra,
  });
}
function paintInput(input) {
  if (!input) return input;
  if (input.classList && typeof input.classList.add === 'function') input.classList.add('fh-input');
  const apply = (state) => {
    if (forcedColorsActive()) {
      pin(input, { 'border-image-source': 'none', 'border-bottom': '1px solid CanvasText', background: 'transparent' });
      return;
    }
    pin(input, {
      'border-style': 'solid',
      'border-width': '12px',
      'border-image-source': 'url("' + fhUrl('controls/input.underline.' + state + '.png') + '")',
      'border-image-slice': '12 fill',
      'border-image-repeat': 'stretch',
      'border-image-width': '12px',
      background: 'transparent',
      color: 'var(--fh-text)',
      'min-height': '40px',
      padding: '0 8px',
      'box-sizing': 'border-box',
    });
  };
  apply('rest');
  if (input.dataset && input.dataset.fhBound !== '1') {
    input.dataset.fhBound = '1';
    input.addEventListener('focus', () => apply('focus'));
    input.addEventListener('blur', () => apply('rest'));
  }
  return input;
}
function paintKey(button, kind = 'legend') {
  if (!button) return button;
  const spec = FH_KEY[kind] || FH_KEY.legend;
  if (button.classList && typeof button.classList.add === 'function') {
    button.classList.add('k-word', 'fh-key', 'fh-key--' + kind);
  }
  const apply = (state) => {
    if (forcedColorsActive()) {
      pin(button, {
        'border-image-source': 'none', 'border-width': '1px', 'border-style': 'solid',
        background: 'transparent', color: 'CanvasText',
      });
      return;
    }
    pin(button, {
      display: 'inline-flex',
      width: 'max-content',
      'max-width': '100%',
      'min-width': spec.minW,
      'min-height': spec.minH,
      padding: spec.pad,
      'font-size': spec.font,
      'font-family': 'var(--fh-face-display)',
      'font-variation-settings': "'wght' 600, 'wdth' 62",
      'letter-spacing': 'var(--fh-track-legend)',
      'text-transform': 'uppercase',
      'justify-content': 'center',
      'align-items': 'center',
      'box-sizing': 'border-box',
      background: 'transparent',
      color: 'var(--fh-text)',
      'border-style': 'solid',
      'border-width': spec.width,
      'border-image-source': 'url("' + fhUrl('keys/' + spec.file + '.' + state + '.png') + '")',
      'border-image-slice': parseInt(spec.width, 10) + ' fill',
      'border-image-repeat': 'stretch',
      'border-image-width': spec.width,
    });
  };
  const sync = () => {
    const disabled = button.getAttribute && (button.getAttribute('aria-disabled') === 'true' || button.disabled);
    const lit = button.getAttribute && (
      button.getAttribute('aria-pressed') === 'true'
      || button.getAttribute('aria-selected') === 'true'
      || button.getAttribute('aria-current') === 'true'
    );
    apply(disabled ? 'disabled' : (kind === 'legend' && lit ? 'lit' : 'rest'));
  };
  button._fhSync = sync;
  if (!(button.dataset && button.dataset.fhBound === '1')) {
    if (button.dataset) button.dataset.fhBound = '1';
    button.addEventListener('pointerenter', () => {
      if (button.getAttribute && (button.getAttribute('aria-disabled') === 'true' || button.disabled)) return;
      apply(kind === 'legend' && button.getAttribute && (button.getAttribute('aria-selected') === 'true' || button.getAttribute('aria-current') === 'true') ? 'lit' : 'hover');
    });
    button.addEventListener('pointerleave', sync);
    button.addEventListener('pointerdown', () => {
      if (button.getAttribute && (button.getAttribute('aria-disabled') === 'true' || button.disabled)) return;
      apply(kind === 'legend' ? 'hover' : 'pressed');
    });
    button.addEventListener('pointerup', sync);
    button.addEventListener('focus', () => {
      if (button.getAttribute && (button.getAttribute('aria-disabled') === 'true' || button.disabled)) return;
      apply('hover');
    });
    button.addEventListener('blur', sync);
  }
  sync();
  return button;
}
function paintRow(row, selected) {
  if (!row) return row;
  if (row.classList && typeof row.classList.add === 'function') {
    row.classList.add('fh-row');
    if (typeof row.classList.toggle === 'function') row.classList.toggle('is-selected', !!selected);
    else if (selected) row.classList.add('is-selected');
    else if (typeof row.classList.remove === 'function') row.classList.remove('is-selected');
  }
  if (selected && !forcedColorsActive()) {
    return pin(row, {
      'border-style': 'solid',
      'border-width': '8px 16px',
      'border-image-source': 'url("' + fhUrl('plates/plate.row.selected.png') + '")',
      'border-image-slice': '8 16 8 16 fill',
      'border-image-repeat': 'stretch',
      'border-image-width': '8px 16px',
      'box-shadow': 'none',
      background: 'transparent',
      color: 'var(--fh-text)',
    });
  }
  return pin(row, {
    border: '0',
    'box-shadow': 'none',
    'background-image': 'url("' + fhUrl('tiles/tile.etch.hairline.png') + '")',
    'background-repeat': 'repeat-x',
    'background-position': 'bottom left',
    'background-color': 'transparent',
    color: 'var(--fh-text-resting)',
  });
}
function paintTile(button, selected) {
  if (!button) return button;
  if (button.classList && typeof button.classList.add === 'function') button.classList.add('fh-tile');
  const src = selected
    ? fhUrl('windows/window.viewport.png')
    : fhUrl('windows/window.glass.png');
  if (forcedColorsActive()) {
    return pin(button, {
      'border-image-source': 'none', 'border-width': '1px', 'border-style': 'solid',
      background: 'transparent', color: 'CanvasText',
    });
  }
  return pin(button, {
    display: 'grid',
    'grid-template-rows': '1fr auto',
    'min-width': '168px',
    'min-height': '132px',
    padding: '0',
    cursor: 'pointer',
    'box-sizing': 'border-box',
    background: 'transparent',
    color: selected ? 'var(--fh-text)' : 'var(--fh-text-resting)',
    'border-style': 'solid',
    'border-width': '20px',
    'border-image-source': 'url("' + src + '")',
    'border-image-slice': '20 fill',
    'border-image-repeat': 'stretch',
    'border-image-width': '20px',
  });
}

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

/**
 * One codex entry: a name (and its sub line) for the hang's index, and the article the stage shows
 * when the entry is focused. The article keeps `.sf-codex-entry` as an inert hook; inside it the
 * title at screen-title size, the meta in fine print, the body as sentences inside a measure, the
 * note as the emphasised sentence under a hairline. `signal` marks the filed endgame choice.
 */
function makeEntry({ id, name, sub = '', title = null, meta = null, body = '', note = '', noteBad = false, signal = false, locked = false, image = null }) {
  const article = el('article', 'sf-codex-entry fh-plate fh-plate--paper');
  paintPlate(article, 'paper');
  if (typeof image === 'string' && image) {
    const img = el('img');
    img.src = image;
    img.alt = title != null ? title : name;
    img.style.height = '320px';
    article.appendChild(img);
  }
  const heading = el('h2', 'k-display k-t-title fh-title');
  paintMarking(heading);
  pin(heading, { color: '#22201C' });
  heading.appendChild(el('span', signal ? 'k-signal' : (locked ? 'k-38' : ''), title != null ? title : name));
  article.appendChild(heading);
  if (meta != null && meta !== '') {
    const metaEl = el('p', 'k-t-fine k-38 fh-legend');
    paintLegend(metaEl, false);
    if (typeof meta === 'string') metaEl.textContent = meta;
    else metaEl.appendChild(meta);
    article.appendChild(metaEl);
  }
  const measure = el('div', 'k-measure fh-body');
  pin(measure, { color: '#22201C', 'max-width': '64ch' });
  for (const para of String(body || '').split('\n')) {
    if (para.trim()) measure.appendChild(el('p', 'k-sentence' + (locked ? ' k-38' : ''), para));
  }
  if (note) {
    if (measure.childNodes.length) measure.appendChild(el('hr', 'k-rule'));
    measure.appendChild(el('p', 'k-sentence k-sentence--emph' + (noteBad ? ' k-bad' : ''), note));
  }
  article.appendChild(measure);
  return { id, name, sub, signal, locked, article, measure, requested: false };
}

export const codexScreen = {
  id: 'codex',
  _activeTab: 'Story',
  _query: '',

  mount(rootEl, ctx) {
    rootEl.innerHTML = '';
    rootEl.classList.remove('panel', 'sf-menu', 'sf-menu-wide', 'sf-codex');
    rootEl.classList.add('k-screen', 'of-codex');
    rootEl.dataset.kReady = '0';
    delete rootEl.dataset.stamp;
    rootEl.setAttribute('data-fh-register', 'bench');
    rootEl.setAttribute('aria-label', 'Codex');
    pin(rootEl, { background: 'transparent' });

    // Title: "Codex" and the live tab's one line.
    const title = el('header', 'k-title');
    const heading = el('h1', 'k-display k-t-title', 'Codex');
    paintMarking(heading);
    title.appendChild(heading);
    const tabLine = el('p', 'k-t-emph k-62 fh-legend', TAB_LINES[this._activeTab] || '');
    paintLegend(tabLine, true);
    title.appendChild(tabLine);
    rootEl.appendChild(title);
    this._tabLine = tabLine;

    // The stage: the focused entry (or the Signal Archive row, or the Ledger panel).
    const stage = el('div', 'k-stage k-stage--scroll');
    stage.id = 'sf-codex-stage';
    stage.setAttribute('role', 'tabpanel');

    // The hang: the search, the eight section keys, then the index of entry names.
    const hang = el('div', 'k-hang');
    pin(hang, { position: 'relative', background: 'transparent' });
    const rail = el('div', 'fh-rail');
    rail.setAttribute('aria-hidden', 'true');
    pin(rail, { position: 'absolute', inset: '0 auto 0 0', width: '28px', 'pointer-events': 'none' });
    hang.appendChild(rail);
    const searchWrap = el('div');
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
    paintInput(search);
    searchWrap.appendChild(search);
    hang.appendChild(searchWrap);
    this._search = search;
    this._searchWrap = searchWrap;

    // `dom.words` owns the arrow-key roving; the list is the tablist and each word a tab
    // (`.sf-tabbar` / `.sf-tab` kept as hooks — the ledger route harness clicks them by text).
    const bar = words(TABS.map((t) => ({ action: t, label: t, current: t === this._activeTab })), {
      row: true, size: 'emph', ariaLabel: 'Codex sections',
      onPick: (t) => { this._activeTab = t; this._render(ctx); },
    });
    bar.classList.add('sf-tabbar');
    bar.setAttribute('role', 'tablist');
    pin(bar, { gap: '6px', 'align-items': 'stretch', 'flex-wrap': 'wrap' });
    this._tabBtns = {};
    for (const b of bar.querySelectorAll('.k-word')) {
      const t = b.dataset.action;
      b.classList.add('sf-tab');
      b.id = 'sf-codex-tab-' + t.toLowerCase();
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', stage.id);
      b.parentElement.setAttribute('role', 'presentation');
      paintKey(b, 'legend');
      this._tabBtns[t] = b;
    }
    hang.appendChild(bar);

    const index = el('div');
    hang.appendChild(index);
    rootEl.appendChild(hang);
    rootEl.appendChild(stage);
    this._index = index;
    this._body = stage;

    // Foot: Close as a key; the unlock-status strip in fine print beside it.
    const foot = el('footer', 'k-foot');
    const close = el('button', 'k-word k-word--emph', 'Close');
    close.type = 'button'; close.dataset.action = 'close';
    paintKey(close, 'primary');
    close.addEventListener('click', () => { cue('confirm'); nav(ctx, 'popScreen'); });
    foot.appendChild(close);
    const statusWrap = el('div');
    statusWrap.setAttribute('aria-label', 'Codex unlock status');
    foot.appendChild(statusWrap);
    rootEl.appendChild(foot);
    this._status = statusWrap;

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

  refresh(ctx) { this._ctx = ctx; if (this._body) this._render(ctx); },
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
      if (typeof b._fhSync === 'function') b._fhSync();
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
    this._status.innerHTML = '';
    this._sections = [];
    this._entries = [];
    this._syncTabs();
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
    if (!isChromeLess) this._applySearchFilter();
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
    const article = el('article', 'sf-codex-entry fh-plate fh-plate--sunk');
    paintPlate(article, 'sunk');
    const heading = el('h2', 'k-display k-t-title fh-title', 'Signal Archive');
    paintMarking(heading);
    article.appendChild(heading);
    const count = el('p', 'k-t-fine k-38 fh-legend', SIGNAL_ARCHIVE.length + ' recovered signals');
    paintLegend(count, false);
    article.appendChild(count);
    article.appendChild(el('p', 'k-sentence fh-body', 'Recovered transmission stills from the Reach corridor. Select a signal to replay its clip.'));
    const row = el('ul', 'k-words k-words--row fh-cluster');
    row.setAttribute('aria-label', 'Signal Archive');
    pin(row, { gap: '12px', 'align-items': 'stretch' });
    for (const c of SIGNAL_ARCHIVE) {
      const item = el('li');
      pin(item, { display: 'flex', 'flex-direction': 'column', gap: '8px' });
      const still = el('button', 'fh-tile');
      still.type = 'button';
      still.setAttribute('aria-label', 'Play signal ' + c.id + ': ' + c.title);
      paintTile(still, false);
      const art = el('span', 'fh-tile-art');
      const img = el('img');
      img.src = c.poster;
      img.alt = c.title;
      pin(img, { height: '120px', width: '100%', 'object-fit': 'cover' });
      art.appendChild(img);
      still.appendChild(art);
      still.appendChild(el('span', 'fh-tile-legend', c.title));
      still.addEventListener('click', () => { cue('confirm'); this._playCinematic(c.video, c.title); });
      item.appendChild(still);
      item.appendChild(el('div', 'k-t-fine k-38 fh-fine', c.caption));
      const play = el('button', 'k-word k-word--fine', 'Play');
      play.type = 'button';
      play.dataset.action = 'play:' + c.id;
      play.setAttribute('aria-label', 'Play signal ' + c.id + ': ' + c.title);
      paintKey(play, 'small');
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
        const returnToTethys = el('button', 'k-word k-word--emph k-word--primary', 'Show Tethys Trade Hub');
        returnToTethys.type = 'button';
        returnToTethys.dataset.action = 'tethys-return';
        returnToTethys.setAttribute('aria-label', 'Show Tethys Trade Hub on the map');
        paintKey(returnToTethys, 'primary');
        returnToTethys.addEventListener('click', () => { cue('confirm'); openTethysCodexReturn(ctx, plate); });
        entry.article.appendChild(returnToTethys);
      }
      entries.push(entry);
    }
    this._section('Exploration Plates', entries);
  },

  // The unlock-status strip: the heading in caps, the counts in one fine line, the note beneath.
  _renderStatus(ctx) {
    const summary = codexProgressSummary(safeStory(ctx), ctx && ctx.state);
    const box = this._status;
    box.innerHTML = '';
    const cap = el('div', 'k-caps fh-legend', 'Codex Unlock Status');
    paintLegend(cap, true);
    box.appendChild(cap);
    // "Phase 1" already names its key; every other value is prefixed with its key word.
    box.appendChild(el('p', 'k-t-fine k-62 fh-fine', summary.items
      .map((item) => (String(item.value).startsWith(item.key) ? item.value : item.key + ' ' + item.value))
      .join(' · ')));
    box.appendChild(el('p', 'k-t-fine k-38 k-measure fh-body', summary.note));
  },

  // The index: a caps row per section and a hairline row per entry that matches the search (the
  // whole entry text, not only its name), then the focused entry on the stage. Locked future
  // content is never built, so it can never match.
  _applySearchFilter() {
    if (!this._index || !this._body) return;
    const query = normalizeSearch(this._query);
    const sections = this._sections.map((section) => ({
      ...section,
      entries: query
        ? section.entries.filter((entry) => normalizeSearch(entry.article.textContent).includes(query))
        : section.entries,
    }));
    const visible = sections.flatMap((section) => section.entries);
    this._index.innerHTML = '';
    if (query && !visible.length) {
      this._index.appendChild(el('p', 'k-empty', 'No matching unlocked entries.'));
      this._body.innerHTML = '';
      return;
    }
    const remembered = this._focusByTab[this._activeTab];
    const focus = visible.find((entry) => entry.id === remembered) || visible[0] || null;
    if (focus) this._focusByTab[this._activeTab] = focus.id;

    const list = rows(visible.map((entry) => ({
      id: entry.id, name: entry.name, sub: entry.sub, num: '', selected: focus && entry.id === focus.id,
    })), { ariaLabel: this._activeTab + ' entries', onPick: (id) => this._focus(id) });
    // A signal name for the filed choice, a 38 % name for a locked entry: nested spans, since the
    // row's own name rule outranks the colour classes.
    for (const row of list.querySelectorAll('.k-row')) {
      const entry = visible.find((candidate) => candidate.id === row.dataset.id);
      paintRow(row, !!(entry && focus && entry.id === focus.id));
      if (!entry || (!entry.signal && !entry.locked)) continue;
      const name = row.querySelector('.k-row__name');
      if (!name) continue;
      name.textContent = '';
      name.appendChild(el('span', entry.signal ? 'k-signal' : 'k-38', entry.name));
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
      const cap = el('span', 'k-caps fh-legend', section.label);
      paintLegend(cap, true);
      header.appendChild(cap);
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
    if (focus) this._showEntry(focus);
    else this._body.innerHTML = '';
  },

  _focus(id) {
    const entry = (this._entries || []).find((candidate) => candidate.id === id);
    if (!entry) return;
    this._focusByTab[this._activeTab] = id;
    if (this._list) {
      for (const row of this._list.querySelectorAll('.k-row[data-id]')) {
        const on = row.dataset.id === id;
        row.setAttribute('aria-selected', String(on));
        paintRow(row, on);
      }
    }
    this._showEntry(entry);
  },

  _showEntry(entry) {
    this._body.innerHTML = '';
    this._body.appendChild(entry.article);
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
