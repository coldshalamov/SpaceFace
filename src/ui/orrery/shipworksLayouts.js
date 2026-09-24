// ORRERY composition for the station Shipworks (design/frontend/ORRERY.md §6 Station, Shipworks): the
// hull on its stage with its systems called out as words on leaders (the refit's law: no label boxes,
// the amber Hand only on the chosen slot), the fleet on a rail with the Hand, the handling as scales
// of light, the circuit as a column of readings. It styles the shared stage's existing nodes in the
// dock host only (`.orr-station .sx-sw`; THE SHIP keeps its own sheet) and pins nothing.
import { injectOrrery } from './tokens.js';
import { arcD, polar, ticksD } from './svg.js';

const f2 = (n) => Math.round(n * 100) / 100;
/**
 * The power circuit as one dial: the core's capacity is the arc, the continuous draw is lit along
 * it system by system with a notch between each, and the quarter ticks read the scale.
 */
export function powerDialSvg({ cap = 0, draws = [], ghost = null } = {}) {
  const w = 176; const h = 118; const cx = 88; const cy = 70; const r = 58; const from = -128; const to = 128;
  const span = to - from;
  const capacity = Math.max(1, Number(cap) || 0);
  let at = from;
  let lit = '';
  let notches = '';
  for (const [, draw] of draws) {
    const d = Math.max(0, Number(draw) || 0);
    if (d <= 0) continue;
    const end = Math.min(to, at + span * (d / capacity));
    lit += `<path class="orr-power__lit" d="${arcD(cx, cy, r, at, end)}"/>`;
    const [nx0, ny0] = polar(cx, cy, r - 5, end);
    const [nx1, ny1] = polar(cx, cy, r + 5, end);
    notches += `M ${f2(nx0)} ${f2(ny0)} L ${f2(nx1)} ${f2(ny1)} `;
    at = end;
  }
  const over = draws.reduce((s, [, d]) => s + Math.max(0, Number(d) || 0), 0) > capacity;
  let ghostArc = '';
  if (Array.isArray(ghost)) {
    const total = ghost.reduce((s, [, d]) => s + Math.max(0, Number(d) || 0), 0);
    const end = from + span * Math.min(1.08, total / capacity);
    if (total > 0) ghostArc = `<path class="orr-power__ghost${total > capacity ? ' is-over' : ''}" d="${arcD(cx, cy, r + 9, from, Math.min(to + 10, end))}"/>`;
  }
  return `<svg class="orr-power${over ? ' is-over' : ''}" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false">`
    + `<path class="orr-power__track" d="${arcD(cx, cy, r, from, to)}"/>`
    + `<path class="orr-power__ticks" d="${ticksD(cx, cy, r + 4, 4, { len: 4, from, to, inward: false })}"/>`
    + lit + (notches ? `<path class="orr-power__notch" d="${notches}"/>` : '') + ghostArc
    + `</svg>`;
}

const STYLE_ID = 'sf-orrery-shipworks';
const W = 'html body #screens > .sx-berth.orr-station .sx-sw';
const BONE = '236 230 216';
const LABEL = 'font-family:var(--dp-face-label, "Archivo") !important; font-stretch:112%; font-variation-settings:"wdth" 112, "wght" 650 !important; font-weight:650 !important; text-transform:uppercase;';
const PLAIN = 'background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important; clip-path:none !important;';
const HAND = 'clip-path:polygon(0 0, 100% 50%, 0 100%, 26% 50%) !important;';

