// Demo end card (ZERO_TO_HERO Phase 5.5). Shown once per save, in IS_DEMO builds, when the demo
// pilot undocks carrying a module they fitted during that dock (the onboarding system owns the
// trigger and the once-flag). The card closes the loop: the run told back, the belt ahead, and
// ways out that keep the player playing or send them onward. Built on the frontend kit
// (styles/kit.css, src/ui/kit/) like the other plates; this file owns no CSS.

import { DEMO_CONFIG } from '../../data/demoConfig.js';
import { MODULES } from '../../data/modules.js';
import { WEAPONS } from '../../data/weapons.js';
import { bestLineRows, loadCrucibleMeta } from '../../systems/survivalRecords.js';
import { injectDeckplate } from '../deckplate/index.js';
import { el, settle, cue } from '../kit/index.js';
import { dressLampKey } from '../orrery/lampKey.js';
import { createCounter, decrypt } from '../orrery/text.js';
import { hand, ring } from '../orrery/instruments.js';
import { svg } from '../orrery/svg.js';
import { injectOrrery } from '../orrery/tokens.js';
import { injectOrreryScreens } from '../orrery/screenLayouts.js';

const MODULE_NAME = new Map([...MODULES, ...WEAPONS].map((def) => [def && def.id, def && def.name]));

function dressPrimary(button) {
  if (!button) return button;
  if (!button.childNodes) {
    button.classList.add('orr-lampkey');
    return button;
  }
  return dressLampKey(button);
}

function mountFactValue(dd, fact) {
  if (typeof fact.value === 'number') {
    const counter = createCounter(dd, {
      format: (n) => Math.max(0, Math.round(Number(n) || 0)).toLocaleString('en-US') + ' CR',
    });
    counter.set(fact.value);
    return;
  }
  dd.textContent = fact.text;
  decrypt(dd, fact.text);
}

function mountEndDial(host) {
  const doc = host.ownerDocument || globalThis.document;
  if (!doc || typeof doc.createElementNS !== 'function') return null;
  // The orr-svg class and injectOrrery's stroke sheet are what turn the library's paths into
  // light; without them the ring fills solid black — a disc, not a dial.
  const figure = svg('svg', {
    class: 'orr-svg sf-demo-end__dial',
    viewBox: '0 0 160 160',
    width: '160',
    height: '160',
    'aria-hidden': 'true',
  });
  figure.appendChild(ring({ cx: 80, cy: 80, r: 68, tone: 'faint', width: 1, bloom: 4, draw: true }));
  const needle = hand({ cx: 80, cy: 80, r0: 14, r1: 62 });
  figure.appendChild(needle.el);
  host.appendChild(figure);
  return { figure, needle };
}

/** The Hand's bearing from one element's centre to another's — 0 is up, clockwise. Null when
 *  the host cannot measure (a stub DOM in a node test, a hidden card). */
function bearingBetween(fromEl, toEl) {
  if (!fromEl || !toEl
    || typeof fromEl.getBoundingClientRect !== 'function'
    || typeof toEl.getBoundingClientRect !== 'function') return null;
  try {
    const a = fromEl.getBoundingClientRect();
    const b = toEl.getBoundingClientRect();
    if (!a || !b || (a.width <= 0 && a.height <= 0)) return null;
    const dx = (b.left + b.width / 2) - (a.left + a.width / 2);
    const dy = (b.top + b.height / 2) - (a.top + a.height / 2);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
    return Math.atan2(dx, -dy) * 180 / Math.PI;
  } catch {
    return null;
  }
}

function moduleName(defId) {
  return MODULE_NAME.get(defId) || String(defId || '');
}

function fmtCr(value) {
  const n = Math.max(0, Math.round(Number(value) || 0));
  return n.toLocaleString('en-US') + ' CR';
}

/** The card's three facts. Each is read from state/records and skipped when the record is absent. */
export function demoEndFacts(state, profile) {
  const facts = [];
  const best = profile ? bestLineRows(profile)[0] : null;
  if (best) {
    facts.push({ key: 'bestLine', label: 'Best Crucible chain', text: `${best.namedLine} — ${best.points} points` });
  }
  const stats = state && state.player && state.player.stats;
  const credits = Math.max(0, Math.round(Number(stats && stats.creditsEarned) || 0));
  facts.push({ key: 'credits', label: 'Credits earned', text: fmtCr(credits), value: credits });
  const moduleDefId = state && state.ui && state.ui.demoEnd && state.ui.demoEnd.moduleDefId;
  if (moduleDefId) facts.push({ key: 'module', label: 'Fitted', text: moduleName(moduleDefId) });
  return facts;
}

function getManager(ctx) {
  if (ctx && ctx.screenManager) return ctx.screenManager;
  if (ctx && ctx.screens && ctx.screens.pushScreen) return ctx.screens;
  const ui = ctx && ctx.registry && ctx.registry.get && ctx.registry.get('ui');
  if (ui && ui.screenManager) return ui.screenManager;
  if (ui && ui.manager) return ui.manager;
  return null;
}

