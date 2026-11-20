// ORRERY composition for the station's Factions tab (design/frontend/ORRERY.md §6 Station —
// Factions). The tab's shared grammar (the rail, the Hand chevron, the crest orbit, the standing
// scale) lives in stationTabsLayouts.js and the screen composes it; this sheet owns only what the
// walk proved missing on this screen: the powers rail's answered states. Hovering or keying a row
// changed no pixel (ui-bench --walk: five rows hovered, "the picture stayed"), and the shared
// rail() ends `:focus-visible { outline: none }` with no replacement here — a keyboard player saw
// nothing. The rows now answer the way the Missions tab's rows already do: the tick leans in, the
// name brightens, a press snaps the tick to the Hand's colour, and keyboard focus carries the same
// light where the pointer never went. Selection itself stays the shared grammar's (the amber notch).
import { injectOrrery } from './tokens.js';

const STYLE_ID = 'sf-orrery-station-factions';
const T = 'html body #screens > .sx-berth.orr-station';
// a desktop window, not the phone composition (mobileScreenLayouts.js owns data-sf-mobile)
const D = 'html:root:not([data-sf-mobile="1"]) body #screens > .sx-berth.orr-station';
// the same warm bone the station tabs' grammar is drawn with (stationTabsLayouts.js)
const BONE = '236 230 216';
// one class deeper than stationTabsLayouts.js selectors, so same-property overrides win ties
const ROW = `${T} .sx-fac__rows .sx-fac-row`;

