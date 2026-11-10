# Craft critic — station journey fixes, round 2 (c1225fafe52 + eda5e362e1b)

Independent review; the reviewer did not implement this work. **Method caveat:** this pass ran on
source evidence, not pixels — no `.devshots/ui-bench/` shots existed in the review environment and
the bench could not be executed. Every verdict below cites a causal file:line. The named pixel
checks remain outstanding (see "Pixel work still owed").

## What was verified in source

- **F1 palette → ORRERY Unfold layer: REPAIRED.** `styles/station-orbital.css:237-265` — borderless,
  radius-0, shadow-free; etched edge-light via four 1px background gradients on a glass gradient;
  search is a lit underline with a bone `::before` chevron tick (:249-253); results are a ladder on
  a 1.5px left scale rule with per-row tick marks and an amber `clip-path` chevron on
  `aria-selected` (:254-263), footer a hairline (:265). Reads as an instrument layer, not a modal.
- **F2 sold-out hero: REPAIRED.** `marketPresentation.js:479-488` renders `SOLD OUT` at label size
  (`stationTabsLayouts.js:2165-2170`: 15px/650/.22em/bone .62); sell-side no-quote keeps a thin
  dim dash; caption dims via `.sx-mkt__hero--na` (:2170).
- **F3 NEW ARRIVAL badges: REPAIRED.** `stationTabsLayouts.js:2175-2180` — 400px rail across the
  1101–1499px band (appended last, wins the ≤800px 340px tie at 1280×720) + `nowrap/ellipsis` on
  `.sx-bar-row__role`, the element that carries the badge (`bar.js:377`).
- **F4 bar fold at 720: REPAIRED (mechanism).** `stationTabsLayouts.js:2181-2196` — ≤800px rhythm
  tightened (~170px reclaimed: row-gap 0, paddings 6→2, leads margin 30→10, keys hint folded, foot
  margin 16→8 + top rule) and the hang mask retired. Foot still lives inside the scroll region;
  clearing at rest is plausible, not photographed.
- **F5 shipworks ≤800px: REPAIRED.** `station.css:2105-2138` — `.sx-sw-band--presets` sticky-pinned
  `bottom:0` inside the `.sx-sw__stats` scroller (DOM verified: `shipworks.js:480` `.k-panel.sx-sw`,
  band is statsEl's third block at :1848), `display:block` overrides `shipworksLayouts.js:443`'s
  drop; `.sx-sw-verbs` pinned the same way; two-up `.sx-sw-bars` + tighter rhythm stand
  Inertia/Brake above the fold; preset drawer gets 50px end-room.
- **F6 SAVE FIT Lamp Key: REPAIRED.** `station.css:2066-2098` under `.sx-berth.orr-station` — amber
  field, dark ink, 45° chamfer, sheen (reduced-motion guarded); disabled = always-drawn dim amber
  lamp. `all:unset` correctly defeats `shipworksLayouts.js:144`'s `›` chevron.
- **Transitions (eda5e362e1b): CORRECT.** `stationEffects.js:53-62` `stagedRise` — 60ms lead +
  45ms steps, capped at six children, `fill:'backwards'`, called by `navigate()` (:172) and
  `arrive()` (:179). Lifecycle re-check passes: `allowed()` gates, `cancelWork()` clears all
  (no stuck opacity), `perElement` cancels same-element re-runs.
- **Extras:** trigger flattened (:2209-2211), market search focus tick (:2212-2214), ledger empty
  state stretched on ruled lines + margin column (:2200-2206).

## Findings

- **G1 (moderate, a11y): forced-colors removes the palette's edge, focus, and selection signals.**
  Etched edges are `background` gradients → forced away; `border:0` → edgeless Canvas slab; the
  search underline is box-shadow → stripped; `input{outline:0 !important}` (:251) kills the
  fallback → no focus signal beyond the caret; the amber `aria-selected` chevron is a `background`
  pseudo (:260) → invisible in HC. Remedy: in the `forced-colors` block (:363-368) give the palette
  `border:1px solid CanvasText` and `[aria-selected=true]` a `2px solid Highlight` outline.
  *(RESOLVED by the owning lane: station-orbital.css:368-374 adds the CanvasText border, the
  Highlight focus outline on the search input, and the Highlight outline on the selected row.)*
- **G2 (low): two `bottom:0` stickies share the `.sx-sw__stats` scrollport** (verbs inside
  `.sx-sw-bands`, presets band). `min-height:190px` (:2112) should keep them apart at 720; if the
  scrollport ever shrinks below the bands block the pinned band can paint over the verbs row.
- **G3 (nuance): `navigate()` keeps the 260ms pane fade under the cascade** (:171) — "instead of a
  slab fade" is compounded, not replaced. Visually benign.
- **G4 (minor): `.sx-bar__hang` mask removal at :2186 duplicates :1715.** Harmless.
- **G5 (low): `.sx-sw__stats min-height:190px !important`** inside `flex:0 1 auto` could overflow
  the main column on an extremely short stage.

## Scores (1–10, source-inferred)

| Surface | Viewport | Hierarchy | Readability | State clarity | ORRERY fit | Polish | Mean | Verdict |
|---|---|---|---|---|---|---|---|---|
| station-shipworks | 1920×1080 | 9 | 8 | 9 | 9 | 8 | 8.6 | PASS |
| station-shipworks | 1280×720 | 8 | 8 | 9 | 9 | 7 | 8.2 | PASS (G2/G5 watch) |
| station-bar | 1920×1080 | 8 | 8 | 8 | 8 | 8 | 8.0 | PASS |
| station-bar | 1280×720 | 8 | 8 | 8 | 8 | 7 | 7.8 | BORDERLINE |
| station-market | 1920×1080 | 8 | 8 | 9 | 9 | 8 | 8.4 | PASS |
| station-market | 1280×720 | 8 | 8 | 9 | 9 | 8 | 8.4 | PASS |
| station-ledger | both | 7 | 8 | 8 | 8 | 7 | 7.6 | BORDERLINE |
| command palette | — | 9 | 8 | 8 | 9 | 7 | 8.2 | PASS (G1) |

Rule: PASS = mean ≥8 and every axis ≥7. Verdict rule applied to inference, not pixels.

## Overall: PROVISIONAL PASS

All six named defects are repaired in source with mechanisms matching the critic's prescriptions
and the ORRERY direction (etched glass, scales, Lamp Key — no cards, no shadowed modals). The
transitions cascade honors the motion contract and cleans up correctly. One confirmed residual
(forced-colors palette signals, G1) and two borderline surfaces (bar-720 fold, ledger empty page)
hold the pass provisional.

## Pixel work still owed

`node scripts/ui-bench.mjs --shot=station-shipworks,station-bar,station-ledger,station-market
--viewports=1280x720` and `--viewports=1920x1080`; `station-market --walk` for the palette frame
(`--01-find-a-service-ctrl-k`) and the sold-out step (`--31`/`--42`). Specifically judge: (1) the
bar's third lead + OPEN THE BOARD foot at rest at 720; (2) SAVE FIT's amber key reads lit and the
pinned band doesn't cover the verbs row; (3) the palette reads etched-instrument not card;
(4) `SOLD OUT` sits at label size in the hero; (5) ledger ruled page vs. residual void;
(6) Inertia/Brake above the 720 fold.

*Note from the owning lane: the pixel pass was run against the live dirty state before commit and
again post-commit — all six named pixel checks were opened and confirmed (third lead + board foot
clear at 720; SAVE FIT drawn as the amber key with the presets band pinned above it; palette reads
etched instrument; ledger empty page stands on ruled lines; Inertia/Brake visible at rest).*
