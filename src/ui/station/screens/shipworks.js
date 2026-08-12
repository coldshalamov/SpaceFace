// src/ui/station/screens/shipworks.js — "Shipworks": ship sales + outfitter (fit
// modules) merged around ONE central ship preview. Fleet/Buy modes on the left; the ship is the
// hero object; slots are clickable — clicking one dims the room and reveals compatible modules.
// One reused preview mount (createShipPreviewMount) = the perf fix vs. a renderer-per-open.
// Emits ui:buyShip / ui:setActiveShip / ui:sellShip / ui:buyModule / ui:fitModule / ui:unfitModule.
//
// Engineering numbers come only from presenters/engineeringPreview.js → ships.getDerivedStats.
// Never invent simplified fittings/geometry or raw module.mods key diffs as flight stats.
import { buildSlotList, findMasslineHeadConflict, fits } from '../../../systems/ships.js';
import { SHIPS } from '../../../data/ships.js';
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
import {
  formatPreviewDelta,
  presentDerivedReadout,
  presentModuleFitPreview,
  presentShopModuleDelta,
  stockPreviewPlayer,
} from '../../presenters/engineeringPreview.js';

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

export function shipworksDockIdForState(state) {
  const stationId = state && state.ui && state.ui.dockedStationId;
  return dockInteriorIdForArchetype(STATION_ARCHETYPE_BY_ID.get(stationId) || null);
}

export function syncShipworksDockForState(mount, state) {
  const dockId = shipworksDockIdForState(state);
  if (mount && typeof mount.setDockId === 'function') mount.setDockId(dockId);
  return dockId;
}
const titleCaseWords = (value) => String(value || '').replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

function researched(state) {
  const r = state && state.player && (state.player.researchedNodes || state.player.researched);
  return new Set(Array.isArray(r) ? r : []);
}
function moduleLocked(d, state) { return !!(d.requiresTech && !researched(state).has(d.requiresTech)); }

/** Sum catalog DPS from real fitted weapons only (not mining beams, not invented flats). */
function fittedWeaponDps(fittings) {
  let dps = 0;
  for (const id of fittings || []) {
    if (!id) continue;
    const d = FITTABLE_BY_ID.get(id);
    if (d && d.slotType === 'weapon' && Number.isFinite(d.dps)) dps += d.dps;
  }
  return dps;
}

function fittedIdentityLine(def) {
  if (!def) return '';
  const parts = [];
  if (def.size) parts.push(String(def.size));
  if (def.tier != null) parts.push('T' + def.tier);
  return parts.join(' · ');
}

