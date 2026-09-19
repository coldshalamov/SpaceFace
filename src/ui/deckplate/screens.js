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
// The same lens set in a key's top-left corner (keys in a row carry their LED there).
const LED_OFF_TL = LED_OFF.replace('12px 50%', '9px 9px');
const LED_ON_TL = LED_ON.replace('12px 50%', '9px 9px');
const LED_RED_TL = LED_RED.replace('12px 50%', '9px 9px');
// Keys carry their lamp in the cap, left of the legend; tabs carry it on the rail side.
// The same lens set in a keycap's own border (origin border-box), clear of any pinned padding.
const KEY_LED_OFF_BB = LED_OFF.replace('12px 50%', '11px 50%') + ' border-box';
const KEY_LED_ON_BB = LED_ON.replace('12px 50%', '11px 50%') + ' border-box';
const KEY_LED_RED_BB = LED_RED.replace('12px 50%', '11px 50%') + ' border-box';

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
/* A verb whose label ends in its key ("Mission Log (J)") draws the key as a keycap; the
   parentheses stay in the DOM for the accessible name, visually hidden. */
#screens .k-word .k-kbd {
  display:inline-grid; place-items:center; min-width:22px; height:22px; margin-left:10px; padding:0 6px 2px; box-sizing:border-box;
  border-style:solid; border-color:transparent; border-width:3px 4px 5px;
  border-image:url("${HW}keycap.svg") 10 10 12 / 3px 4px 5px / 0 stretch;
  background:var(--dp-metal-3); color:var(--dp-ink); text-shadow:none;
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 800, "wdth" 75; font-size:12px; line-height:1; letter-spacing:.04em;
}
#screens .k-word .k-kbd__paren { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
@media (forced-colors:active) { #screens .k-word .k-kbd { border-image:none; border:1px solid CanvasText; background:Canvas; color:CanvasText; } }
#screens :is(.of-pause) .k-word[data-hint]::after {
  content:attr(data-hint); display:inline-grid; place-items:center; position:static; transform:none;
  margin-left:auto; min-width:22px; height:22px; padding:0 6px 2px; box-sizing:border-box; width:auto;
  border-style:solid; border-color:transparent; border-width:3px 4px 5px;
  border-image:url("${HW}keycap.svg") 10 10 12 / 3px 4px 5px / 0 stretch;
  background:var(--dp-metal-3); color:var(--dp-ink); opacity:1;
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 800, "wdth" 75; font-size:12px; letter-spacing:.04em;
}
`;

const PAUSE = `
/* ── PAUSE — one narrow console against the left edge, over the held world, dimmed. ──
   Critic round 7: the two-pane bulkhead was 47% of a 1920 frame with ~440x650 px dead; now the
   console is only as wide as its words, the brief sits on top of the verbs, and the less-used
   verbs (reference, media, exits) are rows of keys instead of full-width rows. */
#screens .of-pause.k-screen {
  width:clamp(340px, 23vw, 440px); max-width:96vw; box-sizing:border-box;
  grid-template-columns:minmax(0, 1fr);
  grid-template-areas:'title' 'brief' 'stage' 'foot';
  grid-template-rows:auto auto minmax(0, 1fr) auto; row-gap:clamp(10px, 1.5vh, 18px);
  padding:clamp(22px, 4.2vh, 46px) clamp(16px, 1.3vw, 24px) clamp(16px, 2.6vh, 30px);
  background:var(--dp-metal-layers), linear-gradient(180deg, #1c2129, #12161c 55%, #0c0f13);
  border-image:url("${HW}bezel.svg") 30 / 30px / 0 stretch;
  border-width:0 14px 0 0; border-style:solid; border-color:transparent;
  /* the held world dims behind the console: one spread shadow, no extra element */
  box-shadow:18px 0 40px rgb(0 0 0 / .55), 0 0 0 100vmax rgb(3 5 8 / .42);
  --ofp-row-h:clamp(28px, min(2.4vw, 3.3vh), 36px);
  --ofp-menu-size:clamp(13px, min(.85vw, 1.5vh), 16px);
}
#screens .of-pause.k-screen::before { opacity:0; }
#screens .of-pause .k-title { display:contents; }
#screens .of-pause .k-title > h1 { grid-area:title; margin:0; }
#screens .of-pause .k-t-title {
  font-family:var(--dp-face-display); font-variation-settings:"wght" 900, "wdth" 125;
  font-size:clamp(28px, min(2.3vw, 4.2vh), 44px); line-height:1; color:var(--dp-ink); letter-spacing:.05em;
  text-shadow:0 -1px 0 rgb(0 0 0 / .8), 0 1px 0 rgb(255 236 204 / .12);
}
/* The brief and the verbs: two panes of glass seated in the console. */
#screens .of-pause .k-stage, #screens .of-pause .sf-pause-brief {
  border:0; border-image:none; border-radius:2px;
  background:var(--dp-glass-solid);
  box-shadow:var(--dp-glass-depth);
}
#screens .of-pause .sf-pause-brief { grid-area:brief; align-self:start; margin:0; padding:12px 14px; }
#screens .of-pause .k-stage { grid-area:stage; padding:8px 6px; min-height:0; overflow:hidden auto; scrollbar-width:thin; }
#screens .of-pause .sf-pause-brief .sf-slot-sub:first-child {
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 62; font-size:12px; letter-spacing:.22em;
  color:var(--dp-ink-mute); text-shadow:var(--dp-etch-shadow);
}
#screens .of-pause .sf-pause-brief .sf-slot-name { color:var(--dp-ink); text-shadow:var(--dp-emit); font-size:15px; line-height:1.3; }
#screens .of-pause .sf-pause-brief .sf-muted { color:var(--dp-ink-dim); font-size:13px; }
#screens .of-pause .sf-pause-brief .sf-slot-sub:last-child {
  color:var(--dp-ink-mute); font-size:12px; margin-top:8px; padding-top:8px;
  background:linear-gradient(180deg, rgb(0 0 0 / .6) 0 1px, rgb(255 236 204 / .07) 1px 2px) top / 100% 2px no-repeat;
}
/* Verbs: one selection language — the LED lit, the legend amber, an amber inner edge. */
#screens .of-pause .k-words { display:flex; flex-direction:row; flex-wrap:wrap; align-content:flex-start; gap:0 6px; }
#screens .of-pause .k-words > li { flex:1 1 100%; min-width:0; }
#screens .of-pause .k-word {
  border:0; border-image:none; border-radius:2px; width:100%;
  background:${LED_OFF};
  padding:0 10px 0 26px; min-height:var(--ofp-row-h);
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 740, "wdth" 80;
  font-size:var(--ofp-menu-size); letter-spacing:.12em; color:var(--dp-ink-dim);
  transform:translateZ(0);
  transition:color var(--dp-d-cut) var(--dp-ease-lamp), background var(--dp-d-cut) var(--dp-ease-lamp), box-shadow var(--dp-d-cut) var(--dp-ease-lamp);
}
#screens .of-pause .k-word:is(:hover, :focus-visible),
#screens .of-pause .k-words:not(:focus-within) .k-word[aria-current='true'] {
  color:var(--dp-lamp-hot); border-image-source:none; text-shadow:var(--dp-emit-lamp);
  background:${LED_ON}, linear-gradient(90deg, rgb(255 238 210 / .06), transparent 75%);
  box-shadow:inset 3px 0 0 var(--dp-lamp), inset 0 0 0 1px rgb(255 217 140 / .22), 0 10px 18px -14px var(--dp-lamp-bloom);
}
/* ui.css forces a ring on every :focus-visible with !important; the lit row is this list's ring */
#screens .of-pause .k-word:focus-visible { outline:0 solid transparent !important; }
/* Resume is the primary verb: the same treatment, one weight heavier, lit from the start. */
#screens .of-pause .k-word--primary { font-variation-settings:"wght" 860, "wdth" 84; margin-bottom:4px; }
#screens .of-pause .k-word--primary[data-icon]::before { opacity:1; }
#screens .of-pause .k-word.k-38 { color:var(--dp-ink-mute); }
/* Reference, media and the exits: keys in a row — icon over an etched legend, LED in the corner. */
#screens .of-pause .k-words > li:is([data-group="Reference"], [data-group="Media"], [data-group="Exit"]) { flex:1 1 0; margin-top:2px; }
#screens .of-pause .k-words > li:is([data-group="Reference"], [data-group="Media"], [data-group="Exit"]) .k-word {
  flex-direction:column; justify-content:center; gap:5px; min-height:52px; padding:7px 4px 6px;
  font-size:12px; letter-spacing:.08em; font-variation-settings:"wght" 720, "wdth" 72; text-align:center; white-space:normal; line-height:1.1;
  background:${LED_OFF_TL}, linear-gradient(180deg, rgb(255 255 255 / .035), rgb(0 0 0 / .22));
  box-shadow:inset 0 1px 0 rgb(255 244 222 / .07), inset 0 0 0 1px rgb(0 0 0 / .55);
}
#screens .of-pause .k-words > li:is([data-group="Reference"], [data-group="Media"], [data-group="Exit"]) .k-word[data-icon]::before { margin:0; width:18px; height:18px; }
#screens .of-pause .k-words > li:is([data-group="Reference"], [data-group="Media"], [data-group="Exit"]) .k-word:is(:hover, :focus-visible) {
  background:${LED_ON_TL}, linear-gradient(180deg, rgb(255 238 210 / .07), rgb(0 0 0 / .18));
  box-shadow:inset 0 0 0 1px rgb(255 217 140 / .42), inset 0 -3px 0 var(--dp-lamp), 0 10px 18px -14px var(--dp-lamp-bloom);
}
/* The exits discard the run: bone at rest (they are not threats), the lamp driven red on focus. */
#screens .of-pause .k-word--danger { color:var(--dp-ink-dim); }
#screens .of-pause .k-words > li[data-group="Exit"] .k-word--danger:is(:hover, :focus-visible) {
  color:var(--dp-danger-hot); text-shadow:0 0 12px var(--dp-danger-bloom);
  background:${LED_RED_TL}, linear-gradient(180deg, rgb(255 80 56 / .08), rgb(0 0 0 / .18));
  box-shadow:inset 0 0 0 1px rgb(255 80 56 / .45), inset 0 -3px 0 var(--dp-danger), 0 10px 18px -14px var(--dp-danger-bloom);
}
#screens .of-pause .k-fine { color:var(--dp-ink-mute); font-family:var(--dp-face-etch); grid-area:foot; position:static; font-size:12px; }
@media (max-height:760px) {
  #screens .of-pause.k-screen { --ofp-row-h:25px; --ofp-menu-size:13px; row-gap:8px; }
  #screens .of-pause .k-word--primary { margin-bottom:2px; }
  #screens .of-pause .k-words__group { margin:5px 0 1px; }
  #screens .of-pause .k-word[data-icon]::before { width:16px; height:16px; margin-right:10px; }
  /* short frames: the keys drop their glyphs and sit one line high, so the exits stay in view */
  #screens .of-pause .k-words > li:is([data-group="Reference"], [data-group="Media"], [data-group="Exit"]) .k-word { min-height:30px; padding:4px 4px 3px; gap:0; }
  #screens .of-pause .k-words > li:is([data-group="Reference"], [data-group="Media"], [data-group="Exit"]) .k-word[data-icon]::before { display:none; }
  #screens .of-pause .sf-pause-brief .sf-slot-sub:first-child { display:none; }
  #screens .of-pause .sf-pause-brief { padding:9px 12px; }
  #screens .of-pause .sf-pause-brief .sf-slot-sub:last-child { display:none; }
}
@media (prefers-reduced-motion:reduce) { #screens .of-pause .k-word { transition:none; } }
@media (forced-colors:active) {
  #screens .of-pause.k-screen { background:Canvas; border-image:none; border-right:1px solid CanvasText; box-shadow:none; }
  #screens .of-pause .k-stage, #screens .of-pause .sf-pause-brief { background:Canvas; border:1px solid CanvasText; box-shadow:none; }
  #screens .of-pause .k-word { background:none; box-shadow:none; }
  #screens .of-pause .k-word:is(:hover, :focus-visible) { outline:2px solid Highlight !important; }
  #screens :is(.of-pause) .k-word[data-icon]::before { forced-color-adjust:none; background:CanvasText; }
  #screens :is(.of-pause) .k-word[data-hint]::after { border-image:none; border:1px solid CanvasText; background:Canvas; color:CanvasText; }
}
`;

/* The one selection light (critic, shell round 2): a 2px amber edge on the chosen thing's inner
   left and a faint warm lift behind its legend. Drawn as background layers on the border box, so a
   transparent kit border never pushes the edge inward. */
const EDGE_LIT = 'linear-gradient(var(--dp-lamp), var(--dp-lamp)) 0 0 / 2px 100% no-repeat border-box';
const LIFT_LIT = 'linear-gradient(90deg, rgb(255 238 210 / .09), transparent 75%) border-box';
const FH_BRIDGE = `
/* ══ FH → DECKPLATE BRIDGE (FRONTEND_PROGRAM Wave 2, 2026-09-19) ════════════════════════════════
   The shell screens (new game, load/save, help, credits, codex, research, achievements) are built
   from the Field Hardware vocabulary: .fh-plate, .fh-key, .fh-row, .fh-input, .fh-tile, .fh-light.
   This maps that vocabulary onto the deckplate materials once. GEOMETRY IS THE KIT'S: every border
   width stays exactly the fh value, so no content box on any screen moves; only what is painted in
   those borders changes — brown bench plates become smoked glass in a thin machined bezel, sprite
   keys become keycaps with a lamp, tabs become lit legends, rows take the one selection language.
   The fh colour tokens resolve to the deckplate ones. The station is excluded: it keeps its own
   scoped skin (styles/station-orbital.css), re-pointed at the same palette. */
html body #screens {
  --fh-legend:var(--dp-lamp); --fh-legend-now:var(--dp-lamp-hot);
  /* amber is for what is lit or acted on: a resting legend is bone, a header legend a step brighter */
  --fh-legend-rest:var(--dp-ink-mute); --fh-legend-lit:var(--dp-ink-dim);
  /* good news reads in bone with its sign or arrow; the deckplate carries no green */
  --k-good:#d8d2c4;
  --fh-text:var(--dp-ink); --fh-text-resting:var(--dp-ink-dim); --fh-text-tertiary:var(--dp-ink-mute);
  --dp-glass-bb:var(--dp-glass-spec) border-box, var(--dp-glass-fall) border-box,
    var(--dp-tex-smudge) 0 0 / 512px repeat border-box, linear-gradient(180deg, #151a21, #090c10) border-box;
}
/* panels: a thin machined bezel ring on the plate's outer edge, smoked glass under it */
html body #screens > :not(.sx-observatory) :is(.fh-plate, .fh-window) {
  border-style:solid; border-color:transparent;
  border-image:url("${HW}bezel-thin.svg") 12 / 12px / 0 stretch;
  background:var(--dp-glass-bb);
  box-shadow:0 12px 30px rgb(0 0 0 / .45);
  color:var(--dp-ink);
}
html body #screens > :not(.sx-observatory) .fh-plate { border-width:24px; }
html body #screens > :not(.sx-observatory) .fh-window { border-width:20px; }
/* a sunk plate is the same pane: glass to its outer edge in the thin bezel, so its visible edge
   sits on the grid line the title sits on (an air border had pushed the glass 24px inward) */
