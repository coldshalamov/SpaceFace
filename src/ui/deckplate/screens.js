// Deckplate screen skins — the menu surfaces assembled from the hardware layer (hardware.js).
// Each block re-skins one screen's EXISTING contract DOM (class names, roles, data-* and focus
// model untouched; tests and probes keep their seams). Materials by function, one key light, the
// LED pip as the one state mechanic, amber only on the verb the player acts on.
//
// Specificity note: these rules are injected at runtime, after styles/kit.css, and use the same
// `#screens .of-<screen>` prefix kit.css does, so they win by order without !important.

const HW = '/assets/ui/deckplate/hw/';
const KIT_TILE = '/assets/ui/kit/assets/tiles/';

const LED_OFF = 'radial-gradient(circle at 12px 50%, #3b352c 0, #17140f 3.5px, rgb(0 0 0 / .7) 4.5px, transparent 5px)';
const LED_ON = 'radial-gradient(circle at 12px 50%, #fff6df 0, var(--dp-lamp-hot) 1.5px, var(--dp-lamp) 3.5px, rgb(242 185 80 / .35) 5px, rgb(242 185 80 / .12) 9px, transparent 12px)';
const LED_RED = 'radial-gradient(circle at 12px 50%, #fff1ea 0, var(--dp-danger-hot) 1.5px, var(--dp-danger) 3.5px, rgb(255 80 56 / .35) 5px, rgb(255 80 56 / .12) 9px, transparent 12px)';

/* The verb list, as any kit words column inside a deckplate menu: grouped, iconed, LED-lit. */
const WORDS = `
#screens :is(.of-pause) .k-words__group {
  display:flex; align-items:center; gap:10px; list-style:none;
  margin:calc(12px * var(--k-s, 1)) 0 4px; padding:0 2px;
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 62; font-size:12px;
  letter-spacing:.24em; text-transform:uppercase; color:var(--dp-ink-mute); text-shadow:var(--dp-etch-shadow);
}
#screens :is(.of-pause) .k-words__group::after {
  content:""; flex:1; height:2px; background:linear-gradient(180deg, rgb(0 0 0 / .7) 0 1px, rgb(255 236 204 / .08) 1px 2px);
}
#screens :is(.of-pause) .k-word[data-icon]::before {
  content:""; flex:0 0 auto; width:20px; height:20px; margin-right:12px;
  background:currentColor; opacity:.8;
  -webkit-mask:var(--k-icon) center / contain no-repeat; mask:var(--k-icon) center / contain no-repeat;
}
#screens :is(.of-pause) .k-word[data-hint]::after {
  content:attr(data-hint); display:inline-grid; place-items:center; position:static; transform:none;
  margin-left:auto; min-width:22px; height:22px; padding:0 6px 2px; box-sizing:border-box; width:auto;
  border-style:solid; border-color:transparent; border-width:3px 4px 5px;
  border-image:url("${HW}keycap.svg") 10 10 12 / 3px 4px 5px / 0 stretch;
  background:var(--dp-metal-3); color:var(--dp-ink); opacity:1;
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 800, "wdth" 75; font-size:12px; letter-spacing:.04em;
}
`;

