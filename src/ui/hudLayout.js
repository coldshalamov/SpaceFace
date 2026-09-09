// Player-owned placement for movable flight HUD surfaces. This is presentation state only: it is
// stored under settings so a normal game save carries it, without touching simulation ownership.

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

export function readHudLayout(state, key) {
  const slot = state && state.settings && state.settings.ui && state.settings.ui[LAYOUT_KEY];
  const placement = slot && slot[key];
  if (!placement || !Number.isFinite(placement.x) || !Number.isFinite(placement.y)) return null;
  return { x: Math.round(placement.x), y: Math.round(placement.y) };
}

export function writeHudLayout(state, key, placement) {
  if (!state || !key || !placement || !Number.isFinite(placement.x) || !Number.isFinite(placement.y)) return null;
  state.settings = state.settings && typeof state.settings === 'object' ? state.settings : {};
  state.settings.ui = state.settings.ui && typeof state.settings.ui === 'object' ? state.settings.ui : {};
  const layout = state.settings.ui[LAYOUT_KEY] && typeof state.settings.ui[LAYOUT_KEY] === 'object'
    ? state.settings.ui[LAYOUT_KEY] : (state.settings.ui[LAYOUT_KEY] = {});
  layout[key] = { x: Math.round(placement.x), y: Math.round(placement.y) };
  return layout[key];
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
