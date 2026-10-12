// Player-owned placement for movable flight HUD surfaces. This is presentation state only: it is
// stored under settings so a normal game save carries it, without touching simulation ownership.

import { laneWriteSetting } from '../core/simLaneCommands.js';

const LAYOUT_KEY = 'hudLayout';
const EDGE_GUTTER = 12;

export function createHudDragController({ state, bus, element, key, documentRef, windowRef } = {}) {
  const doc = documentRef || (element && element.ownerDocument) || (typeof document !== 'undefined' ? document : null);
  const view = windowRef || (typeof window !== 'undefined' ? window : null);
  if (!state || !element || !key) return inertController();

  let dragging = null;
  let suppressClick = false;
  let destroyed = false;
  const offs = [];

  if (element.dataset) element.dataset.hudDraggable = key;
  element.setAttribute('title', 'Hold Ctrl and drag to reposition. Saved with this game.');
  element.setAttribute('data-hud-draggable', key);
  element.classList && element.classList.add('sf-hud-draggable');

  function apply() {
    const placement = readHudLayout(state, key);
    if (!placement) {
      clearInlinePlacement(element);
      element.classList && element.classList.remove('sf-hud-positioned');
      return null;
    }
    element.style.position = 'fixed';
    element.style.left = `${placement.x}px`;
    element.style.top = `${placement.y}px`;
    element.style.right = 'auto';
    element.style.bottom = 'auto';
    element.style.transform = 'none';
    element.style.zIndex = '40';
    element.classList && element.classList.add('sf-hud-positioned');
    return placement;
  }

  function onPointerDown(event) {
    if (destroyed || !event || event.button !== 0 || !event.ctrlKey) return;
    const rect = measure(element);
    const pointerId = event.pointerId;
    dragging = {
      pointerId,
      offsetX: finite(event.clientX, rect.left) - rect.left,
      offsetY: finite(event.clientY, rect.top) - rect.top,
      width: rect.width,
      height: rect.height,
      moved: false,
    };
    writeHudLayout(state, key, { x: rect.left, y: rect.top });
    apply();
    suppressClick = true;
    element.classList && element.classList.add('is-hud-dragging');
    if (typeof element.setPointerCapture === 'function' && pointerId != null) {
      try { element.setPointerCapture(pointerId); } catch (_) {}
    }
    stopEvent(event);
  }

  function onPointerMove(event) {
    if (!dragging || !samePointer(event, dragging.pointerId)) return;
    const viewport = viewportSize(view, doc);
    const x = clamp(finite(event.clientX, 0) - dragging.offsetX, EDGE_GUTTER,
      Math.max(EDGE_GUTTER, viewport.width - dragging.width - EDGE_GUTTER));
    const y = clamp(finite(event.clientY, 0) - dragging.offsetY, EDGE_GUTTER,
      Math.max(EDGE_GUTTER, viewport.height - dragging.height - EDGE_GUTTER));
    writeHudLayout(state, key, { x, y });
    dragging.moved = true;
    apply();
    stopEvent(event);
  }

  function finishDrag(event) {
    if (!dragging || !samePointer(event, dragging.pointerId)) return;
    const moved = dragging.moved;
    dragging = null;
    element.classList && element.classList.remove('is-hud-dragging');
    if (typeof element.releasePointerCapture === 'function' && event && event.pointerId != null) {
      try { element.releasePointerCapture(event.pointerId); } catch (_) {}
    }
    if (moved && bus && typeof bus.emit === 'function') {
      bus.emit('hud:layoutChanged', { key, placement: readHudLayout(state, key) });
    }
    stopEvent(event);
    // A browser normally follows pointerup with click. Drop that click so Ctrl-dragging the Band
    // never also retunes it; the timeout also clears the guard when the browser suppresses click.
    setTimeout(() => { suppressClick = false; }, 0);
  }

  function onClick(event) {
    if (!suppressClick) return;
    suppressClick = false;
    stopEvent(event);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const off of offs.splice(0)) {
      try { off(); } catch (_) {}
    }
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('click', onClick, true);
    element.classList && element.classList.remove('is-hud-dragging');
  }

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('click', onClick, true);
  if (doc && typeof doc.addEventListener === 'function') {
    doc.addEventListener('pointermove', onPointerMove);
    doc.addEventListener('pointerup', finishDrag);
    doc.addEventListener('pointercancel', finishDrag);
    offs.push(() => doc.removeEventListener('pointermove', onPointerMove));
    offs.push(() => doc.removeEventListener('pointerup', finishDrag));
    offs.push(() => doc.removeEventListener('pointercancel', finishDrag));
  }
  if (bus && typeof bus.on === 'function') {
    offs.push(bus.on('save:loaded', apply));
    offs.push(bus.on('game:new', apply));
  }
  apply();
  return { apply, destroy };
}

