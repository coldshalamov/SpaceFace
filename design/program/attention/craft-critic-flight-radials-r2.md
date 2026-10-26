# Craft critic — flight radial surfaces, round 2

Independent pixel re-review against the ORRERY bar: consistent, high-detail, creative, interactive,
non-generic — "clean, expensive, a cockpit from the future", never recognisable as CSS. Palette law:
warm bone at rest, one amber Hand on the current choice, ice only for data in motion, red only for
threat.

This pass verifies the fix commit `4b21b04a` ("Craft fixes: flight radials pass the recall-B bar")
against the nine findings in `craft-critic-flight-radials.md`. The reviewer did not implement the
work.

Evidence (fresh shots, this review): `.devshots/ui-bench/critic2/`
`comms-radial-1920.png`, `comms-radial-1280.png`, `wingman-radial-1920.png`,
`wingman-radial-1280.png`, `orrery-flight-1920.png`, `orrery-flight-1280.png`
(+ `_c2-*` / `_w2-*` / `_o2-*` zoom and brightness-boost crops).
Surfaces: `src/ui/commsRadial.js`, `src/ui/orrery/wingmanLayouts.js`,
`src/ui/orrery/flight-radialsLayouts.js`, `src/ui/hud.js` (rail + tell layer),
`styles/commsradial.css`, `styles/ui.css`.

## Score table — 0–10 per axis

| Surface | Viewport | Hierarchy | Readability | State clarity | ORRERY fit | Polish | Verdict |
|---|---|---|---|---|---|---|---|
| comms-radial | 1920x1080 | 8 | 8 | 8 | 8 | 7 | **NOT PASSED** (7.8) |
| comms-radial | 1280x720 | 8 | 8 | 8 | 8 | 7 | **NOT PASSED** (7.8) |
| wingman-radial | 1920x1080 | 9 | 8 | 8 | 9 | 8 | **PASS** (8.4) |
| wingman-radial | 1280x720 | 9 | 8 | 8 | 9 | 8 | **PASS** (8.4) |
| orrery-flight | 1920x1080 | 9 | 8 | 8 | 9 | 8 | **PASS** (8.4) |
| orrery-flight | 1280x720 | 8 | 8 | 8 | 9 | 8 | **PASS** (8.2) |

Verdict rule: PASS = mean ≥8 and every axis ≥7.

Read of the table: every round-1 defect is verified fixed or materially remedied, and nothing
regressed. The comms deck misses the line by 0.2 on one axis — the plate silhouette is now lawful
(faceted bezel, edge-light) but remains the plainest large shape in the set, and the one open
palette violation (finding 8) still renders in-frame. Two small named actions below close the gap.

## Verification of the nine round-1 findings

| # | Finding | Status on fresh pixels |
|---|---|---|
| 1 | FLYBY tell ghosts through deck + wedges | **FIXED.** Brightness-boosted crops of the deck interior (`_c2-deckboost-1920/-1280`) and the wedge ring (`_w2-wedgeboost`) show zero ghost text — the tell layer is fully suppressed while either radial is open. |
| 2 | Hail deck reads as a CSS card | **REMEDIED.** The plate now carries a 45° chamfered bezel with a drawn edge-light (`_c2-deckcorner-1920`, `_c2-deckbottom-1920`, `_c2-deckright-1920`) — lawful ORRERY glass (edge implied by corner geometry). Residual: the long straight edge runs still read plate-like at a glance; see finding R2. |
| 3 | "▱▱▱" tofu threat-tier glyphs | **FIXED.** Tier is now three drawn slanted parallelogram segments (`_c2-pips-1920`, `_c2-pips-1280`, `_c2-pips-field-1920`). All contacts in the fixture are tier 0, so every segment renders unlit — the lit state is implemented (`.is-lit` fills `currentColor`, hostile rows read red) but never appears in these shots; see finding R3. |
| 4 | Contact rail overflows at 720 | **FIXED.** "Relief-Freighter / Choir-Tender" and "FIELD COIL / CRADLE" now wrap at word boundaries (WORD JOINER after hyphens), and measured right-edge margin is ~40 px vs ~4 px before (`_c2-rail-1280`, `_w2-rail-1280`). |
| 5 | Deck creeps over ability rail at 720 | **FIXED.** ~55 px of clear gutter between the end of "LINE SPACE" and the deck's left edge; no type under the plate (`_c2-deckleft-1280`). |
| 6 | Unexplained octagon on ATTACK wedge | **FIXED.** The amber reticle stands alone on the selected wedge (`_w2-hub-1920`, `_w2-dialfull2-1920`). |
| 7 | Ambiguous wedge/verb iconography | **MOSTLY FIXED.** ROUTE is now a course-line glyph (no longer reads as lightning), HEAVE TO a stand-down slash (no longer media-pause), REGROUP a converge mark (no longer a resize cursor). HOLD's segmented-disc still reads faintly clock/pause-like — mild, see finding R4. |
| 8 | "● TAKING FIRE" dot reads amber | **OPEN.** Still an amber dot + bone caps at top-center on both radial shots at both viewports (`_c2-topwide-1920`). Palette law: red is threat-only; TAKING FIRE is the one label here that is threat. See finding R1. |
| 9 | Hub "●●" divider vs "·" convention | **FIXED.** The hub now reads "ALL WINGS ·· 2 CRAFT · TAB" at middot scale (`_w2-dialfull2-1920`, `_w2-dialfull2-1280`). |

