// ORRERY polish overlay for New Game (design/frontend/ORRERY.md §6 New game).
// Layout and type only: foot rail, secondary contrast, loadout size column, 1080p left-column lift.
// Scoped to `.orr-newgame`. Selectors/IDs unchanged. Loadout item DATA untouched.

import { injectOrrery } from './tokens.js';

const STYLE_ID = 'sf-orrery-newgame-layouts';
const BONE = '236 230 216';
const WARM = '248 244 234';
const NG = 'html body #screens > .k-screen.orr-newgame.orr-newgame';
// desktop only (the phone layout is its own sheet)
const NGD = 'html:not([data-sf-mobile="1"]) body #screens > .k-screen.orr-newgame.orr-newgame';
const LABEL = 'font-family:var(--dp-face-label, "Archivo") !important; font-stretch:112%; font-variation-settings:"wdth" 112, "wght" 650 !important; font-weight:650 !important; text-transform:uppercase !important;';

export const NEW_GAME_LAYOUT_CSS = `
/* title + tagline: warmer, clearer on the void */
${NG} .orr-ng-title {
  color:rgb(${WARM}) !important;
  text-shadow:0 0 2px rgb(4 6 9), 0 0 8px rgb(4 6 9 / .85), 0 2px 16px rgb(0 0 0 / .5) !important; }
${NG} > .sf-ng-header .k-sentence,
${NG} > .sf-ng-header > p {
  color:rgb(${BONE} / .88) !important; }

/* field labels + body secondary copy */
${NG} .orr-ng-label {
  color:rgb(${BONE} / .88) !important; letter-spacing:.22em !important; }
${NG} .sf-ng-body .k-sentence,
${NG} #sf-ng-difficulty-desc,
${NG} #sf-ng-seed-desc {
  color:rgb(${BONE} / .84) !important; }
${NG} > .k-fine {
  color:rgb(${BONE} / .78) !important; }

/* inputs: brighter rule + placeholder */
${NG} .orr-ng-input {
  color:rgb(${WARM}) !important;
  background-image:linear-gradient(90deg, rgb(${BONE} / .72), rgb(${BONE} / .14)) !important; }
${NG} .orr-ng-input:focus {
  background-image:linear-gradient(90deg, rgb(${BONE} / .92), rgb(${BONE} / .22)) !important; }
${NG} .orr-ng-input::placeholder { color:rgb(${BONE} / .7) !important; }

/* difficulty / stop words: rest brighter; pressed stays lit */
${NG} .orr-stopscale .k-word,
${NG} .orr-stoparc .k-word {
  color:rgb(${BONE} / .78) !important; }
${NG} .orr-stopscale .k-word-sub,
${NG} .orr-stoparc .k-word-sub {
  color:rgb(${BONE} / .68) !important; }
${NG} .orr-ng-key--small,
${NG} .orr-ng-key--legend {
  color:rgb(${BONE} / .82) !important; }
${NG} .orr-ng-key--small::before { color:rgb(${BONE} / .78) !important; }

/* hull caption: sentence + route */
${NG} .orr-ng-caption > .k-sentence { color:rgb(${BONE} / .88) !important; }
${NG} .orr-ng-caption > .sf-slot-card-title {
  color:rgb(${WARM}) !important;
  text-shadow:0 0 2px rgb(4 6 9), 0 0 10px rgb(4 6 9 / .8) !important; }
${NG} .sf-ng-route > .k-caps { color:rgb(${BONE} / .88) !important; }
${NG} .sf-ng-route .sf-ng-route__step .k-row__name { color:rgb(${BONE} / .94) !important; }
${NG} .sf-ng-route .sf-ng-route__step .k-row__sub { color:rgb(${BONE} / .72) !important; }
${NG} .sf-ng-route .sf-ng-route__steps::before { background:rgb(${BONE} / .42) !important; }
${NG} .sf-ng-route .sf-ng-route__steps::after {
  background:repeating-linear-gradient(90deg, rgb(${BONE} / .4) 0 1.5px, transparent 1.5px 16px) !important; }

/* loadout list: styling only — fixed name column so size letters share one edge (data untouched) */
${NG} .orr-ng-caption ul[aria-label="Loadout"] .fh-legend,
${NG} .orr-ng-caption ul[aria-label="Loadout"] .orr-ng-label {
  display:grid !important; grid-template-columns:12em 1.15em !important;
  align-items:baseline !important; column-gap:8px !important; width:auto !important; max-width:100% !important;
  color:rgb(${BONE} / .88) !important; font-size:12.5px !important; letter-spacing:.12em !important; }
${NG} .orr-ng-caption ul[aria-label="Loadout"] .orr-ng-size {
  display:inline-block !important; margin:0 !important; padding:0 !important;
  text-align:right !important; justify-self:end !important;
  font-size:12px !important; letter-spacing:.06em !important;
  color:rgb(${BONE} / .82) !important; font-variant-numeric:tabular-nums !important; }
${NG} .orr-ng-caption ul[aria-label="Loadout"] .orr-ng-size::before { content:none !important; display:none !important; }
${NG} .orr-ng-caption > div:has(> ul[aria-label="Loadout"]) > .orr-ng-label,
${NG} .orr-ng-caption > div:has(> ul[aria-label="Loadout"]) > .fh-legend {
  color:rgb(${BONE} / .86) !important; margin-bottom:8px !important; letter-spacing:.2em !important; }
@media (max-width:1366px) {
  ${NG} .orr-ng-caption ul[aria-label="Loadout"] .fh-legend,
  ${NG} .orr-ng-caption ul[aria-label="Loadout"] .orr-ng-label {
    grid-template-columns:13.2em 1.1em !important; font-size:12px !important; }
}

/* yard hull names ride above every model, so a hero's engine glow never cuts a rear name */
${NG} .orr-yard--models > .orr-turntable__row { z-index:auto !important; }
${NG} .orr-yard--models > .orr-turntable__row > li { z-index:120 !important; }
${NG} .orr-yard--models > .orr-turntable__row > li .k-word {
  text-shadow:0 0 2px rgb(4 6 9), 0 0 10px rgb(4 6 9 / .9), 0 1px 14px rgb(0 0 0 / .6) !important; }

/* yard rear hulls a touch clearer as choices */
${NG} .orr-yard > .orr-turntable__row > li:not(.is-front) .k-word { color:rgb(${BONE} / .78) !important; }
${NG} .orr-yard > .orr-turntable__row > li:not(.is-front) .k-word-sub { color:rgb(${BONE} / .68) !important; }

/* foot: ‹ BACK + ESC keycap (matches settings / save-load / help / credits / archive / achievements / statistics).
   Launch stays the Lamp Key — do not restyle .sf-ng-launch here. */
${NG} > .sf-ng-footer.k-foot { display:flex !important; align-items:center !important; gap:32px !important; min-height:0; }
${NG} > .sf-ng-footer .k-word.sf-back {
  all:unset !important; box-sizing:border-box !important; cursor:pointer !important;
  display:inline-flex !important; align-items:baseline !important; gap:0 !important;
  padding:10px 0 12px !important; min-height:44px !important;
  ${LABEL} font-size:13.5px !important; letter-spacing:.22em !important; color:rgb(255 253 248) !important;
  background:linear-gradient(0deg, rgb(${BONE} / .28) 0 1.5px, transparent 1.5px) 0 100% / 120px 100% no-repeat !important;
  text-shadow:none !important; }
${NG} > .sf-ng-footer .k-word.sf-back::before {
  all:unset !important; content:"‹" !important; display:inline !important; margin-right:12px !important;
  font-size:15px !important; color:rgb(${BONE} / .6) !important; }
${NG} > .sf-ng-footer .k-word.sf-back::after {
  all:unset !important; content:"ESC" / "" !important; display:inline-block !important; margin-left:16px !important;
  padding:3px 7px 4px !important; ${LABEL} font-size:12px !important; letter-spacing:.2em !important; line-height:1 !important;
  color:rgb(${BONE} / .9) !important; background:rgb(${BONE} / .1) !important; border:1px solid rgb(${BONE} / .5) !important;
  border-radius:3px !important; box-shadow:inset 0 -1px 0 rgb(0 0 0 / .35) !important; vertical-align:baseline !important; }
${NG} > .sf-ng-footer .k-word.sf-back :is(.k-kbd, .dp-kbd, kbd) { display:none !important; }
${NG} > .sf-ng-footer .k-word.sf-back:is(:hover, :focus-visible) {
  color:var(--dp-hand-hot, #ffd98c) !important; outline:none !important; text-decoration:none !important; }
${NG} > .sf-ng-footer .k-word.sf-back:focus-visible::after {
  color:rgb(255 253 248) !important; border-color:rgb(255 253 248 / .45) !important; }


/* 1080p band: lift the left column only. Not the whole screen: the yard carousel places hulls and
   names from getBoundingClientRect, and a screen-wide zoom double-scales those offsets (HITCH fell
   onto the route, WASP behind the hero). The yard, stage and route stay at 1:1. */
@media (min-width:1800px) and (max-width:2199px) and (min-height:1000px) {
  ${NG} > :is(.sf-ng-header, .sf-ng-body, .sf-ng-footer, .k-fine) { zoom:1.14; }
  ${NG} .orr-ng-caption > .k-sentence { font-size:15.5px !important; line-height:1.5 !important; max-width:34em !important; }
  ${NG} .orr-ng-caption ul[aria-label="Loadout"] .fh-legend,
  ${NG} .orr-ng-caption ul[aria-label="Loadout"] .orr-ng-label { font-size:13.5px !important; }
}

/* 801–1100 wide desktop, ≤600 tall (960×540): the stage is ~490px wide, so the fittings' column ran under the
   hero render and the ring's right reading (LINE) ran off the frame. The fittings wrap as one dotted line
   under the hull's sentence across the stage, and the hero box (which the yard and the stats ring both
   measure) narrows and centres so MASS and LINE stand inside the stage. Phones keep their own layout. */
@media (min-width:801px) and (max-width:1100px) and (max-height:600px) {
  ${NGD} .orr-ng-caption ul[aria-label="Loadout"] {
    display:flex !important; flex-direction:row !important; flex-wrap:wrap !important; gap:6px 22px !important;
    width:auto !important; max-width:100% !important; }
  ${NGD} .orr-ng-caption ul[aria-label="Loadout"] > li + li::before { display:none !important; }
  ${NGD} .orr-ng-caption ul[aria-label="Loadout"] .fh-legend,
  ${NGD} .orr-ng-caption ul[aria-label="Loadout"] .orr-ng-label {
    display:inline-flex !important; grid-template-columns:none !important; column-gap:6px !important; font-size:12px !important; font-stretch:100% !important; font-variation-settings:"wdth" 100, "wght" 620 !important; letter-spacing:.06em !important; }
  ${NGD} .orr-ng-caption > .sf-slot-card-title { float:left !important; margin:0 24px 0 0 !important; }
  ${NGD} .orr-ng-caption > .k-sentence { margin-top:0 !important; padding-top:2px !important; max-width:none !important; }
  ${NGD} .orr-ng-caption > div:has(> ul[aria-label="Loadout"]) { clear:both !important; margin-top:0 !important; padding-top:14px !important; }
  /* the run keeps its titles only (the ≤800-tall intent); the hidden beats no longer hold ~90px under the scale */
  ${NGD} .sf-ng-route .sf-ng-route__step { padding:0 !important; height:auto !important; }
  ${NGD} .sf-ng-route .sf-ng-route__step .k-row__sub { display:none !important; }
  ${NGD} > .k-stage > :is(.k-world--stage, .k-stage__poster),
  ${NGD} > .k-stage > .orr-ng-hero-box { left:24% !important; width:52% !important; top:43% !important; height:21% !important; }
  ${NGD} > .k-stage::before { left:24%; width:52%; top:61%; }
}

/* the same band at ≤460 tall (844×390, 900×420, 1024×440): the stage had ~305px for the name, the fittings,
   the ring and the run, so the yard was forced up over the hull's name and the fittings, and the form column
   showed only CASUAL. The frame's margin closes to 20px, the run's scale stands down to the accessibility
   tree (the yard then centres on the hull alone) and the footnote does too, so every difficulty stop shows. */
@media (min-width:801px) and (max-width:1100px) and (max-height:460px) {
  ${NGD} { padding-top:20px !important; padding-bottom:20px !important; row-gap:10px !important; }
  ${NGD} > .k-fine,
  ${NGD} .orr-ng-caption > .sf-ng-route {
    position:absolute !important; width:1px !important; height:1px !important; overflow:hidden !important;
    clip-path:inset(50%) !important; white-space:nowrap !important; }
  ${NGD} > .sf-ng-header > p { position:absolute !important; width:1px !important; height:1px !important; overflow:hidden !important;
    clip-path:inset(50%) !important; white-space:nowrap !important; }
  ${NGD} .sf-ng-launch:has(> .orr-lampkey__word) { min-height:46px !important; }
  /* the hull's line stands beside its name (two lines at most); the fittings show three rows and scroll past that */
  ${NGD} .orr-ng-caption > .sf-slot-card-title { font-size:28px !important; margin-right:20px !important; }
  ${NGD} .orr-ng-caption > .k-sentence { overflow:hidden !important; font-size:12.5px !important; line-height:1.35 !important; }
  ${NGD} .orr-ng-caption ul[aria-label="Loadout"] {
    gap:4px 14px !important; max-height:70px !important; overflow-y:auto !important; overscroll-behavior:contain;
    scrollbar-width:thin; scrollbar-color:rgb(${BONE} / .45) transparent; }
  ${NGD} .orr-ng-caption ul[aria-label="Loadout"] .fh-legend,
  ${NGD} .orr-ng-caption ul[aria-label="Loadout"] .orr-ng-label { font-size:12px !important; font-stretch:96% !important; font-variation-settings:"wdth" 96, "wght" 600 !important; letter-spacing:.04em !important; line-height:1.2 !important; }
  ${NGD} > .k-stage > :is(.k-world--stage, .k-stage__poster),
  ${NGD} > .k-stage > .orr-ng-hero-box { left:25% !important; width:50% !important; top:51% !important; height:23% !important; }
  ${NGD} > .k-stage::before { left:25%; width:50%; top:72%; }
}
`;

// phone: the three hull names share one row in thirds; keep the wide ones (PELICAN) inside theirs
const NG_PHONE = 'html:root[data-sf-mobile="1"] body #screens > .k-screen.orr-newgame.orr-newgame';
export const NEW_GAME_PHONE_CSS = `
${NG_PHONE} .orr-turntable > .orr-turntable__row { gap:12px !important; justify-content:space-between !important; }
${NG_PHONE} .orr-turntable > .orr-turntable__row > li { flex:1 1 auto !important; min-width:max-content !important; }
${NG_PHONE} .orr-turntable > .orr-turntable__row > li .k-word {
  font-size:clamp(14px, 4.2vw, 17px) !important; letter-spacing:.08em !important; white-space:nowrap !important; }
${NG_PHONE} .orr-turntable > .orr-turntable__row > li .k-word-sub { letter-spacing:.14em !important; }
`;

export function injectNewGameLayouts(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function') return;
  injectOrrery(doc);
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = NEW_GAME_LAYOUT_CSS + NEW_GAME_PHONE_CSS;
  doc.head.appendChild(style);
}
