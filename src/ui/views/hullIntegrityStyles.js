// Component-local scope overrides the retired flask's dimensions without changing any other HUD.
const STYLE_ID = 'sf-hull-integrity-style';
export const HULL_INTEGRITY_CSS = `
.sf-schematic.sf-integrity, #hud .sf-schematic.sf-integrity {
  /* Deckplate: the integrity instrument speaks the one accent. Ice reads are remapped to the lamp
     ramp (warm bone ink, filament signal); warning/danger are the lamp driven hot/red. */
  --si-paper:var(--dp-ink, #e8e2d4); --si-muted:var(--dp-ink-dim, #a9a696); --si-edge:var(--dp-metal-4, #2f3542);
  --si-blue:var(--dp-lamp, #f2b950); --si-core:var(--dp-lamp-hot, #ffd98c); --si-facet-edge:var(--dp-lamp-dim, #8a6b3a);
  --si-warning:var(--dp-lamp, #f2b950); --si-danger:var(--dp-danger, #ff5038);
  --si-signal:var(--si-blue); --si-body:var(--dp-metal-2, #191d24); --si-cut:var(--dp-metal-0, #0b0d10); --si-track:var(--dp-metal-3, #232833);
  position:relative; display:block; isolation:isolate; contain:style; box-sizing:border-box;
  width:100%; max-width:272px; height:auto; aspect-ratio:272 / 174; grid-column:1 / -1; grid-row:auto;
  margin:0; padding:0; border:0; border-radius:0; overflow:visible;
  /* No card behind the dial: the readings are printed straight on the flight veil like the speed,
     energy and fire-control readings beside it (ONE_PHOTOGRAPH section 9). The silhouette is the
     drawn instrument; a filled box around it was the one plate left in the cluster. */
  background:none;
  box-shadow:none;
  color:var(--si-paper); font-family:var(--k-text, 'Instrument Sans'), Arial, sans-serif;
  font-size:12px; line-height:1; font-variant-numeric:tabular-nums; text-shadow:none;
}
#hud .sf-bars.sf-bars--lamina, .sf-bars.sf-bars--lamina {
  display:flex; flex-direction:column; align-items:stretch; width:100%; max-width:272px;
  gap:6px; margin:0; padding:0; border:0; border-image:none; border-radius:0;
  background:none; box-shadow:none; overflow:visible;
}
#hud .sf-bars--lamina .sf-barrow, .sf-bars--lamina .sf-barrow {
  width:100%; box-sizing:border-box; grid-template-columns:54px minmax(0, 1fr) 34px;
  padding:0 10px; min-height:22px;
}
#hud .sf-bars--lamina .sf-condition-head { display:none; }
.sf-integrity .sf-integrity__art, #hud .sf-integrity .sf-integrity__art {
  position:absolute; inset:0; display:block; width:100%; height:100%; overflow:visible;
  pointer-events:none; fill:none; filter:none; transform:none;
}
.sf-integrity__heading, .sf-integrity__identity, .sf-integrity__label,
.sf-integrity__hull-state, .sf-integrity__shield-label, .sf-integrity__shield-state,
.sf-integrity__shield-value, .sf-integrity__percent {
  position:absolute; display:block; margin:0; padding:0; font-size:12px; line-height:1;
  white-space:nowrap; font-weight:600; text-transform:uppercase;
}
.sf-integrity .sf-integrity__heading { left:5.15%; top:5.75%; letter-spacing:.15em; color:var(--si-muted); }
.sf-integrity .sf-integrity__identity {
  left:25.73%; top:88.5%; transform:translateX(-50%); letter-spacing:.09em; color:var(--si-muted);
}
.sf-integrity .sf-integrity__hull-readout { position:absolute; left:49.63%; top:20%; width:45.23%; height:38%; }
.sf-integrity .sf-integrity__label { left:0; top:0; letter-spacing:.16em; color:var(--si-muted); }
.sf-integrity .sf-integrity__figures, #hud .sf-integrity .sf-integrity__figures {
  position:absolute; left:0; top:24%; display:block; width:80%; height:68%; overflow:visible;
  fill:var(--si-paper); filter:none; transform:none;
}
/* The lamina cells are the fill — warm metal facets under the key light, the lamp at the core. */
.sf-integrity .sf-integrity__gradient-edge { stop-color:var(--dp-lamp-dim, #8a6b3a); }
.sf-integrity .sf-integrity__gradient-core { stop-color:var(--dp-lamp-hot, #ffd98c); }
.sf-integrity[data-hull="critical"] .sf-integrity__gradient-edge,
.sf-integrity[data-hull="destroyed"] .sf-integrity__gradient-edge { stop-color:var(--dp-danger, #ff5038); }
.sf-integrity[data-hull="critical"] .sf-integrity__gradient-core,
.sf-integrity[data-hull="destroyed"] .sf-integrity__gradient-core { stop-color:var(--dp-danger-hot, #ff8a70); }
.sf-integrity .sf-integrity__percent { right:0; top:70%; color:var(--si-muted); font-size:14px; }
.sf-integrity .sf-integrity__hull-state { left:0; top:97%; color:var(--si-signal); letter-spacing:.10em; }
.sf-integrity .sf-integrity__shield-readout { position:absolute; left:49.63%; top:67.2%; width:45.23%; height:25.28%; }
.sf-integrity .sf-integrity__shield-label { left:0; top:0; color:var(--si-muted); letter-spacing:.08em; }
.sf-integrity .sf-integrity__shield-value { right:0; top:0; font-size:14px; color:var(--si-signal); }
.sf-integrity .sf-integrity__shield-rail, #hud .sf-integrity .sf-integrity__shield-rail {
  position:absolute; left:0; top:39%; display:block; width:100%; height:4px; overflow:visible;
}
.sf-integrity .sf-integrity__shield-state { left:0; top:64%; color:var(--si-muted); letter-spacing:.025em; }
.sf-integrity .sf-integrity__datum { stroke:var(--si-edge); stroke-width:1; opacity:.65; }
.sf-integrity .sf-integrity__envelope-track { stroke:var(--si-track); stroke-width:1; }
.sf-integrity .sf-integrity__envelope, .sf-integrity .sf-integrity__envelope-echo {
  fill:none; stroke:var(--si-blue); stroke-width:2.6; stroke-linecap:butt; stroke-linejoin:round;
}
.sf-integrity .sf-integrity__envelope-echo { stroke:var(--si-paper); stroke-width:3.8; }
.sf-integrity .sf-integrity__shadow { fill:var(--si-cut); stroke:var(--si-cut); stroke-width:1.8; }
.sf-integrity .sf-integrity__body { fill:var(--si-body); stroke:none; }
.sf-integrity .sf-integrity__damage-hatch { fill:none; stroke:var(--si-edge); stroke-width:.22; opacity:.38; }
.sf-integrity .sf-integrity__lamina { fill:var(--si-facet, var(--dp-metal-3, #232833)); stroke:none; }
.sf-integrity .sf-integrity__loss { fill:var(--si-warning); stroke:none; }
.sf-integrity .sf-integrity__spar { fill:var(--si-paper); opacity:.94; }
.sf-integrity .sf-integrity__structure { fill:none; stroke:var(--si-cut); stroke-width:.38; }
.sf-integrity .sf-integrity__outline { fill:none; stroke:var(--si-edge); stroke-width:.54; stroke-linejoin:round; }
.sf-integrity .sf-integrity__outline .sx-shipmark__cut { stroke-width:.35; }
.sf-integrity .sf-integrity__impact { fill:none; stroke:var(--si-paper); stroke-width:1.55; }
.sf-integrity .sf-integrity__repair { fill:none; stroke:var(--si-paper); stroke-width:2.3; }
.sf-integrity .sf-integrity__shield-break { stroke:var(--si-warning); stroke-width:2.2; display:none; }
/* State grammar rides on place and shape, not hue alone: OFFLINE cuts the envelope track with amber
   X marks at the waist; CHARGING feeds bone chevrons into the shoulders; CRITICAL edges the whole
   silhouette in danger red. Each is CSS-gated off the data attributes the frame already writes. */
.sf-integrity[data-shield="offline"] .sf-integrity__shield-state { color:var(--si-warning); }
.sf-integrity .sf-integrity__recharge { fill:none; stroke:var(--si-paper); stroke-width:2; display:none; }
.sf-integrity[data-shield="charging"] .sf-integrity__recharge { display:block; }
.sf-integrity[data-hull="critical"] .sf-integrity__outline,
.sf-integrity[data-hull="destroyed"] .sf-integrity__outline { stroke:var(--si-danger); stroke-width:.9; }
.sf-integrity .sf-integrity__rail-bed { stroke:var(--si-track); stroke-width:4; }
.sf-integrity .sf-integrity__rail-fill { stroke:var(--si-blue); stroke-width:4; }
.sf-integrity .sf-integrity__rail-cuts { stroke:var(--si-cut); stroke-width:2; }
.sf-integrity[data-hull="damaged"] { --si-signal:var(--si-warning); --si-facet-edge:var(--dp-lamp-dim, #8a6b3a); --si-core:var(--dp-lamp-hot, #ffd98c); }
.sf-integrity[data-hull="critical"], .sf-integrity[data-hull="destroyed"] {
  --si-signal:var(--si-danger); --si-facet-edge:var(--si-danger); --si-core:var(--dp-danger-hot, #ff8a70);
}
.sf-integrity[data-hull="critical"] .sf-integrity__figures,
.sf-integrity[data-hull="destroyed"] .sf-integrity__figures { fill:var(--si-signal); }
.sf-integrity[data-hull="critical"] .sf-integrity__hull-state,
.sf-integrity[data-hull="destroyed"] .sf-integrity__hull-state {
  font-weight:800;
}
.sf-integrity[data-hull="destroyed"] .sf-integrity__spar { opacity:.25; }
.sf-integrity[data-shield="offline"] .sf-integrity__shield-break { display:block; }
.sf-integrity[data-shield="offline"] .sf-integrity__shield-value { color:var(--si-warning); }
.sf-integrity[data-shield="absent"] .sf-integrity__envelope-track,
.sf-integrity[data-shield="unavailable"] .sf-integrity__envelope-track { stroke-dasharray:2 5; opacity:.5; }
.sf-integrity[data-shield="absent"] .sf-integrity__shield-rail,
.sf-integrity[data-shield="unavailable"] .sf-integrity__shield-rail { visibility:hidden; }
.sf-integrity[data-hull="unavailable"] .sf-integrity__percent { visibility:hidden; }
.sf-integrity[data-hull="unavailable"] .sf-integrity__spar { opacity:.3; }
/* Motion is finite and driven by the host's existing frame. CSS is only a safety net for flags
   toggled between frames; there is no infinite pulse, blur, transition or extra animation clock. */
.sf-integrity[data-motion="false"] .sf-integrity__repair,
.sf-integrity[data-flashes="false"] .sf-integrity__impact,
html.sf-reduce-motion .sf-integrity .sf-integrity__repair,
html.sf-reduce-motion .sf-integrity .sf-integrity__impact,
html.sf-reduce-flash .sf-integrity .sf-integrity__impact { visibility:hidden; }
@media (prefers-reduced-motion:reduce) {
  .sf-integrity .sf-integrity__repair, .sf-integrity .sf-integrity__impact { visibility:hidden; }
}
html.sf-high-contrast .sf-schematic.sf-integrity,
html.sf-high-contrast #hud .sf-schematic.sf-integrity {
  background:#000; border:1px solid var(--si-paper); --si-muted:#eff8ff; --si-edge:#b3c7d8;
}
@media (forced-colors:active) {
  .sf-schematic.sf-integrity, #hud .sf-schematic.sf-integrity,
  html.sf-high-contrast .sf-schematic.sf-integrity, html.sf-high-contrast #hud .sf-schematic.sf-integrity {
    background:Canvas; border:1px solid CanvasText; forced-color-adjust:none;
    --si-paper:CanvasText; --si-muted:CanvasText; --si-edge:GrayText; --si-blue:Highlight;
    --si-signal:CanvasText; --si-core:Highlight; --si-facet-edge:Highlight;
    --si-body:Canvas; --si-cut:Canvas; --si-track:GrayText;
    --si-warning:CanvasText; --si-danger:CanvasText;
  }
  .sf-integrity .sf-integrity__lamina { fill:Highlight; }
  .sf-integrity .sf-integrity__loss { fill:CanvasText; }
  .sf-integrity .sf-integrity__hull-state { color:CanvasText; }
}
`;
export function mountHullIntegrityStyles(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID; style.textContent = HULL_INTEGRITY_CSS; doc.head.appendChild(style);
}
