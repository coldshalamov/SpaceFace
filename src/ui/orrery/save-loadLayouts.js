// ORRERY composition for the Save/Load screen — the screen's own layer over the shared
// saveLayouts.js sheet (which also dresses Game Over, so it is not edited per screen).
//
// What lives here is what only this screen owns and no other sheet dresses: the save-name
// field's hover, focus, and disabled readings, plus the reading ledger's hairline card.
// The kit's input focus was a 1px hair brighten (styles/kit.css `.k-input:focus`), and the
// bench walk measured "no visible change" when the field took focus — invisible focus is a
// rubric defect (ORRERY_RUBRIC P4 #13), so focus here is unmistakable: the underline doubles
// and lights to ink with a soft warm pool under the field. Focus keeps the bone voice (the
// kit's 2px bracket is keyboard focus-visible); amber stays the Hand. No animation, so
// reduced motion needs nothing here.
//
// ui-polish-388: the reading ledger (`.sf-save-ledger`) upgrades from the shared sheet's
// thin 1px/.12 radius-2 edge to the promise-scale hairline card (1px bone ~18% / radius 10 /
// faint fill) so the slot reading matches statistics empty-state / Help terms / Records Wall
// bands instead of a sharp Newgrounds plate. Scoped to `.orr-saveload` — Game Over keeps the
// shared saveLayouts edge. Selectors/IDs unchanged.
const STYLE_ID = 'sf-orrery-save-load-layouts';
const BONE = '236 230 216';
const SL = 'html body #screens > .k-screen.of-saveload.orr-saveload.orr-saveload';
/** SL for desktop-only rules (same root as saveLayouts' SLD), after `html:root:not([data-sf-mobile="1"])`. */
const SLD = 'html:root:not([data-sf-mobile="1"]) body #screens > .k-screen.of-saveload.orr-saveload.orr-saveload';

