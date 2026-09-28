// ORRERY composition for the station Market (design/frontend/ORRERY.md §6 Station, Market): the
// price instrument — commodities on a Ladder (a ruled rail with a tick per good, its pictogram and
// the Hand at the chosen one), the trace as light with its band, BUY/SELL beads on a right-edge
// scale and a crosshair Lens, and the quantity as a rotary dial of light round the number you type.
// It styles the Market's existing nodes (checks read their classes and roles) and draws the dial;
// every rule is scoped to the station's `.orr-market`.
import { injectOrrery } from './tokens.js';
import { arcD, polar } from './svg.js';

const STYLE_ID = 'sf-orrery-market';
const f = (n) => Math.round(n * 100) / 100;

// The dial: 270 degrees open at the foot, a tick every 5 degrees (majors every 45), the fill as a
// unit-length dash, the Hand (a bead on a short needle) turning about the centre to the amount.
// Widths are dial units (150 across 200px, so 1.5 units read as 2px): the track is an 8px band at
// bone .28 under a 2px edge, minors 1.5px, majors 2px, the fill a 3px lit core over a 10px bloom.
const QD = { size: 150, c: 75, r: 60, from: -135, to: 135 };
const clampFrac = (qty, limit) => {
  const q = Math.max(0, Number(qty) || 0);
  const l = Math.max(0, Number(limit) || 0);
  return l > 0 ? Math.min(1, q / l) : 0;
};

/** The dial's ticks as two paths, so minors (1.5px) and majors (2px) carry their own weight. */
function qdialTickPaths() {
  const { c, r, from, to } = QD;
  const minor = [];
  const major = [];
  const steps = Math.round((to - from) / 5);
  for (let i = 0; i <= steps; i += 1) {
    const a = from + i * 5;
    const isMajor = i % 9 === 0;
    const len = isMajor ? 7 : 3;
    const [x0, y0] = polar(c, c, r + 5, a);
    const [x1, y1] = polar(c, c, r + 5 + len, a);
    (isMajor ? major : minor).push(`M ${f(x0)} ${f(y0)} L ${f(x1)} ${f(y1)}`);
  }
  return { minor: minor.join(' '), major: major.join(' ') };
}

export function qtyDialSvg({ qty = 0, limit = 0 } = {}) {
  const { size, c, r, from, to } = QD;
  const v = clampFrac(qty, limit);
  const d = arcD(c, c, r, from, to);
  const ticks = qdialTickPaths();
  const [x0, y0] = polar(c, c, r + 17, from);
  const [x1, y1] = polar(c, c, r + 17, to);
  const lim = Math.max(0, Math.floor(Number(limit) || 0));
  return `<svg class="orr-qdial" viewBox="0 0 ${size} ${size}" aria-hidden="true" focusable="false">`
    + `<path class="orr-qdial__band" d="${d}"/>`
    + `<path class="orr-qdial__track" d="${d}"/>`
    + `<path class="orr-qdial__ticks-min" d="${ticks.minor}"/>`
    + `<path class="orr-qdial__ticks-maj" d="${ticks.major}"/>`
    + `<path class="orr-qdial__fillbloom" d="${d}" pathLength="1" stroke-dasharray="${f(v)} 1"/>`
    + `<path class="orr-qdial__fill" d="${d}" pathLength="1" stroke-dasharray="${f(v)} 1"/>`
    + `<g class="orr-qdial__hand" style="transform:rotate(${f(from + (to - from) * v)}deg)">`
    + `<path class="orr-qdial__needle" d="M ${c} ${c - r + 7} L ${c} ${c - r - 9}"/>`
    + `<circle class="orr-qdial__bead" cx="${c}" cy="${c - r}" r="3"/></g>`
    + `<text class="orr-qdial__end" x="${f(x0)}" y="${f(y0 + 3)}" text-anchor="middle">0</text>`
    + `<text class="orr-qdial__end orr-qdial__end--max" x="${f(x1)}" y="${f(y1 + 3)}" text-anchor="middle">${lim}</text>`
    + `</svg>`;
}

