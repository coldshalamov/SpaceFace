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
${T} ${row}:is(${chosen})::before { left:2px !important; width:11px !important; height:14px !important; margin-top:-7px !important; ${HAND} background:rgb(248 244 234) !important; }
${T} ${list}:is(:focus-within, :hover) ${row}:is(${chosen})::before { background:var(--dp-hand, #f2b950) !important; }
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
${T} .sx-ct__hang > .k-caps, ${T} .sx-ct__yours { ${LABEL} font-size:10.5px !important; letter-spacing:.22em !important; color:rgb(${BONE} / .72) !important; }
${T} .sx-ct-dispatch__label { ${LABEL} font-size:9.5px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .5) !important; }
/* the dispatch's choice: a sentence and its offers as verbs */
${T} .sx-ct__board > .sx-decision { ${PLAIN} padding:0 !important; margin:0 0 16px !important; }
${T} .sx-ct__board > .sx-decision > .k-sentence { color:rgb(${BONE} / .8) !important; font-size:13px !important; margin:0 0 8px !important; }
${T} .sx-ct-row.sx-decision__opt { ${PLAIN} position:relative !important; display:flex !important; flex-direction:column; align-items:flex-start; gap:3px;
  padding:6px 0 6px 18px !important; min-height:0 !important; height:auto !important; width:100% !important; text-align:left; }
${T} .sx-ct-row.sx-decision__opt::after { display:none !important; }
${T} .sx-ct-row.sx-decision__opt::before { all:unset !important; content:"›" !important; position:absolute !important; left:2px; top:5px; color:rgb(${BONE} / .55) !important; }
${T} .sx-ct-row.sx-decision__opt .k-row__name { ${LABEL} font-size:11px !important; letter-spacing:.14em !important; color:rgb(248 244 234) !important; }
${T} .sx-ct-row.sx-decision__opt .k-row__sub { font-size:11.5px !important; color:rgb(${BONE} / .65) !important; }
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
${T} .sx-ct__rows .sx-ct-row .sx-ct-row__rew { font-size:13.5px !important; font-weight:620; color:rgb(248 244 234) !important; font-variant-numeric:tabular-nums; }
${T} .sx-ct__rows .sx-ct-row .sx-ct-row__badge { ${LABEL} font-size:9px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .8) !important; background:none !important; }
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
/* the dossier: no panel; the reward in warm white; the terms a ledger */
${T} .sx-dossier { ${PLAIN} position:relative; isolation:isolate; }
${T} .sx-dossier::before { content:""; position:absolute; z-index:-1; inset:-40px -60px; pointer-events:none;
  background:radial-gradient(closest-side, rgb(7 8 10 / .8), rgb(7 8 10 / .6) 60%, rgb(7 8 10 / 0)); }
${T} .sx-dossier__title, ${T} .sx-dossier__title .sf-entity-link { text-decoration:none !important; background-image:none !important; border-bottom:0 !important; }
${T} .sx-dossier__title .sf-entity-link:is(:hover, :focus-visible) { text-decoration:underline 1px rgb(${BONE} / .45) !important; text-underline-offset:6px; }
${T} .sx-dossier :is(.sx-dossier__client, .sx-dossier__route) .sf-entity-link { text-decoration:none !important; background-image:none !important;
  border-bottom:1px solid rgb(${BONE} / .3) !important; color:rgb(248 244 234) !important; }
${T} .sx-dossier__reward .k-hero__n { color:rgb(248 244 234) !important; text-shadow:0 0 24px rgb(0 0 0 / .5) !important;
  font-variation-settings:"wdth" 100, "wght" 560 !important; font-stretch:100% !important; }
${T} .sx-dossier__reward .k-hero__w { ${LABEL} font-size:10px !important; letter-spacing:.22em !important; color:rgb(${BONE} / .66) !important; }
${T} :is(.sx-dossier__route, .sx-dossier__risk) { color:rgb(${BONE} / .8) !important; }
${T} .sx-dossier__terms { ${PLAIN} }
${T} .sx-dossier__terms > li { ${PLAIN} display:grid !important; grid-template-columns:120px minmax(0, 1fr); align-items:baseline; column-gap:18px; padding:7px 0 !important; min-height:0 !important; }
${T} .sx-dossier__terms > li > .k-62 { ${LABEL} font-size:9.5px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .6) !important; }
${T} .sx-dossier__terms .sx-term__v { font-size:13.5px !important; color:rgb(248 244 234) !important; text-align:left !important; justify-self:start !important; margin:0 !important; }
${T} .sx-dossier__terms .sx-term__sub { grid-column:2; justify-self:start !important; text-align:left !important; margin:0 !important; font-size:11.5px !important; color:rgb(${BONE} / .6) !important; }
${T} .sx-dossier__terms { max-width:560px; }
${T} .sx-dossier__foot { margin-top:18px !important; }
${commit('.sx-ct-commit')}
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
