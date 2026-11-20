// UI polish overlay for the Crucible results plate (bench id `crucible-results`).
// The composition lives in screenLayouts.js; this sheet turns the left column into ONE scroll
// column (figures, the run, the build, then the sheet, combo and share) instead of two clipped
// scrollers, rules each band title with a hairline, gives the share codes a field, lifts the
// 1080p band and stacks the plate on a phone. Scoped to `.sf-crucible-results.has-deathdial`;
// selectors and IDs unchanged, no new DOM.
import { injectOrrery } from './tokens.js';

const STYLE_ID = 'orr-crucible-results-style';
const BONE = '236 230 216';
const VOID = '5 7 10';
const R = 'html body #screens > .k-screen.orr-crucible.sf-crucible-results.has-deathdial.has-deathdial';
const RP = 'html:root[data-sf-mobile="1"] body #screens > .k-screen.orr-crucible.sf-crucible-results.has-deathdial.has-deathdial';
const RD = R.replace('html body', 'html:not([data-sf-mobile="1"]) body');
const FADE = 'linear-gradient(180deg, #000 calc(100% - 28px), transparent)';

/* phone (data-sf-mobile): one scrolling plate — title, instrument, column; ways-out stay docked.
   The sticky foot must leave the dial caption (LAST 5 HITS + legend) clear at scroll 0. */
/* Same plate for a narrow desktop window (≤700 wide, no data-sf-mobile): master laid Results out this
   way under @media (max-width:700px); the data-sf-mobile move must not drop that. */
const RESULTS_PLATE = (X) => `${X} { display:flex !important; flex-direction:column !important; gap:18px !important; overflow:hidden auto !important; padding:18px 20px 0 !important; }
${X}::before { position:fixed !important; inset:0 !important; }
${X} > :is(.k-title, .sf-crres-celebrate, .sf-crres__stage) { position:relative !important; z-index:2; }
${X} > .k-title { order:1; padding-right:0 !important; max-width:none !important; }
${X} > .k-title .k-t-title { font-size:46px !important; white-space:nowrap; }
${X} > .sf-crres__dial { order:2; position:relative !important; inset:auto !important; left:auto !important; right:auto !important; top:auto !important; bottom:auto !important;
  flex:none; width:100%;
  /* no z-index here: the dial's glow pool runs ~1300px tall, and lifting it over the title (z 2) dimmed RUN OVER and the death line */
  /* Tall enough for the ring + caption, short enough that LAST 5 HITS + legend end above the docked foot
     (Code Work 2026-10-13 23:50: sticky foot was covering them at 390×844 scroll 0).
     margin-bottom keeps THE TAKE (celebrate) from climbing through the overflowing caption. */
  height:clamp(400px, calc(100svh - 300px), 520px); margin-bottom:76px; }
${X} > .sf-crres__dial :is(.orr-deathdial__groups, .orr-deathdial__engrave) { display:none; }
${X} > .sf-crres__dial .orr-crres-hitlegend { display:block; }
${X} > .sf-crres__dial .orr-deathdial__warn:not(.orr-deathdial__vitals) { display:none; }
${X} > .sf-crres-celebrate { order:3; max-width:none !important; }
${X} .sf-crres__stage { order:4; flex:none !important; max-width:none !important; overflow:visible !important; -webkit-mask-image:none; mask-image:none; padding:0 0 8px !important; }
${X} .orr-crres-figures { grid-template-columns:repeat(2, minmax(0, 1fr)) !important; row-gap:16px !important; }
${X} .sf-crres__build { flex-wrap:wrap; }
${X} .sf-crres__share-row { grid-template-columns:minmax(0, 1fr) auto; row-gap:6px; }
${X} .sf-crres__share-cap { grid-column:1 / -1; }
/* Ways-out stay docked at the glass floor while the plate scrolls under them. */
${X} > .k-foot { order:5; position:sticky; bottom:0; z-index:4; flex:none; margin:auto -20px 0 !important; padding:12px 20px 8px !important;
  /* solid full-width glass floor so THE TAKE can't show through its top edge at scroll 0; the shadow keeps the soft fade */
  background:rgb(${VOID}) !important; box-shadow:0 -16px 16px -2px rgb(${VOID}) !important; }
${X} > .k-foot > .k-words { width:100% !important; max-width:100% !important; flex-wrap:wrap !important; column-gap:26px !important; row-gap:2px !important; }
`;

