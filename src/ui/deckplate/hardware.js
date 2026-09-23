// Deckplate controls -- every command, row, tab, switch, slider and prompt the screens assemble.
//
// PRINTED AND LIT (design/frontend/ONE_PHOTOGRAPH.md section 9; owner ruling 2026-09-22). This
// file used to be "the physical layer": SVG bezels with fasteners, smoked glass with a specular
// sweep and a smudge tile, keycaps over a brushed-steel photograph, an LED lens painted into every
// control as "the one state mechanic", placards with screw caps. The owner looked at it and said
// CSS pretending to be a physical material looks awful. All of it is gone; the CLASS NAMES are
// kept, because screens, tests and probes address them.
//
//   field    a flat colour with a hard edge. Nothing here has thickness or a light direction.
//   the cut  one 45deg chamfer on the top-right corner of a field you can PRESS. Things you only
//            read are never cut, so the grammar reads at a glance: cut corner = you can press it.
//            The corner is painted by the fill gradient, not clip-path, so a pressed key can still
//            throw lamp light past its own edge (clip-path clips box-shadow).
//   state    is light on geometry: the cut edge lights (--dp-cut-lit), a lamp bar runs under the
//            open tab, the one consequential verb IS the lamp. Focus is a 2px bone bracket on the
//            leading edge (--dp-bracket) -- never amber, which means "live".
//
// Floors: 12 px type, 4.5:1 text measured on composited pixels (scripts/ui-contrast.mjs), focus
// always visible, reduced motion swaps every movement for an instant state, forced colours hand
// every surface back to the system palette.

/** The cut, as the fill layer of a pressable field. --dpk-fill is set per state on the element. */
const CUT_FILL = 'linear-gradient(225deg, transparent calc(var(--dp-cut) * .7071), var(--dpk-fill) 0)';

