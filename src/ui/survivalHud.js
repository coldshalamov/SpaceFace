// Survival run readout (PQ-133 / CRU-018 follow-up).
//
// Until this existed, a player flying a scored ten-wave run could see NOTHING about the run:
// not which wave they were on, not how many were left, not their score, not what they had earned.
// Every figure was already in state.run and nothing put it on the glass.
//
// Ownership: read-only. It never writes state.run, never emits a gameplay intent, and owns only
// its own DOM subtree under the bottom-left contextual stack (.sf-leftcontext, uiRoot.js:1388,
// which collapses to nothing when empty). It never touches src/ui/hud.js or styles/.
//
// Grammar (design/frontend/INSTRUMENT_GRAMMAR.md): 12px floor; numerals in the data face with
// tabular-nums; labels in the subhead face; colour by ROLE token only (--sf-you gain, --sf-foe
// threat, --sf-goal objective, --sf-calm chrome, --sf-paper copy) and never as the only channel —
// every figure carries its own word. No animation at all, so reduced-motion needs no variant.

import { SURVIVAL_RUN_WAVE_COUNT } from '../systems/survivalRun.js';
import { isSwarmRuleset } from '../systems/survivalSwarm.js';
import { runXpForLevel } from '../core/runState.js';

const STYLE_ID = 'sf-crun-css';
/** How long an earn receipt stays on screen, in sim seconds. */
export const EARN_RECEIPT_S = 2.6;

/** Phase word the player reads. Never a phase id — 'wave_intro' is not a thing anyone says. */
export const PHASE_WORDS = Object.freeze({
  loadout: 'STANDBY',
  arena_intro: 'ARENA',
  wave_intro: 'INBOUND',
  active: 'FIGHT',
  cleanup: 'CLEAR',
  draft: 'REARM',
  refit: 'REFIT',
  victory: 'CLEARED',
  ended: 'LOST',
});

/**
 * The word for a phase. 'inactive' is deliberately absent: the readout is hidden entirely then,
 * so a word for it would be a label nobody can ever see. An unknown phase still renders as words,
 * never as a raw snake_case id.
 */
export function phaseWord(phase) {
  const word = PHASE_WORDS[phase];
  if (word) return word;
  return String(phase || '').replace(/_/g, ' ').toUpperCase() || 'RUN';
}

/**
 * What KIND of wave this is, in a word. A boss wave and a chaff wave both read as "FIGHT"
 * otherwise, which is exactly the moment a player most wants to be told which one they are in.
 * Unknown objectives fall back to the phase word rather than inventing a label.
 */
export const OBJECTIVE_WORDS = Object.freeze({
  resolve_hostiles: null,   // the ordinary case — the phase word already says FIGHT
  elite_hunt: 'ELITE',
  boss: 'BOSS',
});

export function objectiveWord(objectiveKind) {
  const word = OBJECTIVE_WORDS[objectiveKind];
  return typeof word === 'string' ? word : null;
}

/** Arena label from the id. Data-free so a new arena needs no edit here. */
export function arenaLabel(arenaId) {
  if (!arenaId) return 'ARENA';
  return String(arenaId).replace(/_/g, ' ').toUpperCase();
}

/** Live census for the wave: how many bodies are still out there, and how many are owed. */
export function threatCensus(run) {
  const planned = Number.isInteger(run && run.threatBudget) ? run.threatBudget : 0;
  const spawned = Number.isInteger(run && run.spawnedThreat) ? run.spawnedThreat : 0;
  const resolved = Number.isInteger(run && run.resolvedThreat) ? run.resolvedThreat : 0;
  const alive = Math.max(0, spawned - resolved);
  const total = Math.max(planned, spawned);
  const remaining = Math.max(alive, total - resolved);
  return { alive, total, remaining, resolved };
}

/** Fraction of this level's XP the player has earned, 0..1. */
export function levelProgress(run) {
  const xp = Number.isInteger(run && run.xp) ? run.xp : 0;
  const level = Number.isInteger(run && run.level) && run.level >= 1 ? run.level : 1;
  const floor = runXpForLevel(level);
  const ceiling = runXpForLevel(level + 1);
  if (!(ceiling > floor)) return 0;
  const t = (xp - floor) / (ceiling - floor);
  return t < 0 ? 0 : (t > 1 ? 1 : t);
}

