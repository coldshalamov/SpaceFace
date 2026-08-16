// Codex / Journal screen (P1-9). Surfaces the ~30KB of authored narrative that was previously
// locked behind ephemeral comms popups (last 80 only, press C). A player can now BROWSE the story
// they've encountered — beats, comms, graffiti, figures, the ship's history — and re-read it any
// time. Discover-as-you-play: entries unlock as the player reaches them (state.story.beatIndex,
// seenComms, graffitiShown), so nothing is spoiled ahead of its beat. Unseen entries show a locked
// placeholder ("— not yet encountered —") rather than the content.
//
// Mirrors the Help screen's shell (sf-menu / tabbar / search) for visual + a11y consistency. Reads
// state.story + the pure-data narrative tables; never mutates sim state.

import { SHIP, COLD_START, REFS, FIGURES, COMMS, GRAFFITI, BEAT_CONTENT, ENDGAME_CHOICES, KURTZ, PERSISTENT_CARGO } from '../../data/narrative.js';
import { TETHYS_BLACK_MARKET_DISCOVERY } from '../../data/frontierRumors.js';
import {
  DOUBLE_WRECK_BLACK_BOXES,
  DOUBLE_WRECK_SHAPE_ID,
} from '../../data/doubleWreckBlackBoxes.js';
import { explorationDiscoveryPlates } from '../../world/explorationJournal.js';
import { MAP_FOCUS, openGalaxyMap } from '../mapAuthority.js';
import { createShipLedgerPanel } from './shipLedger.js';
import { ARCADE_VERB_BEATS, arcadeVerbStatus } from '../../data/onboardingVerbs.js';
import { launchAces } from '../../data/namedAces.js';

