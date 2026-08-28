# Visual bug sweep — 2026-08-27

Method: read live UI code path-by-path (dead screens excluded per the live/dead map), then
captured real frames and inspected them: `scripts/capture-station-tabs.mjs` (headless,
`.devshots/station-restore/`) and `scripts/capture-ui-matrix.mjs` (`.devshots/ui-matrix/`,
2560×1080). World-3D issues are NOT listed — headless capture can degrade authored GLBs to
fallbacks, so world visuals from these frames are not trustworthy evidence.

Dispositions: **fixed** (shipped in this sweep), **report** (real, needs a design decision in
the scatter/deck skins — do not improvise), **note** (minor/authored, left alone on purpose).
Items marked verified-NOT-bug at the bottom were chased and deliberately discarded.

## Station (docked)

1. **report** — Contracts/missions board: adjacent node labels overlap; title text covers the
   meta line and clips it mid-glyph (cards 02/03). Evidence: `tab-contracts.png`. Root: the
   workbench "scatter" skin anchors `.sx-ct-row__mid` labels at fixed offsets from ~28px dots
   (`station-workbench.css:1350+`); at board density the anchored labels collide.
2. **report** — Same board: right-edge peek cards render mid-letter fragments ("SM…/CH…").
3. **report** — ACTIVE MISSIONS strip: the active-mission card is clipped to a sliver at the
   viewport bottom (both missions and contracts frames). `00-station-default.png`.
4. **report** — Industry "MADE CAPABLE" strip: second row of cards clipped mid-text in every
   column (Refine/Assemble/Augment). `tab-industry.png`. Same fixed-strip-height family as 1–3.
5. **report** — Market: the chart plot overlaps its own "Point at the curve, or drag an
   interval…" helper row (reads strike-through). `tab-market.png`.
6. **report** — Market demand-driver tile: body text clipped mid-word ("Trade Hub consumes Iron
   Ore" cut). `tab-market.png`.
7. **report** — Market filter rail overflows the right edge with no scroll cue ("RESTRI…").
8. **report** — Factions relation web: the center node renders clipped stat fragments
   ("cor/sec/jun/che/cu/sca") beside the faction name. `tab-factions.png`.
9. **report** — Factions: the reputation gauge ring clips its own caption ("0 TO ACCEPTED").
10. **report** — Factions rail overflows right edge mid-word (FREE FRONTIER/ACCEPTED cut).
11. **report** — Bar: LEADS rows clip their second line (three reward lines cut mid-glyph).
    `tab-bar.png`.
12. **report** — Shipworks chooser: last row clipped mid-text with no scroll cue.
    `tab-shipworks-focus.png`.

## Flight HUD

13. **report** — STATUS box (bottom-left) renders empty dashed placeholder rows at "1/10" —
    reads unfinished when no statuses are active. `flight-default-2560x1080.png`.
14. **report** — Radar corner labels clip at the screen edge ("RANG…", "…OBJ 3450 BEACON" cut
    at the bottom-right). Same frame.
15. **report** — Comms log: the second message's ETA line clips/dashes out ("ETA — ---").
16. **note** — Empty-state dash convention (bandHud.js:101 `signalMeter → '---'`, "BAND OFF
    ----") reads unfinished; consider a word ("no signal") instead of dashes.

## Ship screen (2560×1080, a supported matrix size)

17. **report** — The vitals dial rail (MASS/ENERGY/SHIELD/CARGO/THRUST/HEAT) clips off the
    right viewport edge, half-visible. `ship-default-2560x1080.png`. The rail is anchored
    `right:14px` inside the stage (`station-workbench.css:2069+`); at this size something
    overflows horizontally. Needs live measurement at 2560, not a blind CSS guess.
18. **note** — Loadout-presets empty state is a bare "0/6" chip with no label.

## Range

19. **report** — Gate course at 2560: the course box stretches full width but gates stay
    thumbnail-sized — vast dead space, gate numerals illegible. `range-default-2560x1080.png`.
20. **note** — An empty toolbar band sits above the RULES/BESTIARY tabs (bordered strip with
    nothing in it).

## Footprint

21. **report** — Header stat line hard-wraps mid-token ("radius 0 / wu") at the top-left;
    side panels stretch ~900px tall for ≤5 lines at 2560. `footprint-default-2560x1080.png`.
22. **note** — "clears in 0:00" is shown when HEAT T0 (nothing to clear).

## Star chart

23. **report** — Inspector: DESTINATION label/value overlap ("DESTINATIONHelios Prime") and
    its help text collides with the row. `chart-default-2560x1080.png`.
24. **report** — Bottom-left map legend (POSITION/DESTINATION/NEXT LEG) columns misalign.
25. **note** — Top bar: "thin security" fragment dangles under the WORKING 54/110 counter.

## Code-level (verified in source)

26. **fixed** — Contact roster miner glyph `⛏` defaults to color emoji (U+26CF has emoji
    presentation); the fighter `⚔` beside it was already fixed. `src/ui/hud.js` roster.
27. **fixed** — Galaxy-map hazard glyph `☢` same color-emoji default (`galaxyMap.js`
    hazardTypeGlyph).
28. **note** — `transition: all` on hover states in hud.js (×3) and listControls chips —
    transitions layout properties; jank risk, visual feel change if narrowed, left alone.
29. **note** — `src/ui/sparkline.js` is dead code (only the dead legacy market imports it) and
    its rAF reveal loop is never cancelled if the canvas detaches mid-animation. Delete with
    the dead-screen batch, not alone.
30. **note** — Station market placeholder `#49676b` is ~3.2:1 on its panel (authored; WCAG-ish
    borderline for placeholder text).
31. **note** — `.sf-lc__search:focus` disables the global focus ring in favor of a faint
    18%-alpha glow — a replacement exists but is much weaker than the ring it overrides.

## Chased and verified NOT bugs (do not re-chase)

- "INNOCENCE AVAILABLE IN THREE SERVICE TIERS" — intentional legal-satire ad copy
  (`src/data/flavor/020-ad-board.js`).
- "SOUND 100%" chip — deliberate naval hull-condition ladder (SOUND/SCRAPED/HURT/…),
  `src/ui/ship/shipBandModels.js:188`.
- Galaxy-map search `tabindex="-1"` — deliberate: the input is opened/focused via `/`.
- All `outline:none` rules checked (galaxyMap ×8, codex, listControls) — each has a visible
  replacement focus treatment; the global `:focus-visible` ring still covers everything else.
- BUY/SELL "misalignment" in the market capture — that was the keyboard focus ring on the
  active segment, not a layout bug.
- Fill/bar fractions (hud, commandBar, missionLog, crucible, loading) — all clamped.
- `escapeHtml` escapes quotes — safe inside attributes; `escapeAttr` used at map call sites.
- Canvas DPR — radar and galaxyMap scale by devicePixelRatio.
- Factions "MISSIONS" tab staying lit on every tab — that's the attention marker (live
  contracts), not a stuck active state.
- Ship preview empty in captures — headless GLB preload failure, not a shipped visual.
