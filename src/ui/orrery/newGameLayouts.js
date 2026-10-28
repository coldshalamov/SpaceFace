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
${NG} .orr-ng-key--legend:not([aria-pressed="true"]) {
  color:rgb(${BONE} / .82) !important; }
${NG} .orr-ng-key--small::before { color:rgb(${BONE} / .78) !important; }
/* a choice pair's chosen word is the Hand's word: lamp-hot ink (the crucible door's checked word),
   the other dimmer; without this the rest colour above flattened pressed and hover to the same ink */
${NG} .orr-ng-key--legend[aria-pressed="true"] {
  color:var(--dp-lamp-hot, #ffd98c) !important; text-shadow:0 0 18px rgb(255 217 140 / .35); }
${NG} .orr-ng-key--legend:not([aria-pressed="true"]):is(:hover, :focus-visible) {
  color:rgb(${BONE} / .95) !important; }

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

/* 701–1100 wide desktop: the four beats share a ~380–560px stage, so each title had ~90–120px and
   ellipsized ("Wake at t…", "Dock and…"). The titles wrap onto a second line under their bead instead. */
@media (min-width:701px) and (max-width:1100px) {
  ${NGD} .sf-ng-route .sf-ng-route__steps { gap:16px !important; }
  ${NGD} .sf-ng-route .sf-ng-route__step .k-row__name {
    white-space:normal !important; overflow:visible !important; text-overflow:clip !important;
    text-wrap:balance; overflow-wrap:break-word; line-height:1.25 !important; }
}

/* 701–800 wide desktop, 860+ tall (760×900, 800×900): the stage is ~340–380px wide, so the fittings'
   two columns ran off the right edge (SHIELD BOOSTER, MINING LASER), the hero render and the ring's THRUST
   reading sat on top of them, and the ring's right reading (5.5k LINE) ran off the frame. The fittings wrap as
   one flowing list under the hull's sentence, and the hero box (which the yard and the stats ring both measure)
   narrows, centres and drops below them, so MASS and LINE stand inside the stage. */
@media (min-width:701px) and (max-width:800px) and (min-height:860px) {
  ${NGD} .orr-ng-caption ul[aria-label="Loadout"] {
    display:flex !important; flex-direction:row !important; flex-wrap:wrap !important; gap:6px 18px !important;
    width:auto !important; max-width:100% !important; }
  ${NGD} .orr-ng-caption ul[aria-label="Loadout"] > li + li::before { display:none !important; }
  ${NGD} .orr-ng-caption ul[aria-label="Loadout"] .fh-legend,
  ${NGD} .orr-ng-caption ul[aria-label="Loadout"] .orr-ng-label {
    display:inline-flex !important; grid-template-columns:none !important; column-gap:6px !important; font-size:12px !important; font-stretch:100% !important; font-variation-settings:"wdth" 100, "wght" 620 !important; letter-spacing:.06em !important; }
  /* the hero box keeps 44px left of it for MASS and 90px right of it for LINE and its gloss (which run on
     past the stage into the window's margin), so at 701–760 it narrows and slides left rather than push them off */
  ${NGD} > .k-stage { --ng-hero-w:min(52%, 100% - 134px); --ng-hero-x:max(44px, min(21%, 100% - var(--ng-hero-w) - 90px)); }
  ${NGD} > .k-stage > :is(.k-world--stage, .k-stage__poster),
  ${NGD} > .k-stage > .orr-ng-hero-box { left:var(--ng-hero-x) !important; width:var(--ng-hero-w) !important; top:45% !important; height:17% !important; }
  ${NGD} > .k-stage::before { left:var(--ng-hero-x); width:var(--ng-hero-w); top:59%; }
  /* the run's beats: each beat's line wrapped to ~70px under its title (the run stood ~230–340px tall and pulled
     the yard, and the hull render on it, up out of the ring and over THRUST at 701–720). The titles keep their
     four columns on the scale, and all four lines stand beneath them as one full-width list in beat order, each
     led by a small ring like the beads (the step and its wrapper become grid cells so the lines flow at their own
     height). Every line shows at once, so they read without a mouse (keyboard, touch). */
  ${NGD} .sf-ng-route .sf-ng-route__steps { display:grid !important; grid-template-columns:repeat(4, minmax(0, 1fr)) !important;
    column-gap:16px !important; row-gap:3px !important; padding-bottom:0 !important; align-items:start; }
  ${NGD} .sf-ng-route .sf-ng-route__step,
  ${NGD} .sf-ng-route .sf-ng-route__step > div { display:contents !important; }
  ${NGD} .sf-ng-route .sf-ng-route__step .k-row__name { grid-row:1; margin-bottom:4px; }
  ${NGD} .sf-ng-route .sf-ng-route__step:first-child .k-row__name { grid-column:1; }
  ${NGD} .sf-ng-route .sf-ng-route__step:nth-child(2) .k-row__name { grid-column:2; }
  ${NGD} .sf-ng-route .sf-ng-route__step:nth-child(3) .k-row__name { grid-column:3; }
  ${NGD} .sf-ng-route .sf-ng-route__step:nth-child(4) .k-row__name { grid-column:4; }
  /* the beads now sit in the list's box: on the titles' row (so they keep their height on the scale), each
     stepped over to its column */
  ${NGD} .sf-ng-route .sf-ng-route__step::before { grid-row:1; }
  ${NGD} .sf-ng-route .sf-ng-route__step:nth-child(2)::before { left:calc((100% - 48px) / 4 + 16px - 1px) !important; }
  ${NGD} .sf-ng-route .sf-ng-route__step:nth-child(3)::before { left:calc((100% - 48px) / 2 + 32px - 1px) !important; }
  ${NGD} .sf-ng-route .sf-ng-route__step:nth-child(4)::before { left:calc((100% - 48px) * 3 / 4 + 48px - 1px) !important; }
  ${NGD} .sf-ng-route .sf-ng-route__step .k-row__sub { position:relative !important; grid-column:1 / -1; opacity:1 !important;
    margin:0 !important; padding-left:10px !important; line-height:1.3 !important; }
  ${NGD} .sf-ng-route .sf-ng-route__step:nth-child(2) .k-row__sub { grid-row:3; }
  ${NGD} .sf-ng-route .sf-ng-route__step:nth-child(3) .k-row__sub { grid-row:4; }
  ${NGD} .sf-ng-route .sf-ng-route__step:nth-child(4) .k-row__sub { grid-row:5; }
  ${NGD} .sf-ng-route .sf-ng-route__step:first-child .k-row__sub { grid-row:2; }
  ${NGD} .sf-ng-route .sf-ng-route__step .k-row__sub::before { content:""; position:absolute; left:0; top:.5em; width:4px; height:4px;
    border-radius:50%; box-shadow:inset 0 0 0 1px currentColor; }
  /* the ring's side names at normal width and the LINE gloss condensed (as in the one-column layout) */
  ${NGD} .orr-hullring text.orr-hullring__label { font-variation-settings:"wght" 600, "wdth" 100 !important; letter-spacing:.16em !important; }
  ${NGD} .orr-hullring text.orr-hullring__gloss { font-stretch:75% !important; font-variation-settings:"wght" 500, "wdth" 75 !important; letter-spacing:.02em !important; }
  /* the yard's rear ends sit ~150px apart here, so the rear names (WASP, PELICAN) set tighter */
  ${NGD} .orr-yard > .orr-turntable__row > li:not(.is-front) .k-word { font-size:12px !important; letter-spacing:.04em !important; }
  ${NGD} .orr-yard > .orr-turntable__row > li:not(.is-front) .k-word-sub { letter-spacing:.08em !important; }
  /* the narrower ring brings the rear ends beside the front name: the rear hulls go by name only (as at ≤480) */
  ${NGD} .orr-yard > .orr-turntable__row > li:not(.is-front) .k-word-sub { opacity:0 !important; }
}

/* a narrow desktop window (≤700 wide, no data-sf-mobile; 390×844, 600×844): the two columns kept the
   340px form column, so the stage had 0px (it sat off the right edge) and the yard piled HITCH, PELICAN and
   WASP on the frame's top-left corner, with no way to see or pick a hull. The plate becomes one column that
   scrolls as a page: the title, the form, then the stage (the hull's name and line, its ring with the LINE
   gloss, the yard), what the hull carries and the first fifteen minutes, with BACK / LAUNCH held at the foot
   of the window. The plate grows to its content and the screens layer scrolls it, so the stage, the hero box
   and the yard (measured against the plate) move together. Phones keep their own layout. */
@media (max-width:700px) {
  html:not([data-sf-mobile="1"]) body #screens:has(> .k-screen.orr-newgame.orr-newgame) {
    overflow-x:hidden !important; overflow-y:auto !important; overscroll-behavior:contain;
    scrollbar-width:thin; scrollbar-color:rgb(${BONE} / .4) transparent; }
  ${NGD} { position:absolute !important; top:0 !important; left:0 !important; right:0 !important; bottom:auto !important;
    height:auto !important; min-height:100% !important; overflow:visible !important;
    grid-template-columns:minmax(0, 1fr) !important; grid-template-rows:auto auto auto auto auto !important;
    grid-template-areas:"title" "hang" "stage" "foot" "note" !important; align-content:start !important;
    column-gap:0 !important; row-gap:26px !important; }
  ${NGD} > .sf-ng-body { overflow:visible !important; height:auto !important; max-height:none !important; min-height:auto !important; }
  /* the stage: a 352px band for the hull (name and line top-left, ring, yard), then the caption's flow */
  ${NGD} > .k-stage { height:auto !important; min-height:auto !important; padding:352px 0 0 !important; overflow:visible !important; }
  ${NGD} .k-stage__foot.orr-ng-caption { position:static !important; inset:auto !important; display:flex !important;
    flex-direction:column !important; gap:26px !important; height:auto !important; pointer-events:auto; }
  ${NGD} .orr-ng-caption > .sf-slot-card-title { position:absolute !important; left:0 !important; top:0 !important; font-size:28px !important; }
  ${NGD} .orr-ng-caption > .k-sentence { position:absolute !important; left:0 !important; top:40px !important; margin:0 !important;
    max-width:min(340px, 86%) !important; font-size:13px !important; line-height:1.4 !important; }
  /* the hero box (the ring and the yard both measure it) keeps 68px left of it for MASS and 113px right of it
     for LINE and its gloss (which may run 14px into the margin), and centres once the stage is wide enough */
  ${NGD} > .k-stage { --ng-hero-w:min(50%, 100% - 181px); --ng-hero-x:max(68px, min(25%, 100% - var(--ng-hero-w) - 113px)); }
  ${NGD} > .k-stage > :is(.k-world--stage, .k-stage__poster),
  ${NGD} > .k-stage > .orr-ng-hero-box { left:var(--ng-hero-x) !important; width:var(--ng-hero-w) !important; top:150px !important; height:92px !important; }
  ${NGD} > .k-stage::before { left:var(--ng-hero-x); width:var(--ng-hero-w); top:226px; height:30px; }
  /* the fittings: one column of name + size under a rule */
  ${NGD} .orr-ng-caption > div:has(> ul[aria-label="Loadout"]) { position:static !important; margin:0 !important; padding-top:16px !important;
    border-top:1px solid rgb(${BONE} / .16); }
  ${NGD} .orr-ng-caption ul[aria-label="Loadout"] { display:flex !important; flex-direction:column !important; gap:6px !important;
    width:auto !important; max-width:100% !important; }
  ${NGD} .orr-ng-caption ul[aria-label="Loadout"] > li + li::before { display:none !important; }
  /* the first fifteen minutes: the four beats two by two, each with its line */
  ${NGD} .orr-ng-caption > .sf-ng-route { position:static !important; inset:auto !important; margin:0 !important; padding-top:16px !important;
    border-top:1px solid rgb(${BONE} / .16); }
  ${NGD} .sf-ng-route .sf-ng-route__steps { display:grid !important; grid-template-columns:repeat(2, minmax(0, 1fr)) !important;
    gap:18px 24px !important; padding:4px 0 0 !important; }
  ${NGD} .sf-ng-route .sf-ng-route__steps::before,
  ${NGD} .sf-ng-route .sf-ng-route__steps::after { display:none !important; }
  ${NGD} .sf-ng-route .sf-ng-route__step { padding:0 0 0 20px !important; height:auto !important; }
  ${NGD} .sf-ng-route .sf-ng-route__step::before { left:0 !important; top:4px !important; }
  ${NGD} .sf-ng-route .sf-ng-route__step .k-row__sub { display:block !important; opacity:1 !important; }
  /* BACK / LAUNCH stay at the window's foot over a dark band while the column scrolls under them */
  ${NGD} > .sf-ng-footer { position:sticky !important; bottom:0 !important; z-index:40 !important;
    margin:0 !important; padding:16px 0 16px !important;
    border-image:linear-gradient(180deg, rgb(4 6 9 / 0), rgb(4 6 9 / .9) 18px, rgb(4 6 9 / .95)) fill 0 / / 0 100vw !important; }
  /* the yard's rear names hang on the ring's floor ellipse, which is drawn over them: they drop just below it */
  ${NGD} .orr-yard > .orr-turntable__row > li:not(.is-front) { translate:0 20px !important; }
  /* and the front name drops a line further, below the rear names, with the stage band grown to match */
  ${NGD} .orr-yard > .orr-turntable__row > li.is-front { translate:0 22px !important; }
  ${NGD} .orr-hullring text.orr-hullring__num { font-size:24px !important; }
  ${NGD} .orr-hullring text.orr-hullring__num tspan { font-size:12px !important; }
  /* the side names set at normal width, and the LINE gloss ("winch speed") condensed, so both
     readings and the gloss stay inside the window beside a hull that keeps most of its size */
  ${NGD} .orr-hullring text.orr-hullring__label { font-variation-settings:"wght" 600, "wdth" 100 !important; letter-spacing:.16em !important; }
  ${NGD} .orr-hullring text.orr-hullring__gloss { font-stretch:75% !important; font-variation-settings:"wght" 500, "wdth" 75 !important; letter-spacing:.02em !important; }
}
/* at phone width the yard's rear ends sit ~130px apart, so the rear names (WASP, PELICAN) set tighter */
@media (max-width:480px) {
  ${NGD} .orr-yard > .orr-turntable__row > li:not(.is-front) .k-word { font-size:12px !important; letter-spacing:.04em !important; }
  ${NGD} .orr-yard > .orr-turntable__row > li:not(.is-front) .k-word-sub { letter-spacing:.08em !important; }
  /* the narrower ring there brings the rear ends close to the front name: the rear hulls go by name only */
  ${NGD} .orr-yard > .orr-turntable__row > li:not(.is-front) .k-word-sub { opacity:0 !important; }
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