const STYLE_ID = 'sf-codex-style';

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

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  // Codex-specific entry/archive styles only. The shared menu fascia (plate, buttons,
  // headings, tabs, form primitives) lives in styles/menu.css; under the .sf-menu scope the
  // legacy token names below already resolve to the warm fascia palette.
  s.textContent = `
  .sf-codex-entry { padding:12px 14px; border:1px solid var(--panel-edge, #3b403f);
    border-radius:2px; background:rgba(12,14,15,.55); margin-bottom:10px; }
  .sf-codex-entry h3 { margin:0 0 4px; font-size:14px; color:var(--accent, #db9838); letter-spacing:.04em; }
  .sf-codex-entry .sf-codex-meta { font-size:11px; color:var(--ink-mute, #8a877d);
    font-family:var(--mono, monospace); letter-spacing:.06em; margin-bottom:6px; text-transform:uppercase; }
  .sf-codex-entry .sf-codex-body { font-size:13.5px; line-height:1.5; color:var(--ink, #f1ede2); }
  .sf-codex-entry .sf-codex-note { font-size:11.5px; line-height:1.45; color:var(--ink-dim, #b3afa2);
    font-style:italic; margin-top:8px; border-top:1px dashed rgba(150,140,120,.18); padding-top:6px; }
  .sf-codex-entry:focus { outline:2px solid var(--accent-3, #ffc064); outline-offset:2px;
    border-color:var(--accent, #db9838); }
  .sf-codex-locked { opacity:.45; font-style:italic; color:var(--ink-mute, #8a877d); }
  .sf-codex-graffiti { font-family:var(--mono, monospace); letter-spacing:.08em; text-transform:uppercase;
    font-size:13px; color:var(--ink, #f1ede2); }
  .sf-codex-empty { color:var(--ink-mute, #8a877d); font-style:italic; padding:24px; text-align:center; }
  .sf-codex-beat { border-left:3px solid var(--accent, #db9838); }
  .sf-codex-beat.current { box-shadow:0 0 12px rgba(219,152,56,.18); border-color:var(--accent-3, #ffc064); }
  .sf-codex-section-h { font-size:11px; letter-spacing:.16em; text-transform:uppercase;
    color:var(--ink-dim, #b3afa2); margin:14px 0 6px; }
  .sf-codex-status { margin:0 0 12px; padding:10px 12px; border:1px solid rgba(219,152,56,.30);
    border-radius:2px; background:linear-gradient(90deg, rgba(219,152,56,.10), rgba(12,14,15,.58)); }
  .sf-codex-status-title { color:var(--accent, #db9838); font-family:var(--mono, monospace);
    font-size:11px; letter-spacing:.14em; text-transform:uppercase; margin-bottom:8px; }
  .sf-codex-status-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr)); gap:7px; }
  .sf-codex-status-item { border:1px solid rgba(150,140,120,.16); border-radius:2px; padding:7px 8px;
    background:rgba(12,14,15,.38); }
  .sf-codex-status-k { color:var(--ink-mute, #8a877d); font-family:var(--mono, monospace);
    font-size:10px; letter-spacing:.10em; text-transform:uppercase; }
  .sf-codex-status-v { color:var(--ink, #f1ede2); font-size:13px; margin-top:2px; }
  .sf-codex-status-note { color:var(--ink-dim, #b3afa2); font-size:11.5px; line-height:1.35; margin-top:8px; }
  .sf-codex-search { width:100%; box-sizing:border-box; margin:8px 0 2px; padding:9px 11px;
    color:var(--ink, #f1ede2); background:rgba(12,14,15,.72);
    border:1px solid var(--panel-edge, #3b403f); border-radius:2px;
    font-family:var(--mono, monospace); font-size:12px; letter-spacing:.04em; pointer-events:auto; }
  .sf-codex-search:focus { outline:none; border-color:var(--accent, #db9838);
    box-shadow:0 0 0 2px rgba(219,152,56,.14); }
  .sf-arch-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:14px; }
  .sf-arch-card { display:flex; flex-direction:column; padding:0; text-align:left; overflow:hidden;
    border:1px solid var(--panel-edge, #3b403f); border-radius:3px; background:rgba(12,14,15,.55);
    cursor:pointer; pointer-events:auto; transition:border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
  .sf-arch-card:hover, .sf-arch-card:focus-visible { border-color:var(--accent, #db9838);
    box-shadow:0 0 16px rgba(219,152,56,.22); transform:translateY(-2px); outline:none; }
  .sf-arch-thumb { position:relative; aspect-ratio:16/9; background-size:cover; background-position:center;
    background-color:#070809; }
  .sf-arch-play { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
    font-size:34px; color:#f1ede2; text-shadow:0 0 14px rgba(219,152,56,.8); opacity:.82;
    background:radial-gradient(circle at center, rgba(5,6,7,.15), rgba(5,6,7,.55)); transition:opacity .16s ease; }
  .sf-arch-card:hover .sf-arch-play, .sf-arch-card:focus-visible .sf-arch-play { opacity:1; }
  .sf-arch-meta { padding:10px 12px; }
  .sf-arch-title { font-size:13.5px; color:var(--accent, #db9838); letter-spacing:.06em;
    text-transform:uppercase; font-family:var(--mono, monospace); }
  .sf-arch-cap { font-size:12px; line-height:1.4; color:var(--ink-dim, #b3afa2); margin-top:4px; }
  `;
  document.head.appendChild(s);
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function shell(rootEl, title, extraClass) {
  rootEl.innerHTML = '';
  rootEl.classList.add('panel', 'sf-menu');
  if (extraClass) rootEl.classList.add(extraClass);
  // Diegetic fascia stamp (styles/menu.css .sf-menu::before reads it).
  rootEl.dataset.stamp = 'SIGNAL ARCHIVE / CODEX';
  const h = document.createElement('h1');
  h.textContent = title;
  rootEl.appendChild(h);
  const body = document.createElement('div');
  body.className = 'sf-col';
  rootEl.appendChild(body);
  return { panel: rootEl, body };
}

const TABS = ['Story', 'Aces', 'Verbs', 'Comms', 'Discoveries', 'Black Boxes', 'Graffiti', 'Figures', 'Ship', 'Archive', 'Ledger'];

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
  const current = (ctx.state && ctx.state.story)
    || { beatIndex: 0, seenComms: {}, graffitiShown: {}, endgameChoice: null, flags: {} };
  const legacy = current.newGamePlus && current.newGamePlus.codex;
  if (!legacy || typeof legacy !== 'object') return current;
  const currentRare = current.flags && current.flags.rareSpawns || {};
  const legacyRare = legacy.rareSpawns || {};
  return {
    ...current,
    beatIndex: Math.max(Number(current.beatIndex) || 0, Number(legacy.beatIndex) || 0),
    seenComms: { ...(legacy.seenComms || {}), ...(current.seenComms || {}) },
    graffitiShown: { ...(legacy.graffitiShown || {}), ...(current.graffitiShown || {}) },
    endgameChoice: current.endgameChoice || legacy.endgameChoice || null,
    persistentCargo: [...new Set([...(legacy.persistentCargo || []), ...(current.persistentCargo || [])])],
    flags: {
      ...(current.flags || {}),
      rareSpawns: {
        ...currentRare,
        history: [...(legacyRare.history || []), ...(currentRare.history || [])].slice(-64),
      },
    },
  };
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

