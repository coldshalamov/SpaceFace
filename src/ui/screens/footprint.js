// THE FOOTPRINT (F3): the Heat Dial, and the record that keeps the law after you.
// ORRERY (design/frontend/ORRERY.md §6 Meta; OVERHAUL_PLAN_2026-09-25 Footprint row). The hero is one
// instrument (src/ui/orrery/footprintDial.js): your heat as the thin numeral in the hub and the lit arc of
// the bezel, cooling toward the clear point as the heat system's escape clock runs; round the hub, one
// sector per SOURCE on the record (the bounty on your hull, every provenance chain), lit while it holds the
// record open. The signature is TRACE A SOURCE: drag round the dial, arrow round its sector keys or move a
// pad over them, and the amber Hand sweeps sector to sector; the traced source's chain unfolds beside the
// dial as a beam of its receipts (act, incident, standing, consequence), and the verbs that answer that
// source preview on the dial what they would settle. The composition is src/ui/orrery/footprintLayouts.js.
// The temperature (wanted-cold) is the kit's (src/ui/kit/temperature.js), never set here.
// Reads state.provenance.chains / openIncidents, state.player.heat, heatZone and bounty; emits intents only
// (heat is the heat system's single writer; credits the economy's; standing the factions').

import { FACTION_META } from '../../data/factions.js';
import { TITLES } from '../../data/titles.js';
import { REP_REASON_LABELS } from '../../data/repReasons.js';
import { bribeCost } from '../../systems/factions.js';
import { buildShipLedger, formatLedgerCycle, SHIP_LEDGER_PAGE_SIZE } from '../../systems/shipLedger.js';
import { contractLedgerRows } from '../../combat/stuntContracts.js';
import { latestLossLine } from '../../systems/lossLedger.js';
import { isPlayerWanted, heatLevelFor } from '../../systems/heat.js';
import { aceById } from '../../data/namedAces.js';
import { mountDataState, settleDataState } from '../uiPrimitives.js';
import { openGalaxyMap, MAP_FOCUS } from '../mapAuthority.js';
import { resolveMapOpenTarget, applyMapOpenIntentToView } from '../galaxyMap.js';
import { el, words, settle, cue } from '../kit/index.js';
import { entitySpanHtml, decorateEntityNode, entityLabel } from '../entityResolver.js';
import { createHeatDial, heatReading } from '../orrery/footprintDial.js';
import { injectFootprintLayouts } from '../orrery/footprintLayouts.js';
import { dressLampKey } from '../orrery/lampKey.js';
import { crestUrl } from '../orrery/crestOrbit.js';

/** The bounty's produced token (assets/ui/generated/footprint/manifest.json); a chain carries its power's crest. */
const BOUNTY_SEAL = new URL('../../../assets/ui/generated/footprint/bounty_seal.webp', import.meta.url).href;

const FACTION_BY_ID = new Map(FACTION_META.map((entry) => [entry.id, entry]));
const TITLE_BY_ID = new Map(TITLES.map((entry) => [entry.id, entry]));

// Sentence case in the DOM (the layout sets the display word in caps). The `fp-display--*` tone classes
// stay on the word as inert hooks; the colour comes from the temperature, not a tint.
const DISPLAY_BY_STATE = Object.freeze({
  clean: { word: 'Clean', tone: 'calm' },
  marked: { word: 'Marked', tone: 'goal' },
  wanted: { word: 'Wanted', tone: 'foe' },
});

const OUTCOME_WORDS = Object.freeze({
  destroyed: 'destroyed',
  surrendered_secured: 'surrendered',
  surrendered_escaped: 'escaped custody',
  surrendered_lost: 'custody lost',
  disengaged: 'disengaged',
  recovered: 'recovered',
  abandoned: 'abandoned',
  repelled: 'repelled',
  raided: 'raided',
  witnessed_only: 'witnessed',
});

const COLUMN_NAMES = Object.freeze(['Act', 'Incident', 'Standing', 'Consequence']);
const INCIDENT_EMPTY_LABEL = 'No jurisdiction logged this';
const CONSEQUENCE_EMPTY_LABEL = 'Nothing hunts you yet';
const RECORD_SORTS = Object.freeze(['time', 'delta']);
/** The dial holds this many chains; older settled ones are counted on its rim. */
const DIAL_CHAIN_CAP = 15;
/** The beam's spine, in px from the board's left edge (footprintLayouts.js draws it there). */
const SPINE_X = 33;
/** A bead's centre below its node's top edge (the bead sits on the first line). */
const BEAD_Y = 14;

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asInteger(value, fallback = 0) {
  return Math.trunc(asNumber(value, fallback));
}

function asString(value) {
  if (typeof value !== 'string') return null;
  const clean = value.trim();
  return clean || null;
}

function sentenceCase(value) {
  const text = String(value == null ? '' : value);
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

function creditsText(value) {
  return `${Math.max(0, Math.round(asNumber(value, 0))).toLocaleString('en-US')} cr`;
}

function deltaText(value) {
  // A receipt with no standing move carries null, which Number() would read as a zero delta.
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '';
  const n = Math.round(Number(value));
  if (n === 0) return '0';
  return n > 0 ? `+${n}` : String(n);
}

/** "6 s", "2 min", "2 min 30 s" — the heat clock as the hero's word reads it. */
function clearsText(seconds) {
  const whole = Math.max(0, Math.round(asNumber(seconds, 0)));
  if (whole < 60) return `${whole} s`;
  const mm = Math.floor(whole / 60);
  const ss = whole % 60;
  return ss ? `${mm} min ${ss} s` : `${mm} min`;
}

/** "Cycle 0003" — the ledger's cycle stamp in sentence case (the ledger spells it in caps). */
function cycleText(t) {
  return sentenceCase(formatLedgerCycle(asNumber(t, 0)).toLowerCase());
}

function shortFactionName(factionId) {
  const row = factionId && FACTION_BY_ID.get(factionId);
  return row ? (row.short || row.name || factionId) : (factionId || 'Unknown');
}

function repReasonLabel(reason) {
  const raw = asString(reason);
  if (!raw) return '';
  const key = raw.startsWith('spillover:') ? raw.slice('spillover:'.length) : raw;
  return REP_REASON_LABELS[key] || '';
}

function wantedState(state) {
  const player = state && state.player || {};
  const wanted = isPlayerWanted(state);
  const bounty = Math.max(0, asNumber(player.bounty, 0));
  if (wanted) return 'wanted';
  if (bounty > 0) return 'marked';
  return 'clean';
}

function outcomeWord(outcome) {
  const key = asString(outcome);
  return key ? (OUTCOME_WORDS[key] || key.replace(/_/g, ' ')) : '';
}

function nodeColumn(node) {
  const kind = asString(node && node.k);
  if (kind === 'act') return 0;
  if (kind === 'incident') return 1;
  if (kind === 'standing' || kind === 'spillover') return 2;
  if (kind === 'consequence') return 3;
  return -1;
}

function nodeStamp(node) {
  return asInteger(node && node.tick, 0) * 100000 + Math.round(asNumber(node && node.t, 0) * 1000);
}

function chainStamp(chain) {
  let best = asInteger(chain && chain.tick, 0);
  const nodes = Array.isArray(chain && chain.nodes) ? chain.nodes : [];
  for (const node of nodes) best = Math.max(best, asInteger(node && node.tick, best));
  return best;
}

function nodeWord(node) {
  if (!node || typeof node !== 'object') return 'entry';
  const kind = asString(node.k);
  if (kind === 'act') {
    const faction = shortFactionName(asString(node.factionId));
    const badge = outcomeWord(node.outcome);
    return badge ? `${badge} · ${faction}` : faction;
  }
  if (kind === 'incident') {
    return asString(node.text) || asString(node.cause) || 'jurisdiction log';
  }
  if (kind === 'standing') {
    const label = repReasonLabel(node.reason);
    const delta = deltaText(node.delta);
    const body = [shortFactionName(node.factionId), label, delta].filter(Boolean).join(' · ');
    return body || shortFactionName(node.factionId);
  }
  if (kind === 'spillover') {
    const src = shortFactionName(node.srcFaction);
    const delta = deltaText(node.delta);
    return `spillover${delta ? ` (${delta})` : ''} · ${src}`;
  }
  if (kind === 'consequence') {
    return asString(node.text) || outcomeWord(node.outcome) || 'consequence';
  }
  return kind || 'entry';
}

// Exported for the tier-2 check: nodeWhy is the enumerated phrase composer for board nodes
// (REP_REASON_LABELS / OUTCOME_WORDS banks). Unknown kinds render '' — never invented text.
export function nodeWhy(node) {
  if (!node || typeof node !== 'object') return '';
  const kind = asString(node.k);
  if (kind === 'act') {
    const faction = shortFactionName(asString(node.factionId));
    const outcome = outcomeWord(node.outcome);
    return [outcome, faction].filter(Boolean).join(' · ');
  }
  if (kind === 'incident') return asString(node.text) || '';
  if (kind === 'standing') {
    const reason = repReasonLabel(node.reason);
    if (!reason) return '';
    const delta = deltaText(node.delta);
    const tier = asString(node.newTier);
    return [reason, delta, tier].filter(Boolean).join(' · ');
  }
  if (kind === 'spillover') {
    const reason = repReasonLabel(node.reason);
    const src = shortFactionName(asString(node.srcFaction));
    return `ally/rival spillover${reason ? ` (${reason})` : ''} — ${src}`;
  }
  if (kind === 'consequence') return asString(node.text) || outcomeWord(node.outcome) || '';
  return '';
}

/** The traced chain's head of record — kit sentences, every state-derived fragment encoded for innerHTML. */
export function footprintReadoutHtml(chain, node, state) {
  if (!chain) {
    return `
      <p class="k-sentence k-sentence--emph">Trace a chain</p>
      <p class="k-sentence">Pick a chain from the list, then a node on the board, to light its path.</p>`;
  }
  const why = nodeWhy(node);
  const faction = findChainStandingFaction(chain) || asString(node && node.factionId);
  const rootKind = escapeHtml(sentenceCase(asString(chain.rootKind) || 'chain'));
  const outcome = escapeHtml(outcomeWord(chain.outcome) || 'witnessed');
  const reason = escapeHtml(why || (node ? 'No additional receipt text for this node.' : 'Pick a node on the board to read its receipt.'));
  const openState = escapeHtml(chainOpenReason(chain, state));
  const sectorId = asString(chain.sectorId);
  const sector = sectorId
    ? entitySpanHtml('sector:' + sectorId, escapeHtml(entityLabel('sector:' + sectorId) || sectorId))
    : 'unfiled';
  const factionLine = faction
    ? `Faction focus ${entitySpanHtml('faction:' + faction, escapeHtml(shortFactionName(faction)))}.`
    : 'Faction focus unresolved.';
  return `
      <p class="k-sentence k-sentence--emph">${rootKind} · ${outcome}</p>
      <p class="k-sentence">${reason} Open state ${openState}. ${factionLine} Sector ${sector}.</p>`;
}

function collectChainColumns(chain) {
  const columns = [[], [], [], []];
  const nodes = Array.isArray(chain && chain.nodes) ? chain.nodes : [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const col = nodeColumn(node);
    if (col < 0) continue;
    columns[col].push({ node, nodeIndex: index, stamp: nodeStamp(node) });
  }
  for (const col of columns) {
    col.sort((left, right) => right.stamp - left.stamp);
    while (col.length > 3) col.pop();
  }
  return columns;
}

function screenManagerFor(ctx) {
  if (!ctx) return null;
  if (ctx.screenManager && typeof ctx.screenManager.pushScreen === 'function') return ctx.screenManager;
  if (ctx.screens && typeof ctx.screens.pushScreen === 'function') return ctx.screens;
  return null;
}

function mapTargetForStation(state, stationId, sectorId) {
  if (!stationId) return null;
  const intent = {
    focus: MAP_FOCUS.SYSTEM,
    stationId,
    sectorId: sectorId || null,
    source: 'footprint',
  };
  return resolveMapOpenTarget(state, intent);
}

function findChainIncident(chain) {
  const nodes = Array.isArray(chain && chain.nodes) ? chain.nodes : [];
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const node = nodes[i];
    if (node && node.k === 'incident' && asString(node.stationId)) return node;
  }
  return null;
}

