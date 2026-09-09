// THE FOOTPRINT (F3): the consequence graph as the picture.
// The sheet's line (design/frontend/direction/DIRECTION_SHEET.md §2, the instruments): "The
// consequence graph as the picture, drawn in bone hairlines on the sky; the node you trace at full
// strength, the rest at 38 %; your heat as a hero number; the frame goes wanted-cold when you are
// wanted." Built on the frontend kit (styles/kit.css, src/ui/kit/) per
// design/frontend/direction/tasks/TASK_C_STATION_INSTRUMENTS_CHART.md §1.10: the display word and
// the crest sentence in the title, the heat tier as the corner hero, the chains as rows down the
// hang, the traced chain's board and its record on the stage, the verbs as words along the foot.
// The board's layout rules (`fp-*`) live in styles/ui.css with kit tokens only; this file injects
// no CSS. The temperature (wanted-cold) is the kit's (src/ui/kit/temperature.js), never set here.
// Reads state.provenance.chains / openIncidents, state.player.heat and bounty; emits intents only.

import { FACTION_META } from '../../data/factions.js';
import { TITLES } from '../../data/titles.js';
import { REP_REASON_LABELS } from '../../data/repReasons.js';
import { bribeCost } from '../../systems/factions.js';
import { buildShipLedger, formatLedgerCycle, SHIP_LEDGER_PAGE_SIZE } from '../../systems/shipLedger.js';
import { latestLossLine } from '../../systems/lossLedger.js';
import { isPlayerWanted, heatLevelFor, heatClearSecondsForLevel, heatRadiusForLevel } from '../../systems/heat.js';
import { aceById } from '../../data/namedAces.js';
import { mountDataState, settleDataState } from '../uiPrimitives.js';
import { openGalaxyMap, MAP_FOCUS } from '../mapAuthority.js';
import { resolveMapOpenTarget, applyMapOpenIntentToView } from '../galaxyMap.js';
import { el, rows, words, hero, settle, cue } from '../kit/index.js';

const FACTION_BY_ID = new Map(FACTION_META.map((entry) => [entry.id, entry]));
const TITLE_BY_ID = new Map(TITLES.map((entry) => [entry.id, entry]));

// Sentence case: the display face is never all-caps as decoration (sheet §3). The `fp-display--*`
// tone classes stay on the word as inert hooks; the colour comes from the temperature, not a tint.
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
  if (!Number.isFinite(Number(value))) return '';
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
  const sector = escapeHtml(asString(chain.sectorId) || 'unfiled');
  const factionLine = faction
    ? `Faction focus ${escapeHtml(shortFactionName(faction))}.`
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

/** A hairline row that is read, not picked (`.k-row--static`). */
function staticRow(name, sub, num) {
  const row = el('li', 'k-row k-row--static');
  const body = el('div');
  body.append(el('span', 'k-row__name', name));
  if (sub) body.append(el('div', 'k-row__sub', sub));
  row.append(body, el('span', 'k-row__num', num || ''));
  return row;
}

/** A caps heading and its static rows, appended to the record. */
function appendRecordSection(host, caption, entries) {
  host.append(el('div', 'k-caps', caption));
  const list = el('ul', 'k-rows');
  list.setAttribute('aria-label', caption);
  for (const [name, sub, num] of entries) list.append(staticRow(name, sub, num));
  host.append(list);
}

