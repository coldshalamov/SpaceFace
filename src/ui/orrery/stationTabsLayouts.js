// ORRERY composition for the station's list-and-reading tabs (design/frontend/ORRERY.md §6 Station):
// Missions (contracts), Bar, Factions, Industry, Ledger. They share one grammar with the Market's
// Ladder: the offers stand on a ruled rail with a tick each and the shared notched Hand at the chosen
// one; the reading beside it has no panel (a pool of shade), its figure in warm white, its terms as
// a ledger of caps and values; the one verb that commits rests in bone and lights amber where the
// player reaches. It styles the tabs' existing nodes (checks read their classes) and pins nothing.
import { injectOrrery } from './tokens.js';

const STYLE_ID = 'sf-orrery-station-tabs';
const T = 'html body #screens > .sx-berth.orr-station';
const BONE = '236 230 216';
const LABEL = 'font-family:var(--dp-face-label, "Archivo") !important; font-stretch:112%; font-variation-settings:"wdth" 112, "wght" 650 !important; font-weight:650 !important; text-transform:uppercase;';
const PLAIN = 'background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important; clip-path:none !important;';
const HAND = 'clip-path:polygon(0 0, 100% 50%, 0 100%, 26% 50%) !important;';
/** The rail of light down a list, a tick on every row, the Hand on the chosen one. */
const rail = (list, row, chosen) => `
${T} ${list} { background:linear-gradient(90deg, transparent 7px, rgb(${BONE} / .22) 7px, rgb(${BONE} / .22) 8px, transparent 8px) !important; }
${T} ${row} { ${PLAIN} position:relative !important; padding-left:26px !important; }
${T} ${row}::after { display:none !important; }
${T} ${row}::before { content:"" !important; display:block !important; position:absolute !important; left:4px !important; top:50% !important; width:8px !important; height:1px !important;
  margin:0 !important; background:rgb(${BONE} / .38) !important; box-shadow:none !important; transform:none !important; clip-path:none !important; border:0 !important; }
${T} ${row}:is(${chosen})::before { left:2px !important; width:11px !important; height:14px !important; margin-top:-7px !important; ${HAND} background:var(--dp-hand, #f2b950) !important;
  filter:drop-shadow(0 0 5px rgb(242 185 80 / .55)); }
${T} ${list}:is(:focus-within, :hover) ${row}:is(${chosen})::before { background:var(--dp-hand-hot, #ffd98c) !important; filter:drop-shadow(0 0 7px rgb(255 217 140 / .75)); }
${T} ${row}:focus-visible { outline:none !important; }`;
/** A verb that commits: a bone word at the reading's weight; amber where the player reaches it. */
const commit = (sel) => `
${T} ${sel} { ${PLAIN} min-height:0 !important; min-width:0 !important; height:auto !important; border-radius:0 !important; padding:8px 2px 12px !important;
  font-family:var(--dp-face-display, "Archivo") !important; font-stretch:125% !important; font-variation-settings:"wdth" 125, "wght" 800 !important;
  font-size:22px !important; letter-spacing:.1em !important; text-transform:uppercase; color:rgb(248 244 234) !important; }
${T} ${sel}::before, ${T} ${sel}::after { display:none !important; }
${T} ${sel}:not(:disabled):is(:hover, :focus-visible) { color:var(--dp-hand-hot, #ffd98c) !important; outline:none !important; text-shadow:0 0 22px rgb(255 217 140 / .4);
  background-image:linear-gradient(90deg, var(--dp-hand, #f2b950), rgb(242 185 80 / 0)) !important; background-size:100% 2px !important;
  background-position:0 100% !important; background-repeat:no-repeat !important; }
${T} ${sel}:disabled { color:rgb(${BONE} / .45) !important; }`;
/** A small verb: a word with its notch. */
const word = (sel) => `
${T} ${sel} { ${PLAIN} ${LABEL} min-height:0 !important; min-width:0 !important; height:auto !important; padding:3px 0 !important; font-size:10.5px !important;
  letter-spacing:.16em !important; color:rgb(248 244 234) !important; }
${T} ${sel}::after { display:none !important; }
${T} ${sel}::before { all:unset !important; content:"›  " !important; color:rgb(${BONE} / .55) !important; }
${T} ${sel}:is(:hover, :focus-visible) { color:var(--dp-hand, #f2b950) !important; outline:none !important; }`;

