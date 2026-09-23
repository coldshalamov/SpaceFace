// ORRERY composition for the station Market (design/frontend/ORRERY.md §6 Station, Market): the
// commodities on a Ladder (a ruled rail with a tick per good and the Hand at the chosen one), the
// price instrument as light with no window, and the quantity as a rotary dial of light round the
// number you type. It styles the Market's existing nodes (checks read their classes and roles) and
// adds one drawing, the dial; every rule is scoped to the station's `.orr-market`.
import { injectOrrery } from './tokens.js';
import { arcD, polar, ticksD } from './svg.js';

const STYLE_ID = 'sf-orrery-market';
const f = (n) => Math.round(n * 100) / 100;

// The dial: 270 degrees open at the foot, a tick every 5 degrees (majors every 45), the fill as a
// unit-length dash, the Hand (a bead on a short needle) turning about the centre to the amount.
const QD = { size: 150, c: 75, r: 60, from: -135, to: 135 };
const clampFrac = (qty, limit) => {
  const q = Math.max(0, Number(qty) || 0);
  const l = Math.max(0, Number(limit) || 0);
  return l > 0 ? Math.min(1, q / l) : 0;
};

export function qtyDialSvg({ qty = 0, limit = 0 } = {}) {
  const { size, c, r, from, to } = QD;
  const v = clampFrac(qty, limit);
  const d = arcD(c, c, r, from, to);
  const ticks = ticksD(c, c, r + 5, 54, { len: 2.5, major: 9, majorLen: 6, from, to, inward: false });
  const [x0, y0] = polar(c, c, r + 17, from);
  const [x1, y1] = polar(c, c, r + 17, to);
  const lim = Math.max(0, Math.floor(Number(limit) || 0));
  return `<svg class="orr-qdial" viewBox="0 0 ${size} ${size}" aria-hidden="true" focusable="false">`
    + `<circle class="orr-qdial__inner" cx="${c}" cy="${c}" r="${r - 12}"/>`
    + `<path class="orr-qdial__track" d="${d}"/>`
    + `<path class="orr-qdial__ticks" d="${ticks}"/>`
    + `<path class="orr-qdial__fill" d="${d}" pathLength="1" stroke-dasharray="${f(v)} 1"/>`
    + `<g class="orr-qdial__hand" style="transform:rotate(${f(from + (to - from) * v)}deg)">`
    + `<path class="orr-qdial__needle" d="M ${c} ${c - r + 7} L ${c} ${c - r - 9}"/>`
    + `<circle class="orr-qdial__bead" cx="${c}" cy="${c - r}" r="3.4"/></g>`
    + `<text class="orr-qdial__end" x="${f(x0)}" y="${f(y0 + 3)}" text-anchor="middle">0</text>`
    + `<text class="orr-qdial__end orr-qdial__end--max" x="${f(x1)}" y="${f(y1 + 3)}" text-anchor="middle">${lim}</text>`
    + `</svg>`;
}

/** Turn an existing dial to a new amount in place (fill and Hand glide together). */
export function setQtyDial(root, qty, limit) {
  const svgEl = root && root.querySelector ? root.querySelector('.orr-qdial') : null;
  if (!svgEl) return false;
  const v = clampFrac(qty, limit);
  const fill = svgEl.querySelector('.orr-qdial__fill');
  const hand = svgEl.querySelector('.orr-qdial__hand');
  if (fill) fill.style.strokeDasharray = `${f(v)} 1`;
  if (hand) hand.style.transform = `rotate(${f(QD.from + (QD.to - QD.from) * v)}deg)`;
  const max = svgEl.querySelector('.orr-qdial__end--max');
  const lim = String(Math.max(0, Math.floor(Number(limit) || 0)));
  if (max && max.textContent !== lim) max.textContent = lim;
  return true;
}

/** Where on the dial a pointer is, as an amount: straight up is half, the foot's ends are 0 and all. */
export function qtyFromDialPoint(svgEl, clientX, clientY, limit) {
  if (!svgEl || typeof svgEl.getBoundingClientRect !== 'function') return null;
  const box = svgEl.getBoundingClientRect();
  if (!box.width) return null;
  const dx = clientX - (box.left + box.width / 2);
  const dy = clientY - (box.top + box.height / 2);
  let deg = (Math.atan2(dx, -dy) * 180) / Math.PI; // 0 = up, clockwise
  deg = Math.max(QD.from, Math.min(QD.to, deg));
  const lim = Math.max(0, Math.floor(Number(limit) || 0));
  return Math.round(lim * ((deg - QD.from) / (QD.to - QD.from)));
}

