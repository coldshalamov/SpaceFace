# SPEC2/06 — UI IDENTITY (HUD completion, overview strip, target panel, maps polish)

**Owner lane:** frontend agent responsible for behavior, readability, accessibility, and measured performance. Functional acceptance values remain targets; the visual numbers below document the 2026-07-04 reference implementation rather than mandatory tokens or ceilings.
Read `spec2/00_MASTER_TASTE.md` for historical context only. No visor motifs remains a product preference; palette, panel, radius, glow, blur, and surface tokens are not law. Choose the visual language per screen and prove it with player-facing screenshots.
**Files:** `src/ui/{hud,radar,targetPanel}.js`, `src/ui/uiRoot.js` (injectHudCss), `styles/ui.css`,
`src/ui/screens/{localmap,starmap}.js` (polish only), new `scripts/check-ui-identity.mjs`.
Verify with `check:ui-a11y`, `check:wcag-contrast`, `check:ui:perf` after every step.

## 1. Reference HUD hierarchy (finish what's started)
The three-anchor layout is the proven starting hierarchy, not the only valid composition. Preserve
one-voice priority and at-a-glance readability; a coherent departure is allowed when current
screenshots and checks prove it. Reference anchors: (a) bottom-left ship cluster (schematic + micro-bars
— exists), (b) bottom-center status line (SPD, WPN, TETHER — exists) + chips (exist), (c) bottom-
right radar + NEW overview strip. Top-center is the one-voice channel ONLY (alerts/priority text).
Remove/relocate any straggler panels into contextual surfaces (fuel top-left moves into the
schematic cluster as a fourth micro-bar; 'SYS NOMINAL' top-center text dies — silence means nominal).

## 2. Overview strip (EVE's one great idea, miniaturized) — right edge, above radar
- Collapsible list (default open; `O` toggles; state persists in settings.ui.overviewOpen).
- Row = `[IFF chip][class glyph] NAME  dist  ▸closing/▹opening` — mono 11 px, row height 20 px,
  max 8 rows + "+N" footer. Width 188 px. No panel border: 1 px left rule in IFF color per row.
- Sort: hostiles first (by distance), then neutrals, then friendlies. Sensor ghosts (spec2/04)
  render hollow glyphs. Click row = target (existing targeting intent). Hover = 1.5× rule width.
- IFF colors/shapes from `src/ui/accessibility.js` SEMANTIC_PALETTE (colorblind-safe, shipped).
- Updates at 5 Hz (not per-frame); memoize strings (perf rule).

## 3. Target panel v2 (`targetPanel.js`) — the damage triangle made legible
Selected target card (bottom-right, above overview): name/class line, three segmented bars
(shield cyan / armor slate `#8fa3bd` / hull red-amber) each 72×5 px with 4-px segment gaps,
distance + closing speed, and gimmick tag for named bounties ("MASSLINE CUTTER"). In-world mirror:
three thin arcs (shield outer → hull inner, radius target.radius+6/+9/+12, arc = fraction × 300°,
0.55 opacity) — the arcs ARE the bars; a player never needs the card to fight.

## 4. Radar honesty pass (`radar.js`)
Station/gate/wreck glyphs replace anonymous dots (square/ring/cross, 5 px, from SEMANTIC_PALETTE
shape set); objective diamond gets a 1-px white outline; scan pings render as pulsing hollow '?'
for their TTL; bezel edge-arrows for off-screen objective + nearest hostile (max 2 arrows).

## 5. Map polish (screens exist — composition only)
- Local map: legend footer (one line, glyph key); mouse-wheel zoom eases 150 ms; hostile contacts
  get motion vector ticks (velocity/3, max 24 px).
- Nav chart: sector cards show palette-class swatch stripe + security tier pips; price-memory
  overlay per spec2/05; route line animates a 3-px marching dash (state change = allowed motion).

## 6. Dialog & screen chrome coherence (`ui.css` reference values)
All modals: 1 px `--panel-edge` border, `--r-lg` radius, `rgba(8,13,24,.92)` ground, drop the inset
cyan glow on non-interactive containers. Screen open/close: 150 ms translate-y 6 px + fade. Focus
ring: 2 px `#39d0ff` outline offset 1 px (a11y). Buttons: existing style; destructive actions get
`#ff5c5c` text, never red fills.

## 7. Acceptance assertions (`scripts/check-ui-identity.mjs`)
1. DOM audit in flight mode: no overlapping, orphaned, or unprioritized fixed-position surfaces;
   hierarchy remains legible at supported viewport sizes (walk `#hud`/`#ui-root` children).
2. Overview: 9+ contacts renders 8 rows + "+N"; click targets; update cadence ≤ 5 Hz (spy on
   mutation counts); IFF roles remain accessible and coherent with `SEMANTIC_PALETTE`, whose values
   may evolve alongside accessibility checks.
3. Target arcs: fractions match entity hp fields ± 1%; arcs vanish 250 ms after target death.
4. `check:wcag-contrast` green including new elements; `check:ui:perf` green (no frame-sleep
   regressions); `check:ui-a11y` green.
5. Five-second test screenshots (.devshots/spec2/ui-*) attached: flight-idle, combat, mining,
   overview-full. A reviewer agent must be able to name every element from the shots alone.
