// dockRail.js — Service Dock. Pattern after Magic UI "dock" (reference only).
// SpaceFace meaning: a rail of station/tool services (refuel, repair, ammo, market, missions…) read
// as a physical berth control strip. The focused service magnifies + reveals its readiness.
//
// Keyboard parity is a hard requirement: focus is treated identically to hover (both magnify the item
// and its neighbours). Magnify is transform:scale ONLY (never width/margin — that thrashes layout).
// Reduced motion drops the scale but KEEPS the :focus-visible outline. No `:has()` (JS sets neighbour
// classes). No rAF — pure CSS + delegated pointer/focus state.
import { ensureFxCss } from './effectRuntime.js';

export const CUE = Object.freeze({
  effect: 'dockRail',
  screens: ['stationHub', 'automation', 'outfitting'],
  triggers: ['hover', 'focus'],
  maxMs: 150,
  loop: false,
});

const CSS_ID = 'sf-fx-dock-css';
const CSS = `
.sf-fx-dock { display:flex; gap: var(--sp-2, 8px); align-items:flex-end; }
.sf-fx-dock__item {
  display:inline-flex; flex-direction:column; align-items:center; gap:2px;
  background: color-mix(in srgb, var(--ink-mute) 12%, transparent);
  color: var(--ink);
  border: 1px solid color-mix(in srgb, var(--ink-mute) 40%, transparent);
  border-radius: var(--r-2, 8px);
  padding: var(--sp-2, 8px);
  font: inherit; cursor: pointer;
  transform-origin: bottom center;
  transition: transform 140ms var(--ease, ease-out);
}
.sf-fx-dock__item:hover,
.sf-fx-dock__item:focus-visible,
.sf-fx-dock__item.is-focus { transform: scale(1.18); }
.sf-fx-dock__item.is-adjacent { transform: scale(1.08); }
.sf-fx-dock__item:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.sf-fx-dock__icon { font-size: 1.25em; line-height: 1; }
.sf-fx-dock__label { font-size: 0.8em; color: var(--ink-dim); }
.sf-fx-dock__badge { font-size: 0.7em; color: var(--ink-mute); }
.sf-fx-dock__badge--good { color: var(--good); }
.sf-fx-dock__badge--warn { color: var(--warn); }
.sf-fx-dock__badge--danger { color: var(--danger); }
@media (prefers-reduced-motion: reduce) {
  .sf-fx-dock__item { transition: none; }
  .sf-fx-dock__item:hover,
  .sf-fx-dock__item:focus-visible,
  .sf-fx-dock__item.is-focus,
  .sf-fx-dock__item.is-adjacent { transform: none; }
}
html.sf-reduce-motion .sf-fx-dock__item { transition: none; }
html.sf-reduce-motion .sf-fx-dock__item:hover,
html.sf-reduce-motion .sf-fx-dock__item:focus-visible,
html.sf-reduce-motion .sf-fx-dock__item.is-focus,
html.sf-reduce-motion .sf-fx-dock__item.is-adjacent { transform: none; }
`;

const READY_CLASS = { good: 'sf-fx-dock__badge--good', warn: 'sf-fx-dock__badge--warn', danger: 'sf-fx-dock__badge--danger' };

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
  const bound = [];     // { el, type, fn } for teardown

  function on(el, type, fn) { el.addEventListener(type, fn); bound.push({ el, type, fn }); }

  function clearItems() {
    for (const b of bound) { if (b.el.removeEventListener) b.el.removeEventListener(b.type, b.fn); }
    bound.length = 0;
    while (root.children && root.children.length) root.removeChild(root.children[root.children.length - 1]);
    items = [];
  }

  function magnify(idx) {
    demagnify();
    if (!active) return;
    const it = items[idx];
    if (!it) return;
    it.el.classList.add('is-focus');
    if (items[idx - 1]) items[idx - 1].el.classList.add('is-adjacent');
    if (items[idx + 1]) items[idx + 1].el.classList.add('is-adjacent');
  }
  function demagnify() {
    for (const it of items) { it.el.classList.remove('is-focus'); it.el.classList.remove('is-adjacent'); }
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

      // keyboard focus is treated identically to hover (the a11y parity requirement)
      on(btn, 'mouseover', () => magnify(idx));
      on(btn, 'mouseout', () => demagnify());
      on(btn, 'focus', () => magnify(idx));
      on(btn, 'blur', () => demagnify());
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
    if (idx >= 0) { if (items[idx].el.focus) items[idx].el.focus(); magnify(idx); }
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
    clearItems();
    if (root.parentNode) root.parentNode.removeChild(root);
  }

  return { setItems, setReadiness, setFocus, update, setActive, dispose, root, cue: CUE };
}
