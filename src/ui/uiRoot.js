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
import { initPriceHistory } from './priceHistory.js';
import { isConfirmOpen } from './confirm.js';
import { controlPrompt } from './controlPrompts.js';
import { setPromptScheme } from './controlPrompts.js';
import { isHostileToPlayer, SCANNER_CONTACT_RANGE } from '../systems/scanner.js';
import { createCinematicInputFence } from './cinematicInputFence.js';
import { isMapScreenId, openGalaxyMap } from './mapAuthority.js';

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
// (Removed PILOT_AVATAR_SVG — the helmet/visor pilot circle violated the standing no-visor/no-
//  cockpit HUD rule (00_MASTER_TASTE §3). The splash now uses a clean non-diegetic signal slate.)
import { createHud } from './hud.js';
import { createBandHud } from './bandHud.js';
import { createEncounterChoicePrompt } from './encounterChoicePrompt.js';
import { createCommandBar } from './commandBar.js';
import { createToasts } from './toasts.js';
import { createMarketNews } from './marketNews.js'; // REVAMP 2.1 — economy news ticker + dock event cards
import { createAlerts } from './alerts.js';
import { createComms } from './comms.js';
import { createWingmanRadial } from './wingmanRadial.js';

// id-of-export → { load, export }. Order matters only for nicer console logs.
// Use literal dynamic-import call sites, not import(path): esbuild can rewrite these to bundled
// chunks. A runtime string import works in the raw dev server but becomes /screens/*.js 404s in
// build/web, which strands packaged players in an empty HUD before the menu registers.
const SCREEN_MODULES = [
  // Docked station: the "Orbital Command" rebuild (src/ui/station/). The adapter re-exports
  // installStationExitGate; legacy screens/stationHub.js stays on disk for its helper exports.
  { path: './station/stationScreen.js', load: () => import('./station/stationScreen.js'), name: 'stationScreen' },
  // REVAMP 2.1 — one zoomable galaxy map (supersedes starmap+localmap once BP-03 parity passes). Lives in src/ui/, not screens/.
  { path: './galaxyMap.js', load: () => import('./galaxyMap.js'), name: 'galaxyMapScreen' },
  { path: './screens/starmap.js', load: () => import('./screens/starmap.js'), name: 'starmapScreen' },
  { path: './screens/localmap.js', load: () => import('./screens/localmap.js'), name: 'localmapScreen' },
  { path: './screens/techTree.js', load: () => import('./screens/techTree.js'), name: 'techTreeScreen' },
  { path: './screens/automationPanel.js', load: () => import('./screens/automationPanel.js'), name: 'automationScreen' },
  // Asteroid works: the drill lens grown into the site-engineering surface (screen id stays
  // 'drill'; src/ui/asteroid/ supersedes screens/drill.js as the live module — that file remains
  // for its exported input-controller/particle helpers and checks, like stationHub before it).
  { path: './asteroid/asteroidScreen.js', load: () => import('./asteroid/asteroidScreen.js'), name: 'asteroidScreen' },
  { path: './screens/base.js', load: () => import('./screens/base.js'), name: 'baseScreen' },
  { path: './screens/mainMenu.js', load: () => import('./screens/mainMenu.js'), name: 'mainMenuScreen' },
  { path: './screens/newGame.js', load: () => import('./screens/newGame.js'), name: 'newGameScreen' },
  { path: './screens/pause.js', load: () => import('./screens/pause.js'), name: 'pauseScreen' },
  { path: './screens/gameOver.js', load: () => import('./screens/gameOver.js'), name: 'gameOverScreen' },
  { path: './screens/settings.js', load: () => import('./screens/settings.js'), name: 'settingsScreen' },
  { path: './screens/saveLoad.js', load: () => import('./screens/saveLoad.js'), name: 'saveLoadScreen' },
  { path: './screens/help.js', load: () => import('./screens/help.js'), name: 'helpScreen' },
  { path: './screens/codex.js', load: () => import('./screens/codex.js'), name: 'codexScreen' },
  { path: './screens/missionLog.js', load: () => import('./screens/missionLog.js'), name: 'missionLogScreen' },
];

const HUD_STYLE_ID = 'sf-hud-style';

export function createFadeLeaseController(dockFade, {
  requestFrame = (fn) => requestAnimationFrame(fn),
  setDelay = (fn, ms) => setTimeout(fn, ms),
  clearDelay = (id) => clearTimeout(id),
  hideDelayMs = 420,
} = {}) {
  const reasons = new Map();
  let hideTimer = null;
  let destroyed = false;

  const sync = () => {
    if (destroyed) return;
    clearDelay(hideTimer);
    dockFade.classList.toggle('sf-administrative-blackout', reasons.has('fulfillment'));
    if (reasons.size > 0) {
      dockFade.hidden = false;
      dockFade.setAttribute('aria-hidden', 'false');
      dockFade.style.pointerEvents = 'auto';
      requestFrame(() => {
        if (reasons.size > 0 && !dockFade.hidden) dockFade.classList.add('active');
      });
      return;
    }
    dockFade.classList.remove('active');
    // Release every input modality together. The visual can finish fading, but the transparent
    // overlay must not keep swallowing pointer/touch after keyboard and gamepad controls resume.
    dockFade.style.pointerEvents = 'none';
    hideTimer = setDelay(() => {
      if (reasons.size > 0 || dockFade.classList.contains('active')) return;
      dockFade.setAttribute('aria-hidden', 'true');
      dockFade.hidden = true;
    }, hideDelayMs);
  };

  return {
    acquire(reason = 'dock') {
      reasons.set(reason, (reasons.get(reason) || 0) + 1);
      sync();
    },
    release(reason = 'dock') {
      const count = reasons.get(reason) || 0;
      if (count <= 1) reasons.delete(reason);
      else reasons.set(reason, count - 1);
      sync();
    },
    set(reason, active) {
      if (active) reasons.set(reason, 1);
      else reasons.delete(reason);
      sync();
    },
    has(reason) {
      return reasons.has(reason);
    },
    destroy() {
      destroyed = true;
      reasons.clear();
      clearDelay(hideTimer);
      dockFade.classList.remove('active', 'sf-administrative-blackout');
      dockFade.style.pointerEvents = 'none';
      dockFade.setAttribute('aria-hidden', 'true');
      dockFade.hidden = true;
    },
  };
}

const FULFILLMENT_BLACKOUT_PHASES = new Set(['blackout', 'transit', 'wake_pending']);

export function createBoardingPhaseFence(state, bus, onChange = () => {}) {
  let active = false;
  let destroyed = false;
  const sync = (payload = {}) => {
    if (destroyed) return;
    const phase = payload && typeof payload.phase === 'string' ? payload.phase : null;
    const wasActive = active;
    active = FULFILLMENT_BLACKOUT_PHASES.has(phase);
    if (!state.ui) state.ui = {};
    state.ui.fulfillmentBlackoutActive = active;
    onChange({ active, wasActive, phase, payload });
  };
  const unsubscribe = bus.on('factionPresence:boardingPhase', sync);
  return {
    sync,
    isActive: () => active,
    destroy() {
      if (destroyed) return;
      try { unsubscribe(); } catch (_) {}
      sync({ phase: 'cancelled' });
      destroyed = true;
    },
  };
}

function saveSlotLabel(slot) {
  const id = slot || 'quick';
  if (id === 'auto' || id === 'autosave') return 'Autosave';
  if (id === 'latest') return 'latest save';
  if (id === 'quick') return 'Quick';
  return 'Slot ' + id;
}

function saveErrorText(payload = {}) {
  const slot = saveSlotLabel(payload.slot);
  switch (payload.reason) {
    case 'no_player': return 'Start or load a game before saving';
    case 'no_save': return 'No save found for ' + slot;
    case 'read_failed': return 'Could not read ' + slot;
    case 'parse_failed':
    case 'bad_format':
    case 'no_data':
    case 'checksum':
      return slot + ' is corrupt or not a SpaceFace save';
    case 'newer_version': return slot + ' requires a newer game version';
    case 'migration_failed': return 'Could not upgrade ' + slot;
    case 'invalid_player': return slot + ' has no playable ship';
    case 'serialize_failed':
    case 'stringify_failed':
      return 'Could not prepare ' + slot + ' for saving';
    case 'no_storage': return 'Browser storage is unavailable';
    case 'quota':
    case 'backup_quota':
    case 'write_failed':
    case 'backup_write_failed':
    case 'write_verify_parse':
    case 'write_verify_failed':
      return 'Save storage is full; export a backup';
    case 'export_failed': return 'Export failed for ' + slot;
    case 'visual_gate_failed': return 'Loaded ' + slot + ', but visuals did not finish';
    case 'load_failed':
    default:
      return 'Save/load failed for ' + slot;
  }
}

function wireSaveFeedback(bus) {
  if (!bus || !bus.on) return;
  bus.on('save:started', ({ slot } = {}) => {
    if (slot === 'auto' || slot === 'autosave') return;
    bus.emit('toast', { text: 'Saving ' + saveSlotLabel(slot), kind: 'info', ttl: 1600 });
  });
  bus.on('save:completed', ({ slot } = {}) => {
    bus.emit('toast', {
      text: (slot === 'auto' || slot === 'autosave') ? 'Autosaved' : 'Saved ' + saveSlotLabel(slot),
      kind: 'good',
      ttl: (slot === 'auto' || slot === 'autosave') ? 1400 : 2200,
    });
  });
  bus.on('save:loaded', ({ slot, visualGatePending, recovered } = {}) => {
    if (recovered) return;
    bus.emit('toast', {
      text: (visualGatePending ? 'Restoring ' : 'Loaded ') + saveSlotLabel(slot),
      kind: visualGatePending ? 'info' : 'good',
      ttl: visualGatePending ? 2200 : 2400,
    });
  });
  bus.on('save:recovered', ({ slot } = {}) => {
    bus.emit('toast', {
      text: 'Recovered previous save for ' + saveSlotLabel(slot),
      kind: 'warn',
      ttl: 3600,
    });
  });
  bus.on('save:error', (payload = {}) => {
    bus.emit('toast', { text: saveErrorText(payload), kind: 'warn', ttl: 3200 });
  });
}

