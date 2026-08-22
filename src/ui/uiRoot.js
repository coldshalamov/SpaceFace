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
import { createEntityLinks } from './entityLinks.js';
import { createUiInput } from './input.js';
import { initPriceHistory } from './priceHistory.js';
import { isConfirmOpen } from './confirm.js';
import { setPromptScheme } from './controlPrompts.js';
import { bracketCss, INK_SHADOW } from './hudBrackets.js';
import { isHostileToPlayer, SCANNER_CONTACT_RANGE } from '../systems/scanner.js';
import { presentationAllowsPlayerFacingAction } from '../core/presentationAdmission.js';
import { verbAcceptsType, stableEntityKey } from '../data/interactionDescriptorCatalog.js';
import { listSelectableComponents, nextComponentSelection } from '../systems/interactionDescriptors.js';
import { createCinematicInputFence } from './cinematicInputFence.js';
import { isMapScreenId, openGalaxyMap } from './mapAuthority.js';
import { IS_DEV } from '../core/devMode.js';
import { installSandboxGameStartedHook } from './sandbox/sandboxSetup.js';

// Clean inline UI art (replaces the captioned reference-sheet .jpg assets that rendered text).
const RETICLE_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;overflow:visible">
  <g class="sf-reticle-shape sf-reticle-shape--open" fill="none" stroke="#39d0ff" stroke-width="2" stroke-linecap="round" style="filter:drop-shadow(0 0 3px #39d0ff)">
    <circle cx="50" cy="50" r="30" opacity="0.85"/>
    <circle cx="50" cy="50" r="40" opacity="0.18"/>
    <line x1="50" y1="6" x2="50" y2="20"/><line x1="50" y1="80" x2="50" y2="94"/>
    <line x1="6" y1="50" x2="20" y2="50"/><line x1="80" y1="50" x2="94" y2="50"/>
  </g>
  <g class="sf-reticle-shape sf-reticle-shape--bracket" fill="none" stroke="#39d0ff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 3px #39d0ff)">
    <line x1="50" y1="34" x2="50" y2="42"/><line x1="50" y1="58" x2="50" y2="66"/>
    <line x1="34" y1="50" x2="42" y2="50"/><line x1="58" y1="50" x2="66" y2="50"/>
    <path d="M26 34h12V22"/><path d="M74 34H62V22"/>
    <path d="M26 66h12v12"/><path d="M74 66H62v12"/>
  </g>
  <circle cx="50" cy="50" r="3" fill="#39d0ff" style="filter:drop-shadow(0 0 4px #39d0ff)"/>
