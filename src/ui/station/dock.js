import { iconHtml, escapeMarkup } from '../views/identity.js';
// Station destinations: an explicit facility rail, horizontal on narrow screens.
// A real ARIA tablist of kit words: role=tab, roving tabindex, arrow keys, aria-current on the live
// one. The pointer/keyboard distance field still writes --dock-scale / --dock-lift / --dock-near on
// each word (the tab-navigation check reads them); the sheet no longer applies them — words do not
// grow. `.sx-dock`, `.sx-dock__group--nav`, `.sx-tile`, `.sx-tile__seat`, `data-nav`, `sx-tab-<id>`
// are inert hooks the station checks query.

function tileHtml(item, kind) {
  const isNav = kind === 'nav';
  const dataAttr = isNav
    ? `data-nav="${item.id}" role="tab" id="sx-tab-${item.id}" aria-controls="sx-panel" aria-selected="false" tabindex="-1"`
    : `data-act="${item.id}"`;
  const extra = isNav ? '' : ' sx-tile--act';
  return (
    `<li><button type="button" class="k-word k-word--body sx-tile${extra}" ${dataAttr} aria-label="${escapeMarkup(item.aria || item.label)}">` +
      `<span class="sx-tile__seat" aria-hidden="true">${iconHtml(item.id)}</span>` +
      `<span class="sx-tile__badge k-t-fine k-signal" data-badge="${item.id}" hidden></span>` +
      `<span class="sx-tile__label">${escapeMarkup(item.label)}</span>` +
      (kind === 'act' ? `<span class="sx-tile__cost k-t-fine k-38" data-cost="${item.id}">—</span>` : '') +
    `</button></li>`
  );
}

/**
 * @param {object} cfg
 * @param {Array} cfg.destinations [{id,label,title}]
 * @param {Array} cfg.actions      [{id,label,title}]
 * @param {(id:string)=>void} cfg.onNavigate
 * @param {(id:string)=>void} cfg.onAction
 */
export function createCommandDock(cfg) {
  const { destinations = [], actions = [], onNavigate, onAction } = cfg;
  const el = document.createElement('div');
  el.className = 'sx-dock';
  el.setAttribute('role', 'toolbar');
  el.setAttribute('aria-label', 'Station destinations');
  el.setAttribute('aria-orientation', 'vertical');
  el.innerHTML =
    `<ul class="k-words k-words--row sx-dock__group sx-dock__group--nav" role="tablist" aria-orientation="vertical" aria-label="Destinations">` +
      destinations.map((d) => tileHtml(d, 'nav')).join('') +
    `</ul>` +
    (actions.length
      ? `<ul class="k-words k-words--row sx-dock__group sx-dock__group--act">${actions.map((a) => tileHtml(a, 'act')).join('')}</ul>`
      : '');

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
      if (on) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current');
      t.setAttribute('tabindex', on ? '0' : '-1'); // roving tab stop
    });
  }

  // Arrow / Home / End move between destinations (Enter+Space activate natively on <button>).
  const navGroup = el.querySelector('.sx-dock__group--nav');
  const narrowQuery = typeof matchMedia === 'function' ? matchMedia('(max-width: 899px)') : null;
  const syncOrientation = () => {
    const direction = narrowQuery?.matches ? 'horizontal' : 'vertical';
    el.setAttribute('aria-orientation', direction);
    navGroup.setAttribute('aria-orientation', direction);
  };
  syncOrientation();
  narrowQuery?.addEventListener?.('change', syncOrientation);
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

  // The distance field: event-bound, writes custom properties only. The sheet ignores them (words
  // do not grow); the values remain a legible, testable record of pointer proximity.
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
    const text = (cost && cost.text != null) ? String(cost.text) : '—';
    if (label.textContent !== text) label.textContent = text;
    tile.classList.toggle('is-disabled', !!(cost && cost.disabled));
    setAttributeIfChanged(tile, 'aria-disabled', cost && cost.disabled ? 'true' : 'false');
    if (cost && cost.title) {
      setAttributeIfChanged(tile, 'title', cost.title);
      setAttributeIfChanged(tile, 'aria-label', cost.title);
    }
    const tone = cost && ['warn', 'gain', 'loss'].includes(cost.tone) ? `is-${cost.tone}` : '';
    for (const name of ['is-warn', 'is-gain', 'is-loss']) label.classList.toggle(name, name === tone);
  }

  /**
   * Badge a destination word so the player knows which one needs them (a fine-print signal mark
   * before the word; no pulse).
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
        if (badge.hidden) badge.hidden = false;
        const badgeText = String(opts.badge);
        if (badge.textContent !== badgeText) badge.textContent = badgeText;
      } else {
        if (!badge.hidden) badge.hidden = true;
        if (badge.textContent) badge.textContent = '';
      }
      if (on && opts && opts.title) {
        setAttributeIfChanged(tile, 'title', opts.title);
        setAttributeIfChanged(tile, 'aria-label', opts.title);
      }
    });
  }

  function dispose() {
    narrowQuery?.removeEventListener?.('change', syncOrientation);
    if (fieldFrame) cancelAnimationFrame(fieldFrame);
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerleave', onPointerLeave);
    el.removeEventListener('focusin', onFocusIn);
    el.removeEventListener('focusout', onFocusOut);
  }

  return { el, setActive, setActionCost, setAttention, dispose };
}

function setAttributeIfChanged(node, name, value) {
  const next = String(value);
  if (node.getAttribute(name) !== next) node.setAttribute(name, next);
}