/* ── PAUSE — the held world on the right, the ship's console bulkhead on the left. ── */
const PAUSE = `
/* One console, two instruments: the verbs on one pane of glass and the flight brief on another,
   set side by side in one fastened bulkhead that is only as wide as its instruments. */
#screens .of-pause.k-screen {
  width:auto; max-width:min(900px, 96vw); box-sizing:border-box;
  grid-template-columns:minmax(300px, 360px) minmax(300px, 440px);
  grid-template-areas:'title title' 'stage brief' 'foot foot';
  grid-template-rows:auto minmax(0, 1fr) auto; column-gap:clamp(14px, 1.4vw, 22px);
  background:
    radial-gradient(90% 60% at 0% 0%, rgb(255 224 178 / .07), transparent 60%),
    var(--dp-tex-brushed) 0 0 / 512px repeat,
    var(--dp-tex-grain) 0 0 / 256px repeat,
    linear-gradient(180deg, #1b2028, #12161c 55%, #0d1015);
  border-image:url("${HW}bezel.svg") 30 / 30px / 0 stretch;
  border-width:0 14px 0 0; border-style:solid; border-color:transparent;
  box-shadow:18px 0 40px rgb(0 0 0 / .55);
  --ofp-row-h:clamp(30px, min(3vw, 3.4vh), 38px);
}
#screens .of-pause.k-screen::before { opacity:0; }
#screens .of-pause .k-title { display:contents; }
#screens .of-pause .k-title > h1 { grid-area:title; }
#screens .of-pause .k-t-title {
  font-family:var(--dp-face-display); font-variation-settings:"wght" 900, "wdth" 125;
  color:var(--dp-ink); letter-spacing:.05em;
  text-shadow:0 -1px 0 rgb(0 0 0 / .8), 0 1px 0 rgb(255 236 204 / .12);
}
/* The two panes of glass: the verbs and the brief, each seated in the bulkhead with a lit rim. */
#screens .of-pause .k-stage, #screens .of-pause .sf-pause-brief {
  border:0; border-image:none; border-radius:2px;
  background:var(--dp-glass-solid);
  box-shadow:var(--dp-glass-depth), 0 1px 0 rgb(255 255 255 / .05);
}
#screens .of-pause .k-stage { grid-area:stage; padding:10px 6px 10px 4px; }
#screens .of-pause .sf-pause-brief {
  grid-area:brief; align-self:start; margin:0; padding:14px 18px;
}
#screens .of-pause .sf-pause-brief .sf-slot-sub:first-child {
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 62; letter-spacing:.22em;
  color:var(--dp-ink-mute); text-shadow:var(--dp-etch-shadow);
}
#screens .of-pause .sf-pause-brief .sf-slot-name { color:var(--dp-ink); text-shadow:var(--dp-emit); }
#screens .of-pause .sf-pause-brief .sf-muted { color:var(--dp-ink-dim); }
#screens .of-pause .sf-pause-brief .sf-slot-sub:last-child {
  color:var(--dp-ink-mute); background:linear-gradient(180deg, rgb(0 0 0 / .6) 0 1px, rgb(255 236 204 / .07) 1px 2px) top / 100% 2px no-repeat;
}
/* Verbs: one selection language — the LED lit, the legend amber, an amber inner edge. */
#screens .of-pause .k-word {
  border:0; border-image:none; border-radius:2px;
  background:${LED_OFF};
  padding:0 10px 0 26px; min-height:var(--ofp-row-h);
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 88;
  font-size:var(--ofp-menu-size); letter-spacing:.1em; color:var(--dp-ink-dim);
  transition:color var(--dp-d-cut) var(--dp-ease-lamp), background var(--dp-d-cut) var(--dp-ease-lamp), box-shadow var(--dp-d-cut) var(--dp-ease-lamp);
}
#screens .of-pause .k-word:is(:hover, :focus-visible),
#screens .of-pause .k-words:not(:focus-within) .k-word[aria-current='true'] {
  color:var(--dp-lamp-hot); border-image-source:none; text-shadow:var(--dp-emit-lamp);
  background:${LED_ON}, linear-gradient(90deg, rgb(255 255 255 / .05), transparent 75%);
  box-shadow:inset 0 0 0 1px rgb(255 217 140 / .38), 0 10px 18px -14px var(--dp-lamp-bloom);
}
#screens .of-pause .k-word:focus-visible { outline:2px solid var(--dp-lamp); outline-offset:2px; }
/* Resume is the primary verb: the same treatment, a size up, lit from the start. */
#screens .of-pause .k-word--primary { font-variation-settings:"wght" 860, "wdth" 110; margin-bottom:6px; }
#screens .of-pause .k-word--primary[data-icon]::before { opacity:1; }
/* Exits: a red legend at rest, the lamp driven red on focus. */
#screens .of-pause .k-word--danger { color:color-mix(in srgb, var(--dp-danger-hot) 55%, var(--dp-ink-dim)); }
#screens .of-pause .k-word--danger:is(:hover, :focus-visible) {
  color:var(--dp-danger-hot); text-shadow:0 0 12px var(--dp-danger-bloom);
  background:${LED_RED}, linear-gradient(90deg, rgb(255 80 56 / .07), transparent 70%);
  box-shadow:inset 0 0 0 1px rgb(255 80 56 / .4), 0 10px 18px -14px var(--dp-danger-bloom);
}
#screens .of-pause .k-word.k-38 { color:var(--dp-ink-mute); }
#screens .of-pause .k-fine { color:var(--dp-ink-mute); font-family:var(--dp-face-etch); grid-area:foot; }
@media (max-width:1100px) {
  #screens .of-pause.k-screen { grid-template-columns:minmax(0, 1fr); grid-template-areas:'title' 'brief' 'stage' 'foot'; }
}
@media (max-height:760px) {
  #screens .of-pause.k-screen { --ofp-row-h:25px; --ofp-menu-size:14px; }
  #screens .of-pause .k-word { border-width:0; }
  #screens .of-pause .k-word--primary { margin-bottom:2px; }
  #screens .of-pause .k-words__group { margin:5px 0 1px; }
  #screens .of-pause .k-word[data-icon]::before { width:16px; height:16px; margin-right:10px; }
}
@media (prefers-reduced-motion:reduce) { #screens .of-pause .k-word { transition:none; } }
@media (forced-colors:active) {
  #screens .of-pause.k-screen { background:Canvas; border-image:none; border-right:1px solid CanvasText; }
  #screens .of-pause .k-stage, #screens .of-pause .sf-pause-brief { background:Canvas; border:1px solid CanvasText; box-shadow:none; }
  #screens .of-pause .k-word { background:none; box-shadow:none; }
  #screens .of-pause .k-word:is(:hover, :focus-visible) { outline:2px solid Highlight; }
  #screens :is(.of-pause) .k-word[data-icon]::before { forced-color-adjust:none; background:CanvasText; }
  #screens :is(.of-pause) .k-word[data-hint]::after { border-image:none; border:1px solid CanvasText; background:Canvas; color:CanvasText; }
}
`;

