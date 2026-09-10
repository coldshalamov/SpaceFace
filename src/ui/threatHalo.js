import { contactThreatTier, isHostileToPlayer, SCANNER_CONTACT_RANGE } from '../systems/scanner.js';
import {
  OCCUPATIONAL_ROLE_IDS,
  OCCUPATIONAL_SILHOUETTE_TOKENS,
  OCCUPATIONAL_SILHOUETTE_RULES,
  getOccupationalSilhouetteRule,
  forceChannelForTelegraphKind,
  getForcePaletteHex,
} from '../data/palettes.js';

export {
  OCCUPATIONAL_ROLE_IDS,
  OCCUPATIONAL_SILHOUETTE_TOKENS,
  OCCUPATIONAL_SILHOUETTE_RULES,
  getOccupationalSilhouetteRule,
};

export function resolveEntityOccupationalRule(entity) {
  if (!entity) return null;
  const data = entity.data || {};
  const candidates = [
    entity.occupationalRole,
    data.occupationalRole,
    entity.role,
    data.role,
    data.trafficRole,
    data.jobRole,
    data.craftId,
    entity.ship,
    data.ship,
  ];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (c && typeof c === 'string') {
      const rule = getOccupationalSilhouetteRule(c);
      if (rule) return rule;
    }
  }
  return null;
}

export function getThreatHaloSilhouetteToken(entity) {
  const rule = resolveEntityOccupationalRule(entity);
  return rule ? rule.silhouetteToken : 'token_silhouette_standard';
}

/** Leftover doctrine / mine / snare kinds the halo may paint. One cue, then it expires. */
export const LEFTOVER_TELEGRAPH_KINDS = Object.freeze([
  'engine_flare',
  'weapon_charge',
  'attach_spool',
  'wake_mines',
]);

export const TELEGRAPH_CUE_TICKS = 30;
export const TELEGRAPH_PAIR_MIN_TICKS = 30;
export const TELEGRAPH_PAIR_MAX_TICKS = 60;

// Continuous hazards (mines, snares) stay lit from placement to trigger instead of pulsing once.
// Their event rows may declare durationTicks so death correlation can tell "still lit" from a stale
// placement row no one can see anymore.
export const CONTINUOUS_TELEGRAPH_KINDS = new Set(['wake_mines', 'attach_spool']);

const TELEGRAPH_KIND_SET = new Set(LEFTOVER_TELEGRAPH_KINDS);
const COMPAT_ATTACK_KINDS = new Set(['attackRun', 'alphaStrike']);
const SLOT_TELEGRAPH_CLASS = 'sf-threat-halo__slot--telegraph';

export function leftoverTelegraphKind(payload) {
  if (!payload) return null;
  const raw = String(payload.kind || payload.cue || '');
  if (TELEGRAPH_KIND_SET.has(raw)) return raw;
  if (raw === 'mine') return 'wake_mines';
  if (raw === 'transverse_snare') return 'attach_spool';
  if (COMPAT_ATTACK_KINDS.has(raw)) return 'engine_flare';
  const doctrineId = String(payload.doctrineId || '');
  if (doctrineId === 'interceptor_flyby' || doctrineId === 'brawler_commit' || doctrineId === 'escort_screen'
      || doctrineId === 'capital_broadside') {
    return 'engine_flare';
  }
  if (doctrineId === 'tether_control_raider' || doctrineId === 'field_anchor_controller') return 'attach_spool';
  if (doctrineId === 'ranged_disengager') return 'weapon_charge';
  return null;
}

function telegraphIdsOf(payload) {
  if (!payload) return [];
  const ids = [];
  if (payload.entityId != null) ids.push(payload.entityId);
  if (payload.mineId != null) ids.push(payload.mineId);
  if (payload.actorId != null) ids.push(payload.actorId);
  if (payload.sourceId != null) ids.push(payload.sourceId);
  if (payload.ownerId != null) ids.push(payload.ownerId);
  return ids;
}

/**
 * Pair a leftover player death with a leftover ai:telegraph 30–60 ticks earlier
 * whose entityId / mineId matches the killer. Same-breath inject does not pair.
 * Continuous hazards (wake_mines / attach_spool) may declare durationTicks: they pair when the
 * announcement led the death by ≥ minLead and the cue was still lit inside the final
 * maxLead window — a mine telegraphed 2 s ahead counts, a stale unlit placement does not.
 */
