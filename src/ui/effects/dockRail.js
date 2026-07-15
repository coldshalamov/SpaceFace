// dockRail.js — Service Dock. Pattern after Magic UI "dock" (reference only).
// SpaceFace meaning: a rail of station/tool services (refuel, repair, ammo, market, missions…) read
// as a physical berth control strip. The focused service magnifies + reveals its readiness.
//
// Magnification is Mac-like: continuous falloff from the pointer (or focused item), not a binary
// "self + one neighbour" step. Tunables (MAX_SCALE, INFLUENCE_ICONS, LIFT_PX, PEAK_SHARPNESS) mirror
// the classic dock curve — peak at the hot icon, smooth cosine falloff across ~2–3 icon widths.
//
// Keyboard parity is a hard requirement: focus is treated identically to hover (both drive the same
// continuous curve). Magnify is transform:scale + translateY ONLY (never width/margin — that thrashes
// layout). Reduced motion drops the scale but KEEPS the :focus-visible outline. No `:has()` (JS sets
// emphasis classes). No rAF — pure CSS transitions + pointer/focus state.
import { ensureFxCss, prefersReducedMotion } from './effectRuntime.js';

export const CUE = Object.freeze({
  effect: 'dockRail',
  screens: ['stationHub', 'automation', 'outfitting'],
  triggers: ['hover', 'focus'],
  maxMs: 150,
  loop: false,
});

// ── Mac-like magnification variables ─────────────────────────────────────────
// MAX_SCALE: peak scale of the hot icon (macOS ~1.5–1.8; keep modest for dense berth chips).
// INFLUENCE_ICONS: how many icon-widths the curve reaches (2.4 ≈ self + one neighbour each side).
// LIFT_PX: max upward translate at full peak (icons "pop" out of the berth strip).
// PEAK_SHARPNESS: 1 = pure cosine; >1 sharpens the center peak (macOS feels slightly peaked).
// TRANSITION_MS: stays within this effect's declared CUE.maxMs interaction envelope.
const MAX_SCALE = 1.48;
const MIN_SCALE = 1;
const INFLUENCE_ICONS = 2.55;
const LIFT_PX = 14;
const PEAK_SHARPNESS = 1.35;
const TRANSITION_MS = 140;

