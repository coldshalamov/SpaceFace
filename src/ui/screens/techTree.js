// src/ui/screens/techTree.js — Tech-tree progression screen (ARCHITECTURE §5, spec 09).
// ORRERY (design/frontend/ORRERY.md §6 Meta, "a constellation — nodes as stars, links as Beams"): the
// tree is the Research Constellation (src/ui/orrery/constellation.js), an orrery seen from above whose
// orbits are the tiers (the roots on the outermost, research falling inward to the core) and whose
// sectors are the branches. A node's state is its light: researched is full bone, open is a lit ring,
// locked is a dim point. The one amber Hand pivots at the core and swings to the chosen star; beside
// the dial the chosen node is a reading (its cost as two gauges of what you hold, the unlock as the one
// Lamp Key, what it unlocks and what it needs). The dial opens on the first node you can research now.
// Click, focus or arrow to a star to choose it; Unlock emits ui:unlockTech{nodeId} (ships handles it).
// READ-ONLY on state; emits intents only. The labelled node selector stays as the second keyboard
// and screen-reader route. This file owns no CSS (the composition is
// src/ui/orrery/constellationLayouts.js). ctx.font cannot resolve var(), so the canvas that measures
// the stars' names spells its faces below.
//
// Export: techTreeScreen  (id 'techTree'). No 'three' import.

import { dressLampKey } from '../orrery/lampKey.js';
import { createConstellation } from '../orrery/constellation.js';
import { injectConstellationScreens, legendStarSvg } from '../orrery/constellationLayouts.js';
import { rollTo, decrypt } from '../orrery/text.js';
import { TECH_NODES } from '../../data/tech.js';
import { SHIPS } from '../../data/ships.js';
import { MODULES } from '../../data/modules.js';
import { WEAPONS } from '../../data/weapons.js';
import { BODY_MODULES } from '../../data/claimableBodies.js';
import { escapeMarkup as escapeHtml } from '../views/identity.js';
import { entitySpanHtml } from '../entityResolver.js';
import { el, settle, cue } from '../kit/index.js';
import { wrapCanvasLines } from '../../localization/layout.js';
import { injectDeckplate } from '../deckplate/index.js';

// Branch -> sector, clockwise from the tier spoke at the top of the dial. Colour is by MEANING
// (researched / open / locked), never by branch. Combat, the largest, takes the left of the dial so its
// names read into the open margin; the smaller branches face the reading.
const BRANCHES = [
  { id: 'logistics', label: 'Logistics' },
  { id: 'industry',  label: 'Industry' },
  { id: 'drives',    label: 'Drives' },
  { id: 'combat',    label: 'Combat' },
];
const UNLOCK_NAME_BY_ID = new Map(
  [...SHIPS, ...MODULES, ...WEAPONS, ...BODY_MODULES].map((entry) => [entry.id, entry.name]),
);
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

// The canvas measures each star's name in the face the label is drawn in. ctx.font cannot resolve
// var(), so the faces are spelled: the kit's text face (styles/kit.css --k-text / --dp-face-read) for
// names, the display face for the cost readings.
const KIT_TEXT_FACE = '"Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
const KIT_DISPLAY_FACE = 'Archivo, system-ui, sans-serif';

/** A canvas font at `px` on screen, never under the 12 px floor. */
function kitFont(weight, px, face = KIT_TEXT_FACE) {
  const screenPx = Math.max(12, Number.isFinite(px) ? px : 12);
  return weight + ' ' + screenPx + 'px ' + face;
}

function setText(node, text) { if (node && node.textContent !== text) node.textContent = text; }

function nodeName(id, nodes = TECH_NODES) {
  const node = (nodes || []).find((n) => n && n.id === id);
  return (node && node.name) || cleanId(id);
}

function researchedSetFrom(stateOrIds) {
  if (Array.isArray(stateOrIds)) return new Set(stateOrIds);
  const player = stateOrIds && stateOrIds.player || {};
  return new Set(player.researchedNodes || []);
}