export function pairLeftoverDeathTelegraph(death, telegraphs, opts = {}) {
  if (!death || !Array.isArray(telegraphs) || telegraphs.length === 0) return null;
  const minLead = Number.isFinite(opts.minLeadTicks) ? opts.minLeadTicks : TELEGRAPH_PAIR_MIN_TICKS;
  const maxLead = Number.isFinite(opts.maxLeadTicks) ? opts.maxLeadTicks : TELEGRAPH_PAIR_MAX_TICKS;
  const deathTick = Number.isInteger(death.tick) ? death.tick : (death.tick | 0);
  const killerId = death.killerId != null ? death.killerId
    : (death.attackerId != null ? death.attackerId : null);
  const mineId = death.mineId != null ? death.mineId
    : (death.origin && death.origin.kind === 'mine' ? death.origin.id : null);
  if (killerId == null && mineId == null) return null;

  let best = null;
  for (let i = 0; i < telegraphs.length; i++) {
    const tg = telegraphs[i];
    if (!tg) continue;
    const tgTick = Number.isInteger(tg.tick) ? tg.tick : (Number.isFinite(tg.tick) ? (tg.tick | 0) : NaN);
    if (!Number.isInteger(tgTick)) continue;
    const kind = leftoverTelegraphKind(tg);
    const lead = deathTick - tgTick;
    if (CONTINUOUS_TELEGRAPH_KINDS.has(kind)) {
      const duration = Number(tg.durationTicks);
      const liveUntil = Number.isFinite(duration) && duration > 0 ? tgTick + duration : tgTick;
      if (lead < minLead || tgTick > deathTick) continue;
      if (liveUntil < deathTick - maxLead) continue;
    } else if (lead < minLead || lead > maxLead) {
      continue;
    }
    const ids = telegraphIdsOf(tg);
    const matched = (killerId != null && ids.includes(killerId))
      || (mineId != null && ids.includes(mineId));
    if (!matched) continue;
    if (!best || tgTick > best.tick) {
      best = {
        kind,
        tick: tgTick,
        leadTicks: lead,
        entityId: tg.entityId != null ? tg.entityId : null,
        mineId: tg.mineId != null ? tg.mineId : null,
      };
    }
  }
  return best;
}

function telegraphDurationTicks(payload) {
  const raw = Number(payload && payload.durationTicks);
  if (Number.isFinite(raw) && raw > 0) return Math.max(TELEGRAPH_CUE_TICKS, Math.floor(raw));
  return TELEGRAPH_CUE_TICKS;
}

function liveHazardDurationTicks(tick, startedTick) {
  const started = Number.isInteger(startedTick) ? startedTick : 0;
  const age = Number.isInteger(tick) ? tick - started : 0;
  return Math.max(TELEGRAPH_CUE_TICKS, Math.max(0, age) + 1);
}

function placedTickFromSimTime(state, placedAt) {
  const tick = Number.isInteger(state && state.tick) ? state.tick : 0;
  const now = Number.isFinite(state && state.simTime) ? state.simTime : 0;
  if (!Number.isFinite(placedAt)) return tick;
  const ageTicks = Math.round((now - placedAt) * 60);
  return tick - Math.max(0, ageTicks);
}


const HOSTILE_LIMIT = 4;
const MISSILE_LIMIT = 3;
const TOTAL_LIMIT = HOSTILE_LIMIT + MISSILE_LIMIT;
const HALO_RANGE = SCANNER_CONTACT_RANGE;
const HALO_RANGE_SQ = HALO_RANGE * HALO_RANGE;

const EDGE_BAND_PX = 24;
const EDGE_CENTER_PX = EDGE_BAND_PX * 0.5;
const EDGE_GAP_PX = 4;

const ARC_SPAN_PX = 54;
const ARC_DEPTH_PX = 18;
const MISSILE_SIZE_PX = 22;

const HOSTILE_OPACITY_BASE = 0.55;
const HOSTILE_OPACITY_MAX = 0.9;
const HOSTILE_CLOSING_FOR_MAX = 180;

const EDGE_TOP = 'top';
const EDGE_RIGHT = 'right';
const EDGE_BOTTOM = 'bottom';
const EDGE_LEFT = 'left';

function clamp(value, min, max) {
  return value < min ? min : (value > max ? max : value);
}

function rectsOverlap(ax, ay, aw, ah, rect) {
  return ax < rect.x + rect.width
    && ax + aw > rect.x
    && ay < rect.y + rect.height
    && ay + ah > rect.y;
}

function edgeToIndex(edge) {
  if (edge === EDGE_TOP) return 0;
  if (edge === EDGE_RIGHT) return 1;
  if (edge === EDGE_BOTTOM) return 2;
  return 3;
}

function betterHostile(aTier, aDist, bTier, bDist) {
  return aTier > bTier || (aTier === bTier && aDist < bDist);
}

function worseHostile(aTier, aDist, bTier, bDist) {
  return aTier < bTier || (aTier === bTier && aDist > bDist);
}

function buildMissileGlyph() {
  return '<svg class="sf-threat-halo__chev" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
    + '<path d="M3 5 L11 13 L19 5"/>'
    + '<path d="M5 11 L11 17 L17 11"/>'
    + '</svg>';
}

