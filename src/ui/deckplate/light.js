// Deckplate LIGHT — the second substance.
//
// design/frontend/ONE_PHOTOGRAPH.md: everything on the screen is either the machine or the light it
// throws. `materials.js` and `hardware.js` are the machine. This is the light.
//
//   dp-veil      the only permitted occlusion — a gradient that reaches the frame edge and has no
//                inner boundary. It replaces the panel, which is dead.
//   dp-lit       a menu whose items are WORDS OF LIGHT rather than machined plates. The bench
//                variant (dp-menu, in layout.js) stays for weight >= 0.5 screens; a poster or a
//                utility screen uses this.
//   dp-attend    the attention lamp. Focus is a light source that lights its NEIGHBOURHOOD with
//                falloff, not a ring drawn around one item.
//   dp-mark      a produced SVG mark rendered as relief — a cast badge under the shared key, not
//                an icon. 44 marks and a logotype are on disk; one was wired.
//   dp-read      a phosphor reading: the cool ink, for what you READ as opposed to what you can do.
//
// Every one of these is vector or computed, so it is resolution-independent, and every one has a
// forced-colours and a reduced-motion form.

export const DECKPLATE_LIGHT_CSS = `
/* ══════════════════════════════════════════════════════════════════════════════════════════════
   1. dp-veil — occlusion without a box.

   A panel is a rectangle of darkening with a visible inner edge. The test on a screenshot: can you
   point to where the dark starts? If you can, it is a panel. A veil reaches the frame edge, so
   there is nowhere for an edge to be, and the world is darkened FOR the words rather than hidden
   behind a card. It is pointer-events:none and aria-hidden — it is light, not furniture.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
.dp-veil {
  position:absolute; inset:0; pointer-events:none; z-index:0;
  background:var(--dp-veil-lead);
}
.dp-veil--foot { background:var(--dp-veil-foot); }
.dp-veil--head { background:var(--dp-veil-head); }
.dp-veil--full { background:var(--dp-veil-full); }
/* A veil under a standing column only needs to cover the column's own width plus its falloff. */
.dp-veil--column { right:auto; width:min(94%, calc(var(--dp-col) * 2.1)); }
.dp-frame > .dp-veil { position:fixed; }
/* Everything the frame holds sits above the veil. */
.dp-frame__head, .dp-frame__body, .dp-frame__foot { position:relative; z-index:1; }
@media (forced-colors:active) { .dp-veil { display:none; } }

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   2. dp-attend — focus is a light source.

   Not a state on one item: a lamp above the focused item that lights its neighbourhood. The
   container carries --dp-focus-x/y (registered <length>, so the lamp TRAVELS rather than jumping)
   and --dp-focus-power; every child reads the same three values and its own position, and lights
   itself by distance. Move focus down a menu and the items either side warm slightly, the ones
   beyond it recede. That is the Bungie principle, and it replaces every focus ring, hover fill and
   selected-row tint in the game.

   COST, honestly: this is a style recalc and paint of the focused container's children for the
   length of the settle. It is NOT compositor work — registering a property makes it interpolable,
   not off-thread. So it is bounded to one container, it is measured before it ships on a long
   list, and it is never used in flight.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
.dp-attend {
  position:relative;
  transition:--dp-focus-x var(--dp-d-settle) var(--dp-ease-settle),
             --dp-focus-y var(--dp-d-settle) var(--dp-ease-settle),
             --dp-focus-power var(--dp-d-cut) var(--dp-ease-lamp);
}
/* The pool of light itself, on the container, behind its children. A radial at the lamp's position
   whose reach is one row-height and a half — close enough that only the neighbours are touched. */
.dp-attend::before {
  content:""; position:absolute; inset:0; pointer-events:none; z-index:0;
  background:radial-gradient(
    calc(var(--dp-row) * 5) calc(var(--dp-row) * 2.6) at var(--dp-focus-x) var(--dp-focus-y),
    rgb(255 226 178 / calc(var(--dp-focus-power) * .11)) 0%,
    rgb(255 226 178 / calc(var(--dp-focus-power) * .04)) 38%,
    transparent 72%);
  opacity:var(--dp-focus-power);
  transition:opacity var(--dp-d-cut) var(--dp-ease-lamp);
}
.dp-attend > * { position:relative; z-index:1; }

/* THE BRACKET — the second channel. Colour and light never carry focus alone: a hard 2px bone mark
   at the leading edge is always present on the focused item, and under forced colours it is the
   only thing left. */
.dp-attend [data-dp-focus]::before,
.dp-attend :is(a, button, [role="option"], [role="tab"]):focus-visible::before {
  content:""; position:absolute; left:calc(var(--dp-u) * -2); top:14%; bottom:14%;
  width:2px; background:var(--dp-ink); border-radius:1px;
}
/* THE RING COMES OFF, AND ONLY HERE. styles/accessibility.css draws a 2px ring on every
   :focus-visible in the game, and that rule is the floor for everything this system has not
   reached -- it stays. An item inside an attention lamp opts out of it because it already has a
   BETTER indicator: a hard 2px bone bracket at its leading edge that is always drawn, plus the
   pool of light around it. Never remove a ring without putting something at least as legible in
   its place; the bracket above is that something, and it survives forced colours, which the ring's
   colour does not.

   !important is load-bearing here and not laziness: hardware.js already carries
   :root :focus-visible { outline-color: var(--dp-lamp) !important }, so the ring is defended by
   an important declaration and can only be answered by one. Scoped to items that carry the
   bracket, so it can never silently strip an indicator from something the system has not reached. */
.dp-attend :is(a, button, [role="option"], [role="tab"], [tabindex]):focus-visible,
.dp-lit__item:focus-visible { outline:2px solid transparent !important; outline-offset:0 !important; }

@media (prefers-reduced-motion:reduce) {
  /* The lamp lands instead of travelling. The state is identical; only the journey is gone. */
  .dp-attend { transition-duration:1ms; }
}
@media (forced-colors:active) {
  .dp-attend::before { display:none; }
  .dp-attend [data-dp-focus]::before,
  .dp-attend :is(a, button, [role="option"], [role="tab"]):focus-visible::before { background:CanvasText; }
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   3. dp-lit — a menu of light.

   The machined menu item (dp-menu, layout.js) is the BENCH variant: correct on a station, wrong on
   a poster. On a title or a pause screen there is no hardware in front of you, so a verb is a word
   of light: no plate, no rail, no bevel. It is lit by the attention lamp and marked by the bracket.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
.dp-lit { display:flex; flex-flow:row wrap; align-items:baseline; margin:0; padding:0; list-style:none;
  column-gap:clamp(14px, 1.6vw, 26px); row-gap:calc(var(--dp-u) * 1.5); }
/* A run of verbs under a quiet etched head, and the BANK: a verb marked data-bank shares a
   wrapping row with its neighbours instead of owning one. Pause carries seventeen verbs; as
   seventeen full rows they run past the frame, and as seventeen bevelled chips they were the grid
   ONE_PHOTOGRAPH.md section 4.2 kills. Banked light is the third option: full rows for the verbs
   that matter, a wrapping line of words for the rest. Layout only -- same item, same states. */
.dp-lit > li { flex:0 0 100%; min-width:0; }
.dp-lit > li[data-bank="1"] { flex:0 0 auto; }
.dp-lit__group {
  flex:0 0 100%;
  margin:clamp(12px, 1.4vh, 20px) 0 2px;
  color:var(--dp-ink-mute);
  font-size:var(--dp-fs-etch);
  letter-spacing:.18em;
  text-transform:uppercase;
}
.dp-lit__group:first-child { margin-top:0; }
/* A banked verb is a word on a line, so it needs less air around it than a full row. */
.dp-lit > li[data-bank="1"] .dp-lit__item {
  padding-block:2px;
  font-size:calc(var(--dp-fs-menu) * .62);
  font-variation-settings:"wght" 600, "wdth" 82;
  letter-spacing:.05em;
}
.dp-lit > li[data-bank="1"] .dp-lit__item:is(:hover, :focus-visible, [aria-current="true"]) {
  font-variation-settings:"wght" 740, "wdth" 96;
}

.dp-lit__item {
  position:relative; display:flex; align-items:center; gap:calc(var(--dp-u) * 4);
  box-sizing:border-box; width:100%; border:0; background:none;
  /* styles/ui.css gives every button a 6 px radius and a hover glow (button:hover box-shadow); on a
     word of light that drew a rounded glass pill round the word. A word has neither. */
  border-radius:0; box-shadow:none;
  padding:calc(var(--dp-u) * 2) 0 calc(var(--dp-u) * 2) calc(var(--dp-u) * 2);
  color:var(--dp-ink-dim); text-align:left; text-decoration:none;
  font-family:var(--dp-face-display);
  font-variation-settings:"wght" 620, "wdth" 86;
  font-size:var(--dp-fs-menu); line-height:1; text-transform:uppercase;
  letter-spacing:.004em; cursor:pointer;
  text-shadow:0 1px 0 rgb(0 0 0 / .5), 0 0 18px rgb(0 0 0 / .35);
  transition:color var(--dp-d-cut) var(--dp-ease-lamp),
             text-shadow var(--dp-d-cut) var(--dp-ease-lamp);
}
/* Lit. The word itself is the light — it does not gain a box, it gains output. The letterform
   SNAPS to its heavier instance rather than interpolating: a width transition is layout and paint
   every frame and it reflows the column. */
.dp-lit__item:is(:hover, :focus-visible, [aria-current="true"]) {
  box-shadow:none;
  color:var(--dp-ink);
  font-variation-settings:"wght" 780, "wdth" 100;
  text-shadow:0 0 22px rgb(255 226 178 / .34), 0 0 6px rgb(255 226 178 / .22), 0 1px 0 rgb(0 0 0 / .6);
  outline:none;
}
.dp-lit__item:disabled, .dp-lit__item[aria-disabled="true"] {
  color:var(--dp-ink-mute); cursor:default; text-shadow:0 1px 0 rgb(0 0 0 / .5);
  font-variation-settings:"wght" 500, "wdth" 82;
}
.dp-lit__item:disabled:is(:hover, :focus-visible),
.dp-lit__item[aria-disabled="true"]:is(:hover, :focus-visible) {
  color:var(--dp-ink-mute); font-variation-settings:"wght" 500, "wdth" 82;
}
/* The reason a verb is dead, printed where the verb is. */
.dp-lit__note {
  font-family:var(--dp-face-read); font-variation-settings:normal; font-weight:400;
  font-size:var(--dp-fs-data); line-height:1.4; letter-spacing:0; text-transform:none;
  color:var(--dp-ink-mute); max-width:var(--dp-measure);
  margin:calc(var(--dp-u) * -1) 0 calc(var(--dp-u) * 1.5) calc(var(--dp-u) * 2);
}
.dp-lit__key { margin-left:auto; }

/* THE PRIMARY VERB. One per screen: the thing a stranger came here to do. It is the only word in
   the column that is already lit, and it is a size up -- because a menu where the one action a
   player wants weighs the same as SANDBOX is a menu that has made no decision. Its lamp is warm:
   it is something you can ACT on, not something you read. */
.dp-lit__item--primary {
  color:var(--dp-ink);
  font-size:calc(var(--dp-fs-menu) * 1.22);
  font-variation-settings:"wght" 800, "wdth" 104;
  --dp-lamp-current:.62;
  text-shadow:0 0 26px rgb(255 217 140 / .30), 0 0 8px rgb(255 217 140 / .18), 0 1px 0 rgb(0 0 0 / .6);
}
.dp-lit__item--primary:is(:hover, :focus-visible) {
  --dp-lamp-current:1;
  text-shadow:0 0 34px rgb(255 217 140 / .46), 0 0 10px rgb(255 217 140 / .28), 0 1px 0 rgb(0 0 0 / .6);
}
/* The lamp bead that marks the primary as live hardware rather than just large type. */
.dp-lit__item--primary::after {
  content:""; position:absolute; left:calc(var(--dp-u) * -4); top:50%; translate:0 -50%;
  width:7px; height:7px; border-radius:50%;
  background:var(--dp-lamp-now); box-shadow:0 0 var(--dp-lamp-halo) var(--dp-lamp-bloom);
  transition:background var(--dp-d-settle) var(--dp-ease-lamp), box-shadow var(--dp-d-settle) var(--dp-ease-lamp);
}
/* DANGER is the same lamp driven red. No second hue enters for it. */
.dp-lit__item--danger:is(:hover, :focus-visible) {
  color:var(--dp-danger-hot);
  text-shadow:0 0 22px rgb(255 80 56 / .34), 0 0 6px rgb(255 80 56 / .2), 0 1px 0 rgb(0 0 0 / .6);
}
@media (forced-colors:active) {
  .dp-lit__item--primary { color:Highlight; }
  .dp-lit__item--primary::after { background:Highlight; box-shadow:none; }
}
/* A quiet run of verbs — a footer, a bank. Same substance, one size down. */
.dp-lit--fine .dp-lit__item {
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 620, "wdth" 70;
  font-size:var(--dp-fs-etch); letter-spacing:.14em; padding:calc(var(--dp-u)) calc(var(--dp-u) * 1.5);
  width:auto; display:inline-flex;
}
.dp-lit--fine { flex-direction:row; flex-wrap:wrap; align-items:center; gap:calc(var(--dp-u) * 3); }
.dp-lit--fine .dp-lit__item:is(:hover, :focus-visible) { font-variation-settings:"wght" 760, "wdth" 78; }
@media (forced-colors:active) {
  .dp-lit__item { color:ButtonText; }
  .dp-lit__item:is(:hover, :focus-visible) { color:HighlightText; background:Highlight; }
  .dp-lit__item:disabled, .dp-lit__item[aria-disabled="true"] { color:GrayText; }
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   4. dp-mark — a produced mark, cast as relief.

   44 marks and a logotype were rendered for this game: faction crests as hex shields, mode and
   arena marks as dials, difficulty as stacked chevrons. ONE of them was wired. They are two-tone
   SVG — a body path on currentColor and an .accent path — so they can be lit rather than merely
   drawn: the body is a masked plate catching the shared key, the accent is a lamp at the item's
   own current. A crest at 240px on the factions wall is a cast badge under the sun, not an icon.

   Cheapest transformation in the direction with the largest visible return.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
.dp-mark {
  --dp-mark-size:calc(48px * var(--dp-s));
  position:relative; display:inline-block; flex:0 0 auto;
  width:var(--dp-mark-size); height:var(--dp-mark-size);
  color:var(--dp-ink-dim);
}
.dp-mark svg { position:absolute; inset:0; width:100%; height:100%; display:block; }
/* The body catches the key: a bright edge on the lit side, shade on the other. Two drop-shadows
   at one pixel are a bevel on an arbitrary silhouette — the thing a border cannot do. */
.dp-mark svg { filter:
  drop-shadow(-1px -1px 0 rgb(255 240 214 / .30))
  drop-shadow(1px 1px 0 rgb(0 0 0 / .62))
  drop-shadow(0 3px 10px rgb(0 0 0 / .5)); }
/* The accent path is the mark's lamp. */
.dp-mark .accent { fill:var(--dp-lamp-now); }
.dp-mark--lit { color:var(--dp-ink); --dp-lamp-current:1; }
.dp-mark--lit svg { filter:
  drop-shadow(-1px -1px 0 rgb(255 240 214 / .42))
  drop-shadow(1px 1px 0 rgb(0 0 0 / .66))
  drop-shadow(0 0 14px var(--dp-lamp-bloom))
  drop-shadow(0 3px 12px rgb(0 0 0 / .55)); }
.dp-mark--hero { --dp-mark-size:calc(240px * var(--dp-s)); }
.dp-mark--large { --dp-mark-size:calc(140px * var(--dp-s)); }
.dp-mark--tile { --dp-mark-size:calc(88px * var(--dp-s)); }
.dp-mark--badge { --dp-mark-size:calc(28px * var(--dp-s)); }
.dp-mark, .dp-mark svg { transition:filter var(--dp-d-settle) var(--dp-ease-lamp), color var(--dp-d-cut) var(--dp-ease-lamp); }
@media (prefers-reduced-motion:reduce) { .dp-mark, .dp-mark svg { transition-duration:1ms; } }
@media (forced-colors:active) {
  .dp-mark svg { filter:none; }
  .dp-mark { color:CanvasText; }
  .dp-mark--lit { color:Highlight; }
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   5. dp-read — the phosphor reading.

   What you READ, as opposed to what you can act on. A cool white core with a cool halo: the way a
   tube reads, and the owner's "slight neon" without a neon hue. An ink, never a stroke.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
.dp-phos {
  color:var(--dp-phos);
  font-variant-numeric:tabular-nums;
  text-shadow:var(--dp-phos-emit);
}
.dp-phos--dim { color:var(--dp-phos-dim); text-shadow:var(--dp-phos-emit-soft); }
/* The hero reading: the middle of the type ramp the system never had. The three places this game
   already does it — 18,400 / 49 / 439 — are the strongest moments on the screens they appear on. */
.dp-figure {
  font-family:var(--dp-face-display);
  font-variation-settings:"wght" 720, "wdth" 96;
  font-size:var(--dp-fs-hero); line-height:.92; letter-spacing:-.012em;
  font-variant-numeric:tabular-nums;
  color:var(--dp-phos); text-shadow:var(--dp-phos-emit);
}
.dp-figure--hero { font-size:var(--dp-fs-title); }
.dp-figure--small { font-size:var(--dp-fs-num); }
/* A figure that is a VALUE you changed, not a reading off the machine, is warm. */
.dp-figure--lamp { color:var(--dp-lamp-hot); text-shadow:0 0 12px var(--dp-lamp-bloom), 0 0 3px var(--dp-lamp-bloom); }
.dp-figure--danger { color:var(--dp-danger-hot); text-shadow:0 0 12px var(--dp-danger-bloom); }
/* The unit or the legend that rides a figure: etched, small, never competing. */
.dp-figure__unit {
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 620, "wdth" 68;
  font-size:var(--dp-fs-etch); letter-spacing:.17em; text-transform:uppercase;
  color:var(--dp-ink-mute); text-shadow:var(--dp-etch-shadow);
}
@media (forced-colors:active) {
  .dp-phos, .dp-figure { color:CanvasText; text-shadow:none; }
  .dp-figure--lamp, .dp-figure--danger { color:Highlight; text-shadow:none; }
}
`;
