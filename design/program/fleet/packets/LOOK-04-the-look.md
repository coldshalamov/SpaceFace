# LOOK-04 — The look: bold, readable, cheap (owner request 2026-11-12)

**Owner:** "weird overbloomed washed-out look in the 3D objects … some things too dark against the dark sky … washed out and
pixellated … looks cheap … needs a bold, expressive style with its own character … most mileage for the most performance."
**Lead owns the global pass** (files claimed in `HANDOFF-LEAD-2026-11-12.md`); asset families fan out to Sonnet agents only
after one golden frame is locked.

## Root causes (lead, from code, 2026-11-12)
1. **Washed out.** `src/render/illustratedSurface.js` soft-caps only `sfBoundedPigment` at `paintCeiling` (0.72); it then adds,
   uncapped, local illumination, `sfRimLight`, `sfCoatLight`, `totalSpecular` and emissive. The sun band term reaches
   ~1.6× pigment. Pale lit faces exceed display white.
2. **Random bloom.** `src/render/bloom.js` bright-passes the whole lit HDR scene at threshold 1.0 (knee 0.1, luminance or
   0.82 × max channel). Rim, coat glints and specular on lit hulls "stay free to bloom" by design → a milky haze on bodies.
3. **Dark on dark.** Last week's fix for "too dark" raised ambient/fill/gamma/rockFill (`src/data/lookMoods.js` LOOK_BASE) —
   that is what makes the milk — while hostile/dark hulls still have no separation from the sky.
4. **Pixelated.** Integrated / phone tiers: `pixelRatioCap: 1` × `renderScale` 0.75–0.85 (`src/render/adaptiveQuality.js`),
   then hitch relief steps lower (`renderer.js` `_applySize`, `hitchReliefScale`), with no AA or sharpening pass. A 3×-DPR
   phone renders ~¼ of native pixels.
5. **Inconsistent.** Each system tints/glows its own way; 216 shader programs, 22 asteroid materials for 14 rocks.

## The style: stepped sodium light, indigo shadow, role-coloured rim
Tune in this order on the look bench (`scripts/fleet/looks/look-bench.mjs`), judging four frozen hero frames
(Swarm r3, Helios traffic, phone portrait, darkest sector) plus the lint (`blownArea`, `bodyContrast`):
1. **Two energy bands.** Every non-emissive surface term (pigment + local + rim + coat + specular) soft-clips to ≤ ~0.8
   scene-linear; only authored emissive (engines, lamps, signs, weapon fire, VFX) exceeds 1. Bloom threshold stays ≥ 1 →
   bloom reads only emissive by construction ("bloom is a budget").
2. **Light structure.** Lower ambient + fill; saturated indigo shadow tint; N·L in three soft bands (exists:
   `sfBands`) — band the light, never the texture.
3. **Rim = readability.** A fresnel rim in the body's role colour: player gold, hostile hot red, neutral bone. Free, and it
   ends dark-on-dark.
4. **Background subordinate.** Sky lower in contrast and saturation than any body (re-check the ×1.3 / ×1.6 sky boosts).
5. **Tone map + grade.** A/B ACES vs a saturation-preserving curve; pick by the frame.
6. **Resolution.** Fixed internal scale per tier + one sharpen (CAS) + AA (FXAA) composite pass; hitch relief only as an
   emergency, no oscillation, no toast.
7. **Signature experiment.** Depth-edge ink line folded into the composite — keep only if nearly free on the bench.

## Performance that comes with it
- Variation as per-instance attributes (tint, rim colour, flash, damage) on one shared surface material — the material model
  PERF-08 (instanced hulls) needs; collapses the 22 asteroid materials and many of the 216 programs.
- Low tier drops IBL and clear-coat lobes (the banded look doesn't need them).
- Emissive-only bloom input → quarter-res bloom, fewer levels.

## Then
Owner gets before/after golden frames (SendUserFile). Ruling 2 + `design/game/look/concepts/` updated. Sonnet agents per
family (rocks, hostiles, player hulls, stations, freight/props, VFX, sector skies) with a checklist: albedo value range,
emissive mask authored > 1, role set, no cloned materials, mips/anisotropy — bench before/after + lint each. Pinned look
tests (sector profiles, bloom-scale ruling, sky luminance) move deliberately with the look. PERF-03/08 picture baselines are
re-shot after the look locks.