</svg>`;
// (Removed PILOT_AVATAR_SVG — the helmet/visor pilot circle violated the standing no-visor/no-
//  cockpit HUD rule (00_MASTER_TASTE §3). The splash now uses a clean non-diegetic signal slate.)
import { createHud } from './hud.js';
import { createBandHud } from './bandHud.js';
import { createEncounterChoicePrompt } from './encounterChoicePrompt.js';
import { createLawfulInspectionPrompt } from './lawfulInspectionPrompt.js';
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
  // THE SHIP (frontend program §11.3 / SCREENS_B): the promoted shipworks stage, one shared
  // instance with the dock's shipworks destination (§0.5 — one WebGL mount, two hosts).
  { path: './ship/shipScreen.js', load: () => import('./ship/shipScreen.js'), name: 'shipScreen' },
  { path: './screens/range.js', load: () => import('./screens/range.js'), name: 'rangeScreen' },
  // THE FOOTPRINT (frontend program §11.12 J10 / SCREENS_C §2): the board you trace (F3).
  { path: './screens/footprint.js', load: () => import('./screens/footprint.js'), name: 'footprintScreen' },
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
  // CRUCIBLE (PQ-133 §12): the Survival door, its seeded rearm draft, and the ten-wave refit.
  // Both draft surfaces live in one module, so two entries load the same chunk by export name.
  { path: './screens/crucibleDraft.js', load: () => import('./screens/crucibleDraft.js'), name: 'crucibleDraftScreen' },
  { path: './screens/crucibleDraft.js', load: () => import('./screens/crucibleDraft.js'), name: 'crucibleRefitScreen' },
  { path: './screens/settings.js', load: () => import('./screens/settings.js'), name: 'settingsScreen' },
  { path: './screens/saveLoad.js', load: () => import('./screens/saveLoad.js'), name: 'saveLoadScreen' },
  { path: './screens/help.js', load: () => import('./screens/help.js'), name: 'helpScreen' },
  { path: './screens/codex.js', load: () => import('./screens/codex.js'), name: 'codexScreen' },
  { path: './screens/missionLog.js', load: () => import('./screens/missionLog.js'), name: 'missionLogScreen' },
  // DEV ONLY — Sandbox testing harness (src/ui/screens/sandbox.js). Conditionally spread so the
  // dynamic import and the module never enter build/web when IS_DEV folds false at build time.
  ...(IS_DEV ? [{ path: './screens/sandbox.js', load: () => import('./screens/sandbox.js'), name: 'sandboxScreen' }] : []),
];

const HUD_STYLE_ID = 'sf-hud-style';

export function beginScreenRegistrationCycle(owner, screenManager) {
  const generation = (Number(owner && owner._screenRegistrationGeneration) || 0) + 1;
  if (owner) {
    owner._screenRegistrationGeneration = generation;
    owner._screenRegistrationSettledGeneration = null;
  }
  return { owner, screenManager, generation };
}

export function invalidateScreenRegistrationCycle(owner) {
  if (!owner) return 0;
  const generation = (Number(owner._screenRegistrationGeneration) || 0) + 1;
  owner._screenRegistrationGeneration = generation;
  return generation;
}

export function isScreenRegistrationCycleCurrent(cycle) {
  return !!(cycle
    && cycle.owner
    && cycle.screenManager
    && cycle.owner._screenRegistrationGeneration === cycle.generation
    && cycle.owner.screenManager === cycle.screenManager);
}

export function isScreenRegistrationCycleSettled(owner) {
  return !!(owner
    && Number.isFinite(owner._screenRegistrationGeneration)
    && owner._screenRegistrationSettledGeneration === owner._screenRegistrationGeneration);
}

export function destroyMarketNewsOwner(owner) {
  if (!owner) return;
  const current = owner.marketNews;
  owner.marketNews = null;
  if (current && typeof current.destroy === 'function') current.destroy();
}

export function replaceMarketNewsOwner(owner, ctx) {
  if (!owner) return null;
  destroyMarketNewsOwner(owner);
  const next = createMarketNews(ctx);
  owner.marketNews = next;
  return next;
}

export function destroyCommsOwner(owner) {
  if (!owner) return;
  const current = owner.comms;
  owner.comms = null;
  if (current && typeof current.destroy === 'function') current.destroy();
}

export function replaceCommsOwner(owner, ctx, factory = createComms) {
  if (!owner) return null;
  destroyCommsOwner(owner);
  const next = factory(ctx);
  owner.comms = next;
  return next;
}

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
    invalidateScreenRegistrationCycle(this);
    this._screenRegistrationCycle = null;
    if (this.hud && typeof this.hud.destroy === 'function') this.hud.destroy();
    this.hud = null;
    if (this.bandHud && typeof this.bandHud.destroy === 'function') this.bandHud.destroy();
    this.bandHud = null;
    if (this.encounterChoicePrompt && typeof this.encounterChoicePrompt.destroy === 'function') {
      this.encounterChoicePrompt.destroy();
    }
    this.encounterChoicePrompt = null;
    if (this.lawfulInspectionPrompt && typeof this.lawfulInspectionPrompt.destroy === 'function') {
      this.lawfulInspectionPrompt.destroy();
    }
    this.lawfulInspectionPrompt = null;
    destroyCommsOwner(this);
    if (this.input && typeof this.input.dispose === 'function') this.input.dispose();
    this.input = null;
    if (typeof this._fulfillmentBlackoutTeardown === 'function') this._fulfillmentBlackoutTeardown();
    this._fulfillmentBlackoutTeardown = null;
    if (typeof this._cinematicTeardown === 'function') this._cinematicTeardown();
    this._cinematicTeardown = null;
    if (this.entityLinks && typeof this.entityLinks.destroy === 'function') this.entityLinks.destroy();
    this.entityLinks = null;
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
    replaceMarketNewsOwner(this, ctx); // REVAMP 2.1 — economy headlines/ticker (read-only)
    this.alerts = createAlerts(ctx);
    wireSaveFeedback(this.bus);
    this.bus.on('save:store-synced', () => {
      if (this.screenManager && typeof this.screenManager.refreshTop === 'function') {
        try { this.screenManager.refreshTop(); } catch (e) { console.error(e); }
      }
    });

    // screen manager — expose on ctx + on this system so screens can reach it (§ screens
    // resolve ctx.screenManager / registry.get('ui').screenManager / .manager).
    this.screenManager = createScreenManager(ctx);
    this.manager = this.screenManager;
    ctx.screenManager = this.screenManager;
    ctx.screens = this.screenManager;
    this._screenRegistrationCycle = beginScreenRegistrationCycle(this, this.screenManager);

    // J5 "everything is a link": ONE delegated handler on #screens turns every [data-entity] into a
    // door onto that entity's dossier. Mounted after the screen manager because it reads which
    // screen owns the stack, and because its listener must sit on the same node as the manager's
    // pointer shield — a document-level delegate never fires (that shield stopPropagations).
    if (this.entityLinks && typeof this.entityLinks.destroy === 'function') this.entityLinks.destroy();
    this.entityLinks = createEntityLinks(ctx);
    ctx.entityLinks = this.entityLinks;

    // Grammar §9.10: sound on every state change — one delegated pointerover on #screens,
    // rate-limited ~40ms, makes every surface feel responsive without per-widget listeners.
    // Previously only gamepad focus emitted hover.
    if (typeof this._hoverAudioTeardown === 'function') this._hoverAudioTeardown();
    this._hoverAudioTeardown = null;
    {
      const screensHost = document.getElementById('screens');
      if (screensHost) {
        let lastHoverAt = 0;
        const onHoverOver = (ev) => {
          const target = ev.target;
          if (!target || !target.closest || !target.closest('button, [role="option"], [role="tab"], [data-spatial-slot]')) return;
          const now = performance.now();
          if (now - lastHoverAt < 40) return;
          lastHoverAt = now;
          ctx.bus.emit('audio:cue', { id: 'ui_hover' });
        };
        screensHost.addEventListener('pointerover', onHoverOver);
        this._hoverAudioTeardown = () => screensHost.removeEventListener('pointerover', onHoverOver);
      }
    }

    // DEV: arm the sandbox game:started hook (no-op unless a sandbox launch is pending). Resolved via
    // a thunk because ctx continues to be enriched after init(); the hook reads ctx at fire time.
    if (IS_DEV) {
      installSandboxGameStartedHook(this.bus, () => this.ctx);
    }

    // Register the administrative-blackout capture fence before any interactive comms/HUD module.
    // Document capture listeners on the same target run in registration order, so constructing the
    // input router after a prompt would let that earlier prompt act before the fence could stop it.
    this.input = createUiInput(ctx, this.screenManager);

    // comms / graffiti / endgame narrative overlay (story system drives it via events)
    replaceCommsOwner(this, ctx);
    this.encounterChoicePrompt = createEncounterChoicePrompt(ctx);
    this.lawfulInspectionPrompt = createLawfulInspectionPrompt(ctx);

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
    reticle.dataset.mode = 'manual';
    reticle.innerHTML = RETICLE_SVG;
    const hudRoot = document.getElementById('hud');
    hudRoot.appendChild(reticle);
    const autoTargetFlightPath = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    autoTargetFlightPath.id = 'auto-target-flight-path';
    autoTargetFlightPath.setAttribute('aria-hidden', 'true');
    autoTargetFlightPath.innerHTML = '<polyline class="sf-flight-path__route" points=""></polyline><circle class="sf-flight-path__endpoint-ring" r="11"></circle><circle class="sf-flight-path__endpoint" r="3.5"></circle>';
    hudRoot.appendChild(autoTargetFlightPath);
    const autoTargetRouteLine = autoTargetFlightPath.querySelector('.sf-flight-path__route');
    const autoTargetEndpointRing = autoTargetFlightPath.querySelector('.sf-flight-path__endpoint-ring');
    const autoTargetEndpoint = autoTargetFlightPath.querySelector('.sf-flight-path__endpoint');
    let lastReticleX = NaN;
    let lastReticleY = NaN;
    let lastFlightPathPoints = '';
    let lastReticleDisplay = null;
    let lastReticleMode = null;
    let lastFlightPathDisplay = null;
    let lastFlightPathOpacity = null;
    let lastEndpointCx = null;
    let lastEndpointCy = null;
    let lastFlightPathDrawing = null;

    // Bind-sheet copy lives in Help / Settings. The flight windshield no longer mounts a key laundry.
    setPromptScheme(this.state && this.state.settings && this.state.settings.gameplay
      && this.state.settings.gameplay.controlScheme);
    this.bus.on('settings:changed', () => {
      setPromptScheme(this.state && this.state.settings && this.state.settings.gameplay
        && this.state.settings.gameplay.controlScheme);
    });

    const syncFlightCursor = (visible, reticleAlive = visible) => {
      const st = this.state;
      const pointer = st && st.input && st.input.pointerScreen;
      const active = !!(visible && pointer && pointer.active);
      const autoTarget = !!(visible && st && st.input && st.input.autoFire);
      const flightPath = st && st.input && st.input.autoTargetPath;
      const pathActive = !!(autoTarget && flightPath && flightPath.active
        && Array.isArray(flightPath.points) && flightPath.points.length >= 2);
      document.body.classList.toggle('sf-flight-cursor', active);
      const reticleEl = document.getElementById('aim-reticle') || reticle;
      // reticleAlive keeps the aim marker readable under live (non-pausing) overlays while the
      // cursor-hiding flight mode stays off (FRONTEND_DIRECTION §3.5: reticle + alerts survive).
      const nextReticleDisplay = reticleAlive ? 'block' : 'none';
      if (lastReticleDisplay !== nextReticleDisplay) {
        lastReticleDisplay = nextReticleDisplay;
        reticleEl.style.display = nextReticleDisplay;
      }
      const nextReticleMode = autoTarget ? 'auto' : 'manual';
      if (lastReticleMode !== nextReticleMode) {
        lastReticleMode = nextReticleMode;
        reticleEl.dataset.mode = nextReticleMode;
      }
      const nextFlightPathDisplay = autoTarget ? 'block' : 'none';
      if (lastFlightPathDisplay !== nextFlightPathDisplay) {
        lastFlightPathDisplay = nextFlightPathDisplay;
        autoTargetFlightPath.style.display = nextFlightPathDisplay;
      }
      const nextFlightPathOpacity = pathActive ? '1' : '0';
      if (lastFlightPathOpacity !== nextFlightPathOpacity) {
        lastFlightPathOpacity = nextFlightPathOpacity;
        autoTargetFlightPath.style.opacity = nextFlightPathOpacity;
      }
      if (!visible) return;
      const fallbackX = typeof innerWidth === 'number' ? innerWidth * 0.5 : 0;
      const fallbackY = typeof innerHeight === 'number' ? innerHeight * 0.5 : 0;
      const x = active && Number.isFinite(pointer.x) ? pointer.x : fallbackX;
      const y = active && Number.isFinite(pointer.y) ? pointer.y : fallbackY;
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
      if (autoTarget) {
        if (!pathActive || !this.helpers || typeof this.helpers.worldToScreen !== 'function') return;
        const projectedPoints = [];
        const player = st.entities && st.entities.get ? st.entities.get(st.playerId) : null;
        if (player && player.pos) projectedPoints.push(player.pos);
        const startIndex = Math.max(1, Number.isFinite(flightPath.pointIndex)
          ? Math.floor(flightPath.pointIndex)
          : 1);
        for (let i = startIndex; i < flightPath.points.length; i++) {
          projectedPoints.push(flightPath.points[i]);
        }
        const screenPoints = [];
        for (const point of projectedPoints) {
          const projected = this.helpers.worldToScreen({ x: point.x, y: 0, z: point.z });
          if (projected && Number.isFinite(projected.x) && Number.isFinite(projected.y)) {
            screenPoints.push(projected);
          }
        }
        const pointsValue = screenPoints.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
        if (pointsValue !== lastFlightPathPoints) {
          autoTargetRouteLine.setAttribute('points', pointsValue);
          lastFlightPathPoints = pointsValue;
        }
        const endpoint = screenPoints.length ? screenPoints[screenPoints.length - 1] : null;
        if (endpoint) {
          const x = endpoint.x.toFixed(1);
          const y = endpoint.y.toFixed(1);
          if (lastEndpointCx !== x || lastEndpointCy !== y) {
            lastEndpointCx = x;
            lastEndpointCy = y;
            autoTargetEndpointRing.setAttribute('cx', x);
            autoTargetEndpointRing.setAttribute('cy', y);
            autoTargetEndpoint.setAttribute('cx', x);
            autoTargetEndpoint.setAttribute('cy', y);
          }
        }
        const drawing = !!flightPath.drawing;
        if (lastFlightPathDrawing !== drawing) {
          lastFlightPathDrawing = drawing;
          autoTargetFlightPath.classList.toggle('is-drawing', drawing);
        }
        return;
      }
    };
    this._syncFlightCursor = syncFlightCursor;
    const setFlightUI = (visible) => {
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

    // === Cinematic title splash (styles/intro.css owns look + reveal choreography) ===
    // Full-bleed C-INTRO still with a slow approach drift, film-title lockup, and the
    // Contract 47-A signal readout. Click/any key to proceed to menu. First load per
    // session only, so returning players land straight on the menu.
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
      // Styling + reveal choreography live in styles/intro.css. Every layer starts
      // invisible and animates in, so the boot console crossfades into "optics
      // online" instead of snapping. IDs are behavior hooks — other scripts and
      // the a11y wiring key off #cinematic-title / #cinematic-summary / #cinematic-signal.
      cinematic.innerHTML = `
        <div class="cine-bg"></div>
        <div class="cine-scrim"></div>
        <div class="cine-grain"></div>
        <div class="cine-tag">VHL-4471-T · Tessera — salvage registry</div>
        <div class="cine-lockup">
          <div class="cine-eyebrow">Tessera · VHL-4471-T · Operator: Unknown</div>
          <div class="cine-title" id="cinematic-title">SPACEFACE</div>
          <div class="cine-rule"></div>
          <div class="cine-contract" id="cinematic-summary">Contract 47-A — Open / Payment Pending</div>
          <div class="cine-begin">Click or press any key to begin</div>
        </div>
        <div class="cine-signal" id="cinematic-signal">
          <div class="cine-signal__k">Inbound signal</div>
          <div class="cine-signal__t">CONTRACT 47-A</div>
          <div class="cine-signal__s">Reach corridor — channel open</div>
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
        cinematic.classList.add('is-closing'); // intro.css: .65s opacity settle
        fadeRemovalTimer = setTimeout(() => {
          if (cinematic.parentNode) cinematic.parentNode.removeChild(cinematic);
          if (this._cinematicTeardown === teardownCinematic) this._cinematicTeardown = null;
        }, 700);
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
    // Close ONE named screen, and only if it is the one on top. An owner that opened a surface
    // (the Crucible draft / refit) needs to close its own without popping whatever a player
    // stacked above it (PQ-133 CRU-016).
    this.bus.on('ui:closeScreen', (payload = {}) => {
      const id = payload && payload.id;
      if (!id) return;
      if (this.screenManager.top() === id) this.screenManager.popScreen();
    });
    this.bus.on('ui:replaceScreen', ({ id }) => { if (id) this.screenManager.replaceScreen(id); });
    this.bus.on('ui:closeAll', () => this.screenManager.closeAll());
    this.bus.on('ui:cycleTarget', ({ dir } = {}) => cycleTarget(this.state, dir || 1, this.bus));
    // PQ-015 component sub-selection: cycle a component (subsystem / salvage weak-point) on the
    // current target. Reachable via the target panel component chip (DOM); a keyboard binding is a
    // pending input.js shared-change request (see REPORT). Selection is transient on state.ui.
    this.bus.on('ui:cycleComponent', ({ dir } = {}) => cycleTargetComponent(this.state, dir || 1, this.bus));
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
      // During a blackout isLiveOverlay() is false by definition, so live screens collapse into the
      // full modal treatment here.
      const liveOverlay = !!(this.screenManager && this.screenManager.isLiveOverlay
        && this.screenManager.isLiveOverlay());
      syncModalChrome(screenOpen, externalOpen, liveOverlay);
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

    let activeDrillApproach = null;
    const sameDrillApproach = (payload) => !!(activeDrillApproach && payload
      && payload.asteroidId === activeDrillApproach.asteroidId
      && payload.attachmentId === activeDrillApproach.attachmentId);

    this.bus.on('drill:approachStarted', ({ asteroidId, attachmentId }) => {
      if (asteroidId == null || attachmentId == null) return;
      activeDrillApproach = { asteroidId, attachmentId };
      this.state.input.blocked = true;
      showDockFade('drill');

      const camCtrl = this.state.render && this.state.render.cameraCtrl;
      if (camCtrl && typeof camCtrl.pushZoom === 'function') camCtrl.pushZoom(-0.45, 1.2);
      this.bus.emit('audio:cue', { id: 'ui_confirm' });
    });

    this.bus.on('drill:approachCompleted', (payload) => {
      if (!sameDrillApproach(payload)) return;
      activeDrillApproach = null;
      this.state.input.blocked = false;
      if (!this.state.ui) this.state.ui = {};
      this.state.ui.pendingDrillAsteroidId = payload.asteroidId;
      this.screenManager.pushScreen('drill');
      setTimeout(() => hideDockFade('drill'), 50);
    });

    this.bus.on('drill:approachCancelled', (payload) => {
      if (!sameDrillApproach(payload)) return;
      activeDrillApproach = null;
      this.state.input.blocked = false;
      hideDockFade('drill');
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
    const registrationCycle = this._screenRegistrationCycle;
    const registrations = [];
    for (const { path, load, name } of SCREEN_MODULES) {
      registrations.push(load()
        .then((mod) => {
          if (!isScreenRegistrationCycleCurrent(registrationCycle)) return;
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
        .catch((err) => { console.warn(`[ui] screen module "${path}" unavailable:`, err && err.message ? err.message : err); }));
    }
    this._screenRegistrationPromise = Promise.allSettled(registrations).then(() => {
      if (isScreenRegistrationCycleCurrent(registrationCycle)) {
        this._screenRegistrationSettledGeneration = registrationCycle.generation;
      }
    });
    return this._screenRegistrationPromise;
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
      // Live (non-pausing) overlays keep the HUD ticking visibly under a light dim instead of the
      // full modal blackout (FRONTEND_DIRECTION §3.5): no ui-modal-open, hud stays live.
      const liveOverlay = !!(this.screenManager && this.screenManager.isLiveOverlay
        && this.screenManager.isLiveOverlay());
      const modalChromeOpen = syncModalChrome(modalOpen, externalModalOpen, liveOverlay);
      const docked = !!(st && st.ui && st.ui.docked === true);
      if (this.screenManager && typeof this.screenManager.syncHudAccessibility === 'function') {
        this.screenManager.syncHudAccessibility(modalChromeOpen || liveOverlay || docked || !st || st.mode !== 'flight');
      }
      const hudVisible = !!(st && st.mode === 'flight' && !modalChromeOpen && !docked);
      // Flight cursor (cursor:none) only in pure flight — over any open screen the pointer is a UI
      // cursor. The reticle itself stays alive under live overlays (second arg).
      if (this._syncFlightCursor) this._syncFlightCursor(hudVisible && !modalOpen, hudVisible);
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
      if (this.lawfulInspectionPrompt && typeof this.lawfulInspectionPrompt.tick === 'function') {
        this.lawfulInspectionPrompt.tick();
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
    invalidateScreenRegistrationCycle(this);
    this._screenRegistrationCycle = null;
    this._screenRegistrationSettledGeneration = null;
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
    if (this.lawfulInspectionPrompt && typeof this.lawfulInspectionPrompt.destroy === 'function') {
      this.lawfulInspectionPrompt.destroy();
    }
    this.lawfulInspectionPrompt = null;
    destroyCommsOwner(this);
    destroyMarketNewsOwner(this);
    if (typeof this._fulfillmentBlackoutTeardown === 'function') this._fulfillmentBlackoutTeardown();
    this._fulfillmentBlackoutTeardown = null;
    if (typeof this._cinematicTeardown === 'function') this._cinematicTeardown();
    this._cinematicTeardown = null;
    if (this.entityLinks && typeof this.entityLinks.destroy === 'function') this.entityLinks.destroy();
    this.entityLinks = null;
    if (this.screenManager && typeof this.screenManager.destroy === 'function') this.screenManager.destroy();
    this.screenManager = null;
    this.manager = null;
    this._cinematicInputFence = null;
    this._cinematicActive = false;
    this._pendingMainMenu = false;
  },
};

function cycleTarget(state, dir, bus) {
  if (!state || !state.entities || typeof state.entities.get !== 'function') return;
  const player = state.entities.get(state.playerId);
  if (!player || !player.pos) return;
  if (!state.player) state.player = {};
  const contacts = [];
  for (const e of state.entityList || []) {
    if (!e || e.alive === false || e === player || !e.pos) continue;
    const explicitWorldSiteTarget = !!(e.data && e.data.worldSiteTargetable === true);
    if (explicitWorldSiteTarget && !presentationAllowsPlayerFacingAction(e, state)) continue;
    if (!explicitWorldSiteTarget && !verbAcceptsType('target', e.type)) continue; // PQ-015 membership + explicit site exception
    if (!explicitWorldSiteTarget && !isHostileToPlayer(e, player.team, state)) continue;
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

// PQ-015: sub-select one component (combat subsystem / salvage weak-point) on the current target and
// publish it TRANSIENTLY on state.ui.componentSelection (never serialized — verified by
// check:save-schema). The pure cycle/enumeration lives in interactionDescriptors; this handler owns
// the state write, target-change rebind, and player feedback. A null/absent selection leaves every
// verb resolving exactly as before, so this is inert until the player opts in.
function cycleTargetComponent(state, dir, bus) {
  const targetId = state.player && state.player.targetId;
  const target = targetId != null && state.entities && state.entities.get ? state.entities.get(targetId) : null;
  if (!target || target.alive === false) {
    setComponentSelection(state, null, null);
    if (bus) bus.emit('toast', { text: 'No target for component select', kind: 'info', ttl: 2 });
    return;
  }
  const components = listSelectableComponents(state, target);
  if (!components.length) {
    setComponentSelection(state, null, null);
    if (bus) bus.emit('toast', { text: targetLabel(target) + ': no targetable components', kind: 'info', ttl: 2 });
    return;
  }
  const prior = state.ui && state.ui.componentSelection;
  const currentId = prior && prior.targetId === target.id ? prior.componentId : null;
  const next = nextComponentSelection(components, currentId, dir);
  setComponentSelection(state, target, next);
  const label = (components.find((c) => c.componentId === (next && next.componentId)) || {}).label || next.componentId;
  if (bus) bus.emit('toast', { text: 'Component: ' + label, kind: 'info', ttl: 2 });
}

function setComponentSelection(state, target, next) {
  if (!state.ui) state.ui = {};
  state.ui.componentSelection = (target && next) ? {
    targetId: target.id,
    stableKey: stableEntityKey(target),
    componentId: next.componentId,
    kind: next.kind,
    verb: next.verb,
  } : null;
}

function isScannerHostileLock(player, state, entity) {
  if (!player || !entity || entity.alive === false || !entity.pos) return false;
  if (!verbAcceptsType('target', entity.type)) return false; // PQ-015: shared target membership
  if (!isHostileToPlayer(entity, player.team, state)) return false;
  const dx = entity.pos.x - player.pos.x;
  const dz = entity.pos.z - player.pos.z;
  return (dx * dx + dz * dz) <= SCANNER_CONTACT_RANGE * SCANNER_CONTACT_RANGE;
}

// The hostile the Massline is physically holding, if it is a legal scanner lock. Whenever this
// function is the one CHOOSING (rather than preserving a pick the player made), the ship on the end
// of your own line beats the ship that merely happens to be nearest — that near-miss is what had you
// orbiting your catch while the target panel and the lead pip described a third ship.
function tetheredHostileLock(player, state) {
  const tether = state.player && state.player.tether;
  if (!tether || !tether.active || tether.targetId == null) return null;
  const target = state.entities.get(tether.targetId);
  if (!isScannerHostileLock(player, state, target)) return null;
  return target;
}

// A live selection that the nearest-hostile scan could not have produced by itself: a freighter, a
// station, a rock — something the player clicked in the contact overview (`src/ui/hud.js:3180`)
// rather than something auto-target acquired for them. Hostiles are deliberately NOT covered here:
// a hostile lock that has died or left scanner range must still be replaced, and re-acquiring it is
// the entire job of the quiet refresh.
function isDeliberateNonHostilePick(player, state, entity) {
  if (!player || !entity || entity.alive === false || !entity.pos) return false;
  return !isHostileToPlayer(entity, player.team, state);
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
    } else if (quiet && isDeliberateNonHostilePick(player, state, cur)) {
      // A deliberate selection can seed the NEXT latch's transient releaseTarget. Once a line is
      // latched, selection churn and this 0.12s housekeeping refresh no longer steer the armed
      // throw; only explicit per-tick aim intent may repaint that captured destination. Preserve
      // the pick anyway because it remains player-owned selection truth for the panel, hails,
      // orders, self-sling aim, and future latches. Gun/tether reconciliation is unaffected —
      // `resolvePlayerGunTarget()` derives the gun target from the tether without this variable.
      return;
    }
  } else if (quiet) {
    // No lock yet — quiet refresh may acquire the nearest hostile.
  }
  // Past the quiet early-out, so a Tab/radar pick is never stomped by the 0.12s refresh.
  const tethered = tetheredHostileLock(player, state);
  if (tethered) {
    state.player.targetId = tethered.id;
    if (bus && !quiet) {
      bus.emit('toast', { text: 'Target: ' + targetLabel(tethered) + ' (on the line)', kind: 'info', ttl: 2 });
    }
    return;
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

// J07: the bracket recipe is shared with comms.js / sectorLawPresenter.js / onboarding.js.
// See src/ui/hudBrackets.js for why it is a string and not a class.
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
  body.ui-modal-open #alerts,
  body.ui-modal-open #toasts { opacity: 0 !important; pointer-events: none !important; }

  /* Reticle reflects aim mode: amber tint + slight pulse when auto-target is tracking hostiles,
     cyan when the pilot aims/fires manually (Phase 2). */
  #aim-reticle { transition: none; }
  #aim-reticle svg * { filter:none !important; }
  #aim-reticle .sf-reticle-shape--bracket { display:none; }
  #aim-reticle[data-mode="auto"] .sf-reticle-shape--open { display:none; }
  #aim-reticle[data-mode="auto"] .sf-reticle-shape--bracket { display:block; }
  #aim-reticle.autofire { filter: hue-rotate(150deg) saturate(1.3) brightness(1.05);
  }
  #aim-reticle.autofire > svg { animation: sf-reticlepulse 1.4s ease-in-out infinite alternate; }
  @keyframes sf-reticlepulse { from { opacity:.88; } to { opacity:1; } }

  /* ===== bottom-left: ship schematic + thin micro-bars (Tactical Visor §3C) ===== */
  /* Container is now chromeless — no panel background, border, or blur. */
  /* Bottom-left anchor is ONE flex column (SPEC3-36 three-anchor law): a contextual sub-column
     (.sf-leftcontext — mission tracker + objectives + nav readout, relocated from the old top
     stragglers) sits ABOVE the schematic + vitals (.sf-bars). Compositor-cheap: no shadow/transition. */
  .sf-leftstack { position:absolute; left:calc(22px + var(--sf-safe-inset-x, 0px)); bottom:22px; display:flex; flex-direction:column;
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
  .sf-rightdock { position:absolute; right:calc(22px + var(--sf-safe-inset-x, 0px)); bottom:22px; display:flex; flex-direction:column; align-items:flex-end; gap:8px;
    contain:layout paint style; }
  .sf-radar-wrap { display:flex; flex-direction:column; align-items:center; gap:6px; contain:layout paint style; }
  .sf-radar { position:relative; width:var(--sf-radar-size, 220px); height:var(--sf-radar-size, 220px); border-radius:50%; overflow:hidden; cursor:pointer;
    contain:layout paint style; }
  .sf-radar--expanded { width:340px !important; height:340px !important; }
  /* Canvas is centered so compact/expanded size changes stay anchored on the player marker. */
  .sf-radar canvas { display:block; position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); }
  .sf-radar-objective-key { width:100%; text-align:center; color:var(--visor-amber);
    font-family:var(--mono); font-size:9px; font-weight:700; letter-spacing:.1em;
    text-transform:uppercase; text-shadow:none; }
  /* HUD sub-panel surface — now chromeless. Legibility comes from hard text-shadow on the content. */
  .sf-hudpanel { background:none; border:none; box-shadow:none; }
  .sf-target { width:100%; display:flex; flex-direction:column; gap:5px; text-align:right; contain:layout paint style;
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

  /* ===== receipts (HUD layer; not website cards) ===== */
  #hud #toasts, #toasts.sf-receipts { z-index:11; pointer-events:none; }
  .sf-toast { display:flex; align-items:center; gap:6px; width:100%; max-width:360px; padding:2px 0;
    background:none; border:none; border-radius:0; color:var(--hud-paper, var(--ink)); font-size:13px;
    box-shadow:none; text-shadow:0 1px 3px #000, 0 0 8px rgba(0,0,0,.8);
    pointer-events:auto; cursor:pointer; transform:none; opacity:0; transition:opacity .16s ease; }
  body.ui-modal-open .sf-toast { pointer-events:none; cursor:default; }
  .sf-toast--in { transform:none; opacity:1; }
  .sf-toast--out { transform:none; opacity:0; }
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
    transform:translate(-50%,-50%) scale(1); transform-origin:50% 50%;
    pointer-events:none; z-index:14; opacity:0;
    transition:opacity .15s ease; filter:drop-shadow(0 0 6px var(--accent)); }
  .sf-lockring.active { display:block; opacity:1; }
  .sf-lockring.locked { filter:drop-shadow(0 0 10px var(--danger)); }
  .sf-lockring.sf-lockring--latch { animation:sf-lockring-latch 160ms cubic-bezier(.2,.7,.2,1) 1; }
  .sf-lockring .sf-lockring__track { fill:none; stroke:var(--panel-edge); stroke-width:2.5; }
  .sf-lockring .sf-lockring__fill { fill:none; stroke:var(--accent); stroke-width:3;
    stroke-linecap:round; transition:stroke .15s ease; }
  .sf-lockring.locked .sf-lockring__fill { stroke:var(--danger); }
  .sf-lockring__label { position:absolute; left:50%; bottom:-2px; transform:translateX(-50%);
    font-family:var(--mono); font-size:9px; letter-spacing:.14em; color:var(--accent);
    text-transform:uppercase; white-space:nowrap; text-shadow:0 0 6px rgba(57,208,255,.6); }
  .sf-lockring.locked .sf-lockring__label { color:var(--danger); text-shadow:0 0 6px rgba(255,84,112,.6); }
  @keyframes sf-lockring-latch {
    0% { transform:translate(-50%,-50%) scale(1); }
    50% { transform:translate(-50%,-50%) scale(1.16); }
    100% { transform:translate(-50%,-50%) scale(1); }
  }

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

  /* Gravity Mark — a persistent world-space contracting well read, independent of selection. */
  .sf-gravity-mark { display:none; position:absolute; left:0; top:0; width:46px; height:46px;
    pointer-events:none; z-index:12; opacity:0; transition:opacity .12s ease; will-change:transform; }
  .sf-gravity-mark.visible { display:block; opacity:1; }
  .sf-gravity-mark__ring { position:absolute; inset:3px; border:2px solid rgba(166,240,255,.95);
    border-radius:50%; box-shadow:0 0 13px rgba(57,208,255,.58), inset 0 0 10px rgba(234,255,255,.2);
    animation:sf-gravity-mark-contract .9s cubic-bezier(.4,0,.2,1) infinite; }
  .sf-gravity-mark__core { position:absolute; left:50%; top:50%; width:6px; height:6px;
    transform:translate(-50%,-50%) rotate(45deg); background:#eaffff;
    box-shadow:0 0 9px #39d0ff; }
  .sf-gravity-mark__label { position:absolute; left:50%; top:48px; transform:translateX(-50%);
    color:#a6f0ff; font-size:8px; letter-spacing:.12em; white-space:nowrap;
    text-shadow:0 1px 2px #02060a, 0 0 6px rgba(57,208,255,.8); }
  @keyframes sf-gravity-mark-contract {
    from { transform:scale(1.18); opacity:.48; }
    to { transform:scale(.78); opacity:1; }
  }

  /* Momentum Sink — static opposing brackets name the player's moving reference frame. */
  .sf-momentum-sink { display:none; position:absolute; left:0; top:0; width:58px; height:58px;
    pointer-events:none; z-index:12; opacity:0; transition:opacity .12s ease; will-change:transform; }
  .sf-momentum-sink.visible { display:block; opacity:1; }
  .sf-momentum-sink__bracket { position:absolute; inset:5px; border-left:3px solid rgba(255,190,112,.95);
    border-right:3px solid rgba(255,190,112,.95); box-shadow:0 0 10px rgba(255,136,64,.34); }
  .sf-momentum-sink__bracket::before, .sf-momentum-sink__bracket::after {
    content:''; position:absolute; left:7px; right:7px; height:2px; background:rgba(255,222,176,.8); }
  .sf-momentum-sink__bracket::before { top:7px; }
  .sf-momentum-sink__bracket::after { bottom:7px; }
  .sf-momentum-sink__axis { position:absolute; left:16px; right:16px; top:50%; height:1px;
    background:rgba(255,222,176,.9); box-shadow:0 0 6px rgba(255,136,64,.5); }
  .sf-momentum-sink__axis::before, .sf-momentum-sink__axis::after { content:''; position:absolute; top:-3px;
    width:7px; height:7px; border-top:1px solid rgba(255,222,176,.9); }
  .sf-momentum-sink__axis::before { left:0; border-left:1px solid rgba(255,222,176,.9); transform:rotate(-45deg); }
  .sf-momentum-sink__axis::after { right:0; border-right:1px solid rgba(255,222,176,.9); transform:rotate(45deg); }
  .sf-momentum-sink__label { position:absolute; left:50%; top:60px; transform:translateX(-50%);
    color:#ffd8a3; font-size:8px; letter-spacing:.1em; white-space:nowrap;
    text-shadow:0 1px 2px #080402, 0 0 6px rgba(255,136,64,.72); }

  /* Lead pip (BP-02 combat ceiling) — world-space marker showing where to aim so a shot fired NOW
     intercepts the moving target. A hollow reticle-ring the player walks their crosshair onto. Tints
     amber→green as the crosshair converges (solved via the SAME lead solver the guns use). */
  .sf-leadpip { display:none; position:absolute; left:0; top:0; width:22px; height:22px; pointer-events:none; z-index:13;
    opacity:0; transition:opacity .1s ease; will-change:transform;
    --pip-glow:255,196,84; }
  .sf-leadpip.visible { display:block; opacity:.92; }
  .sf-leadpip.on-solution { --pip-glow:120,240,150; }
  .sf-leadpip__svg { width:100%; height:100%; overflow:visible;
    filter:drop-shadow(0 0 7px rgba(var(--pip-glow),.5)); }
  .sf-leadpip__full, .sf-leadpip__arc {
    fill:none; stroke:rgba(var(--pip-glow),.95); stroke-width:1.6; vector-effect:non-scaling-stroke; }
  .sf-leadpip__arc { stroke-linecap:round; }
  .sf-leadpip.on-solution .sf-leadpip__full { opacity:1; }
  .sf-leadpip.on-solution .sf-leadpip__arc { opacity:0; }
  .sf-leadpip:not(.on-solution) .sf-leadpip__full { opacity:0; }
  .sf-leadpip:not(.on-solution) .sf-leadpip__arc { opacity:1; }
  .sf-leadpip__tick { stroke:rgba(var(--pip-glow),.9); stroke-width:1.5; stroke-linecap:round; }

  .sf-threat-halo { display:none; position:absolute; inset:0; pointer-events:none; z-index:13; }
  .sf-threat-halo__slot { display:none; position:absolute; left:0; top:0; opacity:.55; }
  .sf-threat-halo__slot--arc .sf-threat-halo__arc {
    width:54px; height:18px; box-sizing:border-box;
    border:2px solid var(--sf-foe, var(--danger));
  }
  .sf-threat-halo__slot--arc[data-edge="top"] .sf-threat-halo__arc {
    border-bottom:none; border-radius:16px 16px 0 0;
  }
  .sf-threat-halo__slot--arc[data-edge="bottom"] .sf-threat-halo__arc {
    border-top:none; border-radius:0 0 16px 16px;
  }
  .sf-threat-halo__slot--arc[data-edge="left"] .sf-threat-halo__arc {
    width:18px; height:54px; border-right:none; border-radius:16px 0 0 16px;
  }
  .sf-threat-halo__slot--arc[data-edge="right"] .sf-threat-halo__arc {
    width:18px; height:54px; border-left:none; border-radius:0 16px 16px 0;
  }
  .sf-threat-halo__slot--missile .sf-threat-halo__chev {
    width:22px; height:22px; display:block; color:var(--sf-foe, var(--danger));
  }
  .sf-threat-halo__slot--missile .sf-threat-halo__chev path {
    fill:none; stroke:currentColor; stroke-width:2.2; stroke-linecap:round; stroke-linejoin:round;
  }
  .sf-threat-halo__slot--missile[data-edge="right"] .sf-threat-halo__chev { transform:rotate(90deg); }
  .sf-threat-halo__slot--missile[data-edge="bottom"] .sf-threat-halo__chev { transform:rotate(180deg); }
  .sf-threat-halo__slot--missile[data-edge="left"] .sf-threat-halo__chev { transform:rotate(-90deg); }
  @media (forced-colors: active) {
    .sf-leadpip__svg { filter:none; }
    .sf-leadpip__full, .sf-leadpip__arc, .sf-leadpip__tick { stroke:CanvasText; }
    .sf-threat-halo__slot--arc .sf-threat-halo__arc {
      border-color:CanvasText; forced-color-adjust:none;
    }
    .sf-threat-halo__slot--missile .sf-threat-halo__chev path {
      stroke:CanvasText; forced-color-adjust:none;
    }
  }

  /* Capacitor readout near weapon area */
  .sf-cap-readout { position:absolute; left:18px; bottom:18px; pointer-events:none;
    font-family:var(--mono); font-size:10px; letter-spacing:.08em; color:var(--ink-dim); }

  @media (max-width: 760px), (max-height: 620px) {
    #pilot-portrait { width:54px; height:54px; top:10px; right:10px; }
    #toasts { left:calc(12px + var(--sf-safe-inset-x, 0px)); right:calc(12px + var(--sf-safe-inset-x, 0px)); width:auto; transform:none; }
    .sf-toast { width:auto; max-width:none; font-size:12px; padding:8px 10px; }
    #alerts { left:calc(10px + var(--sf-safe-inset-x, 0px)); right:calc(10px + var(--sf-safe-inset-x, 0px)); top:84px; width:auto; }
    .sf-alert { max-width:100%; font-size:10px; letter-spacing:.08em; white-space:normal; text-align:center; justify-content:center; }

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

    .sf-leftstack { left:calc(8px + var(--sf-safe-inset-x, 0px)); bottom:96px; max-width:calc(100vw - 16px); }
    .sf-bars { gap:7px; }
    .sf-schematic { width:64px; height:64px; }
    .sf-sch-hull { font-size:12px; }
    .sf-barrow { gap:5px; }
    .sf-barrow__label { width:34px; font-size:8px; }
    .sf-barrow__num { width:26px; font-size:9px; }
    .sf-bar { width:78px; }

    #hud { --sf-dock-w:150px; --sf-radar-size:132px; }
    .sf-rightdock { right:calc(8px + var(--sf-safe-inset-x, 0px)); bottom:96px; gap:5px; }
    .sf-target__name { font-size:11px; }
    .sf-target__meta { font-size:10px; }
    .sf-radar-wrap { gap:4px; }
    .sf-radar canvas { width:132px !important; height:132px !important; }
    .sf-radar-objective-key { font-size:8px; letter-spacing:.06em; line-height:1.25; }

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
     Material follows the menu fascia (styles/menu.css): near-black hairline plates, letterspaced
     mono stamps, ONE signal cyan reserved for live/active marks, amber kept for the objective.
     Holographic-bleak rather than frosted-glass: crisp hairlines and flat dark surfaces with no
     always-on backdrop blur (compositor cost) — legibility comes from panel opacity, not frost. */
  #hud {
    --hud-display:"Saira SemiCondensed", "Arial Narrow", sans-serif;
    --hud-body:"IBM Plex Sans", "Segoe UI", sans-serif;
    --hud-data:"IBM Plex Mono", Consolas, monospace;
    --hud-paper:#e9eff4;
    --hud-copy:#a9b8c4;
    --hud-muted:#71828f;
    --hud-line:rgba(148,178,205,.18);
    --hud-line-strong:rgba(148,178,205,.34);
    --hud-surface:rgba(10,14,20,.92);
    --hud-surface-soft:rgba(13,18,25,.78);
    --hud-cyan:#4ec3e6;
    --hud-amber:#dfa04e;
    --hud-danger:#e0665f;
    --font-mono:var(--hud-data);
    /* Unified panel material: hairline instrument plates (menu-fascia material at HUD opacity). */
    --hud-radius:3px;
    --hud-shadow:0 6px 18px rgba(0,0,0,.5);
    --hud-inset:inset 0 1px rgba(255,255,255,.04);
    --hud-glass:linear-gradient(180deg, rgba(15,20,27,.92), rgba(8,11,16,.94));
    --hud-solid:linear-gradient(180deg, rgba(15,20,27,.96), rgba(8,11,16,.97));
    /* Signal trace: the thin cyan edge-light shared with the menu plates. */
    --hud-trace:linear-gradient(90deg, rgba(78,195,230,.5), rgba(78,195,230,.10) 42%, transparent 70%);
    font-family:var(--hud-body);
    color:var(--hud-paper);
  }

  .sf-leftstack {
    left:calc(12px + var(--sf-safe-inset-x, 0px)); bottom:12px; width:272px; max-width:calc(100vw - 24px); gap:8px;
    align-items:stretch;
  }
  .sf-leftcontext {
    width:100%; max-width:none; gap:6px; align-items:stretch;
  }
  .sf-bars {
    width:272px; max-width:100%; display:grid;
    grid-template-columns:92px minmax(0, 1fr); grid-template-rows:auto repeat(4, 17px);
    gap:4px 10px; align-items:center; padding:4px 2px 2px;
    background:none; border:none; box-shadow:none !important; overflow:visible;
  }
  .sf-bars::before, .sf-bars::after { display:none; }
  .sf-condition-head {
    grid-column:1 / -1; min-height:0; display:flex; align-items:center; justify-content:flex-start;
    font-family:var(--hud-display); font-size:11px; font-weight:700; letter-spacing:.06em;
    color:var(--hud-copy); border:none; padding:0; margin:0;
  }
  .sf-condition-title-group {
    display:flex; align-items:center; gap:8px;
  }
  .sf-condition-state {
    font-family:var(--hud-data); font-size:7px; font-weight:600; letter-spacing:.12em; color:var(--hud-cyan);
    padding:1px 4px; background:rgba(78,195,230,.10); border-radius:2px; border:1px solid rgba(78,195,230,.28);
  }
  .sf-condition-critical .sf-condition-state {
    color:var(--hud-danger); background:rgba(224,102,95,.12); border-color:rgba(224,102,95,.3);
  }
  .sf-condition-shield-low .sf-condition-state {
    color:var(--hud-amber); background:rgba(223,160,78,.12); border-color:rgba(223,160,78,.3);
  }
  .sf-condition-metrics {
    display:flex; align-items:center; gap:7px; font-family:var(--hud-data); font-size:8px;
  }
  .sf-cond-stat {
    color:var(--hud-muted); letter-spacing:.05em;
  }
  .sf-cond-stat strong {
    color:var(--hud-paper); font-weight:700; margin-left:3px;
  }
  .sf-condition-critical .sf-cond-hull-val { color:var(--hud-danger); }
  .sf-condition-shield-low .sf-cond-shd-val { color:var(--hud-amber); }

  .sf-schematic {
    grid-column:1; grid-row:2 / span 4; width:88px; height:88px; align-self:center; justify-self:center;
    display:grid; place-items:center; isolation:isolate; position:relative;
  }
  .sf-schematic .sf-sch-ring { position:absolute; inset:2px; width:84px; height:84px; overflow:visible; z-index:1; }
  .sf-schematic .sf-sch-track { fill:rgba(7,12,20,.32); stroke:rgba(148,178,205,.22); stroke-width:1.6; }
  .sf-schematic .sf-sch-shield {
    fill:none; stroke:var(--hud-cyan); stroke-width:2.5; stroke-linecap:round; opacity:.92;
    filter:drop-shadow(0 0 6px rgba(78,195,230,.5)); transition:stroke-dashoffset .15s linear, stroke .2s ease;
  }
  .sf-schematic.sf-sch-shield-low .sf-sch-shield {
    stroke:var(--hud-amber); filter:drop-shadow(0 0 6px rgba(223,160,78,.6));
  }
  .sf-sch-ship-wrap {
    position:relative; width:62px; height:74px; z-index:2; display:flex; align-items:center; justify-content:center;
  }
  .sf-sch-ship {
    width:62px; height:74px; object-fit:contain; pointer-events:none;
  }
  .sf-sch-ship--empty {
    position:absolute; inset:0; z-index:1;
    /* No grayscale/brightness crush: that filter existed to dim a full-colour raster. Applied to a
       vector outline it erases it. The outline is dimmed by its own stroke colour instead. */
    transition:filter .22s ease;
  }
  .sf-sch-ship-fill-crop {
    position:absolute; left:0; right:0; bottom:0; top:auto;
    height:var(--hull-pct, 100%);
    overflow:hidden; z-index:2;
    transition:height .15s ease-out;
  }
  .sf-sch-ship--fill {
    position:absolute; left:0; bottom:0; width:62px; height:74px; max-width:none;
    filter:drop-shadow(0 0 6px rgba(78, 195, 230, 0.4)) saturate(1.25) brightness(1.2);
    transition:filter .22s ease;
  }
  /* J07: the mark is a vector hull now, not a raster Scout. The empty layer is the outline you are
     losing; the fill layer is the hull you still have. Both are the SAME geometry, so the fill line
     reads as a waterline across one shape rather than a seam between two images. */
  /* Both layers must be the SAME box, bottom-anchored, or the waterline cuts across a shape that
     has shifted relative to the outline behind it. The old raster pair shared one aspect ratio by
     accident; the vector pair has to be told.
     .sf-schematic svg { height:100% } sits above this file at (0,1,1) and never applied to the old
     <img> marks. It applies to these, and it squashed the fill layer to the crop's height so the
     hull deformed as damage came off. Matching that specificity is the fix; measuring the rendered
     boxes in the running game is the only reason it was found. */
  .sf-schematic .sf-sch-ship--empty, .sf-schematic .sf-sch-ship--fill {
    position:absolute; left:0; bottom:0; top:auto; width:62px; height:74px; max-width:none;
  }
  /* The quarter turn. transform-box:view-box pins the origin to the 48x48 viewBox rather than the
     group's own bbox, so the maths is stable whatever hull is loaded: centre the 48x28 body in the
     square (translate 10 down), then rotate about the square's centre. Reading right to left, CSS
     applies the translate first. */
  .sf-schematic .sf-sch-hull {
    transform-box:view-box; transform-origin:24px 24px;
    transform:rotate(-90deg) translate(0px, 10px);
  }
  .sf-sch-ship--empty .sf-sch-hull { fill:none; stroke:var(--hud-muted, #718298); stroke-width:1.1; }
  .sf-sch-ship--empty .sf-sch-hull .sx-shipmark__cut,
  .sf-sch-ship--empty .sf-sch-hull .sx-shipmark__battery { stroke-opacity:.45; }
  .sf-sch-ship--fill .sf-sch-hull {
    fill:color-mix(in srgb, var(--hud-cyan, #4ec3e6) 22%, transparent);
    stroke:var(--hud-cyan, #4ec3e6); stroke-width:1.2;
  }
  .sf-sch-ship--fill .sf-sch-hull .sx-shipmark__cut { fill:none; stroke-opacity:.7; }
  .sf-sch-ship--fill .sf-sch-hull .sx-shipmark__battery { fill:var(--hud-cyan, #4ec3e6); stroke:none; }
  .sf-sch-ship--fill .sf-sch-hull .sx-shipmark__sensor { fill:var(--hud-paper, #e7edf5); stroke:none; }
  /* Damage state is carried by the stroke colour of the hull you have left, not by a wash over the
     whole instrument -- the word CRITICAL is already printed alongside for forced-colors. */
  .sf-schematic.sf-sch-warning .sf-sch-ship--fill .sf-sch-hull {
    stroke:var(--hud-amber, #dfa04e); fill:color-mix(in srgb, var(--hud-amber, #dfa04e) 20%, transparent);
  }
  .sf-schematic.sf-sch-critical .sf-sch-ship--fill .sf-sch-hull {
    stroke:var(--hud-red, #e0665f); fill:color-mix(in srgb, var(--hud-red, #e0665f) 24%, transparent);
  }
  .sf-sch-fill-line {
    position:absolute; left:6%; right:6%; bottom:var(--hull-pct, 100%);
    height:2px; background:var(--hud-cyan);
    box-shadow:0 0 8px var(--hud-cyan), 0 0 2px #fff;
    transform:translateY(50%); z-index:3;
    transition:bottom .15s ease-out, background-color .22s ease, box-shadow .22s ease;
    pointer-events:none;
  }
  .sf-schematic.sf-sch-critical .sf-sch-ship--fill {
    filter:drop-shadow(0 0 10px rgba(224,102,95,.75)) saturate(1.6) brightness(1.1);
    animation:sf-schpulse 0.8s ease-in-out infinite alternate;
  }
  .sf-schematic.sf-sch-critical .sf-sch-fill-line {
    background:var(--hud-danger);
    box-shadow:0 0 10px var(--hud-danger), 0 0 3px #fff;
  }
  .sf-schematic.sf-sch-warning .sf-sch-ship--fill {
    filter:drop-shadow(0 0 8px rgba(223,160,78,.65)) saturate(1.4) brightness(1.15);
  }
  .sf-schematic.sf-sch-warning .sf-sch-fill-line {
    background:var(--hud-amber);
    box-shadow:0 0 8px var(--hud-amber), 0 0 2px #fff;
  }
  .sf-schematic.sf-sch-hit .sf-sch-ship-wrap { animation:sf-schhit .34s ease-out; }
  @keyframes sf-schhit {
    0% { filter:drop-shadow(0 0 11px rgba(255,255,255,.9)) brightness(1.65); }
    100% { filter:drop-shadow(0 5px 5px rgba(0,0,0,.65)) saturate(.86) brightness(1.2) contrast(1.05); }
  }
  .sf-barrow {
    grid-column:2; width:100%; display:grid; grid-template-columns:36px minmax(56px, 1fr) 30px;
    align-items:center; gap:7px; min-height:17px;
  }
  .sf-barrow__label {
    width:auto; font-family:var(--hud-display); font-size:7.5px; font-weight:600; letter-spacing:.1em;
    color:var(--hud-muted); text-shadow:none;
  }
  .sf-barrow__num {
    width:auto; font-family:var(--hud-data); font-size:8.5px; font-weight:500; color:var(--hud-copy);
    font-variant-numeric:tabular-nums; text-shadow:none;
  }
  .sf-bar { width:100%; height:3px; background:rgba(164,181,197,.13); border-radius:1px; overflow:hidden; }
  .sf-bars .sf-bar { overflow:visible; }  /* only ship-condition gauges let their glow escape */
  .sf-bar__fill { border-radius:1px; box-shadow:none; }
  .sf-bar--energy .sf-bar__fill { background:#4ec3e6; box-shadow:0 0 8px -2px #4ec3e6; }
  .sf-bar--boost .sf-bar__fill { background:#a08cf0; box-shadow:0 0 8px -2px #a08cf0; }
  .sf-bar--heat .sf-bar__fill { background:#ff8a4a; box-shadow:0 0 8px -2px #ff8a4a; }
  .sf-bar--fuel .sf-bar__fill { background:#4ecba8; box-shadow:0 0 8px -2px #4ecba8; }
  .sf-wpn-heats {
    position:relative; left:auto; bottom:auto !important; grid-column:1 / -1; width:100%;
    flex-direction:column; gap:3px; padding-top:5px; border-top:1px solid rgba(148,178,205,.12);
  }
  .sf-wpn-heat { display:grid; grid-template-columns:62px minmax(0, 1fr); gap:7px; align-items:center; }
  .sf-wpn-heat__label {
    width:auto; font-family:var(--hud-display); font-size:7px; font-weight:600; letter-spacing:.08em;
    color:var(--hud-muted); text-shadow:none;
  }
  .sf-wpn-heat__bar { width:100%; height:2px; background:rgba(164,181,197,.13); overflow:hidden; }
  .sf-wpn-heat__fill { box-shadow:none; background:#c99563; }

  /* Slim instrument deck: speed/weapons + contextual chips. Permanent binding→action
     keycaps were removed — general keys live in Settings → Controls / Help. */
  .sf-command-deck {
    position:absolute; left:calc(50% + (var(--sf-safe-inset-x, 0px) * 0)); bottom:12px; transform:translateX(-50%); width:min(360px, calc(100vw - 640px));
    min-width:220px; padding:4px 8px 2px;
    background:none; border:none; box-shadow:none !important;
  }
  .sf-command-deck::after { display:none; }
  .sf-cluster {
    position:relative; left:auto; bottom:auto; transform:none; max-width:none; min-height:20px;
    display:flex; flex-wrap:wrap; justify-content:center; align-items:baseline; gap:10px 14px;
    margin:0; padding:0;
  }
  .sf-stat { font-family:var(--hud-data); gap:5px; }
  .sf-stat__k { font-family:var(--hud-display); font-size:8px; font-weight:700; color:var(--hud-muted); letter-spacing:.1em; text-shadow:none; }
  .sf-stat__v { font-size:12px; color:var(--hud-paper); font-variant-numeric:tabular-nums; text-shadow:0 1px 2px rgba(0,0,0,.55); white-space:nowrap; }
  .sf-stat--speed .sf-stat__v { font-family:var(--hud-display); font-size:17px; font-weight:700; }
  /* Massline chips — only while latched; wrap instead of overflowing the deck. */
  .sf-tether-controls {
    display:flex; flex-wrap:wrap; justify-content:center; align-items:center; gap:6px 10px;
    margin:5px 0 0; padding:5px 2px 0; border-top:1px solid rgba(148,178,205,.14);
    max-width:100%;
  }
  .sf-tether-controls[hidden] { display:none !important; }
  .sf-tchip {
    display:inline-flex; flex-wrap:wrap; align-items:center; gap:4px 6px;
    max-width:100%; color:var(--hud-copy);
  }
  .sf-tchip--wide { flex:1 1 100%; justify-content:center; }
  .sf-tchip__bind {
    min-width:22px; padding:2px 5px; text-align:center; font-family:var(--hud-data);
    font-size:8px; font-weight:600; letter-spacing:.04em; color:var(--hud-paper);
    background:rgba(148,178,205,.09); border:1px solid rgba(148,178,205,.28);
    border-bottom-color:rgba(148,178,205,.44); border-radius:2px;
  }
  .sf-tchip__verb {
    font-family:var(--hud-display); font-size:10px; font-weight:700; letter-spacing:.08em;
    color:var(--hud-paper);
  }
  .sf-tchip__hint {
    font-family:var(--hud-data); font-size:8px; font-weight:500;
    letter-spacing:.04em; color:var(--hud-muted); line-height:1.3;
    white-space:normal; text-align:center;
  }

  /* J07 de-box: the left contextual column was three stacked opaque plates. Open telemetry with
     corner brackets and a per-glyph scrim reads at the same distance and spends a fraction of the
     ink budget (SCREENS_A §1.3). Content, hierarchy and padding are unchanged — only the plate. */
  .sf-mission-tracker, .sf-nav-readout, .sf-obj {
    width:100%; max-width:none; border:none; border-radius:0;
    background:none; box-shadow:none !important; text-shadow:var(--sf-ink);
  }
  .sf-mission-tracker, .sf-nav-readout { ${bracketCss()} }
  /* J07 comms ribbon: a quiet frequency tape at the head of the left contextual column, replacing
     two detached boxes floating in the top-left corner. The adopted nodes keep their own listeners;
     only their positioning is neutralised, because both were authored as position:absolute chrome
     and would otherwise still be pinned to the viewport corner inside their new parent. */
  .sf-commtape {
    display:flex; align-items:center; gap:9px; width:100%; padding:2px 0 4px;
    border-bottom:1px solid rgba(148,178,205,.16);
  }
  .sf-commtape[hidden] { display:none !important; }
  .sf-commtape__band {
    font-family:var(--hud-display); font-size:12px; font-weight:700; letter-spacing:.2em;
    color:var(--hud-muted); text-shadow:var(--sf-ink);
  }
  .sf-commtape__slots { display:flex; align-items:center; gap:7px; pointer-events:auto; }
  .sf-commtape__tracehost { display:flex; align-items:center; }
  .sf-commtape .sf-fx-comms-trace {
    min-width:118px; padding-left:7px;
    border-inline-start:1px solid rgba(148,178,205,.18);
    --sf-comms-amp:0;
    --sf-comms-density:0;
  }
  .sf-commtape .sf-fx-comms-trace__crest { color:var(--hud-cyan); }
  .sf-commtape .sf-fx-comms-trace__wave {
    font-family:var(--hud-data); font-size:12px; letter-spacing:.08em;
    color:var(--hud-cyan); text-shadow:0 0 8px rgba(78,195,230,.45), 0 1px 2px rgba(0,0,0,.72);
  }
  .sf-commtape .sf-comm-backlog-btn,
  .sf-commtape #sf-contact-hail {
    position:static !important; left:auto !important; top:auto !important; z-index:auto !important;
    width:auto !important; height:auto !important; margin:0 !important;
  }
  .sf-commtape .sf-comm-backlog-btn {
    padding:2px 8px; background:none; border:none; box-shadow:none;
    font-family:var(--hud-display); font-size:12px; font-weight:700; letter-spacing:.14em;
    color:var(--hud-cyan); text-shadow:var(--sf-ink); cursor:pointer;
  }
  .sf-commtape .sf-comm-backlog-btn:hover { color:var(--hud-paper); }
  .sf-commtape .sf-contact-hail__button {
    padding:2px 8px; background:none; border:none; box-shadow:none;
    font-family:var(--hud-display); font-size:12px; font-weight:700; letter-spacing:.14em;
    color:var(--hud-paper); text-shadow:var(--sf-ink);
  }
  .sf-commtape .sf-contact-hail__button[disabled] { color:var(--hud-muted); }
  /* The hail panel is a popover off the button; keep it anchored to the tape, not the old corner. */
  .sf-commtape .sf-contact-hail__panel { left:0 !important; top:30px !important; }
  /* The tracker used a 2px amber top border to say "this is the mission". De-boxed, that job goes
     to a single amber rule under the title — one stroke, still the loudest thing in the column. */
  .sf-mission-tracker { padding:8px 10px 9px; }
  .sf-mt-title { border-bottom:1px solid rgba(223,160,78,.55); padding-bottom:3px; }
  .sf-mt-title {
    font-family:var(--hud-display) !important; font-size:9px; font-weight:700; letter-spacing:.12em;
    color:var(--hud-amber); margin-bottom:4px;
  }
  .sf-mt-obj { font-family:var(--hud-body) !important; font-size:12px; line-height:1.35; font-weight:500; color:var(--hud-paper); margin-bottom:4px; }
  .sf-mt-time { font-family:var(--hud-data) !important; font-size:8.5px; letter-spacing:.04em; color:#c4a77e; }
  .sf-nav-readout { padding:6px 10px; }
  .sf-nav-label { font-family:var(--hud-display); font-size:10px; font-weight:700; letter-spacing:.08em; color:var(--hud-cyan); }
  .sf-nav-meta { font-family:var(--hud-data); font-size:8.5px; letter-spacing:.035em; color:var(--hud-muted); }

  /* ===== J07 · Ink on Vacuum — the right dock is ONE column, not three widths =====
     Every surface in the dock is width:100% against a single owner (--sf-dock-w). Before J07
     the roster and target card were hard-coded 232px while the radar was 180px and right-aligned,
     which is what read on screen as a staggered overhang; and .sf-target__bars was a fixed 220px
     inside a 212px content box, so it overhung the card by 9px at every viewport. One number now
     decides the column, and --sf-radar-size is pinned to radar.js COMPACT_SIZE by
     test/j07-hud-contract.test.mjs so the canvas can never drift from its dial again. */
  #hud {
    --sf-dock-w: 220px;
    --sf-radar-size: 220px;
    --sf-brk-col: rgba(148,178,205,.42);
    /* Chromeless text needs a per-glyph scrim, not a card. Same idiom as .sf-firstuse. */
    --sf-ink: ${INK_SHADOW};
  }
  .sf-rightdock { right:calc(12px + var(--sf-safe-inset-x, 0px)); bottom:12px; width:var(--sf-dock-w); align-items:stretch; gap:9px; }
  .sf-rightdock > * { flex:0 0 auto; width:100%; }
  .sf-overview {
    width:100%; gap:0; padding:3px 0;
    background:none; border:none; border-radius:0; box-shadow:none !important;
    font-family:var(--hud-data); font-size:10px; overflow:hidden;
    ${bracketCss()}
  }
  .sf-overview::before {
    content:'LOCAL CONTACTS'; display:block; padding:3px 10px 6px; color:var(--hud-muted);
    font-family:var(--hud-display); font-size:8px; font-weight:700; letter-spacing:.18em;
    border-bottom:1px solid rgba(148,178,205,.14);
  }
  .sf-overview-row {
    min-height:26px; padding:3px 8px; background:transparent; border-left:0; border-bottom:1px solid rgba(148,178,205,.08);
  }
  .sf-overview-row:hover { background:rgba(78,195,230,.06); border-left:0; }
  .sf-overview-row.selected {
    background:linear-gradient(90deg, rgba(78,195,230,.14), rgba(78,195,230,.02));
    border-left:0; box-shadow:inset 2px 0 var(--hud-cyan);
  }
  .sf-overview-row__name { max-width:92px; color:var(--hud-paper); }
  .sf-overview-row__right { color:var(--hud-muted); }
  .sf-overview-row__detail { color:var(--hud-muted); padding-left:14px; }
  .sf-overview-footer { background:transparent; color:var(--hud-muted); }
  .sf-target {
    width:100%; padding:8px 10px 9px; text-align:left; gap:5px;
    background:none; border:none; border-radius:0; box-shadow:none !important;
    ${bracketCss()}
  }
  /* The card's identity was a 2px red top border on an opaque plate. De-boxed, that identity moves
     to the threat badge (targetPanel.js) — a shape, not a plate edge. */
  .sf-overview, .sf-target, .sf-radar-objective-key { text-shadow:var(--sf-ink); }
  .sf-overview-row__name, .sf-overview-row__right, .sf-overview-row__detail,
  .sf-overview-row__state, .sf-overview-row__tier, .sf-overview-footer,
  .sf-target__name, .sf-target__meta, .sf-target__faction { text-shadow:var(--sf-ink); }
  /* Muted grey was a legible "secondary" against an opaque plate. Against the actual render — a
     lit gas giant fills this corner in the reference sector — it disappears. Captured, not
     assumed: the range readout was unreadable over the planet limb at 1440x900. De-boxing raises
     the floor for every muted token in the dock. */
  .sf-overview::before, .sf-overview-row__right, .sf-overview-row__detail,
  .sf-overview-row__state, .sf-overview-row__tier, .sf-overview-footer,
  .sf-target__meta { color:#b9c8d8; }
  .sf-overview-row__name, .sf-target__name { color:#f2f7fc; }
  .sf-target__head, .sf-target__meta { justify-content:space-between; }
  /* J07 threat badge: the card's identity used to be a 2px red plate edge, which said "target" but
     never said "how bad". Tier is carried by the WORD and by the pip count, with colour third, so it
     survives forced-colors and colour-blind play unchanged. */
  .sf-target__threat { display:flex; align-items:center; gap:7px; padding:2px 0 3px; }
  .sf-target__threat[hidden] { display:none !important; }
  .sf-target__threat-pips { font-family:var(--hud-data); font-size:12px; letter-spacing:.16em; color:var(--hud-muted); }
  .sf-target__threat-word {
    font-family:var(--hud-display); font-size:12px; font-weight:700; letter-spacing:.14em;
    color:var(--hud-paper); text-shadow:var(--sf-ink);
  }
  .sf-target__threat[data-tier]::before {
    content:''; width:3px; align-self:stretch; background:var(--hud-muted);
  }
  /* Tiers are the NUMBERS scanner.js emits (1/2/3), not adjectives. Selecting on words here would
     have matched nothing while looking entirely correct -- pinned by check:hud-j07. */
  .sf-target__threat[data-tier="3"]::before { background:var(--hud-red, #e0665f); }
  .sf-target__threat[data-tier="3"] .sf-target__threat-pips { color:var(--hud-red, #e0665f); }
  .sf-target__threat[data-tier="2"]::before { background:var(--hud-amber, #dfa04e); }
  .sf-target__threat[data-tier="2"] .sf-target__threat-pips { color:var(--hud-amber, #dfa04e); }
  /* Range as a length. The numeral stays for precision; the bar is what you read at a glance. */
  .sf-target__rangerow { display:flex; align-items:center; gap:8px; }
  .sf-target__rangebar { position:relative; flex:1; height:3px; background:rgba(164,181,197,.16); overflow:hidden; }
  .sf-target__rangefill {
    display:block; height:100%; width:100%; transform-origin:left center; transform:scaleX(0);
    background:var(--hud-cyan, #4ec3e6);
  }
  .sf-target__dist { font-family:var(--hud-data); font-size:12px; color:var(--hud-paper); text-shadow:var(--sf-ink); }

  /* ===== J07 type floor: nothing on the flight layer below 12px (SCREENS_A 14.2) =====
     The layer was carrying ~100 elements under the floor, bottoming out at 7.5px -- small enough
     that the Power Rail's own slot names were unreadable at arm's length on the very surface whose
     job is to say "here is what you can do". The rule is TYPE NEVER SHRINKS; content is dropped
     instead, so nothing here reflows by making labels smaller.
     Declared last so it beats the three earlier cascade layers that set these sizes, and scoped to
     #hud so station screens (which have their own density budget) are untouched. */
  #hud .sf-barrow__label, #hud .sf-barrow__num,
  #hud .sf-prail__label, #hud .sf-pslot__name, #hud .sf-pslot__key,
  #hud .sf-condition-metrics, #hud .sf-cond-stat, #hud .sf-cond-hull-val, #hud .sf-cond-shd-val,
  #hud .sf-stat__k, #hud .sf-radar-objective-key,
  #hud .sf-comm__tag, #hud .sf-comm__sender,
  #hud .sf-ob-kicker, #hud .sf-ob-count,
  #hud .sf-law__head, #hud .sf-law__meta, #hud .sf-law__jurisdiction,
  #hud .sf-target__meta, #hud .sf-target__range, #hud .sf-target__closing,
  #hud .sf-overview, #hud .sf-overview::before, #hud .sf-overview-row,
  #hud .sf-overview-row__left, #hud .sf-overview-row__name, #hud .sf-overview-row__right,
  #hud .sf-overview-row__state, #hud .sf-overview-row__tier, #hud .sf-overview-row__detail,
  #hud .sf-overview-footer,
  #hud .sf-mt-title, #hud .sf-mt-time, #hud .sf-nav-label, #hud .sf-nav-meta,
  #hud .sf-tri__k, #hud .sf-tchip__hint, #hud .sf-wpn-heat__name {
    font-size:12px;
  }
  /* The label columns were sized for 7.5-8.5px glyphs and clip at 12px. Widen them to fit the type
     rather than shrink the type to fit them -- measured at 1440x900 and 1280x720. */
  #hud .sf-barrow__label { width:52px; }
  #hud .sf-barrow__num { width:46px; }
  #hud .sf-overview-row__name { max-width:104px; }
  /* Second pass, from a re-measure: these six survived because they are set in their own modules'
     stylesheets rather than in this file. Measuring the rendered layer is the only way to find
     them -- reading any single stylesheet would have declared the job done at the first pass. */
  #hud .sf-ob-kicker, #hud .sf-band-hud__button, #hud .ml2-preview,
  #hud .sf-law__detail, #hud .sf-condition-head { font-size:12px; }

  /* Raising the type is only half the rule. SCREENS_A: TYPE NEVER SHRINKS, CONTENT IS DROPPED --
     so where 12px no longer fits, the CONTENT gives way. Captured at 1440x900: without these three
     the rail labels ran into each other ("ORDNANCE ORDNANCE ORDNANCE"), the law receipt's headline
     wrapped into the band pill, and the target card's range numeral collided with its band word. */
  #hud .sf-pslot__name {
    max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:center;
  }
  #hud .sf-prail__label { white-space:nowrap; }
  #hud .sf-law__head { flex-wrap:wrap; row-gap:2px; }
  #hud .sf-law__headline { line-height:1.25; }
  #hud .sf-target__meta { gap:10px; margin-top:2px; }
  #hud .sf-target__range { white-space:nowrap; }
  .sf-target__name { font-family:var(--hud-display); font-size:12px; font-weight:700; letter-spacing:.045em; color:var(--hud-paper); }
  .sf-target__faction, .sf-target__meta, .sf-target__identity, .sf-target__intent { font-family:var(--hud-data); }
  .sf-target__meta { font-size:9px; color:var(--hud-muted); }
  .sf-target .sf-bar--sm, .sf-target .sf-bar { height:3px; background:rgba(164,181,197,.13); }
  /* The radar was 180px and right-aligned inside a 232px column, leaving a 52px notch down the
     left of the dock — the actual visible stagger. It is now the full column width and centred,
     so the dock reads as one edge. */
  .sf-radar-wrap { align-items:center; }
  .sf-radar { width:var(--sf-radar-size); height:var(--sf-radar-size);
    border:1px solid rgba(148,178,205,.22); box-shadow:none; background:none; }
  .sf-radar-objective-key { width:100%; color:var(--hud-amber); font-family:var(--hud-display); font-weight:700; font-size:8px; letter-spacing:.14em; }

  .sf-toast {
    width:100%; padding:2px 0; border:none; background:none; box-shadow:none;
    color:var(--hud-paper); font-family:var(--hud-data); font-size:13px; line-height:1.3;
  }
  .sf-ml-instrument { width:100%; margin-top:4px; }
  .sf-ml-instrument[hidden] { display:none !important; }
  .sf-ml-instrument__row { display:flex; align-items:center; gap:8px; }
  .sf-ml-instrument__k { font-family:var(--hud-display); font-size:10px; letter-spacing:.1em; color:var(--hud-muted); }
  .sf-ml-instrument__track { flex:1; height:3px; background:rgba(164,181,197,.18); }
  .sf-ml-instrument__fill { display:block; height:100%; width:100%; transform-origin:left center; background:var(--hud-amber, #dfa04e); }
  .sf-ml-instrument__v { font-size:11px; color:var(--hud-paper); }
  .sf-ml-instrument__release { text-align:center; font-size:11px; letter-spacing:.12em; color:var(--hud-amber, #dfa04e); margin-top:3px; }
  .sf-firstuse {
    position:absolute; left:0; top:0; max-width:240px; padding:2px 0;
    color:var(--hud-paper); font-family:var(--hud-data); font-size:13px;
    text-shadow:0 1px 3px #000; pointer-events:none; white-space:nowrap;
  }
  .sf-firstuse[hidden] { display:none !important; }
  .sf-toast__icon { font-family:var(--hud-data); color:var(--hud-cyan); }
  .sf-toast--success, .sf-toast--good, .sf-toast--error, .sf-toast--danger, .sf-toast--warn { border-left-width:1px; }
  .sf-alert {
    min-width:220px; justify-content:center; padding:7px 18px; border-radius:2px;
    font-family:var(--hud-display); font-size:11px; font-weight:700; letter-spacing:.1em;
    background:linear-gradient(90deg, rgba(9,15,24,.68), rgba(18,27,39,.92), rgba(9,15,24,.68));
    border:1px solid rgba(148,178,205,.26); border-top-color:rgba(78,195,230,.4);
    box-shadow:0 10px 26px rgba(0,0,0,.28);
  }
  .sf-alert--dock { font-size:14px; padding:9px 24px; border-radius:2px; }

  @media (max-width:1180px) {
    .sf-command-deck { width:min(320px, calc(100vw - 560px)); min-width:200px; }
  }
  @media (max-width:900px), (max-height:650px) {
    .sf-leftstack { left:calc(10px + var(--sf-safe-inset-x, 0px)); bottom:72px; width:236px; }
    .sf-bars { width:236px; grid-template-columns:80px minmax(0, 1fr); padding:8px 9px 9px; }
    .sf-schematic { width:72px; height:72px; }
    .sf-schematic .sf-sch-ring { inset:0; width:72px; height:72px; }
    .sf-sch-ship-wrap { width:50px; height:60px; }
    .sf-sch-ship { width:50px; height:60px; }
    .sf-sch-ship--fill { width:50px; height:60px; }
    /* One number still owns the column at every breakpoint — the children stay width:100%.
       The canvas is always drawn at COMPACT_SIZE, so any breakpoint that narrows the dial MUST
       scale the canvas with it or the drawing is clipped by the dial's overflow:hidden. Pinned by
       test/j07-hud-contract.test.mjs, which caught exactly that when this rule was first written. */
    #hud { --sf-dock-w:200px; --sf-radar-size:200px; }
    .sf-radar canvas { width:200px !important; height:200px !important; }
    .sf-rightdock { right:calc(10px + var(--sf-safe-inset-x, 0px)); bottom:72px; }
    .sf-overview-row__name { max-width:64px; }
    .sf-command-deck { bottom:8px; width:min(360px, calc(100vw - 24px)); min-width:0; }
    .sf-cluster { position:relative; left:auto; bottom:auto; width:auto; transform:none; }
  }
  @media (max-width:760px) {
    .sf-command-deck { padding:6px 9px; }
    .sf-cluster { margin:0; padding:0; }
    .sf-mission-tracker { max-width:none; }
  }
  @media (prefers-reduced-motion:reduce) {
    .sf-schematic.sf-sch-critical .sf-sch-ship--fill,
    .sf-schematic.sf-sch-hit .sf-sch-ship-wrap,
    .sf-gravity-mark__ring { animation:none; }
    .sf-lockring.sf-lockring--latch { animation:none; }
    .sf-sch-ship-fill-crop, .sf-sch-fill-line, .sf-sch-shield { transition:none; }
  }

  /* ===== dock transition overlay ===== */
  .sf-dock-fade { position:fixed; inset:0; z-index:2500; pointer-events:none;
    background:radial-gradient(ellipse at 50% 60%, rgba(5,7,13,0) 0%, rgba(5,7,13,1) 70%);
    opacity:0; transition:opacity 0.4s ease-in-out; }
  .sf-dock-fade[hidden] { display:none!important; }
  .sf-dock-fade.active { opacity:1; }
  #sf-dock-overlay.sf-administrative-blackout { background:#05070d; }

  /* ===== HUD/scene integration pass =====
     Independent review scored ui_integration 3/5 with "the HUD reads like flat webpage panels placed
     over the render: many rectangular boxes, high cyan strokes... little relationship to scene
     lighting or focal hierarchy". Its fix was to reduce panel opacity and border dominance, align HUD
     brightness to the scene grade, and reserve strong cyan for actionable state.

     Done here as a trailing override rather than by editing the shared tokens in styles/ui.css,
     because those tokens are global and the station screens depend on them. Layout, sizes, positions
     and the authored "holographic-bleak" character are untouched — this only changes how hard the
     surfaces sit on top of the render. Every rule is scoped to a HUD class. */
  .sf-cargo-panel, .sf-contacts, .sf-weapon-panel, .sf-shipcond {
    backdrop-filter: blur(2px);
  }
  /* Panel fills: the render now carries a lifted black floor, so a near-opaque panel reads as a hole
     punched in the frame. Dropping toward half opacity lets the scene sit behind the glass.
     J07: the mission tracker left this set — it is de-boxed above and this trailing rule was
     silently re-plating it. Three stylesheets set that selector; only the last one was visible. */
  .sf-cargo-panel, .sf-contacts { background:rgba(6,10,20,.55); }
  /* Borders: keep the edge legible but stop it drawing a hard rectangle around every element. */
  .sf-cargo-panel, .sf-contacts, .sf-weapon-panel {
    border-color:color-mix(in srgb, var(--panel-edge) 55%, transparent);
  }
  /* Passive text recedes; strong cyan is reserved for actionable state, which keeps its own rules. */
  .sf-contacts .sf-contact__meta, .sf-cargo-empty { opacity:.82; }

  /* ══ J06 THE POWER RAIL ════════════════════════════════════════════════════════════════════
     Bottom-centre 1-9 rank in three bands. See src/ui/powerRail.js for the band contract.

     The cooldown sweep is a CSS animation on stroke-dashoffset, with its duration written once
     by JS when the cooldown starts. This is deliberate: check:ui-frame-sleep asserts the UI stops
     doing frame work at rest, and nine slots repainting a radial every frame is precisely what
     that check exists to prevent. Nothing here needs a rAF.  */
  @keyframes sf-pslot-sweep { from { stroke-dashoffset:0; } to { stroke-dashoffset:81.68; } }

  /* The rail is the permanent floor of the HUD, so it owns the bottom strip and .sf-command-deck
     sits above it (see the bottom:88px override below). padding-bottom reserves room for the slot
     name labels, which hang 11px BELOW their slot box — without it they render past the viewport
     edge and every slot ships unlabelled. */
  .sf-prail { position:absolute; left:calc(50% + (var(--sf-safe-inset-x, 0px) * 0)); bottom:10px; transform:translateX(-50%);
    display:flex; gap:14px; align-items:flex-end; pointer-events:none; z-index:6;
    padding-bottom:14px; }
  .sf-prail__band { display:flex; flex-direction:column; align-items:center; gap:3px; }
  .sf-prail__label { font-family:var(--hud-display); font-size:7.5px; letter-spacing:.18em;
    color:var(--hud-steel); opacity:.7; }
  .sf-prail__slots { display:flex; gap:4px; }

  .sf-pslot { position:relative; width:38px; height:38px; padding:0; border:1px solid var(--hud-edge);
    background:rgba(4,10,18,.55); color:var(--hud-paper); display:flex; flex-direction:column;
    align-items:center; justify-content:center; cursor:default; }
  .sf-pslot__key { position:absolute; top:1px; left:3px; font-family:var(--hud-data); font-size:8px;
    line-height:1; color:var(--hud-steel); }
  .sf-pslot__art { display:flex; align-items:center; justify-content:center; }
  .sf-pslot__art svg { display:block; }
  .sf-pslot__name { position:absolute; bottom:-11px; font-family:var(--hud-data); font-size:7.5px;
    letter-spacing:.06em; color:var(--hud-steel); white-space:nowrap; }
  .sf-pslot__sweep { position:absolute; inset:3px; width:calc(100% - 6px); height:calc(100% - 6px);
    transform:rotate(-90deg); pointer-events:none; }
  .sf-pslot__sweep circle { fill:none; stroke:var(--hud-amber); stroke-width:1.6; opacity:0; }

  /* Slot states. Colour is never the only channel — border weight and the name label move too, so
     a locked slot and a ready slot differ under every colourblind mode. */
  .sf-pslot[data-state="ready"] { border-color:var(--hud-edge); }
  .sf-pslot[data-state="armed"] { border-color:var(--hud-amber); box-shadow:inset 0 0 0 1px var(--hud-amber); }
  .sf-pslot[data-state="cooling"] { opacity:.72; }
  .sf-pslot[data-state="cooling"] .sf-pslot__sweep circle { opacity:.95; }
  .sf-pslot[data-state="unaffordable"] { opacity:.5; border-style:dashed; }
  .sf-pslot[data-state="locked"] { opacity:.42; border-style:dotted; }
  .sf-pslot[data-state="locked"] .sf-pslot__art { opacity:.5; }
  /* An empty socket stays VISIBLE. A gap the player can see reads as "this fills in later";
     a hidden gap reads as "there is nothing here", which is the lie J06 exists to correct. */
  .sf-pslot[data-state="empty"] { border-style:dashed; border-color:var(--hud-edge);
    opacity:.34; background:none; }
  .sf-pslot[data-state="empty"] .sf-pslot__art { opacity:.35; }

  /* Under a FULL claim the rail is answering a prompt, so it stops advertising powers. */
  .sf-prail[data-claimed="FULL"] .sf-prail__label { opacity:.3; }
  .sf-prail[data-claimed] .sf-pslot__name { color:var(--hud-amber); }

  /* Lift the instrument deck clear of the rail. Measured, not guessed: the rail occupies 10-77px
     from the viewport floor at 1280x720, and .sf-command-deck previously sat at bottom:12px — so
     the two overlapped exactly and both became unreadable. This override must stay AFTER the
     .sf-command-deck rule above it; this stylesheet resolves several selectors by source order. */
  .sf-command-deck { bottom:88px; }

  @media (max-width:1180px) {
    .sf-pslot { width:32px; height:32px; }
    .sf-prail { gap:10px; }
    .sf-command-deck { bottom:80px; }
  }
  @media (max-width:900px), (max-height:650px) {
    .sf-command-deck { bottom:76px; }
  }

  `;
  document.head.appendChild(s);
}

function syncModalChrome(screenOpen, externalModalOpen = false, liveOverlay = false) {
  // liveOverlay: screens are open but non-pausing over a running sim — no modal chrome, the body
  // class is `ui-live-screen` (owned by screenManager); only the shared backdrop still shows.
  const modalOpen = !!((screenOpen && !liveOverlay) || externalModalOpen);
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
