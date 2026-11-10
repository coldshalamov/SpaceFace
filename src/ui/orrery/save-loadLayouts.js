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

/* ui-polish-452 (#1027 review): the hull record's STANDING line now reads (a war save:
   "Drift · Charter · The Drift and Meridian front at Tethys Junction still burns"). In the shared
   sheet's ≤640-tall two-column record that sentence wrapped to 5–6 lines in a ~90px cell and pushed
   LOAD / SAVE HERE / DELETE past the frame (html/body do not scroll): +42px at 880×500, +77px at
   1280×580. Side by side at 461–640 tall the record reads one line per entry instead (the ≤520
   rule's layout): each value gets the column's full width, so the war line takes two lines and the
   other entries one or two, and the record ends up no taller than master's two-up grid. Two lines
   is the cap; the full reading stays in the node's text and its title. */
@media (min-width:791px) and (min-height:461px) and (max-height:640px) {
  ${SLD} .sf-save-ledger .sf-save-portrait { display:flex; flex-direction:column; row-gap:0; }
  ${SLD} .sf-save-portrait > .sf-ledger-line { display:grid; }
  ${SLD} .sf-save-portrait > .sf-ledger-line:nth-of-type(even) > .sf-ledger-k { padding-left:0; }
  ${SLD} .sf-save-portrait .sf-portrait-standing { display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; overflow:hidden; }
}
/* ≤460 tall the two-up record stays (one line per entry does not fit there), and STANDING takes its
   own full-width row at one line, ellipsised, the full reading in its title: a war save no longer
   adds 4–5 lines over master's frame. */
@media (min-width:521px) and (max-height:460px) {
  ${SLD} .sf-save-portrait > .sf-ledger-line:has(> .sf-portrait-standing) > .sf-ledger-k { grid-column:1; padding-left:0; }
  ${SLD} .sf-save-portrait > .sf-ledger-line > .sf-portrait-standing { grid-column:2 / -1; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:1; overflow:hidden; }
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
