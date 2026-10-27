/** Chart workbench -- the flight HUD structural kit, scoped to the map. Printed, not machined
 *  (owner, 2026-09-22): a panel is a flat field, the primary control is the lamp with the cut.
 *  Only the inspector is a field. The foot (route, cargo deck, the navigation answers) is words
 *  on hairlines over the chart: a field across the whole foot printed over the answers.
 *
 *  This sheet is injected LAST on the chart (src/ui/galaxyMap.js injectStyle: navigationStyles
 *  -> CHART_HARDWARE -> this), after the deckplate CHART block and the ORRERY chartLayouts
 *  sheet, so equal-specificity rules here win the cascade. */
export const MAP_WORKBENCH_CSS = `
#sf-galaxymap {
  --sf-map-accent: var(--dp-lamp);
  --sf-accent: var(--sf-map-accent);
  --sf-accent-rgb: 242 185 80;
  --so-accent: var(--sf-map-accent);
  --k-signal: var(--sf-map-accent);
}
/* ── The inspector's scroll is legible ──────────────────────────────────────────────────────
   The deckplate CHART block (src/ui/deckplate/screens.js, shared with every screen) masks
   .gm-inspector-content with an ALWAYS-ON 22px bottom fade. Two defects on the real pixels
   (.devshots/ui-bench chart.png / chart-route.png, 2026-10-25): when the content fits, the fade
   half-dissolves the last heading ("Markers on Chart & Key") for no reason; when the route
   ribbon grows the pinned band and the content overflows, a row clips mid-glyph through that
   same fade with no affordance. Here the fade becomes scroll-aware: a registered length custom
   property is driven by the box's own scroll position, so the fade exists only while there is
   more below the fold and clears at the end; when nothing overflows there is no scroll range,
   the timeline is inactive, and the mask stays fully clear. The hair scrollbar brightens a
   step so an overflow always shows its track. Under sf-reduce-flash the animation is dropped
   (the property keeps its 0px base -> no fade) and the scrollbar carries the affordance;
   forced-colors keeps the deckplate's mask:none. */
@property --sf-ins-fade { syntax: "<length>"; inherits: false; initial-value: 0px; }
/* Selector strength note: the deckplate CHART block uses "html body #screens
   #sf-galaxymap.of-chart ..." and the ORRERY sheet adds ".orr-chart" to the same prefix; a bare
   "#sf-galaxymap ..." here loses to both regardless of load order. These overrides carry the
   ORRERY-strength prefix and, where they replace a !important value, !important of their own. */
html body #screens #sf-galaxymap.of-chart.orr-chart .gm-inspector-content {
  --sf-ins-fade: 0px;
  /* The fade completes ~3px above the box edge, so a row at the cut dissolves fully instead of
     halting mid-glyph (the chart-route.png defect); the scrollbar carries the "more below". */
  -webkit-mask-image: linear-gradient(180deg, #000 calc(100% - var(--sf-ins-fade)), transparent calc(100% - 3px)) !important;
  mask-image: linear-gradient(180deg, #000 calc(100% - var(--sf-ins-fade)), transparent calc(100% - 3px)) !important;
  animation: sf-ins-fade-appear linear both;
  animation-timeline: scroll(self block);
  scrollbar-color: color-mix(in srgb, var(--dp-ink, #e8e2d4) 34%, transparent) transparent;
}
html body #screens #sf-galaxymap.of-chart.orr-chart .gm-inspector-actions { scrollbar-color: color-mix(in srgb, var(--dp-ink, #e8e2d4) 34%, transparent) transparent; }
@keyframes sf-ins-fade-appear { from { --sf-ins-fade: 26px; } to { --sf-ins-fade: 0px; } }
/* The pinned band's route verbs fit one row in the 288px column (chartLayouts' 20px gap wrapped
   DISENGAGE to a second row, spending inspector height the details below the fold need). */
html body #screens #sf-galaxymap.of-chart.orr-chart .gm-right-inspector .gm-ribbon-actions.k-words { gap: 0 12px !important; }
@media (forced-colors: active) {
  #sf-galaxymap .gm-inspector-content { -webkit-mask-image: none; mask-image: none; animation: none; }
}
#sf-galaxymap .gm-right-inspector {
  border: 14px solid transparent;
  border-image: none;
  border-radius: 0;
  background: var(--dp-field);
  box-shadow: none;
}
#sf-galaxymap button[data-sf-role="primary"] {
  -webkit-appearance: none;
  appearance: none;
  border-style: solid;
  border-color: transparent;
  border-width: 10px 10px 12px;
  border-image: none;
  border-radius: 0;
  background: linear-gradient(225deg, transparent calc(var(--dp-cut) * .7071), var(--dp-lamp) 0);
  color: var(--dp-metal-0);
}
#sf-galaxymap button[data-sf-role="primary"]:is(:disabled, [aria-disabled="true"]) {
  background: linear-gradient(0deg, var(--dp-lamp-dim) 1px, transparent 0);
  color: var(--dp-ink-mute);
}
`;