export const CRUCIBLE_RESULTS_LAYOUT_CSS = `
/* 0 — Tactical hangar backdrop replacing bare black void */
${R},
#crucible-results-overlay.sf-crs {
  background:
    radial-gradient(95% 75% at 50% 0%, rgb(20 44 62 / .38) 0%, transparent 68%),
    radial-gradient(80% 60% at 85% 100%, rgb(38 28 14 / .24) 0%, transparent 65%),
    repeating-linear-gradient(0deg, rgb(158 220 233 / .012) 0 1px, transparent 1px 4px),
    linear-gradient(180deg, #060d14 0%, #04080d 100%) !important;
}
${R}::before {
  background:radial-gradient(circle at 67% 44%, rgb(20 44 62 / .24), rgb(6 13 20 / .68) 58%, rgb(4 8 13 / .84) 100%) !important;
}

/* ways-out are chamfered metallic command keys (STATION_STANDARD §5) */
${R} > .k-foot .k-word, ${RP} > .k-foot .k-word,
${R} .sf-crs-btn {
  display:inline-flex !important; align-items:center; min-height:40px; padding:0 16px;
  font:600 13px var(--dp-face-read, "Instrument Sans") !important; letter-spacing:.08em !important; text-transform:uppercase !important;
  color:#d8eaf2 !important;
  background:linear-gradient(180deg, rgb(20 35 48 / .92) 0%, rgb(12 22 32 / .96) 100%) !important;
  border:1px solid rgb(154 198 218 / .34) !important; border-radius:2px !important;
  box-shadow:inset 0 1px 0 rgb(210 238 250 / .14), 0 6px 16px rgb(0 0 0 / .45) !important;
  transition:background var(--dp-d-cut, 80ms) linear, border-color var(--dp-d-cut, 80ms) linear, color var(--dp-d-cut, 80ms) linear;
}
${R} > .k-foot .k-word:is(:hover, :focus-visible), ${RP} > .k-foot .k-word:is(:hover, :focus-visible),
${R} .sf-crs-btn:is(:hover, :focus-visible) {
  color:#fff1cf !important;
  background:linear-gradient(180deg, rgb(28 48 66 / .95) 0%, rgb(16 30 43 / .98) 100%) !important;
  border-color:#e6ca8f !important;
}
${R} > .k-foot .k-word.k-word--primary, ${RP} > .k-foot .k-word.k-word--primary,
${R} .sf-crs-btn--primary {
  min-height:42px; padding:0 22px;
  font:700 14px var(--dp-face-read, "Instrument Sans") !important; letter-spacing:.12em !important; text-transform:uppercase !important;
  color:#fff1cf !important;
  background:linear-gradient(180deg, rgb(224 181 94 / .32) 0%, rgb(224 181 94 / .14) 100%) !important;
  border:1px solid #e6ca8f !important; border-radius:2px !important;
  clip-path:polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px)) !important;
  box-shadow:inset 0 1px 0 rgb(255 241 207 / .30), 0 8px 22px rgb(0 0 0 / .55) !important;
}
${R} > .k-foot .k-word.k-word--primary::after, ${RP} > .k-foot .k-word.k-word--primary::after {
  color:#ffe7b3 !important;
  box-shadow:inset 0 0 0 1px rgb(230 202 143 / .55) !important;
  background:rgb(9 20 30 / .85) !important;
  border-radius:2px !important;
}
${R} > .k-foot .k-word.k-word--primary:is(:hover, :focus-visible), ${RP} > .k-foot .k-word.k-word--primary:is(:hover, :focus-visible),
${R} .sf-crs-btn--primary:is(:hover, :focus-visible) {
  color:#ffffff !important;
  border-color:#ffd98c !important;
  background:linear-gradient(180deg, rgb(242 185 80 / .42) 0%, rgb(224 181 94 / .22) 100%) !important;
  box-shadow:inset 0 1px 0 rgb(255 248 228 / .45), 0 0 16px rgb(242 185 80 / .28) !important;
}
${R} > .k-foot .k-word:focus-visible, ${RP} > .k-foot .k-word:focus-visible { outline:1px solid #9edce9 !important; outline-offset:1px !important; }

/* Compact top RUN OVER title block & THE TAKE celebration box so all left-column bands fit on screen */
${R} > .k-title {
  margin:0 0 6px !important;
  padding:8px 14px !important;
  max-width:min(620px, 46vw) !important;
  border:1px solid rgb(154 198 218 / .32) !important;
  border-radius:2px !important;
  background:
    linear-gradient(90deg, #f2b950 0 28px, rgb(158 220 233 / .48) 28px 150px, rgb(158 220 233 / .14) 150px 100%) top left / 100% 2px no-repeat,
    linear-gradient(180deg, rgb(25 36 47 / .95), rgb(14 21 29 / .98)) !important;
  box-shadow:inset 0 1px 0 rgb(215 238 248 / .18), 0 8px 20px rgb(0 0 0 / .5) !important;
}
${R} > .k-title .k-t-title {
  font-size:clamp(26px, 2.8vw, 36px) !important;
  line-height:1 !important;
  margin:0 !important;
  color:#edf6fa !important;
}
${R} .sf-crd-headline {
  font-size:13.5px !important;
  line-height:1.3 !important;
  margin:3px 0 0 !important;
  color:rgb(214 234 244 / .9) !important;
}
${R} > .sf-crres-celebrate {
  max-width:min(620px, 46vw) !important;
  margin:0 0 6px !important;
  padding:7px 12px !important;
  border:1px solid rgb(154 198 218 / .28) !important;
  border-radius:2px !important;
  background:
    linear-gradient(90deg, #f2b950 0 24px, rgb(158 220 233 / .44) 24px 120px, transparent 120px 100%) top left / 100% 2px no-repeat,
    linear-gradient(160deg, rgb(12 26 38 / .94), rgb(7 16 24 / .97)) !important;
  box-shadow:inset 0 1px 0 rgb(208 238 250 / .10), 0 6px 16px rgb(0 0 0 / .45) !important;
}
${R} > .sf-crres-celebrate p,
${R} > .sf-crres-celebrate li {
  font-size:12.5px !important;
  line-height:1.28 !important;
  margin:2px 0 0 !important;
}

/* one column, one scroller: compact vertical rhythm so SHARE fits 100% cleanly above the bottom fold */
${R} .sf-crres__stage,
${R} .sf-crs-rail {
  display:flex !important; flex-direction:column !important; gap:6px !important; width:100%; max-width:min(620px, 46vw) !important;
  min-height:0 !important; overflow:hidden auto !important; overscroll-behavior:contain; padding:8px 12px 10px !important; margin:0 !important;
  scrollbar-width:thin; scrollbar-color:rgb(158 220 233 / .55) transparent; -webkit-mask-image:none !important; mask-image:none !important;
}
${R} .sf-crres__stage::before, ${R} .sf-crres__story::before { content:none !important; display:none !important; }
${R} :is(.sf-crres__ledger, .sf-crres__story) { display:contents !important; }
${R} .sf-crres__stage > *, ${R} :is(.sf-crres__ledger, .sf-crres__story) > * { flex:none; margin:0 !important; }

/* 4-cell machined metal telemetry rack for WAVE, KILLS, BEST KILL CHAIN, RUN PURSE / SALVAGE */
${R} .orr-crres-figures,
${R} .sf-crs-stats {
  order:1;
  display:grid !important;
  grid-template-columns:repeat(4, minmax(0, 1fr)) !important;
  gap:8px !important;
  width:100% !important;
  max-width:100% !important;
  padding:0 !important;
}
${R} .orr-crres-figure,
${R} .sf-crs-stat {
  padding:6px 10px !important;
  border:1px solid rgb(154 198 218 / .30) !important;
  border-radius:2px !important;
  background:
    linear-gradient(90deg, #f2b950 0 18px, rgb(158 220 233 / .45) 18px 100%) top left / 100% 2px no-repeat,
    linear-gradient(160deg, rgb(12 26 38 / .95) 0%, rgb(7 16 24 / .98) 100%) !important;
  box-shadow:inset 0 1px 0 rgb(208 238 250 / .12), inset 0 -2px 0 rgb(2 6 10 / .85), 0 6px 16px rgb(0 0 0 / .48) !important;
}
${R} .orr-crres-figure__n {
  color:#fff1cf !important;
  font-size:clamp(20px, 2vw, 26px) !important;
  line-height:1.05 !important;
}
${R} .orr-crres-figure__w {
  color:#9edce9 !important;
  font-size:12px !important;
  letter-spacing:.08em !important;
  margin-top:2px !important;
  line-height:1.15 !important;
  white-space:normal !important;
}
${R} .orr-crres-figures__rest {
  color:#d8eaf2 !important;
  font-size:12.5px !important;
  margin-top:2px !important;
}

${R} .sf-crres__band[data-band="story"] { order:2; }
/* desktop: ruggedized metal-and-glass terminal housings for left summary workspace & right Death Dial bay */
@media (min-width:701px) {
  ${RD} .sf-crres__stage {
    position:relative; z-index:2;
    border:1px solid rgb(154 198 218 / .32) !important;
    border-radius:2px !important;
    background:linear-gradient(180deg, rgb(22 33 44 / .94) 0%, rgb(11 18 26 / .97) 100%) !important;
    box-shadow:inset 0 1px 0 rgb(215 238 248 / .18), inset 0 -2px 0 rgb(2 5 8 / .85), 0 12px 30px rgb(0 0 0 / .62) !important;
  }
  ${RD} > .sf-crres__dial,
  ${RD} .sf-crs-dial-col {
    border:1px solid rgb(154 198 218 / .30) !important;
    border-radius:2px !important;
    background:
      linear-gradient(90deg, #f2b950 0 28px, rgb(158 220 233 / .48) 28px 140px, rgb(158 220 233 / .14) 140px 100%) top left / 100% 2px no-repeat,
      repeating-linear-gradient(0deg, rgb(158 220 233 / .012) 0 1px, transparent 1px 3px),
      radial-gradient(120% 90% at 50% 35%, rgb(24 54 74 / .34), transparent 66%),
      linear-gradient(160deg, rgb(11 24 35 / .93) 0%, rgb(7 16 24 / .96) 100%) !important;
    box-shadow:inset 0 1px 0 rgb(208 238 250 / .14), inset 0 -2px 0 rgb(2 6 10 / .85), 0 12px 28px rgb(0 0 0 / .58) !important;
  }
}
@media (min-width:701px) and (max-width:1599px) {
  ${RD} > .k-title,
  ${RD} > .sf-crres-celebrate,
  ${RD} .sf-crres__stage { max-width:min(540px, 43vw) !important; }
  ${RD} > .sf-crres__dial,
  ${RD} .sf-crs-dial-col { left:calc(min(540px, 43vw) + 78px) !important; right:4vw !important; }
}
@media (min-width:940px) {
  ${RD} .orr-crres-figures { grid-template-columns:repeat(4, minmax(0, 1fr)) !important; gap:8px !important; }
}
${R} .sf-crres__band[data-band="build"] { order:3; }
${R} .sf-crres__sheet { order:4; }
${R} .sf-crres__ledger > .sf-crres__band:not([data-band]) { order:5; }
${R} .sf-crres__share { order:6; }
${R} .sf-crres__story > details.sf-crres__band { order:7; }

/* Frame each debrief band (THIS RUN VS YOUR BEST, Unlock progress, RUN STORY, SHARE) in recessed visor glass */
${R} :is(.sf-crres__band:not([data-band="ledger"]):not([data-band="kill_chain"]):not([data-band="last_seconds"]), .sf-crres__sheet, .sf-crres__share, .sf-crs-band) {
  padding:6px 11px !important;
  border:1px solid rgb(154 198 218 / .26) !important;
  border-radius:2px !important;
  background:
    linear-gradient(90deg, #f2b950 0 22px, rgb(158 220 233 / .42) 22px 110px, rgb(158 220 233 / .10) 110px 100%) top left / 100% 2px no-repeat,
    linear-gradient(160deg, rgb(11 24 35 / .94) 0%, rgb(7 16 24 / .97) 100%) !important;
  box-shadow:inset 0 1px 0 rgb(208 238 250 / .10), 0 6px 16px rgb(0 0 0 / .45) !important;
}

/* band titles: ice-cyan tactical header running into a rule */
${R} :is(.sf-crres__stage, .sf-crres-celebrate) .sf-crres__band-title { display:flex !important; align-items:center; gap:10px; margin:0 0 4px !important; max-width:100%;
  font-size:12px !important; font-weight:700 !important; letter-spacing:.16em !important; color:#9edce9 !important; }
${R} :is(.sf-crres__stage, .sf-crres-celebrate) .sf-crres__band-title::after { content:""; flex:1 1 auto; height:1px; background:linear-gradient(90deg, rgb(158 220 233 / .36), rgb(158 220 233 / 0)); }
${R} :is(.sf-crres__stage, .sf-crres-celebrate) .sf-crres__band-title::before { content:none !important; }
${R} .sf-crres__story-line, ${R} .sf-crres__lead, ${R} .sf-crres__build-name { color:#d8eaf2 !important; line-height:1.3 !important; font-size:13px !important; margin:2px 0 0 !important; }
${R} .sf-crres__build { margin-top:4px !important; padding-top:10px !important; }
${R} .sf-crres__step::before { top:-11px !important; width:7px !important; height:7px !important; }
${R} .sf-crres__step .sf-crres__step-verb { font-size:14px !important; }
${R} .sf-crres__run-name { font-size:14px !important; color:#fff1cf !important; margin:0 !important; }
${R} .sf-crres__sheet .sf-crres__sheet-sub { margin:4px 0 2px !important; }
${R} .sf-crres__sheet .sf-crres__overconfidence,
${R} .sf-crres__sheet .sf-crres__sheet-empty { margin:2px 0 0 !important; font-size:12.5px !important; line-height:1.3 !important; }
${R} .sf-crres__ledger > .sf-crres__band:not([data-band]) .sf-crd-grid { max-width:100%; }
${R} .sf-crres__ledger > .sf-crres__band:not([data-band]) .k-row { min-height:22px !important; padding:2px 0 2px 8px !important; font-size:12.5px !important; }

/* share: compact 'Save run card' button + visor-glass code fields so SHARE fits on screen unclipped */
${R} .sf-crres__share > a.k-word {
  display:inline-flex !important; align-items:center !important;
  min-height:26px !important; height:auto !important;
  padding:2px 10px !important; margin:0 0 4px !important;
  font:600 12.5px/1.2 var(--dp-face-label, "Archivo") !important;
  letter-spacing:.10em !important; text-transform:uppercase !important;
  color:#fff1cf !important;
  border:1px solid rgb(230 202 143 / .62) !important; border-radius:2px !important;
  background:linear-gradient(180deg, rgb(224 181 94 / .24), rgb(224 181 94 / .10)) !important;
  box-shadow:inset 0 1px 0 rgb(255 241 207 / .22) !important;
  text-decoration:none !important;
}
${R} .sf-crres__share > a.k-word:is(:hover, :focus-visible) {
  color:#ffffff !important; border-color:#ffd98c !important; background:rgb(224 181 94 / .32) !important;
}
${R} .sf-crres__share-note { position:absolute !important; width:1px !important; height:1px !important; overflow:hidden !important; clip:rect(0 0 0 0) !important; white-space:nowrap !important; margin:0 !important; }
${R} .sf-crres__share-item { margin:0 0 4px !important; max-width:100%; }
${R} .sf-crres__share-row { display:grid !important; grid-template-columns:86px minmax(0, 1fr) auto; align-items:center; column-gap:10px; }
${R} .sf-crres__share-cap { font-size:12px !important; letter-spacing:.06em !important; color:#9edce9 !important; white-space:nowrap; }
${R} .sf-crres__share-code { width:100% !important; min-width:0; height:24px; box-sizing:border-box; padding:0 8px !important; border:1px solid rgb(154 198 218 / .30) !important; border-radius:2px !important;
  background:rgb(6 14 22 / .92) !important; box-shadow:inset 0 1px 0 rgb(208 238 250 / .08) !important; color:#edf6fa !important;
  font-size:12px !important; text-overflow:ellipsis; outline:none; }
${R} .sf-crres__share-code:focus-visible { border-color:#e6ca8f !important; box-shadow:0 0 0 2px rgb(242 185 80 / .22) !important; }
${R} .sf-crres__share-link { white-space:nowrap; font-size:12px !important; letter-spacing:.10em !important; color:#fff1cf !important;
  border:1px solid rgb(230 202 143 / .55) !important; border-radius:2px !important; background:rgb(224 181 94 / .16) !important; padding:2px 8px !important; min-height:24px !important; display:inline-flex !important; align-items:center !important; }
${R} .sf-crres__share-link:is(:hover, :focus-visible) { color:#ffffff !important; border-color:#ffd98c !important; outline:none !important;
  background:rgb(224 181 94 / .28) !important; }
${R} .sf-crres__share-actions { display:flex; flex-wrap:wrap; gap:4px 10px; margin:4px 0 0; max-width:100%; }
${R} .sf-crres__share-status { margin:2px 0 0 !important; max-width:100%; color:#9edce9 !important; font-size:12px !important; }
${R} .sf-crres__share-status:empty { display:none; }

/* 1080p band: compact vertical spacing so SHARE fits cleanly inside the left panel without being sliced */
@media (min-width:1800px) and (min-height:1000px) {
  ${R} > .k-title, ${R} > .sf-crres-celebrate, ${R} .sf-crres__stage { max-width:min(700px, 44vw) !important; }
  ${R} .sf-crres__stage { gap:6px !important; padding:8px 14px 10px !important; }
  ${R} .orr-crres-figures { max-width:100% !important; }
  ${R} .orr-crres-figure__n { font-size:26px !important; }
  ${R} .orr-crres-figure__w { font-size:12px !important; }
  ${R} .orr-crres-figures__rest { font-size:13px !important; }
  ${R} .sf-crres__stage .sf-crres__band-title { font-size:12px !important; max-width:100%; margin:0 0 3px !important; }
  ${R} :is(.sf-crres__story-line, .sf-crres__lead, .sf-crres__build-name) { font-size:13px !important; line-height:1.3 !important; }
  ${R} .sf-crres__step .sf-crres__step-verb { font-size:14px !important; }
  ${R} .sf-crres__run-name { font-size:14.5px !important; }
  ${R} .sf-crd-headline { font-size:14px !important; }
  ${R} :is(.sf-crres__share-item, .sf-crres__ledger > .sf-crres__band:not([data-band]) .sf-crd-grid) { max-width:100%; }
}

${RESULTS_PLATE(RP)}
@media (max-width:700px) {
${RESULTS_PLATE(R)}
}
/* phone portrait (≤560 wide, ≥701 tall, 390×844): THE TAKE sat wholly under the docked ways-out at
   scroll 0, so the run's verdict needed a scroll to find. The ring is already at its 90px floor and
   the caption is placed from the ring, not the box, so the room comes from the caption's slack: the
   dial rides up into the empty band above BOW, the weapon/bearing/layer line goes (the death line
   right above the ring says the same words), and the reserve under the caption shrinks to match.
   The heading and first line of THE TAKE now read above the foot; strip and legend unchanged. */
@media (max-width:560px) and (min-height:701px) {
  :is(${R}, ${RP}) > .sf-crres__dial { margin-top:-20px !important; margin-bottom:8px !important; }
  :is(${R}, ${RP}) > .sf-crres__dial .orr-deathdial__detail { display:none; }
}

/* ui-polish-383: stacked plate (≤700 wide / phone) parked Wave/Kills/Best/Purse under the sticky
   opaque foot at scroll 0 (under≥1 @390×844; wholly below the fold @651/700×461). Dissolve the
   stage wrapper so figures + THE TAKE can seat above the dial without shrinking the dial's
   caption box (height clamps overflowed KILLED BY / LAST 5 HITS into the numbers). */
@media (max-width:700px) {
  :is(${R}, ${RP}) > .sf-crres__stage {
    display:contents !important;
    -webkit-mask-image:none !important; mask-image:none !important;
  }
  :is(${R}, ${RP}) .orr-crres-figures { order:2 !important; }
  :is(${R}, ${RP}) > .sf-crres-celebrate { order:3 !important; }
  :is(${R}, ${RP}) > .sf-crres__dial { order:4 !important; }
  :is(${R}, ${RP}) .sf-crres__band[data-band="story"] { order:6 !important; }
  :is(${R}, ${RP}) .sf-crres__band[data-band="build"] { order:7 !important; }
  :is(${R}, ${RP}) .sf-crres__sheet { order:8 !important; }
  :is(${R}, ${RP}) .sf-crres__ledger > .sf-crres__band:not([data-band]) { order:9 !important; }
  :is(${R}, ${RP}) .sf-crres__share { order:10 !important; }
  :is(${R}, ${RP}) .sf-crres__story > details.sf-crres__band { order:11 !important; }
  /* The ways-out used to dock over the scroll (sticky, opaque) and buried the dial's killer name, vitals
     and LAST 5 HITS strip at scroll 0 (bench 2026-11-14). They now follow the instrument in the flow, so
     the run's stats end above them and the longer bands (build, sheet, ledger, share) scroll below. */
  :is(${R}, ${RP}) > .sf-crres__dial { height:520px !important; }
  :is(${R}, ${RP}) > .k-foot { order:5 !important; position:relative !important; bottom:auto !important; margin:0 !important; padding:4px 0 12px !important; background:none !important; box-shadow:none !important; }
}
@media (max-width:700px) and (max-height:560px) {
  :is(${R}, ${RP}) { gap:10px !important; padding:12px 16px 0 !important; }
  :is(${R}, ${RP}) > .k-title .k-t-title { font-size:34px !important; }
  :is(${R}, ${RP}) .orr-crres-figures { row-gap:8px !important; }
  :is(${R}, ${RP}) .orr-crres-figure__n { font-size:28px !important; }
  :is(${R}, ${RP}) .orr-crres-figure__w { font-size:12px !important; letter-spacing:.14em !important; margin-top:2px !important; }
  :is(${R}, ${RP}) > .sf-crres-celebrate { margin:0 !important; }
  :is(${R}, ${RP}) > .sf-crres__dial { margin-bottom:10px !important; }
  :is(${R}, ${RP}) > .k-foot { padding:4px 0 8px !important; }
}
@media (max-width:560px) and (min-height:701px) {
  :is(${R}, ${RP}) { gap:12px !important; }
  :is(${R}, ${RP}) .orr-crres-figures { row-gap:10px !important; }
  :is(${R}, ${RP}) .orr-crres-figure__n { font-size:40px !important; }
}

/* ≤600 tall desktop (960×540): the dial plus its full caption (killer, detail, vitals, the
   LAST 5 HITS strip and its legend) needs ~520px, which the full-width foot row would cut in
   half. So the ways-out stack under the left column, and the instrument takes the whole
   right-hand height down to the plate's floor; nothing in the caption is hidden. */
@media (min-width:701px) and (max-height:600px) {
  ${R} > .sf-crres__dial { top:2px !important; bottom:4px !important; overflow:visible !important; }
  ${R} .orr-deathdial__caption { padding-bottom:0 !important; }
  ${R} .orr-deathdial__strip { margin-top:8px !important; }
  ${R} .orr-crres-hitlegend { display:block !important; margin:2px 0 0 !important; }
  ${R} > .k-foot { position:relative; z-index:5; max-width:calc(42vw - 60px) !important; box-sizing:border-box; }
  ${R} > .k-foot > .k-words { flex-wrap:wrap !important; column-gap:26px !important; row-gap:6px !important; max-width:100% !important; }
  ${R} > .k-foot .k-word.k-word--primary { flex:0 0 100%; font-size:15px !important; padding-bottom:8px !important; }
  ${R} > .k-foot .k-word.k-word--primary::after { content:none !important; display:none !important; }
  ${R} .sf-crres__stage { position:relative; z-index:2; gap:12px !important; padding:0 12px 16px 0 !important; }
  ${R} .orr-crres-figure__n { font-size:30px !important; }
  ${R} .orr-crres-figure__w { font-size:12px !important; letter-spacing:.18em !important; margin-top:4px !important; }
  ${R} :is(.sf-crres__stage, .sf-crres-celebrate) .sf-crres__band-title { margin:0 0 6px !important; }
  ${R} > .k-title .k-t-title { font-size:clamp(34px, 7.2vh, 48px) !important; }
  ${R} > .sf-crres-celebrate { margin:0 !important; }
  /* The column scrolls in ~230px here, and the cut fell right after "3 drafts changed what your guns
     do:" with the chain itself below the fold. WHAT YOU BUILT moves up under the figures (the dial
     caption already carries who and from where), and THE RUN's lines run on under the fade. */
  ${R} .sf-crres__band[data-band="build"] { order:2; }
  ${R} .sf-crres__band[data-band="story"] { order:3; }
  /* The scroll column ran straight into the ways-out: its fade left a half-line ("Converged on…")
     ghosting 20px above RUN IT AGAIN with nothing to say the column ends there. The foot now opens on
     a hairline across the column with room above it, so the fade reads as the column's lower edge. */
  ${R} .sf-crres__stage { padding-bottom:2px !important; -webkit-mask-image:linear-gradient(180deg, #000 calc(100% - 14px), transparent); mask-image:linear-gradient(180deg, #000 calc(100% - 14px), transparent); }
  ${R} > .k-foot { border-top:1px solid rgb(${BONE} / .16) !important; padding-top:10px !important; margin-top:0 !important; }
}
@media (min-width:701px) and (max-width:880px) and (max-height:600px) {
  ${R} > .k-foot .k-word.k-word--primary { font-size:13px !important; }
}

/* 780–939 × ≤600 (800×600): the even four-up grid gave each figure ~80px, so BEST KILL CHAIN broke
   onto three lines and SALVAGE ran out of its cell into the dial's PORT label. Each figure takes its
   own width on one line at a slightly tighter tracking, which fits the column with room to spare. */
@media (min-width:780px) and (max-width:939px) and (max-height:600px) {
  ${RD} .orr-crres-figures { grid-template-columns:repeat(4, max-content) !important; column-gap:14px !important; }
  ${RD} .orr-crres-figure__w { white-space:nowrap; letter-spacing:.08em !important; }
}
/* 701–779 × ≤600: one-line figures overflow the narrower column (SALVAGE clipped, 88 over PORT), so
   columns may shrink and BEST KILL CHAIN wraps to two lines while every label stays whole. */
@media (min-width:701px) and (max-width:779px) and (max-height:600px) {
  ${RD} .orr-crres-figures { grid-template-columns:repeat(4, minmax(0, auto)) !important; column-gap:10px !important; }
  ${RD} .orr-crres-figure__w { letter-spacing:.08em !important; overflow-wrap:normal; }
}

/* 601–720 tall: keep a thin safety clip so a long killer name cannot bleed into the foot */
@media (min-width:701px) and (min-height:601px) and (max-height:720px) {
  ${R} > .sf-crres__dial { overflow:hidden !important; }
  ${R} > .k-foot { position:relative; z-index:5; }
}


`;

export function injectCrucibleResultsLayouts(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById(STYLE_ID)) return;
  injectOrrery(doc);
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CRUCIBLE_RESULTS_LAYOUT_CSS;
  doc.head.appendChild(style);
}
