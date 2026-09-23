// Component-local styling. The instrument is a deckplate dp-gauge: a machined plate with etched
// ticks, a lamp-lit reading, and a recessed channel the fill runs in. The #hud selectors
// intentionally outrank the generic gauge skin, regardless of mount order. Only this instrument
// is restyled; the rest of the HUD and user drag placement remain intact.
const STYLE_ID = 'sf-velocity-rail-style';

export const VELOCITY_RAIL_CSS = `
.sf-kit-gauge.sf-speed, #hud .sf-kit-gauge.sf-speed {
  /* Deckplate dp-gauge: the machined plate instrument. --sv-* aliases map onto the deckplate
     tokens so this component's own test contract (--sv-ink/-muted/-signal/-track) still reads the
     one accent system. The produced shell raster is retired: the material is the machined plate. */
  --sv-scale:clamp(.86, var(--k-s, 1), 1.15);
  /* The one accent, as literals: the component's contrast contract measures THESE hexes against
     its carrier (test/velocity-rail.test.mjs), so they name the deckplate values directly. */
  --sv-ink:#e8e2d4; --sv-muted:#c9bda4;
  --sv-signal:#f2b950; --sv-track:#6e675a;
  --sv-w:calc(284px * var(--sv-scale));
  position:relative; box-sizing:border-box; width:var(--sv-w); height:calc(116px * var(--sv-scale));
  min-width:0; max-width:none; margin:0; padding:0;
  border:0; border-radius:var(--dp-r-instrument, 3px);
  background-color:var(--dp-metal-1, #12151a);
  /* The produced carrier shell, under the deckplate plate light. */
  background-image:none, url("assets/ui/kit/assets/svg/velocity-rail-shell.svg");
  background-size:auto, 100% 100%; background-position:center, center; background-repeat:no-repeat;
  box-shadow:none;
  color:var(--sv-ink); isolation:isolate; contain:style;
  font-family:var(--k-text, 'Instrument Sans'), Arial, sans-serif;
}
.sf-cluster > .sf-kit-gauge.sf-speed, #hud .sf-cluster > .sf-kit-gauge.sf-speed { flex:0 0 auto; width:var(--sv-w); }
.sf-speed .sf-speed__label, .sf-speed .sf-speed__reference, .sf-speed .sf-speed__unit,
.sf-speed .sf-speed__extent, .sf-speed .sf-speed__zero {
  position:absolute; margin:0; font-size:12px; font-weight:600; line-height:1;
  white-space:nowrap; font-variant-numeric:tabular-nums; letter-spacing:.04em; color:var(--sv-muted);
}
.sf-speed .sf-speed__label { left:6.75%; top:6.3%; font-weight:700; letter-spacing:.16em; }
.sf-speed .sf-speed__reference { right:6.4%; top:6.3%; letter-spacing:.02em; }
.sf-speed .sf-speed__reference b { font-weight:600; color:var(--sv-ink); }
/* The reading is the instrument's display moment: the largest numeral on the flight deck. */
.sf-speed .sf-speed__digits {
  position:absolute; display:block; left:6.75%; top:19%; width:68%; height:54%;
  overflow:visible; fill:currentColor; color:var(--sv-signal); pointer-events:none;
}
.sf-speed .sf-speed__unit { right:6.4%; top:51.7%; color:var(--sv-ink); letter-spacing:.075em; }
.sf-speed .sf-speed__extent { right:6.4%; top:86.3%; color:var(--sv-muted); letter-spacing:.035em; }
.sf-speed .sf-speed__zero { left:6.75%; top:86.3%; }
.sf-speed .sf-speed__track {
  position:absolute; left:6.75%; right:8.1%; top:77.6%; height:4.31%;
  border-radius:var(--dp-r-plate, 2px); overflow:hidden;
  box-shadow:none;
}
.sf-speed .sf-speed__bed { position:absolute; inset:0; background:var(--sv-track); }
.sf-speed .sf-speed__fill {
  position:absolute; inset:0; transform:scaleX(0); transform-origin:left center;
  background:linear-gradient(180deg, var(--dp-lamp-hot, #ffd98c) 0%, var(--sv-signal) 55%, var(--dp-lamp-dim, #8a6b3a) 100%);
  box-shadow:0 0 8px var(--dp-lamp-bloom, rgb(242 185 80 / .34));
  transition:none;
}
.sf-speed .sf-speed__ticks {
  position:absolute; inset:0; width:100%; height:100%; color:var(--dp-metal-4, #2f3542); pointer-events:none;
}
.sf-speed .sf-speed__cursor {
  position:absolute; inset:0; transform:translateX(0); pointer-events:none; transition:none;
}
.sf-speed .sf-speed__cursor svg {
  display:block; position:absolute; width:8px; height:16px; left:-4px; top:-5px;
  overflow:visible; fill:var(--sv-ink);
}
.sf-speed .sf-speed__runout { position:absolute; right:-12px; top:-3px; width:8px; height:11px; color:var(--sv-signal); opacity:0; }
.sf-speed[data-over-reference="true"] .sf-speed__runout { opacity:1; }
.sf-speed[data-over-reference="true"] .sf-speed__extent { color:var(--sv-signal); }
.sf-speed[data-available="false"] .sf-speed__fill, .sf-speed[data-available="false"] .sf-speed__cursor,
.sf-speed[data-has-reference="false"] .sf-speed__fill, .sf-speed[data-has-reference="false"] .sf-speed__cursor { visibility:hidden; }
/* Zero numeric animation or 80ms chase easing: continuous telemetry must not look delayed.
   Keyboard users can inspect the same braking tooltip as pointer users without stealing game keys. */
.sf-kit-gauge.sf-speed:focus-visible { outline:2px solid var(--sv-signal); outline-offset:3px; }
.sf-speed.sf-stat--info:focus-visible .sf-tip { display:block; }
.sf-speed[data-available="false"] .sf-speed__extent { color:var(--sv-ink); }
/* The native numeric hook remains the HUD's 10 Hz owner (the meter carries accessibility). SVG figures follow
   that text; they never schedule a second clock or require a downloaded display font. */
.sf-speed .sf-speed__source {
  position:absolute; width:1px; height:1px; margin:-1px; padding:0; overflow:hidden;
  clip:rect(0,0,0,0); clip-path:inset(50%); white-space:nowrap; border:0;
}
.sf-speed.sf-stat--info .sf-tip {
  left:0; bottom:calc(100% + 10px); transform:none; width:max-content;
  box-sizing:border-box; max-width:min(100%, calc(100vw - 28px));
  white-space:pre-line; overflow-wrap:anywhere; padding:12px 14px; background:#0c141d; color:var(--sv-ink);
  border:1px solid #6c8494; font-size:12px; line-height:1.5; z-index:12;
}
/* Make only this instrument's deck wide enough for its own reading. It no longer relies on the
   old 360px dial overhanging the weapon rail. Existing user drag transforms are untouched. */
.sf-command-deck:has(.sf-speed) {
  width:max-content; max-width:calc(284px * clamp(.86, var(--k-s, 1), 1.15));
}
@media (min-width:1760px) {
  /* 16 % of the 16:9 safe box, not of the raw width: at 2560x1080 the HUD lives in a centred
     1920-wide box, and 16vw pushed the plate ~100 px under the ordnance tray. */
  .sf-command-deck:has(.sf-speed) { --sf-deck-inset:clamp(284px, calc((100vw - 2 * var(--sf-safe-inset-x, 0px)) * .16), 520px); }
}
@media (max-width:900px), (max-height:650px) {
  .sf-kit-gauge.sf-speed, #hud .sf-kit-gauge.sf-speed { --sv-scale:.86; }
  .sf-command-deck:has(.sf-speed) { max-width:244.24px; }
}
@media (max-width:560px) {
  .sf-kit-gauge.sf-speed, #hud .sf-kit-gauge.sf-speed { --sv-scale:.81; }
  .sf-command-deck:has(.sf-speed) { max-width:230.04px; }
}
/* Below 900px the old side-by-side deck intersects the hotbar. Reserve its strip without
   resizing/removing other controls. Phone-width whole-HUD layout is owned by the global HUD. */
@media (min-width:561px) and (max-width:900px) {
  #hud .sf-command-deck:has(.sf-speed) { bottom:110px; }
  #hud:has(.sf-speed) .sf-leftstack { bottom:260px; }
}
html.sf-reduce-motion .sf-speed__fill, html.sf-reduce-motion .sf-speed__cursor { transition:none; }
@media (prefers-reduced-motion:reduce) {
  .sf-speed .sf-speed__fill, .sf-speed .sf-speed__cursor { transition:none; }
}
html.sf-high-contrast .sf-kit-gauge.sf-speed, html.sf-high-contrast #hud .sf-kit-gauge.sf-speed {
  background:#000; border:1px solid #eef7ff; box-shadow:none;
  --sv-muted:#eef7ff; --sv-track:#8fa7b8;
}
@media (forced-colors:active) {
  .sf-kit-gauge.sf-speed, #hud .sf-kit-gauge.sf-speed,
  html.sf-high-contrast .sf-kit-gauge.sf-speed, html.sf-high-contrast #hud .sf-kit-gauge.sf-speed {
    background:Canvas; color:CanvasText; border:1px solid CanvasText; forced-color-adjust:none;
    --sv-ink:CanvasText; --sv-muted:CanvasText; --sv-signal:Highlight; --sv-track:GrayText;
  }
  .sf-speed .sf-speed__ticks { color:Canvas; }
  .sf-speed.sf-stat--info .sf-tip { background:Canvas; color:CanvasText; border-color:CanvasText; }
}
`;

export function mountVelocityRailStyles(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = VELOCITY_RAIL_CSS;
  doc.head.appendChild(style);
}
