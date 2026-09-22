// Deckplate hardware — the physical layer every surface assembles: glass instruments in machined
// bezels. Materials differ by FUNCTION (FRONTEND_PROGRAM_2026-09-19 §2), never one gradient on
// every panel:
//
//   bezel    structure. Authored SVG hardware (assets/ui/deckplate/hw/bezel*.svg: fasteners,
//            key-light catch, a machined rebate into the glass) over brushed, scratched gunmetal
//            (assets/ui/deckplate/tex/*.png, baked by tools/bake_textures.py). Grain lives HERE.
//   glass    every display face. Smoked and lifted above the void, the bezel's shadow cast onto
//            it, one diagonal specular sweep, a phosphor row; content on it EMITS (a slight
//            glow) — the owner's "sleek and glass … slight neon".
//   key      every command. A raised cap (hw/keycap.svg) whose state lives in its LED pip. The
//            screen's ONE primary command is backlit: the cap face itself glows.
//   selector navigation (tabs) is not a command: legends on a rail, the active one lit, so the
//            eye never confuses "go to" with "do".
//   placard  titles and section heads: an engraved plate or an etched groove with screw caps.
//   keyart   produced renders (kit tiles, crests) framed as instrument cards.
//
// The LED pip is the system's one state mechanic: keys, rows, switches, selectors and tiles all
// show state as a lit lens. Layout, type and light gradients are CSS because CSS is the right
// tool for them; the MATERIAL is always an asset. Floors: 12 px type, 4.5:1 text, focus always
// visible (outline, never clipped), reduced motion swaps every movement for an instant state,
// forced colours hand every surface back to the system palette.

const HW = '/assets/ui/deckplate/hw/';
const TEX = '/assets/ui/deckplate/tex/';
const KIT_TILE = '/assets/ui/kit/assets/tiles/';

/** The LED lens, shared by every component that shows state (keys, rows, switches, selectors). */
const LED_OFF = 'radial-gradient(circle at 42% 36%, #3b352c, #17140f 70%)';
const LED_ON = 'radial-gradient(circle at 42% 34%, #fff6df 0%, var(--dp-lamp-hot) 22%, var(--dp-lamp) 55%, var(--dp-lamp-dim) 100%)';
const LED_ON_GLOW = '0 0 6px var(--dp-lamp-bloom), 0 0 14px var(--dp-lamp-bloom-soft), inset 0 -1px 1px rgb(0 0 0 / .35)';
const LED_RIM = 'inset 0 1px 1.5px rgb(0 0 0 / .85), 0 0 0 1px rgb(0 0 0 / .6), 0 1px 0 1px rgb(255 236 204 / .08)';

