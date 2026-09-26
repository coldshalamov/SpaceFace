import { shipworksFrameHtml } from '../../views/stationFrames.js';
import { injectOrreryShipworks, powerDialSvg } from '../../orrery/shipworksLayouts.js';
import { createHullSchematic } from '../../orrery/hullSchematic.js';
import { rollTo } from '../../orrery/text.js';
import { createSpring } from '../../orrery/motion.js';
import { svg as orrSvg, arcD as orrArcD, ticksD as orrTicksD, polar as orrPolar } from '../../orrery/svg.js';
import { syncScrollExtent } from '../../orrery/scrollExtent.js';
import { dressLampKey } from '../../orrery/lampKey.js';
import { hullPosterUrl } from '../../hullPosters.js';
// src/ui/station/screens/shipworks.js — "Shipworks" and THE SHIP: the shared stage (Frontend
// Task C §1.9). The hull fills the panel behind everything, orbitable; the hulls (fleet / for sale)
// as a column of rows down the hang; the hull's name at title size with its blurb; six compact
// static rows in the corner (Mass · Energy · Shield · Cargo · Thrust · Heat); labels pinned to the
// hull by hairline leaders; the four bands — handling, power, condition, capability — as four hero
// numbers along the foot, the selected one explaining itself in rows beneath; the verbs as words.
// Slots are clickable — choosing one puts the compatible modules in the hang column in place of the
// hulls (no modal). One reused preview mount (createShipPreviewMount) serves both hosts.
// Field Hardware chrome (kit plates, keys, quiet type) is pinned from this module; Buy / Fit /
// Make active stay the same verbs.
// Emits ui:buyShip / ui:setActiveShip / ui:sellShip / ui:buyModule / ui:fitModule / ui:unfitModule
// plus the PQ-205.03 rack intents: ui:buyPayload / ui:fitPayload / ui:unfitPayload /
// ui:sellPayload / ui:restockBombRack / ui:upgradeBombRack (the bombs system owns the writes).
//
// Engineering numbers come only from presenters/engineeringPreview.js → ships.getDerivedStats.
// Never invent simplified fittings/geometry or raw module.mods key diffs as flight stats.
// `.sx-sw`, `.sx-sw__canvas`, `.sx-sw__stage`, `.sx-sw__stats`, `.sx-sw-row[data-fleet|data-buy]`,
// `.sx-hardpoint[data-spatial-slot]`, `.sx-hardpoint__copy`, `.sx-modrow[data-preview-module]`,
// `[data-buyfit]`, `[data-buyship]`, `[data-verb]`, `.sx-sw__acquiring` are hooks the checks query.
import { modelTruthMountFractions } from '../../../data/modelTruth.js';
import {
  buildSlotList,
  dryRunLoadoutPresetApply,
  findMasslineHeadConflict,
  fitRefusalText,
  fits,
  catalogHullFacts,
  moduleSimMass,
  moduleSimPrice,
  getDerivedStats,
  hardpointClassOf,
  mountOutputFactor,
  mountRefusal,
  outfitBudgetBlocker,
  shipworksStationAccess,
  sizeFits,
  stationShopOffer,
} from '../../../systems/ships.js';
import { SHIPS } from '../../../data/ships.js';
import { techDisplayName } from '../../../data/tech.js';
import { describeHullRole } from '../../../data/shipRoleLattice.js';
import { SECTORS } from '../../../data/sectors.js';
import { MODULES } from '../../../data/modules.js';
import { BOMB_DEFS, BOMB_IDS, BOMB_RACK } from '../../../data/bombs.js';
import { TURRET_RING_OUTPUT, WEAPONS, shoveMetricValue } from '../../../data/weapons.js';
import { admitModuleMetric, liveDamageRate } from '../moduleCardMetrics.js';
import { escapeHtml } from '../../comms.js';
import { entitySpanHtml } from '../../entityResolver.js';
import { confirm, isConfirmOpen } from '../../confirm.js';
import { describeOutfittingSpendConfirm } from '../../outfittingSpendConfirm.js';
import { moduleRiskStrip } from '../../panels/moduleRisk.js';
import { describeOutfittingPurchase, masslineHeadOutcome } from '../outfittingGuidance.js';
import {
  createShipPreviewMount,
  dockInteriorIdForArchetype,
  secondaryPreviewWebGlBlocked,
} from '../../shipPreviewMount.js';
import { createRouteBeam } from '../../effects/index.js';
import { prefersReducedMotion } from '../../effects/effectRuntime.js';
import { mountDataState, settleDataState } from '../../uiPrimitives.js';
import {
  formatPreviewDelta,
  presentModuleFitPreview,
  presentShopModuleDelta,
  stockPreviewPlayer,
} from '../../presenters/engineeringPreview.js';
import { buildMassDelta } from '../../panels/massDelta.js';
import { handlingProfileDomain } from '../../panels/handlingProfile.js';
import {
  SHIP_ENGINEERING_GAUGE_DEFS,
  capabilityBandModel,
  conditionFromEntity,
  handlingBandModel,
  scarCalloutsForHull,
} from '../../ship/shipBandModels.js';
import {
  buildLoadoutPresetRailModel,
  sanitizePresetSelectionMap,
} from '../../ship/loadoutPresets.js';
import { fitHullInk, layoutHullCallouts, pointsBox, separateBeads } from '../../ship/calloutLayout.js';
import { createStagePoster, loadHullPosterManifest } from '../../ship/hullPoster.js';
import {
  dressState,
  ensureInteriorStyle,
  paintHero,
  paintHeroNum,
  paintKey,
  paintLegend,
  paintMarking,
  paintPlate,
  paintRow,
  pinKeyrack,
  syncKeys,
} from './fhChrome.js';
import { bindStationMarkup, stationControlAttrs, stationControlLabel } from '../stationBindingMap.js';

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

const SLOT_LABEL = { weapon: 'Weapon', shield: 'Shield', engine: 'Drive', cargo: 'Cargo', mining: 'Mining', utility: 'Utility', thruster: 'Thrusters' };


const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
const shipName = (id) => { const s = SHIP_BY_ID.get(id); return s ? s.name : id; };
const GAUGE_DEFS = SHIP_ENGINEERING_GAUGE_DEFS.slice();
const UI_SWITCH_DETENT_CUE = 'sfx_ui_switch_detent';
const UI_DRAWER_LATCH_CUE = 'sfx_ui_drawer_latch';

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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
  // tabindex travels with the why: a hover-only affordance does not exist for a keyboard player
  // (INSTRUMENT_GRAMMAR §7 tier 2 = hover AND focus). Buttons carrying this attr are unaffected.
  return ` data-why="${escapeHtml(String(text))}" tabindex="0"`;
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

function fittedIdentityLine(def) {
  if (!def) return '';
  const parts = [];
  if (def.size) parts.push(String(def.size));
  if (def.tier != null) parts.push('T' + def.tier);
  return parts.join(' · ');
}

/**
 * The system labels around the hull. Every bead is inside the hull's box (`keepOut`: the render's
 * ink on the poster, the beads' own spread on the live hull, never narrower than centre +-100);
 * the labels stand in a column on each side of it, stacked so no two touch, and a label can never
 * print over a bead (src/ui/ship/calloutLayout.js). The old solver placed each card next to its
 * own bead and never looked at the others, so "Thrusters OPEN / S" carried the weapon's bead on
 * its text, and each leader started 17 px below its bead, which is why they read as loose elbows.
 *
 * Returns per slot: the card relative to its bead (`calloutX` is the card's facing edge -- the
 * right edge for a left card, which the CSS pulls left by its own width), the card in stage
 * coordinates, and the leader as an SVG path relative to the bead.
 */
