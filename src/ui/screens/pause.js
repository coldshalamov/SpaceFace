// Pause menu (ARCHITECTURE §5.4, design/specs/09). Opened by ESC in flight.
// Resume / Settings / Save / Load / Help / Main Menu.
// On show: freeze sim (sim:pause + timeScale=0). On resume: sim:resume + timeScale=1.
// UI emits intents only; it never mutates owned sim state beyond the documented
// timeScale/mode toggle that the loop reads (§2.2 — timeScale gates stepSim).

import { confirm } from '../confirm.js';

const STYLE_ID = 'sf-menu-style';

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

let els = null;

export const pauseScreen = {
  id: 'pause',

  mount(rootEl, ctx) {
    injectStyle();
    const { body } = screenShell(rootEl, 'Paused', 'sf-menu-narrow');

    const mk = (label, fn) => { const b = button(label); b.addEventListener('click', fn); body.appendChild(b); return b; };
    const bResume = mk('Resume', () => this._resume(ctx));
    mk('Settings', () => nav(ctx, 'pushScreen', 'settings'));
    mk('Save', () => nav(ctx, 'pushScreen', 'saveLoad'));
    // Load discards unsaved current progress — confirm first (UX-2).
    mk('Load', async () => {
      const ok = await confirm({
        title: 'Load game?',
        body: 'Loading will discard any unsaved progress in the current session.',
        confirmLabel: 'Load', danger: true,
      });
      if (ok) nav(ctx, 'pushScreen', 'saveLoad');
    });
    mk('Help', () => nav(ctx, 'pushScreen', 'help'));
    // Main Menu discards the current session entirely — confirm first (UX-2).
    mk('Main Menu', async () => {
      const ok = await confirm({
        title: 'Return to main menu?',
        body: 'Any unsaved progress will be lost. You can Save first if you want to keep it.',
        confirmLabel: 'Main Menu', danger: true,
      });
      if (ok) this._toMenu(ctx);
    });

    els = { bResume };
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
    if (els && els.bResume) try { els.bResume.focus(); } catch (e) {}
  },

  onHide() {},
  refresh() {},
};
