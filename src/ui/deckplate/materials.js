// Deckplate surfaces -- what a screen may stand its content on.
//
// There were three "substances" here: machined plate (a brushed ramp with lit and shaded bevels and
// a procedural grain), engraved legend (a dark incision with a warm bounce), and a lamp lens (a
// radial hot spot set into the plate), plus rivets at plate corners. Every one of those is CSS
// imitating a physical material, and the owner ruled on 2026-09-22 that it looks awful
// (design/frontend/ONE_PHOTOGRAPH.md sections 0 and 9). The class names are kept because frames
// and screens address them; what they paint is now printed or lit:
//
//   dp-plate    a printed field -- one flat colour, no bevel, no grain.
//   dp-etch     a printed legend -- condensed, tracked, uppercase. No incision.
//   dp-lamp     an emitter -- a flat lamp-coloured dot with its bloom. Light, not a lens.
//   dp-read     a reading -- tabular numerals in phosphor or lamp ink, glowing a little.
//   dp-channel  the rail a fill travels along -- a flat track.
//
// Nothing here moves except colour, so there is no compositor cost to speak of. The one sheet a
// screen may have (backdrop blur of the real world) lives in layout.js, not here.

export const DECKPLATE_MATERIALS_CSS = `
/* -- dp-plate -- a printed field. -- */
.dp-plate { background:var(--dp-field); border:0; border-radius:0; box-shadow:none; }
.dp-plate--raised { background:var(--dp-field); }

/* -- dp-etch -- a printed legend. -- */
.dp-etch {
  font-family:var(--dp-face-etch);
  font-variation-settings:"wght" 600, "wdth" 62;
  font-size:var(--dp-fs-etch);
  letter-spacing:.17em; text-transform:uppercase; white-space:nowrap;
  color:var(--dp-ink-mute);
}
.dp-etch--live { color:var(--dp-ink-dim); }

/* -- dp-lamp -- an emitter. --dp-lamp-c carries the heat (default: live). -- */
.dp-lamp {
  --dp-lamp-c:var(--dp-lamp);
  background:var(--dp-lamp-c);
  box-shadow:0 0 6px var(--dp-lamp-bloom), 0 0 18px var(--dp-lamp-bloom-soft);
}
.dp-lamp--dim { --dp-lamp-c:var(--dp-lamp-dim); box-shadow:none; }
.dp-lamp--danger { --dp-lamp-c:var(--dp-danger); box-shadow:0 0 7px var(--dp-danger-bloom), 0 0 20px rgb(255 80 56 / .18); }

/* -- dp-read -- a reading: the numeral glows like a tube, cool for what you read, warm for what
   is live. Decoration is the light the reading throws, nothing else. -- */
.dp-read {
  font-family:var(--dp-face-read);
  font-variant-numeric:tabular-nums;
  color:var(--dp-phos);
  text-shadow:var(--dp-phos-emit-soft), var(--dp-text-legible);
}
.dp-read--lamp { color:var(--dp-lamp-hot); text-shadow:0 0 12px var(--dp-lamp-bloom), 0 0 3px rgb(255 217 140 / .5); }
.dp-read--danger { color:var(--dp-danger-hot); text-shadow:0 0 12px var(--dp-danger-bloom); }

/* -- dp-channel -- the track a fill runs along. -- */
.dp-channel { background:var(--dp-rule); border:0; border-radius:0; box-shadow:none; }

/* Forced colours: the system palette owns every surface. */
@media (forced-colors:active) {
  .dp-plate, .dp-plate--raised, .dp-channel { background:Canvas; border:1px solid CanvasText; box-shadow:none; forced-color-adjust:none; }
  .dp-etch, .dp-read { text-shadow:none; color:CanvasText; }
  .dp-lamp, .dp-lamp--dim, .dp-lamp--danger { background:ButtonText; box-shadow:none; }
}
`;
