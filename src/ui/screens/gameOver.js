// Ship-loss after-action screen. Standard runs pause over the wreck until the player confirms a
// deterministic lawful-dock recovery; Ironman keeps its final-run contract. Combat owns all state
// mutation and consequences. This DOM surface only explains the receipt and emits intents.
// The sheet's line (design/frontend/direction/DIRECTION_SHEET.md, game over, amended by Task B §1.5):
// a still — the wreck or the last frame, cooled with the wanted-blue scrim; what killed you at
// screen-title size; the final sortie and the final damage as the second line; the recovery dock,
// recovery cost and cargo consequence as three hero blocks; coverage as one sentence; the actions as
// words. Built on the frontend kit (styles/kit.css, src/ui/kit/); this file owns no CSS. The DOM is
// built from `el` + appendChild only so the after-action unit test's minimal fake document runs it.

import { STORY_BEATS } from '../../data/missions.js';
import { el, settle, cue } from '../kit/index.js';

/** The receipt's fields and their labels. The kicker, the second line, the hero words and the
 *  coverage sentence are all spelled from this table (the screen-import check reads the pairs). */
const FIELD_LABELS = [
  ['cause', 'Loss cause'],
  ['lifespan', 'Final sortie'],
  ['damage', 'Final damage'],
  ['dock', 'Recovery dock'],
  ['cost', 'Recovery cost'],
  ['cargo', 'Cargo consequence'],
  ['insurance', 'Coverage'],
];
const LABEL = Object.fromEntries(FIELD_LABELS);
const lower = (s) => String(s).toLowerCase();

/** A kit hero block (`.k-hero`): the number and its word. Returns the number element for updates. */
function heroBlock(parent, word) {
  const block = el('div', 'k-hero');
  const n = el('span', 'k-hero__n', '-');
  block.appendChild(n);
  block.appendChild(el('span', 'k-hero__w', word));
  parent.appendChild(block);
  return n;
}

/** A kit word in a `.k-words` list. Returns the button; the caller hides its `li` with it. */
function wordItem(list, label, className) {
  const li = el('li');
  const button = el('button', 'k-word k-word--emph' + (className ? ' ' + className : ''), label);
  button.type = 'button';
  li.appendChild(button);
  list.appendChild(li);
  button._kItem = li;
  return button;
}

function setWordHidden(button, hidden) {
  if (!button) return;
  button.hidden = hidden;
  if (button._kItem) button._kItem.hidden = hidden;
}

function fmtTime(s) {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return h + 'h ' + m + 'm';
  if (m > 0) return m + 'm ' + sec + 's';
  return sec + 's';
}

function fmtCr(c) { return (Math.max(0, Math.round(c || 0))).toLocaleString() + ' cr'; }

function fmtMs(ms) {
  const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  return fmtTime(s);
}