function missingCostParts(cost, player) {
  const credits = Math.max(0, Number(player && player.credits) || 0);
  const rp = Math.max(0, Number(player && player.researchPoints) || 0);
  const neededCredits = Math.max(0, Math.round((cost && cost.credits || 0) - credits));
  const neededRp = Math.max(0, Math.round((cost && cost.rp || 0) - rp));
  const parts = [];
  if (neededCredits > 0) parts.push(fmtCr(neededCredits) + ' cr');
  if (neededRp > 0) parts.push(neededRp.toLocaleString() + ' RP');
  return { neededCredits, neededRp, parts };
}

export function describeTechNodeReadiness(node, state, nodes = TECH_NODES) {
  if (!node) return { state: 'missing', actionLabel: 'Select a node', actionTitle: 'Select a tech node to inspect it.' };
  const player = state && state.player || {};
  const researched = researchedSetFrom(player.researchedNodes || []);
  const prereqs = node.prereqs || [];
  const missingPrereqs = prereqs.filter((id) => !researched.has(id)).map((id) => nodeName(id, nodes));
  if (researched.has(node.id)) {
    return {
      state: 'researched',
      actionLabel: 'Already researched',
      actionTitle: node.name + ' is already researched.',
      missingPrereqs,
      missingCost: [],
    };
  }
  if (missingPrereqs.length) {
    const label = missingPrereqs.length === 1
      ? 'Research ' + missingPrereqs[0] + ' first'
      : 'Research ' + missingPrereqs.length + ' prerequisites first';
    return {
      state: 'locked',
      actionLabel: label,
      actionTitle: 'Missing prerequisites: ' + missingPrereqs.join(', '),
      missingPrereqs,
      missingCost: [],
    };
  }
  const missing = missingCostParts(node.cost || {}, player);
  if (missing.parts.length) {
    return {
      state: 'funding',
      actionLabel: 'Need ' + missing.parts.join(' / '),
      actionTitle: 'Missing resources: ' + missing.parts.join(', '),
      missingPrereqs,
      missingCost: missing.parts,
      neededCredits: missing.neededCredits,
      neededRp: missing.neededRp,
    };
  }
  return {
    state: 'available',
    actionLabel: '⟫ Research',
    actionTitle: 'Research ' + node.name,
    missingPrereqs,
    missingCost: [],
  };
}

/** Every prerequisite a node stands on, transitively (the path back to its roots). */
function depthOf(id, byId, seen = new Set()) {
  const n = byId.get(id);
  if (!n || !n.prereqs || !n.prereqs.length || seen.has(id)) return 0;
  seen.add(id);
  let d = 0;
  for (const p of n.prereqs) if (byId.has(p)) d = Math.max(d, depthOf(p, byId, seen) + 1);
  seen.delete(id);
  return d;
}

/** A reading beside the dial: the number the corner shows, with its word. */
function reading(parent, word, hook) {
  const block = el('div', 'con-read');
  const n = el('span', 'con-read__n', '0');
  n.setAttribute(hook, '');
  block.append(n, el('span', 'con-read__w', word));
  parent.appendChild(block);
  return n;
}

