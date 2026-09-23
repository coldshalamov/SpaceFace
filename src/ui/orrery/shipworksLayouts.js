// ORRERY composition for the station Shipworks (design/frontend/ORRERY.md §6 Station, Shipworks): the
// hull on its stage with its systems called out as words on leaders (the refit's law: no label boxes,
// the amber Hand only on the chosen slot), the fleet on a rail with the Hand, the handling as scales
// of light, the circuit as a column of readings. It styles the shared stage's existing nodes in the
// dock host only (`.orr-station .sx-sw`; THE SHIP keeps its own sheet) and pins nothing.
import { injectOrrery } from './tokens.js';

const STYLE_ID = 'sf-orrery-shipworks';
const W = 'html body #screens > .sx-berth.orr-station .sx-sw';
const BONE = '236 230 216';
const LABEL = 'font-family:var(--dp-face-label, "Archivo") !important; font-stretch:112%; font-variation-settings:"wdth" 112, "wght" 650 !important; font-weight:650 !important; text-transform:uppercase;';
const PLAIN = 'background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important; clip-path:none !important;';
const HAND = 'clip-path:polygon(0 0, 100% 50%, 0 100%, 26% 50%) !important;';

const CSS = `
/* ---- the fleet: words on a rail, the Hand at the ship on the stage ---------------------------- */
${W} .sx-sw__rail { ${PLAIN} }
${W} .sx-sw__rail .sx-seg { gap:0 22px !important; margin:0 0 14px !important; }
${W} .sx-sw__rail .sx-seg__btn { ${PLAIN} ${LABEL} min-height:0 !important; min-width:0 !important; height:auto !important; padding:4px 0 8px !important;
  font-size:11px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .58) !important; }
${W} .sx-sw__rail .sx-seg__btn::before, ${W} .sx-sw__rail .sx-seg__btn::after { display:none !important; }
${W} .sx-sw__rail .sx-seg__btn.is-on { color:rgb(248 244 234) !important; background-image:linear-gradient(rgb(${BONE} / .9), rgb(${BONE} / .9)) !important;
  background-size:16px 2px !important; background-position:0 100% !important; background-repeat:no-repeat !important; }
${W} .sx-sw__rail .sx-seg__btn:is(:hover, :focus-visible) { color:rgb(${BONE} / .92) !important; outline:none !important; }
${W} .sx-sw__list { background:linear-gradient(90deg, transparent 7px, rgb(${BONE} / .22) 7px, rgb(${BONE} / .22) 8px, transparent 8px) !important; gap:2px !important; }
${W} .sx-sw-row { ${PLAIN} position:relative; padding:9px 4px 9px 28px !important; min-height:0 !important; height:auto !important; text-align:left; }
${W} .sx-sw-row::after { display:none !important; }
${W} .sx-sw-row::before { content:"" !important; display:block !important; position:absolute !important; left:4px !important; top:50% !important; width:8px !important; height:1px !important;
  background:rgb(${BONE} / .38) !important; box-shadow:none !important; transform:none !important; clip-path:none !important; }
${W} .sx-sw-row:is(.is-active, .is-selected, .is-viewed, [aria-pressed='true'], [aria-current='true'])::before { left:2px !important; width:11px !important; height:14px !important;
  margin-top:-7px !important; ${HAND} background:rgb(248 244 234) !important; }
${W} .sx-sw__list:is(:focus-within, :hover) .sx-sw-row:is(.is-active, .is-selected, .is-viewed, [aria-pressed='true'], [aria-current='true'])::before { background:var(--dp-hand, #f2b950) !important; }
${W} .sx-sw-row .k-row__name { font-size:14px !important; color:rgb(248 244 234) !important; }
${W} .sx-sw-row .k-row__sub { ${LABEL} font-size:9.5px !important; letter-spacing:.16em !important; color:rgb(${BONE} / .6) !important; }
${W} .sx-sw-row .sx-sw-row__flag { ${LABEL} font-size:9.5px !important; letter-spacing:.18em !important; color:rgb(${BONE} / .8) !important; background:none !important; border:0 !important; }
${W} .sx-sw-row:is(:hover, :focus-visible) { outline:none !important; }
${W} .sx-sw-row:is(:hover, :focus-visible) .k-row__name { color:rgb(255 250 240) !important; }

/* ---- the stage: the name, the systems called out as words on leaders -------------------------- */
${W} .sx-sw__name { color:rgb(248 244 234) !important; }
${W} .sx-sw__condition, ${W} .sx-sw__conditionVerb { ${LABEL} font-size:10px !important; letter-spacing:.22em !important; color:rgb(${BONE} / .7) !important; }
${W} .sx-sw__blurb { color:rgb(${BONE} / .78) !important; }
${W} .sx-sw__camera .k-word { ${PLAIN} ${LABEL} font-size:10px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .55) !important; padding:3px 2px !important; min-height:0 !important; }
${W} .sx-sw__camera .k-word:is(:hover, :focus-visible) { color:rgb(248 244 234) !important; outline:none !important; }
${W} .sx-sw__dragcue { color:rgb(${BONE} / .5) !important; }
${W} .sx-sw__slotfield:not(.is-board) .sx-hardpoint__copy { ${PLAIN} padding:0 !important; border-radius:0 !important; }
${W} .sx-sw__slotfield:not(.is-board) .sx-hardpoint__copy::before, ${W} .sx-sw__slotfield:not(.is-board) .sx-hardpoint__copy::after { display:none !important; }
${W} .sx-sw__slotfield:not(.is-board) .sx-hardpoint__copy b { color:rgb(248 244 234) !important; font-size:12.5px !important; font-weight:600 !important; }
${W} .sx-sw__slotfield:not(.is-board) .sx-hardpoint__copy em { ${LABEL} font-style:normal !important; font-size:9.5px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .62) !important; }
${W} .sx-sw__slotfield:not(.is-board) .sx-hardpoint.is-empty .sx-hardpoint__copy b { color:rgb(${BONE} / .78) !important; }
${W} .sx-sw__slotfield:not(.is-board) .sx-hardpoint__reticle { ${PLAIN} width:9px !important; height:9px !important; border-radius:50% !important;
  border:1.5px solid rgb(248 244 234) !important; background:rgb(7 8 10 / .85) !important; box-shadow:0 0 0 2px rgb(7 8 10 / .6) !important; }
${W} .sx-sw__slotfield:not(.is-board) .sx-hardpoint__leader path { stroke:rgb(${BONE} / .5) !important; stroke-width:1 !important; }
/* the Hand is on the chosen slot only */
${W} .sx-sw__slotfield:not(.is-board) .sx-hardpoint:is(:hover, :focus-visible, .is-selected) .sx-hardpoint__copy b { color:var(--dp-hand-hot, #ffd98c) !important; }
${W} .sx-sw__slotfield:not(.is-board) .sx-hardpoint:is(:hover, :focus-visible, .is-selected) .sx-hardpoint__reticle { border-color:var(--dp-hand, #f2b950) !important;
  background:var(--dp-hand, #f2b950) !important; }
${W} .sx-sw__slotfield:not(.is-board) .sx-hardpoint:is(:hover, :focus-visible, .is-selected) .sx-hardpoint__leader path { stroke:var(--dp-hand, #f2b950) !important; }
${W} .sx-sw__slotfield .sx-hardpoint:focus-visible { outline:none !important; }
/* the six readings under the hull: a ledger line of caps and figures */
${W} .sx-sw__gauges { ${PLAIN} gap:0 26px !important; }
${W} .sx-sw-gauge { ${PLAIN} padding:0 !important; min-height:0 !important; gap:8px !important; }
${W} .sx-sw-gauge .k-row__name { ${LABEL} font-size:9.5px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .6) !important; }
${W} .sx-sw-gauge .k-row__num { font-size:13px !important; color:rgb(248 244 234) !important; font-variant-numeric:tabular-nums; }

/* ---- the handling: no plate; the figures quieter; the bars as scales of light ---------------- */
${W} .sx-sw__stats { ${PLAIN} position:relative; isolation:isolate; }
${W} .sx-sw__stats::before { content:""; position:absolute; z-index:-1; inset:-40px -60px -40px -60px; pointer-events:none;
  background:radial-gradient(closest-side, rgb(7 8 10 / .78), rgb(7 8 10 / .55) 60%, rgb(7 8 10 / 0)); }
${W} .sx-sw-bands { gap:0 clamp(28px, 3vw, 56px) !important; }
${W} .sx-sw-hero { ${PLAIN} padding:2px 0 8px !important; min-height:0 !important; text-align:left; }
${W} .sx-sw-hero::before, ${W} .sx-sw-hero::after { display:none !important; }
${W} .sx-sw-hero .k-hero__n { font-family:var(--dp-face-display, "Archivo") !important; font-stretch:100% !important; font-variation-settings:"wdth" 100, "wght" 560 !important;
  font-weight:560 !important; font-size:clamp(24px, 2.6vh, 32px) !important; line-height:1 !important; letter-spacing:.01em !important; color:rgb(248 244 234) !important;
  text-transform:none !important; text-shadow:none !important; }
${W} .sx-sw-hero .k-hero__w { ${LABEL} font-size:9.5px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .62) !important; margin-top:6px; }
${W} .sx-sw-hero.is-selected { background-image:linear-gradient(rgb(${BONE} / .85), rgb(${BONE} / .85)) !important; background-size:18px 2px !important;
  background-position:0 100% !important; background-repeat:no-repeat !important; }
${W} .sx-sw-hero:is(:hover, :focus-visible) .k-hero__n { color:var(--dp-hand-hot, #ffd98c) !important; }
${W} .sx-sw-hero:is(:hover, :focus-visible) { outline:none !important; }
${W} .sx-sw-band__meta { color:rgb(${BONE} / .6) !important; }
${W} :is(.sx-sw-band__label, .sx-sw__stats .k-caps) { ${LABEL} font-size:9.5px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .6) !important; }
${W} .sx-sw-bar { ${PLAIN} padding:6px 0 !important; min-height:0 !important; }
${W} .sx-sw-bar .k-row__name { font-size:12.5px !important; color:rgb(${BONE} / .8) !important; min-width:84px; }
${W} .sx-sw-bar .k-row__num { font-size:13px !important; color:rgb(248 244 234) !important; font-variant-numeric:tabular-nums; }
${W} .sx-sw-bar__track { ${PLAIN} height:7px !important; width:200px !important;
  background:linear-gradient(rgb(${BONE} / .22), rgb(${BONE} / .22)) 0 50% / 100% 1px no-repeat,
    repeating-linear-gradient(90deg, rgb(${BONE} / .32) 0 1px, transparent 1px 20px) 0 50% / 100% 7px no-repeat !important; }
${W} .sx-sw-bar__track > .k-bar__fill { height:2px !important; top:50% !important; margin-top:-1px; background:rgb(248 244 234) !important; box-shadow:none !important; }
${W} :is(.sx-sw-preset, .sx-sw-chip) { ${PLAIN} ${LABEL} min-height:0 !important; height:auto !important; padding:4px 0 !important; font-size:10.5px !important;
  letter-spacing:.18em !important; color:rgb(${BONE} / .8) !important; }
${W} :is(.sx-sw-preset, .sx-sw-chip)::after { display:none !important; }
${W} :is(.sx-sw-preset, .sx-sw-chip)::before { all:unset !important; content:"›  " !important; color:rgb(${BONE} / .55) !important; }
${W} :is(.sx-sw-preset, .sx-sw-chip):is(:hover, :focus-visible) { color:var(--dp-hand, #f2b950) !important; outline:none !important; }
/* the screen's verbs: words with their notch; the one that commits rests in bone and lights amber */
${W} ~ .sx-sw-verbs, ${W} .sx-sw-verbs { ${PLAIN} gap:0 26px !important; }
${W} .sx-sw-verb { ${PLAIN} ${LABEL} min-height:0 !important; height:auto !important; padding:4px 0 !important; font-size:11px !important; letter-spacing:.18em !important;
  color:rgb(${BONE} / .8) !important; }
${W} .sx-sw-verb::after { display:none !important; }
${W} .sx-sw-verb::before { all:unset !important; content:"›  " !important; color:rgb(${BONE} / .55) !important; }
${W} .sx-sw-verb:is(:hover, :focus-visible) { color:var(--dp-hand, #f2b950) !important; outline:none !important; }
${W} .sx-sw-verb:disabled { color:rgb(${BONE} / .45) !important; }

/* ---- the circuit: no plate; the core figure, the systems as readings ------------------------- */
${W} .sx-sw__side { ${PLAIN} position:relative; isolation:isolate; }
${W} .sx-sw__side::before { content:""; position:absolute; z-index:-1; inset:-30px -40px -30px -40px; pointer-events:none;
  background:radial-gradient(closest-side, rgb(7 8 10 / .8), rgb(7 8 10 / .6) 60%, rgb(7 8 10 / 0)); }
${W} .sx-sw-circuit__identity { ${LABEL} font-size:10px !important; letter-spacing:.22em !important; color:rgb(${BONE} / .72) !important; }
${W} .sx-sw-circuit__sub { color:rgb(${BONE} / .55) !important; text-transform:none; letter-spacing:.04em; }
${W} .sx-sw-circuit__core .k-hero__n { font-family:var(--dp-face-display, "Archivo") !important; font-stretch:100% !important; font-variation-settings:"wdth" 100, "wght" 500 !important;
  font-size:40px !important; color:rgb(248 244 234) !important; text-shadow:none !important; }
${W} .sx-sw-circuit__core .k-hero__w { ${LABEL} font-size:9.5px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .62) !important; }
${W} :is(.sx-sw-flow, .sx-sw-rack__cell) { ${PLAIN} padding:6px 0 !important; min-height:0 !important; }
${W} :is(.sx-sw-flow, .sx-sw-rack__cell) .k-row__name { font-size:13px !important; color:rgb(${BONE} / .85) !important; }
${W} :is(.sx-sw-flow, .sx-sw-rack__cell) .k-row__sub { font-size:11px !important; color:rgb(${BONE} / .55) !important; }
${W} :is(.sx-sw-flow, .sx-sw-rack__cell) .k-row__num { color:rgb(248 244 234) !important; font-variant-numeric:tabular-nums; }
${W} .sx-sw__side :is([data-rack-restock], [data-rack-upgrade]) { ${PLAIN} ${LABEL} min-height:0 !important; height:auto !important; padding:4px 0 !important;
  font-size:10.5px !important; letter-spacing:.16em !important; color:rgb(248 244 234) !important; }
${W} .sx-sw__side :is([data-rack-restock], [data-rack-upgrade])::after { display:none !important; }
${W} .sx-sw__side :is([data-rack-restock], [data-rack-upgrade])::before { all:unset !important; content:"›  " !important; color:rgb(${BONE} / .55) !important; }
${W} .sx-sw__side :is([data-rack-restock], [data-rack-upgrade]):is(:hover, :focus-visible) { color:var(--dp-hand, #f2b950) !important; outline:none !important; }
${W} .sx-sw__side .k-t-fine, ${W} .sx-sw__side .k-sentence { color:rgb(${BONE} / .7) !important; }
`;

export function injectOrreryShipworks(doc = globalThis.document) {
  if (!doc?.head || typeof doc.createElement !== 'function' || typeof doc.getElementById !== 'function') return;
  injectOrrery(doc);
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
