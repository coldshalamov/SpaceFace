// The `ui` system (ARCHITECTURE §5, manifest src/ui/uiRoot.js).
//
// init(ctx): mount the HUD into #hud, build the ScreenManager, wire toasts/alerts + the UI key
// router, register every modal screen, and react to dock / mode events. frame(dt,state) is the
// per-render-frame cheap HUD path (called by the loop via registry.renderUpdate).
//
// UI emits intents only; it never mutates owned sim state (§0.6, §5). The one documented write
// is ui.docked + dock flow (this system owns ui.* transient fields).
//
// Modal screens live in src/ui/screens/* and are registered dynamically so a screen module that
// is missing or throws on import/register does NOT break the HUD or the other screens.

import { createScreenManager } from './screenManager.js';
import { createUiInput } from './input.js';
import { createHud } from './hud.js';
import { createToasts } from './toasts.js';
import { createAlerts } from './alerts.js';

// id-of-export → { path, export }. Order matters only for nicer console logs.
const SCREEN_MODULES = [
  { path: './screens/stationHub.js', name: 'stationHub' },
  { path: './screens/starmap.js', name: 'starmapScreen' },
  { path: './screens/techTree.js', name: 'techTreeScreen' },
  { path: './screens/automationPanel.js', name: 'automationScreen' },
  { path: './screens/mainMenu.js', name: 'mainMenuScreen' },
  { path: './screens/newGame.js', name: 'newGameScreen' },
  { path: './screens/pause.js', name: 'pauseScreen' },
  { path: './screens/settings.js', name: 'settingsScreen' },
  { path: './screens/saveLoad.js', name: 'saveLoadScreen' },
  { path: './screens/help.js', name: 'helpScreen' },
];

const HUD_STYLE_ID = 'sf-hud-style';

export const ui = {
  name: 'ui',

  init(ctx) {
    this.ctx = ctx;
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;

    injectHudCss();

    // toasts + alerts (transient UI feedback)
    this.toasts = createToasts(ctx);
    this.alerts = createAlerts(ctx);

    // screen manager — expose on ctx + on this system so screens can reach it (§ screens
    // resolve ctx.screenManager / registry.get('ui').screenManager / .manager).
    this.screenManager = createScreenManager(ctx);
    this.manager = this.screenManager;
    ctx.screenManager = this.screenManager;
    ctx.screens = this.screenManager;

    // the always-mounted flight HUD
    this.hud = createHud(ctx, this.alerts);

    // === Professional asset-powered UI additions (pilot identity, reticle, control clarity, cinematic backgrounds) ===
    // Pilot "SpaceFace" portrait (from generated PF-001) — makes the game personal and branded
    const portrait = document.createElement('div');
    portrait.id = 'pilot-portrait';
    portrait.innerHTML = `<img src="assets/pilots/pf_spaceface_portraits.jpg" alt="SpaceFace pilot" title="Your SpaceFace — the reason you fly">`;
    document.getElementById('ui-root').appendChild(portrait);

    // Center aiming reticle using generated asset (professional aid for mouse-aim flight/combat)
    const reticle = document.createElement('div');
    reticle.id = 'aim-reticle';
    reticle.innerHTML = `<img src="assets/ui/reticle.jpg" alt="aim">`;
    document.getElementById('hud').appendChild(reticle);

    // Always-visible (when in flight) control hints — fixes "confusing" by making arrows + mouse immediately obvious and fun
    const hints = document.createElement('div');
    hints.id = 'control-hints';
    hints.textContent = 'WASD / ↑↓←→  thrust & strafe  •  Mouse aim  •  SPACE / LMB fire  •  SHIFT boost';
    document.getElementById('ui-root').appendChild(hints);

    // Hide hints when not in flight mode
    const origFrame = this.frame ? this.frame.bind(this) : null;
    this.frame = (dt, state) => {
      if (origFrame) origFrame(dt, state);
      const inFlight = state.mode === 'flight' && (!state.ui || !state.ui.screenStack || state.ui.screenStack.length === 0);
      if (hints) hints.style.display = inFlight ? 'block' : 'none';
      if (reticle) reticle.style.display = inFlight ? 'block' : 'none';
    };

    // UI key router (UI-owned keys only; flight keys belong to the flight input system)
    this.input = createUiInput(ctx, this.screenManager);

    // navigation fallback events (screens may emit these if they can't reach the manager)
    this.bus.on('ui:pushScreen', ({ id }) => { if (id) this.screenManager.pushScreen(id); });
    this.bus.on('ui:popScreen', () => this.screenManager.popScreen());
    this.bus.on('ui:replaceScreen', ({ id }) => { if (id) this.screenManager.replaceScreen(id); });
    this.bus.on('ui:closeAll', () => this.screenManager.closeAll());

    // dock flow: dock:docked → open station hub; dock:undocked → restore HUD
    this.bus.on('dock:docked', ({ stationId }) => {
      this.state.ui.docked = true;
      if (this.screenManager.top() !== 'station') this.screenManager.pushScreen('station');
      else this.screenManager.syncVisibility();
    });
    this.bus.on('dock:undocked', () => {
      this.state.ui.docked = false;
      // pop the station hub if it is the current top
      if (this.screenManager.top() === 'station') this.screenManager.popScreen();
      this.screenManager.syncVisibility();
    });

    // mode → boot screen: show Main Menu only if state.mode==='menu' (it's 'flight' now → just HUD).
    this.bus.on('game:started', () => { this.screenManager.closeAll(); this.screenManager.syncVisibility(); });
    this.bus.on('save:loaded', () => {
      // clear any stale modal restored from a save; HUD returns
      this.state.ui.docked = false;
      this.screenManager.closeAll();
      this.screenManager.syncVisibility();
    });

    // register all modal screens (dynamic + per-screen guarded). The Main Menu is shown by the
    // registerScreens() resolution path IF state.mode is still 'menu' when it loads — this avoids
    // a race: main.js flips mode→'flight' synchronously after registry.init(), before the screen
    // import promises resolve, so on a normal flight boot the menu is (correctly) not shown.
    this.registerScreens();
    this.screenManager.syncVisibility();
  },

  // Dynamically import + register every screen; a missing/throwing module is logged and skipped.
  registerScreens() {
    for (const { path, name } of SCREEN_MODULES) {
      import(path)
        .then((mod) => {
          const def = mod && (mod[name] || mod.default);
          if (!def || !def.id) { console.warn(`[ui] screen "${name}" missing valid export`); return; }
          try { this.screenManager.register(def); }
          catch (err) { console.error(`[ui] register("${def.id}") failed:`, err); return; }
          // if we are in menu mode and the main menu just became available, show it
          if (def.id === 'mainMenu' && this.state.mode === 'menu' && !this.screenManager.isOpen()) {
            try { this.screenManager.pushScreen('mainMenu'); } catch (e) { console.error(e); }
          }
          // if docked already but the station hub registered late, open it
          if (def.id === 'station' && this.state.ui.docked && this.screenManager.top() !== 'station') {
            try { this.screenManager.pushScreen('station'); } catch (e) { console.error(e); }
          }
        })
        .catch((err) => { console.warn(`[ui] screen module "${path}" unavailable:`, err && err.message ? err.message : err); });
    }
  },

  // Per-render-frame cheap HUD path (§5.5). Runs even while paused/docked (render keeps going);
  // we still refresh the HUD numbers/radar but the HUD layer is CSS-hidden when modal/docked.
  frame(dt, state) {
    try {
      if (this.hud) this.hud.frame(dt);
      if (this.toasts && this.toasts.tick) this.toasts.tick();
      // refresh the active modal screen at a low cadence (event-driven screens also self-update)
      this._rt = (this._rt || 0) + 1;
      if ((this._rt % 18) === 0 && this.screenManager && this.screenManager.isOpen()) {
        this.screenManager.refreshTop();
      }
    } catch (err) {
      this._fe = (this._fe || 0) + 1;
      if (this._fe <= 10) console.error('[ui] frame error:', err);
    }
  },
};

