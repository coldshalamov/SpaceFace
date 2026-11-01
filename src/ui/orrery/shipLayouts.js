// ORRERY composition for THE SHIP (design/frontend/ORRERY.md §6) — the flight host of the shared
// shipworks stage (src/ui/station/screens/shipworks.js, host 'flight'). The dock host is styled by
// shipworksLayouts.js (`.orr-station .sx-sw`), whose header reserves this file: "THE SHIP keeps its
// own sheet". Same instrument voice, minus commerce: light pools instead of plates, the power dial
// actually rendered (its stroke rules were dock-scoped, so the flight core showed a bare numeral),
// numerals thin and tabular, labels etched, one amber leader — the active fleet row's Hand marker,
// the chosen band or slot, and the save-fit Lamp Key. Red never appears; ice only on a proposed
// fit's ghost. Injected on mount from shipScreen.js and scoped to #sf-ship, so the dock's shipworks
// tab never sees a byte of it.
//
// The stage's nodes are shared markup (stationFrames.js shipworksFrameHtml): this sheet restyles
// them in place, it does not rebuild them — the same contract shipworksLayouts.js keeps for the dock.

const STYLE_ID = 'sf-orrery-ship';

// Same selector weight the retired Deckplate SHIP block uses (src/ui/deckplate/screens.js, SH =
// 'html body #screens #sf-ship') with one more class, and injected last: ties go to this sheet.
const W = 'html body #screens #sf-ship .sx-sw';

const BONE = '236 230 216';            // warm bone instrument light (--dp-ink family)
const INK = 'rgb(248 244 234)';        // lit words
const POOL = '7 8 10';                 // the pool the instruments float on
const LABEL = 'font-family:var(--dp-face-label, "Archivo") !important; font-stretch:112%; font-variation-settings:"wdth" 112, "wght" 650 !important; font-weight:650 !important; text-transform:uppercase;';
const NUM = 'font-family:var(--dp-face-numeral, "Archivo") !important; font-stretch:100%; font-variant-numeric:tabular-nums;';
const PLAIN = 'background:none !important; border:0 !important; border-image:none !important; box-shadow:none !important; clip-path:none !important;';
const HAND = 'clip-path:polygon(0 0, 100% 50%, 0 100%, 26% 50%) !important;';
const RULE = `background:linear-gradient(90deg, rgb(${BONE} / .2), rgb(${BONE} / .04)) 0 0 / 100% 1px no-repeat !important;`;

