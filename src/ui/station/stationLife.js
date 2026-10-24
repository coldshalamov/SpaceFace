// src/ui/station/stationLife.js — station "life" presenter slot for the berth chrome.
//
// HOTFIX PLACEHOLDER. de968a6e55 (GOLD-HOME Long Berth, row 445) wired
// createStationLifePresenter into stationApp.js (create, then show/hide/dispose with the dock
// lifecycle), but never committed this module, so esbuild could not resolve ./stationLife.js and
// the browser 404'd it at boot. This inert presenter keeps the behaviour from before de968a6e55:
// it adds no receipts, timers or bus subscriptions. It matches the contract stationApp.js uses
// (ctx plus { ...opts.lifeTimers, showReceipt, receiptVisible }, returning show/hide/dispose).
// Replace the whole file when the real presenter lands.

/** Presentation only: owns no state writers. Safe to show/hide repeatedly; dispose is final. */
export function createStationLifePresenter(ctx, options = {}) {
  void ctx; void options;
  let visible = false;
  let disposed = false;
  return {
    show() { if (!disposed) visible = true; },
    hide() { visible = false; },
    dispose() { visible = false; disposed = true; },
    get visible() { return visible; },
    get disposed() { return disposed; },
  };
}
