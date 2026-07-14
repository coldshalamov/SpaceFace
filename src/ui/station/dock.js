// src/ui/station/dock.js — the one Command Dock: destinations + dock actions in a single bar.
// Destinations navigate (active one SEATS/lights, it does not stay floating). Actions fire
// instantly and carry a live cost label. Hover gives a refined single-tile lift, never the
// over-eager neighbour bounce.
import { icon } from './icons.js';

function tileHtml(item, kind) {
  const dataAttr = kind === 'nav' ? `data-nav="${item.id}"` : `data-act="${item.id}"`;
  const extra = kind === 'nav' ? '' : ' sx-tile--act';
  return (
    `<button type="button" class="sx-tile${extra}" ${dataAttr} title="${item.title || item.label}" aria-label="${item.aria || item.label}">` +
      `<span class="sx-tile__seat" aria-hidden="true"></span>` +
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
    });
  }

  /** cost = { text, disabled?, tone? } tone ∈ 'warn'|'gain'|'' */
  function setActionCost(id, cost) {
    const tile = el.querySelector(`[data-act="${id}"]`);
    const label = el.querySelector(`[data-cost="${id}"]`);
    if (!tile || !label) return;
    label.textContent = (cost && cost.text != null) ? cost.text : '—';
    tile.classList.toggle('is-disabled', !!(cost && cost.disabled));
    tile.setAttribute('aria-disabled', cost && cost.disabled ? 'true' : 'false');
    label.classList.remove('is-warn', 'is-gain');
    if (cost && cost.tone === 'warn') label.classList.add('is-warn');
    if (cost && cost.tone === 'gain') label.classList.add('is-gain');
  }

  return { el, setActive, setActionCost };
}