html body #screens > :not(.sx-observatory) .fh-plate.fh-plate--sunk {
  border-image:url("${HW}bezel-thin.svg") 12 / 12px / 0 stretch; background:var(--dp-glass-bb); box-shadow:0 12px 30px rgb(0 0 0 / .45);
}
/* the paper plate was a tan card: glass like every other panel, its ink bone */
html body #screens > :not(.sx-observatory) .fh-plate.fh-plate--paper { color:var(--dp-ink); }
html body #screens > :not(.sx-observatory) .fh-plate.fh-plate--edge {
  border-width:16px; border-image:url("${HW}bezel-thin.svg") 12 / 10px / 0 stretch;
  background:var(--dp-metal-layers), var(--dp-metal-2);
}
html body #screens > :not(.sx-observatory) .fh-rail {
  border-width:16px; border-style:solid; border-color:transparent; border-image:url("${HW}bezel-thin.svg") 12 / 8px / 0 stretch;
  background:var(--dp-metal-layers), linear-gradient(90deg, #232833, #171b22);
}
/* keys: keycap hardware on the key's edge, brushed metal cap, the lamp set in the cap's border */
html body #screens > :not(.sx-observatory) .fh-key {
  border-style:solid; border-color:transparent; border-width:18px;
  border-image:url("${HW}keycap.svg") 10 10 12 / 8px 10px 10px / 0 stretch;
  background:${KEY_LED_OFF_BB}, var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-metal-3);
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 760, "wdth" 78; letter-spacing:.14em;
  color:var(--dp-ink); text-shadow:0 -1px 0 rgb(0 0 0 / .7);
  transition:color var(--dp-d-cut) var(--dp-ease-lamp), box-shadow var(--dp-d-cut) var(--dp-ease-lamp);
}
html body #screens > :not(.sx-observatory) .fh-key:is(:hover, :focus-visible) {
  border-image-source:url("${HW}keycap.svg"); color:var(--dp-lamp-hot); text-shadow:var(--dp-emit-lamp);
  background:${KEY_LED_ON_BB}, var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-metal-3);
  box-shadow:inset 0 0 0 1px rgb(255 217 140 / .35), 0 8px 16px -10px var(--dp-lamp-bloom);
}
html body #screens > :not(.sx-observatory) .fh-key:active { border-image-source:url("${HW}keycap-pressed.svg"); }
html body #screens > :not(.sx-observatory) :is(.fh-key:disabled, .fh-key[aria-disabled='true']) {
  border-image-source:url("${HW}keycap.svg"); color:var(--dp-ink-mute); text-shadow:none; box-shadow:none; filter:saturate(.6) brightness(.85);
  background:${KEY_LED_OFF_BB}, var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-metal-3);
}
/* the screen's one primary command wears the selection language permanently */
html body #screens > :not(.sx-observatory) .fh-key.fh-key--primary {
  border-image-source:url("${HW}keycap.svg"); color:var(--dp-lamp-hot); text-shadow:var(--dp-emit-lamp);
  background:${KEY_LED_ON_BB}, var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-metal-3);
  box-shadow:inset 0 0 0 1px rgb(255 217 140 / .5), inset 0 -8px 16px -10px var(--dp-lamp-bloom), 0 0 18px rgb(242 185 80 / .16);
}
html body #screens > :not(.sx-observatory) .fh-key.fh-key--primary:is(:hover, :focus-visible) { filter:brightness(1.1); }
/* a destructive key: bone at rest, the lamp driven red under the hand */
html body #screens > :not(.sx-observatory) .fh-key.fh-key--hazard { border-image-source:url("${HW}keycap.svg"); }
html body #screens > :not(.sx-observatory) .fh-key.fh-key--hazard:is(:hover, :focus-visible) {
  color:var(--dp-danger-hot); text-shadow:0 0 12px var(--dp-danger-bloom);
  background:${KEY_LED_RED_BB}, var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-metal-3);
  box-shadow:inset 0 0 0 1px rgb(255 80 56 / .45), 0 8px 16px -10px var(--dp-danger-bloom);
}
html body #screens > :not(.sx-observatory) .fh-key.fh-key--small { border-width:12px; border-image:url("${HW}keycap.svg") 10 10 12 / 6px 7px 8px / 0 stretch; }
/* a key-binding cap is a legend, not a command: metal, no lamp */
html body #screens > :not(.sx-observatory) .fh-key.fh-key--small, html body #screens > :not(.sx-observatory) .fh-key.fh-key--small:is(:hover, :focus-visible) {
  background:var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-metal-3); color:var(--dp-ink); text-shadow:0 -1px 0 rgb(0 0 0 / .7); box-shadow:none;
}
/* tabs: navigation legends, not commands — the lamp in the legend's own border, the open one lit */
html body #screens > :not(.sx-observatory) .fh-key.fh-key--legend {
  position:relative; border-width:14px; border-image:none; border-color:transparent; border-radius:2px;
  background:none; font-variation-settings:"wght" 760, "wdth" 78; letter-spacing:.16em; color:var(--dp-ink-dim); text-shadow:none; box-shadow:none;
}
html body #screens > :not(.sx-observatory) .fh-key.fh-key--legend::before {
  content:""; position:absolute; left:-10px; top:50%; width:8px; height:8px; margin-top:-4px; border-radius:50%;
  background:radial-gradient(circle at 42% 36%, #3b352c, #17140f 70%); box-shadow:inset 0 1px 1.5px rgb(0 0 0 / .85), 0 0 0 1px rgb(0 0 0 / .6);
}
html body #screens > :not(.sx-observatory) .fh-key.fh-key--legend:is(:hover, :focus-visible) {
  border-image:none; color:var(--dp-ink); background:linear-gradient(90deg, rgb(255 255 255 / .05), transparent 80%); box-shadow:none;
}
html body #screens > :not(.sx-observatory) .fh-key.fh-key--legend:is([aria-selected='true'], [aria-current='true'], [aria-pressed='true'], .is-lit) {
  border-image:none; color:var(--dp-lamp-hot); text-shadow:var(--dp-emit-lamp);
  background:${EDGE_LIT}, ${LIFT_LIT};
  box-shadow:none;
}
html body #screens > :not(.sx-observatory) .fh-key.fh-key--legend:is([aria-selected='true'], [aria-current='true'], [aria-pressed='true'], .is-lit)::before {
  background:radial-gradient(circle at 42% 34%, #fff6df 0%, var(--dp-lamp-hot) 22%, var(--dp-lamp) 55%, var(--dp-lamp-dim) 100%);
  box-shadow:0 0 6px var(--dp-lamp-bloom), 0 0 14px var(--dp-lamp-bloom-soft);
}
/* choice rows (a words row that borrows the pause list: starter, difficulty): a recessed selector
   track, each choice a segment, the chosen segment itself lit (no lamp outside it) */
