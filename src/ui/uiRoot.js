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
import { mountWhyReveal } from './whyReveal.js';
import { createUiInput } from './input.js';
import { initPriceHistory } from './priceHistory.js';
import { isConfirmOpen } from './confirm.js';
import { setPromptScheme, setPromptBindings } from './controlPrompts.js';
import { injectHudCss } from './views/hudStyles.js';
import { isHostileToPlayer, SCANNER_CONTACT_RANGE } from '../systems/scanner.js';
import { presentationAllowsPlayerFacingAction } from '../core/presentationAdmission.js';
import { verbAcceptsType, stableEntityKey } from '../data/interactionDescriptorCatalog.js';
import { listSelectableComponents, nextComponentSelection } from '../systems/interactionDescriptors.js';
import { createCinematicInputFence } from './cinematicInputFence.js';
import { isMapScreenId, openGalaxyMap } from './mapAuthority.js';
import { IS_DEV } from '../core/devMode.js';
import { installSandboxGameStartedHook } from './sandbox/sandboxSetup.js';
import { bindSound, bindTemperature } from './kit/index.js';

// Clean inline UI art (replaces the captioned reference-sheet .jpg assets that rendered text).
const RETICLE_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;overflow:visible">
  <g class="sf-reticle-shape sf-reticle-shape--open" fill="none" stroke="#4f8fdd" stroke-width="2" stroke-linecap="round">
    <circle cx="50" cy="50" r="30" opacity="0.85"/>
    <circle cx="50" cy="50" r="40" opacity="0.18"/>
    <line x1="50" y1="6" x2="50" y2="20"/><line x1="50" y1="80" x2="50" y2="94"/>
    <line x1="6" y1="50" x2="20" y2="50"/><line x1="80" y1="50" x2="94" y2="50"/>
  </g>
  <g class="sf-reticle-shape sf-reticle-shape--bracket" fill="none" stroke="#4f8fdd" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="50" y1="34" x2="50" y2="42"/><line x1="50" y1="58" x2="50" y2="66"/>
    <line x1="34" y1="50" x2="42" y2="50"/><line x1="58" y1="50" x2="66" y2="50"/>
    <path d="M26 34h12V22"/><path d="M74 34H62V22"/>
    <path d="M26 66h12v12"/><path d="M74 66H62v12"/>
  </g>
  <circle cx="50" cy="50" r="3" fill="#4f8fdd"/>
  <g class="sf-reticle-hit-ticks" fill="none" stroke-width="2.5" stroke-linecap="round">
    <line x1="39" y1="39" x2="31" y2="31"/>
    <line x1="61" y1="39" x2="69" y2="31"/>
    <line x1="39" y1="61" x2="31" y2="69"/>
    <line x1="61" y1="61" x2="69" y2="69"/>
  </g>
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
  // installStationExitGate; shared helpers live in src/ui/station/.
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
  { path: './screens/crucible.js', load: () => import('./screens/crucible.js'), name: 'crucibleScreen' },
  { path: './screens/crucible.js', load: () => import('./screens/crucible.js'), name: 'crucibleResultsScreen' },
  { path: './screens/settings.js', load: () => import('./screens/settings.js'), name: 'settingsScreen' },
  { path: './screens/saveLoad.js', load: () => import('./screens/saveLoad.js'), name: 'saveLoadScreen' },
  { path: './screens/help.js', load: () => import('./screens/help.js'), name: 'helpScreen' },
  // CREDITS (Frontend Task B §1.6): who made SpaceFace and what it is built on; the third-party
  // notices from PQ-033.00. Reached from the title's fine line.
  { path: './screens/credits.js', load: () => import('./screens/credits.js'), name: 'creditsScreen' },
  { path: './screens/codex.js', load: () => import('./screens/codex.js'), name: 'codexScreen' },
  { path: './screens/missionLog.js', load: () => import('./screens/missionLog.js'), name: 'missionLogScreen' },
  // DEV ONLY — Sandbox testing harness (src/ui/screens/sandbox.js). Conditionally spread so the
  // dynamic import and the module never enter build/web when IS_DEV folds false at build time.
  ...(IS_DEV ? [{ path: './screens/sandbox.js', load: () => import('./screens/sandbox.js'), name: 'sandboxScreen' }] : []),
];


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
    if (this.whyReveal && typeof this.whyReveal.destroy === 'function') this.whyReveal.destroy();
    this.whyReveal = null;
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
    // The frontend kit (design/frontend/direction/KIT_SPEC.md §5, §8, §11.1): one sound binding
    // onto the existing audio:cue bus and one temperature binding that sets html[data-k-temp]
    // from the game's state. A screen never sets either itself.
    if (typeof this._kitSoundDispose === 'function') { try { this._kitSoundDispose(); } catch (_) {} }
    if (this._kitTemperature && typeof this._kitTemperature.dispose === 'function') { try { this._kitTemperature.dispose(); } catch (_) {} }
    try { this._kitSoundDispose = bindSound(ctx.bus); } catch (e) { console.warn('[ui] kit sound bind failed', e); }
    try { this._kitTemperature = bindTemperature(ctx.bus, ctx.state); } catch (e) { console.warn('[ui] kit temperature bind failed', e); }

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

    // Tier 2 "why" (INSTRUMENT_GRAMMAR §7): ONE delegated capture reveal for every `[data-why]`
    // carrier — causeLedger's market tooltip generalised (whyReveal.js). Hover AND keyboard focus,
    // never a click. Mounted at document level so station workspace and modal screens share it.
    if (this.whyReveal && typeof this.whyReveal.destroy === 'function') this.whyReveal.destroy();
    this.whyReveal = mountWhyReveal();

    // No sound on mouse hover (frontend direction sheet §7 / Task D §4.1): the kit's `move` cue
    // fires on keyboard focus movement only. The `sfx_ui_hover` recipe stays — commsRadial and the
    // audio system's kill-confirm chirp still play it.

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

    let hitTickTimeout = null;
    const triggerHitTick = (kind) => {
      const el = document.getElementById('aim-reticle') || reticle;
      if (!el) return;
      el.dataset.hit = kind;
      if (hitTickTimeout) clearTimeout(hitTickTimeout);
      const durationMs = kind === 'kill' ? 240 : 130;
      hitTickTimeout = setTimeout(() => {
        delete el.dataset.hit;
      }, durationMs);
    };

    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('combat:damage', (payload) => {
        if (!payload || payload.attackerId !== this.state?.playerId) return;
        if (payload.targetId === this.state?.playerId) return;
        const isShield = !!(payload.shieldHit && payload.shieldDamage > 0);
        triggerHitTick(isShield ? 'shield' : 'hull');
      });

      this.bus.on('entity:killed', (payload) => {
        if (!payload || payload.killerId !== this.state?.playerId) return;
        if (payload.id === this.state?.playerId) return;
        triggerHitTick('kill');
      });
    }
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
    setPromptBindings(this.state);
    this.bus.on('settings:changed', () => {
      setPromptScheme(this.state && this.state.settings && this.state.settings.gameplay
        && this.state.settings.gameplay.controlScheme);
      setPromptBindings(this.state);
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
      vid.style.cssText = 'max-width:100%;max-height:82vh;border:1px solid #3d4754;box-shadow:0 14px 44px rgba(0,0,0,.6);';
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
      // full modal treatment here. The plain two-input reconciliation is the pinned K1 lifecycle
      // landmark; only a live overlay takes the softened third input.
      const liveOverlay = !!(this.screenManager && this.screenManager.isLiveOverlay
        && this.screenManager.isLiveOverlay());
      if (liveOverlay) syncModalChrome(screenOpen, externalOpen, liveOverlay);
      else syncModalChrome(screenOpen, externalOpen);
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
      // then eases back on its own. The dock sound is the audio system's own on dock:docked
      // (audioSystem._onDocked: the re-tuned sfx_dock_clunk swell, then a low confirm); no UI cue
      // here, or the chime plays twice (Frontend Task C §1.2).
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
      // A Crucible death is the end of a scored run, not a ship loss with a recovery berth. The
      // run's own results surface opens from run:resultsReady below; the after-action screen with
      // its "continue from the recovery dock" offer would be nonsense in an arena.
      if (this._survivalRunLive()) return;
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
    // CRUCIBLE (PQ-133 CRU-018): results open for BOTH endings — a death (run:ended) and a
    // victory (a terminal phase transition, which emits no run:ended).
    this.bus.on('run:resultsReady', (payload) => {
      // An abort is the player walking out through the pause menu, which closes every screen and
      // replaces them with the main menu in the same handler chain — so a results plate pushed here
      // is built and destroyed in one breath. They chose to leave; do not flash a scoreboard at them.
      // Exception: the arena failing to build a wave also publishes 'aborted' (stopReason
      // 'wave_plan_failed'), and that one MUST open the plate — it is the loud end of the run that
      // explains the stop, and without it the player sits in an empty arena with no message.
      if (payload && payload.outcome === 'aborted' && payload.stopReason !== 'wave_plan_failed') return;
      if (this._crucibleResultsShown) return;
      this._crucibleResultsShown = true;
      const tryOpen = (attempts) => {
        if (this._registeredScreens && this._registeredScreens.has('crucibleResults')) {
          try { this.screenManager.pushScreen('crucibleResults'); }
          catch (e) { console.error('[ui] open crucibleResults', e); }
          return;
        }
        if (attempts > 60) { console.warn('[ui] crucibleResults screen never registered'); return; }
        setTimeout(() => tryOpen(attempts + 1), 50);
      };
      tryOpen(0);
    });
    this.bus.on('run:started', () => { this._crucibleResultsShown = false; });
    this.bus.on('game:started', () => { this._crucibleResultsShown = false; });
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

  /** True while a Survival run is live — used to route death to the Crucible results surface. */
  _survivalRunLive() {
    const run = this.state && this.state.run;
    return !!(run && run.kind === 'survival' && run.phase !== 'inactive');
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
          if (!this._hudVisibleLast && this.hud.forceRefresh) {
            this.hud.forceRefresh();
            // Moment 3 (Task B §2.3): the HUD arrives on undock — only when the HUD was hidden by
            // the dock, not by a pause screen or a menu.
            if (this._hudHiddenByDock && typeof this.hud.arrive === 'function') this.hud.arrive();
          }
          this._hudHiddenByDock = false;
          this.hud.frame(dt);
        } else {
          this._hudHiddenByDock = docked;
          if (this.hud.tickHidden) this.hud.tickHidden(dt);
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
    if (this.whyReveal && typeof this.whyReveal.destroy === 'function') this.whyReveal.destroy();
    this.whyReveal = null;
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
