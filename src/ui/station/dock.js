// src/ui/station/dock.js — the station's kinetic command instrument.
// Destinations and immediate service verbs share one physical rail, but they do not share
// semantics. Pointer proximity bends the whole field; selection returns to equilibrium and
// latches into the rail. This is deliberately not a row of hover-scaling tabs.
import { icon } from './icons.js';

function tileHtml(item, kind) {
  const isNav = kind === 'nav';
  // Nav tiles are a real ARIA tablist: role=tab + roving tabindex + arrow-key navigation.
  const dataAttr = isNav
    ? `data-nav="${item.id}" role="tab" id="sx-tab-${item.id}" aria-controls="sx-panel" aria-selected="false" tabindex="-1"`
    : `data-act="${item.id}"`;
  const extra = isNav ? '' : ' sx-tile--act';
  return (
    `<button type="button" class="sx-tile${extra}" ${dataAttr} title="${item.title || item.label}" aria-label="${item.aria || item.label}">` +
      `<span class="sx-tile__seat" aria-hidden="true"></span>` +
      `<span class="sx-tile__badge" data-badge="${item.id}" hidden></span>` +
      `<span class="sx-tile__icon">${icon(item.icon, 26)}</span>` +
      `<span class="sx-tile__label">${item.label}</span>` +
      (kind === 'act' ? `<span class="sx-tile__cost" data-cost="${item.id}">—</span>` : '') +
    `</button>`
  );
}

/**
 * @param {object} cfg
 * @param {Array} cfg.destinations [{id,label,icon,title}]
 * @param {Array} cfg.actions      [{id,label,icon,title}]
 * @param {(id:string)=>void} cfg.onNavigate
 * @param {(id:string)=>void} cfg.onAction
 */