html body #screens > :not(.sx-observatory) .k-words--row .fh-key.fh-key--legend::before { display:none; }
html body #screens > :not(.sx-observatory) .k-words.k-words--row.of-pause {
  display:inline-flex; flex-wrap:wrap; gap:3px; width:max-content; max-width:100%; padding:3px; border-radius:3px;
  background:linear-gradient(180deg, rgb(0 0 0 / .5), rgb(0 0 0 / .28)); box-shadow:inset 0 1px 3px rgb(0 0 0 / .85), 0 1px 0 rgb(255 236 204 / .07);
}
html body #screens > :not(.sx-observatory) .k-words.k-words--row.of-pause .fh-key.fh-key--legend {
  background:linear-gradient(180deg, #232830, #191d24) padding-box; box-shadow:inset 0 1px 0 rgb(255 236 204 / .07);
}
html body #screens > :not(.sx-observatory) .k-words.k-words--row.of-pause .fh-key.fh-key--legend:is([aria-selected='true'], [aria-current='true'], [aria-pressed='true'], .is-lit) {
  background:linear-gradient(var(--dp-lamp), var(--dp-lamp)) 0 0 / 2px 100% no-repeat padding-box, linear-gradient(180deg, #2c3139, #20252d) padding-box;
  box-shadow:inset 0 0 0 1px rgb(255 217 140 / .3), 0 8px 14px -10px var(--dp-lamp-bloom);
}
/* rows: etched hairlines; the selected row lights like every deckplate row (and keeps its box) */
html body #screens > :not(.sx-observatory) .fh-row {
  background-image:linear-gradient(180deg, rgb(0 0 0 / .55) 0 1px, rgb(255 236 204 / .06) 1px 2px);
  background-size:100% 2px; background-repeat:no-repeat; background-position:left top;
}
html body #screens > :not(.sx-observatory) .fh-row.is-selected {
  border-width:0; border-image:none; color:var(--dp-lamp-hot);
  background:${EDGE_LIT}, ${LIFT_LIT};
  box-shadow:none;
}
html body #screens > :not(.sx-observatory) .fh-hairline { height:4px; border:0; background:linear-gradient(180deg, rgb(0 0 0 / .55) 0 1px, rgb(255 236 204 / .06) 1px 2px) left center / 100% 2px no-repeat; }
html body #screens > :not(.sx-observatory) .fh-legend[data-fh-lit="on"] { color:var(--dp-ink-dim); }
/* hero readouts in a corner plate are information: bone, not the lamp */
html body #screens > :not(.sx-observatory) .k-corner .k-hero__n { color:var(--dp-ink); text-shadow:var(--dp-emit); }
html body #screens > :not(.sx-observatory) .k-corner .k-hero__w { font-family:var(--dp-face-etch); color:var(--dp-ink-mute); }
/* selects: a glass readout in a thin bezel with an etched chevron */
html body #screens > :not(.sx-observatory) select.k-select {
  -webkit-appearance:none; appearance:none; min-height:40px; padding:0 36px 0 12px; border-radius:3px;
  border:0; border-image:none;
  background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23b7b4a6' stroke-width='1.5'/%3E%3C/svg%3E") right 13px center / 10px 6px no-repeat, var(--dp-glass-solid);
  box-shadow:var(--dp-glass-depth);
  color:var(--dp-ink); font-family:var(--dp-face-read); font-size:14px;
}
html body #screens > :not(.sx-observatory) select.k-select:focus-visible { outline:0 solid transparent !important; box-shadow:var(--dp-glass-depth), inset 0 0 0 1px rgb(255 217 140 / .55); }
html body #screens > :not(.sx-observatory) select.k-select option { background:#12161c; color:var(--dp-ink); }
/* inputs: a glass readout in a thin bezel; focus lights its rim */
html body #screens > :not(.sx-observatory) .fh-input {
  border-style:solid; border-color:transparent; border-width:12px;
  border-image:url("${HW}bezel-thin.svg") 12 / 12px / 0 stretch;
  background:var(--dp-glass-bb); color:var(--dp-ink); font-family:var(--dp-face-read);
}
html body #screens > :not(.sx-observatory) .fh-input:focus-visible { box-shadow:inset 0 0 0 1px var(--dp-lamp), 0 0 12px var(--dp-lamp-bloom-soft); }
/* tiles: keyart framed as a glass card; the chosen one lit */
html body #screens > :not(.sx-observatory) .fh-tile {
  border-style:solid; border-color:transparent; border-width:20px;
  border-image:url("${HW}bezel-thin.svg") 12 / 12px / 0 stretch; background:var(--dp-glass-bb);
}
html body #screens > :not(.sx-observatory) .fh-tile[aria-selected='true'] {
  border-image-source:url("${HW}bezel-lit.svg"); color:var(--dp-lamp-hot);
  box-shadow:0 10px 22px -12px var(--dp-lamp-bloom);
}
html body #screens > :not(.sx-observatory) .fh-tile:focus-visible { outline:0 solid transparent !important; border-image-source:url("${HW}bezel-lit.svg"); }
html body #screens > :not(.sx-observatory) .fh-tile-legend { font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 70; }
/* lights: the deckplate lens */
html body #screens > :not(.sx-observatory) .fh-light {
  border-radius:50%; width:9px; height:9px;
  background:radial-gradient(circle at 42% 34%, #fff6df 0%, var(--dp-lamp-hot) 22%, var(--dp-lamp) 55%, var(--dp-lamp-dim) 100%);
  box-shadow:0 0 6px var(--dp-lamp-bloom), 0 0 0 1px #06080a;
}
html body #screens > :not(.sx-observatory) .fh-light:is([data-level='off'], [data-level='dim']) {
  background:radial-gradient(circle at 42% 36%, #3b352c, #17140f 70%); box-shadow:inset 0 1px 1.5px rgb(0 0 0 / .85), 0 0 0 1px #06080a;
}
html body #screens > :not(.sx-observatory) .fh-light[data-colour='wanted'] { background:radial-gradient(circle at 42% 34%, #fff1ea, var(--dp-danger-hot) 26%, var(--dp-danger) 60%, #6b1a10); box-shadow:0 0 6px var(--dp-danger-bloom), 0 0 0 1px #06080a; }
html body #screens > :not(.sx-observatory) .fh-light:is([data-colour='good'], [data-colour='cold']) { background:radial-gradient(circle at 42% 34%, #fffaf0 0%, #d8d2c4 45%, #6b675d 100%); box-shadow:0 0 5px rgb(232 226 212 / .25), 0 0 0 1px #06080a; }
/* type: the display face for titles, the etched condensed voice for legends */
html body #screens > :not(.sx-observatory) .fh-title { font-family:var(--dp-face-display); font-variation-settings:"wght" 900, "wdth" 125; color:var(--dp-ink); text-shadow:0 -1px 0 rgb(0 0 0 / .8), 0 1px 0 rgb(255 236 204 / .12); }
html body #screens > :not(.sx-observatory) .fh-legend { font-family:var(--dp-face-etch); color:var(--dp-ink-mute); text-shadow:var(--dp-etch-shadow); }
@media (prefers-reduced-motion:reduce) { html body #screens > :not(.sx-observatory) .fh-key { transition:none; } }
@media (forced-colors:active) {
  html body #screens > :not(.sx-observatory) :is(.fh-plate, .fh-window, .fh-rail, .fh-key, .fh-input, .fh-tile) {
    border-image:none; border-color:CanvasText; background:Canvas; color:CanvasText; box-shadow:none; filter:none;
  }
  html body #screens > :not(.sx-observatory) :is(.fh-key:is(:hover, :focus-visible), .fh-key--legend:is([aria-selected='true'], [aria-pressed='true'], .is-lit), .fh-row.is-selected, .fh-tile[aria-selected='true']) {
    outline:2px solid Highlight; background:Canvas; color:CanvasText;
  }
  html body #screens > :not(.sx-observatory) .fh-light, html body #screens > :not(.sx-observatory) .fh-key--legend::before { forced-color-adjust:none; background:CanvasText; box-shadow:none; }
}
`;

/** A kit word as a deckplate command key: keycap hardware, the lamp in the cap, an etched legend.
    One helper so every shell screen's actions are the same key (critic round 7: "one selection
    language"). `sel` is a full selector for the buttons. */
function dpKey(sel) {
  return `
${sel} {
  box-sizing:border-box; display:inline-flex; align-items:center; justify-content:center; position:relative; width:auto;
  min-height:42px; padding:0 18px 0 30px; border-style:solid; border-color:transparent; border-width:8px 10px 10px; border-radius:0;
  border-image:url("${HW}keycap.svg") 10 10 12 / 8px 10px 10px / 0 stretch;
  background:${KEY_LED_OFF_BB.replace('11px 50%', '17px 50%')}, var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-metal-3);
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 760, "wdth" 78; font-size:13px; line-height:1.1;
  letter-spacing:.14em; text-transform:uppercase; color:var(--dp-ink); text-shadow:0 -1px 0 rgb(0 0 0 / .7);
  transition:color var(--dp-d-cut) var(--dp-ease-lamp), box-shadow var(--dp-d-cut) var(--dp-ease-lamp);
}
${sel}::after { display:none; }
${sel}:is(:hover, :focus-visible) {
  color:var(--dp-lamp-hot); text-shadow:var(--dp-emit-lamp);
  background:${KEY_LED_ON_BB.replace('11px 50%', '17px 50%')}, var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-metal-3);
  box-shadow:inset 0 0 0 1px rgb(255 217 140 / .35), 0 8px 16px -10px var(--dp-lamp-bloom);
}
${sel}:is(.k-word--primary, [aria-pressed='true']) {
  color:var(--dp-lamp-hot); text-shadow:var(--dp-emit-lamp);
  background:${KEY_LED_ON_BB.replace('11px 50%', '17px 50%')}, var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-metal-3);
  box-shadow:inset 0 0 0 1px rgb(255 217 140 / .5), inset 0 -8px 16px -10px var(--dp-lamp-bloom), 0 0 18px rgb(242 185 80 / .16);
}
${sel}:focus-visible { outline:0 solid transparent !important; }
${sel}:active { border-image-source:url("${HW}keycap-pressed.svg"); }
${sel}.k-word--danger { color:var(--dp-ink-dim); }
${sel}.k-word--danger:is(:hover, :focus-visible) {
  color:var(--dp-danger-hot); text-shadow:0 0 12px var(--dp-danger-bloom);
  background:${KEY_LED_RED_BB.replace('11px 50%', '17px 50%')}, var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-metal-3);
  box-shadow:inset 0 0 0 1px rgb(255 80 56 / .45), 0 8px 16px -10px var(--dp-danger-bloom);
}
${sel}:is([aria-disabled='true'], :disabled) {
  color:var(--dp-ink-mute); text-shadow:none; box-shadow:none; filter:saturate(.6) brightness(.85); cursor:default;
  background:${KEY_LED_OFF_BB.replace('11px 50%', '17px 50%')}, var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-metal-3);
}
@media (prefers-reduced-motion:reduce) { ${sel} { transition:none; } }
@media (forced-colors:active) {
  ${sel} { border-image:none; border:1px solid ButtonText; background:ButtonFace; color:ButtonText; box-shadow:none; filter:none; }
  ${sel}:is(:hover, :focus-visible, .k-word--primary, [aria-pressed='true']) { outline:2px solid Highlight !important; }
}
`;
}

/* ── MISSION LOG — a glass list and a glass reader, the actions as keys. ── */
const ML = 'html body #screens .sf-mlog';
const MISSIONLOG = `
${ML} .k-title .k-t-title {
  font-family:var(--dp-face-display); font-variation-settings:"wght" 900, "wdth" 125; text-transform:uppercase;
  letter-spacing:.05em; color:var(--dp-ink); text-shadow:0 -1px 0 rgb(0 0 0 / .8), 0 1px 0 rgb(255 236 204 / .12);
}
${ML} .k-hang.sf-mlog-body, ${ML} .k-stage.sf-mlog-stage {
  box-sizing:border-box; border-radius:2px; padding:14px 16px;
  background:var(--dp-glass-solid); box-shadow:var(--dp-glass-depth), 0 12px 30px rgb(0 0 0 / .45);
}
${ML} .k-stage.sf-mlog-stage { align-self:start; max-height:100%; }
${ML} .k-caps {
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 66; font-size:12px; letter-spacing:.22em;
  color:var(--dp-ink-mute); text-shadow:var(--dp-etch-shadow);
}
${ML} .k-row { border-top:0; background:linear-gradient(180deg, rgb(0 0 0 / .55) 0 1px, rgb(255 236 204 / .06) 1px 2px) left top / 100% 2px no-repeat; }
${ML} .k-row .k-row__name, ${ML} .k-row .k-t-emph { color:var(--dp-ink); }
${ML} .k-row .k-row__sub { color:var(--dp-ink-mute); }
/* the tracked contract in the list lights like every deckplate row */
${ML} .k-row:is(.is-tracked, .tracked, [aria-current='true'], [aria-selected='true']) {
  background:linear-gradient(90deg, rgb(255 238 210 / .07), transparent 70%);
  box-shadow:inset 3px 0 0 var(--dp-lamp), inset 0 0 0 1px rgb(255 217 140 / .16);
}
${ML} .sf-mlog-card .k-t-title {
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 820, "wdth" 86; text-transform:uppercase;
  font-size:clamp(24px, min(2vw, 3.6vh), 38px); line-height:1.05; letter-spacing:.05em; color:var(--dp-ink); text-shadow:var(--dp-emit);
}
${ML} .sf-mlog-terms { --k-row-cols:10.5em minmax(0, 1fr) !important; }
${ML} .sf-mlog-body .k-row__num {
  align-self:start; justify-self:end; display:inline-grid; place-items:center; min-height:22px; padding:2px 8px; border-radius:2px;
  background:rgb(0 0 0 / .32); box-shadow:inset 0 0 0 1px rgb(232 226 212 / .14);
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 74; font-size:12px; line-height:1.1;
  letter-spacing:.14em; text-transform:uppercase; color:var(--dp-ink-dim); white-space:nowrap;
}
${ML} .sf-mlog-card :is(.k-sentence--emph, .sf-mlog-obj) { color:var(--dp-ink-dim); }
${ML} .sf-mlog-card :is(dt, .k-row__label, th) {
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 70; font-size:12px; letter-spacing:.16em; text-transform:uppercase; color:var(--dp-ink-mute);
}
${ML} .sf-mlog-btns .k-words--row, ${ML} .sf-mlog-career-choices { gap:10px; flex-wrap:wrap; align-items:flex-start; }
${ML} .sf-mlog-btns .k-word-sub { font-family:var(--dp-face-etch); font-size:12px; letter-spacing:.1em; color:var(--dp-ink-mute); margin-top:4px; }
${dpKey(`${ML} .sf-mlog-btns .k-word`)}
${dpKey(`${ML} .sf-mlog-close`)}
${dpKey(`${ML} .sf-mlog-career-btn`)}
${ML} .sf-mlog-career-btn { min-height:34px; padding:0 12px 0 26px; font-size:12px; }
@media (forced-colors:active) {
  ${ML} .k-hang.sf-mlog-body, ${ML} .k-stage.sf-mlog-stage { background:Canvas; border:1px solid CanvasText; box-shadow:none; }
}
`;

/* ── GAME OVER — the loss report: a hazard-striped placard title over the dimmed world, the
   recovery facts as instrument readouts on glass, the ways forward as keys. Red is for threat and
   destructive states; a lost ship is the one screen where it frames the whole report. ── */
const GO = 'html body #screens .sf-gameover';
const GAMEOVER = `
${GO}.k-screen::before {
  background:
    radial-gradient(110% 80% at 12% 18%, rgb(150 26 14 / .22), transparent 60%),
    linear-gradient(180deg, rgb(4 5 8 / .93), rgb(4 5 8 / .97));
}
${GO} .k-title .k-caps {
  display:block; margin-bottom:6px;
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 760, "wdth" 66; font-size:12px; letter-spacing:.24em;
  color:var(--dp-danger-hot); text-shadow:0 0 10px var(--dp-danger-bloom);
}
${GO} .k-title .k-t-title {
  display:inline-block; padding-bottom:14px;
  font-family:var(--dp-face-display); font-variation-settings:"wght" 900, "wdth" 125; text-transform:uppercase;
  letter-spacing:.04em; color:var(--dp-ink); text-shadow:0 -1px 0 rgb(0 0 0 / .8), 0 2px 18px rgb(0 0 0 / .6);
  background:repeating-linear-gradient(135deg, var(--dp-danger) 0 12px, #1a0806 12px 24px) left bottom / 100% 6px no-repeat;
}
${GO} .sf-go-sub { color:var(--dp-ink); }
${GO} .k-sentence { color:var(--dp-ink-dim); }
${GO} .k-stage {
  align-self:start; box-sizing:border-box; width:fit-content; max-width:min(1080px, 100%); padding:18px 22px; border:12px solid transparent;
  border-image:url("${HW}bezel-thin.svg") 12 / 12px / 0 stretch;
  background:var(--dp-glass-solid), var(--dp-metal-layers), var(--dp-metal-2);
  box-shadow:0 14px 34px rgb(0 0 0 / .5), var(--dp-glass-depth);
}
${GO} .sf-go-grid { gap:clamp(18px, 3vw, 56px); flex-wrap:nowrap; }
${GO} .k-hero__n {
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 800, "wdth" 80; letter-spacing:.04em; text-transform:uppercase;
  font-size:clamp(22px, min(1.8vw, 3.3vh), 34px); line-height:1.05; color:var(--dp-ink); text-shadow:var(--dp-emit);
}
${GO} .k-hero__w {
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 70; font-size:12px; letter-spacing:.18em;
  text-transform:uppercase; color:var(--dp-ink-mute);
}
${GO} .sf-go-foot .k-words--row { gap:12px; flex-wrap:wrap; }
${dpKey(`${GO} .sf-go-foot .k-word`)}
@media (forced-colors:active) {
  ${GO} .k-stage { border-image:none; border:1px solid CanvasText; background:Canvas; box-shadow:none; }
  ${GO} .k-title .k-t-title { background:none; border-bottom:4px solid CanvasText; }
}
`;

/* ── HELP — the reference reads as instrument rows: bindings that are not a single key set in the
   etched voice at row size, not a large loose sentence. ── */
const HELP = `
html body #screens .of-help .k-row__num.fh-data {
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 78; font-size:13px; letter-spacing:.06em;
  color:var(--dp-ink); text-align:right;
}
`;

/* ── SHELL — what every shell screen shares (critic, shell round 1). ──
   1. The ground: in the menu (no run in progress) a non-staged shell screen stands on the title's
      world out of focus (backdrop-shell.jpg, cut from the title render), never on a flat fill. In a
      run, the same screens keep the held world behind them.
   2. One way back: .sf-back is the same plain keycap everywhere — the lamp in its cap, an ESC chip,
      bottom-left — never a primary amber key.
   3. One title: every shell screen title is the same display size; content headers inside a pane
      step down to the condensed voice at about half that.
   4. Scroll regions end in a fade over a padded foot and carry a thin bone scrollbar, so no line is
      ever cut in half at a hard edge. */
const SHELL_SCREENS = 'html body #screens > .k-screen:not(.sx-observatory):not([data-screen="mainMenu"])';
const SHELL = `
@property --sf-fade-a { syntax:'<number>'; inherits:false; initial-value:1; }
@keyframes sf-scroll-foot { from { --sf-fade-a:.08; } 96% { --sf-fade-a:.9; } to { --sf-fade-a:1; } }
html body[data-game-mode="menu"] #screens > .k-screen:not([data-k-stage]):not(.sx-observatory) {
  background:url("/assets/ui/backdrops/backdrop-shell.jpg") center / cover no-repeat;
}
/* in a run the same screens hold the world, dimmed, so the panels read first (pause and the loss
   report carry their own dim) */