export const techTreeScreen = {
  id: 'techTree',
  _ctx: null,
  _root: null,
  _sky: null,
  _g: null,
  _selectedId: null,
  _els: null,
  _drawSig: '',
  _sidebarSig: '',
  _researchedBefore: null,
  _held: null,

  mount(rootEl, ctx) {

    injectDeckplate();
    injectConstellationScreens();
    this._ctx = ctx;
    this._root = rootEl;
    rootEl.id = 'sf-techtree';
    rootEl.innerHTML = '';
    rootEl.classList.remove('panel', 'sf-menu', 'sf-menu-wide', 'sf-techtree', 'of-research', 'fh-shell');
    rootEl.classList.add('k-screen', 'con-research');
    rootEl.dataset.kReady = '0';
    rootEl.removeAttribute('data-fh-register');
    rootEl.setAttribute('aria-label', 'Research');

    // .k-title — "Research"; what the player can do here, in numbers, as the second line.
    const head = el('header', 'k-title con-head');
    const heading = el('h1', 'k-display k-t-title con-title', 'Research');
    head.appendChild(heading);
    const branchLine = el('p', 'k-t-emph k-62 con-sub', 'Select a node');
    head.appendChild(branchLine);
    rootEl.appendChild(head);

    // .k-corner — credits, research points, unlocked n/N as three thin readings.
    const corner = el('div', 'k-corner con-corner');
    corner.setAttribute('aria-label', 'Research resources');
    const crEl = reading(corner, 'Credits', 'data-cr');
    const rpEl = reading(corner, 'Research points', 'data-rp');
    const countEl = reading(corner, 'Unlocked', 'data-count');
    setText(countEl, '0/' + TECH_NODES.length);
    rootEl.appendChild(corner);

    // .k-stage — the constellation.
    const stage = el('section', 'k-stage con-stage');
    stage.setAttribute('aria-label', 'Tech tree');
    const skyHost = el('div', 'con-skyhost');
    stage.appendChild(skyHost);
    rootEl.appendChild(stage);

    // the chosen node, as a reading beside the dial
    const side = el('aside', 'con-side');
    side.setAttribute('aria-label', 'Selected node');
    const selected = el('div', 'con-dossier');
    selected.setAttribute('data-sel', '');
    const actions = el('div', 'con-actions');
    actions.setAttribute('data-actions', '');
    side.appendChild(selected);
    side.appendChild(actions);
    rootEl.appendChild(side);

    // .k-foot — Back, the legend (each word beside the star its nodes are), the node picker.
    const foot = el('footer', 'k-foot con-foot');
    foot.setAttribute('aria-label', 'Legend and actions');
    const back = el('button', 'k-word k-word--emph sf-back con-back', 'Back');
    back.type = 'button';
    back.dataset.action = 'back';
    back.addEventListener('click', () => {
      const mgr = ctx && (ctx.screenManager || (ctx.screens && typeof ctx.screens.popScreen === 'function' ? ctx.screens : null));
      if (mgr && typeof mgr.popScreen === 'function') mgr.popScreen();
      else if (ctx && ctx.bus) ctx.bus.emit('ui:popScreen', {});
    });
    foot.appendChild(back);
    const legend = el('div', 'con-legend');
    legend.setAttribute('aria-label', 'Legend');
    for (const [kind, word] of [['researched', 'Researched'], ['available', 'Open'], ['locked', 'Locked']]) {
      const item = el('span', 'con-legend__item');
      item.dataset.legend = kind;
      item.innerHTML = legendStarSvg(kind);
      item.appendChild(el('span', 'con-legend__word', word));
      legend.appendChild(item);
    }
    foot.appendChild(legend);
    // Stars are keyboard and pad reachable; the labelled selector is the second route. Selecting a
    // locked node is allowed: it reveals the exact prerequisite reason without pretending it can be
    // researched.
    const picker = el('div', 'con-picker');
    const nodeLabel = el('label', 'con-picker__label', 'Research node');
    const nodeSelect = el('select', 'k-select con-select');
    nodeSelect.id = 'sf-research-node'; nodeLabel.htmlFor = nodeSelect.id;
    const placeholder = el('option', '', 'Select a node'); placeholder.value = ''; nodeSelect.appendChild(placeholder);
    for (const node of this._nodes()) {
      const option = el('option', '', node.name); option.value = node.id; nodeSelect.appendChild(option);
    }
    nodeSelect.addEventListener('change', () => this._selectNode(nodeSelect.value));
    picker.appendChild(nodeLabel); picker.appendChild(nodeSelect);
    foot.appendChild(picker);
    this._nodeSelect = nodeSelect;
    rootEl.appendChild(foot);

    // the measuring canvas: never drawn, never in the document
    let g = null;
    try { g = typeof document !== 'undefined' && document.createElement('canvas').getContext('2d'); } catch (_) { g = null; }
    this._g = g && typeof g.measureText === 'function' ? g : null;
    const measure = (text, px, face) => {
      if (!this._g) return 0;
      this._g.font = face === 'label' ? kitFont(650, px, KIT_DISPLAY_FACE) : kitFont(500, px);
      return this._g.measureText(String(text)).width;
    };
    const wrap = (text, maxW, px) => {
      if (!this._g) return [String(text)];
      this._g.font = kitFont(500, px);
      return wrapCanvasLines((value) => this._g.measureText(value).width, text, maxW);
    };
    this._sky = createConstellation(skyHost, {
      measure,
      wrap,
      // the dial stands clear of the title tucked into its corner
      avoid: () => [heading, branchLine].map((node) => (node && typeof node.getBoundingClientRect === 'function' ? node.getBoundingClientRect() : null)),
      onPick: (id, how) => this._selectNode(id, { how }),
    });

    this._regions = { head, corner, stage, side, foot };
    this._els = { cr: crEl, rp: rpEl, count: countEl, branch: branchLine, selected, actions };

    actions.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (btn) this._onAction(btn.dataset.act);
    });

    // Web fonts land after first paint: measure the names again in the real face.
    if (typeof document !== 'undefined' && document.fonts && document.fonts.addEventListener) {
      document.fonts.addEventListener('loadingdone', () => {
        if (!this._root || !this._root.isConnected || !this._sky) return;
        this._sky.relayout();
      });
    }
  },

  onShow(ctx) {
    if (ctx) this._ctx = ctx;
    // The reading is never empty: the dial opens on the first node the player can research now.
    if (!this._selectedId || !this._nodes().some((n) => n.id === this._selectedId)) {
      this._selectedId = this._defaultNodeId();
    }
    if (this._nodeSelect) this._nodeSelect.value = this._selectedId || '';
    this._drawSig = '';
    this._researchedBefore = null;
    this.refresh(this._ctx);
    if (this._sky) {
      this._sky.choose(this._selectedId, { instant: true });
      this._sky.arrive();
    }
    this._decryptName();
    cue('open');
    if (typeof requestAnimationFrame === 'function' && this._regions) {
      try {
        settle(this._regions.head, { from: 'top', state: 'techTree:open' });
        settle(this._regions.corner, { from: 'top', state: 'techTree:open' });
        settle(this._regions.side, { from: 'right', state: 'techTree:open' });
        settle(this._regions.foot, { from: 'bottom', state: 'techTree:open' });
      } catch (e) { /* motion is cosmetic */ }
    }
    if (this._root) this._root.dataset.kReady = '1';
    // keyboard and pad land on the chosen star
    const focus = () => { if (this._sky && this._root && this._root.isConnected) this._sky.focusChosen(); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(focus)); else focus();
  },

  onHide() { cue('close'); /* cached DOM retained */ },

  refresh(ctx, opts = {}) {
    if (ctx) this._ctx = ctx;
    if (!this._root) return;
    this._syncHeader();
    const sidebarSig = this._sidebarSignature();
    if (!opts.periodic || sidebarSig !== this._sidebarSig) {
      this._sidebarSig = sidebarSig;
      this._syncSidebar();
    }
    const drawSig = this._drawSignature();
    if (!opts.periodic || drawSig !== this._drawSig) {
      this._drawSig = drawSig;
      const before = this._researchedBefore;
      const now = new Set(this._researched());
      this._pushSky();
      // A node just researched: light runs down the beams into it.
      if (before && this._sky) {
        const fresh = [...now].filter((id) => !before.has(id));
        if (fresh.length) this._sky.sweepInto(fresh);
      }
      this._researchedBefore = now;
    }
  },

  // ---- internals ----------------------------------------------------------
  _nodes() {
    const st = this._ctx && this._ctx.state;
    const c = st && st.content && st.content.techNodes;
    if (c && c.length) return c;
    return TECH_NODES;
  },

  _researched() {
    const st = this._ctx && this._ctx.state;
    return (st && st.player && st.player.researchedNodes) || [];
  },

  _isResearched(id) { return this._researched().includes(id); },

  _prereqsMet(node) {
    if (!node.prereqs || !node.prereqs.length) return true;
    const r = this._researched();
    return node.prereqs.every((p) => r.includes(p));
  },

  // state: 'researched' | 'available' | 'locked'
  _nodeState(node) {
    if (this._isResearched(node.id)) return 'researched';
    if (this._prereqsMet(node)) return 'available';
    return 'locked';
  },

  /** First node the player can research right now; else the first open one; else the next one. */
  _defaultNodeId() {
    const nodes = this._nodes();
    const st = this._ctx && this._ctx.state;
    const ready = nodes.find((n) => describeTechNodeReadiness(n, st, nodes).state === 'available');
    if (ready) return ready.id;
    const open = nodes.find((n) => this._nodeState(n) === 'available');
    if (open) return open.id;
    const next = nodes.find((n) => !this._isResearched(n.id));
    return (next || nodes[0] || {}).id || null;
  },

  /** Hand the constellation the tree and every star's state. */
  _pushSky() {
    if (!this._sky) return;
    const nodes = this._nodes();
    const states = {};
    const ready = {};
    const costs = {};
    for (const n of nodes) {
      states[n.id] = this._nodeState(n);
      ready[n.id] = states[n.id] === 'available' && this._affordable(n);
      const cost = n.cost || {};
      const rp = Math.round(cost.rp || 0);
      costs[n.id] = fmtCostCompact(cost.credits || 0) + ' cr' + (rp ? ' · ' + rp.toLocaleString() + ' RP' : '');
    }
    this._sky.set({
      nodes: nodes.map((n) => ({ id: n.id, name: n.name, branch: n.branch, prereqs: n.prereqs || [] })),
      branches: BRANCHES,
      states,
      ready,
      costs,
      chosen: this._selectedId,
    });
  },

  /** Whether the player holds the credits and research points a node costs. */
  _affordable(node) {
    const cost = (node && node.cost) || {};
    const player = (this._ctx && this._ctx.state && this._ctx.state.player) || {};
    return Math.round(cost.credits || 0) <= (Number(player.credits) || 0)
      && Math.round(cost.rp || 0) <= (Number(player.researchPoints) || 0);
  },

  _selectNode(id, { how = 'pick' } = {}) {
    if (!this._nodes().some((node) => node.id === id)) return;
    if (id === this._selectedId && how === 'focus') return;
    const changed = id !== this._selectedId;
    this._selectedId = id;
    if (this._nodeSelect) this._nodeSelect.value = id;
    if (changed) cue('move');
    this._syncSidebar();
    if (this._sky) this._sky.choose(id);
    if (changed) this._decryptName();
  },

  /** The chosen node's name resolves like telemetry when the choice changes. */
  _decryptName() {
    const name = this._els && this._els.selected && this._els.selected.querySelector('.con-dossier__name');
    if (name) decrypt(name, name.textContent, { duration: 240 });
  },

  _syncHeader() {
    const st = this._ctx.state;
    const player = st.player || {};
    const credits = Math.round(player.credits || 0);
    const rp = Math.round(player.researchPoints || 0);
    const held = this._held || (this._held = {});
    if (held.cr !== credits) { held.cr = credits; rollTo(this._els && this._els.cr, credits); }
    if (held.rp !== rp) { held.rp = rp; rollTo(this._els && this._els.rp, rp); }
    // Count only ids the live node table still knows: saves can carry ids of folded nodes.
    const known = new Set(this._nodes().map((n) => n.id));
    const researchedCount = this._researched().filter((id) => known.has(id)).length;
    setText(this._els && this._els.count, `${researchedCount}/${this._nodes().length}`);
    // The line under the title says what the player can do here, in numbers.
    const nodes = this._nodes();
    const ready = nodes.filter((n) => describeTechNodeReadiness(n, st, nodes).state === 'available').length;
    const open = nodes.filter((n) => this._nodeState(n) === 'available').length;
    const line = ready
      ? (ready === 1 ? 'One node' : ready + ' nodes') + ' ready to research now'
      : open
        ? (open === 1 ? 'One node is' : open + ' nodes are') + ' open; earn credits and research points to unlock them'
        : researchedCount >= nodes.length ? 'Every node researched' : 'Research the open nodes to reach the rest';
    setText(this._els && this._els.branch, line);
  },

  _paintDossier() {
    const actions = this._els && this._els.actions;
    if (!actions) return;
    const btn = actions.querySelector('button');
    if (btn && btn.getAttribute('data-act') === 'unlock' && btn.childNodes) dressLampKey(btn);
  },

  _syncSidebar() {
    const sel = this._els && this._els.selected;
    const actions = this._els && this._els.actions;
    if (!sel || !actions) return;
    this._sidebarSig = this._sidebarSignature();
    if (!this._selectedId) {
      if (actions.parentNode === sel && sel.parentNode) sel.parentNode.appendChild(actions);
      sel.innerHTML = `<p class="con-empty">Choose a star to read its cost, what it unlocks and what it needs.</p>`;
      actions.innerHTML = '';
      return;
    }
    const nodes = this._nodes();
    const byId = new Map(nodes.map((x) => [x.id, x]));
    const n = byId.get(this._selectedId);
    if (!n) { sel.innerHTML = ''; actions.innerHTML = ''; return; }
    const st = this._ctx.state;
    const player = st.player || {};
    const cost = n.cost || {};
    const readiness = describeTechNodeReadiness(n, st, nodes);
    const branch = BRANCHES.find((b) => b.id === n.branch);
    const branchLabel = branch ? branch.label : String(n.branch || '');
    const tier = depthOf(n.id, byId) + 1;

    const prereqHtml = (n.prereqs && n.prereqs.length)
      ? `<ul class="con-rows con-reqs" aria-label="Prerequisites">` + n.prereqs.map((p) => {
          const pn = (byId.get(p) || {}).name || p;
          const ok = this._isResearched(p);
          return `<li class="con-row" data-met="${ok ? '1' : '0'}"><span class="con-row__name">${escapeHtml(pn)}</span><span class="con-row__sub">${ok ? 'researched' : 'not yet researched'}</span></li>`;
        }).join('') + `</ul>`
      : `<p class="con-sentence">No prerequisites.</p>`;
    const unlockRows = unlockRowsHtml(n.unlocks);
    const effects = formatUnlocks(n.unlocks);
    // A locked node's first question is what stands in the way, so its requirements come first.
    const requiresHtml = `<div class="con-caps">Requires</div>${prereqHtml}`;
    const owned = readiness.state === 'researched';

    sel.innerHTML = `
      <p class="con-dossier__kicker">${escapeHtml(branchLabel)} <span aria-hidden="true">·</span> tier ${ROMAN[tier - 1] || tier}</p>
      <h2 class="con-dossier__name">${escapeHtml(n.name)}</h2>
      <p class="con-dossier__state" data-state="${escapeHtml(readiness.state)}">${escapeHtml(stateSentence(readiness))}</p>
      <dl class="con-dossier__cost${owned ? ' is-owned' : ''}" aria-label="Cost">
        ${costCellHtml('Credits', Math.round(cost.credits || 0), Math.round(player.credits || 0), fmtCr)}
        ${costCellHtml('Research points', Math.round(cost.rp || 0), Math.round(player.researchPoints || 0), (v) => v.toLocaleString())}
      </dl>
      ${readiness.state === 'locked' ? requiresHtml : ''}
      ${effects || !unlockRows ? `<p class="con-sentence">${effects || 'No listed effects.'}</p>` : ''}
      ${unlockRows ? `<div class="con-caps">Unlocks</div><ul class="con-rows con-unlocks" aria-label="Unlocks">${unlockRows}</ul>` : ''}
      ${readiness.state === 'locked' ? '' : requiresHtml}
    `;

    if (readiness.state === 'available') {
      actions.innerHTML = `<button class="con-unlock tt-unlock" data-act="unlock" data-why="${escapeHtml(readiness.actionTitle)}" aria-label="${escapeHtml(readiness.actionTitle)}">Unlock</button>`;
    } else {
      actions.innerHTML = disabledActionHtml(readiness);
    }
    actions.dataset.state = readiness.state;
    // The verb sits under the price it spends, above the lists, so a node with six unlocks never
    // pushes Unlock (or the reason it is locked) below the reading.
    const costEl = sel.querySelector('.con-dossier__cost');
    if (costEl) costEl.insertAdjacentElement('afterend', actions);
    this._paintDossier();
  },

  _onAction(act) {
    if (act !== 'unlock' || !this._selectedId) return;
    const n = this._nodes().find((x) => x.id === this._selectedId);
    if (!n) return;
    cue('confirm');
    // ships handles ui:unlockTech (charges credits/RP, sets researchedNodes, emits tech:researched).
    this._ctx.bus.emit('ui:unlockTech', { nodeId: n.id });
    this._ctx.bus.emit('toast', { text: `Researching ${n.name}…`, kind: 'info', ttl: 3000 });
    // optimistic-free: refresh on next event-driven cycle; refresh now in case ships is synchronous
    this.refresh(this._ctx);
  },

  _researchSignature() {
    return this._researched().join(',');
  },

  _drawSignature() {
    const player = (this._ctx && this._ctx.state && this._ctx.state.player) || {};
    const ready = this._nodes().filter((n) => this._nodeState(n) === 'available' && this._affordable(n)).map((n) => n.id).join(',');
    return [this._researchSignature(), ready, this._nodes().length, Math.round(player.researchPoints || 0)].join('|');
  },

  _sidebarSignature() {
    const st = this._ctx.state;
    const player = st.player || {};
    return [
      this._selectedId || '',
      this._researchSignature(),
      Math.round(player.credits || 0),
      player.researchPoints || 0,
      this._nodes().length,
    ].join('|');
  },
};