/* ── TITLE — POSTER register: the live stage, the produced logotype, a machined rail, big words. ── */
const TITLE = `
#screens .of-title.k-screen[data-screen]::before {
  background-image:linear-gradient(101deg, rgb(6 8 12 / .72) 0%, rgb(6 8 12 / .55) 16%, rgb(6 8 12 / .22) 36%, rgb(6 8 12 / 0) 56%);
}
/* The rail the words hang off is machined gunmetal, fastened, lit by the same key light. */
#screens .of-title .of-title-rail {
  border:5px solid transparent; box-sizing:border-box;
  border-image:url("${HW}bezel-thin.svg") 12 / 12px / 0 stretch;
  background:var(--dp-metal-layers), linear-gradient(90deg, #232833, #171b22);
  box-shadow:6px 0 18px rgb(0 0 0 / .45);
}
#screens .of-title .k-word {
  border-image-source:none; color:var(--dp-ink-dim);
  font-family:var(--dp-face-display); font-variation-settings:"wght" 820, "wdth" 125;
  text-shadow:0 2px 12px rgb(0 0 0 / .55);
  background:none;
  transition:color var(--dp-d-cut) var(--dp-ease-lamp), background var(--dp-d-cut) var(--dp-ease-lamp), box-shadow var(--dp-d-cut) var(--dp-ease-lamp);
}
/* The lit word: an edge light off the rail, the LED on the rail lit, the glass behind it lifted. */
#screens .of-title :is(.k-word:hover, .k-word:focus-visible),
#screens .of-title .k-words:not(:focus-within) .k-word[aria-current='true'] {
  border-image-source:none; color:var(--dp-ink);
  background:
    radial-gradient(circle at calc(var(--fht-rail-w) * .5) 50%, #fff6df 0, var(--dp-lamp-hot) 2px, var(--dp-lamp) 5px, rgb(242 185 80 / .35) 8px, rgb(242 185 80 / .1) 16px, transparent 22px),
    linear-gradient(90deg, rgb(255 238 210 / .10), rgb(255 238 210 / .03) 55%, transparent 85%);
  box-shadow:inset 0 1px 0 rgb(255 236 204 / .12), inset 0 -1px 0 rgb(255 217 140 / .3), 0 14px 22px -18px var(--dp-lamp-bloom);
}
#screens .of-title .k-words:not(:focus-within) .k-word[aria-current='true'] { color:var(--dp-lamp-hot); text-shadow:0 0 18px var(--dp-lamp-bloom-soft), 0 2px 12px rgb(0 0 0 / .55); }
#screens .of-title .k-word:focus-visible { outline:2px solid var(--dp-lamp); outline-offset:2px; }
#screens .of-title .k-word--danger { color:var(--dp-ink-dim); }
#screens .of-title .k-word--danger:is(:hover, :focus-visible) {
  color:var(--dp-danger-hot);
  background:radial-gradient(circle at calc(var(--fht-rail-w) * .5) 50%, #fff1ea 0, var(--dp-danger-hot) 2px, var(--dp-danger) 5px, rgb(255 80 56 / .3) 8px, transparent 20px),
    linear-gradient(90deg, rgb(255 80 56 / .09), transparent 70%);
  box-shadow:inset 0 -1px 0 rgb(255 80 56 / .35);
}
#screens .of-title .k-word[aria-disabled='true']:hover { background:none; box-shadow:none; }
/* The save readout under Continue, and the status strip: glass readouts with a lit LED. */
#screens .of-title .k-word-sub { color:var(--dp-ink-dim); font-family:var(--dp-face-read); }
#screens .of-title .of-title-line {
  border:0; border-image:none; border-radius:2px; min-height:28px; padding:0 14px 0 26px;
  background:
    radial-gradient(circle at 13px 50%, #fff6df 0, var(--dp-lamp-hot) 1.5px, var(--dp-lamp) 3.5px, rgb(242 185 80 / .3) 5px, transparent 9px),
    var(--dp-glass-solid);
  box-shadow:var(--dp-glass-depth), 0 8px 20px rgb(0 0 0 / .45);
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 62; letter-spacing:.2em; color:var(--dp-ink);
}
#screens .of-title .k-fine { color:var(--dp-ink-mute); font-family:var(--dp-face-etch); }
#screens .of-title .k-fine .k-word { color:var(--dp-ink-dim); background:none; box-shadow:none; }
#screens .of-title .k-fine .k-word:is(:hover, :focus-visible) { color:var(--dp-lamp-hot); background:none; box-shadow:none; }
@media (prefers-reduced-motion:reduce) { #screens .of-title .k-word { transition:none; } }
@media (forced-colors:active) {
  #screens .of-title .of-title-rail { border-image:none; background:Canvas; border:1px solid CanvasText; }
  #screens .of-title .k-word { background:none; box-shadow:none; }
  #screens .of-title .of-title-line { background:Canvas; border:1px solid CanvasText; }
}
`;

