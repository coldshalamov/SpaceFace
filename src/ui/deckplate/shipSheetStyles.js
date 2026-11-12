// P1 Ship Sheet material. Product stylesheet composition lives in deckplate/, not in the screen
// module that renders the block; screens own placement, deckplate owns material.

export const SHIP_SHEET_STYLE_ID = 'sf-ship-sheet-css';

export const SHIP_SHEET_CSS = `
.sfs { display: block; font-variant-numeric: tabular-nums; max-width: 340px; }
.sfs__head { margin: 0 0 10px; }
.sfs__word {
  margin: 0; font-family: var(--dp-face-display, inherit); font-size: 22px; line-height: 1.05;
  letter-spacing: .01em; color: var(--dp-ink, #E8E2D4); text-transform: none;
}
.sfs__line { margin: 4px 0 0; font-size: 12px; line-height: 1.42; color: var(--dp-ink-dim, #B7B4A6); max-width: 34ch; }
.sfs__class { color: var(--dp-ink-mute, #B0AEA6); text-transform: uppercase; letter-spacing: .08em; font-size: 12px; }
.sfs__stats { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.sfs__stat {
  display: grid; grid-template-columns: minmax(72px, 1fr) auto; align-items: center;
  column-gap: 8px; padding: 4px 0 5px; border-bottom: 1px solid rgba(232,226,212,.10);
  cursor: default; outline: none;
}
.sfs__stat:last-child { border-bottom: 0; }
.sfs__stat:focus-visible { outline: 1px solid var(--dp-lamp, #F2B950); outline-offset: 2px; }
.sfs__stat.is-active .sfs__name { color: var(--dp-ink, #E8E2D4); }
.sfs__name { font-size: 12px; letter-spacing: .06em; color: var(--dp-ink-dim, #B7B4A6); text-transform: uppercase; }
.sfs__val { display: inline-flex; align-items: baseline; gap: 6px; }
.sfs__num { font-family: var(--dp-face-num, monospace); font-size: 17px; line-height: 1; color: var(--dp-ink, #E8E2D4); }
.sfs__delta { font-family: var(--dp-face-num, monospace); font-size: 12px; font-style: normal; letter-spacing: 0; }
.sfs__delta.is-gain { color: var(--dp-good, #7FE7A6); }
.sfs__delta.is-loss { color: var(--dp-danger, #FF5038); }
.sfs__pips { grid-column: 1 / -1; position: relative; display: flex; gap: 2px; margin-top: 4px; }
.sfs__pip { flex: 1 1 0; height: 3px; background: rgba(232,226,212,.14); }
.sfs__pip.is-lit { background: var(--dp-ink, #E8E2D4); }
.sfs__pip.is-ghost-gain { background: var(--dp-good, #7FE7A6); }
.sfs__pip.is-ghost-loss { background: var(--dp-danger, #FF5038); }
.sfs__marker { position: absolute; top: -2px; width: 2px; height: 7px; transform: translateX(-1px); }
.sfs__marker.is-gain { background: var(--dp-good, #7FE7A6); }
.sfs__marker.is-loss { background: var(--dp-danger, #FF5038); }
.sfs__meaning { margin: 8px 0 0; font-size: 12px; line-height: 1.45; color: var(--dp-ink-dim, #B7B4A6); min-height: 2.9em; }
.sfs__note { margin: 8px 0 0; font-size: 12px; line-height: 1.45; color: var(--dp-ink-dim, #B7B4A6); }
.sfs__details {
  margin-top: 8px; padding: 0; border: 0; background: none; color: var(--dp-ink-dim, #B7B4A6);
  font: inherit; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; cursor: pointer;
}
.sfs__details:hover, .sfs__details:focus-visible { color: var(--dp-lamp, #F2B950); }
.sfs__details:focus-visible { outline: 1px solid var(--dp-lamp, #F2B950); outline-offset: 2px; }
.sfs__eng { margin: 8px 0 0; display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; font-size: 12px; }
.sfs__eng dt { color: var(--dp-ink-mute, #B0AEA6); }
.sfs__eng dd { margin: 0; font-family: var(--dp-face-num, monospace); color: var(--dp-ink-dim, #B7B4A6); text-align: right; }
.sfs__eng[hidden] { display: none; }
.sfs--compact { max-width: 300px; }
.sfs--compact .sfs__word { font-size: 16px; }
.sfs--compact .sfs__stat { padding: 3px 0 4px; }
@media (prefers-reduced-motion: no-preference) {
  .sfs__pip { transition: background-color 120ms linear; }
}
`;

/** Inject the block's stylesheet once per document. Safe to call on every render. */
export function ensureShipSheetStyles(doc = null) {
  const host = doc || (typeof document !== 'undefined' ? document : null);
  if (!host || host.getElementById(SHIP_SHEET_STYLE_ID)) return;
  const style = host.createElement('style');
  style.id = SHIP_SHEET_STYLE_ID;
  style.textContent = SHIP_SHEET_CSS;
  (host.head || host.documentElement).appendChild(style);
}