export function codexProgressSummary(story = {}) {
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
  return {
    beat,
    phase,
    note: 'Locked counts mean future entries are intentionally hidden until story progress, encounter flags, or conditional signal triggers reveal them.',
    items: [
      { key: 'Story', value: storyUnlocked + '/' + BEAT_CONTENT.length + ' beats' },
      { key: 'Comms', value: commsUnlocked + '/' + commsTotal + ' unlocked' },
      { key: 'Figures', value: figureUnlocked + '/' + figureTotal + ' known' },
      { key: 'Graffiti', value: graffitiUnlocked + '/' + graffitiTotal + ' encountered' },
      { key: 'Endgame', value: endgameUnlocked + '/' + ENDGAME_CHOICES.length + ' revealed' },
      { key: 'Phase', value: 'Phase ' + phase },
    ],
  };
}

export function doubleWreckBlackBoxRecords(story = {}) {
  const byEncounter = new Map();
  const ensureGroup = (encounterId, source = {}) => {
    let group = byEncounter.get(encounterId);
    if (!group) {
      group = {
        encounterId,
        sectorId: source.sectorId || null,
        zoneId: source.zoneId || null,
        boxesBySide: new Map(),
      };
      byEncounter.set(encounterId, group);
    }
    return group;
  };
  const history = story && story.flags && story.flags.rareSpawns
    && story.flags.rareSpawns.history;
  const historyRows = Array.isArray(history) ? history : [];
  for (const receipt of historyRows) {
    if (!receipt || receipt.kind !== 'black_box' || receipt.shapeId !== DOUBLE_WRECK_SHAPE_ID
      || (receipt.blackBoxSide !== 'a' && receipt.blackBoxSide !== 'b')) continue;
    const group = ensureGroup(receipt.encounterId, receipt);
    if (!group.boxesBySide.has(receipt.blackBoxSide)) {
      group.boxesBySide.set(receipt.blackBoxSide, receipt);
    }
  }
  const cargoOrderByEncounter = new Map();
  const cargo = Array.isArray(story && story.persistentCargo) ? story.persistentCargo : [];
  for (const cargoId of cargo) {
    const match = /^rare_black_box:double-([ab]):(.+)$/.exec(String(cargoId || ''));
    if (!match) continue;
    const [, side, encounterId] = match;
    const recoveredOrder = (cargoOrderByEncounter.get(encounterId) || 0) + 1;
    cargoOrderByEncounter.set(encounterId, recoveredOrder);
    const group = ensureGroup(encounterId);
    if (!group.boxesBySide.has(side)) {
      group.boxesBySide.set(side, {
        kind: 'black_box',
        shapeId: DOUBLE_WRECK_SHAPE_ID,
        encounterId,
        blackBoxSide: side,
        cargoId,
        recoveredOrder,
      });
    }
  }
  return Array.from(byEncounter.values()).map((group) => {
    const boxes = Array.from(group.boxesBySide.values())
      .sort((a, b) => (a.recoveredOrder | 0) - (b.recoveredOrder | 0));
    const logs = DOUBLE_WRECK_BLACK_BOXES
      .filter((box) => group.boxesBySide.has(box.side))
      .flatMap((box) => box.logs.map((entry) => ({ ...entry, side: box.side, boxTitle: box.title })))
      .sort((a, b) => a.sequence - b.sequence);
    return {
      encounterId: group.encounterId,
      sectorId: group.sectorId,
      zoneId: group.zoneId,
      recoveredCount: boxes.length,
      complete: boxes.length === DOUBLE_WRECK_BLACK_BOXES.length,
      recoveryOrder: boxes.map((box) => box.blackBoxSide),
      boxes: boxes.map((box) => ({ ...box })),
      logs,
    };
  });
}

