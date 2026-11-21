// src/ui/screens/pilotTree.js — the Pilot Tree screen (progression lead 2026-11-20;
// design/overhaul/06_PROGRESSION_AND_ECONOMY.md §2.4). The Research Constellation's instrument,
// showing the Pilot Tree: one sector per branch, rings as tiers with the capstone at the rim, and
// each evolution standing at the rim of its first branch with a beam bridging to the second. The
// chosen node's reading says in one line what changes in your hands and what it needs; the one
// primary action takes it.
//
// Doors: in Adventure the screen is where points are spent (T opens it; emits
// pilot:nodeRequested { nodeId } and, docked, pilot:respecRequested). In Swarm it is read-only —
// mid-run from the pause menu, and on Run Over with the run's path lit — because a run spends its
// points on the level-up cards.
//
// READ-ONLY on state; emits intents only. No 'three' import. Export: pilotTreeScreen (id 'pilotTree').

import { dressLampKey } from '../orrery/lampKey.js';
import { createConstellation } from '../orrery/constellation.js';
import { injectConstellationScreens, legendStarSvg } from '../orrery/constellationLayouts.js';
import { deferScreenCssReady } from '../orrery/cssSidecar.js';
import { decrypt, rollTo } from '../orrery/text.js';
import { el, settle, cue } from '../kit/index.js';
import { escapeMarkup as escapeHtml } from '../views/identity.js';
import { wrapCanvasLines } from '../../localization/layout.js';
import { injectDeckplate, dpIcon } from '../deckplate/index.js';
import { BRANCH_LOOK, EVOLUTION_LOOK } from '../pilotCards.js';
import { pilotLiveNodeIds } from '../../data/pilotLive.js';
import {
  PILOT_EVOLUTIONS,
  PILOT_NODES,
  activePilotRecord,
  getPilotBranch,
  pilotNodeStanding,
} from '../../data/pilotTree.js';
import { adventureRespecFee, adventureXpForLevel } from '../../data/pilotAdventure.js';

export const PILOT_TREE_SCREEN_ID = 'pilotTree';
export const PILOT_NODE_INTENT = 'pilot:nodeRequested';
export const PILOT_RESPEC_INTENT = 'pilot:respecRequested';

const ROMAN = ['I', 'II', 'III', 'IV'];
const DIAL_ORDER = Object.freeze(['ghost', 'conjurer', 'gunner', 'rigger', 'bruiser', 'juggernaut', 'trader', 'prospector', 'builder']);
const TIER_DEPTH = Object.freeze({ 1: 0, 2: 1, 3: 2, capstone: 3 });
// The produced research stars, reused per branch by kinship (assets/ui/generated/research/).
const STAR_OF_BRANCH = Object.freeze({
  gunner: 'combat', bruiser: 'combat', juggernaut: 'combat', rigger: 'drives', ghost: 'drives',
  conjurer: 'logistics', trader: 'logistics', prospector: 'industry', builder: 'industry',
});
function starUrl(kind) {
  try { return new URL(`../../../assets/ui/generated/research/star-${kind}.webp`, import.meta.url).href; }
  catch (_) { return `/assets/ui/generated/research/star-${kind}.webp`; }
}
const KIT_TEXT_FACE = '"Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
const KIT_DISPLAY_FACE = 'Archivo, system-ui, sans-serif';
function kitFont(weight, px, face = KIT_TEXT_FACE) {
  return weight + ' ' + Math.max(12, Number.isFinite(px) ? px : 12) + 'px ' + face;
}
function iconBody(name) {
  const markup = dpIcon(name, 24) || dpIcon('module', 24) || '';
  return markup.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}
function setText(node, text) { if (node && node.textContent !== text) node.textContent = text; }

/**
 * What the screen shows, from state alone (pure): the door, the pilot record in force, whether
 * points can be spent here, and the tree as constellation nodes with tier chains and evolution
 * bridges. Exported for tests.
 */
