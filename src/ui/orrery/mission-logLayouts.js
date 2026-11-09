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
// the card is `flex:1 0 auto`, so the inset grows the card instead of clipping the route band. The
// short/narrow inset rules are scoped to the desktop bands they were measured in (see below), so
// the phone rule and the archive sheet's per-band route margins keep winning elsewhere.
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
    /* phones: the card is one column, so the side inset comes straight out of the sentence and
       the terms' values; 8px sides and a 96px label column (archive 104px) keep master's wraps */
    ${ML} .sf-mlog-card { padding: 12px 8px 14px; }
    ${ML} .sf-mlog-card .sf-mlog-terms > .k-row:not(#_) { grid-template-columns: 96px minmax(0, 1fr) !important; }
    ${ML} .sf-mlog-commission-card > .sf-mlog-side { display: none !important; }
  }
  @media (max-width: 639px) and (max-height: 400px) {
    ${ML} > .k-hang.sf-mlog-body { max-height: 25vh !important; }
    ${ML} > .k-stage.sf-mlog-stage {
      -webkit-mask-image: none !important; mask-image: none !important;
    }
  }
  /* Inset bands (ui-polish-423). Each rule is scoped to the desktop band it was measured in and uses
     the base selector's specificity, so the phone rule above (<=639w) and the archive sheet's
     per-band route margins (4/6/18/30px) still win where they apply. */
  @media (max-height: 820px) {
    ${ML} .sf-mlog-card { border-radius: 8px; }
  }
  /* short desktop frames: 8/16/10 inset */
  @media (min-width: 640px) and (max-height: 820px) {
    ${ML} .sf-mlog-card { padding: 8px 16px 10px; }
  }
  /* wide 701-820 tall (1280x720): the archive's 22px route lead drops to 12px so the band starts
     where it did with no inset (y557 vs master 559) and the course track stays above the fold.
     At <=700 tall the archive's own 6px lead stands. */
  @media (min-width: 1101px) and (min-height: 701px) and (max-height: 820px) {
    ${ML} .sf-mlog-card > .ml-route-host { margin-top: 12px; }
  }
  /* wide >820 tall (1440x900, 1600x900, 1920x1080): the full 20px top inset and the 4.8vh lead ran
     the band past the fold (1600x900 ~19px, 1920x1080 ~31px); a 10px top inset and a 3.6vh lead
     keep the medallions in */
  @media (min-width: 1101px) and (min-height: 821px) {
    ${ML} .sf-mlog-card { padding-top: 10px; }
    ${ML} .sf-mlog-card > .ml-route-host { margin-top: clamp(24px, 3.6vh, 46px); }
  }
  /* 761-1100 wide at any height (800x600 ... 1024x768, 900x900, 1100x900, tablet portrait): the
     dial column is fixed, so the side inset is 8px and the column gap (>=641 tall) or the dial
     column (<=640 tall) gives those 16px back; the reading column keeps master's width and its
     words wrap where they did. The top inset is 8px (4px at <=640 tall). */
  @media (min-width: 761px) and (max-width: 1100px) {
    ${ML} .sf-mlog-card { padding: 8px 8px 10px; }
  }
  @media (min-width: 761px) and (max-width: 1100px) and (min-height: 641px) {
    ${ML} .sf-mlog-card { column-gap: 4px; }
  }
  @media (min-width: 761px) and (max-width: 1100px) and (max-height: 640px) {
    ${ML} .sf-mlog-card { padding-top: 4px; grid-template-columns: minmax(0, 1fr) 174px; }
  }
  /* 761-860 wide at any height (800x600, 800x700, 840x660, 768x1024, 810x1080, 820x1180): the
     terms' label column left each value ~76px (about a word a line, already so on master); each
     term stacks its label over its value instead */
  @media (min-width: 761px) and (max-width: 860px) {
    ${ML} .sf-mlog-card .sf-mlog-terms > .k-row:not(#_) { grid-template-columns: minmax(0, 1fr) !important; row-gap: 1px; }
  }
  @media (max-height: 460px) {
    ${ML} .sf-mlog-card { border-radius: 8px; }
  }
  @media (max-height: 400px) {
    ${ML} .sf-mlog-card { border-radius: 6px; }
  }
  @media (min-width: 640px) and (max-height: 400px) {
    ${ML} .sf-mlog-card { padding: 8px 8px 10px; }
  }
  `;
  doc.head.appendChild(style);
}