const CSS_ID = 'sf-fx-dock-css';
const CSS = `
.sf-fx-dock {
  /* Room for MAX_SCALE + LIFT_PX above the berth baseline (lift paints into this pad, not into a clip). */
  --sf-fx-dock-pad-top: 40px;
  --sf-fx-dock-pad-x: 10px;
  position: relative;
  display: flex;
  gap: var(--sp-2, 8px);
  align-items: flex-end;
  justify-content: center;
  /* Visible on both axes: hosts may stack the rail above siblings; never create a scrollport that
     clips the hover scale (overflow-x:auto forces overflow-y to auto per CSS and chops the sides). */
  overflow: visible;
  padding: var(--sf-fx-dock-pad-top) var(--sf-fx-dock-pad-x) 6px;
  box-sizing: border-box;
}
.sf-fx-dock__item {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  /* Current plate uses stacked washes + an inset rim; alternative compositor treatments need
     representative accessibility and performance evidence rather than a universal ban. */
  background:
    linear-gradient(165deg,
      color-mix(in srgb, var(--ink) 16%, transparent) 0%,
      color-mix(in srgb, var(--ink-mute) 8%, transparent) 42%,
      color-mix(in srgb, var(--ink-mute) 14%, transparent) 100%);
  color: var(--ink);
  border: 1px solid color-mix(in srgb, var(--ink) 20%, transparent);
  border-radius: var(--r-2, 8px);
  padding: var(--sp-2, 8px);
  font: inherit;
  cursor: pointer;
  transform-origin: bottom center;
  transform: translateY(0) scale(1);
  will-change: transform;
  transition:
    transform ${TRANSITION_MS}ms var(--ease, ease-out),
    border-color ${TRANSITION_MS}ms var(--ease, ease-out),
    box-shadow ${TRANSITION_MS}ms var(--ease, ease-out),
    background ${TRANSITION_MS}ms var(--ease, ease-out);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--ink) 22%, transparent),
    inset 0 -1px 0 color-mix(in srgb, var(--ink-mute) 28%, transparent),
    0 1px 2px color-mix(in srgb, var(--ink-mute) 35%, transparent),
    0 8px 18px -12px color-mix(in srgb, var(--ink-mute) 70%, transparent);
  z-index: 1;
}
.sf-fx-dock__item::before {
  content: '';
  position: absolute;
  left: 10%;
  right: 10%;
  top: 1px;
  height: 42%;
  border-radius: inherit;
  pointer-events: none;
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--ink) 18%, transparent),
    transparent);
  opacity: 0.85;
}
.sf-fx-dock__item.is-focus {
  z-index: 4;
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--ink) 28%, transparent),
    inset 0 -1px 0 color-mix(in srgb, var(--accent) 18%, transparent),
    0 0 0 1px color-mix(in srgb, var(--accent) 22%, transparent),
    0 10px 24px -10px color-mix(in srgb, var(--accent) 45%, transparent),
    0 4px 10px color-mix(in srgb, var(--ink-mute) 40%, transparent);
}
.sf-fx-dock__item.is-adjacent {
  z-index: 3;
  border-color: color-mix(in srgb, var(--accent) 32%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--ink) 22%, transparent),
    0 8px 18px -12px color-mix(in srgb, var(--accent) 28%, transparent),
    0 2px 6px color-mix(in srgb, var(--ink-mute) 35%, transparent);
}
.sf-fx-dock__item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
.sf-fx-dock__icon {
  position: relative;
  font-size: 1.28em;
  line-height: 1;
  filter: drop-shadow(0 1px 1px color-mix(in srgb, var(--ink-mute) 55%, transparent));
}
.sf-fx-dock__label {
  position: relative;
  font-size: 0.78em;
  color: var(--ink-dim);
  letter-spacing: 0.02em;
}
.sf-fx-dock__badge {
  position: relative;
  font-size: 0.7em;
  color: var(--ink-mute);
}
.sf-fx-dock__badge--good { color: var(--good); }
.sf-fx-dock__badge--warn { color: var(--warn); }
.sf-fx-dock__badge--danger { color: var(--danger); }
@media (prefers-reduced-motion: reduce) {
  .sf-fx-dock__item { transition: border-color 120ms var(--ease, ease-out), box-shadow 120ms var(--ease, ease-out); }
  .sf-fx-dock__item.is-focus,
  .sf-fx-dock__item.is-adjacent { transform: none !important; }
}
html.sf-reduce-motion .sf-fx-dock__item {
  transition: border-color 120ms var(--ease, ease-out), box-shadow 120ms var(--ease, ease-out);
}
html.sf-reduce-motion .sf-fx-dock__item.is-focus,
html.sf-reduce-motion .sf-fx-dock__item.is-adjacent { transform: none !important; }
`;

const READY_CLASS = {
  good: 'sf-fx-dock__badge--good',
  warn: 'sf-fx-dock__badge--warn',
  danger: 'sf-fx-dock__badge--danger',
};

/**
 * Cosine falloff → Mac-like dock scale at distance `distPx` from the hot X.
 * @param {number} distPx
 * @param {number} iconW  base (untransformed) icon width
 */
function scaleAtDistance(distPx, iconW) {
  const w = iconW > 4 ? iconW : 64;
  const radius = w * INFLUENCE_ICONS;
  if (!(radius > 0) || distPx >= radius) return MIN_SCALE;
  const t = distPx / radius; // 0 at peak … 1 at edge
  // Cosine lobe: 1 at center, 0 at edge. Raise to PEAK_SHARPNESS for a tighter macOS-like peak.
  const lobe = 0.5 * (1 + Math.cos(Math.PI * t));
  const k = Math.pow(lobe, PEAK_SHARPNESS);
  return MIN_SCALE + (MAX_SCALE - MIN_SCALE) * k;
}

