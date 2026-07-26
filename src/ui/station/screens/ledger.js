// src/ui/station/screens/ledger.js — station lifecycle adapter for the Ship's Ledger.
// Mounts the SAME panel the Codex "Ledger" tab uses and maps the panel's show/hide/destroy onto
// the station contract (onShow/onHide/refresh/dispose). The panel owns no subscriptions; refresh
// reads the live state reference the station already holds, so there is no hidden refresh and no
// listener leak across host-switch or show/hide cycles.
import { createShipLedgerPanel } from '../../screens/shipLedger.js';

export function createLedgerScreen(ctx) {
  const wrap = document.createElement('div');
  wrap.className = 'sx-ledger';
  const panel = createShipLedgerPanel(ctx, {
    hostId: 'station',
    headingLevel: 2,
    hostOptions: { title: "The Ship's Ledger", intro: 'The Tessera keeps what the manifests leave out.' },
  });
  wrap.appendChild(panel.el);

  return {
    el: wrap,
    onShow() { panel.onShow(); },
    // Declared with no parameter on purpose. The panel closes over the ctx it was built with and
    // reads `ctx.state` live, so it cannot honour a *different* ctx handed to refresh. Accepting one
    // and ignoring it would silently serve stale state if the station contract ever passes a new ctx.
    refresh() {
      panel.refresh();
    },
    onHide() { panel.onHide(); },
    dispose() { panel.destroy(); },
  };
}

export default createLedgerScreen;
