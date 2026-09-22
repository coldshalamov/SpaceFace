// Deckplate materials — the three substances the system is made of. A consumer picks a material
// class and never mixes its own gradients: the material IS the design decision.
//
//   dp-plate    machined metal. Directional key light from the top-left: a warm catch on the top
//               and left bevels, shade on the bottom and right, a faint vertical falloff across
//               the face, and a fine machined grain. No rounded card, no frost, no outer glow.
//   dp-etch     engraved legend. The letterform is CUT: dark incision, warm bounce on the lower
//               edge — light answers the cut the way it answers a real engraving.
//   dp-lamp     the emitter. A hot core, a mid falloff, a soft bloom — one warm radial at three
//               radii. Lamps never sit flat: a lamp is a lens set INTO the plate.
//   dp-channel  the recessed way a gauge fill travels in: cut INTO the plate, dark, with the
//               lamp running inside it.
//
// Everything here is compositor-cheap by construction: static gradients on mount, animatable
// properties only (transform/opacity) in motion. No backdrop-filter, anywhere, ever.

export const DECKPLATE_MATERIALS_CSS = `
/* ── dp-plate — machined metal. The recipe is single-sourced in tokens.js (--dp-plate-*); this
   class is the one-class application of it. ── */
.dp-plate {
  background-color:var(--dp-metal-1);
  background-image:var(--dp-plate-img);
  box-shadow:var(--dp-plate-bevel);
  border:0; border-radius:var(--dp-r-plate);
}
/* A plate that stands prouder of the deck (instruments, the target plate). */
.dp-plate--raised { box-shadow:var(--dp-plate-bevel-raised); }

/* ── THE COMPUTED FACE — the plate's grain, drawn at the device's resolution ───────────────
   The gradient recipe above is the FALLBACK. Where the engine has a paint worklet (Chromium 136 on
   both routes), the face is computed instead: anisotropic brush, a key that matches --dp-key-angle,
   and a micro-tooth that only resolves when the display can show it. No raster, so no repeat at 1x
   and no blur at 4x. See paint/plate-worklet.js.
   ───────────────────────────────────────────────────────────────────────────────────── */
@supports (background-image: paint(dp-plate)) {
  .dp-plate { background-image: paint(dp-plate); }
  .dp-channel { background-image: paint(dp-channel); }
  /* A plate on a raised land is machined from the same stock, lit a little harder. */
  .dp-plate--raised { --dp-key-power: 1.18; --dp-plate-seed: 23; }
  .dp-glass, .dp-mfd { --dp-plate-seed: 41; }
}

/* ── THE SPECULAR SWEEP — one warm key you can move ───────────────────────────────────
   --dp-sweep is a REGISTERED <number> (deckplate/paint.js), which is the whole trick: an untyped
   custom property is a string and a string cannot be interpolated, so every gradient in this
   system was frozen. Typed, the browser interpolates it on the compositor, and the highlight
   built on it travels. Light that never moves is a picture of light.
   ───────────────────────────────────────────────────────────────────────────────────── */
.dp-sweep { position: relative; isolation: isolate; }
.dp-sweep::after {
  content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 1;
  border-radius: inherit;
  background: linear-gradient(
    calc(var(--dp-key-angle) + 90deg),
    transparent calc((var(--dp-sweep) * 100%) - 18%),
    rgb(255 236 206 / .10) calc(var(--dp-sweep) * 100%),
    transparent calc((var(--dp-sweep) * 100%) + 18%));
  opacity: 0;
  transition: opacity var(--dp-d-cut) var(--dp-ease-lamp);
}
/* Taking focus rakes the light across the surface, once. Hover lifts it without travelling, so a
   pointer moving over a list does not set six plates sweeping at the same time. */
.dp-sweep:hover::after { opacity: .55; }
.dp-sweep:is(:focus-visible, [aria-selected="true"], [aria-current="true"])::after {
  opacity: 1;
  animation: dp-rake var(--dp-d-settle) var(--dp-ease-settle) 1 both;
}
@keyframes dp-rake { from { --dp-sweep: -0.25; } to { --dp-sweep: 1.25; } }

@media (prefers-reduced-motion: reduce) {
  /* The light lands rather than travels: the state is still legible, nothing moves. */
  .dp-sweep:is(:focus-visible, [aria-selected="true"], [aria-current="true"])::after {
    animation: none; --dp-sweep: 0.5;
  }
}
@media (forced-colors: active) { .dp-sweep::after { display: none; } }

/* ── dp-etch — engraved legend ─────────────────────────────────────────────────────────────── */
.dp-etch {
  font-family:var(--dp-face-etch);
  font-variation-settings:"wght" 600, "wdth" 62;
  font-size:var(--dp-fs-etch);
  letter-spacing:.17em; text-transform:uppercase; white-space:nowrap;
  color:var(--dp-ink-mute);
  text-shadow:var(--dp-etch-shadow);
}
.dp-etch--live { color:var(--dp-ink-dim); }

/* ── dp-lamp — the warm emitter ────────────────────────────────────────────────────────────── */
/* The element itself is the lens; --dp-lamp-c carries the heat (default: live). */
.dp-lamp {
  --dp-lamp-c:var(--dp-lamp);
  background:
    radial-gradient(circle at 42% 34%, var(--dp-lamp-hot) 0%, var(--dp-lamp-c) 38%, transparent 72%);
  box-shadow:
    0 0 6px var(--dp-lamp-bloom),
    0 0 18px var(--dp-lamp-bloom-soft),
    inset 0 -1px 1px rgb(0 0 0 / .35);
}
.dp-lamp--dim { --dp-lamp-c:var(--dp-lamp-dim); box-shadow:inset 0 -1px 1px rgb(0 0 0 / .35); }
.dp-lamp--danger { --dp-lamp-c:var(--dp-danger); box-shadow:0 0 7px var(--dp-danger-bloom), 0 0 20px rgb(255 80 56 / .18), inset 0 -1px 1px rgb(0 0 0 / .35); }

/* Lamp-lit TEXT (readings, not legends): the numeral glows like a filament display —
   a warm core and one tight bloom. Decoration is the light the reading throws, nothing else. */
.dp-read {
  font-family:var(--dp-face-read);
  font-variant-numeric:tabular-nums;
  color:var(--dp-ink);
  text-shadow:0 0 10px var(--dp-lamp-bloom-soft), 0 1px 2px rgb(0 0 0 / .6);
}
.dp-read--lamp { color:var(--dp-lamp-hot); text-shadow:0 0 12px var(--dp-lamp-bloom), 0 0 3px rgb(255 217 140 / .5); }
.dp-read--danger { color:var(--dp-danger-hot); text-shadow:0 0 12px var(--dp-danger-bloom); }

/* ── dp-channel — the recessed way a fill travels in (recipe single-sourced in tokens.js) ── */
.dp-channel {
  background-color:var(--dp-metal-0);
  background-image:var(--dp-channel-img);
  box-shadow:var(--dp-channel-bevel);
  border:0; border-radius:var(--dp-r-plate);
}

/* ── dp-rivet — the one permitted ornament: a fastener, because the machine is bolted together.
   Used at plate corners only, via a pair of radial dots in a background layer. ── */
.dp-rivets {
  background-image:
    radial-gradient(circle at 5px 5px, rgb(255 232 190 / .30) 0 1px, rgb(0 0 0 / .5) 1.6px, transparent 2.4px),
    radial-gradient(circle at calc(100% - 5px) 5px, rgb(255 232 190 / .30) 0 1px, rgb(0 0 0 / .5) 1.6px, transparent 2.4px),
    radial-gradient(circle at 5px calc(100% - 5px), rgb(255 232 190 / .22) 0 1px, rgb(0 0 0 / .5) 1.6px, transparent 2.4px),
    radial-gradient(circle at calc(100% - 5px) calc(100% - 5px), rgb(255 232 190 / .22) 0 1px, rgb(0 0 0 / .5) 1.6px, transparent 2.4px);
  background-repeat:no-repeat;
}

/* Forced colours: the system palette owns every material. */
@media (forced-colors:active) {
  .dp-plate, .dp-plate--raised, .dp-channel { background:Canvas; border:1px solid CanvasText; box-shadow:none; forced-color-adjust:none; }
  .dp-etch, .dp-read { text-shadow:none; color:CanvasText; }
  .dp-lamp, .dp-lamp--dim, .dp-lamp--danger { background:ButtonFace; box-shadow:none; }
  .dp-rivets { background-image:none; }
}
`;