function normalizeSearch(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export const codexScreen = {
  id: 'codex',
  _activeTab: 'Story',
  _query: '',

  mount(rootEl, ctx) {
    injectStyle();
    shell(rootEl, 'Codex', 'sf-menu-wide');

    const bar = el('div', 'sf-tabbar');
    this._tabBtns = {};
    TABS.forEach((t) => {
      const b = el('button', 'sf-tab', t);
      b.addEventListener('click', () => { this._activeTab = t; this._render(ctx); });
      bar.appendChild(b);
      this._tabBtns[t] = b;
    });
    rootEl.appendChild(bar);

    const search = el('input', 'sf-codex-search');
    search.type = 'search';
    search.placeholder = 'Search Codex';
    search.setAttribute('aria-label', 'Search Codex');
    search.value = this._query;
    search.addEventListener('input', () => {
      this._query = search.value || '';
      this._render(ctx);
    });
    rootEl.appendChild(search);
    this._search = search;

    const body = el('div', 'sf-col');
    body.style.overflowY = 'auto';
    body.style.flex = '1';
    body.style.minHeight = '0';
    rootEl.appendChild(body);
    this._body = body;

    const foot = el('div', 'sf-foot');
    const close = el('button', 'sf-btn', 'Close'); close.style.width = 'auto';
    close.addEventListener('click', () => nav(ctx, 'popScreen'));
    foot.appendChild(close);
    rootEl.appendChild(foot);

    this._ctx = ctx;
    this._visible = false;
    this._unsubs = [];
    const refreshIfVisible = () => { if (this._visible && this._body) this._render(this._ctx); };
    this._unsubs.push(ctx.bus.on('story:beatAdvanced', refreshIfVisible));
    this._unsubs.push(ctx.bus.on('comms:popup', refreshIfVisible));
    this._unsubs.push(ctx.bus.on('graffiti:show', refreshIfVisible));
    this._unsubs.push(ctx.bus.on('discovery:plateUnlocked', refreshIfVisible));
    this._unsubs.push(ctx.bus.on('codex:blackBoxRecovered', refreshIfVisible));
    this._unsubs.push(ctx.bus.on('aceMemory:transition', refreshIfVisible));
    this._unsubs.push(ctx.bus.on('aceMemory:rewardUnlocked', refreshIfVisible));

    this._render(ctx);
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
  },
  onHide() {
    this._visible = false;
    // Release the ledger's image request when the codex hides; no rebuild happens here.
    if (this._ledgerPanel) { try { this._ledgerPanel.onHide(); } catch (_) {} }
  },

  _render(ctx) {
    if (!this._body) return;
    // The Ledger tab owns its own page cursor and evidence-detail subtree. An unrelated refresh
    // (story/comms/graffiti event) must not tear that local state down: if the Ledger panel is
    // already mounted in the body, only refresh tab-button active styling and return.
    if (this._activeTab === 'Ledger' && this._ledgerPanel && this._ledgerPanel.el
        && this._ledgerPanel.el.parentNode === this._body) {
      for (const t of TABS) if (this._tabBtns[t]) this._tabBtns[t].classList.toggle('active', t === this._activeTab);
      return;
    }
    // Leaving the Ledger tab: destroy its panel so no listener or image lingers off-tab.
    if (this._activeTab !== 'Ledger' && this._ledgerPanel) {
      try { this._ledgerPanel.destroy(); } catch (_) {}
      this._ledgerPanel = null;
    }
    this._body.innerHTML = '';
    for (const t of TABS) {
      if (this._tabBtns[t]) this._tabBtns[t].classList.toggle('active', t === this._activeTab);
    }
    // Archive + Ledger are media/panel surfaces, not searchable narrative — hide the chrome.
    const isChromeLess = this._activeTab === 'Archive' || this._activeTab === 'Ledger';
    if (this._search) {
      this._search.style.display = isChromeLess ? 'none' : '';
      if (!isChromeLess && this._search.value !== this._query) this._search.value = this._query;
    }
    if (!isChromeLess) this._renderStatus(ctx);
    switch (this._activeTab) {
      case 'Story':    this._renderStory(ctx); break;
      case 'Aces':     this._renderAces(ctx); break;
      case 'Verbs':    this._renderVerbs(ctx); break;
      case 'Comms':    this._renderComms(ctx); break;
      case 'Discoveries': this._renderDiscoveries(ctx); break;
      case 'Black Boxes': this._renderBlackBoxes(ctx); break;
      case 'Graffiti': this._renderGraffiti(ctx); break;
      case 'Figures':  this._renderFigures(ctx); break;
      case 'Ship':     this._renderShip(ctx); break;
      case 'Archive':  this._renderArchive(ctx); break;
      case 'Ledger':   this._renderLedger(ctx); break;
    }
    if (!isChromeLess) this._applySearchFilter();
  },

  // Signal Archive — a grid of poster cards; clicking one plays its 6s clip through the UI system's
  // shared cinematic player (ui.playCinematic). No new modal machinery; reuses the existing player.
  _renderArchive() {
    this._body.appendChild(el('div', 'sf-codex-section-h', 'Signal Archive'));
    const intro = el('div', 'sf-codex-body', 'Recovered transmission stills from the Reach corridor. Select a signal to replay its clip.');
    intro.style.marginBottom = '12px';
    this._body.appendChild(intro);
    const grid = el('div', 'sf-arch-grid');
    for (const c of SIGNAL_ARCHIVE) {
      const card = el('button', 'sf-arch-card');
      card.type = 'button';
      card.setAttribute('aria-label', 'Play signal ' + c.id + ': ' + c.title);
      const thumb = el('div', 'sf-arch-thumb');
      thumb.style.backgroundImage = "url('" + c.poster + "')";
      thumb.appendChild(el('div', 'sf-arch-play', '▶'));
      card.appendChild(thumb);
      const meta = el('div', 'sf-arch-meta');
      meta.appendChild(el('div', 'sf-arch-title', c.title));
      meta.appendChild(el('div', 'sf-arch-cap', c.caption));
      card.appendChild(meta);
      card.addEventListener('click', () => this._playCinematic(c.video, c.title));
      grid.appendChild(card);
    }
    this._body.appendChild(grid);
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
    this._body.appendChild(el('div', 'sf-codex-section-h', 'Exploration Plates'));
    const plates = explorationDiscoveryPlates(ctx && ctx.state);
    if (!plates.length) {
      this._body.appendChild(el('div', 'sf-codex-empty', 'No physical discoveries logged yet. Earn a fix, then fly down the source.'));
      return;
    }
    for (const plate of plates) {
      const entry = el('article', 'sf-codex-entry');
      const isRequested = plate.id === this._requestedDiscoveryId;
      entry.dataset.codexDiscoveryId = plate.id;
      if (isRequested) entry.tabIndex = -1;
      entry.appendChild(el('h3', null, plate.title));
      entry.appendChild(el('div', 'sf-codex-meta', plate.meta));
      entry.appendChild(el('div', 'sf-codex-body', plate.body));
      entry.appendChild(el('div', 'sf-codex-note', plate.note));
      if (tethysCodexReturnIntent(ctx && ctx.state, plate)) {
        const returnToTethys = el('button', 'sf-btn', 'Show Tethys Trade Hub');
        returnToTethys.type = 'button';
        returnToTethys.style.marginTop = '10px';
        returnToTethys.setAttribute('aria-label', 'Show Tethys Trade Hub on the map');
        returnToTethys.addEventListener('click', () => openTethysCodexReturn(ctx, plate));
        entry.appendChild(returnToTethys);
      }
      this._body.appendChild(entry);
      if (isRequested) focusCodexDiscoveryEntry(entry);
    }
  },

  _renderBlackBoxes(ctx) {
    this._body.appendChild(el('div', 'sf-codex-section-h', 'Recovered Black Boxes'));
    const records = doubleWreckBlackBoxRecords(safeStory(ctx));
    if (!records.length) {
      this._body.appendChild(el('div', 'sf-codex-empty',
        'No recorders recovered. Scan a wreck before cutting it free.'));
      return;
    }
    for (const record of records.slice().reverse()) {
      const entry = el('article', 'sf-codex-entry');
      entry.dataset.blackBoxEncounterId = record.encounterId;
      entry.appendChild(el('h3', null, 'Double Wreck — Opposing Accounts'));
      const collectionOrder = record.recoveryOrder.map((side) => `Box ${side.toUpperCase()}`).join(' → ');
      const location = [record.sectorId, record.zoneId].filter(Boolean).join(' · ');
      entry.appendChild(el('div', 'sf-codex-meta',
        `${record.recoveredCount}/2 recorders · recovered ${collectionOrder}${location ? ` · ${location}` : ''}`));
      for (const log of record.logs) {
        entry.appendChild(el('div', 'sf-codex-body',
          `BOX ${log.side.toUpperCase()} · ${log.stamp} — ${log.text}`));
      }
      entry.appendChild(el('div', 'sf-codex-note', record.complete
        ? 'Recovery note: matching turn calls are not clearance. Bleed speed before arguing lane priority.'
        : 'One account is still missing. An unscanned recorder leaves no readable copy.'));
      this._body.appendChild(entry);
    }
  },

  _renderStatus(ctx) {
    const summary = codexProgressSummary(safeStory(ctx));
    const box = el('div', 'sf-codex-status');
    box.setAttribute('aria-label', 'Codex unlock status');
    box.appendChild(el('div', 'sf-codex-status-title', 'Codex Unlock Status'));
    const grid = el('div', 'sf-codex-status-grid');
    for (const item of summary.items) {
      const row = el('div', 'sf-codex-status-item');
      row.appendChild(el('div', 'sf-codex-status-k', item.key));
      row.appendChild(el('div', 'sf-codex-status-v', item.value));
      grid.appendChild(row);
    }
    box.appendChild(grid);
    box.appendChild(el('div', 'sf-codex-status-note', summary.note));
    this._body.appendChild(box);
  },

  _renderAces(ctx) {
    this._body.appendChild(el('div', 'sf-codex-section-h', 'Named Aces'));
    const memory = ctx && ctx.state && ctx.state.aceMemory || {};
    const seen = launchAces().filter((ace) => {
      const rec = memory[ace.id];
      return rec && rec.encountered === true;
    });
    if (!seen.length) {
      this._body.appendChild(el('div', 'sf-codex-empty',
        'No named hulls logged. Their stories begin when you meet them in flight.'));
      return;
    }
    for (const ace of seen) {
      const rec = memory[ace.id] || {};
      const status = rec.defeated
        ? 'DEFEATED'
        : (rec.returned ? 'RETURNED' : (rec.returnScheduled ? 'RETURN EXPECTED' : (rec.fled ? 'AT LARGE' : 'ENCOUNTERED')));
      const entry = el('article', 'sf-codex-entry');
      entry.dataset.namedAceId = ace.id;
      entry.appendChild(el('h3', null, `${ace.name} — ${ace.crew}`));
      entry.appendChild(el('div', 'sf-codex-meta',
        `${status} · ${ace.gimmick && ace.gimmick.label || ace.gimmickTag}`));
      entry.appendChild(el('div', 'sf-codex-body', ace.barStory));
      entry.appendChild(el('div', 'sf-codex-note', `First sighting: ${ace.spawnStory}`));
      entry.appendChild(el('div', 'sf-codex-note',
        `Flight read: ${ace.gimmick.mechanic} Counter: ${ace.gimmick.counter}`));
      const reward = ace.reward;
      entry.appendChild(el('div', 'sf-codex-note', rec.rewardClaimed
        ? `Claimed: ${reward.physicalLabel}; ${reward.bountyCr} Cr bounty; ${reward.techLabel} (+${reward.researchPoints} RP).`
        : `On defeat: ${reward.physicalLabel}; ${reward.bountyCr} Cr bounty; ${reward.techLabel} (+${reward.researchPoints} RP).`));
      this._body.appendChild(entry);
    }
  },

  _applySearchFilter() {
    if (!this._body) return;
    const query = normalizeSearch(this._query);
    const entries = Array.from(this._body.querySelectorAll('.sf-codex-entry'));
    const headers = Array.from(this._body.querySelectorAll('.sf-codex-section-h'));
    const emptyRows = Array.from(this._body.querySelectorAll('.sf-codex-empty'));
    const oldEmpty = this._body.querySelector('.sf-codex-empty-search');
    if (oldEmpty) oldEmpty.remove();
    if (!query) {
      entries.forEach((entry) => { entry.hidden = false; });
      headers.forEach((header) => { header.hidden = false; });
      emptyRows.forEach((row) => { row.hidden = false; });
      return;
    }
    let visible = 0;
    entries.forEach((entry) => {
      const matched = normalizeSearch(entry.textContent).includes(query);
      entry.hidden = !matched;
      if (matched) visible++;
    });
    emptyRows.forEach((row) => { row.hidden = true; });
    headers.forEach((header) => {
      let hasVisibleEntry = false;
      let node = header.nextElementSibling;
      while (node && !node.classList.contains('sf-codex-section-h')) {
        if (node.classList.contains('sf-codex-entry') && !node.hidden) {
          hasVisibleEntry = true;
          break;
        }
        node = node.nextElementSibling;
      }
      header.hidden = !hasVisibleEntry;
    });
    if (!visible) this._body.appendChild(el('div', 'sf-codex-empty sf-codex-empty-search', 'No matching unlocked entries.'));
  },

  // The 8-beat spine. Beats up to the player's current beatIndex are readable; future beats show
  // only their title with a locked hint (no spoiler of the in-world voice).
  _renderStory(ctx) {
    const s = safeStory(ctx);
    const beat = storyBeatIndex(s);
    this._body.appendChild(el('div', 'sf-codex-section-h', 'The Eight Beats'));
    BEAT_CONTENT.forEach((content, i) => {
      const reached = i <= beat;
      const entry = el('div', 'sf-codex-entry sf-codex-beat' + (i === beat ? ' current' : ''));
      entry.appendChild(el('h3', null, BEAT_TITLES[i] || ('Beat ' + i)));
      entry.appendChild(el('div', 'sf-codex-meta', reached ? ('Phase ' + content.phase) : 'Locked'));
      if (reached) {
        entry.appendChild(el('div', 'sf-codex-body', content.hint));
      } else {
        entry.appendChild(el('div', 'sf-codex-body sf-codex-locked', '— not yet encountered —'));
      }
      this._body.appendChild(entry);
    });

    // Endgame: the 5 choices. Unlock only after the player has chosen (state.story.endgameChoice),
    // OR reached B7 (so they can see what's on offer). Before B7: locked entirely.
    this._body.appendChild(el('div', 'sf-codex-section-h', 'Endgame'));
    if (beat >= 7) {
      ENDGAME_CHOICES.forEach((c) => {
        const chosen = s.endgameChoice === c.id;
        const entry = el('div', 'sf-codex-entry');
        entry.appendChild(el('h3', null, (chosen ? '✓ ' : '') + 'Choice ' + c.id + ' — ' + c.title));
        entry.appendChild(el('div', 'sf-codex-meta', c.kind + (chosen ? ' · YOUR CHOICE' : '')));
        entry.appendChild(el('div', 'sf-codex-body', c.summary));
        if (c.hiddenCost) entry.appendChild(el('div', 'sf-codex-note', 'Hidden cost: ' + c.hiddenCost));
        this._body.appendChild(entry);
      });
    } else {
      this._body.appendChild(el('div', 'sf-codex-empty', 'The endgame has not revealed itself yet.'));
    }
  },

  // Plan 55: permanent flight-manual role after the diegetic drills. These references are never
  // locked away by a veteran skip; practice state adds a truthful status stamp but not access.
  _renderVerbs(ctx) {
    this._body.appendChild(el('div', 'sf-codex-section-h', 'Signature Physics Verbs'));
    for (const verb of ARCADE_VERB_BEATS) {
      const entry = el('article', 'sf-codex-entry');
      entry.dataset.codexVerbId = verb.id;
      entry.appendChild(el('h3', null, verb.title));
      entry.appendChild(el('div', 'sf-codex-meta', arcadeVerbStatus(ctx && ctx.state, verb.id)));
      entry.appendChild(el('div', 'sf-codex-body', verb.reference));
      this._body.appendChild(entry);
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
    this._body.appendChild(el('div', 'sf-codex-section-h', 'Cold Start'));
    COLD_START.forEach((c) => {
      const entry = el('div', 'sf-codex-entry');
      entry.appendChild(el('h3', null, c.sender));
      entry.appendChild(el('div', 'sf-codex-meta', c.category));
      entry.appendChild(el('div', 'sf-codex-body', c.text));
      if (c.note) entry.appendChild(el('div', 'sf-codex-note', c.note));
      this._body.appendChild(entry);
    });

    // The full COMMS catalog, gated by seen-or-beat-reached. COMMS category keys → display labels.
    for (const [label, key] of COMMS_CATEGORIES) {
      const entries = Array.isArray(COMMS[key]) ? COMMS[key] : [];
      if (!entries.length) continue;
      const visible = entries.filter((c) => {
        // Ambient lines from a reached beat are fair game (they cycle in normal play); beat-gated
        // personal/late/story lines unlock at their beat even if the once-flag hasn't stuck yet.
        return commUnlocked(c, s, beat, key);
      });
      this._body.appendChild(el('div', 'sf-codex-section-h', label + ' (' + visible.length + '/' + entries.length + ')'));
      if (!visible.length) {
        this._body.appendChild(el('div', 'sf-codex-empty', key === 'traps' ? '— no conditional signals encountered yet —' : '— nothing encountered yet —'));
        continue;
      }
      for (const c of visible) {
        const entry = el('div', 'sf-codex-entry');
        entry.appendChild(el('h3', null, c.sender || c.id));
        entry.appendChild(el('div', 'sf-codex-meta', key.replace(/s$/, '')));
        entry.appendChild(el('div', 'sf-codex-body', c.text));
        if (c.note) entry.appendChild(el('div', 'sf-codex-note', c.note));
        this._body.appendChild(entry);
      }
    }
  },

  // Graffiti the player has seen (state.story.graffitiShown is keyed by where:line). Plus the
  // ever-present gang markings on the bulkhead (there from B0).
  _renderGraffiti(ctx) {
    const s = safeStory(ctx);
    const shown = s.graffitiShown || {};
    const beat = storyBeatIndex(s);

    this._body.appendChild(el('div', 'sf-codex-section-h', 'Bulkhead — The Previous Crew'));
    this._body.appendChild(el('div', 'sf-codex-entry', null)).appendChild(
      el('div', 'sf-codex-graffiti', GRAFFITI.GANG_DIDNT_MAKE_IT)
    );
    this._body.lastElementChild.appendChild(el('div', 'sf-codex-note',
      "The gang left their mark when they took the Tessera. It's still there. Never coming off."));

    this._body.appendChild(el('div', 'sf-codex-section-h', 'Encountered'));
    let any = false;
    for (const [key, _seen] of Object.entries(shown)) {
      // key is "where:line" — pull the line text after the first colon.
      const line = key.includes(':') ? key.slice(key.indexOf(':') + 1) : key;
      if (!line) continue;
      any = true;
      const where = key.includes(':') ? key.slice(0, key.indexOf(':')) : '?';
      const entry = el('div', 'sf-codex-entry');
      entry.appendChild(el('div', 'sf-codex-meta', where));
      entry.appendChild(el('div', 'sf-codex-graffiti', line));
      this._body.appendChild(entry);
    }
    if (!any) {
      this._body.appendChild(el('div', 'sf-codex-empty',
        beat > 0 ? 'No location graffiti encountered yet.' : '— nothing encountered yet —'));
    }
  },

  // Named figures. The protagonist + figures whose org/role is public lore are always shown; others
  // unlock when the player has reached the beat where they appear.
  _renderFigures(ctx) {
    const s = safeStory(ctx);
    const beat = storyBeatIndex(s);
    this._body.appendChild(el('div', 'sf-codex-section-h', 'Named Figures'));
    const renderFig = (key) => {
      const f = FIGURES[key];
      if (!f) return;
      const entry = el('div', 'sf-codex-entry');
      entry.appendChild(el('h3', null, f.name + (key === 'kurtz' ? '' : '')));
      entry.appendChild(el('div', 'sf-codex-meta', [f.org, f.role].filter(Boolean).join(' · ')));
      const dossier = FIGURE_DOSSIERS[key];
      if (dossier && dossier.body) entry.appendChild(el('div', 'sf-codex-body', dossier.body));
      if (dossier && dossier.note) entry.appendChild(el('div', 'sf-codex-note', dossier.note));
      this._body.appendChild(entry);
    };
    for (const k of FIGURE_ALWAYS) renderFig(k);
    for (const [k, unlockBeat] of Object.entries(FIGURE_GATED)) {
      if (beat >= unlockBeat) renderFig(k);
      else {
        const entry = el('div', 'sf-codex-entry sf-codex-locked');
        entry.appendChild(el('h3', null, '???'));
        entry.appendChild(el('div', 'sf-codex-meta', 'Not yet encountered'));
        this._body.appendChild(entry);
      }
    }
  },

  // The Tessera's sealed history + persistent cargo (the "personal effects" that travel with you).
  // Always visible — it's the player's own ship.
  _renderShip(ctx) {
    this._body.appendChild(el('div', 'sf-codex-section-h', 'The Tessera'));
    const entry = el('div', 'sf-codex-entry');
    entry.appendChild(el('h3', null, SHIP.name + ' / ' + SHIP.registration));
    const grid = el('div', 'sf-grid2');
    const rows = [
      ['Incident', SHIP.incident + ' (' + SHIP.incidentRef + ')'],
      ['Previous operator', SHIP.previousOperator],
      ['Crew status', SHIP.crewStatus],
      ['Impounded', SHIP.impoundMonths + ' months'],
      ['Acquired via', SHIP.friend.callsign + ' — ' + SHIP.friend.debt],
    ];
    for (const [k, v] of rows) {
      grid.appendChild(el('div', 'k', k));
      grid.appendChild(el('div', 'v', v));
    }
    entry.appendChild(grid);
    this._body.appendChild(entry);

    this._body.appendChild(el('div', 'sf-codex-section-h', 'Reference Codes'));
    const refs = el('div', 'sf-codex-entry');
    refs.appendChild(el('div', 'sf-codex-body',
      REFS.CONTRACT_47A + ' — your first contract. Payment withheld forever.\n' +
      REFS.REF_44C + ' — the administrative code that governs everything inconvenient.'));
    this._body.appendChild(refs);

    this._body.appendChild(el('div', 'sf-codex-section-h', 'Personal Effects'));
    PERSISTENT_CARGO.forEach((p) => {
      const entry = el('div', 'sf-codex-entry');
      entry.appendChild(el('h3', null, p.name));
      entry.appendChild(el('div', 'sf-codex-meta', p.mass + ' t · unsellable'));
      entry.appendChild(el('div', 'sf-codex-note', p.note));
      this._body.appendChild(entry);
    });
  },
};
