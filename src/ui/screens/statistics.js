// FB-103 — the Statistics screen. It reads careerStats() and player.stats.
// It never writes them.

import { careerStats } from '../../systems/achievements.js';
import { statisticsModel } from '../../core/statistics.js';
import { el, words, cue } from '../kit/index.js';

export const STATISTICS_LABEL = 'Statistics';

export function renderStatistics(model) {
  const sheet = model && Array.isArray(model.groups) ? model : statisticsModel();
  const root = el('div', 'sf-statistics');
  const title = el('header', 'k-title');
  title.appendChild(el('h1', 'k-display k-t-title', STATISTICS_LABEL));
  title.appendChild(el('p', 'k-sentence', 'Career figures. This screen only reads them.'));
  root.appendChild(title);
  for (const group of sheet.groups) {
    const band = el('section', 'sf-statistics__group');
    band.dataset.group = group.id;
    const heading = el('p', 'k-caps', group.label);
    heading.setAttribute('role', 'heading');
    heading.setAttribute('aria-level', '2');
    band.appendChild(heading);
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
    rootEl.innerHTML = '';
    rootEl.classList.add('k-screen', 'k-screen--stage');
    rootEl.setAttribute('aria-label', STATISTICS_LABEL);
    const player = ctx && ctx.state && ctx.state.player;
    const model = statisticsModel({
      career: careerStats(),
      playerStats: (player && player.stats) || {},
    });
    rootEl.appendChild(renderStatistics(model));
    const back = words([{ label: 'Back', action: 'back', primary: true }], {
      row: true,
      size: 'emph',
      ariaLabel: 'Statistics actions',
      onPick: () => { cue('confirm'); close(ctx); },
    });
    rootEl.appendChild(back);
  },
};
