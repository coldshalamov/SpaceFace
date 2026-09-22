// Deckplate — the SpaceFace design system. Tokens first: every surface assembles these, nothing
// hand-mixes a colour, a radius, a duration or a font size of its own.
//
// TASTE LAW (owner signals of record, 2026-09-18 reset — the only two that exist):
//   1. The one praised artifact: "real rock texture, warm directional light, a physical machine,
//      almost no chrome" → materials and light over decoration.
//   2. "A bit generic and simple for an A-list spaceship game."
// Everything below follows from those two sentences and nowhere else.
//
// THE LANGUAGE. The flight deck is the ship's own machined hardware, not an app theme:
//   - ONE accent system: the warm lamp. Live state is a warm filament ramp (dim → live → hot);
//     danger is the same lamp driven red. There is no second hue to manage.
//   - Materials are gunmetal plate, etched legend, lamp emitter. Light comes from the top-left
//     (the warm key) and from the lamps themselves — never from box-shadow decoration.
//   - "Almost no chrome": corners are 2–3 px machined breaks, not consumer glass radii; a plate's
//     edge is its bevel, not a drawn frame.
//
// Floors that bind every consumer (AGENTS.md §6, FIELD_HARDWARE_PROGRAM §7): 12 px type floor
// (check-type-floor scans src/ui), WCAG AA text contrast (check-wcag-contrast), reduced-motion and
// forced-colours variants are part of the token layer, and no backdrop-filter in flight.