const CSS = `
/* ---- the frame: plates stand down; the instruments float on pools of light -------------------- */
${W} { ${PLAIN} }
${W} .sx-sw__main { ${PLAIN} }
${W} .sx-sw__rail { ${PLAIN} }
${W} .sx-sw__stats { ${PLAIN} position:relative; isolation:isolate; }
${W} .sx-sw__stats::before { content:""; position:absolute; z-index:-1; inset:-34px -56px -30px -56px; pointer-events:none;
  background:radial-gradient(closest-side, rgb(${POOL} / .8), rgb(${POOL} / .55) 58%, rgb(${POOL} / 0)); }
${W} .sx-sw__side { ${PLAIN} position:relative; isolation:isolate; }
${W} .sx-sw__side::before { content:""; position:absolute; z-index:-1; inset:0; pointer-events:none; background:rgb(${POOL} / .8);
  -webkit-mask-image:linear-gradient(90deg, transparent, #000 20%, #000 82%, transparent), linear-gradient(180deg, transparent, #000 6%, #000 94%, transparent);
  -webkit-mask-composite:source-in; mask-image:linear-gradient(90deg, transparent, #000 20%, #000 82%, transparent), linear-gradient(180deg, transparent, #000 6%, #000 94%, transparent);
  mask-composite:intersect; }

/* ---- the fleet rail: inspect-only, one row, the Hand at the active hull ----------------------- */
${W} .sx-sw__carousel { ${PLAIN} }
${W} .sx-sw__list { ${PLAIN} gap:2px !important;
  background:linear-gradient(90deg, transparent 7px, rgb(${BONE} / .22) 7px, rgb(${BONE} / .22) 8px, transparent 8px) !important; }
${W} .sx-sw-row { ${PLAIN} position:relative; padding:9px 4px 9px 28px !important; min-height:0 !important; height:auto !important; text-align:left; }
${W} .sx-sw-row::after { display:none !important; }
${W} .sx-sw-row::before { content:"" !important; display:block !important; position:absolute !important; left:4px !important; top:50% !important;
  width:8px !important; height:1px !important; background:rgb(${BONE} / .38) !important; box-shadow:none !important; transform:none !important; clip-path:none !important; }
${W} .sx-sw-row:is(.is-active, .is-selected, .is-viewed, [aria-pressed='true'], [aria-current='true'])::before {
  left:2px !important; width:11px !important; height:14px !important; margin-top:-7px !important; ${HAND}
  background:var(--dp-hand, #f2b950) !important; filter:drop-shadow(0 0 5px rgb(242 185 80 / .55)); }
${W} .sx-sw-row:is(:hover, :focus-visible) { outline:none !important; }
${W} .sx-sw-row:is(:hover, :focus-visible) .k-row__name { color:rgb(255 250 240) !important; }
${W} .sx-sw-row .k-row__name { font-size:14px !important; color:${INK} !important; }
${W} .sx-sw-row .k-row__sub { ${LABEL} font-size:12px !important; letter-spacing:.16em !important; color:rgb(${BONE} / .6) !important; }
${W} .sx-sw-row .sx-sw-row__flag { ${LABEL} font-size:12px !important; letter-spacing:.18em !important; color:rgb(${BONE} / .8) !important; background:none !important; border:0 !important; }

/* ---- the nameplate: the hull's word in the display role, the rename field a lit rule ----------- */
${W} .sx-sw__nameplate { isolation:isolate; }
${W} .sx-sw__nameplate::before { content:""; position:absolute; z-index:-1; inset:-20px -34px -16px -24px; pointer-events:none;
  background:radial-gradient(closest-side, rgb(${POOL} / .72), rgb(${POOL} / .48) 60%, rgb(${POOL} / 0)); }
${W} .sx-sw__name { font-family:var(--dp-face-display, "Archivo") !important; font-stretch:125%; font-variation-settings:"wdth" 125, "wght" 800 !important;
  font-weight:800 !important; font-size:clamp(30px, min(2.7vw, 4.8vh), 46px) !important; line-height:1 !important; letter-spacing:.005em !important;
  color:${INK} !important; text-shadow:0 1px 12px rgb(${POOL} / .6) !important; }
${W} .sx-sw__name .sf-entity-link { text-decoration:none !important; background-image:none !important; border-bottom:0 !important; color:inherit !important; }
${W} .sx-sw__condition { ${LABEL} font-size:12px !important; letter-spacing:.22em !important; color:rgb(${BONE} / .72) !important; }
${W} .sx-sw__conditionPct { font-variant-numeric:tabular-nums; }
${W} .sx-sw__nameEdit { ${PLAIN} display:block !important; width:min(340px, 100%) !important; margin-top:6px !important; padding:1px 0 5px !important;
  border-bottom:1px solid rgb(${BONE} / .3) !important; border-radius:0 !important;
  font-family:var(--dp-face-numeral, "Archivo") !important; font-size:14px !important; color:${INK} !important; caret-color:var(--dp-hand, #f2b950); }
${W} .sx-sw__nameEdit::placeholder { color:rgb(${BONE} / .45); }
${W} .sx-sw__nameEdit:hover { border-bottom-color:rgb(${BONE} / .62) !important; }
${W} .sx-sw__nameEdit:is(:focus, :focus-visible) { outline:none !important; border-bottom:2px solid var(--dp-hand, #f2b950) !important; padding-bottom:4px !important;
  background:linear-gradient(180deg, rgb(242 185 80 / .08), rgb(242 185 80 / 0) 7px) !important; }
${W} .sx-sw__nameEdit:is(:focus, :focus-visible)::placeholder { color:var(--dp-hand-dim, #8a6b3a); }
${W} .sx-sw__blurb { font-family:var(--dp-face-body, "Instrument Sans"), sans-serif !important; font-size:14px !important; line-height:1.5 !important;
  color:rgb(${BONE} / .82) !important; max-width:52ch; text-shadow:0 1px 8px rgb(${POOL} / .55) !important; }

/* ---- the six readings: a ledger line at the stage's foot, no plate ----------------------------- */
${W} .sx-sw__gauges { ${PLAIN} isolation:isolate; gap:0 26px !important; justify-content:center !important; flex-wrap:nowrap !important;
  white-space:nowrap; padding:6px 28px !important; }
${W} .sx-sw__gauges::before { content:""; position:absolute; z-index:-1; inset:-4px 0 -8px; pointer-events:none;
  background:linear-gradient(180deg, rgb(${POOL} / 0), rgb(${POOL} / .62) 30% 72%, rgb(${POOL} / 0)); }
${W} .sx-sw-gauge { ${PLAIN} padding:0 !important; min-height:0 !important; gap:8px !important; }
${W} .sx-sw-gauge .k-row__name { ${LABEL} font-size:12px !important; letter-spacing:.06em !important; color:rgb(${BONE} / .86) !important; }
${W} .sx-sw-gauge .k-row__num { ${NUM} font-size:13px !important; color:${INK} !important; }
/* the rack's count is its own line at every width — "0/2 ARMED · 0 STOWED" never breaks mid-count */
${W} .sx-sw-rack .sx-sw-band__label .k-38 { display:block; margin-top:2px; }
@media (max-width:1500px) {
  ${W} .sx-sw__gauges { gap:0 14px !important; }
  ${W} .sx-sw-gauge .k-row__name { letter-spacing:.14em !important; }
}
/* 1101–1500 × ≤800 (1280×720, 1366×768): the three-column frame leaves the stage about 620px,
   and the hull beads sit beneath the wide nameplate copy. Keep the complete description in a
   column beside the hull; the callout solver already avoids the nameplate ink. */
@media (min-width:1101px) and (max-width:1500px) and (max-height:800px) {
  ${W} .sx-sw__nameplate .sx-sw__blurb { max-width:232px !important; font-size:13px !important; line-height:1.4 !important;
    max-height:none !important; overflow:visible !important; }
}
/* The active fleet row has a 230px rail. This tracking keeps its hull name and tier on one line
   without changing the row's inspection target or selected-state marker. */
@media (min-width:1101px) {
  ${W} .sx-sw-row .k-row__sub { letter-spacing:.08em !important; white-space:nowrap; }
}

/* ---- the bands: one dominant numeral, the rest readings; the chosen band lit by the Hand ------- */
${W} .sx-sw-bands { gap:10px 30px !important; align-items:flex-end; }
${W} .sx-sw-hero { ${PLAIN} position:relative; padding:2px 0 8px !important; min-height:0 !important; text-align:left; }
${W} .sx-sw-hero::before, ${W} .sx-sw-hero::after { display:none !important; }
${W} .sx-sw-hero .k-hero__n { ${NUM} font-weight:540 !important; font-size:clamp(17px, 2vh, 22px) !important; line-height:1.05 !important;
  letter-spacing:.01em !important; color:${INK} !important; text-shadow:none !important; }
${W} .sx-sw-hero .k-hero__w { ${LABEL} font-size:12px !important; letter-spacing:.06em !important; color:rgb(${BONE} / .62) !important; margin-top:6px; }
/* the top speed is the screen's one dominant numeral */
${W} .sx-sw-hero[data-band='handling'] .k-hero__n { font-size:clamp(42px, 5.4vh, 64px) !important; font-weight:250 !important;
  font-variation-settings:"wdth" 100, "wght" 250 !important; letter-spacing:-.01em !important; white-space:nowrap; }
/* docked is already the word beside the name; it is not a fifth hero */
${W} .sx-sw-hero[data-band='condition'] { display:none !important; }
${W} .sx-sw-hero:is(:hover, :focus-visible) { outline:none !important; }
${W} .sx-sw-hero:is(:hover, :focus-visible) .k-hero__n { color:rgb(255 250 240) !important; }
${W} .sx-sw-hero:is(:hover, :focus-visible) .k-hero__w { color:var(--dp-hand-hot, #ffd98c) !important; }
${W} .sx-sw-hero:is(.is-selected, [aria-pressed='true']) .k-hero__w { color:var(--dp-hand, #f2b950) !important; }
${W} .sx-sw-hero:is(.is-selected, [aria-pressed='true'])::after { content:"" !important; display:block !important; position:absolute !important;
  left:0 !important; bottom:0 !important; width:16px !important; height:2px !important; background:var(--dp-hand, #f2b950) !important; }

/* the band's detail rows: a ruled ledger under the bands */
${W} .sx-sw__stats .k-row { ${PLAIN} display:grid !important; grid-template-columns:auto minmax(0, 1fr) auto; column-gap:12px; align-items:baseline;
  padding:5px 0 !important; min-height:0 !important; ${RULE} }
${W} .sx-sw__stats .k-row > .k-row__name { font-size:12.5px !important; color:rgb(${BONE} / .72) !important; min-width:0; }
${W} .sx-sw__stats .k-row > .k-row__num { ${NUM} font-size:13px !important; color:${INK} !important; text-align:right; white-space:nowrap; }
${W} .sx-sw__stats .k-row .k-38 { color:rgb(${BONE} / .55) !important; font-size:12px !important; }
${W} .sx-sw__stats .k-row .sx-sw-ghost { color:var(--dp-ice, #8fcbff) !important; }
${W} .sx-sw-band__meta { font-size:12px !important; color:rgb(${BONE} / .58) !important; }

/* the handling bars: scales of light — a ruled line with ticks, the value a bright filament */
${W} .sx-sw-bar { grid-template-columns:74px minmax(0, 1fr) auto !important; }
${W} .sx-sw-bar > .k-row__name { font-size:12.5px !important; }
${W} .sx-sw-bar__track { ${PLAIN} height:9px !important; width:auto !important;
  background:linear-gradient(rgb(${BONE} / .26), rgb(${BONE} / .26)) 0 50% / 100% 1px no-repeat,
    repeating-linear-gradient(90deg, rgb(${BONE} / .32) 0 1px, transparent 1px 20px) 0 50% / 100% 9px no-repeat !important; }
${W} .sx-sw-bar__track > .k-bar__fill { height:2px !important; top:50% !important; margin-top:-1px; background:${INK} !important; box-shadow:none !important; }

/* capability chips: words with a chevron, like every other verb here */
${W} .sx-sw-chip { ${PLAIN} ${LABEL} min-height:0 !important; height:auto !important; padding:4px 0 !important; font-size:12px !important;
  letter-spacing:.16em !important; color:rgb(${BONE} / .8) !important; }
${W} .sx-sw-chip::after { display:none !important; }
${W} .sx-sw-chip::before { all:unset !important; content:"›  " !important; color:rgb(${BONE} / .55) !important; }
${W} .sx-sw-chip:is(:hover, :focus-visible) { color:var(--dp-hand, #f2b950) !important; outline:none !important; }

/* ---- the builds band: chips as words; save fit is the screen's one Lamp Key -------------------- */
${W} .sx-sw-band__label { ${LABEL} font-size:12px !important; letter-spacing:.06em !important; color:rgb(${BONE} / .6) !important; }
${W} .sx-sw-preset { ${PLAIN} position:relative; ${LABEL} min-height:0 !important; height:auto !important; padding:4px 0 !important;
  font-size:12px !important; letter-spacing:.18em !important; color:rgb(${BONE} / .8) !important; }
${W} .sx-sw-preset::after { display:none !important; }
${W} .sx-sw-preset::before { all:unset !important; content:"›  " !important; color:rgb(${BONE} / .55) !important; }
${W} .sx-sw-preset:is(:hover, :focus-visible) { color:var(--dp-hand, #f2b950) !important; outline:none !important; }
${W} .sx-sw-preset:is([aria-pressed='true'], .is-selected) { color:${INK} !important; }
${W} .sx-sw-preset:is([aria-pressed='true'], .is-selected)::before { color:var(--dp-hand, #f2b950) !important; }
${W} .sx-sw-preset.is-dim { color:rgb(${BONE} / .45) !important; cursor:default; }
${W} .sx-sw-preset--save { display:inline-flex !important; align-items:center !important; isolation:isolate; overflow:visible !important;
  padding:0 20px 0 16px !important; min-height:36px !important; font-size:12.5px !important; letter-spacing:.16em !important;
  color:#1c1406 !important; text-shadow:none !important; }
${W} .sx-sw-preset--save::before { all:unset !important; content:"" !important; display:block !important; position:absolute !important;
  inset:0 !important; z-index:-1 !important; background:var(--dp-hand, #f2b950) !important;
  clip-path:polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%) !important; }
${W} .sx-sw-preset--save:not(:disabled):is(:hover, :focus-visible) { color:#1c1406 !important; }
${W} .sx-sw-preset--save:not(:disabled):is(:hover, :focus-visible)::before { background:var(--dp-hand-hot, #ffd98c) !important; }
${W} .sx-sw-preset--save:disabled { color:rgb(${BONE} / .72) !important; cursor:default; }
${W} .sx-sw-preset--save:disabled::before { background:rgb(${BONE} / .26) !important; clip-path:none !important; }
${W} .sx-sw-preset--save .sx-sw-preset__sub, ${W} .sx-sw-preset--save .k-word-sub { color:#3a2c0a !important; margin-left:8px; }
${W} .sx-sw-preset--save.is-dim .sx-sw-preset__sub { color:rgb(${BONE} / .5) !important; }

/* ---- the screen's verbs: chevron words; disabled reads dim; a live verb lights ----------------- */
${W} .sx-sw-verbs { ${PLAIN} gap:2px 24px !important; align-items:center; }
${W} .sx-sw-verb { ${PLAIN} ${LABEL} min-height:0 !important; height:auto !important; padding:4px 0 !important; font-size:12px !important;
  letter-spacing:.18em !important; color:rgb(${BONE} / .8) !important; text-decoration:none !important;
  text-shadow:0 1px 5px rgb(${POOL} / .85), 0 0 12px rgb(${POOL} / .4) !important; }
${W} .sx-sw-verb::after { display:none !important; }
${W} .sx-sw-verb::before { all:unset !important; content:"›  " !important; color:rgb(${BONE} / .55) !important; }
${W} .sx-sw-verb:is(:hover, :focus-visible):not(:disabled) { color:var(--dp-hand, #f2b950) !important; outline:none !important; }
${W} .sx-sw-verb:is([aria-pressed='true'], .is-active) { color:var(--dp-hand, #f2b950) !important; }
${W} .sx-sw-verb:is([aria-pressed='true'], .is-active)::before { color:var(--dp-hand, #f2b950) !important; }
${W} .sx-sw-verb:disabled { color:rgb(${BONE} / .42) !important; cursor:default; }
${W} .sx-sw-verb:disabled::before { color:rgb(${BONE} / .3) !important; }

/* ---- the circuit: the dial renders, the systems hang off it as a ruled ladder ------------------ */
${W} .sx-sw-circuit__identity { ${LABEL} font-size:12px !important; letter-spacing:.22em !important; color:rgb(${BONE} / .72) !important; }
${W} .sx-sw-circuit__sub { font-size:12px !important; color:rgb(${BONE} / .55) !important; text-transform:none; letter-spacing:.04em; }
${W} .sx-sw-circuit__core { position:relative; width:auto; height:150px; margin:6px -24px 10px !important; display:block !important; ${PLAIN} }
/* the dial paints here: the shared station sheet's SH4 block stands the flight host's paint down
   (styles/station.css SH4, display:none), and this composition re-lights it — the flight host is the
   same instrument as the dock minus commerce (shipScreen.js header), and a quantity is an arc
   (ORRERY.md §3.2). display + explicit height beat the SH4 rule and pin the 296x150 viewBox box. */
${W} .sx-sw-circuit__core .orr-power { position:absolute; inset:0; width:auto; height:150px; overflow:visible; display:block !important; }
${W} .orr-power path { fill:none; }
${W} .orr-power .orr-power__band { stroke:rgb(${BONE} / .1); stroke-width:5; }
${W} .orr-power .orr-power__track { stroke:rgb(${BONE} / .2) !important; stroke-width:3; fill:none !important; }
${W} .orr-power__ticks { stroke:rgb(${BONE} / .42); stroke-width:1; }
${W} .orr-power__lit { stroke:rgb(248 244 234); stroke-width:3; }
${W} .orr-power__lit-bloom { stroke:rgb(248 244 234); stroke-width:7; opacity:.18; }
${W} .orr-power__notch { stroke:rgb(${POOL}); stroke-width:2; }
${W} .orr-power__bead { fill:rgb(248 244 234); }
${W} .orr-power__bead-bloom { fill:rgb(248 244 234); opacity:.2; }
${W} .orr-power.is-over .orr-power__lit { stroke:var(--dp-danger, #ff5038); }
${W} .orr-power__ghost { stroke:var(--dp-ice, #8fcbff); stroke-width:1.6; stroke-dasharray:4 3; }
${W} .orr-power__ghost.is-over { stroke:var(--dp-danger, #ff5038); }
${W} .orr-power__seg { fill:none; stroke:rgb(${BONE} / .2); stroke-width:2.5; }
${W} .orr-power__seg.is-fitted { stroke:rgb(248 244 234); }
${W} .orr-power__seg.is-stock { stroke:rgb(${BONE} / .7); }
${W} .orr-power__seg.is-lit { stroke:var(--dp-hand, #f2b950); }
${W} .orr-power__seg-bloom { fill:none; stroke:rgb(${BONE}); stroke-width:7; opacity:.18; }
${W} .orr-power__sys { stroke:rgb(${BONE} / .42); stroke-width:1; }
${W} .orr-power__sys.is-fitted, ${W} .orr-power__sys.is-stock { stroke:rgb(248 244 234); stroke-width:1.4; }
${W} text.orr-power__syslabel { display:inline; font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:12px;
  letter-spacing:.06em; fill:rgb(${BONE} / .55); }
/* the side column is ~285px and overflow-x:hidden (styles/station.css base sheet): the dial draws
   1:1 (scaling its engraved words below the 12px floor is not an option), so the two long bottom
   words step inside instead — a nudge, not a re-layout */
${W} text.orr-power__syslabel:first-of-type { transform:translateX(9px); }
${W} text.orr-power__syslabel:last-of-type { transform:translateX(-11px); }
${W} text.orr-power__syslabel.is-fitted { fill:rgb(248 244 234); }
${W} text.orr-power__syslabel.is-stock { fill:rgb(${BONE} / .82); }
${W} text.orr-power__syslabel.is-lit { fill:var(--dp-hand, #f2b950); }
/* the numeral and its word centre on the dial, not the widened ink box (the dial sits at 47.3%);
   the word rides BELOW the bottom system words — they share the dial's lower band otherwise */
${W} .sx-sw-circuit__core .k-hero__n { position:absolute; left:0; right:5.4%; top:69px; text-align:center; line-height:1 !important;
  ${NUM} font-weight:500 !important; font-size:34px !important; color:${INK} !important; text-shadow:none !important; }
${W} .sx-sw-circuit__core .k-hero__w { position:absolute; left:0; right:5.4%; top:118px; text-align:center;
  ${LABEL} font-size:12px !important; letter-spacing:.06em !important; color:rgb(${BONE} / .62) !important; }
${W} .sx-sw-flow { ${PLAIN} display:grid !important; grid-template-columns:minmax(0, 1fr) auto; column-gap:10px; align-items:baseline;
  padding:5px 0 !important; min-height:0 !important; ${RULE} }
${W} .sx-sw-flow .sx-sw-flow__copy { grid-column:1 / 2; display:flex !important; flex-direction:row !important; justify-content:space-between;
  align-items:baseline; gap:8px; min-width:0; }
${W} .sx-sw-flow .k-row__name { font-size:13px !important; color:rgb(${BONE} / .85) !important; white-space:nowrap; overflow:visible; text-overflow:clip; max-width:none; }
${W} .sx-sw-flow .k-row__sub { font-size:12px !important; color:rgb(${BONE} / .55) !important; font-variant-numeric:tabular-nums;
  white-space:nowrap !important; overflow:visible !important; text-overflow:clip !important; text-align:right; flex:none; }
${W} .sx-sw-flow > .k-row__num { grid-column:2; text-align:right; ${NUM} font-size:13px !important; color:${INK} !important; white-space:nowrap; }
${W} .sx-sw-flow > .k-row__num .k-38 { color:rgb(${BONE} / .55) !important; font-size:12px !important; }
${W} .sx-sw-flow:is(:hover, :focus-within) .k-row__name { color:${INK} !important; }
${W} .sx-sw-flow.is-selected .k-row__name { color:var(--dp-hand-hot, #ffd98c) !important; }
${W} .sx-sw-circuit__instruction { font-size:12.5px !important; color:rgb(${BONE} / .62) !important; }
${W} .sx-sw__side .k-t-fine, ${W} .sx-sw__side .k-sentence { color:rgb(${BONE} / .7) !important; }

/* the bomb rack: sockets on a scale, a dashed ring where nothing is loaded */
${W} .sx-sw-rack { ${PLAIN} margin-top:16px !important; padding-top:12px !important;
  border-top:1px solid rgb(${BONE} / .14) !important; }
${W} .sx-sw-rack__cells { display:flex !important; gap:0 22px !important; margin:6px 0 0 !important; }
${W} .sx-sw-rack__cell { ${PLAIN} display:flex !important; flex-direction:column; align-items:flex-start; gap:4px; padding:4px 0 !important;
  min-height:0 !important; height:auto !important; cursor:pointer; width:auto !important; }
${W} .sx-sw-rack__cell::before { content:"" !important; display:block !important; position:static !important; width:16px !important; height:16px !important;
  border-radius:50% !important; border:1.4px dashed rgb(${BONE} / .6) !important; background:none !important; box-shadow:none !important;
  transform:none !important; clip-path:none !important; margin:0 !important; }
${W} .sx-sw-rack__cell:not(.is-empty)::before { border:5px solid rgb(248 244 234) !important; }
${W} .sx-sw-rack__cell::after { display:none !important; }
${W} .sx-sw-rack__cell .k-row__num { ${LABEL} order:-1; font-size:12px !important; letter-spacing:.06em !important; color:rgb(${BONE} / .55) !important; text-align:left; }
${W} .sx-sw-rack__cell .k-row__name { display:flex !important; flex-direction:column; font-size:12px !important; color:rgb(${BONE} / .8) !important; }
${W} .sx-sw-rack__cell .k-row__sub { font-size:12px !important; color:rgb(${BONE} / .55) !important; }
${W} .sx-sw-rack__cell:is(:hover, :focus-visible) { outline:none !important; }
${W} .sx-sw-rack__cell:is(:hover, :focus-visible)::before { border-color:var(--dp-hand, #f2b950) !important; }
${W} .sx-sw-rack__cell:is(:hover, :focus-visible) .k-row__name { color:var(--dp-hand-hot, #ffd98c) !important; }
/* an empty socket is its ring; the header already counts them */
${W} .sx-sw-rack__cell.is-empty .k-row__name { display:none !important; }
${W} .sx-sw-rack__cell.is-empty { flex-direction:row !important; align-items:center !important; gap:8px; }
${W} .sx-sw__side :is([data-rack-restock], [data-rack-upgrade]) { ${PLAIN} ${LABEL} min-height:0 !important; height:auto !important; padding:4px 0 !important;
  font-size:12px !important; letter-spacing:.16em !important; color:${INK} !important; text-decoration:none !important;
  text-shadow:0 1px 5px rgb(${POOL} / .85), 0 0 12px rgb(${POOL} / .4) !important; }
${W} .sx-sw__side :is([data-rack-restock], [data-rack-upgrade])::after { display:none !important; }
${W} .sx-sw__side :is([data-rack-restock], [data-rack-upgrade])::before { all:unset !important; content:"›  " !important; color:rgb(${BONE} / .55) !important; }
${W} .sx-sw__side :is([data-rack-restock], [data-rack-upgrade]):is(:hover, :focus-visible):not(:disabled) { color:var(--dp-hand, #f2b950) !important; outline:none !important; }
${W} .sx-sw__side :is([data-rack-restock], [data-rack-upgrade]):disabled { color:rgb(${BONE} / .42) !important; cursor:default; }
${W} .sx-sw__side :is([data-rack-restock], [data-rack-upgrade]):disabled::before { color:rgb(${BONE} / .3) !important; }

/* ---- the hardpoints: words on leaders, a bead at the hull, the Hand at the chosen one ---------- */
${W} .sx-sw__slotfield:not(.is-board) .sx-hardpoint { ${PLAIN} padding:0 !important; border-radius:0 !important; }
${W} .sx-sw__slotfield:not(.is-board) .sx-hardpoint__copy { ${PLAIN} padding:0 !important; border-radius:0 !important; position:relative; }
/* the callouts read off the world, and the world can be a lit floor: each copy carries its own
   pool of dark, mask-dissolved — the screen's one surface language (ui-contrast discards
   text-shadow, so the backing is real, not a glow) */
${W} .sx-sw__slotfield:not(.is-board) .sx-hardpoint__copy::before { content:"" !important; display:block !important; position:absolute !important;
  z-index:-1 !important; inset:-7px -12px -9px -10px !important; pointer-events:none !important; border-radius:0 !important;
  background:radial-gradient(closest-side, rgb(${POOL} / .93), rgb(${POOL} / .78) 55%, rgb(${POOL} / 0)) !important;
  -webkit-mask-image:linear-gradient(180deg, transparent, #000 22%, #000 82%, transparent), linear-gradient(90deg, transparent, #000 18%, #000 88%, transparent);
  -webkit-mask-composite:source-in; mask-image:linear-gradient(180deg, transparent, #000 22%, #000 82%, transparent), linear-gradient(90deg, transparent, #000 18%, #000 88%, transparent);
  mask-composite:intersect; }
${W} .sx-sw__slotfield:not(.is-board) .sx-hardpoint__copy::after { display:none !important; }
${W} .sx-sw__slotfield:not(.is-board) .sx-hardpoint__copy b { font-family:var(--dp-face-label, "Archivo") !important; font-stretch:100%;
  font-variation-settings:"wdth" 100, "wght" 640 !important; font-weight:640 !important; font-size:13px !important; letter-spacing:.02em;
  color:${INK} !important; text-shadow:0 1px 6px rgb(${POOL} / .85), 0 0 12px rgb(${POOL} / .4) !important; }
${W} .sx-sw__slotfield:not(.is-board) .sx-hardpoint__copy em { ${LABEL} font-style:normal !important; font-size:12px !important;
  letter-spacing:.16em !important; color:rgb(${BONE} / .82) !important; text-shadow:0 1px 4px rgb(${POOL} / .95), 0 0 10px rgb(${POOL} / .6) !important; }
${W} .sx-sw__slotfield:not(.is-board) .sx-hardpoint.is-empty .sx-hardpoint__copy b { color:rgb(${BONE} / .8) !important; }
${W} .sx-sw__slotfield:not(.is-board) .sx-hardpoint__reticle { ${PLAIN} width:9px !important; height:9px !important; border-radius:50% !important;
  border:1.5px solid rgb(248 244 234) !important; background:rgb(${POOL} / .85) !important; box-shadow:0 0 0 2px rgb(${POOL} / .6) !important; }
${W} .sx-sw__slotfield:not(.is-board) .sx-hardpoint__leader path { stroke:rgb(${BONE} / .5) !important; stroke-width:1 !important; }
${W} .sx-sw__slotfield:not(.is-board) .sx-hardpoint:is(:hover, :focus-visible, .is-selected) .sx-hardpoint__copy b { color:var(--dp-hand-hot, #ffd98c) !important; }
${W} .sx-sw__slotfield:not(.is-board) .sx-hardpoint:is(:hover, :focus-visible, .is-selected) .sx-hardpoint__reticle {
  border-color:var(--dp-hand, #f2b950) !important; background:var(--dp-hand, #f2b950) !important; }
${W} .sx-sw__slotfield:not(.is-board) .sx-hardpoint:is(:hover, :focus-visible, .is-selected) .sx-hardpoint__leader path { stroke:var(--dp-hand, #f2b950) !important; }
${W} .sx-hardpoint:focus-visible { outline:none !important; }

/* the camera words and the drag cue: the quietest instrument on the stage */
${W} .sx-sw__camera { gap:0 14px !important; }
${W} .sx-sw__camera .k-word { ${PLAIN} ${LABEL} min-height:0 !important; padding:3px 2px !important; font-size:12px !important;
  letter-spacing:.06em !important; color:rgb(${BONE} / .55) !important; text-decoration:none !important; }
${W} .sx-sw__camera .k-word:is(:hover, :focus-visible) { color:rgb(248 244 234) !important; outline:none !important; }
${W} .sx-sw__dragcue { color:rgb(${BONE} / .5) !important; }

/* ---- the read-only chooser: a pool of its own, rows on the fleet's ruled ladder ---------------- */
${W} .sx-sw__chooser { ${PLAIN} position:relative; isolation:isolate; }
${W} .sx-sw__chooser::before { content:""; position:absolute; z-index:-1; inset:-6px; pointer-events:none; background:rgb(${POOL} / .82);
  -webkit-mask-image:linear-gradient(90deg, transparent, #000 12%, #000 92%, transparent), linear-gradient(180deg, transparent, #000 4%, #000 96%, transparent);
  -webkit-mask-composite:source-in; mask-image:linear-gradient(90deg, transparent, #000 12%, #000 92%, transparent), linear-gradient(180deg, transparent, #000 4%, #000 96%, transparent);
  mask-composite:intersect; }
${W} .sx-sw__chooser, ${W} .sx-chooser__panel { ${PLAIN} }
${W} .sx-chooser__head { margin:0 0 10px !important; padding:0 !important; }
${W} .sx-chooser__x { ${PLAIN} ${LABEL} min-height:0 !important; min-width:0 !important; height:auto !important; padding:3px 0 !important;
  font-size:12px !important; letter-spacing:.06em !important; color:rgb(${BONE} / .75) !important; }
${W} .sx-chooser__x::after { display:none !important; }
${W} .sx-chooser__x::before { all:unset !important; content:"‹  " !important; color:rgb(${BONE} / .55) !important; }
${W} .sx-chooser__x:is(:hover, :focus-visible) { color:rgb(248 244 234) !important; outline:none !important; }
${W} .sx-chooser__kicker { ${LABEL} font-size:12px !important; letter-spacing:.08em !important; line-height:1.5 !important;
  color:rgb(${BONE} / .66) !important; margin:10px 0 2px !important; white-space:normal !important; max-width:100%; text-wrap:balance; }
${W} .sx-chooser__head h3 { ${LABEL} font-size:12px !important; letter-spacing:.06em !important; color:${INK} !important; }
${W} .sx-chooser__head h3 .k-38 { display:block; color:rgb(${BONE} / .6) !important; }
${W} .sx-chooser__unfit { ${PLAIN} ${LABEL} font-size:12px !important; letter-spacing:.16em !important; color:rgb(248 244 234) !important;
  padding:3px 0 !important; min-height:0 !important; }
${W} .sx-chooser__list { ${PLAIN} background:linear-gradient(90deg, transparent 7px, rgb(${BONE} / .24) 7px, rgb(${BONE} / .24) 8px, transparent 8px) 0 0 / 100% 100% no-repeat,
  repeating-linear-gradient(180deg, rgb(${BONE} / .2) 0 1px, transparent 1px 8px) 4px 0 / 4px 100% no-repeat !important; padding:0 !important; }
${W} .sx-modrow { ${PLAIN} display:block !important; position:relative; padding:8px 0 10px 26px !important; min-height:0 !important;
  height:auto !important; cursor:pointer; }
${W} .sx-modrow::after { display:none !important; }
${W} .sx-modrow::before { content:"" !important; display:block !important; position:absolute !important; left:4px !important; top:16px !important;
  width:8px !important; height:1px !important; background:rgb(${BONE} / .38) !important; box-shadow:none !important; transform:none !important; clip-path:none !important; }
${W} .sx-modrow:is(:focus-within, :hover)::before { left:2px !important; top:15px !important; width:11px !important; height:2px !important; margin-top:0 !important;
  background:var(--dp-hand, #f2b950) !important; }
${W} .sx-modrow:focus-visible { outline:none !important; }
${W} .sx-modrow .sx-modrow__body { display:flex !important; flex-direction:column; gap:3px; width:auto !important; min-width:0 !important; }
${W} .sx-modrow .sx-modrow__name { font-size:13.5px !important; font-weight:600 !important; color:${INK} !important; }
${W} .sx-modrow .sx-modrow__name .sf-entity-link { text-decoration:none !important; background-image:none !important; color:inherit !important; }
${W} .sx-modrow :is(.k-good, .is-gain, .sx-modrow__chip.is-up) { color:var(--dp-ice, #8fcbff) !important; }
${W} .sx-modrow :is(.k-bad, .is-loss, .sx-modrow__chip.is-down) { color:rgb(${BONE} / .62) !important; }
${W} .sx-modrow .sx-modrow__role { font-size:12px !important; color:rgb(${BONE} / .62) !important; }
${W} .sx-modrow .sx-modrow__metrics { font-size:12px !important; color:rgb(${BONE} / .78) !important; }
${W} .sx-modrow .sx-modrow__meta { display:none !important; }
${W} .sx-modrow:focus-within .sx-modrow__meta { display:block !important; font-size:12px !important; color:rgb(${BONE} / .7) !important; }
${W} .sx-modrow .sx-modrow__act { display:none !important; margin-top:5px; width:auto !important; }
${W} .sx-modrow:is(:focus-within, :hover) .sx-modrow__act { display:block !important; }
${W} .sx-modrow .sx-modrow__buy { ${PLAIN} ${LABEL} display:inline-flex !important; align-items:baseline; gap:8px; min-height:0 !important;
  min-width:0 !important; height:auto !important; padding:2px 0 !important; font-size:12px !important; letter-spacing:.16em !important; color:rgb(248 244 234) !important;
  text-decoration:none !important; }
${W} .sx-modrow .sx-modrow__buy::after { display:none !important; }
${W} .sx-modrow .sx-modrow__buy::before { all:unset !important; content:"›" !important; color:rgb(${BONE} / .55) !important; }
${W} .sx-modrow .sx-modrow__buy small { color:rgb(${BONE} / .7) !important; letter-spacing:.1em; }
${W} .sx-modrow .sx-modrow__buy:is(:hover, :focus-visible):not(:disabled) { color:var(--dp-hand, #f2b950) !important; outline:none !important; }
${W} .sx-modrow .sx-modrow__buy:disabled { color:rgb(${BONE} / .45) !important; cursor:default; }
${W} .sx-modrow .sx-modrow__buy:disabled::before { color:rgb(${BONE} / .3) !important; }
${W} .sx-modrow .sx-modrow__lock { font-size:12px !important; color:rgb(${BONE} / .55) !important; }
${W} .sx-modrow.is-locked .sx-modrow__name { color:rgb(${BONE} / .6) !important; }
${W} .sx-modrow.is-eq .sx-modrow__name::after { content:"  fitted"; font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650;
  font-size:12px; letter-spacing:.2em; text-transform:uppercase; color:rgb(${BONE} / .7); }
/* the flight host's fit word is an unavailability note: a dotted word, never a lamp (!important:
   it must out-rank this sheet's own text-decoration:none base, which stands the shared SH3
   dotted-word treatment down on every verb this composition re-voices as a chevron word) */
${W} .sx-modrow .sx-modrow__buy[data-fit-inv], ${W} .sx-sw-verb[data-fit-inv] { text-decoration:underline dashed rgb(${BONE} / .4) !important; text-underline-offset:4px; }

/* the build record: a two-column ledger, not a run-on line */
${W} .sx-sw-record { margin-top:14px !important; ${PLAIN} }
${W} .sx-sw-record__grid { display:grid !important; grid-template-columns:minmax(0, 1fr) auto !important; column-gap:16px; row-gap:0; align-items:baseline; }
${W} .sx-sw-record__row { display:contents; }
${W} .sx-sw-record__row > span { font-size:12.5px !important; color:rgb(${BONE} / .66) !important; padding:3px 0 !important; }
${W} .sx-sw-record__row > b { ${NUM} font-weight:520 !important; font-size:13.5px !important; color:${INK} !important; text-align:right !important; padding:3px 0 !important; }

/* ---- motion: transitions are colour-level only, and Reduce reaches every state instantly -------- */
${W} .sx-sw__nameEdit { transition:border-color 140ms ease; }
html:not(.sf-reduce-motion) ${W} :is(.sx-sw-hero, .sx-sw-verb, .sx-sw-preset, .sx-sw-chip, .sx-sw-flow, .sx-sw-gauge,
  .sx-sw-row, .sx-sw-rack__cell, .sx-hardpoint, .sx-modrow, .sx-sw__camera .k-word, .sx-chooser__x) {
  transition:color 140ms ease, background-color 140ms ease, border-color 140ms ease; }
/* the press: a word dips one pixel — a physical acknowledgement on the spring's beat, never a
   second colour channel (amber already means chosen; pressed stays the hover's light) */
html:not(.sf-reduce-motion) ${W} :is(.sx-sw-hero, .sx-sw-verb, .sx-sw-preset, .sx-sw-chip,
  .sx-sw-row, .sx-sw-rack__cell, .sx-modrow, .sx-sw__camera .k-word, .sx-chooser__x):not(:disabled):active {
  transform:translateY(1px); }
html.sf-reduce-motion ${W} * { transition:none !important; animation:none !important; }

/* ---- the short stage (720-tall): the dial condenses, its engraved words stand down -------------- */
@media (max-height:800px) {
  ${W} .sx-sw-circuit__core, ${W} .sx-sw-circuit__core .orr-power { width:196px; height:122px; }
  ${W} .sx-sw-circuit__core { margin:4px -18px !important; }
  ${W} .sx-sw-circuit__core .k-hero__n { top:46px; font-size:28px !important; }
  ${W} .sx-sw-circuit__core .k-hero__w { top:84px; letter-spacing:.14em !important; }
  ${W} text.orr-power__syslabel { display:none; }
  ${W} .sx-sw-hero[data-band='handling'] .k-hero__n { font-size:clamp(36px, 5.2vh, 52px) !important; }
  ${W} .sx-sw__stats .k-row { padding:3px 0 !important; }
}
/* ≤1100×≤640 (960×540, including short landscape): the hull sits beneath the nameplate on this
   short stage. Keep the complete sentence clear of beads and leader lines instead of clipping it. */
@media (max-width:1100px) and (max-height:640px) {
  ${W} .sx-sw__nameplate .sx-sw__blurb { max-width:256px !important; font-size:13px !important; line-height:1.4 !important;
    max-height:none !important; overflow:visible !important; }
}
`;

let injected = false;

/** Idempotent: mounts the ship screen's ORRERY sheet once per document, after every station sheet. */
export function injectShipOrrery() {
  if (typeof document === 'undefined') return;
  if (injected && document.getElementById(STYLE_ID)) return;
  if (document.getElementById(STYLE_ID)) { injected = true; return; }
  const style = document.createElement('style');
  style.id = STYLE_ID;
  // The station set (stationStyles.js) inserts its last link after the deckplate sheet; this sheet
  // appends after everything so its overrides win the ties it is written for.
  document.head.appendChild(style);
  style.textContent = CSS;
  injected = true;
}