export function readPilotTree(state) {
  const run = state && state.run;
  const swarmRun = !!(run && run.kind && run.kind !== 'adventure' && run.pilot);
  const door = swarmRun ? 'swarm' : 'adventure';
  const pilot = activePilotRecord(state) || { points: {}, nodes: [], banked: 0 };
  const live = pilotLiveNodeIds();
  const runOver = swarmRun && (run.phase === 'ended' || run.phase === 'victory');
  // Around the dial, branches that share an evolution sit side by side, so its bridge is short.
  const branches = DIAL_ORDER.map((id) => getPilotBranch(id)).filter((b) => b && (door === 'adventure' || !b.adventureOnly));
  const nodes = [];
  for (const branch of branches) {
    const own = PILOT_NODES.filter((n) => n.branch === branch.id && live.has(n.id));
    const byTier = { 1: [], 2: [], 3: [], capstone: [] };
    for (const n of own) (byTier[n.tier] || (byTier[n.tier] = [])).push(n);
    const order = [1, 2, 3, 'capstone'];
    order.forEach((tier, ti) => {
      const prev = ti > 0 ? byTier[order[ti - 1]] : [];
      byTier[tier].forEach((n, i) => {
        const pre = prev.length ? [prev[Math.min(i, prev.length - 1)].id] : [];
        nodes.push({ id: n.id, name: n.name, branch: branch.id, prereqs: pre, card: n });
      });
    });
  }
  const shownBranches = new Set(nodes.map((n) => n.branch));
  for (const evo of PILOT_EVOLUTIONS) {
    if (!live.has(evo.id) || !evo.requires.every((b) => shownBranches.has(b))) continue;
    // The bridge: the evolution stands at the rim of its first branch, a beam from the last
    // tier-3 node of each branch.
    const pre = evo.requires.map((b) => {
      const t3 = nodes.filter((n) => n.branch === b && n.card.tier === 3);
      return t3.length ? t3[t3.length - 1].id : null;
    }).filter(Boolean);
    nodes.push({ id: evo.id, name: evo.name, branch: evo.requires[0], prereqs: pre, card: evo });
  }
  const standing = {};
  for (const n of nodes) standing[n.id] = pilotNodeStanding(n.card, pilot, door);
  const banked = Number.isInteger(pilot.banked) && pilot.banked > 0 ? pilot.banked : 0;
  const canSpend = door === 'adventure' && banked > 0;
  const level = Number.isInteger(pilot.level) ? pilot.level : (swarmRun && Number.isInteger(run.level) ? run.level : 1);
  return {
    door,
    runOver,
    pilot,
    banked,
    canSpend,
    level,
    xp: Number.isFinite(pilot.xp) ? pilot.xp : (swarmRun ? run.xp : 0),
    nextXp: door === 'adventure' ? adventureXpForLevel(level + 1) : null,
    taken: Array.isArray(pilot.nodes) ? pilot.nodes.length : 0,
    branches: branches.filter((b) => shownBranches.has(b.id)).map((b) => ({ id: b.id, label: b.name })),
    nodes,
    standing,
  };
}

/** The reading's sentence for a node: what it does, what it needs, and the one verb. */
export function pilotNodeReading(view, id) {
  const node = view.nodes.find((n) => n.id === id);
  if (!node) return null;
  const card = node.card;
  const st = view.standing[id] || { state: 'locked', needs: '' };
  const evolution = card.kind === 'evolution';
  const branch = getPilotBranch(evolution ? card.requires[0] : card.branch);
  const kicker = evolution
    ? `Evolution · ${card.requires.map((b) => (getPilotBranch(b) || { name: b }).name).join(' + ')}`
    : `${branch ? branch.name : ''} · ${card.tier === 'capstone' ? 'capstone' : 'tier ' + ROMAN[TIER_DEPTH[card.tier]]}`;
  let action;
  if (st.state === 'taken') action = { enabled: false, label: 'Yours' };
  else if (view.door === 'swarm') action = { enabled: false, label: view.runOver ? 'Not taken this run' : 'Pick it from the level-up cards' };
  else if (st.state !== 'open') action = { enabled: false, label: st.needs || 'Locked' };
  else if (!view.canSpend) action = { enabled: false, label: 'Earn a level to take it' };
  else action = { enabled: true, label: 'Take it' };
  return {
    id, name: card.name, text: card.text, build: evolution ? card.build : null,
    kicker, state: st.state, needs: st.needs, action,
  };
}

function reading(parent, word, hook) {
  const block = el('div', 'con-read');
  const n = el('span', 'con-read__n', '0');
  n.setAttribute(hook, '');
  block.append(n, el('span', 'con-read__w', word));
  parent.appendChild(block);
  return n;
}