/** One short line for an award. Returns null for an award with nothing worth announcing. */
export function earnLine(award) {
  if (!award) return null;
  const parts = [];
  if (award.credits > 0) parts.push(`+${award.credits.toLocaleString('en-US')} CR`);
  if (award.score > 0) parts.push(`+${award.score} SCORE`);
  if (award.xp > 0) parts.push(`+${award.xp} XP`);
  if (parts.length === 0) return null;
  return parts.join('   ');
}

function num(value) {
  const n = Number.isFinite(value) ? Math.trunc(value) : 0;
  return n.toLocaleString('en-US');
}

export const survivalHud = {
  id: 'survivalHud',
  name: 'survivalHud',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this._dom = null;
    this._last = Object.create(null);
    this._earn = null;
    this._earnUntil = -1;
    this._objective = null;
    this._unsubs = [];
    if (!this.bus || typeof this.bus.on !== 'function') return;
    this._unsubs.push(this.bus.on('run:awarded', (p) => this._onAwarded(p)));
    this._unsubs.push(this.bus.on('run:levelUp', (p) => this._onLevelUp(p)));
    this._unsubs.push(this.bus.on('run:started', () => this._clearEarn()));
    this._unsubs.push(this.bus.on('run:wavePlanned', (p) => this._onWavePlanned(p)));
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    if (this._dom && this._dom.root && this._dom.root.parentNode) {
      this._dom.root.parentNode.removeChild(this._dom.root);
    }
    this._dom = null;
  },

  newGame() {
    this._clearEarn();
  },

  update(dt, state) {
    // Headless contract: this is the whole of it. Node runs the sim with no document.
    if (typeof document === 'undefined') return;
    const st = state || this.state;
    if (!st) return;
    const run = st.run;
    const live = !!(run && run.kind === 'survival' && run.phase !== 'inactive');
    if (!live || st.mode !== 'flight' || (st.ui && st.ui.docked)) {
      this._hide();
      return;
    }
    const dom = this._ensureDom();
    if (!dom) return;
    this._show(dom);

    const census = threatCensus(run);
    const swarm = isSwarmRuleset(run.ruleset);
    // A boss or elite wave says so; everything else reads as the phase, which already says FIGHT.
    const fighting = run.phase === 'active' || run.phase === 'wave_intro';
    const phase = (fighting && this._objective) ? this._objective : phaseWord(run.phase);
    this._setText(dom.label, `CRUCIBLE · ${arenaLabel(run.arenaId)}`);
    // A swarm run has no denominator: there is no last wave to count toward, and printing one
    // would be a lie about when it ends.
    this._setText(dom.waveN, swarm
      ? `WAVE ${Math.max(1, run.wave || 1)}`
      : `WAVE ${Math.max(1, run.wave || 1)} / ${SURVIVAL_RUN_WAVE_COUNT}`);
    this._setText(dom.phase, phase);
    // Second channel for the boss/elite call — the WORD changes, the colour only reinforces it.
    this._setClass(dom.phase, 'sf-crun__phase' + (fighting && this._objective ? ' sf-crun__phase--hot' : ''));

    // Threat reads as a word, a bar and a figure — three channels, so forced-colors and a
    // colour-blind reader lose nothing.
    const showThreat = run.phase === 'active' || run.phase === 'cleanup';
    dom.threat.hidden = !showThreat;
    if (showThreat && swarm) {
      // In a swarm wave the number that MOVES is the kill count, and the number that ENDS the wave
      // is the quota. "How many are left in the room" is not a finishable figure here — the room
      // refills — so printing it would look like a bar that never advances.
      const quota = Math.max(1, census.total);
      const killed = Math.min(census.resolved, quota);
      this._setText(dom.threatWord, 'KILLS');
      this._setText(dom.threatFig, `${killed} / ${quota}`);
      this._setStyle(dom.threatFill, 'width', `${Math.round((killed / quota) * 100)}%`);
      dom.threat.setAttribute('aria-label', 'Wave kill quota');
      dom.threat.setAttribute('aria-valuenow', String(killed));
      dom.threat.setAttribute('aria-valuemax', String(quota));
    } else if (showThreat) {
      this._setText(dom.threatWord, 'THREAT');
      this._setText(dom.threatFig, `${census.remaining} / ${Math.max(census.total, census.remaining)}`);
      const fill = census.total > 0 ? (census.total - census.remaining) / census.total : 1;
      this._setStyle(dom.threatFill, 'width', `${Math.round(Math.max(0, Math.min(1, fill)) * 100)}%`);
      dom.threat.setAttribute('aria-label', 'Hostiles remaining');
      dom.threat.setAttribute('aria-valuenow', String(census.remaining));
      dom.threat.setAttribute('aria-valuemax', String(Math.max(census.total, census.remaining)));
    }

    this._setText(dom.score, num(run.score));
    this._setText(dom.credits, num(run.credits));
    this._setText(dom.level, `LV ${Math.max(1, run.level || 1)}`);
    this._setStyle(dom.xpFill, 'width', `${Math.round(levelProgress(run) * 100)}%`);

    const simTime = Number.isFinite(st.simTime) ? st.simTime : 0;
    if (this._earn && simTime <= this._earnUntil) {
      dom.earn.hidden = false;
      this._setText(dom.earn, this._earn);
    } else {
      if (this._earn) this._clearEarn();
      dom.earn.hidden = true;
    }
  },

  // ---- receipts -------------------------------------------------------------

  _onWavePlanned(payload) {
    const plan = payload && payload.plan;
    const kind = plan && plan.objective && plan.objective.kind;
    this._objective = objectiveWord(kind);
  },

  _onAwarded(payload) {
    const line = earnLine(payload);
    if (!line) return;
    this._pushEarn(line);
  },

  _onLevelUp(payload) {
    const level = payload && payload.level;
    if (!Number.isInteger(level)) return;
    this._pushEarn(`LEVEL ${level}`);
  },

  _pushEarn(text) {
    this._earn = text;
    const simTime = this.state && Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    this._earnUntil = simTime + EARN_RECEIPT_S;
  },

  _clearEarn() {
    this._earn = null;
    this._earnUntil = -1;
    this._objective = null;
  },

  // ---- DOM ------------------------------------------------------------------

  _hide() {
    if (this._dom && this._dom.root) this._dom.root.hidden = true;
  },

  _show(dom) {
    if (dom.root.hidden) dom.root.hidden = false;
  },

  _setText(node, text) {
    if (!node) return;
    if (this._last[node.__crunKey] === text) return;
    this._last[node.__crunKey] = text;
    node.textContent = text;
  },

  _setClass(node, value) {
    if (!node) return;
    const key = `${node.__crunKey}:class`;
    if (this._last[key] === value) return;
    this._last[key] = value;
    node.className = value;
  },

  _setStyle(node, prop, value) {
    if (!node) return;
    const key = `${node.__crunKey}:${prop}`;
    if (this._last[key] === value) return;
    this._last[key] = value;
    node.style[prop] = value;
  },

  _ensureDom() {
    if (this._dom && this._dom.root && this._dom.root.isConnected !== false) return this._dom;
    const host = document.querySelector('.sf-leftcontext')
      || document.getElementById('hud')
      || document.body;
    if (!host) return null;
    this._injectCss();

    let key = 0;
    const make = (tag, cls, parent) => {
      const node = document.createElement(tag);
      if (cls) node.className = cls;
      node.__crunKey = `k${key++}`;
      if (parent) parent.appendChild(node);
      return node;
    };

    const root = make('div', 'sf-crun');
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-atomic', 'true');
    root.setAttribute('aria-label', 'Crucible run status');

    const label = make('div', 'sf-crun__label', root);

    const waveRow = make('div', 'sf-crun__row', root);
    const waveN = make('span', 'sf-crun__wave', waveRow);
    const phase = make('span', 'sf-crun__phase', waveRow);

    const threat = make('div', 'sf-crun__threat', root);
    threat.setAttribute('role', 'meter');
    threat.setAttribute('aria-valuemin', '0');
    threat.setAttribute('aria-label', 'Hostiles remaining');
    const threatWord = make('span', 'sf-crun__word', threat);
    threatWord.textContent = 'THREAT';
    const threatTrack = make('span', 'sf-crun__track', threat);
    const threatFill = make('span', 'sf-crun__fill sf-crun__fill--foe', threatTrack);
    const threatFig = make('span', 'sf-crun__fig', threat);

    const figures = make('div', 'sf-crun__row sf-crun__row--figs', root);
    const scoreWord = make('span', 'sf-crun__word', figures);
    scoreWord.textContent = 'SCORE';
    const score = make('span', 'sf-crun__fig sf-crun__fig--you', figures);
    const crWord = make('span', 'sf-crun__word', figures);
    crWord.textContent = 'CR';
    const credits = make('span', 'sf-crun__fig sf-crun__fig--you', figures);
    const level = make('span', 'sf-crun__fig sf-crun__fig--you', figures);

    const xpTrack = make('div', 'sf-crun__track sf-crun__track--xp', root);
    const xpFill = make('span', 'sf-crun__fill sf-crun__fill--you', xpTrack);

    const earn = make('div', 'sf-crun__earn', root);
    earn.hidden = true;

    host.appendChild(root);
    this._dom = {
      root, label, waveN, phase, threat, threatWord, threatFill, threatFig,
      score, credits, level, xpFill, earn,
    };
    return this._dom;
  },

  _injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    // Own lease: this block styles only .sf-crun*. It never redefines a shared selector.
    style.textContent = `
  .sf-crun { display:flex; flex-direction:column; gap:5px; min-width:196px;
    padding:9px 11px; border-left:1px solid var(--sf-edge);
    background:rgba(6,12,22,.62); color:var(--sf-paper); }
  .sf-crun__label { font-family:var(--sf-subhead-face); font-weight:600; font-size:12px;
    letter-spacing:.06em; text-transform:uppercase; color:var(--sf-calm); }
  .sf-crun__row { display:flex; align-items:baseline; gap:9px; }
  .sf-crun__row--figs { flex-wrap:wrap; gap:4px 8px; }
  .sf-crun__wave { font-family:var(--sf-data-face); font-weight:500; font-size:17px;
    font-variant-numeric:tabular-nums; color:var(--sf-goal); }
  .sf-crun__phase { font-family:var(--sf-subhead-face); font-weight:600; font-size:12px;
    letter-spacing:.06em; color:var(--sf-calm); margin-left:auto; }
  .sf-crun__phase--hot { color:var(--sf-foe); }
  .sf-crun__threat { display:flex; align-items:center; gap:7px; }
  .sf-crun__word { font-family:var(--sf-subhead-face); font-weight:600; font-size:12px;
    letter-spacing:.06em; color:var(--sf-calm); }
  .sf-crun__track { position:relative; flex:1 1 auto; min-width:44px; height:4px;
    background:rgba(211,230,255,.16); overflow:hidden; }
  .sf-crun__track--xp { height:3px; }
  .sf-crun__fill { position:absolute; inset:0 auto 0 0; width:0; }
  .sf-crun__fill--foe { background:var(--sf-foe); }
  .sf-crun__fill--you { background:var(--sf-you); }
  .sf-crun__fig { font-family:var(--sf-data-face); font-weight:500; font-size:13px;
    font-variant-numeric:tabular-nums; color:var(--sf-paper); }
  .sf-crun__fig--you { color:var(--sf-you); }
  .sf-crun__earn { font-family:var(--sf-data-face); font-weight:500; font-size:12px;
    font-variant-numeric:tabular-nums; color:var(--sf-you); }
  /* forced-colors strips the fills; the figure beside each bar is the surviving channel. */
  @media (forced-colors: active) {
    .sf-crun { border-left:1px solid var(--sf-edge); background:Canvas; }
    .sf-crun__fill { background:Highlight; forced-color-adjust:none; }
  }
  @media (max-width: 900px) {
    .sf-crun { min-width:0; padding:7px 9px; }
    .sf-crun__wave { font-size:15px; }
  }
`;
    document.head.appendChild(style);
  },
};
