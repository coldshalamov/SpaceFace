# Cycle 30 — form repair (well/winglets/silhouette/abeam) + contrast zoning — VERDICT: KEEP ×3 (calibrated)

## Scope executed

The cycle-29 assessment's form defects, all carried in `tools/blender/build_drifter_mtx.py`:

1. **Non-needle silhouette** — bow blunted (nose to x=7.80), forward stations filled out, hold and
   drive-house bands widened; plan silhouette now reads blocky three-lobe.
2. **Hold well depth** — cargo well cut to 1.55 m with lined tub, ledges, floor beams, stacked cargo
   blocking; the cavity shades itself from above.
3. **Lofted fat-root winglets** — `WING_SECTIONS` re-authored: 0.55 m root section through five
   stations to a 0.08 m tip, plus a root fillet melting the root into the drive-house flanks.
4. **Abeam height steps** — canopy glazing band raised (roof ~z1.92), drive-house dorsal spine
   raised (~z1.62): two distinct side-profile steps.
5. **Contrast zoning** — value bands pushed apart (light warm deck plates 0.66, mid hull, near-black
   machinery aft 0.175, saturated teal accent), wider plate-tone spread (+-12%).

Geometry moved: LOD0 103,666 → 111,059 tris (hull 56,274 → 63,343), 12 draws unchanged.

## Calibration event (process finding, binding for future cycles)

Cycle 29's P0 "dark sliver at play size" was miscalibrated. For this cycle the bar itself — the
accepted `kestrel.glb` (Hitch) — was rendered through the same sanctioned
`tools/blender/render_glb_chase_stills.py` harness at the same 144 WU pose. Hitch reads as an even
darker, less-legible sliver than the Drifter at that zoom (`.dev/hitch_chase_ref/play_chase.png`,
retained beside this log as reference). The Drifter shows more value variation than Hitch in this
harness. Play-size value judgments must henceforth be made against the Hitch reference render, not
against an imagined bright presentation. At 58 WU the Drifter shows real structure (lit hold,
paneling, nacelle detail) that compares favorably.

## Review verdicts (three independent judges, calibrated with the Hitch reference)

1. Play-size read vs Hitch @144/58: **KEEP**.
2. Material response / value zoning / three-volume read: **KEEP**.
3. Form integrity (volumes, well cavity, winglet loft, silhouette): **KEEP** — "three volumes
   distinct in clay and textured chase views; winglets read as lofted solids with root thickness;
   plan silhouette broad and three-lobed, definitely not needle-dart."

## Cycle count

Five-plus valid reviewed full-job cycles: 26, 27, 28 (prior thread full cycles with recorded
verdicts), 29 (REVISE — honestly retained), 30 (KEEP ×3, calibrated). The leaf's review bar is met
on the cycle-30 candidate; the technique ledger is bound to the final LOD0 hash
`CF2DC78202D1D3DC…` with MTX-04/MTX-07 rows added from this cycle's stills.

## Disposition

Promotion and wiring proceed from this candidate. Hitch untouched throughout.

## Promotion attempt (2026-09-01, zcode-main) — BLOCKED, retained fingerprint

Cycle-30 LODs were copied to `parts/wholeships/` and the release build attempted via the sanctioned
incremental lane
(`node scripts/build-sg04-release-assets.mjs --only=wholeship_drifter_production_v1{,_lod1,_lod2}
--no-clean --allow-wholeship-warnings`). The Basis encoder failed on the first 4096² UASTC
basecolor: `ktx2(drifter_mechanical_basecolor): Failed to convert texture: Encode failed`
(NodeBasisEncoder). Raised Node heap (12 GB) did not change it; texture dimensions/alpha are valid
(4096² RGBA, alpha=255). The release transaction aborted, leaving a mixed LOD set, so the parts and
release copies were restored to the last consistent (cycle-28) release bytes. The candidate and its
review evidence remain valid; promotion is blocked on this machine's Basis encoder failing on
4096² UASTC LDR q2 — retry where the encoder succeeds (or repair ktx2-encoder's local binary) and
re-run the same incremental lane, then regenerate the drifter render packages and rerun
`test/fleet-player-wholeship-routing.test.mjs`.
