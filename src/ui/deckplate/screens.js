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

const FH_BRIDGE = `
/* ══ FH → DECKPLATE BRIDGE (FRONTEND_PROGRAM Wave 2, 2026-09-19) ════════════════════════════════
   The shell screens (new game, load/save, help, credits, codex, research, achievements) are built
   from the Field Hardware vocabulary: .fh-plate, .fh-key, .fh-row, .fh-input, .fh-tile, .fh-light.
   This maps that vocabulary onto the deckplate materials once. GEOMETRY IS THE KIT'S: every border
   width stays exactly the fh value, so no content box on any screen moves; only what is painted in
   those borders changes — brown bench plates become smoked glass in a thin machined bezel, sprite
   keys become keycaps with a lamp, tabs become lit legends, rows take the one selection language.
   The fh colour tokens resolve to the deckplate ones. */
html body #screens {
  --fh-legend:var(--dp-lamp); --fh-legend-now:var(--dp-lamp-hot);
  --fh-text:var(--dp-ink); --fh-text-resting:var(--dp-ink-dim); --fh-text-tertiary:var(--dp-ink-mute);
  --dp-glass-bb:var(--dp-glass-spec) border-box, var(--dp-glass-fall) border-box,
    var(--dp-tex-smudge) 0 0 / 512px repeat border-box, linear-gradient(180deg, #151a21, #090c10) border-box;
}
/* panels: a thin machined bezel ring on the plate's outer edge, smoked glass under it */
html body #screens :is(.fh-plate, .fh-window) {
  border-style:solid; border-color:transparent;
  border-image:url("${HW}bezel-thin.svg") 12 / 12px / 0 stretch;
  background:var(--dp-glass-bb);
  box-shadow:0 12px 30px rgb(0 0 0 / .45);
  color:var(--dp-ink);
}
html body #screens .fh-plate { border-width:24px; }
html body #screens .fh-window { border-width:20px; }
/* a sunk plate is a glass well: the plate's border stays as air, the well wears the rim and lip */
html body #screens .fh-plate.fh-plate--sunk {
  border-image:none; background:var(--dp-glass-solid); box-shadow:var(--dp-glass-depth);
}
/* the paper plate was a tan card: glass like every other panel, its ink bone */
html body #screens .fh-plate.fh-plate--paper { color:var(--dp-ink); }
html body #screens .fh-plate.fh-plate--edge {
  border-width:16px; border-image:url("${HW}bezel-thin.svg") 12 / 10px / 0 stretch;
  background:var(--dp-metal-layers), var(--dp-metal-2);
}
html body #screens .fh-rail {
  border-width:16px; border-style:solid; border-color:transparent; border-image:url("${HW}bezel-thin.svg") 12 / 8px / 0 stretch;
  background:var(--dp-metal-layers), linear-gradient(90deg, #232833, #171b22);
}
/* keys: keycap hardware on the key's edge, brushed metal cap, the lamp set in the cap's border */
html body #screens .fh-key {
  border-style:solid; border-color:transparent; border-width:18px;
  border-image:url("${HW}keycap.svg") 10 10 12 / 8px 10px 10px / 0 stretch;
  background:${KEY_LED_OFF_BB}, var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-metal-3);
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 760, "wdth" 78; letter-spacing:.14em;
  color:var(--dp-ink); text-shadow:0 -1px 0 rgb(0 0 0 / .7);
  transition:color var(--dp-d-cut) var(--dp-ease-lamp), box-shadow var(--dp-d-cut) var(--dp-ease-lamp);
}
html body #screens .fh-key:is(:hover, :focus-visible) {
  border-image-source:url("${HW}keycap.svg"); color:var(--dp-lamp-hot); text-shadow:var(--dp-emit-lamp);
  background:${KEY_LED_ON_BB}, var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-metal-3);
  box-shadow:inset 0 0 0 1px rgb(255 217 140 / .35), 0 8px 16px -10px var(--dp-lamp-bloom);
}
html body #screens .fh-key:active { border-image-source:url("${HW}keycap-pressed.svg"); }
html body #screens :is(.fh-key:disabled, .fh-key[aria-disabled='true']) {
  border-image-source:url("${HW}keycap.svg"); color:var(--dp-ink-mute); text-shadow:none; box-shadow:none; filter:saturate(.6) brightness(.85);
  background:${KEY_LED_OFF_BB}, var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-metal-3);
}
/* the screen's one primary command wears the selection language permanently */
html body #screens .fh-key.fh-key--primary {
  border-image-source:url("${HW}keycap.svg"); color:var(--dp-lamp-hot); text-shadow:var(--dp-emit-lamp);
  background:${KEY_LED_ON_BB}, var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-metal-3);
  box-shadow:inset 0 0 0 1px rgb(255 217 140 / .5), inset 0 -8px 16px -10px var(--dp-lamp-bloom), 0 0 18px rgb(242 185 80 / .16);
}
html body #screens .fh-key.fh-key--primary:is(:hover, :focus-visible) { filter:brightness(1.1); }
/* a destructive key: bone at rest, the lamp driven red under the hand */
html body #screens .fh-key.fh-key--hazard { border-image-source:url("${HW}keycap.svg"); }
html body #screens .fh-key.fh-key--hazard:is(:hover, :focus-visible) {
  color:var(--dp-danger-hot); text-shadow:0 0 12px var(--dp-danger-bloom);
  background:${KEY_LED_RED_BB}, var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-metal-3);
  box-shadow:inset 0 0 0 1px rgb(255 80 56 / .45), 0 8px 16px -10px var(--dp-danger-bloom);
}
html body #screens .fh-key.fh-key--small { border-width:12px; border-image:url("${HW}keycap.svg") 10 10 12 / 6px 7px 8px / 0 stretch; }
/* a key-binding cap is a legend, not a command: metal, no lamp */
html body #screens .fh-key.fh-key--small, html body #screens .fh-key.fh-key--small:is(:hover, :focus-visible) {
  background:var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-metal-3); color:var(--dp-ink); text-shadow:0 -1px 0 rgb(0 0 0 / .7); box-shadow:none;
}
/* tabs: navigation legends, not commands — the lamp in the legend's own border, the open one lit */
html body #screens .fh-key.fh-key--legend {
  position:relative; border-width:14px; border-image:none; border-color:transparent; border-radius:2px;
  background:none; font-variation-settings:"wght" 760, "wdth" 78; letter-spacing:.16em; color:var(--dp-ink-dim); text-shadow:none; box-shadow:none;
}
html body #screens .fh-key.fh-key--legend::before {
  content:""; position:absolute; left:-10px; top:50%; width:8px; height:8px; margin-top:-4px; border-radius:50%;
  background:radial-gradient(circle at 42% 36%, #3b352c, #17140f 70%); box-shadow:inset 0 1px 1.5px rgb(0 0 0 / .85), 0 0 0 1px rgb(0 0 0 / .6);
}
html body #screens .fh-key.fh-key--legend:is(:hover, :focus-visible) {
  border-image:none; color:var(--dp-ink); background:linear-gradient(90deg, rgb(255 255 255 / .05), transparent 80%); box-shadow:none;
}
html body #screens .fh-key.fh-key--legend:is([aria-selected='true'], [aria-current='true'], [aria-pressed='true'], .is-lit) {
  border-image:none; color:var(--dp-lamp-hot); text-shadow:var(--dp-emit-lamp);
  background:linear-gradient(90deg, rgb(255 238 210 / .08), transparent 80%);
  box-shadow:inset 0 -2px 0 var(--dp-lamp), 0 10px 16px -12px var(--dp-lamp-bloom);
}
html body #screens .fh-key.fh-key--legend:is([aria-selected='true'], [aria-current='true'], [aria-pressed='true'], .is-lit)::before {
  background:radial-gradient(circle at 42% 34%, #fff6df 0%, var(--dp-lamp-hot) 22%, var(--dp-lamp) 55%, var(--dp-lamp-dim) 100%);
  box-shadow:0 0 6px var(--dp-lamp-bloom), 0 0 14px var(--dp-lamp-bloom-soft);
}
/* choice rows (a words row that borrows the pause list: starter, difficulty): a recessed selector
   track, each choice a segment, the chosen segment itself lit (no lamp outside it) */
html body #screens .k-words--row .fh-key.fh-key--legend::before { display:none; }
html body #screens .k-words.k-words--row.of-pause {
  display:inline-flex; flex-wrap:wrap; gap:3px; width:max-content; max-width:100%; padding:3px; border-radius:3px;
  background:linear-gradient(180deg, rgb(0 0 0 / .5), rgb(0 0 0 / .28)); box-shadow:inset 0 1px 3px rgb(0 0 0 / .85), 0 1px 0 rgb(255 236 204 / .07);
}
html body #screens .k-words.k-words--row.of-pause .fh-key.fh-key--legend {
  background:linear-gradient(180deg, #232830, #191d24) padding-box; box-shadow:inset 0 1px 0 rgb(255 236 204 / .07);
}
html body #screens .k-words.k-words--row.of-pause .fh-key.fh-key--legend:is([aria-selected='true'], [aria-current='true'], [aria-pressed='true'], .is-lit) {
  background:linear-gradient(180deg, #2c3139, #20252d) padding-box;
  box-shadow:inset 0 0 0 1px rgb(255 217 140 / .3), inset 0 -2px 0 var(--dp-lamp), 0 8px 14px -10px var(--dp-lamp-bloom);
}
/* rows: etched hairlines; the selected row lights like every deckplate row (and keeps its box) */
html body #screens .fh-row {
  background-image:linear-gradient(180deg, rgb(0 0 0 / .55) 0 1px, rgb(255 236 204 / .06) 1px 2px);
  background-size:100% 2px; background-repeat:no-repeat; background-position:left top;
}
html body #screens .fh-row.is-selected {
  border-width:0; border-image:none; color:var(--dp-lamp-hot);
  background:linear-gradient(90deg, rgb(255 238 210 / .07), transparent 70%);
  box-shadow:inset 3px 0 0 var(--dp-lamp), inset 0 0 0 1px rgb(255 217 140 / .18);
}
html body #screens .fh-hairline { height:4px; border:0; background:linear-gradient(180deg, rgb(0 0 0 / .55) 0 1px, rgb(255 236 204 / .06) 1px 2px) left center / 100% 2px no-repeat; }
html body #screens .fh-legend[data-fh-lit="on"] { color:var(--dp-lamp); }
/* hero readouts in a corner plate are information: bone, not the lamp */
html body #screens .k-corner .k-hero__n { color:var(--dp-ink); text-shadow:var(--dp-emit); }
html body #screens .k-corner .k-hero__w { font-family:var(--dp-face-etch); color:var(--dp-ink-mute); }
/* selects: a glass readout in a thin bezel with an etched chevron */
html body #screens select.k-select {
  -webkit-appearance:none; appearance:none; min-height:36px; padding:0 34px 0 12px; border-radius:0;
  border:5px solid transparent; border-image:url("${HW}bezel-thin.svg") 12 / 12px / 0 stretch;
  background:
    linear-gradient(135deg, transparent 45%, var(--dp-ink-dim) 45% 55%, transparent 55%) calc(100% - 17px) 50% / 7px 7px no-repeat,
    linear-gradient(45deg, transparent 45%, var(--dp-ink-dim) 45% 55%, transparent 55%) calc(100% - 12px) 50% / 7px 7px no-repeat,
    var(--dp-glass-solid), var(--dp-metal-layers), var(--dp-metal-2);
  color:var(--dp-ink); font-family:var(--dp-face-read);
}
html body #screens select.k-select option { background:#12161c; color:var(--dp-ink); }
/* inputs: a glass readout in a thin bezel; focus lights its rim */
html body #screens .fh-input {
  border-style:solid; border-color:transparent; border-width:12px;
  border-image:url("${HW}bezel-thin.svg") 12 / 12px / 0 stretch;
  background:var(--dp-glass-bb); color:var(--dp-ink); font-family:var(--dp-face-read);
}
html body #screens .fh-input:focus-visible { box-shadow:inset 0 0 0 1px var(--dp-lamp), 0 0 12px var(--dp-lamp-bloom-soft); }
/* tiles: keyart framed as a glass card; the chosen one lit */
html body #screens .fh-tile {
  border-style:solid; border-color:transparent; border-width:20px;
  border-image:url("${HW}bezel-thin.svg") 12 / 12px / 0 stretch; background:var(--dp-glass-bb);
}
html body #screens .fh-tile[aria-selected='true'] {
  border-image-source:url("${HW}bezel-thin.svg"); color:var(--dp-lamp-hot);
  box-shadow:inset 0 0 0 1px rgb(255 217 140 / .45), inset 0 -3px 0 var(--dp-lamp), 0 10px 20px -12px var(--dp-lamp-bloom);
}
html body #screens .fh-tile-legend { font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 70; }
/* lights: the deckplate lens */
html body #screens .fh-light {
  border-radius:50%; width:9px; height:9px;
  background:radial-gradient(circle at 42% 34%, #fff6df 0%, var(--dp-lamp-hot) 22%, var(--dp-lamp) 55%, var(--dp-lamp-dim) 100%);
  box-shadow:0 0 6px var(--dp-lamp-bloom), 0 0 0 1px #06080a;
}
html body #screens .fh-light:is([data-level='off'], [data-level='dim']) {
  background:radial-gradient(circle at 42% 36%, #3b352c, #17140f 70%); box-shadow:inset 0 1px 1.5px rgb(0 0 0 / .85), 0 0 0 1px #06080a;
}
html body #screens .fh-light[data-colour='wanted'] { background:radial-gradient(circle at 42% 34%, #fff1ea, var(--dp-danger-hot) 26%, var(--dp-danger) 60%, #6b1a10); box-shadow:0 0 6px var(--dp-danger-bloom), 0 0 0 1px #06080a; }
html body #screens .fh-light:is([data-colour='good'], [data-colour='cold']) { background:radial-gradient(circle at 42% 34%, #fffaf0 0%, #d8d2c4 45%, #6b675d 100%); box-shadow:0 0 5px rgb(232 226 212 / .25), 0 0 0 1px #06080a; }
/* type: the display face for titles, the etched condensed voice for legends */
html body #screens .fh-title { font-family:var(--dp-face-display); font-variation-settings:"wght" 900, "wdth" 125; color:var(--dp-ink); text-shadow:0 -1px 0 rgb(0 0 0 / .8), 0 1px 0 rgb(255 236 204 / .12); }
html body #screens .fh-legend { font-family:var(--dp-face-etch); color:var(--dp-ink-mute); text-shadow:var(--dp-etch-shadow); }
@media (prefers-reduced-motion:reduce) { html body #screens .fh-key { transition:none; } }
@media (forced-colors:active) {
  html body #screens :is(.fh-plate, .fh-window, .fh-rail, .fh-key, .fh-input, .fh-tile) {
    border-image:none; border-color:CanvasText; background:Canvas; color:CanvasText; box-shadow:none; filter:none;
  }
  html body #screens :is(.fh-key:is(:hover, :focus-visible), .fh-key--legend:is([aria-selected='true'], [aria-pressed='true'], .is-lit), .fh-row.is-selected, .fh-tile[aria-selected='true']) {
    outline:2px solid Highlight; background:Canvas; color:CanvasText;
  }
  html body #screens .fh-light, html body #screens .fh-key--legend::before { forced-color-adjust:none; background:CanvasText; box-shadow:none; }
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
${sel}:active { border-image-source:url("${HW}keycap-pressed.svg"); }
${sel}.k-word--danger { color:var(--dp-ink-dim); }
${sel}.k-word--danger:is(:hover, :focus-visible) {
  color:var(--dp-danger-hot); text-shadow:0 0 12px var(--dp-danger-bloom);
  background:${KEY_LED_RED_BB.replace('11px 50%', '17px 50%')}, var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-metal-3);
  box-shadow:inset 0 0 0 1px rgb(255 80 56 / .45), 0 8px 16px -10px var(--dp-danger-bloom);
}
${sel}:is([aria-disabled='true'], :disabled) { color:var(--dp-ink-mute); text-shadow:none; box-shadow:none; filter:saturate(.6) brightness(.85); }
@media (prefers-reduced-motion:reduce) { ${sel} { transition:none; } }
@media (forced-colors:active) {
  ${sel} { border-image:none; border:1px solid ButtonText; background:ButtonFace; color:ButtonText; box-shadow:none; filter:none; }
  ${sel}:is(:hover, :focus-visible, .k-word--primary, [aria-pressed='true']) { outline:2px solid Highlight; }
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
  font-family:var(--dp-face-display); font-variation-settings:"wght" 860, "wdth" 110; text-transform:uppercase;
  font-size:clamp(26px, min(2.5vw, 4.6vh), 48px); line-height:1; letter-spacing:.03em; color:var(--dp-ink); text-shadow:var(--dp-emit);
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
    linear-gradient(180deg, rgb(4 5 8 / .72), rgb(4 5 8 / .88));
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
  font-family:var(--dp-face-display); font-variation-settings:"wght" 820, "wdth" 100; letter-spacing:-.01em;
  color:var(--dp-ink); text-shadow:var(--dp-emit);
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
    linear-gradient(90deg, transparent calc(var(--fht-rail-w) + 6px), var(--dp-lamp) calc(var(--fht-rail-w) + 6px) calc(var(--fht-rail-w) + 9px), transparent calc(var(--fht-rail-w) + 9px)) 0 22% / 100% 56% no-repeat,
    linear-gradient(90deg, transparent calc(var(--fht-rail-w) + 9px), rgb(255 238 210 / .07) calc(var(--fht-rail-w) + 9px), transparent 70%);
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

export const DECKPLATE_SCREENS_CSS = WORDS + PAUSE + FH_BRIDGE + MISSIONLOG + GAMEOVER + HELP + TITLE + SETTINGS;
