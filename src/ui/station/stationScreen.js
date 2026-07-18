// src/ui/station/stationScreen.js — screen-module adapter for the docked station.
// Wraps the "Orbital Command" app (createStationApp) in the { id, mount, onShow, onHide, refresh }
// contract uiRoot expects, injects the real serviceQuote for dock-action costs, and re-exports the
// exit-gate hook (uiRoot calls mod.installStationExitGate for id==='station'). The legacy
// stationHub.js stays on disk so its helper exports keep resolving for checks — it just no longer
// registers as the station screen.
import { createStationApp } from './stationApp.js';
import { serviceQuote } from '../screens/services.js';
export { installStationExitGate, commitStationUndock, setStationExitOwner } from '../screens/stationHub.js';

let app = null;

export const stationScreen = {
  id: 'station',
  mount(rootEl, ctx) {
    if (rootEl && rootEl.classList) rootEl.classList.add('sx-fullbleed');
    app = createStationApp(rootEl, ctx, { serviceQuote });
  },
  onShow(ctx) { if (app && app.onShow) app.onShow(ctx); },
  onHide() { if (app && app.onHide) app.onHide(); },
  refresh(ctx, options) { if (app && app.refresh) app.refresh(ctx, options); },
};
