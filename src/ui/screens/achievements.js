// Achievements — ORRERY (design/frontend/ORRERY.md §6 Meta: "medal Arc Gauges on a ring grid"). Every
// deed is a medal on the Medal Orrery (src/ui/orrery/constellationMedals.js): the four categories are
// orbits round a hero gauge of the medals you hold, each medal its produced art inside an Arc Gauge of
// its progress. The one amber Hand is an arm from the gauge to the chosen medal, and choosing TURNS the
// orbit until the medal stands under it; choosing a category turns that orbit to its first medal and
// brings it to the front. The chosen medal's line is read beside the orrery (its gauge large, its name,
// what it asks, how far along it is). The categories are words on a scale. The composition is
// src/ui/orrery/constellationLayouts.js.
// Rows come from the achievement ledger (src/systems/achievements.js): the live ledger the game
// booted, or the stored bag when it has not booted one, so the title and Pause read the same truth.
// Hidden achievements stay masked until earned; counted goals show their progress.
import { ACHIEVEMENT_CATEGORIES } from '../../data/achievements.js';
import { ACHIEVEMENT_UNLOCKED_EVENT, readAchievementRows } from '../../systems/achievements.js';
import { el, words, settle, cue } from '../kit/index.js';
import { injectDeckplate, dpIcon } from '../deckplate/index.js';
import { createMedalOrrery, createWordScale, medalDialSvg, medalProgress, medalState } from '../orrery/constellationMedals.js';
import { injectConstellationScreens } from '../orrery/constellationLayouts.js';
import { decrypt, rollTo } from '../orrery/text.js';

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

/** Each achievement's emblem: a glyph from the one kit family, chosen by what the deed is. */
const ACHIEVEMENT_EMBLEM = Object.freeze({
  berth_assigned: 'dock', rock_has_a_price: 'ore', paper_trail: 'market', signed_and_delivered: 'check',
  out_of_the_pocket: 'gate', made_contact: 'line', light_ships_are_ammunition: 'tow', razor_release: 'target',
  keep_the_speed: 'boost', into_the_crucible: 'fire', tenth_wave: 'shield', better_than_last_time: 'record',
  same_seed_same_day: 'seed', walked_out: 'undock', paperwork_filed: 'ledger', six_figures: 'credits',
});

// Every medal is produced art (assets/ui/generated/achievements/, see its manifest): the sheet's medal
// for each deed; a hidden deed shows its sealed medal until it is earned, then the plain medallion with
// its glyph.
const MEDAL_ROOT = (() => {
  try { return new URL('../../../assets/ui/generated/achievements/', import.meta.url).href; }
  catch (_) { return '/assets/ui/generated/achievements/'; }
})();
function medalArt(row) {
  if (!row || !row.id) return null;
  const hiddenEarned = row.hidden && !row.masked;
  if (hiddenEarned) return { url: MEDAL_ROOT + 'medal-base.webp', glyph: true };
  return { url: MEDAL_ROOT + 'medal-' + String(row.id).replace(/_/g, '-') + '.webp', glyph: false };
}

function glyphFor(row, size = 30) {
  if (row && row.masked) return '<span class="con-medal__q">?</span>';
  return dpIcon(ACHIEVEMENT_EMBLEM[row && row.id] || 'check', size);
}

/** A word set round the reading medal's rim, reading upright along its foot. */
function rimHtml(text) {
  if (!text) return '';
  const esc = String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return '<svg class="con-medal-read__rim" viewBox="-66 -66 132 132" aria-hidden="true" focusable="false">'
    + '<path id="con-read-rim" d="M -60 0 A 60 60 0 0 0 60 0" fill="none" stroke="none"></path>'
    + `<text text-anchor="middle"><textPath href="#con-read-rim" startOffset="50%">${esc}</textPath></text></svg>`;
}

function categoryLabel(id) {
  const s = ACHIEVEMENT_SECTIONS.find((x) => x.id === id);
  return s ? s.label : String(id || '');
}

