// Original native chart layout, shared with production-backed fixtures. Orbital overrides are in styles/orbital.css.
export const CSS = `
/* THE CHART — the frontend kit's stage screen (design/frontend/direction/KIT_SPEC.md; DIRECTION_SHEET
   §2 "The chart"). This is the chart's one permitted local LAYOUT block: kit tokens only. No plates,
   cards, borders (hairline rules excepted), radii, gradients, glows, shadows or icons (§12). The
   sector is drawn on the sky at full bleed by the canvas underneath; every DOM region is transparent
   words laid on the kit grid — .gm-head is the title, .gm-left-rail the hang, .gm-right-inspector the
   stage-right column, .gm-apron the foot. Every gm-* class / id / data-attribute stays as an inert
   hook for the map checks. */
#sf-galaxymap {
  --gm-apron-h: clamp(168px, 26vh, 232px);
  --gm-rail-w: calc(var(--k-hang) * 0.5);
  --gm-inspector-w: calc(var(--k-hang) * 0.7);
  position: absolute;
  inset: 0;
  isolation: isolate;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr) auto;
  grid-template-areas: "title" "stage" "foot";
  row-gap: var(--k-gap);
  padding: var(--k-margin);
  box-sizing: border-box;
  background: transparent;
  color: var(--k-text-live);
  font-family: var(--k-text);
  font-weight: 400;
  font-size: var(--k-fs-body);
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
  user-select: none;
  overflow: hidden;
}
#sf-galaxymap *, #sf-galaxymap *::before, #sf-galaxymap *::after { box-sizing: border-box; border-radius: 0; }
#sf-galaxymap b { font-weight: 500; color: var(--k-text-live); }
#sf-galaxymap kbd { font: inherit; color: var(--k-text-live); }
#sf-galaxymap [hidden] { display: none !important; }
#sf-galaxymap :focus-visible { outline: 2px solid var(--k-bone); outline-offset: 4px; }

/* ---- The canvas: the whole frame, under every word ------------------------------------------ */
#sf-galaxymap .gm-body-container { position: static; }
#sf-galaxymap .gm-viewport {
  position: absolute;
  inset: 0;
  z-index: -2;
  overflow: hidden;
}
#sf-galaxymap .gm-viewport canvas { display: block; width: 100%; height: 100%; }

/* ---- Title block (.gm-head): the selected place's name, one sentence, the corner ------------- */
#sf-galaxymap .gm-head {
  grid-area: title;
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  grid-template-rows: auto auto auto auto;
  column-gap: var(--k-gap);
  row-gap: calc(8px * var(--k-s));
  align-items: start;
  min-height: 0;
  pointer-events: none;
}
#sf-galaxymap .gm-head > * { pointer-events: auto; min-width: 0; }
#sf-galaxymap .gm-title-lockup {
  grid-column: 1;
  grid-row: 1 / span 3;
  display: flex;
  flex-direction: column;
  gap: calc(6px * var(--k-s));
}
#sf-galaxymap .gm-title {
  margin: 0;
  color: var(--k-text-live);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
#sf-galaxymap .gm-stamp { margin: 0; max-width: var(--k-measure); }
#sf-galaxymap .gm-hint-btn { grid-column: 2; grid-row: 1; justify-self: end; }
#sf-galaxymap .gm-close { grid-column: 3; grid-row: 1; justify-self: end; }
#sf-galaxymap .gm-search-container {
  grid-column: 2 / span 2;
  grid-row: 2;
  position: relative;
  justify-self: end;
  width: clamp(18ch, 24vw, 40ch);
}
#sf-galaxymap .gm-search-input { width: 100%; padding-right: 2ch; }
#sf-galaxymap .gm-search-input::placeholder { color: var(--k-bone-38); }
#sf-galaxymap .gm-search-kbd {
  position: absolute;
  right: 0;
  top: calc(4px * var(--k-s));
  font-size: var(--k-fs-fine);
  color: var(--k-bone-38);
  pointer-events: none;
}
#sf-galaxymap .gm-search-results {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 3;
  max-height: 50vh;
  overflow: hidden auto;
  scrollbar-width: thin;
  scrollbar-color: var(--k-hair) transparent;
}
#sf-galaxymap .gm-search-item { --k-row-cols: minmax(0, 1fr); row-gap: 0; padding-top: calc(6px * var(--k-s)); padding-bottom: calc(6px * var(--k-s)); }
#sf-galaxymap .gm-search-item.selected { color: var(--k-text-live); box-shadow: inset 2px 0 0 var(--k-signal); }
#sf-galaxymap .gm-search-item-name, #sf-galaxymap .gm-search-item-detail { display: block; }
#sf-galaxymap .gm-search-empty { border: 0; min-height: 0; padding: calc(8px * var(--k-s)) 0; cursor: default; box-shadow: none; }
#sf-galaxymap .gm-weather {
  grid-column: 2 / span 2;
  grid-row: 3;
  justify-self: end;
  text-align: right;
  max-width: 40ch;
}
#sf-galaxymap .gm-weather-head { display: flex; justify-content: flex-end; gap: 1ch; }
#sf-galaxymap .gm-weather-word { color: var(--k-bone-62); }
#sf-galaxymap .gm-weather[data-weather-level="working"] .gm-weather-word { color: var(--k-signal); }
#sf-galaxymap .gm-weather[data-weather-level="hot"] .gm-weather-word { color: var(--k-red); }
#sf-galaxymap .gm-weather-data, #sf-galaxymap .gm-weather-terms { color: var(--k-bone-38); }
#sf-galaxymap .gm-weather-bar {
  display: flex;
  height: 2px;
  width: 100%;
  background: var(--k-hair);
  margin: calc(4px * var(--k-s)) 0;
}
#sf-galaxymap .gm-weather-seg { display: block; height: 100%; background: var(--k-bone-62); }
#sf-galaxymap .gm-weather-seg--combat { background: var(--k-red); }
#sf-galaxymap .gm-weather-seg--civil { background: var(--k-bone-62); }

/* The scale words and their continuity marker sit under the sentence (the table's "in the foot"
   would need the node moved out of .gm-head, which is JS restructuring this pass does not do). */
#sf-galaxymap .gm-rail {
  grid-column: 1;
  grid-row: 4;
  display: flex;
  align-items: baseline;
  gap: var(--k-gap);
  flex-wrap: wrap;
}
#sf-galaxymap .gm-rail-track {
  position: relative;
  display: block;
  align-self: center;
  width: calc(96px * var(--k-s));
  height: 1px;
  background: var(--k-hair);
}
#sf-galaxymap .gm-rail-marker {
  position: absolute;
  top: -4px;
  width: 2px;
  height: 9px;
  background: var(--k-signal);
  transform: translateX(-50%);
  transition: left var(--k-d-settle) var(--k-ease);
}
#sf-galaxymap .gm-scale-buttons { gap: var(--k-gap); }
#sf-galaxymap .gm-scale-btn.is-current { color: var(--k-text-live); }
#sf-galaxymap .gm-level b { color: var(--k-bone-62); }

/* The control key: fine-print rows that drop from the corner word. */
#sf-galaxymap .gm-hints {
  position: absolute;
  right: 0;
  top: 100%;
  z-index: 3;
  width: min(44ch, 90vw);
  padding-top: var(--k-pad);
}
#sf-galaxymap .gm-hints-title { margin-bottom: calc(8px * var(--k-s)); }
#sf-galaxymap .gm-hint-row { --k-row-cols: minmax(0, 1fr) auto; min-height: calc(var(--k-row) * 0.7); font-size: var(--k-fs-data); }
#sf-galaxymap .gm-hints-note { margin-top: var(--k-pad); max-width: var(--k-measure); }

/* ---- The stage row: hang | sky | inspector ---------------------------------------------------- */
#sf-galaxymap .gm-body-container {
  grid-area: stage;
  display: grid;
  grid-template-columns: var(--gm-rail-w) minmax(0, 1fr) var(--gm-inspector-w);
  grid-template-areas: "hang stage inspector";
  column-gap: var(--k-gap);
  min-height: 0;
  pointer-events: none;
}
#sf-galaxymap .gm-left-rail,
#sf-galaxymap .gm-right-inspector {
  pointer-events: auto;
  min-height: 0;
  min-width: 0;
  overflow: hidden auto;
  scrollbar-width: thin;
  scrollbar-color: var(--k-hair) transparent;
}
#sf-galaxymap .gm-left-rail { grid-area: hang; }
#sf-galaxymap .gm-right-inspector { grid-area: inspector; display: flex; flex-direction: column; gap: var(--k-pad); }

/* ---- The hang (.gm-left-rail): five disclosures of words -------------------------------------- */
#sf-galaxymap .gm-rail-sec { border-top: 1px solid var(--k-hair); padding: calc(10px * var(--k-s)) 0; }
#sf-galaxymap .gm-rail-sec:last-child { border-bottom: 1px solid var(--k-hair); }
#sf-galaxymap .gm-rail-sum {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1ch;
  list-style: none;
  cursor: pointer;
  color: var(--k-bone-62);
  transition: color var(--k-d-focus) var(--k-ease);
}
#sf-galaxymap .gm-rail-sum::-webkit-details-marker { display: none; }
#sf-galaxymap .gm-rail-sum::marker { content: ""; }
#sf-galaxymap .gm-rail-sec[open] > .gm-rail-sum,
#sf-galaxymap .gm-rail-sum:hover { color: var(--k-text-live); }
#sf-galaxymap .gm-rail-sum-n { font-size: var(--k-fs-fine); letter-spacing: 0; text-transform: none; color: var(--k-bone-38); }
#sf-galaxymap .gm-rail-body { padding-top: var(--k-pad); display: flex; flex-direction: column; gap: var(--k-pad); }
#sf-galaxymap .gm-layer-buttons { display: flex; flex-direction: column; gap: var(--k-pad); }
#sf-galaxymap .gm-layer-bank { display: flex; flex-direction: column; gap: calc(8px * var(--k-s)); }
#sf-galaxymap .gm-layer-btn { display: block; width: max-content; max-width: 100%; }
#sf-galaxymap .gm-layer-btn.active { color: var(--k-text-live); }
/* No icons and no state chips: the word and its underline carry the lens state (KIT_SPEC §12). */
#sf-galaxymap .gm-layer-ico, #sf-galaxymap .gm-layer-state { display: none; }
#sf-galaxymap .gm-rail-commodity { display: flex; flex-direction: column; gap: calc(6px * var(--k-s)); }
#sf-galaxymap .gm-rail-commodity select {
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--k-hair);
  color: var(--k-text-live);
  font: inherit;
  font-size: var(--k-fs-body);
  padding: calc(4px * var(--k-s)) 0;
  cursor: pointer;
  transition: border-color var(--k-d-focus) var(--k-ease);
}
#sf-galaxymap .gm-rail-commodity select:focus { border-bottom-color: var(--k-bone); outline: none; }
#sf-galaxymap .gm-rail-commodity select option { background: var(--k-ink); color: var(--k-bone); }
#sf-galaxymap .gm-rail-item {
  appearance: none;
  width: 100%;
  text-align: left;
  font: inherit;
  background: none;
  border: 0;
  border-top: 1px solid var(--k-hair);
  --k-row-cols: minmax(0, 1fr);
  row-gap: 0;
  padding: calc(6px * var(--k-s)) var(--k-pad);
  align-content: center;
}
#sf-galaxymap .gm-rail-item-t, #sf-galaxymap .gm-rail-item-s { display: block; }
#sf-galaxymap .gm-rail-item.is-tracked,
#sf-galaxymap .gm-rail-item.is-current { color: var(--k-text-live); box-shadow: inset 2px 0 0 var(--k-signal); }
#sf-galaxymap .gm-rail-track-g { color: var(--k-signal); margin-right: 0.5ch; }
#sf-galaxymap .gm-rail-item-tag { font-size: var(--k-fs-fine); color: var(--k-signal); margin-left: 1ch; }
#sf-galaxymap .gm-rail-add { margin-top: var(--k-pad); align-self: flex-start; }
#sf-galaxymap .gm-rail-footer { font-size: var(--k-fs-fine); color: var(--k-bone-38); }
#sf-galaxymap .gm-rail-legend { display: flex; flex-direction: column; }
#sf-galaxymap .gm-rail-title { margin: calc(6px * var(--k-s)) 0; }
#sf-galaxymap .gm-legend-row {
  --k-row-cols: auto minmax(0, 1fr);
  column-gap: var(--k-pad);
  min-height: calc(var(--k-row) * 0.7);
  padding: 0;
  border: 0;
  font-size: var(--k-fs-data);
}
#sf-galaxymap .gm-rail-legend > .gm-legend-row:last-child { border: 0; }
#sf-galaxymap .gm-legend-ico { display: inline-flex; width: 16px; height: 16px; color: var(--k-bone-62); }
#sf-galaxymap .gm-legend-ico svg { width: 16px; height: 16px; display: block; stroke: var(--k-bone-62); }
#sf-galaxymap .gm-legend-ico--mark { color: var(--k-bone-62); }
#sf-galaxymap .gm-hint-text { max-width: var(--k-measure); }

/* ---- The stage-right column (.gm-right-inspector): fine words in a row, then rows ------------ */
#sf-galaxymap .gm-tabs { flex: 0 0 auto; gap: calc(12px * var(--k-s)) var(--k-gap); }
#sf-galaxymap .gm-tab[aria-selected="true"] { color: var(--k-text-live); }
#sf-galaxymap .gm-tab[aria-selected="true"]::after { transform: scaleX(1); }
#sf-galaxymap .gm-inspector-content { display: flex; flex-direction: column; gap: var(--k-pad); flex: 1 1 auto; min-height: 0; }
#sf-galaxymap .gm-frame-group { display: flex; flex-wrap: wrap; align-items: baseline; gap: calc(8px * var(--k-s)) var(--k-gap); }
#sf-galaxymap .gm-frame-reason, #sf-galaxymap .gm-plot-reason, #sf-galaxymap .gm-engage-reason, #sf-galaxymap .gm-ribbon-reason { flex-basis: 100%; max-width: var(--k-measure); }
#sf-galaxymap .gm-frame-reason:empty, #sf-galaxymap .gm-plot-reason:empty, #sf-galaxymap .gm-engage-reason:empty, #sf-galaxymap .gm-ribbon-reason:empty { display: none; }
#sf-galaxymap .gm-inspector-details { min-height: 0; }
#sf-galaxymap .gm-inspector-empty { color: var(--k-bone-62); max-width: var(--k-measure); }
#sf-galaxymap .gm-ins-section {
  border-top: 1px solid var(--k-hair);
  padding: calc(10px * var(--k-s)) 0;
  display: flex;
  flex-direction: column;
  gap: calc(6px * var(--k-s));
}
#sf-galaxymap .gm-ins-section:first-child { border-top: 0; padding-top: 0; }
#sf-galaxymap .gm-ins-kind, #sf-galaxymap .gm-ins-title {
  font-size: var(--k-fs-fine);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--k-bone-38);
}
#sf-galaxymap .gm-ins-target-name {
  font-family: var(--k-display);
  font-weight: 800;
  font-size: var(--k-fs-sub);
  letter-spacing: -0.03em;
  line-height: 0.95;
  color: var(--k-text-live);
  overflow-wrap: anywhere;
}
/* Navigation rows (POSITION / TRACKING / DESTINATION / NEXT LEG): key at body 62 %, value at emphasis,
   detail as the row's sub line. Tone is an attribute, so state never rides on colour alone. */
#sf-galaxymap .gm-nav-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: var(--k-pad);
  align-items: baseline;
  min-height: var(--k-row);
  border-top: 1px solid var(--k-hair);
  padding: calc(4px * var(--k-s)) 0;
}
#sf-galaxymap .gm-nav-row-k { font-size: var(--k-fs-body); color: var(--k-bone-62); }
#sf-galaxymap .gm-nav-row-v { font-size: var(--k-fs-emph); color: var(--k-text-live); text-align: right; }
#sf-galaxymap .gm-nav-row-d { grid-column: 1 / span 2; font-size: var(--k-fs-data); color: var(--k-bone-38); }
#sf-galaxymap .gm-nav-row[data-tone="tracked"] .gm-nav-row-v { color: var(--k-signal); }
#sf-galaxymap .gm-nav-row[data-tone="tracked"] { box-shadow: inset 2px 0 0 var(--k-signal); padding-left: var(--k-pad); }
#sf-galaxymap .gm-nav-row[data-tone="muted"] .gm-nav-row-v { color: var(--k-bone-38); font-style: italic; }
#sf-galaxymap .gm-ins-row { display: flex; justify-content: space-between; gap: var(--k-pad); color: var(--k-bone-62); }
#sf-galaxymap .gm-ins-row > span:first-child { flex: 1 1 auto; min-width: 0; }
#sf-galaxymap .gm-ins-row-val { color: var(--k-text-live); text-align: right; }
#sf-galaxymap .gm-fig { font-variant-numeric: tabular-nums; }
#sf-galaxymap .gm-ins-note { font-size: var(--k-fs-data); color: var(--k-bone-38); max-width: var(--k-measure); }
#sf-galaxymap .gm-ins-btn:not(.k-word), #sf-galaxymap .gm-place-btn, #sf-galaxymap .gm-tl-row, #sf-galaxymap .gm-site-row {
  appearance: none;
  background: none;
  border: 0;
  padding: 0 0 0.15em;
  font: 500 var(--k-fs-body) var(--k-text);
  color: var(--k-bone-62);
  text-align: left;
  cursor: pointer;
  transition: color var(--k-d-focus) var(--k-ease);
}
#sf-galaxymap .gm-ins-btn:not(.k-word):hover, #sf-galaxymap .gm-place-btn:hover, #sf-galaxymap .gm-tl-row:hover, #sf-galaxymap .gm-site-row:hover,
#sf-galaxymap .gm-site-row[aria-pressed="true"] { color: var(--k-text-live); }
#sf-galaxymap .gm-ins-btn:disabled, #sf-galaxymap .gm-ins-btn[aria-disabled="true"],
#sf-galaxymap .gm-place-btn:disabled, #sf-galaxymap .gm-place-btn[aria-disabled="true"] { color: var(--k-bone-38); cursor: default; }
#sf-galaxymap #gm-engage-route-btn[data-engage-state="nav:abortRoute"] { color: var(--k-red); }
#sf-galaxymap #gm-engage-route-btn[data-engage-state="nav:abortRoute"]::after { background: var(--k-red); }
#sf-galaxymap .gm-place-actions { display: flex; flex-wrap: wrap; gap: calc(8px * var(--k-s)) var(--k-gap); }
#sf-galaxymap .gm-meter, #sf-galaxymap .gm-mission-meter { position: relative; height: 2px; width: 100%; background: var(--k-hair); overflow: hidden; }
#sf-galaxymap .gm-meter > i, #sf-galaxymap .gm-mission-meter-fill { display: block; height: 100%; background: var(--k-bone-62); }
#sf-galaxymap .gm-mission-name { color: var(--k-text-live); }
#sf-galaxymap .gm-mission-brief { font-size: var(--k-fs-data); color: var(--k-bone-38); }
#sf-galaxymap .gm-svc-list, #sf-galaxymap .gm-svc-row { display: flex; flex-wrap: wrap; gap: calc(6px * var(--k-s)) var(--k-pad); }
#sf-galaxymap .gm-svc, #sf-galaxymap .gm-svc-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.5ch;
  font-size: var(--k-fs-fine);
  font-weight: 400;
  color: var(--k-bone-62);
  cursor: default;
  padding: 0;
}
#sf-galaxymap .gm-svc-chip::after { display: none; }
#sf-galaxymap .gm-svc-ico { display: inline-flex; width: 16px; height: 16px; color: var(--k-bone-62); }
#sf-galaxymap .gm-svc-ico svg { width: 16px; height: 16px; display: block; stroke: var(--k-bone-62); }
#sf-galaxymap .gm-tl-row, #sf-galaxymap .gm-site-row { display: block; width: 100%; border-top: 1px solid var(--k-hair); padding: calc(6px * var(--k-s)) 0; }
#sf-galaxymap .gm-tl-head { display: flex; justify-content: space-between; gap: var(--k-pad); color: var(--k-text-live); }
#sf-galaxymap .gm-tl-profit { color: var(--k-text-live); font-weight: 500; }
#sf-galaxymap .gm-tl-sub { font-size: var(--k-fs-data); color: var(--k-bone-38); font-weight: 400; }
#sf-galaxymap .gm-bk-row { display: flex; justify-content: space-between; gap: var(--k-pad); border-top: 1px solid var(--k-hair); padding: calc(4px * var(--k-s)) 0; color: var(--k-bone-62); }
#sf-galaxymap .gm-bk-station { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#sf-galaxymap .gm-bk-val { color: var(--k-text-live); }
#sf-galaxymap .gm-history-list { margin: 0; padding: 0; list-style: none; color: var(--k-bone-62); }
#sf-galaxymap .gm-history-list li { padding: calc(4px * var(--k-s)) 0; border-top: 1px solid var(--k-hair); }
#sf-galaxymap .gm-history-list li > span { display: block; }
#sf-galaxymap .gm-transit { display: flex; flex-direction: column; gap: calc(6px * var(--k-s)); }
#sf-galaxymap .gm-transit-card { border-top: 1px solid var(--k-hair); padding-top: calc(6px * var(--k-s)); }
#sf-galaxymap .gm-transit-head, #sf-galaxymap .gm-transit-row { display: flex; justify-content: space-between; gap: var(--k-pad); color: var(--k-bone-62); }
#sf-galaxymap .gm-transit-head { color: var(--k-text-live); }
#sf-galaxymap .gm-transit-row b { font-weight: 400; }
#sf-galaxymap .gm-route-leg { display: flex; align-items: baseline; gap: 0.5ch; flex-wrap: wrap; color: var(--k-bone-62); }
#sf-galaxymap .gm-route-leg.is-current { color: var(--k-text-live); }
#sf-galaxymap .gm-route-leg-n { font-size: var(--k-fs-fine); color: var(--k-bone-38); min-width: 2ch; }
#sf-galaxymap .gm-route-leg.is-current .gm-route-leg-n { color: var(--k-signal); }
#sf-galaxymap .gm-route-total { color: var(--k-text-live); padding-top: calc(4px * var(--k-s)); }
#sf-galaxymap .gm-career { border-top: 1px solid var(--k-hair); padding: calc(6px * var(--k-s)) 0; display: flex; flex-direction: column; gap: calc(2px * var(--k-s)); }
#sf-galaxymap .gm-career__head { display: flex; justify-content: space-between; gap: var(--k-pad); }
#sf-galaxymap .gm-career__role { color: var(--k-text-live); }
#sf-galaxymap .gm-career__fig, #sf-galaxymap .gm-career__phase { font-size: var(--k-fs-fine); color: var(--k-bone-38); }
#sf-galaxymap .gm-career__place, #sf-galaxymap .gm-career__who { font-size: var(--k-fs-data); color: var(--k-bone-38); }

/* ---- The foot (.gm-apron): the route as one sentence, the cargo deck as six rows ------------- */
#sf-galaxymap .gm-apron {
  grid-area: foot;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  column-gap: var(--k-gap);
  align-items: end;
  min-height: 0;
  max-height: var(--gm-apron-h);
  pointer-events: none;
}
#sf-galaxymap .gm-apron > * { pointer-events: auto; min-width: 0; min-height: 0; }
#sf-galaxymap .gm-ribbon { display: flex; flex-direction: column; gap: calc(6px * var(--k-s)); }
#sf-galaxymap .gm-ribbon-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 1ch; }
#sf-galaxymap .gm-ribbon-arrival:not(:empty)::before { content: "· "; color: var(--k-bone-38); }
#sf-galaxymap .gm-ribbon-status[data-ribbon-state="live"] { color: var(--k-signal); }
#sf-galaxymap .gm-ribbon-status[data-ribbon-state="plotted"] { color: var(--k-text-live); }
#sf-galaxymap .gm-ribbon-status[data-ribbon-state="interrupted"] { color: var(--k-red); }
#sf-galaxymap .gm-ribbon-legs { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 1ch; }
#sf-galaxymap .gm-ribbon-leg { display: inline-flex; align-items: baseline; gap: 0.5ch; padding: 0; cursor: default; white-space: normal; color: var(--k-bone-62); }
#sf-galaxymap .gm-ribbon-leg::after { display: none; }
#sf-galaxymap .gm-ribbon-leg:hover { color: var(--k-bone-62); }
#sf-galaxymap .gm-ribbon-leg + .gm-ribbon-leg::before { content: "·"; color: var(--k-bone-38); }
#sf-galaxymap .gm-ribbon-leg[data-leg-state="done"], #sf-galaxymap .gm-ribbon-leg[data-leg-state="done"]:hover { color: var(--k-bone-38); }
#sf-galaxymap .gm-ribbon-leg[data-leg-state="active"], #sf-galaxymap .gm-ribbon-leg[data-leg-state="active"]:hover { color: var(--k-text-live); }
#sf-galaxymap .gm-ribbon-leg-g { color: var(--k-bone-38); }
#sf-galaxymap .gm-ribbon-leg[data-leg-state="active"] .gm-ribbon-leg-g { color: var(--k-signal); }
#sf-galaxymap .gm-ribbon-leg-c { color: var(--k-bone-38); }
#sf-galaxymap .gm-ribbon-haz[data-haz="watched"] { color: var(--k-signal); }
#sf-galaxymap .gm-ribbon-haz[data-haz="contested"] { color: var(--k-red); }
#sf-galaxymap .gm-ribbon-warn { color: var(--k-red); }
#sf-galaxymap .gm-ribbon-actions { gap: calc(8px * var(--k-s)) var(--k-gap); }
#sf-galaxymap .gm-deck { display: flex; flex-direction: column; gap: calc(6px * var(--k-s)); }
#sf-galaxymap .gm-deck-head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--k-gap); }
#sf-galaxymap .gm-deck-table {
  display: block;
  max-height: calc(var(--k-row) * 6 + 2px);
  overflow: hidden auto;
  scrollbar-width: thin;
  scrollbar-color: var(--k-hair) transparent;
}
#sf-galaxymap .gm-deck-row {
  appearance: none;
  width: 100%;
  text-align: left;
  font: inherit;
  font-size: var(--k-fs-data);
  background: none;
  border: 0;
  border-top: 1px solid var(--k-hair);
  --k-row-cols: minmax(0, 1.1fr) minmax(0, 1.3fr) minmax(0, 2fr) auto;
  column-gap: var(--k-pad);
  min-height: var(--k-row);
}
#sf-galaxymap .gm-deck-table > .gm-deck-row:last-child { border-bottom: 1px solid var(--k-hair); }
#sf-galaxymap .gm-deck-row > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#sf-galaxymap .gm-deck-commodity { color: var(--k-text-live); }
#sf-galaxymap .gm-deck-lane, #sf-galaxymap .gm-deck-metric { color: var(--k-bone-62); }
#sf-galaxymap .gm-deck-risk { text-align: right; }
#sf-galaxymap .gm-deck-risk[data-risk="calm"] { color: var(--k-good); }
#sf-galaxymap .gm-deck-risk[data-risk="watched"] { color: var(--k-signal); }
#sf-galaxymap .gm-deck-risk[data-risk="hot"] { color: var(--k-red); }
#sf-galaxymap .gm-deck-empty { display: flex; flex-direction: column; gap: calc(4px * var(--k-s)); max-width: var(--k-measure); }
#sf-galaxymap .gm-deck-empty-title { color: var(--k-bone-62); }
#sf-galaxymap .gm-deck-empty-body { font-size: var(--k-fs-data); color: var(--k-bone-38); }

/* ---- Compact (760–1180): the hang becomes a band above the sky; the inspector keeps its column - */
#sf-galaxymap[data-layout="compact"] .gm-body-container {
  grid-template-columns: minmax(0, 1fr) var(--gm-inspector-w);
  grid-template-rows: auto minmax(0, 1fr);
  grid-template-areas: "hang inspector" "stage inspector";
}
#sf-galaxymap[data-layout="compact"] .gm-left-rail { display: flex; flex-wrap: wrap; align-items: flex-start; gap: calc(8px * var(--k-s)) var(--k-gap); max-height: 40%; }
#sf-galaxymap[data-layout="compact"] .gm-rail-sec { border: 0; padding: 0; }
#sf-galaxymap[data-layout="compact"] .gm-rail-sec:last-child { border: 0; }
#sf-galaxymap[data-layout="compact"] .gm-layer-buttons, #sf-galaxymap[data-layout="compact"] .gm-layer-bank { flex-direction: row; flex-wrap: wrap; align-items: baseline; }
#sf-galaxymap[data-layout="compact"] .gm-rail-legend, #sf-galaxymap[data-layout="compact"] .gm-hint-text, #sf-galaxymap[data-layout="compact"] .gm-rail-footer { display: none; }
#sf-galaxymap[data-layout="compact"] .gm-weather-terms { display: none; }
#sf-galaxymap[data-layout="compact"] .gm-title { font-size: var(--k-fs-sub); }
#sf-galaxymap[data-layout="compact"] .gm-deck-row { --k-row-cols: minmax(0, 1fr) auto; }
#sf-galaxymap[data-layout="compact"] .gm-deck-lane, #sf-galaxymap[data-layout="compact"] .gm-deck-metric { display: none; }

/* ---- Narrow (< 760): everything stacks; the sky stays under it all --------------------------- */
#sf-galaxymap[data-layout="narrow"] { row-gap: var(--k-pad); }
#sf-galaxymap[data-layout="narrow"] .gm-head { grid-template-columns: minmax(0, 1fr) auto auto; }
#sf-galaxymap[data-layout="narrow"] .gm-title { font-size: var(--k-fs-emph); }
#sf-galaxymap[data-layout="narrow"] .gm-stamp, #sf-galaxymap[data-layout="narrow"] .gm-weather-terms, #sf-galaxymap[data-layout="narrow"] .gm-rail-track, #sf-galaxymap[data-layout="narrow"] .gm-level { display: none; }
#sf-galaxymap[data-layout="narrow"] .gm-search-container { grid-column: 1 / span 3; grid-row: 2; justify-self: stretch; width: auto; }
#sf-galaxymap[data-layout="narrow"] .gm-weather { grid-column: 1 / span 3; grid-row: 3; justify-self: start; text-align: left; }
#sf-galaxymap[data-layout="narrow"] .gm-body-container {
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr) auto;
  grid-template-areas: "hang" "stage" "inspector";
  row-gap: var(--k-pad);
}
#sf-galaxymap[data-layout="narrow"] .gm-left-rail { display: flex; flex-wrap: wrap; gap: calc(6px * var(--k-s)) var(--k-gap); max-height: 22%; }
#sf-galaxymap[data-layout="narrow"] .gm-rail-sec, #sf-galaxymap[data-layout="narrow"] .gm-rail-sec:last-child { border: 0; padding: 0; }
#sf-galaxymap[data-layout="narrow"] .gm-layer-buttons, #sf-galaxymap[data-layout="narrow"] .gm-layer-bank { flex-direction: row; flex-wrap: wrap; align-items: baseline; }
#sf-galaxymap[data-layout="narrow"] .gm-rail-legend, #sf-galaxymap[data-layout="narrow"] .gm-hint-text, #sf-galaxymap[data-layout="narrow"] .gm-rail-footer { display: none; }
#sf-galaxymap[data-layout="narrow"] .gm-right-inspector { max-height: 30%; }
#sf-galaxymap[data-layout="narrow"] .gm-apron { grid-template-columns: minmax(0, 1fr); max-height: 24%; }
#sf-galaxymap[data-layout="narrow"] .gm-deck { display: none; }

/* ---- Motion and contrast --------------------------------------------------------------------- */
@media (prefers-reduced-motion: reduce) {
  #sf-galaxymap *, #sf-galaxymap *::before, #sf-galaxymap *::after { transition: none !important; animation: none !important; }
  #sf-galaxymap .gm-ribbon { animation: none; }
  #sf-galaxymap .gm-rail-marker { transition: none; }
}
@media (forced-colors: active) {
  #sf-galaxymap .gm-ribbon, #sf-galaxymap .gm-ribbon-leg, #sf-galaxymap .gm-deck-row, #sf-galaxymap .gm-rail-item,
  #sf-galaxymap .gm-search-item, #sf-galaxymap .gm-ins-section, #sf-galaxymap .gm-rail-sec, #sf-galaxymap .gm-tl-row,
  #sf-galaxymap .gm-site-row, #sf-galaxymap .gm-bk-row, #sf-galaxymap .gm-career, #sf-galaxymap .gm-transit-card { border-color: CanvasText; }
  #sf-galaxymap .gm-ribbon-status, #sf-galaxymap .gm-title, #sf-galaxymap .gm-ins-row-val, #sf-galaxymap .gm-deck-commodity { color: CanvasText; }
  #sf-galaxymap .gm-tab[aria-selected="true"], #sf-galaxymap .gm-layer-btn[aria-pressed="true"], #sf-galaxymap .gm-scale-btn[aria-pressed="true"],
  #sf-galaxymap .gm-rail-item.is-tracked, #sf-galaxymap .gm-rail-item.is-current, #sf-galaxymap .gm-search-item.selected { text-decoration: underline; text-decoration-thickness: 2px; }
  #sf-galaxymap .gm-legend-ico svg, #sf-galaxymap .gm-svc-ico svg { stroke: CanvasText; }
  #sf-galaxymap .gm-meter, #sf-galaxymap .gm-mission-meter, #sf-galaxymap .gm-weather-bar, #sf-galaxymap .gm-rail-track { background: GrayText; }
  #sf-galaxymap .gm-meter > i, #sf-galaxymap .gm-mission-meter-fill, #sf-galaxymap .gm-weather-seg, #sf-galaxymap .gm-rail-marker { background: Highlight; }
  /* Disabled must survive the palette flattening, so keep it a SHAPE — a dashed rule, not a hue. */
  #sf-galaxymap .gm-ins-btn:disabled, #sf-galaxymap .gm-ins-btn[aria-disabled="true"],
  #sf-galaxymap .gm-place-btn:disabled, #sf-galaxymap .gm-place-btn[aria-disabled="true"],
  #sf-galaxymap .gm-ribbon-btn[aria-disabled="true"],
  #sf-galaxymap .gm-ribbon-btn:disabled { border: 1px dashed GrayText; border-style: dashed; color: GrayText; }
}
`;
