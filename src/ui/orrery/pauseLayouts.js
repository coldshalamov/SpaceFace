// UI polish overlay for the Pause screen (design/frontend/ORRERY.md §6 Pause).
// The composition lives in screenLayouts.js + deckplate/screens.js (PAUSE); this sheet raises
// title/brief/ladder contrast, gives the foot real keycap boxes (settings rail grammar), lifts
// the 1080p band on head/brief/foot only (never the dial — arcRail places from getBoundingClientRect),
// and tightens the phone stack. Scoped to `.of-pause.orr-pause` / `.orr-pause--phone`; selectors/IDs unchanged.

import { injectOrrery } from './tokens.js';

const STYLE_ID = 'sf-orrery-pause-layouts';
const BONE = '236 230 216';
const HOT = '248 244 234';
const P = 'html body #screens > .of-pause.orr-pause.orr-pause';
const PH = 'html body #screens > .of-pause.orr-pause--phone.orr-pause--phone';
const BOTH = 'html body #screens > .of-pause:is(.orr-pause, .orr-pause--phone)';
const LABEL = 'font-family:var(--dp-face-label, "Archivo") !important; font-stretch:112% !important; font-variation-settings:"wdth" 112, "wght" 650 !important; font-weight:650 !important; text-transform:uppercase !important;';
const HALO = 'text-shadow:0 0 2px rgb(4 6 9), 0 0 8px rgb(4 6 9 / .9), 0 0 18px rgb(4 6 9 / .75) !important;';

