// Ship-loss after-action screen. Standard runs pause over the wreck until the player confirms a
// deterministic lawful-dock recovery; Ironman keeps its final-run contract. Combat owns all state
// mutation and consequences. This DOM surface only explains the receipt and emits intents.

import { STORY_BEATS } from '../../data/missions.js';

const STYLE_ID = 'sf-gameover-style';

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
  .sf-gameover { display:flex; flex-direction:column; gap:18px; padding:34px 40px;
    min-width:380px; max-width:min(92vw,620px); pointer-events:auto; }
  .sf-gameover h1 { margin:0; font-family:var(--mono); letter-spacing:.28em; font-size:24px;
    color:#ff7a86; text-transform:uppercase; text-align:center; }
  .sf-gameover .sf-go-sub { text-align:center; color:var(--ink-dim); font-size:13px;
    letter-spacing:.08em; margin-top:-10px; }
  .sf-gameover h2 { margin:6px 0 2px; font-size:11px; letter-spacing:.16em; text-transform:uppercase;
    color:var(--ink-dim); }
  .sf-gameover .sf-go-grid { display:grid; grid-template-columns:auto 1fr; gap:7px 22px;
    align-items:center; font-size:14px; padding:10px 0; }
  .sf-gameover .sf-go-grid .k { color:var(--ink-dim); font-family:var(--mono); letter-spacing:.05em; font-size:12px; }
  .sf-gameover .sf-go-grid .v { color:var(--ink); font-family:var(--mono); text-align:right; }
  .sf-gameover .sf-go-recovery { border:1px solid rgba(255,205,76,.36); border-radius:8px;
    background:rgba(255,205,76,.06); color:var(--ink-dim); font-size:12px; line-height:1.5;
    padding:10px 12px; }
  .sf-gameover .sf-go-recovery b { color:var(--warn); font-family:var(--mono); letter-spacing:.08em;
    text-transform:uppercase; }
  .sf-gameover .sf-go-foot { display:flex; flex-wrap:wrap; gap:10px; justify-content:center; margin-top:10px; }
  .sf-gameover button.sf-btn { padding:12px 22px; font-size:14px; letter-spacing:.08em; min-width:150px; }
  .sf-gameover .sf-go-retry { border-color:var(--accent); color:var(--accent); }
  `;
  document.head.appendChild(s);
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
    injectStyle();
    rootEl.innerHTML = '';
    rootEl.classList.add('panel', 'sf-gameover');
    rootEl.setAttribute('role', 'dialog');
    rootEl.setAttribute('aria-modal', 'true');
    rootEl.setAttribute('aria-labelledby', 'sf-gameover-title');

    const h = document.createElement('h1');
    h.id = 'sf-gameover-title';
    h.textContent = 'Ship Lost';
    this._titleEl = h;
    rootEl.appendChild(h);

    const sub = document.createElement('div');
    sub.className = 'sf-go-sub';
    sub.textContent = 'Flight controls locked. Review the loss, then recover.';
    this._subEl = sub;
    rootEl.appendChild(sub);

    const grid = document.createElement('div');
    grid.className = 'sf-go-grid';
    this._summaryEls = Object.create(null);
    const rows = [
      ['cause', 'Loss cause'],
      ['lifespan', 'Final sortie'],
      ['damage', 'Final damage'],
      ['dock', 'Recovery dock'],
      ['cost', 'Recovery cost'],
      ['cargo', 'Cargo consequence'],
      ['insurance', 'Coverage'],
    ];
    for (const [key, label] of rows) {
      const kd = document.createElement('div'); kd.className = 'k'; kd.textContent = label; grid.appendChild(kd);
      const vd = document.createElement('div'); vd.className = 'v'; vd.textContent = '0'; grid.appendChild(vd);
      this._summaryEls[key] = vd;
    }
    rootEl.appendChild(grid);

    const recovery = document.createElement('div');
    recovery.className = 'sf-go-recovery';
    recovery.textContent = 'Recovery receipt pending.';
    this._recoveryEl = recovery;
    rootEl.appendChild(recovery);

    const foot = document.createElement('div');
    foot.className = 'sf-go-foot';

    const bRetry = document.createElement('button');
    bRetry.className = 'sf-btn sf-go-retry';
    bRetry.textContent = 'Continue from recovery berth';
    bRetry.title = 'Apply the shown recovery receipt and continue beside the named lawful dock';
    bRetry.setAttribute('aria-label', 'Continue from the recovery berth with the shown consequences');
    bRetry.addEventListener('click', () => {
      ctx.bus.emit('player:recoveryRequested', { source: 'after_action' });
    });
    this._retryButton = bRetry;
    foot.appendChild(bRetry);

    const bLoad = document.createElement('button');
    bLoad.className = 'sf-btn';
    bLoad.textContent = 'Load save';
    bLoad.title = 'Open saved games without applying recovery consequences';
    bLoad.setAttribute('aria-label', 'Load save instead of recovering this ship');
    bLoad.addEventListener('click', () => {
      const mgr = getManager(ctx);
      if (mgr && mgr.pushScreen) mgr.pushScreen('saveLoad');
      else ctx.bus.emit('ui:pushScreen', { id: 'saveLoad' });
    });
    this._loadButton = bLoad;
    foot.appendChild(bLoad);

    const bNew = document.createElement('button');
    bNew.className = 'sf-btn';
    bNew.textContent = 'New Game';
    bNew.title = 'Start a fresh run';
    bNew.setAttribute('aria-label', 'Start a fresh run');
    bNew.addEventListener('click', () => {
      const mgr = getManager(ctx);
      // A fresh new game clears the dead run; main.js's game:new handler resets all run state.
      ctx.bus.emit('game:over:dismissed', {});
      const difficulty = ctx.state && ctx.state.settings && ctx.state.settings.gameplay
        && ctx.state.settings.gameplay.difficulty || 'standard';
      ctx.bus.emit('game:new', { name: null, difficulty });
      if (mgr && mgr.popScreen) { try { mgr.popScreen(); } catch (e) {} }
    });
    this._newButton = bNew;
    foot.appendChild(bNew);

    const bMenu = document.createElement('button');
    bMenu.className = 'sf-btn';
    bMenu.textContent = 'Main Menu / Load';
    bMenu.title = 'Return to title screen to continue or load another save';
    bMenu.setAttribute('aria-label', 'Return to title screen to continue or load another save');
    bMenu.addEventListener('click', () => {
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
    foot.appendChild(bMenu);

    // Combat alone decides whether recovery succeeded. Keep the locked screen in place on a
    // rejected/duplicate intent; close only on the canonical successful respawn receipt.
    ctx.bus.on('player:respawn', () => {
      const mgr = getManager(ctx);
      if (!mgr || typeof mgr.top !== 'function' || mgr.top() !== 'gameOver') return;
      ctx.bus.emit('game:over:dismissed', {});
      if (mgr.popScreen) mgr.popScreen();
    });

    rootEl.appendChild(foot);
    this._refreshSummary(ctx);
  },

  onShow(ctx) {
    this._refreshSummary(ctx);
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
      if (els[key] && els[key].textContent !== values[key]) els[key].textContent = values[key];
    }
    if (this._titleEl) this._titleEl.textContent = ironman ? 'Run Over' : 'Ship Lost';
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
    if (this._retryButton) this._retryButton.hidden = !recoverable;
    if (this._loadButton) this._loadButton.hidden = false;
    if (this._newButton) this._newButton.hidden = recoverable;
    if (this._menuButton) this._menuButton.hidden = recoverable;
    this._defaultButton = recoverable ? this._retryButton : ironman ? this._newButton : this._loadButton;
  },
};