const CSS = `
/* the save-name field: a quiet hover, a focus the eye finds, a disabled state that reads.
   The crossfade rides the kit's focus-duration token, which is 0ms under the game's
   reduced-motion setting (html.sf-reduce-motion) — no motion of our own to gate. */
${SL} .sf-save-ledger .sf-slot-label .k-input { transition:border-color var(--k-d-focus, 120ms) var(--dp-ease-out, ease-out), box-shadow var(--k-d-focus, 120ms) var(--dp-ease-out, ease-out); }
${SL} .sf-save-ledger .sf-slot-label .k-input:hover { border-bottom-color:var(--dp-line-hi, rgb(232 226 212 / .62)) !important; }
${SL} .sf-save-ledger .sf-slot-label .k-input:focus { border-bottom-color:var(--dp-ink, #e8e2d4) !important;
  box-shadow:0 1px 0 var(--dp-ink, #e8e2d4), 0 14px 26px -16px color-mix(in srgb, var(--dp-ink, #e8e2d4) 60%, transparent) !important; outline:none; }
${SL} .sf-save-ledger .sf-slot-label .k-input:focus-visible { outline:2px solid var(--dp-ink, #e8e2d4) !important; outline-offset:4px; }
${SL} .sf-save-ledger .sf-slot-label .k-input:disabled { border-bottom-color:var(--dp-line-faint, rgb(232 226 212 / .14));
  color:var(--dp-ink-mute, #b0aea6); cursor:default; }
/* the placeholder leaves the legacy grey for the field's own ink at a whisper */
${SL} .sf-save-ledger .sf-slot-label .k-input::placeholder { color:color-mix(in srgb, var(--dp-ink, #e8e2d4) 40%, transparent); opacity:1; }

/* reading ledger: promise-scale hairline card (overrides saveLayouts' .12 / radius-2 plate) */
${SL} > .k-stage__foot.sf-save-ledger {
  border:1px solid rgb(${BONE} / .18) !important;
  border-radius:10px !important;
  background:rgb(${BONE} / .025) !important;
}

/* short frames: compress card chrome with the shared densify bands */
@media (max-height:820px) {
  ${SL} > .k-stage__foot.sf-save-ledger { border-radius:8px !important; }
}
@media (max-height:460px) {
  ${SL} > .k-stage__foot.sf-save-ledger { border-radius:8px !important; }
}
@media (max-height:400px) {
  ${SL} > .k-stage__foot.sf-save-ledger { border-radius:6px !important; }
}

/* ui-polish-452 (#1027 review): the hull record's STANDING line now reads. On an ordinary save it is short
   ("No house stands with you"); on a war save it is a sentence ("Drift · Charter · The Drift and Meridian
   front at Tethys Junction still burns"). In the shared sheet's ≤640-tall two-up record that sentence wrapped
   to 5–6 lines in a ~90px cell and pushed LOAD / SAVE HERE / DELETE past the frame (html/body do not scroll).
   - Up to 640 tall the two-up grid stays, and STANDING takes its own full-width row: two lines at most, one
     at ≤460 tall. The whole reading stays in the node's text and its title. The record's keys close to the
     values' 1.3 line height, so a row is no taller than its reading.
   - That extra row would make an ordinary save one row taller than master's grid and print LOAD over
     EXPORT / IMPORT / BACK at 580–600 tall. From 791 wide at 561–640 tall (and 521–790 at 461–640) the
     name field sits beside its label and CREDITS beside its figure, as in the ≤560 band, which gives back
     more than the row costs: an ordinary save ends ~10–20px shorter than master's, not taller.
   - A save that stands with a house (a faction link on STANDING) usually carries long scars / rap sheet /
     grudge readings too, which run 3–4 lines in two-up cells. From 791 to 1499 wide at 421–640 tall (and
     521–790 at 461–640) it reads one entry per line, on a tight 84px key column, so each value gets the
     column's width. From 1500 wide the two-up cells are wide enough, so the grid stays.
   - From 791 to 1499 wide at ≤420 tall (a short desktop window), one entry per line costs six rows, more
     than the frame has, and LOAD / SAVE HERE / DELETE fell below it (html/body do not scroll). There a house
     save keeps the two-up grid, with STANDING back in its own two-up cell on one line, as from 1500 wide at
     ≤460 tall; the one-per-line rule starts at 421 tall. */
@media (min-width:521px) and (max-height:640px) {
  ${SLD} .sf-save-portrait > .sf-ledger-line > .sf-ledger-k { line-height:1.3; }
  ${SLD} .sf-save-portrait > .sf-ledger-line:has(> .sf-portrait-standing) > .sf-ledger-k { grid-column:1; padding-left:0; }
  ${SLD} .sf-save-portrait > .sf-ledger-line > .sf-portrait-standing { grid-column:2 / -1; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; overflow:hidden; }
}
@media (min-width:521px) and (max-height:460px) {
  ${SLD} .sf-save-portrait > .sf-ledger-line > .sf-portrait-standing { -webkit-line-clamp:1; }
}
/* 641–680 tall from 791 wide (the shared sheet's one-entry-per-line record): a war save's STANDING sentence ran to
   a second line and pushed SAVE HERE / DELETE 3–4px under BACK (LOAD over EXPORT at 1024×660). One line here; the
   whole reading stays in the node's text and its title. */
@media (min-width:791px) and (min-height:641px) and (max-height:680px) {
  ${SLD} .sf-save-portrait > .sf-ledger-line > .sf-portrait-standing { display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:1; overflow:hidden; }
}
/* ≥1500 × ≤460 and 791–1499 × ≤420, a house save: STANDING back in its own two-up cell (one line), so the record keeps master's three rows */
@media (min-width:1500px) and (max-height:460px), (min-width:791px) and (max-width:1499px) and (max-height:420px) {
  ${SLD} .sf-save-portrait > .sf-ledger-line:has(> .sf-portrait-standing[data-entity]) > .sf-ledger-k { grid-column:auto; padding-left:8px; }
  ${SLD} .sf-save-portrait > .sf-ledger-line > .sf-portrait-standing[data-entity] { grid-column:auto; }
}
@media (min-width:791px) and (max-width:1499px) and (min-height:421px) and (max-height:640px), (min-width:521px) and (max-width:790px) and (min-height:461px) and (max-height:640px) {
  ${SLD} .sf-save-ledger .sf-save-portrait:has(> .sf-ledger-line > .sf-portrait-standing[data-entity]) { display:flex; flex-direction:column; row-gap:0; }
  ${SLD} .sf-save-portrait:has(> .sf-ledger-line > .sf-portrait-standing[data-entity]) > .sf-ledger-line { display:grid; grid-template-columns:84px minmax(0, 1fr); column-gap:8px; padding:1px 0; }
  ${SLD} .sf-save-portrait:has(> .sf-ledger-line > .sf-portrait-standing[data-entity]) > .sf-ledger-line:nth-of-type(even) > .sf-ledger-k { padding-left:0; }
}
@media (min-width:791px) and (min-height:561px) and (max-height:640px), (min-width:521px) and (max-width:790px) and (min-height:461px) and (max-height:640px) {
  ${SLD} .sf-save-ledger .sf-slot-label { grid-template-columns:auto minmax(0, 1fr); align-items:baseline; column-gap:14px; width:min(34ch, 100%) !important; }
  ${SLD} .sf-save-ledger .sf-slot-label > .k-input { padding:2px 0; }
  ${SLD} .sf-ledger-fact--figure { display:flex; align-items:baseline; gap:14px; }
  ${SLD} .sf-ledger-fact--figure dd { margin:0; gap:8px; align-items:baseline; }
}
`;

export function injectSaveLoadLayouts(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function') return;
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
