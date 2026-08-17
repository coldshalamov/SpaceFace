// Flight HUD (ARCHITECTURE §5.5, design spec "HUD LAYOUT") — always-mounted flight overlay.
//
// Layout:
//   bottom-left   : hull / shield / energy / heat vertical bars + numerics
//   bottom-center : throttle + speed + cargo (used/cap) + credits
//   bottom-right  : radar (radar.js) with target panel (targetPanel.js) above it
//   top-center    : alert queue (alerts.js renders into #alerts directly)
//   top-right     : active objective line + off-screen objective arrow
//
// Update split (§5.5):
//   - frame path: cheap local transforms/classes only.
//   - numerics via textContent @10Hz.
//   - compositor-heavy overlays use explicit time cadences instead of implicit per-frame work.
//   - lists/credits/cargo rebuilt only on data events (credits:changed, cargo:changed, ship:statsChanged).
//
// The HUD READS state for display and never mutates sim state (§5, §0.6).

import { createRadar } from './radar.js';
import { createTargetPanel } from './targetPanel.js';
import { createFloatingText } from './floatingText.js';
import { createDamageIndicators } from './damageIndicators.js';
import { createHudMeta, HUD_META_CSS } from './hudMeta.js';
import { SHIPS } from '../data/ships.js';
import { COMMODITIES } from '../data/commodities.js';
import { SECTORS } from '../data/sectors.js';
import { STORY_BEATS } from '../data/missions.js';
import { PERSISTENT_CARGO } from '../data/narrative.js';
import { estimateBrakingSolution, evaluateArrivalCue } from '../core/flight/flightTelemetry.js';
import { resolvePropulsionProfile } from '../core/flight/propulsionCatalog.js';
import { resolveTravelCeiling, TRAVEL_DRIVE_STATES } from '../core/flight/propulsionKernel.js';
import { travelFlag } from '../data/featureFlags.js';
import { BINDINGS } from './bindings.js';
import { coreText } from './localizedCoreCopy.js';
import { SEMANTIC_PALETTE, getMotionReduced, getFlashReduced } from './accessibility.js';
import { resolveWaypointPresentationPosition } from './navigationWaypoint.js';
import { contactThreatTier, contactStateWord, isHostileToPlayer, isWreckLike, wreckScanned } from '../systems/scanner.js';
import { verbAcceptsType } from '../data/interactionDescriptorCatalog.js';
import { weaponHeatSummary } from './weaponHeat.js';
import { computeLeadPipOverlay, leadSolution, primaryProjSpeed, hasBallisticWeapon } from '../ai/gunnery.js';
import { confirm } from './confirm.js';
import { bestKnownSellFor, applyTradeNavigation } from './screens/market.js';
import { createFlickerGrid, createHexPattern, createRouteBeam, createCircularGauge, createSupplyTree } from './effects/index.js';
import { DEFAULTS as INPUT_DEFAULTS } from '../systems/input.js';
import { createHudDragController } from './hudLayout.js';
import {
  MAX_GRAVITY_MARK_OVERLAYS,
} from './gravityMarkOverlay.js';
import {
  fillActiveMassCouplingTargets,
  MAX_MOMENTUM_SINK_OVERLAYS,
} from './momentumSinkOverlay.js';
import { MOMENTUM_SINK_STATUS_ID } from '../data/combatDefs.js';
import {
  buildCorridorOpeningWaypoint,
} from '../systems/missions.js';
import {
  contactRosterExpanded,
  firstUseAttachKind,
  formatDestinationLine,
  formatRosterCount,
  hudJobFromState,
  masslineInstrumentReadout,
  masslineInstrumentVisible,
  receiptLaneRect,
  vitalNumericVisible,
} from './hudAttention.js';

// ---- PR95 quiet combat HUD: the three timings the flight overlay speaks in ------------------------
// All three are short and bounded by construction. Exported so the contract is testable as a number
// rather than as a screenshot, and so nothing downstream re-derives a second copy of them.
//
// The reticle is the combat instrument when verbose floating text is off (the default), so it gets
// exactly three states and no more: acquire (authoritative selection settled), hit (a shot of ours
// landed), kill (that target is gone). Each one plays once and stops.
export const RETICLE_ACQUIRE_S = 0.18;
export const RETICLE_HIT_S = 1 / 60;
export const RETICLE_KILL_S = 0.1;
// Damage-free seconds after which the critical-hull treatment releases. Critical hull is a
// condition; being shot at is an event. The treatment marks the event, so it clears when the
// shooting stops even though the hull is still red — the persistent words stay in the alert lane.
export const HULL_CRIT_CALM_S = 2;

/** Is the critical-hull treatment armed? Pure so the two-damage-free-seconds rule is testable. */
export function hullCriticalTreatmentActive(hullFrac, sinceDamageS) {
  const frac = Number(hullFrac);
  const since = Number(sinceDamageS);
  if (!(frac > 0) || !(frac < 0.25)) return false;
  return Number.isFinite(since) && since < HULL_CRIT_CALM_S;
}

/**
 * Presentation model for Plan 54's optional docking vector.
 *
 * The sim remains authoritative: this reads the dockingCorridor publication and never infers a
 * second corridor or changes the capture assist. A retained output object keeps the HUD cadence
 * allocation-free; callers that omit it get a convenient one-off record for tests/tools.
 */
export function dockingAssistHintModel(state, out = {}) {
  const settings = state && state.settings;
  const enabled = !!(settings && settings.gameplay && settings.gameplay.dockAssistHint === true);
  const corridor = state && state.dockingCorridor;
  const active = !!(enabled && corridor && corridor.berth
    && (corridor.inCorridor === true || corridor.inCapture === true));
  out.visible = active;
  out.berth = active ? corridor.berth : null;
  out.assisting = active && !!corridor.assist;
  out.headingOk = active && corridor.headingOk === true;
  out.label = !active ? '' : (out.assisting ? 'CAPTURE ASSIST' : (out.headingOk ? 'DOCK VECTOR' : 'ALIGN TO BERTH'));
  return out;
}

/** Resolve a projected player→berth segment without inventing off-screen direction. */
export function dockingAssistScreenGeometry(playerScreen, berthScreen, out = {}) {
  const valid = !!(playerScreen && berthScreen
    && playerScreen.onScreen !== false && berthScreen.onScreen !== false
    && Number.isFinite(playerScreen.x) && Number.isFinite(playerScreen.y)
    && Number.isFinite(berthScreen.x) && Number.isFinite(berthScreen.y));
  const dx = valid ? berthScreen.x - playerScreen.x : 0;
  const dy = valid ? berthScreen.y - playerScreen.y : 0;
  const length = valid ? Math.hypot(dx, dy) : 0;
  out.visible = valid && length >= 10;
  out.x = valid ? playerScreen.x : 0;
  out.y = valid ? playerScreen.y : 0;
  out.dx = dx;
  out.dy = dy;
  out.length = length;
  out.angleDeg = out.visible ? Math.atan2(dy, dx) * 180 / Math.PI : 0;
  const invLength = out.visible ? 1 / length : 0;
  // Keep copy away from both the player silhouette and berth/anchor endpoint. A small normal offset
  // makes it read as the vector's caption rather than a second target label.
  out.labelDx = out.visible ? dx * 0.52 - dy * invLength * 11 : 0;
  out.labelDy = out.visible ? dy * 0.52 + dx * invLength * 11 : 0;
  return out;
}

/** Does this combat:damage receipt mean "a shot of OURS landed on someone else"? */
export function reticleHitFromDamage(payload, playerId) {
  if (!payload || playerId == null) return false;
  if (payload.attackerId !== playerId) return false;
  if (payload.targetId === playerId) return false;   // our own hull is the schematic's job
  const landed = Math.max(0, Number(payload.applied != null ? payload.applied : payload.amount) || 0);
  return landed > 0 || !!payload.brokeShield;
}

/** Does this entity:killed receipt mean "we killed it"? */
export function reticleKillFromEvent(payload, playerId) {
  return !!(payload && playerId != null && payload.killerId === playerId);
}

/**
 * Advance the reticle's three bounded lifetimes by `dt`.
 *
 * Every timing rule that matters lives here, in a pure step, so it is checkable as arithmetic:
 *   - hit is ASSIGNED, never accumulated — a held trigger re-arms an identical one-frame tick and can
 *     never integrate into a growing bloom;
 *   - a kill supersedes a pending hit, so the tick and the collapse never draw together;
 *   - acquire fires on the RISING EDGE of the authoritative target only — holding does not re-snap,
 *     and losing the target drops straight to idle with no lingering acquire.
 *
 * @param {{hitT:number,killT:number,acquireT:number,targetId:*}} prev
 * @param {number} dt seconds
 * @param {{targetId:*,hit:boolean,kill:boolean}} input authoritative target + receipts seen this step
 */
export function stepReticleFeedback(prev, dt, input) {
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
  const p = prev || {};
  const was = p.targetId != null ? p.targetId : null;
  const now = input && input.targetId != null ? input.targetId : null;
  const acquireT = now !== was
    ? (now != null ? RETICLE_ACQUIRE_S : 0)
    : Math.max(0, (Number(p.acquireT) || 0) - step);
  let hitT = Math.max(0, (Number(p.hitT) || 0) - step);
  let killT = Math.max(0, (Number(p.killT) || 0) - step);
  if (input && input.hit) hitT = RETICLE_HIT_S;
  if (input && input.kill) { killT = RETICLE_KILL_S; hitT = 0; }
  return { hitT, killT, acquireT, targetId: now };
}

// Ship role → friendly archetype label (Phase 3 HUD class indicator).
const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const ROLE_LABEL = {
  starter: 'Starter', mining: 'Miner', fighter: 'Fighter', freighter: 'Freighter',
  multirole: 'Multirole', interceptor: 'Interceptor', mining_barge: 'Mining Barge',
  corvette: 'Corvette', heavy_hauler: 'Heavy Hauler', explorer: 'Explorer',
  gunship: 'Gunship', battlecruiser: 'Battlecruiser', flagship: 'Flagship',
};
// Drive-family short label for the CLASS readout. Resolved from the hull's driveId so the player
// feels the propulsion family (spec §6) without opening a stat screen.
const DRIVE_FAMILY_LABEL = {
  reaction: 'Reaction', gravimetric: 'Gravimetric', pulse_plate: 'Pulse Plate',
  torch: 'Torch', field_sail: 'Field Sail',
};
function driveFamilyFor(def) {
  const driveId = def && def.driveId;
  if (!driveId) return '';
  if (driveId.startsWith('drive_gravimetric')) return DRIVE_FAMILY_LABEL.gravimetric;
  if (driveId.startsWith('drive_pulse_plate')) return DRIVE_FAMILY_LABEL.pulse_plate;
  if (driveId.startsWith('drive_torch')) return DRIVE_FAMILY_LABEL.torch;
  if (driveId.startsWith('drive_field_sail')) return DRIVE_FAMILY_LABEL.field_sail;
  if (driveId.startsWith('drive_reaction')) return DRIVE_FAMILY_LABEL.reaction;
  return '';
}

// ── Mission tracker helpers ──────────────────────────────────────────────────────────────────
const MT_STATION_BY_ID = new Map();
const MT_SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s.name]));
for (const sec of SECTORS) {
  for (const st of sec.stations || []) {
    MT_STATION_BY_ID.set(st.id, st.name);
  }
}
const MT_CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const PERSISTENT_CARGO_BY_ID = new Map(PERSISTENT_CARGO.map((c) => [c.id, c]));
const STATION_ROLE_LABELS = {
  trade_hub: 'Trade Hub',
  refinery: 'Refinery',
  mining: 'Mining',
  fab: 'Fabricator',
  military: 'Military',
  blackmarket: 'Black Market',
  research: 'Research',
};

function mtCmdtyName(id) {
  const c = MT_CMDTY_BY_ID.get(id);
  return c ? c.name : (id || 'cargo').replace('cmdty_', '').replace(/_/g, ' ');
}

function cargoDisplayName(id) {
  const c = MT_CMDTY_BY_ID.get(id) || PERSISTENT_CARGO_BY_ID.get(id);
  return c ? c.name : (id || 'cargo').replace('cmdty_', '').replace(/_/g, ' ');
}

function stationRoleLabel(id) {
  return STATION_ROLE_LABELS[id] || String(id || 'unknown').replace(/_/g, ' ');
}

function isPersistentCargoId(state, id) {
  const locked = state && state.story && state.story.persistentCargo;
  return Array.isArray(locked) && locked.includes(id);
}

function cargoVolumeForRow(state, id, qty, def) {
  if (isPersistentCargoId(state, id) && PERSISTENT_CARGO_BY_ID.has(id)) return 0;
  const volPerU = def ? (def.volPerU || 1) : 1;
  return qty * volPerU;
}

function mtStationName(id) {
  return MT_STATION_BY_ID.get(id) || 'destination';
}

function mtSectorName(id) {
  return MT_SECTOR_BY_ID.get(id) || id || 'target sector';
}

function respawnStationName(id) {
  return MT_STATION_BY_ID.get(id) || String(id || 'safe station').replace(/^station_/, '').replace(/_/g, ' ');
}

export function respawnToastText(payload = {}) {
  const parts = ['Recovered at ' + respawnStationName(payload.stationId)];
  const refund = Math.max(0, Math.round(Number(payload.refundCr) || 0));
  if (refund > 0) parts.push('insurance +' + refund.toLocaleString('en-US') + ' cr');
  const cargoLostQty = Math.max(0, Math.round(Number(payload.cargoLostQty) || 0));
  if (cargoLostQty > 0) parts.push('cargo lost ' + cargoLostQty + 'u');
  else if (payload.cargoLost) parts.push('cargo lost');
  parts.push('3s shields online');
  return parts.join(' - ');
}

function mtRouteGuidance(state, waypoint) {
  if (!state || !waypoint || !waypoint.sectorId) return null;
  const currentSectorId = state.world && state.world.currentSectorId;
  if (!currentSectorId || currentSectorId === waypoint.sectorId) return null;
  const route = state.nav && state.nav.route;
  const legs = route && Array.isArray(route.legs) ? route.legs : [];
  const first = legs[0];
  const last = legs[legs.length - 1];
  if (first && last && first.from === currentSectorId && last.to === waypoint.sectorId) {
    const hops = route.totalHops || legs.length;
    const fuel = Math.round(route.totalFuel || legs.reduce((sum, leg) => sum + (leg.fuel || 0), 0));
    return {
      next: `Next jump: ${mtSectorName(first.to)}`,
      summary: `${hops} hop${hops === 1 ? '' : 's'} / ${fuel}F`,
    };
  }
  return {
    next: `Plot route to ${mtSectorName(waypoint.sectorId)}`,
    summary: `${BINDINGS.starmap.label} Star Map`,
  };
}

export function resolveHudNavStation(state, stationId) {
  if (!state || !stationId) return null;
  const index = state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1) {
    const byStationId = index.byStationId;
    const indexed = byStationId && byStationId.get(stationId);
    if (indexed && indexed.alive !== false && indexed.type === 'station') return indexed;
    const buckets = [index.stations, index.dockStations];
    for (const stations of buckets) {
      if (!stations || !stations.length) continue;
      for (const e of stations) {
        if (e && e.alive !== false && e.type === 'station' && e.data && e.data.stationId === stationId) return e;
      }
    }
    return null;
  }
  for (const e of state.entityList || []) {
    if (e && e.type === 'station' && e.alive !== false && e.data && e.data.stationId === stationId) return e;
  }
  return null;
}

function mtObjectiveText(m) {
  const p = m.params || {};
  const prog = m.objectiveProgress || 0;
  const tgt = m.objectiveTarget || 1;
  const dest = mtStationName(m.destStationId);
  switch (m.type) {
    case 'cargo_delivery':
    case 'salvage_retrieval':
    case 'passenger_transport':
      return `Deliver to ${dest}`;
    case 'bulk_trade':
      return `Sell ${prog}/${tgt} ${mtCmdtyName(p.cmdtyId)}`;
    case 'mining_quota':
      return `Mine ${prog}/${tgt} ${mtCmdtyName(p.cmdtyId)}`;
    case 'bounty_hunt':
      return 'Eliminate target';
    case 'patrol_clear':
      return `Clear ${prog}/${tgt} hostiles`;
    case 'escort':
      return `Escort to ${dest}`;
    case 'recon_scan':
      return `Scan ${prog}/${tgt} targets`;
    case 'smuggling_run':
      return `Deliver contraband to ${dest}`;
    default:
      return `${prog}/${tgt}`;
  }
}

