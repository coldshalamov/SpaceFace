// ORRERY composition for the station's shell (design/frontend/ORRERY.md §6 Station): the berth's
// name, the purse, the four ship vitals as small dials of light, the destination rail with the Hand,
// and Undock as the one primary verb. It styles the shell's existing nodes (the station checks read
// their classes, roles and widths) and pins nothing: every rule is scoped to `.orr-station`.
import { injectOrrery } from './tokens.js';
import { arcD, polar, ticksD } from './svg.js';

const STYLE_ID = 'sf-orrery-station';
const f = (n) => Math.round(n * 100) / 100;

// One dial: a 260-degree arc open at the foot, quarter ticks outside it, the fill as a unit-length
// dash with a bead at its live end. Returned as markup because the vitals row is rebuilt as a string.
const DIAL = { w: 76, h: 50, cx: 38, cy: 30, r: 23, from: -130, to: 130 };

export function vitalDialSvg({ frac = 0, bare = false } = {}) {
  const { w, h, cx, cy, r, from, to } = DIAL;
  const v = Math.max(0, Math.min(1, Number.isFinite(frac) ? frac : 0));
  const d = arcD(cx, cy, r, from, to);
  const ticks = ticksD(cx, cy, r + 2.5, 4, { len: 3, from, to, inward: false });
  const [hx, hy] = polar(cx, cy, r, from + (to - from) * v);
  const fill = bare ? ''
    : `<path class="orr-vdial__fill" d="${d}" pathLength="1" stroke-dasharray="${f(v)} 1"/>`
      + (v > 0.004 ? `<circle class="orr-vdial__bead" cx="${f(hx)}" cy="${f(hy)}" r="2.3"/>` : '');
  return `<svg class="orr-vdial" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" focusable="false">`
    + `<path class="orr-vdial__track${bare ? ' is-bare' : ''}" d="${d}"/>`
    + `<path class="orr-vdial__ticks" d="${ticks}"/>${fill}</svg>`;
}

/** "86 / 100" → a numeral and its denominator (same text, so every reader still sees "86 / 100"). */
export function vitalValueHtml(value, escape) {
  const text = String(value == null ? '' : value);
  const m = /^\s*([-+]?[\d,.]+)(\s*\/\s*.+)$/.exec(text);
  if (!m) return `<b class="orr-vnum is-word">${escape(text)}</b>`;
  return `<b class="orr-vnum">${escape(m[1])}</b><span class="orr-vden">${escape(m[2])}</span>`;
}

const S = 'html body #screens > .sx-berth.orr-station';
const BONE = '236 230 216';

