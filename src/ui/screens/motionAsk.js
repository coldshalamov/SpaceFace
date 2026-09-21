// First-boot motion choice (PQ-210.07). The OS reduced-motion hint is a question, never a default.
// Same hangar still as the title; two words (Full / Reduce). ESC cannot skip it. System stays in
// Access. This file owns no CSS.

import { createTitleFrame, TITLE_PLATE_SRC } from '../views/menuFrames.js';
import { injectDeckplate } from '../deckplate/index.js';
import { el, words, stamp } from '../kit/index.js';
import {
  FIRST_BOOT_MOTION_ASK_ID,
  MOTION_ASK_CHOICES,
  recordMotionChoice,
} from '../accessibility.js';

function getManager(ctx) {
  if (ctx && ctx.screenManager) return ctx.screenManager;
  if (ctx && ctx.screens && ctx.screens.replaceScreen) return ctx.screens;
  const ui = ctx && ctx.registry && ctx.registry.get && ctx.registry.get('ui');
  if (ui && ui.screenManager) return ui.screenManager;
  if (ui && ui.manager) return ui.manager;
  return null;
}

function markPlateReady(rootEl) {
  const markReady = () => { if (rootEl && rootEl.dataset) rootEl.dataset.kReady = '1'; };
  if (typeof Image !== 'function') { markReady(); return; }
  const plate = new Image();
  plate.decoding = 'async';
  plate.onload = markReady;
  plate.onerror = markReady;
  plate.src = TITLE_PLATE_SRC;
  if (plate.complete && plate.naturalWidth > 0) markReady();
}

let refs = null;

export const motionAskScreen = {
  id: FIRST_BOOT_MOTION_ASK_ID,
  data: { locked: true },

  mount(rootEl, ctx) {
    injectDeckplate();
    rootEl.innerHTML = '';
    rootEl.classList.add('k-screen', 'k-screen--stage');
    rootEl.dataset.screen = FIRST_BOOT_MOTION_ASK_ID;
    rootEl.setAttribute('role', 'dialog');
    rootEl.setAttribute('aria-modal', 'true');
    rootEl.setAttribute('aria-labelledby', 'sf-motion-ask-title');
    rootEl.setAttribute('aria-describedby', 'sf-motion-ask-kicker');
    rootEl.dataset.kReady = '0';

    const { title, stage, status } = createTitleFrame(rootEl);
    const wordmark = title.querySelector('h1');
    if (wordmark) wordmark.id = 'sf-motion-ask-title';
    status.id = 'sf-motion-ask-kicker';
    status.textContent = 'Motion effects';
    stage.setAttribute('aria-label', 'Motion effects');

    const rail = el('div', 'of-title-rail fh-rail');
    rail.setAttribute('aria-hidden', 'true');
    stage.appendChild(rail);

    const list = words([
      { action: 'full', label: 'Full', sub: 'Keep combat feel', primary: true, current: true },
      { action: 'reduce', label: 'Reduce', sub: 'Calm shake, punch and hit-stop' },
    ], {
      ariaLabel: 'Motion effects',
      onPick: (action) => this._pick(ctx, action),
    });
    stage.appendChild(list);

    refs = {
      root: rootEl,
      list,
      buttons: [...list.querySelectorAll('button')],
    };
    markPlateReady(rootEl);
  },

  onShow() {
    if (!refs) return;
    const first = refs.buttons[0];
    if (first) try { first.focus(); } catch (_) {}
    try { stamp(refs.buttons, { state: 'motionAsk:arrive' }); } catch (_) {}
  },

  onHide() { refs = null; },

  dispose() { refs = null; },

  _pick(ctx, action) {
    if (!MOTION_ASK_CHOICES.includes(action)) return;
    const settings = ctx && ctx.state && ctx.state.settings;
    recordMotionChoice(settings, action);
    if (ctx && ctx.bus && typeof ctx.bus.emit === 'function') {
      ctx.bus.emit('settings:changed', {
        section: 'accessibility',
        key: 'motionPreference',
        value: action,
      });
    }
    const mgr = getManager(ctx);
    if (mgr && typeof mgr.replaceScreen === 'function') mgr.replaceScreen('mainMenu');
    else if (mgr && typeof mgr.pushScreen === 'function') mgr.pushScreen('mainMenu');
    else if (ctx && ctx.bus && typeof ctx.bus.emit === 'function') {
      ctx.bus.emit('ui:replaceScreen', { id: 'mainMenu' });
    }
  },
};
