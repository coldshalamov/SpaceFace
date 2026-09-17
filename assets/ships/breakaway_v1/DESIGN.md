# BREAKAWAY — SP-07 assembly and capture fork (asset candidates)

**State: `blockout silhouette promotion` (PQ-195.00).** The candidates are promoted to
identity-stamped canonical sources with a release pair, manifest rows, immutable bindings, and
sim-side wiring (`BREAKAWAY_SP07.authoredPayloadAssetId`, fork dressing row at the capture
mouth). The render-boundary generalization that draws them landed in-tree (R1–R4; the
spindle renders through the authored-payload boundary); production surfacing (textures,
wear) is still open per `MATERIAL_TRUTH_PREFLIGHT.md`.
Previously: the Third Shift ran with the released `pod_cargo_container` visual standing in for
the SP-07 and no fork visual at all.

## What the objects are for

- **SP-07 flywheel assembly** — industrial hardware, not loot: an enclosed rotor, open load collars
  that take impacts, long cage rails that explain structure, one asymmetric service spine that tells
  orientation, and a lifting lug. It is a heavy obligation and an improvised kinetic tool. It must
  never read as a crate, glowing orb or generic pickup.
- **Capture fork** — a machine that visibly can arrest a moving mass: two substantial rails, an open
  mouth, a rear arrestor, small status lamps and energy sinks. Never a goal ring, bubble or invisible
  wall; the mouth is open.

## Contract the art must honour (live code, not this note, is authoritative)

| Fact | Live source |
|---|---|
| SP-07 physics: one dynamic body, radius 16 WU, mass 180 | `BREAKAWAY_SP07` in `src/data/heistFacilities.js` |
| Fork: inner half-width 27 WU, usable depth 72 WU, entry ≤ 100 WU/s | `BREAKAWAY_CAPTURE_FORK` in the same file |
| Fork placement: mouth in front of the Concord Lawful Catcher head, facing the launch line | `projectBreakawayForkMouth()` |
| The catcher's static head is the physical rear stop; rails are not yet colliders | `heistFacilities._spawnFacilityHead` |

The candidate GLBs match these numbers (spindle circumradius 15.0 WU ≤ 16; fork origin at the mouth,
inward +X). Model, collider and marker must keep deriving from the same geometry.

## Why these are only blockouts

Box, cylinder and annulus primitives with flat PBR factors, no UVs, no textures, no bevels, no
material zones beyond six colour groups. They are good silhouette and scale references for the
gameplay contract, and a starting point for real authoring. They do not meet
`docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md`.

## Path to runtime (in order)

1. Material-truth preflight (`.grok/skills/spaceface-blender-material-truth/SKILL.md`) and an
   identity brief per object.
2. Author production models from these blockouts; keep sockets and the fork's mouth/inward contract.
3. Review at the live chase camera against the Tethys catcher; fix the largest silhouette/scale
   mismatch first (the SP-07 must read as heavy at the shipping distance).
4. Promote through `parts_manifest.json`, the release build and `partsLibrary.js` selection maps.
5. Give the fork physical rail colliders that match the visible rails, then bind the SP-07 visual
   through the authored-payload presentation boundary (`buildAuthoredCargoCapsule` precedent).