function injectHudCss() {
  if (document.getElementById(HUD_STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = HUD_STYLE_ID;
  s.textContent = `
  /* ===== SpaceFace flight HUD ===== */
  #hud { font-size: calc(15px * var(--ui-scale)); }
  #hud > * { pointer-events: none; }

  /* bottom-left status bars */
  .sf-bars { position:absolute; left:18px; bottom:18px; display:flex; flex-direction:column; gap:7px;
    padding:12px 14px; background:rgba(8,14,24,.55); border:1px solid var(--panel-edge);
    border-radius:8px; backdrop-filter:blur(4px); }
  .sf-barrow { display:flex; align-items:center; gap:9px; }
  .sf-barrow__label { width:38px; font-family:var(--mono); font-size:10px; letter-spacing:.12em; color:var(--ink-dim); }
  .sf-barrow__num { width:42px; text-align:right; font-size:11px; color:var(--ink); }
  .sf-bar { position:relative; width:200px; height:13px; border-radius:3px; overflow:hidden;
    background:rgba(4,9,18,.85); box-shadow:inset 0 0 0 1px rgba(57,208,255,.08); }
  .sf-bar--sm { height:8px; width:100%; }
  .sf-bar__fill { position:absolute; inset:0; transform-origin:left center; transform:scaleX(1);
    transition:transform .12s linear; }
  .sf-bar--hull .sf-bar__fill { background:linear-gradient(90deg,#b8324a,var(--hull)); }
  .sf-bar--shield .sf-bar__fill { background:linear-gradient(90deg,#1d6fa8,var(--shield)); }
  .sf-bar--energy .sf-bar__fill { background:linear-gradient(90deg,#b8932a,var(--energy)); }
  .sf-bar--heat .sf-bar__fill { background:linear-gradient(90deg,#a8521f,#ff8a3d); }
  .sf-bar--low { animation:sf-barpulse 1s ease-in-out infinite alternate; }
  @keyframes sf-barpulse { from { box-shadow:inset 0 0 0 1px rgba(255,84,112,.2); } to { box-shadow:inset 0 0 6px 1px rgba(255,84,112,.7); } }

  /* bottom-center cluster */
  .sf-cluster { position:absolute; left:50%; bottom:18px; transform:translateX(-50%);
    display:flex; gap:10px; align-items:stretch; }
  .sf-stat { display:flex; flex-direction:column; align-items:center; gap:2px; min-width:62px;
    padding:7px 12px; background:rgba(8,14,24,.55); border:1px solid var(--panel-edge); border-radius:7px;
    backdrop-filter:blur(4px); }
  .sf-stat--wide { min-width:96px; }
  .sf-stat__k { font-size:9px; letter-spacing:.16em; color:var(--ink-mute); }
  .sf-stat__v { font-size:16px; color:var(--ink); }
  .sf-credits { color:var(--accent-2); }
  .sf-stat__v.sf-warn { color:var(--warn); }

  /* bottom-right radar + target */
  .sf-rightdock { position:absolute; right:18px; bottom:18px; display:flex; flex-direction:column; align-items:flex-end; gap:8px; }
  .sf-radar { width:180px; height:180px; border-radius:50%; overflow:hidden;
    border:1px solid var(--panel-edge); box-shadow:0 0 18px rgba(0,0,0,.5); }
  .sf-radar canvas { display:block; }
  .sf-target { width:220px; padding:8px 10px; display:flex; flex-direction:column; gap:5px; }
  .sf-target__head { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
  .sf-target__name { font-size:13px; color:var(--ink); letter-spacing:.04em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .sf-target__faction { font-family:var(--mono); font-size:10px; letter-spacing:.08em; }
  .sf-target__meta { display:flex; justify-content:space-between; font-size:11px; color:var(--ink-dim); }

  /* top-right objective tracker */
  .sf-objectives { position:absolute; right:18px; top:16px; display:flex; flex-direction:column; gap:5px; align-items:flex-end; max-width:280px; }
  .sf-obj { display:flex; align-items:center; gap:7px; padding:5px 10px; background:rgba(8,14,24,.55);
    border:1px solid var(--panel-edge); border-radius:6px; font-size:12px; color:var(--ink); backdrop-filter:blur(4px); }
  .sf-obj__dot { width:6px; height:6px; border-radius:50%; background:var(--accent); box-shadow:0 0 6px var(--accent); flex:0 0 auto; }
  .sf-obj__t { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

  /* off-screen objective arrow */
  .sf-objarrow { position:absolute; width:0; height:0; border-style:solid; border-width:8px 0 8px 14px;
    border-color:transparent transparent transparent var(--accent); filter:drop-shadow(0 0 5px var(--accent)); z-index:11; }

  /* ===== toasts ===== */
  .sf-toast { display:flex; align-items:center; gap:9px; width:280px; padding:9px 12px;
    background:rgba(11,18,32,.92); border:1px solid var(--panel-edge); border-left:3px solid var(--accent);
    border-radius:6px; color:var(--ink); font-size:13px; box-shadow:0 6px 22px rgba(0,0,0,.5);
    pointer-events:auto; cursor:pointer; transform:translateX(120%); opacity:0; transition:transform .16s ease, opacity .16s ease; }
  .sf-toast--in { transform:translateX(0); opacity:1; }
  .sf-toast--out { transform:translateX(120%); opacity:0; }
  .sf-toast__icon { font-family:var(--mono); font-size:13px; color:var(--accent); }
  .sf-toast--success, .sf-toast--good { border-left-color:var(--good); }
  .sf-toast--success .sf-toast__icon, .sf-toast--good .sf-toast__icon { color:var(--good); }
  .sf-toast--error, .sf-toast--danger { border-left-color:var(--danger); }
  .sf-toast--error .sf-toast__icon, .sf-toast--danger .sf-toast__icon { color:var(--danger); }
  .sf-toast--warn { border-left-color:var(--warn); }
  .sf-toast--warn .sf-toast__icon { color:var(--warn); }
  .sf-toast--credits .sf-toast__icon, .sf-toast--rep .sf-toast__icon { color:var(--accent-2); }

  /* ===== alerts ===== */
  .sf-alert { display:flex; align-items:center; gap:8px; padding:6px 16px; border-radius:999px;
    font-family:var(--mono); font-size:12px; letter-spacing:.14em; text-transform:uppercase;
    background:rgba(8,14,24,.78); border:1px solid var(--panel-edge); color:var(--ink); }
  .sf-alert--info { color:var(--accent); border-color:rgba(57,208,255,.4); }
  .sf-alert--warn { color:var(--warn); border-color:rgba(255,179,71,.5); }
  .sf-alert--danger { color:var(--danger); border-color:rgba(255,84,112,.6);
    animation:sf-alertpulse .8s ease-in-out infinite alternate; }
  @keyframes sf-alertpulse { from { box-shadow:0 0 0 0 rgba(255,84,112,0); transform:scale(1); }
    to { box-shadow:0 0 14px 1px rgba(255,84,112,.55); transform:scale(1.03); } }
  `;
  document.head.appendChild(s);
}