// FB-100: HUD presentation keys live on settings.video so they persist with the profile and
// ride the same settings:changed apply path as --ui-scale. hudLayout owns turning them into
// the two CSS variables #hud consumes — scale composes with --ui-scale, opacity is the HUD's
// own multiplier so it never fights the pause-dim or blowout animations on other surfaces.
export const HUD_SCALE_MIN = 0.75;
export const HUD_SCALE_MAX = 1.5;
export const HUD_OPACITY_MIN = 0.3;
export const HUD_OPACITY_MAX = 1;

export function applyHudPresentationFromSettings(settings, root) {
  const video = settings && settings.video && typeof settings.video === 'object' ? settings.video : {};
  const hudScale = Number.isFinite(Number(video.hudScale))
    ? Math.min(HUD_SCALE_MAX, Math.max(HUD_SCALE_MIN, Number(video.hudScale))) : 1;
  const hudOpacity = Number.isFinite(Number(video.hudOpacity))
    ? Math.min(HUD_OPACITY_MAX, Math.max(HUD_OPACITY_MIN, Number(video.hudOpacity))) : 1;
  const el = root && root.style && typeof root.style.setProperty === 'function' ? root : null;
  if (el) {
    el.style.setProperty('--sf-hud-scale', String(hudScale));
    el.style.setProperty('--sf-hud-opacity', String(hudOpacity));
  }
  return { hudScale, hudOpacity };
}

export function readHudLayout(state, key) {
  const slot = state && state.settings && state.settings.ui && state.settings.ui[LAYOUT_KEY];
  const placement = slot && slot[key];
  if (!placement || !Number.isFinite(placement.x) || !Number.isFinite(placement.y)) return null;
  return { x: Math.round(placement.x), y: Math.round(placement.y) };
}

export function writeHudLayout(state, key, placement) {
  if (!state || !key || !placement || !Number.isFinite(placement.x) || !Number.isFinite(placement.y)) return null;
  const entry = { x: Math.round(placement.x), y: Math.round(placement.y) };
  // Lane writer: direct apply (SIM_LANE=main) or settings envelope (worker mode).
  return laneWriteSetting(state, 'settings.ui.hudLayout', { key, x: entry.x, y: entry.y }) ? entry : null;
}

function clearInlinePlacement(element) {
  element.style.position = '';
  element.style.left = '';
  element.style.top = '';
  element.style.right = '';
  element.style.bottom = '';
  element.style.transform = '';
  element.style.zIndex = '';
}

function measure(element) {
  const rect = typeof element.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : null;
  return {
    left: finite(rect && rect.left, 0),
    top: finite(rect && rect.top, 0),
    width: Math.max(1, finite(rect && rect.width, finite(element.offsetWidth, 160))),
    height: Math.max(1, finite(rect && rect.height, finite(element.offsetHeight, 42))),
  };
}

function viewportSize(view, doc) {
  const root = doc && doc.documentElement;
  return {
    width: Math.max(320, finite(view && view.innerWidth, finite(root && root.clientWidth, 1280))),
    height: Math.max(240, finite(view && view.innerHeight, finite(root && root.clientHeight, 720))),
  };
}

