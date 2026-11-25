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
import { ACHIEVEMENTS } from '../../data/achievements.js';
import { el, words, cue } from '../kit/index.js';
import { injectStatisticsLayouts } from '../orrery/statisticsLayouts.js';
import { injectMetaLedgerLayouts } from '../orrery/achievementsLayouts.js';
import { stagger, reducedMotion } from '../orrery/motion.js';
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

// The ledger's internal names. The wall says what the player did.
const PLAIN_ROW_NAMES = {
  'Razor releases': 'Swing releases',
  'Crushing impacts': 'Hard hits',
};

function countOf(bag, key) {
  const n = Number(bag && bag[key]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function formatFlownDistance(wu) {
  const m = Math.max(0, Math.round(Number(wu) || 0));
  if (m < 1000) return m.toLocaleString('en-US') + ' m';
  const km = m / 1000;
  const rounded = km >= 100 ? Math.round(km) : Math.round(km * 10) / 10;
  return rounded.toLocaleString('en-US') + ' km';
}

const NEXT_WORDS = {
  jumps: (left) => (left === 1 ? 'Next: make one jump' : 'Next: ' + left.toLocaleString('en-US') + ' jumps'),
  docks: (left) => (left === 1 ? 'Next: dock once' : 'Next: dock ' + left.toLocaleString('en-US') + ' times'),
  latches: (left) => (left === 1 ? 'Next: latch the Line once' : 'Next: ' + left.toLocaleString('en-US') + ' latches'),
  throws: (left) => (left === 1 ? 'Next: throw once' : 'Next: ' + left.toLocaleString('en-US') + ' throws'),
  razorReleases: (left) => (left === 1 ? 'Next: let go at the top of a swing' : 'Next: ' + left.toLocaleString('en-US') + ' timed releases'),
  crushingImpacts: (left) => (left === 1 ? 'Next: land one hard hit with a throw' : 'Next: ' + left.toLocaleString('en-US') + ' hard hits'),
  oreUnits: (left) => (left === 1 ? 'Next: haul ore once' : 'Next: haul ' + left.toLocaleString('en-US') + ' ore'),
  trades: (left) => (left === 1 ? 'Next: finish one trade' : 'Next: ' + left.toLocaleString('en-US') + ' trades'),
  contracts: (left) => (left === 1 ? 'Next: finish one job' : 'Next: finish ' + left.toLocaleString('en-US') + ' jobs'),
};

function nextWords(key, current) {
  const speak = NEXT_WORDS[key];
  if (!speak) return '';
  let next = Infinity;
  for (const def of ACHIEVEMENTS) {
    const rule = def && def.rule;
    if (!rule || rule.source !== 'counter' || rule.key !== key || def.hidden === true) continue;
    const target = Number(rule.target);
    if (Number.isFinite(target) && target > current && target < next) next = target;
  }
  if (!Number.isFinite(next)) return '';
  return speak(next - current);
}

/** Honest zeroed counts and the next real mark. No row for a number the game does not keep. */
export function recordsMilestoneRows({ career = {}, playerStats = {}, law = null } = {}) {
  const stats = playerStats && typeof playerStats === 'object' ? playerStats : {};
  const bag = career && career.counters;
  const kills = Object.values((career && career.killsByWeapon) || {}).reduce((sum, value) => {
    const n = Number(value);
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
  const row = (group, label, value, next) => ({ group, label, value, next: next || '' });
  const marked = (group, label, key, source, goalKey = key) => {
    const current = countOf(source, key);
    return row(group, label, current.toLocaleString('en-US'), nextWords(goalKey, current));
  };
  const rows = [
    row('Flight', 'Distance flown', formatFlownDistance(career && career.distanceFlownWu), ''),
    marked('Flight', 'Jumps', 'jumps', bag),
    marked('Flight', 'Docks', 'docks', bag),
    row('Line', 'Biggest throw', Math.round(countOf(career, 'biggestThrowSpeed')).toLocaleString('en-US') + ' m/s', ''),
    marked('Line', 'Latches', 'latches', bag),
    marked('Line', 'Throws', 'throws', bag),
    marked('Line', 'Swing releases', 'razorReleases', bag),
    marked('Line', 'Hard hits', 'crushingImpacts', bag),
    row('Fight', 'Kills', Math.round(kills).toLocaleString('en-US'), ''),
    row('Fight', 'Ships lost', Math.round(countOf(career, 'shipsLost')).toLocaleString('en-US'), ''),
    marked('Trade', 'Trades', 'tradesCount', stats, 'trades'),
    marked('Trade', 'Ore hauled', 'oreUnits', bag),
    marked('Trade', 'Jobs finished', 'contracts', bag),
  ];
  if (law && law.wanted != null) rows.push(row('Law', 'Status', String(law.wanted), ''));
  if (law && Number.isFinite(Number(law.heat))) {
    rows.push(row('Law', 'Heat', Math.round(Number(law.heat) * 100).toLocaleString('en-US') + '%', ''));
  }
  return rows;
}

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
      left.appendChild(el('span', 'k-row__name', PLAIN_ROW_NAMES[name] || name));
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

function careerFacts(career, { zeros = false } = {}) {
  const bag = (career && career.counters) || {};
  const kills = Object.values(career && career.killsByWeapon || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const time = Object.values(career && career.timeBySector || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const fact = (label, value, present) => ((present || zeros) ? { label, value: String(value) } : null);
  return [
    fact('Time flown', time > 0 ? careerClock(time) : '0 s', time > 0),
    fact('Jumps', Number(bag.jumps) > 0 ? Number(bag.jumps).toLocaleString('en-US') : '0', Number(bag.jumps) > 0),
    fact('Docks', Number(bag.docks) > 0 ? Number(bag.docks).toLocaleString('en-US') : '0', Number(bag.docks) > 0),
    fact('Throws', Number(bag.throws) > 0 ? Number(bag.throws).toLocaleString('en-US') : '0', Number(bag.throws) > 0),
    fact('Kills', kills > 0 ? Math.round(kills).toLocaleString('en-US') : '0', kills > 0),
    fact('Ships lost', Number(career && career.shipsLost) > 0 ? Number(career.shipsLost).toLocaleString('en-US') : '0', Number(career && career.shipsLost) > 0),
  ].filter(Boolean);
}

/** The career column: the hero reading and the short facts. Empty on an untouched ledger unless zeros are asked for. */
function careerColumn(career, { zeros = false } = {}) {
  const distance = Math.round(Number(career && career.distanceFlownWu) || 0);
  const facts = careerFacts(career, { zeros });
  if (!zeros && distance <= 0 && !facts.length) return null;
  const aside = el('aside', 'orr-statistics__career');
  aside.setAttribute('aria-label', 'Career at a glance');
  const hero = el('div', 'orr-statistics__hero');
  hero.appendChild(el('p', 'orr-statistics__hero-label', 'Distance flown'));
  const numeral = el('p', 'orr-statistics__hero-n');
  numeral.appendChild(el('span', 'orr-statistics__hero-v', distance.toLocaleString('en-US')));
  if (distance > 0 || zeros) numeral.appendChild(el('span', 'orr-statistics__hero-u', 'm'));
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

/** The fresh ledger: real counts at zero, and the next mark the game actually keeps. */
function milestoneBoard(rows) {
  const board = el('div', 'orr-statistics__marks');
  board.setAttribute('aria-label', 'Record counts');
  let group = '';
  let list = null;
  for (const row of rows) {
    if (row.group !== group) {
      group = row.group;
      const band = el('section', 'orr-statistics__mark-group');
      const heading = el('p', 'k-caps', group);
      heading.setAttribute('role', 'heading');
      heading.setAttribute('aria-level', '2');
      band.appendChild(heading);
      list = el('ul', 'orr-statistics__mark-rows');
      band.appendChild(list);
      board.appendChild(band);
    }
    const li = el('li', 'orr-statistics__mark');
    li.appendChild(el('span', 'orr-statistics__mark-name', row.label));
    li.appendChild(el('span', 'orr-statistics__mark-value', row.value));
    if (row.next) li.appendChild(el('span', 'orr-statistics__mark-next', row.next));
    list.appendChild(li);
  }
  return board;
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
    const fresh = !records.length && !lived;
    if (fresh) {
      wall.appendChild(el('p', 'k-sentence orr-statistics__empty', 'The record starts at zero.'));
      wall.appendChild(milestoneBoard(recordsMilestoneRows({
        career,
        playerStats: (player && player.stats) || {},
        law: player ? {
          heat: Number(player.heat) || 0,
          wanted: wantedTierInfo(Number(player.heat) || 0).label,
        } : null,
      })));
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
    const careerAside = fresh ? careerColumn(career, { zeros: true }) : (lived ? careerColumn(career) : null);
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
    // Arrival (ORRERY §3.5): title, then the wall's rungs and bands, then the career instrument,
    // then the foot — each rising in turn. refresh() runs only on mount and show for this modal
    // (periodic is a no-op), so no in-place update ever replays the entrance; reduced motion and
    // the fake-DOM gamepad host keep the still.
    if (!reducedMotion()) {
      const arrivals = [
        rootEl.querySelector('.k-title'),
        ...rootEl.querySelectorAll(
          '.orr-statistics__rung, .sf-statistics__group, .orr-statistics__empty, .orr-statistics__mark-group, .orr-statistics__career'),
        foot,
      ].filter(Boolean);
      stagger(arrivals, { base: 40, step: 36 });
      for (const node of arrivals) node.classList.add('orr-rise');
    }
  },
  dispose() { this._root = null; },
};
