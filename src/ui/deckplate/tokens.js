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
  --dp-ink-mute:#96948e;

  /* ── THE LAMP — the one accent. A warm filament, three heats. ── */
  --dp-lamp-dim:#8a6b3a;   /* idle hardware: the lamp you could wake */
  --dp-lamp:#f2b950;       /* live: reading, selected, armed */
  --dp-lamp-hot:#ffd98c;   /* the filament core at full current */
  --dp-danger:#ff5038;     /* the same lamp driven to failure */
  --dp-danger-hot:#ff8a70;

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

  /* ── Type. Aliases onto the kit scale so the 12 px floor and the viewport factor hold.
        Two voices only: the etched legend (condensed, tracked, uppercase) and the reading
        (tabular, warm bone). The reading face at numeral sizes is the display moment. ── */
  --dp-face-etch:"Archivo", var(--k-display, "Bricolage Grotesque"), var(--k-text, "Instrument Sans"), system-ui, sans-serif;
  --dp-face-display:"Archivo", var(--k-display, "Bricolage Grotesque"), system-ui, sans-serif;
  --dp-face-read:var(--k-text, "Instrument Sans"), system-ui, -apple-system, "Segoe UI", sans-serif;
  --dp-fs-etch:max(12px, var(--k-fs-fine, 12px));
  --dp-fs-data:max(12px, var(--k-fs-data, 14px));
  --dp-fs-read:var(--k-fs-emph, 20px);
  --dp-fs-num:var(--k-fs-sub, 28px);

  /* ── Spacing: one unit, machined fits. ── */
  --dp-u:calc(4px * var(--k-s, 1));
  --dp-pad:calc(12px * var(--k-s, 1));
  --dp-gap:calc(8px * var(--k-s, 1));

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
  --dp-etch-shadow:0 -1px 0 rgb(0 0 0 / .55), 0 1px 0 rgb(255 232 190 / .10);
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
