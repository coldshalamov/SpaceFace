// FB-103 — the Statistics screen. It reads careerStats() and player.stats.
// It never writes them.

import { careerStats } from '../../systems/achievements.js';
import { statisticsModel } from '../../core/statistics.js';
import { wantedTierInfo } from '../../systems/heat.js';
import { el, words, cue } from '../kit/index.js';
import { injectStatisticsLayouts } from '../orrery/statisticsLayouts.js';

export const STATISTICS_LABEL = 'Statistics';

function statisticsTitle() {
  const title = el('header', 'k-title');
  title.appendChild(el('h1', 'k-display k-t-title fh-title', STATISTICS_LABEL));
  title.appendChild(el('p', 'k-sentence', 'Distance, the line, fights, and what the holds earned.'));
  return title;
}

// A formatted reading that is still zero — '0', '0 wu', '0.00%', '0 h 0 m'.
const ZERO_READING = /^0(?:\.0+)?(?:\s.*)?$/;

function sheetHasReadings(sheet) {
  for (const group of sheet.groups || []) {
    for (const [name, value] of group.rows || []) {
      // The law 'Status' row carries the baseline label ('Clean'), not a measurement —
      // it cannot make an untouched ledger look lived-in on its own.
      if (group.id === 'law' && name === 'Status') continue;
      if (!ZERO_READING.test(String(value))) return true;
    }
  }
  return false;
}

export function renderStatistics(model, { withTitle = true } = {}) {
  const sheet = model && Array.isArray(model.groups) ? model : statisticsModel();
  const root = el('div', 'sf-statistics k-hang k-stage');
  root.setAttribute('data-sf-scroll', 'statistics');
  root.tabIndex = 0;
  root.setAttribute('aria-label', 'Statistics readings');
  if (withTitle) root.appendChild(statisticsTitle());
  if (!sheetHasReadings(sheet)) {
    root.appendChild(el('p', 'k-sentence sf-statistics__empty',
      'Nothing on the record yet — fly, haul, and fight, and this page starts counting.'));
    return root;
  }
  for (const group of sheet.groups) {
    const band = el('section', 'sf-statistics__group');
    band.dataset.group = group.id;
    const heading = el('p', 'k-caps', group.label);
    heading.setAttribute('role', 'heading');
    heading.setAttribute('aria-level', '2');
    band.appendChild(heading);
    if (group.note && !(group.rows && group.rows.length)) {
      band.appendChild(el('p', 'k-sentence', group.note));
      root.appendChild(band);
      continue;
    }
    const list = el('ul', 'k-rows');
    for (const [name, value] of group.rows) {
      const li = el('li', 'k-row k-row--static');
      const left = el('div');
      left.appendChild(el('span', 'k-row__name', name));
      li.appendChild(left);
      li.appendChild(el('span', 'k-row__num', value));
      list.appendChild(li);
    }
    band.appendChild(list);
    root.appendChild(band);
  }
  return root;
}

function close(ctx) {
  const ui = ctx && ctx.registry && ctx.registry.get && ctx.registry.get('ui');
  const mgr = (ctx && ctx.screenManager) || (ui && ui.screenManager) || null;
  if (mgr && typeof mgr.popScreen === 'function') { mgr.popScreen(); return; }
  if (ctx && ctx.bus) ctx.bus.emit('ui:popScreen', {});
}

export const statisticsScreen = {
  id: 'statistics',

  mount(rootEl, ctx) {
    this._root = rootEl;
    this.refresh(ctx);
  },

  onShow(ctx) { this.refresh(ctx); },

  refresh(ctx, options = {}) {
    if (options.periodic) return; // This modal pauses the simulation; refresh on each arrival.
    const rootEl = this._root;
    if (!rootEl) return;
    injectStatisticsLayouts();
    rootEl.innerHTML = '';
    rootEl.classList.remove('panel', 'sf-menu');
    rootEl.classList.add('k-screen', 'k-screen--stage', 'orr-statistics');
    rootEl.setAttribute('aria-label', STATISTICS_LABEL);
    const player = ctx && ctx.state && ctx.state.player;
    const fine = ctx && ctx.state && ctx.state.lawSecurity && ctx.state.lawSecurity.fineOffer;
    const model = statisticsModel({
      career: careerStats(),
      playerStats: (player && player.stats) || {},
      law: player ? {
        heat: Number(player.heat) || 0,
        wanted: wantedTierInfo(Number(player.heat) || 0).label,
        fines: fine && fine.status !== 'paid' ? Number(fine.amount) || 0 : 0,
      } : null,
    });
    rootEl.appendChild(statisticsTitle());
    rootEl.appendChild(renderStatistics(model, { withTitle: false }));
    const back = words([{ label: 'Back', action: 'back' }], {
      row: true,
      size: 'emph',
      ariaLabel: 'Statistics actions',
      onPick: () => { cue('confirm'); close(ctx); },
    });
    back.querySelector('.k-word')?.classList.add('sf-back');
    const foot = el('footer', 'k-foot');
    foot.appendChild(back);
    rootEl.appendChild(foot);
  },
  dispose() { this._root = null; },
};
