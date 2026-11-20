/** Chart workbench -- the flight HUD structural kit, scoped to the map. Printed, not machined
 *  (owner, 2026-09-22): a panel is a flat field, the primary control is the lamp with the cut.
 *  Only the inspector is a field. The foot (route, cargo deck, the navigation answers) is words
 *  on hairlines over the chart: a field across the whole foot printed over the answers.
 *
 *  This sheet is injected LAST on the chart (src/ui/galaxyMap.js injectStyle: navigationStyles
 *  -> CHART_HARDWARE -> this), after the deckplate CHART block and the ORRERY chartLayouts
 *  sheet, so equal-specificity rules here win the cascade. */
import { ATLAS_ART_URL } from './atlasRelief.js';

const CHART = 'html body #screens #sf-galaxymap.of-chart.orr-chart';

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

/* A matte chart bed under two stable reading margins. */
${CHART} .gm-viewport { isolation:isolate; background:var(--dp-metal-0) url("${ATLAS_ART_URL}") center / cover; }
${CHART} .gm-viewport canvas:first-child { position:relative; z-index:1; cursor:grab; touch-action:none; }
${CHART} .gm-viewport .gm-relief { position:absolute; inset:0; z-index:0; pointer-events:none; }
${CHART} .gm-head::before { content:""; position:absolute; inset:-36px -4vw 0; z-index:-1; pointer-events:none;
  background:linear-gradient(180deg, var(--dp-metal-0) 18%, transparent); }
${CHART} .gm-search-input.k-input { min-height:40px; padding:6px 76px 6px 12px !important; border:1px solid var(--dp-rule) !important;
  border-radius:4px; color:var(--dp-ink); background:var(--dp-field) !important; }
${CHART} .gm-search-input.k-input:focus { border-color:var(--dp-hand) !important; background:var(--dp-field) !important; }
${CHART} .gm-search-input::placeholder { color:var(--dp-ink-dim); }
${CHART} .gm-places-btn { position:absolute; top:4px; right:4px; bottom:4px; padding:0 9px; border:1px solid var(--dp-rule);
  border-radius:4px; background:var(--dp-metal-1); color:var(--dp-ink); cursor:pointer; font:650 13px/1 var(--dp-face-read); }
${CHART} .gm-places-btn:hover, ${CHART} .gm-places-btn[aria-expanded="true"] { border-color:var(--dp-line-hi); color:var(--dp-hand-hot); }
${CHART} .gm-search-results { left:auto !important; right:0; top:calc(100% + 7px) !important; width:min(390px, calc(100vw - 28px));
  max-height:min(490px, 65dvh); box-sizing:border-box; overflow:auto; overscroll-behavior:contain; padding:12px;
  border:1px solid var(--dp-rule-hi) !important; border-radius:8px !important; background:var(--dp-metal-1) !important;
  scrollbar-width:thin; box-shadow:0 14px 32px rgb(0 0 0 / .5) !important; }
${CHART} .gm-search-results[hidden] { display:none !important; }
${CHART} .gm-place-filters { display:flex; flex-wrap:wrap; gap:5px; padding-bottom:12px; }
${CHART} .gm-place-filter { display:flex; align-items:center; gap:5px; min-height:32px; padding:4px 7px;
  border:1px solid var(--dp-rule); border-radius:4px; background:var(--dp-field); color:var(--dp-ink-dim);
  font:620 13px/1 var(--dp-face-read); cursor:pointer; }
${CHART} .gm-place-filter svg { width:16px; height:16px; }
${CHART} .gm-place-filter:hover { border-color:var(--dp-line-hi); color:var(--dp-ink); }
${CHART} .gm-place-filter[aria-pressed="true"] { border-color:var(--dp-hand); color:var(--dp-hand-hot); }
${CHART} .gm-place-list-title { padding:8px 2px; border-top:1px solid var(--dp-rule); color:var(--dp-ink-dim);
  font:650 12px/1.2 var(--dp-face-read); }
