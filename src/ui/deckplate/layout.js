// Deckplate layout — the five primitives the component layer was missing, and without which every
// screen in this game invented its own geometry.
//
// The survey on 2026-09-22 found panels floating at hand-typed coordinates on ship, three panels
// stacked on top of each other on chart, a title screen whose menu was naked text beside a 64x787
// empty rail, and seven station tabs each with a different idea of where the content starts. The
// component layer had a gauge, a bracket, a contact row, an annunciator and a socket — everything
// an INSTRUMENT needs and nothing a SCREEN needs.
//
//   dp-frame   the screen shell. One margin, one column, one hero slot, for every screen in the
//              game. This is the primitive that makes two screens look like one product.
//   dp-title   the milled nameplate. Exactly one per screen (THE_BAR.md §2).
//   dp-menu    a menu item that is a machined target rather than a line of text.
//   dp-field   a text slot cut into the plate, with the lamp under it.
//   dp-table   the column register: aligned numerals, etched header, lamp on the live row.
//
// Same laws as the rest of the system: material comes from tokens, state rides data-* and
// modifiers, motion is transform/opacity only, nothing exceeds --dp-d-settle, and no surface
// hand-mixes a colour.

export const DECKPLATE_LAYOUT_CSS = `
/* ══════════════════════════════════════════════════════════════════════════════════════════════
   1. dp-frame — the screen shell.

   Every full-screen surface is this grid. The margin, the column width and the vertical beat are
   the SAME three tokens on every screen, which is the whole reason a player reads the game as one
   machine instead of forty windows. A screen that needs a different composition changes the
   MODIFIER, never the numbers.

       .dp-frame            head / body / foot, body is one column
       .dp-frame--split     body is [standing column | main], the station and chart shape
       .dp-frame--rail      body is [main | standing column], the flight-adjacent shape
       .dp-frame--hang      head hangs into the left column, the title-screen shape

   The frame is the only place in the system allowed to own outer padding.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
.dp-frame {
  --dp-frame-col:var(--dp-col);
  position:relative;
  box-sizing:border-box;
  display:grid;
  grid-template-rows:auto minmax(0, 1fr) auto;
  grid-template-areas:"head" "body" "foot";
  gap:var(--dp-rhythm);
  width:100%; height:100%;
  /* The safe frame: on an ultrawide the content centres rather than stretching to the bezels. */
  padding:var(--dp-margin) max(var(--dp-margin), calc((100% - 2200px) / 2));
  color:var(--dp-ink);
  font-family:var(--dp-face-read);
  font-size:var(--dp-fs-data);
}
/* A frame that IS the screen. #screens flex-centres its children, so a full-bleed surface has to
   pin itself the way .k-screen used to, and isolation keeps the screen's own z-indices from
   escaping into the HUD's stack (ARCHITECTURE §1.2). */
.dp-frame--screen { position:fixed; inset:0; isolation:isolate; background:transparent; }
.dp-frame__head { grid-area:head; min-width:0; }
.dp-frame__body { grid-area:body; min-height:0; min-width:0; display:grid; gap:var(--dp-rhythm); }
.dp-frame__foot { grid-area:foot; min-width:0; display:flex; align-items:center; gap:var(--dp-gap); flex-wrap:wrap; }

.dp-frame--split > .dp-frame__body { grid-template-columns:var(--dp-frame-col) minmax(0, 1fr); }
.dp-frame--rail  > .dp-frame__body { grid-template-columns:minmax(0, 1fr) var(--dp-frame-col); }
.dp-frame--hang {
  grid-template-columns:var(--dp-frame-col) minmax(0, 1fr);
  grid-template-areas:"head head" "body body" "foot foot";
}

/* A column of blocks inside the frame, on the same beat as the frame itself. Panels stop needing
   their own margins, which is where near-miss alignment came from. */
.dp-frame__col { display:flex; flex-direction:column; gap:var(--dp-rhythm); min-height:0; min-width:0; }
.dp-frame__col--tight { gap:var(--dp-gap); }
.dp-frame__scroll { overflow:auto; overscroll-behavior:contain; min-height:0; scrollbar-width:thin; }
.dp-frame__scroll::-webkit-scrollbar { width:10px; height:10px; }
.dp-frame__scroll::-webkit-scrollbar-track { background:var(--dp-metal-0); }
.dp-frame__scroll::-webkit-scrollbar-thumb {
  background:var(--dp-metal-3); border:2px solid var(--dp-metal-0); border-radius:6px;
}
.dp-frame__scroll::-webkit-scrollbar-thumb:hover { background:var(--dp-metal-4); }

/* Inset utilities. A plate is a material and owns no padding, so the surface that mounts one says
   how much air its contents get — from the same unit as everything else, never a typed number. */
.dp-pad { padding:var(--dp-pad); }
.dp-pad--wide { padding:calc(var(--dp-pad) * 1.5); }
.dp-stack { display:flex; flex-direction:column; gap:var(--dp-gap); min-width:0; }
/* Anything stacked inside a plate wraps INSIDE it. A column is a fixed width by design, so a long
   contract name or an entity chip must fold rather than run out past the bevel. */
.dp-stack > * { min-width:0; overflow-wrap:break-word; }
.dp-stack--loose { gap:calc(var(--dp-gap) * 2); }
.dp-bar { display:flex; align-items:center; gap:var(--dp-gap); flex-wrap:wrap; min-width:0; }
.dp-bar--end { margin-left:auto; }

/* Running copy never runs wider than it can be read. */
.dp-copy {
  font-family:var(--dp-face-read); font-size:var(--dp-fs-body); line-height:1.5;
  color:var(--dp-ink-dim); max-width:var(--dp-measure); margin:0;
}
.dp-copy + .dp-copy { margin-top:calc(var(--dp-u) * 2); }
/* A quiet sentence — a timestamp, a caveat. Etch size, but it is prose, so unlike .dp-etch it
   wraps: .dp-etch is nowrap because a LEGEND is one line, and a sentence in a legend's clothes is
   how the pause brief's save line ran out past the plate edge. */
.dp-copy--fine {
  font-size:var(--dp-fs-etch); letter-spacing:.04em; color:var(--dp-ink-mute);
  text-shadow:var(--dp-etch-shadow);
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   2. dp-title — the milled nameplate.

   The screen's one display element. The letterform is CUT into the deck the same way an etched
   legend is, only at title size: a dark incision above, a warm bounce on the lower edge from the
   key light. The eyebrow names the machine you are standing at; the rule under it runs out to the
   frame edge, which is what anchors the title to the screen instead of floating it.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
.dp-title { display:flex; flex-direction:column; gap:calc(var(--dp-u) * 1.5); min-width:0; }
.dp-title__eyebrow {
  font-family:var(--dp-face-etch);
  font-variation-settings:"wght" 620, "wdth" 68;
  font-size:var(--dp-fs-etch);
  letter-spacing:.22em; text-transform:uppercase;
  color:var(--dp-ink-mute);
  text-shadow:var(--dp-etch-shadow);
  display:flex; align-items:center; gap:calc(var(--dp-u) * 2);
}
/* The eyebrow carries a lamp bead when the screen is live rather than informational. */
.dp-title__eyebrow[data-live="1"]::before {
  content:""; width:6px; height:6px; border-radius:50%; flex:0 0 auto;
  background:var(--dp-lamp); box-shadow:0 0 7px var(--dp-lamp-bloom);
}
.dp-title__name {
  margin:0;
  font-family:var(--dp-face-display);
  font-variation-settings:"wght" 760, "wdth" 92;
  font-size:var(--dp-fs-title);
  line-height:.92; letter-spacing:-.005em; text-transform:uppercase;
  color:var(--dp-ink);
  /* Cut, not embossed: the incision reads above the stroke, the bounce below it. */
  text-shadow:0 -1px 0 rgb(0 0 0 / .62), 0 1px 0 rgb(255 232 190 / .13), 0 3px 16px rgb(0 0 0 / .45);
}
.dp-title__name--hero { font-size:var(--dp-fs-name); font-variation-settings:"wght" 800, "wdth" 86; }
.dp-title__rule {
  height:2px; margin-top:calc(var(--dp-u) * 1.5);
  background:linear-gradient(90deg, var(--dp-metal-4) 0%, var(--dp-metal-3) 42%, transparent 100%);
  box-shadow:0 1px 0 var(--dp-key-edge);
}
/* The one place a screen may say something beside its title. */
.dp-title__aside { margin-left:auto; display:flex; align-items:center; gap:var(--dp-gap); }
.dp-title__row { display:flex; align-items:flex-end; gap:calc(var(--dp-u) * 4); min-width:0; }

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   3. dp-menu — a menu item is a machined target, not a line of text.

   At rest the plate is dark and the lamp is cold: the item is hardware you COULD wake. On hover or
   focus the lamp comes up, the plate catches the key light, and the item slides one unit toward
   the reader — the travel is what makes it feel like a switch rather than a link. Disabled keeps
   the plate and kills the lamp, so a dead control looks dead instead of looking unstyled.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
.dp-menu { display:flex; flex-direction:column; gap:calc(var(--dp-u) * 1.5); margin:0; padding:0; list-style:none; }
.dp-menu__item {
  position:relative; display:flex; align-items:center; gap:calc(var(--dp-u) * 4);
  box-sizing:border-box; width:100%;
  padding:calc(var(--dp-u) * 2.5) calc(var(--dp-u) * 4);
  border:0; border-radius:var(--dp-r-plate);
  background-color:transparent; background-image:none;
  color:var(--dp-ink-dim); text-align:left; text-decoration:none;
  font-family:var(--dp-face-display);
  font-variation-settings:"wght" 700, "wdth" 88;
  font-size:var(--dp-fs-menu);
  line-height:1; letter-spacing:.005em; text-transform:uppercase;
  cursor:pointer;
  transition:
    color var(--dp-d-cut) var(--dp-ease-lamp),
    transform var(--dp-d-cut) var(--dp-ease-lamp),
    background-color var(--dp-d-cut) var(--dp-ease-lamp),
    box-shadow var(--dp-d-cut) var(--dp-ease-lamp);
}
/* The lamp rail: a cold filament at rest, the live lamp when the item is awake. It is 2px of
   hardware, not a 4px coloured border — that strip is the single most reliable tell of a
   generated interface (THE_BAR.md §3). */
.dp-menu__item::before {
  content:""; position:absolute; left:0; top:22%; bottom:22%; width:2px;
  background:var(--dp-lamp-dim); opacity:.5;
  transition:opacity var(--dp-d-cut) var(--dp-ease-lamp), background var(--dp-d-cut) var(--dp-ease-lamp),
    box-shadow var(--dp-d-cut) var(--dp-ease-lamp), top var(--dp-d-cut) var(--dp-ease-lamp),
    bottom var(--dp-d-cut) var(--dp-ease-lamp);
}
.dp-menu__item:is(:hover, :focus-visible) {
  color:var(--dp-ink);
  transform:translateX(calc(var(--dp-u) * 1.5));
  background-color:rgb(255 232 190 / .035);
  box-shadow:inset 0 1px 0 rgb(255 232 190 / .10), inset 0 -1px 0 rgb(0 0 0 / .35);
  outline:none;
}
.dp-menu__item:is(:hover, :focus-visible)::before {
  top:8%; bottom:8%; opacity:1;
  background:var(--dp-lamp); box-shadow:0 0 10px var(--dp-lamp-bloom), 0 0 3px var(--dp-lamp-bloom);
}
/* Focus is the lamp at full current plus a machined edge on the plate, not a drawn rectangle
   floating around the word. The rail going hot is the primary cue; the edge is the confirmation. */
.dp-menu__item:focus-visible {
  box-shadow:inset 0 1px 0 var(--dp-key-edge), inset 0 -1px 0 var(--dp-shade-edge),
    inset 0 0 0 1px rgb(242 185 80 / .16);
}
.dp-menu__item:focus-visible::before { background:var(--dp-lamp-hot); box-shadow:0 0 14px var(--dp-lamp-bloom), 0 0 4px var(--dp-lamp-bloom); }
.dp-menu__item:active { transform:translateX(calc(var(--dp-u) * 1.5)) translateY(1px); }
.dp-menu__item[aria-disabled="true"], .dp-menu__item:disabled {
  color:var(--dp-ink-mute); cursor:default; transform:none; background-color:transparent; box-shadow:none;
}
.dp-menu__item[aria-disabled="true"]::before, .dp-menu__item:disabled::before {
  background:var(--dp-metal-4); opacity:.55; box-shadow:none; top:22%; bottom:22%;
}
/* The reason a dead item is dead, printed where the item is — never in a toast. */
.dp-menu__note {
  font-family:var(--dp-face-read); font-variation-settings:normal;
  font-size:var(--dp-fs-data); font-weight:400; line-height:1.4; letter-spacing:0;
  text-transform:none; color:var(--dp-ink-mute); max-width:var(--dp-measure);
  margin:calc(var(--dp-u) * -0.5) 0 calc(var(--dp-u) * 1.5) calc(var(--dp-u) * 4);
}
.dp-menu__key { margin-left:auto; }
.dp-menu__label { display:inline; }
.dp-menu__item .dp-kbd { margin-left:auto; }
/* words() keeps "(J)" in the DOM so textContent and the accessible name are exactly the label; the
   brackets are not part of the drawn keycap. Without this the pause list printed a floating "( J )"
   beside Mission Log. */
.dp-kbd .k-kbd__paren { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }

/* A run of verbs under an etched legend — a presentation row, never a focus stop. */
.dp-menu__group {
  font-family:var(--dp-face-etch);
  font-variation-settings:"wght" 620, "wdth" 66;
  font-size:var(--dp-fs-etch);
  letter-spacing:.2em; text-transform:uppercase;
  color:var(--dp-ink-mute); text-shadow:var(--dp-etch-shadow);
  margin:calc(var(--dp-u) * 3) 0 calc(var(--dp-u) * 0.5) calc(var(--dp-u) * 4);
}
.dp-menu__group:first-child { margin-top:0; }
.dp-menu--row { flex-direction:row; flex-wrap:wrap; align-items:stretch; }

/* A BANKED menu. The verbs a player reaches for keep their own row; a run marked data-bank lays out as
   a wrapping row of compact keys. This is how thirteen pause verbs end inside the frame without
   shrinking Resume, and it replaces styles/pause.css's hand-tuned 46px tiles and 7px seams. */
.dp-menu--banked { flex-direction:row; flex-wrap:wrap; align-items:flex-start; gap:calc(var(--dp-u) * 1.5); }
.dp-menu--banked > li { flex:1 1 100%; min-width:0; }
.dp-menu--banked > .dp-menu__group { flex:1 1 100%; }
.dp-menu--banked > li[data-bank] { flex:0 1 auto; }
.dp-menu--banked > li[data-bank] .dp-menu__item {
  width:auto;
  gap:calc(var(--dp-u) * 2);
  padding:calc(var(--dp-u) * 1.5) calc(var(--dp-u) * 2.5);
  font-size:var(--dp-fs-etch);
  font-family:var(--dp-face-etch);
  font-variation-settings:"wght" 660, "wdth" 74;
  letter-spacing:.11em;
  background-image:var(--dp-plate-img); background-color:var(--dp-metal-1);
  box-shadow:var(--dp-plate-bevel);
}
.dp-menu--banked > li[data-bank] .dp-menu__item::before { top:14%; bottom:14%; }
.dp-menu--banked > li[data-bank] .dp-menu__item:is(:hover, :focus-visible) { transform:translateY(-1px); }

/* The three sizes below menu. A verb in a footer is the same machine, quieter. */
.dp-menu__item--emph { font-size:var(--dp-fs-read); padding:calc(var(--dp-u) * 2) calc(var(--dp-u) * 3); }
.dp-menu__item--body {
  font-family:var(--dp-face-read); font-variation-settings:normal; font-weight:600;
  font-size:var(--dp-fs-body); text-transform:none; letter-spacing:0;
  padding:calc(var(--dp-u) * 1.5) calc(var(--dp-u) * 3);
}
/* A fine word sits INSIDE a line of running text (the build line, a footer), so unlike every other
   item it must not claim the row. width:auto and inline-flex, or the footer stacks into a column —
   which is exactly what the first migrated title did. */
.dp-menu__item--fine {
  display:inline-flex; width:auto;
  font-family:var(--dp-face-etch);
  font-variation-settings:"wght" 620, "wdth" 70;
  font-size:var(--dp-fs-etch); letter-spacing:.14em;
  padding:calc(var(--dp-u) * 1) calc(var(--dp-u) * 1.5);
}
.dp-menu__item--fine::before { display:none; }
.dp-menu__item--fine:is(:hover, :focus-visible) {
  transform:none; color:var(--dp-lamp); background-color:transparent;
  box-shadow:inset 0 -1px 0 var(--dp-lamp);
}

/* PRIMARY — the one verb the screen exists for. It is the only item whose lamp is already lit, and
   the plate under it is raised. One per screen; the kit enforced that and so does this. */
.dp-menu__item--primary { color:var(--dp-ink); }
.dp-menu__item--primary::before { opacity:1; background:var(--dp-lamp); box-shadow:0 0 9px var(--dp-lamp-bloom); top:8%; bottom:8%; }
.dp-menu__item--primary:is(:hover, :focus-visible)::before { background:var(--dp-lamp-hot); box-shadow:0 0 14px var(--dp-lamp-bloom), 0 0 4px var(--dp-lamp-bloom); }

/* DANGER — the same lamp driven red. No second hue enters the system for this. */
.dp-menu__item--danger:is(:hover, :focus-visible) { color:var(--dp-danger-hot); background-color:rgb(255 80 56 / .05); }
.dp-menu__item--danger:is(:hover, :focus-visible)::before { background:var(--dp-danger); box-shadow:0 0 10px var(--dp-danger-bloom); }
.dp-menu__item--danger::before { background:var(--dp-danger); opacity:.35; }

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   4. dp-field — a slot cut into the plate.

   Recessed (the channel material), with the lamp living under the lip. At rest the underline is a
   cold machined line; on focus it becomes the filament. No rounded pill, no 1px grey box.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
.dp-field { position:relative; display:flex; align-items:center; gap:calc(var(--dp-u) * 2); min-width:0; }
.dp-field__slot {
  flex:1 1 auto; min-width:0; box-sizing:border-box;
  padding:calc(var(--dp-u) * 2) calc(var(--dp-u) * 2.5);
  border:0; border-radius:var(--dp-r-plate) var(--dp-r-plate) 0 0;
  background-color:var(--dp-metal-0);
  background-image:var(--dp-channel-img);
  box-shadow:var(--dp-channel-bevel), inset 0 -2px 0 var(--dp-metal-4);
  color:var(--dp-ink);
  font-family:var(--dp-face-read); font-size:var(--dp-fs-data);
  font-variant-numeric:tabular-nums;
  transition:box-shadow var(--dp-d-cut) var(--dp-ease-lamp), color var(--dp-d-cut) var(--dp-ease-lamp);
}
.dp-field__slot::placeholder { color:var(--dp-ink-mute); opacity:1; }
.dp-field__slot:focus, .dp-field__slot:focus-visible {
  outline:none;
  box-shadow:var(--dp-channel-bevel), inset 0 -2px 0 var(--dp-lamp), 0 2px 10px -4px var(--dp-lamp-bloom);
}
.dp-field__slot:disabled { color:var(--dp-ink-mute); box-shadow:var(--dp-channel-bevel), inset 0 -2px 0 var(--dp-metal-3); }
.dp-field__mark { flex:0 0 auto; color:var(--dp-ink-mute); display:flex; }
.dp-field__slot:focus ~ .dp-field__mark, .dp-field:focus-within .dp-field__mark { color:var(--dp-lamp); }

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   5. dp-table — the column register.

   A real grid, so a number in row 40 lands under the number in row 1. Columns come from
   --dp-table-cols on the table, which is the ONLY thing a screen sets. Header legends are etched
   into the plate; the rule under them is machined, not a border. A row wakes its lamp on hover,
   the same gesture as a menu item, because they are the same machine.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
.dp-table { --dp-table-cols:minmax(0, 1fr) auto; display:flex; flex-direction:column; min-height:0; min-width:0; }
.dp-table__head, .dp-table__row {
  display:grid; grid-template-columns:var(--dp-table-cols);
  align-items:center; gap:calc(var(--dp-u) * 3);
  padding:0 calc(var(--dp-u) * 2.5);
  min-width:0;
}
.dp-table__head {
  height:calc(var(--dp-row) * .82); flex:0 0 auto;
  font-family:var(--dp-face-etch);
  font-variation-settings:"wght" 620, "wdth" 66;
  font-size:var(--dp-fs-etch);
  letter-spacing:.17em; text-transform:uppercase;
  color:var(--dp-ink-mute);
  text-shadow:var(--dp-etch-shadow);
  border-bottom:1px solid var(--dp-metal-4);
  box-shadow:0 1px 0 var(--dp-key-edge);
}
.dp-table__body { display:flex; flex-direction:column; min-height:0; overflow:auto; overscroll-behavior:contain; scrollbar-width:thin; }
.dp-table__row {
  position:relative;
  height:var(--dp-row); flex:0 0 auto;
  border:0; width:100%; box-sizing:border-box; text-align:left;
  background:transparent; cursor:pointer;
  font-family:var(--dp-face-read); font-size:var(--dp-fs-data);
  color:var(--dp-ink-dim);
  transition:color var(--dp-d-cut) var(--dp-ease-lamp), background-color var(--dp-d-cut) var(--dp-ease-lamp);
}
/* Banding is a tint of the plate, never a drawn line — a rule between every row is a spreadsheet,
   not an instrument. */
.dp-table__row:nth-child(even) { background-color:rgb(255 255 255 / .014); }
.dp-table__row::before {
  content:""; position:absolute; left:0; top:18%; bottom:18%; width:2px;
  background:var(--dp-lamp); opacity:0;
  transition:opacity var(--dp-d-cut) var(--dp-ease-lamp), box-shadow var(--dp-d-cut) var(--dp-ease-lamp);
}
.dp-table__row:is(:hover, :focus-visible) { color:var(--dp-ink); background-color:rgb(255 232 190 / .04); outline:none; }
.dp-table__row:is(:hover, :focus-visible)::before { opacity:.8; }
.dp-table__row[aria-selected="true"] {
  color:var(--dp-ink);
  background-color:rgb(255 232 190 / .07);
  box-shadow:inset 0 1px 0 rgb(255 232 190 / .10), inset 0 -1px 0 rgb(0 0 0 / .4);
}
.dp-table__row[aria-selected="true"]::before { opacity:1; box-shadow:0 0 9px var(--dp-lamp-bloom); }
.dp-table__row:focus-visible { box-shadow:inset 0 0 0 1px var(--dp-lamp); }

/* Cells. Numbers are tabular and right-aligned so a column is a column; names truncate with an
   ellipsis rather than pushing the numerals out of line. */
.dp-table__cell { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dp-table__cell--num {
  text-align:right; font-variant-numeric:tabular-nums; font-weight:600;
  color:var(--dp-ink); letter-spacing:.01em;
}
.dp-table__cell--mark { display:flex; align-items:center; gap:calc(var(--dp-u) * 2); }
.dp-table__cell--up { color:var(--dp-lamp); }
.dp-table__cell--down { color:var(--dp-danger); }
/* Direction carries a glyph as well as a hue: colour never means anything on its own. */
.dp-table__cell--up::after { content:" \\2191"; }
.dp-table__cell--down::after { content:" \\2193"; }

/* ══ Reduced motion: every travel becomes a state, never a movement. The lamp still tells you
   where you are. ══ */
@media (prefers-reduced-motion:reduce) {
  .dp-menu__item, .dp-table__row, .dp-field__slot { transition-duration:1ms; }
  .dp-menu__item:is(:hover, :focus-visible) { transform:none; }
  .dp-menu__item:active { transform:translateY(1px); }
}
html.sf-motion-reduce .dp-menu__item:is(:hover, :focus-visible) { transform:none; }

/* ══ Forced colours: the system stops drawing material and lets the OS draw, but the STRUCTURE
   (which row is live, which item is awake) still has to survive. ══ */
@media (forced-colors:active) {
  .dp-menu__item, .dp-table__row, .dp-field__slot { forced-color-adjust:none; }
  .dp-menu__item { color:ButtonText; background:ButtonFace; }
  .dp-menu__item:is(:hover, :focus-visible) { color:HighlightText; background:Highlight; }
  .dp-menu__item::before { background:ButtonText; }
  .dp-menu__item:is(:hover, :focus-visible)::before { background:HighlightText; }
  .dp-menu__item[aria-disabled="true"], .dp-menu__item:disabled { color:GrayText; }
  .dp-menu__item[aria-disabled="true"]::before, .dp-menu__item:disabled::before { background:GrayText; }
  .dp-table__row { color:CanvasText; background:Canvas; }
  .dp-table__row[aria-selected="true"], .dp-table__row:is(:hover, :focus-visible) { color:HighlightText; background:Highlight; }
  .dp-table__head { color:CanvasText; border-bottom-color:CanvasText; }
  .dp-field__slot { color:FieldText; background:Field; box-shadow:none; border:1px solid CanvasText; }
  .dp-field__slot:focus { border-color:Highlight; }
  .dp-title__name, .dp-title__eyebrow { color:CanvasText; text-shadow:none; }
  .dp-title__rule { background:CanvasText; box-shadow:none; }
}
`;
