// Credits — ORRERY reel (design/frontend/ORRERY.md §6 Meta: "Credits: Scroll Reveal over the Drift Field").
// Every section on one continuous reel that scrolls over a field of drifting light; each line rises out of
// the dark as the reel brings it up. The signature: scrolling turns the orrery. The emblem stands beside
// the reel with the five sections as bodies on its orbit; the reel's scroll turns it, and the amber Hand
// catches the section being read. Picking a section on the ladder rolls the reel, which swings the
// orrery to it. A progress arc reads how far through the reel you are. Third-party notices PQ-033.00.
// Unique chrome: styles/credits.css, composed over by src/ui/orrery/settingsLayouts.js.
// Data from scripts/write-credits.mjs.
import { CREDITS } from '../../data/credits.js';
import { el, words, settle, cue } from '../kit/index.js';
import { injectDeckplate } from '../deckplate/index.js';
import { injectOrrerySettings, createDriftField, createCreditsOrrery, createReelProgress, revealReel, attachSpotlight } from '../orrery/settingsLayouts.js';
import { reducedMotion } from '../orrery/motion.js';

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

/** A homepage as a place, not a link: no protocol, no "www.", no trailing slash or #readme. */
export function creditsHost(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  const bare = raw.replace(/^git\+/i, '').replace(/\.git$/i, '').replace(/^[a-z]+:\/\//i, '').replace(/^www\./i, '').replace(/#.*$/, '').replace(/\/+$/, '');
  const [host, ...path] = bare.split('/');
  return /^(github|gitlab)\.com$/i.test(host) && path.length >= 2 ? `${host}/${path[0]}/${path[1]}` : host;
}

/** Credit lines on the reel's rail: name, optional sub, quiet value. Each line reveals on its own. */
function staticRows(items, ariaLabel) {
  const list = el('ul', 'k-rows of-credits-rows');
  list.setAttribute('aria-label', ariaLabel);
  for (const item of items) {
    const row = el('li', 'k-row k-row--static fh-row orr-cr-line');
    const name = el('div');
    name.appendChild(el('span', 'k-row__name fh-emphasis', item.name));
    if (item.sub) name.appendChild(el('div', 'k-row__sub fh-fine', item.sub));
    row.appendChild(name);
    row.appendChild(el('span', 'k-row__num k-t-body k-62 fh-data', item.value || ''));
    list.appendChild(row);
  }
  return list;
}

/**
 * A licence: its name, its terms and its copyright line; the full text (still shipped whole) unfolds on a
 * word, so the reel reads as credits and not as a wall of legal capitals.
 */
function noticeBlock(notice) {
  const block = el('section', 'of-credits-notice fh-plate fh-plate--paper orr-cr-line');
  const head = el('h2', 'k-t-emph', notice.name);
  block.appendChild(head);
  block.appendChild(el('p', 'k-caps fh-legend', notice.license));
  const paragraphs = String(notice.text || '').split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
  const copyright = paragraphs.find((p) => /^copyright\b|\(c\)|©/i.test(p) && p.length < 240)
    || paragraphs.find((p) => p.length < 240 && !/^-+$/.test(p) && !/^[A-Z0-9 ,.'"()\-]+$/.test(p)
      && !String(notice.name || '').startsWith(p) && !/license$/i.test(p)) || '';
  if (copyright) block.appendChild(el('p', 'orr-cr-copy', copyright));
  const full = el('div', 'orr-cr-full');
  for (const text of paragraphs) full.appendChild(el('p', 'k-sentence k-measure fh-body', text));
  full.hidden = true;
  if (paragraphs.length) {
    const unfold = el('button', 'orr-cr-unfold', 'Read the licence');
    unfold.type = 'button';
    unfold.setAttribute('aria-expanded', 'false');
    const fullId = `orr-cr-full-${String(notice.name || '').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
    full.id = fullId;
    unfold.setAttribute('aria-controls', fullId);
    unfold.addEventListener('click', () => {
      const open = full.hidden;
      full.hidden = !open;
      unfold.setAttribute('aria-expanded', String(open));
      unfold.textContent = open ? 'Fold the licence' : 'Read the licence';
      cue(open ? 'open' : 'close');
    });
    block.append(unfold, full);
  }
  return block;
}

/** A section's head on the reel: its index and its name, which decrypts as it arrives. */
function sectionHead(index, label) {
  const head = el('h2', 'orr-cr-head orr-cr-line');
  head.appendChild(el('i', '', String(index).padStart(2, '0')));
  const word = el('b', '', label);
  if (word.dataset) word.dataset.text = label;
  head.appendChild(word);
  return head;
}

let refs = null;

export const creditsScreen = {
  id: 'credits',
  _section: 'made',

  mount(rootEl, ctx) {

    injectDeckplate();
    ensureCreditsStyles();
    injectOrrerySettings();
    rootEl.innerHTML = '';
    rootEl.classList.remove('panel', 'sf-menu');
    rootEl.classList.add('k-screen', 'of-credits', 'orr-credits');
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
    // how far through the reel: an arc of light under the ladder (decoration; the reel is the content)
    let progress = null;
    try { progress = createReelProgress(); } catch (e) { progress = null; }
    if (progress) hang.appendChild(progress.el);
    rootEl.appendChild(hang);

    const stage = el('section', 'k-stage k-stage--scroll fh-plate fh-plate--sunk');
    stage.setAttribute('aria-live', 'polite');
    // the reel scrolls by keyboard too: it takes focus after the section words
    stage.tabIndex = 0;
    stage.setAttribute('aria-label', 'Credits reel');
    rootEl.appendChild(stage);

    const foot = el('footer', 'k-foot');
    const back = words([{ label: 'Back', action: 'back' }], {
      size: 'emph',
      ariaLabel: 'Credits actions',
      onPick: () => {
        const mgr = getManager(ctx);
        if (mgr && typeof mgr.popScreen === 'function') mgr.popScreen();
        else ctx.bus.emit('ui:popScreen', {});
      },
    });
    back.querySelector('.k-word')?.classList.add('sf-back');
    for (const b of back.querySelectorAll('.k-word')) b.classList.add('fh-key', 'fh-key--primary');
    foot.appendChild(back);
    rootEl.appendChild(foot);

    // behind everything: the drift field and the emblem (both aria-hidden, both stand down on a shim)
    let drift = null;
    try { drift = createDriftField(rootEl); } catch (e) { drift = null; }
    let orrery = null;
    try { orrery = createCreditsOrrery(document, SECTIONS); } catch (e) { orrery = null; }
    if (orrery && typeof rootEl.insertBefore === 'function') rootEl.insertBefore(orrery.el, rootEl.firstChild);
    if (drift && typeof rootEl.insertBefore === 'function') rootEl.insertBefore(drift.el, rootEl.firstChild);

    refs = { root: rootEl, title, hang, stage, foot, sectionWords, progress, drift, orrery, reveal: null, sections: {}, lock: null, lockTimer: 0, spot: null };
    try { refs.spot = attachSpotlight(rootEl); } catch (e) { refs.spot = null; }
    if (typeof stage.addEventListener === 'function') stage.addEventListener('scroll', () => this._spy(), { passive: true });
    this._render();
  },

  _mark(id) {
    if (!refs) return;
    for (const b of refs.sectionWords.querySelectorAll('.k-word')) {
      const on = b.dataset.action === id;
      if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    }
  },

  _select(id, { quiet = false } = {}) {
    if (!SECTIONS.some((s) => s.id === id)) return;
    this._section = id;
    this._mark(id);
    if (!quiet) cue('move');
    if (!refs) return;
    // roll the reel to the section; the ladder holds the pick while the reel travels
    const sec = refs.sections[id];
    const stage = refs.stage;
    if (sec && typeof stage.scrollTo === 'function') {
      const reel = sec.parentElement;
      const top = Math.max(0, (sec.offsetTop || 0) + ((reel && reel.offsetTop) || 0) - Math.round((stage.clientHeight || 0) * 0.09));
      refs.lock = id;
      clearTimeout(refs.lockTimer);
      refs.lockTimer = setTimeout(() => { if (refs) { refs.lock = null; this._spy(); } }, 900);
      try { stage.scrollTo({ top, behavior: reducedMotion() ? 'auto' : 'smooth' }); } catch (e) { stage.scrollTop = top; }
    }
  },

  // the reel reports where it is: the progress arc, the drift field's parallax, and which section the
  // Hand should stand on
  _spy() {
    if (!refs) return;
    const stage = refs.stage;
    const top = stage.scrollTop || 0;
    const span = Math.max(1, (stage.scrollHeight || 0) - (stage.clientHeight || 0));
    if (refs.progress) refs.progress.set(top / span);
    if (refs.drift) refs.drift.setScroll(top);
    // the section whose head has reached the reel's reading line (where a pick scrolls it to) is the one read
    const line = top + (stage.clientHeight || 0) * 0.09 + 2;
    const tops = SECTIONS.map((s) => {
      const sec = refs.sections[s.id];
      const reel = sec && sec.parentElement;
      return sec ? (sec.offsetTop || 0) + ((reel && reel.offsetTop) || 0) : 0;
    });
    // the reel's position in sections: whole at each section's head, fractional between them
    let pos = 0;
    for (let i = 0; i < tops.length; i += 1) {
      if (line < tops[i]) break;
      const next = i + 1 < tops.length ? tops[i + 1] : tops[i] + 1;
      pos = i + Math.min(1, (line - tops[i]) / Math.max(1, next - tops[i])) * (i + 1 < tops.length ? 1 : 0);
    }
    if (top >= span - 2) pos = SECTIONS.length - 1;
    if (refs.orrery) refs.orrery.setPosition(pos);
    if (refs.lock) return;
    let current = SECTIONS[Math.max(0, Math.min(SECTIONS.length - 1, Math.round(pos)))].id;
    if (top >= span - 2) current = SECTIONS[SECTIONS.length - 1].id;
    if (current !== this._section) { this._section = current; this._mark(current); }
  },

  _render() {
    if (!refs) return;
    const stage = refs.stage;
    if (refs.reveal) refs.reveal.dispose();
    stage.innerHTML = '';
    stage.scrollTop = 0;
    const c = CREDITS;
    const reel = el('div', 'orr-cr-reel');
    refs.sections = {};
    SECTIONS.forEach((s, i) => {
      const sec = el('section', 'orr-cr-sec');
      sec.setAttribute('data-credits-section', s.id);
      sec.setAttribute('aria-label', s.label);
      sec.appendChild(sectionHead(i + 1, s.label));
      switch (s.id) {
        case 'made': {
          const made = el('div', 'of-credits-made orr-cr-line');
          made.appendChild(el('p', 'of-credits-kicker fh-legend', 'Made by'));
          made.appendChild(el('h2', 'of-credits-name fh-hero', c.madeBy));
          if (c.version) made.appendChild(el('p', 'of-credits-ver fh-data', 'v' + c.version));
          made.appendChild(el('p', 'k-row__sub fh-fine', 'design, code and art'));
          sec.appendChild(made);
          sec.appendChild(el('p', 'k-sentence k-measure fh-body orr-cr-line',
            'SpaceFace is a Three.js browser and desktop space game: fly, mine, trade, fight, upgrade, and build a living universe.'));
          break;
        }
        case 'type':
          sec.appendChild(staticRows(c.type.map((t) => ({ name: t.name, sub: t.role, value: t.author })), 'Type'));
          break;
        case 'libraries':
          sec.appendChild(staticRows(c.libraries.map((l) => ({
            name: l.name, sub: [l.version, l.author, creditsHost(l.homepage)].filter(Boolean).join(' · '), value: l.license,
          })), 'Libraries'));
          break;
        case 'fonts':
          sec.appendChild(staticRows(c.type.map((t) => ({ name: t.name, sub: t.author, value: t.license })), 'Fonts and licences'));
          sec.appendChild(el('p', 'k-sentence k-measure fh-body orr-cr-line',
            'Every face is vendored under the SIL Open Font License 1.1; the full text is under Third-party notices.'));
          break;
        case 'notices':
          for (const notice of c.notices) sec.appendChild(noticeBlock(notice));
          break;
        default:
          break;
      }
      refs.sections[s.id] = sec;
      reel.appendChild(sec);
    });
    reel.appendChild(el('p', 'orr-cr-end orr-cr-line', 'End of the reel'));
    stage.appendChild(reel);
    try {
      const lines = typeof stage.querySelectorAll === 'function' ? stage.querySelectorAll('.orr-cr-line') : [];
      refs.reveal = revealReel(stage, lines);
    } catch (e) { refs.reveal = null; }
    this._spy();
    settle(stage, { from: 'left', state: 'credits-reel' });
  },

  onShow() {
    if (!refs) return;
    settle(refs.title, { from: 'left', state: 'credits-title' });
    settle(refs.hang, { from: 'left', delay: 60, state: 'credits-hang' });
    settle(refs.foot, { from: 'bottom', delay: 120, state: 'credits-foot' });
    refs.root.dataset.kReady = '1';
    try { if (refs.drift) refs.drift.start(); } catch (e) { /* the field is cosmetic */ }
    this._spy();
    const current = refs.sectionWords.querySelector('.k-word[aria-current="true"]') || refs.sectionWords.querySelector('.k-word');
    if (current) try { current.focus(); } catch (e) {}
    cue('open');
  },

  onHide() {
    cue('close');
    try { if (refs && refs.drift) refs.drift.stop(); } catch (e) { /* cosmetic */ }
  },
  refresh() {},
  dispose() {
    if (refs) {
      clearTimeout(refs.lockTimer);
      try { if (refs.drift) refs.drift.dispose(); } catch (e) { /* cosmetic */ }
      try { if (refs.reveal) refs.reveal.dispose(); } catch (e) { /* cosmetic */ }
      try { if (refs.spot) refs.spot.dispose(); } catch (e) { /* cosmetic */ }
      try { if (refs.orrery) refs.orrery.dispose(); } catch (e) { /* cosmetic */ }
    }
    refs = null;
  },
};