${CHART} .gm-search-results .gm-search-item.k-row:has(.gm-search-place) {
  display:grid !important; grid-template-columns:24px minmax(0,1fr); align-items:start; column-gap:9px;
  width:100%; margin:0; padding:9px 7px !important; border:0; border-radius:4px; box-shadow:none;
  background:transparent; text-align:left; font-family:var(--dp-face-read); color:var(--dp-ink); cursor:pointer; }
${CHART} .gm-search-item.k-row:is(.selected,:hover,:focus-visible) { background:var(--dp-metal-2); }
${CHART} .gm-search-symbol { align-self:start; margin-top:2px; color:#b9d9cc; }
${CHART} .gm-search-place { display:flex; min-width:0; flex-direction:column; align-items:start; gap:2px; }
${CHART} .gm-search-item .gm-search-item-name { font:680 15px/1.2 var(--dp-face-read); color:var(--dp-ink); }
${CHART} .gm-search-results .gm-search-item .gm-search-place > * {
  max-width:100%; text-transform:none !important; text-align:left;
}
${CHART} .gm-search-item .gm-search-item-detail { font:500 12px/1.2 var(--dp-face-read); color:var(--dp-ink-dim); }
${CHART} .gm-search-services { color:#b9d9cc; font:520 12px/1.3 var(--dp-face-read); }
${CHART} .gm-search-empty { padding:8px 2px; margin:0; font:500 14px/1.3 var(--dp-face-read); color:var(--dp-ink-dim); }
${CHART} :is(.gm-places-btn,.gm-place-filter,.gm-search-item,.gm-locate-goal):focus-visible {
  outline:2px solid var(--dp-hand); outline-offset:-2px; }
${CHART} .gm-tabs.k-words { gap:2px 4px !important; padding-bottom:8px !important; border-bottom:1px solid var(--dp-rule); }
${CHART} .gm-tab.k-word { min-height:29px !important; padding:5px 7px !important; border-radius:3px !important;
  letter-spacing:.02em !important; text-transform:none !important; }
${CHART} .gm-tab.k-word[aria-selected="true"] { background:var(--dp-field-ink) !important; color:var(--dp-hand-hot) !important; }
${CHART} .gm-tab.k-word:focus-visible { outline:2px solid var(--dp-hand) !important; outline-offset:-2px; text-shadow:none !important; }
${CHART} .orr-chart-tabscale, ${CHART} .orr-chart-lever :is(.orr-band,.orr-lit-bloom,.orr-bead-bloom) { display:none !important; }
${CHART} .gm-tabs.k-words::before, ${CHART} .gm-nav-row::before, ${CHART} .gm-nav-row::after { content:none !important; }
${CHART} .gm-navfoot { border-top:1px solid var(--dp-rule) !important; padding-top:12px !important; background:var(--dp-metal-0) !important; }
${CHART} .gm-navfoot .gm-nav-row[data-tone="tracked"] .gm-nav-row-v { color:var(--dp-hand-hot) !important; }
${CHART} .gm-right-inspector { border-left:1px solid var(--dp-rule) !important; padding-left:14px !important;
  background:linear-gradient(90deg, var(--dp-metal-0), var(--dp-field)) !important; }
${CHART} .gm-left-rail { background:var(--dp-field) !important; border:1px solid var(--dp-rule) !important; border-radius:4px !important; }
${CHART} .gm-locate-goal:not([hidden]) { display:grid; align-content:start; gap:4px; margin:4px 0 8px; padding:10px 8px;
  width:100%; border:1px solid var(--dp-rule); border-left:2px solid var(--dp-hand); border-radius:4px;
  background:var(--dp-metal-1); text-align:left; font:500 12px/1.3 var(--dp-face-read); color:var(--dp-ink-dim); cursor:pointer; }
${CHART} .gm-locate-goal[hidden] { display:none !important; }
${CHART} .gm-locate-goal:hover { border-color:var(--dp-hand); }
${CHART} .gm-locate-name { color:var(--dp-ink); font-size:14px; line-height:1.2; overflow-wrap:anywhere; }
${CHART} .gm-locate-action { color:var(--dp-hand-hot); font-weight:680; }
${CHART}:not([data-layout="wide"]) .gm-locate-goal:not([hidden]) { display:flex; flex-wrap:wrap; align-items:baseline; gap:3px 8px;
  margin:0; padding:7px 8px; }
${CHART}:not([data-layout="wide"]) .gm-locate-sector { display:none; }
@media (pointer:coarse) {
  ${CHART} .gm-place-filter { min-height:40px; }
  ${CHART} .gm-search-input.k-input { min-height:46px !important; }
}
${CHART} .gm-rail-sec:not([open]) > :not(summary) { display:none !important; }
${CHART} .gm-rail-sum.k-caps { letter-spacing:0 !important; text-transform:none !important; color:var(--dp-ink) !important; }
${CHART} .gm-left-rail .gm-layer-btn.k-word { text-transform:none; letter-spacing:0; min-height:32px; }
${CHART}:not([data-scale="local"]) :is([data-layer="traffic"], [data-map-symbol="hostile"]) { display:none !important; }
${CHART}[data-scale="galaxy"] .gm-quick-key { display:none; }
${CHART} .gm-quick-key {
  display:grid; gap:8px; margin:10px 0 0 9px; padding:12px 4px 12px 2px;
  border-top:1px solid var(--dp-rule); color:var(--dp-ink-dim); font:500 13px/1.15 var(--dp-face-read);
}
${CHART} .gm-quick-key > span { display:flex; gap:6px; align-items:center; }
${CHART} .gm-quick-key svg { flex:none; width:19px; height:19px; }
${CHART} .gm-quick-key [data-map-symbol="station"] svg { color:#b9d9cc; }
${CHART} .gm-quick-key [data-map-symbol="gate"] svg { color:#bcb7d9; }
${CHART} .gm-quick-key [data-map-symbol="goal"] svg { color:var(--dp-hand-hot); }
${CHART} .gm-quick-key [data-map-symbol="hostile"] svg { color:var(--dp-danger-hot); }
${CHART}[data-layout="wide"] { --gm-rail-w:138px; }
${CHART}[data-layout="wide"] .gm-left-rail { align-self:start; width:100%; padding:4px 5px !important; max-height:100%; overflow:auto; }
${CHART}[data-layout="wide"] .gm-layer-buttons { display:grid; grid-template-columns:minmax(0, 1fr); }
${CHART}[data-layout="wide"] .gm-rail-sum { padding:3px 5px 3px 17px !important; }
${CHART}[data-layout="wide"] .gm-rail-sum::before { content:"" !important; position:absolute; display:block !important;
  top:calc(50% - 3px); left:4px; width:5px !important; height:5px !important; margin:0 !important; border:solid var(--dp-ink-dim) !important;
  border-width:0 1px 1px 0 !important; background:none !important; transform:rotate(-45deg); }
${CHART}[data-layout="wide"] .gm-rail-sec[open] > .gm-rail-sum::before { transform:rotate(45deg); }
${CHART}[data-layout="wide"] .gm-rail-sum:focus-visible { outline:2px solid var(--dp-hand) !important; outline-offset:-2px; background:none !important; }
${CHART}[data-layout="wide"] .gm-rail-body { padding-left:4px !important; }
${CHART}[data-layout="wide"] .gm-rail-sec + .gm-rail-sec { border-top:1px solid var(--dp-rule) !important; }
${CHART}:not([data-layout="wide"]) .gm-quick-key { display:none; }
@media (forced-colors: active) {
  ${CHART} .gm-right-inspector, ${CHART} .gm-left-rail { background:Canvas !important; border-color:CanvasText !important; }
}
`;
