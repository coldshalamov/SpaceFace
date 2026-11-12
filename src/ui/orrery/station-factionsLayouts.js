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
/* ui-polish-401: factions reading wears the promise-scale hairline card (1px bone ~18% / radius 10 /
   faint fill / padded); shade-pool ::before stands down. Densify radius 8→6. One class deeper than
   stationTabsLayouts.js (.sx-fac .sx-fac-reading) so the override wins without editing that file. */
${T} .sx-fac .sx-fac-reading {
  box-sizing:border-box !important; position:relative !important; isolation:isolate;
  background:rgb(${BONE} / .025) !important; border:1px solid rgb(${BONE} / .18) !important;
  border-radius:10px; box-shadow:none !important; padding:16px 18px !important; min-width:0; }
${T} .sx-fac .sx-fac-reading::before { content:none; display:none; }
@media (max-height:820px) { ${T} .sx-fac .sx-fac-reading { border-radius:8px; } }
@media (max-height:460px) { ${T} .sx-fac .sx-fac-reading { border-radius:8px; } }
@media (max-height:400px) { ${T} .sx-fac .sx-fac-reading { border-radius:6px; } }
@media (max-width:760px) { ${T} .sx-fac .sx-fac-reading { border-radius:8px; } }
@media (max-width:820px) { ${T} .sx-fac .sx-fac-reading { border-radius:8px; } }
@media (max-height:600px) { ${T} .sx-fac .sx-fac-reading { padding:12px 14px !important; } }
@media (max-height:540px) { ${T} .sx-fac .sx-fac-reading { padding:10px 12px !important; } }
@media (max-height:460px) { ${T} .sx-fac .sx-fac-reading { padding:8px 10px !important; } }
@media (max-width:650px) { ${T} .sx-fac .sx-fac-reading { padding:14px 16px !important; } }

/* hover and keyboard focus answer identically: the row's tick leans in and the name comes forward
   (the Missions rows' grammar, stationTabsLayouts.js). The chosen row keeps its amber notch — the
   lean-in belongs to the rows the Hand is not already pointing at. */
${ROW}:is(:hover, :focus-visible) .sx-fac-row__name { color:rgb(255 250 240) !important; text-shadow:0 0 10px rgb(255 250 236 / .3); }
${ROW}:not(.is-active):not([aria-selected="true"]):is(:hover, :focus-visible)::before { left:2px !important; width:11px !important; height:2px !important; background:rgb(248 244 234) !important; box-shadow:0 0 8px rgb(${BONE} / .45) !important; }
/* a press snaps the tick to the Hand's colour: the pick is felt before the swing lands */
${ROW}:active::before { background:var(--dp-hand, #f2b950) !important; box-shadow:0 0 8px rgb(242 185 80 / .55) !important; }
/* the chosen row keeps the shared notch; its name is already the brightest, so only the press speaks */
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
  ${D} .sx-fac .sx-fac-overview { position:relative !important; padding-right:0 !important; }
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
/* a desktop window 650px wide or narrower (390x844): the stage kept its two desktop columns, the
   ring took 300px and the reading got the rest, so CURRENT STATION AUTHORITY stood one letter a
   line down the right edge and the ring sat under the tab bar (ui-bench still, 2026-10-30). The
   stage stacks here the way the phone composition already does: ring first, the reading under it. */
@media (max-width:650px) {
  ${D} .sx-fac .sx-fac__stage { grid-template-columns:minmax(0, 1fr) !important; column-gap:0 !important; row-gap:18px; }
}
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
