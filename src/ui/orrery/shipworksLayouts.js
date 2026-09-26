// ORRERY composition for the station Shipworks (design/frontend/ORRERY.md §6 Station, Shipworks): the
// hull on its stage with its systems called out as words on leaders (the refit's law: no label boxes,
// the amber Hand only on the chosen slot), the fleet on a rail with the Hand, the handling as scales
// of light, the circuit as a column of readings. It styles the shared stage's existing nodes in the
// dock host only (`.orr-station .sx-sw`; THE SHIP keeps its own sheet) and pins nothing.
import { injectOrrery } from './tokens.js';
import { SCROLL_EXTENT_CSS } from './scrollExtent.js';
import { arcD, polar, ticksD } from './svg.js';

const f2 = (n) => Math.round(n * 100) / 100;
/**
 * The power circuit as one dial: the core's capacity is the arc, the continuous draw is lit along
 * it system by system with a notch between each, and the quarter ticks read the scale. The hull's
 * systems stand round the arc as engraved words on ticks -- bright where a module is fitted, dim
 * where the slot is empty -- so the dial says what the seven-row table used to.
 */
export function powerDialSvg({ cap = 0, draws = [], ghost = null, systems = [] } = {}) {
  const w = 232; const h = 150; const cx = 116; const cy = 86; const r = 58; const from = -128; const to = 128;
  const span = to - from;
  const capacity = Math.max(1, Number(cap) || 0);
  let at = from;
  let lit = '';
  let litBloom = '';
  let notches = '';
  for (const [, draw] of draws) {
    const d = Math.max(0, Number(draw) || 0);
    if (d <= 0) continue;
    const end = Math.min(to, at + span * (d / capacity));
    lit += `<path class="orr-power__lit" d="${arcD(cx, cy, r, at, end)}"/>`;
    litBloom += `<path class="orr-power__lit-bloom" d="${arcD(cx, cy, r, at, end)}"/>`;
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
  // the systems round the arc: a segment each on an outer ring (lit when fitted, mid for a stock fit, faint when
  // empty), a tick on the scale, the word outside it
  let sys = '';
  const list = Array.isArray(systems) ? systems.filter(Boolean) : [];
  const n = list.length;
  list.forEach((s, i) => {
    const a0 = from + (span * i) / n + 2.5;
    const a1 = from + (span * (i + 1)) / n - 2.5;
    const segState = s.stock ? 'is-stock' : (s.fitted > 0 ? 'is-fitted' : 'is-empty');
    if (a1 > a0) {
      if (segState !== 'is-empty') sys += `<path class="orr-power__seg-bloom ${segState}" d="${arcD(cx, cy, r + 7, a0, a1)}"/>`;
      sys += `<path class="orr-power__seg ${segState}" d="${arcD(cx, cy, r + 7, a0, a1)}"/>`;
    }
    const a = from + (span * (i + 0.5)) / n;
    const [tx0, ty0] = polar(cx, cy, r + 11, a);
    const [tx1, ty1] = polar(cx, cy, r + 14, a);
    const [lx, ly] = polar(cx, cy, r + 16, a);
    const cos = Math.cos(((a - 90) * Math.PI) / 180);
    const anchor = Math.abs(cos) < 0.34 ? 'middle' : (cos > 0 ? 'start' : 'end');
    const state = s.stock ? 'is-stock' : (s.fitted > 0 ? 'is-fitted' : 'is-empty');
    const word = String(s.label || s.type || '').toUpperCase();
    const count = s.available > 1 ? ` ${s.fitted}/${s.available}` : '';
    sys += `<path class="orr-power__sys ${state}" d="M ${f2(tx0)} ${f2(ty0)} L ${f2(tx1)} ${f2(ty1)}"/>`
      + `<text class="orr-power__syslabel ${state}" x="${f2(lx)}" y="${f2(ly + 3)}" text-anchor="${anchor}">${escapeXml(word)}${escapeXml(count)}</text>`;
  });
  // the words ride outside the arc, so the ink box is wider than the drawing: the viewBox carries
  // their reach (measured -18..267 on a 0..232 dial) or the rail's clip takes the first letters
  return `<svg class="orr-power${over ? ' is-over' : ''}" viewBox="-24 0 ${w + 64} ${h}" aria-hidden="true" focusable="false">`
    + `<path class="orr-power__band" d="${arcD(cx, cy, r, from, to)}"/>`
    + `<path class="orr-power__track" d="${arcD(cx, cy, r, from, to)}"/>`
    + `<path class="orr-power__ticks" d="${ticksD(cx, cy, r + 4, 4, { len: 5, from, to, inward: false })}"/>`
    + litBloom + lit + (notches ? `<path class="orr-power__notch" d="${notches}"/>` : '')
    + (at > from ? (() => { const [bx, by] = polar(cx, cy, r, at); return `<circle class="orr-power__bead-bloom" cx="${f2(bx)}" cy="${f2(by)}" r="7.5"/><circle class="orr-power__bead" cx="${f2(bx)}" cy="${f2(by)}" r="3.8"/>`; })() : '')
    + ghostArc + sys
    + `</svg>`;
}
const escapeXml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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
  ${W}.orr-sw--jig .sx-sw__stage .sx-sw__delta.sx-sw__delta, ${W}.orr-sw--jig .sx-sw__stage .sx-sw__delta.sx-sw__delta:not([hidden]) { display:none !important; }
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
${W}.is-choosing .sx-sw-circuit__instruction { visibility:hidden !important; }
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
  margin-top:-7px !important; ${HAND} background:var(--dp-hand, #f2b950) !important; filter:drop-shadow(0 0 5px rgb(242 185 80 / .55)); }
${W} .sx-sw__list:is(:focus-within, :hover) .sx-sw-row:is(.is-active, .is-selected, .is-viewed, [aria-pressed='true'], [aria-current='true'])::before { background:var(--dp-hand-hot, #ffd98c) !important;
  filter:drop-shadow(0 0 7px rgb(255 217 140 / .75)); }
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
${W} .sx-chooser__kicker { ${LABEL} font-size:9px !important; letter-spacing:.14em !important; line-height:1.5 !important; color:rgb(${BONE} / .66) !important; margin:10px 0 2px !important; }
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
${W} .sx-modrow .sx-modrow__meta .sx-modrow__chip:first-of-type::before { content:"\\A"; white-space:pre; }
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
/* the core borrows the side's padding: the dial's words ride past the drawing, so the box must be
   wider than the content column or the rail's clip eats the first and last letters */
${W} .sx-sw-circuit__core { position:relative; width:auto; height:118px; margin:6px -28px 10px !important; display:block !important; }
${W} .sx-sw-circuit__core .orr-power { position:absolute; inset:0; width:auto; height:auto; overflow:visible; }
${W} .orr-power path { fill:none; }
${W} .sx-sw-circuit__core .orr-power .orr-power__track { stroke:rgb(${BONE} / .2) !important; stroke-width:3; fill:none !important; }
${W} .orr-power__ticks { stroke:rgb(${BONE} / .42); stroke-width:1; }
${W} .orr-power__lit { stroke:rgb(248 244 234); stroke-width:3; }
${W} .orr-power__notch { stroke:rgb(7 8 10); stroke-width:2; }
${W} .orr-power.is-over .orr-power__lit { stroke:var(--dp-danger, #ff5038); }
${W} .orr-power__ghost { stroke:var(--dp-ice, #8fcbff); stroke-width:1.6; stroke-dasharray:4 3; }
${W} .orr-power__ghost.is-over { stroke:var(--dp-danger, #ff5038); }
/* the dial sits at 47.3% of the widened box (its viewBox pads left less than right): the number
   and the word centre on the dial, not the box */
${W} .sx-sw-circuit__core .k-hero__n { position:absolute; left:0; right:5.4%; top:44px; text-align:center; line-height:1 !important; }
${W} .sx-sw-circuit__core .k-hero__w { position:absolute; left:0; right:5.4%; top:88px; text-align:center; }
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

/* ================================ ROUND 6 ==================================================== */
/* the ship's name: a word, never a link at rest */
${W} .sx-sw__name .sf-entity-link, ${W} .sx-sw-side__name .sf-entity-link { text-decoration:none !important; background-image:none !important; border-bottom:0 !important; color:inherit !important; }
${W} :is(.sx-sw__name, .sx-sw-side__name) .sf-entity-link:is(:hover, :focus-visible) { text-decoration:underline 1px rgb(${BONE} / .45) !important; text-underline-offset:6px; outline:none !important; }
/* the hero numeral: top speed, thin and huge; the other figures stay readings */
${W} .sx-sw-hero[data-band='handling'] .k-hero__n { font-size:clamp(44px, 5.4vh, 64px) !important; font-variation-settings:"wdth" 100, "wght" 300 !important; font-weight:300 !important;
  letter-spacing:-.01em !important; white-space:nowrap; }
${W}.orr-sw--jig .sx-sw-hero[data-band='handling'] .k-hero__n { font-size:clamp(40px, 5vh, 58px) !important; }
${W} .sx-sw-hero[data-band='handling'] { grid-column:1 / -1; }
/* the screen's verbs: a footer row under the readings (the apron pins the rack after the stats);
   on the jig, where the readings stand in the left column, the verbs stand at that column's foot */
${W} .sx-sw-verbs { position:static !important; flex:0 0 auto !important; width:auto !important; display:flex !important; flex-direction:row !important; flex-wrap:wrap;
  gap:2px 18px !important; margin:8px 0 0 !important; max-width:none !important; }
${W}.orr-sw--jig .sx-sw-verbs { position:absolute !important; left:0 !important; top:auto !important; right:auto !important; bottom:24px !important; z-index:5; width:250px !important;
  flex-direction:column !important; align-items:flex-start !important; gap:6px !important; margin:0 !important; }
${W} .sx-sw-bands { display:flex !important; flex-wrap:wrap; gap:10px 28px !important; align-items:flex-end; }
${W}.orr-sw--jig .sx-sw-bands { display:grid !important; grid-template-columns:1fr 1fr; gap:10px 18px !important; align-items:end; }
${W}.orr-sw--jig .sx-sw__stats { width:250px !important; top:150px !important; max-height:calc(100% - 160px) !important; }
${W}.orr-sw--jig .sx-sw-bar { grid-template-columns:62px minmax(0, 1fr) auto; }
${W} .sx-sw-bar__track { height:9px !important; background:linear-gradient(rgb(${BONE} / .26), rgb(${BONE} / .26)) 0 50% / 100% 1px no-repeat,
  repeating-linear-gradient(90deg, rgb(${BONE} / .36) 0 1px, transparent 1px 10%) 0 50% / 100% 9px no-repeat !important; }
${W} .sx-sw-bar__track > .k-bar__fill { height:3px !important; margin-top:-1.5px; }
/* the chooser: one line per module at rest; the one in hand unfolds; the Hand is on the hull */
${W} .sx-modrow { padding:7px 0 7px 26px !important; }
${W} .sx-modrow .sx-modrow__body { gap:2px; }
${W} .sx-modrow .sx-modrow__role:not(.k-38) { display:none !important; }
${W} .sx-modrow:is(:focus-within, :hover) .sx-modrow__role:not(.k-38) { display:block !important; }
${W} .sx-modrow:is(:focus-within, :hover)::before { background:rgb(248 244 234) !important; }
${W} .sx-modrow .sx-modrow__meta .sx-modrow__chip:first-of-type::before { content:none !important; display:none !important; }
${W} .sx-modrow .sx-modrow__meta .sx-modrow__chips { display:block; margin-top:4px; }
${W} .sx-modrow .sx-modrow__meta .sx-modrow__chip { display:inline-block; margin-right:10px; }
${W} .sx-sw-verbs { align-self:flex-start !important; justify-content:flex-start !important; margin-left:0 !important; }
/* the live hull on the stage: its picture dissolves into the bay; no frame, no drag caption */
${W} .sx-sw__stage.is-live > .sx-sw__canvas { -webkit-mask-image:radial-gradient(ellipse 58% 60% at 50% 50%, #000 36%, transparent 74%); mask-image:radial-gradient(ellipse 58% 60% at 50% 50%, #000 36%, transparent 74%); }
${W} .sx-sw__stage > .sx-sw__dragcue { display:none !important; }
${W} .sx-sw__camera { gap:0 14px !important; }
${W} .sx-modrow .sx-modrow__buy.k-word--primary { color:var(--dp-hand, #f2b950) !important; font-size:12px !important; letter-spacing:.18em !important; }
${W} .sx-modrow .sx-modrow__buy.k-word--primary::before { color:var(--dp-hand, #f2b950) !important; }
${W} .sx-modrow .sx-modrow__buy.k-word--primary small { color:rgb(255 217 140 / .85) !important; }
${W} .sx-modrow .sx-modrow__buy.k-word--primary:is(:hover, :focus-visible) { color:var(--dp-hand-hot, #ffd98c) !important; text-shadow:0 0 18px rgb(255 217 140 / .45); }
${W} .sx-chooser__kicker { white-space:normal !important; max-width:100%; }
${W} .sx-sw__chooser { -webkit-mask-image:linear-gradient(180deg, #000 calc(100% - 48px), transparent) !important; mask-image:linear-gradient(180deg, #000 calc(100% - 48px), transparent) !important;
  padding-bottom:48px !important; }
/* the picture on the stage: a rendered hull dissolves into the bay; no frame, no toolbar under it */
${W} .sx-sw__stage > .sx-sw__poster { -webkit-mask-image:radial-gradient(ellipse 60% 56% at 50% 52%, #000 38%, transparent 74%); mask-image:radial-gradient(ellipse 60% 56% at 50% 52%, #000 38%, transparent 74%); }
${W} .sx-sw__stage.has-poster:not(.is-live) > :is(.sx-sw__camera, .sx-sw__dragcue, .sx-sw__baylines) { display:none !important; }
/* For Sale: the reading is a ledger; the hull's name is the hero word, its price the figure */
${W} .sx-sw-side__name { display:block !important; margin:0 0 2px !important; font-family:var(--dp-face-display, "Archivo") !important; font-stretch:125%; font-variation-settings:"wdth" 125, "wght" 800 !important;
  font-weight:800 !important; font-size:30px !important; letter-spacing:.005em !important; line-height:1 !important; text-transform:uppercase; color:rgb(248 244 234) !important; }
${W} .sx-sw-side__hero { ${PLAIN} padding:0 !important; margin:8px 0 14px !important; min-height:0 !important; text-align:left; display:block !important; }
${W} .sx-sw-side__hero::before, ${W} .sx-sw-side__hero::after { display:none !important; }
${W} .sx-sw-side__hero .k-hero__n { display:block; font-family:var(--dp-face-display, "Archivo") !important; font-stretch:100% !important; font-variation-settings:"wdth" 100, "wght" 300 !important;
  font-weight:300 !important; font-size:48px !important; line-height:1 !important; letter-spacing:-.01em !important; color:rgb(248 244 234) !important; text-transform:none !important; text-shadow:none !important; }
${W} .sx-sw-side__hero .k-hero__w { ${LABEL} display:block; font-size:10px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .62) !important; margin-top:6px; }
${W} .sx-spec { ${PLAIN} }
${W} .sx-spec > li { ${PLAIN} display:grid !important; grid-template-columns:96px minmax(0, 1fr); column-gap:14px; align-items:baseline; padding:6px 0 !important; min-height:0 !important; }
${W} .sx-spec > li > .k-row__name { ${LABEL} font-size:9.5px !important; letter-spacing:.18em !important; color:rgb(${BONE} / .6) !important; }
${W} .sx-spec > li > .k-row__num { font-size:13px !important; color:rgb(248 244 234) !important; white-space:normal !important; text-align:left !important; justify-self:start; overflow:visible !important;
  text-overflow:clip !important; max-width:none !important; line-height:1.4; }
${W} .sx-buybar { ${PLAIN} margin-top:16px !important; }
${W} .sx-btn-ghost { ${PLAIN} ${LABEL} font-size:10.5px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .62) !important; padding:0 !important; }
/* the rack: two sockets on a short scale, a dashed ring where nothing is loaded */
${W} .sx-sw-rack { border-top:0 !important; margin-top:18px !important; padding-top:0 !important; }
${W} .sx-sw-rack__cells { display:flex !important; gap:0 22px !important; margin:6px 0 0 !important; }
${W} .sx-sw-rack__cell { ${PLAIN} display:flex !important; flex-direction:column; align-items:flex-start; gap:4px; padding:4px 0 !important; min-height:0 !important; cursor:pointer; width:auto !important; }
${W} .sx-sw-rack__cell::before { content:"" !important; display:block !important; position:static !important; width:16px !important; height:16px !important; border-radius:50% !important;
  border:1.4px dashed rgb(${BONE} / .6) !important; background:none !important; box-shadow:none !important; transform:none !important; clip-path:none !important; margin:0 !important; }
${W} .sx-sw-rack__cell:not(.is-empty)::before { border:5px solid rgb(248 244 234) !important; }
${W} .sx-sw-rack__cell::after { display:none !important; }
${W} .sx-sw-rack__cell .k-row__num { ${LABEL} order:-1; font-size:9px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .55) !important; text-align:left; }
${W} .sx-sw-rack__cell .k-row__name { display:flex !important; flex-direction:column; font-size:11.5px !important; }
${W} .sx-sw-rack__cell .k-row__sub { font-size:10.5px !important; }
${W} .sx-sw-rack__cell:is(:hover, :focus-visible) { outline:none !important; }
${W} .sx-sw-rack__cell:is(:hover, :focus-visible)::before { border-color:var(--dp-hand, #f2b950) !important; }
${W} .sx-sw-rack__cell:is(:hover, :focus-visible) .k-row__name { color:var(--dp-hand-hot, #ffd98c) !important; }
/* the circuit: the dial says it all; the seven-row table and the instruction retire */
${W} .sx-sw-circuit__flows, ${W} .sx-sw-circuit__instruction { display:none !important; }
${W} .sx-sw-circuit__core, ${W} .sx-sw-circuit__core .orr-power { width:auto; height:150px; }
${W} .sx-sw-circuit__core .k-hero__n { top:60px; }
${W} .sx-sw-circuit__core .k-hero__w { top:104px; }
${W} .orr-power__sys { stroke:rgb(${BONE} / .42); stroke-width:1; }
${W} .orr-power__seg { fill:none; stroke:rgb(${BONE} / .2); stroke-width:2.5; }
${W} .orr-power__seg.is-fitted { stroke:rgb(248 244 234); }
${W} .orr-power__seg.is-stock { stroke:rgb(${BONE} / .7); }
${W} .orr-power__seg-bloom { fill:none; stroke:rgb(${BONE}); stroke-width:7; opacity:.18; }
${W} .orr-power__sys.is-fitted, ${W} .orr-power__sys.is-stock { stroke:rgb(248 244 234); stroke-width:1.4; }
${W} text.orr-power__syslabel { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:7.8px; letter-spacing:.06em; fill:rgb(${BONE} / .55); }
${W} text.orr-power__syslabel.is-fitted { fill:rgb(248 244 234); }
${W} text.orr-power__syslabel.is-stock { fill:rgb(${BONE} / .82); }
${W} .sx-sw-circuit__acts { margin-top:8px !important; }
@media (max-height:800px) {
  ${W}.orr-sw--jig .sx-sw__stats { top:132px !important; width:236px !important; max-height:calc(100% - 140px) !important; }
  /* a short screen: the verbs stand in a row at the stage's foot, left of the readings line */
  ${W}.orr-sw--jig .sx-sw-verbs { left:258px !important; bottom:40px !important; width:auto !important; flex-direction:row !important; gap:0 16px !important; }
  ${W}:not(.orr-sw--jig) .sx-sw__stage { flex:0 0 200px !important; min-height:200px !important; }
  ${W}:not(.orr-sw--jig) .sx-sw-verbs { margin-top:4px !important; }
  ${W} .sx-sw-band__meta, ${W} .sx-sw-band--presets { display:none !important; }
  ${W} .sx-sw-hero .k-hero__n { font-size:20px !important; }
  ${W} .sx-sw-hero[data-band='handling'] .k-hero__n, ${W}.orr-sw--jig .sx-sw-hero[data-band='handling'] .k-hero__n { font-size:40px !important; }
  ${W} .sx-sw-bar { padding:3px 0 !important; }
  ${W} .sx-sw-hero { padding:0 0 4px !important; }
  ${W}.orr-sw--jig .sx-sw-bands { gap:6px 14px !important; }
  ${W} .sx-sw-circuit__core, ${W} .sx-sw-circuit__core .orr-power { width:auto; height:130px; }
  ${W} .sx-sw-circuit__core .k-hero__n { top:50px; font-size:28px !important; }
  ${W} .sx-sw-circuit__core .k-hero__w { top:88px; }
  ${W} .sx-sw-side__name { font-size:24px !important; }
  ${W} .sx-sw-side__hero .k-hero__n { font-size:38px !important; }
  ${W} .sx-spec > li { padding:3px 0 !important; }
}

/* ================================ ROUND 7 ==================================================== */
/* the readouts: a ruled ladder in the right column, under the rack (one floor for every column) */
${W} .orr-sw-readouts.sx-sw__gauges { position:static !important; display:grid !important; grid-template-columns:1fr 1fr; gap:2px 22px !important; margin:18px 0 0 !important;
  padding:12px 0 0 !important; justify-content:start !important; white-space:normal; background:linear-gradient(90deg, rgb(${BONE} / .24), rgb(${BONE} / 0)) 0 0 / 100% 1px no-repeat !important; }
${W} .orr-sw-readouts .sx-sw-gauge { display:grid !important; grid-template-columns:1fr auto; column-gap:10px; padding:4px 0 !important; }
${W} .orr-sw-readouts .sx-sw-gauge .k-row__name { font-size:9.5px !important; letter-spacing:.14em !important; }
${W} .orr-sw-readouts .sx-sw-gauge .k-row__num { font-size:13px !important; text-align:right; }
${W} .orr-sw-readouts .sx-sw-gauge .sx-sw-ghost { color:var(--dp-ice, #8fcbff) !important; }
/* the proposed fit reads on the readouts' ghosts and the dial; the separate line retires */
${W}.orr-sw--jig .sx-sw__stage .sx-sw__delta, ${W}.orr-sw--jig .sx-sw__stage .sx-sw__delta:not([hidden]) { display:none !important; }
${W} .orr-sw-jig { inset:0 !important; }
/* the core's word stands inside the dial's foot */
${W} .sx-sw-circuit__core .k-hero__w { top:98px; font-size:8.5px !important; letter-spacing:.12em !important; }
/* the chooser: a scale with minor ticks; a bone tick (not a second Hand) on the row in hand */
${W} .sx-chooser__list { background:linear-gradient(90deg, transparent 7px, rgb(${BONE} / .24) 7px, rgb(${BONE} / .24) 8px, transparent 8px) 0 0 / 100% 100% no-repeat,
    repeating-linear-gradient(180deg, rgb(${BONE} / .2) 0 1px, transparent 1px 8px) 4px 0 / 4px 100% no-repeat !important; }
${W} .sx-modrow:is(:focus-within, :hover)::before { left:2px !important; top:16px !important; width:11px !important; height:2px !important; margin-top:0 !important; clip-path:none !important;
  background:rgb(248 244 234) !important; }
/* the Lamp Key on the primary verbs: the chooser's fit, and at rest the range */
${W} .sx-modrow .sx-modrow__buy.orr-lampkey { display:inline-flex !important; padding:0 22px 0 18px !important; min-height:38px !important; font-size:13px !important; letter-spacing:.14em !important;
  color:#1c1406 !important; background:none !important; background-image:none !important; text-shadow:none !important; margin-top:6px; }
/* the row's chevron rule resets the pseudo with all:unset, so the key's field is declared again here */
${W} .sx-modrow .sx-modrow__buy.orr-lampkey::before, ${W} .sx-sw-verb.orr-lampkey::before { all:unset !important; content:"" !important; display:block !important; position:absolute !important;
  inset:0 !important; z-index:-1 !important; background:var(--dp-hand, #f2b950) !important; clip-path:polygon(0 0, calc(100% - 13px) 0, 100% 13px, 100% 100%, 0 100%) !important; }
${W} .sx-modrow .sx-modrow__buy.orr-lampkey:not(:disabled):is(:hover, :focus-visible)::before, ${W} .sx-sw-verb.orr-lampkey:not(:disabled):is(:hover, :focus-visible)::before { background:var(--dp-hand-hot, #ffd98c) !important; }
${W} .sx-modrow .sx-modrow__buy.orr-lampkey:disabled::before, ${W} .sx-sw-verb.orr-lampkey:disabled::before { background:rgb(${BONE} / .3) !important; }
${W} .sx-modrow .sx-modrow__buy.orr-lampkey::after, ${W} .sx-sw-verb.orr-lampkey::after { display:block !important; }
${W} .sx-modrow .sx-modrow__buy.orr-lampkey > .orr-lampkey__word, ${W} .sx-sw-verb.orr-lampkey > .orr-lampkey__word { position:relative; z-index:1; }
${W} .sx-modrow .sx-modrow__buy.orr-lampkey small { color:#3a2c0a !important; margin-left:10px; }
${W} .sx-modrow .sx-modrow__buy.orr-lampkey:is(:hover, :focus-visible) { color:#1c1406 !important; text-shadow:none !important; }
${W} .sx-sw-verb.orr-lampkey { display:inline-flex !important; padding:0 22px 0 18px !important; min-height:38px !important; font-size:12.5px !important; letter-spacing:.16em !important;
  color:#1c1406 !important; background:none !important; text-shadow:none !important; }
${W} .sx-sw-verb.orr-lampkey:is(:hover, :focus-visible) { color:#1c1406 !important; }
${W} .sx-sw-verb.orr-lampkey { position:relative !important; isolation:isolate; overflow:visible !important; }
${W} .sx-modrow .sx-modrow__buy.orr-lampkey { position:relative !important; isolation:isolate; overflow:visible !important; align-items:center !important; }
${W}.orr-sw--jig .sx-sw-verbs { gap:10px !important; }
/* a fit verb with nothing chosen says nothing: the nodes are the choice */
${W}.orr-sw--jig .sx-sw-verb[data-fit-action="fit-slot"]:disabled { display:none !important; }
${W}.sx-sw--buying .sx-sw-verb[data-fit-action="fit-slot"] { display:none !important; }
/* the hull spec lists one hardpoint per line */
${W} .sx-spec > li > .k-row__num { line-height:1.5; }
/* a deeper pool under the right column, so the engraved words hold against the lit set */
${W} .sx-sw__side::before { background:rgb(7 8 10 / .84); }
@media (max-height:800px) {
  ${W} .orr-sw-readouts.sx-sw__gauges { grid-template-columns:1fr 1fr 1fr; gap:0 14px !important; margin-top:10px !important; padding-top:8px !important; }
  ${W} .orr-sw-readouts .sx-sw-gauge { padding:2px 0 !important; }
  ${W} .sx-sw-verb.orr-lampkey { min-height:34px !important; font-size:11.5px !important; }
}

/* ================================ ROUND 8 ==================================================== */
/* the readouts: one ruled ledger column (name left, figure right); a name never truncates */
${W} .orr-sw-readouts.sx-sw__gauges { grid-template-columns:1fr !important; gap:0 !important; width:100% !important; max-width:none !important; min-width:0 !important; }
${W} .orr-sw-readouts .sx-sw-gauge { grid-template-columns:auto minmax(0, 1fr) !important; column-gap:12px; padding:4px 0 !important; align-items:baseline !important; }
${W} .orr-sw-readouts .sx-sw-gauge .k-row__name { overflow:visible !important; text-overflow:clip !important; white-space:nowrap !important; max-width:none !important; min-width:0; }
${W} .orr-sw-readouts .sx-sw-gauge .k-row__num { justify-self:end; white-space:nowrap; }
/* For Sale: the hardpoints one per line; the rendered hull lit as an object on the jig, not a shadow in the bay */
${W} .sx-spec__hp { display:block; white-space:nowrap; }
${W} .sx-sw__stage > .sx-sw__poster { filter:brightness(1.32) contrast(1.06); }
${W} .sx-sw__stage.has-poster:not(.is-live)::before { content:""; position:absolute; left:14%; right:14%; top:14%; bottom:16%; z-index:0; pointer-events:none;
  background:radial-gradient(ellipse at 50% 56%, rgb(${BONE} / .15), rgb(${BONE} / .05) 42%, transparent 68%); }
@media (max-height:800px) {
  /* a 720-tall stage: six stacked cells in three columns; the dial and the rack close up to give them a floor */
  ${W} .orr-sw-readouts.sx-sw__gauges { grid-template-columns:1fr 1fr 1fr !important; gap:1px 10px !important; margin-top:8px !important; padding-top:5px !important; }
  ${W} .orr-sw-readouts .sx-sw-gauge { grid-template-columns:1fr !important; padding:1px 0 !important; row-gap:0; }
  ${W} .orr-sw-readouts .sx-sw-gauge .k-row__name { font-size:8px !important; letter-spacing:.12em !important; line-height:1.1; }
  ${W} .orr-sw-readouts .sx-sw-gauge .k-row__num { font-size:12px !important; justify-self:start; text-align:left; line-height:1.15; }
  ${W} .sx-sw-circuit__core, ${W} .sx-sw-circuit__core .orr-power { width:auto; height:119px; }
  ${W} .sx-sw-circuit__core { margin:4px -28px !important; }
  ${W} .sx-sw-circuit__core .k-hero__n { top:45px; font-size:26px !important; }
  ${W} .sx-sw-circuit__core .k-hero__w { top:80px; }
  ${W} .sx-sw-rack { margin-top:8px !important; }
  ${W} .sx-sw-rack__cells { margin-top:4px !important; }
  ${W} .sx-sw-rack__cell.is-empty .k-row__sub { display:none !important; }
  /* For Sale at 720 tall: the hardpoints run inline and the handling closes up so the Buy key keeps its floor */
  ${W} .sx-spec__hp { display:inline; }
  ${W} .sx-spec__hp:not(:last-child)::after { content:" · "; color:rgb(${BONE} / .45); }
  ${W}.sx-sw--buying .sx-spec > li { padding:2px 0 !important; }
  ${W}.sx-sw--buying .sx-sw-bar { padding:2px 0 !important; }
  ${W}.sx-sw--buying .sx-sw-hero[data-band='handling'] .k-hero__n { font-size:38px !important; }
  ${W}.sx-sw--buying .sx-sw-band__meta { display:none !important; }
}

/* ---- round 8b: the 720-tall readouts as two ledger columns (a ghost never pushes a column off the page) ---- */
@media (max-height:800px) {
  ${W} .orr-sw-readouts.sx-sw__gauges { grid-template-columns:minmax(0, 1fr) minmax(0, 1fr) !important; gap:0 12px !important; padding-top:5px !important; }
  ${W} .orr-sw-readouts .sx-sw-gauge { grid-template-columns:auto minmax(0, 1fr) !important; column-gap:8px; padding:2px 0 !important; align-items:baseline !important; }
  ${W} .orr-sw-readouts .sx-sw-gauge .k-row__name { font-size:8px !important; letter-spacing:.12em !important; line-height:1.2; }
  ${W} .orr-sw-readouts .sx-sw-gauge .k-row__num { font-size:11.5px !important; justify-self:end !important; text-align:right !important; line-height:1.2; white-space:nowrap; }
  ${W} .orr-sw-readouts .sx-sw-gauge .sx-sw-ghost { font-size:10px !important; }
  /* a ghosted reading (18t → 20t) must still fit beside its name in a 114px cell */
  ${W} .orr-sw-readouts .sx-sw-gauge { column-gap:6px !important; }
  ${W} .orr-sw-readouts .sx-sw-gauge .k-row__name { font-size:7.5px !important; letter-spacing:.1em !important; }
  ${W} .orr-sw-readouts .sx-sw-gauge .k-row__num { font-size:11px !important; }
  /* the column's foot fade must not dim the last reading */
  ${W} .sx-sw__side { -webkit-mask-image:linear-gradient(180deg, #000 calc(100% - 10px), transparent) !important; mask-image:linear-gradient(180deg, #000 calc(100% - 10px), transparent) !important; }
  /* For Sale at 720 tall: the price a little smaller, the spec tighter, the handling closes up under the render */
  ${W}.sx-sw--buying .sx-sw-side__hero .k-hero__n { font-size:32px !important; }
  ${W}.sx-sw--buying .sx-sw-side__hero { margin:6px 0 10px !important; }
  ${W}.sx-sw--buying .sx-spec > li > .k-row__num { line-height:1.3 !important; }
  ${W}.sx-sw--buying .sx-buybar { margin-top:8px !important; }
  ${W}.sx-sw--buying .sx-sw-bar { padding:0 !important; }
  ${W}.sx-sw--buying .sx-sw-hero { padding:0 0 4px !important; }
  ${W}.sx-sw--buying .sx-sw-bands { gap:6px 28px !important; }
}

${W} .orr-lampkey:disabled::after { display:block !important; }

/* ================================ ROUND 9 ==================================================== */
${SCROLL_EXTENT_CSS}
/* a fitted column wears no fold: the fade only stands over a list that overflows */
${W} .sx-sw__side, ${W} .sx-sw__stats { -webkit-mask-image:none !important; mask-image:none !important; }
${W} .sx-sw__chooser[data-overflow="0"], ${W} .sx-sw__list[data-overflow="0"] { -webkit-mask-image:none !important; mask-image:none !important; }
/* For Sale: the price is the number; the stage's second title goes; the render sits on a contact shadow */
${W}.sx-sw--buying .sx-sw__stage > .sx-sw__nameplate { display:none !important; }
${W}.sx-sw--buying .sx-sw-side__hero .k-hero__n { font-size:clamp(56px, 7vh, 76px) !important; letter-spacing:-.02em !important; white-space:nowrap; }
${W}.sx-sw--buying .sx-sw-hero[data-band='handling'] .k-hero__n { font-size:40px !important; }
${W} .sx-sw__stage.has-poster:not(.is-live)::after { content:""; position:absolute; left:26%; right:26%; bottom:20%; height:9%; z-index:0; pointer-events:none;
  background:radial-gradient(ellipse at 50% 50%, rgb(0 0 0 / .55), rgb(0 0 0 / .2) 55%, transparent 75%); }
/* one Lamp Key height; the price rides the Buy key as it rides Buy & Fit */
${W} .sx-buybar .orr-lampkey, ${W} .sx-buybar .sx-btn-primary.orr-lampkey { min-height:38px !important; padding:0 22px 0 18px !important; font-size:13px !important; letter-spacing:.14em !important; }
${W} .sx-buybar .orr-lampkey small { color:#3a2c0a !important; margin-left:10px; font-size:12px; font-weight:650; }
/* an empty socket says nothing twice */
${W} .sx-sw-rack__cell.is-empty .k-row__sub { display:none !important; }
/* a name is ink; only a moving figure is ice */
${W} .orr-sw-node.is-preview .orr-sw-node__name { color:rgb(248 244 234) !important; }
${W} .orr-sw-node.is-preview .orr-sw-node__state { color:rgb(${BONE} / .62) !important; }
/* the hardpoint separator stays with its item, so a wrap starts on an item */
${W} .sx-spec__hp:not(:last-child)::after { content:none !important; }
@media (max-height:800px) {
  /* Save fit stays reachable at 720: the band folds to its verb */
  ${W} .sx-sw-band--presets { display:block !important; }
  ${W} .sx-sw-band--presets > .sx-sw-band__label, ${W} .sx-sw-band--presets .sx-sw-preset:not(.sx-sw-preset--save) { display:none !important; }
}

/* the readouts are a fitted column: no fold across the last row */
${W} .orr-sw-readouts { -webkit-mask-image:none !important; mask-image:none !important; }

/* ================================ ROUND 10 =================================================== */
/* the price fits its column against the widest catalogue price; never wider than the gutter */
${W}.sx-sw--buying .sx-sw-side__hero .k-hero__n { font-size:clamp(40px, 3.1vw, 60px) !important; }
/* the dial is bigger, its words at label size with the ticks; at 720 the ticks alone say it */
${W} .sx-sw-circuit__core, ${W} .sx-sw-circuit__core .orr-power { width:240px; height:155px; }
${W} .sx-sw-circuit__core .k-hero__n { top:62px; }
${W} .sx-sw-circuit__core .k-hero__w { top:104px; }
/* the hardpoint list: inline with a separator only on a short screen; one per line otherwise, nothing dangling */
@media (max-height:800px) {
  ${W} .sx-spec__hp:not(:last-child)::after { content:"\\00a0\\b7 " !important; color:rgb(${BONE} / .45); }
  ${W} text.orr-power__syslabel { display:none; }
  ${W} .sx-sw-circuit__core, ${W} .sx-sw-circuit__core .orr-power { width:184px; height:119px; }
  ${W} .sx-sw-circuit__core .k-hero__n { top:44px; }
  ${W} .sx-sw-circuit__core .k-hero__w { top:82px; }
}
/* an empty rack socket is its ring; the header already counts them */
${W} .sx-sw-rack__cell.is-empty .k-row__name { display:none !important; }
${W} .sx-sw-rack__cell.is-empty { flex-direction:row !important; align-items:center !important; gap:8px; }
/* a loss is dim bone with its sign; ice is the moving figure that gains */
${W} .sx-modrow :is(.k-bad, .is-loss, .sx-modrow__chip.is-down) { color:rgb(${BONE} / .62) !important; }
/* the chosen module reads as a hero: its lead figure at reading size, the rest at label size */
${W} .sx-modrow:focus-within .sx-modrow__metrics { display:flex !important; flex-wrap:wrap; align-items:baseline; gap:2px 14px; margin-top:4px; }
${W} .sx-modrow:focus-within .sx-modrow__metric:first-child { display:flex; flex-direction:column-reverse; flex-basis:100%; gap:0; margin-bottom:2px; }
${W} .sx-modrow:focus-within .sx-modrow__metric:first-child b { font-family:var(--dp-face-display, "Archivo") !important; font-stretch:100%; font-variation-settings:"wdth" 100, "wght" 250 !important; font-weight:250 !important;
  font-size:46px !important; line-height:1 !important; letter-spacing:-.01em; color:rgb(248 244 234) !important; }
${W} .sx-modrow:focus-within .sx-modrow__metric:first-child i { ${LABEL} font-style:normal; font-size:9.5px !important; letter-spacing:.18em !important; color:rgb(${BONE} / .6) !important; }
${W} .sx-modrow .sx-modrow__metric i { font-style:normal; }
/* the chooser's list runs to the rail on a short screen; the fold sits on its last visible row */
@media (max-height:800px) {
  ${W} .sx-sw__chooser { height:100% !important; max-height:none !important; }
  ${W} .sx-chooser__list { flex:1 1 auto !important; min-height:0 !important; max-height:none !important; overflow:hidden auto !important; }
  ${W} .sx-chooser__list[data-overflow="1"] { -webkit-mask-image:linear-gradient(180deg, #000 calc(100% - 36px), transparent) !important; mask-image:linear-gradient(180deg, #000 calc(100% - 36px), transparent) !important; }
  ${W} .sx-chooser__list[data-overflow="0"] { -webkit-mask-image:none !important; mask-image:none !important; }
  ${W} .sx-sw__chooser { -webkit-mask-image:none !important; mask-image:none !important; }
}
/* For Sale: the stats stand under the render; at 720 the render fills the stage */
${W}.sx-sw--buying.orr-sw--jig .sx-sw__stats, ${W}.sx-sw--buying .sx-sw__stats { left:50% !important; right:auto !important; transform:translateX(-50%); top:auto !important; bottom:4% !important; width:min(520px, 80%) !important; max-height:none !important; }
@media (max-height:800px) {
  ${W}.sx-sw--buying .sx-sw__stage:not(.has-salering) > .sx-sw__poster { max-height:92% !important; height:92% !important; width:auto !important; max-width:none !important; }
  ${W}.sx-sw--buying .sx-sw__stats { bottom:2% !important; width:min(460px, 84%) !important; }
}
/* one width for the handling scales wherever they stand */
${W} .sx-sw-bands { display:grid !important; grid-template-columns:repeat(2, minmax(0, 200px)) !important; gap:10px 24px !important; align-items:end; }
${W} .sx-sw-bar { display:grid !important; grid-template-columns:62px minmax(0, 1fr) auto !important; align-items:center; column-gap:10px; }
/* the label floor at 720 is 11px: no tracked 8px caps */
@media (max-height:800px) {
  ${W} .orr-sw-readouts .sx-sw-gauge .k-row__name { font-size:10px !important; letter-spacing:.08em !important; }
  ${W} .sx-sw-gauge .k-row__name { font-size:10px !important; letter-spacing:.1em !important; }
  ${W} .sx-chooser__kicker { font-size:10.5px !important; letter-spacing:.12em !important; }
  ${W} .sx-spec > li > .k-row__name { font-size:10.5px !important; letter-spacing:.12em !important; }
  ${W} .sx-sw-side__hero .k-hero__w { font-size:10.5px !important; letter-spacing:.14em !important; }
}

/* the dial's words stay inside the column: the dial sits a little left of its axis on a tall screen */
/* the side column takes the width the dial's words need on a tall screen; the dial sits near its axis */
@media (min-height:801px) { ${W} .sx-sw-circuit__core { margin-left:0 !important; } }
/* a short screen: the chosen module's sentence folds so its key stays above the fold */
@media (max-height:800px) { ${W} .sx-modrow:focus-within .sx-modrow__meta { display:none !important; } }

/* ================================ ROUND 11 =================================================== */
/* the mode words carry no underline: weight says which is open */
${W} .sx-sw__mode .k-word::after, ${W} .sx-sw__modes .k-word::after, ${W} [data-sw-mode]::after, ${W} .sx-sw__hang > .k-words:first-child .k-word::after { display:none !important; }

/* ================================ ROUND 11b ================================================== */
/* the open mode word carries no bar under it: weight and light say which is open */
${W} .sx-sw__rail .sx-seg__btn.is-on { background-image:none !important; background:transparent !important; }
${W} .sx-sw__rail .sx-seg__btn { text-decoration:none !important; border-bottom:0 !important; }
/* For Sale at 720: the hardpoints run inline and WRAP; a clipped "1× I" is not a reading */
@media (max-height:800px) {
  ${W}.sx-sw--buying .sx-spec > li, ${W}.sx-sw--buying .sx-spec__hp { white-space:normal !important; }
  ${W}.sx-sw--buying .sx-spec > li { line-height:1.35 !important; }
}

@media (max-height:800px) { ${W}.sx-sw--buying .sx-sw-bar { display:none !important; } }

/* For Sale at 720: the hardpoints are inline blocks (they wrap between each other even with no spaces between them) */
@media (max-height:800px) {
  ${W}.sx-sw--buying .sx-spec__hp { display:inline-block !important; white-space:nowrap !important; margin:0 10px 2px 0 !important; }
  ${W}.sx-sw--buying .sx-spec__hp::after { content:none !important; }
  ${W}.sx-sw--buying .sx-spec > li > .k-row__num { white-space:normal !important; display:block !important; }
}

/* For Sale at 720: the hardpoints row takes the whole column — its label above, its values in two lines with dots */
@media (max-height:800px) {
  ${W}.sx-sw--buying .sx-spec > li:has(> .k-row__num > .sx-spec__hp) { display:block !important; padding:4px 0 2px !important; }
  ${W}.sx-sw--buying .sx-spec > li:has(> .k-row__num > .sx-spec__hp) > .k-row__name { display:block !important; margin-bottom:3px !important; }
  ${W}.sx-sw--buying .sx-spec > li:has(> .k-row__num > .sx-spec__hp) > .k-row__num { display:block !important; line-height:1.35 !important; }
  ${W}.sx-sw--buying .sx-spec__hp { display:inline !important; margin:0 !important; white-space:normal !important; }
  ${W}.sx-sw--buying .sx-spec__hp:not(:last-child)::after { content:"\\00a0\\00b7\\0020" !important; color:rgb(${BONE} / .45) !important; }
}

/* the value cell is a flex row under the kit: let it wrap, and let each hardpoint be its own item */
@media (max-height:800px) {
  ${W}.sx-sw--buying .sx-spec > li > .k-row__num { flex-wrap:wrap !important; row-gap:2px; column-gap:0; }
  ${W}.sx-sw--buying .sx-spec__hp { flex:none !important; }
}

/* the value cell took its text's natural width (441px in a 241px column): it is the column's width and wraps */
@media (max-height:800px) {
  ${W}.sx-sw--buying .sx-spec > li:has(> .k-row__num > .sx-spec__hp) > .k-row__num { width:auto !important; max-width:100% !important; min-width:0 !important; }
}

/* ================================ ROUND 12: one stage ring ==================================== */
${W} .sx-sw__stage > .sx-sw__salering { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; pointer-events:none; z-index:2; }
${W} .sx-sw__salering-ring { stroke:rgb(${BONE} / .32); }
${W} .sx-sw__salering-ticks { stroke:rgb(${BONE} / .22); }
${W} text.sx-sw__salering-cap { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-size:9.5px; font-weight:650; letter-spacing:.22em; fill:rgb(${BONE} / .66); }
/* the glass under the hull for sale: the ship separates from the hangar; the old bone wash goes */
${W} .sx-sw__stage.has-salering.has-poster:not(.is-live)::before { left:0 !important; right:0 !important; top:0 !important; bottom:0 !important; z-index:1 !important;
  background:radial-gradient(circle at var(--sw-ring-x, 50%) var(--sw-ring-y, 50%), rgb(6 8 11 / .62) 0, rgb(6 8 11 / .58) calc(var(--sw-ring-r, 280px) - 30px), rgb(6 8 11 / 0) calc(var(--sw-ring-r, 280px) + 40px)) !important; }
${W} .sx-sw__stage.has-salering > .sx-sw__poster { z-index:1; -webkit-mask-image:none !important; mask-image:none !important; }
/* the view words are marks on the ring's upper arc; the current one lit */
${W} .sx-sw__stage.has-salering .sx-sw__camera { position:absolute !important; left:0 !important; top:0 !important; right:auto !important; bottom:auto !important; width:0; height:0; margin:0 !important; padding:0 !important; overflow:visible; display:block !important; z-index:3; }
${W} .sx-sw__stage.has-salering .sx-sw__camera > li { position:absolute; left:0; top:0; }
${W} .sx-sw__stage.has-salering .sx-sw__camera [data-camera] { position:absolute; transform:translate(-50%, -50%); font-size:9px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .5) !important; white-space:nowrap; }
${W} .sx-sw__stage.has-salering .sx-sw__camera [data-camera].is-current { color:rgb(248 244 234) !important; }
${W} .sx-sw__stage.has-salering .sx-sw__camera [data-camera]::before { content:""; display:block; width:1.5px; height:8px; margin:0 auto 3px; background:rgb(${BONE} / .4); }
${W} .sx-sw__stage.has-salering .sx-sw__camera [data-camera].is-current::before { background:rgb(248 244 234); height:12px; }
/* the verbs' one home is seated by the screen under the ring; the rack carries no layout of its own there */
${W} .sx-sw-verbs { white-space:nowrap; }
/* the For Sale ladder folds its last rung when more hang below */
${W}.sx-sw--buying .sx-sw__list[data-overflow="1"] { -webkit-mask-image:linear-gradient(180deg, #000 calc(100% - 40px), transparent) !important; mask-image:linear-gradient(180deg, #000 calc(100% - 40px), transparent) !important; }
/* a short screen's chooser keeps the two delta lines and folds the sentence */
@media (max-height:800px) {
  ${W} .sx-modrow:focus-within .sx-modrow__meta { display:block !important; }
  ${W} .sx-modrow:focus-within .sx-modrow__meta .sx-modrow__sentence { display:none !important; }
}

/* a ghost for the worse is dim bone; ice is the gain's colour alone */
${W} .sx-sw-ghost.is-loss, ${W} .sx-sw-gauge .sx-sw-ghost.is-loss { color:rgb(146 143 135) !important; }

/* the glass under the hull for sale stands in every sale state, live render included */
${W} .sx-sw__stage.has-salering::before { content:""; position:absolute; left:0; right:0; top:0; bottom:0; z-index:1; pointer-events:none;
  background:radial-gradient(circle at var(--sw-ring-x, 50%) var(--sw-ring-y, 50%), rgb(6 8 11 / .62) 0, rgb(6 8 11 / .58) calc(var(--sw-ring-r, 280px) - 30px), rgb(6 8 11 / 0) calc(var(--sw-ring-r, 280px) + 40px)) !important; }
${W} .sx-sw__stage.has-salering > .sx-sw__canvas { z-index:1; }

/* For Sale: the stage stands full height (its readouts float over it), so the ring is the same dial the Fleet jig draws */
${W}.sx-sw--buying .sx-sw__stage { flex:1 1 auto !important; min-height:0 !important; height:auto !important; max-height:none !important; }

/* For Sale: the handling readouts float at the stage's lower left, clear of the ring, so the stage keeps its full height */
/* the For Sale readouts stand out of flow (so the stage keeps its full height); the screen seats them from the stage's box */
${W}.sx-sw--buying .sx-sw__stats { position:absolute !important; left:258px !important; right:auto !important; top:auto !important; bottom:14px !important; transform:none !important; width:220px !important; max-width:220px !important; z-index:3; }

${W} .sx-sw-side__hero .k-hero__n.orr-counter .orr-counter__digit { width:.56em; }

/* ================================ ROUND 13: the stage as instrument =========================== */
/* For Sale: the live hull alone on the ring's glass. The canvas is the dial's own square (the preview
   frames its hull to it), its black is lost in the glass under it, and its edge dissolves before the ring */
${W} .sx-sw__stage.has-salering > .sx-sw__canvas { inset:auto !important; left:calc(var(--sw-ring-x, 50%) - var(--sw-ring-r, 280px) * .93) !important; top:calc(var(--sw-ring-y, 50%) - var(--sw-ring-r, 280px) * .93) !important;
  width:calc(var(--sw-ring-r, 280px) * 1.86) !important; height:calc(var(--sw-ring-r, 280px) * 1.86) !important; mix-blend-mode:lighten;
  -webkit-mask-image:radial-gradient(circle closest-side, #000 calc(100% - 14px), transparent) !important; mask-image:radial-gradient(circle closest-side, #000 calc(100% - 14px), transparent) !important; }
/* the real-time hull is lit for a bay it no longer stands in: lifted to the render's exposure (the poster's own lift) */
${W} .sx-sw__stage.has-salering.is-live > .sx-sw__canvas { filter:brightness(1.6) contrast(1.04); }
/* the glass: full density out to the ring, gone 40px past it, in every sale state */
${W} .sx-sw__stage.has-salering::before, ${W} .sx-sw__stage.has-salering.has-poster:not(.is-live)::before {
  background:radial-gradient(circle at var(--sw-ring-x, 50%) var(--sw-ring-y, 50%), rgb(8 11 16 / .62) 0, rgb(8 11 16 / .62) var(--sw-ring-r, 280px), rgb(8 11 16 / 0) calc(var(--sw-ring-r, 280px) + 40px)) !important; }
/* the view marks: shown whenever a live hull exists or is on its way, the render still on the glass included */
${W} .sx-sw__stage.has-salering.has-viewmarks > .sx-sw__camera { display:block !important; visibility:visible !important; }
${W} .sx-sw__stage.has-salering:not(.has-viewmarks) > .sx-sw__camera { display:none !important; }
${W} .sx-sw__stage.has-salering .sx-sw__camera [data-camera] { transform:none !important; translate:none !important; scale:none !important; line-height:1 !important; }
${W} .sx-sw__stage.has-salering .sx-sw__camera [data-camera]::before { content:none !important; display:none !important; }
${W} .sx-sw__salering-mark { stroke:rgb(${BONE} / .5); }
${W} .sx-sw__salering-mark.is-current { stroke:rgb(248 244 234); }
/* the Fleet dial's caption where the jig could not engrave one */
${W} .sx-sw__stage > .sx-sw__fleetcap { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; pointer-events:none; z-index:2; }
${W} .sx-sw__fleetcap text.sx-sw__salering-cap, ${W} .sx-sw__salering text.sx-sw__salering-cap { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-size:9.5px; font-weight:650; letter-spacing:.22em; fill:rgb(${BONE} / .66); }
@media (max-height:800px) {
  ${W} .sx-sw__fleetcap text.sx-sw__salering-cap, ${W} .sx-sw__salering text.sx-sw__salering-cap { font-size:9px; letter-spacing:.18em; }
}
/* a short stage: the dial's foot, its caption and the verbs share 50px, so the jig's outer drifting ticks
   (which would cross the verb words) stand down there; the For Sale ring has none either */
@media (max-height:800px) { ${W} .orr-sw-jig .orr-drift { display:none !important; } }
/* one verb row in both modes: the words inline, centred on the dial by the screen */
${W}.orr-sw--jig .sx-sw-verbs, ${W}:not(.orr-sw--jig) .sx-sw-verbs { width:max-content !important; max-width:none !important; flex-direction:row !important; flex-wrap:nowrap !important;
  align-items:baseline !important; gap:0 18px !important; }
/* For Sale readouts: each pair on one line at the Fleet cell's size and width, their tops level */
${W}.sx-sw--buying .sx-sw-bands { grid-template-columns:96px 96px !important; column-gap:18px !important; align-items:start !important; }
${W}.sx-sw--buying .sx-sw-bands > .sx-sw-hero:not(:first-child) .k-hero__n { font-size:22px !important; line-height:1 !important; white-space:nowrap !important; }
${W}.sx-sw--buying .sx-sw-bands > .sx-sw-hero .k-hero__w { white-space:nowrap !important; }
@media (max-height:800px) {
  ${W}.sx-sw--buying .sx-sw__stats { padding-left:12px !important; padding-right:10px !important; }
  ${W}.sx-sw--buying .sx-sw-bands { grid-template-columns:max-content max-content !important; column-gap:16px !important; }
}
/* the handling scales end short of their values (the Fleet rule): the track fills its own column */
${W}.sx-sw--buying .sx-sw-bar__track { width:auto !important; min-width:0 !important; max-width:none !important; justify-self:stretch !important; }
/* the price stands once as the hero figure over the key: the key carries the verb alone */
${W} .sx-buybar .orr-lampkey small, ${W} .sx-buybar .sx-btn-primary small { display:none !important; }
/* the For Sale ladder's fold is one rung tall on a tall screen, so the last rung's title enters it */
@media (min-height:801px) {
  ${W}.sx-sw--buying .sx-sw__list[data-overflow="1"] { -webkit-mask-image:linear-gradient(180deg, #000 calc(100% - 62px), transparent) !important; mask-image:linear-gradient(180deg, #000 calc(100% - 62px), transparent) !important; }
}

/* ================================ ROUND 14: a buying decision =================================== */
/* For Sale: the hull as readings against the one you fly. Each value carries yours as its ghost: ice where
   this hull gains, dim bone where it costs (the Weapon readouts' rule) */
${W} .sx-sw-side__class { ${LABEL} margin:5px 0 0 !important; font-size:10px !important; letter-spacing:.16em !important; color:rgb(${BONE} / .62) !important; }
${W} .sx-sw-read { display:grid !important; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:14px 16px; margin:14px 0 0 !important; padding:0 !important; list-style:none !important; }
${W} .sx-sw-read__cell { display:flex; flex-direction:column; gap:4px; min-width:0; margin:0; padding:0; }
${W} .sx-sw-read__v { display:flex; align-items:baseline; gap:8px; white-space:nowrap; }
${W} .sx-sw-read__v b { font-family:var(--dp-face-display, "Archivo"); font-stretch:100%; font-variation-settings:"wdth" 100, "wght" 300; font-weight:300;
  font-size:24px; line-height:1; letter-spacing:-.005em; color:rgb(248 244 234); font-variant-numeric:tabular-nums; }
${W} .sx-sw-read__v b small { font-size:13px; margin-left:3px; color:rgb(${BONE} / .7); letter-spacing:.02em; }
${W} .sx-sw-read__ghost { font-style:normal; font-family:var(--dp-face-body, "Instrument Sans"); font-size:12.5px; letter-spacing:.02em; font-variant-numeric:tabular-nums; }
${W} .sx-sw-read__ghost.is-gain { color:var(--dp-ice, #8fcbff); }
${W} .sx-sw-read__ghost.is-loss { color:rgb(146 143 135); }
${W} .sx-sw-read__k { ${LABEL} font-size:9.5px !important; letter-spacing:.16em !important; color:rgb(${BONE} / .62) !important; }
${W} .sx-sw-read__vs { ${LABEL} margin:12px 0 0 !important; font-size:9.5px !important; letter-spacing:.16em !important; color:rgb(${BONE} / .56) !important; }
/* the hardpoints stand on the disc as sockets; their words stay here for a reader, and show where no disc is drawn */
${W} .sx-sw-read__hp { margin:12px 0 0 !important; font-size:12.5px; line-height:1.4; color:rgb(${BONE} / .8); }
${W} .sx-sw-read__hp .sx-spec__hp:not(:last-child)::after { content:"\\00a0\\00b7\\0020" !important; color:rgb(${BONE} / .45); }
${W}.sx-sw--buying:has(.sx-sw__stage.has-sockets) .sx-sw-read__hp { position:absolute !important; width:1px !important; height:1px !important; overflow:hidden !important; clip-path:inset(50%) !important; white-space:nowrap !important; margin:0 !important; }
@media (max-height:800px) {
  ${W} .sx-sw-read { gap:8px 14px; margin-top:10px !important; }
  ${W} .sx-sw-read__v b { font-size:20px; }
  ${W} .sx-sw-read__vs { margin-top:8px !important; }
}
/* the sockets on the disc: this hull's across the stroke, a socket your hull lacks in ice, yours as ghosts inside */
${W} .sx-sw__socket { stroke:rgb(${BONE} / .8); }
${W} .sx-sw__socket.is-gain { stroke:var(--dp-ice, #8fcbff); }
${W} .sx-sw__socket.is-ghost { stroke:rgb(${BONE} / .5); }
${W} text.sx-sw__socket-word { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-size:9px; font-weight:650; letter-spacing:.2em; fill:rgb(${BONE} / .6); }
/* a Buy key that cannot be pressed: its own cut outline in bone, the verb dim inside, the reason under it */
${W} .sx-buybar [data-buyship]:disabled { position:relative !important; background:none !important; background-image:none !important; box-shadow:none !important; text-decoration:none !important;
  color:rgb(${BONE} / .55) !important; border-color:transparent !important; opacity:1 !important; filter:none !important; cursor:default; }
${W} .sx-buybar [data-buyship]:disabled::before, ${W} .sx-buybar [data-buyship]:disabled::after { content:none !important; display:none !important; }
${W} .sx-buybar [data-buyship] > .sx-buykey__rim { position:absolute; overflow:visible; pointer-events:none; }
${W} .sx-buybar [data-buyship] > .sx-buykey__rim path { fill:none; stroke:rgb(${BONE} / .42); stroke-width:1; vector-effect:non-scaling-stroke; }
${W} .sx-buybar.is-blocked { flex-direction:column !important; flex-wrap:nowrap !important; align-items:flex-start !important; gap:9px !important; }
${W} .sx-buybar__why { ${LABEL} list-style:none; margin:0 !important; padding:0 !important; font-size:10px !important; letter-spacing:.16em !important; color:rgb(${BONE} / .66) !important; }
${W} .sx-buybar__why::before, ${W} .sx-buybar__why::after { content:none !important; display:none !important; }
/* a scrolled ladder folds its head as its foot folds; the spine and its thumb stay lit */
${W}.sx-sw--buying .sx-sw__list[data-overflow="1"][data-fold-foot="0"][data-fold-head="0"] { -webkit-mask-image:none !important; mask-image:none !important; }
${W}.sx-sw--buying .sx-sw__list[data-overflow="1"][data-fold-head="1"][data-fold-foot="1"] {
  -webkit-mask-image:linear-gradient(90deg, #000 24px, transparent 24px), linear-gradient(180deg, transparent 0, #000 40px, #000 calc(100% - 40px), transparent) !important;
  mask-image:linear-gradient(90deg, #000 24px, transparent 24px), linear-gradient(180deg, transparent 0, #000 40px, #000 calc(100% - 40px), transparent) !important; }
${W}.sx-sw--buying .sx-sw__list[data-overflow="1"][data-fold-head="1"][data-fold-foot="0"] {
  -webkit-mask-image:linear-gradient(90deg, #000 24px, transparent 24px), linear-gradient(180deg, transparent 0, #000 40px) !important;
  mask-image:linear-gradient(90deg, #000 24px, transparent 24px), linear-gradient(180deg, transparent 0, #000 40px) !important; }
@media (min-height:801px) {
  ${W}.sx-sw--buying .sx-sw__list[data-overflow="1"][data-fold-head="1"][data-fold-foot="1"] {
    -webkit-mask-image:linear-gradient(90deg, #000 24px, transparent 24px), linear-gradient(180deg, transparent 0, #000 62px, #000 calc(100% - 62px), transparent) !important;
    mask-image:linear-gradient(90deg, #000 24px, transparent 24px), linear-gradient(180deg, transparent 0, #000 62px, #000 calc(100% - 62px), transparent) !important; }
  ${W}.sx-sw--buying .sx-sw__list[data-overflow="1"][data-fold-head="1"][data-fold-foot="0"] {
    -webkit-mask-image:linear-gradient(90deg, #000 24px, transparent 24px), linear-gradient(180deg, transparent 0, #000 62px) !important;
    mask-image:linear-gradient(90deg, #000 24px, transparent 24px), linear-gradient(180deg, transparent 0, #000 62px) !important; }
}
/* Fleet on a tall screen: the six figures as readings, each value over its word, two to a row */
@media (min-height:801px) {
  ${W} .orr-sw-readouts.sx-sw__gauges { grid-template-columns:repeat(2, minmax(0, 1fr)) !important; gap:14px 16px !important; }
  ${W} .orr-sw-readouts .sx-sw-gauge { display:flex !important; flex-direction:column-reverse !important; align-items:flex-start !important; justify-content:flex-end !important; gap:4px !important; padding:0 !important; }
  ${W} .orr-sw-readouts .sx-sw-gauge .k-row__num { font-family:var(--dp-face-display, "Archivo") !important; font-stretch:100%; font-variation-settings:"wdth" 100, "wght" 300 !important; font-weight:300 !important;
    font-size:22px !important; line-height:1 !important; text-align:left !important; justify-self:start !important; color:rgb(248 244 234) !important; white-space:nowrap; }
  ${W} .orr-sw-readouts .sx-sw-gauge .k-row__name { font-size:9.5px !important; letter-spacing:.16em !important; }
  ${W} .orr-sw-readouts .sx-sw-gauge .sx-sw-ghost { font-family:var(--dp-face-body, "Instrument Sans") !important; font-variation-settings:normal !important; font-weight:400 !important; font-size:12.5px !important; margin-left:7px; }
}

/* ================================ ROUND 15: weight, and the turn ================================= */
/* nothing on the stage is a wire: the rings are bands under an edge, the ticks carry weight, values are lit */
${W} .sx-sw__salering { --orr-w-band:7px; --orr-band-a:.09; --orr-edge-a:.5; }
${W} .sx-sw__salering .sx-sw__salering-ring { stroke:rgb(${BONE} / .5); stroke-width:1.5px; }
${W} .sx-sw__salering .sx-sw__socket { stroke:rgb(${BONE} / .85); }
${W} .sx-sw__salering .sx-sw__socket.is-ghost { stroke:rgb(${BONE} / .5); }
${W} .sx-sw__salering .sx-sw__socket.is-gain { stroke:var(--dp-ice, #8fcbff); }
/* the grip: the ring lifts under the pointer and while it turns */
${W} .sx-sw__stage > .sx-sw__turn { display:none; }
${W} .sx-sw__stage.has-salering > .sx-sw__turn { display:block; position:absolute; z-index:2; border-radius:50%; background:transparent; cursor:grab; touch-action:none;
  left:calc(var(--sw-ring-x, 50%) - var(--sw-ring-r, 280px) - 18px); top:calc(var(--sw-ring-y, 50%) - var(--sw-ring-r, 280px) - 18px);
  width:calc(var(--sw-ring-r, 280px) * 2 + 36px); height:calc(var(--sw-ring-r, 280px) * 2 + 36px); }
${W} .sx-sw__stage.is-turning > .sx-sw__turn { cursor:grabbing; }
${W} .sx-sw__stage:has(> .sx-sw__turn:hover) > .sx-sw__salering, ${W} .sx-sw__stage.is-turning > .sx-sw__salering { --orr-band-a:.17; --orr-edge-a:.7; }
${W} .sx-sw__stage.has-salering .sx-sw__camera [data-camera] { transition:none !important; }
/* a view word is light alone: no underline, rule or box under it (the lit mark on the ring says which) */
${W} .sx-sw__stage.has-salering .sx-sw__camera [data-camera]::after { content:none !important; display:none !important; }
${W} .sx-sw__stage.has-salering .sx-sw__camera [data-camera] { text-decoration:none !important; border:0 !important; box-shadow:none !important; background:none !important; background-image:none !important; }
${W} .sx-sw__stage.has-salering .sx-sw__camera [data-camera].is-current { color:rgb(252 249 240) !important; }
/* the live hull re-centres after a turn without a jump */
${W} .sx-sw__stage.has-salering > .sx-sw__canvas { transition:translate .26s cubic-bezier(.2, .8, .2, 1), opacity .6s linear; }
${W.replace('html body', 'html.sf-reduce-motion body')} .sx-sw__stage.has-salering > .sx-sw__canvas { transition:none; }
/* the Fleet jig: its ring stands on a band (drawn under it by the screen), its scale and leaders carry weight,
   each socket sits in a soft bone halo */
${W} .orr-sw-jig > .sx-sw__jigband { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; pointer-events:none; --orr-w-band:7px; --orr-band-a:.1; }
${W} .orr-sw-jig .orr-hull__dial > path.orr-rest { stroke:rgb(${BONE} / .52) !important; stroke-width:1.5px !important; }
${W} .orr-sw-jig .orr-hull__dial > path.orr-faint { stroke:rgb(${BONE} / .42) !important; stroke-width:1.5px !important; }
${W} .orr-sw-jig .orr-hull__dial .orr-drift path { stroke-width:1.5px !important; }
${W} .orr-sw-jig path.orr-hull__leader { stroke-width:1.5px !important; }
${W} .orr-sw-jig path.orr-hi:not(.orr-hull__leader) { stroke-width:2px !important; }
${W} .orr-sw-jig .orr-hull__node .orr-hull__ring { stroke-width:2px !important; }
${W} .orr-sw-jig .orr-hull__node:not(.is-lit) .orr-hull__glow { stroke:rgb(${BONE}) !important; opacity:.1 !important; }
/* the fit dial: band, edge, weighted scale, the draw lit with its bead */
${W} .orr-power__band { fill:none; stroke:rgb(${BONE} / .09); stroke-width:8px; }
${W} .sx-sw-circuit__core .orr-power .orr-power__track { stroke:rgb(${BONE} / .46) !important; stroke-width:1.5px !important; }
${W} .orr-power__ticks { stroke:rgb(${BONE} / .5) !important; stroke-width:1.5px !important; }
${W} .orr-power__lit { stroke-width:3.5px !important; }
${W} .orr-power__lit-bloom { fill:none; stroke:rgb(255 240 214 / .24); stroke-width:11px; }
${W} .orr-power.is-over .orr-power__lit-bloom { stroke:rgb(255 80 56 / .24); }
${W} .orr-power__bead { fill:rgb(252 249 240); } ${W} .orr-power__bead-bloom { fill:rgb(255 240 214 / .26); }
${W} .orr-power__sys { stroke-width:1.5px !important; }
/* the handling scales: a luminous band with an edge and weighted ticks; the value lit over its bloom, a bead at its end */
${W} .sx-sw-bar__track { position:relative !important; overflow:visible !important; height:9px !important; border-radius:5px !important;
  background:linear-gradient(rgb(${BONE} / .46), rgb(${BONE} / .46)) 0 50% / 100% 1.5px no-repeat,
    repeating-linear-gradient(90deg, rgb(${BONE} / .42) 0 1.5px, transparent 1.5px 10%) 0 50% / 100% 9px no-repeat,
    rgb(${BONE} / .085) !important; }
${W} .sx-sw-bar__track > .k-bar__fill { position:absolute !important; left:0 !important; top:50% !important; height:3.5px !important; margin-top:-1.75px !important; border-radius:2px;
  background:rgb(248 244 234) !important; overflow:visible !important; }
${W} .sx-sw-bar__track > .k-bar__fill::before { content:""; position:absolute; left:-2px; right:-2px; top:50%; height:11px; margin-top:-5.5px; border-radius:6px;
  background:rgb(255 240 214 / .24); translate:none; scale:none; pointer-events:none; }
${W} .sx-sw-bar__track > .k-bar__fill::after { content:""; position:absolute; right:-4px; top:50%; width:8px; height:8px; margin-top:-4px; border-radius:50%;
  background:rgb(252 249 240); box-shadow:0 0 0 4px rgb(255 240 214 / .26); translate:none; scale:none; pointer-events:none; }
/* the ladders: the spine is a band under an edge, each rung's tick carries weight */
${W} .sx-sw__list { background:linear-gradient(90deg, transparent 4px, rgb(${BONE} / .085) 4px, rgb(${BONE} / .085) 11px, transparent 11px),
  linear-gradient(90deg, transparent 6.75px, rgb(${BONE} / .46) 6.75px, rgb(${BONE} / .46) 8.25px, transparent 8.25px) !important; }
${W} .sx-sw-row:not(.is-active, .is-selected, .is-viewed, [aria-pressed='true'], [aria-current='true'])::before { height:1.5px !important; margin-top:-.75px !important; background:rgb(${BONE} / .52) !important; }
${W} .sx-chooser__list { background:linear-gradient(90deg, transparent 4px, rgb(${BONE} / .085) 4px, rgb(${BONE} / .085) 11px, transparent 11px) 0 0 / 100% 100% no-repeat,
  linear-gradient(90deg, transparent 6.75px, rgb(${BONE} / .46) 6.75px, rgb(${BONE} / .46) 8.25px, transparent 8.25px) 0 0 / 100% 100% no-repeat,
  repeating-linear-gradient(180deg, rgb(${BONE} / .3) 0 1.5px, transparent 1.5px 8px) 4px 0 / 4px 100% no-repeat !important; }
${W} .sx-modrow:not(:focus-within, :hover)::before { height:1.5px !important; background:rgb(${BONE} / .52) !important; }
/* the bomb rack's sockets: a 2px ring, not a hairline */
${W} .sx-sw-rack__cell.is-empty::before { border:2px dashed rgb(${BONE} / .62) !important; }
/* a disabled key's outline carries the weight of an edge */
${W} .sx-buybar [data-buyship] > .sx-buykey__rim path { stroke-width:1.5px !important; stroke:rgb(${BONE} / .5) !important; }
/* the readings need no rule over them */
@media (min-height:801px) { ${W} .orr-sw-readouts.sx-sw__gauges { background:none !important; } }
@media (max-height:800px) { ${W} .orr-sw-readouts.sx-sw__gauges { background:linear-gradient(90deg, rgb(${BONE} / .3), rgb(${BONE} / 0)) 0 0 / 100% 1.5px no-repeat !important; } }

/* ================================ ROUND 16: a bezel with a body ================================ */
/* the For Sale ring is a bezel you grip: a band with a body (lum ~70 at rest, ~100 under the pointer, ~130 while
   it turns), edged at both radii, its scale cut across it (dark notches, bright majors) */
${W} .sx-sw__salering { --bezel-a:.27; --bezel-edge-a:.58; }
${W} .sx-sw__stage:has(> .sx-sw__turn:hover) > .sx-sw__salering { --bezel-a:.40; --bezel-edge-a:.72; }
${W} .sx-sw__stage.is-turning > .sx-sw__salering { --bezel-a:.53; --bezel-edge-a:.82; }
${W} :is(.sx-sw__salering, .sx-sw__jigband) .sx-sw__bezel-band { fill:none; stroke:rgb(${BONE} / var(--bezel-a, .27)); stroke-linecap:butt; }
${W} :is(.sx-sw__salering, .sx-sw__jigband) .sx-sw__bezel-edge { fill:none; stroke:rgb(${BONE} / var(--bezel-edge-a, .58)); stroke-width:1.5px; }
${W} .sx-sw__salering .sx-sw__bezel-edge.sx-sw__salering-ring { stroke:rgb(${BONE} / var(--bezel-edge-a, .58)); stroke-width:1.5px; }
${W} .sx-sw__salering .sx-sw__bezel-notch { fill:none; stroke:rgb(4 6 9 / .8); stroke-width:1.5px; }
${W} .sx-sw__salering .sx-sw__bezel-major { fill:none; stroke:rgb(252 249 240 / .95); stroke-width:2px; }
${W} .sx-sw__salering .sx-sw__bezel-lit { fill:none; stroke:rgb(246 242 232 / .96); stroke-linecap:butt; }
${W} .sx-sw__salering .sx-sw__bezel-index { fill:none; stroke:rgb(${BONE} / .62); stroke-width:2px; stroke-linecap:butt; }
${W} .sx-sw__salering .sx-sw__bezel-index.is-detent { stroke:rgb(255 252 244); }
/* the view words ride inside the band, turned along it; the current one is dark ink on its lit stretch */
${W} .sx-sw__stage.has-salering .sx-sw__camera [data-camera] { transform:var(--vw-rot, none) !important; translate:none !important; scale:none !important; transform-origin:50% 50% !important;
  font-size:10px !important; font-weight:600 !important; font-variation-settings:"wdth" 112, "wght" 600 !important; letter-spacing:.16em !important; line-height:1 !important;
  padding:2px 3px !important; color:rgb(250 247 238 / .96) !important; }
${W} .sx-sw__stage.has-salering .sx-sw__camera [data-camera].is-current { color:rgb(12 14 18) !important; }
${W} .sx-sw__stage.has-salering .sx-sw__camera [data-camera]:is(:hover, :focus-visible):not(.is-current) { color:rgb(255 253 246) !important; }
@media (max-height:800px) {
  ${W} .sx-sw__stage.has-salering .sx-sw__camera [data-camera] { font-size:9px !important; letter-spacing:.12em !important; padding:1px 2px !important; }
}
/* the jig's bearing numerals would sit under the bezel's inner edge: the band's own scale carries the bearing */
${W} .orr-sw-jig text.orr-hull__bearing { display:none !important; }
/* the hand-over: poster and live hull cross-fade in 180 ms, the live hull graded like the poster */
${W} .sx-sw__stage.has-salering > .sx-sw__canvas, ${W} .sx-sw__stage.has-salering > .sx-sw__poster { transition:opacity 180ms linear !important; }
${W.replace('html body', 'html.sf-reduce-motion body')} .sx-sw__stage.has-salering > .sx-sw__canvas, ${W.replace('html body', 'html.sf-reduce-motion body')} .sx-sw__stage.has-salering > .sx-sw__poster { transition:none !important; }
${W} .sx-sw__stage.has-salering > .sx-sw__poster { filter:brightness(1.14) contrast(1.04) !important; }
/* the fit dial's unlit capacity has a body too */
${W} .orr-power__band { stroke:rgb(${BONE} / .21) !important; }
/* the handling scales are readings, not sliders: a square band, the lit fill ending in a 2px bright head */
${W} .sx-sw-bar__track { border-radius:0 !important; }
${W} .sx-sw-bar__track > .k-bar__fill { border-radius:0 !important; background:rgb(236 230 216 / .78) !important; }
${W} .sx-sw-bar__track > .k-bar__fill::before { content:none !important; display:none !important; }
${W} .sx-sw-bar__track > .k-bar__fill::after { right:-1px !important; top:50% !important; width:2px !important; height:9px !important; margin-top:-4.5px !important; border-radius:0 !important;
  background:rgb(255 252 244) !important; box-shadow:none !important; }
/* the exploded schematic: the module riding its leader out of the socket */
${W} .orr-sw-jig > .sx-sw__explode { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; pointer-events:none; z-index:6; }
${W} .sx-sw__explode .sx-sw__module-well { fill:rgb(4 6 9 / .92); }
${W} .sx-sw__explode .sx-sw__module-bloom { fill:none; stroke:rgb(255 240 214 / .22); stroke-width:6px; }
${W} .sx-sw__explode .sx-sw__module { fill:none; stroke:rgb(250 247 238); stroke-width:2px; }
${W} .sx-sw__explode .sx-sw__module-core { fill:rgb(250 247 238 / .55); }
${W} .sx-sw__explode.is-seated .sx-sw__module { fill:rgb(250 247 238); }
${W} .sx-sw__explode.is-seated .sx-sw__module-core { fill:rgb(12 14 18); }

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