// ---- helpers ----------------------------------------------------------------
/** The node's state as one sentence; the disabled word beneath it names the exact blocker. */
function stateSentence(readiness) {
  const s = readiness && readiness.state;
  if (s === 'researched') return 'Researched.';
  if (s === 'locked') return 'Locked.';
  if (s === 'funding') return 'Open, not yet affordable.';
  return 'Open, and you hold what it costs.';
}

/**
 * One cost as a reading: the figure it costs, thin and large, inside an arc of how much of it you hold.
 * A cost you cannot meet names what is short; a cost of nothing reads as none.
 */
function costCellHtml(word, cost, have, fmt) {
  const free = !(cost > 0);
  const k = free ? 0 : Math.max(0, Math.min(1, have / cost));
  const short = free ? 0 : Math.max(0, cost - have);
  // a 300-degree gauge open at the foot, so a full one still reads as a gauge and not a ring
  const arc = 'M 13.5 36.72 A 17 17 0 1 1 30.5 36.72';
  const sub = free ? 'none needed' : short > 0 ? `short ${fmt(short)}` : `${fmt(have)} held`;
  return `<div class="con-cost" data-short="${short > 0 ? '1' : '0'}" data-free="${free ? '1' : '0'}">`
    + `<svg class="con-cost__gauge" viewBox="0 0 44 44" aria-hidden="true" focusable="false">`
    + `<path class="con-cost__track" d="${arc}"></path>`
    + `<path class="con-cost__fill" d="${arc}" pathLength="1" stroke-dasharray="${k.toFixed(3)} 1"${k > 0 ? '' : ' opacity="0"'}></path>`
    + `</svg>`
    + `<dt>${escapeHtml(word)}</dt><dd>${escapeHtml(free ? '0' : fmt(cost))}</dd>`
    + `<span class="con-cost__sub">${escapeHtml(sub)}</span></div>`;
}