export const pilotTreeScreen = {
  id: PILOT_TREE_SCREEN_ID,
  _ctx: null,
  _root: null,
  _sky: null,
  _g: null,
  _selectedId: null,
  _els: null,
  _sig: '',
  _takenBefore: null,

  mount(rootEl, ctx) {
    injectDeckplate();
    this._markCssReady = deferScreenCssReady(rootEl, injectConstellationScreens());
    this._ctx = ctx;
    this._root = rootEl;
    rootEl.id = 'sf-pilottree';
    rootEl.innerHTML = '';
    rootEl.classList.add('k-screen', 'con-research', 'con-pilot');
    rootEl.dataset.kReady = '0';
    rootEl.setAttribute('aria-label', 'Pilot Tree');

    const head = el('header', 'k-title con-head');
    const heading = el('h1', 'k-display k-t-title con-title', 'Pilot Tree');
    const sub = el('p', 'k-t-emph k-62 con-sub', '');
    head.append(heading, sub);
    rootEl.appendChild(head);

    const corner = el('div', 'k-corner con-corner');
    corner.setAttribute('aria-label', 'Pilot');
    const levelEl = reading(corner, 'Level', 'data-level');
    const pointsEl = reading(corner, 'To spend', 'data-points');
    const takenEl = reading(corner, 'Skills', 'data-taken');
    rootEl.appendChild(corner);

    const stage = el('section', 'k-stage con-stage');
    stage.setAttribute('aria-label', 'The tree');
    const skyHost = el('div', 'con-skyhost');
    stage.appendChild(skyHost);
    rootEl.appendChild(stage);

    const side = el('aside', 'con-side');
    side.setAttribute('aria-label', 'Selected skill');
    const selected = el('div', 'con-dossier');
    const actions = el('div', 'con-actions');
    side.append(selected, actions);
    rootEl.appendChild(side);

    const foot = el('footer', 'k-foot con-foot');
    const back = el('button', 'k-word k-word--emph sf-back con-back', 'Back');
    back.type = 'button';
    back.dataset.action = 'back';
    back.addEventListener('click', () => {
      const c = this._ctx;
      const mgr = c && (c.screenManager || (c.screens && typeof c.screens.popScreen === 'function' ? c.screens : null));
      if (mgr && typeof mgr.popScreen === 'function') mgr.popScreen();
      else if (c && c.bus) c.bus.emit('ui:popScreen', {});
    });
    foot.appendChild(back);
    const legend = el('div', 'con-legend');
    for (const [kind, word] of [['researched', 'Yours'], ['available', 'Open'], ['locked', 'Locked']]) {
      const item = el('span', 'con-legend__item');
      item.innerHTML = legendStarSvg(kind, starUrl('combat'));
      item.appendChild(el('span', 'con-legend__word', word));
      legend.appendChild(item);
    }
    foot.appendChild(legend);
    // Respec: a quiet word, docked in Adventure only (the screen's one primary action stays Take it).
    const respec = el('button', 'k-word con-respec', 'Respec');
    respec.type = 'button';
    respec.dataset.action = 'respec';
    respec.hidden = true;
    respec.addEventListener('click', () => {
      cue('confirm');
      if (this._ctx && this._ctx.bus) this._ctx.bus.emit(PILOT_RESPEC_INTENT, {});
      this.refresh(this._ctx);
    });
    foot.appendChild(respec);
    const picker = el('div', 'con-picker');
    const label = el('label', 'con-picker__label', 'Skill');
    const select = el('select', 'k-select con-select');
    select.id = 'sf-pilot-node';
    label.htmlFor = select.id;
    select.addEventListener('change', () => this._select(select.value));
    picker.append(label, select);
    foot.appendChild(picker);
    rootEl.appendChild(foot);

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
      outward: true,
      avoid: () => [heading, sub].filter((n) => n && typeof n.offsetWidth === 'number'),
      onPick: (id, how) => this._select(id, { how }),
    });
    this._regions = { head, corner, side, foot };
    this._els = { sub, level: levelEl, points: pointsEl, taken: takenEl, selected, actions, respec, select };
    actions.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (btn) this._onAction(btn.dataset.act);
    });
    if (typeof document !== 'undefined' && document.fonts && document.fonts.addEventListener) {
      this._fontLoadHandler = this._fontLoadHandler || (() => {
        if (this._root && this._root.isConnected && this._sky) this._sky.relayout({ fonts: true });
      });
      document.fonts.addEventListener('loadingdone', this._fontLoadHandler);
    }
  },

  onShow(ctx) {
    if (ctx) this._ctx = ctx;
    const view = this._view();
    if (!this._selectedId || !view.nodes.some((n) => n.id === this._selectedId)) this._selectedId = this._defaultId(view);
    this._sig = '';
    this._takenBefore = null;
    this.refresh(this._ctx);
    if (this._sky) { this._sky.choose(this._selectedId, { instant: true }); this._sky.arrive(); }
    cue('open');
    if (typeof requestAnimationFrame === 'function' && this._regions) {
      try {
        settle(this._regions.head, { from: 'top', state: 'pilotTree:open' });
        settle(this._regions.corner, { from: 'top', state: 'pilotTree:open' });
        settle(this._regions.side, { from: 'right', state: 'pilotTree:open' });
        settle(this._regions.foot, { from: 'bottom', state: 'pilotTree:open' });
      } catch (_) { /* motion is cosmetic */ }
    }
    if (this._markCssReady) this._markCssReady();
    const focus = () => { if (this._sky && this._root && this._root.isConnected) this._sky.focusChosen(); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(focus)); else focus();
  },

  onHide() { cue('close'); },

  dispose() {
    if (this._fontLoadHandler && typeof document !== 'undefined' && document.fonts) {
      document.fonts.removeEventListener('loadingdone', this._fontLoadHandler);
      this._fontLoadHandler = null;
    }
  },

  refresh(ctx) {
    if (ctx) this._ctx = ctx;
    if (!this._root) return;
    const view = this._view();
    const pilotSig = `${view.door}|${(view.pilot.nodes || []).join(',')}|${view.banked}|${view.level}|${view.runOver}`;
    this._syncHeader(view);
    if (pilotSig !== this._sig) {
      this._sig = pilotSig;
      this._syncPicker(view);
      this._pushSky(view);
      const now = new Set(view.pilot.nodes || []);
      if (this._takenBefore && this._sky) {
        const fresh = [...now].filter((id) => !this._takenBefore.has(id));
        if (fresh.length) this._sky.sweepInto(fresh);
      }
      this._takenBefore = now;
      this._syncReading(view);
    }
  },

  _view() {
    return readPilotTree(this._ctx && this._ctx.state);
  },

  _defaultId(view) {
    // A run's tree opens on the last skill the run took; Adventure opens on something to take.
    if (view.door === 'swarm') {
      const last = (view.pilot.nodes || []).filter((id) => view.nodes.some((n) => n.id === id)).pop();
      if (last) return last;
    }
    const open = view.nodes.find((n) => view.standing[n.id].state === 'open');
    if (open) return open.id;
    const taken = view.nodes.filter((n) => view.standing[n.id].state === 'taken');
    if (taken.length) return taken[taken.length - 1].id;
    return view.nodes[0] ? view.nodes[0].id : null;
  },

  _syncHeader(view) {
    const els = this._els;
    if (!els) return;
    if (els._level !== view.level) { els._level = view.level; rollTo(els.level, view.level); }
    if (els._points !== view.banked) { els._points = view.banked; rollTo(els.points, view.banked); }
    if (els._taken !== view.taken) { els._taken = view.taken; rollTo(els.taken, view.taken); }
    let line;
    if (view.door === 'swarm') {
      line = view.runOver ? 'This run\'s path, lit. Every run starts the tree empty.'
        : 'This run so far. Pick skills from the level-up cards.';
    } else if (view.banked > 0) {
      line = `${view.banked === 1 ? 'One point' : view.banked + ' points'} to spend: choose any open skill.`;
    } else {
      const toGo = Math.max(0, Math.round((view.nextXp || 0) - (view.xp || 0)));
      line = `Next point in ${toGo.toLocaleString()} XP: fight, haul, mine, trade and explore to earn it.`;
    }
    setText(els.sub, line);
    const state = this._ctx && this._ctx.state;
    const docked = !!(state && ((state.player && state.player.flags && state.player.flags.docked) || (state.ui && state.ui.docked)));
    const canRespec = view.door === 'adventure' && docked && view.taken > 0;
    els.respec.hidden = !canRespec;
    if (canRespec) setText(els.respec, `Respec · ${adventureRespecFee(view.pilot).toLocaleString()} cr`);
  },

  _syncPicker(view) {
    const select = this._els && this._els.select;
    if (!select) return;
    select.innerHTML = '';
    for (const n of view.nodes) {
      const option = el('option', '', n.name);
      option.value = n.id;
      select.appendChild(option);
    }
    select.value = this._selectedId || '';
  },

  _pushSky(view) {
    if (!this._sky) return;
    const states = {};
    const ready = {};
    const costs = {};
    const glyphs = {};
    const art = {};
    for (const n of view.nodes) {
      const st = view.standing[n.id].state;
      states[n.id] = st === 'taken' ? 'researched' : st === 'open' ? 'available' : 'locked';
      ready[n.id] = st === 'open' && view.canSpend;
      costs[n.id] = view.canSpend && st === 'open' ? '1 point' : '';
      const look = n.card.kind === 'evolution' ? EVOLUTION_LOOK : (BRANCH_LOOK[n.branch] || BRANCH_LOOK.gunner);
      glyphs[n.id] = iconBody(look.icon);
    }
    for (const b of view.branches) art[b.id] = starUrl(STAR_OF_BRANCH[b.id] || 'combat');
    this._sky.set({
      nodes: view.nodes.map((n) => ({ id: n.id, name: n.name, branch: n.branch, prereqs: n.prereqs })),
      branches: view.branches,
      states,
      ready,
      costs,
      art,
      glyphs,
      words: { researched: 'yours', ready: 'ready to take' },
      chosen: this._selectedId,
    });
  },

  _select(id, { how = 'pick' } = {}) {
    const view = this._view();
    if (!view.nodes.some((n) => n.id === id)) return;
    if (id === this._selectedId && how === 'focus') return;
    const changed = id !== this._selectedId;
    this._selectedId = id;
    if (this._els && this._els.select) this._els.select.value = id;
    if (changed) cue('move');
    this._syncReading(view);
    if (this._sky) this._sky.choose(id);
    if (changed) {
      const name = this._els.selected.querySelector('.con-dossier__name');
      if (name) decrypt(name, name.textContent, { duration: 240 });
    }
  },

  _syncReading(view) {
    const els = this._els;
    if (!els) return;
    const r = pilotNodeReading(view, this._selectedId);
    if (!r) {
      els.selected.innerHTML = '<p class="con-empty">Choose a skill to read what it does.</p>';
      els.actions.innerHTML = '';
      return;
    }
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    const hadFocus = !!(active && els.actions.contains && els.actions.contains(active));
    const stateWord = r.state === 'taken' ? 'Yours.' : r.state === 'open' ? 'Open.' : 'Locked.';
    els.selected.innerHTML = `
      <p class="con-dossier__kicker">${escapeHtml(r.kicker)}</p>
      <h2 class="con-dossier__name">${escapeHtml(r.name)}</h2>
      <p class="con-dossier__state" data-state="${escapeHtml(r.state === 'taken' ? 'researched' : r.state === 'open' ? 'available' : 'locked')}">${escapeHtml(stateWord)}</p>
      <p class="con-sentence con-dossier__verb">${escapeHtml(r.text)}</p>
      ${r.build ? `<p class="con-sentence con-dossier__rider">The build: ${escapeHtml(r.build)}.</p>` : ''}
      ${r.needs && r.state !== 'taken' ? `<div class="con-caps">Needs</div><p class="con-sentence">${escapeHtml(r.needs)}.</p>` : ''}
    `;
    els.actions.innerHTML = r.action.enabled
      ? `<button class="con-unlock tt-unlock" data-act="take" aria-label="Take ${escapeHtml(r.name)} for one point">${escapeHtml(r.action.label)}</button>`
      : `<button class="con-why" aria-disabled="true" tabindex="0" aria-label="${escapeHtml(r.action.label)}">${escapeHtml(r.action.label)}</button>`;
    els.actions.dataset.state = r.state;
    const verb = els.selected.querySelector('.con-dossier__state');
    if (verb) verb.insertAdjacentElement('afterend', els.actions);
    const btn = els.actions.querySelector('button[data-act="take"]');
    if (btn) dressLampKey(btn);
    if (hadFocus) {
      const next = els.actions.querySelector('button');
      if (next) { try { next.focus({ preventScroll: true }); } catch (_) { /* nicety */ } }
    }
  },

  _onAction(act) {
    if (act !== 'take' || !this._selectedId) return;
    const view = this._view();
    const r = pilotNodeReading(view, this._selectedId);
    if (!r || !r.action.enabled) return;
    cue('confirm');
    if (this._ctx && this._ctx.bus) this._ctx.bus.emit(PILOT_NODE_INTENT, { nodeId: this._selectedId });
    this.refresh(this._ctx);
  },
};
