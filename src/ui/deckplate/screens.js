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
#screens .of-pause.k-screen {
  background:
    radial-gradient(90% 60% at 0% 0%, rgb(255 224 178 / .07), transparent 60%),
    var(--dp-tex-scratch) 0 0 / 1024px repeat,
    var(--dp-tex-brushed) 0 0 / 512px repeat,
    var(--dp-tex-grain) 0 0 / 256px repeat,
    linear-gradient(180deg, #1b2028, #12161c 55%, #0d1015);
  border-image:url("${HW}bezel.svg") 30 / 30px / 0 stretch;
  border-width:0 14px 0 0; border-style:solid; border-color:transparent;
  box-shadow:18px 0 40px rgb(0 0 0 / .55);
  --ofp-row-h:clamp(30px, min(3vw, 3.4vh), 38px);
}
#screens .of-pause.k-screen::before { opacity:0; }
#screens .of-pause .k-t-title {
  font-family:var(--dp-face-display); font-variation-settings:"wght" 900, "wdth" 125;
  color:var(--dp-ink); letter-spacing:.05em;
  text-shadow:0 -1px 0 rgb(0 0 0 / .8), 0 1px 0 rgb(255 236 204 / .12);
}
/* The flight brief is its own instrument: a glass pane beside the bulkhead, over the held world,
   so the verb column keeps the full height of the frame (22 rows with their group legends). */
#screens .of-pause .k-title { position:static; }
#screens .of-pause .sf-pause-brief {
  position:absolute; left:calc(100% + clamp(24px, 2.4vw, 48px)); top:clamp(26px, 4.6vh, 76px);
  width:min(520px, calc(96vw - 100% - 48px)); margin:0; box-sizing:border-box;
  border:10px solid transparent; border-image:none; border-radius:0;
  background:var(--dp-glass-layers);
  -webkit-backdrop-filter:var(--dp-glass-see); backdrop-filter:var(--dp-glass-see);
  box-shadow:var(--dp-stand-off), var(--dp-glass-depth);
  padding:14px 18px 14px;
}
#screens .of-pause .sf-pause-brief::before {
  content:""; position:absolute; inset:-10px; box-sizing:border-box; pointer-events:none;
  border:10px solid transparent; border-image:url("${HW}bezel.svg") 30 / 22px / 0 stretch;
  background:var(--dp-metal-layers), var(--dp-metal-2);
  -webkit-mask:linear-gradient(#000 0 0) padding-box, linear-gradient(#000 0 0);
  -webkit-mask-composite:xor; mask-composite:exclude;
}
@media (max-width:1100px) {
  #screens .of-pause .sf-pause-brief { position:static; width:auto; margin-top:10px; backdrop-filter:none; background:var(--dp-glass-solid); }
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
/* Verbs: LED pip, icon, label, key cap. The lit row is an edge light on the glass, not a plate. */
#screens .of-pause .k-word {
  border:0; border-image:none; border-radius:2px;
  background:${LED_OFF};
  padding:0 10px 0 26px; min-height:var(--ofp-row-h);
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 88;
  font-size:var(--ofp-menu-size); letter-spacing:.1em; color:var(--dp-ink-dim);
  transition:color var(--dp-d-cut) var(--dp-ease-lamp), background var(--dp-d-cut) var(--dp-ease-lamp), box-shadow var(--dp-d-cut) var(--dp-ease-lamp);
}
#screens .of-pause .k-word:is(:hover, :focus-visible),
#screens .of-pause .k-words:not(:focus-within) .k-word[aria-current='true']:not(.k-word--primary) {
  color:var(--dp-ink); border-image-source:none;
  background:${LED_ON}, linear-gradient(90deg, rgb(255 255 255 / .06), rgb(255 255 255 / .015) 70%, transparent);
  box-shadow:inset 3px 0 0 var(--dp-lamp), 0 10px 18px -14px var(--dp-lamp-bloom);
}
#screens .of-pause .k-word:focus-visible { outline:2px solid var(--dp-lamp); outline-offset:2px; }
/* Resume: the one primary verb is a backlit amber key. */
#screens .of-pause .k-word--primary {
  color:#1c1307; font-variation-settings:"wght" 860, "wdth" 110; text-shadow:0 1px 0 rgb(255 240 210 / .35);
  background:linear-gradient(180deg, rgb(255 255 255 / .3), transparent 45%), linear-gradient(180deg, #ffe0a0, var(--dp-lamp) 52%, #b98029);
  box-shadow:0 0 22px var(--dp-lamp-bloom-soft), 0 0 5px var(--dp-lamp-bloom), inset 0 1px 0 rgb(255 250 235 / .6), inset 0 -2px 0 rgb(0 0 0 / .25);
  margin-bottom:6px; padding-left:14px;
}
#screens .of-pause .k-word--primary:is(:hover, :focus-visible) {
  color:#120b03; filter:brightness(1.06);
  background:linear-gradient(180deg, rgb(255 255 255 / .3), transparent 45%), linear-gradient(180deg, #ffe0a0, var(--dp-lamp) 52%, #b98029);
  box-shadow:0 0 26px var(--dp-lamp-bloom), inset 0 1px 0 rgb(255 250 235 / .6);
}
#screens .of-pause .k-word--primary[data-icon]::before { opacity:1; }
/* Exits: the lamp driven red, and a hazard band on the group head. */
#screens .of-pause .k-word--danger { color:var(--dp-ink-dim); }
#screens .of-pause .k-word--danger:is(:hover, :focus-visible) {
  color:var(--dp-danger-hot);
  background:${LED_RED}, linear-gradient(90deg, rgb(255 80 56 / .08), transparent 70%);
  box-shadow:inset 3px 0 0 var(--dp-danger), 0 10px 18px -14px var(--dp-danger-bloom);
}
#screens .of-pause .k-words__group[data-hazard], #screens .of-pause .k-words__group:last-of-type { color:var(--dp-ink-mute); }
#screens .of-pause .k-word.k-38 { color:var(--dp-ink-mute); }
#screens .of-pause .k-fine { color:var(--dp-ink-mute); font-family:var(--dp-face-etch); }
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
  #screens .of-pause .k-word { background:none; box-shadow:none; }
  #screens .of-pause .k-word:is(:hover, :focus-visible) { outline:2px solid Highlight; }
  #screens :is(.of-pause) .k-word[data-icon]::before { forced-color-adjust:none; background:CanvasText; }
  #screens :is(.of-pause) .k-word[data-hint]::after { border-image:none; border:1px solid CanvasText; background:Canvas; color:CanvasText; }
}
`;

export const DECKPLATE_SCREENS_CSS = WORDS + PAUSE;