export const footprintScreen = {
  id: 'footprint',
  accessibleName: 'Footprint records board',
  _ctx: null,
  _root: null,
  _title: null,
  _titleWord: null,
  _titleLine: null,
  _corner: null,
  _heatN: null,
  _heatW: null,
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
  _selectedChainId: null,
  _selectedNodeIndex: null,
  _recordSort: 'time',
  _nodeButtons: new Map(),
  _nodeMeta: new Map(),
  _renderedChains: [],
  _raf: 0,
  _resizeHandler: null,
  _pendingFocusKey: null,

  mount(rootEl, ctx) {
    this._ctx = ctx;
    this._root = rootEl;
    rootEl.innerHTML = '';
    rootEl.classList.remove('sf-footprint', 'sf-instrument', 'panel');
    rootEl.classList.add('k-screen');
    rootEl.dataset.kReady = '0';
    rootEl.setAttribute('aria-labelledby', 'sf-footprint-title');

    // .k-title — the display word (Clean / Marked / Wanted) and the crest sentence.
    const title = el('header', 'k-title');
    const word = el('h1', 'k-display k-t-title fp-display', DISPLAY_BY_STATE.clean.word);
    word.id = 'sf-footprint-title';
    const line = el('p', 'k-t-emph k-62 fp-line', '');
    title.append(word, line);
    this._title = title;
    this._titleWord = word;
    this._titleLine = line;

    // .k-hang — the chains as rows; rebuilt by _renderHang.
    const hang = el('div', 'k-hang');
    this._hang = hang;

    // .k-stage — the traced chain's board above, its record below; the data states in between.
    const stage = el('div', 'k-stage fp-stage');
    this._stage = stage;
    const stateHost = el('div', 'fp-statehost');
    stateHost.hidden = true;
    this._stateHost = stateHost;
    const board = el('div', 'fp-board');
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
    const record = el('div', 'fp-drawer');
    record.setAttribute('aria-label', 'Chain record');
    this._record = record;
    stage.append(stateHost, board, record);

    // .k-foot — the verbs as words; rebuilt by _renderVerbs.
    const foot = el('footer', 'k-foot');
    this._foot = foot;

    // .k-corner — the heat tier as the signal hero.
    const corner = el('div', 'k-corner');
    const heat = hero('T0', 'heat · clears in 0 s', { signal: true });
    this._heatN = heat.querySelector('.k-hero__n');
    this._heatW = heat.querySelector('.k-hero__w');
    corner.append(heat);
    this._corner = corner;

    rootEl.append(title, hang, stage, foot, corner);

    rootEl.addEventListener('click', (event) => this._onClick(event));
    rootEl.addEventListener('keydown', (event) => this._onKeydown(event));
    this._nodes.addEventListener('scroll', () => this._queueEdgeDraw());
  },

  onShow(ctx) {
    if (ctx) this._ctx = ctx;
    this._restoreMemory();
    this.refresh(this._ctx);
    if (!this._resizeHandler) {
      this._resizeHandler = () => this._queueEdgeDraw();
      window.addEventListener('resize', this._resizeHandler);
    }
    cue('open');
    try {
      settle(this._title, { from: 'top', state: 'footprint:open' });
      settle(this._hang, { from: 'left', state: 'footprint:open' });
      settle(this._stage, { from: 'right', state: 'footprint:open' });
      settle(this._foot, { from: 'bottom', state: 'footprint:open' });
    } catch (_) { /* motion is cosmetic */ }
    if (this._root) this._root.dataset.kReady = '1';
    try {
      const row = this._hangList && (this._hangList.querySelector('.k-row[aria-selected="true"]') || this._hangList.querySelector('.k-row'));
      if (row) row.focus({ preventScroll: true });
    } catch (_) { /* focus is a courtesy */ }
  },

  onHide() {
    this._rememberMemory();
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
    const clearSeconds = heatClearSecondsForLevel(heatLevel);
    const clearRadius = heatRadiusForLevel(heatLevel);
    const openChains = chains.filter((entry) => entry.open === true).length;

    this._titleWord.textContent = display.word;
    this._titleWord.classList.toggle('fp-display--foe', display.tone === 'foe');
    this._titleWord.classList.toggle('fp-display--goal', display.tone === 'goal');
    this._titleWord.classList.toggle('fp-display--calm', display.tone === 'calm');
    this._titleLine.textContent = `${creditsText(bounty)} standing · heat T${heatLevel} · clears in ${clearsText(clearSeconds)} · radius ${Math.round(clearRadius)} wu · ${openChains} open chain${openChains === 1 ? '' : 's'}`;
    this._heatN.textContent = `T${heatLevel}`;
    this._heatW.textContent = `heat · clears in ${clearsText(clearSeconds)}`;

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

    this._showBoard();
    this._ensureSelection();
    this._renderHang({ empty: true });
    this._renderBoard();
    this._renderRecord();
    this._renderVerbs({ chart: true });
    this._queueEdgeDraw();
  },

  _showDataState(kind, opts) {
    const stateOpts = opts && typeof opts === 'object' ? opts : {};
    this._board.hidden = true;
    this._record.hidden = true;
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

  _showBoard() {
    settleDataState(this._stateHost);
    this._stateHost.hidden = true;
    this._board.hidden = false;
    this._record.hidden = false;
  },

  /** The stage always shows one chain when there is one: the remembered chain, else the newest. */
  _ensureSelection() {
    const chains = this._chains || [];
    if (!chains.some((entry) => entry.id === this._selectedChainId)) {
      this._selectedChainId = chains.length ? chains[0].id : null;
      this._selectedNodeIndex = null;
    }
    const chain = this._selectedChain();
    if (chain && this._selectedNodeIndex != null && !chain.nodes[this._selectedNodeIndex]) this._selectedNodeIndex = null;
  },

  _renderHang({ empty }) {
    const state = this._ctx && this._ctx.state;
    const hang = this._hang;
    hang.textContent = '';
    hang.append(el('div', 'k-caps', 'Chains'));
    const chains = this._chains || [];
    if (!chains.length) {
      this._hangList = null;
      if (empty) hang.append(el('p', 'k-empty', 'No chains on this run.'));
      return;
    }
    const items = chains.map((chain) => ({
      id: chain.id,
      name: chainWord(chain),
      sub: `${chainStampText(chain)} · ${chainOpenReason(chain, state)}`,
      selected: chain.id === this._selectedChainId,
    }));
    const list = rows(items, {
      cols: 'minmax(0, 1fr) auto',
      ariaLabel: 'Chains',
      onPick: (id) => this._pickChain(id),
    });
    // The stage follows focus, not only a click: arrowing down the rows traces the next chain.
    list.addEventListener('focusin', (event) => {
      const row = event.target && event.target.closest ? event.target.closest('.k-row') : null;
      if (row && row.dataset.id && row.dataset.id !== this._selectedChainId) this._pickChain(row.dataset.id);
    });
    hang.append(list);
    this._hangList = list;
  },

  _syncHangSelection() {
    if (!this._hangList) return;
    for (const row of this._hangList.querySelectorAll('.k-row')) {
      row.setAttribute('aria-selected', String(row.dataset.id === this._selectedChainId));
    }
  },

  _pickChain(chainId) {
    const id = asString(chainId);
    if (!id || id === this._selectedChainId) return;
    if (!(this._chains || []).some((entry) => entry.id === id)) return;
    this._setSelection(id, null);
  },

  /** Only the traced chain is on the stage; the rest are rows in the hang. */
  _renderBoard() {
    const chain = this._selectedChain();
    const chains = chain ? [chain] : [];
    this._renderedChains = chains;
    this._nodeButtons = new Map();
    this._nodeMeta = new Map();
    if (this._nodes) this._nodes.textContent = '';
    let sawIncident = false;
    let sawConsequence = false;

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
        const cell = el('div', 'fp-cell');
        cell.setAttribute('data-col', String(col));
        const items = columns[col];
        if (items.length === 0) {
          if (col === 1 || col === 3) {
            cell.append(el('span', 'fp-col-empty k-t-fine k-38', col === 1 ? INCIDENT_EMPTY_LABEL : CONSEQUENCE_EMPTY_LABEL));
          }
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
              tick: asInteger(item.node.tick, 0),
            });
          }
        }
        chainEl.append(cell);
      }
      this._nodes.append(chainEl);
    }

    // With no chain on the stage the column heads carry the empty tags; with one, its cells do.
    this._incidentState.textContent = chain || sawIncident ? '' : INCIDENT_EMPTY_LABEL;
    this._consequenceState.textContent = chain || sawConsequence ? '' : CONSEQUENCE_EMPTY_LABEL;
    this._applyTraceClasses();
  },

  _queueEdgeDraw() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this._drawEdges();
    });
  },

  _drawEdges() {
    if (!this._edges || !this._board) return;
    const svg = this._edges;
    svg.textContent = '';
    const boardRect = this._board.getBoundingClientRect();
    if (!(boardRect.width > 0) || !(boardRect.height > 0)) return;
    svg.setAttribute('viewBox', `0 0 ${Math.round(boardRect.width)} ${Math.round(boardRect.height)}`);

    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'fp-arrow');
    marker.setAttribute('markerWidth', '8');
    marker.setAttribute('markerHeight', '8');
    marker.setAttribute('refX', '6');
    marker.setAttribute('refY', '4');
    marker.setAttribute('orient', 'auto-start-reverse');
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arrow.setAttribute('d', 'M0,0 L8,4 L0,8 Z');
    arrow.setAttribute('class', 'fp-edge-arrow');
    marker.appendChild(arrow);
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.appendChild(marker);
    svg.appendChild(defs);

    const centers = new Map();
    for (const [key, button] of this._nodeButtons.entries()) {
      const rect = button.getBoundingClientRect();
      centers.set(key, {
        x: rect.left - boardRect.left + rect.width / 2,
        y: rect.top - boardRect.top + rect.height / 2,
      });
    }

    for (const chain of this._renderedChains || []) {
      const chainId = asString(chain && chain.id);
      if (!chainId || !Array.isArray(chain.edges)) continue;
      for (const edge of chain.edges) {
        if (!Array.isArray(edge) || edge.length < 3) continue;
        const fromIdx = asInteger(edge[0], -1);
        const toIdx = asInteger(edge[1], -1);
        const edgeKind = asString(edge[2]) || 'caused';
        const toKey = `${chainId}:${toIdx}`;
        const to = centers.get(toKey);
        if (!to) continue;
        let from = null;
        if (fromIdx >= 0) {
          from = centers.get(`${chainId}:${fromIdx}`) || null;
        } else {
          from = { x: Math.max(8, to.x - 42), y: to.y };
        }
        if (!from) continue;
        const dx = Math.max(26, (to.x - from.x) * 0.45);
        const d = `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} C ${(from.x + dx).toFixed(1)} ${from.y.toFixed(1)} ${(to.x - dx).toFixed(1)} ${to.y.toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('class', 'fp-edge');
        path.setAttribute('data-chain-id', chainId);
        path.setAttribute('marker-end', 'url(#fp-arrow)');
        if (edgeKind === 'spillover') path.classList.add('fp-edge--spillover');
        if (edgeKind === 'stub') path.classList.add('fp-edge--stub');
        svg.appendChild(path);
      }
    }
    this._applyTraceClasses();
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
    this._selectedNodeIndex = Number.isFinite(Number(nodeIndex)) ? Number(nodeIndex) : null;
    this._pendingFocusKey = options.focusKey || null;
    if (previousChain !== this._selectedChainId) {
      this._syncHangSelection();
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

  _renderVerbs({ chart }) {
    if (!this._foot) return;
    const v = this._verbState();
    const items = [
      { action: 'pay-bounty', label: 'Pay bounty', sub: v.payBounty.reason, primary: true, disabled: !v.payBounty.enabled },
      { action: 'bribe', label: 'Bribe', sub: v.bribeState.reason, disabled: !v.bribeState.enabled },
      { action: 'find-accuser', label: 'Find the accuser', sub: v.accuser.reason, disabled: !v.accuser.enabled },
      { action: 'take-amends', label: 'Take amends contract', sub: v.amends.reason, disabled: !v.amends.enabled },
    ];
    if (chart) items.push({ action: 'show-chart', label: 'Show on chart', sub: v.showChart.reason, disabled: !v.showChart.enabled });
    this._foot.textContent = '';
    this._foot.append(words(items, {
      row: true,
      size: 'emph',
      ariaLabel: 'Footprint actions',
      onPick: (action) => this._runVerb(action),
    }));
  },

  /** The stage's lower half: the traced chain's head of record, its nodes as rows, then the ledger. */
  _renderRecord() {
    const record = this._record;
    if (!record) return;
    record.textContent = '';
    const state = this._ctx && this._ctx.state;
    const chain = this._selectedChain();
    const node = this._selectedNode();
    record.append(el('div', 'k-caps', 'Chain record'));
    const head = el('div');
    head.innerHTML = footprintReadoutHtml(chain, node, state);
    record.append(head);
    if (!chain || !state) return;

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
      const faction = shortFactionName(asString(entry.factionId) || asString(entry.srcFaction));
      const tier = asString(entry.newTier);
      const reason = repReasonLabel(entry.reason);
      const note = nodeWhy(entry) || asString(entry.text) || '';
      const name = `${sentenceCase(asString(entry.k) || 'entry')} · ${faction}`;
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
    appendRecordSection(record, 'Incident', [[
      incident ? (asString(incident.text) || asString(incident.cause) || 'Recorded') : 'No incident node on this chain.',
      incident && asString(incident.stationId) ? `station ${incident.stationId}` : '',
      '',
    ]]);

    const aceNode = (chain.nodes || []).find((entry) => entry && asString(entry.aceId));
    const aceRecord = aceNode && state.aceMemory && state.aceMemory[aceNode.aceId]
      ? state.aceMemory[aceNode.aceId]
      : null;
    const aceData = aceNode ? aceById(aceNode.aceId) : null;
    appendRecordSection(record, 'Ace record', aceRecord
      ? [[
        `${aceRecord.name || (aceData && aceData.name) || aceNode.aceId} · ${aceRecord.crew || (aceData && aceData.crew) || 'Unknown crew'} · ${aceRecord.gimmickTag || (aceData && aceData.gimmickTag) || 'ace'}`,
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
  },

  _rememberMemory() {
    const mem = this._ctx && this._ctx.screenMemory;
    if (!mem || typeof mem.set !== 'function') return;
    mem.set('footprint', {
      selectedChainId: this._selectedChainId || null,
      selectedNodeIndex: Number.isFinite(Number(this._selectedNodeIndex)) ? Number(this._selectedNodeIndex) : null,
      recordSort: RECORD_SORTS.includes(this._recordSort) ? this._recordSort : 'time',
    });
  },

  _restoreMemory() {
    const mem = this._ctx && this._ctx.screenMemory;
    if (!mem || typeof mem.get !== 'function') {
      this._selectedChainId = null;
      this._selectedNodeIndex = null;
      this._recordSort = 'time';
      return;
    }
    const bag = mem.get('footprint') || {};
    this._selectedChainId = asString(bag.selectedChainId);
    this._selectedNodeIndex = Number.isFinite(Number(bag.selectedNodeIndex)) ? Number(bag.selectedNodeIndex) : null;
    this._recordSort = RECORD_SORTS.includes(bag.recordSort) ? bag.recordSort : 'time';
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
    const deltaByKey = {
      ArrowLeft: { col: -1, row: 0 },
      ArrowRight: { col: 1, row: 0 },
      ArrowUp: { col: 0, row: -1 },
      ArrowDown: { col: 0, row: 1 },
    };
    const delta = deltaByKey[event.key];
    if (!delta) return;
    event.preventDefault();
    const candidate = this._nextNode(meta, delta.col, delta.row);
    if (candidate) {
      cue('move');
      this._setSelection(candidate.chainId, candidate.nodeIndex, { focusKey: `${candidate.chainId}:${candidate.nodeIndex}` });
    }
  },

  _nextNode(meta, colStep, rowStep) {
    const peers = [];
    for (const value of this._nodeMeta.values()) {
      if (value.chainId !== meta.chainId) continue;
      peers.push(value);
    }
    if (!peers.length) return null;
    if (colStep !== 0) {
      const targetCol = meta.col + colStep;
      const candidates = peers.filter((entry) => entry.col === targetCol)
        .sort((left, right) => left.order - right.order);
      if (!candidates.length) return null;
      let best = candidates[0];
      let score = Math.abs(best.order - meta.order);
      for (const entry of candidates) {
        const diff = Math.abs(entry.order - meta.order);
        if (diff < score) {
          best = entry;
          score = diff;
        }
      }
      return best;
    }
    const column = peers.filter((entry) => entry.col === meta.col)
      .sort((left, right) => left.order - right.order);
    const idx = column.findIndex((entry) => entry.nodeIndex === meta.nodeIndex);
    if (idx < 0) return null;
    const next = idx + rowStep;
    if (next < 0 || next >= column.length) return null;
    return column[next];
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