export const demoEndScreen = {
  id: 'demoEnd',

  mount(rootEl, ctx) {
    injectDeckplate();
    // The card composes ORRERY library pieces (the dial, the register) — their stroke sheet and
    // their screen layout are what the results plate injects, so this card injects them too.
    injectOrrery(rootEl.ownerDocument || undefined);
    injectOrreryScreens(rootEl.ownerDocument || undefined);
    rootEl.innerHTML = '';
    rootEl.classList.add('k-screen', 'k-screen--stage', 'sf-demo-end', 'orr-demo-end');
    rootEl.setAttribute('role', 'dialog');
    rootEl.setAttribute('aria-modal', 'true');
    rootEl.setAttribute('aria-labelledby', 'sf-demo-end-title');
    rootEl.dataset.kReady = '0';

    // .k-title — the close line. What it marks sits under it, not in the headline.
    const title = el('header', 'k-title');
    title.appendChild(el('span', 'k-caps', 'Demo complete'));
    const h = el('h1', 'k-display k-t-title', "That's the demo.");
    h.id = 'sf-demo-end-title';
    title.appendChild(h);
    title.appendChild(el('p', 'k-sentence k-sentence--emph',
      'You fought the pack, then flew out with a new part bolted on. The belt is the rest of the game.'));
    rootEl.appendChild(title);

    // .k-stage — the record, as a register of lit readings (dl rows kept for the ear; the eye
    // reads etched labels over numeral values, the results plate's grammar).
    const stage = el('section', 'k-stage k-panel sf-demo-end__stage');
    let profile = null;
    try { profile = loadCrucibleMeta(); } catch { profile = null; }
    const facts = demoEndFacts(ctx && ctx.state, profile);
    const list = el('dl', 'sf-demo-end__facts orr-end-facts');
    for (const fact of facts) {
      const row = el('div', 'sf-demo-end__fact orr-end-fact');
      row.appendChild(el('dt', 'k-caps orr-end-fact__w', fact.label));
      const dd = el('dd', 'k-sentence orr-end-fact__n');
      mountFactValue(dd, fact);
      row.appendChild(dd);
      list.appendChild(row);
    }
    stage.appendChild(list);
    rootEl.appendChild(stage);

    // .k-foot — the ways out, as words. External links are real anchors (the share band's path):
    // hidden entirely when the config carries no URL for them.
    const foot = el('footer', 'k-foot sf-demo-end__foot');
    const footWords = el('ul', 'k-words k-words--row');
    footWords.setAttribute('aria-label', 'After the demo');
    const addItem = (node) => {
      const li = el('li');
      li.appendChild(node);
      footWords.appendChild(li);
      return node;
    };

    const play = addItem(el('button', 'k-word k-word--emph k-word--primary', 'Keep playing'));
    play.type = 'button';
    dressPrimary(play);
    // The dial stands with the ways out; its Hand bears on the primary key once the card has
    // laid out — it points at the thing it is offering, not a fixed angle.
    const dial = mountEndDial(foot);
    this._dial = dial ? dial.needle : null;
    this._dialFigure = dial ? dial.figure : null;
    this._dialTarget = play;
    const aimDial = () => {
      const bearing = this._dial ? bearingBetween(this._dialFigure, this._dialTarget) : null;
      if (bearing != null) this._dial.pointTo(bearing);
    };
    this._aimDial = aimDial;
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(aimDial));
    } else {
      aimDial();
    }
    play.setAttribute('aria-label', 'Keep playing — close the card and return to flight');
    play.addEventListener('click', () => {
      cue('confirm');
      const mgr = getManager(ctx);
      if (mgr && mgr.popScreen) mgr.popScreen();
      else ctx.bus.emit('ui:popScreen', {});
    });

    const linkWord = (label, url, ariaLabel) => {
      if (!url) return null;
      const a = addItem(el('a', 'k-word k-word--emph', label));
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.setAttribute('aria-label', ariaLabel);
      return a;
    };
    linkWord('Feedback', DEMO_CONFIG.feedbackUrl, 'Give feedback on the demo');
    linkWord('Store page', DEMO_CONFIG.storeUrl, 'Open the store page');

    // Leaving a finished demo is an exit, not a destruction — the word is the ordinary one.
    const menu = addItem(el('button', 'k-word k-word--emph', 'Main menu'));
    menu.type = 'button';
    menu.setAttribute('aria-label', 'Return to the title screen');
    menu.addEventListener('click', () => {
      cue('confirm');
      // Same exit pause uses: main.js consumes game:exitToMenu and returns state.mode to 'menu'.
      ctx.bus.emit('game:exitToMenu', { source: 'demo_end' });
      const mgr = getManager(ctx);
      if (mgr) {
        if (mgr.closeAll) mgr.closeAll();
        if (mgr.replaceScreen) mgr.replaceScreen('mainMenu');
        else if (mgr.pushScreen) mgr.pushScreen('mainMenu');
      } else {
        ctx.bus.emit('ui:replaceScreen', { id: 'mainMenu' });
      }
    });

    foot.appendChild(footWords);
    rootEl.appendChild(foot);
    this._regions = { title, stage, foot, play };
    rootEl.dataset.kReady = '1';
    if (typeof play.focus === 'function') {
      try { play.focus(); } catch { /* focus is best-effort */ }
    }
  },

  onShow() {
    const r = this._regions;
    if (!r) return;
    cue('open');
    try {
      settle(r.title, { from: 'top', state: 'demoEnd:open' });
      settle(r.stage, { from: 'left', delay: 60, state: 'demoEnd:open' });
      settle(r.foot, { from: 'bottom', delay: 120, state: 'demoEnd:open' });
    } catch { /* motion is cosmetic */ }
    // The foot has settled into layout; the Hand takes its bearing on the primary key now.
    if (this._aimDial) this._aimDial();
    if (r.play && typeof r.play.focus === 'function') {
      try { r.play.focus({ preventScroll: true }); } catch { /* focus is best-effort */ }
    }
  },

  onHide() {
    cue('close');
  },

  dispose() {
    if (this._dial) this._dial.dispose();
    this._dial = null;
    this._dialFigure = null;
    this._dialTarget = null;
    this._aimDial = null;
  },
};
