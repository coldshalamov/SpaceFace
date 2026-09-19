// Achievements — Field Hardware POSTER (PQ-033.03). The Credits register: hangar world, one reading
// plate, legend keys, quiet type. Unique chrome: styles/achievements.css.
// Rows come from the achievement ledger (src/systems/achievements.js): the live ledger the game
// booted, or the stored bag when it has not booted one, so the title and Pause read the same truth.
// Hidden achievements stay masked until earned; counted goals show their progress.
import { ACHIEVEMENT_CATEGORIES } from '../../data/achievements.js';
import { ACHIEVEMENT_UNLOCKED_EVENT, readAchievementRows } from '../../systems/achievements.js';
import { el, words, settle, cue } from '../kit/index.js';
import { injectDeckplate } from '../deckplate/index.js';

const ACHIEVEMENTS_SHEET_ID = 'of-achievements-css';

function ensureAchievementsStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(ACHIEVEMENTS_SHEET_ID)) return;
  const head = document.head || document.documentElement;
  if (!head || typeof head.appendChild !== 'function') return;
  const link = document.createElement('link');
  link.id = ACHIEVEMENTS_SHEET_ID;
  link.rel = 'stylesheet';
  try { link.href = new URL('../../../styles/achievements.css', import.meta.url).href; }
  catch { link.href = '/styles/achievements.css'; }
  head.appendChild(link);
}

export const ACHIEVEMENT_SECTIONS = Object.freeze([
  Object.freeze({ id: 'all', label: 'All' }),
  ...ACHIEVEMENT_CATEGORIES.map((category) => Object.freeze({ id: category.id, label: category.label })),
]);

function getManager(ctx) {
  if (ctx && ctx.screenManager) return ctx.screenManager;
  if (ctx && ctx.screens && ctx.screens.pushScreen) return ctx.screens;
  const ui = ctx && ctx.registry && ctx.registry.get && ctx.registry.get('ui');
  if (ui && ui.screenManager) return ui.screenManager;
  return null;
}

export function achievementSummaryText(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const unlocked = list.filter((row) => row.unlocked).length;
  if (!list.length) return 'No achievements yet.';
  if (unlocked === list.length) return `All ${list.length} unlocked.`;
  return `${unlocked} of ${list.length} unlocked.`;
}

export function rowsForSection(rows, sectionId) {
  const list = Array.isArray(rows) ? rows : [];
  return sectionId === 'all' ? list : list.filter((row) => row.category === sectionId);
}

/** One engraved fact row: a lit light when earned, the name and what it asks, then status. */
function achievementRow(row) {
  const item = el('li', 'k-row k-row--static fh-row of-achievements-row');
  item.dataset.id = row.id;
  item.dataset.state = row.unlocked ? 'unlocked' : 'locked';
  if (row.masked) item.dataset.masked = '1';
  const light = el('span', row.unlocked ? 'fh-light of-achievements-light' : 'of-achievements-light');
  if (row.unlocked) light.dataset.colour = 'good';
  light.setAttribute('aria-hidden', 'true');
  item.appendChild(light);
  const text = el('div', 'of-achievements-text');
  text.appendChild(el('span', 'k-row__name fh-emphasis', row.name));
  text.appendChild(el('div', 'k-row__sub fh-fine', row.description));
  item.appendChild(text);
  item.appendChild(el('span', 'k-row__num k-t-body k-62 fh-data', row.status));
  return item;
}

let refs = null;