const CSS = `
/* ==== RUGGEDIZED METAL-AND-GLASS FACTIONS TACTICAL TERMINAL ================================= */
/* Fix broken 2-column grid in .sx-fac__stage: syncScrollExtent(stageEl) inserts <i class="orr-extent">
   as first child of .sx-fac__stage, which occupied Grid Column 1 Row 1, pushed .orr-fac-orbit into
   Column 2 Row 1, and wrapped .sx-fac-reading onto Column 1 Row 2 at the bottom! */
${T} .sx-fac .sx-fac__stage > .orr-extent:not(.orr-extent--foot),
${T} .sx-fac .sx-fac__stage > .orr-extent::before {
  display:none !important;
  content:none !important;
  position:absolute !important;
}
${T} .sx-fac .sx-fac__stage > .orr-fac-orbit {
  grid-column:1;
  grid-row:1;
  box-sizing:border-box !important;
  border:1px solid rgb(154 198 218 / .30) !important;
  border-radius:2px !important;
  background:
    linear-gradient(90deg, #f2b950 0 28px, rgb(158 220 233 / .48) 28px 140px, rgb(158 220 233 / .14) 140px 100%) top left / 100% 2px no-repeat,
    radial-gradient(circle at 50% 50%, rgb(24 58 80 / .36) 0%, rgb(11 24 35 / .94) 68%, rgb(7 16 24 / .97) 100%) !important;
  box-shadow:inset 0 1px 0 rgb(208 238 250 / .14), inset 0 -2px 0 rgb(2 6 10 / .85), 0 12px 28px rgb(0 0 0 / .58) !important;
}
${T} .sx-fac .sx-fac__stage > .sx-fac-reading,
${T} .sx-fac .sx-fac-reading {
  grid-column:2;
  grid-row:1;
  align-self:start;
  box-sizing:border-box !important;
  position:relative !important;
  isolation:isolate;
  border:1px solid rgb(154 198 218 / .32) !important;
  border-radius:2px !important;
  background:
    linear-gradient(90deg, #f2b950 0 28px, rgb(158 220 233 / .48) 28px 140px, rgb(158 220 233 / .14) 140px 100%) top left / 100% 2px no-repeat,
    repeating-linear-gradient(0deg, rgb(158 220 233 / .012) 0 1px, transparent 1px 3px),
    radial-gradient(120% 90% at 18% 0%, rgb(24 54 74 / .34), transparent 62%),
    linear-gradient(160deg, rgb(11 24 35 / .95) 0%, rgb(7 16 24 / .97) 100%) !important;
  box-shadow:inset 0 1px 0 rgb(208 238 250 / .14), inset 0 -2px 0 rgb(2 6 10 / .85), 0 12px 28px rgb(0 0 0 / .58) !important;
  padding:16px 18px !important;
  min-width:0;
}
${T} .sx-fac .sx-fac-reading::before { content:none; display:none; }
@media (min-width:901px) and (min-height:641px) {
  ${T} .sx-fac > .sx-fac__rail {
    box-sizing:border-box !important;
    border:1px solid rgb(154 198 218 / .32) !important;
    border-radius:2px !important;
    background:
      linear-gradient(90deg, #f2b950 0 28px, rgb(158 220 233 / .48) 28px 140px, rgb(158 220 233 / .14) 140px 100%) top left / 100% 2px no-repeat,
      repeating-linear-gradient(0deg, rgb(158 220 233 / .012) 0 1px, transparent 1px 3px),
      radial-gradient(120% 90% at 18% 0%, rgb(24 54 74 / .34), transparent 62%),
      linear-gradient(160deg, rgb(11 24 35 / .95) 0%, rgb(7 16 24 / .97) 100%) !important;
    box-shadow:inset 0 1px 0 rgb(208 238 250 / .14), inset 0 -2px 0 rgb(2 6 10 / .85), 0 12px 28px rgb(0 0 0 / .58) !important;
    padding:12px 14px !important;
  }
}
${T} .sx-fac .sx-fac-reading .k-caps { color:#9edce9 !important; }
${T} .sx-fac .sx-fac-heroes .k-hero:first-child .k-hero__n { color:#f3d178 !important; text-shadow:0 0 18px rgb(224 181 94 / .22) !important; }
@media (max-height:820px) { ${T} .sx-fac .sx-fac-reading { border-radius:2px !important; } }
@media (max-height:460px) { ${T} .sx-fac .sx-fac-reading { border-radius:2px !important; } }
@media (max-height:400px) { ${T} .sx-fac .sx-fac-reading { border-radius:2px !important; } }
@media (max-width:760px) { ${T} .sx-fac .sx-fac-reading { border-radius:2px !important; } }
@media (max-width:820px) { ${T} .sx-fac .sx-fac-reading { border-radius:2px !important; } }
@media (max-height:600px) { ${T} .sx-fac .sx-fac-reading { padding:12px 14px !important; } }
@media (max-height:540px) { ${T} .sx-fac .sx-fac-reading { padding:10px 12px !important; } }
@media (max-height:460px) { ${T} .sx-fac .sx-fac-reading { padding:8px 10px !important; } }
@media (max-width:650px) { ${T} .sx-fac .sx-fac-reading { padding:14px 16px !important; } }

/* Remove legacy .orr-extent ruler spine inside .sx-fac__rail and frame faction rows cleanly */
${T} .sx-fac .sx-fac__rail > .orr-extent:not(.orr-extent--foot),
${T} .sx-fac .sx-fac__rail .orr-extent:not(.orr-extent--foot)::before,
${T} .sx-fac .sx-fac__rail .orr-extent:not(.orr-extent--foot)::after {
  display:none !important;
  content:none !important;
}
${T} .sx-fac .sx-fac__rail > .k-caps {
  padding-left:0 !important;
  padding-bottom:5px !important;
  margin-bottom:6px !important;
  color:#9edce9 !important;
  border-bottom:1px solid rgb(158 220 233 / .22) !important;
}
${T} .sx-fac .sx-fac__rail .sx-fac__rows,
${T} .sx-fac .sx-fac__rail .sx-fac__rows:is(:hover, :focus-within) {
  background:none !important;
  background-image:none !important;
}
${T} .sx-fac .sx-fac__rows .sx-fac-row {
  padding:8px 10px !important;
  border-bottom:1px solid rgb(154 198 218 / .12) !important;
  border-radius:2px !important;
  background:none !important;
  transition:background 120ms ease, box-shadow 120ms ease;
}
@media (min-width:651px) and (max-height:800px), (max-height:600px) {
  ${T} .sx-fac .sx-fac__rows .sx-fac-row { padding:5px 8px !important; }
}
${T} .sx-fac .sx-fac__rows .sx-fac-row::before,
${T} .sx-fac .sx-fac__rows .sx-fac-row::after,
${T} .sx-fac .sx-fac__rows .sx-fac-row:is(:hover, :focus-visible, :active, .is-active, .is-selected, [aria-selected="true"])::before,
${T} .sx-fac .sx-fac__rows .sx-fac-row:is(:hover, :focus-visible, :active, .is-active, .is-selected, [aria-selected="true"])::after {
  content:none !important;
  display:none !important;
}
/* hover and keyboard focus answer identically: cyan wash + left accent rail + bright white name */
${T} .sx-fac .sx-fac__rows .sx-fac-row:not(.is-active):not(.is-selected):not([aria-selected="true"]):is(:hover, :focus-visible) {
  background:rgb(158 220 233 / .10) !important;
  box-shadow:inset 2px 0 0 rgb(158 220 233 / .78) !important;
}
${ROW}:is(:hover, :focus-visible) .sx-fac-row__name { color:rgb(255 250 240) !important; text-shadow:0 0 10px rgb(255 250 236 / .3); }
${T} .sx-fac .sx-fac__rows .sx-fac-row:active {
  background:rgb(224 181 94 / .16) !important;
  box-shadow:inset 3px 0 0 #f2b950 !important;
}
${T} .sx-fac .sx-fac__rows .sx-fac-row:is(.is-active, .is-selected, [aria-selected="true"]) {
  background:linear-gradient(90deg, rgb(224 181 94 / .22) 0%, rgb(224 181 94 / .07) 65%, rgb(14 29 42 / .92) 100%) !important;
  box-shadow:inset 3px 0 0 #e6ca8f, inset 0 1px 0 rgb(255 241 207 / .20) !important;
}
${T} .sx-fac .sx-fac__rows .sx-fac-row:is(.is-active, .is-selected, [aria-selected="true"]) .sx-fac-row__name { color:#fff1cf !important; }
${T} .sx-fac .sx-fac__rows .sx-fac-row:is(.is-active, .is-selected, [aria-selected="true"]) .sx-fac-row__tier:not(.k-bad) { color:#f3d178 !important; }
${ROW}:is(.is-active, [aria-selected="true"]):is(:hover, :focus-visible) .sx-fac-row__name { color:rgb(255 255 255) !important; }
/* A tall screen (1920x1080 and mid heights): the reading ran past the stage fold and the arrival
   cut the NEXT MOVE sentence mid-glyph (ui-bench still, 2026-10-26). The rhythm tightens so every
   block heading, the guidance and the relations control stand above the fold; the fold then falls
   inside the folded relations box, where nothing is torn. The short screen's own compact grammar
   (stationTabsLayouts.js max-height:800px) is left untouched. */
@media (min-height:801px) {
  ${T} .sx-fac-reading .sx-fac-overview > * + * { margin-top:7px !important; }
  ${T} .sx-fac-overview .sx-fac-heroes { margin-top:6px !important; }
  ${T} .sx-fac-overview .sx-fac__detail { margin-top:8px !important; gap:9px !important; }
  ${T} .sx-fac__detail .sx-fac-network { margin-top:8px !important; }
  ${T} .sx-fac__detail .k-caps { line-height:1.3; }
  /* the standing figure keeps hero scale (rubric band 56-144) while yielding two ticks of height */
  ${T} .sx-fac-heroes .k-hero:first-child .k-hero__n { font-size:clamp(52px, 6vh, 68px) !important; }
}
/* ui-polish-437: a short wide desktop (1101+ wide, 601-800 tall: 1280x720, 1366x768). The stage is
   277-365px tall but the crest ring was sized 403-420px and the standing figure stood on its own
   90px band, so at scroll 0 the ring's lower crests and the standing scale's thresholds were cut by
   the stage edge (ui-bench still, 2026-11-09). The ring now takes the stage's height, and the
   standing figure stands top-right beside the name with its authority crest behind it, so the
   whole scale and the contract line read above the fold. */
@media (min-width:1101px) and (min-height:601px) and (max-height:800px) {
  ${D} .orr-fac-orbit { height:clamp(260px, calc(100vh - 446px), 420px) !important; }
  ${D} .sx-fac .sx-fac-overview > .k-caps, ${D} .sx-fac .sx-fac-ident__name { padding-right:150px !important; }
  ${D} .sx-fac .sx-fac-overview > .sx-fac-heroes { position:absolute !important; top:0; right:0; margin:0 !important; text-align:right; z-index:1; }
  ${D} .sx-fac .sx-fac-heroes .k-hero { align-items:flex-end !important; }
  ${D} .sx-fac .sx-fac-overview > .sx-fac-crest { left:auto !important; right:-8px !important; top:-14px !important; width:112px !important; height:112px !important; }
  ${D} .sx-fac .sx-fac-overview > .sx-fac__detail { margin-top:14px !important; }
}
/* the relations row reads as one line: the fold's summary words, then the word that unfolds them
   (the box the toggle opens is its nextElementSibling, so the legend keeps its place before it;
   the unfolded rows wrap to their own full-width lines) */
${T} .sx-fac-network { display:flex !important; flex-wrap:wrap; align-items:baseline; column-gap:18px; row-gap:2px; }
${T} .sx-fac-network__rows, ${T} .sx-fac-network__empty { flex-basis:100%; }
@media (min-width:651px) and (max-height:800px), (max-height:600px) { ${T} .sx-fac-network { margin-top:6px !important; } }
/* the treaty sentence is a flex item with min-width:auto, so on the phone it ran past the reading's edge and clipped */
${T} .sx-fac-network > .sx-fac-treaty { flex-basis:100%; min-width:0; }
/* a desktop window 650px wide or narrower (390x844): the stage kept its two desktop columns, the
   ring took 300px and the reading got the rest, so CURRENT STATION AUTHORITY stood one letter a
   line down the right edge and the ring sat under the tab bar (ui-bench still, 2026-10-30). The
   stage stacks here the way the phone composition already does: ring first, the reading under it. */
@media (max-width:650px) {
  ${D} .sx-fac .sx-fac__stage { grid-template-columns:minmax(0, 1fr) !important; column-gap:0 !important; row-gap:18px; }
  ${T} .sx-fac .sx-fac__stage > .orr-fac-orbit,
  ${T} .sx-fac .sx-fac__stage > .sx-fac-reading { grid-column:1 !important; grid-row:auto !important; }
  /* stacked, the ring is no longer a pinned column: sticky, it stayed at the stage top while the
     reading scrolled up over it, so the treaty sentence printed across the crest labels. It is
     relative, not static: its crests and rim are absolute and need the ring's own box to sit in */
  ${D} .sx-fac .sx-fac__stage > .orr-fac-orbit { position:relative !important; }
}
/* the stage is the reading's scroll window: when it overflows it folds at the rim (the house
   dissolve, scrollExtent.js) instead of guillotining the last rung — the NEXT MOVE heading was
   hard-cut mid-glyph at rest (bench 1440x900). The paired pad keeps the fold on empty column at
   scroll end, so the last rung reads whole (the industry ladder's RC-49 pairing). */
${T} .sx-fac__stage[data-overflow="1"] { -webkit-mask-image:linear-gradient(180deg, #000 calc(100% - 32px), rgb(0 0 0 / .45) calc(100% - 13px), transparent); mask-image:linear-gradient(180deg, #000 calc(100% - 32px), rgb(0 0 0 / .45) calc(100% - 13px), transparent); padding-bottom:32px !important; }
${T} .sx-fac__stage[data-overflow="0"] { -webkit-mask-image:none; mask-image:none; }
`;

export function injectOrreryStationFactions(doc = globalThis.document) {
  if (!doc?.head || typeof doc.createElement !== 'function' || typeof doc.getElementById !== 'function') return;
  injectOrrery(doc);
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
