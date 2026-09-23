// Deckplate screen skins -- every menu surface, dressed in the printed controls (hardware.js).
// Each block re-skins one screen's EXISTING contract DOM (class names, roles, data-* and focus model
// untouched; tests and probes keep their seams).
//
// PRINTED AND LIT (design/frontend/ONE_PHOTOGRAPH.md section 9; owner ruling 2026-09-22). This file
// used to put a keycap over a brushed-steel photograph under every verb, an LED lens in the cap, a
// fastened SVG bezel around every pane and a knurled cap on every fader. The owner said CSS
// pretending to be a physical material looks awful. What is left:
//   - a surface is a printed field: one flat colour, no bezel, no inner rim, no stand-off shadow;
//   - a verb is a ghost field with the cut; the one consequential verb IS the lamp;
//   - a tab or choice is a word on a rail, the chosen one lit by a lamp bar beneath it;
//   - a selected row is a lamp bar on its leading edge over a faint ink field;
//   - focus is the 2px bone bracket; a key hint is a hairline glyph, not a little plastic cap.
// Geometry is kept: where a nine-slice used to paint into a border, the border stays at its width,
// transparent, so no content box on any screen moves.
//
// Specificity note: these rules are injected at runtime, after styles/kit.css, and use the same
// `#screens .of-<screen>` prefix kit.css does, so they win by order without !important.

/** The cut corner, painted by the fill (hardware.js): --dpk-fill is set per state. */
const CUT_FILL = 'linear-gradient(225deg, transparent calc(var(--dp-cut) * .7071), var(--dpk-fill) 0)';
/** A pressable printed field's whole background: lit cut, focus bracket, bottom rule, fill. */
const KEY_BG = `var(--dpk-cut), var(--dpk-bracket), var(--dpk-rule), ${CUT_FILL}`;
/** The lamp bar on a leading edge: the selected row, the chosen tile. */
const LAMP_EDGE = 'linear-gradient(90deg, var(--dp-lamp) 2px, transparent 0)';
/** The lamp bar under a word: the open tab, the chosen choice. */
const LAMP_UNDER = 'linear-gradient(0deg, var(--dp-lamp) 2px, transparent 0)';
/** The ink field behind a selected or hovered row. */
const INK_FIELD = 'linear-gradient(var(--dp-field-ink) 0 0)';
const INK_FIELD_HI = 'linear-gradient(var(--dp-field-ink-hi) 0 0)';
/** The hairline at the top of a row, drawn as a layer so the row's own border is left alone. */
const HAIR_TOP = 'linear-gradient(180deg, var(--dp-rule) 1px, transparent 0)';
/** The rail a group of words stands on. */
const RAIL = 'linear-gradient(0deg, var(--dp-rule-hi) 1px, transparent 0)';
/** A text field: a bottom rail, no box. */
const INPUT_RAIL = 'linear-gradient(0deg, var(--dp-rule-hi) 2px, transparent 0)';
const INPUT_RAIL_LIT = 'linear-gradient(0deg, var(--dp-lamp) 2px, transparent 0)';
/** A select's chevron: a produced vector glyph, not a drawn material. */
const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23b7b4a6' stroke-width='1.5'/%3E%3C/svg%3E")`;
/** A keyboard-key hint: a hairline glyph from a manual. */
const HINT = 'display:inline-grid; place-items:center; min-width:var(--dp-hint-h); height:var(--dp-hint-h); padding:0 6px; box-sizing:border-box; '
  + 'border:1px solid var(--dp-rule-hi); border-radius:var(--dp-r-plate); border-image:none; background:none; box-shadow:none; '
  + 'font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 86; font-size:12px; line-height:1; letter-spacing:.08em; '
  + 'text-transform:uppercase; color:var(--dp-ink-dim); text-shadow:none;';
/** The printed-field surface every old glass pane becomes. Its border keeps its width, transparent. */
const SURFACE = 'border-image:none; background:var(--dp-field); box-shadow:none;';
/** A title printed on the frame: no engraved incision, one legibility shadow over the world. */
const TITLE_INK = 'color:var(--dp-ink); text-shadow:var(--dp-text-legible);';

/** A kit word as a printed command key. `sel` is ONE full selector for the buttons -- never a comma
    list: every state below is written as `${sel}:hover`, which on a list would attach the state
    to the last selector only and paint the others permanently hovered/pressed. */
function assertSingle(sel) {
  let depth = 0;
  for (const ch of sel) {
    if (ch === '(') depth += 1; else if (ch === ')') depth -= 1;
    else if (ch === ',' && depth === 0) throw new Error(`deckplate: pass one selector, not a list: ${sel}`);
  }
  return sel;
}
function printedKey(sel) {
  assertSingle(sel);
  return `
${sel} {
  --dpk-fill:var(--dp-field-ink); --dpk-cut:none; --dpk-bracket:none; --dpk-rule:none;
  box-sizing:border-box; display:inline-flex; align-items:center; justify-content:center; gap:10px; position:relative; width:auto;
  min-height:var(--dp-key-h-2); padding:0 calc(var(--dp-cut) + 14px) 0 16px; border:0; border-image:none; border-radius:0;
  background:${KEY_BG}; box-shadow:none; filter:none;
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 92; font-size:13px; line-height:1.1;
  letter-spacing:.1em; text-transform:uppercase; color:var(--dp-ink); text-shadow:none;
  transition:color var(--dp-d-cut) var(--dp-ease-lamp), box-shadow var(--dp-d-cut) var(--dp-ease-lamp);
}
${sel}::after { display:none; }
${sel}:hover { --dpk-fill:var(--dp-field-ink-hi); --dpk-cut:var(--dp-cut-lit); }
${sel}:focus-visible { outline:0 solid transparent !important; --dpk-fill:var(--dp-field-ink-hi); --dpk-cut:var(--dp-cut-lit); --dpk-bracket:var(--dp-bracket); }
${sel}:active { --dpk-fill:rgb(232 226 212 / .05); }
${sel}[aria-pressed='true'] { --dpk-cut:var(--dp-cut-lit); color:var(--dp-lamp-hot); }
${sel}.k-word--primary { --dpk-fill:var(--dp-lamp); color:var(--dp-metal-0); font-variation-settings:"wght" 800, "wdth" 100; }
${sel}.k-word--primary:is(:hover, :focus-visible) { --dpk-fill:var(--dp-lamp-hot); --dpk-cut:none; box-shadow:var(--dp-lamp-glow); }
${sel}.k-word--danger { --dpk-rule:linear-gradient(0deg, var(--dp-danger) 2px, transparent 0); }
${sel}.k-word--danger:is(:hover, :focus-visible) { --dpk-fill:var(--dp-danger); --dpk-cut:none; color:var(--dp-metal-0); box-shadow:0 0 18px var(--dp-danger-bloom); }
${sel}:is([aria-disabled='true'], :disabled) { --dpk-fill:rgb(232 226 212 / .04); --dpk-cut:none; --dpk-bracket:none; color:var(--dp-ink-mute); box-shadow:none; opacity:1; cursor:default; }
@media (prefers-reduced-motion:reduce) { ${sel} { transition:none; } }
@media (forced-colors:active) {
  ${sel} { border:1px solid ButtonText; background:ButtonFace; color:ButtonText; box-shadow:none; }
  ${sel}:is(:hover, :focus-visible, .k-word--primary, [aria-pressed='true']) { outline:2px solid Highlight !important; }
}
`;
}

/** The one consequential verb of a screen, whatever its classes: the lamp. */
function lampKey(sel) {
  assertSingle(sel);
  return `
${sel} { --dpk-fill:var(--dp-lamp); --dpk-cut:none; color:var(--dp-metal-0); font-variation-settings:"wght" 800, "wdth" 100; text-shadow:none; }
${sel}:is(:hover, :focus-visible) { --dpk-fill:var(--dp-lamp-hot); box-shadow:var(--dp-lamp-glow); }
${sel}:active { --dpk-fill:var(--dp-lamp-dim); }
`;
}

/* The verb list as any kit words column inside a menu: grouped, iconed. */
const WORDS = `
#screens :is(.of-pause) .k-words__group {
  display:flex; align-items:center; gap:10px; list-style:none;
  margin:calc(12px * var(--dp-s, 1)) 0 4px; padding:0 2px;
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 62; font-size:12px;
  letter-spacing:.24em; text-transform:uppercase; color:var(--dp-ink-mute);
}
#screens :is(.of-pause) .k-words__group::after { content:""; flex:1; height:1px; background:var(--dp-rule); }
#screens :is(.of-pause) .k-word[data-icon]::before {
  content:""; flex:0 0 auto; width:20px; height:20px; margin-right:12px;
  background:currentColor; opacity:.8;
  -webkit-mask:var(--k-icon) center / contain no-repeat; mask:var(--k-icon) center / contain no-repeat;
}
/* A verb whose label ends in its key ("Mission Log (J)") prints the key as a hint glyph; the
   parentheses stay in the DOM for the accessible name, visually hidden. */
#screens .k-word .k-kbd { ${HINT} margin-left:10px; }
#screens .k-word .k-kbd__paren { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
@media (forced-colors:active) { #screens .k-word .k-kbd { border:1px solid CanvasText; background:Canvas; color:CanvasText; } }
#screens :is(.of-pause) .k-word[data-hint]::after { content:attr(data-hint); ${HINT} position:static; transform:none; margin-left:auto; width:auto; opacity:1; }
`;

/* PAUSE IS A RAIL OF LIGHT (ONE_PHOTOGRAPH.md section 7, step 6). It was seventeen bevelled chips in
   six groups -- the grid section 4.2 kills -- on the screen a player opens most often. Every verb
   opens something; none changes the world; so all of them are light and only RESUME carries a lamp.
   The column is wider than the title's because it holds seventeen verbs to the title's five. */
const PAUSE = `
#screens .of-pause { --dp-frame-col: clamp(420px, 42vw, 760px); }
#screens .of-pause .dp-lit { row-gap:2px; }
#screens .of-pause .dp-lit__group { margin-top:clamp(9px, 1.1vh, 15px); }
/* The brief: a reading on the veil, with one hairline under its head. No box. */
#screens .of-pause .sf-pause-brief { background:none; box-shadow:none; border:0; padding:0; max-width:52ch; }
#screens .of-pause .sf-pause-brief > :first-child { padding-bottom:6px; border-bottom:1px solid var(--dp-rule); }
#screens .of-pause .sf-pause-brief .sf-slot-sub { color:var(--dp-ink-mute); }
#screens .of-pause .k-stage { border:0; border-image:none; background:none; box-shadow:none; }
/* A contract name is a thing you can open, not a web link: it wears the lamp hairline every entity
   link in the game wears, never the kit's green underline (section 4.8, a hue leak). */
#screens .of-pause .sf-pause-brief :is(a, .sf-entity-link) { text-decoration:none; box-shadow:0 1px 0 rgb(242 185 80 / .55); color:var(--dp-ink); }
`;

