// FB-103 — the Statistics screen. It reads careerStats() and player.stats.
// It never writes them.
//
// ORRERY composition (design/frontend/ORRERY.md §6 Meta): the screen is a wall of witnessed
// deeds hung on a ladder, read beside the career instrument — one hero numeral (distance
// flown) with the career's short readings ruled under it. The full readings sheet (every
// counter the ledger keeps) stands under the deeds. Layout styles live in
// src/ui/orrery/achievementsLayouts.js (this unit's meta-ledger composition home) over the
// sheet styles in src/ui/orrery/statisticsLayouts.js.

import { careerStats } from '../../systems/achievements.js';
import { statisticsModel } from '../../core/statistics.js';
import { wantedTierInfo } from '../../systems/heat.js';
import { el, words, cue } from '../kit/index.js';
import { injectStatisticsLayouts } from '../orrery/statisticsLayouts.js';
import { injectMetaLedgerLayouts } from '../orrery/achievementsLayouts.js';
import { recordsWall } from '../../chronicler/recordsWall.js';

export const STATISTICS_LABEL = 'Records Wall';

function statisticsTitle() {
  const title = el('header', 'k-title');
  title.appendChild(el('h1', 'k-display k-t-title fh-title', STATISTICS_LABEL));
  title.appendChild(el('p', 'k-sentence', 'The things you did, where they happened, and who remembers.'));
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
  const root = el('div', 'sf-statistics orr-statistics__sheet');
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

/* The career instrument's own readings, from the same careerStats() snapshot the sheet reads. */

function careerClock(seconds) {
  const n = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  return h > 0 ? `${h} h ${m} m` : m > 0 ? `${m} m` : `${n} s`;
}

function careerFacts(career) {
  const bag = (career && career.counters) || {};
  const kills = Object.values(career && career.killsByWeapon || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const time = Object.values(career && career.timeBySector || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const fact = (label, value) => (value === null || value === undefined ? null : { label, value: String(value) });
  return [
    fact('Time flown', time > 0 ? careerClock(time) : null),
    fact('Jumps', Number(bag.jumps) > 0 ? Number(bag.jumps).toLocaleString('en-US') : null),
    fact('Docks', Number(bag.docks) > 0 ? Number(bag.docks).toLocaleString('en-US') : null),
    fact('Throws', Number(bag.throws) > 0 ? Number(bag.throws).toLocaleString('en-US') : null),
    fact('Kills', kills > 0 ? Math.round(kills).toLocaleString('en-US') : null),
    fact('Ships lost', Number(career && career.shipsLost) > 0 ? Number(career.shipsLost).toLocaleString('en-US') : null),
  ].filter(Boolean);
}

/** The career column: the hero reading and the short facts. Empty on an untouched ledger. */
function careerColumn(career) {
  const distance = Math.round(Number(career && career.distanceFlownWu) || 0);
  const facts = careerFacts(career);
  if (distance <= 0 && !facts.length) return null;
  const aside = el('aside', 'orr-statistics__career');
  aside.setAttribute('aria-label', 'Career at a glance');
  const hero = el('div', 'orr-statistics__hero');
  hero.appendChild(el('p', 'orr-statistics__hero-label', 'Distance flown'));
  const numeral = el('p', 'orr-statistics__hero-n');
  numeral.appendChild(el('span', 'orr-statistics__hero-v', distance.toLocaleString('en-US')));
  if (distance > 0) numeral.appendChild(el('span', 'orr-statistics__hero-u', 'u'));
  hero.appendChild(numeral);
  aside.appendChild(hero);
  aside.appendChild(el('div', 'orr-statistics__hero-rule'));
  if (facts.length) {
    const list = el('ul', 'orr-statistics__facts');
    for (const f of facts) {
      const li = el('li', 'orr-statistics__fact');
      li.appendChild(el('span', 'orr-statistics__fact-w', f.label));
      li.appendChild(el('span', 'orr-statistics__fact-n', f.value));
      list.appendChild(li);
    }
    aside.appendChild(list);
  }
  return aside;
}

/** The witnessed-deeds ladder. Each record hangs on a tick of the rail by when it happened. */
function recordsLadder(records) {
  const rungs = el('ol', 'orr-statistics__rungs');
  rungs.setAttribute('aria-label', 'Witnessed deeds');
  for (const record of records) {
    const li = el('li', 'orr-statistics__rung');
    li.appendChild(el('p', 'orr-statistics__rung-title', record.title));
    li.appendChild(el('p', 'orr-statistics__rung-text', record.text));
    li.appendChild(el('p', 'orr-statistics__rung-meta', `${record.place} · ${record.time} flown`));
    rungs.appendChild(li);
  }
  return rungs;
}

/** The five readings the ledger keeps, named on a quiet scale — what this page would count.
 *  Decorative words, not an outline: they are plain list items under the group's own label, never
 *  role="heading" — five empty level-2 headings announced nothing but noise to assistive tech. */
function promiseScale() {
  const ul = el('ul', 'orr-statistics__promise-scale');
  ul.setAttribute('aria-label', 'What the record counts');
  const scale = [
    ['Flight', 'Distance flown, jumps, docks, time in each sector'],
    ['Line', 'Biggest throw, latches, razor releases'],
    ['Fight', 'Kills by weapon, ships lost'],
    ['Trade', 'Trades, profit, ore hauled, contracts'],
    ['Law', 'Wanted status, heat, outstanding fines'],
  ];
  for (const [word, counts] of scale) {
    const li = el('li', 'orr-statistics__promise-word');
    li.appendChild(el('span', 'orr-statistics__promise-name', word));
    li.appendChild(el('span', 'orr-statistics__promise-counts', counts));
    ul.appendChild(li);
  }
  return ul;
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
    injectMetaLedgerLayouts();
    rootEl.innerHTML = '';
    rootEl.classList.remove('panel', 'sf-menu');
    rootEl.classList.add('k-screen', 'k-screen--stage', 'orr-statistics');
    rootEl.setAttribute('aria-label', STATISTICS_LABEL);
    const player = ctx && ctx.state && ctx.state.player;
    const fine = ctx && ctx.state && ctx.state.lawSecurity && ctx.state.lawSecurity.fineOffer;
    const career = careerStats();
    const model = statisticsModel({
      career,
      playerStats: (player && player.stats) || {},
      law: player ? {
        heat: Number(player.heat) || 0,
        wanted: wantedTierInfo(Number(player.heat) || 0).label,
        fines: fine && fine.status !== 'paid' ? Number(fine.amount) || 0 : 0,
      } : null,
    });
    rootEl.appendChild(statisticsTitle());
    const lived = sheetHasReadings(model);
    const stage = el('div', 'sf-statistics k-stage k-hang orr-statistics__stage');
    stage.setAttribute('data-sf-scroll', 'records');
    const wall = el('section', 'orr-statistics__wall');
    wall.setAttribute('aria-label', 'Witnessed deeds and career readings');
    const records = recordsWall(ctx?.state);
    if (!records.length && !lived) {
      // A fresh ledger: one voice for the whole wall, then the scale of what would be counted.
      wall.appendChild(el('p', 'k-sentence orr-statistics__empty',
        'Nothing on the record yet — fly, haul, and fight, and this page starts counting.'));
      wall.appendChild(promiseScale());
    } else {
      if (!records.length) {
        wall.appendChild(el('p', 'k-sentence orr-statistics__empty',
          'No witnessed deeds yet. Haul a load, rescue a pod, or finish a fight; the record keeps its place and time.'));
      } else {
        wall.appendChild(recordsLadder(records));
      }
      wall.appendChild(renderStatistics(model, { withTitle: false }));
    }
    stage.appendChild(wall);
    const careerAside = lived ? careerColumn(career) : null;
    if (careerAside) stage.appendChild(careerAside);
    rootEl.appendChild(stage);
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
