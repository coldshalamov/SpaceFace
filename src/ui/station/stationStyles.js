// The station sheet set as a standalone module: stationApp, the in-flight SHIP screen, game boot
// (main.js) and the UI bench all need it without dragging the whole station app into their graph.
//
// Cascade position is load-bearing. Before ledger D15 these sheets were injected at first dock,
// which appended them after every runtime <style> already in <head> — including the Deckplate
// system sheet (#sf-deckplate-style), which does write .sx-* rules. Boot must reproduce that
// position or the cascade inverts: when the deckplate block exists we insert directly after it;
// when it does not yet, injectDeckplate() (src/ui/deckplate/index.js) reciprocates by inserting
// itself before #sx-fh-tokens. Either order of the two calls lands the same cascade.

const STATION_STYLES = [
  // Field Hardware tokens + component layer first. Interior layout lives in station-orbital.css;
  // station.css loads last so the berth chrome (kit plates, keys, stencil name) beats the leftover
  // Orbital Command website walls.
  { id: 'sx-fh-tokens', href: '/assets/ui/kit/tokens/tokens.css' },
  { id: 'sx-fh-css', href: '/assets/ui/kit/kit/fh.css' },
  { id: 'sx-station-orbital-css', href: '/styles/station-orbital.css' },
  { id: 'sx-station-css', href: '/styles/station.css' },
  { id: 'sx-station-workbench-css', href: '/styles/station-workbench.css' },
];

/** The id deckplate/index.js anchors to when the deckplate sheet is injected after this set. */
export const STATION_STYLES_FIRST_ID = STATION_STYLES[0].id;

export function ensureStylesheet() {
  if (typeof document === 'undefined') return;
  let slot = null;
  for (const style of STATION_STYLES) {
    const existing = document.getElementById(style.id);
    if (existing) { slot = existing; continue; }
    const link = document.createElement('link');
    link.id = style.id;
    link.rel = 'stylesheet';
    link.href = style.href;
    if (slot) {
      slot.after(link);
    } else {
      const anchor = document.getElementById('sf-deckplate-style');
      if (anchor) anchor.after(link);
      else document.head.appendChild(link);
    }
    slot = link;
  }
}