export function createCommandDock(cfg) {
  const { destinations = [], actions = [], onNavigate, onAction } = cfg;
  const el = document.createElement('div');
  el.className = 'sx-dock';
  el.setAttribute('role', 'toolbar');
  el.setAttribute('aria-label', 'Station command dock');
  el.setAttribute('aria-orientation', 'horizontal');
  el.innerHTML =
    `<div class="sx-dock__group sx-dock__group--nav" role="tablist">` +
      destinations.map((d) => tileHtml(d, 'nav')).join('') +
    `</div>` +
    `<div class="sx-dock__rule" aria-hidden="true"></div>` +
    `<div class="sx-dock__group sx-dock__group--act">` +
      actions.map((a) => tileHtml(a, 'act')).join('') +
    `</div>`;

  el.addEventListener('click', (ev) => {
    const nav = ev.target.closest('[data-nav]');
    if (nav) { onNavigate && onNavigate(nav.getAttribute('data-nav')); return; }
    const act = ev.target.closest('[data-act]');
    if (act && !act.classList.contains('is-disabled')) { onAction && onAction(act.getAttribute('data-act')); }
  });

  function setActive(id) {
    el.querySelectorAll('[data-nav]').forEach((t) => {
      const on = t.getAttribute('data-nav') === id;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.setAttribute('tabindex', on ? '0' : '-1'); // roving tab stop
    });
  }

  // Arrow / Home / End move between destinations (Enter+Space activate natively on <button>).
  const navGroup = el.querySelector('.sx-dock__group--nav');
  navGroup.addEventListener('keydown', (ev) => {
    const tabs = [...navGroup.querySelectorAll('[data-nav]')];
    const cur = tabs.indexOf(document.activeElement);
    if (cur < 0) return;
    let next = -1;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') next = (cur + 1) % tabs.length;
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') next = (cur - 1 + tabs.length) % tabs.length;
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = tabs.length - 1;
    else return;
    ev.preventDefault();
    tabs[next].focus();
    onNavigate && onNavigate(tabs[next].getAttribute('data-nav'));
  });

  // A distance field gives the dock its physical legibility: the item under the pointer responds
  // most, its neighbours yield less, and the rest remain seated. Work is event-bound, not an idle
  // animation loop. Keyboard focus gets an equivalent (and calmer) neighbour response.
  const motionQuery = typeof matchMedia === 'function'
    ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const tiles = [...el.querySelectorAll('.sx-tile')];
  let fieldFrame = 0;
  let pendingPointerX = null;

  function resetField() {
    for (const tile of tiles) {
      tile.style.setProperty('--dock-scale', '1');
      tile.style.setProperty('--dock-lift', '0px');
      tile.style.setProperty('--dock-near', '0');
    }
  }

  function applyPointerField(clientX) {
    fieldFrame = 0;
    if (motionQuery && motionQuery.matches) { resetField(); return; }
    const radius = Math.max(112, Math.min(176, el.getBoundingClientRect().width * 0.13));
    for (const tile of tiles) {
      const rect = tile.getBoundingClientRect();
      const distance = Math.abs(clientX - (rect.left + rect.width / 2));
      const proximity = Math.max(0, 1 - distance / radius);
      // Cosine easing keeps the field smooth at the radius edge. Service verbs move less than
      // destinations so cost labels remain easy to read while the rail is alive.
      const eased = (1 - Math.cos(proximity * Math.PI)) / 2;
      const peak = tile.hasAttribute('data-act') ? 0.18 : 0.30;
      tile.style.setProperty('--dock-scale', (1 + peak * eased).toFixed(4));
      tile.style.setProperty('--dock-lift', `${(-12 * eased).toFixed(2)}px`);
      tile.style.setProperty('--dock-near', eased.toFixed(4));
    }
  }

  function queuePointerField(clientX) {
    pendingPointerX = clientX;
    if (fieldFrame) return;
    fieldFrame = requestAnimationFrame(() => applyPointerField(pendingPointerX));
  }

  function applyKeyboardField(target) {
    resetField();
    if (!target || (motionQuery && motionQuery.matches)) return;
    const index = tiles.indexOf(target);
    if (index < 0) return;
    tiles.forEach((tile, i) => {
      const steps = Math.abs(i - index);
      const proximity = steps === 0 ? 1 : (steps === 1 ? 0.28 : 0);
      const peak = tile.hasAttribute('data-act') ? 0.16 : 0.25;
      tile.style.setProperty('--dock-scale', (1 + peak * proximity).toFixed(4));
      tile.style.setProperty('--dock-lift', `${(-10 * proximity).toFixed(2)}px`);
      tile.style.setProperty('--dock-near', proximity.toFixed(4));
    });
  }

  const onPointerMove = (ev) => queuePointerField(ev.clientX);
  const onPointerLeave = () => {
    pendingPointerX = null;
    if (fieldFrame) cancelAnimationFrame(fieldFrame);
    fieldFrame = 0;
    resetField();
  };
  const onFocusIn = (ev) => applyKeyboardField(ev.target.closest('.sx-tile'));
  const onFocusOut = (ev) => {
    if (!el.contains(ev.relatedTarget)) resetField();
  };
  el.addEventListener('pointermove', onPointerMove, { passive: true });
  el.addEventListener('pointerleave', onPointerLeave);
  el.addEventListener('focusin', onFocusIn);
  el.addEventListener('focusout', onFocusOut);
  resetField();

  /** cost = { text, disabled?, tone? } tone ∈ 'warn'|'gain'|'' */
  function setActionCost(id, cost) {
    const tile = el.querySelector(`[data-act="${id}"]`);
    const label = el.querySelector(`[data-cost="${id}"]`);
    if (!tile || !label) return;
    label.textContent = (cost && cost.text != null) ? cost.text : '—';
    tile.classList.toggle('is-disabled', !!(cost && cost.disabled));
    tile.setAttribute('aria-disabled', cost && cost.disabled ? 'true' : 'false');
    if (cost && cost.title) { tile.setAttribute('title', cost.title); tile.setAttribute('aria-label', cost.title); }
    label.classList.remove('is-warn', 'is-gain', 'is-loss');
    if (cost && cost.tone === 'warn') label.classList.add('is-warn');
    if (cost && cost.tone === 'gain') label.classList.add('is-gain');
    if (cost && cost.tone === 'loss') label.classList.add('is-loss');
  }

  /**
   * Pulse + badge a destination tile so the player knows which rail to open.
   * @param {string|null} id destination id, or null to clear all
   * @param {{ badge?: string|number, title?: string }|null} opts
   */
  function setAttention(id, opts = null) {
    el.querySelectorAll('[data-nav]').forEach((tile) => {
      const navId = tile.getAttribute('data-nav');
      const on = id != null && navId === id;
      tile.classList.toggle('is-attention', on);
      const badge = tile.querySelector(`[data-badge="${navId}"]`);
      if (!badge) return;
      if (on && opts && opts.badge != null && opts.badge !== '') {
        badge.hidden = false;
        badge.textContent = String(opts.badge);
      } else {
        badge.hidden = true;
        badge.textContent = '';
      }
      if (on && opts && opts.title) {
        tile.setAttribute('title', opts.title);
        tile.setAttribute('aria-label', opts.title);
      }
    });
  }

  function dispose() {
    if (fieldFrame) cancelAnimationFrame(fieldFrame);
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerleave', onPointerLeave);
    el.removeEventListener('focusin', onFocusIn);
    el.removeEventListener('focusout', onFocusOut);
  }

  return { el, setActive, setActionCost, setAttention, dispose };
}