export function calculateSpatialSlotLayout({
  projectedSlots = [],
  stageWidth = 1100,
  stageHeight = 500,
  nodeRadius = 17,
  calloutWidth = 200,
  calloutHeight = 36,
  edgeInset = 12,
  nameplateBottom = 0,
  // Chrome that owns the right flank (gauges rack, operation plate): [{ top, bottom, leftX }].
  rightZones = [],
  // Chrome in the left flank (nameplate, camera words): [{ top, bottom, rightX, push }].
  leftZones = [],
  // Where labels may go at all (stage px); defaults to the stage less the edge inset.
  bounds = null,
  // The hull's box; defaults to the beads' spread grown by nodeRadius, at least centre +-100.
  keepOut = null,
  // Any other chrome labels must keep off, in stage px: [{ left, top, right, bottom }].
  obstacles: extraObstacles = [],
  gap = 28,
  pitch = 6,
  beadRadius = 6,
} = {}) {
  if (!Array.isArray(projectedSlots) || !projectedSlots.length || stageWidth <= 0 || stageHeight <= 0) return [];
  const cx = stageWidth * 0.5;
  const area = bounds || { left: edgeInset, top: edgeInset, right: stageWidth - edgeInset, bottom: stageHeight - edgeInset };
  let hull = keepOut;
  if (!hull) {
    const spread = pointsBox(projectedSlots, nodeRadius) || { left: cx, right: cx, top: 0, bottom: stageHeight };
    hull = {
      left: Math.min(spread.left, cx - 100),
      right: Math.max(spread.right, cx + 100),
      top: spread.top,
      bottom: spread.bottom,
    };
  }
  const obstacles = [];
  if (nameplateBottom > 0) obstacles.push({ left: 0, right: Math.max(0, hull.left - 1), top: 0, bottom: nameplateBottom });
  for (const zone of leftZones) {
    if (!zone || zone.rightX == null) continue;
    obstacles.push({ left: 0, right: zone.rightX, top: zone.top, bottom: zone.bottom });
  }
  for (const zone of rightZones) {
    if (!zone || zone.leftX == null) continue;
    obstacles.push({ left: zone.leftX, right: stageWidth, top: zone.top, bottom: zone.bottom });
  }
  // A local x that disagrees with the projection only matters dead on the centre line.
  const dots = projectedSlots.map((s) => {
    const localX = s.local && typeof s.local.x === 'number' ? s.local.x : 0;
    const onCentre = Math.abs(s.x - (hull.left + hull.right) / 2) <= 12;
    return {
      x: s.x,
      y: s.y,
      w: s.cardW || calloutWidth,
      h: s.cardH || calloutHeight,
      side: onCentre && localX ? (localX < 0 ? 'left' : 'right') : undefined,
    };
  });
  for (const ob of extraObstacles) if (ob) obstacles.push(ob);
  const placed = layoutHullCallouts({ dots, bounds: area, keepOut: hull, obstacles, gap, pitch, beadRadius });
  return placed.map((card, i) => {
    const item = projectedSlots[i];
    const isLeft = card.side === 'left';
    const calloutX = Math.round((isLeft ? card.right : card.left) - item.x);
    const calloutY = Math.round(card.top - item.y);
    const leaderD = card.leader.length
      ? card.leader.map(([px, py], k) => `${k ? 'L' : 'M'} ${Math.round(px - item.x)} ${Math.round(py - item.y)}`).join(' ')
      : '';
    return {
      item,
      index: item.index,
      order: item.order,
      x: item.x,
      y: item.y,
      isLeft,
      calloutX,
      calloutY,
      visualCardLeft: card.left,
      visualCardRight: card.right,
      visualCardTop: card.top,
      visualCardBottom: card.bottom,
      leaderD,
      zIndex: projectedSlots.length - (item.order || 0) + 2,
    };
  });
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
  el.className = 'k-panel sx-sw';
  // ORRERY: the dock host's composition (src/ui/orrery/shipworksLayouts.js); THE SHIP keeps its sheet
  injectOrreryShipworks(document);
  // The kit panel: the hulls down the hang column, the stage to its right. The canvas fills the
  // whole panel behind both (positioned like .k-world); the corner rows, the pinned labels, the
  // four bands along the foot and the verbs all sit on top. The chooser is a third child that
  // takes the hang column's cell while a slot is being chosen (`is-choosing` on the panel).
  el.innerHTML = bindStationMarkup(shipworksFrameHtml());

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
  // The hull's produced render (src/ui/ship/hullPoster.js): the stage until the authored hull has
  // drawn, and the stage for good where the live preview never arrives. Both hosts show the
  // three-quarter hero view: it is the angle the live camera frames, so the crossfade to the live
  // hull does not jump.
  const POSTER_VIEW = 'hero';
  const poster = createStagePoster(stageEl, { after: canvas, onChange: () => scheduleSpatialProjection() });
  // The six readings (mass, energy, shield, cargo, thrust, heat) are one strip under the hull
  // (ONE_PHOTOGRAPH 9.3), not a 400 px column standing over the stage's right flank: at 1280 wide
  // that column took half the stage, the hull shrank to a thumbnail and the last reading was cut.
  if (gaugeRackEl && stageEl.parentNode) stageEl.after(gaugeRackEl);

  function dressFrame() {
    ensureInteriorStyle();
    pinKeyrack(el.querySelector('.sx-seg'));
    for (const btn of el.querySelectorAll('.sx-seg__btn[data-mode]')) paintKey(btn, 'legend');
    pinKeyrack(el.querySelector('.sx-sw__camera'));
    for (const btn of el.querySelectorAll('[data-camera]')) paintKey(btn, 'small');
    for (const btn of el.querySelectorAll('[data-rail-step]')) paintKey(btn, 'small');
  }

  function dressRail() {
    ensureInteriorStyle();
    for (const row of railListEl.querySelectorAll('.sx-sw-row')) {
      paintRow(row, row.classList.contains('is-active') || row.getAttribute('aria-selected') === 'true');
    }
    syncKeys(el.querySelector('.sx-seg'));
  }

  function dressCrest() {
    ensureInteriorStyle();
    paintMarking(nameplateEl.querySelector('.sx-sw__name'));
    paintLegend(nameplateEl.querySelector('.sx-sw__conditionVerb'), true);
  }

  function dressGauges() {
    ensureInteriorStyle();
    for (const tile of gaugeRackEl.querySelectorAll('.sx-sw-gauge')) {
      paintRow(tile, false);
      paintLegend(tile.querySelector('.sx-sw-gauge__k'));
    }
  }

  function dressApron() {
    ensureInteriorStyle();
    for (const hero of statsEl.querySelectorAll('.sx-sw-hero')) {
      paintHeroNum(hero.querySelector('.k-hero__n'));
      paintLegend(hero.querySelector('.k-hero__w'), hero.classList.contains('is-selected'));
    }
    // The verbs (Take it to the range · Record · Select a slot) are the screen's actions; they used
    // to sit at the end of the hero row, which wrapped them onto a third line inside the stats
    // scroll at 1280x800 and 1080p, where they were out of sight under the side plate. They are
    // pinned as a footer row under the stats scroll instead: always on the glass, and unlike a
    // sticky-in-scroll bar they can never veil the stat rows at the scroll's trailing edge.
    const verbsRack = statsEl.querySelector('.sx-sw-verbs');
    if (verbsRack && statsEl.parentElement && verbsRack.parentElement !== statsEl.parentElement) {
      // The refresh above rebuilt a fresh rack inside statsEl, but a rack pinned out here by an
      // earlier refresh is still a child of the parent — without this the footer renders the same
      // three verbs twice, stacked.
      for (const stale of [...statsEl.parentElement.children]) {
        if (stale !== verbsRack && stale.classList && stale.classList.contains('sx-sw-verbs')) stale.remove();
      }
      statsEl.parentElement.appendChild(verbsRack);
    }
    pinKeyrack(verbsRack);
    // at rest no verb is the Lamp Key: the amber key appears with BUY & FIT when a socket is chosen;
    // taking the ship to the range stays a chevron word beside RECORD
    const range = verbsRack && verbsRack.querySelector('[data-verb="range"]');
    if (range) { range.classList.remove('orr-lampkey'); const ring = range.querySelector('.dp-holdring'); if (ring) ring.remove(); }
    // a hull for sale has no slot to select: the verb stands down while the For Sale rail is open
    el.classList.toggle('sx-sw--buying', mode === 'buy');
    for (const btn of statsEl.querySelectorAll('[data-verb]')) {
      paintKey(btn, btn.getAttribute('data-verb') === 'fit' || btn.getAttribute('data-verb') === 'activate' ? 'primary' : 'legend');
    }
    for (const label of statsEl.querySelectorAll('.sx-sw-band__label, .k-caps')) paintLegend(label, true);
    for (const row of statsEl.querySelectorAll('.k-row')) paintRow(row, false);
    pinKeyrack(statsEl.querySelector('.sx-sw-chiprow'));
    pinKeyrack(statsEl.querySelector('.sx-sw-presetrow'));
    pinKeyrack(statsEl.querySelector('.sx-sw-presetdrawer__actions'));
    for (const btn of statsEl.querySelectorAll('.sx-sw-chip, .sx-sw-preset, [data-loadout-preset-delete]')) {
      const kind = btn.hasAttribute('data-loadout-preset-delete') ? 'legend' : 'small';
      paintKey(btn, kind);
    }
    syncKeys(statsEl);
  }

  function dressSide() {
    ensureInteriorStyle();
    if (!sideEl.firstChild) return;
    paintPlate(sideEl, 'sunk');
    paintLegend(sideEl.querySelector('.sx-sw-side__name, .sx-sw-circuit__identity'), true);
    paintHero(sideEl.querySelector('.k-hero__n'));
    paintLegend(sideEl.querySelector('.k-hero__w'));
    for (const row of sideEl.querySelectorAll('.k-row')) paintRow(row, false);
    pinKeyrack(sideEl.querySelector('.sx-buybar, .sx-sw-circuit__acts'));
    const buy = sideEl.querySelector('[data-buyship]');
    if (buy) paintKey(buy, 'primary');
    const activate = sideEl.querySelector('[data-activate-ship]');
    if (activate) paintKey(activate, 'primary');
    pinKeyrack(sideEl.querySelector('.sx-sw-rack__verbs'));
    for (const btn of sideEl.querySelectorAll('[data-rack-restock], [data-rack-upgrade]')) paintKey(btn, 'small');
    syncKeys(sideEl);
  }

  function dressChooser() {
    // the list is the scroller (the panel around it never overflows), so the extent measures the list
    syncScrollExtent(chooserEl.querySelector('.sx-chooser__list:last-of-type') || chooserEl);
    ensureInteriorStyle();
    if (chooserEl.querySelector('.sf-state')) { dressState(chooserEl); return; }
    for (const label of chooserEl.querySelectorAll('.sx-chooser__kicker, .k-caps, h3')) paintLegend(label, true);
    pinKeyrack(chooserEl.querySelector('.sx-chooser__head .k-words'));
    for (const btn of chooserEl.querySelectorAll('[data-close], [data-unfit], [data-payload-unfit]')) {
      paintKey(btn, btn.hasAttribute('data-unfit') || btn.hasAttribute('data-payload-unfit') ? 'legend' : 'small');
    }
    for (const row of chooserEl.querySelectorAll('.sx-modrow')) {
      paintRow(row, row.classList.contains('is-eq'));
    }
    for (const btn of chooserEl.querySelectorAll('[data-buyfit], [data-payload-fit], [data-fit-inv]')) {
      paintKey(btn, btn.hasAttribute('data-fit-slot') || btn.hasAttribute('data-payload-fit') || btn.hasAttribute('data-fit-inv') ? 'primary' : 'small');
      // the one verb that fits the chosen module is the screen's Lamp Key while choosing
      if (btn.hasAttribute('data-fit-slot') || btn.hasAttribute('data-payload-fit')) dressLampKey(btn);
    }
    for (const btn of chooserEl.querySelectorAll('[data-payload-buy], [data-payload-sell]')) paintKey(btn, 'small');
    syncKeys(chooserEl);
  }

  dressFrame();

  // Authored mesh required — never treat box-LOD / false warmup as primary truth.
  canvas.dataset.authoredRequired = 'true';
  canvas.dataset.fallbackAllowed = 'false';
  canvas.dataset.previewReady = 'false';
  canvas.dataset.previewAssetState = 'empty';

  let mode = 'fleet';
  let viewIdx = 0;          // owned ship index being viewed/fitted
  let buyId = SHIPS[0].id;  // hull being previewed in Buy mode
  let mount = null;
  // A failed graphics allocation must not break inventory or retry on every UI refresh.
  let previewMountFailed = false;
  let curPreviewKey = '';
  let expectedPreviewDefId = null;
  let ghostActive = false;
  let ghostSource = null;
  let selectedSlot = -1;
  let payloadSocket = -1;  // rack socket index while the ordnance chooser is open
  let chooserAnchor = null;
  let projectionFrame = 0;
  let pinnedSideTop = -1;
  let chooserCloseTimer = 0;
  let previewSettleTimer = 0;
  let previewSettleGeneration = 0;
  let previewRevealPhase = 'idle';
  // While the preview is in blocked mode (secondary WebGL refused — Intel/ANGLE TDRs the live
  // flight context), the shared berth stage has been asked to seat the previewed hull; leaving
  // Shipworks must restore the player's own hull there.
  let blockedPreviewActive = false;
  let activeBandModel = null;
  let ghostBandModel = null;
  let ghostMassDelta = null;
  let activePresetRailModel = null;
  let presetSelectionByHull = {};
  let recordOpen = false;
  let selectedBand = 'handling'; // which of the four foot heroes explains itself beneath
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

  // The corner: six compact static rows (Mass · Energy · Shield · Cargo · Thrust · Heat), the value
  // at emphasis. No dials (Task C §1.9). A ghost value (a hovered module or a selected preset)
  // reads as 38 % text beside the live value.
  function ensureGaugeRack() {
    if (gaugeReady) return;
    gaugeRackEl.innerHTML = '';
    for (const def of GAUGE_DEFS) {
      const tile = document.createElement('li');
      tile.className = 'k-row k-row--static sx-sw-gauge';
      tile.setAttribute('data-gauge', def.key);
      // The gauge value is a tier-2 carrier (syncGaugeValues stamps data-why below): focusable so
      // the same reveal answers keyboard focus, not only hover.
      tile.setAttribute('tabindex', '0');
      tile.innerHTML =
        `<span class="k-row__name k-62 sx-sw-gauge__k">${escapeHtml(def.label)}</span>` +
        `<span class="k-row__num sx-sw-gauge__v"><span data-gauge-value></span><span class="k-38 sx-sw-ghost" data-gauge-ghost hidden></span></span>`;
      gaugeRackEl.appendChild(tile);
      gaugeByKey[def.key] = {
        def,
        tile,
        valueEl: tile.querySelector('[data-gauge-value]'),
        ghostEl: tile.querySelector('[data-gauge-ghost]'),
        liveText: '',
      };
    }
    gaugeReady = true;
    dressGauges();
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
    syncModeWords();
  }

  function syncModeWords() {
    el.querySelectorAll('.sx-seg__btn').forEach((x) => {
      const on = x.getAttribute('data-mode') === mode;
      x.classList.toggle('is-on', on);
      x.classList.toggle('is-active', on);
      x.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function beginPreviewReveal(defId, gated) {
    previewSettleGeneration++;
    if (previewSettleTimer) clearTimeout(previewSettleTimer);
    previewSettleTimer = 0;
    canvas.dataset.previewReady = 'false';
    canvas.dataset.previewAssetState = 'loading';
    canvas.dataset.previewReveal = gated ? 'acquiring' : 'direct';
    previewRevealPhase = gated ? 'acquiring' : 'direct';
    // A hull with a produced render needs no "reading the hull" card: the render is the stage
    // while the optics resolve, with its name, gauges and system beads on it. The card (and the
    // yielding of everything else) stays for hulls that have no render.
    const carded = gated && !poster.has();
    stageEl.classList.toggle('is-acquiring', carded);
    stageEl.classList.remove('is-revealing');
    if (acquiringEl) {
      if (carded) {
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

  // The preview's bay has one owner: For Sale draws the hull alone on the stage ring's glass, so the
  // hangar set leaves the render there; every other state keeps the docked station's bay.
  function syncStageDock() {
    if (!mount) return;
    if (host === 'dock' && mode === 'buy') { if (typeof mount.setDockId === 'function') mount.setDockId(null); return; }
    syncShipworksDockForState(mount, ctx.state);
  }

  function ensureMount() {
    if (mount) {
      syncStageDock();
      return mount;
    }
    if (previewMountFailed) return null;
    if (secondaryPreviewWebGlBlocked(ctx && ctx.state)) {
      canvas.dataset.previewReady = 'false';
      canvas.dataset.previewBlocked = 'secondary-webgl';
      return null;
    }
    canvas.dataset.authoredRequired = 'true';
    canvas.dataset.fallbackAllowed = 'false';
    canvas.dataset.previewReady = 'false';
    try {
      mount = createShipPreviewMount(canvas, {
      allowFastFallback: false,
      authoredShips: true,
      authoredWarmup: true,
      dockId: shipworksDockIdForState(ctx.state),
      onFirstFrame: ({ defId } = {}) => {
        if (!defId || defId !== expectedPreviewDefId) return;
        syncPosterLive();
        const state = mount && mount.getAssetState ? mount.getAssetState() : 'rendered';
        if (!stageEl.classList.contains('is-acquiring') || stablePreviewState(state)) settlePreviewReveal(defId, state);
        else watchPreviewSettlement(defId, previewSettleGeneration);
      },
      onAssetSettled: ({ defId, state } = {}) => {
        if (!defId || defId !== expectedPreviewDefId) return;
        syncPosterLive();
        settlePreviewReveal(defId, state || (mount && mount.getAssetState ? mount.getAssetState() : 'authored'));
      },
    });
    } catch (_) {
      previewMountFailed = true;
      canvas.dataset.previewReady = 'false';
      canvas.dataset.previewBlocked = 'webgl-unavailable';
      canvas.dataset.previewAssetState = 'unavailable';
      stageEl.classList.remove('is-acquiring', 'is-revealing');
      // With a produced render the stage still has its picture: the render is the final image,
      // the way it is on a device that refuses the second context. No error card over it.
      if (poster.has()) return null;
      stageEl.classList.add('is-preview-unavailable');
      mountDataState(acquiringEl, 'error', {
        code: 'PREVIEW_UNAVAILABLE',
        headline: 'Ship preview unavailable.',
        fills: 'The graphics context could not start. Your fleet, fittings and ship statistics remain available.',
        verb: {
          label: 'Retry ship preview',
          onActivate: () => {
            previewMountFailed = false;
            stageEl.classList.remove('is-preview-unavailable');
            settleDataState(acquiringEl);
            delete canvas.dataset.previewBlocked;
            refresh();
          },
        },
      });
      return null;
    }
    delete canvas.dataset.previewBlocked;
    stageEl.classList.remove('is-preview-unavailable');
    syncStageDock();
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

  /**
   * The blocked-mount preview. A second WebGL context is refused where it would TDR the live
   * flight context (Intel/ANGLE — `secondaryPreviewWebGlBlocked`), so the stage window's picture
   * is the authored berth-bay plate the sheet paints under `data-preview-blocked`: the same
   * authored-fallback doctrine the screen manager grants every staged screen ("the authored plate
   * is the final image"), never an empty bay. `previewReady` therefore means what it means there —
   * the final picture is on screen — and `previewAssetState` says honestly that it is a plate.
   *
   * While docked the shared UI stage still draws the berth behind the panel (veiled); re-requesting
   * `state.ui.stageRequest` with the previewed def — the same seam the berth uses (stationApp's
   * createBerth.show) — seats the selected hull there, so the ghost behind the screen and the
   * berth itself show the ship being fitted rather than a stale one.
   */
  function sharedBerthRequest() {
    const ui = ctx && ctx.state && ctx.state.ui;
    const request = ui && ui.stageRequest;
    return request && request.scene === 'berth' ? request : null;
  }

  function previewThroughSharedStage(defId) {
    blockedPreviewActive = true;
    canvas.dataset.previewAssetState = 'authored-plate';
    canvas.dataset.previewReady = 'true';
    canvas.dataset.previewReveal = 'settled';
    const ui = ctx && ctx.state && ctx.state.ui;
    const request = sharedBerthRequest();
    if (!request) return; // the in-flight host stands on the held flight frame; the plate is enough
    if (request.hullDefId !== defId) {
      ui.stageRequest = { ...request, hullDefId: defId || null, __lastStatus: undefined };
    }
  }

  /** Leaving Shipworks re-seats the player's own hull so the berth shows the ship you fly. */
  function restoreSharedStageHull() {
    if (!blockedPreviewActive) return;
    blockedPreviewActive = false;
    const ui = ctx && ctx.state && ctx.state.ui;
    const request = sharedBerthRequest();
    if (!request) return;
    const player = ctx.state && ctx.state.player;
    const ships = (player && player.ownedShips) || [];
    const ship = ships[Number(player && player.activeShipIndex) || 0] || ships[0] || null;
    const defId = (ship && ship.defId) || 'ship_kestrel';
    if (request.hullDefId === defId) return;
    ui.stageRequest = { ...request, hullDefId: defId, __lastStatus: undefined };
  }

  function previewShip(defId, fittings, isPlayer, meta) {
    poster.setHull(defId || null, posterViewFor(defId));
    ensureMount();
    writeCanvasPreviewMeta(defId, fittings, meta);
    expectedPreviewDefId = defId || null;
    if (!mount) {
      canvas.dataset.previewReady = 'false';
      if (!canvas.dataset.previewBlocked) canvas.dataset.previewBlocked = 'secondary-webgl';
      previewThroughSharedStage(defId);
      return;
    }
    blockedPreviewActive = false;
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
    if (metric.delta == null || metric.before == null || metric.after == null) return `${metric.label} —`;
    if (metric.id === 'turn' || metric.id === 'topSpeed') return `${metric.label} ${plusMinus(metric.pct)}%`;
    if (metric.id === 'stopDistance') return `${metric.label} ${plusMinus(metric.delta, 0)}m`;
    if (metric.id === 'bank') return `${metric.label} ${plusMinus(metric.delta, 2)}`;
    return `${metric.label} ${plusMinus(metric.delta, 1)}`;
  }

  // INF-081: situational predictions carry their assumption on hover/focus — a stop
  // distance is a forecast under stated conditions, while fit stats need no caveat.
  function massDeltaChipHtml(metric) {
    const text = massDeltaChipText(metric);
    if (metric && metric.basis === 'situational' && metric.assumption) {
      return `<span${whyAttr(metric.verb + ' · ' + metric.assumption)}>${escapeHtml(text)}</span>`;
    }
    return escapeHtml(text);
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
      // PQ-142.00: the four physical verbs read the fit itself, not just its derived stats — the
      // field-deploy verb is a question about what is bolted on, not about a number it produces.
      fittings,
    });
    const conditionRaw = conditionFromEntity(viewedEntityForModel());
    // the active hull docked here has no live entity to read, but it is docked, not stowed: STOWED
    // belongs to the fleet's other hulls
    const condition = conditionRaw && conditionRaw.ratio == null && viewIdx === activeFleetIndex()
      ? { ...conditionRaw, verb: 'DOCKED' }
      : conditionRaw;
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

  /**
   * Machine-readable provenance mirror for the stats panel: the same derived-stat numbers the
   * visible gauges/heroes show, stamped as [data-metric][data-value] rows so the acceptance route
   * can prove the panel reads ships.getDerivedStats and not a fabricated second source. Mirrors
   * whichever model was last synced — the ghost fit while a module/preset is previewed, the live
   * fit otherwise. statsEl.innerHTML rebuilds wipe the mirror, so it re-appends on each sync.
   */
  const PREVIEW_METRIC_KEYS = [
    'mass', 'hullMax', 'shieldMax', 'capMax', 'capRegen', 'continuousDrain',
    'cargoCap', 'operationalMass', 'turnRate', 'thrust', 'maxSpeed',
  ];
  let metricsMirrorEl = null;
  function stampStatsProvenance(model) {
    if (!statsEl) return;
    if (!model || !model.derived) {
      delete statsEl.dataset.previewSource;
      if (metricsMirrorEl) metricsMirrorEl.remove();
      metricsMirrorEl = null;
      return;
    }
    statsEl.dataset.previewSource = 'ships.getDerivedStats';
    if (!metricsMirrorEl || !metricsMirrorEl.isConnected) {
      metricsMirrorEl = document.createElement('span');
      metricsMirrorEl.className = 'sx-sw__metrics';
      metricsMirrorEl.hidden = true;
      metricsMirrorEl.setAttribute('aria-hidden', 'true');
      statsEl.appendChild(metricsMirrorEl);
    }
    metricsMirrorEl.innerHTML = PREVIEW_METRIC_KEYS.map((key) =>
      `<span data-metric="${key}" data-value="${finite(model.derived[key], 0)}"></span>`,
    ).join('');
  }

  /**
   * Write the six corner rows. `ghost: true` (a hovered module, a selected preset) leaves the live
   * value in place and writes the proposed value beside it at 38 %; a live write clears the ghost.
   */
  function syncGaugeValues(model, { ghost = false } = {}) {
    ensureGaugeRack();
    if (!model || !model.derived) {
      currentGaugeStats = null;
      stampStatsProvenance(ghostBandModel);
      return;
    }
    // Mirror the previewed fit while a ghost is on screen — a live-model refresh firing between
    // the hover and the read must not flip the provenance back to the numbers the player is not
    // being shown.
    stampStatsProvenance(ghostBandModel || model);
    const stats = {
      mass: finite(model.derived.mass, 0),
      capMax: finite(model.derived.capMax, 0),
      capRegen: finite(model.derived.capRegen, 0),
      shieldMax: finite(model.derived.shieldMax, 0),
      cargoCap: finite(model.derived.cargoCap, 0),
      maxSpeed: finite(model.derived.maxSpeed, 0),
      continuousDrain: finite(model.derived.continuousDrain, 0),
    };
    if (!ghost) currentGaugeStats = stats;
    for (const def of GAUGE_DEFS) {
      const row = gaugeByKey[def.key];
      if (!row) continue;
      const raw = stats[def.key];
      const text = `${fmt(raw)}${def.suffix}`;
      if (ghost) {
        const same = text === row.liveText;
        row.ghostEl.textContent = same ? '' : `→ ${text}`;
        row.ghostEl.hidden = same;
        // a change for the worse reads in dim bone, never in the gain's ice: mass, heat and draw want less
        const liveRaw = currentGaugeStats ? finite(currentGaugeStats[def.key], raw) : raw;
        const lowerIsBetter = /mass|heat|drain|draw/i.test(String(def.key));
        const worse = lowerIsBetter ? raw > liveRaw : raw < liveRaw;
        row.ghostEl.classList.toggle('is-loss', !same && worse);
        continue;
      }
      row.liveText = text;
      row.valueEl.textContent = text;
      row.ghostEl.textContent = '';
      row.ghostEl.hidden = true;
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
    const verb = model.condition ? model.condition.verb : 'DOCKED';
    const sentence = model.handling && model.handling.crestSentence ? model.handling.crestSentence : '';
    // The title block: the hull's name at title size, its blurb as one emphasised sentence, the
    // condition verb as a fine word after the name (it carries the why).
    nameplateEl.innerHTML =
      `<div class="sx-sw__crestLine">` +
        `<h2 class="k-display k-t-title sx-sw__name">${entitySpanHtml('hull:' + model.def.id, escapeHtml(model.def.name))}</h2>` +
        `<span class="k-t-fine k-62 sx-sw__condition${conditionClass}"${whyAttr(model.condition && model.condition.why)}>` +
          `<span class="sx-sw__conditionVerb">${escapeHtml(titleCaseWords(verb))}</span>${percent}` +
        `</span>` +
      `</div>` +
      `<p class="k-sentence k-sentence--emph sx-sw__blurb">${escapeHtml(sentence || fittedIdentityLine(model.def) || model.def.role || '')}</p>`;
    dressCrest();
  }

  // The capability band's detail: the chips as static body words (tier-2 carriers keep data-why +
  // focus); "next" as a 38 % word.
  function renderCapabilityChips(model) {
    if (!model || !model.capability) return '';
    const chips = model.capability.chips || [];
    const next = model.capability.next;
    const chipHtml = chips.map((chip) => {
      const tone = chip.tone || 'calm';
      return (
        `<li><button type="button" ${stationControlAttrs('cap-chip')} class="k-word k-word--body sx-sw-chip sx-sw-chip--${escapeHtml(tone)}" data-cap-chip="${escapeHtml(chip.id)}"${whyAttr(chip.why)}>` +
          `<span class="sx-sw-chip__verb">${escapeHtml(chip.verb)}</span>` +
          (chip.sub ? `<span class="k-word-sub sx-sw-chip__sub">${escapeHtml(chip.sub)}</span>` : '') +
        `</button></li>`
      );
    }).join('');
    const nextHtml = next
      ? (
        `<li><button type="button" ${stationControlAttrs('cap-next')} class="k-word k-word--body k-38 sx-sw-chip sx-sw-chip--goal sx-sw-chip--next" data-cap-chip="${escapeHtml(next.id)}"${whyAttr(next.why)}>` +
          `<span class="sx-sw-chip__verb">${escapeHtml(next.verb)}</span>` +
          `<span class="k-word-sub sx-sw-chip__sub">Next</span>` +
        `</button></li>`
      )
      : '';
    return `<ul class="k-words k-words--row sx-sw-chiprow">${chipHtml + nextHtml}</ul>`;
  }

  // Loadout presets as a row of fine words under the bands; the save slot is the last word.
  function renderPresetRail(model, railModel) {
    if (!model || !railModel) return '';
    const presets = Array.isArray(railModel.presets) ? railModel.presets : [];
    const saveSlot = railModel.saveSlot || null;
    const presetRows = presets.map((preset) => {
      const classes = [
        'k-word k-word--fine sx-sw-preset',
        preset.selected ? 'is-selected is-active' : '',
        preset.applyState && !preset.applyState.ok ? 'is-dim' : '',
      ].filter(Boolean).join(' ');
      const why = preset.applyState && !preset.applyState.ok ? preset.applyState.text : '';
      const aria = `${preset.label || 'Build'}. ${preset.subtitle || 'Preset'}. ${
        preset.applyState && preset.applyState.ok
          ? 'Select this build. Press again or use Apply to commit.'
          : (preset.applyState && preset.applyState.text) || 'Cannot apply right now'
      }`;
      return (
        `<li><button type="button" ${stationControlAttrs('loadout-preset')} class="${classes}" data-loadout-preset-id="${escapeHtml(preset.id)}" aria-pressed="${preset.selected ? 'true' : 'false'}"${whyAttr(why)} aria-label="${escapeHtml(aria)}">` +
          `<span class="sx-sw-preset__label">${escapeHtml(preset.label || 'Build')}</span>` +
          `<span class="k-word-sub sx-sw-preset__sub">${escapeHtml(preset.subtitle || 'Preset')}</span>` +
        `</button></li>`
      );
    }).join('');
    const saveDisabled = !saveSlot || !saveSlot.canSave;
    const saveWhy = saveDisabled ? (saveSlot && saveSlot.reasonText) || 'Cannot save right now' : '';
    const saveLabel = saveSlot ? `Save current fit as ${saveSlot.label}` : 'Save current fit';
    const countText = saveSlot ? `${saveSlot.count}/${saveSlot.cap}` : '';
    const saveButton = (
      `<li><button type="button" ${stationControlAttrs('save-build')} class="k-word k-word--fine sx-sw-preset sx-sw-preset--save${saveDisabled ? ' is-dim' : ''}" data-loadout-preset-save="1"${saveSlot ? ` data-loadout-preset-id="${escapeHtml(saveSlot.presetId)}" data-loadout-label-key="${escapeHtml(saveSlot.labelKey)}" data-loadout-created-at="${saveSlot.createdAt}"` : ''}${saveDisabled ? ' disabled' : ''}${whyAttr(saveWhy)} aria-label="${escapeHtml(saveLabel)}">` +
        `<span class="sx-sw-preset__label">Save fit</span>` +
        (countText ? `<span class="k-word-sub sx-sw-preset__sub">${escapeHtml(countText)}</span>` : '') +
      `</button></li>`
    );
    return (
      `<section class="sx-sw-band sx-sw-band--presets">` +
        `<p class="k-caps sx-sw-band__label">Builds <span class="k-38">· select to preview, again to apply</span></p>` +
        `<ul class="k-words k-words--row sx-sw-presetrow">${presetRows}${saveButton}</ul>` +
      `</section>`
    );
  }

  function renderPresetDrawer(railModel) {
    const selectedPreset = railModel && railModel.selectedPreset ? railModel.selectedPreset : null;
    if (!selectedPreset) return '';
    const verbs = Array.isArray(selectedPreset.capabilityVerbs) ? selectedPreset.capabilityVerbs.slice(0, 5) : [];
    const verbsHtml = verbs.length
      ? verbs.map((verb) => escapeHtml(verb)).join(' · ')
      : '<span class="k-38">No capability verb available</span>';
    const applyText = selectedPreset.applyState && selectedPreset.applyState.ok
      ? 'Ready to apply'
      : ((selectedPreset.applyState && selectedPreset.applyState.text) || 'Cannot apply right now');
    return (
      `<section class="sx-sw-record sx-sw-record--preset">` +
        `<p class="k-caps sx-sw-band__label">Build record</p>` +
        `<ul class="k-rows sx-sw-presetdrawer">` +
          `<li class="k-row k-row--static sx-sw-presetdrawer__row"><span class="k-row__name k-62">Label</span><span class="k-row__num">${escapeHtml(selectedPreset.label || 'Build')}</span></li>` +
          `<li class="k-row k-row--static sx-sw-presetdrawer__row"><span class="k-row__name k-62">Created cycle</span><span class="k-row__num">${escapeHtml(String(Math.max(0, Math.round(finite(selectedPreset.createdAt, 0)))))}</span></li>` +
          `<li class="k-row k-row--static sx-sw-presetdrawer__row"><span class="k-row__name k-62">Apply state</span><span class="k-row__num"${whyAttr(applyText)}>${escapeHtml(applyText)}</span></li>` +
          `<li class="k-row k-row--static sx-sw-presetdrawer__row sx-sw-presetdrawer__verbs"><span class="k-row__name k-62">Capability</span><span class="k-row__num k-t-body">${verbsHtml}</span></li>` +
        `</ul>` +
        `<ul class="k-words k-words--row sx-sw-presetdrawer__actions">` +
          `<li><button type="button" ${stationControlAttrs('delete-build')} class="k-word k-word--fine k-bad sx-sw-verb sx-sw-verb--danger" data-loadout-preset-delete="${escapeHtml(selectedPreset.id)}">${stationControlLabel('delete-build')}</button></li>` +
        `</ul>` +
      `</section>`
    );
  }

  function heroHtml(band, n, w, { tone = '', selected = false, why = '' } = {}) {
    const cls = ['k-hero', 'sx-sw-hero', tone, selected ? 'is-selected' : ''].filter(Boolean).join(' ');
    return (
      `<button type="button" ${stationControlAttrs('band')} class="${cls}" data-band="${band}" aria-pressed="${selected ? 'true' : 'false'}"${whyAttr(why)}>` +
        `<span class="k-hero__n">${escapeHtml(String(n))}</span>` +
        `<span class="k-hero__w">${escapeHtml(w)}</span>` +
      `</button>`
    );
  }

  function staticRow(k, v, { why = '', bar = null, cls = '' } = {}) {
    return (
      `<li class="k-row k-row--static ${cls}"${whyAttr(why)}>` +
        `<span class="k-row__name k-62">${escapeHtml(k)}</span>` +
        (bar != null ? `<span class="k-bar sx-sw-bar__track"><i class="k-bar__fill" style="width:${Math.max(0, Math.min(100, bar))}%"></i></span>` : '') +
        `<span class="k-row__num">${v}</span>` +
      `</li>`
    );
  }

  // The selected band explains itself in rows beneath the four heroes.
  function bandDetailHtml(model) {
    if (selectedBand === 'handling') {
      const bars = model.handling && Array.isArray(model.handling.bars) ? model.handling.bars : [];
      const rows = bars.map((bar) => {
        const ghost = ghostBandModel && ghostBandModel.handling && Array.isArray(ghostBandModel.handling.bars)
          ? ghostBandModel.handling.bars.find((row) => row.id === bar.id)
          : null;
        const live = barValueText(bar);
        const ghostText = ghost && barValueText(ghost) !== live ? ` <span class="k-38 sx-sw-ghost">→ ${escapeHtml(barValueText(ghost))}</span>` : '';
        return staticRow(bar.label, escapeHtml(live) + ghostText, { why: bar.why, bar: ghost ? ghost.bar : bar.bar, cls: `sx-sw-bar sx-sw-bar--${String(bar.id || '').replace(/[^a-zA-Z0-9_-]/g, '')}` });
      }).join('');
      const profile = model.handling && model.handling.profile;
      const meta = profile ? `${profile.flightClass || ''}${profile.driveLabel ? ' · ' + profile.driveLabel : ''}` : '';
      const ghostMetrics = ghostMassDelta && ghostMassDelta.ok && Array.isArray(ghostMassDelta.metrics)
        ? ghostMassDelta.metrics.filter((metric) => ['turn', 'topSpeed', 'stopDistance', 'bank'].includes(metric.id))
        : [];
      const ghostLine = ghostMetrics.length
        ? `<p class="k-t-fine k-38 sx-sw-ghost">${ghostMetrics.slice(0, 4).map((metric) => massDeltaChipHtml(metric)).join(' · ')}</p>`
        : '';
      return (
        (meta ? `<p class="k-t-fine k-38 sx-sw-band__meta">${escapeHtml(meta)}</p>` : '') +
        `<ul class="k-rows sx-sw-bars">${rows}</ul>` + ghostLine
      );
    }
    if (selectedBand === 'power') {
      const d = model.derived;
      const ghost = ghostBandModel && ghostBandModel.derived ? ghostBandModel.derived : null;
      const g = (key, fmtFn) => {
        if (!ghost) return '';
        const a = fmtFn(finite(d[key], 0));
        const b = fmtFn(finite(ghost[key], 0));
        return a === b ? '' : ` <span class="k-38 sx-sw-ghost">→ ${escapeHtml(b)}</span>`;
      };
      const tenth = (v) => `${Math.round(v * 10) / 10}/s`;
      return (
        `<ul class="k-rows sx-sw-power__caps">` +
          staticRow('Capacitor', fmt(d.capMax) + g('capMax', fmt)) +
          staticRow('Regen', tenth(finite(d.capRegen, 0)) + g('capRegen', tenth)) +
          staticRow('Continuous draw', tenth(finite(d.continuousDrain, 0)) + g('continuousDrain', tenth)) +
        `</ul>`
      );
    }
    if (selectedBand === 'condition') {
      const scars = model.scars || [];
      const rows = scars.length
        ? scars.map((scar) => staticRow(scar.label, escapeHtml(scar.sub || (scar.kind === 'approx' ? 'Approx' : 'Authored')), { why: scar.why }))
        : staticRow('Hull marks', 'None yet');
      return (
        `<div class="sx-sw-condition__rows"${whyAttr(model.condition && model.condition.why)}>` +
          `<ul class="k-rows">${Array.isArray(rows) ? rows.join('') : rows}</ul>` +
        `</div>`
      );
    }
    return renderCapabilityChips(model);
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
    const topSpeed = bars.find((bar) => bar.id === 'topSpeed') || null;
    const headroom = finite(model.derived.capRegen, 0) - finite(model.derived.continuousDrain, 0);
    const headroomLabel = headroom < 0
      ? `Over budget ${plusMinus(headroom, 1)}/s`
      : `Power ${plusMinus(headroom, 1)}/s`;
    const powerTone = headroom < 0 ? 'k-hero--bad sx-sw-power__state--foe' : 'k-hero--good sx-sw-power__state--you';
    const conditionVerb = titleCaseWords(model.condition ? model.condition.verb : 'DOCKED');
    const selectedPreset = activePresetRailModel && activePresetRailModel.selectedPreset
      ? activePresetRailModel.selectedPreset
      : null;
    const fitAction = selectedPreset ? 'apply-preset' : 'fit-slot';
    const fitEnabled = selectedPreset
      ? !!(selectedPreset.applyState && selectedPreset.applyState.ok)
      : !!(model.availability && model.availability.outfitEnabled && selectedSlot >= 0);
    const fitLabel = selectedPreset
      ? `Apply ${selectedPreset.label || 'build'}`
      : (
        fitEnabled
          ? 'Fit'
          : (selectedSlot >= 0
            ? (model.availability && model.availability.outfitEnabled ? 'Select a module' : model.availability.outfitLabel || 'Dock to fit')
            : 'Select a slot')
      );
    const fitBlockedText = selectedPreset
      ? (((selectedPreset.applyState && selectedPreset.applyState.text) || 'Cannot apply this build'))
      : fitLabel;
    const makeActiveVisible = host === 'dock' && mode === 'fleet' && viewIdx !== activeFleetIndex();
    const makeActiveEnabled = makeActiveVisible && model.availability && model.availability.hullEnabled;
    const makeActiveLabel = makeActiveEnabled
      ? 'Make active'
      : (model.availability && model.availability.hullLabel ? model.availability.hullLabel : 'Make active');
    statsEl.innerHTML =
      `<div class="sx-sw-bands" role="group" aria-label="Ship bands">` +
        heroHtml('handling', topSpeed ? barValueText(topSpeed) : fmt(model.derived.maxSpeed), 'top speed', { selected: selectedBand === 'handling', why: topSpeed && topSpeed.why }) +
        heroHtml('power', `${plusMinus(headroom, 1)}/s`, 'power', { tone: powerTone, selected: selectedBand === 'power', why: headroomLabel }) +
        heroHtml('condition', conditionVerb, 'condition', { selected: selectedBand === 'condition', why: model.condition && model.condition.why }) +
        heroHtml(
          'capability',
          (model.capability && model.capability.lead && model.capability.lead.value) || fmt(model.derived.cargoCap),
          (model.capability && model.capability.lead && model.capability.lead.word) || 'hold',
          {
            selected: selectedBand === 'capability',
            why: (model.capability && model.capability.lead && model.capability.lead.why) || '',
          },
        ) +
        `<ul class="k-words k-words--row sx-sw-verbs">` +
          `<li><button type="button" ${stationControlAttrs('range')} class="k-word k-word--body sx-sw-verb" data-verb="range">${escapeHtml(String(stationControlLabel('range')).replace(/\bit\b/i, `the ${model.def.name}`))}</button></li>` +
          `<li><button type="button" ${stationControlAttrs('record')} class="k-word k-word--body sx-sw-verb${recordOpen ? ' is-active' : ''}" data-verb="record" aria-pressed="${recordOpen ? 'true' : 'false'}">${stationControlLabel('record')}</button></li>` +
          `<li><button type="button" ${stationControlAttrs('fit')} class="k-word k-word--body sx-sw-verb" data-verb="fit" data-fit-action="${escapeHtml(fitAction)}"${selectedPreset ? ` data-loadout-preset-id="${escapeHtml(selectedPreset.id)}"` : ''}${fitEnabled ? '' : ` disabled aria-label="${escapeHtml(fitBlockedText)}"`}>${escapeHtml(fitLabel)}</button></li>` +
          (makeActiveVisible
            ? `<li><button type="button" ${stationControlAttrs('activate')} class="k-word k-word--body sx-sw-verb" data-verb="activate"${makeActiveEnabled ? '' : ` disabled aria-label="${escapeHtml(makeActiveLabel)}"`}>${escapeHtml(makeActiveLabel)}</button></li>`
            : '') +
        `</ul>` +
      `</div>` +
      `<section class="sx-sw-band sx-sw-band--${escapeHtml(selectedBand)}" aria-live="polite">${bandDetailHtml(model)}</section>` +
      renderPresetRail(model, activePresetRailModel) +
      renderPresetDrawer(activePresetRailModel) +
      (recordOpen
        ? `<section class="sx-sw-record"><p class="k-caps sx-sw-band__label">Record</p><ul class="k-rows sx-sw-record__grid">${recordRowsHtml(model)}</ul></section>`
        : '');
    dressApron();
  }

  // The hull's systems round the dial: each slot type once, how many of its slots are fitted, and
  // whether a stock drive stands in for an empty engine slot (the drawing counts it as fitted).
  function circuitSystems(def, fittings) {
    const slots = buildSlotList(def);
    const fits = fittings || [];
    const stockDrive = !!(activeBandModel && activeBandModel.handling && activeBandModel.handling.profile && activeBandModel.handling.profile.driveLabel);
    const out = [];
    for (const type of ['weapon', 'shield', 'engine', 'cargo', 'mining', 'utility', 'thruster']) {
      const available = slots.filter((slot) => slot.type === type).length;
      if (!available) continue;
      const fitted = slots.reduce((n, slot, i) => n + (slot.type === type && fits[i] ? 1 : 0), 0);
      out.push({ type, label: SLOT_LABEL[type] || type, fitted, available, stock: type === 'engine' && fitted === 0 && stockDrive });
    }
    return out;
  }

  // The circuit's ghost arc: what the fittings being previewed would draw from the core.
  function circuitDraws(def, fittings) {
    const draws = new Map();
    for (const f of fittings || []) {
      const d = f && FITTABLE_BY_ID.get(f);
      if (!d) continue;
      const draw = Number(d.energyDraw) || (d.continuous ? Number(d.energyCost) || 0 : 0);
      draws.set(d.slotType, (draws.get(d.slotType) || 0) + draw);
    }
    return [...draws.entries()];
  }
  function syncPowerGhost(def, afterFittings) {
    const core = sideEl && sideEl.querySelector('.sx-sw-circuit__core');
    const s = viewedShip();
    if (!core || !def || !s) return;
    const dial = core.querySelector('.orr-power');
    const html = powerDialSvg({ cap: def.energyCap || 0, draws: circuitDraws(def, s.fittings), ghost: afterFittings ? circuitDraws(def, afterFittings) : null,
      systems: circuitSystems(def, afterFittings || s.fittings) });
    if (dial) dial.outerHTML = html;
  }

  function restoreCurrentPreview() {
    for (const n of jigHost ? jigHost.querySelectorAll('.orr-sw-node.is-preview') : []) n.classList.remove('is-preview');
    { const s = viewedShip(); const def = s ? SHIP_BY_ID.get(s.defId) : null; if (def) syncPowerGhost(def, null); }
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
  // Per slot index: its type and its place among slots of that type, for the poster's marks.
  let spatialSlotMeta = new Map();
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
    const weaponMounts = modelTruthMountFractions(def.id, 'SOCKET_Weapon_');
    const engineMounts = modelTruthMountFractions(def.id, 'SOCKET_Engine_');
    if (slot.type === 'weapon' && weaponMounts[ordinal]) {
      pos = weaponMounts[ordinal].pos;
      authored = true;
    } else if (slot.type === 'engine' && engineMounts.length) {
      if (slots.filter((s) => s.type === 'engine').length > 1 && engineMounts[ordinal]) {
        pos = engineMounts[ordinal].pos;
      } else {
        const sum = engineMounts.reduce((a, m) => [a[0] + m.pos[0], a[1] + m.pos[1], a[2] + m.pos[2]], [0, 0, 0]);
        pos = sum.map((n) => n / engineMounts.length);
      }
      authored = true;
    } else if (slot.type === 'mining') {
      const miningMounts = modelTruthMountFractions(def.id, 'SOCKET_Mining_');
      if (miningMounts[ordinal] || miningMounts[0]) {
        pos = (miningMounts[ordinal] || miningMounts[0]).pos;
        authored = true;
      } else if (visuals.drill) {
        const spread = (ordinal - (slots.filter((s) => s.type === 'mining').length - 1) / 2) * .18;
        pos = [visuals.drill[0], visuals.drill[1] - .04, visuals.drill[2] + spread];
        authored = true;
      }
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
        `<button type="button" ${stationControlAttrs('scar')} class="sf-anchor sf-scar sx-sw-scar" data-scar-id="${escapeHtml(scar.id)}" data-anchor-kind="${kind}" tabindex="0"${whyAttr(scar.why)} aria-label="${escapeHtml(`${scar.label}. ${sub}`)}">` +
          `<span class="sx-sw-scar__dot" aria-hidden="true"></span>` +
          `<span class="sx-sw-scar__copy"><b>${escapeHtml(scar.label)}</b><em>${escapeHtml(sub)}</em></span>` +
        `</button>`
      );
    }).join('');
  }

  // ORRERY (dock host): the hull on its jig -- the plan drawing in a dial, every system a node on
  // it with its name on a leader in a column beside (the refit's law, src/ui/orrery/hullSchematic.js).
  // The hardpoint buttons stay the controls (focus, Enter, the chooser, the checks); a node or its
  // name is a way to the same button. Where a hull has no drawing the schematic stands down and the
  // live stage shows as before.
  // ONE STAGE RING: the dial the Fleet jig draws and the For Sale ring are one box. The band under the
  // dial (the verbs' row, and on a short screen the caption) is reserved from the stage's size alone, so
  // the jig's ring never chases the verbs and the verbs never chase the ring; For Sale reuses the ring the
  // jig last drew at this stage size, so switching modes reloads the same dial.
  const RING_EDGE = 40; const RING_GAP = 30; const RING_LABEL = 220;
  const ringShort = () => (typeof window !== 'undefined' ? window.innerHeight : 1080) <= 800;
  // the jig's own radius rule for a band [top, bottom] (src/ui/orrery/hullSchematic.js)
  function ringRadius(W, top, bottom) {
    const bandMargin = Math.min(52, Math.round((bottom - top) * 0.11));
    return Math.max(110, Math.min(W / 2 - RING_EDGE - RING_GAP - RING_LABEL, (bottom - top) / 2 - bandMargin));
  }
  // where the verbs' row stands (stage px): under the dial's engraving on a tall stage; on a short
  // dock stage its words stand on the stage's foot, clear of the dial's caption and of the dock rail
  function verbRowTop(W, H) {
    if (ringShort() && host === 'dock') return H - 13;
    return H / 2 + ringRadius(W, 28, H - 28) + 42;
  }
  // the top of the jig's band: nameplate lines crossing the stage's middle third push it down (the jig's rule)
  function jigBandTop(W, H) {
    const sr = stageEl.getBoundingClientRect();
    let top = 28;
    for (const e of [nameplateEl.querySelector('.sx-sw__crestLine'), nameplateEl.querySelector('.sx-sw__blurb'), el.querySelector('.sx-sw__gauges')]) {
      if (!e) continue;
      const r = e.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) continue;
      const ob = { left: r.left - sr.left - 12, right: r.right - sr.left + 12, top: r.top - sr.top - 12, bottom: r.bottom - sr.top + 12 };
      if (ob.right <= W * 0.34 || ob.left >= W * 0.66) continue;
      if ((ob.top + ob.bottom) / 2 < H / 2) top = Math.max(top, ob.bottom);
    }
    return top;
  }
  // the bottom of the dial's band (stage px): the verbs' row less its clearance; on a short dock stage
  // the dial's foot stands 27px above the stage's foot, so its caption and the verbs both clear it
  function ringBandBottom(W, H, top) {
    if (!(ringShort() && host === 'dock')) return Math.min(H - 28, verbRowTop(W, H) - 12);
    let bottom = H - 28;
    for (let i = 0; i < 3; i++) bottom = Math.min(H - 28, 2 * (H - 27 - ringRadius(W, top, bottom)) - top);
    return bottom;
  }
  // the band under the dial as the jig's obstacle: the dial's own width, from the band to the stage's foot
  // (it spans the middle third, so the jig's band ends on it; it stays out of the label columns)
  const ringBandObstacle = {
    getBoundingClientRect() {
      const sr = stageEl.getBoundingClientRect();
      const W = stageEl.clientWidth || 0; const H = stageEl.clientHeight || 0;
      const top = sr.top + ringBandBottom(W, H, jigBandTop(W, H)) + 12;
      const left = sr.left + W / 2 - 110;
      const bottom = Math.max(top + 1, sr.top + H);
      return { left, right: left + 220, top, bottom, width: 220, height: bottom - top, x: left, y: top };
    },
  };
  // the ring the jig drew last, read off its own dial path, with the stage size it was drawn for
  let jigRing = null;
  // the jig's ring stands on a luminous band (weight, not wire): drawn into the jig's host under its layers
  let jigBand = null;
  let jigBandKey = '';
  function drawJigBand() {
    const r = host === 'dock' && mode !== 'buy' ? readJigRing() : null;
    if (!r || !jigHost) { if (jigBand) jigBand.style.display = 'none'; jigBandKey = ''; return; }
    if (!jigBand) jigBand = orrSvg('svg', { class: 'orr-svg sx-sw__jigband', 'aria-hidden': 'true', focusable: 'false' });
    if (jigBand.parentNode !== jigHost) {
      const pool = jigHost.querySelector(':scope > .orr-hull__pool');
      jigHost.insertBefore(jigBand, pool ? pool.nextSibling : jigHost.firstChild);
      jigBandKey = '';
    }
    jigBand.style.display = '';
    const key = `${r.hx}|${r.hy}|${r.R}|${r.W}|${r.H}`;
    if (key === jigBandKey) return;
    jigBandKey = key;
    jigBand.setAttribute('viewBox', `0 0 ${r.W} ${r.H}`);
    jigBand.textContent = '';
    jigBand.appendChild(orrSvg('path', { d: orrArcD(r.hx, r.hy, r.R, 0, 360), class: 'orr-band' }));
  }
  function readJigRing() {
    if (!jigHost || !jigHost.classList.contains('orr-hull--on')) return null;
    for (const p of jigHost.querySelectorAll('path.orr-rest')) {
      const m = /^M (-?[\d.]+) (-?[\d.]+) A (-?[\d.]+) \3 0 1 1 [^A]+A /.exec(p.getAttribute('d') || '');
      const vb = p.ownerSVGElement && String(p.ownerSVGElement.getAttribute('viewBox') || '').split(/\s+/).map(Number);
      if (m && vb && vb.length === 4) return { hx: Number(m[1]), hy: Number(m[2]) + Number(m[3]), R: Number(m[3]), W: Math.round(vb[2]), H: Math.round(vb[3]) };
    }
    return null;
  }
  // the stage ring's geometry: the jig's own ring at this stage size, else the jig's formula over the same band
  function stageRingGeo() {
    const W = stageEl.clientWidth || 0; const H = stageEl.clientHeight || 0;
    if (W < 240 || H < 160) return null;
    if (mode !== 'buy') { const r = readJigRing(); if (r) jigRing = r; }
    if (jigRing && Math.abs(jigRing.W - W) <= 1 && Math.abs(jigRing.H - H) <= 1) return { hx: jigRing.hx, hy: jigRing.hy, R: jigRing.R, W, H };
    const top = mode === 'buy' ? 28 : jigBandTop(W, H);
    const bottom = ringBandBottom(W, H, top);
    const R = ringRadius(W, top, bottom);
    // For Sale reached before the jig has drawn at this size: on a short dock stage the Fleet dial stands
    // on its foot line (the nameplate's lines push it there), so the sale dial stands there too
    const hy = mode === 'buy' && ringShort() && host === 'dock' ? Math.max((top + bottom) / 2, H - 27 - R) : (top + bottom) / 2;
    return { hx: W / 2, hy, R, W, H };
  }
  // the render manifest: a hull's length for the caption (four hulls carry one; the rest say none)
  let posterManifest = null;
  loadHullPosterManifest().then((m) => { if (m) { posterManifest = m; scheduleSpatialProjection(); } }).catch(() => {});
  function hullLengthM(defId) {
    const hull = posterManifest && posterManifest.hulls && posterManifest.hulls[defId];
    const view = hull && (hull.hero || hull.top || hull.side);
    const n = view && Array.isArray(view.hullSize) ? Number(view.hullSize[view.longAxis || 0]) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  // a caption on the dial's lower arc, reading left to right, baseline `r` out from the centre
  function captionArc(svgEl, g, r, text, id) {
    const f = (n) => Math.round(n * 100) / 100;
    const [x0, y0] = orrPolar(g.hx, g.hy, r, 240);
    const [x1, y1] = orrPolar(g.hx, g.hy, r, 120);
    svgEl.appendChild(orrSvg('path', { id, d: `M ${f(x0)} ${f(y0)} A ${f(r)} ${f(r)} 0 0 0 ${f(x1)} ${f(y1)}`, fill: 'none', stroke: 'none' }));
    const t = orrSvg('text', { class: 'sx-sw__salering-cap' });
    const tp = orrSvg('textPath', { href: `#${id}`, startOffset: '50%', 'text-anchor': 'middle' });
    tp.textContent = text;
    t.appendChild(tp);
    svgEl.appendChild(t);
    return t;
  }
  // the caption's radius: the jig engraving's on a tall stage, tucked under the foot on a short one
  const captionRadius = (g) => g.R + (ringShort() ? 16 : 38);
  // the Fleet dial's caption where the jig could not engrave one (its leaders cross both arcs on a short stage)
  let jigCaption = null;
  let fleetCap = null;
  function drawFleetCaption(g) {
    const want = g && host === 'dock' && mode === 'fleet' && jigCaption && jigHost && jigHost.classList.contains('orr-hull--on')
      && !jigHost.querySelector('.orr-micro');
    if (!want) { if (fleetCap) { fleetCap.remove(); fleetCap = null; } return; }
    if (!fleetCap) { fleetCap = orrSvg('svg', { class: 'orr-svg sx-sw__fleetcap', 'aria-hidden': 'true', focusable: 'false' }); stageEl.appendChild(fleetCap); }
    fleetCap.setAttribute('viewBox', `0 0 ${g.W} ${g.H}`);
    fleetCap.textContent = '';
    const len = hullLengthM(jigCaption.defId);
    const text = [jigCaption.name, len ? `${len.toFixed(1)} m` : ''].filter(Boolean).join(' · ').toUpperCase();
    if (text) captionArc(fleetCap, g, captionRadius(g), text, 'sx-sw-fleetcap');
  }
  let saleRing = null;
  let saleZoomKey = '';
  // The live hull on the glass: hulls are painted from bright copper to near-black, and the preview lights
  // them for a bay they no longer stand in. After each change of hull, bearing or asset the render is read
  // back once (a 96px copy) and lifted until its bright pixels read like the Pelican's, and the canvas is
  // shifted so the silhouette's box is centred on the ring.
  let saleLightKey = '';
  let saleLightAt = 0;
  let saleLightTimer = 0;
  let saleSample = null;
  let saleLightHull = '';
  let saleLightTries = 0;
  const SALE_HULL_P90 = 88;
  // the authored hull arrives on its own clock (no projection follows it on a hull with no render):
  // look again shortly while the picture is empty or still a stand-in
  function relightSaleHullSoon(g) {
    if (saleLightTimer || saleLightTries >= 24) return;
    saleLightTries += 1;
    saleLightTimer = setTimeout(() => {
      saleLightTimer = 0;
      if (stageEl.isConnected && stageEl.classList.contains('has-salering')) lightSaleHull(stageRingGeo() || g);
    }, 500);
  }
  function lightSaleHull(g) {
    if (!mount || typeof mount.frame !== 'function' || !canvas) return;
    if (buyId !== saleLightHull) { saleLightHull = buyId; saleLightTries = 0; }
    if (poster.has() && !poster.isLive()) return;
    const view = typeof mount.getView === 'function' ? mount.getView() : { yaw: 0, zoom: 1 };
    const state = typeof mount.getAssetState === 'function' ? mount.getAssetState() : '';
    const key = `${buyId}|${Math.round(g.R)}|${Number(view.yaw || 0).toFixed(2)}|${Number(view.zoom || 1).toFixed(2)}|${state}|${canvas.clientWidth}`;
    if (key === saleLightKey) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - saleLightAt < 140) {
      if (!saleLightTimer) saleLightTimer = setTimeout(() => { saleLightTimer = 0; if (stageEl.isConnected && stageEl.classList.contains('has-salering')) lightSaleHull(stageRingGeo() || g); }, 160);
      return;
    }
    saleLightAt = now;
    try {
      const N = 96;
      if (!saleSample) { saleSample = document.createElement('canvas'); saleSample.width = N; saleSample.height = N; }
      const c2 = saleSample.getContext('2d', { willReadFrequently: true });
      if (!c2) return;
      // the drawing buffer is only readable in the task that drew it
      mount.frame();
      c2.clearRect(0, 0, N, N);
      c2.drawImage(canvas, 0, 0, N, N);
      const d = c2.getImageData(0, 0, N, N).data;
      const lum = [];
      let x0 = N; let y0 = N; let x1 = -1; let y1 = -1;
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const i = (y * N + x) * 4;
          const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          if (l < 6) continue;
          lum.push(l);
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      if (lum.length < 40) { relightSaleHullSoon(g); return; }
      saleLightKey = key;
      if (!/^authored/.test(String(state || ''))) relightSaleHullSoon(g);
      lum.sort((a, b) => a - b);
      const p90 = lum[Math.floor(lum.length * 0.9)];
      const k = Math.max(1.2, Math.min(3.2, SALE_HULL_P90 / Math.max(1, p90)));
      canvas.style.setProperty('filter', `brightness(${k.toFixed(2)}) contrast(1.04)`);
      const cw = canvas.clientWidth || 0; const ch = canvas.clientHeight || 0;
      const dx = (((x0 + x1 + 1) / 2) / N) * cw - cw / 2;
      const dy = (((y0 + y1 + 1) / 2) / N) * ch - ch / 2;
      canvas.style.setProperty('translate', `${Math.round(-dx)}px ${Math.round(-dy)}px`);
      canvas.dataset.saleLight = `p90 ${Math.round(p90)} k ${k.toFixed(2)} dx ${Math.round(dx)} dy ${Math.round(dy)}`;
    } catch (_) { /* a render that cannot be read keeps the sheet's lift */ }
  }
  // the For Sale stage as the instrument: the ring, its tick scale, the caption arc naming the hull, the view
  // words as marks on the upper arc, a glass under the render so the ship separates from the hangar
  // the hull's socket kinds on the disc's lower arc, flanking the caption: left from the equator down,
  // right from the foot up (bearings clockwise from the top)
  const SOCKET_MARKS = [['weapon', 255], ['shield', 240], ['engine', 225], ['cargo', 210], ['mining', 150], ['utility', 135], ['thruster', 120]];
  // a short stage's caption takes a wider share of its small dial: the marks step up away from it
  const SOCKET_MARKS_SHORT = [['weapon', 258], ['shield', 244], ['engine', 230], ['cargo', 216], ['mining', 144], ['utility', 130], ['thruster', 116]];
  function drawSaleRing(g) {
    if (!g) {
      if (saleRing) { saleRing.remove(); saleRing = null; }
      saleZoomKey = '';
      saleLightKey = '';
      saleGeo = null;
      if (bezelTurn !== 0 || saleView !== 'reset') { saleView = 'reset'; turnSpring.set(0, { instant: true }); }
      stageEl.classList.remove('has-salering', 'has-viewmarks', 'has-sockets', 'is-turning');
      if (canvas && canvas.style) { canvas.style.removeProperty('filter'); canvas.style.removeProperty('translate'); }
      return;
    }
    if (!saleRing) {
      saleRing = orrSvg('svg', { class: 'orr-svg sx-sw__salering', 'aria-hidden': 'true', focusable: 'false' });
      stageEl.appendChild(saleRing);
    }
    ensureTurnSurface();
    // a new hull on the disc arrives facing the centre view
    if (buyId !== saleTurnHull) {
      saleTurnHull = buyId;
      if (bezelTurn !== 0 || saleView !== 'reset') { saleView = 'reset'; turnSpring.set(0, { instant: true }); }
    }
    saleRing.setAttribute('viewBox', `0 0 ${g.W} ${g.H}`);
    saleRing.textContent = '';
    const f = (n) => Math.round(n * 100) / 100;
    const short = ringShort();
    const ringD = orrArcD(g.hx, g.hy, g.R, 0, 360);
    saleRing.appendChild(orrSvg('path', { d: ringD, class: 'orr-band sx-sw__salering-band' }));
    saleRing.appendChild(orrSvg('path', { d: ringD, class: 'orr-edge sx-sw__salering-ring' }));
    // the arcs the scale leaves open: under the caption and under each socket group
    const open = [];
    // the caption on the lower arc leads with the hull's name, then what the column beside does not say:
    // its length, and on a tall stage its role (a short stage keeps it to the name and the length)
    const def = SHIP_BY_ID.get(buyId);
    if (def) {
      const len = hullLengthM(def.id);
      const role = short ? '' : ((describeHullRole(def.id) || {}).roleLabel || def.role || '');
      const text = [def.name, len ? `${len.toFixed(1)} m` : '', role].filter(Boolean).join(' \u00b7 ').toUpperCase();
      if (text) {
        const rc = captionRadius(g);
        const t = captionArc(saleRing, g, rc, text, 'sx-sw-salecap');
        let span = 0;
        try { span = (t.getComputedTextLength() / rc) * (180 / Math.PI); } catch (_) { span = 0; }
        if (!(span > 0)) span = (text.length * 8) / rc * (180 / Math.PI);
        open.push([180 - span / 2 - 3, 180 + span / 2 + 3]);
      }
    }
    // the sockets: this hull's across the stroke (one your hull lacks in ice), yours as ghost ticks inside
    // it, each kind named beyond its ticks by the word's nearest corner (the view marks' rule)
    const mine = activeOwnedDef();
    const compare = !!(def && mine && mine.id !== def.id);
    let socketPaths = { sale: '', gain: '', ghost: '' };
    if (def) {
      for (const [type, bearing] of (short ? SOCKET_MARKS_SHORT : SOCKET_MARKS)) {
        const n = ((def.slots && def.slots[type]) || []).length;
        const m = compare ? ((mine.slots && mine.slots[type]) || []).length : n;
        const count = Math.max(n, m);
        if (!count) continue;
        const stepPx = count > 1 ? Math.min(short ? 5 : 6, (g.R * (10 * Math.PI / 180)) / (count - 1)) : 0;
        const stepDeg = (stepPx / g.R) * (180 / Math.PI);
        for (let i = 0; i < count; i++) {
          const a = bearing + (i - (count - 1) / 2) * stepDeg;
          if (i < n) {
            const [x0, y0] = orrPolar(g.hx, g.hy, g.R - 4, a); const [x1, y1] = orrPolar(g.hx, g.hy, g.R + 7, a);
            socketPaths[compare && i >= m ? 'gain' : 'sale'] += `M ${f(x0)} ${f(y0)} L ${f(x1)} ${f(y1)} `;
          }
          if (compare && i < m) {
            const [x0, y0] = orrPolar(g.hx, g.hy, g.R - 11, a); const [x1, y1] = orrPolar(g.hx, g.hy, g.R - 6, a);
            socketPaths.ghost += `M ${f(x0)} ${f(y0)} L ${f(x1)} ${f(y1)} `;
          }
        }
        const half = ((count - 1) / 2) * stepDeg;
        open.push([bearing - half - 2.5, bearing + half + 2.5]);
        // the word, seated by its corner nearest the ring at R + 12
        const [px, py] = orrPolar(g.hx, g.hy, g.R + 12, bearing);
        const left = Math.sin((bearing * Math.PI) / 180) < 0;
        const word = orrSvg('text', { x: f(px), y: f(py), class: `sx-sw__socket-word${n ? '' : ' is-none'}`, 'text-anchor': left ? 'end' : 'start', 'dominant-baseline': 'hanging' });
        word.textContent = (SLOT_LABEL[type] || type).toUpperCase();
        saleRing.appendChild(word);
      }
    }
    if (socketPaths.ghost) saleRing.appendChild(orrSvg('path', { d: socketPaths.ghost.trim(), class: 'orr-core sx-sw__socket is-ghost', 'stroke-width': 1.5 }));
    if (socketPaths.sale) saleRing.appendChild(orrSvg('path', { d: socketPaths.sale.trim(), class: 'orr-core sx-sw__socket', 'stroke-width': 2 }));
    if (socketPaths.gain) saleRing.appendChild(orrSvg('path', { d: socketPaths.gain.trim(), class: 'orr-core sx-sw__socket is-gain', 'stroke-width': 2 }));
    stageEl.classList.toggle('has-sockets', !!def);
    stageEl.classList.add('has-salering');
    saleGeo = g;
    saleOpen = open;
    lightSaleHull(g);
    // the live render is framed to the dial's own square (the canvas stands on the ring in For Sale):
    // at zoom 1 its bounding sphere fills 0.95 of the ring, so the hull stays inside it at every bearing
    const zoomKey = `${buyId}|${Math.round(g.R)}`;
    if (mount && typeof mount.setZoom === 'function' && zoomKey !== saleZoomKey) {
      saleZoomKey = zoomKey;
      try { mount.setZoom(1); } catch (_) { /* a mount without zoom keeps its own fit */ }
    }
    stageEl.style.setProperty('--sw-ring-x', `${Math.round(g.hx)}px`);
    stageEl.style.setProperty('--sw-ring-y', `${Math.round(g.hy)}px`);
    stageEl.style.setProperty('--sw-ring-r', `${Math.round(g.R)}px`);
    // the view words are marks on the bezel; with no live preview they still turn the ring and the render
    const cam = el.querySelector('.sx-sw__camera');
    stageEl.classList.toggle('has-viewmarks', !!cam);
    drawBezel();
  }

  // THE TURN (the Shipworks signature): the disc's bezel -- its tick scale and the three view marks --
  // turns under the fixed plate that carries the caption and the sockets. Drag the ring (or the hull in
  // it) and the bezel and the ship turn together, one to one; let go and the bezel springs to the view
  // nearest the top index, whose word lights. LEFT, CENTER and RIGHT are the bezel turned so that mark
  // stands at the top. Keyboard: the arrow keys on the view words. Reduced motion: every turn snaps.
  const VIEW_BASE = { left: 300, reset: 0, right: 60 };
  const VIEW_TURN = { left: 60, reset: 0, right: -60 };
  const VIEW_ORDER = ['left', 'reset', 'right'];
  const TURN_LIMIT = 84;
  let saleGeo = null;
  let saleOpen = [];
  let bezelTurn = 0;
  let saleView = 'reset';
  let saleTurnHull = '';
  let turnSettleFrame = 0;
  const norm360 = (a) => ((a % 360) + 360) % 360;
  const nearestView = (t) => VIEW_ORDER.reduce((best, k) => (Math.abs(VIEW_TURN[k] - t) < Math.abs(VIEW_TURN[best] - t) ? k : best), 'reset');
  const turnSpring = createSpring({
    value: 0,
    preset: 'swing',
    onUpdate: (v) => {
      applyTurn(v);
      if (v === turnSpring.target && !turnDrag) {
        if (turnSettleFrame) cancelAnimationFrame(turnSettleFrame);
        turnSettleFrame = requestAnimationFrame(() => { turnSettleFrame = 0; afterTurnSettle(); });
      }
    },
  });
  // the hull turns with the bezel, one to one (a clockwise drag turns it clockwise as seen from above)
  const turnYaw = () => CENTERED_SHIP_YAW - (bezelTurn * Math.PI) / 180;
  function applyTurn(v) {
    bezelTurn = Math.max(-TURN_LIMIT - 12, Math.min(TURN_LIMIT + 12, Number(v) || 0));
    // the live hull turns with the bezel frame by frame while it is on the glass; hidden behind the render,
    // it takes its bearing once when the bezel settles
    const liveOnGlass = !poster.has() || poster.isLive();
    if (liveOnGlass && mount && typeof mount.setYaw === 'function' && stageEl.classList.contains('has-salering')) {
      try { mount.setYaw(turnYaw()); } catch (_) { /* a mount without yaw keeps its view */ }
    }
    drawBezel();
  }
  // the render a still picture can offer for a view: the starboard elevation for RIGHT, the hero otherwise
  function posterViewFor(defId) {
    return mode === 'buy' && saleView === 'right' && hullPosterUrl(defId, 'side') ? 'side' : POSTER_VIEW;
  }
  function afterTurnSettle() {
    saleView = nearestView(bezelTurn);
    stageEl.dataset.view = saleView;
    if (mount && typeof mount.setYaw === 'function' && stageEl.classList.contains('has-salering')) {
      try { mount.setYaw(turnYaw()); } catch (_) { /* a mount without yaw keeps its view */ }
    }
    if (mode === 'buy' && buyId && poster.has() && poster.view && poster.view() !== posterViewFor(buyId)) poster.setHull(buyId, posterViewFor(buyId));
    scheduleSpatialProjection();
  }
  function turnToView(view) {
    if (!(view in VIEW_TURN)) return;
    saleView = view;
    turnSpring.set(VIEW_TURN[view]);
    if (!stageEl.classList.contains('has-salering')) return;
    // a snap (reduced motion, or already there) still settles the poster and the light
    if (turnSpring.value === VIEW_TURN[view]) afterTurnSettle();
  }
  // the bezel: the scale's ticks (flowing under the plate's open arcs) and the three view marks
  function drawBezel() {
    const g = saleGeo;
    if (!saleRing || !g) return;
    let bez = saleRing.querySelector(':scope > .sx-sw__bezel');
    if (!bez) { bez = orrSvg('g', { class: 'sx-sw__bezel' }); saleRing.appendChild(bez); }
    bez.textContent = '';
    const f = (n) => Math.round(n * 100) / 100;
    const inArc = (a, [a0, a1]) => { const x = norm360(a - a0); return x <= norm360(a1 - a0); };
    const shut = (a) => saleOpen.some((arc) => inArc(a, arc));
    let minor = ''; let major = '';
    for (let i = 0; i < 72; i++) {
      const a = norm360(i * 5 + bezelTurn);
      if (shut(a)) continue;
      const isMajor = i % 6 === 0;
      const [x0, y0] = orrPolar(g.hx, g.hy, g.R + 3, a); const [x1, y1] = orrPolar(g.hx, g.hy, g.R + (isMajor ? 12 : 8), a);
      const seg = `M ${f(x0)} ${f(y0)} L ${f(x1)} ${f(y1)} `;
      if (isMajor) major += seg; else minor += seg;
    }
    if (minor) bez.appendChild(orrSvg('path', { d: minor.trim(), class: 'orr-tick sx-sw__bezel-tick' }));
    if (major) bez.appendChild(orrSvg('path', { d: major.trim(), class: 'orr-tick orr-tick--major sx-sw__bezel-tick' }));
    const cam = el.querySelector('.sx-sw__camera');
    if (!cam) return;
    const current = nearestView(bezelTurn);
    // a mark that turns down into the plate's sector fades under it (the plate holds the sockets and the caption)
    const plateFade = (a) => {
      const x = norm360(a);
      const into = Math.min(x - 100, 260 - x);
      return into <= 0 ? 1 : Math.max(0, 1 - into / 14);
    };
    for (const b of cam.querySelectorAll('[data-camera]')) {
      const key = b.getAttribute('data-camera');
      const a = norm360((VIEW_BASE[key] ?? 0) + bezelTurn);
      const vis = plateFade(a);
      const on = key === current;
      b.classList.toggle('is-current', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.style.opacity = vis >= 1 ? '' : vis.toFixed(2);
      b.style.pointerEvents = vis < 0.5 ? 'none' : '';
      if (vis > 0) {
        if (on) {
          const [ix, iy] = orrPolar(g.hx, g.hy, g.R - 10, a); const [ox, oy] = orrPolar(g.hx, g.hy, g.R + 9, a);
          const d = `M ${f(ix)} ${f(iy)} L ${f(ox)} ${f(oy)}`;
          bez.appendChild(orrSvg('path', { d, class: 'orr-lit-bloom sx-sw__mark' }));
          bez.appendChild(orrSvg('path', { d, class: 'orr-lit sx-sw__mark' }));
          const [bx, by] = orrPolar(g.hx, g.hy, g.R, a);
          bez.appendChild(orrSvg('circle', { cx: f(bx), cy: f(by), r: 8, class: 'orr-bead-bloom' }));
          bez.appendChild(orrSvg('circle', { cx: f(bx), cy: f(by), r: 4, class: 'orr-bead' }));
        } else {
          const [ix, iy] = orrPolar(g.hx, g.hy, g.R - 6, a); const [ox, oy] = orrPolar(g.hx, g.hy, g.R + 8, a);
          bez.appendChild(orrSvg('path', { d: `M ${f(ix)} ${f(iy)} L ${f(ox)} ${f(oy)}`, class: 'orr-tick orr-tick--major sx-sw__mark', style: `opacity:${vis.toFixed(2)}` }));
        }
      }
      // the word beyond its mark at R + 17, its box anchored continuously round the ring as the bezel turns
      const [px, py] = orrPolar(g.hx, g.hy, g.R + 17, a);
      const cs = getComputedStyle(b);
      const pl = parseFloat(cs.paddingLeft) || 0; const pr = parseFloat(cs.paddingRight) || 0;
      const pt = parseFloat(cs.paddingTop) || 0; const pb = parseFloat(cs.paddingBottom) || 0;
      const cw = Math.max(0, (b.offsetWidth || 0) - pl - pr); const ch = Math.max(0, (b.offsetHeight || 0) - pt - pb);
      const sx = Math.sin((a * Math.PI) / 180); const sy = -Math.cos((a * Math.PI) / 180);
      const fx = 0.5 - 0.5 * Math.max(-1, Math.min(1, sx * 1.6));
      const fy = 0.5 - 0.5 * Math.max(-1, Math.min(1, sy * 1.6));
      b.style.left = `${Math.round(px - pl - fx * cw)}px`;
      b.style.top = `${Math.round(py - pt - fy * ch)}px`;
    }
  }
  // the grip: a disc over the ring and the hull in it (the words stay above it and keep their clicks)
  let turnEl = null;
  let turnDrag = null;
  function ensureTurnSurface() {
    if (turnEl || typeof document === 'undefined') return;
    turnEl = document.createElement('div');
    turnEl.className = 'sx-sw__turn';
    turnEl.setAttribute('aria-hidden', 'true');
    stageEl.appendChild(turnEl);
    const angleAt = (ev) => {
      const g = saleGeo; const sr = stageEl.getBoundingClientRect();
      const dx = ev.clientX - (sr.left + g.hx); const dy = ev.clientY - (sr.top + g.hy);
      return { deg: (Math.atan2(dx, -dy) * 180) / Math.PI, r: Math.hypot(dx, dy) };
    };
    turnEl.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0 || !saleGeo) return;
      const p = angleAt(ev);
      turnSpring.stop();
      turnDrag = { id: ev.pointerId, last: p.deg, x: ev.clientX, turn: bezelTurn, near: p.r < saleGeo.R * 0.3, t: performance.now(), v: 0 };
      try { turnEl.setPointerCapture(ev.pointerId); } catch (_) { /* capture is a nicety */ }
      stageEl.classList.add('is-turning');
      ev.preventDefault();
    });
    turnEl.addEventListener('pointermove', (ev) => {
      if (!turnDrag || ev.pointerId !== turnDrag.id || !saleGeo) return;
      const p = angleAt(ev);
      let delta;
      if (turnDrag.near || p.r < saleGeo.R * 0.2) delta = (ev.clientX - turnDrag.x) * 0.45;
      else { delta = p.deg - turnDrag.last; if (delta > 180) delta -= 360; if (delta < -180) delta += 360; }
      turnDrag.last = p.deg; turnDrag.x = ev.clientX;
      const now = performance.now();
      const dt = Math.max(1, now - turnDrag.t) / 1000;
      turnDrag.t = now;
      // past the last view the bezel resists
      const next = turnDrag.turn + delta;
      const over = Math.max(0, Math.abs(next) - TURN_LIMIT);
      turnDrag.turn = over > 0 ? Math.sign(next) * (TURN_LIMIT + over * 0.3) : next;
      turnDrag.v = delta / dt;
      applyTurn(turnDrag.turn);
    });
    const release = (ev) => {
      if (!turnDrag || (ev && ev.pointerId !== turnDrag.id)) return;
      const fling = Math.max(-240, Math.min(240, turnDrag.v || 0));
      const view = nearestView(bezelTurn + fling * 0.12);
      turnDrag = null;
      try { turnEl.releasePointerCapture(ev.pointerId); } catch (_) { /* already released */ }
      stageEl.classList.remove('is-turning');
      saleView = view;
      turnSpring.set(bezelTurn, { instant: true });
      turnSpring.kick(fling);
      turnSpring.set(VIEW_TURN[view]);
      if (turnSpring.value === VIEW_TURN[view]) afterTurnSettle();
    };
    turnEl.addEventListener('pointerup', release);
    turnEl.addEventListener('pointercancel', release);
  }
  // the verbs' one home, both modes and both sizes: centred under the ring's caption
  function seatSaleStats(g) {
    const stats = el.querySelector('.sx-sw__stats');
    if (!stats) return;
    const props = ['position', 'left', 'top', 'right', 'bottom', 'width', 'max-width', 'transform', 'z-index'];
    if (!g || !el.classList.contains('sx-sw--buying')) { for (const k of props) stats.style.removeProperty(k); return; }
    const sr = stageEl.getBoundingClientRect();
    // a short stage gives the readouts the whole gutter left of the dial (the pair row needs 170px of it)
    const tight = ringShort();
    const w = Math.max(170, Math.min(250, g.hx - g.R - (tight ? 18 : 28)));
    stats.style.setProperty('position', 'fixed', 'important');
    stats.style.setProperty('left', `${Math.round(sr.left + (tight ? 6 : 16))}px`, 'important');
    stats.style.setProperty('width', `${Math.round(w)}px`, 'important');
    stats.style.setProperty('max-width', `${Math.round(w)}px`, 'important');
    stats.style.setProperty('right', 'auto', 'important');
    stats.style.setProperty('bottom', 'auto', 'important');
    stats.style.setProperty('transform', 'none', 'important');
    stats.style.setProperty('z-index', '3', 'important');
    const h = stats.offsetHeight || 200;
    const short = sr.height < 600;
    stats.style.setProperty('top', `${Math.round(short ? sr.top + 6 : sr.bottom - h - 14)}px`, 'important');
  }
  // the verbs' one home, both modes: one row centred on the dial, at the band reserved under it
  function seatVerbs(g) {
    seatSaleStats(g);
    const rack = el.querySelector('.sx-sw-verbs');
    if (!rack) return;
    if (!g) { rack.style.cssText = ''; return; }
    const sr = stageEl.getBoundingClientRect();
    const w = rack.offsetWidth || 300;
    const rh = rack.offsetHeight || 29;
    const top = ringShort() && host !== 'dock' ? sr.bottom - rh + 4 : sr.top + verbRowTop(g.W, g.H);
    const left = Math.round(sr.left + g.hx - w / 2);
    rack.style.cssText = `position:fixed !important; left:${left}px !important; top:${Math.round(top)}px !important; margin:0 !important; z-index:4;`;
    // centre the words on the dial, not the box: an empty slot's gap or the last word's tracking must not
    // pull the row off the ring's axis
    const ink = verbInk(rack);
    if (ink) {
      const shift = Math.round(sr.left + g.hx - (ink.left + ink.right) / 2);
      if (shift) rack.style.setProperty('left', `${left + shift}px`, 'important');
    }
  }
  // the lit extent of the verb row: from the first verb's chevron to the last glyph of the last word
  function verbInk(rack) {
    const verbs = [...rack.querySelectorAll('[data-verb]')].filter((b) => b.offsetWidth > 0 && getComputedStyle(b).visibility !== 'hidden');
    if (!verbs.length) return null;
    let left = Infinity; let right = -Infinity; let trail = 0;
    for (const b of verbs) {
      const r = b.getBoundingClientRect();
      left = Math.min(left, r.left);
      const walker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        if (!t.nodeValue || !t.nodeValue.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(t);
        for (const rr of range.getClientRects()) {
          if (rr.width > 0 && rr.right > right) { right = rr.right; trail = parseFloat(getComputedStyle(t.parentElement || b).letterSpacing) || 0; }
        }
      }
    }
    if (!(right > left)) return null;
    return { left, right: right - trail };
  }
  // a scrolled ladder folds at the end that has more beyond it: its head once rows hang above, its foot while rows hang below
  function syncListFold() {
    const max = Math.max(0, railListEl.scrollHeight - railListEl.clientHeight);
    railListEl.setAttribute('data-fold-head', max > 6 && railListEl.scrollTop > 2 ? '1' : '0');
    railListEl.setAttribute('data-fold-foot', max > 6 && railListEl.scrollTop < max - 2 ? '1' : '0');
  }
  let jig = null;
  let jigHost = null;
  let jigLit = -1;
  function ensureJig() {
    if (jig || host !== 'dock' || typeof document === 'undefined') return jig;
    jigHost = document.createElement('div');
    jigHost.className = 'orr-sw-jig';
    stageEl.appendChild(jigHost);
    jig = createHullSchematic({
      host: jigHost,
      // the name's words and the verbs under them (the nameplate's own box runs the stage's height)
      // (the verbs' band is reserved from the stage's size, so the ring never chases the verbs)
      avoid: () => [nameplateEl.querySelector('.sx-sw__crestLine'), nameplateEl.querySelector('.sx-sw__blurb'), ringBandObstacle, el.querySelector('.sx-sw__gauges')],
      labelWidth: 220,
      gap: 30,
      edge: 40,
      allowNone: true,
      // a narrow stage keeps its nodes clean: the labels carry the numerals
      numeralsMinWidth: 1100,
      onPick: (index) => {
        const anchor = slotfieldEl.querySelector(`[data-spatial-slot="${index}"]`);
        jigLit = index;
        if (anchor) openChooser(index, anchor);
      },
    });
    // the stage ring and the Fleet caption follow the jig's dial wherever it lays out
    if (typeof MutationObserver !== 'undefined') new MutationObserver(() => scheduleSpatialProjection()).observe(jigHost, { childList: true, subtree: true });
    jigHost.addEventListener('click', (ev) => {
      const node = ev.target.closest && ev.target.closest('.orr-sw-node[data-slot]');
      if (!node) return;
      const index = Number(node.getAttribute('data-slot'));
      const anchor = slotfieldEl.querySelector(`[data-spatial-slot="${index}"]`);
      jigLit = index;
      if (anchor) openChooser(index, anchor);
    });
    jigHost.addEventListener('pointerover', (ev) => {
      const node = ev.target.closest && ev.target.closest('.orr-sw-node[data-slot]');
      if (!node || !jig) return;
      if (typeof performance !== 'undefined' && performance.now() - jig.laidOutAt() < 420) return;
      jig.light(Number(node.getAttribute('data-slot')));
    });
    jigHost.addEventListener('pointerleave', () => { if (jig) jig.light(selectedSlot >= 0 ? selectedSlot : -1); });
    // keyboard on the hidden hardpoint buttons moves the Hand to the same node
    slotfieldEl.addEventListener('focusin', (ev) => {
      const anchor = ev.target.closest && ev.target.closest('[data-spatial-slot]');
      if (anchor && jig) jig.light(Number(anchor.getAttribute('data-spatial-slot')));
    });
    return jig;
  }
  function syncJig(def, slots, fittings, shipName) {
    // the panel composes for the drawing before it lays out (the stage needs the column's height)
    el.classList.toggle('orr-sw--jig', host === 'dock' && !!(def && hullPosterUrl(def.id, 'jig')));
    if (host !== 'dock') { if (jigHost) jigHost.hidden = true; return; }
    const j = ensureJig();
    if (!j || !jigHost) return;
    jigHost.hidden = false;
    const existing = new Map([...jigHost.querySelectorAll('.orr-sw-node[data-slot]')].map((n) => [n.getAttribute('data-slot'), n]));
    const nodes = (def ? slots : []).map((slot, i) => {
      const fitted = fittings[i] && FITTABLE_BY_ID.get(fittings[i]);
      let node = existing.get(String(i));
      if (!node) {
        node = document.createElement('div');
        node.className = 'orr-sw-node';
        node.setAttribute('data-slot', String(i));
        node.setAttribute('aria-hidden', 'true');
        jigHost.appendChild(node);
      }
      existing.delete(String(i));
      const slotName = SLOT_LABEL[slot.type] || slot.type;
      const ring = hardpointClassOf(slot) === 'ring' ? ' · ring' : '';
      const stockDrive = !fitted && slot.type === 'engine' && activeBandModel && activeBandModel.handling
        && activeBandModel.handling.profile && activeBandModel.handling.profile.driveLabel;
      const name = fitted ? fitted.name : (stockDrive || slotName);
      const state = fitted ? `${slotName} · ${slot.size || ''}${ring}` : (stockDrive ? `stock · ${slot.size || ''}` : `empty · ${slot.size || ''}${ring}`);
      const html = `<span class="orr-sw-node__num">${String(i + 1).padStart(2, '0')}</span>`
        + `<span class="orr-sw-node__body"><b class="orr-sw-node__name">${escapeHtml(name)}</b>`
        + `<span class="orr-sw-node__state">${escapeHtml(state)}</span></span>`;
      node.classList.toggle('is-stock', !!stockDrive);
      if (node.innerHTML !== html) node.innerHTML = html;
      node.classList.toggle('is-fitted', !!fitted);
      node.classList.toggle('is-empty', !fitted);
      return { el: node, slotType: slot.type, state: fitted || stockDrive ? 'fitted' : 'open', num: String(i + 1).padStart(2, '0') };
    });
    for (const stale of existing.values()) stale.remove();
    const fittedCount = nodes.filter((n) => n.state === 'fitted').length;
    j.setHull(def ? def.id : null);
    jigCaption = def ? { defId: def.id, name: shipName || def.name || '' } : null;
    j.setNodes(nodes, { engraving: def ? `${shipName || def.name || ''} \u00b7 ${fittedCount} of ${nodes.length} fitted` : '' });
    j.light(selectedSlot >= 0 && selectedSlot < nodes.length ? selectedSlot : -1, { swing: false });
  }

  function renderSpatialSlots() {
    spatialAnchors = new Map();
    spatialSlotMeta = new Map();
    if (mode !== 'fleet') { slotfieldEl.innerHTML = ''; syncJig(null, [], [], ''); return; }
    const ship = viewedShip();
    const def = ship && SHIP_BY_ID.get(ship.defId);
    if (!def) { slotfieldEl.innerHTML = ''; syncJig(null, [], [], ''); return; }
    const slots = buildSlotList(def);
    const fittings = ship.fittings || [];
    slotfieldEl.innerHTML = slots.map((slot, i) => {
      const fitted = fittings[i] && FITTABLE_BY_ID.get(fittings[i]);
      const anchor = localSlotAnchor(def, slots, i);
      spatialAnchors.set(i, anchor);
      spatialSlotMeta.set(i, {
        type: slot.type,
        ordinal: typeOrdinal(slots, i),
        count: slots.filter((s) => s.type === slot.type).length,
      });
      // An unfitted slot is named for the SLOT, not for a part called "Empty Cargo". The old label
      // ("Empty " + type) read as installed hardware whose name happened to start with "Empty",
      // which is why an open bay looked like a component of the ship. Name the mount, then state
      // that it is open.
      const slotName = SLOT_LABEL[slot.type] || slot.type;
      const label = fitted ? fitted.name : slotName;
      const selected = i === selectedSlot ? ' is-selected' : '';
      const kind = anchor.authored ? 'PHYSICAL' : 'SYSTEM';
      // PQ-176.02: a turret ring is a different kind of mount; the pin says so before the chooser does.
      const ring = hardpointClassOf(slot) === 'ring' ? ' / RING' : '';
      const sub = fitted ? `${kind} / ${slot.size || ''}${ring}` : `OPEN / ${slot.size || ''}${ring}`;
      const aria = fitted
        ? `${slotName} ${i + 1}: ${label}. Open compatible modules.`
        : `${slotName} ${i + 1}: open slot. Open compatible modules.`;
      return `<button type="button" ${stationControlAttrs('hardpoint')} class="sx-hardpoint sx-hardpoint--${escapeHtml(slot.type)}${selected}${fitted ? '' : ' is-empty'}" data-spatial-slot="${i}" data-anchor-kind="${kind.toLowerCase()}" aria-label="${escapeHtml(aria)}">` +
        `<svg class="sx-hardpoint__leader" aria-hidden="true"><path></path></svg>` +
        `<span class="sx-hardpoint__reticle" aria-hidden="true"><i></i></span>` +
        `<span class="sx-hardpoint__copy"><b>${escapeHtml(label)}</b><em>${escapeHtml(sub)}</em></span>` +
      `</button>`;
    }).join('');
    syncJig(def, slots, fittings, ship.name);
    scheduleSpatialProjection();
  }

  function scheduleSpatialProjection() {
    if (projectionFrame) cancelAnimationFrame(projectionFrame);
    projectionFrame = requestAnimationFrame(() => {
      projectionFrame = 0;
      updateSpatialProjection();
    });
  }

  // `pointOf(slotIndex)` -> the slot's bead in stage px (live hull or poster); `reactor` is where
  // the power flows from: the hull's heart on the poster, the stage's lower centre on the live hull.
  function syncPowerBeamProjection(stageRect, pointOf, reactor) {
    if (!stageRect || typeof pointOf !== 'function') return;
    powerBeam.resize(stageRect.width, stageRect.height);
    if (!Array.isArray(currentPowerSlotIndices) || !currentPowerSlotIndices.length) {
      powerBeam.setPath([], { active: false });
      return;
    }
    const points = [reactor || { x: stageRect.width * 0.5, y: stageRect.height * 0.62 }];
    for (const slotIndex of currentPowerSlotIndices) {
      const p = pointOf(slotIndex);
      if (p) points.push(p);
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

  /** The live hull has drawn when its authored asset is in: then the poster yields to it. */
  function syncPosterLive() {
    if (!poster.has()) { canvas.tabIndex = 0; return; }
    const state = mount && mount.getAssetState ? mount.getAssetState() : '';
    const sameHull = !!mount && (!mount.getDefId || mount.getDefId() === poster.defId());
    // Only ever poster -> live for one hull: a refit that re-seats the same hull must not flash
    // the render back in. A different hull resets through poster.setHull.
    if (!poster.isLive() && sameHull && /^authored/.test(String(state || ''))) {
      poster.setLive(true);
      scheduleSpatialProjection();
    }
    // The canvas cannot be orbited while it is hidden behind the render: keep it out of the tab order.
    canvas.tabIndex = poster.showing() ? -1 : 0;
  }

  function stageLocalRect(rect, stageRect, pad = 0) {
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return {
      left: rect.left - stageRect.left - pad,
      top: rect.top - stageRect.top - pad,
      right: rect.right - stageRect.left + pad,
      bottom: rect.bottom - stageRect.top + pad,
    };
  }

  // The nameplate's padded box is far wider than its ink; the zone follows the text extent
  // (per-text-node Range rects -- a whole-contents bounding rect would union the block boxes and
  // be no narrower than the padded box), or a card crossing only padding would be pushed away.
  function nameplateInkRect() {
    if (!nameplateEl || !nameplateEl.isConnected) return null;
    let ink = null;
    const walker = document.createTreeWalker(nameplateEl, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!t.nodeValue || !t.nodeValue.trim()) continue;
      const r = document.createRange();
      r.selectNodeContents(t);
      for (const rr of r.getClientRects()) {
        if (rr.width <= 0 || rr.height <= 0) continue;
        ink = ink
          ? { left: Math.min(ink.left, rr.left), top: Math.min(ink.top, rr.top), right: Math.max(ink.right, rr.right), bottom: Math.max(ink.bottom, rr.bottom) }
          : { left: rr.left, top: rr.top, right: rr.right, bottom: rr.bottom };
      }
    }
    if (!ink) return null;
    return { left: ink.left, top: ink.top, right: ink.right, bottom: ink.bottom, width: ink.right - ink.left, height: ink.bottom - ink.top };
  }

  function updateSpatialProjection() {
    if (!stageEl.isConnected) return;
    syncPosterLive();
    const posterOn = poster.showing();
    // The live hull pins the systems when it is on the glass: no render for this hull, or the
    // authored hull has drawn over the render. Otherwise the render pins them, on its own marks.
    const livePath = !!mount && !posterOn;
    // No hull picture at all -- no preview mount (secondaryPreviewWebGlBlocked: a second hangar
    // compile TDRs Intel/ANGLE, the owner's own laptop) and no render for this hull -- means no
    // hull to pin the systems to. They lay out as a systems board: the same buttons, the same
    // copy, as a wrapped row of chips at the foot of the stage.
    if (slotfieldEl) slotfieldEl.classList.toggle('is-board', !livePath && !posterOn);
    // The operation plate is bottom-anchored to the panel while the gauges rack lives at the
    // stage's top-right; CSS cannot express "start under the rack" across the two containing
    // blocks, so the plate's top is pinned here in its own containing-block coordinates. When
    // the station grid owns the column (position:static) the pin is skipped entirely.
    if (sideEl && gaugeRackEl && sideEl.isConnected && gaugeRackEl.isConnected
        && getComputedStyle(sideEl).position === 'absolute' && sideEl.offsetParent) {
      const top = Math.round(
        gaugeRackEl.getBoundingClientRect().bottom
        - sideEl.offsetParent.getBoundingClientRect().top + 8);
      if (top > 0 && top !== pinnedSideTop) {
        pinnedSideTop = top;
        sideEl.style.top = `${top}px`;
      }
    }
    if (!livePath && !posterOn) return;
    const stageRect = stageEl.getBoundingClientRect();
    if (stageRect.width <= 0 || stageRect.height <= 0) return;
    const focusLine = el.querySelector('.sx-sw__focusline');
    if (focusLine && selectedSlot < 0) focusLine.classList.remove('is-on');

    const nodes = [...slotfieldEl.querySelectorAll('[data-spatial-slot]')];
    // The copy is white-space:nowrap -- its size is text-driven and position-independent, so
    // measure it now: a planning width would push a 60 px card into columns it never enters.
    const cards = nodes.map((node) => {
      const copyEl = node.querySelector('.sx-hardpoint__copy');
      const r = copyEl ? copyEl.getBoundingClientRect() : null;
      return { w: r && r.width > 4 ? r.width : 200, h: r && r.height > 4 ? r.height : 36 };
    });

    // Where the hull and its labels may go: the stage less its edge, less the gauges rack's
    // column when the rack stands down the right flank.
    const inset = 12;
    const region = { left: inset, top: inset, right: stageRect.width - inset, bottom: stageRect.height - inset };
    const obstacles = [];
    const gaugesRect = gaugeRackEl && gaugeRackEl.isConnected && getComputedStyle(gaugeRackEl).visibility !== 'hidden'
      ? stageLocalRect(gaugeRackEl.getBoundingClientRect(), stageRect, 4) : null;
    if (gaugesRect) {
      if (gaugesRect.bottom - gaugesRect.top > stageRect.height * 0.3 && gaugesRect.left > stageRect.width * 0.4) {
        region.right = Math.min(region.right, gaugesRect.left - 12);
      } else obstacles.push(gaugesRect);
    }
    const npRect = nameplateInkRect();
    const nameplateZone = npRect ? stageLocalRect(npRect, stageRect, 6) : null;
    if (nameplateZone) obstacles.push(nameplateZone);
    if (livePath) {
      for (const sel of ['.sx-sw__camera', '.sx-sw__dragcue']) {
        const chrome = el.querySelector(sel);
        const r = chrome && chrome.isConnected ? stageLocalRect(chrome.getBoundingClientRect(), stageRect, 4) : null;
        if (r) obstacles.push(r);
      }
    }

    // The render: its hull fitted into the region with a label column's width free on each side,
    // and never over the nameplate (then it drops into the band under it).
    let keepOut = null;
    let heart = null;
    if (posterOn) {
      const reserveX = nodes.length ? Math.max(...cards.map((c) => c.w)) + 32 : 0;
      const fitArgs = { ink: poster.ink(), imageAspect: poster.aspect(), reserveX, reserveY: 8 };
      let fit = fitHullInk({ region, ...fitArgs });
      if (nameplateZone && fit.inkRect.left < nameplateZone.right && fit.inkRect.right > nameplateZone.left
          && fit.inkRect.top < nameplateZone.bottom && fit.inkRect.bottom > nameplateZone.top) {
        fit = fitHullInk({ region: { ...region, top: Math.max(region.top, nameplateZone.bottom + 6) }, ...fitArgs });
      }
      const ringG = el.classList.contains('sx-sw--buying') ? stageRingGeo() : null;
      if (ringG) {
        // the hull for sale sits inside the stage ring by its own ink: its long side at four fifths of the
        // dial, the ink box's corners inside the ring, the ink centred on the ring's centre
        const asp = poster.aspect() || 1.6;
        const ink = poster.ink() || { x0: 0, y0: 0, x1: 1, y1: 1 };
        const iw = Math.max(0.05, ink.x1 - ink.x0); const ih = Math.max(0.05, ink.y1 - ink.y0);
        const inkAspect = (iw * asp) / ih;
        let inkW = 2 * ringG.R * 0.8; let inkH = inkW / inkAspect;
        if (inkH > inkW) { inkH = 2 * ringG.R * 0.8; inkW = inkH * inkAspect; }
        const reach = Math.hypot(inkW, inkH) / (2 * ringG.R * 0.94);
        if (reach > 1) { inkW /= reach; inkH /= reach; }
        const w = inkW / iw; const h = w / asp;
        const left = ringG.hx - (ink.x0 + iw / 2) * w; const top = ringG.hy - (ink.y0 + ih / 2) * h;
        fit = { imgRect: { left, top, width: w, height: h }, inkRect: { left: left + ink.x0 * w, top: top + ink.y0 * h, right: left + ink.x1 * w, bottom: top + ink.y1 * h } };
      }
      poster.place(fit.imgRect);
      drawSaleRing(ringG);
      keepOut = { left: fit.inkRect.left - 6, top: fit.inkRect.top, right: fit.inkRect.right + 6, bottom: fit.inkRect.bottom };
      heart = { x: (fit.inkRect.left + fit.inkRect.right) / 2, y: (fit.inkRect.top + fit.inkRect.bottom) / 2 };
    }

    if (!el.classList.contains('sx-sw--buying')) drawSaleRing(null);
    else if (!posterOn) drawSaleRing(stageRingGeo());
    const ringNow = stageRingGeo();
    seatVerbs(ringNow);
    drawFleetCaption(ringNow);
    drawJigBand();

    const pointOf = (index) => {
      if (livePath) {
        const local = spatialAnchors.get(index);
        const projected = local && mount.projectLocalPoint(local);
        return projected ? { x: projected.x - stageRect.left, y: projected.y - stageRect.top } : null;
      }
      const meta = spatialSlotMeta.get(index);
      return meta ? poster.pointFor(meta.type, meta.ordinal, meta.count) : null;
    };

    const cx = heart ? heart.x : stageRect.width * 0.5;
    const cy = heart ? heart.y : stageRect.height * 0.5;
    const projectedSlots = [];
    nodes.forEach((node, order) => {
      const index = Number(node.getAttribute('data-spatial-slot'));
      const p = pointOf(index);
      // A bead with nowhere to go yet (the render's marks still arriving) waits unseen rather
      // than piling on the slotfield's origin.
      node.style.visibility = p ? '' : 'hidden';
      if (!p) return;
      projectedSlots.push({
        node,
        index,
        order,
        x: Math.max(24, Math.min(stageRect.width - 24, p.x)),
        y: Math.max(24, Math.min(stageRect.height - 24, p.y)),
        local: spatialAnchors.get(index),
        cardW: cards[order].w,
        cardH: cards[order].h,
      });
    });

    if (projectedSlots.length) {
      separateBeads(projectedSlots, 14).forEach((p, i) => { projectedSlots[i].x = p.x; projectedSlots[i].y = p.y; });
      const layout = calculateSpatialSlotLayout({
        projectedSlots,
        stageWidth: stageRect.width,
        stageHeight: stageRect.height,
        nodeRadius: 17,
        bounds: region,
        keepOut,
        obstacles,
      });

      layout.forEach((res) => {
        const { item, isLeft, calloutX, calloutY, leaderD, zIndex } = res;
        const { node, index, x, y } = item;
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;
        node.style.zIndex = String(zIndex);
        node.classList.toggle('is-callout-left', isLeft);
        node.style.setProperty('--callout-x', `${calloutX}px`);
        node.style.setProperty('--callout-y', `${calloutY}px`);

        const leaderPath = node.querySelector('.sx-hardpoint__leader path');
        if (leaderPath) {
          if (leaderD) leaderPath.setAttribute('d', leaderD);
          else leaderPath.removeAttribute('d');
        }

        if (index === selectedSlot) {
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
    }

    // Scars are placed on the live hull's geometry; the render carries no scar marks, so they
    // wait for the live hull (the poster CSS hides the field meanwhile).
    if (livePath) {
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
    }
    syncPowerBeamProjection(stageRect, (index) => {
      const hit = projectedSlots.find((p) => p.index === index);
      return hit ? { x: hit.x, y: hit.y } : pointOf(index);
    }, heart);
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
    // The hang column scrolls vertically now: keep the chosen hull's row in view.
    const railRect = railListEl.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const max = Math.max(0, railListEl.scrollHeight - railListEl.clientHeight);
    if (max <= 0) { requestAnimationFrame(updateRailControls); return; }
    const desired = railListEl.scrollTop
      + (activeRect.top + activeRect.height / 2)
      - (railRect.top + railRect.height / 2);
    const top = Math.max(0, Math.min(max, desired));
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    railListEl.scrollTo({ top, behavior: reducedMotion ? 'auto' : 'smooth' });
    requestAnimationFrame(updateRailControls);
  }

  function queueRevealSelectedShip(options = {}) {
    requestAnimationFrame(() => revealSelectedShip(options));
  }

  function renderRail() {
    if (mode === 'fleet') {
      const o = owned();
      const activeIdx = (ctx.state.player && ctx.state.player.activeShipIndex) || 0;
      // The hang column: the hulls you own as rows (name · role, "Active" as the number).
      railListEl.innerHTML = o.length ? o.map((s, i) => {
        const def = SHIP_BY_ID.get(s.defId) || {};
        const roleLabel = describeHullRole(s.defId)?.roleLabel || def.role || 'ship';
        const on = i === viewIdx ? ' is-active' : '';
        const isActive = i === activeIdx;
        return (
          `<button type="button" ${stationControlAttrs('inspect-hull')} class="k-row sx-sw-row${on}" data-fleet="${i}" title="${escapeHtml(def.name || s.defId)}" aria-label="Inspect ${escapeHtml(def.name || s.defId)}" aria-pressed="${i === viewIdx}" aria-selected="${i === viewIdx}">` +
            `<span class="k-row__name sx-sw-row__body"><span class="sx-sw-row__name">${escapeHtml(def.name || s.defId)}</span>` +
              `<span class="k-row__sub sx-sw-row__sub">${escapeHtml(roleLabel)} · T${def.tier != null ? def.tier : '?'}</span></span>` +
            `<span class="k-row__num k-t-fine sx-sw-row__flag">${isActive ? 'Active' : ''}</span>` +
          `</button>`
        );
      }).join('') : `<p class="k-sentence sx-muted">No ships owned.</p>`;
    } else {
      railListEl.innerHTML = SHIPS.filter((s) => (s.price || 0) >= 0).map((s) => {
        const on = s.id === buyId ? ' is-active' : '';
        const roleLabel = describeHullRole(s.id)?.roleLabel || s.role || 'ship';
        return (
          `<button type="button" ${stationControlAttrs('preview-hull')} class="k-row sx-sw-row${on}" data-buy="${escapeHtml(s.id)}" title="${escapeHtml(s.name)} · ${escapeHtml(roleLabel)}" aria-label="Preview ${escapeHtml(s.name)}, ${escapeHtml(roleLabel)}, ${s.price > 0 ? fmt(s.price) + ' credits' : 'owned'}" aria-pressed="${s.id === buyId}" aria-selected="${s.id === buyId}">` +
            `<span class="k-row__name sx-sw-row__body"><span class="sx-sw-row__name">${escapeHtml(s.name)}</span>` +
              `<span class="k-row__sub sx-sw-row__sub">${escapeHtml(roleLabel)} · T${s.tier}</span></span>` +
            `<span class="k-row__num sx-sw-row__price">${s.price > 0 ? fmt(s.price) : 'Owned'}</span>` +
          `</button>`
        );
      }).join('');
    }
    dressRail();
    syncScrollExtent(railListEl);
    syncListFold();
    requestAnimationFrame(updateRailControls);
    requestAnimationFrame(syncListFold);
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
        .map(([t, arr]) => `<span class="sx-spec__hp">${(arr || []).length}×\u00a0${escapeHtml(SLOT_LABEL[t] || t)}</span>`).join('');
      const credits = (ctx.state.player && ctx.state.player.credits) || 0;
      const facts = catalogHullFacts(def.id);
      const afford = facts.price <= credits;
      const isOwned = owned().some((s) => s.defId === def.id);
      const availability = shipworksActionAvailability(ctx.state);
      const canBuy = afford && availability.hullEnabled;
      // a key that cannot be pressed still says what it would do; why it cannot stands under it as a label
      const whyNot = !availability.hullEnabled ? availability.hullLabel : (afford ? '' : `${fmt(facts.price - credits)} cr short`);
      const buyAria = canBuy ? 'Buy ship' : `Buy ship, ${whyNot}`;
      // The stage-right column: the hull's name and class, its price as the hero number, then the hull as
      // readings against the one you fly (each carries your hull's value as its ghost: ice where this hull
      // gains, dim bone where it costs), and Buy as the one primary key. The sockets stand on the disc.
      const mine = activeOwnedDef();
      const mineFacts = mine ? catalogHullFacts(mine.id) : null;
      const compare = !!(mine && mine.id !== def.id);
      const reading = (label, value, ownValue, unit, lowerIsBetter = false) => {
        const v = Number(value) || 0; const o = Number(ownValue) || 0;
        let ghost = '';
        if (compare && v !== o) {
          const better = lowerIsBetter ? v < o : v > o;
          ghost = `<i class="sx-sw-read__ghost ${better ? 'is-gain' : 'is-loss'}">\u2190 ${fmt(o)}</i>`;
        }
        return `<li class="sx-sw-read__cell"><span class="sx-sw-read__v"><b>${fmt(v)}${unit ? `<small>${unit}</small>` : ''}</b>${ghost}</span><span class="sx-sw-read__k">${label}</span></li>`;
      };
      sideEl.innerHTML =
        `<h3 class="k-t-sub sx-sw-side__name">${entitySpanHtml('hull:' + def.id, escapeHtml(def.name))}</h3>` +
        `<p class="sx-sw-side__class">${escapeHtml(def.role || 'ship')} \u00b7 T${def.tier}</p>` +
        `<div class="k-hero sx-sw-side__hero"><span class="k-hero__n">${facts.price > 0 ? fmt(facts.price) : 'Starter'}</span><span class="k-hero__w">${facts.price > 0 ? 'credits' : 'hull'}</span></div>` +
        `<ul class="sx-sw-read" aria-label="${compare ? `Readings against your ${escapeHtml(mine.name)}` : 'Readings'}">` +
          reading('Hull', facts.hull, mineFacts && mineFacts.hull, '') + reading('Shield', facts.shield, mineFacts && mineFacts.shield, '') +
          reading('Cargo', facts.cargo, mineFacts && mineFacts.cargo, 'u') + reading('Mass', facts.mass, mineFacts && mineFacts.mass, 't', true) +
          reading('Speed', facts.speed, mineFacts && mineFacts.speed, '') +
        `</ul>` +
        (compare ? `<p class="sx-sw-read__vs">\u2190 your ${escapeHtml(mine.name)}</p>` : '') +
        `<p class="sx-sw-read__hp">Hardpoints: ${slotSummary || '\u2014'}</p>` +
        `<ul class="k-words k-words--row sx-buybar${canBuy || isOwned ? '' : ' is-blocked'}">` +
          (isOwned
            ? `<li><span class="k-word k-word--emph k-38 sx-btn-ghost">In your fleet</span></li>`
            : `<li><button type="button" ${stationControlAttrs('buy-ship')} class="k-word k-word--emph k-word--primary sx-btn-primary" data-buyship="${escapeHtml(def.id)}" ${canBuy ? '' : 'disabled'} aria-label="${escapeHtml(buyAria)}">Buy ship${canBuy ? ` <small>${fmt(facts.price)} cr</small>` : ''}</button></li>` +
              (canBuy ? '' : `<li class="sx-buybar__why" aria-hidden="true">${escapeHtml(whyNot)}</li>`)) +
        `</ul>`;
      dressSide();
      drawBuyRim();
      const priceN = sideEl.querySelector('.sx-sw-side__hero .k-hero__n');
      if (priceN && facts.price > 0) rollTo(priceN, facts.price);
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
    for (const t of ['weapon', 'shield', 'engine', 'cargo', 'mining', 'utility', 'thruster']) systemDraw.set(t, 0);
    for (const d of equippedDefs) {
      const draw = Number(d.energyDraw) || (d.continuous ? Number(d.energyCost) || 0 : 0);
      systemDraw.set(d.slotType, (systemDraw.get(d.slotType) || 0) + draw);
    }
    const totalDraw = [...systemDraw.values()].reduce((a, b) => a + b, 0);
    // the stock drive is the hull's drive: counted with the fitted systems, as the drawing counts it
    const stockDriveCounted = slots.some((slot, i) => slot.type === 'engine' && !fittings[i])
      && !!(activeBandModel && activeBandModel.handling && activeBandModel.handling.profile && activeBandModel.handling.profile.driveLabel);
    const flows = [...systemDraw.entries()].filter(([type]) => slots.some((slot) => slot.type === type));
    const activeIndex = Number(ctx.state.player && ctx.state.player.activeShipIndex) || 0;
    const inspectedIndex = owned().indexOf(s);
    const availability = shipworksActionAvailability(ctx.state);
    // PQ-205.03: the bomb rack rides the same circuit plate — sockets are clickable cells that
    // open the ordnance chooser; restock and the third-socket weld are berth verbs gated by
    // outfitting access exactly like the module verbs above.
    const rack = bombRackModel();
    const rackCells = rack.cells.map((cell, i) => {
      const d = cell && BOMB_DEFS[cell.id];
      const dry = !!d && !(cell.count > 0);
      const label = d ? d.name : 'Empty socket';
      const sub = d ? (dry ? `fitted · magazine dry — restock from the hangar` : `${cell.count}/${d.magazine} loaded`) : 'choose ordnance';
      return `<li class="k-row sx-sw-rack__cell${dry || !d ? ' is-empty' : ''}" data-rack-socket="${i}" tabindex="0" role="button" aria-label="Rack socket ${i + 1}: ${escapeHtml(label)}">` +
        // Name over its state, the way the system rows above it read ("Weapon / 0/1 fitted"):
        // inline, the two ran together as "Empty socketchoose ordnance".
        `<span class="k-row__name sx-sw-flow__copy sx-sw-rack__copy">${escapeHtml(label)} <span class="k-row__sub">${escapeHtml(sub)}</span></span>` +
        `<span class="k-row__num k-38">S${i + 1}</span></li>`;
    }).join('');
    const armedCells = rack.cells.filter((c) => c && c.id && c.count > 0).length;
    const stockTotal = Object.values(rack.stock).reduce((sum, n) => sum + (Number(n) || 0), 0);
    const anyMagazine = rack.cells.some((c) => c && BOMB_DEFS[c.id]);
    const restockable = rack.cells.some((c) => c && BOMB_DEFS[c.id] && c.count < BOMB_DEFS[c.id].magazine && (rack.stock[c.id] || 0) > 0);
    const rackVerbs = [];
    if (anyMagazine) {
      const restockLabel = !availability.outfitEnabled ? 'Dock to restock'
        : restockable ? `Restock · ${fmt(BOMB_RACK.restockFeeCr)} cr` : 'Nothing to restock';
      const restockHint = !availability.outfitEnabled ? availability.outfitLabel
        : restockable ? 'Top up every fitted magazine from hangar stock' : 'Rack is full or the hangar has no matching ordnance';
      rackVerbs.push(`<li><button type="button" ${stationControlAttrs('restock')} class="k-word k-word--fine" data-rack-restock ${availability.outfitEnabled && restockable ? '' : `disabled aria-label="${escapeHtml(restockHint)}"`}>${escapeHtml(restockLabel)}</button></li>`);
    }
    if (rack.sockets < BOMB_RACK.socketsMax) {
      const afford = rack.credits >= BOMB_RACK.socketUpgradeCr;
      const upgradeLabel = !availability.outfitEnabled ? 'Dock to extend'
        : afford ? `Third socket · ${fmt(BOMB_RACK.socketUpgradeCr)} cr` : `Third socket · need ${fmt(BOMB_RACK.socketUpgradeCr)} cr`;
      const upgradeHint = !availability.outfitEnabled ? availability.outfitLabel
        : afford ? 'Weld a third bomb-rack socket into the bay' : 'Not enough credits';
      rackVerbs.push(`<li><button type="button" ${stationControlAttrs('upgrade-rack')} class="k-word k-word--fine" data-rack-upgrade ${availability.outfitEnabled && afford ? '' : `disabled aria-label="${escapeHtml(upgradeHint)}"`}>${escapeHtml(upgradeLabel)}</button></li>`);
    }
    const rackBlock =
      `<div class="sx-sw-rack">` +
        `<p class="k-caps sx-sw-band__label">Bomb rack <span class="k-38">${armedCells}/${rack.sockets} armed · ${stockTotal} stowed</span></p>` +
        `<ul class="k-rows sx-sw-rack__cells">${rackCells}</ul>` +
        (rackVerbs.length ? `<ul class="k-words k-words--row sx-sw-rack__verbs">${rackVerbs.join('')}</ul>` : '') +
      `</div>`;
    // MAKE ACTIVE is a berth verb — it never renders on the flight host (SCREENS_B §1.2). While
    // docked it stays gated by hull service availability with the reason printed on the verb.
    const activeControl = host === 'flight' ? '' : inspectedIndex !== activeIndex
      ? `<li><button type="button" ${stationControlAttrs('make-active')} class="k-word k-word--emph sx-sw-circuit__activate" data-activate-ship="${inspectedIndex}" ${availability.hullEnabled ? '' : 'disabled'} aria-label="${escapeHtml(availability.hullEnabled ? 'Make active ship' : availability.hullLabel)}">${availability.hullEnabled ? 'Make active' : escapeHtml(availability.hullLabel)}</button></li>`
      : `<li><span class="k-word k-word--emph k-38 sx-sw-circuit__active">Active flight hull</span></li>`;
    // The stage-right column: the build's identity, the core as a hero number, each system's
    // draw as a row, and one sentence telling the player where to click.
    sideEl.innerHTML =
      `<div class="sx-sw-circuit">` +
        `<h3 class="k-t-sub sx-sw-circuit__identity">${escapeHtml(titleCaseWords(def.role || 'ship'))}` +
          `<span class="k-t-fine k-38 sx-sw-circuit__sub">${equippedDefs.length + (stockDriveCounted ? 1 : 0)}/${slots.length} systems fitted · ${fmt(moduleMass)} t modules</span></h3>` +
        // ORRERY: the core as a dial -- its capacity the arc, each system's draw lit along it
        `<div class="k-hero sx-sw-circuit__core">${powerDialSvg({ cap: def.energyCap || 0, draws: flows, systems: circuitSystems(def, fittings) })}<span class="k-hero__n">${fmt(def.energyCap || 0)}</span><span class="k-hero__w">core · ${fmt(totalDraw)} draw</span></div>` +
        `<ul class="k-rows sx-sw-circuit__flows">${flows.map(([type, draw]) => {
          const available = slots.filter((slot) => slot.type === type).length;
          const fitted = slots.reduce((n, slot, i) => n + (slot.type === type && fittings[i] ? 1 : 0), 0);
          const strength = Math.max(.12, Math.min(1, totalDraw > 0 ? draw / totalDraw : .12));
          // a hull flying its stock drive has a drive: the table says so, as the drawing does
          const stock = type === 'engine' && fitted === 0 && activeBandModel && activeBandModel.handling
            && activeBandModel.handling.profile && activeBandModel.handling.profile.driveLabel;
          return `<li class="k-row k-row--static sx-sw-flow" style="--flow:${strength}" data-system-type="${escapeHtml(type)}">` +
            `<span class="k-row__name k-62 sx-sw-flow__copy">${escapeHtml(SLOT_LABEL[type] || type)}<span class="k-row__sub">${stock ? 'stock' : `${fitted}/${available} fitted`}</span></span>` +
            `<span class="k-row__num">${fmt(draw)} <span class="k-38">draw</span></span>` +
          `</li>`;
        }).join('')}</ul>` +
        `<p class="k-sentence sx-sw-circuit__instruction">Choose a system on the hull to preview compatible hardware.</p>` +
        (activeControl ? `<ul class="k-words k-words--row sx-sw-circuit__acts">${activeControl}</ul>` : '') +
        rackBlock +
      `</div>`;
    dressSide();
    // ORRERY: on the jig the six readouts are a ruled ladder under the rack, not a strip under the hull
    if (host === 'dock' && el.classList.contains('orr-sw--jig') && gaugeRackEl) {
      const circuit = sideEl.querySelector('.sx-sw-circuit');
      if (circuit) { gaugeRackEl.classList.add('orr-sw-readouts'); circuit.appendChild(gaugeRackEl); }
    }
  }

  // The rack lives on the bombs bag, not the hull record — the bay is one per player, shared
  // across owned hulls (same ownership lane as selectedId before it). Reads are defensive:
  // a pre-rack bag reads as a two-socket starter so the plate always renders honest.
  function bombRackModel() {
    const rt = (ctx.state && ctx.state.bombs) || {};
    const rack = rt.rack && typeof rt.rack === 'object' ? rt.rack : null;
    const sockets = Math.max(1, Math.floor(Number(rack && rack.sockets)) || BOMB_RACK.socketsBase);
    const cells = [];
    const source = rack && Array.isArray(rack.cells) ? rack.cells : [];
    for (let i = 0; i < sockets; i++) {
      const c = source[i];
      cells.push(c && BOMB_DEFS[c.id] ? { id: c.id, count: Math.max(0, Math.floor(Number(c.count) || 0)) } : null);
    }
    const stock = {};
    if (rt.stock && typeof rt.stock === 'object') {
      for (const [id, n] of Object.entries(rt.stock)) {
        if (BOMB_DEFS[id] && Number.isFinite(Number(n)) && n > 0) stock[id] = Math.floor(Number(n));
      }
    }
    return { sockets, cells, stock, credits: Math.max(0, Number(ctx.state.player && ctx.state.player.credits) || 0) };
  }

  // the hull the player flies: the For Sale readings and sockets are read against it
  function activeOwnedDef() {
    const o = owned();
    const idx = Number(ctx.state && ctx.state.player && ctx.state.player.activeShipIndex) || 0;
    const ship = o[idx] || o[0];
    return ship ? SHIP_BY_ID.get(ship.defId) || null : null;
  }
  // a Buy key that cannot be pressed is its own cut outline (the 45 degree corner the lit key carries) in
  // bone, the verb dim inside it
  function drawBuyRim() {
    const key = sideEl.querySelector('.sx-buybar [data-buyship]:disabled');
    if (!key) return;
    const place = () => {
      const w = key.offsetWidth || 0; const h = key.offsetHeight || 0;
      if (w < 20 || h < 12) return;
      let rim = key.querySelector(':scope > .sx-buykey__rim');
      if (!rim) { rim = orrSvg('svg', { class: 'sx-buykey__rim', 'aria-hidden': 'true', focusable: 'false' }); key.appendChild(rim); }
      rim.setAttribute('viewBox', `0 0 ${w} ${h}`);
      // the rim covers the key's border box (the lit key's field fills its border too)
      const cs = getComputedStyle(key);
      Object.assign(rim.style, { left: `${-(parseFloat(cs.borderLeftWidth) || 0)}px`, top: `${-(parseFloat(cs.borderTopWidth) || 0)}px`, width: `${w}px`, height: `${h}px` });
      const c = 10;
      rim.innerHTML = '';
      rim.appendChild(orrSvg('path', { d: `M 0.5 0.5 L ${w - c - 0.5} 0.5 L ${w - 0.5} ${c + 0.5} L ${w - 0.5} ${h - 0.5} L 0.5 ${h - 0.5} Z` }));
    };
    place();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(place);
  }
  function specRow(k, v) { return `<li class="k-row k-row--static sx-kv"><span class="k-row__name k-62">${k}</span><span class="k-row__num">${v}</span></li>`; }

  function moduleRole(def) {
    if (!def) return 'Station hardware';
    if (def.slotType === 'weapon') {
      const tracking = def.tracking === 'auto_turret' ? 'point-defense turret'
        : def.tracking === 'homing' ? 'guided ordnance'
          : def.tracking === 'hitscan' ? 'precision beam' : 'direct-fire weapon';
      return `${titleCaseWords(def.damageType || 'combat')} ${tracking}`;
    }
    if (def.slotType === 'shield') return 'Defensive field system';
    if (def.slotType === 'engine') return 'Main drive: forward thrust and top speed';
    if (def.slotType === 'thruster') return 'Manoeuvring bay: turn, strafe and brake';
    if (def.slotType === 'cargo') return def.mods && def.mods.hiddenCargoPct ? 'Concealed cargo system' : 'Load-space system';
    if (def.slotType === 'mining') return def.directToCargo ? 'Direct-feed extraction system' : 'Ore extraction system';
    const masslineOutcome = masslineHeadOutcome(def);
    if (masslineOutcome) return masslineOutcome;
    if (def.mods && def.mods.hullRepairOOC) return 'Autonomous repair system';
    if (def.mods && def.mods.scannerCloak) return 'Sensor scrambling and stealth system';
    if (def.mods && def.mods.weaponHeatDissipPct) return 'Thermal regulation and weapon heatsink';
    if (def.mods && def.mods.weaponRangePct) return 'Fire-control support system';
    if (def.mods && def.mods.radarRangePct) return 'Long-range sensor system';
    if (def.mods && def.mods.countermeasure) return 'Defensive countermeasure';
    if (def.mods && (def.mods.tetherSpoolMult || def.mods.tetherReelRateMult)) return 'Massline handling system';
    if (def.mods && def.mods.swingDrive) return 'Dash swings around a taut line';
    return 'Utility support system';
  }

  function moduleMetricRows(def, slot = null) {
    if (!def) return [];
    const rows = [];
    const add = (label, value) => {
      if (!admitModuleMetric(label)) return;
      if (value == null || value === '' || !Number.isFinite(Number(value))) return;
      rows.push({ label, value: Number(value) });
    };
    if (def.slotType === 'weapon' || def.slotType === 'mining') {
      // PQ-176.02: the number on the row is what the gun does ON THIS MOUNT. An aimed gun on a
      // turret ring runs at the ring's output, and the screen must predict that, not the catalog.
      // G11: the rate is damage times rate of fire. A catalog `dps` the sim never reads is not shown.
      const output = def.slotType === 'weapon' && slot ? mountOutputFactor(def, slot) : 1;
      const rate = liveDamageRate(def);
      add(def.slotType === 'mining' ? 'ORE DPS' : 'DPS', rate == null ? null : rate * output);
      // The mass channel is a buying decision on the weapons that have one (PQ-009): a shove you
      // can feel shows its number next to the damage it rides in on — and gives up its RANGE
      // slot for it (shove guns sit in one 240–280 wu band; MASS is the tighter constraint).
      const shove = shoveMetricValue(def);
      if (shove != null) {
        add('SHOVE', shove * output);
      } else {
        add('RANGE', def.range);
      }
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
    add('MASS', moduleSimMass(def));
    add('DRAW', def.energyDraw != null ? def.energyDraw : def.energyCost);
    return rows.slice(0, 3);
  }

  function moduleMetricsHtml(def, slot = null) {
    return moduleMetricRows(def, slot).map((row) => {
      const suffix = row.label === 'RANGE' ? ' wu'
        : row.label === 'MASS' ? ' t'
          : row.label === 'DRAW' ? ' pwr'
            : (row.label === 'CAP %' || row.label === 'HIDDEN %' || row.label === 'CLOAK %') ? '%' : '';
      const value = Math.abs(row.value) >= 100 ? Math.round(row.value) : Math.round(row.value * 10) / 10;
      return `<span class="sx-modrow__metric"><i>${escapeHtml(row.label)}</i><b>${escapeHtml(String(value) + suffix)}</b></span>`;
    }).join('');
  }

  function capabilityDeltaChips(candidate, fitted, slot = null) {
    if (!candidate || (candidate.slotType !== 'weapon' && candidate.slotType !== 'mining')) return [];
    const outputOf = (def) => (def && def.slotType === 'weapon' && slot ? mountOutputFactor(def, slot) : 1);
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
    add(candidate.slotType === 'mining' ? 'ore dps' : 'dps',
      (liveDamageRate(candidate) || 0) * outputOf(candidate),
      fitted && (liveDamageRate(fitted) || 0) * outputOf(fitted));
    add('range', candidate.range, fitted && fitted.range);
    const candidateHeat = candidate.heatPerSec != null ? candidate.heatPerSec : candidate.heatPerShot;
    const fittedHeat = fitted && (fitted.heatPerSec != null ? fitted.heatPerSec : fitted.heatPerShot);
    add(candidate.heatPerSec != null ? 'heat/s' : 'heat/shot', candidateHeat, fittedHeat, false);
    return rows;
  }

  function shopDeltaChipsHtml(shopDelta, candidate, fitted, slot = null) {
    if (!shopDelta) return '<span class="sx-modrow__unchanged">Preview unavailable</span>';
    if (shopDelta.ok) {
      const all = [...capabilityDeltaChips(candidate, fitted, slot), ...(shopDelta.chips || [])];
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

  function moduleRiskChipsHtml(shipDef, fittings, slotIndex, candidate) {
    if (!shipDef || !candidate) return '';
    const prospective = Array.isArray(fittings) ? fittings.slice() : [];
    prospective[slotIndex] = candidate.id;
    const risks = moduleRiskStrip(prospective, {
      shipId: shipDef.id,
      fittings: prospective,
      player: ctx.state.player,
    }).risks || [];
    return risks.slice(0, 3).map((risk) =>
      `<span class="sx-modrow__chip">Risk: ${escapeHtml(risk.label)}</span>`).join('');
  }

  // ---------- slot chooser (the compatible modules take the hang column) ----------
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
    const availability = shipworksActionAvailability(ctx.state);
    const shopStationId = ctx.state.ui && ctx.state.ui.docked === true ? ctx.state.ui.dockedStationId : null;
    const byTierThenPrice = (a, b) => (a.tier - b.tier) || (a.price - b.price);
    const sameType = FITTABLE.filter((d) => d.slotType === slot.type && d.purchasable !== false);
    const compat = sameType.filter((d) => fits(slot, d)).sort(byTierThenPrice);
    // PQ-176.02: a weapon of the right size that this hardpoint's class refuses stays on the list,
    // locked, with the sentence. The fit screen refuses an illegal mount in words, not by omission.
    const refused = slot.type === 'weapon'
      ? sameType.filter((d) => sizeFits(slot, d) && !fits(slot, d)).sort(byTierThenPrice)
      : [];
    const hardpoint = hardpointClassOf(slot);
    const ringPct = Math.round(TURRET_RING_OUTPUT * 100);

    // Modules the player already owns and un-fitted sit in player.moduleInventory — the only
    // way back into a slot is ui:fitModule with the row's instanceId, so the hold leads the
    // chooser. Duplicate defs collapse to one row with a count; the fit verb carries the first
    // matching instance. Rows without a usable instanceId are unfittable — a dead Fit button is
    // the defect class this section exists to close, so they are skipped.
    const inventory = (ctx.state.player && Array.isArray(ctx.state.player.moduleInventory))
      ? ctx.state.player.moduleInventory : [];
    const holdByDef = new Map();
    const holdRefusedByDef = new Map();
    for (const item of inventory) {
      const d = item && FITTABLE_BY_ID.get(item.defId);
      if (!d || d.slotType !== slot.type) continue;
      if (fits(slot, d)) {
        if (typeof item.instanceId !== 'string' || !item.instanceId) continue;
        const row = holdByDef.get(d.id) || { d, count: 0, instanceId: item.instanceId };
        row.count += 1;
        holdByDef.set(d.id, row);
      } else if (slot.type === 'weapon' && sizeFits(slot, d)) {
        // Right size, wrong mount — the buy list refuses these in words; the hold must too.
        const row = holdRefusedByDef.get(d.id) || { d, count: 0 };
        row.count += 1;
        holdRefusedByDef.set(d.id, row);
      }
    }
    const researched = (ctx.state.player && Array.isArray(ctx.state.player.researchedNodes))
      ? ctx.state.player.researchedNodes : [];
    const holdRowHtml = ({ d, count, instanceId, mountBlock }) => {
      const headConflict = findMasslineHeadConflict(fittings, slotIndex, d);
      const prospective = fittings.slice();
      prospective[slotIndex] = d.id;
      const budgetBlocker = outfitBudgetBlocker(def, prospective);
      // The backend's isUnlocked gate — a held research-locked module must refuse in words,
      // not click through to a toast.
      const researchBlock = d.requiresTech && !researched.includes(d.requiresTech) && !stationShopOffer(d, shopStationId)
        ? 'Research required: ' + techDisplayName(d.requiresTech) : null;
      const blocked = mountBlock || headConflict || budgetBlocker || researchBlock;
      const blockedText = mountBlock
        ? (mountRefusal(slot, d) || fitRefusalText(slot, d) || `${d.name} does not fit this slot`)
        : headConflict
          ? `Unfit ${headConflict.name} before installing another Massline head.`
          : researchBlock || (budgetBlocker && budgetBlocker.text) || '';
      const countTag = count > 1 ? ` ×${count}` : '';
      const metaFallback = escapeHtml(d.size || '') + ' · T' + d.tier;
      const btn = blocked
        ? `<span class="k-t-fine k-38 sx-modrow__lock">In hold${countTag}</span>`
        : `<button type="button" ${stationControlAttrs('fit-from-hold')} class="k-word k-word--fine k-word--primary sx-modrow__buy" data-fit-inv="${escapeHtml(instanceId)}" data-fit-inv-slot="${slotIndex}" ${availability.outfitEnabled ? '' : `disabled aria-label="${escapeHtml(availability.outfitLabel)}"`}>Fit${countTag}</button>`;
      return (
        `<li class="k-row sx-modrow sx-modrow--hold${blocked ? ' is-locked' : ''}"${headConflict ? '' : ` data-preview-module="${escapeHtml(d.id)}" data-preview-slot="${slotIndex}"`} tabindex="0">` +
          `<span class="k-row__name sx-modrow__body"><span class="sx-modrow__name">${entitySpanHtml('module:' + d.id, escapeHtml(d.name))}</span>` +
            `<span class="k-row__sub sx-modrow__role">${escapeHtml(moduleRole(d))} · ${metaFallback}</span>` +
            `<span class="k-row__sub sx-modrow__metrics">${moduleMetricsHtml(d, slot)}</span>` +
            `<span class="k-row__sub k-38 sx-modrow__role"${blocked ? ' data-refusal' : ''}>${blocked ? escapeHtml(blockedText) : 'Already paid for — fits this slot.'}</span>` +
          `<span class="k-row__num sx-modrow__act">${btn}</span>` +
        `</li>`
      );
    };
    const byTierThenName = (a, b) => (a.d.tier - b.d.tier) || String(a.d.name).localeCompare(String(b.d.name));
    const holdList = [...holdByDef.values()].sort(byTierThenName).map((r) => holdRowHtml(r)).join('')
      + [...holdRefusedByDef.values()].sort(byTierThenName).map((r) => holdRowHtml({ ...r, mountBlock: true })).join('');

    const list = compat.map((d) => {
      const headConflict = findMasslineHeadConflict(fittings, slotIndex, d);
      const equipped = d.id === fittedId;
      const shopDelta = presentShopModuleDelta({
        defId: def.id,
        fittings,
        moduleId: d.id,
        slotIndex,
        player: ctx.state.player,
      });
      const fittedDef = fittedId ? FITTABLE_BY_ID.get(fittedId) : null;
      const chips = shopDeltaChipsHtml(shopDelta, d, fittedDef, slot);
      const purchase = describeOutfittingPurchase(d, ctx.state.player || {}, slots, fittings, def, { stationId: shopStationId });
      const selectedFittings = fittings.slice();
      selectedFittings[slotIndex] = d.id;
      const selectedBudgetBlocker = outfitBudgetBlocker(def, selectedFittings);
      const selectedFit = !equipped && !purchase.disabled && !headConflict && !selectedBudgetBlocker;
      const riskChips = moduleRiskChipsHtml(def, fittings, slotIndex, d);
      const metaFallback = escapeHtml(d.size || '') + ' · T' + d.tier;
      const ringNote = mountOutputFactor(d, slot) < 1 ? ` The ring aims it for you at ${ringPct} % output.` : '';
      const actionDetail = equipped ? 'Installed in this slot.'
        : purchase.disabled ? purchase.title
        : headConflict ? `Unfit ${headConflict.name} before installing another Massline head. This purchase goes to inventory.`
        : selectedBudgetBlocker ? `${selectedBudgetBlocker.text || 'This fitting exceeds the hull budget'}. This purchase goes to inventory.`
        : selectedFit && fittedId
        ? `Buy ${d.name} and replace ${(fittedDef && fittedDef.name) || 'the fitted module'}; the removed module goes to inventory.${ringNote}`
        : selectedFit
          ? `Buy ${d.name} and fit it to this ${slot.type} ${slot.size} slot.${ringNote}`
        : purchase.title;
      const buyWord = availability.outfitEnabled ? (selectedFit ? (fittedId ? 'Buy & Replace' : 'Buy & Fit') : 'Buy to Inventory') : 'Dock to fit';
      const btn = equipped
        ? `<span class="k-t-fine k-38 sx-modrow__eq">Equipped</span>`
        : purchase.state === 'locked'
          ? `<span class="k-t-fine k-38 sx-modrow__lock">${escapeHtml(purchase.label)}</span>`
          : purchase.state === 'funding'
            ? `<span class="k-t-fine k-38 sx-modrow__buy is-funding">${fmt(purchase.price)} cr · ${escapeHtml(purchase.label)}</span>`
            : `<button type="button" ${stationControlAttrs('buy-fit', selectedFit ? { primary: true } : undefined)} class="k-word k-word--fine${selectedFit ? ' k-word--primary' : ''} sx-modrow__buy" data-buyfit="${escapeHtml(d.id)}"${selectedFit ? ` data-fit-slot="${slotIndex}"` : ''} ${availability.outfitEnabled ? '' : `disabled aria-label="${escapeHtml(availability.outfitLabel)}"`}>${buyWord} <small class="k-38">${fmt(purchase.price)} cr</small></button>`;
      return (
        `<li class="k-row sx-modrow${equipped ? ' is-eq' : ''}${purchase.disabled || headConflict ? ' is-locked' : ''}" ${headConflict ? '' : `data-preview-module="${escapeHtml(d.id)}" data-preview-slot="${slotIndex}"`} tabindex="0">` +
          `<span class="k-row__name sx-modrow__body"><span class="sx-modrow__name">${entitySpanHtml('module:' + d.id, escapeHtml(d.name))}</span>` +
            `<span class="k-row__sub sx-modrow__role">${escapeHtml(moduleRole(d))} · ${metaFallback}</span>` +
            `<span class="k-row__sub sx-modrow__metrics">${moduleMetricsHtml(d, slot)}</span>` +
            `<span class="k-row__sub sx-modrow__meta">${d.sentence ? `<span class="sx-modrow__sentence">${escapeHtml(d.sentence)}</span> ` : ''}<span class="sx-modrow__chips">${chips}${riskChips}</span></span>` +
            `<span class="k-row__sub k-38 sx-modrow__role">${escapeHtml(actionDetail)}</span></span>` +
          `<span class="k-row__num sx-modrow__act">${btn}</span>` +
        `</li>`
      );
    }).join('');
    const refusedList = refused.map((d) => {
      const sentence = mountRefusal(slot, d) || fitRefusalText(slot, d) || `${d.name} does not fit this slot`;
      const metaFallback = escapeHtml(d.size || '') + ' · T' + d.tier;
      return (
        `<li class="k-row sx-modrow is-locked" data-refused-module="${escapeHtml(d.id)}" tabindex="0">` +
          `<span class="k-row__name sx-modrow__body"><span class="sx-modrow__name">${entitySpanHtml('module:' + d.id, escapeHtml(d.name))}</span>` +
            `<span class="k-row__sub sx-modrow__role">${escapeHtml(moduleRole(d))} · ${metaFallback}</span>` +
            `<span class="k-row__sub sx-modrow__metrics">${moduleMetricsHtml(d)}</span>` +
            `${d.sentence ? `<span class="k-row__sub sx-modrow__meta">${escapeHtml(d.sentence)}</span>` : ''}` +
            `<span class="k-row__sub k-38 sx-modrow__role" data-refusal>${escapeHtml(sentence)}</span></span>` +
          `<span class="k-row__num sx-modrow__act"><span class="k-t-fine k-38 sx-modrow__lock">Won’t mount</span></span>` +
        `</li>`
      );
    }).join('');

    if (chooserCloseTimer) { clearTimeout(chooserCloseTimer); chooserCloseTimer = 0; }
    selectedSlot = slotIndex;
    // Exploded-view focus (feature 15): the selected bay lifts its plate and glows cyan on the
    // 3D preview. spatialAnchors carries the same authored local point the DOM pin projects from.
    if (mount && typeof mount.setExplodedFocus === 'function') {
      mount.setExplodedFocus(spatialAnchors.get(slotIndex) || null);
    }
    chooserAnchor = anchorEl || slotfieldEl.querySelector(`[data-spatial-slot="${slotIndex}"]`);
    if (jig) { jigLit = slotIndex; jig.light(slotIndex); }
    slotfieldEl.classList.add('is-focusing');
    slotfieldEl.querySelectorAll('[data-spatial-slot]').forEach((node) => {
      node.classList.toggle('is-selected', Number(node.getAttribute('data-spatial-slot')) === slotIndex);
    });
    scheduleSpatialProjection();
    // No modal: the compatible modules take the hang column's cell in place of the hulls; "Back"
    // returns them (Task C §1.9).
    const fittedName = fittedId ? ((FITTABLE_BY_ID.get(fittedId) || {}).name || 'module') : '';
    chooserEl.innerHTML =
      `<div class="sx-chooser__panel" role="region" aria-label="Compatible ${escapeHtml(SLOT_LABEL[slot.type] || slot.type)} modules">` +
        `<header class="sx-chooser__head">` +
          `<ul class="k-words k-words--row"><li><button type="button" ${stationControlAttrs('back')} class="k-word k-word--body sx-chooser__x" data-close aria-label="Back to the hulls">${stationControlLabel('back')}</button></li></ul>` +
          `<p class="k-caps sx-chooser__kicker">${SLOT_LABEL[slot.type] || slot.type} · ${escapeHtml(slot.size || '')}${hardpoint === 'ring' ? ' · ring' : (slot.facing ? ' · ' + escapeHtml(slot.facing) : '')}</p>` +
          `<h3 class="k-t-sub">Compatible modules${compat.length ? ` <span class="k-38">${compat.length}</span>` : ''}</h3>` +
        `</header>` +
        (hardpoint === 'ring'
          ? `<p class="k-sentence sx-muted" data-ring-law>The ring aims for you. An aimed gun keeps ${ringPct} % of its output here; launchers and spinal guns need a fixed hardpoint.</p>`
          : '') +
        (availability.outfitEnabled ? '' : `<p class="k-sentence sx-muted">${escapeHtml(availability.outfitLabel)}</p>`) +
        (fittedId ? `<ul class="k-words k-words--row"><li><button type="button" ${stationControlAttrs('remove-module')} class="k-word k-word--emph sx-chooser__unfit" data-unfit="${slotIndex}" ${availability.outfitEnabled ? '' : `disabled aria-label="${escapeHtml(availability.outfitLabel)}"`}>${availability.outfitEnabled ? `Remove ${escapeHtml(fittedName)}` : 'Dock to remove'}</button></li></ul>` : '') +
        (holdList ? `<p class="k-caps sx-chooser__kicker sx-chooser__hold">In your hold</p><ul class="k-rows sx-chooser__list">${holdList}</ul>` : '') +
        `<ul class="k-rows sx-chooser__list">${(list + refusedList) || '<li class="k-sentence sx-muted">No compatible modules.</li>'}</ul>` +
      `</div>`;
    dressChooser();
    chooserEl.hidden = false;
    el.classList.add('is-choosing');
    requestAnimationFrame(() => {
      chooserEl.classList.add('is-open');
      const first = chooserEl.querySelector('[data-preview-module]') || chooserEl.querySelector('[data-unfit], [data-close]');
      if (first && typeof first.focus === 'function') first.focus({ preventScroll: true });
    });
  }

  function closeChooser(opts = {}) {
    if (chooserEl.hidden && !chooserEl.classList.contains('is-open')) return;
    if (chooserCloseTimer) { clearTimeout(chooserCloseTimer); chooserCloseTimer = 0; }
    if (!opts.silent) emitUiCue(UI_DRAWER_LATCH_CUE);
    const returnFocus = chooserAnchor;
    restoreCurrentPreview();
    selectedSlot = -1;
    payloadSocket = -1;
    if (mount && typeof mount.setExplodedFocus === 'function') mount.setExplodedFocus(null);
    chooserAnchor = null;
    slotfieldEl.classList.remove('is-focusing');
    slotfieldEl.querySelectorAll('[data-spatial-slot]').forEach((node) => node.classList.remove('is-selected'));
    el.querySelector('.sx-sw__focusline').classList.remove('is-on');
    chooserEl.classList.remove('is-open');
    el.classList.remove('is-choosing');
    chooserCloseTimer = setTimeout(() => {
      chooserEl.hidden = true;
      chooserEl.innerHTML = '';
      chooserCloseTimer = 0;
      if (returnFocus && returnFocus.isConnected && typeof returnFocus.focus === 'function') returnFocus.focus({ preventScroll: true });
    }, 200);
  }

  // ---- bomb rack chooser (PQ-205.03) -----------------------------------------------------
  // Same hang-column grammar as the module chooser: a rack socket row opens the ordnance
  // list in place of the hulls; Back returns them. Every verb is an intent — the bombs
  // system owns the rack and the economy owner debits the credits; this screen only asks.
  function openPayloadChooser(socketIndex, anchorEl) {
    const rack = bombRackModel();
    if (!Number.isInteger(socketIndex) || socketIndex < 0 || socketIndex >= rack.sockets) return;
    emitUiCue(UI_SWITCH_DETENT_CUE);
    payloadSocket = socketIndex;
    selectedSlot = -1;
    if (mount && typeof mount.setExplodedFocus === 'function') mount.setExplodedFocus(null);
    chooserAnchor = anchorEl || sideEl.querySelector(`[data-rack-socket="${socketIndex}"]`);
    renderPayloadChooser();
    chooserEl.hidden = false;
    el.classList.add('is-choosing');
    requestAnimationFrame(() => {
      chooserEl.classList.add('is-open');
      const first = chooserEl.querySelector('button:not([disabled])');
      if (first && typeof first.focus === 'function') first.focus({ preventScroll: true });
    });
  }

  function renderPayloadChooser() {
    if (payloadSocket < 0) return;
    const rack = bombRackModel();
    const i = payloadSocket;
    const cell = rack.cells[i];
    const cellDef = cell && BOMB_DEFS[cell.id];
    const availability = shipworksActionAvailability(ctx.state);
    const outfit = availability.outfitEnabled;
    const byTierThenPrice = (a, b) => ((a.unlockTier || 0) - (b.unlockTier || 0)) || (a.price - b.price);
    const catalogue = BOMB_IDS.map((id) => BOMB_DEFS[id]).sort(byTierThenPrice);
    const rows = catalogue.map((d) => {
      const stock = rack.stock[d.id] || 0;
      const inSocket = cellDef && cellDef.id === d.id ? cell.count : 0;
      const elsewhereIndex = rack.cells.findIndex((c, k) => k !== i && c && c.id === d.id);
      const afford = rack.credits >= d.price;
      const sellValue = Math.max(1, Math.floor(d.price * BOMB_RACK.sellbackFraction));
      const verbs = [];
      // Load is the primary verb when the hangar actually holds this payload.
      if (stock > 0) {
        const move = inSocket ? Math.min(d.magazine - inSocket, stock) : Math.min(d.magazine, stock);
        if (move > 0) {
          const word = inSocket ? 'Top up' : elsewhereIndex >= 0 ? 'Move here' : 'Load';
          verbs.push(`<button type="button" ${stationControlAttrs('payload-fit')} class="k-word k-word--fine k-word--primary sx-modrow__buy" data-payload-fit="${escapeHtml(d.id)}" ${outfit ? '' : `disabled aria-label="${escapeHtml(availability.outfitLabel)}"`}>${word} <small class="k-38">${move} u</small></button>`);
        }
      }
      const buyLabel = !outfit ? 'Dock to buy' : afford ? 'Buy' : `Need ${fmt(d.price)} cr`;
      const buyHint = !outfit ? availability.outfitLabel : afford ? `Buy one ${d.name} into hangar stock` : 'Not enough credits';
      verbs.push(`<button type="button" ${stationControlAttrs('payload-buy')} class="k-word k-word--fine sx-modrow__buy" data-payload-buy="${escapeHtml(d.id)}" ${outfit && afford ? '' : `disabled aria-label="${escapeHtml(buyHint)}"`}>${escapeHtml(buyLabel)} <small class="k-38">${fmt(d.price)} cr</small></button>`);
      if (stock > 0) {
        verbs.push(`<button type="button" ${stationControlAttrs('payload-sell')} class="k-word k-word--fine sx-modrow__buy" data-payload-sell="${escapeHtml(d.id)}" ${outfit ? '' : `disabled aria-label="${escapeHtml(availability.outfitLabel)}"`}>${stationControlLabel('payload-sell')} <small class="k-38">${fmt(sellValue)} cr</small></button>`);
      }
      const seat = inSocket ? `Socket ${i + 1} holds ${inSocket}/${d.magazine}`
        : elsewhereIndex >= 0 ? `Fitted in socket ${elsewhereIndex + 1}`
        : stock > 0 ? `${stock} in the hangar` : 'None in the hangar';
      return (
        `<li class="k-row sx-modrow${inSocket ? ' is-eq' : ''}" data-payload-row="${escapeHtml(d.id)}" tabindex="0">` +
          `<span class="k-row__name sx-modrow__body"><span class="sx-modrow__name">${escapeHtml(d.name)}</span>` +
            `<span class="k-row__sub sx-modrow__role">Ordnance · T${d.unlockTier || 0} · magazine ${d.magazine}</span>` +
            `<span class="k-row__sub sx-modrow__meta">${escapeHtml(d.sentence)} Fuze ${d.fuzeS}s · cooldown ${d.cooldownS}s.</span>` +
            `<span class="k-row__sub k-38 sx-modrow__role">${escapeHtml(seat)}</span></span>` +
          `<span class="k-row__num sx-modrow__act">${verbs.join('')}</span>` +
        `</li>`
      );
    }).join('');
    const unfitRow = cellDef
      ? `<ul class="k-words k-words--row"><li><button type="button" ${stationControlAttrs('unload')} class="k-word k-word--emph sx-chooser__unfit" data-payload-unfit="${i}" ${outfit ? '' : `disabled aria-label="${escapeHtml(availability.outfitLabel)}"`}>${outfit ? `Unload ${escapeHtml(cellDef.name)}` : 'Dock to unload'}</button></li></ul>`
      : '';
    chooserEl.innerHTML =
      `<div class="sx-chooser__panel" role="region" aria-label="Rack socket ${i + 1} ordnance">` +
        `<header class="sx-chooser__head">` +
          `<ul class="k-words k-words--row"><li><button type="button" ${stationControlAttrs('back')} class="k-word k-word--body sx-chooser__x" data-close aria-label="Back to the hulls">${stationControlLabel('back')}</button></li></ul>` +
          `<p class="k-caps sx-chooser__kicker">Bomb rack · socket ${i + 1} of ${rack.sockets}</p>` +
          `<h3 class="k-t-sub">Ordnance <span class="k-38">${catalogue.length}</span></h3>` +
        `</header>` +
        (outfit ? '' : `<p class="k-sentence sx-muted">${escapeHtml(availability.outfitLabel)}</p>`) +
        unfitRow +
        `<ul class="k-rows sx-chooser__list">${rows || '<li class="k-sentence sx-muted">No ordnance catalogued.</li>'}</ul>` +
      `</div>`;
    dressChooser();
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
      syncGaugeValues(ghostBandModel, { ghost: true });
      syncPowerBand(ghostBandModel);
    }
    const ghostSlot = Number.isInteger(slotIndex) ? slotIndex : selectedSlot;
    const moduleDef = FITTABLE_BY_ID.get(ghost.moduleId || moduleId);
    const previewNode = jigHost && jigHost.querySelector(`.orr-sw-node[data-slot="${ghostSlot}"]`);
    if (previewNode && moduleDef) {
      previewNode.classList.add('is-preview');
      const nameEl = previewNode.querySelector('.orr-sw-node__name');
      const stateEl = previewNode.querySelector('.orr-sw-node__state');
      if (nameEl) nameEl.textContent = moduleDef.name;
      if (stateEl) stateEl.textContent = 'preview';
    }
    syncPowerGhost(def, ghost.afterFittings);
    const changed = (ghost.changedRows || []).filter((row) => row.tone !== 'same').slice(0, 4);
    if (changed.length) {
      deltaEl.hidden = false;
      deltaEl.innerHTML = `<span class="sx-sw__delta-k">Proposed fit</span> ` + changed.map((row) => {
        const label = formatPreviewDelta(row);
        return `<span class="${row.tone === 'better' ? 'k-good' : 'k-bad'} is-${row.tone === 'better' ? 'gain' : 'loss'}">${escapeHtml(label || row.label)}</span>`;
      }).join(' · ');
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
      syncGaugeValues(ghostBandModel, { ghost: true });
      syncPowerBand(ghostBandModel);
    }
    const summary = ghostMassDelta && ghostMassDelta.ok ? ghostMassDelta.summary : '';
    if (summary) {
      deltaEl.hidden = false;
      deltaEl.innerHTML = `<span class="sx-sw__delta-k">Build preview</span> <span>${escapeHtml(summary)}</span>`;
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
    syncStageDock();
    rememberShipView();
    syncModeWords();
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
  railListEl.addEventListener('scroll', syncListFold, { passive: true });

  railListEl.addEventListener('keydown', (ev) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(ev.key)) return;
    const rows = [...railListEl.querySelectorAll('.sx-sw-row')];
    if (!rows.length) return;
    const current = ev.target.closest('.sx-sw-row') || railListEl.querySelector('.sx-sw-row.is-active');
    const currentIndex = Math.max(0, rows.indexOf(current));
    let nextIndex = currentIndex;
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') nextIndex = Math.max(0, currentIndex - 1);
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') nextIndex = Math.min(rows.length - 1, currentIndex + 1);
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
    const rackCell = ev.target.closest('[data-rack-socket]');
    if (rackCell) { openPayloadChooser(Number(rackCell.getAttribute('data-rack-socket')), rackCell); return; }
    const rackRestock = ev.target.closest('[data-rack-restock]');
    if (rackRestock) {
      if (!rackRestock.disabled && ctx.bus) {
        ctx.bus.emit('ui:restockBombRack', {});
        ctx.bus.emit('audio:cue', { id: UI_SWITCH_DETENT_CUE });
        setTimeout(refresh, 70);
      }
      return;
    }
    const rackUpgrade = ev.target.closest('[data-rack-upgrade]');
    if (rackUpgrade) {
      if (!rackUpgrade.disabled && ctx.bus) {
        ctx.bus.emit('ui:upgradeBombRack', {});
        ctx.bus.emit('audio:cue', { id: UI_SWITCH_DETENT_CUE });
        setTimeout(refresh, 70);
      }
      return;
    }
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

  sideEl.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') return;
    const rackCell = ev.target.closest('[data-rack-socket]');
    if (!rackCell) return;
    ev.preventDefault();
    openPayloadChooser(Number(rackCell.getAttribute('data-rack-socket')), rackCell);
  });

  statsEl.addEventListener('click', async (ev) => {
    const band = ev.target.closest('[data-band]');
    if (band) {
      const next = band.getAttribute('data-band');
      if (next && next !== selectedBand) {
        selectedBand = next;
        if (activeBandModel) renderApron(activeBandModel);
        if (ctx.bus) ctx.bus.emit('audio:cue', { id: 'ui_tick' });
      }
      return;
    }
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
    if (control && stageEl.classList.contains('has-salering')) { turnToView(control.getAttribute('data-camera')); return; }
    if (!control || !mount) return;
    const command = control.getAttribute('data-camera');
    for (const b of control.parentElement.parentElement.querySelectorAll('[data-camera]')) b.classList.toggle('is-current', b === control);
    if (command === 'left') mount.rotateBy(-.22);
    else if (command === 'right') mount.rotateBy(.22);
    else { mount.setYaw(CENTERED_SHIP_YAW); mount.setZoom(1); }
    scheduleSpatialProjection();
  });
  el.querySelector('.sx-sw__camera').addEventListener('keydown', (ev) => {
    if (!stageEl.classList.contains('has-salering') || (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight')) return;
    const at = VIEW_ORDER.indexOf(saleView);
    const next = VIEW_ORDER[Math.max(0, Math.min(VIEW_ORDER.length - 1, at + (ev.key === 'ArrowLeft' ? -1 : 1)))];
    ev.preventDefault();
    turnToView(next);
    const word = el.querySelector(`.sx-sw__camera [data-camera="${next}"]`);
    if (word) word.focus({ preventScroll: true });
  });
  const stageResizeObserver = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => scheduleSpatialProjection()) : null;
  if (stageResizeObserver) {
    stageResizeObserver.observe(stageEl);
    // The rack's row count changes with the fit; a resize there must re-pin the side plate's top.
    if (gaugeRackEl) stageResizeObserver.observe(gaugeRackEl);
  }

  let buyConfirmBusy = false;
  chooserEl.addEventListener('click', async (ev) => {
    if (ev.target.closest('[data-close]')) { closeChooser(); return; }
    // Ordnance verbs (PQ-205.03): every click is an intent to the bombs system — the rack
    // owner applies it, the economy owner moves the credits. The chooser stays open and
    // re-reads state so stock counts and socket contents repaint in place.
    const payloadBuy = ev.target.closest('[data-payload-buy]');
    if (payloadBuy) {
      if (!payloadBuy.disabled && ctx.bus) {
        ctx.bus.emit('ui:buyPayload', { payloadId: payloadBuy.getAttribute('data-payload-buy'), units: 1 });
        ctx.bus.emit('audio:cue', { id: UI_SWITCH_DETENT_CUE });
        renderPayloadChooser();
        renderSide();
      }
      return;
    }
    const payloadFit = ev.target.closest('[data-payload-fit]');
    if (payloadFit) {
      if (!payloadFit.disabled && ctx.bus) {
        ctx.bus.emit('ui:fitPayload', { socketIndex: payloadSocket, payloadId: payloadFit.getAttribute('data-payload-fit') });
        ctx.bus.emit('audio:cue', { id: UI_SWITCH_DETENT_CUE });
        renderPayloadChooser();
        renderSide();
      }
      return;
    }
    const payloadSell = ev.target.closest('[data-payload-sell]');
    if (payloadSell) {
      if (!payloadSell.disabled && ctx.bus) {
        ctx.bus.emit('ui:sellPayload', { payloadId: payloadSell.getAttribute('data-payload-sell'), units: 1 });
        ctx.bus.emit('audio:cue', { id: UI_SWITCH_DETENT_CUE });
        renderPayloadChooser();
        renderSide();
      }
      return;
    }
    const payloadUnfit = ev.target.closest('[data-payload-unfit]');
    if (payloadUnfit) {
      if (!payloadUnfit.disabled && ctx.bus) {
        ctx.bus.emit('ui:unfitPayload', { socketIndex: Number(payloadUnfit.getAttribute('data-payload-unfit')) });
        ctx.bus.emit('audio:cue', { id: UI_SWITCH_DETENT_CUE });
        renderPayloadChooser();
        renderSide();
      }
      return;
    }
    const bf = ev.target.closest('[data-buyfit]');
    if (bf && !bf.disabled && shipworksActionAvailability(ctx.state).outfitEnabled) {
      if (buyConfirmBusy || isConfirmOpen()) return;
      const defId = bf.getAttribute('data-buyfit');
      const fitSlotValue = bf.getAttribute('data-fit-slot');
      const fitSlotIndex = fitSlotValue == null ? null : Number(fitSlotValue);
      const def = FITTABLE_BY_ID.get(defId);
      if (!def) return;
      const credits = Math.max(0, Number(ctx.state.player && ctx.state.player.credits) || 0);
      const shopStationId = ctx.state.ui && ctx.state.ui.docked === true ? ctx.state.ui.dockedStationId : null;
      const offer = stationShopOffer(def, shopStationId);
      const confirmOpts = describeOutfittingSpendConfirm(def, credits, {
        fitSlotIndex,
        price: offer ? offer.price : moduleSimPrice(def),
      });
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
      if (ctx.bus) { ctx.bus.emit('ui:buyModule', { defId, fitSlotIndex, shipIndex: viewIdx }); ctx.bus.emit('audio:cue', { id: UI_SWITCH_DETENT_CUE }); }
      closeChooser(); setTimeout(refresh, 70); return;
    }
    // A module already owned in the hold: ui:fitModule takes the row's instanceId and the viewed
    // hull's index — the chooser outfits the ship on screen, not always the active one.
    const fi = ev.target.closest('[data-fit-inv]');
    if (fi && !fi.disabled && shipworksActionAvailability(ctx.state).outfitEnabled) {
      if (ctx.bus) {
        ctx.bus.emit('ui:fitModule', {
          shipIndex: viewIdx,
          slotIndex: Number(fi.getAttribute('data-fit-inv-slot')),
          instanceId: fi.getAttribute('data-fit-inv'),
        });
        ctx.bus.emit('audio:cue', { id: UI_SWITCH_DETENT_CUE });
      }
      closeChooser(); setTimeout(refresh, 70); return;
    }
    const uf = ev.target.closest('[data-unfit]');
    if (uf && !uf.disabled && shipworksActionAvailability(ctx.state).outfitEnabled) { if (ctx.bus) { ctx.bus.emit('ui:unfitModule', { shipIndex: viewIdx, slotIndex: Number(uf.getAttribute('data-unfit')) }); ctx.bus.emit('audio:cue', { id: UI_SWITCH_DETENT_CUE }); } closeChooser(); setTimeout(refresh, 70); }
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
      syncStageDock();
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
    },
    onHide() {
      if (previewSettleTimer) clearTimeout(previewSettleTimer);
      previewSettleTimer = 0;
      restoreSharedStageHull();
      if (mount) mount.setActive(false);
      powerBeam.setActive(false);
    }, // stop the render loop when leaving (perf)
    refresh,
    dispose() {
      if (chooserCloseTimer) clearTimeout(chooserCloseTimer);
      if (previewSettleTimer) clearTimeout(previewSettleTimer);
      if (projectionFrame) cancelAnimationFrame(projectionFrame);
      if (stageResizeObserver) stageResizeObserver.disconnect();
      if (typeof rangeIntentUnsub === 'function') { try { rangeIntentUnsub(); } catch (_) {} }
      rangeIntentUnsub = null;
      try { powerBeam.dispose(); } catch (_) {}
      if (mount) { try { mount.dispose(); } catch (_) {} mount = null; }
      try { delete canvas.__sfPreviewDiagnostics; } catch (_) {}
    },
  };
}
