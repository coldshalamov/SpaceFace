// Pause menu (ARCHITECTURE §5.4, design/specs/09). Opened by ESC in flight.
// Resume / Settings / Save / Load / Mission Log / Help / Main Menu.
// On show: freeze sim (sim:pause + timeScale=0). On resume: sim:resume + timeScale=1.
// UI emits intents only; it never mutates owned sim state beyond the documented
// timeScale/mode toggle that the loop reads (§2.2 — timeScale gates stepSim).

import { confirm } from '../confirm.js';
import { BINDINGS } from '../bindings.js';

const STYLE_ID = 'sf-pause-menu-style';

/** Find the screen manager regardless of where uiRoot exposed it. Screens navigate
 *  by asking the manager to push/pop/replace; if it is not reachable we degrade to
 *  emitting ui:* navigation events that uiRoot can also honour. */
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
  // Fallback: let uiRoot handle navigation via events.
  ctx.bus.emit('ui:' + method, { id: arg });
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
  .sf-menu { display:flex; flex-direction:column; gap:14px; padding:26px 30px; min-width:360px;
    max-width:min(92vw,920px); max-height:88vh; overflow:auto; pointer-events:auto; }
  .sf-menu-narrow { min-width:300px; width:340px; }
  .sf-menu-wide { width:min(92vw,820px); }
  .sf-menu h1 { margin:0 0 4px; font-family:var(--mono); letter-spacing:.32em; font-size:20px;
    color:var(--accent); text-shadow:0 0 18px rgba(57,208,255,.45); text-transform:uppercase; text-align:center; }
  .sf-menu h2 { margin:14px 0 4px; font-size:13px; letter-spacing:.12em; text-transform:uppercase; color:var(--ink-dim); }
  .sf-menu .sf-col { display:flex; flex-direction:column; gap:8px; }
  .sf-menu button.sf-btn { width:100%; text-align:center; padding:11px 14px; font-size:14px; letter-spacing:.06em; }
  .sf-menu .sf-row { display:flex; align-items:center; justify-content:space-between; gap:14px; }
  .sf-menu .sf-row > label { color:var(--ink-dim); font-size:13px; flex:0 0 38%; }
  .sf-menu .sf-row > .sf-ctl { flex:1; display:flex; align-items:center; gap:10px; justify-content:flex-end; }
  .sf-menu input[type=range] { flex:1; accent-color:var(--accent); }
  .sf-menu select, .sf-menu input[type=text], .sf-menu input[type=number] {
    font-family:inherit; font-size:13px; color:var(--ink); background:var(--panel); border:1px solid var(--panel-edge);
    border-radius:5px; padding:6px 8px; pointer-events:auto; }
  .sf-menu .sf-val { font-family:var(--mono); color:var(--accent); min-width:46px; text-align:right; }
  .sf-tabbar { display:flex; gap:6px; border-bottom:1px solid var(--panel-edge); padding-bottom:8px; flex-wrap:wrap; }
  .sf-tabbar button.sf-tab.active { border-color:var(--accent); color:#fff; box-shadow:0 0 10px rgba(57,208,255,.35); }
  .sf-menu .sf-grid2 { display:grid; grid-template-columns:auto 1fr; gap:6px 18px; align-items:center; font-size:13px; }
  .sf-menu .sf-grid2 .k { color:var(--ink-dim); font-family:var(--mono); letter-spacing:.05em; }
  .sf-menu .sf-grid2 .v { color:var(--ink); }
  .sf-menu .sf-foot { display:flex; gap:10px; justify-content:flex-end; margin-top:8px; }
  .sf-menu .sf-muted { color:var(--ink-mute); font-size:12px; }
  .sf-slot { display:flex; align-items:center; gap:12px; padding:10px 12px; border:1px solid var(--panel-edge);
    border-radius:6px; background:var(--panel); }
  .sf-slot.sel { border-color:var(--accent); box-shadow:0 0 10px rgba(57,208,255,.3); }
  .sf-slot .sf-slot-main { flex:1; min-width:0; }
  .sf-slot .sf-slot-name { font-size:14px; color:var(--ink); }
  .sf-slot .sf-slot-sub { font-size:11px; color:var(--ink-mute); font-family:var(--mono); }
  .sf-slot.empty .sf-slot-name { color:var(--ink-mute); font-style:italic; }
  .sf-title-logo { font-family:var(--mono); letter-spacing:.5em; font-size:46px; color:var(--accent);
    text-shadow:0 0 40px rgba(57,208,255,.5); text-align:center; margin:0; }
  .sf-title-tag { text-align:center; color:var(--ink-dim); letter-spacing:.28em; font-size:12px; margin-bottom:18px; }
  `;
  document.head.appendChild(s);
}

/** Build a centered modal panel inside rootEl; returns {panel, body}. Idempotent-ish:
 *  if called again it clears and rebuilds. */
function screenShell(rootEl, title, extraClass) {
  rootEl.innerHTML = '';
  rootEl.classList.add('panel', 'sf-menu');
  if (extraClass) rootEl.classList.add(extraClass);
  const h = document.createElement('h1');
  h.textContent = title;
  rootEl.appendChild(h);
  const body = document.createElement('div');
  body.className = 'sf-col';
  rootEl.appendChild(body);
  return { panel: rootEl, body };
}

function button(label, cls) {
  const b = document.createElement('button');
  b.className = 'sf-btn' + (cls ? ' ' + cls : '');
  b.textContent = label;
  return b;
}

function prettyId(id) {
  return String(id || '')
    .replace(/^(mission|station|sector|cmdty|ship)_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function missionId(m) {
  return m && (m.id != null ? m.id : m.missionId);
}

function missionTitle(m) {
  return (m && (m.title || m.name)) || prettyId(m && m.type) || 'Contract';
}

function fmtTime(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return h + 'h ' + m + 'm';
  if (m > 0) return m + 'm';
  return s + 's';
}

function missionProgress(m) {
  const prog = Math.max(0, Number(m && m.objectiveProgress) || 0);
  const tgt = Math.max(1, Number(m && m.objectiveTarget) || 1);
  return Math.min(100, Math.round((prog / tgt) * 100)) + '% complete';
}

function deadlineText(state, mission) {
  const deadline = Number(mission && mission.deadline_s);
  const now = Number(state && state.simTime) || 0;
  if (!Number.isFinite(deadline) || deadline <= now) return '';
  return ' - ' + fmtTime(deadline - now) + ' left';
}

function missionDestination(m) {
  return (m && (m.destName || m.destStationName || m.stationName)) ||
    prettyId(m && (m.destStationId || m.destSectorId || m.dest)) || 'the objective';
}

function missionCommodity(m) {
  const id = m && m.params && m.params.cmdtyId;
  return id ? prettyId(id) : 'cargo';
}

function missionNextStep(m) {
  const dest = missionDestination(m);
  switch (m && m.type) {
    case 'cargo_delivery':
    case 'passenger_transport':
    case 'escort':
    case 'smuggling_run':
    case 'salvage_retrieval':
      return 'Next: resume, follow tracked nav to ' + dest + ', then dock to resolve the handoff.';
    case 'bulk_trade':
      return 'Next: buy or carry ' + missionCommodity(m) + ', then sell into the tracked destination market.';
    case 'mining_quota':
      return 'Next: mine ' + missionCommodity(m) + ', keep cargo room open, then follow the tracker for payout.';
    case 'bounty_hunt':
    case 'patrol_clear':
      return 'Next: resume, follow tracked nav, and expect combat before the timer runs down.';
    case 'recon_scan':
      return 'Next: resume, follow tracked nav, and scan each marked site.';
    default:
      return 'Next: resume and follow the tracked objective; Mission Log (' + BINDINGS.missionLog.label + ') has the details.';
  }
}

function waypointText(wp) {
  if (!wp) return '';
  return wp.label || wp.reason || wp.stationName || prettyId(wp.stationId || wp.sectorId || wp.kind) || 'Nav marker set';
}

function slotLabel(id) {
  if (!id) return '';
  if (id === 'quick' || id === 'autosave' || id === 'auto') return id.charAt(0).toUpperCase() + id.slice(1);
  return 'Slot ' + id;
}

function fmtSavedAt(value) {
  if (!value) return '';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleString();
}

function saveLine(state) {
  const slot = state && state.save && state.save.currentSlot;
  const savedAt = state && state.meta && state.meta.lastSavedAt;
  const savedWhen = fmtSavedAt(savedAt);
  if (savedWhen) {
    return 'Saved ' + savedWhen + (slot ? ' to ' + slotLabel(slot) : '') + '. F5 quick-saves; F9 loads quick.';
  }
  if (slot) {
    return 'Loaded ' + slotLabel(slot) + ', but no save has landed this session. Use Save or F5 before quitting.';
  }
  return 'Unsaved run. Use Save or F5 before quitting; autosaves fire after dock, undock, sector entry, and completed jobs.';
}

export function pauseStatusLines(state) {
  const active = (state && state.missions && Array.isArray(state.missions.active) ? state.missions.active : [])
    .filter((m) => m && (!m.status || m.status === 'active'));
  const trackedId = state && state.ui && state.ui.trackedMissionId;
  const tracked = trackedId ? active.find((m) => missionId(m) === trackedId) : null;
  if (tracked) {
    return {
      objective: 'TRACKED - ' + missionTitle(tracked) + ' - ' + missionProgress(tracked) + deadlineText(state, tracked),
      next: missionNextStep(tracked),
      save: saveLine(state),
    };
  }
  if (active.length) {
    const candidate = active[0];
    return {
      objective: 'UNTRACKED CONTRACT - ' + missionTitle(candidate) + ' - ' + missionProgress(candidate) + deadlineText(state, candidate),
      next: 'Next: open Mission Log (' + BINDINGS.missionLog.label + '), Track Nav on a contract, then resume with a clear marker.',
      save: saveLine(state),
    };
  }
  const wp = state && state.nav && state.nav.waypoint;
  if (wp) {
    return {
      objective: 'NAV SET - ' + waypointText(wp),
      next: 'Next: resume and follow the current marker; open the map if the route gets muddy.',
      save: saveLine(state),
    };
  }
  return {
    objective: 'NO ACTIVE CONTRACT',
    next: 'Next: dock at a station, open Missions or the Bar, accept + track work, then undock.',
    save: saveLine(state),
  };
}

export function pauseExitConfirmBody(state, target = 'menu') {
  const lines = pauseStatusLines(state);
  const opening = target === 'load'
    ? 'Opening Load lets you review slots; choosing one will replace the current session.'
    : 'Returning to main menu closes the current session.';
  const loss = target === 'load'
    ? 'If you complete a load, unsaved progress is lost.'
    : 'Unsaved progress will be lost.';
  return opening + ' Current objective: ' + lines.objective + '. ' + lines.next +
    ' Save status: ' + lines.save + ' ' + loss;
}

let els = null;

function renderFlightBrief(ctx) {
  if (!els || !els.briefObjective) return;
  const lines = pauseStatusLines(ctx && ctx.state);
  els.briefObjective.textContent = lines.objective;
  els.briefNext.textContent = lines.next;
  els.briefSave.textContent = lines.save;
}

export const pauseScreen = {
  id: 'pause',

  mount(rootEl, ctx) {
    injectStyle();
    const { body } = screenShell(rootEl, 'Paused', 'sf-menu-narrow');

    const brief = document.createElement('div');
    brief.className = 'sf-slot';
    brief.setAttribute('aria-live', 'polite');
    const briefMain = document.createElement('div');
    briefMain.className = 'sf-slot-main';
    const briefKicker = document.createElement('div');
    briefKicker.className = 'sf-slot-sub';
    briefKicker.textContent = 'FLIGHT BRIEF';
    const briefObjective = document.createElement('div');
    briefObjective.className = 'sf-slot-name';
    const briefNext = document.createElement('div');
    briefNext.className = 'sf-muted';
    const briefSave = document.createElement('div');
    briefSave.className = 'sf-slot-sub';
    briefMain.appendChild(briefKicker);
    briefMain.appendChild(briefObjective);
    briefMain.appendChild(briefNext);
    briefMain.appendChild(briefSave);
    brief.appendChild(briefMain);
    body.appendChild(brief);

    const mk = (label, fn) => { const b = button(label); b.addEventListener('click', fn); body.appendChild(b); return b; };
    const bResume = mk('Resume', () => this._resume(ctx));
    mk('Settings', () => nav(ctx, 'pushScreen', 'settings'));
    mk('Save', () => nav(ctx, 'pushScreen', 'saveLoad'));
    // Load discards unsaved current progress after a slot is chosen — confirm with the live run context first.
    mk('Load', async () => {
      const ok = await confirm({
        title: 'Open load screen?',
        body: pauseExitConfirmBody(ctx && ctx.state, 'load'),
        confirmLabel: 'Open Load', danger: true,
      });
      if (ok) nav(ctx, 'pushScreen', 'saveLoad');
    });
    mk('Mission Log (' + BINDINGS.missionLog.label + ')', () => nav(ctx, 'pushScreen', 'missionLog'));
    mk('Help / Controls', () => nav(ctx, 'pushScreen', 'help'));
    mk('Codex', () => nav(ctx, 'pushScreen', 'codex'));
    // Main Menu discards the current session entirely — confirm with the live run context first.
    mk('Main Menu', async () => {
      const ok = await confirm({
        title: 'Return to main menu?',
        body: pauseExitConfirmBody(ctx && ctx.state, 'menu'),
        confirmLabel: 'Main Menu', danger: true,
      });
      if (ok) this._toMenu(ctx);
    });

    els = { bResume, briefObjective, briefNext, briefSave };
    renderFlightBrief(ctx);
  },

  _resume(ctx) {
    ctx.state.timeScale = 1;
    if (ctx.state.mode === 'paused') ctx.state.mode = 'flight';
    ctx.bus.emit('sim:resume', {});
    nav(ctx, 'popScreen');
  },

  _toMenu(ctx) {
    ctx.state.mode = 'menu';
    ctx.bus.emit('sim:pause', {});
    const mgr = getManager(ctx);
    if (mgr) {
      if (mgr.closeAll) mgr.closeAll();
      if (mgr.replaceScreen) mgr.replaceScreen('mainMenu');
      else if (mgr.pushScreen) mgr.pushScreen('mainMenu');
    } else {
      nav(ctx, 'replaceScreen', 'mainMenu');
    }
  },

  onShow(ctx) {
    ctx.state.timeScale = 0;
    if (ctx.state.mode === 'flight') ctx.state.mode = 'paused';
    ctx.bus.emit('sim:pause', {});
    renderFlightBrief(ctx);
    if (els && els.bResume) try { els.bResume.focus(); } catch (e) {}
  },

  onHide() {},
  refresh(ctx) { renderFlightBrief(ctx); },
};
