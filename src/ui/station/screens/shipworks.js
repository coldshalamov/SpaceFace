// src/ui/station/screens/shipworks.js — "Shipworks": ship sales + outfitter (fit
// modules) merged around ONE central ship preview. Fleet/Buy modes on the left; the ship is the
// hero object; slots are clickable — clicking one dims the room and reveals compatible modules.
// One reused preview mount (createShipPreviewMount) = the perf fix vs. a renderer-per-open.
// Emits ui:buyShip / ui:setActiveShip / ui:sellShip / ui:buyModule / ui:fitModule / ui:unfitModule.
//
// Engineering numbers come only from presenters/engineeringPreview.js → ships.getDerivedStats.
// Never invent simplified fittings/geometry or raw module.mods key diffs as flight stats.
import {
  buildSlotList,
  dryRunLoadoutPresetApply,
  findMasslineHeadConflict,
  fits,
  getDerivedStats,
  shipworksStationAccess,
} from '../../../systems/ships.js';
import { SHIPS } from '../../../data/ships.js';
import { SHIP_SILHOUETTES } from '../../../data/shipSilhouettes.js';
import { SECTORS } from '../../../data/sectors.js';
import { MODULES } from '../../../data/modules.js';
import { WEAPONS } from '../../../data/weapons.js';
import { escapeHtml } from '../../comms.js';
import { confirm, isConfirmOpen } from '../../confirm.js';
import { describeOutfittingSpendConfirm } from '../../outfittingSpendConfirm.js';
import { icon } from '../icons.js';
import {
  createShipPreviewMount,
  dockInteriorIdForArchetype,
} from '../../shipPreviewMount.js';
import { autoUpdate, computePosition, flip, offset, shift, size } from '@floating-ui/dom';
import { createCircularGauge, createRouteBeam } from '../../effects/index.js';
import { prefersReducedMotion } from '../../effects/effectRuntime.js';
import { planGaugeSettle } from '../../effects/gaugeSettle.js';
import { mountDataState, settleDataState } from '../../uiPrimitives.js';
import {
  formatPreviewDelta,
  presentModuleFitPreview,
  presentShopModuleDelta,
  stockPreviewPlayer,
} from '../../presenters/engineeringPreview.js';
import { buildMassDelta } from '../../panels/massDelta.js';
import { handlingProfileDomain } from '../../panels/handlingProfile.js';
import { SHIP_ENGINEERING_GAUGE_DEFS } from '../../shipEngineeringStage.js';
import {
  capabilityBandModel,
  conditionFromEntity,
  handlingBandModel,
  scarCalloutsForHull,
} from '../../ship/shipBandModels.js';
import {
  buildLoadoutPresetRailModel,
  sanitizePresetSelectionMap,
} from '../../ship/loadoutPresets.js';

const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const STATION_ARCHETYPE_BY_ID = new Map();
for (const sector of SECTORS) {
  for (const station of sector.stations || []) {
    STATION_ARCHETYPE_BY_ID.set(station.id, station.archetypeGlb || null);
  }
}
const CENTERED_SHIP_YAW = 0;
const FITTABLE = MODULES.concat(WEAPONS);
const FITTABLE_BY_ID = new Map(FITTABLE.map((d) => [d.id, d]));

const SLOT_ICON = { weapon: 'target', shield: 'hull', engine: 'refuel', cargo: 'cargo', mining: 'industry', utility: 'spark' };
const SLOT_LABEL = { weapon: 'Weapon', shield: 'Shield', engine: 'Engine', cargo: 'Cargo', mining: 'Mining', utility: 'Utility' };

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
const shipName = (id) => { const s = SHIP_BY_ID.get(id); return s ? s.name : id; };
const GAUGE_DEFS = SHIP_ENGINEERING_GAUGE_DEFS.slice();
const UI_SWITCH_DETENT_CUE = 'sfx_ui_switch_detent';
const UI_DRAWER_LATCH_CUE = 'sfx_ui_drawer_latch';

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function withCargoMass(player, usedMass) {
  const source = player && typeof player === 'object' ? player : {};
  return {
    ...source,
    cargo: {
      ...(source.cargo && typeof source.cargo === 'object' ? source.cargo : {}),
      usedMass: Math.max(0, finite(usedMass, 0)),
    },
  };
}

function plusMinus(value, digits = 1) {
  const scale = Math.pow(10, digits);
  const rounded = Math.round(finite(value, 0) * scale) / scale;
  if (!Number.isFinite(rounded) || Object.is(rounded, -0)) return '0';
  const text = Number.isInteger(rounded) ? String(rounded) : String(rounded.toFixed(digits));
  return rounded > 0 ? `+${text}` : text;
}

function whyAttr(text) {
  if (!text || !String(text).trim()) return '';
  return ` data-why="${escapeHtml(String(text))}"`;
}

function gaugeNorm(key, raw, stats) {
  if (key === 'mass') return clamp01(finite(raw, 0) / 250);
  if (key === 'capMax') return clamp01(finite(raw, 0) / 600);
  if (key === 'shieldMax') return clamp01(finite(raw, 0) / 800);
  if (key === 'cargoCap') return clamp01(finite(raw, 0) / 400);
  if (key === 'maxSpeed') return clamp01(finite(raw, 0) / 350);
  if (key === 'continuousDrain') {
    const regen = Math.max(1, finite(stats && stats.capRegen, 1) * 1.5);
    return clamp01(finite(raw, 0) / regen);
  }
  return 0;
}

export function shipworksDockIdForState(state) {
  const stationId = state && state.ui && state.ui.dockedStationId;
  return dockInteriorIdForArchetype(STATION_ARCHETYPE_BY_ID.get(stationId) || null);
}

export function syncShipworksDockForState(mount, state) {
  const dockId = shipworksDockIdForState(state);
  if (mount && typeof mount.setDockId === 'function') mount.setDockId(dockId);
  return dockId;
}

/** Pure action projection used by the screen and focused authority tests. The bay remains
 * inspectable at limited berths; only unsupported physical operations are disabled. */
export function shipworksActionAvailability(state) {
  const access = shipworksStationAccess(state);
  return {
    hullEnabled: access.hull,
    outfitEnabled: access.outfit,
    hullLabel: access.hull ? 'Shipyard service available' : access.hullReason,
    outfitLabel: access.outfit ? 'Outfitting service available' : access.outfitReason,
  };
}
const titleCaseWords = (value) => String(value || '').replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

function researched(state) {
  const r = state && state.player && (state.player.researchedNodes || state.player.researched);
  return new Set(Array.isArray(r) ? r : []);
}
function moduleLocked(d, state) { return !!(d.requiresTech && !researched(state).has(d.requiresTech)); }

function fittedIdentityLine(def) {
  if (!def) return '';
  const parts = [];
  if (def.size) parts.push(String(def.size));
  if (def.tier != null) parts.push('T' + def.tier);
  return parts.join(' · ');
}

// Silhouettes moved to src/data/shipSilhouettes.js so the flight HUD can draw the player's
// actual hull without importing this station screen. One table, two consumers.

function shipSilhouette(def) {
  const body = SHIP_SILHOUETTES[def && def.id] || SHIP_SILHOUETTES.ship_kestrel;
  return `<svg class="sx-shipmark" viewBox="0 0 48 28" aria-hidden="true" focusable="false">${body}</svg>`;
}

export function createShipworksScreen(ctx) {
  // Dock host (station destination): the shared stage locked to commerce. One module instance and
  // one WebGL mount serve this dock destination AND the in-flight 'ship' screen (SCREENS_B §0.5) —
  // whoever shows last re-parents the same node; nobody re-creates the mount. Dispose is a no-op
  // on purpose: the station shell caches and tears down destinations, but the shared stage outlives
  // any single host and must never be disposed by one of them.
  const stage = getSharedShipStage(ctx);
  return {
    el: stage.el,
    onShow(showCtx) { stage.setHost('dock'); stage.onShow(showCtx); },
    onHide() { stage.onHide(); },
    refresh(refreshCtx) { stage.refresh(refreshCtx); },
    dispose() { /* shared stage — see above */ },
  };
}

let sharedStage = null;

/** The one ship stage (SCREENS_B §0.5: one module instance, one WebGLRenderer, two hosts). */
export function getSharedShipStage(ctx) {
  if (!sharedStage) sharedStage = createShipStage(ctx, { host: 'dock' });
  return sharedStage;
}

/**
 * The shipworks stage. `host` selects the entry point (SCREENS_B §1.2):
 *  - 'dock'  (default): full commerce — fleet + Buy Ship rail, fit/unfit, MAKE ACTIVE, station bay.
 *  - 'flight': the same instrument minus commerce — fleet rail inspect-only, chooser read-only
 *    (buttons carry the unavailability reason), no MAKE ACTIVE, transparent dock backdrop.
 * Everything else — the mount, the projection, the callouts, ghost preview — is identical.
 */
