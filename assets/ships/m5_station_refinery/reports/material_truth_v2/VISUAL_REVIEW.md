# PQ-022 refinery material-truth V2 offline visual review

- reviewer: `codex:/root/aaa_visual_research`
- candidate: `assets/ships/m5_station_refinery/source_candidates/material_truth_v2/places/place_station_refinery.glb`
- candidateSha256: `49d6a50f24fdbb01a29d64f944a6171dd281f1b1800e0d4e045411b69b4538ed`
- candidateBytes: `23088208`
- renderManifestSha256: `5eb1422a75150e7a7675940c76911ed29877fc89151388b09885df59c3d24051`
- review scope: whole asset, original-resolution exact-source offline evidence
- production state: `surfaced_candidate`
- candidate-side disposition: `KEEP` for offline G1/G2/G4/emissive evidence
- promotion/admission claim: `none`
- allSupportedViewZonesClassified: `true`

## Retained predecessor dispositions

### Independent `b45dd1e7…` disposition — `REVISE`

The independent `codex:/root/refinery_visual_acceptance` review of
`b45dd1e7a2cbdb7d2c71d6f73cff3d548d59f7380f9714676a6c1aa94ec325c8` remains part of the
record. It identified four concrete whole-asset defects:

1. The dominant raw-feed mass still read as a tapered cone on thin legs, with an unrooted projecting
   side interface instead of a folded abrasion hopper and load frame.
2. The separator train depended on repeated cone/cylinder/ring primitives; collars carried too much
   of the construction language and several pipe penetrations lacked visible wall/root transitions.
3. The pale Chalk outputs read as smooth cuboids or plastic/clay blocks without sloped discharge,
   wall thickness, liner seams, rooted valves, or a credible shared screw-conveyor interface.
4. The output end remained a box-on-torus dock, while a shared square-grid/checker response crossed
   unrelated substrates and dark supports collapsed toward black.

### Independent `d49f1127…` disposition — G4 `REVISE`

The subsequent independent review of
`d49f11279a7f59658919fb2d821f45309f3542e6f1ec647ebaa3161943d4803c` recorded `G1 KEEP`,
`G2 KEEP`, and `emissive KEEP`, but retained `G4 REVISE`: cell-divided texture noise survived cube
projection as a conspicuous cross-role quilt, and coated edge/interface separation remained too
compressed. That exact finding—not a generic review requirement—caused the final material-only pass.

## Final evidence inspected

All five 1600×900 PNGs below were inspected once at original resolution after exact re-import of the
final source candidate. The four cameras cover both ends, the full process side, and the full top
flow. The fifth image repeats the process camera with only Principled emission strength set to zero.

| View | Final SHA-256 | Bytes | Disposition |
|---|---|---:|---|
| process three-quarter | `81e8a5a354bb6ba4bce4b3cdad2166e91ac01cc4b985a3500387cf487b89623e` | 1,554,603 | keep |
| feed three-quarter | `315214d462efdccde8ec89f5cd9904579d13f6e4ea00b41337098c986a88aaf6` | 1,522,391 | keep |
| side process | `16856c4c18072b222f47fb5595d49234620390d3b5a8e2edbe0b0fdb751cb192` | 1,471,990 | keep |
| top flow | `5e9e2d99ebdbb050cfb39140178dc3d4ddf5993e4499e59106a4d1e8f86527bd` | 1,439,788 | keep |
| process emissive-off | `60860d4507ce45cba0a8997459ff7ce75c819fc21a1f519fd7333b7a4cc4334a` | 1,553,418 | keep |

## Final whole-asset findings

- **G1 / form — keep:** the feed end is now a four-panel abrasion hopper with a thick rim, dark
  throat, grizzly, corner frame, gussets, and supported side controls. The central train separates
  into a faceted hydrocyclone, stepped/domed pressure column, and rectangular lamella classifier.
  Pale mass-flow bins and a twin-frame trussed dock terminate the process without restoring the
  rejected cone/box/torus shorthand.
- **G2 / material truth — keep:** the five frozen roles now respond at different physical scales:
  broad coated-plate variation and manufactured seams; fine directional process abrasion; smooth
  axial heat response; matte ceramic micrograin/liner seams; and flat recessed glass. The final
  maps contain no cell-divided or per-pixel hash field, and the warm machinery no longer inherits
  the coated-structure response.
- **G4 / whole-asset coherence — keep:** the two-axis quilt/checker is absent in every view. Sparse
  one-direction plate seams remain legible as fabrication detail rather than a shared texture mask.
  Neutral fill, rim, and under-light now separate dark load legs, deck edges, yoke trusses, pipe
  roots, and frame junctions from black space. Flanges and wall necks visibly terminate process
  lines; the Chalk hoppers land through valves into the shared conveyor; the armored control pod
  lands on the rear yoke and keel supports.
- **Emissive dependency — keep:** disabling emission removes cyan status accents but preserves the
  full hopper → crusher → separation → thermal → split-storage → dock read and the visibility of
  dark structural interfaces.

This review accepts only the isolated offline candidate. It makes no Browser/Electron route,
representative-performance, live-promotion, or final runtime-acceptance claim.