const CSS = `
/* ---- the jig: where the hull has a drawing, the stage is the drawing in its dial ---------------- */
${W} .orr-sw-jig { position:absolute; inset:0 0 34px 0; z-index:3; }
@media (max-height:800px) {
  ${W} .orr-sw-jig { bottom:22px; }
  /* a short stage: the readings carry the proposed fit's changes as their ghosts; the separate line steps back */
  ${W}.orr-sw--jig .sx-sw__stage .sx-sw__delta { display:none !important; }
  ${W} .sx-chooser__kicker { white-space:normal !important; }
}
/* a drawing that cannot lay out stands down whole: its labels never fall into the flow */
${W} .orr-sw-jig:not(.orr-hull--on) .orr-sw-node { display:none !important; }
${W} .orr-sw-jig .orr-hull__pool { -webkit-mask-image:linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent), linear-gradient(180deg, transparent, #000 10%, #000 90%, transparent);
  -webkit-mask-composite:source-in; mask-image:linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent), linear-gradient(180deg, transparent, #000 10%, #000 90%, transparent);
  mask-composite:intersect; }
${W} .orr-sw-jig[hidden] { display:none !important; }
${W} .sx-sw__stage:has(> .orr-sw-jig.orr-hull--on) > :is(.sx-sw__canvas, .sx-sw__poster, .sx-sw__baylines, .sx-sw__power, .sx-sw__scarfield, .sx-sw__focusline, .sx-sw__camera, .sx-sw__dragcue, .sx-sw__acquiring, .sx-sw__delta) { visibility:hidden !important; }
${W} .sx-sw__stage:has(> .orr-sw-jig.orr-hull--on) .sx-sw__slotfield .sx-hardpoint > * { display:none !important; }
${W} .sx-sw__stage:has(> .orr-sw-jig.orr-hull--on) .sx-sw__slotfield { pointer-events:none; }
${W} .sx-sw__stage:has(> .orr-sw-jig.orr-hull--on) > .sx-sw__nameplate { z-index:4; }
${W} .orr-sw-node { display:flex; align-items:baseline; gap:10px; padding:3px 0 5px; cursor:pointer; min-width:0; }
${W} .orr-sw-node.is-left { flex-direction:row-reverse; text-align:right; }
${W} .orr-sw-node__num { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:10.5px; letter-spacing:.12em; color:rgb(${BONE} / .6);
  font-variant-numeric:tabular-nums; flex:none; }
${W} .orr-sw-node__body { display:flex; flex-direction:column; gap:3px; min-width:0; }
${W} .orr-sw-node.is-left .orr-sw-node__body { align-items:flex-end; }
${W} .orr-sw-node__name { font-size:14px; font-weight:600; color:rgb(248 244 234); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
${W} .orr-sw-node.is-empty .orr-sw-node__name { color:rgb(${BONE} / .82); font-weight:560; }
${W} .orr-sw-node__state { ${LABEL} font-size:10.5px !important; letter-spacing:.16em !important; color:rgb(${BONE} / .66); white-space:nowrap; }
${W} .orr-sw-node.is-empty .orr-sw-node__state { color:rgb(${BONE} / .55); }
${W} .orr-sw-node.is-lit .orr-sw-node__name { color:var(--dp-hand-hot, #ffd98c); }
${W} .orr-sw-node.is-stock .orr-sw-node__name { color:rgb(${BONE} / .9); font-weight:560; }
${W} .orr-sw-node.is-preview .orr-sw-node__name { color:var(--dp-ice, #8fcbff) !important; }
${W} .orr-sw-node.is-preview .orr-sw-node__state { color:var(--dp-ice, #8fcbff) !important; }
${W} .orr-sw-jig .orr-hull__fitted.is-lit { stroke:rgb(248 244 234) !important; }
${W} .orr-sw-jig .orr-hull__hand > path[fill], ${W} .orr-sw-jig .orr-hull__hand > path:nth-child(3) { display:none !important; }
/* the proposed fit's changes: one line of ice under the dial */
${W}.orr-sw--jig .sx-sw__stage .sx-sw__delta:not([hidden]) { visibility:visible !important; position:absolute !important; left:0 !important; right:0 !important; top:auto !important;
  bottom:8px !important; width:auto !important; height:auto !important; max-width:none !important; transform:none !important; z-index:6; margin:0 !important; padding:0 !important;
  display:flex !important; flex-wrap:nowrap !important; justify-content:center !important; align-items:baseline !important; gap:0 18px !important; ${PLAIN}
  font-size:12px !important; white-space:nowrap; color:var(--dp-ice, #8fcbff) !important; }
${W}.orr-sw--jig .sx-sw__delta > * { position:static !important; transform:none !important; margin:0 !important; }
${W}.orr-sw--jig .sx-sw__delta .sx-sw__delta-k { ${LABEL} font-size:9.5px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .7) !important; }
${W}.orr-sw--jig .sx-sw__delta :is(.k-good, .k-bad, .is-gain, .is-loss) { color:var(--dp-ice, #8fcbff) !important; }
/* while choosing, the screen's own verbs and the instruction step back */
${W}.orr-sw--jig.is-choosing .sx-sw-verbs { visibility:hidden !important; }
${W}.is-choosing .sx-sw-circuit__instruction { display:none !important; }
${W} .orr-sw-node.is-lit .orr-sw-node__num { color:var(--dp-hand, #f2b950); }

/* the drawing takes the main column's height: the handling stands under the fleet in the left
   column, the screen's verbs under the ship's name, the six readings along the stage's foot */
${W}.orr-sw--jig .sx-sw__stats { position:absolute !important; left:0 !important; top:170px !important; bottom:auto !important; width:230px !important; max-height:calc(100% - 180px) !important;
  margin:0 !important; overflow:hidden auto !important; }
${W}.orr-sw--jig.is-choosing .sx-sw__stats { visibility:hidden !important; }
${W}.orr-sw--jig .sx-sw__stats::before { inset:-30px -30px -20px -30px; }
${W}.orr-sw--jig .sx-sw-bands { display:grid !important; grid-template-columns:1fr 1fr; gap:14px 18px !important; }
${W}.orr-sw--jig .sx-sw-hero .k-hero__n { font-size:22px !important; white-space:nowrap; }
${W}.orr-sw--jig .sx-sw-bar { display:grid !important; grid-template-columns:74px minmax(0, 1fr) auto; align-items:center; column-gap:10px; }
${W}.orr-sw--jig .sx-sw-bar .k-row__name { min-width:0; font-size:12px !important; }
${W}.orr-sw--jig .sx-sw-bar__track { width:auto !important; }
${W}.orr-sw--jig .sx-sw-verbs { position:absolute !important; left:258px !important; top:92px !important; right:auto !important; bottom:auto !important; z-index:5;
  display:flex !important; flex-direction:column !important; align-items:flex-start !important; gap:6px !important; max-width:260px; }
${W}.orr-sw--jig .sx-sw__main { overflow:visible !important; }
${W}.orr-sw--jig .sx-sw__stage { flex:1 1 auto !important; min-height:0; }

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
${W} .sx-sw__gauges { ${PLAIN} gap:0 26px !important; justify-content:center !important; flex-wrap:nowrap !important; white-space:nowrap; }
@media (max-width:1500px) {
  ${W} .sx-sw__gauges { gap:0 14px !important; }
  ${W} .sx-sw-gauge .k-row__name { font-size:8.5px !important; letter-spacing:.14em !important; }
  ${W} .sx-sw-gauge .k-row__num { font-size:12px !important; }
  ${W}.orr-sw--jig .sx-sw__delta:not([hidden]) { font-size:11px !important; gap:0 12px !important; }
}
${W} .sx-sw-rack .sx-sw-band__label > .k-38 { display:block; margin-top:3px; letter-spacing:.14em; }
${W} .sx-sw-band--presets .sx-sw-band__label > .k-38 { display:none !important; }
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
${W} .sx-sw-hero[data-band='condition'] { display:none !important; }
${W} .sx-sw-bar.sx-sw-bar--topSpeed { display:none !important; }
${W} .sx-sw-ghost { color:var(--dp-ice, #8fcbff) !important; }
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

/* ---- the chooser: the compatible modules on the fleet's rail, the Hand at the one previewed ------ */
${W} .sx-sw__chooser, ${W} .sx-chooser__panel { ${PLAIN} }
${W} .sx-chooser__head { margin:0 0 12px !important; padding:0 !important; }
${W} .sx-chooser__x { ${PLAIN} ${LABEL} min-height:0 !important; min-width:0 !important; height:auto !important; padding:3px 0 !important; font-size:11px !important;
  letter-spacing:.2em !important; color:rgb(${BONE} / .75) !important; }
${W} .sx-chooser__x::after { display:none !important; }
${W} .sx-chooser__x::before { all:unset !important; content:"‹  " !important; color:rgb(${BONE} / .55) !important; }
${W} .sx-chooser__x:is(:hover, :focus-visible) { color:rgb(248 244 234) !important; outline:none !important; }
${W} .sx-chooser__kicker { ${LABEL} font-size:9px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .66) !important; margin:10px 0 2px !important; white-space:nowrap; }
${W} .sx-chooser__head h3 { ${LABEL} font-size:10px !important; letter-spacing:.2em !important; color:rgb(248 244 234) !important; }
${W} .sx-chooser__head h3 .k-38 { color:rgb(${BONE} / .6) !important; }
${W} .sx-chooser__unfit { ${PLAIN} ${LABEL} font-size:10.5px !important; letter-spacing:.16em !important; color:rgb(248 244 234) !important; padding:3px 0 !important; min-height:0 !important; }
${W} .sx-chooser__list { background:linear-gradient(90deg, transparent 7px, rgb(${BONE} / .22) 7px, rgb(${BONE} / .22) 8px, transparent 8px) !important; padding:0 !important; }
${W} .sx-modrow { ${PLAIN} display:block !important; position:relative; padding:9px 0 11px 26px !important; min-height:0 !important; height:auto !important; cursor:pointer; }
${W} .sx-modrow::after { display:none !important; }
${W} .sx-modrow::before { content:"" !important; display:block !important; position:absolute !important; left:4px !important; top:17px !important; width:8px !important; height:1px !important;
  background:rgb(${BONE} / .38) !important; box-shadow:none !important; transform:none !important; clip-path:none !important; }
${W} .sx-modrow:is(:focus-within, :hover)::before { left:2px !important; top:11px !important; width:11px !important; height:14px !important;
  ${HAND} background:rgb(248 244 234) !important; }
${W} .sx-modrow:is(:focus-within, :hover)::before { background:var(--dp-hand, #f2b950) !important; }
${W} .sx-modrow:focus-visible { outline:none !important; }
${W} .sx-modrow .sx-modrow__body { display:flex !important; flex-direction:column; gap:3px; width:auto !important; min-width:0 !important; }
${W} .sx-modrow .sx-modrow__name { font-size:13.5px !important; font-weight:600; color:rgb(248 244 234) !important; }
${W} .sx-modrow .sx-modrow__name .sf-entity-link { text-decoration:none !important; background-image:none !important; color:inherit !important; }
${W} .sx-modrow :is(.k-good, .is-gain, .sx-modrow__chip.is-up) { color:var(--dp-ice, #8fcbff) !important; }
${W} .sx-modrow :is(.k-bad, .is-loss, .sx-modrow__chip.is-down) { color:rgb(143 203 255 / .7) !important; }
${W} .sx-modrow .sx-modrow__role { font-size:11px !important; color:rgb(${BONE} / .62) !important; }
${W} .sx-modrow .sx-modrow__metrics { font-size:11px !important; color:rgb(${BONE} / .78) !important; }
${W} .sx-modrow .sx-modrow__meta { display:none !important; }
${W} .sx-modrow:focus-within .sx-modrow__meta { display:block !important; font-size:11.5px !important; color:rgb(${BONE} / .7) !important; }
${W} .sx-modrow .k-38.sx-modrow__role { display:none !important; }
${W} .sx-modrow .sx-modrow__act { display:none !important; margin-top:5px; width:auto !important; }
${W} .sx-modrow:is(:focus-within, :hover) .sx-modrow__act { display:block !important; }
${W} .sx-modrow .sx-modrow__buy { ${PLAIN} ${LABEL} display:inline-flex !important; align-items:baseline; gap:8px; min-height:0 !important; min-width:0 !important; height:auto !important;
  padding:2px 0 !important; font-size:10.5px !important; letter-spacing:.16em !important; color:rgb(248 244 234) !important; }
${W} .sx-modrow .sx-modrow__buy::after { display:none !important; }
${W} .sx-modrow .sx-modrow__buy::before { all:unset !important; content:"›" !important; color:rgb(${BONE} / .55) !important; }
${W} .sx-modrow .sx-modrow__buy small { color:rgb(${BONE} / .7) !important; letter-spacing:.1em; }
${W} .sx-modrow .sx-modrow__buy:is(:hover, :focus-visible) { color:var(--dp-hand, #f2b950) !important; outline:none !important; }
${W} .sx-modrow .sx-modrow__buy:disabled { color:rgb(${BONE} / .45) !important; }
${W} .sx-modrow .sx-modrow__lock { font-size:10.5px !important; color:rgb(${BONE} / .55) !important; }
${W} .sx-modrow.is-locked .sx-modrow__name { color:rgb(${BONE} / .6) !important; }
${W} .sx-modrow.is-eq .sx-modrow__name::after { content:"  fitted"; font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:9px;
  letter-spacing:.2em; text-transform:uppercase; color:rgb(${BONE} / .7); }

/* ---- the circuit: no plate; the core figure, the systems as readings ------------------------- */
${W} .sx-sw__side { ${PLAIN} position:relative; isolation:isolate; }
${W} .sx-sw__side::before { content:""; position:absolute; z-index:-1; inset:0; pointer-events:none; background:rgb(7 8 10 / .72);
  -webkit-mask-image:linear-gradient(90deg, transparent, #000 22%, #000 80%, transparent), linear-gradient(180deg, transparent, #000 8%, #000 92%, transparent);
  -webkit-mask-composite:source-in; mask-image:linear-gradient(90deg, transparent, #000 22%, #000 80%, transparent), linear-gradient(180deg, transparent, #000 8%, #000 92%, transparent);
  mask-composite:intersect; }
${W} .sx-sw-circuit__identity { ${LABEL} font-size:10px !important; letter-spacing:.22em !important; color:rgb(${BONE} / .72) !important; }
${W} .sx-sw-circuit__sub { color:rgb(${BONE} / .55) !important; text-transform:none; letter-spacing:.04em; }
${W} .sx-sw-circuit__core { position:relative; width:176px; height:118px; margin:6px 0 10px !important; display:block !important; }
${W} .sx-sw-circuit__core .orr-power { position:absolute; inset:0; width:176px; height:118px; overflow:visible; }
${W} .orr-power path { fill:none; }
${W} .sx-sw-circuit__core .orr-power .orr-power__track { stroke:rgb(${BONE} / .2) !important; stroke-width:3; fill:none !important; }
${W} .orr-power__ticks { stroke:rgb(${BONE} / .42); stroke-width:1; }
${W} .orr-power__lit { stroke:rgb(248 244 234); stroke-width:3; }
${W} .orr-power__notch { stroke:rgb(7 8 10); stroke-width:2; }
${W} .orr-power.is-over .orr-power__lit { stroke:var(--dp-danger, #ff5038); }
${W} .orr-power__ghost { stroke:var(--dp-ice, #8fcbff); stroke-width:1.6; stroke-dasharray:4 3; }
${W} .orr-power__ghost.is-over { stroke:var(--dp-danger, #ff5038); }
${W} .sx-sw-circuit__core .k-hero__n { position:absolute; left:0; right:0; top:44px; text-align:center; line-height:1 !important; }
${W} .sx-sw-circuit__core .k-hero__w { position:absolute; left:0; right:0; top:88px; text-align:center; }
${W} .sx-sw-circuit__core .k-hero__n { font-family:var(--dp-face-display, "Archivo") !important; font-stretch:100% !important; font-variation-settings:"wdth" 100, "wght" 500 !important;
  font-size:34px !important; color:rgb(248 244 234) !important; text-shadow:none !important; }
${W} .sx-sw-circuit__core .k-hero__w { ${LABEL} font-size:9.5px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .62) !important; }
${W} :is(.sx-sw-flow, .sx-sw-rack__cell) { ${PLAIN} padding:5px 0 !important; min-height:0 !important; }
${W} .sx-sw-flow { display:grid !important; grid-template-columns:minmax(0, 1fr) 84px 56px; align-items:baseline; column-gap:6px; }
${W} .sx-sw-flow .sx-sw-flow__copy { grid-column:1 / 3; display:flex !important; flex-direction:row !important; justify-content:space-between; align-items:baseline; gap:8px; min-width:0; }
${W} .sx-sw-flow .sx-sw-flow__copy > .k-row__sub { text-align:right; flex:none; font-variant-numeric:tabular-nums; white-space:nowrap !important; overflow:visible !important; text-overflow:clip !important; max-width:none !important; }
${W} .sx-sw-flow > .k-row__num { grid-column:3; text-align:right; }
${W} .sx-sw-rack { margin-top:16px !important; padding-top:12px !important; border-top:1px solid rgb(${BONE} / .14) !important; }
${W} .sx-sw-circuit__acts:has(.sx-sw-circuit__active) { display:none !important; }
${W} .sx-sw-circuit__instruction { font-size:12.5px !important; color:rgb(${BONE} / .62) !important; }
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