const CSS = `
/* ================================ MISSIONS ================================================== */
/* the hang: the posted jobs on their rail first, the dispatch's choice folded under them, yours last */
/* one ruled scale runs the whole column, minor ticks every 8px; the rows hang their major ticks on it */
${T} .sx-ct__hang { position:relative; padding-left:0 !important;
  background:linear-gradient(90deg, transparent 7px, rgb(${BONE} / .24) 7px, rgb(${BONE} / .24) 8px, transparent 8px) 0 0 / 100% 100% no-repeat,
    repeating-linear-gradient(180deg, rgb(${BONE} / .22) 0 1px, transparent 1px 8px) 4px 0 / 4px 100% no-repeat !important; }
${T} .sx-ct__hang > .k-caps, ${T} .sx-ct__yours { ${LABEL} font-size:10.5px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .72) !important; padding-left:26px !important; }
${T} .sx-ct-dispatch__label { ${LABEL} font-size:9.5px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .5) !important; padding-left:26px !important; }
${T} .sx-ct__board { display:flex !important; flex-direction:column; align-items:stretch; }
${T} .sx-ct__board > .sx-ct__rows { order:1; flex:none; background:none !important; }
${T} .sx-ct__rows > li { display:block !important; }
/* the dispatch's choice, hung off the job it names: a flagged sub-row under that job */
${T} .sx-ct__rows .sx-ct-row.sx-decision__opt--sub { display:flex !important; flex-direction:column; align-items:flex-start; gap:2px; padding:0 0 8px 42px !important;
  margin-top:-2px; min-height:0 !important; height:auto !important; }
${T} .sx-ct__rows .sx-ct-row.sx-decision__opt--sub::before { all:unset !important; content:"›" !important; position:absolute !important; left:28px !important; top:-1px !important;
  width:auto !important; height:auto !important; color:rgb(${BONE} / .55) !important; font-size:12px; }
${T} .sx-ct__rows .sx-ct-row.sx-decision__opt--sub .k-row__name { ${LABEL} font-size:9.5px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .86) !important; }
${T} .sx-ct__rows .sx-ct-row.sx-decision__opt--sub .k-row__sub { font-size:11px !important; line-height:1.4; color:rgb(${BONE} / .55) !important; white-space:normal; }
${T} .sx-ct__rows .sx-ct-row.sx-decision__opt--sub:is(:hover, :focus-visible) .k-row__name { color:var(--dp-hand, #f2b950) !important; }
${T} .sx-ct__active { padding-left:26px !important; }
/* the dispatch's choice: a sentence and its offers as verbs, after the ladder */
${T} .sx-ct__board > .sx-decision { ${PLAIN} order:2; flex:none; padding:0 !important; margin:20px 0 0 !important; }
${T} .sx-ct__board > .sx-decision > .k-sentence { color:rgb(${BONE} / .66) !important; font-size:12.5px !important; line-height:1.45; margin:0 0 6px !important; max-width:none; }
${T} .sx-ct-row.sx-decision__opt { ${PLAIN} position:relative !important; display:flex !important; flex-direction:column; align-items:flex-start; gap:2px;
  padding:5px 0 5px 18px !important; min-height:0 !important; height:auto !important; width:100% !important; text-align:left; }
${T} .sx-ct-row.sx-decision__opt::after { display:none !important; }
${T} .sx-ct-row.sx-decision__opt::before { all:unset !important; content:"›" !important; position:absolute !important; left:2px; top:4px; color:rgb(${BONE} / .55) !important; }
${T} .sx-ct-row.sx-decision__opt .k-row__name { ${LABEL} font-size:10.5px !important; letter-spacing:.14em !important; color:rgb(248 244 234) !important; }
${T} .sx-ct-row.sx-decision__opt .k-row__sub { font-size:11px !important; color:rgb(${BONE} / .58) !important; }
${T} .sx-ct-row.sx-decision__opt:is(:hover, :focus-visible) .k-row__name { color:var(--dp-hand, #f2b950) !important; }
${T} .sx-ct-row.sx-decision__opt:focus-visible { outline:none !important; }
/* the posted jobs on the rail */
${rail('.sx-ct__rows', '.sx-ct__rows .sx-ct-row', '.is-active, .is-selected, [aria-selected="true"]')}
${T} .sx-ct__rows .sx-ct-row { padding-top:9px !important; padding-bottom:9px !important; min-height:0 !important; height:auto !important;
  display:grid !important; grid-template-columns:minmax(0, 1fr) 64px; align-items:baseline; column-gap:14px; width:100% !important; text-align:left; }
${T} .sx-ct__rows .sx-ct-row > .sx-ct-row__rew { grid-column:2; grid-row:1; justify-self:end; text-align:right; }
${T} .sx-ct__rows .sx-ct-row > .sx-ct-row__title { grid-column:1; grid-row:1; }
${T} .sx-ct__rows .sx-ct-row .sx-ct-row__crest { display:none !important; }
${T} .sx-ct__rows .sx-ct-row .sx-ct-row__title { font-size:13px !important; font-weight:560; letter-spacing:.02em !important; text-transform:none !important;
  color:rgb(${BONE} / .86) !important; font-family:var(--dp-face-body, "Instrument Sans") !important; }
${T} .sx-ct__rows .sx-ct-row:is(.is-active, .is-selected, [aria-selected="true"]) .sx-ct-row__title { color:rgb(250 247 238) !important; }
${T} .sx-ct__rows .sx-ct-row:is(:hover, :focus-visible) .sx-ct-row__title { color:rgb(255 250 240) !important; }
${T} .sx-ct__rows .sx-ct-row .sx-ct-row__rew { font-size:13.5px !important; font-weight:620; color:rgb(248 244 234) !important; font-variant-numeric:tabular-nums; }
${T} .sx-ct__rows .sx-ct-row .sx-ct-row__badge { ${LABEL} font-size:9px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .8) !important; background:none !important; }
/* the Hand's bloom: a soft disc of its own light behind the chevron (a clip-path clips a filter, so it is geometry) */
${T} .sx-ct__rows .sx-ct-row:is(.is-active, .is-selected, [aria-selected="true"])::after { content:"" !important; display:block !important; position:absolute !important; left:-6px !important;
  top:50% !important; width:28px !important; height:28px !important; margin-top:-14px !important; border-radius:50% !important; pointer-events:none;
  background:radial-gradient(circle, rgb(242 185 80 / .36), rgb(242 185 80 / 0) 66%) !important; transition:background .18s linear; }
${T} .sx-ct__rows:is(:focus-within, :hover) .sx-ct-row:is(.is-active, .is-selected, [aria-selected="true"])::after { background:radial-gradient(circle, rgb(255 217 140 / .55), rgb(255 217 140 / 0) 70%) !important; }
${T} .sx-ct__rows .sx-ct-row:is(.is-active, .is-selected, [aria-selected="true"])::before { filter:none; }
/* yours: the tracked job as a line and its tag */
${T} .sx-ct__active, ${T} .sx-ct__jobs, ${T} .sx-job { ${PLAIN} }
${T} .sx-job { padding:6px 0 !important; min-height:0 !important; }
${T} .sx-job__title { font-size:13px !important; color:rgb(248 244 234) !important; }
${T} .sx-job__meta { font-size:11.5px !important; color:rgb(${BONE} / .6) !important; }
${T} .sx-job__track { ${PLAIN} ${LABEL} min-height:0 !important; height:auto !important; padding:3px 0 !important; font-size:9.5px !important; letter-spacing:.2em !important;
  color:rgb(${BONE} / .8) !important; }
${T} .sx-job__track::after { display:none !important; }
${T} .sx-job__track::before { all:unset !important; content:"●  " !important; font-size:7px; vertical-align:2px; color:rgb(248 244 234) !important; }
${T} .sx-job__track:is(:hover, :focus-visible) { color:var(--dp-hand, #f2b950) !important; outline:none !important; }
${T} .sx-ct__none { color:rgb(${BONE} / .6) !important; font-size:12.5px !important; }
/* the dossier: no panel; the reading in the left column, the route orrery standing beside it */
${T} .sx-dossier { ${PLAIN} position:relative; isolation:isolate; display:grid !important; grid-template-columns:minmax(0, 600px) minmax(280px, 1fr);
  column-gap:clamp(28px, 4vw, 72px); align-content:start; align-items:start; }
${T} .sx-dossier > * { grid-column:1; min-width:0; }
${T} .sx-dossier > .orr-ct-route { grid-column:2; grid-row:1 / span 18; align-self:start; width:100%; height:clamp(320px, 42vh, 460px); margin:6px 0 0 !important; }
${T} .sx-dossier::before { content:""; position:absolute; z-index:-1; inset:-40px -60px; pointer-events:none;
  background:radial-gradient(closest-side, rgb(7 8 10 / .8), rgb(7 8 10 / .6) 60%, rgb(7 8 10 / 0)); }
${T} .sx-dossier > .k-caps { ${LABEL} font-size:10.5px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .6) !important; }
${T} .sx-dossier__title, ${T} .sx-dossier__title .sf-entity-link { text-decoration:none !important; background-image:none !important; border-bottom:0 !important; }
${T} .sx-dossier__title .sf-entity-link:is(:hover, :focus-visible) { text-decoration:underline 1px rgb(${BONE} / .45) !important; text-underline-offset:6px; outline:none !important; }
${T} .sx-dossier :is(.sx-dossier__client, .sx-dossier__route) .sf-entity-link { text-decoration:none !important; background-image:none !important;
  border-bottom:0 !important; color:rgb(248 244 234) !important; }
${T} .sx-dossier :is(.sx-dossier__client, .sx-dossier__route) .sf-entity-link:is(:hover, :focus-visible) { color:var(--dp-hand, #f2b950) !important;
  text-decoration:underline 1px rgb(242 185 80 / .6) !important; text-underline-offset:4px; outline:none !important; }
${T} .sx-dossier__client { color:rgb(${BONE} / .72) !important; }
${T} .sx-dossier__reward .k-hero__n { color:rgb(248 244 234) !important; text-shadow:0 0 24px rgb(0 0 0 / .5) !important;
  font-variation-settings:"wdth" 100, "wght" 500 !important; font-stretch:100% !important; font-weight:500 !important; letter-spacing:0 !important; }
${T} .sx-dossier__reward .k-hero__n.orr-counter { height:1em; line-height:1; overflow:hidden; }
${T} .sx-dossier__reward .k-hero__n.orr-counter .orr-counter__digit { width:.58em; }
${T} .sx-dossier__reward .k-hero__w { ${LABEL} font-size:10.5px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .66) !important; }
${T} :is(.sx-dossier__route, .sx-dossier__risk, .sx-dossier__summary, .sx-dossier__briefing) { color:rgb(${BONE} / .8) !important; font-size:13px !important; line-height:1.5; }
${T} .sx-dossier__briefing .sx-dossier__approach { color:rgb(${BONE} / .62); }
${T} .sx-dossier__gate { color:rgb(${BONE} / .85) !important; font-size:12.5px !important; }
${T} .sx-dossier__gate.k-bad { color:var(--dp-danger, #ff5038) !important; }
${T} .sx-dossier__terms { ${PLAIN} max-width:560px; }
${T} .sx-dossier__terms > li { ${PLAIN} display:grid !important; grid-template-columns:120px minmax(0, 1fr); align-items:baseline; column-gap:18px; padding:7px 0 !important; min-height:0 !important; }
${T} .sx-dossier__terms > li > .k-62 { ${LABEL} font-size:10px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .6) !important; }
/* a forfeit is a loss: the threat channel's red tick on that one term */
${T} .sx-dossier__terms > li.sx-term--threat { position:relative; }
${T} .sx-dossier__terms > li.sx-term--threat > .k-62::before { content:""; position:absolute; left:-16px; top:.55em; width:9px; height:2px;
  background:var(--dp-danger, #ff5038); box-shadow:0 0 6px rgb(255 80 56 / .7); }
${T} .sx-dossier__terms .sx-term__v { display:flex !important; flex-direction:column; align-items:flex-start !important; gap:2px; font-size:13.5px !important; color:rgb(248 244 234) !important;
  text-align:left !important; justify-self:start !important; margin:0 !important; text-transform:none !important; letter-spacing:0 !important; }
${T} .sx-dossier__terms .sx-term__sub { justify-self:start !important; text-align:left !important; margin:0 !important; font-size:11.5px !important; color:rgb(${BONE} / .6) !important; }
${T} .sx-dossier__clauses { ${PLAIN} }
${T} .sx-dossier__clauses .sx-tag { ${PLAIN} ${LABEL} font-size:9.5px !important; letter-spacing:.18em !important; color:rgb(${BONE} / .8) !important; padding:0 !important; }
${T} .sx-dossier__clauses .sx-tag::before { content:"› "; color:rgb(${BONE} / .5); }
${T} .sx-dossier__foot { margin-top:18px !important; }
${commit('.sx-ct-commit:not(.orr-lampkey)')}
/* Accept is the tab's Lamp Key (src/ui/orrery/lampKey.js): the station's kit words must not repaint it */
${T} .sx-ct-commit.orr-lampkey { padding:0 26px 0 20px !important; min-height:44px !important; font-size:15px !important; letter-spacing:.14em !important; color:#1c1406 !important;
  background:none !important; background-image:none !important; text-shadow:none !important; border:0 !important; box-shadow:none !important; border-radius:0 !important; }
${T} .sx-ct-commit.orr-lampkey:is(:hover, :focus-visible, :active) { color:#1c1406 !important; background-image:none !important; text-shadow:none !important; }
${T} .sx-ct-commit.orr-lampkey:disabled { color:rgb(${BONE} / .55) !important; }
${T} .sx-dossier__foot { padding-left:0 !important; }
${T} .sx-dossier__foot > li { display:flex; align-items:center; gap:16px; }
${T} .sx-ct-commit .k-word-sub, ${T} .sx-dossier__foot .k-word-sub { font-size:11.5px !important; color:rgb(${BONE} / .6) !important; }
@media (max-height:800px) {
  ${T} .sx-ct__hang > * + * { margin-top:8px !important; }
  ${T} .sx-ct__hang > .sx-ct__yours { margin-top:14px !important; }
  ${T} .sx-ct__board > .sx-decision { margin-top:12px !important; }
  ${T} .sx-ct__board > .sx-decision > .k-sentence { display:none !important; }
  ${T} .sx-ct-row.sx-decision__opt .k-row__sub { display:none !important; }
  ${T} .sx-ct-row.sx-decision__opt { padding-top:3px !important; padding-bottom:3px !important; }
  ${T} .sx-ct-row.sx-decision__opt .k-row__name { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
  ${T} .sx-ct__rows .sx-ct-row { padding-top:5px !important; padding-bottom:5px !important; }
  ${T} .sx-ct__rows .sx-ct-row .sx-ct-row__title { font-size:12.5px !important; line-height:1.25; }
  ${T} .sx-job { padding:3px 0 !important; }
  ${T} .sx-dossier { grid-template-columns:minmax(0, 460px) minmax(240px, 1fr); column-gap:24px; }
  ${T} .sx-dossier > .orr-ct-route { height:clamp(236px, 37vh, 300px); margin-top:0 !important; }
  ${T} .sx-dossier > .k-caps { margin-bottom:0 !important; }
  ${T} .sx-dossier__title { font-size:24px !important; line-height:1.1 !important; margin:4px 0 6px !important; }
  ${T} .sx-dossier__client { margin:0 !important; font-size:12px !important; }
  ${T} .sx-dossier__reward { margin:6px 0 4px !important; }
  ${T} .sx-dossier__reward .k-hero__n { font-size:36px !important; }
  ${T} :is(.sx-dossier__summary, .sx-dossier__briefing) { display:none !important; }
  ${T} :is(.sx-dossier__route, .sx-dossier__risk) { font-size:11.5px !important; line-height:1.4; margin:3px 0 !important; }
  ${T} .sx-dossier__terms { margin:4px 0 0 !important; }
  ${T} .sx-dossier__terms > li { grid-template-columns:96px minmax(0, 1fr); column-gap:12px; padding:2px 0 !important; }
  ${T} .sx-dossier__terms > li > .k-62 { font-size:9.5px !important; }
  ${T} .sx-dossier__terms .sx-term__v { font-size:12.5px !important; flex-direction:row !important; align-items:baseline !important; gap:8px; flex-wrap:wrap; }
  ${T} .sx-dossier__terms .sx-term__sub { font-size:10.5px !important; }
  ${T} .sx-dossier__foot { margin-top:8px !important; }
  ${T} .sx-ct-commit:not(.orr-lampkey) { padding:4px 2px 8px !important; font-size:20px !important; }
  ${T} .sx-ct-commit.orr-lampkey { min-height:38px !important; font-size:13.5px !important; }
  ${T} .sx-dossier__reward { margin:4px 0 2px !important; }
  ${T} .sx-dossier__reward .k-hero__n { font-size:32px !important; }
  ${T} .sx-dossier__title { font-size:22px !important; }
  ${T} .sx-dossier__terms > li.sx-term--threat > .k-62::before { left:-14px; }
  ${T} .sx-ct__dossier { padding-bottom:6px !important; }
}
@media (max-width:1400px) {
  ${T} .sx-dossier { column-gap:24px; }
}
`;

export function injectOrreryStationTabs(doc = globalThis.document) {
  if (!doc?.head || typeof doc.createElement !== 'function' || typeof doc.getElementById !== 'function') return;
  injectOrrery(doc);
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
export { rail as orreryRailCss, commit as orreryCommitCss, word as orreryWordCss };