const FH_BRIDGE = `
/* == FH -> DECKPLATE BRIDGE ======================================================================
   The shell screens (new game, load/save, help, credits, codex, research, achievements) are built
   from the Field Hardware vocabulary: .fh-plate, .fh-key, .fh-row, .fh-input, .fh-tile, .fh-light.
   This maps that vocabulary onto the printed controls once. GEOMETRY IS THE KIT'S: every border
   width stays the fh value, transparent, so no content box moves; only what is painted changes.
   The station is excluded (its own skin, styles/station-orbital.css); so is the title. */
html body #screens > :not(.sx-observatory):not(.of-title) {
  --fh-legend:var(--dp-lamp); --fh-legend-now:var(--dp-lamp-hot);
  /* amber is for what is lit or acted on: a resting legend is bone, a header legend a step brighter */
  --fh-legend-rest:var(--dp-ink-mute); --fh-legend-lit:var(--dp-ink-dim);
  /* good news reads in bone with its sign or arrow; the deckplate carries no green */
  --k-good:#d8d2c4;
  --fh-text:var(--dp-ink); --fh-text-resting:var(--dp-ink-dim); --fh-text-tertiary:var(--dp-ink-mute);
}
/* panels: a printed field */
html body #screens > :not(.sx-observatory):not(.of-title) :is(.fh-plate, .fh-window) {
  border-style:solid; border-color:transparent; ${SURFACE} color:var(--dp-ink);
}
html body #screens > :not(.sx-observatory):not(.of-title) .fh-plate { border-width:24px; }
html body #screens > :not(.sx-observatory):not(.of-title) .fh-window { border-width:20px; }
html body #screens > :not(.sx-observatory):not(.of-title) .fh-plate.fh-plate--sunk { ${SURFACE} }
html body #screens > :not(.sx-observatory):not(.of-title) .fh-plate.fh-plate--paper { color:var(--dp-ink); }
html body #screens > :not(.sx-observatory):not(.of-title) .fh-plate.fh-plate--edge { border-width:16px; ${SURFACE} }
/* a rail is a hairline down the middle of its column, not a machined bar */
html body #screens > :not(.sx-observatory):not(.of-title) .fh-rail {
  border-width:16px; border-style:solid; border-color:transparent; border-image:none; box-shadow:none;
  background:linear-gradient(90deg, transparent calc(50% - .5px), var(--dp-rule-hi) 0 calc(50% + .5px), transparent 0);
}
/* keys */
${printedKey('html body #screens > :not(.sx-observatory):not(.of-title) .fh-key:not(.fh-key--legend)')}
${lampKey('html body #screens > :not(.sx-observatory):not(.of-title) .fh-key.fh-key--primary')}
html body #screens > :not(.sx-observatory):not(.of-title) .fh-key.fh-key--hazard { --dpk-rule:linear-gradient(0deg, var(--dp-danger) 2px, transparent 0); }
html body #screens > :not(.sx-observatory):not(.of-title) .fh-key.fh-key--hazard:is(:hover, :focus-visible) {
  --dpk-fill:var(--dp-danger); --dpk-cut:none; color:var(--dp-metal-0); box-shadow:0 0 18px var(--dp-danger-bloom);
}
html body #screens > :not(.sx-observatory):not(.of-title) .fh-key.fh-key--small { min-height:32px; padding:0 calc(var(--dp-cut) + 8px) 0 12px; font-size:12px; }
/* tabs: navigation words, not commands -- the open one lit by a lamp bar beneath it */
html body #screens > :not(.sx-observatory):not(.of-title) .fh-key.fh-key--legend {
  position:relative; border-width:14px; border-style:solid; border-image:none; border-color:transparent; border-radius:0;
  background:none; box-shadow:none; font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 78; letter-spacing:.14em;
  color:var(--dp-ink-dim); text-shadow:none;
}
html body #screens > :not(.sx-observatory):not(.of-title) .fh-key.fh-key--legend::before { display:none; }
/* one lamp bar per word: the bridge draws it as a background, so the kit's own underline stays off */
html body #screens > :not(.sx-observatory):not(.of-title) .fh-key.fh-key--legend::after { display:none; }
html body #screens > :not(.sx-observatory):not(.of-title) .fh-key.fh-key--legend:hover { color:var(--dp-ink); background:none; }
html body #screens > :not(.sx-observatory):not(.of-title) .fh-key.fh-key--legend:is([aria-selected='true'], [aria-current='true'], [aria-pressed='true'], .is-lit) {
  color:var(--dp-ink); background:${LAMP_UNDER} padding-box; box-shadow:none;
}
html body #screens > :not(.sx-observatory):not(.of-title) .fh-key.fh-key--legend:focus-visible {
  outline:0 solid transparent !important; color:var(--dp-ink); background:var(--dp-bracket) padding-box;
}
html body #screens > :not(.sx-observatory):not(.of-title) .fh-key.fh-key--legend:is([aria-selected='true'], [aria-current='true'], [aria-pressed='true'], .is-lit):focus-visible {
  background:var(--dp-bracket) padding-box, ${LAMP_UNDER} padding-box;
}
/* choice rows (starter, difficulty): words on one rail, each choice a word, the chosen one lit */
html body #screens > :not(.sx-observatory):not(.of-title) .k-words.k-words--row.of-pause {
  display:inline-flex; flex-wrap:wrap; gap:0 18px; width:max-content; max-width:100%; padding:0; border-radius:0; box-shadow:none;
  background:${RAIL};
}
html body #screens > :not(.sx-observatory):not(.of-title) .k-words.k-words--row.of-pause .fh-key.fh-key--legend { background:none; }
html body #screens > :not(.sx-observatory):not(.of-title) .k-words.k-words--row.of-pause .fh-key.fh-key--legend:is([aria-selected='true'], [aria-current='true'], [aria-pressed='true'], .is-lit) {
  background:${LAMP_UNDER} border-box; box-shadow:0 8px 10px -8px var(--dp-lamp-bloom);
}
/* rows: a hairline between; the selected row lights the one way every register does */
html body #screens > :not(.sx-observatory):not(.of-title) .fh-row { background-image:${HAIR_TOP}; background-repeat:no-repeat; }
html body #screens > :not(.sx-observatory):not(.of-title) .fh-row.is-selected {
  border-width:0; border-image:none; color:var(--dp-ink); background:${LAMP_EDGE}, ${INK_FIELD}; box-shadow:none;
}
html body #screens > :not(.sx-observatory):not(.of-title) .fh-hairline { height:1px; border:0; background:var(--dp-rule); }
html body #screens > :not(.sx-observatory):not(.of-title) .fh-legend[data-fh-lit="on"] { color:var(--dp-ink-dim); }
/* hero readouts in a corner are readings: phosphor, not the lamp */
html body #screens > :not(.sx-observatory):not(.of-title) .k-corner .k-hero__n { color:var(--dp-phos); text-shadow:var(--dp-phos-emit-soft), var(--dp-text-legible); }
html body #screens > :not(.sx-observatory):not(.of-title) .k-corner .k-hero__w { font-family:var(--dp-face-etch); color:var(--dp-ink-mute); }
/* selects: the value on a rail, a chevron beside it */
html body #screens > :not(.sx-observatory):not(.of-title) select.k-select {
  -webkit-appearance:none; appearance:none; min-height:40px; padding:0 28px 0 0; border-radius:0; border:0; border-image:none;
  background:${CHEVRON} right 6px center / 10px 6px no-repeat, ${INPUT_RAIL}; box-shadow:none;
  color:var(--dp-ink); font-family:var(--dp-face-read); font-size:14px;
}
html body #screens > :not(.sx-observatory):not(.of-title) select.k-select:focus-visible { outline:0 solid transparent !important; background:${CHEVRON} right 6px center / 10px 6px no-repeat, ${INPUT_RAIL_LIT}; }
html body #screens > :not(.sx-observatory):not(.of-title) select.k-select option { background:#12161c; color:var(--dp-ink); }
/* inputs: a rail under the words; focus lights it */
html body #screens > :not(.sx-observatory):not(.of-title) .fh-input {
  border-style:solid; border-color:transparent; border-width:12px 0; border-image:none; box-shadow:none;
  background:${INPUT_RAIL} border-box; color:var(--dp-ink); font-family:var(--dp-face-read);
}
html body #screens > :not(.sx-observatory):not(.of-title) .fh-input:focus-visible { background:${INPUT_RAIL_LIT} border-box; box-shadow:0 8px 12px -10px var(--dp-lamp-bloom); }
/* tiles: keyart on a printed field; pressable, so cut; the chosen one lit */
html body #screens > :not(.sx-observatory):not(.of-title) .fh-tile {
  border-style:solid; border-color:transparent; border-width:20px; ${SURFACE} clip-path:var(--dp-cut-shape);
}
html body #screens > :not(.sx-observatory):not(.of-title) .fh-tile[aria-selected='true'] {
  color:var(--dp-lamp-hot); background:var(--dp-cut-lit) border-box, ${LAMP_EDGE} border-box, var(--dp-field);
}
html body #screens > :not(.sx-observatory):not(.of-title) .fh-tile:focus-visible { outline:0 solid transparent !important; background:var(--dp-bracket) border-box, var(--dp-field); }
html body #screens > :not(.sx-observatory):not(.of-title) .fh-tile-legend { font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 70; }
/* lights: a flat emitted bead */
html body #screens > :not(.sx-observatory):not(.of-title) .fh-light {
  border-radius:50%; width:7px; height:7px; background:var(--dp-lamp); box-shadow:0 0 8px var(--dp-lamp-bloom);
}
html body #screens > :not(.sx-observatory):not(.of-title) .fh-light:is([data-level='off'], [data-level='dim']) { background:var(--dp-rule-hi); box-shadow:none; }
html body #screens > :not(.sx-observatory):not(.of-title) .fh-light[data-colour='wanted'] { background:var(--dp-danger); box-shadow:0 0 8px var(--dp-danger-bloom); }
html body #screens > :not(.sx-observatory):not(.of-title) .fh-light:is([data-colour='good'], [data-colour='cold']) { background:var(--dp-ink-dim); box-shadow:none; }
/* type: the display face for titles, the condensed voice for legends */
html body #screens > :not(.sx-observatory):not(.of-title) .fh-title { font-family:var(--dp-face-display); font-variation-settings:"wght" 900, "wdth" 125; ${TITLE_INK} }
html body #screens > :not(.sx-observatory):not(.of-title) .fh-legend { font-family:var(--dp-face-etch); color:var(--dp-ink-mute); text-shadow:none; }
@media (forced-colors:active) {
  html body #screens > :not(.sx-observatory):not(.of-title) :is(.fh-plate, .fh-window, .fh-rail, .fh-key, .fh-input, .fh-tile) {
    border-color:CanvasText; background:Canvas; color:CanvasText; box-shadow:none; filter:none; clip-path:none;
  }
  html body #screens > :not(.sx-observatory):not(.of-title) :is(.fh-key:is(:hover, :focus-visible), .fh-key--legend:is([aria-selected='true'], [aria-pressed='true'], .is-lit), .fh-row.is-selected, .fh-tile[aria-selected='true']) {
    outline:2px solid Highlight; background:Canvas; color:CanvasText;
  }
  html body #screens > :not(.sx-observatory):not(.of-title) .fh-light { forced-color-adjust:none; background:CanvasText; box-shadow:none; }
}
`;

/* -- MISSION LOG -- a list and a reader on printed fields, the actions as keys. -- */
const ML = 'html body #screens .sf-mlog';
const MISSIONLOG = `
${ML} .k-title .k-t-title {
  font-family:var(--dp-face-display); font-variation-settings:"wght" 900, "wdth" 125; text-transform:uppercase;
  letter-spacing:.05em; ${TITLE_INK}
}
${ML} .k-hang.sf-mlog-body, ${ML} .k-stage.sf-mlog-stage { box-sizing:border-box; border-radius:0; padding:14px 16px; ${SURFACE} }
${ML} .k-stage.sf-mlog-stage { align-self:start; max-height:100%; }
${ML} .k-caps { font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 66; font-size:12px; letter-spacing:.22em; color:var(--dp-ink-mute); text-shadow:none; }
${ML} .k-row { border-top:0; background:${HAIR_TOP}; }
${ML} .k-row .k-row__name, ${ML} .k-row .k-t-emph { color:var(--dp-ink); }
${ML} .k-row .k-row__sub { color:var(--dp-ink-mute); }
/* the tracked contract lights the one way every register does */
${ML} .k-row:is(.is-tracked, .tracked, [aria-current='true'], [aria-selected='true']) { background:${LAMP_EDGE}, ${INK_FIELD}; box-shadow:none; }
${ML} .sf-mlog-card .k-t-title {
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 820, "wdth" 86; text-transform:uppercase;
  font-size:clamp(24px, min(2vw, 3.6vh), 38px); line-height:1.05; letter-spacing:.05em; ${TITLE_INK}
}
${ML} .sf-mlog-terms { --k-row-cols:10.5em minmax(0, 1fr) !important; }
/* a status word beside a row is a hairline label, not a sunken chip */
${ML} .sf-mlog-body .k-row__num {
  align-self:start; justify-self:end; display:inline-grid; place-items:center; min-height:22px; padding:2px 8px; border-radius:0;
  background:none; box-shadow:none; border:1px solid var(--dp-rule-hi);
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 74; font-size:12px; line-height:1.1;
  letter-spacing:.14em; text-transform:uppercase; color:var(--dp-ink-dim); white-space:nowrap;
}
${ML} .sf-mlog-card :is(.k-sentence--emph, .sf-mlog-obj) { color:var(--dp-ink-dim); }
${ML} .sf-mlog-card :is(dt, .k-row__label, th) {
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 70; font-size:12px; letter-spacing:.16em; text-transform:uppercase; color:var(--dp-ink-mute);
}
${ML} .sf-mlog-btns .k-words--row, ${ML} .sf-mlog-career-choices { gap:10px; flex-wrap:wrap; align-items:flex-start; }
${ML} .sf-mlog-btns .k-word-sub { font-family:var(--dp-face-etch); font-size:12px; letter-spacing:.1em; color:var(--dp-ink-mute); margin-top:4px; }
${printedKey(`${ML} .sf-mlog-btns .k-word`)}
${printedKey(`${ML} .sf-mlog-close`)}
${printedKey(`${ML} .sf-mlog-career-btn`)}
${ML} .sf-mlog-career-btn { min-height:34px; font-size:12px; }
@media (forced-colors:active) {
  ${ML} .k-hang.sf-mlog-body, ${ML} .k-stage.sf-mlog-stage { background:Canvas; border:1px solid CanvasText; box-shadow:none; }
}
`;

