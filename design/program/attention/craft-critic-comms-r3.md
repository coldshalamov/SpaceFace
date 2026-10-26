# Craft critic — comms-radial, round 3

Independent pixel re-review of commit `71abd4b6` ("Craft round 2: finish the comms-radial deltas
the critic named") against the r2 report (`craft-critic-flight-radials-r2.md`). The reviewer did
not implement the work. Scope per assignment: **comms-radial only** — the wingman shots were taken
to regression-check the shared contact rail and prompt layer.

Evidence (fresh shots, this review): `.devshots/ui-bench/critic3/`
`comms-radial-1920.png`, `comms-radial-1280.png`, `wingman-radial-1920.png`,
`wingman-radial-1280.png` (+ `_c3-*` zoom and brightness-boost crops).
Surfaces read: `src/ui/hud.js`, `src/ui/orrery/hudSkin.js`,
`src/ui/orrery/flight-radialsLayouts.js`, `styles/ui.css`, `tools/ui-bench.js`.

## Score table — 0–10 per axis

| Surface | Viewport | Hierarchy | Readability | State clarity | ORRERY fit | Polish | Verdict |
|---|---|---|---|---|---|---|---|
| comms-radial | 1920x1080 | 9 | 9 | 9 | 9 | 8 | **PASS** (8.8) |
| comms-radial | 1280x720 | 8 | 8 | 8 | 9 | 8 | **PASS** (8.2) |

Verdict rule: PASS = mean ≥8 and every axis ≥7. **comms-radial now passes at both widths** —
the r2 blocker (polish 7, "biggest undifferentiated dark shape on the screen") is resolved by the
top-edge tick scale plus the datum-cluster row rhythm, and the open palette violation (amber
TAKING FIRE) is closed.

## Verification of the four claims

| # | Claim | Status on fresh pixels |
|---|---|---|
| 1 | TAKING FIRE surfaces as danger | **VERIFIED.** Top-center lamp measures RGB(255, 80, 56) — threat red — at both viewports, while `[E] DOCK AT STATION` below holds amber RGB(242, 185, 80) (`_c3-topwide-1920/-1280`). The two prompts now read one alarm + one affordance instead of two advisories. Palette law holds in-frame. |
| 2 | Plate top edge carries a drawn tick scale | **VERIFIED.** A uniform hairline ruler (~1.5px ticks on a ~13px pitch, bone at low alpha) runs the straight top run of the bezel, inside the chamfers, at both widths (`_c3-platetop-1920/-1280`). It reads as an instrument rule in the same language as the radar bezel and the ribbon baseline — not a progress bar (no fill level, equal-length ticks, no value encoding) and it clears every wedge label: the key column starts ~60px below the plate's inner top edge. The slab read is gone; the plate now reads machined. |
| 3 | Contact rows = name lane + datum cluster | **VERIFIED.** Every row now composes as name line(s) then one datum line — state word + tier segments + distance + bearing in fixed slots (`_c3-rail-1920/-1280`). `FIELD COIL CRADLE` holds one line at both widths (was "FIELD / COIL / CRADLE"); `Relief-Freighter / Choir-Tender` wraps once at the word boundary. Tabular numerals align; the state word can no longer kern into the name. Row 1's `HAULER 12` over a `HAULER` role word is a fixture coincidence (callsign vs `trafficRole`), not a layout defect. |
| 4 | Unlit tier pips raised to .62 | **VERIFIED.** The three unlit parallelogram segments now hold against both the dark plate and the brighter world field at 720 (`_c3-pips-1920/-1280`, brightness-boosted). Present and legible without asserting. |

## Regression check (vs the r2 report)

**None found.**

- Brightness-boosted deck interiors (`_c3-deckboost-1920/-1280`): zero ghost text — tell
  suppression (r2 finding 1) still holds under the new paint.
- No clipped, tangled, buried, or offscreen type at either width (bench measure agrees).
- Margins improved or held: at 720 the rail's rightmost ink sits ~52px off the viewport edge
  (r2: ~40px); the plate-vs-`LINE SPACE` gutter is ~66px (r2: ~55px).
- Bezel, spine arc + amber detent, signal ribbon, `HAIL DECK` hint, selected-row amber tick,
  radar, compass tape, integrity dial, ability ladder all render as before or better.
- Wingman-radial unaffected except it inherits the cleaner rail rows (same shared component);
  dial, hub middot datums, and wedge icons unchanged.
- The red lamp did not introduce a second alarm voice — `[E] DOCK AT STATION` stays amber, and
  the only other warm marks are the Hand (amber key 1, amber selected callsign, amber rail tick).

## Remaining findings

1. **R3 (carried) — lit tier state is still never photographed.** Every fixture contact is
   threat tier 0, so the drawn segments only ever render unlit; the lit/red state remains
   unverifiable from pixels. The r2 recommendation stands and is now the only open item on this
   surface: add one hostile or low-standing contact to the bench roster so a lit segment is
   photographed.
2. **Minor polish residual — the plate's side and bottom long runs are still bare.** The top
   rule carries the instrument read at gestalt, so this no longer blocks; if the silhouette is
   revisited, a second facet or a shorter tick run on one side edge would finish it. Optional,
   not required for the bar.
3. **Carried minors, unchanged:** r2-R4 (wingman HOLD glyph still the weakest icon), r2-R5
   (orrery-flight notify bullets still plain hollow rings), r2-R6 (rail datum lines sit over
   bright world geometry at 720 — readable under the scrim, a hairline edge-dim would still
   steady it). None are comms-radial regressions.