function setDisplay(el, visible, mode = 'block') {
  const next = visible ? mode : 'none';
  if (el._sfDisplay === next) return;
  el._sfDisplay = next;
  el.style.display = next;
}

function setOpacity(el, opacity) {
  const next = String(opacity);
  if (el._sfOpacity === next) return;
  el._sfOpacity = next;
  el.style.opacity = next;
}

function setHudTransform(el, x, y) {
  const next = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-50%)`;
  if (el._sfTransform === next) return;
  el._sfTransform = next;
  el.style.transform = next;
}

function setEdge(el, edge) {
  if (el._sfEdge === edge) return;
  el._sfEdge = edge;
  el.setAttribute('data-edge', edge);
}

function createSlot(className, innerHtml) {
  const el = document.createElement('div');
  el.className = className;
  el.setAttribute('aria-hidden', 'true');
  el.style.display = 'none';
  el.innerHTML = innerHtml;
  return el;
}

export function createThreatHalo(root, busOrOpts) {
  const noop = { update: () => {}, destroy: () => {}, noteTelegraph() {} };
  if (!root) return noop;
  const bus = busOrOpts && typeof busOrOpts.on === 'function'
    ? busOrOpts
    : (busOrOpts && busOrOpts.bus && typeof busOrOpts.bus.on === 'function' ? busOrOpts.bus : null);

  const layer = document.createElement('div');
  layer.className = 'sf-threat-halo';
  layer.style.display = 'none';
  root.appendChild(layer);

  const hostileSlots = new Array(HOSTILE_LIMIT);
  for (let i = 0; i < HOSTILE_LIMIT; i++) {
    const slot = createSlot('sf-threat-halo__slot sf-threat-halo__slot--arc', '');
    const arc = document.createElement('div');
    arc.className = 'sf-threat-halo__arc';
    slot.appendChild(arc);
    slot._sfArc = arc;
    layer.appendChild(slot);
    hostileSlots[i] = slot;
  }

  const missileSlots = new Array(MISSILE_LIMIT);
  const missileGlyph = buildMissileGlyph();
  for (let i = 0; i < MISSILE_LIMIT; i++) {
    const slot = createSlot('sf-threat-halo__slot sf-threat-halo__slot--missile', missileGlyph);
    layer.appendChild(slot);
    missileSlots[i] = slot;
  }

  const hostileX = new Float64Array(HOSTILE_LIMIT);
  const hostileY = new Float64Array(HOSTILE_LIMIT);
  const hostileTier = new Int16Array(HOSTILE_LIMIT);
  const hostileDist = new Float64Array(HOSTILE_LIMIT);
  const hostileOpacity = new Float64Array(HOSTILE_LIMIT);
  const hostileRole = new Array(HOSTILE_LIMIT);
  const hostileToken = new Array(HOSTILE_LIMIT);
  const hostileFaction = new Array(HOSTILE_LIMIT);
  const hostileId = new Array(HOSTILE_LIMIT);
  let hostileCount = 0;
  const telegraphCues = [];
  let busUnsub = null;


  const missileX = new Float64Array(MISSILE_LIMIT);
  const missileY = new Float64Array(MISSILE_LIMIT);
  const missileDist = new Float64Array(MISSILE_LIMIT);
  let missileCount = 0;

  const projectionWorld = { x: 0, y: 0, z: 0 };
  const projectionScreen = { x: 0, y: 0, onScreen: false };

  let viewportW = 0;
  let viewportH = 0;
  const clearRect = { x: 0, y: 0, width: 0, height: 0 };
  // Order: left stack, right dock, one-voice floor, power rail, drive band, massline lane.
  const reservedRects = [
    { x: 0, y: 0, width: 0, height: 0 },
    { x: 0, y: 0, width: 0, height: 0 },
    { x: 0, y: 0, width: 0, height: 0 },
    { x: 0, y: 0, width: 0, height: 0 },
    { x: 0, y: 0, width: 0, height: 0 },
    { x: 0, y: 0, width: 0, height: 0 },
  ];

  const occupiedCount = new Int16Array(4);
  const occupiedCoord = [
    new Float64Array(TOTAL_LIMIT),
    new Float64Array(TOTAL_LIMIT),
    new Float64Array(TOTAL_LIMIT),
    new Float64Array(TOTAL_LIMIT),
  ];
  const occupiedHalf = [
    new Float64Array(TOTAL_LIMIT),
    new Float64Array(TOTAL_LIMIT),
    new Float64Array(TOTAL_LIMIT),
    new Float64Array(TOTAL_LIMIT),
  ];

  const placement = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    edge: EDGE_TOP,
    along: 0,
    halfAlong: 0,
  };

  function expireTelegraphCues(tick) {
    let write = 0;
    for (let i = 0; i < telegraphCues.length; i++) {
      const cue = telegraphCues[i];
      if (!cue || tick > cue.expiresAtTick) continue;
      telegraphCues[write++] = cue;
    }
    telegraphCues.length = write;
  }

  function noteTelegraph(payload, tick) {
    const kind = leftoverTelegraphKind(payload);
    if (!kind) return null;
    const entityId = payload.entityId != null ? payload.entityId
      : (payload.actorId != null ? payload.actorId
        : (payload.sourceId != null ? payload.sourceId
          : (payload.ownerId != null ? payload.ownerId : null)));
    const mineId = payload.mineId != null ? payload.mineId : null;
    if (entityId == null && mineId == null) return null;
    const startedTick = Number.isInteger(payload.tick) ? payload.tick
      : (Number.isInteger(tick) ? tick : 0);
    const expiresAtTick = startedTick + telegraphDurationTicks(payload);
    if (Number.isInteger(tick) && tick > expiresAtTick) return null;

    for (let i = 0; i < telegraphCues.length; i++) {
      const cue = telegraphCues[i];
      if (!cue) continue;
      const sameEntity = entityId != null && cue.entityId === entityId;
      const sameMine = mineId != null && cue.mineId === mineId;
      if (sameEntity || sameMine) {
        cue.kind = kind;
        cue.entityId = entityId;
        cue.mineId = mineId;
        cue.startedTick = startedTick;
        cue.expiresAtTick = expiresAtTick;
        return cue;
      }
    }

    const next = { kind, entityId, mineId, startedTick, expiresAtTick };
    telegraphCues.push(next);
    return next;
  }

  function cueForIds(entityId, mineId) {
    for (let i = 0; i < telegraphCues.length; i++) {
      const cue = telegraphCues[i];
      if (!cue) continue;
      if (entityId != null && cue.entityId === entityId) return cue;
      if (mineId != null && cue.mineId === mineId) return cue;
    }
    return null;
  }

  function harvestLeftoverTelegraphs(state, tick) {
    const list = state && state.entityList;
    if (!Array.isArray(list)) return;
    for (let i = 0; i < list.length; i++) {
      const entity = list[i];
      if (!entity || entity.alive === false) continue;
      const data = entity.data || {};
      if (entity.type === 'mine' || data.kind === 'mine' || data.mine === true) {
        if (data.triggered) continue;
        const placedTick = placedTickFromSimTime(state, data.placedAt);
        noteTelegraph({
          entityId: data.ownerId != null ? data.ownerId : entity.ownerId,
          mineId: entity.id,
          kind: 'wake_mines',
          durationTicks: liveHazardDurationTicks(tick, placedTick),
          tick: placedTick,
        }, tick);
        continue;
      }
      if (data.kind === 'transverse_snare_hazard') {
        const placedTick = Number.isInteger(data.spawnTick)
          ? data.spawnTick
          : placedTickFromSimTime(state, data.placedAt);
        noteTelegraph({
          entityId: data.ownerId != null ? data.ownerId : entity.ownerId,
          kind: 'attach_spool',
          durationTicks: liveHazardDurationTicks(tick, placedTick),
          tick: placedTick,
        }, tick);
        continue;
      }
      const pending = data.ai && data.ai._attackTelegraph;
      if (pending && Number.isFinite(pending.until) && Number.isFinite(state.simTime)
          && state.simTime < pending.until) {
        noteTelegraph({
          entityId: entity.id,
          kind: pending.kind || 'engine_flare',
          durationTicks: TELEGRAPH_CUE_TICKS,
          tick,
        }, tick);
      }
    }
  }

  if (bus) {
    busUnsub = bus.on('ai:telegraph', (payload) => {
      const tick = payload && Number.isInteger(payload.tick) ? payload.tick : 0;
      noteTelegraph(payload || {}, tick);
    });
  }

  function refreshLayout(width, height) {
    if (width === viewportW && height === viewportH) return;
    viewportW = width;
    viewportH = height;

    clearRect.x = width * 0.24;
    clearRect.y = height * 0.12;
    clearRect.width = width * 0.52;
    clearRect.height = height * 0.56;

    const compact = width <= 900 || height <= 650;

    const left = reservedRects[0];
    left.width = compact ? 236 : 272;
    left.height = 150;
    left.x = compact ? 10 : 12;
    left.y = height - (compact ? 72 : 12) - left.height;

    const right = reservedRects[1];
    right.width = compact ? 200 : 232;
    right.height = 210;
    right.x = width - (compact ? 10 : 12) - right.width;
    right.y = height - (compact ? 72 : 12) - right.height;

    const voice = reservedRects[2];
    voice.width = Math.min(440, Math.max(120, width - 24));
    voice.height = 26;
    voice.x = (width - voice.width) * 0.5;
    voice.y = 18;

    const rail = reservedRects[3];
    rail.width = compact ? 494 : 516;
    rail.height = compact ? 44 : 46;
    rail.x = (width - rail.width) * 0.5;
    rail.y = height - (compact ? 8 : 10) - rail.height;

    const drive = reservedRects[4];
    drive.width = compact ? 320 : 360;
    drive.height = 32;
    drive.x = (width - drive.width) * 0.5;
    drive.y = height - (compact ? 58 : 64) - drive.height;

    const massline = reservedRects[5];
    massline.width = compact ? 360 : 420;
    massline.height = 54;
    massline.x = (width - massline.width) * 0.5;
    massline.y = height - (compact ? 88 : 96) - massline.height;
  }

  function resetOccupancy() {
    occupiedCount[0] = 0;
    occupiedCount[1] = 0;
    occupiedCount[2] = 0;
    occupiedCount[3] = 0;
  }

  function registerOccupancy(edge, along, halfAlong) {
    const edgeIndex = edgeToIndex(edge);
    const n = occupiedCount[edgeIndex];
    if (n >= TOTAL_LIMIT) return;
    occupiedCoord[edgeIndex][n] = along;
    occupiedHalf[edgeIndex][n] = halfAlong;
    occupiedCount[edgeIndex] = n + 1;
  }

  function overlapsReservedOrClear(x, y, width, height) {
    if (rectsOverlap(x, y, width, height, clearRect)) return true;
    for (let i = 0; i < reservedRects.length; i++) {
      if (rectsOverlap(x, y, width, height, reservedRects[i])) return true;
    }
    return false;
  }

  function resolvePlacement(projectedX, projectedY, missile) {
    if (!Number.isFinite(projectedX) || !Number.isFinite(projectedY)) return false;

    const centerX = viewportW * 0.5;
    const centerY = viewportH * 0.5;
    let dx = projectedX - centerX;
    let dy = projectedY - centerY;
    if (Math.abs(dx) + Math.abs(dy) < 0.001) dy = -1;

    const extentX = Math.max(1, centerX - EDGE_CENTER_PX);
    const extentY = Math.max(1, centerY - EDGE_CENTER_PX);
    const tx = Math.abs(dx) > 0.001 ? extentX / Math.abs(dx) : Infinity;
    const ty = Math.abs(dy) > 0.001 ? extentY / Math.abs(dy) : Infinity;

    let edge;
    let along;
    if (tx < ty) {
      edge = dx < 0 ? EDGE_LEFT : EDGE_RIGHT;
      along = centerY + dy * tx;
    } else {
      edge = dy < 0 ? EDGE_TOP : EDGE_BOTTOM;
      along = centerX + dx * ty;
    }

    const horizontal = edge === EDGE_TOP || edge === EDGE_BOTTOM;
    const width = missile ? MISSILE_SIZE_PX : (horizontal ? ARC_SPAN_PX : ARC_DEPTH_PX);
    const height = missile ? MISSILE_SIZE_PX : (horizontal ? ARC_DEPTH_PX : ARC_SPAN_PX);
    const halfAlong = horizontal ? width * 0.5 : height * 0.5;
    const halfCross = horizontal ? height * 0.5 : width * 0.5;

    const axisLimit = horizontal ? viewportW : viewportH;
    const minAlong = halfAlong + EDGE_GAP_PX;
    const maxAlong = axisLimit - halfAlong - EDGE_GAP_PX;
    if (!(maxAlong > minAlong)) return false;
    along = clamp(along, minAlong, maxAlong);

    const fixedCross = horizontal
      ? (edge === EDGE_TOP ? EDGE_CENTER_PX : viewportH - EDGE_CENTER_PX)
      : (edge === EDGE_LEFT ? EDGE_CENTER_PX : viewportW - EDGE_CENTER_PX);

    for (let pass = 0; pass < 8; pass++) {
      let moved = false;

      for (let i = 0; i < reservedRects.length; i++) {
        const rect = reservedRects[i];
        const crossMin = fixedCross - halfCross;
        const crossMax = fixedCross + halfCross;
        const overlapsCross = horizontal
          ? (crossMin < rect.y + rect.height && crossMax > rect.y)
          : (crossMin < rect.x + rect.width && crossMax > rect.x);
        if (!overlapsCross) continue;

        const start = (horizontal ? rect.x : rect.y) - halfAlong - EDGE_GAP_PX;
        const end = (horizontal ? rect.x + rect.width : rect.y + rect.height) + halfAlong + EDGE_GAP_PX;
        if (along <= start || along >= end) continue;

        const left = start - 0.25;
        const right = end + 0.25;
        const canLeft = left >= minAlong;
        const canRight = right <= maxAlong;
        if (!canLeft && !canRight) return false;
        along = canLeft && canRight
          ? (Math.abs(along - left) <= Math.abs(right - along) ? left : right)
          : (canLeft ? left : right);
        moved = true;
      }

      const edgeIndex = edgeToIndex(edge);
      const occupiedN = occupiedCount[edgeIndex];
      for (let i = 0; i < occupiedN; i++) {
        const center = occupiedCoord[edgeIndex][i];
        const otherHalf = occupiedHalf[edgeIndex][i];
        const span = otherHalf + halfAlong + EDGE_GAP_PX;
        const start = center - span;
        const end = center + span;
        if (along <= start || along >= end) continue;

        const left = start - 0.25;
        const right = end + 0.25;
        const canLeft = left >= minAlong;
        const canRight = right <= maxAlong;
        if (!canLeft && !canRight) return false;
        along = canLeft && canRight
          ? (Math.abs(along - left) <= Math.abs(right - along) ? left : right)
          : (canLeft ? left : right);
        moved = true;
      }

      if (!moved) break;
      along = clamp(along, minAlong, maxAlong);
      if (pass === 7) return false;
    }

    const x = horizontal ? along : (edge === EDGE_LEFT ? EDGE_CENTER_PX : viewportW - EDGE_CENTER_PX);
    const y = horizontal ? (edge === EDGE_TOP ? EDGE_CENTER_PX : viewportH - EDGE_CENTER_PX) : along;
    const left = x - width * 0.5;
    const top = y - height * 0.5;
    if (overlapsReservedOrClear(left, top, width, height)) return false;

    placement.x = x;
    placement.y = y;
    placement.width = width;
    placement.height = height;
    placement.edge = edge;
    placement.along = along;
    placement.halfAlong = halfAlong;
    registerOccupancy(edge, along, halfAlong);
    return true;
  }

  function clearSlotTelegraph(slot) {
    if (!slot) return;
    slot.removeAttribute('data-telegraph-kind');
    slot.removeAttribute('data-entity-id');
    if (slot.className && slot.className.indexOf(SLOT_TELEGRAPH_CLASS) !== -1) {
      slot.className = slot.className.replace(` ${SLOT_TELEGRAPH_CLASS}`, '').replace(SLOT_TELEGRAPH_CLASS, '');
    }
    setForceHue(slot, slot._sfArc, null, null);
  }

  // The cue paints itself from the authored force palette (PQ-161.02): channel attribute for the
  // rules layer, inline border colour so the palette hex wins over any stylesheet default.
  function setForceHue(slot, arc, channel, hex) {
    if (!slot) return;
    const channelKey = channel || '';
    if (slot._sfForceChannel !== channelKey) {
      slot._sfForceChannel = channelKey;
      if (channelKey) slot.setAttribute('data-force-channel', channelKey);
      else slot.removeAttribute('data-force-channel');
    }
    if (!arc) return;
    const colorKey = hex || '';
    if (arc._sfForceColor !== colorKey) {
      arc._sfForceColor = colorKey;
      arc.style.borderColor = colorKey;
    }
  }

  function hideAllSlots() {
    for (let i = 0; i < HOSTILE_LIMIT; i++) {
      clearSlotTelegraph(hostileSlots[i]);
      setDisplay(hostileSlots[i], false);
    }
    for (let i = 0; i < MISSILE_LIMIT; i++) setDisplay(missileSlots[i], false);
    setDisplay(layer, false);
  }

  function pushHostileCandidate(x, y, tier, dist, opacity, role = 'unknown', token = 'token_silhouette_standard', faction = null, id = null) {
    if (hostileCount < HOSTILE_LIMIT) {
      const i = hostileCount++;
      hostileX[i] = x;
      hostileY[i] = y;
      hostileTier[i] = tier;
      hostileDist[i] = dist;
      hostileOpacity[i] = opacity;
      hostileRole[i] = role;
      hostileToken[i] = token;
      hostileFaction[i] = faction;
      hostileId[i] = id;
      return;
    }

    let worst = 0;
    for (let i = 1; i < HOSTILE_LIMIT; i++) {
      if (worseHostile(hostileTier[i], hostileDist[i], hostileTier[worst], hostileDist[worst])) worst = i;
    }
    if (!betterHostile(tier, dist, hostileTier[worst], hostileDist[worst])) return;

    hostileX[worst] = x;
    hostileY[worst] = y;
    hostileTier[worst] = tier;
    hostileDist[worst] = dist;
    hostileOpacity[worst] = opacity;
    hostileRole[worst] = role;
    hostileToken[worst] = token;
    hostileFaction[worst] = faction;
    hostileId[worst] = id;
  }

  function pushMissileCandidate(x, y, dist) {
    if (missileCount < MISSILE_LIMIT) {
      const i = missileCount++;
      missileX[i] = x;
      missileY[i] = y;
      missileDist[i] = dist;
      return;
    }

    let worst = 0;
    for (let i = 1; i < MISSILE_LIMIT; i++) {
      if (missileDist[i] > missileDist[worst]) worst = i;
    }
    if (dist >= missileDist[worst]) return;

    missileX[worst] = x;
    missileY[worst] = y;
    missileDist[worst] = dist;
  }

  function sortHostileCandidates() {
    for (let i = 0; i < hostileCount - 1; i++) {
      let best = i;
      for (let j = i + 1; j < hostileCount; j++) {
        if (betterHostile(hostileTier[j], hostileDist[j], hostileTier[best], hostileDist[best])) best = j;
      }
      if (best === i) continue;
      const tx = hostileX[i];
      const ty = hostileY[i];
      const tt = hostileTier[i];
      const td = hostileDist[i];
      const to = hostileOpacity[i];
      const tr = hostileRole[i];
      const tk = hostileToken[i];
      const tf = hostileFaction[i];
      const tid = hostileId[i];
      hostileX[i] = hostileX[best];
      hostileY[i] = hostileY[best];
      hostileTier[i] = hostileTier[best];
      hostileDist[i] = hostileDist[best];
      hostileOpacity[i] = hostileOpacity[best];
      hostileRole[i] = hostileRole[best];
      hostileToken[i] = hostileToken[best];
      hostileFaction[i] = hostileFaction[best];
      hostileId[i] = hostileId[best];
      hostileX[best] = tx;
      hostileY[best] = ty;
      hostileTier[best] = tt;
      hostileDist[best] = td;
      hostileOpacity[best] = to;
      hostileRole[best] = tr;
      hostileToken[best] = tk;
      hostileFaction[best] = tf;
      hostileId[best] = tid;
    }
  }

  function sortMissileCandidates() {
    for (let i = 0; i < missileCount - 1; i++) {
      let best = i;
      for (let j = i + 1; j < missileCount; j++) {
        if (missileDist[j] < missileDist[best]) best = j;
      }
      if (best === i) continue;
      const tx = missileX[i];
      const ty = missileY[i];
      const td = missileDist[i];
      missileX[i] = missileX[best];
      missileY[i] = missileY[best];
      missileDist[i] = missileDist[best];
      missileX[best] = tx;
      missileY[best] = ty;
      missileDist[best] = td;
    }
  }

  function collectHostiles(player, state, worldToScreen) {
    hostileCount = 0;
    const index = state.entityIndex;
    const ships = index && index.__spacefaceEntityIndexV1 && Array.isArray(index.ships)
      ? index.ships
      : (state.entityList || []);
    const playerTeam = player.team;
    const playerVelX = player.vel && Number.isFinite(player.vel.x) ? player.vel.x : 0;
    const playerVelZ = player.vel && Number.isFinite(player.vel.z) ? player.vel.z : 0;

    for (let i = 0; i < ships.length; i++) {
      const entity = ships[i];
      if (!entity || entity === player || entity.alive === false || entity.type !== 'ship' || !entity.pos) continue;
      const dx = entity.pos.x - player.pos.x;
      const dz = entity.pos.z - player.pos.z;
      const distSq = dx * dx + dz * dz;
      if (distSq > HALO_RANGE_SQ) continue;
      const hostile = isHostileToPlayer(entity, playerTeam, state);
      if (!hostile) continue;

      projectionWorld.x = entity.pos.x;
      projectionWorld.y = 0;
      projectionWorld.z = entity.pos.z;
      const projected = worldToScreen(projectionWorld, projectionScreen);
      const telegraphed = !!cueForIds(entity.id, null);
      if (!projected || (projected.onScreen && !telegraphed)) continue;

      const dist = Math.sqrt(distSq);
      const tier = contactThreatTier(entity, true);
      const evx = entity.vel && Number.isFinite(entity.vel.x) ? entity.vel.x : 0;
      const evz = entity.vel && Number.isFinite(entity.vel.z) ? entity.vel.z : 0;
      const relX = evx - playerVelX;
      const relZ = evz - playerVelZ;
      const closing = -((relX * dx + relZ * dz) / Math.max(1, dist));
      const closure = clamp(closing / HOSTILE_CLOSING_FOR_MAX, 0, 1);
      const opacity = HOSTILE_OPACITY_BASE + closure * (HOSTILE_OPACITY_MAX - HOSTILE_OPACITY_BASE);
      const occRule = resolveEntityOccupationalRule(entity);
      const role = occRule ? occRule.role : (entity.role || (entity.data && (entity.data.role || entity.data.trafficRole)) || 'unknown');
      const token = occRule ? occRule.silhouetteToken : 'token_silhouette_standard';
      const faction = entity.factionId || (entity.data && entity.data.factionId) || null;
      pushHostileCandidate(projected.x, projected.y, tier, dist, opacity, role, token, faction, entity.id);
    }

    sortHostileCandidates();
  }

  function collectMissiles(player, state, worldToScreen) {
    missileCount = 0;
    const index = state.entityIndex;
    const projectiles = index && index.__spacefaceEntityIndexV1 && Array.isArray(index.projectiles)
      ? index.projectiles
      : (state.entityList || []);

    for (let i = 0; i < projectiles.length; i++) {
      const entity = projectiles[i];
      if (!entity || entity.alive === false || entity.type !== 'projectile' || !entity.pos) continue;
      const data = entity.data;
      if (!data || data.kind !== 'missile' || data.targetId !== player.id) continue;

      projectionWorld.x = entity.pos.x;
      projectionWorld.y = 0;
      projectionWorld.z = entity.pos.z;
      const projected = worldToScreen(projectionWorld, projectionScreen);
      if (!projected || projected.onScreen) continue;

      const dx = entity.pos.x - player.pos.x;
      const dz = entity.pos.z - player.pos.z;
      const dist = Math.hypot(dx, dz);
      pushMissileCandidate(projected.x, projected.y, dist);
    }

    sortMissileCandidates();
  }

  function applySlots() {
    let shown = 0;

    for (let i = 0; i < HOSTILE_LIMIT; i++) {
      const slot = hostileSlots[i];
      if (i >= hostileCount || !resolvePlacement(hostileX[i], hostileY[i], false)) {
        clearSlotTelegraph(slot);
        setDisplay(slot, false);
        continue;
      }
      setDisplay(slot, true, 'block');
      setEdge(slot, placement.edge);
      setHudTransform(slot, placement.x, placement.y);
      slot.setAttribute('data-role', hostileRole[i] || 'unknown');
      slot.setAttribute('data-silhouette-token', hostileToken[i] || 'token_silhouette_standard');
      if (hostileId[i] != null) slot.setAttribute('data-entity-id', String(hostileId[i]));
      else slot.removeAttribute('data-entity-id');
      const cue = cueForIds(hostileId[i], null);
      setOpacity(slot, cue ? '1' : hostileOpacity[i].toFixed(2));
      if (cue) {
        slot.setAttribute('data-telegraph-kind', cue.kind);
        if (slot.className.indexOf(SLOT_TELEGRAPH_CLASS) === -1) {
          slot.className = `${slot.className} ${SLOT_TELEGRAPH_CLASS}`;
        }
        const channel = forceChannelForTelegraphKind(cue.kind);
        setForceHue(slot, slot._sfArc, channel, channel ? getForcePaletteHex(channel) : null);
      } else {
        slot.removeAttribute('data-telegraph-kind');
        if (slot.className.indexOf(SLOT_TELEGRAPH_CLASS) !== -1) {
          slot.className = slot.className.replace(` ${SLOT_TELEGRAPH_CLASS}`, '').replace(SLOT_TELEGRAPH_CLASS, '');
        }
        setForceHue(slot, slot._sfArc, null, null);
      }
      if (hostileFaction[i]) {
        slot.setAttribute('data-faction', hostileFaction[i]);
      } else {
        slot.removeAttribute('data-faction');
      }
      shown++;
    }

    for (let i = 0; i < MISSILE_LIMIT; i++) {
      const slot = missileSlots[i];
      if (i >= missileCount || !resolvePlacement(missileX[i], missileY[i], true)) {
        setDisplay(slot, false);
        continue;
      }
      setDisplay(slot, true, 'block');
      setEdge(slot, placement.edge);
      setHudTransform(slot, placement.x, placement.y);
      setOpacity(slot, '0.92');
      shown++;
    }

    setDisplay(layer, shown > 0, 'block');
  }

  return {
    noteTelegraph,
    update(player, state, worldToScreen) {
      if (!player || !state || typeof worldToScreen !== 'function' || !player.pos) {
        hideAllSlots();
        return;
      }
      const tick = Number.isInteger(state.tick) ? state.tick : 0;
      expireTelegraphCues(tick);
      harvestLeftoverTelegraphs(state, tick);
      expireTelegraphCues(tick);
      const width = (typeof window !== 'undefined' && Number.isFinite(window.innerWidth))
        ? window.innerWidth
        : 1280;
      const height = (typeof window !== 'undefined' && Number.isFinite(window.innerHeight))
        ? window.innerHeight
        : 720;
      refreshLayout(width, height);
      resetOccupancy();
      collectHostiles(player, state, worldToScreen);
      collectMissiles(player, state, worldToScreen);
      applySlots();
    },
    destroy() {
      if (typeof busUnsub === 'function') {
        busUnsub();
        busUnsub = null;
      }
      telegraphCues.length = 0;
      if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
    },
  };
}