/* -- GAME OVER -- the loss report over the dimmed world. Red frames the whole report on the one
   screen where a ship was lost: a solid red bar under the title, the facts as readings. -- */
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
  letter-spacing:.04em; ${TITLE_INK}
  background:linear-gradient(0deg, var(--dp-danger) 4px, transparent 0) left bottom / 100% 100% no-repeat;
}
${GO} .sf-go-sub { color:var(--dp-ink); }
${GO} .k-sentence { color:var(--dp-ink-dim); }
${GO} .k-stage { align-self:start; box-sizing:border-box; width:fit-content; max-width:min(1080px, 100%); padding:18px 22px; border:12px solid transparent; ${SURFACE} }
${GO} .sf-go-grid { gap:clamp(18px, 3vw, 56px); flex-wrap:nowrap; }
${GO} .k-hero__n {
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 800, "wdth" 80; letter-spacing:.04em; text-transform:uppercase;
  font-size:clamp(22px, min(1.8vw, 3.3vh), 34px); line-height:1.05; color:var(--dp-phos); text-shadow:var(--dp-phos-emit-soft), var(--dp-text-legible);
}
${GO} .k-hero__w { font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 70; font-size:12px; letter-spacing:.18em; text-transform:uppercase; color:var(--dp-ink-mute); }
${GO} .sf-go-foot .k-words--row { gap:12px; flex-wrap:wrap; }
/* the career record stands to the right of the report, spanning the title and the stage */
${GO}.k-screen { grid-template-columns:minmax(0, 1fr) minmax(280px, 400px); grid-template-areas:"title recap" "stage recap" "foot foot"; column-gap:clamp(24px, 3vw, 64px); }
${GO} .sf-go-recap { grid-area:recap; align-self:start; box-sizing:border-box; margin-top:clamp(40px, 8vh, 120px); padding:18px 22px; border:12px solid transparent; ${SURFACE} }
${GO} .sf-go-recap__title { margin:0 0 10px; font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 70; font-size:12px; letter-spacing:.22em; text-transform:uppercase; color:var(--dp-ink-mute); }
${GO} .sf-go-recap__rows { display:grid; grid-template-columns:minmax(0, 1fr) auto; margin:0; }
${GO} :is(.sf-go-recap__k, .sf-go-recap__v) { margin:0; padding:9px 0; background:${HAIR_TOP}; }
${GO} .sf-go-recap__k { font-family:var(--dp-face-read); font-size:14px; color:var(--dp-ink-dim); }
${GO} .sf-go-recap__v { text-align:right; font-family:var(--dp-face-read); font-weight:600; font-size:15px; color:var(--dp-phos); font-variant-numeric:tabular-nums; }
@media (max-width:1100px) { ${GO}.k-screen { grid-template-columns:minmax(0, 1fr); grid-template-areas:"title" "stage" "recap" "foot"; } ${GO} .sf-go-recap { margin-top:0; max-width:520px; } }
${printedKey(`${GO} .sf-go-foot .k-word`)}
@media (forced-colors:active) {
  ${GO} .k-stage, ${GO} .sf-go-recap { border:1px solid CanvasText; background:Canvas; box-shadow:none; }
  ${GO} .k-title .k-t-title { background:none; border-bottom:4px solid CanvasText; }
}
`;

/* -- HELP -- bindings that are not a single key read in the condensed voice at row size. -- */
const HELP = `
html body #screens .of-help .k-row__num.fh-data {
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 78; font-size:13px; letter-spacing:.06em;
  color:var(--dp-ink); text-align:right;
}
`;

/* -- SHELL -- what every shell screen shares.
   1. The ground: in the menu a non-staged shell screen stands on the title's world out of focus
      (backdrop-shell.jpg, a produced render); in a run, the held world, dimmed.
   2. One way back: .sf-back is the same ghost key everywhere, bottom-left, with its ESC hint.
   3. One title size; content headers inside a pane step down to the condensed voice.
   4. Scroll regions end in a fade over a padded foot, so no line is cut at a hard edge. */
const SHELL_SCREENS = 'html body #screens > .k-screen:not(.sx-observatory):not(.of-title):not([data-screen="mainMenu"])';
const SHELL = `
@property --sf-fade-a { syntax:'<number>'; inherits:false; initial-value:1; }
@keyframes sf-scroll-foot { from { --sf-fade-a:.08; } 96% { --sf-fade-a:.9; } to { --sf-fade-a:1; } }
html body[data-game-mode="menu"] #screens > .k-screen:not([data-k-stage]):not(.sx-observatory):not(.of-title) {
  background:url("/assets/ui/backdrops/backdrop-shell.jpg") center / cover no-repeat;
}
html body:not([data-game-mode="menu"]) #screens > .k-screen:not([data-k-stage]):not(.sx-observatory):not(.of-pause):not(.sf-gameover) {
  background:radial-gradient(130% 100% at 30% 30%, rgb(9 10 13 / .86), rgb(5 6 9 / .93) 70%, rgb(4 5 7 / .96));
}
${printedKey('html body #screens .k-screen .sf-back.k-word')}
html body #screens .k-screen .sf-back.k-word { margin:0; gap:0; min-width:0; }
html body #screens .k-screen .sf-back.k-word::after {
  content:"ESC" / ""; ${HINT} position:static; transform:none; left:auto; bottom:auto; width:auto; opacity:1; margin-left:12px;
}
${SHELL_SCREENS} > .k-title .k-t-title {
  font-size:clamp(40px, min(3.9vw, 7vh), 76px); line-height:.95; letter-spacing:.04em; text-transform:uppercase;
  font-family:var(--dp-face-display); font-variation-settings:"wght" 900, "wdth" 125; ${TITLE_INK}
}
html body #screens .k-screen .sf-codex-entry .k-t-title,
html body #screens .k-screen .fh-plate--edge .fh-title { font-size:clamp(24px, min(2vw, 3.6vh), 38px); line-height:1.05; }
${SHELL_SCREENS} :is(.k-stage--scroll, .sf-mlog-body, .tt-scroll, .tt-side, .sf-settings-pane, .sf-ng-body) {
  --sf-fade-edge:0px;
  -webkit-mask-image:linear-gradient(180deg, #000 calc(100% - var(--sf-fade-edge) - 46px), rgb(0 0 0 / var(--sf-fade-a)) calc(100% - var(--sf-fade-edge)), #000 calc(100% - var(--sf-fade-edge)));
  mask-image:linear-gradient(180deg, #000 calc(100% - var(--sf-fade-edge) - 46px), rgb(0 0 0 / var(--sf-fade-a)) calc(100% - var(--sf-fade-edge)), #000 calc(100% - var(--sf-fade-edge)));
  padding-bottom:30px;
  animation:sf-scroll-foot linear both; animation-timeline:scroll(self block);
}
${SHELL_SCREENS} :is(.k-stage--scroll, .sf-ng-body).fh-plate { --sf-fade-edge:24px; }
${SHELL_SCREENS} .sf-settings-pane { --sf-fade-edge:14px; }
html body #screens .of-help .k-stage--scroll { max-width:min(820px, 100%); }
/* entity links read as one kind of link (a lamp hairline: you can act on it), never a web underline */
html body #screens .sf-mlog .sf-mlog-career-choices { margin-top:10px; }
html body #screens .sf-mlog :is(a, .sf-entity-link) { text-decoration:none; box-shadow:0 1px 0 rgb(242 185 80 / .55); color:var(--dp-ink); }
/* a text field has ONE focus signal: its lit rail */
html body #screens .k-screen :is(.fh-input, .k-input):focus-visible { outline:0 solid transparent !important; }
/* research legend: each word wears the bead its nodes wear */
html body #screens [data-swatch] { display:inline-flex; align-items:center; gap:8px; color:var(--dp-ink-dim); }
html body #screens [data-swatch]::before { content:""; flex:0 0 auto; width:7px; height:7px; border-radius:50%; background:var(--dp-rule-hi); }
html body #screens [data-swatch="available"]::before { background:var(--dp-lamp); box-shadow:0 0 8px var(--dp-lamp-bloom); }
html body #screens [data-swatch="researched"]::before { background:var(--dp-ink); }
html body #screens .k-screen:has(.tt-side) > .k-corner { flex-direction:row; align-items:flex-end; gap:28px; }
html body #screens .k-screen:has(.tt-side) .tt-side { margin-top:clamp(64px, 9vh, 104px); }
@media (forced-colors:active) {
  html body #screens .k-screen :is(.fh-input, .k-input):focus-visible { outline:2px solid Highlight !important; }
  ${SHELL_SCREENS} :is(.k-stage--scroll, .sf-mlog-body, .tt-scroll, .tt-side, .sf-settings-pane, .sf-ng-body) { -webkit-mask-image:none; mask-image:none; }
}
`;

/* TITLE is owned by styles/kit.css and deckplate/light.js. FH_BRIDGE selectors exclude it. */

/* -- SETTINGS -- a narrow field against the left of the frame; the rest is the world. Every control
   is printed: a slider is a line, its fill and a bar; a switch is two words, one lit. The
   styles/settings.css sheet is linked at mount (after this one), so each rule carries `html body`. */
const S = 'html body #screens .of-settings';
const SETTINGS = `
${S}.k-screen::before { background:linear-gradient(90deg, rgb(6 8 12 / .82), rgb(6 8 12 / .55) 60%, rgb(6 8 12 / .35)); }
${S} .k-t-title { font-family:var(--dp-face-display); font-variation-settings:"wght" 900, "wdth" 125; letter-spacing:.05em; ${TITLE_INK} }
${S} .k-title > p { font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 62; color:var(--dp-ink-mute); letter-spacing:.22em; }
${S} .of-settings-rail { border:0; border-image:none; box-sizing:border-box; width:22px; box-shadow:none;
  background:linear-gradient(90deg, transparent calc(50% - .5px), var(--dp-rule-hi) 0 calc(50% + .5px), transparent 0); }
/* section tabs: words stacked on the rail, the open one lit by a lamp bar on its leading edge */
${S} .sf-tabbar .k-word {
  border-image:none; border:0; border-radius:0; min-height:40px; padding:0 12px 0 18px; box-shadow:none;
  background:none; text-shadow:none;
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 78; letter-spacing:.16em;
  font-size:var(--dp-fs-data); color:var(--dp-ink-dim);
  transition:color var(--dp-d-cut) var(--dp-ease-lamp);
}
${S} .sf-tabbar .k-word::before { display:none; }
${S} .sf-tabbar .k-word:hover { color:var(--dp-ink); background:none; }
${S} .sf-tabbar .k-word:focus-visible { outline:0 solid transparent !important; color:var(--dp-ink); background:var(--dp-bracket), ${INK_FIELD}; }
${S} .sf-tabbar .k-word:is([aria-selected='true'], [aria-current='true']) { color:var(--dp-ink); background:${LAMP_EDGE}, ${INK_FIELD}; }
/* the pane: a printed field (its old 14px bezel ring stays as transparent spacing) */
${S} .sf-settings-pane, ${S} #sf-settings-pane { border:14px solid transparent; ${SURFACE} padding:10px 22px; }
${S} .sf-settings-pane, ${S} #sf-settings-pane { align-self:start; justify-self:start; width:min(100%, 780px); max-height:100%; }
${S} .of-settings-switch { justify-self:start; width:auto; }
${S} .sf-settings-pane .k-rows { max-width:none; }
${S} .sf-settings-pane .k-row { --k-row-cols:minmax(150px, 230px) minmax(0, 1fr); background-image:${HAIR_TOP}; background-repeat:no-repeat; color:var(--dp-ink-dim); min-height:50px; }
${S} .sf-settings-pane .k-row > .k-t-body, ${S} .sf-settings-pane .k-row__name {
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 78; font-size:13px;
  letter-spacing:.13em; text-transform:uppercase; color:var(--dp-ink);
}
${S} .sf-settings-pane .k-rows > .k-row:first-child { background-image:none; }
${S} .sf-settings-pane .k-row .k-row__name, ${S} .sf-settings-pane .k-row label { color:var(--dp-ink); font-family:var(--dp-face-read); }
${S} .sf-settings-pane .k-row .k-row__sub, ${S} .sf-settings-pane .k-t-fine { color:var(--dp-ink-mute); }
${S} .sf-settings-pane .k-caps { font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 62; letter-spacing:.22em; color:var(--dp-ink-mute); }
/* slider: a line, its lamp fill, and a bar where the value is */
${S} input.k-range { height:28px; background:transparent; }
${S} input.k-range::-webkit-slider-runnable-track {
  height:18px; border:0; border-radius:0; box-shadow:none;
  background:
    linear-gradient(var(--dp-lamp) 0 0) 0 50% / var(--sf-range-fill, 50%) 2px no-repeat,
    linear-gradient(var(--dp-rule-hi) 0 0) 0 50% / 100% 2px no-repeat;
}
${S} input.k-range::-webkit-slider-thumb {
  -webkit-appearance:none; appearance:none; width:3px; height:18px; margin-top:0; border:0; border-radius:0;
  background:var(--dp-ink); box-shadow:none;
}
${S} input.k-range:is(:hover, :focus-visible)::-webkit-slider-thumb { background:var(--dp-lamp-hot); box-shadow:0 0 10px var(--dp-lamp-bloom); }
${S} input.k-range:focus-visible { outline:0 solid transparent !important; }
/* select: the value on a rail */
${S} select.k-select {
  -webkit-appearance:none; appearance:none; min-height:36px; padding:0 28px 0 0; border:0; border-radius:0; border-image:none; box-shadow:none;
  background:${CHEVRON} right 6px center / 10px 6px no-repeat, ${INPUT_RAIL};
  color:var(--dp-ink); font-family:var(--dp-face-read); font-size:var(--dp-fs-data);
}
${S} select.k-select:focus-visible { outline:0 solid transparent !important; background:${CHEVRON} right 6px center / 10px 6px no-repeat, ${INPUT_RAIL_LIT}; }
${S} select.k-select option { background:#12161c; color:var(--dp-ink); }
/* on/off: two words on a rail, the true one lit */
${S} .of-settings-switch {
  width:auto; height:auto; min-width:0; background-image:none;
  border:0; border-image:none; border-radius:0; padding:0; gap:16px; box-shadow:none;
  background:${RAIL};
}
${S} .of-settings-switch:is(.is-on, :hover) { background:${RAIL}; }
${S} .of-settings-switch .k-word {
  border-image:none; border:0; border-radius:0; min-width:0; min-height:30px; padding:0 2px; box-shadow:none;
  background:none; text-shadow:none;
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 78; letter-spacing:.14em; font-size:12px; color:var(--dp-ink-dim);
}
${S} .of-settings-switch .k-word:hover { color:var(--dp-ink); }
${S} .of-settings-switch .k-word[aria-pressed='true'],
${S} .of-settings-switch.is-on .k-word[data-action='on'][aria-pressed='true'] { color:var(--dp-ink); background:${LAMP_UNDER}; }
${S} .of-settings-switch .k-word:focus-visible { outline:2px solid var(--dp-ink) !important; outline-offset:3px; }
/* choice rows (presets, schemes): words on a rail, the chosen one lit */
${S} .sf-settings-pane .k-words--row:not(.of-settings-switch) { gap:0 16px; background:${RAIL}; }
${S} .sf-settings-pane .k-words--row:not(.of-settings-switch) .k-word {
  border:0; border-radius:0; border-image:none; box-shadow:none; background:none; text-shadow:none;
  padding:0 2px; min-height:32px;
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 78; letter-spacing:.12em; font-size:12px; color:var(--dp-ink-dim);
}
${S} .sf-settings-pane .k-words--row:not(.of-settings-switch) .k-word:hover { color:var(--dp-ink); }
${S} .sf-settings-pane .k-words--row:not(.of-settings-switch) .k-word[aria-pressed='true'] { color:var(--dp-ink); background:${LAMP_UNDER}; }
/* rebinding: each binding is its key hint, a size up; listening lights it */
${S} .sf-bind-btn { ${HINT} min-width:44px; height:30px; font-size:13px; color:var(--dp-ink); cursor:pointer; }
${S} .sf-bind-btn:is(:hover, :focus-visible) { border-color:var(--dp-ink); outline:0 solid transparent !important; }
${S} .sf-bind-btn:is(.is-listening, [aria-pressed='true']) { border-color:var(--dp-lamp); color:var(--dp-lamp-hot); box-shadow:0 0 12px var(--dp-lamp-bloom); }
/* Back is navigation, not the screen's command: a ghost key with its ESC hint. */
${printedKey(`${S} .k-foot .fh-key--primary`)}
${S} .k-foot .fh-key--primary { --dpk-fill:var(--dp-field-ink); color:var(--dp-ink); font-variation-settings:"wght" 700, "wdth" 92; }
${S} .k-foot .fh-key--primary:is(:hover, :focus-visible) { --dpk-fill:var(--dp-field-ink-hi); box-shadow:none; }
${S} .k-foot .fh-key--primary::after {
  content:"ESC" / ""; display:inline-grid; ${HINT} position:static; transform:none; left:auto; bottom:auto; width:auto; opacity:1; margin-left:12px;
}
@media (forced-colors:active) {
  ${S} .sf-settings-pane, ${S} select.k-select, ${S} .of-settings-rail, ${S} .sf-bind-btn,
  ${S} .sf-settings-pane .k-words--row:not(.of-settings-switch) .k-word, ${S} .k-foot .fh-key--primary {
    border:1px solid CanvasText; background:Canvas; color:CanvasText; box-shadow:none;
  }
  ${S} .sf-tabbar .k-word:is([aria-selected='true'], [aria-current='true']),
  ${S} .of-settings-switch .k-word[aria-pressed='true'] { background:Highlight; color:HighlightText; }
}
`;

/* -- THE CHART -- the chart's chrome over the paused world. Every pane is a printed field; commands
   are keys; a lens is a word with its icon (lit when shown); the scale and the inspector tabs are
   words on a rail. The canvas keeps its own grammar (src/ui/map/tacticalMapGrammar.js). Geometry
   stays the chart's: each pane keeps the border width its layout sheet was measured with. */
const GM = 'html body #screens #sf-galaxymap.of-chart';
const GM_ETCH = 'font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 74; letter-spacing:.14em; text-transform:uppercase;';
const GM_KEYS = `${GM} :is(.gm-close, .gm-hint-btn, .gm-ins-btn, .gm-place-btn, .gm-ribbon-btn, .gm-deck-sort, .gm-rail-add)`;
const CHART = `
${GM} { background:radial-gradient(130% 100% at 50% 45%, rgb(6 8 11 / .6), rgb(5 6 9 / .85) 68%, rgb(4 5 7 / .94)); }
${GM}:is([data-scale="system"], [data-scale="galaxy"]) {
  background:radial-gradient(130% 100% at 50% 45%, rgb(9 11 15 / .9), rgb(5 6 9 / .96) 68%, rgb(3 4 6 / .985));
}
${GM} .k-word::after { display:none; }
${GM} .gm-stamp { ${GM_ETCH} font-size:12px; color:var(--dp-ink-mute); }
${GM} .gm-level { ${GM_ETCH} font-size:12px; color:var(--dp-ink-mute); }
${GM} .gm-level b { color:var(--dp-ink-dim); font-weight:inherit; }
/* panes: printed fields -- only the inspector and the two popovers. The lens rail and the foot are
   words on hairlines over the chart (ONE_PHOTOGRAPH §9.3: kill the LENSES sheet and the CARGO DECK
   band); a field there read as an old web sidebar and printed over the navigation answers. */
${GM} :is(.gm-right-inspector, .gm-hints, .gm-search-results) {
  border-style:solid; border-color:transparent; border-width:16px; border-radius:0; ${SURFACE} color:var(--dp-ink);
  scrollbar-width:thin; scrollbar-color:rgb(232 226 212 / .24) transparent;
}
/* the lens rail's veil: light falling off from the frame's left edge, so a mark or a course line the
   chart draws under the rail cannot print through the words. No inner boundary. */
${GM} .gm-body-container::before {
  content:""; position:absolute; z-index:-1; pointer-events:none; left:0; top:0; bottom:0;
  width:calc(var(--k-margin) + var(--gm-rail-w) + 72px);
  background:linear-gradient(90deg, rgb(4 5 7 / .82), rgb(4 5 7 / .7) 62%, transparent);
}
${GM} .gm-left-rail {
  padding:0 8px 20px 0; scrollbar-width:thin; scrollbar-color:rgb(232 226 212 / .24) transparent;
  -webkit-mask-image:linear-gradient(180deg, #000 calc(100% - 20px), transparent); mask-image:linear-gradient(180deg, #000 calc(100% - 20px), transparent);
}
/* the scale: words on a rail, the current scale lit */
${GM} .gm-scale-buttons.k-words { display:inline-flex; flex-wrap:nowrap; gap:0 18px; padding:0; width:max-content; border-radius:0; box-shadow:none; background:${RAIL}; }
${GM} .gm-scale-btn.k-word {
  display:inline-flex; align-items:center; justify-content:center; min-width:0; min-height:30px; padding:0 2px;
  border:0; border-image:none; border-radius:0; background:none; box-shadow:none; ${GM_ETCH} font-size:12px; color:var(--dp-ink-dim); cursor:pointer;
}
${GM} .gm-scale-btn.k-word:hover { color:var(--dp-ink); }
${GM} .gm-scale-btn.k-word:focus-visible { outline:2px solid var(--dp-ink) !important; outline-offset:3px; color:var(--dp-ink); }
${GM} .gm-scale-btn.k-word:is([aria-pressed="true"], .is-current) { color:var(--dp-ink); background:${LAMP_UNDER}; box-shadow:0 8px 10px -8px var(--dp-lamp-bloom); }
${GM} .gm-rail-track { height:1px; background:var(--dp-rule-hi); box-shadow:none; border-radius:0; }
${GM} .gm-rail-marker { width:3px; height:12px; top:-5px; border-radius:0; background:var(--dp-lamp-hot); box-shadow:0 0 8px var(--dp-lamp-bloom); }
/* search: words on a rail, the slash key as a hint */
${GM} .gm-search-input.k-input {
  box-sizing:border-box; min-height:40px; padding:0 40px 0 0; border:0; border-radius:0; border-image:none; box-shadow:none;
  background:${INPUT_RAIL};
  color:var(--dp-ink); font-family:var(--dp-face-read); font-size:14px;
}
${GM} .gm-search-input.k-input::placeholder { color:var(--dp-ink-mute); }
${GM} .gm-search-input.k-input:focus { outline:0; background:${INPUT_RAIL_LIT}; }
${GM} .gm-search-kbd { ${HINT} right:4px; top:50%; transform:translateY(-50%); }
${GM} :is(.gm-search-item, .gm-hint-row) { border:0; box-shadow:none; background-image:${HAIR_TOP}; background-repeat:no-repeat; }
${GM} .gm-search-item.selected { color:var(--dp-ink); background:${LAMP_EDGE}, ${INK_FIELD}; }
${GM} .gm-hint-row kbd { ${HINT} min-width:0; }
${GM} .gm-hints-title { ${GM_ETCH} font-size:12px; color:var(--dp-ink-mute); }
/* commands */
${printedKey(GM_KEYS)}
${GM_KEYS} { min-height:34px; font-size:12px; max-width:100%; white-space:nowrap; }
${GM} .gm-frame-group .gm-frame-btn { width:100%; justify-content:flex-start; }
${GM} :is(#gm-set-course-btn, #gm-engage-route-btn, .gm-plot-btn) { width:100%; min-height:40px; font-size:13px; }
${printedKey(`${GM} :is(#gm-set-course-btn, #gm-engage-route-btn, .gm-plot-btn)`)}
${lampKey(`${GM} :is(#gm-set-course-btn, #gm-engage-route-btn):not(:disabled):not([aria-disabled="true"])`)}
${GM} #gm-engage-route-btn[data-engage-state="nav:abortRoute"]:not(:disabled) {
  --dpk-fill:var(--dp-field-ink); --dpk-rule:linear-gradient(0deg, var(--dp-danger) 2px, transparent 0); color:var(--dp-ink);
}
${GM} #gm-engage-route-btn[data-engage-state="nav:abortRoute"]:not(:disabled):is(:hover, :focus-visible) {
  --dpk-fill:var(--dp-danger); color:var(--dp-metal-0); box-shadow:0 0 18px var(--dp-danger-bloom);
}
${GM} .gm-hint-btn[aria-expanded="true"] { --dpk-cut:var(--dp-cut-lit); color:var(--dp-lamp-hot); }
/* the chart's way back: the same ghost key as every screen's, with its ESC hint */
${GM} .gm-close.k-word::after { content:"ESC" / ""; display:inline-grid; ${HINT} position:static; transform:none; width:auto; margin-left:12px; opacity:1; }
${GM} :is(.gm-frame-reason, .gm-plot-reason, .gm-engage-reason, .gm-ribbon-reason) { color:var(--dp-ink-mute); font-family:var(--dp-face-read); font-size:12px; }
/* the rail: disclosures under condensed legends; a lens is a word with its icon */
${GM} .gm-rail-sec { border:0; background-image:${HAIR_TOP}; background-repeat:no-repeat; }
${GM} .gm-rail-sec:first-child { background-image:none; }
${GM} .gm-rail-sum { justify-content:flex-start; ${GM_ETCH} font-size:12px; color:var(--dp-ink-dim); }
${GM} .gm-rail-sum-t { margin-right:auto; font-family:inherit; font-size:inherit; font-variation-settings:inherit; letter-spacing:inherit; color:inherit; }
${GM} .gm-rail-sum-n { margin-left:auto; font-family:var(--dp-face-etch); letter-spacing:.06em; color:var(--dp-ink-mute); }
${GM} .gm-rail-sum::after {
  content:""; flex:0 0 auto; align-self:center; width:6px; height:6px; margin:0 3px 3px 10px;
  border-right:1.5px solid currentColor; border-bottom:1.5px solid currentColor; transform:rotate(-45deg);
}
${GM} .gm-rail-sec[open] > .gm-rail-sum::after { transform:rotate(45deg); margin-bottom:6px; }
${GM} :is(.gm-rail-sec[open] > .gm-rail-sum, .gm-rail-sum:hover) { color:var(--dp-ink); }
${GM} .gm-layer-buttons { gap:8px; }
${GM} .gm-layer-bank { gap:2px; }
${GM} .gm-layer-bank-title { ${GM_ETCH} font-size:12px; color:var(--dp-ink-mute); margin:0 0 2px; text-shadow:var(--dp-text-legible); }
${GM} .gm-layer-btn.k-word {
  position:relative; box-sizing:border-box; display:flex; align-items:center; gap:10px; width:100%; max-width:100%; min-height:26px;
  margin:0; padding:0 10px 0 12px; border:0; border-image:none; border-radius:0; cursor:pointer;
  background:none; box-shadow:none; text-shadow:var(--dp-text-legible);
  ${GM_ETCH} font-size:12px; color:var(--dp-ink-dim);
}
${GM} .gm-layer-btn.k-word::before { display:none; }
${GM} .gm-layer-btn.k-word:is([aria-pressed="true"], .active) { color:var(--dp-ink); background:${LAMP_EDGE}; }
${GM} .gm-layer-btn.k-word:hover { color:var(--dp-ink); background:${INK_FIELD}; }
${GM} .gm-layer-btn.k-word:focus-visible { outline:0 solid transparent !important; color:var(--dp-ink); background:var(--dp-bracket), ${INK_FIELD}; }
${GM} .gm-layer-btn.k-word:is([aria-pressed="true"], .active):hover { background:${LAMP_EDGE}, ${INK_FIELD}; }
${GM} .gm-layer-ico { display:inline-flex; flex:0 0 18px; width:18px; height:18px; color:inherit; opacity:.85; }
${GM} .gm-layer-ico .dp-icon { width:18px; height:18px; display:block; }
${GM} .gm-layer-ico .dp-icon .accent { fill:currentColor; }
${GM} .gm-layer-btn.k-word:is([aria-pressed="true"], .active) .gm-layer-ico .dp-icon .accent { fill:var(--dp-lamp); }
${GM} .gm-layer-name { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
${GM} .gm-rail-commodity label { ${GM_ETCH} font-size:12px; color:var(--dp-ink-mute); }
${GM} .gm-rail-commodity :is(select, .sf-select__field) {
  min-height:28px; padding:0 4px 0 0; border:0; border-radius:0; box-shadow:none;
  background:${INPUT_RAIL};
  color:var(--dp-ink); font-family:var(--dp-face-read); font-size:13px; text-shadow:var(--dp-text-legible);
}
/* the native select needs the drawn chevron; the kit's select already carries its own glyph */
${GM} .gm-rail-commodity select { padding-right:26px; background:${CHEVRON} right 6px center / 10px 6px no-repeat, ${INPUT_RAIL}; }
${GM} .gm-rail-commodity .sf-select__field { width:100%; justify-content:space-between; }
/* popovers sit over the inspector: an .84 field let its tabs and keys print through the key list */
${GM} :is(.gm-hints, .gm-search-results) { background:var(--dp-metal-1); }
${GM} .gm-rail-commodity .sf-select__list {
  border:0; border-radius:0; box-shadow:none; padding:4px 0; background:var(--dp-metal-1);
  scrollbar-width:thin; scrollbar-color:rgb(232 226 212 / .24) transparent;
}
${GM} .gm-rail-commodity .sf-select__opt { border-radius:0; padding:6px 12px; font-family:var(--dp-face-read); font-size:13px; color:var(--dp-ink-dim); }
${GM} .gm-rail-commodity .sf-select__opt:is(:hover, .is-active) { color:var(--dp-ink); background:${INK_FIELD}; }
${GM} .gm-rail-commodity .sf-select__opt.is-selected { color:var(--dp-ink); background:${LAMP_EDGE}, ${INK_FIELD}; }
${GM} :is(.gm-rail-item, .gm-legend-row) { border:0; background-image:${HAIR_TOP}; background-repeat:no-repeat; }
${GM} .gm-rail-legend > .gm-legend-row:first-of-type { background-image:none; }
${GM} :is(.gm-rail-item.is-tracked, .gm-rail-item.is-current) { color:var(--dp-ink); background:${LAMP_EDGE}, ${INK_FIELD}; box-shadow:none; }
${GM} :is(.gm-rail-title, .gm-ins-kind, .gm-ins-title, .gm-deck-title) { ${GM_ETCH} font-size:12px; color:var(--dp-ink-mute); }
${GM} .gm-legend-ico { width:18px; height:18px; color:var(--dp-ink-dim); }
${GM} .gm-legend-ico .dp-icon { width:18px; height:18px; display:block; }
${GM} .gm-legend-ico .dp-icon .accent { fill:var(--dp-lamp-dim, var(--dp-lamp)); }
${GM} .gm-legend-ico svg:not(.dp-icon) { width:18px; height:18px; stroke:var(--dp-ink-dim); }
/* the inspector: nine tabs as a legend grid on one rail -- every tab visible */
${GM} .gm-tabs.k-words {
  display:grid; grid-template-columns:repeat(auto-fill, minmax(84px, 1fr)); gap:0 12px; padding:0; overflow:visible; border-radius:0; box-shadow:none; background:none;
}
${GM} .gm-tab.k-word {
  display:flex; align-items:center; justify-content:flex-start; min-width:0; min-height:30px; margin:0; padding:0 2px;
  border:0; border-image:none; border-radius:0; box-shadow:none; background:${RAIL}; ${GM_ETCH} font-size:12px; letter-spacing:.1em; color:var(--dp-ink-dim);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:pointer;
}
${GM} .gm-tab.k-word::before { display:none; }
${GM} .gm-tab.k-word:hover { color:var(--dp-ink); }
${GM} .gm-tab.k-word:focus-visible { outline:2px solid var(--dp-ink) !important; outline-offset:2px; color:var(--dp-ink); }
${GM} .gm-tab.k-word[aria-selected="true"] { color:var(--dp-ink); background:${LAMP_UNDER}; }
${GM} .gm-inspector-content {
  padding-bottom:24px; scrollbar-width:thin; scrollbar-color:rgb(232 226 212 / .24) transparent;
  -webkit-mask-image:linear-gradient(180deg, #000 calc(100% - 22px), transparent); mask-image:linear-gradient(180deg, #000 calc(100% - 22px), transparent);
}
${GM} .gm-ins-section { border-top:0; background-image:${HAIR_TOP}; background-repeat:no-repeat; }
${GM} .gm-ins-section:first-child { background-image:none; }
${GM} .gm-ins-target-name {
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 820, "wdth" 86; font-weight:inherit;
  font-size:clamp(20px, 1.5vw, 28px); line-height:1.05; letter-spacing:.04em; text-transform:uppercase; color:var(--dp-ink);
}
${GM} :is(.gm-inspector-empty, .gm-ins-note) { font-family:var(--dp-face-read); color:var(--dp-ink-dim); }
/* a data state inside the inspector column reads at the column's scale, not the screen's: the shared
   28px headline took three lines of a 288px column and ran under the fade */
${GM} .gm-right-inspector .sf-state__head { font-size:17px; line-height:1.15; }
${GM} .gm-ins-row { color:var(--dp-ink-dim); }
${GM} .gm-ins-row-val { color:var(--dp-phos); }
/* the weather: a flat meter */
${GM} .gm-weather-bar { height:3px; border-radius:0; background:var(--dp-rule); box-shadow:none; overflow:hidden; }
${GM} .gm-weather-seg--combat { background:var(--dp-danger); }
${GM} .gm-weather-seg--civil { background:var(--dp-ink-dim); }
${GM} .gm-weather[data-weather-level="working"] .gm-weather-word { color:var(--dp-lamp-hot); }
${GM} .gm-weather[data-weather-level="hot"] .gm-weather-word { color:var(--dp-danger-hot); }
${GM} .gm-deck-table .k-row { background-image:${HAIR_TOP}; background-repeat:no-repeat; }
/* the foot: the route and the deck over the navigation answers, words on hairlines. A veil from
   the frame's bottom edge (light falloff, no inner boundary) keeps chart marks from printing
   through the words. */
${GM} .gm-apron { position:relative; }
${GM} .gm-apron::before {
  content:""; position:absolute; z-index:-1; pointer-events:none;
  left:calc(-1 * var(--k-margin)); right:calc(-1 * var(--k-margin)); bottom:calc(-1 * var(--k-margin)); top:-64px;
  background:linear-gradient(0deg, rgb(4 5 7 / .94), rgb(4 5 7 / .86) 50%, transparent);
}
${GM} .gm-ribbon { border:0; background:none; box-shadow:none; }
${GM} .gm-ribbon-head { text-shadow:var(--dp-text-legible); }
${GM} :is(.gm-ribbon-meta, .gm-ribbon-legs) { color:var(--dp-ink-dim); font-size:12px; }
${GM} .gm-ribbon-meta span { color:var(--dp-ink-mute); }
${GM} .gm-navfoot { border-top:0; background:${HAIR_TOP}; }
${GM} .gm-navfoot .gm-nav-row-k { ${GM_ETCH} font-size:12px; color:var(--dp-ink-mute); }
${GM} .gm-navfoot .gm-nav-row-v { font-family:var(--dp-face-read); font-size:15px; font-weight:500; line-height:1.25; color:var(--dp-ink); text-shadow:var(--dp-text-legible); }
${GM} .gm-navfoot .gm-nav-row-d { font-family:var(--dp-face-read); font-size:12px; color:var(--dp-ink-mute); font-variant-numeric:tabular-nums; }
${GM} .gm-navfoot .gm-nav-row[data-tone="tracked"] { background:${LAMP_EDGE}; }
${GM} .gm-navfoot .gm-nav-row[data-tone="tracked"] .gm-nav-row-v { color:var(--dp-lamp-hot); }
${GM} .gm-navfoot .gm-nav-row[data-tone="muted"] .gm-nav-row-v { color:var(--dp-ink-mute); font-style:normal; }
@media (forced-colors:active) {
  ${GM} { background:Canvas; }
  ${GM} :is(.gm-right-inspector, .gm-hints, .gm-search-results) { border:1px solid CanvasText; background:Canvas; }
  ${GM} .gm-left-rail { -webkit-mask-image:none; mask-image:none; }
  ${GM} :is(.gm-apron, .gm-body-container)::before { display:none; }
  ${GM} .gm-navfoot .gm-nav-row[data-tone="tracked"] { background:none; border-left:2px solid Highlight; }
  ${GM} :is(.gm-scale-btn, .gm-tab, .gm-layer-btn).k-word { border:1px solid ButtonText; background:ButtonFace; color:ButtonText; }
  ${GM} :is(.gm-scale-btn[aria-pressed="true"], .gm-tab[aria-selected="true"], .gm-layer-btn[aria-pressed="true"]).k-word { outline:2px solid Highlight; }
  ${GM} :is(.gm-search-input, .gm-rail-commodity select) { border:1px solid CanvasText; background:Canvas; color:CanvasText; }
  ${GM} .gm-inspector-content { -webkit-mask-image:none; mask-image:none; }
  ${GM} :is(.gm-search-kbd, .gm-hint-row kbd), ${GM} .gm-close.k-word::after { border:1px solid ButtonText; background:ButtonFace; color:ButtonText; }
}
`;

/* -- ONE SELECTION, ONE HEADER --
   A chosen thing in a list lights ONE way on every screen: a lamp bar on its leading edge over a
   faint ink field. Keyboard focus is the bone bracket, never an outer ring (forced colours and the
   game's high-contrast mode keep a real ring). Every shell screen stands on one header grid. */
const SEL = 'html body #screens > .k-screen:not(.sx-observatory)';
const SELECTION = `
${SEL} .k-word:not(.sf-back):not([data-hint]):not(.gm-close)::after { display:none; }
/* rows */
${SEL} :is(.k-row, .fh-row):is([aria-selected="true"], .is-selected, .is-tracked, [aria-current="true"]) {
  border-image:none; background:${LAMP_EDGE}, ${INK_FIELD}; box-shadow:none;
}
${SEL} :is(.k-row, .fh-row):is([aria-selected="true"], .is-selected, .is-tracked, [aria-current="true"]) :is(.k-row__name, .sf-slot-name) { color:var(--dp-ink); text-shadow:none; }
${SEL} :is(.k-row, .fh-row):focus-visible { outline:0 solid transparent !important; background:var(--dp-bracket), ${INK_FIELD}; }
${SEL} :is(.k-row, .fh-row):is([aria-selected="true"], .is-selected, .is-tracked, [aria-current="true"]):focus-visible { background:var(--dp-bracket), ${INK_FIELD_HI}; }
/* a VERTICAL tab list (help, settings) lights its open section on the leading edge, the way a
   selected row does; an underline under each stacked word reads as a strikethrough list */
${SEL}:is(.of-help, .of-settings) .sf-tab.fh-key--legend:is([aria-selected='true'], [aria-current='true'], .active) { color:var(--dp-ink); background:${LAMP_EDGE} padding-box, ${INK_FIELD} padding-box; }
${SEL}:is(.of-help, .of-settings) .sf-tab.fh-key--legend:focus-visible { background:var(--dp-bracket) padding-box, ${INK_FIELD} padding-box; }
/* a bar is a flat meter: a rail, a bone fill (the lamp when it signals) */
${SEL} .k-bar { height:3px; border-radius:0; background:var(--dp-rule-hi); box-shadow:none; }
${SEL} .k-bar .k-bar__fill { border-radius:0; background:var(--dp-ink-dim); box-shadow:none; }
${SEL} .k-bar.k-bar--signal .k-bar__fill { background:var(--dp-lamp); box-shadow:0 0 6px var(--dp-lamp-bloom); }
@media (forced-colors:active) { ${SEL} .k-bar { background:GrayText; } ${SEL} .k-bar .k-bar__fill { background:CanvasText; } }
/* the data states (empty, loading, error, denied): the code word, the headline, the fill, the verb */
${SEL} .sf-state__word { font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 72; font-size:12px; letter-spacing:.18em; color:var(--dp-ink-mute); }
${SEL} .sf-state__head { font-family:var(--dp-face-etch); font-variation-settings:"wght" 820, "wdth" 86; font-size:clamp(20px, min(1.5vw, 2.8vh), 28px); line-height:1.1; letter-spacing:.04em; text-transform:uppercase; color:var(--dp-ink); }
${SEL} :is(.sf-state__fills, .sf-state__detail) { font-family:var(--dp-face-read); color:var(--dp-ink-dim); }
${SEL} .sf-state__glyph { color:var(--dp-ink-mute); }
${printedKey(`${SEL} .sf-state__verb`)}
${SEL} .sf-state__verb { align-self:flex-start; min-height:38px; font-size:12px; }
/* footprint: the empty state on a printed field; the verbs are keys with their reasons under them */
${SEL}[data-screen="footprint"] .fp-statehost:not([hidden]) { align-self:start; box-sizing:border-box; padding:18px 22px; border:14px solid transparent; ${SURFACE} }
${printedKey(`${SEL}[data-screen="footprint"] > .k-foot .k-word`)}
${SEL}[data-screen="footprint"] > .k-foot .k-word { min-height:40px; font-size:12px; }
/* tertiary text reads at the muted ink, which clears 4.5:1: a locked entry must still be readable */
${SEL} .k-38 { color:var(--dp-ink-mute); }
/* new game: the hull and difficulty choices are equal words on one rail that shrink before they wrap */
${SEL} .sf-ng-body .k-words.k-words--row.of-pause { display:flex; flex-wrap:nowrap; width:100%; max-width:100%; box-sizing:border-box; gap:0 12px; }
${SEL} .sf-ng-body .k-words.k-words--row.of-pause > li { flex:1 1 0; min-width:0; display:flex; flex-direction:column; align-items:stretch; gap:2px; }
${SEL} .sf-ng-body .k-words.k-words--row.of-pause .fh-key.fh-key--legend {
  width:100%; min-width:0; min-height:38px; border-width:6px 0; justify-content:flex-start; text-align:left;
  letter-spacing:.1em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
${SEL} .sf-ng-body .k-words.k-words--row.of-pause .k-word-sub { text-align:left; padding:2px 0 5px; font-size:12px; color:var(--dp-ink-mute); }
/* achievements: each deed its mark, lit when earned; the name, what it asks, a status word */
${SEL}.of-achievements > .k-stage { max-width:none; }
${SEL}.of-achievements .of-achievements-rows { display:grid; grid-template-columns:repeat(auto-fill, minmax(340px, 1fr)); gap:12px; }
${SEL}.of-achievements .k-row.of-achievements-row {
  grid-template-columns:56px minmax(0, 1fr); grid-template-rows:auto auto; align-items:start; column-gap:14px; row-gap:6px;
  min-height:0; padding:14px 16px; border-radius:0; background:var(--dp-field); box-shadow:none;
}
${SEL}.of-achievements .of-achievements-light { display:none; }
${SEL}.of-achievements .of-achievements-emblem { grid-row:1 / span 2; display:grid; place-items:center; width:52px; height:52px; color:var(--dp-ink-mute); background:none; box-shadow:none; }
${SEL}.of-achievements .of-achievements-emblem .dp-icon .accent { fill:currentColor; }
${SEL}.of-achievements .of-achievements-row[data-state="unlocked"] { background:${LAMP_EDGE}, var(--dp-field); }
${SEL}.of-achievements .of-achievements-row[data-state="unlocked"] .of-achievements-emblem { color:var(--dp-lamp-hot); }
${SEL}.of-achievements .of-achievements-row[data-state="unlocked"] .of-achievements-emblem .dp-icon .accent { fill:var(--dp-lamp); }
${SEL}.of-achievements .of-achievements-text { grid-column:2; min-width:0; }
${SEL}.of-achievements .of-achievements-text .k-row__name { display:block; font-family:var(--dp-face-etch); font-variation-settings:"wght" 780, "wdth" 84; letter-spacing:.05em; text-transform:uppercase; color:var(--dp-ink); }
${SEL}.of-achievements .of-achievements-row[data-state="locked"] .of-achievements-text .k-row__name { color:var(--dp-ink-dim); }
${SEL}.of-achievements .of-achievements-text .k-row__sub { margin-top:4px; color:var(--dp-ink-dim); }
${SEL}.of-achievements .of-achievements-row .k-row__num {
  grid-column:2; justify-self:start; display:inline-grid; place-items:center; min-height:22px; padding:2px 8px; border-radius:0;
  background:none; box-shadow:none; border:1px solid var(--dp-rule-hi);
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 74; font-size:12px; letter-spacing:.14em; text-transform:uppercase; color:var(--dp-ink-mute);
}
${SEL}.of-achievements .of-achievements-row[data-state="unlocked"] .k-row__num { color:var(--dp-lamp-hot); border-color:rgb(242 185 80 / .5); }
@media (forced-colors:active) { ${SEL}.of-achievements .k-row.of-achievements-row { border:1px solid CanvasText; background:Canvas; } }
/* codex: the entry fills its column, its sentences at reading size */
${SEL}.of-codex .sf-codex-entry { position:relative; min-height:100%; box-sizing:border-box; }
${SEL}.of-codex .sf-codex-entry .k-sentence { font-size:17px; line-height:1.55; }
${SEL} .sf-slot-card-title { font-family:var(--dp-face-etch); font-variation-settings:"wght" 820, "wdth" 86; font-size:clamp(22px, min(1.9vw, 3.4vh), 36px); line-height:1.05; letter-spacing:.06em; text-transform:uppercase; color:var(--dp-ink); }
${SEL} .fh-key:not(.fh-key--legend):focus-visible { outline:0 solid transparent !important; }
/* a small key in a screen's foot is a command (export, import) */
${printedKey(`${SEL} > .k-foot .fh-key.fh-key--small`)}
${SEL} > .k-foot .fh-key.fh-key--small { min-height:40px; font-size:13px; }
/* a window onto the hangar: the world, framed by nothing */
${SEL}.fh-shell > .k-stage:has(> .k-world--stage) { border:14px solid transparent; border-image:none; box-shadow:none; }
/* new game: Launch is the largest key, level with Back */
${SEL} > .k-foot.sf-ng-footer { align-items:center; }
${SEL} > .k-foot .sf-ng-launch { min-height:var(--dp-key-h); padding-left:26px; padding-right:calc(var(--dp-cut) + 26px); font-size:15px; letter-spacing:.14em; }
${SEL} .tt-scroll { width:fit-content; max-width:100%; justify-self:start; }
/* one header grid */
${SEL}:is(.of-settings, .of-credits, .of-achievements) { padding:var(--dp-margin); }
${SEL} > .k-title .k-t-emph.k-62 {
  margin:12px 0 0; max-width:64ch; font-family:var(--dp-face-read); font-variation-settings:normal; font-weight:400;
  font-size:clamp(15px, min(1vw, 1.8vh), 18px); line-height:1.4; letter-spacing:.005em; text-transform:none;
  color:var(--dp-ink-dim); text-shadow:var(--dp-text-legible);
}
${SEL} > .k-foot .sf-back { order:-1; }
${SEL} > .k-foot > :has(> .sf-back), ${SEL} > .k-foot > :has(> li > .sf-back) { order:-1; }
@media (forced-colors:active) { ${SEL} :is(.k-row, .fh-row, .fh-key):focus-visible { outline:2px solid Highlight !important; } }
html.sf-high-contrast body #screens > .k-screen:not(.sx-observatory) :is(.k-row, .fh-row, .fh-key, .k-word):focus-visible { outline:2px solid #fff !important; }
`;

/* -- THE SHIP -- the flight host of the shipworks stage. A fitted socket carries a lamp bar, an
   open one a quiet rule; the handling bands are the header voice; the verbs are keys; the callout
   pins over the hull are flat beads. -- */
const SH = 'html body #screens #sf-ship';
const SHIP = `
${SH} .sx-sw__slotfield.is-board .sx-hardpoint {
  box-sizing:border-box; min-height:40px; padding:6px 12px 6px 16px; border:0; border-radius:0; box-shadow:none;
  background:${LAMP_EDGE}, linear-gradient(rgb(8 10 14 / .72) 0 0);
}
${SH} .sx-sw__slotfield.is-board .sx-hardpoint.is-empty { background:linear-gradient(90deg, var(--dp-rule-hi) 2px, transparent 0), linear-gradient(rgb(8 10 14 / .72) 0 0); }
${SH} .sx-sw__slotfield.is-board .sx-hardpoint__reticle { display:none; }
${SH} .sx-sw__slotfield.is-board .sx-hardpoint:is(.is-selected, :hover) { background:${LAMP_EDGE}, ${INK_FIELD_HI}, linear-gradient(rgb(8 10 14 / .72) 0 0); }
${SH} .sx-sw__slotfield.is-board .sx-hardpoint:focus-visible { outline:0 solid transparent !important; background:var(--dp-bracket), ${INK_FIELD_HI}, linear-gradient(rgb(8 10 14 / .72) 0 0); }
${SH} .sx-hardpoint__reticle { width:7px; height:7px; left:-3.5px; top:-3.5px; border-radius:50%; background:var(--dp-ink); box-shadow:0 0 6px rgb(232 226 212 / .35); }
${SH} .sx-hardpoint.is-selected .sx-hardpoint__reticle { background:var(--dp-lamp); box-shadow:0 0 8px var(--dp-lamp-bloom); }
${SH} .sx-hardpoint__copy b { font-family:var(--dp-face-etch); font-variation-settings:"wght" 740, "wdth" 80; font-weight:inherit; letter-spacing:.06em; color:var(--dp-ink); }
${SH} .sx-hardpoint__copy em { font-family:var(--dp-face-etch); font-variation-settings:"wght" 680, "wdth" 72; font-size:12px; letter-spacing:.14em; text-transform:uppercase; color:var(--dp-ink-mute); }
${SH} .sx-hardpoint.is-empty .sx-hardpoint__copy b { color:var(--dp-ink-mute); }
${SH} .sx-hardpoint:is(:hover, :focus-visible, .is-selected) .sx-hardpoint__copy b { color:var(--dp-lamp-hot); }
${SH} .sx-hardpoint__leader path { stroke:rgb(232 226 212 / .28); }
/* the handling bands */
${SH} .sx-sw-hero { position:relative; padding:8px 18px 10px 18px; border-radius:0; background:none; box-shadow:none; }
${SH} .sx-sw-hero .k-hero__n {
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 820, "wdth" 84; font-size:clamp(30px, min(2.5vw, 4.4vh), 48px);
  line-height:1; letter-spacing:.02em; text-transform:uppercase; color:var(--dp-phos); text-shadow:var(--dp-phos-emit-soft), var(--dp-text-legible);
}
${SH} .sx-sw-hero .k-hero__w { font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 72; font-size:12px; letter-spacing:.16em; text-transform:uppercase; color:var(--dp-ink-mute); }
${SH} .sx-sw-hero:hover { background:${INK_FIELD}; }
${SH} .sx-sw-hero:focus-visible { outline:0 solid transparent !important; background:var(--dp-bracket), ${INK_FIELD}; }
${SH} .sx-sw-hero:is([aria-pressed="true"], .is-selected) { background:${LAMP_EDGE}, ${INK_FIELD}; }
${SH} .sx-sw-hero:is([aria-pressed="true"], .is-selected) .k-hero__w { color:var(--dp-lamp-hot); }
${SH} .sx-sw-hero.k-hero--good .k-hero__n { color:var(--dp-phos); }
/* the gauges over the hangar stand on a flat field so they read against the lit bay */
${SH} .sx-sw__gauges { padding:4px 14px; border-radius:0; background:rgb(8 10 14 / .72); box-shadow:none; }
${SH} .sx-sw__gauges .k-row { min-height:32px; }
${SH} .sx-sw__gauges :is(.k-row__label, dt, .k-caps) { font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 72; letter-spacing:.14em; color:var(--dp-ink-mute); }
${printedKey(`${SH} .sx-sw-verb.k-word`)}
${SH} .sx-sw-verb.k-word { min-height:38px; font-size:12px; }
${SH} .sx-sw-verbs { gap:10px; align-items:center; }
`;

/* -- THE RANGE -- the course stands on a printed field so the hull behind never reads as part of it. */
const RG = 'html body #screens #sf-range';
const RANGE = `
${RG} .sf-range__box { border-radius:0; background:var(--dp-field); box-shadow:none; }
${RG} .sf-range__canvas:focus-visible { outline:1px solid rgb(242 185 80 / .38) !important; outline-offset:-1px; }
${printedKey(`${RG} .sf-range__verbs .k-word.fh-key`)}
${RG} .sf-range__verbs .k-word.fh-key { min-height:38px; font-size:12px; }
@media (forced-colors:active) { ${RG} .sf-range__canvas:focus-visible { outline:2px solid Highlight !important; } }
`;

/* -- THE CRUCIBLE -- the door's Launch is the one key in the game printed in the failure red: the
   arena is where you go to lose ships. The in-run screens (rearm, refit, results) stand over the
   paused arena: offers are printed cards with the cut that light under the hand; every verb is a
   key (Strip and Main menu are the destructive kind). -- */
const CRD = 'html body #screens .of-crucible-door';
/* The door's tiles have to outweigh the FH bridge's tile rule, which carries two :not() classes:
   the door adds .k-screen to tie it and wins by order. */
const CRD_TILE = 'html body #screens .of-crucible-door.k-screen .fh-tile';
const CR = 'html body #screens > .k-screen:is(.sf-crucible-draft, .sf-crucible-refit, .sf-crucible-results)';
const CRUCIBLE = `
${CRD} .fh-key.fh-key--hazard {
  --dpk-fill:var(--dp-danger); --dpk-rule:none; --dpk-cut:none;
  color:var(--dp-metal-0); font-variation-settings:"wght" 820, "wdth" 96; letter-spacing:.18em;
}
${CRD} .fh-key.fh-key--hazard:is(:hover, :focus-visible) { --dpk-fill:var(--dp-danger-hot); color:var(--dp-metal-0); box-shadow:0 0 26px var(--dp-danger-bloom); }
/* A door tile is pressable, so it is a printed field with the cut -- a GHOST field, because the
   smoked window behind it is the same dark as --dp-field and a dark tile on it was no tile at
   all: the chosen tile's lit cut floated over nothing. The ink field makes the cut a corner.
   Chosen = the lamp bar on its leading edge, a brighter ink field, the lit cut and lamp-hot type. */
${CRD_TILE} { background:${INK_FIELD} border-box; }
${CRD_TILE}:hover { background:var(--dp-cut-lit) border-box, ${INK_FIELD_HI} border-box; color:var(--dp-ink); }
${CRD_TILE}[aria-selected='true'] {
  color:var(--dp-lamp-hot); background:var(--dp-cut-lit) border-box, ${LAMP_EDGE} border-box, ${INK_FIELD_HI} border-box;
}
${CRD_TILE}:focus-visible { outline:0 solid transparent !important; background:var(--dp-cut-lit) border-box, var(--dp-bracket) border-box, ${INK_FIELD_HI} border-box; }
${CRD_TILE}[data-locked='1'] { background:linear-gradient(rgb(232 226 212 / .04) 0 0) border-box; }
/* the window scrolls (share, modifiers and records sit under the seed): its last rows fade into
   the edge instead of stopping on a half-cut caption, and the fade is the cue to scroll */
${CRD} > .k-stage.fh-window {
  -webkit-mask-image:linear-gradient(180deg, #000 calc(100% - 48px), rgb(0 0 0 / .2));
  mask-image:linear-gradient(180deg, #000 calc(100% - 48px), rgb(0 0 0 / .2));
}
/* the seed: one rail under the number (the input's), not a second one under its well */
${CRD} .fh-stepper-well { background:none !important; border-width:0 !important; padding:0 !important; min-height:0 !important; }
${CRD} .sf-crd-seed { align-items:center; gap:16px 24px; }
${CRD} .sf-crd-seed .k-input--num { width:14ch; max-width:100%; text-align:left; }
/* focus on the door's plain words is the bone bracket, not a white box around a whole row */
${CRD} :is(.sf-crd-records > summary, .sf-crd-practice .k-word):focus-visible {
  outline:0 solid transparent !important; background:var(--dp-bracket) no-repeat;
}
${CR} { background:radial-gradient(130% 100% at 30% 30%, rgb(9 10 13 / .84), rgb(5 6 9 / .92) 70%, rgb(4 5 7 / .95)); }
${printedKey(`${CR} .k-foot .k-word`)}
${printedKey(`${CR} .sf-cru-row .k-word`)}
${CR} .sf-cru-row .k-word { min-height:36px; font-size:12px; }
/* the keyboard key a verb answers to, printed inside the verb: a hairline glyph from a manual */
${CR} .sf-cru-kbd { ${HINT} margin-left:4px; height:22px; min-width:22px; padding:0 5px; font-size:11px; }
${CR} .k-word--primary .sf-cru-kbd { border-color:rgb(12 12 14 / .38); color:var(--dp-metal-0); }
/* the refit: the field hugs its hardpoints and stops at a readable width */
${CR} .sf-cru-stage.k-stage--scroll {
  box-sizing:border-box; padding:8px 16px; border:14px solid transparent; ${SURFACE} --sf-fade-edge:14px;
  align-self:start; max-height:100%; width:min(100%, 1040px);
}
${CR} .sf-cru-row { align-items:center; min-height:54px; }
${CR} .sf-cru-row .k-row__sub { display:block; width:max-content; max-width:100%; }
/* a module's name is a link to its codex entry; it keeps the row's sub size, not the link's own */
${CR} .sf-cru-row .k-row__sub.sf-entity-link { font-size:14px; line-height:1.4; color:var(--dp-ink-dim); }
${CR} .sf-cru-slottag {
  margin-left:12px; font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 78; font-size:12px;
  letter-spacing:.14em; text-transform:uppercase; color:var(--dp-ink-mute);
}
/* the foot: each key with what it does printed beneath it */
${CR} .sf-cru-foot .k-words--row { align-items:flex-start; gap:12px 28px; }
${CR} .sf-cru-foot .k-words--row > li { display:flex; flex-direction:column; align-items:flex-start; gap:8px; max-width:40ch; }
${CR} .sf-cru-keynote { margin:0; color:var(--dp-ink-dim); line-height:1.4; text-shadow:var(--dp-text-legible); }
${CR} .sf-cru-keynote[hidden] { display:none; }
/* offers: a printed card (the ghost ink field, so the card and its cut are visible over the
   arena), the focused or hovered one lit at the cut; a sold-out card drops to the quiet tier */
${CR} .sf-cru-card {
  --dpk-fill:var(--dp-field-ink); --dpk-cut:none; --dpk-bracket:none;
  box-sizing:border-box; text-align:left; border:14px solid transparent; border-image:none; box-shadow:none; color:var(--dp-ink);
  background:var(--dpk-cut) border-box, var(--dpk-bracket) border-box, ${CUT_FILL} border-box;
}
${CR} .sf-cru-card:hover:not(:disabled) { --dpk-cut:var(--dp-cut-lit); --dpk-fill:var(--dp-field-ink-hi); }
${CR} .sf-cru-card:focus-visible:not(:disabled) { outline:0 solid transparent !important; --dpk-cut:var(--dp-cut-lit); --dpk-fill:var(--dp-field-ink-hi); --dpk-bracket:var(--dp-bracket); }
${CR} .sf-cru-card:disabled { --dpk-fill:rgb(232 226 212 / .04); cursor:default; }
${CR} .sf-cru-card:disabled :is(.sf-cru-name, .sf-cru-blurb, .sf-cru-activation) { color:var(--dp-ink-mute); }
${CR} .sf-cru-card:is(:hover, :focus-visible):not(:disabled) .sf-cru-verb { color:var(--dp-lamp-hot); }
${CR} .sf-cru-verb { font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 72; letter-spacing:.18em; color:var(--dp-ink-mute); }
${CR} .sf-cru-name { font-family:var(--dp-face-etch); font-variation-settings:"wght" 820, "wdth" 86; text-transform:uppercase; letter-spacing:.04em; color:var(--dp-ink); }
${CR} .sf-cru-cardhead { display:flex; align-items:center; gap:10px; min-height:22px; }
${CR} .sf-cru-cardhead > * { margin:0; }
${CR} .sf-cru-cardhead .sf-cru-price { margin-left:auto; }
${CR} .sf-cru-key { ${HINT} height:22px; min-width:22px; font-size:11px; }
${CR} .sf-cru-key:empty { display:none; }
/* the armory scrolls: its last visible row fades into the edge, which is the cue to scroll */
${CR}.sf-crucible-armory .sf-cru-stage {
  -webkit-mask-image:linear-gradient(180deg, #000 calc(100% - 56px), rgb(0 0 0 / .15));
  mask-image:linear-gradient(180deg, #000 calc(100% - 56px), rgb(0 0 0 / .15));
}
/* a price and the wallet are readings: phosphor */
${CR} :is(.sf-cru-price, .sf-cru-wallet) { color:var(--dp-phos); font-variant-numeric:tabular-nums; text-shadow:var(--dp-text-legible); }
${CR} .sf-cru-afford { color:var(--dp-ink-dim); }
/* the armory's category filter: words on a rail, the open one lit by a lamp bar beneath it */
${CR} .sf-cru-filters { display:inline-flex; gap:0 22px; width:max-content; max-width:100%; background:${RAIL}; }
${CR} .sf-cru-filters .k-word {
  padding:0 0 8px; border:0; background:none; box-shadow:none; cursor:pointer;
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 700, "wdth" 80; font-size:13px; letter-spacing:.14em;
  text-transform:uppercase; color:var(--dp-ink-dim);
}
${CR} .sf-cru-filters .k-word::after { display:none; }
${CR} .sf-cru-filters .sf-cru-count { margin-left:6px; color:var(--dp-ink-mute); font-variant-numeric:tabular-nums; }
${CR} .sf-cru-filters .k-word:hover { color:var(--dp-ink); }
${CR} .sf-cru-filters .k-word[aria-pressed='true'] { color:var(--dp-ink); background:${LAMP_UNDER}; }
${CR} .sf-cru-filters .k-word:focus-visible { outline:0 solid transparent !important; color:var(--dp-ink); background:var(--dp-bracket); }
${CR} .sf-cru-filters .k-word[aria-pressed='true']:focus-visible { background:var(--dp-bracket), ${LAMP_UNDER}; }
@media (forced-colors:active) {
  ${CR} :is(.sf-cru-stage, .sf-cru-card) { border:1px solid CanvasText; background:Canvas; box-shadow:none; }
  ${CRD} .fh-key.fh-key--hazard { background:ButtonFace; color:ButtonText; }
  ${CRD_TILE} { background:Canvas; }
  ${CRD_TILE}[aria-selected='true'] { outline:2px solid Highlight; }
  ${CR} .sf-cru-filters .k-word[aria-pressed='true'] { background:none; border-bottom:2px solid Highlight; }
}
`;

/* PQ-210.05: the results -- two printed fields over the held arena, the run's number as the hero
   reading, and the three ways out as keys. */
const CRRES = 'html body #screens > .k-screen.sf-crucible-results';
const CRUCIBLE_RESULTS = `
${CRRES} {
  background:
    radial-gradient(90% 70% at 12% 8%, rgb(150 26 14 / .16), transparent 55%),
    url("/assets/ui/backdrops/backdrop-crucible-door.jpg") center / cover no-repeat,
    linear-gradient(180deg, rgb(6 8 11 / .92), rgb(4 5 8 / .96));
}
${CRRES}[data-outcome="victory"] {
  background:
    radial-gradient(90% 70% at 12% 8%, rgb(242 185 80 / .10), transparent 55%),
    url("/assets/ui/backdrops/backdrop-crucible-door.jpg") center / cover no-repeat,
    linear-gradient(180deg, rgb(6 8 11 / .92), rgb(4 5 8 / .96));
}
${CRRES} .k-title .k-t-title {
  display:inline-block; padding-bottom:12px;
  font-family:var(--dp-face-display); font-variation-settings:"wght" 900, "wdth" 125; text-transform:uppercase;
  letter-spacing:.04em; ${TITLE_INK}
  background:linear-gradient(0deg, var(--dp-danger) 4px, transparent 0) left bottom / 100% 100% no-repeat;
}
${CRRES}[data-outcome="victory"] .k-title .k-t-title { background:linear-gradient(0deg, var(--dp-lamp) 4px, transparent 0) left bottom / 100% 100% no-repeat; }
${CRRES} .sf-crd-headline { color:var(--dp-ink); font-family:var(--dp-face-read); max-width:42em; }
${CRRES} .sf-crres__stage.k-panel { align-self:stretch; min-height:0; column-gap:clamp(16px, 2vw, 28px); }
${CRRES} .sf-crres__story, ${CRRES} .sf-crres__ledger { box-sizing:border-box; min-width:0; padding:16px 18px; border:12px solid transparent; ${SURFACE} }
${CRRES} .sf-crres__band-title { font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 66; font-size:12px; letter-spacing:.22em; text-transform:uppercase; color:var(--dp-ink-mute); text-shadow:none; }
${CRRES} .sf-crres__story-line, ${CRRES} .sf-crres__lead, ${CRRES} .sf-crres__empty,
${CRRES} .sf-crres__build-name, ${CRRES} .sf-crres__causal-lead { color:var(--dp-ink); }
${CRRES} .k-row { min-height:36px; }
${CRRES} .k-row__name, ${CRRES} .k-row__sub { color:var(--dp-ink-dim); }
${CRRES} .k-row__num { font-family:var(--dp-face-read); font-weight:600; color:var(--dp-phos); font-variant-numeric:tabular-nums; }
/* the hero number is a reading on the veil, not a plate */
${CRRES} .sf-crres__hero.k-corner { padding:14px 18px 16px; border:12px solid transparent; border-image:none; background:none; box-shadow:none; }
${CRRES} .sf-crres__hero .k-hero__n {
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 820, "wdth" 84;
  font-size:clamp(36px, min(4vw, 7vh), 72px); line-height:.92; letter-spacing:.02em;
  color:var(--dp-lamp-hot); text-shadow:var(--dp-emit-lamp);
}
${CRRES} .sf-crres__hero .k-hero__w { font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 70; font-size:12px; letter-spacing:.18em; text-transform:uppercase; color:var(--dp-ink-mute); }
${CRRES} .sf-crres__causal-tag { font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 72; letter-spacing:.14em; color:var(--dp-ink-dim); }
${CRRES} .sf-crres__hit-track, ${CRRES} .k-bar { height:3px; border-radius:0; overflow:hidden; background:var(--dp-rule-hi); box-shadow:none; }
${CRRES} .sf-crres__hit-fill, ${CRRES} .k-bar__fill { background:var(--dp-danger); box-shadow:0 0 6px var(--dp-danger-bloom); }
${printedKey(`${CRRES} .k-foot .k-word`)}
@media (max-width:1100px) { ${CRRES} .sf-crres__stage.k-panel { grid-template-columns:minmax(0, 1fr); } }
@media (forced-colors:active) {
  ${CRRES} :is(.sf-crres__story, .sf-crres__ledger, .sf-crres__hero) { border:1px solid CanvasText; background:Canvas; box-shadow:none; }
  ${CRRES} .k-title .k-t-title { background:none; border-bottom:4px solid CanvasText; }
}
`;

/* -- THE LAST OLD PANELS -- the claim registry (base), any screen still on the old menu plate, and
   the operations board (automation). Their tokens resolve to the deckplate (amber for what you act
   on, bone for information, red for threat -- no blue, no green, no cyan); the panel is a printed
   field; cards are fields; buttons are keys; the tabs are words on a rail. -- */
const OLDP = 'html body #screens .screen.sf-menu:not(.k-screen)';
const AU = 'html body #screens #sf-automation';
const BS = 'html body #screens #sf-base';
const CARD = `border:0; border-radius:0; background:var(--dp-field); box-shadow:none; transform:none; translate:none;`;
const LEGACY = `
${OLDP}, ${AU} {
  --panel:#0d1116; --panel-2:#151a21; --panel-edge:rgb(232 226 212 / .12); --panel-edge-2:rgb(232 226 212 / .22);
  --ink:var(--dp-ink); --ink-dim:var(--dp-ink-dim); --ink-mute:var(--dp-ink-mute);
  --accent:var(--dp-lamp); --accent-2:var(--dp-lamp-hot); --accent-3:var(--dp-lamp);
  --good:#d8d2c4; --warn:var(--dp-lamp-hot); --danger:var(--dp-danger-hot);
  --mono:var(--dp-face-read); --mf-display:var(--dp-face-etch); --mf-ui:var(--dp-face-read); --mf-line-2:rgb(232 226 212 / .16);
  --sf-display-face:var(--dp-face-etch); --sf-body-face:var(--dp-face-read); --sf-data-face:var(--dp-face-read);
  border:14px solid transparent; border-radius:0; ${SURFACE} -webkit-backdrop-filter:none; backdrop-filter:none;
}
/* Asteroid Works keeps its own warm law palette; only its green and its typewriter numerals go */
html body #screens .ast-screen { --aw-mint:#d8d2c4; --aw-sky:#c9c4b6; --aw-mono:var(--dp-face-read); }
${BS} :is(.base-plan, .base-slot, .base-spec, .base-ledger, .base-mod),
${AU} :is(.au-next, .au-summary, .au-metric, .au-card, .au-income, .au-outpost-flow, .au-miner-ops, .au-empty) { ${CARD} }
${BS} :is(.base-slot, .base-spec, .base-mod):hover, ${AU} :is(.au-metric, .au-card):hover { ${CARD} background:${INK_FIELD}, var(--dp-field); }
${BS} .base-slot.empty, ${AU} .au-empty { background:linear-gradient(rgb(232 226 212 / .03) 0 0); color:var(--dp-ink-mute); }
${BS} .base-spec.active { background:${LAMP_EDGE}, ${INK_FIELD}, var(--dp-field); }
${BS} .base-plan--warn { background:${LAMP_EDGE}, var(--dp-field); }
${BS} .base-plan--bad { background:linear-gradient(90deg, var(--dp-danger) 2px, transparent 0), var(--dp-field); }
${BS} .base-plan--ok { background:linear-gradient(90deg, var(--dp-ink-dim) 2px, transparent 0), var(--dp-field); }
${AU} .au-next { background:${LAMP_EDGE}, var(--dp-field); }
${BS} .base-ledger-cell { border-left:1px solid var(--dp-rule-hi); }
${BS} .base-title, ${AU} .au-title {
  font-family:var(--dp-face-display); font-variation-settings:"wght" 900, "wdth" 125; font-weight:inherit;
  font-size:clamp(22px, min(1.8vw, 3.2vh), 32px); letter-spacing:.05em; text-transform:uppercase; color:var(--dp-ink);
}
${AU} .au-title::before { width:7px; height:7px; border-radius:50%; background:var(--dp-lamp); box-shadow:0 0 8px var(--dp-lamp-bloom); }
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
${AU} :is(.au-section-h, .au-head) { border-bottom:1px solid var(--dp-rule); background:none; }
${AU} .au-credits { ${CARD} color:var(--dp-ink); }
${AU} :is(.au-capbar, .au-storebar, .au-minibar) { border:0; border-radius:0; background:var(--dp-rule-hi); box-shadow:none; }
${AU} .au-capfill { background:var(--dp-lamp); box-shadow:0 0 8px var(--dp-lamp-bloom); }
${AU} .au-minibar > i { background:var(--dp-ink-dim); }
${AU} :is(.au-pill, .au-program-badge) { border:1px solid var(--dp-rule-hi); border-radius:0; background:none; box-shadow:none;
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 74; letter-spacing:.14em; color:var(--dp-ink-dim); }
${AU} .au-pill.warn { color:var(--dp-lamp-hot); border-color:rgb(242 185 80 / .5); }
${AU} .au-pill.bad { color:var(--dp-danger-hot); border-color:rgb(255 80 56 / .55); }
${AU} .au-pill.ok { color:var(--dp-ink); }
${AU} .au-tabs { gap:0 18px; padding:0; border:0; border-radius:0; box-shadow:none; background:${RAIL}; }
${AU} .au-tab { min-height:30px; padding:0 2px; border:0; border-radius:0; box-shadow:none; background:none;
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 74; font-weight:inherit; letter-spacing:.14em; color:var(--dp-ink-dim); }
${AU} .au-tab:hover { color:var(--dp-ink); background:none; }
${AU} .au-tab:focus-visible { outline:2px solid var(--dp-ink) !important; outline-offset:3px; color:var(--dp-ink); }
${AU} .au-tab.active { color:var(--dp-ink); text-shadow:none; background:${LAMP_UNDER}; box-shadow:0 8px 10px -8px var(--dp-lamp-bloom); }
${printedKey(`${AU} :is(.au-close, .au-cta, .au-card button, .au-outpost-detail button)`)}
${printedKey(`${BS} button.sf-btn`)}
${lampKey(`${AU} :is(.au-cta, .au-card button.au-buy):not(:disabled)`)}
${lampKey(`${BS} button.sf-btn.sf-btn--primary:not(:disabled)`)}
${AU} .au-card button.au-recall:not(:disabled) { --dpk-rule:linear-gradient(0deg, var(--dp-danger) 2px, transparent 0); }
${AU} .au-card button.au-recall:is(:hover, :focus-visible):not(:disabled) { --dpk-fill:var(--dp-danger); --dpk-cut:none; color:var(--dp-metal-0); box-shadow:0 0 18px var(--dp-danger-bloom); }
${AU} .au-program { ${CARD} color:var(--dp-ink); }
${AU} .au-outpost-detail summary { color:var(--dp-lamp-hot); }
@media (forced-colors:active) {
  ${OLDP}, ${AU} { border:1px solid CanvasText; background:Canvas; }
  ${BS} :is(.base-plan, .base-slot, .base-spec, .base-ledger, .base-mod), ${AU} :is(.au-next, .au-summary, .au-metric, .au-card, .au-income, .au-outpost-flow, .au-miner-ops, .au-empty) {
    background:Canvas; border:1px solid CanvasText; box-shadow:none;
  }
  ${AU} .au-tab.active { outline:2px solid Highlight !important; }
}
`;

/* -- RESEARCH, CODEX, LOAD -- three shell screens with their own instrument each, one grammar.
   Research is traces of light (the tree is a canvas in src/ui/screens/techTree.js; this dresses the
   dossier beside it). The codex is an archive and a reader. Load is a ledger of lives beside the
   save's hull. Scoped to each screen's root so nothing here reaches another screen. -- */
const TT = 'html body #screens #sf-techtree';
const SWATCH = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
const TT_SWATCH_AVAILABLE = SWATCH("<svg xmlns='http://www.w3.org/2000/svg' width='22' height='12'><path d='M.5 .5H17.5L21.5 4.5V11.5H.5Z' fill='rgb(10,12,16)' stroke='rgb(242,185,80)'/></svg>");
const TT_SWATCH_RESEARCHED = SWATCH("<svg xmlns='http://www.w3.org/2000/svg' width='22' height='12'><path d='M0 0H17L22 5V12H0Z' fill='rgb(232,226,212)' fill-opacity='.2'/><path d='M17 0L22 5' stroke='rgb(255,217,140)' stroke-width='2'/></svg>");
const TT_SWATCH_LOCKED = SWATCH("<svg xmlns='http://www.w3.org/2000/svg' width='22' height='12'><path d='M.5 .5H17.5L21.5 4.5V11.5H.5Z' fill='none' stroke='rgb(232,226,212)' stroke-opacity='.3'/></svg>");
/* the SELECTION block's .of-codex rules carry .k-screen:not(.sx-observatory); the codex matches that weight */
const CX = 'html body #screens > .k-screen.of-codex:not(.sx-observatory)';
const SL = 'html body #screens .of-saveload';
/** The width of the load screen's record page: the ship picture takes the rest of the stage. */
const SL_PAGE = 'clamp(360px, 38%, 470px)';
const ETCH = 'font-family:var(--dp-face-etch); font-variation-settings:"wght" 720, "wdth" 74; font-size:12px; letter-spacing:.16em; text-transform:uppercase;';
const ARCHIVE_SCREENS = `
/* research: the dossier stands level with the tree; the zoom reading sits under it */
${TT}.k-screen .tt-scroll { height:100%; }
${TT}.k-screen .tt-side { margin-top:0; padding-top:0; }
${TT} .tt-zoom-badge { bottom:-26px; ${ETCH} color:var(--dp-ink-mute); text-shadow:var(--dp-text-legible); }
${TT} .tt-side [data-sel] { display:flex; flex-direction:column; gap:10px; }
${TT} .tt-dossier__kicker { margin:0; ${ETCH} color:var(--dp-ink-mute); }
${TT} .tt-dossier__name {
  margin:0; font-family:var(--dp-face-etch); font-variation-settings:"wght" 820, "wdth" 86; font-size:clamp(24px, min(1.8vw, 3.2vh), 32px);
  line-height:1.05; letter-spacing:.04em; text-transform:uppercase; color:var(--dp-ink); text-shadow:var(--dp-text-legible);
}
${TT} .tt-dossier__state { margin:0; font-family:var(--dp-face-read); font-size:15px; color:var(--dp-ink-dim); }
${TT} .tt-dossier__state[data-state="available"] { color:var(--dp-lamp-hot); }
${TT} .tt-dossier__state[data-state="researched"] { color:var(--dp-lamp); }
${TT} .tt-dossier__cost { display:grid; grid-template-columns:1fr 1fr; gap:0 18px; margin:6px 0 2px; padding:10px 0; background:${HAIR_TOP}, linear-gradient(0deg, var(--dp-rule) 1px, transparent 0); }
${TT} .tt-dossier__cost div { margin:0; }
${TT} .tt-dossier__cost dt { ${ETCH} color:var(--dp-ink-mute); }
${TT} .tt-dossier__cost dd {
  margin:4px 0 0; font-family:var(--dp-face-read); font-weight:600; font-size:28px; line-height:1; font-variant-numeric:tabular-nums;
  color:var(--dp-phos); text-shadow:var(--dp-phos-emit-soft), var(--dp-text-legible);
}
${TT} .tt-side .k-sentence { font-size:14px; line-height:1.45; color:var(--dp-ink-dim); }
${TT} .tt-side .k-caps { margin:8px 0 0; ${ETCH} color:var(--dp-ink-mute); }
${TT} .tt-side .k-rows { margin:0; }
${TT} .tt-side .k-row { min-height:30px; padding:4px 0; background:${HAIR_TOP}; background-repeat:no-repeat; }
${TT} .tt-side .k-row { grid-template-columns:minmax(0, 1fr) auto; column-gap:12px; }
${TT} .tt-side .k-row .k-row__name { font-size:15px; color:var(--dp-ink); white-space:normal; overflow:visible; text-overflow:clip; }
${TT} .tt-side .k-row .k-row__sub { ${ETCH} letter-spacing:.12em; color:var(--dp-ink-mute); }
${TT} .tt-side .tt-reqs .k-row[data-met="1"] .k-row__sub { color:var(--dp-lamp); }
${TT} .tt-side .tt-reqs .k-row[data-met="0"] .k-row__name { color:var(--dp-ink-dim); }
${TT} .tt-side [data-actions] { margin:4px 0 6px; }
${TT} .tt-side [data-actions] .k-word { width:100%; max-width:none; justify-content:flex-start; }
/* a locked or unaffordable node: the verb's place holds its reason, as a disabled key (no fill, a
   dim lamp hairline), never a tab word */
${TT} .tt-side [data-actions] .k-word[aria-disabled="true"] {
  box-sizing:border-box; min-height:var(--dp-key-h-2); padding:8px 14px; border-image:none; background:none; box-shadow:none;
  outline:1px solid rgb(138 107 58 / .85); outline-offset:-1px;
  ${ETCH} letter-spacing:.1em; line-height:1.3; color:var(--dp-ink-dim); cursor:default; text-align:left; white-space:normal;
}
${TT} .tt-side [data-actions] .k-word[aria-disabled="true"]:focus-visible { outline:0 solid transparent !important; background:var(--dp-bracket); }
/* the legend: each word wears the form its nodes wear, not a bead */
${TT} .k-foot { align-items:center; }
${TT} .tt-legend { display:flex; align-items:center; gap:26px; }
${TT} .tt-legend [data-swatch] { gap:10px; }
${TT} .tt-legend [data-swatch]::before { width:22px; height:12px; border-radius:0; box-shadow:none; background:${TT_SWATCH_LOCKED} center / 22px 12px no-repeat; }
${TT} .tt-legend [data-swatch="available"]::before { background:${TT_SWATCH_AVAILABLE} center / 22px 12px no-repeat; }
${TT} .tt-legend [data-swatch="researched"]::before { background:${TT_SWATCH_RESEARCHED} center / 22px 12px no-repeat; }
${TT} .tt-picker { display:flex; align-items:center; gap:12px; margin-left:auto; }
${TT} .tt-picker select.k-select { min-width:220px; }
@media (forced-colors:active) {
  ${TT} .tt-legend [data-swatch]::before { forced-color-adjust:none; background:none; border:1px solid CanvasText; }
}
/* codex: an archive and a reader. The entry is a page sized to its words, filed under its section,
   its illustration (the system mark, or the figure's crest) in the top-right; a turn at its foot. */
${CX} .k-hang .k-row { min-height:0; padding-block:5px; }
${CX} .k-hang .k-row .k-row__name { font-size:15px; line-height:1.25; }
${CX} .k-hang .k-row .k-row__sub { margin-top:1px; font-size:12px; line-height:1.25; }
${CX} .sf-codex-entry { min-height:0; max-width:min(920px, 100%); padding-bottom:4px; }
${CX} .sf-codex-entry:has(> .cx-reader__mark) > :not(.cx-reader__mark):not(.cx-reader__turn):not(img) { margin-right:calc(140px * var(--dp-s) + 28px); }
${CX} .sf-codex-entry > img { display:block; width:100%; object-fit:cover; margin-bottom:14px; }
${CX} .cx-reader__filed { margin:0 0 10px; ${ETCH} color:var(--dp-ink-mute); }
${CX} .cx-reader__mark { position:absolute; top:10px; right:14px; }
${CX} .cx-reader__mark .dp-mark { color:var(--dp-ink-dim); }
${CX} .cx-reader__mark .dp-mark svg { filter:none; }
${CX} .cx-reader__mark.is-locked .dp-mark { color:rgb(232 226 212 / .2); }
${CX} .cx-reader__mark.is-locked .dp-mark .accent { fill:currentColor; }
/* the ship's ledger page speaks the reader's header voice */
${CX} #sf-codex-stage .st-ledger .st-sub-h {
  font-family:var(--dp-face-etch); font-variation-settings:"wght" 820, "wdth" 86; font-size:clamp(24px, min(2vw, 3.6vh), 38px); line-height:1.05;
  letter-spacing:.04em; text-transform:uppercase; color:var(--dp-ink); text-shadow:var(--dp-text-legible);
}
${CX} .sf-codex-entry .k-t-title {
  margin:0 0 6px; font-family:var(--dp-face-etch); font-variation-settings:"wght" 820, "wdth" 86; letter-spacing:.04em; text-transform:uppercase;
}
/* the survey's figures are readings */
${CX} .sf-codex-entry > .k-words--row { display:flex; flex-wrap:wrap; gap:14px 40px; margin:4px 0 14px; }
${CX} .sf-codex-entry > .k-words--row .k-hero__n { font-family:var(--dp-face-read); font-weight:600; font-size:clamp(28px, min(2.2vw, 4vh), 40px); line-height:1; font-variant-numeric:tabular-nums; color:var(--dp-phos); text-shadow:var(--dp-phos-emit-soft), var(--dp-text-legible); }
${CX} .sf-codex-entry > .k-words--row .k-hero__w { margin-top:6px; ${ETCH} letter-spacing:.12em; color:var(--dp-ink-mute); }
/* the signal archive: four stills of one size in a row, caption and play under each */
${CX} .sf-codex-entry > ul.fh-cluster { display:grid; grid-template-columns:repeat(auto-fill, minmax(190px, 1fr)); gap:18px; width:100%; margin:14px 0 0; padding:0; }
${CX} .sf-codex-entry > ul.fh-cluster > li { min-width:0; }
${CX} .sf-codex-entry > ul.fh-cluster .fh-tile { width:100%; }
${CX} .sf-codex-entry > ul.fh-cluster .fh-fine { min-height:2.6em; font-size:13px; line-height:1.3; color:var(--dp-ink-dim); }
${CX} .sf-codex-entry > .fh-legend { margin:0 0 14px; ${ETCH} color:var(--dp-ink-mute); }
${CX} .sf-codex-entry .k-measure { min-height:calc(140px * var(--dp-s) - 60px); }
${CX} .sf-codex-entry .k-measure .k-sentence { color:var(--dp-ink); }
${CX} .sf-codex-entry .k-measure .k-sentence.k-38 { color:var(--dp-ink-mute); }
${CX} .sf-codex-entry .k-measure .k-rule { height:1px; margin:14px 0; border:0; background:var(--dp-rule); }
${CX} .sf-codex-entry .k-measure .k-sentence--emph { color:var(--dp-ink-dim); font-style:normal; }
${CX} .cx-reader__turn { display:flex; align-items:center; gap:16px; margin:22px 0 0; padding-top:14px; background:${HAIR_TOP}; background-repeat:no-repeat; }
${CX} .cx-reader__turn-at { ${ETCH} color:var(--dp-ink-mute); font-variant-numeric:tabular-nums; }
${printedKey(`${CX} .cx-reader__turn-key`)}
${CX} .cx-reader__turn-key { min-height:34px; font-size:12px; }
${CX} .cx-reader__turn-key--next { margin-left:auto; }
/* the catalogue in the foot: what is filed in each section, as readings */
${CX} > .k-foot { align-items:center; }
${CX} .cx-index { display:block; }
${CX} .cx-index__cap { margin:0 0 6px; ${ETCH} font-size:12px; letter-spacing:.2em; color:var(--dp-ink-mute); }
${CX} .cx-index__list { display:flex; flex-wrap:wrap; gap:10px 34px; margin:0; }
${CX} .cx-index__item { display:flex; flex-direction:column; margin:0; }
${CX} .cx-index__n {
  order:-1; margin:0; font-family:var(--dp-face-read); font-weight:600; font-size:22px; line-height:1.05; font-variant-numeric:tabular-nums;
  color:var(--dp-phos); text-shadow:var(--dp-phos-emit-soft), var(--dp-text-legible);
}
${CX} .cx-index__w { margin-top:4px; ${ETCH} letter-spacing:.12em; color:var(--dp-ink-mute); }
${CX} .cx-index__note { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
@media (forced-colors:active) {
  ${CX} .cx-index__n { color:CanvasText; text-shadow:none; }
}
/* load: a ledger of lives. The saves are ledger lines; the focused save is a page of its record
   standing on the left of the stage, the produced picture of its ship beside it. */
${SL} .k-hang .k-row { min-height:58px; padding:9px 14px 9px 16px; }
${SL} .k-hang .k-row .k-row__name { font-family:var(--dp-face-etch); font-variation-settings:"wght" 760, "wdth" 84; font-size:15px; letter-spacing:.08em; text-transform:uppercase; color:var(--dp-ink); }
${SL} .k-hang .k-row.empty .k-row__name { color:var(--dp-ink-mute); }
${SL} .k-hang .k-row .k-row__sub { margin-top:3px; font-family:var(--dp-face-read); font-size:14px; color:var(--dp-ink-dim); }
${SL} .k-hang .k-row .k-row__num { font-family:var(--dp-face-read); font-weight:600; font-size:16px; font-variant-numeric:tabular-nums; color:var(--dp-phos); text-shadow:var(--dp-phos-emit-soft); }
${SL} .sf-slot-badges { display:inline-flex; gap:10px; margin-left:12px; vertical-align:2px; }
${SL} .sf-slot-badge { ${ETCH} letter-spacing:.14em; color:var(--dp-ink-mute); }
${SL} .sf-slot-badge--you { color:var(--dp-lamp); }
${SL} .sf-slot-badge--foe { color:var(--dp-danger-hot); }
${SL} .sf-save-stage > .k-stage__foot.sf-save-ledger {
  top:0; bottom:0; left:0; width:${SL_PAGE}; box-sizing:border-box; display:flex; flex-direction:column; gap:12px;
  overflow:hidden auto; scrollbar-width:thin;
}
${SL} .sf-save-stage > :is(.k-stage__poster, .k-world--stage) { left:calc(${SL_PAGE} + 12px); width:calc(100% - ${SL_PAGE} - 12px); right:auto; }
${SL} .sf-save-stage > .k-stage__poster { inset:0 auto 0 calc(${SL_PAGE} + 12px); }
${SL} .sf-save-stage.is-vacant > :is(.k-stage__poster, .k-world--stage) { visibility:hidden; }
${SL} .sf-save-vacant { position:absolute; top:0; bottom:0; right:0; left:calc(${SL_PAGE} + 12px); display:none; place-items:center; pointer-events:none; }
${SL} .sf-save-stage.is-vacant > .sf-save-vacant { display:grid; }
${SL} .sf-save-vacant .dp-mark { color:rgb(232 226 212 / .14); }
${SL} .sf-save-vacant .dp-mark svg { filter:none; }
${SL} .sf-save-vacant .dp-mark .accent { fill:currentColor; }
${SL} .sf-save-ledger .sf-slot-context { margin:0; ${ETCH} color:var(--dp-ink-mute); }
${SL} .sf-save-ledger .sf-slot-card-title { margin:0; }
${SL} .sf-save-ledger .sf-slot-detail { margin:0; max-width:40ch; font-family:var(--dp-face-read); font-weight:500; font-size:16px; line-height:1.4; color:var(--dp-ink); }
${SL} .sf-save-stage[data-slot-state="empty"] .sf-slot-detail, ${SL} .sf-save-stage[data-slot-state="open"] .sf-slot-detail { color:var(--dp-ink-dim); font-weight:400; }
${SL} .sf-ledger-facts { display:grid; grid-template-columns:1fr 1fr; gap:12px 20px; margin:4px 0 0; padding:12px 0; background:${HAIR_TOP}, linear-gradient(0deg, var(--dp-rule) 1px, transparent 0); }
${SL} .sf-ledger-fact { margin:0; min-width:0; }
${SL} .sf-ledger-fact--figure { grid-column:1 / -1; }
${SL} .sf-ledger-fact dt { ${ETCH} color:var(--dp-ink-mute); }
${SL} .sf-ledger-fact dd { margin:4px 0 0; font-family:var(--dp-face-read); font-weight:600; font-size:17px; line-height:1.2; font-variant-numeric:tabular-nums; color:var(--dp-phos); text-shadow:var(--dp-phos-emit-soft); overflow-wrap:anywhere; }
${SL} .sf-ledger-fact--figure dd { font-size:clamp(28px, min(2.2vw, 4vh), 40px); line-height:1; letter-spacing:.01em; }
${SL} .sf-ledger-fact dd.is-blank { color:var(--dp-ink-mute); text-shadow:none; }
${SL} .sf-save-ledger .sf-save-portrait { display:flex; flex-direction:column; margin:0; padding:0; }
${SL} .sf-ledger-head { display:flex; align-items:center; gap:12px; margin:0 0 4px; ${ETCH} color:var(--dp-ink-mute); }
${SL} .sf-ledger-head::after { content:""; flex:1; height:1px; background:var(--dp-rule); }
${SL} .sf-ledger-line { display:grid; grid-template-columns:88px minmax(0, 1fr); align-items:baseline; gap:12px; padding:6px 0; background:${HAIR_TOP}; background-repeat:no-repeat; }
${SL} .sf-ledger-line:first-of-type { background:none; }
${SL} .sf-ledger-k { ${ETCH} letter-spacing:.12em; color:var(--dp-ink-mute); }
${SL} .sf-ledger-line .k-sentence { margin:0; font-family:var(--dp-face-read); font-size:14px; line-height:1.35; color:var(--dp-ink-dim); }
${SL} .sf-ledger-line .k-sentence::first-letter { text-transform:uppercase; }
${SL} .sf-save-ledger .sf-save-actions { padding-top:8px; }
/* the save's verbs are commands, not a choice: keys side by side, no rail under them */
${SL} .sf-save-actions .k-words.k-words--row.of-pause { gap:12px; align-items:center; background:none; }
${SL} .sf-save-stage[data-slot-state="filed"] .sf-save-ledger .sf-save-actions { margin-top:auto; }
@media (max-width:1100px) {
  ${SL} .sf-save-stage > .k-stage__foot.sf-save-ledger { position:relative; width:auto; }
  ${SL} .sf-save-stage > :is(.k-stage__poster, .k-world--stage, .sf-save-vacant) { display:none; }
}
@media (forced-colors:active) {
  ${SL} .sf-ledger-fact dd, ${SL} .k-hang .k-row .k-row__num { color:CanvasText; text-shadow:none; }
}
`;

/* -- FINISH -- scrollbars are a thin flat thumb on nothing (Windows Chromium drew arrow buttons for
   the standard thin scrollbar, so the standard properties are reset and the part is drawn with the
   scrollbar pseudo-elements). -- */
const NS = 'html body #screens > :not(.sx-observatory):not(.of-title)';
const FINISH = `
${NS}, ${NS} * { scrollbar-width:auto !important; scrollbar-color:auto !important; }
${NS} ::-webkit-scrollbar, ${NS}::-webkit-scrollbar { width:8px; height:8px; background:transparent; }
${NS} ::-webkit-scrollbar-button, ${NS}::-webkit-scrollbar-button { display:none; width:0; height:0; }
${NS} ::-webkit-scrollbar-track, ${NS}::-webkit-scrollbar-track { border-radius:0; background:rgb(232 226 212 / .05); box-shadow:none; }
${NS} ::-webkit-scrollbar-thumb, ${NS}::-webkit-scrollbar-thumb { border-radius:0; border:2px solid transparent; background:rgb(232 226 212 / .28) padding-box; box-shadow:none; }
${NS} ::-webkit-scrollbar-thumb:hover, ${NS}::-webkit-scrollbar-thumb:hover { background:rgb(232 226 212 / .44) padding-box; }
${NS} ::-webkit-scrollbar-corner, ${NS}::-webkit-scrollbar-corner { background:transparent; }
${NS} .k-words--row .fh-key.fh-key--legend::before { display:none; }
`;

export const DECKPLATE_SCREENS_CSS = WORDS + PAUSE + FH_BRIDGE + MISSIONLOG + GAMEOVER + HELP + SETTINGS + SHELL + CHART + SELECTION + SHIP + RANGE + CRUCIBLE + CRUCIBLE_RESULTS + LEGACY + ARCHIVE_SCREENS + FINISH;