export const ui = {
  name: 'ui',

  init(ctx) {
    if (this.hud && typeof this.hud.destroy === 'function') this.hud.destroy();
    this.hud = null;
    if (this.bandHud && typeof this.bandHud.destroy === 'function') this.bandHud.destroy();
    this.bandHud = null;
    if (this.encounterChoicePrompt && typeof this.encounterChoicePrompt.destroy === 'function') {
      this.encounterChoicePrompt.destroy();
    }
    this.encounterChoicePrompt = null;
    if (this.input && typeof this.input.dispose === 'function') this.input.dispose();
    this.input = null;
    if (typeof this._fulfillmentBlackoutTeardown === 'function') this._fulfillmentBlackoutTeardown();
    this._fulfillmentBlackoutTeardown = null;
    if (typeof this._cinematicTeardown === 'function') this._cinematicTeardown();
    this._cinematicTeardown = null;
    if (this.screenManager && typeof this.screenManager.destroy === 'function') this.screenManager.destroy();
    this.screenManager = null;
    this.manager = null;
    this._cinematicInputFence = null;
    this._titleFlowDisposed = false;
    this.ctx = ctx;
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;

    injectHudCss();

    // UX-4: start the price-history recorder (subscribes to economy:tick; standalone, no sim writes).
    try { initPriceHistory(ctx.bus, ctx.state); } catch (e) { console.warn('[ui] price history init failed', e); }

    // toasts + alerts (transient UI feedback)
    this.toasts = createToasts(ctx);
    this.marketNews = createMarketNews(ctx); // REVAMP 2.1 — economy headlines/ticker (read-only)
    this.alerts = createAlerts(ctx);
    wireSaveFeedback(this.bus);

    // screen manager — expose on ctx + on this system so screens can reach it (§ screens
    // resolve ctx.screenManager / registry.get('ui').screenManager / .manager).
    this.screenManager = createScreenManager(ctx);
    this.manager = this.screenManager;
    ctx.screenManager = this.screenManager;
    ctx.screens = this.screenManager;

    // Register the administrative-blackout capture fence before any interactive comms/HUD module.
    // Document capture listeners on the same target run in registration order, so constructing the
    // input router after a prompt would let that earlier prompt act before the fence could stop it.
    this.input = createUiInput(ctx, this.screenManager);

    // comms / graffiti / endgame narrative overlay (story system drives it via events)
    this.comms = createComms(ctx);
    this.encounterChoicePrompt = createEncounterChoicePrompt(ctx);

    // Wingman command radial (Micro-Loops) — a quick fleet-command wheel on the Z key.
    this.wingmanRadial = createWingmanRadial(ctx);

    // the always-mounted flight HUD
    this.hud = createHud(ctx, this.alerts);
    this.bandHud = createBandHud(ctx);

    // Command Bar — a persistent top-center resource strip (hull/shield/energy/heat/cargo/credits/
    // role/sector). It is a FOURTH permanent anchor that duplicates the bottom-left schematic vitals
    // and the bottom-center cargo/credits/role chips, and it competes with the one-voice channel.
    // HUD three-anchor law (SPEC3-36, Option A — design/revamp/HUD_THREE_ANCHOR.md): retire it in
    // flight; its data already lives in the anchors + contextual chips. Kept imported + flag-gated
    // (NOT deleted) as the ready skeleton for the deferred SPEC3-36 shared screen-header (Option B) —
    // that header belongs in the #screens layer (screenManager), not #ui-root. Flip to true only
    // when that screen-layer header work lands. (Not in featureFlags.js: that registry is combat/
    // determinism-scoped and orchestrator-owned; this is a UI-layout toggle.)
    const COMMAND_BAR_IN_FLIGHT = false;
    this.commandBar = COMMAND_BAR_IN_FLIGHT ? createCommandBar(ctx) : null;

    // === UI: aiming reticle ===
    // (The pilot-helmet avatar was removed — it read as a first-person-visor motif that doesn't fit
    // this third-person chase-cam game, and it sat on every screen as an unexplained symbol.)
    // Software-cursor aiming reticle (clean SVG crosshair).
    const reticle = document.createElement('div');
    reticle.id = 'aim-reticle';
    reticle.innerHTML = RETICLE_SVG;
    const hudRoot = document.getElementById('hud');
    hudRoot.appendChild(reticle);
    let lastReticleX = NaN;
    let lastReticleY = NaN;

    // Always-visible (when in flight) control hints. The default text below is the open-flight set;
    // the onboarding system's _updateControlBar() replaces it each frame with context-sensitive
    // hints based on the player's current activity (mining, combat, near station, near gate).
    setPromptScheme(this.state && this.state.settings && this.state.settings.gameplay
      && this.state.settings.gameplay.controlScheme);
    let HINTS_KBM = controlPrompt('flight', 'kbm');
    const HINTS_PAD = controlPrompt('flight', 'gamepad');
    const hints = document.createElement('div');
    hints.id = 'control-hints';
    hints.textContent = HINTS_KBM;
    document.getElementById('ui-root').appendChild(hints);
    // Control-scheme changes re-key every kbm prompt (helm-assist vs classic copy).
    this.bus.on('settings:changed', () => {
      setPromptScheme(this.state && this.state.settings && this.state.settings.gameplay
        && this.state.settings.gameplay.controlScheme);
      HINTS_KBM = controlPrompt('flight', 'kbm');
      const gpConnected = this.ctx && this.ctx.gamepad && typeof this.ctx.gamepad.isConnected === 'function'
        && this.ctx.gamepad.isConnected();
      if (!gpConnected) hints.textContent = HINTS_KBM;
    });

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

    // Swap the hint bar when a gamepad connects/disconnects so the pilot always sees the right cues.
    this.bus.on('gamepad:connected', () => { hints.textContent = HINTS_PAD; showHints(5000); });
    this.bus.on('gamepad:disconnected', () => { hints.textContent = HINTS_KBM; showHints(3000); });

    const syncFlightCursor = (visible) => {
      const st = this.state;
      const pointer = st && st.input && st.input.pointerScreen;
      const active = !!(visible && pointer && pointer.active);
      document.body.classList.toggle('sf-flight-cursor', active);
      const reticleEl = document.getElementById('aim-reticle') || reticle;
      reticleEl.style.display = visible ? 'block' : 'none';
      if (!visible) return;
      const fallbackX = typeof innerWidth === 'number' ? innerWidth * 0.5 : 0;
      const fallbackY = typeof innerHeight === 'number' ? innerHeight * 0.5 : 0;
      let x = active && Number.isFinite(pointer.x) ? pointer.x : fallbackX;
      let y = active && Number.isFinite(pointer.y) ? pointer.y : fallbackY;
      if (!Number.isFinite(lastReticleX) || Math.abs(x - lastReticleX) > 0.1
        || !Number.isFinite(lastReticleY) || Math.abs(y - lastReticleY) > 0.1) {
        const next = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-50%)`;
        if (reticleEl._sfHudTransform !== next) {
          reticleEl._sfHudTransform = next;
          reticleEl.style.transform = next;
        }
        lastReticleX = x;
        lastReticleY = y;
      }
    };
    this._syncFlightCursor = syncFlightCursor;
    const setFlightUI = (visible) => {
      if (hints) {
        // Keep hard-hidden (display:none) when outside flight so the modal override still works.
        hints.style.display = visible ? '' : 'none';
        if (visible) showHints(8000); else { clearTimeout(_hintFadeTimer); hints.classList.remove('sf-hint-visible'); }
      }
      syncFlightCursor(visible);
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
    this._cinematicActive = false;
    this._pendingMainMenu = false;
    this._registeredScreens = new Set();
    const showMainMenuWhenReady = () => {
      if (this._titleFlowDisposed) {
        this._pendingMainMenu = false;
        return;
      }
      // Do not build/focus the menu underneath the cinematic. Besides being inaccessible, that lets
      // the dismissal key's native activation land on the newly focused New Game button.
      if (this._cinematicActive) {
        this._pendingMainMenu = true;
        return;
      }
      if (!this.state || this.state.mode !== 'menu') {
        this._pendingMainMenu = false;
        return;
      }
      const menuReady = this._registeredScreens &&
        this._registeredScreens.has('mainMenu') &&
        this._registeredScreens.has('newGame');
      if (this.screenManager && menuReady) {
        if (!this.screenManager.top()) this.screenManager.pushScreen('mainMenu');
        this._pendingMainMenu = false;
      } else {
        this._pendingMainMenu = true;
      }
    };
    this._showMainMenuWhenReady = showMainMenuWhenReady;

    let shouldShowCinematic = false;
    try { shouldShowCinematic = !sessionStorage.getItem(CINEMATIC_SEEN_KEY); } catch (e) { shouldShowCinematic = true; }
    if (shouldShowCinematic) {
      this._cinematicActive = true;
      const cinematic = document.createElement('div');
      cinematic.id = 'cinematic-splash';
      cinematic.tabIndex = -1;
      cinematic.setAttribute('role', 'dialog');
      cinematic.setAttribute('aria-modal', 'true');
      cinematic.setAttribute('aria-labelledby', 'cinematic-title');
      cinematic.setAttribute('aria-describedby', 'cinematic-summary');
      cinematic.style.cssText = 'position:fixed;inset:0;z-index:3000;display:flex;align-items:center;justify-content:center;background:#05070d;overflow:hidden;pointer-events:auto;';
      cinematic.innerHTML = `
        <div style="position:absolute;inset:0;background-image:url('assets/cinematics/C-INTRO-01.jpg');background-size:cover;background-position:center 34%;opacity:0.72;filter:contrast(1.08);"></div>
        <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,7,13,.5),rgba(5,7,13,0) 30%,rgba(5,7,13,0) 72%,rgba(5,7,13,1));"></div>
        <div style="position:relative;text-align:center;color:#d3e6ff;font-family:var(--mono,monospace);z-index:1;text-shadow:0 0 30px #39d0ff;">
          <div style="font-size:13px;letter-spacing:8px;opacity:0.7;margin-bottom:10px;">A HARD SCI-FI SPACE ODYSSEY</div>
          <div id="cinematic-title" style="font-size:clamp(48px,9vw,92px);line-height:1;letter-spacing:.12em;margin-bottom:14px;color:#39d0ff;font-weight:700;">SPACEFACE</div>
          <div id="cinematic-summary" style="margin:14px auto 26px;max-width:640px;opacity:0.85;font-size:15px;line-height:1.45;font-family:var(--font,sans-serif);letter-spacing:.02em;">
            Follow the mass discrepancy. Outrun the auditors. Decide who owns the evidence.<br>
            Contract 47-A is open.
          </div>
          <div style="font-size:12px;opacity:0.6;margin-bottom:20px;letter-spacing:.08em;">↑↓ THROTTLE &nbsp;•&nbsp; ←→ STEER (BANKS) &nbsp;•&nbsp; MOUSE AIM &nbsp;•&nbsp; LMB FIRE &nbsp;•&nbsp; G AUTO-TARGET &nbsp;•&nbsp; TETHER &nbsp;•&nbsp; SHIFT BOOST/DASH</div>
          <div style="font-size:11px;letter-spacing:4px;opacity:0.5;">CLICK OR PRESS ANY KEY TO BEGIN</div>
        </div>
        <div id="cinematic-signal" style="position:absolute;bottom:26px;right:26px;padding:11px 16px;border:1px solid rgba(57,208,255,.45);border-left:3px solid #39d0ff;border-radius:6px;background:rgba(5,9,18,.72);box-shadow:0 0 22px rgba(57,208,255,.20);font-family:var(--mono,monospace);text-align:left;">
          <div style="font-size:10px;letter-spacing:.24em;color:#8fa3c0;margin-bottom:4px;">INBOUND SIGNAL</div>
          <div style="font-size:15px;letter-spacing:.16em;color:#39d0ff;">CONTRACT 47-A</div>
          <div style="font-size:10px;letter-spacing:.14em;color:#6b7d99;margin-top:5px;">REACH CORRIDOR — CHANNEL OPEN</div>
        </div>
      `;
      document.getElementById('ui-root').appendChild(cinematic);

      let dismissed = false;
      let autoDismissTimer = null;
      let fadeRemovalTimer = null;
      let inputFence = null;
      const finalizeCinematic = () => {
        if (dismissed) return;
        dismissed = true;
        this._cinematicActive = false;
        this._cinematicInputFence = null;
        cinematic.removeEventListener('click', requestPointerDismissal);
        if (autoDismissTimer) clearTimeout(autoDismissTimer);
        cinematic.style.transition = 'opacity .45s ease';
        cinematic.style.opacity = '0';
        fadeRemovalTimer = setTimeout(() => {
          if (cinematic.parentNode) cinematic.parentNode.removeChild(cinematic);
          if (this._cinematicTeardown === teardownCinematic) this._cinematicTeardown = null;
        }, 500);
        try { sessionStorage.setItem(CINEMATIC_SEEN_KEY, '1'); } catch (e) {}
        showMainMenuWhenReady();
      };
      const requestPointerDismissal = () => inputFence && inputFence.requestDismiss('pointer');
      const teardownCinematic = () => {
        const wasActive = !dismissed;
        dismissed = true;
        this._cinematicActive = false;
        if (inputFence) inputFence.teardown();
        cinematic.removeEventListener('click', requestPointerDismissal);
        if (autoDismissTimer) clearTimeout(autoDismissTimer);
        if (fadeRemovalTimer) clearTimeout(fadeRemovalTimer);
        if (cinematic.parentNode) cinematic.parentNode.removeChild(cinematic);
        if (wasActive) this._pendingMainMenu = false;
        this._cinematicInputFence = null;
        if (this._cinematicTeardown === teardownCinematic) this._cinematicTeardown = null;
        return wasActive;
      };
      inputFence = createCinematicInputFence({
        keyboardTarget: window,
        visibilityTarget: document,
        focusOwner: () => {
          if (!dismissed && cinematic.isConnected && document.activeElement !== cinematic) {
            try { cinematic.focus({ preventScroll: true }); } catch (_) { cinematic.focus(); }
          }
        },
        onFinalize: finalizeCinematic,
      });
      this._cinematicInputFence = inputFence;
      this._cinematicTeardown = teardownCinematic;
      cinematic.addEventListener('click', requestPointerDismissal);
      // Auto-dismiss safety after long time. A held keyboard chord defers this request until the
      // release fence is complete; blur/visibility loss cancels that incomplete gesture safely.
      autoDismissTimer = setTimeout(() => {
        if (cinematic.parentNode && inputFence) inputFence.requestDismiss('timer');
      }, 18000);
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
      const wrap = document.createElement('div');
      wrap.style.cssText = 'max-width:92vw;max-height:92vh;position:relative;';
      const vid = document.createElement('video');
      vid.src = videoPath;
      vid.autoplay = true;
      vid.controls = true;
      vid.playsInline = true;
      vid.style.cssText = 'max-width:100%;max-height:82vh;border:3px solid #39d0ff;box-shadow:0 0 40px #39d0ff;';
      const hint = document.createElement('div');
      hint.style.cssText = 'text-align:center;margin-top:8px;color:#d3e6ff;font-family:var(--mono);letter-spacing:2px;opacity:0.7;';
      hint.textContent = `${title} — click backdrop to close`;
      wrap.append(vid, hint);
      ov.appendChild(wrap);
      ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
      vid.addEventListener('ended', () => setTimeout(() => ov.remove(), 400));
      document.getElementById('ui-root').appendChild(ov);
    };
    window.playSpaceFaceCinematic = this.playCinematic; // handy for console or future buttons

    // navigation fallback events (screens may emit these if they can't reach the manager)
    this.bus.on('ui:pushScreen', (payload = {}) => {
      const id = payload && payload.id;
      if (!id) return;
      // Map authority: any localmap/starmap/galaxyMap push becomes galaxyMap + focus intent.
      if (isMapScreenId(id)) {
        openGalaxyMap({
          state: this.state,
          bus: this.bus,
          screenManager: this.screenManager,
        }, {
          screenId: id,
          focus: payload.focus,
          sectorId: payload.sectorId,
          missionId: payload.missionId,
          stationId: payload.stationId,
          pos: payload.pos,
          label: payload.label,
          source: payload.source || 'ui:pushScreen',
        });
        return;
      }
      this.screenManager.pushScreen(id);
    });
    this.bus.on('ui:popScreen', () => this.screenManager.popScreen());
    this.bus.on('ui:replaceScreen', ({ id }) => { if (id) this.screenManager.replaceScreen(id); });
    this.bus.on('ui:closeAll', () => this.screenManager.closeAll());
    this.bus.on('ui:cycleTarget', ({ dir } = {}) => cycleTarget(this.state, dir || 1, this.bus));
    this.bus.on('ui:targetNearestHostileToPlayer', ({ quiet } = {}) => targetNearestHostileToPlayer(this.state, this.bus, { quiet }));

    // Dock transition overlay
    const dockFade = document.createElement('div');
    dockFade.className = 'sf-dock-fade';
    dockFade.id = 'sf-dock-overlay';
    dockFade.hidden = true;
    dockFade.setAttribute('aria-hidden', 'true');
    const blackoutStatus = document.createElement('div');
    blackoutStatus.className = 'sr-only';
    blackoutStatus.setAttribute('role', 'status');
    blackoutStatus.setAttribute('aria-live', 'assertive');
    blackoutStatus.setAttribute('aria-atomic', 'true');
    blackoutStatus.tabIndex = -1;
    dockFade.appendChild(blackoutStatus);
    document.getElementById('ui-root').appendChild(dockFade);
    const dockFadeLeases = createFadeLeaseController(dockFade);
    const showDockFade = (reason = 'dock') => dockFadeLeases.acquire(reason);
    const hideDockFade = (reason = 'dock') => dockFadeLeases.release(reason);
    const boardingAnnouncement = {
      blackout: 'Fulfillment administrative boarding. Flight and interface controls are locked.',
      transit: 'Fulfillment administrative transit in progress.',
      wake_pending: 'Fulfillment routing complete. Restoring ship controls.',
      complete: 'Routing complete. Variance resolved. Ship controls restored.',
      cancelled: 'Fulfillment administrative transit cancelled. Ship controls restored.',
    };
    let blackoutPreviousFocus = null;
    const applyFulfillmentBlackout = ({ active, wasActive, phase }) => {
      if (active && !wasActive) {
        // Snapshot before body modal/HUD inert mutations can blur a focused HUD control.
        blackoutPreviousFocus = document.activeElement && document.activeElement !== document.body
          ? document.activeElement
          : null;
      }
      this._fulfillmentBlackoutActive = active;
      // Phase transitions can repeat after save rehydration; this lease is absolute/idempotent,
      // unlike dock/drill transitions, whose same-reason overlaps are reference-counted.
      dockFadeLeases.set('fulfillment', active);
      blackoutStatus.textContent = boardingAnnouncement[phase] || '';

      // Keep the normal modal/input and accessibility contracts authoritative while the simulation
      // and deterministic boarding FSM continue advancing underneath the presentation fence.
      const screenOpen = !!(this.screenManager && this.screenManager.isOpen && this.screenManager.isOpen());
      const externalOpen = active || isConfirmOpen()
        || !!(this.comms && this.comms.isModalOpen && this.comms.isModalOpen());
      syncModalChrome(screenOpen, externalOpen);
      const docked = !!(this.state.ui && this.state.ui.docked === true);
      if (this.screenManager && typeof this.screenManager.syncHudAccessibility === 'function') {
        this.screenManager.syncHudAccessibility(screenOpen || externalOpen || docked || this.state.mode !== 'flight');
      }

      if (active && !wasActive) {
        requestAnimationFrame(() => {
          if (!this._fulfillmentBlackoutActive || dockFade.hidden) return;
          try { blackoutStatus.focus({ preventScroll: true }); } catch (_) { blackoutStatus.focus(); }
        });
      } else if (!active && wasActive) {
        const restore = blackoutPreviousFocus;
        blackoutPreviousFocus = null;
        if (restore && restore.isConnected && !restore.inert && typeof restore.focus === 'function') {
          try { restore.focus({ preventScroll: true }); } catch (_) { restore.focus(); }
        }
      }
    };
    this._fulfillmentBlackoutActive = false;
    if (!this.state.ui) this.state.ui = {};
    this.state.ui.fulfillmentBlackoutActive = false;
    const boardingFence = createBoardingPhaseFence(this.state, this.bus, applyFulfillmentBlackout);
    let blackoutTornDown = false;
    const teardownFulfillmentBlackout = () => {
      if (blackoutTornDown) return;
      blackoutTornDown = true;
      boardingFence.destroy();
      dockFadeLeases.destroy();
      if (dockFade.parentNode) dockFade.parentNode.removeChild(dockFade);
      if (this._fulfillmentBlackoutTeardown === teardownFulfillmentBlackout) {
        this._fulfillmentBlackoutTeardown = null;
      }
    };
    this._fulfillmentBlackoutTeardown = teardownFulfillmentBlackout;
    // Re-init may happen between save:loaded and the next phase event. Rehydrate immediately from
    // the semantic incident so no render/input frame exposes controls during transit or wake-up.
    boardingFence.sync(this.state && this.state.factionPresence && this.state.factionPresence.boarding);

    this.bus.on('dock:docked', ({ stationId }) => {
      this.state.ui.docked = true;
      this.state.ui.dockedStationId = stationId || null;
      this.screenManager.syncVisibility();

      // Phase 1: fade to dark
      showDockFade('dock');

      // Dock fly-in: drive a scripted push-zoom via the camera controller instead of the old
      // hard-set on state.camera.zoom (which fought the dynamic-zoom damping and snapped). The
      // pushZoom widens the view ~25% over the fade so the approach reads as a committed fly-in,
      // then eases back on its own. A docking-permission comm beep precedes the clunk.
      this.bus.emit('audio:cue', { id: 'ui_confirm' });
      const camCtrl = this.state.render && this.state.render.cameraCtrl;
      if (camCtrl && typeof camCtrl.pushZoom === 'function') camCtrl.pushZoom(0.25, 0.9);

      setTimeout(() => {
        // Phase 2: at peak darkness, do the screen swap
        if (this.screenManager.top() !== 'station') this.screenManager.pushScreen('station');
        else this.screenManager.syncVisibility();

        // Phase 3: fade back in
        setTimeout(() => {
          hideDockFade('dock');
        }, 50); // brief hold at full dark before fading back
      }, 400); // matches the CSS transition duration
    });
    // Docked undock transition. Bare dock:undocked while docked is gated by installStationExitGate
    // (stationHub) into station:exitRequest; only committed undocks reach combat/save/this handler.
    this.bus.on('dock:undocked', (payload = {}) => {
      // Defense in depth: if a bare undock slips through before the gate is installed, re-route.
      if (this.state.ui && this.state.ui.docked === true && !(payload && payload.committed)) {
        this.bus.emit('station:exitRequest', {
          intent: payload.intent === 'explicit' ? 'explicit' : 'implicit',
          source: (payload && payload.source) || 'dock:undocked',
          opener: payload && payload.opener,
          held: !!(payload && payload.held),
        });
        return;
      }

      // Phase 1: fade to dark
      showDockFade('dock');

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
          hideDockFade('dock');
        }, 50);
      }, 400);
    });

    this.bus.on('ui:drillFadeStart', ({ asteroidId, attachmentId }) => {
      const player = this.state.entities.get(this.state.playerId);
      const ast = this.state.entities.get(asteroidId);
      if (!player || !ast) return;

      // Phase 1: Block input, halt ship velocity, and fade to dark
      this.state.input.blocked = true;
      player.vel.x = 0;
      player.vel.z = 0;
      showDockFade('drill');

      // Scripted close zoom-in push
      const camCtrl = this.state.render && this.state.render.cameraCtrl;
      if (camCtrl && typeof camCtrl.pushZoom === 'function') {
        camCtrl.pushZoom(-0.45, 1.2); // zoom in tight
      }

      this.bus.emit('audio:cue', { id: 'ui_confirm' });

      // Smoothly pull ship closer to the asteroid surface
      const startPos = { x: player.pos.x, z: player.pos.z };
      const dx = player.pos.x - ast.pos.x;
      const dz = player.pos.z - ast.pos.z;
      const angle = Math.atan2(dz, dx);
      const targetDist = ast.radius + (player.radius || 6) + 12;
      const targetPos = {
        x: ast.pos.x + Math.cos(angle) * targetDist,
        z: ast.pos.z + Math.sin(angle) * targetDist
      };

      // Set the massline rest length and winching parameter to targetDist, so that
      // the tether cable physically contracts as we slide and locks tightly in place.
      if (attachmentId) {
        const att = this.state.combat?.attachments?.byId?.[attachmentId];
        if (att) {
          att.restLength = targetDist;
          if (att.masslineRuntime) {
            att.masslineRuntime.restLength = targetDist;
            att.masslineRuntime.targetLength = targetDist;
            att.masslineRuntime.reelVelocity = 0;
          }
        }
      }

      const startTime = performance.now();
      const duration = 400; // ms
      const step = (now) => {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / duration);
        const ease = 1 - Math.pow(1 - t, 3);
        player.pos.x = startPos.x + (targetPos.x - startPos.x) * ease;
        player.pos.z = startPos.z + (targetPos.z - startPos.z) * ease;
        player.rot = angle + Math.PI; // face the rock

        if (t < 1) {
          requestAnimationFrame(step);
        }
      };
      requestAnimationFrame(step);

      setTimeout(() => {
        // Phase 2: Open drill minigame
        this.state.input.blocked = false;
        if (!this.state.ui) this.state.ui = {};
        this.state.ui.pendingDrillAsteroidId = asteroidId;
        this.screenManager.pushScreen('drill');

        setTimeout(() => {
          hideDockFade('drill');
        }, 50);
      }, 400);
    });

    // mode → boot screen: show Main Menu only if state.mode==='menu' (it's 'flight' now → just HUD).
    this.bus.on('game:started', () => {
      this.screenManager.closeAll();
      this.screenManager.syncVisibility();
      boardingFence.sync(this.state && this.state.factionPresence && this.state.factionPresence.boarding);
      refreshFlightUI();
    });
    // Ironman permadeath: combat.kill() emits game:over instead of respawning. Open the game-over
    // screen over the wreck. The screen loads via dynamic import (registerScreens path), so retry
    // briefly until the 'gameOver' screen is registered, then push it (idempotent — only push once).
    this.bus.on('game:over', () => {
      boardingFence.sync({ phase: 'cancelled' });
      if (this._gameOverShown) return;
      this._gameOverShown = true;
      const tryOpen = (attempts) => {
        if (this._registeredScreens && this._registeredScreens.has('gameOver')) {
          try { this.screenManager.pushScreen('gameOver'); } catch (e) { console.error('[ui] open gameOver', e); }
          return;
        }
        if (attempts > 60) { console.warn('[ui] gameOver screen never registered'); return; }
        setTimeout(() => tryOpen(attempts + 1), 50);
      };
      tryOpen(0);
    });
    // Reset the one-shot gate when a new game starts or a save loads (a loaded save is alive again).
    this.bus.on('game:over:dismissed', () => { this._gameOverShown = false; });
    this.bus.on('game:started', () => { this._gameOverShown = false; });
    this.bus.on('save:loaded', () => {
      // clear any stale modal restored from a save; HUD returns
      this.state.ui.docked = false;
      this.state.ui.dockedStationId = null;
      this.screenManager.closeAll();
      this.screenManager.syncVisibility();
      boardingFence.sync(this.state && this.state.factionPresence && this.state.factionPresence.boarding);
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
    for (const { path, load, name } of SCREEN_MODULES) {
      load()
        .then((mod) => {
          const def = mod && (mod[name] || mod.default);
          if (!def || !def.id) { console.warn(`[ui] screen "${name}" missing valid export`); return; }
          try { this.screenManager.register(def); }
          catch (err) { console.error(`[ui] register("${def.id}") failed:`, err); return; }
          // Station exit bus-gate must be live as soon as the hub module loads (before first dock).
          if (def.id === 'station' && typeof mod.installStationExitGate === 'function') {
            try { mod.installStationExitGate(this.ctx); } catch (e) { console.error('[ui] station exit gate', e); }
          }
          if (!this._registeredScreens) this._registeredScreens = new Set();
          this._registeredScreens.add(def.id);
          if (this.state.mode === 'menu' && this.screenManager.top && this.screenManager.top() === 'mainMenu') {
            try { this.screenManager.refreshTop(); } catch (e) { console.error(e); }
          }
          // If we are in menu mode and the title flow just became usable, show it. The title screen
          // waits for its primary New Game target so players never click a half-registered menu.
          if ((def.id === 'mainMenu' || def.id === 'newGame') &&
            this.state.mode === 'menu' && (this._pendingMainMenu || !this.screenManager.isOpen())) {
            try { if (this._showMainMenuWhenReady) this._showMainMenuWhenReady(); }
            catch (e) { console.error(e); }
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
      // Gamepad UI navigation / global button intents are processed every render frame so menus
      // work even when the sim is paused and input.update is not being stepped.
      if (this.input && this.input.tick) this.input.tick(dt);

      const st = state || this.state;
      const modalOpen = !!(this.screenManager && this.screenManager.isOpen && this.screenManager.isOpen());
      const externalModalOpen = !!this._fulfillmentBlackoutActive || isConfirmOpen()
        || !!(this.comms && this.comms.isModalOpen && this.comms.isModalOpen());
      const modalChromeOpen = syncModalChrome(modalOpen, externalModalOpen);
      const docked = !!(st && st.ui && st.ui.docked === true);
      if (this.screenManager && typeof this.screenManager.syncHudAccessibility === 'function') {
        this.screenManager.syncHudAccessibility(modalChromeOpen || docked || !st || st.mode !== 'flight');
      }
      const hudVisible = !!(st && st.mode === 'flight' && !modalChromeOpen && !docked);
      if (this._syncFlightCursor) this._syncFlightCursor(hudVisible);
      if (this.hud) {
        if (hudVisible) {
          if (!this._hudVisibleLast && this.hud.forceRefresh) this.hud.forceRefresh();
          this.hud.frame(dt);
        } else if (this.hud.tickHidden) {
          this.hud.tickHidden(dt);
        }
        this._hudVisibleLast = hudVisible;
      }
      if (this.bandHud && typeof this.bandHud.update === 'function') this.bandHud.update();
      if (this.encounterChoicePrompt && typeof this.encounterChoicePrompt.tick === 'function') {
        this.encounterChoicePrompt.tick();
      }
      if (this.toasts && this.toasts.tick) this.toasts.tick();
      // comms feed fade sweep + graffiti (narrative overlay; cheap, runs every frame)
      if (this.comms && this.comms.tick) this.comms.tick();
      // refresh the active modal screen at a low cadence (event-driven screens also self-update)
      this._rt = (this._rt || 0) + 1;
      if ((this._rt % 18) === 0 && this.screenManager && this.screenManager.isOpen()) {
        const def = this.screenManager.getActiveScreenDef && this.screenManager.getActiveScreenDef();
        if (def && def.refresh) def.refresh(this.ctx, { periodic: true });
      }
    } catch (err) {
      this._fe = (this._fe || 0) + 1;
      if (this._fe <= 10) console.error('[ui] frame error:', err);
    }
  },

  destroy() {
    // The rest of the UI is process-lifetime today, but the first-session cinematic has temporary
    // global capture listeners and timers. Re-init/destroy must remove them without marking the
    // cinematic seen or opening a menu behind the caller.
    this._titleFlowDisposed = true;
    if (this.input && typeof this.input.dispose === 'function') this.input.dispose();
    this.input = null;
    if (this.hud && typeof this.hud.destroy === 'function') this.hud.destroy();
    this.hud = null;
    if (this.bandHud && typeof this.bandHud.destroy === 'function') this.bandHud.destroy();
    this.bandHud = null;
    if (this.encounterChoicePrompt && typeof this.encounterChoicePrompt.destroy === 'function') {
      this.encounterChoicePrompt.destroy();
    }
    this.encounterChoicePrompt = null;
    if (typeof this._fulfillmentBlackoutTeardown === 'function') this._fulfillmentBlackoutTeardown();
    this._fulfillmentBlackoutTeardown = null;
    if (typeof this._cinematicTeardown === 'function') this._cinematicTeardown();
    this._cinematicTeardown = null;
    if (this.screenManager && typeof this.screenManager.destroy === 'function') this.screenManager.destroy();
    this.screenManager = null;
    this.manager = null;
    this._cinematicInputFence = null;
    this._cinematicActive = false;
    this._pendingMainMenu = false;
  },
};

function cycleTarget(state, dir, bus) {
  const player = state.entities.get(state.playerId);
  if (!player) return;
  const contacts = [];
  for (const e of state.entityList) {
    if (e.alive === false || e === player) continue;
    if (e.type !== 'ship' && e.type !== 'drone') continue;
    if (!isHostileToPlayer(e, player.team, state)) continue;
    const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > SCANNER_CONTACT_RANGE) continue;
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

function isScannerHostileLock(player, state, entity) {
  if (!player || !entity || entity.alive === false || !entity.pos) return false;
  if (entity.type !== 'ship' && entity.type !== 'drone') return false;
  if (!isHostileToPlayer(entity, player.team, state)) return false;
  const dx = entity.pos.x - player.pos.x;
  const dz = entity.pos.z - player.pos.z;
  return (dx * dx + dz * dz) <= SCANNER_CONTACT_RANGE * SCANNER_CONTACT_RANGE;
}

function targetNearestHostileToPlayer(state, bus, options = {}) {
  const player = state.entities.get(state.playerId);
  if (!player) return;
  const quiet = !!options.quiet;
  const curId = state.player && state.player.targetId;
  if (curId != null) {
    const cur = state.entities.get(curId);
    if (isScannerHostileLock(player, state, cur)) {
      if (quiet) return;
    }
  } else if (quiet) {
    // No lock yet — quiet refresh may acquire the nearest hostile.
  }
  let best = null;
  let bestD2 = Infinity;
  for (const e of state.entityList) {
    if (!e || e.alive === false || e === player || !e.pos) continue;
    if (e.type !== 'ship' && e.type !== 'drone') continue;
    if (!isHostileToPlayer(e, player.team, state)) continue;
    const dx = e.pos.x - player.pos.x;
    const dz = e.pos.z - player.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > SCANNER_CONTACT_RANGE * SCANNER_CONTACT_RANGE) continue;
    if (d2 < bestD2) {
      best = e;
      bestD2 = d2;
    }
  }
  if (!best) {
    state.player.targetId = null;
    if (bus && !quiet) bus.emit('toast', { text: 'No hostile in range', kind: 'info', ttl: 2 });
    return;
  }
  state.player.targetId = best.id;
  if (bus && !quiet) bus.emit('toast', { text: 'Target: ' + targetLabel(best), kind: 'info', ttl: 2 });
}

export { cycleTarget, targetNearestHostileToPlayer };

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
  #hud > .sf-cargo-panel { pointer-events: auto; }
  body.ui-modal-open #aim-reticle,
  body.ui-modal-open #pilot-portrait { display: none !important; }
  body.ui-modal-open #control-hints,
  body.ui-modal-open #alerts,
  body.ui-modal-open #toasts { opacity: 0 !important; pointer-events: none !important; }

  /* Reticle reflects aim mode: amber tint + slight pulse when auto-target is tracking hostiles,
     cyan when the pilot aims/fires manually (Phase 2). */
  #aim-reticle { transition: none; }
  #aim-reticle svg * { filter:none !important; }
  #aim-reticle.autofire { filter: hue-rotate(150deg) saturate(1.3) brightness(1.05);
  }
  #aim-reticle.autofire > svg { animation: sf-reticlepulse 1.4s ease-in-out infinite alternate; }
  @keyframes sf-reticlepulse { from { opacity:.88; } to { opacity:1; } }

  /* ===== bottom-left: ship schematic + thin micro-bars (Tactical Visor §3C) ===== */
  /* Container is now chromeless — no panel background, border, or blur. */
  /* Bottom-left anchor is ONE flex column (SPEC3-36 three-anchor law): a contextual sub-column
     (.sf-leftcontext — mission tracker + objectives + nav readout, relocated from the old top
     stragglers) sits ABOVE the schematic + vitals (.sf-bars). Compositor-cheap: no shadow/transition. */
  .sf-leftstack { position:absolute; left:22px; bottom:22px; display:flex; flex-direction:column;
    gap:12px; align-items:flex-start; max-width:340px; }
  .sf-leftcontext { display:flex; flex-direction:column; gap:8px; align-items:flex-start; max-width:300px; }
  .sf-leftcontext:empty { display:none; }   /* collapses when every contextual readout is hidden */
  .sf-bars { position:relative; display:flex; flex-direction:column;
    gap:10px; align-items:flex-start; }

  /* Top-down ship schematic: outline + shield ring + hull readout. */
  .sf-schematic { position:relative; width:96px; height:96px; }
  .sf-schematic svg { width:100%; height:100%; overflow:visible; }
  .sf-schematic .sf-sch-ship { fill:none; stroke:var(--visor-cyan); stroke-width:2;
    filter:drop-shadow(var(--visor-glow-cyan)); transition:stroke .25s ease, filter .25s ease; }
  .sf-schematic .sf-sch-shield { fill:none; stroke:var(--visor-cyan); stroke-width:2.5;
    stroke-linecap:round; opacity:.85; filter:drop-shadow(var(--visor-glow-cyan));
    transition:stroke-dashoffset .15s linear; }
  /* Hull-critical state: tint the whole schematic red and pulse. */
  .sf-schematic.sf-sch-critical .sf-sch-ship { stroke:var(--visor-red);
    filter:drop-shadow(var(--visor-glow-red)); animation:sf-schpulse 1s ease-in-out infinite alternate; }
  @keyframes sf-schpulse { from { opacity:.6; } to { opacity:1; } }
  .sf-sch-hull { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
    font-family:var(--mono); font-size:16px; font-weight:700; color:var(--text-primary);
    text-shadow:var(--text-shadow-hard); pointer-events:none; }
  .sf-schematic.sf-sch-critical .sf-sch-hull { color:var(--visor-red); }
  /* Damage flash: a quick white-hot pulse of the ship outline when the player is hit. */
  .sf-schematic.sf-sch-hit .sf-sch-ship { animation:sf-schhit .34s ease-out; }
  @keyframes sf-schhit {
    0% { stroke:#fff; filter:drop-shadow(0 0 12px #fff); }
    100% { stroke:var(--visor-cyan); filter:drop-shadow(var(--visor-glow-cyan)); } }

  /* Thin micro-bars (energy / heat / boost) — 2px glowing lines, no panel. */
  .sf-barrow { display:flex; align-items:center; gap:8px; }
  .sf-barrow__label { width:40px; font-family:var(--mono); font-size:9px; letter-spacing:.14em;
    color:var(--text-secondary); text-shadow:var(--text-shadow-hard); }
  .sf-barrow__num { width:38px; text-align:right; font-family:var(--mono); font-size:10px;
    color:var(--text-primary); text-shadow:var(--text-shadow-hard); }
  .sf-bar { position:relative; width:150px; height:2px; overflow:visible;
    background:rgba(255,255,255,.12); }
  .sf-bar--sm { height:2px; width:100%; }
  .sf-bar__fill { position:absolute; inset:0; transform-origin:left center; transform:scaleX(1);
    transition:transform .1s linear; }
  /* hull/shield modifiers are now consumed only by the target panel — keep them distinct
     (hull = red, shield = cyan) so a target's defensive state stays parseable. */
  .sf-bar--hull .sf-bar__fill { background:var(--visor-red); box-shadow:0 0 6px var(--visor-red); }
  .sf-bar--shield .sf-bar__fill { background:var(--visor-cyan); box-shadow:0 0 6px var(--visor-cyan); }
  .sf-bar--energy .sf-bar__fill { background:var(--visor-amber); box-shadow:0 0 6px var(--visor-amber); }
  .sf-bar--heat .sf-bar__fill { background:#ff8a3d; box-shadow:0 0 6px #ff8a3d; }
  .sf-bar--heat.sf-bar--overheated .sf-bar__fill { background:var(--visor-red); box-shadow:0 0 10px var(--visor-red); }
  .sf-barrow.sf-bar--venting .sf-bar--heat .sf-bar__fill,
  .sf-bar--heat.sf-bar--venting .sf-bar__fill { background:var(--visor-red); box-shadow:0 0 10px var(--visor-red); animation:sf-barpulse .4s ease-in-out infinite alternate; }
  .sf-bar--boost .sf-bar__fill { background:#c98cff; box-shadow:0 0 6px #c98cff; }
  .sf-bar--low .sf-bar__fill { animation:sf-barpulse 1s ease-in-out infinite alternate; }
  .sf-bar--ready .sf-bar__fill { animation:sf-barready 1.1s ease-in-out infinite alternate; }
  @keyframes sf-barpulse { from { box-shadow:0 0 4px var(--visor-red-dim); } to { box-shadow:0 0 10px 1px var(--visor-red); } }
  @keyframes sf-barready { from { box-shadow:0 0 4px rgba(201,140,255,.4); } to { box-shadow:0 0 10px 1px rgba(201,140,255,.9); } }

  /* ===== nav / target-lock readout — chromeless text, relocated into the bottom-left column (§3E) ===== */
   .sf-nav-readout { position:relative; text-align:left;
    pointer-events:none; contain:layout paint style;
    padding:2px 10px; background:rgba(4,10,18,.34); }
  .sf-nav-label { font-family:var(--mono); font-size:13px; letter-spacing:.16em; text-transform:uppercase;
    color:var(--visor-cyan); text-shadow:none; }
  /* The "[ TARGET LOCK: ... ]" / "[ NNN u ]" framing applies only to a live, in-range fix — the JS
     toggles .sf-nav--lock for that case; route/tutorial guidance renders plain (§3E). */
  .sf-nav--lock .sf-nav-label::before { content:'[ TARGET LOCK: '; color:var(--text-secondary); }
  .sf-nav--lock .sf-nav-label::after { content:' ]'; color:var(--text-secondary); }
  .sf-nav-meta { font-family:var(--mono); font-size:11px; letter-spacing:.1em; color:var(--text-secondary);
    margin-top:3px; text-shadow:none; }
  .sf-nav-meta .sf-nav-dist { color:var(--text-primary); }
  .sf-nav--lock .sf-nav-meta .sf-nav-dist::before { content:'[ '; color:var(--text-secondary); }
  .sf-nav--lock .sf-nav-meta .sf-nav-dist::after { content:' ]'; color:var(--text-secondary); }

  /* ===== bottom-left: fuel gauge styling ===== */
  .sf-bar--fuel .sf-bar__fill { background:var(--visor-cyan); box-shadow:0 0 6px var(--visor-cyan); }
  .sf-fuel--low .sf-bar--fuel .sf-bar__fill { animation:sf-barpulse 1s ease-in-out infinite alternate; }

  /* ===== bottom-center: action bar (key→ability map) + flight readouts (§3B) ===== */
  #action-bar { position:absolute; bottom:28px; left:50%; transform:translateX(-50%);
    display:flex; gap:16px; }
  .action-slot { display:flex; flex-direction:column; align-items:center; gap:6px; }
  .action-slot .bind { font-family:var(--mono); font-size:.66rem; letter-spacing:.08em;
    color:var(--text-secondary); text-shadow:var(--text-shadow-hard); }
  .icon-box { position:relative; width:44px; height:44px; border:1px solid var(--visor-cyan-dim);
    border-radius:4px; display:flex; justify-content:center; align-items:center;
    box-shadow:inset 0 0 10px rgba(0,240,255,.05); transition:box-shadow .12s ease, border-color .12s ease; }
  .icon-box svg { width:24px; height:24px; fill:none; stroke:var(--visor-cyan); stroke-width:1.8;
    stroke-linecap:round; stroke-linejoin:round; filter:drop-shadow(var(--visor-glow-cyan)); opacity:.9; }
  .icon-box.sf-act-active { border-color:var(--visor-cyan);
    box-shadow:inset 0 0 18px rgba(0,240,255,.5), 0 0 10px rgba(0,240,255,.35); }
  .icon-box.sf-act-active svg { opacity:1; }

  /* ===== bottom-center: flight readouts — chromeless thin-line row above the action bar (§3B) ===== */
  .sf-cluster { position:absolute; left:50%; bottom:92px; transform:translateX(-50%);
    display:flex; flex-wrap:wrap; justify-content:center; gap:6px 20px; align-items:baseline;
    max-width:min(880px, 92vw); }
  .sf-stat { display:flex; align-items:baseline; gap:5px; position:relative;
    font-family:var(--mono); }
  .sf-stat__k { font-size:9px; letter-spacing:.16em; color:var(--text-secondary);
    text-shadow:var(--text-shadow-hard); }
  .sf-stat__v { font-size:14px; color:var(--text-primary); text-shadow:var(--text-shadow-hard); }
  .sf-credits { color:var(--visor-cyan); text-shadow:var(--text-shadow-hard), var(--visor-glow-cyan); }
  .sf-stat__v.sf-warn { color:var(--visor-amber); text-shadow:var(--text-shadow-hard), var(--visor-glow-amber); }
  /* HUD 2.0 (GDD §9.4): SPD reads a size up — it's the one number flight always needs. */
  .sf-stat--speed .sf-stat__v { font-size:17px; letter-spacing:.02em; }
  /* Contextual chips: hidden at rest, surface on value change, fade out. Nothing glows at rest. */
  .sf-stat--chip { opacity:0; transform:translateY(5px); pointer-events:none;
    transition:opacity .28s var(--ease, ease), transform .28s var(--ease, ease); }
  .sf-stat--chip.sf-chip-show { opacity:1; transform:translateY(0); }
  /* Hover-affordance: these are readouts; underline the key to hint at the tooltip. */
  .sf-stat--info { cursor:default; user-select:none; }
  .sf-stat--info .sf-stat__k { border-bottom:1px dotted rgba(255,255,255,.25); padding-bottom:1px; }
  .sf-stat--info:hover .sf-stat__k { color:var(--visor-cyan); border-bottom-color:var(--visor-cyan-dim); }
  /* Hover tooltip for stat readouts — the one place a dark backing aids legibility of dense text. */
  .sf-tip { display:none; position:absolute; left:50%; bottom:calc(100% + 12px); transform:translateX(-50%);
    min-width:180px; max-width:260px; padding:8px 10px; background:rgba(4,10,18,.92);
    border:1px solid var(--visor-cyan); border-radius:6px; color:var(--text-primary);
    font-family:var(--mono); font-size:11px; letter-spacing:.02em; line-height:1.45;
    white-space:pre-line; pointer-events:none; z-index:200;
    box-shadow:0 4px 16px rgba(0,0,0,.5), 0 0 8px rgba(0,240,255,.2); }
  .sf-tip::after { content:''; position:absolute; left:50%; top:100%; transform:translateX(-50%);
    border:6px solid transparent; border-top-color:var(--visor-cyan); }
  .sf-stat--info:hover .sf-tip { display:block; }

  /* ===== bottom-right: tactical node map (radar) + target readout (§3D) ===== */
  /* Borderless: the radar reads as a raw projection. The canvas uses compact size in normal
     flight and switches to the larger tactical surface only while expanded. */
  .sf-rightdock { position:absolute; right:22px; bottom:22px; display:flex; flex-direction:column; align-items:flex-end; gap:8px;
    contain:layout paint style; }
  .sf-radar-wrap { display:flex; flex-direction:column; align-items:center; gap:6px; contain:layout paint style; }
  .sf-radar { position:relative; width:180px; height:180px; border-radius:50%; overflow:hidden; cursor:pointer;
    contain:layout paint style; }
  .sf-radar--expanded { width:340px !important; height:340px !important; }
  /* Canvas is centered so compact/expanded size changes stay anchored on the player marker. */
  .sf-radar canvas { display:block; position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); }
  .sf-radar-objective-key { width:220px; text-align:center; color:var(--visor-amber);
    font-family:var(--mono); font-size:9px; font-weight:700; letter-spacing:.1em;
    text-transform:uppercase; text-shadow:none; }
  /* HUD sub-panel surface — now chromeless. Legibility comes from hard text-shadow on the content. */
  .sf-hudpanel { background:none; border:none; box-shadow:none; }
  .sf-target { width:220px; display:flex; flex-direction:column; gap:5px; text-align:right; contain:layout paint style;
    background:rgba(4,10,18,.20); padding:2px 0; }
  .sf-target__head { display:flex; align-items:baseline; justify-content:flex-end; gap:8px; }
  .sf-target__name { font-family:var(--mono); font-size:12px; color:var(--text-primary); letter-spacing:.06em;
    text-transform:uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    text-shadow:none; }
  .sf-target__faction { font-family:var(--mono); font-size:10px; letter-spacing:.08em; text-shadow:none; }
  .sf-target__meta { display:flex; justify-content:flex-end; gap:14px; font-family:var(--mono); font-size:11px;
    color:var(--text-secondary); text-shadow:none; }
  .sf-target .sf-bar__fill { box-shadow:none; transition:none; }
  /* The target panel's mini hull/shield bars become thin lines flush right (3px for legibility). */
  .sf-target .sf-bar { width:100%; }
  .sf-target .sf-bar--sm { height:3px; }

  /* Damage triangle (BP-02): E/K/X effectiveness vs the target's current outer layer. Three tiny
     labeled bars; the best family highlights so "what should I be shooting" reads instantly. */
  .sf-target__triangle { display:flex; align-items:center; gap:7px; margin-top:5px; font-family:var(--mono); }
  .sf-target__tri-label { font-size:9px; letter-spacing:.08em; color:var(--text-secondary); opacity:.7; }
  .sf-target__tri-layer { font-size:9px; letter-spacing:.06em; color:var(--text-secondary); opacity:.6; margin-left:auto; }
  .sf-tri { display:flex; align-items:center; gap:3px; }
  .sf-tri__k { font-size:9px; color:var(--text-secondary); opacity:.75; width:8px; text-align:center; }
  .sf-tri__bar { display:inline-block; width:26px; height:3px; background:rgba(255,255,255,.12); overflow:hidden; }
  .sf-tri__fill { display:block; width:100%; height:100%; transform-origin:left center; transform:scaleX(0);
    background:var(--text-secondary); }
  .sf-tri.best .sf-tri__k { color:var(--good,#78f096); opacity:1; }
  .sf-tri.best .sf-tri__fill { background:var(--good,#78f096); box-shadow:0 0 4px rgba(120,240,150,.6); }
  /* Weak-point reveal line (BP-02) — appears after a scan pulse resolves the target's soft spot. */
  .sf-target__identity { margin-top:3px; font-size:10px; letter-spacing:.05em; color:var(--text-secondary);
    opacity:.88; text-transform:uppercase; }
  .sf-target__weak { margin-top:4px; font-size:10px; letter-spacing:.06em; color:#ffd24a;
    text-shadow:0 0 6px rgba(255,200,60,.5); }

  /* ===== objective tracker — chromeless lines, relocated into the bottom-left column (§3) ===== */
  .sf-objectives { position:relative; display:flex; flex-direction:column; gap:6px; align-items:flex-start; max-width:300px;
    contain:layout paint style; }
  .sf-obj { display:flex; align-items:center; gap:7px; font-family:var(--mono); font-size:12px;
    letter-spacing:.04em; color:var(--text-primary); text-shadow:none; background:rgba(4,10,18,.24); padding:2px 6px; }
  .sf-obj__dot { width:6px; height:6px; transform:rotate(45deg); background:var(--visor-cyan);
    box-shadow:none; flex:0 0 auto; }
  .sf-obj__t { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

  /* One spatial goal marker: an amber diamond on the world target, a directional chevron when it
     leaves the camera. The attached plate repeats the same GOAL identity as the tracker/radar and
     goes compact when the projected target passes behind a persistent HUD anchor. */
  .sf-objarrow { position:absolute; left:0; top:0; width:16px; height:16px; z-index:11;
    pointer-events:none; will-change:transform; filter:drop-shadow(0 0 5px rgba(255,179,92,.5)); }
  .sf-objarrow__glyph { position:absolute; left:50%; top:50%; display:block; }
  .sf-objarrow--onscreen .sf-objarrow__glyph { width:14px; height:14px;
    transform:translate(-50%,-50%) rotate(45deg); border:2px solid #fff;
    background:rgba(255,179,92,.26); box-shadow:0 0 0 2px var(--visor-amber); }
  .sf-objarrow--edge .sf-objarrow__glyph { width:0; height:0;
    transform:translate(-50%,-50%) rotate(var(--sf-arrow-angle, 0rad));
    border-style:solid; border-width:7px 0 7px 12px;
    border-color:transparent transparent transparent var(--visor-amber); }
  .sf-objarrow__label { position:absolute; max-width:280px; padding:4px 7px;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    background:rgba(5,9,18,.94); border-left:2px solid var(--visor-amber);
    color:var(--text-primary); font-size:9px; font-weight:700; letter-spacing:.08em;
    line-height:1.35; text-shadow:none; }
  .sf-objarrow[data-edge="left"] .sf-objarrow__label { left:20px; top:50%; transform:translateY(-50%); }
  .sf-objarrow[data-edge="right"] .sf-objarrow__label { right:20px; top:50%; transform:translateY(-50%); }
  .sf-objarrow[data-edge="top"] .sf-objarrow__label { left:50%; top:20px; transform:translateX(-50%); }
  .sf-objarrow[data-edge="bottom"] .sf-objarrow__label { left:50%; bottom:20px; transform:translateX(-50%); }
  .sf-objarrow--compact .sf-objarrow__label { display:none; }

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
  /* One-voice floor: the arbiter-surfaced attention line always sits atop the persistent status
     pills (dock/gate/lock/low-vitals) in the top-center slot, regardless of DOM insertion order. */
  .sf-alert--floor { order:-1; }
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
  .sf-lockring { display:none; position:absolute; left:50%; top:50%; width:72px; height:72px;
    transform:translate(-50%,-50%); pointer-events:none; z-index:14; opacity:0;
    transition:opacity .15s ease; filter:drop-shadow(0 0 6px var(--accent)); }
  .sf-lockring.active { display:block; opacity:1; }
  .sf-lockring.locked { filter:drop-shadow(0 0 10px var(--danger)); }
  .sf-lockring .sf-lockring__track { fill:none; stroke:var(--panel-edge); stroke-width:2.5; }
  .sf-lockring .sf-lockring__fill { fill:none; stroke:var(--accent); stroke-width:3;
    stroke-linecap:round; transition:stroke .15s ease; }
  .sf-lockring.locked .sf-lockring__fill { stroke:var(--danger); }
  .sf-lockring__label { position:absolute; left:50%; bottom:-2px; transform:translateX(-50%);
    font-family:var(--mono); font-size:9px; letter-spacing:.14em; color:var(--accent);
    text-transform:uppercase; white-space:nowrap; text-shadow:0 0 6px rgba(57,208,255,.6); }
  .sf-lockring.locked .sf-lockring__label { color:var(--danger); text-shadow:0 0 6px rgba(255,84,112,.6); }

  /* Weapon heat bars — chromeless, anchored above the schematic (left:22px matches .sf-bars) */
  .sf-wpn-heats { position:absolute; left:22px;
    display:flex; flex-direction:column; gap:4px; pointer-events:none; }
  .sf-wpn-heat { display:flex; align-items:center; gap:6px; }
  .sf-wpn-heat__label { font-family:var(--mono); font-size:9px; letter-spacing:.06em;
    color:var(--text-secondary); width:46px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    text-shadow:var(--text-shadow-hard); }
  .sf-wpn-heat__bar { position:relative; width:110px; height:2px;
    background:rgba(255,255,255,.12); overflow:visible; }
  .sf-wpn-heat__fill { position:absolute; inset:0; transform-origin:left center;
    background:#ff8a3d; box-shadow:0 0 6px #ff8a3d; transition:transform .08s linear; }
  .sf-wpn-heat.overheated .sf-wpn-heat__fill { background:var(--visor-red); box-shadow:0 0 8px var(--visor-red); }
  .sf-wpn-heat.overheated { animation:sf-wpnpulse .5s ease-in-out infinite alternate; }
  @keyframes sf-wpnpulse { from { opacity:.7; } to { opacity:1; } }
  /* Forced vent: every weapon bar goes hot-red and pulses while the 2 s lockout runs. */
  .sf-wpn-heats.venting .sf-wpn-heat__bar { box-shadow:0 0 8px var(--visor-red); }
  .sf-wpn-heats.venting .sf-wpn-heat__fill { background:var(--visor-red); box-shadow:0 0 10px var(--visor-red); }
  .sf-wpn-heats.venting .sf-wpn-heat__label { color:var(--visor-red); }
  .sf-wpn-heats.venting { animation:sf-wpnpulse .4s ease-in-out infinite alternate; }

  /* Target lock diamond — world-space overlay on locked/selected enemy.
     Outer div is the invisible positioning anchor (translate -50% centers on target).
     Inner div is the visible rotated diamond with pulsing glow. */
  .sf-lockdiamond { display:none; position:absolute; left:0; top:0; width:32px; height:32px; pointer-events:none; z-index:13;
    opacity:0; transition:opacity .12s ease; will-change:transform;
    --dia-glow:57,208,255; }
  .sf-lockdiamond.visible { display:block; opacity:1; }
  .sf-lockdiamond.locked-tgt { --dia-glow:255,84,112; }
  .sf-lockdiamond__inner { position:absolute; inset:2px;
    transform:rotate(45deg);
    border:2px solid rgba(var(--dia-glow),1);
    box-shadow:0 0 10px rgba(var(--dia-glow),.5), inset 0 0 8px rgba(var(--dia-glow),.15);
    animation:sf-diamondpulse 1s ease-in-out infinite alternate; }
  @keyframes sf-diamondpulse {
    from { box-shadow:0 0 6px rgba(var(--dia-glow),.3), inset 0 0 4px rgba(var(--dia-glow),.1); transform:rotate(45deg) scale(.92); }
    to { box-shadow:0 0 16px rgba(var(--dia-glow),.7), inset 0 0 10px rgba(var(--dia-glow),.2); transform:rotate(45deg) scale(1.04); } }

  /* Lead pip (BP-02 combat ceiling) — world-space marker showing where to aim so a shot fired NOW
     intercepts the moving target. A hollow reticle-ring the player walks their crosshair onto. Tints
     amber→green as the crosshair converges (solved via the SAME lead solver the guns use). */
  .sf-leadpip { display:none; position:absolute; left:0; top:0; width:22px; height:22px; pointer-events:none; z-index:13;
    opacity:0; transition:opacity .1s ease; will-change:transform;
    --pip-glow:255,196,84; }
  .sf-leadpip.visible { display:block; opacity:.92; }
  .sf-leadpip.on-solution { --pip-glow:120,240,150; }
  .sf-leadpip__ring { position:absolute; inset:0; border-radius:50%;
    border:1.5px solid rgba(var(--pip-glow),.95);
    box-shadow:0 0 7px rgba(var(--pip-glow),.5), inset 0 0 5px rgba(var(--pip-glow),.25); }
  .sf-leadpip__ring::before, .sf-leadpip__ring::after {
    content:''; position:absolute; background:rgba(var(--pip-glow),.9); }
  .sf-leadpip__ring::before { left:50%; top:-4px; width:1.5px; height:4px; transform:translateX(-50%); }
  .sf-leadpip__ring::after { top:50%; left:-4px; height:1.5px; width:4px; transform:translateY(-50%); }

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

    /* The action bar maps keyboard/mouse binds — meaningless on touch, where the touch system
       draws its own on-screen controls. Hide it (mirrors #control-hints above). */
    #action-bar { display:none !important; }

    .sf-fuel { left:10px; top:10px; }
    .sf-fuel-label { font-size:8px; }
    .sf-bar--fuel { width:64px; }
    .sf-fuel-num { width:28px; font-size:9px; }
    .sf-nav-readout { max-width:calc(100vw - 24px); }
    .sf-nav-label { max-width:calc(100vw - 32px); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:11px; }
    /* The full "[ TARGET LOCK: ... ]" prefix overflows a narrow pane — shorten to brackets here. */
    .sf-nav--lock .sf-nav-label::before { content:'[ '; }
    .sf-nav-meta { font-size:10px; }

    #sf-onboarding { left:12px !important; top:138px !important; width:min(316px, calc(100vw - 24px)) !important; }
    #sf-onboarding .sf-ob-card { padding:10px 11px; }
    #sf-onboarding .sf-ob-title { font-size:13px; }
    #sf-onboarding .sf-ob-hint { font-size:11px; line-height:1.4; }
    .sf-ob-intro { top:12% !important; width:min(520px, calc(100vw - 24px)) !important; padding:18px !important; }
    .sf-ob-intro h1 { font-size:20px; }
    .sf-ob-intro p { font-size:13px; }

    .sf-leftstack { left:8px; bottom:96px; max-width:calc(100vw - 16px); }
    .sf-bars { gap:7px; }
    .sf-schematic { width:64px; height:64px; }
    .sf-sch-hull { font-size:12px; }
    .sf-barrow { gap:5px; }
    .sf-barrow__label { width:34px; font-size:8px; }
    .sf-barrow__num { width:26px; font-size:9px; }
    .sf-bar { width:78px; }

    .sf-rightdock { right:8px; bottom:96px; gap:5px; }
    .sf-target { width:150px; }
    .sf-target__name { font-size:11px; }
    .sf-target__meta { font-size:10px; }
    .sf-radar-wrap { gap:4px; }
    .sf-radar { width:132px; height:132px; }
    .sf-radar canvas { width:132px !important; height:132px !important; }
    .sf-radar-objective-key { width:150px; font-size:8px; letter-spacing:.06em; line-height:1.25; }

    .sf-cluster { left:50%; right:auto; width:min(420px, calc(100vw - 16px)); bottom:8px;
      transform:translateX(-50%); display:flex; flex-wrap:wrap;
      justify-content:center; gap:4px 14px; }
    .sf-stat__k { font-size:8px; }
    .sf-stat__v { font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:46vw; }
    #sf-rolestat { display:none; }
    .sf-tip { display:none !important; }

    .sf-lockring { width:56px; height:56px; }
    .sf-wpn-heats { left:8px; }
    .sf-wpn-heat__bar { width:80px; }
    .sf-wpn-heat__label { width:34px; font-size:8px; }
    .sf-lockdiamond { width:24px; height:24px; }
  }

  /* ===== cargo panel overlay ===== */
  .sf-cargo-panel { position:absolute; left:50%; bottom:120px; transform:translateX(-50%);
    width:380px; max-height:60vh; display:none; flex-direction:column;
    background:rgba(4,10,18,.94); border:1px solid var(--visor-cyan); border-radius:8px;
    box-shadow:0 8px 32px rgba(0,0,0,.6), 0 0 12px rgba(0,240,255,.18);
    z-index:200; pointer-events:auto; font-family:var(--mono, Consolas, monospace); overflow:hidden; }
  .sf-cargo-panel.open { display:flex; }
  .sf-cargo-panel__head { display:flex; align-items:center; justify-content:space-between;
    padding:10px 14px; border-bottom:1px solid var(--panel-edge); }
  .sf-cargo-panel__title { font-size:13px; letter-spacing:.14em; color:var(--visor-cyan); text-transform:uppercase; }
  .sf-cargo-panel__close { background:none; border:1px solid var(--ink-mute); border-radius:4px;
    color:var(--ink-dim); font-size:11px; padding:2px 8px; cursor:pointer; font-family:var(--mono); }
  .sf-cargo-panel__close:hover { border-color:var(--visor-cyan); color:var(--visor-cyan); }
  .sf-cargo-panel__summary { display:flex; justify-content:space-between; padding:8px 14px;
    font-size:11px; color:var(--ink-dim); border-bottom:1px solid rgba(0,240,255,.1); }
  .sf-cargo-panel__list { overflow-y:auto; max-height:calc(60vh - 90px); padding:6px 0; }
  .sf-cargo-panel__list::-webkit-scrollbar { width:4px; }
  .sf-cargo-panel__list::-webkit-scrollbar-thumb { background:var(--visor-cyan); border-radius:2px; }
  .sf-cargo-row { display:grid; grid-template-columns:1fr 50px 50px 60px 56px; align-items:center;
    padding:5px 14px; font-size:11px; color:var(--ink); gap:4px; }
  .sf-cargo-row:hover { background:rgba(0,240,255,.06); }
  .sf-cargo-row__name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--ink); }
  .sf-cargo-row__qty { text-align:right; color:var(--accent-2); }
  .sf-cargo-row__vol { text-align:right; color:var(--ink-dim); }
  .sf-cargo-row__val { text-align:right; color:var(--ink-dim); }
  .sf-cargo-row__jet { background:none; border:1px solid var(--danger); border-radius:3px;
    color:var(--danger); font-size:9px; padding:1px 6px; cursor:pointer; font-family:var(--mono);
    letter-spacing:.06em; opacity:0.7; }
  .sf-cargo-row__jet:hover { opacity:1; background:rgba(255,84,112,.12); }
  .sf-cargo-row__jet:disabled { border-color:rgba(180,200,220,.35); color:var(--ink-mute);
    cursor:not-allowed; opacity:.75; background:rgba(180,200,220,.04); }
  .sf-cargo-row__jet:disabled:hover { background:rgba(180,200,220,.04); opacity:.75; }
  .sf-cargo-empty { padding:20px 14px; text-align:center; color:var(--ink-mute); font-size:12px; }
  @media (max-width: 760px) {
    .sf-cargo-panel { width:calc(100vw - 24px); bottom:110px; }
  }

  /* ===== HUD mission tracker — chromeless, with an edge marker; relocated into the bottom-left column ===== */
  .sf-mission-tracker { position:relative; width:320px; max-width:calc(100vw - 32px);
    padding:10px 12px; border-left:3px solid var(--visor-amber);
    background:rgba(5,9,18,.92); box-shadow:none; pointer-events:none; contain:layout paint style; }
  .sf-mt-title { font-family:var(--mono); font-size:10px; color:var(--visor-amber); letter-spacing:.18em;
    margin-bottom:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    text-shadow:none; }
  .sf-mt-obj { font-family:var(--mono); font-size:13px; line-height:1.35; color:var(--text-primary); margin-bottom:5px;
    text-shadow:none; }
  .sf-mt-time { font-family:var(--mono); font-size:10px; color:var(--visor-amber); letter-spacing:.1em;
    text-shadow:none; }
  .sf-mt-time.sf-mt-urgent { color:var(--visor-amber); text-shadow:none; }
  @media (max-width: 760px) {
    /* Sit below the fuel line + comms (≡) button + top-center SYS line so nothing overlaps. */
    .sf-mission-tracker { max-width:calc(100vw - 16px); }
    .sf-mt-title { font-size:10px; }
    .sf-mt-obj { font-size:9px; }
    .sf-mt-time { font-size:9px; }
  }

  /* ===== Flight HUD finish pass =====
     A small number of joined instruments replaces the previous field of unrelated floating cards.
     Cyan is now an active-state accent; neutral graphite and warm white do most of the work. */
  #hud {
    --hud-display:"Saira SemiCondensed", "Arial Narrow", sans-serif;
    --hud-body:"IBM Plex Sans", "Segoe UI", sans-serif;
    --hud-data:"IBM Plex Mono", Consolas, monospace;
    --hud-paper:#e7edf5;
    --hud-copy:#aebdce;
    --hud-muted:#9db0c6;
    --hud-line:rgba(151,183,205,.28);
    --hud-line-strong:rgba(154,205,221,.52);
    --hud-surface:rgba(9,15,24,.86);
    --hud-surface-soft:rgba(13,21,32,.72);
    --hud-cyan:#83ced8;
    --hud-amber:#d8a45d;
    --hud-danger:#ee6c75;
    --font-mono:var(--hud-data);
    /* Unified panel material: soft-shadow "instrument" surfaces (replaces the flat hairline look). */
    --hud-radius:8px;
    --hud-shadow:0 8px 24px rgba(0,0,0,.45);
    --hud-inset:inset 0 1px rgba(255,255,255,.08);
    --hud-glass:linear-gradient(180deg, rgba(16,23,34,.64), rgba(9,14,22,.76));
    --hud-solid:linear-gradient(180deg, rgba(16,23,34,.90), rgba(8,13,21,.94));
    font-family:var(--hud-body);
    color:var(--hud-paper);
  }

  .sf-leftstack {
    left:20px; bottom:20px; width:340px; max-width:calc(100vw - 40px); gap:9px;
    align-items:stretch;
  }
  .sf-leftcontext {
    width:100%; max-width:none; gap:6px; align-items:stretch;
  }
  .sf-bars {
    width:340px; max-width:100%; display:grid;
    grid-template-columns:118px minmax(0, 1fr); grid-template-rows:auto repeat(4, 20px);
    gap:5px 14px; align-items:center; padding:11px 13px 12px;
    background:var(--hud-glass);
    border:1px solid var(--hud-line); border-top-color:var(--hud-line-strong); border-radius:var(--hud-radius);
    box-shadow:var(--hud-shadow), var(--hud-inset) !important;
    backdrop-filter:blur(12px) saturate(1.3); overflow:hidden;
  }
  .sf-bars::after {
    content:''; position:absolute; left:13px; right:13px; top:35px; height:1px;
    background:linear-gradient(90deg, var(--hud-line-strong), rgba(151,183,205,.06));
  }
  .sf-condition-head {
    grid-column:1 / -1; min-height:19px; display:flex; align-items:center; justify-content:space-between;
    font-family:var(--hud-display); font-size:10px; font-weight:700; letter-spacing:.14em;
    color:var(--hud-copy);
  }
  .sf-condition-state {
    font-family:var(--hud-data); font-size:8px; font-weight:500; letter-spacing:.1em; color:var(--hud-cyan);
  }
  .sf-condition-critical .sf-condition-state { color:var(--hud-danger); }
  .sf-condition-shield-low .sf-condition-state { color:var(--hud-amber); }
  .sf-schematic {
    grid-column:1; grid-row:2 / span 4; width:112px; height:112px; align-self:center; justify-self:center;
    display:grid; place-items:center; isolation:isolate;
  }
  .sf-schematic .sf-sch-ring { position:absolute; inset:3px; width:106px; height:106px; overflow:visible; z-index:1; }
  .sf-schematic .sf-sch-track { fill:rgba(7,12,20,.22); stroke:rgba(137,170,192,.18); stroke-width:1.2; }
  .sf-schematic .sf-sch-shield {
    fill:none; stroke:var(--hud-cyan); stroke-width:2; stroke-linecap:butt; opacity:.9;
    filter:drop-shadow(0 0 4px rgba(131,206,216,.35)); transition:stroke-dashoffset .15s linear;
  }
  .sf-schematic .sf-sch-ship {
    width:80px; height:96px; object-fit:contain; z-index:2; opacity:1;
    filter:drop-shadow(0 5px 5px rgba(0,0,0,.65)) saturate(.86) brightness(1.2) contrast(1.05);
    transition:filter .22s ease, opacity .22s ease;
  }
  .sf-schematic.sf-sch-critical .sf-sch-ship {
    opacity:.76; filter:drop-shadow(0 0 7px rgba(238,108,117,.58)) saturate(.6) brightness(.96);
    animation:sf-schpulse 1s ease-in-out infinite alternate;
  }
  .sf-schematic.sf-sch-hit .sf-sch-ship { animation:sf-schhit .34s ease-out; }
  @keyframes sf-schhit {
    0% { filter:drop-shadow(0 0 11px rgba(255,255,255,.9)) brightness(1.65); }
    100% { filter:drop-shadow(0 5px 5px rgba(0,0,0,.65)) saturate(.86) brightness(1.2) contrast(1.05); }
  }
  .sf-sch-hull {
    left:7px; top:auto; bottom:5px; transform:none; z-index:3;
    display:flex; flex-direction:column; align-items:flex-start; gap:0;
    color:var(--hud-paper); text-shadow:0 1px 3px #000;
  }
  .sf-sch-hull strong { font-family:var(--hud-display); font-size:20px; line-height:1; font-weight:700; font-variant-numeric:tabular-nums; }
  .sf-sch-hull span, .sf-sch-shield-readout span {
    font-family:var(--hud-display); font-size:7px; font-weight:700; letter-spacing:.12em; color:var(--hud-muted);
  }
  .sf-sch-shield-readout {
    position:absolute; right:5px; top:6px; z-index:3; display:flex; flex-direction:column; align-items:flex-end;
    color:var(--hud-cyan); text-shadow:0 1px 3px #000;
  }
  .sf-sch-shield-readout strong { font-family:var(--hud-display); font-size:14px; font-weight:700; line-height:1.1; font-variant-numeric:tabular-nums; }
  .sf-schematic.sf-sch-critical .sf-sch-hull strong { color:var(--hud-danger); }
  .sf-barrow {
    grid-column:2; width:100%; display:grid; grid-template-columns:42px minmax(70px, 1fr) 34px;
    align-items:center; gap:8px; min-height:20px;
  }
  .sf-barrow__label {
    width:auto; font-family:var(--hud-display); font-size:9px; font-weight:600; letter-spacing:.09em;
    color:var(--hud-muted); text-shadow:none;
  }
  .sf-barrow__num {
    width:auto; font-family:var(--hud-data); font-size:9px; font-weight:500; color:var(--hud-copy);
    font-variant-numeric:tabular-nums; text-shadow:none;
  }
  .sf-bar { width:100%; height:4px; background:rgba(164,181,197,.14); border-radius:3px; overflow:hidden; }
  .sf-bars .sf-bar { overflow:visible; }  /* only ship-condition gauges let their glow escape */
  .sf-bar__fill { border-radius:3px; box-shadow:none; }
  .sf-bar--energy .sf-bar__fill { background:#7fd4e0; box-shadow:0 0 8px -2px #7fd4e0; }
  .sf-bar--boost .sf-bar__fill { background:#a08cf0; box-shadow:0 0 8px -2px #a08cf0; }
  .sf-bar--heat .sf-bar__fill { background:#ff8a4a; box-shadow:0 0 8px -2px #ff8a4a; }
  .sf-bar--fuel .sf-bar__fill { background:#4ecba8; box-shadow:0 0 8px -2px #4ecba8; }
  .sf-wpn-heats {
    position:relative; left:auto; bottom:auto !important; grid-column:1 / -1; width:100%;
    flex-direction:column; gap:4px; padding-top:7px; border-top:1px solid rgba(145,173,194,.14);
  }
  .sf-wpn-heat { display:grid; grid-template-columns:72px minmax(0, 1fr); gap:8px; align-items:center; }
  .sf-wpn-heat__label {
    width:auto; font-family:var(--hud-display); font-size:8px; font-weight:600; letter-spacing:.06em;
    color:var(--hud-muted); text-shadow:none;
  }
  .sf-wpn-heat__bar { width:100%; height:3px; background:rgba(164,181,197,.14); overflow:hidden; }
  .sf-wpn-heat__fill { box-shadow:none; background:#c99563; }

  .sf-command-deck {
    position:absolute; left:50%; bottom:18px; transform:translateX(-50%); width:min(620px, calc(100vw - 760px));
    min-width:520px; padding:8px 10px 9px;
    background:var(--hud-glass);
    border:1px solid var(--hud-line); border-top-color:var(--hud-line-strong); border-radius:var(--hud-radius);
    box-shadow:var(--hud-shadow), var(--hud-inset) !important;
    backdrop-filter:blur(12px) saturate(1.3);
  }
  .sf-command-deck::before {
    content:'FLIGHT CONTROL'; position:absolute; left:11px; top:-8px; padding:0 6px;
    background:rgba(8,14,22,.94); color:var(--hud-muted); font-family:var(--hud-display);
    font-size:8px; font-weight:700; letter-spacing:.15em;
  }
  #action-bar { position:relative; left:auto; bottom:auto; transform:none; display:grid; grid-template-columns:repeat(5, 1fr); gap:0; }
  .action-slot {
    position:relative; min-width:0; min-height:43px; display:grid; grid-template-columns:auto 1fr; align-items:center; gap:8px;
    padding:5px 11px; border-left:1px solid rgba(145,173,194,.18); color:var(--hud-copy);
    transition:background .12s ease, color .12s ease;
  }
  .action-slot:first-child { border-left:0; }
  .action-slot .bind {
    min-width:28px; font-family:var(--hud-data); font-size:8px; font-weight:500; letter-spacing:.04em;
    color:var(--hud-muted); text-shadow:none;
  }
  .action-command { display:flex; min-width:0; flex-direction:column; gap:1px; }
  .action-command strong {
    font-family:var(--hud-display); font-size:12px; line-height:1; font-weight:700; letter-spacing:.06em; color:var(--hud-paper);
  }
  .action-command small {
    font-family:var(--hud-display); font-size:7px; line-height:1.1; font-weight:600; letter-spacing:.12em; color:var(--hud-muted);
  }
  .action-slot.sf-act-active { background:linear-gradient(180deg, rgba(100,180,193,.15), rgba(100,180,193,.045)); }
  .action-slot.sf-act-active::after {
    content:''; position:absolute; left:8px; right:8px; bottom:0; height:2px; background:var(--hud-cyan);
    box-shadow:0 0 7px rgba(131,206,216,.5);
  }
  .action-slot.sf-act-active .bind, .action-slot.sf-act-active .action-command small { color:var(--hud-cyan); }
  .sf-cluster {
    position:relative; left:auto; bottom:auto; transform:none; max-width:none; min-height:24px;
    display:flex; flex-wrap:nowrap; justify-content:center; align-items:baseline; gap:18px;
    margin:0 7px 5px; padding:0 0 7px; border-bottom:1px solid rgba(145,173,194,.18);
  }
  .sf-stat { font-family:var(--hud-data); gap:5px; }
  .sf-stat__k { font-family:var(--hud-display); font-size:8px; font-weight:700; color:var(--hud-muted); letter-spacing:.1em; text-shadow:none; }
  .sf-stat__v { font-size:13px; color:var(--hud-paper); font-variant-numeric:tabular-nums; text-shadow:0 1px 2px rgba(0,0,0,.55); }
  .sf-stat--speed .sf-stat__v { font-family:var(--hud-display); font-size:20px; font-weight:700; }

  .sf-mission-tracker, .sf-nav-readout, .sf-obj {
    width:100%; max-width:none; border:1px solid var(--hud-line); border-radius:var(--hud-radius);
    background:var(--hud-solid); box-shadow:var(--hud-shadow) !important;
  }
  .sf-mission-tracker { padding:10px 12px 11px; border-top:2px solid rgba(216,164,93,.72); border-left:1px solid var(--hud-line); }
  .sf-mt-title {
    font-family:var(--hud-display) !important; font-size:9px; font-weight:700; letter-spacing:.12em;
    color:var(--hud-amber); margin-bottom:4px;
  }
  .sf-mt-obj { font-family:var(--hud-body) !important; font-size:13px; line-height:1.35; font-weight:500; color:var(--hud-paper); margin-bottom:5px; }
  .sf-mt-time { font-family:var(--hud-data) !important; font-size:9px; letter-spacing:.04em; color:#c4a77e; }
  .sf-nav-readout { padding:8px 11px; }
  .sf-nav-label { font-family:var(--hud-display); font-size:11px; font-weight:700; letter-spacing:.08em; color:var(--hud-cyan); }
  .sf-nav-meta { font-family:var(--hud-data); font-size:9px; letter-spacing:.035em; color:var(--hud-muted); }

  .sf-rightdock { right:20px; bottom:20px; width:270px; align-items:stretch; gap:6px; }
  .sf-rightdock > * { flex:0 0 auto; }
  .sf-overview {
    width:270px; gap:0; padding:5px 0;
    background:var(--hud-solid);
    border:1px solid var(--hud-line); border-top-color:var(--hud-line-strong); border-radius:var(--hud-radius);
    font-family:var(--hud-data); font-size:11px; box-shadow:var(--hud-shadow) !important; overflow:hidden;
  }
  .sf-overview::before {
    content:'LOCAL CONTACTS'; display:block; padding:3px 10px 7px; color:var(--hud-muted);
    font-family:var(--hud-display); font-size:10px; font-weight:700; letter-spacing:.12em;
    border-bottom:1px solid rgba(145,173,194,.16);
  }
  .sf-overview-row {
    min-height:34px; padding:6px 9px; background:transparent; border-left:0; border-bottom:1px solid rgba(145,173,194,.1);
  }
  .sf-overview-row:hover { background:rgba(131,206,216,.07); border-left:0; }
  .sf-overview-row.selected {
    background:linear-gradient(90deg, rgba(131,206,216,.16), rgba(131,206,216,.025));
    border-left:0; box-shadow:inset 2px 0 var(--hud-cyan);
  }
  .sf-overview-row__name { max-width:112px; color:var(--hud-paper); }
  .sf-overview-row__right { color:var(--hud-muted); }
  .sf-overview-row__detail { color:var(--hud-muted); padding-left:18px; }
  .sf-overview-footer { background:transparent; color:var(--hud-muted); }
  .sf-target {
    width:270px; padding:9px 11px 10px; text-align:left; gap:6px;
    background:var(--hud-solid);
    border:1px solid var(--hud-line); border-top:2px solid rgba(238,108,117,.65); border-radius:var(--hud-radius);
    box-shadow:var(--hud-shadow) !important;
  }
  .sf-target__head, .sf-target__meta { justify-content:space-between; }
  .sf-target__name { font-family:var(--hud-display); font-size:13px; font-weight:700; letter-spacing:.045em; color:var(--hud-paper); }
  .sf-target__faction, .sf-target__meta, .sf-target__identity, .sf-target__intent { font-family:var(--hud-data); }
  .sf-target__meta { font-size:9px; color:var(--hud-muted); }
  .sf-target .sf-bar--sm, .sf-target .sf-bar { height:4px; background:rgba(164,181,197,.14); }
  .sf-radar-wrap { align-items:flex-end; }
  .sf-radar { border:1px solid rgba(137,170,192,.24); box-shadow:0 12px 28px rgba(0,0,0,.24); }
  .sf-radar-objective-key { width:220px; color:var(--hud-amber); font-family:var(--hud-display); font-weight:700; }

  .sf-toast {
    width:320px; padding:10px 13px; border:1px solid rgba(147,174,195,.3); border-top-color:rgba(147,196,211,.56);
    border-left-width:1px; border-radius:2px;
    background:linear-gradient(112deg, rgba(18,27,39,.95), rgba(8,13,21,.92));
    color:var(--hud-paper); font-family:var(--hud-body); font-size:13px; line-height:1.35;
    box-shadow:0 15px 32px rgba(0,0,0,.34); backdrop-filter:blur(7px);
  }
  .sf-toast__icon { font-family:var(--hud-data); color:var(--hud-cyan); }
  .sf-toast--success, .sf-toast--good, .sf-toast--error, .sf-toast--danger, .sf-toast--warn { border-left-width:1px; }
  .sf-alert {
    min-width:220px; justify-content:center; padding:7px 18px; border-radius:2px;
    font-family:var(--hud-display); font-size:11px; font-weight:700; letter-spacing:.1em;
    background:linear-gradient(90deg, rgba(9,15,24,.68), rgba(18,27,39,.92), rgba(9,15,24,.68));
    border:1px solid rgba(147,174,195,.28); border-top-color:rgba(147,196,211,.5);
    box-shadow:0 10px 26px rgba(0,0,0,.28);
  }
  .sf-alert--dock { font-size:14px; padding:9px 24px; border-radius:2px; }

  @media (max-width:1180px) {
    .sf-command-deck { width:min(500px, calc(100vw - 660px)); min-width:420px; }
    .action-slot { padding-inline:7px; gap:5px; }
    .action-command small { display:none; }
  }
  @media (max-width:900px), (max-height:650px) {
    .sf-leftstack { left:10px; bottom:88px; width:290px; }
    .sf-bars { width:290px; grid-template-columns:94px minmax(0, 1fr); padding:9px 10px 10px; }
    .sf-schematic { width:88px; height:88px; }
    .sf-schematic .sf-sch-ring { inset:0; width:88px; height:88px; }
    .sf-schematic .sf-sch-ship { width:55px; height:68px; }
    .sf-sch-hull { left:2px; bottom:1px; }
    .sf-sch-shield-readout { right:1px; top:2px; }
    .sf-rightdock { right:10px; bottom:88px; width:210px; }
    .sf-overview, .sf-target { width:210px; }
    .sf-overview-row__name { max-width:70px; }
    .sf-command-deck { bottom:8px; width:min(500px, calc(100vw - 24px)); min-width:0; }
    .sf-cluster { position:relative; left:auto; bottom:auto; width:auto; transform:none; }
  }
  @media (max-width:760px) {
    .sf-command-deck { padding:7px 9px; }
    .sf-command-deck::before { display:none; }
    .sf-cluster { margin:0; padding:0; border-bottom:0; }
    .sf-mission-tracker { max-width:none; }
  }
  @media (prefers-reduced-motion:reduce) {
    .sf-schematic.sf-sch-critical .sf-sch-ship, .sf-schematic.sf-sch-hit .sf-sch-ship { animation:none; }
  }

  /* ===== dock transition overlay ===== */
  .sf-dock-fade { position:fixed; inset:0; z-index:2500; pointer-events:none;
    background:radial-gradient(ellipse at 50% 60%, rgba(5,7,13,0) 0%, rgba(5,7,13,1) 70%);
    opacity:0; transition:opacity 0.4s ease-in-out; }
  .sf-dock-fade[hidden] { display:none!important; }
  .sf-dock-fade.active { opacity:1; }
  #sf-dock-overlay.sf-administrative-blackout { background:#05070d; }
  `;
  document.head.appendChild(s);
}

function syncModalChrome(screenOpen, externalModalOpen = false) {
  const modalOpen = !!(screenOpen || externalModalOpen);
  if (_lastModalOpen !== modalOpen || document.body.classList.contains('ui-modal-open') !== modalOpen) {
    document.body.classList.toggle('ui-modal-open', modalOpen);
    _lastModalOpen = modalOpen;
  }

  if (!_modalBackdropEl || !_modalBackdropEl.isConnected) _modalBackdropEl = document.getElementById('modal-backdrop');
  const backdrop = _modalBackdropEl;
  if (backdrop) {
    // Only screen-manager modals use the shared backdrop for interaction. Confirm/endgame mount
    // their own higher-z overlays; a stale body class must not leave an invisible click shield.
    const pointerEvents = screenOpen ? 'auto' : 'none';
    if (_lastBackdropPointerEvents !== pointerEvents || backdrop.style.pointerEvents !== pointerEvents) {
      backdrop.style.pointerEvents = pointerEvents;
      _lastBackdropPointerEvents = pointerEvents;
    }
  }
  return modalOpen;
}

let _lastModalOpen = null;
let _lastBackdropPointerEvents = null;
let _modalBackdropEl = null;