/** The medal to open on: the newest earned, else the one nearest done, else the first. */
function defaultMedal(rows) {
  const earned = rows.filter((r) => r.unlocked).sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  if (earned.length) return earned[0].id;
  let best = null;
  for (const r of rows) if (medalProgress(r) > 0 && (!best || medalProgress(r) > medalProgress(best))) best = r;
  return (best || rows[0] || {}).id || null;
}

let refs = null;

export const achievementsScreen = {
  id: 'achievements',
  _section: 'all',
  _chosen: null,

  mount(rootEl, ctx) {

    injectDeckplate();
    injectConstellationScreens();
    this._unsubscribe();
    rootEl.innerHTML = '';
    rootEl.classList.remove('panel', 'sf-menu', 'of-achievements');
    rootEl.classList.add('k-screen', 'con-achievements');
    rootEl.removeAttribute('data-fh-register');
    rootEl.setAttribute('aria-label', 'Achievements');

    const title = el('header', 'k-title con-head');
    title.appendChild(el('h1', 'k-display k-t-title con-title', 'Achievements'));
    const summary = el('p', 'k-t-emph k-62 con-sub', '');
    title.appendChild(summary);
    rootEl.appendChild(title);

    // the categories: words on a scale
    const hang = el('nav', 'k-hang con-filters');
    hang.setAttribute('aria-label', 'Achievement categories');
    const sectionWords = words(ACHIEVEMENT_SECTIONS.map((s) => ({ label: s.label, action: s.id, current: s.id === this._section })), {
      row: true,
      size: 'emph',
      ariaLabel: 'Achievement categories',
      onPick: (action) => this._select(action),
    });
    const scaleWrap = el('div', 'con-filters__scale');
    scaleWrap.appendChild(sectionWords);
    hang.appendChild(scaleWrap);
    // up from a category into the medals
    sectionWords.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowUp' || !refs || !refs.grid) return;
      event.preventDefault();
      refs.grid.focusChosen();
    });

    const stage = el('section', 'k-stage con-medal-stage');
    stage.setAttribute('aria-live', 'polite');
    stage.setAttribute('aria-label', 'Medals');
    rootEl.appendChild(stage);

    // the chosen medal, read beside the grid
    const read = el('aside', 'con-medal-read');
    read.setAttribute('aria-label', 'Chosen achievement');
    rootEl.appendChild(read);

    const foot = el('footer', 'k-foot con-foot');
    const back = words([{ label: 'Back', action: 'back' }], {
      size: 'emph',
      ariaLabel: 'Achievements actions',
      onPick: () => {
        const mgr = getManager(ctx);
        if (mgr && typeof mgr.popScreen === 'function') mgr.popScreen();
        else if (ctx && ctx.bus && typeof ctx.bus.emit === 'function') ctx.bus.emit('ui:popScreen', {});
      },
    });
    back.querySelector('.k-word')?.classList.add('sf-back', 'con-back');
    foot.appendChild(back);
    foot.appendChild(hang);
    rootEl.appendChild(foot);

    const grid = createMedalOrrery(stage, {
      glyph: (row) => glyphFor(row),
      art: medalArt,
      label: (id) => categoryLabel(id),
      // the orrery stands clear of the title and the categories tucked into its corner
      avoid: () => [title.querySelector('h1'), summary].map((n) => (n && typeof n.getBoundingClientRect === 'function' ? n.getBoundingClientRect() : null)),
      onPick: (id, how) => this._choose(id, { how }),
      onEdge: () => {
        if (!refs) return;
        const current = refs.sectionWords.querySelector('.k-word[aria-current="true"]') || refs.sectionWords.querySelector('.k-word');
        if (current) try { current.focus(); } catch (e) {}
      },
    });
    const scale = createWordScale(scaleWrap, sectionWords, {
      counts: (id) => {
        const rows = (refs && refs.rows) || [];
        const inSection = rowsForSection(rows, id);
        return inSection.length ? `${inSection.filter((r) => r.unlocked).length}/${inSection.length}` : '';
      },
    });

    refs = { root: rootEl, title, summary, hang, stage, read, foot, sectionWords, grid, scale, rows: [] };
    // A live unlock while the screen is open (Pause holds the sim, but a Crucible settlement or a
    // shared-store merge can still land) repaints the grid instead of waiting for the next open.
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

  _select(id, { quiet = false, chosen = null } = {}) {
    if (!ACHIEVEMENT_SECTIONS.some((s) => s.id === id)) return;
    this._section = id;
    if (refs) {
      for (const b of refs.sectionWords.querySelectorAll('.k-word')) {
        const on = b.dataset.action === id;
        if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      }
    }
    if (!quiet) cue('move');
    if (!refs) return;
    const inSection = rowsForSection(refs.rows, id);
    if (chosen) this._chosen = chosen;
    else if (id !== 'all' && inSection.length) this._chosen = inSection[0].id;
    refs.grid.list.setAttribute('aria-label', id === 'all' ? 'All achievements' : `${categoryLabel(id)} achievements`);
    refs.grid.choose(this._chosen, { section: id });
    refs.scale.update();
    const row = refs.rows.find((r) => r.id === this._chosen);
    if (row) this._paintReading(row, { fresh: !quiet });
  },

  _choose(id, { quiet = false } = {}) {
    if (!refs) return;
    const row = refs.rows.find((r) => r.id === id);
    if (!row) return;
    // stepping to another orbit while a category is in front brings that orbit's category to the front
    if (this._section !== 'all' && row.category !== this._section) { this._select(row.category, { quiet, chosen: id }); return; }
    const changed = this._chosen !== id;
    this._chosen = id;
    refs.grid.choose(id, { instant: quiet });
    this._paintReading(row, { fresh: changed && !quiet });
    if (changed && !quiet) cue('move');
  },

  /** The chosen medal's line: its dial large, its name, what it asks, how far along it is. */
  _paintReading(row, { fresh = false } = {}) {
    const read = refs && refs.read;
    if (!read) return;
    const k = medalProgress(row);
    const state = medalState(row);
    const art = medalArt(row);
    const counted = !row.masked && Number(row.target) > 1;
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const day = row.unlocked ? String(row.status || '').replace(/^Unlocked\s*/, '') : '';
    read.dataset.state = state;
    read.innerHTML = `
      <div class="con-medal-read__dial${art ? ' has-art' : ''}${art && art.glyph ? ' has-glyph' : ''}" data-state="${state}"><span class="con-medal__body"></span>${medalDialSvg(k, { focusRing: false })}${art ? `<img class="con-medal__art" src="${art.url}" alt="" draggable="false" decoding="async">` : ''}<span class="con-medal__glyph">${glyphFor(row, 44)}</span>${rimHtml(day ? 'earned · ' + day : '')}</div>
      <p class="con-medal-read__kicker">${esc(categoryLabel(row.category))} <span aria-hidden="true">·</span> ${esc(state === 'earned' ? 'earned' : state === 'going' ? 'under way' : 'not yet earned')}</p>
      <h2 class="con-medal-read__name">${esc(row.name)}</h2>
      <p class="con-medal-read__line">${esc(row.description)}</p>
      ${counted && !row.unlocked ? `<div class="con-medal-read__figure"><span class="con-medal-read__n" data-n>0</span><span class="con-medal-read__of">of ${esc(Number(row.target).toLocaleString('en-US'))}</span></div>` : ''}
      ${row.unlocked ? `<p class="con-medal-read__status">${esc(day ? 'earned ' + day : 'earned')}</p>` : ''}
    `;
    const dial = read.querySelector('.con-medal-read__dial');
    const rim = dial && dial.querySelector('.con-medal-read__rim');
    if (rim) {
      const w = dial.offsetWidth || 230;
      const R = w * 0.46 + 18;
      const m = 30;
      rim.setAttribute('viewBox', `${-w / 2 - m} ${-w / 2 - m} ${w + 2 * m} ${w + 2 * m}`);
      const path = rim.querySelector('path');
      if (path) path.setAttribute('d', `M ${-R} 0 A ${R} ${R} 0 0 0 ${R} 0`);
    }
    const n = read.querySelector('[data-n]');
    if (n && counted && !row.unlocked) rollTo(n, Math.min(Number(row.current) || 0, Number(row.target)));
    const name = read.querySelector('.con-medal-read__name');
    if (fresh && name) decrypt(name, name.textContent, { duration: 240 });
  },

  _render({ quiet = false } = {}) {
    if (!refs) return;
    let rows = [];
    try { rows = readAchievementRows(); } catch (e) { rows = []; }
    const before = new Set((refs.rows || []).filter((r) => r.unlocked).map((r) => r.id));
    refs.rows = rows;
    refs.summary.textContent = achievementSummaryText(rows);
    const section = ACHIEVEMENT_SECTIONS.find((s) => s.id === this._section) || ACHIEVEMENT_SECTIONS[0];
    // nothing the orrery shows changed (a store sync, the push's own refresh): leave it, and the
    // player's focus in it, alone
    const sig = section.id + '|' + rows.map((r) => `${r.id}:${r.unlocked ? 1 : 0}:${r.current}:${r.status}:${r.name}`).join(',');
    if (quiet && sig === refs.sig) { refs.scale.update({ instant: true }); return; }
    refs.sig = sig;
    const struck = quiet ? rows.filter((r) => r.unlocked && !before.has(r.id)).map((r) => r.id) : [];
    if (struck.length) this._chosen = struck[struck.length - 1];
    const inSection = rowsForSection(rows, section.id);
    if (!rows.some((r) => r.id === this._chosen)) this._chosen = defaultMedal(section.id === 'all' ? rows : inSection);
    const chosenRow = rows.find((r) => r.id === this._chosen);
    if (section.id !== 'all' && chosenRow && chosenRow.category !== section.id) this._chosen = (inSection[0] || chosenRow).id;
    refs.grid.list.setAttribute('aria-label', section.id === 'all' ? 'All achievements' : `${section.label} achievements`);
    refs.stage.dataset.count = String(rows.length);
    refs.grid.set(rows, { chosen: this._chosen, section: section.id });
    for (const id of struck) refs.grid.strike(id);
    const row = rows.find((r) => r.id === this._chosen);
    if (row) this._paintReading(row, { fresh: !quiet || struck.length > 0 });
    else refs.read.innerHTML = '<p class="con-medal-read__line">No achievements yet.</p>';
    refs.scale.update({ instant: quiet });
    if (!quiet) refs.grid.arrive();
  },

  onShow() {
    if (!refs) return;
    this._render();
    settle(refs.title, { from: 'left', state: 'achievements-title' });
    settle(refs.hang, { from: 'left', delay: 60, state: 'achievements-hang' });
    settle(refs.read, { from: 'right', delay: 90, state: 'achievements-read' });
    settle(refs.foot, { from: 'bottom', delay: 120, state: 'achievements-foot' });
    refs.root.dataset.kReady = '1';
    const current = refs.sectionWords.querySelector('.k-word[aria-current="true"]') || refs.sectionWords.querySelector('.k-word');
    if (current) try { current.focus(); } catch (e) {}
    cue('open');
  },

  onHide() { cue('close'); },
  refresh(ctx, options) {
    // Live unlocks land through the ACHIEVEMENT_UNLOCKED_EVENT subscription; the shell's ~3 Hz
    // periodic pass only rebuilt the grid and reset the player's place mid-read.
    if (options && options.periodic) return;
    this._render({ quiet: true });
  },

  dispose() {
    this._unsubscribe();
    if (refs) {
      try { refs.grid.dispose(); } catch (e) {}
      try { refs.scale.dispose(); } catch (e) {}
    }
    refs = null;
  },
};
