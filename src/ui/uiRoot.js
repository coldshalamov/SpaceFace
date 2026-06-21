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
import { createComms } from './comms.js';

// id-of-export → { path, export }. Order matters only for nicer console logs.
const SCREEN_MODULES = [
  { path: './screens/stationHub.js', name: 'stationHub' },
  { path: './screens/starmap.js', name: 'starmapScreen' },
  { path: './screens/techTree.js', name: 'techTreeScreen' },
  { path: './screens/automationPanel.js', name: 'automationScreen' },
  { path: './screens/drill.js', name: 'drillScreen' },
  { path: './screens/base.js', name: 'baseScreen' },
  { path: './screens/mainMenu.js', name: 'mainMenuScreen' },
  { path: './screens/newGame.js', name: 'newGameScreen' },
  { path: './screens/pause.js', name: 'pauseScreen' },
  { path: './screens/settings.js', name: 'settingsScreen' },
  { path: './screens/saveLoad.js', name: 'saveLoadScreen' },
  { path: './screens/help.js', name: 'helpScreen' },
  { path: './screens/missionLog.js', name: 'missionLogScreen' },
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

    // comms / graffiti / endgame narrative overlay (story system drives it via events)
    this.comms = createComms(ctx);

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

    // Always-visible (when in flight) control hints. The default text below is the open-flight set;
    // the onboarding system's _updateControlBar() replaces it each frame with context-sensitive
    // hints based on the player's current activity (mining, combat, near station, near gate).
    const hints = document.createElement('div');
    hints.id = 'control-hints';
    hints.textContent = 'W/Up thrust  •  A D steer  •  Mouse aim  •  LMB/Space fire  •  RMB sample  •  Shift boost  •  Tab target  •  M map  •  I cargo  •  L comms';
    document.getElementById('ui-root').appendChild(hints);

    // Hide hints/reticle when not in pure flight (improved from initial override for robustness)
    // showHints: briefly show the control bar then fade out.
    // ms = how long to keep it visible before fading (default 8s on flight start, 3.5s on context change).
    let _hintFadeTimer = null;
    const showHints = (ms = 8000) => {
      if (!hints) return;
      clearTimeout(_hintFadeTimer);
      hints.classList.add('sf-hint-visible');
      _hintFadeTimer = setTimeout(() => hints.classList.remove('sf-hint-visible'), ms);
    };
    // Expose so onboarding can flash hints on context change
    window._sfShowHints = showHints;

    const setFlightUI = (visible) => {
      if (hints) {
        // Keep hard-hidden (display:none) when outside flight so the modal override still works.
        hints.style.display = visible ? '' : 'none';
        if (visible) showHints(8000); else { clearTimeout(_hintFadeTimer); hints.classList.remove('sf-hint-visible'); }
      }
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
      if (!this.state || this.state.mode !== 'menu') {
        this._pendingMainMenu = false;
        return;
      }
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
            Follow the mass discrepancy. Outrun the auditors. Decide who owns the evidence.<br>
            Contract 47-A is open.
          </div>
          <div style="font-size:12px;opacity:0.6;margin-bottom:20px;letter-spacing:.08em;">↑↓ THROTTLE &nbsp;•&nbsp; ←→ STEER (BANKS) &nbsp;•&nbsp; MOUSE AIM &nbsp;•&nbsp; LMB FIRE &nbsp;•&nbsp; F AUTO-FIRE &nbsp;•&nbsp; SHIFT BOOST/DASH</div>
          <div style="font-size:11px;letter-spacing:4px;opacity:0.5;">CLICK OR PRESS ANY KEY TO BEGIN</div>
        </div>
        <div id="cinematic-pilot" style="position:absolute;bottom:24px;right:24px;width:92px;height:92px;border:3px solid #39d0ff;border-radius:50%;overflow:hidden;box-shadow:0 0 30px #39d0ff;opacity:0.95;background:#0b1220;">
          ${PILOT_AVATAR_SVG}
        </div>
      `;
      document.getElementById('ui-root').appendChild(cinematic);

      let dismissed = false;
      let autoDismissTimer = null;
      const dismissCinematic = () => {
        if (dismissed) return;
        dismissed = true;
        cinematic.removeEventListener('click', dismissCinematic);
        removeEventListener('keydown', dismissCinematic);
        if (autoDismissTimer) clearTimeout(autoDismissTimer);
        cinematic.style.transition = 'opacity .45s ease';
        cinematic.style.opacity = '0';
        setTimeout(() => cinematic.parentNode && cinematic.parentNode.removeChild(cinematic), 500);
        sessionStorage.setItem(CINEMATIC_SEEN_KEY, '1');
        // ensure menu shows
        showMainMenuWhenReady();
      };
      cinematic.addEventListener('click', dismissCinematic);
      addEventListener('keydown', dismissCinematic);
      // Auto-dismiss safety after long time
      autoDismissTimer = setTimeout(() => { if (cinematic.parentNode) dismissCinematic(); }, 18000);
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
    this.bus.on('ui:cycleTarget', ({ dir } = {}) => cycleTarget(this.state, dir || 1, this.bus));

    // Dock transition overlay
    const dockFade = document.createElement('div');
    dockFade.className = 'sf-dock-fade';
    dockFade.id = 'sf-dock-overlay';
    document.getElementById('ui-root').appendChild(dockFade);

    this.bus.on('dock:docked', ({ stationId }) => {
      // Phase 1: fade to dark
      dockFade.style.pointerEvents = 'auto'; // block input during transition
      dockFade.classList.add('active');

      // Dock fly-in: drive a scripted push-zoom via the camera controller instead of the old
      // hard-set on state.camera.zoom (which fought the dynamic-zoom damping and snapped). The
      // pushZoom widens the view ~25% over the fade so the approach reads as a committed fly-in,
      // then eases back on its own. A docking-permission comm beep precedes the clunk.
      this.bus.emit('audio:cue', { id: 'ui_confirm' });
      const camCtrl = this.state.render && this.state.render.cameraCtrl;
      if (camCtrl && typeof camCtrl.pushZoom === 'function') camCtrl.pushZoom(0.25, 0.9);

      setTimeout(() => {
        // Phase 2: at peak darkness, do the screen swap
        this.state.ui.docked = true;
        this.state.ui.dockedStationId = stationId || null;
        if (this.screenManager.top() !== 'station') this.screenManager.pushScreen('station');
        else this.screenManager.syncVisibility();

        // Phase 3: fade back in
        setTimeout(() => {
          dockFade.classList.remove('active');
          setTimeout(() => {
            dockFade.style.pointerEvents = 'none';
          }, 400);
        }, 50); // brief hold at full dark before fading back
      }, 400); // matches the CSS transition duration
    });
    this.bus.on('dock:undocked', () => {
      // Phase 1: fade to dark
      dockFade.style.pointerEvents = 'auto';
      dockFade.classList.add('active');

      // Launch reveal: a brief push-zoom on undock so emerging from the station reads as momentum.
      const camCtrl = this.state.render && this.state.render.cameraCtrl;
      if (camCtrl && typeof camCtrl.pushZoom === 'function') camCtrl.pushZoom(0.18, 0.7);

      setTimeout(() => {
        // Phase 2: at peak darkness, do the screen swap
        this.state.ui.docked = false;
        this.state.ui.dockedStationId = null;
        if (this.screenManager.top() === 'station') this.screenManager.popScreen();
        this.screenManager.syncVisibility();

        // Phase 3: fade back in
        setTimeout(() => {
          dockFade.classList.remove('active');
          setTimeout(() => {
            dockFade.style.pointerEvents = 'none';
          }, 400);
        }, 50);
      }, 400);
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

  // Per-render-frame cheap HUD path (§5.5). The expensive HUD paint/update path only runs when
  // the flight HUD is visible; hidden modal/docked states keep toasts and safety alerts alive.
  frame(dt, state) {
    try {
      const st = state || this.state;
      const modalOpen = !!(this.screenManager && this.screenManager.isOpen && this.screenManager.isOpen());
      const docked = !!(st && st.ui && st.ui.docked === true);
      const hudVisible = !!(st && st.mode === 'flight' && !modalOpen && !docked);
      if (this.hud) {
        if (hudVisible) {
          if (!this._hudVisibleLast && this.hud.forceRefresh) this.hud.forceRefresh();
          this.hud.frame(dt);
        } else if (this.hud.tickHidden) {
          this.hud.tickHidden(dt);
        }
        this._hudVisibleLast = hudVisible;
      }
      if (this.toasts && this.toasts.tick) this.toasts.tick();
      // comms feed fade sweep + graffiti (narrative overlay; cheap, runs every frame)
      if (this.comms && this.comms.tick) this.comms.tick();
      // refresh the active modal screen at a low cadence (event-driven screens also self-update)
      this._rt = (this._rt || 0) + 1;
      if ((this._rt % 18) === 0 && this.screenManager && this.screenManager.isOpen()) {
        const def = this.screenManager.getActiveScreenDef && this.screenManager.getActiveScreenDef();
        if (def && (def.id === 'automation' || def.id === 'starmap' || def.id === 'techTree' || def.id === 'missionLog') && def.refresh) {
          def.refresh(this.ctx, { periodic: true });
        } else {
          this.screenManager.refreshTop();
        }
      }
    } catch (err) {
      this._fe = (this._fe || 0) + 1;
      if (this._fe <= 10) console.error('[ui] frame error:', err);
    }
  },
};

function cycleTarget(state, dir, bus) {
  const player = state.entities.get(state.playerId);
  if (!player) return;
  const contacts = [];
  for (const e of state.entityList) {
    if (!e.alive || e === player) continue;
    if (e.type === 'projectile' || e.type === 'fx' || e.type === 'pickup') continue;
    const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 5200) continue;
    contacts.push({ e, d });
  }
  contacts.sort((a, b) => a.d - b.d);
  if (!contacts.length) {
    state.player.targetId = null;
    if (bus) bus.emit('toast', { text: 'No contacts in scanner range', kind: 'info', ttl: 2 });
    return;
  }
  const ids = contacts.map((c) => c.e.id);
  const idx = ids.indexOf(state.player.targetId);
  const nextIdx = idx < 0 ? 0 : (idx + dir + ids.length) % ids.length;
  const target = contacts[nextIdx].e;
  state.player.targetId = target.id;
  if (bus) bus.emit('toast', { text: 'Target: ' + targetLabel(target), kind: 'info', ttl: 2 });
}

function targetLabel(e) {
  if (!e) return 'Contact';
  if (e.type === 'station') {
    if (e.data && e.data.isGate) return e.data.name || 'Jump Gate';
    return (e.data && (e.data.name || e.data.stationName || e.data.stationId)) || 'Station';
  }
  if (e.type === 'asteroid') return 'Asteroid';
  if (e.type === 'wreck') return 'Wreck';
  if (e.type === 'ship') return (e.data && e.data.name) || 'Ship';
  if (e.type === 'drone') return 'Drone';
  return e.type || 'Contact';
}

function injectHudCss() {
  if (document.getElementById(HUD_STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = HUD_STYLE_ID;
  s.textContent = `
  /* ===== SpaceFace flight HUD ===== */
  #hud { font-size: calc(15px * var(--ui-scale)); }
  #hud > * { pointer-events: none; }
  body.ui-modal-open #aim-reticle,
  body.ui-modal-open #pilot-portrait { display: none !important; }
  body.ui-modal-open #control-hints { opacity: 0 !important; pointer-events: none !important; }

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
    transition:transform .1s linear; }
  /* Hit-flash: a brief overlay pulse on the bar when the player takes damage to that pool. The flash
     sits above the fill (z-index) and animates opacity via the sf-barhit keyframe; toggled from
     hud.js on combat:damage for the affected pool (hull/shield). */
  .sf-bar__flash { position:absolute; inset:0; pointer-events:none; opacity:0; z-index:2;
    background:#fff; mix-blend-mode:screen; }
  .sf-bar--hit .sf-bar__flash { animation:sf-barhit .32s ease-out forwards; }
  @keyframes sf-barhit { 0%{opacity:.85;} 30%{opacity:.4;} 100%{opacity:0;} }
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
    backdrop-filter:blur(4px); position:relative; }
  .sf-stat--wide { min-width:96px; }
  .sf-stat__k { font-size:9px; letter-spacing:.16em; color:var(--ink-mute); }
  .sf-stat__v { font-size:16px; color:var(--ink); }
  .sf-credits { color:var(--accent-2); }
  .sf-stat__v.sf-warn { color:var(--warn); }
  /* Info-label styling: make it clear these are readouts, not buttons */
  .sf-stat--info { cursor:default; user-select:none; transition:border-color .15s, background .15s; }
  .sf-stat--info:hover { border-color:var(--accent); background:rgba(8,14,24,.75); }
  .sf-stat--info .sf-stat__k { border-bottom:1px dotted rgba(154,168,188,.3); padding-bottom:1px; }
  /* Hover tooltip for stat tiles */
  .sf-tip { display:none; position:absolute; left:50%; bottom:calc(100% + 10px); transform:translateX(-50%);
    min-width:180px; max-width:260px; padding:8px 10px; background:rgba(4,10,18,.92); border:1px solid var(--accent);
    border-radius:6px; backdrop-filter:blur(6px); color:var(--ink); font-family:var(--mono); font-size:11px;
    letter-spacing:.02em; line-height:1.45; white-space:pre-line; pointer-events:none; z-index:200;
    box-shadow:0 4px 16px rgba(0,0,0,.5), 0 0 8px rgba(57,208,255,.15); }
  .sf-tip::after { content:''; position:absolute; left:50%; top:100%; transform:translateX(-50%);
    border:6px solid transparent; border-top-color:var(--accent); }
  .sf-stat--info:hover .sf-tip { display:block; }

  /* bottom-right radar + target */
  .sf-rightdock { position:absolute; right:18px; bottom:18px; display:flex; flex-direction:column; align-items:flex-end; gap:8px; }
  .sf-radar-wrap { display:flex; flex-direction:column; align-items:center; gap:6px; }
  .sf-radar { position:relative; width:180px; height:180px; border-radius:50%; overflow:hidden;
    border:1px solid var(--panel-edge); box-shadow:0 0 18px rgba(0,0,0,.5); cursor:pointer;
    transition:width .3s cubic-bezier(.4,0,.2,1), height .3s cubic-bezier(.4,0,.2,1), box-shadow .25s ease; }
  .sf-radar--expanded { width:340px !important; height:340px !important;
    box-shadow:0 0 0 1px rgba(57,208,255,0.45), 0 0 40px rgba(57,208,255,0.18), 0 0 80px rgba(57,208,255,0.06) !important; }
  /* canvas is always 340px — centered so the overflow:hidden circle reveals from the player outward */
  .sf-radar canvas { display:block; position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); }
  .sf-radar-legend { width:220px; display:grid; grid-template-columns:repeat(5, auto); gap:4px 7px; justify-content:center;
    padding:5px 7px; background:rgba(8,14,24,.58); border:1px solid var(--panel-edge); border-radius:7px;
    color:var(--ink-dim); font-size:9px; letter-spacing:.04em; backdrop-filter:blur(4px); }
  .sf-radar-legend span { display:flex; align-items:center; gap:4px; white-space:nowrap; }
  .sf-radar-legend i { display:inline-block; width:7px; height:7px; flex:0 0 auto; }
  .sf-radar-legend .stn { background:var(--accent-2); }
  .sf-radar-legend .gate { border:1px solid #b99cff; border-radius:50%; }
  .sf-radar-legend .rock { background:#6e7b8c; border-radius:50%; }
  .sf-radar-legend .bad { width:0; height:0; border-left:4px solid transparent; border-right:4px solid transparent; border-bottom:7px solid var(--danger); }
  .sf-radar-legend .obj { transform:rotate(45deg); border:1px solid #ffe36b; }
  /* HUD sub-panel surface (the target readout above the radar, and similar small HUD cards).
     Lighter than the modal .panel: thin border, tight radius, modest shadow so it reads as a
     piece of the HUD rather than a floating dialog. */
  .sf-hudpanel { background:rgba(8,14,24,.82); border:1px solid var(--panel-edge);
    border-radius:6px; box-shadow:0 2px 14px rgba(0,0,0,.45); backdrop-filter:blur(4px); }
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
  .sf-objarrow { position:absolute; left:0; top:0; width:0; height:0; border-style:solid; border-width:8px 0 8px 14px;
    border-color:transparent transparent transparent var(--accent); filter:drop-shadow(0 0 5px var(--accent)); z-index:11;
    will-change:transform; }

  /* ===== toasts ===== */
  .sf-toast { display:flex; align-items:center; gap:9px; width:280px; padding:9px 12px;
    background:rgba(11,18,32,.92); border:1px solid var(--panel-edge); border-left:3px solid var(--accent);
    border-radius:6px; color:var(--ink); font-size:13px; box-shadow:0 6px 22px rgba(0,0,0,.5);
    pointer-events:auto; cursor:pointer; transform:translateX(120%); opacity:0; transition:transform .16s ease, opacity .16s ease; }
  body.ui-modal-open .sf-toast { pointer-events:none; cursor:default; }
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
  /* GF-10: count badge for grouped identical toasts ("Platinum x1 ×5"). Sits after the text,
     monospace + accent-colored so it reads as a multiplier, not part of the message. */
  .sf-toast__count { font-family:var(--mono); font-size:11px; color:var(--accent); margin-left:6px;
    padding:0 5px; border:1px solid var(--panel-edge-2); border-radius:var(--r-pill);
    background:rgba(57,208,255,.1); letter-spacing:.04em; }

  /* ===== alerts ===== */
  .sf-alert { display:flex; align-items:center; gap:8px; padding:6px 16px; border-radius:999px;
    font-family:var(--mono); font-size:12px; letter-spacing:.14em; text-transform:uppercase;
    background:rgba(8,14,24,.78); border:1px solid var(--panel-edge); color:var(--ink); }
  .sf-alert--info { color:var(--accent); border-color:rgba(57,208,255,.4); }
  .sf-alert--warn { color:var(--warn); border-color:rgba(255,179,71,.5); }
  .sf-alert--danger { color:var(--danger); border-color:rgba(255,84,112,.6);
    animation:sf-alertpulse .8s ease-in-out infinite alternate; }
  .sf-alert--dock { color:#30ffb0; border-color:rgba(48,255,176,.6); font-size:18px;
    padding:12px 28px; letter-spacing:.18em;
    background:rgba(8,14,24,.88); box-shadow:0 0 24px rgba(48,255,176,.3);
    animation:sf-dockpulse 1.2s ease-in-out infinite alternate; }
  @keyframes sf-dockpulse { from { box-shadow:0 0 12px rgba(48,255,176,.2); }
    to { box-shadow:0 0 32px rgba(48,255,176,.5); } }
  @keyframes sf-alertpulse { from { box-shadow:0 0 0 0 rgba(255,84,112,0); transform:scale(1); }
    to { box-shadow:0 0 14px 1px rgba(255,84,112,.55); transform:scale(1.03); } }

  /* ===== combat HUD overlay (lock-on, weapon heat bars, target diamond) ===== */

  /* Lock-on progress arc — circular SVG indicator near reticle center */
  .sf-lockring { position:absolute; left:50%; top:50%; width:72px; height:72px;
    transform:translate(-50%,-50%); pointer-events:none; z-index:14; opacity:0;
    transition:opacity .15s ease; filter:drop-shadow(0 0 6px var(--accent)); }
  .sf-lockring.active { opacity:1; }
  .sf-lockring.locked { filter:drop-shadow(0 0 10px var(--danger)); }
  .sf-lockring .sf-lockring__track { fill:none; stroke:var(--panel-edge); stroke-width:2.5; }
  .sf-lockring .sf-lockring__fill { fill:none; stroke:var(--accent); stroke-width:3;
    stroke-linecap:round; transition:stroke .15s ease; }
  .sf-lockring.locked .sf-lockring__fill { stroke:var(--danger); }
  .sf-lockring__label { position:absolute; left:50%; bottom:-2px; transform:translateX(-50%);
    font-family:var(--mono); font-size:9px; letter-spacing:.14em; color:var(--accent);
    text-transform:uppercase; white-space:nowrap; text-shadow:0 0 6px rgba(57,208,255,.6); }
  .sf-lockring.locked .sf-lockring__label { color:var(--danger); text-shadow:0 0 6px rgba(255,84,112,.6); }

  /* Weapon heat bars — anchored above the status bars panel (left:18px matches .sf-bars) */
  .sf-wpn-heats { position:absolute; left:18px;
    display:flex; flex-direction:column; gap:3px; pointer-events:none;
    padding:6px 10px; background:rgba(8,14,24,.5); border:1px solid var(--panel-edge);
    border-radius:6px; backdrop-filter:blur(4px); }
  .sf-wpn-heat { display:flex; align-items:center; gap:6px; }
  .sf-wpn-heat__label { font-family:var(--mono); font-size:9px; letter-spacing:.06em;
    color:var(--ink-dim); width:46px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .sf-wpn-heat__bar { position:relative; width:120px; height:8px; border-radius:2px;
    background:rgba(4,9,18,.85); box-shadow:inset 0 0 0 1px rgba(57,208,255,.08); overflow:hidden; }
  .sf-wpn-heat__fill { position:absolute; inset:0; transform-origin:left center;
    background:linear-gradient(90deg,#a8521f,#ff8a3d); transition:transform .08s linear; }
  .sf-wpn-heat.overheated .sf-wpn-heat__fill { background:linear-gradient(90deg,#cc2020,#ff4040); }
  .sf-wpn-heat.overheated { animation:sf-wpnpulse .5s ease-in-out infinite alternate; }
  @keyframes sf-wpnpulse { from { opacity:.7; } to { opacity:1; } }

  /* Target lock diamond — world-space overlay on locked/selected enemy.
     Outer div is the invisible positioning anchor (translate -50% centers on target).
     Inner div is the visible rotated diamond with pulsing glow. */
  .sf-lockdiamond { position:absolute; width:32px; height:32px; pointer-events:none; z-index:13;
    transform:translate(-50%,-50%); opacity:0; transition:opacity .12s ease;
    --dia-glow:57,208,255; }
  .sf-lockdiamond.visible { opacity:1; }
  .sf-lockdiamond.locked-tgt { --dia-glow:255,84,112; }
  .sf-lockdiamond__inner { position:absolute; inset:2px;
    transform:rotate(45deg);
    border:2px solid rgba(var(--dia-glow),1);
    box-shadow:0 0 10px rgba(var(--dia-glow),.5), inset 0 0 8px rgba(var(--dia-glow),.15);
    animation:sf-diamondpulse 1s ease-in-out infinite alternate; }
  @keyframes sf-diamondpulse {
    from { box-shadow:0 0 6px rgba(var(--dia-glow),.3), inset 0 0 4px rgba(var(--dia-glow),.1); transform:rotate(45deg) scale(.92); }
    to { box-shadow:0 0 16px rgba(var(--dia-glow),.7), inset 0 0 10px rgba(var(--dia-glow),.2); transform:rotate(45deg) scale(1.04); } }

  /* Capacitor readout near weapon area */
  .sf-cap-readout { position:absolute; left:18px; bottom:18px; pointer-events:none;
    font-family:var(--mono); font-size:10px; letter-spacing:.08em; color:var(--ink-dim); }

  @media (max-width: 760px), (max-height: 620px) {
    #control-hints { display:none !important; }
    #pilot-portrait { width:54px; height:54px; top:10px; right:10px; }
    #toasts { left:10px; right:74px; top:10px; align-items:stretch; }
    .sf-toast { width:auto; max-width:none; font-size:12px; padding:8px 10px; }
    #alerts { top:84px; width:calc(100vw - 20px); }
    .sf-alert { max-width:100%; font-size:10px; letter-spacing:.08em; white-space:normal; text-align:center; justify-content:center; }

    .sf-fuel { left:10px; top:10px; padding:5px 8px; max-width:178px; }
    .sf-fuel-label { font-size:9px; }
    .sf-bar--fuel { width:74px; }
    .sf-fuel-num { width:30px; font-size:10px; }
    .sf-nav-readout { top:276px; max-width:calc(100vw - 24px); padding:6px 10px; }
    .sf-nav-label { max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:11px; }
    .sf-nav-meta { font-size:10px; }

    #sf-onboarding { left:12px !important; top:138px !important; width:min(316px, calc(100vw - 24px)) !important; }
    #sf-onboarding .sf-ob-card { padding:10px 11px; }
    #sf-onboarding .sf-ob-title { font-size:13px; }
    #sf-onboarding .sf-ob-hint { font-size:11px; line-height:1.4; }
    .sf-ob-intro { top:12% !important; width:min(520px, calc(100vw - 24px)) !important; padding:18px !important; }
    .sf-ob-intro h1 { font-size:20px; }
    .sf-ob-intro p { font-size:13px; }

    .sf-bars { left:8px; bottom:108px; gap:5px; padding:9px 8px; width:174px; }
    .sf-barrow { gap:5px; }
    .sf-barrow__label { width:34px; font-size:9px; }
    .sf-barrow__num { width:28px; font-size:10px; }
    .sf-bar { width:88px; height:10px; }
    .sf-bar--sm { height:7px; width:100%; }

    .sf-rightdock { right:8px; bottom:108px; gap:5px; }
    .sf-target { width:160px; padding:6px 8px; }
    .sf-target__name { font-size:11px; }
    .sf-target__meta { font-size:10px; }
    .sf-radar-wrap { gap:4px; }
    .sf-radar { width:132px; height:132px; }
    .sf-radar canvas { width:132px !important; height:132px !important; }
    .sf-radar-legend { width:160px; grid-template-columns:repeat(5, auto); gap:3px 4px; padding:4px 5px; font-size:8px; }
    .sf-radar-legend i { width:6px; height:6px; }
    .sf-radar-legend .bad { border-left-width:3px; border-right-width:3px; border-bottom-width:6px; }

    .sf-cluster { left:8px; right:8px; bottom:8px; transform:none; display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:5px; }
    .sf-stat { min-width:0; padding:5px 6px; border-radius:6px; gap:1px; }
    .sf-stat--wide { min-width:0; }
    .sf-stat__k { font-size:8px; }
    .sf-stat__v { font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
    #sf-rolestat { display:none; }
    .sf-tip { display:none !important; }

    .sf-lockring { width:56px; height:56px; }
    .sf-wpn-heats { left:8px; }
    .sf-wpn-heat__bar { width:80px; }
    .sf-wpn-heat__label { width:34px; font-size:8px; }
    .sf-lockdiamond { width:24px; height:24px; }
  }

  /* ===== cargo panel overlay ===== */
  .sf-cargo-panel { position:absolute; left:50%; bottom:90px; transform:translateX(-50%);
    width:380px; max-height:60vh; display:none; flex-direction:column;
    background:rgba(4,10,18,.94); border:1px solid var(--accent); border-radius:8px;
    backdrop-filter:blur(8px); box-shadow:0 8px 32px rgba(0,0,0,.6), 0 0 12px rgba(57,208,255,.15);
    z-index:200; pointer-events:auto; font-family:var(--mono, Consolas, monospace); overflow:hidden; }
  .sf-cargo-panel.open { display:flex; }
  .sf-cargo-panel__head { display:flex; align-items:center; justify-content:space-between;
    padding:10px 14px; border-bottom:1px solid var(--panel-edge); }
  .sf-cargo-panel__title { font-size:13px; letter-spacing:.14em; color:var(--accent); text-transform:uppercase; }
  .sf-cargo-panel__close { background:none; border:1px solid var(--ink-mute); border-radius:4px;
    color:var(--ink-dim); font-size:11px; padding:2px 8px; cursor:pointer; font-family:var(--mono); }
  .sf-cargo-panel__close:hover { border-color:var(--accent); color:var(--accent); }
  .sf-cargo-panel__summary { display:flex; justify-content:space-between; padding:8px 14px;
    font-size:11px; color:var(--ink-dim); border-bottom:1px solid rgba(57,208,255,.08); }
  .sf-cargo-panel__list { overflow-y:auto; max-height:calc(60vh - 90px); padding:6px 0; }
  .sf-cargo-panel__list::-webkit-scrollbar { width:4px; }
  .sf-cargo-panel__list::-webkit-scrollbar-thumb { background:var(--accent); border-radius:2px; }
  .sf-cargo-row { display:grid; grid-template-columns:1fr 50px 50px 60px 56px; align-items:center;
    padding:5px 14px; font-size:11px; color:var(--ink); gap:4px; }
  .sf-cargo-row:hover { background:rgba(57,208,255,.06); }
  .sf-cargo-row__name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--ink); }
  .sf-cargo-row__qty { text-align:right; color:var(--accent-2); }
  .sf-cargo-row__vol { text-align:right; color:var(--ink-dim); }
  .sf-cargo-row__val { text-align:right; color:var(--ink-dim); }
  .sf-cargo-row__jet { background:none; border:1px solid var(--danger); border-radius:3px;
    color:var(--danger); font-size:9px; padding:1px 6px; cursor:pointer; font-family:var(--mono);
    letter-spacing:.06em; opacity:0.7; }
  .sf-cargo-row__jet:hover { opacity:1; background:rgba(255,84,112,.12); }
  .sf-cargo-empty { padding:20px 14px; text-align:center; color:var(--ink-mute); font-size:12px; }
  @media (max-width: 760px) {
    .sf-cargo-panel { width:calc(100vw - 24px); bottom:110px; }
  }

  /* ===== HUD mission tracker (top-left, shows tracked mission) ===== */
  .sf-mission-tracker { position:absolute; top:52px; left:18px; max-width:260px;
    padding:8px 12px; background:rgba(8,14,24,.7); border:1px solid var(--panel-edge);
    border-left:3px solid var(--accent); border-radius:0 6px 6px 0;
    backdrop-filter:blur(4px); pointer-events:none; z-index:10; }
  .sf-mt-title { font-size:12px; color:var(--ink); letter-spacing:.04em; margin-bottom:3px;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .sf-mt-obj { font-size:11px; color:var(--ink-dim); margin-bottom:2px; }
  .sf-mt-time { font-size:10px; color:var(--ink-mute); letter-spacing:.08em; }
  .sf-mt-time.sf-mt-urgent { color:var(--warn); font-weight:600; }
  @media (max-width: 760px) {
    .sf-mission-tracker { top:44px; left:8px; max-width:200px; padding:6px 8px; }
    .sf-mt-title { font-size:10px; }
    .sf-mt-obj { font-size:9px; }
    .sf-mt-time { font-size:9px; }
  }

  /* ===== dock transition overlay ===== */
  .sf-dock-fade { position:fixed; inset:0; z-index:2500; pointer-events:none;
    background:radial-gradient(ellipse at 50% 60%, rgba(5,7,13,0) 0%, rgba(5,7,13,1) 70%);
    opacity:0; transition:opacity 0.4s ease-in-out; }
  .sf-dock-fade.active { opacity:1; }
  `;
  document.head.appendChild(s);
}