function disabledActionHtml(readiness) {
  const label = readiness && readiness.actionLabel || 'Unavailable';
  const title = readiness && readiness.actionTitle || label;
  // aria-disabled, not disabled: a disabled control cannot take focus, so the reason a locked node
  // is locked would be hover-only — the exact defect this sweep removes. The button carries no
  // data-act, so it stays inert; focus only reveals the why.
  return `<button class="con-why" aria-disabled="true" tabindex="0" data-why="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${escapeHtml(label)}</button>`;
}

/** The ships and modules a node unlocks, as ledger lines (name · kind). */
function unlockRowsHtml(u) {
  if (!u) return '';
  const row = (name, kind, ref) => `<li class="con-row"><span class="con-row__name">${ref ? entitySpanHtml(ref, name) : name}</span><span class="con-row__sub">${kind}</span></li>`;
  const rows = [];
  if (u.ships && u.ships.length) {
    const names = u.ships.map(unlockDisplayName);
    rows.push(...u.ships.map((id, i) => row(names[i], 'ship', 'hull:' + id)));
  }
  if (u.modules && u.modules.length) {
    const names = u.modules.map(unlockDisplayName);
    rows.push(...u.modules.map((id, i) => row(names[i], 'module', 'module:' + id)));
  }
  return rows.join('');
}