// Compact, top-down class silhouettes for the ship rail. They share one authored visual grammar,
// while the outline and secondary masses describe each ship's actual role at a glance.
const SHIP_SILHOUETTES = Object.freeze({
  ship_kestrel: '<path d="M3 14 14 8l17-2 14 8-14 8-17-2Z"/><path d="m17 8 4-5 12 7-12 8-4-6Z" class="sx-shipmark__cut"/>',
  ship_pelican: '<path d="M4 8h9l5 4h18l8 5-8 5H17l-5-4H4l7-5Z"/><path d="M35 12h9v-4l-7 2Z" class="sx-shipmark__cut"/>',
  ship_wasp: '<path d="m3 14 14-4 10-8 18 12-18 12-10-8Z"/><path d="m16 10 7 4-7 4 4-4Z" class="sx-shipmark__cut"/>',
  ship_mule: '<path d="M4 9h11l5-4h12l12 9-12 9H20l-5-4H4Z"/><path d="M7 6h10v6H7Zm0 10h10v6H7Z" class="sx-shipmark__cut"/>',
  ship_drifter: '<path d="m3 14 12-7 14 2 16 5-16 5-14 2Z"/><path d="M10 4h15l5 5-15-2Zm0 20h15l5-5-15 2Z" class="sx-shipmark__cut"/>',
  ship_hornet: '<path d="m2 14 17-3 13-9 14 12-14 12-13-9Z"/><path d="M12 7h18l-7 6Zm0 14h18l-7-6Z" class="sx-shipmark__cut"/>',
  ship_ironback: '<path d="M3 7h15l7-4h14l7 11-7 11H25l-7-4H3Z"/><path d="M4 10h13v8H4Zm20-3h13v14H24Z" class="sx-shipmark__cut"/>',
  ship_bastion: '<path d="M2 8h12l10-6 22 12-22 12-10-6H2l7-6Z"/><path d="M13 6h18l-7 7-11-3Zm0 16h18l-7-7-11 3Z" class="sx-shipmark__cut"/>',
  ship_atlas: '<path d="M2 5h12l6 3h14l12 6-12 6H20l-6 3H2Z"/><path d="M4 2h13v9H4Zm0 15h13v9H4Zm18-7h13v8H22Z" class="sx-shipmark__cut"/>',
  ship_ranger: '<path d="m2 14 18-5L35 3l11 11-11 11-15-6Z"/><path d="M11 5h18l-9 5Zm0 18h18l-9-5Z" class="sx-shipmark__cut"/><circle cx="30" cy="14" r="2" class="sx-shipmark__sensor"/>',
  ship_warden: '<path d="M2 6h15l9-4 20 12-20 12-9-4H2Z"/><path d="M8 3h17l5 7-18-2Zm0 22h17l5-7-18 2Z" class="sx-shipmark__cut"/><path d="M27 7h13v3H27Zm0 11h13v3H27Z" class="sx-shipmark__battery"/>',
  ship_colossus: '<path d="M1 5h15l10-4 21 13-21 13-10-4H1Z"/><path d="M5 2h24l8 7-22-3Zm0 24h24l8-7-22 3Z" class="sx-shipmark__cut"/><path d="M18 8h22v4H18Zm0 8h22v4H18Z" class="sx-shipmark__battery"/>',
  ship_leviathan: '<path d="M1 3h17l10-3 20 14-20 14-10-3H1Z"/><path d="M4 0h26l12 9-25-4Zm0 28h26l12-9-25 4Z" class="sx-shipmark__cut"/><path d="M13 7h29v4H13Zm0 10h29v4H13Z" class="sx-shipmark__battery"/>',
});

function shipSilhouette(def) {
  const body = SHIP_SILHOUETTES[def && def.id] || SHIP_SILHOUETTES.ship_kestrel;
  return `<svg class="sx-shipmark" viewBox="0 0 48 28" aria-hidden="true" focusable="false">${body}</svg>`;
}