/**
 * @param {HTMLElement} mountEl
 * @param {object} [opts]  { onSelect(id) }
 */
export function createDockRail(mountEl, opts = {}) {
  ensureFxCss(CSS_ID, CSS);
  const onSelect = typeof opts.onSelect === 'function' ? opts.onSelect : null;

  const root = document.createElement('div');
  root.className = 'sf-fx-dock';
  root.setAttribute('role', 'toolbar');
  mountEl.appendChild(root);

  let items = [];       // { id, el, badgeEl }
  let active = true;
  let pointerInside = false;
  const bound = [];     // { el, type, fn } for teardown

  function on(el, type, fn) { el.addEventListener(type, fn); bound.push({ el, type, fn }); }

  function clearItems() {
    for (const b of bound) {
      // Keep root-level listeners; only drop per-item ones when rebuilding the list.
      if (b.el === root) continue;
      if (b.el.removeEventListener) b.el.removeEventListener(b.type, b.fn);
    }
    // Rebuild bound list with root listeners only.
    const keep = bound.filter((b) => b.el === root);
    bound.length = 0;
    for (const b of keep) bound.push(b);
    while (root.children && root.children.length) root.removeChild(root.children[root.children.length - 1]);
    items = [];
  }

  function clearTransforms() {
    for (const it of items) {
      it.el.style.transform = '';
      it.el.classList.remove('is-focus', 'is-adjacent');
    }
  }

  /**
   * Drive continuous magnification from a client-X (pointer) or from a focused index.
   * Uses offsetLeft/offsetWidth so transform does not feed back into the distance metric.
   */
  function applyMagnifyFromX(clientX) {
    if (!active || !items.length) return;
    if (prefersReducedMotion()) {
      // Emphasis without scale: retain a legible reduced-motion state.
      let best = 0;
      let bestDist = Infinity;
      const rootRect = root.getBoundingClientRect();
      const scrollLeft = root.scrollLeft || 0;
      const localX = clientX - rootRect.left + scrollLeft;
      for (let i = 0; i < items.length; i++) {
        const el = items[i].el;
        const cx = el.offsetLeft + el.offsetWidth / 2;
        const d = Math.abs(localX - cx);
        if (d < bestDist) { bestDist = d; best = i; }
      }
      for (let i = 0; i < items.length; i++) {
        items[i].el.style.transform = '';
        items[i].el.classList.toggle('is-focus', i === best);
        items[i].el.classList.toggle('is-adjacent', Math.abs(i - best) === 1);
      }
      return;
    }

    const rootRect = root.getBoundingClientRect();
    const scrollLeft = root.scrollLeft || 0;
    const localX = clientX - rootRect.left + scrollLeft;
    const range = MAX_SCALE - MIN_SCALE;

    for (let i = 0; i < items.length; i++) {
      const el = items[i].el;
      const w = el.offsetWidth || 64;
      const cx = el.offsetLeft + w / 2;
      const dist = Math.abs(localX - cx);
      const s = scaleAtDistance(dist, w);
      const lift = range > 0 ? -LIFT_PX * ((s - MIN_SCALE) / range) : 0;
      el.style.transform = 'translateY(' + lift.toFixed(2) + 'px) scale(' + s.toFixed(4) + ')';
      // Class thresholds for glass emphasis (not the scale source of truth).
      el.classList.toggle('is-focus', s >= MIN_SCALE + range * 0.72);
      el.classList.toggle('is-adjacent', s > MIN_SCALE + range * 0.18 && s < MIN_SCALE + range * 0.72);
    }
  }

  function magnifyIndex(idx) {
    const it = items[idx];
    if (!it) return;
    const rootRect = root.getBoundingClientRect();
    const scrollLeft = root.scrollLeft || 0;
    const cx = it.el.offsetLeft + it.el.offsetWidth / 2 - scrollLeft;
    applyMagnifyFromX(rootRect.left + cx);
  }

  function demagnify() {
    clearTransforms();
  }

  function focusedItemIndex() {
    const ae = typeof document !== 'undefined' ? document.activeElement : null;
    if (!ae) return -1;
    return items.findIndex((it) => it.el === ae || (it.el.contains && it.el.contains(ae)));
  }

  /**
   * @param {Array<{id,label,icon,readiness?:{state,label}}>} list
   */
  function setItems(list) {
    clearItems();
    if (!Array.isArray(list)) return;
    list.forEach((svc, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sf-fx-dock__item';
      btn.setAttribute('data-service', String(svc.id == null ? idx : svc.id));
      if (svc.icon) {
        const ic = document.createElement('span');
        ic.className = 'sf-fx-dock__icon';
        ic.setAttribute('aria-hidden', 'true');
        ic.textContent = String(svc.icon);
        btn.appendChild(ic);
      }
      const lbl = document.createElement('span');
      lbl.className = 'sf-fx-dock__label';
      lbl.textContent = String(svc.label || svc.id || '');
      btn.appendChild(lbl);
      const badge = document.createElement('span');
      badge.className = 'sf-fx-dock__badge';
      btn.appendChild(badge);
      btn.setAttribute('aria-label', String(svc.label || svc.id || 'service'));

      // Per-item focus still magnifies (keyboard parity). Pointer is handled on the root so the
      // continuous curve follows the cursor across the whole berth strip without mouseout flicker.
      on(btn, 'focus', () => magnifyIndex(idx));
      on(btn, 'click', () => { if (onSelect) onSelect(svc.id); });

      root.appendChild(btn);
      const item = { id: svc.id, el: btn, badgeEl: badge };
      items.push(item);
      if (svc.readiness) applyReadiness(item, svc.readiness);
    });
  }

  function applyReadiness(item, readiness) {
    const el = item.badgeEl;
    el.className = 'sf-fx-dock__badge';
    const cls = READY_CLASS[readiness.state];
    if (cls) el.classList.add(cls);
    el.textContent = String(readiness.label || '');
  }

  /** Update one item's readiness badge (state change only — static otherwise). */
  function setReadiness(id, readiness) {
    const item = items.find((x) => String(x.id) === String(id));
    if (item && readiness) applyReadiness(item, readiness);
  }

  /** Programmatically focus + magnify a service. */
  function setFocus(id) {
    const idx = items.findIndex((x) => String(x.id) === String(id));
    if (idx >= 0) {
      if (items[idx].el.focus) items[idx].el.focus();
      magnifyIndex(idx);
    }
  }

  function update(state) {
    if (!state) return;
    if (Array.isArray(state.items)) setItems(state.items);
    if (Array.isArray(state.readiness)) for (const rd of state.readiness) setReadiness(rd.id, rd);
  }

  function setActive(on2) {
    active = !!on2;
    if (!active) demagnify();
  }

  function dispose() {
    for (const b of bound) {
      if (b.el.removeEventListener) b.el.removeEventListener(b.type, b.fn);
    }
    bound.length = 0;
    items = [];
    if (root.parentNode) root.parentNode.removeChild(root);
  }

  // Continuous pointer tracking on the rail (Mac dock curve). No rAF — style writes on the event.
  on(root, 'pointermove', (e) => {
    if (!active) return;
    pointerInside = true;
    if (e && typeof e.clientX === 'number') applyMagnifyFromX(e.clientX);
  });
  on(root, 'pointerenter', (e) => {
    if (!active) return;
    pointerInside = true;
    if (e && typeof e.clientX === 'number') applyMagnifyFromX(e.clientX);
  });
  on(root, 'pointerleave', () => {
    pointerInside = false;
    // Keep magnify if keyboard focus is still on a dock item.
    const fi = focusedItemIndex();
    if (fi >= 0) magnifyIndex(fi);
    else demagnify();
  });
  on(root, 'focusout', (e) => {
    // Defer to next task so focusin on a sibling item can cancel demagnify.
    const related = e && e.relatedTarget;
    if (related && root.contains(related)) return;
    if (pointerInside) return;
    demagnify();
  });

  return { setItems, setReadiness, setFocus, update, setActive, dispose, root, cue: CUE };
}
