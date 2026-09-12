// Credits — Field Hardware POSTER (P37). Hangar world, one reading plate, legend keys, quiet type.
// Third-party notices PQ-033.00. Unique chrome: styles/credits.css. Data from scripts/write-credits.mjs.
import { CREDITS } from '../../data/credits.js';
import { el, words, settle, cue } from '../kit/index.js';

const CREDITS_SHEET_ID = 'of-credits-css';

function ensureCreditsStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(CREDITS_SHEET_ID)) return;
  const head = document.head || document.documentElement;
  if (!head || typeof head.appendChild !== 'function') return;
  const link = document.createElement('link');
  link.id = CREDITS_SHEET_ID;
  link.rel = 'stylesheet';
  try { link.href = new URL('../../../styles/credits.css', import.meta.url).href; }
  catch { link.href = '/styles/credits.css'; }
  head.appendChild(link);
}

const SECTIONS = [
  { id: 'made', label: 'Made by' },
  { id: 'type', label: 'Type' },
  { id: 'libraries', label: 'Libraries' },
  { id: 'fonts', label: 'Fonts and licences' },
  { id: 'notices', label: 'Third-party notices' },
];

function getManager(ctx) {
  if (ctx && ctx.screenManager) return ctx.screenManager;
  if (ctx && ctx.screens && ctx.screens.pushScreen) return ctx.screens;
  const ui = ctx && ctx.registry && ctx.registry.get && ctx.registry.get('ui');
  if (ui && ui.screenManager) return ui.screenManager;
  return null;
}

/** Engraved fact rows on the reading plate: name, optional sub, quiet value. */
function staticRows(items, ariaLabel) {
  const list = el('ul', 'k-rows of-credits-rows');
  list.setAttribute('aria-label', ariaLabel);
  for (const item of items) {
    const row = el('li', 'k-row k-row--static fh-row');
    const name = el('div');
    name.appendChild(el('span', 'k-row__name fh-emphasis', item.name));
    if (item.sub) name.appendChild(el('div', 'k-row__sub fh-fine', item.sub));
    row.appendChild(name);
    row.appendChild(el('span', 'k-row__num k-t-body k-62 fh-data', item.value || ''));
    list.appendChild(row);
  }
  return list;
}

/** A licence text as readable paragraphs on the paper plate. */
function noticeBlock(notice) {
  const block = el('section', 'of-credits-notice fh-plate fh-plate--paper');
  const head = el('h2', 'k-t-emph', notice.name);
  block.appendChild(head);
  block.appendChild(el('p', 'k-caps fh-legend', notice.license));
  const paragraphs = String(notice.text || '').split(/\n\s*\n/);
  for (const paragraph of paragraphs) {
    const text = paragraph.replace(/\s*\n\s*/g, ' ').trim();
    if (text) block.appendChild(el('p', 'k-sentence k-measure fh-body', text));
  }
  return block;
}

let refs = null;

export const creditsScreen = {
  id: 'credits',
  _section: 'made',

  mount(rootEl, ctx) {
    ensureCreditsStyles();
    rootEl.innerHTML = '';
    rootEl.classList.remove('panel', 'sf-menu');
    rootEl.classList.add('k-screen', 'of-credits');
    rootEl.setAttribute('data-fh-register', 'poster');
    rootEl.setAttribute('aria-label', 'Credits');

    const title = el('header', 'k-title');
    title.appendChild(el('h1', 'k-display k-t-title fh-title', 'Credits'));
    title.appendChild(el('p', 'k-t-emph k-62 fh-body', 'Who made SpaceFace and what it is built on.'));
    rootEl.appendChild(title);

    const hang = el('nav', 'k-hang');
    const sectionWords = words(SECTIONS.map((s) => ({ label: s.label, action: s.id, current: s.id === this._section })), {
      size: 'emph',
      ariaLabel: 'Credits sections',
      onPick: (action) => this._select(action),
    });
    for (const b of sectionWords.querySelectorAll('.k-word')) {
      b.classList.add('fh-key', 'fh-key--legend');
    }
    hang.appendChild(sectionWords);
    rootEl.appendChild(hang);

    const stage = el('section', 'k-stage k-stage--scroll fh-plate fh-plate--sunk');
    stage.setAttribute('aria-live', 'polite');
    rootEl.appendChild(stage);

    const foot = el('footer', 'k-foot');
    const back = words([{ label: 'Back', action: 'back', primary: true }], {
      size: 'emph',
      ariaLabel: 'Credits actions',
      onPick: () => {
        const mgr = getManager(ctx);
        if (mgr && typeof mgr.popScreen === 'function') mgr.popScreen();
        else ctx.bus.emit('ui:popScreen', {});
      },
    });
    for (const b of back.querySelectorAll('.k-word')) b.classList.add('fh-key', 'fh-key--primary');
    foot.appendChild(back);
    rootEl.appendChild(foot);

    refs = { root: rootEl, title, hang, stage, foot, sectionWords };
    this._render();
  },

  _select(id, { quiet = false } = {}) {
    if (!SECTIONS.some((s) => s.id === id)) return;
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

  _render() {
    if (!refs) return;
    const stage = refs.stage;
    stage.innerHTML = '';
    stage.scrollTop = 0;
    const c = CREDITS;
    switch (this._section) {
      case 'made': {
        const made = el('div', 'of-credits-made');
        made.appendChild(el('p', 'of-credits-kicker fh-legend', 'Made by'));
        made.appendChild(el('h2', 'of-credits-name fh-hero', c.madeBy));
        if (c.version) made.appendChild(el('p', 'of-credits-ver fh-data', 'v' + c.version));
        made.appendChild(el('p', 'k-row__sub fh-fine', 'design, code and art'));
        stage.appendChild(made);
        stage.appendChild(el('p', 'k-sentence k-measure fh-body',
          'SpaceFace is a Three.js browser and desktop space game: fly, mine, trade, fight, upgrade, and build a living universe.'));
        break;
      }
      case 'type':
        stage.appendChild(staticRows(c.type.map((t) => ({ name: t.name, sub: t.role, value: t.author })), 'Type'));
        break;
      case 'libraries':
        stage.appendChild(staticRows(c.libraries.map((l) => ({
          name: l.name, sub: [l.version, l.author, l.homepage].filter(Boolean).join(' · '), value: l.license,
        })), 'Libraries'));
        break;
      case 'fonts':
        stage.appendChild(staticRows(c.type.map((t) => ({ name: t.name, sub: t.author, value: t.license })), 'Fonts and licences'));
        stage.appendChild(el('p', 'k-sentence k-measure fh-body',
          'Every face is vendored under the SIL Open Font License 1.1; the full text is under Third-party notices.'));
        break;
      case 'notices':
        for (const notice of c.notices) stage.appendChild(noticeBlock(notice));
        break;
      default:
        break;
    }
    settle(stage, { from: 'left', state: 'credits-' + this._section });
  },

  onShow() {
    if (!refs) return;
    settle(refs.title, { from: 'left', state: 'credits-title' });
    settle(refs.hang, { from: 'left', delay: 60, state: 'credits-hang' });
    settle(refs.foot, { from: 'bottom', delay: 120, state: 'credits-foot' });
    refs.root.dataset.kReady = '1';
    const current = refs.sectionWords.querySelector('.k-word[aria-current="true"]') || refs.sectionWords.querySelector('.k-word');
    if (current) try { current.focus(); } catch (e) {}
    cue('open');
  },

  onHide() { cue('close'); },
  refresh() {},
};
