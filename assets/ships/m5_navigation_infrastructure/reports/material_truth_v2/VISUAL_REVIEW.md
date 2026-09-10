<!-- LIFETIME: ASSET_EVIDENCE -->
# Whole-asset visual review — `place_nav_buoy` buoy-repair candidate

Reviewed candidate: `assets/ships/m5_navigation_infrastructure/source_candidates/material_truth_v2/places/place_nav_buoy.glb`
SHA-256 `a00bac948d23f888537c9b72a9c3883dc733c59038c5fa55dc68f3b6f5fc3157` (424,972 bytes;
LOD0/1/2 = 1876/972/288 render triangles). Reviewer: solo integrator (evidence-bound, sources and
conflicts disclosed per packet Phase 3), with independent vision-agent review of the same retained
hash-bound stills recorded in the leaf receipt before promotion. Review scope: **whole_asset**.
Original-resolution inspection of every retained render listed below.

## Defects under repair (causal review 2026-09-10)

1. Lane-navigation head still read as a dark post-and-cap in silhouette.
2. Beacon signal (cyan slit + red band) sub-pixel at ordinary lane framing.
3. Pale service/solar panel shared the belt's value and hue — rock camouflage.

## Evidence inspected (exact-source reimport renders, 1600×900, EEVEE)

`full_three_quarter`, `service_side`, `top_head`, `head_azimuth_contact_sheet` (four 800×450
panels), `stabilization_close`, `full_three_quarter_emissive_off`, `material_id`, `grazing_light`,
`lod1_27_2m`, `lod2_far` — all bound to the exact candidate hash above by
`render_manifest.json` / `validation_binding.json`.

## Gate verdicts

| Gate | Scope | Verdict | Evidence-bound reasoning |
|---|---|---|---|
| G1 form/silhouette | whole_asset | **KEEP** | The head is a wide faceted lantern (radial step ≈2× the spine) with an overhanging dark cast cap, hazard waist collar, and an offset service gantry with marking-capped fixture. In outline at `lod1_27_2m` the object reads buoy-and-lantern, not post-and-cap; the gantry breaks axis symmetry. Lower stabilizer construction retained and readable in `stabilization_close`. |
| G2 construction/material truth | whole_asset | **KEEP** | Panes are glazed facets in four-bar bezel frames under hoods — emissive pixels live in a fixture, and `full_three_quarter_emissive_off` proves the unlit head still explains itself (dark glazed facets in frames). Hull reads warm bone-white enamel against dark cast hardware; solar wings are tilted pyloned laminates with edge rails and marking tip markers — hardware, not plating. Material-ID render confirms the five semantic zones. |
| G4 range/legibility | whole_asset | **KEEP** | At the 27.2 m LOD1 evidence distance the pane glow, orange collar, marking plate, and lit mast lamp all carry; hull silhouette is unmistakable against black. All four azimuth panels carry the signal — true multi-face navigation identity. LOD2 far retains the lit-head macro identity. The billboard-scale range budget is met in the same evidence rig that proved the billboard. |
| Emissive restraint | whole_asset | **KEEP** | Emission confined to the optic role (panes + mast lamp) inside fixtures; emission-off matched frame differs only by the glow. |

## Changed zones

Navigation head (lantern, panes, frames, hoods, cap, gantry, collar), mast beacon, solar wings
(pylons, laminates, rails, tip markers), pressure-shell and solar-laminate material tuning.
Retained zones reviewed: lower stabilizer assembly, spine, service trunk/cables, telemetry vanes,
service marking plate — no regressions observed in `stabilization_close`/`service_side`.

## Open defects

None at whole-asset scope for this candidate. Far-field meso detail loss at `lod2_far` remains the
recorded intentional screen-space boundary, consistent with the relay lane's accepted ruling.

## Boundary

This record closes candidate-side G1/G2/G4 evidence only. Route ordinary/diagnostic-close captures
in Browser and Electron, and matched performance, remain separate gates per the leaf contract.