html body:not([data-game-mode="menu"]) #screens > .k-screen:not([data-k-stage]):not(.sx-observatory):not(.of-pause):not(.sf-gameover) {
  background:radial-gradient(130% 100% at 30% 30%, rgb(9 10 13 / .86), rgb(5 6 9 / .93) 70%, rgb(4 5 7 / .96));
}
html body #screens .k-screen .k-foot .sf-back.k-word, html body #screens .k-screen .sf-back.k-word {
  position:relative; box-sizing:border-box; display:inline-flex; align-items:center; gap:0; width:auto; min-width:0; min-height:40px;
  margin:0; padding:0 12px 0 30px; border-style:solid; border-color:transparent; border-width:8px 10px 10px; border-radius:0;
  border-image:url("${HW}keycap.svg") 10 10 12 / 8px 10px 10px / 0 stretch;
  background:${KEY_LED_OFF_BB.replace('11px 50%', '17px 50%')}, var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-metal-3);
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 760, "wdth" 78; font-size:13px; line-height:1;
  letter-spacing:.14em; text-transform:uppercase; color:var(--dp-ink); text-shadow:0 -1px 0 rgb(0 0 0 / .7); box-shadow:none; filter:none;
}
html body #screens .k-screen .k-foot .sf-back.k-word::after, html body #screens .k-screen .sf-back.k-word::after {
  content:"ESC" / ""; position:static; transform:none; left:auto; bottom:auto; width:auto; height:22px; opacity:1;
  display:inline-grid; place-items:center; min-width:22px; margin-left:12px; padding:0 6px 2px; box-sizing:border-box;
  border-style:solid; border-color:transparent; border-width:3px 4px 5px; border-image:url("${HW}keycap.svg") 10 10 12 / 3px 4px 5px / 0 stretch;
  background:var(--dp-metal-3); color:var(--dp-ink-dim); font-size:12px; letter-spacing:.04em; text-shadow:none;
}
html body #screens .k-screen .k-foot .sf-back.k-word:is(:hover, :focus-visible), html body #screens .k-screen .sf-back.k-word:is(:hover, :focus-visible) {
  color:var(--dp-lamp-hot); text-shadow:var(--dp-emit-lamp);
  background:${KEY_LED_ON_BB.replace('11px 50%', '17px 50%')}, var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-metal-3);
  box-shadow:inset 0 0 0 1px rgb(255 217 140 / .35), 0 8px 16px -10px var(--dp-lamp-bloom);
}
html body #screens .k-screen .sf-back.k-word:focus-visible { outline:0 solid transparent !important; }
${SHELL_SCREENS} > .k-title .k-t-title {
  font-size:clamp(40px, min(3.9vw, 7vh), 76px); line-height:.95; letter-spacing:.04em; text-transform:uppercase;
  font-family:var(--dp-face-display); font-variation-settings:"wght" 900, "wdth" 125;
}
/* content headers inside a pane: the condensed voice at about half a screen title */
html body #screens .k-screen .sf-codex-entry .k-t-title,
html body #screens .k-screen .fh-plate--edge .fh-title {
  font-size:clamp(24px, min(2vw, 3.6vh), 38px); line-height:1.05;
}
${SHELL_SCREENS} :is(.k-stage--scroll, .sf-mlog-body, .tt-scroll, .tt-side, .sf-settings-pane, .sf-ng-body) {
  --sf-fade-edge:0px;
  scrollbar-width:thin; scrollbar-color:rgb(232 226 212 / .34) rgb(0 0 0 / .28);
  -webkit-mask-image:linear-gradient(180deg, #000 calc(100% - var(--sf-fade-edge) - 46px), rgb(0 0 0 / var(--sf-fade-a)) calc(100% - var(--sf-fade-edge)), #000 calc(100% - var(--sf-fade-edge)));
  mask-image:linear-gradient(180deg, #000 calc(100% - var(--sf-fade-edge) - 46px), rgb(0 0 0 / var(--sf-fade-a)) calc(100% - var(--sf-fade-edge)), #000 calc(100% - var(--sf-fade-edge)));
  padding-bottom:30px;
  animation:sf-scroll-foot linear both; animation-timeline:scroll(self block);
}
/* a pane with a frame fades to its frame's inner edge; the frame itself stays whole */
${SHELL_SCREENS} :is(.k-stage--scroll, .sf-ng-body).fh-plate { --sf-fade-edge:24px; }
${SHELL_SCREENS} .sf-settings-pane { --sf-fade-edge:14px; }
/* help: the register is only as wide as a reader needs, so each key sits beside its action */
html body #screens .of-help .k-stage--scroll { max-width:min(820px, 100%); }
/* mission log: path choices stand clear of the text above them; entity links read as one kind of
   link (an amber hairline: you can act on it), never a web underline on some and not others */
html body #screens .sf-mlog .sf-mlog-career-choices { margin-top:10px; }
html body #screens .sf-mlog :is(a, .sf-entity-link) { text-decoration:none; box-shadow:inset 0 -1px 0 rgb(242 185 80 / .45); color:var(--dp-ink); }
/* a text field has ONE focus signal: its lit rim (the global ring stacked three amber layers) */
html body #screens .k-screen :is(.fh-input, .k-input):focus-visible { outline:0 solid transparent !important; box-shadow:inset 0 0 0 1px var(--dp-lamp), 0 0 12px var(--dp-lamp-bloom-soft); }
/* research: each legend word wears the lens its nodes wear; the three stats sit in one row above
   the inspector instead of a tall card hanging over it */
html body #screens [data-swatch] { display:inline-flex; align-items:center; gap:8px; color:var(--dp-ink-dim); }
html body #screens [data-swatch]::before { content:""; flex:0 0 auto; width:9px; height:9px; border-radius:50%; box-shadow:0 0 0 1px #06080a; }
html body #screens [data-swatch="available"]::before { background:radial-gradient(circle at 42% 34%, #fff6df 0%, var(--dp-lamp-hot) 22%, var(--dp-lamp) 55%, var(--dp-lamp-dim) 100%); box-shadow:0 0 6px var(--dp-lamp-bloom), 0 0 0 1px #06080a; }
html body #screens [data-swatch="researched"]::before { background:radial-gradient(circle at 42% 34%, #fffaf0 0%, #d8d2c4 45%, #6b675d 100%); }
html body #screens [data-swatch="locked"]::before { background:radial-gradient(circle at 42% 36%, #3b352c, #17140f 70%); }
html body #screens .k-screen:has(.tt-side) > .k-corner { flex-direction:row; align-items:flex-end; gap:28px; }
html body #screens .k-screen:has(.tt-side) .tt-side { margin-top:clamp(64px, 9vh, 104px); }
@media (forced-colors:active) {
  html body #screens .k-screen :is(.fh-input, .k-input):focus-visible { outline:2px solid Highlight !important; }
  html body #screens .k-screen .sf-back.k-word { border-image:none; border:1px solid ButtonText; background:ButtonFace; color:ButtonText; }
  html body #screens .k-screen .sf-back.k-word::after { border-image:none; border:1px solid ButtonText; background:ButtonFace; }
  ${SHELL_SCREENS} :is(.k-stage--scroll, .sf-mlog-body, .tt-scroll, .tt-side, .sf-settings-pane, .sf-ng-body) { -webkit-mask-image:none; mask-image:none; }
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
/* Type law (critic round 7): the display face is for titles; anything you act on is the
   condensed etched caps every other menu uses. The default verb (Continue, or New Game with no
   save) leads a size up; the rest step down, so the column has a hierarchy. */
#screens .of-title.k-screen {
  --fht-menu-size:clamp(15px, min(1.3vw, 2.3vh), 25px);
  --fht-row-h:calc(var(--fht-menu-size) * 2.3);
}
#screens .of-title .k-t-name { width:clamp(320px, 44vw, 860px); margin-bottom:clamp(18px, 5vh, 72px); }
#screens .of-title .k-word {
  border-image-source:none; color:var(--dp-ink-dim);
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 760, "wdth" 82; letter-spacing:.16em;
  text-shadow:0 2px 10px rgb(0 0 0 / .6);
  background:none; box-shadow:none;
  /* grayscale antialiasing: a lit word on its own layer never picks up LCD colour fringes */
  transform:translateZ(0);
  transition:color var(--dp-d-cut) var(--dp-ease-lamp), background var(--dp-d-cut) var(--dp-ease-lamp);
}
#screens .of-title .k-word[aria-current='true'] { font-size:calc(var(--fht-menu-size) * 1.3); font-variation-settings:"wght" 820, "wdth" 86; }
/* The lit word: the rail's LED lit, the legend amber, an amber inner edge where the word meets the
   rail, a faint lift behind the legend — the same four signals as every deckplate row. */
#screens .of-title :is(.k-word:hover, .k-word:focus-visible),
#screens .of-title .k-words:not(:focus-within) .k-word[aria-current='true'] {
  border-image-source:none; color:var(--dp-lamp-hot); text-shadow:var(--dp-emit-lamp);
  background:
    radial-gradient(circle at calc(var(--fht-rail-w) * .5) 50%, #fff6df 0, var(--dp-lamp-hot) 2px, var(--dp-lamp) 5px, rgb(242 185 80 / .35) 8px, rgb(242 185 80 / .1) 16px, transparent 22px),
    linear-gradient(90deg, transparent calc(var(--fht-rail-w) + 4px), var(--dp-lamp) calc(var(--fht-rail-w) + 4px) calc(var(--fht-rail-w) + 6px), transparent calc(var(--fht-rail-w) + 6px)) 0 10% / 100% 80% no-repeat,
    radial-gradient(60% 70% at calc(var(--fht-rail-w) + 30%) 50%, rgb(255 222 170 / .06), transparent 70%);
  box-shadow:none;
}
/* the lit row IS the focus indicator (lamp, amber legend, amber edge); a ring around the whole
   row box crossed the rail. Forced colours, where the row light is stripped, gets the ring back. */
#screens .of-title .k-word:focus-visible { outline:0 solid transparent !important; }
#screens .of-title .k-word--danger { color:var(--dp-ink-dim); }
#screens .of-title .k-word[aria-disabled='true'] { color:color-mix(in srgb, var(--dp-ink) 48%, transparent); text-shadow:none; }
#screens .of-title .k-word--danger:is(:hover, :focus-visible) {
  color:var(--dp-danger-hot);
  background:radial-gradient(circle at calc(var(--fht-rail-w) * .5) 50%, #fff1ea 0, var(--dp-danger-hot) 2px, var(--dp-danger) 5px, rgb(255 80 56 / .3) 8px, transparent 20px),
    linear-gradient(90deg, rgb(255 80 56 / .09), transparent 70%);
  box-shadow:inset 0 -1px 0 rgb(255 80 56 / .35);
}
#screens .of-title .k-word[aria-disabled='true']:hover { background:none; box-shadow:none; }
/* The save readout under Continue, and the status strip: glass readouts with a lit LED. */
#screens .of-title .k-word-sub { color:var(--dp-ink-mute); font-family:var(--dp-face-read); font-size:13px; }
/* With no save, the helper line under Continue already says so: the status chip would repeat it. */
#screens .of-title:has(.k-word[data-action='continue'][aria-disabled='true']) .of-title-line { display:none; }
/* The build light is a bone LED lens, not a green square. */
#screens .of-title .k-fine .fh-light {
  width:7px; height:7px; border-radius:50%; background:radial-gradient(circle at 42% 36%, #fffaf0 0%, #d8d2c4 45%, #6b675d 100%);
  box-shadow:0 0 5px rgb(232 226 212 / .25), 0 0 0 1px #06080a;
}
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
  #screens .of-title .k-word:is(:hover, :focus-visible) { outline:2px solid Highlight !important; outline-offset:2px; }
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
  background:${LED_ON.replace('12px 50%', '20px 50%')}, ${EDGE_LIT}, ${LIFT_LIT};
  box-shadow:none;
}
/* The panel is the instrument: a fastened bezel around a glass face. */
${S} .sf-settings-pane, ${S} #sf-settings-pane {
  border:14px solid transparent; border-image:url("${HW}bezel.svg") 30 / 30px / 0 stretch;
  background:var(--dp-glass-solid), var(--dp-metal-layers), var(--dp-metal-2);
  box-shadow:var(--dp-stand-off), var(--dp-glass-depth);
  padding:10px 22px;
}
${S} .sf-settings-pane, ${S} #sf-settings-pane { align-self:start; justify-self:start; width:min(100%, 780px); max-height:100%; }
${S} .of-settings-switch { justify-self:start; width:auto; }
${S} .sf-settings-pane .k-rows { max-width:none; }
/* label, then its control right beside it: the eye no longer crosses the pane to find a fader */
${S} .sf-settings-pane .k-row { --k-row-cols:minmax(150px, 230px) minmax(0, 1fr); }
${S} .sf-settings-pane .k-row > .k-t-body, ${S} .sf-settings-pane .k-row__name {
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 78; font-size:13px;
  letter-spacing:.13em; text-transform:uppercase; color:var(--dp-ink);
}
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
  color:var(--dp-lamp-hot); text-shadow:var(--dp-emit-lamp);
  background:radial-gradient(circle at 11px 50%, #fff6df 0, var(--dp-lamp-hot) 1.5px, var(--dp-lamp) 3px, rgb(242 185 80 / .35) 4.5px, transparent 7px), linear-gradient(180deg, #2a303a, #20252d);
  box-shadow:inset 0 0 0 1px rgb(255 217 140 / .28), inset 0 1px 0 rgb(255 236 204 / .14);
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
  min-height:44px; padding:0 14px; color:var(--dp-ink); text-shadow:0 -1px 0 rgb(0 0 0 / .7); box-shadow:none;
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 760, "wdth" 78; letter-spacing:.14em;
}
${S} .k-foot .fh-key--primary:is(:hover, :focus-visible) { filter:brightness(1.12); color:var(--dp-lamp-hot); }
/* Back names its key: an Esc keycap beside the legend (decorative; the key is in the help). */
${S} .k-foot .fh-key--primary::after {
  content:"ESC" / ""; position:static; transform:none; left:auto; bottom:auto; width:auto; opacity:1;
  display:inline-grid; place-items:center; min-width:22px; height:22px; margin-left:12px; padding:0 6px 2px; box-sizing:border-box;
  border-style:solid; border-color:transparent; border-width:3px 4px 5px; border-image:url("${HW}keycap.svg") 10 10 12 / 3px 4px 5px / 0 stretch;
  background:var(--dp-metal-3); color:var(--dp-ink-dim); font-family:var(--dp-face-etch); font-variation-settings:"wght" 800, "wdth" 75; font-size:12px; letter-spacing:.04em;
}
@media (forced-colors:active) {
  ${S} .sf-settings-pane, ${S} select.k-select, ${S} .of-settings-rail, ${S} .sf-bind-btn,
  ${S} .sf-settings-pane .k-words--row:not(.of-settings-switch) .k-word, ${S} .k-foot .fh-key--primary {
    border-image:none; border:1px solid CanvasText; background:Canvas; color:CanvasText; box-shadow:none;
  }
  ${S} .sf-tabbar .k-word:is([aria-selected='true'], [aria-current='true']),
  ${S} .of-settings-switch .k-word[aria-pressed='true'] { background:Highlight; color:HighlightText; }
}
`;

/* ── THE CHART — the star chart's chrome on the deckplate (FRONTEND_PROGRAM Wave 4). ──
   The chart is an instrument laid over the paused world. The world recedes under a smoked ground —
   deeper at system and galaxy scale, where the hull behind the table means nothing — and every
   region the chart hangs over it is the one glass pane in a thin machined bezel the shell screens
   use. Commands are keycaps with a lamp; a lens is a lamp row (the lamp IS its state); the scale is
   one selector track; the nine inspector tabs are a legend grid, so no tab is ever cut off. The
   canvas keeps its own grammar (src/ui/map/tacticalMapGrammar.js). Geometry stays the chart's: each
   pane keeps the border width the chart's layout sheet was measured with. */
const GM = 'html body #screens #sf-galaxymap.of-chart';
const GM_GLASS = 'var(--dp-glass-spec) border-box, var(--dp-glass-fall) border-box, '
  + 'var(--dp-tex-smudge) 0 0 / 512px repeat border-box, linear-gradient(180deg, rgb(17 21 27 / .88), rgb(7 9 12 / .93)) border-box';
const GM_TRACK = 'background:linear-gradient(180deg, rgb(0 0 0 / .5), rgb(0 0 0 / .28)); '
  + 'box-shadow:inset 0 1px 3px rgb(0 0 0 / .85), 0 1px 0 rgb(255 236 204 / .07); border-radius:3px;';
const GM_SEG = 'background:linear-gradient(180deg, #232830, #191d24); box-shadow:inset 0 1px 0 rgb(255 236 204 / .07);';
const GM_SEG_LIT = 'background:linear-gradient(180deg, #2c3139, #20252d); color:var(--dp-lamp-hot); text-shadow:var(--dp-emit-lamp); '
  + 'box-shadow:inset 0 0 0 1px rgb(255 217 140 / .3), inset 0 -2px 0 var(--dp-lamp), 0 8px 14px -10px var(--dp-lamp-bloom);';
const GM_ETCH = 'font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 74; letter-spacing:.14em; text-transform:uppercase;';
const GM_HAIR = 'background-image:linear-gradient(180deg, rgb(0 0 0 / .55) 0 1px, rgb(255 236 204 / .06) 1px 2px); '
  + 'background-size:100% 2px; background-repeat:no-repeat; background-position:left top;';
const GM_CHIP = 'display:inline-grid; place-items:center; min-width:22px; height:22px; padding:0 6px 2px; box-sizing:border-box; '
  + 'border-style:solid; border-color:transparent; border-width:3px 4px 5px; border-image:url("' + HW + 'keycap.svg") 10 10 12 / 3px 4px 5px / 0 stretch; '
  + 'background:var(--dp-metal-3); color:var(--dp-ink-dim); font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 80; '
  + 'font-size:12px; line-height:1; letter-spacing:.04em; text-transform:uppercase; text-shadow:none;';
const GM_KEYS = `${GM} :is(.gm-close, .gm-hint-btn, .gm-ins-btn, .gm-place-btn, .gm-ribbon-btn, .gm-deck-sort, .gm-rail-add)`;
const CHART = `
${GM} { background:radial-gradient(130% 100% at 50% 45%, rgb(6 8 11 / .6), rgb(5 6 9 / .85) 68%, rgb(4 5 7 / .94)); }
${GM}:is([data-scale="system"], [data-scale="galaxy"]) {
  background:radial-gradient(130% 100% at 50% 45%, rgb(9 11 15 / .9), rgb(5 6 9 / .96) 68%, rgb(3 4 6 / .985));
}
${GM} .k-word::after { display:none; }
/* the title block: the place's name at the one screen-title size, its stamp an etched legend */
${GM} .gm-stamp { ${GM_ETCH} font-size:12px; color:var(--dp-ink-mute); }
${GM} .gm-level { ${GM_ETCH} font-size:12px; color:var(--dp-ink-mute); }
${GM} .gm-level b { color:var(--dp-ink-dim); font-weight:inherit; }
/* panes: smoked glass seated in the thin bezel */
${GM} :is(.gm-left-rail, .gm-right-inspector, .gm-deck, .gm-hints, .gm-search-results) {
  border-style:solid; border-color:transparent; border-width:16px; border-radius:0;
  border-image:url("${HW}bezel-thin.svg") 12 / 12px / 0 stretch;
  background:${GM_GLASS}; box-shadow:0 14px 34px rgb(0 0 0 / .5); color:var(--dp-ink);
  scrollbar-width:thin; scrollbar-color:rgb(232 226 212 / .24) transparent;
}
/* the scale: one recessed selector track, the current scale lit in its segment */
${GM} .gm-scale-buttons.k-words { display:inline-flex; flex-wrap:nowrap; gap:3px; padding:3px; width:max-content; ${GM_TRACK} }
${GM} .gm-scale-btn.k-word {
  display:inline-flex; align-items:center; justify-content:center; min-width:78px; min-height:30px; padding:0 14px;
  border:0; border-image:none; border-radius:2px; ${GM_SEG} ${GM_ETCH} font-size:12px; color:var(--dp-ink-dim); cursor:pointer;
}
${GM} .gm-scale-btn.k-word:is(:hover, :focus-visible) { color:var(--dp-ink); background:linear-gradient(180deg, #2a2f37, #1e222a); }
${GM} .gm-scale-btn.k-word:is([aria-pressed="true"], .is-current) { ${GM_SEG_LIT} }
${GM} .gm-rail-track { height:2px; background:rgb(0 0 0 / .6); box-shadow:0 1px 0 rgb(255 236 204 / .08); border-radius:1px; }
${GM} .gm-rail-marker { width:3px; height:12px; top:-5px; border-radius:1px; background:var(--dp-lamp-hot); box-shadow:0 0 8px var(--dp-lamp-bloom); }
/* search: a glass well, the slash key as a small cap */
${GM} .gm-search-input.k-input {
  box-sizing:border-box; min-height:40px; padding:0 40px 0 14px; border:0; border-radius:3px; border-image:none;
  background:var(--dp-glass-solid); box-shadow:var(--dp-glass-depth);
  color:var(--dp-ink); font-family:var(--dp-face-read); font-size:14px;
}
${GM} .gm-search-input.k-input::placeholder { color:var(--dp-ink-mute); }
${GM} .gm-search-input.k-input:focus { outline:0; box-shadow:var(--dp-glass-depth), inset 0 0 0 1px rgb(255 217 140 / .55), 0 0 0 1px rgb(242 185 80 / .22); }
${GM} .gm-search-kbd { ${GM_CHIP} right:9px; top:50%; transform:translateY(-50%); }
${GM} :is(.gm-search-item, .gm-hint-row) { border:0; box-shadow:none; ${GM_HAIR} }
${GM} .gm-search-item.selected { color:var(--dp-lamp-hot); box-shadow:inset 2px 0 0 var(--dp-lamp); }
${GM} .gm-hint-row kbd { ${GM_CHIP} min-width:0; }
${GM} .gm-hints-title { ${GM_ETCH} font-size:12px; color:var(--dp-ink-mute); }
/* commands: keycaps with the lamp in the cap */
${dpKey(GM_KEYS)}
${GM_KEYS} { min-height:34px; padding:0 14px 0 30px; font-size:12px; max-width:100%; white-space:nowrap; }
${GM} .gm-frame-group .gm-frame-btn { width:100%; justify-content:flex-start; }
${GM} :is(#gm-set-course-btn, #gm-engage-route-btn, .gm-plot-btn) { width:100%; min-height:40px; font-size:13px; }
${GM} :is(#gm-set-course-btn, #gm-engage-route-btn):not(:disabled):not([aria-disabled="true"]) {
  color:var(--dp-lamp-hot); text-shadow:var(--dp-emit-lamp);
  background:${KEY_LED_ON_BB.replace('11px 50%', '17px 50%')}, var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-metal-3);
  box-shadow:inset 0 0 0 1px rgb(255 217 140 / .5), inset 0 -8px 16px -10px var(--dp-lamp-bloom), 0 0 18px rgb(242 185 80 / .16);
}
${GM_KEYS}:is(:disabled, [aria-disabled="true"]) {
  background:${KEY_LED_OFF_BB.replace('11px 50%', '17px 50%')}, var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-metal-3);
  color:var(--dp-ink-mute); text-shadow:none; box-shadow:none; filter:saturate(.6) brightness(.85); cursor:default;
}
${GM} #gm-engage-route-btn[data-engage-state="nav:abortRoute"]:not(:disabled) {
  color:var(--dp-danger-hot); text-shadow:0 0 12px var(--dp-danger-bloom);
  background:${KEY_LED_RED_BB.replace('11px 50%', '17px 50%')}, var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-metal-3);
  box-shadow:inset 0 0 0 1px rgb(255 80 56 / .45), 0 8px 16px -10px var(--dp-danger-bloom);
}
${GM} .gm-hint-btn[aria-expanded="true"] {
  color:var(--dp-lamp-hot); text-shadow:var(--dp-emit-lamp);
  background:${KEY_LED_ON_BB.replace('11px 50%', '17px 50%')}, var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-metal-3);
}
/* the chart's way back is the same control as every screen's: a plain cap and its ESC chip */
${GM} .gm-close.k-word::after { content:"ESC" / ""; ${GM_CHIP} position:static; transform:none; width:auto; margin-left:12px; opacity:1; }
${GM} :is(.gm-frame-reason, .gm-plot-reason, .gm-engage-reason, .gm-ribbon-reason) { color:var(--dp-ink-mute); font-family:var(--dp-face-read); font-size:12px; }
/* the rail: disclosures under etched legends; each lens a lamp row */
${GM} .gm-rail-sec { border:0; ${GM_HAIR} }
${GM} .gm-rail-sec:first-child { background-image:none; }
${GM} .gm-rail-sum { justify-content:flex-start; ${GM_ETCH} font-size:12px; color:var(--dp-ink-dim); }
${GM} .gm-rail-sum-t { font-family:inherit; font-size:inherit; font-variation-settings:inherit; letter-spacing:inherit; color:inherit; }
${GM} .gm-rail-sum-n { margin-left:auto; font-family:var(--dp-face-etch); letter-spacing:.06em; color:var(--dp-ink-mute); }
${GM} .gm-rail-sum::after {
  content:""; flex:0 0 auto; align-self:center; width:6px; height:6px; margin:0 3px 3px 10px;
  border-right:1.5px solid currentColor; border-bottom:1.5px solid currentColor; transform:rotate(-45deg);
}
${GM} .gm-rail-sec[open] > .gm-rail-sum::after { transform:rotate(45deg); margin-bottom:6px; }
${GM} :is(.gm-rail-sec[open] > .gm-rail-sum, .gm-rail-sum:hover) { color:var(--dp-ink); }
${GM} .gm-layer-buttons { gap:14px; }
${GM} .gm-layer-bank { gap:1px; }
${GM} .gm-layer-bank-title { ${GM_ETCH} font-size:12px; color:var(--dp-ink-mute); margin:0 0 4px; }
${GM} .gm-layer-btn.k-word {
  position:relative; box-sizing:border-box; display:flex; align-items:center; gap:10px; width:100%; max-width:100%; min-height:34px;
  margin:0; padding:0 10px 0 28px; border:0; border-image:none; border-radius:2px; cursor:pointer;
  background:${LED_OFF}; box-shadow:none; text-shadow:none;
  ${GM_ETCH} font-size:12px; color:var(--dp-ink-mute);
}
${GM} .gm-layer-btn.k-word::before { display:none; }
${GM} .gm-layer-btn.k-word:is([aria-pressed="true"], .active) { background:${LED_ON}; color:var(--dp-ink); }
${GM} .gm-layer-btn.k-word:is(:hover, :focus-visible) { background:${LED_OFF}, linear-gradient(90deg, rgb(255 238 210 / .07), transparent 85%); color:var(--dp-lamp-hot); }
${GM} .gm-layer-btn.k-word:is([aria-pressed="true"], .active):is(:hover, :focus-visible) { background:${LED_ON}, linear-gradient(90deg, rgb(255 238 210 / .07), transparent 85%); }
${GM} .gm-layer-ico { display:inline-flex; flex:0 0 18px; width:18px; height:18px; color:inherit; opacity:.85; }
${GM} .gm-layer-ico .dp-icon { width:18px; height:18px; display:block; }
${GM} .gm-layer-ico .dp-icon .accent { fill:currentColor; }
${GM} .gm-layer-btn.k-word:is([aria-pressed="true"], .active) .gm-layer-ico .dp-icon .accent { fill:var(--dp-lamp); }
${GM} .gm-layer-name { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
${GM} .gm-rail-commodity label { ${GM_ETCH} font-size:12px; color:var(--dp-ink-mute); }
${GM} .gm-rail-commodity :is(select, .sf-select__field) {
  min-height:34px; padding:0 30px 0 10px; border:0; border-radius:3px;
  background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23b7b4a6' stroke-width='1.5'/%3E%3C/svg%3E") right 11px center / 10px 6px no-repeat, var(--dp-glass-solid);
  box-shadow:var(--dp-glass-depth); color:var(--dp-ink); font-family:var(--dp-face-read); font-size:13px;
}
${GM} :is(.gm-rail-item, .gm-legend-row) { border:0; ${GM_HAIR} }
${GM} .gm-rail-legend > .gm-legend-row:first-of-type { background-image:none; }
${GM} :is(.gm-rail-item.is-tracked, .gm-rail-item.is-current) { color:var(--dp-lamp-hot); box-shadow:inset 2px 0 0 var(--dp-lamp); }
${GM} :is(.gm-rail-title, .gm-ins-kind, .gm-ins-title, .gm-deck-title) { ${GM_ETCH} font-size:12px; color:var(--dp-ink-mute); }
${GM} .gm-legend-ico { width:18px; height:18px; color:var(--dp-ink-dim); }
${GM} .gm-legend-ico .dp-icon { width:18px; height:18px; display:block; }
${GM} .gm-legend-ico .dp-icon .accent { fill:var(--dp-lamp-dim, var(--dp-lamp)); }
${GM} .gm-legend-ico svg:not(.dp-icon) { width:18px; height:18px; stroke:var(--dp-ink-dim); }
/* the inspector: nine tabs as a legend grid in one recessed track — every tab on the glass */
${GM} .gm-tabs.k-words {
  display:grid; grid-template-columns:repeat(auto-fill, minmax(84px, 1fr)); gap:3px; padding:3px; overflow:visible; ${GM_TRACK}
}
${GM} .gm-tab.k-word {
  display:flex; align-items:center; justify-content:center; min-width:0; min-height:30px; margin:0; padding:0 6px;
  border:0; border-image:none; border-radius:2px; ${GM_SEG} ${GM_ETCH} font-size:12px; letter-spacing:.1em; color:var(--dp-ink-dim);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:pointer;
}
${GM} .gm-tab.k-word::before { display:none; }
${GM} .gm-tab.k-word:is(:hover, :focus-visible) { color:var(--dp-ink); background:linear-gradient(180deg, #2a2f37, #1e222a); }
${GM} .gm-tab.k-word[aria-selected="true"] { ${GM_SEG_LIT} }
/* the detail region scrolls: it ends in a fade over a padded foot, so no line is cut at the edge */
${GM} .gm-inspector-content {
  padding-bottom:24px; scrollbar-width:thin; scrollbar-color:rgb(232 226 212 / .24) transparent;
  -webkit-mask-image:linear-gradient(180deg, #000 calc(100% - 22px), transparent); mask-image:linear-gradient(180deg, #000 calc(100% - 22px), transparent);
}
${GM} .gm-ins-section { border-top:0; ${GM_HAIR} }
${GM} .gm-ins-section:first-child { background-image:none; }
${GM} .gm-ins-target-name {
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 820, "wdth" 86; font-weight:inherit;
  font-size:clamp(20px, 1.5vw, 28px); line-height:1.05; letter-spacing:.04em; text-transform:uppercase; color:var(--dp-ink);
}
${GM} :is(.gm-inspector-empty, .gm-ins-note) { font-family:var(--dp-face-read); color:var(--dp-ink-dim); }
${GM} .gm-ins-row { color:var(--dp-ink-dim); }
${GM} .gm-ins-row-val { color:var(--dp-ink); }
/* the weather: an etched meter */
${GM} .gm-weather-bar { height:4px; border-radius:1px; background:rgb(0 0 0 / .55); box-shadow:inset 0 1px 1px rgb(0 0 0 / .8), 0 1px 0 rgb(255 236 204 / .07); overflow:hidden; }
${GM} .gm-weather-seg--combat { background:var(--dp-danger); }
${GM} .gm-weather-seg--civil { background:var(--dp-ink-dim); }
${GM} .gm-weather[data-weather-level="working"] .gm-weather-word { color:var(--dp-lamp-hot); }
${GM} .gm-weather[data-weather-level="hot"] .gm-weather-word { color:var(--dp-danger-hot); }
/* the foot: the cargo deck and the route ribbon */
${GM} .gm-deck-table .k-row { ${GM_HAIR} }
@media (forced-colors:active) {
  ${GM} { background:Canvas; }
  ${GM} :is(.gm-left-rail, .gm-right-inspector, .gm-deck, .gm-hints, .gm-search-results) { border:1px solid CanvasText; border-image:none; background:Canvas; }
  ${GM} :is(.gm-scale-btn, .gm-tab, .gm-layer-btn).k-word { border:1px solid ButtonText; background:ButtonFace; color:ButtonText; }
  ${GM} :is(.gm-scale-btn[aria-pressed="true"], .gm-tab[aria-selected="true"], .gm-layer-btn[aria-pressed="true"]).k-word { outline:2px solid Highlight; }
  ${GM} :is(.gm-search-input, .gm-rail-commodity select) { border:1px solid CanvasText; background:Canvas; color:CanvasText; }
  ${GM} .gm-inspector-content { -webkit-mask-image:none; mask-image:none; }
  ${GM} :is(.gm-search-kbd, .gm-hint-row kbd), ${GM} .gm-close.k-word::after { border:1px solid ButtonText; border-image:none; background:ButtonFace; color:ButtonText; }
}
`;

/* ── ONE SELECTION, ONE HEADER (critic, shell round 2). ──
   A chosen thing in a list, a tab set or a nav lights ONE way on every screen: its lamp, its legend
   in amber, the amber edge on its inner left, a faint warm lift. Keyboard focus is that same edge —
   never an outer ring (forced colours and the game's high-contrast mode keep a real ring). The kit's
   underline bar is not a selection language here. And every shell screen stands on one header grid:
   the kit margin, the title at the same point, one sentence under it in one voice, the way back
   first in the foot. */
const SEL = 'html body #screens > .k-screen:not(.sx-observatory)';
const SELECTION = `
${SEL} .k-word:not(.sf-back):not([data-hint]):not(.gm-close)::after { display:none; }
/* rows */
${SEL} :is(.k-row, .fh-row):is([aria-selected="true"], .is-selected, .is-tracked, [aria-current="true"]) {
  border-image:none; background:${EDGE_LIT}, ${LIFT_LIT}; box-shadow:none;
}
${SEL} :is(.k-row, .fh-row):is([aria-selected="true"], .is-selected, .is-tracked, [aria-current="true"]) :is(.k-row__name, .sf-slot-name) {
  color:var(--dp-lamp-hot); text-shadow:var(--dp-emit-lamp);
}
${SEL} :is(.k-row, .fh-row):focus-visible { outline:0 solid transparent !important; background:${EDGE_LIT}, linear-gradient(90deg, rgb(255 255 255 / .05), transparent 75%) border-box; }
${SEL} :is(.k-row, .fh-row):is([aria-selected="true"], .is-selected, .is-tracked, [aria-current="true"]):focus-visible { background:${EDGE_LIT}, ${LIFT_LIT}; }
/* legend tabs: focus is the edge; the lit one keeps its lamp, legend and edge */
${SEL} .fh-key.fh-key--legend:focus-visible { outline:0 solid transparent !important; background:${EDGE_LIT}, linear-gradient(90deg, rgb(255 255 255 / .05), transparent 80%) border-box; }
${SEL} .fh-key.fh-key--legend:is([aria-selected='true'], [aria-current='true'], [aria-pressed='true'], .is-lit) { background:${EDGE_LIT}, ${LIFT_LIT}; box-shadow:none; }
/* settings: the rail pip was a second lamp — each tab carries one, in its own cap */
${SEL}.of-settings .sf-tabbar .k-word::before { display:none; }
${SEL}.of-settings .sf-tabbar .k-word:focus-visible { background:${LED_OFF.replace('12px 50%', '20px 50%')}, ${EDGE_LIT}, linear-gradient(90deg, rgb(255 255 255 / .05), transparent 80%) border-box; }
${SEL}.of-settings .sf-tabbar .k-word:is([aria-selected='true'], [aria-current='true']) { background:${LED_ON.replace('12px 50%', '20px 50%')}, ${EDGE_LIT}, ${LIFT_LIT}; }
/* a bar is an etched meter: a dark groove, a bone fill that glows faintly (the lamp when it signals) */
${SEL} .k-bar { height:5px; border-radius:1px; background:rgb(0 0 0 / .55); box-shadow:inset 0 1px 1px rgb(0 0 0 / .8), 0 1px 0 rgb(255 236 204 / .07); }
${SEL} .k-bar .k-bar__fill { border-radius:1px; background:linear-gradient(180deg, #f3eee3, #c9c4b6); box-shadow:0 0 6px rgb(232 226 212 / .22); }
${SEL} .k-bar.k-bar--signal .k-bar__fill { background:linear-gradient(180deg, var(--dp-lamp-hot), var(--dp-lamp)); box-shadow:0 0 6px var(--dp-lamp-bloom); }
@media (forced-colors:active) { ${SEL} .k-bar { background:GrayText; box-shadow:none; } ${SEL} .k-bar .k-bar__fill { background:CanvasText; box-shadow:none; } }
/* the data states (empty, loading, error, denied): the code word etched, the headline in the header
   voice, the fill in the reading face, the verb a keycap */
${SEL} .sf-state__word { font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 72; font-size:12px; letter-spacing:.18em; color:var(--dp-ink-mute); }
${SEL} .sf-state__head { font-family:var(--dp-face-etch); font-variation-settings:"wght" 820, "wdth" 86; font-size:clamp(20px, min(1.5vw, 2.8vh), 28px); line-height:1.1; letter-spacing:.04em; text-transform:uppercase; color:var(--dp-ink); }
${SEL} :is(.sf-state__fills, .sf-state__detail) { font-family:var(--dp-face-read); color:var(--dp-ink-dim); }
${SEL} .sf-state__glyph { color:var(--dp-ink-mute); }
${dpKey(`${SEL} .sf-state__verb`)}
${SEL} .sf-state__verb { align-self:flex-start; min-height:38px; font-size:12px; }
/* footprint: the empty state stands in a pane; the verbs are keys with their reasons under them */
${SEL}[data-screen="footprint"] .fp-statehost:not([hidden]) {
  align-self:start; box-sizing:border-box; padding:18px 22px; border:14px solid transparent; border-image:url("${HW}bezel-thin.svg") 12 / 12px / 0 stretch;
  background:var(--dp-glass-bb); box-shadow:0 14px 34px rgb(0 0 0 / .5);
}
${dpKey(`${SEL}[data-screen="footprint"] > .k-foot .k-word`)}
${SEL}[data-screen="footprint"] > .k-foot .k-word { min-height:40px; font-size:12px; }
/* keys drawn by the bridge: the lit cap is the focus */
${SEL} .fh-key:not(.fh-key--legend):focus-visible { outline:0 solid transparent !important; }
/* a small key in a screen's foot is a command (export, import): the one keycap with its lamp */
${dpKey(`${SEL} > .k-foot .fh-key.fh-key--small`)}
${SEL} > .k-foot .fh-key.fh-key--small { min-height:40px; font-size:13px; }
/* a window onto the hangar is set in the fastened bezel, like every instrument pane */
${SEL}.fh-shell > .k-stage:has(> .k-world--stage) {
  border:14px solid transparent; border-image:url("${HW}bezel.svg") 30 / 30px / 0 stretch; box-shadow:var(--dp-stand-off);
}
/* new game: Launch is the largest key, level with Back */
${SEL} > .k-foot.sf-ng-footer { align-items:center; }
${SEL} > .k-foot .sf-ng-launch { min-height:48px; padding-left:36px; padding-right:26px; font-size:15px; letter-spacing:.18em; }
/* the research tree's pane is its content's width, so its scrollbar is the tree's edge */
${SEL} .tt-scroll { width:fit-content; max-width:100%; justify-self:start; }
/* one header grid */
${SEL}:is(.of-settings, .of-credits, .of-achievements) { padding:var(--k-margin); }
${SEL} > .k-title .k-t-emph.k-62 {
  margin:12px 0 0; max-width:64ch; font-family:var(--dp-face-read); font-variation-settings:normal; font-weight:400;
  font-size:clamp(15px, min(1vw, 1.8vh), 18px); line-height:1.4; letter-spacing:.005em; text-transform:none;
  color:var(--dp-ink-dim); text-shadow:0 1px 2px rgb(0 0 0 / .6);
}
${SEL} > .k-foot .sf-back { order:-1; }
${SEL} > .k-foot > :has(> .sf-back), ${SEL} > .k-foot > :has(> li > .sf-back) { order:-1; }
@media (forced-colors:active) {
  ${SEL} :is(.k-row, .fh-row, .fh-key):focus-visible { outline:2px solid Highlight !important; }
}
html.sf-high-contrast body #screens > .k-screen:not(.sx-observatory) :is(.k-row, .fh-row, .fh-key, .k-word):focus-visible { outline:2px solid #fff !important; }
`;

/* ── THE SHIP (F2) — the flight host of the shipworks stage on deckplate materials. ──
   The board chips are glass sockets whose lamp is the socket (fitted lit, open dark); the four
   handling bands are the header voice, the chosen band lit the one way; the verbs are keycaps; the
   callout pins over the hull are small lamps, not squares. */
const SH = 'html body #screens #sf-ship';
const SHIP = `
${SH} .sx-sw__slotfield.is-board .sx-hardpoint {
  box-sizing:border-box; min-height:40px; padding:6px 12px 6px 28px; border:0; border-radius:3px;
  background:${LED_ON.replace('12px 50%', '14px 50%')}, var(--dp-glass-flight); box-shadow:var(--dp-glass-depth);
}
${SH} .sx-sw__slotfield.is-board .sx-hardpoint.is-empty { background:${LED_OFF.replace('12px 50%', '14px 50%')}, var(--dp-glass-flight); }
${SH} .sx-sw__slotfield.is-board .sx-hardpoint__reticle { display:none; }
${SH} .sx-sw__slotfield.is-board .sx-hardpoint:is(.is-selected, :hover, :focus-visible) {
  box-shadow:var(--dp-glass-depth), inset 0 0 0 1px rgb(255 217 140 / .42); outline:0 solid transparent !important;
}
${SH} .sx-hardpoint__reticle { width:7px; height:7px; left:-3.5px; top:-3.5px; border-radius:50%; background:radial-gradient(circle at 42% 34%, #fffaf0, #d8d2c4 45%, #6b675d); box-shadow:0 0 6px rgb(232 226 212 / .3), 0 0 0 1px #06080a; }
${SH} .sx-hardpoint.is-selected .sx-hardpoint__reticle { background:radial-gradient(circle at 42% 34%, #fff6df, var(--dp-lamp-hot) 30%, var(--dp-lamp) 60%, var(--dp-lamp-dim)); box-shadow:0 0 8px var(--dp-lamp-bloom), 0 0 0 1px #06080a; }
${SH} .sx-hardpoint__copy b { font-family:var(--dp-face-etch); font-variation-settings:"wght" 740, "wdth" 80; font-weight:inherit; letter-spacing:.06em; color:var(--dp-ink); }
${SH} .sx-hardpoint__copy em { font-family:var(--dp-face-etch); font-variation-settings:"wght" 680, "wdth" 72; font-size:12px; letter-spacing:.14em; text-transform:uppercase; color:var(--dp-ink-mute); }
${SH} .sx-hardpoint.is-empty .sx-hardpoint__copy b { color:var(--dp-ink-mute); }
${SH} .sx-hardpoint:is(:hover, :focus-visible, .is-selected) .sx-hardpoint__copy b { color:var(--dp-lamp-hot); text-shadow:var(--dp-emit-lamp); }
${SH} .sx-hardpoint__leader path { stroke:rgb(232 226 212 / .28); }
/* the handling bands */
${SH} .sx-sw-hero { position:relative; padding:8px 18px 10px 18px; border-radius:2px; background:none; box-shadow:none; }
${SH} .sx-sw-hero .k-hero__n {
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 820, "wdth" 84; font-size:clamp(30px, min(2.5vw, 4.4vh), 48px);
  line-height:1; letter-spacing:.02em; text-transform:uppercase; color:var(--dp-ink); text-shadow:var(--dp-emit);
}
${SH} .sx-sw-hero .k-hero__w { font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 72; font-size:12px; letter-spacing:.16em; text-transform:uppercase; color:var(--dp-ink-mute); }
${SH} .sx-sw-hero:hover { background:linear-gradient(90deg, rgb(255 255 255 / .05), transparent 80%); }
${SH} .sx-sw-hero:focus-visible { outline:0 solid transparent !important; background:${EDGE_LIT}, linear-gradient(90deg, rgb(255 255 255 / .05), transparent 80%) border-box; }
${SH} .sx-sw-hero:is([aria-pressed="true"], .is-selected) { background:${EDGE_LIT}, ${LIFT_LIT}; }
${SH} .sx-sw-hero:is([aria-pressed="true"], .is-selected) .k-hero__w { color:var(--dp-lamp-hot); text-shadow:var(--dp-emit-lamp); }
${SH} .sx-sw-hero.k-hero--good .k-hero__n { color:var(--dp-ink); }
/* the gauges over the hangar sit on a smoked strip so they read against the lit bay */
${SH} .sx-sw__gauges { padding:4px 14px; border-radius:3px; background:var(--dp-glass-flight); box-shadow:var(--dp-glass-depth); }
${SH} .sx-sw__gauges .k-row { min-height:32px; }
${SH} .sx-sw__gauges :is(.k-row__label, dt, .k-caps) { font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 72; letter-spacing:.14em; color:var(--dp-ink-mute); }
/* the verbs are commands */
${dpKey(`${SH} .sx-sw-verb.k-word`)}
${SH} .sx-sw-verb.k-word { min-height:38px; font-size:12px; }
${SH} .sx-sw-verbs { gap:10px; align-items:center; }
`;

/* ── THE RANGE — its course is an instrument pane, not a drawing floating over the world: the
   drill box stands on smoked glass so the hull behind never reads as part of the course. Focus on
   the course is a quiet lit rim, not a frame. ── */
const RG = 'html body #screens #sf-range';
const RANGE = `
${RG} .sf-range__box { border-radius:3px; background:var(--dp-glass-solid); box-shadow:var(--dp-glass-depth), 0 14px 34px rgb(0 0 0 / .5); }
${RG} .sf-range__canvas:focus-visible { outline:1px solid rgb(242 185 80 / .38) !important; outline-offset:-1px; }
/* the rule verbs are commands, every one a keycap (Next rule was drawn as a tab) */
${dpKey(`${RG} .sf-range__verbs .k-word.fh-key`)}
${RG} .sf-range__verbs .k-word.fh-key { min-height:38px; font-size:12px; }
@media (forced-colors:active) { ${RG} .sf-range__canvas:focus-visible { outline:2px solid Highlight !important; } }
`;

/* ── THE CRUCIBLE — the door keeps its foundry and its hazard Launch plate (now drawn on the
   keycap); the in-run screens (rearm, refit, results) stand over the paused arena like any held
   world: the offers are glass cards in the thin bezel that light their own bezel under the hand,
   the refit is a glass pane of hardpoint rows, every verb is a keycap (Strip and Main menu are the
   hazard kind: bone at rest, the lamp driven red under the hand). ── */
const CRD = 'html body #screens .of-crucible-door';
const CR = 'html body #screens > .k-screen:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results)';
const HAZARD_BAND = 'repeating-linear-gradient(135deg, #e0452c 0 6px, #22100b 6px 12px) 14px 50% / 22px calc(100% - 24px) no-repeat border-box';
const CRUCIBLE = `
${CRD} .fh-key.fh-key--hazard {
  padding-left:52px; color:var(--dp-ink); font-variation-settings:"wght" 800, "wdth" 84; letter-spacing:.2em;
  background:${HAZARD_BAND}, var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-metal-3);
  box-shadow:0 10px 24px -14px rgb(224 69 44 / .5);
}
${CRD} .fh-key.fh-key--hazard:is(:hover, :focus-visible) {
  color:var(--dp-danger-hot); text-shadow:0 0 14px var(--dp-danger-bloom);
  background:${HAZARD_BAND}, var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-metal-3);
  box-shadow:inset 0 0 0 1px rgb(255 80 56 / .45), 0 10px 24px -12px var(--dp-danger-bloom);
}
${CR} { background:radial-gradient(130% 100% at 30% 30%, rgb(9 10 13 / .84), rgb(5 6 9 / .92) 70%, rgb(4 5 7 / .95)); }
${dpKey(`${CR} .k-foot .k-word`)}
${dpKey(`${CR} .sf-cru-row .k-word`)}
${CR} .sf-cru-row .k-word { min-height:36px; font-size:12px; }
${CR} .sf-cru-stage.k-stage--scroll {
  box-sizing:border-box; padding:8px 16px; border:14px solid transparent; border-image:url("${HW}bezel-thin.svg") 12 / 12px / 0 stretch;
  background:var(--dp-glass-bb); box-shadow:0 14px 34px rgb(0 0 0 / .5); --sf-fade-edge:14px;
}
${CR} .sf-cru-row { align-items:center; min-height:54px; }
${CR} .sf-cru-card {
  box-sizing:border-box; text-align:left; border:14px solid transparent; border-image:url("${HW}bezel-thin.svg") 12 / 12px / 0 stretch;
  background:var(--dp-glass-bb); box-shadow:0 14px 30px rgb(0 0 0 / .5); color:var(--dp-ink);
}
${CR} .sf-cru-card:is(:hover, :focus-visible):not(:disabled) {
  outline:0 solid transparent !important; border-image-source:url("${HW}bezel-lit.svg"); box-shadow:0 14px 30px rgb(0 0 0 / .5), 0 10px 24px -12px var(--dp-lamp-bloom);
}
${CR} .sf-cru-card:is(:hover, :focus-visible):not(:disabled) .sf-cru-verb { color:var(--dp-lamp-hot); text-shadow:var(--dp-emit-lamp); }
${CR} .sf-cru-verb { font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 72; letter-spacing:.18em; color:var(--dp-ink-mute); }
${CR} .sf-cru-name { font-family:var(--dp-face-etch); font-variation-settings:"wght" 820, "wdth" 86; text-transform:uppercase; letter-spacing:.04em; color:var(--dp-ink); }
${CR} .sf-cru-key { display:inline-grid; place-items:center; min-width:22px; height:22px; padding:0 6px 2px; box-sizing:border-box;
  border-style:solid; border-color:transparent; border-width:3px 4px 5px; border-image:url("${HW}keycap.svg") 10 10 12 / 3px 4px 5px / 0 stretch;
  background:var(--dp-metal-3); color:var(--dp-ink-dim); font-family:var(--dp-face-etch); font-size:12px; }
${CR} .sf-cru-key:empty { display:none; }
@media (forced-colors:active) {
  ${CR} :is(.sf-cru-stage, .sf-cru-card) { border-image:none; border:1px solid CanvasText; background:Canvas; box-shadow:none; }
  ${CRD} .fh-key.fh-key--hazard { background:ButtonFace; }
}
`;

/* ── THE LAST OLD PANELS — the claim registry (base) and any screen still on the old menu plate,
   and the operations board (automation). They spoke the retired blue menu vocabulary: their
   tokens now resolve to the deckplate (amber for what you act on, bone for information and good
   news, red for threat — no blue, no green, no cyan); the panel is glass in the fastened bezel with
   no backdrop blur; cards are glass wells; buttons are keycaps; the tabs are one selector track. ── */
const OLDP = 'html body #screens .screen.sf-menu:not(.k-screen)';
const AU = 'html body #screens #sf-automation';
const BS = 'html body #screens #sf-base';
const LEGACY = `
${OLDP}, ${AU} {
  --panel:#0d1116; --panel-2:#151a21; --panel-edge:rgb(232 226 212 / .12); --panel-edge-2:rgb(232 226 212 / .22);
  --ink:var(--dp-ink); --ink-dim:var(--dp-ink-dim); --ink-mute:var(--dp-ink-mute);
  --accent:var(--dp-lamp); --accent-2:var(--dp-lamp-hot); --accent-3:var(--dp-lamp);
  --good:#d8d2c4; --warn:var(--dp-lamp-hot); --danger:var(--dp-danger-hot);
  --mono:var(--dp-face-read); --mf-display:var(--dp-face-etch); --mf-ui:var(--dp-face-read); --mf-line-2:rgb(232 226 212 / .16);
  --sf-display-face:var(--dp-face-etch); --sf-body-face:var(--dp-face-read); --sf-data-face:var(--dp-face-read);
  border:14px solid transparent; border-image:url("${HW}bezel.svg") 30 / 30px / 0 stretch; border-radius:0;
  background:var(--dp-glass-bb); box-shadow:var(--dp-stand-off); -webkit-backdrop-filter:none; backdrop-filter:none;
}
/* Asteroid Works keeps its own warm law palette; only its green and its typewriter numerals go: the
   charge reads in bone, figures in the reading face (tabular) */
html body #screens .ast-screen { --aw-mint:#d8d2c4; --aw-sky:#c9c4b6; --aw-mono:var(--dp-face-read); }
/* cards and wells */
${BS} :is(.base-plan, .base-slot, .base-spec, .base-ledger, .base-mod),
${AU} :is(.au-next, .au-summary, .au-metric, .au-card, .au-income, .au-outpost-flow, .au-miner-ops, .au-empty) {
  border:0; border-radius:3px; background:var(--dp-glass-solid); box-shadow:var(--dp-glass-depth); transform:none; translate:none;
}
${BS} :is(.base-slot, .base-spec, .base-mod):hover, ${AU} :is(.au-metric, .au-card):hover {
  transform:none; translate:none; background:var(--dp-glass-solid); box-shadow:var(--dp-glass-depth), inset 0 0 0 1px rgb(232 226 212 / .1);
}
${BS} .base-slot.empty, ${AU} .au-empty {
  background:repeating-linear-gradient(135deg, rgb(255 255 255 / .022) 0 6px, transparent 6px 12px), var(--dp-glass-solid); color:var(--dp-ink-mute);
}
${BS} .base-spec.active { background:${EDGE_LIT}, ${LIFT_LIT}, var(--dp-glass-solid); box-shadow:var(--dp-glass-depth); }
${BS} .base-plan--warn { box-shadow:var(--dp-glass-depth), inset 3px 0 0 var(--dp-lamp); }
${BS} .base-plan--bad { box-shadow:var(--dp-glass-depth), inset 3px 0 0 var(--dp-danger); }
${BS} .base-plan--ok { box-shadow:var(--dp-glass-depth), inset 3px 0 0 #d8d2c4; }
${AU} .au-next { box-shadow:var(--dp-glass-depth), inset 3px 0 0 var(--dp-lamp); }
${BS} .base-ledger-cell { border-left:2px solid rgb(232 226 212 / .22); }
/* type */
${BS} .base-title, ${AU} .au-title {
  font-family:var(--dp-face-display); font-variation-settings:"wght" 900, "wdth" 125; font-weight:inherit;
  font-size:clamp(22px, min(1.8vw, 3.2vh), 32px); letter-spacing:.05em; text-transform:uppercase; color:var(--dp-ink);
}
${AU} .au-title::before { width:8px; height:8px; border-radius:50%; background:radial-gradient(circle at 42% 34%, #fff6df, var(--dp-lamp-hot) 30%, var(--dp-lamp) 60%, var(--dp-lamp-dim)); box-shadow:0 0 8px var(--dp-lamp-bloom); }
${BS} :is(.base-plan-k, .base-ledger-k), ${AU} :is(.au-kicker, .au-section-h, .au-metric .k, .au-flow-k, .au-income .lbl, .au-program-label) {
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 72; font-weight:inherit; letter-spacing:.16em; color:var(--dp-ink-mute);
}
${BS} .base-sec-h { font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 72; letter-spacing:.2em; color:var(--dp-ink-mute); }
${BS} .base-plan--warn .base-plan-k { color:var(--dp-lamp-hot); }
${BS} .base-spec .verb { color:var(--dp-lamp-hot); }
${BS} .base-spec .effect { color:var(--dp-ink); }
${BS} .base-spec .risk { color:var(--dp-ink-dim); }
${BS} :is(.base-slot .nm, .base-spec .nm, .base-mod .nm, .base-plan-title), ${AU} :is(.au-next-title, .au-card .nm) {
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 780, "wdth" 84; font-weight:inherit; letter-spacing:.04em; text-transform:uppercase; color:var(--dp-ink);
}
${AU} .au-section-h { border-bottom:0; background:linear-gradient(180deg, rgb(0 0 0 / .55) 0 1px, rgb(255 236 204 / .06) 1px 2px) left bottom / 100% 2px no-repeat; }
${AU} .au-head { border-bottom:0; background:linear-gradient(180deg, rgb(0 0 0 / .55) 0 1px, rgb(255 236 204 / .06) 1px 2px) left bottom / 100% 2px no-repeat; }
${AU} .au-credits { border:0; border-radius:3px; background:var(--dp-glass-solid); box-shadow:var(--dp-glass-depth); color:var(--dp-ink); }
/* meters */
${AU} :is(.au-capbar, .au-storebar, .au-minibar) { border:0; border-radius:1px; background:rgb(0 0 0 / .55); box-shadow:inset 0 1px 1px rgb(0 0 0 / .8), 0 1px 0 rgb(255 236 204 / .07); }
${AU} .au-capfill { background:linear-gradient(180deg, var(--dp-lamp-hot), var(--dp-lamp)); box-shadow:0 0 8px var(--dp-lamp-bloom); }
${AU} .au-minibar > i { background:linear-gradient(180deg, #f3eee3, #c9c4b6); }
/* chips */
${AU} :is(.au-pill, .au-program-badge) { border:0; border-radius:2px; background:rgb(0 0 0 / .32); box-shadow:inset 0 0 0 1px rgb(232 226 212 / .14);
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 74; letter-spacing:.14em; color:var(--dp-ink-dim); }
${AU} .au-pill.warn { color:var(--dp-lamp-hot); box-shadow:inset 0 0 0 1px rgb(255 217 140 / .35); background:rgb(0 0 0 / .32); }
${AU} .au-pill.bad { color:var(--dp-danger-hot); box-shadow:inset 0 0 0 1px rgb(255 80 56 / .4); background:rgb(0 0 0 / .32); }
${AU} .au-pill.ok { color:var(--dp-ink); background:rgb(0 0 0 / .32); }
/* the tabs: one recessed selector track */
${AU} .au-tabs { gap:3px; padding:3px; border:0; border-radius:3px; background:linear-gradient(180deg, rgb(0 0 0 / .5), rgb(0 0 0 / .28)); box-shadow:inset 0 1px 3px rgb(0 0 0 / .85), 0 1px 0 rgb(255 236 204 / .07); }
${AU} .au-tab { min-height:30px; border:0; border-radius:2px; background:linear-gradient(180deg, #232830, #191d24); box-shadow:inset 0 1px 0 rgb(255 236 204 / .07);
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 74; font-weight:inherit; letter-spacing:.14em; color:var(--dp-ink-dim); }
${AU} .au-tab:hover { color:var(--dp-ink); background:linear-gradient(180deg, #2a2f37, #1e222a); }
${AU} .au-tab:focus-visible { outline:0 solid transparent !important; color:var(--dp-ink); background:linear-gradient(var(--dp-lamp), var(--dp-lamp)) 0 0 / 2px 100% no-repeat, linear-gradient(180deg, #2a2f37, #1e222a); }
${AU} .au-tab.active { color:var(--dp-lamp-hot); text-shadow:var(--dp-emit-lamp); background:linear-gradient(var(--dp-lamp), var(--dp-lamp)) 0 0 / 2px 100% no-repeat, linear-gradient(180deg, #2c3139, #20252d);
  box-shadow:inset 0 0 0 1px rgb(255 217 140 / .3), 0 8px 14px -10px var(--dp-lamp-bloom); }
/* verbs: keycaps; the one primary lit, a recall the hazard kind */
${dpKey(`${AU} :is(.au-close, .au-cta, .au-card button, .au-outpost-detail button)`)}
${dpKey(`${BS} button.sf-btn`)}
${AU} :is(.au-cta, .au-card button.au-buy):not(:disabled), ${BS} button.sf-btn.sf-btn--primary:not(:disabled) {
  color:var(--dp-lamp-hot); text-shadow:var(--dp-emit-lamp);
  background:${KEY_LED_ON_BB.replace('11px 50%', '17px 50%')}, var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-metal-3);
  box-shadow:inset 0 0 0 1px rgb(255 217 140 / .5), inset 0 -8px 16px -10px var(--dp-lamp-bloom), 0 0 18px rgb(242 185 80 / .16);
}
${AU} .au-card button.au-recall:is(:hover, :focus-visible):not(:disabled) {
  color:var(--dp-danger-hot); text-shadow:0 0 12px var(--dp-danger-bloom);
  background:${KEY_LED_RED_BB.replace('11px 50%', '17px 50%')}, var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-metal-3);
  box-shadow:inset 0 0 0 1px rgb(255 80 56 / .45), 0 8px 16px -10px var(--dp-danger-bloom);
}
${AU} .au-program { border:0; border-radius:3px; background:var(--dp-glass-solid); box-shadow:var(--dp-glass-depth); color:var(--dp-ink); }
${AU} .au-outpost-detail summary { color:var(--dp-lamp-hot); }
@media (forced-colors:active) {
  ${OLDP}, ${AU} { border-image:none; border:1px solid CanvasText; background:Canvas; }
  ${BS} :is(.base-plan, .base-slot, .base-spec, .base-ledger, .base-mod), ${AU} :is(.au-next, .au-summary, .au-metric, .au-card, .au-income, .au-outpost-flow, .au-miner-ops, .au-empty) {
    background:Canvas; border:1px solid CanvasText; box-shadow:none;
  }
  ${AU} .au-tab.active { outline:2px solid Highlight !important; }
}
`;

export const DECKPLATE_SCREENS_CSS = WORDS + PAUSE + FH_BRIDGE + MISSIONLOG + GAMEOVER + HELP + TITLE + SETTINGS + SHELL + CHART + SELECTION + SHIP + RANGE + CRUCIBLE + LEGACY;