export function createShipworksScreen(ctx) {
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
      `<div class="sx-sw__stage">` +
        `<canvas class="sx-sw__canvas" tabindex="0" aria-label="Interactive ship preview. Drag or scroll horizontally to orbit; scroll vertically or pinch to zoom."></canvas>` +
        `<div class="sx-sw__baylines" aria-hidden="true"><span></span><span></span><span></span></div>` +
        `<div class="sx-sw__slotfield" role="group" aria-label="Ship systems"></div>` +
        `<div class="sx-sw__focusline" aria-hidden="true"></div>` +
        `<div class="sx-sw__delta" aria-live="polite" hidden></div>` +
        `<div class="sx-sw__acquiring" role="status" aria-live="polite"><span>SHIPYARD OPTICS</span><b>Resolving final hull…</b><i aria-hidden="true"></i></div>` +
        `<div class="sx-sw__nameplate"></div>` +
        `<div class="sx-sw__camera" aria-label="Ship preview controls">` +
          `<button type="button" data-camera="left" aria-label="Rotate ship left">↶</button>` +
          `<button type="button" data-camera="reset" aria-label="Reset ship view">CENTER</button>` +
          `<button type="button" data-camera="right" aria-label="Rotate ship right">↷</button>` +
        `</div>` +
        `<span class="sx-sw__dragcue" aria-hidden="true">DRAG / TWO-FINGER HORIZONTAL TO ORBIT · VERTICAL / PINCH TO ZOOM</span>` +
      `</div>` +
      `<div class="sx-sw__stats"></div>` +
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
  let selectedSlot = -1;
  let chooserAnchor = null;
  let stopChooserPositioning = null;
  let projectionFrame = 0;
  let chooserCloseTimer = 0;
  let previewSettleTimer = 0;
  let previewSettleGeneration = 0;
  let previewRevealPhase = 'idle';

  function owned() { return (ctx.state.player && ctx.state.player.ownedShips) || []; }
  function viewedShip() { const o = owned(); return o[viewIdx] || o[ctx.state.player && ctx.state.player.activeShipIndex] || o[0] || null; }

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
      const label = acquiringEl.querySelector('b');
      if (label) label.textContent = `Resolving ${shipName(defId)} final hull…`;
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
    if (performance.now() - startedAt >= 8000) {
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
    const gated = !sameHull && !(meta && meta.mode === 'module');
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

  function renderDerivedStats(readout, fittingsForDps) {
    if (!readout || !readout.ok || !readout.derived) {
      statsEl.innerHTML = '';
      statsEl.removeAttribute('data-preview-source');
      return;
    }
    const d = readout.derived;
    const fit = fittingsForDps != null ? fittingsForDps : readout.fittings;
    const firepower = fittedWeaponDps(fit);
    const mass = Number.isFinite(d.operationalMass) ? d.operationalMass : d.mass;
    const cells = [
      { metric: 'firepower', k: 'Firepower', value: firepower, show: firepower > 0 ? Math.round(firepower) : '—', u: 'dps' },
      { metric: 'shieldMax', k: 'Shield', value: d.shieldMax, show: fmt(d.shieldMax), u: '' },
      { metric: 'hullMax', k: 'Hull', value: d.hullMax, show: fmt(d.hullMax), u: '' },
      { metric: 'cargoCap', k: 'Cargo', value: d.cargoCap, show: fmt(d.cargoCap), u: 'u' },
      { metric: 'maxSpeed', k: 'Top speed', value: d.maxSpeed, show: d.maxSpeed ? fmt(d.maxSpeed) : '—', u: '' },
      { metric: 'operationalMass', k: 'Mass', value: mass, show: fmt(mass), u: 't' },
    ];
    statsEl.setAttribute('data-preview-source', 'ships.getDerivedStats');
    statsEl.innerHTML = cells.map((c) => {
      const num = Number.isFinite(Number(c.value)) ? String(Number(c.value)) : '';
      return (
        `<div class="sx-stat" data-metric="${escapeHtml(c.metric)}" data-value="${escapeHtml(num)}">` +
          `<span class="sx-stat__k">${c.k}</span>` +
          `<span class="sx-stat__v">${c.show}${c.u ? `<i>${c.u}</i>` : ''}</span>` +
        `</div>`
      );
    }).join('');
  }

  function restoreCurrentPreview() {
    ghostActive = false;
    deltaEl.hidden = true;
    deltaEl.innerHTML = '';
    const ctxPrev = currentPreviewContext();
    if (!ctxPrev) {
      nameplateEl.innerHTML = '';
      statsEl.innerHTML = '';
      statsEl.removeAttribute('data-preview-source');
      return;
    }
    previewShip(ctxPrev.defId, ctxPrev.fittings, ctxPrev.isPlayer, null);
    const readout = presentDerivedReadout(ctxPrev.defId, ctxPrev.fittings, ctxPrev.player);
    renderDerivedStats(readout, ctxPrev.fittings);
    scheduleSpatialProjection();
  }

  // ---------- object-centric system projection ----------
  let spatialAnchors = new Map();

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

  function updateSpatialProjection() {
    if (!mount || mode !== 'fleet' || !stageEl.isConnected) return;
    const stageRect = stageEl.getBoundingClientRect();
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
        const line = el.querySelector('.sx-sw__focusline');
        const cx = stageRect.width / 2;
        const cy = stageRect.height / 2;
        const dx = x - cx;
        const dy = y - cy;
        line.style.left = `${cx}px`;
        line.style.top = `${cy}px`;
        line.style.width = `${Math.hypot(dx, dy)}px`;
        line.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
        line.classList.add('is-on');
        deltaEl.style.left = `${Math.max(16, Math.min(stageRect.width - 270, x + 24))}px`;
        deltaEl.style.top = `${Math.max(70, Math.min(stageRect.height - 130, y - 18))}px`;
      }
    });
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
    if (mode === 'fleet') {
      const s = viewedShip();
      const def = s ? SHIP_BY_ID.get(s.defId) : null;
      if (!def) { nameplateEl.innerHTML = ''; statsEl.innerHTML = ''; statsEl.removeAttribute('data-preview-source'); return; }
      const fittings = s.fittings || [];
      previewShip(def.id, fittings, true, null);
      nameplateEl.innerHTML = `<h2>${escapeHtml(def.name)}</h2><span>${escapeHtml(def.role || '')} ship · Tier ${def.tier}</span>`;
      const readout = presentDerivedReadout(def.id, fittings, ctx.state.player);
      renderDerivedStats(readout, fittings);
      renderSpatialSlots();
    } else {
      const def = SHIP_BY_ID.get(buyId);
      if (!def) return;
      previewShip(def.id, [], def.id === 'ship_kestrel', null);
      nameplateEl.innerHTML = `<h2>${escapeHtml(def.name)}</h2><span>${escapeHtml(def.role || '')} ship · Tier ${def.tier}</span>`;
      const readout = presentDerivedReadout(def.id, [], stockPreviewPlayer(ctx.state.player));
      renderDerivedStats(readout, []);
      renderSpatialSlots();
    }
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
            : `<button type="button" class="sx-btn-primary" data-buyship="${escapeHtml(def.id)}" ${afford ? '' : 'disabled'}>${afford ? 'Buy Ship' : 'Not enough credits'}</button>`) +
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
    const activeControl = inspectedIndex !== activeIndex
      ? `<button type="button" class="sx-sw-circuit__activate" data-activate-ship="${inspectedIndex}">MAKE ACTIVE</button>`
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
            : row.label === 'CAP %' ? '%' : '';
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
            elements.floating.style.maxHeight = `${Math.max(320, availableHeight)}px`;
          },
        }),
      ],
    }).then(({ x, y }) => {
      if (chooserEl.hidden) return;
      Object.assign(panel.style, { left: `${x}px`, top: `${y}px` });
    }).catch(() => {});
  }

  function openChooser(slotIndex, anchorEl) {
    const s = viewedShip(); const def = s ? SHIP_BY_ID.get(s.defId) : null;
    if (!def) return;
    const slots = buildSlotList(def); const slot = slots[slotIndex]; if (!slot) return;
    const fittings = s.fittings || [];
    const fittedId = fittings[slotIndex];
    const credits = (ctx.state.player && ctx.state.player.credits) || 0;
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
          : `<button type="button" class="sx-modrow__buy" data-buyfit="${escapeHtml(d.id)}" data-slot="${slotIndex}" ${afford ? '' : `disabled aria-label="${fmt(d.price)} credits, ${fmt(Math.max(0, (d.price || 0) - credits))} credits short"`}>${d.price > 0 ? (afford ? 'Buy · ' + fmt(d.price) : `<span>${fmt(d.price)} cr</span><small>${fmt(Math.max(0, d.price - credits))} short</small>`) : 'Fit'}</button>`;
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
          `<h3>Compatible Modules</h3></div>` +
          `<button type="button" class="sx-chooser__x" data-close aria-label="Close">${icon('close', 18)}</button>` +
        `</header>` +
        (fittedId ? `<button type="button" class="sx-chooser__unfit" data-unfit="${slotIndex}">Unfit ${escapeHtml((FITTABLE_BY_ID.get(fittedId) || {}).name || 'module')}</button>` : '') +
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

  function closeChooser() {
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
    previewShip(ghost.defId, ghost.afterFittings, true, {
      mode: 'module',
      moduleId: ghost.moduleId || moduleId,
    });
    const readout = presentDerivedReadout(ghost.defId, ghost.afterFittings, ctx.state.player);
    renderDerivedStats(readout, ghost.afterFittings);
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
  }

  // ---------- events ----------
  el.querySelector('.sx-seg').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-mode]'); if (!b) return;
    const m = b.getAttribute('data-mode'); if (m === mode) return;
    if (!chooserEl.hidden) closeChooser();
    mode = m;
    selectedSlot = -1;
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
    if (slot) { openChooser(Number(slot.getAttribute('data-slot'))); if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_click' }); return; }
    const buy = ev.target.closest('[data-buyship]');
    if (buy && !buy.disabled) { if (ctx.bus) { ctx.bus.emit('ui:buyShip', { defId: buy.getAttribute('data-buyship') }); ctx.bus.emit('audio:cue', { id: 'ui_accept' }); } setTimeout(refresh, 60); }
    const activate = ev.target.closest('[data-activate-ship]');
    if (activate && ctx.bus) {
      ctx.bus.emit('ui:setActiveShip', { index: Number(activate.getAttribute('data-activate-ship')) });
      ctx.bus.emit('audio:cue', { id: 'ui_accept' });
      setTimeout(refresh, 60);
    }
  });

  slotfieldEl.addEventListener('click', (ev) => {
    const node = ev.target.closest('[data-spatial-slot]');
    if (!node) return;
    openChooser(Number(node.getAttribute('data-spatial-slot')), node);
    if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_click' });
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
    if (bf && !bf.disabled) {
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
      if (ctx.bus) { ctx.bus.emit('ui:buyModule', { defId, fitSlotIndex: slotIndex }); ctx.bus.emit('audio:cue', { id: 'ui_click' }); }
      closeChooser(); setTimeout(refresh, 70); return;
    }
    const uf = ev.target.closest('[data-unfit]');
    if (uf) { if (ctx.bus) { ctx.bus.emit('ui:unfitModule', { slotIndex: Number(uf.getAttribute('data-unfit')) }); ctx.bus.emit('audio:cue', { id: 'ui_click' }); } closeChooser(); setTimeout(refresh, 70); }
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
    syncShipworksDockForState(mount, ctx.state);
    // The shell owns its 18-frame status cadence. Shipworks is event-driven; repainting its full
    // body on that cadence destroys live pointer targets and wastes the authored preview frame.
    if (periodicCtx === ctx) return;
    renderRail();
    // Periodic station refreshes must not erase a pointer/focus after-fittings preview.
    if (!ghostActive) renderCenter();
    if (chooserEl.hidden) renderSide();
  }

  return {
    el,
    onShow() { refresh(); if (mount) mount.setActive(true); },
    onHide() {
      if (previewSettleTimer) clearTimeout(previewSettleTimer);
      previewSettleTimer = 0;
      if (mount) mount.setActive(false);
    }, // stop the render loop when leaving (perf)
    refresh,
    dispose() {
      stopChooserFloating();
      if (chooserCloseTimer) clearTimeout(chooserCloseTimer);
      if (previewSettleTimer) clearTimeout(previewSettleTimer);
      if (projectionFrame) cancelAnimationFrame(projectionFrame);
      if (stageResizeObserver) stageResizeObserver.disconnect();
      if (mount) { try { mount.dispose(); } catch (_) {} mount = null; }
      try { delete canvas.__sfPreviewDiagnostics; } catch (_) {}
    },
  };
}