function mtFmtTime(s) {
  s = Math.max(0, Math.floor(s));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec < 10 ? '0' : ''}${sec}s`;
}

export function objectiveTravelReadout(state, wp, out = null) {
  const result = out && typeof out === 'object' ? out : {};
  const pos = wp && wp.pos;
  const player = state && state.entities && state.entities.get && state.entities.get(state.playerId);
  if (!pos || !player || !player.pos) {
    result.distanceWu = null;
    result.closingSpeed = 0;
    result.etaS = null;
    result.distanceText = 'ROUTE PENDING';
    result.etaText = 'ETA —';
    return result;
  }
  const dist = Math.hypot(pos.x - player.pos.x, pos.z - player.pos.z);
  const vel = player.vel || { x: 0, z: 0 };
  const closingSpeed = dist > 0
    ? ((Number(vel.x) || 0) * (pos.x - player.pos.x) + (Number(vel.z) || 0) * (pos.z - player.pos.z)) / dist
    : 0;
  const etaS = closingSpeed > 5 ? dist / closingSpeed : null;
  const distanceText = dist >= 1000 ? `${(dist / 1000).toFixed(1)}k WU` : `${Math.round(dist)} WU`;
  const etaText = etaS == null
    ? 'ETA —'
    : `ETA ${etaS < 60 ? `${Math.max(1, Math.round(etaS))}s` : `${Math.round(etaS / 60)}m`}`;
  result.distanceWu = dist;
  result.closingSpeed = closingSpeed;
  result.etaS = etaS;
  result.distanceText = distanceText;
  result.etaText = etaText;
  return result;
}

function mtWaypointDistance(state, wp) {
  return objectiveTravelReadout(state, wp).distanceText;
}

/**
 * Eight-way world bearing for the active goal. This is deliberately a stable direction glyph,
 * not a continuously announced live-region value. The camera keeps a fixed world orientation,
 * so the arrow matches the radar/map direction without requiring compass prose.
 */
export function objectiveBearingGlyph(state, wp) {
  const pos = wp && wp.pos;
  const player = state && state.entities && state.entities.get && state.entities.get(state.playerId);
  if (!pos || !player || !player.pos) return '';
  const dx = Number(pos.x) - Number(player.pos.x);
  const dz = Number(pos.z) - Number(player.pos.z);
  if (!Number.isFinite(dx) || !Number.isFinite(dz) || Math.hypot(dx, dz) < 1) return '•';
  // North/up is -Z in the map/radar presentation; advance clockwise in 45-degree sectors.
  const octant = Math.round((Math.atan2(dx, -dz) / (Math.PI * 2)) * 8);
  return ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'][(octant + 8) % 8];
}

/**
 * Project an off-screen goal onto the HUD edge using the same fixed world orientation as the
 * radar. Do not use worldToScreen() for a point behind the chase camera: perspective projection
 * mirrors that point across the screen, which makes the arrow send the player away from the goal.
 *
 * The camera never yaws and the radar deliberately maps +X left / +Z up, so this is the stable
 * player-relative bearing contract for the edge cue.
 */
export function resolveObjectiveEdgePlacement(width, height, player, target, margin = 34, out = null) {
  const playerPos = player && player.pos;
  const targetPos = target && target.pos ? target.pos : target;
  if (!playerPos || !targetPos) return null;
  const worldDx = Number(targetPos.x) - Number(playerPos.x);
  const worldDz = Number(targetPos.z) - Number(playerPos.z);
  const length = Math.hypot(worldDx, worldDz);
  if (!Number.isFinite(worldDx) || !Number.isFinite(worldDz) || length < 0.001) return null;

  const w = Math.max(320, Number(width) || 1280);
  const h = Math.max(240, Number(height) || 720);
  // Same transform as radar.js: +X appears left and +Z appears up in the fixed chase view.
  const dx = -worldDx / length;
  const dy = -worldDz / length;
  const mx = Math.max(24, w / 2 - margin);
  const my = Math.max(24, h / 2 - margin);
  const tx = Math.abs(dx) > 0.001 ? mx / Math.abs(dx) : Infinity;
  const ty = Math.abs(dy) > 0.001 ? my / Math.abs(dy) : Infinity;
  const edgeT = Math.min(tx, ty);
  const x = w / 2 + dx * edgeT;
  const y = h / 2 + dy * edgeT;
  const edge = x > w * 0.72
    ? 'right'
    : (x < w * 0.28 ? 'left' : (dy < 0 ? 'top' : 'bottom'));
  const result = out && typeof out === 'object' ? out : {};
  result.x = x;
  result.y = y;
  result.edge = edge;
  result.angleRad = Math.atan2(dy, dx);
  return result;
}

function mtObjectiveAction(action, wp) {
  const verb = String(action || 'Open the Mission Log').trim();
  // Prefer the physical target label; sector name is the fallback for cross-sector guidance.
  const destination = String(wp && (wp.label || wp.mapLabel || wp.sectorName) || '').trim();
  if (!destination || /\b(to|at|near)\b/i.test(verb) || verb.toLowerCase().includes(destination.toLowerCase())) return verb;
  return `${verb} · ${destination}`;
}

/**
 * Resolve the sole flight command without combining state from different navigation owners.
 * A matching mission waypoint may carry its tracked mission's timer; every other live waypoint
 * temporarily owns the command by itself while leaving mission tracking untouched.
 */
export function resolveFlightObjectiveCommand(
  state,
  waypoint = (state && state.nav && state.nav.waypoint) || buildCorridorOpeningWaypoint(state),
) {
  const trackedId = state && state.ui && state.ui.trackedMissionId;
  const active = (state && state.missions && state.missions.active) || [];
  const tracked = trackedId
    ? active.find((mission) => mission && mission.id === trackedId && mission.status === 'active')
    : null;
  const navWaypoint = state && state.nav && state.nav.waypoint;
  const trackedOwnsWaypoint = !!(
    tracked && navWaypoint && navWaypoint.kind === 'mission' && navWaypoint.missionId === tracked.id
  );

  if (tracked && (!navWaypoint || trackedOwnsWaypoint)) {
    return { owner: 'tracked-mission', mission: tracked, waypoint: navWaypoint || null };
  }

  if (waypoint) return { owner: 'navigation', mission: null, waypoint };

  const candidate = active.find((mission) => mission && mission.status === 'active');
  if (candidate) return { owner: 'untracked-mission', mission: candidate, waypoint: null };
  if (state && state.story && STORY_BEATS[state.story.beatIndex]) {
    return { owner: 'story', mission: null, waypoint: null };
  }
  return null;
}

function mtMarkerLine(state, wp, suffix = '') {
  const bearing = objectiveBearingGlyph(state, wp);
  const travel = objectiveTravelReadout(state, wp);
  const route = wp && wp.pos
    ? `◆ AMBER DIAMOND / GOAL · ${travel.distanceText} · ${travel.etaText}${bearing ? ` · ${bearing}` : ''}`
    : `NO GOAL MARKER · ${BINDINGS.missionLog.label} MISSION LOG`;
  return suffix ? `${route} · ${suffix}` : route;
}

/** One painted destination line for the live flight tracker. Titles and GOAL restatements stay off. */
export function flightDestinationSurface(state, command) {
  if (!command) return { show: false, line: '', urgent: false };
  if (command.owner === 'tracked-mission') {
    const tracked = command.mission;
    const waypoint = command.waypoint;
    const action = mtObjectiveAction(waypoint && waypoint.reason || mtObjectiveText(tracked), waypoint);
    const travel = objectiveTravelReadout(state, waypoint);
    let line = formatDestinationLine({
      action,
      distanceText: travel.distanceText,
      etaText: travel.etaText,
      bearing: objectiveBearingGlyph(state, waypoint),
    });
    let urgent = false;
    if (tracked && tracked.deadline_s != null && Number.isFinite(tracked.deadline_s)) {
      const remaining = Math.max(0, tracked.deadline_s - (state.simTime || 0));
      line = formatDestinationLine({ action: line, distanceText: mtFmtTime(remaining) });
      urgent = remaining < 120;
    }
    return { show: true, line, urgent };
  }
  if (command.owner === 'navigation') {
    const wp = command.waypoint;
    const travel = objectiveTravelReadout(state, wp);
    const routeGuide = mtRouteGuidance(state, wp);
    return {
      show: true,
      line: formatDestinationLine({
        action: mtObjectiveAction((wp && (wp.reason || wp.label)) || 'Follow the marked route', wp),
        distanceText: travel.distanceText,
        etaText: travel.etaText,
        bearing: objectiveBearingGlyph(state, wp),
      }) + (routeGuide && routeGuide.summary ? ` · ${routeGuide.summary}` : ''),
      urgent: false,
    };
  }
  if (command.owner === 'untracked-mission') {
    const candidate = command.mission;
    return {
      show: true,
      line: coreText('trackContract', {
        key: BINDINGS.missionLog.label,
        contract: candidate.title || candidate.name || 'one contract',
      }),
      urgent: false,
    };
  }
  if (command.owner === 'story') {
    return {
      show: true,
      line: coreText('chooseStoryAction', { key: BINDINGS.missionLog.label }),
      urgent: false,
    };
  }
  return { show: false, line: '', urgent: false };
}

/**
 * Geometry contract for the persistent flight anchors. Values mirror the authored desktop CSS and
 * intentionally reserve a clear center/lower-middle playfield. Used by the objective hierarchy
 * regression to cover both the 1280x720 floor and 1920x1080 target without launching the game.
 */
export function resolveObjectiveHudLayout(width, height) {
  const w = Math.max(320, Number(width) || 1280);
  const h = Math.max(240, Number(height) || 720);
  const compact = w <= 760 || h <= 620;
  const edge = compact ? 8 : 12;
  const bottom = compact ? 96 : 12;
  const objectiveWidth = Math.min(compact ? 300 : 272, w - edge * 2);
  const objectiveHeight = compact ? 68 : 84;
  const vitalsWidth = compact ? 152 : 272;
  const vitalsHeight = compact ? 124 : 170;
  const stackGap = 8;
  const rightWidth = compact ? 150 : 232;
  const rightHeight = compact ? 320 : 472;
  const actionWidth = Math.min(compact ? 420 : 520, w - edge * 2);
  const actionHeight = compact ? 64 : 76;
  const layout = {
    viewport: { x: 0, y: 0, width: w, height: h },
    objective: {
      x: edge,
      y: Math.max(edge, h - bottom - vitalsHeight - stackGap - objectiveHeight),
      width: objectiveWidth,
      height: objectiveHeight,
    },
    vitals: { x: edge, y: h - bottom - vitalsHeight, width: vitalsWidth, height: vitalsHeight },
    action: { x: (w - actionWidth) / 2, y: h - (compact ? 72 : 88), width: actionWidth, height: actionHeight },
    rightDock: {
      x: w - edge - rightWidth,
      y: Math.max(edge, h - bottom - rightHeight),
      width: rightWidth,
      height: rightHeight,
    },
    centerSafe: {
      x: Math.max(objectiveWidth + edge + 32, w * 0.28),
      y: Math.max(72, h * 0.14),
      width: Math.max(0, w - Math.max(objectiveWidth + edge + 32, w * 0.28) - Math.max(rightWidth + edge + 32, w * 0.2)),
      height: Math.max(0, h * 0.56),
    },
  };
  layout.receipt = receiptLaneRect(layout);
  return layout;
}

/** Maximum persistent contact rows before truthful category overflow takes over. */
export function contactDisplayLimit(width, height) {
  const w = Math.max(320, Number(width) || 1280);
  const h = Math.max(240, Number(height) || 720);
  if (w <= 900 || h <= 650) return 3;
  if (w <= 1400 || h <= 820) return 4;
  return 5;
}

/** Selected contact, active threats and allies must never be buried under ambient traffic. */
export function contactDisplayBand(contact, targetId) {
  if (!contact) return 5;
  if (contact.e && contact.e.id === targetId) return 0;
  if (contact.hostile) return 1;
  if (contact.ally) return 2;
  if (contact.isWreck) return 3;
  return 4;
}

/** Compact, truthful receipt for contacts omitted by the responsive row cap. */
export function contactOverflowSummary(contacts, visibleCount) {
  const omitted = (contacts || []).slice(Math.max(0, visibleCount | 0));
  if (!omitted.length) return '';
  const counts = { threat: 0, ally: 0, wreck: 0, other: 0 };
  for (const contact of omitted) {
    if (contact.hostile) counts.threat++;
    else if (contact.ally) counts.ally++;
    else if (contact.isWreck) counts.wreck++;
    else counts.other++;
  }
  const parts = [];
  for (const [key, count] of Object.entries(counts)) {
    if (count) parts.push(`${count} ${key.toUpperCase()}${count === 1 ? '' : 'S'}`);
  }
  return `+${omitted.length} · ${parts.join(' · ')}`;
}

/** A known radar contact must never exist while its targeting roster is wholly absent. */
export function contactRosterVisible({
  eligibleContactCount = 0,
  pinned = false,
  nearbyHostile = false,
  revealActive = false,
} = {}) {
  return eligibleContactCount > 0 || pinned || nearbyHostile || revealActive;
}

/** One truthful reading for the manual Travel Burn stopping cue. The route executor owns braking
 * while engaged, and an inactive autopilot target without a visible waypoint is stale state rather
 * than a destination the player is still approaching. */
export function travelTapeNavigationState(nav = {}) {
  const autopilot = nav.autopilot || null;
  const autopilotActive = !!(autopilot && autopilot.active === true);
  const executorEngaged = !!(nav.executor && nav.executor.engaged === true);
  const waypointPos = nav.waypoint && nav.waypoint.pos;
  const target = waypointPos || (autopilotActive && autopilot && autopilot.target) || null;
  const arrival = target && Number.isFinite(target.x) && Number.isFinite(target.z)
    ? {
      x: target.x,
      z: target.z,
      radius: Math.max(0, Number(autopilot && autopilot.arrivalRadius) || 36),
    }
    : null;
  return { manual: !autopilotActive && !executorEngaged, arrival };
}

/** Non-colour flight feedback for the manufactured route read model. The travel owner publishes
 * this status; the HUD only names it and never interprets or changes drive behavior. */
export function travelTapeLaneStatus(status = null) {
  if (!status || status.manufactured !== true || status.inLane !== true) return '';
  if (status.infrastructureStage === 'aligning') return 'THROUGHLINE ALIGNING';
  if (status.infrastructureOperational !== true) return 'THROUGHLINE OFFLINE';
  const multiplier = Number(status.ceilingMult);
  const label = Number.isFinite(multiplier) && multiplier > 1
    ? String(Math.round(multiplier * 10) / 10)
    : '1';
  return `THROUGHLINE ×${label}`;
}

// Ordinary-load HUD gates, kept in lockstep with src/render/vfx.js:229-230
// (TETHER_TAUT_LOAD / TETHER_OVERLOAD_LOAD) so the cable and the status line never disagree about
// whether the Massline is working. These key off tether.load, NOT tether.strain — see the note on
// masslineTetherStatus below.
const TETHER_STATUS_LOADED_LOAD = 0.5;
const TETHER_STATUS_HIGH_LOAD = 0.88;
const MASSLINE_HEAD_LABELS = Object.freeze({
  tractor: 'TRACTOR',
  elastic_whip: 'ELASTIC WHIP',
  frame_coupler: 'FRAME COUPLER',
  monofilament_sweep: 'MONOFILAMENT',
  transverse_snare: 'TRANSVERSE SNARE',
  twin_bridle: 'TWIN BRIDLE',
});

/**
 * Resolve the truthful Massline status copy from the gameplay-owned tether mirror.
 * Normal-load strain remains useful telemetry but is not a failure alarm. STRAINED/CRITICAL and
 * warning color are reserved for explicitly breakable, extreme-overload operations.
 *
 * WHY THE ORDINARY BRANCHES DO NOT KEY OFF tether.strain ALONE.
 *
 * tether.strain is the honest physical ratio lastTension / breakTension, and for tether_standard
 * breakTension is 10500000 (src/data/combatDefs.js:234) because the Massline is deliberately
 * near-unbreakable. Measured with scripts/probe-tether-visual-drive.mjs (640-mass asteroid latched,
 * full main thrust opposing the line for 240 ticks, line HELD) strain peaks at ~1e-4. So the two
 * ordinary branches below used to read `strain > 0.85` / `strain > 0.6` and those halves were
 * unreachable dead code — the status line was saved only by its phase fallback, and any operation
 * that produced load without the sim naming a phase read as a bare LOCKED.
 *
 * The fix is NOT to rescale strain (the envelope is a protected hand-tuned value, build plan §3.5
 * row 2). It is to key onto tether.load / tether.phase, the presentation-oriented signals that
 * actually vary in play (same probe: load 0 → 0.55, phase slack → capture → loaded). This mirrors
 * what src/render/vfx.js:3337-3338 already does for the cable.
 *
 * strain survives in two places, both legitimate:
 *   - the automaticBreakAllowed branches, the engineered extreme-load endpoint where the physical
 *     ratio genuinely can approach the envelope and CRITICAL/STRAINED is a real alarm;
 *   - as an UPPER escape hatch on the ordinary branches, so that if physical strain ever does climb
 *     it still overtakes the presentation read rather than being ignored.
 */
export function masslineTetherStatus(tether) {
  const strain = Number.isFinite(tether && tether.strain) ? Math.max(0, tether.strain) : 0;
  // Saves written before tether.load existed degrade to the strain read rather than reporting 0.
  const load = Number.isFinite(tether && tether.load)
    ? Math.max(0, Math.min(1, tether.load))
    : Math.min(1, strain);
  const phase = (tether && tether.phase) || 'slack';
  const automaticBreakAllowed = tether && tether.automaticBreakAllowed === true;
  const operation = tether && tether.reeling
    ? 'REELING'
    : tether && tether.payingOut
      ? 'PAYING OUT'
      : tether && tether.lineControl
        ? 'LINE CONTROL'
        : '';
  let status;
  if (automaticBreakAllowed && strain > 0.85) status = 'CRITICAL';
  else if (automaticBreakAllowed && strain > 0.6) status = 'STRAINED';
  else if (tether && tether.kind === 'transverse_snare' && phase === 'deploying') status = 'DEPLOYING';
  else if (tether && tether.kind === 'transverse_snare' && phase === 'armed') status = 'ARMED';
  else if (tether && tether.kind === 'transverse_snare' && phase === 'caught') status = 'CAUGHT';
  else if (tether && tether.kind === 'twin_bridle'
      && (phase === 'overload' || load > TETHER_STATUS_HIGH_LOAD || strain > 0.85)) status = 'HIGH LOAD';
  else if (tether && tether.kind === 'twin_bridle') status = 'LINKED';
  else if (phase === 'overload' || load > TETHER_STATUS_HIGH_LOAD || strain > 0.85) {
    status = operation ? `${operation} · HIGH LOAD` : 'HIGH LOAD';
  } else if (phase === 'loaded' || load > TETHER_STATUS_LOADED_LOAD || strain > 0.6) {
    status = operation ? `${operation} · LOADED` : 'LOADED';
  } else status = operation || 'LOCKED';
  const headLabel = MASSLINE_HEAD_LABELS[tether && tether.headId] || '';
  return {
    text: headLabel ? `${headLabel} · ${status}` : status,
    warn: automaticBreakAllowed && strain > 0.6,
  };
}

/** Frame-rate-independent 5 Hz presentation clock for contact-roster DOM work. */
export function createContactRosterClock() {
  return createHudClock(5, false);
}

export function consumeContactRosterClock(clock, dt) {
  return consumeHudClock(clock, dt) > 0;
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function hudEntityName(entity) {
  return (entity && (entity.name || (entity.data && entity.data.name))) || (entity ? entity.type : '');
}

// Live flight-binding labels (matches settings rebind + help): settings overrides → scheme → classic.
// Used so tether reel/cut prompts never hard-code a key that can drift from input.js.
function codeToBindingLabel(code) {
  if (!code) return '';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (code.startsWith('Arrow')) return { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }[code] || code;
  if (code === 'Space') return 'Space';
  if (code === 'ShiftLeft') return 'L-Shift';
  if (code === 'ShiftRight') return 'R-Shift';
  if (code === 'ControlLeft') return 'L-Ctrl';
  if (code === 'ControlRight') return 'R-Ctrl';
  if (code === 'AltLeft') return 'L-Alt';
  if (code === 'AltRight') return 'R-Alt';
  return code;
}

function resolveActionCodes(state, action) {
  const cfg = state && state.settings && state.settings.controls && state.settings.controls.bindings;
  const schemeName = state && state.settings && state.settings.gameplay && state.settings.gameplay.controlScheme;
  const schemes = (INPUT_DEFAULTS && INPUT_DEFAULTS.SCHEMES) || {};
  const scheme = schemes[schemeName] || schemes.pilot || (INPUT_DEFAULTS && INPUT_DEFAULTS.BINDINGS) || {};
  // Explicit empty settings override (e.g. tether: []) must not fall through to scheme/defaults.
  // Absent key → scheme → classic DEFAULTS. Present key (even []) is the player's override.
  let list;
  if (cfg && Object.prototype.hasOwnProperty.call(cfg, action)) {
    list = cfg[action];
  } else {
    list = scheme[action] || (INPUT_DEFAULTS && INPUT_DEFAULTS.BINDINGS && INPUT_DEFAULTS.BINDINGS[action]);
  }
  if (Array.isArray(list)) return list.filter(Boolean);
  return list ? [list] : [];
}

function resolveActionLabel(state, action) {
  const codes = resolveActionCodes(state, action);
  if (!codes.length) return '';
  return codes.map(codeToBindingLabel).filter(Boolean).join('/');
}

// M1 doctrine player-tells: map live ai:telegraph kinds (+ doctrineId fallback) to HUD tell ids.
const DOCTRINE_TELL_BY_KIND = Object.freeze({
  engine_flare: 'FLYBY',
  attach_spool: 'TETHER',
  weapon_charge: 'CHARGE',
});
const DOCTRINE_TELL_BY_ID = Object.freeze({
  interceptor_flyby: 'FLYBY',
  tether_control_raider: 'TETHER',
  ranged_disengager: 'CHARGE',
});
const DOCTRINE_TELL_HINT = Object.freeze({
  FLYBY: 'Break the beam',
  TETHER: 'Deny the latch',
  CHARGE: 'Close or break LOS',
});
const DOCTRINE_TELL_ICON = Object.freeze({
  FLYBY: SEMANTIC_PALETTE.danger?.icon || '⛔',
  TETHER: SEMANTIC_PALETTE.warning?.icon || '⚠',
  CHARGE: SEMANTIC_PALETTE.danger?.icon || '⛔',
});
const TELL_POOL_SIZE = 3;
const DEFAULT_TELEGRAPH_TICKS = 30;
const TELL_VISUAL_WIDTH = 240;
const TELL_VISUAL_HEIGHT = 30;
const TELL_LAYOUT_GAP = 8;

export function doctrineTellKind(payload) {
  if (!payload) return null;
  const byKind = DOCTRINE_TELL_BY_KIND[String(payload.kind || '')];
  if (byKind) return byKind;
  return DOCTRINE_TELL_BY_ID[String(payload.doctrineId || '')] || null;
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

/**
 * Place one transient doctrine tell without covering the persistent objective/vitals/action/radar
 * anchors. `projected` is the authoritative worldToScreen result; the returned direction always
 * follows that original projection even when the chip yields to a reserved HUD rectangle.
 */
export function resolveDoctrineTellPlacement(width, height, projected, slotIndex = 0) {
  const w = Math.max(320, Number(width) || 1280);
  const h = Math.max(240, Number(height) || 720);
  const px = Number(projected && projected.x);
  const py = Number(projected && projected.y);
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null;

  const chipWidth = Math.min(TELL_VISUAL_WIDTH, w - 16);
  const chipHeight = TELL_VISUAL_HEIGHT;
  const halfW = chipWidth / 2;
  const halfH = chipHeight / 2;
  const centerX = w / 2;
  const centerY = h / 2;
  let dx = px - centerX;
  let dy = py - centerY;
  const length = Math.hypot(dx, dy);
  if (length < 0.001) {
    dx = 0;
    dy = -1;
  } else {
    dx /= length;
    dy /= length;
  }
  const directionDeg = Math.atan2(dy, dx) * 180 / Math.PI;
  const onScreen = !!(projected && projected.onScreen);
  const stackOffset = Math.max(0, Math.min(TELL_POOL_SIZE - 1, Math.floor(Number(slotIndex) || 0)))
    * (chipHeight + 6);
  let x;
  let y;
  if (onScreen) {
    x = Math.max(halfW + TELL_LAYOUT_GAP, Math.min(w - halfW - TELL_LAYOUT_GAP, px));
    y = Math.max(halfH + TELL_LAYOUT_GAP,
      Math.min(h - halfH - TELL_LAYOUT_GAP, py - 38 - stackOffset));
  } else {
    const extentX = Math.max(1, centerX - halfW - TELL_LAYOUT_GAP);
    const extentY = Math.max(1, centerY - halfH - TELL_LAYOUT_GAP);
    const tx = Math.abs(dx) > 0.001 ? extentX / Math.abs(dx) : Infinity;
    const ty = Math.abs(dy) > 0.001 ? extentY / Math.abs(dy) : Infinity;
    const edgeDistance = Math.min(tx, ty);
    x = centerX + dx * edgeDistance;
    y = centerY + dy * edgeDistance - stackOffset;
    y = Math.max(halfH + TELL_LAYOUT_GAP, Math.min(h - halfH - TELL_LAYOUT_GAP, y));
  }

  const layout = resolveObjectiveHudLayout(w, h);
  const reserved = [layout.objective, layout.vitals, layout.action, layout.rightDock];
  const asRect = (cx, cy) => ({
    x: cx - halfW,
    y: cy - halfH,
    width: chipWidth,
    height: chipHeight,
  });
  for (let pass = 0; pass < reserved.length; pass++) {
    const collision = reserved.find((anchor) => rectsOverlap(asRect(x, y), anchor));
    if (!collision) break;
    // A corner chip can touch two stacked anchors (objective + vitals, or right dock + action).
    // Consider the outer edge of every reserved rectangle so one adjustment can clear the stack.
    const candidates = reserved.flatMap((anchor) => [
      { x, y: anchor.y - halfH - TELL_LAYOUT_GAP },
      { x, y: anchor.y + anchor.height + halfH + TELL_LAYOUT_GAP },
      { x: anchor.x - halfW - TELL_LAYOUT_GAP, y },
      { x: anchor.x + anchor.width + halfW + TELL_LAYOUT_GAP, y },
    ]).map((candidate) => ({
      x: Math.max(halfW + TELL_LAYOUT_GAP, Math.min(w - halfW - TELL_LAYOUT_GAP, candidate.x)),
      y: Math.max(halfH + TELL_LAYOUT_GAP, Math.min(h - halfH - TELL_LAYOUT_GAP, candidate.y)),
    })).filter((candidate) => reserved.every((anchor) => !rectsOverlap(asRect(candidate.x, candidate.y), anchor)));
    if (!candidates.length) return null;
    candidates.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
    x = candidates[0].x;
    y = candidates[0].y;
  }

  return { x, y, width: chipWidth, height: chipHeight, onScreen, directionDeg };
}

function setText(el, text) { if (el && el.textContent !== text) el.textContent = text; }
function setScaleX(el, value) {
  if (!el) return;
  const next = Math.round(clamp01(value) * 1000) / 1000;
  if (el._sfScaleX === next) return;
  el._sfScaleX = next;
  el.style.transform = `scaleX(${next})`;
}
// JS-side last-written cache — never read el.style/dataset (those can themselves dirty or miss).
function setStyle(el, prop, value) {
  if (!el) return;
  const cache = el._sfStyle || (el._sfStyle = Object.create(null));
  if (cache[prop] === value) return;
  cache[prop] = value;
  el.style[prop] = value;
}
function setCssVar(el, name, value) {
  if (!el) return;
  const cache = el._sfCssVar || (el._sfCssVar = Object.create(null));
  if (cache[name] === value) return;
  cache[name] = value;
  el.style.setProperty(name, value);
}
function setOpacity(el, value) {
  if (!el) return;
  const next = String(value);
  if (el._sfOpacity === next) return;
  el._sfOpacity = next;
  el.style.opacity = next;
}
function setAttr(el, name, value) {
  if (!el) return;
  const text = String(value);
  const cache = el._sfAttr || (el._sfAttr = Object.create(null));
  if (cache[name] === text) return;
  cache[name] = text;
  el.setAttribute(name, text);
}
function setDataEdge(el, edge) {
  if (!el) return;
  const next = edge == null ? '' : String(edge);
  if (el._sfDataEdge === next) return;
  el._sfDataEdge = next;
  if (next) el.setAttribute('data-edge', next);
  else el.removeAttribute('data-edge');
}
function setTitle(el, title) {
  if (!el) return;
  const next = title == null ? '' : String(title);
  if (el._sfTitle === next) return;
  el._sfTitle = next;
  el.title = next;
}
function setHidden(el, hidden) {
  if (!el) return;
  const next = !!hidden;
  if (el._sfHidden === next) return;
  el._sfHidden = next;
  el.hidden = next;
}
// Screen-space HUD overlays: position with translate3d only (never per-frame left/top layout).
function setHudScreenTransform(el, x, y, opts = null) {
  if (!el) return;
  const nx = Number(x);
  const ny = Number(y);
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
  const center = !opts || opts.center !== false;
  const rotate = opts && Number.isFinite(opts.rotate) ? ` rotate(${opts.rotate.toFixed(1)}deg)` : '';
  const offset = (opts && opts.offset) || (center ? 'translate(-50%,-50%)' : '');
  const next = `translate3d(${nx.toFixed(1)}px,${ny.toFixed(1)}px,0) ${offset}${rotate}`.trim();
  if (el._sfHudTransform === next) return;
  el._sfHudTransform = next;
  el.style.transform = next;
}
function setClass(el, cls, active) {
  if (el && el.classList.contains(cls) !== !!active) el.classList.toggle(cls, !!active);
}
function setDisplay(el, visible, mode = 'block') {
  if (!el) return;
  const next = visible ? mode : 'none';
  const cache = el._sfStyle || (el._sfStyle = Object.create(null));
  if (cache.display === next) return;
  cache.display = next;
  el.style.display = next;
}

function createHudClock(hz, startReady = true) {
  return { step: 1 / Math.max(1, hz || 1), elapsed: startReady ? Infinity : 0, lastDt: 1 / Math.max(1, hz || 1) };
}
function consumeHudClock(clock, dt) {
  clock.elapsed += dt;
  if (clock.elapsed < clock.step) return 0;
  const runDt = Number.isFinite(clock.elapsed) ? clock.elapsed : clock.step;
  clock.elapsed = 0;
  clock.lastDt = runDt;
  return runDt;
}
function forceHudClock(clock) {
  clock.elapsed = Infinity;
}

function injectDeathStyle() {
  if (document.getElementById('sf-death-style')) return;
  const s = document.createElement('style');
  s.id = 'sf-death-style';
  s.textContent = `
  .sf-death { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:8px; z-index:1500; pointer-events:none; opacity:0; }
  .sf-death[hidden] { display:none !important; }
  .sf-death.show { animation:sf-death-seq 2.4s ease forwards; }
  @keyframes sf-death-seq { 0%{opacity:0;} 8%{opacity:1;} 70%{opacity:1;} 100%{opacity:0;} }
  .sf-death__big { font-family:var(--mono,Consolas,monospace); font-size:46px; letter-spacing:.22em; color:#ff5470;
    text-shadow:0 0 30px rgba(255,84,112,.7), 0 2px 4px #000; }
  .sf-death__sub { font-family:var(--mono,Consolas,monospace); font-size:14px; letter-spacing:.3em; color:#ffd2da; text-transform:uppercase; }
  body.sf-deathflash::after { content:''; position:fixed; inset:0; z-index:1400; pointer-events:none;
    background:radial-gradient(circle at 50% 50%, rgba(255,40,70,0) 30%, rgba(255,30,60,.55) 100%); animation:sf-deathflash .7s ease forwards; }
  @keyframes sf-deathflash { 0%{opacity:0;} 15%{opacity:1;} 100%{opacity:0;} }
  `;
  document.head.appendChild(s);
}

// Travel Burn instrument styles (atlas D5 / W1-6 / W1-9). Lives here rather than in uiRoot.js's
// injectHudCss because hud.js already owns several self-injected stylesheets and this instrument is
// wholly hud-local.
//
// Colour is never the only carrier of state (WCAG 1.4.1 and this repo's non-colour-semantics rule):
// every drive state also prints its NAME, V-MAX is a labelled rule, the earned cap is a labelled
// caret, and BRAKE NOW pairs a ▲ glyph with the words. A forced-colors block restates every
// hairline in system colours so the instrument survives with author colours discarded.
function injectTravelTapeStyle() {
  if (document.getElementById('sf-vtape-style')) return;
  const s = document.createElement('style');
  s.id = 'sf-vtape-style';
  s.textContent = `
  .sf-vtape { --vt-brass:#c9a227; --vt-amber:#e8a33d; --vt-teal:#5fb6ac; --vt-ink:#0d0b09;
    position:relative; width:min(340px,46vw); margin:0 auto 6px; padding:5px 9px 4px;
    display:flex; flex-direction:column; gap:3px; pointer-events:none;
    background:linear-gradient(180deg, rgba(13,11,9,.82), rgba(13,11,9,.62));
    border:1px solid color-mix(in srgb, var(--vt-brass) 34%, transparent); border-radius:3px;
    box-shadow:0 2px 10px rgba(0,0,0,.45); opacity:0; visibility:hidden;
    transition:opacity .22s ease, visibility .22s; }
  .sf-vtape.sf-vtape--on { opacity:1; visibility:visible; }
  .sf-vtape__head { display:flex; align-items:baseline; justify-content:space-between; gap:8px;
    font-family:var(--mono,Consolas,monospace); font-size:9px; letter-spacing:.2em; text-transform:uppercase; }
  .sf-vtape__state { color:var(--vt-brass); }
  .sf-vtape[data-state="engaged"] .sf-vtape__state { color:var(--vt-amber); }
  .sf-vtape[data-state="cooldown"] .sf-vtape__state { color:#a08c6a; }
  .sf-vtape__spool { color:#8a7a5e; font-family:var(--mono,Consolas,monospace); font-size:9px; letter-spacing:.14em; }
  /* --- the tape itself: a linear 0..headroom scale --- */
  .sf-vtape__track { position:relative; height:11px; border-radius:2px; overflow:hidden;
    background:rgba(0,0,0,.55); border:1px solid color-mix(in srgb, var(--vt-brass) 22%, transparent); }
  /* Surveyor's graticule — the same grid identity the chart uses (D4), not decoration. */
  .sf-vtape__grat { position:absolute; inset:0;
    background-image:repeating-linear-gradient(90deg, color-mix(in srgb, var(--vt-brass) 26%, transparent) 0 1px, transparent 1px 10%); }
  .sf-vtape__fill { position:absolute; left:0; top:0; bottom:0; width:100%;
    transform:scaleX(0); transform-origin:left center;
    background:linear-gradient(90deg, color-mix(in srgb, var(--vt-teal) 42%, transparent), color-mix(in srgb, var(--vt-teal) 74%, transparent));
    transition:transform .1s linear; }
  .sf-vtape[data-state="engaged"] .sf-vtape__fill {
    background:linear-gradient(90deg, color-mix(in srgb, var(--vt-teal) 40%, transparent), color-mix(in srgb, var(--vt-amber) 78%, transparent)); }
  /* Earned-cap caret: how much of the ceiling the ramp has actually unlocked so far. */
  .sf-vtape__cap { position:absolute; top:0; bottom:0; width:2px; left:0; transform:translateX(-1px);
    background:color-mix(in srgb, var(--vt-amber) 85%, transparent); transition:left .1s linear; }
  .sf-vtape__caplabel { position:absolute; bottom:calc(100% + 1px); left:50%; transform:translateX(-50%);
    font-size:7px; letter-spacing:.14em; color:var(--vt-amber); opacity:.9; }
  /* V-MAX: the per-family ceiling from resolveTravelCeiling(). A LABELLED RULE, never a bare tint. */
  .sf-vtape__vmax { position:absolute; top:-2px; bottom:-2px; width:0; left:88%;
    border-left:1px dashed var(--vt-brass); }
  .sf-vtape__vmaxlabel { position:absolute; bottom:calc(100% + 1px); left:2px; white-space:nowrap;
    font-size:7px; letter-spacing:.14em; color:var(--vt-brass); }
  /* --- approach row: the stopping arc (W1-9) --- */
  .sf-vtape__approach { display:none; flex-direction:column; gap:2px; margin-top:2px; }
  .sf-vtape--approach .sf-vtape__approach { display:flex; }
  .sf-vtape__arc { position:relative; height:5px; border-radius:2px; background:rgba(0,0,0,.5);
    border:1px solid color-mix(in srgb, var(--vt-brass) 18%, transparent); }
  /* Span from the ship to where it would actually come to rest. */
  .sf-vtape__arcstop { position:absolute; left:0; top:0; bottom:0; width:0;
    background:color-mix(in srgb, var(--vt-teal) 60%, transparent); transition:width .1s linear; }
  /* The arrival ring. When the stop span runs past it, you are going to overshoot — and that is
     allowed to happen (D9.8): the instrument reports, it never brakes for you. */
  .sf-vtape__arcring { position:absolute; top:-2px; bottom:-2px; width:0; left:50%;
    border-left:1px solid var(--vt-amber); transition:left .1s linear; }
  .sf-vtape__arclabel { font-family:var(--mono,Consolas,monospace); font-size:8px; letter-spacing:.12em;
    color:#9a8a6c; text-transform:uppercase; }
  .sf-vtape--overshoot .sf-vtape__arcstop { background:color-mix(in srgb, #d4573f 70%, transparent); }
  .sf-vtape--overshoot .sf-vtape__arclabel { color:#e0876f; }
  /* --- BRAKE NOW --- */
  .sf-vtape__brake { display:none; align-items:center; justify-content:center; gap:5px; margin-top:2px;
    padding:2px 0; border-top:1px solid color-mix(in srgb, var(--vt-amber) 30%, transparent);
    font-family:var(--mono,Consolas,monospace); font-size:10px; letter-spacing:.24em; color:var(--vt-amber); }
  .sf-vtape--brake .sf-vtape__brake { display:flex; animation:sf-vtape-brake 1s steps(2,end) infinite; }
  .sf-vtape__brakeglyph { font-size:9px; }
  @keyframes sf-vtape-brake { 0%,50%{opacity:1;} 51%,100%{opacity:.42;} }
  /* Reduced motion: kill the pulse and the eases, KEEP the information. The cue still appears, it
     just stops blinking — suppressing the animation must never suppress the message. */
  @media (prefers-reduced-motion: reduce) {
    .sf-vtape, .sf-vtape__fill, .sf-vtape__cap, .sf-vtape__arcstop, .sf-vtape__arcring { transition:none; }
    .sf-vtape--brake .sf-vtape__brake { animation:none; opacity:1; }
  }
  /* The shared DRIVE gauge, while the burn is the consumer using it (W1-4 one-pool-one-gauge).
     The numeric readout also gains a ⟫ marker, so this is never colour-only. */
  .sf-bar--burn .sf-bar__fill { background:linear-gradient(90deg,
    color-mix(in srgb, #5fb6ac 50%, transparent), color-mix(in srgb, #e8a33d 85%, transparent)); }
  /* Forced colors: author colours are discarded, so restate every hairline structurally. */
  @media (forced-colors: active) {
    .sf-vtape { border:1px solid CanvasText; background:Canvas; forced-color-adjust:none;
      color:CanvasText; }
    .sf-vtape__track, .sf-vtape__arc { border:1px solid CanvasText; background:Canvas; }
    .sf-vtape__fill, .sf-vtape__arcstop { background:Highlight; }
    .sf-vtape__cap, .sf-vtape__vmax, .sf-vtape__arcring { border-color:CanvasText; background:CanvasText; }
    .sf-vtape__vmax { border-left:1px dashed CanvasText; background:none; }
    .sf-vtape__state, .sf-vtape__caplabel, .sf-vtape__vmaxlabel, .sf-vtape__arclabel, .sf-vtape__brake { color:CanvasText; }
  }
  `;
  document.head.appendChild(s);
}

export function createHud(ctx, alerts) {
  const { state, helpers } = ctx;
  const root = document.getElementById('hud');
  root.innerHTML = '';
  root.dataset.objectiveHierarchy = 'one-objective-one-action-one-threat';
  injectTravelTapeStyle();

  // Plan 54 docking approach hint. One compact projected vector appears only while the real
  // dockingCorridor owner says the ship is inside its authored corridor/capture volume. It is a
  // HUD readout, not a second navigator and never changes the bounded sim-side capture assist.
  const dockAssistHint = document.createElement('div');
  dockAssistHint.className = 'sf-dockassist';
  dockAssistHint.hidden = true;
  dockAssistHint.setAttribute('role', 'img');
  dockAssistHint.setAttribute('aria-label', 'Docking approach vector');
  dockAssistHint.innerHTML =
    '<i class="sf-dockassist__line"></i>' +
    '<i class="sf-dockassist__berth"></i>' +
    '<span class="sf-dockassist__label mono"></span>';
  root.appendChild(dockAssistHint);
  const dockAssistLine = dockAssistHint.querySelector('.sf-dockassist__line');
  const dockAssistBerth = dockAssistHint.querySelector('.sf-dockassist__berth');
  const dockAssistLabel = dockAssistHint.querySelector('.sf-dockassist__label');
  const dockAssistModel = {};
  const dockAssistPlayerWorld = { x: 0, y: 0, z: 0 };
  const dockAssistBerthWorld = { x: 0, y: 0, z: 0 };
  const dockAssistPlayerScreen = { x: 0, y: 0, onScreen: false };
  const dockAssistBerthScreen = { x: 0, y: 0, onScreen: false };
  const dockAssistGeometry = {};

  // ---- bottom-left: ship schematic (hull + shield) + thin micro-bars (energy/heat/boost) ----
  // Bottom-left anchor (SPEC3-36 three-anchor law, design/revamp/HUD_THREE_ANCHOR.md): one flex
  // column — a CONTEXTUAL sub-column (mission tracker + objectives + nav readout, all relocated here
  // from the old top-left/top-right/top-center straggler positions) sitting ABOVE the schematic +
  // vitals. leftContext collapses to nothing when its children are all hidden (:empty).
  const leftStack = document.createElement('div');
  leftStack.className = 'sf-leftstack';
  const leftContext = document.createElement('div');
  leftContext.className = 'sf-leftcontext';
  leftStack.appendChild(leftContext);

  // Ship condition is built around a production raster silhouette, not a hand-drawn glyph. The
  // shield remains a live vector ring because it carries state; the authored ship cutout carries
  // shape, material, and visual identity at the small size this instrument actually occupies.
  const bars = document.createElement('div');
  bars.className = 'sf-bars';

  const conditionHead = document.createElement('div');
  conditionHead.className = 'sf-condition-head';
  conditionHead.innerHTML =
    '<div class="sf-condition-metrics mono">' +
      '<span class="sf-cond-stat" data-vital="hull" hidden>HULL <strong class="sf-cond-hull-val">0</strong></span>' +
      '<span class="sf-cond-stat" data-vital="shield" hidden>SHD <strong class="sf-cond-shd-val">0</strong></span>' +
    '</div>';
  bars.appendChild(conditionHead);

  const schematic = document.createElement('div');
  schematic.className = 'sf-schematic';
  schematic.innerHTML =
    '<svg class="sf-sch-ring" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<circle class="sf-sch-track" cx="50" cy="50" r="46"/>' +
      '<circle class="sf-sch-shield" cx="50" cy="50" r="46" transform="rotate(-90 50 50)"/>' +
    '</svg>' +
    '<div class="sf-sch-ship-wrap">' +
      '<img class="sf-sch-ship sf-sch-ship--empty" src="./assets/ui/hud/ship-condition-scout.png" alt="" draggable="false">' +
      '<div class="sf-sch-ship-fill-crop">' +
        '<img class="sf-sch-ship sf-sch-ship--fill" src="./assets/ui/hud/ship-condition-scout.png" alt="" draggable="false">' +
      '</div>' +
      '<div class="sf-sch-fill-line"></div>' +
    '</div>';
  bars.appendChild(schematic);
  const schShield = schematic.querySelector('.sf-sch-shield');
  const schHullVal = conditionHead.querySelector('.sf-cond-hull-val');
  const schShdVal = conditionHead.querySelector('.sf-cond-shd-val');
  const schHullStat = conditionHead.querySelector('[data-vital="hull"]');
  const schShdStat = conditionHead.querySelector('[data-vital="shield"]');

  // Thin micro-bars. Hull + shield are on the schematic; energy/boost/weapon-heat/fuel live here.
  const barDefs = [
    ['energy', 'ENGY', 'energy'],
    // W1-4 "one energy pool, one gauge" (D5: "All three draw one energy pool; one gauge").
    // Dash and boost ALREADY share `p.boost` — there was never a second pool to merge, only a
    // label that named one of its three consumers. Renamed at the READ SITE (the packet's explicit
    // instruction, and gameState.js is quarantined) so the gauge is identified by the resource it
    // measures rather than by whichever verb spends it. Travel burn is the third consumer and is
    // shown on this same gauge; see the honest caveat where it is updated below.
    ['boost', 'DRIVE', 'boost'],   // shared drive-energy pool: dash + boost + burn (hidden if the ship can't boost)
    ['heat', 'HEAT', 'heat'],      // weapon-instance heat (max across p.data.weapons), not WANTED heat
    ['fuel', 'FUEL', 'fuel'],
  ];
  const fillEls = {}, numEls = {}, rowEls = {};
  for (const [key, label, mod] of barDefs) {
    const row = document.createElement('div');
    row.className = 'sf-barrow';
    row.innerHTML = `
      <span class="sf-barrow__label">${label}</span>
      <div class="sf-bar sf-bar--${mod}"><div class="sf-bar__fill"></div></div>
      <span class="sf-barrow__num mono">0</span>`;
    bars.appendChild(row);
    fillEls[key] = row.querySelector('.sf-bar__fill');
    numEls[key] = row.querySelector('.sf-barrow__num');
    rowEls[key] = row;
  }
  leftStack.appendChild(bars);   // bars below the contextual column
  root.appendChild(leftStack);
  // Comms is initialized a few lines before createHud() by uiRoot. Adopt the existing feed into the
  // context rail now that its stable home exists; the module keeps an absolute fallback for boot.
  const existingComms = document.getElementById('sf-comms');
  if (existingComms) leftContext.prepend(existingComms);
  // Shield ring: dasharray = full circumference, dashoffset grows as shields drop (erasing the ring).
  // Measured after mount so getTotalLength() reads the live geometry (the fallback equals 2πr anyway).
  const SHIELD_RING_LEN = (() => { try { return schShield.getTotalLength() || 2 * Math.PI * 46; } catch (e) { return 2 * Math.PI * 46; } })();
  schShield.style.strokeDasharray = String(SHIELD_RING_LEN);
  schShield.style.strokeDashoffset = '0';

  // (The center framing arcs were removed — a wide "visor projection" around the crosshair reads as a
  //  first-person cockpit/windshield motif, which is wrong for this third-person chase-cam game.
  //  Shield now lives on the schematic ring; energy on the ENGY micro-bar.)

  // ---- bottom-center: flight instrument deck (SPD / WPN / contextual chips) ----
  // Permanent binding→action keycaps (FIRE / SAMPLE / BOOST / …) were retired: those are general
  // flight keys learned from Settings → Controls / Help / onboarding, not a always-on hotbar.
  // Contextual mode prompts (Massline while latched) still surface below the instrument row.
  const commandDeck = document.createElement('div');
  commandDeck.className = 'sf-command-deck';
  root.appendChild(commandDeck);

  // Weak-point reveals (BP-02): a scan pulse exposes a large hostile's soft spot. We keep this UI-side
  // (keyed by entity id, expiring) rather than on the sim entity — the target panel reads it to show
  // "where to hit" for the selected target. Populated by the scanner's flag-gated scan:weakPoint cue.
  const revealedWeakPoints = new Map();
  ctx.bus.on('scan:weakPoint', (p) => {
    if (!p || p.entityId == null) return;
    revealedWeakPoints.set(p.entityId, { label: p.label, hint: p.hint, until: p.until || 0 });
  });

  // Hit-flash helper: briefly pulse the ship schematic when the player takes damage.
  // Re-triggering a CSS animation needs remove + reflow + re-add; we do it once per damage event.
  let _schFlashTimer = 0;
  function flashSchematic() {
    schematic.classList.remove('sf-sch-hit');
    void schematic.offsetWidth;   // force reflow so the animation restarts
    schematic.classList.add('sf-sch-hit');
    clearTimeout(_schFlashTimer);
    _schFlashTimer = setTimeout(() => schematic.classList.remove('sf-sch-hit'), 340);
  }
  // Seconds since anything last damaged the player. The critical-hull treatment below is armed on
  // this rather than on hull alone, so limping home at 12% hull is not a permanent screen alarm.
  let _sinceHullDamage = Infinity;
  ctx.bus.on('combat:damage', (p) => {
    if (!p || p.targetId !== state.playerId) return;
    _sinceHullDamage = 0;
    flashSchematic();
  });

  // Critical-hull treatment (PR95 quiet HUD): four brackets that close on the ship-condition
  // instrument — the 96px schematic in the bottom-left anchor that already owns hull. Explicitly
  // NOT a visor/cockpit frame, a screen-edge arc, a full-screen wash, or an FOV move: it marks the
  // gauge, it does not dress the windshield. Reduced motion (no bracket travel) and reduced flash
  // (no breathing opacity) are honored SEPARATELY in styles/ui.css — the static bracketed state is
  // the base treatment and reads on its own with both reductions on.
  const hullCritFrame = document.createElement('div');
  hullCritFrame.className = 'sf-hullcrit';
  hullCritFrame.setAttribute('aria-hidden', 'true');
  hullCritFrame.innerHTML = '<i></i><i></i><i></i><i></i>';
  schematic.appendChild(hullCritFrame);

  // ---- top-left: mission tracker (shows the tracked mission objective + timer) ----
  const missionTracker = document.createElement('div');
  missionTracker.className = 'sf-mission-tracker';
  missionTracker.style.display = 'none';
  // Distance changes continuously; this is a labelled region, not a live region, so assistive
  // technology does not announce the objective again on every HUD refresh.
  missionTracker.setAttribute('role', 'region');
  missionTracker.setAttribute('aria-label', 'Active objective');
  missionTracker.innerHTML =
    '<div class="sf-mt-title mono"></div>' +
    '<div class="sf-mt-obj mono"></div>' +
    '<div class="sf-mt-time mono"></div>';
  leftContext.appendChild(missionTracker);   // relocated into the bottom-left contextual column
  missionTracker.style.pointerEvents = 'auto';
  const objectiveHudDrag = createHudDragController({
    state, bus: ctx.bus, element: missionTracker, key: 'objective', documentRef: document,
  });
  const mtTitle = missionTracker.querySelector('.sf-mt-title');
  const mtObj = missionTracker.querySelector('.sf-mt-obj');
  const mtTime = missionTracker.querySelector('.sf-mt-time');

  // ---- bottom-center (HUD 2.0, GDD §9.4): only SPD + WPN live here permanently. Cargo, credits,
  // and ship class are CONTEXTUAL CHIPS — they appear when their value changes, then fade. The old
  // seven-stat text strip whispered everything at once; now the HUD only speaks when something
  // changed. THR/STOP retired to the SPD hover tip (already carries the braking solution).
  const center = document.createElement('div');
  center.className = 'sf-cluster';
  center.innerHTML = `
    <div class="sf-stat sf-stat--info sf-stat--speed"><span class="sf-stat__k">SPD</span><span class="sf-stat__v mono" data-k="speed">0</span><div class="sf-tip" data-tip="speed"></div></div>
    <div class="sf-stat sf-stat--info" id="sf-wpnstat"><span class="sf-stat__k">WPN</span><span class="sf-stat__v mono" data-k="weapons">—</span><div class="sf-tip" data-tip="weapons"></div></div>
    <div class="sf-stat sf-stat--wide" id="sf-tetherstat" style="display:none"><span class="sf-stat__k">TETHER</span><span class="sf-stat__v mono" data-k="tether">LOCKED</span></div>
    <div class="sf-stat sf-stat--wide sf-stat--chip" data-chip="cargo"><span class="sf-stat__k">CARGO</span><span class="sf-stat__v mono" data-k="cargo">0 / 40 u</span></div>
    <div class="sf-stat sf-stat--wide sf-stat--chip" data-chip="credits"><span class="sf-stat__k">CR</span><span class="sf-stat__v mono sf-credits" data-k="credits">0</span></div>
    <div class="sf-stat sf-stat--wide sf-stat--chip" id="sf-rolestat" data-chip="role"><span class="sf-stat__k">CLASS</span><span class="sf-stat__v mono" data-k="role">—</span></div>`;
  // Massline line-control chips — only while latched. Separate from the status value so the
  // instrument row never overflows with a tutorial paragraph of binds.
  const masslineInstrument = document.createElement('div');
  masslineInstrument.className = 'sf-ml-instrument';
  masslineInstrument.hidden = true;
  masslineInstrument.setAttribute('aria-label', 'Massline');
  masslineInstrument.innerHTML =
    '<div class="sf-ml-instrument__row">' +
      '<span class="sf-ml-instrument__k">LINE</span>' +
      '<span class="sf-ml-instrument__track"><span class="sf-ml-instrument__fill" data-k="mlfill"></span></span>' +
      '<span class="sf-ml-instrument__v mono" data-k="mllen">—</span>' +
    '</div>' +
    '<div class="sf-ml-instrument__release mono" data-k="mlrel" hidden>RELEASE</div>';
  commandDeck.prepend(center);
  commandDeck.appendChild(masslineInstrument);
  const mlFill = masslineInstrument.querySelector('[data-k=mlfill]');
  const mlLen = masslineInstrument.querySelector('[data-k=mllen]');
  const mlRel = masslineInstrument.querySelector('[data-k=mlrel]');

  // ---- Travel Burn instrument (atlas D5 / W1-6 / W1-9) -----------------------------------------
  // A CONTEXTUAL instrument, not a new permanent panel. D9.9 forbids permanent panels because the
  // reported density paradox ("too little useful information, yet crowded") is a progressive-
  // disclosure failure; an instrument that is entirely absent during ordinary flight and reveals
  // only while the travel drive is spooling/engaged/cooling — or while the ship is closing on its
  // own ceiling — serves that reasoning rather than skirting it. It reuses the appear-then-fade
  // idiom the contextual stat chips above already established, so it inherits an existing visual
  // vocabulary instead of introducing a competing one, and it fades out COMPLETELY (an instrument
  // that reveals and then stays is a permanent panel with extra steps).
  //
  // NOTE FOR THE RECORD: D5 says to draw V-MAX "on the velocity tape" as though that instrument
  // already shipped. It does not exist — speed was a bare numeric chip with a hover tip, and the
  // "prograde tick" is a world-projected vector marker, not a linear scale. The tape is built here.
  //
  // Aesthetics are bound by the Surveyor's Table identity: warm black, brass, amber, restrained
  // teal, technical type. Deliberately NOT built: any screen-edge arc, peripheral vignette or
  // cockpit framing (rejected first-person motifs — this is a third-person game).
  const vtape = document.createElement('div');
  vtape.className = 'sf-vtape';
  vtape.dataset.state = 'off';
  // Not a live region: speed changes continuously and would flood a screen reader. The BRAKE NOW
  // cue below carries its own assertive live region, because that one IS an event worth announcing.
  vtape.setAttribute('role', 'group');
  vtape.setAttribute('aria-label', 'Travel drive');
  vtape.innerHTML =
    '<div class="sf-vtape__head">' +
      '<span class="sf-vtape__state mono" data-k="tstate">OFF</span>' +
      '<span class="sf-vtape__spool" data-k="tspool"></span>' +
    '</div>' +
    '<div class="sf-vtape__track">' +
      '<div class="sf-vtape__grat"></div>' +
      '<div class="sf-vtape__fill" data-k="tfill"></div>' +
      '<div class="sf-vtape__cap" data-k="tcap"><span class="sf-vtape__caplabel mono">CAP</span></div>' +
      '<div class="sf-vtape__vmax" data-k="tvmax"><span class="sf-vtape__vmaxlabel mono" data-k="tvmaxtext">V-MAX</span></div>' +
    '</div>' +
    '<div class="sf-vtape__approach" data-k="tapproach">' +
      '<div class="sf-vtape__arc"><div class="sf-vtape__arcstop" data-k="tarcstop"></div>' +
      '<div class="sf-vtape__arcring" data-k="tarcring"></div></div>' +
      '<div class="sf-vtape__arclabel mono" data-k="tarclabel"></div>' +
    '</div>' +
    '<div class="sf-vtape__brake" data-k="tbrake" role="alert" aria-live="assertive">' +
      '<span class="sf-vtape__brakeglyph" aria-hidden="true">▲</span>' +
      '<span class="mono">BRAKE NOW</span></div>';
  commandDeck.prepend(vtape);
  const vt = {
    root: vtape,
    state: vtape.querySelector('[data-k=tstate]'),
    spool: vtape.querySelector('[data-k=tspool]'),
    fill: vtape.querySelector('[data-k=tfill]'),
    cap: vtape.querySelector('[data-k=tcap]'),
    vmax: vtape.querySelector('[data-k=tvmax]'),
    vmaxText: vtape.querySelector('[data-k=tvmaxtext]'),
    approach: vtape.querySelector('[data-k=tapproach]'),
    arcStop: vtape.querySelector('[data-k=tarcstop]'),
    arcRing: vtape.querySelector('[data-k=tarcring]'),
    arcLabel: vtape.querySelector('[data-k=tarclabel]'),
    brake: vtape.querySelector('[data-k=tbrake]'),
  };
  let _vtapeAlpha = 0;      // smooth-damped reveal so it eases in rather than popping
  let _vtapeBrakeOn = false;

  const elSpeed = center.querySelector('[data-k=speed]');
  const elCargo = center.querySelector('[data-k=cargo]');
  const elCredits = center.querySelector('[data-k=credits]');
  const elWeapons = center.querySelector('[data-k=weapons]');
  const elRole = center.querySelector('[data-k=role]');
  const elTetherStat = center.querySelector('#sf-tetherstat');
  const elTether = center.querySelector('[data-k=tether]');
  const chipEls = {
    cargo: center.querySelector('[data-chip=cargo]'),
    credits: center.querySelector('[data-chip=credits]'),
    role: center.querySelector('[data-chip=role]'),
  };
  const _chipTimers = new Map();
  // Show a chip for a beat, then let it fade. Repeat calls refresh the timer (a count-up animation
  // keeps its chip alive until the number settles).
  function chipShow(key, ms = 4000) {
    const el = chipEls[key];
    if (!el) return;
    el.classList.add('sf-chip-show');
    clearTimeout(_chipTimers.get(el));
    _chipTimers.set(el, setTimeout(() => el.classList.remove('sf-chip-show'), ms));
  }

  // ---- HUD stat tooltips: populate on hover to show detailed info ----
  const tipEls = {};
  for (const tip of center.querySelectorAll('.sf-tip')) tipEls[tip.dataset.tip] = tip;

  function buildSpeedTip(p) {
    if (!p) return 'No ship data';
    const sp = Math.hypot(p.vel.x, p.vel.z);
    const maxSp = p.maxSpeed || 1;
    const pct = Math.round(clamp01(sp / maxSp) * 100);
    const drive = driveFamilyFor(SHIP_BY_ID.get(p.data && p.data.defId)) || 'Reaction';
    let lines = [
      `Speed: ${Math.round(sp)} / ${Math.round(maxSp)} wu/s (${pct}%)`,
      `Velocity X: ${p.vel.x.toFixed(1)}, Z: ${p.vel.z.toFixed(1)}`,
      `Drive: ${drive}`,
    ];
    // Braking solution (spec §15.3): turn physics from confusion into skill by showing the
    // projected stop point, fastest stop mode, and stop time/distance.
    if (sp > 0.5) {
      const brake = estimateBrakingSolution(p, resolvePropulsionProfile(p, state));
      lines.push(`Best stop: ${brake.bestMode.replace('-', ' ')}`);
      lines.push(`Direct: ${brake.directDistance.toFixed(0)} wu / ${brake.directTimeS.toFixed(1)} s`);
      lines.push(`Flip-and-burn: ${brake.flipBurnDistance.toFixed(0)} wu / ${brake.flipBurnTimeS.toFixed(1)} s`);
    }
    return lines.join('\n');
  }
  function buildThrottleTip(p) {
    if (!p) return 'No ship data';
    const sp = Math.hypot(p.vel.x, p.vel.z);
    const maxSp = p.maxSpeed || 1;
    const pct = Math.round(clamp01(sp / maxSp) * 100);
    const mass = p.mass || 0;
    const handling = p.handling != null ? p.handling.toFixed(2) : '—';
    return `Throttle: ${pct}%\nMax speed: ${Math.round(maxSp)} wu/s\nMass: ${Math.round(mass)}\nHandling: ${handling}`;
  }
  function buildCargoTip() {
    const c = (state.player || {}).cargo || {};
    const items = c.items || {};
    const used = Math.round(c.usedVolume || 0);
    const cap = Math.round(c.capVolume || 40);
    const keys = Object.keys(items);
    if (!keys.length) return `Cargo: ${used} / ${cap} u\nHold is empty`;
    const lines = [`Cargo: ${used} / ${cap} u`];
    for (const id of keys.slice(0, 8)) {
      const qty = items[id];
      const name = cargoDisplayName(id);
      if (qty > 0) lines.push(`  ${name}: ${qty}`);
    }
    if (keys.length > 8) lines.push(`  ... +${keys.length - 8} more`);
    return lines.join('\n');
  }
  function buildCreditsTip() {
    const player = state.player || {};
    const cr = Math.round(player.credits || 0);
    const st = player.stats || {};
    return `Credits: ${cr.toLocaleString()} CR\nLifetime profit: ${Math.round(st.lifetimeProfit || 0).toLocaleString()}\nTrades: ${st.tradesCount || 0}\nBest single trade: ${Math.round(st.biggestSingleProfit || 0).toLocaleString()}`;
  }
  function buildWeaponsTip(p) {
    if (!p || !p.data || !p.data.weapons || !p.data.weapons.length) return 'No weapons fitted';
    const ws = p.data.weapons;
    const lines = [`Weapons: ${ws.length} fitted`];
    for (const w of ws) {
      const name = w.name || w.id || 'Unknown';
      const dps = w.dps != null ? ` ${w.dps} dps` : '';
      const rng = w.range ? ` ${w.range}m` : '';
      lines.push(`  ${name}${dps}${rng}`);
    }
    return lines.join('\n');
  }
  function buildClassTip(p) {
    if (!p || !p.data) return 'No ship data';
    const defId = p.data.defId;
    const def = SHIP_BY_ID.get(defId);
    if (!def) return 'Unknown hull';
    const role = ROLE_LABEL[def.role] || def.role || '—';
    return `${def.name} — ${role}\nTier: ${def.tier}  Hull: ${def.hull}  Shield: ${def.shield}\nCargo cap: ${def.cargo} u  Mass: ${def.mass}\nSlots: ${Object.entries(def.slots || {}).map(([k, v]) => k[0].toUpperCase() + ':' + v.length).join(' ')}`;
  }

  // Update tooltip content on mouseenter; the CSS handles show/hide.
  for (const stat of center.querySelectorAll('.sf-stat--info')) {
    stat.addEventListener('mouseenter', () => {
      const tip = stat.querySelector('.sf-tip');
      if (!tip) return;
      const k = tip.dataset.tip;
      const p = state.entities.get(state.playerId);
      let text = '';
      if (k === 'speed') text = buildSpeedTip(p);
      else if (k === 'throttle') text = buildThrottleTip(p);
      else if (k === 'cargo') text = buildCargoTip();
      else if (k === 'credits') text = buildCreditsTip();
      else if (k === 'weapons') text = buildWeaponsTip(p);
      else if (k === 'class') text = buildClassTip(p);
      tip.textContent = text;
    });
  }

  // ---- bottom-right: target panel + radar ----
  const rightDock = document.createElement('div');
  rightDock.className = 'sf-rightdock';
  const targetPanel = createTargetPanel(ctx);
  
  // Overview Strip (§2)
  const elOverview = document.createElement('div');
  elOverview.className = 'sf-overview';
  
  const radar = createRadar(ctx);
  rightDock.append(targetPanel.el, elOverview, radar.el);
  root.appendChild(rightDock);
  // Sector law is created with comms before the HUD. Moving the same live node avoids a second card
  // competing with toasts in the upper-right corner while preserving all presenter state/listeners.
  const existingSectorLaw = document.getElementById('sf-sector-law');
  if (existingSectorLaw) rightDock.prepend(existingSectorLaw);

  // Target Arcs Overlay (§3)
  const targetArcs = document.createElement('div');
  targetArcs.id = 'sf-target-arcs';
  targetArcs.className = 'sf-target-arcs';
  targetArcs.style.display = 'none';
  targetArcs.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" style="display:block; overflow:visible;">
      <circle class="sf-arc-shield" />
      <circle class="sf-arc-armor" />
      <circle class="sf-arc-hull" />
    </svg>
  `;
  root.appendChild(targetArcs);
  const targetArcsSvg = targetArcs.querySelector('svg');
  const targetArcShield = targetArcs.querySelector('.sf-arc-shield');
  const targetArcArmor = targetArcs.querySelector('.sf-arc-armor');
  const targetArcHull = targetArcs.querySelector('.sf-arc-hull');

  // floating combat text (damage numbers, ore yield, credits, kills)
  const floatingText = createFloatingText(ctx);

  // directional damage indicators (red arcs at screen edge showing where hits came from)
  const dmgInd = createDamageIndicators().bind(
    () => state.entities.get(state.playerId),
    state.playerId,
  );
  root.appendChild(dmgInd.el);
  ctx.bus.on('combat:damage', (p) => dmgInd.onDamage(p));

  // ---- objective tracker (relocated to the bottom-left contextual column) + off-screen arrow.
  // The arrow (below) stays a root-level, world-following overlay; only the objective LIST moves. ----
  const objWrap = document.createElement('div');
  objWrap.className = 'sf-objectives';
  objWrap.style.display = 'none';
  leftContext.appendChild(objWrap);

  // ---- Phase 4: nav readout (destination / distance / ETA) — relocated from top-center into the
  // bottom-left contextual column (persistent "where I'm going" state belongs in the left anchor). ----
  const elNavReadout = document.createElement('div');
  elNavReadout.className = 'sf-nav-readout';
  elNavReadout.style.display = 'none';
  elNavReadout.innerHTML =
    '<div class="sf-nav-label mono">—</div>' +
    '<div class="sf-nav-meta"><span class="sf-nav-dist">0 u</span> · ETA <span class="sf-nav-eta">—</span></div>';
  leftContext.appendChild(elNavReadout);
  const elNavLabel = elNavReadout.querySelector('.sf-nav-label');
  const elNavDist = elNavReadout.querySelector('.sf-nav-dist');
  const elNavEta = elNavReadout.querySelector('.sf-nav-eta');


  const arrow = document.createElement('div');
  arrow.className = 'sf-objarrow';
  arrow.style.display = 'none';
  arrow.setAttribute('role', 'img');
  arrow.setAttribute('aria-label', 'Current objective marker');
  arrow.innerHTML = '<span class="sf-objarrow__glyph" aria-hidden="true"></span><span class="sf-objarrow__label mono"></span>';
  root.appendChild(arrow);
  const arrowLabel = arrow.querySelector('.sf-objarrow__label');
  const firstUse = document.createElement('div');
  firstUse.className = 'sf-firstuse';
  firstUse.hidden = true;
  firstUse.setAttribute('role', 'status');
  root.appendChild(firstUse);
  let firstUseHint = null;
  ctx.bus.on('hud:firstUse', (payload) => {
    if (!payload || !payload.text) return;
    firstUseHint = {
      verbId: payload.verbId,
      text: payload.text,
      kind: firstUseAttachKind(payload.verbId),
      entityId: payload.entityId,
      until: (state.simTime || 0) + 7,
    };
    firstUse.textContent = payload.text;
    firstUse.hidden = false;
  });
  // The ordinary navigation marker paints at the retained overlay cadence for as long as a live
  // waypoint exists. Keep its projection and presenter records with this HUD instance so the hot
  // path rewrites scalar fields rather than constructing four (on-screen) or five (edge) records.
  const objectiveProjectionWorld = { x: 0, y: 0, z: 0 };
  const objectiveProjectionScreen = { x: 0, y: 0, onScreen: false };
  const objectiveWaypointRecord = { pos: null };
  const objectiveTravelRecord = {
    distanceWu: null,
    closingSpeed: 0,
    etaS: null,
    distanceText: 'ROUTE PENDING',
    etaText: 'ETA —',
  };
  const objectiveEdgeRecord = { x: 0, y: 0, edge: 'top', angleRad: 0 };

  // ---- combat HUD: lock-on ring, weapon heat bars, target lock diamond ----

  // Lock-on progress ring (SVG arc near reticle). Shows when a homing weapon is acquiring a lock.
  const lockRing = document.createElement('div');
  lockRing.className = 'sf-lockring';
  const LOCK_R = 30, LOCK_C = Math.PI * 2 * LOCK_R;
  lockRing.innerHTML =
    `<svg viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="36" cy="36" r="${LOCK_R}" class="sf-lockring__track"/>` +
    `<circle cx="36" cy="36" r="${LOCK_R}" class="sf-lockring__fill" ` +
    `stroke-dasharray="${LOCK_C}" stroke-dashoffset="${LOCK_C}" ` +
    `transform="rotate(-90 36 36)"/>` +
    `</svg><div class="sf-lockring__label"></div>`;
  root.appendChild(lockRing);
  const lockFill = lockRing.querySelector('.sf-lockring__fill');
  const lockLabel = lockRing.querySelector('.sf-lockring__label');
  let _wasLocked = false;   // rising-edge tracker for the lock-acquired audio cue

  // FR-1: prograde (velocity-vector) tick. An always-on, unlabeled read of where inertia carries
  // the ship if thrust cuts now — projected through the authoritative worldToScreen, never a magic
  // screen anchor. It is a gauge (constant size, never animates) that fades out near rest. When it
  // and the centered aim reticle diverge, you can read "facing vs travel" without instruments.
  const proTick = document.createElement('div');
  proTick.className = 'sf-protick';
  proTick.style.cssText =
    'position:absolute;left:0;top:0;width:8px;height:2px;margin-left:-4px;margin-top:-1px;' +
    'background:#d7e6ff;border-radius:1px;opacity:0;pointer-events:none;will-change:transform,opacity;transform-origin:center;';
  root.appendChild(proTick);
  let _proAlpha = 0;   // smooth-damped opacity so it eases in/out, never pops
  // The moving-flight path projects two points every visible frame. Keep both input and output
  // records per HUD instance so high-refresh play does not manufacture four short-lived objects
  // per frame; A and B must remain distinct until their screen-space delta is consumed.
  const progradeWorldA = { x: 0, y: 0, z: 0 };
  const progradeWorldB = { x: 0, y: 0, z: 0 };
  const progradeScreenA = { x: 0, y: 0, onScreen: false };
  const progradeScreenB = { x: 0, y: 0, onScreen: false };
  const progradeTransformOptions = { offset: 'translate(-4px,-1px)', rotate: 0 };
  const weaponHeatScratch = { frac: 0, pct: 0, overheated: false, armed: false };
  const targetPanelUpdateOptions = { slow: false, weakPoint: null };

  // Per-weapon heat bars. Built once per ship load, updated per frame.
  const wpnHeatsWrap = document.createElement('div');
  wpnHeatsWrap.className = 'sf-wpn-heats';
  wpnHeatsWrap.style.display = 'none';
  bars.appendChild(wpnHeatsWrap);
  let wpnHeatEls = []; // [{fill, row, lastHeat}]
  let wpnHeatShipId = null;

  function rebuildWeaponHeatBars(weapons) {
    wpnHeatsWrap.innerHTML = '';
    wpnHeatEls = [];
    if (!weapons || !weapons.length) { setStyle(wpnHeatsWrap, 'display', 'none'); return; }
    for (const w of weapons) {
      const name = (w.name || w.defId || '').replace(/^wpn_/, '').replace(/_/g, ' ').slice(0, 8);
      const row = document.createElement('div');
      row.className = 'sf-wpn-heat';
      const labelSpan = document.createElement('span');
      labelSpan.className = 'sf-wpn-heat__label';
      labelSpan.textContent = name;
      const bar = document.createElement('div');
      bar.className = 'sf-wpn-heat__bar';
      const fill = document.createElement('div');
      fill.className = 'sf-wpn-heat__fill';
      bar.appendChild(fill);
      row.appendChild(labelSpan);
      row.appendChild(bar);
      wpnHeatsWrap.appendChild(row);
      wpnHeatEls.push({ fill, row, lastHeat: -1 });
    }
    setStyle(wpnHeatsWrap, 'display', 'flex');
  }

  // Target lock diamond — follows the locked target's screen position.
  const lockDiamond = document.createElement('div');
  lockDiamond.className = 'sf-lockdiamond';
  lockDiamond.innerHTML = '<div class="sf-lockdiamond__inner"></div>';
  root.appendChild(lockDiamond);
  // A selected target is projected five times per visible frame: once for the lock diamond, once
  // for the arc center, and once for each of the three arc radii. Keep one center pair and one edge
  // pair per mounted HUD so the renderer can fill them in place without changing call order or
  // aliasing the center result while the edge projections are sampled.
  const targetProjectionWorld = { x: 0, y: 0, z: 0 };
  const targetProjectionScreen = { x: 0, y: 0, onScreen: false };
  const targetRadiusWorld = { x: 0, y: 0, z: 0 };
  const targetRadiusScreen = { x: 0, y: 0, onScreen: false };

  function projectTargetCenter(pos) {
    targetProjectionWorld.x = pos.x;
    targetProjectionWorld.y = 0;
    targetProjectionWorld.z = pos.z;
    return helpers.worldToScreen(targetProjectionWorld, targetProjectionScreen);
  }

  function targetPixelRadius(pos, worldRadius, center) {
    targetRadiusWorld.x = pos.x + worldRadius;
    targetRadiusWorld.y = 0;
    targetRadiusWorld.z = pos.z;
    const edge = helpers.worldToScreen(targetRadiusWorld, targetRadiusScreen);
    if (!edge.onScreen) return worldRadius * 3;
    return Math.max(1, Math.abs(edge.x - center.x));
  }

  // Gravity Mark is a simulation state, not target selection. A fixed DOM pool follows every live
  // player-authored mark (bounded to six) so retargeting cannot make the state disappear or jump.
  const gravityMarkOverlays = [];
  for (let i = 0; i < MAX_GRAVITY_MARK_OVERLAYS; i++) {
    const marker = document.createElement('div');
    marker.className = 'sf-gravity-mark';
    marker.setAttribute('role', 'img');
    marker.setAttribute('aria-label', 'Gravity-marked target');
    marker.innerHTML = '<div class="sf-gravity-mark__ring" aria-hidden="true"></div>'
      + '<div class="sf-gravity-mark__core" aria-hidden="true"></div>'
      + '<div class="sf-gravity-mark__label mono">GRAVITY MARK</div>';
    root.appendChild(marker);
    gravityMarkOverlays.push(marker);
  }
  const gravityMarkTargets = [];
  const momentumSinkTargets = [];
  let massCouplingScanTick = -Infinity;

  function scanMassCouplingOverlays(player) {
    const tick = Number.isInteger(state.tick) ? state.tick : 0;
    if (player && (tick < massCouplingScanTick || tick - massCouplingScanTick >= 6)) {
      fillActiveMassCouplingTargets(
        state,
        player.id,
        gravityMarkTargets,
        momentumSinkTargets,
        gravityMarkOverlays.length,
        MAX_MOMENTUM_SINK_OVERLAYS,
      );
      massCouplingScanTick = tick;
    } else if (!player) {
      gravityMarkTargets.length = 0;
      momentumSinkTargets.length = 0;
      massCouplingScanTick = -Infinity;
    }
  }

  function updateGravityMarkOverlays(player) {
    scanMassCouplingOverlays(player);
    for (let i = 0; i < gravityMarkOverlays.length; i++) {
      const marker = gravityMarkOverlays[i];
      const entity = gravityMarkTargets[i];
      if (!entity || entity.alive === false || !helpers.worldToScreen) {
        setClass(marker, 'visible', false);
        continue;
      }
      const projected = helpers.worldToScreen({ x: entity.pos.x, y: 0, z: entity.pos.z });
      if (!projected.onScreen) {
        setClass(marker, 'visible', false);
        continue;
      }
      setClass(marker, 'visible', true);
      setHudScreenTransform(marker, projected.x, projected.y);
    }
  }

  // Momentum Sink advertises its explicit reference frame and remaining window. Its fixed pool
  // shares Gravity Mark's retained 10 Hz collection pass, avoiding a second entity traversal.
  const momentumSinkOverlays = [];
  for (let i = 0; i < MAX_MOMENTUM_SINK_OVERLAYS; i++) {
    const marker = document.createElement('div');
    marker.className = 'sf-momentum-sink';
    marker.setAttribute('role', 'img');
    marker.innerHTML = '<div class="sf-momentum-sink__bracket" aria-hidden="true"></div>'
      + '<div class="sf-momentum-sink__axis" aria-hidden="true"></div>'
      + '<div class="sf-momentum-sink__label mono">MOMENTUM SINK · YOUR FRAME · <span>0s</span></div>';
    root.appendChild(marker);
    momentumSinkOverlays.push({ marker, remaining: marker.querySelector('span'), seconds: -1 });
  }

  function updateMomentumSinkOverlays(player) {
    const tick = Number.isInteger(state.tick) ? state.tick : 0;
    scanMassCouplingOverlays(player);
    for (let i = 0; i < momentumSinkOverlays.length; i++) {
      const overlay = momentumSinkOverlays[i];
      const entity = momentumSinkTargets[i];
      if (!entity || entity.alive === false || !helpers.worldToScreen) {
        setClass(overlay.marker, 'visible', false);
        continue;
      }
      const projected = helpers.worldToScreen({ x: entity.pos.x, y: 0, z: entity.pos.z });
      if (!projected.onScreen) {
        setClass(overlay.marker, 'visible', false);
        continue;
      }
      const runtime = state.combat && state.combat.entities && state.combat.entities[String(entity.id)];
      const active = runtime && runtime.statuses && runtime.statuses[MOMENTUM_SINK_STATUS_ID];
      const seconds = active ? Math.max(0, Math.ceil((active.expiresTick - tick) / 60)) : 0;
      if (overlay.seconds !== seconds) {
        overlay.seconds = seconds;
        setText(overlay.remaining, `${seconds}s`);
        overlay.marker.setAttribute('aria-label', `Momentum Sink target, bound to your velocity frame, ${seconds} seconds remaining`);
      }
      setClass(overlay.marker, 'visible', true);
      setHudScreenTransform(overlay.marker, projected.x, projected.y);
    }
  }

  // Lead pip (BP-02) — world-space "aim here" marker at the ballistic lead solution for the current
  // target. Player-only HUD; solved via the same lead model the guns use (src/ai/gunnery.js).
  const leadPip = document.createElement('div');
  leadPip.className = 'sf-leadpip';
  leadPip.innerHTML = '<div class="sf-leadpip__ring"></div>';
  root.appendChild(leadPip);

  // ---- death / respawn feedback banner ----
  injectDeathStyle();
  const deathBanner = document.createElement('div');
  deathBanner.className = 'sf-death';
  deathBanner.hidden = true;
  deathBanner.setAttribute('aria-hidden', 'true');
  deathBanner.setAttribute('role', 'alert');
  deathBanner.innerHTML = '<div class="sf-death__big">SHIP DESTROYED</div><div class="sf-death__sub">Emergency recovery online…</div>';
  root.appendChild(deathBanner);
  let deathHideTimer = 0;
  ctx.bus.on('player:death', () => {
    clearTimeout(deathHideTimer);
    deathBanner.hidden = false;
    deathBanner.removeAttribute('aria-hidden');
    deathBanner.classList.remove('show'); void deathBanner.offsetWidth; // restart animation
    deathBanner.classList.add('show');
    document.body.classList.add('sf-deathflash');
    setTimeout(() => document.body.classList.remove('sf-deathflash'), 700);
    deathHideTimer = setTimeout(() => {
      deathBanner.classList.remove('show');
      deathBanner.hidden = true;
      deathBanner.setAttribute('aria-hidden', 'true');
    }, 2500);
  });
  ctx.bus.on('player:respawn', (payload) => {
    ctx.bus.emit('toast', {
      text: respawnToastText(payload || {}),
      kind: payload && payload.cargoLost ? 'warn' : 'good',
      ttl: 5,
    });
  });

  // ---- presentation captions (accessibility: subtitles for audio/gameplay cues) ----
  // presentationAdapters emits presentation:caption { text, assertive, shape, ... } for important
  // cues, but nothing subscribed — the events were emitted into the void. This mounts a visible
  // caption box (bottom-center, like subtitles) + an aria-live region so screen readers announce
  // the same text. The hook already carries text + an assertive flag for high-priority cues, so
  // wiring it closes the audio-caption accessibility gap for free.
  if (!document.getElementById('sf-caption-style')) {
    const cs = document.createElement('style');
    cs.id = 'sf-caption-style';
    cs.textContent = `
    .sf-caption { position:absolute; left:50%; bottom:14%; transform:translate(-50%, 8px);
      max-width:min(80vw, 640px); padding:9px 16px; border-radius:8px;
      background:rgba(6,10,20,.82); border:1px solid var(--panel-edge, rgba(120,160,200,.25));
      color:var(--ink, #d7e6ff); font-size:15px; line-height:1.35; text-align:center;
      pointer-events:none; opacity:0; transition:opacity .18s ease, transform .18s ease;
      text-shadow:0 1px 6px rgba(0,0,0,.7); z-index:40;
      letter-spacing:.01em; }
    .sf-caption.show { opacity:1; transform:translate(-50%, 0); }
    .sf-caption.assertive { border-color:var(--accent, #39d0ff); box-shadow:0 0 16px rgba(57,208,255,.35); }
    @media (prefers-reduced-motion: reduce) { .sf-caption { transition:opacity .18s ease; transform:translate(-50%,0); } }
    `;
    document.head.appendChild(cs);
  }
  const caption = document.createElement('div');
  caption.className = 'sf-caption';
  caption.hidden = true;
  caption.setAttribute('aria-hidden', 'true');
  root.appendChild(caption);
  // Two dedicated live regions so we never mutate aria-live on a single element.
  const livePolite = document.createElement('div');
  livePolite.className = 'sr-only';
  livePolite.setAttribute('aria-live', 'polite');
  livePolite.setAttribute('role', 'status');
  livePolite.setAttribute('aria-atomic', 'true');
  root.appendChild(livePolite);
  const liveAssertive = document.createElement('div');
  liveAssertive.className = 'sr-only';
  liveAssertive.setAttribute('aria-live', 'assertive');
  liveAssertive.setAttribute('role', 'alert');
  liveAssertive.setAttribute('aria-atomic', 'true');
  root.appendChild(liveAssertive);
  let captionHideTimer = 0;
  let captionFadeTimer = 0;
  ctx.bus.on('presentation:caption', (p) => {
    if (!p || !p.text) return;
    clearTimeout(captionHideTimer);
    clearTimeout(captionFadeTimer);
    caption.textContent = p.text;
    caption.hidden = false;
    caption.classList.toggle('assertive', !!p.assertive);
    caption.classList.remove('show'); void caption.offsetWidth; // restart fade-in
    caption.classList.add('show');
    // Route to the appropriate live region so screen readers get the right politeness without
    // mutating aria-live on a single element (which confuses some ATs).
    const live = p.assertive ? liveAssertive : livePolite;
    live.textContent = '';
    live.textContent = p.text;
    const ttl = p.assertive ? 3200 : 2400;
    captionHideTimer = setTimeout(() => {
      caption.classList.remove('show');
      captionFadeTimer = setTimeout(() => {
        caption.hidden = true;
      }, 220); // let the fade-out finish before hiding
    }, ttl);
  });

  // ---- M1 doctrine player-tells (FLYBY / TETHER / CHARGE) + truthful tether prompt ownership ----
  // Max three pooled tell chips. Enemy-linked when on-screen; truthful off-screen edge chip with
  // direction (text chip — not a visor/screen-edge arc). Listens to live ai:telegraph from
  // tacticalAI combatDoctrine (engine_flare / attach_spool / weapon_charge).
  if (!document.getElementById('sf-tell-style')) {
    const ts = document.createElement('style');
    ts.id = 'sf-tell-style';
    ts.textContent = `
    .sf-tells { position:absolute; inset:0; z-index:36; pointer-events:none; overflow:hidden; }
    .sf-tell {
      position:absolute; left:0; top:0; display:none; align-items:center; gap:6px;
      max-width:min(42vw, 280px); padding:5px 10px 5px 8px; border-radius:4px;
      background:rgba(5,9,18,.88); border:1px solid rgba(255,92,92,.55);
      color:var(--ink, #d7e6ff); font-family:var(--mono, Consolas, monospace);
      font-size:12px; letter-spacing:.04em; line-height:1.2; white-space:nowrap;
      will-change:transform, opacity; opacity:0;
      box-shadow:0 2px 10px rgba(0,0,0,.35);
    }
    .sf-tell.is-on { display:inline-flex; opacity:1; }
    .sf-tell--FLYBY { border-color:rgba(255,92,92,.7); }
    .sf-tell--TETHER { border-color:rgba(255,179,92,.7); }
    .sf-tell--CHARGE { border-color:rgba(255,92,92,.7); }
    .sf-tell__icon { font-size:11px; opacity:.95; flex:0 0 auto; }
    .sf-tell__kind { font-weight:700; letter-spacing:.14em; font-size:11px; color:#ff5c5c; }
    .sf-tell--TETHER .sf-tell__kind { color:#ffb35c; }
    .sf-tell__hint { color:rgba(215,230,255,.82); letter-spacing:.02em; font-size:11px;
      text-transform:none; overflow:hidden; text-overflow:ellipsis; }
    .sf-tell__dir { color:rgba(215,230,255,.9); font-size:12px; margin-left:2px; flex:0 0 auto; }
    .sf-tell.is-offscreen .sf-tell__dir { display:inline; }
    .sf-tell:not(.is-offscreen) .sf-tell__dir { display:none; }
    .sf-tell.is-pulse { animation:sf-tell-pulse .45s ease-out 1; }
    @keyframes sf-tell-pulse {
      0% { filter:brightness(1.35); }
      100% { filter:brightness(1); }
    }
    html.sf-reduce-motion .sf-tell.is-pulse,
    html.sf-reduce-flash .sf-tell.is-pulse { animation:none !important; }
    @media (prefers-reduced-motion: reduce) {
      .sf-tell.is-pulse { animation:none !important; }
    }
    `;
    document.head.appendChild(ts);
  }
  const tellRoot = document.createElement('div');
  tellRoot.className = 'sf-tells';
  // Visual chips are decorative for AT; a single shared assertive region announces once.
  tellRoot.setAttribute('aria-hidden', 'true');
  root.appendChild(tellRoot);
  // Reuse the existing assertive live region when present; otherwise a dedicated tell announcer.
  const tellLiveAssertive = liveAssertive || (() => {
    const el = document.createElement('div');
    el.className = 'sr-only';
    el.setAttribute('aria-live', 'assertive');
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-atomic', 'true');
    root.appendChild(el);
    return el;
  })();
  const tellSlots = [];
  for (let i = 0; i < TELL_POOL_SIZE; i++) {
    const el = document.createElement('div');
    el.className = 'sf-tell';
    // Non-live visual chip — no per-chip assertive region (avoids triple SR double-announce).
    el.setAttribute('aria-hidden', 'true');
    el.hidden = true;
    el.innerHTML =
      '<span class="sf-tell__icon" aria-hidden="true"></span>' +
      '<span class="sf-tell__kind"></span>' +
      '<span class="sf-tell__hint"></span>' +
      '<span class="sf-tell__dir" aria-hidden="true">▸</span>';
    tellRoot.appendChild(el);
    tellSlots.push({
      el,
      iconEl: el.querySelector('.sf-tell__icon'),
      kindEl: el.querySelector('.sf-tell__kind'),
      hintEl: el.querySelector('.sf-tell__hint'),
      dirEl: el.querySelector('.sf-tell__dir'),
      entityId: null,
      tellId: null,
      startedTick: -1,
      expiresAtTick: -1,
      age: Infinity,
      announced: '',
    });
  }

  function retireTell(slot) {
    if (!slot || slot.age >= Infinity) return;
    slot.entityId = null;
    slot.tellId = null;
    slot.startedTick = -1;
    slot.expiresAtTick = -1;
    slot.age = Infinity;
    slot.announced = '';
    slot.el.classList.remove('is-on', 'is-offscreen', 'is-pulse', 'sf-tell--FLYBY', 'sf-tell--TETHER', 'sf-tell--CHARGE');
    slot.el.hidden = true;
    setText(slot.iconEl, '');
    setText(slot.kindEl, '');
    setText(slot.hintEl, '');
  }

  function acquireTellSlot(entityId) {
    let free = null;
    let oldest = tellSlots[0];
    for (const slot of tellSlots) {
      if (slot.entityId === entityId && slot.age < Infinity) return slot;
      if (slot.age >= Infinity && !free) free = slot;
      if (slot.age > oldest.age) oldest = slot;
    }
    return free || oldest;
  }

  function pushDoctrineTell(payload) {
    const tellId = doctrineTellKind(payload);
    if (!tellId) return;
    const entityId = payload.entityId;
    if (entityId == null) return;
    // Only surface tells aimed at the player (or legacy emissions with no target field).
    if (payload.targetId != null && payload.targetId !== state.playerId) return;
    const tick = Number.isInteger(payload.tick) ? payload.tick
      : (Number.isInteger(state.tick) ? state.tick : 0);
    // Floor to ≥30 sim ticks so HUD never under-telegraphs the sim hold-fire window.
    const durationTicks = Math.max(30, Math.floor(Number(payload.durationTicks) || DEFAULT_TELEGRAPH_TICKS));
    const slot = acquireTellSlot(entityId);
    const wasSame = slot.entityId === entityId && slot.tellId === tellId && slot.age < Infinity;
    slot.entityId = entityId;
    slot.tellId = tellId;
    slot.startedTick = tick;
    slot.expiresAtTick = tick + durationTicks;
    slot.age = 0;
    const kindLabel = tellId;
    const hint = DOCTRINE_TELL_HINT[tellId] || '';
    const icon = DOCTRINE_TELL_ICON[tellId] || '⚠';
    slot.el.classList.remove('sf-tell--FLYBY', 'sf-tell--TETHER', 'sf-tell--CHARGE');
    slot.el.classList.add(`sf-tell--${tellId}`);
    setText(slot.iconEl, icon);
    setText(slot.kindEl, kindLabel);
    setText(slot.hintEl, hint);
    slot.el.hidden = false;
    slot.el.classList.add('is-on');
    // Visual chips are non-live (aria-hidden); one shared assertive region announces once.
    const announce = `${kindLabel}. ${hint}`.trim();
    if (announce !== slot.announced) {
      slot.announced = announce;
      tellLiveAssertive.textContent = '';
      tellLiveAssertive.textContent = announce;
    }
    // Pulse only on fresh tell; honor reduce-motion / reduce-flash (class + runtime flags).
    const allowPulse = !getMotionReduced() && !getFlashReduced()
      && !(typeof document !== 'undefined' && document.documentElement
        && (document.documentElement.classList.contains('sf-reduce-motion')
          || document.documentElement.classList.contains('sf-reduce-flash')));
    if (!wasSame && allowPulse) {
      slot.el.classList.remove('is-pulse');
      void slot.el.offsetWidth;
      slot.el.classList.add('is-pulse');
    } else {
      slot.el.classList.remove('is-pulse');
    }
  }

  ctx.bus.on('ai:telegraph', (p) => pushDoctrineTell(p || {}));

  function updateDoctrineTells(frameDt) {
    const w2s = helpers && helpers.worldToScreen;
    const tick = Number.isInteger(state.tick) ? state.tick : 0;
    const w = (typeof window !== 'undefined' && window.innerWidth) || 1280;
    const h = (typeof window !== 'undefined' && window.innerHeight) || 720;
    for (let slotIndex = 0; slotIndex < tellSlots.length; slotIndex++) {
      const slot = tellSlots[slotIndex];
      if (slot.age >= Infinity) continue;
      slot.age += frameDt;
      if (tick > slot.expiresAtTick) { retireTell(slot); continue; }
      const ent = state.entities && state.entities.get && state.entities.get(slot.entityId);
      if (!ent || ent.alive === false || !ent.pos) { retireTell(slot); continue; }
      if (!w2s) {
        // The shared live-region announcement remains available, but a visual chip without an
        // authoritative projection would lie about direction and therefore stays hidden.
        setDisplay(slot.el, false);
        continue;
      }
      const proj = w2s({ x: ent.pos.x, y: 0, z: ent.pos.z });
      const placement = resolveDoctrineTellPlacement(w, h, proj, slotIndex);
      if (!placement) { setDisplay(slot.el, false); continue; }
      setDisplay(slot.el, true, 'inline-flex');
      setClass(slot.el, 'is-offscreen', !placement.onScreen);
      setHudScreenTransform(slot.el, placement.x, placement.y, { center: true });
      if (slot.dirEl) setStyle(slot.dirEl, 'transform', `rotate(${placement.directionDeg.toFixed(1)}deg)`);
      setHidden(slot.el, false);
      setClass(slot.el, 'is-on', true);
    }
  }

  // ---- HUD meta-arc: the three phases of complicity (STABLE LOAD, tag flicker, manifest ghost) ----
  // Mounted as a HUD sub-component (like the death banner). Driven by hud:phase / hud:tagFlicker
  // events the story system emits. Inject its CSS once, then create + tick it.
  if (!document.getElementById('sf-hudmeta-style')) {
    const ms = document.createElement('style');
    ms.id = 'sf-hudmeta-style';
    ms.textContent = HUD_META_CSS;
    document.head.appendChild(ms);
  }
  const hudMeta = createHudMeta(ctx);

  // ---- cargo hold physical style sheet ----
  const CARGO_HOLD_CSS = `
  .sf-cargo-panel {
    display: none;
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 980px;
    height: 600px;
    background: color-mix(in srgb, var(--panel) 96%, transparent);
    border: 1px solid var(--visor-cyan);
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.85), 0 0 30px color-mix(in srgb, var(--visor-cyan) 15%, transparent);
    z-index: 1000;
    pointer-events: auto;
    font-family: var(--mono, monospace);
    flex-direction: column;
    overflow: hidden;
  }
  .sf-cargo-panel.open {
    display: flex;
  }
  .sf-cargo-panel__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    border-bottom: 1px solid var(--panel-edge);
    background: color-mix(in srgb, var(--panel-2) 40%, transparent);
  }
  .sf-cargo-title-group {
    display: flex;
    flex-direction: column;
  }
  .sf-cargo-panel__title {
    font-size: 16px;
    font-weight: bold;
    letter-spacing: 0.1em;
    color: var(--visor-cyan);
  }
  .sf-cargo-status-tag {
    font-size: 9px;
    letter-spacing: 0.05em;
    color: var(--ink-dim);
  }
  .sf-cargo-gauges {
    display: flex;
    gap: 30px;
    align-items: center;
  }
  .sf-cargo-gauge-item {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .sf-gauge-label {
    font-size: 11px;
    color: var(--ink-dim);
    display: flex;
    flex-direction: column;
  }
  .sf-gauge-label span {
    font-weight: bold;
    color: var(--visor-cyan);
  }
  .sf-cargo-panel__close {
    background: none;
    border: 1px solid var(--ink-mute);
    border-radius: 4px;
    color: var(--ink-dim);
    font-size: 11px;
    padding: 4px 12px;
    cursor: pointer;
  }
  .sf-cargo-panel__close:hover {
    border-color: var(--visor-cyan);
    color: var(--visor-cyan);
  }
  .sf-cargo-body {
    display: flex;
    flex: 1;
    overflow: hidden;
    position: relative;
  }
  .sf-cargo-left-rail {
    width: 160px;
    border-right: 1px solid var(--panel-edge);
    background: color-mix(in srgb, var(--panel-2) 20%, transparent);
    display: flex;
    flex-direction: column;
    padding: 15px 10px;
    gap: 10px;
  }
  .sf-cargo-rail-btn {
    background: none;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--ink-dim);
    font-family: var(--mono);
    font-size: 12px;
    padding: 10px 15px;
    text-align: left;
    cursor: pointer;
    letter-spacing: 0.05em;
    transition: all 0.2s ease;
  }
  .sf-cargo-rail-btn:hover {
    background: color-mix(in srgb, var(--visor-cyan) 8%, transparent);
    color: var(--visor-cyan);
  }
  .sf-cargo-rail-btn.active {
    background: color-mix(in srgb, var(--visor-cyan) 12%, transparent);
    border-color: var(--visor-cyan-dim);
    color: var(--visor-cyan);
    font-weight: bold;
  }
  .sf-cargo-centerpiece {
    flex: 1;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--panel-edge);
  }
  .sf-cargo-hex-bg {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.25;
    z-index: 1;
  }
  .sf-cargo-flicker-bg {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.15;
    z-index: 2;
  }
  .sf-cargo-schematic {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 12px;
    padding: 20px;
    overflow-y: auto;
    z-index: 5;
  }
  .sf-cargo-block {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 14px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    min-width: 140px;
    height: 120px;
    box-sizing: border-box;
    z-index: 10;
    position: relative;
  }
  .sf-cargo-block.legal {
    border: 1px solid var(--visor-cyan-dim);
    background: color-mix(in srgb, var(--panel-2) 70%, transparent);
  }
  .sf-cargo-block.restricted {
    border: 1px solid var(--warn);
    background: color-mix(in srgb, var(--warn) 6%, color-mix(in srgb, var(--panel-2) 70%, transparent));
  }
  .sf-cargo-block.contraband {
    border: 1px solid var(--danger);
    background: repeating-linear-gradient(45deg, color-mix(in srgb, var(--danger) 5%, transparent), color-mix(in srgb, var(--danger) 5%, transparent) 10px, color-mix(in srgb, var(--danger) 15%, transparent) 10px, color-mix(in srgb, var(--danger) 15%, transparent) 20px);
  }
  .sf-cargo-block.free-space {
    border: 1px dashed var(--ink-mute);
    background: transparent;
    cursor: default;
  }
  .sf-cargo-block:hover, .sf-cargo-block.selected {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
  }
  .sf-cargo-block.legal:hover, .sf-cargo-block.legal.selected {
    border-color: var(--visor-cyan);
    background: color-mix(in srgb, var(--visor-cyan) 10%, color-mix(in srgb, var(--panel-2) 70%, transparent));
    box-shadow: 0 0 15px color-mix(in srgb, var(--visor-cyan) 20%, transparent);
  }
  .sf-cargo-block.restricted:hover, .sf-cargo-block.restricted.selected {
    border-color: var(--warn);
    background: color-mix(in srgb, var(--warn) 15%, color-mix(in srgb, var(--panel-2) 70%, transparent));
    box-shadow: 0 0 15px color-mix(in srgb, var(--warn) 20%, transparent);
  }
  .sf-cargo-block.contraband:hover, .sf-cargo-block.contraband.selected {
    border-color: var(--danger);
    background: repeating-linear-gradient(45deg, color-mix(in srgb, var(--danger) 10%, transparent), color-mix(in srgb, var(--danger) 10%, transparent) 10px, color-mix(in srgb, var(--danger) 25%, transparent) 10px, color-mix(in srgb, var(--danger) 25%, transparent) 20px);
    box-shadow: 0 0 15px color-mix(in srgb, var(--danger) 20%, transparent);
  }
  .sf-cargo-block-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 5px;
  }
  .sf-cargo-block-name {
    font-size: 12px;
    font-weight: bold;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .sf-cargo-lock-icon {
    font-size: 10px;
    color: var(--warn);
  }
  .sf-cargo-block-bottom {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .sf-cargo-block-qty {
    font-size: 11px;
    color: var(--accent-2);
  }
  .sf-cargo-block-vol {
    font-size: 9px;
    color: var(--ink-dim);
  }
  .sf-cargo-badge {
    font-size: 8px;
    padding: 1px 4px;
    border-radius: 2px;
    font-weight: bold;
    align-self: flex-start;
    margin-top: 4px;
  }
  .sf-cargo-badge.fragile {
    background: color-mix(in srgb, var(--warn) 15%, transparent);
    color: var(--warn);
    border: 1px solid var(--warn);
  }
  .sf-cargo-badge.special {
    background: color-mix(in srgb, var(--visor-cyan) 15%, transparent);
    color: var(--visor-cyan);
    border: 1px solid var(--visor-cyan-dim);
  }
  .sf-cargo-badge.mission {
    background: color-mix(in srgb, var(--accent-2) 15%, transparent);
    color: var(--accent-2);
    border: 1px solid var(--accent-2);
  }
  .sf-cargo-supply-tree {
    height: 180px;
    border-top: 1px solid var(--panel-edge);
    background: color-mix(in srgb, var(--panel-2) 15%, transparent);
    padding: 15px 20px;
    overflow: hidden;
    z-index: 5;
  }
  .sf-cargo-supply-title {
    font-size: 11px;
    color: var(--ink-mute);
    margin-bottom: 8px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .sf-cargo-supply-chart {
    height: 140px;
  }
  .sf-cargo-inspector {
    width: 260px;
    padding: 20px;
    background: color-mix(in srgb, var(--panel-2) 20%, transparent);
    display: flex;
    flex-direction: column;
    gap: 20px;
    overflow-y: auto;
    z-index: 10;
  }
  .sf-inspector-empty {
    color: var(--ink-mute);
    font-size: 12px;
    text-align: center;
    margin: auto 0;
  }
  .sf-inspector-content {
    display: flex;
    flex-direction: column;
    gap: 15px;
    height: 100%;
  }
  .sf-ins-name {
    font-size: 16px;
    font-weight: bold;
    color: var(--visor-cyan);
    margin: 0;
    border-bottom: 1px solid var(--panel-edge);
    padding-bottom: 8px;
  }
  .sf-ins-meta {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sf-ins-meta-row {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
  }
  .sf-ins-meta-row span:first-child {
    color: var(--ink-dim);
  }
  .sf-ins-meta-row span:last-child {
    color: var(--ink);
    font-weight: bold;
  }
  .sf-ins-market {
    background: color-mix(in srgb, var(--panel-2) 30%, transparent);
    border: 1px solid var(--panel-edge);
    border-radius: 6px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sf-ins-market h4 {
    font-size: 11px;
    margin: 0;
    text-transform: uppercase;
    color: var(--visor-cyan);
    letter-spacing: 0.05em;
  }
  .sf-ins-buyer {
    font-size: 11px;
    color: var(--ink);
    line-height: 1.4;
    margin: 0;
  }
  .sf-ins-actions {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .sf-btn-fx {
    font-family: var(--mono);
    font-size: 12px;
    font-weight: bold;
    padding: 10px;
    border-radius: 4px;
    cursor: pointer;
    text-align: center;
    transition: all 0.2s ease;
    width: 100%;
    box-sizing: border-box;
  }
  .sf-btn-route {
    background: var(--visor-cyan-dim, color-mix(in srgb, var(--visor-cyan) 30%, transparent));
    border: 1px solid var(--visor-cyan);
    color: var(--visor-cyan);
  }
  .sf-btn-route:hover:not(:disabled) {
    background: var(--visor-cyan);
    color: var(--panel);
  }
  .sf-btn-jettison {
    background: color-mix(in srgb, var(--danger) 15%, transparent);
    border: 1px solid var(--danger);
    color: var(--danger);
  }
  .sf-btn-jettison:hover:not(:disabled) {
    background: var(--danger);
    color: var(--ink);
  }
  .sf-btn-fx:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .sf-cargo-ledger {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 20px;
    overflow: hidden;
    z-index: 5;
  }
  .sf-ledger-header {
    font-size: 12px;
    color: var(--visor-cyan);
    font-weight: bold;
    margin-bottom: 12px;
    letter-spacing: 0.05em;
  }
  .sf-ledger-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sf-ledger-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    background: color-mix(in srgb, var(--panel-2) 40%, transparent);
    border: 1px solid var(--panel-edge);
    border-radius: 6px;
    font-size: 11px;
  }
  .sf-ledger-left {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .sf-ledger-title {
    font-weight: bold;
    color: var(--ink);
  }
  .sf-ledger-side {
    padding: 1px 4px;
    border-radius: 2px;
    font-size: 9px;
    font-weight: bold;
    margin-right: 6px;
  }
  .sf-ledger-side.buy {
    background: color-mix(in srgb, var(--visor-cyan) 15%, transparent);
    color: var(--visor-cyan);
  }
  .sf-ledger-side.sell {
    background: color-mix(in srgb, var(--warn) 15%, transparent);
    color: var(--warn);
  }
  .sf-ledger-station {
    color: var(--ink-dim);
  }
  .sf-ledger-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
  }
  .sf-ledger-val {
    font-weight: bold;
    color: var(--accent-2);
  }
  .sf-ledger-profit {
    font-size: 9px;
    color: var(--good);
  }
  .sf-cargo-empty-msg {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--ink-mute);
    font-size: 13px;
    width: 100%;
  }
  .sf-cargo-beam-mount {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 900;
  }
  `;

  if (!document.getElementById('sf-cargohold-style')) {
    const ms = document.createElement('style');
    ms.id = 'sf-cargohold-style';
    ms.textContent = CARGO_HOLD_CSS;
    document.head.appendChild(ms);
  }

  // ---- cargo panel overlay ----
  const cargoPanel = document.createElement('div');
  cargoPanel.className = 'sf-cargo-panel';
  cargoPanel.innerHTML = `
    <div class="sf-cargo-panel__head">
      <div class="sf-cargo-title-group">
        <span class="sf-cargo-panel__title">CARGO HOLD MANIFEST</span>
        <span class="sf-cargo-status-tag">MANIFEST ACQUIRED</span>
      </div>
      <div class="sf-cargo-gauges">
        <div class="sf-cargo-gauge-item" id="sf-gauge-used">
          <span class="sf-gauge-label">CAPACITY: <span class="sf-cargo-summary-used">0 / 40 u</span></span>
        </div>
        <div class="sf-cargo-gauge-item" id="sf-gauge-risk">
          <span class="sf-gauge-label">SCAN RISK: <span class="sf-cargo-summary-risk">0%</span></span>
        </div>
      </div>
      <button class="sf-cargo-panel__close" type="button">ESC</button>
    </div>
    <div class="sf-cargo-body">
      <div class="sf-cargo-left-rail">
        <button class="sf-cargo-rail-btn active" data-tab="cargo" type="button">CARGO</button>
        <button class="sf-cargo-rail-btn" data-tab="materials" type="button">MATERIALS</button>
        <button class="sf-cargo-rail-btn" data-tab="salvage" type="button">SALVAGE</button>
        <button class="sf-cargo-rail-btn" data-tab="mission" type="button">MISSION</button>
        <button class="sf-cargo-rail-btn" data-tab="ledger" type="button">LEDGER</button>
      </div>
      <div class="sf-cargo-centerpiece">
        <div class="sf-cargo-hex-bg"></div>
        <div class="sf-cargo-flicker-bg"></div>
        <div class="sf-cargo-schematic"></div>
        <div class="sf-cargo-supply-tree"></div>
      </div>
      <div class="sf-cargo-inspector">
        <div class="sf-inspector-empty">No item selected. Select a block to inspect.</div>
        <div class="sf-inspector-content" style="display:none;">
          <h3 class="sf-ins-name">Commodity</h3>
          <div class="sf-ins-meta">
            <div class="sf-ins-meta-row"><span>Units/Vol:</span><span class="sf-ins-qty">0 u / 0 u</span></div>
            <div class="sf-ins-meta-row"><span>Legality:</span><span class="sf-ins-legal">LEGAL</span></div>
            <div class="sf-ins-meta-row"><span>Avg Basis:</span><span class="sf-ins-basis">N/A</span></div>
          </div>
          <div class="sf-ins-market">
            <h4>Market Intelligence</h4>
            <p class="sf-ins-buyer">Best Buyer: None</p>
          </div>
          <div class="sf-ins-actions">
            <button class="sf-btn-route sf-btn-fx" type="button">SET COURSE</button>
            <button class="sf-btn-jettison sf-btn-fx" type="button">JETTISON</button>
          </div>
        </div>
      </div>
    </div>
  `;
  root.appendChild(cargoPanel);

  // mount route beam overlay
  const beamMount = document.createElement('div');
  beamMount.className = 'sf-cargo-beam-mount';
  cargoPanel.appendChild(beamMount);
  const beamFx = createRouteBeam(beamMount, { width: 980, height: 600 });

  // mount background hexPattern
  const hexBg = cargoPanel.querySelector('.sf-cargo-hex-bg');
  const hexFx = createHexPattern(hexBg, { cols: 15, rows: 6, size: 16, width: 560, height: 260 });
  const hexCells = [];
  for (let cIdx = 0; cIdx < 15; cIdx++) {
    for (let rIdx = 0; rIdx < 6; rIdx++) {
      const isEdge = cIdx === 0 || cIdx === 14 || rIdx === 0 || rIdx === 5;
      hexCells.push({ col: cIdx, row: rIdx, kind: isEdge ? 'neutral' : 'good', intensity: isEdge ? 0.12 : 0.04 });
    }
  }
  hexFx.setCells(hexCells);

  // mount flickerGrid
  const flickerBg = cargoPanel.querySelector('.sf-cargo-flicker-bg');
  const gridFx = createFlickerGrid(flickerBg, { width: 560, height: 260, cell: 8, gap: 2, token: '--visor-cyan' });

  // mount gauges
  const gaugeUsedEl = cargoPanel.querySelector('#sf-gauge-used');
  const gaugeUsedFx = createCircularGauge(gaugeUsedEl, { size: 36, stroke: 4, kind: 'route' });

  const gaugeRiskEl = cargoPanel.querySelector('#sf-gauge-risk');
  const gaugeRiskFx = createCircularGauge(gaugeRiskEl, { size: 36, stroke: 4, kind: 'danger' });

  const supplyTreeEl = cargoPanel.querySelector('.sf-cargo-supply-tree');
  const supplyTreeTitle = document.createElement('div');
  supplyTreeTitle.className = 'sf-cargo-supply-title';
  supplyTreeTitle.textContent = 'Catalog Supply Chain';
  const supplyTreeMount = document.createElement('div');
  supplyTreeMount.className = 'sf-cargo-supply-chart';
  supplyTreeEl.append(supplyTreeTitle, supplyTreeMount);
  const supplyTreeFx = createSupplyTree(supplyTreeMount, { width: 520, height: 140 });

  let cargoPanelOpen = false;
  if (state.ui) state.ui.cargoPanelOpen = false;
  let activeTab = 'cargo';
  let selectedCommodityId = null;

  const CMDTY_MAP = new Map();
  function buildCmdtyMap() {
    if (CMDTY_MAP.size > 0) return;
    for (const c of COMMODITIES) CMDTY_MAP.set(c.id, c);
  }

  function getAverageBasis(s, commodityId) {
    const player = s.player;
    const lots = player && player.tradeLots && player.tradeLots[commodityId];
    if (!lots || !lots.length) return null;
    let totalCost = 0;
    let totalQty = 0;
    for (const lot of lots) {
      totalCost += lot.qty * lot.unit;
      totalQty += lot.qty;
    }
    return totalQty > 0 ? Math.round(totalCost / totalQty) : null;
  }

  function getMissionCargoIds(s) {
    const ids = new Set();
    if (s.missions && Array.isArray(s.missions.active)) {
      for (const m of s.missions.active) {
        if (m.status === 'active' && m.params && m.params.cmdtyId) {
          ids.add(m.params.cmdtyId);
        }
      }
    }
    return ids;
  }

  function cargoMemoryAgeLabel(s, seenAt) {
    const now = Math.max(0, Number(s && s.simTime) || 0);
    const ageS = Math.max(0, now - Math.max(0, Number(seenAt) || 0));
    if (ageS < 60) return 'fresh';
    return Math.max(1, Math.round(ageS / 60)) + ' min ago';
  }

  function supplyTreeNodesFor(commodityId) {
    const def = CMDTY_MAP.get(commodityId);
    if (!def) return [];
    const nodes = [{ id: commodityId, label: def.name, role: 'hub' }];
    for (const role of def.producedBy || []) {
      nodes.push({ id: 'produce:' + role, label: stationRoleLabel(role), role: 'produce' });
    }
    for (const role of def.consumedBy || []) {
      nodes.push({ id: 'consume:' + role, label: stationRoleLabel(role), role: 'consume' });
    }
    return nodes;
  }

  function updateSupplyTree(commodityId, hasKnownBuyer) {
    if (!commodityId) {
      supplyTreeTitle.textContent = 'Catalog Supply Chain';
      supplyTreeFx.setNodes([]);
      supplyTreeFx.setFlow(false);
      return;
    }
    const def = CMDTY_MAP.get(commodityId);
    supplyTreeTitle.textContent = def
      ? `Catalog Supply Chain: ${def.category}`
      : 'Catalog Supply Chain';
    const nodes = supplyTreeNodesFor(commodityId);
    if (hasKnownBuyer) {
      for (const node of nodes) {
        if (node.role === 'consume') node.flow = true;
      }
    }
    supplyTreeFx.setNodes(nodes);
    supplyTreeFx.setFlow(!!hasKnownBuyer);
  }

  function updateInspector(commodityId) {
    const emptyEl = cargoPanel.querySelector('.sf-inspector-empty');
    const contentEl = cargoPanel.querySelector('.sf-inspector-content');

    if (!commodityId) {
      emptyEl.style.display = 'block';
      contentEl.style.display = 'none';
      updateSupplyTree(null, false);
      beamFx.setPath([], { active: false });
      return;
    }

    emptyEl.style.display = 'none';
    contentEl.style.display = 'flex';

    const def = CMDTY_MAP.get(commodityId);
    const qty = (state.player.cargo.items || {})[commodityId] || 0;
    const vol = def ? (def.volPerU || 1) * qty : qty;
    const name = cargoDisplayName(commodityId);

    contentEl.querySelector('.sf-ins-name').textContent = name;
    contentEl.querySelector('.sf-ins-qty').textContent = `${qty} u / ${vol.toFixed(1)} u`;

    const legalEl = contentEl.querySelector('.sf-ins-legal');
    const legality = def ? def.legality : 'legal';
    legalEl.textContent = legality.toUpperCase();
    if (legality === 'contraband') {
      legalEl.style.color = 'var(--danger)';
    } else if (legality === 'restricted') {
      legalEl.style.color = 'var(--warn)';
    } else {
      legalEl.style.color = 'var(--visor-cyan)';
    }

    const basisText = contentEl.querySelector('.sf-ins-basis');
    const basis = getAverageBasis(state, commodityId);
    basisText.textContent = basis != null ? `${basis} CR` : 'N/A';

    const buyerText = contentEl.querySelector('.sf-ins-buyer');
    const routeBtn = contentEl.querySelector('.sf-btn-route');
    const best = bestKnownSellFor(state, commodityId);

    if (best) {
      const age = cargoMemoryAgeLabel(state, best.seenAt);
      const jumps = best.jumps == null ? '?' : best.jumps;
      const jumpText = jumps === 1 ? '1 jump' : `${jumps} jumps`;
      buyerText.innerHTML = `Best Buyer: <b>${escapeHtml(best.stationName)}</b><br>Price: <span class="mono" style="color:var(--accent-2);">${best.sell.toLocaleString()} CR</span> (${escapeHtml(age)}, ${escapeHtml(jumpText)})`;
      routeBtn.disabled = false;
      routeBtn.onclick = () => {
        applyTradeNavigation(ctx, best.stationId, commodityId);
      };
    } else {
      buyerText.innerHTML = `Best Buyer: <b>None Known</b><br><span style="color:var(--ink-mute);">No market data recorded.</span>`;
      routeBtn.disabled = true;
      routeBtn.onclick = null;
    }

    const jetBtn = contentEl.querySelector('.sf-btn-jettison');
    const missionCmdtyIds = getMissionCargoIds(state);
    const persistent = isPersistentCargoId(state, commodityId);
    const isLocked = persistent || missionCmdtyIds.has(commodityId);

    if (isLocked) {
      jetBtn.disabled = true;
      jetBtn.onclick = null;
      if (persistent) {
        jetBtn.title = 'Personal effects cannot be jettisoned';
        jetBtn.textContent = 'LOCK: PERSISTENT';
      } else {
        jetBtn.title = 'Contract cargo cannot be jettisoned';
        jetBtn.textContent = 'LOCK: CONTRACT';
      }
    } else {
      jetBtn.disabled = false;
      jetBtn.title = `Jettison all ${qty} units of ${name}`;
      jetBtn.textContent = 'JETTISON';
      jetBtn.onclick = async () => {
        ctx.bus.emit('audio:cue', { id: 'ui_click' });
        const ok = await confirm({
          title: 'Confirm Jettison',
          body: `Are you sure you want to jettison ${qty}x ${name}? This action is permanent.`,
          confirmLabel: 'Jettison',
          danger: true
        });
        if (ok) {
          ctx.bus.emit('cargo:jettison', { commodityId, qty });
        }
      };
    }

    updateSupplyTree(commodityId, !!best);

    setTimeout(() => {
      if (!cargoPanelOpen) return;
      const parentRect = cargoPanel.getBoundingClientRect();
      const elBlock = cargoPanel.querySelector(`.sf-cargo-block[data-id="${commodityId}"]`);
      const elBuyerCard = cargoPanel.querySelector('.sf-ins-market');
      if (elBlock && elBuyerCard && best) {
        const rA = elBlock.getBoundingClientRect();
        const rB = elBuyerCard.getBoundingClientRect();
        const ptA = {
          x: rA.left + rA.width / 2 - parentRect.left,
          y: rA.top + rA.height / 2 - parentRect.top
        };
        const ptB = {
          x: rB.left + rB.width / 2 - parentRect.left,
          y: rB.top + rB.height / 2 - parentRect.top
        };
        beamFx.setPath([ptA, ptB], { active: true, kind: 'route' });
      } else {
        beamFx.setPath([], { active: false });
      }
    }, 50);
  }

  function refreshCargoPanel() {
    if (!cargoPanelOpen) return;
    buildCmdtyMap();

    const c = (state.player || {}).cargo || {};
    const items = c.items || {};
    const used = Math.round(c.usedVolume || 0);
    const cap = Math.round(c.capVolume || 40);

    gaugeUsedFx.setValue(cap > 0 ? used / cap : 0, { label: `${used}/${cap} u` });
    cargoPanel.querySelector('.sf-cargo-summary-used').textContent = `${used} / ${cap} u`;

    let hasContraband = false;
    for (const id in items) {
      if (items[id] > 0) {
        const def = CMDTY_MAP.get(id);
        if (def && def.legality === 'contraband') hasContraband = true;
      }
    }
    gaugeRiskFx.setValue(hasContraband ? 0.75 : 0, { label: hasContraband ? '75%' : '0%' });
    cargoPanel.querySelector('.sf-cargo-summary-risk').textContent = hasContraband ? '75%' : '0%';

    const schematicEl = cargoPanel.querySelector('.sf-cargo-schematic');
    const supplyTreeEl = cargoPanel.querySelector('.sf-cargo-supply-tree');

    if (activeTab === 'ledger') {
      schematicEl.style.display = 'none';
      supplyTreeEl.style.display = 'none';
      let led = cargoPanel.querySelector('.sf-cargo-ledger');
      if (!led) {
        led = document.createElement('div');
        led.className = 'sf-cargo-ledger';
        cargoPanel.querySelector('.sf-cargo-centerpiece').appendChild(led);
      }
      led.style.display = 'flex';

      const ledgerList = state.player.tradeLedger || [];
      if (!ledgerList.length) {
        led.innerHTML = `
          <div class="sf-ledger-header">RECENT TRANSACTIONS</div>
          <div class="sf-cargo-empty-msg">No transactions recorded in ledger.</div>
        `;
      } else {
        let rowsHtml = '';
        for (const entry of ledgerList) {
          const name = escapeHtml(cargoDisplayName(entry.commodityId));
          const sideClass = entry.side === 'buy' ? 'buy' : 'sell';
          const sideText = sideClass.toUpperCase();
          const age = escapeHtml(cargoMemoryAgeLabel(state, entry.seenAt));
          const stn = escapeHtml(respawnStationName(entry.stationId));
          const qty = Math.max(0, Math.floor(Number(entry.qty) || 0));
          const total = Math.max(0, Math.round(Number(entry.total) || 0));
          const profit = Math.round(Number(entry.profit) || 0);
          const profitHtml = profit > 0 ? `<span class="sf-ledger-profit">+${profit.toLocaleString()} CR</span>` : '';
          rowsHtml += `
            <div class="sf-ledger-row">
              <div class="sf-ledger-left">
                <span class="sf-ledger-title"><span class="sf-ledger-side ${sideClass}">${sideText}</span> ${qty}x ${name}</span>
                <span class="sf-ledger-station">${stn} (${age})</span>
              </div>
              <div class="sf-ledger-right">
                <span class="sf-ledger-val">${total.toLocaleString()} CR</span>
                ${profitHtml}
              </div>
            </div>
          `;
        }
        led.innerHTML = `
          <div class="sf-ledger-header">RECENT TRANSACTIONS</div>
          <div class="sf-ledger-list">${rowsHtml}</div>
        `;
      }
      beamFx.setPath([], { active: false });
      updateInspector(null);
      return;
    }

    schematicEl.style.display = 'flex';
    supplyTreeEl.style.display = 'block';
    const led = cargoPanel.querySelector('.sf-cargo-ledger');
    if (led) led.style.display = 'none';

    const missionCmdtyIds = getMissionCargoIds(state);
    const keys = Object.keys(items).filter(id => {
      if (items[id] <= 0) return false;
      const def = CMDTY_MAP.get(id);
      if (activeTab === 'materials') {
        return def && (def.category === 'raw ore' || def.category === 'gas' || def.category === 'crystal');
      }
      if (activeTab === 'salvage') {
        return def && def.category === 'salvage';
      }
      if (activeTab === 'mission') {
        return missionCmdtyIds.has(id);
      }
      return true;
    });

    schematicEl.innerHTML = '';

    if (!keys.length) {
      schematicEl.innerHTML = `<div class="sf-cargo-empty-msg">No items in this category.</div>`;
      updateInspector(null);
      beamFx.setPath([], { active: false });
      return;
    }

    let totalFilteredVolume = 0;
    const itemVolumes = {};
    for (const id of keys) {
      const qty = items[id];
      const def = CMDTY_MAP.get(id);
      const vol = cargoVolumeForRow(state, id, qty, def);
      itemVolumes[id] = vol;
      totalFilteredVolume += vol;
    }

    const frag = document.createDocumentFragment();
    for (const id of keys) {
      const qty = items[id];
      const def = CMDTY_MAP.get(id);
      const name = escapeHtml(cargoDisplayName(id));
      const vol = itemVolumes[id];
      const persistent = isPersistentCargoId(state, id);
      const isLocked = persistent || missionCmdtyIds.has(id);

      let legalClass = 'legal';
      if (def && def.legality === 'restricted') legalClass = 'restricted';
      if (def && def.legality === 'contraband') legalClass = 'contraband';

      const block = document.createElement('div');
      block.className = `sf-cargo-block ${legalClass}`;
      if (selectedCommodityId === id) block.classList.add('selected');
      block.dataset.id = id;
      block.style.flex = `${Math.max(1, Math.round(vol))} ${Math.max(1, Math.round(vol))} 140px`;

      let badgeHtml = '';
      if (def) {
        if (id === 'cmdty_volatiles' || id === 'cmdty_medical') {
          badgeHtml = `<span class="sf-cargo-badge fragile">FRAGILE</span>`;
        } else if (def.category === 'exotic' || def.category === 'tech') {
          badgeHtml = `<span class="sf-cargo-badge special">EXOTIC</span>`;
        } else if (missionCmdtyIds.has(id)) {
          badgeHtml = `<span class="sf-cargo-badge mission">CONTRACT</span>`;
        }
      }

      block.innerHTML = `
        <div class="sf-cargo-block-top">
          <span class="sf-cargo-block-name">${name}</span>
          ${isLocked ? '<span class="sf-cargo-lock-icon">🔒</span>' : ''}
        </div>
        <div class="sf-cargo-block-bottom">
          <span class="sf-cargo-block-qty">${qty} units</span>
          <span class="sf-cargo-block-vol">${vol.toFixed(1)} u vol</span>
          ${badgeHtml}
        </div>
      `;

      block.addEventListener('click', (ev) => {
        ev.stopPropagation();
        selectedCommodityId = id;
        schematicEl.querySelectorAll('.sf-cargo-block').forEach(b => b.classList.remove('selected'));
        block.classList.add('selected');
        updateInspector(id);
        ctx.bus.emit('audio:cue', { id: 'ui_click' });
      });

      frag.appendChild(block);
    }

    const freeVol = Math.max(0, cap - used);
    if (freeVol > 0 && activeTab === 'cargo') {
      const freeBlock = document.createElement('div');
      freeBlock.className = 'sf-cargo-block free-space';
      freeBlock.style.flex = `${Math.max(1, Math.round(freeVol))} ${Math.max(1, Math.round(freeVol))} 140px`;
      freeBlock.innerHTML = `
        <div class="sf-cargo-block-top">
          <span class="sf-cargo-block-name" style="color:var(--ink-mute);">FREE CAPACITY</span>
        </div>
        <div class="sf-cargo-block-bottom">
          <span class="sf-cargo-block-qty" style="color:var(--ink-mute);">${freeVol} u free</span>
        </div>
      `;
      frag.appendChild(freeBlock);
    }

    schematicEl.appendChild(frag);

    if (!selectedCommodityId && keys.length > 0) {
      selectedCommodityId = keys[0];
      const firstBlock = schematicEl.querySelector(`.sf-cargo-block[data-id="${selectedCommodityId}"]`);
      if (firstBlock) firstBlock.classList.add('selected');
    }

    if (selectedCommodityId) {
      updateInspector(selectedCommodityId);
    } else {
      updateInspector(null);
    }
  }

  const railBtns = cargoPanel.querySelectorAll('.sf-cargo-rail-btn');
  railBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      railBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.dataset.tab;
      selectedCommodityId = null;
      refreshCargoPanel();
      gridFx.reveal({
        resolveTo: (c, r, cols, rows) => {
          return 0.1 + 0.4 * Math.sin(c * 0.5) * Math.cos(r * 0.5);
        },
        durationMs: 400
      });
      ctx.bus.emit('audio:cue', { id: 'ui_click' });
    });
  });

  // Listen for the jettison event in case the cargo system doesn't handle it natively
  ctx.bus.on('cargo:jettison', ({ commodityId, qty }) => {
    const cargoSys = ctx.registry && ctx.registry.get('cargo');
    if (cargoSys && cargoSys.jettison) {
      const dumped = cargoSys.jettison(commodityId, qty || 1);
      if (dumped > 0) {
        const name = cargoDisplayName(commodityId);
        ctx.bus.emit('toast', { text: `Jettisoned ${dumped}x ${name}`, kind: 'warn', ttl: 2 });
      }
    }
  });

  // Toggle function
  function toggleCargoPanel() {
    cargoPanelOpen = !cargoPanelOpen;
    if (state.ui) state.ui.cargoPanelOpen = cargoPanelOpen;
    cargoPanel.classList.toggle('open', cargoPanelOpen);

    gridFx.setActive(cargoPanelOpen);
    hexFx.setActive(cargoPanelOpen);
    beamFx.setActive(cargoPanelOpen);
    gaugeUsedFx.setActive(cargoPanelOpen);
    gaugeRiskFx.setActive(cargoPanelOpen);

    if (cargoPanelOpen) {
      refreshCargoPanel();
      gridFx.reveal({
        resolveTo: (c, r, cols, rows) => {
          return 0.1 + 0.4 * Math.sin(c * 0.5) * Math.cos(r * 0.5);
        },
        durationMs: 400
      });
    } else {
      beamFx.setPath([], { active: false });
    }
    ctx.bus.emit('audio:cue', { id: cargoPanelOpen ? 'ui_open' : 'ui_back' });
  }

  // close function
  function closeCargoPanel() {
    if (!cargoPanelOpen) return;
    cargoPanelOpen = false;
    if (state.ui) state.ui.cargoPanelOpen = false;
    cargoPanel.classList.remove('open');

    gridFx.setActive(false);
    hexFx.setActive(false);
    beamFx.setActive(false);
    gaugeUsedFx.setActive(false);
    gaugeRiskFx.setActive(false);
    beamFx.setPath([], { active: false });

    ctx.bus.emit('audio:cue', { id: 'ui_back' });
  }

  // Close button
  const cargoCloseBtn = cargoPanel.querySelector('.sf-cargo-panel__close');
  cargoCloseBtn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    closeCargoPanel();
  });

  // Refresh when cargo changes
  ctx.bus.on('cargo:changed', () => { if (cargoPanelOpen) refreshCargoPanel(); });

  // Expose toggle/close for the input system
  ctx.bus.on('ui:toggleCargo', toggleCargoPanel);
  ctx.bus.on('ui:closeCargo', closeCargoPanel);

  // Make the CARGO stat tile clickable to open the panel
  const cargoStat = center.querySelector('[data-k=cargo]');
  if (cargoStat) {
    const statTile = cargoStat.closest('.sf-stat');
    if (statTile) {
      statTile.style.cursor = 'pointer';
      statTile.addEventListener('click', (ev) => {
        ev.stopPropagation();
        toggleCargoPanel();
      });
    }
  }

  // Close on ESC when panel focus is inside it; ui/input.js handles the global flight case.
  cargoPanel.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { ev.stopPropagation(); closeCargoPanel(); }
  });

  // ---------------------------------------------------------------------------
  // Event-driven (rebuild) path — credits / cargo / objectives marked dirty.
  // ---------------------------------------------------------------------------
  let creditsDirty = true, cargoDirty = true, objDirty = true;
  ctx.bus.on('credits:changed', () => { creditsDirty = true; });
  ctx.bus.on('cargo:changed', () => { cargoDirty = true; });
  ctx.bus.on('ship:statsChanged', () => { cargoDirty = true; });
  ctx.bus.on('mission:updated', () => { objDirty = true; });
  ctx.bus.on('mission:accepted', () => { objDirty = true; });
  ctx.bus.on('mission:completed', () => { objDirty = true; });
  ctx.bus.on('mission:abandoned', () => { objDirty = true; });

  // Reticle accuracy bloom: the crosshair expands with sustained fire and contracts when cool — a
  // classic combat-readability cue. Driven by the player's own combat:fire events; _recoilBloom
  // spikes on each shot and decays each frame. Applied as a scale on the reticle's inner SVG (not
  // the reticle div, whose transform centers it — scaling the div would recenter awkwardly).
  let _recoilBloom = 0;   // 0 = rested (scale 1), up to ~1 (scale ~1.25) under sustained fire
  ctx.bus.on('combat:fire', (p) => {
    if (!p || p.ownerId !== state.playerId) return;
    _recoilBloom = Math.min(1, _recoilBloom + 0.35);
  });

  // ---- Reticle combat feedback: acquire / hit / kill (PR95) -----------------------------------
  // With verbose floating text off by default, this is where an ordinary flight reads its own
  // gunnery. Driven off the shipped combat receipts (combat:damage / entity:killed) and the
  // authoritative selection field — never a hover guess, a local raycast, or a second target model.
  // The timing rules themselves live in the pure stepReticleFeedback() above; the bus handlers only
  // latch "a receipt arrived this frame" so no rule is duplicated between an event and a frame.
  let _retState = { hitT: 0, killT: 0, acquireT: 0, targetId: null };
  let _retPendingHit = false;
  let _retPendingKill = false;
  const _retStepInput = { targetId: null, hit: false, kill: false };
  let elReticleFx = null;
  ctx.bus.on('combat:damage', (p) => { if (reticleHitFromDamage(p, state.playerId)) _retPendingHit = true; });
  ctx.bus.on('entity:killed', (p) => { if (reticleKillFromEvent(p, state.playerId)) _retPendingKill = true; });

  // WANTED indicator (V2 §20b / cut-list #15): a persistent red alert when the player's heat is
  // above the lawful-engagement threshold. Event-driven from the heat system's heat:changed.
  let wantedActive = false;
  if (alerts) {
    ctx.bus.on('heat:changed', (p) => {
      const v = p && typeof p.value === 'number' ? p.value : (state.player && state.player.heat) || 0;
      const wanted = v >= 0.15;
      const tier = v >= 0.6 ? 'HIGH' : v >= 0.35 ? 'MODERATE' : 'LOW';
      if (wanted && !wantedActive) {
        alerts.raise({ key: 'wanted', sev: 'danger', text: 'WANTED · LAW ENFORCEMENT ACTIVE', ttl: Infinity });
        wantedActive = true;
      } else if (wanted && wantedActive) {
        // refresh the text to show the new tier (raise dedups by key but updates text/sev)
        alerts.raise({ key: 'wanted', sev: 'danger', text: 'WANTED (' + tier + ') · HUNTERS INBOUND', ttl: Infinity });
      } else if (!wanted && wantedActive) {
        alerts.clear('wanted');
        wantedActive = false;
      }
    });
  }

  // Forced weapon-heat vent (Micro-Loops): when the player's guns peg heatMax, weapons.js locks them
  // out for ~2s while heat dumps. Flash the heat bars red + raise a top-center alert so the lockout
  // reads as a rhythm beat ("vent, then resume"), not a dead trigger.
  ctx.bus.on('weapons:vent', (p) => {
    if (!p || p.ownerId !== state.playerId) return;
    const venting = p.phase === 'start';
    wpnHeatsWrap.classList.toggle('venting', venting);
    if (rowEls.heat) rowEls.heat.classList.toggle('sf-bar--venting', venting);
    if (alerts) {
      if (venting) alerts.raise({ key: 'wpn-vent', sev: 'warn', text: 'WEAPONS VENTING', ttl: 2.3 });
      else alerts.clear('wpn-vent');
    }
    if (venting) ctx.bus.emit('audio:cue', { id: 'ui_deny' });
  });

  // Credit count-up tween. Instead of snapping the digits to the new value on a credits:changed
  // event, we ease the displayed number from the previously-shown value toward the target over
  // CRED_TWEEN seconds. This makes a bounty / sale land as a fast count-up rather than an instant
  // digit jump — the classic "numbers feel alive" polish. Retargets smoothly if credits change
  // again mid-tween (animates from whatever is currently displayed).
  let _credFrom = 0, _credTo = 0, _credT = 1;   // _credT in [0,1]; 1 = at rest at target
  const CRED_TWEEN = 0.4;                        // seconds
  function _credCurrent() {
    // value currently shown (eases _credFrom -> _credTo)
    if (_credT >= 1) return _credTo;
    const e = 1 - (1 - _credT) * (1 - _credT);   // ease-out quad
    return _credFrom + (_credTo - _credFrom) * e;
  }
  function refreshCredits() {
    const target = Math.round((state.player || {}).credits || 0);
    // Retarget from the value currently displayed (not the old target) so chained changes stay smooth
    _credFrom = _credCurrent();
    _credTo = target;
    _credT = 0;
    creditsDirty = false;
    setText(elCredits, Math.round(_credFrom).toLocaleString());
    if (_credTo !== _credFrom) chipShow('credits');   // money moved — surface the chip
  }
  // Advance the tween on the 10Hz slow tick while a tween is in flight. When at rest this is a no-op.
  function tickCreditsTween(dt) {
    if (_credT >= 1) return;
    _credT = Math.min(1, _credT + (dt || 0.016) / CRED_TWEEN);
    setText(elCredits, Math.round(_credCurrent()).toLocaleString());
  }
  function refreshCargo() {
    cargoDirty = false;
    const c = (state.player || {}).cargo || {};
    const used = Math.round(c.usedVolume || 0);
    const cap = Math.round(c.capVolume || 40);
    const label = `${used} / ${cap} u`;
    if (elCargo && elCargo.textContent !== label) chipShow('cargo');   // hold changed — surface it
    setText(elCargo, label);
    setClass(elCargo, 'sf-warn', cap > 0 && used >= cap);
  }
  let lastObjectivesSig = '';
  function refreshObjectives() {
    objDirty = false;
    // One-objective law: contract lists belong in the on-demand Mission Log. The flight HUD has
    // exactly one command surface (missionTracker), including when nothing has been tracked yet.
    // Keep the legacy node mounted for compatibility with probes, but never paint its old 1–4 row
    // stack; that stack was the source of repeated, overlapping mission copy in the live capture.
    lastObjectivesSig = '__active-objective-owns-attention__';
    if (objWrap.textContent) objWrap.textContent = '';
    setDisplay(objWrap, false);
  }

  // ---------------------------------------------------------------------------
  // Combat HUD update — lock ring + weapon heat bars + target lock diamond
  // ---------------------------------------------------------------------------
  function updateCombatHud(p, slow) {
    if (!p) {
      setClass(lockRing, 'active', false);
      setClass(lockRing, 'locked', false);
      setClass(lockDiamond, 'visible', false);
      setClass(leadPip, 'visible', false);
      setStyle(wpnHeatsWrap, 'display', 'none');
      updateGravityMarkOverlays(null);
      updateMomentumSinkOverlays(null);
      return;
    }

    const combat = p.data && p.data.combat;
    const weapons = p.data && p.data.weapons;
    const hasWeapons = weapons && weapons.length > 0;

    // ---- Lock-on progress ring ----
    // Show when the player has a lock-requiring weapon and is building/holding a lock.
    const lockProgress = combat ? (combat.lockProgress || 0) : 0;
    const isLocking = lockProgress > 0 && lockProgress < 1;
    const isLocked = lockProgress >= 1;
    if (isLocking || isLocked) {
      setClass(lockRing, 'active', true);
      setClass(lockRing, 'locked', isLocked);
      const offset = LOCK_C * (1 - lockProgress);
      const offsetText = offset.toFixed(2);
      setAttr(lockFill, 'stroke-dashoffset', offsetText);
      setText(lockLabel, isLocked ? 'LOCKED' : Math.round(lockProgress * 100) + '%');
    } else {
      setClass(lockRing, 'active', false);
      setClass(lockRing, 'locked', false);
    }
    // Lock-acquired tone: fire a two-note ascending cue on the rising edge (not-locked → locked).
    // Locking a missile target was visually indicated but sonically silent — a clear cue closes that.
    if (isLocked && !_wasLocked) ctx.bus.emit('audio:cue', { id: 'lock_acquired' });
    _wasLocked = isLocked;

    // ---- Per-weapon heat bars ----
    // Rebuild the weapon heat bar DOM when the ship or weapon loadout changes.
    if (hasWeapons) {
      const shipEntityId = p.id;
      if (wpnHeatShipId !== shipEntityId || wpnHeatEls.length !== weapons.length) {
        wpnHeatShipId = shipEntityId;
        rebuildWeaponHeatBars(weapons);
      }
      // Update fills every frame (cheap transforms only).
      for (let i = 0; i < weapons.length; i++) {
        const w = weapons[i];
        const el = wpnHeatEls[i];
        if (!el) continue;
        const hMax = w.heatMax != null ? w.heatMax : 100;
        const hCur = w._heat || 0;
        const frac = hMax > 0 ? clamp01(hCur / hMax) : 0;
        setScaleX(el.fill, frac);
        const overheated = hCur >= hMax && hMax > 0;
        setClass(el.row, 'overheated', overheated);
      }
      // Aggregate weapon heat already lives in the condition panel. Individual bars earn the extra
      // row only on a multi-weapon fit, where the player can act on the difference between guns.
      setStyle(wpnHeatsWrap, 'display', weapons.length > 1 ? 'flex' : 'none');
    } else {
      setStyle(wpnHeatsWrap, 'display', 'none');
    }

    // ---- Target lock diamond (world-space overlay on locked/selected target) ----
    const tid = (state.player || {}).targetId;
    const tgt = tid != null ? state.entities.get(tid) : null;
    if (tgt && tgt.alive && helpers.worldToScreen) {
      const proj = projectTargetCenter(tgt.pos);
      if (proj.onScreen) {
        setClass(lockDiamond, 'visible', true);
        setHudScreenTransform(lockDiamond, proj.x, proj.y);
        // Tint: red when missile-locked, cyan when just selected/tracking.
        const tgtLocked = isLocked && combat && combat.lockTarget === tid;
        setClass(lockDiamond, 'locked-tgt', tgtLocked);
      } else {
        setClass(lockDiamond, 'visible', false);
      }
    } else {
      setClass(lockDiamond, 'visible', false);
    }

    updateGravityMarkOverlays(p);
    updateMomentumSinkOverlays(p);

    // ---- Lead pip (BP-02) — pure gate in gunnery; HUD only applies screen coords ----
    const pipOverlay = computeLeadPipOverlay(p, tgt, state, {
      worldToScreen: helpers.worldToScreen,
      isHostileToPlayer,
      leadSolution,
      hasBallisticWeapon,
      primaryProjSpeed,
    });
    if (pipOverlay.visible) {
      setClass(leadPip, 'visible', true);
      setHudScreenTransform(leadPip, pipOverlay.x, pipOverlay.y);
      setClass(leadPip, 'on-solution', pipOverlay.onSolution);
    } else {
      setClass(leadPip, 'visible', false);
    }
  }

  // ---------------------------------------------------------------------------
  // 60Hz cheap path
  // ---------------------------------------------------------------------------
  let lowShieldActive = false, lowHullActive = false;
  let lastDefId = null;
  let elReticle = null;
  let cachedNavStationId = null;
  let cachedNavEntity = null;
  let cachedNavListLength = -1;
  let cachedNavIndexVersion = -1;
  let lastNavLabel = '';
  let lastNavDist = '';
  let lastNavEta = '';
  let lastObjectiveMarkerText = '';
  const numericClock = createHudClock(10);
  const targetClock = createHudClock(20);
  const overlayClock = createHudClock(30);
  const radarClock = createHudClock(10);

  function syncSafetyAlerts(p, hullFrac, shieldFrac) {
    if (!alerts || !p) return;
    if (hullFrac == null) hullFrac = p.hullMax ? clamp01(p.hull / p.hullMax) : 0;
    if (shieldFrac == null) shieldFrac = p.shieldMax ? clamp01(p.shield / p.shieldMax) : 0;
    const lowShield = shieldFrac > 0 && shieldFrac < 0.2;
    if (lowShield && !lowShieldActive) alerts.raise({ key: 'low-shield', sev: 'warn', text: 'SHIELDS LOW', ttl: Infinity });
    if (!lowShield && lowShieldActive) alerts.clear('low-shield');
    lowShieldActive = lowShield;
    const lowHull = hullFrac > 0 && hullFrac < 0.25;
    if (lowHull && !lowHullActive) alerts.raise({ key: 'low-hull', sev: 'danger', text: 'HULL CRITICAL', ttl: Infinity });
    if (!lowHull && lowHullActive) alerts.clear('low-hull');
    lowHullActive = lowHull;
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[ch]);
  }

  function setSvgAttr(el, name, value) {
    setAttr(el, name, value);
  }

  function getIffData(e, playerTeam) {
    let iff = 'neutral';
    if (e.team === playerTeam || e.team === 0) {
      iff = e.id === state.playerId ? 'ally' : 'friendly';
    } else if (isHostileToPlayer(e, playerTeam, state)) {
      iff = 'hostile';
    }
    const isGhost = e.data && (e.data.isGhost || e.data.ghost || e.data.kind === 'unknown');
    const data = SEMANTIC_PALETTE[iff] || SEMANTIC_PALETTE.neutral;
    let icon = data.icon;
    if (isGhost) {
      if (iff === 'hostile') icon = '△';
      else if (iff === 'friendly') icon = '◇';
      else if (iff === 'neutral') icon = '□';
      else if (iff === 'ally') icon = '▽';
    }
    return {
      iff,
      color: `var(${data.cssVar})`,
      icon,
      isGhost
    };
  }

  function getClassGlyph(e) {
    if (!e) return '·';
    if (e.type === 'station') return '◆';
    if (e.type === 'wreck') return '⛶';
    if (e.type === 'asteroid') return '●';
    
    const def = e.data && e.data.defId ? SHIP_BY_ID.get(e.data.defId) : null;
    const family = (def && def.visuals && def.visuals.family) || '';
    const role = (e.role || (def && def.role) || '').toLowerCase();
    
    if (family === 'scout' || role.includes('scout') || role.includes('starter')) return '⌃';
    if (family === 'fighter' || role.includes('fighter')) return '⚔';
    if (family === 'freighter' || role.includes('freighter') || role.includes('cargo')) return '⛃';
    if (family === 'miner' || role.includes('miner')) return '⛏';
    if (family === 'frigate' || role.includes('frigate')) return '▲';
    if (family === 'capital' || role.includes('capital')) return '⚹';
    if (role.includes('gunship')) return '⎔';
    
    const sClass = (e.shipClass || '').toLowerCase();
    if (sClass === 'fighter') return '⚔';
    if (sClass === 'gunship') return '⎔';
    if (sClass === 'frigate') return '▲';
    if (sClass === 'capital') return '⚹';
    
    return '⌃';
  }

  const overviewClock = createContactRosterClock();
  // Retained, keyed contact rows (PERF). The strip used to guard a full `innerHTML = ''` teardown
  // behind a signature string that embedded Math.round(dist) and Math.round(closingSpeed) per
  // contact. Those tick on nearly every 5 Hz sample while the player is flying, so the guard almost
  // never hit and the roster paid subtree teardown + HTML parse + listener rebinding + style
  // recalc five times a second, forever. Rows are now keyed by entity id, reused across samples,
  // and written field-by-field only where a value actually changed; a distance ticking 431 -> 430
  // costs exactly one textContent write.
  const overviewRows = new Map();      // entity id -> retained row record
  let overviewStamp = 0;               // marks the rows touched by the current reconcile pass
  let overviewFooter = null;           // retained overflow footer (detached when there is no overflow)
  let overviewFooterAttached = false;
  const _overviewContacts = [];        // retained scratch: cleared per call, never reallocated
  const _overviewOrder = [];           // retained scratch: this sample's rows, in display order
  let _overviewIdScratch = new Set();  // retained scratch: swapped with _knownContactIds each call
  // Compact contacts roster (GDD 2.0 "Radar & Contacts"): known targeting contacts remain available
  // whenever radar can identify them. Scan/threat reveals still surface the empty shell for a beat,
  // and state.settings.ui.overviewOpen remains the manual PIN (O key).
  const OVERVIEW_HOSTILE_REVEAL_R = 2600;   // a hostile inside this radius keeps the strip open
  const OVERVIEW_SCAN_REVEAL_MS = 7000;     // how long a scan pulse holds the strip open
  const OVERVIEW_CONTACT_REVEAL_MS = 5000;  // how long a newly-arrived contact holds it open
  let _overviewRevealUntil = 0;
  let _knownContactIds = new Set();
  function revealOverview(ms) {
    const until = performance.now() + ms;
    if (until > _overviewRevealUntil) _overviewRevealUntil = until;
  }
  // A scan pulse is the player explicitly asking "what's out there" — surface the strip immediately.
  ctx.bus.on('scan:completed', () => { revealOverview(OVERVIEW_SCAN_REVEAL_MS); updateOverview(); });
  ctx.bus.on('scan:pulse', () => revealOverview(OVERVIEW_SCAN_REVEAL_MS));

  if (!state.settings) state.settings = {};
  if (!state.settings.ui) state.settings.ui = {};
  if (state.settings.ui.overviewOpen === undefined) {
    // Default to on-demand (unpinned): the strip speaks only when scanned or when a threat arrives.
    state.settings.ui.overviewOpen = false;
  }

  ctx.bus.on('ui:toggleOverview', () => {
    state.settings.ui.overviewOpen = !state.settings.ui.overviewOpen;
    if (state.settings.ui.overviewOpen) revealOverview(OVERVIEW_SCAN_REVEAL_MS);
    updateOverview();
    ctx.bus.emit('toast', {
      text: state.settings.ui.overviewOpen ? 'Contacts strip pinned' : 'Contacts strip on-demand',
      kind: 'info', ttl: 1.6,
    });
    ctx.bus.emit('audio:cue', { id: state.settings.ui.overviewOpen ? 'ui_open' : 'ui_back' });
  });

  // One-word state → CSS class for the row's state chip + tier pips.
  const OVERVIEW_STATE_CLASS = {
    HOSTILE: 'hostile', PATROL: 'patrol', DERELICT: 'derelict', TRADER: 'trader',
    MINER: 'miner', WINGMAN: 'ally', ALLY: 'ally', NEUTRAL: 'neutral',
  };
  function tierPips(tier) {
    let s = '';
    for (let i = 0; i < 3; i++) s += i < tier ? '▰' : '▱';
    return s;
  }
  function manifestSummary(e) {
    const man = e.data && e.data.manifest;
    if (!Array.isArray(man) || !man.length) return 'stripped';
    const top = man.slice(0, 2).map((it) => `${cargoDisplayName(it.id)} ×${it.qty}`).join(', ');
    return man.length > 2 ? `${top} +${man.length - 2}` : top;
  }

  const OVERVIEW_TIER_TITLE = 'Threat tier (mass + faction)';

  /**
   * Build one retained contact row. Structure is created with createElement/textContent rather than
   * an innerHTML template so that later updates can address individual spans; textContent supersedes
   * the old escapeHtml(...) interpolation (it is not markup, so nothing is escaped twice).
   * Every static class/style/attribute is written exactly once, here.
   */
  function createOverviewRow(entity) {
    const el = document.createElement('div');
    el.className = 'sf-overview-row';

    const left = document.createElement('div');
    left.className = 'sf-overview-row__left';
    const iffIcon = document.createElement('span');
    iffIcon.style.setProperty('font-weight', 'bold');
    const glyphEl = document.createElement('span');
    glyphEl.style.setProperty('color', 'var(--ink-dim)');
    glyphEl.style.setProperty('font-size', '10px');
    const nameEl = document.createElement('span');
    nameEl.className = 'sf-overview-row__name';
    const stateEl = document.createElement('span');
    left.append(iffIcon, glyphEl, nameEl, stateEl);

    const right = document.createElement('div');
    right.className = 'sf-overview-row__right';
    const tierEl = document.createElement('span');
    tierEl.setAttribute('title', OVERVIEW_TIER_TITLE);
    const distEl = document.createElement('span');
    const speedEl = document.createElement('span');
    speedEl.style.setProperty('width', '24px');
    speedEl.style.setProperty('text-align', 'right');
    right.append(tierEl, distEl, speedEl);

    el.append(left, right);

    const rec = {
      id: entity.id,
      el, iffIcon, glyphEl, nameEl, stateEl, tierEl, distEl, speedEl,
      detailEl: null,
      attached: false,
      stamp: 0,
      // Last value written to each field. A write happens only when one of these changes.
      name: '', iffColor: '', icon: '', glyph: '', stateWord: '', stateCls: '',
      tier: -1, dist: null, speed: '', detail: '', selected: false, unscanned: false,
    };

    // Bound ONCE for the life of the row. Re-binding a fresh closure per sample was part of the
    // teardown cost this rewrite removes; the record carries the live name so the toast stays current.
    el.addEventListener('click', () => {
      state.player.targetId = rec.id;
      ctx.bus.emit('toast', { text: `Selected target: ${rec.name}`, kind: 'info', ttl: 2 });
      updateOverview();
    });

    return rec;
  }

  /** Write only the fields of a retained row whose value actually changed this sample. */
  function syncOverviewRow(rec, c, playerTeam, player, targetId) {
    const e = c.e;
    const iff = getIffData(e, playerTeam);
    const glyph = getClassGlyph(e);
    const sword = c.ally ? 'ALLY' : contactStateWord(e, playerTeam, state);
    const stateCls = OVERVIEW_STATE_CLASS[sword] || 'neutral';
    const scannedWreck = c.isWreck && wreckScanned(e);
    const data = e.data || {};
    const name = data.callsign || data.name || data.trafficRole || data.role || e.role
      || (c.isWreck ? 'Derelict' : 'Ship');

    // Derelict manifest line: unscanned shows only a ghost outline; a scan resolves the manifest
    // + weak-point callout (GDD 2.0 §7.4).
    let detail = '';
    if (c.isWreck) {
      detail = scannedWreck ? `${manifestSummary(e)} · WEAK ${e.data.weakPoint || '—'}` : '??? UNSCANNED';
    }

    const rvx = e.vel.x - player.vel.x;
    const rvz = e.vel.z - player.vel.z;
    const closingSpeed = -((rvx * c.dx + rvz * c.dz) / (c.dist || 1));
    const speedIcon = closingSpeed >= 0.5 ? '▸' : (closingSpeed <= -0.5 ? '▹' : '');
    const speedText = Math.abs(closingSpeed) >= 0.5 ? `${speedIcon}${Math.round(Math.abs(closingSpeed))}` : '';
    const dist = Math.round(c.dist);
    const unscanned = c.isWreck && !scannedWreck;
    const selected = e.id === targetId;

    if (rec.unscanned !== unscanned) { setClass(rec.el, 'unscanned', unscanned); rec.unscanned = unscanned; }
    if (rec.selected !== selected) { setClass(rec.el, 'selected', selected); rec.selected = selected; }
    if (rec.iffColor !== iff.color) {
      rec.el.style.setProperty('--iff-color', iff.color);
      rec.iffIcon.style.setProperty('color', iff.color);
      rec.iffColor = iff.color;
    }
    if (rec.icon !== iff.icon) { rec.iffIcon.textContent = iff.icon; rec.icon = iff.icon; }
    if (rec.glyph !== glyph) { rec.glyphEl.textContent = glyph; rec.glyph = glyph; }
    if (rec.name !== name) { rec.nameEl.textContent = name; rec.name = name; }
    if (rec.stateWord !== sword) { rec.stateEl.textContent = sword; rec.stateWord = sword; }
    if (rec.stateCls !== stateCls) {
      // Rewrite the whole className: add-only would leave a stale sf-cs--<old> beside the new one.
      rec.stateEl.className = `sf-overview-row__state sf-cs--${stateCls}`;
      rec.tierEl.className = `sf-overview-row__tier sf-cs--${stateCls}`;
      rec.stateCls = stateCls;
    }
    if (rec.tier !== c.threatTier) { rec.tierEl.textContent = tierPips(c.threatTier); rec.tier = c.threatTier; }
    if (rec.dist !== dist) { rec.distEl.textContent = String(dist); rec.dist = dist; }
    if (rec.speed !== speedText) { rec.speedEl.textContent = speedText; rec.speed = speedText; }
    if (rec.detail !== detail) {
      if (detail) {
        if (!rec.detailEl) {
          rec.detailEl = document.createElement('div');
          rec.detailEl.className = 'sf-overview-row__detail';
          rec.el.appendChild(rec.detailEl);   // always after __left/__right, as in the old template
        }
        rec.detailEl.textContent = detail;
      } else if (rec.detailEl) {
        rec.el.removeChild(rec.detailEl);
        rec.detailEl = null;
      }
      rec.detail = detail;
    }
  }

  function updateOverview() {
    const player = state.entities.get(state.playerId);
    if (!player) {
      setDisplay(elOverview, false);
      return;
    }
    const playerTeam = player.team;

    // Retained scratch list: cleared and refilled, never reallocated (this runs at 5 Hz forever).
    const contacts = _overviewContacts;
    contacts.length = 0;
    for (const e of state.entityList || []) {
      if (!e.alive || e === player) continue;
      const isShip = verbAcceptsType('target', e.type); // PQ-015: shared ship|drone membership
      const isWreck = isWreckLike(e);
      if (!isShip && !isWreck) continue;

      const dx = e.pos.x - player.pos.x;
      const dz = e.pos.z - player.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 5200) continue;

      const hostile = isHostileToPlayer(e, playerTeam, state);
      const ally = !hostile && !isWreck && playerTeam !== 0 && e.team === playerTeam;
      contacts.push({
        e, dist, dx, dz, isWreck, hostile, ally,
        threatTier: contactThreatTier(e, hostile),
      });
    }

    // On-demand reveal bookkeeping: a fresh hostile/derelict arriving, or a hostile closing inside
    // the reveal radius, surfaces the strip for a beat even when it isn't pinned (one-voice rule).
    const nowMs = performance.now();
    // Double-buffered id sets. _knownContactIds must stay the PREVIOUS sample's set while the
    // current one is filled, so the two are swapped rather than aliased or reallocated.
    const curIds = _overviewIdScratch;
    curIds.clear();
    let nearbyHostile = false;
    for (const c of contacts) {
      curIds.add(c.e.id);
      if (c.hostile && c.dist < OVERVIEW_HOSTILE_REVEAL_R) nearbyHostile = true;
      if (!_knownContactIds.has(c.e.id) && (c.hostile || c.isWreck)) revealOverview(OVERVIEW_CONTACT_REVEAL_MS);
    }
    _overviewIdScratch = _knownContactIds;
    _knownContactIds = curIds;

    const pinned = !!state.settings.ui.overviewOpen;
    const visible = contactRosterVisible({
      eligibleContactCount: contacts.length,
      pinned,
      nearbyHostile,
      revealActive: nowMs < _overviewRevealUntil,
    });
    if (!visible) {
      // Rows stay retained while hidden; the next reveal reconciles them back to the truth.
      setDisplay(elOverview, false);
      return;
    }

    const targetId = state.player.targetId;
    const expanded = contactRosterExpanded({
      pinned,
      nearbyHostile,
      revealActive: nowMs < _overviewRevealUntil,
      selected: targetId != null,
    });
    if (!expanded) {
      setDisplay(elOverview, true, 'flex');
      elOverview.classList.add('sf-overview--count');
      const countText = formatRosterCount(contacts);
      if (!overviewFooter) {
        overviewFooter = document.createElement('div');
        overviewFooter.className = 'sf-overview-footer';
      }
      setText(overviewFooter, countText);
      if (!overviewFooter.parentNode) elOverview.appendChild(overviewFooter);
      overviewFooterAttached = true;
      for (const rec of overviewRows.values()) {
        if (rec.attached && rec.el.parentNode) rec.el.parentNode.removeChild(rec.el);
        rec.attached = false;
      }
      return;
    }
    elOverview.classList.remove('sf-overview--count');
    contacts.sort((a, b) => {
      const bandDelta = contactDisplayBand(a, targetId) - contactDisplayBand(b, targetId);
      if (bandDelta) return bandDelta;
      if (a.hostile && b.hostile && a.threatTier !== b.threatTier) return b.threatTier - a.threatTier;
      return a.dist - b.dist;
    });

    const displayLimit = contactDisplayLimit(
      typeof window !== 'undefined' ? window.innerWidth : 1280,
      typeof window !== 'undefined' ? window.innerHeight : 720,
    );
    setDisplay(elOverview, true, 'flex');

    const visibleCount = Math.min(displayLimit, contacts.length);

    // --- keyed reconcile -------------------------------------------------------------------
    // Pass 1: stamp the rows that survive into this sample, so stale rows can be dropped BEFORE
    // any reordering (index comparisons below must see only live rows).
    overviewStamp++;
    let retained = 0;
    for (let i = 0; i < visibleCount; i++) {
      const rec = overviewRows.get(contacts[i].e.id);
      if (rec) { rec.stamp = overviewStamp; retained++; }
    }
    if (overviewRows.size > retained) {
      for (const rec of overviewRows.values()) {
        if (rec.stamp === overviewStamp) continue;
        if (rec.attached) { elOverview.removeChild(rec.el); rec.attached = false; }
        overviewRows.delete(rec.id);
      }
    }

    // Pass 2: create only what is new and write only what changed.
    const order = _overviewOrder;
    order.length = 0;
    for (let i = 0; i < visibleCount; i++) {
      const c = contacts[i];
      let rec = overviewRows.get(c.e.id);
      if (!rec) {
        rec = createOverviewRow(c.e);
        rec.stamp = overviewStamp;
        overviewRows.set(rec.id, rec);
      }
      syncOverviewRow(rec, c, playerTeam, player, targetId);
      order.push(rec);
    }

    // Pass 3: ordering. Check first (a pure read) so the steady state performs zero DOM moves;
    // a genuine reorder or insert re-appends the whole run, and appendChild MOVES a live node
    // rather than recreating it.
    let inOrder = true;
    for (let i = 0; i < visibleCount; i++) {
      if (elOverview.children[i] !== order[i].el) { inOrder = false; break; }
    }
    if (!inOrder) {
      for (let i = 0; i < visibleCount; i++) {
        elOverview.appendChild(order[i].el);
        order[i].attached = true;
      }
    }

    const overflow = contactOverflowSummary(contacts, visibleCount);
    if (overflow) {
      if (!overviewFooter) {
        overviewFooter = document.createElement('div');
        overviewFooter.className = 'sf-overview-footer';
      }
      setText(overviewFooter, overflow);
      // The footer always trails the rows, so a row move can never land behind it.
      if (!overviewFooterAttached || elOverview.children[visibleCount] !== overviewFooter) {
        elOverview.appendChild(overviewFooter);
        overviewFooterAttached = true;
      }
    } else if (overviewFooterAttached) {
      elOverview.removeChild(overviewFooter);
      overviewFooterAttached = false;
    }
  }

  let _fadeOutTimer = null;

  function resolveReticle() {
    if (!elReticle) elReticle = document.getElementById('aim-reticle');
  }

  // The feedback layer is appended INSIDE #aim-reticle so it inherits the reticle's transform (and
  // its display:none under modals / auto-target) for free — but strictly AFTER the crosshair SVG,
  // because the accuracy bloom scales elReticle.firstElementChild and must keep finding the SVG.
  function ensureReticleFx() {
    if (elReticleFx) return elReticleFx;
    if (!elReticle || typeof elReticle.appendChild !== 'function') return null;
    const fx = document.createElement('div');
    fx.className = 'sf-ret-fx';
    fx.setAttribute('aria-hidden', 'true');   // decorative; the target panel carries the words
    fx.innerHTML =
      '<i class="sf-ret-tick sf-ret-tick--tl"></i><i class="sf-ret-tick sf-ret-tick--tr"></i>' +
      '<i class="sf-ret-tick sf-ret-tick--bl"></i><i class="sf-ret-tick sf-ret-tick--br"></i>' +
      '<i class="sf-ret-ring"></i><i class="sf-ret-pip"></i>';
    elReticle.appendChild(fx);
    elReticleFx = fx;
    return fx;
  }

  function updateReticleFeedback(dt) {
    const fx = ensureReticleFx();
    if (!fx) return;
    // ACQUIRE reads state.player.targetId — the same authoritative field the lock diamond, the
    // target panel, and the wingman radial consume. A dead or unresolvable id is NOT a target, so a
    // stale selection can never leave the reticle claiming a lock on nothing.
    const tid = state.player ? state.player.targetId : null;
    const tgt = tid != null && state.entities ? state.entities.get(tid) : null;
    _retStepInput.targetId = tgt && tgt.alive ? tid : null;
    _retStepInput.hit = _retPendingHit;
    _retStepInput.kill = _retPendingKill;
    _retPendingHit = false;
    _retPendingKill = false;
    _retState = stepReticleFeedback(_retState, dt, _retStepInput);

    setClass(fx, 'is-acquiring', _retState.acquireT > 0);
    setClass(fx, 'is-acquired', _retState.targetId != null);
    setClass(fx, 'is-hit', _retState.hitT > 0);
    setClass(fx, 'is-kill', _retState.killT > 0);
    // Normalised 1 -> 0 lifetimes. JS owns the clock, styles/ui.css owns the look (including both
    // accessibility reductions). Quantised to 1/20 so the deduped writer actually dedups.
    setCssVar(fx, '--sf-ret-hit', (Math.round((_retState.hitT / RETICLE_HIT_S) * 20) / 20).toFixed(2));
    setCssVar(fx, '--sf-ret-kill', (Math.round((_retState.killT / RETICLE_KILL_S) * 20) / 20).toFixed(2));
    setCssVar(fx, '--sf-ret-acquire',
      (Math.round((1 - _retState.acquireT / RETICLE_ACQUIRE_S) * 20) / 20).toFixed(2));
  }

  function updateTargetArcs() {
    const tid = state.player.targetId;
    const tgt = tid != null ? state.entities.get(tid) : null;
    
    if (!tgt || !tgt.alive) {
      setClass(targetArcs, 'visible', false);
      if (!targetArcs.classList.contains('visible')) {
        const cache = targetArcs._sfStyle || (targetArcs._sfStyle = Object.create(null));
        if (cache.display !== 'none' && !_fadeOutTimer) {
          _fadeOutTimer = setTimeout(() => {
            if (!targetArcs.classList.contains('visible')) {
              setDisplay(targetArcs, false);
            }
            _fadeOutTimer = null;
          }, 260);
        }
      }
      return;
    }
    
    if (_fadeOutTimer) {
      clearTimeout(_fadeOutTimer);
      _fadeOutTimer = null;
    }
    
    const p = state.entities.get(state.playerId);
    if (!p || !helpers.worldToScreen) {
      setDisplay(targetArcs, false);
      setClass(targetArcs, 'visible', false);
      return;
    }
    
    const center = projectTargetCenter(tgt.pos);
    if (!center.onScreen) {
      setDisplay(targetArcs, false);
      setClass(targetArcs, 'visible', false);
      return;
    }
    
    const rShield = targetPixelRadius(tgt.pos, tgt.radius + 12, center);
    const rArmor = targetPixelRadius(tgt.pos, tgt.radius + 9, center);
    const rHull = targetPixelRadius(tgt.pos, tgt.radius + 6, center);
    
    if (rShield <= 0) {
      setDisplay(targetArcs, false);
      setClass(targetArcs, 'visible', false);
      return;
    }
    
    setDisplay(targetArcs, true, 'block');
    setClass(targetArcs, 'visible', true);
    
    const size = rShield * 2 + 10;
    setStyle(targetArcs, 'width', `${size}px`);
    setStyle(targetArcs, 'height', `${size}px`);
    setHudScreenTransform(targetArcs, center.x, center.y);

    if (!targetArcsSvg || !targetArcShield || !targetArcArmor || !targetArcHull) return;
    setSvgAttr(targetArcsSvg, 'width', size);
    setSvgAttr(targetArcsSvg, 'height', size);
    setSvgAttr(targetArcsSvg, 'viewBox', `0 0 ${size} ${size}`);
    
    const cx = size / 2;
    const cy = size / 2;
    
    setSvgAttr(targetArcShield, 'cx', cx); setSvgAttr(targetArcShield, 'cy', cy); setSvgAttr(targetArcShield, 'r', rShield);
    setSvgAttr(targetArcArmor, 'cx', cx);  setSvgAttr(targetArcArmor, 'cy', cy);  setSvgAttr(targetArcArmor, 'r', rArmor);
    setSvgAttr(targetArcHull, 'cx', cx);   setSvgAttr(targetArcHull, 'cy', cy);   setSvgAttr(targetArcHull, 'r', rHull);
    
    const shieldFrac = tgt.shieldMax ? Math.max(0, Math.min(1, tgt.shield / tgt.shieldMax)) : 0;
    const armorFrac = tgt.armorMax ? Math.max(0, Math.min(1, tgt.armorHp / tgt.armorMax)) : 0;
    const hullFrac = tgt.hullMax ? Math.max(0, Math.min(1, tgt.hull / tgt.hullMax)) : 0;
    
    function setArc(el, radius, fraction) {
      const c = 2 * Math.PI * radius;
      const maxArc = c * (300 / 360);
      const fill = fraction * maxArc;
      setSvgAttr(el, 'stroke-dasharray', `${fill} ${c}`);
      setSvgAttr(el, 'transform', `rotate(-150 ${cx} ${cy})`);
    }

    setArc(targetArcShield, rShield, shieldFrac);
    setArc(targetArcArmor, rArmor, armorFrac);
    setArc(targetArcHull, rHull, hullFrac);
  }

  // Travel Burn instrument update (D5 / W1-6 / W1-9).
  //
  // Reveal rule (D9.9 progressive disclosure): absent during ordinary flight; present while the
  // drive is spooling/engaged/cooling, or while the ship is closing on its own ceiling under its
  // own steam — the two moments the ceiling and the stopping arc are worth screen space.
  //
  // THE CUE IS ADVISORY ONLY. Nothing in here touches state.input or applies a brake. D9.8 rejects
  // auto-magic arrival and the product direction wants overshoot to stay possible: ignoring BRAKE
  // NOW and sailing past the station IS the gameplay. The route follower auto-brakes; manual does
  // not, and that asymmetry is deliberate.
  const VTAPE_HEADROOM = 1.14;   // scale runs to 114% of V-MAX so the ceiling is a line, not the edge
  function updateTravelTape(p, dtS, slow) {
    if (!vt.root) return;
    if (!travelFlag('travelBurn') || !p) {
      if (_vtapeAlpha !== 0) { _vtapeAlpha = 0; setClass(vt.root, 'sf-vtape--on', false); }
      return;
    }

    const drive = (state.input && state.input.travelDrive) || null;
    const driveState = drive && TRAVEL_DRIVE_STATES.includes(drive.state) ? drive.state : 'off';
    const profile = resolvePropulsionProfile(p, state);
    // Never re-derive the ceiling here: prefer the value the kernel published, else the exported
    // resolver. One owner for the rule (D5's amendment exists because a second copy drifted).
    const ceiling = (drive && Number.isFinite(drive.ceiling) && drive.ceiling > 0)
      ? drive.ceiling
      : resolveTravelCeiling(profile);
    const speed = Math.hypot(p.vel.x, p.vel.z);
    const active = driveState !== 'off';
    const nearCeiling = ceiling > 0 && speed >= ceiling * 0.8;
    const want = active || nearCeiling;

    // Reveal/retire. The CSS opacity+visibility transition does the easing (and is disabled under
    // prefers-reduced-motion); this tracked value only decides when the element is fully retired
    // and can stop being updated at all. Fades out COMPLETELY when neither condition holds — an
    // instrument that reveals and then lingers is a permanent panel with extra steps.
    const rate = Math.max(0, dtS) * 4;
    _vtapeAlpha = want ? Math.min(1, _vtapeAlpha + rate) : Math.max(0, _vtapeAlpha - rate);
    setClass(vt.root, 'sf-vtape--on', want);
    if (!want && _vtapeAlpha <= 0.001) {
      setClass(vt.root, 'sf-vtape--brake', false);
      setClass(vt.root, 'sf-vtape--approach', false);
      _vtapeBrakeOn = false;
      return;
    }

    setAttr(vt.root, 'data-state', driveState);

    // --- tape: current speed against the per-family ceiling ---
    const scale = Math.max(1, ceiling * VTAPE_HEADROOM);
    setScaleX(vt.fill, clamp01(speed / scale));
    setStyle(vt.cap, 'left', (clamp01((drive ? drive.cap : 0) / scale) * 100).toFixed(1) + '%');
    setStyle(vt.vmax, 'left', (clamp01(ceiling / scale) * 100).toFixed(1) + '%');

    if (slow) {
      setText(vt.vmaxText, 'V-MAX ' + Math.round(ceiling));
      // Every state prints its NAME — hue is never the only carrier (WCAG 1.4.1).
      setText(vt.state, driveState === 'off' ? 'DRIVE OFF' : 'DRIVE ' + driveState.toUpperCase());
      let note = '';
      if (driveState === 'spooling') note = 'SPOOLING…';
      else if (driveState === 'engaged') note = Math.round(speed) + ' / ' + Math.round(ceiling) + ' WU/S';
      else if (driveState === 'cooldown') note = 'COOLDOWN' + (drive && drive.breakReason ? ' · ' + String(drive.breakReason).toUpperCase() : '');
      else if (nearCeiling) note = 'AT CEILING';
      const laneStatus = travelTapeLaneStatus(state.travelLanes);
      setText(vt.spool, [note, laneStatus].filter(Boolean).join(' · '));
    }

    // --- approach row: the stopping arc, manual burns only ---
    const nav = state.nav || {};
    const { manual, arrival } = travelTapeNavigationState(nav);

    // The follower auto-brakes, so its arc would be noise. Only a hand-flown approach gets this.
    const cue = (manual && arrival) ? evaluateArrivalCue(p, profile, arrival) : null;
    const showArc = !!(cue && cue.active && Number.isFinite(cue.distance));
    setClass(vt.root, 'sf-vtape--approach', showArc);

    if (showArc) {
      // The arc reads as a span: how far the ship WILL travel before rest, against where the
      // arrival ring actually sits. When the stop span overruns the ring, you are overshooting.
      const span = Math.max(cue.distance, cue.stopDistance, 1) * 1.1;
      setStyle(vt.arcStop, 'width', (clamp01(cue.stopDistance / span) * 100).toFixed(1) + '%');
      setStyle(vt.arcRing, 'left', (clamp01(cue.distance / span) * 100).toFixed(1) + '%');
      setClass(vt.root, 'sf-vtape--overshoot', !!cue.overshoot);
      if (slow) {
        setText(vt.arcLabel, cue.overshoot
          ? 'OVERSHOOT · STOP ' + Math.round(cue.stopDistance) + ' WU / ARRIVAL ' + Math.round(cue.distance) + ' WU'
          : 'STOP ' + Math.round(cue.stopDistance) + ' WU · ARRIVAL ' + Math.round(cue.distance)
            + ' WU · ' + String(cue.bestMode).replace('-', ' ').toUpperCase());
      }
    }

    // --- BRAKE NOW ---
    const brakeOn = !!(cue && cue.brakeNow);
    if (brakeOn !== _vtapeBrakeOn) {
      _vtapeBrakeOn = brakeOn;
      setClass(vt.root, 'sf-vtape--brake', brakeOn);
      // role=alert announces once on reveal; keep the node in the tree so it is not re-announced
      // every frame while the condition persists.
      if (vt.brake) setAttr(vt.brake, 'aria-hidden', brakeOn ? 'false' : 'true');
    }
  }

  function updateDockAssistHint(p) {
    const model = dockingAssistHintModel(state, dockAssistModel);
    if (!model.visible || !p || !p.pos || !helpers || typeof helpers.worldToScreen !== 'function') {
      setHidden(dockAssistHint, true);
      return;
    }
    dockAssistPlayerWorld.x = Number(p.pos.x) || 0;
    dockAssistPlayerWorld.z = Number(p.pos.z) || 0;
    dockAssistBerthWorld.x = Number(model.berth.x) || 0;
    dockAssistBerthWorld.z = Number(model.berth.z) || 0;
    const playerScreen = helpers.worldToScreen(dockAssistPlayerWorld, dockAssistPlayerScreen);
    const berthScreen = helpers.worldToScreen(dockAssistBerthWorld, dockAssistBerthScreen);
    const geometry = dockingAssistScreenGeometry(playerScreen, berthScreen, dockAssistGeometry);
    if (!geometry.visible) {
      setHidden(dockAssistHint, true);
      return;
    }
    setHidden(dockAssistHint, false);
    setClass(dockAssistHint, 'is-assisting', model.assisting);
    setClass(dockAssistHint, 'is-aligning', !model.headingOk);
    setStyle(dockAssistHint, 'transform', `translate3d(${geometry.x.toFixed(1)}px,${geometry.y.toFixed(1)}px,0)`);
    setStyle(dockAssistLine, 'width', `${geometry.length.toFixed(1)}px`);
    setStyle(dockAssistLine, 'transform', `rotate(${geometry.angleDeg.toFixed(1)}deg)`);
    setStyle(dockAssistBerth, 'transform', `translate3d(${geometry.dx.toFixed(1)}px,${geometry.dy.toFixed(1)}px,0) rotate(45deg)`);
    setStyle(dockAssistLabel, 'transform', `translate3d(${geometry.labelDx.toFixed(1)}px,${geometry.labelDy.toFixed(1)}px,0)`);
    setText(dockAssistLabel, model.label);
    setAttr(dockAssistHint, 'aria-label', `${model.label.toLowerCase()}, ${Math.round(Math.hypot(
      dockAssistBerthWorld.x - dockAssistPlayerWorld.x,
      dockAssistBerthWorld.z - dockAssistPlayerWorld.z,
    ))} world units`);
  }

  function frame(dt) {
    const frameDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 1 / 60;
    const numericDt = consumeHudClock(numericClock, frameDt);
    const targetDt = consumeHudClock(targetClock, frameDt);
    const overlayDt = consumeHudClock(overlayClock, frameDt);
    const radarDt = consumeHudClock(radarClock, frameDt);
    const overviewTick = consumeContactRosterClock(overviewClock, frameDt);
    const slow = numericDt > 0;
    const targetTick = targetDt > 0;
    const overlayTick = overlayDt > 0;
    const radarTick = radarDt > 0;

    const p = state.entities.get(state.playerId);
    resolveReticle();
    updateReticleFeedback(frameDt);
    updateDoctrineTells(frameDt);
    if (overlayTick || slow) updateDockAssistHint(p);

    // --- schematic + arcs + micro-bars (every frame, transform/stroke only) ---
    if (p) {
      const hullFrac = p.hullMax ? clamp01(p.hull / p.hullMax) : 0;
      const shieldFrac = p.shieldMax ? clamp01(p.shield / p.shieldMax) : 0;
      const capFrac = p.capMax ? clamp01(p.cap / p.capMax) : 0;
      const wpnHeat = weaponHeatSummary(p.data && p.data.weapons, weaponHeatScratch);
      const heatFrac = wpnHeat.frac;

      // Ship schematic (dual-color flask fill level + shield ring via stroke-dashoffset).
      // Use a resolved percentage token rather than CSS multiplication. The latter is not
      // consistently accepted by the Chromium versions used by browser and Electron builds,
      // which can leave the damage fill stuck at its fallback height.
      setCssVar(schematic, '--hull-pct', `${(hullFrac * 100).toFixed(1)}%`);
      setStyle(schShield, 'strokeDashoffset', (SHIELD_RING_LEN * (1 - shieldFrac)).toFixed(1));
      setClass(schematic, 'sf-sch-critical', hullFrac < 0.25);
      setClass(schematic, 'sf-sch-warning', hullFrac >= 0.25 && hullFrac < 0.55);
      setClass(schematic, 'sf-sch-shield-low', shieldFrac < 0.25);
      setClass(bars, 'sf-condition-critical', hullFrac < 0.25);
      setClass(bars, 'sf-condition-shield-low', shieldFrac < 0.25 && hullFrac >= 0.25);

      // Critical-hull treatment: armed by hull AND by still being under fire, released after
      // HULL_CRIT_CALM_S damage-free seconds. sf-condition-critical above stays a pure condition
      // class (it must keep tracking hull alone); this is the separate, self-clearing emphasis.
      _sinceHullDamage = Math.min(_sinceHullDamage + frameDt, 1e6);
      const hullCrit = hullCriticalTreatmentActive(hullFrac, _sinceHullDamage);
      setClass(schematic, 'sf-hullcrit-armed', hullCrit);
      setClass(bars, 'sf-hullcrit-armed', hullCrit);

      setScaleX(fillEls.energy, capFrac);
      setScaleX(fillEls.heat, heatFrac);

      // Phase 3 boost micro-bar: energy fraction; the row is hidden entirely if the ship can't boost.
      // When a dash is ready (cooldown elapsed + enough energy) the bar gets a 'ready' glow.
      const boost = p.boost;
      const boostRow = rowEls.boost;
      if (boost && boost.max > 0 && boostRow) {
        setStyle(boostRow, 'display', '');
        const bf = clamp01(boost.energy / boost.max);
        setScaleX(fillEls.boost, bf);
        const dashCost = Number.isFinite(boost.dashCost) ? boost.dashCost : 28;
        const dashReady = boost.dashImpulse > 0 && boost.dashCdT <= 0 && boost.energy >= dashCost;
        setClass(fillEls.boost && fillEls.boost.parentElement, 'sf-bar--ready', dashReady);
        // Third consumer of the same gauge (W1-4). CAVEAT, stated rather than implied: the burn is
        // currently shown on this pool but does not yet SPEND from it — a travel-drive energy
        // demand would have to be produced as `resourceDelta` by the propulsion kernel, which this
        // packet does not own. So this marks the gauge the burn belongs to; it is not yet a drain.
        const burning = !!(travelFlag('travelBurn') && state.input && state.input.travelDrive
          && state.input.travelDrive.state === 'engaged');
        setClass(fillEls.boost && fillEls.boost.parentElement, 'sf-bar--burn', burning);
        if (slow) setText(numEls.boost, Math.round(bf * 100) + (burning ? ' ⟫' : (dashReady ? ' ▸' : '%')));
      } else if (boostRow) {
        setStyle(boostRow, 'display', 'none');   // no boost capacity (e.g. a stripped hull) — hide the row
      }

      const heatRow = rowEls.heat;
      if (heatRow) {
        const heatHot = !!(wpnHeat.armed && (heatFrac > 0.04 || wpnHeat.overheated));
        setStyle(heatRow, 'display', heatHot ? '' : 'none');
        setClass(heatRow.querySelector('.sf-bar'), 'sf-bar--overheated', wpnHeat.overheated);
      }
      setClass(fillEls.energy && fillEls.energy.parentElement, 'sf-bar--low', capFrac < 0.2 && capFrac > 0);

      // contextual low alerts via alerts module
      syncSafetyAlerts(p, hullFrac, shieldFrac);

      if (slow) {
        const showHull = vitalNumericVisible(hullFrac);
        const showShield = vitalNumericVisible(shieldFrac);
        if (schHullVal) setText(schHullVal, Math.max(0, Math.round(p.hull)) + '');
        if (schShdVal) setText(schShdVal, Math.max(0, Math.round(p.shield)) + '');
        if (schHullStat) schHullStat.hidden = !showHull;
        if (schShdStat) schShdStat.hidden = !showShield;
        setText(numEls.energy, Math.max(0, Math.round(p.cap)) + '');
        setText(numEls.heat, wpnHeat.pct + '%');
        // Phase 4 fuel gauge: low fuel flashes a warning.
        const fuel = state.fuel || { current: 100, max: 100 };
        const fuelFrac = fuel.max > 0 ? clamp01(fuel.current / fuel.max) : 1;
        if (fillEls.fuel) setScaleX(fillEls.fuel, fuelFrac);
        if (numEls.fuel) setText(numEls.fuel, Math.round(fuelFrac * 100) + '%');
        if (rowEls.fuel) setClass(rowEls.fuel, 'sf-fuel--low', fuelFrac < 0.25);
      }

      // FR-1: prograde tick — where inertia is carrying us, projected each frame. Fades below
      // 2 wu/s so a stationary ship shows nothing (never animates at rest).
      {
        const vel = p.vel;
        const spd = vel ? Math.hypot(vel.x, vel.z) : 0;
        const wantA = spd > 2 ? 0.9 : 0;
        _proAlpha += (wantA - _proAlpha) * (1 - Math.exp(-6 * frameDt));
        if (_proAlpha <= 0.02 || !helpers.worldToScreen) {
          setOpacity(proTick, '0');
        } else {
          const k = (p.radius || 6) * 3;
          const inv = 1 / (spd || 1);
          const ux = vel.x * inv, uz = vel.z * inv;
          progradeWorldA.x = p.pos.x;
          progradeWorldA.y = 0;
          progradeWorldA.z = p.pos.z;
          progradeWorldB.x = p.pos.x + ux * k;
          progradeWorldB.y = 0;
          progradeWorldB.z = p.pos.z + uz * k;
          const A = helpers.worldToScreen(progradeWorldA, progradeScreenA);
          const B = helpers.worldToScreen(progradeWorldB, progradeScreenB);
          let dx = B.x - A.x, dy = B.y - A.y;
          const dl = Math.hypot(dx, dy);
          if (A.onScreen && dl > 0.001) {
            dx /= dl; dy /= dl;
            const ang = Math.atan2(dy, dx) * 180 / Math.PI;
            progradeTransformOptions.rotate = ang;
            setHudScreenTransform(proTick, A.x + dx * 40, A.y + dy * 40, progradeTransformOptions);
            setOpacity(proTick, _proAlpha.toFixed(3));
          } else {
            setOpacity(proTick, '0');
          }
        }
      }
    }

    updateTravelTape(p, frameDt, slow);

    // --- speed (numerics @10Hz) — THR/STOP live in the SPD hover tip now (HUD 2.0) ---
    if (slow && p) {
      const vx = p.vel && Number.isFinite(p.vel.x) ? p.vel.x : 0;
      const vz = p.vel && Number.isFinite(p.vel.z) ? p.vel.z : 0;
      const sp = Math.hypot(vx, vz);
      setText(elSpeed, Math.round(sp) + '');
      // Tether readout: status + target while latched. Control chips paint separately so the
      // instrument value never becomes a rebind encyclopedia that overflows the deck.
      const localTether = state.player && state.player.tether;
      const remoteTether = state.player && state.player.remoteMassline;
      const tether = localTether && localTether.active ? localTether : remoteTether;
      const ml = masslineInstrumentReadout(tether);
      const latching = masslineInstrumentVisible(tether);
      if (document.body && document.body.dataset) {
        document.body.dataset.sfHudJob = hudJobFromState(state, tether);
      }
      setClass(commandDeck, 'sf-command-deck--latch', latching);
      if (masslineInstrument) masslineInstrument.hidden = !latching;
      if (latching && ml) {
        if (mlFill) setStyle(mlFill, 'transform', `scaleX(${ml.load.toFixed(3)})`);
        if (mlLen) setText(mlLen, Math.round(ml.length) + 'u');
        if (mlRel) mlRel.hidden = !ml.releaseOpen;
        if (elTetherStat) {
          const tetherStatus = masslineTetherStatus(tether);
          setStyle(elTetherStat, 'display', '');
          setText(elTether, tetherStatus.text);
          setClass(elTether, 'sf-warn', tetherStatus.warn);
        }
      } else if (elTetherStat) {
        setStyle(elTetherStat, 'display', 'none');
      }
      const ws = p.data && p.data.weapons;
      const nGuns = ws ? ws.length : 0;
      const auto = !!(state.input && state.input.autoFire);
      const primary = nGuns === 1 ? (ws[0].name || ws[0].defId || '1 gun') : (nGuns + ' guns');
      setText(elWeapons, primary + (auto ? ' · AUTO-TGT' : ''));
      setClass(elWeapons, 'sf-warn', auto);
      if (elReticle) setClass(elReticle, 'autofire', auto);
      // Reticle accuracy bloom: decay _recoilBloom toward 0 and scale the inner SVG. Sustained fire
      // expands the crosshair (1 -> 1.25); it contracts as you stop. Purely cosmetic readability.
      _recoilBloom = Math.max(0, _recoilBloom - frameDt * 2.2);
      if (elReticle) {
        const inner = elReticle.firstElementChild;
        if (inner) setStyle(inner, 'transform', `scale(${(1 + _recoilBloom * 0.25).toFixed(3)})`);
      }
      // Class/archetype label: surfaces the ship's role + drive family so the player feels the
      // archetype and propulsion switch when they buy a new hull. Updates cheaply each slow tick.
      const defId = p.data && p.data.defId;
      if (defId !== lastDefId) {
        const isFirst = lastDefId === undefined;
        lastDefId = defId;
        const def = SHIP_BY_ID.get(defId);
        if (def) {
          const drive = driveFamilyFor(def);
          setText(elRole, def.name + ' · ' + (ROLE_LABEL[def.role] || def.role || 'Ship') + (drive ? ' · ' + drive : ''));
          if (!isFirst) chipShow('role', 6000);   // new hull — worth a moment on screen
        } else {
          setText(elRole, '—');
        }
      }
    }

    // --- mission tracker @10Hz ---
    if (slow) {
      // Resolve corridor fallback once, then let the owner resolver keep mission/nav data disjoint.
      const navWaypoint = state.nav && state.nav.waypoint;
      const wp = navWaypoint || buildCorridorOpeningWaypoint(state);
      const onboardingVerb = navWaypoint && navWaypoint.reason;
      const command = resolveFlightObjectiveCommand(state, wp);
      const dest = flightDestinationSurface(state, command);
      setDisplay(mtTitle, false);
      setDisplay(mtTime, false);
      if (!dest.show) {
        setDisplay(missionTracker, false);
      } else {
        setText(mtObj, dest.line);
        setClass(mtTime, 'sf-mt-urgent', dest.urgent);
        setDisplay(missionTracker, true);
      }
    }

    // --- credits / cargo / objectives (event-driven, applied lazily) ---
    if (creditsDirty) refreshCredits();
    if (cargoDirty) refreshCargo();
    if (objDirty) refreshObjectives();
    // advance the credit count-up tween (no-op when at rest)
    if (slow) tickCreditsTween(numericDt || frameDt);

    // --- target panel: DOM/compositor surface; update on a fixed HUD cadence ---
    if (targetTick) {
      const tgtId = (state.player || {}).targetId;
      const target = tgtId != null ? state.entities.get(tgtId) : null;
      const player = state.entities.get(state.playerId);
      const combatRelevant = target && (target.type === 'ship' || target.type === 'drone')
        && isHostileToPlayer(target, player ? player.team : 0, state);
      const miningRelevant = target && target.type === 'asteroid';
      const routeOwnsAttention = !!(state.nav && state.nav.waypoint);
      let weakPoint = null;
      if (tgtId != null && revealedWeakPoints.size) {
        const wp = revealedWeakPoints.get(tgtId);
        if (wp && (!wp.until || (state.simTime || 0) < wp.until)) weakPoint = wp;
        else if (wp) revealedWeakPoints.delete(tgtId);
      }
      if (routeOwnsAttention && target && !combatRelevant && !miningRelevant) {
        setDisplay(targetPanel.el, false);
      } else {
        targetPanelUpdateOptions.slow = slow;
        targetPanelUpdateOptions.weakPoint = weakPoint;
        targetPanel.update(targetPanelUpdateOptions);
      }
    }

    // --- combat HUD: lock ring, weapon heat bars, target diamond (every frame for heat reactivity) ---
    updateCombatHud(p, slow);

    // --- world-space DOM overlays: batch transform/opacity writes ---
    if (overlayTick) floatingText.update(overlayDt || frameDt);

    // --- radar: canvas redraws are explicit, not tied to every render frame ---
    if (radarTick) radar.draw();

    // directional damage indicators advance + reposition on the overlay cadence.
    if (overlayTick) dmgInd.tick(overlayDt || frameDt, helpers);

    // --- off-screen objective arrow ---
    if (overlayTick || slow) updateObjectiveArrow(p, slow);
    if (overlayTick || slow) updateFirstUseHint(p);
    if (slow) placeReceiptLane();

    // --- toasts/alerts expiry sweep ---
    if (alerts && alerts.tick) alerts.tick();
    // --- HUD meta-arc (STABLE LOAD line, tag flicker, manifest ghost) ---
    if (overlayTick && hudMeta && hudMeta.tick) hudMeta.tick(overlayDt || frameDt);

    // --- Target Arcs: update every frame for smooth 3D tracking ---
    updateTargetArcs();

    // --- Overview Strip: elapsed-time cadence stays at <=5 Hz at any render refresh rate. ---
    if (overviewTick) updateOverview();
  }

  function tickHidden(dt) {
    const p = state.entities.get(state.playerId);
    syncSafetyAlerts(p);
    if (alerts && alerts.tick) alerts.tick();
  }

  function resolveNavStation(nw) {
    if (!nw || !nw.stationId) return null;
    const index = state.entityIndex;
    const indexVersion = index && index.__spacefaceEntityIndexV1 ? (index.version || 0) : -1;
    const listLength = indexVersion >= 0 ? -1 : state.entityList.length;
    if (
      cachedNavStationId === nw.stationId &&
      cachedNavIndexVersion === indexVersion &&
      cachedNavListLength === listLength &&
      cachedNavEntity &&
      cachedNavEntity.alive !== false &&
      cachedNavEntity.type === 'station'
    ) {
      return cachedNavEntity;
    }
    cachedNavStationId = nw.stationId;
    cachedNavIndexVersion = indexVersion;
    cachedNavListLength = listLength;
    cachedNavEntity = resolveHudNavStation(state, nw.stationId);
    return cachedNavEntity;
  }

  function updateObjectiveArrow(p, slow) {
    // Priority: durable nav waypoint (mission/trade/story), else legacy mission-local waypoint.
    const tracked = state.ui.trackedMissionId;
    const objectiveOwnsAttention = !!tracked || !!(state.nav && state.nav.waypoint);
    const active = (state.missions && state.missions.active) || [];
    const m = tracked ? active.find((x) => x.id === tracked) : active[0];
    let wp = null, wpLabel = null, navMeta = null;
    if (state.nav && state.nav.waypoint) {
      const nw = state.nav.waypoint;
      let livePos = null;
      if (nw.stationId) {
        const station = resolveNavStation(nw);
        if (station) livePos = station.pos;
      }
      const pos = livePos || resolveWaypointPresentationPosition(state, nw);
      wpLabel = nw.label || nw.reason || nw.sectorName || 'Waypoint';
      navMeta = nw;
      if (pos) wp = pos;
    }
    if (!wp && m) {
      wp = m.waypoint || m.targetPos || (m.objectives && m.objectives[0] && m.objectives[0].pos) || null;
      wpLabel = wpLabel || m.title || m.name || 'Mission';
    }
    if (!wp && navMeta) {
      setDisplay(arrow, false);
      setDisplay(elNavReadout, false);
      // Cross-sector guidance already lives in the dominant ACTIVE OBJECTIVE tracker.
      setClass(elNavReadout, 'sf-nav--lock', false);
      return;
    }
    if (!wp || !p || !helpers.worldToScreen) {
      setDisplay(arrow, false);
      setDisplay(elNavReadout, false);
      lastNavLabel = '';
      lastObjectiveMarkerText = '';
      return;
    }
    objectiveProjectionWorld.x = wp.x;
    objectiveProjectionWorld.y = 0;
    objectiveProjectionWorld.z = wp.z;
    const proj = helpers.worldToScreen(objectiveProjectionWorld, objectiveProjectionScreen);
    // distance + ETA readout (always shown while a nav target is set)
    const dist = Math.hypot(wp.x - p.pos.x, wp.z - p.pos.z);
    const speed = Math.hypot(p.vel.x, p.vel.z);
    const etaS = speed > 5 ? dist / speed : Infinity;
    // A mission/navigation fix is not a combat target lock. Keep this legacy readout hidden while
    // the active-objective tracker owns the same label/distance; the off-screen arrow still guides.
    setDisplay(elNavReadout, false);
    setClass(elNavReadout, 'sf-nav--lock', false);
    const label = wpLabel || '—';
    setTitle(arrow, label);
    if (label !== lastNavLabel) { setText(elNavLabel, label); lastNavLabel = label; }
    objectiveWaypointRecord.pos = wp;
    const travel = objectiveTravelReadout(state, objectiveWaypointRecord, objectiveTravelRecord);
    const conciseLabel = String(label).replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 28) || 'OBJECTIVE';
    const markerText = `GOAL · ${conciseLabel} · ${travel.distanceText} · ${travel.etaText}`;
    if (markerText !== lastObjectiveMarkerText) {
      setText(arrowLabel, markerText);
      setAttr(arrow, 'aria-label', `Current objective: ${conciseLabel}, ${travel.distanceText}, ${travel.etaText}`);
      lastObjectiveMarkerText = markerText;
    }
    if (slow || !lastNavDist) {
      const distText = Math.round(dist) + ' u';
      const etaText = isFinite(etaS) ? (etaS < 60 ? Math.round(etaS) + 's' : Math.round(etaS / 60) + 'm') : '—';
      if (distText !== lastNavDist) { setText(elNavDist, distText); lastNavDist = distText; }
      if (etaText !== lastNavEta) { setText(elNavEta, etaText); lastNavEta = etaText; }
    }
    const w = window.innerWidth, h = window.innerHeight;
    if (proj.onScreen) {
      const x = Math.max(18, Math.min(w - 18, proj.x));
      const y = Math.max(18, Math.min(h - 18, proj.y));
      const overlapsLeftAnchor = x < 370 && y > h - 340;
      const overlapsRightAnchor = x > w - 270 && y > h - 470;
      const overlapsActionAnchor = y > h - 125 && x > w * 0.28 && x < w * 0.72;
      setClass(arrow, 'sf-objarrow--onscreen', true);
      setClass(arrow, 'sf-objarrow--edge', false);
      setClass(arrow, 'sf-objarrow--compact', true);
      setDataEdge(arrow, x > w * 0.62 ? 'right' : (y < 62 ? 'top' : 'left'));
      setStyle(arrow, 'transform', `translate3d(${x}px,${y}px,0)`);
      setDisplay(arrow, true);
      return;
    }
    const edgePlacement = resolveObjectiveEdgePlacement(w, h, p, wp, 34, objectiveEdgeRecord);
    if (!edgePlacement) {
      setDisplay(arrow, false);
      return;
    }
    setClass(arrow, 'sf-objarrow--edge', true);
    setClass(arrow, 'sf-objarrow--onscreen', false);
    const edgeOverlapsLeftAnchor = edgePlacement.x < 370 && edgePlacement.y > h - 400;
    const edgeOverlapsRightAnchor = edgePlacement.x > w - 300 && edgePlacement.y > h - 520;
    const edgeOverlapsActionAnchor = edgePlacement.y > h - 135
      && edgePlacement.x > w * 0.27 && edgePlacement.x < w * 0.73;
    setClass(arrow, 'sf-objarrow--compact', true);
    setDataEdge(arrow, edgePlacement.edge);
    setCssVar(arrow, '--sf-arrow-angle', `${edgePlacement.angleRad}rad`);
    setDisplay(arrow, true);
    setStyle(arrow, 'transform', `translate3d(${edgePlacement.x}px,${edgePlacement.y}px,0)`);
  }

  function placeReceiptLane() {
    const laneRoot = document.getElementById('toasts');
    if (!laneRoot) return;
    const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const h = typeof window !== 'undefined' ? window.innerHeight : 720;
    const layout = resolveObjectiveHudLayout(w, h);
    const lane = layout.receipt;
    if (!lane) return;
    setStyle(laneRoot, 'left', `${Math.round(lane.x)}px`);
    setStyle(laneRoot, 'top', `${Math.round(lane.y)}px`);
    setStyle(laneRoot, 'width', `${Math.round(lane.width)}px`);
    setStyle(laneRoot, 'bottom', 'auto');
    setStyle(laneRoot, 'right', 'auto');
    setStyle(laneRoot, 'transform', 'none');
  }

  function updateFirstUseHint(player) {
    if (!firstUseHint) {
      if (!firstUse.hidden) firstUse.hidden = true;
      return;
    }
    if ((state.simTime || 0) > firstUseHint.until) {
      firstUseHint = null;
      firstUse.hidden = true;
      return;
    }
    firstUse.hidden = false;
    firstUse.textContent = firstUseHint.text;
    let pos = player && player.pos;
    if (firstUseHint.entityId != null && state.entities && state.entities.get) {
      const ent = state.entities.get(firstUseHint.entityId);
      if (ent && ent.pos) pos = ent.pos;
    } else if (firstUseHint.kind === 'station' && state.nav && state.nav.waypoint && state.nav.waypoint.pos) {
      pos = state.nav.waypoint.pos;
    }
    if (!pos || !helpers.worldToScreen) {
      firstUse.hidden = firstUseHint.kind !== 'player';
      return;
    }
    const proj = helpers.worldToScreen({ x: pos.x, y: 0, z: pos.z });
    if (!proj) {
      firstUse.hidden = firstUseHint.kind !== 'player';
      return;
    }
    const x = proj.onScreen ? proj.x : Math.max(24, Math.min((typeof window !== 'undefined' ? window.innerWidth : 1280) - 24, proj.x));
    const y = proj.onScreen ? proj.y - 28 : Math.max(24, Math.min((typeof window !== 'undefined' ? window.innerHeight : 720) - 24, proj.y));
    setHudScreenTransform(firstUse, x, y);
  }

  function setVisible(v) {
    setDisplay(root, !!v, 'block');
    if (hudMeta && hudMeta.setVisible) hudMeta.setVisible(v);
  }

  function forceRefresh() {
    creditsDirty = true;
    cargoDirty = true;
    objDirty = true;
    forceHudClock(numericClock);
    forceHudClock(targetClock);
    forceHudClock(overlayClock);
    forceHudClock(radarClock);
    lastDefId = null;
    lastNavDist = '';
    lastNavEta = '';
    if (radar.invalidate) radar.invalidate();
    if (targetPanel.forceRefresh) targetPanel.forceRefresh();
  }

  return {
    frame, tickHidden, forceRefresh, setVisible, refreshCredits, refreshCargo, refreshObjectives,
    destroy() { objectiveHudDrag.destroy(); },
  };
}
