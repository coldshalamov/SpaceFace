// Deckplate -- the SpaceFace design system. Tokens first: every surface assembles these, nothing
// hand-mixes a colour, a radius, a duration or a font size of its own.
//
// THE LAW (owner, in the order it was said -- design/frontend/ONE_PHOTOGRAPH.md section 0):
//   2026-09-14  the flight HUD: "more sleek and glass ... maybe some slight neon look".
//   2026-09-18  the world art (praise): "real rock texture, warm directional light, a physical
//               machine, almost no chrome". About the 3D, NOT the interface.
//   2026-09-22  the interface: "free of any common CSS anti-patterns of old internet (mostly when
//               CSS is pretending to be physical materials, it looks awful and we need either
//               custom or downloaded assets for a lot of things)".
// An earlier header here called the 09-18 praise "the only two [signals] that exist" and built the
// interface out of it: brushed-steel tiles, bevels, LED dots, screws. That was an agent's misreading
// and the owner has now said so in plain words.
//
// THE LANGUAGE -- everything on the screen is PRINTED or LIT (ONE_PHOTOGRAPH section 9):
//   printed  a flat field of one colour with a hard edge, type on it, a hairline rule. It claims
//            no material, so it cannot lie about one. A field you can PRESS has the cut: one 45deg
//            chamfer on its top-right corner, and that cut edge lights when the control is live.
//   lit      emission: the warm lamp on what you can act on, the cool phosphor on what you read.
//            The only things on the screen that glow.
//   objects  a hull, a crest, a commodity is PRODUCED ART at the size it is shown, never CSS.
// Depth is never faked. It comes from the world behind the interface and from real renders.
//
// Floors that bind every consumer (AGENTS.md section 6): 12 px type floor (check-type-floor scans
// src/ui), WCAG AA text contrast measured on composited pixels (scripts/ui-contrast.mjs),
// reduced-motion and forced-colours variants live in the token layer, no backdrop-filter in flight.
// test/ui-no-material-imitation.test.mjs keeps the screws out.

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

  /* -- PRINTED: the flat fields, rules and the cut (ONE_PHOTOGRAPH section 9.1). --
     A flat fill is written "linear-gradient(X 0 0)": one colour stop at two positions is a solid
     image, which is what a background LAYER needs (a colour may only sit in the last layer). */
  --dp-field:rgb(10 12 16 / .84);          /* a printed field over the world; the popover */
  --dp-field-ink:rgb(232 226 212 / .08);   /* the ghost field: secondary keys, the selected row */
  --dp-field-ink-hi:rgb(232 226 212 / .14);
  --dp-sheet:rgb(8 9 12 / .90);            /* THE sheet: one per screen, on a frame edge */
  --dp-rule:rgb(232 226 212 / .10);        /* the hairline between rows, under heads */
  --dp-rule-hi:rgb(232 226 212 / .22);     /* a rail at rest */
  --dp-cut:calc(10px * var(--dp-s));
  --dp-cut-sheet:calc(18px * var(--dp-s));
  --dp-cut-shape:polygon(0 0, calc(100% - var(--dp-cut)) 0, 100% var(--dp-cut), 100% 100%, 0 100%);
  --dp-cut-sheet-shape:polygon(0 0, calc(100% - var(--dp-cut-sheet)) 0, 100% var(--dp-cut-sheet), 100% 100%, 0 100%);
  /* The lit cut: a 2px band lying exactly on the chamfer. At 225deg the gradient starts in the
     top-right corner, so the clip diagonal is var(--dp-cut) / sqrt(2) along it. */
  --dp-cut-lit:linear-gradient(225deg, transparent calc(var(--dp-cut) * .7071),
    var(--dp-lamp-hot) calc(var(--dp-cut) * .7071) calc(var(--dp-cut) * .7071 + 2px), transparent 0);
  /* The focus bracket: a 2px bone bar on the leading edge. A background layer, never an outline:
     a clipped field clips its own outline. */
  --dp-bracket:linear-gradient(90deg, var(--dp-ink) 2px, transparent 0);
  --dp-key-h:calc(56px * var(--dp-s));     /* the primary action */
  --dp-key-h-2:calc(40px * var(--dp-s));   /* secondary, destructive */
  --dp-hint-h:calc(22px * var(--dp-s));    /* a keyboard-key hint */
  --dp-lamp-glow:0 0 28px rgb(242 185 80 / .35), 0 0 6px rgb(242 185 80 / .22);
  --dp-text-legible:0 1px 0 rgb(0 0 0 / .5);   /* the only black shadow: type over the world */

  /* Retired key-light tokens (the bevel system). Kept as names that paint nothing, so a legacy
     sheet that still reads one draws no bevel instead of an invalid declaration. */
  --dp-key:transparent;
  --dp-key-edge:transparent;
  --dp-shade:transparent;
  --dp-shade-edge:transparent;

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

  /* The plate and channel bundles (a brushed ramp with a lit top bevel; an inset recess) were CSS
     imitating a material (owner, 2026-09-22). They are gone, and so is every consumer of them;
     test/ui-no-material-imitation.test.mjs keeps them from coming back. */
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

  /* An engraving shadow (dark incision, warm bounce) imitated a material; a legend is printed. */
  --dp-etch-shadow:var(--dp-text-legible);
}

