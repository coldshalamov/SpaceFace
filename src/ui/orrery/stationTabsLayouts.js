// ORRERY composition for the station's list-and-reading tabs (design/frontend/ORRERY.md §6 Station):
// Missions (contracts), Bar, Factions, Industry, Ledger. They share one grammar with the Market's
// Ladder: the offers stand on a ruled rail with a tick each and the shared notched Hand at the chosen
// one; the reading beside it has no panel (a pool of shade), its figure in warm white, its terms as
// a ledger of caps and values; the one verb that commits rests in bone and lights amber where the
// player reaches. It styles the tabs' existing nodes (checks read their classes) and pins nothing.
import { injectOrrery } from './tokens.js';
import { SCROLL_EXTENT_CSS } from './scrollExtent.js';

const STYLE_ID = 'sf-orrery-station-tabs';
const T = 'html body #screens > .sx-berth.orr-station';
const BONE = '236 230 216';
const LABEL = 'font-family:var(--dp-face-label, "Archivo") !important; font-stretch:112%; font-variation-settings:"wdth" 112, "wght" 650 !important; font-weight:650 !important; text-transform:uppercase;';
const PLAIN = 'background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important; clip-path:none !important;';
const HAND = 'clip-path:polygon(0 0, 100% 50%, 0 100%, 26% 50%) !important;';
/** The rail of light down a list, a tick on every row, the Hand on the chosen one. */
const rail = (list, row, chosen) => `
${T} ${list} { background:linear-gradient(90deg, transparent 7px, rgb(${BONE} / .24) 7px, rgb(${BONE} / .24) 8px, transparent 8px) 0 0 / 100% 100% no-repeat,
    linear-gradient(90deg, transparent 5px, rgb(${BONE} / .07) 5px, rgb(${BONE} / .07) 10px, transparent 10px) 0 0 / 100% 100% no-repeat,
    repeating-linear-gradient(180deg, rgb(${BONE} / .3) 0 1px, transparent 1px 8px) 4px 0 / 4px 100% no-repeat !important; }
${T} ${row} { ${PLAIN} position:relative !important; padding-left:44px !important; }
${T} ${row}::after { display:none !important; }
${T} ${row}::before { content:"" !important; display:block !important; position:absolute !important; left:4px !important; top:50% !important; width:8px !important; height:1.5px !important;
  margin:0 !important; background:rgb(${BONE} / .55) !important; box-shadow:none !important; transform:none !important; clip-path:none !important; border:0 !important; }
${T} ${row}:is(${chosen})::before { left:31px !important; width:10px !important; height:13px !important; margin-top:-6.5px !important; ${HAND} background:var(--dp-hand, #f2b950) !important;
  filter:drop-shadow(0 0 5px rgb(242 185 80 / .55)); }
${T} ${list}:is(:focus-within, :hover) ${row}:is(${chosen})::before { background:var(--dp-hand-hot, #ffd98c) !important; filter:drop-shadow(0 0 7px rgb(255 217 140 / .75)); }
${T} ${row}:is(${chosen})::after { content:"" !important; display:block !important; position:absolute !important; left:7px !important; top:50% !important; width:26px !important; height:1.5px !important; margin:-.75px 0 0 !important;
  clip-path:none !important; background:var(--dp-hand, #f2b950) !important; opacity:1; filter:drop-shadow(0 0 5px rgb(242 185 80 / .85)); pointer-events:none; border:0 !important; box-shadow:none !important; transform:none !important; border-radius:0 !important; }
${T} ${list}:is(:focus-within, :hover) ${row}:is(${chosen})::after { background:var(--dp-hand-hot, #ffd98c) !important; }
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
${T} .sx-ct__rows .sx-ct-row.sx-decision__opt--sub { display:flex !important; flex-direction:row; flex-wrap:wrap; align-items:baseline; gap:2px 10px; padding:0 0 8px 26px !important;
  margin-top:-3px; min-height:0 !important; height:auto !important; }
${T} .sx-ct__rows .sx-ct-row.sx-decision__opt--sub::before { display:none !important; }
${T} .sx-ct__rows .sx-ct-row.sx-decision__opt--sub .k-row__name { ${LABEL} font-size:9.5px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .86) !important; }
${T} .sx-ct__rows .sx-ct-row.sx-decision__opt--sub .k-row__sub { font-size:11px !important; line-height:1.4; color:rgb(${BONE} / .6) !important; white-space:normal; }
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
${T} .sx-ct__rows .sx-ct-row:focus-visible:not(.is-active, .is-selected, [aria-selected="true"])::before { height:2px !important; background:rgb(248 244 234) !important; width:11px !important; left:2px !important; }
${T} .sx-ct__rows .sx-ct-row:focus-visible .sx-ct-row__title { color:rgb(255 255 255) !important; text-shadow:0 0 10px rgb(255 250 236 / .35); }
${T} .sx-ct__rows .sx-ct-row .sx-ct-row__rew { font-size:13.5px !important; font-weight:620; color:rgb(248 244 234) !important; font-variant-numeric:tabular-nums; }
${T} .sx-ct__rows .sx-ct-row .sx-ct-row__badge { ${LABEL} display:block; margin-bottom:2px; font-size:9px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .8) !important; background:none !important; }
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
  font-variation-settings:"wdth" 100, "wght" 250 !important; font-stretch:100% !important; font-weight:250 !important; letter-spacing:-.02em !important; font-size:clamp(64px, 8.6vh, 96px) !important; }
${T} .sx-dossier__reward .k-hero__n.orr-counter { height:1em; line-height:1; overflow:hidden; }
${T} .sx-dossier__reward .k-hero__n.orr-counter .orr-counter__digit { width:.58em; }
${T} .sx-dossier__reward .k-hero__w { ${LABEL} font-size:10.5px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .66) !important; }
${T} :is(.sx-dossier__summary, .sx-dossier__briefing) { color:rgb(${BONE} / .8) !important; font-size:13px !important; line-height:1.5; }
${T} :is(.sx-dossier__route, .sx-dossier__risk) { position:absolute !important; width:1px !important; height:1px !important; overflow:hidden !important; clip:rect(0 0 0 0); white-space:nowrap; margin:0 !important; }
/* the consequences as scales: risk on five stops, standing as a gain and a loss round zero */
${T} .orr-ct-scales { width:100%; max-width:520px; height:66px; margin:14px 0 4px !important; }
${T} .orr-ct-scales > svg { width:100%; height:100%; overflow:visible; }
${T} .orr-ct-scales text.orr-ct-scale__key { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:9.5px; letter-spacing:.14em; fill:rgb(${BONE} / .6); }
${T} .orr-ct-scales .orr-ct-scale__rule { stroke:rgb(${BONE} / .32); }
${T} .orr-ct-scales .orr-ct-scale__tick { stroke:rgb(${BONE} / .5); }
${T} .orr-ct-scales .orr-ct-scale__fill { stroke:rgb(248 244 234); }
${T} .orr-ct-scales .orr-ct-scale__fill.is-high { stroke:var(--dp-danger, #ff5038); }
${T} .orr-ct-scales .orr-ct-scale__loss { stroke:var(--dp-danger, #ff5038); }
${T} .orr-ct-scales path.orr-ct-scale__cursor { stroke:rgb(248 244 234); }
${T} .orr-ct-scales .orr-bloom.orr-ct-scale__cursor { stroke:rgb(248 244 234); opacity:.25; }
${T} .orr-ct-scales text.orr-ct-scale__word { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:10px; letter-spacing:.12em; fill:rgb(248 244 234); }
${T} .orr-ct-scales .orr-ct-scale__lossword { fill:var(--dp-danger, #ff5038); }
${T} .orr-ct-scales .orr-ct-scale__sep { fill:rgb(${BONE} / .4); }
${T} .orr-ct-scales text.orr-ct-scale__end { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:7.5px; letter-spacing:.14em; fill:rgb(${BONE} / .45); }
${T} .sx-dossier__briefing .sx-dossier__approach { color:rgb(${BONE} / .62); }
${T} .sx-dossier__gate { color:rgb(${BONE} / .85) !important; font-size:12.5px !important; }
${T} .sx-dossier__gate.k-bad { color:var(--dp-danger, #ff5038) !important; }
${T} .sx-dossier__terms { ${PLAIN} max-width:560px; }
${T} .sx-dossier__terms > li { ${PLAIN} display:grid !important; grid-template-columns:120px minmax(0, 1fr); align-items:baseline; column-gap:18px; padding:7px 0 !important; min-height:0 !important; }
${T} .sx-dossier__terms > li > .k-62 { ${LABEL} font-size:10px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .6) !important; }
/* a forfeit is a loss: the threat channel's red tick on that one term */
${T} .sx-dossier__terms > li.sx-term--threat { position:relative; }
${T} .sx-dossier__terms > li.sx-term--threat .sx-term__v { color:var(--dp-danger, #ff5038) !important; }
${T} .sx-dossier__terms > li.sx-term--threat > .k-62::before { content:""; position:absolute; left:-16px; top:.55em; width:9px; height:2px;
  background:var(--dp-danger, #ff5038); box-shadow:0 0 6px rgb(255 80 56 / .7); }
${T} .sx-dossier__terms .sx-term__v { display:flex !important; flex-direction:column; align-items:flex-start !important; gap:2px; font-size:13.5px !important; color:rgb(248 244 234) !important;
  text-align:left !important; justify-self:start !important; margin:0 !important; text-transform:none !important; letter-spacing:0 !important; }
${T} .sx-dossier__terms .sx-term__sub { justify-self:start !important; text-align:left !important; margin:0 !important; font-size:11.5px !important; color:rgb(${BONE} / .6) !important; }
${T} .sx-dossier__clauses { ${PLAIN} }
${T} .sx-dossier__clauses .sx-tag { ${PLAIN} ${LABEL} font-size:9.5px !important; letter-spacing:.18em !important; color:rgb(${BONE} / .8) !important; padding:0 !important; }
${T} .sx-dossier__clauses .sx-tag::before { content:"› "; color:rgb(${BONE} / .5); }
${T} .sx-dossier__foot { margin-top:26px !important; }
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
  ${T} .sx-dossier__reward .k-hero__n { font-size:36px !important; }
  ${T} .orr-ct-scales { height:58px; margin:6px 0 0 !important; }
  ${T} .sx-dossier__title { font-size:22px !important; }
  ${T} .sx-dossier__terms > li.sx-term--threat > .k-62::before { left:-14px; }
  ${T} .sx-ct__dossier { padding-bottom:6px !important; }
}
@media (max-width:1400px) {
  ${T} .sx-dossier { column-gap:24px; }
}

/* every figure in these tabs is the thin numeral (ORRERY §3.4) */
${T} :is(.sx-fac-heroes, .sx-fab-heroes, .sx-ledger__read-hero) .k-hero__n { font-variation-settings:"wdth" 100, "wght" 250 !important; font-weight:250 !important; }

/* ================================ FACTIONS ================================================== */
/* the powers on the ladder: a name and its standing; the crests live on the orbit */
${T} .sx-fac__rail { position:relative; }
${T} .sx-fac__rail > .k-caps { ${LABEL} font-size:10.5px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .72) !important; padding-left:26px !important; }
${rail('.sx-fac__rows', '.sx-fac__rows .sx-fac-row', '.is-active, [aria-selected="true"]')}
${T} .sx-fac__rows > li { display:block !important; }
${T} .sx-fac__rows .sx-fac-row { display:grid !important; grid-template-columns:minmax(0, 1fr) 56px; align-items:baseline; column-gap:10px;
  padding:7px 0 7px 26px !important; min-height:0 !important; height:auto !important; width:100% !important; text-align:left; }
${T} .sx-fac-row__body { display:contents !important; }
${T} .sx-fac-row__crest, ${T} .sx-fac-row__bar { display:none !important; }
${T} .sx-fac-row__name { font-family:var(--dp-face-body, "Instrument Sans") !important; font-size:13px !important; font-weight:560; letter-spacing:.02em !important;
  text-transform:none !important; color:rgb(${BONE} / .86) !important; }
${T} .sx-fac-row__name > .k-62 { ${LABEL} font-size:9px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .55) !important; display:block; margin-bottom:2px; }
${T} .sx-fac-row:is(.is-active, [aria-selected="true"]) .sx-fac-row__name { color:rgb(250 247 238) !important; }
${T} .sx-fac-row__tier { text-align:right; font-variant-numeric:tabular-nums; font-size:13px !important; color:rgb(248 244 234) !important; }
${T} .sx-fac-row__tier.k-bad { color:var(--dp-danger, #ff5038) !important; }
${T} .sx-fac-row__tier.k-good { color:rgb(248 244 234) !important; }
/* the stage: the orbit at the left, the reading beside it */
${T} .sx-fac__stage { display:grid !important; grid-template-columns:minmax(300px, 40%) minmax(0, 1fr); column-gap:clamp(24px, 3vw, 56px); align-items:start; align-content:start; }
${T} .orr-fac-orbit { position:sticky; top:0; width:100%; height:clamp(320px, 54vh, 560px); }
${T} .sx-fac-reading { min-width:0; position:relative; isolation:isolate; }
${T} .sx-fac-reading::before { content:""; position:absolute; z-index:-1; inset:-30px -60px; pointer-events:none; background:radial-gradient(closest-side, rgb(7 8 10 / .82), rgb(7 8 10 / .62) 60%, rgb(7 8 10 / 0)); }
${T} .sx-fac-overview { padding-right:0 !important; }
${T} .sx-fac-overview > * + * { margin-top:10px !important; }
${T} .sx-fac-crest { display:none !important; }
${T} .sx-fac-overview > .k-caps, ${T} .sx-fac__detail .k-caps { ${LABEL} font-size:10.5px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .6) !important; }
${T} .sx-fac-ident__name { max-width:none !important; margin-top:6px !important; }
${T} .sx-fac-ident__name .sf-entity-link { text-decoration:none !important; background-image:none !important; border-bottom:0 !important; color:inherit !important; }
${T} .sx-fac-ident__name .sf-entity-link:is(:hover, :focus-visible) { text-decoration:underline 1px rgb(${BONE} / .45) !important; text-underline-offset:6px; outline:none !important; }
${T} .sx-fac-ident__flag { font-size:13px !important; color:rgb(${BONE} / .72) !important; }
${T} .sx-fac-heroes { display:flex !important; flex-wrap:wrap; gap:14px 40px !important; margin-top:14px !important; }
${T} .sx-fac-heroes .k-hero { ${PLAIN} padding:0 !important; min-height:0 !important; }
${T} .sx-fac-heroes .k-hero__n { font-family:var(--dp-face-numeral, "Archivo") !important; font-stretch:100% !important; font-variation-settings:"wdth" 100, "wght" 300 !important; font-weight:300 !important;
  font-size:clamp(28px, 3.6vh, 40px) !important; line-height:1 !important; letter-spacing:-.01em !important; color:rgb(248 244 234) !important; text-shadow:none !important; }
${T} .sx-fac-heroes .k-hero__n.k-bad { color:var(--dp-danger, #ff5038) !important; }
${T} .sx-fac-heroes .k-hero__n.k-good { color:rgb(248 244 234) !important; }
${T} .sx-fac-heroes .k-hero__w { ${LABEL} font-size:9.5px !important; letter-spacing:.12em !important; color:rgb(${BONE} / .62) !important; max-width:30ch !important; line-height:1.45; margin-top:5px; }
${T} .sx-fac__detail { display:grid !important; grid-template-columns:1fr !important; gap:14px !important; margin-top:16px !important; }
${T} .sx-fac-ladder:not(.sx-fac-contracts) .sx-ladder { display:none !important; }
${T} .orr-standing { margin-top:10px; max-width:600px; }
${T} .sx-fac-contracts .sx-ladder, ${T} .sx-fac-network__rows { ${PLAIN} }
${T} .sx-fac-contracts .sx-ladder__step { ${PLAIN} display:grid !important; grid-template-columns:56px minmax(0, 1fr); column-gap:14px; align-items:baseline; padding:5px 0 !important; min-height:0 !important; }
${T} .sx-fac-contracts .sx-ladder__min { order:-1; ${LABEL} font-size:10px !important; letter-spacing:.08em !important; text-align:left !important; color:rgb(${BONE} / .55) !important; font-variant-numeric:tabular-nums; }
${T} .sx-fac-contracts .sx-ladder__step.is-reached .sx-ladder__min { color:rgb(248 244 234) !important; }
${T} .sx-fac-contracts .sx-ladder__name { font-size:12.5px !important; color:rgb(${BONE} / .8) !important; }
${T} .sx-fac-contracts .sx-ladder__step.is-reached .sx-ladder__name { color:rgb(248 244 234) !important; }
${T} .sx-fac-contracts .k-row__sub { ${LABEL} font-size:9px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .5) !important; }
${T} .sx-fac-intent .k-sentence { font-size:13px !important; color:rgb(${BONE} / .8) !important; }
${T} .sx-fac-network__rows > li { display:block !important; }
${T} .sx-fac-node { ${PLAIN} display:grid !important; grid-template-columns:minmax(0, 1fr) 56px 80px; column-gap:12px; align-items:baseline; padding:5px 0 !important; min-height:0 !important;
  width:100% !important; text-align:left; font-size:12.5px !important; color:rgb(${BONE} / .86) !important; }
${T} .sx-fac-node::after { display:none !important; }
${T} .sx-fac-node .k-row__name { font-size:12.5px !important; color:rgb(248 244 234) !important; }
${T} .sx-fac-node__kind { ${LABEL} font-size:9.5px !important; letter-spacing:.14em !important; }
${T} .sx-fac-node__kind.k-good { color:rgb(248 244 234) !important; }
${T} .sx-fac-node__kind.k-bad { color:rgb(${BONE} / .6) !important; }
${T} .sx-fac-node .k-row__num { text-align:right; font-variant-numeric:tabular-nums; color:rgb(${BONE} / .8) !important; }
${T} .sx-fac-node .k-row__num .k-row__sub { color:rgb(${BONE} / .55) !important; }
${T} .sx-fac-node:is(:hover, :focus-visible) { outline:none !important; }
${T} .sx-fac-node:is(:hover, :focus-visible) .k-row__name { color:var(--dp-hand, #f2b950) !important; }
${T} .sx-fac-network__empty { font-size:12.5px !important; color:rgb(${BONE} / .6) !important; }
@media (max-height:800px) {
  ${T} .sx-fac__stage { grid-template-columns:minmax(260px, 36%) minmax(0, 1fr); column-gap:20px; }
  ${T} .orr-fac-orbit { height:clamp(260px, 44vh, 320px); }
  ${T} .sx-fac-overview > * + * { margin-top:6px !important; }
  ${T} .sx-fac-ident__name { font-size:26px !important; }
  ${T} .sx-fac-heroes { gap:8px 24px !important; margin-top:8px !important; }
  ${T} .sx-fac-heroes .k-hero__n { font-size:26px !important; }
  ${T} .sx-fac-heroes .k-hero__w { font-size:9px !important; margin-top:3px; }
  ${T} .sx-fac__detail { gap:12px !important; margin-top:12px !important; }
  ${T} .sx-fac-contracts .sx-ladder__step { padding:3px 0 !important; }
  ${T} .sx-fac__rows .sx-fac-row { padding-top:5px !important; padding-bottom:5px !important; }
}

/* ================================ INDUSTRY ================================================== */
${T} .sx-ind__list { position:relative; }
${T} .sx-ind-process__head { ${LABEL} font-size:10.5px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .62) !important; padding-left:26px !important; margin:0 0 6px !important; }
${T} .sx-ind-process + .sx-ind-process { margin-top:18px !important; }
${rail('.sx-ind-process__items', '.sx-ind-process__items .sx-ind-row', '.is-active, [aria-selected="true"]')}
${T} .sx-ind-process__items > li { display:block !important; }
${T} .sx-ind-process__items .sx-ind-row { display:flex !important; padding:6px 0 6px 26px !important; min-height:0 !important; height:auto !important; width:100% !important; text-align:left; }
${T} .sx-ind-row__process { display:none !important; }
${T} .sx-ind-row__body { gap:1px !important; }
${T} .sx-ind-row__name, ${T} .sx-ind-row__name:is(.k-good, .k-signal, .k-bad) { font-family:var(--dp-face-body, "Instrument Sans") !important; font-size:13px !important; font-weight:560;
  letter-spacing:.02em !important; text-transform:none !important; color:rgb(${BONE} / .86) !important; }
${T} .sx-ind-row:is(.is-active, [aria-selected="true"]) .sx-ind-row__name { color:rgb(250 247 238) !important; }
${T} .sx-ind-row__tier { ${LABEL} font-size:9.5px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .55) !important; }
/* the reading: the chain is the instrument; the inputs a ledger under it; Fabricate the Lamp Key */
${T} .sx-fab { padding-right:0 !important; max-width:780px; }
${T} .sx-fab > * + * { margin-top:10px !important; }
${T} .sx-fab-head__cat, ${T} .sx-fab-col-k { ${LABEL} font-size:10.5px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .6) !important; }
${T} .sx-fab-head__name { margin-top:6px !important; }
${T} .sx-fab-head__name .sf-entity-link { text-decoration:none !important; background-image:none !important; border-bottom:0 !important; color:inherit !important; }
${T} .sx-fab-head__name .sf-entity-link:is(:hover, :focus-visible) { text-decoration:underline 1px rgb(${BONE} / .45) !important; text-underline-offset:6px; outline:none !important; }
${T} .sx-fab-head__desc { font-size:13px !important; color:rgb(${BONE} / .78) !important; max-width:60ch; }
${T} .orr-ind-chain { height:clamp(150px, 22vh, 190px); margin:16px 0 4px !important; }
${T} .sx-fab-heroes { display:none !important; }
${T} .sx-fab-col-k { margin-top:12px !important; }
${T} .sx-fab-inputs { ${PLAIN} max-width:560px !important; margin-top:6px !important; }
${T} .sx-fab-in { ${PLAIN} display:grid !important; grid-template-columns:minmax(0, 1fr) auto auto; column-gap:18px; align-items:baseline; padding:5px 0 !important; min-height:0 !important; }
${T} .sx-fab-in__name, ${T} .sx-fab-in__name.k-bad { font-size:13px !important; color:rgb(248 244 234) !important; }
${T} .sx-fab-in.is-missing .sx-fab-in__name { color:rgb(${BONE} / .78) !important; }
${T} .sx-fab-in__name .sf-entity-link { text-decoration:none !important; background-image:none !important; border-bottom:0 !important; color:inherit !important; }
${T} .sx-fab-in__name .sf-entity-link:is(:hover, :focus-visible) { color:var(--dp-hand, #f2b950) !important; outline:none !important; }
${T} .sx-fab-in__q, ${T} .sx-fab-in__q.k-bad { font-size:13px !important; color:rgb(248 244 234) !important; font-variant-numeric:tabular-nums; }
${T} .sx-fab-in.is-missing .sx-fab-in__q { color:rgb(${BONE} / .8) !important; }
${T} .sx-fab-in__q .k-62 { color:rgb(${BONE} / .55) !important; }
${T} .sx-fab-in__q { display:none !important; }
${T} .sx-fab-in { grid-template-columns:minmax(0, 1fr) auto; }
${word('.sx-fab-in__source')}
${T} .sx-fab-notes { ${PLAIN} gap:4px 18px !important; margin-top:8px !important; }
${T} .sx-fab-note, ${T} .sx-fab-note.k-bad { ${LABEL} font-size:9.5px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .55) !important; }
${T} .sx-fab-status, ${T} .sx-fab-status:is(.k-good, .k-signal, .k-bad) { font-size:12.5px !important; color:rgb(${BONE} / .72) !important; }
${T} .sx-fab-foot { ${PLAIN} margin-top:16px !important; }
${T} .sx-fab-build.orr-lampkey { padding:0 26px 0 20px !important; min-height:44px !important; font-size:15px !important; letter-spacing:.14em !important; color:#1c1406 !important;
  background:none !important; background-image:none !important; text-shadow:none !important; border:0 !important; box-shadow:none !important; border-radius:0 !important; }
${T} .sx-fab-build.orr-lampkey:is(:hover, :focus-visible, :active) { color:#1c1406 !important; background-image:none !important; text-shadow:none !important; }
${T} .sx-fab-build.orr-lampkey:disabled { color:rgb(${BONE} / .55) !important; }
@media (max-height:800px) {
  ${T} .sx-fab > * + * { margin-top:6px !important; }
  ${T} .sx-fab-head__name { font-size:26px !important; }
  ${T} .orr-ind-chain { height:clamp(120px, 20vh, 150px); margin:8px 0 0 !important; }
  ${T} .sx-fab-in { padding:3px 0 !important; }
  ${T} .sx-fab-build.orr-lampkey { min-height:38px !important; font-size:13.5px !important; }
  ${T} .sx-ind-process__items .sx-ind-row { padding-top:4px !important; padding-bottom:4px !important; }
  ${T} .sx-ind-process + .sx-ind-process { margin-top:10px !important; }
}

/* ================================ BAR ======================================================= */
/* who is here, on the ladder */
${T} .sx-bar__rail > .k-caps, ${T} .sx-bar__leads > .k-caps { ${LABEL} font-size:10.5px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .72) !important; padding-left:26px !important; }
${rail('.sx-bar__rows', '.sx-bar__rows .sx-bar-row', '.is-active, [aria-selected="true"], [aria-current="true"]')}
${T} .sx-bar__rows { border:0 !important; box-shadow:none !important; clip-path:none !important; }
${T} .sx-bar__rows > li { display:block !important; }
${T} .sx-bar__rows .sx-bar-row { ${PLAIN} display:flex !important; flex-direction:column !important; align-items:flex-start !important; gap:2px !important; padding:7px 0 7px 26px !important;
  min-height:0 !important; height:auto !important; width:100% !important; text-align:left; font-family:var(--dp-face-body, "Instrument Sans") !important; font-size:13px !important;
  font-weight:560 !important; font-variation-settings:normal !important; letter-spacing:.02em !important; text-transform:none !important; color:rgb(${BONE} / .86) !important; }
${T} .sx-bar__rows .sx-bar-row::after { display:none !important; }
${T} .sx-bar__rows .sx-bar-row:is(.is-active, [aria-selected="true"]) { color:rgb(250 247 238) !important; }
${T} .sx-bar__rows .sx-bar-row:is(:hover, :focus-visible) { color:rgb(255 250 240) !important; outline:none !important; }
${T} .sx-bar-row__role { ${LABEL} font-size:9.5px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .55) !important; }
/* leads and intel: ledgers, and words that go */
${T} .sx-bar__leads > .k-caps { margin-top:18px !important; }
${T} .sx-lead__rows, ${T} .sx-intel__rows, ${T} .sx-bar__foot { ${PLAIN} }
${T} .sx-lead { ${PLAIN} display:grid !important; grid-template-columns:minmax(0, 1fr) auto; column-gap:12px; align-items:baseline; padding:6px 0 6px 26px !important; min-height:0 !important; }
${T} .sx-lead__body { display:flex !important; flex-direction:column; gap:1px; min-width:0; overflow:hidden; }
${T} .sx-lead__t { display:block !important; font-size:12.5px !important; line-height:1.3; color:rgb(248 244 234) !important; white-space:normal !important; overflow:visible !important;
  text-overflow:clip !important; max-width:none !important; }
${T} .sx-lead__t .sf-entity-link { text-decoration:none !important; background-image:none !important; border-bottom:0 !important; color:inherit !important; }
${T} .sx-lead__t .sf-entity-link:is(:hover, :focus-visible) { color:var(--dp-hand, #f2b950) !important; outline:none !important; }
${T} .sx-lead__s { ${LABEL} font-size:9.5px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .55) !important; }
${word('.sx-lead__go')}
${word('.sx-bar__log')}
${T} .sx-bar__foot { padding-left:26px !important; margin-top:6px !important; }
${T} .sx-intel { ${PLAIN} display:grid !important; grid-template-columns:76px minmax(0, 1fr); column-gap:12px; align-items:baseline; padding:5px 0 5px 26px !important; min-height:0 !important; }
${T} .sx-intel .k-row__name { ${LABEL} font-size:9.5px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .55) !important; }
${T} .sx-intel .k-row__sub { font-size:12px !important; color:rgb(${BONE} / .82) !important; }
${T} .sx-bar__leads .sx-muted { font-size:12.5px !important; color:rgb(${BONE} / .6) !important; padding-left:26px; }
/* the talk: the portrait is the cinema behind the words; the waveform breathes under the name */
${T} .sx-bar__stage { position:relative; overflow:hidden auto; }
${T} .sx-bar__stage .sx-talk { position:relative; display:block !important; padding-right:0 !important; min-height:100%; }
${T} .sx-bar__stage .sx-talk > * + * { margin-top:14px !important; }
${T} .sx-talk__head { display:block !important; }
${T} .sx-talk__id { position:relative; z-index:2; max-width:min(52%, 620px); }
${T} .sx-talk__id > * + * { margin-top:10px !important; }
${T} .sx-talk__role { ${LABEL} font-size:10.5px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .6) !important; }
${T} .sx-talk__name { font-size:clamp(34px, 4.6vh, 52px) !important; line-height:.95 !important; margin-top:6px !important; }
${T} .orr-bar-wave { width:210px; margin:12px 0 0 !important; }
${T} .sx-talk__memory { font-size:12.5px !important; color:rgb(${BONE} / .62) !important; max-width:44ch; }
${T} .sx-talk__avatar { position:absolute !important; z-index:1; right:-6% !important; top:-4% !important; width:min(58%, 760px) !important; height:auto !important; aspect-ratio:1; pointer-events:none; }
${T} .sx-talk__avatar :is(img, canvas, .sx-portrait) { width:100% !important; height:100% !important; object-fit:cover; border-radius:0 !important; border:0 !important;
  -webkit-mask-image:radial-gradient(ellipse 58% 60% at 52% 46%, #000 34%, transparent 72%); mask-image:radial-gradient(ellipse 58% 60% at 52% 46%, #000 34%, transparent 72%); }
${T} .sx-talk__reply { position:relative; z-index:2; font-size:17px !important; line-height:1.45 !important; max-width:46ch !important; color:rgb(248 244 234) !important; margin-top:22px !important;
  text-shadow:0 0 18px rgb(0 0 0 / .8); }
${T} .sx-talk__reply.is-idle { color:rgb(${BONE} / .72) !important; }
${T} .sx-talk__choices { position:relative; z-index:2; ${PLAIN} display:flex !important; flex-direction:column; align-items:flex-start; gap:6px; margin-top:22px !important; }
${T} .sx-talk__choices > li { display:block; }
${T} .sx-choice { ${PLAIN} ${LABEL} min-height:0 !important; min-width:0 !important; height:auto !important; padding:4px 0 !important; font-size:12px !important; letter-spacing:.16em !important;
  color:rgb(${BONE} / .86) !important; text-align:left; text-shadow:0 0 14px rgb(0 0 0 / .8); }
${T} .sx-choice::after { display:none !important; }
${T} .sx-choice::before { all:unset !important; content:"›  " !important; color:rgb(${BONE} / .55) !important; }
${T} .sx-choice:is(:hover, :focus-visible) { color:var(--dp-hand, #f2b950) !important; outline:none !important; }
${T} .sx-choice:is(:hover, :focus-visible)::before { color:var(--dp-hand, #f2b950) !important; }
${T} .sx-talk .sx-muted { font-size:12.5px !important; color:rgb(${BONE} / .6) !important; }
${T} .sx-bar-offer { ${PLAIN} position:relative; z-index:2; padding:0 !important; max-width:52%; }
${T} .sx-bar-offer__verb, ${T} .sx-bar-offer .k-word { ${PLAIN} ${LABEL} font-size:12px !important; letter-spacing:.16em !important; color:rgb(248 244 234) !important; padding:4px 0 !important; min-height:0 !important; }
${T} .sx-bar-offer__verb::before { all:unset !important; content:"›  " !important; color:rgb(${BONE} / .55) !important; }
${T} .sx-bar-offer__verb:is(:hover, :focus-visible) { color:var(--dp-hand, #f2b950) !important; outline:none !important; }
${T} .sx-bar-offer__stakes, ${T} .sx-bar-offer__state, ${T} .sx-bar-offer__warning, ${T} .sx-bar-offer__blocker { font-size:12.5px !important; color:rgb(${BONE} / .75) !important; }
${T} .sx-bar-offer__chips { ${PLAIN} }
@media (max-height:800px) {
  ${T} .sx-bar__stage .sx-talk > * + * { margin-top:8px !important; }
  ${T} .sx-talk__name { font-size:30px !important; }
  ${T} .sx-talk__reply { font-size:14.5px !important; margin-top:12px !important; }
  ${T} .sx-talk__choices { margin-top:12px !important; gap:2px; }
  ${T} .sx-talk__avatar { width:min(60%, 520px) !important; right:-8% !important; top:-6% !important; }
  ${T} .sx-bar__leads > .k-caps { margin-top:8px !important; }
  ${T} .sx-lead, ${T} .sx-intel { padding-top:3px !important; padding-bottom:3px !important; }
  ${T} .sx-lead__s { display:none !important; }
  ${T} .sx-bar__leads > .k-caps { margin-top:10px !important; }
  ${T} .sx-bar__rows .sx-bar-row { padding-top:4px !important; padding-bottom:4px !important; }
}

/* ================================ LEDGER ==================================================== */
${T} .sx-ledger { grid-template-columns:minmax(0, 560px) minmax(0, 1fr) !important; column-gap:clamp(28px, 4vw, 72px) !important; }
${T} .sx-ledger .st-sub-h { font-family:var(--dp-face-display, "Archivo") !important; font-stretch:125%; font-variation-settings:"wdth" 125, "wght" 800 !important; font-weight:800 !important;
  font-size:clamp(28px, 3.4vh, 40px) !important; letter-spacing:.005em !important; line-height:1 !important; color:rgb(248 244 234) !important; text-transform:none; text-shadow:none !important; }
${T} .sx-ledger .st-ledger-intro { font-size:13px !important; color:rgb(${BONE} / .7) !important; font-family:var(--dp-face-body, "Instrument Sans") !important; letter-spacing:0 !important;
  text-transform:none !important; font-weight:400 !important; margin-top:8px !important; }
${T} .sx-ledger .st-ledger-status { ${LABEL} font-size:10.5px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .55) !important; margin-top:14px !important; }
${T} .sx-ledger .st-ledger-empty:not([hidden]) { ${PLAIN} display:block !important; flex:none !important; align-self:flex-start !important; min-height:0 !important; height:auto !important; padding:0 !important;
  font-family:var(--dp-face-body, "Instrument Sans") !important; font-size:13px !important; font-weight:400 !important; letter-spacing:0 !important;
  text-transform:none !important; color:rgb(${BONE} / .66) !important; margin-top:10px !important; max-width:44ch; }
${rail('.st-ledger-list', '.st-ledger-list .st-ledger-entry', '[aria-selected="true"]')}
${T} .sx-ledger .st-ledger-list { margin-top:14px !important; grid-row:4; }
${T} .sx-ledger .st-ledger-empty { grid-row:4; align-self:start; }
${T} .sx-ledger .st-ledger-list[hidden] { display:none !important; }
${T} .sx-ledger .st-ledger-entry { ${PLAIN} display:block !important; padding:8px 0 8px 26px !important; min-height:0 !important; height:auto !important; }
${T} .sx-ledger .st-ledger-entry-body { grid-template-columns:auto minmax(0, 1fr) auto !important; column-gap:14px !important; }
${T} .sx-ledger .st-ledger-cycle { ${LABEL} font-family:var(--dp-face-label, "Archivo") !important; font-size:9.5px !important; letter-spacing:.12em !important; color:rgb(${BONE} / .55) !important; font-variant-numeric:tabular-nums; }
${T} .sx-ledger .st-ledger-type { ${PLAIN} ${LABEL} font-family:var(--dp-face-label, "Archivo") !important; font-size:9px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .6) !important; padding:0 !important; }
${T} .sx-ledger .st-ledger-type.k-signal { color:rgb(${BONE} / .8) !important; }
${T} .sx-ledger .st-ledger-line { font-size:13px !important; color:rgb(248 244 234) !important; }
${T} .sx-ledger .st-ledger-annotation { font-size:11.5px !important; color:rgb(${BONE} / .66) !important; }
${T} .sx-ledger .st-ledger-nav { ${PLAIN} gap:0 18px !important; margin-top:10px !important; padding-left:26px; }
${word('.st-ledger-nav [data-ledger-page]')}
${word('.st-ledger-evidence-btn')}
${T} .sx-ledger__read { ${PLAIN} padding-right:0 !important; position:relative; isolation:isolate; }
${T} .sx-ledger__read::before { content:""; position:absolute; z-index:-1; inset:-40px -60px; pointer-events:none;
  background:radial-gradient(closest-side, rgb(7 8 10 / .8), rgb(7 8 10 / .6) 60%, rgb(7 8 10 / 0)); }
${T} .sx-ledger__read-kicker { ${LABEL} font-size:10.5px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .6) !important; }
${T} .sx-ledger__read-hero { ${PLAIN} padding:0 !important; }
${T} .sx-ledger__read-num { font-family:var(--dp-face-numeral, "Archivo") !important; font-stretch:100% !important; font-variation-settings:"wdth" 100, "wght" 250 !important; font-weight:250 !important;
  font-size:clamp(56px, 8vh, 96px) !important; line-height:1 !important; letter-spacing:-.02em !important; color:rgb(248 244 234) !important; text-shadow:none !important; }
${T} .sx-ledger__read-unit { ${LABEL} font-size:10.5px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .62) !important; }
${T} .sx-ledger__read-title { font-size:clamp(22px, 2.6vh, 30px) !important; }
${T} .sx-ledger__read-line { font-size:15px !important; line-height:1.5; color:rgb(248 244 234) !important; max-width:52ch; }
${T} .sx-ledger__read-hand { font-size:13px !important; color:rgb(${BONE} / .72) !important; max-width:52ch; }
${T} .sx-ledger .st-ledger-detail { ${PLAIN} padding:0 !important; }


/* ================================ ROUND 2: FACTIONS ========================================= */
/* the figures stand under the rim names now; the ladder is the index and takes a bone cursor (the Hand is the arm) */
${T} .sx-fac__rows .sx-fac-row:is(.is-active, [aria-selected="true"])::before { background:rgb(248 244 234) !important; filter:none !important; }
${T} .sx-fac__rows:is(:focus-within, :hover) .sx-fac-row:is(.is-active, [aria-selected="true"])::before { background:rgb(255 250 240) !important; filter:drop-shadow(0 0 5px rgb(248 244 234 / .6)) !important; }
${T} .sx-fac-row__name > .k-62 { display:block; margin-bottom:1px; }
/* the standing figure: its tier as the label above the number; the two readings smaller; captions one line */
${T} .sx-fac-heroes { align-items:flex-start !important; gap:16px 44px !important; }
${T} .sx-fac-heroes .k-hero:first-child .k-hero__n { font-size:clamp(48px, 7vh, 80px) !important; }
${T} .sx-fac-heroes .k-hero__n .sx-fac-tier { ${LABEL} display:block; font-size:10.5px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .62) !important; margin-bottom:6px; }
${T} .sx-fac-heroes .k-hero__n.k-bad .sx-fac-tier { color:var(--dp-danger, #ff5038) !important; }
${T} .sx-fac-heroes .k-hero__w { font-family:var(--dp-face-body, "Instrument Sans") !important; font-stretch:100%; font-variation-settings:normal !important; font-weight:400 !important;
  font-size:12.5px !important; letter-spacing:0 !important; text-transform:none !important; max-width:30ch !important; color:rgb(${BONE} / .66) !important; }
${T} .sx-fac-heroes .k-hero__w::first-letter { text-transform:uppercase; }
/* the contract ledger says where you stand: a light rule above the first rung not yet reached */
${T} .sx-fac-contracts .sx-ladder__step.is-next { position:relative; margin-top:9px !important; }
${T} .sx-fac-contracts .sx-ladder__step.is-next::before { content:"" !important; display:block !important; position:absolute !important; left:0 !important; right:0 !important; top:-5px !important;
  width:auto !important; height:1px !important; margin:0 !important; background:linear-gradient(90deg, rgb(248 244 234 / .7), rgb(248 244 234 / 0)) !important; clip-path:none !important; }
${T} .sx-fac-contracts .sx-ladder__step.is-next::after { content:"you are here" !important; display:block !important; position:absolute !important; left:0; top:-13px; width:auto !important; height:auto !important;
  ${LABEL} font-size:7.5px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .55) !important; background:none !important; }
/* a short screen: the index folds into the ring (every crest is a button); the ring takes the width */
@media (max-height:800px) {
  ${T} .sx-fac { grid-template-columns:minmax(0, 1fr) !important; }
  ${T} .sx-fac__rail { display:none !important; }
  ${T} .sx-fac__stage { grid-template-columns:minmax(420px, 48%) minmax(0, 1fr) !important; column-gap:28px !important; }
  ${T} .orr-fac-orbit { height:clamp(330px, 56vh, 420px) !important; }
  ${T} .sx-fac-heroes { flex-wrap:nowrap !important; gap:10px 26px !important; }
  ${T} .sx-fac-heroes .k-hero:first-child .k-hero__n { font-size:44px !important; }
  ${T} .sx-fac-heroes .k-hero__n { font-size:30px !important; }
  ${T} .sx-fac-heroes .k-hero__w { font-size:11px !important; max-width:20ch !important; }
  ${T} .sx-fac-ident__name { font-size:24px !important; }
  ${T} .sx-fac-ident__flag { font-size:12px !important; }
  ${T} .sx-fac__detail { gap:10px !important; margin-top:10px !important; }
  ${T} .orr-standing { max-width:520px; }
  ${T} .sx-fac-contracts .sx-ladder__step { padding:2px 0 !important; }
  ${T} .sx-fac-contracts .sx-ladder__name { font-size:11.5px !important; }
}

/* ================================ ROUND 2: INDUSTRY ========================================= */
/* the reading is three bands: the words, the chain taking every free pixel, the needs and the key */
${T} .sx-fab { display:grid !important; grid-template-rows:auto auto auto minmax(140px, 1fr) auto auto auto auto auto; height:100%; align-content:stretch; }
${T} .sx-fab-head__cat { grid-row:1; }
${T} .sx-fab-head__name { grid-row:2; }
${T} .sx-fab-head__desc { grid-row:3; }
${T} .orr-ind-chain { grid-row:4; }
${T} .sx-fab-col-k { grid-row:5; }
${T} .sx-fab-inputs { grid-row:6; }
${T} .sx-fab-notes { grid-row:7; }
${T} .sx-fab-status { grid-row:8; }
${T} .sx-fab-foot { grid-row:9; }
${T} .sx-fab > .sx-muted { grid-row:6; }
${T} .sx-fab > * + * { margin-top:0 !important; }
${T} .sx-fab-head__name { margin-top:4px !important; }
${T} .sx-fab-head__desc { margin-top:8px !important; }
${T} .orr-ind-chain { height:auto !important; min-height:140px; margin:10px 0 6px !important; align-self:stretch; }
${T} .sx-fab-heroes { display:none !important; }
${T} .sx-fab-col-k { margin-top:4px !important; }
/* needs: one line per material -- the name, the count, the way to source it */
${T} .sx-fab-inputs { margin-top:2px !important; }
${T} .sx-fab-in { grid-template-columns:minmax(0, 1fr) auto auto !important; column-gap:16px !important; padding:3px 0 !important; }
${T} .sx-fab-in__q { display:inline-block !important; color:var(--dp-phos, #dfeeff) !important; font-size:12.5px !important; }
${T} .sx-fab-in.is-missing .sx-fab-in__q { color:rgb(${BONE} / .85) !important; }
${T} .sx-fab-in.is-missing .sx-fab-in__source { order:3; }
${T} .sx-fab-notes { margin-top:4px !important; }
${T} .sx-fab-status { margin-top:8px !important; }
${T} .sx-fab-foot { margin-top:12px !important; align-self:end; }
/* the ladder: the reason only on the chosen row; the tier alone on the rest */
${T} .sx-ind-row:not(.is-active, [aria-selected="true"]) .sx-ind-row__why { display:none !important; }
${T} .sx-ind-row__tier { font-size:9px !important; color:rgb(${BONE} / .45) !important; }
${T} .sx-ind-row:is(.is-active, [aria-selected="true"]) .sx-ind-row__tier { color:rgb(${BONE} / .6) !important; }
${T} .sx-ind-process__items .sx-ind-row { padding-top:5px !important; padding-bottom:5px !important; }
@media (max-height:800px) {
  ${T} .sx-fab { grid-template-rows:auto auto auto minmax(100px, 1fr) auto auto auto auto auto; }
  ${T} .orr-ind-chain { min-height:100px; margin:4px 0 2px !important; }
  ${T} .sx-fab-head__desc { display:none !important; }
  ${T} .sx-fab-notes { display:none !important; }
  ${T} .sx-fab-status { margin-top:4px !important; font-size:11.5px !important; }
  ${T} .sx-fab-foot { margin-top:6px !important; }
  ${T} .sx-ind-process__items .sx-ind-row { padding-top:3px !important; padding-bottom:3px !important; }
}

/* ================================ ROUND 2: BAR ============================================== */
/* the portrait is the full height of the bay, its face kept, only its edges dissolved; the words sit against it */
${T} .sx-talk__avatar { right:-3% !important; top:-2% !important; width:auto !important; height:104% !important; aspect-ratio:1 !important; max-height:none !important; }
${T} .sx-talk__avatar :is(img, canvas, .sx-portrait) { -webkit-mask-image:radial-gradient(ellipse 50% 50% at 52% 46%, #000 60%, transparent 84%) !important; mask-image:radial-gradient(ellipse 50% 50% at 52% 46%, #000 60%, transparent 84%) !important; }
@media (min-width:1500px) {
  ${T} .sx-bar__stage .sx-talk { padding-left:clamp(0px, calc(100% - 1100px), 300px) !important; }
}
/* the character's own words are the line; the stage direction steps back once spoken */
${T} .sx-talk__memory { font-size:17px !important; line-height:1.45 !important; color:rgb(248 244 234) !important; max-width:40ch !important; text-shadow:0 0 18px rgb(0 0 0 / .8); }
${T} .sx-talk__reply.is-idle { font-size:12.5px !important; color:rgb(${BONE} / .6) !important; margin-top:12px !important; }
${T} .sx-talk__reply.is-said { font-size:17px !important; }
/* the waveform spans the name; each bar carries its bloom */
${T} .orr-bar-wave { width:min(100%, 460px) !important; height:24px !important; gap:4px !important; }
${T} .orr-bar-wave .orr-wave__bar { width:2px; box-shadow:0 0 5px 1px rgb(236 230 216 / .3); }
/* what you can ask is its own short ladder: a rail, sentence case, a bone cursor on the first reply */
${T} .sx-talk__choices { padding-left:0 !important; gap:2px !important;
  background:linear-gradient(90deg, transparent 7px, rgb(${BONE} / .24) 7px, rgb(${BONE} / .24) 8px, transparent 8px) 0 0 / 100% 100% no-repeat,
    repeating-linear-gradient(180deg, rgb(${BONE} / .2) 0 1px, transparent 1px 8px) 4px 0 / 4px 100% no-repeat !important; }
${T} .sx-talk__choices > li { position:relative; }
${T} .sx-choice { ${PLAIN} font-family:var(--dp-face-body, "Instrument Sans") !important; font-stretch:100% !important; font-variation-settings:normal !important; font-weight:500 !important;
  font-size:15px !important; letter-spacing:0 !important; text-transform:none !important; color:rgb(${BONE} / .88) !important; padding:6px 0 6px 26px !important; min-height:0 !important; }
${T} .sx-choice::before { all:unset !important; content:"" !important; display:block !important; position:absolute !important; left:4px !important; top:50% !important; width:8px !important; height:1px !important;
  background:rgb(${BONE} / .38) !important; }
${T} .sx-talk__choices > li:first-child .sx-choice::before { left:2px !important; width:11px !important; height:14px !important; margin-top:-7px !important; ${HAND} background:rgb(248 244 234) !important; }
${T} .sx-choice:is(:hover, :focus-visible) { color:var(--dp-hand, #f2b950) !important; outline:none !important; }
${T} .sx-choice:is(:hover, :focus-visible)::before { background:var(--dp-hand, #f2b950) !important; }
${T} .sx-choice:focus-visible::before { left:2px !important; width:11px !important; height:14px !important; margin-top:-7px !important; ${HAND} }
/* a short screen: one row per contact, and each lead on one line with its pay */
@media (max-height:800px) {
  ${T} .sx-bar__rows .sx-bar-row { flex-direction:row !important; justify-content:flex-start !important; align-items:baseline !important; gap:10px !important; padding-top:4px !important; padding-bottom:4px !important; text-align:left !important; }
  ${T} .sx-lead__body { display:contents !important; }
  ${T} .sx-lead { grid-template-columns:minmax(0, 1fr) auto auto !important; column-gap:12px !important; }
  ${T} .sx-lead__s { display:block !important; font-family:var(--dp-face-numeral, "Archivo") !important; font-size:12px !important; letter-spacing:0 !important; text-transform:none !important;
    color:rgb(248 244 234) !important; font-variant-numeric:tabular-nums; }
  ${T} .sx-talk__avatar { height:100% !important; right:-6% !important; top:0 !important; }
  ${T} .sx-talk__memory { font-size:14px !important; }
  ${T} .sx-talk__reply.is-said { font-size:14px !important; }
  ${T} .sx-choice { font-size:13.5px !important; padding-top:4px !important; padding-bottom:4px !important; }
}

/* ================================ ROUND 3b / 2b ============================================= */
@media (max-height:800px) {
  /* a posted title wraps rather than ellipsising (the badge row above it counted as a line) */
  ${T} .sx-ct__rows .sx-ct-row .sx-ct-row__title { white-space:normal !important; overflow:visible !important; text-overflow:clip !important; -webkit-line-clamp:unset !important; max-height:none !important; display:block !important; }
}

/* ================================ ROUND 3: BAR ============================================== */
/* the mask sits on the face: a tight oval, solid through the head and shoulders, gone before the photo's own room shows */
${T} .sx-talk__avatar :is(img, canvas, .sx-portrait) { -webkit-mask-image:radial-gradient(ellipse 40% 54% at 61% 47%, #000 50%, transparent 86%) !important;
  mask-image:radial-gradient(ellipse 40% 54% at 61% 47%, #000 50%, transparent 86%) !important; }
/* the photo's own room (a lamp up and right of the face) fades on the wrapper, so the two masks nest instead of composing */
${T} .sx-talk__avatar { -webkit-mask-image:radial-gradient(circle at 73% 36%, transparent 7%, #000 17%) !important; mask-image:radial-gradient(circle at 73% 36%, transparent 7%, #000 17%) !important; }
/* the portrait comes in from the edge so the face meets the words; nothing pads the words away from it */
${T} .sx-talk__avatar { right:8% !important; }
@media (min-width:1500px) { ${T} .sx-bar__stage .sx-talk { padding-left:0 !important; } }
/* leads hang on the same rail as everything else on the tab: title, pay as a numeral, the verb */
${rail('.sx-lead__rows', '.sx-lead__rows .sx-lead', '.is-chosen-never')}
${T} .sx-lead { display:grid !important; grid-template-columns:minmax(0, 1fr) auto auto !important; column-gap:12px !important; align-items:baseline !important; padding:6px 0 6px 26px !important; }
${T} .sx-lead__body { display:contents !important; }
${T} .sx-lead__s { display:block !important; font-family:var(--dp-face-numeral, "Archivo") !important; font-stretch:100% !important; font-variation-settings:"wdth" 100, "wght" 500 !important; font-weight:500 !important;
  font-size:12.5px !important; letter-spacing:0 !important; text-transform:none !important; color:rgb(248 244 234) !important; font-variant-numeric:tabular-nums; text-align:right; }
/* the choices carry no rest cursor: the mark answers the pointer or the focus, in bone, so the contacts' Hand stays the one Hand */
${T} .sx-talk__choices > li:first-child .sx-choice::before { left:4px !important; width:8px !important; height:1px !important; margin-top:0 !important; clip-path:none !important; background:rgb(${BONE} / .38) !important; }
${T} .sx-choice:is(:hover, :focus-visible) { color:rgb(255 250 240) !important; text-shadow:0 0 14px rgb(0 0 0 / .8), 0 0 12px rgb(255 250 236 / .3) !important; }
${T} .sx-talk__choices > li .sx-choice:is(:hover, :focus-visible)::before { left:2px !important; width:11px !important; height:14px !important; margin-top:-7px !important; ${HAND} background:rgb(248 244 234) !important; }
${T} .sx-bar-offer__verb:is(:hover, :focus-visible) { color:rgb(255 250 240) !important; }
${T} .sx-lead__go:is(:hover, :focus-visible) { color:rgb(255 250 240) !important; }
/* the waveform is as wide as the name (bar.js sizes the host off the glyph run) */
${T} .orr-bar-wave { width:auto !important; max-width:100%; }
@media (max-height:800px) {
  /* a short screen: intel yields (the Missions tab holds the same facts); a lead's verb is its chevron */
  ${T} .sx-intel__head, ${T} .sx-intel__rows, ${T} .sx-intel__head + .sx-muted { display:none !important; }
  ${T} .sx-lead { column-gap:8px !important; }
  ${T} .sx-lead__go { font-size:0 !important; letter-spacing:0 !important; }
  ${T} .sx-lead__go::before { font-size:14px !important; }
}

/* ================================ ROUND 4: MISSIONS ========================================= */
/* the Hand is the orrery's arm (the amber beam to the berth); the ladder's chosen row carries a bone light cursor */
${T} .sx-ct__rows .sx-ct-row:is(.is-active, .is-selected, [aria-selected="true"])::before { background:rgb(248 244 234) !important; filter:none !important; }
${T} .sx-ct__rows:is(:focus-within, :hover) .sx-ct-row:is(.is-active, .is-selected, [aria-selected="true"])::before { background:rgb(255 250 240) !important; filter:none !important; }
${T} .sx-ct__rows .sx-ct-row:is(.is-active, .is-selected, [aria-selected="true"])::after { background:radial-gradient(circle, rgb(248 244 234 / .2), rgb(248 244 234 / 0) 66%) !important; }
${T} .sx-ct__rows:is(:focus-within, :hover) .sx-ct-row:is(.is-active, .is-selected, [aria-selected="true"])::after { background:radial-gradient(circle, rgb(255 250 240 / .28), rgb(255 250 240 / 0) 70%) !important; }
/* ticks, cursor and bloom sit on a row's first line, where its price is */
${T} .sx-ct__rows .sx-ct-row::before { top:17px !important; margin-top:0 !important; }
${T} .sx-ct__rows .sx-ct-row:is(.is-active, .is-selected, [aria-selected="true"])::before { top:17px !important; margin-top:-7px !important; }
${T} .sx-ct__rows .sx-ct-row:is(.is-active, .is-selected, [aria-selected="true"])::after { top:17px !important; margin-top:-14px !important; }
${T} .sx-ct__rows .sx-ct-row:focus-visible:not(.is-active, .is-selected, [aria-selected="true"])::before { width:16px !important; height:1.5px !important; box-shadow:0 0 6px rgb(248 244 234 / .6) !important; }
/* FEATURED: a word over the row under a rule of light; the price stays on the title's line */
${T} .sx-ct__rows .sx-ct-row:has(.sx-ct-row__badge) { padding-top:26px !important; }
${T} .sx-ct__rows .sx-ct-row .sx-ct-row__badge { position:absolute !important; left:26px !important; right:0 !important; top:6px !important; margin:0 !important; padding-top:4px !important;
  display:block !important; color:rgb(248 244 234) !important; background:linear-gradient(90deg, rgb(248 244 234 / .7), rgb(248 244 234 / .15)) 0 0 / 100% 1.5px no-repeat !important; }
${T} .sx-ct__rows .sx-ct-row:has(.sx-ct-row__badge)::before { top:34px !important; }
${T} .sx-ct__rows .sx-ct-row:has(.sx-ct-row__badge):is(.is-active, .is-selected, [aria-selected="true"])::before { top:34px !important; }
${T} .sx-ct__rows .sx-ct-row:has(.sx-ct-row__badge):is(.is-active, .is-selected, [aria-selected="true"])::after { top:34px !important; }
/* the dispatch's alternative hangs off its own minor tick: the verb and its terms on one line */
${T} .sx-ct__rows .sx-ct-row.sx-decision__opt--sub::before { content:"" !important; display:block !important; position:absolute !important; left:4px !important; top:9px !important;
  width:8px !important; height:1px !important; margin:0 !important; background:rgb(${BONE} / .38) !important; clip-path:none !important; transform:none !important; }
${T} .sx-ct__rows .sx-ct-row.sx-decision__opt--sub { padding:2px 0 8px 26px !important; margin-top:-2px; flex-wrap:nowrap !important; align-items:baseline !important; gap:0 6px !important; min-width:0; }
${T} .sx-ct__rows .sx-ct-row.sx-decision__opt--sub .k-row__name { flex:none; }
${T} .sx-ct__rows .sx-ct-row.sx-decision__opt--sub .k-row__sub { display:block !important; white-space:nowrap !important; overflow:hidden; text-overflow:ellipsis; min-width:0; }
${T} .sx-ct__rows .sx-ct-row.sx-decision__opt--sub .k-row__sub::before { content:"· "; color:rgb(${BONE} / .4); }
${T} .sx-ct__rows .sx-ct-row.sx-decision__opt--sub:focus-visible::before { width:16px !important; height:1.5px !important; box-shadow:0 0 6px rgb(248 244 234 / .6) !important; background:rgb(248 244 234) !important; }
/* the rail ends with its last row: each block carries its own length of scale, edge to edge */
${T} .sx-ct__hang { background:none !important; }
${T} .sx-ct__hang > * { background:linear-gradient(90deg, transparent 7px, rgb(${BONE} / .24) 7px, rgb(${BONE} / .24) 8px, transparent 8px) 0 0 / 100% 100% no-repeat, repeating-linear-gradient(180deg, rgb(${BONE} / .22) 0 1px, transparent 1px 8px) 4px 0 / 4px 100% no-repeat !important; }
${T} .sx-ct__hang > * + * { margin-top:0 !important; padding-top:12px !important; }
${T} .sx-ct__hang > .sx-ct__yours { margin-top:0 !important; padding-top:26px !important; }
${T} .sx-ct__board { flex:0 1 auto !important; }
${T} .sx-ct__board > .sx-ct__rows { background:none !important; }
/* the scales: readable end words on a longer rule */
${T} .orr-ct-scales { height:84px; margin:16px 0 6px !important; }
${T} .orr-ct-scales text.orr-ct-scale__end { font-size:11px; letter-spacing:.12em; fill:rgb(${BONE} / .62); }
${T} .orr-ct-scales text.orr-ct-scale__key { font-size:10.5px; }
${T} .orr-ct-scales path.orr-ct-scale__cursor.is-high { stroke:var(--dp-danger, #ff5038); }
${T} .orr-ct-scales .orr-bloom.orr-ct-scale__cursor.is-high { stroke:var(--dp-danger, #ff5038); opacity:.3; }
/* the terms keep their floor, so the key stands in one place from mission to mission */
${T} .sx-dossier__terms { min-height:186px; }
${T} .sx-dossier__terms > li { padding:5px 0 !important; }
${T} .sx-dossier__foot { margin-top:18px !important; }
${T} .sx-dossier__reward .k-hero__n { font-size:clamp(60px, 7.6vh, 84px) !important; }
${T} .orr-ct-scales { margin:12px 0 4px !important; }
${T} .sx-dossier__terms > li.sx-term--none .sx-term__v { color:rgb(${BONE} / .48) !important; }
/* the reading stands nearer its orrery, and the orrery larger, on a wide screen */
@media (min-width:1500px) {
  ${T} .sx-dossier { grid-template-columns:minmax(0, 560px) minmax(360px, 1fr) !important; column-gap:32px !important; }
  ${T} .sx-dossier > .orr-ct-route { height:clamp(380px, 52vh, 560px) !important; }
}
@media (max-height:800px) {
  ${T} .sx-ct__rows .sx-ct-row::before, ${T} .sx-ct__rows .sx-ct-row:is(.is-active, .is-selected, [aria-selected="true"])::before, ${T} .sx-ct__rows .sx-ct-row:is(.is-active, .is-selected, [aria-selected="true"])::after { top:13px !important; }
  ${T} .sx-ct__rows .sx-ct-row:has(.sx-ct-row__badge) { padding-top:22px !important; }
  ${T} .sx-ct__rows .sx-ct-row:has(.sx-ct-row__badge)::before, ${T} .sx-ct__rows .sx-ct-row:has(.sx-ct-row__badge):is(.is-active, .is-selected, [aria-selected="true"])::before, ${T} .sx-ct__rows .sx-ct-row:has(.sx-ct-row__badge):is(.is-active, .is-selected, [aria-selected="true"])::after { top:30px !important; }
  ${T} .sx-ct__rows .sx-ct-row .sx-ct-row__badge { top:4px !important; }
  ${T} .sx-ct__hang > * + * { padding-top:8px !important; }
  ${T} .sx-ct__hang > .sx-ct__yours { padding-top:14px !important; }
  ${T} .sx-ct-row.sx-decision__opt .k-row__sub { display:block !important; }
  ${T} .sx-dossier__terms { min-height:0; }
  ${T} .orr-ct-scales { height:70px; margin:10px 0 2px !important; }
}

/* ================================ ROUND 3: FACTIONS ========================================= */
/* the contract rungs hang off the standing scale; their ladder stays for the reader, folded from sight */
${T} .sx-fac-contracts .sx-ladder, ${T} .sx-fac-contracts > .k-caps { display:none !important; }
${T} .sx-fac-rung-next { font-size:12.5px !important; line-height:1.45; color:rgb(${BONE} / .8) !important; margin-top:4px !important; max-width:62ch; }
/* relations fold into a word; no rule under the last one */
${word('.sx-fac-network__toggle')}
${T} .sx-fac-network__toggle[aria-expanded="true"] { color:var(--dp-hand, #f2b950) !important; }
${T} .sx-fac-network__rows[hidden], ${T} .sx-fac-network__empty[hidden] { display:none !important; }
${T} .sx-fac-network__rows > li:last-child > .k-row { border-bottom:0 !important; }
${T} .sx-fac-network { margin-top:12px !important; }
/* the chosen power's crest stands beside its name */
${T} .sx-fac-overview { position:relative; padding-right:150px !important; }
${T} .sx-fac-crest { display:block !important; position:absolute; right:0; top:0; width:124px; height:124px; pointer-events:none; }
${T} .sx-fac-crest img { display:block; width:100%; height:100%; object-fit:contain; filter:drop-shadow(0 0 18px rgb(0 0 0 / .7)); }
${T} .sx-fac-row__nil { color:rgb(${BONE} / .35) !important; }
/* the powers rail on a wide screen: the figure flush after the name, no void between them */
@media (min-width:1500px) {
  ${T} .sx-fac { grid-template-columns:300px minmax(0, 1fr) !important; column-gap:32px !important; }
  ${T} .sx-fac__rows .sx-fac-row { grid-template-columns:max-content 52px !important; justify-content:start !important; column-gap:14px !important; }
}
@media (max-height:800px) {
  ${T} .sx-fac-heroes { margin-top:8px !important; gap:8px 24px !important; }
  ${T} .sx-fac__detail { margin-top:10px !important; }
  ${T} .sx-fac__detail > * + * { margin-top:8px !important; }
  ${T} .sx-fac-crest { width:84px; height:84px; }
  ${T} .sx-fac-overview { padding-right:96px !important; }
  ${T} .sx-fac-rung-next { font-size:12px !important; }
  /* a short screen: the descriptor and the two section words yield; the instruments say it */
  ${T} .sx-fac-ident__flag, ${T} .sx-fac-ladder > .k-caps, ${T} .sx-fac-intent > .k-caps { display:none !important; }
  ${T} .sx-fac-heroes .k-hero__n { font-size:40px !important; }
  ${T} .sx-fac-heroes { margin-top:4px !important; }
}

/* ================================ ROUND 3: INDUSTRY ========================================= */
/* the chain is the reading: the needs ledger under it says nothing the drawing does not, so it yields while the chain stands */
${T} .sx-fab:has(.orr-chain:not(.is-off)) .sx-fab-inputs, ${T} .sx-fab:has(.orr-chain:not(.is-off)) .sx-fab-col-k { display:none !important; }
${T} .sx-ind-row__tier { font-size:10px !important; color:rgb(${BONE} / .6) !important; }
${T} .sx-ind-row__qty { color:rgb(${BONE} / .45); font-variant-numeric:tabular-nums; margin-left:6px; font-weight:500; }
/* a disabled Lamp Key keeps its void (a kit rule on fh-key had hidden the pseudo, leaving a slab) */
${T} .orr-lampkey:disabled::after { display:block !important; }
@media (min-width:1500px) {
  /* on a wide screen the chain takes the stage: a ring you can read the verb in, the beams with room to run */
  ${T} .sx-fab { max-width:none !important; }
  ${T} .orr-ind-chain { height:clamp(220px, 36vh, 360px) !important; }
}

/* ================================ ROUND 2: LEDGER =========================================== */
/* the tape stands above the reading in the right column; the reading hangs beneath the Hand's tick */
${T} .sx-ledger { grid-template-rows:auto auto auto minmax(0, 1fr) auto !important; }
/* the panel's rows flow as a block (the split grid gave the list a squeezed track); the right column stands beside it */
${T} .sx-ledger { position:relative !important; display:block !important; }
${T} .sx-ledger > .st-ledger { display:block !important; max-width:min(560px, 46%); }
${T} .sx-ledger .st-ledger-list { max-height:min(46vh, 520px) !important; }
${T} .sx-ledger .st-ledger-nav { margin-top:10px !important; }
${T} .sx-ledger > .sx-ledger__right { position:absolute; left:calc(min(560px, 46%) + clamp(28px, 4vw, 72px)); right:0; top:0; bottom:0; display:flex; flex-direction:column; gap:14px; min-width:0; overflow:hidden; }
${T} .sx-ledger__right > .orr-ledger-tape { flex:none; width:100%; height:clamp(150px, 22vh, 210px); margin-top:8px; }
${T} .sx-ledger__right > .sx-ledger__read { position:static !important; padding-right:0 !important; margin:0 !important; }
/* the empty state is one line, and the tape waits with it */
${T} .sx-ledger:has(.st-ledger-empty:not([hidden])) { grid-template-rows:auto auto auto auto auto !important; }
${T} .sx-ledger:has(.st-ledger-empty:not([hidden])) .st-ledger-status { display:none !important; }
${T} .sx-ledger .st-ledger-empty:not([hidden]) { margin-top:14px !important; font-size:13px !important; color:rgb(${BONE} / .7) !important; }
/* the reading: the thing the entry is about is the second-brightest word after the figure */
${T} .sx-ledger__read-title { display:block !important; font-family:var(--dp-face-body, "Instrument Sans") !important; font-stretch:100% !important; font-variation-settings:normal !important;
  font-weight:500 !important; font-size:20px !important; letter-spacing:0 !important; text-transform:none !important; color:rgb(248 244 234) !important; margin-top:8px !important; }
${T} .sx-ledger__read-title[hidden] { display:none !important; }
${T} .sx-ledger__read-line { font-size:14px !important; color:rgb(${BONE} / .8) !important; margin-top:8px !important; }
${T} .sx-ledger__read-line[hidden] { display:none !important; }
${T} .sx-ledger__read-num { font-size:clamp(64px, 8.6vh, 96px) !important; }
/* the entries: the cycle and the type on one line, the sentence full width beneath — no third column, no widows */
${T} .sx-ledger .st-ledger-entry-body { grid-template-columns:auto auto minmax(0, 1fr) !important; grid-template-areas:"time type ." "line line line" "note note note" !important; column-gap:12px !important; row-gap:2px !important; }
${T} .sx-ledger .st-ledger-type { text-align:left !important; }
${T} .sx-ledger .st-ledger-cycle, ${T} .sx-ledger .st-ledger-type { font-size:10.5px !important; }
${T} .sx-ledger .st-ledger-line { font-size:13.5px !important; line-height:1.4; }
${T} .sx-ledger .st-ledger-status { font-size:10.5px !important; }
/* a short list never squeezes its rows: they keep their two lines and the list scrolls */
${T} .sx-ledger .st-ledger-list > li, ${T} .sx-ledger .st-ledger-entry { flex:none !important; min-height:0 !important; }
${T} .sx-ledger .st-ledger-list { overflow:hidden auto !important; min-height:0 !important; }
@media (max-height:800px) {
  ${T} .sx-ledger__right > .orr-ledger-tape { height:clamp(120px, 24vh, 150px); margin-top:0; }
  ${T} .sx-ledger > .sx-ledger__right { gap:8px; }
  ${T} .sx-ledger__read-num { font-size:64px !important; }
  ${T} .sx-ledger__read-title { font-size:17px !important; margin-top:4px !important; }
}

/* ================================ ROUND 4: INDUSTRY ========================================= */
/* the one verb stands under the product it makes (the chain places it); the fab is its frame */
${T} .sx-fab { position:relative !important; padding-top:0 !important; }
${T} .sx-fab-foot { position:absolute !important; left:var(--fab-foot-x, 0) !important; top:var(--fab-foot-y, auto) !important; margin:0 !important; z-index:2; }
${T} .sx-fab-status { margin-top:8px !important; }
/* a per-run yield is a reading: it clears the gate */
${T} .sx-ind-row__qty { color:rgb(${BONE} / .54) !important; }
/* the ladder's band word and the stage's eyebrow share a size and a line */
${T} .sx-ind-process__head, ${T} .sx-fab-head__cat { font-size:10.5px !important; line-height:1.2 !important; }
${T} .sx-fab-head__cat { margin-top:0 !important; }
@media (max-height:800px) {
  ${T} .sx-fab-foot { left:auto !important; right:0 !important; top:auto !important; bottom:0 !important; }
}

/* the Ladder's light cursor on every scrolling rail */
${SCROLL_EXTENT_CSS}
${T} :is(.sx-ct__board, .sx-ind__list, .sx-fac__rows)[data-overflow="0"] { -webkit-mask-image:none !important; mask-image:none !important; }

/* ================================ ROUND 5: MISSIONS ========================================= */
/* the ladder's ticks read at 1x: row ticks 8px at 40%, the rail's minor ticks 5px at 30%; a block gap you can see */
${T} .sx-ct__hang > * { background:linear-gradient(90deg, transparent 7px, rgb(${BONE} / .24) 7px, rgb(${BONE} / .24) 8px, transparent 8px) 0 0 / 100% 100% no-repeat, linear-gradient(90deg, transparent 5px, rgb(${BONE} / .07) 5px, rgb(${BONE} / .07) 10px, transparent 10px) 0 0 / 100% 100% no-repeat, repeating-linear-gradient(180deg, rgb(${BONE} / .3) 0 1px, transparent 1px 8px) 4px 0 / 5px 100% no-repeat !important; }
${T} .sx-ct__rows .sx-ct-row::before { width:8px !important; background:rgb(${BONE} / .42) !important; }
${T} .sx-ct__hang > * + * { padding-top:22px !important; }
${T} .sx-ct__hang > .sx-ct__yours { padding-top:30px !important; }
/* FEATURED: a major tick and a word beside it, at the standard pitch; no rule */
${T} .sx-ct__rows .sx-ct-row .sx-ct-row__badge { background:none !important; padding-top:0 !important; top:8px !important; font-size:11px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .62) !important; }
${T} .sx-ct__rows .sx-ct-row:has(.sx-ct-row__badge) { padding-top:24px !important; }
${T} .sx-ct__rows .sx-ct-row:has(.sx-ct-row__badge)::after { content:"" !important; display:block !important; position:absolute !important; left:2px !important; top:14px !important; width:11px !important; height:1.5px !important;
  margin:0 !important; border-radius:0 !important; background:rgb(248 244 234 / .8) !important; }
${T} .sx-ct__rows .sx-ct-row:has(.sx-ct-row__badge):is(.is-active, .is-selected, [aria-selected="true"])::after { top:14px !important; margin:0 !important; width:11px !important; height:1.5px !important; border-radius:0 !important; background:rgb(248 244 234 / .8) !important; }
/* DISPATCH is a verb on its own rung: a chevron word in the light, the terms after it */
${T} .sx-ct__rows .sx-ct-row.sx-decision__opt--sub .k-row__name { color:rgb(248 244 234) !important; font-size:10.5px !important; }
${T} .sx-ct__rows .sx-ct-row.sx-decision__opt--sub .k-row__name::before { content:"› "; color:rgb(${BONE} / .5); }
${T} .sx-ct__rows .sx-ct-row.sx-decision__opt--sub:is(:hover, :focus-visible) .k-row__name { color:rgb(255 250 240) !important; }
/* the terms are rungs on one ladder with the two scales: a rail down the label column, a tick per term */
${T} .sx-dossier__terms { position:relative; padding-left:16px !important; background:linear-gradient(90deg, transparent 3px, rgb(${BONE} / .24) 3px, rgb(${BONE} / .24) 4px, transparent 4px) 0 0 / 100% 100% no-repeat; }
${T} .sx-dossier__terms > li { position:relative; }
${T} .sx-dossier__terms > li::before { content:""; position:absolute; left:-16px; top:.55em; width:9px; height:1px; background:rgb(${BONE} / .42); }
${T} .sx-dossier__terms > li.sx-term--threat > .k-62::before { left:-16px; top:.55em; }
${T} .orr-ct-scales { position:relative; padding-left:16px !important; box-sizing:border-box; background:linear-gradient(90deg, transparent 3px, rgb(${BONE} / .24) 3px, rgb(${BONE} / .24) 4px, transparent 4px) 0 0 / 100% 100% no-repeat; }
${T} .orr-ct-scales::before, ${T} .orr-ct-scales::after { content:""; position:absolute; left:0; width:9px; height:1px; background:rgb(${BONE} / .42); }
${T} .orr-ct-scales::before { top:20px; }
${T} .orr-ct-scales::after { top:62px; }
/* the title is one line under the numeral; the ladder column gives its titles room */
@media (min-width:1500px) {
  ${T} .sx-dossier__title { font-size:28px !important; line-height:1.15 !important; }
  /* one flat ink on the one-line title: the kit's title gradient read as a fade across the words */
  ${T} .sx-dossier__title, ${T} .sx-dossier__title .sf-entity-link { color:rgb(248 244 234) !important; background:none !important; -webkit-background-clip:border-box !important; background-clip:border-box !important; -webkit-text-fill-color:currentColor !important; text-shadow:0 0 18px rgb(0 0 0 / .6) !important; }
  ${T} .sx-ct { grid-template-columns:minmax(0, 470px) minmax(0, 1fr) !important; }
  ${T} .sx-dossier > .orr-ct-route { height:clamp(420px, 62vh, 680px) !important; }
}
/* glass under the orrery: a dissolved disc that keeps the lit truss from reading as part of the rings */
${T} .sx-dossier > .orr-ct-route::before { content:""; position:absolute; inset:-4% -4% 6% -4%; border-radius:50%; pointer-events:none; z-index:0;
  background:radial-gradient(circle, rgb(7 8 10 / .62), rgb(7 8 10 / .48) 58%, rgb(7 8 10 / 0) 72%); }
@media (max-height:800px) {
  /* the board fits its rows at 720: no fold through a line; the tracked job yields first */
  ${T} .sx-ct__rows .sx-ct-row { padding-top:4px !important; padding-bottom:4px !important; }
  ${T} .sx-ct__board { -webkit-mask-image:none !important; mask-image:none !important; padding-bottom:0 !important; }
  ${T} .sx-ct__active { flex:0 1 auto; min-height:0; overflow:hidden; }
  ${T} .sx-ct__hang > * + * { padding-top:10px !important; }
  ${T} .sx-ct__hang > .sx-ct__yours { padding-top:16px !important; }
  ${T} .sx-ct__rows .sx-ct-row:has(.sx-ct-row__badge) { padding-top:20px !important; }
  ${T} .sx-ct__rows .sx-ct-row:has(.sx-ct-row__badge)::after, ${T} .sx-ct__rows .sx-ct-row:has(.sx-ct-row__badge):is(.is-active, .is-selected, [aria-selected="true"])::after { top:11px !important; }
  ${T} .sx-ct__rows .sx-ct-row .sx-ct-row__badge { top:5px !important; }
  /* the orrery has the room for its names at 720 */
  ${T} .sx-dossier > .orr-ct-route { height:clamp(280px, 42vh, 320px) !important; }
  ${T} .orr-ct-scales::after { top:52px; }
}

/* ================================ ROUND 4: FACTIONS ========================================= */
/* the chosen power is the hero: its crest large beside its name, the authority's sun dimmed to a pivot behind the arm */
${T} .sx-fac-overview { padding-left:0 !important; padding-right:200px !important; }
${T} .sx-fac-overview > .k-caps, ${T} .sx-fac-ident__name, ${T} .sx-fac-ident__flag { margin-left:0 !important; padding-left:0 !important; }
${T} .sx-fac-crest { left:auto; right:0; top:-10px; width:170px; height:170px; }
${T} .sx-fac-crest img { filter:grayscale(1) drop-shadow(0 0 18px rgb(0 0 0 / .7)); }
${T} .sx-fac-crest.is-authority { display:none !important; }
${T} .sx-fac-overview:has(.sx-fac-crest.is-authority) { padding-right:0 !important; }
/* the hero cluster on one baseline; the rail's figures on one axis, nothing for zero */
${T} .sx-fac-heroes { align-items:last baseline !important; }
${T} .sx-fac__rows .sx-fac-row { grid-template-columns:minmax(0, 1fr) 52px !important; justify-content:stretch !important; }
${T} .sx-fac-row__tier { justify-self:end; }
${T} .orr-standing text.orr-standing__name { font-size:11px !important; letter-spacing:.12em; }
${T} .orr-standing text.orr-standing__rung { font-size:10.5px !important; }
${T} .sx-fac-rung-next { max-width:64ch; }
@media (min-width:1500px) {
  ${T} .sx-fac-overview { padding-right:0 !important; }
  ${T} .sx-fac-crest { left:440px; right:auto; }
}
@media (max-height:800px) {
  /* the orbit is the selector at 720: the rim names yield to the crests, and speak only for the chosen or hovered one */
  ${T} .orr-fac-orbit .orr-crest__words { display:none !important; }
  ${T} .orr-fac-orbit .orr-crest:is(.is-chosen, :hover, :focus-visible) .orr-crest__words { display:flex !important; }
  ${T} .sx-fac-rung-next__more, ${T} .sx-fac-intent { display:none !important; }
  ${T} .sx-fac-crest { width:110px; height:110px; top:-6px; }
  ${T} .sx-fac-overview { padding-right:130px !important; }
}

/* ================================ ROUND 5: FACTIONS ========================================= */
/* one figure, at the size of a reading: the standing; its tier above it; nothing captions it */
${T} .sx-fac-heroes { display:block !important; }
${T} .sx-fac-heroes .k-hero:first-child .k-hero__n { font-size:clamp(72px, 10vh, 112px) !important; line-height:.92 !important; }
${T} .sx-fac-heroes .k-hero__w { display:none !important; }
/* one left edge: the name, kicker and descriptor stand on the reading's axis */
${T} .sx-fac-overview > .k-caps, ${T} .sx-fac-ident__name, ${T} .sx-fac-ident__flag, ${T} .sx-fac-ident__name .sf-entity-link { margin-inline:0 !important; padding-inline:0 !important; text-indent:0 !important; transform:none !important; translate:none !important; left:auto !important; }
/* the hero crest sits on the reading's right axis at every width */
@media (min-width:1500px) {
  ${T} .sx-fac-overview { padding-right:200px !important; }
  ${T} .sx-fac-overview:has(.sx-fac-crest.is-authority) { padding-right:0 !important; }
  ${T} .sx-fac-crest { left:auto !important; right:0 !important; }
}
/* the scale is as wide as the reading (measured live); no cap */
${T} .orr-standing { max-width:none !important; }
${T} .orr-crest__name, ${T} .orr-crest__rep { white-space:nowrap !important; hyphens:none !important; word-break:keep-all !important; }
@media (max-height:800px) {
  ${T} .sx-fac-heroes .k-hero:first-child .k-hero__n { font-size:64px !important; }
  /* the figures stay under the crests at 720 (the names yield); the arc reads against its zero tick */
  ${T} .orr-fac-orbit .orr-crest__words { display:flex !important; }
  ${T} .orr-fac-orbit .orr-crest .orr-crest__name { display:none !important; }
  ${T} .orr-fac-orbit .orr-crest:is(.is-chosen, :hover, :focus-visible) .orr-crest__name { display:block !important; }
  ${T} .orr-standing text.orr-standing__name { font-size:10px !important; letter-spacing:.1em !important; }
  ${T} .sx-fac__detail { gap:6px !important; margin-top:6px !important; }
  ${T} .sx-fac-rung-next { margin-top:2px !important; }
  ${T} .sx-fac-network { margin-top:6px !important; }
  ${T} .sx-fac-overview > * + * { margin-top:4px !important; }
}

/* ================================ ROUND 4: BAR ============================================== */
/* the world dims and softens under the portrait, so the face is the brightest thing on the right and the hull a shape behind the shoulder */
${T} .sx-talk__avatar { -webkit-mask-image:none !important; mask-image:none !important; }
${T} .sx-talk__avatar::before { content:""; position:absolute; inset:-6%; z-index:0; pointer-events:none;
  background:radial-gradient(ellipse 50% 66% at 61% 47%, rgb(6 8 11 / .82), rgb(6 8 11 / .66) 44%, rgb(6 8 11 / .3) 66%, rgb(6 8 11 / 0) 82%);
  -webkit-backdrop-filter:blur(6px) brightness(.55) saturate(.7); backdrop-filter:blur(6px) brightness(.55) saturate(.7);
  -webkit-mask-image:radial-gradient(ellipse 50% 66% at 61% 47%, #000 40%, transparent 82%); mask-image:radial-gradient(ellipse 50% 66% at 61% 47%, #000 40%, transparent 82%); }
${T} .sx-talk__avatar :is(img, canvas, .sx-portrait) { position:relative; z-index:1; opacity:1 !important;
  -webkit-mask-image:radial-gradient(ellipse 40% 54% at 61% 47%, #000 44%, transparent 90%) !important; mask-image:radial-gradient(ellipse 40% 54% at 61% 47%, #000 44%, transparent 90%) !important; }
/* the photo's own lamp (up and right of the face) goes under a shadow instead of a hole, so nothing shows through the hair */
${T} .sx-talk__avatar::after { content:""; position:absolute; z-index:2; left:56%; top:19%; width:34%; height:34%; pointer-events:none; border-radius:50%;
  background:radial-gradient(circle, rgb(6 8 11 / .96) 0 30%, rgb(6 8 11 / .7) 48%, rgb(6 8 11 / 0) 70%); }
/* the words sit on the eyeline on a tall screen: the column drops so name and face share one axis */
@media (min-width:1500px) and (min-height:900px) {
  ${T} .sx-talk__id { padding-top:clamp(0px, calc((100vh - 900px) * .85), 150px) !important; }
}
/* the leads ladder has the width of its titles at 1920; a title never wraps (INSPECT holds the full one) */
@media (min-width:1500px) { ${T} .sx-bar { grid-template-columns:560px minmax(0, 1fr) !important; } }
${T} .sx-lead__t { display:block !important; white-space:nowrap !important; overflow:hidden !important; text-overflow:ellipsis !important; min-width:0 !important; }
${T} .sx-lead__t .sf-entity-link { white-space:nowrap !important; }
/* the replies are focus plates: dissolved glass, a numeral key at the left, the cursor answering pointer or focus */
${T} .sx-talk__choices { background:none !important; counter-reset:sx-reply; gap:4px !important; }
${T} .sx-talk__choices > li { counter-increment:sx-reply; }
${T} .sx-choice { display:block !important; width:min(100%, 52ch) !important; text-align:left !important; padding:9px 22px 9px 44px !important; color:rgb(${BONE} / .9) !important;
  background:linear-gradient(90deg, rgb(6 8 11 / .58), rgb(6 8 11 / .42) 55%, rgb(6 8 11 / 0)) !important; }
${T} .sx-choice::after { content:counter(sx-reply) !important; display:block !important; position:absolute !important; left:12px !important; top:50% !important; bottom:auto !important; transform:translateY(-50%) !important;
  width:12px !important; height:auto !important; text-align:center !important; ${LABEL} font-size:10.5px !important; letter-spacing:0 !important; color:rgb(${BONE} / .55) !important; background:none !important; box-shadow:none !important; }
${T} .sx-choice::before { left:30px !important; }
${T} .sx-talk__choices > li:first-child .sx-choice::before { left:30px !important; }
${T} .sx-choice:is(:hover, :focus-visible) { background:linear-gradient(90deg, rgb(12 15 20 / .78), rgb(12 15 20 / .55) 55%, rgb(12 15 20 / 0)) !important; }
${T} .sx-choice:is(:hover, :focus-visible)::after { color:rgb(248 244 234) !important; }
${T} .sx-talk__choices > li .sx-choice:is(:hover, :focus-visible)::before { left:28px !important; }
/* the folded facts: the board's count rides the verb */
${T} .sx-bar__intel { display:none !important; }
${T} .sx-bar__log-n { font-family:var(--dp-face-numeral, "Archivo") !important; font-size:11px !important; letter-spacing:.04em !important; color:rgb(${BONE} / .72) !important; font-variant-numeric:tabular-nums; }
/* the small caps clear the legibility gate */
${T} .sx-bar-row__role { font-size:10.5px !important; color:rgb(${BONE} / .68) !important; }
${T} .sx-talk__reply.is-idle { font-size:13px !important; color:rgb(${BONE} / .74) !important; }
${T} .orr-bar-wave { height:24px !important; }
@media (max-height:800px) {
  ${T} .sx-talk__avatar::after { left:56%; top:19%; }
  ${T} .sx-choice { padding:5px 18px 5px 40px !important; }
  ${T} .sx-choice::after { left:10px !important; }
  ${T} .sx-choice::before { left:27px !important; }
  ${T} .sx-talk__choices > li:first-child .sx-choice::before { left:27px !important; }
}

/* ================================ ROUND 3: LEDGER =========================================== */
/* the reading hangs off the Hand's leader: no gap between tape and reading, the leader's last inch is the reading's own stub, one left edge */
${T} .sx-ledger > .sx-ledger__right { gap:0 !important; }
${T} .sx-ledger__right > .orr-ledger-tape { margin-top:-4px !important; }
${T} .sx-ledger__right > .sx-ledger__read { position:relative !important; padding:14px 0 0 0 !important; }
${T} .sx-ledger__read::after { content:""; position:absolute; left:0; top:0; width:1px; height:14px; background:rgb(${BONE} / .6); pointer-events:none; }
${T} .sx-ledger__read::before { inset:-24px -60px -40px -40px; }
/* the unit sits on the numeral's baseline as a suffix; one label above says the direction */
${T} .sx-ledger__read-hero { display:flex !important; flex-direction:row !important; align-items:baseline !important; gap:10px !important; }
${T} .sx-ledger__read-unit { font-size:12px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .66) !important; }
/* the ladder's cursor is bone here: the tape's Hand is the one amber; the read entry is the bright one */
${T} .st-ledger-list .st-ledger-entry[aria-selected="true"]::before { background:rgb(248 244 234) !important; filter:none !important; }
${T} .st-ledger-list:is(:focus-within, :hover) .st-ledger-entry[aria-selected="true"]::before { background:rgb(255 250 240) !important; filter:drop-shadow(0 0 5px rgb(248 244 234 / .6)) !important; }
${T} .st-ledger-list .st-ledger-entry[aria-selected="true"]::after { display:none !important; }
${T} .sx-ledger .st-ledger-line { color:rgb(${BONE} / .74) !important; }
${T} .sx-ledger .st-ledger-entry[aria-selected="true"] .st-ledger-line { color:rgb(248 244 234) !important; }
${T} .sx-ledger .st-ledger-entry[aria-selected="true"] :is(.st-ledger-cycle, .st-ledger-type) { color:rgb(${BONE} / .85) !important; }
/* the keys at the ladder's foot */
${T} .sx-ledger__keys { ${LABEL} font-size:9.5px !important; letter-spacing:.16em !important; color:rgb(${BONE} / .5) !important; margin-top:8px !important; padding-left:26px; }
${T} .sx-ledger:has(.st-ledger-empty:not([hidden])) .sx-ledger__keys { display:none !important; }
/* the empty sentence stands where the count stands when the book is filled: right under the intro */
${T} .sx-ledger .st-ledger-empty:not([hidden]) { margin-top:14px !important; margin-bottom:0 !important; order:0; position:static !important; }
${T} .sx-ledger .st-ledger-list[hidden] ~ .st-ledger-empty:not([hidden]) { margin-top:14px !important; }
${T} .sx-ledger .st-ledger-nav[hidden], ${T} .sx-ledger .st-ledger-nav:not(:has([data-ledger-page]:not([disabled]))) { margin-top:0 !important; }
@media (max-height:800px) {
  ${T} .sx-ledger__right > .sx-ledger__read { padding-top:10px !important; }
  ${T} .sx-ledger__read::after { height:10px; }
  ${T} .sx-ledger__keys { display:none !important; }
}

/* ================================ ROUND 10b ================================================= */
/* the Industry key: an absolutely placed grid child takes its grid area as its containing block; the seat is the plate */
${T} .sx-fab-foot { grid-area:auto !important; }
/* the Factions overview was a two-column grid (crest | words): one column, one left edge */
${T} .sx-fac-overview { display:block !important; }
${T} .sx-fac-crest img { mix-blend-mode:screen; }
@media (min-width:1500px) {
  /* the scale and the rungs take the reading's full width under the crest */
  ${T} .sx-fac-overview > .sx-fac__detail { margin-right:-200px !important; }
  ${T} .sx-fac-overview:has(.sx-fac-crest.is-authority) > .sx-fac__detail { margin-right:0 !important; }
}
/* the Missions title is flat ink at every width */
${T} .sx-dossier__title, ${T} .sx-dossier__title .sf-entity-link { color:rgb(248 244 234) !important; background:none !important; -webkit-text-fill-color:currentColor !important; text-shadow:0 0 18px rgb(0 0 0 / .6) !important; }
/* the Bar's reply plates share one width; the leads column keeps its titles at 1280 */
${T} .sx-talk__choices { align-items:stretch !important; max-width:min(100%, 52ch); }
${T} .sx-talk__choices > li { display:block !important; width:100%; }
${T} .sx-choice { width:100% !important; }
@media (max-width:1499px) { ${T} .sx-bar { grid-template-columns:360px minmax(0, 1fr) !important; } }

/* the orrery's glass disc stays under the orrery: its own stacking context, the disc beneath its rings, never over the dossier's words */
${T} .sx-dossier > .orr-ct-route { z-index:0; isolation:isolate; }
/* the library disc is 118% wide and translated by half of itself: with the inset box that translate slid it 420px left over the title */
${T} .sx-dossier > .orr-ct-route::before { z-index:-1 !important; inset:-4% -4% 6% -4% !important; width:auto !important; height:auto !important; transform:none !important; }

/* the arm follows the bone cursors where the Hand lives elsewhere (Missions beam, Factions arm, Ledger tape) */
${T} :is(.sx-ct__rows .sx-ct-row, .sx-fac__rows .sx-fac-row, .st-ledger-list .st-ledger-entry):is(.is-active, .is-selected, [aria-selected="true"])::after { content:"" !important; display:block !important; left:7px !important; top:50% !important; width:26px !important; height:1.5px !important; margin:-.75px 0 0 !important; border-radius:0 !important; clip-path:none !important; opacity:1 !important; background:rgb(248 244 234) !important; filter:drop-shadow(0 0 4px rgb(248 244 234 / .5)) !important; }
${T} :is(.sx-ct__rows .sx-ct-row, .sx-fac__rows .sx-fac-row, .st-ledger-list .st-ledger-entry):is(.is-active, .is-selected, [aria-selected="true"])::before { left:31px !important; }
${T} :is(.sx-ct__rows, .sx-fac__rows, .st-ledger-list):is(:focus-within, :hover) :is(.sx-ct-row, .sx-fac-row, .st-ledger-entry):is(.is-active, .is-selected, [aria-selected="true"])::after { background:rgb(255 250 240) !important; }

/* ================================ ROUND 5: BAR ============================================== */
/* the face is whole: the solid region reaches past the temple, the world dims under the whole head */
${T} .sx-talk__avatar :is(img, canvas, .sx-portrait) { -webkit-mask-image:radial-gradient(ellipse 47% 58% at 56% 47%, #000 54%, transparent 90%) !important; mask-image:radial-gradient(ellipse 47% 58% at 56% 47%, #000 54%, transparent 90%) !important; }
${T} .sx-talk__avatar::before { inset:-10%; background:radial-gradient(ellipse 60% 76% at 56% 47%, rgb(6 8 11 / .92), rgb(6 8 11 / .82) 44%, rgb(6 8 11 / .5) 64%, rgb(6 8 11 / 0) 84%);
  -webkit-backdrop-filter:blur(8px) brightness(.38) saturate(.6); backdrop-filter:blur(8px) brightness(.38) saturate(.6);
  -webkit-mask-image:radial-gradient(ellipse 60% 76% at 56% 47%, #000 42%, transparent 84%); mask-image:radial-gradient(ellipse 60% 76% at 56% 47%, #000 42%, transparent 84%); }
${T} .sx-talk__avatar::after { left:54%; top:16%; width:40%; height:40%; }
/* the name in the numeral voice: thin, bright, expensive; the shell's one heavy word keeps its rank */
${T} .sx-talk__name { font-family:var(--dp-face-display, "Archivo") !important; font-stretch:100% !important; font-variation-settings:"wdth" 100, "wght" 250 !important; font-weight:250 !important;
  font-size:clamp(48px, 6.6vh, 70px) !important; letter-spacing:-.01em !important; line-height:.95 !important; }
/* the leads stand at the foot of the ladder column on a tall screen; the reply keys never share their band */
@media (min-height:801px) {
  ${T} .sx-bar__hang { display:flex !important; flex-direction:column !important; }
  ${T} .sx-bar__leads { margin-top:auto !important; padding-bottom:4px; }
}
/* a reply hangs off a short scale: a tick per reply, the current one a bone chevron at rest */
${T} .sx-choice::before { left:30px !important; width:1px !important; height:12px !important; margin-top:-6px !important; top:50% !important; background:rgb(${BONE} / .42) !important; clip-path:none !important; }
${T} .sx-talk__choices > li:first-child .sx-choice::before { left:30px !important; width:1px !important; height:12px !important; margin-top:-6px !important; clip-path:none !important; background:rgb(${BONE} / .42) !important; }
${T} .sx-talk__choices > li .sx-choice.is-current::before, ${T} .sx-talk__choices > li .sx-choice:is(:hover, :focus-visible)::before { left:26px !important; width:10px !important; height:13px !important; margin-top:-6.5px !important; ${HAND} background:rgb(248 244 234) !important; }
${T} .sx-choice.is-current { color:rgb(255 250 240) !important; }
${T} .sx-choice.is-current::after { color:rgb(248 244 234) !important; }
/* the verb never vanishes: INSPECT stays a word at 720 */
@media (max-height:800px) {
  ${T} .sx-lead__go { font-size:9.5px !important; letter-spacing:.14em !important; }
  ${T} .sx-lead__go::before { font-size:9.5px !important; }
}
/* glass under the words: the crate wall behind the ladder dissolves into tone */
${T} .sx-bar__hang { position:relative; isolation:isolate; }
${T} .sx-bar__hang::before { content:""; position:absolute; z-index:-1; left:-40px; right:-30px; top:-10px; bottom:-10px; pointer-events:none;
  background:radial-gradient(ellipse 70% 60% at 40% 45%, rgb(6 8 11 / .72), rgb(6 8 11 / .5) 55%, rgb(6 8 11 / 0) 85%); }
${T} .sx-talk__id { isolation:isolate; }
${T} .sx-talk__id::before { content:""; position:absolute; z-index:-1; left:-60px; right:-40px; top:-30px; bottom:-40px; pointer-events:none;
  background:radial-gradient(ellipse 70% 70% at 40% 50%, rgb(6 8 11 / .6), rgb(6 8 11 / .4) 55%, rgb(6 8 11 / 0) 85%); }

/* ================================ ROUND 4: LEDGER =========================================== */
/* the tape owns the middle band: the height its ticks need; the reading and the purse share the row beneath */
${T} .sx-ledger__right > .orr-ledger-tape { height:clamp(230px, 32vh, 360px) !important; }
${T} .sx-ledger__row { display:flex; align-items:flex-start; gap:40px; min-width:0; }
${T} .sx-ledger__row > .sx-ledger__read { flex:1 1 auto; min-width:0; }
${T} .orr-ledger-purse { flex:none; width:230px; height:210px; margin-left:auto; margin-top:10px; position:relative; isolation:isolate; }
${T} .orr-ledger-purse::before { content:""; position:absolute; z-index:-1; inset:-16px; border-radius:50%; pointer-events:none;
  background:radial-gradient(circle, rgb(6 8 11 / .8), rgb(6 8 11 / .6) 50%, rgb(6 8 11 / 0) 74%); }
/* the key hint is the ladder's foot at every size */
${T} .sx-ledger__keys { display:block !important; }
@media (max-height:800px) {
  ${T} .sx-ledger__right > .orr-ledger-tape { height:clamp(150px, 27vh, 195px) !important; }
  ${T} .orr-ledger-purse { width:180px; height:160px; margin-top:0; }
  ${T} .sx-ledger__row { gap:20px; }
  ${T} .sx-ledger__keys { display:block !important; margin-top:4px !important; }
  ${T} .sx-ledger .st-ledger-list { max-height:min(40vh, 300px) !important; }
}
/* the empty ladder keeps its rail with one empty rung where the first receipt will land */
${T} .sx-ledger .st-ledger-empty:not([hidden]) { position:relative !important; margin-top:36px !important; padding:8px 0 8px 26px !important;
  background:linear-gradient(90deg, transparent 7px, rgb(${BONE} / .24) 7px, rgb(${BONE} / .24) 8px, transparent 8px) 0 0 / 100% 100% no-repeat,
    repeating-linear-gradient(180deg, rgb(${BONE} / .3) 0 1px, transparent 1px 8px) 4px 0 / 4px 100% no-repeat !important; }
${T} .sx-ledger .st-ledger-empty:not([hidden])::before { content:""; position:absolute; left:4px; top:50%; width:8px; height:1px; background:rgb(${BONE} / .42); }

/* ================================ ROUND 6: MISSIONS ========================================= */
/* the open contract keeps a quiet mark: a 16px full-ink tick on the rail and its price in ink; no arrowhead */
${T} .sx-ct__rows .sx-ct-row:is(.is-active, .is-selected, [aria-selected="true"])::before { display:none !important; }
${T} .sx-ct__rows .sx-ct-row:is(.is-active, .is-selected, [aria-selected="true"])::after { left:4px !important; width:16px !important; height:1.5px !important; filter:none !important; }
${T} .sx-ct__rows .sx-ct-row:is(.is-active, .is-selected, [aria-selected="true"]) .sx-ct-row__rew { color:rgb(248 244 234) !important; }
${T} .sx-ct__rows .sx-ct-row:not(.is-active, .is-selected, [aria-selected="true"]) .sx-ct-row__rew { color:rgb(${BONE} / .72) !important; }
/* focus is the light cursor: a 16px tick with its bloom, the name lifted to full ink and weight */
${T} .sx-ct__rows .sx-ct-row:focus-visible::before { display:block !important; left:4px !important; width:16px !important; height:1.5px !important; margin-top:-.75px !important; top:50% !important; clip-path:none !important;
  background:rgb(255 250 240) !important; box-shadow:0 0 7px 1px rgb(248 244 234 / .55) !important; }
${T} .sx-ct__rows .sx-ct-row:focus-visible::after { display:none !important; }
${T} .sx-ct__rows .sx-ct-row:focus-visible .sx-ct-row__title { color:rgb(255 255 255) !important; font-weight:700 !important; }
/* the rail's ticks read at 1x: row ticks 8px at 55%, major ticks 16px at 60%, the rail at 30% */
${T} .sx-ct__rows .sx-ct-row::before { width:8px !important; height:1.5px !important; background:rgb(${BONE} / .55) !important; }
${T} .sx-ct__rows .sx-ct-row:has(.sx-ct-row__badge)::after { width:16px !important; height:1.5px !important; background:rgb(248 244 234 / .6) !important; }
${T} .sx-ct__rows .sx-ct-row:has(.sx-ct-row__badge) { padding-top:38px !important; }
${T} .sx-ct__rows .sx-ct-row .sx-ct-row__badge { top:12px !important; }
${T} .sx-ct__rows .sx-ct-row:has(.sx-ct-row__badge)::after, ${T} .sx-ct__rows .sx-ct-row:has(.sx-ct-row__badge):is(.is-active, .is-selected, [aria-selected="true"])::after { top:19px !important; }
/* the slash sublabel retires; POSTED HERE says it */
${T} .sx-ct-dispatch__label { display:none !important; }
/* one rail from RISK to READINESS, ticks on one pitch; sublines inline in ink-dim; one value column */
${T} .orr-ct-scales { margin-bottom:0 !important; }
${T} .sx-dossier__terms { margin-top:0 !important; padding-top:2px !important; }
${T} .sx-dossier__terms > li { grid-template-columns:92px minmax(0, 1fr) !important; column-gap:12px !important; padding:9px 0 !important; }
${T} .sx-dossier__terms .sx-term__v { flex-direction:row !important; align-items:baseline !important; gap:10px !important; flex-wrap:wrap; }
${T} .sx-dossier__terms .sx-term__sub { font-size:11.5px !important; color:rgb(${BONE} / .6) !important; }
${T} .sx-dossier__terms > li::before { top:50% !important; margin-top:-.5px; }
/* the jump reading hangs under the ring's foot with its own room */
${T} .sx-dossier > .orr-ct-route .orr-route__caption { bottom:-14px !important; }
/* the dispatch facts at a size the decision needs */
${T} .sx-ct__rows .sx-ct-row.sx-decision__opt--sub .k-row__sub { font-size:11px !important; color:rgb(${BONE} / .66) !important; }
/* a short screen: the key stays above the fold; the scale captions fold; names hold one line with a dissolved edge */
@media (max-height:800px) {
  ${T} .sx-dossier .k-hero--hero .k-hero__n { font-size:44px !important; }
  ${T} .sx-dossier__title { font-size:20px !important; }
  ${T} .orr-ct-scales { height:46px !important; margin-top:4px !important; }
  ${T} .orr-ct-scales text.orr-ct-scale__end { display:none; }
  ${T} .sx-dossier__terms > li { padding:2px 0 !important; }
  ${T} .sx-dossier__terms { padding-top:0 !important; }
  ${T} .sx-dossier > .k-words.sx-dossier__acts, ${T} .sx-dossier > .k-words:last-of-type { margin-top:6px !important; }
  ${T} .sx-ct__rows .sx-ct-row .sx-ct-row__title { white-space:nowrap !important; overflow:hidden !important; text-overflow:clip !important; font-size:12px !important;
    -webkit-mask-image:linear-gradient(90deg, #000 calc(100% - 24px), transparent) !important; mask-image:linear-gradient(90deg, #000 calc(100% - 24px), transparent) !important; }
  ${T} .sx-dossier > .orr-ct-route .orr-route__caption { bottom:auto !important; top:0 !important; left:auto !important; right:0 !important; justify-content:flex-end !important; }
}
/* the Ledger's purse has the width of its words */
${T} .orr-ledger-purse { width:260px; }
@media (max-height:800px) { ${T} .orr-ledger-purse { width:230px; } }

/* every rail's words and sub-lines keep their new left edge */
${T} :is(.sx-bar__rail, .sx-bar__leads) > .k-caps, ${T} .sx-bar__foot, ${T} .sx-bar__leads .sx-muted, ${T} .st-ledger-nav, ${T} .sx-ledger__keys, ${T} .sx-ct__hang > * > .k-caps { padding-left:44px !important; }
${T} .sx-ct__rows .sx-ct-row:is(.is-active, .is-selected, [aria-selected="true"])::after { width:26px !important; }
${T} .sx-ct__rows .sx-ct-row:focus-visible::before { width:26px !important; }

/* ================================ ROUND 6: BAR ============================================== */
/* LEADS at the foot of the ladder column at every size; the contacts tighten (role inline) so the ladder ends above the replies */
${T} .sx-bar__hang { display:flex !important; flex-direction:column !important; }
${T} .sx-bar__leads { margin-top:auto !important; padding-bottom:4px; }
${T} .sx-bar__rows .sx-bar-row { flex-direction:row !important; justify-content:flex-start !important; align-items:baseline !important; gap:10px !important; padding-top:5px !important; padding-bottom:5px !important; text-align:left !important; }
/* the ladder's top line meets the dialogue's top line on a tall screen */
@media (min-width:1500px) and (min-height:900px) {
  ${T} .sx-bar__hang { padding-top:clamp(0px, calc((100vh - 900px) * .85), 150px) !important; }
}
/* the name clears the face: a size that ends short of the feather; the portrait holds its place at three quarters of the width */
${T} .sx-talk__name { font-size:clamp(44px, 5.8vh, 60px) !important; }
${T} .sx-talk__avatar { right:5% !important; }
/* the dim layer dissolves inside its own bounds: no edge ever reaches full alpha */
${T} .sx-talk__avatar::before { -webkit-mask-image:radial-gradient(ellipse 42% 60% at 56% 47%, #000 40%, transparent 84%); mask-image:radial-gradient(ellipse 42% 60% at 56% 47%, #000 40%, transparent 84%);
  background:radial-gradient(ellipse 42% 60% at 56% 47%, rgb(6 8 11 / .92), rgb(6 8 11 / .82) 42%, rgb(6 8 11 / .5) 62%, rgb(6 8 11 / 0) 84%); }
/* the replies hang off a spine: ticks cross it, the current reply is a light cursor on it, no triangle */
${T} .sx-talk__choices { background:linear-gradient(90deg, transparent 30px, rgb(${BONE} / .22) 30px, rgb(${BONE} / .22) 31px, transparent 31px) 0 8px / 100% calc(100% - 16px) no-repeat !important; padding:8px 0 !important; }
${T} .sx-choice::before, ${T} .sx-talk__choices > li:first-child .sx-choice::before { left:27px !important; width:7px !important; height:1px !important; margin-top:0 !important; top:50% !important; clip-path:none !important; background:rgb(${BONE} / .42) !important; }
${T} .sx-talk__choices > li .sx-choice.is-current::before, ${T} .sx-talk__choices > li .sx-choice:is(:hover, :focus-visible)::before { left:29.5px !important; width:2px !important; height:18px !important; margin-top:-9px !important; clip-path:none !important;
  background:rgb(255 250 240) !important; box-shadow:0 0 6px 1px rgb(248 244 234 / .55) !important; }
/* the keys read as keys */
${T} .sx-choice::after { font-size:12px !important; color:rgb(${BONE} / .7) !important; }
${T} .sx-talk__keys, ${T} .sx-bar__keys { ${LABEL} font-size:9.5px !important; letter-spacing:.16em !important; color:rgb(${BONE} / .5) !important; margin:8px 0 0 !important; }
${T} .sx-talk__keys { padding-left:44px; }
${T} .sx-bar__keys { padding-left:44px !important; }
/* one target per lead: the title at full width with its price as a reading; the verb answers the current row */
${T} .sx-lead { grid-template-columns:minmax(0, 1fr) auto !important; column-gap:12px !important; position:relative !important; }
${T} .sx-lead__t { white-space:normal !important; overflow:visible !important; text-overflow:clip !important; }
${T} .sx-lead__go { position:absolute !important; right:0; top:50%; transform:translateY(-50%); opacity:0; pointer-events:none; }
${T} .sx-lead:is(:hover, :focus-within) .sx-lead__go { opacity:1; pointer-events:auto; }
${T} .sx-lead:is(:hover, :focus-within) .sx-lead__s { visibility:hidden; }
@media (max-height:800px) { ${T} .sx-lead__t { font-size:12px !important; } }

/* ================================ ROUND 6: FACTIONS ========================================= */
/* the hero crest is a watermark the numeral and brackets stand against: large, bone, quiet, no gold */
${T} .sx-fac-crest { display:block !important; position:absolute; right:0 !important; left:auto !important; top:-16px; width:300px; height:300px; pointer-events:none; z-index:0; opacity:.34;
  filter:grayscale(1) brightness(1.1); mix-blend-mode:screen; }
${T} .sx-fac-crest img, ${T} .sx-fac-crest svg, ${T} .sx-fac-crest * { filter:grayscale(1) !important; }
${T} .sx-fac-overview { padding-right:0 !important; }
${T} .sx-fac-overview > :not(.sx-fac-crest) { position:relative; z-index:1; }
@media (min-width:1500px) { ${T} .sx-fac-overview > .sx-fac__detail { margin-right:0 !important; } }
@media (max-height:800px) { ${T} .sx-fac-crest { width:200px; height:200px; top:-10px; } }
/* rim words at the label floor; a dim zero is a zero */
${T} .orr-crest__name { font-size:10.5px !important; }
${T} .orr-crest__rep { font-size:11px !important; }
${T} .sx-fac__rows .sx-fac-row__tier.is-zero { color:rgb(${BONE} / .32) !important; }

/* every ladder row keeps the arm's room whatever its own sheet said */
${T} :is(.sx-bar__rows .sx-bar-row, .sx-lead__rows .sx-lead, .sx-ct__rows .sx-ct-row, .sx-fac__rows .sx-fac-row, .st-ledger-list .st-ledger-entry, .sx-ind__list .sx-ind-row) { padding-left:44px !important; }
${T} .sx-ct__active { padding-left:44px !important; }

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