/* ── SETTINGS — BENCH register. styles/settings.css is linked at mount (after this sheet), so
   every rule here carries `html body` for the weight to win without !important. ── */
const S = 'html body #screens .of-settings';
const SETTINGS = `
${S}.k-screen::before { background:linear-gradient(90deg, rgb(6 8 12 / .82), rgb(6 8 12 / .55) 60%, rgb(6 8 12 / .35)); }
${S} .k-t-title {
  font-family:var(--dp-face-display); font-variation-settings:"wght" 900, "wdth" 125; color:var(--dp-ink); letter-spacing:.05em;
  text-shadow:0 -1px 0 rgb(0 0 0 / .8), 0 1px 0 rgb(255 236 204 / .12);
}
${S} .k-title > p { font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 62; color:var(--dp-ink-mute); letter-spacing:.22em; }
${S} .of-settings-rail {
  border:5px solid transparent; box-sizing:border-box; width:22px;
  border-image:url("${HW}bezel-thin.svg") 12 / 12px / 0 stretch;
  background:var(--dp-metal-layers), linear-gradient(90deg, #232833, #171b22);
}
/* Section tabs: navigation legends on the rail, LED pip lit on the open section. */
${S} .sf-tabbar .k-word {
  border-image:none; border:0; border-radius:2px; min-height:40px; padding:0 12px 0 34px;
  background:radial-gradient(circle at 20px 50%, #3b352c 0, #17140f 3.5px, rgb(0 0 0 / .7) 4.5px, transparent 5px);
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 760, "wdth" 78; letter-spacing:.16em;
  font-size:var(--dp-fs-data); color:var(--dp-ink-dim);
  transition:color var(--dp-d-cut) var(--dp-ease-lamp), background var(--dp-d-cut) var(--dp-ease-lamp), box-shadow var(--dp-d-cut) var(--dp-ease-lamp);
}
${S} .sf-tabbar .k-word:is(:hover, :focus-visible) {
  border-image:none; color:var(--dp-ink);
  background:radial-gradient(circle at 20px 50%, #8a6b3a 0, #3d2f19 3.5px, transparent 5px), linear-gradient(90deg, rgb(255 255 255 / .05), transparent 80%);
}
${S} .sf-tabbar .k-word:is([aria-selected='true'], [aria-current='true']) {
  border-image:none; color:var(--dp-lamp-hot); text-shadow:var(--dp-emit-lamp);
  background:${LED_ON.replace('12px 50%', '20px 50%')}, linear-gradient(90deg, rgb(255 238 210 / .08), transparent 80%);
  box-shadow:inset 3px 0 0 var(--dp-lamp), 0 10px 16px -12px var(--dp-lamp-bloom);
}
/* The panel is the instrument: a fastened bezel around a glass face. */
${S} .sf-settings-pane, ${S} #sf-settings-pane {
  border:14px solid transparent; border-image:url("${HW}bezel.svg") 30 / 30px / 0 stretch;
  background:var(--dp-glass-solid), var(--dp-metal-layers), var(--dp-metal-2);
  box-shadow:var(--dp-stand-off), var(--dp-glass-depth);
  padding:10px 22px;
}
${S} .sf-settings-pane .k-rows { max-width:1040px; }
${S} .sf-settings-pane .k-row {
  background-image:linear-gradient(180deg, rgb(0 0 0 / .6) 0 1px, rgb(255 236 204 / .06) 1px 2px); background-size:100% 2px;
  color:var(--dp-ink-dim); min-height:50px;
}
${S} .sf-settings-pane .k-rows > .k-row:first-child { background-image:none; }
${S} .sf-settings-pane .k-row .k-row__name, ${S} .sf-settings-pane .k-row label { color:var(--dp-ink); font-family:var(--dp-face-read); }
${S} .sf-settings-pane .k-row .k-row__sub, ${S} .sf-settings-pane .k-t-fine { color:var(--dp-ink-mute); }
${S} .sf-settings-pane .k-caps { font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 62; letter-spacing:.22em; color:var(--dp-ink-mute); }
/* Fader: the gripped cap with a lit index over a ticked, recessed track; the fill is the value. */
${S} input.k-range { height:32px; background:transparent; }
${S} input.k-range::-webkit-slider-runnable-track {
  height:12px; border:0; border-radius:2px;
  background:
    repeating-linear-gradient(90deg, rgb(255 236 204 / .2) 0 1px, transparent 1px 10%) 0 0 / 100% 3px no-repeat,
    linear-gradient(90deg, var(--dp-lamp-dim), var(--dp-lamp-hot) var(--sf-range-fill, 50%), transparent var(--sf-range-fill, 50%)) 0 6px / 100% 2px no-repeat,
    linear-gradient(180deg, rgb(0 0 0 / .7), rgb(0 0 0 / .32));
  box-shadow:inset 0 1px 2px rgb(0 0 0 / .85), 0 1px 0 rgb(255 236 204 / .07);
}
${S} input.k-range::-webkit-slider-thumb {
  -webkit-appearance:none; appearance:none; width:18px; height:30px; margin-top:-9px; border-radius:2px; border:1px solid #05070a;
  background:
    linear-gradient(90deg, transparent 7px, var(--dp-lamp-hot) 7px 9px, transparent 9px) 0 0 / 100% 100% no-repeat,
    repeating-linear-gradient(180deg, rgb(255 236 204 / .16) 0 1px, rgb(0 0 0 / .5) 1px 3px) 0 7px / 100% 16px no-repeat,
    linear-gradient(180deg, #666f7f, #353c48 55%, #1c2027);
  box-shadow:inset 0 1px 0 rgb(255 236 204 / .38), 0 3px 6px rgb(0 0 0 / .65), 0 0 8px var(--dp-lamp-bloom-soft);
}
/* Select: a glass readout in a thin bezel with an etched chevron. */
${S} select.k-select {
  -webkit-appearance:none; appearance:none; min-height:36px; padding:0 34px 0 12px; border-radius:0;
  border:5px solid transparent; border-image:url("${HW}bezel-thin.svg") 12 / 12px / 0 stretch;
  background:
    linear-gradient(135deg, transparent 45%, var(--dp-ink-dim) 45% 55%, transparent 55%) calc(100% - 17px) 50% / 7px 7px no-repeat,
    linear-gradient(45deg, transparent 45%, var(--dp-ink-dim) 45% 55%, transparent 55%) calc(100% - 12px) 50% / 7px 7px no-repeat,
    var(--dp-glass-solid), var(--dp-metal-layers), var(--dp-metal-2);
  color:var(--dp-ink); font-family:var(--dp-face-read); font-size:var(--dp-fs-data);
}
${S} select.k-select option { background:#12161c; color:var(--dp-ink); }
/* On/off: a flush rocker; the pressed half is ringed and its LED lit. */
${S} .of-settings-switch {
  width:auto; height:auto; min-width:0; background-image:none;
  border:1px solid rgb(0 0 0 / .85); border-image:none; border-radius:3px; padding:3px; gap:2px;
  background:linear-gradient(180deg, rgb(0 0 0 / .6), rgb(0 0 0 / .25)); box-shadow:inset 0 1px 3px rgb(0 0 0 / .85), 0 1px 0 rgb(255 236 204 / .07);
}
${S} .of-settings-switch:is(.is-on, :hover) { background:linear-gradient(180deg, rgb(0 0 0 / .6), rgb(0 0 0 / .25)); }
${S} .of-settings-switch .k-word {
  border-image:none; border:0; border-radius:2px; min-width:54px; min-height:28px; padding:0 10px 0 22px;
  background:radial-gradient(circle at 11px 50%, #3b352c 0, #17140f 3px, transparent 4px), linear-gradient(180deg, #20252d, #181c22);
  box-shadow:inset 0 1px 0 rgb(255 236 204 / .07);
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 760, "wdth" 70; letter-spacing:.16em; font-size:12px; color:var(--dp-ink-mute);
}
${S} .of-settings-switch .k-word[aria-pressed='true'] {
  color:var(--dp-ink);
  background:radial-gradient(circle at 11px 50%, #fbf5e8 0, #bdb6a5 2px, #6b675d 3.5px, transparent 4.5px), linear-gradient(180deg, #2a303a, #20252d);
  box-shadow:inset 0 0 0 1px rgb(232 226 212 / .22), inset 0 1px 0 rgb(255 236 204 / .14);
}
${S} .of-settings-switch.is-on .k-word[data-action='on'][aria-pressed='true'] {
  background:radial-gradient(circle at 11px 50%, #fff6df 0, var(--dp-lamp-hot) 1.5px, var(--dp-lamp) 3px, rgb(242 185 80 / .35) 4.5px, transparent 7px), linear-gradient(180deg, #2a303a, #20252d);
  box-shadow:inset 0 0 0 1px rgb(255 217 140 / .28), inset 0 1px 0 rgb(255 236 204 / .14);
}
/* Choice rows (presets, schemes): small command keys; the chosen one's LED is lit. */
${S} .sf-settings-pane .k-words--row:not(.of-settings-switch) .k-word {
  border-style:solid; border-color:transparent; border-width:6px 7px 8px; border-radius:0;
  border-image:url("${HW}keycap.svg") 10 10 12 / 6px 7px 8px / 0 stretch;
  background:radial-gradient(circle at 8px 50%, #3b352c 0, #17140f 2.5px, transparent 3.5px), var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-metal-3);
  padding:0 10px 0 18px; min-height:32px;
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 750, "wdth" 75; letter-spacing:.12em; font-size:12px; color:var(--dp-ink-dim);
}
${S} .sf-settings-pane .k-words--row:not(.of-settings-switch) .k-word[aria-pressed='true'] {
  color:var(--dp-ink); border-image-source:url("${HW}keycap-pressed.svg");
  background:radial-gradient(circle at 8px 50%, #fff6df 0, var(--dp-lamp-hot) 1.2px, var(--dp-lamp) 2.5px, rgb(242 185 80 / .35) 4px, transparent 6px), var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-metal-3);
}
/* Rebinding: every binding is a keycap. */
${S} .sf-bind-btn {
  border-style:solid; border-color:transparent; border-width:5px 6px 7px; border-radius:0;
  border-image:url("${HW}keycap.svg") 10 10 12 / 5px 6px 7px / 0 stretch;
  background:var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-metal-3);
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 800, "wdth" 75; color:var(--dp-ink);
}
/* Back is navigation, not the screen's command: a plain key. */
${S} .k-foot .fh-key--primary {
  border-style:solid; border-color:transparent; border-width:10px 10px 12px; border-radius:0;
  border-image:url("${HW}keycap.svg") 10 10 12 / 10px 10px 12px / 0 stretch;
  background:var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-metal-3);
  min-height:44px; padding:0 14px; color:var(--dp-ink); text-shadow:0 -1px 0 rgb(0 0 0 / .7);
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 760, "wdth" 78; letter-spacing:.14em;
}
${S} .k-foot .fh-key--primary:is(:hover, :focus-visible) { filter:brightness(1.12); color:var(--dp-lamp-hot); }
@media (forced-colors:active) {
  ${S} .sf-settings-pane, ${S} select.k-select, ${S} .of-settings-rail, ${S} .sf-bind-btn,
  ${S} .sf-settings-pane .k-words--row:not(.of-settings-switch) .k-word, ${S} .k-foot .fh-key--primary {
    border-image:none; border:1px solid CanvasText; background:Canvas; color:CanvasText; box-shadow:none;
  }
  ${S} .sf-tabbar .k-word:is([aria-selected='true'], [aria-current='true']),
  ${S} .of-settings-switch .k-word[aria-pressed='true'] { background:Highlight; color:HighlightText; }
}
`;

export const DECKPLATE_SCREENS_CSS = WORDS + PAUSE + TITLE + SETTINGS;
