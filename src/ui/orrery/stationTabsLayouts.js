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
${T} ${list} { background:linear-gradient(90deg, transparent 7px, rgb(${BONE} / .24) 7px, rgb(${BONE} / .24) 8px, transparent 8px) 0 0 / 100% 100% no-repeat,
    repeating-linear-gradient(180deg, rgb(${BONE} / .2) 0 1px, transparent 1px 8px) 4px 0 / 4px 100% no-repeat !important; }
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
${T} .sx-bar__rows { ${PLAIN} }
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
  ${T} .sx-fac__stage { grid-template-columns:minmax(380px, 44%) minmax(0, 1fr) !important; column-gap:28px !important; }
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
