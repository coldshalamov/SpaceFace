# Station information billboard V3 — controller visual review

**Candidate:** `next10-station-billboard-readable-v3`
**Asset:** `place_station_billboard` / `SF_PLACE_HELIOS_SUPPORT_DOCK_ARM`
**Review date:** 2026-09-06
**Reviewer:** controller (independent source/visual review)
**Scope:** whole asset in five retained CPU source-side views plus the exact ordinary shipping-camera picture
**Decision:** KEEP candidate-side G1/G2; KEEP candidate-side G4 for the ordinary shipping-camera picture only; candidate remains unpromoted

## Hash-bound evidence

| Evidence | Identity |
|---|---|
| Source GLB | `assets/ships/parts/places/place_station_billboard.glb` — SHA-256 `9245e7275b36ebed9e7e853a14f1e0315d85d23c14323b6d947ea4cb3a1f2ff6`, 1,314,736 bytes |
| Release GLB | `assets/ships/release/parts/places/place_station_billboard.glb` — SHA-256 `f94ce276f99defb0aa770dd9cc0accd24e828d9b56ecb27d5ea0b3383699a293`, 430,692 bytes |
| Still | `runtime/browser/01-core-station-billboard-ordinary.png` — SHA-256 `699fe1773733e14b77ff26459cfa3ff83b6dd276fb02947106118dc83b944946`, 471,358 bytes |
| Raw route report | `runtime/browser/report.json` — SHA-256 `8d20d6600b88fd67b8850e422f10713af08ce2e59fd679a799ac8429895cbe31`, 6,944 bytes |

The still is the original 1,440 x 900 headed Chromium game-render canvas at fixed seed 47, using the
shipping chase camera and requested LOD1 at distance 144. The HUD is excluded. The raw report binds
the station subject to the source and release hashes above.

## Observed result

In this view, the central chevron and the separated flanking readout strokes remain legible. The
dark spaces survive bloom, the perimeter/frame remains visible, and the previous solid white-panel
glare is absent. The result reads as a framed station information module rather than a blank beam or
unbroken luminous card.

This is a diagnostic live-route review of one approach. It does not establish clay, hard-grazing,
emissive-off, material-ID, ORM-isolation, normal-isolation, rear/service, or far-LOD coverage. It
also does not establish the final Browser/Electron broker acceptance or performance gate. The copied
raw report explicitly records `diagnostic: true`, `primaryAcceptance: false`, and
`noPerformanceEvidence: true`.

The source-side review record now adds five CPU-only Cycles views from the preserved `.blend`:

- `renders/01-front-oblique.png` — normal front/oblique authored read.
- `renders/02-rear-service.png` — end-on A-frame, ridge, shoes, and service/load path.
- `renders/03-neutral-clay.png` — neutral form and physical-opening check.
- `renders/04-hard-grazing.png` — edge and broad-plate surface diagnostic.
- `renders/05-emission-off.png` — material separation with emitter strength disabled.

Their camera, four-thread CPU settings, hashes, and zero source/game-file writes are bound in
`renders/review_report.json`. These supplemental views inform G1/G2 review but do not change the
controller’s final gate authority or supply the missing material-ID, ORM-isolation, normal-isolation,
far-LOD, Browser/Electron, or performance evidence.

## Controller verdict

After independently viewing all five exact CPU images and the exact shipping-camera still above, the
controller records the following candidate-side verdict:

- **G1 — KEEP:** the front silhouette and canted two-sided frame are clear; the clay view shows
  purposeful panel relief and framing rather than a primitive stack.
- **G2 — KEEP:** structural rear bracing and the service/load path are readable; hard grazing
  separates worn rim response from the dark face.
- **G4 — KEEP for the ordinary shipping-camera picture only:** emission-off preserves real
  panel/frame construction, and the ordinary route still retains the readable chevron and separated
  readout strokes. No clay or plastic fallback is present.

This is a candidate-side visual disposition for the named evidence. It does not close the blocked
technique rows, extend G4 to unsupported views or channel-isolation proof, or establish Browser/Electron
H1, performance, promotion, or final acceptance.

## Disposition

Keep the exact source and release bytes bound above for the parent’s next acceptance pass. Leave the
candidate-only state in force. The technique ledger records direct no-bake rows as N/A, source-
established mesh/material/export facts as implemented, and unsupported evidence rows as blocked while
the gate fields record candidate-side evidence readiness. The validation binding records the controller
KEEP disposition and the open broker/performance gates. No source, release, or runtime package was
changed as part of this review record.