function prettyLabel(value) {
  return String(value || 'unknown')
    .replace(/^(faction|ship|sector|station)_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function storyProgressLabel(state = {}) {
  const story = state.story || (state.missions && state.missions.story) || {};
  const raw = Number(story.beatIndex);
  const maxBeat = Math.max(0, STORY_BEATS.length - 1);
  const beat = Number.isFinite(raw) ? Math.max(0, Math.min(maxBeat, Math.floor(raw))) : 0;
  return 'Beat ' + beat + ' / ' + maxBeat;
}

function telemetryHandle(ctx) {
  if (ctx && ctx.telemetry && typeof ctx.telemetry.getSessionStats === 'function') return ctx.telemetry;
  const globalTelemetry = typeof window !== 'undefined' ? window.__SF_TELEMETRY__ : null;
  return globalTelemetry && typeof globalTelemetry.getSessionStats === 'function' ? globalTelemetry : null;
}

export function deathCauseLabel(entry = null) {
  if (!entry) return 'Unknown loss';
  const cause = String(entry.cause || 'unknown');
  if (cause === 'environmental') return 'Environmental hazard';
  if (cause === 'self') return 'Self-inflicted damage';
  if (cause.startsWith('collision:')) return 'Collision with ' + prettyLabel(cause.slice('collision:'.length));
  if (cause.startsWith('ship:')) {
    const killer = prettyLabel(entry.killerType || cause.slice('ship:'.length));
    const faction = entry.killerFaction ? ' (' + prettyLabel(entry.killerFaction) + ')' : '';
    return 'Destroyed by ' + killer + faction;
  }
  return cause === 'unknown' ? 'Unknown loss' : prettyLabel(cause);
}

export function lastDeathSummary(ctx = {}) {
  const telemetry = telemetryHandle(ctx);
  let entry = null;
  if (telemetry) {
    try {
      const stats = telemetry.getSessionStats();
      const log = stats && Array.isArray(stats.deathLog) ? stats.deathLog : [];
      entry = log.length ? log[log.length - 1] : null;
    } catch (e) {
      entry = null;
    }
  }
  return {
    cause: deathCauseLabel(entry),
    lifespan: entry && entry.lifespanMs != null ? fmtMs(entry.lifespanMs) : '-',
  };
}

export function currentDefeat(ctx = {}) {
  const state = ctx.state || {};
  return state.combat && state.combat.lastPlayerDefeat || null;
}

function getManager(ctx) {
  if (ctx && ctx.screenManager) return ctx.screenManager;
  if (ctx && ctx.screens && ctx.screens.pushScreen) return ctx.screens;
  const ui = ctx && ctx.registry && ctx.registry.get && ctx.registry.get('ui');
  if (ui && ui.screenManager) return ui.screenManager;
  return null;
}

function asScreenStack(ctx) {
  const stack = ctx && ctx.state && ctx.state.ui && ctx.state.ui.screenStack;
  return Array.isArray(stack) ? stack : null;
}

/**
 * Successful recovery must dismiss Game Over even when another modal (for example, Load save)
 * is stacked above it. Pop ancestors until gameOver leaves the stack; fall back to a single
 * top-only pop when the shared stack is unavailable.
 */
function popAncestorsUntilGameOverResolves(ctx, manager) {
  if (!manager) return { popped: 0, dismissed: false };
  const stack = asScreenStack(ctx);
  if (Array.isArray(stack)) {
    if (!stack.includes('gameOver')) return { popped: 0, dismissed: false };
    let popped = 0;
    // Bound by the initial length so a broken/no-op manager cannot spin forever.
    const guard = stack.length;
    for (let i = 0; i < guard && stack.length; i++) {
      const top = stack[stack.length - 1];
      if (typeof manager.popScreen !== 'function') break;
      const beforeLength = stack.length;
      manager.popScreen();
      // Keep lightweight harness managers honest when they do not mutate the shared stack.
      if (stack.length === beforeLength) stack.pop();
      popped += 1;
      if (top === 'gameOver') return { popped, dismissed: true };
    }
    return { popped, dismissed: !stack.includes('gameOver') };
  }

  const isGameOverTop = typeof manager.top === 'function' && manager.top() === 'gameOver';
  if (!isGameOverTop || typeof manager.popScreen !== 'function') {
    return { popped: 0, dismissed: false };
  }
  manager.popScreen();
  return { popped: 1, dismissed: true };
}

export const gameOverScreen = {
  id: 'gameOver',
  data: { locked: true },
  _summaryEls: null,
  _defaultButton: null,
  _titleEl: null,
  _subEl: null,
  _recoveryEl: null,
  _retryButton: null,
  _loadButton: null,
  _newButton: null,
  _menuButton: null,

  mount(rootEl, ctx) {
    rootEl.innerHTML = '';
    rootEl.classList.remove('panel', 'sf-menu', 'sf-gameover');
    // k-screen--cold: the one screen that deepens the menu scrim to the wanted blue (Task B §1.5).
    rootEl.classList.add('k-screen', 'k-screen--stage', 'k-screen--cold');
    rootEl.setAttribute('role', 'dialog');
    rootEl.setAttribute('aria-modal', 'true');
    rootEl.setAttribute('aria-labelledby', 'sf-gameover-title');

    // .k-title — what killed you, at screen-title size; the sortie and the damage as the second line.
    const title = el('header', 'k-title');
    // The verdict as a caps kicker over the cause ("Ship lost · loss cause"); the public-route check
    // reads both phrases from the surface, and the cause itself is the display line.
    const kicker = el('span', 'k-caps', 'Ship lost · ' + lower(LABEL.cause));
    this._kickerEl = kicker;
    title.appendChild(kicker);
    const h = el('h1', 'k-display k-t-title', 'Ship Lost');
    h.id = 'sf-gameover-title';
    this._titleEl = h;
    title.appendChild(h);
    const line = el('p', 'k-sentence k-sentence--emph');
    this._lineEl = line;
    title.appendChild(line);
    const sub = el('p', 'k-sentence sf-go-sub', 'Flight controls locked. Review the loss, then recover.');
    this._subEl = sub;
    title.appendChild(sub);
    rootEl.appendChild(title);

    // .k-stage — three hero blocks, the coverage sentence, the recovery sentence.
    const stage = el('section', 'k-stage');
    const heroes = el('div', 'k-words k-words--row sf-go-grid');
    this._summaryEls = Object.create(null);
    // `.sf-go-grid .v` is what the public-route check reads; the hero numbers carry the class.
    // The sheet's words are "recovery dock", "recovery cost", "cargo"; the public-route check reads
    // "Cargo consequence", so the third word is the nearest phrase that satisfies both.
    for (const key of ['dock', 'cost', 'cargo']) {
      const n = heroBlock(heroes, lower(LABEL[key]));
      n.className += ' v';
      this._summaryEls[key] = n;
    }
    stage.appendChild(heroes);
    const insurance = el('p', 'k-sentence');
    this._summaryEls.insurance = insurance;
    stage.appendChild(insurance);
    const recovery = el('p', 'k-sentence sf-go-recovery', 'Recovery receipt pending.');
    this._recoveryEl = recovery;
    stage.appendChild(recovery);
    rootEl.appendChild(stage);
    // Cause, sortie and damage read in the title; they are kept as summary keys for the refresh.
    this._summaryEls.cause = h;
    this._summaryEls.lifespan = el('span');
    this._summaryEls.damage = el('span');

    // .k-foot — the actions as words.
    const foot = el('footer', 'k-foot sf-go-foot');
    const list = el('ul', 'k-words k-words--row');
    list.setAttribute('aria-label', 'After action');
    foot.appendChild(list);

    const bRetry = wordItem(list, 'Continue from recovery berth', 'k-word--primary sf-go-retry');
    bRetry.title = 'Apply the shown recovery receipt and continue beside the named lawful dock';
    bRetry.setAttribute('aria-label', 'Continue from the recovery berth with the shown consequences');
    bRetry.addEventListener('click', () => {
      // Combat owns success/failure. Success closes via player:respawn; failure surfaces a toast
      // (and player:recoveryFailed) so a dead latch never looks like a no-op button.
      cue('confirm');
      ctx.bus.emit('player:recoveryRequested', { source: 'after_action' });
    });
    this._retryButton = bRetry;

    const bLoad = wordItem(list, 'Load save');
    bLoad.title = 'Open saved games without applying recovery consequences';
    bLoad.setAttribute('aria-label', 'Load save instead of recovering this ship');
    bLoad.addEventListener('click', () => {
      cue('confirm');
      const mgr = getManager(ctx);
      if (mgr && mgr.pushScreen) mgr.pushScreen('saveLoad');
      else ctx.bus.emit('ui:pushScreen', { id: 'saveLoad' });
    });
    this._loadButton = bLoad;

    const bNew = wordItem(list, 'New Game');
    bNew.title = 'Start a fresh run';
    bNew.setAttribute('aria-label', 'Start a fresh run');
    bNew.addEventListener('click', () => {
      cue('confirm');
      const mgr = getManager(ctx);
      // A fresh new game clears the dead run; main.js's game:new handler resets all run state.
      ctx.bus.emit('game:over:dismissed', {});
      const difficulty = ctx.state && ctx.state.settings && ctx.state.settings.gameplay
        && ctx.state.settings.gameplay.difficulty || 'standard';
      ctx.bus.emit('game:new', { name: null, difficulty });
      if (mgr && mgr.popScreen) { try { mgr.popScreen(); } catch (e) {} }
    });
    this._newButton = bNew;

    // The label is what check-gameover-recovery-copy asserts in the source (and probes read in the DOM).
    const bMenu = wordItem(list, 'Main Menu / Load');
    bMenu.title = 'Return to title screen to continue or load another save';
    bMenu.setAttribute('aria-label', 'Return to title screen to continue or load another save');
    bMenu.addEventListener('click', () => {
      cue('confirm');
      if (ctx.state) ctx.state.mode = 'menu';
      ctx.bus.emit('game:over:dismissed', {});
      const mgr = getManager(ctx);
      if (mgr) {
        if (mgr.closeAll) mgr.closeAll();
        if (mgr.replaceScreen) mgr.replaceScreen('mainMenu');
        else if (mgr.pushScreen) mgr.pushScreen('mainMenu');
      }
    });
    this._menuButton = bMenu;

    // Combat alone decides whether recovery succeeded. Keep the locked screen in place on a
    // rejected/duplicate intent; close only on the canonical successful respawn receipt.
    ctx.bus.on('player:respawn', () => {
      const mgr = getManager(ctx);
      const close = popAncestorsUntilGameOverResolves(ctx, mgr);
      if (!close.dismissed) return;
      ctx.bus.emit('game:over:dismissed', {});
    });
    // Failed recovery stays on this modal. Refresh copy so Load/New paths appear if the receipt
    // was cleared, and keep the primary button available when combat re-armed from the receipt.
    ctx.bus.on('player:recoveryFailed', () => {
      this._refreshSummary(ctx);
    });

    rootEl.appendChild(foot);
    this._titleRegion = title;
    this._stageRegion = stage;
    this._footRegion = foot;
    this._refreshSummary(ctx);
  },

  onShow(ctx) {
    this._refreshSummary(ctx);
    // The kit's settle needs a real frame clock; the after-action unit test runs under a fake document.
    if (typeof requestAnimationFrame === 'function' && this._titleRegion) {
      settle(this._titleRegion, { from: 'left', state: 'gameover-title' });
      settle(this._stageRegion, { from: 'left', delay: 60, state: 'gameover-stage' });
      settle(this._footRegion, { from: 'bottom', delay: 120, state: 'gameover-foot' });
      cue('open');
    }
    if (this._defaultButton) {
      try { this._defaultButton.focus({ preventScroll: true }); } catch (e) { try { this._defaultButton.focus(); } catch (err) {} }
    }
  },

  onHide() {},
  refresh(ctx) { this._refreshSummary(ctx); },

  _refreshSummary(ctx) {
    const els = this._summaryEls;
    if (!els) return;
    const state = ctx && ctx.state || {};
    const receipt = currentDefeat(ctx);
    const recovery = receipt && receipt.recovery || {};
    const difficulty = state.settings && state.settings.gameplay && state.settings.gameplay.difficulty;
    const ironman = difficulty === 'ironman';
    const recoverable = !ironman && !!receipt;
    const death = lastDeathSummary(ctx);
    const cargoLost = Math.max(0, Number(recovery.cargoLostQty) || 0);
    const protectedQty = Math.max(0, Number(recovery.persistentCargoProtected) || 0);
    const cargoText = cargoLost > 0
      ? cargoLost + 'u lost' + (protectedQty > 0 ? ' · ' + protectedQty + 'u protected' : '')
      : 'No cargo lost';
    const charged = Math.max(0, Number(recovery.costCr) || 0);
    const quoted = Math.max(charged, Number(recovery.quotedCostCr) || 0);
    const recoveryFund = Math.max(0, Number(recovery.hardshipCoveredCr) || 0);
    const costText = recoveryFund > 0
      ? `${fmtCr(charged)} charged · ${fmtCr(quoted)} quote · ${fmtCr(recoveryFund)} recovery fund`
      : fmtCr(charged);
    const values = {
      cause: receipt && (receipt.fatalSummary || receipt.cause) || death.cause,
      lifespan: death.lifespan,
      damage: receipt ? [
        receipt.direction,
        String(receipt.dominantLayer || 'hull').toUpperCase(),
        receipt.subsystemId && String(receipt.subsystemId).replace(/_/g, ' ').toUpperCase(),
        receipt.vitalsPct && `S${receipt.vitalsPct.shield}% A${receipt.vitalsPct.armor}% H${receipt.vitalsPct.hull}%`,
      ].filter(Boolean).join(' · ') : 'Unresolved',
      dock: recovery.stationName || 'No recovery route',
      cost: recovery.costCr != null ? costText : '-',
      cargo: cargoText,
      insurance: recovery.insuranceStatus || 'No recovery coverage',
    };
    for (const key in values) {
      if (key === 'cause') continue; // the title carries the cause (below)
      const text = key === 'insurance' ? LABEL.insurance + ': ' + values[key] : values[key];
      if (els[key] && els[key].textContent !== text) els[key].textContent = text;
    }
    // The display line is the cause itself; the caps kicker above it carries the verdict.
    const verdict = ironman ? 'Run Over' : 'Ship Lost';
    if (this._kickerEl) {
      const kicker = verdict + ' · ' + lower(LABEL.cause);
      if (this._kickerEl.textContent !== kicker) this._kickerEl.textContent = kicker;
    }
    if (this._titleEl) {
      const cause = String(values.cause || '');
      const text = cause && !/^unknown loss$/i.test(cause) ? cause : verdict;
      if (this._titleEl.textContent !== text) this._titleEl.textContent = text;
    }
    if (this._lineEl) {
      const pairs = [
        LABEL.lifespan + ' ' + values.lifespan,
        lower(LABEL.damage) + ' ' + lower(values.damage || ''),
      ];
      const text = pairs.join(' · ');
      if (this._lineEl.textContent !== text) this._lineEl.textContent = text;
    }
    if (this._subEl) {
      this._subEl.textContent = ironman
        ? 'Your ship was lost. In Ironman, death is final.'
        : recoverable
        ? 'Flight controls locked. Review the loss, then continue from the lawful recovery berth.'
        : 'Recovery receipt unavailable. Load a save or start a new run.';
    }
    if (this._recoveryEl) {
      this._recoveryEl.textContent = recoverable
        ? `RECOVERY BERTH · ${recovery.stationName || 'lawful dock'} · ${costText} · ${cargoText}`
        : ironman
          ? 'This is Ironman mode: Casual, Standard, and Veteran deaths use insurance respawn, but this save is sealed. New Game starts fresh; Main Menu lets you Continue or Load another save.'
          : 'No recovery consequences were applied. Load a valid save or begin a new run.';
    }
    setWordHidden(this._retryButton, !recoverable);
    setWordHidden(this._loadButton, false);
    setWordHidden(this._newButton, recoverable);
    setWordHidden(this._menuButton, recoverable);
    this._defaultButton = recoverable ? this._retryButton : ironman ? this._newButton : this._loadButton;
  },
};