/** Turn an existing dial to a new amount in place (fill, bloom and Hand glide together). */
export function setQtyDial(root, qty, limit) {
  const svgEl = root && root.querySelector ? root.querySelector('.orr-qdial') : null;
  if (!svgEl) return false;
  const v = clampFrac(qty, limit);
  const fill = svgEl.querySelector('.orr-qdial__fill');
  const bloom = svgEl.querySelector('.orr-qdial__fillbloom');
  const hand = svgEl.querySelector('.orr-qdial__hand');
  if (fill) fill.style.strokeDasharray = `${f(v)} 1`;
  if (bloom) bloom.style.strokeDasharray = `${f(v)} 1`;
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
const NUMERAL = 'font-family:var(--dp-face-numeral, "Archivo") !important; font-stretch:100%; font-variant-numeric:tabular-nums;';
// A spine is a 2px line over a 7px faint band; a horizontal rule the same, bottom-anchored.
const SPINE_V = (x, a = .55) => `linear-gradient(90deg, transparent ${x}px, rgb(${BONE} / ${a}) ${x}px, rgb(${BONE} / ${a}) ${x + 2}px, transparent ${x + 2}px) 0 0 / 100% 100% no-repeat`;
const BAND_V = (x, a = .27) => `linear-gradient(90deg, transparent ${x - 2.5}px, rgb(${BONE} / ${a}) ${x - 2.5}px, rgb(${BONE} / ${a}) ${x + 4.5}px, transparent ${x + 4.5}px) 0 0 / 100% 100% no-repeat`;
const MINORS_V = 'repeating-linear-gradient(180deg, rgb(236 230 216 / .34) 0 1.5px, transparent 1.5px 8px) 4px 0 / 6px 100% no-repeat';
const RULE_H = 'repeating-linear-gradient(90deg, rgb(236 230 216 / .34) 0 1.5px, transparent 1.5px 8px) 0 100% / 100% 5px no-repeat,'
  + ' linear-gradient(rgb(236 230 216 / .55), rgb(236 230 216 / .55)) 0 100% / 100% 2px no-repeat,'
  + ' linear-gradient(rgb(236 230 216 / .27), rgb(236 230 216 / .27)) 0 100% / 100% 7px no-repeat';

const CSS = `
/* ---- the Ladder: the exchange as a rail of goods, the Hand at the chosen one ------------------- */
${M} .sx-mkt-browser { position:relative; }
${M} .sx-mkt-browser__mode { margin:0 !important; padding-right:min(46%, 230px) !important; min-height:30px; display:flex !important; align-items:flex-end; }
${M} .sx-mkt-browser__mode { ${LABEL} font-size:12px !important; letter-spacing:.22em !important; color:rgb(${BONE} / .72) !important; }
${M} .sx-mkt-browser__count { color:rgb(${BONE} / .5) !important; font-weight:600 !important; white-space:nowrap !important; }
/* the families stand on a ruled scale, each a stop with its tick; the chosen stop's tick stands taller in bone (the Hand lives on the ladder) */
${M} .sx-mkt-browser__filters { position:relative; flex-wrap:nowrap !important; overflow-x:auto; scrollbar-width:none;
  -webkit-mask-image:linear-gradient(90deg, #000 calc(100% - 44px), transparent); mask-image:linear-gradient(90deg, #000 calc(100% - 44px), transparent);
  gap:4px 20px !important; margin:10px 0 12px !important; padding:0 40px 18px 0 !important; background:${RULE_H} !important; }
${M} .sx-mkt-browser__filters::-webkit-scrollbar { display:none; }
${M} .sx-mkt-browser__filters li { flex:none; }
${M} .sx-mkt-filter { ${PLAIN} ${LABEL} position:relative; min-height:0 !important; min-width:0 !important; height:auto !important; padding:4px 0 2px !important;
  font-size:12px !important; letter-spacing:.18em !important; color:rgb(${BONE} / .58) !important; }
${M} .sx-mkt-filter::before { display:none !important; }
${M} .sx-mkt-filter::after { content:"" !important; display:block !important; position:absolute !important; left:50% !important; top:100% !important;
  width:2px !important; height:8px !important; margin:5px 0 0 -1px !important; padding:0 !important; background:rgb(${BONE} / .55) !important;
  border:0 !important; box-shadow:none !important; clip-path:none !important; translate:none !important; scale:none !important; rotate:none !important; }
${M} .sx-mkt-filter.is-on { color:rgb(250 247 238) !important; background:none !important; }
${M} .sx-mkt-filter.is-on::after { height:10px !important; margin-top:3px !important; background:rgb(250 247 238) !important;
  box-shadow:0 0 6px 1px rgb(248 244 234 / .5) !important; }
${M} .sx-mkt-filter:is(:hover, :focus-visible) { color:rgb(${BONE} / .92) !important; outline:none !important; }
/* the find is a scale line with a cursor, not an underlined input */
${M} .orr-mkt-find { position:absolute !important; top:0; right:0; display:block !important; width:min(44%, 220px) !important;
  margin:0 !important; padding:0 0 12px !important; background:${RULE_H} !important; }
${M} .orr-mkt-find__cursor { position:absolute; left:0; bottom:13px; width:2px; height:14px; background:rgb(${BONE} / .5); pointer-events:none; }
${M} .orr-mkt-find:focus-within .orr-mkt-find__cursor { background:rgb(248 244 234); box-shadow:0 0 6px 1px rgb(248 244 234 / .5); }
${M} .sx-mkt-search { ${PLAIN} position:static !important; display:block !important; width:100% !important; margin:0 !important;
  border-radius:0 !important; padding:7px 0 7px 10px !important; min-height:0 !important; height:auto !important;
  font-size:13px !important; color:rgb(248 244 234) !important; caret-color:var(--dp-hand, #f2b950); }
${M} .sx-mkt-search::placeholder { color:rgb(${BONE} / .48); }
${M} .sx-mkt-search:focus { outline:none !important; }
${M} .sx-mkt-browser__rail { ${PLAIN} }
${M} .sx-mkt-table { ${PLAIN} border-collapse:separate !important; border-spacing:0 !important; table-layout:fixed !important; width:100% !important; }
${M} .sx-mkt-table thead th:nth-child(2), ${M} .sx-mkt-row td:nth-child(2) { width:86px; }
${M} .sx-mkt-table thead th:nth-child(3), ${M} .sx-mkt-row td:nth-child(3) { width:60px; }
${M} .sx-mkt-table thead th:nth-child(4), ${M} .sx-mkt-row td:nth-child(4) { width:92px; }
${M} .sx-mkt-table thead th:nth-child(5) { display:none !important; }
${M} .sx-mkt-table thead th:nth-child(1) { color:transparent !important; }
${M} .sx-mkt-table thead, ${M} .sx-mkt-table thead tr { background:none !important; box-shadow:none !important; position:static !important; }
${M} .sx-mkt-table thead th { ${PLAIN} ${LABEL} font-size:12px !important; letter-spacing:.2em !important; color:rgb(${BONE} / .5) !important;
  padding:0 8px 8px !important; }
${M} .sx-mkt-table thead th:first-child { padding-left:46px !important; }
/* the rail: the shared spine (2px at .55 over a 7px band at .27) with 1.5px minor ticks */
${M} .sx-mkt-table tbody { background:${SPINE_V(7)}, ${BAND_V(7)}, ${MINORS_V} !important; }
${M} .sx-mkt-row, ${M} .sx-mkt-row td { ${PLAIN} }
${M} .sx-mkt-row::before, ${M} .sx-mkt-row::after { display:none !important; }
${M} .sx-mkt-row { outline:none !important; cursor:pointer; height:auto !important; min-height:0 !important; block-size:auto !important; }
${M} .sx-mkt-row td { height:auto !important; block-size:auto !important; }
${M} .sx-mkt-row td { padding:8px 8px !important; font-size:13px !important; font-variant-numeric:tabular-nums; color:rgb(${BONE} / .62) !important; }
${M} .sx-mkt-row .sx-mkt-row__name { position:relative; padding-left:46px !important; color:rgb(${BONE} / .86) !important; font-weight:560; }
${M} .sx-mkt-row .sx-mkt-row__name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
/* a 2px tick on the rail for every good */
${M} .sx-mkt-row .sx-mkt-row__name::before { content:""; position:absolute; left:4px; top:50%; width:8px; height:2px; margin-top:-1px; background:rgb(${BONE} / .55); }
${M} .sx-mkt-row:is(:hover, :focus-visible):not(.is-active) .sx-mkt-row__name::before { background:rgb(248 244 234) !important; box-shadow:0 0 5px rgb(248 244 234 / .5); }
/* the Hand: the shared arm and bead at the chosen good; the one amber at rest */
${M} .sx-mkt-row.is-active .sx-mkt-row__name::before { left:31px !important; width:5px !important; height:5px !important; margin-top:-2.5px !important;
  border-radius:50% !important; background:var(--dp-hand-hot, #ffd98c) !important; box-shadow:0 0 6px 1px rgb(255 217 140 / .7) !important; }
${M} .sx-mkt-row.is-active .sx-mkt-row__name::after { content:""; position:absolute; left:7px; top:50%; width:26px; height:2px; margin-top:-1px;
  background:linear-gradient(90deg, var(--dp-hand-hot, #ffd98c) 0 3px, var(--dp-hand, #f2b950) 3px) !important; box-shadow:0 0 5px 1px rgb(242 185 80 / .45); pointer-events:none; }
${M} .sx-mkt-table tbody:is(:focus-within, :hover) .sx-mkt-row.is-active .sx-mkt-row__name::after { background:var(--dp-hand-hot, #ffd98c) !important; }
${M} .sx-mkt-row.is-active td { color:rgb(${BONE} / .9) !important; }
${M} .sx-mkt-row.is-active .sx-mkt-row__name { color:rgb(250 247 238) !important; }
${M} .sx-mkt-row:hover td { color:rgb(${BONE} / .88) !important; }
/* the pictograms stand on the ticks at 16px, bone .8, the chosen one lit (the arm is the amber) */
${M} .sx-mkt-row .sx-mkt-row__commodity { display:inline-block !important; width:16px !important; height:16px !important; margin-right:8px !important;
  vertical-align:-3px !important; color:rgb(${BONE} / .8) !important; }
${M} .sx-mkt-row .of-commodity-icon { display:inline-block !important; width:16px !important; height:16px !important; vertical-align:-3px !important; }
${M} .sx-mkt-row .sx-mkt-row__name > .of-commodity-icon { margin-right:8px !important; color:rgb(${BONE} / .8) !important; }
${M} .sx-mkt-row.is-active .sx-mkt-row__commodity, ${M} .sx-mkt-row.is-active .sx-mkt-row__name > .of-commodity-icon { color:rgb(250 247 238) !important;
  filter:drop-shadow(0 0 4px rgb(248 244 234 / .55)) !important; }
${M} .sx-mkt-row .sx-mkt-row__price { color:rgb(248 244 234) !important; font-weight:620; white-space:nowrap; }
${M} .sx-mkt-row .sx-mkt-row__tr { font-size:12px !important; margin-left:6px; color:var(--dp-ice, #8fcbff) !important; }
/* an unmoved price says nothing: the flat 0% keeps its words for readers, off the glass */
${M} .sx-mkt-row .sx-mkt-row__tr:is(.is-flat, [aria-label='History unavailable']) { visibility:hidden; }
${M} .sx-mkt-row .sx-mkt-row__stock { color:rgb(${BONE} / .48) !important; }
${M} .sx-mkt-row .sx-mkt-row__held { color:rgb(${BONE} / .7) !important; }
${M} .sx-mkt-row :is(.sx-mkt-row__flag, .sx-mkt-row__profit) { color:rgb(248 244 234) !important; background:none !important; border:0 !important; }
${M} .sx-mkt-row .sx-mkt-row__profit { ${LABEL} font-size:12px !important; letter-spacing:.14em !important; margin-left:8px; color:rgb(${BONE} / .8) !important; }
/* unknown stock prints no column of dashes: the column yields */
${M} .sx-mkt__list.is-stockless .sx-mkt-table thead th:nth-child(4),
${M} .sx-mkt__list.is-stockless .sx-mkt-row td:nth-child(4) { display:none !important; }
/* the held column never adds a reading: held cargo already shows as a tag in the stock cell,
   and otherwise it prints a dash the header (already hidden) cannot explain. It yields always. */
${M} .sx-mkt-row td:nth-child(5) { display:none !important; }


/* ---- the reading: the good's name as a door, its price a thin numeral on the scale's end ------ */
${M} .sx-mkt-cat-inline { ${LABEL} font-size:12px !important; letter-spacing:.22em !important; color:rgb(${BONE} / .66) !important; }
${M} .sx-mkt-title, ${M} .sx-mkt-title .sf-entity-link { text-decoration:none !important; background-image:none !important; border-bottom:0 !important; }
${M} .sx-mkt-title .sf-entity-link:is(:hover, :focus-visible) { text-decoration:underline 1px rgb(${BONE} / .45) !important; text-underline-offset:6px; outline:none !important; }
${M} .sx-mkt__hero { grid-column:2 !important; align-self:center !important; text-align:right !important; margin:0 !important; padding:0 0 0 24px !important; min-width:0; }
${M} .sx-mkt__hero .k-hero__n { ${NUMERAL} font-variation-settings:"wdth" 100, "wght" 250 !important; font-weight:250 !important;
  font-size:clamp(56px, 9vh, 96px) !important; line-height:.95 !important; letter-spacing:-.02em !important;
  color:rgb(248 244 234) !important; text-shadow:0 0 24px rgb(0 0 0 / .5) !important; }
${M} .sx-mkt__hero .k-hero__w { ${LABEL} font-size:12px !important; letter-spacing:.22em !important; color:rgb(${BONE} / .7) !important; margin-top:8px !important; }
${M} .sx-mkt-tracked { color:rgb(${BONE} / .85) !important; }
${M} .sx-mkt-tracked b { color:rgb(248 244 234) !important; }
/* the drivers dissolve onto the instrument: spread rides the scale's bracket, the rest the foot key */
${M} .sx-mkt-drivers { display:none !important; }
${M} .orr-mkt-subkey { display:flex !important; flex-wrap:wrap; gap:6px 22px; margin:10px 0 0 44px !important; padding:0 !important; }
${M} .orr-mkt-subkey__bit { ${LABEL} font-size:12px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .55) !important; white-space:nowrap; }
${M} .orr-mkt-subkey__bit b { color:rgb(248 244 234) !important; font-weight:650 !important; }
/* the trace is the instrument: a band under the line, beads on a right-edge scale, a Lens on hover */
${M} .sx-mkt-instrument { grid-column:1 !important; min-width:0; }
${M} .sx-mkt-chart .of-chart-area { display:none !important; }
${M} .sx-mkt-instrument__plot { height:clamp(96px, 12vh, 170px) !important; border-bottom:0 !important; cursor:crosshair; }
${M} .sx-mkt-instrument__plot::before { content:""; position:absolute; right:0; top:0; bottom:0; width:9px; pointer-events:none;
  background:repeating-linear-gradient(180deg, rgb(${BONE} / .4) 0 1.5px, transparent 1.5px 8px) 100% 0 / 5px 100% no-repeat,
    linear-gradient(rgb(${BONE} / .6), rgb(${BONE} / .6)) 100% 0 / 2px 100% no-repeat,
    linear-gradient(rgb(${BONE} / .27), rgb(${BONE} / .27)) 100% 0 / 7px 100% no-repeat !important; }
${M} .sx-mkt__quote > .sx-mkt-drivers { margin-top:14px !important; }
${M} .sx-mkt__quote > .sx-mkt-instrument { margin-top:14px !important; }
${M} .sx-mkt__quote > .sx-mkt-readouts { margin-top:12px !important; }
${M} .sx-mkt__quote > .sx-mkt-sale { margin-top:8px !important; }
${M} .sx-mkt-chart .sx-mkt-band { fill:none !important; stroke:rgb(${BONE} / .26) !important; stroke-width:6 !important;
  stroke-linejoin:round !important; stroke-linecap:round !important; }
${M} .sx-mkt-chart .sx-mkt-line { stroke:rgb(248 244 234) !important; stroke-width:2 !important; }
${M} .sx-mkt-chart .sx-mkt-ghost { fill:none !important; stroke:rgb(${BONE} / .8) !important; stroke-width:3 !important;
  stroke-dasharray:5 3 !important; stroke-linecap:round !important; }
${M} .sx-mkt-chart .sx-mkt-ghostbead { fill:rgb(${BONE} / .85) !important; stroke:none !important; }
/* BUY/SELL are beads on the scale, not text flags: bright for what you pay, dimmer for what it pays */
${M} :is(.sx-mkt-instrument__tick--buy, .sx-mkt-instrument__tick--sell) { display:block !important; right:1px !important;
  font-size:0 !important; letter-spacing:0 !important; transform:translateY(-50%) !important; }
${M} .sx-mkt-instrument__tick i { display:block !important; width:7px !important; height:7px !important; border-radius:50% !important;
  background:rgb(248 244 234) !important; box-shadow:0 0 8px 1px rgb(248 244 234 / .5) !important; }
${M} .sx-mkt-instrument__tick--sell i { background:rgb(${BONE} / .6) !important; box-shadow:0 0 6px 1px rgb(${BONE} / .3) !important; }
/* the spread is a bracket on the scale between the beads, its margin the value */
${M} .orr-mkt-spread { position:absolute !important; right:14px !important; width:110px !important; pointer-events:none; }
${M} .orr-mkt-spread::before { content:""; position:absolute; right:0; top:0; bottom:0; width:2px; background:rgb(${BONE} / .6) !important; }
${M} .orr-mkt-spread::after { content:""; position:absolute; right:0; top:0; bottom:0; width:8px;
  background:linear-gradient(rgb(${BONE} / .6), rgb(${BONE} / .6)) 100% 0 / 8px 2px no-repeat,
    linear-gradient(rgb(${BONE} / .6), rgb(${BONE} / .6)) 100% 100% / 8px 2px no-repeat !important; }
${M} .orr-mkt-spread__v { position:absolute; right:12px; top:50%; transform:translateY(-50%); text-align:right;
  ${NUMERAL} font-size:15px !important; font-weight:520 !important; line-height:1.2 !important; color:rgb(248 244 234) !important;
  text-shadow:0 1px 6px rgb(0 0 0 / .9) !important; }
${M} .orr-mkt-spread__k { display:block; ${LABEL} font-size:12px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .6) !important; }
${M} .sx-mkt-instrument__dot { background:rgb(248 244 234) !important; box-shadow:0 0 0 3px rgb(7 8 10 / .8) !important; }
/* the crosshair Lens: a ring round the sample, crosshairs through it, the reading beside it */
${M} .sx-mkt-instrument__cursor i { left:var(--cx, 0%) !important; width:1.5px !important; margin-left:-.75px !important;
  background:rgb(${BONE} / .55) !important; }
${M} .sx-mkt-instrument__cursor i::after { content:""; position:absolute; top:var(--cy, 50%); left:50%; width:34px; height:1.5px;
  margin:-.75px 0 0 -17px; background:rgb(${BONE} / .55) !important; }
${M} .sx-mkt-instrument__cursor::after { left:var(--cx, 0%) !important; top:var(--cy, 50%) !important; width:30px !important; height:30px !important;
  margin:-15px 0 0 -15px !important; border-radius:50% !important; background:transparent !important;
  border:2px solid rgb(248 244 234 / .85) !important;
  box-shadow:0 0 10px rgb(248 244 234 / .25), inset 0 0 8px rgb(248 244 234 / .12) !important; }
${M} .sx-mkt-instrument__cursor b { background:none !important; color:rgb(248 244 234) !important;
  text-shadow:0 1px 6px rgb(0 0 0 / .9), 0 0 12px rgb(0 0 0 / .8) !important; }
/* the readings live on the instrument now; their grid yields to the one demand arc */
${M} .sx-mkt-readouts { display:flex !important; align-items:flex-end; gap:0 clamp(16px, 2vw, 40px) !important;
  margin:18px 0 0 !important; padding:0 !important; }
${M} .sx-mkt-readouts__item:is(.sx-mkt-readouts__item--buy, .sx-mkt-readouts__item--sell, .sx-mkt-readouts__item--avg, .sx-mkt-readouts__item--margin) { position:absolute !important; width:1px !important; height:1px !important;
  overflow:hidden !important; clip:rect(0 0 0 0) !important; }
${M} .sx-mkt-readouts__item--demand { margin:0 !important; }
${M} .sx-mkt-readouts__item--demand dt { ${LABEL} font-size:12px !important; letter-spacing:.16em !important; color:rgb(${BONE} / .6) !important; }
${M} .sx-mkt-readouts__item--demand dd { margin:6px 0 0 !important; }
${M} .orr-mkt-demand { display:inline-flex; align-items:center; gap:10px; }
${M} .orr-mkt-demand svg { width:64px; height:40px; overflow:visible; display:block; }
${M} .orr-mkt-demand__w { font-size:15px !important; font-weight:520; color:rgb(248 244 234) !important; }
${M} .sx-mkt-instrument__avg { color:rgb(${BONE} / .72) !important; }
${M} .sx-mkt__analysis { -webkit-mask-image:none !important; mask-image:none !important; border:0 !important; box-shadow:none !important; }
${M} .so-route-disclosure { border-top:0 !important; border-bottom:0 !important; margin-top:22px !important; padding-top:0 !important; }
${M} .sx-trade, ${M} .sx-mkt__console { border-top:0 !important; }
${M} .sx-mkt-sale { color:rgb(${BONE} / .75) !important; }
${M} .sx-mkt-chart-key { position:relative; padding-top:10px !important;
  background:repeating-linear-gradient(90deg, rgb(${BONE} / .34) 0 1.5px, transparent 1.5px 8px) 0 0 / 100% 5px no-repeat,
    linear-gradient(rgb(${BONE} / .55), rgb(${BONE} / .55)) 0 0 / 100% 2px no-repeat,
    linear-gradient(rgb(${BONE} / .27), rgb(${BONE} / .27)) 0 0 / 100% 7px no-repeat !important; }
${M} .sx-mkt-chart-key, ${M} .sx-mkt-chart-key [data-history-key] { color:rgb(${BONE} / .7) !important; }
${M} .so-route-disclosure > summary { ${LABEL} font-size:12px !important; letter-spacing:.18em !important; color:rgb(${BONE} / .62) !important; list-style:none; cursor:pointer; }
${M} .so-route-disclosure > summary::-webkit-details-marker { display:none; }
${M} .so-route-disclosure > summary::before { content:"›  "; }
${M} .so-route-disclosure[open] > summary::before { content:"‹  "; }
${M} .so-route-disclosure > summary:is(:hover, :focus-visible) { color:rgb(248 244 234) !important; outline:none; }
/* the tape: the ladder's prices streaming under the analysis — one ruled line, names dim, prices lit, movers in ice */
${M} .orr-mkt-tape { position:relative; overflow:hidden; margin:14px 0 0 !important; padding:9px 0 11px !important;
  background:repeating-linear-gradient(90deg, rgb(${BONE} / .34) 0 1.5px, transparent 1.5px 8px) 0 0 / 100% 5px no-repeat,
    linear-gradient(rgb(${BONE} / .55), rgb(${BONE} / .55)) 0 0 / 100% 2px no-repeat !important;
  -webkit-mask-image:linear-gradient(90deg, transparent, #000 48px, #000 calc(100% - 48px), transparent);
  mask-image:linear-gradient(90deg, transparent, #000 48px, #000 calc(100% - 48px), transparent); }
${M} .orr-mkt-tape__run { display:flex !important; width:max-content; animation:orr-mkt-tape 48s linear infinite; }
${M} .orr-mkt-tape__half { display:inline-flex !important; align-items:baseline; white-space:nowrap; }
${M} .orr-mkt-tape__it { ${LABEL} font-size:12px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .6) !important; padding:0 4px 0 22px !important; }
${M} .orr-mkt-tape__p { ${NUMERAL} color:rgb(248 244 234) !important; letter-spacing:.02em !important; }
${M} .orr-mkt-tape__t { color:var(--dp-ice, #8fcbff) !important; }
@keyframes orr-mkt-tape { from { transform:translateX(0); } to { transform:translateX(-50%); } }
${M} .orr-mkt-tape:hover .orr-mkt-tape__run { animation-play-state:paused; }
html.sf-reduce-motion ${M} .orr-mkt-tape__run { animation:none; flex-wrap:wrap; width:auto; }
html.sf-reduce-motion ${M} .orr-mkt-tape__half { display:contents !important; }
html.sf-reduce-motion ${M} .orr-mkt-tape__half + .orr-mkt-tape__half { display:none !important; }

/* ---- the trade: a dial of light round the amount, the total rolling, the verb a Lamp Key ------ */
${M} .sx-mkt__console, ${M} .sx-mkt__trade { ${PLAIN} padding:0 !important; }
${M} .sx-mkt__console::before, ${M} .sx-mkt__console::after, ${M} .sx-trade::before, ${M} .sx-trade::after { display:none !important; }
${M} .sx-trade { ${PLAIN} padding:0 !important; display:grid !important;
  grid-template-columns:212px minmax(0, 1fr); grid-template-rows:1fr auto auto auto auto 1fr;
  grid-template-areas:"dial ." "dial total" "dial note" "dial verb" "dial breakdown" "dial ."; column-gap:32px; row-gap:6px; align-items:center; }
${M} .sx-trade > .sx-qty { grid-area:dial; position:relative; display:block !important; width:212px; height:236px; ${PLAIN} padding:0 !important; }
${M} .sx-qty .orr-qdial { position:absolute; left:6px; top:0; width:200px; height:200px; overflow:visible; cursor:grab; touch-action:none; }
${M} .sx-qty.is-turning .orr-qdial { cursor:grabbing; }
${M} .orr-qdial path, ${M} .orr-qdial circle { fill:none; }
${M} .orr-qdial__band { stroke:rgb(${BONE} / .28); stroke-width:6; }
${M} .orr-qdial__track { stroke:rgb(${BONE} / .6); stroke-width:1.5; }
${M} .orr-qdial__ticks-min { stroke:rgb(${BONE} / .4); stroke-width:1.1; }
${M} .orr-qdial__ticks-maj { stroke:rgb(${BONE} / .65); stroke-width:1.5; }
${M} .orr-qdial__fillbloom { stroke:rgb(248 244 234 / .22); stroke-width:7.5; transition:stroke-dasharray .35s cubic-bezier(.3, 1.2, .5, 1); }
${M} .orr-qdial__fill { stroke:rgb(248 244 234); stroke-width:2.4; transition:stroke-dasharray .35s cubic-bezier(.3, 1.2, .5, 1); }
${M} .orr-qdial__hand { transform-box:view-box; transform-origin:75px 75px; transition:transform .35s cubic-bezier(.3, 1.2, .5, 1); }
${M} .orr-qdial__needle { stroke:rgb(248 244 234); stroke-width:1.5; }
${M} .orr-qdial circle.orr-qdial__bead { fill:rgb(248 244 234); }
${M} .sx-qty:is(:focus-within, :hover, .is-turning) :is(.orr-qdial__needle) { stroke:rgb(250 247 238); }
${M} .sx-qty:is(:focus-within, :hover, .is-turning) circle.orr-qdial__bead { fill:rgb(250 247 238); }
${M} .sx-qty:is(:focus-within, :hover, .is-turning) .orr-qdial__fill { stroke:rgb(250 247 238); }
${M} .sx-qty:is(:focus-within, :hover, .is-turning) .orr-qdial__fillbloom { stroke:rgb(248 244 234 / .3); }
${M} .sx-qty.is-turning :is(.orr-qdial__fill, .orr-qdial__fillbloom, .orr-qdial__hand) { transition:none; }
${M} .orr-qdial__end { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:12px; letter-spacing:.08em; fill:rgb(${BONE} / .55); }
${M} .sx-qty .sx-qty__k { position:absolute; left:6px; width:200px; top:60px; text-align:center; margin:0 !important; padding:0 !important;
  ${LABEL} font-size:12px !important; letter-spacing:.24em !important; color:rgb(${BONE} / .55) !important; background:none !important; pointer-events:none; }
${M} .sx-qty .sx-qty__in { position:absolute !important; left:46px; width:120px !important; top:76px; height:54px !important; margin:0 !important; padding:0 !important;
  ${PLAIN} border-radius:0 !important; text-align:center; font-family:var(--dp-face-display, "Archivo") !important; font-stretch:100%;
  font-variation-settings:"wdth" 100, "wght" 560 !important; font-size:44px !important; line-height:54px !important; color:rgb(248 244 234) !important;
  font-variant-numeric:tabular-nums; caret-color:var(--dp-hand, #f2b950); cursor:ew-resize; }
${M} .sx-qty .sx-qty__in:focus { outline:none !important; color:rgb(255 244 222) !important; }
${M} .sx-qty .sx-qty__words { position:absolute !important; left:0; right:0; top:208px; display:flex !important; justify-content:space-between !important;
  gap:0 !important; margin:0 !important; padding:0 !important; }
${M} .sx-qty .sx-qty__words li { margin:0 !important; }
${M} .sx-qty :is(.sx-qty__b, .sx-qty__max) { ${PLAIN} ${LABEL} min-height:0 !important; min-width:0 !important; height:auto !important; padding:3px 2px !important;
  font-size:12px !important; letter-spacing:.18em !important; color:rgb(${BONE} / .75) !important; }
${M} .sx-qty :is(.sx-qty__b, .sx-qty__max)::before, ${M} .sx-qty :is(.sx-qty__b, .sx-qty__max)::after { display:none !important; }
${M} .sx-qty .sx-qty__b[data-q="-1"]::before { content:"‹  " !important; display:inline !important; position:static !important; width:auto !important;
  height:auto !important; background:none !important; transform:none !important; }
${M} .sx-qty .sx-qty__b[data-q="1"]::after { content:"  ›" !important; display:inline !important; position:static !important; width:auto !important;
  height:auto !important; background:none !important; transform:none !important; }
${M} .sx-qty :is(.sx-qty__b, .sx-qty__max):is(:hover, :focus-visible) { color:var(--dp-hand, #f2b950) !important; outline:none !important; }
${M} .so-trade-total { grid-area:total; display:flex !important; flex-direction:column; gap:6px; ${PLAIN} padding:0 !important; }
${M} .so-trade-total > span { ${LABEL} font-size:12px !important; letter-spacing:.22em !important; color:rgb(${BONE} / .65) !important; }
${M} .so-trade-total > strong { font-family:var(--dp-face-display, "Archivo") !important; font-stretch:100%; font-variation-settings:"wdth" 100, "wght" 560 !important;
  font-size:clamp(28px, 3.2vh, 40px) !important; line-height:1 !important; color:rgb(248 244 234) !important; font-variant-numeric:tabular-nums; }
${M} [data-trade-total] .orr-mkt-totalsuf { color:rgb(${BONE} / .7) !important; }
/* the hold arc: what the hold looks like after this trade */
${M} .orr-mkt-holdarc { display:flex; align-items:center; gap:10px; margin-top:8px !important; }
${M} .orr-mkt-holdarc[hidden] { display:none !important; }
${M} .orr-mkt-holdarc svg { width:104px; height:60px; overflow:visible; display:block; }
${M} .orr-mkt-holdarc__t { ${LABEL} font-size:12px !important; letter-spacing:.14em !important; color:rgb(${BONE} / .6) !important; }
${M} .orr-mkt-holdarc__t b { display:block; ${NUMERAL} font-size:15px !important; font-weight:520 !important; letter-spacing:0 !important;
  text-transform:none !important; color:rgb(248 244 234) !important; margin-top:3px; }
${M} .sx-trade__note { grid-area:note; margin:0 !important; font-size:12.5px !important; color:rgb(${BONE} / .8) !important; }
${M} .so-trade-breakdown { grid-area:breakdown; ${PLAIN} padding:0 !important; }
${M} .so-trade-breakdown > summary { ${LABEL} font-size:12px !important; letter-spacing:.18em !important; color:rgb(${BONE} / .62) !important; cursor:pointer; list-style:none; }
${M} .so-trade-breakdown > summary::-webkit-details-marker { display:none; }
${M} .so-trade-breakdown > summary::before { content:"›  "; }
${M} .so-trade-breakdown > summary span { display:none; }
${M} .so-trade-breakdown[open] > summary::before { content:"‹  "; }
${M} .sx-trade__words { grid-area:verb; display:flex !important; flex-direction:row; align-items:center; justify-content:flex-start; gap:26px !important;
  margin:4px 0 0 !important; padding:0 !important; }
${M} .sx-trade__words li { margin:0 !important; }
${M} .sx-trade__words li:has([data-go]) { order:-1; }
/* the commit is the tab's Lamp Key; the kit's words must not repaint it */
${M} .sx-trade__go.orr-lampkey { min-height:46px !important; font-size:16px !important; padding:0 26px 0 20px !important; color:#1c1406 !important;
  background:none !important; background-image:none !important; text-shadow:none !important; border:0 !important; box-shadow:none !important; border-radius:0 !important; }
${M} .sx-trade__go.orr-lampkey:is(:hover, :focus-visible, :active) { color:#1c1406 !important; background-image:none !important; text-shadow:none !important; }
${M} .sx-trade__go.orr-lampkey:disabled { color:rgb(${BONE} / .76) !important; }
/* the verb morphs between BUY and SELL */
${M} .orr-lampkey__word.orr-mkt-morph { display:inline-block; animation:orr-mkt-morph-in .3s var(--dp-ease-out, ease-out); }
@keyframes orr-mkt-morph-in { from { opacity:0; transform:translateY(7px); filter:blur(3px); } to { opacity:1; transform:none; filter:none; } }
/* the other side only switches mode: a word */
${M} .sx-trade__go:not([data-go]) { ${PLAIN} ${LABEL} min-height:0 !important; min-width:0 !important; height:auto !important; border-radius:0 !important;
  font-size:12px !important; letter-spacing:.22em !important; color:rgb(${BONE} / .66) !important; padding:4px 2px !important; }
${M} .sx-trade__go:not([data-go])::before, ${M} .sx-trade__go:not([data-go])::after { all:unset !important; display:inline !important; color:inherit !important; }
${M} .sx-trade__go:not([data-go])::before { display:none !important; }
${M} .sx-trade__go:not([data-go])::after { content:"  ›" !important; }
${M} .sx-trade__go:not([data-go]):is(:hover, :focus-visible) { color:rgb(248 244 234) !important; outline:none !important; }

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
${M} .sx-decision__opt .k-row__name { ${LABEL} font-size:12px !important; letter-spacing:.16em !important; color:rgb(248 244 234) !important; white-space:nowrap; flex:none; }
${M} .sx-decision__opt .k-row__sub { font-size:12px !important; color:rgb(${BONE} / .7) !important; }
${M} .sx-decision__opt:is(:hover, :focus-visible) .k-row__name { color:var(--dp-hand, #f2b950) !important; }
${M} .sx-decision__opt:is(:hover, :focus-visible) { outline:none !important; }
html.sf-reduce-motion ${M} :is(.orr-qdial__fill, .orr-qdial__fillbloom, .orr-qdial__hand) { transition:none; }
html.sf-reduce-motion ${M} .orr-lampkey__word.orr-mkt-morph { animation:none; }
html body #screens > .sx-berth.orr-station .sx-comms__count:not([hidden]) { font-size:0 !important; width:6px; height:6px; padding:0 !important; margin-left:2px;
  border-radius:50% !important; background:rgb(248 244 234) !important; display:inline-block !important; vertical-align:middle; }
html body #screens > .sx-berth.orr-station .sx-receipt__delta { color:var(--dp-ice, #8fcbff) !important; }
@media (max-height:800px) {
  ${M} .sx-mkt__stage { display:grid !important; grid-template-columns:minmax(0, 1fr) 244px !important; grid-template-rows:minmax(0, 1fr) auto; column-gap:28px; }
  ${M} .sx-mkt__analysis { grid-column:1 !important; }
  /* the hero yields width to the trace: a smaller numeral, its words sleep (the verb says it),
     so the plot keeps ~300px */
  ${M} .sx-mkt__hero .k-hero__n { font-size:44px !important; }
  ${M} .sx-mkt__hero .k-hero__w { display:none !important; }
  ${M} .sx-mkt__hero { padding-left:12px !important; }
  ${M} .sx-trade > .sx-qty { width:210px; height:204px; }
  ${M} .sx-qty .orr-qdial { left:20px; width:170px; height:170px; }
  ${M} .sx-qty .sx-qty__k { left:20px; width:170px; top:50px; }
  ${M} .sx-qty .sx-qty__in { left:55px; width:100px !important; top:64px; height:44px !important; font-size:36px !important; line-height:44px !important; }
  ${M} .sx-qty .sx-qty__words { top:176px; left:4px; right:4px; }
  ${M} .sx-mkt-instrument__plot { height:80px !important; }
  ${M} .sx-mkt-chart-key { display:flex !important; margin-top:4px !important; font-size:12px !important; }
  ${M} .sx-mkt-chart-key > span { white-space:nowrap !important; flex:none !important; }
  ${M} .sx-mkt-chart-key { font-size:12px !important; letter-spacing:.06em !important; margin-left:12px !important; }
  ${M} .orr-mkt-subkey { margin-left:20px !important; }
  ${M} .sx-qty .orr-qdial { filter:drop-shadow(0 0 6px rgb(7 8 10 / .9)); }
  ${M} .sx-mkt__quote > .sx-mkt-chain { display:none !important; }
  ${M} .sx-mkt__quote > :is(.sx-mkt-readouts, .sx-mkt-sale) { display:none !important; }
  ${M} .sx-mkt__analysis { -webkit-mask-image:linear-gradient(180deg, #000 calc(100% - 22px), transparent) !important; mask-image:linear-gradient(180deg, #000 calc(100% - 22px), transparent) !important; }
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
  ${M} .sx-trade { grid-template-columns:minmax(0, 1fr) !important; grid-template-areas:"dial" "total" "note" "verb" "breakdown" !important; justify-items:center; row-gap:4px; }
  ${M} .so-trade-total { align-items:center; display:grid !important; grid-template-columns:auto auto !important; justify-content:center; align-items:center; column-gap:14px; }
  ${M} .so-trade-total > span { grid-column:1 / -1; text-align:center; }
  ${M} .so-trade-total > strong { grid-column:1; white-space:nowrap !important; }
  ${M} .orr-mkt-holdarc { grid-column:2; margin-top:0 !important; }
  ${M} .orr-mkt-holdarc svg { width:84px; height:48px; }
  ${M} .sx-trade__words { margin-top:0 !important; }
  ${M} .sx-trade__note { text-align:center; }
  ${M} .sx-trade__words { justify-content:center; }
  ${M} .orr-mkt-holdarc { justify-content:center; }
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