/** The node's effects beyond its unlock rows, as one sentence (escaped; '' when there are none). */
function formatUnlocks(u) {
  if (!u) return '';
  const parts = [];
  if (u.efficiency) {
    const e = Object.entries(u.efficiency).map(([k, v]) => `${escapeHtml(k)} ${(v > 0 ? '+' : '') + Math.round(v * 100)}%`);
    parts.push(`Bonuses: ${e.join(', ')}`);
  }
  if (u.droneTierCap != null) parts.push(`Drone tier cap ${escapeHtml(String(u.droneTierCap))}`);
  if (u.npcTraderHiring) parts.push('Unlocks NPC trader hiring');
  if (u.outpostConstruction) parts.push('Unlocks outpost construction');
  if (u.extraDronePerBay) parts.push(`+${escapeHtml(String(u.extraDronePerBay))} drone per bay`);
  if (u.flags && u.flags.length) parts.push(`Flags: ${u.flags.map(escapeHtml).join(', ')}`);
  return parts.length ? parts.join(' · ') + '.' : '';
}

function cleanId(id) {
  return escapeHtml(String(id).replace(/^(ship_|mod_|wpn_)/, '').replace(/_/g, ' '));
}

export function unlockDisplayName(id) {
  const authored = UNLOCK_NAME_BY_ID.get(id);
  return authored ? escapeHtml(authored) : cleanId(id);
}

/** One compact cost voice on the stars: 6k, 12k, 2.5M (fmtCr keeps exact thousands elsewhere). */
function fmtCostCompact(v) {
  v = Math.round(v || 0);
  if (v >= 1e6) return (v / 1e6).toFixed(v % 1e6 === 0 || v >= 1e7 ? 0 : 1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(v % 1e3 === 0 || v >= 1e4 ? 0 : 1) + 'k';
  return String(v);
}
function fmtCr(v) {
  v = Math.round(v || 0);
  if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + 'M';
  if (v >= 1e4) return (v / 1e3).toFixed(0) + 'k';
  return v.toLocaleString();
}