function findChainStandingFaction(chain) {
  const nodes = Array.isArray(chain && chain.nodes) ? chain.nodes : [];
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const node = nodes[i];
    if (node && (node.k === 'standing' || node.k === 'spillover')) {
      return asString(node.factionId) || null;
    }
  }
  return null;
}

function findChainAct(chain) {
  const nodes = Array.isArray(chain && chain.nodes) ? chain.nodes : [];
  let best = null;
  for (const node of nodes) {
    if (!node || node.k !== 'act') continue;
    if (!best || nodeStamp(node) > nodeStamp(best)) best = node;
  }
  return best;
}

function chainOpenReason(chain, state) {
  if (!chain || chain.open !== true) return 'settled';
  if (chain.bountyPending === true && asNumber(state && state.player && state.player.bounty, 0) > 0) return 'unpaid bounty';
  if (chain.amendsActive === true) return 'amends outstanding';
  return 'active aggro';
}

/** The hang row's name: the act's word, or the chain's kind and outcome when no act was recorded. */
function chainWord(chain) {
  const act = findChainAct(chain);
  if (act) return nodeWord(act);
  return `${sentenceCase(asString(chain.rootKind) || 'chain')} · ${outcomeWord(chain.outcome) || 'witnessed'}`;
}

/** The hang row's sub: the latest stamp on the chain. */
function chainStampText(chain) {
  const nodes = Array.isArray(chain && chain.nodes) ? chain.nodes : [];
  let latest = null;
  for (const node of nodes) if (node && (!latest || nodeStamp(node) > nodeStamp(latest))) latest = node;
  const t = latest ? asNumber(latest.t, 0) : asNumber(chain && chain.t, 0);
  return `${cycleText(t)} · tick ${chainStamp(chain)}`;
}

/** The power a chain is about: its act's (or first receipt's) faction. */
function chainFactionId(chain) {
  const act = findChainAct(chain);
  if (act && asString(act.factionId)) return asString(act.factionId);
  const nodes = Array.isArray(chain && chain.nodes) ? chain.nodes : [];
  for (const node of nodes) if (node && asString(node.factionId)) return asString(node.factionId);
  return null;
}

/** Every power a chain's receipts name (the set provenanceLedger.recomputeOpen reads for aggro). */
function chainFactionIds(chain) {
  const ids = new Set();
  for (const node of Array.isArray(chain && chain.nodes) ? chain.nodes : []) {
    const a = asString(node && node.factionId);
    if (a) ids.add(a);
    const b = asString(node && node.srcFaction);
    if (b) ids.add(b);
  }
  return ids;
}

/**
 * Would this chain still be held open after a verb? The same rule the provenance ledger applies
 * (recomputeOpen: any named power at aggro, an unpaid bounty it carries, amends outstanding), read with
 * the verb's effect applied: `bounty` is the bounty after it, `calmFaction` a power no longer at aggro.
 * Presentation only: the ledger itself recomputes when the owners act.
 */
function chainHeldOpen(chain, state, { bounty, calmFaction = null }) {
  if (!chain || chain.open !== true) return false;
  let aggro = false;
  for (const id of chainFactionIds(chain)) {
    if (id === calmFaction) continue;
    const row = state && state.factions && state.factions[id];
    if (row && row.aggro) { aggro = true; break; }
  }
  const hasBounty = chain.bountyPending === true && bounty > 0;
  return aggro || hasBounty || chain.amendsActive === true;
}

/**
 * The sources on the Heat Dial, in ring order (clockwise from twelve): the bounty on your hull, then
 * the open chains, then the settled ones, newest first. A sector's span is its SHARE OF THE RECEIPTS ON
 * THE RECORD — not of heat, which nothing in state attributes per source: an open chain weighs its
 * receipt nodes (at least two), the bounty weighs the receipts of the chains that carry it (at least
 * two), and a settled chain keeps a fixed sliver of the ring (the dial's SLIVER) — history, not pressure.
 */
export function footprintSources(state, chains) {
  const list = [];
  const bounty = Math.max(0, asNumber(state && state.player && state.player.bounty, 0));
  const all = Array.isArray(chains) ? chains : [];
  if (bounty > 0) {
    const carriers = all.filter((chain) => chain && chain.bountyPending === true);
    const receipts = carriers.reduce((sum, chain) => sum + (Array.isArray(chain.nodes) ? chain.nodes.length : 0), 0);
    list.push({
      id: 'bounty', kind: 'bounty', open: true, label: 'Bounty',
      name: `${creditsText(bounty)} bounty`, weight: Math.max(2, receipts),
      chainId: carriers.length ? asString(carriers[0].id) : null,
      token: BOUNTY_SEAL,
    });
  }
  const open = all.filter((chain) => chain && chain.open === true);
  const settled = all.filter((chain) => chain && chain.open !== true);
  const shown = open.concat(settled).slice(0, DIAL_CHAIN_CAP);
  for (const chain of shown) {
    const isOpen = chain.open === true;
    const receipts = Array.isArray(chain.nodes) ? chain.nodes.length : 0;
    const factionId = chainFactionId(chain);
    list.push({
      id: asString(chain.id), kind: 'chain', open: isOpen,
      label: factionId ? shortFactionName(factionId) : sentenceCase(asString(chain.rootKind) || 'chain'),
      name: sentenceCase(chainWord(chain)),
      weight: isOpen ? Math.max(2, receipts) : 1,
      chainId: asString(chain.id),
      token: factionId ? crestUrl(factionId) : null,
    });
  }
  return list;
}

/** A hairline row that is read, not picked (`.k-row--static`). `name`/`sub` may be a Node so a
 *  noun inside them can carry an entity link instead of being flattened to text. */
function staticRow(name, sub, num) {
  const row = el('li', 'k-row k-row--static');
  const body = el('div');
  const nameEl = el('span', 'k-row__name');
  if (name && typeof name !== 'string') nameEl.append(name); else nameEl.textContent = String(name || '');
  body.append(nameEl);
  if (sub) {
    const subEl = el('div', 'k-row__sub');
    if (typeof sub !== 'string') subEl.append(sub); else subEl.textContent = sub;
    body.append(subEl);
  }
  row.append(body, el('span', 'k-row__num', num || ''));
  return row;
}

/** A span stamped as an entity door; unknown refs stay plain text (resolver discipline). */
function entityNode(text, ref) {
  const node = el('span', '', text);
  return ref ? decorateEntityNode(node, ref) : node;
}