const CSS = `
/* ---- the head: one title size on every tab, a bone rule, the finder as a word ---------------- */
${S} .sxb-berth__name, ${S} .sxb-berth__name.k-t-hero, ${S} .sxb-berth__name.k-t-title,
${S} .sxb-berth__name.fh-hero, ${S} .sxb-berth__name.fh-title {
  font-size:clamp(30px, 2.35vw, 46px) !important; line-height:1 !important; letter-spacing:.01em; }
${S} .so-station-title { width:max-content !important; max-width:100%; }
${S} .dp-title__rule { background:linear-gradient(90deg, rgb(${BONE} / .6), rgb(${BONE} / 0)) !important; height:1px !important; box-shadow:none !important; }
${S} .so-command-trigger { background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important; clip-path:none !important;
  min-height:0 !important; height:auto !important; padding:4px 0 !important; gap:9px !important; font-family:var(--dp-face-label, "Archivo"); font-stretch:112%;
  font-weight:650; font-size:11px !important; letter-spacing:.22em; text-transform:uppercase; color:rgb(${BONE} / .62) !important; }
${S} .so-command-trigger::before, ${S} .so-command-trigger::after { display:none !important; }
${S} .so-command-trigger .so-icon { width:14px; height:14px; }
${S} .so-command-trigger .dp-kbd { background:none !important; border:1px solid rgb(${BONE} / .28) !important; border-radius:2px !important; box-shadow:none !important;
  padding:1px 5px !important; font-size:9.5px !important; letter-spacing:.12em; color:rgb(${BONE} / .6) !important; }
${S} .so-command-trigger:is(:hover, :focus-visible) { color:rgb(246 241 230) !important; outline:none !important; }
${S} .so-command-trigger:focus-visible { color:var(--dp-hand, #f2b950) !important; }

/* ---- the crown: the purse is the one numeral; the vitals are dials of light under it ----------- */
${S} .sxb-crown { background:none !important; border:0 !important; box-shadow:none !important; position:relative; isolation:isolate; }
/* a pool of shade under the readings (no edge): the bay's truss stays the picture, the small words stay legible */
${S} .sxb-crown::before { content:""; position:absolute; z-index:-1; inset:-60px -40px -70px -120px; pointer-events:none;
  background:radial-gradient(closest-side, rgb(4 5 8 / .72), rgb(4 5 8 / .45) 55%, rgb(4 5 8 / 0)); }
${S} .sxb-purse__value { color:rgb(248 244 234) !important; text-shadow:0 0 22px rgb(0 0 0 / .55) !important; }
${S} .sxb-purse__label { color:rgb(${BONE} / .6) !important; }
${S} .sxb-vitals { display:flex !important; flex-wrap:nowrap !important; justify-content:flex-end; align-items:flex-start; gap:6px 18px !important;
  list-style:none; margin:10px 0 0 !important; padding:0 !important; background:none !important; border:0 !important; }
${S} .sxb-vital { display:flex !important; flex-direction:column; align-items:center; position:relative; min-width:84px; width:auto !important;
  margin:0 !important; padding:0 !important; gap:0 !important; background:none !important; border:0 !important; box-shadow:none !important; }
${S} .sxb-vital::before, ${S} .sxb-vital::after { display:none !important; }
${S} .sxb-vital__head { display:flex !important; flex-direction:column; align-items:center; gap:1px; background:none !important; border:0 !important;
  box-shadow:none !important; padding:0 !important; min-height:0 !important; width:auto !important; color:inherit; cursor:default; }
${S} button.sxb-vital__head { cursor:pointer; }
${S} .sxb-vital__head > .so-icon { display:none !important; }
${S} .sxb-vital__track { order:-1; display:block !important; position:relative; width:76px !important; height:50px !important; margin:0 !important;
  background:none !important; border:0 !important; box-shadow:none !important; overflow:visible !important; }
${S} .sxb-vital__track > .sxb-vital__fill { display:none !important; }
${S} .sxb-vital > .orr-vdial-bare { display:block; width:76px; height:50px; }
${S} .orr-vdial { display:block; width:76px; height:50px; overflow:visible; }
${S} .orr-vdial path { fill:none; stroke-linecap:butt; }
${S} .orr-vdial__track { stroke:rgb(${BONE} / .2); stroke-width:3; }
${S} .orr-vdial__track.is-bare { stroke-dasharray:1.5 3.2; stroke:rgb(${BONE} / .32); stroke-width:3; }
${S} .orr-vdial__ticks { stroke:rgb(${BONE} / .42); stroke-width:1; }
${S} .orr-vdial__fill { stroke:rgb(${BONE} / .86); stroke-width:3; transition:stroke-dasharray .6s cubic-bezier(.3, 1.2, .5, 1); }
${S} .orr-vdial__bead { fill:rgb(246 241 230); }
${S} .sxb-vital[data-tone='warn'] .orr-vdial__fill { stroke:rgb(250 247 238); }
${S} .sxb-vital[data-tone='bad'] .orr-vdial__fill { stroke:var(--dp-danger, #ff5038); }
${S} .sxb-vital[data-tone='bad'] .orr-vdial__bead { fill:var(--dp-danger, #ff5038); }
${S} .sxb-vital__value { position:absolute !important; left:0; right:0; top:15px; margin:0 !important; padding:0 !important; text-align:center; pointer-events:none;
  display:flex; flex-direction:column; align-items:center; line-height:1 !important; background:none !important; color:rgb(246 241 230) !important; }
${S} .sxb-vital__value .orr-vnum { font-family:var(--dp-face-display, "Archivo"); font-stretch:100%; font-weight:600; font-size:18px; letter-spacing:0;
  font-variant-numeric:tabular-nums; }
${S} .sxb-vital__value .orr-vnum.is-word { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:700; font-size:10.5px; letter-spacing:.18em;
  text-transform:uppercase; margin-top:5px; }
${S} .sxb-vital__value .orr-vden { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:600; font-size:9px; letter-spacing:.1em;
  margin-top:3px; color:rgb(${BONE} / .5); white-space:nowrap; }
${S} .sxb-vital[data-tone='bad'] .sxb-vital__value { color:var(--dp-danger, #ff5038) !important; }
${S} .sxb-vital__label { font-family:var(--dp-face-label, "Archivo") !important; font-stretch:112%; font-weight:650 !important; font-size:10px !important;
  letter-spacing:.24em !important; text-transform:uppercase; color:rgb(${BONE} / .66) !important; margin-top:1px; }
${S} button.sxb-vital__head:is(:hover, :focus-visible) .sxb-vital__label { color:rgb(246 241 230) !important; }
${S} button.sxb-vital__head:focus-visible { outline:none !important; }
${S} button.sxb-vital__head:focus-visible .sxb-vital__label { color:var(--dp-hand, #f2b950) !important; }
${S} .sxb-vital__acts { display:flex !important; flex-direction:column; align-items:center; gap:3px; margin-top:5px !important; min-height:0 !important; }
${S} .sxb-vital__acts:empty { display:none !important; }
${S} .sxb-vital [data-vital-act] { background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important; clip-path:none !important;
  min-height:0 !important; min-width:0 !important; height:auto !important; padding:1px 0 3px !important; margin:0 !important; white-space:nowrap;
  font-family:var(--dp-face-label, "Archivo") !important; font-stretch:112%; font-weight:650 !important; font-size:10px !important; letter-spacing:.16em !important;
  text-transform:uppercase; color:rgb(${BONE} / .8) !important;
  background-image:linear-gradient(90deg, rgb(${BONE} / .32), rgb(${BONE} / .32)) !important; background-size:100% 1px !important;
  background-position:0 100% !important; background-repeat:no-repeat !important; }
${S} .sxb-vital [data-vital-act]::before, ${S} .sxb-vital [data-vital-act]::after { display:none !important; }
${S} .sxb-vital [data-vital-act]:has(.orr-act__verb) { display:inline-flex !important; flex-direction:column; align-items:center; gap:3px;
  background-image:none !important; padding:1px 0 0 !important; }
${S} .sxb-vital [data-vital-act] .orr-act__verb { padding-bottom:3px; background-image:linear-gradient(90deg, rgb(${BONE} / .32), rgb(${BONE} / .32));
  background-size:100% 1px; background-position:0 100%; background-repeat:no-repeat; }
${S} .sxb-vital [data-vital-act] .orr-act__sep { display:none; }
${S} .sxb-vital [data-vital-act] .orr-act__cost { font-size:9.5px; letter-spacing:.12em; color:rgb(${BONE} / .55); }
${S} .sxb-vital [data-vital-act]:is(:hover, :focus-visible) .orr-act__verb { background-image:linear-gradient(90deg, var(--dp-hand, #f2b950), var(--dp-hand, #f2b950)); }
${S} .sxb-vital [data-vital-act]:is(:hover, :focus-visible) .orr-act__cost { color:rgb(255 217 140 / .7); }
${S} .sxb-vital [data-vital-act]:is(.is-ghost, .sxb-vital__act--ghost, [data-ghost]) { color:rgb(${BONE} / .5) !important; background-image:none !important; }
${S} .sxb-vital [data-vital-act]:is(:hover, :focus-visible) { color:var(--dp-hand, #f2b950) !important; outline:none !important;
  background-image:linear-gradient(90deg, var(--dp-hand, #f2b950), var(--dp-hand, #f2b950)) !important; }
${S} .sxb-vital [data-vital-act]:is(.is-disabled, [aria-disabled='true'], :disabled) { color:rgb(${BONE} / .36) !important; background-image:none !important; }
${S} .sxb-vital__ok { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:600; font-size:10px !important; letter-spacing:.18em;
  text-transform:uppercase; color:rgb(${BONE} / .42) !important; background:none !important; border:0 !important; padding:1px 0 !important; }
${S} .sxb-vital--industry .sxb-vital__value { position:static !important; margin-top:2px !important; pointer-events:auto; }
${S} .sxb-vital--industry .sxb-vital__value .orr-vnum.is-word { margin-top:0; letter-spacing:.12em; }

/* ---- the foot: destinations as words on a ruled line with the Hand; comms and help as words ---- */
${S} .sxb-ops, ${S} .sxb-ops .of-facility-rail { align-items:flex-start !important; }
${S} .sxb-ops .so-berth-status { align-self:flex-start !important; height:auto !important; min-height:0 !important; padding:13px 0 0 !important; gap:8px; }
${S} .sxb-ops .sx-comms { align-self:flex-start !important; margin-top:8px !important; }
${S} .sxb-ops :is(.sx-comms__toggle, .sxb-help) { display:inline-flex !important; align-items:center; }
${S} .sxb-ops .sxb-launch-seat { align-self:flex-start !important; margin-top:-8px !important; }
${S} .sxb-ops .sx-dock__group--nav { gap:0 clamp(14px, 1.6vw, 30px) !important; padding-left:6px !important; }
${S} .sxb-ops .sx-tile { background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important; clip-path:none !important;
  color:rgb(${BONE} / .58) !important; padding:6px 2px !important; }
${S} .sxb-ops .sx-tile::before, ${S} .sxb-ops .sx-tile::after { display:none !important; }
/* the kit's legend keys widen their face on hover; a destination's hitbox never moves, so the face is pinned */
${S} .sxb-ops .sx-tile, ${S} .sxb-ops .sx-tile:is(:hover, :focus, :focus-visible, .is-active) { font-variation-settings:"wdth" 100, "wght" 560 !important; }
${S} .sxb-ops .sx-tile .sx-tile__label, ${S} .sxb-ops .sx-tile:is(:hover, :focus, :focus-visible, .is-active) .sx-tile__label {
  font-variation-settings:"wdth" 112, "wght" 650 !important; }
${S} .sxb-ops .sx-tile__label { font-family:var(--dp-face-label, "Archivo") !important; font-stretch:112%; font-weight:650 !important; font-size:11px !important;
  letter-spacing:.22em !important; text-transform:uppercase; color:inherit !important; }
${S} .sxb-ops .sx-tile__seat { color:inherit !important; background:none !important; border:0 !important; box-shadow:none !important; }
${S} .sxb-ops .sx-tile__seat::before, ${S} .sxb-ops .sx-tile__seat::after { display:none !important; }
${S} .sxb-ops .sx-tile__seat .so-icon { stroke:currentColor; }
${S} .sxb-ops .sx-tile:is(:hover, :focus-visible) { color:rgb(${BONE} / .9) !important; outline:none !important; }
${S} .sxb-ops .sx-tile.is-active { color:rgb(248 244 234) !important; }
${S} .sxb-ops .sx-tile.is-active .sx-tile__label { text-shadow:0 0 14px rgb(0 0 0 / .7); }
${S} .sxb-ops .sx-tile__badge { background:none !important; border:0 !important; color:rgb(248 244 234) !important; font-weight:700 !important;
  font-size:10.5px !important; letter-spacing:.06em !important; margin-right:6px; }
${S} .sxb-ops .sx-tile.is-attention .sx-tile__seat::before { display:none !important; }
${S} .sxb-ops .so-berth-status { color:rgb(${BONE} / .45) !important; font-size:10px !important; letter-spacing:.24em !important; font-weight:650;
  background:none !important; border:0 !important; }
${S} .sxb-ops .so-berth-status .so-icon { color:rgb(${BONE} / .5); }
${S} .sxb-ops :is(.sx-comms__toggle, .sxb-help) { background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important;
  clip-path:none !important; min-height:0 !important; min-width:0 !important; height:auto !important; padding:6px 2px !important; gap:8px !important;
  font-family:var(--dp-face-label, "Archivo") !important; font-stretch:112%; font-weight:650 !important; font-size:11px !important;
  letter-spacing:.22em !important; text-transform:uppercase; color:rgb(${BONE} / .62) !important; }
${S} .sxb-ops :is(.sx-comms__toggle, .sxb-help)::before, ${S} .sxb-ops :is(.sx-comms__toggle, .sxb-help)::after { display:none !important; }
${S} .sxb-ops :is(.sx-comms__toggle, .sxb-help) .so-icon { width:14px; height:14px; }
${S} .sxb-ops :is(.sx-comms__toggle, .sxb-help):is(:hover, :focus-visible, [aria-expanded='true']) { color:rgb(246 241 230) !important; outline:none !important; }
${S} .sxb-ops :is(.sx-comms__toggle, .sxb-help):focus-visible { color:var(--dp-hand, #f2b950) !important; }
${S} .sxb-ops .sx-comms__count { background:none !important; border:0 !important; color:rgb(248 244 234) !important; font-weight:700; }

/* ---- Undock: the one primary verb. Bone at rest; amber where the player reaches; red at risk --- */
${S} .sxb-launch-seat { background:none !important; border:0 !important; box-shadow:none !important; clip-path:none !important; }
${S} .sxb-launch-seat::before, ${S} .sxb-launch-seat::after { display:none !important; }
${S} .sxb-launch { position:relative; display:inline-flex !important; align-items:center; gap:14px !important; overflow:visible !important;
  background:none !important; border:0 !important; border-image:none !important; border-radius:0 !important; box-shadow:none !important; clip-path:none !important;
  min-width:0 !important; min-height:0 !important; height:auto !important; padding:8px 4px 12px !important; color:rgb(246 241 230) !important;
  background-image:linear-gradient(90deg, rgb(${BONE} / .6), rgb(${BONE} / 0)) !important; background-size:100% 2px !important;
  background-position:0 100% !important; background-repeat:no-repeat !important; text-shadow:0 0 16px rgb(0 0 0 / .6); }
${S} .sxb-launch::before, ${S} .sxb-launch::after { display:none !important; }
${S} .sxb-launch__light { display:none !important; }
${S} .sxb-launch__copy { display:flex !important; flex-direction:column; align-items:flex-start; gap:4px; }
${S} .sxb-launch__label { font-family:var(--dp-face-display, "Archivo") !important; font-stretch:125%; font-variation-settings:"wght" 800, "wdth" 125;
  font-size:clamp(18px, 2.1vh, 24px) !important; letter-spacing:.12em !important; text-transform:uppercase; line-height:1 !important; color:inherit !important; }
${S} .sxb-launch__state { font-family:var(--dp-face-label, "Archivo") !important; font-stretch:112%; font-weight:650 !important; font-size:10px !important;
  letter-spacing:.24em !important; text-transform:uppercase; line-height:1 !important; color:rgb(${BONE} / .6) !important; }
${S} .sxb-launch > .so-icon { width:22px; height:22px; color:rgb(${BONE} / .7); }
${S} .sxb-launch:is(:hover, :focus-visible) { color:var(--dp-hand-hot, #ffd98c) !important; outline:none !important; text-shadow:0 0 24px rgb(255 217 140 / .45);
  background-image:linear-gradient(90deg, var(--dp-hand, #f2b950), rgb(242 185 80 / 0)) !important; }
${S} .sxb-launch:is(:hover, :focus-visible) > .so-icon { color:var(--dp-hand, #f2b950); }
${S} .sxb-launch:is(:hover, :focus-visible) .sxb-launch__state { color:rgb(255 217 140 / .75) !important; }
${S} .sxb-launch[data-state='check'] .sxb-launch__state { color:rgb(250 247 238) !important; }
${S} .sxb-launch[data-state='risk'] { background-image:linear-gradient(90deg, var(--dp-danger, #ff5038), rgb(255 80 56 / 0)) !important; }
${S} .sxb-launch[data-state='risk'] .sxb-launch__state { color:var(--dp-danger, #ff5038) !important; }
html.sf-reduce-motion ${S} .orr-vdial__fill { transition:none; }
`;

export function injectOrreryStation(doc = globalThis.document) {
  if (!doc?.head || typeof doc.createElement !== 'function') return;
  injectOrrery(doc);
  if (typeof doc.getElementById === 'function' && doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