/* == THE CAP TOKENS, PRINTED ====================================================================
   These names replaced the kit's raster nine-slices on 2026-09-22 with a COMPUTED cap: a lit top
   rule, a dark sill and a seat shadow, "the whole illusion" of a raised key. The owner then ruled
   that CSS pretending to be a physical material looks awful. The names stay because six sheets and
   the inline pins in src/ui/kit/computedMaterial.js read them; every value is now printed.

     cap        a pressable ghost field         (the cut is the consumer's clip-path)
     cap-live   the one consequential verb:     flat lamp, dark ink
     cap-risk   destructive:                    ghost field, red rule along the bottom
     well       a place you type into:          a bottom rail, no box
     stock/pane a surface:                      the printed field
     chan       an input underline:             a rail, lit on focus
   Every lift, sink and edge is a no-op: there is no raised thing to shade. */
:root {
  --dp-cap-rest:linear-gradient(var(--dp-field-ink) 0 0);
  --dp-cap-hover:linear-gradient(var(--dp-field-ink-hi) 0 0);
  --dp-cap-press:linear-gradient(rgb(232 226 212 / .05) 0 0);
  --dp-cap-off:linear-gradient(rgb(232 226 212 / .04) 0 0);
  --dp-cap-lift:0 0 0 0 transparent;
  --dp-cap-sink:0 0 0 0 transparent;
  --dp-cap-off-edge:0 0 0 0 transparent;

  --dp-cap-live:linear-gradient(var(--dp-lamp) 0 0);
  --dp-cap-live-hover:linear-gradient(var(--dp-lamp-hot) 0 0);
  --dp-cap-live-lift:0 0 0 0 transparent;

  --dp-cap-risk:linear-gradient(0deg, var(--dp-danger) 2px, transparent 0), linear-gradient(var(--dp-field-ink) 0 0);
  --dp-cap-risk-lift:0 0 0 0 transparent;

  --dp-well-face:linear-gradient(0deg, var(--dp-rule-hi) 2px, transparent 0);
  --dp-well-sink:0 0 0 0 transparent;

  --dp-stock-face:linear-gradient(var(--dp-field) 0 0);
  --dp-stock-edge:0 0 0 0 transparent;

  --dp-pane-face:linear-gradient(var(--dp-field) 0 0);
  --dp-pane-edge:0 0 0 0 transparent;
  --dp-pane-live-face:linear-gradient(90deg, var(--dp-lamp) 2px, transparent 0), linear-gradient(var(--dp-field) 0 0);
  --dp-pane-live-edge:0 0 0 0 transparent;

  --dp-chan-rest:linear-gradient(0deg, var(--dp-rule-hi) 2px, transparent 0);
  --dp-chan-live:linear-gradient(0deg, var(--dp-lamp) 2px, transparent 0);
}

/* High contrast remaps the tokens, not the components: the whole system re-themes from here. */
html.sf-high-contrast {
  --dp-metal-0:#000; --dp-metal-1:#000; --dp-metal-2:#0a0a0a; --dp-metal-3:#111;
  --dp-metal-4:#1a1a1a; --dp-metal-hi:#8a8a8a;
  --dp-ink:#fff; --dp-ink-dim:#e8e8e8; --dp-ink-mute:#c9c9c9;
  --dp-lamp-dim:#c9a86a; --dp-lamp:#ffd98c; --dp-lamp-hot:#fff;
  --dp-danger:#ff6a54; --dp-danger-hot:#ffb0a0;
  --dp-rule:rgb(255 255 255 / .45); --dp-rule-hi:rgb(255 255 255 / .75);
  --dp-field:#000; --dp-field-ink:rgb(255 255 255 / .12); --dp-sheet:#000;
}
`;

// The token layer is a stylesheet fragment, injected once by deckplate/index.js. No code here
// touches the DOM at import time (check-ui-effects pattern: import-before-DOM must hold).