/** A caps heading and its static rows, appended to the record. */
function appendRecordSection(host, caption, entries) {
  host.append(el('div', 'k-caps', caption));
  const list = el('ul', 'k-rows');
  list.setAttribute('aria-label', caption);
  for (const [name, sub, num] of entries) list.append(staticRow(name, sub, num));
  host.append(list);
}

/** The heat as the header and the hub's words say it. */
function heatWords(reading) {
  if (!reading || reading.level <= 0) return { clears: 'no search on you', short: 'no search on you' };
  if (reading.held === 'impound') return { clears: 'held at the pound', short: 'held · impounded' };
  if (reading.held === 'docked') return { clears: 'held while docked', short: 'held · docked' };
  if (reading.held === 'inside') return { clears: 'held inside the search zone', short: 'held · inside the zone' };
  return { clears: `clears in ${clearsText(reading.clearsIn)} outside a ${Math.round(reading.radius).toLocaleString('en-US')} wu search zone`, short: 'clears in' };
}

export const footprintScreen = {
  id: 'footprint',
  accessibleName: 'Footprint records board',
  _ctx: null,
  _root: null,
  _title: null,
  _titleWord: null,
  _titleLine: null,
  _heatN: null,
  _heatW: null,
  _dial: null,
  _dialHost: null,
  _read: null,
  _trace: null,
  _hang: null,
  _hangList: null,
  _stage: null,
  _stateHost: null,
  _board: null,
  _edges: null,
  _nodes: null,
  _incidentState: null,
  _consequenceState: null,
  _record: null,
  _foot: null,
  _chains: [],
  _sources: [],
  _tracedSourceId: null,
  _previewAction: null,
  _selectedChainId: null,
  _selectedNodeIndex: null,
  _recordSort: 'time',
  _nodeButtons: new Map(),
  _nodeMeta: new Map(),
  _renderedChains: [],
  _raf: 0,
  _resizeHandler: null,
  _pendingFocusKey: null,
  _renderSig: null,
  _settleTimer: 0,

  mount(rootEl, ctx) {
    this._ctx = ctx;
    this._renderSig = null;
    this._root = rootEl;
    rootEl.innerHTML = '';
    rootEl.classList.remove('sf-footprint', 'sf-instrument', 'panel');
    rootEl.classList.add('k-screen', 'fp-orrery');
    rootEl.dataset.kReady = '0';
    rootEl.setAttribute('aria-labelledby', 'sf-footprint-title');
    injectFootprintLayouts(rootEl.ownerDocument || globalThis.document);

    // .k-title — the display word (Clean / Marked / Wanted) and the record's sentence.
    const title = el('header', 'k-title');
    const word = el('h1', 'k-display k-t-title fp-display', DISPLAY_BY_STATE.clean.word);
    word.id = 'sf-footprint-title';
    const line = el('p', 'k-t-emph k-62 fp-line', '');
    title.append(word, line);
    this._title = title;
    this._titleWord = word;
    this._titleLine = line;

    // .k-stage — the Heat Dial, and the reading of the traced source beside it.
    const stage = el('div', 'k-stage fp-stage');
    this._stage = stage;
    const dialHost = el('div', 'fp-dialhost');
    this._dialHost = dialHost;
    const read = el('div', 'fp-read');
    read.setAttribute('data-sf-scroll', 'read');
    this._read = read;
    const stateHost = el('div', 'fp-statehost');
    stateHost.hidden = true;
    this._stateHost = stateHost;
    const trace = el('div', 'fp-trace');
    trace.setAttribute('aria-live', 'polite');
    this._trace = trace;
    // The chain, unfolded: a beam of its receipts (the four stages as cells down one spine).
    const board = el('div', 'fp-board');
    board.setAttribute('aria-label', 'The traced chain');
    board.innerHTML = `
      <div class="fp-head">
        <div class="fp-col-head"><span class="k-caps">${COLUMN_NAMES[0]}</span></div>
        <div class="fp-col-head"><span class="k-caps">${COLUMN_NAMES[1]}</span><small class="fp-col-state fp-col-state--incident k-t-fine k-38"></small></div>
        <div class="fp-col-head"><span class="k-caps">${COLUMN_NAMES[2]}</span></div>
        <div class="fp-col-head"><span class="k-caps">${COLUMN_NAMES[3]}</span><small class="fp-col-state fp-col-state--consequence k-t-fine k-38"></small></div>
      </div>
      <svg class="fp-edges" aria-hidden="true"></svg>
      <div class="fp-nodes" role="list"></div>`;
    this._board = board;
    this._edges = board.querySelector('.fp-edges');
    this._nodes = board.querySelector('.fp-nodes');
    this._incidentState = board.querySelector('.fp-col-state--incident');
    this._consequenceState = board.querySelector('.fp-col-state--consequence');
    // .k-foot — the verbs that answer the traced source; rebuilt by _renderVerbs.
    const foot = el('footer', 'k-foot fp-answer');
    this._foot = foot;
    const record = el('div', 'fp-drawer');
    record.setAttribute('aria-label', 'Chain record');
    this._record = record;
    read.append(stateHost, trace, board, foot, record);
    stage.append(dialHost, read);
    rootEl.append(title, stage);

    this._dial = createHeatDial(dialHost, {
      onTrace: (id) => this._traceSource(id),
      onEnter: () => this._focusBeam(),
    });
    // The hub carries the heat tier and the clock's words (the corner hero this screen used to have).
    this._heatN = this._dial.hubTier || el('p', 'fp-hub__tier');
    this._heatW = this._dial.hubClears || el('span', 'fp-hub__clears-w');

    rootEl.addEventListener('click', (event) => this._onClick(event));
    rootEl.addEventListener('keydown', (event) => this._onKeydown(event));
    read.addEventListener('scroll', () => this._queueEdgeDraw());
  },

  onShow(ctx) {
    if (ctx) this._ctx = ctx;
    this._restoreMemory();
    this.refresh(this._ctx);
    // The resize listener only lives while the screen is on top, and an unchanged signature skips
    // the rebuild — so a resize while the board was closed or covered must re-measure the beam and
    // the dial's link here or reopen draws them for the old geometry.
    this._queueEdgeDraw();
    if (!this._resizeHandler) {
      this._resizeHandler = () => this._queueEdgeDraw();
      window.addEventListener('resize', this._resizeHandler);
    }
    cue('open');
    try {
      settle(this._title, { from: 'top', state: 'footprint:open' });
      settle(this._read, { from: 'right', state: 'footprint:open' });
    } catch (_) { /* motion is cosmetic */ }
    if (this._dial) this._dial.arrive();
    // The column arrives on a settle (a transform): measure the beam again once it has come to rest.
    clearTimeout(this._settleTimer);
    this._settleTimer = setTimeout(() => this._queueEdgeDraw(), 700);
    if (this._root) this._root.dataset.kReady = '1';
    try {
      // Keyboard entry lands on the dial: the traced source's sector key.
      const key = this._dial && this._tracedSourceId ? this._dial.keyFor(this._tracedSourceId) : null;
      if (key) key.focus({ preventScroll: true });
    } catch (_) { /* focus is a courtesy */ }
  },

  /** Resolves once the arrival choreography has come to rest (the bench shoots the screen at rest). */
  settled() {
    const still = typeof document !== 'undefined' && document.documentElement && document.documentElement.classList.contains('sf-reduce-motion');
    return new Promise((resolve) => setTimeout(() => { this._drawEdges(); resolve(); }, still ? 0 : 1200));
  },

  onHide() {
    this._rememberMemory();
    clearTimeout(this._settleTimer);
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = 0;
    }
    this._pendingFocusKey = null;
    cue('close');
  },

  refresh(ctx) {
    if (ctx) this._ctx = ctx;
    const state = this._ctx && this._ctx.state;
    if (!state || !state.player) {
      this._chains = [];
      this._showDataState('denied', {
        code: 'CLEARANCE_DENIED',
        headline: 'Footprint is unavailable in this context.',
        fills: 'Open this board while in flight with an active pilot profile.',
        verb: {
          label: 'Open Chart',
          onActivate: () => openGalaxyMap(this._ctx, { focus: MAP_FOCUS.GALAXY, source: 'footprint-denied' }),
        },
      });
      return;
    }

    const provenance = state.provenance;
    if (provenance == null) {
      this._chains = [];
      this._showDataState('loading', {
        code: 'LEDGER_SYNC',
        headline: 'Footprint is indexing your recent activity.',
        fills: 'Acts, incidents, and standing receipts appear after they are observed on this run.',
        verb: {
          label: 'Open Chart',
          onActivate: () => openGalaxyMap(this._ctx, { focus: MAP_FOCUS.GALAXY, source: 'footprint-loading' }),
        },
        skeleton: [{ w: '72%' }, { w: '54%' }, { w: '86%' }],
      });
      return;
    }
    const valid = provenance && typeof provenance === 'object'
      && Array.isArray(provenance.chains)
      && provenance.openIncidents && typeof provenance.openIncidents === 'object';
    if (!valid) {
      this._chains = [];
      this._showDataState('error', {
        code: 'LEDGER_FAULT',
        headline: 'Footprint could not read this ledger snapshot.',
        fills: 'A valid provenance chain set restores this board immediately.',
        verb: {
          label: 'Open Chart',
          onActivate: () => openGalaxyMap(this._ctx, { focus: MAP_FOCUS.GALAXY, source: 'footprint-error' }),
        },
      });
      return;
    }

    const chains = provenance.chains
      .filter((entry) => entry && Array.isArray(entry.nodes) && asString(entry.id))
      .slice()
      .sort((left, right) => chainStamp(right) - chainStamp(left));
    this._chains = chains;
    const player = state.player;
    const bounty = Math.max(0, asNumber(player.bounty, 0));
    const display = DISPLAY_BY_STATE[wantedState(state)];
    const heatLevel = heatLevelFor(asNumber(player.heat, 0));
    const openChains = chains.filter((entry) => entry.open === true).length;
    // The heat as the heat system left it (read only): the header, the hub and the bezel all say it.
    const reading = heatReading(state);
    const said = heatWords(reading);

    this._titleWord.textContent = display.word;
    this._titleWord.classList.toggle('fp-display--foe', display.tone === 'foe');
    this._titleWord.classList.toggle('fp-display--goal', display.tone === 'goal');
    this._titleWord.classList.toggle('fp-display--calm', display.tone === 'calm');
    const settledChains = chains.length - openChains;
    const chainWords = openChains
      ? `${openChains} open chain${openChains === 1 ? '' : 's'}`
      : `${settledChains} chain${settledChains === 1 ? '' : 's'} settled`;
    this._titleLine.textContent = heatLevel > 0
      ? `${bounty > 0 ? `${creditsText(bounty)} bounty · ` : ''}heat T${heatLevel} · ${said.clears} · ${chainWords}`
      : `${bounty > 0 ? `${creditsText(bounty)} bounty` : 'No bounty'} · ${said.clears} · ${chainWords}`;
    this._heatN.textContent = heatLevel > 0 ? `T${heatLevel} · ${String(reading.tierLabel || '').split('/')[0]}` : 'T0 · clean';
    this._heatW.textContent = said.short;
    this._paintHeat(reading, state, chains);

    if (chains.length === 0 && bounty <= 0 && !isPlayerWanted(state)) {
      this._showDataState('empty', {
        code: 'NOTHING_STANDS',
        headline: 'Nothing stands against you.',
        fills: 'Chains appear when your actions trigger law receipts, standing shifts, or active consequences.',
        verb: {
          label: 'Show on chart',
          onActivate: () => openGalaxyMap(this._ctx, { focus: MAP_FOCUS.GALAXY, source: 'footprint-empty' }),
        },
      });
      return;
    }

    // The board is data-driven and nothing on it ticks (node stamps are receipts, not wall time);
    // the header and the dial's heat reading above are the only live parts and are rewritten every
    // pass. The uiRoot refresh cadence fires ~3x a second while the screen is open, so the full
    // sources/beam/record/verbs rebuild runs only when this cheap signature of its inputs actually
    // moves (PQ-207.00 follow-up: the old path rebuilt the page every 18 frames — layout thrash and
    // focus churn while the pilot reads the board).
    this._ensureSelection();
    const signature = this._boardSignature(chains, bounty, state);
    if (this._renderSig === signature && !this._board.hidden && !this._record.hidden
      && this._stateHost.hidden) return;
    this._renderSig = signature;
    this._showBoard();
    this._renderHang({ empty: true });
    this._renderBoard();
    this._renderRecord();
    this._renderVerbs({ chart: true });
    this._queueEdgeDraw();
  },

  _showDataState(kind, opts) {
    const stateOpts = opts && typeof opts === 'object' ? opts : {};
    const sig = 'state:' + kind;
    if (this._renderSig === sig && !this._stateHost.hidden) return;
    this._renderSig = sig;
    this._board.hidden = true;
    this._record.hidden = true;
    if (this._trace) this._trace.hidden = true;
    this._stateHost.hidden = false;
    mountDataState(this._stateHost, kind, {
      code: stateOpts.code,
      headline: stateOpts.headline,
      fills: stateOpts.fills,
      verb: stateOpts.verb,
      skeleton: stateOpts.skeleton,
    });
    this._renderHang({ empty: false });
    // The data state carries the chart verb; the foot does not repeat it.
    this._renderVerbs({ chart: false });
  },

  /** Cheap string identity of every input the sources/beam/record/verb renders draw. Receipt chains
   *  are append-only (new nodes move chainStamp), so per-chain id+open+count+stamp+edge-count plus
   *  the page's derived rows (ledger head/tail sample, titles tail, line-contract statuses, the
   *  traced chain's loss line / incident / ace counters incl. returnsBigger, the verb gates'
   *  credits and bribe cost, the powers at aggro that decide what a verb settles) cover everything
   *  that can move while the board sits open. The heat (header, hub, bezel) is deliberately NOT
   *  here — it is rewritten every refresh outside this guard. */
  _boardSignature(chains, bounty, state) {
    const parts = [];
    for (const chain of chains) {
      parts.push(asString(chain.id)
        + '|' + (chain.open === true ? 1 : 0)
        + '|' + (chain.amendsActive === true ? 1 : 0)
        + '|' + (chain.bountyPending === true ? 1 : 0)
        + '|' + (asString(chain.outcome) || '')
        + '|' + (Array.isArray(chain.nodes) ? chain.nodes.length : 0)
        + '|' + (Array.isArray(chain.edges) ? chain.edges.length : 0)
        + '|' + chainStamp(chain));
    }
    parts.push('sel=' + asString(this._selectedChainId) + ':' + this._selectedNodeIndex + ':' + this._recordSort
      + ':' + asString(this._tracedSourceId));
    parts.push('bty=' + Math.round(bounty));
    const chain = this._selectedChain();
    // The verbs read live credits and the traced chain's faction bribe cost (both move while the
    // board sits open — passive income accrues, rep shifts) — sample them or "Pay bounty"/"Bribe"
    // render stale.
    const verbPlayer = state.player || {};
    const verbFaction = chain ? findChainStandingFaction(chain) : null;
    const verbBribe = verbFaction ? bribeCost(verbFaction) : 0;
    parts.push('cr=' + Math.max(0, Math.round(asNumber(verbPlayer.credits, 0)))
      + ':' + (Number.isFinite(verbBribe) ? Math.round(verbBribe) : 'inf'));
    const aggro = state.factions && typeof state.factions === 'object'
      ? Object.keys(state.factions).filter((id) => state.factions[id] && state.factions[id].aggro).sort().join(',')
      : '';
    parts.push('agg=' + aggro);
    const loss = chain ? latestLossLine(state, asString(chain.sectorId)) : null;
    parts.push('loss=' + (loss || ''));
    const ledger = buildShipLedger(state, { page: 0, pageSize: SHIP_LEDGER_PAGE_SIZE });
    const ledgerRows = (ledger.entries || []).slice(0, SHIP_LEDGER_PAGE_SIZE);
    parts.push('led=' + ledgerRows.length
      + ':' + (ledgerRows.length ? ((ledgerRows[0].text || '') + '~' + (ledgerRows[ledgerRows.length - 1].text || '')) : ''));
    const titles = Array.isArray(state.titles && state.titles.history) ? state.titles.history : [];
    const lastTitle = titles[titles.length - 1];
    parts.push('ttl=' + titles.length + ':' + (lastTitle ? (asString(lastTitle.titleId) + ':' + (lastTitle.holderKey || '')) : ''));
    parts.push('ct=' + contractLedgerRows(state).map((row) => row.status).join(','));
    const aceNode = chain && Array.isArray(chain.nodes)
      ? chain.nodes.find((entry) => entry && asString(entry.aceId))
      : null;
    const aceRec = aceNode && state.aceMemory && state.aceMemory[aceNode.aceId];
    parts.push('ace=' + (aceRec
      ? [aceNode.aceId, aceRec.encounterCount | 0, aceRec.fleeCount | 0, aceRec.flungCount | 0, aceRec.returnTier | 0, aceRec.returnsBigger ? 1 : 0].join(':')
      : (aceNode ? asString(aceNode.aceId) : '')));
    const incident = chain ? findChainIncident(chain) : null;
    parts.push('inc=' + (incident
      ? ((asString(incident.text) || asString(incident.cause) || 'r') + '@' + (asString(incident.stationId) || ''))
      : (chain ? 'none' : 'nochain')));
    return parts.join('\n');
  },

  _showBoard() {
    settleDataState(this._stateHost);
    this._stateHost.hidden = true;
    this._board.hidden = false;
    this._record.hidden = false;
    if (this._trace) this._trace.hidden = false;
  },

  /** The heat on the dial: the bezel, the hub's numeral and clock, and the rim's words. */
  _paintHeat(reading, state, chains) {
    if (!this._dial) return;
    const bounty = Math.max(0, asNumber(state && state.player && state.player.bounty, 0));
    const settled = (chains || []).filter((chain) => chain && chain.open !== true).length;
    const older = Math.max(0, (chains || []).length - DIAL_CHAIN_CAP);
    let top = '';
    let rule = '';
    if (!reading || reading.level <= 0) {
      top = bounty > 0 ? 'No search on you · the bounty stands' : 'Clean record · no search on you';
      rule = settled ? `${settled} chain${settled === 1 ? '' : 's'} settled${older ? ` · ${older} older` : ''}` : 'Nothing stands against you';
    } else {
      const zone = `Search zone ${Math.round(reading.radius).toLocaleString('en-US')} wu`;
      if (reading.held === 'impound') top = 'Impounded · recover the hull at the pound';
      else if (reading.held === 'docked') top = `${zone} · the clock holds while docked`;
      else if (reading.held === 'inside') top = `${zone} · inside it · the clock holds`;
      else top = `${zone} · outside it · cooling`;
      rule = 'Heat clears by distance, not by payment';
    }
    const open = (chains || []).some((chain) => chain && chain.open === true) || bounty > 0;
    const clear = open ? '' : ((chains || []).length ? 'No source holds the record open' : 'Nothing stands against you');
    this._dial.setReading(reading, { top, rule, clear });
    if (!this._previewAction) this._dial.setBountyHtml(this._bountyHtml(bounty));
  },

  _bountyHtml(bounty, to = null) {
    if (!(bounty > 0)) return '';
    if (to == null) return `<b>${escapeHtml(creditsText(bounty))}</b> bounty`;
    return `<b>${escapeHtml(creditsText(bounty))}</b> → <i>${escapeHtml(creditsText(to))}</i> bounty`;
  },

  /** The stage always traces one source when there is one: the remembered one, else the first. */
  _ensureSelection() {
    const state = this._ctx && this._ctx.state;
    const chains = this._chains || [];
    const sources = footprintSources(state, chains);
    this._sources = sources;
    if (!sources.some((entry) => entry.id === this._tracedSourceId)) {
      // A remembered chain (screen memory) wins over the ring's first source.
      const remembered = this._selectedChainId && sources.find((entry) => entry.kind === 'chain' && entry.chainId === this._selectedChainId);
      this._tracedSourceId = remembered ? remembered.id : (sources.length ? sources[0].id : null);
      this._selectedNodeIndex = remembered ? this._selectedNodeIndex : null;
    }
    const source = sources.find((entry) => entry.id === this._tracedSourceId) || null;
    const chainId = source ? source.chainId : (chains.length ? chains[0].id : null);
    if (chainId !== this._selectedChainId) {
      this._selectedChainId = chainId || null;
      this._selectedNodeIndex = null;
    }
    const chain = this._selectedChain();
    if (chain && this._selectedNodeIndex != null && !chain.nodes[this._selectedNodeIndex]) this._selectedNodeIndex = null;
  },

  /** The sources on the dial (the "hang" of chains is its source ring now). */
  _renderHang() {
    const state = this._ctx && this._ctx.state;
    const chains = this._chains || [];
    this._sources = state && state.player ? footprintSources(state, chains) : [];
    this._previewAction = null;
    if (!this._dial) return;
    this._dial.setSources(this._sources, { tracedId: this._tracedSourceId });
    this._dial.setPreview(null);
    const bounty = Math.max(0, asNumber(state && state.player && state.player.bounty, 0));
    this._dial.setBountyHtml(this._bountyHtml(bounty));
  },

  _tracedSource() {
    return (this._sources || []).find((entry) => entry.id === this._tracedSourceId) || null;
  },

  /** Trace a source (the dial's drag, its keys, a pad over them): the Hand swings, its chain unfolds. */
  _traceSource(id) {
    const source = (this._sources || []).find((entry) => entry.id === id);
    if (!source || id === this._tracedSourceId) return;
    this._tracedSourceId = id;
    cue('move');
    this._previewAction = null;
    if (this._dial) {
      this._dial.setTrace(id);
      this._dial.setPreview(null);
    }
    this._setSelection(source.chainId || null, null);
    this._queueEdgeDraw();
  },

  _pickChain(chainId) {
    const id = asString(chainId);
    const source = id && (this._sources || []).find((entry) => entry.kind === 'chain' && entry.chainId === id);
    if (source) this._traceSource(source.id);
  },

  /** Only the traced chain is on the stage: its receipts down one spine, the four stages in order. */
  _renderBoard() {
    const chain = this._selectedChain();
    const chains = chain ? [chain] : [];
    this._renderedChains = chains;
    this._nodeButtons = new Map();
    this._nodeMeta = new Map();
    if (this._nodes) this._nodes.textContent = '';
    let sawIncident = false;
    let sawConsequence = false;
    let beamOrder = 0;

    for (const entry of chains) {
      const chainId = asString(entry.id);
      if (!chainId) continue;
      const chainEl = el('div', 'fp-chain');
      chainEl.setAttribute('data-chain-id', chainId);
      chainEl.setAttribute('role', 'listitem');
      const columns = collectChainColumns(entry);
      if (columns[1].length > 0) sawIncident = true;
      if (columns[3].length > 0) sawConsequence = true;
      for (let col = 0; col < columns.length; col += 1) {
        const items = columns[col];
        // An act-less chain (an incident root) or one with no standing move skips that stage.
        if (items.length === 0 && (col === 0 || col === 2)) continue;
        const cell = el('div', 'fp-cell');
        cell.setAttribute('data-col', String(col));
        cell.setAttribute('data-name', COLUMN_NAMES[col]);
        if (items.length === 0) {
          cell.setAttribute('data-empty', '1');
          cell.append(el('span', 'fp-col-empty k-t-fine k-38', col === 1 ? INCIDENT_EMPTY_LABEL : CONSEQUENCE_EMPTY_LABEL));
        } else {
          for (let order = 0; order < items.length; order += 1) {
            const item = items[order];
            const key = `${chainId}:${item.nodeIndex}`;
            const button = el('button', `k-word k-word--body fp-node fp-node--${asString(item.node.k) || 'entry'}`, nodeWord(item.node));
            button.type = 'button';
            button.setAttribute('data-node-key', key);
            button.setAttribute('data-chain-id', chainId);
            button.setAttribute('data-node-index', String(item.nodeIndex));
            button.setAttribute('data-col', String(col));
            button.setAttribute('data-order', String(order));
            button.setAttribute('tabindex', '-1');
            const why = nodeWhy(item.node);
            if (why) button.setAttribute('data-why', why);
            button.setAttribute('aria-label', `${COLUMN_NAMES[col]} · ${button.textContent}`);
            cell.append(button);
            this._nodeButtons.set(key, button);
            this._nodeMeta.set(key, {
              chainId,
              nodeIndex: item.nodeIndex,
              col,
              order,
              beam: beamOrder,
              tick: asInteger(item.node.tick, 0),
            });
            beamOrder += 1;
          }
        }
        chainEl.append(cell);
      }
      this._nodes.append(chainEl);
    }

    // With no chain on the stage the column heads carry the empty tags; with one, its cells do.
    this._incidentState.textContent = chain || sawIncident ? '' : INCIDENT_EMPTY_LABEL;
    this._consequenceState.textContent = chain || sawConsequence ? '' : CONSEQUENCE_EMPTY_LABEL;
    this._board.hidden = !chain;
    this._applyTraceClasses();
  },

  _queueEdgeDraw() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this._drawEdges();
    });
  },

  /** The dial takes a square as tall as the stage (never more than 56 % of its width). */
  _layoutStage() {
    if (!this._stage || typeof this._stage.getBoundingClientRect !== 'function') return;
    const rect = this._stage.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return;
    const w = Math.round(Math.min(rect.height, rect.width * 0.56));
    const was = this._stage.style.getPropertyValue('--fp-dial-w');
    if (was !== `${w}px`) this._stage.style.setProperty('--fp-dial-w', `${w}px`);
    if (this._read) {
      const over = this._read.scrollHeight > this._read.clientHeight + 2
        && this._read.scrollTop + this._read.clientHeight < this._read.scrollHeight - 2;
      this._read.dataset.overflow = over ? '1' : '0';
    }
  },

  /** The beam's causal loops (edges the spine does not already carry) and the dial's link to it. */
  _drawEdges() {
    this._layoutStage();
    if (!this._edges || !this._board) return;
    const svg = this._edges;
    svg.textContent = '';
    const boardRect = this._board.getBoundingClientRect();
    if (!(boardRect.width > 0) || !(boardRect.height > 0)) {
      if (this._dial) this._dial.setLink(null);
      return;
    }
    svg.setAttribute('viewBox', `0 0 ${Math.round(boardRect.width)} ${Math.round(boardRect.height)}`);

    const centers = new Map();
    let firstY = null;
    let lastY = null;
    for (const [key, button] of this._nodeButtons.entries()) {
      const rect = button.getBoundingClientRect();
      const y = rect.top - boardRect.top + Math.min(BEAD_Y, rect.height / 2);
      centers.set(key, { x: SPINE_X, y, beam: (this._nodeMeta.get(key) || {}).beam });
      if (firstY == null || y < firstY) firstY = y;
      if (lastY == null || y > lastY) lastY = y;
    }

    for (const chain of this._renderedChains || []) {
      const chainId = asString(chain && chain.id);
      if (!chainId || !Array.isArray(chain.edges)) continue;
      for (const edge of chain.edges) {
        if (!Array.isArray(edge) || edge.length < 3) continue;
        const fromIdx = asInteger(edge[0], -1);
        const toIdx = asInteger(edge[1], -1);
        const edgeKind = asString(edge[2]) || 'caused';
        if (fromIdx < 0) continue; // a stub: the spine's own head carries it
        const from = centers.get(`${chainId}:${fromIdx}`);
        const to = centers.get(`${chainId}:${toIdx}`);
        if (!from || !to) continue;
        // Neighbours on the spine are joined by the spine itself; a loop marks a receipt that skips a
        // stage or spills over to another power.
        if (edgeKind === 'caused' && Math.abs(asNumber(from.beam, 0) - asNumber(to.beam, 0)) <= 1) continue;
        const dy = Math.abs(to.y - from.y);
        const k = Math.min(SPINE_X - 6, 10 + dy * 0.22);
        const d = `M ${from.x} ${from.y.toFixed(1)} C ${(from.x - k).toFixed(1)} ${from.y.toFixed(1)} ${(to.x - k).toFixed(1)} ${to.y.toFixed(1)} ${to.x} ${to.y.toFixed(1)}`;
        const bloom = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        bloom.setAttribute('d', d);
        bloom.setAttribute('class', 'fp-edge-bloom');
        svg.appendChild(bloom);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('class', 'fp-edge');
        path.setAttribute('data-chain-id', chainId);
        if (edgeKind === 'spillover') path.classList.add('fp-edge--spillover');
        if (edgeKind === 'stub') path.classList.add('fp-edge--stub');
        svg.appendChild(path);
      }
    }
    this._applyTraceClasses();

    // The link: from the traced sector out of the dial's gate to this spine, between its first and last beads.
    if (this._dial && this._dialHost && firstY != null) {
      const dialRect = this._dialHost.getBoundingClientRect();
      const readRect = this._read ? this._read.getBoundingClientRect() : boardRect;
      this._dial.setLink({
        x: boardRect.left - dialRect.left + SPINE_X,
        gutter: Math.min(readRect.left, boardRect.left) - dialRect.left - 18,
        y0: boardRect.top - dialRect.top + firstY,
        y1: boardRect.top - dialRect.top + lastY,
      });
    } else if (this._dial) {
      this._dial.setLink(null);
    }
  },

  _selectedChain() {
    const id = this._selectedChainId;
    if (!id) return null;
    return (this._chains || []).find((entry) => entry && entry.id === id) || null;
  },

  _selectedNode() {
    const chain = this._selectedChain();
    if (!chain || this._selectedNodeIndex == null || !Array.isArray(chain.nodes)) return null;
    return chain.nodes[this._selectedNodeIndex] || null;
  },

  _setSelection(chainId, nodeIndex, options = {}) {
    const previousChain = this._selectedChainId;
    this._selectedChainId = chainId || null;
    // null is "no receipt latched" (Number(null) would read it as the first receipt)
    this._selectedNodeIndex = nodeIndex != null && Number.isFinite(Number(nodeIndex)) ? Number(nodeIndex) : null;
    this._pendingFocusKey = options.focusKey || null;
    if (previousChain !== this._selectedChainId) {
      this._renderBoard();
      this._queueEdgeDraw();
    }
    this._applyTraceClasses();
    this._renderRecord();
    this._renderVerbs({ chart: true });
    this._rememberMemory();
  },

  _applyTraceClasses() {
    const chainId = this._selectedChainId;
    const selectedKey = chainId && this._selectedNodeIndex != null ? `${chainId}:${this._selectedNodeIndex}` : null;
    for (const [key, button] of this._nodeButtons.entries()) {
      const sameChain = chainId && key.startsWith(`${chainId}:`);
      button.classList.toggle('fp-node--spent', !!chainId && !sameChain);
      button.classList.toggle('fp-node--live', !!chainId && sameChain);
      button.classList.toggle('fp-node--latch', key === selectedKey);
      button.setAttribute('tabindex', key === (this._pendingFocusKey || selectedKey) ? '0' : '-1');
    }
    if (!selectedKey && !this._pendingFocusKey) {
      // No node traced yet: the newest act is the board's one Tab stop.
      const first = this._nodeButtons.keys().next();
      if (!first.done) this._nodeButtons.get(first.value).setAttribute('tabindex', '0');
    }
    if (this._pendingFocusKey) {
      const target = this._nodeButtons.get(this._pendingFocusKey);
      if (target && typeof target.focus === 'function') {
        try { target.focus({ preventScroll: true }); } catch (_) { target.focus(); }
      }
      this._pendingFocusKey = null;
    }
    const edges = this._edges ? Array.from(this._edges.querySelectorAll('.fp-edge')) : [];
    for (const edge of edges) {
      const sameChain = chainId && edge.getAttribute('data-chain-id') === chainId;
      edge.classList.toggle('fp-edge--spent', !!chainId && !sameChain);
      edge.classList.toggle('fp-edge--live', !!chainId && sameChain);
    }
  },

  _verbState() {
    const state = this._ctx && this._ctx.state;
    const chain = this._selectedChain();
    const player = state && state.player || {};
    const bounty = Math.max(0, asNumber(player.bounty, 0));
    const credits = Math.max(0, asNumber(player.credits, 0));
    const incident = chain ? findChainIncident(chain) : null;
    const factionId = chain ? findChainStandingFaction(chain) : null;
    const bribe = factionId ? bribeCost(factionId) : 0;

    const payBounty = bounty <= 0
      ? { enabled: false, reason: 'No bounty stands against you.' }
      : credits < bounty
        ? { enabled: false, reason: `${creditsText(bounty - credits)} short.` }
        : { enabled: true, reason: `Pay ${creditsText(bounty)} and clear standing bounty.` };

    const bribeState = (() => {
      if (!factionId) return { enabled: false, reason: 'Trace a chain with a standing node first.', cost: 0 };
      if (!Number.isFinite(bribe)) return { enabled: false, reason: 'Too hated to bribe.', cost: Infinity };
      if (bribe <= 0) return { enabled: false, reason: 'Not hostile — nothing to clear.', cost: 0 };
      if (credits < bribe) return { enabled: false, reason: `${creditsText(bribe - credits)} short.`, cost: bribe };
      return { enabled: true, reason: `Pay ${creditsText(bribe)} to lift to the -29 floor.`, cost: bribe };
    })();

    const accuser = incident && asString(incident.stationId)
      ? { enabled: true, reason: 'Plot local waypoint to the accusing station.' }
      : { enabled: false, reason: 'This chain has no recorded jurisdiction.' };

    const amends = {
      enabled: false,
      reason: factionId
        ? `No amends contract on offer — dock with ${shortFactionName(factionId)} to ask.`
        : 'No amends contract on offer — dock with the affected faction to ask.',
    };

    // One "Show on chart" word: framed on the traced chain when it is tied to a place, unframed when
    // nothing is traced, and quiet when the traced chain has no place.
    const showChart = !chain
      ? { enabled: true, reason: 'Open the chart.' }
      : asString(chain.sectorId)
        ? { enabled: true, reason: 'Open Chart framed on this chain.' }
        : { enabled: false, reason: 'This chain is not tied to a place.' };

    return { payBounty, bribeState, accuser, amends, showChart, factionId, incident };
  },

  /**
   * What a verb would do, drawn on the dial before it is pressed: the sources it settles (by the ledger's
   * own open rule, with the verb's effect applied), the figure it moves, or the place it points at. It
   * never promises heat: nothing on this screen writes heat, which clears by distance.
   */
  _verbPreview(action) {
    const state = this._ctx && this._ctx.state;
    if (!state || !state.player) return null;
    const v = this._verbState();
    const bounty = Math.max(0, asNumber(state.player.bounty, 0));
    const chains = this._chains || [];
    const settlesBy = (opts) => chains
      .filter((chain) => chain && chain.open === true && !chainHeldOpen(chain, state, opts))
      .map((chain) => asString(chain.id))
      .filter((id) => (this._sources || []).some((entry) => entry.id === id));
    const plural = (n) => `${n} source${n === 1 ? '' : 's'}`;
    if (action === 'pay-bounty') {
      if (!v.payBounty.enabled) return { action, settles: [], line: v.payBounty.reason };
      const settles = ['bounty', ...settlesBy({ bounty: 0 })];
      const stillOpen = chains.some((chain) => chain.open === true && !settles.includes(asString(chain.id)));
      const clean = !stillOpen && !isPlayerWanted(state);
      return {
        action, settles,
        bountyHtml: this._bountyHtml(bounty, 0),
        line: `Pays ${creditsText(bounty)} · settles ${plural(settles.length)}${clean ? ' · the record reads clean' : ''}`,
      };
    }
    if (action === 'bribe') {
      if (!v.bribeState.enabled) return { action, settles: [], line: v.bribeState.reason };
      const settles = settlesBy({ bounty, calmFaction: v.factionId });
      return {
        action, settles,
        line: `Pays ${creditsText(v.bribeState.cost)} · ${shortFactionName(v.factionId)} lifts to −29 · settles ${plural(settles.length)}`,
      };
    }
    if (action === 'find-accuser') {
      if (!v.accuser.enabled || !v.incident) return { action, settles: [], line: v.accuser.reason };
      const stationId = asString(v.incident.stationId);
      const name = entityLabel('station:' + stationId) || stationId;
      return { action, settles: [], bearing: name, line: `Plots a course to ${name} · settles nothing itself` };
    }
    if (action === 'show-chart') {
      const chain = this._selectedChain();
      const sectorId = chain && asString(chain.sectorId);
      if (!v.showChart.enabled) return { action, settles: [], line: v.showChart.reason };
      const name = sectorId ? (entityLabel('sector:' + sectorId) || sectorId) : null;
      return { action, settles: [], bearing: name, line: name ? `Opens the chart on ${name}` : 'Opens the chart' };
    }
    if (action === 'take-amends') return { action, settles: [], line: v.amends.reason };
    return null;
  },

  /** The verb that answers the traced source: the first one open to you that would settle it. */
  _primaryVerb() {
    const source = this._tracedSource();
    if (!source || !source.open) return null;
    for (const action of ['pay-bounty', 'bribe']) {
      const p = this._verbPreview(action);
      if (p && p.settles && p.settles.includes(source.id)) return action;
    }
    const v = this._verbState();
    return source.kind === 'chain' && v.accuser.enabled ? 'find-accuser' : null;
  },

  _preview(action) {
    this._previewAction = action || null;
    const state = this._ctx && this._ctx.state;
    const bounty = Math.max(0, asNumber(state && state.player && state.player.bounty, 0));
    const preview = action ? this._verbPreview(action) : null;
    if (this._foot) {
      for (const button of this._foot.querySelectorAll('.k-word')) {
        button.classList.toggle('is-previewing', !!action && button.dataset.action === action);
      }
    }
    if (!this._dial) return;
    this._dial.setPreview(preview);
    this._dial.setBountyHtml(preview && preview.bountyHtml ? preview.bountyHtml : this._bountyHtml(bounty));
  },

  _renderVerbs({ chart }) {
    if (!this._foot) return;
    const v = this._verbState();
    const primary = this._primaryVerb();
    const items = [
      { action: 'pay-bounty', label: 'Pay bounty', sub: v.payBounty.reason, disabled: !v.payBounty.enabled },
      { action: 'bribe', label: 'Bribe', sub: v.bribeState.reason, disabled: !v.bribeState.enabled },
      { action: 'find-accuser', label: 'Find the accuser', sub: v.accuser.reason, disabled: !v.accuser.enabled },
      { action: 'take-amends', label: 'Take amends contract', sub: v.amends.reason, disabled: !v.amends.enabled },
    ];
    if (chart) items.push({ action: 'show-chart', label: 'Show on chart', sub: v.showChart.reason, disabled: !v.showChart.enabled });
    // The Lamp Key answers the traced source; it stands first, the rest follow as words.
    for (const item of items) item.primary = item.action === primary;
    items.sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0));
    this._foot.textContent = '';
    const source = this._tracedSource();
    this._foot.append(el('p', 'fp-answer__k', source ? `Answer ${source.kind === 'bounty' ? 'the bounty' : 'this source'}` : 'Answer the record'));
    const list = words(items, {
      row: false,
      size: 'emph',
      ariaLabel: 'Footprint actions',
      onPick: (action) => this._runVerb(action),
    });
    for (const button of list.querySelectorAll('.k-word')) {
      const action = button.dataset.action;
      if (button.classList.contains('k-word--primary')) dressLampKey(button);
      // Every verb previews on the dial what it would do, under the pointer and under focus.
      button.addEventListener('pointerenter', () => this._preview(action));
      button.addEventListener('pointerleave', () => { if (this._previewAction === action && !button.matches(':focus')) this._preview(null); });
      button.addEventListener('focus', () => this._preview(action));
      button.addEventListener('blur', () => { if (this._previewAction === action) this._preview(null); });
    }
    this._foot.append(list);
  },

  /** The reading: the traced source's head of record, then the record below the verbs. */
  _renderRecord() {
    const record = this._record;
    if (!record) return;
    record.textContent = '';
    const state = this._ctx && this._ctx.state;
    const chain = this._selectedChain();
    const node = this._selectedNode();
    this._renderTraceHead(state, chain, node);
    record.append(el('div', 'k-caps', 'Chain record'));
    if (!chain || !state) {
      const head = el('div');
      head.innerHTML = footprintReadoutHtml(chain, node, state);
      record.append(head);
      return;
    }

    const lossLine = latestLossLine(state, asString(chain.sectorId));
    if (lossLine) record.append(el('p', 'k-sentence', lossLine));

    const sort = RECORD_SORTS.includes(this._recordSort) ? this._recordSort : 'time';
    const sortWords = words([
      { action: 'time', label: 'By time' },
      { action: 'delta', label: 'By delta' },
    ], {
      row: true,
      size: 'body',
      ariaLabel: 'Sort the record',
      onPick: (action) => {
        this._recordSort = RECORD_SORTS.includes(action) ? action : 'time';
        this._renderRecord();
        this._rememberMemory();
      },
    });
    for (const button of sortWords.querySelectorAll('.k-word')) {
      button.setAttribute('aria-pressed', String(button.dataset.action === sort));
    }
    record.append(sortWords);

    const nodeRows = (Array.isArray(chain.nodes) ? chain.nodes.slice() : [])
      .map((entry, index) => ({ node: entry, index }))
      .filter(({ node: entry }) => entry && typeof entry === 'object');
    nodeRows.sort((left, right) => {
      if (sort === 'delta') {
        const a = Math.abs(asNumber(left.node.delta, 0));
        const b = Math.abs(asNumber(right.node.delta, 0));
        if (b !== a) return b - a;
      }
      return nodeStamp(right.node) - nodeStamp(left.node);
    });
    const list = el('ul', 'k-rows');
    list.setAttribute('aria-label', 'Chain record');
    if (!nodeRows.length) list.append(staticRow('No nodes on this chain.', '', ''));
    for (const { node: entry } of nodeRows) {
      const factionId = asString(entry.factionId) || asString(entry.srcFaction);
      const faction = shortFactionName(factionId);
      const tier = asString(entry.newTier);
      const reason = repReasonLabel(entry.reason);
      const note = nodeWhy(entry) || asString(entry.text) || '';
      const name = el('span');
      name.append(`${sentenceCase(asString(entry.k) || 'entry')} · `);
      name.append(entityNode(faction, factionId ? 'faction:' + factionId : null));
      const sub = [`${cycleText(entry.t)} · tick ${asInteger(entry.tick, 0)}`, reason, tier, note].filter(Boolean).join(' · ');
      list.append(staticRow(name, sub, deltaText(entry.delta)));
    }
    record.append(list);

    const ledger = buildShipLedger(state, { page: 0, pageSize: SHIP_LEDGER_PAGE_SIZE });
    const ledgerRows = (ledger.entries || []).slice(0, SHIP_LEDGER_PAGE_SIZE);
    appendRecordSection(record, 'Ship ledger', ledgerRows.length
      ? ledgerRows.map((entry) => [entry.text || '', sentenceCase(String(entry.cycleLabel || '').toLowerCase()), ''])
      : [['No ship-ledger prose on this run.', '', '']]);

    const incident = findChainIncident(chain);
    const incidentStationId = incident && asString(incident.stationId);
    const incidentSub = el('span');
    if (incidentStationId) {
      incidentSub.append('station ');
      incidentSub.append(entityNode(
        entityLabel('station:' + incidentStationId) || incidentStationId,
        'station:' + incidentStationId,
      ));
    }
    appendRecordSection(record, 'Incident', [[
      incident ? (asString(incident.text) || asString(incident.cause) || 'Recorded') : 'No incident node on this chain.',
      incidentStationId ? incidentSub : '',
      '',
    ]]);

    const aceNode = (chain.nodes || []).find((entry) => entry && asString(entry.aceId));
    const aceRecord = aceNode && state.aceMemory && state.aceMemory[aceNode.aceId]
      ? state.aceMemory[aceNode.aceId]
      : null;
    const aceData = aceNode ? aceById(aceNode.aceId) : null;
    const aceName = el('span');
    if (aceRecord) {
      aceName.append(entityNode(
        aceRecord.name || (aceData && aceData.name) || aceNode.aceId,
        'captain:' + aceNode.aceId,
      ));
      aceName.append(` · ${aceRecord.crew || (aceData && aceData.crew) || 'Unknown crew'} · ${aceRecord.gimmickTag || (aceData && aceData.gimmickTag) || 'ace'}`);
    }
    appendRecordSection(record, 'Ace record', aceRecord
      ? [[
        aceName,
        `encountered ${aceRecord.encounterCount | 0} · fled ${aceRecord.fleeCount | 0} · flung ${aceRecord.flungCount | 0} · return tier ${aceRecord.returnTier | 0}${aceRecord.returnsBigger ? ' · returns bigger' : ''}`,
        '',
      ]]
      : [['No named ace memory linked to this chain.', '', '']]);

    const titleRows = Array.isArray(state.titles && state.titles.history)
      ? state.titles.history.slice(-4).reverse()
      : [];
    appendRecordSection(record, 'Titles', titleRows.length
      ? titleRows.map((row) => {
        const meta = TITLE_BY_ID.get(row.titleId);
        return [meta ? meta.title : row.titleId, row.holderKey || 'vacant', ''];
      })
      : [['No title terminals linked on this run.', '', '']]);

    // PQ-146 §6.2: the three open Line Contracts — physical puzzles derived from causal receipts.
    // A completed card names the route that proved it; an open one shows the physical goal.
    appendRecordSection(record, 'Line contracts', contractLedgerRows(state).map((row) => [
      `${row.name} · ${row.status}`,
      row.completion
        ? `Proved by ${row.completion.trickName} · tick ${row.completion.tick}`
        : row.brief,
      '',
    ]));
  },

  /** The traced source, named: where it sits on the ring, whether it holds the record open, its receipt. */
  _renderTraceHead(state, chain, node) {
    const host = this._trace;
    if (!host) return;
    host.textContent = '';
    const sources = this._sources || [];
    const source = this._tracedSource();
    if (!source) {
      host.append(el('p', 'fp-trace__k', 'The record'));
      host.append(el('h2', 'fp-trace__name', 'Nothing on the dial'));
      return;
    }
    const index = sources.indexOf(source);
    const bounty = Math.max(0, asNumber(state && state.player && state.player.bounty, 0));
    const status = source.kind === 'bounty' ? 'open · unpaid' : (source.open ? `open · ${chainOpenReason(chain, state)}` : 'settled');
    const top = el('div', 'fp-trace__top');
    if (source.token) {
      const crest = el('img', 'fp-trace__crest');
      crest.alt = '';
      crest.decoding = 'async';
      crest.src = source.token;
      crest.addEventListener('error', () => { crest.hidden = true; });
      top.append(crest);
    }
    const names = el('div', 'fp-trace__names');
    const k = el('p', 'fp-trace__k');
    k.append(el('b', '', `Source ${index + 1} / ${sources.length}`), ` · ${status}`);
    names.append(k, el('h2', 'fp-trace__name', source.kind === 'bounty' ? `${creditsText(bounty)} bounty` : source.name));
    top.append(names);
    host.append(top);
    const read = el('div', 'fp-trace__read');
    if (source.kind === 'bounty') {
      read.append(el('p', 'k-sentence k-sentence--emph', 'Posted against your hull'));
      read.append(el('p', 'k-sentence', chain
        ? 'The chain it stands on unfolds below. Paying settles the bounty and every chain it alone holds open; heat still clears by distance.'
        : 'No chain on the record carries it. Paying settles it; heat still clears by distance.'));
    } else {
      read.innerHTML = footprintReadoutHtml(chain, node, state);
    }
    host.append(read);
  },

  _rememberMemory() {
    const mem = this._ctx && this._ctx.screenMemory;
    if (!mem || typeof mem.set !== 'function') return;
    mem.set('footprint', {
      selectedChainId: this._selectedChainId || null,
      selectedNodeIndex: this._selectedNodeIndex != null && Number.isFinite(Number(this._selectedNodeIndex)) ? Number(this._selectedNodeIndex) : null,
      recordSort: RECORD_SORTS.includes(this._recordSort) ? this._recordSort : 'time',
      tracedSourceId: this._tracedSourceId || null,
    });
  },

  _restoreMemory() {
    const mem = this._ctx && this._ctx.screenMemory;
    if (!mem || typeof mem.get !== 'function') {
      this._selectedChainId = null;
      this._selectedNodeIndex = null;
      this._recordSort = 'time';
      this._tracedSourceId = null;
      return;
    }
    const bag = mem.get('footprint') || {};
    this._selectedChainId = asString(bag.selectedChainId);
    this._selectedNodeIndex = bag.selectedNodeIndex != null && Number.isFinite(Number(bag.selectedNodeIndex)) ? Number(bag.selectedNodeIndex) : null;
    this._recordSort = RECORD_SORTS.includes(bag.recordSort) ? bag.recordSort : 'time';
    this._tracedSourceId = asString(bag.tracedSourceId);
  },

  _focusBeam() {
    const key = this._selectedChainId && this._selectedNodeIndex != null
      ? `${this._selectedChainId}:${this._selectedNodeIndex}`
      : this._nodeButtons.keys().next().value;
    const button = key && this._nodeButtons.get(key);
    if (button) { try { button.focus({ preventScroll: false }); } catch (_) { button.focus(); } }
  },

  _onClick(event) {
    const target = event.target;
    const node = target && target.closest && target.closest('.fp-node');
    if (!node) return;
    const chainId = node.getAttribute('data-chain-id');
    const nodeIndex = asInteger(node.getAttribute('data-node-index'), -1);
    if (chainId && nodeIndex >= 0) {
      cue('confirm');
      this._setSelection(chainId, nodeIndex, { focusKey: `${chainId}:${nodeIndex}` });
    }
  },

  _onKeydown(event) {
    if (event.key === 'Escape') {
      // Escape lifts the node latch; with nothing latched it falls through to the screen manager.
      if (this._selectedNodeIndex == null) return;
      event.preventDefault();
      this._setSelection(this._selectedChainId, null);
      return;
    }
    const active = document.activeElement;
    if (!active || !active.classList || !active.classList.contains('fp-node')) return;
    const key = active.getAttribute('data-node-key');
    const meta = key && this._nodeMeta.get(key);
    if (!meta) return;
    if (event.key === 'ArrowLeft') {
      // Back to the dial: the traced source's sector key.
      const dialKey = this._dial && this._tracedSourceId ? this._dial.keyFor(this._tracedSourceId) : null;
      if (dialKey) { event.preventDefault(); try { dialKey.focus({ preventScroll: true }); } catch (_) { dialKey.focus(); } }
      return;
    }
    if (event.key === 'ArrowRight') {
      // On to the answer: the first verb open to you.
      const verb = this._foot && this._foot.querySelector('.k-word:not([aria-disabled="true"])');
      if (verb) { event.preventDefault(); try { verb.focus({ preventScroll: false }); } catch (_) { verb.focus(); } }
      return;
    }
    const deltaByKey = { ArrowUp: -1, ArrowDown: 1 };
    const delta = deltaByKey[event.key];
    if (!delta) return;
    event.preventDefault();
    const candidate = this._nextNode(meta, 0, delta);
    if (candidate) {
      cue('move');
      this._setSelection(candidate.chainId, candidate.nodeIndex, { focusKey: `${candidate.chainId}:${candidate.nodeIndex}` });
    }
  },

  /** The next receipt down (or up) the beam, in the spine's own order. */
  _nextNode(meta, colStep, rowStep) {
    const peers = [];
    for (const value of this._nodeMeta.values()) {
      if (value.chainId !== meta.chainId) continue;
      peers.push(value);
    }
    if (!peers.length) return null;
    peers.sort((left, right) => left.beam - right.beam);
    const idx = peers.findIndex((entry) => entry.nodeIndex === meta.nodeIndex);
    if (idx < 0) return null;
    const next = idx + (rowStep || colStep);
    if (next < 0 || next >= peers.length) return null;
    return peers[next];
  },

  _runVerb(verbId) {
    const state = this._ctx && this._ctx.state;
    const bus = this._ctx && this._ctx.bus;
    const manager = screenManagerFor(this._ctx);
    const chain = this._selectedChain();
    const status = this._verbState();
    if (!state || !bus) return;
    if (verbId === 'pay-bounty' && status.payBounty.enabled) {
      const payload = { source: 'footprint' };
      bus.emit('economy:payBounty', payload);
      this.refresh(this._ctx);
      return;
    }
    if (verbId === 'bribe' && status.bribeState.enabled && status.factionId) {
      const payload = { factionId: status.factionId, source: 'footprint' };
      bus.emit('faction:bribe', payload);
      this.refresh(this._ctx);
      return;
    }
    if (verbId === 'find-accuser' && status.accuser.enabled && status.incident && chain) {
      const stationId = asString(status.incident.stationId);
      const sectorId = asString(status.incident.sectorId) || asString(chain.sectorId);
      const target = mapTargetForStation(state, stationId, sectorId);
      if (target && Number.isFinite(target.x) && Number.isFinite(target.z)) {
        bus.emit('ui:setCourse', {
          kind: 'station',
          waypointKind: 'station',
          label: target.name || shortFactionName(target.factionId) || stationId,
          reason: 'Footprint accuser',
          stationId: stationId || target.stationId || null,
          sectorId: target.sectorId || sectorId || null,
          pos: { x: target.x, z: target.z },
          targetEntityId: target.entityId || null,
        });
      } else if (target && target.sectorId) {
        bus.emit('ui:setCourse', {
          kind: 'sector',
          sectorId: target.sectorId,
          label: target.name || target.sectorId,
          reason: 'Footprint accuser sector',
        });
      }
      if (manager && typeof manager.popScreen === 'function') manager.popScreen();
      return;
    }
    if (verbId === 'show-chart' && status.showChart.enabled) {
      if (!chain) {
        // Nothing traced: open the chart unframed, honest about having no target.
        openGalaxyMap(this._ctx, { focus: MAP_FOCUS.GALAXY, source: 'footprint-readout-empty' });
        cue('open');
        return;
      }
      const incident = findChainIncident(chain);
      const intent = {
        focus: MAP_FOCUS.GALAXY,
        sectorId: asString(chain.sectorId),
        stationId: incident && asString(incident.stationId),
        source: 'footprint-show-chart',
      };
      const target = resolveMapOpenTarget(state, intent);
      if (target && Number.isFinite(target.x) && Number.isFinite(target.z)) {
        intent.pos = { x: target.x, z: target.z };
      }
      const viewSeed = {
        zoom: 1,
        targetZoom: 1,
        cams: {
          galaxy: { cx: 0, cy: 0, zoom: 1 },
          system: { cx: 0, cy: 0, zoom: 1.5 },
          local: { cx: 0, cy: 0, zoom: 1.5 },
        },
      };
      applyMapOpenIntentToView(viewSeed, intent, state);
      openGalaxyMap(this._ctx, intent);
      cue('open');
    }
  },
};

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