export const PAUSE_LAYOUT_CSS = `
/* ---------- title: hotter bone + deeper halo so PAUSED cuts the held world ---------- */
${BOTH} .dp-title__name {
  color:rgb(${HOT}) !important; -webkit-text-fill-color:currentColor !important;
  ${HALO} text-shadow:0 0 2px rgb(4 6 9), 0 0 8px rgb(4 6 9 / .92), 0 2px 18px rgb(0 0 0 / .55) !important; }
${BOTH} .dp-title__eyebrow { color:rgb(${BONE} / .82) !important;
  text-shadow:0 0 2px rgb(4 6 9), 0 0 8px rgb(4 6 9 / .85) !important; }

/* ---------- flight brief: hierarchy — kicker / name / next / save ---------- */
${BOTH} > .sf-pause-brief.orr-brief::before,
${BOTH} .sf-pause-brief.orr-brief::before {
  background:radial-gradient(closest-side, rgb(4 6 9 / .9), rgb(4 6 9 / .62) 58%, transparent) !important;
  inset:-40px -60px !important; }
${BOTH} .sf-pause-brief .dp-etch,
${BOTH} .sf-pause-brief > .dp-etch.sf-slot-sub:first-child,
${BOTH} .orr-brief__kind {
  color:rgb(${BONE} / .9) !important; letter-spacing:.24em !important; ${LABEL}
  text-shadow:0 0 2px rgb(4 6 9), 0 0 10px rgb(4 6 9 / .8) !important; }
${BOTH} .sf-pause-brief .sf-slot-name,
${BOTH} .orr-brief__name {
  color:rgb(${HOT}) !important;
  text-shadow:0 0 2px rgb(4 6 9), 0 0 12px rgb(4 6 9 / .85) !important; }
${BOTH} .orr-brief__name { font-size:max(20px, calc(22px * var(--sv, 1))) !important; }
${BOTH} .sf-pause-brief .dp-copy,
${BOTH} .sf-pause-brief .dp-copy.sf-muted {
  color:rgb(${BONE} / .86) !important;
  text-shadow:0 0 2px rgb(4 6 9), 0 0 10px rgb(4 6 9 / .75) !important; }
${BOTH} .sf-pause-brief .dp-copy--fine,
${BOTH} .sf-pause-brief .sf-slot-sub:not(.dp-etch) {
  color:rgb(${BONE} / .82) !important; letter-spacing:.14em !important; }
${BOTH} .orr-brief__read { color:rgb(${BONE} / .86) !important; }
${BOTH} .orr-brief__read b { color:var(--dp-phos, rgb(223 238 255)) !important;
  text-shadow:0 0 10px rgb(160 200 255 / .35) !important; }
${BOTH} .orr-brief__track { stroke:rgb(${BONE} / .45) !important; }
${BOTH} .sf-pause-brief :is(a, [data-entity], .sf-entity, .sf-entity-link) {
  color:rgb(${HOT}) !important;
  box-shadow:0 1.5px 0 rgb(242 185 80 / .7) !important; }

/* desktop brief: a touch more air under the kicker */
${P} > .sf-pause-brief.orr-brief { top:clamp(88px, 11.5vh, 140px) !important;
  width:min(540px, 36vw) !important; }
${P} > .sf-pause-brief.orr-brief > .dp-etch.sf-slot-sub:first-child {
  display:flex !important; align-items:center !important; gap:14px !important; margin-bottom:10px !important; }
${P} > .sf-pause-brief.orr-brief > .dp-etch.sf-slot-sub:first-child::after {
  content:"" !important; width:56px; height:1px;
  background:linear-gradient(90deg, rgb(${BONE} / .45), rgb(${BONE} / 0)) !important; }

/* ---------- verb ladder: rest words + sector legends brighter on void ---------- */
${P} .orr-arcrail-host .dp-lit__item:not([data-awake]) {
  color:rgb(${BONE} / .86) !important; }
${P} .orr-arcrail-host .dp-lit__item--danger:not([data-awake]) {
  color:rgb(255 140 110 / .78) !important; }
${P} .orr-svg text.orr-arcrail__legend { fill:rgb(${BONE} / .92) !important; }
${P} .orr-svg .orr-arcrail__head.is-lit text.orr-arcrail__legend { fill:rgb(255 253 248) !important; }
${P} .orr-svg .orr-arcrail__lettering, ${P} .orr-svg .orr-arcrail__lettering text {
  fill:rgb(${BONE} / .72) !important; }
${P} .orr-svg .orr-arcrail__rule { stroke-opacity:1; }

/* phone column (no dial): group heads + bank verbs clearer */
${PH} .k-words__group {
  color:rgb(${BONE} / .78) !important; letter-spacing:.22em !important;
  margin:calc(14px * var(--dp-s, 1)) 0 6px !important; }
${PH} .k-words__group::after { background:rgb(${BONE} / .28) !important; }
${PH} .sf-pause-words .k-word {
  color:rgb(${BONE} / .88) !important; min-height:40px !important; }
${PH} .sf-pause-words .k-word:is(:hover, :focus-visible, [aria-current="true"], .is-lit, [data-awake]) {
  color:rgb(${HOT}) !important; }
${PH} .sf-pause-words .k-word.k-word--primary,
${PH} .sf-pause-words .k-word[data-action="pause-0"] {
  color:rgb(${HOT}) !important;
  text-shadow:0 0 1px rgb(255 226 178 / .45), 0 0 14px rgb(255 217 140 / .28) !important; }
${PH} .sf-pause-brief { margin:0 0 20px !important; padding-bottom:4px !important; }
${PH} .sf-pause-brief .sf-slot-name { font-size:21px !important; line-height:1.2 !important; }
/* the kind word (TRACKED) is an inline span: on its own line it no longer runs into the job's name */
${PH} .orr-brief__kind { display:block !important; margin:0 0 4px !important; line-height:16px !important; }
${PH} .sf-pause-brief .dp-copy { font-size:14.5px !important; color:rgb(${BONE} / .86) !important; }
${PH} .k-words--row { gap:12px 22px !important; row-gap:10px !important; }
${PH} .sf-pause-words .k-word { letter-spacing:.14em !important; }

/* ---------- foot: real keycap boxes + verb labels (settings rail grammar) ---------- */
${BOTH} > .sf-pause-foot {
  align-items:center !important; gap:clamp(16px, 2vw, 28px) !important;
  min-height:44px !important; padding-top:4px !important; }
${BOTH} > .sf-pause-foot .sf-pause-foot__keys {
  display:flex !important; flex-wrap:wrap !important; align-items:center !important;
  gap:4px 0 !important; margin:0 !important;
  background:linear-gradient(0deg, rgb(${BONE} / .22) 0 1px, transparent 1px) 0 100% / 100% 100% no-repeat !important;
  padding:8px 0 10px !important; }
${BOTH} > .sf-pause-foot .dp-kbd.sf-pause-key,
${BOTH} > .sf-pause-foot .sf-pause-key.dp-kbd {
  display:inline-block !important; box-sizing:border-box !important;
  margin:0 8px 0 0 !important; padding:3px 7px 4px !important;
  ${LABEL} font-size:11px !important; letter-spacing:.18em !important; line-height:1 !important;
  color:rgb(${BONE} / .92) !important;
  background:rgb(${BONE} / .1) !important; background-color:rgb(${BONE} / .1) !important;
  border:1px solid rgb(${BONE} / .5) !important; border-image:none !important; border-radius:3px !important;
  box-shadow:inset 0 -1px 0 rgb(0 0 0 / .35) !important; vertical-align:baseline !important;
  font-weight:650 !important; }
${BOTH} > .sf-pause-foot .sf-pause-key-verb {
  ${LABEL} font-size:11.5px !important; letter-spacing:.16em !important;
  color:rgb(${BONE} / .88) !important; margin:0 22px 0 0 !important;
  vertical-align:baseline !important; line-height:1 !important; }
${BOTH} > .sf-pause-foot .dp-etch.dp-bar--end,
${BOTH} > .sf-pause-foot [data-role="version"] {
  color:rgb(${BONE} / .72) !important; letter-spacing:.14em !important;
  text-shadow:0 0 2px rgb(4 6 9) !important; }

/* short height: keep title clear of RESUME; foot stays one line of keycaps */
@media (max-height:800px) {
  ${P} .dp-title__name { font-size:clamp(34px, 5vh, 56px) !important; margin-bottom:12px !important; }
  ${P} > .sf-pause-brief.orr-brief { top:clamp(72px, 10vh, 110px) !important; width:min(460px, 38vw) !important; }
  ${BOTH} > .sf-pause-foot .sf-pause-key-verb { margin-right:16px !important; }
  ${BOTH} > .sf-pause-foot .sf-pause-foot__keys { padding:6px 0 8px !important; }
}

/* short desktop (≤640 tall, or ≤720 tall at ≤1100 wide; e.g. 960×540): the dial's SHIP / REFERENCE
   banks run out to ~x 720–840 at y 240–300, right where the brief's Next / Saved lines sat, so the
   words printed over each other. The brief becomes a top-right reading level with PAUSED and ends
   above the first long bank. */
@media (min-width:701px) and (max-height:640px), (min-width:701px) and (max-width:1100px) and (max-height:720px) {
  ${P} > .sf-pause-brief.orr-brief { top:clamp(40px, 8vh, 52px) !important; margin-top:0 !important;
    width:min(400px, 42vw) !important; }
  ${P} > .sf-pause-brief.orr-brief > .dp-etch.sf-slot-sub:first-child { margin-bottom:6px !important; line-height:16px !important; }
  ${P} > .sf-pause-brief.orr-brief > .sf-slot-name { margin-top:0 !important; }
  ${P} .orr-brief__kind { line-height:14px !important; margin-bottom:2px !important; }
  ${P} .orr-brief__name { font-size:19px !important; line-height:1.08 !important; }
  ${P} .orr-brief__read { margin-top:4px !important; gap:8px !important; }
  ${P} .orr-brief__ring { width:30px !important; height:30px !important; }
  ${P} .orr-brief__read b { font-size:22px !important; }
  ${P} > .sf-pause-brief.orr-brief > .dp-copy { margin-top:4px !important; line-height:16px !important; }
  ${P} > .sf-pause-brief.orr-brief > .dp-copy--fine { margin-top:2px !important; padding:0 !important; }
}

/* a very short window (≤520 tall, e.g. 800×500): the dial climbs to y≈190, so the brief keeps only
   the tracked job and its next step; the FLIGHT BRIEF kicker and the save note step aside (F5 / F9
   stay on the foot). */
@media (min-width:701px) and (max-height:520px) {
  ${P} > .sf-pause-brief.orr-brief > .dp-etch.sf-slot-sub:first-child,
  ${P} > .sf-pause-brief.orr-brief > .dp-copy--fine { display:none !important; }
}

/* narrow desktop (701–900 wide, e.g. 800×500): at the rail's full spacing the six keycaps + verbs need
   ~790px, so below ~890 wide CATEGORY / ITEM wrapped to a second line. The foot is a grid row sized
   by its content, so the extra line grew it upward and the first line rose into the dial's EXIT /
   MAIN MENU bank. Tighter keycaps, verbs and gaps keep the strip on one line down to 701 wide. */
@media (min-width:701px) and (max-width:900px) {
  ${P} > .sf-pause-foot .sf-pause-foot__keys { gap:4px 0 !important; }
  ${P} > .sf-pause-foot .dp-kbd.sf-pause-key,
  ${P} > .sf-pause-foot .sf-pause-key.dp-kbd {
    margin-right:5px !important; padding:3px 5px 4px !important; font-size:10.5px !important; letter-spacing:.1em !important; }
  ${P} > .sf-pause-foot .sf-pause-key-verb {
    font-size:10.5px !important; letter-spacing:.1em !important; margin-right:clamp(9px, 1.4vw, 14px) !important; }
}

/* ≤760 wide (e.g. 720×480) the strip has ~620px: tighten once more so it still holds one line. */
@media (min-width:701px) and (max-width:760px) {
  ${P} > .sf-pause-foot .dp-kbd.sf-pause-key,
  ${P} > .sf-pause-foot .sf-pause-key.dp-kbd { margin-right:4px !important; padding:3px 4px 4px !important; font-size:10px !important; letter-spacing:.06em !important; }
  ${P} > .sf-pause-foot .sf-pause-key-verb { font-size:10px !important; letter-spacing:.07em !important; margin-right:9px !important; }
}
/* narrow + short (≤560 tall): the foot's keys line and the version line close up, so the keys sit
   lower and leave a clear band under EXIT / MAIN MENU. */
@media (min-width:701px) and (max-width:900px) and (max-height:560px) {
  ${P} > .sf-pause-foot { row-gap:2px !important; }
  /* the dial's GAME bank reaches x≈510 at y≈228 here, and the brief starts left of that below 960
     wide, so the save note (last brief line) would print over LOAD; it steps aside (F5 / F9 stay on the foot). */
  ${P} > .sf-pause-brief.orr-brief > .dp-copy--fine { display:none !important; }
}

/* short desktop (≤520 tall, e.g. 844×390, 1024×440): the dial's last bank (EXIT / MAIN MENU) lands at
   ~0.72 of the height, but the foot sat a full 48px frame margin + a 2vw row gap above the bottom, so the
   keycap strip rose into EXIT. The foot seats on the bottom edge instead (14px margin, keys and build mark
   close up), which leaves a clear band of ~30px+ under EXIT. The dial is untouched: it places from the
   full-frame host, not the grid rows. */
@media (min-width:701px) and (max-height:520px) {
  ${P} { padding-bottom:14px !important; }
  ${P} > .sf-pause-foot { row-gap:6px !important; min-height:0 !important; padding-top:0 !important; }
  ${P} > .sf-pause-foot .sf-pause-foot__keys { padding:6px 0 7px !important; }
  ${P} > .sf-pause-foot [data-role="version"] { margin-block:0 !important; }
}
/* narrow + very short (≤900 × ≤460, e.g. 844×390): the GAME bank's LOAD reaches x≈465 at y≈160, where
   the brief's Next line began (x 461). The brief climbs level with PAUSED and narrows so it starts right
   of LOAD (x≈485); Next still fits one line and ends above the SHIP bank. */
@media (min-width:701px) and (max-width:900px) and (max-height:460px) {
  ${P} > .sf-pause-brief.orr-brief { top:26px !important; width:min(330px, 40vw) !important; }
}

/* 1080p band: lift head + brief + foot only — never the dial stage (arcRail getBoundingClientRect) */
@media (min-width:1800px) and (max-width:2199px) and (min-height:1000px) {
  ${P} { --sv:1.12; }
  ${P} > .dp-frame__head { zoom:1.12; }
  ${P} > .sf-pause-brief.orr-brief { zoom:1.12; top:clamp(96px, 12vh, 152px) !important; width:min(560px, 34vw) !important; }
  ${P} > .sf-pause-foot { zoom:1.1; }
  ${P} .orr-brief__name { font-size:24px !important; }
  ${P} .orr-brief__read b { font-size:30px !important; }
}

/* phone: foot keycaps stay readable; brief kicker rule */
@media (max-width:700px) {
  ${PH} > .sf-pause-foot .sf-pause-foot__keys { gap:6px 0 !important; }
  ${PH} > .sf-pause-foot .sf-pause-key-verb { margin-right:14px !important; font-size:11px !important; }
  ${PH} .sf-pause-brief > .dp-etch.sf-slot-sub:first-child {
    display:flex !important; align-items:center !important; gap:12px !important; margin-bottom:8px !important; }
  ${PH} .sf-pause-brief > .dp-etch.sf-slot-sub:first-child::after {
    content:"" !important; flex:0 0 40px; height:1px;
    background:linear-gradient(90deg, rgb(${BONE} / .4), rgb(${BONE} / 0)) !important; }
}
`;

export function injectPauseLayouts(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function') return;
  injectOrrery(doc);
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = PAUSE_LAYOUT_CSS;
  doc.head.appendChild(style);
}