const M = 'html body #screens > .sx-berth.orr-station .sx-mkt.orr-market';
const BONE = '236 230 216';
const LABEL = 'font-family:var(--dp-face-label, "Archivo") !important; font-stretch:112%; font-variation-settings:"wdth" 112, "wght" 650 !important; font-weight:650 !important; text-transform:uppercase;';
const PLAIN = 'background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important; clip-path:none !important;';

const CSS = `
/* ---- the Ladder: the exchange as a rail of goods, the Hand at the chosen one ------------------- */
${M} .sx-mkt-browser { position:relative; }
${M} .sx-mkt-browser__mode { margin:0 !important; padding-right:min(46%, 230px) !important; min-height:30px; display:flex !important; align-items:flex-end; }
${M} .sx-mkt-search { position:absolute !important; top:0; right:0; width:min(44%, 220px) !important; margin:0 !important; }
${M} .sx-mkt-browser__filters { flex-wrap:nowrap !important; overflow-x:auto; scrollbar-width:none;
  -webkit-mask-image:linear-gradient(90deg, #000 calc(100% - 44px), transparent); mask-image:linear-gradient(90deg, #000 calc(100% - 44px), transparent); padding-right:40px !important; }
${M} .sx-mkt-browser__filters::-webkit-scrollbar { display:none; }
${M} .sx-mkt-browser__filters li { flex:none; }
${M} .sx-mkt-browser__mode { ${LABEL} font-size:10.5px !important; letter-spacing:.22em !important; color:rgb(${BONE} / .72) !important; }
${M} .sx-mkt-browser__count { color:rgb(${BONE} / .5) !important; font-weight:600 !important; }
${M} .sx-mkt-browser__filters { gap:4px 20px !important; margin:10px 0 12px !important; }
${M} .sx-mkt-filter { ${PLAIN} ${LABEL} min-height:0 !important; min-width:0 !important; height:auto !important; padding:4px 0 7px !important;
  font-size:11px !important; letter-spacing:.18em !important; color:rgb(${BONE} / .58) !important; }
${M} .sx-mkt-filter::before, ${M} .sx-mkt-filter::after { display:none !important; }
${M} .sx-mkt-filter.is-on { color:rgb(248 244 234) !important;
  background-image:linear-gradient(rgb(${BONE} / .9), rgb(${BONE} / .9)) !important; background-size:16px 2px !important;
  background-position:0 100% !important; background-repeat:no-repeat !important; }
${M} .sx-mkt-filter:is(:hover, :focus-visible) { color:rgb(${BONE} / .92) !important; outline:none !important; }
${M} .sx-mkt-search { ${PLAIN} border-bottom:1px solid rgb(${BONE} / .24) !important; border-radius:0 !important; padding:7px 0 !important;
  min-height:0 !important; height:auto !important; font-size:13px !important; color:rgb(248 244 234) !important; }
${M} .sx-mkt-search::placeholder { color:rgb(${BONE} / .48); }
${M} .sx-mkt-search:focus { border-bottom-color:rgb(${BONE} / .7) !important; outline:none !important; }
${M} .sx-mkt-browser__rail { ${PLAIN} }
${M} .sx-mkt-table { ${PLAIN} border-collapse:separate !important; border-spacing:0 !important; table-layout:fixed !important; width:100% !important; }
${M} .sx-mkt-table thead th:nth-child(2), ${M} .sx-mkt-row td:nth-child(2) { width:86px; }
${M} .sx-mkt-table thead th:nth-child(3), ${M} .sx-mkt-row td:nth-child(3) { width:60px; }
${M} .sx-mkt-table thead th:nth-child(4), ${M} .sx-mkt-row td:nth-child(4) { width:92px; }
${M} .sx-mkt-table thead th:nth-child(5), ${M} .sx-mkt-row td:nth-child(5) { display:none !important; }
${M} .sx-mkt-table thead th:nth-child(1) { color:transparent !important; }
${M} .sx-mkt-table thead, ${M} .sx-mkt-table thead tr { background:none !important; box-shadow:none !important; position:static !important; }
${M} .sx-mkt-row .sx-mkt-row__stock { color:rgb(${BONE} / .6) !important; }
${M} .sx-mkt-row .sx-mkt-row__none { color:rgb(${BONE} / .35); }
${M} .sx-mkt-row .of-commodity-icon, ${M} .sx-mkt-row .sx-mkt-row__commodity { display:none !important; }
${M} .sx-mkt-row .sx-mkt-row__heldtag { ${LABEL} font-size:9.5px !important; letter-spacing:.14em !important; color:rgb(248 244 234) !important; }
${M} .sx-mkt-row .sx-mkt-row__name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
${M} .sx-mkt-table thead th { ${PLAIN} ${LABEL} font-size:9.5px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .5) !important;
  padding:0 8px 8px !important; }
${M} .sx-mkt-table thead th:first-child { padding-left:28px !important; }
/* the rail: one ruled line down the goods (a 1px column of light at the Hand's side) */
${M} .sx-mkt-table tbody { background:linear-gradient(90deg, transparent 7px, rgb(${BONE} / .22) 7px, rgb(${BONE} / .22) 8px, transparent 8px) !important; }
${M} .sx-mkt-row, ${M} .sx-mkt-row td { ${PLAIN} }
${M} .sx-mkt-row::before, ${M} .sx-mkt-row::after { display:none !important; }
${M} .sx-mkt-row { outline:none !important; cursor:pointer; height:auto !important; min-height:0 !important; block-size:auto !important; }
${M} .sx-mkt-row td { height:auto !important; block-size:auto !important; }
${M} .sx-mkt-row td { padding:8px 8px !important; font-size:13px !important; font-variant-numeric:tabular-nums; color:rgb(${BONE} / .62) !important; }
${M} .sx-mkt-row .sx-mkt-row__name { position:relative; padding-left:28px !important; color:rgb(${BONE} / .86) !important; font-weight:560; }
/* a tick on the rail for every good */
${M} .sx-mkt-row .sx-mkt-row__name::before { content:""; position:absolute; left:4px; top:50%; width:8px; height:1px; background:rgb(${BONE} / .38); }
/* the Hand: an index on the rail at the chosen good; bone at rest, amber where the player is */
${M} .sx-mkt-row.is-active .sx-mkt-row__name::after { content:""; position:absolute; left:2px; top:50%; width:11px; height:14px; margin-top:-7px;
  clip-path:polygon(0 0, 100% 50%, 0 100%, 26% 50%); background:rgb(248 244 234); }
${M} .sx-mkt-table tbody:is(:focus-within, :hover) .sx-mkt-row.is-active .sx-mkt-row__name::after { background:var(--dp-hand, #f2b950); }
${M} .sx-mkt-row.is-active td { color:rgb(${BONE} / .9) !important; }
${M} .sx-mkt-row.is-active .sx-mkt-row__name { color:rgb(250 247 238) !important; }
${M} .sx-mkt-row:hover td { color:rgb(${BONE} / .88) !important; }
${M} .sx-mkt-row .sx-mkt-row__price { color:rgb(248 244 234) !important; font-weight:620; white-space:nowrap; }
${M} .sx-mkt-row .sx-mkt-row__tr { font-size:10.5px !important; margin-left:6px; color:var(--dp-ice, #8fcbff) !important; }
/* an unmoved price says nothing: the flat 0% keeps its words for readers, off the glass */
${M} .sx-mkt-row .sx-mkt-row__tr:is(.is-flat, [aria-label='History unavailable']) { visibility:hidden; }
${M} .sx-mkt-row .sx-mkt-row__stock { color:rgb(${BONE} / .48) !important; }
${M} .sx-mkt-row .sx-mkt-row__held { color:rgb(${BONE} / .7) !important; }
${M} .sx-mkt-row :is(.sx-mkt-row__flag, .sx-mkt-row__profit) { color:rgb(248 244 234) !important; background:none !important; border:0 !important; }
${M} .sx-mkt-row .sx-mkt-row__profit { ${LABEL} font-size:9px !important; letter-spacing:.14em !important; margin-left:8px; color:rgb(${BONE} / .8) !important; }


/* ---- the reading: the good's name as a door (no link underline), the price in warm white ------- */
${M} .sx-mkt-cat-inline { ${LABEL} font-size:10.5px !important; letter-spacing:.22em !important; color:rgb(${BONE} / .66) !important; }
${M} .sx-mkt-title, ${M} .sx-mkt-title .sf-entity-link { text-decoration:none !important; background-image:none !important; border-bottom:0 !important; }
${M} .sx-mkt-title .sf-entity-link:is(:hover, :focus-visible) { text-decoration:underline 1px rgb(${BONE} / .45) !important; text-underline-offset:6px; outline:none !important; }
${M} .sx-mkt__hero .k-hero__n { color:rgb(248 244 234) !important; text-shadow:0 0 24px rgb(0 0 0 / .5) !important; }
${M} .sx-mkt__hero .k-hero__w { ${LABEL} font-size:10.5px !important; letter-spacing:.22em !important; color:rgb(${BONE} / .7) !important; }
${M} .sx-mkt-tracked { color:rgb(${BONE} / .85) !important; }
${M} .sx-mkt-tracked b { color:rgb(248 244 234) !important; }
/* the trace is the instrument: no fill under it (a flat price made that a box), bone marks */
${M} .sx-mkt-chart .of-chart-area { display:none !important; }
${M} .sx-mkt-instrument__plot { height:clamp(96px, 12vh, 170px) !important; }
${M} .sx-mkt__quote > .sx-mkt-drivers { margin-top:14px !important; }
${M} .sx-mkt__quote > .sx-mkt-instrument { margin-top:14px !important; }
${M} .sx-mkt__quote > .sx-mkt-readouts { margin-top:12px !important; }
${M} .sx-mkt__quote > .sx-mkt-sale { margin-top:8px !important; }
${M} .sx-mkt-chart .sx-mkt-line { stroke:rgb(248 244 234) !important; }
${M} :is(.sx-mkt-instrument__tick--buy, .sx-mkt-instrument__tick--sell) { color:rgb(${BONE} / .8) !important; }
${M} .sx-mkt-instrument__tick--buy i { background:rgb(248 244 234) !important; }
${M} .sx-mkt-instrument__tick--sell i { background:rgb(${BONE} / .5) !important; }
${M} .sx-mkt-instrument__dot { background:rgb(248 244 234) !important; box-shadow:0 0 0 3px rgb(7 8 10 / .8) !important; }
${M} .sx-mkt-readouts__item:is(.sx-mkt-readouts__item--buy, .sx-mkt-readouts__item--sell) { position:absolute !important; width:1px !important; height:1px !important;
  overflow:hidden !important; clip:rect(0 0 0 0) !important; }
${M} .sx-mkt-instrument__avg { color:rgb(${BONE} / .72) !important; }
${M} .sx-mkt__analysis { -webkit-mask-image:none !important; mask-image:none !important; border:0 !important; box-shadow:none !important; }
${M} .so-route-disclosure { border-top:1px solid rgb(${BONE} / .12) !important; border-bottom:0 !important; padding-top:8px !important; }
${M} .sx-trade, ${M} .sx-mkt__console { border-top:0 !important; }
${M} .sx-mkt-sale { color:rgb(${BONE} / .75) !important; }
${M} .so-route-disclosure > summary { ${LABEL} font-size:10px !important; letter-spacing:.18em !important; color:rgb(${BONE} / .62) !important; list-style:none; cursor:pointer; }
${M} .so-route-disclosure > summary::-webkit-details-marker { display:none; }
${M} .so-route-disclosure > summary::before { content:"›  "; }
${M} .so-route-disclosure[open] > summary::before { content:"‹  "; }
${M} .so-route-disclosure > summary:is(:hover, :focus-visible) { color:rgb(248 244 234) !important; outline:none; }

/* ---- the trade: a dial of light round the amount, the total as the number, the verb in bone ---- */
${M} .sx-mkt__console, ${M} .sx-mkt__trade { ${PLAIN} padding:0 !important; }
${M} .sx-mkt__console::before, ${M} .sx-mkt__console::after, ${M} .sx-trade::before, ${M} .sx-trade::after { display:none !important; }
${M} .sx-trade { ${PLAIN} padding:0 !important; display:grid !important;
  grid-template-columns:212px minmax(0, 1fr); grid-template-rows:1fr auto auto auto auto 1fr;
  grid-template-areas:"dial ." "dial total" "dial note" "dial verb" "dial breakdown" "dial ."; column-gap:32px; row-gap:6px; align-items:center; }
${M} .sx-trade > .sx-qty { grid-area:dial; position:relative; display:block !important; width:212px; height:236px; ${PLAIN} padding:0 !important; }
${M} .sx-qty .orr-qdial { position:absolute; left:6px; top:0; width:200px; height:200px; overflow:visible; cursor:grab; touch-action:none; }
${M} .sx-qty.is-turning .orr-qdial { cursor:grabbing; }
${M} .orr-qdial path, ${M} .orr-qdial circle { fill:none; }
${M} .orr-qdial__inner { stroke:rgb(${BONE} / .1); stroke-width:1; stroke-dasharray:1 4; }
${M} .orr-qdial__track { stroke:rgb(${BONE} / .2); stroke-width:2.5; }
${M} .orr-qdial__ticks { stroke:rgb(${BONE} / .4); stroke-width:1; }
${M} .orr-qdial__fill { stroke:rgb(248 244 234); stroke-width:2.5; transition:stroke-dasharray .35s cubic-bezier(.3, 1.2, .5, 1); }
${M} .orr-qdial__hand { transform-box:view-box; transform-origin:75px 75px; transition:transform .35s cubic-bezier(.3, 1.2, .5, 1); }
${M} .orr-qdial__needle { stroke:rgb(248 244 234); stroke-width:1.6; }
${M} .orr-qdial circle.orr-qdial__bead { fill:rgb(248 244 234); }
${M} .sx-qty:is(:focus-within, :hover, .is-turning) :is(.orr-qdial__needle) { stroke:var(--dp-hand, #f2b950); }
${M} .sx-qty:is(:focus-within, :hover, .is-turning) circle.orr-qdial__bead { fill:var(--dp-hand-hot, #ffd98c); }
${M} .sx-qty:is(:focus-within, :hover, .is-turning) .orr-qdial__fill { stroke:var(--dp-hand, #f2b950); }
${M} .sx-qty.is-turning :is(.orr-qdial__fill, .orr-qdial__hand) { transition:none; }
${M} .orr-qdial__end { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:8px; letter-spacing:.08em; fill:rgb(${BONE} / .55); }
${M} .sx-qty .sx-qty__k { position:absolute; left:6px; width:200px; top:60px; text-align:center; margin:0 !important; padding:0 !important;
  ${LABEL} font-size:9px !important; letter-spacing:.24em !important; color:rgb(${BONE} / .55) !important; background:none !important; pointer-events:none; }
${M} .sx-qty .sx-qty__in { position:absolute !important; left:46px; width:120px !important; top:76px; height:54px !important; margin:0 !important; padding:0 !important;
  ${PLAIN} border-radius:0 !important; text-align:center; font-family:var(--dp-face-display, "Archivo") !important; font-stretch:100%;
  font-variation-settings:"wdth" 100, "wght" 560 !important; font-size:44px !important; line-height:54px !important; color:rgb(248 244 234) !important;
  font-variant-numeric:tabular-nums; caret-color:var(--dp-hand, #f2b950); cursor:ew-resize; }
${M} .sx-qty .sx-qty__in:focus { outline:none !important; color:rgb(255 244 222) !important; }
${M} .sx-qty .sx-qty__words { position:absolute !important; left:0; right:0; top:208px; display:flex !important; justify-content:space-between !important;
  gap:0 !important; margin:0 !important; padding:0 !important; }
${M} .sx-qty .sx-qty__words li { margin:0 !important; }
${M} .sx-qty :is(.sx-qty__b, .sx-qty__max) { ${PLAIN} ${LABEL} min-height:0 !important; min-width:0 !important; height:auto !important; padding:3px 2px !important;
  font-size:11.5px !important; letter-spacing:.18em !important; color:rgb(${BONE} / .75) !important; }
${M} .sx-qty :is(.sx-qty__b, .sx-qty__max)::before, ${M} .sx-qty :is(.sx-qty__b, .sx-qty__max)::after { display:none !important; }
${M} .sx-qty .sx-qty__b[data-q="-1"]::before { content:"‹  " !important; display:inline !important; position:static !important; width:auto !important;
  height:auto !important; background:none !important; transform:none !important; }
${M} .sx-qty .sx-qty__b[data-q="1"]::after { content:"  ›" !important; display:inline !important; position:static !important; width:auto !important;
  height:auto !important; background:none !important; transform:none !important; }
${M} .sx-qty :is(.sx-qty__b, .sx-qty__max):is(:hover, :focus-visible) { color:var(--dp-hand, #f2b950) !important; outline:none !important; }
${M} .so-trade-total { grid-area:total; display:flex !important; flex-direction:column; gap:6px; ${PLAIN} padding:0 !important; }
${M} .so-trade-total > span { ${LABEL} font-size:10px !important; letter-spacing:.22em !important; color:rgb(${BONE} / .65) !important; }
${M} .so-trade-total > strong { font-family:var(--dp-face-display, "Archivo") !important; font-stretch:100%; font-variation-settings:"wdth" 100, "wght" 560 !important;
  font-size:clamp(28px, 3.2vh, 40px) !important; line-height:1 !important; color:rgb(248 244 234) !important; font-variant-numeric:tabular-nums; }
${M} .sx-trade__note { grid-area:note; margin:0 !important; font-size:12.5px !important; color:rgb(${BONE} / .8) !important; }
${M} .so-trade-breakdown { grid-area:breakdown; ${PLAIN} padding:0 !important; }
${M} .so-trade-breakdown > summary { ${LABEL} font-size:10px !important; letter-spacing:.18em !important; color:rgb(${BONE} / .62) !important; cursor:pointer; list-style:none; }
${M} .so-trade-breakdown > summary::-webkit-details-marker { display:none; }
${M} .so-trade-breakdown > summary::before { content:"›  "; }
${M} .so-trade-breakdown > summary span { display:none; }
${M} .so-trade-breakdown[open] > summary::before { content:"‹  "; }
${M} .sx-trade__words { grid-area:verb; display:flex !important; flex-direction:row; align-items:baseline; justify-content:flex-start; gap:26px !important;
  margin:4px 0 0 !important; padding:0 !important; }
${M} .sx-trade__words li { margin:0 !important; }
${M} .sx-trade__words li:has([data-go]) { order:-1; }
${M} .sx-trade__go { ${PLAIN} min-height:0 !important; min-width:0 !important; height:auto !important; border-radius:0 !important; }
${M} .sx-trade__go::before, ${M} .sx-trade__go::after { display:none !important; }
/* the commit: the one primary verb, bone at rest, amber where the player reaches */
${M} .sx-trade__go[data-go] { font-family:var(--dp-face-display, "Archivo") !important; font-stretch:125%; font-variation-settings:"wdth" 125, "wght" 800 !important;
  font-size:22px !important; letter-spacing:.1em !important; text-transform:uppercase; color:rgb(248 244 234) !important; padding:8px 2px 12px !important; }
${M} .sx-trade__go[data-go]:not(:disabled):is(:hover, :focus-visible) { color:var(--dp-hand-hot, #ffd98c) !important; outline:none !important;
  background-image:linear-gradient(90deg, var(--dp-hand, #f2b950), rgb(242 185 80 / 0)) !important; background-size:100% 2px !important;
  background-position:0 100% !important; background-repeat:no-repeat !important; text-shadow:0 0 22px rgb(255 217 140 / .4); }
${M} .sx-trade__go[data-go]:disabled { color:rgb(${BONE} / .45) !important; cursor:default; }
/* the other side only switches mode: a word */
${M} .sx-trade__go:not([data-go]) { ${LABEL} font-size:11px !important; letter-spacing:.22em !important; color:rgb(${BONE} / .66) !important; padding:4px 2px !important; }
${M} .sx-trade__go:not([data-go]):is(:hover, :focus-visible) { color:rgb(248 244 234) !important; outline:none !important; }
${M} .sx-trade__go:not([data-go])::after { all:unset !important; content:"  \u203A" !important; display:inline !important; color:inherit !important; }
${M} .sx-trade__go:not([data-go])::before { all:unset !important; display:none !important; }

/* ---- the decision under the trade: a sentence and its verbs, no rows ------------------------- */
@media (min-width:1500px) { ${M} { grid-template-columns:minmax(0, 540px) minmax(0, 1fr) !important; } }
${M} .sx-mkt__stage { display:grid !important; grid-template-columns:minmax(0, 520px) minmax(0, 1fr); grid-template-rows:minmax(0, 1fr) auto;
  column-gap:clamp(28px, 3vw, 56px); }
${M} .sx-mkt__analysis { grid-column:1 / -1; grid-row:1; }
${M} .sx-mkt__console { grid-column:1; grid-row:2; }
${M} .sx-mkt__decision:empty { display:none; }
${M} .sx-mkt__decision { grid-column:2; grid-row:2; align-self:center; margin:0; flex:0 0 auto !important; }
${M} .sx-mkt__analysis { min-height:0; }
${M} .sx-decision { ${PLAIN} padding:0 !important; margin:0 !important; display:flex !important; flex-direction:column !important; flex-wrap:nowrap !important;
  align-items:flex-start !important; gap:8px !important; min-height:0 !important; height:auto !important; }
${M} .sx-decision > .k-sentence { margin:0 0 4px !important; color:rgb(${BONE} / .8) !important; font-size:13.5px !important; max-width:52ch; }
${M} .sx-decision__opt { ${PLAIN} display:inline-flex !important; flex-direction:row !important; flex:none !important; align-items:baseline !important; gap:10px !important;
  padding:2px 0 !important; margin:0 !important; min-height:0 !important; height:auto !important; width:auto !important; }
${M} .sx-decision__opt::before { content:"›" !important; display:inline !important; position:static !important; background:none !important; width:auto !important;
  height:auto !important; color:rgb(${BONE} / .55); }
${M} .sx-decision__opt .k-row__name { ${LABEL} font-size:11px !important; letter-spacing:.16em !important; color:rgb(248 244 234) !important; white-space:nowrap; flex:none; }
${M} .sx-decision__opt .k-row__sub { font-size:12px !important; color:rgb(${BONE} / .6) !important; }
${M} .sx-decision__opt:is(:hover, :focus-visible) .k-row__name { color:var(--dp-hand, #f2b950) !important; }
${M} .sx-decision__opt:is(:hover, :focus-visible) { outline:none !important; }
html.sf-reduce-motion ${M} :is(.orr-qdial__fill, .orr-qdial__hand) { transition:none; }
html body #screens > .sx-berth.orr-station .sx-comms__count:not([hidden]) { font-size:0 !important; width:6px; height:6px; padding:0 !important; margin-left:2px;
  border-radius:50% !important; background:rgb(248 244 234) !important; display:inline-block !important; vertical-align:middle; }
html body #screens > .sx-berth.orr-station .sx-receipt__delta { color:var(--dp-ice, #8fcbff) !important; }
@media (max-height:800px) {
  ${M} .sx-mkt__stage { display:grid !important; grid-template-columns:minmax(0, 1fr) 244px !important; grid-template-rows:minmax(0, 1fr) auto; column-gap:28px; }
  ${M} .sx-mkt__analysis { grid-column:1 !important; }
  ${M} .sx-trade > .sx-qty { width:210px; height:204px; }
  ${M} .sx-qty .orr-qdial { left:20px; width:170px; height:170px; }
  ${M} .sx-qty .sx-qty__k { left:20px; width:170px; top:50px; }
  ${M} .sx-qty .sx-qty__in { left:55px; width:100px !important; top:64px; height:44px !important; font-size:36px !important; line-height:44px !important; }
  ${M} .sx-qty .sx-qty__words { top:176px; left:4px; right:4px; }
  ${M} .sx-mkt-instrument__plot { height:80px !important; }
  ${M} .sx-decision__opt { flex-direction:column !important; gap:1px !important; }
  ${M} .sx-decision__opt { position:relative !important; padding-left:16px !important; align-items:flex-start !important; }
  ${M} .sx-decision__opt::before { position:absolute !important; left:0; top:1px; }
  ${M} .sx-decision { gap:4px !important; }
  ${M} .sx-mkt-row td { padding-top:5px !important; padding-bottom:5px !important; }
  ${M} .sx-mkt-browser__filters { margin:6px 0 6px !important; }
  ${M} .sx-mkt-table thead th { padding-bottom:4px !important; }
  ${M} .sx-decision > .k-sentence { max-width:none; }
  ${M} .sx-mkt__analysis { grid-column:1; grid-row:1; min-height:0; }
  ${M} .sx-mkt__console { grid-column:2; grid-row:1 / span 2; align-self:start; }
  ${M} .sx-mkt__decision { grid-column:1 !important; grid-row:2 !important; margin-top:8px; align-self:start; }
  ${M} .sx-trade { grid-template-columns:minmax(0, 1fr) !important; grid-template-areas:"dial" "total" "note" "verb" "breakdown" !important; justify-items:center; row-gap:8px; }
  ${M} .so-trade-total { align-items:center; }
  ${M} .sx-trade__note { text-align:center; }
  ${M} .sx-trade__words { justify-content:center; }
}
`;

export function injectOrreryMarket(doc = globalThis.document) {
  if (!doc?.head || typeof doc.createElement !== 'function' || typeof doc.getElementById !== 'function') return;
  injectOrrery(doc);
  if (typeof doc.getElementById === 'function' && doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
