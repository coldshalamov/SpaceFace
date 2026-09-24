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

const MODULE_NAME = new Map([...MODULES, ...WEAPONS].map((def) => [def && def.id, def && def.name]));

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
  facts.push({ key: 'credits', label: 'Credits earned', text: fmtCr(stats && stats.creditsEarned) });
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
    rootEl.innerHTML = '';
    rootEl.classList.add('k-screen', 'k-screen--stage', 'sf-demo-end');
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

    // .k-stage — the record, as a small register of facts (dl rows like the career recap).
    const stage = el('section', 'k-stage k-panel sf-demo-end__stage');
    let profile = null;
    try { profile = loadCrucibleMeta(); } catch { profile = null; }
    const facts = demoEndFacts(ctx && ctx.state, profile);
    const list = el('dl', 'sf-demo-end__facts');
    for (const fact of facts) {
      const row = el('div', 'sf-demo-end__fact');
      row.appendChild(el('dt', 'k-caps', fact.label));
      row.appendChild(el('dd', 'k-sentence', fact.text));
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

    const menu = addItem(el('button', 'k-word k-word--emph k-word--danger', 'Main menu'));
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
    if (r.play && typeof r.play.focus === 'function') {
      try { r.play.focus({ preventScroll: true }); } catch { /* focus is best-effort */ }
    }
  },

  onHide() {
    cue('close');
  },
};
