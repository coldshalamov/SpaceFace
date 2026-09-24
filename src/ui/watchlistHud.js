// watchlistHud.js — PQ-183.01. The watch list's HUD half: thin pinned lines inside the receipts
// channel (#toasts / .sf-receipts), stacked ABOVE the transient receipt cards in the same reserved
// lane. Within the attention rules by construction:
//
//   • Pins are CONTINUOUS state — an instrument, not a receipt — so they do not pass admitReceipt,
//     never consume one of the RECEIPT_MAX transient slots, and never enter the polite live region.
//   • The whole block retires while openingInstructionSolo holds: during the one-instruction
//     opening window secondary text surfaces go quiet, and a watch list is secondary text.
//   • pointer-events stays none (inherits #toasts); unpinning happens where pinning does — the
//     dossier's Watch verb — not on the glass.
//
// Refresh is a 1 Hz text pass over at most WATCHLIST_MAX rows plus an immediate pass on
// 'watch:changed'. DOM is rebuilt only when the rendered lines actually change.

import { openingInstructionSolo } from './hudAttention.js';
import { resolveWatchlist, watchKindWord, WATCHLIST_MAX } from './watchlist.js';

const REFRESH_MS = 1000;

export function createWatchlistHud(ctx) {
  const state = ctx && ctx.state;
  const bus = ctx && ctx.bus;
  const root = typeof document !== 'undefined' ? document.getElementById('toasts') : null;
  if (!root || !state) return { destroy() {}, refresh() {} };

  const box = document.createElement('div');
  box.className = 'sf-watchlist';
  box.setAttribute('aria-hidden', 'true');
  root.prepend(box);

  let lastSignature = '';
  let destroyed = false;

  function render() {
    if (destroyed || !box.isConnected) return;
    const pins = openingInstructionSolo(state) ? [] : resolveWatchlist(state).slice(0, WATCHLIST_MAX);
    if (!pins.length) {
      if (lastSignature !== '') {
        box.replaceChildren();
        box.style.display = 'none';
        lastSignature = '';
      }
      return;
    }
    const signature = pins.map((p) => `${p.ref}|${p.detail}|${p.tone}`).join('\n');
    if (signature === lastSignature) return;
    lastSignature = signature;
    const rows = pins.map((p) => {
      const row = document.createElement('div');
      row.className = `sf-watchline sf-watchline--${p.kind}` + (p.tone !== 'calm' ? ` sf-watchline--${p.tone}` : '');
      const kind = document.createElement('span');
      kind.className = 'sf-watchline__kind';
      kind.textContent = watchKindWord(p.kind);
      const label = document.createElement('span');
      label.className = 'sf-watchline__label';
      label.textContent = p.label;
      const detail = document.createElement('span');
      detail.className = 'sf-watchline__detail';
      detail.textContent = p.detail;
      row.append(kind, label, detail);
      return row;
    });
    box.replaceChildren(...rows);
    box.style.display = '';
  }

  const timer = setInterval(render, REFRESH_MS);
  if (timer && typeof timer.unref === 'function') timer.unref();
  const off = bus && bus.on ? bus.on('watch:changed', render) : null;
  render();

  return {
    refresh: render,
    destroy() {
      destroyed = true;
      clearInterval(timer);
      if (typeof off === 'function') off();
      if (box.parentNode) box.parentNode.removeChild(box);
    },
  };
}
