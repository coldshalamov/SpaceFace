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

// Clean inline UI art (replaces the captioned reference-sheet .jpg assets that rendered text).
const RETICLE_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;overflow:visible">
  <g fill="none" stroke="#39d0ff" stroke-width="2" stroke-linecap="round" style="filter:drop-shadow(0 0 3px #39d0ff)">
    <circle cx="50" cy="50" r="30" opacity="0.85"/>
    <circle cx="50" cy="50" r="40" opacity="0.18"/>
    <line x1="50" y1="6" x2="50" y2="20"/><line x1="50" y1="80" x2="50" y2="94"/>
    <line x1="6" y1="50" x2="20" y2="50"/><line x1="80" y1="50" x2="94" y2="50"/>
  </g>
  <circle cx="50" cy="50" r="3" fill="#39d0ff" style="filter:drop-shadow(0 0 4px #39d0ff)"/>
</svg>`;
const PILOT_AVATAR_SVG = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
  <defs>
    <radialGradient id="sfvisor" cx="42%" cy="38%" r="70%">
      <stop offset="0%" stop-color="#bff4ff"/><stop offset="45%" stop-color="#39d0ff"/><stop offset="100%" stop-color="#0a3a5c"/>
    </radialGradient>
    <linearGradient id="sfhelm" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2a3a5a"/><stop offset="100%" stop-color="#101a2e"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" fill="#0b1220"/>
  <path d="M10 38 a22 22 0 0 1 44 0 v10 a6 6 0 0 1 -6 6 H16 a6 6 0 0 1 -6 -6 z" fill="url(#sfhelm)" stroke="#39d0ff" stroke-width="1.5"/>
  <path d="M17 34 a15 13 0 0 1 30 0 v5 a4 4 0 0 1 -4 4 H21 a4 4 0 0 1 -4 -4 z" fill="url(#sfvisor)"/>
  <ellipse cx="26" cy="31" rx="3.5" ry="6" fill="#eafcff" opacity="0.5"/>
  <path d="M14 40 h36" stroke="#39d0ff" stroke-width="1" opacity="0.4"/>
</svg>`;
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

    // === UI identity: pilot avatar, aiming reticle, control clarity ===
    // NOTE: the generated assets/pilots/*.jpg and assets/ui/reticle.jpg are LABELLED reference
    // contact-sheets (captions + black backgrounds), not usable sprites — they rendered text in the
    // HUD. Replaced with clean on-theme inline SVG (a helmet avatar + a crosshair).
    const portrait = document.createElement('div');
    portrait.id = 'pilot-portrait';
    portrait.title = 'Pilot';
    portrait.innerHTML = PILOT_AVATAR_SVG;
    document.getElementById('ui-root').appendChild(portrait);

    // Center aiming reticle (clean SVG crosshair).
    const reticle = document.createElement('div');
    reticle.id = 'aim-reticle';
    reticle.innerHTML = RETICLE_SVG;
    document.getElementById('hud').appendChild(reticle);

    // Always-visible (when in flight) control hints — reflects the Phase 1 flight model: arrows
    // fly the ship (yaw + throttle) with momentum + banking; mouse independently aims & fires.
    const hints = document.createElement('div');
    hints.id = 'control-hints';
    hints.textContent = '↑↓ throttle  •  ←→ / A D steer (banks)  •  Mouse aim  •  LMB / SPACE fire  •  RMB mine  •  SHIFT boost  •  F auto-fire';
    document.getElementById('ui-root').appendChild(hints);

    // Hide hints/reticle when not in pure flight (improved from initial override for robustness)
    const setFlightUI = (visible) => {
      if (hints) hints.style.display = visible ? 'block' : 'none';
      if (reticle) reticle.style.display = visible ? 'block' : 'none';
    };
    const refreshFlightUI = () => {
      const modalOpen = this.screenManager && this.screenManager.isOpen && this.screenManager.isOpen();
      const docked = this.state && this.state.ui && this.state.ui.docked === true;
      setFlightUI(this.state && this.state.mode === 'flight' && !modalOpen && !docked);
    };
    this.bus.on('mode:changed', refreshFlightUI);
    // initial
    setTimeout(refreshFlightUI, 50);

    // === Cinematic intro splash using generated assets (C-INTRO still + menu bg + pilot + reticle) ===
    // Professional first impression + teaches controls immediately. Click/any key to proceed to menu.
    // Only shows on first load per session (pro polish — doesn't annoy returning players).
    const CINEMATIC_SEEN_KEY = 'sf.cinematicSeen';
    this._pendingMainMenu = false;
    this._registeredScreens = new Set();
    const showMainMenuWhenReady = () => {
      if (this.screenManager && this._registeredScreens && this._registeredScreens.has('mainMenu')) {
        if (!this.screenManager.top()) this.screenManager.pushScreen('mainMenu');
        this._pendingMainMenu = false;
      } else {
        this._pendingMainMenu = true;
      }
    };

    const shouldShowCinematic = !sessionStorage.getItem(CINEMATIC_SEEN_KEY);
    if (shouldShowCinematic) {
      const cinematic = document.createElement('div');
      cinematic.id = 'cinematic-splash';
      cinematic.style.cssText = 'position:fixed;inset:0;z-index:3000;display:flex;align-items:center;justify-content:center;background:#05070d;overflow:hidden;pointer-events:auto;';
      cinematic.innerHTML = `
        <div style="position:absolute;inset:0;background-image:url('assets/cinematics/menu_background.jpg');background-size:cover;background-position:center 30%;opacity:0.7;filter:contrast(1.1);"></div>
        <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,7,13,.5),rgba(5,7,13,0) 30%,rgba(5,7,13,0) 75%,rgba(5,7,13,1));"></div>
        <div style="position:relative;text-align:center;color:#d3e6ff;font-family:var(--mono,monospace);z-index:1;text-shadow:0 0 30px #39d0ff;">
          <div style="font-size:13px;letter-spacing:8px;opacity:0.7;margin-bottom:10px;">A HARD SCI-FI SPACE ODYSSEY</div>
          <div style="font-size:clamp(48px,9vw,92px);line-height:1;letter-spacing:.12em;margin-bottom:14px;color:#39d0ff;font-weight:700;">SPACEFACE</div>
          <div style="margin:14px auto 26px;max-width:640px;opacity:0.85;font-size:15px;line-height:1.45;font-family:var(--font,sans-serif);letter-spacing:.02em;">
            Mine the glowing veins. Outrun the pirates. Build your empire.<br>
            Your face is your legend.
          </div>
          <div style="font-size:12px;opacity:0.6;margin-bottom:20px;letter-spacing:.08em;">↑↓ THROTTLE &nbsp;•&nbsp; ←→ STEER (BANKS) &nbsp;•&nbsp; MOUSE AIM &nbsp;•&nbsp; LMB FIRE &nbsp;•&nbsp; F AUTO-FIRE &nbsp;•&nbsp; SHIFT BOOST/DASH</div>
          <div style="font-size:11px;letter-spacing:4px;opacity:0.5;">CLICK OR PRESS ANY KEY TO BEGIN</div>
        </div>
        <div id="cinematic-pilot" style="position:absolute;bottom:24px;right:24px;width:92px;height:92px;border:3px solid #39d0ff;border-radius:50%;overflow:hidden;box-shadow:0 0 30px #39d0ff;opacity:0.95;background:#0b1220;">
          ${PILOT_AVATAR_SVG}
        </div>
      `;
      document.getElementById('ui-root').appendChild(cinematic);

      const dismissCinematic = () => {
        cinematic.style.transition = 'opacity .45s ease';
        cinematic.style.opacity = '0';
        setTimeout(() => cinematic.parentNode && cinematic.parentNode.removeChild(cinematic), 500);
        sessionStorage.setItem(CINEMATIC_SEEN_KEY, '1');
        // ensure menu shows
        showMainMenuWhenReady();
      };
      cinematic.addEventListener('click', dismissCinematic);
      addEventListener('keydown', function once() { removeEventListener('keydown', once); dismissCinematic(); }, { once: true });
      // Auto-dismiss safety after long time
      setTimeout(() => { if (cinematic.parentNode) dismissCinematic(); }, 18000);
    } else {
      // If already seen this session, ensure we land on the menu
      setTimeout(() => {
        showMainMenuWhenReady();
      }, 80);
    }

    // Expose a simple professional video player for the generated C-INTRO clips (cool factor, uses the 6s videos we created).
    this.playCinematic = (videoPath = 'assets/cinematics/C-INTRO-01_6s.mp4', title = 'Intro') => {
      const ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;z-index:5000;background:rgba(3,5,10,0.92);display:flex;align-items:center;justify-content:center;';
      ov.innerHTML = `
        <div style="max-width:92vw;max-height:92vh;position:relative;">
          <video src="${videoPath}" autoplay controls playsinline style="max-width:100%;max-height:82vh;border:3px solid #39d0ff;box-shadow:0 0 40px #39d0ff;"></video>
          <div style="text-align:center;margin-top:8px;color:#d3e6ff;font-family:var(--mono);letter-spacing:2px;opacity:0.7;">${title} — click backdrop to close</div>
        </div>
      `;
      ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
      const vid = ov.querySelector('video');
      if (vid) vid.addEventListener('ended', () => setTimeout(() => ov.remove(), 400));
      document.getElementById('ui-root').appendChild(ov);
    };
    window.playSpaceFaceCinematic = this.playCinematic; // handy for console or future buttons

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
      this.state.ui.dockedStationId = stationId || null;
      if (this.screenManager.top() !== 'station') this.screenManager.pushScreen('station');
      else this.screenManager.syncVisibility();
    });
    this.bus.on('dock:undocked', () => {
      this.state.ui.docked = false;
      this.state.ui.dockedStationId = null;
      // pop the station hub if it is the current top
      if (this.screenManager.top() === 'station') this.screenManager.popScreen();
      this.screenManager.syncVisibility();
    });

    // mode → boot screen: show Main Menu only if state.mode==='menu' (it's 'flight' now → just HUD).
    this.bus.on('game:started', () => { this.screenManager.closeAll(); this.screenManager.syncVisibility(); refreshFlightUI(); });
    this.bus.on('save:loaded', () => {
      // clear any stale modal restored from a save; HUD returns
      this.state.ui.docked = false;
      this.state.ui.dockedStationId = null;
      this.screenManager.closeAll();
      this.screenManager.syncVisibility();
      refreshFlightUI();
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
          if (!this._registeredScreens) this._registeredScreens = new Set();
          this._registeredScreens.add(def.id);
          // if we are in menu mode and the main menu just became available, show it
          if (def.id === 'mainMenu' && this.state.mode === 'menu' && (this._pendingMainMenu || !this.screenManager.isOpen())) {
            this._pendingMainMenu = false;
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
  body.ui-modal-open #aim-reticle,
  body.ui-modal-open #control-hints,
  body.ui-modal-open #pilot-portrait { display: none !important; }

  /* Reticle reflects fire mode: amber tint + slight pulse when auto-fire is engaging hostiles,
     cyan when the pilot aims/fires manually (Phase 2). */
  #aim-reticle { transition: filter .2s ease; }
  #aim-reticle.autofire { filter: hue-rotate(150deg) saturate(1.3) brightness(1.05);
    animation: sf-reticlepulse 1.4s ease-in-out infinite alternate; }
  @keyframes sf-reticlepulse { from { transform: scale(1); } to { transform: scale(1.06); } }

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
  .sf-bar--boost .sf-bar__fill { background:linear-gradient(90deg,#7a3df0,#c98cff); }   /* Phase 3 boost energy (violet) */
  .sf-bar--low { animation:sf-barpulse 1s ease-in-out infinite alternate; }
  .sf-bar--ready { box-shadow:inset 0 0 0 1px rgba(201,140,255,.45), 0 0 8px rgba(170,90,255,.5);
    animation:sf-barready 1.1s ease-in-out infinite alternate; }
  @keyframes sf-barpulse { from { box-shadow:inset 0 0 0 1px rgba(255,84,112,.2); } to { box-shadow:inset 0 0 6px 1px rgba(255,84,112,.7); } }
  @keyframes sf-barready { from { box-shadow:inset 0 0 0 1px rgba(201,140,255,.3); } to { box-shadow:inset 0 0 6px 2px rgba(170,90,255,.8); } }

  /* Phase 4: nav readout (top-center) + fuel gauge (top-left) */
  .sf-nav-readout { position:absolute; top:16px; left:50%; transform:translateX(-50%);
    padding:7px 16px; background:rgba(8,14,24,.6); border:1px solid var(--panel-edge);
    border-radius:7px; backdrop-filter:blur(4px); text-align:center; pointer-events:none; }
  .sf-nav-label { font-size:13px; color:var(--accent); letter-spacing:.06em; }
  .sf-nav-meta { font-size:11px; color:var(--ink-dim); margin-top:2px; }
  .sf-nav-meta .sf-nav-dist { color:var(--ink); }
  .sf-fuel { position:absolute; top:16px; left:18px; display:flex; align-items:center; gap:8px;
    padding:6px 12px; background:rgba(8,14,24,.55); border:1px solid var(--panel-edge);
    border-radius:7px; backdrop-filter:blur(4px); }
  .sf-fuel-label { font-size:10px; letter-spacing:.14em; color:var(--ink-mute); }
  .sf-bar--fuel { width:90px; height:9px; }
  .sf-bar--fuel .sf-bar__fill { background:linear-gradient(90deg,#1d6fa8,#39d0ff); }
  .sf-fuel-num { font-size:11px; color:var(--ink); width:34px; text-align:right; }
  .sf-fuel--low .sf-bar--fuel { animation:sf-barpulse 1s ease-in-out infinite alternate; }

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
