// src/ui/orrery/mission-logLayouts.js — the Mission log's own layout sheet.
//
// The screen composes the ORRERY library through src/ui/orrery/archiveLayouts.js (the tracing beam,
// the dial, the route band, the words); that shared sheet stays untouched and this one carries only
// the mission log's own layout corrections, injected after it so the cascade resolves without
// fighting the archive sheet. Class names, roles and data hooks are the screen's; nothing here
// introduces a second token root or a new stylesheet under styles/.
//
// ui-polish-389: the stage reading (`.sf-mlog-card`) upgrades from an unbound Newgrounds plate
// (no border / no radius / no fill) to the promise-scale hairline card (1px bone ~18% / radius 10 /
// faint fill) so the chosen-contract dossier matches statistics empty-state / Help terms / Records
// Wall bands / Save-Load ledger. Scoped to `.orr-mlog`. Selectors/IDs unchanged.
//
// ui-polish-423: the card's words ran flush against its own hairline ("SALVAGE RETRIEVAL", the
// title, the terms rail and the FROM end all sat at x=0 of the border at every size). The card now
// carries an inset that steps down with the shared densify bands. The stage is a scroll column and
// the card is `flex:1 0 auto`, so the inset grows the card instead of clipping the route band. At
// <=820px tall the inset is 8/16/10 and the route band's lead is 12px, so at 1280x720 the band
// still starts where it did with no inset (y557) and the track stays above the fold.
import { injectOrrery } from './tokens.js';

const BONE = '236 230 216';
const ML = 'html body #screens > .k-screen.sf-mlog.orr-mlog.orr-mlog';

export function injectMissionLogLayouts(doc = globalThis.document) {
  injectOrrery(doc);
  if (!doc?.head || doc.getElementById('sf-mlog-layout')) return;
  const style = doc.createElement('style');
  style.id = 'sf-mlog-layout';
  style.textContent = `
  /* The route band's FROM/TO ends: the base (wide) band held each end to one line with an
     ellipsis, so a long destination lost its sector — "Ruined Cache Station (Ashfall …" on the
     real pixels (ui-bench mission-log, the traced two-contract state, 2026-10-24). The narrow
     bands already wrap between place names rather than ellipsize the sector away; the wide band
     takes the same rule. Same selectors as the archive sheet, injected after it. */
  ${ML} :is(.ml-route__from, .ml-route__to) {
    white-space: normal;
  }
  /* Commission words belong to the dossier; the target text remains readable beside each verb. */
  ${ML} .sf-mlog-commission-card > .sf-mlog-commission-actions {
    grid-column: 1; margin-top: 20px !important; min-width: 0;
  }
  ${ML} .sf-mlog-commission-actions > .k-words--row {
    align-items: stretch; gap: 12px 24px;
  }
  ${ML} .sf-mlog-commission-actions li {
    max-width: 100%; min-width: 0; align-items: flex-start;
  }
  ${ML} .sf-mlog-commission-actions .k-word {
    min-height: 40px; white-space: normal; text-align: left;
  }
  ${ML} .sf-mlog-commission-actions .sf-mlog-commission-target {
    max-width: 28ch; margin: 3px 0 0 !important; white-space: normal; overflow-wrap: anywhere;
    font-size: 13px !important; letter-spacing: normal !important; line-height: 1.35; text-transform: none !important;
  }

  /* stage reading: promise-scale hairline card (was unbound Newgrounds plate) with an inset
     (ui-polish-423). The card is \`flex:1 0 auto\` in a scroll column, so padding grows the card
     rather than clipping the grid; the short and narrow bands below trim the inset and rhythm so
     the route band (FROM/TO and the course track) stays in frame. */
  ${ML} .sf-mlog-card {
    box-sizing: border-box;
    border: 1px solid rgb(${BONE} / .18);
    border-radius: 10px;
    background: rgb(${BONE} / .025);
    padding: 20px 24px 22px;
  }

  @media (max-width: 639px) {
    ${ML} .sf-mlog-card { padding: 14px 14px 16px; }
    ${ML} .sf-mlog-commission-card > .sf-mlog-side { display: none !important; }
  }
  @media (max-width: 639px) and (max-height: 400px) {
    ${ML} > .k-hang.sf-mlog-body { max-height: 25vh !important; }
    ${ML} > .k-stage.sf-mlog-stage {
      -webkit-mask-image: none !important; mask-image: none !important;
    }
  }
  /* short frames: compress card chrome with the shared densify bands */
  @media (max-height: 820px) {
    ${ML} .sf-mlog-card { border-radius: 8px; }
    ${ML} .sf-mlog-card:not(#_) { padding: 8px 16px 10px; }
    ${ML} .sf-mlog-card > .ml-route-host:not(#_) { margin-top: 12px; }
  }
  /* narrow short desktop windows (800x600; the narrow end of the archive sheet's 761-1100w / <=640h band): the dial
     column keeps its 190px, so every px of side inset comes out of the reading column, and the terms'
     104px label column left each value ~76px (about a word a line). The sides step down to 8px and
     each term stacks its label over its value so the value takes the full reading column. */
  @media (min-width: 761px) and (max-width: 900px) and (max-height: 640px) {
    ${ML} .sf-mlog-card:not(#_):not(#_) { padding-left: 8px; padding-right: 8px; }
    ${ML} .sf-mlog-card .sf-mlog-terms > .k-row:not(#_) { grid-template-columns: minmax(0, 1fr) !important; row-gap: 1px; }
  }
  @media (max-height: 460px) {
    ${ML} .sf-mlog-card { border-radius: 8px; }
  }
  @media (max-height: 400px) {
    ${ML} .sf-mlog-card { border-radius: 6px; }
    ${ML} .sf-mlog-card:not(#_) { padding: 10px 12px; }
  }
  `;
  doc.head.appendChild(style);
}