export const DECKPLATE_TOKENS_CSS = `
:root {
  /* ── Metal: the gunmetal ramp, dark to lit. Values are sRGB so color-mix stays honest. ── */
  --dp-metal-0:#0b0d10;   /* unlit recess — the deepest a plate goes */
  --dp-metal-1:#12151a;   /* plate face in ambient shadow */
  --dp-metal-2:#191d24;   /* plate face under the key light */
  --dp-metal-3:#232833;   /* raised land: bevel tops, socket rims */
  --dp-metal-4:#2f3542;   /* machined edge — the brightest metal that is still metal */
  --dp-metal-hi:#4a5162;  /* key-light catch on a bevel, used at hairline weight only */

  /* ── Ink: warm bone, for text that is printed ON the machine. ── */
  --dp-ink:#e8e2d4;        /* primary readings — warm paper white */
  --dp-ink-dim:#b7b4a6;    /* secondary data */
  /* Etched legends and idle hardware marks. Raised 2026-09-19 from #6f7076, which measured
     2.99–3.74:1 on the deck's surfaces — under the 4.5:1 floor for 12 px text. #96948e is
     4.87:1 on the brightest raised metal (--dp-metal-3) and 6.09:1 on glass. */
  --dp-ink-mute:#b0aea6;  /* the QUIET tier, not the invisible one: #96948e measured 3.3-4.2:1
     against the composited frame on save-load, codex, achievements, help, credits and tech-tree.
     A secondary reading should be quieter than a primary one, never unreadable -- hierarchy is
     weight, tracking and size, which cost no contrast. Raised by measurement, not by eye. */

  /* ── THE LAMP — the one accent. A warm filament, three heats. ── */
  --dp-lamp-dim:#8a6b3a;   /* idle hardware: the lamp you could wake */
  --dp-lamp:#f2b950;       /* live: reading, selected, armed */
  --dp-lamp-hot:#ffd98c;   /* the filament core at full current */
  --dp-danger:#ff5038;     /* the same lamp driven to failure */
  --dp-danger-hot:#ff8a70;

  /* ══ THE PHOSPHOR — the ink of an emitted reading ════════════════════════════════════
     The owner, 2026-09-14, looking at the live flight HUD: "a strange wood look that's not visible
     against the backdrop ... it would have to be more sleek and glass ... maybe some slight neon
     look", and the speed dial "should at least resemble an instrument in an advanced spaceship".
     An agent retired that directive on 09-18 and installed the praise for the WORLD ART as the law
     for the interface. Root AGENTS.md section 4: user direction outranks an agent.

     So there are two temperatures, and they mean different things:
       the LAMP (warm)      — what you can ACT on. A control, a selection, an armed key.
       the PHOSPHOR (cool)  — what you READ. A numeral, an instrument, a price, a trace.
       etched ink (bone)    — paint printed ON metal, lit by the warm key. Unchanged.

     A white core with a cool halo is how a real tube reads, and it is the "slight neon" without a
     neon HUE. FENCES, so this cannot become the cyan wireframe that was rightly rejected in 2026-08:
     phosphor is an INK, never a stroke colour for a shape; nothing is drawn in it under 2px; no
     grid, no scanline, no visor, no corner brackets framing the screen.
     design/frontend/ONE_PHOTOGRAPH.md section 1. ══════════════════════════════════════ */
  --dp-phos:#dfeeff;                       /* the core of a reading */
  --dp-phos-dim:#9fb4c8;                   /* a reading at rest */
  --dp-phos-halo:rgb(150 210 255 / .22);   /* the bloom; a halo property, never a fill */
  --dp-phos-emit:0 0 10px var(--dp-phos-halo), 0 0 2px rgb(150 210 255 / .3);
  --dp-phos-emit-soft:0 0 6px rgb(150 210 255 / .14);

  /* ══ THE VIGNETTE — the only permitted occlusion ═══════════════════════════════════
     A panel is a rectangle of darkening with a visible inner edge. Ask of any screenshot: can you
     point to where the dark starts? If yes it is a panel, and panels are dead (section 4.1). What
     replaces them is a gradient that reaches the frame edge and has no inner boundary, so the world
     is darkened FOR the words without a box being drawn around them.
     ═══════════════════════════════════════════════════════════════════════════════════════ */
  --dp-veil-ink:8 9 12;
  --dp-veil-lead:linear-gradient(90deg,
    rgb(var(--dp-veil-ink) / .90) 0%, rgb(var(--dp-veil-ink) / .82) 22%,
    rgb(var(--dp-veil-ink) / .52) 48%, rgb(var(--dp-veil-ink) / .12) 74%, transparent 92%);
  --dp-veil-foot:linear-gradient(0deg,
    rgb(var(--dp-veil-ink) / .86) 0%, rgb(var(--dp-veil-ink) / .46) 42%, transparent 88%);
  --dp-veil-head:linear-gradient(180deg,
    rgb(var(--dp-veil-ink) / .78) 0%, rgb(var(--dp-veil-ink) / .34) 46%, transparent 86%);
  --dp-veil-full:radial-gradient(130% 110% at 28% 34%,
    rgb(var(--dp-veil-ink) / .40) 0%, rgb(var(--dp-veil-ink) / .74) 58%, rgb(var(--dp-veil-ink) / .93) 100%);

  /* ══ C6 — FILAMENT, NOT FADE ══════════════════════════════════════════════════
     A lamp coming on is not an opacity ramp from .5 to 1. A filament warms through colour before
     it reaches brightness, and it cools on the way out. --dp-lamp-current is a REGISTERED <number>
     (deckplate/paint.js), so the browser interpolates it and these three expressions — colour,
     bloom radius, and the cast the lamp throws on the plate under it — move together from one
     value. Mixed in oklab so the ramp passes through amber instead of through grey.
     ═══════════════════════════════════════════════════════════════════════════════════════ */
  --dp-lamp-now:color-mix(in oklab, var(--dp-lamp-dim), var(--dp-lamp-hot) calc(var(--dp-lamp-current) * 100%));
  --dp-lamp-halo:calc(var(--dp-lamp-current) * 14px);
  --dp-lamp-cast:rgb(255 217 140 / calc(var(--dp-lamp-current) * .10));

  /* Lamp light, pre-mixed for the bloom layers (alpha baked in). */
  --dp-lamp-bloom:rgb(242 185 80 / .34);
  --dp-lamp-bloom-soft:rgb(242 185 80 / .16);
  --dp-danger-bloom:rgb(255 80 56 / .38);

  /* ── Key light: the warm directional light the metal answers to. ONE direction for the whole
        system — top-left, raking. Changing this changes where every bevel in the game is lit. ── */
  --dp-key:rgb(255 224 178 / .16);        /* warm catch on lit faces */
  --dp-key-edge:rgb(255 232 190 / .42);   /* the lit bevel line */
  --dp-shade:rgb(2 3 5 / .55);            /* ambient occlusion under a land */
  --dp-shade-edge:rgb(0 0 0 / .68);       /* the dark bevel line */

  /* ── The viewport factor. 1 at a 1920-wide frame, 0.75 at 1280, 1.25 at 2560, and capped by
        height as well as width so 2560×1080 keeps the 1080-tall column geometry. Owned HERE as of
        2026-09-22: it used to read --k-s out of styles/kit.css, which made the whole system
        depend on a stylesheet that is being retired. Nothing in Deckplate reads a foreign token
        any more — that is what lets --k-, --sf- and --fh- go. ── */
  --dp-s:1;                                      /* fallback where trig functions are unsupported */
  --dp-s:clamp(0.75, min(tan(atan2(100vw, 1920px)), tan(atan2(100vh, 1080px))), 1.25);

  /* ── Type. Two voices only: the etched legend (condensed, tracked, uppercase) and the reading
        (tabular, warm bone). The reading face at numeral sizes is the display moment. Archivo is
        the width-axis family the etched legends are drawn for — wdth 62 is a real instance in the
        vendored file, and no fallback family has a width floor below 75. ── */
  --dp-face-etch:"Archivo", "Bricolage Grotesque", "Instrument Sans", system-ui, sans-serif;
  --dp-face-display:"Archivo", "Bricolage Grotesque", system-ui, sans-serif;
  --dp-face-read:"Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif;

  /* The scale, px at 1920. The 12 px floor is an accessibility floor (check-type-floor), not a
     style choice, so every step below body clamps to it. */
  --dp-fs-etch:max(12px, calc(12px * var(--dp-s)));   /* etched legend */
  --dp-fs-data:max(12px, calc(14px * var(--dp-s)));   /* dense readings */
  --dp-fs-body:max(12px, calc(16px * var(--dp-s)));   /* running copy */
  --dp-fs-read:calc(20px * var(--dp-s));              /* an emphasised reading */
  --dp-fs-num:calc(28px * var(--dp-s));               /* an instrument's number */
  --dp-fs-menu:calc(40px * var(--dp-s));              /* a menu item — a target, not a label */
  --dp-fs-hero:calc(56px * var(--dp-s));              /* the one hero number on a screen */
  --dp-fs-title:calc(80px * var(--dp-s));             /* the one screen title */
  --dp-fs-name:calc(132px * var(--dp-s));             /* the game's name, title screen only */

  /* ── Spacing: one unit, machined fits. ── */
  --dp-u:calc(4px * var(--dp-s));
  --dp-pad:calc(12px * var(--dp-s));
  --dp-gap:calc(8px * var(--dp-s));

  /* ── The frame. Every screen hangs off the same margin and the same column, or the game reads
        as a pile of unrelated windows — which is exactly how it reads today. ── */
  --dp-margin:calc(64px * var(--dp-s));          /* the screen's outer gutter */
  --dp-col:calc(420px * var(--dp-s));            /* the standing left column */
  --dp-rhythm:calc(24px * var(--dp-s));          /* the vertical beat between blocks */
  --dp-measure:68ch;                             /* the longest a line of copy may run */
  --dp-row:calc(34px * var(--dp-s));             /* one row in a dense register */

  /* ── Geometry: machined, not rounded. 2 px is the plate break; 3 px the instrument. ── */
  --dp-r-plate:2px;
  --dp-r-instrument:3px;
  --dp-bevel:1px;

  /* ── Motion. Three curves, four durations — the whole system's choreography. ── */
  --dp-ease-settle:cubic-bezier(.16, 1, .3, 1);     /* a needle comes to rest: long soft tail */
  --dp-ease-snap:cubic-bezier(.3, 1.6, .4, 1);      /* a bracket latches: one overshoot */
  --dp-ease-lamp:cubic-bezier(.45, 0, .25, 1);      /* filament warm-up/cool-down */
  --dp-d-cut:80ms;          /* a state cut — reads instant, still moves */
  --dp-d-settle:220ms;      /* instrument settle */
  --dp-d-breathe:3.4s;      /* idle lamp breath */
  --dp-d-escalate:560ms;    /* annunciator escalation beat */

  /* ── Composite material bundles: a surface applies the material with TWO declarations
        (background-image + box-shadow, or text-shadow). The recipe lives exactly here. ── */
  --dp-plate-img:
    radial-gradient(150% 130% at 14% 0%, var(--dp-key) 0%, rgb(255 224 178 / .055) 34%, transparent 60%),
    linear-gradient(178deg, var(--dp-metal-3) 0%, var(--dp-metal-2) 40%, var(--dp-metal-1) 74%, var(--dp-metal-0) 100%),
    repeating-linear-gradient(0deg, rgb(255 255 255 / .02) 0 1px, transparent 1px 3px);
  --dp-plate-bevel:
    inset 0 1px 0 var(--dp-key-edge),
    inset 1px 0 0 rgb(255 232 190 / .18),
    inset 0 -1px 0 var(--dp-shade-edge),
    inset -1px 0 0 rgb(0 0 0 / .42),
    0 2px 12px rgb(0 0 0 / .5);
  --dp-plate-bevel-raised:
    inset 0 1px 0 var(--dp-key-edge),
    inset 1px 0 0 rgb(255 232 190 / .22),
    inset 0 -1px 0 var(--dp-shade-edge),
    inset -1px 0 0 rgb(0 0 0 / .46),
    0 1px 0 rgb(255 255 255 / .05),
    0 8px 22px rgb(0 0 0 / .58);
  --dp-channel-img:
    linear-gradient(180deg, rgb(0 0 0 / .5), rgb(0 0 0 / .18) 55%, rgb(255 255 255 / .03));
  --dp-channel-bevel:
    inset 0 1px 2px rgb(0 0 0 / .7),
    inset 0 -1px 0 rgb(255 232 190 / .07);
  /* THE MARK FACE. A drawn mark is not text and must not be lit like text: it is a milled plate
     catching the same warm key as every other surface, bright along the top edge and falling to
     the shadowed bottom. Built from the system's own ink and lamp rather than a hand-mixed ramp,
     so re-theming the lamp re-themes the wordmark with it. */
  --dp-mark-face:linear-gradient(177deg,
    color-mix(in srgb, var(--dp-ink) 78%, #ffffff) 0%,
    var(--dp-ink) 30%,
    color-mix(in srgb, var(--dp-ink) 52%, var(--dp-lamp)) 70%,
    color-mix(in srgb, var(--dp-lamp-dim) 82%, var(--dp-ink)) 100%);
  --dp-mark-shadow:drop-shadow(0 2px 0 rgb(0 0 0 / .45)) drop-shadow(0 6px 22px rgb(0 0 0 / .5));

  --dp-etch-shadow:0 -1px 0 rgb(0 0 0 / .55), 0 1px 0 rgb(255 232 190 / .10);
}

/* ══ COMPUTED MATERIAL ═════════════════════════════════════════════════════════════════════════
   The recipes that replaced the kit's raster nine-slices, published as tokens so a surface applies
   one and never re-mixes its own.

   WHY THESE EXIST. Until 2026-09-22 a key, plate, window or tape was a nine-sliced PNG:
   keys/key.legend.rest.png is 160x40, stretched across controls three times that width, and the
   320x80 @2x beside it on disk was referenced by nothing. On any HiDPI display — which is the
   Electron app at devicePixelRatio 2 — every control in the game was a bitmap upsampled 2x. That
   is the smudge. ONE_PHOTOGRAPH.md section 4.11 retires raster nine-slices as UI material and
   keeps the Cycles renders as the calibration reference these are judged against: if a computed
   cap does not look as good as key.primary.rest.png, the recipe is wrong, not the rule.

   WHAT MAKES A CAP READ AS A CAP. Not the radius and not the fill — the EDGES. A 1px lit top rule,
   a 1px dark sill, and a seat shadow under it. Those three hairlines are the whole illusion, they
   are the first thing a careless pass drops, and unlike a stretched slice they are exactly one
   device pixel at every scale. Keep them.

   HOW TO USE. A raised control:
     background: var(--dp-cap-rest) padding-box;  box-shadow: var(--dp-cap-lift);
   and its states swap --dp-cap-hover / --dp-cap-press with --dp-cap-sink. A recess uses
   --dp-well-face / --dp-well-sink. Everything is padding-box so a surface keeps its own border. */
:root {
  /* — the raised cap — */
  --dp-cap-rest:
    linear-gradient(180deg, rgb(255 255 255 / .055), rgb(255 255 255 / 0) 42%),
    linear-gradient(168deg, #2b3038 0%, #23272e 46%, #191c22 100%);
  --dp-cap-hover:
    linear-gradient(180deg, rgb(255 255 255 / .085), rgb(255 255 255 / 0) 44%),
    linear-gradient(168deg, #343a44 0%, #2a2f37 46%, #1e222a 100%);
  --dp-cap-press: linear-gradient(168deg, #16191e 0%, #1c2026 54%, #23272e 100%);
  --dp-cap-off:   linear-gradient(168deg, #23262b 0%, #1e2126 100%);
  --dp-cap-lift:
    inset 0 1px 0 0 rgb(226 232 240 / .14),
    inset 0 0 0 1px rgb(226 232 240 / .055),
    inset 0 -1px 0 0 rgb(0 0 0 / .62),
    0 1px 0 0 rgb(0 0 0 / .5),
    0 2px 5px -2px rgb(0 0 0 / .55);
  --dp-cap-sink:
    inset 0 2px 4px 0 rgb(0 0 0 / .7),
    inset 0 0 0 1px rgb(0 0 0 / .5),
    inset 0 -1px 0 0 rgb(226 232 240 / .09);
  --dp-cap-off-edge: inset 0 0 0 1px rgb(226 232 240 / .04), inset 0 -1px 0 0 rgb(0 0 0 / .4);

  /* — the consequence cap: the only control lit from inside — */
  --dp-cap-live:
    linear-gradient(180deg, rgb(255 236 200 / .22), rgb(255 236 200 / 0) 46%),
    linear-gradient(168deg, #d29b41 0%, #bb862a 52%, #9c6c1d 100%);
  /* The ramp is shallower than it looks in isolation on purpose: the old bottom stop
     (#7d5412) put a two-line key's second line at L~0.17, a dead zone where even pure
     black ink caps out at 4.4:1. Measured with scripts/ui-contrast.mjs, not guessed. */
  --dp-cap-live-hover:
    linear-gradient(180deg, rgb(255 240 210 / .3), rgb(255 240 210 / 0) 48%),
    linear-gradient(168deg, #dba646 0%, #bd8626 48%, #8d6015 100%);
  --dp-cap-live-lift:
    inset 0 1px 0 0 rgb(255 238 205 / .45),
    inset 0 0 0 1px rgb(255 214 140 / .22),
    inset 0 -1px 0 0 rgb(0 0 0 / .5),
    0 1px 0 0 rgb(0 0 0 / .5),
    0 3px 12px -3px rgb(242 185 80 / .35);

  /* — the destructive cap — */
  --dp-cap-risk:
    linear-gradient(180deg, rgb(255 210 195 / .2), rgb(255 210 195 / 0) 46%),
    linear-gradient(168deg, #b8452f 0%, #93301f 48%, #6a2014 100%);
  --dp-cap-risk-lift:
    inset 0 1px 0 0 rgb(255 200 180 / .4),
    inset 0 0 0 1px rgb(255 150 120 / .24),
    inset 0 -1px 0 0 rgb(0 0 0 / .5),
    0 1px 0 0 rgb(0 0 0 / .5),
    0 4px 16px -4px rgb(214 90 70 / .42);

  /* — the recess. Light comes from above, so a well is dark at the top lip and catches light at
       the bottom: the exact inverse of a cap, which is what sells it as sunk. — */
  --dp-well-face: linear-gradient(180deg, #0e1116 0%, #121519 100%);
  --dp-well-sink:
    inset 0 2px 6px -1px rgb(0 0 0 / .72),
    inset 0 0 0 1px rgb(0 0 0 / .5),
    inset 0 -1px 0 0 rgb(226 232 240 / .07);

  /* — the flat plate: a panel of stock, no lift, just an edge — */
  --dp-stock-face: linear-gradient(176deg, #1b1f25 0%, #14171c 100%);
  --dp-stock-edge:
    inset 0 1px 0 0 rgb(226 232 240 / .10),
    inset 0 0 0 1px rgb(226 232 240 / .05),
    inset 0 -1px 0 0 rgb(0 0 0 / .55);

  /* — smoked glass. The specular is PLACED as a fraction of the box, never stretched: that is
       precisely what border-image-slice: fill got wrong on the market chart. — */
  --dp-pane-face:
    linear-gradient(180deg, rgb(226 232 240 / .13), rgb(226 232 240 / 0) 1px),
    linear-gradient(104deg, transparent 12%, rgb(214 230 246 / .045) 26%,
                    rgb(214 230 246 / .085) 33%, rgb(214 230 246 / .03) 41%, transparent 56%),
    linear-gradient(176deg, rgb(9 12 17 / .80), rgb(6 8 12 / .92));
  --dp-pane-edge:
    inset 0 0 0 1px rgb(226 232 240 / .07),
    inset 0 1px 0 0 rgb(226 232 240 / .10),
    inset 0 -1px 0 0 rgb(0 0 0 / .55);
  --dp-pane-live-face:
    linear-gradient(180deg, rgb(242 185 80 / .16), rgb(242 185 80 / 0) 1px),
    linear-gradient(104deg, transparent 14%, rgb(255 226 176 / .05) 30%,
                    rgb(255 226 176 / .09) 36%, transparent 54%),
    linear-gradient(176deg, rgb(14 12 9 / .82), rgb(8 7 5 / .93));
  --dp-pane-live-edge:
    inset 0 0 0 1px rgb(242 185 80 / .22),
    inset 0 1px 0 0 rgb(242 185 80 / .16),
    inset 0 -1px 0 0 rgb(0 0 0 / .6),
    0 0 18px -6px rgb(242 185 80 / .35);

  /* — an input's underline: a machined channel, not a border — */
  --dp-chan-rest: linear-gradient(180deg, rgb(0 0 0 / .5) 0 1px, rgb(226 232 240 / .08) 1px 2px);
  --dp-chan-live: linear-gradient(180deg, rgb(0 0 0 / .5) 0 1px, var(--dp-lamp-hot) 1px 2px);
}

@supports (background-image: paint(dp-plate)) {
  /* The worklet grains the cap at the device's resolution. This is the layer the Cycles render was
     standing in for, and it is the one thing a gradient alone cannot do. */
  :root {
    --dp-cap-rest:
      linear-gradient(180deg, rgb(255 255 255 / .055), rgb(255 255 255 / 0) 42%),
      paint(dp-plate),
      linear-gradient(168deg, #2b3038 0%, #23272e 46%, #191c22 100%);
  }
}

/* High contrast remaps the tokens, not the components: the whole system re-themes from here. */
html.sf-high-contrast {
  --dp-metal-0:#000; --dp-metal-1:#000; --dp-metal-2:#0a0a0a; --dp-metal-3:#111;
  --dp-metal-4:#1a1a1a; --dp-metal-hi:#8a8a8a;
  --dp-ink:#fff; --dp-ink-dim:#e8e8e8; --dp-ink-mute:#c9c9c9;
  --dp-lamp-dim:#c9a86a; --dp-lamp:#ffd98c; --dp-lamp-hot:#fff;
  --dp-danger:#ff6a54; --dp-danger-hot:#ffb0a0;
  --dp-key:rgb(255 255 255 / .06); --dp-key-edge:rgb(255 255 255 / .85);
  --dp-shade:rgb(0 0 0 / .9); --dp-shade-edge:#000;
}
`;

// The token layer is a stylesheet fragment, injected once by deckplate/index.js. No code here
// touches the DOM at import time (check-ui-effects pattern: import-before-DOM must hold).
