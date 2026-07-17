// Flight/pause entry for A2 Ship's Ledger — player-reachable without station chrome redesign.
// Uses the pure projector + panel from shipLedger.js; opens from pause like Mission Log / Codex.

import { createShipLedgerPanel } from './shipLedger.js';

const STYLE_ID = 'sf-ship-ledger-screen-style';

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
  .sf-ship-ledger-screen {
    display: flex; flex-direction: column; gap: 12px;
    min-width: min(92vw, 520px); max-width: min(94vw, 640px);
    max-height: 86vh; overflow: auto; padding: 22px 24px;
    pointer-events: auto;
  }
  .sf-ship-ledger-screen .st-ledger { display: flex; flex-direction: column; gap: 10px; }
  .sf-ship-ledger-screen .st-sub-h {
    margin: 0; font-family: var(--mono); letter-spacing: .18em;
    text-transform: uppercase; color: var(--accent); font-size: 15px;
  }
  .sf-ship-ledger-screen .st-ledger-intro,
  .sf-ship-ledger-screen .st-ledger-status,
  .sf-ship-ledger-screen .st-ledger-empty { margin: 0; color: var(--ink-dim); font-size: 13px; }
  .sf-ship-ledger-screen .st-ledger-status { color: var(--accent); }
  .sf-ship-ledger-screen .st-ledger-list {
    list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px;
  }
  .sf-ship-ledger-screen .st-ledger-entry {
    border: 1px solid var(--panel-edge); border-radius: 6px;
    background: var(--panel); padding: 10px 12px;
  }
  .sf-ship-ledger-screen .st-ledger-cycle,
  .sf-ship-ledger-screen .st-ledger-type {
    font-family: var(--mono); font-size: 11px; letter-spacing: .06em; color: var(--ink-mute);
    margin-right: 10px;
  }
  .sf-ship-ledger-screen .st-ledger-type { color: var(--accent); }
  .sf-ship-ledger-screen .st-ledger-line { margin: 6px 0 0; color: var(--ink); font-size: 13px; }
  .sf-ship-ledger-screen .st-ledger-annotation {
    margin-top: 8px; padding: 8px 10px; border-left: 2px solid var(--accent);
    color: var(--ink-dim); font-size: 12px; font-style: italic;
  }
  .sf-ship-ledger-screen .st-ledger-nav {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
  }
  .sf-ship-ledger-screen .st-ledger-page-btn {
    min-width: 7rem; padding: 8px 12px; font-size: 12px; letter-spacing: .05em;
  }
  .sf-ship-ledger-screen .st-ledger-page { font-family: var(--mono); color: var(--accent); }
  .sf-ship-ledger-screen .sf-ledger-foot {
    display: flex; justify-content: flex-end; margin-top: 4px;
  }
  `;
  document.head.appendChild(style);
}

function getManager(ctx) {
  if (ctx && ctx.screenManager) return ctx.screenManager;
  if (ctx && ctx.screens && ctx.screens.pushScreen) return ctx.screens;
  const ui = ctx && ctx.registry && ctx.registry.get && ctx.registry.get('ui');
  if (ui && ui.screenManager) return ui.screenManager;
  if (ui && ui.manager) return ui.manager;
  return null;
}

export const shipLedgerScreen = {
  id: 'shipLedger',
  blocksInput: true,
  pauseGame: true,

  mount(rootEl, ctx) {
    injectStyle();
    rootEl.innerHTML = '';
    rootEl.classList.add('panel', 'sf-menu', 'sf-ship-ledger-screen');
    this._panel = createShipLedgerPanel(ctx);
    rootEl.appendChild(this._panel.el);

    const foot = document.createElement('div');
    foot.className = 'sf-ledger-foot';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'sf-btn st-btn st-ledger-page-btn';
    back.textContent = 'Back';
    back.addEventListener('click', () => {
      const mgr = getManager(ctx);
      if (mgr && typeof mgr.popScreen === 'function') mgr.popScreen();
      else if (ctx && ctx.bus) ctx.bus.emit('ui:popScreen', {});
    });
    foot.appendChild(back);
    rootEl.appendChild(foot);
    this._foot = foot;
    this._panel.onShow();
  },

  onShow(ctx) {
    if (this._panel && typeof this._panel.onShow === 'function') this._panel.onShow(ctx);
  },

  unmount() {
    if (this._panel && typeof this._panel.destroy === 'function') this._panel.destroy();
    this._panel = null;
    this._foot = null;
  },
};

export default shipLedgerScreen;