## Surface notes

**wingman-radial** — unchanged strengths plus a cleaner hub (middot datums) and a cleaner ATTACK
wedge (reticle alone). Amber wedge fill + border arc + numeral 1 + icon is the clearest Hand in the
set. Bone elsewhere, bezel ticks and midline bearing pips crisp at both viewports. No ghost text
through any wedge. Now the strongest finished surface of the three.

**orrery-flight** — unchanged; the round-1 fixes were scoped to the radials. Ship-integrity dial
with silhouette and leader lines, ice scope-sweep radar with red threat contacts and amber waypoint
leader, compass tape, phos speed numeral. Palette discipline remains exemplary. Carried nits stand:
engraved ring microtext illegible (decorative), notification bullets are still plain thin hollow
rings (finding R5).

**comms-radial** — the round-1 worst surface is now at the bar's doorstep. Spine arc with amber
detent, phosphor-core/ice-bloom signal ribbon on a ruled baseline, drawn tier segments, word-boundary
wraps, real margins, suppressed tells, faceted bezel, and the "HAIL DECK" affordance hint — all
verified in pixels. The plate is still the biggest undifferentiated dark shape on the screen, which
is what keeps polish at 7.

## Remaining findings

1. **R1 — "● TAKING FIRE" prompt dot still amber** (both radial shots, both viewports;
   `_c2-topwide-1920`). Round-1 finding 8, untouched by the fix commit. The label is threat
   information rendered on the warm channel; recolor the prompt marker to `--dp-danger` or demote
   the whole prompt to bone. It sits in `src/ui/hud.js`'s prompt layer — shared HUD chrome, not the
   radial surface itself, but it renders in-frame over these surfaces and breaks the one-alarm law
   a viewer reads.
2. **R2 — deck silhouette is remedied, one beat short of finished.** The chamfer + edge-light is
   real instrument language at the corners, but the long straight top, bottom, and side runs are
   bare: at gestalt distance the deck still reads "large dark slab". Mid-edge tick scales, a second
   facet per long edge, or dissolving the side edges into the spine would finish the silhouette.
   Small, visible, actionable.
3. **R3 — tier segments never shown lit; unlit stroke is faint at 720.** Every fixture contact is
   threat tier 0, so the drawn three-segment meter renders all-unlit in every shot and the lit
   state is unverifiable from pixels; at 720 the unlit outlines sit low-contrast against the plate.
   Add one hostile/low-standing contact to the bench fixture so a lit segment is photographed, and
   consider a touch more ink on the unlit stroke.
4. **R4 — HOLD wedge glyph still reads clock/pause-ish** (`_w2-hold-ic`). The weakest of the four
   wedge icons now that ROUTE/HEAVE/REGROUP are resolved; a hold-specific mark (anchor bar, hand,
   or station-keeping bracket) consistent with `equipmentGlyphs.js` would close the last icon gap.
5. **R5 — notification bullets on orrery-flight remain plain thin hollow rings** (carried nit,
   `_o2-notifywide-1920`). A datum tick or a filled status dot would match the rest of the HUD's
   marker language.
6. **R6 — contact-rail state words sit over live world geometry at 720** ("NEUTRAL" over a bright
   truss strut, `_w2-rail-1280`). Readable now that the margin landed, but a hairline scrim or
   edge-dim behind the state column would steady it on busy frames. Minor.

## Regression check

None found. Radar, integrity dial, wedge dial, contact rail, compass tape, notification rail,
prompt bar, and ability ladder all render as before or better; no new collisions, no orphaned
chrome, no element missing at either viewport. The tell-layer suppression removes only the world
tell chips — "TAKING FIRE" and "[E] DOCK AT STATION" correctly still render.
