<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-185
leafId: PQ-185.00
acceptance: focused_green
disposition: PASS
-->

# PQ-185.00 — design-law checklist as a check

```yaml
packet: PQ-185
leafId: PQ-185.00
lifecycleClaim: done
acceptanceClaim: focused_green
disposition: PASS
date: 2026-09-23
gate: npm run check:asteroid-works-render (node --test test/asteroid-works-render.test.mjs)
gateResult: PASS — 18/18 (was 7/7 before the law section)
newHeadedEvidenceSpent: false
```

**The law is now a check.** `test/asteroid-works-render.test.mjs` carries a §11 section that
asserts the Asteroid Works design law against the live surface — `styles/asteroid-ops.css` and
every file in `src/ui/asteroid/` — rather than the retired `src/ui/screens/drill.js` overlay the
packet's write set still names. The check went **red on the current build** on first run, exactly
as the done-when required, and the two real violations it caught were fixed in the same unit.

## What the check asserts (source-measurable half of the law)

| Law | Assertion |
|---|---|
| §3.2 palette | All 11 `--aw-*` tokens defined at the law's exact hexes |
| §3.2/§11.5 ban | None of the five banned blue-gray hexes, no `var(--ao-*)` anywhere on the surface |
| §3.3 faces | `--aw-font` Instrument Sans, `--aw-mono` Spline Sans Mono, `--aw-name-font` Bricolage; all three vendored in `styles/fonts.css`; no Saira; `var(--aw-name-font)` consumed only by `.aw-crest-name` at 600/20px |
| §3.3/§11.4 type | `.ast-screen *` still pins `text-transform:none`; zero uppercase transforms (CSS or JS); every `letter-spacing` resolves ≤ .02em through the `--fh-*` token table; every glyph ≥ 12px including `var()` and `font:` shorthand sizes across all media steps |
| §3.4 shape | `.aw-build-key` is 46×46 r8; every `border-radius` is ≤10px, pill, or 0 |
| §5/§3.5 floater | `+N Fe` floater: Spline Sans Mono via `.ast3d-overlay`, 13px, `#ffb648`, `FLOATER_RISE_PX 24`, `FLOATER_LIFE_S 0.7` |
| §2.3/§11.6 fog | No `THREE.Fog`/`FogExp2`/`scene.fog=` construct; the live `canvas.__ast3d` hook still publishes `cellAppearance` with `material`/`anonymous`/`revealed` |
| §11.8 events | `asteroidScreen` subscribes `drill:yield` + `drill:gasHit`; the renderer publishes `events()`/`kickPx()`/`vignette()`/`fx()` |
| §11 coverage | `check-asteroid-theater.mjs` still asserts the glass-side invariants (boardPct, word budget, projectCell, cellAppearance, kickPx); the theater/cadence/sound scripts still exist in package.json |

## Violations the new check caught, fixed in this unit

- **Tracking over the cap.** Nine selectors carried `letter-spacing: var(--fh-track-legend)`,
  which resolves to 0.06em — the law caps tracking at .02em. All swapped to
  `var(--fh-track-display)` (0.02em, the compliant kit token; no hand-mixed value added).
- **Bricolage outside the crest.** `.ast-summary-box .title` ("Extraction report") consumed
  `--aw-name-font`; §3.3 gives Bricolage exactly one job — the asteroid's name. The modal title
  now uses `--aw-font` at the same 600/20px.
- **Deckplate bridge painted the screen's keys uppercase/.1em anyway.** Live-route measurement
  (Playwright + `getComputedStyle` on the real `drill` screen) showed `.aw-leave` and
  `.aw-drawer-key` computing `text-transform:uppercase; letter-spacing:.1em`. The bridge's
  screen-scoped selectors excluded `.ast-screen` at the `#screens >` level — but the mount is
  `#screens > .screen[data-screen="drill"]` and `.ast-screen` sits one level down on the wrap,
  so the exclusion never matched. All 48 bare `#screens > :not(…)` selectors now exclude
  `[data-screen="drill"]`, the mount attribute `screenManager` already sets.
- **Bridge remapped the law palette itself.** `src/ui/deckplate/screens.js` carried
  `#screens .ast-screen { --aw-mint:#d8d2c4; --aw-sky:#c9c4b6; --aw-mono:var(--dp-face-read) }` —
  flattening the law's semantic mint/sky to bone and swapping the mandated numeral face off
  Spline Sans Mono at runtime while the stylesheet still read lawful. Removed; the screen's own
  `--aw-*` block stands. A new assertion in the test fails if any foreign sheet redeclares an
  `--aw-*` token, and a second assertion requires every bare `#screens > :not(…)` bridge chain
  to carry the `data-screen="drill"` exclusion — both the bleed and the remap are now check-red.
- **`.fh-key` bench tracking leaked onto marker keys.** fh.css's `.fh-key` sets `.1em` tracking
  at (0,1,0) and `.ast-screen *` declares no `letter-spacing`, so nothing even tied it.
  `.ast-screen .fh-key` now declares `letter-spacing: var(--fh-track-display)` (.02em), documented
  beside the existing `text-transform`/`font-variation-settings` neutralisation it joins.

## Honest scope

- The write set in the packet is stale — it names `src/ui/screens/drill.js`, which is the retired
  2D overlay. The live surface under `src/ui/asteroid/` and `styles/asteroid-ops.css` is what the
  check measures and what was fixed.
- DOM-side invariants (§11.1 flatness, §11.2 board ≥88%, §11.3 ≤15 words, computed type/palette,
  live fog and event readings) remain owned by `scripts/check-asteroid-theater.mjs`, which the new
  section pins so the coverage cannot be silently dropped.
- The theater script's harness tolerances were sized for a quiet host: `page.goto` defaulted to
  playwright's 30 s (the dev server ships ~460 unbundled modules; domcontentloaded measured
  17–60 s here), the conduit-mount settle budget was 15 s (measured 40 s+), and the lane-store
  read poll was 2.5 s. All raised to the values sibling runtime checks already use
  (90 s / 60 s / 15 s); no assertion changed. With those budgets the check's law sections all
  passed on the live route — including the previously-failing uppercase sweep — until §7 hit a
  REAL defect: the conduit mount can hold `phase:'loading'` indefinitely with `failure:null`
  when the shared authored-asset admission queue starves (intermittent; logged as D34 in
  design/program/DEMO_READINESS_2026-09-20.md §6, same family as D33).
- `check:visual-regression` was run; on this contended host it did not complete inside its
  capture window (same module-load economics as the theater `goto`).
- Retired-module leftovers (`text-transform: uppercase` inside `src/ui/screens/drill.js`, kit-wide
  `--fh-track-legend` use on other screens) are outside this screen's law and unchanged.