export const DECKPLATE_HARDWARE_CSS = `
:root {
  /* The old surface names, kept because HUD and overlay sheets still read them, now paint a flat
     field or nothing. The smoked-glass recipe (specular band, key-light falloff, smudge tile, lit
     rim, stand-off shadow) and the brushed-metal recipe (anisotropic sheen, scratch, brush and
     grain tiles) are gone with their tokens. */
  --dp-glass-layers:linear-gradient(var(--dp-field) 0 0);
  --dp-glass-solid:linear-gradient(var(--dp-field) 0 0);
  --dp-glass-flight:linear-gradient(rgb(8 10 14 / .72) 0 0);
  --dp-glass-depth:0 0 0 0 transparent;
  --dp-stand-off:0 0 0 0 transparent;
  /* good news reads in bone with its sign or arrow: the deckplate carries no green */
  --k-good:#d8d2c4;
  /* Emission: data you read glows faintly cool; lamp readings glow warm. */
  --dp-emit:0 0 10px rgb(205 222 255 / .16), var(--dp-text-legible);
  --dp-emit-lamp:0 0 12px var(--dp-lamp-bloom), 0 0 2px rgb(255 217 140 / .45);
}
/* One focus colour. styles/ui.css forces every ring to the retired blue --accent with
   *:focus-visible {... !important}; only the COLOUR is restated here (one step more specific), so
   width and offset stay theirs. Bone, never amber: amber means live. */
:root :focus-visible { outline-color:var(--dp-ink) !important; }
html.sf-high-contrast :focus-visible { outline-color:#fff !important; }

/* == dp-mfd / dp-glass -- an instrument surface: a printed field. No bezel, no glass. == */
.dp-mfd, .dp-glass {
  position:relative; box-sizing:border-box; color:var(--dp-ink);
  background:var(--dp-field); padding:18px 22px;
}
.dp-glass { padding:12px 14px; }
.dp-plate-hw { box-sizing:border-box; background:var(--dp-field); }
/* Data you read emits. */
.dp-mfd :is(h2, h3, b, strong, .dp-row__read, .dp-read), .dp-glass :is(h2, h3, b, strong, .dp-row__read, .dp-read) { text-shadow:var(--dp-emit); }

/* == dp-placard -- a title printed on the frame, not engraved into a plate. == */
.dp-placard { display:inline-flex; align-items:center; gap:14px; box-sizing:border-box; padding:8px 0 9px; }
.dp-placard__title {
  margin:0; font-family:var(--dp-face-display); font-variation-settings:"wght" 800, "wdth" 125;
  font-size:clamp(22px, calc(30px * var(--dp-s, 1)), 40px); line-height:1; letter-spacing:.06em;
  text-transform:uppercase; color:var(--dp-ink); text-shadow:var(--dp-text-legible);
}
.dp-placard__sub {
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 62;
  font-size:var(--dp-fs-etch); letter-spacing:.2em; text-transform:uppercase; color:var(--dp-ink-mute);
}

/* == dp-legend -- a printed label; dp-rule -- the hairline between sections. == */
.dp-legend {
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 62;
  font-size:var(--dp-fs-etch); letter-spacing:.18em; text-transform:uppercase; color:var(--dp-ink-mute);
}
.dp-rule { height:1px; margin:10px 0; background:var(--dp-rule); }
.dp-section-head { display:flex; align-items:baseline; gap:12px; margin:0 0 8px; }
.dp-section-head .dp-legend { color:var(--dp-ink-dim); }
.dp-section-head::after { content:""; flex:1; align-self:center; height:1px; order:5; background:var(--dp-rule); }
.dp-section-head > .dp-legend:last-child:not(:first-child) { order:6; }

/* == dp-bead -- a status lamp: a flat emitted dot, not a lens. == */
.dp-bead { display:inline-block; width:7px; height:7px; border-radius:50%; flex:0 0 auto; background:var(--dp-rule-hi); }
.dp-bead.is-on { background:var(--dp-lamp); box-shadow:0 0 8px var(--dp-lamp-bloom); }
.dp-bead.is-danger { background:var(--dp-danger); box-shadow:0 0 8px var(--dp-danger-bloom); }

/* == dp-key -- a command. A ghost field with the cut; the primary IS the lamp. == */
.dp-key {
  --dpk-fill:var(--dp-field-ink); --dpk-cut:none; --dpk-bracket:none; --dpk-rule:none;
  -webkit-appearance:none; appearance:none; position:relative; box-sizing:border-box;
  display:inline-flex; align-items:center; justify-content:center; gap:10px;
  min-height:var(--dp-key-h-2); margin:0; cursor:pointer;
  border:0; border-radius:0; outline-offset:2px;
  background:var(--dpk-cut), var(--dpk-bracket), var(--dpk-rule), ${CUT_FILL};
  padding:0 calc(var(--dp-cut) + 12px) 0 16px;
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 92;
  font-size:var(--dp-fs-data); letter-spacing:.1em; text-transform:uppercase; line-height:1;
  color:var(--dp-ink); text-shadow:none;
  transition:color var(--dp-d-cut) var(--dp-ease-lamp), box-shadow var(--dp-d-cut) var(--dp-ease-lamp);
}
.dp-key:hover { --dpk-fill:var(--dp-field-ink-hi); --dpk-cut:var(--dp-cut-lit); }
.dp-key:focus-visible { outline:2px solid transparent; --dpk-fill:var(--dp-field-ink-hi); --dpk-cut:var(--dp-cut-lit); --dpk-bracket:var(--dp-bracket); }
.dp-key:active, .dp-key.is-pressed { --dpk-fill:rgb(232 226 212 / .05); }
@media (forced-colors:active) { .dp-key:focus-visible { outline:2px solid Highlight; } }
.dp-key[aria-pressed="true"], .dp-key.is-on { --dpk-cut:var(--dp-cut-lit); color:var(--dp-lamp-hot); }
/* The screen's ONE consequential verb (UNDOCK, LAUNCH, BUY): the field is the lamp itself. */
.dp-key--primary {
  --dpk-fill:var(--dp-lamp);
  min-height:var(--dp-key-h); padding:0 calc(var(--dp-cut) + 20px) 0 22px;
  font-variation-settings:"wght" 800, "wdth" 100; font-size:var(--dp-fs-body); letter-spacing:.06em;
  color:var(--dp-metal-0);
}
.dp-key--primary:is(:hover, :focus-visible) { --dpk-fill:var(--dp-lamp-hot); --dpk-cut:none; box-shadow:var(--dp-lamp-glow); }
.dp-key--primary:active { --dpk-fill:var(--dp-lamp-dim); }
.dp-key--primary .dp-icon { color:var(--dp-metal-0); }
.dp-key--primary .dp-icon .accent { fill:var(--dp-metal-0); }
.dp-key--primary .dp-kbd { margin-left:4px; border-color:rgb(11 13 16 / .45); color:var(--dp-metal-0); }
/* Destructive: bone at rest with a red rule along the bottom; red arrives with intent. */
.dp-key--hazard { --dpk-rule:linear-gradient(0deg, var(--dp-danger) 2px, transparent 0); }
.dp-key--hazard:is(:hover, :focus-visible) { --dpk-fill:var(--dp-danger); --dpk-cut:none; color:var(--dp-metal-0); box-shadow:0 0 18px var(--dp-danger-bloom); }
.dp-key--small { min-height:32px; padding:0 calc(var(--dp-cut) + 8px) 0 12px; font-size:var(--dp-fs-etch); letter-spacing:.12em; }
.dp-key--icon { padding:0 calc(var(--dp-cut) + 4px) 0 8px; min-width:var(--dp-key-h-2); }
.dp-key[disabled], .dp-key[aria-disabled="true"] { --dpk-fill:rgb(232 226 212 / .04); --dpk-cut:none; cursor:not-allowed; color:var(--dp-ink-mute); box-shadow:none; }
.dp-key--primary[disabled], .dp-key--primary[aria-disabled="true"] {
  --dpk-fill:transparent; --dpk-rule:linear-gradient(0deg, var(--dp-lamp-dim) 1px, transparent 0); color:var(--dp-ink-mute);
}
.dp-key .dp-icon { flex:0 0 auto; }
.dp-key .dp-icon .accent { fill:var(--dp-lamp-dim); }
.dp-key:hover .dp-icon .accent, .dp-key.is-on .dp-icon .accent, .dp-key[aria-pressed="true"] .dp-icon .accent { fill:var(--dp-lamp); }

/* dp-keybank -- a row of commands. No rail, no tray: the keys stand on the frame. */
.dp-keybank { display:flex; flex-wrap:wrap; gap:8px; padding:0; }

/* == dp-selector -- navigation: words on a rail, the open one lit by a lamp bar beneath it. Going
   somewhere is not doing something, so a tab is never a field and never cut. == */
.dp-selector {
  display:flex; align-items:stretch; justify-content:flex-start; gap:clamp(10px, 1.2vw, 22px); box-sizing:border-box; min-width:0;
  border:0; padding:0; background:linear-gradient(0deg, var(--dp-rule-hi) 1px, transparent 0);
}
.dp-selector__tab {
  -webkit-appearance:none; appearance:none; position:relative; flex:0 1 auto; min-width:0;
  display:flex; align-items:center; justify-content:center; gap:7px; min-height:36px; padding:0 2px;
  border:0; border-radius:0; cursor:pointer; background:transparent;
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 78;
  font-size:var(--dp-fs-etch); letter-spacing:.14em; text-transform:uppercase; white-space:nowrap;
  color:var(--dp-ink-dim); overflow:hidden; text-overflow:ellipsis;
  transition:color var(--dp-d-cut) var(--dp-ease-lamp);
}
.dp-selector__tab:hover { color:var(--dp-ink); }
.dp-selector__tab:focus-visible { outline:2px solid var(--dp-ink); outline-offset:2px; color:var(--dp-ink); }
.dp-selector__tab[aria-selected="true"], .dp-selector__tab[aria-current="page"] {
  color:var(--dp-ink);
  background:linear-gradient(0deg, var(--dp-lamp) 2px, transparent 0);
  box-shadow:0 8px 10px -8px var(--dp-lamp-bloom);
}

/* == dp-row -- a line in a register: icon, name + sub, reading. Selected is a lamp bar on the
   leading edge and a faint ink field; focus is the bone bracket. == */
.dp-rows { display:flex; flex-direction:column; margin:0; padding:0; list-style:none; }
.dp-row {
  position:relative; display:grid; grid-template-columns:auto minmax(0, 1fr) auto; align-items:center;
  gap:4px 14px; min-height:46px; box-sizing:border-box; padding:7px 14px 7px 16px;
  color:var(--dp-ink-dim); cursor:default;
  border-top:1px solid var(--dp-rule);
  transition:background-color var(--dp-d-cut) var(--dp-ease-lamp), color var(--dp-d-cut) var(--dp-ease-lamp);
}
.dp-row:first-child { border-top:0; }
button.dp-row, a.dp-row, .dp-row[tabindex] { cursor:pointer; width:100%; text-align:left; font:inherit; background:none; border-left:0; border-right:0; border-bottom:0; }
.dp-row:hover { background:rgb(232 226 212 / .05); color:var(--dp-ink); }
.dp-row:focus-visible { outline:2px solid transparent; color:var(--dp-ink); background:var(--dp-bracket), linear-gradient(var(--dp-field-ink) 0 0); }
.dp-row[aria-selected="true"], .dp-row.is-selected, .dp-row[aria-current="true"] {
  color:var(--dp-ink);
  background:linear-gradient(90deg, var(--dp-lamp) 2px, transparent 0), linear-gradient(var(--dp-field-ink) 0 0);
}
.dp-row:is([aria-selected="true"], .is-selected, [aria-current="true"]):focus-visible { background:var(--dp-bracket), linear-gradient(var(--dp-field-ink-hi) 0 0); }
.dp-row--danger { background:linear-gradient(90deg, var(--dp-danger) 2px, transparent 0); }
.dp-row__name { display:block; font-family:var(--dp-face-read); font-size:var(--dp-fs-data); font-weight:600; color:inherit; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dp-row__sub { display:block; margin-top:2px; font-family:var(--dp-face-read); font-size:12px; color:var(--dp-ink-mute); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dp-row__read { font-family:var(--dp-face-read); font-variant-numeric:tabular-nums; font-size:var(--dp-fs-data); font-weight:600; color:var(--dp-phos); text-align:right; white-space:nowrap; }
.dp-row[aria-selected="true"] .dp-row__name, .dp-row.is-selected .dp-row__name { color:var(--dp-ink); }
.dp-row .dp-icon { color:var(--dp-ink-dim); }
.dp-row .dp-icon .accent { fill:var(--dp-lamp-dim); }
.dp-row:hover .dp-icon, .dp-row.is-selected .dp-icon, .dp-row[aria-selected="true"] .dp-icon { color:var(--dp-ink); }
.dp-row.is-selected .dp-icon .accent, .dp-row[aria-selected="true"] .dp-icon .accent { fill:var(--dp-lamp); }
/* A small meter inside a row: supply, demand, stock -- a 2px fill on a 2px rail. */
.dp-meter { position:relative; height:6px; min-width:60px; background:linear-gradient(var(--dp-rule-hi) 0 0) 0 50% / 100% 2px no-repeat; }
.dp-meter > i { position:absolute; left:0; top:50%; height:2px; margin-top:-1px; width:var(--v, 50%); background:var(--dp-ink-dim); }
.dp-meter--lamp > i { background:var(--dp-lamp); box-shadow:0 0 6px var(--dp-lamp-bloom); }
.dp-meter--danger > i { background:var(--dp-danger); box-shadow:0 0 6px var(--dp-danger-bloom); }

/* == dp-switch -- two words, one lit (OFF . ON). Not a rocker, not a pill. == */
.dp-switch {
  -webkit-appearance:none; appearance:none; display:inline-flex; gap:18px; align-items:stretch;
  min-height:32px; padding:0; box-sizing:border-box; cursor:pointer; border:0; border-radius:0;
  background:linear-gradient(0deg, var(--dp-rule-hi) 1px, transparent 0);
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 78; font-size:var(--dp-fs-etch); letter-spacing:.14em; text-transform:uppercase;
}
.dp-switch > span { display:flex; align-items:center; padding:0 2px; color:var(--dp-ink-dim); transition:color var(--dp-d-cut) var(--dp-ease-lamp); }
.dp-switch[aria-checked="false"] > span:first-child,
.dp-switch[aria-checked="true"] > span:last-child {
  color:var(--dp-ink); background:linear-gradient(0deg, var(--dp-lamp) 2px, transparent 0);
}
.dp-switch:hover > span { color:var(--dp-ink); }
.dp-switch:focus-visible { outline:2px solid var(--dp-ink); outline-offset:4px; }

/* == dp-range -- a line, its fill, and a bar where the value is. The value reads beside it. == */
.dp-range {
  --dp-range-pct:50%;
  -webkit-appearance:none; appearance:none; width:100%; min-width:160px; height:28px; margin:0; background:transparent; cursor:pointer;
}
.dp-range::-webkit-slider-runnable-track {
  height:18px;
  background:
    linear-gradient(var(--dp-lamp) 0 0) 0 50% / var(--dp-range-pct) 2px no-repeat,
    linear-gradient(var(--dp-rule-hi) 0 0) 0 50% / 100% 2px no-repeat;
}
.dp-range::-webkit-slider-thumb {
  -webkit-appearance:none; appearance:none; width:3px; height:18px; margin-top:0; border:0; border-radius:0;
  background:var(--dp-ink);
}
.dp-range:is(:hover, :focus-visible)::-webkit-slider-thumb { background:var(--dp-lamp-hot); box-shadow:0 0 10px var(--dp-lamp-bloom); }
.dp-range:focus-visible { outline:2px solid var(--dp-ink); outline-offset:4px; }
.dp-range::-moz-range-track { height:2px; background:var(--dp-rule-hi); }
.dp-range::-moz-range-progress { height:2px; background:var(--dp-lamp); }
.dp-range::-moz-range-thumb { width:3px; height:18px; border:0; border-radius:0; background:var(--dp-ink); }

/* == dp-stepper -- [-] reading [+]. == */
.dp-stepper { display:inline-flex; align-items:center; gap:6px; }
.dp-stepper__read { min-width:64px; text-align:center; font-family:var(--dp-face-read); font-variant-numeric:tabular-nums; font-weight:650; color:var(--dp-phos); text-shadow:var(--dp-phos-emit-soft); }

/* == dp-tile -- keyart: a produced render with its caption printed under it. Pressable, so it has
   the cut; chosen, the cut and the leading edge light. == */
.dp-tile {
  -webkit-appearance:none; appearance:none; position:relative; display:grid; grid-template-rows:1fr auto;
  box-sizing:border-box; padding:0; margin:0; min-width:180px; min-height:150px; cursor:pointer; text-align:left;
  border:0; background:var(--dp-field); clip-path:var(--dp-cut-shape);
  font:inherit; color:var(--dp-ink);
}
.dp-tile__art { position:relative; min-height:110px; background-size:cover; background-position:center; filter:saturate(.9) brightness(.82); transition:filter var(--dp-d-settle) var(--dp-ease-settle); }
.dp-tile__cap { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 12px 9px; }
.dp-tile__name { display:flex; align-items:center; gap:8px; font-family:var(--dp-face-etch); font-variation-settings:"wght" 760, "wdth" 90; font-size:var(--dp-fs-data); letter-spacing:.1em; text-transform:uppercase; }
.dp-tile:hover .dp-tile__art { filter:saturate(1) brightness(1); }
.dp-tile:focus-visible { outline:2px solid transparent; background:var(--dp-bracket), linear-gradient(var(--dp-field) 0 0); }
.dp-tile[aria-pressed="true"], .dp-tile.is-selected {
  background:var(--dp-cut-lit), linear-gradient(90deg, var(--dp-lamp) 2px, transparent 0), linear-gradient(var(--dp-field) 0 0);
}
.dp-tile[aria-pressed="true"] .dp-tile__art, .dp-tile.is-selected .dp-tile__art { filter:saturate(1) brightness(1); }
.dp-tile[aria-pressed="true"] .dp-tile__name, .dp-tile.is-selected .dp-tile__name { color:var(--dp-lamp-hot); }

/* == dp-dialog -- a modal over a dimmed world: the one sheet, its free corner cut. == */
.dp-scrim { position:fixed; inset:0; z-index:40; display:grid; place-items:center; background:rgb(4 5 8 / .72); }
.dp-dialog { width:min(560px, calc(100vw - 48px)); box-sizing:border-box; padding:24px 28px; background:var(--dp-sheet); clip-path:var(--dp-cut-sheet-shape); }
.dp-dialog__title { margin:0 0 10px; font-family:var(--dp-face-display); font-variation-settings:"wght" 800, "wdth" 110; font-size:22px; letter-spacing:.06em; text-transform:uppercase; }
.dp-dialog__body { margin:0 0 18px; font-family:var(--dp-face-read); font-size:var(--dp-fs-data); line-height:1.5; color:var(--dp-ink-dim); }
.dp-dialog__keys { display:flex; justify-content:flex-end; gap:10px; }
.dp-dialog--danger .dp-dialog__title { color:var(--dp-danger-hot); text-shadow:0 0 12px var(--dp-danger-bloom); }

/* == dp-tip -- a tooltip: a small printed field. == */
.dp-tip { max-width:320px; padding:8px 10px; background:var(--dp-field); font-family:var(--dp-face-read); font-size:12px; line-height:1.45; color:var(--dp-ink-dim); }
.dp-tip strong { color:var(--dp-ink); font-weight:650; }

/* == dp-empty -- a designed empty slot: what is missing and when it comes back. No recessed bay. == */
.dp-empty {
  position:relative; display:grid; justify-items:start; align-content:center; gap:8px; min-height:120px;
  margin:4px 0; padding:20px 0; text-align:left; color:var(--dp-ink-mute);
  border-top:1px solid var(--dp-rule);
}
.dp-empty__head { font-family:var(--dp-face-etch); font-variation-settings:"wght" 800, "wdth" 62; font-size:var(--dp-fs-read); letter-spacing:.24em; text-transform:uppercase; color:var(--dp-ink-mute); }
.dp-empty__body { max-width:40ch; font-family:var(--dp-face-read); font-size:12px; line-height:1.5; color:var(--dp-ink-mute); }
.dp-empty__read { font-family:var(--dp-face-read); font-variant-numeric:tabular-nums; font-weight:650; font-size:var(--dp-fs-data); color:var(--dp-phos); text-shadow:var(--dp-phos-emit-soft); }
.dp-loading { position:relative; height:2px; overflow:hidden; background:var(--dp-rule); }
.dp-loading::after { content:""; position:absolute; inset:0 60% 0 0; background:linear-gradient(90deg, transparent, var(--dp-lamp), transparent); animation:dp-loading 1.2s var(--dp-ease-lamp) infinite; }
@keyframes dp-loading { from { transform:translateX(-100%); } to { transform:translateX(260%); } }

/* == dp-kbd -- a key prompt: a glyph from a manual (a hairline box), not a little plastic cap. == */
.dp-kbd {
  display:inline-grid; place-items:center; min-width:var(--dp-hint-h); height:var(--dp-hint-h); padding:0 6px; box-sizing:border-box;
  border:1px solid var(--dp-rule-hi); border-radius:var(--dp-r-plate); background:none;
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 86; font-size:12px; line-height:1; letter-spacing:.08em;
  color:var(--dp-ink-dim); text-transform:uppercase; vertical-align:middle; text-shadow:none;
}
.dp-kbd.is-down { background:var(--dp-lamp); border-color:var(--dp-lamp); color:var(--dp-metal-0); }
.dp-prompt { display:inline-flex; align-items:center; gap:8px; font-family:var(--dp-face-read); font-size:12px; color:var(--dp-ink-dim); }

/* == Entry: the surface settles into place. No glass flash -- there is no glass. == */
@keyframes dp-settle-in { from { transform:translateY(8px); } to { transform:none; } }
@keyframes dp-type-in { from { transform:translateX(-6px); } to { transform:none; } }
.dp-enter { animation:dp-settle-in 240ms var(--dp-ease-settle) both; }
.dp-enter .dp-stagger > * { animation:dp-type-in 200ms var(--dp-ease-settle) both; animation-delay:calc(120ms + var(--dp-i, 0) * 30ms); }

@media (prefers-reduced-motion:reduce) {
  .dp-enter, .dp-enter .dp-stagger > * { animation:none; }
  .dp-loading::after { animation:none; inset:0; opacity:.5; }
  .dp-key, .dp-row, .dp-tile__art, .dp-switch > span, .dp-selector__tab { transition:none; }
}
html.sf-reduce-motion .dp-enter, html.sf-reduce-motion .dp-enter .dp-stagger > * { animation:none; }

/* == High contrast (the game's own mode) and forced colours (the OS's). == */
html.sf-high-contrast :is(.dp-mfd, .dp-glass, .dp-plate-hw, .dp-tile, .dp-dialog) { background:#000; outline:2px solid rgb(255 255 255 / .85); outline-offset:-2px; }
html.sf-high-contrast .dp-key { --dpk-fill:#000; outline:2px solid #fff; outline-offset:-2px; color:#fff; }
html.sf-high-contrast .dp-key--primary { --dpk-fill:#ffd98c; color:#000; }
@media (forced-colors:active) {
  .dp-mfd, .dp-glass, .dp-plate-hw, .dp-tile, .dp-dialog, .dp-tip { border:1px solid CanvasText; background:Canvas; box-shadow:none; forced-color-adjust:none; color:CanvasText; clip-path:none; }
  .dp-key, .dp-kbd, .dp-selector__tab { border:1px solid ButtonText; background:ButtonFace; color:ButtonText; text-shadow:none; box-shadow:none; }
  .dp-bead { forced-color-adjust:none; background:ButtonText; box-shadow:none; }
  .dp-row[aria-selected="true"], .dp-row.is-selected, .dp-selector__tab[aria-selected="true"] { background:Highlight; color:HighlightText; }
  .dp-switch[aria-checked="true"] > span:last-child, .dp-switch[aria-checked="false"] > span:first-child { background:Highlight; color:HighlightText; }
  .dp-rule, .dp-section-head::after { background:CanvasText; }
  .dp-empty { border-top:1px solid CanvasText; }
}
`;