function samePointer(event, pointerId) {
  return pointerId == null || !event || event.pointerId == null || event.pointerId === pointerId;
}

function stopEvent(event) {
  if (!event) return;
  if (typeof event.preventDefault === 'function') event.preventDefault();
  if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
  else if (typeof event.stopPropagation === 'function') event.stopPropagation();
}

function finite(value, fallback) { return Number.isFinite(value) ? value : fallback; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function inertController() { return { apply: () => null, destroy() {} }; }

// ── Bottom-center lane contract (planetHud / fieldHud / massSeedHud) ────────────────────────
// The three flight tell pills share one centered lane above the bottom band. Solo, each keeps
// its authored seat (PLANET/FIELD/MSEED_LANE_BASE — the tuned offsets). Co-visible, they
// negotiate one-way: the highest-priority voice keeps its seat, the lower visible voices stack
// one LANE_SLOT_STEP above it, and a cooldown voice stays silent entirely while a load-bearing
// voice (environmental or better) occupies the lane — readiness seconds are the least valuable
// line on the deck. Negotiation is a pure function of the visible-claim set (claim-then-query),
// so the registry's update order cannot flip who wins; at most one frame settles after a
// simultaneous appearance.

export const LANE_PILL_HEIGHT = 26; // the pills' rendered height (12px etch, padding, hairline)
export const LANE_GAP = 10; // clear glass between stacked instruments
export const LANE_SLOT_STEP = LANE_PILL_HEIGHT + LANE_GAP;

// Voice classes, highest value first. Denial is fieldHud's charter and never yields or hides.
export const LANE_PRIORITY = { cooldown: 0, environmental: 1, active: 2, denial: 3 };
// Same-class ties resolve to a fixed instrument rank: the band readout leads, then fieldwork,
// then the seed. Constant, so a stable lane never flickers between two equal voices.
export const LANE_TIE_RANK = { planet: 0, field: 1, mseed: 2 };

// The authored seats — the offsets the three sheets already paint at. Solo output is unchanged.
export const PLANET_LANE_BASE = 142;
export const FIELD_LANE_BASE = 146;
export const MSEED_LANE_BASE = 118;

const laneClaims = new Map();
const LANE_CLAIM_TTL_S = 2; // sim seconds; a claim whose owner stops refreshing expires (pause-safe)

export function resetBottomLaneClaims() { laneClaims.clear(); }

export function releaseBottomLaneClaim(id) { laneClaims.delete(id); }

// Claim this frame's voice, then read the whole lane. Returns the bottom offset to sit at in px,
// or { visible: false } when this voice must stay silent (cooldown under a load-bearing voice).
export function claimBottomLaneSeat(id, priority, base, now = 0) {
  laneClaims.set(id, {
    id,
    priority: Number.isFinite(priority) ? priority : LANE_PRIORITY.active,
    base: Number.isFinite(base) ? base : 0,
    tie: LANE_TIE_RANK[id] ?? 9,
    at: Number.isFinite(now) ? now : 0,
  });
  return negotiateBottomLaneSeat(Array.from(laneClaims.values()), id, now);
}

export function negotiateBottomLaneSeat(claims, id, now = Infinity) {
  const live = (claims || []).filter((claim) => claim && Number.isFinite(claim.priority)
    && (now === Infinity || !(Number.isFinite(claim.at) && now - claim.at > LANE_CLAIM_TTL_S)));
  const loadBearing = live.some((claim) => claim.priority > LANE_PRIORITY.cooldown);
  const seats = live.filter((claim) => claim.priority !== LANE_PRIORITY.cooldown || !loadBearing);
  seats.sort((a, b) => (b.priority - a.priority) || (a.tie - b.tie));
  const mine = seats.find((claim) => claim.id === id);
  if (!mine) return { visible: false };
  return { visible: true, bottom: seats[0].base + seats.indexOf(mine) * LANE_SLOT_STEP };
}
