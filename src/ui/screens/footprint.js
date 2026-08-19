import { FACTION_META } from '../../data/factions.js';
import { TITLES } from '../../data/titles.js';
import { REP_REASON_LABELS } from '../../data/repReasons.js';
import { bribeCost } from '../../systems/factions.js';
import { buildShipLedger, formatLedgerCycle, SHIP_LEDGER_PAGE_SIZE } from '../../systems/shipLedger.js';
import { latestLossLine } from '../../systems/lossLedger.js';
import { isPlayerWanted, heatLevelFor, heatClearSecondsForLevel, heatRadiusForLevel, THRESHOLD as WANTED_THRESHOLD } from '../../systems/heat.js';
import { aceById } from '../../data/namedAces.js';
import { mountDataState, settleDataState } from '../uiPrimitives.js';
import { openGalaxyMap, MAP_FOCUS } from '../mapAuthority.js';
import { resolveMapOpenTarget, applyMapOpenIntentToView } from '../galaxyMap.js';
import { prefersReducedMotion } from '../effects/effectRuntime.js';

const FACTION_BY_ID = new Map(FACTION_META.map((entry) => [entry.id, entry]));
const TITLE_BY_ID = new Map(TITLES.map((entry) => [entry.id, entry]));

const DISPLAY_BY_STATE = Object.freeze({
  clean: { word: 'CLEAN', tone: 'calm' },
  marked: { word: 'MARKED', tone: 'goal' },
  wanted: { word: 'WANTED', tone: 'foe' },
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

const COLUMN_NAMES = Object.freeze(['ACT', 'INCIDENT', 'STANDING', 'CONSEQUENCE']);
const INCIDENT_EMPTY_LABEL = 'NO JURISDICTION LOGGED THIS';
const CONSEQUENCE_EMPTY_LABEL = 'NOTHING HUNTS YOU YET';
const HEAT_GLYPHS = '░▒▓▣◇';
const DRAWER_SORTS = Object.freeze(['time', 'delta']);

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

function creditsText(value) {
  return `${Math.max(0, Math.round(asNumber(value, 0))).toLocaleString('en-US')} cr`;
}

function deltaText(value) {
  if (!Number.isFinite(Number(value))) return '';
  const n = Math.round(Number(value));
  if (n === 0) return '0';
  return n > 0 ? `+${n}` : String(n);
}

function secText(seconds) {
  const whole = Math.max(0, Math.round(asNumber(seconds, 0)));
  const mm = Math.floor(whole / 60);
  const ss = whole % 60;
  return `${mm}:${String(ss).padStart(2, '0')}`;
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
    const label = asString(node.text) || asString(node.cause) || 'jurisdiction log';
    return label.toUpperCase();
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
    return `SPILLOVER ${delta ? `(${delta})` : ''} · ${src}`;
  }
  if (kind === 'consequence') {
    return asString(node.text) || outcomeWord(node.outcome) || 'consequence';
  }
  return kind || 'entry';
}

function nodeWhy(node) {
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

function chainOpenReason(chain, state) {
  if (!chain || chain.open !== true) return 'settled';
  if (chain.bountyPending === true && asNumber(state && state.player && state.player.bounty, 0) > 0) return 'unpaid bounty';
  if (chain.amendsActive === true) return 'amends outstanding';
  return 'active aggro';
}

function defaultDrawerFilters() {
  return { outcome: '', faction: '', sector: '', sort: 'time' };
}

export const footprintScreen = {
  id: 'footprint',
  accessibleName: 'Footprint records board',
  _ctx: null,
  _root: null,
  _stage: null,
  _stateHost: null,
  _board: null,
  _heatField: null,
  _edges: null,
  _nodes: null,
  _crestWord: null,
  _crestLine: null,
  _crestMeta: null,
  _incidentState: null,
  _consequenceState: null,
  _readout: null,
  _verbs: null,
  _drawer: null,
  _drawerRows: null,
  _drawerLedger: null,
  _drawerMeta: null,
  _drawerControls: null,
  _selectedChainId: null,
  _selectedNodeIndex: null,
  _drawerOpen: false,
  _nodeButtons: new Map(),
  _nodeMeta: new Map(),
  _renderedChains: [],
  _drawerFilters: defaultDrawerFilters(),
  _loading: true,
  _raf: 0,
  _resizeHandler: null,
  _pendingFocusKey: null,

  mount(rootEl, ctx) {
    this._ctx = ctx;
    this._root = rootEl;
    rootEl.id = 'sf-footprint';
    rootEl.classList.add('sf-footprint', 'sf-instrument');
    rootEl.innerHTML = '';

    const crest = document.createElement('section');
    crest.className = 'sf-crest';
    crest.innerHTML = `
      <div class="fp-crest-main">
        <div class="fp-kicker">FOOTPRINT</div>
        <div class="sf-crest__title fp-display">CLEAN</div>
        <div class="sf-crest__line fp-line"></div>
      </div>
      <div class="fp-crest-meta"></div>`;
    this._crestWord = crest.querySelector('.fp-display');
    this._crestLine = crest.querySelector('.fp-line');
    this._crestMeta = crest.querySelector('.fp-crest-meta');

    const stage = document.createElement('section');
    stage.className = 'sf-stage fp-stage';
    this._stage = stage;
    const stateHost = document.createElement('div');
    stateHost.className = 'fp-statehost';
    stateHost.hidden = true;
    this._stateHost = stateHost;
    const board = document.createElement('div');
    board.className = 'fp-board';
    board.innerHTML = `
      <div class="fp-head">
        <div class="fp-col-head"><span>ACT</span></div>
        <div class="fp-col-head"><span>INCIDENT</span><small class="fp-col-state fp-col-state--incident"></small></div>
        <div class="fp-col-head"><span>STANDING</span></div>
        <div class="fp-col-head"><span>CONSEQUENCE</span><small class="fp-col-state fp-col-state--consequence"></small></div>
      </div>
      <div class="fp-field" aria-hidden="true"></div>
      <svg class="fp-edges" aria-hidden="true"></svg>
      <div class="fp-nodes" role="list"></div>`;
    this._board = board;
    this._heatField = board.querySelector('.fp-field');
    this._edges = board.querySelector('.fp-edges');
    this._nodes = board.querySelector('.fp-nodes');
    this._incidentState = board.querySelector('.fp-col-state--incident');
    this._consequenceState = board.querySelector('.fp-col-state--consequence');
    stage.append(stateHost, board);

    const apron = document.createElement('section');
    apron.className = 'sf-apron fp-apron';
    apron.innerHTML = `
      <div class="fp-apron-grid">
        <section class="fp-readout" aria-live="polite"></section>
        <section class="fp-verbs"></section>
      </div>`;
    this._readout = apron.querySelector('.fp-readout');
    this._verbs = apron.querySelector('.fp-verbs');

    const drawer = document.createElement('aside');
    drawer.className = 'sf-drawer fp-drawer';
    drawer.setAttribute('aria-modal', 'false');
    drawer.innerHTML = `
      <div class="sf-drawer__deck fp-drawer-deck">
        <div class="fp-drawer-head">
          <button type="button" class="fp-drawer-close" data-fp-act="drawer-close" aria-label="Close record drawer">×</button>
          <div class="fp-kicker">RECORD</div>
          <h2 class="fp-drawer-title">Chain record</h2>
        </div>
        <div class="fp-drawer-meta"></div>
        <div class="fp-drawer-controls"></div>
        <div class="fp-drawer-rows"></div>
        <div class="fp-drawer-ledger"></div>
      </div>`;
    this._drawer = drawer;
    this._drawerMeta = drawer.querySelector('.fp-drawer-meta');
    this._drawerControls = drawer.querySelector('.fp-drawer-controls');
    this._drawerRows = drawer.querySelector('.fp-drawer-rows');
    this._drawerLedger = drawer.querySelector('.fp-drawer-ledger');

    rootEl.append(crest, stage, apron, drawer);

    rootEl.addEventListener('click', (event) => this._onClick(event));
    rootEl.addEventListener('keydown', (event) => this._onKeydown(event));
    rootEl.addEventListener('input', (event) => this._onInput(event));
  },

  onShow(ctx) {
    if (ctx) this._ctx = ctx;
    this._loading = false;
    this._restoreMemory();
    this.refresh(this._ctx);
    if (!this._resizeHandler) {
      this._resizeHandler = () => this._queueEdgeDraw();
      window.addEventListener('resize', this._resizeHandler);
    }
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
  },

  refresh(ctx) {
    if (ctx) this._ctx = ctx;
    const state = this._ctx && this._ctx.state;
    if (!state || !state.player) {
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
      .filter((entry) => entry && Array.isArray(entry.nodes))
      .slice()
      .sort((left, right) => chainStamp(right) - chainStamp(left));
    const player = state.player;
    const bounty = Math.max(0, asNumber(player.bounty, 0));
    const display = DISPLAY_BY_STATE[wantedState(state)];
    const heatLevel = heatLevelFor(asNumber(player.heat, 0));
    const clearSeconds = heatClearSecondsForLevel(heatLevel);
    const clearRadius = heatRadiusForLevel(heatLevel);
    const openChains = chains.filter((entry) => entry && entry.open === true).length;

    this._crestWord.textContent = display.word;
    this._crestWord.classList.toggle('fp-display--foe', display.tone === 'foe');
    this._crestWord.classList.toggle('fp-display--goal', display.tone === 'goal');
    this._crestWord.classList.toggle('fp-display--calm', display.tone === 'calm');
    this._crestLine.textContent = `${creditsText(bounty)} standing · HEAT T${heatLevel} · clears in ${secText(clearSeconds)} · radius ${Math.round(clearRadius)} wu · ${openChains} open chain${openChains === 1 ? '' : 's'}`;
    this._crestMeta.innerHTML = `
      <div class="fp-meta-line">Bounty hunters exist while bounty stands. Director pressure rises while it stays unpaid.</div>
      <div class="fp-meta-line">Threshold: WANTED at heat ${Math.round(WANTED_THRESHOLD * 100)}%.</div>`;

    const reducedMotion = prefersReducedMotion({
      motionReduce: !!(state.settings && state.settings.video && state.settings.video.motionReduce),
    });
    this._root.classList.toggle('fp-reduced', reducedMotion);
    this._renderHeatField(asNumber(player.heat, 0));

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
    } else {
      this._showBoard();
      this._renderBoard(chains.slice(0, 12));
      this._renderReadout();
      this._renderVerbs();
      this._renderDrawer();
      this._queueEdgeDraw();
    }
  },

  _showDataState(kind, opts) {
    const stateOpts = opts && typeof opts === 'object' ? opts : {};
    this._board.hidden = true;
    this._stateHost.hidden = false;
    mountDataState(this._stateHost, kind, {
      code: stateOpts.code,
      headline: stateOpts.headline,
      fills: stateOpts.fills,
      verb: stateOpts.verb,
      skeleton: stateOpts.skeleton,
    });
    this._renderReadout();
    this._renderVerbs();
    this._renderDrawer();
  },

  _showBoard() {
    settleDataState(this._stateHost);
    this._stateHost.hidden = true;
    this._board.hidden = false;
  },

  _renderHeatField(heatValue) {
    if (!this._heatField) return;
    const heat = Math.max(0, Math.min(1, asNumber(heatValue, 0)));
    const rows = 10;
    const cols = 48;
    const glyphCount = Math.max(1, Math.round(heat * 4));
    const glyph = HEAT_GLYPHS[glyphCount] || HEAT_GLYPHS[0];
    const denseCols = Math.max(4, Math.round(cols * heat));
    const lines = [];
    for (let row = 0; row < rows; row += 1) {
      const spread = Math.max(2, denseCols - Math.round((row / rows) * 16));
      const leftPad = Math.max(0, Math.round((cols - spread) / 2));
      const rightPad = Math.max(0, cols - spread - leftPad);
      lines.push(`${' '.repeat(leftPad)}${glyph.repeat(spread)}${' '.repeat(rightPad)}`);
    }
    this._heatField.textContent = lines.join('\n');
  },

  _renderBoard(chains) {
    this._renderedChains = chains;
    this._nodeButtons = new Map();
    this._nodeMeta = new Map();
    if (this._nodes) this._nodes.textContent = '';
    const state = this._ctx && this._ctx.state;
    let sawIncident = false;
    let sawConsequence = false;

    for (const chain of chains) {
      const chainId = asString(chain.id);
      if (!chainId) continue;
      const chainEl = document.createElement('div');
      chainEl.className = 'fp-chain';
      chainEl.setAttribute('data-chain-id', chainId);
      chainEl.setAttribute('role', 'listitem');
      const columns = collectChainColumns(chain);
      if (columns[1].length > 0) sawIncident = true;
      if (columns[3].length > 0) sawConsequence = true;
      for (let col = 0; col < columns.length; col += 1) {
        const cell = document.createElement('div');
        cell.className = 'fp-cell';
        cell.setAttribute('data-col', String(col));
        const items = columns[col];
        if (items.length === 0) {
          if (col === 1 || col === 3) {
            const tag = document.createElement('span');
            tag.className = 'fp-col-empty';
            tag.textContent = col === 1 ? INCIDENT_EMPTY_LABEL : CONSEQUENCE_EMPTY_LABEL;
            cell.appendChild(tag);
          }
        } else {
          for (let order = 0; order < items.length; order += 1) {
            const item = items[order];
            const key = `${chainId}:${item.nodeIndex}`;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `fp-node fp-node--${asString(item.node.k) || 'entry'}`;
            button.setAttribute('data-node-key', key);
            button.setAttribute('data-chain-id', chainId);
            button.setAttribute('data-node-index', String(item.nodeIndex));
            button.setAttribute('data-col', String(col));
            button.setAttribute('data-order', String(order));
            button.setAttribute('tabindex', '-1');
            button.textContent = nodeWord(item.node);
            const why = nodeWhy(item.node);
            if (why) button.setAttribute('data-why', why);
            button.setAttribute('aria-label', `${COLUMN_NAMES[col]} · ${button.textContent}`);
            cell.appendChild(button);
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
        chainEl.appendChild(cell);
      }
      this._nodes.appendChild(chainEl);
    }

    this._incidentState.textContent = sawIncident ? '' : INCIDENT_EMPTY_LABEL;
    this._consequenceState.textContent = sawConsequence ? '' : CONSEQUENCE_EMPTY_LABEL;
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
    return (this._renderedChains || []).find((entry) => entry && entry.id === id) || null;
  },

  _selectedNode() {
    const chain = this._selectedChain();
    if (!chain || this._selectedNodeIndex == null || !Array.isArray(chain.nodes)) return null;
    return chain.nodes[this._selectedNodeIndex] || null;
  },

  _setSelection(chainId, nodeIndex, options = {}) {
    this._selectedChainId = chainId || null;
    this._selectedNodeIndex = Number.isFinite(Number(nodeIndex)) ? Number(nodeIndex) : null;
    if (options.openDrawer === true) this._drawerOpen = true;
    if (options.clearDrawer === true) this._drawerOpen = false;
    this._pendingFocusKey = options.focusKey || null;
    this._applyTraceClasses();
    this._renderReadout();
    this._renderVerbs();
    this._renderDrawer();
    this._rememberMemory();
  },

  _clearTrace() {
    this._setSelection(null, null, { clearDrawer: true });
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

  _renderReadout() {
    if (!this._readout) return;
    const state = this._ctx && this._ctx.state;
    const chain = this._selectedChain();
    const node = this._selectedNode();
    if (!chain) {
      this._readout.innerHTML = `
        <h3 class="fp-readout-head">Trace a chain</h3>
        <p class="fp-readout-line">Select an ACT, INCIDENT, STANDING, or CONSEQUENCE node to light its path.</p>`;
      return;
    }
    const why = nodeWhy(node);
    const faction = findChainStandingFaction(chain) || asString(node && node.factionId);
    this._readout.innerHTML = `
      <h3 class="fp-readout-head">${asString(chain.rootKind) || 'chain'} · ${outcomeWord(chain.outcome) || 'witnessed'}</h3>
      <p class="fp-readout-line">${why || 'No additional receipt text for this node.'}</p>
      <p class="fp-readout-line">Open state: ${chainOpenReason(chain, state)}.</p>
      <p class="fp-readout-line">${faction ? `Faction focus: ${shortFactionName(faction)}.` : 'Faction focus unresolved.'}</p>`;
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
      if (!factionId) return { enabled: false, reason: 'Select a standing node first.', cost: 0 };
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

    const showChart = chain && asString(chain.sectorId)
      ? { enabled: true, reason: 'Open Chart framed on this chain.' }
      : { enabled: false, reason: 'This chain is not tied to a place.' };

    return { payBounty, bribeState, accuser, amends, showChart, factionId, incident };
  },

  _renderVerbs() {
    if (!this._verbs) return;
    const v = this._verbState();
    const defs = [
      { id: 'pay-bounty', label: 'PAY BOUNTY', state: v.payBounty },
      { id: 'bribe', label: 'BRIBE', state: v.bribeState },
      { id: 'find-accuser', label: 'FIND THE ACCUSER', state: v.accuser },
      { id: 'take-amends', label: 'TAKE AMENDS CONTRACT', state: v.amends },
      { id: 'show-chart', label: 'SHOW ON CHART', state: v.showChart },
    ];
    const html = defs.map((entry) => {
      const disabled = entry.state.enabled ? '' : ' disabled';
      const reason = entry.state.reason || '';
      const aria = `${entry.label}. ${reason}`;
      return `
        <button type="button" class="fp-verb" data-fp-verb="${entry.id}"${disabled} aria-label="${escapeAttr(aria)}" title="${escapeAttr(reason)}">
          <span class="fp-verb-label">${entry.label}</span>
          <span class="fp-verb-reason">${escapeHtml(reason)}</span>
        </button>`;
    }).join('');
    this._verbs.innerHTML = html;
  },

  _renderDrawer() {
    if (!this._drawer) return;
    this._drawer.classList.toggle('is-open', this._drawerOpen === true);
    const chain = this._selectedChain();
    const state = this._ctx && this._ctx.state;
    if (!this._drawerOpen || !chain || !state) {
      this._drawerMeta.innerHTML = '<p class="fp-drawer-line">Select a chain and press Enter to open the record drawer.</p>';
      this._drawerControls.innerHTML = '';
      this._drawerRows.innerHTML = '';
      this._drawerLedger.innerHTML = '';
      return;
    }

    const outcomeFilter = (this._drawerFilters.outcome || '').toLowerCase();
    const factionFilter = (this._drawerFilters.faction || '').toLowerCase();
    const sectorFilter = (this._drawerFilters.sector || '').toLowerCase();
    const sort = DRAWER_SORTS.includes(this._drawerFilters.sort) ? this._drawerFilters.sort : 'time';

    const rows = (Array.isArray(chain.nodes) ? chain.nodes.slice() : [])
      .map((node, index) => ({ node, index }))
      .filter(({ node }) => {
        const outcome = outcomeWord(node.outcome).toLowerCase();
        const faction = shortFactionName(asString(node.factionId) || asString(node.srcFaction)).toLowerCase();
        const sector = (asString(node.sectorId) || asString(chain.sectorId) || '').toLowerCase();
        if (outcomeFilter && !outcome.includes(outcomeFilter)) return false;
        if (factionFilter && !faction.includes(factionFilter)) return false;
        if (sectorFilter && !sector.includes(sectorFilter)) return false;
        return true;
      });

    rows.sort((left, right) => {
      if (sort === 'delta') {
        const a = Math.abs(asNumber(left.node.delta, 0));
        const b = Math.abs(asNumber(right.node.delta, 0));
        if (b !== a) return b - a;
      }
      return nodeStamp(right.node) - nodeStamp(left.node);
    });

    const incident = findChainIncident(chain);
    const lossLine = latestLossLine(state, asString(chain.sectorId));
    const aceNode = (chain.nodes || []).find((node) => node && asString(node.aceId));
    const aceRecord = aceNode && state.aceMemory && state.aceMemory[aceNode.aceId]
      ? state.aceMemory[aceNode.aceId]
      : null;
    const aceData = aceNode ? aceById(aceNode.aceId) : null;
    const titleRows = Array.isArray(state.titles && state.titles.history)
      ? state.titles.history.slice(-4).reverse()
      : [];

    this._drawerMeta.innerHTML = `
      <p class="fp-drawer-line">Sector: ${escapeHtml(asString(chain.sectorId) || 'unfiled')}</p>
      <p class="fp-drawer-line">Open reason: ${escapeHtml(chainOpenReason(chain, state))}</p>
      <p class="fp-drawer-line">${lossLine ? escapeHtml(lossLine) : 'No loss-ledger line recorded for this sector.'}</p>`;

    this._drawerControls.innerHTML = `
      <label class="fp-control">Outcome filter
        <input type="text" data-fp-filter="outcome" value="${escapeAttr(this._drawerFilters.outcome || '')}" placeholder="destroyed / surrendered / ...">
      </label>
      <label class="fp-control">Faction filter
        <input type="text" data-fp-filter="faction" value="${escapeAttr(this._drawerFilters.faction || '')}" placeholder="Concord / Reach / ...">
      </label>
      <label class="fp-control">Sector filter
        <input type="text" data-fp-filter="sector" value="${escapeAttr(this._drawerFilters.sector || '')}" placeholder="sector id">
      </label>
      <button type="button" class="fp-sort" data-fp-act="toggle-sort">Sort: ${sort === 'time' ? 'time' : '|delta|'}</button>`;

    this._drawerRows.innerHTML = rows.length
      ? rows.map(({ node }) => {
        const faction = shortFactionName(asString(node.factionId) || asString(node.srcFaction));
        const tier = asString(node.newTier);
        const reason = repReasonLabel(node.reason);
        const note = nodeWhy(node) || asString(node.text) || '';
        return `
          <article class="fp-row">
            <div class="fp-row-head">
              <span class="fp-row-kind">${escapeHtml((asString(node.k) || 'entry').toUpperCase())}</span>
              <span class="fp-row-cycle">${escapeHtml(formatLedgerCycle(asNumber(node.t, 0)))}</span>
              <span class="fp-row-tick">tick ${asInteger(node.tick, 0)}</span>
            </div>
            <div class="fp-row-body">
              <span>${escapeHtml(faction)}</span>
              ${reason ? `<span>${escapeHtml(reason)}</span>` : ''}
              ${deltaText(node.delta) ? `<span>${escapeHtml(deltaText(node.delta))}</span>` : ''}
              ${tier ? `<span>${escapeHtml(tier)}</span>` : ''}
              ${note ? `<span>${escapeHtml(note)}</span>` : ''}
            </div>
          </article>`;
      }).join('')
      : '<p class="fp-drawer-line">No rows match the current filters.</p>';

    const ledger = buildShipLedger(state, { page: 0, pageSize: SHIP_LEDGER_PAGE_SIZE });
    const ledgerRows = (ledger.entries || []).slice(0, SHIP_LEDGER_PAGE_SIZE);
    const ledgerHtml = ledgerRows.length
      ? ledgerRows.map((entry) => `<li>${escapeHtml(entry.cycleLabel || '')} · ${escapeHtml(entry.text || '')}</li>`).join('')
      : '<li>No ship-ledger prose on this run.</li>';

    const aceHtml = aceRecord
      ? `<p class="fp-drawer-line">Ace: ${escapeHtml(aceRecord.name || (aceData && aceData.name) || aceNode.aceId)} · ${escapeHtml(aceRecord.crew || (aceData && aceData.crew) || 'Unknown crew')} · ${escapeHtml(aceRecord.gimmickTag || (aceData && aceData.gimmickTag) || 'ace')}</p>
         <p class="fp-drawer-line">encountered ${aceRecord.encounterCount | 0} · fled ${aceRecord.fleeCount | 0} · flung ${aceRecord.flungCount | 0} · return tier ${aceRecord.returnTier | 0}${aceRecord.returnsBigger ? ' · BIGGER' : ''}</p>`
      : '<p class="fp-drawer-line">No named ace memory linked to this chain.</p>';

    const titleHtml = titleRows.length
      ? titleRows.map((row) => {
        const meta = TITLE_BY_ID.get(row.titleId);
        const title = meta ? meta.title : row.titleId;
        return `<li>${escapeHtml(title)} · ${escapeHtml(row.holderKey || 'vacant')}</li>`;
      }).join('')
      : '<li>No title terminals linked on this run.</li>';

    this._drawerLedger.innerHTML = `
      <section class="fp-ledger-block">
        <h3>Ship ledger</h3>
        <ul>${ledgerHtml}</ul>
      </section>
      <section class="fp-ledger-block">
        <h3>Incident</h3>
        <p>${incident ? escapeHtml(asString(incident.text) || asString(incident.cause) || 'Recorded') : 'No incident node on this chain.'}</p>
      </section>
      <section class="fp-ledger-block">
        <h3>Ace record</h3>
        ${aceHtml}
      </section>
      <section class="fp-ledger-block">
        <h3>Titles</h3>
        <ul>${titleHtml}</ul>
      </section>`;
  },

  _rememberMemory() {
    const mem = this._ctx && this._ctx.screenMemory;
    if (!mem || typeof mem.set !== 'function') return;
    mem.set('footprint', {
      selectedChainId: this._selectedChainId || null,
      selectedNodeIndex: Number.isFinite(Number(this._selectedNodeIndex)) ? Number(this._selectedNodeIndex) : null,
      drawerOpen: this._drawerOpen === true,
      filters: { ...this._drawerFilters },
    });
  },

  _restoreMemory() {
    const mem = this._ctx && this._ctx.screenMemory;
    if (!mem || typeof mem.get !== 'function') {
      this._selectedChainId = null;
      this._selectedNodeIndex = null;
      this._drawerOpen = false;
      this._drawerFilters = defaultDrawerFilters();
      return;
    }
    const bag = mem.get('footprint');
    this._selectedChainId = asString(bag.selectedChainId);
    this._selectedNodeIndex = Number.isFinite(Number(bag.selectedNodeIndex)) ? Number(bag.selectedNodeIndex) : null;
    this._drawerOpen = bag.drawerOpen === true;
    const filters = bag.filters && typeof bag.filters === 'object' ? bag.filters : {};
    this._drawerFilters = {
      outcome: asString(filters.outcome) || '',
      faction: asString(filters.faction) || '',
      sector: asString(filters.sector) || '',
      sort: DRAWER_SORTS.includes(filters.sort) ? filters.sort : 'time',
    };
  },

  _onClick(event) {
    const target = event.target;
    const node = target && target.closest && target.closest('.fp-node');
    if (node) {
      const chainId = node.getAttribute('data-chain-id');
      const nodeIndex = asInteger(node.getAttribute('data-node-index'), -1);
      if (chainId && nodeIndex >= 0) {
        this._ctx.bus.emit('audio:cue', { id: 'ui_confirm' });
        this._setSelection(chainId, nodeIndex, { focusKey: `${chainId}:${nodeIndex}` });
      }
      return;
    }
    const verb = target && target.closest && target.closest('[data-fp-verb]');
    if (verb && !verb.disabled) {
      this._runVerb(verb.getAttribute('data-fp-verb'));
      return;
    }
    const action = target && target.closest && target.closest('[data-fp-act]');
    if (action) {
      const kind = action.getAttribute('data-fp-act');
      if (kind === 'drawer-close') {
        this._drawerOpen = false;
        this._renderDrawer();
        this._rememberMemory();
      } else if (kind === 'toggle-sort') {
        this._drawerFilters.sort = this._drawerFilters.sort === 'time' ? 'delta' : 'time';
        this._renderDrawer();
        this._rememberMemory();
      }
    }
  },

  _onInput(event) {
    const input = event.target;
    if (!input || !input.getAttribute) return;
    const key = input.getAttribute('data-fp-filter');
    if (!key) return;
    if (!Object.prototype.hasOwnProperty.call(this._drawerFilters, key)) return;
    this._drawerFilters[key] = String(input.value || '');
    this._renderDrawer();
    this._rememberMemory();
  },

  _onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this._drawerOpen) {
        this._drawerOpen = false;
        this._renderDrawer();
        this._rememberMemory();
      } else {
        this._clearTrace();
      }
      return;
    }
    const active = document.activeElement;
    if (!active || !active.classList || !active.classList.contains('fp-node')) return;
    const key = active.getAttribute('data-node-key');
    const meta = key && this._nodeMeta.get(key);
    if (!meta) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      this._drawerOpen = true;
      this._setSelection(meta.chainId, meta.nodeIndex, { openDrawer: true, focusKey: key });
      return;
    }
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
      this._ctx.bus.emit('audio:cue', { id: 'ui_hover' });
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
      if (payload.result && payload.result.ok) bus.emit('audio:cue', { id: 'ui_confirm' });
      this.refresh(this._ctx);
      return;
    }
    if (verbId === 'bribe' && status.bribeState.enabled && status.factionId) {
      const payload = { factionId: status.factionId, source: 'footprint' };
      bus.emit('faction:bribe', payload);
      if (payload.result && payload.result.ok) bus.emit('audio:cue', { id: 'ui_confirm' });
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
      bus.emit('audio:cue', { id: 'ui_confirm' });
      return;
    }
    if (verbId === 'show-chart' && status.showChart.enabled && chain) {
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
      bus.emit('audio:cue', { id: 'ui_open' });
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

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