export const achievementsScreen = {
  id: 'achievements',
  _section: 'all',

  mount(rootEl, ctx) {

    injectDeckplate();
    ensureAchievementsStyles();
    this._unsubscribe();
    rootEl.innerHTML = '';
    rootEl.classList.remove('panel', 'sf-menu');
    rootEl.classList.add('k-screen', 'of-achievements');
    rootEl.setAttribute('data-fh-register', 'poster');
    rootEl.setAttribute('aria-label', 'Achievements');

    const title = el('header', 'k-title');
    title.appendChild(el('h1', 'k-display k-t-title fh-title', 'Achievements'));
    const summary = el('p', 'k-t-emph k-62 fh-body', '');
    title.appendChild(summary);
    rootEl.appendChild(title);

    const hang = el('nav', 'k-hang');
    const sectionWords = words(ACHIEVEMENT_SECTIONS.map((s) => ({ label: s.label, action: s.id, current: s.id === this._section })), {
      size: 'emph',
      ariaLabel: 'Achievement categories',
      onPick: (action) => this._select(action),
    });
    for (const b of sectionWords.querySelectorAll('.k-word')) b.classList.add('fh-key', 'fh-key--legend');
    hang.appendChild(sectionWords);
    rootEl.appendChild(hang);

    const stage = el('section', 'k-stage k-stage--scroll fh-plate fh-plate--sunk');
    stage.setAttribute('aria-live', 'polite');
    rootEl.appendChild(stage);

    const foot = el('footer', 'k-foot');
    const back = words([{ label: 'Back', action: 'back' }], {
      size: 'emph',
      ariaLabel: 'Achievements actions',
      onPick: () => {
        const mgr = getManager(ctx);
        if (mgr && typeof mgr.popScreen === 'function') mgr.popScreen();
        else if (ctx && ctx.bus && typeof ctx.bus.emit === 'function') ctx.bus.emit('ui:popScreen', {});
      },
    });
    back.querySelector('.k-word')?.classList.add('sf-back');
    for (const b of back.querySelectorAll('.k-word')) b.classList.add('fh-key', 'fh-key--primary');
    foot.appendChild(back);
    rootEl.appendChild(foot);

    refs = { root: rootEl, title, summary, hang, stage, foot, sectionWords };
    // A live unlock while the screen is open (Pause holds the sim, but a Crucible settlement or a
    // shared-store merge can still land) repaints the plate instead of waiting for the next open.
    if (ctx && ctx.bus && typeof ctx.bus.on === 'function') {
      const off = ctx.bus.on(ACHIEVEMENT_UNLOCKED_EVENT, () => { if (refs) this._render({ quiet: true }); });
      this._off = typeof off === 'function' ? off : null;
    }
    this._render();
  },

  _unsubscribe() {
    if (typeof this._off === 'function') {
      try { this._off(); } catch (e) {}
    }
    this._off = null;
  },

  _select(id, { quiet = false } = {}) {
    if (!ACHIEVEMENT_SECTIONS.some((s) => s.id === id)) return;
    this._section = id;
    if (refs) {
      for (const b of refs.sectionWords.querySelectorAll('.k-word')) {
        const on = b.dataset.action === id;
        if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      }
    }
    if (!quiet) cue('move');
    this._render();
  },

  _render({ quiet = false } = {}) {
    if (!refs) return;
    let rows = [];
    try { rows = readAchievementRows(); } catch (e) { rows = []; }
    refs.summary.textContent = achievementSummaryText(rows);
    const stage = refs.stage;
    stage.innerHTML = '';
    if (!quiet) stage.scrollTop = 0;
    const section = ACHIEVEMENT_SECTIONS.find((s) => s.id === this._section) || ACHIEVEMENT_SECTIONS[0];
    const visible = rowsForSection(rows, section.id);
    const list = el('ul', 'k-rows of-achievements-rows');
    list.setAttribute('aria-label', section.id === 'all' ? 'All achievements' : `${section.label} achievements`);
    for (const row of visible) list.appendChild(achievementRow(row));
    stage.appendChild(list);
    if (!quiet) settle(stage, { from: 'left', state: 'achievements-' + section.id });
  },

  onShow() {
    if (!refs) return;
    this._render();
    settle(refs.title, { from: 'left', state: 'achievements-title' });
    settle(refs.hang, { from: 'left', delay: 60, state: 'achievements-hang' });
    settle(refs.foot, { from: 'bottom', delay: 120, state: 'achievements-foot' });
    refs.root.dataset.kReady = '1';
    const current = refs.sectionWords.querySelector('.k-word[aria-current="true"]') || refs.sectionWords.querySelector('.k-word');
    if (current) try { current.focus(); } catch (e) {}
    cue('open');
  },

  onHide() { cue('close'); },
  refresh() { this._render({ quiet: true }); },

  dispose() {
    this._unsubscribe();
    refs = null;
  },
};
