<!-- Reviewer: Claude Fable 5 (claude-expansion lane), 2026-08-08, reviewing its own
     round-1 renders pixel-by-pixel per the lane-furniture protocol ("two bugs were
     caught by LOOKING AT THE RENDER, not by the numbers"). The Expansion Program
     brief specifies codex gpt-5.6-sol as the adversarial reviewer; per NOW.md row 72
     that CLI cannot run here (needs upgrade; invalid service_tier aborts config
     load), so this round is a self-review and an EXTERNAL adversarial pass remains
     open work for whoever wires the pack. Findings applied in rounds 2-3; every fix
     verified against a re-render. -->

# Round 1 findings — worst first

1. **Lighting energy scaled linearly with framing distance; irradiance falls with its
   square.** Every large craft (ore_barge, construction_rig at d≈95) rendered as mud
   while small craft looked fine — the same class of error as trusting a counter
   instead of pixels: the rig was "lit" by the numbers. FIX: `E = k·d²` calibrated to
   the lane-furniture reference exposure, plus a rim light for dark-sky separation.
   Verified: round-2 sheets.
2. **ore_barge read as a charcoal slab.** Basket walls carried `npcwork_armor_plate`
   (dark) and the ore mounds reused the same material — the craft's entire cargo
   identity was invisible, violating both Guild law ("show your mass") and the art
   direction ("industrial, but not muddy"). FIX: walls to working ochre, new
   `npcwork_ore_raw` role for fills, floods enlarged. Verified: `ore_barge.png`,
   `@125u` distance view.
3. **repair_tender's plate rack — the trade's signature — vanished into the flank.**
   Plates were flush, thin, and two-tone dark. FIX: rack projects a metre proud on a
   visible A-frame rail pair, seven plates in a three-material stripe. Corner lamps
   raised onto standoffs and enlarged; flank vents added so the hull reads workshop,
   not slab. Verified: `repair_tender.png`.
4. **construction_rig's traversing rings could not traverse.** Radius 1.9 against
   chords at ±2.2 — the rings sat INSIDE the truss and read as wheels. FIX: radius
   3.2, visibly encircling the structure. Same craft: prefab segments merged into one
   slab (0.1 m gaps) — respaced/alternated so they count; hooks enlarged and
   hazard-striped. Verified: `construction_rig.png`.
5. **liner_shuttle's nacelles were swallowed by the fuselage** (centers at ±2.4 on a
   radius-2.6 hull) — the liner read as a featureless capsule with no drive story.
   FIX: pods held proud at ±3.15 on pylons. "Faired means smooth, not invisible."
6. **Emissive strengths above ~3 tone-mapped to white**, erasing the role color code —
   customs' arc-blue emitters and rescue's red bars both read white, the exact failure
   the color register exists to prevent. FIX: per-role strengths 2.0-3.2; floods alone
   stay blow-out white by design.
7. **scrap_sweeper's mouth chevrons sat on one side edge of each lip**, reading as
   asymmetric noise instead of "this end swallows". FIX: chevrons on both leading
   edges.
8. Minor: prospector drums enlarged, survey pin-head enlarged, rescue boom thickened
   and painted bone, tanker cage bars thickened to survive distance.

# Round 3 (exposure trim)
Round 2 verified all eight fixes but keyed slightly hot (pastel wash). Key/fill/rim
trimmed 115/33/40 → 88/25/30. Final sheets: `role-identification-sheet.png`,
`activity-gallery.png`, per-craft turntables + `@95u/@125u/@165u` views.

# Design-candidate self-review reading (not acceptance)
- The labeled identification sheet gives all 12 base families distinct names, but it
  does not prove unlabeled normal-route recognition. At 125-165 WU, prospector, tender,
  and salvage forms can collapse toward similar box-hull reads and may rely on lamps or
  staged props. This remains a promotion defect, not a passed readability gate.
- Each role has a recognizable active-work state: staged in `activity-gallery.png`,
  choreographed in `ACTIVITY_STATES.md` on existing signals only. Those props are
  render-only review staging and are not exported mechanisms.
- Equipment functionally attached: booms shoulder-mounted, rings encircle, rails
  carried on legs, tanks cradled in stand-off trusses (round 1's failures were exactly
  attachment failures, and they were fixed as geometry, not paint).
- No runtime-system dependency introduced: source tree only; see INTEGRATION.md.

These images are diagnostic records, not hash-bound release evidence: they do not bind
the source, renderer, settings, or toolchain required by the production standard. This
self-review grants no G1, G2, G4, G7, runtime, material, LOD, performance, or art
acceptance. The independent preservation-only verdict is recorded separately.
