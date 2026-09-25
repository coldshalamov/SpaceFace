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
  // the bead rides a hand that turns about the dial's centre, so it and the arc glide together
  const fill = bare ? ''
    : `<path class="orr-vdial__fill" d="${d}" pathLength="1" stroke-dasharray="${f(v)} 1"/>`
      + `<g class="orr-vdial__hand" style="transform:rotate(${f(from + (to - from) * v)}deg)"${v > 0.004 ? '' : ' opacity="0"'}>`
      + `<circle class="orr-vdial__bead" cx="${cx}" cy="${cy - r}" r="2.3"/></g>`;
  return `<svg class="orr-vdial" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" focusable="false">`
    + `<path class="orr-vdial__track${bare ? ' is-bare' : ''}" d="${d}"/>`
    + `<path class="orr-vdial__ticks" d="${ticks}"/>${fill}</svg>`;
}

/** Move an existing dial to a new value in place (the arc and the bead glide; nothing is rebuilt). */
export function setVitalDial(svgEl, frac) {
  if (!svgEl || typeof svgEl.querySelector !== 'function') return false;
  const fill = svgEl.querySelector('.orr-vdial__fill');
  const hand = svgEl.querySelector('.orr-vdial__hand');
  if (!fill || !hand) return false;
  const { from, to } = DIAL;
  const v = Math.max(0, Math.min(1, Number.isFinite(frac) ? frac : 0));
  fill.style.strokeDasharray = `${f(v)} 1`;
  hand.style.transform = `rotate(${f(from + (to - from) * v)}deg)`;
  if (v > 0.004) hand.removeAttribute('opacity'); else hand.setAttribute('opacity', '0');
  return true;
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
${S} .sxb-berth__lamp { display:none !important; }
${S} .sxb-berth__name, ${S} .sxb-berth__ident .sf-entity-link { text-decoration:none !important; background-image:none !important; border-bottom:0 !important; }
${S} .sxb-berth__ident .sf-entity-link { font:inherit !important; letter-spacing:inherit !important; text-transform:inherit !important; color:inherit !important; }
${S} :is(.sxb-berth__name, .sxb-berth__ident .sf-entity-link):is(:hover, :focus-visible) { text-decoration:underline 1px rgb(${BONE} / .45) !important;
  text-underline-offset:4px; outline:none !important; }
${S} .sxb-berth__ident { color:rgb(${BONE} / .72) !important; }
${S} .sxb-berth__ident::before { background:rgb(${BONE} / .7) !important; box-shadow:none !important; }
${S} .sxb-next__t { color:rgb(248 244 234) !important; }
${S} .sxb-next__w { color:rgb(${BONE} / .78) !important; }
${S} .sxb-event__badge { color:rgb(248 244 234) !important; background:none !important; border:0 !important; }
${S} :is(.sxb-event__badge, .sxb-event__title, .sxb-next__t) { font-family:var(--dp-face-label, "Archivo") !important; font-stretch:112% !important;
  font-variation-settings:"wdth" 112, "wght" 650 !important; font-weight:650 !important; font-size:10.5px !important; letter-spacing:.2em !important; text-transform:uppercase; }
${S} .sxb-next__bead { background:rgb(${BONE} / .85) !important; box-shadow:none !important; }
${S} :is(.sxb-next__n, .sxb-next__x) { color:rgb(${BONE} / .7) !important; }
${S} .sxb-next__x:is(:hover, :focus-visible) { color:rgb(248 244 234) !important; outline:none !important; }
${S} .so-command-trigger > .so-icon { display:none !important; }
${S} .dp-title__rule { background:linear-gradient(90deg, rgb(${BONE} / .6), rgb(${BONE} / 0)) !important; height:1px !important; box-shadow:none !important; }
${S} .so-command-trigger { background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important; clip-path:none !important;
  min-height:0 !important; height:auto !important; padding:4px 0 !important; gap:9px !important; font-family:var(--dp-face-label, "Archivo"); font-stretch:112%;
  font-weight:650; font-size:11px !important; letter-spacing:.22em; text-transform:uppercase; color:rgb(${BONE} / .72) !important; }
${S} .so-command-trigger::before, ${S} .so-command-trigger::after { display:none !important; }
${S} .so-command-trigger .so-icon { width:14px; height:14px; }
/* the key hint is a word after a dot, never a drawn key cap */
${S} .so-command-trigger .dp-kbd { background:none !important; border:0 !important; border-radius:0 !important; box-shadow:none !important;
  padding:0 !important; font:inherit !important; font-size:10px !important; letter-spacing:.16em !important; color:rgb(${BONE} / .5) !important; }
${S} .so-command-trigger .dp-kbd::before { content:"· "; color:rgb(${BONE} / .4); }
${S} .so-command-trigger:is(:hover, :focus-visible) { color:rgb(246 241 230) !important; outline:none !important; }
${S} .so-command-trigger:focus-visible { color:var(--dp-hand, #f2b950) !important; }

/* ---- the crown: the purse is the one numeral; the vitals are dials of light under it ----------- */
${S} .sxb-crown { background:none !important; border:0 !important; box-shadow:none !important; position:relative !important; isolation:isolate; }
/* a pool of shade under the readings (no edge): the bay's truss stays the picture, the small words stay legible */
${S} .sxb-crown::before { content:""; position:absolute; z-index:-1; left:50%; top:55%; width:max(980px, 170%); height:max(520px, 250%);
  transform:translate(-50%, -50%); pointer-events:none;
  background:radial-gradient(closest-side, rgb(7 8 10 / .93), rgb(7 8 10 / .84) 42%, rgb(7 8 10 / .6) 62%, rgb(7 8 10 / 0)); }
${S} .sxb-purse__value { color:rgb(248 244 234) !important; text-shadow:0 0 22px rgb(0 0 0 / .55) !important;
  font-family:var(--dp-face-display, "Archivo") !important; font-stretch:100% !important; font-variation-settings:"wdth" 100, "wght" 500 !important;
  font-weight:500 !important; font-size:40px !important; line-height:1 !important; letter-spacing:.01em !important; font-variant-numeric:tabular-nums; }
${S} .sxb-purse__label { color:rgb(${BONE} / .6) !important; }
${S} .sxb-vitals { display:flex !important; flex-wrap:nowrap !important; justify-content:flex-end; align-items:flex-start; gap:6px 6px !important;
  list-style:none; margin:10px 0 0 !important; padding:0 !important; background:none !important; border:0 !important; }
${S} .sxb-vital { display:flex !important; flex-direction:column; align-items:center; position:relative; min-width:0 !important; width:132px !important; flex:none !important;
  margin:0 !important; padding:0 !important; gap:0 !important; background:none !important; border:0 !important; box-shadow:none !important; }
${S} .sxb-vital::before, ${S} .sxb-vital::after { display:none !important; }
${S} .sxb-vital__head { display:flex !important; flex-direction:column; align-items:center; gap:1px; background:none !important; border:0 !important;
  box-shadow:none !important; padding:0 !important; min-height:0 !important; width:auto !important; color:inherit; cursor:default; }
${S} button.sxb-vital__head { cursor:pointer; }
${S} .sxb-vital__head > .so-icon { display:none !important; }
${S} .sxb-vital__track { order:-1; display:block !important; position:relative; width:92px !important; height:60px !important; margin:0 !important;
  background:none !important; border:0 !important; box-shadow:none !important; overflow:visible !important; }
${S} .sxb-vital__track > .sxb-vital__fill { display:none !important; }
${S} .sxb-vital > .orr-vdial-bare { display:block; width:92px; height:60px; }
${S} .orr-vdial { display:block; width:92px; height:60px; overflow:visible; }
${S} .orr-vdial path { fill:none; stroke-linecap:butt; }
${S} .orr-vdial__track { stroke:rgb(${BONE} / .2); stroke-width:3; }
${S} .orr-vdial__track.is-bare { stroke-dasharray:1.5 3.2; stroke:rgb(${BONE} / .32); stroke-width:3; }
${S} .orr-vdial__ticks { stroke:rgb(${BONE} / .42); stroke-width:1; }
${S} .orr-vdial__fill { stroke:rgb(${BONE} / .86); stroke-width:3; transition:stroke-dasharray .6s cubic-bezier(.3, 1.2, .5, 1); }
${S} .orr-vdial__bead { fill:rgb(246 241 230); }
${S} .orr-vdial__hand { transform-box:view-box; transform-origin:38px 30px; transition:transform .6s cubic-bezier(.3, 1.2, .5, 1); }
${S} .sxb-vital[data-tone='warn'] .orr-vdial__fill { stroke:rgb(250 247 238); }
${S} .sxb-vital[data-tone='warn'] .orr-vdial__track { stroke:rgb(${BONE} / .5); stroke-dasharray:2 2.4; }
${S} .sxb-vital[data-tone='warn'] [data-vital-act] { color:rgb(250 247 238) !important; }
${S} .sxb-vital[data-tone='warn'] [data-vital-act] .orr-act__cost { color:rgb(${BONE} / .85); }
${S} .sxb-vital[data-tone='bad'] .orr-vdial__fill { stroke:var(--dp-danger, #ff5038); }
${S} .sxb-vital[data-tone='bad'] .orr-vdial__bead { fill:var(--dp-danger, #ff5038); }
${S} .sxb-vital__value { position:absolute !important; left:0; right:0; top:21px; margin:0 !important; padding:0 !important; text-align:center; pointer-events:none;
  display:flex; flex-direction:column; align-items:center; line-height:1 !important; background:none !important; color:rgb(246 241 230) !important; }
${S} .sxb-vital__value .orr-vnum { font-family:var(--dp-face-display, "Archivo"); font-stretch:100%; font-weight:600; font-size:18px; letter-spacing:0;
  font-variant-numeric:tabular-nums; }
${S} .sxb-vital__value .orr-vnum.is-word { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:700; font-size:10.5px; letter-spacing:.18em;
  text-transform:uppercase; margin-top:5px; }
${S} .sxb-vital__value .orr-vden { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:600; font-size:9px; letter-spacing:.1em;
  margin-top:2px; font-size:10px !important; color:rgb(${BONE} / .7); white-space:nowrap; }
${S} .sxb-vital[data-tone='bad'] .sxb-vital__value { color:var(--dp-danger, #ff5038) !important; }
${S} .sxb-vital__label { font-family:var(--dp-face-label, "Archivo") !important; font-stretch:112%; font-weight:650 !important; font-size:10.5px !important;
  letter-spacing:.22em !important; text-transform:uppercase; color:rgb(${BONE} / .72) !important; margin-top:0; }
${S} button.sxb-vital__head:is(:hover, :focus-visible) .sxb-vital__label { color:rgb(246 241 230) !important; }
${S} button.sxb-vital__head:focus-visible { outline:none !important; }
${S} button.sxb-vital__head:focus-visible .sxb-vital__label { color:var(--dp-hand, #f2b950) !important; }
${S} .sxb-vital__acts { display:flex !important; flex-direction:column; align-items:center; gap:3px; margin-top:5px !important; min-height:0 !important; }
${S} .sxb-vital__acts:empty { display:none !important; }
${S} .sxb-vital [data-vital-act] { display:inline-flex !important; align-items:baseline; gap:6px; white-space:nowrap;
  background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important; clip-path:none !important;
  min-height:0 !important; min-width:0 !important; height:auto !important; padding:2px 0 !important; margin:0 !important;
  font-family:var(--dp-face-label, "Archivo") !important; font-stretch:112%; font-weight:650 !important; font-size:11px !important; letter-spacing:.12em !important;
  text-transform:uppercase; color:rgb(${BONE} / .88) !important; }
${S} .sxb-vital [data-vital-act]::after { display:none !important; }
/* the verb's notch: a small chevron in bone; it lights with the verb */
${S} .sxb-vital [data-vital-act]::before { content:"\u203A" !important; display:inline !important; position:static !important; inset:auto !important;
  width:auto !important; height:auto !important; background:none !important; border:0 !important; box-shadow:none !important; transform:none !important;
  font-size:12px; letter-spacing:0; color:rgb(${BONE} / .55); }
${S} .sxb-vital [data-vital-act] .orr-act__sep { display:none; }
${S} .sxb-vital [data-vital-act] .orr-act__detail { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
${S} .sxb-vital [data-vital-act] .orr-act__cost { letter-spacing:.1em; color:rgb(${BONE} / .7); }
${S} .sxb-vital [data-vital-act]:is(:hover, :focus-visible) { color:var(--dp-hand, #f2b950) !important; outline:none !important; }
${S} .sxb-vital [data-vital-act]:is(:hover, :focus-visible)::before { color:var(--dp-hand, #f2b950); }
${S} .sxb-vital [data-vital-act]:is(:hover, :focus-visible) .orr-act__cost { color:rgb(255 217 140 / .8); }
${S} .sxb-vital [data-vital-act]:is(.is-disabled, [aria-disabled='true'], :disabled) { color:rgb(${BONE} / .6) !important; }
${S} .sxb-vital__ok { position:absolute !important; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
${S} .sxb-vital--industry .sxb-vital__value { position:static !important; margin-top:2px !important; pointer-events:auto; }
${S} .sxb-vital--industry .sxb-vital__value .orr-vnum.is-word { margin-top:0; letter-spacing:.12em; }

/* ---- the foot: destinations as words on a ruled line with the Hand; comms and help as words ---- */
${S} .sxb-ops, ${S} .sxb-ops .of-facility-rail { align-items:flex-start !important; }
${S} .sxb-ops { flex-wrap:nowrap !important; column-gap:clamp(16px, 2vw, 40px) !important; }
${S} .sxb-ops .of-facility-rail { flex:0 1 auto !important; min-width:0 !important; max-width:58vw !important; }
${S} .sxb-ops .sx-comms { margin-left:48px !important; flex:none !important; }
${S} .sxb-ops .sxb-launch-seat { margin-left:auto !important; }
${S} .sxb-ops .sxb-launch-seat { flex:none !important; }
${S} .sxb-ops .sx-tile__seat { display:none !important; }
${S} :is(.sxb-ops .so-berth-status, .sx-comms__toggle, .sxb-help) > .so-icon { display:none !important; }
${S} .sxb-ops .orr-stationrow__beam, ${S} .sxb-ops .orr-stationrow__glow { display:none !important; }
${S} .sxb-ops .orr-stationrow__bead { r:2.6px; }
${S} .sxb-ops .so-berth-status { align-self:flex-start !important; height:auto !important; min-height:0 !important; padding:13px 0 0 !important; gap:8px;
  margin-left:clamp(28px, 3vw, 56px) !important; flex:none !important; }
${S} .sxb-ops .so-berth-status { position:absolute !important; width:1px !important; height:1px !important; overflow:hidden !important; clip:rect(0 0 0 0) !important;
  padding:0 !important; margin:0 !important; }
${S} .sxb-ops .sx-comms { align-self:flex-start !important; margin-top:9px !important; }
${S} .sxb-ops :is(.sx-comms__toggle, .sxb-help) { display:inline-flex !important; align-items:center; }
${S} .sxb-ops .sxb-launch-seat { align-self:flex-start !important; margin-top:-8px !important; }
${S} .sxb-ops .sx-dock__group--nav { gap:0 clamp(28px, 2.2vw, 44px) !important; padding-left:6px !important; flex-wrap:nowrap !important; }
@media (max-width:1500px) {
  ${S} .sxb-ops .sx-receipt { top:auto !important; bottom:calc(100% + 10px) !important; left:0 !important; max-width:min(560px, 70vw) !important; }
  ${S} .sxb-vital { width:112px !important; }
  ${S} .sxb-vital [data-vital-act] { font-size:10.5px !important; letter-spacing:.08em !important; }
  ${S} .sxb-ops .sx-dock__group--nav { gap:0 16px !important; }
  ${S} .sxb-ops .sx-tile__label { letter-spacing:.16em !important; }
  ${S} .sxb-ops .of-facility-rail { max-width:64vw !important; }
}
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
${S} .sxb-ops .so-berth-status { color:rgb(${BONE} / .7) !important; font-size:11.5px !important; letter-spacing:.24em !important; font-weight:650;
  background:none !important; border:0 !important; }
${S} .sxb-ops .so-berth-status .so-icon { color:rgb(${BONE} / .5); }
${S} .sxb-ops :is(.sx-comms__toggle, .sxb-help) { background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important;
  clip-path:none !important; min-height:0 !important; min-width:0 !important; height:auto !important; padding:6px 2px !important; gap:8px !important;
  font-family:var(--dp-face-label, "Archivo") !important; font-stretch:112%; font-weight:650 !important; font-size:11.5px !important;
  letter-spacing:.22em !important; text-transform:uppercase; color:rgb(${BONE} / .75) !important; }
${S} .sxb-ops :is(.sx-comms__toggle, .sxb-help)::before, ${S} .sxb-ops :is(.sx-comms__toggle, .sxb-help)::after { display:none !important; }
${S} .sxb-ops :is(.sx-comms__toggle, .sxb-help) .so-icon { width:14px; height:14px; }
${S} .sxb-ops :is(.sx-comms__toggle, .sxb-help):is(:hover, :focus-visible, [aria-expanded='true']) { color:rgb(246 241 230) !important; outline:none !important; }
${S} .sxb-ops :is(.sx-comms__toggle, .sxb-help):focus-visible { color:var(--dp-hand, #f2b950) !important; }
${S} .sxb-ops .sx-comms__count { background:none !important; border:0 !important; color:rgb(248 244 234) !important; font-weight:700; }
/* the receipt is a line of light over the foot, not a card: the arrow, what cleared, the sum */
${S} .sxb-ops .sx-receipt { background:none !important; border:0 !important; border-radius:0 !important; box-shadow:none !important;
  top:0 !important; bottom:auto !important; left:calc(100% + 40px) !important; right:auto !important; width:max-content !important; max-width:min(560px, 36vw) !important; padding:6px 0 !important;
  flex-wrap:nowrap !important; gap:12px !important; white-space:nowrap !important; isolation:isolate; }
${S} .sxb-ops .sx-receipt::before { content:""; position:absolute; z-index:-1; left:-60px; right:-60px; top:-26px; bottom:-26px; pointer-events:none;
  background:radial-gradient(closest-side, rgb(7 8 10 / .85), rgb(7 8 10 / 0)); }
${S} .sxb-ops .sx-receipt .so-transfer { width:40px; color:rgb(${BONE} / .7); }
${S} .sxb-ops .sx-receipt__kind { font-family:var(--dp-face-label, "Archivo") !important; font-stretch:112%; font-weight:650; font-size:10px !important;
  letter-spacing:.22em !important; color:rgb(${BONE} / .7) !important; }
${S} .sxb-ops .sx-receipt__title { font-family:var(--dp-face-label, "Archivo") !important; font-stretch:112%; font-weight:650 !important; font-size:12px !important;
  letter-spacing:.12em; text-transform:uppercase; color:rgb(248 244 234) !important; }
${S} .sxb-ops .sx-receipt__delta { margin-left:6px !important; font-variant-numeric:tabular-nums; color:rgb(${BONE} / .85) !important; }

/* ---- Undock: the one primary verb. Bone at rest; amber where the player reaches; red at risk --- */
${S} .sxb-launch-seat { background:none !important; border:0 !important; box-shadow:none !important; clip-path:none !important; }
${S} .sxb-launch-seat::before, ${S} .sxb-launch-seat::after { display:none !important; }
${S} .sxb-launch { position:relative; display:inline-flex !important; align-items:center; gap:14px !important; overflow:visible !important;
  background:none !important; border:0 !important; border-image:none !important; border-radius:0 !important; box-shadow:none !important; clip-path:none !important;
  min-width:0 !important; min-height:0 !important; height:auto !important; padding:8px 4px 12px !important; color:rgb(246 241 230) !important;
  background-image:none !important; background-size:100% 2px !important;
  background-position:0 100% !important; background-repeat:no-repeat !important; text-shadow:0 0 16px rgb(0 0 0 / .6); }
${S} .sxb-launch::before, ${S} .sxb-launch::after { display:none !important; }
${S} .sxb-launch__light { display:none !important; }
${S} .sxb-launch__copy { display:flex !important; flex-direction:column; align-items:flex-start; gap:4px; }
${S} .sxb-launch__label { font-family:var(--dp-face-display, "Archivo") !important; font-stretch:125%; font-variation-settings:"wght" 800, "wdth" 125;
  font-size:20px !important; letter-spacing:.12em !important; text-transform:uppercase; line-height:1 !important; color:inherit !important; }
${S} .sxb-launch__state { font-family:var(--dp-face-label, "Archivo") !important; font-stretch:112%; font-weight:650 !important; font-size:10px !important;
  letter-spacing:.24em !important; text-transform:uppercase; line-height:1 !important; color:rgb(${BONE} / .72) !important; }
${S} .sxb-launch > .so-icon { width:22px; height:22px; color:rgb(${BONE} / .7); }
${S} .sxb-launch:is(:hover, :focus-visible) { color:var(--dp-hand-hot, #ffd98c) !important; outline:none !important; text-shadow:0 0 24px rgb(255 217 140 / .45);
  background-image:linear-gradient(90deg, var(--dp-hand, #f2b950), rgb(242 185 80 / 0)) !important; }
${S} .sxb-launch:is(:hover, :focus-visible) > .so-icon { color:var(--dp-hand, #f2b950); }
${S} .sxb-launch:is(:hover, :focus-visible) .sxb-launch__state { color:rgb(255 217 140 / .75) !important; }
${S} .sxb-launch[data-state='check'] .sxb-launch__state { color:rgb(250 247 238) !important; }
${S} .sxb-launch[data-state='risk'] { background-image:linear-gradient(90deg, var(--dp-danger, #ff5038), rgb(255 80 56 / 0)) !important; }
${S} .sxb-launch[data-state='risk'] .sxb-launch__state { color:var(--dp-danger, #ff5038) !important; }
html.sf-reduce-motion ${S} :is(.orr-vdial__fill, .orr-vdial__hand) { transition:none; }
@media (max-height:800px) {
  ${S} .sxb-tape :is(.sxb-berth__mechanic, .sxb-berth__ledger) { display:none !important; }
  ${S} .sxb-purse__value { font-size:30px !important; }
  ${S} .sxb-vitals { margin-top:2px !important; gap:4px 12px !important; }
  ${S} :is(.sxb-vital__track, .sxb-vital > .orr-vdial-bare, .orr-vdial) { width:72px !important; height:47px !important; }
  ${S} .sxb-vital__value { top:15px; }
  ${S} .sxb-vital__value .orr-vnum { font-size:16px; }
  ${S} .sxb-vital__value .orr-vden { font-size:10px !important; }
  ${S} .sxb-vital__acts { margin-top:2px !important; gap:0 !important; }
}
/* a short screen: the trade receipt stands over the comms words, never across UNDOCK */
@media (max-height:800px) {
  ${S} .sx-comms .sx-receipt, ${S} .sxb-ops .sx-receipt { position:absolute !important; left:0 !important; right:auto !important; top:auto !important; bottom:calc(100% + 6px) !important; max-width:min(420px, 46vw) !important; }
}
/* a 1440p screen shows the 1080p composition at 1.25 (the kit scale is folded into the zoom, so nothing scales twice) */
@media (min-width:2200px) and (min-height:1200px) {
  ${S} { zoom:1.25; --k-s:1; }
}
@media (min-width:3400px) and (min-height:1900px) {
  ${S} { zoom:1.85; --k-s:1; }
}
/* the tab rail's cursor and its attention dot are bone: every composed tab owns the one amber Hand */
${S} .sxb-ops .sx-tile::after { background:rgb(248 244 234) !important; box-shadow:0 0 8px rgb(248 244 234 / .4) !important; }
${S} .sxb-ops .sx-tile::before { background:rgb(248 244 234) !important; box-shadow:0 0 8px rgb(248 244 234 / .55) !important; }

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
