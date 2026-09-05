// src/ui/station/screens/ledger.js — station lifecycle adapter for the Ship's Ledger.
// Mounts the SAME panel the Codex "Ledger" tab uses and maps the panel's show/hide/destroy onto
// the station contract (onShow/onHide/refresh/dispose). The panel owns no subscriptions; refresh
// reads the live state reference the station already holds, so there is no hidden refresh and no
// listener leak across host-switch or show/hide cycles.
import { createShipLedgerPanel } from '../../screens/shipLedger.js';

// Station-host corrections that belong to this destination (scoped under .sx-ledger, which only
// exists here; the Codex host mounts the same panel without this wrap and is untouched):
//  - the RUMOR tag rendered in the bright azure the shared sheets kept for accents; the archive
//    reads on the one station accent now;
//  - one short archive page used to read as a mostly black screen — the panel is bounded into a
//    hairline card so the desk around it reads as intentional backdrop, not missing layout.
const STYLE_ID = 'sf-station-ledger-style';
function injectStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = LEDGER_CSS;
  document.head.appendChild(s);
}

// Named LEDGER_CSS, not CSS — a module binding named CSS would shadow the global CSS object
// (the global is what CSS.escape lives on).
const LEDGER_CSS = `
.sx-app .sx-ledger { min-height: 0; height: 100%; padding: 14px 24px 22px; overflow: auto; display: flex; justify-content: center; align-items: stretch; }
/* The record is laid out like a desk, not a floating card: the crest (title, intro, status) holds
   the left column and the entries fill the right at full height, so one short archive page no
   longer reads as a small box at the top of an empty screen. The shared panel's DOM is untouched
   — this is grid placement of the children it already emits. */
.sx-app .sx-ledger .st-panel.st-ledger {
  width: 100%;
  max-width: 1320px;
  align-self: stretch;
  display: grid;
  grid-template-columns: minmax(240px, 300px) minmax(0, 1fr);
  grid-template-rows: auto auto auto minmax(0, 1fr) auto;
  column-gap: 32px;
  row-gap: 10px;
  padding: 18px 24px 22px;
  border: 1px solid var(--sf-edge, #2c343f);
  border-radius: 2px;
  background: color-mix(in srgb, var(--sf-surface, #12161c) 85%, transparent);
}
.sx-app .sx-ledger .st-ledger > .st-sub-h { grid-column: 1; grid-row: 1; }
.sx-app .sx-ledger .st-ledger > .st-ledger-intro { grid-column: 1; grid-row: 2; }
.sx-app .sx-ledger .st-ledger > .st-ledger-status { grid-column: 1; grid-row: 3; }
.sx-app .sx-ledger .st-ledger > .st-ledger-list { grid-column: 2; grid-row: 1 / 5; align-content: start; }
.sx-app .sx-ledger .st-ledger > .st-ledger-empty { grid-column: 2; grid-row: 1; }
.sx-app .sx-ledger .st-ledger > .st-ledger-nav { grid-column: 2; grid-row: 5; justify-content: flex-start; }
.sx-app .sx-ledger .st-ledger > .st-ledger-detail { grid-column: 1 / -1; grid-row: 1 / 6; }
@media (max-width: 1100px) {
  .sx-app .sx-ledger .st-panel.st-ledger { grid-template-columns: minmax(0, 1fr); grid-template-rows: none; }
  .sx-app .sx-ledger .st-ledger > .st-sub-h,
  .sx-app .sx-ledger .st-ledger > .st-ledger-intro,
  .sx-app .sx-ledger .st-ledger > .st-ledger-status,
  .sx-app .sx-ledger .st-ledger > .st-ledger-list,
  .sx-app .sx-ledger .st-ledger > .st-ledger-empty,
  .sx-app .sx-ledger .st-ledger > .st-ledger-nav,
  .sx-app .sx-ledger .st-ledger > .st-ledger-detail { grid-column: 1; grid-row: auto; }
}
.sx-app .sx-ledger .st-ledger .st-ledger-entry--rumor .st-ledger-type {
  color: var(--accent, #4f8fdd);
  border-color: color-mix(in srgb, var(--accent, #4f8fdd) 40%, transparent);
}
`;

export function createLedgerScreen(ctx) {
  injectStyle();
  const wrap = document.createElement('div');
  wrap.className = 'sx-ledger';
  const panel = createShipLedgerPanel(ctx, {
    hostId: 'station',
    headingLevel: 2,
    hostOptions: { title: "The Ship's Ledger", intro: 'The Tessera keeps what the manifests leave out.' },
  });
  wrap.appendChild(panel.el);

  // Presentation fix owned at this layer: the shared panel (also mounted by the Codex host, which
  // is outside this screen's ownership) writes the status line itself and pluralizes "1 entries".
  // The singular case can only show when the archive has exactly one entry, which pins page 1 of
  // 1 and hides archive paging — so normalizing after each refresh this adapter triggers covers
  // every state in which the mispluralized line is reachable. The node keeps its role="status"
  // live-region semantics; only the text is corrected.
  function normalizeStatusPlural() {
    const status = panel.el.querySelector('.st-ledger-status');
    if (status && status.textContent.includes('1 entries')) {
      status.textContent = status.textContent.replace(/\b1 entries\b/g, '1 entry');
    }
  }

  return {
    el: wrap,
    onShow() {
      panel.onShow();
      normalizeStatusPlural();
    },
    // Declared with no parameter on purpose. The panel closes over the ctx it was built with and
    // reads `ctx.state` live, so it cannot honour a *different* ctx handed to refresh. Accepting one
    // and ignoring it would silently serve stale state if the station contract ever passes a new ctx.
    refresh() {
      panel.refresh();
      normalizeStatusPlural();
    },
    onHide() { panel.onHide(); },
    dispose() { panel.destroy(); },
  };
}

export default createLedgerScreen;