export const DECKPLATE_HARDWARE_CSS = `
:root {
  --dp-tex-brushed:url("${TEX}brushed.png");
  --dp-tex-scratch:url("${TEX}scratches.png");
  --dp-tex-grain:url("${TEX}grain.png");
  --dp-tex-scan:url("${TEX}scanlines.png");
  --dp-tex-smudge:url("${TEX}smudge.png");
  /* THE key light. One warm source at the screen's upper-left, attached to the VIEWPORT (fixed),
     so every glass face and bezel is lit by the same light: a continuous sweep across the whole
     screen, never a streak stamped separately on each panel. */
  --dp-key-sweep:linear-gradient(113deg, transparent 10%, rgb(255 238 210 / .018) 24%, rgb(255 238 210 / .05) 30%, rgb(255 238 210 / .014) 36%, transparent 46%) fixed;
  --dp-key-pool:radial-gradient(95% 85% at 0% 0%, rgb(255 224 178 / .10), transparent 62%) fixed;
  /* Smoked glass (critic pass 2026-09-19: the first glass read "flat navy"). What sells glass is
     not the tint, it is light: a crisp reflection plane across the upper face (--dp-glass-spec),
     falloff from the key light (--dp-glass-fall), handling haze that only shows where the light
     crosses it (smudge), a lit top-left rim and a shadowed lip (--dp-glass-depth). The tint is a
     neutral smoke, not navy, and no phosphor scanlines: those read as a cheap CRT filter. */
  /* good news reads in bone with its sign or arrow: the deckplate carries no green (the kit default was mint) */
  --k-good:#d8d2c4;
  --dp-glass-0:rgb(8 10 14 / .84);
  --dp-glass-1:rgb(20 25 31 / .74);
  --dp-glass-see:blur(14px) saturate(1.2) brightness(.6);
  --dp-glass-spec:linear-gradient(168deg, rgb(255 250 240 / .075) 0%, rgb(255 250 240 / .028) 27%, rgb(255 250 240 / 0) 28.5%);
  --dp-glass-fall:linear-gradient(135deg, rgb(255 244 222 / .04), transparent 42%, rgb(0 0 0 / .22));
  --dp-glass-layers:
    var(--dp-key-sweep) padding-box,
    var(--dp-glass-spec) padding-box,
    var(--dp-glass-fall) padding-box,
    var(--dp-tex-smudge) 0 0 / 512px repeat padding-box,
    linear-gradient(180deg, var(--dp-glass-1), var(--dp-glass-0)) padding-box;
  /* The same glass over a solid dark plate: a window seated in a metal chassis (behind it is the
     instrument, not the world). */
  --dp-glass-solid:var(--dp-glass-layers), linear-gradient(180deg, #151a21, #090c10) padding-box;
  /* Flight glass: the HUD owns no backdrop blur, so its glass is translucent without it — the
     world shows through a darker smoke, and the same reflection and falloff light it. */
  --dp-glass-flight:
    var(--dp-glass-spec) padding-box,
    var(--dp-glass-fall) padding-box,
    linear-gradient(180deg, rgb(18 23 29 / .80), rgb(7 9 13 / .86)) padding-box;
  /* Brushed metal is lit by an anisotropic sheen: horizontal brushing throws a soft VERTICAL band
     where the key light catches it, fixed to the viewport so every plate shares one light; each
     plate also falls off away from the light (--dp-metal-fall). The tile carries the grain only. */
  --dp-metal-sheen:linear-gradient(90deg, transparent 0%, rgb(255 240 215 / .02) 20%, rgb(255 240 215 / .055) 31%, rgb(255 240 215 / .018) 41%, transparent 58%) fixed;
  --dp-metal-fall:radial-gradient(130% 110% at 0% 0%, transparent 45%, rgb(0 0 0 / .3) 100%);
  --dp-metal-layers:
    var(--dp-key-pool) border-box,
    var(--dp-metal-sheen) border-box,
    var(--dp-tex-scratch) 0 0 / 1024px repeat border-box,
    var(--dp-tex-brushed) 0 0 / 512px repeat border-box,
    var(--dp-tex-grain) 0 0 / 256px repeat border-box,
    var(--dp-metal-fall) border-box;
  /* The pane sits in the bezel: a dark seat line, then a lit top-left rim and a dark bottom-right
     rim (one light, upper left), the bezel lip's shadow falling on the top of the face, and a
     faint internal glow so the glass has depth rather than a flat fill. */
  --dp-glass-depth:inset 0 0 0 1px rgb(2 3 5 / .92), inset 1px 1px 0 1px rgb(255 244 222 / .10), inset -1px -1px 0 1px rgb(0 0 0 / .42), inset 0 14px 22px -16px rgb(0 0 0 / .75), inset 0 0 30px rgb(120 150 190 / .035);
  --dp-stand-off:0 14px 34px rgb(0 0 0 / .5), 0 2px 6px rgb(0 0 0 / .55);
  /* Emission: data on glass glows faintly cool; lamp readings glow warm. */
  --dp-emit:0 0 10px rgb(205 222 255 / .16), 0 0 1px rgb(0 0 0 / .6);
  --dp-emit-lamp:0 0 12px var(--dp-lamp-bloom), 0 0 2px rgb(255 217 140 / .45);
}
/* One accent, focus included. styles/ui.css forces every ring to the retired blue --accent with
   *:focus-visible {… !important}; only the COLOUR is restated here (one step more specific), so
   width and offset stay theirs. The game's own high-contrast mode keeps a white ring. */
:root :focus-visible { outline-color:var(--dp-lamp) !important; }
html.sf-high-contrast :focus-visible { outline-color:#fff !important; }

/* ══ dp-mfd / dp-glass — an instrument: ONE bezel design (fastened, machined) around a pane of
   smoked glass. The pane is translucent and blurs the world behind it; the metal ring is its own
   masked layer (::before), so the glass shows the world, not the metal. dp-mfd is the primary
   display (14 px ring); dp-glass the secondary (10 px ring, same hardware scaled). ══ */
.dp-mfd, .dp-glass {
  --dp-ring:14px; --dp-ring-img:30px;
  position:relative; box-sizing:border-box; isolation:isolate; color:var(--dp-ink);
  border:var(--dp-ring) solid transparent;
  background:var(--dp-glass-layers);
  -webkit-backdrop-filter:var(--dp-glass-see); backdrop-filter:var(--dp-glass-see);
  box-shadow:var(--dp-stand-off), var(--dp-glass-depth);
  padding:18px 22px;
}
.dp-glass { --dp-ring:10px; --dp-ring-img:22px; padding:12px 14px; box-shadow:0 8px 22px rgb(0 0 0 / .45), var(--dp-glass-depth); }
.dp-mfd::before, .dp-glass::before {
  content:""; position:absolute; inset:calc(var(--dp-ring) * -1); box-sizing:border-box; pointer-events:none;
  border:var(--dp-ring) solid transparent;
  border-image:url("${HW}bezel.svg") 30 / var(--dp-ring-img) / 0 stretch;
  background:var(--dp-metal-layers), var(--dp-metal-2);
  -webkit-mask:linear-gradient(#000 0 0) padding-box, linear-gradient(#000 0 0);
  -webkit-mask-composite:xor; mask-composite:exclude;
}
/* In flight the HUD owns no backdrop blur (perf floor): the same glass, opaque over a dark plate. */
#hud .dp-mfd, #hud .dp-glass { -webkit-backdrop-filter:none; backdrop-filter:none; background:var(--dp-glass-layers), #0b0f16; }
/* A plain machined face (no glass) for hardware that holds keys: rails, trays, key banks. */
.dp-plate-hw {
  box-sizing:border-box;
  border:5px solid transparent;
  border-image:url("${HW}bezel-thin.svg") 12 / 12px / 0 stretch;
  background:var(--dp-metal-layers), var(--dp-metal-2);
  box-shadow:0 8px 22px rgb(0 0 0 / .45);
}
/* Data on glass emits. */
.dp-mfd :is(h2, h3, b, strong, .dp-row__read, .dp-read), .dp-glass :is(h2, h3, b, strong, .dp-row__read, .dp-read) { text-shadow:var(--dp-emit); }

/* ══ dp-placard — engraved title plate; the screen's name is cut into the machine. ══ */
.dp-placard {
  display:inline-flex; align-items:center; gap:14px; box-sizing:border-box;
  border:5px solid transparent;
  border-image:url("${HW}bezel-thin.svg") 12 / 12px / 0 stretch;
  background:var(--dp-metal-layers), var(--dp-metal-3);
  box-shadow:0 10px 26px rgb(0 0 0 / .5);
  padding:8px 22px 9px 18px;
}
.dp-placard__title {
  margin:0; font-family:var(--dp-face-display); font-variation-settings:"wght" 800, "wdth" 125;
  font-size:clamp(22px, calc(30px * var(--dp-s, 1)), 40px); line-height:1; letter-spacing:.06em;
  text-transform:uppercase; color:var(--dp-ink);
  text-shadow:0 -1px 0 rgb(0 0 0 / .75), 0 1px 0 rgb(255 236 204 / .14);
}
.dp-placard__sub {
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 62;
  font-size:var(--dp-fs-etch); letter-spacing:.2em; text-transform:uppercase; color:var(--dp-ink-mute);
  text-shadow:var(--dp-etch-shadow);
}

/* ══ dp-legend — an etched label; dp-rule — the etched groove between sections, screw-capped. ══ */
.dp-legend {
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 62;
  font-size:var(--dp-fs-etch); letter-spacing:.18em; text-transform:uppercase;
  color:var(--dp-ink-mute); text-shadow:var(--dp-etch-shadow);
}
.dp-rule {
  position:relative; height:12px; margin:10px 0;
  background:
    url("${HW}rule-cap.svg") left center / 12px no-repeat,
    url("${HW}rule-cap.svg") right center / 12px no-repeat,
    linear-gradient(180deg, transparent 5px, rgb(0 0 0 / .7) 5px 6px, rgb(255 236 204 / .09) 6px 7px, transparent 7px) 16px 0 / calc(100% - 32px) 100% no-repeat;
}
.dp-section-head { display:flex; align-items:baseline; gap:12px; margin:0 0 8px; }
.dp-section-head .dp-legend { color:var(--dp-ink-dim); }
.dp-section-head::after {
  content:""; flex:1; align-self:center; height:2px; order:5;
  background:linear-gradient(180deg, rgb(0 0 0 / .65) 0 1px, rgb(255 236 204 / .08) 1px 2px);
}
.dp-section-head > .dp-legend:last-child:not(:first-child) { order:6; }

/* ══ dp-led — the one state mechanic, available alone (status lamps, legends). ══ */
.dp-led { display:inline-block; width:8px; height:8px; border-radius:50%; flex:0 0 auto; background:${LED_OFF}; box-shadow:${LED_RIM}; }
.dp-led.is-on { background:${LED_ON}; box-shadow:${LED_ON_GLOW}; }
.dp-led.is-danger { background:radial-gradient(circle at 42% 34%, #fff1ea, var(--dp-danger-hot) 26%, var(--dp-danger) 60%, #6b1a10); box-shadow:0 0 7px var(--dp-danger-bloom); }

/* ══ dp-key — a command. Raised cap, legend, LED pip. ══ */
.dp-key {
  -webkit-appearance:none; appearance:none; position:relative; box-sizing:border-box;
  display:inline-flex; align-items:center; justify-content:center; gap:10px;
  min-height:44px; margin:0; cursor:pointer;
  border-style:solid; border-color:transparent; border-width:10px 10px 12px;
  border-image:url("${HW}keycap.svg") 10 10 12 / 10px 10px 12px / 0 stretch;
  background:var(--dp-tex-brushed) 0 0 / 512px repeat border-box, var(--dp-tex-grain) 0 0 / 256px repeat border-box, var(--dp-metal-3);
  padding:0 8px 0 20px;
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 750, "wdth" 75;
  font-size:var(--dp-fs-data); letter-spacing:.12em; text-transform:uppercase; line-height:1;
  color:var(--dp-ink-dim); text-shadow:0 -1px 0 rgb(0 0 0 / .7);
  transition:color var(--dp-d-cut) var(--dp-ease-lamp), filter var(--dp-d-cut) var(--dp-ease-lamp), transform var(--dp-d-cut) var(--dp-ease-settle);
}
.dp-key::before {
  content:""; position:absolute; left:0; top:50%; width:7px; height:7px; margin-top:-3.5px; border-radius:50%;
  background:${LED_OFF}; box-shadow:${LED_RIM};
  transition:background var(--dp-d-cut) var(--dp-ease-lamp), box-shadow var(--dp-d-cut) var(--dp-ease-lamp);
}
.dp-key:hover { color:var(--dp-ink); filter:brightness(1.12); }
.dp-key:hover::before { background:radial-gradient(circle at 42% 36%, #8a6b3a, #3d2f19 75%); }
.dp-key:active, .dp-key.is-pressed {
  border-image-source:url("${HW}keycap-pressed.svg"); transform:translateY(1px); filter:brightness(.94);
}
.dp-key:focus-visible { outline:2px solid var(--dp-lamp); outline-offset:3px; color:var(--dp-ink); }
.dp-key[aria-pressed="true"], .dp-key.is-on { color:var(--dp-ink); }
.dp-key[aria-pressed="true"]::before, .dp-key.is-on::before, .dp-key--primary::before { background:${LED_ON}; box-shadow:${LED_ON_GLOW}; }
/* The screen's ONE primary command wears the selection language permanently: lit LED, amber
   legend, amber inner edge and a faint bloom — the same signal a selected row or tab shows. */
.dp-key--primary {
  color:var(--dp-lamp-hot); text-shadow:var(--dp-emit-lamp);
  box-shadow:inset 0 -8px 16px -10px var(--dp-lamp-bloom), 0 0 18px rgb(242 185 80 / .16);
}
.dp-key--primary:hover { filter:brightness(1.1); }
.dp-key--primary .dp-icon { color:var(--dp-lamp-hot); }
.dp-key--primary .dp-icon .accent { fill:var(--dp-lamp); }
.dp-key--primary .dp-kbd { margin-left:4px; }
/* Destructive: a hazard band painted on the cap, the pip becomes the lamp driven red. */
.dp-key--hazard { padding-left:36px; color:var(--dp-ink); }
.dp-key--hazard::after {
  content:""; position:absolute; left:10px; top:1px; bottom:1px; width:16px; border-radius:1px;
  background:url("${KIT_TILE}tile.hazard.stripe-red.png") 0 0 / 32px repeat;
  opacity:.9; box-shadow:inset 0 0 0 1px rgb(0 0 0 / .5);
}
.dp-key--hazard:hover::before, .dp-key--hazard:focus-visible::before {
  background:radial-gradient(circle at 42% 34%, #fff1ea, var(--dp-danger-hot) 26%, var(--dp-danger) 60%, #6b1a10);
  box-shadow:0 0 8px var(--dp-danger-bloom);
}
.dp-key--small { min-height:32px; border-width:6px 7px 8px; border-image-width:6px 7px 8px; padding:0 6px 0 16px; font-size:var(--dp-fs-etch); letter-spacing:.14em; }
.dp-key--small::before { width:6px; height:6px; margin-top:-3px; }
.dp-key--icon { padding:0 6px; min-width:44px; }
.dp-key--icon::before { display:none; }
.dp-key[disabled], .dp-key[aria-disabled="true"] { cursor:not-allowed; opacity:.46; filter:saturate(.5); }
.dp-key[disabled]:hover { filter:saturate(.5); }
.dp-key .dp-icon { flex:0 0 auto; }
.dp-key .dp-icon .accent { fill:var(--dp-lamp-dim); }
.dp-key:hover .dp-icon .accent, .dp-key.is-on .dp-icon .accent, .dp-key[aria-pressed="true"] .dp-icon .accent { fill:var(--dp-lamp); }

/* dp-keybank — commands mounted in a machined rail. */
.dp-keybank { display:flex; flex-wrap:wrap; gap:6px; padding:6px; }
.dp-keybank.dp-plate-hw { padding:8px 10px; }

/* ══ dp-selector — navigation. Legends on a machined rail; the active one is lit and its glass
   below glows, so "go to" never reads as "do". Single row: legends compress, never wrap. ══ */
.dp-selector {
  display:flex; align-items:stretch; justify-content:space-evenly; gap:2px; box-sizing:border-box; min-width:0;
  border:5px solid transparent;
  border-image:url("${HW}bezel-thin.svg") 12 / 12px / 0 stretch;
  background:var(--dp-metal-layers), var(--dp-metal-2);
  padding:3px;
}
.dp-selector__tab {
  -webkit-appearance:none; appearance:none; position:relative; flex:0 1 auto; min-width:0;
  display:flex; align-items:center; justify-content:center; gap:7px; min-height:36px; padding:0 12px;
  border:0; border-radius:2px; cursor:pointer; background:transparent;
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 750, "wdth" 70;
  font-size:var(--dp-fs-etch); letter-spacing:.14em; text-transform:uppercase; white-space:nowrap;
  color:var(--dp-ink-mute); text-shadow:var(--dp-etch-shadow);
  overflow:hidden; text-overflow:ellipsis;
  transition:color var(--dp-d-cut) var(--dp-ease-lamp), background var(--dp-d-cut) var(--dp-ease-lamp);
}
.dp-selector__tab::before { content:""; width:6px; height:6px; border-radius:50%; flex:0 0 auto; background:${LED_OFF}; box-shadow:${LED_RIM}; }
.dp-selector__tab:hover { color:var(--dp-ink-dim); background:rgb(255 255 255 / .03); }
.dp-selector__tab:focus-visible { outline:2px solid var(--dp-lamp); outline-offset:-2px; }
.dp-selector__tab[aria-selected="true"], .dp-selector__tab[aria-current="page"] {
  color:var(--dp-lamp-hot); text-shadow:var(--dp-emit-lamp);
  box-shadow:inset 0 -2px 0 var(--dp-lamp), 0 8px 16px -10px var(--dp-lamp-bloom);
}
.dp-selector__tab[aria-selected="true"]::before, .dp-selector__tab[aria-current="page"]::before { background:${LED_ON}; box-shadow:${LED_ON_GLOW}; }

/* ══ dp-row — a line on the glass: icon, name + sub, reading. Selection is light BEHIND the glass
   (a backlit strip) with the LED pip lit. ══ */
.dp-rows { display:flex; flex-direction:column; margin:0; padding:0; list-style:none; }
.dp-row {
  position:relative; display:grid; grid-template-columns:auto minmax(0, 1fr) auto; align-items:center;
  gap:4px 14px; min-height:46px; box-sizing:border-box; padding:7px 14px 7px 26px;
  color:var(--dp-ink-dim); cursor:default;
  border-top:1px solid rgb(255 255 255 / .04);
  transition:background var(--dp-d-cut) var(--dp-ease-lamp), color var(--dp-d-cut) var(--dp-ease-lamp);
}
.dp-row:first-child { border-top:0; }
button.dp-row, a.dp-row, .dp-row[tabindex] { cursor:pointer; width:100%; text-align:left; font:inherit; background:none; border-left:0; border-right:0; border-bottom:0; }
.dp-row::before {
  content:""; position:absolute; left:9px; top:50%; width:7px; height:7px; margin-top:-3.5px; border-radius:50%;
  background:${LED_OFF}; box-shadow:${LED_RIM};
  transition:background var(--dp-d-cut) var(--dp-ease-lamp), box-shadow var(--dp-d-cut) var(--dp-ease-lamp);
}
.dp-row:hover { background:linear-gradient(90deg, rgb(255 255 255 / .04), transparent 70%); color:var(--dp-ink); }
.dp-row:hover::before { background:radial-gradient(circle at 42% 36%, #8a6b3a, #3d2f19 75%); }
.dp-row:focus-visible { outline:2px solid var(--dp-lamp); outline-offset:-2px; color:var(--dp-ink); }
.dp-row[aria-selected="true"], .dp-row.is-selected, .dp-row[aria-current="true"] {
  color:var(--dp-ink);
  background:linear-gradient(90deg, rgb(255 255 255 / .05), rgb(255 255 255 / .014) 60%, transparent);
  box-shadow:inset 3px 0 0 var(--dp-lamp), inset 0 -1px 0 rgb(255 217 140 / .28), 0 10px 18px -14px var(--dp-lamp-bloom);
}
.dp-row[aria-selected="true"]::before, .dp-row.is-selected::before, .dp-row[aria-current="true"]::before { background:${LED_ON}; box-shadow:${LED_ON_GLOW}; }
.dp-row--danger::before { background:radial-gradient(circle at 42% 34%, #fff1ea, var(--dp-danger-hot) 26%, var(--dp-danger) 60%, #6b1a10); box-shadow:0 0 7px var(--dp-danger-bloom); }
.dp-row__name { display:block; font-family:var(--dp-face-read); font-size:var(--dp-fs-data); font-weight:600; color:inherit; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dp-row__sub { display:block; margin-top:2px; font-family:var(--dp-face-read); font-size:12px; color:var(--dp-ink-mute); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dp-row__read { font-family:var(--dp-face-read); font-variant-numeric:tabular-nums; font-size:var(--dp-fs-data); font-weight:600; color:var(--dp-ink); text-align:right; white-space:nowrap; }
.dp-row[aria-selected="true"] .dp-row__read, .dp-row.is-selected .dp-row__read,
.dp-row[aria-selected="true"] .dp-row__name, .dp-row.is-selected .dp-row__name { color:var(--dp-lamp-hot); text-shadow:var(--dp-emit-lamp); }
.dp-row .dp-icon { color:var(--dp-ink-dim); }
.dp-row .dp-icon .accent { fill:var(--dp-lamp-dim); }
.dp-row:hover .dp-icon, .dp-row.is-selected .dp-icon, .dp-row[aria-selected="true"] .dp-icon { color:var(--dp-ink); }
.dp-row.is-selected .dp-icon .accent, .dp-row[aria-selected="true"] .dp-icon .accent { fill:var(--dp-lamp); }
/* A small meter inside a row: supply, demand, stock — a lit track in a recessed channel. */
.dp-meter { position:relative; height:8px; min-width:60px; border-radius:1px; overflow:hidden;
  background:repeating-linear-gradient(90deg, rgb(255 236 204 / .16) 0 1px, transparent 1px 10%) 0 0 / 100% 2px no-repeat, linear-gradient(180deg, rgb(0 0 0 / .7), rgb(0 0 0 / .35));
  box-shadow:inset 0 1px 2px rgb(0 0 0 / .85), 0 1px 0 rgb(255 236 204 / .07); }
.dp-meter > i { position:absolute; left:0; bottom:1px; height:3px; width:var(--v, 50%); background:linear-gradient(90deg, #8c8576, #d8d0bd); box-shadow:0 0 5px rgb(232 226 212 / .2); }
.dp-meter--lamp > i { background:linear-gradient(90deg, var(--dp-lamp-dim), var(--dp-lamp-hot)); box-shadow:0 0 6px var(--dp-lamp-bloom); }
.dp-meter--danger > i { background:linear-gradient(180deg, var(--dp-danger-hot), var(--dp-danger)); box-shadow:0 0 6px var(--dp-danger-bloom); }

/* ══ dp-switch — a machined rocker. The pressed side sinks; its LED pip is lit. ══ */
.dp-switch {
  -webkit-appearance:none; appearance:none; display:inline-grid; grid-template-columns:1fr 1fr; gap:2px;
  min-width:116px; height:34px; padding:3px; box-sizing:border-box; cursor:pointer;
  border:1px solid rgb(0 0 0 / .85); border-radius:3px;
  background:linear-gradient(180deg, rgb(0 0 0 / .6), rgb(0 0 0 / .25));
  box-shadow:inset 0 1px 3px rgb(0 0 0 / .85), 0 1px 0 rgb(255 236 204 / .07);
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 760, "wdth" 70; font-size:12px; letter-spacing:.16em; text-transform:uppercase;
}
.dp-switch > span {
  display:flex; align-items:center; justify-content:center; gap:6px; border-radius:2px; color:var(--dp-ink-mute);
  background:linear-gradient(180deg, #20252d, #181c22);
  box-shadow:inset 0 1px 0 rgb(255 236 204 / .07);
  transition:background var(--dp-d-cut) var(--dp-ease-lamp), box-shadow var(--dp-d-cut) var(--dp-ease-lamp), color var(--dp-d-cut) var(--dp-ease-lamp);
}
.dp-switch > span::before { content:""; width:6px; height:6px; border-radius:50%; background:${LED_OFF}; box-shadow:${LED_RIM}; }
.dp-switch[aria-checked="false"] > span:first-child,
.dp-switch[aria-checked="true"] > span:last-child {
  color:var(--dp-ink); background:linear-gradient(180deg, #2a303a, #20252d);
  box-shadow:inset 0 1px 0 rgb(255 236 204 / .14);
}
.dp-switch[aria-checked="true"] > span:last-child::before { background:${LED_ON}; box-shadow:${LED_ON_GLOW}; }
.dp-switch[aria-checked="false"] > span:first-child::before { background:radial-gradient(circle at 42% 34%, #fbf5e8, #bdb6a5 55%, #6b675d); box-shadow:0 0 5px rgb(232 226 212 / .3); }
.dp-switch:focus-visible { outline:2px solid var(--dp-lamp); outline-offset:3px; }

/* ══ dp-range — an on-glass scale: etched ticks, a lit index line, a gripped fader cap. ══ */
.dp-range {
  --dp-range-pct:50%;
  -webkit-appearance:none; appearance:none; width:100%; min-width:160px; height:32px; margin:0; background:transparent; cursor:pointer;
}
.dp-range::-webkit-slider-runnable-track {
  height:12px; border-radius:2px;
  background:
    repeating-linear-gradient(90deg, rgb(255 236 204 / .2) 0 1px, transparent 1px 10%) 0 0 / 100% 3px no-repeat,
    linear-gradient(90deg, var(--dp-lamp-dim), var(--dp-lamp-hot) var(--dp-range-pct), transparent var(--dp-range-pct)) 0 6px / 100% 2px no-repeat,
    linear-gradient(180deg, rgb(0 0 0 / .7), rgb(0 0 0 / .32));
  box-shadow:inset 0 1px 2px rgb(0 0 0 / .85), 0 1px 0 rgb(255 236 204 / .07);
}
.dp-range::-webkit-slider-thumb {
  -webkit-appearance:none; appearance:none; width:18px; height:30px; margin-top:-9px; border-radius:2px;
  border:1px solid #05070a;
  background:
    linear-gradient(90deg, transparent 7px, var(--dp-lamp-hot) 7px 9px, transparent 9px) 0 0 / 100% 100% no-repeat,
    repeating-linear-gradient(180deg, rgb(255 236 204 / .16) 0 1px, rgb(0 0 0 / .5) 1px 3px) 0 7px / 100% 16px no-repeat,
    linear-gradient(180deg, #666f7f, #353c48 55%, #1c2027);
  box-shadow:inset 0 1px 0 rgb(255 236 204 / .38), 0 3px 6px rgb(0 0 0 / .65), 0 0 8px var(--dp-lamp-bloom-soft);
}
.dp-range:focus-visible { outline:2px solid var(--dp-lamp); outline-offset:4px; }
.dp-range::-moz-range-track { height:12px; background:rgb(0 0 0 / .55); border-radius:2px; }
.dp-range::-moz-range-progress { height:2px; background:var(--dp-lamp); }
.dp-range::-moz-range-thumb { width:18px; height:30px; border-radius:2px; border:1px solid #05070a; background:#3a414c; }

/* ══ dp-stepper — [−] reading [+] on keys. ══ */
.dp-stepper { display:inline-flex; align-items:center; gap:4px; }
.dp-stepper__read { min-width:64px; text-align:center; font-family:var(--dp-face-read); font-variant-numeric:tabular-nums; font-weight:650; color:var(--dp-ink); text-shadow:var(--dp-emit); }

/* ══ dp-tile — a keyart card: a produced render framed as an instrument, a placard caption.
   Selection is light bleeding out of the bezel, never an outline outside the column. ══ */
.dp-tile {
  -webkit-appearance:none; appearance:none; position:relative; display:grid; grid-template-rows:1fr auto;
  box-sizing:border-box; padding:0; margin:0; min-width:180px; min-height:150px; cursor:pointer; text-align:left;
  border:5px solid transparent;
  border-image:url("${HW}bezel-thin.svg") 12 / 12px / 0 stretch;
  background:var(--dp-metal-layers), var(--dp-metal-2);
  box-shadow:0 10px 24px rgb(0 0 0 / .5); font:inherit; color:var(--dp-ink);
  transition:transform var(--dp-d-settle) var(--dp-ease-settle), box-shadow var(--dp-d-settle) var(--dp-ease-settle);
}
.dp-tile__art { position:relative; min-height:110px; background-size:cover; background-position:center; filter:saturate(.9) brightness(.82); transition:filter var(--dp-d-settle) var(--dp-ease-settle); }
.dp-tile__art::after { content:""; position:absolute; inset:0; background:linear-gradient(180deg, rgb(255 255 255 / .05), transparent 35%, rgb(0 0 0 / .45)); }
.dp-tile__cap { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 10px 9px; background:var(--dp-metal-layers), var(--dp-metal-3); }
.dp-tile__name { display:flex; align-items:center; gap:8px; font-family:var(--dp-face-etch); font-variation-settings:"wght" 780, "wdth" 90; font-size:var(--dp-fs-data); letter-spacing:.1em; text-transform:uppercase; }
.dp-tile__name::before { content:""; width:6px; height:6px; border-radius:50%; background:${LED_OFF}; box-shadow:${LED_RIM}; }
.dp-tile:hover { transform:translateY(-2px); box-shadow:0 16px 30px rgb(0 0 0 / .55); }
.dp-tile:hover .dp-tile__art { filter:saturate(1) brightness(1); }
.dp-tile:focus-visible { outline:2px solid var(--dp-lamp); outline-offset:-3px; }
.dp-tile[aria-pressed="true"], .dp-tile.is-selected { box-shadow:0 0 26px rgb(242 185 80 / .32), 0 10px 24px rgb(0 0 0 / .5); }
.dp-tile[aria-pressed="true"]::after, .dp-tile.is-selected::after {
  content:""; position:absolute; inset:0; pointer-events:none;
  box-shadow:inset 3px 0 0 var(--dp-lamp), inset 0 0 26px rgb(242 185 80 / .22);
}
.dp-tile[aria-pressed="true"] .dp-tile__art, .dp-tile.is-selected .dp-tile__art { filter:saturate(1) brightness(1); }
.dp-tile[aria-pressed="true"] .dp-tile__name, .dp-tile.is-selected .dp-tile__name { color:var(--dp-lamp-hot); text-shadow:var(--dp-emit-lamp); }
.dp-tile[aria-pressed="true"] .dp-tile__name::before, .dp-tile.is-selected .dp-tile__name::before { background:${LED_ON}; box-shadow:${LED_ON_GLOW}; }

/* ══ dp-dialog — a modal instrument over a dimmed world. ══ */
.dp-scrim { position:fixed; inset:0; z-index:40; display:grid; place-items:center; background:radial-gradient(ellipse at center, rgb(0 0 0 / .45), rgb(0 0 0 / .78)); }
.dp-dialog { width:min(560px, calc(100vw - 48px)); }
.dp-dialog__title { margin:0 0 10px; font-family:var(--dp-face-display); font-variation-settings:"wght" 800, "wdth" 110; font-size:22px; letter-spacing:.06em; text-transform:uppercase; }
.dp-dialog__body { margin:0 0 18px; font-family:var(--dp-face-read); font-size:var(--dp-fs-data); line-height:1.5; color:var(--dp-ink-dim); }
.dp-dialog__keys { display:flex; justify-content:flex-end; gap:10px; }
.dp-dialog--danger .dp-dialog__title { color:var(--dp-danger-hot); text-shadow:0 0 12px var(--dp-danger-bloom); }

/* ══ dp-tip — a tooltip: a small glass. ══ */
.dp-tip { max-width:320px; font-family:var(--dp-face-read); font-size:12px; line-height:1.45; color:var(--dp-ink-dim); }
.dp-tip strong { color:var(--dp-ink); font-weight:650; }

/* ══ dp-empty — a designed empty slot: a stencilled bay, what is missing, when it comes back. ══ */
.dp-empty {
  position:relative; display:grid; justify-items:center; align-content:center; gap:8px; min-height:120px;
  margin:4px; padding:20px 18px; text-align:center; color:var(--dp-ink-mute); border-radius:2px;
  background:linear-gradient(180deg, rgb(0 0 0 / .42), rgb(0 0 0 / .2));
  box-shadow:inset 0 3px 10px rgb(0 0 0 / .65), inset 0 -1px 0 rgb(255 236 204 / .05), 0 1px 0 rgb(255 255 255 / .03);
}
.dp-empty__head {
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 900, "wdth" 62; font-size:var(--dp-fs-read);
  letter-spacing:.32em; text-transform:uppercase; color:rgb(150 148 142 / .85); text-shadow:0 1px 0 rgb(0 0 0 / .8);
}
.dp-empty__body { max-width:40ch; font-family:var(--dp-face-read); font-size:12px; line-height:1.5; color:var(--dp-ink-mute); }
.dp-empty__read { font-family:var(--dp-face-read); font-variant-numeric:tabular-nums; font-weight:650; font-size:var(--dp-fs-data); color:var(--dp-ink); text-shadow:var(--dp-emit); }
.dp-loading { position:relative; height:3px; overflow:hidden; background:rgb(255 255 255 / .06); border-radius:2px; }
.dp-loading::after { content:""; position:absolute; inset:0 60% 0 0; background:linear-gradient(90deg, transparent, var(--dp-lamp), transparent); animation:dp-loading 1.2s var(--dp-ease-lamp) infinite; }
@keyframes dp-loading { from { transform:translateX(-100%); } to { transform:translateX(260%); } }

/* ══ dp-kbd — a key prompt: the device's own key, drawn as a tiny cap. ══ */
.dp-kbd {
  display:inline-grid; place-items:center; min-width:22px; height:22px; padding:0 6px 2px; box-sizing:border-box;
  border-style:solid; border-color:transparent; border-width:3px 4px 5px;
  border-image:url("${HW}keycap.svg") 10 10 12 / 3px 4px 5px / 0 stretch;
  background:var(--dp-metal-3);
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 800, "wdth" 75; font-size:12px; line-height:1; letter-spacing:.04em;
  color:var(--dp-ink); text-transform:uppercase; vertical-align:middle; text-shadow:none;
}
.dp-key--primary .dp-kbd { color:var(--dp-lamp-hot); }
.dp-prompt { display:inline-flex; align-items:center; gap:8px; font-family:var(--dp-face-read); font-size:12px; color:var(--dp-ink-dim); }

/* ══ Entry choreography: the bezel settles, the glass lights, the content types on. ══ */
@keyframes dp-settle-in { from { opacity:0; transform:translateY(8px) scale(.995); } to { opacity:1; transform:none; } }
@keyframes dp-glass-light { from { opacity:0; } 30% { opacity:.55; } to { opacity:0; } }
@keyframes dp-type-in { from { opacity:0; transform:translateX(-6px); } to { opacity:1; transform:none; } }
.dp-enter { animation:dp-settle-in 320ms var(--dp-ease-settle) both; }
.dp-enter.dp-mfd::after, .dp-enter.dp-glass::after {
  content:""; position:absolute; inset:0; pointer-events:none; z-index:2;
  background:linear-gradient(180deg, rgb(255 244 222 / .10), rgb(200 215 255 / .03) 40%, transparent);
  animation:dp-glass-light 620ms var(--dp-ease-lamp) 120ms both;
}
.dp-enter .dp-stagger > * { animation:dp-type-in 260ms var(--dp-ease-settle) both; animation-delay:calc(180ms + var(--dp-i, 0) * 40ms); }

@media (prefers-reduced-motion:reduce) {
  .dp-enter, .dp-enter .dp-stagger > *, .dp-enter.dp-mfd::after, .dp-enter.dp-glass::after { animation:none; }
  .dp-loading::after { animation:none; inset:0; opacity:.5; }
  .dp-key, .dp-row, .dp-tile, .dp-tile__art, .dp-switch > span, .dp-selector__tab { transition:none; }
}
html.sf-reduce-motion .dp-enter, html.sf-reduce-motion .dp-enter .dp-stagger > *,
html.sf-reduce-motion .dp-enter.dp-mfd::after, html.sf-reduce-motion .dp-enter.dp-glass::after { animation:none; }

/* ══ High contrast (the game's own mode) and forced colours (the OS's). ══ */
html.sf-high-contrast .dp-mfd::before, html.sf-high-contrast .dp-glass::before { display:none; }
html.sf-high-contrast .dp-mfd, html.sf-high-contrast .dp-glass, html.sf-high-contrast .dp-placard,
html.sf-high-contrast .dp-plate-hw, html.sf-high-contrast .dp-tile, html.sf-high-contrast .dp-selector {
  border-image:none; border-color:rgb(255 255 255 / .85); border-width:2px; background:#000; box-shadow:none;
}
html.sf-high-contrast .dp-key { border-image:none; border:2px solid #fff; background:#000; color:#fff; }
@media (forced-colors:active) {
  .dp-mfd::before, .dp-glass::before { display:none; }
  .dp-mfd, .dp-glass { backdrop-filter:none; }
  .dp-mfd, .dp-glass, .dp-placard, .dp-plate-hw, .dp-tile, .dp-selector {
    border-image:none; border:1px solid CanvasText; background:Canvas; box-shadow:none; forced-color-adjust:none; color:CanvasText;
  }
  .dp-key, .dp-kbd, .dp-selector__tab { border-image:none; border:1px solid ButtonText; background:ButtonFace; color:ButtonText; text-shadow:none; }
  .dp-key::before, .dp-key--hazard::after, .dp-row::before, .dp-led, .dp-switch > span::before, .dp-selector__tab::before, .dp-tile__name::before { forced-color-adjust:none; background:ButtonText; box-shadow:none; }
  .dp-row[aria-selected="true"], .dp-row.is-selected, .dp-selector__tab[aria-selected="true"] { background:Highlight; color:HighlightText; }
  .dp-switch > span { background:ButtonFace; color:ButtonText; box-shadow:none; }
  .dp-switch[aria-checked="true"] > span:last-child { background:Highlight; color:HighlightText; }
  .dp-rule, .dp-section-head::after { background:CanvasText; height:1px; }
  .dp-empty { background:none; border:1px dashed CanvasText; }
}
`;