export function createShipStage(ctx, { host: initialHost = 'dock' } = {}) {
  let host = initialHost;
  const el = document.createElement('div');
  el.className = 'sx-sw';
  el.innerHTML =
    `<nav class="sx-sw__rail" aria-label="Shipworks ship selection">` +
      `<div class="sx-seg"><button type="button" class="sx-seg__btn is-on" data-mode="fleet">My Fleet</button><button type="button" class="sx-seg__btn" data-mode="buy">Buy Ship</button></div>` +
      `<div class="sx-sw__carousel">` +
        `<button type="button" class="sx-sw__railstep is-prev" data-rail-step="prev" aria-label="Previous ships">‹</button>` +
        `<div class="sx-sw__list" tabindex="0" aria-label="Available ships"></div>` +
        `<button type="button" class="sx-sw__railstep is-next" data-rail-step="next" aria-label="Next ships">›</button>` +
        `<span class="sx-sw__railtrack" aria-hidden="true"><i></i></span>` +
      `</div>` +
    `</nav>` +
    `<section class="sx-sw__main">` +
      `<div class="sx-sw__stage sf-stage">` +
        `<canvas class="sx-sw__canvas" tabindex="0" aria-label="Interactive ship preview. Drag or scroll horizontally to orbit; scroll vertically or pinch to zoom."></canvas>` +
        `<div class="sx-sw__baylines" aria-hidden="true"><span></span><span></span><span></span></div>` +
        `<div class="sx-sw__power" aria-hidden="true"></div>` +
        `<div class="sx-sw__gauges sf-housing" role="group" aria-label="Ship gauges"></div>` +
        `<div class="sx-sw__slotfield" role="group" aria-label="Ship systems"></div>` +
        `<div class="sx-sw__scarfield" role="group" aria-label="Living hull condition markers"></div>` +
        `<div class="sx-sw__focusline" aria-hidden="true"></div>` +
        `<div class="sx-sw__delta" aria-live="polite" hidden></div>` +
        `<div class="sx-sw__acquiring" data-sf-acquire-host></div>` +
        `<div class="sx-sw__nameplate sf-crest"></div>` +
        `<div class="sx-sw__camera" aria-label="Ship preview controls">` +
          `<button type="button" data-camera="left" aria-label="Rotate ship left">↶</button>` +
          `<button type="button" data-camera="reset" aria-label="Reset ship view">CENTER</button>` +
          `<button type="button" data-camera="right" aria-label="Rotate ship right">↷</button>` +
        `</div>` +
        `<span class="sx-sw__dragcue" aria-hidden="true">DRAG TO ORBIT · PINCH TO ZOOM</span>` +
      `</div>` +
      `<div class="sx-sw__stats sf-apron"></div>` +
    `</section>` +
    `<aside class="sx-sw__side" aria-label="Shipworks operation controls"></aside>` +
    `<div class="sx-sw__chooser" hidden></div>`;

  const railListEl = el.querySelector('.sx-sw__list');
  const railPrevEl = el.querySelector('[data-rail-step="prev"]');
  const railNextEl = el.querySelector('[data-rail-step="next"]');
  const railProgressEl = el.querySelector('.sx-sw__railtrack i');
  const canvas = el.querySelector('.sx-sw__canvas');
  const nameplateEl = el.querySelector('.sx-sw__nameplate');
  const statsEl = el.querySelector('.sx-sw__stats');
  const sideEl = el.querySelector('.sx-sw__side');
  const chooserEl = el.querySelector('.sx-sw__chooser');
  const stageEl = el.querySelector('.sx-sw__stage');
  const slotfieldEl = el.querySelector('.sx-sw__slotfield');
  const scarfieldEl = el.querySelector('.sx-sw__scarfield');
  const powerOverlayEl = el.querySelector('.sx-sw__power');
  const gaugeRackEl = el.querySelector('.sx-sw__gauges');
  const deltaEl = el.querySelector('.sx-sw__delta');
  const acquiringEl = el.querySelector('.sx-sw__acquiring');

  // Authored mesh required — never treat box-LOD / false warmup as primary truth.
  canvas.dataset.authoredRequired = 'true';
  canvas.dataset.fallbackAllowed = 'false';
  canvas.dataset.previewReady = 'false';
  canvas.dataset.previewAssetState = 'empty';

  let mode = 'fleet';
  let viewIdx = 0;          // owned ship index being viewed/fitted
  let buyId = SHIPS[0].id;  // hull being previewed in Buy mode
  let mount = null;
  let curPreviewKey = '';
  let expectedPreviewDefId = null;
  let ghostActive = false;
  let ghostSource = null;
  let selectedSlot = -1;
  let chooserAnchor = null;
  let stopChooserPositioning = null;
  let projectionFrame = 0;
  let chooserCloseTimer = 0;
  let previewSettleTimer = 0;
  let previewSettleGeneration = 0;
  let previewRevealPhase = 'idle';
  let activeBandModel = null;
  let ghostBandModel = null;
  let ghostMassDelta = null;
  let activePresetRailModel = null;
  let presetSelectionByHull = {};
  let recordOpen = false;
  let rangeIntentUnsub = null;
  const handlingDomain = handlingProfileDomain();
  const powerBeam = createRouteBeam(powerOverlayEl, { width: 400, height: 240 });
  const gaugeByKey = {};
  let gaugeReady = false;
  let currentGaugeStats = null;
  let currentPowerHeadroom = 0;
  let currentPowerCapMax = 0;
  let currentPowerSlotIndices = [];
  let presetDeleteBusy = false;

  function isReducedMotion() {
    const settings = ctx && ctx.state && ctx.state.settings && ctx.state.settings.video;
    const motionReduce = settings && typeof settings.motionReduce === 'boolean'
      ? settings.motionReduce
      : undefined;
    return prefersReducedMotion({ motionReduce });
  }

  function emitUiCue(id) {
    if (ctx.bus) ctx.bus.emit('audio:cue', { id });
  }

  function ensureGaugeRack() {
    if (gaugeReady) return;
    gaugeRackEl.innerHTML = '';
    for (const def of GAUGE_DEFS) {
      const tile = document.createElement('div');
      tile.className = 'sx-sw-gauge';
      tile.setAttribute('data-gauge', def.key);
      tile.innerHTML =
        `<div class="sx-sw-gauge__dial"></div>` +
        `<span class="sx-sw-gauge__k">${escapeHtml(def.label)}</span>` +
        `<span class="sx-sw-gauge__v" data-gauge-value></span>`;
      gaugeRackEl.appendChild(tile);
      const dial = tile.querySelector('.sx-sw-gauge__dial');
      gaugeByKey[def.key] = {
        def,
        tile,
        valueEl: tile.querySelector('[data-gauge-value]'),
        fx: createCircularGauge(dial, { size: 48, stroke: 4, kind: def.kind }),
        settleValue: 0,
        settleTimer: 0,
        settleReady: false,
      };
    }
    gaugeReady = true;
  }

  function clearGaugeSettle(row) {
    if (!row) return;
    if (row.settleTimer) clearTimeout(row.settleTimer);
    row.settleTimer = 0;
  }

  function clearAllGaugeSettles() {
    for (const key of Object.keys(gaugeByKey)) clearGaugeSettle(gaugeByKey[key]);
  }

  function setGaugeTransition(fx, ms, overshoot) {
    const arc = fx && fx.svg && fx.svg.querySelector ? fx.svg.querySelector('.sf-fx-gauge__arc') : null;
    if (!arc) return;
    const eased = overshoot ? 'cubic-bezier(.24,1.26,.34,1)' : 'cubic-bezier(.19,.9,.29,1)';
    arc.style.transition = `stroke-dashoffset ${Math.max(1, Math.round(ms))}ms ${eased}, stroke 160ms var(--ease, ease-out)`;
  }

  function applyGaugeSettle(row, nextValue, settleMeta, effectMeta) {
    if (!row || !row.fx) return;
    clearGaugeSettle(row);
    const plan = planGaugeSettle(row.settleValue, nextValue, settleMeta);
    row.settleValue = plan.targetValue;
    if (plan.immediate) {
      setGaugeTransition(row.fx, 1, false);
      row.fx.setValue(plan.targetValue, effectMeta);
      return;
    }
    setGaugeTransition(row.fx, plan.upMs, true);
    row.fx.setValue(plan.peakValue, effectMeta);
    row.settleTimer = setTimeout(() => {
      setGaugeTransition(row.fx, plan.downMs, false);
      row.fx.setValue(plan.targetValue, effectMeta);
      row.settleTimer = 0;
    }, plan.upMs);
  }

  function owned() { return (ctx.state.player && ctx.state.player.ownedShips) || []; }
  function viewedShip() { const o = owned(); return o[viewIdx] || o[ctx.state.player && ctx.state.player.activeShipIndex] || o[0] || null; }

  function setHost(next) {
    if (host === next) return;
    host = next;
    // Flight entry: inspect-only. Buy mode and MAKE ACTIVE belong to a station berth.
    el.classList.toggle('sx-sw--flight', host === 'flight');
    if (!chooserEl.hidden) closeChooser({ silent: true });
    if (host === 'flight') {
      mode = 'fleet';
      selectedSlot = -1;
      // Opening in flight means "my ship": land on the active hull, not index 0.
      const activeIdx = (ctx.state.player && ctx.state.player.activeShipIndex) || 0;
      if (owned()[activeIdx]) viewIdx = activeIdx;
    }
    renderRail();
    renderCenter();
    renderSide();
  }

  function ensureRangeIntentHandler() {
    if (rangeIntentUnsub || !ctx.bus || typeof ctx.bus.on !== 'function') return;
    rangeIntentUnsub = ctx.bus.on('ui:ship:range', (payload = {}) => {
      if (!payload || payload.source !== 'ship-stage') return;
      if (ctx.state && ctx.state.ui) {
        ctx.state.ui.rangeSubject = {
          shipId: payload.shipId || null,
          fittings: Array.isArray(payload.fittings) ? payload.fittings.slice() : [],
        };
      }
      const manager = ctx && ctx.screenManager;
      if (!manager || typeof manager.pushScreen !== 'function') return;
      try { manager.pushScreen('range'); } catch (_) {}
    });
  }

  function writeCanvasPreviewMeta(defId, fittings, meta) {
    canvas.dataset.previewDefId = defId || '';
    canvas.dataset.previewFittings = JSON.stringify(Array.isArray(fittings) ? fittings : []);
    canvas.dataset.fallbackAllowed = 'false';
    if (meta && meta.mode === 'module') {
      canvas.dataset.previewMode = 'module';
      canvas.dataset.previewModule = meta.moduleId || '';
    } else {
      delete canvas.dataset.previewMode;
      delete canvas.dataset.previewModule;
    }
  }

  function stablePreviewState(state) {
    return !!state && !['empty', 'loading', 'procedural-fallback'].includes(state);
  }

  function selectedPresetIdForHull(hullDefId) {
    if (!hullDefId || !presetSelectionByHull || typeof presetSelectionByHull !== 'object') return null;
    return presetSelectionByHull[hullDefId] || null;
  }

  function setSelectedPresetIdForHull(hullDefId, presetId, { remember = true } = {}) {
    if (!hullDefId) return;
    if (!presetSelectionByHull || typeof presetSelectionByHull !== 'object') presetSelectionByHull = {};
    if (typeof presetId === 'string' && presetId) presetSelectionByHull[hullDefId] = presetId;
    else delete presetSelectionByHull[hullDefId];
    if (remember) rememberShipView();
  }

  function clearPresetSelectionForViewedHull(options = {}) {
    const ship = viewedShip();
    if (!ship || !ship.defId) return;
    setSelectedPresetIdForHull(ship.defId, null, options);
  }

  function rememberShipView() {
    const mem = ctx.screenMemory;
    if (!mem) return;
    mem.set('ship', {
      mode,
      viewIdx,
      buyId: String(buyId || ''),
      recordOpen: !!recordOpen,
      presetSelectionByHull: sanitizePresetSelectionMap(presetSelectionByHull),
    });
  }

  function restoreShipView() {
    const mem = ctx.screenMemory;
    if (!mem) return;
    const savedMode = mem.read('ship', 'mode', null);
    const savedIdx = mem.read('ship', 'viewIdx', null);
    const savedBuy = mem.read('ship', 'buyId', null);
    const savedRecordOpen = mem.read('ship', 'recordOpen', null);
    const savedPresetSelection = mem.read('ship', 'presetSelectionByHull', null);
    if (host !== 'flight' && (savedMode === 'fleet' || savedMode === 'buy')) mode = savedMode;
    if (Number.isInteger(savedIdx) && owned()[savedIdx]) viewIdx = savedIdx;
    if (savedBuy && SHIP_BY_ID.has(savedBuy)) buyId = savedBuy;
    if (typeof savedRecordOpen === 'boolean') recordOpen = savedRecordOpen;
    presetSelectionByHull = sanitizePresetSelectionMap(savedPresetSelection);
    el.querySelectorAll('.sx-seg__btn').forEach((x) => x.classList.toggle('is-on', x.getAttribute('data-mode') === mode));
  }

  function beginPreviewReveal(defId, gated) {
    previewSettleGeneration++;
    if (previewSettleTimer) clearTimeout(previewSettleTimer);
    previewSettleTimer = 0;
    canvas.dataset.previewReady = 'false';
    canvas.dataset.previewAssetState = 'loading';
    canvas.dataset.previewReveal = gated ? 'acquiring' : 'direct';
    previewRevealPhase = gated ? 'acquiring' : 'direct';
    stageEl.classList.toggle('is-acquiring', gated);
    stageEl.classList.remove('is-revealing');
    if (acquiringEl) {
      if (gated) {
        const generation = previewSettleGeneration;
        mountDataState(acquiringEl, 'loading', {
          code: 'OPTICS_UNRESOLVED',
          headline: 'Reading the ' + shipName(defId) + ' hull.',
          fills: 'Waiting on the shipyard optics to resolve your fitted modules — this finishes when the scan does, not on a timer.',
          skeleton: [{ w: '58%', h: 14 }, { w: '88%' }, { w: '42%' }],
          verb: {
            label: 'Show the hull now',
            onActivate: () => {
              const asset = mount && mount.getAssetState ? mount.getAssetState() : 'rendered';
              settlePreviewReveal(defId, asset, generation);
            },
          },
        });
      } else {
        settleDataState(acquiringEl);
      }
    }
    return previewSettleGeneration;
  }

  function settlePreviewReveal(defId, state, generation = previewSettleGeneration) {
    if (generation !== previewSettleGeneration || !defId || defId !== expectedPreviewDefId) return;
    if (previewRevealPhase === 'revealing') return;
    const gated = stageEl.dataset.revealWasGated === 'true';
    if (gated) {
      if (previewSettleTimer) clearTimeout(previewSettleTimer);
      canvas.dataset.previewDefId = defId;
      canvas.dataset.previewAssetState = state || 'rendered';
      canvas.dataset.previewReveal = 'revealing';
      previewRevealPhase = 'revealing';
      stageEl.classList.remove('is-acquiring');
      if (acquiringEl) settleDataState(acquiringEl);
      stageEl.classList.add('is-revealing');
      stageEl.dataset.revealWasGated = 'false';
      // `previewReady` means visible and settled, not merely that a WebGL root exists. Holding it
      // through the optical reveal prevents callers and screenshots from observing an empty bay.
      previewSettleTimer = setTimeout(() => {
        previewSettleTimer = 0;
        if (generation !== previewSettleGeneration || defId !== expectedPreviewDefId) return;
        canvas.dataset.previewReady = 'true';
        canvas.dataset.previewReveal = 'settled';
        previewRevealPhase = 'idle';
        stageEl.classList.remove('is-revealing');
        scheduleSpatialProjection();
      }, 190);
      return;
    }
    if (previewSettleTimer) clearTimeout(previewSettleTimer);
    previewSettleTimer = 0;
    canvas.dataset.previewReady = 'true';
    canvas.dataset.previewDefId = defId;
    canvas.dataset.previewAssetState = state || 'rendered';
    canvas.dataset.previewReveal = 'settled';
    previewRevealPhase = 'idle';
    stageEl.classList.remove('is-acquiring');
    stageEl.classList.remove('is-revealing');
    if (acquiringEl) settleDataState(acquiringEl);
    stageEl.dataset.revealWasGated = 'false';
    scheduleSpatialProjection();
  }

  function watchPreviewSettlement(defId, generation, startedAt = performance.now()) {
    if (generation !== previewSettleGeneration || defId !== expectedPreviewDefId || !mount) return;
    const state = mount.getAssetState ? mount.getAssetState() : 'rendered';
    if (stablePreviewState(state)) {
      settlePreviewReveal(defId, state, generation);
      return;
    }
    // Budget raised 8s -> 20s: a cold flight-first open (no prior dock to warm the mesh cache)
    // measured 12s+ to resolve the authored hull, so the old budget expired BEFORE the asset
    // arrived and revealed an empty bay. The terminal degraded state below is the honest floor,
    // not the common path — it must not be reached by an asset that was merely slow.
    if (performance.now() - startedAt >= 20000) {
      // Never leave the bay blank forever. This is an explicit degraded terminal state, not a
      // silent placeholder-to-final swap, and remains visible to the probe through the dataset.
      settlePreviewReveal(defId, state === 'loading' ? 'fallback-timeout' : state, generation);
      return;
    }
    previewSettleTimer = setTimeout(() => watchPreviewSettlement(defId, generation, startedAt), 50);
  }

  function ensureMount() {
    if (mount) {
      syncShipworksDockForState(mount, ctx.state);
      return mount;
    }
    canvas.dataset.authoredRequired = 'true';
    canvas.dataset.fallbackAllowed = 'false';
    canvas.dataset.previewReady = 'false';
    mount = createShipPreviewMount(canvas, {
      allowFastFallback: false,
      authoredShips: true,
      authoredWarmup: true,
      dockId: shipworksDockIdForState(ctx.state),
      onFirstFrame: ({ defId } = {}) => {
        if (!defId || defId !== expectedPreviewDefId) return;
        const state = mount && mount.getAssetState ? mount.getAssetState() : 'rendered';
        if (!stageEl.classList.contains('is-acquiring') || stablePreviewState(state)) settlePreviewReveal(defId, state);
        else watchPreviewSettlement(defId, previewSettleGeneration);
      },
      onAssetSettled: ({ defId, state } = {}) => {
        if (!defId || defId !== expectedPreviewDefId) return;
        settlePreviewReveal(defId, state || (mount && mount.getAssetState ? mount.getAssetState() : 'authored'));
      },
    });
    // Read-only hook used by the live browser acceptance probe. It exposes the preview's rendered
    // scene facts without giving UI code permission to mutate Three.js objects.
    Object.defineProperty(canvas, '__sfPreviewDiagnostics', {
      configurable: true,
      value: () => mount && mount.getVisualDiagnostics ? mount.getVisualDiagnostics() : [],
    });
    // Warm authored assets; do not mark ready from a false/failed warmup.
    try {
      const warm = mount.warmAssets && mount.warmAssets();
      if (warm && typeof warm.then === 'function') {
        warm.then((ok) => {
          if (ok !== true) return;
          // Warm success alone is not readiness; onFirstFrame still owns previewReady.
        }).catch(() => { /* keep previewReady false */ });
      }
    } catch (_) { /* keep previewReady false */ }
    return mount;
  }

  function previewShip(defId, fittings, isPlayer, meta) {
    ensureMount();
    writeCanvasPreviewMeta(defId, fittings, meta);
    expectedPreviewDefId = defId || null;
    const sameHull = mount.getDefId && mount.getDefId() === defId;
    // Gate on ASSET READINESS, not hull identity alone. The stage is a shared singleton built for
    // the dock host, so a flight-first F2 open can match the hull id while that hull's GLB is
    // still seconds away on a cold cache. An identity-only gate dismissed the acquiring state
    // immediately and left the player staring at an empty bay with floating slot callouts —
    // measured at 12s+ before the hull arrived (scripts/probe-ship-polish-audit.mjs).
    const assetStableNow = stablePreviewState(mount.getAssetState ? mount.getAssetState() : 'rendered');
    const gated = (!sameHull && !(meta && meta.mode === 'module')) || !assetStableNow;
    stageEl.dataset.revealWasGated = gated ? 'true' : 'false';
    const revealGeneration = beginPreviewReveal(defId, gated);
    const key = defId + '|' + (fittings || []).join(',') + '|' + (isPlayer ? 'p' : 's') + '|' + ((meta && meta.mode) || 'base');
    if (key === curPreviewKey) {
      mount.setActive(true);
      const state = mount.getAssetState ? mount.getAssetState() : 'rendered';
      if (!gated || stablePreviewState(state)) settlePreviewReveal(defId, state, revealGeneration);
      else watchPreviewSettlement(defId, revealGeneration);
      return;
    }
    curPreviewKey = key;
    try {
      const preserveView = sameHull;
      // Shipworks is direct manipulation: the settled ship does not burn a render loop merely to
      // prove it is alive. Drag, zoom, selection and authored-asset upgrades render on demand.
      mount.show(defId, { fittings: fittings || [], isPlayer: !!isPlayer, rotating: false, preserveView });
      if (!preserveView) mount.setZoom(1.68);
      mount.setActive(true);
      mount.resize();
      const state = mount.getAssetState ? mount.getAssetState() : 'rendered';
      if (!gated || stablePreviewState(state)) settlePreviewReveal(defId, state, revealGeneration);
      else watchPreviewSettlement(defId, revealGeneration);
    } catch (e) { /* preview optional; UI still works — ready stays false */ }
  }

  function currentPreviewContext() {
    if (mode === 'fleet') {
      const s = viewedShip();
      const def = s ? SHIP_BY_ID.get(s.defId) : null;
      if (!def) return null;
      return {
        defId: def.id,
        fittings: Array.isArray(s.fittings) ? s.fittings.slice() : [],
        isPlayer: true,
        player: ctx.state.player,
        stock: false,
      };
    }
    const def = SHIP_BY_ID.get(buyId);
    if (!def) return null;
    return {
      defId: def.id,
      fittings: [],
      isPlayer: def.id === 'ship_kestrel',
      player: stockPreviewPlayer(ctx.state.player),
      stock: true,
    };
  }

  function activeFleetIndex() {
    return Number(ctx.state && ctx.state.player && ctx.state.player.activeShipIndex) || 0;
  }

  function viewedEntityForModel() {
    if (mode !== 'fleet') return null;
    if (viewIdx !== activeFleetIndex()) return null;
    const entities = ctx.state && ctx.state.entities;
    const playerId = ctx.state && ctx.state.playerId;
    if (!entities || !playerId || typeof entities.get !== 'function') return null;
    return entities.get(playerId) || null;
  }

  function viewedLivingHullForModel() {
    if (mode !== 'fleet') return null;
    const ship = viewedShip();
    return ship && ship.livingHull ? ship.livingHull : null;
  }

  function slotHasContinuousDraw(moduleDef) {
    if (!moduleDef) return false;
    if (Number(moduleDef.energyDraw) > 0) return true;
    return !!(moduleDef.continuous && Number(moduleDef.energyCost) > 0);
  }

  function barValueText(axis) {
    if (!axis) return '0';
    if (axis.id === 'inertia') return `${Math.round(finite(axis.raw, 0))}`;
    if (axis.id === 'agility' || axis.id === 'brake') return `${Math.round(finite(axis.raw, 0) * 100) / 100}`;
    if (axis.id === 'topSpeed') return `${Math.round(finite(axis.raw, 0))}`;
    return `${Math.round(finite(axis.raw, 0))}`;
  }

  function massDeltaChipText(metric) {
    if (!metric) return '';
    if (metric.id === 'turn' || metric.id === 'topSpeed') return `${metric.label} ${plusMinus(metric.pct)}%`;
    if (metric.id === 'stopDistance') return `${metric.label} ${plusMinus(metric.delta, 0)}m`;
    if (metric.id === 'bank') return `${metric.label} ${plusMinus(metric.delta, 2)}`;
    return `${metric.label} ${plusMinus(metric.delta, 1)}`;
  }

  function recordRowsHtml(model) {
    if (!model || !model.derived) return '';
    const d = model.derived;
    const entries = [
      ['Hull max', `${fmt(d.hullMax)}`],
      ['Shield max', `${fmt(d.shieldMax)}`],
      ['Cap max', `${fmt(d.capMax)}`],
      ['Cap regen', `${Math.round(finite(d.capRegen, 0) * 10) / 10}/s`],
      ['Continuous drain', `${Math.round(finite(d.continuousDrain, 0) * 10) / 10}/s`],
      ['Cargo cap', `${fmt(d.cargoCap)} u`],
      ['Operational mass', `${fmt(d.operationalMass)} t`],
      ['Turn rate', `${Math.round(finite(d.turnRate, 0) * 100) / 100}`],
      ['Thrust', `${fmt(d.thrust)}`],
      ['Top speed', `${fmt(d.maxSpeed)}`],
    ];
    return entries.map(([k, v]) =>
      `<div class="sx-sw-record__row"><span>${escapeHtml(k)}</span><b>${escapeHtml(String(v))}</b></div>`
    ).join('');
  }

  function deriveBandModel(previewCtx) {
    if (!previewCtx) return null;
    const def = SHIP_BY_ID.get(previewCtx.defId);
    if (!def) return null;
    const fittings = Array.isArray(previewCtx.fittings) ? previewCtx.fittings.slice() : [];
    const player = previewCtx.player || null;
    const derived = getDerivedStats(def.id, fittings, player);
    const handling = handlingBandModel({
      shipId: def.id,
      fittings,
      player,
      domain: handlingDomain,
    });
    const capability = capabilityBandModel({
      derived,
      state: ctx.state,
    });
    const condition = conditionFromEntity(viewedEntityForModel());
    const scars = scarCalloutsForHull({
      shipId: def.id,
      livingHull: viewedLivingHullForModel(),
      simTime: finite(ctx.state && ctx.state.simTime, 0),
    });
    const availability = shipworksActionAvailability(ctx.state);
    const slots = buildSlotList(def);
    const fittedDefs = fittings.map((id) => id && FITTABLE_BY_ID.get(id)).filter(Boolean);
    const poweredSlotIndices = [];
    slots.forEach((slot, index) => {
      const fitted = fittings[index] && FITTABLE_BY_ID.get(fittings[index]);
      if (slotHasContinuousDraw(fitted)) poweredSlotIndices.push(index);
    });
    return {
      def,
      fittings,
      player,
      derived,
      handling,
      capability,
      condition,
      scars,
      slots,
      fittedDefs,
      poweredSlotIndices,
      availability,
    };
  }

  function derivePresetRailModel(model) {
    if (!model || !model.def || mode !== 'fleet') return null;
    const canRefit = !!(model.availability && model.availability.outfitEnabled);
    const refitWhy = (model.availability && model.availability.outfitLabel) || 'Dock to refit';
    const enforceCargo = viewIdx === activeFleetIndex();
    return buildLoadoutPresetRailModel({
      player: ctx.state.player,
      hullDefId: model.def.id,
      currentFittings: model.fittings,
      selectedPresetId: selectedPresetIdForHull(model.def.id),
      canRefit,
      refitWhy,
      simTime: finite(ctx.state && ctx.state.simTime, 0),
      dryRunApply: (preset) => dryRunLoadoutPresetApply({
        shipDefId: model.def.id,
        currentFittings: model.fittings,
        targetFittings: preset && preset.fittings,
        moduleInventory: ctx.state && ctx.state.player && ctx.state.player.moduleInventory,
        player: ctx.state.player,
        enforceCargo,
      }),
    });
  }

  function syncGaugeValues(model) {
    ensureGaugeRack();
    if (!model || !model.derived) {
      currentGaugeStats = null;
      clearAllGaugeSettles();
      return;
    }
    currentGaugeStats = {
      mass: finite(model.derived.mass, 0),
      capMax: finite(model.derived.capMax, 0),
      capRegen: finite(model.derived.capRegen, 0),
      shieldMax: finite(model.derived.shieldMax, 0),
      cargoCap: finite(model.derived.cargoCap, 0),
      maxSpeed: finite(model.derived.maxSpeed, 0),
      continuousDrain: finite(model.derived.continuousDrain, 0),
    };
    const settleMeta = {
      reducedMotion: isReducedMotion(),
      shieldRegenRate: finite(model.derived.shieldRegenRate, 0),
      inertia: finite(model.derived.flightModel && model.derived.flightModel.inertia, 1),
      massRatio: finite(model.handling && model.handling.massRatio, 1),
    };
    for (const def of GAUGE_DEFS) {
      const row = gaugeByKey[def.key];
      if (!row) continue;
      const raw = currentGaugeStats[def.key];
      const norm = gaugeNorm(def.key, raw, currentGaugeStats);
      const gaugeMeta = { kind: def.kind, label: `${def.label}: ${fmt(raw)}${def.suffix}` };
      if (!row.settleReady) {
        row.settleReady = true;
        row.settleValue = norm;
        setGaugeTransition(row.fx, 1, false);
        row.fx.setValue(norm, gaugeMeta);
      } else {
        applyGaugeSettle(row, norm, settleMeta, gaugeMeta);
      }
      row.valueEl.textContent = `${fmt(raw)}${def.suffix}`;
      row.tile.setAttribute('data-why', `${def.label}: ${fmt(raw)}${def.suffix}`);
    }
  }

  function syncPowerBand(model) {
    if (!model || !model.derived) {
      currentPowerHeadroom = 0;
      currentPowerCapMax = 0;
      currentPowerSlotIndices = [];
      powerBeam.setPath([], { active: false });
      return;
    }
    currentPowerHeadroom = finite(model.derived.capRegen, 0) - finite(model.derived.continuousDrain, 0);
    currentPowerCapMax = Math.max(1, finite(model.derived.capMax, 0));
    currentPowerSlotIndices = model.poweredSlotIndices.slice();
  }

  function renderCrest(model) {
    if (!model || !model.def) {
      nameplateEl.innerHTML = '';
      return;
    }
    const conditionClass = model.condition && model.condition.tone
      ? ` sx-sw__condition--${escapeHtml(model.condition.tone)}`
      : '';
    const percent = model.condition && model.condition.percentText
      ? `<span class="sx-sw__conditionPct">${escapeHtml(model.condition.percentText)}</span>`
      : '';
    const verb = model.condition ? model.condition.verb : 'STOWED';
    const sentence = model.handling && model.handling.crestSentence ? model.handling.crestSentence : '';
    nameplateEl.innerHTML =
      `<div class="sx-sw__crestLine">` +
        `<h2 class="sf-crest__title">${escapeHtml(model.def.name)}</h2>` +
        `<span class="sx-sw__condition${conditionClass}"${whyAttr(model.condition && model.condition.why)}>` +
          `<span class="sx-sw__conditionVerb">${escapeHtml(verb)}</span>${percent}` +
        `</span>` +
      `</div>` +
      `<p class="sf-crest__line">${escapeHtml(sentence || fittedIdentityLine(model.def) || model.def.role || '')}</p>`;
  }

  function renderCapabilityChips(model) {
    if (!model || !model.capability) return '';
    const chips = model.capability.chips || [];
    const next = model.capability.next;
    const chipHtml = chips.map((chip) => {
      const tone = chip.tone || 'calm';
      return (
        `<button type="button" class="sx-sw-chip sf-tile sx-sw-chip--${escapeHtml(tone)}" data-cap-chip="${escapeHtml(chip.id)}"${whyAttr(chip.why)}>` +
          `<span class="sx-sw-chip__dot" aria-hidden="true">●</span>` +
          `<span class="sx-sw-chip__verb">${escapeHtml(chip.verb)}</span>` +
          `<span class="sx-sw-chip__sub">${escapeHtml(chip.sub || '')}</span>` +
        `</button>`
      );
    }).join('');
    const nextHtml = next
      ? (
        `<button type="button" class="sx-sw-chip sf-tile sx-sw-chip--goal sx-sw-chip--next" data-cap-chip="${escapeHtml(next.id)}"${whyAttr(next.why)}>` +
          `<span class="sx-sw-chip__dot" aria-hidden="true">○</span>` +
          `<span class="sx-sw-chip__verb">${escapeHtml(next.verb)}</span>` +
          `<span class="sx-sw-chip__sub">NEXT</span>` +
        `</button>`
      )
      : '';
    return chipHtml + nextHtml;
  }

  function renderPresetRail(model, railModel) {
    if (!model || !railModel) return '';
    const presets = Array.isArray(railModel.presets) ? railModel.presets : [];
    const saveSlot = railModel.saveSlot || null;
    const presetRows = presets.map((preset) => {
      const classes = [
        'sx-sw-preset',
        preset.selected ? 'is-selected' : '',
        preset.applyState && !preset.applyState.ok ? 'is-dim' : '',
      ].filter(Boolean).join(' ');
      const why = preset.applyState && !preset.applyState.ok ? preset.applyState.text : '';
      const aria = `${preset.label || 'Build'}. ${preset.subtitle || 'Preset'}. ${
        preset.applyState && preset.applyState.ok
          ? 'Select this build. Press again or use APPLY to commit.'
          : (preset.applyState && preset.applyState.text) || 'Cannot apply right now'
      }`;
      return (
        `<button type="button" class="${classes}" data-loadout-preset-id="${escapeHtml(preset.id)}" aria-pressed="${preset.selected ? 'true' : 'false'}"${whyAttr(why)} aria-label="${escapeHtml(aria)}">` +
          `<span class="sx-sw-preset__label">${escapeHtml(preset.label || 'Build')}</span>` +
          `<span class="sx-sw-preset__sub">${escapeHtml(preset.subtitle || 'Preset')}</span>` +
        `</button>`
      );
    }).join('');
    const saveDisabled = !saveSlot || !saveSlot.canSave;
    const saveWhy = saveDisabled ? (saveSlot && saveSlot.reasonText) || 'Cannot save right now' : '';
    const saveLabel = saveSlot ? `SAVE CURRENT FIT AS ${saveSlot.label}` : 'SAVE CURRENT FIT AS...';
    const countText = saveSlot ? `${saveSlot.count}/${saveSlot.cap}` : '';
    const saveButton = (
      `<button type="button" class="sx-sw-preset sx-sw-preset--save${saveDisabled ? ' is-dim' : ''}" data-loadout-preset-save="1"${saveSlot ? ` data-loadout-preset-id="${escapeHtml(saveSlot.presetId)}" data-loadout-label-key="${escapeHtml(saveSlot.labelKey)}" data-loadout-created-at="${saveSlot.createdAt}"` : ''}${saveDisabled ? ' disabled' : ''}${whyAttr(saveWhy)} aria-label="${escapeHtml(saveLabel)}">` +
        `<span class="sx-sw-preset__label">+</span>` +
        `<span class="sx-sw-preset__sub">${escapeHtml(countText)}</span>` +
      `</button>`
    );
    return (
      `<section class="sx-sw-band sx-sw-band--presets sf-deck">` +
        `<header class="sx-sw-band__head">` +
          `<span class="sf-deck__label">LOADOUT PRESETS</span>` +
          `<span class="sx-sw-preset__meta">Select to preview. Second gesture applies.</span>` +
        `</header>` +
        `<div class="sx-sw-presetrow">` +
          presetRows +
          saveButton +
        `</div>` +
      `</section>`
    );
  }

  function renderPresetDrawer(railModel) {
    const selectedPreset = railModel && railModel.selectedPreset ? railModel.selectedPreset : null;
    if (!selectedPreset) return '';
    const verbs = Array.isArray(selectedPreset.capabilityVerbs) ? selectedPreset.capabilityVerbs.slice(0, 5) : [];
    const verbsHtml = verbs.length
      ? verbs.map((verb) => `<span class="sx-sw-presetverb">${escapeHtml(verb)}</span>`).join('')
      : '<span class="sx-sw-presetverb is-empty">No capability verb available</span>';
    const applyText = selectedPreset.applyState && selectedPreset.applyState.ok
      ? 'READY TO APPLY'
      : ((selectedPreset.applyState && selectedPreset.applyState.text) || 'Cannot apply right now');
    return (
      `<section class="sx-sw-record sx-sw-record--preset">` +
        `<header><span class="sf-deck__label">BUILD RECORD</span></header>` +
        `<div class="sx-sw-presetdrawer">` +
          `<div class="sx-sw-presetdrawer__row"><span>LABEL</span><b>${escapeHtml(selectedPreset.label || 'Build')}</b></div>` +
          `<div class="sx-sw-presetdrawer__row"><span>CREATED CYCLE</span><b>${escapeHtml(String(Math.max(0, Math.round(finite(selectedPreset.createdAt, 0)))))}</b></div>` +
          `<div class="sx-sw-presetdrawer__row"><span>APPLY STATE</span><b${whyAttr(applyText)}>${escapeHtml(applyText)}</b></div>` +
          `<div class="sx-sw-presetdrawer__verbs"><span>CAPABILITY VERBS</span><div>${verbsHtml}</div></div>` +
          `<div class="sx-sw-presetdrawer__actions">` +
            `<button type="button" class="sx-sw-verb sx-sw-verb--danger" data-loadout-preset-delete="${escapeHtml(selectedPreset.id)}">DELETE BUILD</button>` +
          `</div>` +
        `</div>` +
      `</section>`
    );
  }

  function renderApron(model) {
    if (!model || !model.def || !model.derived) {
      statsEl.innerHTML = '';
      activePresetRailModel = null;
      return;
    }
    activePresetRailModel = derivePresetRailModel(model);
    if (activePresetRailModel && selectedPresetIdForHull(model.def.id) && !activePresetRailModel.selectedPreset) {
      setSelectedPresetIdForHull(model.def.id, null, { remember: false });
      activePresetRailModel = derivePresetRailModel(model);
    }
    const bars = model.handling && Array.isArray(model.handling.bars) ? model.handling.bars : [];
    const barRows = bars.map((bar) => {
      const ghost = ghostBandModel && ghostBandModel.handling && Array.isArray(ghostBandModel.handling.bars)
        ? ghostBandModel.handling.bars.find((row) => row.id === bar.id)
        : null;
      const showGhost = !!(ghost && !isReducedMotion());
      const barPct = showGhost ? ghost.bar : bar.bar;
      return (
        `<div class="sx-sw-bar"${whyAttr(bar.why)}>` +
          `<span class="sx-sw-bar__k">${escapeHtml(bar.label)}</span>` +
          `<span class="sx-sw-bar__track"><i class="sx-sw-bar__fill${showGhost ? ' is-ghost' : ''}" style="width:${Math.max(0, Math.min(100, barPct))}%"></i></span>` +
          `<span class="sx-sw-bar__v">${escapeHtml(barValueText(showGhost ? ghost : bar))}</span>` +
        `</div>`
      );
    }).join('');
    const ghostMetrics = ghostMassDelta && ghostMassDelta.ok && Array.isArray(ghostMassDelta.metrics)
      ? ghostMassDelta.metrics.filter((metric) => ['turn', 'topSpeed', 'stopDistance', 'bank'].includes(metric.id))
      : [];
    const ghostText = isReducedMotion() && ghostMetrics.length
      ? ghostMetrics.slice(0, 4).map((metric) => `<span>${escapeHtml(massDeltaChipText(metric))}</span>`).join('')
      : '';
    const headroom = finite(model.derived.capRegen, 0) - finite(model.derived.continuousDrain, 0);
    const headroomLabel = headroom < 0
      ? `OVER BUDGET ${plusMinus(headroom, 1)}/s`
      : `POWER ${plusMinus(headroom, 1)}/s`;
    const powerClass = headroom < 0 ? ' sx-sw-power__state--foe' : ' sx-sw-power__state--you';
    const selectedPreset = activePresetRailModel && activePresetRailModel.selectedPreset
      ? activePresetRailModel.selectedPreset
      : null;
    const fitAction = selectedPreset ? 'apply-preset' : 'fit-slot';
    const fitEnabled = selectedPreset
      ? !!(selectedPreset.applyState && selectedPreset.applyState.ok)
      : !!(model.availability && model.availability.outfitEnabled && selectedSlot >= 0);
    const fitLabel = selectedPreset
      ? `APPLY ${selectedPreset.label || 'BUILD'}`
      : (
        fitEnabled
          ? 'FIT'
          : (selectedSlot >= 0
            ? (model.availability && model.availability.outfitEnabled ? 'SELECT A MODULE' : model.availability.outfitLabel || 'DOCK TO FIT')
            : 'SELECT A SLOT')
      );
    const fitBlockedText = selectedPreset
      ? (((selectedPreset.applyState && selectedPreset.applyState.text) || 'Cannot apply this build'))
      : fitLabel;
    const makeActiveVisible = host === 'dock' && mode === 'fleet' && viewIdx !== activeFleetIndex();
    const makeActiveEnabled = makeActiveVisible && model.availability && model.availability.hullEnabled;
    const makeActiveLabel = makeActiveEnabled
      ? 'MAKE ACTIVE'
      : (model.availability && model.availability.hullLabel ? model.availability.hullLabel.toUpperCase() : 'MAKE ACTIVE');
    statsEl.innerHTML =
      `<section class="sx-sw-band sx-sw-band--handling sf-deck">` +
        `<header class="sx-sw-band__head">` +
          `<span class="sf-deck__label">HANDLING</span>` +
          `<span class="sx-sw-band__meta">${escapeHtml((model.handling && model.handling.profile && model.handling.profile.flightClass) || '')} · ${escapeHtml((model.handling && model.handling.profile && model.handling.profile.driveLabel) || '')}</span>` +
        `</header>` +
        `<div class="sx-sw-bars">${barRows}</div>` +
        `<div class="sx-sw-ghost">${ghostText}</div>` +
      `</section>` +
      `<section class="sx-sw-band sx-sw-band--power sf-deck">` +
        `<header class="sx-sw-band__head">` +
          `<span class="sf-deck__label">POWER</span>` +
          `<span class="sx-sw-power__caps">CAP ${fmt(model.derived.capMax)} · REGEN ${Math.round(finite(model.derived.capRegen, 0) * 10) / 10}/s · DRAW ${Math.round(finite(model.derived.continuousDrain, 0) * 10) / 10}/s</span>` +
        `</header>` +
        `<div class="sx-sw-power__state${powerClass}"${whyAttr(headroomLabel)}>${escapeHtml(headroomLabel)}</div>` +
      `</section>` +
      `<section class="sx-sw-band sx-sw-band--condition sf-deck">` +
        `<header class="sx-sw-band__head">` +
          `<span class="sf-deck__label">CONDITION</span>` +
          `<span class="sx-sw-condition__verb">${escapeHtml(model.condition ? model.condition.verb : 'STOWED')}</span>` +
        `</header>` +
        `<div class="sx-sw-condition__rows"${whyAttr(model.condition && model.condition.why)}>` +
          `<span>${escapeHtml((model.scars || []).length ? `${(model.scars || []).length} hull marks recorded` : 'No living-hull marks yet')}</span>` +
        `</div>` +
      `</section>` +
      `<section class="sx-sw-band sx-sw-band--capability sf-deck">` +
        `<header class="sx-sw-band__head">` +
          `<span class="sf-deck__label">WHAT YOU CAN DO NOW</span>` +
        `</header>` +
        `<div class="sx-sw-chiprow">${renderCapabilityChips(model)}</div>` +
      `</section>` +
      renderPresetRail(model, activePresetRailModel) +
      `<section class="sx-sw-verbs">` +
        `<button type="button" class="sx-sw-verb" data-verb="range">TAKE IT TO THE RANGE</button>` +
        `<button type="button" class="sx-sw-verb" data-verb="record">RECORD</button>` +
        `<button type="button" class="sx-sw-verb" data-verb="fit" data-fit-action="${escapeHtml(fitAction)}"${selectedPreset ? ` data-loadout-preset-id="${escapeHtml(selectedPreset.id)}"` : ''}${fitEnabled ? '' : ` disabled aria-label="${escapeHtml(fitBlockedText)}"`}>${escapeHtml(fitLabel)}</button>` +
        (makeActiveVisible
          ? `<button type="button" class="sx-sw-verb" data-verb="activate"${makeActiveEnabled ? '' : ` disabled aria-label="${escapeHtml(makeActiveLabel)}"`}>${escapeHtml(makeActiveLabel)}</button>`
          : '') +
      `</section>` +
      renderPresetDrawer(activePresetRailModel) +
      (recordOpen
        ? `<section class="sx-sw-record"><header><span class="sf-deck__label">RECORD</span></header><div class="sx-sw-record__grid">${recordRowsHtml(model)}</div></section>`
        : '');
  }

  function restoreCurrentPreview() {
    ghostActive = false;
    ghostSource = null;
    ghostBandModel = null;
    ghostMassDelta = null;
    deltaEl.hidden = true;
    deltaEl.innerHTML = '';
    const ctxPrev = currentPreviewContext();
    if (!ctxPrev) {
      nameplateEl.innerHTML = '';
      statsEl.innerHTML = '';
      scarfieldEl.innerHTML = '';
      return;
    }
    previewShip(ctxPrev.defId, ctxPrev.fittings, ctxPrev.isPlayer, null);
    activeBandModel = deriveBandModel(ctxPrev);
    renderCrest(activeBandModel);
    renderApron(activeBandModel);
    syncGaugeValues(activeBandModel);
    syncPowerBand(activeBandModel);
    renderScarCallouts(activeBandModel);
    if (activePresetRailModel && activePresetRailModel.selectedPreset) {
      applyPresetGhost(activePresetRailModel.selectedPreset);
      return;
    }
    scheduleSpatialProjection();
  }

  // ---------- object-centric system projection ----------
  let spatialAnchors = new Map();
  let scarAnchors = new Map();

  function typeOrdinal(slots, slotIndex) {
    const type = slots[slotIndex] && slots[slotIndex].type;
    return slots.slice(0, slotIndex).filter((s) => s.type === type).length;
  }

  function localSlotAnchor(def, slots, slotIndex) {
    const slot = slots[slotIndex];
    if (!def || !slot) return { x: 0, y: 0, z: 0, authored: false };
    const visuals = def.visuals || {};
    const radius = Math.max(5, Number(def.collisionRadius) || 12);
    const ordinal = typeOrdinal(slots, slotIndex);
    let pos = null;
    let authored = false;
    if (slot.type === 'weapon' && visuals.hardpoints && visuals.hardpoints[ordinal]) {
      pos = visuals.hardpoints[ordinal].pos;
      authored = true;
    } else if (slot.type === 'engine' && visuals.engineMounts && visuals.engineMounts.length) {
      const mounts = visuals.engineMounts;
      if (slots.filter((s) => s.type === 'engine').length > 1 && mounts[ordinal]) {
        pos = mounts[ordinal].pos;
      } else {
        const sum = mounts.reduce((a, m) => [a[0] + m.pos[0], a[1] + m.pos[1], a[2] + m.pos[2]], [0, 0, 0]);
        pos = sum.map((n) => n / mounts.length);
      }
      authored = true;
    } else if (slot.type === 'mining' && visuals.drill) {
      const spread = (ordinal - (slots.filter((s) => s.type === 'mining').length - 1) / 2) * .18;
      pos = [visuals.drill[0], visuals.drill[1] - .04, visuals.drill[2] + spread];
      authored = true;
    } else if (slot.type === 'utility' && visuals.sensor) {
      pos = visuals.sensor;
      authored = true;
    } else {
      // Shield and cargo are abstract ship systems when the authored hull has no literal socket.
      // Keep the distinction explicit in data attributes and copy; these are honest schematic
      // anchors, not invented physical hardpoints.
      const count = slots.filter((s) => s.type === slot.type).length;
      const spread = (ordinal - (count - 1) / 2) * .28;
      if (slot.type === 'shield') pos = [0.02, .36, spread];
      else if (slot.type === 'cargo') pos = [-.12 + ordinal * .08, -.28, spread];
      else pos = [.05, .28 - ordinal * .18, spread];
    }
    return {
      x: (pos && Number(pos[0]) || 0) * radius,
      y: (pos && Number(pos[1]) || 0) * radius,
      z: (pos && Number(pos[2]) || 0) * radius,
      authored,
    };
  }

  function renderScarCallouts(model) {
    scarAnchors = new Map();
    if (!model || !model.def || !Array.isArray(model.scars) || !model.scars.length) {
      scarfieldEl.innerHTML = '';
      return;
    }
    const radius = Math.max(5, Number(model.def.collisionRadius) || 12);
    scarfieldEl.innerHTML = model.scars.map((scar, index) => {
      const pos = Array.isArray(scar.local) ? scar.local : [0, 0, 0];
      scarAnchors.set(scar.id, {
        x: finite(pos[0], 0) * radius,
        y: finite(pos[1], 0) * radius,
        z: finite(pos[2], 0) * radius,
      });
      const kind = scar.kind === 'approx' ? 'approx' : 'authored';
      const sub = scar.sub || (kind === 'approx' ? 'APPROX' : 'AUTHORED');
      return (
        `<button type="button" class="sf-anchor sf-scar sx-sw-scar" data-scar-id="${escapeHtml(scar.id)}" data-anchor-kind="${kind}" tabindex="0"${whyAttr(scar.why)} aria-label="${escapeHtml(`${scar.label}. ${sub}`)}">` +
          `<span class="sx-sw-scar__dot" aria-hidden="true"></span>` +
          `<span class="sx-sw-scar__copy"><b>${escapeHtml(scar.label)}</b><em>${escapeHtml(sub)}</em></span>` +
        `</button>`
      );
    }).join('');
  }

  function renderSpatialSlots() {
    spatialAnchors = new Map();
    if (mode !== 'fleet') { slotfieldEl.innerHTML = ''; return; }
    const ship = viewedShip();
    const def = ship && SHIP_BY_ID.get(ship.defId);
    if (!def) { slotfieldEl.innerHTML = ''; return; }
    const slots = buildSlotList(def);
    const fittings = ship.fittings || [];
    slotfieldEl.innerHTML = slots.map((slot, i) => {
      const fitted = fittings[i] && FITTABLE_BY_ID.get(fittings[i]);
      const anchor = localSlotAnchor(def, slots, i);
      spatialAnchors.set(i, anchor);
      // An unfitted slot is named for the SLOT, not for a part called "Empty Cargo". The old label
      // ("Empty " + type) read as installed hardware whose name happened to start with "Empty",
      // which is why an open bay looked like a component of the ship. Name the mount, then state
      // that it is open.
      const slotName = SLOT_LABEL[slot.type] || slot.type;
      const label = fitted ? fitted.name : slotName;
      const selected = i === selectedSlot ? ' is-selected' : '';
      const kind = anchor.authored ? 'PHYSICAL' : 'SYSTEM';
      const sub = fitted ? `${kind} / ${slot.size || ''}` : `OPEN / ${slot.size || ''}`;
      const aria = fitted
        ? `${slotName} ${i + 1}: ${label}. Open compatible modules.`
        : `${slotName} ${i + 1}: open slot. Open compatible modules.`;
      return `<button type="button" class="sx-hardpoint sx-hardpoint--${escapeHtml(slot.type)}${selected}${fitted ? '' : ' is-empty'}" data-spatial-slot="${i}" data-anchor-kind="${kind.toLowerCase()}" aria-label="${escapeHtml(aria)}">` +
        `<span class="sx-hardpoint__reticle" aria-hidden="true"><i></i></span>` +
        `<span class="sx-hardpoint__copy"><b>${escapeHtml(label)}</b><em>${escapeHtml(sub)}</em></span>` +
      `</button>`;
    }).join('');
    scheduleSpatialProjection();
  }

  function scheduleSpatialProjection() {
    if (projectionFrame) cancelAnimationFrame(projectionFrame);
    projectionFrame = requestAnimationFrame(() => {
      projectionFrame = 0;
      updateSpatialProjection();
    });
  }

  function syncPowerBeamProjection(stageRect) {
    if (!mount || !stageRect) return;
    powerBeam.resize(stageRect.width, stageRect.height);
    if (!Array.isArray(currentPowerSlotIndices) || !currentPowerSlotIndices.length) {
      powerBeam.setPath([], { active: false });
      return;
    }
    const points = [];
    const reactor = { x: stageRect.width * 0.5, y: stageRect.height * 0.62 };
    points.push(reactor);
    for (const slotIndex of currentPowerSlotIndices) {
      const local = spatialAnchors.get(slotIndex);
      if (!local) continue;
      const projected = mount.projectLocalPoint(local);
      if (!projected) continue;
      points.push({
        x: projected.x - stageRect.left,
        y: projected.y - stageRect.top,
      });
    }
    if (points.length < 2) {
      powerBeam.setPath([], { active: false });
      return;
    }
    const reversed = currentPowerHeadroom < 0;
    const reduced = isReducedMotion();
    powerBeam.setPath(points, {
      active: !reduced,
      kind: reversed ? 'danger' : 'energy',
      direction: reversed ? 'from' : 'to',
    });
    const path = powerBeam && powerBeam.svg && powerBeam.svg.querySelector
      ? powerBeam.svg.querySelector('.sf-fx-beam__path')
      : null;
    if (path) {
      const ratio = Math.min(2, Math.abs(currentPowerHeadroom) / Math.max(1, currentPowerCapMax));
      const duration = Math.max(220, Math.min(1600, 900 - ratio * 520));
      path.style.animationDuration = `${Math.round(duration)}ms`;
    }
  }

  function updateSpatialProjection() {
    if (!mount || !stageEl.isConnected) return;
    const stageRect = stageEl.getBoundingClientRect();
    const focusLine = el.querySelector('.sx-sw__focusline');
    if (focusLine && selectedSlot < 0) focusLine.classList.remove('is-on');
    const nodes = [...slotfieldEl.querySelectorAll('[data-spatial-slot]')];
    const rows = Math.max(1, Math.ceil(nodes.length / 2));
    const nodeRadius = 17;
    const calloutWidth = 172;
    const calloutHeight = 36;
    const calloutGap = 12;
    const edgeInset = 8;
    nodes.forEach((node, order) => {
      const index = Number(node.getAttribute('data-spatial-slot'));
      const local = spatialAnchors.get(index);
      const projected = local && mount.projectLocalPoint(local);
      if (!projected) return;
      const x = Math.max(42, Math.min(stageRect.width - 42, projected.x - stageRect.left));
      const y = Math.max(46, Math.min(stageRect.height - 64, projected.y - stageRect.top));
      node.style.left = `${x}px`;
      node.style.top = `${y}px`;
      node.style.zIndex = String(nodes.length - order + 2);
      // Labels fan into a stable schematic constellation while each reticle remains tied to its
      // projected physical/system point. That preserves spatial truth without producing a knot of
      // overlapping text on compact hulls.
      const row = Math.floor(order / 2);
      const desiredY = (row - (rows - 1) / 2) * 52 - 10;
      const absoluteLabelY = Math.max(edgeInset, Math.min(stageRect.height - calloutHeight - edgeInset, y + desiredY));
      const calloutY = absoluteLabelY - (y - nodeRadius);
      const preferLeft = x > stageRect.width / 2;
      const desiredLabelX = preferLeft
        ? x - nodeRadius - calloutWidth - calloutGap
        : x + nodeRadius + calloutGap;
      const absoluteLabelX = Math.max(edgeInset,
        Math.min(stageRect.width - calloutWidth - edgeInset, desiredLabelX));
      const calloutX = absoluteLabelX - (x - nodeRadius);
      const calloutLeft = absoluteLabelX + calloutWidth / 2 < x;
      node.classList.toggle('is-callout-left', calloutLeft);
      node.style.setProperty('--callout-x', `${calloutX}px`);
      node.style.setProperty('--callout-y', `${calloutY}px`);
      if (index === selectedSlot) {
        const cx = stageRect.width / 2;
        const cy = stageRect.height / 2;
        const dx = x - cx;
        const dy = y - cy;
        if (focusLine) {
          focusLine.style.left = `${cx}px`;
          focusLine.style.top = `${cy}px`;
          focusLine.style.width = `${Math.hypot(dx, dy)}px`;
          focusLine.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
          focusLine.classList.add('is-on');
        }
        deltaEl.style.left = `${Math.max(16, Math.min(stageRect.width - 270, x + 24))}px`;
        deltaEl.style.top = `${Math.max(70, Math.min(stageRect.height - 130, y - 18))}px`;
      }
    });
    const scars = [...scarfieldEl.querySelectorAll('[data-scar-id]')];
    scars.forEach((node, order) => {
      const scarId = node.getAttribute('data-scar-id');
      const local = scarAnchors.get(scarId);
      const projected = local && mount.projectLocalPoint(local);
      if (!projected) return;
      const x = Math.max(28, Math.min(stageRect.width - 28, projected.x - stageRect.left));
      const y = Math.max(30, Math.min(stageRect.height - 30, projected.y - stageRect.top));
      node.style.left = `${x}px`;
      node.style.top = `${y}px`;
      node.style.zIndex = String(70 - order);
    });
    syncPowerBeamProjection(stageRect);
  }

  // ---------- left rail ----------
  function updateRailControls() {
    const max = Math.max(0, railListEl.scrollWidth - railListEl.clientWidth);
    const progress = max > 0 ? Math.max(0, Math.min(1, railListEl.scrollLeft / max)) : 0;
    const viewport = railListEl.scrollWidth > 0
      ? Math.max(.12, Math.min(1, railListEl.clientWidth / railListEl.scrollWidth)) : 1;
    railPrevEl.disabled = max <= 1 || railListEl.scrollLeft <= 1;
    railNextEl.disabled = max <= 1 || railListEl.scrollLeft >= max - 1;
    railProgressEl.style.width = `${(viewport * 100).toFixed(2)}%`;
    railProgressEl.style.transform = `translateX(${(progress * (100 / viewport - 100)).toFixed(2)}%)`;
  }

  function revealSelectedShip({ focus = false } = {}) {
    const active = railListEl.querySelector('.sx-sw-row.is-active');
    if (!active) {
      requestAnimationFrame(updateRailControls);
      return;
    }
    if (focus) active.focus({ preventScroll: true });
    const railRect = railListEl.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const max = Math.max(0, railListEl.scrollWidth - railListEl.clientWidth);
    const desired = railListEl.scrollLeft
      + (activeRect.left + activeRect.width / 2)
      - (railRect.left + railRect.width / 2);
    const left = Math.max(0, Math.min(max, desired));
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    railListEl.scrollTo({ left, behavior: reducedMotion ? 'auto' : 'smooth' });
    requestAnimationFrame(updateRailControls);
  }

  function queueRevealSelectedShip(options = {}) {
    requestAnimationFrame(() => revealSelectedShip(options));
  }

  function renderRail() {
    if (mode === 'fleet') {
      const o = owned();
      const activeIdx = (ctx.state.player && ctx.state.player.activeShipIndex) || 0;
      railListEl.innerHTML = o.length ? o.map((s, i) => {
        const def = SHIP_BY_ID.get(s.defId) || {};
        const on = i === viewIdx ? ' is-active' : '';
        const isActive = i === activeIdx;
        return (
          `<button type="button" class="sx-sw-row${on}" data-fleet="${i}" title="${escapeHtml(def.name || s.defId)}" aria-label="Inspect ${escapeHtml(def.name || s.defId)}" aria-pressed="${i === viewIdx}">` +
            `<span class="sx-sw-row__ic">${shipSilhouette(def)}</span>` +
            `<span class="sx-sw-row__body"><span class="sx-sw-row__name">${escapeHtml(def.name || s.defId)}</span>` +
              `<span class="sx-sw-row__sub">${escapeHtml((def.role || 'ship'))} · T${def.tier != null ? def.tier : '?'}</span></span>` +
            (isActive ? `<span class="sx-sw-row__flag">Active</span>` : '') +
          `</button>`
        );
      }).join('') : `<p class="sx-muted" style="padding:12px">No ships owned.</p>`;
    } else {
      railListEl.innerHTML = SHIPS.filter((s) => (s.price || 0) >= 0).map((s) => {
        const on = s.id === buyId ? ' is-active' : '';
        return (
          `<button type="button" class="sx-sw-row${on}" data-buy="${escapeHtml(s.id)}" title="${escapeHtml(s.name)} · ${escapeHtml(s.role || 'ship')}" aria-label="Preview ${escapeHtml(s.name)}, ${escapeHtml(s.role || 'ship')}, ${s.price > 0 ? fmt(s.price) + ' credits' : 'owned'}" aria-pressed="${s.id === buyId}">` +
            `<span class="sx-sw-row__ic">${shipSilhouette(s)}</span>` +
            `<span class="sx-sw-row__body"><span class="sx-sw-row__name">${escapeHtml(s.name)}</span>` +
              `<span class="sx-sw-row__sub">${escapeHtml(s.role || 'ship')} · T${s.tier}</span></span>` +
            `<span class="sx-sw-row__price">${s.price > 0 ? fmt(s.price) : 'Owned'}</span>` +
          `</button>`
        );
      }).join('');
    }
    requestAnimationFrame(updateRailControls);
  }

  function selectRailButton(button, { focus = false } = {}) {
    if (!button || !railListEl.contains(button)) return false;
    const fleetIndex = button.getAttribute('data-fleet');
    const buyShipId = button.getAttribute('data-buy');
    if (fleetIndex == null && buyShipId == null) return false;
    if (fleetIndex != null) viewIdx = Number(fleetIndex);
    else buyId = buyShipId;
    selectedSlot = -1;
    rememberShipView();
    renderRail();
    renderCenter();
    renderSide();
    queueRevealSelectedShip({ focus });
    if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_tab' });
    return true;
  }

  // ---------- center: preview + stats ----------
  function renderCenter() {
    ghostActive = false;
    ghostSource = null;
    ghostBandModel = null;
    ghostMassDelta = null;
    const previewCtx = currentPreviewContext();
    if (!previewCtx) {
      nameplateEl.innerHTML = '';
      statsEl.innerHTML = '';
      scarfieldEl.innerHTML = '';
      activeBandModel = null;
      return;
    }
    previewShip(previewCtx.defId, previewCtx.fittings, previewCtx.isPlayer, null);
    activeBandModel = deriveBandModel(previewCtx);
    renderCrest(activeBandModel);
    renderApron(activeBandModel);
    syncGaugeValues(activeBandModel);
    syncPowerBand(activeBandModel);
    renderScarCallouts(activeBandModel);
    renderSpatialSlots();
    if (activePresetRailModel && activePresetRailModel.selectedPreset) applyPresetGhost(activePresetRailModel.selectedPreset);
  }

  // ---------- right: slots (fleet) or spec+buy (buy) ----------
  function renderSide() {
    if (mode === 'buy') {
      const def = SHIP_BY_ID.get(buyId);
      if (!def) { sideEl.innerHTML = ''; return; }
      const slotSummary = Object.entries(def.slots || {}).filter(([, arr]) => (arr || []).length)
        .map(([t, arr]) => `<span class="sx-tag">${(arr || []).length}× ${SLOT_LABEL[t] || t}</span>`).join('');
      const credits = (ctx.state.player && ctx.state.player.credits) || 0;
      const afford = def.price <= credits;
      const isOwned = owned().some((s) => s.defId === def.id);
      const availability = shipworksActionAvailability(ctx.state);
      sideEl.innerHTML =
        `<div class="sx-panel"><div class="sx-panel__head">${icon('shipworks', 15)}<span>Ship Spec</span></div>` +
          `<div class="sx-spec">` +
            specRow('Class', (def.role || 'ship') + ' · T' + def.tier) +
            specRow('Base hull', fmt(def.hull)) + specRow('Base shield', fmt(def.shield)) +
            specRow('Base cargo', fmt(def.cargo) + ' u') + specRow('Mass', fmt(def.mass) + ' t') +
          `</div>` +
          `<div class="sx-spec__slots"><span class="sx-spec__k">Hardpoints</span><div class="sx-tags">${slotSummary}</div></div>` +
        `</div>` +
        `<div class="sx-buybar">` +
          `<div class="sx-buybar__price"><span>Price</span><b>${def.price > 0 ? fmt(def.price) + ' cr' : 'Starter'}</b></div>` +
          (isOwned
            ? `<button type="button" class="sx-btn-ghost" disabled>In your fleet</button>`
            : `<button type="button" class="sx-btn-primary" data-buyship="${escapeHtml(def.id)}" ${afford && availability.hullEnabled ? '' : 'disabled'} aria-label="${escapeHtml(availability.hullEnabled ? (afford ? 'Buy Ship' : 'Not enough credits') : availability.hullLabel)}">${availability.hullEnabled ? (afford ? 'Buy Ship' : 'Not enough credits') : escapeHtml(availability.hullLabel)}</button>`) +
        `</div>`;
      return;
    }
    // Fleet: the projected nodes on the hull own selection. This lower circuit makes the loadout
    // legible at a glance without duplicating every slot in a permanent sidebar.
    const s = viewedShip();
    const def = s ? SHIP_BY_ID.get(s.defId) : null;
    if (!def) { sideEl.innerHTML = ''; return; }
    const slots = buildSlotList(def);
    const fittings = s.fittings || [];
    const equippedDefs = fittings.map((id) => id && FITTABLE_BY_ID.get(id)).filter(Boolean);
    const moduleMass = equippedDefs.reduce((sum, d) => sum + (Number(d.mass) || 0), 0);
    const systemDraw = new Map();
    for (const t of ['weapon', 'shield', 'engine', 'mining', 'utility']) systemDraw.set(t, 0);
    for (const d of equippedDefs) {
      const draw = Number(d.energyDraw) || (d.continuous ? Number(d.energyCost) || 0 : 0);
      systemDraw.set(d.slotType, (systemDraw.get(d.slotType) || 0) + draw);
    }
    const totalDraw = [...systemDraw.values()].reduce((a, b) => a + b, 0);
    const flows = [...systemDraw.entries()].filter(([type]) => slots.some((slot) => slot.type === type));
    const activeIndex = Number(ctx.state.player && ctx.state.player.activeShipIndex) || 0;
    const inspectedIndex = owned().indexOf(s);
    const availability = shipworksActionAvailability(ctx.state);
    // MAKE ACTIVE is a berth verb — it never renders on the flight host (SCREENS_B §1.2). While
    // docked it stays gated by hull service availability with the reason printed on the verb.
    const activeControl = host === 'flight' ? '' : inspectedIndex !== activeIndex
      ? `<button type="button" class="sx-sw-circuit__activate" data-activate-ship="${inspectedIndex}" ${availability.hullEnabled ? '' : 'disabled'} aria-label="${escapeHtml(availability.hullEnabled ? 'Make active ship' : availability.hullLabel)}">${availability.hullEnabled ? 'MAKE ACTIVE' : escapeHtml(availability.hullLabel.toUpperCase())}</button>`
      : `<span class="sx-sw-circuit__active">ACTIVE FLIGHT HULL</span>`;
    sideEl.innerHTML =
      `<div class="sx-sw-circuit">` +
        `<div class="sx-sw-circuit__identity"><span>BUILD IDENTITY</span><strong>${escapeHtml((def.role || 'ship').toUpperCase())}</strong><em>${equippedDefs.length}/${slots.length} systems fitted · ${fmt(moduleMass)}t modules</em></div>` +
        `<div class="sx-sw-circuit__core"><i aria-hidden="true"></i><span>ENERGY CORE</span><b>${fmt(def.energyCap || 0)}</b><em>${fmt(totalDraw)} continuous draw</em></div>` +
        `<div class="sx-sw-circuit__bus" aria-hidden="true"></div>` +
        `<div class="sx-sw-circuit__flows">${flows.map(([type, draw]) => {
          const available = slots.filter((slot) => slot.type === type).length;
          const fitted = slots.reduce((n, slot, i) => n + (slot.type === type && fittings[i] ? 1 : 0), 0);
          const strength = Math.max(.12, Math.min(1, totalDraw > 0 ? draw / totalDraw : .12));
          return `<div class="sx-sw-flow" style="--flow:${strength}" data-system-type="${escapeHtml(type)}">` +
            `<span class="sx-sw-flow__beam" aria-hidden="true"></span><span class="sx-sw-flow__ic">${icon(SLOT_ICON[type] || 'spark', 15)}</span>` +
            `<span class="sx-sw-flow__copy"><b>${escapeHtml(SLOT_LABEL[type] || type)}</b><em>${fitted}/${available} · ${fmt(draw)} draw</em></span>` +
          `</div>`;
        }).join('')}</div>` +
        `<div class="sx-sw-circuit__instruction"><span>SELECT ON HULL</span><b>Choose a system node to preview compatible hardware.</b>${activeControl}</div>` +
      `</div>`;
  }

  function specRow(k, v) { return `<div class="sx-kv"><span>${k}</span><b>${v}</b></div>`; }

  function moduleRole(def) {
    if (!def) return 'Station hardware';
    if (def.slotType === 'weapon') {
      const tracking = def.tracking === 'auto_turret' ? 'point-defense turret'
        : def.tracking === 'homing' ? 'guided ordnance'
          : def.tracking === 'hitscan' ? 'precision beam' : 'direct-fire weapon';
      return `${titleCaseWords(def.damageType || 'combat')} ${tracking}`;
    }
    if (def.slotType === 'shield') return 'Defensive field system';
    if (def.slotType === 'engine') return 'Propulsion and handling system';
    if (def.slotType === 'cargo') return def.mods && def.mods.hiddenCargoPct ? 'Concealed cargo system' : 'Load-space system';
    if (def.slotType === 'mining') return def.directToCargo ? 'Direct-feed extraction system' : 'Ore extraction system';
    if (def.mods && def.mods.hullRepairOOC) return 'Autonomous repair system';
    if (def.mods && def.mods.scannerCloak) return 'Sensor scrambling and stealth system';
    if (def.mods && def.mods.weaponHeatDissipPct) return 'Thermal regulation and weapon heatsink';
    if (def.mods && def.mods.weaponRangePct) return 'Fire-control support system';
    if (def.mods && def.mods.radarRangePct) return 'Long-range sensor system';
    if (def.mods && def.mods.countermeasure) return 'Defensive countermeasure';
    if (def.mods && def.mods.masslineHeadId === 'tractor') return 'Massline Tractor head';
    if (def.mods && def.mods.masslineHeadId === 'elastic_whip') return 'Massline spring-energy head';
    if (def.mods && def.mods.masslineHeadId === 'frame_coupler') return 'Massline separation-damping head';
    if (def.mods && def.mods.masslineHeadId === 'monofilament_sweep') return 'Massline hostile-cut sweep head';
    if (def.mods && def.mods.masslineHeadId === 'transverse_snare') return 'Massline free-target crossing snare';
    if (def.mods && def.mods.masslineHeadId === 'twin_bridle') return 'Massline two-endpoint world tether';
    if (def.mods && (def.mods.tetherSpoolMult || def.mods.tetherReelRateMult)) return 'Massline handling system';
    return 'Utility support system';
  }

  function moduleMetricRows(def) {
    if (!def) return [];
    const rows = [];
    const add = (label, value) => {
      if (value == null || value === '' || !Number.isFinite(Number(value))) return;
      rows.push({ label, value: Number(value) });
    };
    if (def.slotType === 'weapon' || def.slotType === 'mining') {
      add(def.slotType === 'mining' ? 'ORE DPS' : 'DPS', def.dps);
      add('RANGE', def.range);
    } else if (def.slotType === 'shield') {
      add('SHIELD', def.mods && def.mods.shieldFlat);
      add('REGEN', def.mods && def.mods.shieldRegenFlat);
    } else if (def.slotType === 'engine') {
      add('SPEED', def.mods && def.mods.topSpeed);
      add('ACCEL', def.mods && def.mods.accelMult);
    } else if (def.slotType === 'cargo') {
      add('CAPACITY', def.mods && def.mods.cargoFlat);
      add('CAP %', def.mods && def.mods.cargoCapPct ? def.mods.cargoCapPct * 100 : null);
      add('HIDDEN %', def.mods && def.mods.hiddenCargoPct ? def.mods.hiddenCargoPct * 100 : null);
    } else if (def.slotType === 'utility') {
      add('CLOAK %', def.mods && def.mods.scannerCloak ? def.mods.scannerCloak * 100 : null);
    }
    add('MASS', def.mass);
    add('DRAW', def.energyDraw != null ? def.energyDraw : def.energyCost);
    return rows.slice(0, 3);
  }

  function moduleMetricsHtml(def) {
    return moduleMetricRows(def).map((row) => {
      const suffix = row.label === 'RANGE' ? ' wu'
        : row.label === 'MASS' ? ' t'
          : row.label === 'DRAW' ? ' pwr'
            : (row.label === 'CAP %' || row.label === 'HIDDEN %' || row.label === 'CLOAK %') ? '%' : '';
      const value = Math.abs(row.value) >= 100 ? Math.round(row.value) : Math.round(row.value * 10) / 10;
      return `<span class="sx-modrow__metric"><i>${escapeHtml(row.label)}</i><b>${escapeHtml(String(value) + suffix)}</b></span>`;
    }).join('');
  }

  function capabilityDeltaChips(candidate, fitted) {
    if (!candidate || (candidate.slotType !== 'weapon' && candidate.slotType !== 'mining')) return [];
    const rows = [];
    const add = (label, candidateValue, fittedValue, higherIsBetter = true) => {
      const after = Number(candidateValue);
      if (!Number.isFinite(after)) return;
      const before = Number.isFinite(Number(fittedValue)) ? Number(fittedValue) : 0;
      const delta = after - before;
      if (Math.abs(delta) < .05) return;
      const shown = Math.abs(delta) >= 100 ? Math.round(delta) : Math.round(delta * 10) / 10;
      rows.push({
        label: `${shown > 0 ? '+' : ''}${shown} ${label}`,
        tone: (higherIsBetter ? delta > 0 : delta < 0) ? 'better' : 'worse',
      });
    };
    add(candidate.slotType === 'mining' ? 'ore dps' : 'dps', candidate.dps, fitted && fitted.dps);
    add('range', candidate.range, fitted && fitted.range);
    const candidateHeat = candidate.heatPerSec != null ? candidate.heatPerSec : candidate.heatPerShot;
    const fittedHeat = fitted && (fitted.heatPerSec != null ? fitted.heatPerSec : fitted.heatPerShot);
    add(candidate.heatPerSec != null ? 'heat/s' : 'heat/shot', candidateHeat, fittedHeat, false);
    return rows;
  }

  function shopDeltaChipsHtml(shopDelta, candidate, fitted) {
    if (!shopDelta) return '<span class="sx-modrow__unchanged">Preview unavailable</span>';
    if (shopDelta.ok) {
      const all = [...capabilityDeltaChips(candidate, fitted), ...(shopDelta.chips || [])];
      if (!all.length) return '<span class="sx-modrow__unchanged">Current fit · no ship-level change</span>';
      return all.slice(0, 4).map((chip) => {
        const label = chip.label || formatPreviewDelta(chip);
        if (!label) return '';
        const tone = chip.tone === 'better' ? 'up' : (chip.tone === 'worse' ? 'down' : '');
        return `<span class="sx-modrow__chip${tone ? ' is-' + tone : ''}">${escapeHtml(label)}</span>`;
      }).filter(Boolean).join(' ');
    }
    if (!shopDelta.ok && shopDelta.detail) {
      return `<span class="sx-modrow__chip is-unavail">${escapeHtml(shopDelta.detail)}</span>`;
    }
    return '<span class="sx-modrow__unchanged">No derived change</span>';
  }

  // ---------- slot chooser (dim + reveal compatible modules) ----------
  function stopChooserFloating() {
    if (stopChooserPositioning) { try { stopChooserPositioning(); } catch (_) {} }
    stopChooserPositioning = null;
  }

  function positionChooser(anchor, panel) {
    if (!anchor || !panel || chooserEl.hidden) return;
    computePosition(anchor, panel, {
      strategy: 'fixed',
      placement: 'right-start',
      middleware: [
        offset(18),
        flip({ fallbackPlacements: ['left-start', 'bottom'], padding: 18 }),
        shift({ padding: 18 }),
        size({
          padding: 18,
          apply({ availableWidth, availableHeight, elements }) {
            elements.floating.style.maxWidth = `${Math.max(340, Math.min(560, availableWidth))}px`;
            // Inline max-height is the only ceiling that actually binds (a stylesheet rule loses
            // to this inline write). Fit the room we actually have, hard cap 640; the 320 fall-back
            // only covers the degenerate no-space case the flip middleware could not escape.
            const maxH = availableHeight > 0 ? Math.min(availableHeight, 640) : 320;
            elements.floating.style.maxHeight = `${Math.round(maxH)}px`;
          },
        }),
      ],
    }).then(({ x, y }) => {
      if (chooserEl.hidden) return;
      Object.assign(panel.style, { left: `${x}px`, top: `${y}px` });
    }).catch(() => {});
  }

  function openChooser(slotIndex, anchorEl, opts = {}) {
    const s = viewedShip(); const def = s ? SHIP_BY_ID.get(s.defId) : null;
    if (!def) return;
    if (selectedPresetIdForHull(def.id)) {
      setSelectedPresetIdForHull(def.id, null, { remember: true });
      restoreCurrentPreview();
    }
    const slots = buildSlotList(def); const slot = slots[slotIndex]; if (!slot) return;
    if (!opts.silent) emitUiCue(UI_SWITCH_DETENT_CUE);
    const fittings = s.fittings || [];
    const fittedId = fittings[slotIndex];
    const credits = (ctx.state.player && ctx.state.player.credits) || 0;
    const availability = shipworksActionAvailability(ctx.state);
    const compat = FITTABLE.filter((d) => d.slotType === slot.type && fits(slot, d) && d.purchasable !== false)
      .sort((a, b) => (a.tier - b.tier) || (a.price - b.price));

    const list = compat.map((d) => {
      const locked = moduleLocked(d, ctx.state);
      const headConflict = findMasslineHeadConflict(fittings, slotIndex, d);
      const equipped = d.id === fittedId;
      const afford = (d.price || 0) <= credits;
      const shopDelta = presentShopModuleDelta({
        defId: def.id,
        fittings,
        moduleId: d.id,
        slotIndex,
        player: ctx.state.player,
      });
      const fittedDef = fittedId ? FITTABLE_BY_ID.get(fittedId) : null;
      const chips = shopDeltaChipsHtml(shopDelta, d, fittedDef);
      const metaFallback = escapeHtml(d.size || '') + ' · T' + d.tier;
      const btn = equipped
        ? `<span class="sx-modrow__eq">Equipped</span>`
        : headConflict
          ? `<span class="sx-modrow__lock">${icon('info', 13)} Unfit ${escapeHtml(headConflict.name)} first</span>`
        : locked
          ? `<span class="sx-modrow__lock">${icon('info', 13)} Tech locked</span>`
          : `<button type="button" class="sx-modrow__buy" data-buyfit="${escapeHtml(d.id)}" data-slot="${slotIndex}" ${afford && availability.outfitEnabled ? '' : `disabled aria-label="${escapeHtml(availability.outfitEnabled ? `${fmt(d.price)} credits, ${fmt(Math.max(0, (d.price || 0) - credits))} credits short` : availability.outfitLabel)}"`}>${availability.outfitEnabled ? (d.price > 0 ? (afford ? 'Buy · ' + fmt(d.price) : `<span>${fmt(d.price)} cr</span><small>${fmt(Math.max(0, d.price - credits))} short</small>`) : 'Fit') : 'Dock to fit'}</button>`;
      return (
        `<div class="sx-modrow${equipped ? ' is-eq' : ''}${locked || headConflict ? ' is-locked' : ''}" ${headConflict ? '' : `data-preview-module="${escapeHtml(d.id)}" data-preview-slot="${slotIndex}"`} tabindex="0">` +
          `<span class="sx-modrow__ic">${icon(SLOT_ICON[slot.type] || 'spark', 18)}</span>` +
          `<span class="sx-modrow__body"><span class="sx-modrow__name">${escapeHtml(d.name)}</span>` +
            `<span class="sx-modrow__role">${escapeHtml(moduleRole(d))} · ${metaFallback}</span>` +
            `<span class="sx-modrow__metrics">${moduleMetricsHtml(d)}</span>` +
            `<span class="sx-modrow__meta">${chips}</span></span>` +
          btn +
        `</div>`
      );
    }).join('');

    if (chooserCloseTimer) { clearTimeout(chooserCloseTimer); chooserCloseTimer = 0; }
    stopChooserFloating();
    selectedSlot = slotIndex;
    chooserAnchor = anchorEl || slotfieldEl.querySelector(`[data-spatial-slot="${slotIndex}"]`);
    slotfieldEl.classList.add('is-focusing');
    slotfieldEl.querySelectorAll('[data-spatial-slot]').forEach((node) => {
      node.classList.toggle('is-selected', Number(node.getAttribute('data-spatial-slot')) === slotIndex);
    });
    scheduleSpatialProjection();
    chooserEl.innerHTML =
      `<div class="sx-chooser__scrim" data-close></div>` +
      `<div class="sx-chooser__panel" role="dialog" aria-modal="true" aria-label="Compatible ${escapeHtml(SLOT_LABEL[slot.type] || slot.type)} modules">` +
        `<header class="sx-chooser__head">` +
          `<div><span class="sx-chooser__kicker">${SLOT_LABEL[slot.type] || slot.type} slot · Size ${escapeHtml(slot.size || '')}${slot.facing ? ' · ' + escapeHtml(slot.facing) : ''}</span>` +
          `<h3>Compatible Modules${compat.length ? ` (${compat.length})` : ''}</h3></div>` +
          `<button type="button" class="sx-chooser__x" data-close aria-label="Close">${icon('close', 18)}</button>` +
        `</header>` +
        (availability.outfitEnabled ? '' : `<p class="sx-muted">${escapeHtml(availability.outfitLabel)}</p>`) +
        (fittedId ? `<button type="button" class="sx-chooser__unfit" data-unfit="${slotIndex}" ${availability.outfitEnabled ? '' : `disabled aria-label="${escapeHtml(availability.outfitLabel)}"`}>${availability.outfitEnabled ? `Unfit ${escapeHtml((FITTABLE_BY_ID.get(fittedId) || {}).name || 'module')}` : 'Dock to unfit'}</button>` : '') +
        `<div class="sx-chooser__list">${list || '<p class="sx-muted" style="padding:14px">No compatible modules.</p>'}</div>` +
      `</div>`;
    chooserEl.hidden = false;
    const panel = chooserEl.querySelector('.sx-chooser__panel');
    positionChooser(chooserAnchor, panel);
    if (chooserAnchor && panel) {
      stopChooserPositioning = autoUpdate(chooserAnchor, panel, () => positionChooser(chooserAnchor, panel), {
        ancestorResize: true, ancestorScroll: true, elementResize: true, animationFrame: false,
      });
    }
    requestAnimationFrame(() => {
      chooserEl.classList.add('is-open');
      const first = chooserEl.querySelector('[data-preview-module], [data-unfit], [data-close]');
      if (first && typeof first.focus === 'function') first.focus({ preventScroll: true });
    });
  }

  function closeChooser(opts = {}) {
    if (chooserEl.hidden && !chooserEl.classList.contains('is-open')) return;
    if (chooserCloseTimer) { clearTimeout(chooserCloseTimer); chooserCloseTimer = 0; }
    if (!opts.silent) emitUiCue(UI_DRAWER_LATCH_CUE);
    const returnFocus = chooserAnchor;
    stopChooserFloating();
    restoreCurrentPreview();
    selectedSlot = -1;
    chooserAnchor = null;
    slotfieldEl.classList.remove('is-focusing');
    slotfieldEl.querySelectorAll('[data-spatial-slot]').forEach((node) => node.classList.remove('is-selected'));
    el.querySelector('.sx-sw__focusline').classList.remove('is-on');
    chooserEl.classList.remove('is-open');
    chooserCloseTimer = setTimeout(() => {
      chooserEl.hidden = true;
      chooserEl.innerHTML = '';
      chooserCloseTimer = 0;
      if (returnFocus && returnFocus.isConnected && typeof returnFocus.focus === 'function') returnFocus.focus({ preventScroll: true });
    }, 200);
  }

  function applyModuleGhost(moduleId, slotIndex) {
    const s = viewedShip();
    const def = s ? SHIP_BY_ID.get(s.defId) : null;
    if (!def || !moduleId) return;
    const ghost = presentModuleFitPreview({
      defId: def.id,
      fittings: s.fittings || [],
      moduleId,
      slotIndex: Number.isInteger(slotIndex) ? slotIndex : undefined,
      player: ctx.state.player,
    });
    if (!ghost.ok || !Array.isArray(ghost.afterFittings)) return;
    ghostActive = true;
    ghostSource = 'module';
    previewShip(ghost.defId, ghost.afterFittings, true, {
      mode: 'module',
      moduleId: ghost.moduleId || moduleId,
    });
    ghostBandModel = deriveBandModel({
      defId: ghost.defId,
      fittings: ghost.afterFittings,
      isPlayer: true,
      player: ctx.state.player,
      stock: false,
    });
    ghostMassDelta = buildMassDelta(def.id, {
      beforeFittings: s.fittings || [],
      afterFittings: ghost.afterFittings,
      player: ctx.state.player,
    });
    if (activeBandModel) renderApron(activeBandModel);
    if (ghostBandModel) {
      syncGaugeValues(ghostBandModel);
      syncPowerBand(ghostBandModel);
    }
    const changed = (ghost.changedRows || []).filter((row) => row.tone !== 'same').slice(0, 4);
    if (changed.length) {
      deltaEl.hidden = false;
      deltaEl.innerHTML = `<span>PROPOSED FIT</span>` + changed.map((row) => {
        const label = formatPreviewDelta(row);
        return `<b class="is-${row.tone === 'better' ? 'gain' : 'loss'}">${escapeHtml(label || row.label)}</b>`;
      }).join('');
      scheduleSpatialProjection();
    } else {
      deltaEl.hidden = true;
      deltaEl.innerHTML = '';
    }
    scheduleSpatialProjection();
  }

  function applyPresetGhost(preset) {
    const s = viewedShip();
    const def = s ? SHIP_BY_ID.get(s.defId) : null;
    if (!def || !preset || !Array.isArray(preset.fittings)) return;
    ghostActive = true;
    ghostSource = 'preset';
    previewShip(def.id, preset.fittings, true, {
      mode: 'preset',
      moduleId: null,
    });
    ghostBandModel = deriveBandModel({
      defId: def.id,
      fittings: preset.fittings,
      isPlayer: true,
      player: ctx.state.player,
      stock: false,
    });
    ghostMassDelta = buildMassDelta(def.id, {
      beforeFittings: s.fittings || [],
      afterFittings: preset.fittings,
      player: ctx.state.player,
    });
    if (activeBandModel) renderApron(activeBandModel);
    if (ghostBandModel) {
      syncGaugeValues(ghostBandModel);
      syncPowerBand(ghostBandModel);
    }
    const summary = ghostMassDelta && ghostMassDelta.ok ? ghostMassDelta.summary : '';
    if (summary) {
      deltaEl.hidden = false;
      deltaEl.innerHTML = `<span>PRESET PREVIEW</span><b>${escapeHtml(summary)}</b>`;
    } else {
      deltaEl.hidden = true;
      deltaEl.innerHTML = '';
    }
    scheduleSpatialProjection();
  }

  function refreshPresetSelectionPreview() {
    if (!activeBandModel || mode !== 'fleet') return;
    const selectedPreset = activePresetRailModel && activePresetRailModel.selectedPreset
      ? activePresetRailModel.selectedPreset
      : null;
    if (!selectedPreset) {
      restoreCurrentPreview();
      renderSpatialSlots();
      return;
    }
    applyPresetGhost(selectedPreset);
    renderSpatialSlots();
  }

  function selectPresetForViewedHull(presetId) {
    if (mode !== 'fleet') return;
    const ship = viewedShip();
    if (!ship || !ship.defId) return;
    const alreadySelected = selectedPresetIdForHull(ship.defId) === presetId;
    if (alreadySelected) {
      applySelectedPreset();
      return;
    }
    if (!chooserEl.hidden) closeChooser({ silent: true });
    selectedSlot = -1;
    slotfieldEl.classList.remove('is-focusing');
    setSelectedPresetIdForHull(ship.defId, presetId, { remember: true });
    if (activeBandModel) renderApron(activeBandModel);
    refreshPresetSelectionPreview();
    if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_click' });
  }

  function saveCurrentFitAsPreset(attrs = {}) {
    const ship = viewedShip();
    if (!ship || mode !== 'fleet') return;
    const presetId = attrs.presetId || null;
    const labelKey = attrs.labelKey || 'role';
    const createdAt = finite(attrs.createdAt, ctx.state && ctx.state.simTime);
    if (!ctx.bus) return;
    ctx.bus.emit('ui:saveLoadoutPreset', {
      shipIndex: viewIdx,
      presetId,
      labelKey,
      createdAt,
    });
    if (presetId) setSelectedPresetIdForHull(ship.defId, presetId, { remember: true });
    if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_accept' });
    setTimeout(refresh, 70);
  }

  function applySelectedPreset() {
    if (mode !== 'fleet') return;
    const ship = viewedShip();
    if (!ship || !ship.defId) return;
    const selectedPresetId = selectedPresetIdForHull(ship.defId);
    const selectedPreset = activePresetRailModel && activePresetRailModel.presets
      ? activePresetRailModel.presets.find((row) => row.id === selectedPresetId) || null
      : null;
    if (!selectedPreset) {
      if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_deny' });
      return;
    }
    if (!(selectedPreset.applyState && selectedPreset.applyState.ok)) {
      if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_deny' });
      return;
    }
    if (!ctx.bus) return;
    ctx.bus.emit('ui:applyLoadoutPreset', { shipIndex: viewIdx, presetId: selectedPreset.id });
    ctx.bus.emit('audio:cue', { id: 'ui_accept' });
    setTimeout(refresh, 80);
  }

  async function deleteSelectedPreset() {
    if (presetDeleteBusy || isConfirmOpen() || mode !== 'fleet') return;
    const ship = viewedShip();
    if (!ship || !ship.defId) return;
    const selectedPresetId = selectedPresetIdForHull(ship.defId);
    const selectedPreset = activePresetRailModel && activePresetRailModel.presets
      ? activePresetRailModel.presets.find((row) => row.id === selectedPresetId) || null
      : null;
    if (!selectedPreset || !ctx.bus) return;
    presetDeleteBusy = true;
    let ok = false;
    try {
      ok = await confirm({
        title: 'Delete build?',
        body: `${selectedPreset.label || 'This build'} will be removed from this hull.`,
        confirmLabel: 'Delete',
        cancelLabel: 'Keep',
        danger: true,
      });
    } finally {
      presetDeleteBusy = false;
    }
    if (!ok) {
      ctx.bus.emit('audio:cue', { id: 'ui_deny' });
      return;
    }
    ctx.bus.emit('ui:deleteLoadoutPreset', { shipIndex: viewIdx, presetId: selectedPreset.id });
    clearPresetSelectionForViewedHull({ remember: true });
    restoreCurrentPreview();
    ctx.bus.emit('audio:cue', { id: 'ui_accept' });
    setTimeout(refresh, 80);
  }

  // ---------- events ----------
  el.querySelector('.sx-seg').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-mode]'); if (!b) return;
    const m = b.getAttribute('data-mode'); if (m === mode) return;
    if (!chooserEl.hidden) closeChooser({ silent: true });
    mode = m;
    selectedSlot = -1;
    rememberShipView();
    el.querySelectorAll('.sx-seg__btn').forEach((x) => x.classList.toggle('is-on', x.getAttribute('data-mode') === mode));
    renderRail(); renderCenter(); renderSide();
    queueRevealSelectedShip();
    if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_tick' });
  });

  el.querySelector('.sx-sw__carousel').addEventListener('click', (ev) => {
    const step = ev.target.closest('[data-rail-step]');
    if (!step || step.disabled) return;
    const direction = step.getAttribute('data-rail-step') === 'prev' ? -1 : 1;
    railListEl.scrollBy({ left: direction * Math.max(220, railListEl.clientWidth * .72), behavior: 'smooth' });
  });
  railListEl.addEventListener('scroll', updateRailControls, { passive: true });
  railListEl.addEventListener('wheel', (ev) => {
    if (Math.abs(ev.deltaY) <= Math.abs(ev.deltaX)) return;
    const max = Math.max(0, railListEl.scrollWidth - railListEl.clientWidth);
    if (max <= 0) return;
    const next = Math.max(0, Math.min(max, railListEl.scrollLeft + ev.deltaY));
    if (next === railListEl.scrollLeft) return;
    ev.preventDefault();
    railListEl.scrollLeft = next;
  }, { passive: false });

  railListEl.addEventListener('keydown', (ev) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) return;
    const rows = [...railListEl.querySelectorAll('.sx-sw-row')];
    if (!rows.length) return;
    const current = ev.target.closest('.sx-sw-row') || railListEl.querySelector('.sx-sw-row.is-active');
    const currentIndex = Math.max(0, rows.indexOf(current));
    let nextIndex = currentIndex;
    if (ev.key === 'ArrowLeft') nextIndex = Math.max(0, currentIndex - 1);
    if (ev.key === 'ArrowRight') nextIndex = Math.min(rows.length - 1, currentIndex + 1);
    if (ev.key === 'Home') nextIndex = 0;
    if (ev.key === 'End') nextIndex = rows.length - 1;
    ev.preventDefault();
    ev.stopPropagation();
    if (nextIndex === currentIndex) {
      current?.focus({ preventScroll: true });
      queueRevealSelectedShip({ focus: true });
      return;
    }
    selectRailButton(rows[nextIndex], { focus: true });
  });

  railListEl.addEventListener('click', (ev) => {
    selectRailButton(ev.target.closest('[data-fleet], [data-buy]'));
  });

  sideEl.addEventListener('click', (ev) => {
    const slot = ev.target.closest('[data-slot]');
    if (slot) { openChooser(Number(slot.getAttribute('data-slot'))); return; }
    const buy = ev.target.closest('[data-buyship]');
    if (buy && !buy.disabled && shipworksActionAvailability(ctx.state).hullEnabled) {
      buy.disabled = true;
      if (ctx.bus) { ctx.bus.emit('ui:buyShip', { defId: buy.getAttribute('data-buyship') }); ctx.bus.emit('audio:cue', { id: 'ui_accept' }); }
      setTimeout(refresh, 60);
    }
    const activate = ev.target.closest('[data-activate-ship]');
    if (activate && !activate.disabled && ctx.bus && shipworksActionAvailability(ctx.state).hullEnabled) {
      ctx.bus.emit('ui:setActiveShip', { index: Number(activate.getAttribute('data-activate-ship')) });
      ctx.bus.emit('audio:cue', { id: 'ui_accept' });
      setTimeout(refresh, 60);
    }
  });

  statsEl.addEventListener('click', async (ev) => {
    const savePreset = ev.target.closest('[data-loadout-preset-save]');
    if (savePreset) {
      if (savePreset.disabled) {
        if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_deny' });
        return;
      }
      saveCurrentFitAsPreset({
        presetId: savePreset.getAttribute('data-loadout-preset-id') || null,
        labelKey: savePreset.getAttribute('data-loadout-label-key') || 'role',
        createdAt: Number(savePreset.getAttribute('data-loadout-created-at')),
      });
      return;
    }
    const presetNode = ev.target.closest('[data-loadout-preset-id]');
    if (presetNode) {
      const presetId = presetNode.getAttribute('data-loadout-preset-id');
      if (presetId) selectPresetForViewedHull(presetId);
      return;
    }
    const deletePreset = ev.target.closest('[data-loadout-preset-delete]');
    if (deletePreset) {
      await deleteSelectedPreset();
      return;
    }
    const verb = ev.target.closest('[data-verb]');
    if (!verb) return;
    const action = verb.getAttribute('data-verb');
    if (action === 'range') {
      const previewCtx = currentPreviewContext();
      if (previewCtx && ctx.bus) {
        ctx.bus.emit('ui:ship:range', {
          source: 'ship-stage',
          shipId: previewCtx.defId,
          fittings: Array.isArray(previewCtx.fittings) ? previewCtx.fittings.slice() : [],
        });
      } else if (ctx && ctx.screenManager && typeof ctx.screenManager.pushScreen === 'function') {
        try { ctx.screenManager.pushScreen('range'); } catch (_) {}
      }
      if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_open' });
      return;
    }
    if (action === 'record') {
      recordOpen = !recordOpen;
      rememberShipView();
      if (activeBandModel) renderApron(activeBandModel);
      if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_click' });
      return;
    }
    if (action === 'fit') {
      const fitAction = verb.getAttribute('data-fit-action') || 'fit-slot';
      if (fitAction === 'apply-preset') {
        applySelectedPreset();
        return;
      }
      const availability = shipworksActionAvailability(ctx.state);
      if (!(availability.outfitEnabled && selectedSlot >= 0)) {
        if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_deny' });
        return;
      }
      const anchor = slotfieldEl.querySelector(`[data-spatial-slot="${selectedSlot}"]`);
      openChooser(selectedSlot, anchor || null);
      return;
    }
    if (action === 'activate') {
      const availability = shipworksActionAvailability(ctx.state);
      if (host !== 'dock' || mode !== 'fleet' || !availability.hullEnabled) {
        if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_deny' });
        return;
      }
      if (ctx.bus) {
        ctx.bus.emit('ui:setActiveShip', { index: viewIdx });
        ctx.bus.emit('audio:cue', { id: 'ui_accept' });
      }
      setTimeout(refresh, 60);
    }
  });

  slotfieldEl.addEventListener('click', (ev) => {
    const node = ev.target.closest('[data-spatial-slot]');
    if (!node) return;
    openChooser(Number(node.getAttribute('data-spatial-slot')), node);
  });

  // Direct manipulation camera. Rendering and projection are event-bound; no idle frame loop.
  let dragPointer = null;
  let dragX = 0;
  const endDrag = (ev) => {
    if (dragPointer == null || (ev.pointerId != null && ev.pointerId !== dragPointer)) return;
    try { canvas.releasePointerCapture(dragPointer); } catch (_) {}
    dragPointer = null;
    canvas.classList.remove('is-dragging');
  };
  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || !mount) return;
    dragPointer = ev.pointerId;
    dragX = ev.clientX;
    canvas.setPointerCapture(ev.pointerId);
    canvas.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (dragPointer !== ev.pointerId || !mount) return;
    const dx = ev.clientX - dragX;
    dragX = ev.clientX;
    mount.rotateBy(dx * .009);
    scheduleSpatialProjection();
  });
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (ev) => {
    if (!mount) return;
    ev.preventDefault();
    const unit = ev.deltaMode === 1 ? 16
      : (ev.deltaMode === 2 ? Math.max(240, canvas.clientHeight) : 1);
    const dx = ev.deltaX * unit;
    const dy = ev.deltaY * unit;
    if (!ev.ctrlKey && Math.abs(dx) > Math.abs(dy) * .7) {
      // A two-finger horizontal gesture orbits the whole ship. It must never merely wake an idle
      // engine animation while leaving the hull apparently fixed.
      mount.rotateBy(dx * .0032);
    } else {
      // Vertical wheel and trackpad pinch both control magnification.
      mount.zoomBy(-dy * (ev.ctrlKey ? .0024 : .0012));
    }
    scheduleSpatialProjection();
  }, { passive: false });
  canvas.addEventListener('keydown', (ev) => {
    if (!mount) return;
    if (ev.key === 'ArrowLeft') { ev.preventDefault(); mount.rotateBy(-.14); scheduleSpatialProjection(); }
    else if (ev.key === 'ArrowRight') { ev.preventDefault(); mount.rotateBy(.14); scheduleSpatialProjection(); }
    else if (ev.key === '+' || ev.key === '=') { ev.preventDefault(); mount.zoomBy(.1); scheduleSpatialProjection(); }
    else if (ev.key === '-') { ev.preventDefault(); mount.zoomBy(-.1); scheduleSpatialProjection(); }
    else if (ev.key === 'Home') { ev.preventDefault(); mount.setYaw(CENTERED_SHIP_YAW); mount.setZoom(1); scheduleSpatialProjection(); }
  });
  el.querySelector('.sx-sw__camera').addEventListener('click', (ev) => {
    const control = ev.target.closest('[data-camera]');
    if (!control || !mount) return;
    const command = control.getAttribute('data-camera');
    if (command === 'left') mount.rotateBy(-.22);
    else if (command === 'right') mount.rotateBy(.22);
    else { mount.setYaw(CENTERED_SHIP_YAW); mount.setZoom(1); }
    scheduleSpatialProjection();
  });
  const stageResizeObserver = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => scheduleSpatialProjection()) : null;
  if (stageResizeObserver) stageResizeObserver.observe(stageEl);

  let buyConfirmBusy = false;
  chooserEl.addEventListener('click', async (ev) => {
    if (ev.target.closest('[data-close]')) { closeChooser(); return; }
    const bf = ev.target.closest('[data-buyfit]');
    if (bf && !bf.disabled && shipworksActionAvailability(ctx.state).outfitEnabled) {
      if (buyConfirmBusy || isConfirmOpen()) return;
      const defId = bf.getAttribute('data-buyfit');
      const slotIndex = Number(bf.getAttribute('data-slot'));
      const def = FITTABLE_BY_ID.get(defId);
      if (!def) return;
      const credits = Math.max(0, Number(ctx.state.player && ctx.state.player.credits) || 0);
      const confirmOpts = describeOutfittingSpendConfirm(def, credits, { fitSlotIndex: slotIndex });
      if (confirmOpts) {
        try { bf.focus({ preventScroll: true }); } catch (_) {
          try { bf.focus(); } catch (__) {}
        }
        buyConfirmBusy = true;
        let ok = false;
        try {
          ok = await confirm(confirmOpts);
        } finally {
          buyConfirmBusy = false;
        }
        if (!ok) {
          if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_deny' });
          return;
        }
      }
      if (ctx.bus) { ctx.bus.emit('ui:buyModule', { defId, fitSlotIndex: slotIndex }); ctx.bus.emit('audio:cue', { id: UI_SWITCH_DETENT_CUE }); }
      closeChooser(); setTimeout(refresh, 70); return;
    }
    const uf = ev.target.closest('[data-unfit]');
    if (uf && !uf.disabled && shipworksActionAvailability(ctx.state).outfitEnabled) { if (ctx.bus) { ctx.bus.emit('ui:unfitModule', { slotIndex: Number(uf.getAttribute('data-unfit')) }); ctx.bus.emit('audio:cue', { id: UI_SWITCH_DETENT_CUE }); } closeChooser(); setTimeout(refresh, 70); }
  });

  // Hover/focus: ghost afterFittings geometry + derived stats; leave restores current loadout.
  chooserEl.addEventListener('pointerover', (ev) => {
    const row = ev.target.closest('[data-preview-module]');
    if (!row || !chooserEl.contains(row)) return;
    const moduleId = row.getAttribute('data-preview-module');
    const slotIndex = Number(row.getAttribute('data-preview-slot'));
    applyModuleGhost(moduleId, Number.isInteger(slotIndex) ? slotIndex : undefined);
  });
  chooserEl.addEventListener('pointerleave', () => {
    if (ghostActive || !chooserEl.hidden) restoreCurrentPreview();
  });
  chooserEl.addEventListener('focusin', (ev) => {
    const row = ev.target.closest('[data-preview-module]');
    if (!row || !chooserEl.contains(row)) return;
    const moduleId = row.getAttribute('data-preview-module');
    const slotIndex = Number(row.getAttribute('data-preview-slot'));
    applyModuleGhost(moduleId, Number.isInteger(slotIndex) ? slotIndex : undefined);
  });
  chooserEl.addEventListener('focusout', (ev) => {
    const next = ev.relatedTarget;
    if (next && chooserEl.contains(next)) return;
    if (ghostActive || !chooserEl.hidden) restoreCurrentPreview();
  });

  el.addEventListener('keydown', (ev) => {
    if (chooserEl.hidden) return;
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closeChooser(); return; }
    if (ev.key !== 'Tab') return;
    const focusable = [...chooserEl.querySelectorAll('button:not([disabled]),[tabindex="0"]')]
      .filter((node) => node.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  });

  function refresh(periodicCtx) {
    if (host === 'flight') {
      // Flight host: no station bay behind the hull — the screen's own backdrop shows instead.
      if (mount && typeof mount.setDockId === 'function') mount.setDockId(null);
    } else {
      syncShipworksDockForState(mount, ctx.state);
    }
    // The shell owns its 18-frame status cadence. Shipworks is event-driven; repainting its full
    // body on that cadence destroys live pointer targets and wastes the authored preview frame.
    if (periodicCtx === ctx) return;
    renderRail();
    // Periodic station refreshes must not erase a pointer/focus after-fittings preview.
    if (!(ghostActive && ghostSource === 'module')) renderCenter();
    if (chooserEl.hidden) renderSide();
  }

  return {
    el,
    setHost,
    get host() { return host; },
    onShow() {
      restoreShipView();
      ensureRangeIntentHandler();
      refresh();
      if (mount) mount.setActive(true);
      powerBeam.setActive(true);
      for (const key of Object.keys(gaugeByKey)) gaugeByKey[key].fx.setActive(true);
    },
    onHide() {
      if (previewSettleTimer) clearTimeout(previewSettleTimer);
      previewSettleTimer = 0;
      if (mount) mount.setActive(false);
      powerBeam.setActive(false);
      clearAllGaugeSettles();
      for (const key of Object.keys(gaugeByKey)) gaugeByKey[key].fx.setActive(false);
    }, // stop the render loop when leaving (perf)
    refresh,
    dispose() {
      stopChooserFloating();
      if (chooserCloseTimer) clearTimeout(chooserCloseTimer);
      if (previewSettleTimer) clearTimeout(previewSettleTimer);
      if (projectionFrame) cancelAnimationFrame(projectionFrame);
      if (stageResizeObserver) stageResizeObserver.disconnect();
      if (typeof rangeIntentUnsub === 'function') { try { rangeIntentUnsub(); } catch (_) {} }
      rangeIntentUnsub = null;
      clearAllGaugeSettles();
      try { powerBeam.dispose(); } catch (_) {}
      for (const key of Object.keys(gaugeByKey)) {
        try { gaugeByKey[key].fx.dispose(); } catch (_) {}
      }
      if (mount) { try { mount.dispose(); } catch (_) {} mount = null; }
      try { delete canvas.__sfPreviewDiagnostics; } catch (_) {}
    },
  };
}
